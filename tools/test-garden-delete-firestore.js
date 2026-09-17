/* מחיקה בגינון מגיעה ל-Firestore ולא רק לגיליון (2026-09-16).
   הרצה:  node tools/test-garden-delete-firestore.js

   🔴 המארז הזה נכתב סביב תקלה אמיתית: יועד מחק משימת גינון שלוש
   פעמים, קיבל "נמחקה", והמשימה חזרה במסך. הסיבה — מסך הניהול עבר
   לקרוא מ-Firestore, ו**הגשר שנבנה לכתיבה הוא upsert בלבד**:
   `gardenTaskSyncSome_` סורקת את הטאב ומעתיקה שורות, ואחרי מחיקה
   אין שורה, ולכן היא מחזירה 0 והמסמך נשאר חי.

   🔑 **מה שהופך בדיקה כאן לשימושית זו נקודת המדידה.** אסור לבדוק
      את מה שהשרת החזיר — `gardenTaskDelete_` החזירה `ok:true` גם
      כשהיה באג, וזו בדיוק הסיבה שהוא לא נתפס. הבדיקה מודדת
      **אילו קריאות DELETE יצאו ל-Firestore**.

   ⚠️ **הגיליון המזויף כאן מוחק שורות באמת** (`deleteRow` עושה splice),
      בניגוד למארזים האחרים שבהם הוא no-op. בלי זה הבדיקה לא הייתה
      נוגעת בבאג בכלל: הסנכרון היה מוצא את השורה ומעדכן את המסמך,
      והכול היה נראה תקין. */
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
const DS = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'dataService.js'), 'utf8');

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
  DriveApp: { getFileById: () => { throw new Error('אין קובץ'); } },
  CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {},
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FSTORE, sandbox);

const R_HEAD = sandbox.GARDEN_REPORT_HEADERS;
const T_HEAD = sandbox.GARDEN_TASK_HEADERS;
const L_HEAD = sandbox.GARDEN_LOG_HEADERS;
const YEAR = 'תשפ"ו';
const row = (head, obj) => head.map(h => (obj[h] === undefined ? '' : obj[h]));

/* גיליון מזויף שבאמת מוחק — ר' ההערה בראש הקובץ. */
function sheetOf(head, rows) {
  const v = [head].concat(rows);
  return {
    rows: v,
    getLastRow: () => v.length,
    getLastColumn: () => head.length,
    getDataRange: () => ({ getValues: () => v.map(r => r.slice()) }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => v.slice(r - 1, r - 1 + (nr || 1)).map(x => x.slice(c - 1, c - 1 + (nc || 1))),
      setValues() { return this; },
      setValue(x) { v[r - 1][c - 1] = x; },
      setFontWeight() { return this; }
    }),
    appendRow(r) { v.push(r); },
    deleteRow(n) { v.splice(n - 1, 1); }
  };
}

let FAKE_SS, writes, deletes, failOn, reports, tasks, log;
function reset() {
  writes = []; deletes = []; failOn = null;
  reports = sheetOf(R_HEAD, [
    row(R_HEAD, { 'מזהה': 'R1', 'מזהה משפחה': 'F100', 'כותרת': 'דשא גבוה',
                  'תמונות': 'u1, u2', 'מזהה משימה': 'T1', 'שנת תקציב': YEAR }),
    row(R_HEAD, { 'מזהה': 'R2', 'מזהה משפחה': 'F100', 'כותרת': 'עוד על אותה תקלה',
                  'מזהה משימה': 'T1', 'שנת תקציב': YEAR }),
    /* דיווח נקי של משפחה אחרת — היא זו שתמחק אותו בעצמה */
    row(R_HEAD, { 'מזהה': 'R3', 'מזהה משפחה': 'F200', 'כותרת': 'ענף שבור',
                  'מזהה משימה': 'T3', 'שנת תקציב': YEAR })
  ]);
  tasks = sheetOf(T_HEAD, [
    row(T_HEAD, { 'מזהה': 'T1', 'סוג': 'תקלה', 'כותרת': 'כיסוח', 'שבוע': '2026-09-13',
                  'שנת תקציב': YEAR }),
    /* משימה שלא נוגעים בה — חייבת לשרוד כל מחיקה */
    row(T_HEAD, { 'מזהה': 'T2', 'סוג': 'שגרה', 'כותרת': 'לא קשור', 'שנת תקציב': YEAR }),
    /* משימת R3 — טרייה לגמרי: בלי שבוע, בלי דגל, בלי סגירה */
    row(T_HEAD, { 'מזהה': 'T3', 'סוג': 'תקלה', 'כותרת': 'ענף', 'שנת תקציב': YEAR })
  ]);
  log = sheetOf(L_HEAD, []);
  FAKE_SS = {
    getSheetByName: n =>
        n === sandbox.GARDEN_REPORTS_SHEET ? reports
      : n === sandbox.GARDEN_TASKS_SHEET   ? tasks
      : n === sandbox.GARDEN_LOG_SHEET     ? log
      : n === 'הגדרות'                      ? sheetOf(['מפתח', 'ערך'], [['שנה נוכחית', YEAR]])
      : n === 'הגדרות מיילים'               ? sheetOf(['מפתח', 'נושא', 'גוף', 'הערה', 'תחום', 'פעיל'], [])
      : null,
    insertSheet: () => sheetOf(['מפתח'], [])
  };
  sandbox.fsSet_ = (p, o) => { writes.push(p); return {}; };
  sandbox.fsDelete_ = p => {
    if (failOn === 'delete') throw new Error('מחיקה נכשלה (503)');
    deletes.push(p); return true;
  };
  sandbox.fsList_ = () => [];
}
const hit = (arr, coll, id) =>
  arr.some(p => p.indexOf(coll + '/') !== -1 &&
                p.indexOf('/' + encodeURIComponent(id)) === p.length - ('/' + id).length);
const MGR = { isExternal: false, firstName: 'דני', family: 'המנהל', familyId: 'F900' };

/* ================================================================= */
section('1. הגשר קיים והמחיקות עוברות בו');
reset();
ok('gardenWrite_ קיימת', typeof sandbox.gardenWrite_ === 'function');
ok('gardenAfterWrite_ קיימת', typeof sandbox.gardenAfterWrite_ === 'function');
ok('gardenTaskDelete עטופה בנתב',
   /case 'gardenTaskDelete':\s*return json_\(gardenWrite_\(/.test(CODE));
ok('gardenReportDelete עטופה בנתב',
   /case 'gardenReportDelete':\s*return json_\(gardenWrite_\(/.test(CODE));
ok('אף פעולת גינון אינה נשארת מחוץ לגשר',
   !/case 'garden(TaskDelete|ReportDelete|Task|Merge|CreateTask|ApproveBatch|Feedback)':\s*return json_\(garden\w+_\(ss, body\)\)/
     .test(CODE));
ok('הגשר יודע לקרוא deletedTaskIds', /res\.deletedTaskIds/.test(CODE));
ok('הגשר יודע לקרוא deletedReportIds', /res\.deletedReportIds/.test(CODE));

/* ================================================================= */
section('2. מחיקת משימה — מה באמת יצא ל-Firestore');
reset();
let res = sandbox.gardenWrite_(FAKE_SS, 'gardenTaskDelete',
  { id: 'T1', why: 'שורת בדיקה', _perm: MGR }, sandbox.gardenTaskDelete_);
ok('הפעולה הצליחה', res && res.ok === true, res && res.error);
ok('השורה באמת ירדה מהגיליון', !tasks.rows.some(r => r[0] === 'T1'));
ok('🔴 יצאה מחיקה למסמך המשימה', hit(deletes, 'gardenTasks', 'T1'), JSON.stringify(deletes));
ok('🔴 יצאה מחיקה לשני הדיווחים שלה',
   hit(deletes, 'gardenReports', 'R1') && hit(deletes, 'gardenReports', 'R2'),
   JSON.stringify(deletes));
ok('⚠️ המשימה שנמחקה לא נכתבה מחדש', !hit(writes, 'gardenTasks', 'T1'), JSON.stringify(writes));
ok('⚠️ הדיווחים שנמחקו לא נכתבו מחדש',
   !hit(writes, 'gardenReports', 'R1') && !hit(writes, 'gardenReports', 'R2'));
ok('משימה שלא נגעו בה לא נמחקה', !hit(deletes, 'gardenTasks', 'T2'));
ok('דיווח של משפחה אחרת לא נמחק', !hit(deletes, 'gardenReports', 'R3'));
ok('נרשמה שורת יומן על המחיקה', log.rows.length > 0);

/* ================================================================= */
section('3. מחיקת דיווח ע"י התושב — שתי שורות, שני מסמכים');
reset();
res = sandbox.gardenWrite_(FAKE_SS, 'gardenReportDelete',
  { id: 'R3', _perm: { isExternal: false, familyId: 'F200', firstName: 'רון', family: 'לוי' } },
  sandbox.gardenReportDelete_);
ok('הפעולה הצליחה', res && res.ok === true, res && res.error);
ok('🔴 יצאה מחיקה למסמך הדיווח', hit(deletes, 'gardenReports', 'R3'), JSON.stringify(deletes));
ok('🔴 יצאה מחיקה גם למסמך המשימה שלו', hit(deletes, 'gardenTasks', 'T3'), JSON.stringify(deletes));
ok('אף אחד מהשניים לא נכתב מחדש',
   !hit(writes, 'gardenReports', 'R3') && !hit(writes, 'gardenTasks', 'T3'));
ok('⚠️ מזהה דיווח אינו מטופל כמזהה משימה',
   /action !== 'gardenReportDelete'\) addTask\(body\.id\)/.test(CODE.replace(/\s+/g, ' ')));

/* ================================================================= */
section('4. מה שאסור שיקרה');
reset();
res = sandbox.gardenWrite_(FAKE_SS, 'gardenTaskDelete',
  { id: 'לא-קיים', why: 'בדיקה', _perm: MGR }, sandbox.gardenTaskDelete_);
ok('מחיקה שנכשלה אינה מוחקת שום מסמך', res.ok === false && deletes.length === 0,
   JSON.stringify(deletes));

reset();
res = sandbox.gardenWrite_(FAKE_SS, 'gardenTaskDelete',
  { id: 'T1', why: 'בדיקה', _perm: { isExternal: true } }, sandbox.gardenTaskDelete_);
ok('גנן חיצוני נחסם ושום מסמך לא נמחק', res.ok === false && deletes.length === 0);

reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'gardenTask', { id: 'T1', op: 'note' }, { ok: true });
ok('פעולה שאינה מחיקה אינה מוחקת כלום', deletes.length === 0, JSON.stringify(deletes));
ok('אבל כן מסנכרנת את המשימה שנגעו בה', hit(writes, 'gardenTasks', 'T1'), JSON.stringify(writes));

/* ================================================================= */
section('5. שגר ושכח — כשל ב-Firestore לא מבטל מחיקה שהצליחה בגיליון');
reset();
failOn = 'delete';
res = sandbox.gardenWrite_(FAKE_SS, 'gardenTaskDelete',
  { id: 'T1', why: 'בדיקה', _perm: MGR }, sandbox.gardenTaskDelete_);
ok('התשובה למשתמש נשארה ok', res && res.ok === true, res && res.error);
ok('הגיליון — מקור האמת — נשאר נקי', !tasks.rows.some(r => r[0] === 'T1'));

/* ================================================================= */
section('6. משימות השגרה ממשיכות להיווצר');
const HOURLY = CODE.slice(CODE.indexOf('function hourlyJobsRun_'));
const iMat = HOURLY.indexOf('gardenMaterializeWeek_(ss, gardenWeekKey_())');
const iSync = HOURLY.indexOf('gardenDataSyncAll_(ss)');
ok('🔴 מימוש השבוע נקרא מהטריגר השעתי', iMat !== -1);
ok('⚠️ והוא רץ לפני סנכרון נתוני הגינון', iMat !== -1 && iSync !== -1 && iMat < iSync,
   iMat + ' / ' + iSync);
ok('הוא עדיין נקרא גם מהמסלול הישן',
   (CODE.match(/gardenMaterializeWeek_\(ss,/g) || []).length >= 2);

/* ================================================================= */
section('7. רשימות האזורים מתרעננות לבד');
const GDS = CODE.slice(CODE.indexOf('function gardenDataSyncAll_'),
                       CODE.indexOf('function handleGardenDataSync_'));
ok('gardenDataSyncAll_ כותבת את מסמך הרשימות', /FS_GARDEN_META/.test(GDS));
ok('והיא בטריגר השעתי', /gardenDataSyncAll_\(ss\)/.test(HOURLY));

/* ================================================================= */
section('8. המוקשים מתועדים — זה מה שימנע את הבאג הבא');
const SOME = CODE.slice(CODE.indexOf('function gardenTaskSyncSome_') - 1200,
                        CODE.indexOf('function gardenTaskSyncSome_'));
ok('⚠️ כתוב במפורש ש-gardenTaskSyncSome_ היא upsert בלבד', /upsert/.test(SOME));
ok('⚠️ וכתוב מה פעולה מוחקת חייבת להחזיר', /deletedTaskIds/.test(SOME));

/* ================================================================= */
section('9. יומן המשימה אינו נקרא מאוסף ריק');
ok('🔴 אין בשרת שום כתיבה לאוסף gardenLog',
   !/fsDocPath_\(\s*['"]gardenLog['"]/.test(CODE) && !/FS_GARDEN_LOG/.test(CODE));
ok('ולכן הלקוח קורא אותו מ-Apps Script',
   /fsFirstRead\("gardenLog", false/.test(DS));

/* ================================================================= */
section('10. יצירת משימה מגיעה ל-Firestore מיד');
/* 🔴 נתפס חי 16.9: `gardenCreateTask_` מחזירה את המזהה החדש
   ב-`res.id`, והגשר חיפש אותו ב-`res.taskId` או ב-`body.id`. שניהם
   אינם קיימים בבקשת יצירה — ולכן המשימה לא הופיעה במסך. */
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'gardenCreateTask', { title: 'משימה' }, { ok: true, id: 'T2' });
ok('🔴 משימה שנפתחה נכתבת ל-Firestore', hit(writes, 'gardenTasks', 'T2'), JSON.stringify(writes));
ok('ולא נמחק שום מסמך', deletes.length === 0);
reset();
sandbox.gardenAfterWrite_(FAKE_SS, 'submitGardenReport', { }, { ok: true, id: 'R1', taskId: 'T1' });
ok('⚠️ בדיווח תושב `res.id` נשאר מזהה דיווח',
   hit(writes, 'gardenReports', 'R1') && hit(writes, 'gardenTasks', 'T1'), JSON.stringify(writes));

/* ================================================================= */
section('11. מימוש השבוע לא מקצה מזהה פעמיים');
/* ⚠️ הפונקציה ארוכה מ-4,000 תווים עם ההערות — חיתוך קצר מדי
   החזיר כאן ‎-1 על `nextGardenId_` והפיל בדיקה תקינה. */
const MAT_I = CODE.indexOf('function gardenMaterializeWeek_');
const MAT = CODE.slice(MAT_I, CODE.indexOf('\nfunction ', MAT_I + 10));
ok('🔴 הפונקציה לוקחת נעילה', /LockService\.getScriptLock\(\)/.test(MAT));
/* ⚠️ מחפשים את **קריאת הקוד** ולא את השם — השם מופיע גם
   בהערה שמעל הנעילה, והבדיקה נכשלה על קוד תקין לגמרי. */
/* ⚠️ 17.9 — ההקצאה עברה ל-`gardenAllocId_` (ממצא 21: המונה ולא הגיליון).
   הכלל שנבדק כאן לא השתנה — הנעילה עדיין חייבת להיסגר **לפני** ההקצאה —
   ורק שם הקריאה התעדכן. */
ok('⚠️ הנעילה נלקחת לפני הקצאת המזהה',
   MAT.indexOf('tryLock') !== -1 &&
   MAT.indexOf('tryLock') < MAT.indexOf('var nextId = gardenAllocId_'));
ok('🔴 וההקצאה עצמה היא מהמונה', /var nextId = gardenAllocId_\(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_COUNTER\);/.test(MAT));
ok('ומשוחררת ב-finally', /finally \{ mLock\.releaseLock\(\); \}/.test(MAT));
/* נעילה תפוסה — מדלגים בשקט ולא מתרסקים ולא כותבים. */
reset();
const realLock = sandbox.LockService;
sandbox.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {}, tryLock: () => false }) };
let matRes;
try { matRes = sandbox.gardenMaterializeWeek_(FAKE_SS, '2999-01-03'); }
catch (e) { matRes = 'threw:' + e; }
sandbox.LockService = realLock;
ok('⚠️ נעילה תפוסה = דילוג שקט, בלי שגיאה', matRes === 0, String(matRes));

/* ================================================================= */
console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
