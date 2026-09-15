/* בדיקות למונה המזהים הרצים (2026-09-15, צעד 09ב-1).
   הרצה:  node tools/test-tx-counter.js

   🔴 **הסכנה שהמארז הזה שומר עליה היא אובדן נתונים, לא נוחות.**
   מונה שיורד — או שנזרע מאפס על גיליון מלא — גורם לתנועה הבאה
   לקבל מזהה שכבר בשימוש, כלומר **לדרוס תנועה קיימת**. לכן יש כאן
   שלוש שכבות שכולן חייבות להחזיק:
     1. `seedTxCounters_` לעולם לא מורידה את המונה.
     2. כלל האבטחה מתיר קידום ב-1 בלבד — לא הורדה, לא קפיצה.
     3. הלקוח נופל לאחור כשאין מונה, ולא מתחיל לספור מאפס. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  \u2713 ' + n))
                          : (fail++, console.log('  \u2717 ' + n + (x ? '  \u2192 ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FIRESTORE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const FB = fs.readFileSync(path.join(ROOT, 'js', 'data', 'firebase.js'), 'utf8');

/* ===================== הצד השרתי ===================== */
let sheets, written, store;

function makeSheet(ids) {
  const data = [['מזהה', 'סכום']].concat(ids.map(i => [i, 1]));
  return {
    getLastColumn: () => 2,
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nr || 1); i++) out.push(data[r - 1 + i].slice(c - 1, c - 1 + (nc || 1)));
        return out;
      },
      setValue() {}, setValues() {}
    })
  };
}

const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString(), getUuid: () => 'x',
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {}, getKeys: () => [] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => (sheets[n] || null) }), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  encodeURIComponent, Date, JSON, String, Number, Math, Object, Array, Error, parseInt, isNaN
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FIRESTORE, sandbox);
sandbox.json_ = o => o;

function reset(opts) {
  opts = opts || {};
  sheets = {}; written = []; store = opts.store || {};
  if (opts.idsByYear) {
    Object.keys(opts.idsByYear).forEach(y => { sheets['תנועות ' + y] = makeSheet(opts.idsByYear[y]); });
  } else {
    sheets['תנועות תשפ"ו'] = makeSheet([1, 2, 3]);
    sheets['תנועות תשפ"ז'] = makeSheet([1, 2, 3, 4, 5, 6]);
  }
  sandbox.readSettings_ = () => ({ 'שנים': 'תשפ"ו,תשפ"ז' });
  sandbox.fsGet_ = p => (store[p] === undefined ? null : store[p]);
  sandbox.fsSet_ = (p, o) => { written.push({ path: p, doc: o }); store[p] = o; return {}; };
  return sandbox.SpreadsheetApp.getActiveSpreadsheet();
}
const pathOf = y => sandbox.fsDocPath_('counters', sandbox.txCounterId_(y));

section('1. המזהה של המסמך');
reset();
ok('מזהה = tx_<שנה>, גולמי', sandbox.txCounterId_('תשפ"ו') === 'tx_תשפ"ו', sandbox.txCounterId_('תשפ"ו'));
ok('ועובר את fsIdOk_', sandbox.fsIdOk_(sandbox.txCounterId_('תשפ"ו')) === true);
ok('🔴 הקידוד הוא של ה-URL בלבד — אין מרכאה בנתיב',
   pathOf('תשפ"ו').indexOf('"') === -1, pathOf('תשפ"ו'));
ok('שתי שנים = שני מונים נפרדים',
   sandbox.txCounterId_('תשפ"ו') !== sandbox.txCounterId_('תשפ"ז'));

section('2. זריעה ראשונה');
{
  const ss = reset();
  const r = sandbox.seedTxCounters_(ss);
  ok('שתי השנים נזרעו', r.ok === true && r.seeded === 2, JSON.stringify(r));
  ok('🔴 המונה = המזהה הגבוה בגיליון, לא מספר השורות',
     store[pathOf('תשפ"ז')].n === 6, JSON.stringify(store[pathOf('תשפ"ז')]));
  ok('ולשנה השנייה משלה', store[pathOf('תשפ"ו')].n === 3);
  ok('המסמך נושא שנה, schema ו-updatedAt',
     store[pathOf('תשפ"ו')].year === 'תשפ"ו' && store[pathOf('תשפ"ו')].schema === 1 &&
     !!store[pathOf('תשפ"ו')].updatedAt);
}
{
  /* 🔴 מזהים לא רציפים — המונה הולך לפי המקסימום, לא לפי הספירה. */
  const ss = reset({ idsByYear: { 'תשפ"ו': [3, 17, 5], 'תשפ"ז': [] } });
  sandbox.seedTxCounters_(ss);
  ok('🔴 מזהים לא רציפים → המונה על המקסימום', store[pathOf('תשפ"ו')].n === 17,
     JSON.stringify(store[pathOf('תשפ"ו')]));
  ok('טאב ריק → מונה 0', store[pathOf('תשפ"ז')].n === 0);
}
{
  const ss = reset({ idsByYear: { 'תשפ"ו': [1, 2] } });
  const r = sandbox.seedTxCounters_(ss);
  ok('שנה בלי טאב מדולגת ואינה שגיאה', r.ok === true && r.skipped === 1, JSON.stringify(r));
}
{
  const ss = reset({ idsByYear: { 'תשפ"ו': ['', 'לא-מספר', 4] , 'תשפ"ז': [1] } });
  sandbox.seedTxCounters_(ss);
  ok('תא ריק או טקסט אינו מבלבל את המונה', store[pathOf('תשפ"ו')].n === 4,
     JSON.stringify(store[pathOf('תשפ"ו')]));
}

section('3. 🔴 לעולם לא מורידים');
{
  /* התרחיש האמיתי: הדפדפן כבר קידם ל-9, והגיליון עדיין על 6. */
  const ss = reset();
  store[pathOf('תשפ"ז')] = { n: 9, year: 'תשפ"ז', schema: 1 };
  const r = sandbox.seedTxCounters_(ss);
  ok('🔴 מונה גבוה מהגיליון לא יורד', store[pathOf('תשפ"ז')].n === 9,
     JSON.stringify(store[pathOf('תשפ"ז')]));
  ok('🔴 ולא נכתבה עליו כתיבה בכלל',
     !written.some(w => w.path === pathOf('תשפ"ז')), JSON.stringify(written.map(w => w.path)));
  ok('והוא מדווח כ-kept', r.kept === 1 && r.years.some(x => x.action === 'kept'), JSON.stringify(r.years));
  ok('והשנה השנייה כן נזרעה', store[pathOf('תשפ"ו')].n === 3);
}
{
  const ss = reset();
  store[pathOf('תשפ"ז')] = { n: 6, year: 'תשפ"ז', schema: 1 };
  sandbox.seedTxCounters_(ss);
  ok('מונה ששווה לגיליון גם הוא לא נכתב מחדש',
     !written.some(w => w.path === pathOf('תשפ"ז')));
}
{
  const ss = reset();
  store[pathOf('תשפ"ז')] = { n: 2, year: 'תשפ"ז', schema: 1 };
  sandbox.seedTxCounters_(ss);
  ok('🔴 מונה שנמוך מהגיליון כן מתוקן כלפי מעלה', store[pathOf('תשפ"ז')].n === 6);
}
{
  /* אידמפוטנטיות: הרצה שנייה ברצף לא משנה כלום. */
  const ss = reset();
  sandbox.seedTxCounters_(ss);
  written = [];
  const r = sandbox.seedTxCounters_(ss);
  ok('🔴 הרצה חוזרת אינה כותבת דבר', written.length === 0 && r.kept === 2, JSON.stringify(r));
}
{
  const ss = reset();
  sandbox.fsGet_ = () => { throw new Error('אין רשת'); };
  const r = sandbox.seedTxCounters_(ss);
  ok('כשל רשת → ok=false ומדווח, בלי לזרוק', r.ok === false && r.errors.length === 2);
  ok('ולא נכתב כלום', written.length === 0);
}

section('4. הרשאות, ניתוב ותזמון');
ok('txCountersSeed דורשת PERM_SUPER',
   sandbox.GET_ACTION_PERMS.txCountersSeed === sandbox.PERM_SUPER);
ok('אינה פתוחה', sandbox.GET_PUBLIC_ACTIONS.indexOf('txCountersSeed') === -1);
ok('מנותבת ב-doGet', CODE.indexOf("action === 'txCountersSeed'") !== -1);
{
  const ss = reset();
  const orig = sandbox.authorize_;
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה' });
  ok('בלי הרשאה נדחית', sandbox.handleTxCountersSeed_({}).ok === false);
  ok('ולא נכתב כלום', written.length === 0);
  sandbox.authorize_ = orig;
}
{
  const h = CODE.slice(CODE.indexOf('function hourlyJobs()'));
  const body = h.slice(0, h.indexOf('\n}\n'));
  ok('🔴 הזריעה רצה כל שעה', body.indexOf('seedTxCounters_') !== -1);
  ok('ואחרי החלת הסטטוסים',
     body.indexOf('budgetTxApplyPending_') < body.indexOf('seedTxCounters_'));
}

section('5. 🔴 כלל האבטחה');
{
  const fn = (RULES.match(/function counterBumpOk\(\)\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('הפונקציה קיימת ובעלת שם', !!fn);
  ok('🔴 רק חבר', /isMember\(\)/.test(fn), fn);
  ok('🔴 רק שני שדות משתנים', /hasOnly\(\['n', 'updatedAt'\]\)/.test(fn), fn);
  ok('🔴 והקידום הוא בדיוק אחד', /request\.resource\.data\.n == resource\.data\.n \+ 1/.test(fn), fn);
  ok('🔴 והטיפוס נבדק — מחרוזת אינה מספר', /request\.resource\.data\.n is int/.test(fn), fn);
  const blk = (RULES.match(/match \/counters\/\{[^}]+\}\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('בלוק counters קיים', !!blk);
  ok('🔴 יצירה ומחיקה סגורות — הזריעה היא של Apps Script בלבד',
     /allow create, delete: if false;/.test(blk), blk);
  ok('🔴 והעדכון עובר דרך הפונקציה בעלת השם',
     /allow update: if counterBumpOk\(\);/.test(blk), blk);
  ok('קריאה פתוחה לחבר בלבד', /allow read: if isMember\(\);/.test(blk), blk);
  ok('🔴 והבלוק יושב מעל ברירת המחדל',
     RULES.indexOf('match /counters/') < RULES.indexOf('match /{document=**}'));
}

section('6. צד הלקוח');
ok('🔴 העסקה היא runTransaction ולא קריאה-ואז-כתיבה',
   /db\.runTransaction\(/.test(FB) && !/\.get\(\)[\s\S]{0,120}\.set\(\{ n:/.test(FB));
ok('🔴 מונה חסר → שגיאה, לא התחלה מאפס',
   /if \(!d\.exists\) throw new Error\("no-counter"\)/.test(FB));
ok('🔴 וערך פגום גם הוא נכשל ולא מתחיל מאפס',
   /throw new Error\("bad-counter"\)/.test(FB));
ok('הקידום הוא ב-1', /var next = cur \+ 1;/.test(FB));
ok('🔴 והכתיבה היא update ולא set — set היה יוצר מונה חדש',
   /t\.update\(ref, \{ n: next/.test(FB) && !/t\.set\(ref/.test(FB));
ok('nextId נחשף מהגשר', /nextId:\s+nextId,/.test(FB));
ok('🔴 ועובר דרך ensureDb כמו כל קריאה אחרת',
   /function nextId\(key, cb\) \{[\s\S]{0,200}ensureDb\(/.test(FB));

console.log('\n' + (fail ? '\u2717' : '\u2713') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
