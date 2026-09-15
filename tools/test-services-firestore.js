/* בדיקות להעברת "שירותים לתושב" ל-Firestore (2026-09-15, צעד 04).
   הרצה:  node tools/test-services-firestore.js

   🔴 שתי נקודות שהמארז הזה שומר עליהן יותר מכל:
     1. **`עודכן ע"י` לא עובר ל-Firestore.** הוא אימייל של מנהל — מידע אישי
        של תושב, והקו האדום הוא שמידע כזה נשאר בגיליון.
     2. **הקריאה הישירה אינה רחבה יותר מהשרת.** `handleServices_` חוסם
        משתמש חיצוני (השער ב-authorize_), ולכן גם הכלל חייב לחסום אותו. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FSTORE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');

/* ================= צד השרת ================= */
let FAKE_SS, writes, deletes, listReply, failOn;
const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', formatDate: d => d.toISOString().substring(0, 10),
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => FAKE_SS, flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FSTORE, sandbox);

const SVC_H = ['מזהה שירות', 'שם', 'תיאור קצר', 'אייקון', 'ספק', 'טלפון ראשי',
               'קישור למסמך', 'סדר', 'פעיל', 'עודכן', 'עודכן ע"י', 'סוג שירות'];
const SEC_H = ['מזהה שירות', 'מזהה סעיף', 'סדר', 'סוג', 'כותרת', 'תוכן'];
function tbl(head, rows) {
  const v = [head].concat(rows);
  return { getLastRow: () => v.length, getLastColumn: () => head.length,
           getDataRange: () => ({ getValues: () => v }),
           getRange: () => ({ getValues: () => v, setValue() {}, setValues() {}, clearContent() {} }) };
}
const SVC_A = ['gas', 'גז', 'אספקת גז', 'flame', 'דורגז', '03-1234567', '', 1, 'כן', '2026-09-01', 'admin@x.com', ''];
const SVC_B = ['pool', 'בריכה', 'בריכת השיכון', 'wave', '', '', '', 2, 'כן', '2026-09-02', 'admin@x.com', 'תשתית'];
const SEC_1 = ['gas', 's1', 1, 'טקסט', 'איך מזמינים', 'מתקשרים'];
const SEC_2 = ['gas', 's2', 2, 'קישור', 'טופס', 'http://x'];
const SEC_3 = ['pool', 's3', 1, 'טקסט', 'שעות', '07:00-21:00'];

function setSheets(svc, sec) {
  const a = tbl(SVC_H, svc === undefined ? [SVC_A, SVC_B] : svc);
  const b = tbl(SEC_H, sec === undefined ? [SEC_1, SEC_2, SEC_3] : sec);
  FAKE_SS = { getSheetByName: n => n === sandbox.SERVICES_SHEET ? a
                               : n === sandbox.SERVICE_SECTIONS_SHEET ? b : null };
}
function reset(svc, sec) {
  writes = []; deletes = []; listReply = []; failOn = null;
  setSheets(svc, sec);
  sandbox.ensureServicesSheet_ = () => FAKE_SS.getSheetByName(sandbox.SERVICES_SHEET);
  sandbox.ensureServiceSectionsSheet_ = () => FAKE_SS.getSheetByName(sandbox.SERVICE_SECTIONS_SHEET);
  sandbox.fsSet_ = (p, o) => { if (failOn === 'set') throw new Error('כתיבה נכשלה (503)'); writes.push({ path: p, obj: o }); return {}; };
  sandbox.fsDelete_ = p => { if (failOn === 'delete') throw new Error('מחיקה נכשלה (503)'); deletes.push(p); return true; };
  sandbox.fsList_ = () => { if (failOn === 'list') throw new Error('רשימה נכשלה (503)'); return listReply; };
}
const isDate = x => !!x && typeof x.getTime === 'function';

section('1. רישום ותשתית');
reset();
ok('FS_SERVICES = services', sandbox.FS_SERVICES === 'services', sandbox.FS_SERVICES);
ok('servicesSyncAll_ קיימת', typeof sandbox.servicesSyncAll_ === 'function');
ok('handleServicesSync_ קיימת', typeof sandbox.handleServicesSync_ === 'function');
ok('הפעולה רשומה', 'servicesSync' in sandbox.GET_ACTION_PERMS);
ok('🔴 דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS.servicesSync === sandbox.PERM_SUPER);
ok('אינה ברשימת הפתוחות', sandbox.GET_PUBLIC_ACTIONS.indexOf('servicesSync') === -1);
ok('doGet מנתב אליה', /action === 'servicesSync'[\s\S]{0,80}handleServicesSync_/.test(CODE));

section('2. 🔴 מידע אישי אינו עובר');
reset();
const d = sandbox.svcClean_({ 'שם': 'גז', 'עודכן': '2026-09-01', 'עודכן ע"י': 'admin@x.com' });
ok('🔴 עודכן ע"י הושמט', !('עודכן ע"י' in d), Object.keys(d).join(','));
ok('עודכן (תאריך) נשמר', d['עודכן'] === '2026-09-01', String(d['עודכן']));
ok('שאר השדות נשמרים', d['שם'] === 'גז');
const full = sandbox.svcDoc_({ 'מזהה שירות': 'gas', 'עודכן ע"י': 'a@b.c' }, [{ 'תוכן': 'x', 'עודכן ע"י': 'a@b.c' }], 1);
ok('🔴 גם לא בתוך סעיף מקונן', !('עודכן ע"י' in full.sections[0]), Object.keys(full.sections[0]).join(','));
ok('🔴 ולא בשום מקום במסמך',
   JSON.stringify(full).indexOf('admin@') === -1 && JSON.stringify(full).indexOf('a@b.c') === -1,
   JSON.stringify(full).slice(0, 120));

section('3. מזהה מסמך');
ok('מזהה תקין', sandbox.fsIdOk_('gas') === true);
ok('🔴 מזהה עם / נפסל', sandbox.fsIdOk_('a/b') === false);
ok('ריק נפסל', sandbox.fsIdOk_('') === false && sandbox.fsIdOk_(null) === false);
ok('נקודה נפסלת', sandbox.fsIdOk_('.') === false && sandbox.fsIdOk_('..') === false);
ok('תבנית __x__ שמורה ונפסלת', sandbox.fsIdOk_('__x__') === false);
ok('ארוך מדי נפסל', sandbox.fsIdOk_('a'.repeat(201)) === false);
ok('רווחים נחתכים', sandbox.fsIdOk_('  gas  ') === true);

section('4. סנכרון מלא');
reset();
let r = sandbox.servicesSyncAll_(FAKE_SS);
ok('הצליח', r.ok === true, r.error);
ok('נכתבו שני מסמכים', r.wrote === 2, String(r.wrote));
ok('נתיב לפי מזהה השירות', writes[0].path === 'services/gas', writes[0].path);
ok('גם השני', writes[1].path === 'services/pool', writes[1].path);
ok('🔑 הסעיפים מקוננים בתוך השירות', writes[0].obj.sections.length === 2, String(writes[0].obj.sections.length));
ok('⚠️ וכל סעיף הולך לשירות שלו', writes[1].obj.sections.length === 1, String(writes[1].obj.sections.length));
ok('order נשמר לפי הסדר בגיליון', writes[0].obj.order === 1 && writes[1].obj.order === 2);
ok('schema ו-updatedAt', writes[0].obj.schema === 1 && isDate(writes[0].obj.updatedAt));
ok('שדות השירות נשמרים', writes[0].obj['ספק'] === 'דורגז' && writes[0].obj['טלפון ראשי'] === '03-1234567');
ok('לא נמחק כלום', r.deleted === 0 && r.skipped === 0);

section('4ב. יתומים ומזהים פסולים');
reset();
listReply = [{ id: 'gas' }, { id: 'pool' }, { id: 'old' }];
r = sandbox.servicesSyncAll_(FAKE_SS);
ok('יתום נמחק', r.deleted === 1 && deletes[0] === 'services/old', JSON.stringify(deletes));
reset([SVC_A, ['a/b', 'רע', '', '', '', '', '', 3, 'כן', '', '', '']], []);
r = sandbox.servicesSyncAll_(FAKE_SS);
ok('🔴 מזהה פסול מדולג ולא מפיל', r.ok === true && r.skipped === 1, JSON.stringify(r));
ok('⚠️ והשורה התקינה כן נכתבה', r.wrote === 1 && writes[0].path === 'services/gas', String(r.wrote));

section('4ג. אידמפוטנטיות וטאב ריק');
reset(); listReply = [{ id: 'gas' }, { id: 'pool' }];
const p1 = writes.map(w => w.path).join('|');
sandbox.servicesSyncAll_(FAKE_SS);
const a1 = writes.map(w => w.path).join('|');
reset(); listReply = [{ id: 'gas' }, { id: 'pool' }];
sandbox.servicesSyncAll_(FAKE_SS);
ok('הרצה חוזרת — אותם נתיבים', writes.map(w => w.path).join('|') === a1, a1);
reset([], []);
r = sandbox.servicesSyncAll_(FAKE_SS);
ok('טאב ריק לא נופל', r.ok === true && r.wrote === 0, JSON.stringify(r));

section('5. כישלון אינו מפיל');
reset(); failOn = 'set';
r = sandbox.servicesSyncAll_(FAKE_SS);
ok('ok=false ולא זריקה', r.ok === false && /503/.test(r.error), r.error);
reset(); failOn = 'list';
r = sandbox.servicesSyncAll_(FAKE_SS);
ok('כישלון רשימה נתפס', r.ok === false && /503/.test(r.error), r.error);
ok('⚠️ אך הכתיבות שהצליחו נספרות', r.wrote === 2, String(r.wrote));

section('6. חיווט ל-saveServices_');
const save = CODE.substring(CODE.indexOf('function saveServices_'), CODE.indexOf('function fsIdOk_'));
ok('saveServices_ מסנכרן', /servicesSyncAll_\(ss\)/.test(save));
/* ⚠️ אחרי הכתיבה לשני הטאבים — אחרת כישלון בגיליון היה משאיר Firestore
   עם נתון שאינו קיים. */
ok('⚠️ אחרי הכתיבה לטאב הסעיפים', save.indexOf('secSheet.getRange(2, 1, secGrid.length') < save.indexOf('servicesSyncAll_(ss)'));
ok('⚠️ ולפני ה-return', save.indexOf('servicesSyncAll_(ss)') < save.indexOf('return { ok: true, services:'));
ok('🔴 הסנכרון אינו יכול להכשיל שמירה', !/if\s*\(\s*!\s*servicesSyncAll_/.test(CODE));

section('7. המטפל');
const realAuth = sandbox.authorize_, realJson = sandbox.json_;
sandbox.json_ = o => o;
reset(); sandbox.authorize_ = () => ({ ok: false, error: 'אין הרשאה' });
let g = sandbox.handleServicesSync_({ session: 's' });
ok('🔴 ללא הרשאה נדחה', g.ok === false && g.error === 'אין הרשאה');
ok('🔴 ולא נכתב כלום', writes.length === 0);
reset(); sandbox.authorize_ = () => ({ ok: true, perm: { isSuper: true } });
listReply = [{ id: 'zz' }];
g = sandbox.handleServicesSync_({ session: 's' });
ok('עם הרשאה הצליח', g.ok === true && g.wrote === 2 && g.deleted === 1, JSON.stringify(g));
reset(); sandbox.authorize_ = () => { throw new Error('קרס'); };
ok('חריגה נתפסת', sandbox.handleServicesSync_({}).ok === false);
sandbox.authorize_ = realAuth; sandbox.json_ = realJson;

section('8. המסלול הישן לא נגע');
ok('handleServices_ קיימת', typeof sandbox.handleServices_ === 'function');
ok('עדיין מחזירה services ו-sections',
   /services: readTable_\(ss, SERVICES_SHEET\)/.test(CODE) && /sections: readTable_\(ss, SERVICE_SECTIONS_SHEET\)/.test(CODE));
ok('saveServices_ עדיין דורסת את עודכן ע"י מהמושב', /if \(who\) row\['עודכן ע"י'\] = who;/.test(CODE));

/* ================= צד הלקוח ================= */
section('9. הלקוח — שיטוח והזמנה');
let sheetCalls;
function build(opts) {
  opts = opts || {};
  sheetCalls = [];
  const sb = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout,
    Date, JSON, Math, parseInt, parseFloat, String, Number, isNaN, Object, Array, RegExp, Error,
    encodeURIComponent, decodeURIComponent };
  sb.window = sb;
  sb.document = { createElement: () => ({}), head: { appendChild() {} } };
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  /* ⚠️ pushConnected() דורש CBA.sheets.push וגם CBA.mock._source === "sheets".
     בלי שניהם viaSheets מחזירה "לא מחובר" והנפילה לאחור נראית כמו כישלון. */
  sb.CBA = { mock: { years: {}, currentYear: '', _source: 'sheets' },
    sheets: { get(q, cb) { sheetCalls.push(q.action); setTimeout(() => cb(opts.sheetsReply !== undefined ? opts.sheetsReply
                : { ok: true, services: [{ 'מזהה שירות': 'sheet1' }], sections: [{ 'מזהה סעיף': 'x' }] }), 1); },
              push() {}, postRead() {}, isConnected: () => opts.connected !== false, load() {} } };
  if (!opts.noFb) sb.CBA.fb = {
    readCollection: opts.readCollection || ((n, cb) => setTimeout(() => cb(null, [{ 'מזהה שירות': 'gas', order: 1, schema: 1, updatedAt: 'x', sections: [{ 'מזהה סעיף': 's1' }] }]), 1)),
    readDoc: (c, i, cb) => setTimeout(() => cb(null, {}), 1),
    authReady: opts.authReady || (cb => setTimeout(() => cb({ uid: 'U1' }), 1)),
    isReady: () => true, isDbReady: () => !!opts.warm };
  vm.createContext(sb); vm.runInContext(DS, sb);
  return sb;
}
const read = sb => new Promise(r => sb.CBA.data.getServices(r));

let sb = build({ readCollection: (n, cb) => setTimeout(() => cb(null, [
  { 'מזהה שירות': 'pool', 'שם': 'בריכה', order: 2, schema: 1, updatedAt: 'x', sections: [{ 'מזהה סעיף': 's3' }] },
  { 'מזהה שירות': 'gas', 'שם': 'גז', order: 1, schema: 1, updatedAt: 'x', sections: [{ 'מזהה סעיף': 's1' }, { 'מזהה סעיף': 's2' }] }
]), 1) });
(async function () {
  const res = await read(sb);
  ok('הצליח מ-Firestore', res.ok === true);
  ok('🔴 Apps Script לא נקרא', sheetCalls.length === 0, JSON.stringify(sheetCalls));
  ok('שני שירותים', res.services.length === 2, String(res.services.length));
  ok('⚠️ ממוין לפי order ולא לפי סדר ההחזרה', res.services[0]['מזהה שירות'] === 'gas',
     res.services.map(s => s['מזהה שירות']).join(','));
  ok('🔑 הסעיפים שוטחו למערך אחד', res.sections.length === 3, String(res.sections.length));
  ok('⚠️ ובסדר של השירותים', res.sections[0]['מזהה סעיף'] === 's1' && res.sections[2]['מזהה סעיף'] === 's3',
     res.sections.map(s => s['מזהה סעיף']).join(','));
  ok('🔴 שדות המסמך אינם דולפים לשירות',
     !('sections' in res.services[0]) && !('order' in res.services[0]) &&
     !('schema' in res.services[0]) && !('updatedAt' in res.services[0]),
     Object.keys(res.services[0]).join(','));
  ok('המדידה נרשמה', sb.CBA.perf.services.source === 'firestore', sb.CBA.perf.services.source);

  section('10. הלקוח — נפילה לאחור');
  const cases = [
    ['אין CBA.fb', { noFb: true }, 'disabled'],
    ['אין משתמש', { authReady: cb => setTimeout(() => cb(null), 1) }, 'no-user'],
    ['כלל דחה', { readCollection: (n, cb) => setTimeout(() => cb({ code: 'permission-denied' }), 1) }, 'permission-denied'],
    ['שגיאת רשת', { readCollection: (n, cb) => setTimeout(() => cb(new Error('boom')), 1) }, 'boom'],
    /* 🔴 אוסף ריק אינו הצלחה — כך נראה גם סנכרון שמעולם לא רץ, ו"אין שירותים"
       הוא מסך שקרי ולא מסך ריק. */
    ['אוסף ריק', { readCollection: (n, cb) => setTimeout(() => cb(null, []), 1) }, 'empty']
  ];
  for (const [name, opts, why] of cases) {
    const s2 = build(opts);
    const r2 = await read(s2);
    ok(name + ' → נפל ל-Apps Script', sheetCalls.join(',') === 'services', JSON.stringify(sheetCalls));
    ok('   …ותשובה תקינה', r2 && r2.ok === true && r2.services.length === 1);
    ok('   …והסיבה נרשמה', (s2.CBA.perf.services.why || '').indexOf(why) !== -1, s2.CBA.perf.services.why);
  }

  section('11. מטמון וקולבק');
  const s3 = build({});
  await read(s3);
  const before = sheetCalls.length;
  const again = await read(s3);
  ok('קריאה שנייה מהמטמון', again.ok === true && sheetCalls.length === before);
  let n = 0;
  const s4 = build({ readCollection: (c, cb) => setTimeout(() => cb(new Error('e')), 1) });
  s4.CBA.data.getServices(() => { n++; });
  await new Promise(r => setTimeout(r, 60));
  ok('🔴 קולבק אחד בלבד', n === 1, String(n));

  section('11ב. שני המסלולים מציגים אותו תאריך');
/* ⚠️ התא "עודכן" בגיליון הוא תאריך אמיתי. Apps Script מחזיר אותו
   כ-ISO מלא ("2026-09-13T07:00:00.000Z") ו-Firestore כ-"2026-09-13". זה נמדד
   בייצור: שלושה הפרשי שדה, כולם בעמודה הזו. המסך חותך ל-10 תווים
   ולכן שתי התשובות נראות זהה — מסלול נפילה-לאחור שנראה אחרת
   נראה למשתמש כמו באג. */
const SVCJS = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'services.js'), 'utf8');
ok('המסך חותך את "עודכן" ל-10 תווים',
   /updated: String\(r\["עודכן"\] \|\| ""\)\.trim\(\)\.slice\(0, 10\)/.test(SVCJS));
const iso = '2026-09-13T07:00:00.000Z', short = '2026-09-13';
ok('🔑 ISO מלא ותאריך קצר מגיעים לאותה תוצאה',
   iso.slice(0, 10) === short.slice(0, 10), iso.slice(0, 10) + ' vs ' + short.slice(0, 10));
ok('והצד השרת מפטר תאריך ל-yyyy-MM-dd', /yyyy-MM-dd/.test(CODE.substring(CODE.indexOf('function svcClean_'), CODE.indexOf('function svcDoc_'))));

section('12. מתג הביטול');
  ok('השורה קיימת ויחידה', (DS.match(/SERVICES_FROM_FIRESTORE = true/g) || []).length === 1);
  /* אחרי האיחוד (15.9) הדגל נבדק בתוך fsFirstRead, לפני המתנה לזהות. */
  ok('הדגל מועבר לשלד המשותף',
     /fsFirstRead\("services", SERVICES_FROM_FIRESTORE,/.test(DS));
  ok('והשלד בודק אותו לפני המתנה לזהות',
     DS.indexOf('if (!enabled || !CBA.fb') < DS.indexOf('CBA.fb.authReady(function (user)'));
  ok('getServices עובר דרך servicesRead', /function getServices\(cb\) \{[\s\S]{0,200}servicesRead\(cb\);/.test(DS));
  ok('🔴 קריאה אחת בלבד ל-action services', (DS.match(/action: "services"/g) || []).length === 1);

  console.log('\n' + '='.repeat(52));
  console.log('עברו: ' + pass + '   נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
