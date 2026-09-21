/* בדיקות לתזמון ההתחברות ל-Firebase (2026-09-14, צעד 02ב — גרסה שנייה).
   הרצה:  node tools/test-firebase-signin-timing.js

   🔴 **למה המארז הזה קיים:** הגרסה הראשונה של הצעד הוחזרה לאחור. היא נשענה
   על `requestIdleCallback` מתוך הנחה שהוא ימתין לרגע שקט — בעוד שמיד אחרי
   התחברות הדפדפן דווקא *כן* בטל, כי הוא ממתין לרשת. התוצאה הייתה הורדה של
   ~300KB בדיוק במקביל למשיכת נתוני התקציב.
   לכן הבדיקות כאן הן **על התזמון עצמו**, לא על ההתחברות: מתי הוא יורה, כמה
   פעמים, ומה קורה כשהמשיכה מדווחת פעמיים. */
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(APP, 'js', 'app.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

/* ---------- שכפול מדויק של הלוגיקה מתוך app.js ----------
   ⚠️ לא העתקה ידנית: חולצים את גוף הפונקציה **מהקוד עצמו** ומריצים אותו.
   העתקה ידנית הייתה בודקת את מה שחשבתי שכתבתי, לא את מה שכתוב. */
const mDelay = SRC.match(/var FIREBASE_SIGNIN_DELAY_MS = (\d+);/);
const mFn = SRC.match(/function firebaseSignInAfterLoad\(googleIdToken\) \{[\s\S]*?\n  \}/);

section('1. הקוד עצמו');
ok('הקבוע קיים ומספרי', !!mDelay, mDelay && mDelay[1]);
ok('הפונקציה חולצה', !!mFn);
/* ⚠️ ההזכרה היחידה המותרת היא בתוך ההערה שמסבירה למה הוא **לא** בשימוש.
   בדיקה גסה על המחרוזת הייתה נכשלת על התיעוד עצמו — ולכן בודקים קריאה. */
ok('⚠️ **אין קריאה ל-requestIdleCallback** (זה מה שהוחזר לאחור)',
   !/requestIdleCallback\s*\(/.test(SRC) && SRC.indexOf('window.requestIdleCallback') === -1);
ok('והוא מוזכר רק בתיעוד, פעם אחת', (SRC.match(/requestIdleCallback/g) || []).length === 1,
   String((SRC.match(/requestIdleCallback/g) || []).length));
ok('⚠️ ואין גם השם הישן firebaseSignInWhenIdle',
   SRC.indexOf('firebaseSignInWhenIdle') === -1);
ok('ההשהיה היא 5 שניות', mDelay && mDelay[1] === '5000', mDelay && mDelay[1]);
ok('⚠️ הירי מותנה בכך שהתשובה **אינה** מהמטמון',
   /if \(!info \|\| info\.source !== "cache"\) firebaseSignInAfterLoad\(resp\.credential\)/.test(SRC));
ok('⚠️ והוא יושב **אחרי** sheetsLoadHandler, לא לפניו',
   SRC.indexOf('sheetsLoadHandler(ok, info);') <
   SRC.indexOf('firebaseSignInAfterLoad(resp.credential)'));
/* (2026-09-17) בין האיפוס ל-load נוספה קריאת CBA.fb.expectUser — ר' ממצא 02.
   הבדיקה נשארת "האיפוס קודם ל-load", עם חלון לשורות שביניהן. */
ok('הדגל מאופס לפני כל התחברות', /firebaseSignInDone = false;[\s\S]{0,900}CBA\.sheets\.load/.test(SRC));
ok('🔴 ו-expectUser נקראת לפני המשיכה, לא אחריה (ממצא 02)',
   /firebaseSignInDone = false;[\s\S]{0,900}CBA\.fb\.expectUser\(\)[\s\S]{0,400}CBA\.sheets\.load/.test(SRC));
ok('יציאה מנתקת גם מ-Firebase', /CBA\.fb\.signOut\(\)/.test(SRC));
/* ⚠️ בדיקה לפי מבנה ולא לפי מחרוזת מדויקת: הבדיקה הזו נכשלה בצדק כשהקולבק
   של signIn השתנה (נוסף אליו הקישור ל-members/{uid} בצעד 02ג), אף שהעטיפה
   עצמה נשארה במקומה. **בדיקה שנשברת על שינוי לגיטימי מאבדת את האמון בה.** */
ok('הקריאה ל-signIn עטופה ב-try/catch',
   /try \{[\s\S]{0,400}?CBA\.fb\.signIn\(googleIdToken[\s\S]{0,1400}?\} catch \(e\) \{\}/.test(SRC));
ok('⚠️ והקישור ל-members קורה רק כשההתחברות הצליחה',
   /CBA\.fb\.signIn\(googleIdToken, function \(err\) \{\s*\n\s*if \(err\) return;/.test(SRC));

/* ---------- הרצה אמיתית של הגוף שחולץ ---------- */
section('2. התנהגות — הרצה של הקוד שחולץ מ-app.js');
function harness(opts) {
  opts = opts || {};
  const calls = [];
  const timers = [];
  const env = {
    firebaseSignInDone: false,
    FIREBASE_SIGNIN_DELAY_MS: Number(mDelay[1]),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    window: { CBA: opts.noFb ? {} : { fb: { signIn: (t) => calls.push(t) } } }
  };
  env.CBA = env.window.CBA;
  const body = mFn[0].replace(/^function firebaseSignInAfterLoad\(googleIdToken\) \{/, '').replace(/\}$/, '');
  const fn = new Function('googleIdToken', 'env',
    'var firebaseSignInDone = env.firebaseSignInDone;' +
    'var FIREBASE_SIGNIN_DELAY_MS = env.FIREBASE_SIGNIN_DELAY_MS;' +
    'var setTimeout = env.setTimeout; var window = env.window; var CBA = env.CBA;' +
    body +
    '; env.firebaseSignInDone = firebaseSignInDone;');
  return {
    run: t => fn(t, env),
    fire: () => timers.forEach(x => x.fn()),
    timers, calls, env
  };
}

{
  const h = harness();
  h.run('TOKEN');
  ok('⚠️ לא נקרא מיד — נקבע טיימר', h.calls.length === 0 && h.timers.length === 1);
  ok('ההשהיה היא 5000ms', h.timers[0].ms === 5000, String(h.timers[0].ms));
  h.fire();
  ok('אחרי ההשהיה — התחבר עם הטוקן', h.calls.length === 1 && h.calls[0] === 'TOKEN', JSON.stringify(h.calls));
}
{
  const h = harness();
  h.run('TOKEN'); h.run('TOKEN'); h.run('TOKEN');
  ok('⚠️ שלוש קריאות (מטמון+רשת+רענון) = טיימר אחד', h.timers.length === 1, String(h.timers.length));
  h.fire();
  ok('והתחברות אחת בלבד', h.calls.length === 1, String(h.calls.length));
}
{
  const h = harness();
  h.run('');
  ok('בלי טוקן — בלי טיימר ובלי קריאה', h.timers.length === 0 && h.calls.length === 0);
}
{
  const h = harness({ noFb: true });
  let threw = false;
  try { h.run('TOKEN'); } catch (e) { threw = true; }
  ok('⚠️ בלי CBA.fb (הקובץ לא נטען) — לא זורק', !threw);
  ok('ובלי טיימר מיותר', h.timers.length === 0, String(h.timers.length));
}
{
  /* ההתחברות עצמה זורקת — האפליקציה לא אמורה להרגיש */
  const h = harness();
  h.env.window.CBA.fb.signIn = () => { throw new Error('boom'); };
  h.env.CBA = h.env.window.CBA;
  h.run('TOKEN');
  let threw = false;
  try { h.fire(); } catch (e) { threw = true; }
  ok('⚠️ חריגה בהתחברות נבלעת ולא מפילה כלום', !threw);
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
