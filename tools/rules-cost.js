/* ============================================================================
 *  rules-cost.js — מד "יוקר" לכללי Firestore   (4.10.2026)
 * ----------------------------------------------------------------------------
 *  🔴 למה זה קיים: Firestore דוחה בקשה שהערכת הכללים שלה עוברת 1,000 ביטויים,
 *  ומחזיר את אותה שגיאה כמו "אין הרשאה". ב-4.10.26 זה חסם את דין (מנהל הגינון)
 *  ואת הגננים: hasPerm העריכה את isMember פעמיים, gtUpdateOk קראה לה עד 6
 *  פעמים, וגל 1 הוסיף בדיקות זהות בתוך isMember — כל תוספת שם מוכפלת בכל קריאה.
 *  אין לנו דרך למדוד את התקרה האמיתית (אמולטור Firestore חסום להורדה, ו-Rules
 *  Playground אינו בקונסולה החדשה) — ולכן המד הזה **סטטי ומחמיר**:
 *
 *   • tokens — אומדן גס של מספר הביטויים אם **כל** ענף נבדק (המקרה הגרוע:
 *     כל ה-|| נכשלים עד האחרון). פונקציות נפרשות רקורסיבית, כמו שהמנוע עושה.
 *     המספר אינו זהה לספירה של Firestore — הוא להשוואה ולמגמה.
 *   • ids — כמה פעמים isMember() מוערכת במקרה הגרוע. זה המדד שהפיל אותנו.
 *
 *  כיול מהאירוע (4.10): עדכון gardenTasks נכשל ב-tokens≈2200 / ids=14,
 *  ועבר אחרי התיקון ב-≈1700 / 9.
 *
 *  הרצה:
 *    node tools/rules-cost.js                 — 20 הכללים היקרים ביותר
 *    node tools/rules-cost.js --all           — כולם
 *    node tools/rules-cost.js --update-baseline   — לקבוע את המצב הנוכחי כבסיס
 *  הבדיקה (tools/test-rules-cost.js) נכשלת אם כלל כלשהו התייקר מעבר לבסיס,
 *  או עבר את התקרות הקשיחות למטה. כלל שהתייקר בכוונה — לעדכן בסיס במודע.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');

const RULES_PATH = path.join(__dirname, '..', 'firestore.rules');
const BASELINE_PATH = path.join(__dirname, 'rules-cost-baseline.json');

/* תקרות קשיחות — מעל אלה הבדיקה נכשלת גם אם הבסיס מאשר. */
const MAX_IDS = 10;       // isMember() במקרה הגרוע של כלל אחד
const MAX_TOKENS = 2000;  // אומדן ביטויים במקרה הגרוע של כלל אחד

function parse(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const funcs = {};
  const re = /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = re.lastIndex, d = 1;
    while (d && i < src.length) { const c = src[i]; if (c === '{') d++; else if (c === '}') d--; i++; }
    funcs[m[1]] = src.slice(re.lastIndex, i - 1);
  }
  const allows = [];
  const ra = /allow\s+([\w, ]+):\s*if\s+([\s\S]*?);/g;
  while ((m = ra.exec(src))) {
    const pre = src.slice(0, m.index);
    const ms = pre.match(/match\s+(\/[^\s{]+)/g) || [];
    const where = ms.length ? ms[ms.length - 1].replace(/^match\s+/, '') : '?';
    allows.push({ where: where, ops: m[1].trim(), expr: m[2].replace(/\s+/g, ' ').trim() });
  }
  return { funcs: funcs, allows: allows };
}

function makeCoster(funcs) {
  const memo = {};
  const TOK = /[A-Za-z_֐-׿][\w.֐-׿]*|'[^']*'|\d+|==|!=|<=|>=|&&|\|\||[<>!+\-*/%\[\]]/g;
  function cost(body, stack) {
    let tokens = (body.match(TOK) || []).length, ids = 0;
    const calls = body.match(/\b(\w+)\s*\(/g) || [];
    calls.forEach(function (c) {
      const f = c.replace(/\s*\($/, '');
      if (funcs[f] !== undefined && stack.indexOf(f) === -1) {
        const r = fn(f, stack.concat([f]));
        tokens += r.tokens; ids += r.ids;
      }
    });
    return { tokens: tokens, ids: ids };
  }
  function fn(f, stack) {
    if (memo[f]) return memo[f];
    const r = cost(funcs[f], stack);
    if (f === 'isMember') r.ids += 1;
    memo[f] = r;
    return r;
  }
  return { cost: function (expr) { return cost(expr, []); }, fn: function (f) { return fn(f, [f]); } };
}

function measure(rulesText) {
  const p = parse(rulesText);
  const c = makeCoster(p.funcs);
  return p.allows.map(function (a) {
    const r = c.cost(a.expr);
    return { key: a.where + ' ' + a.ops + ' :: ' + a.expr.slice(0, 80), where: a.where, ops: a.ops,
             tokens: r.tokens, ids: r.ids };
  }).sort(function (x, y) { return y.tokens - x.tokens; });
}

function identityCosts(rulesText) {
  const p = parse(rulesText);
  const c = makeCoster(p.funcs);
  const out = {};
  ['isMember', 'isSuper', 'hasPerm', 'myFamilyId', 'isAdminUser', 'isInternalAdmin', 'gtMgr'].forEach(function (f) {
    if (p.funcs[f] !== undefined) out[f] = c.fn(f);
  });
  return out;
}

module.exports = { measure: measure, identityCosts: identityCosts, MAX_IDS: MAX_IDS, MAX_TOKENS: MAX_TOKENS,
                   RULES_PATH: RULES_PATH, BASELINE_PATH: BASELINE_PATH };

if (require.main === module) {
  const txt = fs.readFileSync(RULES_PATH, 'utf8');
  const rows = measure(txt);
  if (process.argv.indexOf('--update-baseline') !== -1) {
    const base = {};
    rows.forEach(function (r) { base[r.key] = { tokens: r.tokens, ids: r.ids }; });
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(base, null, 1) + '\n');
    console.log('בסיס נשמר: ' + rows.length + ' כללים → ' + path.relative(process.cwd(), BASELINE_PATH));
  }
  const n = process.argv.indexOf('--all') !== -1 ? rows.length : 20;
  console.log('עלות פונקציות הזהות (tokens / isMember):');
  const ic = identityCosts(txt);
  Object.keys(ic).forEach(function (f) { console.log('  ' + f + ': ' + ic[f].tokens + ' / ' + ic[f].ids); });
  console.log('\nהכללים היקרים ביותר (מקרה גרוע):  tokens  ids  כלל');
  rows.slice(0, n).forEach(function (r) {
    const warn = (r.ids > MAX_IDS || r.tokens > MAX_TOKENS) ? '  🔴' : (r.tokens > MAX_TOKENS * 0.75 ? '  🟠' : '');
    console.log('  ' + String(r.tokens).padStart(5) + '  ' + String(r.ids).padStart(3) + '  ' + r.key + warn);
  });
}
