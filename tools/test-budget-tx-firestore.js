/* בדיקות לתנועות ב-Firestore (2026-09-15, צעד 08ב-1).
   הרצה:  node tools/test-budget-tx-firestore.js

   🔴 **זה התחום הראשון שבו כלל רחב מדי חושף תושב אחד לשני.**
   עד כאן השאלה היתה "מי רואה את הפיצ׳ר"; כאן השאלה היא
   "מי רואה את של מי". לכן הבדיקות מצמידות את שלושת
   התנאים בענף התושב, ובראשם `familyId != \'\'` — בלעדיו
   כל מי שאינו חבר היה קורא את דלי החסרי-משפחה.

   🔴 **ורשימת ההיתר.** טאב "תנועות" הוא מבנה פתוח. בדיקה
   שמוודאת ש"רוכש" אינו נכתב אינה מספיקה — צריכה בדיקה
   שעמודה **שהקוד מעולם לא ראה** גם היא אינה נכתבת. */
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

let sheets, written, txRows;
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
vm.runInContext(FIRESTORE, sandbox);   /* fsDocPath_ יושב שם */
sandbox.json_ = o => o;

/* שורות גולמיות כמו ש-`readTable_` מחזיר — מפתחות עבריים מהגיליון.
   ⚠️ העמודה "טלפון אישי" אינה מוכרת לקוד — היא מדמה עמודה
      שיועד יוסיף מחר, והיא לב הבדיקה של רשימת ההיתר. */
function rawRows() {
  return [
    { 'מזהה': 1, 'סכום': 100, 'סעיף': 'גינון', 'רוכש': 'יעל כהן',
      'מזהה משפחה': '3', 'תיאור': 'שתילים', 'טלפון אישי': '050-0000000' },
    { 'מזהה': 2, 'סכום': 200, 'סעיף': 'תרבות', 'רוכש': 'דני כהן',
      'מזהה משפחה': '3' },
    { 'מזהה': 3, 'סכום': 300, 'סעיף': 'תרבות', 'רוכש': 'אורי לוי',
      'מזהה משפחה': '7' },
    { 'מזהה': 4, 'סכום': 400, 'סעיף': 'שונות', 'רוכש': 'ועד',
      'מזהה משפחה': '   ' }
  ];
}

function reset(opts) {
  opts = opts || {};
  sheets = {}; written = []; txRows = opts.rows || rawRows();
  ['תשפ"ו', 'תשפ"ז'].forEach(y => { sheets['תנועות ' + y] = {}; });
  if (opts.noSheetFor) delete sheets['תנועות ' + opts.noSheetFor];
  sandbox.readSettings_ = () => ({ 'שנים': 'תשפ"ו,תשפ"ז' });
  sandbox.budgetStamp_ = () => 'ST';
  sandbox.cached_ = (k, fn) => fn();
  sandbox.readTable_ = () => txRows;
  sandbox.fsSet_ = (p, o) => { written.push({ path: p, doc: o }); return {}; };
  sandbox.fsList_ = () => (opts.live || []);
  sandbox.fsDelete_ = p => written.push({ deleted: p });
}

section('מזהה המסמך');
reset();
ok('מזהה = שנה__משפחה, גולמי',
   sandbox.btxDocId_('תשפ"ו', '3') === 'תשפ"ו__3', sandbox.btxDocId_('תשפ"ו', '3'));
ok('משפחה ריקה ← __none__',
   sandbox.btxDocId_('תשפ"ו', '  ') === 'תשפ"ו____none__', sandbox.btxDocId_('תשפ"ו', '  '));
ok('המזהה עובר את fsIdOk_', sandbox.fsIdOk_(sandbox.btxDocId_('תשפ"ו', '3')) === true);
ok('🔴 הקידוד הוא של ה-URL בלבד — אין מרכאה בנתיב',
   sandbox.fsDocPath_('budgetTx', sandbox.btxDocId_('תשפ"ו', '3')).indexOf('"') === -1);

section('🔴 רשימת ההיתר');
{
  const r = sandbox.btxRow_(rawRows()[0]);
  ok('🔴 "רוכש" אינו נכתב', !('רוכש' in r), JSON.stringify(Object.keys(r)));
  ok('🔴 עמודה שהקוד מעולם לא ראה אינה נכתבת',
     !('טלפון אישי' in r), JSON.stringify(Object.keys(r)));
  ok('סכום עובר', r['סכום'] === 100);
  ok('מזהה משפחה עובר', r['מזהה משפחה'] === '3');
  ok('תיאור עובר', r['תיאור'] === 'שתילים');
  ok('הרשימה אינה מכילה רוכש', sandbox.BTX_ALLOWED_COLS.indexOf('רוכש') === -1);
  ok('שדה ריק אינו נכתב כלל', !('בנק' in r));
  /* 🔴🔴 החריג היחיד (הכרעת יועד, 15.9): שורה **בלי מזהה
     משפחה** כן נושאת שם — אחרת אין ממה להרכיב והתא נשאר ריק. */
  const rn = sandbox.btxRow_({ '\u05de\u05d6\u05d4\u05d4': 9, '\u05e1\u05db\u05d5\u05dd': 1, '\u05e8\u05d5\u05db\u05e9': '\u05d0\u05dc\u05d9 \u05d9\u05ea\u05d5\u05dd', '\u05de\u05d6\u05d4\u05d4 \u05de\u05e9\u05e4\u05d7\u05d4': '  ' });
  ok('🔴 שורה בלי מזהה משפחה — השם כן עובר',
     rn['\u05e8\u05d5\u05db\u05e9'] === '\u05d0\u05dc\u05d9 \u05d9\u05ea\u05d5\u05dd', JSON.stringify(Object.keys(rn)));
  ok('🔴🔴 ושורה **עם** מזהה משפחה לעולם לא נושאת שם',
     !('\u05e8\u05d5\u05db\u05e9' in sandbox.btxRow_({ '\u05de\u05d6\u05d4\u05d4': 8, '\u05e8\u05d5\u05db\u05e9': '\u05d9\u05e2\u05dc', '\u05de\u05d6\u05d4\u05d4 \u05de\u05e9\u05e4\u05d7\u05d4': '3' })));
  ok('והרשימה עצמה עדיין אינה מכילה רוכש',
     sandbox.BTX_ALLOWED_COLS.indexOf('\u05e8\u05d5\u05db\u05e9') === -1);
}

section('קיבוץ לפי משפחה');
{
  reset();
  const r = sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  const docs = written.filter(w => w.path);
  ok('הסנכרון הצליח', r.ok === true, JSON.stringify(r.errors));
  ok('שלושה מסמכים לכל שנה', docs.length === 6, String(docs.length));
  const one = docs.find(d => d.doc.familyId === '3');
  ok('מסמך משפחה 3 מכיל שתי שורות', !!one && one.doc.rows.length === 2);
  ok('count תואם', !!one && one.doc.count === 2);
  ok('והשורות שמרו את מפתחות הגיליון', !!one && one.doc.rows[0]['סכום'] === 100);
  /* 🔴 השורות עם מזהה משפחה — בלי שם. השורה הרביעית
     ב-`rawRows` היא בלי מזהה, ולכן השם שלה ("ועד") כן עובר. */
  const withFam = docs.filter(d => d.doc.familyId);
  ok('🔴 במסמכים עם משפחה אין שם רוכש',
     JSON.stringify(withFam).indexOf('יעל כהן') === -1 &&
     JSON.stringify(withFam).indexOf('רוכש') === -1);
  ok('🔴 ואין בהן את העמודה הלא-מוכרת',
     JSON.stringify(docs).indexOf('050-0000000') === -1);
  const none = docs.find(d => d.doc.familyId === '');
  ok('🔴 תנועה בלי משפחה לא מושמטת', !!none);
  ok('🔴 ואינה משויכת למשפחה שרירותית',
     !!none && none.doc.familyId === '' && none.path.indexOf('__none__') !== -1);
  ok('כל מסמך נושא updatedAt ו-schema',
     docs.every(d => !!d.doc.updatedAt && d.doc.schema === 1));
  ok('וכל מסמך נושא שנה', docs.every(d => !!d.doc.year));
}

section('🔴 סחיפת יתומים');
{
  const ids = ['תשפ"ו__3', 'תשפ"ו__7', 'תשפ"ו____none__',
               'תשפ"ז__3', 'תשפ"ז__7', 'תשפ"ז____none__'];
  reset({ live: ids.map(id => ({ id: id, data: {} })) });
  const r = sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 מסמך שזה רגע נכתב אינו נמחק כיתום',
     r.deleted === 0 && !written.some(w => w.deleted),
     JSON.stringify(written.filter(w => w.deleted).map(w => w.deleted)));
}
{
  reset({ live: [{ id: 'תשפ"ד__9', data: {} }] });
  sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('יתום אמיתי נמחק',
     written.some(w => w.deleted === sandbox.fsDocPath_('budgetTx', 'תשפ"ד__9')));
}
{
  reset({ noSheetFor: 'תשפ"ו' });
  const r = sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 שנה בלי טאב מדולגת ואינה שגיאה',
     r.ok === true && r.skipped === 1, JSON.stringify({ ok: r.ok, s: r.skipped }));
}
{
  reset();
  sandbox.readTable_ = () => { throw new Error('קריאה נכשלה'); };
  const r = sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('כשל קריאה ← ok=false ושגיאה מדווחת', r.ok === false && r.errors.length === 2);
  ok('🔴 ואז ניקוי היתומים לא רץ', !written.some(w => w.deleted));
}
{
  reset({ rows: [{ 'מזהה': 1, 'מזהה משפחה': '3',
                   'תיאור': new Array(sandbox.BTX_MAX_BYTES + 10).join('א') }] });
  const r = sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('מסמך גדול מהשער ← נופל ברעש', r.ok === false && r.errors.length > 0);
  ok('ולא נכתב כלום', !written.some(w => w.path));
}

section('הרשאות וניתוב');
ok('🔴 budgetTxSync דורשת PERM_SUPER',
   sandbox.GET_ACTION_PERMS.budgetTxSync === sandbox.PERM_SUPER);
ok('אינה פתוחה', sandbox.GET_PUBLIC_ACTIONS.indexOf('budgetTxSync') === -1);
{
  reset();
  const orig = sandbox.authorize_;
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה' });
  ok('בלי הרשאה נדחתת', sandbox.handleBudgetTxSync_({}).ok === false);
  ok('ולא נכתב כלום', !written.length);
  sandbox.authorize_ = orig;
}
ok('מנותבת ב-doGet', CODE.indexOf("action === 'budgetTxSync'") !== -1);

section('גיבוי');
ok('budgetTx נמצא ברישום הגיבוי',
   sandbox.BK_COLLECTIONS.some(c => c.collection === 'budgetTx'));
ok('והטאב שלו עובר את השער',
   sandbox.bkTabOk_((sandbox.BK_COLLECTIONS.find(c => c.collection === 'budgetTx') || {}).tab));
ok('שישה אוספים מגובים', sandbox.BK_COLLECTIONS.length === 6,
   String(sandbox.BK_COLLECTIONS.length));

section('🔴 כלל האבטחה');
{
  const m = RULES.match(/match \/budgetTx\/\{[^}]+\}\s*\{([\s\S]*?)\n    \}/);
  ok('בלוק budgetTx קיים', !!m);
  const body = m ? m[1] : '';
  ok('🔴 כתיבה סגורה לגמרי', /allow write: if false;/.test(body));
  ok('🔴 הקריאה נשענת על פונקציה אחת בעלת שם',
     /^\s*allow read: if canSeeFamilyTx\(resource\.data\.familyId\);\s*$/m.test(body), body.slice(0, 200));
  /* ושלושת התנאים עצמם — בפונקציה, ולא פרושים בכל בלוק. */
  const fn = (RULES.match(/function canSeeFamilyTx\(fid\)\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('בעל הרשאת תקציב רואה הכל', /canSeeBudget\(\)/.test(fn), fn);
  ok('והתושב רק את שלו', /fid == myFamilyId\(\)/.test(fn), fn);
  ok('🔴 והדלי החסר-משפחה סגור', /fid != ''/.test(fn), fn);
  ok('🔴 ושדה מסוג אחר נכשל-סגור (is string)', /fid is string/.test(fn), fn);
  ok('אינו נשען על isMember בלבד', !/allow read: if isMember\(\)/.test(body));
}
{
  reset();
  sandbox.budgetTxSyncAll_(sandbox.SpreadsheetApp.getActiveSpreadsheet());
  ok('🔴 כל מסמך נושא familyId מסוג מחרוזת',
     written.filter(w => w.path).every(w => typeof w.doc.familyId === 'string'));
}
{
  /* מסמך השנה חייב להישאר בלי תנועות — אחרת המידור נעלם. */
  const src = CODE.slice(CODE.indexOf('function budgetYearDoc_'));
  const body = src.slice(0, src.indexOf('\nfunction '));
  ok('🔴 מסמך השנה עדיין אינו מכיל תנועות',
     body.indexOf('transactions') === -1 && body.indexOf('תנועות') === -1);
}

console.log('\n' + (fail ? '\u2717' : '\u2713') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
