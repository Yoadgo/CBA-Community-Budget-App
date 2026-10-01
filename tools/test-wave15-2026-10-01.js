/* גל 15 (1.10.2026) — "שאל + טיוטות": SRA2 (שאלה בחיפוש), GTA2 (טיוטה לתושב), BUA2 (משפט קצב). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const section = t => console.log('\n' + t);
const fnSrc = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
};
const G = R('apps-script/Code.gs');

section('שרת — שני סוגים חדשים במנוע (ENG1)');
{
  const block = G.slice(G.indexOf('var AIX_DAILY_MAX'));
  let lastPayload = null, reply = {};
  const sb = {
    geminiApiKey_: () => 'k', GEMINI_MODEL: 'm', geminiErrorMsg_: c => 'err' + c,
    geminiFetch_: (u, o) => { lastPayload = JSON.parse(o.payload); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) }; },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    Utilities: { formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? '2026-10-01' : '20261001', base64EncodeWebSafe: s => s },
    UrlFetchApp: { fetch: () => { throw new Error('no net'); } },
    JSON, Object, String, Number, Math, encodeURIComponent, decodeURIComponent, Date
  };
  vm.createContext(sb); vm.runInContext(block, sb);

  reply = { intent: 'spend', category: 'גינון', monthFrom: '2026-06', monthTo: 'יוני', screen: '', answer: '' };
  let r = sb.aiExtract_({}, { kind: 'searchQuestion', text: 'כמה הוצאנו על גינון ביוני?', options: { categories: ['גינון', 'אירועים'], screens: ['בית'] }, _email: 'a' });
  ok('searchQuestion — פענוח', r.ok && r.fields.intent === 'spend' && r.fields.category === 'גינון' && r.fields.monthFrom === '2026-06');
  ok('חודש לא בפורמט YYYY-MM → ריק', r.fields.monthTo === '');
  ok('התאריך של היום בפרומפט (לפענוח "ביוני")', /היום 2026-10-01/.test(lastPayload.contents[0].parts[0].text));
  ok('intent מוגבל ל-spend/screen/none', JSON.stringify(lastPayload.generationConfig.response_schema.properties.intent.enum) === '["spend","screen","none"]');
  ok('לא נשלחים סכומים — רק שמות סעיפים ומסכים', !/₪|\d{3,}/.test(JSON.stringify(lastPayload.contents[0].parts.slice(1))));
  reply = { intent: 'hack', category: '', monthFrom: '', monthTo: '', screen: '', answer: '' };
  r = sb.aiExtract_({}, { kind: 'searchQuestion', text: 'x y', _email: 'a' });
  ok('intent לא מוכר → ריק', r.fields.intent === '');
  r = sb.aiExtract_({}, { kind: 'searchQuestion', url: 'https://x.com', _email: 'a' });
  ok('קישור רק בהמלצה', !r.ok);

  reply = { reply: 'החלפנו את ראש הממטרה.' };
  r = sb.aiExtract_({}, { kind: 'gardenReply', text: 'סוג: בוצע\nכותרת: ראש ממטרה שבור', _email: 'a' });
  ok('gardenReply — טיוטה חוזרת', r.ok && r.fields.reply === 'החלפנו את ראש הממטרה.');
  ok('gardenReply — לא מקבל תמונה', !sb.aiExtract_({}, { kind: 'gardenReply', dataBase64: 'A', _email: 'a' }).ok);
}

section('SRA2 — שאלה חופשית בחיפוש');
{
  const S = R('js/ui/search.js');
  ok('שורת "לשאול" ראשונה', /results\.unshift\(\{ g: "שאלה"/.test(S));
  ok('נשארים בחלון (לא סוגרים) בלחיצה', /if \(r\.ask\) \{ ask\(r\.ask\); return; \}/.test(S));
  ok('הסכום מחושב בלקוח מהנתונים הטעונים', /function spendAnswer\(f\)/.test(S) && /CBA\.data\.getTransactions\(\)/.test(fnSrc(S, 'spendAnswer')));
  ok('"הוצאנו" = אושר, כמו מסך התקציב', /t\.status === "ready" \|\| t\.status === "paid"/.test(S));
  ok('סעיפים נשלחים רק למי שרואה הוצאות', /categories: canExp \?/.test(S));
  ok('תשובה ישנה לא דורסת שאלה חדשה', /String\(inputEl\.value \|\| ""\)\.trim\(\) !== q\) return;/.test(S));
  ok('חודשים מחוץ לשנה המוצגת — הסבר', /החודשים האלה לא בשנת/.test(S));
  ok('מסך: רק מתוך מה שהמשתמש רשאי לראות', /targets\.filter\(function \(t\) \{ return t\.label === f\.screen; \}\)/.test(S));
}

section('GTA2 — טיוטת משפט לתושב בסגירת דיווח');
{
  const T = R('js/screens/gardenTasks.js');
  const d = fnSrc(T, 'gtDraftButton');
  ok('כפתור "✨ טיוטה לתושב"', /✨ טיוטה לתושב/.test(d));
  ok('בלי שמות/טלפונים בהקשר', !/phone|טלפון|name|שם התושב|email/i.test(d.replace(/aiExtract\("gardenReply"/, '')));
  ok('ממלא את התיבה בלבד (שליחה רק בכפתור הרגיל)', /ta\.value = r;/.test(d) && !/run\(/.test(d));
  ok('"בוצע" ואישור — רק כשיש תושב (repId)', (T.match(/draftFor: t\.repId \? t : null/g) || []).length === 2);
  ok('סגירה עם סיבה — גם', /gtDraftButton\(wrap\.querySelector\("#gt-why-draft"\)/.test(T));
}

section('BUA2 — משפט קצב (חשבון, לא AI)');
{
  const B = R('js/screens/budget.js');
  const src = fnSrc(B, 'paceSentence');
  ok('לא קורא ל-AI', src && !/aiExtract|gemini/i.test(src));
  const months = ['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02','2027-03','2027-04','2027-05','2027-06','2027-07','2027-08']
    .map((k, i) => ({ key: k, label: 'חודש' + i, index: i }));
  function run(idx, rowsAt, today) {
    const RealDate = Date;
    const sb = { CBA: { data: { currentFiscalIndex: () => idx, getFiscalMonths: () => months, getBudgetRowsAsOf: i => rowsAt(i) },
                        formatILSWhole: n => '₪' + Math.round(n) },
      Date: function () { return new RealDate(today || '2027-01-15T10:00:00Z'); } };
    vm.createContext(sb); vm.runInContext(src, sb);
    return sb.paceSentence('c1');
  }
  const flat = (actualRatio) => i => [{ id: 'c1', plan: 1200, expected: 100 * (i + 1), actual: 100 * (i + 1) * actualRatio }];
  let s = run(4, flat(1.5));
  ok('קצב גבוה → "יעבור את התקציב ב…" + חריגה', /יעבור את התקציב בחודש7/.test(s) && /₪600/.test(s), s);
  s = run(4, flat(1.0));
  ok('בקצב → "בתוך התקציב"', /בתוך התקציב/.test(s), s);
  s = run(4, flat(0.5));
  ok('קצב נמוך → "יישארו…"', /יישארו בסוף השנה כ-₪600/.test(s), s);
  s = run(4, i => [{ id: 'c1', plan: 1000, expected: 500, actual: 1100 }]);
  ok('כבר חרג → "כבר עבר"', /כבר עבר את התקציב השנתי ב-₪100/.test(s), s);
  ok('חודש ראשון — שותק', run(0, flat(2)) === '');
  ok('שנה אחרת (לא השנה הנוכחית) — שותק', run(4, flat(2), '2025-01-15T10:00:00Z') === '');
  const seasonal = i => [{ id: 'c1', plan: 1200, expected: i < 6 ? 0 : 200 * (i - 5), actual: 0 }];
  ok('סעיף עונתי שעוד לא התחיל — שותק', run(4, seasonal) === '');
  ok('במגירת הסעיף (לא "ללא סעיף")', /\$\{catId !== BUDGET_NOCAT \? paceSentenceHTML\(catId\) : ""\}/.test(B));
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
