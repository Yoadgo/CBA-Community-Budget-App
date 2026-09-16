/* בדיקות ל-Push notifications (FCM) — savePushSubscription_ / removePushSubscription_ / sendPush_
   הרצה:  node tools/test-push-notifications.js
   מבנה הבדיקה זהה בכוונה ל-tools/test-firebase-link.js (אותה שיטת הגנה:
   idToken מאומת מול גוגל, לא סומכים על מה שהלקוח טוען). */
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

let writes, deletes, lastFetch, fetchReply, verifyReply;
const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: () => JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: 'FAKE', project_id: 'test-proj' }),
    setProperty() {}, getKeys: () => []
  }) },
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
sandbox.normalizeEmail_ = e => String(e || '').trim().toLowerCase();
sandbox.fsSet_ = (p, o) => { writes.push({ path: p, obj: o }); return {}; };
sandbox.fsDelete_ = p => { deletes.push(p); return {}; };
sandbox.fsQuery_ = () => []; // מוחלף פר-בדיקה ב-section 3
sandbox.fsVerifyIdToken_ = tok => verifyReply(tok);

function reset() {
  writes = []; deletes = []; lastFetch = null;
  verifyReply = () => ({ ok: true, uid: 'UID-1', email: 'y@x.com' });
}

/* ================================================================= */
section('1. רישום וניתוב');
ok('savePushSubscription רשום ב-ACTION_PERMS', 'savePushSubscription' in sandbox.ACTION_PERMS);
ok('removePushSubscription רשום ב-ACTION_PERMS', 'removePushSubscription' in sandbox.ACTION_PERMS);
ok('⚠️ עם need=null (כל תושב מחובר)', sandbox.ACTION_PERMS.savePushSubscription == null);
ok('doPostDispatch_ מנתב את savePushSubscription',
   /case 'savePushSubscription':\s*return json_\(savePushSubscription_/.test(CODE));
ok('doPostDispatch_ מנתב את removePushSubscription',
   /case 'removePushSubscription':\s*return json_\(removePushSubscription_/.test(CODE));

/* ================================================================= */
section('2. savePushSubscription_ — המסלול התקין');
reset();
let r = sandbox.savePushSubscription_({}, { idToken: 'TOK', token: 'FCM-TOK-1', _email: 'y@x.com', _perm: { familyId: '401' } });
ok('הצליח', r.ok === true, JSON.stringify(r));
ok('נכתב מסמך אחד', writes.length === 1, String(writes.length));
ok('⚠️ לנתיב pushSubscriptions/<uid שאומת>', writes[0].path === 'pushSubscriptions/UID-1', writes[0].path);
ok('הטוקן נכתב', writes[0].obj.token === 'FCM-TOK-1');
ok('familyId מ-gate.perm ולא מהלקוח', writes[0].obj.familyId === '401');
ok('updatedAt הוא תאריך', !!writes[0].obj.updatedAt && typeof writes[0].obj.updatedAt.getTime === 'function');

section('3. 🔴 הגנה — idToken חייב להתאים למייל המושב (כמו handleFirebaseLink_)');
reset();
verifyReply = () => ({ ok: true, uid: 'UID-ZAR', email: 'someone.else@x.com' });
r = sandbox.savePushSubscription_({}, { idToken: 'TOK', token: 'FCM-TOK-1', _email: 'y@x.com', _perm: {} });
ok('⚠️ נדחה כשהמיילים שונים', r.ok === false, JSON.stringify(r));
ok('⚠️ ולא נכתב כלום', writes.length === 0, String(writes.length));

section('4. removePushSubscription_');
reset();
r = sandbox.removePushSubscription_({}, { idToken: 'TOK' });
ok('הצליח', r.ok === true, JSON.stringify(r));
ok('נמחק pushSubscriptions/<uid>', deletes[0] === 'pushSubscriptions/UID-1', JSON.stringify(deletes));

/* ================================================================= */
section('5. sendPush_ — שליחה ומחיקת טוקן מת');
reset();
let queried;
sandbox.fsQuery_ = (coll, field, op, value, limit) => {
  queried = { coll: coll, field: field, op: op, value: value, limit: limit };
  return [
    { id: 'UID-A', data: { token: 'TOK-A' } },
    { id: 'UID-B', data: { token: 'TOK-B' } }
  ];
};
fetchReply = { code: 200, body: '{}' }; // TOK-A מצליח, נהפוך ל-410/404 עבור TOK-B בהמשך
sandbox.UrlFetchApp.fetch = (url, opt) => {
  lastFetch = { url: url, opt: opt };
  // קריאת אימות מול oauth2.googleapis.com (fsToken_) — payload הוא אובייקט טופס,
  // לא JSON — חייבים לזהות אותה בנפרד מקריאת השליחה עצמה ל-FCM.
  if (String(url).indexOf('oauth2.googleapis.com') !== -1) {
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'FAKE-TOK' }) };
  }
  var body = JSON.parse(opt.payload);
  var isB = body.message.token === 'TOK-B';
  return { getResponseCode: () => (isB ? 404 : 200), getContentText: () => '{}' };
};
sandbox.sendPush_('401', 'כותרת', 'גוף ההודעה', { type: 'test' });
ok('שאילתה על pushSubscriptions לפי familyId (שוויון יחיד, ר\' cba-hybrid-architecture)',
   queried.coll === 'pushSubscriptions' && queried.field === 'familyId' && queried.op === 'EQUAL' && queried.value === '401',
   JSON.stringify(queried));
ok('⚠️ טוקן שנכשל (404) נמחק — ניקוי מנוי מת', deletes.indexOf('pushSubscriptions/UID-B') !== -1, JSON.stringify(deletes));
ok('⚠️ טוקן שהצליח (200) לא נמחק', deletes.indexOf('pushSubscriptions/UID-A') === -1, JSON.stringify(deletes));

section('6. 🔴 sendPush_ לעולם לא זורק — ערוץ משני');
reset();
sandbox.fsQuery_ = () => { throw new Error('Firestore נפל'); };
let threw = false;
try { sandbox.sendPush_('401', 'x', 'y', {}); } catch (e) { threw = true; }
ok('⚠️ לא זורק גם כששאילתת Firestore נכשלת', !threw);

section('7. familyId ריק — לא שולח כלום, לא קורס');
reset();
sandbox.fsQuery_ = () => { throw new Error('לא אמור להיקרא'); };
threw = false;
try { sandbox.sendPush_('', 'x', 'y', {}); } catch (e) { threw = true; }
ok('⚠️ יוצא מוקדם בלי לשאול את Firestore', !threw);

/* ================================================================= */

/* ================================================================= */
section('8. sendPushToAdmins_ — ממפה מיילים ל-familyId וממען ייחודית');
reset();
let pushCalls;
sandbox.fsQuery_ = (coll, field, op, value, limit) => {
  pushCalls = pushCalls || [];
  pushCalls.push(value);
  return [{ id: 'UID-' + value, data: { token: 'TOK-' + value } }];
};
sandbox.UrlFetchApp.fetch = (url, opt) => {
  if (String(url).indexOf('oauth2.googleapis.com') !== -1) {
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'FAKE-TOK' }) };
  }
  return { getResponseCode: () => 200, getContentText: () => '{}' };
};
sandbox.adminEmailsByPerm_ = () => ['gan1@x.com', 'gan2@x.com', 'super@x.com'];
sandbox.permissionsFor_ = (email) => {
  if (email === 'gan1@x.com') return { familyId: '10' };
  if (email === 'gan2@x.com') return { familyId: '10' };        // ⚠️ אותה משפחה — לא אמורה לקבל פעמיים
  if (email === 'super@x.com') return { familyId: '20' };
  return {};
};
sandbox.sendPushToAdmins_({}, 'גינון', 'כותרת', 'גוף', { type: 'test' });
ok('שתי משפחות בלבד נשאלו (10 פעם אחת, 20 פעם אחת) — לא כפילות',
   pushCalls && pushCalls.length === 2 && pushCalls.indexOf('10') !== -1 && pushCalls.indexOf('20') !== -1,
   JSON.stringify(pushCalls));

section('9. 🔴 sendPushToAdmins_ לעולם לא זורק');
reset();
sandbox.adminEmailsByPerm_ = () => { throw new Error('הגיליון נפל'); };
threw = false;
try { sandbox.sendPushToAdmins_({}, 'גינון', 'x', 'y', {}); } catch (e) { threw = true; }
ok('⚠️ לא זורק גם כשקריאת רשימת המנהלים נכשלת', !threw);

section('10. notifyAdmins_ — Push כרוך לגמרי בהגדרת המייל הקיימת');
reset();
let sentMail = null, pushArgs = null;
sandbox.getEmailSettings_ = () => ({
  'ADMIN_NEW_GARDEN_REPORT': { subject: 'דיווח גינון חדש מ-{{שם}}', body: 'תושב {{שם}} דיווח: ' + 'א'.repeat(150) }
});
sandbox.emailEnabled_ = (settings, key) => !!settings[key];
sandbox.sendMail_ = (emails, subject, text, html) => { sentMail = { emails, subject }; };
sandbox.buildEmailHtml_ = (plain) => '<html>' + plain + '</html>';
sandbox.renderTemplate_ = (tpl, vars) => tpl.replace('{{שם}}', (vars && vars['שם']) || '');
sandbox.adminEmailsByPerm_ = () => ['gan1@x.com'];
sandbox.permissionsFor_ = () => ({ familyId: '10' });
let sendPushToAdminsCalled = null;
sandbox.sendPushToAdmins_ = (ss, permKey, title, body, data) => { sendPushToAdminsCalled = { permKey, title, body, data }; };
sandbox.notifyAdmins_({}, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'יועד' });
ok('המייל נשלח כרגיל (לא נשבר)', sentMail && sentMail.subject === 'דיווח גינון חדש מ-יועד', JSON.stringify(sentMail));
ok('Push נשלח עם אותו permKey (גינון)', sendPushToAdminsCalled && sendPushToAdminsCalled.permKey === 'גינון', JSON.stringify(sendPushToAdminsCalled));
ok('כותרת ה-Push = נושא המייל המתוקנן', sendPushToAdminsCalled && sendPushToAdminsCalled.title === 'דיווח גינון חדש מ-יועד', JSON.stringify(sendPushToAdminsCalled));
ok('⚠️ גוף ה-Push מקוצר ל-100 תווים + …', sendPushToAdminsCalled && sendPushToAdminsCalled.body.length === 101 && sendPushToAdminsCalled.body.slice(-1) === '…', JSON.stringify(sendPushToAdminsCalled && sendPushToAdminsCalled.body.length));

section('11. notifyAdmins_ — תבנית כבויה: לא מייל ולא Push (אותו מתג בדיוק)');
reset();
sentMail = null; sendPushToAdminsCalled = null;
sandbox.getEmailSettings_ = () => ({});
sandbox.emailEnabled_ = () => false;
sandbox.notifyAdmins_({}, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', {});
ok('⚠️ לא נשלח מייל', sentMail === null);
ok('⚠️ ולא נשלח Push — אין מתג נפרד', sendPushToAdminsCalled === null);

/* ================================================================= */

/* ================================================================= */
console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
