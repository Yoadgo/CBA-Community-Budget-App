/* ============================================================================
 *  test-wework-door-2026-09-25.js — דלת Nuki + WeWork   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  הרצה:  node tools/test-wework-door-2026-09-25.js
 *
 *  מריץ את apps-script/Door.gs בארגז חול עם Firestore/יומן/Nuki מזויפים,
 *  ובודק את מה שיכול להישבר **בשקט**:
 *    • תפוסה — העמדה הרביעית נדחית, כורסה נספרת בנפרד, מגבלת משפחה.
 *    • הדלת נפתחת רק למי שזכאי **עכשיו**, והכול נרשם ביומן.
 *    • הטוקן לעולם לא חוזר בתשובה, ו-live בלי טוקן = כבוי.
 *    • מסמכי Firestore בלי שם/מייל/טלפון.
 *    • התראות למנהל פעם אחת לכל מעבר מצב, לא בכל שעה.
 *  + בדיקות סטטיות לחיווט ב-Code.gs, בכללים, ב-app.js וב-index.html.
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DOOR = R('apps-script/Door.gs');
const RULES = R('firestore.rules');
const APP = R('js/app.js');
const IDX = R('index.html');
const SW = R('service-worker.js');

/* פונקציה אמיתית מ-Code.gs לפי שם — כך הבדיקה רצה על הלוגיקה של המכון עצמה. */
function grab(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i === -1) throw new Error('missing ' + name);
  let depth = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced ' + name);
}

/* ------------------------------------------------------------ ארגז חול --- */
function makeSandbox(opts) {
  opts = opts || {};
  const db = {};           // "coll/id" -> data
  const props = Object.assign({}, opts.props || {});
  const cache = {};
  const calEvents = {};
  const mails = [], admins = [], fetches = [];
  let clock = opts.now || new Date(2026, 8, 25, 10, 30);   // יום ה׳ 25.9.26 10:30
  let nukiReply = opts.nukiReply || (() => ({ code: 204, text: '' }));
  const key = p => decodeURIComponent(p);
  const sb = {
    console, JSON, Math, Object, Array, String, Number, Boolean, parseInt, isNaN, encodeURIComponent, decodeURIComponent,
    Date: class extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.getTime()); } static now() { return clock.getTime(); } },
    Utilities: {
      formatDate: (d, tz, f) => {
        const p = n => String(n).padStart(2, '0');
        return f.replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
                .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes()))
                .replace(/^H$/, String(d.getHours())).replace(/^m$/, String(d.getMinutes()));
      },
      getUuid: (() => { let n = 0; return () => { n++; return (String(n).padStart(8, '0')) + '-3456-7890-abcd-' + String(n).padStart(12, '0'); }; })(),
      sleep: () => {}
    },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    Logger: { log: () => {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
      deleteProperty: k => { delete props[k]; }
    }) },
    CalendarApp: {
      Color: { TEAL: 'teal' },
      getCalendarById: id => id === 'cal1' ? cal : null,
      createCalendar: () => cal
    },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); const r = nukiReply(url, o);
      return { getResponseCode: () => r.code, getContentText: () => r.text || '' }; } },
    fsDocPath_: (c, id) => c + '/' + encodeURIComponent(String(id)),
    fsIdOk_: id => !!id && String(id).indexOf('/') === -1,
    fsGet_: p => db[key(p)] ? JSON.parse(JSON.stringify(db[key(p)]), reviveDates) : null,
    fsSet_: (p, o) => { db[key(p)] = JSON.parse(JSON.stringify(o)); },
    fsMerge_: (p, o) => { db[key(p)] = Object.assign({}, db[key(p)] || {}, JSON.parse(JSON.stringify(o))); },
    fsDelete_: p => { delete db[key(p)]; },
    fsList_: c => Object.keys(db).filter(k => k.startsWith(c + '/')).map(k => ({ id: k.slice(c.length + 1), data: JSON.parse(JSON.stringify(db[k]), reviveDates) })),
    fsQuery_: (c, f, op, v) => Object.keys(db).filter(k => k.startsWith(c + '/') && db[k][f] === v)
      .map(k => ({ id: k.slice(c.length + 1), data: JSON.parse(JSON.stringify(db[k])) })),
    sendResidentTemplate_: (ss, key, emails, vars) => mails.push({ key, emails, vars }),
    notifyAdmins_: (ss, perm, key, vars) => admins.push({ perm, key, vars }),
    emailsForFamilyId_: (ss, fid) => ['fam' + fid + '@x.il'],
    txFamilyNames_: () => ({ '12': 'משפחת לוי' }),
    fbUidForSlot_: () => 'uid-me',
    normalizeEmail_: e => String(e || '').trim().toLowerCase(),
    readTable_: () => opts.gymRows || [],
    gymUidByEmail_: () => opts.gymUids || {},
    gymStatusSyncAll_: () => ({ ok: true }),
    PERM_SUPER: 'על', PERM_GYM: 'מכון', PERM_WEWORK: 'WeWork', GYM_SHEET: 'מכון כושר',
    GYM_ST_ACTIVE: 'פעיל', GYM_OPEN_STATUSES: ['פעיל', 'ממתין לתשלום'],
    gymToDate_: v => { if (!v) return null; if (v instanceof Date) return v; const d = new Date(String(v) + 'T00:00:00'); return isNaN(d) ? null : d; }
  };
  function reviveDates(k, v) { return (typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(v)) ? new Date(v) : v; }
  const cal = {
    getId: () => 'cal1',
    createEvent: (t, s, e, o) => { const id = 'ev' + (Object.keys(calEvents).length + 1); calEvents[id] = { t, s, e, o, tags: {} };
      return { getId: () => id, setTag: (k, v) => { calEvents[id].tags[k] = v; } }; },
    getEventById: id => calEvents[id] ? { deleteEvent: () => { delete calEvents[id]; } } : null
  };
  vm.createContext(sb);
  vm.runInContext(grab(GS, 'gymPickRow_') + '\n' + grab(GS, 'gymRowEntitled_') + '\n' + grab(GS, 'gymCodeExpiry_'), sb);
  vm.runInContext(DOOR, sb);
  return {
    sb, db, props, mails, admins, fetches, calEvents, cache,
    setNow: d => { clock = d; },
    setNuki: fn => { nukiReply = fn; },
    reset: () => { sb.WW_CFG_MEMO_ = null; Object.keys(cache).forEach(k => delete cache[k]); }
  };
}
const ME = (fid, extra) => Object.assign({ _email: 'me@x.il', _perm: Object.assign({ familyId: fid || '12', family: 'לוי', firstName: 'נועה', perms: [], isSuper: false, rowIndex: 5, slot: 1 }, extra || {}) });
const call = (T, fn, body) => T.sb[fn]({}, body);

/* ============================================================ 1. אימות --- */
section('1. אימות בקשת שריון');
{
  const T = makeSandbox();
  const cfg = Object.assign({}, T.sb.WW_DEFAULTS);
  const now = new Date(2026, 8, 25, 10, 30);
  const v = b => T.sb.wwValidate_(b, cfg, now);
  ok('תאריך שעבר נדחה', !v({ date: '2026-09-24', from: 9, hours: 2 }).ok);
  ok('מעבר ל-14 יום נדחה', !v({ date: '2026-10-10', from: 9, hours: 2 }).ok);
  ok('14 יום בדיוק מותר', v({ date: '2026-10-09', from: 9, hours: 2 }).ok);
  ok('7 שעות נדחה (maxHours=6)', !v({ date: '2026-09-26', from: 8, hours: 7 }).ok);
  ok('6 שעות מותר', v({ date: '2026-09-26', from: 8, hours: 6 }).ok);
  ok('אחרי חצות נדחה', !v({ date: '2026-09-26', from: 22, hours: 3 }).ok);
  ok('עד חצות בדיוק מותר (22–24)', v({ date: '2026-09-26', from: 22, hours: 2 }).ok);
  ok('מחוץ לשעות הרגילות מותר (05:00)', v({ date: '2026-09-26', from: 5, hours: 2 }).ok);
  ok('היום, חלון שכבר עבר נדחה', !v({ date: '2026-09-25', from: 8, hours: 2 }).ok);
  ok('היום, חלון שהתחיל ועוד לא נגמר מותר', v({ date: '2026-09-25', from: 10, hours: 2 }).ok);
  ok('סוג עמדה לא מוכר נדחה', !v({ date: '2026-09-26', from: 9, hours: 2, seat: 'sofa' }).ok);
}

/* ============================================================ 2. תפוסה --- */
section('2. שריון ותפוסה');
{
  const T = makeSandbox({ props: { WEWORK_CALENDAR_ID: 'cal1' } });
  const b = (fid, from, hours, seat) => call(T, 'weworkBook_', Object.assign(ME(fid), { date: '2026-09-26', from, hours, seat: seat || 'desk' }));
  const r1 = b('1', 9, 3), r2 = b('2', 10, 2), r3 = b('3', 11, 4);
  ok('שלושה שריונים חופפים נכנסים', r1.ok && r2.ok && r3.ok, JSON.stringify([r1, r2, r3].map(r => r.error)));
  const r4 = b('4', 11, 1);
  ok('🔴 העמדה הרביעית באותה שעה נדחית', !r4.ok && r4.conflict === true, JSON.stringify(r4));
  ok('ההודעה אומרת באיזו שעה', /11:00/.test(r4.error || ''), r4.error);
  const r5 = b('4', 12, 2);
  ok('שעה שבה עמדה התפנתה — נכנס', r5.ok, r5.error);
  const l1 = b('5', 11, 1, 'lounge'), l2 = b('6', 11, 1, 'lounge');
  ok('כורסה נספרת בנפרד מהמחשבים', l1.ok, l1.error);
  ok('כורסה שנייה באותה שעה נדחית (1 בלבד)', !l2.ok);
  const day = T.db['weworkDays/2026-09-26'];
  ok('מסמך היום נגזר מהשריונים', day && day.slots['11'].desk === 3 && day.slots['11'].lounge === 1 && day.slots['9'].desk === 1, JSON.stringify(day && day.slots));
  ok('ספירה = כמות השריונים הפעילים', day && day.count === 5, day && day.count);
  ok('נוצר אירוע ביומן לכל שריון', Object.keys(T.calEvents).length === 5);
  ok('כותרת האירוע: סוג עמדה + שם המשפחה', Object.values(T.calEvents).some(e => /WeWork · מחשב · לוי/.test(e.t)));
  ok('נשלח מייל WEWORK_BOOKED לכל שריון', T.mails.filter(m => m.key === 'WEWORK_BOOKED').length === 5);
  const doc = T.db['weworkBookings/' + r1.booking.id];
  const keys = Object.keys(doc || {});
  const ALLOWED = ['date', 'from', 'to', 'hours', 'seat', 'id', 'familyId', 'uid', 'status', 'calEventId', 'createdAtMs', 'enteredAtMs', 'schema', 'updatedAt'];
  ok('🔴 מסמך השריון בלי שם/מייל — רשימת היתר בלבד', keys.every(k => ALLOWED.indexOf(k) !== -1), keys.join(','));
  ok('updatedAt ו-schema קיימים (לגיבוי המצטבר)', doc && doc.updatedAt && doc.schema === 1);
  const f1 = b('7', 14, 2), f2 = b('7', 14, 2), f3 = b('7', 15, 1);
  ok('משפחה: שני שריונים חופפים מותרים', f1.ok && f2.ok, [f1.error, f2.error].join('|'));
  ok('משפחה: שלישי חופף נדחה (perFamily=2)', !f3.ok, f3.error);
  const noFid = call(T, 'weworkBook_', Object.assign(ME('1', { familyId: '' }), { date: '2026-09-26', from: 9, hours: 1 }));
  ok('בלי מזהה משפחה — נדחה', !noFid.ok);
}

/* ============================================================== 3. ביטול --- */
section('3. ביטול');
{
  const T = makeSandbox({ props: { WEWORK_CALENDAR_ID: 'cal1' } });
  const r = call(T, 'weworkBook_', Object.assign(ME('12'), { date: '2026-09-26', from: 9, hours: 2 }));
  const id = r.booking.id;
  const other = call(T, 'weworkCancel_', Object.assign(ME('99'), { id }));
  ok('🔴 משפחה אחרת לא יכולה לבטל', !other.ok && /הרשאה/.test(other.error), other.error);
  const bad = call(T, 'weworkCancel_', Object.assign(ME('12'), { id: '../x' }));
  ok('מזהה לא תקין נדחה', !bad.ok);
  const adm = call(T, 'weworkCancel_', Object.assign(ME('99', { perms: ['WeWork'] }), { id }));
  ok('מנהל WeWork מבטל שריון של אחרים', adm.ok && adm.canceledBy === 'admin', JSON.stringify(adm));
  ok('המייל הולך למשפחה שבוטלה, לא למנהל', T.mails.some(m => m.key === 'WEWORK_CANCELED' && m.emails[0] === 'fam12@x.il' && /מנהל/.test(m.vars['מי'])));
  ok('האירוע ביומן נמחק', Object.keys(T.calEvents).length === 0);
  ok('מסמך היום התעדכן לאפס', T.db['weworkDays/2026-09-26'].count === 0);
  const again = call(T, 'weworkCancel_', Object.assign(ME('12'), { id }));
  ok('ביטול כפול נדחה', !again.ok);
  const r2 = call(T, 'weworkBook_', Object.assign(ME('12'), { date: '2026-09-25', from: 10, hours: 1 }));
  T.setNow(new Date(2026, 8, 25, 11, 30));
  const late = call(T, 'weworkCancel_', Object.assign(ME('12'), { id: r2.booking.id }));
  ok('שריון שהסתיים לא מתבטל', !late.ok && /הסתיים/.test(late.error), late.error);
}

/* ============================================================ 4. הדלת --- */
section('4. פתיחת הדלת');
{
  const T = makeSandbox({ props: { WEWORK_CALENDAR_ID: 'cal1' } });
  const bk = call(T, 'weworkBook_', Object.assign(ME('12'), { date: '2026-09-25', from: 10, hours: 2 }));
  let r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('מצב off: "עוד לא מחוברת"', !r.ok && r.code === 'DOOR_OFF', JSON.stringify(r));
  T.props.DOOR_MODE = 'live';
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('🔴 live בלי טוקן = כבוי (לעולם לא "כאילו פתחנו")', !r.ok && r.code === 'DOOR_OFF' && T.fetches.length === 0);
  T.props.DOOR_MODE = 'sim';
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('הדמיה + שריון פעיל עכשיו — נפתח', r.ok && r.simulated === true, JSON.stringify(r));
  const logs = Object.keys(T.db).filter(k => k.startsWith('doorLog/')).map(k => T.db[k]);
  ok('נרשם ביומן: wework, sim, עם מזהה השריון', logs.length === 1 && logs[0].kind === 'wework' && logs[0].result === 'sim' && logs[0].bookingId === bk.booking.id, JSON.stringify(logs));
  ok('🔴 היומן בלי שם/מייל', logs[0] && !('email' in logs[0]) && !('name' in logs[0]) && logs[0].familyId === '12');
  ok('השריון סומן "נכנס"', T.db['weworkBookings/' + bk.booking.id].enteredAtMs > 0);
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('לחיצה כפולה תוך 5 שניות נבלמת', !r.ok && r.code === 'BUSY');
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('55'), { reason: 'wework' }));
  ok('🔴 משפחה בלי שריון — לא נפתח', !r.ok && r.code === 'NOT_NOW');
  T.reset(); T.setNow(new Date(2026, 8, 25, 12, 0));
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('🔴 בדיוק בסוף החלון (12:00) — כבר לא נפתח', !r.ok && r.code === 'NOT_NOW');
  T.reset(); T.setNow(new Date(2026, 8, 25, 9, 59));
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('דקה לפני ההתחלה — לא נפתח', !r.ok && r.code === 'NOT_NOW');
  T.reset(); T.setNow(new Date(2026, 8, 25, 10, 30));
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'gym' }));
  ok('מכון כשהמכון עוד בקוד — מפנה לקוד', !r.ok && r.code === 'GYM_CODE');
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'admin' }));
  ok('🔴 "ניהול" בלי הרשאה — נדחה', !r.ok);
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('12', { perms: ['מכון'] }), { reason: 'admin' }));
  ok('מנהל מכון פותח מרחוק', r.ok);
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'hack' }));
  ok('סיבה לא מוכרת נדחית', !r.ok);
}
{
  const rows = [
    { 'אימייל': 'me@x.il', 'סטטוס': 'פעיל', 'בתוקף עד': '2027-06-30' },
    { 'אימייל': 'old@x.il', 'סטטוס': 'פעיל', 'בתוקף עד': '2026-09-01' }
  ];
  const T = makeSandbox({ gymRows: rows, props: { DOOR_MODE: 'sim', DOOR_GYM_ON: '1' } });
  let r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'gym' }));
  ok('מנוי בתוקף + המכון עבר לדלת — נפתח', r.ok, JSON.stringify(r));
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('13'), { reason: 'gym', _email: 'old@x.il' }));
  ok('🔴 מנוי שפג — לא נפתח', !r.ok && r.code === 'NOT_NOW', JSON.stringify(r));
}
{
  const T = makeSandbox({ props: { DOOR_MODE: 'live', NUKI_API_TOKEN: 'x'.repeat(40), NUKI_SMARTLOCK_ID: '123456', WEWORK_CALENDAR_ID: 'cal1',
                                   DOOR_CONTACT: JSON.stringify({ name: 'רון', phone: '050-1234567' }) } });
  call(T, 'weworkBook_', Object.assign(ME('12'), { date: '2026-09-25', from: 10, hours: 2 }));
  let r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  const f = T.fetches[T.fetches.length - 1];
  ok('live: POST ל-/smartlock/123456/action', r.ok && f && /\/smartlock\/123456\/action$/.test(f.url) && f.o.method === 'post', f && f.url);
  ok('live: הפעולה היא unlatch (3) — "שחרור נעילה והיא נפתחת"', f && JSON.parse(f.o.payload).action === 3);
  ok('live: הטוקן בכותרת Bearer', f && f.o.headers.Authorization === 'Bearer ' + 'x'.repeat(40));
  T.setNuki(() => ({ code: 503, text: 'offline' }));
  T.reset();
  r = call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('כשל Nuki: הודעה ברורה + איש קשר', !r.ok && r.code === 'NUKI_FAIL' && r.contact.phone === '050-1234567', JSON.stringify(r));
  ok('כשל Nuki: התראה למנהלי המכון', T.admins.length === 1 && T.admins[0].perm === 'מכון' && T.admins[0].key === 'ADMIN_DOOR_ALERT');
  T.reset();
  call(T, 'doorOpen_', Object.assign(ME('12'), { reason: 'wework' }));
  ok('🔴 כשל שני תוך חצי שעה — בלי התראה נוספת', T.admins.length === 1, T.admins.length);
  const fails = Object.keys(T.db).filter(k => k.startsWith('doorLog/') && T.db[k].result === 'fail').length;
  ok('כל כשל נרשם ביומן', fails === 2, fails);
}

/* ============================================================ 5. הגדרות --- */
section('5. הגדרות הדלת ו-WeWork');
{
  const T = makeSandbox();
  let r = call(T, 'doorConfigure_', Object.assign(ME('1', { isSuper: true }), { token: 'short' }));
  ok('טוקן קצר מדי נדחה', !r.ok);
  const TOK = 'nk_' + 'a'.repeat(50);
  r = call(T, 'doorConfigure_', Object.assign(ME('1', { isSuper: true }), { token: TOK, lockId: '17' }));
  ok('מזהה מנעול לא מספרי/קצר נדחה', !r.ok);
  r = call(T, 'doorConfigure_', Object.assign(ME('1', { isSuper: true }), { token: TOK, lockId: '987654' }));
  ok('טוקן + מזהה נשמרו ב-Script Properties', r.ok && T.props.NUKI_API_TOKEN === TOK && T.props.NUKI_SMARTLOCK_ID === '987654');
  ok('🔴 הטוקן לא חוזר בתשובה', JSON.stringify(r).indexOf(TOK) === -1);
  ok('🔴 והטוקן לא נכתב ל-Firestore', JSON.stringify(T.db).indexOf(TOK) === -1);
  r = call(T, 'doorConfigure_', Object.assign(ME('1', { isSuper: true }), { mode: 'live', gymOn: true }));
  ok('מעבר ל-live + המכון לדלת', r.ok && r.mode === 'live' && r.gymOn === true && T.props.DOOR_GYM_ON === '1');
  ok('doorConfig/public נכתב (mode/gymOn בלבד)', T.db['doorConfig/public'].mode === 'live' && T.db['doorConfig/public'].gymOn === true &&
     Object.keys(T.db['doorConfig/public']).sort().join() === 'gymOn,mode,schema,updatedAt');
  r = call(T, 'doorConfigure_', Object.assign(ME('1', { isSuper: true }), { mode: 'bogus' }));
  ok('מצב לא מוכר נדחה', !r.ok);
  const T2 = makeSandbox();
  r = call(T2, 'doorConfigure_', Object.assign(ME('1', { isSuper: true }), { mode: 'live' }));
  ok('🔴 live בלי טוקן ומזהה — נדחה', !r.ok);
  r = call(T, 'doorSaveContact_', Object.assign(ME('1'), { name: 'רון שגיא', phone: '050-712-3344<script>' }));
  ok('איש קשר: טלפון מנוקה מתווים', r.ok && r.contact.phone === '050-712-3344', r.contact && r.contact.phone);

  let s = call(T, 'weworkSaveConfig_', Object.assign(ME('1'), { desks: '4', lounge: '1', maxHours: '6' }));
  ok('כללי שריון תקינים נשמרים', s.ok && s.config.desks === 4, JSON.stringify(s));
  s = call(T, 'weworkSaveConfig_', Object.assign(ME('1'), { maxHours: '40' }));
  ok('ערך מחוץ לגבולות נדחה (לא נחתך בשקט)', !s.ok);
  s = call(T, 'weworkSaveConfig_', Object.assign(ME('1'), { viewFrom: '21', viewTo: '8' }));
  ok('טווח תצוגה הפוך נדחה', !s.ok);
  s = call(T, 'weworkSaveConfig_', Object.assign(ME('1'), { desks: '0', lounge: '0' }));
  ok('אפס עמדות נדחה', !s.ok);
}

/* ================================================= 6. בריאות + התראות --- */
section('6. בריאות המנעול והתראות');
{
  let battery = 15, online = 0;
  const T = makeSandbox({ props: { DOOR_MODE: 'live', NUKI_API_TOKEN: 'x'.repeat(40), NUKI_SMARTLOCK_ID: '123456' },
    nukiReply: (url) => /\/smartlock\/123456$/.test(url) ? { code: 200, text: JSON.stringify({ serverState: online, state: { batteryCharge: battery, batteryCritical: false } }) } : { code: 204 } });
  T.sb.doorHealth_({});
  ok('סוללה 15% — התראה אחת', T.admins.length === 1 && /סוללה/.test(T.admins[0].vars['בעיה']));
  ok('doorState/main נכתב', T.db['doorState/main'].battery === 15 && T.db['doorState/main'].online === true);
  T.sb.doorHealth_({});
  ok('🔴 שעה אחרי — בלי התראה חוזרת', T.admins.length === 1);
  battery = 90; T.sb.doorHealth_({});
  battery = 12; T.sb.doorHealth_({});
  ok('אחרי החלפה ונפילה מחדש — התראה חדשה', T.admins.length === 2);
  online = 4; T.sb.doorHealth_({});
  ok('ניתוק — התראה', T.admins.some(a => /התנתק/.test(a.vars['בעיה'])));
  ok('🔴 doorState בלי טוקן', JSON.stringify(T.db['doorState/main']).indexOf('xxxxxxxx') === -1);
}

/* ======================================================== 7. Nuki למנויים --- */
section('7. הזמנות Nuki למנויי המכון');
{
  const rows = [
    { 'אימייל': 'a@x.il', 'שם פרטי': 'אבי', 'שם משפחה': 'כהן', 'סטטוס': 'פעיל', 'בתוקף עד': '2027-06-30' },
    { 'אימייל': 'b@x.il', 'שם פרטי': 'בת', 'שם משפחה': 'לוי', 'סטטוס': 'פג תוקף', 'בתוקף עד': '2026-06-30' }
  ];
  const auths = [];
  const T = makeSandbox({ gymRows: rows, gymUids: { 'a@x.il': 'uA', 'b@x.il': 'uB' },
    props: { DOOR_MODE: 'live', DOOR_GYM_ON: '1', NUKI_API_TOKEN: 'x'.repeat(40), NUKI_SMARTLOCK_ID: '123456' },
    nukiReply: (url, o) => {
      if (/\/account\/user$/.test(url) && o.method === 'put') return { code: 200, text: JSON.stringify({ accountUserId: 777 }) };
      if (/\/smartlock\/auth$/.test(url) && o.method === 'put') { auths.push({ id: 'AU1', accountUserId: 777 }); return { code: 204 }; }
      if (/\/smartlock\/123456\/auth$/.test(url)) return { code: 200, text: JSON.stringify(auths) };
      return { code: 204 };
    } });
  T.db['gymNuki/uB'] = { uid: 'uB', state: 'sent', authId: 'OLD', accountUserId: 5 };
  const out = T.sb.doorGymNukiSync_({});
  ok('מנוי בתוקף — הוזמן', out.invited === 1, JSON.stringify(out));
  const put = T.fetches.find(f => /\/smartlock\/auth$/.test(f.url));
  const pb = put && JSON.parse(put.o.payload);
  ok('🔴 allowedWeekDays=127 (בלעדיו הגבלת התאריכים לא נכנסת לתוקף)', pb && pb.allowedWeekDays === 127);
  ok('🔴 התפוגה ב-Nuki = סוף המנוי (יום אחרי "בתוקף עד")', pb && new Date(pb.allowedUntilDate).getDate() === 1 && new Date(pb.allowedUntilDate).getMonth() === 6);
  ok('סוג ההרשאה = הזמנה לאפליקציה (type 0)', pb && pb.type === 0);
  ok('gymNuki/uA: נשלח, עם authId', T.db['gymNuki/uA'].state === 'sent' && T.db['gymNuki/uA'].authId === 'AU1');
  ok('🔴 gymNuki בלי מייל', JSON.stringify(T.db['gymNuki/uA']).indexOf('@') === -1);
  ok('מייל GYM_NUKI_INVITE נשלח למנוי', T.mails.some(m => m.key === 'GYM_NUKI_INVITE' && m.emails[0] === 'a@x.il'));
  ok('מנוי שפג — ההרשאה נמחקה ב-Nuki', T.fetches.some(f => /\/auth\/OLD$/.test(f.url) && f.o.method === 'delete') && T.db['gymNuki/uB'].state === 'expired');
  const again = T.sb.doorGymNukiSync_({});
  ok('ריצה שנייה — אידמפוטנטית (אין הזמנה כפולה)', again.invited === 0 && again.updated === 0, JSON.stringify(again));
  T.props.DOOR_GYM_ON = '';
  ok('המכון עוד בקוד — לא נוגעים ב-Nuki', T.sb.doorGymNukiSync_({}).skipped === 'gymOff');
}

/* ======================================================== 8. חיווט סטטי --- */
section('8. חיווט: Code.gs, כללים, לקוח');
{
  ok('PERM_WEWORK ב-ALL_PERMS', /var ALL_PERMS = \[[^\]]*PERM_WEWORK/.test(GS));
  ok("PERM_WEWORK = 'WeWork'", /var PERM_WEWORK\s*=\s*'WeWork';/.test(GS));
  const actions = ['weworkBook', 'weworkCancel', 'weworkSaveConfig', 'doorOpen', 'doorStatus', 'doorConfigure', 'doorTestConnection', 'doorSaveContact', 'doorGymResend'];
  ok('כל 9 הפעולות בדיספאץ\'', actions.every(a => GS.indexOf("case '" + a + "':") !== -1));
  ok('🔴 כל 9 ממופות לתחום door (לא "other" שמבטל את מטמון כולם)', actions.every(a => new RegExp(a + ": 'door'").test(GS)));
  ok('🔴 doorConfigure / doorTestConnection — מנהל-על בלבד', /doorConfigure: PERM_SUPER/.test(GS) && /doorTestConnection: PERM_SUPER/.test(GS));
  ok('weworkSaveConfig — PERM_WEWORK', /weworkSaveConfig: PERM_WEWORK/.test(GS));
  ok('doorOpen/weworkBook לא ב-ACTION_PERMS (הזכאות בתוך הפעולה)', !/\n\s*doorOpen:\s*PERM/.test(GS) && !/\n\s*weworkBook:\s*PERM/.test(GS));
  ok('ארבעת האוספים בגיבוי', ['weworkBookings', 'weworkConfig', 'doorLog', 'gymNuki'].every(c => new RegExp("collection: '" + c + "'").test(GS)));
  ok('שלב שעתי doorHourly_', /hjM\('doorHourly_'\)[\s\S]{0,140}doorHourly_\(ss\)/.test(GS));
  ok('🔴 handleGymMy_ לא מוסר קוד כשהדלת החליפה אותו', /isActive && stillValid && !\(typeof doorGymOn_ === 'function' && doorGymOn_\(\)\)/.test(GS));
  ok('🔴 gymStatusSyncAll_ מפסיק לכתוב gymCode', /if \(typeof doorGymOn_ === 'function' && doorGymOn_\(\)\) code = '';/.test(GS));
  ok('מחיקת מנוי מבטלת גם את Nuki', /doorGymNukiRevoke_\(uid\)/.test(GS));
  const tmpl = ['WEWORK_BOOKED', 'WEWORK_CANCELED', 'GYM_NUKI_INVITE', 'ADMIN_DOOR_ALERT'];
  ok('4 תבניות מייל', tmpl.every(k => GS.indexOf("['" + k + "'") !== -1));
  {
    const sb2 = { PERM_SUPER: 'על', PERM_BUDGET: 'b', PERM_CLUB: 'c', PERM_RESIDENTS: 'r', PERM_GYM: 'מכון', PERM_GARDEN: 'g', PERM_CULTURE: 'x', PERM_WEWORK: 'WeWork' };
    const m = GS.match(/var DEFAULT_EMAIL_SETTINGS = (\[[\s\S]*?\n\]);/);
    let rows = [];
    try { vm.createContext(sb2); rows = vm.runInContext(m[1], sb2); } catch (e) { rows = []; }
    const mine = rows.filter(r => tmpl.indexOf(r[0]) !== -1);
    ok('🔴 כל תבנית ברוחב 6 בדיוק (מלכודת המלבן של setValues)', mine.length === 4 && mine.every(r => r.length === 6), mine.map(r => r.length).join());
  }
  const colls = ['weworkConfig', 'weworkDays', 'weworkBookings', 'doorConfig', 'doorState', 'doorLog', 'gymNuki'];
  const blocks = colls.map(c => (RULES.match(new RegExp('match /' + c + '/\\{[a-zA-Z]+\\} \\{[\\s\\S]*?\\n    \\}')) || [''])[0]);
  ok('🔴 כל 7 האוספים: allow write: if false', blocks.every(b => /allow write: if false;/.test(b) && !/allow (create|update|delete)/.test(b)), blocks.map(b => b.length).join());
  ok('🔴 מנהל WeWork רואה ביומן רק kind=wework', /isInternalAdmin\('WeWork'\) && kind == 'wework'/.test(RULES));
  ok("🔴 שריון: fid != '' (myFamilyId() מחזירה '')", /fid is string && fid != '' && fid == myFamilyId\(\)/.test(RULES));
  ok('🔴 כל השערים חוסמים משתמש חיצוני', /function canSeeWework\(\) \{\s*return isMember\(\) && m\(\)\.isExternal == false;/.test(RULES));
  ok('האוספים מעל ברירת המחדל האוסרת', RULES.indexOf('match /gymNuki/') < RULES.indexOf('match /{document=**}'));
  ok('app.js: PERM.WEWORK = "WeWork"', /WEWORK: "WeWork"/.test(APP));
  ok('app.js: weworkAdmin דורש PERM.WEWORK', /weworkAdmin: PERM\.WEWORK/.test(APP));
  ok('app.js: WeWork תחת "מתקנים" — תושב ומנהל', /\["resGym", "מכון כושר"\], \["resWework", "WeWork"\]/.test(APP) && /\["gymAdmin", "מכון כושר"\], \["weworkAdmin", "WeWork"\]/.test(APP));
  ok('app.js: hasAnyAdmin כולל WeWork (אחרת מנהל WeWork בלבד לא נכנס לניהול)', /PERM\.GARDEN, PERM\.WEWORK\]/.test(APP));
  ok('residents.js: אפשר להעניק הרשאת WeWork', /code: "WeWork"/.test(R('js/screens/residents.js')));
  const v = (IDX.match(/\?v=([a-z0-9]+)/) || [])[1];
  ok('index.html: גרסה אחידה בכל התגים', v && (IDX.match(/\?v=([a-z0-9]+)/g) || []).every(t => t === '?v=' + v));
  ok('🔴 service-worker VERSION = ?v=', new RegExp('var VERSION = "' + v + '"').test(SW));
  ok('הסקריפטים החדשים לפני app.js', ['door.js', 'doorButton.js', 'doorAdmin.js', 'resWework.js', 'weworkAdmin.js'].every(f => IDX.indexOf(f) !== -1 && IDX.indexOf(f) < IDX.indexOf('js/app.js')));
  ok('wework.css נטען', /css\/wework\.css\?v=/.test(IDX));
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
