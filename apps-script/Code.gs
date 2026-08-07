/**
 * גשר Google Sheets ↔ אפליקציית ניהול תקציב ועד קהילה
 * ------------------------------------------------------------
 *  doGet  — קריאה: מחזיר את כל השנים/סעיפים/הכנסות/תנועות כ-JSON.
 *  doPost — כתיבה (מוגנת בסיסמה): שמירת/מחיקת תנועה, יצירת שנה.
 *
 *  התקנה/עדכון:
 *    1. בגיליון: Extensions → Apps Script → מדביקים את כל הקוד הזה → שומרים.
 *    2. Deploy → Manage deployments → עיפרון (Edit) → Version: New version → Deploy.
 *       (Execute as: Me · Who has access: Anyone — הכתובת נשארת אותו דבר.)
 */

// מיפוי מפתחות פנימיים (מהאפליקציה) -> עברית (בגיליון)
var STATUS_HE = { submitted: 'הוגשה קבלה', review: 'בבדיקה', ready: 'הועבר להנה"ח', paid: 'שולם', rejected: 'נדחה' };
var TYPE_HE   = { refund: 'החזר לדייר', supplier: 'תשלום לספק', general: 'הוצאה כללית' };
var SOURCE_HE = { admin: 'מנהל', resident: 'תושב' };
var DIST_HE   = { equal: 'שווה', custom: 'מותאם', unplanned: 'שנתי' };
// כותרות עמודות התכנון החודשי בטאב התקציב (ספט' עד אוג')
var MONTH_KEYS = ['תכנון ספט','תכנון אוק','תכנון נוב','תכנון דצמ','תכנון ינו','תכנון פבר',
                  'תכנון מרץ','תכנון אפר','תכנון מאי','תכנון יוני','תכנון יולי','תכנון אוג'];

// יומן ה-Google Calendar הייעודי לשריון המועדון (שלב 8). יש ליועד גישת עריכה אליו,
// והסקריפט רץ "כמוני" (Execute as: Me) — אז CalendarApp.getCalendarById עובד ישירות.
var CLUB_CALENDAR_ID = 'c_8878c4353341b9211ce8db109c74c713ed8ffcf4813fe8a1aa4e60199264edc9@group.calendar.google.com';

// כותרת עמודת "מזהה קבוע" בטאב "תושבים" (2026-08-06). זהו המזהה היציב של המשפחה —
// לא מספר הבית (שיכול להשתנות כשדיירים עוברים בין בתים) ולא שם המשפחה (יכול להיות
// לא-ייחודי/להשתנות). נוצר ומתמלא פעם אחת ע"י assignResidentIds_ ולא משתנה לעולם.
var RESIDENT_ID_HEADER = 'מזהה קבוע';

/* ============================================================================
 *  הרשאות ומידור (2026-08-07)
 * ----------------------------------------------------------------------------
 *  המודל:
 *    • כל מי שרשום בטאב "תושבים" ומסומן פעיל הוא **תושב** — הבסיס, ללא הרשאה מיוחדת.
 *    • מעל זה יש **מידורים**: תקציב / מועדון / תושבים. כל אחד נותן גישה לקבוצת
 *      מסכים אחת בלבד.
 *    • **מנהל על** ('על') רואה הכול, והוא היחיד שרשאי לשנות הרשאות של אחרים.
 *
 *  איפה זה נשמר: עמודות "הרשאות 1", "הרשאות 2" בטאב "תושבים", אחת לכל משבצת
 *  אימייל, בדיוק כמו "שם פרטי 1"/"שם פרטי 2" — ההתאמה היא **לפי סדר**. כך שני בני
 *  זוג באותו משק בית יכולים לקבל הרשאות שונות. הערך הוא רשימה מופרדת בפסיקים.
 *
 *  תאימות לאחור: שורה שעמודת ההרשאות שלה ריקה אבל עמודת "תפקיד" הישנה שלה היא
 *  "מנהל" — נחשבת מנהל על. כך שום דבר לא נשבר עד שממלאים את העמודות החדשות.
 * ========================================================================== */
var PERM_SUPER     = 'על';
var PERM_BUDGET    = 'תקציב';
var PERM_CLUB      = 'מועדון';
var PERM_RESIDENTS = 'תושבים';
var ALL_PERMS = [PERM_SUPER, PERM_BUDGET, PERM_CLUB, PERM_RESIDENTS];
var PERM_HEADER = 'הרשאות';
// דרישה מיוחדת: "כל הרשאת ניהול שהיא" — לפעולות שמשרתות כמה מידורים,
// כמו ספריית השמות להשלמה אוטומטית בטופס ההוצאה
var PERM_ANY_ADMIN = '*';

/* איזו הרשאה נדרשת לכל פעולה. פעולה שאינה מופיעה כאן מותרת לכל תושב מחובר ופעיל
 * (למשל הגשת קבלה או שריון מועדון — פעולות של סביבת התושב). */
var ACTION_PERMS = {
  // ניהול תקציב ותשלומים
  saveTransaction: PERM_BUDGET, deleteTransaction: PERM_BUDGET, saveBudget: PERM_BUDGET,
  setBudgetMeta: PERM_BUDGET, renameCategory: PERM_BUDGET, logBudgetUpdate: PERM_BUDGET,
  addYear: PERM_BUDGET, saveColumnValues: PERM_BUDGET, ensureColumns: PERM_BUDGET,
  saveColumnConfig: PERM_BUDGET, deleteReceiptFile: PERM_BUDGET,
  // ניהול מועדון
  clubList: PERM_CLUB, approveClubReservation: PERM_CLUB, rejectClubReservation: PERM_CLUB,
  // ניהול תושבים
  getResidents: PERM_RESIDENTS, assignResidentIds: PERM_RESIDENTS, listSignups: PERM_RESIDENTS,
  // ספריית שמות בלבד (בלי מייל/טלפון) — צריכה גם למי שמנהל תקציב, בשביל
  // השלמת שם הרוכש בטופס ההוצאה. לכן: כל הרשאת ניהול, ולא "תושבים" דווקא.
  residentDirectory: PERM_ANY_ADMIN,
  approveSignup: PERM_RESIDENTS, rejectSignup: PERM_RESIDENTS, saveResidentRow: PERM_RESIDENTS,
  ensureResidentCols: PERM_RESIDENTS, replaceFamily: PERM_RESIDENTS, exportResidents: PERM_RESIDENTS,
  createResidents: PERM_RESIDENTS,
  saveResidentNames: PERM_RESIDENTS, formatResidents: PERM_RESIDENTS, saveFamilyIds: PERM_RESIDENTS,
  // מנהל על בלבד
  savePermissions: PERM_SUPER, ensurePermissionCols: PERM_SUPER
};

/** הסוד שבו נחתמים מושבי ההתחברות. נוצר פעם אחת ונשמר במאפייני הסקריפט. */
function sessionSecret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('CBA_SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props.setProperty('CBA_SESSION_SECRET', s); }
  return s;
}

/* מושב חתום (2026-08-07). למה לא להשתמש בטוקן של גוגל לכל כתיבה? כי הוא פג אחרי
 * כשעה, והמשתמש היה נזרק באמצע העבודה. במקום זה: מאמתים את טוקן גוגל **פעם אחת**
 * בהתחברות, ומנפיקים מושב חתום ב-HMAC שתקף 30 יום. ההרשאות עצמן נקראות מהגיליון
 * בכל בקשה מחדש — כך ששלילת הרשאה נכנסת לתוקף מיד, בלי להמתין לפקיעת המושב. */
function makeSession_(email) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    e: String(email || '').toLowerCase(), x: Date.now() + 30 * 24 * 3600 * 1000
  }));
  var sig = Utilities.base64EncodeWebSafe(
    Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
  return payload + '.' + sig;
}

function verifySession_(token) {
  try {
    var t = String(token || '');
    var i = t.indexOf('.');
    if (i < 1) return null;
    var payload = t.substring(0, i), sig = t.substring(i + 1);
    var expect = Utilities.base64EncodeWebSafe(
      Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
    if (sig !== expect) return null;
    var obj = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString());
    if (!obj || !obj.e || !obj.x || obj.x < Date.now()) return null;
    return { email: String(obj.e) };
  } catch (err) { return null; }
}

/** ממיר ערך תא לרשימת קודי הרשאה תקינים. סובלני לפסיק/נקודה-פסיק/קו נטוי. */
function parsePerms_(raw) {
  return String(raw || '').split(/[,;|\/]/).map(function (s) { return s.trim(); })
    .filter(function (s) { return s && ALL_PERMS.indexOf(s) !== -1; })
    .filter(function (s, i, a) { return a.indexOf(s) === i; });
}

/** ההרשאות בפועל של אימייל נתון, נקראות מהגיליון בזמן אמת. */
function permissionsFor_(email) {
  var r = lookupResident_(email);
  if (!r.found) return { found: false, active: false, perms: [], isSuper: false };
  var active = !(r.status && r.status.indexOf('פעיל') === -1);
  var perms = parsePerms_(r.permissions);
  // תאימות לאחור לעמודת "תפקיד" הישנה
  if (!perms.length && r.role && r.role.indexOf('מנהל') !== -1) perms = [PERM_SUPER];
  return {
    found: true, active: active, perms: perms,
    isSuper: perms.indexOf(PERM_SUPER) !== -1,
    familyId: r.familyId, family: r.family, house: r.house, firstName: r.firstName
  };
}

/**
 * שער ההרשאות המרכזי. מקבל את פרמטרי הבקשה ואת ההרשאה הנדרשת, ומחזיר
 * { ok:true, email, perm } או { ok:false, error }.
 * שני מסלולים: (1) מושב חתום — המסלול הרגיל של האפליקציה;
 * (2) סיסמת מנהל — מסלול חירום/ידני, לשימוש ישיר מול ה-API בלי דפדפן.
 */
function authorize_(ss, p, need) {
  var sess = verifySession_(p && p.session);
  if (sess) {
    var perm = permissionsFor_(sess.email);
    if (!perm.found)  return { ok: false, error: 'המשתמש אינו ברשימת התושבים' };
    if (!perm.active) return { ok: false, error: 'המשתמש מסומן כלא פעיל' };
    if (!need || perm.isSuper ||
        (need === PERM_ANY_ADMIN ? perm.perms.length > 0 : perm.perms.indexOf(need) !== -1)) {
      return { ok: true, email: sess.email, perm: perm };
    }
    return { ok: false, error: 'אין לך הרשאה לפעולה הזו' };
  }
  if (isAdminPassword_(ss, p && p.password)) {
    return { ok: true, email: '', perm: { found: true, active: true, perms: ALL_PERMS.slice(), isSuper: true } };
  }
  return { ok: false, error: 'אין הרשאה' };
}

/* ============================================================================
 *  רשת ביטחון — להרצה ידנית מתוך עורך ה-Apps Script (כפתור Run)
 * ----------------------------------------------------------------------------
 *  שתי הפונקציות האלה לא עוברות דרך האינטרנט ולא דרך שום בדיקת הרשאה: הן רצות
 *  כאן, בעורך, תחת החשבון שלך. לכן אי אפשר "להינעל בחוץ" — גם אם משהו בהרשאות
 *  השתבש לגמרי, תמיד אפשר לפתוח את העורך ולהריץ אותן.
 *
 *  grantMeSuperAdmin   — נותן לחשבון שממנו אתה מריץ הרשאת מנהל על.
 *  diagnosePermissions — מדפיס מה השרת רואה עליך: אם נמצאת, אם אתה פעיל,
 *                        ואילו הרשאות יש לך בפועל. הפלט מופיע ב-Execution log.
 * ========================================================================== */
function grantMeSuperAdmin() {
  var email = Session.getEffectiveUser().getEmail();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensurePermissionCols_(ss, {});
  var r = lookupResident_(email);
  if (!r.found) {
    throw new Error('האימייל ' + email + ' לא נמצא בטאב "תושבים" — צריך קודם להוסיף אותו לשורה.');
  }
  var res = savePermissions_(ss, { rowIndex: r.rowIndex, slot: r.slot, perms: [PERM_SUPER] });
  if (!res.ok) throw new Error(res.error);
  Logger.log('✓ ' + email + ' הוגדר כמנהל על (שורה ' + r.rowIndex + ', משבצת אימייל ' + r.slot + ')');
  return res;
}

function diagnosePermissions() {
  var email = Session.getEffectiveUser().getEmail();
  var r = lookupResident_(email);
  var p = permissionsFor_(email);
  var lines = [
    'אימייל: ' + email,
    'נמצא בטאב תושבים: ' + (r.found ? 'כן (שורה ' + r.rowIndex + ', משבצת אימייל ' + r.slot + ')' : 'לא'),
    'סטטוס: ' + (r.status || '(ריק)'),
    'עמודת תפקיד (ישנה): ' + (r.role || '(ריק)'),
    'עמודת הרשאות: ' + (r.permissions || '(ריקה)'),
    'פעיל: ' + p.active,
    'הרשאות בפועל: ' + (p.perms.length ? p.perms.join(', ') : 'תושב רגיל'),
    'מנהל על: ' + p.isSuper
  ];
  Logger.log(lines.join('\n'));
  return lines.join('\n');
}

/* ===================== קריאה ===================== */
function doGet(e) {
  try {
    // בקשת התחברות (שלב ב') — מזוהה לפי action=login ומטופלת בנפרד
    if (e && e.parameter && e.parameter.action === 'login') {
      return handleLogin_(e.parameter.token);
    }
    // שריון מועדון (שלב 8) — שתי פעולות שדורשות תשובה קריאה (GET, לא no-cors),
    // בדיוק כמו login: קריאת תפוסה ליום, ויצירת שריון עם בדיקת חפיפה חיה.
    // בקשת הרשמה (2026-08-07) — נשלחת ממשתמש שעדיין אינו רשום, ולכן ללא סיסמת
    // מנהל. האימות נעשה דרך טוקן גוגל: השרת מאמת אותו מול גוגל ומוציא ממנו את
    // האימייל, כך שאי אפשר להירשם בשם מייל של מישהו אחר.
    if (e && e.parameter && e.parameter.action === 'submitSignup') {
      return handleSubmitSignup_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'listSignups') {
      return handleListSignups_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'clubBusy') {
      return handleClubBusy_(e.parameter.date);
    }
    if (e && e.parameter && e.parameter.action === 'reserveClub') {
      return handleReserveClub_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'clubMonth') {
      return handleClubMonth_(e.parameter.month);
    }
    if (e && e.parameter && e.parameter.action === 'myClubReservations') {
      return handleMyClubReservations_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'cancelClubReservation') {
      return handleCancelClubReservation_(e.parameter);
    }
    // ניהול אישורים (המשך שלב 8) — דורשות סיסמת מנהל, בדיוק כמו כתיבות ב-doPost.
    if (e && e.parameter && e.parameter.action === 'clubList') {
      return handleClubList_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'approveClubReservation') {
      return handleApproveClubReservation_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'rejectClubReservation') {
      return handleRejectClubReservation_(e.parameter);
    }
    // קריאת טאב "תושבים" (כולל PII — אימייל/טלפון) — מוגן בסיסמת מנהל, כמו clubList.
    // בשימוש חד-פעמי למיזוג "שם פרטי" מספר הטלפונים (2026-08-05), לא ע"י המסכים הרגילים.
    if (e && e.parameter && e.parameter.action === 'getResidents') {
      return handleGetResidents_(e.parameter);
    }
    // מזהה משפחה קבוע (2026-08-06) — יוצר/ממלא עמודת "מזהה קבוע" בטאב "תושבים" עבור
    // כל שורה שעדיין אין לה מזהה. חד-פעמי/אידמפוטנטי: להריץ שוב לא משנה מזהים קיימים,
    // רק ממלא את מה שחסר (למשל תושב חדש שנוסף אחר-כך).
    if (e && e.parameter && e.parameter.action === 'assignResidentIds') {
      return handleAssignResidentIds_(e.parameter);
    }
    // ספריית שמות מצומצמת (2026-08-07): רק מזהה/משפחה/שמות פרטיים/בית — בלי
    // אימייל, טלפון או הרשאות. משמשת את השלמת שם הרוכש בטופס ההוצאה, ולכן
    // פתוחה לכל מי שיש לו הרשאת ניהול כלשהי ולא רק למנהל התושבים.
    if (e && e.parameter && e.parameter.action === 'residentDirectory') {
      return handleResidentDirectory_(e.parameter);
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var years = [];
    ss.getSheets().forEach(function (sh) {
      var n = sh.getName();
      if (n.indexOf('תנועות ') === 0) years.push(n.substring('תנועות '.length));
    });
    var settings = readSettings_(ss);
    // סיסמת המנהל לא נשלחת יותר ללקוח (2026-08-07). עד היום כל מי שהיה מחובר קיבל
    // אותה בתוך ההגדרות, ולכן יכול היה לשלוח כל פקודת כתיבה. מעכשיו האפליקציה
    // עובדת עם מושב חתום אישי, והסיסמה נשארת סוד שנמצא רק בגיליון.
    var publicSettings = {};
    Object.keys(settings).forEach(function (k) {
      if (k.indexOf('סיסמ') === -1) publicSettings[k] = settings[k];
    });
    var out = {
      ok: true, version: 'v28-residents-grid', years: years,
      currentYear: settings['שנה נוכחית'] || years[0] || '',
      groups: readColumn_(ss, 'קבוצות'),
      updates: readTable_(ss, 'עדכוני תקציב'),   // יומן עדכוני תקציב (אם הטאב קיים)
      settings: publicSettings, data: {}
    };
    years.forEach(function (y) {
      out.data[y] = {
        budget: readTable_(ss, 'תקציב ' + y),
        income: readTable_(ss, 'הכנסות ' + y),
        transactions: readTable_(ss, 'תנועות ' + y)
      };
    });
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ===================== כתיבה ===================== */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // שער ההרשאות (2026-08-07): מושב חתום -> הרשאות מהגיליון -> בדיקה מול הפעולה.
    // סיסמת מנהל נשארת כמסלול חירום. ר' authorize_ בראש הקובץ.
    var gate = authorize_(ss, body, ACTION_PERMS[body.action]);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    body._email = gate.email;
    body._perm = gate.perm;
    switch (body.action) {
      case 'auth':              return json_({ ok: true });
      case 'savePermissions':   return json_(savePermissions_(ss, body));
      case 'ensurePermissionCols': return json_(ensurePermissionCols_(ss, body));
      case 'saveTransaction':   return json_(saveTransaction_(ss, body));
      case 'deleteTransaction': return json_(deleteTransaction_(ss, body));
      case 'saveBudget':        return json_(saveBudget_(ss, body));
      case 'setBudgetMeta':     return json_(setBudgetMeta_(ss, body));
      case 'renameCategory':    return json_(renameCategory_(ss, body));
      case 'logBudgetUpdate':   return json_(logBudgetUpdate_(ss, body));
      case 'addYear':           return json_(addYear_(ss, body));
      case 'submitReceipt':     return json_(submitReceipt_(ss, body));
      case 'saveResidentNames': return json_(saveResidentNames_(ss, body));
      case 'formatResidents':   return json_(formatResidents_(ss, body));
      case 'saveFamilyIds':     return json_(saveFamilyIds_(ss, body));
      case 'saveColumnValues':  return json_(saveColumnValues_(ss, body));
      case 'deleteReceiptFile': return json_(deleteReceiptFile_(ss, body));
      case 'uploadReceiptFile': return json_(uploadReceiptFile_(ss, body));
      case 'ensureColumns':     return json_(ensureColumns_(ss, body));
      case 'saveColumnConfig':  return json_(saveColumnConfig_(ss, body));
      case 'approveSignup':     return json_(approveSignup_(ss, body));
      case 'rejectSignup':      return json_(rejectSignup_(ss, body));
      case 'saveResidentRow':   return json_(saveResidentRow_(ss, body));
      case 'ensureResidentCols':return json_(ensureResidentCols_(ss, body));
      case 'replaceFamily':     return json_(replaceFamily_(ss, body));
      case 'exportResidents':   return json_(exportResidents_(ss, body));
      case 'createResidents':   return json_(createResidents_(ss, body));
      default:                  return json_({ ok: false, error: 'פעולה לא מוכרת: ' + body.action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function saveTransaction_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + body.year };
  var t = body.tx;
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var rowObj = {
    'מזהה': t.id,
    'חודש הגשה': t.month || '',
    'תאריך רכישה': t.date || '',
    'רוכש': t.buyer || '',
    'ספק/נמען': t.supplier || '',
    'בנק': t.bankName || '',
    'סכום': Number(t.amount) || 0,
    'סעיף': t.categoryId || '',
    'סוג הוצאה': TYPE_HE[t.expenseType] || t.expenseType || '',
    'מקור': SOURCE_HE[t.source] || t.source || '',
    'סטטוס': STATUS_HE[t.status] || t.status || '',
    'הערת בדיקה': t.reviewNote || '',
    'תיאור': t.description || '',
    'שם קובץ קבלה': t.fileName || '',
    'קישור קבלה': t.receiptUrl || '',
    // מזהה משפחה מקושר (2026-08-06) — מספר הבית של התושב האחראי/מטפל, גם
    // בשורות תשלום לספק (יש תמיד מישהו אחראי, גם אם ההוצאה עצמה לא "שלו").
    'מזהה משפחה': (t.familyId != null ? t.familyId : '')
  };
  // עמודות מותאמות אישית (סעיף 6, 2026-08-06) — נכתבות רק אם הן כבר קיימות
  // ככותרת אמיתית בטאב (נוצרות דרך ensureColumns_ בלבד, לא כאן — כדי שלא תיווצר
  // עמודה שגויה מטעות הקלדה בלי כוונה).
  if (t.customFields) {
    Object.keys(t.customFields).forEach(function (k) {
      if (headers.indexOf(k) !== -1) rowObj[k] = t.customFields[k];
    });
  }
  // אם לתנועה יש קבלה מצורפת ב-Drive — מסנכרנים את שם הקובץ לפורמט העדכני (למשל אחרי
  // שהמנהל שייך סעיף תקציבי לבקשה שהוגשה ע"י תושב, או תיקן פרטים אחרי שהקבלה כבר קיימת).
  renameReceiptFileIfNeeded_(rowObj['קישור קבלה'], rowObj['שם קובץ קבלה']);

  // מעבר קבלה מהתיקייה הזמנית "ממתין לאישור" לתיקייה הקבועה שיכון/<שנה>/<חודש>
  // (המנגנון הקיים, ללא שינוי — ר' getReceiptsFolder_) — קורה אוטומטית ברגע שהסטטוס
  // מגיע ל"הועבר להנה"ח"/"שולם". אידמפוטנטי: קריאה חוזרת על קובץ שכבר במקום הנכון
  // לא משנה כלום (סעיף 4, 2026-08-06).
  if ((rowObj['סטטוס'] === STATUS_HE.ready || rowObj['סטטוס'] === STATUS_HE.paid) && rowObj['קישור קבלה']) {
    moveReceiptToPermanentIfNeeded_(rowObj['קישור קבלה']);
  }

  var n = Math.max(sh.getLastRow() - 1, 0);
  var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
  var foundRow = -1;
  for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(t.id)) { foundRow = i + 2; break; } }

  if (foundRow > 0) {
    // מיזוג על גבי הערכים הקיימים בפועל בשורה (לא שורה ריקה מאפס) — כדי שעמודות
    // שהאפליקציה לא מכירה (עמודות מותאמות אישית שלא נשלחו הפעם, או כל עמודה
    // עתידית) לעולם לא יימחקו רק כי לא סופקו. תיקון 2026-08-06: קודם רשימת
    // ה-headers.map נבנתה מ-rowObj בלבד ודרסה כל עמודה לא מוכרת בריק.
    var existing = sh.getRange(foundRow, 1, 1, headers.length).getValues()[0];
    var merged = headers.map(function (h, i) { return rowObj.hasOwnProperty(h) ? rowObj[h] : existing[i]; });
    sh.getRange(foundRow, 1, 1, merged.length).setValues([merged]);
  } else {
    var newRow = headers.map(function (h) { return rowObj.hasOwnProperty(h) ? rowObj[h] : ''; });
    sh.appendRow(newRow);
  }
  return { ok: true, id: t.id };
}

function deleteTransaction_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב' };
  var n = Math.max(sh.getLastRow() - 1, 0);
  var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(body.id)) { sh.deleteRow(i + 2); return { ok: true }; }
  }
  return { ok: false, error: 'לא נמצא' };
}

/** כתיבה מרוכזת של "מזהה משפחה" למספר שורות בבת אחת (2026-08-06) — נועדה בעיקר
 * למעבר הרטרואקטיבי (שיוך 135 השורות הקיימות למשפחה), כדי לא לעבור שורה-שורה
 * דרך הממשק. body.year, body.items = [{id, familyId}, ...]. יוצרת את עמודת
 * "מזהה משפחה" אוטומטית אם היא עוד לא קיימת בטאב (אין צורך להוסיף אותה ידנית
 * בגיליון קודם). מחזירה כמה שורות עודכנו וכמה מזהים לא נמצאו (לבדיקה). */
function saveFamilyIds_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + body.year };
  var items = body.items || [];
  if (!items.length) return { ok: false, error: 'לא סופקו שורות לעדכון' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var col = headers.indexOf('מזהה משפחה'); // 0-based
    if (col === -1) {
      col = lastCol; // עמודה חדשה מיד אחרי האחרונה הקיימת
      sh.getRange(1, col + 1).setValue('מזהה משפחה');
    }

    var n = Math.max(sh.getLastRow() - 1, 0);
    var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
    var idToRow = {};
    for (var i = 0; i < ids.length; i++) idToRow[String(ids[i][0])] = i + 2;

    var updated = [], notFound = [];
    items.forEach(function (it) {
      var r = idToRow[String(it.id)];
      if (!r) { notFound.push(it.id); return; }
      sh.getRange(r, col + 1).setValue(it.familyId || '');
      updated.push(it.id);
    });
    return { ok: true, updatedCount: updated.length, updated: updated, notFound: notFound };
  } finally {
    lock.releaseLock();
  }
}

/** כתיבה מרוכזת וכללית של עמודה בודדת קיימת בטאב תנועות, לפי מזהה שורה (2026-08-06).
 * נועדה למקרים כמו סימון "בדיקה" עם הערה על שורות שלא ניתן היה לשייכן בוודאות
 * גבוהה למשפחה — בלי לגעת בשום עמודה אחרת בשורה (בניגוד ל-saveTransaction_, שדורש
 * את כל שדות השורה ועלול "לדרוס" שדות שלא סופקו). body.year, body.column (שם
 * הכותרת המדויק בעברית — חייבת כבר להתקיים, לא נוצרת אוטומטית כדי למנוע יצירת
 * עמודות שגויות בטעות), body.items = [{id, value}]. */
function saveColumnValues_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + body.year };
  var items = body.items || [];
  if (!items.length) return { ok: false, error: 'לא סופקו שורות לעדכון' };
  var colName = String(body.column || '').trim();
  if (!colName) return { ok: false, error: 'לא סופק שם עמודה' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var col = headers.indexOf(colName); // 0-based
    if (col === -1) return { ok: false, error: 'העמודה "' + colName + '" לא קיימת בטאב' };

    var n = Math.max(sh.getLastRow() - 1, 0);
    var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
    var idToRow = {};
    for (var i = 0; i < ids.length; i++) idToRow[String(ids[i][0])] = i + 2;

    var updated = [], notFound = [];
    items.forEach(function (it) {
      var r = idToRow[String(it.id)];
      if (!r) { notFound.push(it.id); return; }
      sh.getRange(r, col + 1).setValue(it.value != null ? it.value : '');
      updated.push(it.id);
    });
    return { ok: true, updatedCount: updated.length, updated: updated, notFound: notFound };
  } finally {
    lock.releaseLock();
  }
}

/** יוצרת עמודות חדשות בטאב "תנועות <שנה>" אם עוד לא קיימות — לפי "ניהול עמודות"
 * בצד המנהל (סעיף 6, 2026-08-06). body.year, body.columns = [שם, שם, ...]. לא
 * נוגעת בעמודות קיימות; מוסיפה רק את מה שחסר, בסוף הטבלה. אידמפוטנטית — אפשר
 * לקרוא שוב עם אותה רשימה בלי נזק. */
function ensureColumns_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + body.year };
  var cols = (body.columns || []).map(function (c) { return String(c || '').trim(); }).filter(Boolean);
  if (!cols.length) return { ok: false, error: 'לא סופקו שמות עמודות' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var added = [];
    cols.forEach(function (name) {
      if (headers.indexOf(name) === -1) {
        lastCol += 1;
        sh.getRange(1, lastCol).setValue(name);
        headers.push(name);
        added.push(name);
      }
    });
    return { ok: true, added: added };
  } finally {
    lock.releaseLock();
  }
}

/* ============ שריון מועדון (שלב 8) ============
 * שתי פעולות שרצות על ה-Google Calendar הייעודי (CLUB_CALENDAR_ID), לא על הגיליון:
 *  - handleClubBusy_  : מחזירה את משבצות התפוסה (אירועים קיימים) ליום נתון, כדי שהאפליקציה
 *    תסמן אותן באפור. תשובה בלבד, בלי לחשוף פרטי אירוע (כותרת/תיאור) — פרטיות שכנים.
 *  - handleReserveClub_: יוצרת שריון (אירוע חדש) לטווח שעות חופשי שבחר התושב. בודקת חפיפה
 *    "טרייה" תחת נעילה ממש לפני היצירה (שני תושבים עלולים לבחור אותו זמן במקביל).
 * שתיהן דרך GET (לא doPost/no-cors) — כדי שהאפליקציה תוכל לקרוא את התשובה בחזרה
 * (בדיוק כמו handleLogin_): לשריון קריטי לדעת מיד אם הצליח או שהזמן נתפס. */
function handleClubBusy_(dateStr) {
  try {
    if (!dateStr) return json_({ ok: false, error: 'חסר תאריך' });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var day = new Date(dateStr + 'T00:00:00');
    var dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
    var dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
    var events = cal.getEvents(dayStart, dayEnd);
    var busy = events.map(function (ev) {
      return { start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString() };
    });
    return json_({ ok: true, date: dateStr, busy: busy });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function handleReserveClub_(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return json_({ ok: false, error: 'תפוס — נסה שוב' }); }
  try {
    if (!p.date || !p.start || !p.end) return json_({ ok: false, error: 'חסרים פרטי זמן' });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var startDt = new Date(p.date + 'T' + p.start + ':00');
    var endDt = new Date(p.date + 'T' + p.end + ':00');
    if (!(endDt > startDt)) return json_({ ok: false, error: 'שעת סיום חייבת להיות אחרי שעת התחלה' });
    // בדיקת חפיפה טרייה, ממש לפני היצירה (בתוך הנעילה) — מונעת שני שריונים על אותו זמן
    var clash = cal.getEvents(startDt, endDt);
    if (clash.length) return json_({ ok: false, error: 'המשבצת נתפסה בינתיים — בחר/י זמן אחר', conflict: true });
    // שריון חדש נוצר כ"ממתין לאישור מנהל" — התור/משבצת הזמן כן ננעלת מיד (מונעת
    // התנגשות עם תושב אחר בזמן שהמנהל טרם הגיב), אבל האירוע מסומן ככזה גם בכותרת
    // (גלוי גם למי שמסתכל ישירות ב-Google Calendar) וגם בתג status לצורך המסך הפנימי.
    var title = 'שריון מועדון (ממתין לאישור) — ' + (p.family || p.email || 'תושב');
    var desc = [
      p.house ? ('בית ' + p.house) : '',
      p.email || '',
      p.note ? ('הערה: ' + p.note) : ''
    ].filter(Boolean).join('\n');
    var ev = cal.createEvent(title, startDt, endDt, { description: desc });
    // תגיות (מטא-דאטה פרטית של הסקריפט, לא מוצגות ביומן עצמו) — כדי ש"השריונים שלי",
    // ביטול שריון, ומסך האישורים של המנהל יוכלו לשייך/לסנן אירוע בלי לחשוף פרטים לאחרים.
    ev.setTag('family', String(p.family || ''));
    ev.setTag('email', String(p.email || '').trim().toLowerCase());
    ev.setTag('note', p.note || '');
    ev.setTag('status', 'pending');
    return json_({ ok: true, id: ev.getId(), start: startDt.toISOString(), end: endDt.toISOString(), status: 'pending' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* מחזירה אילו ימים בחודש נתון (YYYY-MM) יש בהם לפחות שריון אחד — לתצוגה החודשית
 * (heatmap פשוט). לא חושפת פרטי אירוע, רק תאריכים. */
function handleClubMonth_(monthStr) {
  try {
    if (!monthStr) return json_({ ok: false, error: 'חסר חודש' });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var parts = monthStr.split('-');
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10);
    var monthStart = new Date(y, m - 1, 1, 0, 0, 0);
    var monthEnd = new Date(y, m, 0, 23, 59, 59); // היום האחרון בחודש
    var tz = Session.getScriptTimeZone();
    var set = {};
    cal.getEvents(monthStart, monthEnd).forEach(function (ev) {
      var s = ev.getStartTime(), en = ev.getEndTime();
      var cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
      var last = new Date(en.getFullYear(), en.getMonth(), en.getDate());
      var guard = 0;
      while (cur <= last && guard < 62) {   // לרוב יום אחד; guard מגן מפני אירוע פתוח/ארוך חריג
        set[Utilities.formatDate(cur, tz, 'yyyy-MM-dd')] = true;
        cur = new Date(cur.getTime() + 86400000);
        guard++;
      }
    });
    return json_({ ok: true, month: monthStr, busyDates: Object.keys(set) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* רשימת השריונים העתידיים (וקרוב-עבר, יום אחד אחורה) של התושב המחובר — לפי
 * המייל/שם המשפחה שסופקו, מוצלב מול התגיות שנשמרו על האירוע ביצירה. */
function handleMyClubReservations_(p) {
  try {
    var email = String(p.email || '').trim().toLowerCase();
    var family = String(p.family || '').trim();
    if (!email && !family) return json_({ ok: false, error: 'חסרים פרטי משתמש' });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var from = new Date(Date.now() - 24 * 3600 * 1000);
    var to = new Date(Date.now() + 180 * 24 * 3600 * 1000);
    var mine = cal.getEvents(from, to).filter(function (ev) {
      var tagEmail = String(ev.getTag('email') || '').trim().toLowerCase();
      var tagFamily = String(ev.getTag('family') || '').trim();
      if (email && tagEmail) return tagEmail === email;
      if (family && tagFamily) return tagFamily === family;
      return false;
    }).map(function (ev) {
      return {
        id: ev.getId(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        note: ev.getTag('note') || '',
        status: ev.getTag('status') || 'approved'   // אירועים ישנים/ידניים בלי תג — נחשבים מאושרים
      };
    }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    return json_({ ok: true, reservations: mine });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ביטול שריון — מוודא בעלות לפי התגית (email/family) לפני מחיקה, כדי שתושב
 * לא יוכל לבטל שריון של מישהו אחר רק כי הוא יודע/מנחש את מזהה האירוע. */
function handleCancelClubReservation_(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return json_({ ok: false, error: 'תפוס — נסה שוב' }); }
  try {
    if (!p.id) return json_({ ok: false, error: 'חסר מזהה שריון' });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var ev = cal.getEventById(p.id);
    if (!ev) return json_({ ok: false, error: 'השריון לא נמצא — ייתכן שכבר בוטל' });
    var email = String(p.email || '').trim().toLowerCase();
    var family = String(p.family || '').trim();
    var tagEmail = String(ev.getTag('email') || '').trim().toLowerCase();
    var tagFamily = String(ev.getTag('family') || '').trim();
    var owns = (email && tagEmail && tagEmail === email) || (family && tagFamily && tagFamily === family);
    if (!owns) return json_({ ok: false, error: 'אין הרשאה לבטל שריון זה' });
    ev.deleteEvent();
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// בודקת סיסמת מנהל לפעולות ניהול שמגיעות דרך GET (clubList/approve/reject) —
// אותה בדיקה שנעשית בתחילת doPost לכל שאר הכתיבות, רק שכאן מבצעים אותה ידנית
// כי לפעולות האלה יש צורך בתשובה קריאה (לא no-cors) אז הן לא עוברות דרך doPost.
/* התגלה 2026-08-07: אם משום מה אין ערך ב"סיסמת מנהל" בהגדרות, ההשוואה הישנה
 * הייתה '' === '' — כלומר בקשה בלי סיסמה כלל הייתה עוברת. עכשיו נדרשת סיסמה
 * מוגדרת בפועל, וגם סיסמה שנשלחה בפועל. */
function isAdminPassword_(ss, pw) {
  var real = String(readSettings_(ss)['סיסמת מנהל'] || '').trim();
  var given = String(pw || '').trim();
  if (!real || !given) return false;
  return given === real;
}

/* רשימת כל השריונים הקרובים (ממתינים + מאושרים) — למסך הניהול אצל המנהל.
 * לא מסננת לפי משתמש (בניגוד ל-myClubReservations) ולכן דורשת סיסמת מנהל. */
function handleClubList_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_CLUB);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var from = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    var to = new Date(Date.now() + 180 * 24 * 3600 * 1000);
    var list = cal.getEvents(from, to).map(function (ev) {
      return {
        id: ev.getId(),
        start: ev.getStartTime().toISOString(),
        end: ev.getEndTime().toISOString(),
        family: ev.getTag('family') || '',
        email: ev.getTag('email') || '',
        note: ev.getTag('note') || '',
        status: ev.getTag('status') || 'approved'
      };
    }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    return json_({ ok: true, reservations: list });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* אישור שריון ממתין — מסירה את סימון ה"ממתין" מהכותרת ומעדכנת את התג. */
function handleApproveClubReservation_(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return json_({ ok: false, error: 'תפוס — נסה שוב' }); }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_CLUB);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var ev = cal.getEventById(p.id);
    if (!ev) return json_({ ok: false, error: 'השריון לא נמצא — ייתכן שכבר בוטל' });
    ev.setTag('status', 'approved');
    ev.setTitle('שריון מועדון — ' + (ev.getTag('family') || 'תושב'));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* דחיית שריון ממתין — מוחקת את האירוע (משחררת את המשבצת בחזרה לפנויה). אין כרגע
 * יומן/ארכיון נפרד לדחיות (בדומה לביטול תושב) — אפשר להוסיף בהמשך אם ירצה יועד. */
function handleRejectClubReservation_(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return json_({ ok: false, error: 'תפוס — נסה שוב' }); }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_CLUB);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });
    var ev = cal.getEventById(p.id);
    if (!ev) return json_({ ok: false, error: 'השריון לא נמצא — ייתכן שכבר טופל' });
    ev.deleteEvent();
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ============ קליטת בקשת תושב: תמונה -> Drive + שורה בתנועות (שלב 3) ============
 * מקבלת את פרטי הבקשה + קובץ הקבלה (Base64 מהדפדפן), שומרת את הקובץ בתיקיית
 * Drive ייעודית, ומוסיפה שורה לטאב "תנועות <שנה>" עם סטטוס "הוגשה קבלה" (=ממתין)
 * ומקור "תושב". הסעיף התקציבי נשאר ריק — המנהל יבחר אותו באישור (שלב 6).
 * המזהה מחושב כאן בשרת (לא נשלח מהלקוח) + נעילה, כדי שתי הגשות בו-זמנית לא יתנגשו. */
function submitReceipt_(ss, body) {
  var year = body.year;
  var sh = ss.getSheetByName('תנועות ' + year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + year };
  if (!body.dataBase64) return { ok: false, error: 'לא צורפה קבלה' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    // 1) שמירת קובץ הקבלה בתיקיית "ממתין לאישור" (סעיף 4, 2026-08-06) + שיתוף לצפייה
    //    בקישור (למקרה של כמה מנהלים). הקובץ עובר לתיקייה הקבועה שיכון/<שנה>/<חודש>
    //    (המנגנון הקיים) אוטומטית ברגע שהמנהל מאשר את הבקשה — ר' saveTransaction_.
    var folder = getPendingReceiptsFolder_();
    var blob = Utilities.newBlob(
      Utilities.base64Decode(body.dataBase64),
      body.mimeType || 'image/jpeg',
      body.fileName || 'receipt'
    );
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* לא קריטי */ }

    // 2) מזהה חדש — מבוסס על המקסימום הקיים בטאב, מחושב בשרת (לא סומכים על הלקוח)
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var n = Math.max(sh.getLastRow() - 1, 0);
    var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
    var maxId = 0;
    for (var i = 0; i < ids.length; i++) { var v = Number(ids[i][0]) || 0; if (v > maxId) maxId = v; }
    var newId = maxId + 1;

    // 3) פרטי בנק (רק לתשלום לספק) — מאוחדים לתא אחד, כמו בהזנת מנהל
    var bankFull = '';
    if (body.expenseType === 'supplier') {
      bankFull = [
        body.bankName ? ('בנק ' + body.bankName) : '',
        body.bankBranch ? ('סניף ' + body.bankBranch) : '',
        body.bankAccount ? ('חשבון ' + body.bankAccount) : ''
      ].filter(Boolean).join(' ');
    }

    // 4) שם תצוגה לקבלה — אותה נוסחה בדיוק כמו בהזנת מנהל (receiptFileName ב-dataService.js),
    //    עם "טרם שויך" במקום שם הסעיף (עוד לא נבחר). ברגע שהמנהל ישייך סעיף ויערוך/ישמור
    //    את התנועה, renameReceiptFileIfNeeded_ יעדכן את השם הזה אוטומטית לשם הסעיף האמיתי.
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    var todayDMY = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy');
    // תווית סוג ההוצאה בשם הקובץ — "החזר לדייר"/"תשלום לספק" כמו במוסכמה ההיסטורית
    // (נבדק מול קבלות עבר: שתי הגרסאות מקבלות תווית מפורשת, לא רק שם גולמי).
    var payee = body.expenseType === 'refund' ? ('החזר לדייר ' + (body.buyer || ''))
      : body.expenseType === 'supplier' ? ('תשלום לספק ' + (body.supplier || body.buyer || ''))
      : (body.supplier || body.buyer || '');
    var displayName = todayDMY + ' ' + payee + ' סך: ' + Math.round(Number(body.amount) || 0) +
      '  מתקציב: טרם שויך' + ' פירוט: ' + (body.description || '') + (bankFull ? (' ' + bankFull) : '');
    try { file.setName(displayName); } catch (e) { /* לא קריטי */ }

    // מזהה משפחה (2026-08-06): נגזר בשרת מהאימייל המאומת של הפונה (לא מהלקוח) —
    // כך שהשורה מקושרת אוטומטית ובוודאות למשפחה הנכונה מרגע היצירה, בלי שום ניחוש.
    var famId = '';
    if (body.email) {
      var residentInfo = lookupResident_(body.email);
      if (residentInfo && residentInfo.found) famId = residentInfo.familyId || '';
    }

    var rowObj = {
      'מזהה': newId,
      // "חודש הגשה" מחושב עם אותו חיתוך יום-19/20 שנקבע ליועד לתזמון החזרים
      // (סעיף 7, 2026-08-06) — עד ה-19 (כולל) נכנס לחודש הנוכחי, מה-20 ואילך
      // נדחה לחודש הבא. זהה בדיוק לברירת המחדל שכבר קיימת בצד המנהל
      // (txDefaultSubmissionMonth ב-expenses.js) — כך שהשדה עקבי לכל המקורות,
      // ותאריך ההחזר הצפוי (CBA.data.expectedRefundDate) מדויק גם לבקשות תושבים.
      'חודש הגשה': submissionMonthForToday_(),
      'תאריך רכישה': today,
      'רוכש': body.buyer || '',
      'ספק/נמען': body.supplier || '',
      'בנק': bankFull,
      'סכום': Number(body.amount) || 0,
      'סעיף': '',
      'סוג הוצאה': TYPE_HE[body.expenseType] || body.expenseType || '',
      'מקור': SOURCE_HE.resident,
      'סטטוס': STATUS_HE.submitted,
      'תיאור': body.description || '',
      'שם קובץ קבלה': displayName,
      'קישור קבלה': file.getUrl(),
      'מזהה משפחה': famId
    };
    var newRow = headers.map(function (h) { return rowObj.hasOwnProperty(h) ? rowObj[h] : ''; });
    sh.appendRow(newRow);
    return { ok: true, id: newId, url: file.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

/* ============ תיקיית היעד בדרייב לקבלות: שיכון / <שנה> / <חודש> ============
 * המבנה הקיים בדרייב (יועד 2026-08-05): תיקיית "שיכון" → תיקיית שנה קלנדרית ("2026")
 * → תיקיות חודש בתוך השנה, קרויות כמספר בלי אפס מוביל (1..12, לא "01"/"אוגוסט").
 * ROOT_RECEIPTS_FOLDER_ID הוא המזהה של תיקיית "שיכון" עצמה (יועד אישר במפורש 2026-08-05
 * שתיקיות השנה יושבות ישירות בתוכה) — משתמשים בה כמו שהיא, בלי לטפס להורה.
 * שנה/חודש שלא קיימים עדיין נוצרים אוטומטית. */
var ROOT_RECEIPTS_FOLDER_ID = '1-NmXShMhy9wbIqMLAkIcelXvE6OlvLYi'; // תיקיית "שיכון"

function getReceiptsFolder_() {
  var root = DriveApp.getFolderById(ROOT_RECEIPTS_FOLDER_ID); // "שיכון"
  var now = new Date(), tz = Session.getScriptTimeZone();
  var yearName = Utilities.formatDate(now, tz, 'yyyy');
  var monthName = Utilities.formatDate(now, tz, 'M'); // בלי אפס מוביל — כמו התיקיות הקיימות
  var yearFolder = findOrCreateSubfolder_(root, yearName);
  return findOrCreateSubfolder_(yearFolder, monthName);
}

/* ============ תיקיית ביניים לקבלות שטרם אושרו (סעיף 4, 2026-08-06) ============
 * כל קבלה חדשה (הגשת תושב, או העלאה/החלפה ע"י המנהל בטופס עריכה) נשמרת קודם כאן —
 * תיקייה שטוחה אחת, בלי חלוקת שנה/חודש (הקבלות כאן זמניות, עד לאישור). ברגע
 * שהתנועה מאושרת (סטטוס "הועבר להנה"ח"/"שולם") הקובץ עובר אוטומטית לתיקייה
 * הקבועה שיכון/<שנה>/<חודש> — ר' moveReceiptToPermanentIfNeeded_ ו-saveTransaction_. */
var PENDING_RECEIPTS_FOLDER_NAME = 'ממתין לאישור';
function getPendingReceiptsFolder_() {
  var root = DriveApp.getFolderById(ROOT_RECEIPTS_FOLDER_ID); // "שיכון"
  return findOrCreateSubfolder_(root, PENDING_RECEIPTS_FOLDER_NAME);
}

function findOrCreateSubfolder_(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

/* מחלצת מזהה קובץ מקישור Drive (תומכת בכמה פורמטים אפשריים של קישור). */
function extractDriveFileId_(url) {
  if (!url) return null;
  var m = String(url).match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

/* כשיש קישור לקבלה קיימת ושם חדש שונה מהקיים — משנים את שם הקובץ בפועל ב-Drive.
 * כך שם הקובץ נשאר מסונכרן עם הנתונים גם אחרי שהמנהל משייך סעיף/מתקן פרטים בעריכה. */
function renameReceiptFileIfNeeded_(url, newName) {
  var id = extractDriveFileId_(url);
  if (!id || !newName) return;
  try {
    var file = DriveApp.getFileById(id);
    if (file.getName() !== newName) file.setName(newName);
  } catch (e) { /* אין גישה לקובץ, או שנמחק — לא קריטי */ }
}

/* מעבירה בפועל קובץ קבלה מ"ממתין לאישור" לתיקייה הקבועה שיכון/<שנה>/<חודש>
 * (סעיף 4, 2026-08-06). לא-קריטי בכוונה (עטוף try/catch): קובץ שנמחק/קישור חיצוני
 * שאינו בבעלות האפליקציה לא מפילים את שמירת התנועה. אידמפוטנטי — moveTo על קובץ
 * שכבר נמצא ביעד לא עושה כלום. */
function moveReceiptToPermanentIfNeeded_(url) {
  var id = extractDriveFileId_(url);
  if (!id) return;
  try {
    var file = DriveApp.getFileById(id);
    file.moveTo(getReceiptsFolder_());
  } catch (e) { /* לא קריטי */ }
}

/* מוחקת (trash) קובץ Drive בפועל לפי קישור — לא רק ניתוק הקישור בגיליון. לא-קריטי:
 * קובץ שכבר נמחק/אין הרשאה אליו לא מפיל את הפעולה הקוראת (סעיף 4, 2026-08-06). */
function trashDriveFile_(url) {
  var id = extractDriveFileId_(url);
  if (!id) return;
  try {
    DriveApp.getFileById(id).setTrashed(true);
  } catch (e) { /* לא קריטי */ }
}

/* "חודש הגשה" ליום הנוכחי, עם חיתוך יום-19/20 (סעיף 7, 2026-08-06): עד ה-19 לחודש
 * (כולל) -> החודש הנוכחי; מה-20 ואילך -> החודש הבא. זהה בדיוק ל-txDefaultSubmissionMonth
 * בצד הלקוח (expenses.js) — כאן זו הגרסה השרתית, המשמשת את submitReceipt_ כדי
 * שהגשות תושבים יקבלו את אותו טיפול בדיוק כמו ברירת המחדל בצד המנהל. */
function submissionMonthForToday_() {
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var day = Number(Utilities.formatDate(now, tz, 'd'));
  var target = new Date(now.getTime());
  if (day >= 20) target.setMonth(target.getMonth() + 1);
  return Utilities.formatDate(target, tz, 'yyyy-MM');
}

/** מחליפה/מוסיפה קובץ קבלה לתנועה קיימת (מהצד של המנהל, drawer עריכה — סעיף 4,
 * 2026-08-06): מעלה קובץ חדש ל-Drive (לתיקיית "ממתין לאישור" אם התנועה עדיין לא
 * אושרה, או ישירות לתיקייה הקבועה אם היא כבר אושרה/שולמה), מוחקת בפועל (trash) את
 * הקובץ הישן אם היה כזה — לא רק ניתוק הקישור — וכותבת את הקישור/שם הקובץ החדשים
 * בשורה. body: {year, id, dataBase64, mimeType, fileName, oldUrl}. */
function uploadReceiptFile_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + body.year };
  if (!body.dataBase64) return { ok: false, error: 'לא צורף קובץ' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var idCol = headers.indexOf('מזהה');
    var statusCol = headers.indexOf('סטטוס');
    var urlCol = headers.indexOf('קישור קבלה');
    var nameCol = headers.indexOf('שם קובץ קבלה');
    if (idCol === -1 || urlCol === -1 || nameCol === -1) return { ok: false, error: 'מבנה טאב לא תקין' };

    var n = Math.max(sh.getLastRow() - 1, 0);
    var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
    var row = -1;
    for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(body.id)) { row = i + 2; break; } }
    if (row === -1) return { ok: false, error: 'התנועה לא נמצאה — שמור אותה קודם' };

    var status = statusCol !== -1 ? String(sh.getRange(row, statusCol + 1).getValue()) : '';
    var approved = (status === STATUS_HE.ready || status === STATUS_HE.paid);
    var folder = approved ? getReceiptsFolder_() : getPendingReceiptsFolder_();

    var blob = Utilities.newBlob(
      Utilities.base64Decode(body.dataBase64),
      body.mimeType || 'image/jpeg',
      body.fileName || 'receipt'
    );
    var file = folder.createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* לא קריטי */ }
    try { if (body.fileName) file.setName(body.fileName); } catch (e) { /* לא קריטי */ }

    // מחיקה בפועל של הקובץ הישן (אם היה) — trash אמיתי, לא רק ניתוק קישור
    trashDriveFile_(body.oldUrl || sh.getRange(row, urlCol + 1).getValue());

    sh.getRange(row, urlCol + 1).setValue(file.getUrl());
    sh.getRange(row, nameCol + 1).setValue(body.fileName || file.getName());

    return { ok: true, url: file.getUrl() };
  } finally {
    lock.releaseLock();
  }
}

/** מוחקת קובץ קבלה בפועל (trash ב-Drive) ומנקה את שדות הקישור/שם הקובץ בשורה —
 * לא רק ניתוק הקישור (סעיף 4, 2026-08-06). body: {year, id, url}. */
function deleteReceiptFile_(ss, body) {
  var sh = ss.getSheetByName('תנועות ' + body.year);
  if (!sh) return { ok: false, error: 'אין טאב תנועות לשנה ' + body.year };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var lastCol = sh.getLastColumn();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var idCol = headers.indexOf('מזהה');
    var urlCol = headers.indexOf('קישור קבלה');
    var nameCol = headers.indexOf('שם קובץ קבלה');
    if (idCol === -1 || urlCol === -1) return { ok: false, error: 'מבנה טאב לא תקין' };

    var n = Math.max(sh.getLastRow() - 1, 0);
    var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
    var row = -1;
    for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(body.id)) { row = i + 2; break; } }
    if (row === -1) return { ok: false, error: 'התנועה לא נמצאה' };

    var currentUrl = String(sh.getRange(row, urlCol + 1).getValue());
    trashDriveFile_(body.url || currentUrl);

    sh.getRange(row, urlCol + 1).setValue('');
    if (nameCol !== -1) sh.getRange(row, nameCol + 1).setValue('');

    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ============ שמירת תכנון התקציב (סעיפים + הכנסות) ============
 * מסנכרן את טאבי "תקציב <שנה>" ו"הכנסות <שנה>" למצב שבאפליקציה.
 * מהירות: כותבים עמודה שלמה בקריאה אחת (setValues) במקום תא-תא — קריטי,
 *   כי כתיבה תא-תא איטית מאוד וגרמה להתנגשות נעילה ולשמירות שנפלו.
 * בטיחות: כותבים רק לעמודות ה"תכנון" שבבעלות האפליקציה, ולעולם לא דורסים
 *   תא שמכיל נוסחה (ביצוע/יתרה/% נשארים כפי שהם).
 * שורות "סה"כ"/"ספייר"/ריקות משמשות כגבול — הוספות נכנסות מעליהן. */
function saveBudget_(ss, body) {
  var year = body.year;
  // נעילה: שמירות אוטומטיות נשלחות "שגר ושכח" ועלולות להצטבר.
  // הנעילה מבטיחה שכל שמירה תרוץ עד הסוף לפני הבאה — בלי מרוצי הוספה/מחיקה.
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var out = {
      ok: true,
      cats:   saveBudgetCats_(ss, year, body.categories || []),
      income: saveBudgetIncome_(ss, year, body.income || [])
    };
    if (body.groups) out.groups = saveGroups_(ss, body.groups);  // טאב "קבוצות" משותף לכל השנים
    return out;
  } finally {
    lock.releaseLock();
  }
}

/* ============ מצב התקציב (סגור/טיוטה) + בסיס מאושר ============
 * נשמר בטאב "הגדרות" כזוג ערכים לכל שנה:
 *   "מצב תקציב <שנה>"  = "סגור" / "טיוטה"
 *   "בסיס תקציב <שנה>" = JSON של {שם-סעיף: תכנון מאושר}  (ריק כשפתוח)
 * כך שהמצב + הבסיס (להשוואת "עודכן") שורדים רענון. */
function setBudgetMeta_(ss, body) {
  setSetting_(ss, 'מצב תקציב ' + body.year, body.phase || 'טיוטה');
  setSetting_(ss, 'בסיס תקציב ' + body.year, body.baseline ? JSON.stringify(body.baseline) : '');
  return { ok: true };
}

/** "ניהול עמודות" בטבלת ניהול ההוצאות (סעיף 6, 2026-08-06): שומרת את תצורת
 * העמודות (הצג/הסתר, שמות תצוגה מותאמים, עמודות מותאמות אישית) כ-JSON בטאב
 * "הגדרות" — משותפת לכל מי שנכנס, לא רק למכשיר אחד. וגם מוודאת שלכל עמודה
 * מותאמת אישית קיימת כותרת אמיתית בטאב השנה הנוכחית (יוצרת אם חסרה). */
function saveColumnConfig_(ss, body) {
  setSetting_(ss, 'עמודות מותאמות', body.config ? JSON.stringify(body.config) : '');
  if (body.year && body.config && body.config.custom && body.config.custom.length) {
    ensureColumns_(ss, { year: body.year, columns: body.config.custom.map(function (c) { return c.key; }) });
  }
  return { ok: true };
}

// כתיבת/עדכון ערך בטאב "הגדרות" (עמודה A=מפתח, B=ערך). מוסיף שורה אם המפתח חדש.
function setSetting_(ss, key, value) {
  var sh = ss.getSheetByName('הגדרות');
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  for (var r = 0; r < v.length; r++) {
    if (String(v[r][0]).trim() === key) { sh.getRange(r + 1, 2).setValue(value); return; }
  }
  sh.appendRow([key, value]);
}

/* ============ שינוי שם סעיף — עם הגירה לתנועות ============
 * משנה את שם הסעיף בטאב "תקציב <שנה>" וגם בכל התנועות של אותה שנה
 * (עמודת "סעיף") — כדי שהצלבת הביצוע תמשיך לעבוד. כתיבה מרוכזת + נעילה. */
function renameCategory_(ss, body) {
  var year = body.year, oldN = String(body.oldName == null ? '' : body.oldName).trim(),
      newN = String(body.newName == null ? '' : body.newName).trim();
  if (!newN || oldN === newN) return { ok: false, error: 'שם לא תקין' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    // 1) שם הסעיף בטאב התקציב (אם התא אינו נוסחה)
    var bud = ss.getSheetByName('תקציב ' + year);
    if (bud) {
      var bh = headerMap_(bud), kc = bh['סעיף'], last = bud.getLastRow();
      if (kc && last >= 2) {
        var keys = bud.getRange(2, kc, last - 1, 1).getValues();
        for (var i = 0; i < keys.length; i++) {
          if (String(keys[i][0]).trim() === oldN) {
            var cell = bud.getRange(i + 2, kc);
            if (cell.getFormula() === '') cell.setValue(newN);
            break;
          }
        }
      }
    }
    // 2) כל התנועות של השנה — עמודת "סעיף" (כתיבה מרוכזת, רק התאמות משתנות)
    var count = 0, tx = ss.getSheetByName('תנועות ' + year);
    if (tx) {
      var th = headerMap_(tx), sc = th['סעיף'], tlast = tx.getLastRow();
      if (sc && tlast >= 2) {
        var col = tx.getRange(2, sc, tlast - 1, 1).getValues(), changed = false;
        for (var j = 0; j < col.length; j++) {
          if (String(col[j][0]).trim() === oldN) { col[j][0] = newN; count++; changed = true; }
        }
        if (changed) tx.getRange(2, sc, tlast - 1, 1).setValues(col);
      }
    }
    return { ok: true, renamed: newN, txUpdated: count };
  } finally {
    lock.releaseLock();
  }
}

/* ============ יומן "עדכוני תקציב" ============
 * טאב קבוע שמתעד כל שינוי בתכנון סעיף לאחר נעילת התקציב.
 * שורה = תאריך | שנה | סעיף | מ | אל | סיבה. מוסיף שורה בכל עדכון (append-only).
 * הטאב נוצר אוטומטית עם כותרות אם אינו קיים. */
function logBudgetUpdate_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ss.getSheetByName('עדכוני תקציב');
    if (!sh) {
      sh = ss.insertSheet('עדכוני תקציב');
      sh.appendRow(['תאריך', 'שנה', 'סעיף', 'מ', 'אל', 'סיבה']);
      sh.setFrozenRows(1);
    }
    sh.appendRow([
      body.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      body.year || '', body.section || '',
      Number(body.from) || 0, Number(body.to) || 0, body.reason || ''
    ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

// כותב את רשימת הקבוצות לטאב "קבוצות" (עמודה A, מתחת לכותרת). משותף לכל השנים.
function saveGroups_(ss, groups) {
  var sh = ss.getSheetByName('קבוצות');
  if (!sh) return 'אין טאב קבוצות';
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).clearContent();   // מנקים רק עמודה A
  if (groups.length) {
    var grid = groups.map(function (g) { return [g]; });
    sh.getRange(2, 1, groups.length, 1).setValues(grid);
  }
  return 'ok';
}

// מחזיר מפה: שם-כותרת -> אינדקס עמודה (מבוסס-1). 0 = לא נמצא.
function headerMap_(sh) {
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) map[String(headers[i]).trim()] = i + 1;
  return map;
}

// קורא את שורות הנתונים בעמודת-המפתח עד לשורת סה"כ/ספייר/ריקה (הגבול).
// מחזיר { rows:[{key,row}], boundary: <שורת הגבול או lastRow+1> }
function readKeyRows_(sh, keyCol) {
  var last = sh.getLastRow();
  var rows = [], boundary = last + 1;
  if (last >= 2) {
    var vals = sh.getRange(2, keyCol, last - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      var v = String(vals[i][0]).trim();
      if (v === '' || v === 'סה"כ' || v === 'סה”כ' || v === 'ספייר') { boundary = i + 2; break; }
      rows.push({ key: v, row: i + 2 });
    }
  }
  return { rows: rows, boundary: boundary };
}

// כתיבה מהירה של עמודה שלמה (וקטור אנכי) בקריאה אחת — במקום תא-תא.
// שומר על נוסחאות: אם באיזושהי שורה בעמודה יש נוסחה, נופל לכתיבה בטוחה תא-תא
// שמדלגת רק על תאי-הנוסחה. בעמודות-קלט רגילות (בלי נוסחאות) זו כתיבה בודדת ומהירה.
function writeOwnedColumn_(sh, firstRow, n, col, vals) {
  if (!col || n <= 0) return;
  var rng = sh.getRange(firstRow, col, n, 1);
  var formulas = rng.getFormulas();
  var anyFormula = false;
  for (var i = 0; i < n; i++) { if (formulas[i][0] !== '') { anyFormula = true; break; } }
  if (!anyFormula) {
    var grid = new Array(n);
    for (var j = 0; j < n; j++) grid[j] = [vals[j]];
    rng.setValues(grid);                       // כתיבה אחת לכל העמודה
  } else {
    for (var k = 0; k < n; k++) {              // יש נוסחאות — מדלגים עליהן
      if (formulas[k][0] === '') sh.getRange(firstRow + k, col).setValue(vals[k]);
    }
  }
}

// מסדר את שורות הנתונים כך שיתאימו בדיוק לרשימת הפריטים מהאפליקציה:
// מוחק שורות שנעלמו, מוסיף שורות ריקות לחדשים (מעל הגבול), ומחזיר את רשימת
// הפריטים בסדר-השורות הסופי + שורת ההתחלה. אחר כך כותבים עמודה-עמודה.
function reconcileRows_(sh, keyCol, items) {
  var byKey = {};
  items.forEach(function (it) { byKey[String(it.key).trim()] = it; });

  // 1) מחיקה (מלמטה למעלה)
  var state = readKeyRows_(sh, keyCol);
  for (var i = state.rows.length - 1; i >= 0; i--) {
    if (!byKey[state.rows[i].key]) sh.deleteRow(state.rows[i].row);
  }

  // 2) רשימת הפריטים בסדר השורות הקיימות
  state = readKeyRows_(sh, keyCol);
  var ordered = [], used = {};
  state.rows.forEach(function (o) {
    var it = byKey[o.key];
    if (it) { ordered.push(it); used[String(it.key).trim()] = true; }
  });

  // 3) הוספת שורות ריקות לפריטים חדשים — מעל הגבול, ברצף
  var newItems = items.filter(function (it) { return !used[String(it.key).trim()]; });
  for (var j = 0; j < newItems.length; j++) sh.insertRowBefore(state.boundary + j);
  newItems.forEach(function (it) { ordered.push(it); });

  return { ordered: ordered, firstRow: 2, n: ordered.length };
}

function saveBudgetCats_(ss, year, cats) {
  var sh = ss.getSheetByName('תקציב ' + year);
  if (!sh) return 'אין טאב תקציב ' + year;
  var H = headerMap_(sh);
  if (!H['סעיף']) return 'אין עמודת "סעיף"';

  var R = reconcileRows_(sh, H['סעיף'], cats);
  var o = R.ordered, first = R.firstRow, n = R.n;
  if (n === 0) return 'ok';

  writeOwnedColumn_(sh, first, n, H['סעיף'],       o.map(function (c) { return c.name || ''; }));
  writeOwnedColumn_(sh, first, n, H['תכנון שנתי'], o.map(function (c) { return Number(c.plan) || 0; }));
  writeOwnedColumn_(sh, first, n, H['קבוצה'],      o.map(function (c) { return c.group || ''; }));
  writeOwnedColumn_(sh, first, n, H['מקור מימון'], o.map(function (c) { return c.incomeSourceId || ''; }));
  writeOwnedColumn_(sh, first, n, H['מצב חלוקה'],  o.map(function (c) { return DIST_HE[c.distMode] || c.distMode || 'שווה'; }));
  for (var m = 0; m < MONTH_KEYS.length; m++) {
    (function (m) {
      writeOwnedColumn_(sh, first, n, H[MONTH_KEYS[m]],
        o.map(function (c) { return Number((c.monthly || [])[m]) || 0; }));
    })(m);
  }
  // ריפוי-עצמי: אם שורה איבדה את נוסחת ביצוע/יתרה/% ניצול (קורה כשסעיף נמחק+נוסף-מחדש
  // או הוזז — reconcileRows_ מכניס שורה ריקה חדשה בלי הנוסחה), מעתיקים אותה משורה תקינה
  // אחרת באותה עמודה (Range.copyTo מתאים אזכורי-שורה יחסיים אוטומטית, כמו העתק-הדבק ידני).
  healComputedFormulas_(sh, first, n, [H['ביצוע'], H['יתרה'], H['% ניצול']]);
  return 'ok';
}

// רואה עמודה אחת שאמורה להכיל נוסחה בכל שורות הטווח [first, first+n-1]. כל שורה שבה
// התא ריק (בלי נוסחה) — מקבלת עותק של הנוסחה מהשורה התקינה הקרובה ביותר בטווח (copyTo
// מתרגם הפניות יחסיות לשורה החדשה, בדיוק כמו העתק-הדבק ידני בגיליון).
function healComputedFormulas_(sh, first, n, cols) {
  cols.forEach(function (col) {
    if (!col || n <= 0) return;
    var formulas = sh.getRange(first, col, n, 1).getFormulas();
    var templateRow = -1;
    for (var i = 0; i < n; i++) { if (formulas[i][0] !== '') { templateRow = first + i; break; } }
    if (templateRow === -1) return; // אין שום שורה-מקור עם נוסחה בעמודה הזו — אין ממה להעתיק
    for (var k = 0; k < n; k++) {
      if (formulas[k][0] === '') {
        sh.getRange(templateRow, col).copyTo(sh.getRange(first + k, col));
      }
    }
  });
}

function saveBudgetIncome_(ss, year, income) {
  var sh = ss.getSheetByName('הכנסות ' + year);
  if (!sh) return 'אין טאב הכנסות ' + year;
  var H = headerMap_(sh);
  if (!H['מקור']) return 'אין עמודת "מקור"';

  var R = reconcileRows_(sh, H['מקור'], income);
  var o = R.ordered, first = R.firstRow, n = R.n;
  if (n === 0) return 'ok';

  writeOwnedColumn_(sh, first, n, H['מקור'], o.map(function (s) { return s.name || ''; }));
  writeOwnedColumn_(sh, first, n, H['סוג'],  o.map(function (s) { return s.type === 'dues' ? 'מחושב' : 'קבוע'; }));
  // "קבוע" -> סכום ; "מחושב" -> תעריף/משפחות/חודשים/חודש אחרון.
  // כותבים לכל שורה את הערך המתאים לסוגה (בשורות מהסוג האחר נשאיר את הקיים).
  writeMixedIncomeCol_(sh, first, o, H['סכום'],       'fixed', function (s) { return Number(s.amount) || 0; });
  writeMixedIncomeCol_(sh, first, o, H['תעריף'],      'dues',  function (s) { return Number(s.rate) || 0; });
  writeMixedIncomeCol_(sh, first, o, H['משפחות'],     'dues',  function (s) { return Number(s.families) || 0; });
  writeMixedIncomeCol_(sh, first, o, H['חודשים'],     'dues',  function (s) { return Number(s.months) || 0; });
  writeMixedIncomeCol_(sh, first, o, H['חודש אחרון'], 'dues',  function (s) { return Number(s.tailFamilies) || 0; });
  return 'ok';
}

// כותב עמודת-הכנסה שרלוונטית רק לסוג מסוים (dues/fixed). שורות מהסוג האחר —
// לא נוגעים בהן (משאירים את הערך/הנוסחה הקיימים). מדלג על תאי-נוסחה.
function writeMixedIncomeCol_(sh, firstRow, ordered, col, forType, valFn) {
  if (!col) return;
  var n = ordered.length;
  var formulas = sh.getRange(firstRow, col, n, 1).getFormulas();
  for (var i = 0; i < n; i++) {
    var s = ordered[i];
    var isDues = (s.type === 'dues');
    if ((forType === 'dues') !== isDues) continue;   // לא הסוג הזה — דלג
    if (formulas[i][0] !== '') continue;             // נוסחה — לא דורסים
    sh.getRange(firstRow + i, col).setValue(valFn(s));
  }
}

/** יצירת שנה חדשה: משכפל את 3 הטאבים במבנה הזהה, מנקה תנועות, ומעדכן נוסחאות. */
function addYear_(ss, body) {
  var newYear = body.year, fromYear = body.fromYear;
  if (ss.getSheetByName('תקציב ' + newYear)) return { ok: false, error: 'השנה כבר קיימת' };
  ['תקציב ', 'הכנסות ', 'תנועות '].forEach(function (prefix) {
    var src = ss.getSheetByName(prefix + fromYear);
    if (src) src.copyTo(ss).setName(prefix + newYear);
  });
  var bud = ss.getSheetByName('תקציב ' + newYear);
  if (bud) replaceFormulaRefs_(bud, 'תנועות ' + fromYear, 'תנועות ' + newYear);
  var tx = ss.getSheetByName('תנועות ' + newYear);
  if (tx && tx.getLastRow() > 1) tx.getRange(2, 1, tx.getLastRow() - 1, tx.getLastColumn()).clearContent();
  addYearToSettings_(ss, newYear);
  return { ok: true, year: newYear };
}

/** מחליף הפניה לשם טאב בכל התאים שהם נוסחה (בלבד — לא נוגע בתאי ערך). */
function replaceFormulaRefs_(sh, fromName, toName) {
  var formulas = sh.getDataRange().getFormulas();
  for (var r = 0; r < formulas.length; r++) {
    for (var c = 0; c < formulas[r].length; c++) {
      var f = formulas[r][c];
      if (f && f.indexOf(fromName) !== -1) {
        sh.getRange(r + 1, c + 1).setFormula(f.split(fromName).join(toName));
      }
    }
  }
}

function addYearToSettings_(ss, newYear) {
  var sh = ss.getSheetByName('הגדרות');
  if (!sh) return;
  var v = sh.getDataRange().getValues();
  for (var r = 0; r < v.length; r++) {
    if (String(v[r][0]).trim() === 'שנים') {
      var years = String(v[r][1]).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      if (years.indexOf(newYear) === -1) years.push(newYear);
      sh.getRange(r + 1, 2).setValue(years.join(', '));
      return;
    }
  }
}

/* ===================== עוזרים ===================== */
function readTable_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var first = String(row[0]).trim();
    if (first === '' || first === 'סה"כ' || first === 'ספייר') continue;
    var obj = {}, empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var val = row[c];
      obj[headers[c]] = val;
      if (val !== '' && val !== null) empty = false;
    }
    if (!empty) rows.push(obj);
  }
  return rows;
}

function readSettings_(ss) {
  var sh = ss.getSheetByName('הגדרות'), o = {};
  if (!sh) return o;
  var v = sh.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) { var k = String(v[r][0]).trim(); if (k) o[k] = v[r][1]; }
  return o;
}

function readColumn_(ss, name) {
  var sh = ss.getSheetByName(name), out = [];
  if (!sh) return out;
  var v = sh.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) { var s = String(v[r][0]).trim(); if (s) out.push(s); }
  return out;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== זיהוי תושבים (שלב ב') ===================== */
/**
 * מאמת התחברות: מקבל טוקן חתום מגוגל, מוודא מולם שהוא אמיתי ושייך לאפליקציה שלנו,
 * מוציא ממנו את האימייל המאומת, ומצליב מול טאב "תושבים" כדי להחזיר תפקיד והרשאה.
 */
function handleLogin_(token) {
  var CLIENT_ID = '312365638466-l1tug16dd953t08khr9f8qrh76iro46i.apps.googleusercontent.com';
  if (!token) return json_({ ok: false, error: 'חסר טוקן התחברות' });
  try {
    var resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true }
    );
    var info = JSON.parse(resp.getContentText());

    // בדיקות תקינות הטוקן
    if (!info.email || info.error || info.error_description) {
      return json_({ ok: false, error: 'טוקן לא תקין' });
    }
    if (info.aud !== CLIENT_ID) {
      return json_({ ok: false, error: 'הטוקן אינו שייך לאפליקציה זו' });
    }
    if (String(info.email_verified) !== 'true') {
      return json_({ ok: false, error: 'האימייל אינו מאומת בגוגל' });
    }

    // הצלבה מול רשימת התושבים
    var resident = lookupResident_(info.email);
    var base = { ok: true, email: info.email, name: info.name || '', picture: info.picture || '' };

    if (!resident.found) {
      return json_(Object.assign(base, { authorized: false, reason: 'not_listed' }));
    }
    if (resident.status && resident.status.indexOf('פעיל') === -1) {
      return json_(Object.assign(base, { authorized: false, reason: 'inactive' }));
    }
    // הרשאות (2026-08-07): נשלחות ללקוח כדי שידע מה להציג, ומונפק מושב חתום
    // שילווה כל פעולת כתיבה. הלקוח לא מקבל יותר את סיסמת המנהל.
    var perm = permissionsFor_(info.email);
    return json_(Object.assign(base, {
      authorized: true,
      session: makeSession_(info.email),
      perms: perm.perms,
      isSuper: perm.isSuper,
      role: resident.role,
      status: resident.status,
      family: resident.family,
      house: resident.house,
      familyId: resident.familyId,
      firstName: resident.firstName
    }));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * מקבל אימייל, מחפש אותו בטאב "תושבים" (בשתי עמודות האימייל),
 * ומחזיר את פרטי משק הבית: תפקיד, סטטוס, שם משפחה, מספר בית, ושם פרטי.
 * החיפוש אינו רגיש לאותיות גדולות/קטנות או לרווחים.
 *
 * שם פרטי (2026-08-05): הטאב "תושבים" יכול לכלול עמודת "שם פרטי" ליד כל עמודת
 * "אימייל" (למשל "שם פרטי 1" ליד "כתובת אימייל 1", "שם פרטי 2" ליד "כתובת אימייל 2") —
 * כדי שאפשר יהיה לדעת לטובת מי ההחזר (לא רק שם המשפחה). ההתאמה בין עמודת אימייל
 * לעמודת שם-פרטי היא **לפי סדר**: עמודת ה"שם פרטי" ה-1 משמאל שייכת לעמודת ה"אימייל"
 * ה-1, וכן הלאה — לכן חשוב שהעמודות יתווספו באותו סדר (שם פרטי אחרי כל אימייל).
 * אם אין עמודת "שם פרטי" בכלל, firstName יחזור ריק ולא ישפיע על שום דבר קיים.
 */
function lookupResident_(email) {
  var target = normalizeEmail_(email);
  if (!target) return { found: false, error: 'לא סופק אימייל' };

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { found: false, error: 'אין טאב "תושבים"' };

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { found: false, error: 'הטאב "תושבים" ריק' };

  var headers = values[0].map(function (h) { return String(h).trim(); });

  // איתור עמודות לפי שם הכותרת (גמיש — עמיד גם אם משנים את סדר העמודות).
  // "שם פרטי" נבדק לפני "משפחה" כדי שלא יתבלבל עם עמודת שם-המשפחה.
  var emailCols = [], firstNameCols = [], permCols = [], roleCol = -1, statusCol = -1, familyCol = -1, houseCol = -1, residentIdCol = -1;
  headers.forEach(function (h, i) {
    // "הרשאות N" (2026-08-07) — עמודה לכל משבצת אימייל, מותאמת לפי סדר כמו "שם פרטי N"
    if (h.indexOf(PERM_HEADER) !== -1) permCols.push(i);
    else if (h.indexOf('שם פרטי') !== -1) firstNameCols.push(i);
    else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    else if (h.indexOf('תפקיד') !== -1) roleCol = i;
    else if (h.indexOf('סטטוס') !== -1) statusCol = i;
    else if (h.indexOf(RESIDENT_ID_HEADER) !== -1) residentIdCol = i; // נבדק לפני "משפחה"/"בית" כדי שלא יתפוס אותם בטעות
    else if (h.indexOf('משפחה') !== -1) familyCol = i;
    else if (h.indexOf('בית') !== -1) houseCol = i;
  });

  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    for (var c = 0; c < emailCols.length; c++) {
      if (normalizeEmail_(row[emailCols[c]]) === target) {
        var fnCol = firstNameCols[c]; // התאמה לפי סדר: אימייל ה-c-י <-> שם-פרטי ה-c-י
        // מזהה משפחה (עודכן 2026-08-06): מספר הבית אינו יציב — דיירים לפעמים עוברים בין
        // בתים — לכן הוא כבר לא משמש כמזהה. במקומו יש עמודה ייעודית וקבועה ("מזהה קבוע")
        // בטאב "תושבים" שנוצרת/מתמלאת פעם אחת (ר' assignResidentIds_) ולא משתנה לעולם,
        // גם אם מספר הבית או שם המשפחה משתנים בעתיד. נופלים חזרה למספר הבית רק אם
        // מסיבה כלשהי אין עדיין מזהה קבוע לשורה הזו (מצב מעבר/לא-צפוי).
        var houseVal = houseCol > -1 ? String(row[houseCol]).trim() : '';
        var residentIdVal = residentIdCol > -1 ? String(row[residentIdCol]).trim() : '';
        return {
          found: true,
          email: target,
          role:   roleCol   > -1 ? String(row[roleCol]).trim()   : '',
          status: statusCol > -1 ? String(row[statusCol]).trim() : '',
          family: familyCol > -1 ? String(row[familyCol]).trim() : '',
          house:  houseVal,
          familyId: residentIdVal || houseVal,
          firstName: (fnCol !== undefined && fnCol > -1) ? String(row[fnCol]).trim() : '',
          slot: c + 1,          // באיזו משבצת אימייל נמצא — לשמירת הרשאות פרטניות
          rowIndex: r + 1,      // מספר השורה בגיליון (1-based, כולל כותרת)
          permissions: (permCols[c] !== undefined) ? String(row[permCols[c]]).trim() : ''
        };
      }
    }
  }
  return { found: false, email: target, error: 'האימייל לא נמצא ברשימת התושבים' };
}

/** מנרמל אימייל: מסיר רווחים וממיר לאותיות קטנות. */
function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

/* ============ מיזוג "שם פרטי" מספר טלפונים לטאב "תושבים" (2026-08-05) ============
 * שני חלקים:
 *  - handleGetResidents_ (GET, סיסמת מנהל): מחזיר את כל טאב "תושבים" כפי שהוא, כדי
 *    שאפשר לבדוק מראש מה קיים לפני כתיבה.
 *  - saveResidentNames_ (POST, סיסמת מנהל, דרך doPost): מקבל רשימת בתים מספר הטלפונים
 *    {house, family, person1:{name,phone}, person2:{name,phone}}. לבית שכבר יש לו
 *    שורה ב"תושבים": מוסיף "שם פרטי" רק במקום שבו מספר הטלפון בספר הטלפונים תואם
 *    *בדיוק* מספר טלפון שכבר רשום באותה שורה — כך שם פרטי משויך לעמודת האימייל
 *    הנכונה (1 או 2) גם אם הסדר בספר הטלפונים שונה מהסדר בגיליון, ובלי לנחש כשאין
 *    התאמה ודאית (מדווח ambiguousPhones ולא כותב כלום). לבית שאין לו שורה בכלל:
 *    אם body.createMissing===true יוצר שורה חדשה עם רק מה שיש בספר הטלפונים
 *    (משפחה/מספר בית/שם פרטי/טלפון) — אימייל/תפקיד/סטטוס נשארים ריקים בכוונה (לא
 *    ממציאים אותם; התושב פשוט לא יוכל להתחבר עד שאלה יוזנו בנפרד). אחרת מדווח
 *    unmatchedHouses ולא יוצר כלום. */
function handleGetResidents_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_RESIDENTS);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var sh = ss.getSheetByName('תושבים');
    if (!sh) return json_({ ok: false, error: 'אין טאב "תושבים"' });
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return json_({ ok: true, headers: values[0] || [], rows: [] });
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var obj = {}, empty = true;
      for (var c = 0; c < headers.length; c++) {
        if (!headers[c]) continue;
        var val = values[r][c];
        obj[headers[c]] = val;
        if (val !== '' && val !== null) empty = false;
      }
      if (!empty) rows.push(obj);
    }
    return json_({ ok: true, headers: headers, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// מוודא שקיימת עמודת "שם פרטי" מיד אחרי עמודת אימייל נתונה — אם לא, מוסיף אותה (עם כותרת)
// ומזיז את שאר העמודות ימינה. לא נוגע בעמודות קיימות אחרות.
function ensureFirstNameColumn_(sh, emailHeader, fnHeader) {
  var H = headerMap_(sh);
  if (H[fnHeader]) return;               // כבר קיימת — לא עושים כלום
  var emailCol = H[emailHeader];
  if (!emailCol) return;                 // אין עמודת אימייל כזו בטאב — מדלגים
  sh.insertColumnAfter(emailCol);
  sh.getRange(1, emailCol + 1).setValue(fnHeader);
}

/* ============ מזהה משפחה קבוע בטאב "תושבים" (2026-08-06) ============
 * למה: מספר הבית הוחלט בהתחלה כמזהה משפחה (הפתרון הפשוט ביותר), אבל התברר שהוא לא
 * יציב — דיירים לפעמים עוברים בין בתים בתוך הישוב, ואז אותה משפחה הייתה "מאבדת" את
 * הקישור לכל ההיסטוריה שלה. הפתרון: עמודה חדשה וקבועה "מזהה קבוע" בטאב "תושבים" —
 * מספר סידורי שנוצר פעם אחת לכל שורה ולא משתנה לעולם, גם אם מספר הבית/שם המשפחה
 * משתנים. handleAssignResidentIds_ הוא אידמפוטנטי: אפשר להריץ אותו שוב ושוב בבטחה
 * (למשל אחרי שנוסף תושב חדש) — הוא רק ממלא שורות שעדיין אין להן מזהה, לא נוגע
 * במזהים קיימים. */
function ensureResidentIdColumn_(sh) {
  var H = headerMap_(sh);
  if (H[RESIDENT_ID_HEADER]) return H[RESIDENT_ID_HEADER];
  var col = sh.getLastColumn() + 1;
  sh.getRange(1, col).setValue(RESIDENT_ID_HEADER);
  return col;
}

function assignResidentIds_(ss) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var col = ensureResidentIdColumn_(sh);
    var last = sh.getLastRow();
    if (last < 2) return { ok: true, assigned: 0, total: 0 };
    var range = sh.getRange(2, col, last - 1, 1);
    var vals = range.getValues();
    var maxId = 0;
    vals.forEach(function (row) {
      var n = parseInt(row[0], 10);
      if (!isNaN(n) && n > maxId) maxId = n;
    });
    var assigned = 0;
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === '') {
        maxId += 1;
        vals[i][0] = maxId;
        assigned++;
      }
    }
    if (assigned > 0) range.setValues(vals);
    return { ok: true, assigned: assigned, total: vals.length };
  } finally {
    lock.releaseLock();
  }
}

function handleAssignResidentIds_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_RESIDENTS);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    return json_(assignResidentIds_(ss));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function saveResidentNames_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureFirstNameColumn_(sh, 'כתובת אימייל 1', 'שם פרטי 1');
    ensureFirstNameColumn_(sh, 'כתובת אימייל 2', 'שם פרטי 2');
    var H = headerMap_(sh);
    var houseCol = H['מספר בית'], p1Col = H['מספר טלפון 1'], p2Col = H['מספר טלפון 2'];
    var fn1Col = H['שם פרטי 1'], fn2Col = H['שם פרטי 2'];
    if (!houseCol) return { ok: false, error: 'אין עמודת "מספר בית"' };
    var last = sh.getLastRow();
    if (last < 2) return { ok: false, error: 'הטאב ריק' };

    var norm = function (s) { return String(s || '').replace(/[^0-9]/g, ''); }; // רק ספרות — משווה בלי מקפים/רווחים
    var houseVals = sh.getRange(2, houseCol, last - 1, 1).getValues();
    var byHouse = {};
    for (var i = 0; i < houseVals.length; i++) {
      var h = String(houseVals[i][0]).trim();
      if (!h) continue;
      if (!byHouse[h]) byHouse[h] = [];
      byHouse[h].push(i + 2); // שורה בגיליון (1-based, אחרי הכותרת)
    }

    var familyCol = H['משפחה'];
    var lastCol = sh.getLastColumn();
    var list = body.residents || [];
    var report = { matchedHouses: 0, unmatchedHouses: [], ambiguousPhones: [], created: [] };
    list.forEach(function (u) {
      var house = String(u.house || '').trim();
      if (!house) return;
      var name1 = (u.person1 && u.person1.name) || '', phone1raw = (u.person1 && u.person1.phone) || '';
      var name2 = (u.person2 && u.person2.name) || '', phone2raw = (u.person2 && u.person2.phone) || '';
      var phone1 = norm(phone1raw), phone2 = norm(phone2raw);
      var rowsForHouse = byHouse[house];

      if (!rowsForHouse || !rowsForHouse.length) {
        // אין עדיין שורה לבית הזה ב"תושבים" — אם נתבקש (body.createMissing), יוצרים
        // שורה חדשה עם מה שיש בספר הטלפונים בלבד (משפחה/בית/שם פרטי/טלפון). לא ממציאים
        // אימייל/תפקיד/סטטוס — אלה נשארים ריקים עד שיוזנו בנפרד (וכך התושב לא יוכל
        // להתחבר עד שיהיה לו אימייל ותפקיד, כמו שצריך).
        if (body.createMissing && (name1 || name2)) {
          var newRow = new Array(lastCol).fill('');
          if (familyCol) newRow[familyCol - 1] = u.family || '';
          newRow[houseCol - 1] = house;
          if (fn1Col) newRow[fn1Col - 1] = name1;
          if (p1Col) newRow[p1Col - 1] = phone1raw;
          if (fn2Col) newRow[fn2Col - 1] = name2;
          if (p2Col) newRow[p2Col - 1] = phone2raw;
          sh.appendRow(newRow);
          report.created.push(house);
        } else {
          report.unmatchedHouses.push(house);
        }
        return;
      }

      var row = rowsForHouse[0];
      var existingP1 = p1Col ? norm(sh.getRange(row, p1Col).getValue()) : '';
      var existingP2 = p2Col ? norm(sh.getRange(row, p2Col).getValue()) : '';
      var wrote = false;
      // כל שם משויך לעמודה לפי התאמת מספר טלפון בפועל — לא לפי סדר בספר הטלפונים
      if (name1 && phone1 && fn1Col && existingP1 && phone1 === existingP1) { sh.getRange(row, fn1Col).setValue(name1); wrote = true; }
      else if (name1 && phone1 && fn2Col && existingP2 && phone1 === existingP2) { sh.getRange(row, fn2Col).setValue(name1); wrote = true; }
      if (name2 && phone2 && fn1Col && existingP1 && phone2 === existingP1) { sh.getRange(row, fn1Col).setValue(name2); wrote = true; }
      else if (name2 && phone2 && fn2Col && existingP2 && phone2 === existingP2) { sh.getRange(row, fn2Col).setValue(name2); wrote = true; }
      if (wrote) report.matchedHouses++;
      else report.ambiguousPhones.push(house);
    });
    return Object.assign({ ok: true }, report);
  } finally {
    lock.releaseLock();
  }
}

/* ============ תיקון פורמט טאב "תושבים" (2026-08-05) ============
 * שני דברים בבת אחת:
 *  (1) מספרי טלפון: חלק מהמספרים בספר הטלפונים היו רצף ספרות בלי מקף (למשל
 *      "0547299588") — Sheets "חשב" שזה מספר וכתב אותו כ-547299588, בלי ה-0
 *      המוביל. מזהים כל תא כזה (ערך שהוא NUMBER, לא טקסט) לפי אורך: 9 ספרות =
 *      חסר 0 מוביל, מוסיפים אותו; מנרמלים הכל לפורמט אחיד "0XX-XXXXXXX" (3 ספרות,
 *      מקף, 7 ספרות — הפורמט הסטנדרטי למספר נייד ישראלי) ומגדירים את כל העמודה
 *      כפורמט טקסט (@) כדי ש-Sheets לא ינחש שוב "מספר" בעתיד.
 *  (2) עיצוב אחיד: 68 השורות שנוספו לאחרונה נכתבו ע"י appendRow בלי שום עיצוב
 *      (גופן/יישור/גבולות) — כדי שהטבלה תיראה אחידה, מעתיקים את עיצוב התא (לא
 *      את הערך) משורה 2 לכל שאר שורות הנתונים, עמודה-עמודה, ברוחב הטבלה כולה. */
function formatResidents_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var H = headerMap_(sh);
    var last = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (last < 2) return { ok: true, fixedPhones: 0 };

    // --- (1) מספרי טלפון ---
    var fixedPhones = 0;
    [H['מספר טלפון 1'], H['מספר טלפון 2']].forEach(function (col) {
      if (!col) return;
      var rng = sh.getRange(2, col, last - 1, 1);
      rng.setNumberFormat('@');           // מעכשיו: תמיד טקסט, לא ינחש "מספר" שוב
      var vals = rng.getValues();
      for (var i = 0; i < vals.length; i++) {
        var raw = vals[i][0];
        if (raw === '' || raw === null) continue;
        var digits = String(raw).replace(/[^0-9]/g, '');
        if (!digits) continue;
        if (digits.length === 9) { digits = '0' + digits; fixedPhones++; }  // 0 מוביל חסר
        var formatted = digits.length === 10 ? (digits.slice(0, 3) + '-' + digits.slice(3)) : digits;
        vals[i][0] = formatted;
      }
      rng.setValues(vals);
    });

    // --- (2) עיצוב אחיד: מעתיקים עיצוב (לא ערכים) משורה 2 על כל שאר השורות ---
    if (last > 2) {
      var templateRow = sh.getRange(2, 1, 1, lastCol);
      templateRow.copyFormatToRange(sh, 1, lastCol, 3, last);
    }

    return { ok: true, fixedPhones: fixedPhones };
  } finally {
    lock.releaseLock();
  }
}

/** בדיקה ידנית בעורך: הריצו פונקציה זו וראו את התוצאה ב-Execution log. */
function testLookup() {
  var result = lookupResident_('yoad9852@gmail.com');
  Logger.log(JSON.stringify(result, null, 2));
}

/** הרצה חד-פעמית בעורך כדי לאשר לסקריפט גישה לשירות חיצוני (אימות טוקן מול גוגל). */
function authorizeExternal() {
  var r = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=x', { muteHttpExceptions: true });
  Logger.log('OK: ' + r.getResponseCode());
}

/** אבחון: מציגה את כל היומנים שהחשבון המריץ את הסקריפט (execute-as) רואה —
 * שם + מזהה מדויק לכל אחד. שימושי כשיש שגיאת "לא נמצא יומן המועדון": מריצים את
 * זה, מוצאים בלוג את השורה עם השם הנכון, ומעתיקים את המזהה המדויק שלה
 * ל-CLUB_CALENDAR_ID למעלה בקובץ (זה יותר אמין מהעתקה מתוך קישור embed). */
function listMyCalendars() {
  var cals = CalendarApp.getAllCalendars();
  cals.forEach(function (c) {
    Logger.log(c.getName() + '  |  ' + c.getId());
  });
  Logger.log('סה"כ: ' + cals.length + ' יומנים נגישים לחשבון הזה');
}

/** בדיקה ידנית של שריון המועדון (שלב 8) — מריצים בעורך (▶) ואז View → Logs.
 * ריצה ראשונה תבקש הרשאה לשירות היומן (Calendar) — יש לאשר. בודקת: קריאת תפוסה
 * להיום, ואז יצירת שריון בדיקה של 15 דקות בעוד שעה מעכשיו (אפשר למחוק אחר כך מהיומן). */
function testClubReserve() {
  var tz = Session.getScriptTimeZone();
  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  Logger.log('תפוסה להיום: ' + JSON.stringify(JSON.parse(handleClubBusy_(today).getContent())));

  var soon = new Date(Date.now() + 60 * 60 * 1000);
  var startStr = Utilities.formatDate(soon, tz, 'HH:mm');
  var endStr = Utilities.formatDate(new Date(soon.getTime() + 15 * 60 * 1000), tz, 'HH:mm');
  var result = handleReserveClub_({
    date: today, start: startStr, end: endStr,
    family: 'בדיקת מערכת', house: '0', email: 'test@example.com', note: 'שורת בדיקה — אפשר למחוק מהיומן'
  });
  Logger.log('תוצאת שריון בדיקה: ' + result.getContent());
}

/** בדיקה ידנית של הגשת קבלה (בלי דפדפן/אפליקציה בכלל) — מדמה בקשה עם "תמונה" זעירה
 * (פיקסל PNG שקוף) ובודקת שהגישה לתיקיית Drive והכתיבה לתנועות עובדות מקצה לקצה.
 * הריצו את הפונקציה הזו בעורך (▶) ואז View → Logs (או Ctrl+Enter) כדי לראות את
 * התוצאה/השגיאה המדויקת — זו הדרך היחידה לראות שגיאות אמיתיות, כי הכתיבה מהאפליקציה
 * עצמה היא "שגר ושכח" (no-cors) והדפדפן לא יכול לקרוא את השגיאה בחזרה. */
function testSubmitReceipt() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var years = [];
  ss.getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (n.indexOf('תנועות ') === 0) years.push(n.substring('תנועות '.length));
  });
  var tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  var result = submitReceipt_(ss, {
    year: years[0], expenseType: 'refund', amount: 10,
    supplier: 'בדיקת מערכת', description: 'שורת בדיקה — אפשר למחוק',
    buyer: 'בדיקה', fileName: 'test.png', mimeType: 'image/png', dataBase64: tinyPng
  });
  Logger.log(JSON.stringify(result, null, 2));
}

/* ============ בקשות הרשמה וניהול תושבים (2026-08-07) ============
 * זרימה: מבקר מתחבר עם גוגל, המייל לא נמצא בטאב "תושבים" → הוא ממלא טופס קצר
 * (שם פרטי, שם משפחה, מספר בית) → נרשמת שורה בטאב "בקשות הרשמה" → המנהל רואה
 * אותה במסך "תושבים", מקבל המלצה לאיזו משפחה לשייך, ומאשר או דוחה.
 *
 * אבטחה: הבקשה נשלחת בלי סיסמת מנהל (המבקש עוד לא רשום), אבל היא **חייבת**
 * לכלול טוקן גוגל תקין. השרת מאמת אותו מול גוגל ומוציא ממנו את האימייל — כך
 * שהמייל בבקשה תמיד אמיתי ומאומת, ואי אפשר להירשם בשם של מישהו אחר.
 */
var SIGNUPS_SHEET = 'בקשות הרשמה';
var SIGNUP_HEADERS = ['מזהה', 'תאריך בקשה', 'אימייל', 'שם פרטי', 'שם משפחה', 'מספר בית', 'סטטוס', 'שויך למשפחה', 'טופל בתאריך'];

function getSignupsSheet_(ss) {
  var sh = ss.getSheetByName(SIGNUPS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SIGNUPS_SHEET);
    sh.getRange(1, 1, 1, SIGNUP_HEADERS.length).setValues([SIGNUP_HEADERS]);
    sh.getRange(1, 1, 1, SIGNUP_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/** מאמת טוקן גוגל ומחזיר את האימייל המאומת, או null. */
function verifiedEmailFromToken_(token) {
  if (!token) return null;
  try {
    var resp = UrlFetchApp.fetch(
      'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token),
      { muteHttpExceptions: true });
    var info = JSON.parse(resp.getContentText());
    if (!info.email || info.error) return null;
    if (info.aud !== '312365638466-l1tug16dd953t08khr9f8qrh76iro46i.apps.googleusercontent.com') return null;
    if (String(info.email_verified) !== 'true') return null;
    return normalizeEmail_(info.email);
  } catch (e) { return null; }
}

function handleSubmitSignup_(p) {
  try {
    var email = verifiedEmailFromToken_(p.token);
    if (!email) return json_({ ok: false, error: 'אימות גוגל נכשל' });

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    // כבר רשום? אין טעם בבקשה
    if (lookupResident_(email).found) {
      return json_({ ok: false, error: 'המייל הזה כבר רשום במערכת' });
    }
    var sh = getSignupsSheet_(ss);
    var values = sh.getDataRange().getValues();
    // בקשה ממתינה קיימת לאותו מייל? לא מכפילים
    for (var r = 1; r < values.length; r++) {
      if (normalizeEmail_(values[r][2]) === email && String(values[r][6]).trim() === 'ממתין') {
        return json_({ ok: true, duplicate: true, message: 'בקשה קודמת שלך כבר ממתינה לאישור' });
      }
    }
    var id = 'S' + new Date().getTime();
    sh.appendRow([id, new Date(), email,
      String(p.firstName || '').trim(), String(p.lastName || '').trim(),
      String(p.house || '').trim(), 'ממתין', '', '']);
    return json_({ ok: true, id: id });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function handleListSignups_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_RESIDENTS);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var sh = getSignupsSheet_(ss);
    var values = sh.getDataRange().getValues();
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var v = values[r];
      if (!String(v[0]).trim()) continue;
      rows.push({
        id: String(v[0]), date: v[1], email: String(v[2] || ''),
        firstName: String(v[3] || ''), lastName: String(v[4] || ''),
        house: String(v[5] || ''), status: String(v[6] || ''),
        linkedFamily: String(v[7] || '')
      });
    }
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** מאתר את מספר השורה של בקשה לפי מזהה. מחזיר -1 אם לא נמצאה. */
function signupRowById_(sh, id) {
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) if (String(values[r][0]) === String(id)) return r + 1;
  return -1;
}

/**
 * אישור בקשה: כותב את האימייל ואת השם הפרטי לשורת המשפחה שנבחרה בטאב "תושבים".
 * body.residentRowIndex = אינדקס השורה (1-based, כפי שהוחזר ב-getResidents) —
 * או body.newFamily=true ליצירת משק בית חדש בסוף הטאב.
 */
function approveSignup_(ss, body) {
  var sh = getSignupsSheet_(ss);
  var row = signupRowById_(sh, body.id);
  if (row === -1) return { ok: false, error: 'בקשה לא נמצאה' };
  var req = sh.getRange(row, 1, 1, SIGNUP_HEADERS.length).getValues()[0];
  var email = String(req[2] || ''), firstName = String(req[3] || ''),
      lastName = String(req[4] || ''), house = String(req[5] || '');

  var rsh = ss.getSheetByName('תושבים');
  if (!rsh) return { ok: false, error: 'אין טאב "תושבים"' };
  var values = rsh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });

  var emailCols = [], firstNameCols = [], familyCol = -1, houseCol = -1, statusCol = -1;
  headers.forEach(function (h, i) {
    if (h.indexOf('שם פרטי') !== -1) firstNameCols.push(i);
    else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    else if (h.indexOf('סטטוס') !== -1) statusCol = i;
    else if (h.indexOf(RESIDENT_ID_HEADER) !== -1) { /* מזהה קבוע — לא נוגעים */ }
    else if (h.indexOf('משפחה') !== -1) familyCol = i;
    else if (h.indexOf('בית') !== -1) houseCol = i;
  });
  if (!emailCols.length) return { ok: false, error: 'אין עמודת אימייל בטאב תושבים' };

  var targetRow;   // 1-based בגיליון
  if (body.newFamily) {
    var blank = new Array(headers.length).fill('');
    if (familyCol > -1) blank[familyCol] = lastName;
    if (houseCol > -1) blank[houseCol] = house;
    if (statusCol > -1) blank[statusCol] = 'פעיל';
    rsh.appendRow(blank);
    targetRow = rsh.getLastRow();
  } else {
    targetRow = parseInt(body.residentRowIndex, 10);
    if (!targetRow || targetRow < 2) return { ok: false, error: 'לא נבחרה שורת משפחה' };
  }

  // בוחר את משבצת האימייל הפנויה הראשונה; אם כולן תפוסות — כותב לאחרונה
  var cur = rsh.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  var slot = -1;
  for (var i = 0; i < emailCols.length; i++) {
    if (!String(cur[emailCols[i]] || '').trim()) { slot = i; break; }
  }
  if (slot === -1) slot = emailCols.length - 1;

  rsh.getRange(targetRow, emailCols[slot] + 1).setValue(email);
  if (firstNameCols[slot] !== undefined && firstName) {
    rsh.getRange(targetRow, firstNameCols[slot] + 1).setValue(firstName);
  }
  if (statusCol > -1 && !String(cur[statusCol] || '').trim()) {
    rsh.getRange(targetRow, statusCol + 1).setValue('פעיל');
  }

  var famName = familyCol > -1 ? String(cur[familyCol] || lastName) : lastName;
  sh.getRange(row, 7).setValue('אושר');
  sh.getRange(row, 8).setValue(famName);
  sh.getRange(row, 9).setValue(new Date());
  return { ok: true, family: famName, row: targetRow };
}

function rejectSignup_(ss, body) {
  var sh = getSignupsSheet_(ss);
  var row = signupRowById_(sh, body.id);
  if (row === -1) return { ok: false, error: 'בקשה לא נמצאה' };
  sh.getRange(row, 7).setValue('נדחה');
  sh.getRange(row, 9).setValue(new Date());
  return { ok: true };
}

/** עדכון שדות בשורת תושב קיימת (תפקיד/סטטוס/אימייל/שם) — למסך ניהול התושבים. */
function saveResidentRow_(ss, body) {
  var rsh = ss.getSheetByName('תושבים');
  if (!rsh) return { ok: false, error: 'אין טאב "תושבים"' };
  var rowIdx = parseInt(body.rowIndex, 10);
  if (!rowIdx || rowIdx < 2) return { ok: false, error: 'שורה לא תקינה' };
  var headers = rsh.getRange(1, 1, 1, rsh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var fields = body.fields || {};
  var written = [];
  Object.keys(fields).forEach(function (k) {
    var c = headers.indexOf(k);
    if (c === -1) return;
    rsh.getRange(rowIdx, c + 1).setValue(fields[k]);
    written.push(k);
  });
  if (!written.length) return { ok: false, error: 'לא נמצאו עמודות תואמות' };
  return { ok: true, written: written };
}

/* ---------- עמודות נוספות בטאב "תושבים" (2026-08-07) ----------
 * מקצוע ושמות ילדים. נוצרות פעם אחת בסוף הטאב אם אינן קיימות, בלי לגעת
 * בעמודות קיימות ובלי לשנות את סדרן — אידמפוטנטי, אפשר לקרוא שוב בלי נזק. */
var EXTRA_RESIDENT_COLS = ['מקצוע 1', 'מקצוע 2', 'שמות ילדים', 'הערות'];

function ensureResidentCols_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = EXTRA_RESIDENT_COLS.filter(function (c) { return headers.indexOf(c) === -1; });
  if (!missing.length) return { ok: true, added: [] };
  sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  sh.getRange(1, lastCol + 1, 1, missing.length).setFontWeight('bold');
  return { ok: true, added: missing };
}

/* ============ ייצוא טבלת התושבים לגיליון חדש (2026-08-07) ============
 * הלקוח שולח אילו עמודות לייצא ואילו שורות (לפי מספר השורה בגיליון המקור, כדי
 * שהייצוא יכבד את הסינון/חיפוש שעל המסך). השרת קורא את הערכים מהמקור ולא סומך
 * על מה שנשלח — כך אי אפשר "לייצא" עמודה שאין למייצא הרשאה אליה.
 *
 * הגיליון שנוצר משותף אוטומטית עם מי שביקש את הייצוא, כי הסקריפט רץ תחת חשבון
 * הבעלים — בלי זה מנהל תושבים אחר היה מקבל קישור שאין לו גישה אליו.
 */
var EXPORT_HEAD_BG   = '#111827';
var EXPORT_TITLE_BG  = '#F3F4F6';
var EXPORT_BORDER    = '#D1D5DB';

function exportResidents_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };

  var values = sh.getDataRange().getValues();
  if (values.length < 2) return { ok: false, error: 'הטאב "תושבים" ריק' };
  var headers = values[0].map(function (h) { return String(h).trim(); });

  // רק עמודות שקיימות באמת, בסדר שנשלח מהמסך
  var cols = (body.columns || []).map(function (c) { return String(c).trim(); })
    .filter(function (c) { return headers.indexOf(c) !== -1; })
    .filter(function (c, i, a) { return a.indexOf(c) === i; });
  if (!cols.length) return { ok: false, error: 'לא נבחרה אף עמודה לייצוא' };
  var idxs = cols.map(function (c) { return headers.indexOf(c); });

  // אילו שורות: מספרי שורה בגיליון המקור (2 ומעלה). ריק/חסר = הכול.
  var wanted = {};
  var hasFilter = Array.isArray(body.rowIndexes) && body.rowIndexes.length > 0;
  if (hasFilter) body.rowIndexes.forEach(function (n) { wanted[parseInt(n, 10)] = true; });

  var rows = [];
  for (var r = 1; r < values.length; r++) {
    if (hasFilter && !wanted[r + 1]) continue;
    rows.push(idxs.map(function (i) {
      var v = values[r][i];
      return (v === null || v === undefined) ? '' : v;
    }));
  }
  if (!rows.length) return { ok: false, error: 'אין שורות לייצוא' };

  var tz = Session.getScriptTimeZone();
  var stamp = Utilities.formatDate(new Date(), tz, 'dd.MM.yyyy');
  var name = String(body.name || '').trim() || ('תושבים — ייצוא ' + stamp);
  var subtitle = String(body.subtitle || '').trim();

  var out = SpreadsheetApp.create(name);
  var s = out.getSheets()[0];
  s.setName('תושבים');
  s.setRightToLeft(true);   // הגיליון עצמו מימין לשמאל, כמו האפליקציה

  var nCols = cols.length, nRows = rows.length;

  // שורה 1 — כותרת, שורה 2 — כותרות עמודות, שורה 3 ואילך — נתונים
  s.getRange(1, 1, 1, nCols).merge()
    .setValue(name + (subtitle ? '   ·   ' + subtitle : ''))
    .setFontSize(14).setFontWeight('bold').setFontFamily('Arial')
    .setBackground(EXPORT_TITLE_BG).setFontColor(EXPORT_HEAD_BG)
    .setHorizontalAlignment('right').setVerticalAlignment('middle');
  s.setRowHeight(1, 40);

  var head = s.getRange(2, 1, 1, nCols);
  head.setValues([cols])
    .setFontWeight('bold').setFontSize(11).setFontFamily('Arial')
    .setBackground(EXPORT_HEAD_BG).setFontColor('#FFFFFF')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  s.setRowHeight(2, 32);

  var data = s.getRange(3, 1, nRows, nCols);
  data.setValues(rows).setFontSize(11).setFontFamily('Arial')
    .setVerticalAlignment('middle').setWrap(false);

  // טלפון/בית/מזהה — כטקסט, אחרת אפס מוביל נעלם ומספרי בית הופכים למספרים
  cols.forEach(function (c, i) {
    if (c.indexOf('טלפון') !== -1 || c.indexOf('בית') !== -1 || c === RESIDENT_ID_HEADER) {
      s.getRange(3, i + 1, nRows, 1).setNumberFormat('@').setHorizontalAlignment('center');
    }
  });

  // פסים מתחלפים + מסגרות עדינות + הקפאה + מסנן — כמו טבלה מוכנה לעבודה
  try { data.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false); } catch (e) {}
  s.getRange(2, 1, nRows + 1, nCols)
    .setBorder(true, true, true, true, true, true, EXPORT_BORDER, SpreadsheetApp.BorderStyle.SOLID);
  s.setFrozenRows(2);
  try { s.getRange(2, 1, nRows + 1, nCols).createFilter(); } catch (e) {}

  // רוחב עמודות: אוטומטי, ואז תיקון לגבולות סבירים כדי שלא יהיו עמודות צרות מדי
  for (var ci = 1; ci <= nCols; ci++) {
    s.autoResizeColumn(ci);
    var w = s.getColumnWidth(ci);
    if (w < 90) s.setColumnWidth(ci, 90);
    if (w > 260) s.setColumnWidth(ci, 260);
  }
  // מוחקים עמודות/שורות ריקות שנשארו מברירת המחדל של גיליון חדש
  if (s.getMaxColumns() > nCols) s.deleteColumns(nCols + 1, s.getMaxColumns() - nCols);
  if (s.getMaxRows() > nRows + 2) s.deleteRows(nRows + 3, s.getMaxRows() - (nRows + 2));

  // הקובץ נוצר ב-Drive של בעל הסקריפט. מעבירים אותו לתיקייה של גיליון המקור
  // ומשתפים עם מי שביקש, כדי שהקישור שיחזור אליו באמת ייפתח אצלו.
  try {
    var file = DriveApp.getFileById(out.getId());
    var parents = DriveApp.getFileById(ss.getId()).getParents();
    if (parents.hasNext()) parents.next().addFile(file);
    if (body._email) file.addEditor(body._email);
  } catch (e) { /* שיתוף/העברה נכשלו — הקובץ עדיין נוצר, לא מפילים את הפעולה */ }

  return { ok: true, url: out.getUrl(), name: name, rows: nRows, columns: nCols };
}

/** ספריית שמות בלבד — בלי אימייל/טלפון/הרשאות. ר' ההערה ב-doGet. */
function handleResidentDirectory_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_ANY_ADMIN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var sh = ss.getSheetByName('תושבים');
    if (!sh) return json_({ ok: false, error: 'אין טאב "תושבים"' });
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return json_({ ok: true, rows: [] });
    var headers = values[0].map(function (h) { return String(h).trim(); });
    // התאמה לפי הכלה (ולא שוויון מדויק) כדי שזה יעבוד גם אם הכותרת היא
    // "שם משפחה" וגם "משפחה". מה שלא ברשימה — ובראשו אימייל, טלפון והרשאות —
    // פשוט לא יוצא מהשרת.
    function keep_(h) {
      return h === RESIDENT_ID_HEADER || h.indexOf('משפחה') !== -1 ||
             h.indexOf('שם פרטי') !== -1 || h.indexOf('בית') !== -1 || h.indexOf('סטטוס') !== -1;
    }
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var obj = {};
      headers.forEach(function (h, i) { if (keep_(h)) obj[h] = values[r][i]; });
      rows.push(obj);
    }
    return json_({ ok: true, rows: rows });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ---------- הרשאות: יצירת העמודות ושמירת ערכים (2026-08-07) ----------
 * ensurePermissionCols_ יוצר עמודת "הרשאות N" אחת לכל משבצת אימייל קיימת.
 * אידמפוטנטי — הרצה חוזרת לא מוסיפה כפילויות. */
function ensurePermissionCols_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var emails = 0, perms = 0;
  headers.forEach(function (h) {
    if (h.indexOf(PERM_HEADER) !== -1) perms++;
    else if (h.indexOf('אימייל') !== -1) emails++;
  });
  var need = Math.max(0, emails - perms);
  if (!need) return { ok: true, added: [] };
  var add = [];
  for (var i = 0; i < need; i++) add.push(PERM_HEADER + ' ' + (perms + i + 1));
  sh.getRange(1, lastCol + 1, 1, add.length).setValues([add]);
  sh.getRange(1, lastCol + 1, 1, add.length).setFontWeight('bold');
  return { ok: true, added: add };
}

/**
 * שמירת ההרשאות של אדם אחד: שורה + מספר משבצת האימייל (1-based).
 * מנהל על בלבד (נאכף ב-ACTION_PERMS). שתי הגנות נוספות כאן:
 *   • קודי הרשאה לא מוכרים נזרקים — אי אפשר להזריק ערך שרירותי לגיליון.
 *   • מנהל על אינו יכול להסיר את הרשאת-העל מעצמו, כדי שלא ייווצר מצב שאין
 *     בקהילה אף אחד שיכול לנהל הרשאות.
 */
function savePermissions_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var rowIndex = parseInt(body.rowIndex, 10);
  var slot = parseInt(body.slot, 10) || 1;
  if (!rowIndex || rowIndex < 2) return { ok: false, error: 'שורה לא תקינה' };

  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var permCols = [], emailCols = [];
  headers.forEach(function (h, i) {
    if (h.indexOf(PERM_HEADER) !== -1) permCols.push(i);
    else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
  });
  if (permCols.length < slot) {
    var created = ensurePermissionCols_(ss, {});
    if (!created.ok) return created;
    lastCol = sh.getLastColumn();
    headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    permCols = []; emailCols = [];
    headers.forEach(function (h, i) {
      if (h.indexOf(PERM_HEADER) !== -1) permCols.push(i);
      else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    });
  }
  if (permCols.length < slot) return { ok: false, error: 'אין עמודת הרשאות למשבצת ' + slot };

  var perms = parsePerms_(Array.isArray(body.perms) ? body.perms.join(',') : body.perms);

  // הגנה מפני נעילה עצמית: אי אפשר להוריד לעצמך את הרשאת מנהל-על
  var targetEmail = normalizeEmail_(sh.getRange(rowIndex, emailCols[slot - 1] + 1).getValue());
  if (body._email && targetEmail && targetEmail === normalizeEmail_(body._email) &&
      perms.indexOf(PERM_SUPER) === -1) {
    return { ok: false, error: 'אי אפשר להסיר לעצמך הרשאת מנהל על. בקש ממנהל על אחר.' };
  }

  sh.getRange(rowIndex, permCols[slot - 1] + 1).setValue(perms.join(', '));
  return { ok: true, perms: perms };
}

/* ---------- "משפחה עזבה, נכנסה משפחה חדשה" (2026-08-07) ----------
 * זו הפעולה הנכונה כשמשק בית מתחלף — ולא עריכה של השורה הקיימת. עריכה בפועל
 * הייתה מעבירה את כל ההיסטוריה הפיננסית של הדיירים הקודמים לחדשים, כי התנועות
 * מצביעות ל"מזהה קבוע" ולא לשם. כאן: השורה הישנה מסומנת "עזב" ושומרת את
 * ההיסטוריה שלה, ונפתחת שורה חדשה שתקבל מזהה חדש משלה.
 *
 * לעומת זאת מעבר בתוך השיכון (אותה משפחה, בית אחר) הוא **כן** עדכון של השורה
 * הקיימת — אותה ישות, רק מספר בית שונה — ולכן הוא נעשה דרך saveResidentRow_.
 */
/* ---------- יצירת משקי בית חדשים, אחד או חמישים (2026-08-07) ----------
 * משרת את גריד ההזנה במסך התושבים. עקרונות:
 *   • **יצירה בלבד.** הפעולה הזו אף פעם לא כותבת לתוך שורה קיימת חוץ ממקרה אחד
 *     מוצהר: סימון "עזב" לדיירים שהיו במספר הבית הזה, וגם זה רק אם הלקוח ביקש
 *     זאת במפורש עבור השורה הספציפית. כך אי אפשר לשכתב היסטוריה של משק בית קיים.
 *   • **מזהה קבוע** נוצר תמיד בשרת (assignResidentIds_), אף פעם לא מגיע מהלקוח.
 *   • **מייל ייחודי** — המייל הוא מפתח ההתחברות, ולכן שורה שמנסה להכניס מייל
 *     שכבר קיים אצל מישהו אחר נדחית ולא נוצרת.
 *   • הפעולה מדווחת בדיוק מה נוצר ומה נדחה, במקום להיכשל בשקט על 40 שורות.
 */
function createResidents_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ss.getSheetByName('תושבים');
    if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
    var rowsIn = body.rows;
    if (!Array.isArray(rowsIn) || !rowsIn.length) return { ok: false, error: 'לא נשלחו שורות' };
    if (rowsIn.length > 300) return { ok: false, error: 'יותר מדי שורות בבת אחת (מקסימום 300)' };

    var values = sh.getDataRange().getValues();
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var idxOf = {};
    headers.forEach(function (h, i) { if (h) idxOf[h] = i; });

    var statusCol = -1, familyCol = -1, houseCol = -1, idCol = -1, emailCols = [];
    headers.forEach(function (h, i) {
      if (h.indexOf('הרשאות') !== -1) return;              // לעולם לא נכתב מכאן
      if (h.indexOf('אימייל') !== -1) emailCols.push(i);
      else if (h.indexOf('סטטוס') !== -1) statusCol = i;
      else if (h.indexOf(RESIDENT_ID_HEADER) !== -1) idCol = i;
      else if (h.indexOf('משפחה') !== -1) familyCol = i;
      else if (h.indexOf('בית') !== -1) houseCol = i;
    });

    // כל המיילים התפוסים כרגע, לבדיקת ייחודיות
    var takenEmail = {};
    for (var r = 1; r < values.length; r++) {
      emailCols.forEach(function (ci) {
        var e = normalizeEmail_(values[r][ci]);
        if (e) takenEmail[e] = r + 1;
      });
    }

    var created = [], rejected = [], markLeft = {};
    var toAppend = [];

    rowsIn.forEach(function (item, n) {
      var f = (item && item.values) || {};
      var family = String(f[headers[familyCol]] || '').trim();
      if (familyCol > -1 && !family) {
        rejected.push({ i: n, error: 'שם משפחה חסר' }); return;
      }
      // מיילים: ייחודיות מול הגיליון ומול השורות האחרות באותה הדבקה
      var bad = null;
      emailCols.forEach(function (ci) {
        var e = normalizeEmail_(f[headers[ci]]);
        if (!e) return;
        if (takenEmail[e]) bad = 'המייל ' + e + ' כבר משויך לשורה ' + takenEmail[e];
        else takenEmail[e] = 'חדש';
      });
      if (bad) { rejected.push({ i: n, error: bad }); return; }

      var mark = parseInt(item && item.markLeftRowIndex, 10);
      if (mark && mark >= 2 && mark <= values.length) markLeft[mark] = true;

      var row = [];
      for (var c = 0; c < headers.length; c++) row.push('');
      headers.forEach(function (h, c) {
        if (!h || h.indexOf('הרשאות') !== -1 || c === idCol) return;   // מזהה והרשאות — לא מהלקוח
        if (f[h] !== undefined && f[h] !== null) row[c] = String(f[h]).trim();
      });
      if (statusCol > -1 && !row[statusCol]) row[statusCol] = 'פעיל';
      toAppend.push(row);
      created.push({ i: n, family: family });
    });

    if (!toAppend.length) return { ok: false, error: 'אף שורה לא עברה בדיקה', rejected: rejected };

    // 1. סימון היוצאים — רק שורות שהתבקשו במפורש
    var marked = [];
    if (statusCol > -1) {
      Object.keys(markLeft).forEach(function (k) {
        var rn = parseInt(k, 10);
        sh.getRange(rn, statusCol + 1).setValue('עזב');
        marked.push(rn);
      });
    }

    // 2. הוספת השורות החדשות בכתיבה אחת
    var first = sh.getLastRow() + 1;
    sh.getRange(first, 1, toAppend.length, headers.length).setValues(toAppend);

    // 3. מזהה קבוע חדש לכל שורה חדשה
    assignResidentIds_(ss);

    return { ok: true, created: created.length, rejected: rejected, marked: marked, firstRow: first };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function replaceFamily_(ss, body) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var oldRow = parseInt(body.rowIndex, 10);
  if (!oldRow || oldRow < 2) return { ok: false, error: 'שורה לא תקינה' };

  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var statusCol = -1, familyCol = -1, houseCol = -1, idCol = -1;
  headers.forEach(function (h, i) {
    if (h.indexOf('סטטוס') !== -1) statusCol = i;
    else if (h.indexOf(RESIDENT_ID_HEADER) !== -1) idCol = i;
    else if (h.indexOf('משפחה') !== -1) familyCol = i;
    else if (h.indexOf('בית') !== -1) houseCol = i;
  });

  // 1. סימון השורה הישנה כ"עזב" — ההיסטוריה שלה נשארת שלה
  if (statusCol > -1) sh.getRange(oldRow, statusCol + 1).setValue('עזב');

  // 2. שורה חדשה למשפחה הנכנסת
  var blank = [];
  for (var i = 0; i < headers.length; i++) blank.push('');
  if (familyCol > -1) blank[familyCol] = String(body.family || '').trim();
  if (houseCol > -1) blank[houseCol] = String(body.house || '').trim();
  if (statusCol > -1) blank[statusCol] = 'פעיל';
  sh.appendRow(blank);
  var newRow = sh.getLastRow();

  // 3. מזהה קבוע חדש — לעולם לא ממחזרים מזהה קיים
  assignResidentIds_(ss);
  var newId = idCol > -1 ? sh.getRange(newRow, idCol + 1).getValue() : '';
  return { ok: true, newRow: newRow, newId: newId, oldRow: oldRow };
}
