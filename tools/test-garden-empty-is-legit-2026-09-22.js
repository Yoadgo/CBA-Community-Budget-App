/* אוסף גינון ריק הוא מצב לגיטימי, לא כשל   (22.9.2026)
 * הרצה:  node tools/test-garden-empty-is-legit-2026-09-22.js
 *
 * 🔴 הרקע: אחרי ניקוי מלא של נתוני הגינון, שני מסכי הניהול נפלו עם
 *    "לא הצלחתי לטעון" והקונסול אמר (firestore:empty). השומר "אוסף ריק
 *    = כשל" היה נכון כש-Firestore היה מראה של הגיליון, והפך למעגל סגור
 *    ברגע ש-Firestore הוא המקור: המסך שבו מזינים את השורה הראשונה הוא
 *    בדיוק המסך שסירב להיטען כשאין שורות.
 *
 * מה המארז שומר עליו:
 *   1. ריק מחזיר ok:true עם רשימה ריקה — בשתי הקריאות.
 *   2. כשל אמיתי עדיין מחזיר ok:false (לא תיקנו יותר מדי).
 *   3. תשובת null אינה תולה את הקריאה לנצח בלי שגיאה — המלכודת
 *      שנפתחה ברגע שהפסקנו לחסום ריק.
 *   4. מסמך הרשימות החסר עדיין מפיל את התוכנית (הוא באמת נדרש).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/** בונה סביבה עם CBA.fb מדומה. planRows/taskRows יכולים להיות
 *  מערך, [] או null; err מדמה כשל אמיתי. */
function makeEnv(opts) {
  opts = opts || {};
  const sheetsCalls = [];
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    Date, JSON, Math, String, Number, Array, Object, parseInt, isNaN
  };
  sandbox.window = sandbox;
  sandbox.CBA = {
    esc: s => String(s),
    authSession: 'SESS',
    sheets: { get: (p, cb) => { sheetsCalls.push(p && p.action); cb({ ok: true, viaSheets: true }); },
              postRead: (a, b, cb) => cb({ ok: true }) },
    fb: {
      isDbReady: () => true,
      userReady: (cb) => cb({ uid: 'u1' }),
      ensureDb: (cb) => cb(null),
      /* ⚠️ מחזיר את ברירת המחדל שנשלחה, לא true גורף — אחרת
         appsScriptFallback נראה דלוק וכל כשל נופל לגיליון
         במקום להחזיר ok:false. הבדיקה נפלה בדיוק על זה. */
      flag: (k, d) => (k === 'appsScriptFallback' ? false : (d === undefined ? true : d)),
      readCollection: (name, cb) => {
        if (opts.err) return cb(opts.err);
        cb(null, name === 'gardenPlan' ? opts.planRows : opts.taskRows);
      },
      queryCollection: (n, q, cb) => cb(null, []),
      readDoc: (col, id, cb) => {
        if (col === 'gardenMeta') {
          return cb(null, opts.noLists ? null
                                       : { areas: ['צפון'], categories: ['השקיה'], freqs: ['שבועי'] });
        }
        cb(null, null);
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(R('js/data/dataService.js'), sandbox);
  return { sandbox, sheetsCalls };
}

const call = (env, fn) => new Promise(res => {
  const api = env.sandbox.CBA.data;
  if (fn === 'plan') api.getGardenPlan(res);
  else api.getGardenTasks({ scope: 'all', week: '2026-09-20' }, res);
  setTimeout(() => res({ ok: false, TIMEOUT: true }), 1500);
});

(async () => {
  section('1. אוסף ריק — תוכנית העבודה');
  {
    const env = makeEnv({ planRows: [], taskRows: [] });
    const r = await call(env, 'plan');
    ok('לא נתקע', !r.TIMEOUT);
    ok('מחזיר ok:true', r.ok === true, JSON.stringify(r).slice(0, 120));
    ok('עם רשימה ריקה', Array.isArray(r.defs) && r.defs.length === 0);
    ok('והרשימות עדיין מגיעות', Array.isArray(r.areas) && r.areas.length === 1);
    ok('בלי נפילה ל-Apps Script', env.sheetsCalls.length === 0, JSON.stringify(env.sheetsCalls));
  }

  section('2. אוסף ריק — משימות');
  {
    const env = makeEnv({ planRows: [], taskRows: [] });
    const r = await call(env, 'tasks');
    ok('לא נתקע', !r.TIMEOUT);
    ok('מחזיר ok:true', r.ok === true, JSON.stringify(r).slice(0, 120));
    ok('עם רשימה ריקה', Array.isArray(r.rows) && r.rows.length === 0);
    ok('בלי נפילה ל-Apps Script', env.sheetsCalls.length === 0);
  }

  section('3. כשל אמיתי עדיין כשל');
  {
    const env = makeEnv({ err: new Error('permission-denied') });
    const r = await call(env, 'plan');
    ok('ok:false', r.ok === false, JSON.stringify(r).slice(0, 120));
    ok('ומסומן כ-cbaLoadFailed', r.cbaLoadFailed === true);
    ok('עם הסיבה ביומן', String(r.why || '').indexOf('permission-denied') >= 0, r.why);
  }
  {
    const env = makeEnv({ err: new Error('permission-denied') });
    const r = await call(env, 'tasks');
    ok('גם במשימות', r.ok === false && r.cbaLoadFailed === true);
  }

  section('4. תשובת null אינה תולה את הקריאה');
  {
    const env = makeEnv({ planRows: null, taskRows: null });
    const r = await call(env, 'plan');
    ok('התוכנית חוזרת', !r.TIMEOUT, 'נתקע — maybeDone לא רץ על null');
    ok('כרשימה ריקה', r.ok === true && Array.isArray(r.defs) && r.defs.length === 0);
  }
  {
    const env = makeEnv({ planRows: null, taskRows: null });
    const r = await call(env, 'tasks');
    ok('המשימות חוזרות', !r.TIMEOUT, 'נתקע — forEach על null');
    ok('כרשימה ריקה', r.ok === true && Array.isArray(r.rows) && r.rows.length === 0);
  }

  section('5. מסמך הרשימות החסר עדיין מפיל את התוכנית');
  {
    const env = makeEnv({ planRows: [], taskRows: [], noLists: true });
    const r = await call(env, 'plan');
    ok('ok:false', r.ok === false, JSON.stringify(r).slice(0, 120));
    ok('עם no-lists-doc', String(r.why || '').indexOf('no-lists-doc') >= 0, r.why);
  }

  console.log('\n════════════════════════════════');
  console.log(pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
