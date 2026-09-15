/* בדיקות לשער ההזרעה של עמוד הבית (2026-09-15, צעד 06).
   הרצה:  node tools/test-home-extras-gate.js

   🔴 מה נבדק כאן ולמה: `homeExtras` כבר מביאה את `tour` ואת `club`, ושתי
   קריאות רשת נוספות לאותו מידע יצאו בכל עלייה כי ההמתנה אליהן הייתה **שעון
   קבוע** (2,500 ו-3,200 מ"ל) שכויל כשהשרת ענה תוך 1.5–3 שניות. נמדד באתר
   החי ב-15.9: `homeExtras` לוקחת 7–8.4 שניות. השעון מצלצל ראשון, הכפילות
   יוצאת, והיא מאטה את `homeExtras` עצמה כי התור של Apps Script משותף.

   ⚠️ הסכנה בתיקון הזה היא **תקיעה**: ממתין שלא ישוחרר לעולם = ספירת התראות
   שלא נבדקת וסיור שלא נפתח, בשקט. לכן רוב הבדיקות כאן הן על היציאות —
   graceMs, capMs, וכשל של הקריאה המאוחדת — ולא על המסלול המוצלח.

   ⚠️ אין jsdom. הקוד האמיתי של dataService רץ ב-vm עם CBA מזויף, כי מה
   שנבדק הוא תזמון ולא DOM. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const HOME = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'home.js'), 'utf8');

/* ---------- סביבה מזויפת ---------- */
function build(opts) {
  opts = opts || {};
  const calls = [];
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
        calls.push({ action: q.action, at: Date.now() });
        if (opts.neverReplies) return;                       // הקריאה שלא חוזרת לעולם
        /* עטיפת try כמו ב-sheets.js האמיתי (`settle` עוטף כל callback),
           כדי שההרצה כאן תשקף את הדפדפן ולא תקרוס על בדיקה שזורקת בכוונה. */
        setTimeout(() => {
          try { cb(opts.reply || { ok: true, homeExtras: true }); } catch (e) { /* כמו בייצור */ }
        }, opts.replyMs || 5);
      },
      postRead() {}, isConnected: () => true, load() {}
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(DS, sandbox);
  sandbox._calls = calls;
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ================================================================= */
(async function () {

section('1. השער קיים ומחווט');
const sb0 = build();
ok('homeExtrasWhenSettled נחשפת מ-dataService', typeof sb0.CBA.data.homeExtrasWhenSettled === 'function');
ok('getHomeExtras עדיין נחשפת', typeof sb0.CBA.data.getHomeExtras === 'function');
ok('🔴 שעון 2500 הקבוע הוסר מ-app.js',
   !/setTimeout\(function \(\) \{ if \(!notif\.clubChecked\) refreshAlertsClub\(\); \}, 2500\)/.test(APP));
ok('🔴 שעון 3200 הקבוע הוסר מ-app.js',
   !/setTimeout\(function \(\) \{ CBA\.tour\.maybeAutoStart\(\); \}, 3200\)/.test(APP));
ok('המועדון עובר דרך hxWait עם 2500', /hxWait\(function \(\) \{ if \(!notif\.clubChecked\) refreshAlertsClub\(\); \}, 2500\)/.test(APP));
ok('הסיור עובר דרך hxWait עם 3200', /hxWait\(function \(\) \{ CBA\.tour\.maybeAutoStart\(\); \}, 3200\)/.test(APP));
ok('hxWait מוגדרת ב-app.js', /function hxWait\(cb, ms\)/.test(APP));
ok('🔴 hxWait נופלת לשעון כששכבת הנתונים לא מכירה את השער',
   /if \(window\.CBA\.data && CBA\.data\.homeExtrasWhenSettled\)[\s\S]{0,140}setTimeout\(cb, ms\);/.test(APP));
ok('הערכים 2500/3200 נשמרו ולא הוגדלו (לא מכוילים מחדש)',
   (APP.match(/hxWait\([\s\S]*?, 2500\);/g) || []).length === 1 &&
   (APP.match(/hxWait\([\s\S]*?, 3200\);/g) || []).length === 1);

section('2. idle — עמוד הבית לא נפתח (מנהל שנוחת על מסך ניהול)');
{
  const sb = build();
  let firedAt = null; const t0 = Date.now();
  sb.CBA.data.homeExtrasWhenSettled(() => { firedAt = Date.now() - t0; }, 60);
  await wait(20);
  ok('לא רץ לפני תום ה-grace', firedAt === null, String(firedAt));
  await wait(70);
  ok('רץ אחרי ה-grace', firedAt !== null && firedAt >= 55, String(firedAt));
  ok('🔴 לא יצאה שום קריאת רשת מהשער עצמו', sb._calls.length === 0, JSON.stringify(sb._calls));
}

section('3. pending — הקריאה המאוחדת בדרך');
{
  const sb = build({ replyMs: 200 });
  let firedAt = null; const t0 = Date.now();
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => { firedAt = Date.now() - t0; }, 60);
  await wait(120);
  ok('🔴 לא רץ כשה-grace עבר אבל הקריאה עוד באוויר', firedAt === null, String(firedAt));
  await wait(160);
  ok('רץ ברגע שהקריאה חזרה', firedAt !== null && firedAt >= 190, String(firedAt));
}

section('4. המירוץ האמיתי — עמוד הבית יוצא לדרך בתוך ה-grace');
{
  const sb = build({ replyMs: 300 });
  let firedAt = null; const t0 = Date.now();
  sb.CBA.data.homeExtrasWhenSettled(() => { firedAt = Date.now() - t0; }, 80);
  setTimeout(() => sb.CBA.data.getHomeExtras(() => {}), 30);   // המסך נפתח אחרי שהשער כבר ממתין
  await wait(150);
  ok('🔴 ה-grace לא שחרר — הקריאה יצאה בינתיים', firedAt === null, String(firedAt));
  await wait(250);
  ok('משוחרר עם חזרת הקריאה', firedAt !== null && firedAt >= 300, String(firedAt));
}

section('5. done — הקריאה כבר חזרה');
{
  const sb = build({ replyMs: 5 });
  await new Promise(r => sb.CBA.data.getHomeExtras(r));
  let firedAt = null; const t0 = Date.now();
  sb.CBA.data.homeExtrasWhenSettled(() => { firedAt = Date.now() - t0; }, 500);
  await wait(15);
  ok('🔴 רץ מיד, בלי להמתין ל-grace', firedAt !== null && firedAt < 10, String(firedAt));
}

section('6. 🔴 היציאות — לעולם לא נתקעים');
{
  const sb = build({ neverReplies: true });
  let firedAt = null; const t0 = Date.now();
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => { firedAt = Date.now() - t0; }, 20, 120);
  await wait(60);
  ok('ממתין כל עוד לא עברה התקרה', firedAt === null, String(firedAt));
  await wait(120);
  ok('🔴 התקרה שחררה אותו גם כשהקריאה לא חזרה לעולם', firedAt !== null, String(firedAt));
}
{
  const sb = build({ reply: { ok: false, error: 'נפל' }, replyMs: 20 });
  let fired = false;
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => { fired = true; }, 500, 5000);
  await wait(60);
  ok('🔴 כישלון הקריאה משחרר את הממתינים (ולא מחכה ל-grace)', fired);
}
{
  const sb = build({ reply: { ok: true }, replyMs: 20 });   // שרת ישן: בלי homeExtras:true
  let fired = false;
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => { fired = true; }, 500, 5000);
  await wait(60);
  ok('🔴 שרת ישן (בלי homeExtras:true) משחרר גם הוא', fired);
}
{
  const sb = build({ replyMs: 10 });
  let n = 0;
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => { n++; }, 5, 30);
  await wait(120);
  ok('🔴 הקריאה החוזרת רצה בדיוק פעם אחת (שחרור + תקרה לא מכפילים)', n === 1, String(n));
}
{
  const sb = build({ replyMs: 10 });
  let n = 0;
  sb.CBA.data.homeExtrasWhenSettled(() => { n++; }, 15, 30);   // idle
  await wait(120);
  ok('גם במסלול ה-idle רצה פעם אחת', n === 1, String(n));
}
{
  const sb = build({ replyMs: 10 });
  let boom = 0, after = false;
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => { boom++; throw new Error('ממתין שזורק'); }, 200, 5000);
  sb.CBA.data.homeExtrasWhenSettled(() => { after = true; }, 200, 5000);
  await wait(60);
  ok('🔴 ממתין שזורק לא מונע מהשאר לרוץ', boom === 1 && after);
}

section('7. שני ממתינים, קריאה אחת');
{
  const sb = build({ replyMs: 40 });
  const hits = [];
  sb.CBA.data.getHomeExtras(() => {});
  sb.CBA.data.homeExtrasWhenSettled(() => hits.push('club'), 5, 5000);
  sb.CBA.data.homeExtrasWhenSettled(() => hits.push('tour'), 5, 5000);
  await wait(90);
  ok('שניהם שוחררו', hits.length === 2, JSON.stringify(hits));
  ok('🔴 ורק קריאת רשת אחת יצאה', sb._calls.length === 1, JSON.stringify(sb._calls));
}

section('8. קריאה שנייה מאפסת את השער (רענון / חזרה לעמוד הבית)');
{
  const sb = build({ replyMs: 20 });
  await new Promise(r => sb.CBA.data.getHomeExtras(r));       // done
  let firedAt = null; const t0 = Date.now();
  sb.CBA.data.getHomeExtras(() => {});                        // pending שוב
  sb.CBA.data.homeExtrasWhenSettled(() => { firedAt = Date.now() - t0; }, 200, 5000);
  await wait(10);
  ok('🔴 לא ירש את ה-done הישן', firedAt === null, String(firedAt));
  await wait(50);
  ok('שוחרר עם הקריאה החדשה', firedAt !== null);
}

section('9. ההזרעה עצמה לא נפגעה');
ok('home.js עדיין מזריע את הסיור', /CBA\.tour\.seed\(res\.tour\)/.test(HOME));
ok('home.js עדיין מזריע את המועדון', /CBA\.seedClubAlerts\(res\.club\)/.test(HOME));
ok('🔴 getHomeExtras מופעלת בדיוק ממקום אחד (primeHomeExtras)',
   (HOME.match(/CBA\.data\.getHomeExtras\(function/g) || []).length === 1);
ok('והשמירה על השרת הישן עדיין שם', /!CBA\.data\.getHomeExtras/.test(HOME));
ok('🔴 getHomeExtras מסמנת pending לפני היציאה לרשת',
   /getHomeExtras: function \(cb\) \{\s*hxState = "pending";/.test(DS));
ok('🔴 ההזרעה רצה לפני השחרור (cb ב-try, hxSettle ב-finally)',
   /try \{ if \(cb\) cb\(res\); \}\s*finally \{ hxSettle\(\); \}/.test(DS));

section('10. 🔴 הסדר — הבאג שנתפס רק במדידה חיה (15.9)');
/* הגרסה הראשונה שיחררה את הממתינים **לפני** ה-callback עברה את כל
   הבדיקות למעלה ועלתה לייצור — ושם שתי הקריאות הכפולות המשיכו
   לצאת. הבדיקה הזאת היא ההבדל: הממתין חייב לראות מצב שנקבע ב-cb. */
{
  const sb = build({ replyMs: 10 });
  let seeded = false, sawSeed = null;
  sb.CBA.data.getHomeExtras(function () { seeded = true; });      // ההזרעה
  sb.CBA.data.homeExtrasWhenSettled(() => { sawSeed = seeded; }, 500, 5000);
  await wait(60);
  ok('🔴 הממתין רואה את תוצאת ההזרעה, לא מצב שלפניה', sawSeed === true, String(sawSeed));
}
{
  const sb = build({ replyMs: 10 });
  let sawSeed = null, seeded = false;
  sb.CBA.data.getHomeExtras(function () { throw new Error('ההזרעה נפלה'); });
  sb.CBA.data.homeExtrasWhenSettled(() => { sawSeed = true; }, 500, 5000);
  await wait(60);
  ok('🔴 cb שזורק עדיין משחרר (finally)', sawSeed === true);
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
})();
