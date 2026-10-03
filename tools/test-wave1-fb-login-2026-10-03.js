/* ============================================================================
   test-wave1-fb-login-2026-10-03.js — גל 1: כניסה בלי Apps Script (3.10.2026)
   מה יכול להישבר בשקט:
     שרת
     1. אחד מארבעת כותבי members/{uid} עדיין כותב schema 1 / שדות אחרים
        ⇒ הלקוח לא נכנס מהמסמך (נופל תמיד לדרך הישנה — "עובד", אבל איטי).
     2. 🔴 loginFb נותן מושב לטוקן Firebase שהמייל בו לא מאומת / לא מגוגל
        ⇒ השתלטות על חשבון של תושב אחר.
     3. loginFb נותן מושב למי שלא ברשימה / עזב.
     4. הסנכרון השעתי כותב את כל ה-~150 מסמכים בכל ריצה, או לא כותב שינוי,
        או משאיר את זיכרון הטאב דולק אחרי הריצה (נתונים ישנים לבקשה הבאה).
     לקוח
     5. מסמך ישן/לא פעיל/בלי מייל ⇒ נכנסים בכל זאת.
     6. שחזור אחרי רענון עובד גם אחרי 30 יום / מאריך את עצמו / ל-uid אחר.
     7. המושב ברקע: שתי קריאות במקביל ⇒ שתי בקשות loginFb; תשובה למשתמש
        אחר מתקבלת; "עזב" לא מוציא מהאפליקציה.
     8. withSession: לולאה אינסופית כשאין מושב; קריאה עם מושב נדחית.
     9. Firebase איטי ⇒ גם הדרך הרגילה וגם Firebase נכנסים (כניסה כפולה).
   הרצה: node tools/test-wave1-fb-login-2026-10-03.js
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FSGS = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const SHEETS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'sheets.js'), 'utf8');
const DOOR = fs.readFileSync(path.join(ROOT, 'js', 'data', 'door.js'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); } }
function section(t) { console.log('\n' + t); }
const tick = () => new Promise(r => setTimeout(r, 0));
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ======================================================================
   חלק א' — שרת
   ====================================================================== */
const HEAD = ['מזהה קבוע', 'שם משפחה', 'מספר בית', 'שם פרטי 1', 'אימייל 1', 'הרשאות 1', 'מזהה Firebase 1',
              'שם פרטי 2', 'אימייל 2', 'הרשאות 2', 'מזהה Firebase 2', 'סטטוס'];
let ROWS;
function resetRows() {
  ROWS = [
    HEAD,
    ['401', 'גולן', '7', 'יועד', 'yoad@x.c', 'על', 'UID-Y', 'דר', 'dar@x.c', 'תקציב', 'UID-D', 'פעיל'],
    ['402', 'לוי', '9', 'דנה', 'dana@x.c', '', 'UID-N', '', '', '', '', 'פעיל'],
    ['403', 'כהן', '11', 'רון', 'ron@x.c', '', 'UID-R', '', '', '', '', 'עזב'],
  ];
}
resetRows();
const counters = { sheetReads: 0 };
const writes = [];
let failWriteFor = null;
const propStore = { CBA_SESSION_SECRET: 's1', CBA_SESSION_EPOCH: '1' };
let lookupResp = null;   // תשובת accounts:lookup
const residentsSheet = {
  getDataRange: () => { counters.sheetReads++; return { getValues: () => ROWS.map(r => r.slice()) }; },
  getRange: (r, c, n, m) => ({
    getValues: () => (r === 1 ? [HEAD.slice()] : ROWS.slice(r - 1, r - 1 + (n || 1)).map(x => x.slice())),
    setValue: v => { ROWS[r - 1][c - 1] = v; return { setFontWeight() {} }; }
  }),
  getLastColumn: () => HEAD.length, getLastRow: () => ROWS.length,
};
const FAKE_SS = { getSheetByName: n => n === 'תושבים' ? residentsSheet : null, getSheets: () => [] };
const sb = {
  console, JSON, Date, Math, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, RegExp, Error, Buffer,
  Utilities: {
    base64EncodeWebSafe: s => (typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.from(s)).toString('base64url'),
    base64DecodeWebSafe: s => Array.from(Buffer.from(s, 'base64url')),
    computeHmacSha256Signature: (p, k) => Array.from(Buffer.from('sig:' + p + ':' + k)),
    computeDigest: (alg, s) => Array.from(require('crypto').createHash('md5').update(String(s)).digest()),
    DigestAlgorithm: { MD5: 'MD5' },
    newBlob: b => ({ getDataAsString: () => Buffer.from(b).toString('utf8') }),
    sleep() {}, getUuid: () => 'u', formatDate: d => String(d),
  },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'yoad@x.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {}, removeAll() {} }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => Object.prototype.hasOwnProperty.call(propStore, k) ? propStore[k] : null,
    setProperty: (k, v) => { propStore[k] = String(v); }, deleteProperty: k => { delete propStore[k]; }, getProperties: () => Object.assign({}, propStore), getKeys: () => Object.keys(propStore),
  }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => FAKE_SS, flush() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  MailApp: { getRemainingDailyQuota: () => 100 }, ScriptApp: {}, CalendarApp: {}, DriveApp: {},
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify(lookupResp) }) },
};
vm.createContext(sb);
vm.runInContext(CODE, sb);
vm.runInContext(FSGS, sb);
sb.fsSet_ = (p, o) => { if (failWriteFor && p === 'members/' + failWriteFor) throw new Error('fs down'); writes.push({ p, o }); };
sb.fbRememberUid_ = () => true;
const J = t => JSON.parse(t);
function googleUser(over) {
  return { users: [Object.assign({ localId: 'UID-D', email: 'dar@x.c', emailVerified: true, displayName: 'דר', photoUrl: 'p',
                                   lastLoginAt: String(Date.now() - 3600000),
                                   providerUserInfo: [{ providerId: 'google.com' }] }, over || {})] };
}
/* טוקן Firebase מזויף — רק החלק האמצעי (הטענות) נקרא בשרת; החתימה מאומתת ע"י גוגל. */
function fbJwt(over) {
  const c = Object.assign({ user_id: 'UID-D', email: 'dar@x.c', email_verified: true, firebase: { sign_in_provider: 'google.com' } }, over || {});
  return 'h.' + Buffer.from(JSON.stringify(c)).toString('base64url') + '.sig';
}
let TOK = fbJwt();

section('1. memberDocFor_ — מקור אחד לתוכן המסמך');
{
  const d = sb.memberDocFor_({ found: true, active: true, perms: ['תקציב'], isSuper: false, isExternal: false,
                               familyId: '401', firstName: 'דר', family: 'גולן', house: 7, email: ' Dar@X.c ' });
  ok('🔴 email של הבעלים, מנורמל (צוות אדום H1)', d.email === 'dar@x.c');
  const keys = Object.keys(d).sort().join(',');
  ok('אחד-עשר שדות בדיוק', keys === 'active,email,family,familyId,firstName,house,isExternal,perms,profileGaps,schema,updatedAt', keys);
  ok('schema 2, house כמחרוזת', d.schema === 2 && d.house === '7' && d.active === true);
  const r = sb.memberDocFor_(null, { revoke: true });
  ok('🔴 שלילה: הכול ריק ו-active:false', r.active === false && r.perms.length === 0 && r.familyId === '' && r.firstName === '' && r.schema === 2);
  ok('לא ברשימה (null) = שלילה', sb.memberDocFor_(null).active === false);
  const sup = sb.memberDocFor_({ found: true, active: true, perms: [], isSuper: true });
  ok('isSuper בלי "על" ברשימה ⇒ "על" נוסף', sup.perms.indexOf('על') !== -1);
  const ov = sb.memberDocFor_({ found: true, active: true, perms: ['תקציב'], isSuper: false }, { perms: [] });
  ok('🔴 opt.perms דורס (savePermissions — ההרשאה שזה עתה הוסרה לא חוזרת)', ov.perms.length === 0);
  ok('לא פעיל ⇒ active:false', sb.memberDocFor_({ found: true, active: false, perms: [] }).active === false);
}

section('2. 🔴 כל ארבעת הכותבים עוברים דרך memberDocFor_ (אין fsSet_ ידני ל-members)');
{
  const direct = CODE.match(/fsSet_\('members\/' \+ [a-zA-Z.]+, \{/g) || [];
  ok('אפס כתיבות ידניות של אובייקט ל-members/', direct.length === 0, direct.join(' | '));
  const viaHelper = (CODE.match(/fsSet_\('members\/' \+ [a-zA-Z.]+, memberDocFor_\(/g) || []).length;
  ok('לפחות 5 כתיבות דרך העזר (4 כותבים + loginFb + סנכרון)', viaHelper >= 5, String(viaHelper));
  ok('כללי Firestore: members — קריאה לבעלים בלבד, כתיבה אסורה (ללא שינוי)',
     /match \/members\/\{uid\} \{[\s\S]{0,400}allow read: if signedIn\(\) && request\.auth\.uid == uid;[\s\S]{0,700}allow write: if false;/.test(RULES));
}

section('3. 🔴 loginFb — מושב רק לזהות Google מאומתת שברשימה');
{
  const call = () => J(sb.handleLoginFb_({ idToken: TOK }));
  writes.length = 0; sb.PERMS_MEMO_ = {};
  lookupResp = googleUser();
  let r = call();
  ok('תקין: מורשה + מושב + uid', r.ok && r.authorized === true && !!r.session && r.uid === 'UID-D', JSON.stringify(r).slice(0, 200));
  ok('אותם שדות כמו login (perms/isSuper/familyId/firstName/family/house)',
     JSON.stringify(r.perms) === '["תקציב"]' && r.isSuper === false && r.familyId === '401' && r.firstName === 'דר' && r.family === 'גולן' && r.house === '7');
  ok('המושב תקף ושייך למייל הזה', sb.verifySession_(r.session) && sb.verifySession_(r.session).email === 'dar@x.c');
  ok('רשומת החבר רועננה (schema 2) ל-uid שגוגל אימתה', writes.length === 1 && writes[0].p === 'members/UID-D' && writes[0].o.schema === 2 && writes[0].o.firstName === 'דר');

  writes.length = 0; lookupResp = googleUser({ emailVerified: false });
  r = call();
  ok('🔴 מייל לא מאומת ⇒ אין מושב', r.ok === false && !r.session, JSON.stringify(r));
  lookupResp = googleUser({ providerUserInfo: [{ providerId: 'password' }] });
  r = call();
  ok('🔴 ספק אחר (סיסמה) ⇒ אין מושב', r.ok === false && !r.session, JSON.stringify(r));
  lookupResp = googleUser({ providerUserInfo: undefined });
  r = call();
  ok('🔴 בלי רשימת ספקים ⇒ אין מושב', r.ok === false && !r.session);
  lookupResp = googleUser({ disabled: true });
  r = call();
  ok('משתמש חסום ב-Firebase ⇒ אין מושב', r.ok === false && !r.session);
  lookupResp = { users: [] };
  r = call();
  ok('טוקן לא מזוהה ⇒ אין מושב', r.ok === false && !r.session);
  r = J(sb.handleLoginFb_({}));
  ok('בלי טוקן ⇒ אין מושב', r.ok === false && !r.session);
  ok('ואף כתיבה ל-members בכל הדחיות', writes.length === 0, String(writes.length));
  /* M5 — כניסה שנייה כשהמסמך כבר מעודכן (טביעה זהה) ⇒ בלי כתיבה */
  sb.membersFpWrite_({ 'UID-D': sb.memberFp_(sb.memberDocFor_(sb.permissionsFor_('dar@x.c'), { active: true })) });
  lookupResp = googleUser(); TOK = fbJwt();
  writes.length = 0; let remembered = 0; sb.fbRememberUid_ = () => { remembered++; return true; };
  r = call();
  ok('⚡ M5: מסמך מעודכן ⇒ מושב בלי כתיבה ובלי קריאת הגיליון ל-uid', r.authorized && writes.length === 0 && remembered === 0, 'writes=' + writes.length + ' rem=' + remembered);
  sb.fbRememberUid_ = () => true;
  Object.keys(propStore).filter(k => k.indexOf('cba_members_fp') === 0).forEach(k => delete propStore[k]);

  lookupResp = googleUser({ email: 'stranger@x.c', localId: 'UID-S' }); TOK = fbJwt({ email: 'stranger@x.c', user_id: 'UID-S' });
  r = call();
  ok('לא ברשימה ⇒ authorized:false, בלי מושב', r.ok && r.authorized === false && r.reason === 'not_listed' && !r.session);
  ok('🔴 ומסמך ה-uid הזה נשלל (uid ישן שקיבל נתונים של אחר — H1)', writes.length === 1 && writes[0].p === 'members/UID-S' && writes[0].o.active === false);
  writes.length = 0;
  lookupResp = googleUser({ email: 'ron@x.c', localId: 'UID-R' }); TOK = fbJwt({ email: 'ron@x.c', user_id: 'UID-R' });
  r = call();
  ok('🔴 עזב ⇒ authorized:false reason=inactive, בלי מושב, המסמך נשלל', r.ok && r.authorized === false && r.reason === 'inactive' && !r.session && writes.length === 1 && writes[0].o.active === false);
  writes.length = 0; TOK = fbJwt();

  lookupResp = googleUser();
  TOK = fbJwt({ firebase: { sign_in_provider: 'password' } }); r = call();
  ok('🔴 M2: הכניסה הזו לא מגוגל (גם אם החשבון מקושר לגוגל) ⇒ אין מושב', r.ok === false && !r.session, JSON.stringify(r));
  TOK = fbJwt({ email_verified: false }); r = call();
  ok('🔴 M2: הטוקן אומר מייל לא מאומת ⇒ אין מושב', r.ok === false && !r.session);
  TOK = fbJwt({ email: 'other@x.c' }); r = call();
  ok('🔴 M2: מייל בטוקן ≠ מייל בחשבון ⇒ אין מושב', r.ok === false && !r.session);
  TOK = fbJwt({ user_id: 'UID-X' }); r = call();
  ok('🔴 M2: uid בטוקן ≠ uid שגוגל החזירה ⇒ אין מושב', r.ok === false && !r.session);
  TOK = 'garbage'; r = call();
  ok('טוקן שלא ניתן לפענח ⇒ אין מושב', r.ok === false && !r.session);
  TOK = fbJwt();
  lookupResp = googleUser({ lastLoginAt: String(Date.now() - 31 * 86400000) }); r = call();
  ok('🔴 M3: כניסת Google אחרונה לפני 31 יום ⇒ relogin, בלי מושב', r.ok && r.authorized === false && r.reason === 'relogin' && !r.session);
  lookupResp = googleUser({ lastLoginAt: undefined }); r = call();
  ok('בלי lastLoginAt ⇒ relogin', r.reason === 'relogin' && !r.session);
  propStore.CBA_FB_REVOKE_AT = String(Date.now() - 60000);
  lookupResp = googleUser({ lastLoginAt: String(Date.now() - 3600000) }); r = call();
  ok('🔴 M3: "נתק את כולם" אחרי הכניסה האחרונה ⇒ relogin', r.reason === 'relogin' && !r.session);
  lookupResp = googleUser({ lastLoginAt: String(Date.now() - 1000) }); r = call();
  ok('ומי שהתחבר עם Google אחרי הניתוק — מקבל מושב', r.authorized === true && !!r.session);
  delete propStore.CBA_FB_REVOKE_AT;
  ok('revokeAllSessions רושם את רגע הניתוק', /props\.setProperty\('CBA_FB_REVOKE_AT', String\(Date\.now\(\)\)\);/.test(CODE));
  writes.length = 0;

  ok('fsVerifyIdToken_ מחזיר emailVerified + providers (הקוראים הישנים לא נפגעו)',
     /emailVerified: u\.emailVerified === true, providers: providers/.test(FSGS));
  const iRoute = CODE.indexOf("if (body && body.action === 'loginFb') return handleLoginFb_(body);");
  const iGate = CODE.indexOf("if (body && body.action === 'submitSignup')");
  ok('ניתוב: loginFb ב-doPost, ליד login (לפני שער המושב)', iRoute > -1 && iRoute < iGate);
  ok('loginFb אינו ב-GET (הטוקן לא בכתובת)', CODE.indexOf("e.parameter.action === 'loginFb'") === -1);
}

section('4. membersSyncAll_ — כותב רק מה שהשתנה, זיכרון הטאב נסגר');
{
  resetRows(); writes.length = 0; Object.keys(propStore).filter(k => k.indexOf('cba_members_fp') === 0).forEach(k => delete propStore[k]); counters.sheetReads = 0; sb.PERMS_MEMO_ = {};
  let r = sb.membersSyncAll_(FAKE_SS);
  ok('ריצה ראשונה: 4 uid נראו, 4 נכתבו', r.seen === 4 && r.written === 4, JSON.stringify(r));
  ok('⚡ קריאת טאב אחת בלבד (לא אחת לכל תושב)', counters.sheetReads === 1, String(counters.sheetReads));
  const byUid = {}; writes.forEach(w => { byUid[w.p] = w.o; });
  ok('עזב ⇒ active:false', byUid['members/UID-R'].active === false);
  ok('דר: תקציב, שם, בית', byUid['members/UID-D'].perms.join() === 'תקציב' && byUid['members/UID-D'].firstName === 'דר' && byUid['members/UID-D'].house === '7');
  ok('🔴 זיכרון הטאב נסגר אחרי הריצה', sb.RES_VALUES_MEMO_ === null);

  writes.length = 0; sb.PERMS_MEMO_ = {};
  r = sb.membersSyncAll_(FAKE_SS);
  ok('ריצה שנייה בלי שינוי: אפס כתיבות', r.written === 0 && writes.length === 0, JSON.stringify(r));

  ROWS[2][11] = 'עזב';   // דנה סומנה "עזב" ישירות בתא
  writes.length = 0; sb.PERMS_MEMO_ = {};
  r = sb.membersSyncAll_(FAKE_SS);
  ok('🔴 עריכה ישירה בגיליון ("עזב") ⇒ רק המסמך שלה נכתב, active:false', r.written === 1 && writes[0].p === 'members/UID-N' && writes[0].o.active === false, JSON.stringify(writes.map(w => w.p)));

  ROWS[2][11] = 'פעיל'; failWriteFor = 'UID-N';
  writes.length = 0; sb.PERMS_MEMO_ = {};
  r = sb.membersSyncAll_(FAKE_SS);
  ok('כתיבה שנכשלה מדווחת', r.errors.length === 1 && r.written === 0);
  failWriteFor = null; writes.length = 0; sb.PERMS_MEMO_ = {};
  r = sb.membersSyncAll_(FAKE_SS);
  ok('⚠️ ובריצה הבאה היא מנוסה שוב (לא נרשמה כ"מעודכנת")', r.written === 1 && writes[0].p === 'members/UID-N' && writes[0].o.active === true);

  writes.length = 0;
  r = sb.membersSyncAll_(FAKE_SS, true);
  ok('force (membersSyncNow מהעורך) כותב הכול', r.written === 4);
  propStore.cba_members_fp_forceAt = String(Date.now() - 25 * 3600000);
  writes.length = 0; sb.PERMS_MEMO_ = {};
  r = sb.membersSyncAll_(FAKE_SS);
  ok('פעם ביום — כתיבה מלאה גם בלי שינוי (מתקן כתיבה ישנה של כותב אחר, M1)', r.written === 4);
  const big = {}; for (let i = 0; i < 600; i++) big['uid' + String(i).padStart(25, '0')] = 'abcdefgh';
  sb.membersFpWrite_(big);
  const shards = Object.keys(propStore).filter(k => /^cba_members_fp_\d+$/.test(k));
  ok('M4: 600 משתמשים ⇒ מפוצל לכמה מאפיינים, כל אחד ≤ 9KB', shards.length > 2 && shards.every(k => propStore[k].length <= 9000), shards.length + '');
  ok('ונקרא בחזרה במלואו', Object.keys(sb.membersFpRead_()).length === 600);
  sb.membersFpWrite_({ a: '1' });
  ok('כשהרשימה מתכווצת — רסיסים עודפים נמחקים', Object.keys(propStore).filter(k => /^cba_members_fp_\d+$/.test(k)).length === 1 && sb.membersFpRead_().a === '1');

  const orig = residentsSheet.getDataRange;
  sb.lookupResident_ = (function (real) { return function () { throw new Error('boom'); }; })(sb.lookupResident_);
  let threw = false;
  try { sb.membersSyncAll_(FAKE_SS); } catch (e) { threw = true; }
  ok('🔴 גם כשמשהו זורק באמצע — זיכרון הטאב נסגר (finally)', threw && sb.RES_VALUES_MEMO_ === null);
  residentsSheet.getDataRange = orig;
  vm.runInContext(CODE.slice(CODE.indexOf('var RES_VALUES_MEMO_ = null;'), CODE.indexOf('/** מנרמל אימייל')), sb);   // מחזיר את lookupResident_ האמיתית
  const H = CODE.slice(CODE.indexOf('function hourlyJobsRun_()'));
  ok('בעבודה השעתית, מאחורי אותו שער', /if \(hjSync\.due\) \{\s*hjM\('membersSyncAll_'\);/.test(H) && H.indexOf("} else hjSkip('membersSyncAll_');") !== -1);
}

/* ======================================================================
   חלק ב' — לקוח (קטע גל 1 מתוך app.js, מורץ בעולם מזויף)
   ====================================================================== */
const SEC = APP.slice(APP.indexOf('  var IDENT_KEY = "cba_ident_v1";'), APP.indexOf('\n  function onGoogleLogin(resp) {'));
function client(opts) {
  opts = opts || {};
  const store = Object.assign({}, opts.store || {});
  const log = [];
  const fetches = [];
  const fbState = { user: opts.fbUser === undefined ? { uid: 'UID-D', email: 'dar@x.c' } : opts.fbUser };
  const box = {
    console, JSON, Date, Math, Object, Array, String, Number, setTimeout, clearTimeout, Promise,
    PERM: { SUPER: 'על' },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    currentUser: null, inited: false, main: {}, firebaseSignInDone: false, loginError: null,
    applyUser() { log.push('applyUser'); }, saveSession(u) { log.push('saveSession:' + (u.session || '-')); },
    hideLoginGate() { log.push('hideGate'); }, renderControls() { log.push('render'); }, skeletonScreen: () => '',
    firebaseSignInNow(c) { log.push('fbSignInNow'); }, afterFirebaseSignIn(o) { log.push('after:' + JSON.stringify(o)); },
    sheetsLoadHandler() {}, routeByRole() {}, bootDismiss() { log.push('bootDismiss'); }, showLoginGate() { log.push('gate'); },
    blockGisAuto() { log.push('blockGis'); }, logout() { log.push('logout'); box.currentUser = null; box.window.CBA.authSession = ''; },
    fetch(url, init) {
      fetches.push(init && init.body ? JSON.parse(init.body) : url);
      const resp = typeof opts.server === 'function' ? opts.server() : opts.server;
      if (resp === 'never') return new Promise(() => {});
      if (resp === 'neterr') return Promise.reject(new Error('net'));
      return Promise.resolve({ json: () => Promise.resolve(resp) });
    },
  };
  box.window = { CBA: { authSession: '', sheets: { url: 'https://x/exec', load(cb) { log.push('load'); } } } };
  box.CBA = box.window.CBA;
  box.CBA.diag = { mark: t => log.push('mark:' + t) };
  box.CBA.fb = {
    authReady: (cb, ms) => setTimeout(() => cb(fbState.user), opts.authDelay || 0),
    signIn: (cred, cb) => setTimeout(() => (opts.signInErr ? cb(new Error('x')) : cb(null, fbState.user)), opts.signInDelay || 0),
    readDoc: (c, id, cb) => setTimeout(() => cb(opts.readErr || null, opts.doc === undefined ? memberDoc() : opts.doc), opts.readDelay || 0),
    profile: () => fbState.user ? { uid: fbState.user.uid, email: fbState.user.email, name: 'דר', picture: 'p', emailVerified: true } : null,
    idToken: cb => cb(null, 'FBTOKEN'), expectUser() {},
  };
  vm.createContext(box);
  vm.runInContext(SEC + '\nthis.__t = { userFromMember, identRead, identRemember, identForget, sessionReady, fbRestoreStart, fbFirstLogin, enterApp, IDENT_KEY };', box);
  return { box, store, log, fetches, t: box.__t, fbState };
}
function memberDoc(over) {
  return Object.assign({ familyId: '401', perms: ['תקציב'], isExternal: false, active: true, email: 'dar@x.c', firstName: 'דר', family: 'גולן', house: '7', schema: 2 }, over || {});
}

(async () => {
  section('5. userFromMember — מתי מותר להיכנס מהמסמך');
  {
    const { t } = client();
    const prof = { uid: 'U', email: 'Dar@x.c', name: 'דר', picture: 'p', emailVerified: true };
    const u = t.userFromMember(prof, memberDoc());
    ok('מסמך תקין ⇒ משתמש מלא, via=fb, בלי מושב', u && u.via === 'fb' && u.uid === 'U' && u.session === '' && u.familyId === '401' && u.firstName === 'דר' && u.house === '7');
    ok('isSuper נגזר מ-"על" בהרשאות', t.userFromMember(prof, memberDoc({ perms: ['על'] })).isSuper === true && u.isSuper === false);
    ok('🔴 schema 1 ⇒ לא נכנסים (הדרך הרגילה)', t.userFromMember(prof, memberDoc({ schema: 1 })) === null);
    ok('🔴 active:false ⇒ לא נכנסים', t.userFromMember(prof, memberDoc({ active: false })) === null);
    ok('active חסר ⇒ לא נכנסים', t.userFromMember(prof, memberDoc({ active: undefined })) === null);
    ok('אין מסמך ⇒ null', t.userFromMember(prof, null) === null);
    ok('אין מייל בפרופיל ⇒ null', t.userFromMember({ uid: 'U', email: '', emailVerified: true }, memberDoc()) === null);
    ok('🔴 H1: המסמך של מייל אחר (uid ישן) ⇒ null', t.userFromMember(prof, memberDoc({ email: 'other@x.c' })) === null);
    ok('🔴 H1: מסמך בלי email ⇒ null (הדרך הרגילה עד הסנכרון)', t.userFromMember(prof, memberDoc({ email: undefined })) === null);
    ok('L5: מייל לא מאומת בפרופיל ⇒ null', t.userFromMember(Object.assign({}, prof, { emailVerified: false }), memberDoc()) === null);
    ok('הרשאות לא-מחרוזת מסוננות', t.userFromMember(prof, memberDoc({ perms: ['תקציב', 5, { x: 1 }] })).perms.join() === 'תקציב');
    ok('isExternal רק כש-true מפורש', t.userFromMember(prof, memberDoc({ isExternal: 'yes' })).isExternal === false);
  }

  section('6. זיכרון "כניסת Google אחרונה" — 30 יום, לא מתארך בשחזור');
  {
    const day = 86400000;
    let c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at: Date.now() - 29 * day }) } });
    ok('29 יום ⇒ תקף', !!c.t.identRead());
    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at: Date.now() - 31 * day }) } });
    ok('🔴 31 יום ⇒ פג', c.t.identRead() === null);
    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at: Date.now() + 3 * day }) } });
    ok('תאריך עתידי (שעון מזויף) ⇒ פג', c.t.identRead() === null);
    c = client({ store: { cba_ident_v1: '{bad' } });
    ok('רשומה פגומה ⇒ null בלי לזרוק', c.t.identRead() === null);
    ok('logout מוחק את הזיכרון', /clearSession\(\);\s*\n\s*identForget\(\);/.test(APP));
  }

  section('7. שחזור אחרי רענון (fbRestoreStart)');
  {
    let c = client();
    ok('אין זיכרון ⇒ לא מנסים (מסך כניסה מיד)', c.t.fbRestoreStart() === false && c.log.indexOf('gate') === -1);

    const at = Date.now() - 86400000;
    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at }) } });
    let entered = null; c.box.enterApp = (u, o) => { entered = { u, o }; };
    ok('יש זיכרון ⇒ ניסיון יצא', c.t.fbRestoreStart() === true);
    await wait(5);
    ok('נכנס עם המשתמש מהמסמך', entered && entered.u.uid === 'UID-D' && entered.u.familyId === '401');
    ok('🔴 remember:false — שחזור אינו מאריך את 30 הימים', entered && entered.o.remember === false && JSON.parse(c.store.cba_ident_v1).at === at);
    ok('בלי מסך כניסה', c.log.indexOf('gate') === -1);

    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-OTHER', at }) } });
    entered = null; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbRestoreStart(); await wait(5);
    ok('🔴 Firebase זוכר משתמש אחר ⇒ מסך כניסה, לא נכנסים', !entered && c.log.indexOf('gate') !== -1 && c.log.indexOf('bootDismiss') !== -1);

    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at }) }, fbUser: null });
    entered = null; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbRestoreStart(); await wait(5);
    ok('Firebase לא זוכר אף אחד ⇒ מסך כניסה', !entered && c.log.indexOf('gate') !== -1);

    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at }) }, doc: memberDoc({ schema: 1 }) });
    entered = null; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbRestoreStart(); await wait(5);
    ok('מסמך ישן ⇒ מסך כניסה (משם — הדרך הרגילה)', !entered && c.log.indexOf('gate') !== -1);

    c = client({ store: { cba_ident_v1: JSON.stringify({ uid: 'UID-D', at }) }, readErr: new Error('rules') });
    entered = null; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbRestoreStart(); await wait(5);
    ok('קריאה נכשלה ⇒ מסך כניסה', !entered && c.log.indexOf('gate') !== -1);

    ok('תקרת זמן: FB_RESTORE_MS = 8 שניות, ואחריה מסך כניסה אחד בלבד',
       /var FB_RESTORE_MS = 8000;/.test(SEC) && /if \(settled\) return; settled = true; bootMark\("שחזור לא הספיק — מסך כניסה"\); toGate\(\);/.test(SEC));
    ok('בעליית העמוד: רק כשאין מושב שמור', /if \(!currentUser && !fbRestoreStart\(\)\) \{ bootDismiss\(\); showLoginGate\(\); \}/.test(APP));
  }

  section('8. לחיצה על Google (fbFirstLogin)');
  {
    let c = client();
    let entered = null, classic = 0; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbFirstLogin({ credential: 'G' }, h => { if (!h) classic++; });
    await wait(5);
    ok('מסמך תקין ⇒ נכנס מ-Firebase, בלי הדרך הרגילה', entered && classic === 0 && entered.o.fbReady === true && entered.o.remember === true);
    ok('ואין קריאה ל-Apps Script בכניסה', c.fetches.length === 0);

    c = client({ doc: null });
    entered = null; classic = 0; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbFirstLogin({ credential: 'G' }, h => { if (!h) classic++; });
    await wait(5);
    ok('אין מסמך (כניסה ראשונה) ⇒ הדרך הרגילה', !entered && classic === 1);

    c = client({ signInErr: true });
    entered = null; classic = 0; c.box.enterApp = (u, o) => { entered = { u, o }; };
    c.t.fbFirstLogin({ credential: 'G' }, h => { if (!h) classic++; });
    await wait(5);
    ok('Firebase נכשל ⇒ הדרך הרגילה', !entered && classic === 1);

    /* Firebase איטי: התקרה (5ש') נגמרת לפני — הדרך הרגילה; התשובה המאוחרת לא נכנסת שוב */
    const src = SEC.replace('var FB_ENTRY_RACE_MS = 5000;', 'var FB_ENTRY_RACE_MS = 20;');
    const c2 = client({ readDelay: 60 });
    vm.runInContext(src + '\nthis.__t2 = { fbFirstLogin };', c2.box);
    entered = null; classic = 0; c2.box.enterApp = (u, o) => { entered = { u, o }; };
    c2.box.__t2.fbFirstLogin({ credential: 'G' }, h => { if (!h) classic++; });
    await wait(120);
    ok('🔴 Firebase איטי ⇒ הדרך הרגילה פעם אחת, ו-Firebase המאוחר לא נכנס שוב', classic === 1 && !entered, 'classic=' + classic + ' entered=' + !!entered);
    ok('בלי credential ⇒ הדרך הרגילה', (function () { let n = 0; client().t.fbFirstLogin({}, h => { if (!h) n++; }); return n === 1; })());
  }

  section('9. המושב ברקע (sessionReady)');
  {
    const okResp = { ok: true, authorized: true, session: 'SESS', email: 'dar@x.c', perms: ['תקציב', 'מועדון'], isSuper: false,
                     isExternal: false, familyId: '401', firstName: 'דר', family: 'גולן', house: '7' };
    let c = client({ server: okResp });
    c.box.currentUser = c.t.userFromMember(c.box.CBA.fb.profile(), memberDoc());
    const got = [];
    c.t.sessionReady(s => got.push(s));
    c.t.sessionReady(s => got.push(s));
    await wait(10);
    ok('🔴 שתי קריאות במקביל ⇒ בקשת loginFb אחת', c.fetches.length === 1 && c.fetches[0].action === 'loginFb' && c.fetches[0].idToken === 'FBTOKEN', JSON.stringify(c.fetches));
    ok('שני הממתינים קיבלו את המושב', got.join() === 'SESS,SESS');
    ok('המושב נשמר ב-CBA.authSession ובמשתמש', c.box.CBA.authSession === 'SESS' && c.box.currentUser.session === 'SESS' && c.log.indexOf('saveSession:SESS') !== -1);
    ok('השרת יודע יותר (מועדון נוסף בגיליון) ⇒ ההרשאות התעדכנו והמסך צויר מחדש',
       c.box.currentUser.perms.join() === 'תקציב,מועדון' && c.log.filter(x => x === 'applyUser').length === 1);
    c.t.sessionReady(s => got.push(s));
    ok('אחרי שיש מושב — מיד, בלי בקשה', got.length === 3 && c.fetches.length === 1);
    c.box.CBA.sessionExpired();
    ok('מושב שפג בשרת ("אין הרשאה") ⇒ נשכח', c.box.CBA.authSession === '' && c.box.currentUser.session === '');
    c.t.sessionReady(s => got.push(s)); await wait(10);
    ok('והקריאה הבאה מביאה מושב חדש', c.fetches.length === 2 && got[3] === 'SESS');
    ok('sheets.js מפעיל את זה רק על "אין הרשאה" המדויק (מושב), לא על "אין לך הרשאה לפעולה"',
       /data\.error === "אין הרשאה" &&\s*\n\s*window\.CBA && typeof CBA\.sessionExpired === "function"/.test(SHEETS));

    c = client({ server: Object.assign({}, okResp, { email: 'other@x.c' }) });
    c.box.currentUser = c.t.userFromMember(c.box.CBA.fb.profile(), memberDoc());
    let s1 = null; c.t.sessionReady(s => { s1 = s; }); await wait(10);
    ok('🔴 תשובה למייל אחר ⇒ לא מתקבלת', s1 === '' && c.box.CBA.authSession === '');

    c = client({ server: { ok: true, authorized: false, reason: 'inactive' } });
    c.box.currentUser = c.t.userFromMember(c.box.CBA.fb.profile(), memberDoc());
    c.store.cba_ident_v1 = '{"uid":"UID-D","at":1}';
    s1 = null; c.t.sessionReady(s => { s1 = s; }); await wait(10);
    ok('🔴 "עזב" ⇒ יציאה, מסך כניסה עם הסבר, והזיכרון נמחק',
       s1 === '' && c.log.indexOf('logout') !== -1 && c.log.indexOf('gate') !== -1 && /עזב/.test(c.box.loginError || '') && !c.store.cba_ident_v1);

    c = client({ server: 'neterr' });
    c.box.currentUser = c.t.userFromMember(c.box.CBA.fb.profile(), memberDoc());
    s1 = null; c.t.sessionReady(s => { s1 = s; }); await wait(10);
    ok('רשת נפלה ⇒ "" (הקורא ממשיך, השרת יסביר)', s1 === '' && c.log.indexOf('logout') === -1);
    const nBefore = c.fetches.length;
    s1 = null; c.t.sessionReady(s => { s1 = s; }); await tick();
    ok('L2: מיד אחרי כישלון — "" בלי בקשה חדשה (לא מפציצים את השרת)', s1 === '' && c.fetches.length === nBefore);
    {
      const c3 = client({ server: 'neterr' });
      vm.runInContext(SEC.replace('SESS_BACKOFF_MS = 15000', 'SESS_BACKOFF_MS = 0') + '\nthis.__t3 = { sessionReady, userFromMember };', c3.box);
      c3.box.currentUser = c3.box.__t3.userFromMember(c3.box.CBA.fb.profile(), memberDoc());
      s1 = null; c3.box.__t3.sessionReady(s => { s1 = s; }); await wait(10);
      c3.box.fetch = () => Promise.resolve({ json: () => Promise.resolve(okResp) });
      s1 = null; c3.box.__t3.sessionReady(s => { s1 = s; }); await wait(10);
      ok('ואחרי ההמתנה — הקריאה הבאה מנסה שוב ומצליחה', s1 === 'SESS');
    }
    {
      const c4 = client({ server: { ok: true, authorized: false, reason: 'relogin' } });
      c4.box.currentUser = c4.t.userFromMember(c4.box.CBA.fb.profile(), memberDoc());
      c4.t.sessionReady(() => {}); await wait(10);
      ok('relogin (30 יום/ניתוק) ⇒ מסך כניסה בלי לחסום את One Tap', c4.log.indexOf('gate') !== -1 && c4.log.indexOf('blockGis') === -1 && /שוב/.test(c4.box.loginError || ''));
    }

    c = client({ server: okResp });
    c.box.currentUser = { email: 'dar@x.c', session: '' };   // משתמש מהדרך הרגילה בלי מושב (לא אמור לקרות)
    s1 = null; c.t.sessionReady(s => { s1 = s; }); await tick();
    ok('משתמש שלא נכנס מ-Firebase ⇒ "" מיד, בלי בקשה', s1 === '' && c.fetches.length === 0);

    c = client({ server: 'never' });
    c.box.currentUser = c.t.userFromMember(c.box.CBA.fb.profile(), memberDoc());
    ok('תקרת זמן של 30 שניות לבקשת המושב', /var timer = setTimeout\(function \(\) \{ bootMark\("מושב לא חזר בזמן"\); settle\(""\); \}, 30000\);/.test(SEC));
    ok('logout משחרר ממתינים ומבטל בקשה שבדרך (sessGen)', /var w = sessWaiters; sessGen\+\+; sessWaiters = null;\s*\n\s*\(w \|\| \[\]\)\.forEach\(function \(fn\) \{ try \{ fn\(""\); \} catch \(e\) \{\} \}\);/.test(APP));
  }

  section('10. withSession ב-sheets.js — ממתין כשצריך, מיידי כשלא, בלי לולאה');
  {
    const ws = SHEETS.slice(SHEETS.indexOf('  function authSession()'), SHEETS.indexOf('  function withSession(fn) {'));
    const wsFn = (SHEETS.match(/  function withSession\(fn\) \{[\s\S]*?\n  \}\n/) || [''])[0];
    ok('withSession קיים', !!wsFn);
    function mk(sess, readyImpl) {
      const box = { window: { CBA: { authSession: sess } } };
      box.CBA = box.window.CBA;
      if (readyImpl) box.CBA.sessionReady = readyImpl;
      vm.createContext(box);
      vm.runInContext('function authSession() { return (window.CBA && CBA.authSession) || ""; }\n' + wsFn + '\nthis.ws = withSession;', box);
      return box;
    }
    let n = 0, asked = 0;
    let b = mk('S', () => { asked++; });
    b.ws(() => n++);
    ok('יש מושב ⇒ רץ מיד (סינכרוני), בלי לשאול', n === 1 && asked === 0);
    n = 0; asked = 0; let pend = null;
    b = mk('', cb => { asked++; pend = cb; });
    b.ws(() => n++);
    ok('אין מושב ⇒ ממתין', n === 0 && asked === 1);
    pend('');
    ok('🔴 המושב לא הגיע ⇒ fn רץ פעם אחת (השרת יסביר), בלי לולאה', n === 1 && asked === 1);
    n = 0; b = mk('', null); b.ws(() => n++);
    ok('אין sessionReady (דף ישן/בדיקות) ⇒ מיד', n === 1);
    ['fetchPayload', 'get', 'postRead', 'postQuiet', 'postReadProgress'].forEach(f => {
      ok('עטוף: ' + f, new RegExp('function ' + f + '\\(\\) \\{ var a = arguments; withSession\\(function \\(\\) \\{ ' + f + 'Now\\.apply\\(null, a\\); \\}\\); \\}').test(SHEETS));
    });
    const P = SHEETS.slice(SHEETS.indexOf('  function push(action, payload, cb, _retryAttempt) {'), SHEETS.indexOf('  function pushNow('));
    ok('push: יש מושב ⇒ pushNow מיד', /if \(authSession\(\) \|\| !\(window\.CBA && typeof CBA\.sessionReady === "function"\)\) return pushNow\(action, payload, cb, _retryAttempt\);/.test(P));
    ok('🔴 H2: push בזמן המתנה — מסומן "שומר…" לפני ההמתנה (isDirty אמת)', P.indexOf('markDirty(key') > -1 && P.indexOf('markDirty(key') < P.indexOf('CBA.sessionReady('));
    ok('🔴 H2: בעזיבת דף — לתור, לא המתנה', /if \(unloading\) \{ enqueueWrite\(action, payload, _retryAttempt \|\| 0\); return; \}/.test(P));
    ok('🔴 H2: המושב לא הגיע ⇒ לתור, לעולם לא שליחה בלי מושב', /if \(!sess && !authSession\(\)\) \{\s*enqueueWrite\(action, payload, _retryAttempt \|\| 0\);/.test(P) && P.indexOf('pushNow(action, payload, cb, _retryAttempt);\n    });') > -1);
    ok('עטוף: משיכת שנה דרך Apps Script', /function viaAppsScript\(done\) \{ withSession\(function \(\) \{ viaAppsScriptNow\(done\); \}\); \}/.test(SHEETS));
    ok('🔴 אף פונקציית *Now לא קוראת ל-withSession (אין לולאה)',
       ['fetchPayloadNow', 'pushNow', 'getNow', 'postReadNow', 'postQuietNow', 'postReadProgressNow'].every(f => {
         const i = SHEETS.indexOf('function ' + f + '(');
         const body = SHEETS.slice(i, SHEETS.indexOf('\n  }\n', i));
         return i > -1 && body.indexOf('withSession(') === -1;
       }));
    ok('הדלת: רק פעולות ניהול (op) ממתינות למושב; פתיחה רגילה לא (L1)', /if \(payload\.op && !CBA\.authSession && typeof CBA\.sessionReady === "function"\) \{\s*return CBA\.sessionReady\(function \(\) \{ viaWorkerNow\(payload, cb\); \}\);/.test(DOOR));
    ok('?action=rev (בלי מושב) לא עטוף — הדופק לא ממתין', /fetch\(API_URL \+ "\?action=rev"\)/.test(SHEETS));
  }

  section('11. enterApp — אותו מסלול לשלושת סוגי הכניסה');
  {
    const c = client({ server: 'never' });
    const u = c.t.userFromMember(c.box.CBA.fb.profile(), memberDoc());
    c.t.enterApp(u, { fbReady: true, remember: true });
    await wait(5);
    const L = c.log.join(' > ');
    ok('הזהות לפני המשיכה (applyUser לפני load)', c.log.indexOf('applyUser') > -1 && c.log.indexOf('applyUser') < c.log.indexOf('load'), L);
    ok('בכניסה מ-Firebase: בלי התחברות Firebase שנייה, אבל עם afterFirebaseSignIn (בלי firebaseLink)',
       c.log.indexOf('fbSignInNow') === -1 && c.log.indexOf('after:{"link":false,"remember":true}') !== -1, L);
    ok('🔴 שלב 2: אין בקשת מושב בכניסה (עצלה — רק כשפעולה צריכה Apps Script)', c.fetches.length === 0, JSON.stringify(c.fetches));
    const c2 = client();
    c2.t.enterApp({ email: 'dar@x.c', session: 'S', perms: [] }, { credential: 'G' });
    await wait(5);
    ok('בדרך הרגילה: התחברות Firebase כמו קודם, בלי בקשת מושב (כבר יש)', c2.log.indexOf('fbSignInNow') !== -1 && c2.fetches.length === 0);
    ok('onGoogleLogin: קודם Firebase, ואז הדרך הרגילה', /fbFirstLogin\(resp, function \(handled\) \{ if \(!handled\) classicLogin\(resp\); \}\);/.test(APP));
    ok('הדרך הרגילה בהצלחה ⇒ enterApp עם credential', /enterApp\(data, \{ credential: resp\.credential \}\);/.test(APP));
    ok('המושב השמור: רשומה מ-Firebase בלי מושב נשמרת (תגיע ברקע)', /if \(!s\.user\.session && !\(s\.user\.via === "fb" && s\.user\.uid\)\)/.test(APP));
    ok('ובעליית עמוד עם רשומה כזו — גם בלי בקשת מושב (עצלה)', /applyUser\(\); CBA\.sheets\.load\(sheetsLoadHandler\); \}/.test(APP) && !/sessionReady\(\); CBA\.sheets\.load/.test(APP));
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
