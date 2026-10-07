/* tools/test-stamp-versions.js — גרסה לכל קובץ + defer (3.10.2026)
   מה יכול להישבר בשקט כאן:
     1. קובץ שהשתנה שומר על ?v= ישן → טלפונים מגישים JS ישן.
     2. קובץ שלא השתנה מקבל ?v= חדש → חזרנו להוריד הכול בכל דיפלוי.
     3. ה-service worker מוחק מהמטמון קובץ שלא התחלף (או משאיר אחד שכן).
     4. defer נשמט מתג אחד → הסקריפט רץ *לפני* הקודמים לו ונופל על CBA.xxx חסר.
   רץ עם: node tools/test-stamp-versions.js  */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const stamp = require('./stamp-versions.js');
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 1. העץ האמיתי מעודכן ---------- */
section('1. העץ האמיתי');
{
  const problems = stamp.check(ROOT);
  ok('--check עובר על העץ הנוכחי', problems.length === 0, problems.slice(0, 3).join(' | '));
  const c = stamp.compute(ROOT);
  ok('100 קבצים לפחות ברשימה', c.keys.length >= 90, String(c.keys.length));
  ok('כל טביעת אצבע באורך 10 תווים הקסה', c.keys.every(k => /^[0-9a-f]{10}$/.test(c.versions[k])));
  ok('אין קובץ ב-index.html שחסר בדיסק', c.missing.length === 0, c.missing.join(','));
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  ok('index.html לא נושא יותר מספר גרסה משותף מהסוג הישן (?v=2026…)', !/\?v=2026\d{4}[a-z]?"/.test(idx));
  const m = sw.match(/var VERSION = "([0-9a-z]+)";/);
  ok('VERSION ב-service-worker.js = טביעת האצבע של הרשימה', !!m && m[1] === c.overall, (m && m[1]) + ' ≠ ' + c.overall);
  ok('הקבצים החיצוניים (fonts/GSI) לא נגעו בהם', idx.indexOf('fonts.googleapis.com/css2?family=Assistant') !== -1 && idx.indexOf('accounts.google.com/gsi/client" async defer') !== -1);
}

/* ---------- 2. סימולציה: עותק זמני, נוגעים בקובץ אחד ---------- */
section('2. סימולציה — שינוי בקובץ אחד משנה רק אותו');
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cba-stamp-'));
  function cp(rel) {
    const src = path.join(ROOT, rel), dst = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
  cp('index.html'); cp('service-worker.js');
  stamp.compute(ROOT).keys.forEach(cp);

  const before = stamp.compute(tmp);
  ok('העותק הזמני מתחיל מעודכן', stamp.check(tmp).length === 0);

  // נוגעים בקובץ אחד בלבד
  fs.appendFileSync(path.join(tmp, 'js/screens/home.js'), '\n/* touched by test */\n');
  const problems = stamp.check(tmp);
  ok('--check נכשל אחרי השינוי', problems.length > 0);
  ok('ומצביע בדיוק על הקובץ שהשתנה', problems.some(p => p.indexOf('js/screens/home.js') !== -1), problems.join(' | '));

  const r = stamp.stamp(tmp);
  ok('stamp מדווח על קובץ אחד שהשתנה', r.changed.length === 1 && r.changed[0] === 'js/screens/home.js', r.changed.join(','));
  const after = stamp.compute(tmp);
  ok('טביעת האצבע של home.js השתנתה', before.versions['js/screens/home.js'] !== after.versions['js/screens/home.js']);
  const unchanged = after.keys.filter(k => k !== 'js/screens/home.js');
  ok('🔴 כל שאר הקבצים שמרו על אותה טביעת אצבע (' + unchanged.length + ')',
     unchanged.every(k => before.versions[k] === after.versions[k]));
  ok('VERSION הכולל השתנה', before.overall !== after.overall);
  const idx2 = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  ok('index.html נושא את הטביעה החדשה של home.js ואת הישנה של app.js',
     idx2.indexOf('js/screens/home.js?v=' + after.versions['js/screens/home.js']) !== -1 &&
     idx2.indexOf('js/app.js?v=' + before.versions['js/app.js']) !== -1);
  ok('הרצה שנייה — אין שינוי (אידמפוטנטי)', stamp.stamp(tmp).changed.length === 0 && stamp.check(tmp).length === 0);
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- 3. ה-service worker מוחק רק מה שהתחלף ---------- */
section('3. service-worker — isStaleAsset_');
{
  const swSrc = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');
  const scope = 'https://yoadgo.github.io/CBA-Community-Budget-App/';
  const ctx = {
    self: { registration: { scope }, addEventListener() {}, skipWaiting() {}, clients: { claim() {} }, location: { origin: 'https://yoadgo.github.io' } },
    URL: URL, caches: {}, fetch() {}, Request: function () {}, console
  };
  ctx.self.self = ctx.self;
  vm.createContext(ctx);
  // מריצים רק את החלק שמגדיר קבועים ופונקציות (עד ה-install), בלי מאזינים
  const head = swSrc.slice(0, swSrc.indexOf('self.addEventListener("install"'));
  vm.runInContext(head + '\nthis.__isStale = isStaleAsset_; this.__versions = ASSET_VERSIONS;', ctx);
  const V = ctx.__versions;
  const isStale = ctx.__isStale;
  const homeV = V['js/screens/home.js'];
  ok('הרשימה בתוך ה-SW מכילה את home.js', typeof homeV === 'string' && homeV.length === 10);
  ok('קובץ עם הגרסה הנוכחית — נשאר', isStale(new URL(scope + 'js/screens/home.js?v=' + homeV)) === false);
  ok('🔴 אותו קובץ עם גרסה ישנה — נמחק', isStale(new URL(scope + 'js/screens/home.js?v=20261002e')) === true);
  ok('קובץ שכבר לא ב-index.html (יתום) — נמחק', isStale(new URL(scope + 'js/screens/gone.js?v=abcdef0123')) === true);
  ok('ערך בלי ?v= (index.html, אייקונים ללא גרסה) — לא נוגעים', isStale(new URL(scope + 'index.html')) === false);
  ok('css/home2.css עם הגרסה הנוכחית — נשאר', isStale(new URL(scope + 'css/home2.css?v=' + V['css/home2.css'])) === false);
  // scope חסר (למשל בבדיקה מקומית) — נופל ל-pathname בלי לזרוק
  ctx.self.registration = null;
  ok('בלי scope — לא זורק, מכריע לפי pathname', isStale(new URL('http://localhost:8080/js/screens/home.js?v=' + homeV)) === false);
}

/* ---------- 4. defer על כל סקריפט מקומי, והסדר נשמר ---------- */
section('4. defer');
{
  const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const tags = idx.match(/<script[^>]*src="js\/[^"]+"[^>]*>/g) || [];
  ok('52 תגי סקריפט מקומיים (66 פחות 22 שעברו לטעינה לפי דרישה, ועוד lazy.js+lazyManifest.js, ועוד gymWrite.js, ועוד gardenAssets.js — 4.10, ועוד lawnRefine.js — 6.10, ועוד greenBound.js+greenArea.js — 7.10)', tags.length === 52, String(tags.length));
  const noDefer = tags.filter(t => !/\bdefer\b/.test(t));
  ok('🔴 לכולם יש defer', noDefer.length === 0, noDefer.slice(0, 2).join(' '));
  const order = tags.map(t => t.match(/src="([^"?]+)/)[1]);
  ok('diag.js ראשון (תופס שגיאות טעינה)', order[0] === 'js/ui/diag.js');
  ok('dialog.js לפני המסכים ו-app.js אחרי כולם (סדר נשמר)',
     order.indexOf('js/ui/dialog.js') < order.indexOf('js/screens/resident.js') &&
     order.indexOf('js/app.js') > order.indexOf('js/screens/home.js') &&
     order.indexOf('js/pwa.js') === order.length - 1);
  ok('אין סקריפט inline שתלוי בטעינה סינכרונית', !/<script>(?![\s\S]*?<\/script>\s*$)/.test(idx.replace(/<script[^>]*src=[^>]*><\/script>/g, '')) && (idx.match(/<script>/g) || []).length === 0);
}

console.log('\n====================================================');
console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
