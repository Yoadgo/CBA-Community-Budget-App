/* בדיקות לתיבת הדואר ולפיצול הגשת הקבלה (2026-09-15, צעד 09ב-5א+5ב).
   הרצה:  node tools/test-budget-tx-mailbox.js

   🔴 **שתי סכנות, שתיהן שקטות:**
     1. **תבנית מייל שהלקוח בוחר** — היתה מאפשרת לכל חבר לגרום לשרת
        לשלוח כל מייל שבמערכת לכל משפחה. התבנית נגזרת ממצב המסמך.
     2. **סדר הפעולות בהגשה** — מסמך לפני קובץ משאיר לתושב בקשה בלי
        קבלה על המסך. קובץ לפני מסמך משאיר קובץ יתום, שאיש לא רואה. */
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

/* ===================== השרת ===================== */
let written, mails, adminMails, pending;
const sandbox = {
  console,
  Utilities: { formatDate: (d, tz, f) => '15-09-2026', getUuid: () => 'x', newBlob: () => ({}),
               base64Decode: () => [], computeHmacSha256Signature: () => [1],
               base64EncodeWebSafe: () => 'x', base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {}, getKeys: () => [] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  encodeURIComponent, Date, JSON, String, Number, Math, Object, Array, Error, parseInt, isNaN
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FIRESTORE, sandbox);
sandbox.json_ = o => o;

function reset(docs) {
  written = []; mails = []; adminMails = []; pending = docs || [];
  sandbox.fsQuery_ = (c, f, op, v, lim) => (f === 'mailPending' ? pending.slice(0, lim || 50) : []);
  sandbox.fsSet_ = (p, o) => { written.push({ path: p, doc: o }); return {}; };
  sandbox.emailsForFamilyId_ = () => ['r@x.com'];
  sandbox.sendResidentTemplate_ = (ss, key, emails, vars) => mails.push({ key, emails, vars });
  sandbox.notifyAdmins_ = (ss, perm, key, vars) => adminMails.push({ key, vars });
  sandbox.txFamilyNames_ = () => ({ '3': 'משפחת כהן' });
  return sandbox.SpreadsheetApp.getActiveSpreadsheet();
}
const doc = (o) => ({ id: 'תשפ"ז__' + (o.id || 1), data: Object.assign(
  { 'מזהה': o.id || 1, 'מקור': 'תושב', 'סטטוס': 'הוגשה קבלה', 'סכום': 100,
    'מזהה משפחה': '3', year: 'תשפ"ז', familyId: '3', mailPending: true, schema: 2 }, o.over || {}) });

section('1. שליחה על בקשה חדשה');
{
  const ss = reset([doc({ id: 5 })]);
  const r = sandbox.budgetTxMailPending_(ss);
  ok('נמצא ונשלח', r.found === 1 && r.sent === 1, JSON.stringify(r));
  ok('🔴 מייל אישור לתושב', mails.length === 1 && mails[0].key === 'REIMBURSEMENT_RECEIVED', JSON.stringify(mails));
  ok('🔴 והתראה למנהלי התקציב', adminMails.length === 1 && adminMails[0].key === 'ADMIN_NEW_REIMBURSEMENT');
  ok('הסכום והמזהה במייל', mails[0].vars['סכום'] === 100 && mails[0].vars['מזהה'] === 5);
  ok('🔴 והשם הורכב ממזהה המשפחה', mails[0].vars['שם'] === 'משפחת כהן', mails[0].vars['שם']);
  ok('🔴 והדגל ירד', written.length === 1 && written[0].doc.mailPending === false);
  ok('ושאר השדות נשמרו', written[0].doc['סכום'] === 100 && written[0].doc.familyId === '3');
}

section('2. 🔴 התבנית נגזרת מהמסמך, לא מהלקוח');
ok('🔴🔴 אין שדה תבנית שהלקוח שולח',
   CODE.indexOf('d.mailKey') === -1 && CODE.indexOf("d['mailTemplate']") === -1);
{
  /* מסמך עם הדגל מורם שאינו בקשה חדשה — הדגל יורד בלי מייל. */
  const ss = reset([doc({ id: 6, over: { 'מקור': 'מנהל' } })]);
  const r = sandbox.budgetTxMailPending_(ss);
  ok('🔴 מקור מנהל — בלי מייל', mails.length === 0 && adminMails.length === 0);
  ok('🔴 והדגל בכל זאת יורד (לא נתקע בתור)',
     written.length === 1 && written[0].doc.mailPending === false && r.sent === 0);
}
{
  const ss = reset([doc({ id: 7, over: { 'סטטוס': 'שולם' } })]);
  sandbox.budgetTxMailPending_(ss);
  ok('🔴 סטטוס שאינו פתיחה — בלי מייל', mails.length === 0);
  ok('והדגל יורד', written.length === 1 && written[0].doc.mailPending === false);
}

section('3. עמידות');
{
  const ss = reset([doc({ id: 8 })]);
  sandbox.sendResidentTemplate_ = () => { throw new Error('מכסה'); };
  const r = sandbox.budgetTxMailPending_(ss);
  ok('🔴 כשל שליחה → הדגל **לא** יורד, ננסה שוב',
     r.failed === 1 && written.length === 0, JSON.stringify(r));
}
{
  const ss = reset([]);
  sandbox.fsQuery_ = () => { throw new Error('אין רשת'); };
  const r = sandbox.budgetTxMailPending_(ss);
  ok('כשל שאילתה → ok=false בלי לזרוק', r.ok === false && r.errors.length === 1);
}
{
  const many = []; for (let i = 0; i < 80; i++) many.push(doc({ id: i + 1 }));
  const ss = reset(many);
  const r = sandbox.budgetTxMailPending_(ss);
  ok('🔴 תקרה של 50 לריצה — מכסת MailApp נשרפת בשקט',
     r.found === 50, String(r.found));
  ok('והתקרה מוגדרת בקבוע', sandbox.BTX_MAIL_MAX_PER_RUN === 50);
}

section('4. תזמון');
{
  /* ⚠️ גוף העבודה השעתית עבר ל-`hourlyJobsRun_` (16.9) כש-`hourlyJobs`
     הפכה למעטפת נעילה — ר' `withSyncLock_`. הסדר הנבדק כאן הוא הסדר
     בתוך הגוף, והוא לא השתנה. */
  const h = CODE.slice(CODE.indexOf('function hourlyJobsRun_()'));
  const body = h.slice(0, h.indexOf('\n}\n'));
  ok('תיבת הדואר רצה כל שעה', body.indexOf('budgetTxMailPending_') !== -1);
  ok('🔴 ואחרי החלת הסטטוסים',
     body.indexOf('budgetTxApplyPending_') < body.indexOf('budgetTxMailPending_'));
  const d = CODE.slice(CODE.indexOf('function dailyEmailJobs_()'));
  const db = d.slice(0, d.indexOf('\n}'));
  ok('ורצה גם בעבודה היומית', db.indexOf('budgetTxMailPending_') !== -1);
  ok('🔴 ולפני staleNudgeJob_',
     db.indexOf('try { budgetTxMailPending_') < db.indexOf('try { staleNudgeJob_'));
}

section('5. 🔴 העלאת הקבלה — Drive בלבד');
{
  const f = CODE.slice(CODE.indexOf('function uploadReceiptOnly_'), CODE.indexOf('function budgetTxMailPending_'));
  ok('הפונקציה קיימת', f.length > 100);
  ok('🔴 אינה כותבת לגיליון', f.indexOf('getSheetByName') === -1, 'נמצא getSheetByName');
  ok('🔴 ואינה שולחת מייל',
     f.indexOf('sendResidentTemplate_') === -1 && f.indexOf('notifyAdmins_') === -1);
  ok('🔴 מזהה המשפחה נגזר מהמייל המאומת בלבד',
     /lookupResident_\(String\(body\._email/.test(f), 'לא מ-_email');
  ok('🔴🔴 ולא מ-body.email — זה הבאג של 9.9', !/body\.email\b/.test(f));
  ok('הקובץ נשאר פרטי (בלי setSharing)', f.indexOf('setSharing') === -1);
  ok('מנותבת ב-doPost', CODE.indexOf("case 'uploadReceiptOnly'") !== -1);
  ok('🔴 ויש לה תחום מטמון משלה — לא מבטלת את המטען של כולם',
     /uploadReceiptOnly: 'receiptFile'/.test(CODE));
}

section('6. 🔴 סדר הפעולות בלקוח');
{
  const f = DS.slice(DS.indexOf('function submitReceiptViaFirestore'),
                     DS.indexOf('function submitReceiptViaSheets'));
  const iUpload = f.indexOf('uploadReceiptOnly');
  const iDoc = f.indexOf('createDoc');
  ok('🔴🔴 הקובץ נשלח לפני יצירת המסמך', iUpload !== -1 && iDoc !== -1 && iUpload < iDoc,
     iUpload + ' vs ' + iDoc);
  ok('🔴 מזהה המשפחה מגיע מהשרת ולא מהטופס',
     /String\(up\.familyId \|\| fields\.familyId/.test(f), f.slice(0, 100));
  ok('🔴 mailPending מורם', /doc\.mailPending = true;/.test(f));
  ok('המזהה מהמונה', /nextId\("tx_" \+ year/.test(f));
  ok('🔴 וכל כשל נופל למסלול הישן',
     (f.match(/return fallback\(\)/g) || []).length >= 3,
     String((f.match(/return fallback\(\)/g) || []).length));
  ok('🔴 והמסלול הישן נשאר שלם', DS.indexOf('function submitReceiptViaSheets') !== -1);
  ok('והדגל שולט בבחירה', /txWriteOn\(function \(on\) \{[\s\S]{0,200}submitReceiptViaSheets/.test(DS));
}

section('7. הכלל מתיר mailPending — ובוליאני בלבד');
{
  const i = RULES.indexOf('function txResidentCreateOk');
  const b = RULES.slice(i, RULES.indexOf('\n    }', i));
  ok('🔴 mailPending חייב להיות בוליאני', /mailPending is bool/.test(b), b);
  ok('🔴 ואינו יכול לשמש דלת לשדה אסור — הצורה עדיין נבדקת', /txShapeOk\(docId\)/.test(b));
  const j = RULES.indexOf('function txDetailsUpdateOk');
  const d = RULES.slice(j, RULES.indexOf('\n    }', j));
  ok('🔴🔴 ועדכון פרטים אינו יכול להרים mailPending — אחרת מייל בלולאה',
     d.indexOf('mailPending') === -1, d);
  const k = RULES.indexOf('function txStatusUpdateOk');
  const st = RULES.slice(k, RULES.indexOf('\n    }', k));
  ok('🔴 וגם עדכון סטטוס לא', st.indexOf('mailPending') === -1, st);
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
