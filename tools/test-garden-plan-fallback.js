/* בדיקות למסלול הקריאה של תוכנית העבודה (2026-09-15, צעד 03ג).
   הרצה:  node tools/test-garden-plan-fallback.js

   🔴 המארז הזה הוא **שער הנפילה-לאחור**. ב-9.9 צעד שלם עלה לייצור בלי שהמסלול
   הישן נבדק, והמסך נשאר ריק ברגע שהמסלול החדש שתק. הכלל שנולד מזה: צעד שאינו
   חוזר למסלול הישן — בלי שגיאה ובלי שהמשתמש ירגיש — אינו עולה לייצור.

   ⚠️ אין כאן jsdom. מריצים את הקוד האמיתי של dataService ב-vm עם CBA מזויף,
   כי מה שנבדק הוא **לוגיקת הבחירה בין שני מקורות**, לא DOM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const FB = fs.readFileSync(path.join(ROOT, 'js', 'data', 'firebase.js'), 'utf8');

/* ---------- סביבה מזויפת ---------- */
let sheetCalls, fbPlan, exposed;

function build(opts) {
  opts = opts || {};
  sheetCalls = [];
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Date, JSON, Math, parseInt, parseFloat, String, Number,
    isNaN, Object, Array, RegExp, Error, encodeURIComponent, decodeURIComponent
  };
  sandbox.window = sandbox;
  sandbox.document = { createElement: () => ({}), head: { appendChild() {} } };
  sandbox.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sandbox.CBA = {
    mock: { years: {}, currentYear: '' },
    sheets: {
      get(q, cb) {
        sheetCalls.push(q);
        setTimeout(() => cb(opts.sheetsReply !== undefined
          ? opts.sheetsReply
          : { ok: true, defs: [{ id: 'T3' }], areas: ['א'], categories: ['ק'], freqs: ['שבועי'] }), 1);
      },
      postRead() {}, isConnected: () => true, load() {}
    }
  };
  if (!opts.noFb) {
    sandbox.CBA.fb = {
      /* ⚠️ ברירת המחדל אינה אוסף ריק: מ-15.9 אוסף ריק הוא **כישלון** ומפיל
       לאחור — כך נראה גם סנכרון שמעולם לא רץ. */
    readCollection: opts.readCollection || ((n, cb) => setTimeout(() => cb(null, [{ id: 'T1', order: 1 }]), 1)),
      readDoc: opts.readDoc || ((c, i, cb) => setTimeout(() => cb(null, { areas: [], categories: [], freqs: [] }), 1)),
      authReady: opts.authReady || (cb => setTimeout(() => cb({ uid: 'U1' }), 1)),
      /* הדגלים נקראים ב-ensureDb — הקוד ממתין לו לפני בדיקת הדגל. */
      ensureDb: opts.ensureDb || (cb => setTimeout(() => cb(null), 1)),
      isReady: () => true,
      isDbReady: () => !!opts.warm
    };
    if (opts.stripReadCollection) delete sandbox.CBA.fb.readCollection;
  }
  vm.createContext(sandbox);
  vm.runInContext(DS, sandbox);
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function read(sb) { return new Promise(r => sb.CBA.data.getGardenPlan(r)); }

/* ================================================================= */
(async function () {

section('1. מבנה ומתג הכיבוי');
ok('הדגל קיים בקוד', /var GARDEN_PLAN_FROM_FIRESTORE = true;/.test(DS));
ok('getGardenPlan עובר דרך gardenPlanRead',
   /getGardenPlan: function \(cb\) \{\s*gardenPlanRead\(cb\);/.test(DS));
ok('🔴 אין יותר קריאה ישירה ל-action gardenPlan מחוץ ל-viaSheets',
   (DS.match(/action: "gardenPlan"/g) || []).length === 1,
   String((DS.match(/action: "gardenPlan"/g) || []).length));
ok('המדידה נרשמת ל-CBA.perf לפי מפתח התחום', /CBA\.perf\[key\] = \{/.test(DS));
/* אחרי האיחוד (15.9) השלד המשותף יושב ב-fsFirstRead, וכל תחום שעובר
   קורא לו. ⚠️ **המספר אמור לעלות** — מה שהבדיקה שומרת עליו הוא
   שאיש לא יכתוב שלד שני משלו במקום להשתמש בזה. 3 → 4 ב-16.9
   עם `gardenReports` (ההגדרה עצמה + שלושה תחומים). */
ok('כל התחומים עוברים דרך אותו שלד, ואין שני',
   (DS.match(/fsFirstRead\(/g) || []).length === 7, String((DS.match(/fsFirstRead\(/g) || []).length));
ok('והדגל מועבר אליו', /fsFirstRead\("gardenPlan", GARDEN_PLAN_FROM_FIRESTORE,/.test(DS));

section('2. המסלול המהיר — Firestore');
let sb = build({
  readCollection: (n, cb) => setTimeout(() => cb(null, [
    { id: 'T7', order: 9, title: 'ב' }, { id: 'T3', order: 4, title: 'א' }
  ]), 1),
  readDoc: (c, i, cb) => setTimeout(() => cb(null,
    { areas: ['צפונית', 'דרומית'], categories: ['מדשאות'], freqs: ['שבועי', 'חודשי'] }), 1)
});
let r = await read(sb);
ok('הצליח', r.ok === true);
ok('🔴 Apps Script לא נקרא כלל', sheetCalls.length === 0, JSON.stringify(sheetCalls));
ok('התקבלו שתי הגדרות', r.defs.length === 2, String(r.defs.length));
ok('האזורים הגיעו ממסמך הרשימות', JSON.stringify(r.areas) === '["צפונית","דרומית"]');
ok('הקטגוריות הגיעו', JSON.stringify(r.categories) === '["מדשאות"]');
ok('התדירויות הגיעו', JSON.stringify(r.freqs) === '["שבועי","חודשי"]');
ok('המקור נרשם', sb.CBA.perf.gardenPlan.source === 'firestore', sb.CBA.perf.gardenPlan.source);
ok('והזמן נמדד', typeof sb.CBA.perf.gardenPlan.ms === 'number');
/* ⚠️ פתיחה ראשונה משלמת גם על כ-550KB של SDK. השוואה שמערבבת
   קר וחם תוביל למסקנה הפוכה מהנכונה — ולכן הדגל נרשם. */
ok('מסומן כ-SDK קר', sb.CBA.perf.gardenPlan.warm === false, String(sb.CBA.perf.gardenPlan.warm));
const sbWarm = build({ warm: true });
await read(sbWarm);
ok('וכ-SDK חם כשהוא כבר טעון', sbWarm.CBA.perf.gardenPlan.warm === true,
   String(sbWarm.CBA.perf.gardenPlan.warm));
ok('הדגל נקרא לפני הקריאה ולא אחריה',
   DS.indexOf('var warm = ') < DS.indexOf('CBA.fb.authReady'));
ok('isDbReady מיוצא מהגשר', /isDbReady: function/.test(FB));

section('2ב. סדר — שתי התשובות חייבות להיראות זהות');
/* ⚠️ Firestore מחזיר לפי סדר מזהה לקסיקלי, שבו "T10" קודם ל-"T3". מסך
   שמסדר אחרת בכל מסלול נראה למשתמש כמו באג, לא כמו גיבוי. */
ok('🔴 ממוין לפי order ולא לפי סדר ההחזרה', r.defs[0].id === 'T3', r.defs.map(d => d.id).join(','));
sb = build({
  readCollection: (n, cb) => setTimeout(() => cb(null,
    [{ id: 'T10' }, { id: 'T3' }, { id: 'T9' }]), 1)
});
r = await read(sb);
ok('בלי order — ממוין לפי המזהה המספרי ולא לקסיקלית',
   r.defs.map(d => d.id).join(',') === 'T3,T9,T10', r.defs.map(d => d.id).join(','));

section('3. \u05d4\u05de\u05d3\u05d9\u05e0\u05d9\u05d5\u05ea \u05d4\u05d7\u05d3\u05e9\u05d4 \u2014 \u05d4\u05d7\u05dc\u05d8\u05d4 \u05de\u05d5\u05dc \u05ea\u05e7\u05dc\u05d4');
/* 🔴🔴 **המדיניות התהפכה ב-17.9.2026 (ממצא 02, הכרעת יועד).**
   עד אז כל מצב כאן נפל ל-Apps Script בשקט. זה נמדד כעובד יפה בתחומים
   שרובם קריאה — אבל בתנועות התקציב מקור הנפילה הוא הגיליון, שמתעדכן רק
   בעבודה השעתית, ולכן בקשה שהוגשה לפני חמש דקות פשוט לא קיימת שם.
   מהיום ההפרדה היא לפי **סיבה**, לא לפי תחום:
     · החלטה (`disabled` / `flag-off`) → נופלים ל-Apps Script כרגיל.
     · תקלה (`no-user` / `db` / `firestore`) → `{ok:false}`, והמסך אומר
       "לא הצלחנו לטעון". מסך תוכנית העבודה כבר יודע לצייר את זה
       עם כפתור "נסה שוב" (gardenPlan.js:159-168).
   ⚠️ הכיסוי לא ירד: כל תרחיש נבדק **פעמיים** — פעם בלי מתג החירום
      (המדיניות החדשה) ופעם איתו דלוק (בדיוק ההתנהגות של אתמול). */

section('3\u05d0. \u05d4\u05d7\u05dc\u05d8\u05d4 \u2014 \u05e2\u05d3\u05d9\u05d9\u05df \u05e0\u05d5\u05e4\u05dc\u05d9\u05dd \u05dc-Apps Script');
const decisions = [
  ['אין CBA.fb כלל', { noFb: true }, 'disabled'],
  ['CBA.fb בלי readCollection', { stripReadCollection: true }, 'disabled']
];
for (const [name, opts, why] of decisions) {
  const s2 = build(opts);
  const res = await read(s2);
  ok(name + ' → נפל ל-Apps Script', sheetCalls.length === 1, JSON.stringify(sheetCalls));
  ok('   …והתשובה תקינה', res && res.ok === true && res.defs.length === 1);
  ok('   …והסיבה נרשמה', (s2.CBA.perf.gardenPlan.why || '').indexOf(why) !== -1,
     s2.CBA.perf.gardenPlan.why);
  ok('   …והמקור מסומן appsscript', s2.CBA.perf.gardenPlan.source === 'appsscript');
}

section('3\u05d1. \u05ea\u05e7\u05dc\u05d4 \u2014 \u05db\u05e9\u05dc \u05d2\u05dc\u05d5\u05d9, \u05d1\u05dc\u05d9 \u05e0\u05e4\u05d9\u05dc\u05d4 \u05e9\u05e7\u05d8\u05d4');
const failures = [
  ['אין משתמש מחובר', { authReady: cb => setTimeout(() => cb(null), 1) }, 'no-user'],
  ['כלל אבטחה דחה', { readCollection: (n, cb) => setTimeout(() => cb({ code: 'permission-denied' }), 1) }, 'permission-denied'],
  ['קריאת האוסף נכשלה', { readCollection: (n, cb) => setTimeout(() => cb(new Error('boom')), 1) }, 'boom'],
  ['מסמך הרשימות נכשל', { readDoc: (c, i, cb) => setTimeout(() => cb(new Error('bang')), 1) }, 'bang'],
  ['מסמך הרשימות חסר', { readDoc: (c, i, cb) => setTimeout(() => cb(null, null), 1) }, 'no-lists-doc']
  /* 🔴 22.9 — "אוסף ריק" **ירד מרשימת הכשלים**. ההנחה "ריק = הסנכרון לא
     רץ" הייתה נכונה כש-Firestore היה מראה; מרגע שהוא המקור, ריק הוא
     האמת, והמסך שבו מזינים את השורה הראשונה חייב להיטען כשאין שורות.
     ר' tools/test-garden-empty-is-legit-2026-09-22.js. */
];
{
  const s2 = build({ readCollection: (n, cb) => setTimeout(() => cb(null, []), 1) });
  const res = await read(s2);
  ok('🔴 אוסף ריק → ok:true עם תוכנית ריקה (22.9)', !!res && res.ok === true && Array.isArray(res.defs) && res.defs.length === 0, JSON.stringify(res));
  ok('   …ולא נגע ב-Apps Script', sheetCalls.length === 0);
}
for (const [name, opts, why] of failures) {
  const s2 = build(opts);
  const res = await read(s2);
  ok('🔴 ' + name + ' → לא נגע ב-Apps Script', sheetCalls.length === 0, JSON.stringify(sheetCalls));
  ok('   …והמסך מקבל כשל מפורש',
     !!res && res.ok === false && res.cbaLoadFailed === true, JSON.stringify(res));
  ok('   …וההודעה בעברית ולא קוד', /[\u0590-\u05FF]/.test(String(res && res.error)),
     String(res && res.error));
  ok('   …והסיבה נרשמה', (s2.CBA.perf.gardenPlan.why || '').indexOf(why) !== -1,
     s2.CBA.perf.gardenPlan.why);
  ok('   …והמקור מסומן failed', s2.CBA.perf.gardenPlan.source === 'failed',
     s2.CBA.perf.gardenPlan.source);
}

section('3\u05d2. \u05de\u05ea\u05d2 \u05d4\u05d7\u05d9\u05e8\u05d5\u05dd \u2014 \u05de\u05d7\u05d6\u05d9\u05e8 \u05d1\u05d3\u05d9\u05d5\u05e7 \u05d0\u05ea \u05d4\u05d4\u05ea\u05e0\u05d4\u05d2\u05d5\u05ea \u05d4\u05d9\u05e9\u05e0\u05d4');
/* 🔑 זו הבדיקה שמצדיקה את השינוי: מנהל-על מדליק דגל אחד, וכל התחומים
   חוזרים לקרוא מהגיליון — בלי דיפלוי ובלי שינוי קוד. */
for (const [name, opts] of failures) {
  const s2 = build(opts);
  s2.CBA.fb.flag = (k, d) => (k === 'appsScriptFallback' ? true : d);
  const res = await read(s2);
  ok('🔑 ' + name + ' + מתג חירום → נפל ל-Apps Script כמו אתמול',
     sheetCalls.length === 1 && res && res.ok === true,
     JSON.stringify({ calls: sheetCalls.length, ok: res && res.ok }));
  ok('   …והסיבה מסומנת כנפילה יזומה',
     (s2.CBA.perf.gardenPlan.why || '').indexOf('fallback:') === 0,
     s2.CBA.perf.gardenPlan.why);
}

section('3ב. הדגל מכבה את הצעד כולו');
sb = build({});
vm.runInContext('GARDEN_PLAN_FROM_FIRESTORE = false;', sb);
/* ⚠️ הדגל חי בתוך ה-IIFE, ולכן שינוי מבחוץ לא תופס. הבדיקה האמיתית היא
   שהשורה קיימת ושמסלול "disabled" עובד — ר' סעיף 3, שתי השורות הראשונות. */
ok('השורה לביטול קיימת ויחידה',
   (DS.match(/GARDEN_PLAN_FROM_FIRESTORE = true/g) || []).length === 1);
ok('והיא נבדקת לפני כל דבר אחר',
   DS.indexOf('if (!GARDEN_PLAN_FROM_FIRESTORE') < DS.indexOf('CBA.fb.authReady'));

section('4. אין קולבק כפול');
/* 🔴 שתי קריאות מקבילות ועוד שעון עצר = שלוש דרכים לקרוא ל-cb. קולבק כפול
   היה מצייר את המסך פעמיים ומאפס גלילה. */
let n = 0;
sb = build({
  readCollection: (c, cb) => setTimeout(() => cb(new Error('e1')), 1),
  readDoc: (c, i, cb) => setTimeout(() => cb(new Error('e2')), 2)
});
sb.CBA.data.getGardenPlan(() => { n++; });
await wait(60);
ok('🔴 שני כישלונות → קולבק אחד בלבד', n === 1, String(n));
/* (2026-09-17) שני הכישלונות הם עכשיו מסלול כשל ולא נפילה לאחור, ולכן
   הציפייה היא **אפס** קריאות ל-Apps Script. הנקודה שהבדיקה שומרת עליה
   לא השתנתה: שני כישלונות מקבילים אינם מייצרים שתי פעולות. */
ok('🔴 ואפס קריאות ל-Apps Script (מסלול כשל)', sheetCalls.length === 0, String(sheetCalls.length));

n = 0;
sb = build({
  readCollection: (c, cb) => { setTimeout(() => cb(null, []), 1); },
  readDoc: (c, i, cb) => setTimeout(() => cb(null, {}), 1)
});
sb.CBA.data.getGardenPlan(() => { n++; });
await wait(60);
ok('הצלחה → קולבק אחד בלבד', n === 1, String(n));

section('5. גם כשל ב-Apps Script אינו מתפוצץ');
sb = build({ noFb: true, sheetsReply: { ok: false, error: 'אין הרשאה' } });
r = await read(sb);
ok('התשובה השלילית מועברת כמו שהיא', r.ok === false && r.error === 'אין הרשאה', JSON.stringify(r));

section('6. הגשר — firebase.js');
ok('נוסף SDK_DB נפרד', /var SDK_DB =/.test(FB));
ok('⚠️ ואינו ברשימת ה-SDK שנטענת בהתחברות',
   FB.indexOf('firebase-firestore-compat') > FB.indexOf('var SDK_DB'));
ok('ensureDb מיוצא', /ensureDb: ensureDb/.test(FB));
ok('authReady מיוצא', /authReady: authReady/.test(FB));
ok('readCollection מיוצא', /readCollection: readCollection/.test(FB));
ok('readDoc מיוצא', /readDoc:\s+readDoc/.test(FB));
ok('🔴 לכל קריאה יש שעון עצר', /function withTimeout/.test(FB) &&
   /cb = withTimeout\(cb/.test(FB));
ok('⚠️ authKnown נדלק רק במאזין, לא מראש',
   /state\.authKnown = true;/.test(FB) && /authKnown: false/.test(FB));
ok('authReady מחזיר גם בפסק זמן ולא תולה לנצח',
   /timeoutMs \|\| 4000/.test(FB));
ok('id של המסמך משמש כגיבוי ל-id שבתוכו', /o\.id = o\.id \|\| d\.id;/.test(FB));

section('7. גרסה');
const IDX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SW = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
const vs = [...new Set((IDX.match(/\?v=[0-9a-z]+/g) || []))];
ok('כל התגים באותה גרסה', vs.length === 1, vs.join(' '));
const swv = (SW.match(/var VERSION = "([^"]+)"/) || [])[1];
ok('🔴 VERSION ב-service-worker זהה ל-?v=', vs[0] === '?v=' + swv, vs[0] + ' vs ' + swv);
ok('הגרסה עלתה מ-20260914m', swv !== '20260914m', swv);

console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
})();
