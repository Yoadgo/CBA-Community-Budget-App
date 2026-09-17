
/* בדיקות למסך "מצב המערכת" (2026-09-16).
   הרצה:  node tools/test-sys-status.js

   מריץ את js/screens/sysStatus.js **האמיתי** מול DOM מינימלי ו-CBA מדומה.

   🔴🔴 מה המארז הזה שומר עליו:

     1. **המסך הזה מדליק ומכבה תחומים לכל השיכון.** כפתור שמכבה את
        מה שהוא לא אומר, או שמשנה מצב בלי אישור, הוא נזק לכולם
        בבת אחת. סעיף 4.

     2. **"נדחה" אינו בהכרח תקלה.** gymCode אמור להידחות כשאין מנוי
        פעיל — זה הכלל עובד, לא נשבר. מסך שיצבע את זה באדום ילמד
        את המנהל להתעלם מאדום, וזה בדיוק היום שבו אדום אמיתי
        ייראה כמו רעש. סעיף 3.

     3. **הבדיקה חייבת לרוץ בדפדפן.** כללי Firestore נאכפים על
        הקורא, ו-Apps Script עוקף אותם דרך חשבון שירות: בדיקה
        שרצה בשרת מצליחה תמיד, גם כשכל תושב מקבל דחייה. סעיף 5.

     4. **רשימת הדגלים מגיעה מהשרת.** דגל שנוסף ב-FLAG_KEYS חייב
        להופיע כאן בלי גרסת לקוח חדשה — אחרת יש דגל דלוק שאיש
        אינו רואה. סעיף 2. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SRC  = R('js/screens/sysStatus.js');
const APP  = R('js/app.js');
const DS   = R('js/data/dataService.js');
const GS   = R('apps-script/Code.gs');
const HTML = R('index.html');

/* ---------- DOM מינימלי ---------- */
function makeEl() {
  const el = { _html: '', children: [], isConnected: true, listeners: {} };
  Object.defineProperty(el, 'innerHTML', {
    get() { return el._html; },
    set(v) { el._html = String(v); }
  });
  el.querySelectorAll = sel => {
    /* מספיק לבדיקה: מוצא את כל data-flag="..." בטקסט ומייצר "אלמנטים". */
    if (sel !== '[data-flag]') return [];
    const keys = [...el._html.matchAll(/data-flag="([^"]+)"/g)].map(m => m[1]);
    return keys.map(k => ({
      getAttribute: a => (a === 'data-flag' ? k : null),
      addEventListener: (ev, fn) => { el.listeners[k] = fn; }
    }));
  };
  el.querySelector = () => null;
  return el;
}

let flagsRes, setCalls, confirmAnswer, alerts, probeCalls, probeRes;
function makeEnv(opts) {
  opts = opts || {};
  setCalls = []; alerts = []; probeCalls = [];
  confirmAnswer = opts.confirm !== false;
  flagsRes = opts.flagsRes || { ok: true, keys: ['pulseToFirestore', 'bootFromFirestore'],
                                flags: { pulseToFirestore: true, bootFromFirestore: false } };
  probeRes = opts.probeRes || (() => ({ state: 'ok', ms: 12 }));
  const sandbox = {
    console: { log() {}, error() {} },
    setTimeout, clearTimeout,
    document: { addEventListener() {}, createElement: () => makeEl() },
    Array: Array, Date: Date, JSON: JSON, String: String, Number: Number, Math: Math
  };
  sandbox.window = sandbox;
  sandbox.CBA = {
    esc: s => String(s),
    skel: { cards: n => '<!--skel' + n + '-->' },
    mock: { currentYear: 'תשפ"ז' },
    fb: { uid: () => (opts.uid === undefined ? 'u1' : opts.uid) },
    ui: {
      confirm: (msg, o) => { sandbox.CBA.ui._last = { msg: msg, opts: o };
                             return Promise.resolve(confirmAnswer); },
      alert: m => alerts.push(String(m))
    },
    data: {
      getFlags: cb => cb(flagsRes),
      setFlag: (k, v, cb) => { setCalls.push({ key: k, value: v }); cb(opts.setRes || { ok: true, flags: Object.assign({}, flagsRes.flags, { [k]: v }) }); },
      probeDoc: (c, id, cb) => { probeCalls.push(c + '/' + id); cb(probeRes(c, id)); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}
const tick = () => new Promise(r => setTimeout(r, 0));

/* ================================================================= */
section('1. חיווט — המסך קיים ומגיעים אליו');
ok('נרשם כמסך', /CBA\.screens\.sysStatus = \{/.test(SRC));
ok('🔴 ומוגן במנהל-על בלבד', /sysStatus: PERM\.SUPER,/.test(APP));
ok('⚠️ והשרת אוכף את זה בעצמו — לא רק ההסתרה כאן',
   /flagSet: PERM_SUPER, flagsGet: PERM_SUPER,/.test(GS));
ok('נמצא ברשימת מסכי הניהול', /"appReports", "sysStatus", "reconcile"\]/.test(APP));
ok('⚠️ ויש אליו אריח בתפריט המשתמש, רק למנהל-על',
   /isSuper\(\)\) \{[\s\S]{0,600}data-panel-goto="sysStatus"/.test(APP));
ok('הקובץ נטען ב-index.html', /js\/screens\/sysStatus\.js\?v=/.test(HTML));
ok('⚠️ וגם גיליון הסגנון שלו', /css\/sys\.css\?v=/.test(HTML));
ok('⚠️ ושניהם נושאים את אותה גרסה כמו השאר',
   (HTML.match(/sysStatus\.js\?v=(\d+[a-z]*)/) || [])[1] ===
   (HTML.match(/appReports\.js\?v=(\d+[a-z]*)/) || [])[1]);

(async function () {
  /* =============================================================== */
  section('2. 🔴 רשימת הדגלים מגיעה מהשרת, לא מהמסך');
  let env = makeEnv();
  let c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('שני הדגלים שהשרת החזיר מצוירים',
     /data-flag="pulseToFirestore"/.test(c.innerHTML) &&
     /data-flag="bootFromFirestore"/.test(c.innerHTML));
  ok('🔴 והמצב נלקח מהשרת: אחד דלוק ואחד כבוי',
     (c.innerHTML.match(/sys-flag--on/g) || []).length === 1,
     String((c.innerHTML.match(/sys-flag--on/g) || []).length));
  ok('⚠️ והכפתורים אומרים את הפעולה הנכונה לכל אחד',
     /כבה/.test(c.innerHTML) && /הדלק/.test(c.innerHTML));

  /* 🔴 דגל שהשרת מכיר והמסך לא — חייב להופיע בכל זאת, עם שמו. */
  env = makeEnv({ flagsRes: { ok: true, keys: ['flagShelodaAtiKeyMazir'], flags: {} } });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('🔴 דגל חדש שהמסך לא מכיר מופיע בכל זאת',
     /data-flag="flagShelodaAtiKeyMazir"/.test(c.innerHTML));
  ok('⚠️ ומוצג בשמו, כדי שיהיה אפשר לכבות אותו',
     /flagShelodaAtiKeyMazir/.test(c.innerHTML));
  /* 🔴 הצלבה מול השרת: כל מפתח ב-FLAG_KEYS יש לו תיאור בעברית. */
  const serverKeys = (GS.match(/var FLAG_KEYS = \[([\s\S]*?)\];/) || ['', ''])[1]
    .match(/'([a-zA-Z]+)'/g) || [];
  const described = (SRC.match(/^    ([a-zA-Z]+):\s*\[/gm) || []).map(s => s.trim().split(':')[0]);
  const missing = serverKeys.map(s => s.replace(/'/g, '')).filter(k => described.indexOf(k) === -1);
  ok('🔴 ולכל דגל שקיים בשרת יש תיאור בעברית במסך', missing.length === 0, missing.join(','));

  /* ==================================================================
     🔴🔴 **ברירת המחדל שהמסך מצהיר עליה מול הקבוע האמיתי בקוד.**
     `flagsSet_` שומר רק מפתחות שמישהו שינה; מפתח חסר פירושו
     "ברירת המחדל שבקוד", ו-`CBA.fb.flag(key, dflt)` מכבד את זה.
     מסך שמצהיר ברירת מחדל שגויה מציג תחום דלוק ככבוי — ומציע
     "הדלק" במקום "כבה" בדיוק ברגע שבו רוצים לכבות בחירום.
     ⚠️ שתי הרשימות חייבות להישאר צמודות; זו הבדיקה שמחזיקה אותן. */
  const REAL_CONST = {
    gardenPlanFromFirestore:   ['js/data/dataService.js', 'GARDEN_PLAN_FROM_FIRESTORE'],
    servicesFromFirestore:     ['js/data/dataService.js', 'SERVICES_FROM_FIRESTORE'],
    budgetTxStatusToFirestore: ['js/data/dataService.js', 'BUDGET_TX_STATUS_TO_FIRESTORE'],
    budgetTxFromFirestore:     ['js/data/sheets.js',      'BUDGET_TX_FROM_FIRESTORE_READ'],
    budgetYearFromFirestore:   ['js/data/sheets.js',      'BUDGET_YEAR_FROM_FIRESTORE'],
    bootFromFirestore:         ['js/data/sheets.js',      'BOOT_FROM_FIRESTORE'],
    pulseToFirestore:          ['js/app.js',              'PULSE_DEFAULT'],
    homeCountsFromFirestore:   ['js/data/dataService.js', 'HOME_COUNTS_FROM_FIRESTORE'],
    tourFromFirestore:         ['js/data/dataService.js', 'TOUR_FROM_FIRESTORE'],
    clubResvFromFirestore:     ['js/data/dataService.js', 'CLUB_RESV_FROM_FIRESTORE']
  };
  const declared = {};
  (SRC.match(/^    ([a-zA-Z]+):\s*\[[\s\S]*?\],?$/gm) || []).forEach(function (line) {
    const k = line.trim().split(':')[0];
    const m2 = line.match(/,\s*(true|false)\]/);
    if (m2) declared[k] = m2[1] === 'true';
  });
  ok('⚠️ לכל דגל מוצהרת ברירת מחדל במסך',
     Object.keys(REAL_CONST).every(k => k in declared),
     Object.keys(REAL_CONST).filter(k => !(k in declared)).join(','));
  const wrong = Object.keys(REAL_CONST).filter(function (k) {
    const src = R(REAL_CONST[k][0]);
    const m3 = src.match(new RegExp('var ' + REAL_CONST[k][1] + ' = (true|false);'));
    return !m3 || (m3[1] === 'true') !== declared[k];
  });
  ok('🔴🔴 וכל אחת מהן זהה לקבוע האמיתי בקוד הלקוח', wrong.length === 0, wrong.join(','));
  /* 🔴 וכמה מהם באמת דלוקים כברירת מחדל — הבדיקה הזאת קיימת כדי
     שהבדיקה שמעליה לא תהיה ריקה מתוכן אם כולם יהיו false.
     5 → 6 ב-16.9 עם `gardenReportsFromFirestore`. */
  /* (2026-09-17) שמונה ולא שבעה — נוסף writeWatchdog, שאינו מתג
     מיגרציה אלא מתג ביטול לרשת ביטחון, ולכן ברירת המחדל שלו דלוקה. */
  ok('⚠️ ושמונה מהם דלוקים היום כברירת מחדל',
     Object.keys(declared).filter(k => declared[k]).length === 8,
     String(Object.keys(declared).filter(k => declared[k]).length));

  /* =============================================================== */
  section('2ב. 🔴🔴 דגל שלא נכתב מעולם מוצג לפי ברירת המחדל שבקוד');
  env = makeEnv({ flagsRes: { ok: true,
    keys: ['gardenPlanFromFirestore', 'bootFromFirestore'],
    flags: { bootFromFirestore: true } } });   /* גינון לא נכתב מעולם */
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('🔴 תוכנית הגינון מוצגת כ**דלוקה** (ברירת המחדל בקוד היא true)',
     (c.innerHTML.match(/sys-flag--on/g) || []).length === 2,
     String((c.innerHTML.match(/sys-flag--on/g) || []).length));
  ok('🔴 והכפתור שלה מציע "כבה" — זה כל מה שהמסך הזה קיים בשבילו',
     (c.innerHTML.match(/כבה/g) || []).length === 2,
     String((c.innerHTML.match(/כבה/g) || []).length));
  ok('⚠️ ומסומן שזו ברירת מחדל ולא כתיבה מפורשת',
     /ברירת מחדל/.test(c.innerHTML));
  setCalls = [];
  c.listeners['gardenPlanFromFirestore']();
  await tick(); await tick();
  ok('🔴🔴 ולחיצה אחת **מכבה** אותה — לא "מדליקה" את מה שכבר דלוק',
     setCalls.length === 1 && setCalls[0].value === false, JSON.stringify(setCalls));

  /* =============================================================== */
  section('3. 🔴🔴 "נדחה" אינו בהכרח תקלה');
  env = makeEnv({ probeRes: (col) => (col === 'gymCode' ? { state: 'denied', ms: 30 }
                                                        : { state: 'ok', ms: 10 }) });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('🔴 דחייה של gymCode אינה נצבעת באדום',
     (c.innerHTML.match(/sys-dot--danger/g) || []).length === 0,
     String((c.innerHTML.match(/sys-dot--danger/g) || []).length));
  ok('⚠️ ובכל זאת נאמר במפורש שהיא נדחתה', /נדחה/.test(c.innerHTML));
  /* 🔴 ולעומת זאת — דחייה של מסמך שכן אמור להיקרא היא אדום אמיתי. */
  env = makeEnv({ probeRes: (col, id) => (col === 'appConfig' && id === 'flags'
                                            ? { state: 'denied', ms: 30 } : { state: 'ok', ms: 10 }) });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('🔴 דחייה של מפת הדגלים **כן** נצבעת באדום',
     (c.innerHTML.match(/sys-dot--danger/g) || []).length === 1,
     String((c.innerHTML.match(/sys-dot--danger/g) || []).length));
  ok('⚠️ ו"אין מסמך" הוא כתום ולא אדום — חסר, לא שבור',
     (() => { const e2 = makeEnv({ probeRes: (col, id) => (col === 'appConfig' && id === 'boot'
                     ? { state: 'missing', ms: 8 } : { state: 'ok', ms: 8 }) });
              const c2 = makeEl(); e2.CBA.screens.sysStatus.render(c2);
              return (c2.innerHTML.match(/sys-dot--warn/g) || []).length === 1; })());

  /* =============================================================== */
  section('4. 🔴🔴 הדלקה וכיבוי — פעולה לכל השיכון');
  env = makeEnv();
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('🔴 לחיצה מבקשת אישור לפני ששולחת משהו', (function () {
    c.listeners['bootFromFirestore']();
    return setCalls.length === 0 && !!env.CBA.ui._last;
  })());
  ok('🔴 והאישור אומר מה הדגל עושה ושזה לכל המשתמשים',
     /כל המשתמשים/.test(env.CBA.ui._last.msg) && /Firestore/.test(env.CBA.ui._last.msg));
  ok('⚠️ והכותרת אומרת להדליק/לכבות ואת שם התחום בעברית',
     /להדליק/.test(env.CBA.ui._last.opts.title) && /טעינה קרה/.test(env.CBA.ui._last.opts.title));
  await tick(); await tick();
  ok('🔴 ואחרי אישור — נשלח ההפך ממה שהיה',
     setCalls.length === 1 && setCalls[0].key === 'bootFromFirestore' && setCalls[0].value === true,
     JSON.stringify(setCalls));
  ok('⚠️ והמצב במסך מתעדכן מהתשובה של השרת, לא מניחוש מקומי',
     (c.innerHTML.match(/sys-flag--on/g) || []).length === 2,
     String((c.innerHTML.match(/sys-flag--on/g) || []).length));

  /* ביטול — לא נשלח כלום */
  env = makeEnv({ confirm: false });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  c.listeners['bootFromFirestore']();
  await tick(); await tick();
  ok('🔴 ביטול אינו משנה כלום', setCalls.length === 0, JSON.stringify(setCalls));

  /* כשל מהשרת — הודעה, ולא "נראה כאילו הצליח" */
  env = makeEnv({ setRes: { ok: false, error: 'אין הרשאה' } });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  c.listeners['pulseToFirestore']();
  await tick(); await tick();
  ok('🔴 כשל מוצג למשתמש ואינו נבלע', alerts.length === 1 && /אין הרשאה/.test(alerts[0]),
     JSON.stringify(alerts));
  ok('⚠️ והמצב במסך נשאר כפי שהיה',
     (c.innerHTML.match(/sys-flag--on/g) || []).length === 1);

  /* =============================================================== */
  section('5. 🔴 הבדיקה רצה בדפדפן, ובודקת את מה שצריך');
  ok('probeDoc קיים ומיוצא בשכבת הנתונים',
     /function probeDoc\(collection, id, cb\)/.test(DS) && /probeDoc: probeDoc,/.test(DS));
  ok('🔴 והוא משתמש ב-SDK של הדפדפן ולא ב-Apps Script',
     /CBA\.fb\.readDoc\(collection, id,/.test(DS) &&
     !/CBA\.sheets\.get[\s\S]{0,40}probe/.test(DS));
  ok('⚠️ ומודד זמן — אחרת "עובד" ו"עובד תוך 4 שניות" נראים אותו דבר',
     /ms: Date\.now\(\) - t0/.test(DS));
  ok('⚠️ וכל כשל מוחזר כמצב ולא כזריקה',
     /out\("no-sdk"\)/.test(DS) && /out\("no-user"\)/.test(DS) && /out\("denied"/.test(DS));

  env = makeEnv();
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('נבדקים המסמכים המרכזיים',
     ['appConfig/flags', 'appConfig/rev', 'appConfig/boot', 'members/u1',
      'gardenMeta/lists', 'budgetYears/תשפ"ז', 'gymStatus/u1', 'gymCode/u1']
       .every(x => probeCalls.indexOf(x) !== -1), JSON.stringify(probeCalls));
  ok('⚠️ ובלי כפילויות', new Set(probeCalls).size === probeCalls.length);
  /* 🔴 בלי uid אין מה לבדוק לפי משתמש — ולא שולחים קריאה עם מזהה ריק,
     שהייתה נדחית ונראית כמו תקלה. */
  env = makeEnv({ uid: '' });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('🔴 בלי uid לא נשלחת קריאה עם מזהה ריק',
     probeCalls.every(x => !/\/$/.test(x)), JSON.stringify(probeCalls));
  ok('⚠️ ומסמכי התחומים עדיין נבדקים',
     probeCalls.indexOf('appConfig/flags') !== -1);
  /* 🔴🔴 **ואין שורה שאיש לא התחיל.** `probeList()` תלויה ב-uid,
     שמתמלא שנייה אחרי הפתיחה. חישוב הרשימה מחדש בכל ציור היה
     מוסיף שלוש שורות ש-`load()` כבר לא ירוץ עבורן — והן היו
     נשארות על "בודק…" לנצח. הרשימה נקבעת פעם אחת. */
  env.CBA.fb.uid = () => 'u1';          /* הזהות הגיעה באיחור */
  env.CBA.screens.sysStatus.render.call(null, c);   /* ציור מחדש בלבד */
  const started = probeCalls.length;
  await tick();
  ok('🔴 שורה שלא הותחלה אינה נוספת לתצוגה בציור מאוחר',
     (c.innerHTML.match(/בודק…/g) || []).length === 0,
     String((c.innerHTML.match(/בודק…/g) || []).length));

  /* =============================================================== */
  section('6. כשלים — המסך לא נשבר');
  env = makeEnv({ flagsRes: { ok: false, error: 'אין חיבור לגיליון' } });
  c = makeEl();
  env.CBA.screens.sysStatus.render(c);
  await tick();
  ok('כשל בטעינת הדגלים מוצג כהודעה', /אין חיבור לגיליון/.test(c.innerHTML));
  ok('⚠️ והבדיקות ממשיכות לרוץ בכל זאת', probeCalls.length > 0);
  ok('⚠️ ואין כפתורי דגלים שאפשר ללחוץ עליהם לשווא',
     !/data-flag=/.test(c.innerHTML));

  console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
