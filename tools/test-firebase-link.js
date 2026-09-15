/* בדיקות ל-handleFirebaseLink_ — גשר הזהות ל-Firestore (2026-09-14, צעד 02ג).
   הרצה:  node tools/test-firebase-link.js

   🔴 המארז הזה הוא בעיקר **בדיקת אבטחה**, לא בדיקת פונקציונליות. שלוש
   ההגנות שנבדקות כאן הן מה שמפריד בין "גשר זהות" ל"דלת אחורית":
     1. ה-uid מגיע מאימות של גוגל ולא מהלקוח.
     2. המייל ב-Firebase חייב להיות זהה למייל שבמושב החתום שלנו.
     3. ההרשאות נקראות מהגיליון, לעולם לא מפרמטר של הלקוח. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const APP = path.join(__dirname, '..', 'apps-script');
const CODE = fs.readFileSync(path.join(APP, 'Code.gs'), 'utf8');
const FSTORE = fs.readFileSync(path.join(APP, 'Firestore.gs'), 'utf8');

let lastFetch, fetchReply, writes, gate, remembered;
const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({}), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {},
  UrlFetchApp: {
    fetch: (url, opt) => {
      lastFetch = { url: url, opt: opt };
      return { getResponseCode: () => fetchReply.code, getContentText: () => fetchReply.body };
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FSTORE, sandbox);

sandbox.json_ = o => o;
sandbox.authorize_ = () => gate;
sandbox.normalizeEmail_ = e => String(e || '').trim().toLowerCase();
sandbox.fsSet_ = (p, o) => { writes.push({ path: p, obj: o }); return {}; };
sandbox.fbRememberUid_ = (ss, email, uid) => { remembered.push({ email: email, uid: uid }); return true; };

function reset(perm, email) {
  writes = []; remembered = []; lastFetch = null;
  gate = { ok: true, email: email || 'y@x.com', perm: perm };
  fetchReply = { code: 200, body: JSON.stringify({ users: [{ localId: 'UID-1', email: email || 'y@x.com' }] }) };
}
const call = tok => sandbox.handleFirebaseLink_({ session: 's', idToken: tok === undefined ? 'TOK' : tok });

/* ================================================================= */
section('1. רישום וניתוב');
ok('הפעולה רשומה ב-GET_ACTION_PERMS', 'firebaseLink' in sandbox.GET_ACTION_PERMS);
ok('⚠️ עם need=null (כל תושב פעיל צריך רשומת חבר)',
   sandbox.GET_ACTION_PERMS.firebaseLink === null, String(sandbox.GET_ACTION_PERMS.firebaseLink));
ok('אינה ברשימת הפעולות הפתוחות', sandbox.GET_PUBLIC_ACTIONS.indexOf('firebaseLink') === -1);
ok('doGet מנתב אליה', /action === 'firebaseLink'[\s\S]{0,80}handleFirebaseLink_/.test(CODE));
ok('⚠️ הניתוב אחרי השער העליון',
   CODE.indexOf("action === 'firebaseLink'") > CODE.indexOf('GET_PUBLIC_ACTIONS.indexOf(getAction)'));

/* ================================================================= */
section('2. המסלול התקין');
reset({ perms: ['תקציב'], familyId: '401', isSuper: false });
let r = call();
ok('הצליח', r.ok === true, JSON.stringify(r.error));
ok('הוחזר ה-uid שגוגל אימתה', r.uid === 'UID-1', r.uid);
ok('נכתב מסמך אחד', writes.length === 1, String(writes.length));
ok('⚠️ לנתיב members/<uid שאומת>', writes[0].path === 'members/UID-1', writes[0].path);
ok('מזהה המשפחה נכתב', writes[0].obj.familyId === '401');
ok('ההרשאות נכתבו', JSON.stringify(writes[0].obj.perms) === '["תקציב"]', JSON.stringify(writes[0].obj.perms));
/* ⚠️ **פעם שנייה שהמלכודת הזו תופסת** (הראשונה: Error ב-test-firebase-bridge).
   אובייקט שנוצר בתוך ה-vm אינו `instanceof` של הבדיקה — בנאי אחר לגמרי.
   בודקים **צורה**, לא שושלת. */
ok('updatedAt הוא תאריך (כלל היברידיות 3)',
   !!writes[0].obj.updatedAt && typeof writes[0].obj.updatedAt.getTime === 'function',
   String(writes[0].obj.updatedAt));
ok('schema קיים (כלל היברידיות 3)', writes[0].obj.schema === 1);
ok('⚠️ active=true — מתג הכיבוי שכללי האבטחה דורשים', writes[0].obj.active === true);
ok('⚠️ ה-uid נרשם בגיליון (גשר לשלילת הרשאה מיידית)',
   remembered.length === 1 && remembered[0].uid === 'UID-1', JSON.stringify(remembered));
ok('ונרשם מול המייל של המושב', remembered[0].email === 'y@x.com', remembered[0].email);

section('3. 🔴 אין נתונים אישיים במסמך');
const keys = Object.keys(writes[0].obj).sort();
ok('⚠️ בדיוק שישה שדות', keys.length === 6, keys.join(','));
['name','email','phone','firstName','family','house','mail','טלפון','שם'].forEach(k =>
  ok('⚠️ אין שדה ' + k, keys.indexOf(k) === -1));
ok('⚠️ ושום ערך אינו המייל', JSON.stringify(writes[0].obj).indexOf('@') === -1,
   JSON.stringify(writes[0].obj));

/* ================================================================= */
section('4. 🔴 הגנה 1 — ה-uid מגיע מגוגל, לא מהלקוח');
reset({ perms: [], familyId: '401' });
sandbox.handleFirebaseLink_({ session: 's', idToken: 'TOK', uid: 'UID-של-מישהו-אחר' });
ok('⚠️ uid שנשלח מהלקוח **מתעלמים ממנו לגמרי**',
   writes[0].path === 'members/UID-1', writes[0].path);
ok('הקוד לא קורא p.uid בכלל', !/p\.uid|parameter\.uid/.test(CODE.slice(CODE.indexOf('function handleFirebaseLink_'), CODE.indexOf('function handleFirebaseLink_') + 2000)));
ok('נשלחה בקשת אימות לגוגל', /identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/.test(lastFetch.url), lastFetch.url);
ok('הטוקן נשלח בגוף ולא ב-URL', /"idToken":"TOK"/.test(lastFetch.opt.payload), lastFetch.opt.payload);

/* ================================================================= */
section('5. 🔴 הגנה 2 — המייל ב-Firebase חייב להתאים למושב');
reset({ perms: ['על'], familyId: '401', isSuper: true }, 'me@x.com');
fetchReply = { code: 200, body: JSON.stringify({ users: [{ localId: 'UID-ZAR', email: 'someone.else@x.com' }] }) };
r = call();
ok('⚠️ **נדחה** כשהמיילים שונים', r.ok === false, JSON.stringify(r));
ok('הודעה ברורה', /אינה תואמת/.test(r.error), r.error);
ok('⚠️ ולא נכתב כלום', writes.length === 0, String(writes.length));

reset({ perms: [], familyId: '401' }, 'Me@X.com');
fetchReply = { code: 200, body: JSON.stringify({ users: [{ localId: 'UID-1', email: '  me@x.COM ' }] }) };
r = call();
ok('הבדלי רישיות ורווחים אינם חוסמים משתמש אמיתי', r.ok === true, JSON.stringify(r.error));

/* ================================================================= */
section('6. 🔴 הגנה 3 — ההרשאות מהגיליון, לא מהלקוח');
reset({ perms: ['גינון'], familyId: '77', isSuper: false });
sandbox.handleFirebaseLink_({ session: 's', idToken: 'TOK', perms: 'על', familyId: '999' });
ok('⚠️ perms שנשלחו מהלקוח לא נכנסו',
   JSON.stringify(writes[0].obj.perms) === '["גינון"]', JSON.stringify(writes[0].obj.perms));
ok('⚠️ familyId שנשלח מהלקוח לא נכנס', writes[0].obj.familyId === '77', writes[0].obj.familyId);

reset({ perms: [], familyId: '5', isSuper: true });
call();
ok('מנהל-על בלי "על" ברשימה — התג נוסף', writes[0].obj.perms.indexOf('על') !== -1,
   JSON.stringify(writes[0].obj.perms));
reset({ perms: ['על', 'תקציב'], familyId: '5', isSuper: true });
call();
ok('ולא פעמיים כשהוא כבר שם',
   writes[0].obj.perms.filter(x => x === 'על').length === 1, JSON.stringify(writes[0].obj.perms));

/* ================================================================= */
section('7. כשלים');
reset({ perms: [], familyId: '1' });
gate = { ok: false, error: 'אין הרשאה' };
r = call();
ok('שער סגור — נדחה', r.ok === false && r.error === 'אין הרשאה');
ok('⚠️ ובלי לפנות לגוגל בכלל', lastFetch === null);

reset({ perms: [], familyId: '1' });
r = call('');
ok('בלי טוקן — נדחה', r.ok === false && /חסר טוקן/.test(r.error), JSON.stringify(r));
ok('ובלי כתיבה', writes.length === 0);

reset({ perms: [], familyId: '1' });
fetchReply = { code: 400, body: '{"error":{"message":"INVALID_ID_TOKEN"}}' };
r = call();
ok('טוקן פסול — נדחה', r.ok === false && /אימות הטוקן נכשל/.test(r.error), JSON.stringify(r));
ok('ובלי כתיבה', writes.length === 0);

reset({ perms: [], familyId: '1' });
fetchReply = { code: 200, body: '{"users":[]}' };
r = call();
ok('תשובה ריקה מגוגל — נדחה', r.ok === false && /אינו מזוהה/.test(r.error), JSON.stringify(r));

reset({ perms: [], familyId: '1' });
sandbox.fsSet_ = () => { throw new Error('Firestore down'); };
r = call();
ok('כתיבה שנכשלה מוחזרת כשגיאה ולא זורקת', r.ok === false && /נכשלה/.test(r.error), JSON.stringify(r));
sandbox.fsSet_ = (p, o) => { writes.push({ path: p, obj: o }); return {}; };

/* ================================================================= */
section('7ב. 🔴 כישלון ברישום ה-uid לגיליון אינו מפיל את הפעולה');
reset({ perms: ['תקציב'], familyId: '401' });
sandbox.fbRememberUid_ = () => { throw new Error('גיליון נעול'); };
r = call();
ok('⚠️ הפעולה עדיין הצליחה', r.ok === true, JSON.stringify(r));
ok('⚠️ ורשומת החבר נכתבה — המשתמש עובד', writes.length === 1 && writes[0].path === 'members/UID-1');
ok('והתשובה מדווחת remembered=false', r.remembered === false, JSON.stringify(r));
sandbox.fbRememberUid_ = (ss, e2, u2) => { remembered.push({ email: e2, uid: u2 }); return true; };

/* ================================================================= */
section('8. הצד הלקוח');
const APPJS = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
ok('הלקוח שולח idToken', /action=firebaseLink[\s\S]{0,300}idToken=/.test(APPJS));
ok('⚠️ והוא **אינו** שולח uid', !/firebaseLinkMember[\s\S]{0,700}uid=/.test(APPJS));
ok('הקישור קורה רק אחרי התחברות מוצלחת',
   /CBA\.fb\.signIn\(googleIdToken, function \(err\) \{\s*\n\s*if \(err\) return;[\s\S]{0,80}firebaseLinkMember\(\)/.test(APPJS));
ok('⚠️ ושקט לגמרי — בלי טוסט/דיאלוג',
   !/firebaseLinkMember[\s\S]{0,900}(CBA\.ui\.toast|CBA\.ui\.alert)/.test(APPJS));

/* ================================================================= */
section('9. 🔴 savePermissions מסנכרן מיד ל-Firestore');
const SP = CODE.slice(CODE.indexOf('function savePermissions_'), CODE.indexOf('function savePermissions_') + 4000);
ok('קורא את ה-uid מהשורה', /fbUidForSlot_\(sh, rowIndex, slot\)/.test(SP));
ok('⚠️ וכותב את המסמך מחדש', /fsSet_\('members\/' \+ uid/.test(SP));
ok('⚠️ ההרשאות שנכתבות הן החדשות, לא מהזיכרון המטומן',
   /perms: perms,/.test(SP) && !/perms: tp\.perms/.test(SP));
ok('⚠️ נכשל בשקט — הגיליון כבר נשמר והוא מקור האמת',
   /\} catch \(err\) \{ fsSynced = false; \}/.test(SP));
ok('מדווח fsSynced בתשובה', /return \{ ok: true, perms: perms, fsSynced: fsSynced \};/.test(SP));
ok('⚠️ הסנכרון **אחרי** הכתיבה לגיליון ולא לפניה',
   SP.indexOf('setValue(perms.join') < SP.indexOf("fsSet_('members/"));

/* ================================================================= */
section('10. עמודת הגשר בגיליון');
ok('כותרת מוגדרת', /var FB_UID_HEADER = 'מזהה Firebase';/.test(CODE));
ok('עמודות נוצרות כמספר עמודות האימייל', /function ensureFbUidCols_/.test(CODE));
ok('⚠️ פר-משבצת, כמו אימייל והרשאות', /function residentSlotCols_/.test(CODE) &&
   /uid\.push\(i\)/.test(CODE));
ok('⚠️ כותבים רק כשה-uid באמת השתנה',
   /if \(cur === uid\) return true;/.test(CODE));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
