/* בדיקות למשיכת שנת תקציב לפי דרישה (2026-09-14, שלב ב2).
   הרצה:  node tools/test-year-on-demand.js

   מריץ את js/data/sheets.js **האמיתי** מול fetch מדומה.
   ⚠️ שלוש הסכנות שהמארז הזה שומר עליהן, וכולן נולדו מקריאה בקוד הקיים:
     1. `apply()` דורס את CBA.mock.years **במלואו** כל 3 שניות — שנה שנמשכה
        ידנית חייבת לשרוד את זה, אחרת המסך מתרוקן מתחת לידיים של המשתמש.
     2. `transform` בונה שנה **גם כשאין לה נתונים**, כי הוא עובר על
        payload.years ולא על payload.data — כלומר שנה חסרה נראית כתקציב ריק.
     3. שני מסלולי המרה (מטען מלא / שנה בודדת) חייבים להיות אותו קוד. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'sheets.js'), 'utf8');

/* ---------- סביבה ---------- */
let fetchLog, nextYearRes;
function makeEnv() {
  fetchLog = [];
  nextYearRes = null;
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const sandbox = {
    console: { log() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: (url) => {
      fetchLog.push(String(url));
      return Promise.resolve({ json: () => Promise.resolve(nextYearRes) });
    }
  };
  sandbox.window = sandbox;
  sandbox.CBA = { mock: store, authSession: 'SESS', esc: s => String(s) };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* מטען מלא מדומה, עם או בלי שנה ישנה */
function payload(withOld) {
  const yr = tx => ({ budget: [], income: [], groups: [], splits: [], items: [],
                      transactions: tx });
  const data = { 'תשפ"ז': yr([{ 'מזהה': 1, 'סכום': 10 }]) };
  if (withOld) data['תשפ"ו'] = yr([{ 'מזהה': 9, 'סכום': 70 }, { 'מזהה': 8, 'סכום': 80 }]);
  return { ok: true, rev: 100, years: ['תשפ"ו', 'תשפ"ז'], currentYear: 'תשפ"ז',
           settings: {}, notes: { 'תשפ"ו': { content: 'הערה ישנה' } }, groups: [],
           updates: [], notesLog: [], data: data };
}

/* ================================================================= */
section('1. הקוד עצמו — מסלול המרה אחד בלבד');
ok('buildYear חולצה כפונקציה נפרדת', /function buildYear\(y, d, settings, notesMap, loaded\)/.test(SRC));
ok('transform קורא לה', /years\[y\] = buildYear\(y, payload\.data\[y\]/.test(SRC));
/* 🔴 מ-15.9 יש שני מקורות (Apps Script / Firestore), ולכן הדרישה
   היא שיש **נקודת הרכבה אחת** — `applyYearData` — וששניהם
   עוברים דרכה. שתי קריאות נפרדות ל-buildYear = שני מסלולים. */
ok('⚠️ ו-loadYear קורא לאותה פונקציה', /var built = buildYear\(y, data,/.test(SRC));
/* 🔴 **שלושה קוראים מצעד 11**: המטען המלא, שנה לפי דרישה,
   והטעינה הקרה מ-Firestore. הדרישה מעולם לא היתה "שני
   קוראים" אלא **פונקצית המרה אחת** — שני מיפויים מקבילים
   הם הסכנה, לא קריאה נוספת לאותה פונקציה. הסעיף הבא
   הוא שאוכף את זה בפועל. */
ok('🔴 וכל הקוראים עוברים באותה buildYear',
   (SRC.match(/= buildYear\(y, /g) || []).length === 3,
   String((SRC.match(/= buildYear\(y, /g) || []).length));
ok('🔴🔴 ואין שום מיפוי שני — toTx/toCategory נקראים רק בתוכה',
   (SRC.match(/\.map\(toTx\)|\.map\(function \(r\) \{ return toTx\(/g) || []).length <= 1 &&
   (SRC.match(/toCategory\(/g) || []).length === 2,
   'toCategory=' + String((SRC.match(/toCategory\(/g) || []).length));
ok('🔴 ושני המסלולים עוברים דרכה',
   /function finish\(res\)[\s\S]{0,200}applyYearData\(res\.data, res\.rev\)/.test(SRC) &&
   (SRC.match(/applyYearData\(/g) || []).length === 2);
ok('⚠️ אין מיפוי שני מקביל ב-loadYear',
   !/loadYear[\s\S]{0,2000}?\.map\(toTx\)/.test(SRC));
ok('הדגל _loaded נכתב בכל שנה', /_loaded: loaded !== false/.test(SRC));
ok('transform מסמן לפי קיום data[y]', /payload\.data\[y\] !== undefined\)/.test(SRC));

(async function () {
  section('2. מטען מלא — כל השנים מסומנות כטעונות');
  const env = makeEnv(); const S = env.CBA.sheets; const st = env.CBA.mock;
  nextYearRes = payload(true);
  await new Promise(r => S.load(() => r()));
  await wait(5);
  ok('שתי שנים בזיכרון', Object.keys(st.years).length === 2, Object.keys(st.years).join(','));
  ok('תשפ"ו מסומנת כטעונה', st.years['תשפ"ו']._loaded === true);
  ok('yearLoaded מחזירה true', S.yearLoaded('תשפ"ו') === true);
  ok('התנועות הומרו', st.years['תשפ"ו'].transactions.length === 2,
     String(st.years['תשפ"ו'].transactions.length));
  const before = fetchLog.length;
  let called = 'NO';
  S.loadYear('תשפ"ו', function (ok2) { called = ok2; });
  await wait(5);
  ok('⚠️ loadYear על שנה טעונה — בלי קריאת רשת', fetchLog.length === before, String(fetchLog.length - before));
  ok('ונענה מיד בהצלחה', called === true);

  section('3. מטען בלי השנה הישנה — היא קיימת אך מסומנת "לא נטענה"');
  const e2 = makeEnv(); const S2 = e2.CBA.sheets; const st2 = e2.CBA.mock;
  nextYearRes = payload(false);
  await new Promise(r => S2.load(() => r()));
  await wait(5);
  ok('השנה עדיין ברשימה (הבורר יציג אותה)', st2.yearList.indexOf('תשפ"ו') !== -1);
  ok('⚠️ ויש לה רשומה — אבל מסומנת כלא-טעונה', st2.years['תשפ"ו']._loaded === false);
  ok('yearLoaded מחזירה false', S2.yearLoaded('תשפ"ו') === false);
  ok('תשפ"ז כן טעונה', S2.yearLoaded('תשפ"ז') === true);

  section('4. loadYear — מושכת, ממירה, ומכניסה לזיכרון');
  fetchLog.length = 0;
  nextYearRes = { ok: true, year: 'תשפ"ו', rev: 100, data: {
    budget: [], income: [], groups: [], splits: [], items: [],
    transactions: [{ 'מזהה': 9, 'סכום': 70 }, { 'מזהה': 8, 'סכום': 80 }] } };
  let res = null;
  S2.loadYear('תשפ"ו', function (o, e) { res = { o: o, e: e }; });
  await wait(10);
  ok('יצאה קריאה אחת', fetchLog.length === 1, String(fetchLog.length));
  ok('לפעולה הנכונה', /action=budgetYear/.test(fetchLog[0]), fetchLog[0]);
  ok('עם המושב', /session=SESS/.test(fetchLog[0]));
  ok('עם השנה מקודדת', /year=%D7%AA/.test(fetchLog[0]), fetchLog[0]);
  ok('הצליחה', res && res.o === true, JSON.stringify(res));
  ok('⚠️ השנה סומנה כטעונה', st2.years['תשפ"ו']._loaded === true);
  ok('⚠️ והתנועות באמת הומרו (אותו קוד המרה)',
     st2.years['תשפ"ו'].transactions.length === 2, String(st2.years['תשפ"ו'].transactions.length));
  ok('ההערה של השנה נשמרה מהמטען הראשי',
     st2.years['תשפ"ו'].notes && st2.years['תשפ"ו'].notes.content === 'הערה ישנה',
     JSON.stringify(st2.years['תשפ"ו'].notes));

  section('5. 🔴 השנה שורדת את הרענון התקופתי (הסכנה המרכזית)');
  nextYearRes = payload(false);          // המטען שוב בלי השנה הישנה
  await new Promise(r => S2.refresh(() => r()));
  await wait(5);
  ok('⚠️ תשפ"ו עדיין טעונה אחרי רענון', S2.yearLoaded('תשפ"ו') === true);
  ok('⚠️ והתנועות לא נעלמו', (st2.years['תשפ"ו'].transactions || []).length === 2,
     String((st2.years['תשפ"ו'].transactions || []).length));
  ok('תשפ"ז עדיין שם', S2.yearLoaded('תשפ"ז') === true);

  section('6. המטען מנצח כשהוא כן שולח את השנה');
  nextYearRes = payload(true);
  await new Promise(r => S2.refresh(() => r()));
  await wait(5);
  ok('השנה מגיעה מהמטען', st2.years['תשפ"ו']._loaded === true);
  ok('ולא נדרסה בעותק הישן', st2.years['תשפ"ו'].transactions.length === 2);

  section('7. כישלון, קלט ריק, ובקשות כפולות');
  const e3 = makeEnv(); const S3 = e3.CBA.sheets;
  nextYearRes = payload(false);
  await new Promise(r => S3.load(() => r()));
  await wait(5);
  let bad = null;
  S3.loadYear('', function (o, err) { bad = { o: o, err: err }; });
  ok('שנה ריקה נדחית מיד', bad && bad.o === false, JSON.stringify(bad));
  fetchLog.length = 0;
  nextYearRes = { ok: false, error: 'שנת תקציב לא מוכרת' };
  let r1 = null;
  S3.loadYear('תשפ"ו', function (o, err) { r1 = { o: o, err: err }; });
  await wait(10);
  ok('כישלון מהשרת מוחזר ולא נזרק', r1 && r1.o === false, JSON.stringify(r1));
  ok('הודעת השרת עוברת', /לא מוכרת/.test(r1.err), r1.err);
  ok('⚠️ השנה לא סומנה בטעות כטעונה', S3.yearLoaded('תשפ"ו') === false);

  fetchLog.length = 0;
  nextYearRes = { ok: true, year: 'תשפ"ו', rev: 100, data: { budget: [], income: [], groups: [], splits: [], items: [], transactions: [] } };
  const got = [];
  S3.loadYear('תשפ"ו', o => got.push(o));
  S3.loadYear('תשפ"ו', o => got.push(o));
  S3.loadYear('תשפ"ו', o => got.push(o));
  await wait(10);
  ok('⚠️ שלוש לחיצות = קריאת רשת אחת', fetchLog.length === 1, String(fetchLog.length));
  ok('ושלושתן נענו', got.length === 3 && got.every(x => x === true), JSON.stringify(got));

  section('8. שנה ריקה באמת מול שנה שלא נטענה');
  ok('⚠️ שנה שנטענה וריקה מסומנת _loaded=true',
     e3.CBA.mock.years['תשפ"ו']._loaded === true &&
     e3.CBA.mock.years['תשפ"ו'].transactions.length === 0);

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
