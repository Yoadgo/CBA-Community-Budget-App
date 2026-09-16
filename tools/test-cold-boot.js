
/* בדיקות לטעינה הקרה מ-Firestore (צעד 11, 2026-09-16).
   הרצה:  node tools/test-cold-boot.js

   מריץ את js/data/sheets.js **האמיתי** מול fetch ו-Firestore מדומים,
   ובודק את apps-script/Code.gs ואת js/app.js כטקסט.

   🔴🔴 ארבע הסכנות שהמארז הזה שומר עליהן:

     1. **דליפת פרטיות.** `appConfig` נקרא ע"י **כל חבר**. ב-doGet יש
        סינון מפורש (`RESIDENT_SETTINGS_ALLOW`) שמונע מתושב את
        `בסיס תקציב <שנה>` — JSON של כל התכנון המאושר. מסמך פתיחה
        שנושא את מפת ההגדרות היה מבטל את התיקון הזה בשקט, בלי
        שום שגיאה ובלי שאיש יראה. סעיף 2 הוא שומר הסף.

     2. **המטען מפסיד למסלול המהיר.** `apply()` דורס את
        `CBA.mock.years` **במלואו**. אם שתי קריאות Firestore
        נוחתות אחרי שהמטען כבר הוחל, הן מחליפות נתונים מלאים
        בחלקיים — העדכונים ויומן ההערות נמחקים מהמסך. סעיף 5.

     3. **הזהות עוד לא הוגדרה.** `CBA.user`/`CBA.perms` נקבעים
        ב-`applyUser()`, שעד צעד 11 רץ רק **אחרי** שהמטען חזר.
        הטעינה הקרה גוזרת מהם את השאילתה — ולכן מנהל-על היה
        מקבל תוכנית ריקה ותושב אפס תנועות. זו בדיוק משפחת
        התקלות שנתפסה שלוש פעמים לפני כן. סעיף 6.

     4. **מטמון חלקי שמשתקע לנצח.** הטעינה הקרה חסרה
        `updates`/`notesLog` לפי הגדרה. כתיבתה ל-localStorage
        הייתה מנציחה חוסר. סעיף 4. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SRC = R('js/data/sheets.js');
const APP = R('js/app.js');
const GS  = R('apps-script/Code.gs');
const RULES = R('firestore.rules');
const DS  = R('js/data/dataService.js');

const CUR = 'תשפ"ז';

/* ================================================================= */
section('1. השרת — מסמך הפתיחה קיים ומתוחזק');
ok('מסמך הפתיחה הוא appConfig/boot', /var FS_BOOT_DOC = 'appConfig\/boot';/.test(GS));
ok('bootSync דורש מנהל-על', /bootSync: PERM_SUPER,/.test(GS));
ok('handleBootSync_ מחווט ב-doGet', /action === 'bootSync'\)\s*\{\s*\n\s*return handleBootSync_\(e\.parameter\);/.test(GS));
ok('🔴 והמסמך מתרענן בעבודה השעתית', /var b = bootSync_\(ss\);/.test(GS));
ok('⚠️ ולפני הגיבוי המצטבר, כדי שמה שנכתב ייכנס לאותה ריצה',
   GS.indexOf('var b = bootSync_(ss);') < GS.indexOf('fsBackupIncremental_'));
ok('⚠️ וכשל שלו אינו מפיל את שאר העבודה השעתית',
   /var b = bootSync_\(ss\);[\s\S]{0,200}\} catch \(e\) \{/.test(GS));
ok('🔴 מספר הגרסה הוא קבוע אחד — לא שתי מחרוזות שיכולות להיפרד',
   /var APP_VERSION = 'v43-charge-photos';/.test(GS) &&
   (GS.match(/'v43-charge-photos'/g) || []).length === 1,
   String((GS.match(/'v43-charge-photos'/g) || []).length));
ok('⚠️ ושני המקומות קוראים ממנו', (GS.match(/version: APP_VERSION,/g) || []).length === 2);
ok('bootFromFirestore ברשימת הדגלים הסגורה', /'bootFromFirestore',/.test(GS) &&
   /var FLAG_KEYS = \[[\s\S]*?'bootFromFirestore'/.test(GS));

/* ================================================================= */
section('2. 🔴🔴 הפרטיות — מה שאסור שיגיע ל-appConfig');
/* 🔴🔴 **הגרסה הראשונה של הצעד הזה העתיקה לכאן את רשימת ההיתר של
   `doGet` — כלומר את סיסמת רשת המועדון — ונתפסה בסקירה לפני הפרסום.**
   `appConfig` נקרא ע"י **כל** חבר פעיל, כולל הקבלן החיצוני, שב-doGet
   נדחה לגמרי ואינו מקבל שום הגדרה. הוא היה קורא את הסיסמה ישירות.
   התיקון אינו כלל חדש אלא **הסרה**: מסמך בלי סוד הוא הגנה שאי-אפשר
   לעקוף. (ולא במקרה: ב-Firestore כל `match` שמתאים מעניק גישה, ולכן
   `match /appConfig/boot` צר יותר **לא** היה מבטל את ה-wildcard מעליו.) */
ok('🔴🔴 אין במסמך שדה settings בכלל', !/settings: safe,/.test(GS) &&
   !/var BOOT_SETTINGS_ALLOW/.test(GS));
ok('🔴 ובוודאי לא מפת ההגדרות כולה', !/settings: settings,/.test(GS));
(function () {
  const box = { Logger: { log() {} }, Date: Date, JSON: JSON, String: String };
  vm.createContext(box);
  try { vm.runInContext("var APP_VERSION = 'x';\n" +
        GS.match(/function bootDoc_\(ss, settings\) \{[\s\S]*?\n\}/)[0], box); } catch (e) {}
  const settings = {};
  settings['שנים'] = 'תשפ"ו, תשפ"ז';
  settings['שנה נוכחית'] = CUR;
  settings['סיסמת רשת המועדון'] = '1234';
  settings['בסיס תקציב ' + CUR] = '{"a":1}';
  settings['סוד כלשהו'] = 'x';
  let doc = null;
  try { doc = box.bootDoc_(null, settings); } catch (e) {}
  const json = doc ? JSON.stringify(doc) : '';
  ok('🔴 בפועל: אין "בסיס תקציב"', doc && !json.includes('בסיס תקציב'), doc ? 'דלף' : 'לא רץ');
  ok('🔴🔴 ואין סיסמת רשת המועדון — זו התקלה שנתפסה',
     doc && !json.includes('1234'), doc ? 'דלף' : 'לא רץ');
  ok('🔴 ולא שום ערך אחר מההגדרות', doc && !json.includes('סוד כלשהו'));
  ok('⚠️ ארבעה שדות בלבד',
     doc && JSON.stringify(Object.keys(doc).sort()) ===
       JSON.stringify(['currentYear', 'schema', 'updatedAt', 'version', 'years']),
     doc ? JSON.stringify(Object.keys(doc)) : 'לא רץ');
  ok('⚠️ ובכל זאת נושא את מה שצריך — שנים ושנה נוכחית',
     doc && doc.currentYear === CUR && doc.years.length === 2);
})();
/* ⚠️ והלקוח אינו ממציא מפת הגדרות משלו במקום. */
ok('🔴 והלקוח מחיל settings ריק, לא מפה חלקית שנראית אמיתית',
   /settings: \{\},\n\s*version: boot\.version/.test(SRC));
ok('🔴 והערכים שכן פרטיים עברו למסמך השנה, המוגן ב-canSeeBudget',
   /match \/budgetYears\/\{year\}[\s\S]{0,200}allow read: if canSeeBudget\(\);/.test(RULES));
ok('⚠️ בעוד appConfig נשאר קריא לכל חבר', /match \/appConfig\/\{doc\}[\s\S]{0,120}allow read: if isMember\(\);/.test(RULES));

/* ================================================================= */
section('3. מסמך השנה — מספיק לעצמו');
ok('budgetYearDoc_ מקבל את ההגדרות ואת ההערות', /function budgetYearDoc_\(ss, y, settings, notesMap\)/.test(GS));
ok('closed נגזר ממצב התקציב', /closed: settings\['\\u05de\\u05e6\\u05d1 \\u05ea\\u05e7\\u05e6\\u05d9\\u05d1 ' \+ y\] === '\\u05e1\\u05d2\\u05d5\\u05e8',/.test(GS));
ok('baseline מפורש מ-JSON, וכשל פרסור אינו מפיל', /try \{ baseline = JSON\.parse\(braw\); \} catch \(e\) \{ baseline = null; \}/.test(GS));
ok('notes מועתק בשדות מפורשים בלבד', /notes: note \? \{ content: String\(note\.content \|\| ''\)/.test(GS));
ok('🔴 והמסמך סומן schema: 2 (הקוראים הישנים לא מצפים לשדות האלה)', /schema: 2,/.test(GS));
/* הצהרה + שני קוראים: `budgetYearsSyncAll_` (כל השנים, ידני)
   ו-`currentBudgetYearSync_` (השנה הנוכחית, כל שעה). שניהם מעבירים
   את אותם ארבעה ארגומנטים — קורא שיעביר פחות יכתוב מסמך בלי
   `closed`, וזו בדיוק הסכמה הישנה שהטעינה הקרה מסרבת לה. */
ok('⚠️ שני הקוראים מעבירים את ארבעתם',
   (GS.match(/budgetYearDoc_\(ss, y, settings, notesMap\)/g) || []).length === 3 &&
   (GS.match(/budgetYearDoc_\(/g) || []).length === 3,
   String((GS.match(/budgetYearDoc_\(/g) || []).length));

/* ================================================================= */
section('3ב. 🔴🔴 טריות — מסמך שנה שלא מתעדכן משקר על "סגור"');
/* עד התיקון, `budgetYears/{year}` נכתב **רק** ב-budgetSync הידני.
   מנהל שסוגר תקציב ולא מריץ סנכרון היה משאיר את Firestore על
   "טיוטה" לנצח — והטעינה הקרה הייתה מציירת כפתור "סגור תקציב"
   על שנה שכבר סגורה, ורושמת שינויי תכנון בלי שורת "עדכוני תקציב". */
ok('🔴 השנה הנוכחית נכתבת בעבודה השעתית', /var cy = currentBudgetYearSync_\(ss\);/.test(GS));
ok('⚠️ והיא שנה אחת בלבד — לא סנכרון מלא כל שעה',
   /function currentBudgetYearSync_\(ss\)[\s\S]{0,1200}fsSet_\(fsDocPath_\(FS_BUDGET_YEARS, budgetYearId_\(y\)\), doc\);/.test(GS) &&
   !/function currentBudgetYearSync_\(ss\)[\s\S]{0,1200}fsSweepOrphans_/.test(GS));
ok('⚠️ וכשל שלה אינו מפיל את שאר העבודה השעתית',
   /var cy = currentBudgetYearSync_\(ss\);[\s\S]{0,200}\} catch \(e\) \{/.test(GS));
/* 🔴 ובצד הלקוח — שער סכמה. מסמך ישן אין בו `closed`, ו-`doc.closed === true`
   עליו מחזיר false: שנה **סגורה** הייתה נצבעת "טיוטה". */
ok('🔴🔴 והלקוח מסרב לצייר מוקדם ממסמך בסכמה ישנה',
   /if \(res\.data\.schema !== undefined && Number\(res\.data\.schema\) < 2\) return done\(false\);/.test(SRC));
ok('⚠️ והסכמה מועברת מ-fsYearLoad כדי שאפשר יהיה לבדוק אותה',
   /schema:   doc\.schema/.test(SRC));
ok('⚠️ ומפת ההערות נקראת מהמטמון, לא בקריאה שנייה מהגיליון',
   /notesMap = cached_\('cba_notes_' \+ budgetStamp_\(\)/.test(GS));

/* ================================================================= */
section('4. הלקוח — השער');
ok('🔴 ברירת המחדל בקוד כבויה', /var BOOT_FROM_FIRESTORE = false;/.test(SRC));
ok('⚠️ ואין קיצור על הקבוע — הוא רק ברירת המחדל שמועברת ל-flag()',
   /CBA\.fb\.flag\("bootFromFirestore", BOOT_FROM_FIRESTORE\)/.test(SRC) &&
   !/if \(!BOOT_FROM_FIRESTORE\) return/.test(SRC));
ok('🔴 רץ רק כשאין מטמון', /if \(!hadCache\) \{\s*\n\s*bootFromFirestore\(/.test(SRC));
ok('🔴 ואינו כותב למטמון המקומי (הוא חלקי לפי הגדרה)',
   (SRC.match(/localStorage\.setItem\(CACHE_KEY/g) || []).length === 1 &&
   !/bootFromFirestore[\s\S]{0,2000}localStorage\.setItem\(CACHE_KEY/.test(
     SRC.slice(SRC.indexOf('function bootFromFirestore'), SRC.indexOf('function load(cb)'))));
ok('🔴 fsYearLoad נקרא בשני ארגומנטים — נקודת גזירת ההרשאה אחת',
   /fsYearLoad\(y, function \(e3, res\)/.test(SRC) && /function fsYearLoad\(y, done\)/.test(SRC));
const nBuild = (SRC.match(/= buildYear\(y, /g) || []).length;
const nCat   = (SRC.match(/toCategory\(/g) || []).length;
ok('🔴 ואותו buildYear בדיוק — אין המרה מקבילה',
   nBuild === 3 && nCat === 2, nBuild + '/' + nCat);

/* ================================================================= */
section('5. 🔴🔴 app.js — הזהות נקבעת לפני המשיכה');
ok('נתיב עליית העמוד קורא ל-applyUser לפני load',
   /if \(currentUser\) \{ applyUser\(\); CBA\.sheets\.load\(sheetsLoadHandler\); \}/.test(APP));
ok('🔴 וגם נתיב ההתחברות',
   /currentUser = data;[\s\S]{0,800}applyUser\(\);[\s\S]{0,1200}CBA\.sheets\.load\(/.test(APP));
/* 🔴 שלוש נקודות כניסה בלבד, ושתיהן שמתחילות טעינה **מאפס** קובעות
   זהות קודם. השלישית היא כפתור "נסה שוב" שבתוך פאנל השגיאה —
   הוא מופיע רק אחרי ש-`sheetsLoadHandler` כבר רץ, כלומר
   `ensureHeaderShell()`/`applyUser()` כבר מאחורינו. אם המספר
   יגדל — יש נתיב רביעי שצריך להיבדק ידנית. */
ok('⚠️ ואין נתיב רביעי שמפעיל load',
   (APP.match(/CBA\.sheets\.load\(/g) || []).length === 3,
   String((APP.match(/CBA\.sheets\.load\(/g) || []).length));
ok('⚠️ והשלישי הוא כפתור "נסה שוב", שרץ הרבה אחרי הציור הראשון',
   /btn\.textContent = "\u05d8\u05d5\u05e2\u05df\u2026";\s*\n\s*CBA\.sheets\.load\(/.test(APP));

/* ================================================================= */
/* ---------- סביבת הרצה ---------- */
let readLog, queryLog, cacheWrites, bootFlagOn, docDelay, payloadDelay, storedCache;
function makeEnv(opts) {
  opts = opts || {};
  readLog = []; queryLog = []; cacheWrites = [];
  bootFlagOn = opts.flagOn !== false;
  docDelay = opts.docDelay || 0;
  payloadDelay = opts.payloadDelay || 0;
  storedCache = opts.cache || null;
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const sandbox = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: {
      getItem: k => (k === 'cba_data_v2' ? storedCache : null),
      setItem: (k, v) => cacheWrites.push(k),
      removeItem() {}
    },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: () => new Promise(r => setTimeout(
      () => r({ json: () => Promise.resolve(payload()) }), payloadDelay))
  };
  sandbox.window = sandbox;
  sandbox.CBA = {
    mock: store, authSession: 'SESS', esc: s => String(s),
    /* 🔴 כאן הזהות **כן** מוגדרת — כי app.js קורא ל-applyUser לפני
       המשיכה (סעיף 5). זה מה שמאפשר לגזירה בלקוח להיות נכונה. */
    isSuper: !opts.resident,
    perms: opts.resident ? [] : ['תקציב'],
    user: { familyId: opts.resident ? '401' : '' },
    fb: {
      authReady: cb => setTimeout(() => cb(opts.noUser ? null : { uid: 'u1' }), 0),
      ensureDb: cb => setTimeout(() => cb(opts.dbErr ? new Error('db') : null), 0),
      flag: (k, d) => (k === 'bootFromFirestore' ? bootFlagOn : d),
      readDoc: (c, id, cb) => {
        readLog.push(c + '/' + id);
        setTimeout(() => {
          if (c === 'appConfig' && id === 'boot') {
            return cb(null, { years: ['תשפ"ו', CUR], currentYear: CUR,
                              settings: { 'סיסמת רשת המועדון': '1234' },
                              version: 'v43', schema: 1 });
          }
          if (c === 'budgetYears') {
            var yd = { year: id, budget: [{ 'סעיף': 'גינון', 'קבוצה': 'ג' }],
                       income: [], groups: ['ג'], splits: [], items: [],
                       closed: true, baseline: { גינון: 5 },
                       notes: { content: 'הערה', editedBy: 'י', editedAt: '' },
                       schema: 2 };
            /* מסמך בסכמה 1 — מצב הייצור לפני budgetSync הראשון:
               אין בו closed/baseline/notes בכלל. */
            if (opts.oldSchema) {
              yd = { year: id, budget: yd.budget, income: [], groups: ['ג'],
                     splits: [], items: [], schema: 1 };
            }
            return cb(null, yd);
          }
          cb(null, null);
        }, docDelay);
      },
      queryCollection: (name, conds, cb) => {
        queryLog.push({ name: name, conds: JSON.parse(JSON.stringify(conds)) });
        setTimeout(() => cb(null, [{ 'מזהה': 7, 'סכום': 30, 'מזהה משפחה': '401' }]), docDelay);
      },
      readCollection: () => {}, isDbReady: () => true
    },
    data: {
      familyDisplayName: id => (String(id) === '401' ? 'משפחת בדיקה' : ''),
      ensureFamilyNames: cb => cb(),
      fsFirstRead: (key, enabled, load, sheets, cb) => sheets(res => cb(res))
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

function payload() {
  const yr = { budget: [], income: [], groups: [], splits: [], items: [], transactions: [] };
  return { ok: true, rev: 100, domains: { budget: 1 }, years: ['תשפ"ו', CUR],
           currentYear: CUR, settings: { 'סיסמת רשת המועדון': '1234' }, notes: {}, groups: [],
           updates: [{ 'מזהה': 'U1' }], notesLog: [{ 'מזהה': 'N1' }],
           data: { [CUR]: yr } };
}

(async function () {
  /* =============================================================== */
  section('6. 🔴 המסלול המהיר עובד — ומצייר לפני המטען');
  let env = makeEnv({ payloadDelay: 120 });
  let calls = [];
  env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
  await wait(60);
  ok('הודעה ראשונה מגיעה מ-Firestore', calls[0] === 'firestore-boot', JSON.stringify(calls));
  ok('⚠️ ולפני שהמטען בכלל חזר', calls.length === 1, JSON.stringify(calls));
  ok('🔴 והשנה באמת נבנתה — לא מסך ריק',
     !!(env.CBA.mock.years[CUR] && env.CBA.mock.years[CUR].categories.length === 1),
     JSON.stringify(Object.keys(env.CBA.mock.years)));
  ok('🔴 והמצב הנגזר עבר: תקציב סגור', env.CBA.mock.years[CUR].budget.phase === 'locked',
     String(env.CBA.mock.years[CUR].budget.phase));
  ok('🔴 והבסיס והערות עברו גם הם',
     env.CBA.mock.years[CUR].budget.baseline && env.CBA.mock.years[CUR].budget.baseline['גינון'] === 5 &&
     env.CBA.mock.years[CUR].notes.content === 'הערה');
  ok('⚠️ ומנהל-על מקבל שאילתת תנועות לפי שנה בלבד',
     queryLog.length === 1 && queryLog[0].conds.length === 1,
     JSON.stringify(queryLog));
  ok('🔴 ולא נכתב מטמון מקומי מהמסלול הזה', cacheWrites.length === 0, JSON.stringify(cacheWrites));
  await wait(150);
  ok('⚠️ והמטען מנצח כשהוא מגיע — העדכונים חוזרים',
     env.CBA.mock.budgetUpdates.length === 1 && calls[1] === 'fresh', JSON.stringify(calls));
  ok('⚠️ ורק אז נכתב המטמון', cacheWrites.length === 1, JSON.stringify(cacheWrites));

  /* =============================================================== */
  section('7. 🔴🔴 המטען תמיד מנצח — גם כשהוא מקדים');
  env = makeEnv({ docDelay: 120, payloadDelay: 0 });
  calls = [];
  env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
  await wait(300);
  ok('המטען הוחל ראשון', calls[0] === 'fresh', JSON.stringify(calls));
  ok('🔴 והמסלול המהיר **לא** דרס אותו',
     env.CBA.mock.budgetUpdates.length === 1 && env.CBA.mock.notesLog.length === 1,
     JSON.stringify([env.CBA.mock.budgetUpdates.length, env.CBA.mock.notesLog.length]));
  ok('🔴 ולא הודיע פעם שנייה', calls.filter(s => s === 'firestore-boot').length === 0,
     JSON.stringify(calls));

  /* =============================================================== */
  section('8. השערים — כל כשל פשוט לא מצייר מוקדם');
  for (const [label, opts] of [['הדגל כבוי', { flagOn: false }],
                               ['אין משתמש', { noUser: true }],
                               ['אין DB', { dbErr: true }]]) {
    env = makeEnv(Object.assign({ payloadDelay: 120 }, opts));
    calls = [];
    env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
    await wait(60);
    ok(label + ' → אין ציור מוקדם', calls.length === 0, JSON.stringify(calls));
    ok('⚠️ ' + label + ' → וגם אין קריאה מבוזבזת',
       readLog.filter(s => s === 'budgetYears/' + CUR).length === 0, JSON.stringify(readLog));
    await wait(150);
    ok('⚠️ ' + label + ' → והמטען עדיין מצייר כרגיל', calls[0] === 'fresh', JSON.stringify(calls));
  }

  /* =============================================================== */
  section('9. יש מטמון ⇒ אין קריאה בכלל (מכסת Spark)');
  const cached = JSON.stringify({ t: Date.now(), store: {
    years: { [CUR]: { _loaded: true, income: [], categories: [], transactions: [],
                      budget: { phase: 'draft', baseline: null }, notes: {}, groups: [] } },
    yearList: [CUR], currentYear: CUR, settings: {}, budgetUpdates: [], notesLog: [] } });
  env = makeEnv({ cache: cached, payloadDelay: 60 });
  calls = [];
  env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
  await wait(40);
  ok('המטמון צויר', calls[0] === 'cache', JSON.stringify(calls));
  ok('🔴 ואף קריאת Firestore לא יצאה', readLog.length === 0 && queryLog.length === 0,
     JSON.stringify(readLog));

  /* =============================================================== */
  section('10. תושב — מושך רק את מה שמותר לו');
  env = makeEnv({ resident: true, payloadDelay: 200 });
  calls = [];
  env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
  await wait(80);
  ok('🔴 תושב אינו קורא את מסמך השנה (הכלל היה דוחה, והכול היה נופל)',
     readLog.indexOf('budgetYears/' + CUR) === -1, JSON.stringify(readLog));
  ok('⚠️ אבל כן קורא את מסמך הפתיחה', readLog.indexOf('appConfig/boot') !== -1);
  ok('🔴 והשאילתה שלו מסוננת לפי משפחה',
     queryLog.length === 1 && queryLog[0].conds.length === 2 &&
     queryLog[0].conds[1][0] === 'familyId' && queryLog[0].conds[1][1] === '401',
     JSON.stringify(queryLog));
  ok('⚠️ והוא מקבל תוכנית ריקה ואת התנועות שלו — בדיוק כמו DATA_MIN היום',
     env.CBA.mock.years[CUR] && env.CBA.mock.years[CUR].categories.length === 0 &&
     env.CBA.mock.years[CUR].transactions.length === 1,
     JSON.stringify(Object.keys(env.CBA.mock.years || {})));

  /* =============================================================== */
  section('11. 🔴🔴 חנות חלקית אינה חנות שאפשר לכתוב ממנה');
  env = makeEnv({ payloadDelay: 300 });
  calls = [];
  env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
  await wait(60);
  ok('הציור המוקדם קרה', calls[0] === 'firestore-boot', JSON.stringify(calls));
  /* 🔴 מיד אחרי הציור המוקדם `inited` הופך ל-true והמסכים לחיצים.
     כתיבה בחלון הזה נגזרת ממה שלא נטען: תצורת עמודות **גלובלית**
     שנדרסת בריק, ושורת "עדכוני תקציב" שלא נרשמת כי השנה נראית
     טיוטה. שתיהן שקטות ובלתי הפיכות. */
  ok('🔴🔴 והחנות מסומנת חלקית', env.CBA.mock._partial === true,
     String(env.CBA.mock._partial));
  ok('🔴 והסימון הזה הוא מה ש-pushConnected בודק',
     /CBA\.mock\._source === "sheets" && !CBA\.mock\._partial/.test(DS));
  ok('🔴 ואין מפת הגדרות חלקית שנראית אמיתית',
     JSON.stringify(env.CBA.mock._settings) === '{}',
     JSON.stringify(env.CBA.mock._settings));
  await wait(400);
  ok('🔴🔴 והמטען מנקה את הסימון — החלון נסגר מעצמו',
     env.CBA.mock._partial === undefined, String(env.CBA.mock._partial));
  ok('⚠️ ואז ההגדרות האמיתיות במקומן',
     env.CBA.mock._settings && env.CBA.mock._settings['סיסמת רשת המועדון'] === '1234',
     JSON.stringify(env.CBA.mock._settings));

  /* =============================================================== */
  section('12. 🔴 מסמך שנה בסכמה ישנה — לא מציירים מוקדם בכלל');
  env = makeEnv({ oldSchema: true, payloadDelay: 200 });
  calls = [];
  env.CBA.sheets.load((okv, info) => calls.push(info && info.source));
  await wait(80);
  ok('🔴 אין ציור מוקדם', calls.length === 0, JSON.stringify(calls));
  ok('🔴 ובוודאי לא שנה סגורה שמוצגת כטיוטה',
     !(env.CBA.mock.years && env.CBA.mock.years[CUR]),
     JSON.stringify(Object.keys(env.CBA.mock.years || {})));
  ok('⚠️ והחנות אינה מסומנת חלקית', env.CBA.mock._partial === undefined);
  await wait(250);
  ok('⚠️ והמטען מצייר כרגיל', calls[0] === 'fresh', JSON.stringify(calls));

  console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
