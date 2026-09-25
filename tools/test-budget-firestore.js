/* בדיקות למטא-התקציב ב-Firestore (2026-09-15, צעד 08א).
   הרצה:  node tools/test-budget-firestore.js

   🔴 **הסיכון כאן הוא הדלפה, לא תקלה.** התקציב הוא התחום הראשון שעובר
   שיש לו *מידור אמיתי*: היום תושב בלי הרשאת "תקציב" מקבל מ-doGet
   budget/income/groups/splits/items ריקים לחלוטין. אם הכלל ב-Firestore
   יהיה רחב יותר מהשרת — פתחנו לכל תושב את כל תוכנית התקציב, בשקט.
   לכן הבדיקות כאן מצמידות את הכלל ל-seesBudget שבקוד.

   🔴 **ותנועות אינן כאן.** הן נושאות מזהה משפחה, וכלל ברמת מסמך אינו
   יודע לסנן שדות בתוך מסמך. אם מישהו יוסיף אותן למסמך השנה — המידור
   לפי משפחה נעלם. יש בדיקה שתתפוס את זה. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FIRESTORE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let sheets, written, cacheKeys;
const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString().substring(0, 19), getUuid: () => 'x',
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
  encodeURIComponent
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
/* 🔴 Firestore.gs נטען גם הוא: `fsDocPath_` יושב שם, ובלעדיו
   הבדיקה היתה רצה מול סביבה שאינה הקוד האמיתי. */
vm.runInContext(FIRESTORE, sandbox);
sandbox.json_ = o => o;

function reset(opts) {
  opts = opts || {};
  sheets = {}; written = []; cacheKeys = [];
  ['תשפ"ו', 'תשפ"ז'].forEach(y => { sheets['תקציב ' + y] = {}; });
  if (opts.noSheetFor) delete sheets['תקציב ' + opts.noSheetFor];
  sandbox.readSettings_ = () => ({ 'שנים': 'תשפ"ו,תשפ"ז', 'שנה נוכחית': 'תשפ"ז' });
  sandbox.budgetStamp_ = () => 'ST';
  sandbox.cached_ = (k, fn) => { cacheKeys.push(k); return fn(); };
  sandbox.readTable_ = (ss, name) => {
    if (/^תקציב /.test(name)) return [{ 'סעיף': 'גינון', 'תכנון שנתי': 1000 }];
    if (/^הכנסות /.test(name)) return [{ 'מקור': 'מיסי שיכון', 'משפחות': 71 }];
    if (/^פיצול מימון /.test(name)) return [{ 'סעיף': 'גינון', 'סכום': 500 }];
    if (/^פירוט סעיפים /.test(name)) return [{ 'סעיף': 'גינון', 'פריט': 'דשא' }];
    if (/^תנועות /.test(name)) return [{ 'מזהה משפחה': '7', 'שם רוכש': 'פלוני', 'סכום': 50 }];
    return [];
  };
  sandbox.readGroupsForYear_ = () => ['גינון', 'תרבות'];
  sandbox.fsSet_ = (p, o) => { written.push({ path: p, doc: o }); return {}; };
  sandbox.fsList_ = () => (opts.live || []);
  sandbox.fsDelete_ = p => written.push({ deleted: p });
}
reset();

section('1. מזהה המסמך');
ok('המזהה הוא שם השנה כמו שהוא', sandbox.budgetYearId_('תשפ"ז') === 'תשפ"ז', sandbox.budgetYearId_('תשפ"ז'));
ok('🔴 הקידוד הוא של ה-URL: אין מרכאה בנתיב',
   sandbox.fsDocPath_('budgetYears', 'תשפ"ז').indexOf('"') === -1,
   sandbox.fsDocPath_('budgetYears', 'תשפ"ז'));
ok('🔴 והנתיב המפוענח חוזר למזהה המקורי',
   decodeURIComponent(sandbox.fsDocPath_('budgetYears', 'תשפ"ז')) === 'budgetYears/תשפ"ז');
ok('אין לוכסן במזהה', sandbox.budgetYearId_('תשפ"ז').indexOf('/') === -1);
ok('המזהה עובר את fsIdOk_', sandbox.fsIdOk_(sandbox.budgetYearId_('תשפ"ז')) === true);
ok('שתי שנים שונות → שני מזהים שונים',
   sandbox.budgetYearId_('תשפ"ו') !== sandbox.budgetYearId_('תשפ"ז'));
ok('הפיך', sandbox.budgetYearId_('תשפ"ז') === 'תשפ"ז');
ok('רווחים מסביב נגזרים', sandbox.budgetYearId_('  תשפ"ז  ') === sandbox.budgetYearId_('תשפ"ז'));

section('2. המסמך');
{
  reset();
  const d = sandbox.budgetYearDoc_(sandbox.SpreadsheetApp.getActiveSpreadsheet(), 'תשפ"ז');
  ok('🔴 השנה נשמרת כשדה ולא רק כמזהה', d.year === 'תשפ"ז', d.year);
  ok('חמש הטבלאות', ['budget','income','groups','splits','items'].every(k => Array.isArray(d[k])));
  ok('🔴 אין תנועות במסמך', d.transactions === undefined && !JSON.stringify(d).includes('שם רוכש'));
  ok('schema ו-updatedAt (כלל ההיברידיות 3)', d.schema === 2 && typeof d.updatedAt.getTime === 'function');
  ok('🔴 אותו מפתח מטמון כמו doGet/handleBudgetYear_',
     cacheKeys.indexOf('cba_year_ST_תשפ"ז') > -1, cacheKeys.join(','));
  ok('🔴 ולא מפתח משלו', cacheKeys.every(k => /^cba_year_/.test(k)), cacheKeys.join(','));
  ok('groups נשמר כמערך מחרוזות', d.groups.join(',') === 'גינון,תרבות');
}

section('3. הסנכרון');
{
  reset();
  const r = sandbox.budgetYearsSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('ok', r.ok === true, JSON.stringify(r.errors));
  ok('שתי שנים נכתבו', r.wrote === 2, String(r.wrote));
  ok('הנתיבים באוסף budgetYears', written.every(w => /^budgetYears\//.test(w.path)), JSON.stringify(written.map(w=>w.path)));
  ok('מדווח גודל לכל שנה', r.years.every(y => typeof y.bytes === 'number' && y.bytes > 0));
  ok('מדווח את השנה הקריאה ולא רק מזהה', r.years.every(y => /תשפ/.test(y.year)));
  ok('🔴 אין תנועות בשום מסמך שנכתב',
     written.every(w => !w.doc || (w.doc.transactions === undefined && !JSON.stringify(w.doc).includes('שם רוכש'))));
}
{
  reset({ noSheetFor: 'תשפ"ו' });
  const r = sandbox.budgetYearsSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 שנה ברשימה בלי טאב מדולגת ואינה שגיאה', r.wrote === 1 && r.skipped === 1 && r.ok === true,
     JSON.stringify({w:r.wrote,s:r.skipped,ok:r.ok}));
}
{
  reset({ live: [{ id: 'ישן', data: {} }] });
  const r = sandbox.budgetYearsSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('יתום נמחק', written.some(w => w.deleted === sandbox.fsDocPath_('budgetYears', 'ישן')),
     JSON.stringify(written.map(w=>w.deleted||w.path)));
}
{
  /* 🔴 הרגרסיה של 15.9.26, אחרי הרצה אמיתית בייצור:
     המזהה היה מקודד במפת החיים וגולמי ב-`fsList_`, ולכן
     סחיפת היתומים ראתה את שתי השנים שזה רגע נכתבו
     כיתומות וניסתה למחוק אותן. רק כשל בבניית ה-URL מנע
     איבוד נתונים. הבדיקה הזאת התנהגותית בכוונה:
     מה ש-`fsList_` מחזיר הוא בדיוק מה שנכתב, ואסור שיימחק. */
  reset({ live: [{ id: 'תשפ"ו', data: {} }, { id: 'תשפ"ז', data: {} }] });
  const r = sandbox.budgetYearsSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 שנה שזה רגע נכתבה אינה נמחקת כיתומה',
     r.deleted === 0 && !written.some(w => w.deleted),
     JSON.stringify({ deleted: r.deleted, paths: written.map(w => w.deleted).filter(Boolean) }));
  ok('והסנכרון עצמו הצליח', r.ok === true && r.wrote === 2, JSON.stringify({ok:r.ok,w:r.wrote,e:r.errors}));
}
{
  reset({ live: [{ id: 'ישן', data: {} }] });
  sandbox.readTable_ = () => { throw new Error('קריאה נכשלה'); };
  const r = sandbox.budgetYearsSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 כשל בקריאה ⇒ ok=false', r.ok === false && r.errors.length === 2, JSON.stringify(r.errors));
  ok('🔴 ואז ניקוי היתומים לא רץ — שנה שנכשלה לא נמחקת מ-Firestore',
     !written.some(w => w.deleted), JSON.stringify(written));
}
{
  reset();
  sandbox.readTable_ = () => {
    const big = []; for (let i = 0; i < 40000; i++) big.push({ x: 'ארוך מאוד '.repeat(3) });
    return big;
  };
  const r = sandbox.budgetYearsSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 מסמך גדול מדי נופל ברעש ולא נכתב חלקית',
     r.ok === false && /גדולה מדי/.test(r.errors.join(' ')) && written.length === 0, JSON.stringify(r.errors).slice(0,120));
}

section('4. הרשאות וניתוב');
ok('🔴 budgetSync דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS.budgetSync === sandbox.PERM_SUPER);
ok('אינה פתוחה', sandbox.GET_PUBLIC_ACTIONS.indexOf('budgetSync') === -1);
ok('מנותבת', /action === 'budgetSync'/.test(CODE));
{
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה לפעולה הזו' });
  ok('בלי הרשאה נדחית', sandbox.handleBudgetSync_({}).ok === false);
}

section('5. 🔴 הכלל — חייב להצמד ל-seesBudget שבשרת');
ok('קיים canSeeBudget', /function canSeeBudget\(\)/.test(RULES));
ok("🔴 דורש hasPerm('תקציב')", /return hasPerm\('תקציב'\) && m\(\)\.isExternal == false;/.test(RULES));
ok('🔴 == false ולא != true (שדה חסר נכשל-סגור)',
   !/canSeeBudget[\s\S]{0,200}isExternal != true/.test(RULES));
ok('🔴 הכלל אינו isMember() — אחרת כל תושב רואה את התקציב',
   !/function canSeeBudget\(\)\s*\{\s*return isMember\(\)/.test(RULES));
ok('בלוק budgetYears קיים', /match \/budgetYears\/\{year\} \{/.test(RULES));
ok('🔴 כתיבה אסורה', /match \/budgetYears\/\{year\} \{[\s\S]{0,300}allow write: if false;/.test(RULES));
ok('🔴 והוא מעל ברירת המחדל',
   RULES.indexOf('match /budgetYears/') < RULES.indexOf('match /{document=**}'));
ok('ברירת המחדל עדיין deny', /match \/\{document=\*\*\} \{\s*allow read, write: if false;/.test(RULES));
{
  // הצמדה לשרת: seesBudget עדיין מוגדר כמו שהכלל מניח
  ok('🔴 seesBudget בשרת = isSuper || PERM_BUDGET',
     /var seesBudget = !!\(perm\.isSuper \|\| \(perm\.perms \|\| \[\]\)\.indexOf\(PERM_BUDGET\) !== -1\);/.test(CODE));
  ok('🔴 ותושב בלי הרשאה עדיין מקבל טבלאות ריקות',
     /out\.data\[y\] = \{ budget: \[\], income: \[\], transactions: tx, groups: \[\], splits: \[\], items: \[\] \};/.test(CODE));
  ok("PERM_BUDGET הוא 'תקציב'", sandbox.PERM_BUDGET === 'תקציב', sandbox.PERM_BUDGET);
}

section('6. הגיבוי מכיר את האוסף');
ok('budgetYears ברישום הגיבוי',
   sandbox.BK_COLLECTIONS.some(c => c.collection === 'budgetYears'));
ok('והטאב שלו חוקי',
   sandbox.bkTabOk_((sandbox.BK_COLLECTIONS.find(c => c.collection === 'budgetYears') || {}).tab));
/* ⚠️ 6 → 9 ב-16.9: הגינון עבר ל-Firestore, ולכן שלושת האוספים שלו
   נכנסו לגיבוי השעתי — הגיליון הוא הגיבוי שלהם. */
/* 25.9 — 9→13: +weworkBookings, weworkConfig, doorLog, gymNuki (Door.gs) */
ok('13 אוספים מגובים', sandbox.BK_COLLECTIONS.length === 13, String(sandbox.BK_COLLECTIONS.length));

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
