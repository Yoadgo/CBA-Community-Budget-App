/* ============================================================================
   test-lazy-groups-2026-10-03.js — טעינת מסכי ניהול לפי דרישה (3.10.2026)
   מה יכול להישבר בשקט:
     1. קובץ שנמצא גם ב-index.html וגם במניפסט (נטען פעמיים) או באף אחד (מסך נעלם).
     2. מסך באזור הניהול שאף אחד לא מגדיר — לא קובץ ליבה ולא קבוצה.
     3. קובץ ליבה שקורא לייצוא של קובץ-לפי-דרישה בלי לעבור דרך CBA.lazy —
        הקריאה "לא עושה כלום" בפעם הראשונה, בלי שגיאה.
     4. הסדר בתוך קבוצה השתנה ← תלות שבורה (notes.js לפני planning.js וכו').
     5. הטוען: טעינה כפולה, כשל שתוקע לנצח, ensure שלא מריץ.
   הרצה: node tools/test-lazy-groups-2026-10-03.js
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); } }
function section(t) { console.log('\n' + t); }

/* המניפסט כאובייקט (מריצים אותו ב-vm) */
const manCtx = { window: {} }; manCtx.window.CBA = {}; vm.createContext(manCtx);
vm.runInContext(R('js/lazyManifest.js').replace(/^window\.CBA = .*$/m, '').replace(/^CBA\./m, 'window.CBA.'), manCtx);
const MAN = manCtx.window.CBA.lazyManifest;
const lazyFiles = [].concat(...Object.keys(MAN).map(g => MAN[g].files.map(f => f.split('?')[0])));
const lazyScreens = [].concat(...Object.keys(MAN).map(g => MAN[g].screens));
const IDX = R('index.html');
const indexFiles = (IDX.match(/<script defer src="(js\/[^"?]+)/g) || []).map(t => t.replace('<script defer src="', ''));

/* ---------- 1. index.html ↔ manifest ---------- */
section('1. כל קובץ JS נטען פעם אחת בדיוק — או מ-index.html או מהמניפסט');
{
  ok('4 קבוצות במניפסט', Object.keys(MAN).length === 4, Object.keys(MAN).join(','));
  ok('22 קבצים לפי דרישה', lazyFiles.length === 22, String(lazyFiles.length));
  const both = lazyFiles.filter(f => indexFiles.indexOf(f) !== -1);
  ok('🔴 אף קובץ לא גם ב-index.html וגם במניפסט', both.length === 0, both.join(','));
  const allJs = [];
  (function walk(d) { fs.readdirSync(d).forEach(f => { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) allJs.push(path.relative(ROOT, p)); }); })(path.join(ROOT, 'js'));
  const orphan = allJs.filter(f => indexFiles.indexOf(f) === -1 && lazyFiles.indexOf(f) === -1);
  ok('🔴 אין קובץ תחת js/ שלא נטען מאף מקום', orphan.length === 0, orphan.join(','));
  const missing = lazyFiles.filter(f => !fs.existsSync(path.join(ROOT, f)));
  ok('כל קבצי המניפסט קיימים בדיסק', missing.length === 0, missing.join(','));
  ok('index.html טוען את lazyManifest.js ואז lazy.js, לפני app.js',
     indexFiles.indexOf('js/lazyManifest.js') !== -1 && indexFiles.indexOf('js/lazy.js') === indexFiles.indexOf('js/lazyManifest.js') + 1 &&
     indexFiles.indexOf('js/lazy.js') < indexFiles.indexOf('js/app.js'));
  const stamp = require('./stamp-versions.js');
  ok('🔴 stamp-versions --check ירוק (כולל ?v= במניפסט)', stamp.check().length === 0, stamp.check().slice(0, 2).join(' | '));
  const sw = R('service-worker.js');
  ok('🔴 ה-service worker מכיר את כל קבצי המניפסט (אחרת ימחק אותם כיתומים)', lazyFiles.every(f => sw.indexOf(JSON.stringify(f) + ':') !== -1));
}

/* ---------- 2. כל מסך ניהול מוגדר איפשהו ---------- */
section('2. כל מסך באזור הניהול מוגדר — בליבה או בקבוצה');
{
  const APP = R('js/app.js');
  const m = APP.match(/admin:\s*\{[\s\S]{0,400}?screens:\s*\[([^\]]+)\]/);
  const adminScreens = m ? m[1].match(/"([A-Za-z]+)"/g).map(x => x.replace(/"/g, '')) : [];
  ok('נמצאה רשימת מסכי הניהול ב-AREAS_ALL (' + adminScreens.length + ')', adminScreens.length > 10);
  const coreSrc = indexFiles.map(f => R(f)).join('\n');
  const definedInCore = name => new RegExp('CBA\\.screens\\.' + name + '\\s*=').test(coreSrc) || new RegExp('CBA\\.screens\\["' + name + '"\\]\\s*=').test(coreSrc);
  const definedLazy = name => lazyScreens.indexOf(name) !== -1;
  const undefinedScreens = adminScreens.filter(n => !definedInCore(n) && !definedLazy(n));
  ok('🔴 אין מסך ניהול שאף אחד לא מגדיר', undefinedScreens.length === 0, undefinedScreens.join(','));
  const lazySrc = lazyFiles.map(f => R(f)).join('\n');
  const notReallyLazy = lazyScreens.filter(n => !(new RegExp('CBA\\.screens\\.' + n + '\\s*=').test(lazySrc) || /var SCREEN = "weworkAdmin"/.test(lazySrc) && n === 'weworkAdmin'));
  ok('כל מסך שהמניפסט מבטיח באמת מוגדר בקבצי הקבוצה', notReallyLazy.length === 0, notReallyLazy.join(','));
  ok('מסכי תושב נשארו בליבה (resHome, resSubmit, resServices, resCommittee, events)', ['resHome', 'resSubmit', 'resServices', 'resCommittee', 'events'].every(definedInCore));
}

/* ---------- 3. קריאות מהליבה לייצואים של קבצים לפי דרישה ---------- */
section('3. הליבה לא נשענת על קבוצה בלי לעבור דרך CBA.lazy');
{
  const exportsOf = src => {
    const out = new Set();
    for (const m of src.matchAll(/\bCBA\.screens\.([A-Za-z0-9_]+)\s*=/g)) out.add('CBA.screens.' + m[1]);
    for (const m of src.matchAll(/\bCBA\.([A-Za-z0-9_]+)\s*=(?!=)/g)) if (!['screens', 'mock', 'renderSilent', 'connected', 'authSession', 'navigate', 'pulseState', 'startPulse'].includes(m[1])) out.add('CBA.' + m[1]);
    return [...out];
  };
  const lazyExports = new Set([].concat(...lazyFiles.map(f => exportsOf(R(f)))));
  // רשימת ההיתר: מקומות שנבדקו ידנית ב-3.10 ועוברים דרך CBA.lazy / בדיקת קיום עם נפילה סבירה
  const allowed = {
    'js/app.js': ['CBA.screens.expenses'],
    'js/ui/mobile.js': ['CBA.screens.expenses'],
    'js/ui/search.js': ['CBA.screens.expenses'],
    'js/screens/homeGarden.js': ['CBA.gardenOpenCard'],
    'js/screens/services.js': ['CBA.screens.servicesAdmin'],
  };
  const violations = [];
  const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  indexFiles.filter(f => f !== 'js/lazy.js' && f !== 'js/lazyManifest.js').forEach(f => {
    const src = stripComments(R(f));
    lazyExports.forEach(sym => {
      const re = new RegExp(sym.replace(/\./g, '\\.') + '(?![A-Za-z0-9_])');
      if (!re.test(src)) return;
      if (!(allowed[f] || []).includes(sym)) violations.push(f + ' → ' + sym);
    });
  });
  ok('🔴 אין קריאה חדשה מהליבה לייצוא של קבוצה מחוץ לרשימת ההיתר', violations.length === 0, violations.join(' | '));
  const APP = R('js/app.js');
  ok('app.js: showScreen טוען קבוצה חסרה (CBA.lazy.load) ומצייר שלד', /if \(!screen && CBA\.lazy && CBA\.lazy\.groupFor\(name\)\)/.test(APP) && /CBA\.lazy\.load\(name\)\.then/.test(APP));
  ok('app.js: קישור עמוק (go=) מקבל גם מסך לפי דרישה', /CBA\.lazy\.groupFor\(name\)\)\)\) return;/.test(APP));
  ok('app.js: "הוצאות ממתינות" עובר דרך gotoExpensesPending בשני המקומות', (APP.match(/(?<!function )gotoExpensesPending\(\)/g) || []).length === 2 && /function gotoExpensesPending\(\)/.test(APP));
  ok('app.js: חימום רק למנהלים, אחרי הציור הראשון, בהשהיה', /if \(CBA\.lazy && hasAnyAdmin\(\)\) \{\s*setTimeout\(function \(\) \{ try \{ CBA\.lazy\.warm\(CBA\.perms, CBA\.isSuper === true\)/.test(APP));
  ok('homeGarden.js: פתיחת כרטיס טוענת את gardenTasks אם חסר', /CBA\.lazy\.load\("gardenTasks"\)/.test(R('js/screens/homeGarden.js')));
  ok('services.js: קיצור העריכה מוצג גם לפני ש-servicesAdmin נטען', /CBA\.lazy\.groupFor\("servicesAdmin"\)/.test(R('js/screens/services.js')));
  ok('mobile.js: הוספת הוצאה מהבר עוברת דרך CBA.lazy.ensure', /CBA\.lazy\.ensure\("expenses", openAdd\)/.test(R('js/ui/mobile.js')));
}

/* ---------- 4. סדר בתוך קבוצה ---------- */
section('4. הסדר בתוך כל קבוצה = הסדר שהיה ב-index.html לפני הפיצול');
{
  const before = ['js/screens/budget.js', 'js/screens/expenses.js', 'js/screens/notes.js', 'js/screens/planning.js', 'js/screens/clubAdmin.js', 'js/screens/gymAdmin.js', 'js/screens/doorAdmin.js', 'js/screens/weworkAdmin.js', 'js/screens/residents.js', 'js/screens/emailSettings.js', 'js/screens/appReports.js', 'js/screens/sysStatus.js', 'js/screens/sysHub.js', 'js/screens/reconcile.js', 'js/screens/servicesAdmin.js', 'js/screens/servicesCategoriesAdmin.js', 'js/data/gardenSlots.js', 'js/screens/gardenPlan.js', 'js/screens/gardenStats.js', 'js/screens/gardenSchedule.js', 'js/screens/gardenScheduleAi.js', 'js/screens/gardenTasks.js'];
  Object.keys(MAN).forEach(g => {
    const files = MAN[g].files.map(f => f.split('?')[0]);
    const idx = files.map(f => before.indexOf(f));
    ok('קבוצה ' + g + ': סדר יחסי נשמר', idx.every((v, i) => v !== -1 && (i === 0 || v > idx[i - 1])), files.join(' > '));
  });
  ok('planning.js אחרי notes.js (planOpenUpdatesModal/planSave באותה קבוצה)', MAN.budget.files.findIndex(f => /notes\.js/.test(f)) < MAN.budget.files.findIndex(f => /planning\.js/.test(f)));
  ok('gardenTasks.js אחרון בקבוצת הגינון (משתמש ב-gardenSchedule/gardenKit)', /gardenTasks\.js/.test(MAN.gardenAdmin.files[MAN.gardenAdmin.files.length - 1]));
}

/* ---------- 5. הטוען עצמו (vm עם document מזויף) ---------- */
section('5. js/lazy.js — טעינה פעם אחת, סדר, כשל שאינו תוקע, ensure, warm');
{
  const injected = [];
  let failOnce = null;
  const head = { appendChild(s) { injected.push(s.src); setTimeout(() => { if (failOnce && s.src.indexOf(failOnce) !== -1) { failOnce = null; s.onerror(); } else s.onload(); }, 1); } };
  const fetched = [];
  const ctx = {
    window: {}, document: { createElement: () => ({}), head },
    fetch: u => { fetched.push(u); return Promise.resolve({}); }, setTimeout, Promise, console, Error, Array, Object,
  };
  ctx.window.CBA = { lazyManifest: { g1: { perms: ['תקציב'], screens: ['s1', 's2'], files: ['a.js?v=1', 'b.js?v=1', 'c.js?v=1'] }, g2: { perms: ['גינון'], screens: ['s3'], files: ['d.js?v=1'] } } };
  ctx.CBA = ctx.window.CBA;
  vm.createContext(ctx);
  vm.runInContext(R('js/lazy.js'), ctx);
  const L = ctx.CBA.lazy;
  (async () => {
    ok('groupFor: מסך → קבוצה, קבוצה → עצמה, לא ידוע → null', L.groupFor('s2') === 'g1' && L.groupFor('g2') === 'g2' && L.groupFor('zzz') === null);
    ok('לפני טעינה: isReady=false', !L.isReady('s1'));
    failOnce = 'b.js';
    let threw = false;
    try { await L.load('s1'); } catch (e) { threw = true; }
    ok('🔴 כשל בקובץ אמצעי — ה-Promise נדחה ולא נתקע', threw && !L.isReady('g1'));
    const p1 = L.load('s1'), p2 = L.load('g1');
    ok('הניסיון הבא מתחיל נקי, ושתי קריאות מקבילות = אותו Promise', p1 === p2);
    await p1;
    ok('אחרי הצלחה: isReady=true, והקבצים הוזרקו בסדר (a,b,c) — a,b פעם נוספת אחרי הכשל', L.isReady('s2') && injected.join(',') === 'a.js?v=1,b.js?v=1,a.js?v=1,b.js?v=1,c.js?v=1', injected.join(','));
    let ran = 0;
    await L.ensure('s3', () => { ran++; });
    ok('ensure טוען קבוצה חסרה ואז מריץ', ran === 1 && L.isReady('g2') && injected[injected.length - 1] === 'd.js?v=1');
    await L.ensure('nope', () => { ran++; });
    ok('ensure בלי קבוצה — מריץ מיד', ran === 2);
    ok('groupsFor: לפי הרשאות; מנהל-על — הכול', L.groupsFor(['גינון'], false).join() === 'g2' && L.groupsFor([], true).join() === 'g1,g2' && L.groupsFor([], false).length === 0);
    // warm: קבוצה שכבר נטענה לא נמשכת שוב; רק fetch, בלי הזרקה
    const before = injected.length;
    const ctx2 = Object.assign({}, ctx); // אותו מודול — warmed כבר false כי לא נקרא
    L.warm(['תקציב', 'גינון'], false);
    await new Promise(r => setTimeout(r, 10));
    ok('warm: אפס הזרקות (fetch בלבד), ולא מושך קבוצות שכבר רצו', injected.length === before && fetched.length === 0);
    console.log('\n====================================================');
    console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
    process.exit(fail ? 1 : 0);
  })();
}
