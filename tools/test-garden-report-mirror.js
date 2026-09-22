/* המראה משימה ← דיווח, והדיווחים שקפאו   (2026-09-22)
   הרצה:  node tools/test-garden-report-mirror.js

   🔴 הבאג שנצפה חי (יועד, דיווחים 21 ו-22): מנהל סגר "בוטל" /
   "לא רלוונטי", ובצד התושב לא זז כלום — הבר תקוע בנקודה הראשונה,
   משפט המצב ריק, וההסבר שנשלח במייל לא הופיע באפליקציה.

   🔴 שלושה דברים שיכולים להישבר כאן **בשקט**, וכל אחד מהם הוא באג חי:

   1. **המראה שמדלגת.** `gardenFsTask` כותבת ל-`gardenTasks` בלבד.
      מסך התושב קורא `gardenReports`. בלי ההעתקה אין שום קשר בין
      השניים, והמסך נראה תקין לגמרי — הוא פשוט מציג נתון ישן.

   2. **שאילתה במקום כתיבה ישירה.** מפתה לשאול "אילו דיווחים
      מצביעים למשימה" ולעדכן את כולם. `canSeeGardenReport` מתיר
      קריאה **רק למשפחה של הדיווח**, גם למנהל-על — כלומר השאילתה
      נדחית, ה-callback מקבל שגיאה, ואף דיווח לא מתעדכן. כלל
      ה**כתיבה** `grTeamUpdateOk` כן פתוח לצוות, ולכן `set(merge)`
      על `gardenTasks.repId` הוא המסלול היחיד שעובד.

   3. **שדה חסר שנקרא כ"ריק".** מסמך דיווח שנולד בדפדפן אינו נושא
      `stage` כלל (כלל `grShapeOk` אוסר על התושב לשלוח אותו).
      `stageIdx(undefined)` הוא 0 — ולכן הבר "עובד" ונראה נכון —
      אבל `stage === "התקבל"` הוא false, ולכן **כפתור המחיקה נעלם**.
      זו בדיוק התלונה השנייה של יועד, מאותו שורש. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 400) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DS = R('js/data/dataService.js');
const RG = R('js/screens/resGarden.js');
const SS = R('js/screens/sysStatus.js');
const RULES = R('firestore.rules');

/* ---------- סביבה ---------- */
function env(opts) {
  opts = opts || {};
  const log = [];
  const merges = {};
  const sb = { console: { log() {}, error() {}, warn() {} } };
  sb.window = sb;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb.document = { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                  createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                  head: { appendChild() {} }, body: { appendChild() {} }, hidden: false };
  sb.navigator = { onLine: true }; sb.addEventListener = () => {}; sb.location = { href: 'https://x/' };
  sb.CBA = {
    esc: s => String(s), isSuper: true, perms: ['גינון'],
    user: { familyId: '1', firstName: 'מ', family: 'נהל', isExternal: !!opts.external },
    mock: { currentYear: 'תשפ"ז' },
    sheets: { postRead: (a, p, cb) => { log.push('post:' + a); cb && cb({ ok: true }); },
              get: (p, cb) => { log.push('get:' + p.action); cb && cb({ ok: true }); },
              markDirty() {}, clearDirty() {}, isConnected: () => true },
    ui: { toast() {} },
    fb: {
      authReady: cb => cb({ uid: 'u' }),
      ensureDb: cb => cb(null),
      uid: () => 'u',
      flag: (k, d) => (opts.flags && k in opts.flags) ? opts.flags[k] : d,
      serverNow: () => 'SERVER_TS',
      nextId: (k, cb) => cb(null, 99),
      readDoc: (c, id, cb) => { log.push('read:' + c + '/' + id); cb(null, (opts.docs || {})[c + '/' + id] || null); },
      readCollection: (c, cb) => { log.push('readAll:' + c); cb(null, (opts.all || {})[c] || []); },
      queryCollection: (c, f, cb) => { log.push('query:' + c); cb(null, (opts.query || {})[c] || []); },
      createDoc: (c, id, d, cb) => { log.push('create:' + c + '/' + id); cb(null); },
      updateDoc: (c, id, f, cb) => { log.push('update:' + c + '/' + id); sb.__taskPatch = f; cb(null); },
      mergeDoc: (c, id, f, cb) => { log.push('merge:' + c + '/' + id); merges[c + '/' + id] = f; cb(null); },
      deleteDoc: (c, id, cb) => { log.push('delete:' + c + '/' + id); cb(null); }
    }
  };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  return { sb, log, merges, D: sb.CBA.data };
}
const ON = { gardenWritesFromBrowser: true, gardenTasksFromFirestore: true };
const wait = () => new Promise(r => setTimeout(r, 40));

(async () => {

section('1. 🔴 סגירה "בוטל" — הדיווח של התושב מתעדכן');
{
  const e = env({ flags: ON,
    docs: { 'gardenTasks/55': { id: '55', repId: '21', stage: 'מתוכנן', week: '2026-09-21',
                                flag: '', closure: '', kind: 'דיווח תושב' } } });
  let res = null;
  e.D.gardenTask('close', '55', { closure: 'בוטל', note: 'העץ הוסר כבר בגיזום השבועי' },
                 r => { res = r; });
  await wait();
  ok('הפעולה הצליחה', res && res.ok === true, JSON.stringify(res));
  ok('🔴 המשימה נסגרה', e.sb.__taskPatch && e.sb.__taskPatch.closure === 'בוטל');
  const m = e.merges['gardenReports/21'];
  ok('🔴🔴 **והדיווח של התושב עודכן** — זה הבאג שנסגר', !!m, JSON.stringify(e.log));
  ok('השלב עבר ל"הושלם"', m && m.stage === 'הושלם', m && m.stage);
  ok('הסגירה הועתקה כלשונה', m && m.closure === 'בוטל', m && m.closure);
  ok('🔴 וההסבר שנכתב — זה מה שהתושב רואה, לא רק המילה "בוטל"',
     m && m.closeWhy === 'העץ הוסר כבר בגיזום השבועי', m && m.closeWhy);
  ok('⚠️ חלון המשוב **לא** נפתח — אין מה לדרג בעבודה שלא נעשתה',
     m && m.canFeedback === false && m.feedbackUntil === 0, JSON.stringify(m));
  ok('הדגל התנקה', m && m.flag === '');
  ok('⚠️ ויש חותמת עדכון', m && !!m.updatedAt);
}

section('2. 🔴🔴 המראה כותבת ישירות — ואינה שואלת שאילתה שתידחה');
{
  const e = env({ flags: ON,
    docs: { 'gardenTasks/55': { id: '55', repId: '21', stage: 'בטיפול', closure: '' } } });
  e.D.gardenTask('close', '55', { closure: 'לא רלוונטי', note: 'תוקן מעצמו' }, () => {});
  await wait();
  ok('🔴🔴 אין שאילתה על gardenReports — canSeeGardenReport היה דוחה אותה',
     !e.log.some(x => x === 'query:gardenReports'), JSON.stringify(e.log));
  ok('הכתיבה היא set(merge) על מזהה ידוע מ-repId',
     e.log.indexOf('merge:gardenReports/21') !== -1, JSON.stringify(e.log));
  /* 🔴 הכלל **קיים כבר** — זה מה שהופך את התיקון לשינוי לקוח בלבד,
     בלי פרסום כללים ובלי דיפלוי ל-Apps Script. אם מישהו יצמצם את
     הרשימה הזאת בעתיד, המראה תתחיל להידחות בשקט. */
  const teamRule = (RULES.match(/function grTeamUpdateOk\(\)[\s\S]*?\n    \}/) || [''])[0];
  ok('שער הכתיבה של הצוות קיים', !!teamRule);
  ok('⚠️ והוא כבר מתיר את כל מה שהמראה כותבת — אפס שינוי בכללי האבטחה',
     ['stage', 'flag', 'closure', 'closeWhy', 'canFeedback', 'feedbackUntil', 'updatedAt']
       .every(k => teamRule.indexOf("'" + k + "'") !== -1), teamRule);
  ok('🔴 והקריאה עדיין סגורה למשפחה בלבד — לא נפתחה בדלת האחורית',
     /function canSeeGardenReport\(fid\)[\s\S]{0,200}fid == myFamilyId\(\)/.test(RULES));
}

section('3. סגירה "בוצע" — חלון המשוב כן נפתח');
{
  const e = env({ flags: ON,
    docs: { 'gardenTasks/55': { id: '55', repId: '21', stage: 'בטיפול', closure: '' } } });
  e.D.gardenTask('done', '55', { note: 'גזמנו והשקינו' }, () => {});
  await wait();
  const m = e.merges['gardenReports/21'];
  ok('הדיווח עודכן', !!m);
  ok('🔴 canFeedback דלוק', m && m.canFeedback === true);
  ok('🔴 ויש מועד סיום מוחלט לחלון — לא "ללא הגבלה"',
     m && typeof m.feedbackUntil === 'number' && m.feedbackUntil > Date.now(), m && m.feedbackUntil);
  ok('⚠️ ו"מה נעשה" הוא אותו טקסט שיוצא במייל',
     m && m.closeWhy === 'גזמנו והשקינו', m && m.closeWhy);
}

section('4. פתיחה מחדש — הסגירה **וההסבר** יורדים מהדיווח');
{
  const e = env({ flags: ON,
    docs: { 'gardenTasks/55': { id: '55', repId: '21', stage: 'הושלם',
                                closure: 'בוטל', flag: '' } } });
  e.D.gardenTask('undo', '55', {}, () => {});
  await wait();
  const m = e.merges['gardenReports/21'];
  ok('הדיווח עודכן', !!m, JSON.stringify(e.log));
  ok('🔴 הסגירה התרוקנה', m && m.closure === '');
  ok('🔴🔴 וגם ההסבר — אחרת התושב רואה "נסגר כי…" על דיווח פתוח',
     m && m.closeWhy === '', JSON.stringify(m));
  ok('חלון המשוב נסגר', m && m.canFeedback === false && m.feedbackUntil === 0);
  ok('השלב חזר ל"בטיפול"', m && m.stage === 'בטיפול', m && m.stage);
}

section('5. פעולה שאינה סגירה — מעתיקה שלב ודגל, ולא נוגעת בהסבר');
{
  const e = env({ flags: ON,
    docs: { 'gardenTasks/55': { id: '55', repId: '21', stage: 'התקבל', closure: '', flag: '' } } });
  e.D.gardenTask('plan', '55', { week: '2026-09-28' }, () => {});
  await wait();
  const m = e.merges['gardenReports/21'];
  ok('הדיווח עודכן בשיבוץ', !!m, JSON.stringify(e.log));
  ok('🔴 השלב עבר ל"מתוכנן" — זה מה שמזיז את הבר אצל התושב',
     m && m.stage === 'מתוכנן', m && m.stage);
  ok('⚠️ ו-closeWhy **לא** נכתב — פעולה שאינה סגירה לא נוגעת בו',
     m && !('closeWhy' in m), JSON.stringify(m));
  ok('⚠️ וגם לא canFeedback', m && !('canFeedback' in m), JSON.stringify(m));
}

section('6. 🔴 משימת שגרה — אין דיווח, ואין כתיבה מיותרת');
{
  const e = env({ flags: ON,
    docs: { 'gardenTasks/60': { id: '60', repId: '', stage: 'בטיפול', closure: '', kind: 'שגרה' } } });
  e.D.gardenTask('done', '60', {}, () => {});
  await wait();
  ok('🔴 אף מסמך דיווח לא נגע',
     !e.log.some(x => x.indexOf('merge:gardenReports') === 0), JSON.stringify(e.log));
}

section('7. 🔧 התיקון החד-פעמי — מה שכבר קפא');
{
  const tasks = [
    { id: '55', repId: '21', stage: 'הושלם', closure: 'בוטל', note: 'כבר טופל', flag: '' },
    { id: '56', repId: '22', stage: 'הושלם', closure: 'לא רלוונטי', note: 'הבעיה נעלמה', flag: '' },
    { id: '57', repId: '',   stage: 'בטיפול', closure: '', note: '' },
    { id: '58', repId: '23', stage: 'מתוכנן', closure: '', note: '', flag: 'נגררה' }
  ];
  const e = env({ flags: ON, all: { gardenTasks: tasks } });
  let res = null;
  e.D.gardenRepairReportStatus(r => { res = r; });
  await wait();
  ok('הפעולה הצליחה', res && res.ok === true, JSON.stringify(res));
  ok('🔴 שלושה דיווחים יושרו — והמשימה בלי repId דולגה',
     res && res.count === 3 && res.total === 3, JSON.stringify(res));
  ok('🔴 דיווח 21 קיבל את הסגירה', e.merges['gardenReports/21'] &&
     e.merges['gardenReports/21'].closure === 'בוטל');
  ok('🔴 ואת ההסבר שהמנהל כתב', e.merges['gardenReports/21'] &&
     e.merges['gardenReports/21'].closeWhy === 'כבר טופל');
  ok('🔴 דיווח 22 קיבל "לא רלוונטי"', e.merges['gardenReports/22'] &&
     e.merges['gardenReports/22'].closure === 'לא רלוונטי');
  ok('⚠️ דיווח פתוח מקבל שלב ודגל בלי הסבר סגירה',
     e.merges['gardenReports/23'] && e.merges['gardenReports/23'].stage === 'מתוכנן' &&
     e.merges['gardenReports/23'].flag === 'נגררה' &&
     e.merges['gardenReports/23'].closeWhy === '', JSON.stringify(e.merges['gardenReports/23']));
  ok('🔴🔴 גם כאן — אפס שאילתות על gardenReports',
     !e.log.some(x => x === 'query:gardenReports'), JSON.stringify(e.log));
}

section('8. ⚠️ התיקון מסרב לרוץ כשכתיבת הגינון כבויה');
{
  const e = env({ flags: {}, all: { gardenTasks: [] } });
  let res = null;
  e.D.gardenRepairReportStatus(r => { res = r; });
  await wait();
  ok('🔴 מסרב — הגיליון עדיין הבעלים, ויישור כזה היה נמחק בסנכרון הבא',
     res && res.ok === false, JSON.stringify(res));
  ok('ולא קרא כלום', !e.log.some(x => x.indexOf('readAll:') === 0), JSON.stringify(e.log));
}

section('9. 🔴 מסך התושב — שדה חסר נקרא "התקבל", וכפתור המחיקה חוזר');
ok('normRep קיימת', /function normRep\(r\)/.test(RG));
ok('🔴 שלב ריק הופך ל"התקבל"',
   /if \(!String\(r\.stage \|\| ""\)\.trim\(\)\) r\.stage = "התקבל";/.test(RG));
ok('🔴 והיא מוחלת על **כל** שורה שנטענת',
   /\(res\.rows \|\| \[\]\)\.map\(normRep\)/.test(RG), 'לא נמצא');
ok('⚠️ תנאי כפתור המחיקה לא השתנה — הוא פשוט מקבל ערך אמיתי',
   /r\.stage === "התקבל" && !r\.flag && !r\.mergedInto && !r\.closure/.test(RG));
/* 🔴 ההפך של הבאג: אסור ש-normRep תמציא סגירה או דגל. */
ok('🔴🔴 ואינה ממציאה סגירה — רק ממירה חסר לריק',
   /if \(r\.closure == null\) r\.closure = "";/.test(RG) &&
   !/r\.closure = "בוצע"/.test(RG));

section('10. איחוד — הדיווח שהופנה מקבל את שלב הבולעת');
{
  const mg = (DS.match(/function gardenFsMerge[\s\S]*?\n  \}\n/) || [''])[0];
  ok('הפונקציה קיימת', !!mg);
  ok('🔴 השלב נלקח מ-parent ולא מהנבלעת',
     /stage: String\(parent\.stage \|\| "התקבל"\)/.test(mg), mg.slice(0, 200));
  ok('⚠️ ו-closure נשאר ריק — העבודה עדיין פתוחה',
     /closure: "", closeWhy: ""/.test(mg));
  ok('🔴 באותה כתיבה כמו mergedInto, ולא במראה נפרדת',
     /mergedInto: parentRep,[\s\S]{0,900}stage: String\(parent\.stage/.test(mg));
}

section('11. מסך "מצב המערכת" — הכפתור קיים ומוגן');
ok('כפתור התיקון קיים', /id="sys-fix-reports"/.test(SS));
ok('🔴 והוא מבקש אישור לפני שהוא כותב', /CBA\.ui\.confirm\([\s\S]{0,300}gardenRepairReportStatus/.test(SS) ||
   /repairReports[\s\S]{0,600}CBA\.ui\.confirm/.test(SS), 'לא נמצא');
ok('⚠️ ואינו יכול לרוץ פעמיים במקביל', /if \(st\.fixBusy/.test(SS));
ok('הפעולה חשופה בשכבת הנתונים',
   /gardenRepairReportStatus: gardenRepairReportStatus,/.test(DS));

section('12. 🔴 מחיקת דיווח — ולא להשאיר משימה יתומה');
{
  /* השרת דיווח שמחק גם את המשימה — אין מה לנקות. */
  const e = env({ flags: ON });
  e.sb.CBA.sheets.postRead = (a, p, cb) => { e.log.push('post:' + a);
    cb({ ok: true, deletedReportIds: ['21'], deletedTaskIds: ['55'] }); };
  e.D.gardenReportDelete('21', '55', () => {});
  await wait();
  ok('⚠️ כשהשרת כבר מחק את המשימה — אין מחיקה כפולה',
     !e.log.some(x => x === 'delete:gardenTasks/55'), JSON.stringify(e.log));
}
{
  /* 🔴 המקרה האמיתי: שורת המשימה לא הייתה בגיליון, ולכן היא לא נמחקה. */
  const e = env({ flags: ON });
  e.sb.CBA.sheets.postRead = (a, p, cb) => { e.log.push('post:' + a);
    cb({ ok: true, deletedReportIds: ['21'], deletedTaskIds: [] }); };
  e.D.gardenReportDelete('21', '55', () => {});
  await wait();
  ok('🔴🔴 המשימה היתומה מנוקה מ-Firestore',
     e.log.indexOf('delete:gardenTasks/55') !== -1, JSON.stringify(e.log));
}
{
  /* ⚠️ מחיקה שנכשלה אינה מוחקת שום דבר. */
  const e = env({ flags: ON });
  e.sb.CBA.sheets.postRead = (a, p, cb) => { e.log.push('post:' + a);
    cb({ ok: false, error: 'הטיפול בדיווח כבר התחיל' }); };
  let res = null;
  e.D.gardenReportDelete('21', '55', r => { res = r; });
  await wait();
  ok('⚠️ שרת שסירב — אין ניקוי ואין מחיקה', res && res.ok === false &&
     !e.log.some(x => x.indexOf('delete:') === 0), JSON.stringify(e.log));
}
{
  /* תאימות לאחור: לקוח ישן שקורא עם שני ארגומנטים. */
  const e = env({ flags: ON });
  let res = null;
  e.D.gardenReportDelete('21', r => { res = r; });
  await wait();
  ok('⚠️ קריאה בת שני ארגומנטים עדיין עובדת', res && res.ok === true, JSON.stringify(res));
}
ok('🔴 והכלל שמתיר את הניקוי הוא gtOrphanCleanupOk, שדורש שהדיווח כבר לא קיים',
   /function gtOrphanCleanupOk\(\)[\s\S]{0,500}!exists\(/.test(RULES));
ok('⚠️ המסך מעביר את מזהה המשימה',
   /askDelete\(b\.dataset\.del, rep && rep\.taskId\)/.test(RG), 'לא נמצא');

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
})();
