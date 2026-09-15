/* בדיקות לגשר Firebase שבדפדפן  —  hz הרצה:  node tools/test-firebase-bridge.js
   ===========================================================================
   מריץ את js/data/firebase.js **האמיתי** מול DOM מדומה זעיר. בכוונה בלי
   jsdom: הקובץ הנבדק נוגע רק ב-document.createElement/head.appendChild,
   ולכן סטאב של עשר שורות בודק אותו טוב יותר מספרייה של 30MB — ובלי תלות.

   מה נבדק כאן הוא הכלל היחיד שבאמת חשוב בשלב הזה:
   **שום כישלון של Firebase לא מפיל את האפליקציה ולא זורק חריגה.** */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

/* ⚠️ שגיאה שנוצרה בתוך ה-vm אינה instanceof Error של הבדיקה — זה בנאי אחר
   לגמרי. בדיקה כזו הייתה נכשלת על קוד ייצור תקין לחלוטין, ולכן בודקים
   לפי הצורה ולא לפי השושלת. */
const isErr = e => !!e && e !== 'NOTCALLED' && typeof e.message === 'string';

/* ---------- DOM מדומה ---------- */
function makeEnv() {
  const injected = [];          // כל <script> שהקוד ביקש להזריק
  const logs = [];
  const head = {
    appendChild(el) {
      injected.push(el);
      return el;
    }
  };
  /* בדפדפן window *הוא* האובייקט הגלובלי, ולכן `window.CBA = ...` הופך
     גם את `CBA` החשוף לזמין. כדי שהבדיקה תריץ את אותו קוד בדיוק, אנחנו
     מצביעים window על הסביבה עצמה במקום על אובייקט נפרד. */
  const sandbox = {
    document: {
      createElement: () => ({ src: '', async: false, onload: null, onerror: null }),
      head: head
    },
    console: { log: (...a) => logs.push(a.join(' ')) },
    setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  const win = sandbox;
  const baseKeys = Object.keys(sandbox);
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'firebase.js'), 'utf8'),
    sandbox
  );
  return { fb: sandbox.window.CBA.fb, injected, logs, win, baseKeys };
}

/* firebase מדומה — בדיוק המשטח שהקוד שלנו נוגע בו, ולא יותר */
function fakeFirebase(opts) {
  opts = opts || {};
  const calls = { initApps: 0, signIn: [], signOut: 0, getIdToken: 0, listeners: 0 };
  const user = { uid: 'uid-123', email: 'y@x.com',
                 getIdToken: () => { calls.getIdToken++; return Promise.resolve('ID-TOKEN'); } };
  let authCb = null;                 // המאזין שהקוד שלנו רושם
  const auth = () => ({
    onAuthStateChanged: cb => { authCb = cb; calls.listeners++; },
    currentUser: opts.noCurrentUser ? null : user,
    signInWithCredential: c => {
      calls.signIn.push(c);
      return opts.signInFails
        ? Promise.reject(Object.assign(new Error('bad'), { code: 'auth/invalid-credential' }))
        : Promise.resolve({ user: user });
    },
    signOut: () => { calls.signOut++; return opts.signOutFails ? Promise.reject(new Error('x')) : Promise.resolve(); }
  });
  auth.GoogleAuthProvider = { credential: t => ({ kind: 'google', token: t }) };
  return {
    fb: { apps: [], initializeApp(cfg) { calls.initApps++; this.apps.push(cfg); }, auth },
    calls,
    user,
    fireAuthState: u => authCb && authCb(u)      // מדמה את Firebase מודיע על שינוי מצב
  };
}

const wait = ms => new Promise(r => setTimeout(r, ms));
/* מדמה את גוגל: כל סקריפט שהוזרק "נטען" בהצלחה */
function resolveInjected(env, mode) {
  const pending = env.injected.filter(s => !s._done);
  pending.forEach(s => {
    s._done = true;
    if (mode === 'error') s.onerror && s.onerror();
    else s.onload && s.onload();
  });
  return pending.length;
}

(async function () {

  section('1. בעליית העמוד — Firebase לא עולה בכלל (מהירות הפתיחה)');
  {
    const env = makeEnv();
    ok('CBA.fb קיים', !!env.fb);
    ok('⚠️ אף סקריפט לא הוזרק', env.injected.length === 0, String(env.injected.length));
    ok('isReady() = false', env.fb.isReady() === false);
    ok('uid() = null', env.fb.uid() === null);
    ok('selfTest לא זורק', typeof env.fb.selfTest() === 'string');
    ok('גרסת SDK נעוצה ואינה latest', /^\d+\.\d+\.\d+$/.test(env.fb.version), env.fb.version);
    ok('projectId הוא של AtmoSync', env.fb.config.projectId === 'atmosync03030');
  }

  section('2. ensure — שני קבצי SDK, בסדר, אחד אחרי השני');
  {
    const env = makeEnv();
    let err = 'NOTCALLED';
    env.fb.ensure(e => { err = e; });
    ok('הוזרק קובץ אחד בלבד בהתחלה', env.injected.length === 1, String(env.injected.length));
    ok('הראשון הוא firebase-app-compat', /firebase-app-compat\.js$/.test(env.injected[0].src), env.injected[0].src);
    ok('async=true (לא חוסם ציור)', env.injected[0].async === true);
    resolveInjected(env);
    await wait(0);
    ok('רק אחרי שהראשון נטען מוזרק השני', env.injected.length === 2, String(env.injected.length));
    ok('השני הוא firebase-auth-compat', /firebase-auth-compat\.js$/.test(env.injected[1].src), env.injected[1].src);
    const F = fakeFirebase(); env.win.firebase = F.fb;
    resolveInjected(env);
    await wait(0);
    ok('initializeApp נקרא פעם אחת', F.calls.initApps === 1, String(F.calls.initApps));
    ok('הקולבק קיבל null', err === null, String(err));
    ok('isReady() = true', env.fb.isReady() === true);
  }

  section('3. ensure חוזר — לא מזריק שוב, וכל הממתינים נענים');
  {
    const env = makeEnv();
    const got = [];
    env.fb.ensure(e => got.push(e));
    env.fb.ensure(e => got.push(e));
    env.fb.ensure(e => got.push(e));
    ok('⚠️ עדיין הזרקה אחת בלבד', env.injected.length === 1, String(env.injected.length));
    resolveInjected(env); await wait(0);
    env.win.firebase = fakeFirebase().fb;
    resolveInjected(env); await wait(0);
    ok('שלושת הממתינים נענו', got.length === 3, String(got.length));
    ok('כולם קיבלו הצלחה', got.every(e => e === null));
    const before = env.injected.length;
    let again = 'NO';
    env.fb.ensure(e => { again = e; });
    await wait(0);
    ok('קריאה אחרי שהכול מוכן נענית מיד', again === null);
    ok('בלי הזרקה נוספת', env.injected.length === before);
  }

  section('4. gstatic חסום — נכשל בשקט, בלי חריגה');
  {
    const env = makeEnv();
    let err = 'NOTCALLED';
    ok('ensure לא זורק', (() => { try { env.fb.ensure(e => { err = e; }); return true; } catch (e) { return false; } })());
    resolveInjected(env, 'error');
    await wait(0);
    ok('הקולבק קיבל שגיאה', isErr(err), String(err));
    ok('לא הוזרק הקובץ השני', env.injected.length === 1, String(env.injected.length));
    ok('isReady() נשאר false', env.fb.isReady() === false);
    let err2 = 'NOTCALLED';
    env.fb.ensure(e => { err2 = e; });
    await wait(0);
    ok('⚠️ לא מנסה שוב ושוב אחרי כישלון', env.injected.length === 1, String(env.injected.length));
    ok('הקריאה החוזרת נענית מיד בשגיאה', isErr(err2));
  }

  section('5. signIn — המסלול המלא');
  {
    const env = makeEnv();
    let res = null, err = 'NOTCALLED';
    env.fb.signIn('GOOGLE-TOKEN', (e, u) => { err = e; res = u; });
    resolveInjected(env); await wait(0);
    const F = fakeFirebase(); env.win.firebase = F.fb;
    resolveInjected(env); await wait(0); await wait(0);
    ok('הועבר טוקן הגוגל ל-GoogleAuthProvider', F.calls.signIn.length === 1 &&
       F.calls.signIn[0].token === 'GOOGLE-TOKEN', JSON.stringify(F.calls.signIn[0]));
    ok('אין שגיאה', err === null, String(err));
    ok('הוחזרו uid ומייל', res && res.uid === 'uid-123' && res.email === 'y@x.com', JSON.stringify(res));
    ok('uid() מחזיר את המזהה', env.fb.uid() === 'uid-123');
    let tok = null;
    env.fb.idToken((e, t) => { tok = t; });
    await wait(0);
    ok('idToken מחזיר טוקן של Firebase', tok === 'ID-TOKEN', String(tok));
  }

  section('6. signIn נכשל (audience mismatch וכו\') — האפליקציה לא נפגעת');
  {
    const env = makeEnv();
    let err = 'NOTCALLED';
    env.fb.signIn('GOOGLE-TOKEN', e => { err = e; });
    resolveInjected(env); await wait(0);
    env.win.firebase = fakeFirebase({ signInFails: true }).fb;
    resolveInjected(env); await wait(0); await wait(0);
    ok('הקולבק קיבל את השגיאה', err && err.code === 'auth/invalid-credential', String(err && err.code));
    ok('⚠️ uid() נשאר null', env.fb.uid() === null);
    ok('state() מדווח על השגיאה', env.fb.state().lastError === 'auth/invalid-credential',
       JSON.stringify(env.fb.state()));
    ok('selfTest עדיין עובד', /שגיאה אחרונה/.test(env.fb.selfTest()));
  }

  section('7. מקרי קצה');
  {
    const env = makeEnv();
    let e1 = 'NOTCALLED';
    env.fb.signIn('', e => { e1 = e; });
    ok('בלי טוקן — שגיאה מיידית, בלי הזרקה', isErr(e1) && env.injected.length === 0);
    ok('signIn בלי קולבק לא זורק',
       (() => { try { env.fb.signIn(''); return true; } catch (x) { return false; } })());
    ok('signOut לפני שנטען לא זורק',
       (() => { try { env.fb.signOut(); return true; } catch (x) { return false; } })());
    let e2 = 'NOTCALLED';
    env.fb.idToken(e => { e2 = e; });
    ok('idToken לפני טעינה מחזיר שגיאה ולא זורק', isErr(e2));
  }

  section('8. signOut אחרי התחברות');
  {
    const env = makeEnv();
    env.fb.signIn('T', () => {});
    resolveInjected(env); await wait(0);
    const F = fakeFirebase({ signOutFails: true }); env.win.firebase = F.fb;
    resolveInjected(env); await wait(0); await wait(0);
    ok('התחבר', env.fb.uid() === 'uid-123');
    ok('signOut לא זורק גם כשהוא נכשל',
       (() => { try { env.fb.signOut(); return true; } catch (x) { return false; } })());
    ok('uid() התאפס מיד ולא מחכה לרשת', env.fb.uid() === null);
    ok('signOut הועבר ל-SDK', F.calls.signOut === 1, String(F.calls.signOut));
  }

  section('9. מושב שנשמר במכשיר — uid() אמיתי גם בלי signIn (רענון עמוד)');
  {
    const env = makeEnv();
    env.fb.ensure(() => {});
    resolveInjected(env); await wait(0);
    const F = fakeFirebase(); env.win.firebase = F.fb;
    resolveInjected(env); await wait(0);
    ok('נרשם מאזין מצב אחד', F.calls.listeners === 1, String(F.calls.listeners));
    ok('לפני שהמאזין דיווח — אין משתמש', env.fb.uid() === null);
    F.fireAuthState(F.user);
    ok('⚠️ אחרי שחזור מושב uid() אמיתי, בלי signIn', env.fb.uid() === 'uid-123', String(env.fb.uid()));
    ok('signIn לא נקרא בכלל', F.calls.signIn.length === 0);
    F.fireAuthState(null);
    ok('יציאה מדווחת מתאפסת', env.fb.uid() === null);
  }

  section('10. שום דבר לא זולג ל-window מלבד CBA');
  {
    const env = makeEnv();
    const added = Object.keys(env.win).filter(k => env.baseKeys.indexOf(k) === -1);
    ok('נוסף ל-window רק CBA', added.length === 1 && added[0] === 'CBA', added.join(','));
  }

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
