/* בדיקות לתזמון ההתחברות ל-Firebase — גרסה שלישית (23.9.26, הערב של דר).
   הרצה:  node tools/test-firebase-signin-timing.js

   🔴 **למה המארז הזה קיים, ולמה הוא נכתב מחדש:**
   גרסה 1 (14.9) — requestIdleCallback, הוחזרה לאחור.
   גרסה 2 (14.9) — ההתחברות **אחרי** המשיכה + 5 שניות. נכונה כל עוד Firebase
   היה בונוס. מאז 15-17.9 המטען עצמו ממתין למשתמש Firebase (userReady, 12ש'),
   ולכן "אחרי המשיכה" = מעגל סגור בכל כניסה ראשונה במכשיר. זה מה שהפיל את
   דר ב-23.9 (project doc dar-first-login-forensics-2026-09-23.md).
   גרסה 3 — ההתחברות יוצאת **מיד**, לפני CBA.sheets.load, במקביל למשיכה.

   הבדיקות כאן הן על **הסדר** — מה קורה לפני מה — כי זה בדיוק מה שנשבר. */
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(APP, 'js', 'app.js'), 'utf8');
const SHEETS = fs.readFileSync(path.join(APP, 'js', 'data', 'sheets.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

const mFn = SRC.match(/function firebaseSignInNow\(googleIdToken\) \{[\s\S]*?\n  \}/);

section('1. הקוד עצמו — app.js');
ok('הפונקציה firebaseSignInNow קיימת וחולצה', !!mFn);
ok('⚠️ הקבוע FIREBASE_SIGNIN_DELAY_MS **נמחק** (לא רק הושם 0)', SRC.indexOf('FIREBASE_SIGNIN_DELAY_MS') === -1);
ok('⚠️ השם הישן firebaseSignInAfterLoad אינו קיים יותר', SRC.indexOf('firebaseSignInAfterLoad') === -1);
ok('⚠️ אין setTimeout בגוף ההתחברות (היא מיידית)', mFn && !/setTimeout/.test(mFn[0]));
ok('⚠️ **אין קריאה ל-requestIdleCallback** (גרסה 1)',
   !/requestIdleCallback\s*\(/.test(SRC) && SRC.indexOf('window.requestIdleCallback') === -1);

/* הסדר בתוך onGoogleLogin: איפוס הדגל → expectUser → signIn → load */
const iReset  = SRC.indexOf('firebaseSignInDone = false;');
const iExpect = SRC.indexOf('CBA.fb.expectUser()', iReset);
const iSign   = SRC.indexOf('firebaseSignInNow(resp.credential)', iReset);
const iLoad   = SRC.indexOf('CBA.sheets.load(function (ok, info)', iReset);
ok('הדגל מאופס לפני ההתחברות', iReset > -1 && iReset < iSign);
ok('🔴 expectUser נקראת לפני ההתחברות (ממצא 02 נשמר)', iExpect > -1 && iExpect < iSign);
ok('🔴🔴 ההתחברות יוצאת **לפני** CBA.sheets.load — לא בתוך ה-callback שלו',
   iSign > -1 && iLoad > -1 && iSign < iLoad, JSON.stringify({ iSign, iLoad }));
ok('⚠️ ואין שום קריאה להתחברות בתוך ה-callback של load',
   !/CBA\.sheets\.load\(function \(ok, info\) \{[\s\S]{0,1200}?firebaseSignInNow/.test(SRC));
ok('הקריאה ל-signIn עטופה ב-try/catch',
   /try \{[\s\S]{0,400}?CBA\.fb\.signIn\(googleIdToken[\s\S]{0,1400}?\} catch \(e\) \{\}/.test(SRC));
ok('⚠️ והקישור ל-members קורה רק כשההתחברות הצליחה',
   /CBA\.fb\.signIn\(googleIdToken, function \(err\) \{\s*\n\s*if \(err\) return;/.test(SRC));
ok('יציאה מנתקת גם מ-Firebase', /CBA\.fb\.signOut\(\)/.test(SRC));

section('2. הקוד עצמו — sheets.js (הטעינה הקרה + פסק זמן למטען)');
ok('🔴 הטעינה הקרה ממתינה להתחברות שבדרך (userReady, לא authReady בלבד)',
   /function bootFromFirestore[\s\S]{0,900}?\(CBA\.fb\.userReady \|\| CBA\.fb\.authReady\)\.call\(CBA\.fb/.test(SHEETS));
ok('למטען הראשי יש פסק זמן (PAYLOAD_TIMEOUT_MS)', /var PAYLOAD_TIMEOUT_MS = (\d+);/.test(SHEETS));
ok('והוא לא פחות מ-30 שניות (התעוררות קרה של Apps Script)',
   Number((SHEETS.match(/var PAYLOAD_TIMEOUT_MS = (\d+);/) || [])[1]) >= 30000);
ok('fetchPayload משתמש ב-AbortController', /function fetchPayload[\s\S]{0,1500}?AbortController/.test(SHEETS));

/* ---------- הרצה אמיתית של הגוף שחולץ ---------- */
section('3. התנהגות — firebaseSignInNow (הקוד שחולץ מ-app.js)');
function harness(opts) {
  opts = opts || {};
  const calls = [];
  const env = {
    firebaseSignInDone: false,
    window: { CBA: opts.noFb ? {} : { fb: { signIn: (t) => calls.push(t) } } }
  };
  env.CBA = env.window.CBA;
  const body = mFn[0].replace(/^function firebaseSignInNow\(googleIdToken\) \{/, '').replace(/\}$/, '');
  const fn = new Function('googleIdToken', 'env',
    'var firebaseSignInDone = env.firebaseSignInDone;' +
    'var window = env.window; var CBA = env.CBA;' +
    body +
    '; env.firebaseSignInDone = firebaseSignInDone;');
  return { run: t => fn(t, env), calls, env };
}
{
  const h = harness();
  h.run('TOKEN');
  ok('🔴 נקרא **מיד**, בלי טיימר', h.calls.length === 1 && h.calls[0] === 'TOKEN', JSON.stringify(h.calls));
}
{
  const h = harness();
  h.run('TOKEN'); h.run('TOKEN'); h.run('TOKEN');
  ok('קריאה כפולה = התחברות אחת בלבד', h.calls.length === 1, String(h.calls.length));
}
{
  const h = harness();
  h.run('');
  ok('בלי טוקן — בלי קריאה', h.calls.length === 0);
}
{
  const h = harness({ noFb: true });
  let threw = false;
  try { h.run('TOKEN'); } catch (e) { threw = true; }
  ok('⚠️ בלי CBA.fb (הקובץ לא נטען) — לא זורק', !threw);
}
{
  const h = harness();
  h.env.window.CBA.fb.signIn = () => { throw new Error('boom'); };
  h.env.CBA = h.env.window.CBA;
  let threw = false;
  try { h.run('TOKEN'); } catch (e) { threw = true; }
  ok('⚠️ חריגה בהתחברות נבלעת ולא מפילה כלום', !threw);
}

section('4. התנהגות — fetchPayload עם פסק זמן (הקוד שחולץ מ-sheets.js)');
{
  const mFp = SHEETS.match(/function fetchPayload\(slim, done\) \{[\s\S]*?\n  \}/);
  ok('fetchPayload חולץ', !!mFp);
  function run(fetchImpl) {
    const timers = [];
    const out = [];
    const fn = new Function('fetch', 'setTimeout', 'clearTimeout', 'AbortController', 'API_URL', 'authSession', 'PAYLOAD_TIMEOUT_MS', 'done',
      mFp[0] + '; fetchPayload("2", done);');
    let aborted = false;
    function AC() { this.signal = {}; this.abort = () => { aborted = true; }; }
    fn(fetchImpl,
       (f, ms) => { timers.push({ f, ms }); return timers.length; },
       () => {},
       AC, 'http://x', () => 's', 1234,
       (err, p) => out.push({ err, p }));
    return { timers, out, fire: () => timers.forEach(t => t.f()), get aborted() { return aborted; } };
  }
  /* fetch שלא חוזר לעולם */
  {
    const r = run(() => new Promise(() => {}));
    ok('נקבע טיימר בגובה PAYLOAD_TIMEOUT_MS', r.timers.length === 1 && r.timers[0].ms === 1234, JSON.stringify(r.timers.map(t => t.ms)));
    r.fire();
    ok('🔴 fetch שלא חוזר ⇒ done(err) אחרי פסק הזמן (לא שלד לנצח)', r.out.length === 1 && !!r.out[0].err);
    ok('והבקשה בוטלה (abort)', r.aborted);
  }
  /* fetch שחוזר תקין */
  {
    const r = run(() => Promise.resolve({ json: () => Promise.resolve({ ok: true, x: 1 }) }));
    ok('תשובה תקינה — עדיין נקבע טיימר (מנוקה בסיום)', r.timers.length === 1);
    return_after(() => {
      ok('תשובה תקינה ⇒ done(null, payload) פעם אחת', r.out.length === 1 && !r.out[0].err && r.out[0].p && r.out[0].p.x === 1, JSON.stringify(r.out));
      r.fire();
      ok('⚠️ פסק זמן שמצלצל אחרי תשובה — לא קורא ל-done פעם שנייה', r.out.length === 1, String(r.out.length));
      /* fetch שחוזר ok:false */
      const r2 = run(() => Promise.resolve({ json: () => Promise.resolve({ ok: false, error: 'bad' }) }));
      return_after(() => {
        ok('ok:false ⇒ done(err) עם הודעת השרת', r2.out.length === 1 && r2.out[0].err && /bad/.test(r2.out[0].err.message));
        finish();
      });
    });
  }
}

function return_after(fn) { setTimeout(fn, 0); }
function finish() {
  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
}
