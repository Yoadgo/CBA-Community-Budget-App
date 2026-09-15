/* בדיקות לדגלי זמן ריצה (2026-09-15, צעד 05א).
   הרצה:  node tools/test-runtime-flags.js

   🔴 המנגנון הזה שולט על מה שכל משתמש רואה, ולכן שני דברים חשובים ממנו:
     1. **דגל שאי-אפשר לקרוא אינו נקודת כשל.** אם המסמך חסר, נדחה או איטי —
        הלקוח ממשיך עם ברירת המחדל שבקוד. מתג בטיחות שמפיל את האפליקציה
        כשהוא שבור גרוע מלא להתקין אותו.
     2. **רשימת מפתחות סגורה.** הקלדה שגויה תיצור דגל שאיש לא קורא,
        והמנהל יהיה בטוח שכיבה משהו שבפועל עדיין דולק. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FB = fs.readFileSync(path.join(ROOT, 'js', 'data', 'firebase.js'), 'utf8');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

/* ---------------- צד השרת ---------------- */
let store, failOn;
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
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
sandbox.json_ = o => o;
function reset() {
  store = null; failOn = null;
  sandbox.fsGet_ = () => { if (failOn === 'get') throw new Error('קריאה נכשלה (503)'); return store; };
  sandbox.fsSet_ = (p, o) => { if (failOn === 'set') throw new Error('כתיבה נכשלה (503)'); store = o; return {}; };
}
const isDate = x => !!x && typeof x.getTime === 'function';

section('1. רישום');
reset();
ok('FS_FLAGS_DOC = appConfig/flags', sandbox.FS_FLAGS_DOC === 'appConfig/flags', sandbox.FS_FLAGS_DOC);
ok('שלושה דגלים ברשימה', sandbox.FLAG_KEYS.length === 3, JSON.stringify(sandbox.FLAG_KEYS));
ok('budgetYearFromFirestore', sandbox.FLAG_KEYS.indexOf('budgetYearFromFirestore') !== -1);
ok('gardenPlanFromFirestore', sandbox.FLAG_KEYS.indexOf('gardenPlanFromFirestore') !== -1);
ok('servicesFromFirestore', sandbox.FLAG_KEYS.indexOf('servicesFromFirestore') !== -1);
ok('🔴 flagSet דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS.flagSet === sandbox.PERM_SUPER);
ok('🔴 flagsGet דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS.flagsGet === sandbox.PERM_SUPER);
ok('אינן ברשימת הפתוחות',
   sandbox.GET_PUBLIC_ACTIONS.indexOf('flagSet') === -1 && sandbox.GET_PUBLIC_ACTIONS.indexOf('flagsGet') === -1);
ok('doGet מנתב לשתיהן',
   /action === 'flagSet'[\s\S]{0,80}handleFlagSet_/.test(CODE) &&
   /action === 'flagsGet'[\s\S]{0,80}handleFlagsGet_/.test(CODE));

section('2. flagsSet_ — הכתיבה');
reset();
let r = sandbox.flagsSet_('servicesFromFirestore', true);
ok('הדגל נדלק', r.servicesFromFirestore === true, JSON.stringify(r));
/* ⚠️ מסמך חסר אינו "הכול דלוק" — כל מפתח שלא נכתב מפורשות הוא false. */
ok('🔴 השני נשאר כבוי במפורש', r.gardenPlanFromFirestore === false, String(r.gardenPlanFromFirestore));
ok('schema ו-updatedAt', r.schema === 1 && isDate(r.updatedAt));
ok('נשמר', store.servicesFromFirestore === true);
r = sandbox.flagsSet_('gardenPlanFromFirestore', true);
ok('⚠️ הדלקה שנייה אינה מכבה את הראשון',
   r.servicesFromFirestore === true && r.gardenPlanFromFirestore === true, JSON.stringify(r));
r = sandbox.flagsSet_('servicesFromFirestore', false);
ok('כיבוי עובד', r.servicesFromFirestore === false && r.gardenPlanFromFirestore === true, JSON.stringify(r));

section('3. 🔴 רשימת מפתחות סגורה');
reset();
let threw = false;
try { sandbox.flagsSet_('somethingElse', true); } catch (e) { threw = /לא מוכר/.test(e.message); }
ok('מפתח לא מוכר נדחה', threw);
ok('ולא נכתב כלום', store === null, JSON.stringify(store));
threw = false;
try { sandbox.flagsSet_('gardenplanfromfirestore', true); } catch (e) { threw = true; }
ok('⚠️ גם הבדל רישיות נדחה', threw);

section('4. המטפל');
reset();
const realAuth = sandbox.authorize_;
sandbox.authorize_ = () => ({ ok: false, error: 'אין הרשאה' });
let g = sandbox.handleFlagSet_({ key: 'servicesFromFirestore', value: 'true' });
ok('🔴 ללא הרשאה נדחה', g.ok === false && g.error === 'אין הרשאה');
ok('🔴 ולא נכתב כלום', store === null);
sandbox.authorize_ = () => ({ ok: true, perm: { isSuper: true } });
g = sandbox.handleFlagSet_({ key: 'servicesFromFirestore', value: 'true' });
ok('עם הרשאה נכתב', g.ok === true && g.flags.servicesFromFirestore === true, JSON.stringify(g));
g = sandbox.handleFlagSet_({ key: 'servicesFromFirestore', value: 'yes' });
ok('⚠️ ערך שאינו true/false נדחה', g.ok === false && /true או false/.test(g.error), JSON.stringify(g));
g = sandbox.handleFlagSet_({ key: 'servicesFromFirestore', value: 'FALSE' });
ok('רישיות בערך כן מתקבלת', g.ok === true && g.flags.servicesFromFirestore === false, JSON.stringify(g));
g = sandbox.handleFlagSet_({ key: 'nope', value: 'true' });
ok('מפתח לא מוכר מוחזר כשגיאה ולא כקריסה', g.ok === false && /לא מוכר/.test(g.error), JSON.stringify(g));
reset(); sandbox.authorize_ = () => ({ ok: true, perm: { isSuper: true } });
failOn = 'set';
g = sandbox.handleFlagSet_({ key: 'servicesFromFirestore', value: 'true' });
ok('כישלון כתיבה נתפס', g.ok === false && /503/.test(g.error), JSON.stringify(g));
reset(); sandbox.authorize_ = () => ({ ok: true, perm: { isSuper: true } });
store = { servicesFromFirestore: true, gardenPlanFromFirestore: false };
g = sandbox.handleFlagsGet_({});
ok('flagsGet מחזירה מצב ורשימה', g.ok === true && g.keys.length === 3 && g.flags.servicesFromFirestore === true,
   JSON.stringify(g));
sandbox.authorize_ = realAuth;

/* ---------------- צד הלקוח ---------------- */
section('5. הגשר — קריאת הדגלים');
ok('state.flags מתחיל null', /flags: null/.test(FB));
ok('loadFlags קיימת', /function loadFlags\(done\)/.test(FB));
ok('🔑 נקראת בתוך ensureDb, לפני settleDb',
   /loadFlags\(function \(\) \{ settleDb\(null\); \}\);/.test(FB));
/* 🔴 בלי זה מתג כיבוי לא היה תופס את הקריאה הראשונה של כל טעינת עמוד —
   ובדיוק היא זו שמגיעה למשתמש. */
ok('⚠️ ולא אחרי שהקריאה הראשונה כבר יצאה',
   FB.indexOf('loadFlags(function () { settleDb(null); });') < FB.indexOf('function readCollection'));
ok('🔴 כישלון קריאה אינו מפיל את ensureDb',
   /\["catch"\]\(function \(e\) \{[\s\S]{0,140}clearTimeout\(t\); finish\(\);/.test(FB));
ok('⚠️ ויש שעון עצר שלא תולה את הטעינה', /setTimeout\(finish, 4000\)/.test(FB));
ok('flag ו-flags מיוצאות', /flag:\s+flag,/.test(FB) && /flags:\s+function/.test(FB));

section('6. הגשר — פונקציית flag');
const sb = { window: {}, document: { createElement: () => ({}), head: { appendChild() {} } },
             console: { log() {} }, setTimeout, clearTimeout, Date, JSON, Object, String, Error };
sb.window = sb;
vm.createContext(sb); vm.runInContext(FB, sb);
const fb = sb.CBA.fb;
ok('בלי דגלים — ברירת המחדל true', fb.flag('x', true) === true);
ok('בלי דגלים — ברירת המחדל false', fb.flag('x', false) === false);
ok('⚠️ flags() מחזירה null כשלא נקרא', fb.flags() === null);

section('7. הלקוח — המתג נבדק במקום הנכון');
ok('fsFirstRead בודקת את הדגל החי', /CBA\.fb\.flag\(key \+ "FromFirestore", enabled\)/.test(DS));
ok('🔑 אחרי authReady',
   DS.indexOf('CBA.fb.authReady(function (user)') < DS.indexOf('CBA.fb.flag(key + "FromFirestore"'));
/* 🔴🔴 **הבאג שנתפס חי ב-15.9:** `authReady` אינו מחכה לטעינת
   הדגלים, ולכן קריאה שיצאה בדקות הראשונות קיבלה את ברירת
   המחדל שבקוד במקום את הדגל — כלומר **מתג הכיבוי לא עבד**.
   הבדיקה הזאת מצמידה את התיקון: הדגל נבדק **בתוך** ensureDb. */
ok('🔴🔴 והדגל נבדק רק אחרי ensureDb (שם הדגלים נקראים)',
   DS.indexOf('CBA.fb.ensureDb(function (dbErr)') !== -1 &&
   DS.indexOf('CBA.fb.ensureDb(function (dbErr)') < DS.indexOf('CBA.fb.flag(key + "FromFirestore"'));
ok('🔴 וכשל ב-ensureDb הוא נפילה לאחור', /viaSheets\("db:"/.test(DS));
ok('⚠️ ולפני הקריאה לנתונים',
   DS.indexOf('CBA.fb.flag(key + "FromFirestore"') < DS.indexOf('load(function (err, result)'));
ok('הסיבה נרשמת כ-flag-off', /viaSheets\("flag-off"\)/.test(DS));
/* 🔴 ברירת מחדל false חייבת לקצר עוד לפני טעינת ה-SDK — אחרת תחום כבוי
   עדיין היה גובה 550KB מכל משתמש. */
ok('🔴 ברירת מחדל false מקצרת לפני ה-SDK',
   DS.indexOf('if (!enabled || !CBA.fb') < DS.indexOf('CBA.fb.authReady(function (user)'));
ok('שני התחומים שומרים ברירת מחדל בקוד',
   /GARDEN_PLAN_FROM_FIRESTORE = true/.test(DS) && /SERVICES_FROM_FIRESTORE = true/.test(DS));
ok('⚠️ ושמות המפתחות מתלכדים עם FLAG_KEYS',
   sandbox.FLAG_KEYS.indexOf('gardenPlan' + 'FromFirestore') !== -1 &&
   sandbox.FLAG_KEYS.indexOf('services' + 'FromFirestore') !== -1);

section('8. כללי האבטחה');
ok('appConfig נפתח לקריאה', /match \/appConfig\/\{doc\} \{[\s\S]{0,120}allow read: if isMember\(\);/.test(RULES));
ok('🔴 כתיבה אסורה', /match \/appConfig\/\{doc\} \{[\s\S]{0,160}allow write: if false;/.test(RULES));
/* מי שיכול לערוך את המסמך הזה יכול לכבות מסלולים לכל השיכון, או להדליק
   תחום שעדיין לא נבדק. */
ok('⚠️ ברירת המחדל עדיין אחרונה',
   RULES.lastIndexOf('match /{document=**}') > RULES.lastIndexOf('match /appConfig'));

console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
