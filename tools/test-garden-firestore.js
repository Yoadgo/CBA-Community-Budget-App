/* בדיקות לסנכרון תוכנית העבודה ל-Firestore (2026-09-14, צעד 03א).
   הרצה:  node tools/test-garden-firestore.js

   🔴 זהו **התחום הראשון שעובר** לקריאה ישירה מהדפדפן, ולכן המארז הזה בודק
   שני דברים שונים באופיים:
     1. **נאמנות** — שהמסמך ב-Firestore זהה למה ש-handleGardenPlan_ היה
        מחזיר. סטייה כאן אינה שגיאה שנראית; היא מסך שמראה נתון אחר.
     2. **אי-הפרעה** — שכישלון סנכרון לא מפיל שמירה לגיליון. הגיליון הוא
        מקור האמת, ו-Firestore הוא עותק; עותק שנכשל לא רשאי לבטל מקור. */
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

let fetchQueue, fetchLog;
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
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
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

/* ⚠️ reset() מחליפה את fsList_ בבובה, ולכן שומרים כאן את המקורית — סעיף 7
   בודק את הפונקציה האמיתית ולא את הבובה של עצמנו. */
const REAL_fsList = sandbox.fsList_;

/* ---------- גיליון מזויף ---------- */
const HEAD = ['מזהה', 'שם משימה', 'קטגוריה', 'אזורים', 'תדירות', 'שבוע ראשון',
              'שבוע בחודש', 'חודשים פעילים', 'סבב אזורים', 'סעיף בתוכנית', 'פעיל', 'הערות'];
function fakeSheet(rows) {
  const v = [HEAD].concat(rows);
  return {
    getLastRow: () => v.length,
    getLastColumn: () => HEAD.length,
    getDataRange: () => ({ getValues: () => v }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => v.slice(r - 1, r - 1 + (nr || 1)).map(x => x.slice(c - 1, c - 1 + (nc || 1))),
      setValue() {}, setValues() {}
    }),
    appendRow() {}, deleteRow() {}
  };
}
const ROW_A = ['T1', 'כיסוח דשא', 'גינון', 'צפונית, מרכזית', 'שבועי', '2026-01-05',
               1, '4-10', 'כן', '23.2', 'כן', 'לפני 08:00'];
const ROW_B = ['T2', 'בדיקת השקיה', 'השקיה', 'דרומית', 'חודשי', '', 2, '', '', '23.4', 'לא', ''];
const SETTINGS = [
  ['אזור', '', '', 'צפונית', 'כן'],
  ['אזור', '', '', 'דרומית', 'כן'],
  ['אזור', '', '', 'ישנה', 'לא'],
  ['קטגוריה', '', '', 'גינון', 'כן']
];
let FAKE_SS;
function setSheet(rows) {
  const routine = fakeSheet(rows);
  const settings = {
    getLastRow: () => SETTINGS.length + 1,
    getDataRange: () => ({ getValues: () => [['סוג', '', '', 'ערך', 'פעיל']].concat(SETTINGS) })
  };
  FAKE_SS = {
    getSheetByName: n => n === sandbox.GARDEN_ROUTINE_SHEET ? routine
                       : n === sandbox.GARDEN_SETTINGS_SHEET ? settings : null
  };
  return FAKE_SS;
}

let writes, deletes, listReply, failOn;
function reset(rows) {
  writes = []; deletes = []; fetchLog = []; fetchQueue = [];
  listReply = []; failOn = null;
  setSheet(rows === undefined ? [ROW_A, ROW_B] : rows);
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
const isDate = x => !!x && typeof x.getTime === 'function';

/* ================================================================= */
section('1. שמות ותשתית');
reset();
ok('FS_GARDEN_PLAN = gardenPlan', sandbox.FS_GARDEN_PLAN === 'gardenPlan', sandbox.FS_GARDEN_PLAN);
ok('FS_GARDEN_META = gardenMeta/lists', sandbox.FS_GARDEN_META === 'gardenMeta/lists', sandbox.FS_GARDEN_META);
ok('gardenPlanDoc_ קיימת', typeof sandbox.gardenPlanDoc_ === 'function');
ok('gardenPlanSyncAll_ קיימת', typeof sandbox.gardenPlanSyncAll_ === 'function');
ok('gardenPlanSyncOne_ קיימת', typeof sandbox.gardenPlanSyncOne_ === 'function');
ok('gardenPlanSyncDelete_ קיימת', typeof sandbox.gardenPlanSyncDelete_ === 'function');
ok('נקודת הרצה ידנית ללא קו תחתי', typeof sandbox.gardenPlanSeedFirestore === 'function');
ok('fsList_ קיימת ב-Firestore.gs', /function fsList_\(/.test(FSTORE));

/* ================================================================= */
section('2. נאמנות המסמך — gardenPlanDoc_');
reset();
const defs = sandbox.gardenPlanRows_(FAKE_SS);
ok('הגיליון המזויף מפיק שתי הגדרות', defs.length === 2, String(defs.length));
const dA = sandbox.gardenPlanDoc_(defs[0]);
ok('id נשמר כפי שהוא', dA.id === 'T1', dA.id);
ok('title', dA.title === 'כיסוח דשא', dA.title);
ok('category', dA.category === 'גינון', dA.category);
ok('areas הוא מערך מפוצל', Array.isArray(dA.areas) && dA.areas.length === 2, JSON.stringify(dA.areas));
ok('areas ללא רווחים מיותרים', dA.areas[1] === 'מרכזית', JSON.stringify(dA.areas));
ok('freq', dA.freq === 'שבועי', dA.freq);
ok('firstWeek', dA.firstWeek === '2026-01-05', dA.firstWeek);
ok('weekOfMonth מספר', dA.weekOfMonth === 1, String(dA.weekOfMonth));
ok('months כמחרוזת', dA.months === '4-10', dA.months);
ok('rotate בוליאני אמת', dA.rotate === true, String(dA.rotate));
ok('clause', dA.clause === '23.2', dA.clause);
ok('active בוליאני אמת', dA.active === true, String(dA.active));
ok('note', dA.note === 'לפני 08:00', dA.note);
ok('schema = 1 (כלל היברידיות 3)', dA.schema === 1, String(dA.schema));
ok('updatedAt הוא תאריך', isDate(dA.updatedAt), typeof dA.updatedAt);
/* ⚠️ מספר השורה בגיליון מתיישן ברגע שמוסיפים שורה מעליה. מסמך שנושא אותו
   נראה תקין וגורם למחיקה של הפריט הלא נכון. */
ok('🔴 row אינו נשמר במסמך', !('row' in dA), Object.keys(dA).join(','));
/* אבל אותו מספר כן נשמר כ-`order` — רמז לסדר תצוגה בלבד, כדי
   שמסלול Firestore ומסלול הנפילה-לאחור יראו זהה על המסך. */
ok('order נשמר (רמז סדר)', dA.order === defs[0].row, String(dA.order) + ' vs ' + String(defs[0].row));
ok('order של השורה השנייה גדול יותר',
   sandbox.gardenPlanDoc_(defs[1]).order > dA.order,
   dA.order + ' -> ' + sandbox.gardenPlanDoc_(defs[1]).order);
const dB = sandbox.gardenPlanDoc_(defs[1]);
ok('active=false נשמר כ-false ולא כמחרוזת', dB.active === false, String(dB.active));
ok('rotate=false כשהעמודה ריקה', dB.rotate === false, String(dB.rotate));
ok('firstWeek ריק נשאר מחרוזת ריקה', dB.firstWeek === '', JSON.stringify(dB.firstWeek));
ok('weekOfMonth=2', dB.weekOfMonth === 2, String(dB.weekOfMonth));

section('2ב. שום שדה אינו מידע אישי (הקו האדום של יועד)');
const ALLOWED = ['id','title','category','areas','freq','firstWeek','weekOfMonth',
                 'months','rotate','clause','active','note','order','schema','updatedAt'];
const extra = Object.keys(dA).filter(k => ALLOWED.indexOf(k) === -1);
ok('🔴 אין שדה מעבר לרשימה המאושרת', extra.length === 0, extra.join(','));
ok('🔴 אין שדה ששמו מרמז על אדם',
   !Object.keys(dA).some(k => /name|email|phone|resident|family|uid/i.test(k)),
   Object.keys(dA).join(','));

/* ================================================================= */
section('3. סנכרון מלא');
reset();
let r = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('הצליח', r.ok === true, r.error);
ok('נכתבו 3 מסמכים (2 שורות + רשימות)', r.wrote === 3, String(r.wrote));
ok('נתיב המסמך הוא המזהה מהגיליון', writes[0].path === 'gardenPlan/T1', writes[0].path);
ok('גם השני', writes[1].path === 'gardenPlan/T2', writes[1].path);
ok('מסמך הרשימות אחרון', writes[2].path === 'gardenMeta/lists', writes[2].path);
ok('רשימת האזורים מסוננת לפעילים בלבד',
   JSON.stringify(writes[2].obj.areas) === '["צפונית","דרומית"]', JSON.stringify(writes[2].obj.areas));
ok('הקטגוריות נשמרות', JSON.stringify(writes[2].obj.categories) === '["גינון"]',
   JSON.stringify(writes[2].obj.categories));
ok('התדירויות נשמרות (הלקוח צריך אותן לטופס)',
   JSON.stringify(writes[2].obj.freqs) === JSON.stringify(sandbox.GARDEN_FREQS),
   JSON.stringify(writes[2].obj.freqs));
ok('גם למסמך הרשימות יש schema ו-updatedAt',
   writes[2].obj.schema === 1 && isDate(writes[2].obj.updatedAt));
ok('לא נמחק כלום כשאין יתומים', r.deleted === 0, String(r.deleted));

section('3ב. יתומים');
reset();
listReply = [{ id: 'T1' }, { id: 'T2' }, { id: 'T9' }];
r = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('היתום זוהה', r.deleted === 1, String(r.deleted));
ok('⚠️ נמחק היתום ולא אחד מהחיים', deletes.length === 1 && deletes[0] === 'gardenPlan/T9',
   JSON.stringify(deletes));
ok('הסנכרון עדיין מדווח הצלחה', r.ok === true, r.error);

section('3ג. הרצה חוזרת דורסת ולא מכפילה');
reset();
listReply = [{ id: 'T1' }, { id: 'T2' }];
const r1 = sandbox.gardenPlanSyncAll_(FAKE_SS);
const paths1 = writes.map(w => w.path).join('|');
reset();
listReply = [{ id: 'T1' }, { id: 'T2' }];
const r2 = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('אותם נתיבים בדיוק', writes.map(w => w.path).join('|') === paths1, writes.map(w => w.path).join('|'));
ok('אותו מספר כתיבות', r2.wrote === r1.wrote, r1.wrote + ' vs ' + r2.wrote);
ok('ולא נמחק כלום', r2.deleted === 0, String(r2.deleted));

section('3ד. טאב ריק');
reset([]);
r = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('לא נופל', r.ok === true, r.error);
ok('נכתב רק מסמך הרשימות', r.wrote === 1, String(r.wrote));
/* ⚠️ טאב ריק אינו סימן לבעיה — כך נראית תוכנית לפני שהוזנה. אסור שיגרור
   מחיקה המונית **אלא** אם Firestore באמת מכיל יתומים; וזה בדיוק המצב. */
reset([]);
listReply = [{ id: 'T1' }];
r = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('יתום נמחק גם כשהטאב ריק', r.deleted === 1, String(r.deleted));

/* ================================================================= */
section('4. כישלון אינו מפיל');
reset();
failOn = 'set';
r = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('מחזיר ok=false ולא זורק', r.ok === false);
ok('השגיאה מדווחת', /503/.test(r.error), r.error);
reset();
failOn = 'list';
r = sandbox.gardenPlanSyncAll_(FAKE_SS);
ok('כישלון רשימה נתפס', r.ok === false && /503/.test(r.error), r.error);
ok('⚠️ אך הכתיבות שכן הצליחו נספרות', r.wrote === 3, String(r.wrote));
reset();
failOn = 'set';
ok('gardenPlanSyncOne_ מחזירה false ולא זורקת', sandbox.gardenPlanSyncOne_(FAKE_SS, 'T1') === false);
reset();
failOn = 'delete';
ok('gardenPlanSyncDelete_ מחזירה false ולא זורקת', sandbox.gardenPlanSyncDelete_('T1') === false);

/* ================================================================= */
section('5. סנכרון מסמך אחד');
reset();
ok('מסמך קיים מסונכרן', sandbox.gardenPlanSyncOne_(FAKE_SS, 'T2') === true);
ok('נכתב מסמך אחד בלבד', writes.length === 1, String(writes.length));
ok('לנתיב הנכון', writes[0].path === 'gardenPlan/T2', writes[0].path);
/* אותה נקודת המרה — לא שכפול של המיפוי. זה מה שמונע שדה שמתעדכן במסלול
   אחד ולא בשני. */
ok('⚠️ אותה צורה כמו בסנכרון המלא',
   JSON.stringify(Object.keys(writes[0].obj)) === JSON.stringify(Object.keys(dB)),
   JSON.stringify(Object.keys(writes[0].obj)));
reset();
ok('מזהה שאינו בגיליון מחזיר false', sandbox.gardenPlanSyncOne_(FAKE_SS, 'T99') === false);
ok('ולא נכתב כלום', writes.length === 0, String(writes.length));
reset();
ok('מזהה ריק מחזיר false', sandbox.gardenPlanSyncOne_(FAKE_SS, '') === false);
ok('מזהה undefined מחזיר false', sandbox.gardenPlanSyncOne_(FAKE_SS, undefined) === false);
ok('ולא נכתב כלום', writes.length === 0, String(writes.length));
reset();
ok('מחיקה עם מזהה ריק מחזירה false', sandbox.gardenPlanSyncDelete_('') === false);
ok('ולא נמחק כלום', deletes.length === 0, String(deletes.length));
reset();
ok('מחיקה תקינה', sandbox.gardenPlanSyncDelete_('T1') === true);
ok('לנתיב הנכון', deletes[0] === 'gardenPlan/T1', deletes[0]);

/* ================================================================= */
section('6. חיווט למסלולי הכתיבה');
/* בדיקה מבנית על המקור: הקריאה לסנכרון חייבת לשבת **אחרי** הכתיבה לגיליון.
   אם היא תשב לפניה, כישלון בגיליון יותיר Firestore עם נתון שאינו קיים. */
const save = CODE.substring(CODE.indexOf('function gardenPlanSave_'),
                            CODE.indexOf('function gardenPlanSetActive_'));
ok('gardenPlanSave_ — מסלול העדכון מסנכרן', /setValue\(vals\[k\]\)[\s\S]{0,200}gardenPlanSyncOne_\(ss, id\)/.test(save));
ok('⚠️ אחרי ההחזרה? לא — לפני ה-return',
   save.indexOf('gardenPlanSyncOne_(ss, id)') < save.indexOf('return { ok: true, id: id }'));
ok('gardenPlanSave_ — מסלול היצירה מסנכרן', /appendRow\(row\);[\s\S]{0,80}gardenPlanSyncOne_\(ss, newId\)/.test(save));
ok('⚠️ אחרי appendRow ולא לפניו',
   save.indexOf('appendRow(row)') < save.indexOf('gardenPlanSyncOne_(ss, newId)'));
const act = CODE.substring(CODE.indexOf('function gardenPlanSetActive_'),
                           CODE.indexOf('function gardenPlanSetActive_') + 900);
ok('gardenPlanSetActive_ מסנכרן', /gardenPlanSyncOne_\(ss,/.test(act));
ok('⚠️ אחרי setValue של העמודה "פעיל"',
   act.indexOf("setValue(body.active") < act.indexOf('gardenPlanSyncOne_'));
const del = CODE.substring(CODE.indexOf('function gardenPlanDelete_'),
                           CODE.indexOf('function gardenPlanFindRow_'));
ok('gardenPlanDelete_ מוחק גם מ-Firestore', /deleteRow\(row\);[\s\S]{0,80}gardenPlanSyncDelete_\(id\)/.test(del));
ok('⚠️ אחרי deleteRow ולא לפניו',
   del.indexOf('deleteRow(row)') < del.indexOf('gardenPlanSyncDelete_'));
ok('🔴 אף מסלול אינו מחזיר שגיאה בגלל הסנכרון',
   !/gardenPlanSync(One|Delete)_\([^)]*\)\s*(\?|&&|\|\|)/.test(CODE) &&
   !/if\s*\(\s*!\s*gardenPlanSync/.test(CODE));

/* ================================================================= */
section('7. fsList_ — דפדוף וזיהוי');
reset();
sandbox.fsProjectId_ = () => 'proj';
sandbox.fsToken_ = () => 'tok';
fetchQueue = [
  { code: 200, body: JSON.stringify({
      documents: [{ name: 'projects/p/databases/(default)/documents/gardenPlan/T1',
                    fields: { title: { stringValue: 'א' } } }],
      nextPageToken: 'PAGE2' }) },
  { code: 200, body: JSON.stringify({
      documents: [{ name: 'projects/p/databases/(default)/documents/gardenPlan/T2', fields: {} }] }) }
];
const list = REAL_fsList('gardenPlan');
ok('שני דפים אוחדו', list.length === 2, String(list.length));
ok('המזהה נחתך מסוף הנתיב', list[0].id === 'T1', list[0].id);
ok('גם השני', list[1].id === 'T2', list[1].id);
ok('הנתונים פוענחו', list[0].data.title === 'א', JSON.stringify(list[0].data));
ok('שתי קריאות רשת', fetchLog.length === 2, String(fetchLog.length));
ok('⚠️ הדף השני נשלח עם pageToken', /pageToken=PAGE2/.test(fetchLog[1].url), fetchLog[1].url);
ok('בשיטת get', fetchLog[0].method === 'get', fetchLog[0].method);
reset();
sandbox.fsProjectId_ = () => 'proj';
sandbox.fsToken_ = () => 'tok';
fetchQueue = [{ code: 200, body: '{}' }];
ok('אוסף ריק מחזיר מערך ריק', JSON.stringify(REAL_fsList('gardenPlan')) === '[]');
reset();
sandbox.fsProjectId_ = () => 'proj';
sandbox.fsToken_ = () => 'tok';
fetchQueue = [{ code: 403, body: 'denied' }];
let threw = false;
try { REAL_fsList('gardenPlan'); } catch (e) { threw = /403/.test(e.message); }
ok('כישלון HTTP זורק עם הקוד', threw);

/* ================================================================= */
section('8. הנתיב ב-Apps Script לא נגע');
/* 🔴 כלל מס' 1 של המעבר: שום שלב לא שובר את הקיים. handleGardenPlan_ חייב
   להישאר עובד במלואו — הוא מסלול הנפילה לאחור של צעד 03. */
ok('handleGardenPlan_ עדיין קיימת', typeof sandbox.handleGardenPlan_ === 'function');
ok('עדיין מחזירה defs', /defs:\s*gardenPlanRows_\(ss\)/.test(CODE));
ok('עדיין מחזירה areas ו-categories', /areas:\s*lists\.areas/.test(CODE) && /categories:\s*lists\.categories/.test(CODE));
ok('עדיין חוסמת משתמש חיצוני',
   /handleGardenPlan_[\s\S]{0,600}isExternal[\s\S]{0,120}בסמכות מנהל הגינון/.test(CODE));
ok('gardenPlan עדיין דורשת PERM_GARDEN', sandbox.GET_ACTION_PERMS.gardenPlan === sandbox.PERM_GARDEN,
   String(sandbox.GET_ACTION_PERMS.gardenPlan));

/* ================================================================= */
section('9. פעולת הסנכרון gardenPlanSync');
/* ⚠️ נולדה מתקלה אמיתית: בורר הפונקציות בעורך Apps Script נכשל
   בשקט והריץ פונקציה בעלת שם דומה (seedGardenPlan). כתובת מפורשת
   אי אפשר לבלבל. */
ok('רשומה ב-GET_ACTION_PERMS', 'gardenPlanSync' in sandbox.GET_ACTION_PERMS);
ok('🔴 דורשת PERM_SUPER ולא PERM_GARDEN',
   sandbox.GET_ACTION_PERMS.gardenPlanSync === sandbox.PERM_SUPER,
   String(sandbox.GET_ACTION_PERMS.gardenPlanSync));
ok('אינה ברשימת הפעולות הפתוחות',
   sandbox.GET_PUBLIC_ACTIONS.indexOf('gardenPlanSync') === -1);
ok('doGet מנתב אליה',
   /action === 'gardenPlanSync'[\s\S]{0,80}handleGardenPlanSync_/.test(CODE));
ok('המטפל קיים', typeof sandbox.handleGardenPlanSync_ === 'function');

const realAuth = sandbox.authorize_;
const realJson = sandbox.json_;
sandbox.json_ = o => o;
reset();
sandbox.authorize_ = () => ({ ok: false, error: 'אין הרשאה' });
let g = sandbox.handleGardenPlanSync_({ session: 's' });
ok('🔴 ללא הרשאה — נדחית', g.ok === false && g.error === 'אין הרשאה', JSON.stringify(g));
ok('🔴 ולא נכתב כלום', writes.length === 0, String(writes.length));
reset();
sandbox.authorize_ = () => ({ ok: true, perm: { isSuper: true } });
listReply = [{ id: 'T7' }];
g = sandbox.handleGardenPlanSync_({ session: 's' });
ok('עם הרשאה — הצליחה', g.ok === true, JSON.stringify(g));
ok('מחזירה מספר כתיבות', g.wrote === 3, String(g.wrote));
ok('ומספר מחיקות', g.deleted === 1, String(g.deleted));
reset();
sandbox.authorize_ = () => ({ ok: true, perm: { isSuper: true } });
failOn = 'set';
g = sandbox.handleGardenPlanSync_({ session: 's' });
ok('כישלון מדווח ולא זורק', g.ok === false && /503/.test(g.error), JSON.stringify(g));
reset();
sandbox.authorize_ = () => { throw new Error('קרס'); };
g = sandbox.handleGardenPlanSync_({ session: 's' });
ok('חריגה נתפסת', g.ok === false && /קרס/.test(g.error), JSON.stringify(g));
sandbox.authorize_ = realAuth;
sandbox.json_ = realJson;

/* ================================================================= */
console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
