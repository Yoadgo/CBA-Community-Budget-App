/* לולאת ההתחברות של תושב לא-רשום (22.9.2026).
   הרצה:  node tools/test-login-loop-2026-09-22.js

   🔴 התקלה: תושב חדש לחץ "כניסה עם Google" → השרת ענה "לא ברשימה" →
   מסך הכניסה צויר מחדש → prompt() עם auto_select חיבר שוב את אותו חשבון
   → שוב "לא ברשימה"... ללא סוף ("רענון כל שנייה" בכרום).

   המארז מריץ את הפונקציות **האמיתיות** מ-js/app.js (renderGateButton,
   blockGisAuto, onGoogleLogin) מול Google ושרת מדומים:
   - Google מדומה: prompt() מחזיר מיד תשובה select_by:"auto" כל עוד
     auto-select לא כובה — בדיוק כמו תושב שכבר אישר את החשבון.
   - השרת המדומה: עונה "לא ברשימה" (או שגיאת רשת).
   בודק שמספר קריאות ההתחברות לשרת נעצר על 1, ושגם עותק HEAD (לפני
   התיקון) אכן נכנס ללולאה — אחרת הבדיקה לא מוכיחה כלום. */
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const APP = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
let HEAD_APP = null;
/* העותק שלפני התיקון: ההורה של הקומיט הראשון שהכניס את gisAutoBlocked. */
try {
  const cwd = path.join(__dirname, '..');
  const first = cp.execSync('git log -S gisAutoBlocked --format=%h -- js/app.js', { cwd, encoding: 'utf8' }).trim().split('\n').pop();
  HEAD_APP = cp.execSync('git show ' + (first ? first + '^' : 'HEAD') + ':js/app.js', { cwd, encoding: 'utf8', maxBuffer: 1e8 });
} catch (e) {}

function grab(src, re) { const m = src.match(re); return m ? m[0] : ''; }

function run(src, serverMode, firstSelectBy) {
  const fnGate  = grab(src, /  function renderGateButton\(\) \{[\s\S]*?\n  \}\n/);
  const fnLogin = grab(src, /  function onGoogleLogin\(resp\) \{[\s\S]*?\n  \}\n/);
  const fnBlock = grab(src, /  let gisAutoBlocked = false;\n  function blockGisAuto\(\) \{[\s\S]*?\n  \}\n/);
  const state = { fetches: 0, prompts: 0, autoOff: false, queue: [] };
  const id = {
    initialize() {}, renderButton(el) { el.childElementCount = 1; },
    prompt() { state.prompts++; if (!state.autoOff) state.queue.push({ credential: 'tok', select_by: 'auto' }); },
    cancel() {}, disableAutoSelect() { state.autoOff = true; }
  };
  const gateEl = { childElementCount: 0 };
  const box = {
    window: {}, google: { accounts: { id } }, state, gateEl, String, RegExp,
    document: { getElementById: () => gateEl },
    CBA: { sheets: { url: 'x', load() {} } },
    fetch() {
      state.fetches++;
      if (serverMode === 'neterr') return { then() { return { then() { return { catch(f) { f(); } }; } }; } };
      const data = { ok: true, authorized: false, email: 'new@x.com', name: 'חדש' };
      return { then(f) { f({ json: () => data }); return { then(g) { g(data); return { catch() {} }; } }; } };
    }
  };
  box.window.google = box.google;
  vm.createContext(box);
  vm.runInContext(
    'var googleReady = true, loginError = null, currentUser = null, signupToken = null, signupPrefill = null, inited = false;\n' +
    'function initGoogle() {}\n' +
    'function showLoginConnecting() {}\nfunction gisDisarm() {}\n' +
    'function showLoginGate() { gateEl.childElementCount = 0; renderGateButton(); }\n' +
    (fnBlock || '') + fnGate + fnLogin +
    'this.onGoogleLogin = onGoogleLogin;', box);
  box.onGoogleLogin({ credential: 'tok', select_by: firstSelectBy || 'btn' });   // התושב לוחץ על הכפתור
  let guard = 0;
  while (state.queue.length && guard++ < 50) box.onGoogleLogin(state.queue.shift());
  return state;
}

console.log('\n1. ההוכחה שהבאג אמיתי — עותק HEAD לפני התיקון');
if (HEAD_APP && !/gisAutoBlocked/.test(HEAD_APP)) {
  const s = run(HEAD_APP, 'notlisted');
  ok('🔴 לפני התיקון: הלולאה רצה (עשרות קריאות התחברות)', s.fetches > 10, 'fetches=' + s.fetches);
} else console.log('  (דילוג — HEAD כבר כולל את התיקון)');

console.log('\n2. אחרי התיקון');
ok('הפונקציות נמצאו בקוד', /function blockGisAuto\(\)/.test(APP) && /function renderGateButton\(\)/.test(APP));
let s = run(APP, 'notlisted');
ok('🔴 תושב לא-רשום: קריאת התחברות אחת בלבד', s.fetches === 1, 'fetches=' + s.fetches);
ok('auto-select כובה אצל Google', s.autoOff === true);
s = run(APP, 'neterr');
ok('🔴 שגיאת רשת: גם לא נכנסת ללולאה', s.fetches === 1, 'fetches=' + s.fetches);
ok('⚠️ התחברות ראשונה אוטומטית (לפני דחייה) עדיין מתקבלת — לתושב רשום לא השתנה כלום',
   run(APP, 'notlisted', 'auto').fetches === 1);
ok('⚠️ prompt() עדיין נקרא בכניסה רגילה (One-Tap לחוזרים נשמר)',
   /if \(!gisAutoBlocked\) google\.accounts\.id\.prompt\(\);/.test(APP));
ok('⚠️ ענף "מחובר" לא נוגע בחסימה', !/data\.authorized\) \{[\s\S]{0,300}blockGisAuto/.test(APP));

console.log('\n3. מסך לבן באייפון (וואטסאפ) — כרטיס "פתחו בספארי"');
/* הבדיקה החזותית/התנהגותית המלאה (Playwright, 390px) רצה ב-22.9 מול הקוד הזה:
   UA של וואטסאפ → כרטיס מיד; ספארי → אין כרטיס, לחיצה על Google בלי
   תשובה → כרטיס "נתקעתם?" אחרי 15ש' (לא אחרי 5); תשובה מ-Google מנטרלת. */
ok('הכרטיס נבנה במסך הכניסה כשמזוהה דפדפן פנימי',
   /'<div id="gate-help">' \+ \(inAppBrowser\(\) \? gateHelpHTML\("inapp"\) : ""\) \+ '<\/div>'/.test(APP));
ok('וואטסאפ מזוהה', /\/WhatsApp\/i\.test\(ua\)/.test(APP));
ok('🔴 onGoogleLogin מנטרל את רשת הביטחון', /gisDisarm\(\);   \/\/ התשובה הגיעה/.test(APP));
ok('רשת הביטחון: 15 שניות', /var GIS_STUCK_MS = 15000;/.test(APP));
ok('⚠️ "העמוד הוסתר" מסמן לחיצה רק באייפון', /if \(!gisArmedAt && isIOSDevice\(\)\) gisArm\(\);/.test(APP));
ok('⚠️ הכרטיס לא מוצג אם יש משתמש או שהשער סגור', /return !!\(g && !g\.hidden && !currentUser/.test(APP));
ok('פתיחה בספארי דרך x-safari-, עם גיבוי של העתקת קישור',
   /location\.href = "x-safari-" \+ url;/.test(APP) && /if \(!left\) copySiteUrl\(\);/.test(APP));
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css/style.css'), 'utf8');
ok('העיצוב קיים', /\.login-inapp \{/.test(CSS));

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
