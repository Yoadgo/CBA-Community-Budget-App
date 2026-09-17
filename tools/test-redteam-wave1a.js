/* בדיקות למנה הראשונה של גל 1 בצוות האדום (2026-09-17).
   הרצה:  node tools/test-redteam-wave1a.js

   שלושה ממצאים, ושלושתם מאותה משפחה: **כשל שקט**.
     18 — doGet גזר שנות תקציב משמות טאבים, וטאב הארכיון "תנועות שנמחקו"
          הפך לשנה בשם "שנמחקו" בבורר של כל המשתמשים.
     01 — ל-push() לא הייתה שום תקרת זמן. Promise שלא נפתר הקפיא את
          inFlightWrites, ואיתו את כל רענוני הרקע, עד רענון עמוד.
     03 — logout() מחק את המושב ולא את הנתונים; הכול נשאר בזיכרון וב-DOM.

   ⚠️ הבדיקות כאן נכתבו **לפני** שראיתי את התוצאה, והציפייה של כל אחת
      רשומה בשמה. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE   = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const SHEETS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'sheets.js'), 'utf8');
const APP    = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');

/* ============================================================================
   ממצא 18 — מקור אחד לרשימת השנים
   ========================================================================== */
section('1. ממצא 18 — רשימת השנים');

const sheetNames = ['תנועות תשפ"ו', 'תנועות תשפ"ז', 'תנועות שנמחקו', 'תקציב תשפ"ז', 'הגדרות'];
const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString().substring(0, 10), getUuid: () => 'x',
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => fakeSS(), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
function fakeSS() {
  return {
    getSheets: () => sheetNames.map(n => ({ getName: () => n })),
    getSheetByName: n => (sheetNames.indexOf(n) !== -1 ? { getName: () => n } : null)
  };
}
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);

const SS = fakeSS();

// המצב התקין: הגדרת "שנים" מלאה
let years = sandbox.listYears_(SS, { 'שנים': 'תשפ"ו, תשפ"ז' });
ok('listYears_ גוזרת מהגדרת "שנים"', years.join('|') === 'תשפ"ו|תשפ"ז', JSON.stringify(years));
ok('🔴 ו"שנמחקו" אינה ברשימה', years.indexOf('שנמחקו') === -1, JSON.stringify(years));
ok('רווחים מיותרים בהגדרה נחתכים',
   sandbox.listYears_(SS, { 'שנים': '  תשפ"ז ,תשפ"ו  ' }).join('|') === 'תשפ"ז|תשפ"ו');

// נפילה לאחור: הגדרה חסרה או ריקה — בורר שנים ריק שובר את המסך לגמרי
const fb = sandbox.listYears_(SS, {});
ok('⚠️ הגדרה חסרה → נפילה לאחור לסריקת טאבים', fb.length === 2, JSON.stringify(fb));
ok('🔴 וגם בנפילה לאחור טאב הארכיון מסונן', fb.indexOf('שנמחקו') === -1, JSON.stringify(fb));
ok('הגדרה ריקה מתנהגת כמו חסרה',
   sandbox.listYears_(SS, { 'שנים': '   ' }).indexOf('שנמחקו') === -1);

ok('BTX_ARCHIVE_TAB עדיין "תנועות שנמחקו" (לא נדרש שינוי בגיליון)',
   sandbox.BTX_ARCHIVE_TAB === 'תנועות שנמחקו', sandbox.BTX_ARCHIVE_TAB);
ok('⚠️ לא נשארה בקובץ שום גזירה עצמאית משמות טאבים',
   (CODE.match(/indexOf\('תנועות '\) === 0/g) || []).length === 0,
   'נמצאו ' + (CODE.match(/indexOf\('תנועות '\) === 0/g) || []).length);
ok('והסריקה היחידה שנשארה יושבת בתוך listYears_',
   (CODE.match(/indexOf\(PREFIX\) === 0/g) || []).length === 1 &&
   CODE.indexOf('function listYears_') < CODE.indexOf('indexOf(PREFIX) === 0'));
ok('doGet קורא ל-listYears_', /var years = listYears_\(ss, settings\)/.test(CODE));

/* ============================================================================
   ממצא 01 — תקרת זמן ושומר
   ========================================================================== */
section('2. ממצא 01 — מונה הכתיבה');

ok('🔴 ל-push יש תקרת זמן', /pushTimer = setTimeout\(/.test(SHEETS) && /PUSH_TIMEOUT_MS/.test(SHEETS));
ok('התקרה היא 60 שניות', /var PUSH_TIMEOUT_MS\s+= 60000;/.test(SHEETS));
ok('🔴 והמונה יורד דרך releaseWrite ולא בהשמה ישירה בענפים',
   (SHEETS.match(/inFlightWrites = Math\.max\(0, inFlightWrites - 1\)/g) || []).length === 1,
   'נמצאו ' + (SHEETS.match(/inFlightWrites = Math\.max\(0, inFlightWrites - 1\)/g) || []).length);
ok('releaseWrite חד-פעמי (שחרור כפול לא מוריד פעמיים)',
   /if \(released\) return false;\s*\n\s*released = true;/.test(SHEETS));
ok('⚠️ ומנקה את הטיימר, כדי שתשובה בזמן לא תדליק את מסלול הכישלון',
   /if \(pushTimer\) \{ clearTimeout\(pushTimer\); pushTimer = null; \}/.test(SHEETS));
ok('כתיבה שעברה את התקרה נכנסת לתור ולא נזרקת',
   /}, PUSH_TIMEOUT_MS\);/.test(SHEETS) &&
   SHEETS.indexOf('enqueueWrite(action, payload, _retryAttempt || 0);\n        noteFail(action, "השמירה לא קיבלה') !== -1);

ok('קיים שומר תקופתי', /setInterval\(watchdogSweep, WATCHDOG_TICK_MS\)/.test(SHEETS));
ok('סף הסחיפה (120ש\') כפול מהתקרה ומעל xhr.timeout=90000',
   /var STALE_BUSY_MS\s+= 120000;/.test(SHEETS));
ok('🔴 סיבות שקטות לא נסחפות (טופס פתוח הוא מצב לגיטימי)',
   /if \(dirtyReasons\[k\] === "\\u0000silent"\) return;/.test(SHEETS));
ok('השומר מאפס מונה כתיבות תקוע',
   /if \(inFlightWrites > 0 && \(now - lastWriteStartedAt\) > STALE_BUSY_MS\)/.test(SHEETS));
ok('🔴 והוא מסיר מאזין beforeunload יתום', /removeEventListener\("beforeunload", unloadGuards\[i\]\.fn\)/.test(SHEETS));
ok('postReadProgress רושם את המאזין דרך addUnloadGuard', /addUnloadGuard\(onBeforeUnload\);/.test(SHEETS));
ok('⚠️ ו-clearUnloadGuard מסיר גם מהרשימה ולא רק מהחלון',
   /function clearUnloadGuard\(\) \{ removeUnloadGuard\(onBeforeUnload\); \}/.test(SHEETS));
ok('כל שחרור משאיר שובל ב-diag (דרך noteFail) ובקונסולה',
   /noteFail\("watchdog",/.test(SHEETS) && /console\.warn\("\[CBA\] שומר הכתיבות/.test(SHEETS));
ok('⚠️ ולא השמה ישירה ל-lastWriteErrorMsg (ר\' ההערה ליד noteFail)',
   /noteFail\("watchdog",/.test(SHEETS) && !/lastWriteErrorMsg = "פעולה נתקעה/.test(SHEETS));
ok('markDirty רושם חותמת זמן', /if \(!dirtySince\[key\]\) dirtySince\[key\] = Date\.now\(\);/.test(SHEETS));
ok('🔴 והחותמת אינה מתעדכנת בקריאה חוזרת (אחרת השומר משותק לנצח)',
   (SHEETS.match(/dirtySince\[key\] = Date\.now\(\)/g) || []).length === 1 &&
   /if \(!dirtySince\[key\]\) dirtySince\[key\] = Date\.now\(\);/.test(SHEETS));
ok('clearDirty מנקה גם את החותמת', /delete dirtySince\[key\];/.test(SHEETS));
ok('הדגל writeWatchdog קיים ב-FLAG_KEYS', sandbox.FLAG_KEYS.indexOf('writeWatchdog') !== -1);
ok('⚠️ וברירת המחדל שלו דלוקה (קריאת דגל שנכשלת לא מכבה את הרשת)',
   /CBA\.fb\.flag\("writeWatchdog", true\)/.test(SHEETS) && /return true;\s*\n\s*\}/.test(SHEETS));
ok('החיווי הופך לאזהרה אחרי 45 שניות', /var SAVE_STUCK_MS = 45000;/.test(APP) && /"הפעולה מתעכבת"/.test(APP));
ok('⚠️ והאזהרה לא נדלקת אם בינתיים השמירה הסתיימה',
   /if \(!CBA\.sheets\.isDirty \|\| !CBA\.sheets\.isDirty\(\)\) return;/.test(APP));

/* ============================================================================
   ממצא 03 — יציאה
   ========================================================================== */
section('3. ממצא 03 — יציאה');

ok('logout מנקה מסך וזיכרון', /wipeScreen\(\);\s*\n\s*wipeMemoryData\(\);/.test(APP));
ok('🔴 והסדר הוא ניקוי לפני ציור השער',
   APP.indexOf('wipeMemoryData();') < APP.indexOf('showLoginGate();\n  }'));
ok('CBA.mock מאופס לשלד ריק ולא נמחק', /m\.years = \{ "": \{/.test(APP) && !/delete CBA\.mock/.test(APP));
ok('⚠️ שלד הריק מחזיק את כל ששת מפתחות ה-accessor',
   ['categories', 'income', 'transactions', 'budget', 'notes', 'groups']
     .every(k => new RegExp(k + ':').test(APP.slice(APP.indexOf('m.years = { "": {'),
                                                   APP.indexOf('m.currentYear = "";')))));
ok('כל המטא של sheets.js (_source, _settings…) נמחק לפי תחילית',
   /if \(k\.charAt\(0\) === "_"\) \{ try \{ delete m\[k\]; \}/.test(APP));
ok('ארבעת אזורי השלד מתרוקנים',
   /\["app-main", "app-nav", "app-controls", "year-switch"\]/.test(APP));
ok('חיווי השמירה מוסר מהכותרת', /getElementById\("cba-save-indicator"\)/.test(APP.slice(APP.indexOf('function wipeScreen'))));
ok('🔴 שכבות צפות מוסרות בכלל "שומרים את השלד" ולא ברשימת מחלקות',
   /Array\.prototype\.slice\.call\(document\.body\.children\)/.test(APP) &&
   !/\.cba-modal, \.cba-drawer/.test(APP));
ok('⚠️ ושער הכניסה עצמו אינו נמחק בדרך', /var SHELL = \{ "login-gate": 1 \};/.test(APP));
ok('תגי script/style נשארים', /KEEP_TAGS\[el\.tagName\]/.test(APP));

/* ============================================================================
   4. 🔴 ההוכחה ההתנהגותית — sheets.js האמיתי, מול fetch שלעולם לא נפתר
   ----------------------------------------------------------------------------
   הבדיקות למעלה הן טקסטואליות והן לא מוכיחות כלום על ההתנהגות. כאן רץ
   js/data/sheets.js עצמו, בשעון מזויף, בדיוק בתרחיש שנתפס בייצור:
   Apps Script לא עונה לעולם. לפני 17.9 isDirty() היה נשאר אמת לנצח
   וכל רענון רקע היה נחסם עד רענון עמוד.
   ========================================================================== */
section('4. התנהגות — כתיבה שלא חוזרת');

/* ⚠️ שרשרת ה-fetch ב-push היא כמה תורים של מיקרו-משימות (then→json→then),
   ולכן "לקדם את השעון" לא מספיק — צריך גם לתת ל-Promise לרוץ. בלי זה
   הבדיקה מודדת מצב ביניים ומדווחת כישלון שאינו קיים. */
const drain = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

function makeClock() {
  let now = 1000000, id = 0;
  const timers = new Map();
  const micro = [];
  const api = {
    setTimeout(fn, ms) { id++; timers.set(id, { at: now + (ms || 0), fn: fn, every: 0 }); return id; },
    setInterval(fn, ms) { id++; timers.set(id, { at: now + (ms || 0), fn: fn, every: ms || 1 }); return id; },
    clearTimeout(t) { timers.delete(t); },
    clearInterval(t) { timers.delete(t); },
    now() { return now; },
    async advance(ms) {
      const target = now + ms;
      let guard = 0;
      while (guard++ < 10000) {
        let next = null;
        timers.forEach((t, k) => { if (t.at <= target && (!next || t.at < next.t.at)) next = { k: k, t: t }; });
        if (!next) break;
        now = next.t.at;
        if (next.t.every) next.t.at = now + next.t.every; else timers.delete(next.k);
        try { next.t.fn(); } catch (e) { micro.push(e); }
        await drain();
      }
      now = target;
      await drain();
    }
  };
  return api;
}

function makeSheetsEnv(fetchImpl) {
  const clock = makeClock();
  class FakeDate extends Date {
    constructor(...a) { if (!a.length) super(clock.now()); else super(...a); }
    static now() { return clock.now(); }
  }
  const diagLines = [];
  const warns = [];
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const sandbox = {
    console: { log() {}, error() {}, warn: (...a) => warns.push(a.join(' ')) },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    setInterval: clock.setInterval, clearInterval: clock.clearInterval,
    Date: FakeDate,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    CustomEvent: function (n, o) { this.type = n; this.detail = o && o.detail; },
    dispatchEvent() { return true; },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: fetchImpl
  };
  sandbox.window = sandbox;
  sandbox.CBA = {
    mock: store, authSession: 'SESS', esc: s => String(s),
    diag: { log: l => diagLines.push(l) },
    isSuper: true, perms: ['תקציב'], user: { familyId: '' },
    fb: { authReady: cb => cb(null), ensureDb: cb => cb(null),
          flag: (k, d) => d, readDoc: (c, i, cb) => cb(null, null),
          queryCollection: (n, c, cb) => cb(null, []), readCollection() {}, isDbReady: () => false },
    data: { familyDisplayName: () => '', ensureFamilyNames: cb => cb(),
            fsFirstRead: (k, e, l, sh, cb) => sh(r => cb(r)) }
  };
  vm.createContext(sandbox);
  vm.runInContext(SHEETS, sandbox);
  return { S: sandbox.CBA.sheets, clock, diagLines, warns, sandbox };
}

(async function () {
  /* --- התרחיש: fetch שלעולם לא נפתר --- */
  const env = makeSheetsEnv(() => new Promise(() => {}));
  const S = env.S;

  S.push('saveBudget', { a: 1 }, function () {});
  ok('מיד אחרי push — האפליקציה "עסוקה"', S.isDirty() === true);
  ok('⚠️ והתור ריק, כי הכישלון עוד לא קרה', S.pendingCount() === 0, String(S.pendingCount()));

  await env.clock.advance(30000);
  ok('אחרי 30 שניות עדיין עסוקה — לא מנתקים שמירה אמיתית', S.isDirty() === true);

  await env.clock.advance(31000);
  ok('🔴 אחרי 61 שניות המונה שוחרר — זה הבאג שנסגר',
     S._busyDebug().inFlight === 0, JSON.stringify(S._busyDebug()));
  ok('🔴 והכתיבה נכנסה לתור הניסיונות החוזרים ולא נזרקה',
     S.pendingCount() === 1, String(S.pendingCount()));
  ok('⚠️ ויש שובל ב-diag', env.diagLines.some(l => l.indexOf('תקרת הזמן') !== -1),
     JSON.stringify(env.diagLines));

  /* --- מצב "עסוק" שנתקע מסיבה אחרת (callback שזרק, טופס שנסגר) --- */
  const e2 = makeSheetsEnv(() => new Promise(() => {}));
  e2.S.markDirty('receiptUpload', 'מעלה קובץ…');
  await e2.clock.advance(60000);
  ok('סיבה גלויה בת דקה עדיין מוחזקת', e2.S.isDirty() === true);
  await e2.clock.advance(70000);
  ok('🔴 ואחרי שתי דקות השומר משחרר אותה', e2.S.isDirty() === false,
     JSON.stringify(e2.S._busyDebug()));
  ok('⚠️ והשחרור נרשם', e2.warns.some(w => w.indexOf('שומר הכתיבות') !== -1), JSON.stringify(e2.warns));

  /* --- 🔴 הבדיקה ההפוכה: סיבה שקטה היא מצב לגיטימי ואסור לגעת בה --- */
  const e3 = makeSheetsEnv(() => new Promise(() => {}));
  e3.S.markDirty('planFormOpen', false);
  await e3.clock.advance(600000);
  ok('🔴 סיבה שקטה שורדת עשר דקות — טופס פתוח אינו תקלה',
     e3.S.isDirty() === true, JSON.stringify(e3.S._busyDebug()));

  /* --- שמירה שחוזרת בזמן לא נוגעת בשום מסלול כישלון --- */
  const e4 = makeSheetsEnv(() => Promise.resolve({ json: () => Promise.resolve({ ok: true }) }));
  let got = null;
  e4.S.push('saveBudget', { a: 1 }, r => { got = r; });
  await drain();
  await e4.clock.advance(5);
  ok('שמירה מוצלחת משחררת מיד', e4.S._busyDebug().inFlight === 0 && got && got.ok === true,
     JSON.stringify(e4.S._busyDebug()));
  await e4.clock.advance(120000);
  ok('⚠️ ואחרי שתי דקות היא עדיין לא נכנסה לתור בטעות',
     e4.S.pendingCount() === 0, String(e4.S.pendingCount()));

  /* ==========================================================================
     5. 🔴 wipeScreen מול ה-DOM האמיתי של index.html
     --------------------------------------------------------------------------
     הכלל "מסירים כל ילד ישיר של body חוץ מהשלד" חזק — ולכן מסוכן. בדיקה
     טקסטואלית לא תתפוס את המקרה שבו הוא מוחק את שער הכניסה עצמו, את הכותרת
     או את תגי ה-script, וכל אחד מהם הופך "יציאה" למסך לבן.
     ========================================================================== */
  section('5. יציאה מול DOM אמיתי');
  try {
    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
                          { runScripts: 'outside-only' });
    const d = dom.window.document;

    /* מצב "אחרי התחברות כמנהל": תוכן מצויר, מודל, רקע מגירה, טוסט, חיווי. */
    d.getElementById('app-main').innerHTML = '<table id="res-table"><tr><td>בית 999</td></tr></table>';
    d.getElementById('app-nav').innerHTML = '<button>תקציב</button>';
    ['cba-modal', 'drawer-backdrop', 'cba-toast', 'gt-sheet'].forEach(c => {
      const el = d.createElement('div'); el.className = c; d.body.appendChild(el);
    });
    const gate = d.createElement('div'); gate.id = 'login-gate'; d.body.appendChild(gate);
    const ind = d.createElement('div'); ind.id = 'cba-save-indicator';
    d.getElementById('save-indicator-slot').appendChild(ind);
    const scriptsBefore = d.body.querySelectorAll('script').length;

    const src = APP.slice(APP.indexOf('function wipeScreen()'), APP.indexOf('  function logout()'));
    const wipeScreen = new dom.window.Function('document', src + '\nreturn wipeScreen;')(d);
    wipeScreen();

    ok('🔴 טבלת התושבים ירדה מה-DOM', !d.querySelector('#res-table'));
    ok('app-main ו-app-nav רוקנו',
       d.getElementById('app-main').innerHTML === '' && d.getElementById('app-nav').innerHTML === '');
    ok('🔴 כל ארבע השכבות הצפות הוסרו',
       !d.querySelector('.cba-modal') && !d.querySelector('.drawer-backdrop') &&
       !d.querySelector('.cba-toast') && !d.querySelector('.gt-sheet'));
    ok('חיווי השמירה הוסר', !d.getElementById('cba-save-indicator'));
    ok('🔴🔴 שער הכניסה שרד', !!d.getElementById('login-gate'));
    ok('🔴🔴 הכותרת שרדה', !!d.querySelector('header.app-header'));
    ok('🔴🔴 שלד האפליקציה שרד (app-main, app-nav, עוגן החיווי)',
       !!d.getElementById('app-main') && !!d.getElementById('app-nav') &&
       !!d.getElementById('save-indicator-slot'));
    ok('🔴🔴 תגי ה-script לא נמחקו',
       d.body.querySelectorAll('script').length === scriptsBefore,
       d.body.querySelectorAll('script').length + ' מתוך ' + scriptsBefore);
  } catch (e) {
    ok('jsdom זמין (npm install בתיקיית tools)', false, e.message);
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + '   נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
