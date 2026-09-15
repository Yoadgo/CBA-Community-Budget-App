
/* בדיקות לפעימה החיה (צעד 10, 2026-09-15).
   הרצה:  node tools/test-live-pulse.js

   מריץ את js/data/sheets.js ואת apps-script/Code.gs **האמיתיים**.

   🔴🔴 מה המארז הזה שומר עליו — הפעימה מחליפה את **הלב** של האפליקציה,
   ולכן כל כשל כאן הוא "המסך מציג נתון ישן ואף אחד לא יודע":
     1. **הכרעה אחת, לא שתיים.** הסקר והפעימה חייבים להגיע לאותה החלטה
        בדיוק מאותם מונים. שתי הכרעות מקבילות נפרדות בשקט בשינוי הראשון.
     2. **ההודעה הראשונה אינה שינוי.** onSnapshot יורה מיד עם המצב
        הנוכחי; בלי שער, כל טעינת עמוד הייתה מושכת מטען מלא שני.
     3. **הדוקר האיטי אינו קישוט.** שינוי שנעשה ישירות בגיליון אינו
        מרים מונה, וכתיבת הפעימה היא "שגר ושכח" שעלולה להיכשל בשקט.
     4. **כשל במאזין = חזרה מיידית לסקר**, לא מסך קפוא. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'sheets.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const FB  = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'firebase.js'), 'utf8');
const GS  = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

const CUR = 'תשפ"ז';

/* ---------- סביבת הלקוח ---------- */
let fetchLog, payloadRev, payloadDomains;
function makeEnv() {
  fetchLog = [];
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: (url) => {
      const u = String(url);
      fetchLog.push(u);
      if (/action=rev/.test(u)) {
        return Promise.resolve({ json: () => Promise.resolve({ ok: true, rev: payloadRev, domains: payloadDomains }) });
      }
      return Promise.resolve({ json: () => Promise.resolve(payload()) });
    }
  };
  sandbox.window = sandbox;
  sandbox.CBA = { mock: store, authSession: 'SESS', esc: s => String(s),
                  isSuper: true, perms: ['תקציב'], user: { familyId: '' },
                  data: {}, fb: null };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function payload() {
  const yr = { budget: [], income: [], groups: [], splits: [], items: [], transactions: [] };
  return { ok: true, rev: payloadRev, domains: payloadDomains,
           years: [CUR], currentYear: CUR, settings: {}, notes: {}, groups: [],
           updates: [], notesLog: [], data: { [CUR]: yr } };
}

/* ================================================================= */
section('1. השרת — מסמך הפעימה');
ok('מסמך הפעימה הוא appConfig/rev', /var FS_PULSE_DOC = 'appConfig\/rev';/.test(GS));
/* 🔴 appConfig כבר מוגדר בכללי האבטחה כ"השרת כותב, חברים קוראים" —
   ולכן הצעד הזה אינו דורש שינוי כללים בכלל. */
ok('🔴 ולכן אין צורך בשינוי כללי אבטחה', /match \/appConfig\/\{doc\} \{[\s\S]{0,120}allow read: if isMember\(\);[\s\S]{0,60}allow write: if false;/
   .test(fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8')));
ok('bumpRev_ כותב את הפעימה', /fsSet_\(FS_PULSE_DOC, \{ n: n \+ 1, domains: map/.test(GS));
ok('🔴 והמספר שנכתב זהה למה שנשמר ב-Script Properties',
   /props\.setProperty\(REV_KEY, String\(n \+ 1\)\);/.test(GS) &&
   /fsSet_\(FS_PULSE_DOC, \{ n: n \+ 1,/.test(GS));
ok('⚠️ שגר ושכח — כשל בכתיבה אינו מפיל את הפעולה',
   /try \{\s*\n\s*fsSet_\(FS_PULSE_DOC[\s\S]{0,140}catch \(e2\) \{/.test(GS));
ok('🔴 ומאחורי דגל שאפשר לכבות בלי דיפלוי', /if \(pulseUseFirestore_\(\)\) \{/.test(GS));
ok('⚠️ והדגל נקרא במטמון קצר (bumpRev_ רץ בכל כתיבה)',
   /function pulseUseFirestore_\(\)[\s\S]{0,900}c\.put\('cba_flag_pulse'/.test(GS));
ok('pulseToFirestore ברשימת הדגלים הסגורה', /'pulseToFirestore'\]/.test(GS));

section('2. הלקוח — מאזין');
ok('watchDoc קיים ומיוצא', /function watchDoc\(collection, id, cb\)/.test(FB) && /watchDoc: watchDoc,/.test(FB));
ok('🔴 ובלי withTimeout — מאזין אמור להמתין ללא גבול',
   !/function watchDoc\(collection, id, cb\) \{\s*\n\s*cb = withTimeout/.test(FB));
ok('⚠️ ומחזיר פונקציית ניתוק', /return function \(\) \{\s*\n\s*stopped = true;/.test(FB));
ok('שגיאה באמצע החיים מגיעה ל-cb', /\}, function \(e\) \{[\s\S]{0,120}if \(!stopped\) cb\(e\);/.test(FB));

section('3. app.js — הסקר שותק כשהמאזין חי');
ok('יש דופק איטי', /var PULSE_SLOW_MS = 120000;/.test(APP));
ok('🔴 והטיק התקופתי מדלג כשהמאזין חי',
   /if \(!force && !pulseDoc && pulseOn && \(Date\.now\(\) - lastCycleAt\) < PULSE_SLOW_MS\) return;/.test(APP));
/* 🔴 כל טריגר שנובע מפעולה של המשתמש חייב לעקוף את ההשתקה — אחרת
   "שמרתי ולא קרה כלום" חוזר, וזה בדיוק הבאג שהסקר המהיר בא לפתור. */
ok('🔴 וכל טריגר מפורש כופה מחזור',
   (APP.match(/doPoll\(true\)/g) || []).length === 4,
   String((APP.match(/doPoll\(true\)/g) || []).length));
ok('⚠️ והטיק התקופתי עצמו אינו כופה', /setInterval\(doPoll, POLL_MS\);/.test(APP));
ok('🔴 ושני המסלולים חולקים מטפל תוצאה אחד',
   /function applyRefreshResult\(ok, info\)/.test(APP) &&
   (APP.match(/applyRefreshResult\)/g) || []).length === 2);
ok('כשל במאזין מחזיר לסקר המלא', /pulseOn = false;[\s\S]{0,200}חוזרים לסקר/.test(APP) ||
   /if \(err2\) \{[\s\S]{0,160}pulseOn = false;/.test(APP));
ok('⚠️ ברירת המחדל בקוד כבויה — הדלקה דרך flagSet', /var PULSE_DEFAULT = false;/.test(APP));
ok('⚠️ ואין קיצור על הקבוע (אחרת flagSet לעולם לא מדליק)',
   !/if \(!PULSE_DEFAULT\) return/.test(APP));

(async function () {
  /* =============================================================== */
  section('4. 🔴 הכרעה אחת — הפעימה והסקר מגיעים לאותה תוצאה');
  let env = makeEnv(); let S = env.CBA.sheets;
  payloadRev = 100; payloadDomains = { budget: 1, other: 1 };
  await new Promise(r => S.load(() => r())); await wait(20);
  const afterLoad = fetchLog.length;

  /* אותו מונה — שתי הדרכים חייבות לומר "לא השתנה" */
  let viaPoll = await new Promise(r => S.refreshIfChanged((ok2, i) => r(i && i.source)));
  let viaPulse = await new Promise(r => S.applyPulse({ n: 100, domains: { budget: 1, other: 1 } }, (ok2, i) => r(i && i.source)));
  ok('מונה זהה: הסקר אומר "לא השתנה"', viaPoll === 'unchanged', String(viaPoll));
  ok('🔴 והפעימה אומרת בדיוק אותו דבר', viaPulse === 'unchanged', String(viaPulse));
  ok('⚠️ והפעימה לא עשתה שום קריאת רשת',
     fetchLog.filter(u => !/action=rev/.test(u)).length === afterLoad,
     String(fetchLog.length));

  /* תחום לא רלוונטי זז — שתיהן מתעלמות */
  viaPulse = await new Promise(r => S.applyPulse({ n: 101, domains: { budget: 1, other: 1, garden: 9 } }, (ok2, i) => r(i && i.source)));
  ok('⚠️ תחום לא רלוונטי זז — הפעימה מתעלמת', viaPulse === 'unchanged', String(viaPulse));

  /* תחום רלוונטי זז — משיכה מלאה */
  const before = fetchLog.length;
  payloadRev = 102; payloadDomains = { budget: 2, other: 1 };
  viaPulse = await new Promise(r => S.applyPulse({ n: 102, domains: { budget: 2, other: 1 } }, (ok2, i) => r(i && i.source)));
  ok('🔴 תחום התקציב זז — הפעימה מושכת מטען מלא', viaPulse === 'fresh', String(viaPulse));
  ok('⚠️ ובאמת יצאה משיכה', fetchLog.length > before);

  /* =============================================================== */
  section('5. 🔴 ההודעה הראשונה של onSnapshot אינה שינוי');
  env = makeEnv(); S = env.CBA.sheets;
  payloadRev = 200; payloadDomains = { budget: 5, other: 1 };
  /* לפני שהטעינה הסתיימה — lastRev עדיין null */
  const early = await new Promise(r => S.applyPulse({ n: 200, domains: { budget: 5, other: 1 } }, (ok2, i) => r(i && i.source)));
  ok('🔴 פעימה לפני שהטעינה הסתיימה — מתעלמים', early === 'unchanged', String(early));
  ok('⚠️ ולא יצאה שום קריאה', fetchLog.length === 0, String(fetchLog.length));
  await new Promise(r => S.load(() => r())); await wait(20);
  const n1 = fetchLog.length;
  /* ההודעה הראשונה אחרי הטעינה נושאת בדיוק את אותו מונה */
  const firstSnap = await new Promise(r => S.applyPulse({ n: 200, domains: { budget: 5, other: 1 } }, (ok2, i) => r(i && i.source)));
  ok('🔴 ההודעה הראשונה = אותו מונה = אין משיכה שנייה', firstSnap === 'unchanged', String(firstSnap));
  ok('⚠️ ומספר הקריאות לא זז', fetchLog.length === n1, String(fetchLog.length - n1));

  section('6. מסמך פגום/חסר אינו שגיאה');
  for (const bad of [null, {}, { n: 'x' }, { domains: {} }]) {
    const r2 = await new Promise(r => S.applyPulse(bad, (ok2, i) => r(i && i.source)));
    ok('מסמך ' + JSON.stringify(bad) + ' → "לא השתנה"', r2 === 'unchanged', String(r2));
  }

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
