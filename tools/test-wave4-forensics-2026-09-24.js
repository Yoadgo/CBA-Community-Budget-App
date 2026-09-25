/* בדיקות גל 4 — כלי תחקור + דיווחים ב-Firestore (24.9.2026)
   הרצה:  node tools/test-wave4-forensics-2026-09-24.js

   🔴 מה המארז הזה שומר עליו:
   1. **כללי האבטחה של appReports** — פורט 1:1 ל-JS (אמולטור Firestore חסום
      ברשת של סביבת הבנייה). הציפיות נרשמו **לפני** ההרצה. בנוסף: רשימת
      השדות שהלקוח כותב = בדיוק הרשימה שהכלל מתיר (נקרא מהקובץ עצמו).
   2. **נפילה לאחור בכתיבה** — כל כשל לפני שהמסמך נכתב שולח במסלול הישן.
   3. **שום שם/מייל במסמך.**
   4. **יומן הדופק** — נשמר, מוגבל ל-24 ריצות ולגודל ערך של Script Properties.
   5. **אידמפוטנטיות** — מייל למנהלים יוצא פעם אחת גם כשהדפדפן והסריקה
      השעתית רצים על אותו דיווח.
   6. **אפס עלות למסלולים הקיימים** — פעולות התחקור נקראות רק ממסך התחקור. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

const RULES = R('firestore.rules');
const DS = R('js/data/dataService.js');
const GS = R('apps-script/Code.gs');
const DIAG = R('apps-script/Diag.gs');

/* ======================= 1. כללים ======================= */
section('1. כללי appReports — צורה');
const block = RULES.slice(RULES.indexOf('function arCreateFields()'), RULES.indexOf('match /appReports/{docId}') + 400);
ok('הבלוק קיים', block.length > 1000);
ok('קריאה: מנהל-על בלבד', /allow read: if arReadOk\(\);/.test(block) && /function arReadOk\(\) \{\s*return isSuper\(\);/.test(block));
ok('אין מחיקה לאיש', /match \/appReports\/\{docId\} \{[\s\S]*allow delete: if false;/.test(block));
ok('יצירה ולא write', /allow create: if arCreateOk\(docId\);/.test(block) && !/allow write/.test(block.slice(block.indexOf('match /appReports'))));
ok('חיצוני חסום ביצירה', /function arCreateOk[\s\S]{0,200}m\(\)\.isExternal == false/.test(block));
ok('uid ומשפחה = שלך', /request\.resource\.data\.uid == request\.auth\.uid/.test(block) && /request\.resource\.data\.familyId == myFamilyId\(\)/.test(block));
ok('createdAt = שעון השרת', /request\.resource\.data\.createdAt == request\.time/.test(block));

const fieldsRule = (block.match(/function arCreateFields\(\) \{\s*return \[([\s\S]*?)\];/) || [])[1] || '';
const ruleFields = (fieldsRule.match(/'([A-Za-z]+)'/g) || []).map(s => s.replace(/'/g, '')).sort();
const dsDoc = DS.slice(DS.indexOf('function submitAppReportFs'), DS.indexOf('function tsIso'));
const docBody = (dsDoc.match(/var doc = \{([\s\S]*?)\};/) || [])[1] || '';
const clientFields = (docBody.match(/(?:^|[\s,{])([A-Za-z]+):/g) || []).map(s => s.replace(/[\s,{:]/g, '')).sort();
ok('🔴 השדות שהלקוח כותב = בדיוק הרשימה שהכלל מתיר', JSON.stringify(ruleFields) === JSON.stringify(clientFields),
   'rule=' + ruleFields.join(',') + ' | client=' + clientFields.join(','));
ok('🔒 אין name/email/phone ברשימה', !ruleFields.some(f => /name|email|mail$|phone/i.test(f) && f !== 'mailPending'));

section('1ב. כללי appReports — התנהגות (פורט 1:1, ציפיות נרשמו מראש)');
/* הפורט: כל פונקציה בכלל ↔ פונקציה כאן, באותו סדר. */
const members = {
  res1: { active: true, isExternal: false, perms: [], familyId: 'f1' },
  res2: { active: true, isExternal: false, perms: [], familyId: 'f2' },
  ext:  { active: true, isExternal: true, perms: ['גינון'], familyId: '' },
  sup:  { active: true, isExternal: false, perms: ['על'], familyId: 'f9' },
  bud:  { active: true, isExternal: false, perms: ['תקציב'], familyId: 'f3' },
  gone: { active: false, isExternal: false, perms: [], familyId: 'f4' }
};
const TIME = { __time: 1 };
const CREATE_FIELDS = ruleFields;
function rulesFor(uid) {
  const m = () => members[uid];
  const isMember = () => !!uid && !!m() && m().active === true;
  const isSuper = () => isMember() && m().perms.includes('על');
  const myFamilyId = () => isMember() ? m().familyId : '';
  const keys = d => Object.keys(d);
  const strOk = (d, f, max) => !(f in d) || (typeof d[f] === 'string' && d[f].length <= max);
  const textOk = d => strOk(d, 'screen', 200) && strOk(d, 'ver', 60) && strOk(d, 'srvVer', 60) && strOk(d, 'ua', 300) &&
    strOk(d, 'perms', 200) && strOk(d, 'year', 40) && strOk(d, 'net', 80) && strOk(d, 'dialog', 200) &&
    strOk(d, 'errors', 2500) && strOk(d, 'trail', 2500) && strOk(d, 'extra', 500);
  const shapeOk = (d, id) => keys(d).every(k => CREATE_FIELDS.includes(k)) &&
    ['id', 'uid', 'familyId', 'kind', 'items', 'photos', 'mailPending', 'mirrorPending', 'createdAt', 'schema'].every(k => k in d) &&
    d.id === id && ['תקלה', 'ייעול'].includes(d.kind) && Array.isArray(d.items) && d.items.length >= 1 && d.items.length <= 5 &&
    typeof d.items[0] === 'string' && d.items[0].length <= 300 && Array.isArray(d.photos) && d.photos.length === 0 &&
    (!('photosExpected' in d) || (Number.isInteger(d.photosExpected) && d.photosExpected >= 0 && d.photosExpected <= 3)) &&
    (!('photosIncomplete' in d) || typeof d.photosIncomplete === 'boolean') &&
    d.mailPending === true && d.mirrorPending === true && d.createdAt === TIME && Number.isInteger(d.schema) && textOk(d);
  const affected = (b, a) => { const s = new Set(); Object.keys(a).forEach(k => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) s.add(k); }); Object.keys(b).forEach(k => { if (!(k in a)) s.add(k); }); return [...s]; };
  return {
    read: () => isSuper(),
    create: (id, d, exists) => !exists && isMember() && m().isExternal === false && d.uid === uid && d.familyId === myFamilyId() && shapeOk(d, id),
    update: (b, a) => {
      const aff = affected(b, a);
      const photosOk = isMember() && b.uid === uid && aff.every(k => ['photos', 'photosIncomplete'].includes(k)) &&
        Array.isArray(a.photos) && a.photos.length <= 3 && typeof a.photosIncomplete === 'boolean';
      const adminOk = isSuper() && aff.every(k => ['done', 'doneAt', 'reply', 'replyLast', 'replyAt', 'replyPending', 'mirrorPending'].includes(k)) &&
        (!('done' in a) || typeof a.done === 'boolean') && (!('reply' in a) || (typeof a.reply === 'string' && a.reply.length <= 4000)) &&
        (!('replyLast' in a) || (typeof a.replyLast === 'string' && a.replyLast.length <= 1000)) &&
        (!('replyPending' in a) || typeof a.replyPending === 'boolean') && a.mirrorPending === true;
      return photosOk || adminOk;
    },
    del: () => false
  };
}
/* ⚠️ אימות-עצמי של הפורט: כל פונקציה ב-JS קיימת בכלל האמיתי. */
ok('הפורט מכסה את כל חמש פונקציות הכלל', ['arStrOk', 'arTextOk', 'arShapeOk', 'arCreateOk', 'arPhotosOk', 'arAdminOk', 'arReadOk'].every(f => block.indexOf('function ' + f) !== -1));
const good = (u, fam, id) => ({ id, uid: u, familyId: fam, kind: 'תקלה', items: ['לא עובד'], screen: 'בית', ver: 'v', srvVer: '', ua: 'Safari', perms: 'תושב', year: '', net: 'מקוון', dialog: '', errors: '', trail: '', extra: '', photos: [], photosExpected: 0, photosIncomplete: false, mailPending: true, mirrorPending: true, createdAt: TIME, schema: 1 });
const existing = { id: '5', uid: 'res1', familyId: 'f1', kind: 'תקלה', items: ['x'], photos: [], mailPending: false, mirrorPending: false, schema: 1 };
const E = [
  ['תושב יוצר דיווח בשמו', true, () => rulesFor('res1').create('11', good('res1', 'f1', '11'))],
  ['⛔ uid של אחר', false, () => rulesFor('res1').create('12', good('res2', 'f1', '12'))],
  ['⛔ משפחה של אחר', false, () => rulesFor('res1').create('13', good('res1', 'f2', '13'))],
  ['⛔ מזהה מסמך ≠ id', false, () => rulesFor('res1').create('14', good('res1', 'f1', '99'))],
  ['⛔ שדה צוות ביצירה (done)', false, () => rulesFor('res1').create('15', Object.assign(good('res1', 'f1', '15'), { done: true }))],
  ['⛔ מייל במסמך', false, () => rulesFor('res1').create('16', Object.assign(good('res1', 'f1', '16'), { email: 'a@b.c' }))],
  ['⛔ סוג לא מוכר', false, () => rulesFor('res1').create('17', Object.assign(good('res1', 'f1', '17'), { kind: 'אחר' }))],
  ['⛔ שישה סעיפים', false, () => rulesFor('res1').create('18', Object.assign(good('res1', 'f1', '18'), { items: ['1', '2', '3', '4', '5', '6'] }))],
  ['⛔ שגיאות ארוכות מדי', false, () => rulesFor('res1').create('19', Object.assign(good('res1', 'f1', '19'), { errors: 'x'.repeat(2600) }))],
  ['⛔ mailPending=false', false, () => rulesFor('res1').create('20', Object.assign(good('res1', 'f1', '20'), { mailPending: false }))],
  ['⛔ תמונות מראש', false, () => rulesFor('res1').create('21', Object.assign(good('res1', 'f1', '21'), { photos: ['abc'] }))],
  ['⛔ גנן חיצוני', false, () => rulesFor('ext').create('22', good('ext', '', '22'))],
  ['⛔ חבר לא פעיל', false, () => rulesFor('gone').create('23', good('gone', 'f4', '23'))],
  ['⛔ אורח', false, () => rulesFor(null).create('24', good(null, '', '24'))],
  ['⛔ דריסת דיווח קיים', false, () => rulesFor('res1').create('5', good('res1', 'f1', '5'), true)],
  ['מנהל-על קורא', true, () => rulesFor('sup').read()],
  ['⛔ תושב קורא (גם את שלו)', false, () => rulesFor('res1').read()],
  ['⛔ מנהל תקציב קורא', false, () => rulesFor('bud').read()],
  ['⛔ גנן חיצוני קורא', false, () => rulesFor('ext').read()],
  ['המדווח משלים תמונות', true, () => rulesFor('res1').update(existing, Object.assign({}, existing, { photos: ['a', 'b'], photosIncomplete: false }))],
  ['⛔ אחר משלים תמונות', false, () => rulesFor('res2').update(existing, Object.assign({}, existing, { photos: ['z'], photosIncomplete: false }))],
  ['⛔ המדווח מסמן טופל', false, () => rulesFor('res1').update(existing, Object.assign({}, existing, { done: true, mirrorPending: true }))],
  ['⛔ המדווח עורך טקסט', false, () => rulesFor('res1').update(existing, Object.assign({}, existing, { items: ['שונה'] }))],
  ['⛔ ארבע תמונות', false, () => rulesFor('res1').update(existing, Object.assign({}, existing, { photos: ['1', '2', '3', '4'], photosIncomplete: false }))],
  ['מנהל-על מסמן טופל', true, () => rulesFor('sup').update(existing, Object.assign({}, existing, { done: true, doneAt: TIME, mirrorPending: true }))],
  ['מנהל-על עונה', true, () => rulesFor('sup').update(existing, Object.assign({}, existing, { reply: 'תודה', replyLast: 'תודה', replyAt: TIME, replyPending: true, mirrorPending: true }))],
  ['⛔ מנהל-על בלי mirrorPending', false, () => rulesFor('sup').update(existing, Object.assign({}, existing, { done: true }))],
  ['⛔ מנהל-על עורך את דברי המדווח', false, () => rulesFor('sup').update(existing, Object.assign({}, existing, { items: ['שונה'], mirrorPending: true }))],
  ['⛔ מנהל-על מוריד mailPending', false, () => rulesFor('sup').update(Object.assign({}, existing, { mailPending: true }), Object.assign({}, existing, { mailPending: false, mirrorPending: true }))],
  ['⛔ מנהל תקציב מסמן טופל', false, () => rulesFor('bud').update(existing, Object.assign({}, existing, { done: true, mirrorPending: true }))],
  ['⛔ מחיקה, גם למנהל-על', false, () => rulesFor('sup').del()]
];
E.forEach(([n, want, f]) => ok(n, f() === want));

/* ======================= 2. לקוח — שליחה ======================= */
section('2. שליחה מהדפדפן — Firestore, ונפילה לאחור בכל כשל');
function makeClient(opts) {
  const calls = { legacy: 0, created: null, merged: null, posts: [] };
  const sb = { console, setTimeout, clearTimeout, Date, JSON, Math, Object, Array, String, Number, isNaN, parseInt, isFinite };
  sb.window = sb;
  sb.CBA = {
    user: opts.user || { familyId: 'f1' },
    sheets: {
      postRead: (a, p, cb) => { calls.posts.push(a); if (a === 'submitAppReport') calls.legacy++; if (a === 'appReportPhotoOne') return cb(opts.photoFail ? { ok: false } : { ok: true, id: 'drv' + calls.posts.length }); cb({ ok: true, id: 900 }); },
      get: (p, cb) => cb({ ok: true, rows: [] })
    },
    fb: {
      createDoc: (c, id, d, cb) => { calls.created = { c, id, d }; cb(opts.createErr || null); },
      mergeDoc: (c, id, d, cb) => { calls.merged = { c, id, d }; cb(null); },
      nextId: (k, cb) => cb(opts.nextErr || null, opts.nextErr ? null : 41),
      userReady: cb => cb(opts.noUser ? null : { uid: 'u1' }),
      ensureDb: cb => cb(opts.dbErr || null),
      flag: (k, d) => (opts.flags && k in opts.flags) ? opts.flags[k] : d,
      uid: () => 'u1', serverNow: () => 'TS', readCollection: (c, cb) => cb(null, []),
      isDbReady: () => true
    },
    diag: { error: () => {} }
  };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  return { sb, calls };
}
function submit(opts, payload) {
  const c = makeClient(opts);
  let res;
  c.sb.CBA.data.submitAppReport(Object.assign({ kind: 'תקלה', items: ['לא עובד'], screen: 'בית', photos: [] }, payload || {}), r => { res = r; });
  return { res, calls: c.calls };
}
let s1 = submit({});
ok('נכתב ל-appReports עם המזהה מהמונה', s1.calls.created && s1.calls.created.c === 'appReports' && s1.calls.created.id === '41');
ok('התושב מקבל מספר מיד', s1.res && s1.res.ok && s1.res.id === '41');
ok('🔒 אין שם/מייל במסמך', s1.calls.created && !Object.keys(s1.calls.created.d).some(k => /name|email|phone/i.test(k)));
ok('uid ומשפחה על המסמך', s1.calls.created.d.uid === 'u1' && s1.calls.created.d.familyId === 'f1');
ok('המייל יוצא ברקע (appReportNotify)', s1.calls.posts.includes('appReportNotify'));
ok('לא נשלח במסלול הישן', s1.calls.legacy === 0);
ok('נפילה: אין מונה → מסלול ישן', submit({ nextErr: 'no-counter' }).calls.legacy === 1);
ok('נפילה: יצירה נדחתה → מסלול ישן', submit({ createErr: { code: 'permission-denied' } }).calls.legacy === 1);
ok('נפילה: אין משתמש Firebase → מסלול ישן', submit({ noUser: true }).calls.legacy === 1);
ok('נפילה: אין חיבור → מסלול ישן', submit({ dbErr: 'x' }).calls.legacy === 1);
ok('הדגל כבוי → מסלול ישן', submit({ flags: { appReportsFromFirestore: false } }).calls.legacy === 1);
ok('גנן חיצוני → מסלול ישן (השרת מחליט)', submit({ user: { isExternal: true } }).calls.legacy === 1);
const s2 = submit({}, { photos: [{ data: 'AA' }, { data: 'BB' }] });
ok('עם תמונות: קודם העלאה, אחר כך המייל', s2.calls.posts.indexOf('appReportPhotoOne') < s2.calls.posts.indexOf('appReportNotify'));
ok('ומזהי התמונות נשמרים במסמך', s2.calls.merged && s2.calls.merged.d.photos.length === 2 && s2.calls.merged.d.photosIncomplete === false);
const s3 = submit({ photoFail: true }, { photos: [{ data: 'AA' }] });
ok('תמונה שנכשלה משאירה photosIncomplete דלוק', s3.calls.merged && s3.calls.merged.d.photosIncomplete === true);
ok('photosExpected נרשם מראש', s2.calls.created.d.photosExpected === 2 && s2.calls.created.d.photosIncomplete === true);

section('2ב. "טופל" ותשובה — לאותו מקור שממנו נקראה השורה');
{
  const c = makeClient({});
  let out;
  c.sb.CBA.data.setAppReportState({ id: '5', src: 'fs', reply: 'ישנה' }, true, 'חדשה', r => { out = r; });
  ok('נכתב ל-Firestore', c.calls.merged && c.calls.merged.c === 'appReports' && c.calls.merged.id === '5');
  ok('mirrorPending דלוק (הכלל דורש)', c.calls.merged.d.mirrorPending === true);
  ok('התשובות נצברות', c.calls.merged.d.reply === 'ישנה\n---\nחדשה' && c.calls.merged.d.replyLast === 'חדשה' && c.calls.merged.d.replyPending === true);
  ok('ואז מייל/מראה ברקע', c.calls.posts.includes('appReportReplyNotify'));
  const c2 = makeClient({});
  c2.sb.CBA.data.setAppReportState({ id: '7', src: 'sheet' }, true, '', () => {});
  ok('שורה מהגיליון → המסלול הישן', c2.calls.posts.includes('setAppReportDone') && !c2.calls.merged);
}

/* ======================= 3. שרת — Diag.gs ======================= */
section('3. יומן הדופק');
function gasSandbox() {
  const store = {};
  const sb = {
    console, JSON, Math, Date, Object, Array, String, Number, isNaN, parseInt, encodeURIComponent,
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in store ? store[k] : null), setProperty: (k, v) => { if (String(v).length > 9216) throw new Error('too big'); store[k] = String(v); } }) },
    MailApp: { getRemainingDailyQuota: () => 1400 },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    Utilities: { formatDate: (d, tz, f) => d.toISOString().slice(0, 16) },
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) }
  };
  vm.createContext(sb);
  vm.runInContext(DIAG, sb);
  return { sb, store };
}
{
  const { sb, store } = gasSandbox();
  for (let i = 0; i < 30; i++) {
    const H = sb.hjStart_();
    H.t0 -= 300000; H.last = H.t0;
    ['btxMirrorToSheet_', 'gardenMirrorToSheet_', 'fsBackupIncremental_', 'eventsSyncAll_', 'gymStatusSyncAll_', 'tourSyncAll_', 'homeCountsSyncAll_', 'bootSync_'].forEach((n, k) => { H.last -= 0; sb.hjMark_(H, n); H.last -= 20000; });
    sb.hjFail_(H, new Error('בדיקה'));
    sb.hjSave_(H, { mail: 3, push: 1 });
  }
  const P = sb.diagPulseRead_();
  ok('נשמרות 24 ריצות בדיוק', P.runs.length === 24, String(P.runs.length));
  ok('🔴 מתחת לתקרת 9KB של Script Properties', store.DIAG_PULSE.length <= 8500, String(store.DIAG_PULSE.length));
  ok('פירוק מלא לריצה האחרונה', P.last && P.last.st.length >= 8 && P.last.q === 1400);
  ok('כשלים נספרים', P.runs[P.runs.length - 1].f === 1);
  ok('מונים של מיילים ופוש', P.runs[P.runs.length - 1].m === 3 && P.runs[P.runs.length - 1].p === 1);
  sb.hjSkipped_('נעילה תפוסה');
  ok('ריצה שדולגה נרשמת', sb.diagPulseRead_().runs.slice(-1)[0].skip === 1);
  const line = sb.diagPulseLine_();
  ok('שורת הדופק לדיווח', /ריצה שעתית אחרונה/.test(line) && /מכסת מייל/.test(line), line);
}
{
  const { sb } = gasSandbox();
  ok('בלי נתונים — שורה מנומסת ולא שגיאה', /אין עדיין/.test(sb.diagPulseLine_()));
}

section('3ב. מייל על דיווח חדש — פעם אחת בלבד');
{
  const { sb } = gasSandbox();
  const docs = { 'appReports/41': { id: '41', uid: 'u1', familyId: 'f1', kind: 'תקלה', items: ['x'], mailPending: true, mirrorPending: true, photos: [] } };
  let mails = 0, appended = 0;
  Object.assign(sb, {
    fsGet_: p => docs[p] ? JSON.parse(JSON.stringify(docs[p])) : null,
    fsMerge_: (p, o) => { Object.assign(docs[p], o); },
    fsDocPath_: (c, id) => c + '/' + id,
    notifyAdmins_: () => { mails++; },
    ensureAppReportsSheet_: () => sheet,
    gardenCols_: () => ({ 'מזהה': 0, 'תאריך': 1, 'מייל': 2, 'שם': 3, 'סוג': 4, 'סעיפים': 5 }),
    gymUidByEmail_: () => ({ 'a@b.c': 'u1' }),
    permissionsFor_: () => ({ firstName: 'דנה', family: 'לוי' }),
    authorize_: () => ({ ok: true }), PERM_SUPER: 'על'
  });
  const rows = [['מזהה', 'תאריך', 'מייל', 'שם', 'סוג', 'סעיפים']];
  const sheet = {
    getLastColumn: () => 6, getLastRow: () => rows.length,
    getRange: (r, c, nr, nc) => ({ getValues: () => rows.slice(r - 1, r - 1 + (nr || 1)).map(x => x.slice(c - 1, c - 1 + (nc || 1))), setValue: () => {} }),
    appendRow: row => { appended++; rows.push(row); }
  };
  const r1 = sb.appReportNotify_({}, { id: '41' });
  const r2 = sb.appReportNotify_({}, { id: '41' });
  sb.fsQuery_ = () => [{ id: '41' }];
  sb.appReportsHourly_({});
  ok('המייל יצא פעם אחת', mails === 1, String(mails));
  ok('שורה אחת בגיליון', appended === 1, String(appended));
  ok('הדגלים ירדו', docs['appReports/41'].mailPending === false && docs['appReports/41'].mirrorPending === false);
  ok('הדופק נצמד לדיווח', typeof docs['appReports/41'].pulse === 'string');
  ok('🔒 השם והמייל הגיעו מהגיליון, לא מהמסמך', rows[1][2] === 'a@b.c' && /דנה/.test(rows[1][3]));
  ok('קריאה שנייה מדווחת "כבר נשלח"', r2 && r2.already === true);
  ok('מזהה לא מספרי נדחה', sb.appReportNotify_({}, { id: '../x' }).ok === false);
}

/* ======================= 4. חיווט השרת ======================= */
section('4. חיווט Code.gs');
ok('שלוש פעולות POST', /case 'appReportNotify':/.test(GS) && /case 'appReportReplyNotify':/.test(GS) && /case 'appReportPhotoOne':/.test(GS));
ok('התשובה — מנהל-על ב-ACTION_PERMS', /appReportReplyNotify: PERM_SUPER/.test(GS));
ok('🔒 notify/photo אינם ב-ACTION_PERMS (פתוחים לכל חבר, השער הכללי חוסם חיצוני)', !/\n\s*appReportNotify: PERM/.test(GS) && !/\n\s*appReportPhotoOne: PERM/.test(GS));
ok('שלוש פעולות GET — מנהל-על', /diagPulse: PERM_SUPER, diagCompare: PERM_SUPER, appReportsSeed: PERM_SUPER/.test(GS));
ok('הדגל ב-FLAG_KEYS', /'appReportsFromFirestore'/.test(GS));
ok('העבודה השעתית נמדדת — סימון לפני כל שלב', (GS.match(/hjM\('/g) || []).length >= 20);
ok('🔴 והמדידה אינה יכולה להפיל את העבודה (typeof)', /var HJ = \(typeof hjStart_ === 'function'\) \? hjStart_\(\) : null;/.test(GS));
ok('🔴 hjF קורא ל-hjFail_ ולא לעצמו (רקורסיה אינסופית בכל כשל שלב)',
   /var hjF = function \(e\) \{ if \(HJ\) hjFail_\(HJ, e\); \};/.test(GS) && !/var hjF = function \(e\) \{[^}]*hjF\(/.test(GS));
{
  /* ריצה אמיתית של העזרים על שלב שנכשל. */
  const src = GS.match(/  var HJ = \(typeof hjStart_[\s\S]*?var hjF = function \(e\) \{[^\n]*\n/)[0];
  const sb = { hjStart_: () => ({ fail: [] }), hjMark_: () => {}, hjFail_: (H, e) => H.fail.push(String(e)) };
  vm.createContext(sb);
  let okRun = false;
  try { vm.runInContext(src + 'hjF(new Error("x")); var __r = HJ.fail.length;', sb); okRun = sb.__r === 1; } catch (e) { okRun = false; }
  ok('🔴 כשל שלב נרשם פעם אחת ולא מפיל את העבודה', okRun);
}
ok('שלב הדיווחים לפני הגיבוי', GS.indexOf("hjM('appReportsHourly_')") < GS.indexOf("hjM('fsBackupIncremental_')"));
ok('המסלול הישן כותב גם מסמך', /appReportDocFromLegacy_\(id, \{/.test(GS));

/* ======================= 5. אפס עלות למסלולים הקיימים ======================= */
section('5. 🔴 הכלל: כלי תחקור לא רצים בטעינה, בניווט או ברענון');
const JS = ['js/app.js', 'js/data/sheets.js', 'js/data/firebase.js', 'js/screens/home.js', 'js/pwa.js'].map(R).join('\n');
ok('getDiagPulse לא נקרא מהאפליקציה עצמה', !/getDiagPulse/.test(JS));
ok('diagCompare לא נקרא מהאפליקציה עצמה', !/diagCompare/.test(JS));
ok('diag.pack לא נקרא בטעינה', !/diag\.pack/.test(JS));
const hub = R('js/screens/sysHub.js');
ok('יומן הדופק נטען רק כשפותחים את לשונית התחקור', /if \(tabId === "diag"\) \{[\s\S]{0,160}loadPulse/.test(hub));
ok('ההשוואה רק בלחיצה', /q\("#hub-cmp-go"\)\.addEventListener\("click", go\)/.test(hub));
const app = R('js/app.js');
ok('אריח אחד "ניהול מערכת"', /data-panel-goto="sysHub"/.test(app) && !/data-panel-goto="sysStatus"/.test(app) && !/data-panel-goto="appReports"/.test(app));
ok('מנהל תחום רואה רק "התראות"', /id: "notify",[^\n]*superOnly: false/.test(hub) && (hub.match(/superOnly: true/g) || []).length === 3);
const idx = R('index.html');
ok('sysHub.js נטען', /js\/screens\/sysHub\.js\?v=/.test(idx));
const vers = new Set((idx.match(/\?v=([0-9a-z]+)/g) || []));
ok('גרסה אחת בכל התגים', vers.size === 1, [...vers].join(','));
ok('ו-VERSION ב-service-worker זהה', R('service-worker.js').indexOf('var VERSION = "' + [...vers][0].slice(3) + '"') !== -1);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
