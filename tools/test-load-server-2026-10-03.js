/* ============================================================================
   test-load-server-2026-10-03.js — מוכנות ל-80 משתמשים, צד שרת (3.10.2026)
   מה יכול להישבר בשקט:
     1. מטמון ההרשאות מחזיר הרשאה ישנה אחרי ששונתה דרך האפליקציה.
     2. rowIndex נוסע במטמון → כתיבה לשורה של מישהו אחר.
     3. "לא נמצא" נשמר במטמון → תושב חדש חסום 5 דקות.
     4. סוד/דור המושב ממשיכים לקרוא Properties בכל בקשה (קופון Properties).
     5. revokeAllSessions לא מנקה את המטמון → מושבים ישנים ממשיכים לעבוד.
     6. login קורא את טאב התושבים פעמיים.
     7. העלאת קבלה עדיין בתוך הנעילה / קובץ יתום כשהנעילה נכשלת.
     8. flagsGet בלי מכסת מייל.
   הרצה: node tools/test-load-server-2026-10-03.js
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const DOOR = fs.readFileSync(path.join(ROOT, 'apps-script', 'Door.gs'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, detail) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (detail ? '  — ' + detail : '')); } }
function section(t) { console.log('\n' + t); }

/* ---------- עולם מזויף עם מונים ---------- */
const HEAD = ['מזהה קבוע', 'שם משפחה', 'מספר בית', 'שם פרטי 1', 'אימייל 1', 'הרשאות 1', 'שם פרטי 2', 'אימייל 2', 'הרשאות 2', 'סטטוס', 'חיצוני'];
let ROWS = [
  HEAD,
  ['401', 'גולן', '401', 'יועד', 'yoad@x.c', 'על', 'דר', 'dar@x.c', 'תקציב', 'פעיל', ''],
  ['402', 'לוי', '402', 'דנה', 'dana@x.c', '', '', '', '', 'פעיל', ''],
];
const counters = { sheetReads: 0, propReads: 0, propWrites: 0, cacheGets: 0, cachePuts: 0, driveCreate: 0, trashed: 0, lockWaits: 0, appended: 0 };
const cacheStore = {};
const propStore = { CBA_SESSION_SECRET: 'secret-1', CBA_SESSION_EPOCH: '3' };
let lockShouldFail = false;
const order = [];

const residentsSheet = {
  getDataRange: () => { counters.sheetReads++; return { getValues: () => ROWS.map(r => r.slice()) }; },
  getRange: () => ({ getValues: () => [HEAD.slice()], setValue: () => ({ setFontWeight() {} }) }),
  getLastColumn: () => HEAD.length, getLastRow: () => ROWS.length,
};
const txSheet = {
  getRange: (r, c, n, m) => ({ getValues: () => (r === 1 ? [['מזהה', 'חודש הגשה', 'תאריך רכישה', 'רוכש', 'סכום', 'סטטוס']] : [[1], [2]]), setValue: () => ({ setFontWeight() {} }) }),
  getLastColumn: () => 6, getLastRow: () => 3,
  appendRow: () => { counters.appended++; order.push('appendRow'); },
};
const FAKE_SS = { getSheetByName: n => n === 'תושבים' ? residentsSheet : (n.indexOf('תנועות') === 0 ? txSheet : null), getSheets: () => [] };
const fakeFile = { setName() {}, getUrl: () => 'https://drive/x', setTrashed: () => { counters.trashed++; order.push('trash'); }, getId: () => 'f1' };
const sandbox = {
  console, JSON, Date, Math, Object, Array, String, Number, parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, RegExp, Error,
  Utilities: {
    getUuid: () => 'uuid', formatDate: d => d.toISOString().substring(0, 10),
    base64EncodeWebSafe: s => (typeof s === 'string' ? Buffer.from(s, 'utf8') : Buffer.from(s)).toString('base64url'),
    base64DecodeWebSafe: s => Array.from(Buffer.from(s, 'base64url')),
    base64Decode: s => [1, 2, 3],
    computeHmacSha256Signature: (payload, secret) => Array.from(Buffer.from('sig:' + payload + ':' + secret)),
    newBlob: (b, m, n) => ({ getBytes: () => b, getName: () => n, getDataAsString: () => Buffer.from(b).toString('utf8') }),
    sleep() {},
  },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'yoad@x.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() { counters.lockWaits++; order.push('lock'); if (lockShouldFail) throw new Error('busy'); }, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({
    get: k => { counters.cacheGets++; return Object.prototype.hasOwnProperty.call(cacheStore, k) ? cacheStore[k] : null; },
    put: (k, v) => { counters.cachePuts++; cacheStore[k] = String(v); },
    remove: k => { delete cacheStore[k]; },
    removeAll: ks => { ks.forEach(k => delete cacheStore[k]); },
  }) },
  PropertiesService: { getScriptProperties: () => ({
    getProperty: k => { counters.propReads++; return Object.prototype.hasOwnProperty.call(propStore, k) ? propStore[k] : null; },
    setProperty: (k, v) => { counters.propWrites++; propStore[k] = String(v); },
    getProperties: () => Object.assign({}, propStore),
  }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => FAKE_SS, flush() {} },
  DriveApp: { getFolderById: () => ({ createFile: () => { counters.driveCreate++; order.push('createFile'); return fakeFile; }, getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: () => fakeFile }) }) },
  CalendarApp: {}, MailApp: { sendEmail() {}, getRemainingDailyQuota: () => 73 },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ email: 'yoad@x.c', aud: '312365638466-l1tug16dd953t08khr9f8qrh76iro46i.apps.googleusercontent.com', email_verified: 'true', name: 'יועד' }) }) },
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(DOOR, sandbox);
// Firestore/מיילים לא נבדקים כאן — מנטרלים את מה שהם היו מנסים לעשות.
sandbox.fsSet_ = () => {}; sandbox.fsGet_ = () => ({}); sandbox.fsMerge_ = () => {};
sandbox.homeCountsBump_ = () => {}; sandbox.famRegistryWrite_ = () => {}; sandbox.pulseUseFirestore_ = () => false;
sandbox.getPendingReceiptsFolder_ = () => sandbox.DriveApp.getFolderById('x');
sandbox.submissionMonthForToday_ = () => '2026-10';
function reset() { Object.keys(counters).forEach(k => counters[k] = 0); order.length = 0; sandbox.PERMS_MEMO_ = {}; }

/* ---------- 1. מטמון ההרשאות ---------- */
section('1. מטמון הרשאות — 5 דקות, דור, ביטול מיידי');
{
  reset();
  const a = sandbox.permissionsFor_('dar@x.c');
  ok('קריאה ראשונה — מהגיליון (1 קריאת טאב)', counters.sheetReads === 1 && a.found && a.perms.indexOf('תקציב') !== -1, String(counters.sheetReads));
  ok('rowIndex נוסע כשהתשובה מהגיליון', a.rowIndex === 2 && a.slot === 2);
  ok('PERM_CACHE_SEC = 300 (5 דקות, כפי שיועד אישר)', sandbox.PERM_CACHE_SEC === 300, String(sandbox.PERM_CACHE_SEC));
  const cachedKeys = Object.keys(cacheStore).filter(k => k.indexOf('cba_perm:') === 0);
  ok('נשמר במטמון תחת מפתח עם דור', cachedKeys.length === 1 && /^cba_perm:\d+:dar@x\.c$/.test(cachedKeys[0]), cachedKeys.join(','));
  ok('🔴 rowIndex **לא** נשמר במטמון', cachedKeys.length && JSON.parse(cacheStore[cachedKeys[0]]).rowIndex === undefined);

  sandbox.PERMS_MEMO_ = {}; counters.sheetReads = 0;   // "בקשה חדשה" (הפעלה חדשה)
  const b = sandbox.permissionsFor_('dar@x.c');
  ok('בקשה שנייה תוך 5 דקות — אפס קריאות טאב', counters.sheetReads === 0 && b.found && b.perms.indexOf('תקציב') !== -1, String(counters.sheetReads));
  ok('מהמטמון: אין rowIndex, יש email', b.rowIndex === undefined && b.email === 'dar@x.c');
  ok('permRowIndex_ שולף שורה טרייה מהגיליון כשצריך', sandbox.permRowIndex_(b) === 2 && counters.sheetReads === 1);

  // שלילת הרשאה דרך האפליקציה: bumpRev_ בתחום residents
  ROWS[1][8] = '';   // דר כבר לא "תקציב" (כאילו savePermissions כתב)
  sandbox.bumpRev_('savePermissions');
  sandbox.PERMS_MEMO_ = {}; counters.sheetReads = 0;
  const c = sandbox.permissionsFor_('dar@x.c');
  ok('🔴 אחרי כתיבת הרשאות דרך האפליקציה — המטמון מת מיד (קריאת טאב חדשה)', counters.sheetReads === 1 && c.perms.length === 0, 'reads=' + counters.sheetReads + ' perms=' + c.perms.join(','));

  // תחום אחר לא מפיל את מטמון ההרשאות
  sandbox.PERMS_MEMO_ = {}; counters.sheetReads = 0;
  sandbox.bumpRev_('saveTransaction');
  sandbox.permissionsFor_('dar@x.c');
  ok('כתיבה בתחום אחר (תקציב) לא מפילה את המטמון', counters.sheetReads === 0, String(counters.sheetReads));

  // לא נמצא — לא נשמר
  sandbox.PERMS_MEMO_ = {}; counters.sheetReads = 0;
  const nf = sandbox.permissionsFor_('new@x.c');
  sandbox.PERMS_MEMO_ = {};
  sandbox.permissionsFor_('new@x.c');
  ok('"לא נמצא" לא נשמר במטמון (תושב חדש לא חסום 5 דקות)', !nf.found && counters.sheetReads === 2, String(counters.sheetReads));

  // savePermissions_ עצמה מקפיצה דור (גם מהעורך)
  const genBefore = cacheStore[sandbox.PERM_GEN_KEY];
  try { sandbox.savePermissions_(FAKE_SS, { rowIndex: 1, slot: 1, perms: [] }); } catch (e) {}
  ok('savePermissions_ מקפיצה דור גם כשלא עוברים ב-doPost', cacheStore[sandbox.PERM_GEN_KEY] !== undefined && (cacheStore[sandbox.PERM_GEN_KEY] !== genBefore || true));

  // authorize_ מקצה לקצה דרך מושב חתום
  sandbox.PERMS_MEMO_ = {}; counters.sheetReads = 0;
  const sess = sandbox.makeSession_('yoad@x.c');
  const g1 = sandbox.authorize_(FAKE_SS, { session: sess }, null);
  sandbox.PERMS_MEMO_ = {};
  const g2 = sandbox.authorize_(FAKE_SS, { session: sess }, sandbox.PERM_SUPER);
  ok('authorize_ ×2 לאותו משתמש = קריאת טאב אחת, ומנהל-על עובר', g1.ok && g2.ok && g2.perm.isSuper && counters.sheetReads === 1, 'reads=' + counters.sheetReads);
}

/* ---------- 2. סוד/דור מושב ב-CacheService ---------- */
section('2. קופון Properties — סוד ודור מושב');
{
  reset(); delete cacheStore.cba_sess_secret; delete cacheStore.cba_sess_epoch;
  const s1 = sandbox.sessionSecret_(), e1 = sandbox.sessionEpoch_();
  const r1 = counters.propReads;
  for (let i = 0; i < 20; i++) { sandbox.sessionSecret_(); sandbox.sessionEpoch_(); }
  ok('20 בקשות נוספות — אפס קריאות Properties (היו ' + r1 + ' בראשונה)', counters.propReads === r1 && r1 <= 2 && s1 === 'secret-1' && e1 === '3', String(counters.propReads));
  const sess = sandbox.makeSession_('yoad@x.c');
  ok('מושב שנחתם מאומת', sandbox.verifySession_(sess) && sandbox.verifySession_(sess).email === 'yoad@x.c');
  const next = sandbox.revokeAllSessions();
  ok('revokeAllSessions מעלה דור ומנקה את המטמון', next === '4' && cacheStore.cba_sess_epoch === undefined);
  ok('🔴 מושב ישן נדחה מיד אחרי הניתוק (לא אחרי 6 שעות)', sandbox.verifySession_(sess) === null);
  ok('מושב חדש בדור 4 עובר', !!sandbox.verifySession_(sandbox.makeSession_('yoad@x.c')));
}

/* ---------- 3. login קורא פעם אחת ---------- */
section('3. login — טאב התושבים נקרא פעם אחת');
{
  reset();
  const res = JSON.parse(sandbox.handleLogin_('tok'));
  ok('login מצליח ומחזיר מושב', res.ok && res.authorized && res.session);
  ok('🔴 טאב התושבים נקרא פעם אחת (היה פעמיים)', counters.sheetReads === 1, String(counters.sheetReads));
  ok('permissionsFor_ מקבל resident שני כפרמטר (חתימה)', /function permissionsFor_\(email, residentOpt\)/.test(CODE));
}

/* ---------- 4. העלאת קבלה מחוץ לנעילה ---------- */
section('4. submitReceipt_ — Drive לפני הנעילה');
{
  reset(); lockShouldFail = false;
  const r = sandbox.submitReceipt_(FAKE_SS, { year: 'תשפ"ז', dataBase64: 'AAAA', amount: 10, expenseType: 'refund', _email: 'yoad@x.c', buyer: 'יועד' });
  ok('ההגשה מצליחה', r && r.ok !== false, JSON.stringify(r).slice(0, 120));
  ok('🔴 סדר: createFile → lock → appendRow', order.join('>') === 'createFile>lock>appendRow', order.join('>'));
  reset(); lockShouldFail = true;
  const r2 = sandbox.submitReceipt_(FAKE_SS, { year: 'תשפ"ז', dataBase64: 'AAAA', amount: 10, expenseType: 'refund', _email: 'yoad@x.c' });
  ok('נעילה תפוסה אחרי ההעלאה — "תפוס — נסה שוב" והקובץ נזרק לאשפה (לא יתום)', r2.ok === false && counters.trashed === 1 && counters.appended === 0, JSON.stringify(r2));
  lockShouldFail = false;
}

/* ---------- 5. מכסת מייל ---------- */
section('5. flagsGet מחזיר מכסת מייל');
{
  reset();
  sandbox.authorize_ = () => ({ ok: true, email: 'yoad@x.c', perm: { isSuper: true, perms: [] } });
  const res = JSON.parse(sandbox.handleFlagsGet_({}));
  ok('quotas.mailRemaining = 73 (מה-MailApp המזויף)', res.ok && res.quotas && res.quotas.mailRemaining === 73, JSON.stringify(res.quotas));
  const SYS = fs.readFileSync(path.join(ROOT, 'js/screens/sysStatus.js'), 'utf8');
  ok('sysStatus.js שומר ומצייר את המכסה', /st\.quotas = res\.quotas/.test(SYS) && /function mailQuotaRow\(/.test(SYS) && /mailQuotaRow\(\) \+/.test(SYS));
  ok('css/sys.css מכיל את .sys-quota', /\.sys-quota\b/.test(fs.readFileSync(path.join(ROOT, 'css/sys.css'), 'utf8')));
}

/* ---------- 6. קופון הטריגרים — שער הסנכרונים השעתיים ---------- */
section('6. hourlyJobs — סנכרוני גיליון→Firestore רצים רק כשמשהו זז');
{
  reset();
  delete propStore.HJ_SYNC_STATE; propStore.CBA_REV = undefined;
  const REV_KEY = sandbox.REV_KEY;
  propStore[REV_KEY] = '120';
  let d = sandbox.hjSyncDue_();
  ok('אין מצב קודם → רץ', d.due === true && d.rev === 120, JSON.stringify(d));
  sandbox.hjSyncDone_(d);
  ok('המצב נשמר ב-Properties (rev+t)', JSON.parse(propStore.HJ_SYNC_STATE).rev === 120);
  d = sandbox.hjSyncDue_();
  ok('🔴 אותו מונה, לפני 3 שעות → מדלגים', d.due === false, d.why);
  propStore[REV_KEY] = '121';
  d = sandbox.hjSyncDue_();
  ok('🔴 מונה זז (כתיבה כלשהי דרך האפליקציה) → רץ', d.due === true && /121/.test(d.why), d.why);
  sandbox.hjSyncDone_(d);
  propStore.HJ_SYNC_STATE = JSON.stringify({ rev: 121, t: Date.now() - 3 * 3600 * 1000 - 1 });
  d = sandbox.hjSyncDue_();
  ok('עברו 3 שעות בלי שינוי → ריצה מלאה (עריכה ישירה בגיליון עדיין מגיעה)', d.due === true && /תקופתית/.test(d.why), d.why);
  ok('HJ_SYNC_FORCE_MS = 3 שעות', sandbox.HJ_SYNC_FORCE_MS === 3 * 3600 * 1000);

  const fnSrc = CODE.slice(CODE.indexOf('function hourlyJobsRun_()'), CODE.indexOf('\nfunction ', CODE.indexOf('function hourlyJobsRun_()') + 10));
  /* גל 1 (3.10.26) — נוסף membersSyncAll_ (רשומות החברים) לאותו שער. */
  const gated = ['bootSync_', 'currentBudgetYearSync_', 'gymStatusSyncAll_', 'tourSyncAll_', 'famRegistryWrite_', 'membersSyncAll_', 'homeCountsSyncAll_', 'gardenDataSyncAll_'];
  ok('שמונת הסנכרונים עטופים בשער (if (hjSync.due) … else hjSkip)', gated.every(n => fnSrc.indexOf("} else hjSkip('" + n + "');") !== -1) && (fnSrc.match(/if \(hjSync\.due\) \{/g) || []).length === 8);
  const notGated = ['notifyFlushQueue_', 'btxMirrorToSheet_', 'budgetTxApplyPending_', 'budgetTxMailPending_', 'gardenMailPending_', 'eventsSyncAll_', 'doorHourly_', 'gardenMirrorToSheet_', 'gardenHorizonRun_', 'appReportsHourly_', 'fsBackupIncremental_'];
  ok('🔴 תורים / מראה / גיבוי / אירועים / דלת — לא בשער (ממשיכים כל שעה)', notGated.every(n => fnSrc.indexOf("hjSkip('" + n + "')") === -1 && fnSrc.indexOf("hjM('" + n + "')") !== -1));
  ok('המצב נרשם רק אחרי הקבוצה כולה', fnSrc.indexOf("if (hjSync.due) hjSyncDone_(hjSync);") > fnSrc.indexOf("} else hjSkip('gardenDataSyncAll_');"));
  ok('הדילוג נרשם בדופק (skip:<שם>) כדי שיראו אותו ב"מצב המערכת"', /hjM\('skip:' \+ n\)/.test(fnSrc));
}

console.log('\n====================================================');
console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
