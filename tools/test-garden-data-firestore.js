/* דיווחי ומשימות הגינון ל-Firestore (2026-09-16).
   הרצה:  node tools/test-garden-data-firestore.js

   🔴 המארז הזה נכתב סביב **מה שיכול להישבר בשקט**, לא סביב מה שקל לבדוק.
   שלושה דברים כאלה כאן, ולכל אחד סעיף משלו:

     1. **דליפת מידע אישי.** טאב הדיווחים מחזיק 'שם מדווח' ו'טלפון'.
        אם שדה כזה ייכנס למסמך, שום דבר לא ייכשל ושום מסך לא ישתנה —
        המידע פשוט יישב באוסף שאינו הגיליון. זו **הפרה של הקו האדום**,
        והבדיקה היחידה שתופסת אותה היא לחפש את המחרוזות עצמן בכל המסמך.
     2. **סטייה בין המסמך לנפילה לאחור.** המסמך והתשובה של Apps Script
        חייבים להיות אותו אובייקט. סטייה כאן אינה שגיאה שנראית — היא
        מסך שמראה נתון אחר לפי דגל שאיש לא זוכר שהודלק.
     3. **סינון שנת התקציב.** מסנן שגוי כותב אוסף ריק (מסך ריק) או
        אוסף שגדל לנצח (סריקה שמתחילה לעלות זמן). שניהם שקטים. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const APP = path.join(__dirname, '..', 'apps-script');
const CODE = fs.readFileSync(path.join(APP, 'Code.gs'), 'utf8');
const FSTORE = fs.readFileSync(path.join(APP, 'Firestore.gs'), 'utf8');

let fetchQueue = [], fetchLog = [];
const sandbox = {
  console,
  Utilities: {
    getUuid: () => 'x',
    formatDate: (d) => d.toISOString().substring(0, 10),
    computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
    base64Encode: () => 'x', computeRsaSha256Signature: () => [1]
  },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => true }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {}, deleteProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => FAKE_SS, flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {},
  UrlFetchApp: {
    fetch: (url, opt) => {
      fetchLog.push({ url: url, method: (opt || {}).method });
      const r = fetchQueue.length ? fetchQueue.shift() : { code: 200, body: '{}' };
      return { getResponseCode: () => r.code, getContentText: () => r.body };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FSTORE, sandbox);

/* ---------- גיליון מזויף ---------- */
const R_HEAD = sandbox.GARDEN_REPORT_HEADERS;
const T_HEAD = sandbox.GARDEN_TASK_HEADERS;
const L_HEAD = sandbox.GARDEN_LOG_HEADERS;
const YEAR = 'תשפ"ו';

/* 🔴 ערכים שסימנתי בכוונה כך שאי אפשר לפספס אותם במסמך.
   הבדיקה מחפשת את המחרוזות האלה עצמן. */
const NAME  = 'שרה כהן-לוי';
const PHONE = '050-1234567';

function sheetOf(head, rows) {
  const v = [head].concat(rows);
  return {
    getLastRow: () => v.length,
    getLastColumn: () => head.length,
    getDataRange: () => ({ getValues: () => v }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => v.slice(r - 1, r - 1 + (nr || 1)).map(x => x.slice(c - 1, c - 1 + (nc || 1))),
      setValues() { return this; }, setValue() {}, setFontWeight() { return this; }
    }),
    appendRow() {}, deleteRow() {}
  };
}
function row(head, obj) {
  return head.map(h => (obj[h] === undefined ? '' : obj[h]));
}

const DAY = 86400000;
const NOW = Date.now();

/* 🔴 **תאריך חייב להיווצר בתוך ה-sandbox.**
   `gardenReportRow_` בודקת `t.approvedAt instanceof Date`. `vm` פותח
   realm נפרד עם `Date` משלו, ולכן Date שנוצר כאן **אינו** instanceof
   ה-Date של הסקריפט — הבדיקה היתה נכשלת על משהו שעובד מצוין ב-Apps
   Script (שם יש realm אחד). בלי ההבחנה הזאת הייתי "מתקן" קוד תקין. */
const sbDate = ms => vm.runInContext('new Date(' + ms + ')', sandbox);
const APPROVED_FRESH = sbDate(NOW - 2 * DAY);      // בתוך חלון המשוב
const APPROVED_OLD   = sbDate(NOW - 30 * DAY);     // מחוץ לחלון

const REP_A = row(R_HEAD, {
  'מזהה': 'R1', 'תאריך דיווח': sbDate(Date.parse('2026-09-01T06:00:00Z')),
  'מזהה משפחה': 'F100', 'שם מדווח': NAME, 'טלפון': PHONE,
  'קטגוריה': 'מדשאות', 'אזור': 'שכונה צפונית',
  'מיקום X': 0.25, 'מיקום Y': 0.75, 'מיקום מילולי': 'ליד המועדון',
  'כותרת': 'דשא גבוה', 'תיאור': 'הדשא לא כוסח שבועיים',
  'תמונות': 'u1, u2', 'מזהה משימה': 'T1', 'שנת תקציב': YEAR
});
const REP_B = row(R_HEAD, {
  'מזהה': 'R2', 'תאריך דיווח': sbDate(Date.parse('2026-09-02T06:00:00Z')),
  'מזהה משפחה': 'F200', 'שם מדווח': NAME, 'טלפון': PHONE,
  'קטגוריה': 'עצים', 'כותרת': 'ענף שבור', 'מזהה משימה': 'T2',
  'שנת תקציב': YEAR
});
/* שנה שעברה — לא אמור להיכתב */
const REP_OLD = row(R_HEAD, {
  'מזהה': 'R0', 'מזהה משפחה': 'F100', 'כותרת': 'ישן', 'שנת תקציב': 'תשפ"ה'
});
/* בלי מזהה משפחה — אי אפשר לאבטח, חייב להידלג */
const REP_ORPHAN = row(R_HEAD, {
  'מזהה': 'R9', 'כותרת': 'יתום', 'שנת תקציב': YEAR
});

const TASK_1 = row(T_HEAD, {
  'מזהה': 'T1', 'סוג': 'תקלה', 'כותרת': 'כיסוח צפונית', 'קטגוריה': 'מדשאות',
  'אזור': 'שכונה צפונית', 'מיקום X': 0.25, 'מיקום Y': 0.75,
  'שלב': 'הושלם', 'דגל': '', 'סגירה': '', 'שבוע': '2026-08-30',
  'עודכן על ידי': NAME, 'אושר על ידי': 'דני המנהל',
  'תאריך אישור': APPROVED_FRESH, 'שנת תקציב': YEAR
});
const TASK_2 = row(T_HEAD, {
  'מזהה': 'T2', 'סוג': 'תקלה', 'כותרת': 'ענף', 'קטגוריה': 'עצים',
  'שלב': 'הושלם', 'עודכן על ידי': NAME, 'אושר על ידי': 'דני המנהל',
  'תאריך אישור': APPROVED_OLD, 'שנת תקציב': YEAR
});
const TASK_OLD = row(T_HEAD, {
  'מזהה': 'T0', 'כותרת': 'משנה שעברה', 'שלב': 'הושלם', 'שנת תקציב': 'תשפ"ה'
});

const LOG_ROWS = [row(L_HEAD, {
  'חותמת זמן': sbDate(NOW), 'מזהה משימה': 'T2', 'סוג רשומה': 'סגירה',
  'מבצע': NAME, 'הערה': 'הענף הוסר על ידי הקבלן'
})];

let FAKE_SS, writes, deletes, listReply, failOn;
function build(opts) {
  opts = opts || {};
  const reports = sheetOf(R_HEAD, opts.reports || [REP_A, REP_B, REP_OLD, REP_ORPHAN]);
  const tasks   = sheetOf(T_HEAD, opts.tasks   || [TASK_1, TASK_2, TASK_OLD]);
  const log     = sheetOf(L_HEAD, LOG_ROWS);
  const settings = sheetOf(['מפתח', 'ערך'],
    opts.noYear ? [] : [['שנה נוכחית', YEAR]]);
  const emails = sheetOf(['מפתח', 'נושא', 'גוף', 'הערה', 'תחום', 'פעיל'],
    [['RULE_GARDEN_FEEDBACK_DAYS', '', '7', '', '', 'כן']]);
  FAKE_SS = {
    getSheetByName: n =>
        n === sandbox.GARDEN_REPORTS_SHEET ? reports
      : n === sandbox.GARDEN_TASKS_SHEET   ? tasks
      : n === sandbox.GARDEN_LOG_SHEET     ? log
      : n === 'הגדרות'                      ? settings
      : n === 'הגדרות מיילים'               ? emails : null,
    insertSheet: () => emails
  };
  return FAKE_SS;
}
function reset(opts) {
  writes = []; deletes = []; fetchLog = []; fetchQueue = [];
  listReply = []; failOn = null;
  build(opts);
  sandbox.fsSet_ = (p, o) => {
    if (failOn === 'set') throw new Error('כתיבה נכשלה (503)');
    writes.push({ path: p, obj: o });
    return {};
  };
  sandbox.fsDelete_ = p => {
    if (failOn === 'delete') throw new Error('מחיקה נכשלה (503)');
    deletes.push(p); return true;
  };
  sandbox.fsList_ = () => {
    if (failOn === 'list') throw new Error('רשימה נכשלה (503)');
    return listReply;
  };
}
const byId = (arr, id) => arr.find(w => w.path.indexOf('/' + encodeURIComponent(id)) !== -1);
const isDate = x => !!x && typeof x.getTime === 'function';

/* ================================================================= */
section('1. שמות ותשתית');
reset();
ok('FS_GARDEN_REPORTS = gardenReports', sandbox.FS_GARDEN_REPORTS === 'gardenReports', sandbox.FS_GARDEN_REPORTS);
ok('FS_GARDEN_TASKS = gardenTasks', sandbox.FS_GARDEN_TASKS === 'gardenTasks', sandbox.FS_GARDEN_TASKS);
ok('gardenReportCtx_ קיימת', typeof sandbox.gardenReportCtx_ === 'function');
ok('gardenReportDoc_ קיימת', typeof sandbox.gardenReportDoc_ === 'function');
ok('gardenTaskDoc_ קיימת', typeof sandbox.gardenTaskDoc_ === 'function');
ok('gardenReportsSyncAll_ קיימת', typeof sandbox.gardenReportsSyncAll_ === 'function');
ok('gardenTasksSyncAll_ קיימת', typeof sandbox.gardenTasksSyncAll_ === 'function');
ok('gardenDataSyncAll_ קיימת', typeof sandbox.gardenDataSyncAll_ === 'function');
ok('handleGardenDataSync_ קיימת', typeof sandbox.handleGardenDataSync_ === 'function');
ok('הפעולה רשומה בנתב', /action === 'gardenDataSync'/.test(CODE));
ok('הפעולה דורשת PERM_SUPER',
   /handleGardenDataSync_[\s\S]{0,400}authorize_\(ss, p, PERM_SUPER\)/.test(CODE));
ok('הסנכרון לוקח את נעילת הסנכרון',
   /handleGardenDataSync_[\s\S]{0,500}withSyncLock_\('gardenDataSync'/.test(CODE));
ok('מחובר לעבודה השעתית', /gardenDataSyncAll_\(ss\)/.test(
     CODE.substring(CODE.indexOf('function hourlyJobsRun_'),
                    CODE.indexOf('function installHourlyTrigger'))));

/* ================================================================= */
section('2. 🔴 הקו האדום — אין מידע אישי במסמך הדיווח');
reset();
let res = sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('הסנכרון הצליח', res.ok === true, res.error);
const all = JSON.stringify(writes.map(w => w.obj));
ok('שם המדווח אינו מופיע באף מסמך', all.indexOf(NAME) === -1);
ok('הטלפון אינו מופיע באף מסמך', all.indexOf(PHONE) === -1);
const d1 = byId(writes, 'R1').obj;
ok('אין מפתח "שם מדווח"', !('שם מדווח' in d1) && !('name' in d1) && !('reporter' in d1),
   Object.keys(d1).join(','));
ok('אין מפתח "טלפון"', !('טלפון' in d1) && !('phone' in d1), Object.keys(d1).join(','));
ok('familyId כן נשמר — הוא הגשר', d1.familyId === 'F100', d1.familyId);
/* ⚠️ הסבר הסגירה מגיע מהיומן, שיש בו עמודת 'מבצע' עם שם אדם.
   רק ההערה נכנסת — לא המבצע. */
const d2 = byId(writes, 'R2').obj;
ok('הסבר הסגירה נכנס למסמך', d2.closeWhy === 'הענף הוסר על ידי הקבלן', d2.closeWhy);
ok('"מבצע" מהיומן לא נכנס', JSON.stringify(d2).indexOf(NAME) === -1);

/* ================================================================= */
section('3. 🔴 נאמנות — המסמך זהה לתשובת Apps Script');
reset();
const ctx = sandbox.gardenReportCtx_(FAKE_SS);
const rsh = FAKE_SS.getSheetByName(sandbox.GARDEN_REPORTS_SHEET);
const rc = sandbox.gardenCols_(rsh);
const raw = sandbox.gardenReportRow_(rsh.getDataRange().getValues()[1], rc,
                                     ctx.tasks, ctx.closeWhy, ctx.fbDays, ctx.now);
sandbox.gardenReportsSyncAll_(FAKE_SS);
const doc = byId(writes, 'R1').obj;
const EXTRA = { familyId: 1, schema: 1, updatedAt: 1 };
let drift = [];
Object.keys(raw).forEach(k => {
  if (JSON.stringify(raw[k]) !== JSON.stringify(doc[k])) drift.push(k);
});
ok('כל שדה מ-gardenReportRow_ נשמר זהה', drift.length === 0, drift.join(','));
const added = Object.keys(doc).filter(k => !(k in raw));
ok('המסמך מוסיף בדיוק familyId/schema/updatedAt',
   added.length === 3 && added.every(k => EXTRA[k]), added.join(','));
ok('updatedAt הוא Date אמיתי', isDate(doc.updatedAt));
ok('schema = 1', doc.schema === 1, String(doc.schema));
ok('photos נשאר מערך מפוצל', Array.isArray(doc.photos) && doc.photos.length === 2,
   JSON.stringify(doc.photos));
ok('photos ללא רווחים', doc.photos[1] === 'u2', JSON.stringify(doc.photos));
ok('x/y נשמרים כמספרים', doc.x === 0.25 && doc.y === 0.75, doc.x + '/' + doc.y);
ok('stage נגזר מהמשימה', doc.stage === 'הושלם', doc.stage);

/* ================================================================= */
section('4. חלון המשוב — feedbackUntil מקפל מחדש נכון');
reset();
sandbox.gardenReportsSyncAll_(FAKE_SS);
const fresh = byId(writes, 'R1').obj;   // אושר לפני יומיים
const old   = byId(writes, 'R2').obj;   // אושר לפני 30 יום
ok('R1 — אפשר להגיב', fresh.canFeedback === true);
ok('R1 — feedbackUntil הוא מספר בעתיד', fresh.feedbackUntil > NOW, String(fresh.feedbackUntil));
ok('R2 — החלון נסגר', old.canFeedback === false);
ok('R2 — feedbackUntil בעבר', old.feedbackUntil > 0 && old.feedbackUntil < NOW,
   String(old.feedbackUntil));
/* 🔴 זו הבדיקה שמצדיקה את השדה: מסמך שנכתב כשהחלון היה פתוח,
   ונקרא אחרי שנסגר. הקיפול בלקוח חייב לכבות אותו. */
const refold = (o, now) => !!o.canFeedback && (!o.feedbackUntil || now <= o.feedbackUntil);
ok('קיפול מחדש אחרי שהחלון נסגר → false',
   refold(fresh, fresh.feedbackUntil + 1000) === false);
ok('קיפול מחדש בתוך החלון → נשאר true', refold(fresh, NOW) === true);
ok('קיפול מחדש אינו מדליק מה שכבוי', refold(old, NOW - 40 * DAY) === false);
/* משימה שלא אושרה מעולם — אין חלון, ואין הגבלה */
reset({ tasks: [row(T_HEAD, {
  'מזהה': 'T1', 'שלב': 'הושלם', 'תאריך אישור': '', 'שנת תקציב': YEAR })] });
sandbox.gardenReportsSyncAll_(FAKE_SS);
const noAppr = byId(writes, 'R1').obj;
ok('בלי תאריך אישור — feedbackUntil = 0', noAppr.feedbackUntil === 0, String(noAppr.feedbackUntil));
ok('בלי תאריך אישור — עדיין אפשר להגיב', noAppr.canFeedback === true);

/* ================================================================= */
section('5. 🔴 סינון שנת התקציב');
reset();
sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('דיווח משנה שעברה לא נכתב', !byId(writes, 'R0'));
ok('דיווחי השנה הנוכחית נכתבו', !!byId(writes, 'R1') && !!byId(writes, 'R2'));
/* 🔴🔴 **המשימות אינן מסוננות לפי שנה כלל — וזה תיקון של באג
   שנתפס באימות בייצור (16.9).** הסינון הוריד 31 משימות מתוך 41:
   שנת התקציב התחלפה, והמשימות הפתוחות נושאות עדיין את הישנה
   או תא ריק. המנהל היה מאבד את רוב תור העבודה בלי שום שגיאה. */
reset();
sandbox.gardenTasksSyncAll_(FAKE_SS);
ok('🔴🔴 משימה משנה שעברה **כן** נכתבת — היא עדיין עבודה פתוחה',
   !!byId(writes, 'T0'), JSON.stringify(writes.map(w => w.path)));
ok('ומשימות השנה הנוכחית כמובן', !!byId(writes, 'T1') && !!byId(writes, 'T2'));
/* ⚠️ מחפשים **השוואה** שמסננת, לא את המילה: ההערה שמסבירה למה
   אין סינון מזכירה את שנת התקציב, והבדיקה נכשלה על התיעוד. */
ok('⚠️ ואין תנאי סינון שנה בלולאת המשימות',
   !/function gardenTasksSyncAll_[\s\S]{0,1600}\!== year\) continue;/.test(CODE));
/* ⚠️ בלי הגדרת "שנה נוכחית" — **לא מסננים**. אוסף מלא עדיף על ריק. */
reset({ noYear: true });
sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('בלי הגדרת שנה — הכול נכתב (ולא כלום)', !!byId(writes, 'R0'), String(writes.length));
/* 🔴 ובדיווחים: תא ריק נחשב לשנה הנוכחית, אחרת שורות ישנות
   שנכתבו לפני שהעמודה נוספה נעלמות מהתושב. */
reset({ reports: [REP_A, row(R_HEAD, {
  'מזהה': 'RBLANK', 'מזהה משפחה': 'F100', 'כותרת': 'בלי שנה', 'שנת תקציב': '' })] });
sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('🔴 דיווח בלי שנת תקציב נחשב לנוכחי ונכתב', !!byId(writes, 'RBLANK'),
   JSON.stringify(writes.map(w => w.path)));

/* ================================================================= */
section('6. 🔴 שורה בלי מזהה משפחה מדולגת ונספרת');
reset();
res = sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('R9 לא נכתב', !byId(writes, 'R9'));
ok('נספר כמדולג', res.skipped >= 1, String(res.skipped));

/* ================================================================= */
section('7. 🔴 מסמך המשימה — updatedBy יורד, approvedBy נשאר');
reset();
sandbox.gardenTasksSyncAll_(FAKE_SS);
const t1 = byId(writes, 'T1').obj;
ok('אין updatedBy', !('updatedBy' in t1), Object.keys(t1).join(','));
ok('שם המעדכן אינו מופיע בכלל', JSON.stringify(t1).indexOf(NAME) === -1);
ok('approvedBy נשאר — הוא מוצג במסך', t1.approvedBy === 'דני המנהל', t1.approvedBy);
ok('approvedAt נשאר', !!t1.approvedAt, String(t1.approvedAt));
const tsh2 = FAKE_SS.getSheetByName(sandbox.GARDEN_TASKS_SHEET);
const tobj = sandbox.gardenTaskObj_(tsh2.getDataRange().getValues()[1],
                                    sandbox.gardenCols_(tsh2));
let tdrift = [];
Object.keys(tobj).forEach(k => {
  if (k === 'updatedBy') return;
  if (JSON.stringify(tobj[k]) !== JSON.stringify(t1[k])) tdrift.push(k);
});
ok('כל שאר השדות זהים ל-gardenTaskObj_', tdrift.length === 0, tdrift.join(','));
ok('order הוא רמז לסדר ולא מזהה', typeof t1.order === 'number' && t1.id === 'T1');

/* 🔴🔴 **הבדיקה שתפסה באג אמיתי.** `gardenTaskObj_` כבר מחזיר שדה
   בשם `updatedAt` — 'עודכן בתאריך' מהגיליון, שהמסך מציג. חותמת
   הסנכרון נכתבה תחילה לאותו שם ודרסה אותו בשקט: כל משימה היתה
   מציגה "עודכן" = השעה שבה הסנכרון רץ. שום דבר לא נכשל, והנתון
   היה שגוי אצל כולם. */
ok('updatedAt של המשימה הוא של הגיליון ולא של הסנכרון',
   t1.updatedAt === tobj.updatedAt, t1.updatedAt + ' vs ' + tobj.updatedAt);
ok('חותמת הסנכרון יושבת ב-syncedAt', isDate(t1.syncedAt), String(t1.syncedAt));
/* הכלל הכללי, כבדיקה: אף שדה מעטפת לא דורס שדה מטען. */
const ENVELOPE = ['order', 'schema', 'syncedAt'];
const clash = ENVELOPE.filter(k => k in tobj);
ok('אין התנגשות בין שדות המעטפת למטען המשימה', clash.length === 0, clash.join(','));
const REP_ENVELOPE = ['familyId', 'schema', 'updatedAt'];
const rclash = REP_ENVELOPE.filter(k => k in raw);
ok('אין התנגשות בין שדות המעטפת למטען הדיווח', rclash.length === 0, rclash.join(','));

/* ================================================================= */
section('8. סחיפת יתומים');
reset();
listReply = [{ id: 'R1' }, { id: 'R2' }, { id: 'R0' }, { id: 'GHOST' }];
res = sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('מסמך שאינו בשנה הנוכחית נסחף', deletes.some(p => p.indexOf('R0') !== -1),
   deletes.join(','));
ok('מסמך רפאים נסחף', deletes.some(p => p.indexOf('GHOST') !== -1), deletes.join(','));
ok('מה שנכתב עכשיו לא נסחף',
   !deletes.some(p => p.indexOf('R1') !== -1 || p.indexOf('R2') !== -1), deletes.join(','));
ok('נספר', res.deleted === 2, String(res.deleted));

/* ================================================================= */
section('9. אי-הפרעה — כישלון סנכרון אינו זורק');
reset();
failOn = 'set';
res = sandbox.gardenReportsSyncAll_(FAKE_SS);
ok('לא נזרקה שגיאה', res && res.ok === false);
ok('השגיאה מוחזרת בשדה error', /503/.test(res.error), res.error);
reset();
failOn = 'list';
res = sandbox.gardenTasksSyncAll_(FAKE_SS);
ok('כישלון רשימה נתפס גם הוא', res.ok === false && /503/.test(res.error), res.error);
reset();
failOn = 'set';
res = sandbox.gardenDataSyncAll_(FAKE_SS);
ok('gardenDataSyncAll_ לא זורק', res && res.ok === false);
ok('מחזיר את שני הסיכומים', !!res.tasks && !!res.reports);

/* ================================================================= */
section('10. 🔴 סדר — משימות לפני דיווחים');
reset();
sandbox.gardenDataSyncAll_(FAKE_SS);
const firstTask   = writes.findIndex(w => w.path.indexOf('gardenTasks/') === 0);
const firstReport = writes.findIndex(w => w.path.indexOf('gardenReports/') === 0);
ok('שני האוספים נכתבו', firstTask !== -1 && firstReport !== -1,
   firstTask + '/' + firstReport);
/* המסמך של הדיווח נושא את שלב המשימה שלו. סדר הפוך פותח חלון
   שבו הדיווח מצביע על שלב שהמשימה טרם הגיעה אליו. */
ok('המשימות נכתבו קודם', firstTask < firstReport, firstTask + ' < ' + firstReport);

/* ================================================================= */
section('11. נקודת גזירה אחת — ההנדלר הישן לא שוכפל');
ok('handleMyGardenReports_ קורא ל-gardenReportCtx_',
   /function handleMyGardenReports_[\s\S]{0,900}gardenReportCtx_\(ss\)/.test(CODE));
ok('אין עותק שני של מפת המשימות',
   (CODE.match(/מפת משימות לפי מזהה/g) || []).length === 1);
ok('הסנכרון נגזר מ-gardenReportRow_ ולא בונה שדות מחדש',
   /function gardenReportsSyncAll_[\s\S]{0,1600}gardenReportRow_\(/.test(CODE));
ok('gardenReportDoc_ מעתיק את כל המפתחות ולא רושם רשימה',
   /function gardenReportDoc_[\s\S]{0,400}Object\.keys\(o\)\.forEach/.test(CODE));

/* ================================================================= */
section('12. 🔴🔴 רעננות בכתיבה — הפער שהסנכרון השעתי משאיר');
/* Firestore נותן זמן אמת; מה שחסר היה **מי כותב למסמך**. תושב מגיש
   דיווח → נכתבת שורה בגיליון → ואיש לא מספר ל-Firestore. עם הדגל
   דלוק התושב היה רואה רשימה ריקה עד הסנכרון הבא. */
ok('gardenWrite_ קיימת', typeof sandbox.gardenWrite_ === 'function');
ok('gardenAfterWrite_ קיימת', typeof sandbox.gardenAfterWrite_ === 'function');
ok('gardenReportSyncSome_ קיימת', typeof sandbox.gardenReportSyncSome_ === 'function');
ok('gardenReportIdsForTask_ קיימת', typeof sandbox.gardenReportIdsForTask_ === 'function');
/* 🔴 ההוק בנתב ולא בשש הפונקציות — רשימה מפוזרת מתיישנת. */
['submitGardenReport', 'gardenFeedback', 'gardenTask',
 'gardenApproveBatch', 'gardenMerge', 'gardenCreateTask'].forEach(function (a) {
  ok('🔴 ' + a + ' עוברת דרך gardenWrite_',
     new RegExp("case '" + a + "':\\s*return json_\\(gardenWrite_\\(").test(CODE));
});
ok('⚠️ ואין יותר קריאה ישירה למטפל מהנתב',
   !/case 'submitGardenReport':\s*return json_\(submitGardenReport_/.test(CODE));

/* --- התנהגות --- */
reset();
let n = sandbox.gardenReportSyncSome_(FAKE_SS, ['R1']);
ok('דיווח בודד נכתב', n === 1 && !!byId(writes, 'R1'), String(n));
ok('⚠️ ורק הוא — לא כל האוסף', writes.length === 1, String(writes.length));
ok('⚠️ ובלי סחיפת יתומים (הכתיבה הממוקדת אינה מוחקת)', deletes.length === 0);
reset();
ok('שורה בלי מזהה משפחה מדולגת גם כאן',
   sandbox.gardenReportSyncSome_(FAKE_SS, ['R9']) === 0 && !byId(writes, 'R9'));
reset();
ok('רשימה ריקה לא עושה דבר', sandbox.gardenReportSyncSome_(FAKE_SS, []) === 0 && writes.length === 0);
reset();
ok('מזהי הדיווחים של משימה', JSON.stringify(sandbox.gardenReportIdsForTask_(FAKE_SS, 'T1')) === '["R1"]',
   JSON.stringify(sandbox.gardenReportIdsForTask_(FAKE_SS, 'T1')));
ok('משימה בלי דיווחים → ריק',
   sandbox.gardenReportIdsForTask_(FAKE_SS, 'T404').length === 0);

/* 🔴🔴 הלב: שינוי **משימה** חייב לרענן את מסמך ה**דיווח**, כי הוא
   נושא את stage/closeWhy/canFeedback שלה. */
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'gardenTask', { id: 'T1' }, { ok: true });
ok('🔴🔴 שינוי משימה מסנכרן את הדיווח הקשור אליה', !!byId(writes, 'R1'),
   JSON.stringify(writes.map(w => w.path)));
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'gardenApproveBatch', { ids: ['T1', 'T2'] }, { ok: true });
ok('אישור מרובה מכסה את כל המשימות שברשימה',
   !!byId(writes, 'R1') && !!byId(writes, 'R2'), JSON.stringify(writes.map(w => w.path)));
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'submitGardenReport', {}, { ok: true, id: 'R1', taskId: 'T1' });
ok('הגשת דיווח מסנכרנת אותו מיד', !!byId(writes, 'R1'));
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'gardenFeedback', { id: 'R2' }, { ok: true });
ok('משוב מסנכרן את הדיווח שקיבל אותו', !!byId(writes, 'R2'));
/* ⚠️ פעולה שנכשלה לא שינתה דבר — ואסור לה לכתוב. */
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'gardenTask', { id: 'T1' }, { ok: false, error: 'x' });
ok('⚠️ פעולה שנכשלה אינה מסנכרנת כלום', writes.length === 0, String(writes.length));
/* ⚠️ שגר ושכח: כישלון כתיבה ל-Firestore אינו מפיל את הפעולה. */
reset(); failOn = 'set';
let threw = false;
try { sandbox.gardenAfterWrite_(FAKE_SS, 'gardenTask', { id: 'T1' }, { ok: true }); }
catch (e) { threw = true; }
ok('🔴 כישלון סנכרון אינו זורק — הגיליון הוא המקור', !threw);

/* 🔴 gardenWrite_ מחזירה את תשובת המטפל כמו שהיא. */
reset();
const handlerRes = { ok: true, id: 'R1', extra: 'שמור' };
const back = sandbox.gardenWrite_(FAKE_SS, 'submitGardenReport', {}, function () { return handlerRes; });
ok('🔴 התשובה למשתמש עוברת ללא שינוי', back === handlerRes && back.extra === 'שמור');
reset(); failOn = 'set';
const back2 = sandbox.gardenWrite_(FAKE_SS, 'submitGardenReport', {}, function () { return { ok: true, id: 'R1' }; });
ok('🔴 וגם כשהסנכרון נכשל', back2 && back2.ok === true);

/* ================================================================= */
console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
