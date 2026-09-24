/* ============================================================================
 *  Door.gs — דלת הכניסה (Nuki Smart Lock Ultra) + שריון WeWork   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  אפיון: מסמך הפרויקט claude/nuki-door-access-spec-2026-09-24.md.
 *  סקיצה מאושרת: Artifact "סקיצת דלת Nuki".
 *
 *  דלת אחת משותפת למכון הכושר ולחלל ה-WeWork. תושב פותח אותה מכפתור
 *  באפליקציה, **והשרת בודק בכל לחיצה שיש לו זכות עכשיו**:
 *    • WeWork — שריון פעיל של המשפחה שלו, והשעה בתוך חלון השריון.
 *    • מכון   — מנוי פעיל (אותה gymRowEntitled_ שקובעת את קוד הכניסה).
 *    • ניהול  — מנהל מכון / מנהל WeWork / מנהל-על, בכל שעה.
 *
 *  🔑 איפה כל נתון יושב (חמש השאלות של cba-firebase-dev-method):
 *    1. Firestore, בלי שם/מייל/טלפון — רק familyId ו-uid:
 *         weworkConfig/main     כללי השריון          קריאה: כל חבר
 *         weworkDays/{date}     תפוסה לפי שעה (ספירות בלבד)  קריאה: כל חבר
 *         weworkBookings/{id}   שריון                  קריאה: המשפחה + מנהל WeWork
 *         doorConfig/public     מצב הדלת (off/sim/live)  קריאה: כל חבר
 *         doorState/main        סוללה/חיבור            קריאה: מנהל מכון
 *         doorLog/{id}          יומן פתיחות            קריאה: מנהל מכון (+WeWork לשלו)
 *         gymNuki/{uid}         מצב הזמנת Nuki למנוי   קריאה: בעליו + מנהל מכון
 *       הדפדפן **לעולם לא כותב** לאף אחד מהם. יצירת שריון דורשת בדיקת
 *       תפוסה תחת נעילה + יומן גוגל — לוגיקה עסקית שכלל אבטחה לא יודע
 *       לאכוף, ולכן היא כאן (cba-hybrid-architecture: "לוגיקה עסקית שכלל
 *       אינו יודע לאכוף נשארת בשרת").
 *    2. הרשאות: ACTION_PERMS + authorize_ הקיימים, ותחום חדש PERM_WEWORK.
 *    3. מיילים: sendResidentTemplate_ / notifyAdmins_ הקיימים, 4 תבניות חדשות
 *       ב-DEFAULT_EMAIL_SETTINGS (Code.gs).
 *    4. גיבוי: weworkBookings, weworkConfig, doorLog, gymNuki נוספו ל-BK_COLLECTIONS.
 *       weworkDays נגזר מהשריונים (wwRebuildDay_) ולכן אינו צריך גיבוי.
 *    5. דיפלוי: לקוח (?v=) + Apps Script (קובץ חדש!) + כללי Firestore.
 *
 *  🔐 סודות — Script Properties בלבד, לעולם לא בקוד ולא ב-Firestore:
 *       NUKI_API_TOKEN      טוקן Nuki Web (API)
 *       NUKI_SMARTLOCK_ID   מזהה המנעול
 *       DOOR_MODE           off | sim | live      (ברירת מחדל off)
 *       DOOR_GYM_ON         '1' = כפתור הדלת מחליף את קוד המכון
 *       WEWORK_CALENDAR_ID  היומן הייעודי (נוצר לבד בפעם הראשונה)
 *       DOOR_CONTACT        {name, phone} למקרה תקלה — מוחזר בתשובת שגיאה בלבד
 *     הטוקן נקבע ממסך הדלת (מנהל-על, doorConfigure) ולעולם אינו חוזר ללקוח.
 *
 *  🧪 שלושה מצבים, כדי שאפשר יהיה לבדוק הכול לפני שהמנעול מחובר:
 *       off  — כפתור הדלת מחזיר "עוד לא מחוברת". שריון WeWork עובד רגיל.
 *       sim  — הכול עובד מקצה לקצה, הפתיחה עצמה מדומה ונרשמת ביומן כ"הדמיה".
 *       live — פקודת unlatch אמיתית ל-Nuki.
 *
 *  ⚠️ נקודות Nuki API שטרם אומתו מול Swagger (לבדוק במעבר ל-live):
 *     שמות השדות ב-GET /smartlock/{id} (serverState, state.batteryCharge),
 *     תשובת PUT /account/user, ורשימת ההרשאות GET /smartlock/{id}/auth.
 *     כל הקריאות עוברות ב-nukiReq_ אחת, ולכן תיקון הוא במקום אחד.
 * ========================================================================== */

var FS_WW_CONFIG   = 'weworkConfig';
var FS_WW_DAYS     = 'weworkDays';
var FS_WW_BOOK     = 'weworkBookings';
var FS_DOOR_CONFIG = 'doorConfig';
var FS_DOOR_STATE  = 'doorState';
var FS_DOOR_LOG    = 'doorLog';
var FS_GYM_NUKI    = 'gymNuki';

var DOOR_MODES = ['off', 'sim', 'live'];
var WW_SEATS = ['desk', 'lounge'];
var WW_SEAT_LABEL = { desk: 'עמדת מחשב', lounge: 'עמדת כורסאות' };

/* ברירות המחדל של כללי השריון. מנהל WeWork משנה אותן במסך שלו
   (weworkSaveConfig), והערכים נשמרים ב-weworkConfig/main.
   ⚠️ viewFrom/viewTo הם **תצוגה בלבד** (יועד, 24.9: "התצוגה כפריסט 8-21",
   חצים למעלה ולמטה). regularFrom/regularTo הם "השעות הרגילות" — מחוץ להן
   אפשר לשריין, רק מסומן בעדינות. שריון אפשרי בכל שעה 0–24. */
var WW_DEFAULTS = {
  viewFrom: 8, viewTo: 21,
  regularFrom: 7, regularTo: 22,
  desks: 3, lounge: 1,
  maxHours: 6, advanceDays: 14,
  perFamily: 2
};
/* גבולות סבירות לעריכת המנהל — ערך מחוץ להם נדחה, לא נחתך בשקט. */
var WW_LIMITS = {
  viewFrom: [0, 23], viewTo: [1, 24], regularFrom: [0, 23], regularTo: [1, 24],
  desks: [0, 20], lounge: [0, 10], maxHours: [1, 12], advanceDays: [1, 60], perFamily: [1, 4]
};

var NUKI_BASE = 'https://api.nuki.io';
var NUKI_ACTION_UNLATCH = 3;

/* ---------------------------------------------------------------------------
 *  Script Properties
 * ------------------------------------------------------------------------- */
function doorProp_(k) {
  return PropertiesService.getScriptProperties().getProperty(k) || '';
}
function doorPropSet_(k, v) {
  var p = PropertiesService.getScriptProperties();
  if (v === null || v === undefined || v === '') p.deleteProperty(k);
  else p.setProperty(k, String(v));
}
function nukiToken_()  { return doorProp_('NUKI_API_TOKEN'); }
function nukiLockId_() { return doorProp_('NUKI_SMARTLOCK_ID'); }

/** המצב המבוקש. live בלי טוקן או מזהה מנעול = לא מוגדר עד הסוף. */
function doorModeRaw_() {
  var m = doorProp_('DOOR_MODE');
  return DOOR_MODES.indexOf(m) === -1 ? 'off' : m;
}
/** המצב שבפועל. live חסר = off — לעולם לא "כאילו פתחנו". */
function doorMode_() {
  var m = doorModeRaw_();
  if (m === 'live' && !(nukiToken_() && nukiLockId_())) return 'off';
  return m;
}
/** האם כפתור הדלת מחליף את קוד הכניסה למכון. ⚠️ Code.gs שואל את זה
 *  בשני מקומות: handleGymMy_ (לא מוסר קוד) ו-gymStatusSyncAll_ (לא כותב
 *  gymCode, והסחיפה מוחקת את הקיימים). */
function doorGymOn_() {
  try { return doorProp_('DOOR_GYM_ON') === '1'; } catch (e) { return false; }
}
function doorContact_() {
  try { var c = JSON.parse(doorProp_('DOOR_CONTACT') || '{}'); return { name: String(c.name || ''), phone: String(c.phone || '') }; }
  catch (e) { return { name: '', phone: '' }; }
}

/* ---------------------------------------------------------------------------
 *  זמן — הכול באזור הזמן של הסקריפט (Asia/Jerusalem)
 * ------------------------------------------------------------------------- */
function wwTz_() { return Session.getScriptTimeZone(); }
function wwDateStr_(d) { return Utilities.formatDate(d, wwTz_(), 'yyyy-MM-dd'); }
function wwNowMin_(d) {
  d = d || new Date();
  return parseInt(Utilities.formatDate(d, wwTz_(), 'H'), 10) * 60 +
         parseInt(Utilities.formatDate(d, wwTz_(), 'm'), 10);
}
/** 'yyyy-MM-dd' + n ימים, בלי תלות בשעון קיץ (חישוב על צהרי היום). */
function wwAddDays_(dateStr, n) {
  var p = String(dateStr).split('-');
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  d.setUTCDate(d.getUTCDate() + n);
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}
function wwHH_(h) { return ('0' + h).slice(-2) + ':00'; }
function wwHebDate_(dateStr) {
  var p = String(dateStr).split('-');
  return p.length === 3 ? (+p[2]) + '.' + (+p[1]) + '.' + p[0] : String(dateStr);
}

/* ---------------------------------------------------------------------------
 *  כללי השריון — weworkConfig/main
 * ------------------------------------------------------------------------- */
var WW_CFG_MEMO_ = null;
function wwConfig_() {
  if (WW_CFG_MEMO_) return WW_CFG_MEMO_;
  var doc = null;
  try { doc = fsGet_(fsDocPath_(FS_WW_CONFIG, 'main')); } catch (e) { doc = null; }
  var out = {};
  Object.keys(WW_DEFAULTS).forEach(function (k) {
    var v = doc && typeof doc[k] === 'number' ? doc[k] : WW_DEFAULTS[k];
    out[k] = v;
  });
  WW_CFG_MEMO_ = out;
  return out;
}

/** זריעה אידמפוטנטית: יוצרת רק מה שחסר, לעולם לא דורסת עריכה של מנהל. */
function doorEnsureDocs_() {
  var out = { config: 'kept', public: 'kept' };
  if (!fsGet_(fsDocPath_(FS_WW_CONFIG, 'main'))) {
    var d = {}; Object.keys(WW_DEFAULTS).forEach(function (k) { d[k] = WW_DEFAULTS[k]; });
    d.schema = 1; d.updatedAt = new Date();
    fsSet_(fsDocPath_(FS_WW_CONFIG, 'main'), d);
    out.config = 'seeded';
  }
  if (!fsGet_(fsDocPath_(FS_DOOR_CONFIG, 'public'))) {
    doorWritePublic_();
    out.public = 'seeded';
  }
  return out;
}

/** מה שהלקוח צריך לדעת על הדלת — ובלי שום סוד. */
function doorWritePublic_() {
  fsSet_(fsDocPath_(FS_DOOR_CONFIG, 'public'), {
    mode: doorMode_(), gymOn: doorGymOn_(), schema: 1, updatedAt: new Date()
  });
}

/** להריץ פעם אחת מהעורך (לא חובה — השעתי עושה אותו דבר לבד). */
function setupWeworkModule() {
  var cal = wwCalendar_();
  var docs = doorEnsureDocs_();
  var msg = 'WeWork: יומן ' + (cal ? cal.getId() : 'לא נוצר') + ' | הגדרות ' + docs.config + ' | דלת ' + docs.public +
            ' | מצב ' + doorMode_();
  Logger.log(msg);
  return msg;
}

/* ---------------------------------------------------------------------------
 *  היומן הייעודי
 * ------------------------------------------------------------------------- */
function wwCalendar_() {
  var id = doorProp_('WEWORK_CALENDAR_ID');
  if (id) {
    try { var c = CalendarApp.getCalendarById(id); if (c) return c; } catch (e) { }
  }
  /* 🔴 נוצר פעם אחת ונשמר. אם מישהו מחק אותו — נוצר חדש, והשריונים
     הקיימים ייכתבו אליו מחדש ב-wwCalendarReconcile_ (שעתי). */
  var cal = CalendarApp.createCalendar('WeWork — שריונים', { timeZone: wwTz_(), color: CalendarApp.Color.TEAL });
  doorPropSet_('WEWORK_CALENDAR_ID', cal.getId());
  return cal;
}

function wwEventTitle_(b, famName) {
  return 'WeWork · ' + (b.seat === 'lounge' ? 'כורסה' : 'מחשב') + ' · ' + (famName || ('משפחה ' + b.familyId));
}
function wwEventTimes_(b) {
  var p = String(b.date).split('-');
  var s = new Date(+p[0], +p[1] - 1, +p[2], b.from, 0, 0);
  var e = new Date(+p[0], +p[1] - 1, +p[2], 0, 0, 0);
  e.setHours(b.to);            /* to=24 ⇒ חצות של היום הבא, כמצופה */
  return { start: s, end: e };
}
function wwCreateEvent_(b, famName) {
  var cal = wwCalendar_();
  var t = wwEventTimes_(b);
  var ev = cal.createEvent(wwEventTitle_(b, famName), t.start, t.end,
    { description: 'שריון ' + b.id + ' — נוצר מאפליקציית הקהילה. ביטול: מהאפליקציה בלבד.' });
  try { ev.setTag('bookingId', b.id); ev.setTag('familyId', String(b.familyId)); } catch (e) { }
  return ev.getId();
}
function wwDeleteEvent_(evId) {
  if (!evId) return;
  try { var ev = wwCalendar_().getEventById(evId); if (ev) ev.deleteEvent(); } catch (e) { Logger.log('wwDeleteEvent_: ' + e); }
}

/* ---------------------------------------------------------------------------
 *  תפוסה
 * ------------------------------------------------------------------------- */
function wwActiveForDate_(date) {
  return fsQuery_(FS_WW_BOOK, 'date', 'EQUAL', date).map(function (r) { return r.data; })
    .filter(function (b) { return b && b.status === 'active'; });
}
/** { "8": {desk:2, lounge:0}, ... } — רק שעות שיש בהן משהו. */
function wwSlots_(list) {
  var slots = {};
  list.forEach(function (b) {
    for (var h = b.from; h < b.to; h++) {
      var k = String(h);
      if (!slots[k]) slots[k] = { desk: 0, lounge: 0 };
      slots[k][b.seat === 'lounge' ? 'lounge' : 'desk']++;
    }
  });
  return slots;
}
/** מסמך היום נגזר תמיד מהשריונים עצמם — לא מונה שמעלים ומורידים.
 *  כך תקלה באמצע לעולם לא משאירה ספירה עקומה: הכתיבה הבאה מתקנת. */
function wwRebuildDay_(date, list) {
  list = list || wwActiveForDate_(date);
  fsSet_(fsDocPath_(FS_WW_DAYS, date), {
    date: date, slots: wwSlots_(list), count: list.length, schema: 1, updatedAt: new Date()
  });
}

/** בדיקת תקינות של בקשת שריון. מחזיר {ok, b} או {ok:false, error}. */
function wwValidate_(body, cfg, now) {
  now = now || new Date();
  var date = String(body.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'תאריך לא תקין' };
  var from = parseInt(body.from, 10), hours = parseInt(body.hours, 10);
  if (isNaN(from) || from < 0 || from > 23) return { ok: false, error: 'שעת התחלה לא תקינה' };
  if (isNaN(hours) || hours < 1) return { ok: false, error: 'משך לא תקין' };
  if (hours > cfg.maxHours) return { ok: false, error: 'אפשר לשריין עד ' + cfg.maxHours + ' שעות ברצף' };
  var to = from + hours;
  if (to > 24) return { ok: false, error: 'השריון חייב להסתיים עד חצות' };
  var seat = String(body.seat || 'desk');
  if (WW_SEATS.indexOf(seat) === -1) return { ok: false, error: 'סוג עמדה לא מוכר' };
  if ((seat === 'desk' ? cfg.desks : cfg.lounge) < 1) return { ok: false, error: 'אין עמדות מהסוג הזה' };
  var today = wwDateStr_(now);
  if (date < today) return { ok: false, error: 'אי אפשר לשריין לתאריך שעבר' };
  if (date > wwAddDays_(today, cfg.advanceDays)) return { ok: false, error: 'אפשר לשריין עד ' + cfg.advanceDays + ' ימים קדימה' };
  if (date === today && to * 60 <= wwNowMin_(now)) return { ok: false, error: 'החלון הזה כבר עבר' };
  return { ok: true, b: { date: date, from: from, to: to, hours: hours, seat: seat } };
}

/** האם יש מקום, בהינתן השריונים הקיימים של אותו יום. */
function wwFits_(b, list, cfg, familyId) {
  var cap = b.seat === 'lounge' ? cfg.lounge : cfg.desks;
  for (var h = b.from; h < b.to; h++) {
    var n = 0;
    list.forEach(function (x) { if (x.seat === b.seat && x.from <= h && h < x.to) n++; });
    if (n >= cap) return { ok: false, error: 'ב-' + wwHH_(h) + ' כל ה' + (b.seat === 'lounge' ? 'כורסאות' : 'עמדות') + ' תפוסות', hour: h };
  }
  var mine = list.filter(function (x) {
    return String(x.familyId) === String(familyId) && x.from < b.to && b.from < x.to;
  }).length;
  if (mine >= cfg.perFamily) return { ok: false, error: 'למשפחה שלך כבר יש ' + mine + ' שריונים באותן שעות' };
  return { ok: true };
}

/* ---------------------------------------------------------------------------
 *  weworkBook — שריון חדש
 * ------------------------------------------------------------------------- */
function weworkBook_(ss, body) {
  var perm = body._perm || {};
  var fid = String(perm.familyId || '').trim();
  if (!fid) return { ok: false, error: 'לא נמצא מזהה משפחה למשתמש' };
  var cfg = wwConfig_();
  var v = wwValidate_(body, cfg);
  if (!v.ok) return v;
  var b = v.b;

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'המערכת עמוסה רגע — נסה/י שוב' }; }
  try {
    var list = wwActiveForDate_(b.date);
    var fit = wwFits_(b, list, cfg, fid);
    if (!fit.ok) return { ok: false, error: fit.error, conflict: true };

    b.id = 'WW-' + b.date.replace(/-/g, '') + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    b.familyId = fid;
    b.uid = doorCallerUid_(ss, perm);
    b.status = 'active';
    b.calEventId = '';
    b.createdAtMs = Date.now();
    b.enteredAtMs = 0;
    b.schema = 1;
    b.updatedAt = new Date();

    /* יומן — אם נכשל, השריון עדיין תקף. השעתי ישלים את האירוע. */
    try { b.calEventId = wwCreateEvent_(b, perm.family); } catch (e) { Logger.log('weworkBook_ calendar: ' + e); }
    fsSet_(fsDocPath_(FS_WW_BOOK, b.id), b);
    list.push(b);
    wwRebuildDay_(b.date, list);
  } finally { lock.releaseLock(); }

  try {
    sendResidentTemplate_(ss, 'WEWORK_BOOKED', body._email ? [body._email] : [], {
      'שם': perm.firstName || perm.family || 'תושב',
      'עמדה': WW_SEAT_LABEL[b.seat],
      'תאריך': wwHebDate_(b.date),
      'שעה': wwHH_(b.from) + '–' + wwHH_(b.to)
    }, { familyId: fid });
  } catch (e) { Logger.log('WEWORK_BOOKED: ' + e); }
  return { ok: true, booking: wwPublicBooking_(b) };
}

/** מה שחוזר ללקוח — אותם שדות שהוא קורא מ-Firestore, בלי calEventId. */
function wwPublicBooking_(b) {
  return { id: b.id, date: b.date, from: b.from, to: b.to, hours: b.hours, seat: b.seat,
           familyId: b.familyId, status: b.status, enteredAtMs: b.enteredAtMs || 0 };
}

/* ---------------------------------------------------------------------------
 *  weworkCancel — ביטול (המשפחה עצמה או מנהל WeWork)
 * ------------------------------------------------------------------------- */
function weworkCancel_(ss, body) {
  var perm = body._perm || {};
  var id = String(body.id || '');
  if (!fsIdOk_(id) || id.indexOf('WW-') !== 0) return { ok: false, error: 'מזהה שריון לא תקין' };
  var isAdmin = !!(perm.isSuper || (perm.perms || []).indexOf(PERM_WEWORK) !== -1);

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'המערכת עמוסה רגע — נסה/י שוב' }; }
  var b;
  try {
    b = fsGet_(fsDocPath_(FS_WW_BOOK, id));
    if (!b) return { ok: false, error: 'השריון לא נמצא' };
    var mine = String(b.familyId) === String(perm.familyId || '');
    if (!mine && !isAdmin) return { ok: false, error: 'אין הרשאה לבטל שריון זה' };
    if (b.status !== 'active') return { ok: false, error: 'השריון כבר בוטל' };
    var now = new Date();
    if (b.date < wwDateStr_(now) || (b.date === wwDateStr_(now) && b.to * 60 <= wwNowMin_(now))) {
      return { ok: false, error: 'השריון כבר הסתיים' };
    }
    var by = mine ? 'self' : 'admin';
    fsMerge_(fsDocPath_(FS_WW_BOOK, id), {
      status: 'canceled', canceledBy: by, canceledAtMs: Date.now(), updatedAt: new Date()
    });
    b.status = 'canceled'; b.canceledBy = by;
    wwDeleteEvent_(b.calEventId);
    wwRebuildDay_(b.date);
  } finally { lock.releaseLock(); }

  try {
    var emails = b.canceledBy === 'self' ? (body._email ? [body._email] : []) : emailsForFamilyId_(ss, b.familyId);
    sendResidentTemplate_(ss, 'WEWORK_CANCELED', emails, {
      'שם': 'תושב',
      'עמדה': WW_SEAT_LABEL[b.seat] || '',
      'תאריך': wwHebDate_(b.date),
      'שעה': wwHH_(b.from) + '–' + wwHH_(b.to),
      'מי': b.canceledBy === 'self' ? 'לבקשתך' : 'על ידי מנהל ה-WeWork'
    }, { familyId: b.familyId });
  } catch (e) { Logger.log('WEWORK_CANCELED: ' + e); }
  return { ok: true, id: id, canceledBy: b.canceledBy };
}

/* ---------------------------------------------------------------------------
 *  weworkSaveConfig — מנהל WeWork עורך את כללי השריון
 * ------------------------------------------------------------------------- */
function weworkSaveConfig_(ss, body) {
  var patch = {};
  var errs = [];
  Object.keys(WW_LIMITS).forEach(function (k) {
    if (body[k] === undefined || body[k] === null || body[k] === '') return;
    var n = parseInt(body[k], 10);
    var lim = WW_LIMITS[k];
    if (isNaN(n) || n < lim[0] || n > lim[1]) { errs.push(k); return; }
    patch[k] = n;
  });
  if (errs.length) return { ok: false, error: 'ערך לא תקין: ' + errs.join(', ') };
  var cur = wwConfig_();
  var next = {}; Object.keys(cur).forEach(function (k) { next[k] = k in patch ? patch[k] : cur[k]; });
  if (next.viewFrom >= next.viewTo) return { ok: false, error: 'שעת תחילת התצוגה חייבת להיות לפני הסוף' };
  if (next.regularFrom >= next.regularTo) return { ok: false, error: 'השעות הרגילות לא תקינות' };
  if (next.desks + next.lounge < 1) return { ok: false, error: 'צריך לפחות עמדה אחת' };
  next.schema = 1; next.updatedAt = new Date();
  fsSet_(fsDocPath_(FS_WW_CONFIG, 'main'), next);
  WW_CFG_MEMO_ = null;
  return { ok: true, config: wwConfig_() };
}

/* ---------------------------------------------------------------------------
 *  מי הזכאי לפתוח עכשיו
 * ------------------------------------------------------------------------- */
function doorCallerUid_(ss, perm) {
  try {
    if (!perm || !perm.rowIndex || !perm.slot) return '';
    return fbUidForSlot_(ss.getSheetByName('תושבים'), perm.rowIndex, perm.slot) || '';
  } catch (e) { return ''; }
}

/** השריון הפעיל של המשפחה ברגע הזה (או null). */
function wwActiveNowFor_(familyId, bookingId, now) {
  now = now || new Date();
  var today = wwDateStr_(now), min = wwNowMin_(now);
  var hits = wwActiveForDate_(today).filter(function (b) {
    return String(b.familyId) === String(familyId) && b.from * 60 <= min && min < b.to * 60;
  });
  if (!hits.length) return null;
  if (bookingId) { for (var i = 0; i < hits.length; i++) if (hits[i].id === bookingId) return hits[i]; }
  return hits[0];
}

/** מנוי מכון בתוקף — **אותה** gymRowEntitled_ שקובעת את קוד הכניסה. */
function doorGymEntitled_(ss, email) {
  var target = normalizeEmail_(email);
  if (!target) return null;
  var chosen = null;
  readTable_(ss, GYM_SHEET).forEach(function (row) {
    if (normalizeEmail_(String(row['אימייל'] || '')) === target) chosen = gymPickRow_(chosen, row);
  });
  return chosen ? gymRowEntitled_(chosen) : null;
}

/* ---------------------------------------------------------------------------
 *  doorOpen — הלחיצה על הכפתור
 * ------------------------------------------------------------------------- */
function doorOpen_(ss, body) {
  var perm = body._perm || {};
  var fid = String(perm.familyId || '').trim();
  var reason = String(body.reason || '');
  if (['wework', 'gym', 'admin'].indexOf(reason) === -1) return { ok: false, error: 'סיבת כניסה לא מוכרת' };

  /* ריסון: לחיצה כפולה לא שולחת שתי פקודות למנעול. */
  var cache = CacheService.getScriptCache();
  var rk = 'door:' + (fid || body._email);
  if (cache.get(rk)) return { ok: false, error: 'הפקודה כבר נשלחה — רגע אחד', code: 'BUSY' };

  var booking = null;
  if (reason === 'wework') {
    booking = wwActiveNowFor_(fid, String(body.bookingId || ''));
    if (!booking) return { ok: false, code: 'NOT_NOW', error: 'אין לך שריון פעיל כרגע' };
  } else if (reason === 'gym') {
    if (!doorGymOn_()) return { ok: false, code: 'GYM_CODE', error: 'הכניסה למכון עדיין בקוד — הוא מופיע בכרטיס המנוי' };
    if (!doorGymEntitled_(ss, body._email)) return { ok: false, code: 'NOT_NOW', error: 'המנוי אינו בתוקף' };
  } else {
    var ps = perm.perms || [];
    var admin = perm.isSuper || ps.indexOf(PERM_GYM) !== -1 || ps.indexOf(PERM_WEWORK) !== -1;
    if (!admin) return { ok: false, error: 'אין לך הרשאה לפעולה הזו' };
  }

  var mode = doorMode_();
  if (mode === 'off') return { ok: false, code: 'DOOR_OFF', error: 'הדלת עדיין לא מחוברת לאפליקציה' };
  cache.put(rk, '1', 5);

  var res;
  if (mode === 'sim') { Utilities.sleep(1200); res = { ok: true }; }
  else res = nukiUnlatch_();

  var result = mode === 'sim' ? 'sim' : (res.ok ? 'ok' : 'fail');
  doorLogWrite_({
    kind: reason, familyId: fid, uid: doorCallerUid_(ss, perm), source: 'app',
    result: result, error: res.ok ? '' : String(res.error || '').slice(0, 200),
    bookingId: booking ? booking.id : ''
  });

  if (!res.ok) {
    doorAlert_(ss, 'fail', 'פתיחת הדלת מהאפליקציה נכשלה: ' + (res.error || 'המנעול לא ענה'));
    return { ok: false, code: 'NUKI_FAIL', error: 'הדלת לא נפתחה. ייתכן שהמנעול לא מחובר לרשת.', contact: doorContact_() };
  }
  if (booking && !booking.enteredAtMs) {
    try { fsMerge_(fsDocPath_(FS_WW_BOOK, booking.id), { enteredAtMs: Date.now(), updatedAt: new Date() }); } catch (e) { }
  }
  return { ok: true, simulated: mode === 'sim' };
}

function doorLogWrite_(e) {
  try {
    var now = new Date();
    var id = 'D-' + now.getTime() + '-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    e.id = id;
    e.atMs = now.getTime();
    e.day = wwDateStr_(now);
    e.schema = 1;
    e.updatedAt = now;
    fsSet_(fsDocPath_(FS_DOOR_LOG, id), e);
  } catch (err) { Logger.log('doorLogWrite_: ' + err); }
}

/* ---------------------------------------------------------------------------
 *  התראות למנהל המכון — פעם אחת לכל מעבר מצב, לא כל שעה
 * ------------------------------------------------------------------------- */
function doorAlert_(ss, kind, text) {
  try {
    var st = {};
    try { st = JSON.parse(doorProp_('DOOR_ALERT_STATE') || '{}'); } catch (e) { st = {}; }
    var now = Date.now();
    if (kind === 'fail') {
      if (st.failAt && now - st.failAt < 30 * 60 * 1000) return;   /* לכל היותר פעם בחצי שעה */
      st.failAt = now;
    } else {
      if (st[kind]) return;                                          /* כבר התרענו על המצב הזה */
      st[kind] = now;
    }
    doorPropSet_('DOOR_ALERT_STATE', JSON.stringify(st));
    notifyAdmins_(ss, PERM_GYM, 'ADMIN_DOOR_ALERT', {
      'בעיה': text, 'זמן': Utilities.formatDate(new Date(), wwTz_(), 'dd/MM HH:mm')
    });
  } catch (e) { Logger.log('doorAlert_: ' + e); }
}
function doorAlertClear_(kind) {
  try {
    var st = JSON.parse(doorProp_('DOOR_ALERT_STATE') || '{}');
    if (st[kind]) { delete st[kind]; doorPropSet_('DOOR_ALERT_STATE', JSON.stringify(st)); }
  } catch (e) { }
}

/* ---------------------------------------------------------------------------
 *  Nuki Web API — שכבה אחת, כל קריאה עוברת כאן
 * ------------------------------------------------------------------------- */
function nukiReq_(method, path, payload) {
  var token = nukiToken_();
  if (!token) return { ok: false, code: 0, error: 'חסר NUKI_API_TOKEN' };
  var opt = {
    method: method, muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }
  };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  try {
    var r = UrlFetchApp.fetch(NUKI_BASE + path, opt);
    var code = r.getResponseCode(), text = r.getContentText() || '';
    var json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (code >= 200 && code < 300) return { ok: true, code: code, json: json };
    return { ok: false, code: code, json: json, error: 'Nuki ' + code + ': ' + text.slice(0, 160) };
  } catch (e) {
    return { ok: false, code: -1, error: 'Nuki לא זמין: ' + e };
  }
}
function nukiUnlatch_() {
  var id = nukiLockId_();
  if (!id) return { ok: false, error: 'חסר NUKI_SMARTLOCK_ID' };
  return nukiReq_('post', '/smartlock/' + encodeURIComponent(id) + '/action', { action: NUKI_ACTION_UNLATCH });
}
/** רשימת המנעולים בחשבון — לבחירת המזהה במסך הדלת. */
function nukiListLocks_() {
  var r = nukiReq_('get', '/smartlock');
  if (!r.ok) return r;
  return { ok: true, locks: (r.json || []).map(function (l) {
    return { id: String(l.smartlockId), name: String(l.name || ''), type: l.type };
  }) };
}
function nukiLockInfo_() {
  var id = nukiLockId_();
  if (!id) return { ok: false, error: 'חסר NUKI_SMARTLOCK_ID' };
  var r = nukiReq_('get', '/smartlock/' + encodeURIComponent(id));
  if (!r.ok) return r;
  var j = r.json || {}, s = j.state || {};
  return {
    ok: true,
    online: j.serverState === 0 || j.serverState === undefined,
    battery: typeof s.batteryCharge === 'number' ? s.batteryCharge : -1,
    batteryCritical: !!s.batteryCritical,
    lockState: typeof s.state === 'number' ? s.state : -1
  };
}
function nukiAuthBody_(accountUserId, name, until) {
  return {
    name: String(name || 'מנוי מכון').slice(0, 32),
    type: 0,                                   /* הזמנה לאפליקציית Nuki */
    accountUserId: accountUserId,
    smartlockIds: [Number(nukiLockId_())],
    remoteAllowed: true,
    allowedFromDate: new Date().toISOString(),
    allowedUntilDate: until.toISOString(),
    /* ⚠️ מלכודת מתועדת בפורום של Nuki: בלי allowedWeekDays=127
       הגבלת התאריכים פשוט לא נכנסת לתוקף. */
    allowedWeekDays: 127,
    allowedFromTime: 0,
    allowedUntilTime: 0
  };
}
function nukiEnsureAccountUser_(email, name) {
  var r = nukiReq_('put', '/account/user', { email: email, name: String(name || email).slice(0, 32) });
  if (r.ok && r.json && r.json.accountUserId) return { ok: true, id: r.json.accountUserId };
  /* כבר קיים — מחפשים לפי המייל */
  var l = nukiReq_('get', '/account/user?email=' + encodeURIComponent(email));
  if (l.ok) {
    var arr = Array.isArray(l.json) ? l.json : (l.json ? [l.json] : []);
    for (var i = 0; i < arr.length; i++) {
      if (normalizeEmail_(arr[i].email) === normalizeEmail_(email)) return { ok: true, id: arr[i].accountUserId };
    }
  }
  return { ok: false, error: r.error || l.error || 'יצירת משתמש Nuki נכשלה' };
}
function nukiListAuths_() {
  var r = nukiReq_('get', '/smartlock/' + encodeURIComponent(nukiLockId_()) + '/auth');
  if (!r.ok) return r;
  return { ok: true, list: r.json || [] };
}
function nukiFindAuth_(auths, accountUserId) {
  for (var i = 0; i < auths.length; i++) if (auths[i].accountUserId === accountUserId) return auths[i];
  return null;
}

/* ---------------------------------------------------------------------------
 *  מנויי המכון ↔ הרשאות Nuki (שעתי, רק ב-live ורק כשהמכון עבר לדלת)
 *  🔑 Nuki עצמה אוכפת את התפוגה (allowedUntilDate = סוף המנוי) — גם אם
 *     הסנכרון הזה ייכשל, הגישה לא נשארת פתוחה אחרי סוף המנוי.
 * ------------------------------------------------------------------------- */
function doorGymNukiSync_(ss, onlyEmail) {
  var out = { invited: 0, updated: 0, revoked: 0, errors: 0, skipped: '' };
  if (doorMode_() !== 'live') { out.skipped = 'mode'; return out; }
  if (!doorGymOn_()) { out.skipped = 'gymOff'; return out; }

  var byEmail = gymUidByEmail_(ss);
  var rows = readTable_(ss, GYM_SHEET);
  var pick = {};
  rows.forEach(function (row) {
    var em = normalizeEmail_(String(row['אימייל'] || ''));
    if (!em || (onlyEmail && em !== normalizeEmail_(onlyEmail))) return;
    pick[em] = gymPickRow_(pick[em], row);
  });
  var docs = {};
  fsList_(FS_GYM_NUKI).forEach(function (d) { docs[d.id] = d.data; });
  var authsR = nukiListAuths_();
  var auths = authsR.ok ? authsR.list : [];
  var budget = 8;                            /* לכל היותר 8 הזמנות חדשות בריצה */
  var entitledUids = {};

  Object.keys(pick).forEach(function (em) {
    var row = pick[em], uid = byEmail[em];
    var until = gymRowEntitled_(row);
    if (!uid || !until) return;
    entitledUids[uid] = true;
    var expiry = gymCodeExpiry_(until);
    var doc = docs[uid];
    var name = (String(row['שם פרטי'] || '') + ' ' + String(row['שם משפחה'] || '')).trim();
    try {
      if (!doc || !doc.authId || doc.state === 'expired' || doc.state === 'error') {
        if (budget-- <= 0) return;
        var u = nukiEnsureAccountUser_(em, name);
        if (!u.ok) throw new Error(u.error);
        var existing = nukiFindAuth_(auths, u.id);
        var c = existing ? nukiReq_('post', '/smartlock/' + nukiLockId_() + '/auth/' + existing.id, nukiAuthBody_(u.id, name, expiry))
                         : nukiReq_('put', '/smartlock/auth', nukiAuthBody_(u.id, name, expiry));
        if (!c.ok) throw new Error(c.error);
        var again = existing || nukiFindAuth_((nukiListAuths_().list || []), u.id);
        fsSet_(fsDocPath_(FS_GYM_NUKI, uid), {
          uid: uid, state: 'sent', accountUserId: u.id, authId: again ? String(again.id) : '',
          validUntil: expiry, sentAtMs: Date.now(), schema: 1, updatedAt: new Date()
        });
        out.invited++;
        sendResidentTemplate_(ss, 'GYM_NUKI_INVITE', [em], {
          'שם': String(row['שם פרטי'] || 'מנוי'),
          'עד': Utilities.formatDate(until, wwTz_(), 'dd/MM/yyyy')
        }, {});
      } else if (doorTime_(doc.validUntil) !== expiry.getTime()) {
        var up = nukiReq_('post', '/smartlock/' + nukiLockId_() + '/auth/' + doc.authId, nukiAuthBody_(doc.accountUserId, name, expiry));
        if (!up.ok) throw new Error(up.error);
        fsMerge_(fsDocPath_(FS_GYM_NUKI, uid), { validUntil: expiry, updatedAt: new Date() });
        out.updated++;
      }
    } catch (e) {
      out.errors++;
      try { fsMerge_(fsDocPath_(FS_GYM_NUKI, uid), { uid: uid, state: 'error', error: String(e).slice(0, 160), schema: 1, updatedAt: new Date() }); } catch (e2) { }
    }
  });

  if (!onlyEmail) {
    Object.keys(docs).forEach(function (uid) {
      var d = docs[uid];
      if (entitledUids[uid] || !d || (d.state !== 'sent' && d.state !== 'active')) return;
      try {
        if (d.authId) nukiReq_('delete', '/smartlock/' + nukiLockId_() + '/auth/' + d.authId);
        fsMerge_(fsDocPath_(FS_GYM_NUKI, uid), { state: 'expired', authId: '', updatedAt: new Date() });
        out.revoked++;
      } catch (e) { out.errors++; }
    });
  }
  return out;
}

/** זמן במילישניות מכל צורה ש-Firestore מחזיר (Date / מחרוזת ISO). */
function doorTime_(v) {
  if (!v) return 0;
  if (typeof v.getTime === 'function') return v.getTime();
  var t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/** ביטול מיידי כשמנוי נמחק (נקרא מ-deleteGymMembership_). */
function doorGymNukiRevoke_(uid) {
  if (!uid) return;
  try {
    var d = fsGet_(fsDocPath_(FS_GYM_NUKI, uid));
    if (!d) return;
    if (d.authId && nukiToken_()) nukiReq_('delete', '/smartlock/' + nukiLockId_() + '/auth/' + d.authId);
    fsDelete_(fsDocPath_(FS_GYM_NUKI, uid));
  } catch (e) { Logger.log('doorGymNukiRevoke_: ' + e); }
}

/* ---------------------------------------------------------------------------
 *  יומן Nuki → doorLog: פתיחות מאפליקציית Nuki/השעון של מנויי המכון
 * ------------------------------------------------------------------------- */
function doorNukiLogImport_() {
  var out = { imported: 0 };
  var r = nukiReq_('get', '/smartlock/' + encodeURIComponent(nukiLockId_()) + '/log?limit=40');
  if (!r.ok) { out.error = r.error; return out; }
  var mark = Number(doorProp_('DOOR_NUKI_LOG_MARK') || 0), maxMark = mark;
  var byAuth = {};
  fsList_(FS_GYM_NUKI).forEach(function (d) { if (d.data && d.data.authId) byAuth[String(d.data.authId)] = d.data; });
  (r.json || []).forEach(function (e) {
    var t = new Date(e.date).getTime();
    if (!t || t <= mark) return;
    if (t > maxMark) maxMark = t;
    var who = byAuth[String(e.authId)];
    if (!who) return;                           /* רק פתיחות של מנויים מאפליקציית Nuki */
    var member = null;
    try { member = fsGet_(fsDocPath_('members', who.uid)); } catch (x) { }
    doorLogWrite_({ kind: 'gym', familyId: member ? String(member.familyId || '') : '', uid: who.uid,
                    source: 'nuki', result: 'ok', error: '', bookingId: '' });
    if (who.state === 'sent') {
      try { fsMerge_(fsDocPath_(FS_GYM_NUKI, who.uid), { state: 'active', updatedAt: new Date() }); } catch (x) { }
      who.state = 'active';
    }
    out.imported++;
  });
  if (maxMark > mark) doorPropSet_('DOOR_NUKI_LOG_MARK', String(maxMark));
  return out;
}

/* ---------------------------------------------------------------------------
 *  בריאות המנעול → doorState/main + התראות מעבר מצב
 * ------------------------------------------------------------------------- */
function doorHealth_(ss) {
  var mode = doorMode_();
  var doc = { mode: mode, gymOn: doorGymOn_(), tokenSet: !!nukiToken_(), lockIdSet: !!nukiLockId_(),
              online: false, battery: -1, batteryCritical: false, lockState: -1,
              lastCheckMs: Date.now(), error: '', schema: 1, updatedAt: new Date() };
  if (mode === 'live') {
    var info = nukiLockInfo_();
    if (!info.ok) {
      doc.error = String(info.error || '').slice(0, 200);
      doorAlert_(ss, 'offline', 'לא ניתן להתחבר למנעול: ' + doc.error);
    } else {
      doc.online = info.online; doc.battery = info.battery;
      doc.batteryCritical = info.batteryCritical; doc.lockState = info.lockState;
      if (!info.online) doorAlert_(ss, 'offline', 'המנעול התנתק מהרשת');
      else doorAlertClear_('offline');
      if (info.batteryCritical || (info.battery >= 0 && info.battery < 20)) {
        doorAlert_(ss, 'battery', 'הסוללה של המנעול חלשה (' + (info.battery >= 0 ? info.battery + '%' : 'קריטית') + ')');
      } else doorAlertClear_('battery');
    }
  } else if (mode === 'sim') {
    doc.online = true; doc.battery = 100;
  }
  fsSet_(fsDocPath_(FS_DOOR_STATE, 'main'), doc);
  return doc;
}

/* ---------------------------------------------------------------------------
 *  השלמת אירועי יומן חסרים (אם יצירת האירוע נכשלה בזמן השריון)
 * ------------------------------------------------------------------------- */
function wwCalendarReconcile_(ss) {
  var out = { created: 0 };
  var today = wwDateStr_(new Date());
  var cfg = wwConfig_();
  for (var i = 0; i <= cfg.advanceDays && out.created < 20; i++) {
    var date = wwAddDays_(today, i);
    var list = wwActiveForDate_(date);
    list.forEach(function (b) {
      if (b.calEventId || out.created >= 20) return;
      try {
        var p = permissionsForFamily_(ss, b.familyId);
        var evId = wwCreateEvent_(b, p);
        fsMerge_(fsDocPath_(FS_WW_BOOK, b.id), { calEventId: evId, updatedAt: new Date() });
        out.created++;
      } catch (e) { Logger.log('wwCalendarReconcile_: ' + e); }
    });
  }
  return out;
}
/** שם המשפחה לפי מזהה — רק לכותרת האירוע ביומן (שנמצא בדרייב של הגזבר). */
var WW_FAM_NAMES_MEMO_ = null;
function permissionsForFamily_(ss, familyId) {
  try {
    if (!WW_FAM_NAMES_MEMO_) WW_FAM_NAMES_MEMO_ = txFamilyNames_(ss) || {};
    return WW_FAM_NAMES_MEMO_[familyId] || '';
  } catch (e) { return ''; }
}

/** שלב בשעתי (hourlyJobsRun_). */
function doorHourly_(ss) {
  var out = { ensure: null, cal: null, health: null, gym: null, log: null };
  out.ensure = doorEnsureDocs_();
  out.cal = wwCalendarReconcile_(ss);
  out.health = doorHealth_(ss);
  if (doorMode_() === 'live') {
    out.gym = doorGymNukiSync_(ss);
    out.log = doorNukiLogImport_();
  }
  return out;
}

/* ---------------------------------------------------------------------------
 *  פעולות ניהול
 * ------------------------------------------------------------------------- */
/** מסך הדלת (מנהל מכון): מצב + רענון בריאות. בלי סודות בתשובה. */
function doorStatus_(ss, body) {
  var st = doorHealth_(ss);
  var perm = body._perm || {};
  return {
    ok: true, mode: doorMode_(), modeRaw: doorModeRaw_(), gymOn: doorGymOn_(),
    tokenSet: !!nukiToken_(), lockId: perm.isSuper ? nukiLockId_() : (nukiLockId_() ? 'set' : ''),
    contact: doorContact_(), state: {
      online: st.online, battery: st.battery, batteryCritical: st.batteryCritical,
      lastCheckMs: st.lastCheckMs, error: st.error
    }
  };
}

/** מנהל-על: מצב הדלת, מעבר המכון לדלת, טוקן ומזהה מנעול.
 *  🔐 הטוקן נכנס ל-Script Properties ולעולם אינו חוזר בתשובה. */
function doorConfigure_(ss, body) {
  if (body.token !== undefined && body.token !== null && String(body.token).trim() !== '') {
    var tok = String(body.token).trim();
    if (tok.length < 20 || /\s/.test(tok)) return { ok: false, error: 'הטוקן לא נראה תקין' };
    doorPropSet_('NUKI_API_TOKEN', tok);
  }
  if (body.clearToken === true) doorPropSet_('NUKI_API_TOKEN', '');
  if (body.lockId !== undefined && body.lockId !== null) {
    var lid = String(body.lockId).trim();
    if (lid && !/^\d{3,20}$/.test(lid)) return { ok: false, error: 'מזהה המנעול צריך להיות מספר' };
    doorPropSet_('NUKI_SMARTLOCK_ID', lid);
  }
  if (body.mode !== undefined) {
    var m = String(body.mode);
    if (DOOR_MODES.indexOf(m) === -1) return { ok: false, error: 'מצב לא מוכר' };
    if (m === 'live' && !(nukiToken_() && nukiLockId_())) return { ok: false, error: 'למצב אמיתי צריך טוקן ומזהה מנעול' };
    doorPropSet_('DOOR_MODE', m);
  }
  if (body.gymOn !== undefined) doorPropSet_('DOOR_GYM_ON', body.gymOn === true || body.gymOn === 'true' ? '1' : '');
  doorWritePublic_();
  var out = doorStatus_(ss, body);
  /* המעבר של המכון לדלת משנה את מה שנכתב ל-gymCode — מסנכרנים מיד
     ולא מחכים לשעתי, אחרת קוד שבוטל ממשיך להופיע עד שעה. */
  if (body.gymOn !== undefined) { try { gymStatusSyncAll_(ss); } catch (e) { Logger.log('gymStatusSyncAll_ אחרי doorConfigure: ' + e); } }
  return out;
}

/** מנהל-על: בדיקת חיבור ל-Nuki + רשימת המנעולים (לבחירת המזהה). */
function doorTestConnection_(ss, body) {
  var r = nukiListLocks_();
  if (!r.ok) return { ok: false, error: r.error || 'החיבור נכשל' };
  return { ok: true, locks: r.locks };
}

function doorSaveContact_(ss, body) {
  var name = String(body.name || '').trim().slice(0, 40);
  var phone = String(body.phone || '').replace(/[^\d+\-\s]/g, '').trim().slice(0, 20);
  doorPropSet_('DOOR_CONTACT', JSON.stringify({ name: name, phone: phone }));
  return { ok: true, contact: doorContact_() };
}

/** מנוי מכון מבקש לשלוח שוב את הזמנת Nuki. */
function doorGymResend_(ss, body) {
  if (doorMode_() !== 'live' || !doorGymOn_()) return { ok: false, error: 'ההזמנות ל-Nuki עדיין לא פעילות' };
  var perm = body._perm || {};
  var uid = doorCallerUid_(ss, perm);
  if (!uid) return { ok: false, error: 'צריך להתחבר לאפליקציה פעם אחת לפני כן' };
  try { fsMerge_(fsDocPath_(FS_GYM_NUKI, uid), { uid: uid, state: 'expired', authId: '', schema: 1, updatedAt: new Date() }); } catch (e) { }
  var r = doorGymNukiSync_(ss, body._email);
  return r.invited ? { ok: true } : { ok: false, error: 'לא הצלחנו לשלוח — ייתכן שהמנוי אינו בתוקף' };
}
