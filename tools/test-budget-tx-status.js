/* בדיקות לשינוי סטטוס שנכתב מהדפדפן ל-Firestore (2026-09-15, צעד 09א).
   הרצה:  node tools/test-budget-tx-status.js

   🔴 **זו הכתיבה הראשונה מהדפדפן ישירות למסד הנתונים.** עד כאן
   כל כתיבה עברה דרך Apps Script, ולכן "מי מורשה לעשות מה" נבדק
   בקוד שלנו. מעכשיו כלל האבטחה הוא היחיד שעומד שם, והבדיקות
   כאן מצמידות את שלושת הדברים שהוא חייב לאכוף:
     1. **רק ארבעה שדות משתנים** — אחרת הדפדפן משנה סכום או משפחה.
     2. **רק מעבר חוקי** — אי-אפשר לקפוץ מ"הוגשה" ל"שולם".
     3. **`statusPending` חייב לעלות** — בלעדיו השינוי נעלם בסנכרון הבא.

   🔴 **והדבר הרביעי, שאינו בכלל אלא בסדר הפעולות:** `staleNudgeJob_`
   קוראת את עמודת הסטטוס **מהגיליון**. אם הגיליון מפגר אחרי
   Firestore, היא תנדנד לתושב על בקשה שכבר טופלה. לכן ההחלה
   חייבת לרוץ **ראשונה** בעבודה היומית. */
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
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const FB = fs.readFileSync(path.join(ROOT, 'js', 'data', 'firebase.js'), 'utf8');

/* ===================== הצד השרתי ===================== */

const HEAD = ['מזהה', 'חודש הגשה', 'רוכש', 'סכום', 'סטטוס', 'הערת בדיקה',
              'מקור', 'מזהה משפחה', 'קישור קבלה'];

let sheets, written, mails, moved, bumped;

function makeSheet(rows, head) {
  head = head || HEAD;
  const data = [head.slice()].concat(rows.map(r => r.slice()));
  return {
    _data: data,
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nr || 1); i++) out.push(data[r - 1 + i].slice(c - 1, c - 1 + (nc || 1)));
        return out;
      },
      setValue: v => { data[r - 1][c - 1] = v; },
      setValues: vs => { for (let i = 0; i < vs.length; i++)
                           for (let j = 0; j < vs[i].length; j++) data[r - 1 + i][c - 1 + j] = vs[i][j]; }
    })
  };
}

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
  encodeURIComponent, Date, JSON, String, Number, Math, Object, Array, Error
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FIRESTORE, sandbox);
sandbox.json_ = o => o;

const S = sandbox.STATUS_HE;

/* שורה: מזהה, חודש, רוכש, סכום, סטטוס, הערה, מקור, משפחה, קישור */
function row(id, status, extra) {
  extra = extra || {};
  return [id, '2026-09', extra.buyer || 'יעל', extra.amount || 100, status,
          extra.note || '', extra.source || sandbox.SOURCE_HE.resident,
          extra.fam === undefined ? '3' : extra.fam, extra.receipt || ''];
}

function reset(opts) {
  opts = opts || {};
  sheets = {}; written = []; mails = []; moved = []; bumped = [];
  let rows = opts.rows || [row(1, S.submitted)];
  let head = HEAD;
  if (opts.noNoteCol) {
    const i = HEAD.indexOf('הערת בדיקה');
    head = HEAD.filter((h, j) => j !== i);
    rows = rows.map(r => r.filter((c, j) => j !== i));
  }
  sheets['תנועות תשפ"ז'] = makeSheet(rows, head);
  sandbox.fsQuery_ = () => (opts.pending || []);
  sandbox.fsSet_ = (p, o) => { written.push({ path: p, doc: o }); return {}; };
  sandbox.fsDelete_ = p => written.push({ deleted: p });
  sandbox.emailsForFamilyId_ = () => ['x@y.z'];
  sandbox.sendResidentTemplate_ = (ss, key, emails, vars) => mails.push({ key, emails, vars });
  sandbox.moveReceiptToPermanentIfNeeded_ = (url, m) => moved.push(url);
  sandbox.bumpRev_ = a => bumped.push(a);
  return sandbox.SpreadsheetApp.getActiveSpreadsheet();
}

function pend(id, to, extra) {
  extra = extra || {};
  const d = { 'מזהה': id, year: 'תשפ"ז', familyId: '3', statusPending: true,
              'סטטוס': to, 'סכום': 100 };
  if (extra.note !== undefined) d['הערת בדיקה'] = extra.note;
  if (extra.year !== undefined) d.year = extra.year;
  return { id: 'תשפ"ז__' + id, data: d };
}
function statusAt(id) {
  const d = sheets['תנועות תשפ"ז']._data;
  for (let i = 1; i < d.length; i++) if (String(d[i][0]) === String(id)) return d[i][4];
  return null;
}
function noteAt(id) {
  const d = sheets['תנועות תשפ"ז']._data;
  for (let i = 1; i < d.length; i++) if (String(d[i][0]) === String(id)) return d[i][5];
  return null;
}

section('1. טבלת המעברים');
ok('הוגשה ← בבדיקה', sandbox.btxLegalStep_(S.submitted, S.review));
ok('הוגשה ← הועבר', sandbox.btxLegalStep_(S.submitted, S.ready));
ok('הוגשה ← נדחה', sandbox.btxLegalStep_(S.submitted, S.rejected));
ok('בבדיקה ← הועבר', sandbox.btxLegalStep_(S.review, S.ready));
ok('הועבר ← שולם', sandbox.btxLegalStep_(S.ready, S.paid));
ok('הועבר ← נדחה', sandbox.btxLegalStep_(S.ready, S.rejected));
ok('🔴 הוגשה ← שולם אסור (דילוג על אישור)', !sandbox.btxLegalStep_(S.submitted, S.paid));
ok('🔴 בבדיקה ← שולם אסור', !sandbox.btxLegalStep_(S.review, S.paid));
ok('🔴 שולם ← כל דבר אסור',
   !sandbox.btxLegalStep_(S.paid, S.ready) && !sandbox.btxLegalStep_(S.paid, S.rejected) &&
   !sandbox.btxLegalStep_(S.paid, S.review));
ok('🔴 נדחה ← כל דבר אסור',
   !sandbox.btxLegalStep_(S.rejected, S.ready) && !sandbox.btxLegalStep_(S.rejected, S.submitted));
ok('🔴 סטטוס לא מוכר אסור', !sandbox.btxLegalStep_('משהו', S.paid) && !sandbox.btxLegalStep_(S.submitted, 'משהו'));
ok('🔴 ריק אסור', !sandbox.btxLegalStep_('', S.paid) && !sandbox.btxLegalStep_(null, S.paid));

section('2. החלה על הגיליון');
{
  const ss = reset({ pending: [pend(1, S.ready)] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('נמצא אחד והוחל', r.found === 1 && r.applied === 1, JSON.stringify(r));
  ok('🔴 הגיליון עודכן', statusAt(1) === S.ready, String(statusAt(1)));
  ok('🔴 והדגל הורד ב-Firestore',
     written.some(w => w.doc && w.doc.statusPending === false), JSON.stringify(written));
  ok('והסטטוס שנכתב חזרה הוא זה שהוחל',
     written.some(w => w.doc && w.doc['סטטוס'] === S.ready));
  ok('🔴 מונה המטמון הועלה', bumped.length === 1, JSON.stringify(bumped));
}
{
  const ss = reset({ pending: [pend(1, S.review, { note: 'חסרה קבלה' })] });
  sandbox.budgetTxApplyPending_(ss);
  ok('הערת בדיקה נכתבת גם היא', noteAt(1) === 'חסרה קבלה', String(noteAt(1)));
}
{
  /* 🔴 **נתפס בבדיקה חיה (15.9):** טאב "תנועות תשפ"ז" נולד **בלי עמודת
     "הערת בדיקה"**, ולכן ההערה שהגזבר מקליד ב"העבר לבדיקה" נבלעה בשקט —
     והיא בדיוק הסיבה שהתושב מקבל במייל. העמודה נוצרת עכשיו בעת הצורך,
     באותו דפוס של 'תת-סעיף' ב-saveTransactionRow_. */
  const ss = reset({ noNoteCol: true, pending: [pend(1, S.review, { note: 'חסרה קבלה' })] });
  const r = sandbox.budgetTxApplyPending_(ss);
  const d = sheets['תנועות תשפ"ז']._data;
  ok('🔴 עמודה חסרה — נוצרת', d[0].indexOf('הערת בדיקה') !== -1, JSON.stringify(d[0]));
  ok('🔴 וההערה נכתבת אליה ולא נבלעת',
     d[1][d[0].indexOf('הערת בדיקה')] === 'חסרה קבלה', JSON.stringify(d[1]));
  ok('והסטטוס הוחל כרגיל', r.applied === 1 && d[1][4] === S.review, JSON.stringify(r));
}
{
  /* ⚠️ ובלי הערה — לא נוגעים במבנה הגיליון סתם. */
  const ss = reset({ noNoteCol: true, pending: [pend(1, S.ready)] });
  sandbox.budgetTxApplyPending_(ss);
  ok('🔴 בלי הערה — העמודה לא נוצרת',
     sheets['תנועות תשפ"ז']._data[0].indexOf('הערת בדיקה') === -1);
}
{
  const ss = reset({ pending: [] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('אין ממתינים → אין עבודה', r.found === 0 && !written.length && !bumped.length);
}

section('3. 🔴 הגיליון מנצח');
{
  /* בזמן שהדפדפן החזיק "הוגשה" מנהל אחר כבר סימן "שולם" בגיליון.
     המעבר שולם→הועבר אינו חוקי, ולכן אסור להחיל. */
  const ss = reset({ rows: [row(1, S.paid)], pending: [pend(1, S.ready)] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('🔴 מעבר לא חוקי נדחה', r.rejected === 1 && r.applied === 0, JSON.stringify(r));
  ok('🔴 והגיליון לא נגע', statusAt(1) === S.paid, String(statusAt(1)));
  ok('🔴 והמסמך הוחזר למצב הגיליון',
     written.some(w => w.doc && w.doc['סטטוס'] === S.paid && w.doc.statusPending === false),
     JSON.stringify(written.map(w => w.doc && w.doc['סטטוס'])));
  ok('🔴 ולא נשלח מייל על מעבר שלא קרה', mails.length === 0);
}
{
  const ss = reset({ rows: [row(1, S.ready)], pending: [pend(1, S.ready)] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('סטטוס זהה — לא שינוי, רק הורדת דגל',
     r.applied === 0 && r.rejected === 0 && written.length === 1 &&
     written[0].doc.statusPending === false, JSON.stringify(r));
  ok('ולא נשלח מייל', mails.length === 0);
}
{
  const ss = reset({ rows: [row(9, S.submitted)], pending: [pend(1, S.ready)] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('🔴 שורה שנמחקה — הדגל בכל זאת יורד',
     r.missing === 1 && written.length === 1 && written[0].doc.statusPending === false,
     JSON.stringify(r));
}
{
  const ss = reset({ pending: [pend(1, S.ready, { year: '' })] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('מסמך בלי שנה — מדווח ולא מתפוצץ', r.missing === 1 && r.errors.length === 1);
}
{
  const ss = reset({ pending: [pend(1, S.ready, { year: 'תשפ"ג' })] });
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('שנה בלי טאב — מדווחת ולא מתפוצצת', r.missing === 1 && r.errors.length === 1, JSON.stringify(r));
}
{
  const ss = reset({ pending: [pend(1, S.ready)] });
  sandbox.fsQuery_ = () => { throw new Error('אין רשת'); };
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('🔴 כשל שאילתה → ok=false ולא נוגעים בגיליון',
     r.ok === false && statusAt(1) === S.submitted && !written.length);
}

section('4. תופעות הלוואי — בדיוק כמו במסלול הישן');
{
  const ss = reset({ rows: [row(1, S.ready, { receipt: 'https://drive/x' })],
                     pending: [pend(1, S.paid)] });
  sandbox.budgetTxApplyPending_(ss);
  ok('🔴 מייל לתושב נשלח', mails.length === 1 && mails[0].key === 'REIMBURSEMENT_PAID',
     JSON.stringify(mails));
  ok('והסכום והמזהה בו', mails[0].vars['סכום'] === 100 && mails[0].vars['מזהה'] === 1);
  ok('🔴 והקבלה הועברה לתיקייה הקבועה', moved.length === 1, JSON.stringify(moved));
}
{
  const ss = reset({ rows: [row(1, S.submitted, { source: sandbox.SOURCE_HE.admin })],
                     pending: [pend(1, S.ready)] });
  sandbox.budgetTxApplyPending_(ss);
  ok('🔴 הוצאה שמקורה מנהל — בלי מייל לתושב', mails.length === 0);
}
{
  const ss = reset({ rows: [row(1, S.submitted)], pending: [pend(1, S.review)] });
  sandbox.budgetTxApplyPending_(ss);
  ok('מעבר לבבדיקה — בלי מייל (זמני, לא מעניין את התושב)', mails.length === 0);
}
{
  const ss = reset({ rows: [row(1, S.submitted)], pending: [pend(1, S.ready)] });
  sandbox.sendResidentTemplate_ = () => { throw new Error('מייל נפל'); };
  const r = sandbox.budgetTxApplyPending_(ss);
  ok('🔴 כשל מייל אינו מבטל את ההחלה',
     statusAt(1) === S.ready && r.applied === 1 && r.errors.length === 1, JSON.stringify(r));
}

section('5. 🔴 סדר הפעולות');
{
  const daily = CODE.slice(CODE.indexOf('function dailyEmailJobs_()'));
  const body = daily.slice(0, daily.indexOf('\n}'));
  /* ⚠️ מודדים את **אתרי הקריאה** (`try { X`) ולא את השם, כי
     ההערה שמעל מזכירה את staleNudgeJob_ בשמה — ומדידה תמימה
     היתה נכשלת על הערה נכונה. */
  const iApply = body.indexOf('try { budgetTxApplyPending_');
  const iNudge = body.indexOf('try { staleNudgeJob_');
  ok('ההחלה נמצאת בעבודה היומית', iApply !== -1);
  ok('🔴 והיא רצה לפני staleNudgeJob_', iApply !== -1 && iNudge !== -1 && iApply < iNudge,
     iApply + ' vs ' + iNudge);
  ok('🔴 ולפני כל שאר המיילים',
     iApply < body.indexOf('try { clubReminderJob_') && iApply < body.indexOf('try { weeklyDigestJob_'));
}
{
  const h = CODE.slice(CODE.indexOf('function hourlyJobs()'));
  const body = h.slice(0, h.indexOf('\n}\n'));
  ok('ההחלה רצה גם כל שעה', body.indexOf('budgetTxApplyPending_') !== -1);
  ok('🔴 ולפני הגיבוי המצטבר — אחרת הגיבוי מנציח דגל פתוח',
     body.indexOf('budgetTxApplyPending_') < body.indexOf('fsBackupIncremental_'));
}

section('6. הרשאות וניתוב');
ok('budgetTxApply דורשת הרשאת תקציב',
   sandbox.GET_ACTION_PERMS.budgetTxApply === sandbox.PERM_BUDGET);
ok('אינה פתוחה', sandbox.GET_PUBLIC_ACTIONS.indexOf('budgetTxApply') === -1);
ok('מנותבת ב-doGet', CODE.indexOf("action === 'budgetTxApply'") !== -1);
{
  const ss = reset({ pending: [pend(1, S.ready)] });
  const orig = sandbox.authorize_;
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה' });
  ok('בלי הרשאה נדחית', sandbox.handleBudgetTxApply_({}).ok === false);
  ok('🔴 ולא הוחל כלום', statusAt(1) === S.submitted && !written.length);
  sandbox.authorize_ = orig;
}
ok('הדגל ברשימה הסגורה',
   sandbox.FLAG_KEYS.indexOf('budgetTxStatusToFirestore') !== -1);

section('7. 🔴 כלל האבטחה');
{
  const fn = (RULES.match(/function txStatusUpdateOk\(\)\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('הפונקציה קיימת', !!fn);
  ok('🔴 רק בעל הרשאת תקציב', /canSeeBudget\(\)/.test(fn), fn);
  ok('🔴 רק ארבעה שדות (hasOnly)', /hasOnly\(\['סטטוס', 'הערת בדיקה', 'statusPending', 'updatedAt'\]\)/.test(fn), fn);
  ok('🔴 statusPending חייב לעלות ל-true', /statusPending == true/.test(fn), fn);
  ok('🔴 והמעבר נבדק', /txLegalStep\(/.test(fn), fn);
  /* ⚠️ מזהה בשפת הכללים חייב להיות ASCII — גישה בנקודה לשדה
     עברי היא שגיאת פרסור שמפילה את פרסום הכללים כולו. */
  ok('🔴 גישה לשדה עברי בסוגריים מרובעים בלבד',
     !/resource\.data\.[֐-׿]/.test(RULES), (RULES.match(/resource\.data\.[֐-׿]+/g) || []).join(','));
  const step = (RULES.match(/function txLegalStep\(from, to\)\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('טבלת המעברים בכלל תואמת את זו שבשרת',
     /הוגשה קבלה/.test(step) && /בבדיקה/.test(step) && /שולם/.test(step) && /נדחה/.test(step));
  ok('🔴 ואין בה קפיצה מהוגשה לשולם',
     !/from == 'הוגשה קבלה' && \(to == 'שולם'/.test(step));
  const blk = (RULES.match(/match \/budgetTx\/\{[^}]+\}\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('🔴 יצירה ומחיקה סגורות', /allow create, delete: if false;/.test(blk), blk);
}

section('8. צד הלקוח');
ok('🔴 ברירת המחדל בקוד true (הכיבוי דרך הדגל החי)',
   /var BUDGET_TX_STATUS_TO_FIRESTORE = true;/.test(DS));
ok('🔴 והדגל נבדק רק אחרי ensureDb',
   /ensureDb\(function \(dbErr\) \{[\s\S]{0,400}?budgetTxStatusToFirestore/.test(DS));
ok('הכתיבה היא update ולא set', /\.update\(fields \|\| \{\}\)/.test(FB));
ok('🔴 updateDoc נחשף מהגשר', /updateDoc: updateDoc,/.test(FB));
ok('statusPending מורם בכתיבה', /statusPending: true/.test(DS));
{
  /* המסלול המהיר חייב להיות סגור לכל מה שאינו סטטוס. */
  const sb = { window: {}, console };
  sb.window = sb;
  sb.CBA = { mock: { transactions: [], categories: [], years: {}, yearList: [], currentYear: '', _settings: {} },
             esc: s => String(s) };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb.document = { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                  createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                  head: { appendChild() {} }, body: { appendChild() {} }, hidden: false };
  sb.navigator = { onLine: true }; sb.addEventListener = () => {}; sb.location = { href: 'https://x/' };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  const D = sb.CBA.data;
  ok('סטטוס בלבד — מסלול מהיר', D.txStatusOnly({ status: 'ready' }) === true);
  ok('סטטוס + הערה — מסלול מהיר', D.txStatusOnly({ status: 'review', reviewNote: 'x' }) === true);
  ok('🔴 סכום — לא מסלול מהיר', D.txStatusOnly({ status: 'ready', amount: 5 }) === false);
  ok('🔴 סעיף — לא מסלול מהיר', D.txStatusOnly({ status: 'ready', categoryId: 'x' }) === false);
  ok('🔴 בלי סטטוס בכלל — לא מסלול מהיר', D.txStatusOnly({ reviewNote: 'x' }) === false);
  ok('🔴 ריק — לא מסלול מהיר', D.txStatusOnly({}) === false);
  ok('מעבר חוקי בלקוח', D.txLegalStep('submitted', 'ready') === true);
  ok('🔴 ומעבר לא חוקי הולך למסלול המלא', D.txLegalStep('submitted', 'paid') === false);
  ok('🔴 והחזרה אחורה (תיקון ידני) גם היא', D.txLegalStep('paid', 'review') === false);
}


section('9. 🔴 הרענון התקופתי לא מחזיר את הסטטוס אחורה');
/* 🔴 **הבאג שהבדיקות האלה נולדו ממנו:** השנה הנוכחית מגיעה
   מהמטען של Apps Script, ו-`apply()` דורס את CBA.mock.years כל
   שלוש שניות. בלי החזקת הדגל, הסטטוס שנכתב ל-Firestore היה
   נראה קופץ חזרה עד שההחלה מגיעה לגיליון. */
ok('הכתיבה מחזיקה markDirty', /CBA\.sheets\.markDirty\("txStatus", false\)/.test(DS));
ok('🔴 והשחרור הוא clearDirty באותה סיבה', /CBA\.sheets\.clearDirty\("txStatus"\)/.test(DS));
ok('🔴 והשחרור יושב בקולבק של הדחיפה, לא מיד אחרי הכתיבה',
   /CBA\.sheets\.get\(\{ action: "budgetTxApply" \}, done\)/.test(DS));
ok('🔴 וכשל כתיבה משחרר גם הוא',
   /if \(err\) \{ txDirtyDown\(\); return done\(false/.test(DS));
{
  /* מרוץ אמיתי: שתי כתיבות רצופות — הדגל יורד רק אחרי ששתיהן שוחררו. */
  const sb = { console };
  sb.window = sb;
  let marks = [], clears = [], nudges = 0, nudgeCb = null;
  sb.CBA = {
    mock: { transactions: [{ id: 1, year: 'תשפ"ז', status: 'submitted' },
                            { id: 2, year: 'תשפ"ז', status: 'submitted' }],
            categories: [], years: {}, yearList: [], currentYear: 'תשפ"ז', _settings: {},
            /* pushConnected() דורש את זה — אחרת כל הכתיבה מדולגת בשקט. */
            _source: 'sheets' },
    esc: s => String(s), isSuper: true, perms: ['תקציב'], user: { familyId: '3' },
    sheets: { markDirty: (r) => marks.push(r), clearDirty: (r) => clears.push(r),
              get: (p, cb) => { nudges++; nudgeCb = cb; },
              push: () => {}, isConnected: () => true },
    fb: { authReady: cb => cb({ uid: 'u' }), ensureDb: cb => cb(null),
          flag: (k, d) => d, serverNow: () => 'T',
          updateDoc: (c, id, f, cb) => cb(null) }
  };
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb.document = { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                  createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                  head: { appendChild() {} }, body: { appendChild() {} }, hidden: false };
  sb.navigator = { onLine: true }; sb.addEventListener = () => {}; sb.location = { href: 'https://x/' };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  const D = sb.CBA.data;
  D.updateTransaction(1, { status: 'ready' });
  D.updateTransaction(2, { status: 'ready' });
  ok('🔴 הדגל הורם פעם אחת לשתי כתיבות', marks.length === 1 && marks[0] === 'txStatus',
     JSON.stringify(marks));
  ok('🔴 ולא שוחרר לפני הדחיפה', clears.length === 0, JSON.stringify(clears));
  setTimeout(function () {
    ok('🔴 שתי כתיבות = דחיפה אחת', nudges === 1, String(nudges));
    ok('🔴 והדגל עדיין מוחזק עד שהדחיפה חוזרת', clears.length === 0, JSON.stringify(clears));
    if (nudgeCb) nudgeCb({ ok: true });
    ok('🔴 ורק אז שוחרר', clears.length === 1 && clears[0] === 'txStatus', JSON.stringify(clears));
    ok('הסטטוס עודכן מקומית מיד', sb.CBA.mock.transactions[0].status === 'ready');

    console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
    process.exit(fail ? 1 : 0);
  }, 1200);
}
