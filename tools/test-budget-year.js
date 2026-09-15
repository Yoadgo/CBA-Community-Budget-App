/* בדיקות ל-handleBudgetYear_ — שנת תקציב בודדת לפי דרישה (2026-09-14).
   הרצה:  node tools/test-budget-year.js

   מריץ את **קוד הייצור האמיתי** מ-Code.gs מול גיליון מדומה. מוחלפות רק
   התלויות החיצוניות (authorize_, readTable_ וכו') — הפונקציה הנבדקת עצמה
   היא זו שתגיע לשרת.

   ⚠️ הסעיף הכי חשוב כאן הוא 5: **אותם מפתחות מטמון כמו doGet.** מפתח שונה
   פירושו שאותה שנה נקראת מהגיליון פעמיים, ושתי התשובות יכולות להיפרד זו
   מזו אחרי שמירה — כלומר שני מספרים שונים לאותו סעיף, בלי שאיש ישים לב. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               newBlob: () => ({}), base64Decode: s => s, formatDate: () => '' },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => SS, flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);

/* ---------- הגיליון המדומה + התלויות ---------- */
let SS, sheetReads, cacheKeys, cacheStore, gateResult;
function reset(sheets) {
  sheetReads = [];
  cacheKeys = [];
  cacheStore = {};
  gateResult = { ok: true, email: 'y@x.com', perm: { isSuper: true, familyId: '401' } };
  SS = { getSheetByName: n => (sheets.indexOf(n) !== -1 ? { name: n } : null) };
  sandbox.SpreadsheetApp.getActiveSpreadsheet = () => SS;
}
/* ⚠️ json_ מוחלף כדי שנוכל לקרוא את התשובה כאובייקט. הפונקציה האמיתית
   עוטפת ב-ContentService, שאין לו מקבילה מחוץ ל-Apps Script. */
sandbox.json_ = o => o;
sandbox.authorize_ = (ss, p, need) => { gateResult._need = need; return gateResult; };
sandbox.readTable_ = (ss, name) => { sheetReads.push(name); return [{ t: name }]; };
sandbox.readGroupsForYear_ = (ss, y) => { sheetReads.push('groups:' + y); return [{ g: y }]; };
sandbox.budgetStamp_ = () => 'S7';
sandbox.currentRev_ = () => 42;
/* מטמון אמיתי-מספיק: מתעד כל מפתח, ומגיש מהזיכרון בפעם השנייה. */
sandbox.cached_ = (key, build) => {
  cacheKeys.push(key);
  if (!(key in cacheStore)) cacheStore[key] = build();
  return cacheStore[key];
};

const YEARS = ['תנועות תשפ"ו', 'תנועות תשפ"ז'];
const call = y => sandbox.handleBudgetYear_({ year: y, session: 's' });

/* ================================================================= */
section('1. רישום וניתוב (בדיקה סטטית על Code.gs עצמו)');
ok('ההרשאה רשומה ב-GET_ACTION_PERMS', sandbox.GET_ACTION_PERMS.budgetYear === sandbox.PERM_BUDGET,
   String(sandbox.GET_ACTION_PERMS.budgetYear));
ok('⚠️ ואינה null (null היה עוקף את DATA_MIN)', sandbox.GET_ACTION_PERMS.budgetYear !== null);
ok('אינה ברשימת הפעולות הפתוחות', sandbox.GET_PUBLIC_ACTIONS.indexOf('budgetYear') === -1);
ok('doGet מנתב אליה', /action === 'budgetYear'[\s\S]{0,80}handleBudgetYear_/.test(CODE));
ok('⚠️ הניתוב יושב **אחרי** השער העליון של doGet',
   CODE.indexOf("action === 'budgetYear'") > CODE.indexOf('GET_PUBLIC_ACTIONS.indexOf(getAction)'));

/* ================================================================= */
section('2. המסלול התקין');
reset(YEARS);
const r = call('תשפ"ו');
ok('הצליח', r && r.ok === true, JSON.stringify(r && r.error));
ok('השנה מוחזרת', r.year === 'תשפ"ו', r.year);
ok('מספר גרסה מוחזר', r.rev === 42, String(r.rev));
['budget', 'income', 'transactions', 'groups', 'splits', 'items'].forEach(k =>
  ok('כולל ' + k, !!r.data[k]));
ok('transactions הוא מטאב "תנועות"', r.data.transactions[0].t === 'תנועות תשפ"ו',
   JSON.stringify(r.data.transactions));
ok('budget הוא מטאב "תקציב"', r.data.budget[0].t === 'תקציב תשפ"ו');
ok('⚠️ אין שדות מעבר לאלה (אין דליפה של שנים אחרות)',
   Object.keys(r.data).length === 6, Object.keys(r.data).join(','));

/* ================================================================= */
section('3. הרשאה');
reset(YEARS);
call('תשפ"ו');
ok('⚠️ authorize_ נקרא עם PERM_BUDGET ולא null', gateResult._need === sandbox.PERM_BUDGET,
   String(gateResult._need));
reset(YEARS);
gateResult = { ok: false, error: 'אין הרשאה' };
const denied = call('תשפ"ו');
ok('נדחה כשהשער סוגר', denied.ok === false && denied.error === 'אין הרשאה', JSON.stringify(denied));
ok('⚠️ ולא נקרא שום דבר מהגיליון', sheetReads.length === 0, sheetReads.join(','));

/* ================================================================= */
section('4. קלט חסר או לא מוכר');
reset(YEARS);
ok('בלי שנה — שגיאה', call('').ok === false);
ok('בלי שנה — בלי קריאת גיליון', sheetReads.length === 0, sheetReads.join(','));
reset(YEARS);
const bad = call('תשפ"ט');
ok('שנה שאין לה טאב — שגיאה', bad.ok === false);
ok('השגיאה נוקבת בשנה', /תשפ"ט/.test(bad.error), bad.error);
ok('⚠️ ולא נבנה שום שם טאב מקלט לא מאומת', sheetReads.length === 0, sheetReads.join(','));
reset(YEARS);
const evil = call('../../סודות');
ok('קלט זדוני נדחה', evil.ok === false && sheetReads.length === 0, JSON.stringify(evil));
reset(YEARS);
ok('רווחים מסביב לשנה מתנקים', call('  תשפ"ו  ').ok === true);

/* ================================================================= */
section('5. ⚠️ אותם מפתחות מטמון בדיוק כמו doGet');
reset(YEARS);
call('תשפ"ו');
const keys = cacheKeys.slice();
ok('מפתח התנועות זהה לזה של doGet', keys.indexOf('cba_tx_S7_תשפ"ו') !== -1, keys.join(' | '));
ok('מפתח השנה זהה לזה של doGet', keys.indexOf('cba_year_S7_תשפ"ו') !== -1, keys.join(' | '));
ok('בדיוק שני מפתחות', keys.length === 2, String(keys.length));
ok('⚠️ המפתחות בקוד הייצור בנויים מ-budgetStamp_ (מתאפס בכל שמירה)',
   /cached_\('cba_tx_' \+ stamp \+ '_' \+ y/.test(CODE) &&
   /cached_\('cba_year_' \+ stamp \+ '_' \+ y/.test(CODE));

section('6. קריאה שנייה מגיעה מהמטמון ולא מהגיליון');
const readsAfterFirst = sheetReads.length;
call('תשפ"ו');
ok('אותה שנה — אפס קריאות גיליון נוספות', sheetReads.length === readsAfterFirst,
   sheetReads.slice(readsAfterFirst).join(','));
call('תשפ"ז');
ok('שנה אחרת — כן נקראת', sheetReads.length > readsAfterFirst);
ok('6 טאבים לשנה (5 + תנועות)', sheetReads.length - readsAfterFirst === 6,
   sheetReads.slice(readsAfterFirst).join(','));

/* ================================================================= */
section('7. המטען הראשי לא נגע — עדיין שולח את כל השנים');
ok('⚠️ הלולאה years.forEach במטען הראשי עדיין קיימת', /years\.forEach\(function \(y\) \{/.test(CODE));
ok('⚠️ ואין בה סינון לשנה הנוכחית בלבד (זה שלב ב3, לא עכשיו)',
   !/years\.filter\([^)]*currentYear/.test(CODE));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
