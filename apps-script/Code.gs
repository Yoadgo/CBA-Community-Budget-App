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
// מכון כושר (2026-08-18) — מידור חמישי, **נפרד לחלוטין ממידור המועדון**. מי
// שמנהל את המועדון לא נוגע במכון ולהפך, אלא אם ניתנו לו שניהם. אין שינוי מבנה
// בגיליון: עמודות "הרשאות N" כבר מקבלות רשימה מופרדת בפסיקים.
var PERM_GYM       = 'מכון';
// גינון (2026-09-07) — מידור שישי, לניהול מערכת הגינון ("מראה שיכון"). נפרד
// לחלוטין משאר המידורים. מי שמחזיק בו רואה את דיווחי התושבים, את המשימות ואת
// תוכנית העבודה — ותו לא. **הרשאת אישור אינה הרשאה נפרדת**: כל מי שיש לו
// PERM_GARDEN רשאי גם לאשר. יועד החליט (7.9.26) לא לבנות "מאשר משני" —
// אם המנהל אינו זמין, נותנים את ההרשאה הזו זמנית למישהו אחר.
var PERM_GARDEN    = 'גינון';
var ALL_PERMS = [PERM_SUPER, PERM_BUDGET, PERM_CLUB, PERM_RESIDENTS, PERM_GYM, PERM_GARDEN];
var PERM_HEADER = 'הרשאות';

/* משתמש חיצוני (2026-09-07) — עמודה "סוג משתמש" בטאב תושבים, ערך "חיצוני".
 * אביתר (קבלן הגינון) הוא שורה רגילה בטאב — כך ההתחברות עובדת — ומסומן כחיצוני.
 * למה עמודה ולא עוד קוד ב-ALL_PERMS: הרשאה *מוסיפה* יכולות וחיצוני *מוריד*.
 * בפרט, PERM_ANY_ADMIN שואלת "יש לו הרשאה כלשהי?" — וקוד הרשאה בשם "חיצוני"
 * היה עונה כן, ופותח לו את מדריך התושבים. ר' השורה ב-authorize_. */
var EXTERNAL_HEADER = 'סוג משתמש';
var EXTERNAL_VALUE  = 'חיצוני';
// דרישה מיוחדת: "כל הרשאת ניהול שהיא" — לפעולות שמשרתות כמה מידורים,
// כמו ספריית השמות להשלמה אוטומטית בטופס ההוצאה
var PERM_ANY_ADMIN = '*';

/* איזו הרשאה נדרשת לכל פעולה. פעולה שאינה מופיעה כאן מותרת לכל תושב מחובר ופעיל
 * (למשל הגשת קבלה או שריון מועדון — פעולות של סביבת התושב). */
var ACTION_PERMS = {
  // מראה שיכון — פעולות הצוות על משימה (סימון ביצוע, הערה, גרירה, חסימה).
  // בניגוד לפעולות התושב (submitGardenReport / gardenFeedback), שפתוחות לכל
  // תושב פעיל ולכן אינן ברשימה הזאת כלל, אלה שייכות לבעלי הרשאת גינון בלבד.
  gardenTask: PERM_GARDEN,
  gardenApproveBatch: PERM_GARDEN,
  gardenMerge: PERM_GARDEN,
  gardenCreateTask: PERM_GARDEN,
  // ניהול תקציב ותשלומים
  saveTransaction: PERM_BUDGET, deleteTransaction: PERM_BUDGET, saveBudget: PERM_BUDGET,
  setBudgetMeta: PERM_BUDGET, renameCategory: PERM_BUDGET, logBudgetUpdate: PERM_BUDGET,
  addYear: PERM_BUDGET, saveColumnValues: PERM_BUDGET, ensureColumns: PERM_BUDGET,
  saveColumnConfig: PERM_BUDGET, deleteReceiptFile: PERM_BUDGET,
  // פנקס הערות (סעיף 1) — נגיש רק מלשונית "הערות" במסך "בניית תקציב", לכן
  // אותה הרשאה כמו שאר פעולות התקציב
  saveNotes: PERM_BUDGET,
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
  savePermissions: PERM_SUPER, ensurePermissionCols: PERM_SUPER,
  // עץ ועד השיכון (2026-08-09) — קריאה פתוחה לכל תושב (לא ברשימה כאן בכלל,
  // ר' handleCommitteeTree_), אבל עריכה/שמירה של העץ עצמו מוגבלת למנהל-על
  // בלבד, בדיוק כמו הרשאות — זה שינוי מבני שמשפיע על כל התושבים שרואים אותו.
  saveCommitteeTree: PERM_SUPER,
  // קטגוריות עץ הוועד (2026-08-10) — אותו היגיון בדיוק: קריאה פתוחה לכולם,
  // הוספת/שינוי קטגוריה וצבע מוגבלים למנהל-על.
  saveCommitteeCategories: PERM_SUPER,
  // ניהול מיילים (שלב 1, 2026-08-18) — פתוח לכל מנהל (הרשאה כלשהי), הבדיקה
  // המדויקת של "תחום" השורה הספציפית נעשית בתוך saveEmailSetting_ עצמה.
  saveEmailSetting: PERM_ANY_ADMIN,
  // "שירותים לתושב" (2026-08-18) — אותו היגיון בדיוק כמו עץ הוועד: הקריאה
  // (action=services ב-doGet) פתוחה לכל תושב ולכן אינה מופיעה כאן; כל שינוי
  // בכרטיסי השירות, שליחת מייל העדכון לכל השיכון, וסריקת מסמך ב-Gemini —
  // מנהל-על בלבד.
  saveServices: PERM_SUPER,
  notifyServiceUpdate: PERM_SUPER,
  scanServiceDoc: PERM_SUPER,
  // מכון כושר (שלב 1, 2026-08-18) — קריאת רשימת המנויים לניהול. פעולות התושב
  // (הרשמה, דיווח תשלום, "המנוי שלי") לא יופיעו כאן גם בשלבים הבאים, כי הן
  // פתוחות לכל תושב מחובר ופעיל — בדיוק כמו שריון מועדון והגשת קבלה.
  // פעולות הכתיבה הניהוליות (אישור, אימות תשלום, הארכה) יצטרפו בשלבים 2-3.
  // "הפרטים שלי" (2026-08-28) — רק פעולות המנהל. saveMyProfile/submit/cancel
  // פתוחות לכל תושב מחובר ופעיל, כמו שריון מועדון והגשת קבלה: הן פועלות על
  // השורה של הקורא בלבד, שנגזרת מהמושב החתום ולא מפרמטר.
  approveProfileChange: PERM_RESIDENTS,
  rejectProfileChange: PERM_RESIDENTS,
  gymList: PERM_GYM,
  // שלב 2 (2026-08-19) — פעולות ניהול. יצירת מנוי ידנית ודרישת הצהרה במייל
  // הן פעולות של מנהל המכון, לא של מנהל-על: זו עבודה שוטפת ולא שינוי מבני.
  createGymMembership: PERM_GYM,
  requestGymDeclaration: PERM_GYM,
  // שלב 3 (2026-08-19) — כסף. אימות התשלום וקביעת התוקף הם תמיד ידניים
  // ובידי מנהל המכון; דיווח התשלום עצמו (reportGymPayment) וסריקת הצילום
  // (scanGymPayment) הם פעולות של התושב ולכן אינם ברשימה הזו.
  confirmGymPayment: PERM_GYM,
  rejectGymPayment: PERM_GYM,
  recordGymPayment: PERM_GYM,
  extendGymMembership: PERM_GYM,
  updateGymMembership: PERM_GYM,
  /* גינון (2026-09-07, שלב א') — כל פעולות הניהול. הפעולות של התושב עצמו
   * (submitGardenReport, myGardenReports, gardenFeedback) **אינן** ברשימה
   * בכוונה: הן פתוחות לכל תושב מחובר ופעיל, בדיוק כמו הגשת קבלה ושריון
   * מועדון, והן פועלות על השורה של הקורא בלבד לפי המושב החתום.
   * אין הפרדה בין "צוות גינון" ל"מנהל גינון" ברמת ההרשאה — ההבדל היחיד
   * הוא ש-approve/bulkApprove משנות שלב ל"הושלם", ור' ההערה ליד PERM_GARDEN. */
  gardenList: PERM_GARDEN,
  updateGardenTask: PERM_GARDEN,
  approveGardenTask: PERM_GARDEN,
  bulkApproveGardenTasks: PERM_GARDEN,
  mergeGardenReports: PERM_GARDEN,
  transferGardenTask: PERM_GARDEN,
  saveGardenSetting: PERM_GARDEN,
  saveGardenRoutine: PERM_GARDEN
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
 * בהתחברות, ומנפיקים מושב חתום ב-HMAC שתקף 14 יום. ההרשאות עצמן נקראות מהגיליון
 * בכל בקשה מחדש — כך ששלילת הרשאה נכנסת לתוקף מיד, בלי להמתין לפקיעת המושב. */
/* "דור" המושבים (2026-08-24). כל מושב נחתם עם הדור הנוכחי, וכל בקשה נבדקת
 * מולו. העלאת המספר ב-Script Properties = ניתוק מיידי של כל המושבים הקיימים,
 * בכל המכשירים — מתג החירום שהיה חסר עד היום (מושב גנוב היה תקף עד שיפוג).
 * מושב ישן שנחתם לפני השינוי הזה לא נושא שדה v, ולכן נחשב לדור 1 — כך
 * ההטמעה עצמה לא מנתקת אף אחד, אבל ההעלאה הראשונה כן תנתק את כולם. */
function sessionEpoch_() {
  return String(PropertiesService.getScriptProperties().getProperty('CBA_SESSION_EPOCH') || '1');
}

function makeSession_(email) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({
    e: String(email || '').toLowerCase(), v: sessionEpoch_(),
    x: Date.now() + 14 * 24 * 3600 * 1000
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
    if (String(obj.v || '1') !== sessionEpoch_()) return null;   // ר' sessionEpoch_
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
  if (!r.found) return { found: false, active: false, perms: [], isSuper: false, isExternal: false };
  var active = !(r.status && r.status.indexOf('פעיל') === -1);
  var perms = parsePerms_(r.permissions);
  // תאימות לאחור לעמודת "תפקיד" הישנה
  if (!perms.length && r.role && r.role.indexOf('מנהל') !== -1) perms = [PERM_SUPER];
  return {
    found: true, active: active, perms: perms,
    isSuper: perms.indexOf(PERM_SUPER) !== -1,
    isExternal: !!r.isExternal,
    familyId: r.familyId, family: r.family, house: r.house, firstName: r.firstName
  };
}

/**
 * שער ההרשאות המרכזי. מקבל את פרמטרי הבקשה ואת ההרשאה הנדרשת, ומחזיר
 * { ok:true, email, perm } או { ok:false, error }.
 *
 * מסלול אחד בלבד: מושב חתום. (2026-08-24) עד היום היה כאן מסלול שני —
 * "סיסמת מנהל" שנשמרה בטאב ההגדרות, וכל מי ששלח אותה קיבל ALL_PERMS
 * ו-isSuper מכל מקום בעולם, בלי חשבון גוגל ובלי להיות ברשימת התושבים.
 * הוא נועד להיות רשת חירום, אבל בפועל היה מפתח-על ששכב בגיליון: כל מי
 * שהייתה לו אי-פעם גישת צפייה לגיליון החזיק אותו. שום דבר באפליקציה לא
 * השתמש בו יותר (הלקוח עבר למושב חתום ב-2026-08-07), ולכן הוא הוסר.
 * רשת החירום האמיתית היא grantMeSuperAdmin/diagnosePermissions — שרצות
 * מעורך ה-Apps Script תחת חשבון הבעלים, ולכן אי אפשר לגנוב אותן.
 */
function authorize_(ss, p, need) {
  var sess = verifySession_(p && p.session);
  if (sess) {
    var perm = permissionsFor_(sess.email);
    if (!perm.found)  return { ok: false, error: 'המשתמש אינו ברשימת התושבים' };
    if (!perm.active) return { ok: false, error: 'המשתמש מסומן כלא פעיל' };
    /* משתמש חיצוני: הכול חסום חוץ מגינון. שורה אחת, ולכן גם פעולה שתיווסף
     * בעתיד חסומה לו מעצמה. רצה לפני בדיקת isSuper בכוונה. */
    if (perm.isExternal && need !== PERM_GARDEN) {
      return { ok: false, error: 'הפעולה אינה זמינה למשתמש חיצוני' };
    }
    if (!need || perm.isSuper ||
        (need === PERM_ANY_ADMIN ? perm.perms.length > 0 : perm.perms.indexOf(need) !== -1)) {
      return { ok: true, email: sess.email, perm: perm };
    }
    return { ok: false, error: 'אין לך הרשאה לפעולה הזו' };
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

/** מתג חירום — להרצה ידנית מהעורך. מנתק את כל המשתמשים בכל המכשירים; כל אחד
 *  פשוט יתבקש להתחבר שוב עם גוגל. לשימוש אם מכשיר אבד/נגנב או שמושב דלף. */
function revokeAllSessions() {
  var props = PropertiesService.getScriptProperties();
  var next = String((parseInt(props.getProperty('CBA_SESSION_EPOCH') || '1', 10) || 1) + 1);
  props.setProperty('CBA_SESSION_EPOCH', next);
  Logger.log('✓ כל המושבים נותקו. דור המושבים החדש: ' + next);
  return next;
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
/* פעולות כתיבה שעוברות דרך doGet ולא דרך doPost (שריון מועדון, בקשת הרשמה
   וכו') — גם הן חייבות להעלות את מונה השינויים, אחרת הלקוח לא ידע שיש חדש. */
var GET_WRITE_ACTIONS = ['submitSignup', 'reserveClub', 'cancelClubReservation',
  'approveClubReservation', 'approveClubReservations', 'rejectClubReservation', 'assignResidentIds'];

function doGet(e) {
  try {
    // "מה מספר הגרסה?" (2026-08-19) — התשובה הזולה ביותר בקובץ: קריאת ערך
    // בודד מ-Script Properties, בלי לפתוח את הגיליון בכלל. חייבת להיות
    // *ראשונה*, לפני כל שאר הבדיקות. אין כאן שום מידע רגיש — רק מספר.
    if (e && e.parameter && e.parameter.action === 'rev') {
      return json_({ ok: true, rev: currentRev_(), domains: currentDomains_() });
    }
    if (e && e.parameter && GET_WRITE_ACTIONS.indexOf(e.parameter.action) !== -1) bumpRev_(e.parameter.action);
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
    // ספריית קהילה ציבורית (2026-08-07): בית/משפחה/שם פרטי/טלפון/שמות ילדים —
    // בלי אימייל/הרשאות/מקצוע/הערות. בניגוד ל-residentDirectory (שם+בית בלבד,
    // מנהלים בלבד, לבורר בטפסי ניהול) — זו פתוחה לכל תושב מחובר ופעיל, לשימוש
    // טאב "שכנים" באזור התושב ומפת השיכון האינטראקטיבית.
    if (e && e.parameter && e.parameter.action === 'communityDirectory') {
      return handleCommunityDirectory_(e.parameter);
    }
    // עץ ועד השיכון (2026-08-09): "מסך "ועד השיכון" תחת קבוצת הניווט "השיכון"
    // באזור התושב. פתוח לקריאה לכל תושב מחובר ופעיל, בדיוק כמו communityDirectory
    // — עריכה בפועל (saveCommitteeTree) מוגבלת למנהל-על, ר' ACTION_PERMS.
    if (e && e.parameter && e.parameter.action === 'committeeTree') {
      return handleCommitteeTree_(e.parameter);
    }
    /* גינון — אזור התושב (2026-09-07). שלושתן פתוחות לכל תושב מחובר ופעיל
       (authorize_ עם need=null), ומחזירות אך ורק את הנתונים של הקורא עצמו.
       משתמש חיצוני נחסם מהן ממילא בשער שב-authorize_. */
    if (e && e.parameter && e.parameter.action === 'gardenMeta') {
      return handleGardenMeta_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'gardenStats') {
      return handleGardenStats_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'gardenTaskLog') {
      return handleGardenTaskLog_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'gardenPlan') {
      return handleGardenPlan_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'gardenTasks') {
      return handleGardenTasks_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'myGardenReports') {
      return handleMyGardenReports_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'gardenPhoto') {
      return handleGardenPhoto_(e.parameter);
    }
    // קטגוריות עץ הוועד (2026-08-10) — ר' handleCommitteeCategories_ למטה.
    if (e && e.parameter && e.parameter.action === 'committeeCategories') {
      return handleCommitteeCategories_(e.parameter);
    }
    // מסך "ניהול מיילים" (שלב 1, 2026-08-18) — קריאה בלבד ב-doGet, כמו clubList/
    // getResidents; הכתיבה (saveEmailSetting) עוברת ב-doPost הרגיל, ר' ACTION_PERMS.
    if (e && e.parameter && e.parameter.action === 'listEmailSettings') {
      return handleListEmailSettings_(e.parameter);
    }
    // "שירותים לתושב" (2026-08-18) — קריאה פתוחה לכל תושב מחובר ופעיל, בדיוק
    // כמו committeeTree. מחזירה את שני הטאבים (כרטיסים + סעיפים) בקריאה אחת.
    // הכתיבה (saveServices) עוברת ב-doPost ומוגבלת למנהל-על, ר' ACTION_PERMS.
    if (e && e.parameter && e.parameter.action === 'approveClubReservations') {
      return handleApproveClubReservations_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'myProfile') {
      return handleMyProfile_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'profileChanges') {
      return handleProfileChanges_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'tour') {
      return handleTour_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'services') {
      return handleServices_(e.parameter);
    }
    // מכון כושר (שלב 1, 2026-08-18) — קריאת מסך הניהול. מוגנת ב-PERM_GYM
    // (ר' ACTION_PERMS) ולא פתוחה לכל תושב, כי היא מחזירה גם מידע רפואי.
    if (e && e.parameter && e.parameter.action === 'gymList') {
      return handleGymList_(e.parameter);
    }
    // שלב 2 (2026-08-19) — שתי קריאות של **התושב** ולכן פתוחות לכל תושב מחובר
    // ופעיל (need=null בתוך ההנדלר), בדיוק כמו committeeTree/services:
    //   gymForm — תוכן האשף: שאלון, תקנון, מסלולים וכללי גיל. בלי קוד הכניסה.
    //   gymMy   — המנוי של המשתמש המחובר בלבד, לפי האימייל שבמושב החתום.
    if (e && e.parameter && e.parameter.action === 'gymForm') {
      return handleGymForm_(e.parameter);
    }
    if (e && e.parameter && e.parameter.action === 'gymMy') {
      return handleGymMy_(e.parameter);
    }
    /* קובץ קבלה דרך השרת (2026-08-24 — תיקון אבטחה, שלב 2).
     * עד היום כל קובץ קבלה שותף כ-"כל מי שיש לו הקישור", והדפדפן של המשתמש
     * משך אותו ישירות מ-Drive — כלומר הקישור לבדו הספיק, בלי שום בדיקה, וגם
     * מי שאינו תושב יכול היה לפתוח אותו. מעכשיו הקובץ נשאר פרטי, והשרת הוא
     * זה שמגיש אותו — רק אחרי בדיקת הרשאה. ר' handleReceiptFile_. */
    if (e && e.parameter && e.parameter.action === 'receipt') {
      return handleReceiptFile_(e.parameter);
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    /* שער הרשאות למטען הראשי (2026-08-23 — תיקון אבטחה).
     * עד היום המסלול הזה — הבקשה ל-/exec בלי פרמטר action — היה היחיד בקובץ
     * שלא עבר דרך authorize_ בכלל. מי שידע את הכתובת (והיא גלויה בקוד הפומבי)
     * קיבל את כל התקציב, ההכנסות וכל שורות התנועות, כולל שם הרוכש, הסכום
     * והקישור לקבלה — בלי חשבון גוגל ובלי להיות ברשימת התושבים.
     * זה שריד מהתקופה שלפני המושב החתום (2026-08-07): שאר המערכת עברה למושב,
     * המסלול הזה לא עבר איתה.
     * need=null — כמו handleCommunityDirectory_: מספיק מושב תקין + "פעיל"
     * בטאב תושבים, בלי צורך בהרשאת ניהול כלשהי. */
    var gate = authorize_(ss, e && e.parameter, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var years = [];
    ss.getSheets().forEach(function (sh) {
      var n = sh.getName();
      if (n.indexOf('תנועות ') === 0) years.push(n.substring('תנועות '.length));
    });
    var settings = readSettings_(ss);
    /* כל הגדרה ששמה מכיל "סיסמ" לא נשלחת ללקוח (2026-08-07) — רשת ביטחון
     * גורפת, כדי שסוד שיתווסף בעתיד לטאב ההגדרות לא ידלוף בטעות.
     * (2026-08-24) חריג מפורש אחד: קוד הרשת האלחוטית של המועדון. הוא לא סוד
     * מהתושבים — הוא נועד בדיוק להם — הוא רק לא צריך להיות כתוב בקוד הפומבי
     * ב-GitHub, שם הוא שכב עד היום. כל חריג עתידי חייב להיכנס לרשימה במפורש. */
    var SETTINGS_PUBLIC_ALLOW = ['סיסמת רשת המועדון'];
    var publicSettings = {};
    Object.keys(settings).forEach(function (k) {
      if (k.indexOf('סיסמ') === -1 || SETTINGS_PUBLIC_ALLOW.indexOf(k) !== -1) publicSettings[k] = settings[k];
    });

    /* ====================================================================
     *  צמצום נתונים לפי מי שמבקש  (2026-09-07 — DATA_MIN)
     * --------------------------------------------------------------------
     *  עד היום כל תושב פעיל קיבל כאן את *כל* התקציב, ההכנסות, ההערות ואת כל
     *  שורות התנועות של *כל* המשפחות — שם הרוכש, הסכום והקישור לקבלה — והלקוח
     *  שמר את הכול ב-localStorage שלו לצמיתות, עד יציאה ידנית.
     *
     *  נבדק בקוד (7.9.26) ולא הוערך: AREAS_ALL.resident.screens ב-app.js אינו
     *  כולל budget/expenses/planning, וחיפוש של categoryName/getCategories/
     *  getIncome/getGroups בכל קובצי מסכי התושב מחזיר אפס תוצאות. resident.js
     *  מסנן תמיד .filter(t => t.familyId === famId). כלומר: מכל המטען הזה
     *  תושב רגיל משתמש אך ורק בתנועות של משפחתו שלו.
     *
     *  מעכשיו: מי שאין לו הרשאת תקציב מקבל רק אותן. זה גם תיקון פרטיות וגם
     *  ההאצה הגדולה — 6 קריאות גיליון לכל שנה יורדות לאחת, ורוב המשתמשים הם
     *  תושבים רגילים.
     *
     *  ⚠️ מבנה התשובה נשאר זהה בדיוק (מערכים ריקים, לא שדות חסרים) כדי שאף
     *     גרסת לקוח לא תישבר, ובפרט שלא תיפול למסלול-התאימות הישן של groups
     *     ב-transform() (שם d.groups === undefined מפעיל fallback).
     *  ⚠️ כל השנים נשמרות עבור התנועות של המשפחה עצמה — כרטיס "צפוי לתשלום"
     *     בנוי על היסטוריה חוצת-שנים.
     *  ⚠️ ההרשאה נקראת מ-gate.perm, כלומר מהמושב החתום ומהגיליון — לעולם לא
     *     מפרמטר שהלקוח שלח.
     * ==================================================================== */
    var perm = gate.perm || {};
    var seesBudget = !!(perm.isSuper || (perm.perms || []).indexOf(PERM_BUDGET) !== -1);
    var myFamilyId = String(perm.familyId || '').trim();
    /* לתושב רגיל נשלחות רק ההגדרות שמסך באזור התושב באמת קורא. אומת: בכל
     * הלקוח יש 4 קריאות בלבד ל-CBA.mock._settings, ומהן רק "סיסמת רשת
     * המועדון" שייכת לאזור התושב. כך "בסיס תקציב <שנה>" — שהוא JSON של
     * התכנון המאושר לכל סעיף — מפסיק להגיע לתושב דרך ההגדרות. */
    var RESIDENT_SETTINGS_ALLOW = ['סיסמת רשת המועדון'];
    if (!seesBudget) {
      var slimSettings = {};
      RESIDENT_SETTINGS_ALLOW.forEach(function (k) {
        if (publicSettings[k] !== undefined) slimSettings[k] = publicSettings[k];
      });
      publicSettings = slimSettings;
    }

    var out = {
      // מספר הגרסה נשלח יחד עם המטען המלא, כדי שהלקוח יידע מול מה
      // להשוות בבדיקות ה-rev הזולות שאחריו (ר' bumpRev_ למעלה).
      rev: currentRev_(),
      /* המונים לפי תחום נשלחים גם עם המטען המלא (2026-09-08), כדי שהלקוח
         יידע מול מה להשוות בבדיקות הזולות שאחריו. בלי זה, אחרי משיכה מלאה
         אין לו נקודת ייחוס והוא היה מושך שוב בבדיקה הבאה. ר' bumpRev_. */
      domains: currentDomains_(),
      ok: true, version: 'v41-rev-domains', years: years,
      currentYear: settings['שנה נוכחית'] || years[0] || '',
      // תאימות לאחור בלבד (סעיף 3, 2026-08-09): קבוצות עברו להיות פר-שנה
      // (ר' data[y].groups למטה) — שדה זה נשאר כרשת ביטחון למקרה שגרסת
      // הלקוח החדשה מדברת עם השרת הישן; לא בשימוש יותר ע"י לקוח מעודכן.
      groups: seesBudget ? readColumn_(ss, 'קבוצות') : [],
      updates: seesBudget ? readTable_(ss, 'עדכוני תקציב') : [],   // יומן עדכוני תקציב (אם הטאב קיים)
      // פנקס הערות כלליות (סעיף 1, 2026-08-09) — טאב "הערות" (שורה אחת לכל
      // שנה) + טאב "יומן הערות" (כרונולוגי, מי ערך ומתי). שני הטאבים נוצרים
      // אוטומטית ע"י saveNotes_ בשמירה הראשונה, כמו "עדכוני תקציב".
      notes: seesBudget ? readNotesMap_(ss) : {},
      notesLog: seesBudget ? readTable_(ss, 'יומן הערות') : [],
      settings: publicSettings, data: {}
    };
    years.forEach(function (y) {
      var tx = readTable_(ss, 'תנועות ' + y);
      if (!seesBudget) {
        // בלי מזהה משפחה אין למי לשייך — מחזירים ריק, לא הכול. שגיאת נתונים
        // בטאב "תושבים" לא תהפוך כאן להדלפה של כל התנועות.
        tx = myFamilyId
          ? tx.filter(function (r) { return String(r['מזהה משפחה'] || '').trim() === myFamilyId; })
          : [];
        out.data[y] = { budget: [], income: [], transactions: tx, groups: [], splits: [], items: [] };
        return;
      }
      out.data[y] = {
        budget: readTable_(ss, 'תקציב ' + y),
        income: readTable_(ss, 'הכנסות ' + y),
        transactions: tx,
        // קבוצות פר-שנה (סעיף 3, 2026-08-09) — ר' readGroupsForYear_
        groups: readGroupsForYear_(ss, y),
        // פיצול סעיף בין כמה מקורות הכנסה (סעיף 4, 2026-08-10) — שורות שטוחות
        // מטאב "פיצול מימון <שנה>" (אם קיים); הלקוח מקבץ לפי שם סעיף בעצמו.
        splits: readTable_(ss, 'פיצול מימון ' + y),
        // פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10) — שורות שטוחות מטאב
        // "פירוט סעיפים <שנה>" (אם קיים); הלקוח מקבץ לפי שם סעיף בעצמו.
        items: readTable_(ss, 'פירוט סעיפים ' + y)
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
    // כל כתיבה מאושרת מעלה את מונה השינויים (2026-08-19, ר' bumpRev_).
    // אחרי השער בכוונה — בקשה שנדחתה לא שינתה כלום ואין סיבה שתגרום לכל
    // הלקוחות למשוך את הגיליון מחדש.
    bumpRev_(body.action);
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
      case 'saveNotes':         return json_(saveNotes_(ss, body));
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
      case 'saveCommitteeTree': return json_(saveCommitteeTree_(ss, body));
      case 'saveCommitteeCategories': return json_(saveCommitteeCategories_(ss, body));
      case 'approveSignup':     return json_(approveSignup_(ss, body));
      case 'rejectSignup':      return json_(rejectSignup_(ss, body));
      case 'saveResidentRow':   return json_(saveResidentRow_(ss, body));
      case 'ensureResidentCols':return json_(ensureResidentCols_(ss, body));
      case 'replaceFamily':     return json_(replaceFamily_(ss, body));
      case 'exportResidents':   return json_(exportResidents_(ss, body));
      case 'createResidents':   return json_(createResidents_(ss, body));
      case 'scanReceipt':       return json_(handleScanReceipt_(ss, body));
      case 'saveEmailSetting':  return json_(saveEmailSetting_(ss, body));
      case 'markTourSeen':      return json_(markTourSeen_(ss, body));
      case 'saveMyProfile':        return json_(saveMyProfile_(ss, body));
      case 'submitProfileChange':  return json_(submitProfileChange_(ss, body));
      case 'cancelProfileChange':  return json_(cancelProfileChange_(ss, body));
      case 'approveProfileChange': return json_(approveProfileChange_(ss, body));
      case 'rejectProfileChange':  return json_(rejectProfileChange_(ss, body));
      // גינון — אזור התושב (2026-09-07). אינן ב-ACTION_PERMS בכוונה: פתוחות
      // לכל תושב מחובר ופעיל, ופועלות רק על השורות שלו לפי המושב החתום.
      case 'submitGardenReport':  return json_(submitGardenReport_(ss, body));
      case 'gardenFeedback':      return json_(gardenFeedback_(ss, body));
      case 'gardenTask':          return json_(gardenTaskAction_(ss, body));
      case 'gardenApproveBatch':  return json_(gardenApproveBatch_(ss, body));
      case 'gardenMerge':         return json_(gardenMerge_(ss, body));
      case 'gardenCreateTask':    return json_(gardenCreateTask_(ss, body));
      case 'gardenPlanSave':      return json_(gardenPlanSave_(ss, body));
      case 'gardenPlanActive':    return json_(gardenPlanSetActive_(ss, body));
      case 'gardenPlanDelete':    return json_(gardenPlanDelete_(ss, body));
      case 'gardenCoverByPlan':   return json_(gardenCoverByPlan_(ss, body));
      case 'saveServices':      return json_(saveServices_(ss, body));
      case 'notifyServiceUpdate': return json_(notifyServiceUpdate_(ss, body));
      case 'scanServiceDoc':    return json_(handleScanServiceDoc_(ss, body));
      // מכון כושר, שלב 2 (2026-08-19)
      case 'submitGymApplication':  return json_(submitGymApplication_(ss, body));
      case 'createGymMembership':   return json_(createGymMembership_(ss, body));
      case 'requestGymDeclaration': return json_(requestGymDeclaration_(ss, body));
      case 'scanGymPayment':        return json_(scanGymPayment_(ss, body));
      case 'reportGymPayment':      return json_(reportGymPayment_(ss, body));
      case 'confirmGymPayment':     return json_(confirmGymPayment_(ss, body));
      case 'rejectGymPayment':      return json_(rejectGymPayment_(ss, body));
      case 'recordGymPayment':      return json_(recordGymPayment_(ss, body));
      case 'extendGymMembership':   return json_(extendGymMembership_(ss, body));
      case 'renewGymMembership':    return json_(renewGymMembership_(ss, body));
      case 'updateGymMembership':   return json_(updateGymMembership_(ss, body));
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
  // תת-סעיף (סעיף 5, 2026-08-10) — נוצר אוטומטית בפעם הראשונה שתנועה משויכת
  // לתת-סעיף, בדיוק כמו "מזהה משפחה" למטה (saveFamilyIds_).
  if (headers.indexOf('תת-סעיף') === -1) {
    sh.getRange(1, headers.length + 1).setValue('תת-סעיף');
    headers.push('תת-סעיף');
  }
  var rowObj = {
    'מזהה': t.id,
    'חודש הגשה': t.month || '',
    'תאריך רכישה': t.date || '',
    'רוכש': t.buyer || '',
    'ספק/נמען': t.supplier || '',
    'בנק': t.bankName || '',
    'סכום': Number(t.amount) || 0,
    'סעיף': t.categoryId || '',
    // תת-סעיף (סעיף 5, 2026-08-10) — קישור אופציונלי לפריט ספציפי בתוך הסעיף
    // (ר' 'פירוט סעיפים <שנה>'); ריק = לא שויך לתת-סעיף.
    'תת-סעיף': t.subItemId || '',
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
    moveReceiptToPermanentIfNeeded_(rowObj['קישור קבלה'], rowObj['חודש הגשה']);
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

    // מייל עדכון סטטוס לתושב (2026-08-09) — רק אם הסטטוס באמת השתנה, רק לבקשות
    // שמקורן בתושב (לא הוצאות שהמנהל מזין ידנית), ורק לשלושת הסטטוסים שיש טעם
    // לעדכן עליהם ("בבדיקה" זמני ולא רלוונטי לתושב).
    try {
      var statusColIdx = headers.indexOf('סטטוס');
      var oldStatus = statusColIdx > -1 ? String(existing[statusColIdx] || '') : '';
      var newStatus = String(rowObj['סטטוס'] || '');
      var STATUS_EMAIL_KEY_ = {};
      STATUS_EMAIL_KEY_[STATUS_HE.ready] = 'REIMBURSEMENT_READY';
      STATUS_EMAIL_KEY_[STATUS_HE.paid] = 'REIMBURSEMENT_PAID';
      STATUS_EMAIL_KEY_[STATUS_HE.rejected] = 'REIMBURSEMENT_REJECTED';
      if (oldStatus !== newStatus && rowObj['מקור'] === SOURCE_HE.resident && STATUS_EMAIL_KEY_[newStatus]) {
        var famEmails2 = emailsForFamilyId_(ss, rowObj['מזהה משפחה']);
        sendResidentTemplate_(ss, STATUS_EMAIL_KEY_[newStatus], famEmails2, {
          'שם': rowObj['רוכש'] || '', 'סכום': Math.round(Number(rowObj['סכום']) || 0),
          'מזהה': rowObj['מזהה'], 'הערה': rowObj['הערת בדיקה'] ? ('\nהערה: ' + rowObj['הערת בדיקה']) : ''
        });
      }
    } catch (mailErr) { Logger.log('מייל עדכון סטטוס נכשל: ' + mailErr); }
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
    // חותמת זמן הבקשה (2026-08-09) — משמשת לתזכורת "ממתין כבר X ימים" למנהל המועדון.
    ev.setTag('requestedAt', String(Date.now()));
    try {
      // תיקון (2026-08-18): ss לא היה מוגדר בפונקציה הזו בכלל — הקריאה הייתה
      // נכשלת בשקט (ReferenceError, נבלע ע"י ה-try/catch) ואף מייל לא נשלח.
      // זה קרוב לוודאי הגורם למה שיועד דיווח ("שריון מועדון לא שלח מייל").
      var ssForMail = SpreadsheetApp.getActiveSpreadsheet();
      notifyAdmins_(ssForMail, PERM_CLUB, 'ADMIN_NEW_CLUB', {
        'שם': p.family || p.email || 'תושב',
        'תאריך': Utilities.formatDate(startDt, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
        'שעה': p.start + '–' + p.end, 'קישור': CBA_APP_URL
      });
    } catch (mailErr) { Logger.log('מייל שריון חדש נכשל: ' + mailErr); }
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


/* רשימת כל השריונים הקרובים (ממתינים + מאושרים) — למסך הניהול אצל המנהל.
 * לא מסננת לפי משתמש (בניגוד ל-myClubReservations) ולכן דורשת הרשאת מועדון
 * (PERM_CLUB) דרך authorize_. (2026-08-24: מסלול "סיסמת מנהל" בוטל לגמרי.) */
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
    return json_(approveOneClubEvent_(ss, cal, p.id));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* דחיית שריון ממתין — מוחקת את האירוע (משחררת את המשבצת בחזרה לפנויה). אין כרגע
 * יומן/ארכיון נפרד לדחיות (בדומה לביטול תושב) — אפשר להוסיף בהמשך אם ירצה יועד. */
/* אישור שריון יחיד — הליבה המשותפת לאישור בודד ולאישור מרובה (2026-08-28).
   חולצה מ-handleApproveClubReservation_ ולא שוכפלה: שני המסלולים חייבים
   להתנהג זהה, כולל המייל לתושב. מחזירה אובייקט, לא json_. */
function approveOneClubEvent_(ss, cal, id) {
  var ev = cal.getEventById(id);
  if (!ev) return { ok: false, error: 'השריון לא נמצא — ייתכן שכבר בוטל' };
  ev.setTag('status', 'approved');
  ev.setTitle('שריון מועדון — ' + (ev.getTag('family') || 'תושב'));
  try {
    var tz1 = Session.getScriptTimeZone();
    var evEmail = ev.getTag('email');
    sendResidentTemplate_(ss, 'CLUB_APPROVED', evEmail ? [evEmail] : [], {
      'שם': ev.getTag('family') || 'תושב',
      'תאריך': Utilities.formatDate(ev.getStartTime(), tz1, 'dd/MM/yyyy'),
      'שעה': Utilities.formatDate(ev.getStartTime(), tz1, 'HH:mm') + '–' + Utilities.formatDate(ev.getEndTime(), tz1, 'HH:mm')
    });
  } catch (mailErr) { Logger.log('מייל אישור שריון נכשל: ' + mailErr); }
  return { ok: true };
}

/* אישור מרובה (2026-08-28) — מזהים מופרדים בפסיק. נעילה אחת וסבב אחד במקום
   N קריאות רשת. כישלון של שריון אחד לא עוצר את השאר: כל אחד מדווח בנפרד,
   והלקוח מציג בדיוק מה עבר ומה לא. */
function handleApproveClubReservations_(p) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return json_({ ok: false, error: 'תפוס — נסה שוב' }); }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_CLUB);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var ids = String(p.ids || '').split(',').map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    if (!ids.length) return json_({ ok: false, error: 'לא נבחרו שריונים' });
    if (ids.length > 40) return json_({ ok: false, error: 'יותר מדי שריונים בבת אחת' });
    var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
    if (!cal) return json_({ ok: false, error: 'לא נמצא יומן המועדון' });

    var okCount = 0, failed = [];
    ids.forEach(function (id) {
      var r = approveOneClubEvent_(ss, cal, id);
      if (r.ok) okCount++; else failed.push({ id: id, error: r.error });
    });
    return json_({ ok: true, approved: okCount, failed: failed });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

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
    // תופסים את פרטי השריון *לפני* המחיקה, כדי שיהיה מה לשים במייל הדחייה אחריה.
    var tz2 = Session.getScriptTimeZone();
    var rejFamily = ev.getTag('family') || 'תושב', rejEmail = ev.getTag('email') || '';
    var rejStartStr = Utilities.formatDate(ev.getStartTime(), tz2, 'dd/MM/yyyy');
    var rejTimeStr = Utilities.formatDate(ev.getStartTime(), tz2, 'HH:mm') + '–' + Utilities.formatDate(ev.getEndTime(), tz2, 'HH:mm');
    ev.deleteEvent();
    try {
      sendResidentTemplate_(ss, 'CLUB_REJECTED', rejEmail ? [rejEmail] : [], {
        'שם': rejFamily, 'תאריך': rejStartStr, 'שעה': rejTimeStr
      });
    } catch (mailErr) { Logger.log('מייל דחיית שריון נכשל: ' + mailErr); }
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
    /* (2026-08-24) הקובץ נשאר פרטי בכוונה. קודם היה כאן setSharing ל-
       ANYONE_WITH_LINK, מתוך כוונה טובה — שכמה מנהלים יוכלו לצפות. בפועל זה
       הפך כל קבלה לציבורית לכל מי שהקישור הגיע אליו. הצפייה באפליקציה עוברת
       מעכשיו דרך handleReceiptFile_, שבודק הרשאה ומגיש את הקובץ בעצמו. */

    // 2) מזהה חדש — מבוסס על המקסימום הקיים בטאב, מחושב בשרת (לא סומכים על הלקוח)
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    // עמודת "הוגש בתאריך" (2026-08-09) — תאריך+שעה מדויקים של ההגשה, בנפרד מ"תאריך
    // רכישה" (שהתושב מזין ידנית). נחוצה כדי לחשב "ממתין כבר X ימים" לתזכורת המנהל
    // היומית. נוצרת פעם אחת בסוף הטאב אם אינה קיימת עדיין — אידמפוטנטי.
    if (headers.indexOf(SUBMIT_DATE_HEADER) === -1) {
      sh.getRange(1, headers.length + 1).setValue(SUBMIT_DATE_HEADER).setFontWeight('bold');
      headers.push(SUBMIT_DATE_HEADER);
    }
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
      'מזהה משפחה': famId,
      SUBMIT_DATE_HEADER: new Date()
    };
    var newRow = headers.map(function (h) { return rowObj.hasOwnProperty(h) ? rowObj[h] : ''; });
    sh.appendRow(newRow);

    // מיילים אוטומטיים (2026-08-09): אישור קבלה לתושב + התראה למנהלי-תקציב
    try {
      var buyerName = body.buyer || (residentInfo && residentInfo.firstName) || '';
      var famEmails = emailsForFamilyId_(ss, famId);
      var toEmails = famEmails.length ? famEmails : (body.email ? [body.email] : []);
      var amountRounded = Math.round(Number(body.amount) || 0);
      sendResidentTemplate_(ss, 'REIMBURSEMENT_RECEIVED', toEmails, { 'שם': buyerName, 'סכום': amountRounded, 'מזהה': newId });
      notifyAdmins_(ss, PERM_BUDGET, 'ADMIN_NEW_REIMBURSEMENT', {
        'שם': buyerName, 'סכום': amountRounded, 'מזהה': newId, 'קישור': CBA_APP_URL
      });
    } catch (mailErr) { Logger.log('מייל בקשת החזר חדשה נכשל: ' + mailErr); }

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

function normalizeMonthKey_(value) {
  // "חודש הגשה" עלול להישמר בגליון כמחרוזת yyyy-MM וגם (אם Sheets זיהתה אותו כתאריך
  // בעריכה ידנית) כאובייקט Date אמיתי — מטפלים בשני המקרים ומחזירים תמיד yyyy-MM או ''.
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  var s = value ? String(value) : '';
  return (s.length === 7 && s.charAt(4) === '-') ? s : '';
}

function getReceiptsFolder_(monthKey) {
  var root = DriveApp.getFolderById(ROOT_RECEIPTS_FOLDER_ID); // "שיכון"
  var yearName, monthName;
  // monthKey הוא "חודש הגשה" של השורה (ר' submissionMonthForToday_) — הוא הקובע לאיזו
  // תיקיית שנה/חודש הקבלה שייכת, ולא תאריך היום שבו נשמרה/אושרה השורה.
  // (באג שתוקן ב-2026-08-10: קודם השתמשנו תמיד בתאריך היום, מה שהעביר קבלות ישנות
  // לתיקיית החודש הנוכחי בכל פעם שהתנועה שלהן נשמרה מחדש — למשל תוך כדי בדיקה/אישור
  // של המנהל. ר' תיקון ותחקור מלא ב-2026-08-10.)
  var mk = normalizeMonthKey_(monthKey);
  if (mk) {
    var parts = mk.split('-');
    yearName = parts[0];
    monthName = String(Number(parts[1])); // בלי אפס מוביל — כמו התיקיות הקיימות
  } else {
    // רשת ביטחון בלבד — לא אמור לקרות בפועל בזרימה תקינה, כי כל קריאה מעבירה monthKey.
    var now = new Date(), tz = Session.getScriptTimeZone();
    yearName = Utilities.formatDate(now, tz, 'yyyy');
    monthName = Utilities.formatDate(now, tz, 'M');
    Logger.log('getReceiptsFolder_: monthKey חסר/לא תקין ("' + monthKey + '") — נופל חזרה לתאריך היום');
  }
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

/* ============================================================================
 *  הגשת קובץ קבלה דרך השרת (2026-08-24 — תיקון אבטחה, שלב 2)
 * ----------------------------------------------------------------------------
 *  למה זה קיים: עד היום הקבצים היו משותפים ל"כל מי שיש לו הקישור", והדפדפן
 *  משך אותם ישירות מ-Drive. זה היה הכרחי כי לתושב אין גישה לתיקיית הגזבר —
 *  אבל המחיר היה שהקישור לבדו פתח את הקבלה, לכל אחד בעולם.
 *
 *  מי רשאי לראות קבלה (החלטת יועד, 24.8.26):
 *    1. מנהל תקציב ומעלה (PERM_BUDGET, ומנהל-על ממילא עובר הכול ב-authorize_).
 *    2. מי שהגיש אותה — לפי "מזהה משפחה" שבשורת התנועה, מול המשפחה של
 *       המשתמש המחובר. ההצלבה היא מול *הקובץ* ולא מול מספר שורה שהלקוח שולח,
 *       כדי שאי אפשר יהיה לבקש קובץ של מישהו אחר בעזרת שורה שלי.
 * ========================================================================== */

/** מעל הגודל הזה לא מגישים את הקובץ אלא מחזירים tooLarge והלקוח מציע חלופה.
 *  תמונות מכווצות בצד הלקוח ל-1600px/JPEG-75 (בערך 200-500KB), אז זה נוגע
 *  בפועל רק ל-PDF גדולים שהועלו כמו שהם. */
var RECEIPT_MAX_BYTES = 8 * 1024 * 1024;

/** האם קובץ הקבלה הזה שייך לשורת תנועה של המשפחה הנתונה. */
function receiptBelongsToFamily_(ss, fileId, familyId) {
  var fam = String(familyId || '').trim();
  if (!fam || !fileId) return false;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name.indexOf('תנועות ') !== 0) continue;
    var sh = sheets[i];
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2 || lastCol < 1) continue;
    var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0].map(function (h) { return String(h).trim(); });
    var urlCol = headers.indexOf('קישור קבלה');
    var famCol = headers.indexOf('מזהה משפחה');
    if (urlCol === -1 || famCol === -1) continue;
    for (var r = 1; r < values.length; r++) {
      if (extractDriveFileId_(values[r][urlCol]) !== fileId) continue;
      // נמצאה השורה שאליה הקובץ מקושר — היא, ורק היא, קובעת למי הוא שייך.
      return String(values[r][famCol] || '').trim() === fam;
    }
  }
  return false;
}

function handleReceiptFile_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);   // חייב מושב תקין + תושב פעיל
    if (!gate.ok) return json_({ ok: false, error: gate.error });

    var id = String((p && p.id) || '').trim();
    if (!/^[a-zA-Z0-9_-]{10,}$/.test(id)) return json_({ ok: false, error: 'מזהה קובץ לא תקין' });

    var perm = gate.perm || {};
    var allowed = !!perm.isSuper || (perm.perms || []).indexOf(PERM_BUDGET) !== -1;
    if (!allowed) allowed = receiptBelongsToFamily_(ss, id, perm.familyId);
    if (!allowed) return json_({ ok: false, error: 'אין לך הרשאה לצפות בקבלה הזו' });

    var file;
    try { file = DriveApp.getFileById(id); }
    catch (err) { return json_({ ok: false, error: 'הקובץ לא נמצא ב-Drive' }); }

    var size = 0;
    try { size = file.getSize(); } catch (err) { size = 0; }
    if (size > RECEIPT_MAX_BYTES) {
      return json_({ ok: false, tooLarge: true, size: size,
        error: 'הקובץ גדול מכדי להציג אותו כאן (' + (Math.round(size / 104857.6) / 10) + 'MB)' });
    }

    var blob = file.getBlob();
    return json_({
      ok: true,
      name: file.getName(),
      size: size,
      mimeType: blob.getContentType() || 'application/octet-stream',
      dataBase64: Utilities.base64Encode(blob.getBytes())
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ----------------------------------------------------------------------------
 *  תחזוקה חד-פעמית: הסרת שיתוף מקבצים שהועלו לפני התיקון.
 *  ⚠️ רצה מעורך ה-Apps Script בלבד (כפתור Run על revokeReceiptSharing), בדיוק
 *  כמו grantMeSuperAdmin — לא חשופה לאינטרנט ולא עוברת ב-doPost. פעולה גורפת
 *  על Drive לא צריכה להיות זמינה כבקשת רשת בכלל.
 *  אידמפוטנטי — אפשר להריץ שוב ושוב. עובד במנות (limit) כדי לא להיתקל
 *  במגבלת 6 הדקות של Apps Script; מחזיר done=false כשנשאר עוד, ואז פשוט
 *  מריצים שוב. קובץ שכבר פרטי לא נספר כ"שונה".
 * -------------------------------------------------------------------------- */
function revokeReceiptSharing_(limit) {
  limit = Math.max(1, Math.min(Number(limit || 300), 400));
  var scanned = 0, changed = 0, failed = 0, done = true;

  function walk(folder) {
    if (!done) return;
    var files = folder.getFiles();
    while (files.hasNext()) {
      if (scanned >= limit) { done = false; return; }
      var f = files.next();
      scanned++;
      try {
        if (f.getSharingAccess() === DriveApp.Access.PRIVATE) continue;
        f.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
        changed++;
      } catch (e) { failed++; }
    }
    var subs = folder.getFolders();
    while (subs.hasNext()) {
      if (scanned >= limit) { done = false; return; }
      walk(subs.next());
      if (!done) return;
    }
  }

  try {
    walk(DriveApp.getFolderById(ROOT_RECEIPTS_FOLDER_ID));
  } catch (err) {
    return { ok: false, error: 'לא הצלחנו לפתוח את תיקיית הקבלות: ' + String(err) };
  }
  return { ok: true, scanned: scanned, changed: changed, failed: failed, done: done };
}

/** להרצה ידנית מהעורך (כפתור Run). מריצה מנה אחת ומדפיסה סיכום ל-Execution log.
 *  אם done=false — פשוט להריץ שוב, עד ש-done=true. אידמפוטנטי לחלוטין. */
function revokeReceiptSharing() {
  var r = revokeReceiptSharing_(300);
  Logger.log('נסרקו: ' + r.scanned + ' | שונו לפרטי: ' + r.changed +
             ' | נכשלו: ' + r.failed + ' | הסתיים: ' + (r.done ? 'כן' : 'לא — להריץ שוב'));
  return r;
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
function moveReceiptToPermanentIfNeeded_(url, monthKey) {
  var id = extractDriveFileId_(url);
  if (!id) return;
  try {
    var file = DriveApp.getFileById(id);
    file.moveTo(getReceiptsFolder_(monthKey));
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
    var monthCol = headers.indexOf('חודש הגשה');
    var urlCol = headers.indexOf('קישור קבלה');
    var nameCol = headers.indexOf('שם קובץ קבלה');
    if (idCol === -1 || urlCol === -1 || nameCol === -1) return { ok: false, error: 'מבנה טאב לא תקין' };

    var n = Math.max(sh.getLastRow() - 1, 0);
    var ids = n ? sh.getRange(2, 1, n, 1).getValues() : [];
    var row = -1;
    for (var i = 0; i < ids.length; i++) { if (String(ids[i][0]) === String(body.id)) { row = i + 2; break; } }
    if (row === -1) return { ok: false, error: 'התנועה לא נמצאה — שמור אותה קודם' };

    var status = statusCol !== -1 ? String(sh.getRange(row, statusCol + 1).getValue()) : '';
    var monthKey = monthCol !== -1 ? sh.getRange(row, monthCol + 1).getValue() : '';
    var approved = (status === STATUS_HE.ready || status === STATUS_HE.paid);
    var folder = approved ? getReceiptsFolder_(monthKey) : getPendingReceiptsFolder_();

    var blob = Utilities.newBlob(
      Utilities.base64Decode(body.dataBase64),
      body.mimeType || 'image/jpeg',
      body.fileName || 'receipt'
    );
    var file = folder.createFile(blob);
    /* (2026-08-24) הקובץ נשאר פרטי בכוונה. קודם היה כאן setSharing ל-
       ANYONE_WITH_LINK, מתוך כוונה טובה — שכמה מנהלים יוכלו לצפות. בפועל זה
       הפך כל קבלה לציבורית לכל מי שהקישור הגיע אליו. הצפייה באפליקציה עוברת
       מעכשיו דרך handleReceiptFile_, שבודק הרשאה ומגיש את הקובץ בעצמו. */
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
    if (body.groups) out.groups = saveGroups_(ss, year, body.groups);  // קבוצות פר-שנה (סעיף 3)
    // פיצול סעיף בין כמה מקורות הכנסה (סעיף 4, 2026-08-10) — נכתב תמיד (גם
    // רשימה ריקה) כדי שסעיפים שבוטל הפיצול שלהם יימחקו מהטאב.
    out.splits = saveBudgetSplits_(ss, year, body.categories || []);
    // פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10) — נכתב תמיד (גם רשימה ריקה)
    // כדי שסעיפים שבוטל הפירוט שלהם יימחקו מהטאב.
    out.items = saveBudgetItems_(ss, year, body.categories || []);
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

/* פנקס הערות כלליות (סעיף 1, 2026-08-09) — טאב "הערות": שורה אחת לכל שנה
 * (שנה | תוכן HTML | נערך ע"י | בתאריך), מתעדכנת במקום (upsert) בכל שמירה —
 * לא נספח כמו יומן. + טאב "יומן הערות" נפרד (תאריך | שעה | שנה | נערך ע"י),
 * כן נספח בכל שמירה, לתצוגת "מי ערך ומתי" (כמו "עדכוני תקציב"). שני הטאבים
 * נוצרים אוטומטית בפעם הראשונה, אותו דפוס בדיוק כמו logBudgetUpdate_ למעלה.
 * אין בדיקת התנגשות בין שני עורכים בו-זמנית — מי ששומר אחרון מנצח, בדיוק
 * כמו כל שמירה אחרת באפליקציה (ר' ההסבר ב-planning.js/notes.js). */
function saveNotes_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var year = String(body.year || '').trim();
    if (!year) return { ok: false, error: 'שנה חסרה' };
    var editedBy = body.editedBy || '';
    var now = new Date();
    var stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');

    var sh = ss.getSheetByName('הערות');
    if (!sh) {
      sh = ss.insertSheet('הערות');
      sh.appendRow(['שנה', 'תוכן', 'נערך ע"י', 'בתאריך']);
      sh.setFrozenRows(1);
    }
    var v = sh.getDataRange().getValues();
    var row = -1;
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][0]).trim() === year) { row = r + 1; break; }
    }
    if (row === -1) {
      sh.appendRow([year, body.content || '', editedBy, stamp]);
    } else {
      sh.getRange(row, 2, 1, 3).setValues([[body.content || '', editedBy, stamp]]);
    }

    var logSh = ss.getSheetByName('יומן הערות');
    if (!logSh) {
      logSh = ss.insertSheet('יומן הערות');
      logSh.appendRow(['תאריך', 'שעה', 'שנה', 'נערך ע"י']);
      logSh.setFrozenRows(1);
    }
    logSh.appendRow([
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'HH:mm'),
      year, editedBy
    ]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* קבוצות פר-שנה (סעיף 3, 2026-08-09) — עד עכשיו טאב "קבוצות" יחיד היה משותף
 * לכל השנים, בכוונה. יועד ביקש לשנות: מכאן ואילך לכל שנה יש טאב עצמאי משלה
 * "קבוצות <שנה>", בדיוק כמו "תקציב <שנה>"/"הכנסות <שנה>". מעבר בטוח, לא
 * הרסני: הטאב הישן "קבוצות" נשאר בדיוק כמו שהיה — לא נכתב אליו יותר, ולא
 * נמחק — הוא משמש רק כגיבוי/נפילה-אחורה עבור שנה שעדיין לא נשמרה מאז המעבר. */

// קורא את קבוצות השנה: אם יש לה כבר טאב עצמאי "קבוצות <שנה>" — קורא ממנו
// (גם אם הוא ריק, כי זה מצב לגיטימי אחרי שהמנהל הסיר את כל הקבוצות בכוונה).
// אם אין עדיין טאב כזה (השנה טרם נשמרה מאז המעבר) — נופל בחזרה לטאב "קבוצות"
// המשותף הישן, כדי ששנים קיימות ימשיכו להיראות בדיוק כמו שנראו עד היום.
function readGroupsForYear_(ss, year) {
  var name = 'קבוצות ' + year;
  if (ss.getSheetByName(name)) return readColumn_(ss, name);
  return readColumn_(ss, 'קבוצות');
}

// כותב את רשימת הקבוצות לטאב הפר-שנתי "קבוצות <שנה>" (עמודה A, מתחת לכותרת),
// יוצר אותו אוטומטית בפעם הראשונה שהשנה הזו נשמרת (אותו דפוס בדיוק כמו
// logBudgetUpdate_/saveNotes_ למעלה). לא נוגע בטאב "קבוצות" המשותף הישן.
function saveGroups_(ss, year, groups) {
  var name = 'קבוצות ' + year;
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['קבוצה']);
    sh.setFrozenRows(1);
  }
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 1).clearContent();   // מנקים רק עמודה A
  if (groups.length) {
    var grid = groups.map(function (g) { return [g]; });
    sh.getRange(2, 1, groups.length, 1).setValues(grid);
  }
  return 'ok';
}

/* פיצול סעיף תקציבי בין כמה מקורות הכנסה בסכומים שונים (סעיף 4, 2026-08-10).
 * טאב פר-שנה "פיצול מימון <שנה>", שורה אחת לכל (סעיף, מקור הכנסה) — רק
 * לסעיפים שבאמת מפוצלים (2+ מקורות); סעיף עם מקור יחיד ממשיך להסתמך על
 * עמודת "מקור מימון" הרגילה בטאב התקציב, בלי שורה כאן בכלל. נכתב מחדש
 * במלואו בכל שמירה (כמו saveCommitteeTree_ למעלה) — טבלה קטנה, אין צורך
 * ב-reconcile לפי שורות קיימות. */
function saveBudgetSplits_(ss, year, cats) {
  var name = 'פיצול מימון ' + year;
  var rows = [];
  (cats || []).forEach(function (c) {
    if (c.sources && c.sources.length > 1) {
      c.sources.forEach(function (s) {
        rows.push([c.name || c.key || '', s.name || '', Number(s.amount) || 0]);
      });
    }
  });
  var sh = ss.getSheetByName(name);
  if (!sh) {
    if (!rows.length) return 'ok';   // אין מה לכתוב — לא יוצרים טאב ריק בלי צורך
    sh = ss.insertSheet(name);
    sh.appendRow(['סעיף', 'מקור הכנסה', 'סכום']);
    sh.setFrozenRows(1);
  }
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, 3).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, 3).setValues(rows);
  return 'ok';
}

/* פירוט סעיף תקציבי לתת-סעיפים בעלי שם וסכום (סעיף 5, 2026-08-10) — למשל
 * "ועדת תרבות" ₪20,000 מפורט ל"אירוע עצמאות" ₪10,000 + "אירוע פורים" ₪10,000.
 * טאב פר-שנה "פירוט סעיפים <שנה>", שורה אחת לכל (סעיף, פריט). בשונה מפיצול
 * מימון (סעיף 4) — כאן גם סעיף עם פריט יחיד תקף (אין "ברירת מחדל" חלופית
 * שאליה חוזרים כמו incomeSourceId; פריט אחד כבר אומר "יש כאן פירוט"), אז
 * כותבים כל סעיף עם 1+ פריטים, לא רק 2+. תת-סעיפים אלה משמשים גם את מסך
 * ניהול ההוצאות לשיוך תנועה בפועל לתת-סעיף ספציפי (ר' 'תת-סעיף' ב-saveTransaction_).
 * נכתב מחדש במלואו בכל שמירה, כמו saveBudgetSplits_ למעלה. */
// עמודות "מצב חלוקה" + 12 חודשי MONTH_KEYS לכל תת-סעיף (סעיף 7ג, 2026-08-10) —
// נוספות אחרי 3 העמודות המקוריות (סעיף/פריט/תכנון), כדי שהחלוקה החודשית
// הפר-פריטית תשרוד רענון מהגיליון (בלי זה, כל פריט היה מתאפס ל"שווה·12" בכל
// טעינה, גם אם הסכום הכולל של הסעיף היה נשמר נכון בזכות הסכימה ב-saveBudgetToSheet).
var ITEM_DIST_HEADERS_ = ['מצב חלוקה'].concat(MONTH_KEYS);
function saveBudgetItems_(ss, year, cats) {
  var name = 'פירוט סעיפים ' + year;
  var headers = ['סעיף', 'פריט', 'תכנון'].concat(ITEM_DIST_HEADERS_);
  var totalCols = headers.length;
  var rows = [];
  (cats || []).forEach(function (c) {
    if (c.items && c.items.length) {
      c.items.forEach(function (it) {
        var row = [c.name || c.key || '', it.name || '', Number(it.plan) || 0,
                    DIST_HE[it.distMode] || it.distMode || 'שווה'];
        for (var m = 0; m < MONTH_KEYS.length; m++) row.push(Number((it.monthly || [])[m]) || 0);
        rows.push(row);
      });
    }
  });
  var sh = ss.getSheetByName(name);
  if (!sh) {
    if (!rows.length) return 'ok';   // אין מה לכתוב — לא יוצרים טאב ריק בלי צורך
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  } else {
    // ריפוי-עצמי: טאבים שנוצרו לפני סעיף 7ג יש להם רק 3 עמודות (סעיף/פריט/
    // תכנון) — מוסיפים את עמודות החלוקה החודשית אם עוד אינן קיימות, בלי
    // לגעת בעמודות 1-3 הקיימות (בדיקה לפי הכותרת בעמודה 4 בלבד).
    var col4 = sh.getLastColumn() >= 4 ? String(sh.getRange(1, 4).getValue()).trim() : '';
    if (col4 !== 'מצב חלוקה') sh.getRange(1, 4, 1, ITEM_DIST_HEADERS_.length).setValues([ITEM_DIST_HEADERS_]);
  }
  var last = sh.getLastRow();
  if (last >= 2) sh.getRange(2, 1, last - 1, totalCols).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, totalCols).setValues(rows);
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
  // 'קבוצות ' נוספה בסעיף 3 (2026-08-09, קבוצות פר-שנה) — אם לשנת המקור עדיין
  // אין טאב קבוצות עצמאי משלה (עוד לא נשמרה מאז המעבר), פשוט לא מעתיקים כלום
  // כאן, ושתי השנים ימשיכו ליפול בחזרה לטאב "קבוצות" המשותף הישן (ר' readGroupsForYear_)
  // 'פיצול מימון ' נוספה בסעיף 4 (2026-08-10) — אם לשנת המקור אין טאב פיצול
  // (אין סעיפים מפוצלים בה), פשוט אין מה להעתיק, וזה תקין לגמרי.
  // 'פירוט סעיפים ' נוספה בסעיף 5 (2026-08-10) — אותו היגיון: אם אין פירוט
  // בשנת המקור, אין מה להעתיק.
  ['תקציב ', 'הכנסות ', 'תנועות ', 'קבוצות ', 'פיצול מימון ', 'פירוט סעיפים '].forEach(function (prefix) {
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

// קורא את טאב "הערות" (סעיף 1) למפה {שנה: {content, editedBy, editedAt}}.
// שונה מ-readTable_ (שמחזיר מערך שורות) כי כאן צריך גישה ישירה לפי שנה.
function readNotesMap_(ss) {
  var sh = ss.getSheetByName('הערות');
  var map = {};
  if (!sh) return map;
  var v = sh.getDataRange().getValues();
  if (v.length < 2) return map;
  var headers = v[0].map(function (h) { return String(h).trim(); });
  var iYear = headers.indexOf('שנה'), iContent = headers.indexOf('תוכן'),
      iBy = headers.indexOf('נערך ע"י'), iAt = headers.indexOf('בתאריך');
  if (iYear === -1) return map;
  for (var r = 1; r < v.length; r++) {
    var year = String(v[r][iYear] || '').trim();
    if (!year) continue;
    map[year] = {
      content: iContent === -1 ? '' : String(v[r][iContent] || ''),
      editedBy: iBy === -1 ? '' : String(v[r][iBy] || ''),
      editedAt: iAt === -1 ? '' : String(v[r][iAt] || '')
    };
  }
  return map;
}

/* ============================================================================
 *  מונה שינויים — "האם בכלל השתנה משהו?" (2026-08-19, ממצא 2.3 בדו"ח הבדיקה)
 * ----------------------------------------------------------------------------
 *  נמדד באפליקציה: 10 בקשות GET מלאות ב-31 שניות, כל אחת מושכת את *כל* הגיליון
 *  (כל השנים, כל הסעיפים, כל התנועות) — כ-1,160 הרצות של Apps Script בכל שעת
 *  שימוש פעילה, כשברוב המוחלט של הפעמים שום דבר לא השתנה. זה מבזבז מכסת זמן
 *  ריצה יומית וגם כבד על חבילת גלישה בטלפון.
 *
 *  הפתרון: מספר סידורי אחד ב-Script Properties שעולה ב-1 בכל כתיבה. הלקוח
 *  שואל "מה המספר?" (קריאה של ערך בודד — זולה בסדר גודל מקריאת הגיליון),
 *  ורק אם הוא השתנה הוא מושך את המטען המלא.
 *
 *  מגבלה מודעת: שינוי שנעשה *ישירות בגיליון* (מישהו עורך תא ביד) לא מעלה את
 *  המונה. לכן הלקוח מבצע בכל מקרה משיכה מלאה אחת לדקה — ר' FULL_EVERY_MS
 *  ב-sheets.js. כלומר עריכה ידנית מופיעה תוך דקה לכל היותר, ובתמורה נחסכות
 *  ~95% מהמשיכות המלאות.
 * ========================================================================== */
var REV_KEY = 'cba_data_rev';

/* ============================================================================
 *  מונה שינויים לכל תחום (2026-09-08 — צעד א' של ייעול הרענון)
 * ----------------------------------------------------------------------------
 *  עד היום היה מונה אחד גלובלי: כל כתיבה, בכל נושא, גרמה לכל לקוח פתוח
 *  למשוך מחדש את *כל* המטען — ומשיכה מלאה נמדדה ב-2 עד 10 שניות. כלומר
 *  תושב ששלח דיווח גינון גרם לדפדפן של כל מנהל להוריד מחדש את כל התקציב.
 *
 *  מעכשיו כל פעולה משויכת לתחום ולכל תחום מונה משלו. הלקוח שואל שאלה זולה
 *  אחת ומקבל את כל המונים, ומושך מחדש רק תחום שהמסך שפתוח לפניו באמת צריך.
 *
 *  ⚠️ תוסף בלבד: cba_data_rev ממשיך לעלות בדיוק כמו קודם, ולכן לקוח בגרסה
 *     ישנה מתנהג בדיוק כמו היום. אפשר לפרוס את זה לבד, בלי שאף אחד ירגיש.
 *  ⚠️ כל המונים יושבים ב-**מאפיין אחד** כ-JSON, ולא במאפיין לכל תחום, כדי
 *     שהבדיקה הזולה תישאר קריאה אחת. זו כל הנקודה שלה — לתת לכל תחום
 *     טיימר/מאפיין משלו רק היה מגדיל את מספר הפניות.
 *  ⚠️ פעולה שאינה ברשימה נופלת ל-'other' ומעלה רק את המונה הגלובלי, כלומר
 *     בדיוק ההתנהגות של היום. שכחה לרשום פעולה חדשה כאן היא "בזבזנית",
 *     לא שוברת.
 * ========================================================================== */
var REV_DOMAINS_KEY = 'cba_rev_domains';
var ACTION_DOMAIN = {
  // תקציב — כל מה שמשנה את המטען הראשי (CBA.mock.years) אצל הלקוח
  saveTransaction: 'budget', deleteTransaction: 'budget', saveBudget: 'budget',
  setBudgetMeta: 'budget', renameCategory: 'budget', logBudgetUpdate: 'budget',
  saveNotes: 'budget', addYear: 'budget', submitReceipt: 'budget',
  uploadReceiptFile: 'budget', deleteReceiptFile: 'budget',
  saveColumnValues: 'budget', ensureColumns: 'budget', saveColumnConfig: 'budget',
  // תושבים, הרשאות והרשמה
  savePermissions: 'residents', ensurePermissionCols: 'residents',
  saveResidentNames: 'residents', formatResidents: 'residents',
  approveSignup: 'residents', rejectSignup: 'residents', saveResidentRow: 'residents',
  ensureResidentCols: 'residents', replaceFamily: 'residents', exportResidents: 'residents',
  createResidents: 'residents', submitSignup: 'residents', assignResidentIds: 'residents',
  /* ⚠️ saveFamilyIds כותב לעמודת "מזהה משפחה" בטאב **תנועות** — כלומר הוא
     משנה גם את המטען הראשי, לא רק את טאב התושבים. לכן שני תחומים. מיפוי
     לפי *נושא* במקום לפי *מה באמת השתנה* הוא בדיוק איך נולד באג של נתון
     ישן על המסך. אומת ע"י מעבר על כל הפונקציות שנוגעות בטאב "תנועות". */
  saveFamilyIds: ['residents', 'budget'],
  saveMyProfile: 'residents', submitProfileChange: 'residents',
  cancelProfileChange: 'residents', approveProfileChange: 'residents',
  rejectProfileChange: 'residents',
  // מועדון (כולן ב-GET_WRITE_ACTIONS)
  reserveClub: 'club', cancelClubReservation: 'club', approveClubReservation: 'club',
  approveClubReservations: 'club', rejectClubReservation: 'club',
  // מראה שיכון
  submitGardenReport: 'garden', gardenFeedback: 'garden', gardenTask: 'garden',
  gardenApproveBatch: 'garden', gardenMerge: 'garden', gardenCreateTask: 'garden',
  gardenPlanSave: 'garden', gardenPlanActive: 'garden',
  // מכון כושר
  submitGymApplication: 'gym', createGymMembership: 'gym', requestGymDeclaration: 'gym',
  reportGymPayment: 'gym', confirmGymPayment: 'gym', rejectGymPayment: 'gym',
  recordGymPayment: 'gym', extendGymMembership: 'gym', renewGymMembership: 'gym',
  updateGymMembership: 'gym',
  // ועד השיכון ושירותים
  saveCommitteeTree: 'committee', saveCommitteeCategories: 'committee',
  saveServices: 'services', notifyServiceUpdate: 'services'
};

function bumpRev_(action) {
  try {
    var props = PropertiesService.getScriptProperties();
    var n = parseInt(props.getProperty(REV_KEY) || '0', 10) || 0;
    props.setProperty(REV_KEY, String(n + 1));
    /* פעולה יכולה להשפיע על יותר מתחום אחד (ר' saveFamilyIds) — ולכן
       הערך במפה הוא מחרוזת *או* מערך. */
    var dom = ACTION_DOMAIN[String(action || '')] || 'other';
    var doms = (Object.prototype.toString.call(dom) === '[object Array]') ? dom : [dom];
    var raw = props.getProperty(REV_DOMAINS_KEY);
    var map = {};
    if (raw) { try { map = JSON.parse(raw) || {}; } catch (e) { map = {}; } }
    for (var i = 0; i < doms.length; i++) {
      map[doms[i]] = (parseInt(map[doms[i]], 10) || 0) + 1;
    }
    props.setProperty(REV_DOMAINS_KEY, JSON.stringify(map));
  } catch (err) { /* לא קריטי — במקרה הגרוע הלקוח פשוט ימשוך מלא */ }
}

/** מפת {תחום: מונה}. מאפיין אחד, קריאה אחת — ר' ההערה למעלה. */
function currentDomains_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(REV_DOMAINS_KEY);
    return raw ? (JSON.parse(raw) || {}) : {};
  } catch (err) { return {}; }
}
function currentRev_() {
  try { return parseInt(PropertiesService.getScriptProperties().getProperty(REV_KEY) || '0', 10) || 0; }
  catch (err) { return 0; }
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
      // (2026-09-07) הלקוח מסתיר את כל אזור התושב לפי הדגל הזה. ר' EXTERNAL_HEADER.
      isExternal: perm.isExternal,
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
  var emailCols = [], firstNameCols = [], permCols = [], roleCol = -1, statusCol = -1, familyCol = -1, houseCol = -1, residentIdCol = -1, externalCol = -1;
  headers.forEach(function (h, i) {
    // "הרשאות N" (2026-08-07) — עמודה לכל משבצת אימייל, מותאמת לפי סדר כמו "שם פרטי N"
    if (h.indexOf(PERM_HEADER) !== -1) permCols.push(i);
    else if (h.indexOf('שם פרטי') !== -1) firstNameCols.push(i);
    else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    else if (h.indexOf('תפקיד') !== -1) roleCol = i;
    else if (h.indexOf('סטטוס') !== -1) statusCol = i;
    else if (h.indexOf(RESIDENT_ID_HEADER) !== -1) residentIdCol = i; // נבדק לפני "משפחה"/"בית" כדי שלא יתפוס אותם בטעות
    // "סוג משתמש" (2026-09-07) — ריק = תושב רגיל, "חיצוני" = ספק/קבלן. ר' EXTERNAL_HEADER.
    else if (h.indexOf(EXTERNAL_HEADER) !== -1) externalCol = i;
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
          isExternal: externalCol > -1 &&
            String(row[externalCol]).trim().indexOf(EXTERNAL_VALUE) !== -1,
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

/* ============ סריקה חכמה של קבלות עם Gemini (שלב 4, תוכנית שסוכמה 2026-08-07) ============
 * שלב זה בלבד: שכבת קריאה ל-Gemini + פונקציית בדיקה ידנית בעורך (שלב ב' בתוכנית).
 * עדיין לא מחוברת ל-doPost/ללקוח (זה שלב ג'-ד', בהמשך) — לפי הסיכום לעבוד צעד-צעד.
 *
 * המפתח: נשמר אך ורק ב-Project Settings → Script Properties → GEMINI_API_KEY.
 * לעולם לא בקוד הזה — הקובץ מחויב (git) לריפו הציבורי הנדרש ל-GitHub Pages החינמי,
 * ומפתח בטקסט גלוי כאן היה נחשף לכל מי שגולש בריפו (סוכם עם יועד 2026-08-07). */
function geminiApiKey_() {
  return PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
}

// מודל Gemini לסריקת קבלות: עדיפות למהירות/עלות, לא לאיכות מרבית — יועד ביקש
// לתעדף מהירות (2026-08-07). המודל שתוכנן במקור (gemini-2.0-flash) הופסק לגמרי
// ("Deprecated" ואז "Shut down" ביוני 2026) — הוחלף כאן ב-gemini-3.1-flash-lite,
// המקביל המהיר/הזול הנוכחי (נבדק מול תיעוד גוגל, אוגוסט 2026). אם התשובות איטיות
// מדי או לא מדויקות מספיק בפועל, אפשר להחליף כאן בלבד (לא נוגע בשאר הקוד).
var GEMINI_MODEL = 'gemini-3.1-flash-lite';

/** קריאה בפועל ל-Gemini עם תמונת קבלה (base64) — מבקשת פלט JSON קשיח (לא טקסט
 * חופשי) עם סכום/ספק/תיאור/תאריך, כדי לא להזדקק לפענוח טקסט חופשי ולשמור על
 * מהירות. לא נוגעת בגיליון/Drive בכלל — שכבת התאמה טהורה סביב ה-API החיצוני,
 * כך שגם handleScanReceipt_ (הפעולה האמיתית מול הלקוח, שלב ג' בהמשך) וגם
 * testGeminiScan (בדיקה ידנית כאן) יזמנו את אותה קריאה בדיוק. */
function scanReceiptWithGemini_(dataBase64, mimeType) {
  var key = geminiApiKey_();
  if (!key) {
    return { ok: false, error: 'GEMINI_API_KEY חסר. יש להוסיף אותו תחת Project Settings → Script Properties בעורך Apps Script.' };
  }
  var prompt = 'זוהי תמונה של קבלה או חשבונית מישראל. חלץ ממנה בדיוק את השדות הבאים והחזר ' +
    'אך ורק JSON תקין (בלי טקסט נוסף, בלי מרקדאון, בלי הסברים): ' +
    '{"amount": מספר (הסכום הכולל לתשלום, בלי סימן מטבע), ' +
    '"supplier": מחרוזת (שם בית העסק/הספק כפי שמופיע על הקבלה), ' +
    '"description": מחרוזת (תיאור קצר וממוקד של מה שנרכש, 2-6 מילים. אם בקבלה יש רשימה ארוכה ' +
    'של הרבה פריטים שונים — אסור לפרט את כולם אחד-אחד; יש לזהות את המכנה המשותף/הקטגוריה ' +
    'הכללית של הפריטים ולתאר אותה בקצרה בלבד, לדוגמה "ציוד משרדי", "מוצרי ניקיון" או "ציוד ' +
    'למסיבות" — ולא רשימה מלאה של הפריטים עצמם), ' +
    '"bankName": מחרוזת (פרטי הבנק של הספק לתשלום/העברה בנקאית, בדיוק כפי שכתובים בקבלה/חשבונית — ' +
    'לרוב ליד מילים כמו "בנק", "העברה בנקאית", "העברה לבנק" או "לתשלום". שימו לב: בהרבה מסמכים ' +
    'בישראל הבנק מצוין רק כמספר/קוד בנק (לדוגמה "בנק 20", "20", "בנק 12") ולא כשם מילולי כמו ' +
    '"בנק הפועלים" — במקרה כזה יש להחזיר בדיוק את המספר/קוד כפי שהוא כתוב, לא להמציא שם. ' +
    'רק אם אין שום אזכור של בנק בתמונה — ריק), ' +
    '"bankBranch": מחרוזת (מספר סניף הבנק, לרוב ליד המילה "סניף"; אחרת ריק), ' +
    '"bankAccount": מחרוזת (מספר חשבון הבנק/IBAN, לרוב ליד המילים "חשבון", "מס\' חשבון" או "ח-ן"; אחרת ריק), ' +
    '"date": מחרוזת בפורמט YYYY-MM-DD אם מופיע תאריך ברור בקבלה, אחרת מחרוזת ריקה}. ' +
    'אם שדה כלשהו לא ברור/לא מופיע בתמונה — יש להחזיר ערך ריק (0 למספר, "" למחרוזת), ' +
    'ולעולם לא להמציא ערך.';

  var payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || 'image/jpeg', data: dataBase64 } }
      ]
    }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: {
        type: 'OBJECT',
        properties: {
          amount: { type: 'NUMBER' },
          supplier: { type: 'STRING' },
          description: { type: 'STRING' },
          bankName: { type: 'STRING' },
          bankBranch: { type: 'STRING' },
          bankAccount: { type: 'STRING' },
          date: { type: 'STRING' }
        },
        required: ['amount', 'supplier', 'description', 'bankName', 'bankBranch', 'bankAccount', 'date']
      }
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(key);
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, error: 'שגיאת רשת בקריאה ל-Gemini: ' + String(e) };
  }
  var code = resp.getResponseCode();
  var raw = resp.getContentText();
  if (code !== 200) {
    return { ok: false, error: 'Gemini החזיר קוד ' + code, raw: raw };
  }
  try {
    var data = JSON.parse(raw);
    var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) return { ok: false, error: 'תשובה לא צפויה מ-Gemini (בלי טקסט בפלט)', raw: raw };
    var fields = JSON.parse(text);
    /* לוג אבחון זמני (2026-08-09) — כדי לראות בדיוק מה ג'מיני החזיר לכל שדה (כולל
       שדות בנק) דרך Executions בעורך Apps Script, בלי לנחש. אפשר להסיר בהמשך. */
    Logger.log('scanReceiptWithGemini_ fields: ' + JSON.stringify(fields));
    return { ok: true, fields: fields };
  } catch (e) {
    return { ok: false, error: 'שגיאה בפענוח תשובת Gemini: ' + String(e), raw: raw };
  }
}

/** בדיקה ידנית של הקריאה ל-Gemini (שלב ב' בתוכנית שסוכמה 2026-08-07) — מריצים
 * בעורך (▶) ואז View → Logs. אם GEMINI_API_KEY עוד לא נשמר ב-Script Properties,
 * הפונקציה תדפיס שגיאה ברורה על כך במקום להיכשל בלי הסבר. שולחת תמונה זעירה
 * לדוגמה (אותו פיקסל PNG שקוף כמו testSubmitReceipt) — זו בדיקת חיווט בלבד
 * (שהמפתח תקין, הבקשה מגיעה, הפלט חוזר כ-JSON תקין), לא בדיקת דיוק חילוץ אמיתי;
 * לבדיקה עם קבלה אמיתית יש להחליף כאן את tinyPng בבסיס64 של תמונת קבלה אמיתית
 * (ואת mimeType בהתאם, למשל 'image/jpeg'). */
function testGeminiScan() {
  var tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  var result = scanReceiptWithGemini_(tinyPng, 'image/png');
  Logger.log(JSON.stringify(result, null, 2));
}

/** שלב ג' (2026-08-08): הפעולה האמיתית מול הלקוח — נקראת מ-doPost (case 'scanReceipt').
 * במתכוון לא נוספה ל-ACTION_PERMS (כמו submitReceipt) — כל תושב מחובר עם מושב חתום תקין
 * רשאי לקרוא לה, בלי צורך בהרשאה מיוחדת (authorize_ מתיר גישה כש-need אינו מוגדר, ר'
 * doPost למעלה). לא נוגעת בגיליון/Drive בכלל — רק עוטפת את scanReceiptWithGemini_ עם
 * בדיקת קלט בסיסית, כדי ש-doPost תמיד יחזיר תשובת JSON קריאה (גם בכשל). */
function handleScanReceipt_(ss, body) {
  if (!body.dataBase64) return { ok: false, error: 'לא צורפה תמונה לסריקה' };
  return scanReceiptWithGemini_(body.dataBase64, body.mimeType);
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
// "טלפון" נוסף בסוף (2026-08-09) ולא באמצע — כך שכל האינדקסים הקיימים
// (אימייל=2, סטטוס=עמודה 7 וכו') ממשיכים לעבוד בלי שינוי בשום מקום אחר בקוד.
var SIGNUP_HEADERS = ['מזהה', 'תאריך בקשה', 'אימייל', 'שם פרטי', 'שם משפחה', 'מספר בית', 'סטטוס', 'שויך למשפחה', 'טופל בתאריך', 'טלפון'];

function getSignupsSheet_(ss) {
  var sh = ss.getSheetByName(SIGNUPS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SIGNUPS_SHEET);
    sh.getRange(1, 1, 1, SIGNUP_HEADERS.length).setValues([SIGNUP_HEADERS]);
    sh.getRange(1, 1, 1, SIGNUP_HEADERS.length).setFontWeight('bold');
    sh.setFrozenRows(1);
  } else {
    // מיגרציה אידמפוטנטית: גיליון "בקשות הרשמה" שכבר נוצר לפני שנוסף טור
    // "טלפון" — משלים רק את הכותרת החסרה בסוף, בלי לגעת בעמודות הקיימות.
    var lastCol = sh.getLastColumn();
    if (lastCol < SIGNUP_HEADERS.length) {
      var missing = SIGNUP_HEADERS.slice(lastCol);
      sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
      sh.getRange(1, lastCol + 1, 1, missing.length).setFontWeight('bold');
    }
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
    var firstNm = String(p.firstName || '').trim(), lastNm = String(p.lastName || '').trim();
    sh.appendRow([id, new Date(), email,
      firstNm, lastNm,
      String(p.house || '').trim(), 'ממתין', '', '', String(p.phone || '').trim()]);
    // מיילים אוטומטיים (2026-08-09): אישור קבלה לתושב + התראה למנהלי-תושבים
    try {
      sendResidentTemplate_(ss, 'SIGNUP_RECEIVED', [email], { 'שם': firstNm || email });
      notifyAdmins_(ss, PERM_RESIDENTS, 'ADMIN_NEW_SIGNUP', {
        'שם': (firstNm + ' ' + lastNm).trim() || email, 'אימייל': email, 'קישור': CBA_APP_URL
      });
    } catch (mailErr) { Logger.log('מייל הרשמה חדשה נכשל: ' + mailErr); }
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
        linkedFamily: String(v[7] || ''), phone: String(v[9] || '')
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
      lastName = String(req[4] || ''), house = String(req[5] || ''),
      phone = String(req[9] || '');

  var rsh = ss.getSheetByName('תושבים');
  if (!rsh) return { ok: false, error: 'אין טאב "תושבים"' };
  var values = rsh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });

  var emailCols = [], firstNameCols = [], phoneCols = [], familyCol = -1, houseCol = -1, statusCol = -1;
  headers.forEach(function (h, i) {
    if (h.indexOf('שם פרטי') !== -1) firstNameCols.push(i);
    else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    else if (h.indexOf('מספר טלפון') !== -1) phoneCols.push(i);
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
  if (phoneCols[slot] !== undefined && phone) {
    rsh.getRange(targetRow, phoneCols[slot] + 1).setValue(phone);
  }
  if (statusCol > -1 && !String(cur[statusCol] || '').trim()) {
    rsh.getRange(targetRow, statusCol + 1).setValue('פעיל');
  }

  var famName = familyCol > -1 ? String(cur[familyCol] || lastName) : lastName;
  sh.getRange(row, 7).setValue('אושר');
  sh.getRange(row, 8).setValue(famName);
  sh.getRange(row, 9).setValue(new Date());
  // מייל אישור+ברוכים-הבאים לתושב (2026-08-09) — זה בדיוק הרגע שבו האימייל שלו
  // עובר מריק למלא בטאב "תושבים", אז אין צורך במייל "ברוכים הבאים" נפרד.
  try {
    sendResidentTemplate_(ss, 'SIGNUP_APPROVED', [email], { 'שם': firstName || email, 'קישור': CBA_APP_URL });
  } catch (mailErr) { Logger.log('מייל אישור הרשמה נכשל: ' + mailErr); }
  return { ok: true, family: famName, row: targetRow };
}

function rejectSignup_(ss, body) {
  var sh = getSignupsSheet_(ss);
  var row = signupRowById_(sh, body.id);
  if (row === -1) return { ok: false, error: 'בקשה לא נמצאה' };
  var req = sh.getRange(row, 1, 1, SIGNUP_HEADERS.length).getValues()[0];
  var rejEmail = String(req[2] || ''), rejFirstName = String(req[3] || '');
  sh.getRange(row, 7).setValue('נדחה');
  sh.getRange(row, 9).setValue(new Date());
  try {
    sendResidentTemplate_(ss, 'SIGNUP_REJECTED', [rejEmail], { 'שם': rejFirstName || rejEmail });
  } catch (mailErr) { Logger.log('מייל דחיית הרשמה נכשל: ' + mailErr); }
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

  // תפיסת ערכי "אימייל" הקיימים *לפני* הכתיבה (2026-08-09) — כדי לזהות מעבר
  // ריק->מלא ולשלוח מייל "ברוכים הבאים" בדיוק פעם אחת, רק כשמנהל ממלא אימייל
  // שהיה ריק (לא בכל עריכה של שורה קיימת).
  var before = rsh.getRange(rowIdx, 1, 1, headers.length).getValues()[0];

  var written = [];
  Object.keys(fields).forEach(function (k) {
    var c = headers.indexOf(k);
    if (c === -1) return;
    rsh.getRange(rowIdx, c + 1).setValue(fields[k]);
    written.push(k);
  });
  if (!written.length) return { ok: false, error: 'לא נמצאו עמודות תואמות' };

  try {
    headers.forEach(function (h, c) {
      if (h.indexOf('אימייל') === -1) return;
      var wasEmpty = !String(before[c] || '').trim();
      var newVal = String(fields[h] || '').trim();
      if (wasEmpty && newVal) sendResidentTemplate_(ss, 'WELCOME_MANUAL', [newVal], { 'קישור': CBA_APP_URL });
    });
  } catch (mailErr) { Logger.log('מייל ברוכים הבאים נכשל: ' + mailErr); }

  return { ok: true, written: written };
}

/* ---------- עמודות נוספות בטאב "תושבים" (2026-08-07) ----------
 * מקצוע ושמות ילדים. נוצרות פעם אחת בסוף הטאב אם אינן קיימות, בלי לגעת
 * בעמודות קיימות ובלי לשנות את סדרן — אידמפוטנטי, אפשר לקרוא שוב בלי נזק. */
/* עמודות רשות בטאב "תושבים" שהאפליקציה יוצרת לבד אם הן חסרות (ensureResidentCols_).
 * "ת.ז. 1"/"ת.ז. 2" נוספו ב-2026-08-18 עבור מודול מכון הכושר: הן ממוספרות לפי
 * אדם בדיוק כמו "אימייל N"/"שם פרטי N"/"הרשאות N", כי הטאב הוא שורה למשק בית.
 * אשף ההרשמה למכון ישאל ת.ז. פעם אחת ויכתוב אותה לכאן, כך שהמאגר מתמלא מעצמו. */
var EXTRA_RESIDENT_COLS = ['מקצוע 1', 'מקצוע 2', 'שמות ילדים', 'הערות', 'ת.ז. 1', 'ת.ז. 2'];

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

/** ספריית קהילה ציבורית לתושב: בית, משפחה, שמות פרטיים, טלפון/ים, שמות ילדים —
 * בלי אימייל/הרשאות/מקצוע/הערות. authorize_ עם need=null: מספיק מושב תקין +
 * "פעיל" בטאב תושבים, בלי צורך בהרשאת ניהול כלשהי (כל תושב מחובר). סטטוס נשלח
 * גם הוא כדי שהלקוח יוכל לסנן משקי-בית שעזבו — לא מוצג בפועל. */
function handleCommunityDirectory_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var sh = ss.getSheetByName('תושבים');
    if (!sh) return json_({ ok: false, error: 'אין טאב "תושבים"' });
    var values = sh.getDataRange().getValues();
    if (values.length < 2) return json_({ ok: true, rows: [] });
    var headers = values[0].map(function (h) { return String(h).trim(); });
    function keep_(h) {
      return h === RESIDENT_ID_HEADER || h.indexOf('משפחה') !== -1 ||
             h.indexOf('שם פרטי') !== -1 || h.indexOf('בית') !== -1 ||
             h.indexOf('טלפון') !== -1 || h.indexOf('ילדים') !== -1 ||
             h.indexOf('סטטוס') !== -1;
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

/* ============================================================================
 *  עץ ועד השיכון (2026-08-09)
 * ----------------------------------------------------------------------------
 *  טאב "עץ ועד השיכון": כל שורה = אדם אחד בתפקיד אחד. עמודות: "מזהה תא"
 *  (מזהה קבוע של התפקיד/תא — כמה שורות עם אותו מזהה מרכיבות תא אחד עם כמה
 *  אנשים, למשל "הסעים" עם 3 שמות), "הורה" (מזהה התא שמעליו בעץ; ריק=שורש),
 *  "תפקיד", "קטגוריה" (הנהלה / ילדים וקהילה / תפעול ושירות / ועדת מתנדבים —
 *  קובעת רק את צבע התיוג בתצוגה, לא הרשאות), "שם" (יכול היה ריק — "תא פנוי"),
 *  "מזהה תושב" (אופציונלי — "מזהה קבוע" מטאב תושבים, כשהשם נבחר מרשימת
 *  התושבים ולא הוקלד חופשי, בדיוק כמו שדה "רוכש/מטפל" בטופס ההוצאה).
 *  אין עמודת "סדר" נפרדת — סדר התצוגה נגזר מסדר השורות בגיליון עצמו.
 * ========================================================================== */
var COMMITTEE_SHEET = 'עץ ועד השיכון';
var COMMITTEE_HEADERS = ['מזהה תא', 'הורה', 'תפקיד', 'קטגוריה', 'שם', 'מזהה תושב'];

/** הרכב הוועד תשפ"ז כברירת מחדל בפתיחה ראשונה, מתומלל מהתרשים שיועד סיפק.
 * שים לב: הרמות העמוקות (מתחת ל"יו"ר שיכון") תומללו ידנית מתמונה ועלולות
 * להכיל טעויות קישור הורה/תא — קל לתקן ישירות במסך "ועד השיכון" (עריכה
 * מלאה, מנהל-על). [boxId, parentId, role, category, name] */
function committeeSeed_() {
  return [
    ['n1', '', 'מב"ס 30', 'הנהלה', 'יגאל דדון'],
    ['n2', 'n1', 'סמב"ס 30', 'הנהלה', 'אורן מרקברייט'],
    ['n3', 'n2', 'יו"ר שיכון', 'הנהלה', 'ברנע'],
    ['n4', 'n3', 'גזבר', 'הנהלה', 'יועד גולן'],
    ['n5', 'n3', 'יו"ר גנים', 'הנהלה', 'רז פרינץ'],
    ['n6', 'n3', 'קהילה', 'הנהלה', 'שיינא סלוטין'],
    ['n7', 'n3', 'מועדון ילדים, צהרון ומכולה', 'הנהלה', 'מורן ממן'],
    ['n8', 'n3', 'בטיחות ותברואה', 'הנהלה', 'ביני ירס'],
    ['n9', 'n3', 'פרויקטים ובינוי', 'הנהלה', 'יוסף אלון'],
    ['n10', 'n3', 'תרבות', 'הנהלה', 'עדי קוסטרצוב'],
    ['n11', 'n3', 'אכלוס', 'הנהלה', 'ליאת פטיטו מן'],
    ['n12', 'n3', 'מראה שיכון', 'הנהלה', 'דין ארגיל'],
    ['n13', 'n3', 'בתי ספר', 'הנהלה', 'זוהר פרבר'],
    ['n14', 'n4', 'מועדון משפחות', 'ילדים וקהילה', 'משי אלקובי'],
    ['n15', 'n5', 'מנהלת חינוך', 'תפעול ושירות', 'זהבית'],
    ['n16', 'n5', 'מועצה', 'ילדים וקהילה', 'אבירם כהן'],
    ['n17', 'n6', 'א. חוגים', 'הנהלה', 'עמית פרי'],
    ['n18', 'n6', 'ועדת קהילה', 'ועדת מתנדבים', ''],
    ['n19', 'n7', 'חד"כ', 'ילדים וקהילה', 'WEWORK'],
    ['n20', 'n7', 'מועדון נוער', 'הנהלה', 'אבירם כהן'],
    ['n20', 'n7', 'מועדון נוער', 'הנהלה', 'אורטל כהן'],
    ['n21', 'n10', 'ועדת תרבות', 'ועדת מתנדבים', ''],
    ['n22', 'n11', 'פרט וחוסן', 'תפעול ושירות', 'ניי ברוש'],
    ['n23', 'n12', 'קבלן גינון ונקיון', 'תפעול ושירות', 'אביתר'],
    ['n24', 'n13', 'הסעים', 'הנהלה', 'דוד טייב'],
    ['n24', 'n13', 'הסעים', 'הנהלה', 'רוני קוטאי (גן רווה)'],
    ['n24', 'n13', 'הסעים', 'הנהלה', 'אורטל כהן (עמיחי)'],
    ['n25', 'n17', 'מדריכי חוגים', 'תפעול ושירות', ''],
    ['n26', 'n19', 'מכולת היופי', 'ילדים וקהילה', ''],
    ['n27', 'n22', 'ועדת פרט וחוסן', 'ועדת מתנדבים', ''],
    ['n28', 'n26', 'מועדון ילדים', 'ילדים וקהילה', ''],
    ['n29', 'n28', 'מפעיל מועדון וצהרון', 'תפעול ושירות', '']
  ].map(function (r) { return [r[0], r[1], r[2], r[3], r[4], '']; });
}

/** יוצר את טאב עץ הוועד עם הכותרות + הרכב תשפ"ז כברירת מחדל — רק אם הטאב
 * עוד לא קיים בכלל. אידמפוטנטי: אם הטאב כבר קיים (כולל אחרי שיועד ערך אותו
 * במסך או ידנית בגיליון), הפונקציה לא נוגעת בתוכן, רק מחזירה אותו. */
function ensureCommitteeSheet_(ss) {
  var sh = ss.getSheetByName(COMMITTEE_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(COMMITTEE_SHEET);
  sh.getRange(1, 1, 1, COMMITTEE_HEADERS.length).setValues([COMMITTEE_HEADERS]);
  sh.getRange(1, 1, 1, COMMITTEE_HEADERS.length).setFontWeight('bold');
  var seed = committeeSeed_();
  sh.getRange(2, 1, seed.length, COMMITTEE_HEADERS.length).setValues(seed);
  sh.setFrozenRows(1);
  return sh;
}

/** קריאה — פתוחה לכל תושב מחובר ופעיל (need=null), בדיוק כמו communityDirectory
 * למעלה. יוצרת את הטאב אוטומטית בפעם הראשונה (ensureCommitteeSheet_) כדי
 * שיועד לא יצטרך להכין טאב/עמודות ידנית בגיליון. */
function handleCommitteeTree_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureCommitteeSheet_(ss);
    return json_({ ok: true, rows: readTable_(ss, COMMITTEE_SHEET) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** שמירה — מנהל-על בלבד (נאכף ב-ACTION_PERMS, לא כאן). מוחקת את כל שורות
 * הנתונים הקיימות וכותבת מחדש את כל הרשימה שהתקבלה מהלקוח: העץ נערך במסך
 * כמקשה אחת (הוספת/הסרת תא, שינוי הורה) ולא שורה-שורה, כך שהחלפה מלאה
 * פשוטה וחסינה יותר מניסיון "לפזל" שינויים חלקיים. נעילה כדי שתי שמירות
 * לא יתנגשו זו בזו (אותו דפוס כמו saveBudget_/renameCategory_ למעלה). */
function saveCommitteeTree_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ensureCommitteeSheet_(ss);
    var rows = Array.isArray(body.rows) ? body.rows : [];
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, COMMITTEE_HEADERS.length).clearContent();
    if (rows.length) {
      var grid = rows.map(function (r) {
        return COMMITTEE_HEADERS.map(function (h) { return (r[h] == null) ? '' : r[h]; });
      });
      sh.getRange(2, 1, grid.length, COMMITTEE_HEADERS.length).setValues(grid);
    }
    return { ok: true, count: rows.length };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 *  קטגוריות "עץ ועד השיכון" (2026-08-10)
 * ----------------------------------------------------------------------------
 *  לבקשת יועד: הקטגוריות הקבועות (הנהלה/ילדים וקהילה/תפעול ושירות/ועדת
 *  מתנדבים) הפכו לרשימה ניתנת-לעריכה — מנהל-על יכול להוסיף קטגוריה חדשה
 *  עם צבע משלה ישירות מטופס עריכת התפקיד, לא רק לבחור מהרשימה הקבועה.
 *  טאב נפרד "קטגוריות ועד השיכון": כל שורה = קטגוריה אחת. עמודות: "שם",
 *  "צבע" (hex, למשל "#7C3AED"). אין "מזהה" נפרד — השם עצמו הוא המפתח
 *  (כמו "קטגוריה" בטבלת העץ שמצביעה לכאן לפי שם).
 * ========================================================================== */
var COMMITTEE_CATS_SHEET = 'קטגוריות ועד השיכון';
var COMMITTEE_CATS_HEADERS = ['שם', 'צבע'];

/** ברירת מחדל בפתיחה ראשונה — אותם 4 צבעים שכבר היו קבועים ב-CSS
 * (org-kids/org-ops/org-vol), פלוס "הנהלה" שקיבלה עכשיו צבע מפורש משלה
 * (קודם השתמשה ב---text הכללי, בלי טוקן נפרד). */
function committeeCatsSeed_() {
  return [
    ['הנהלה', '#111827'],
    ['ילדים וקהילה', '#7C3AED'],
    ['תפעול ושירות', '#0891B2'],
    ['ועדת מתנדבים', '#6B7280']
  ];
}

function ensureCommitteeCatsSheet_(ss) {
  var sh = ss.getSheetByName(COMMITTEE_CATS_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(COMMITTEE_CATS_SHEET);
  sh.getRange(1, 1, 1, COMMITTEE_CATS_HEADERS.length).setValues([COMMITTEE_CATS_HEADERS]);
  sh.getRange(1, 1, 1, COMMITTEE_CATS_HEADERS.length).setFontWeight('bold');
  var seed = committeeCatsSeed_();
  sh.getRange(2, 1, seed.length, COMMITTEE_CATS_HEADERS.length).setValues(seed);
  sh.setFrozenRows(1);
  return sh;
}

/** קריאה — פתוחה לכל תושב מחובר (need=null), בדיוק כמו handleCommitteeTree_
 * למעלה: התצוגה (צבע הפס העליון על כל קוביה) גלויה לכולם, רק העריכה
 * (הוספת קטגוריה/צבע חדשים) מוגבלת למנהל-על. */
function handleCommitteeCategories_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureCommitteeCatsSheet_(ss);
    return json_({ ok: true, rows: readTable_(ss, COMMITTEE_CATS_SHEET) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** שמירה — מנהל-על בלבד (ACTION_PERMS). כמו saveCommitteeTree_: מחליפה את
 * כל הרשימה במקום לערוך שורה בודדת — הרשימה קטנה (כמה קטגוריות), אין טעם
 * במיזוג חלקי, וזה גם מונע כפילויות אם שני מנהלים ערכו במקביל. */
function saveCommitteeCategories_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ensureCommitteeCatsSheet_(ss);
    var rows = Array.isArray(body.rows) ? body.rows : [];
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, COMMITTEE_CATS_HEADERS.length).clearContent();
    if (rows.length) {
      var grid = rows.map(function (r) {
        return COMMITTEE_CATS_HEADERS.map(function (h) { return (r[h] == null) ? '' : r[h]; });
      });
      sh.getRange(2, 1, grid.length, COMMITTEE_CATS_HEADERS.length).setValues(grid);
    }
    return { ok: true, count: rows.length };
  } finally {
    lock.releaseLock();
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

    // מיילי "ברוכים הבאים" (2026-08-09) — לשורות חדשות שכבר הגיעו עם אימייל מלא
    // (למשל הדבקת גריד עם אימייל). לא שולח אם השורה נוצרה בלי אימייל עדיין —
    // המייל יישלח אז מאוחר יותר, כשהמנהל ימלא את השדה דרך saveResidentRow_.
    try {
      toAppend.forEach(function (row) {
        emailCols.forEach(function (ci) {
          var e = String(row[ci] || '').trim();
          if (e) sendResidentTemplate_(ss, 'WELCOME_MANUAL', [e], { 'קישור': CBA_APP_URL });
        });
      });
    } catch (mailErr) { Logger.log('מייל ברוכים הבאים (יצירה מרוכזת) נכשל: ' + mailErr); }

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

/* ============================================================================
 *  מיילים אוטומטיים (2026-08-09) — מפה מלאה שסוכמה עם יועד
 * ----------------------------------------------------------------------------
 *  שלוש קבוצות:
 *   1. מיילים לתושב על פעולה שלו (הרשמה/החזר/שריון) — נקראים ישירות מתוך
 *      הפונקציות הקיימות למעלה (approveSignup_, submitReceipt_, saveTransaction_,
 *      handleApproveClubReservation_ וכו') ברגע שהפעולה עצמה הצליחה.
 *   2. מיילים למנהל — התראה מיידית על בקשה חדשה (מאותן פונקציות), ותזכורות/סיכומים
 *      שרצים פעם ביום מתוך dailyEmailJobs_ (למטה) — ממתין הרבה זמן, סיכום שבועי,
 *      סיכום 17 לחודש.
 *   3. תשתית הגדרות: כל נוסח מייל וכל זמן/סף (כמה ימים = "ממתין הרבה זמן", איזה
 *      יום שבועי, איזה יום בחודש) יושבים בטאב "הגדרות מיילים" ולא בקוד — כדי
 *      שיועד יוכל לערוך אותם היום ישירות בגיליון, ובעתיד גם ממסך ניהול באפליקציה
 *      בלי לגעת בקוד בכלל (התשתית כבר בנויה לכך מהיום הראשון).
 *
 *  עיקרון מרכזי: שליחת מייל אף פעם לא אמורה להפיל פעולה אחרת (שמירת קבלה/שריון/
 *  הרשמה) — כל קריאה עטופה ב-try/catch נפרד, ושגיאת מייל נרשמת ל-Logger בלבד.
 * ========================================================================== */

var EMAIL_SETTINGS_SHEET = 'הגדרות מיילים';
var SUBMIT_DATE_HEADER = 'הוגש בתאריך';
var CBA_APP_URL = 'https://yoadgo.github.io/CBA-Community-Budget-App/';

/** ברירות מחדל — נכתבות לגיליון "הגדרות מיילים" רק בפעם הראשונה (או אם נוסף
 * מפתח חדש בעדכון קוד עתידי) — לעולם לא דורסות ערך שיועד כבר ערך ידנית בגיליון.
 * כל שורה: [מפתח, נושא, תוכן, הערה, תחום, פעיל]. מפתחות RULE_* ו-MASTER_ENABLED
 * הם ערכי הגדרה (זמן/סף/מתג), לא תבניות מייל — הערך שלהם יושב בעמודת "תוכן"
 * (או ב"פעיל" עבור MASTER_ENABLED), ועמודת "נושא" נשארת ריקה.
 * placeholders בתבניות (למשל {{שם}}) מוחלפים בפועל בערכים אמיתיים ע"י renderTemplate_.
 * "תחום" (2026-08-18, שלב 1 מסך ניהול מיילים): אחת מ-PERM_SUPER/BUDGET/CLUB/RESIDENTS
 * — קובעת איזה מנהל רשאי לראות/לערוך את השורה במסך "ניהול מיילים" (מנהל-על
 * רואה/עורך הכול תמיד). כללים גלובליים (RULE_*, MASTER_ENABLED) והסיכום השבועי
 * (חוצה-מידורים) שייכים ל-PERM_SUPER בלבד. "פעיל": 'כן'/'לא' — האם התבנית הזו
 * (או, עבור MASTER_ENABLED, כל שליחת המיילים באפליקציה) פעילה כרגע. */
var DEFAULT_EMAIL_SETTINGS = [
  ['MASTER_ENABLED', '', '', 'מתג ראשי — כיבוי מכבה את כל שליחת המיילים האוטומטית באפליקציה (כולל התזכורות והסיכומים היומיים), בלי לשנות אף הגדרה אחרת. שימושי לבדיקות/חגים.', PERM_SUPER, 'כן'],

  ['RULE_STALE_DAYS', '', '3', 'כמה ימים בקשה (הרשמה/החזר/שריון) ממתינה בלי טיפול לפני שנשלחת תזכורת למנהל', PERM_SUPER, 'כן'],
  ['RULE_WEEKLY_DAY', '', '0', 'יום השבוע לסיכום המנהל השבועי: 0=ראשון, 1=שני ... 6=שבת', PERM_SUPER, 'כן'],
  ['RULE_MONTHLY_DAY', '', '17', 'יום בחודש לסיכום בקשות ההחזר הפתוחות (לפני סגירת החלון ב-19)', PERM_SUPER, 'כן'],
  ['RULE_CLUB_REMINDER_DAYS_BEFORE', '', '2', 'כמה ימים לפני מועד השריון נשלחת תזכורת חוקים+תשלום לתושב', PERM_SUPER, 'כן'],
  ['RULE_GYM_RENEW_DAYS_BEFORE', '', '14', 'כמה ימים לפני שמנוי המכון פג נשלחת לתושב תזכורת חידוש', PERM_SUPER, 'כן'],
  ['RULE_GYM_PAYMENT_NUDGE_DAYS', '', '5', 'אחרי כמה ימים בסטטוס "ממתין לתשלום" נשלחת לתושב תזכורת עדינה', PERM_SUPER, 'כן'],
  ['RULE_GYM_DECL_WARN_DAYS', '', '30', 'כמה ימים לפני שהצהרת הבריאות פגה (שנתיים) נשלחת התרעה לתושב', PERM_SUPER, 'כן'],

  ['RULE_GARDEN_WEEKLY_DAY', '', '0', 'יום השבוע להפקת סיכום הגינון: 0=ראשון, 1=שני ... 6=שבת. הוחלט 7.9.26 על ראשון בבוקר, לפני ישיבת התכנון — הסיכום מופק תמיד, גם אם נשארו אישורים פתוחים, ומציין בתוכו כמה', PERM_SUPER, 'כן'],
  ['RULE_GARDEN_FEEDBACK_DAYS', '', '7', 'כמה ימים אחרי סגירת דיווח התושב עדיין יכול לתת עליו משוב', PERM_SUPER, 'כן'],
  ['RULE_GARDEN_MERGE_DAYS', '', '14', 'בתוך כמה ימים דיווח חדש נחשב כפילות אפשרית של תקלה פתוחה באותה קטגוריה ובאותו בית/אזור', PERM_SUPER, 'כן'],
  ['RULE_GARDEN_PHOTO_MAX', '', '8', 'תקרת התמונות המצטברת לדיווח גינון אחד', PERM_SUPER, 'כן'],

  ['SIGNUP_RECEIVED', 'קיבלנו את בקשת ההרשמה שלך',
    'שלום {{שם}},\n\nבקשת ההרשמה שלך לוועד הקהילה התקבלה ונמצאת בבדיקה. נעדכן אותך ברגע שתטופל.\n\nבברכה,\nועד הקהילה', 'נשלח לתושב מיד עם הגשת טופס ההרשמה', PERM_RESIDENTS, 'כן'],
  ['SIGNUP_APPROVED', 'ברוכים הבאים! ההרשמה שלך אושרה',
    'שלום {{שם}},\n\nבקשת ההרשמה שלך אושרה ואפשר להיכנס עכשיו לאפליקציה עם חשבון הגוגל שלך — לחצו על הכפתור למטה.\n\nבברכה,\nועד הקהילה', 'נשלח לתושב כשמנהל מאשר הרשמה — משמש גם כמייל ברוכים הבאים. הכפתור לאפליקציה מתווסף אוטומטית בעיצוב, אין צורך לכתוב קישור בטקסט', PERM_RESIDENTS, 'כן'],
  ['SIGNUP_REJECTED', 'עדכון לגבי בקשת ההרשמה שלך',
    'שלום {{שם}},\n\nלצערנו בקשת ההרשמה שלך לא אושרה. לשאלות אפשר לפנות לוועד.\n\nבברכה,\nועד הקהילה', 'נשלח לתושב כשמנהל דוחה הרשמה', PERM_RESIDENTS, 'כן'],
  ['WELCOME_MANUAL', 'ברוכים הבאים לאפליקציית הוועד',
    'שלום,\n\nנפתחה עבורך גישה לאפליקציית ניהול התקציב של הוועד. אפשר להיכנס עם חשבון הגוגל שלך — לחצו על הכפתור למטה.\n\nבברכה,\nועד הקהילה', 'נשלח כשמנהל מוסיף תושב/מייל ידנית (לא דרך טופס הרשמה). הכפתור לאפליקציה מתווסף אוטומטית', PERM_RESIDENTS, 'כן'],

  ['PROFILE_CHANGE_RECEIVED', 'קיבלנו את בקשת השינוי שלך',
    'שלום {{שם}},\n\nקיבלנו את הבקשה שלך לשנות את {{שדה}} ל-{{ערך}}. הבקשה ממתינה לאישור הוועד, ונעדכן אותך ברגע שתטופל.\n\nעד אז אפשר להמשיך להיכנס לאפליקציה כרגיל.\n\nבברכה,\nועד הקהילה',
    'נשלח לתושב מיד עם שליחת בקשת שינוי פרטים (כרגע: שינוי אימייל)', PERM_RESIDENTS, 'כן'],
  ['PROFILE_CHANGE_APPROVED', 'בקשת השינוי שלך אושרה',
    'שלום {{שם}},\n\nהבקשה שלך אושרה, ו{{שדה}} עודכן ל-{{ערך}}.\n\nבברכה,\nועד הקהילה',
    'נשלח כשמנהל מאשר בקשת שינוי. בשינוי אימייל נשלח גם לכתובת הישנה וגם לחדשה — הישנה כדי שהתושב יידע שהזהות שלו השתנתה, החדשה כדי שיוכל לוודא שהיא עובדת', PERM_RESIDENTS, 'כן'],
  ['PROFILE_CHANGE_REJECTED', 'עדכון לגבי בקשת השינוי שלך',
    'שלום {{שם}},\n\nהבקשה שלך לשנות את {{שדה}} לא אושרה.\n\nסיבה: {{סיבה}}\n\nלשאלות אפשר לפנות לוועד.\n\nבברכה,\nועד הקהילה',
    'נשלח לתושב כשמנהל דוחה בקשת שינוי פרטים', PERM_RESIDENTS, 'כן'],
  ['PROFILE_CHANGE_NEW', 'בקשת שינוי פרטים חדשה מ{{שם}}',
    'שלום,\n\n{{שם}} ביקש/ה לשנות את {{שדה}}.\n\nמ: {{ערך נוכחי}}\nל: {{ערך מבוקש}}\n\nהבקשה ממתינה לאישור במסך "תושבים" באפליקציה.\n\nבברכה,\nהאפליקציה',
    'נשלח למנהלי התושבים כשתושב מגיש בקשת שינוי פרטים', PERM_RESIDENTS, 'כן'],

  ['REIMBURSEMENT_RECEIVED', "קיבלנו את בקשת ההחזר שלך (מס' {{מזהה}})",
    "שלום {{שם}},\n\nקיבלנו את בקשת ההחזר שלך על סך {{סכום}} ₪ (מס' {{מזהה}}). הבקשה ממתינה לטיפול ונעדכן אותך בכל שינוי סטטוס.\n\nבברכה,\nועד הקהילה", 'נשלח לתושב מיד עם הגשת בקשת החזר', PERM_BUDGET, 'כן'],
  ['REIMBURSEMENT_READY', 'בקשת ההחזר שלך אושרה ועברה להנהלת חשבונות',
    "שלום {{שם}},\n\nבקשת ההחזר שלך על סך {{סכום}} ₪ (מס' {{מזהה}}) אושרה והועברה להנהלת חשבונות לתשלום.\n\nבברכה,\nועד הקהילה", 'נשלח כשסטטוס הבקשה עובר ל"הועבר להנה"ח"', PERM_BUDGET, 'כן'],
  ['REIMBURSEMENT_PAID', 'בקשת ההחזר שלך שולמה',
    "שלום {{שם}},\n\nבקשת ההחזר שלך על סך {{סכום}} ₪ (מס' {{מזהה}}) שולמה. תודה!\n\nבברכה,\nועד הקהילה", 'נשלח כשסטטוס הבקשה עובר ל"שולם"', PERM_BUDGET, 'כן'],
  ['REIMBURSEMENT_REJECTED', 'עדכון לגבי בקשת ההחזר שלך',
    "שלום {{שם}},\n\nלצערנו בקשת ההחזר שלך על סך {{סכום}} ₪ (מס' {{מזהה}}) לא אושרה.{{הערה}}\n\nלשאלות אפשר לפנות לוועד.\n\nבברכה,\nועד הקהילה", 'נשלח כשסטטוס הבקשה עובר ל"נדחה" — {{הערה}} כולל את הערת הבדיקה אם יש', PERM_BUDGET, 'כן'],

  ['CLUB_APPROVED', 'השריון שלך במועדון אושר',
    'שלום {{שם}},\n\nהשריון שלך במועדון בתאריך {{תאריך}} בשעות {{שעה}} אושר.\n\nתזכורת: יש להסדיר את תשלום דמי השימוש במועדון מול הוועד.\n\nבברכה,\nועד הקהילה', 'נשלח לתושב כשמנהל מאשר שריון מועדון', PERM_CLUB, 'כן'],
  ['CLUB_REJECTED', 'עדכון לגבי השריון שלך במועדון',
    'שלום {{שם}},\n\nלצערנו השריון שלך במועדון בתאריך {{תאריך}} בשעות {{שעה}} לא אושר.\n\nבברכה,\nועד הקהילה', 'נשלח לתושב כשמנהל דוחה שריון מועדון', PERM_CLUB, 'כן'],
  ['CLUB_REMINDER', 'תזכורת: השריון שלך במועדון בעוד יומיים',
    'שלום {{שם}},\n\nתזכורת — השריון שלך במועדון מתקרב: {{תאריך}} בשעות {{שעה}}.\n\nנא לוודא שקראת/ן את חוקי המועדון, ושתשלום דמי השימוש הוסדר מול הוועד.\n\nבברכה,\nועד הקהילה', 'נשלח אוטומטית X ימים לפני מועד שריון מאושר (ר\' RULE_CLUB_REMINDER_DAYS_BEFORE)', PERM_CLUB, 'כן'],

  ['ADMIN_NEW_SIGNUP', 'בקשת הרשמה חדשה ממתינה',
    'התקבלה בקשת הרשמה חדשה מ-{{שם}} ({{אימייל}}).', 'למנהלי תושבים + מנהל-על. הכפתור לטיפול באפליקציה מתווסף אוטומטית', PERM_RESIDENTS, 'כן'],
  ['ADMIN_NEW_REIMBURSEMENT', 'בקשת החזר חדשה ממתינה',
    "התקבלה בקשת החזר חדשה מ-{{שם}} על סך {{סכום}} ₪ (מס' {{מזהה}}).", 'למנהלי תקציב + מנהל-על', PERM_BUDGET, 'כן'],
  ['ADMIN_NEW_CLUB', 'בקשת שריון מועדון חדשה ממתינה',
    'התקבלה בקשת שריון מועדון חדשה מ-{{שם}} בתאריך {{תאריך}} בשעות {{שעה}}.', 'למנהלי מועדון + מנהל-על', PERM_CLUB, 'כן'],

  ['GARDEN_REPORT_RECEIVED', "קיבלנו את דיווח הגינון שלך (מס' {{מזהה}})",
    "שלום {{שם}},\n\nקיבלנו את הדיווח שלך על {{קטגוריה}} ב{{מיקום}} (מס' {{מזהה}}). הוא הועבר לצוות הגינון, ואפשר לעקוב אחרי הסטטוס באפליקציה.\n\nבברכה,\nועד הקהילה",
    'נשלח לתושב מיד עם פתיחת דיווח גינון', PERM_GARDEN, 'כן'],
  ['GARDEN_REPORT_MERGED', "הדיווח שלך צורף לפנייה קיימת (מס' {{מזהה אב}})",
    "שלום {{שם}},\n\nהדיווח שלך על {{קטגוריה}} ב{{מיקום}} אוחד עם פנייה קיימת שכבר נפתחה על אותו נושא (מס' {{מזהה אב}}), כדי שהטיפול יהיה במקום אחד.\n\nנעדכן אותך כשהטיפול יסתיים. אם יתברר שמדובר בשני דברים שונים — אפשר לומר לנו את זה במשוב שיצורף לעדכון הסיום.\n\nבברכה,\nועד הקהילה",
    'נשלח לתושב כשדיווחו אוחד עם תקלה פתוחה קיימת. חשוב: זה מה שמאפשר לו לדעת למה יקבל בהמשך הודעת סיום על משהו שהוא לא בטוח שטופל — ר\' ההחלטה על איחוד ללא תמונה', PERM_GARDEN, 'כן'],
  ['GARDEN_PLANNED', 'הדיווח שלך נכנס לתוכנית העבודה',
    "שלום {{שם}},\n\nהדיווח שלך (מס' {{מזהה}}) נבדק ונכנס לתוכנית העבודה של צוות הגינון.\n\nבברכה,\nועד הקהילה",
    'נשלח לתושב כשהדיווח עובר לשלב "מתוכנן"', PERM_GARDEN, 'כן'],
  ['GARDEN_COMPLETED', "הטיפול בדיווח שלך הושלם (מס' {{מזהה}})",
    "שלום {{שם}},\n\nהטיפול בדיווח שלך על {{קטגוריה}} ב{{מיקום}} הושלם ואושר על ידי הוועד.\n\n{{איחוד}}אם משהו לא נראה לך תקין — אפשר להשיב לנו באפליקציה בתוך שבוע.\n\nתודה שדיווחת,\nועד הקהילה",
    'נשלח לתושב רק אחרי שמנהל הגינון אישר את הסיום — לא כשצוות הגינון סימן "בוצע". {{איחוד}} מתמלא במשפט על האיחוד רק אם הדיווח אוחד', PERM_GARDEN, 'כן'],
  /* סגירה שאינה "בוצע" (2026-09-08, החלטת יועד). עד היום היא הייתה שקטה
     לגמרי: התושב דיווח, המשימה נסגרה כ"בוטל" או "לא רלוונטי", ומבחינתו
     הפנייה פשוט נעלמה. {{סיבה}} הוא **טקסט חופשי שהמנהל כותב** ולא שם
     הסגירה — "בוטל" אינו הסבר, והתושב זכאי לאחד. */
  ['GARDEN_REPORT_DECLINED', "עדכון על הדיווח שלך (מס' {{מזהה}})",
    "שלום {{שם}},\n\nבדקנו את הדיווח שלך על {{קטגוריה}} ב{{מיקום}} (מס' {{מזהה}}), " +
    "ולא ייפתח עליו טיפול.\n\n{{סיבה}}\n\nאם נראה לך שזו טעות — אפשר לפנות אלינו " +
    "ונשמח לבדוק שוב.\n\nבברכה,\nועד הקהילה",
    'נשלח לתושב כשמנהל הגינון סוגר דיווח בלי לבצע (בוטל / לא רלוונטי / הועבר לבינוי). ' +
    '{{סיבה}} הוא ההסבר שהמנהל כתב — הוא חובה, כי "בוטל" לבדו אינו תשובה',
    PERM_GARDEN, 'כן'],
  ['ADMIN_NEW_GARDEN_REPORT', 'דיווח גינון חדש ממתין',
    'התקבל דיווח גינון חדש מ-{{שם}}: {{קטגוריה}} ב{{מיקום}} (מס\' {{מזהה}}).', 'למנהלי גינון + מנהל-על', PERM_GARDEN, 'כן'],
  ['ADMIN_GARDEN_NEGATIVE_FEEDBACK', 'תושב סימן שהטיפול לא הושלם כראוי',
    "{{שם}} נתן משוב שלילי על דיווח מס' {{מזהה}} ({{קטגוריה}}, {{מיקום}}).\n\nהערתו: {{הערה}}\n\nהמשימה סומנה \"דורש בדיקה חוזרת\" וממתינה להחלטתך.",
    'למנהלי גינון + מנהל-על. משוב שלילי לא פותח את התקלה מחדש אוטומטית — הוא מרים דגל וההחלטה נשארת אנושית', PERM_GARDEN, 'כן'],
  ['ADMIN_GARDEN_TASK_BLOCKED', 'צוות הגינון סימן משימה כלא ניתנת לביצוע',
    "צוות הגינון סימן שאי אפשר לבצע את משימה מס' {{מזהה}} — {{כותרת}}.\n\n" +
    "הסיבה שנרשמה: {{סיבה}}\n\nהמשימה סומנה \"דורש בדיקה בשטח\" ונשארה פתוחה. " +
    "סגירה או העברה לבינוי הן החלטה שלך בלבד.",
    'למנהלי גינון + מנהל-על. הצוות לא סוגר משימות — הוא מרים דגל, וההחלטה נשארת אנושית',
    PERM_GARDEN, 'כן'],
  ['ADMIN_GARDEN_WEEKLY', 'סיכום שבועי — גינון',
    'הנה סיכום שבוע העבודה של הגינון:', 'למנהלי גינון + מנהל-על, ביום RULE_GARDEN_WEEKLY_DAY. מופק תמיד, גם אם נשארו משימות שממתינות לאישור — הן מופיעות בתוכו כשורה משלהן', PERM_GARDEN, 'כן'],

  ['ADMIN_STALE_SIGNUP', 'בקשת הרשמה ממתינה כבר {{ימים}} ימים',
    'בקשת ההרשמה של {{שם}} ({{אימייל}}) ממתינה לטיפול כבר {{ימים}} ימים.', 'תזכורת חד-פעמית כשבקשה חוצה את הסף (ר\' RULE_STALE_DAYS)', PERM_RESIDENTS, 'כן'],
  ['ADMIN_STALE_REIMBURSEMENT', 'בקשת החזר ממתינה כבר {{ימים}} ימים',
    "בקשת ההחזר של {{שם}} על סך {{סכום}} ₪ (מס' {{מזהה}}) ממתינה לטיפול כבר {{ימים}} ימים.", 'תזכורת חד-פעמית כשבקשה חוצה את הסף', PERM_BUDGET, 'כן'],
  ['ADMIN_STALE_CLUB', 'בקשת שריון מועדון ממתינה כבר {{ימים}} ימים',
    'בקשת השריון של {{שם}} בתאריך {{תאריך}} ממתינה לטיפול כבר {{ימים}} ימים.', 'תזכורת חד-פעמית כשבקשה חוצה את הסף', PERM_CLUB, 'כן'],

  // "שירותים לתושב" (2026-08-18) — התבנית היחידה במערכת שנשלחת **ידנית בלבד**:
  // אין שום טריגר אוטומטי שקורא לה. מנהל-על לוחץ "עדכון תושבים" במסך עריכת
  // השירות, וזה מה שמפעיל אותה (ר' notifyServiceUpdate_). הוחלט כך במפורש —
  // שליחה בכל שמירה הייתה גורמת לתיקון פסיק לשלוח מייל לכל השיכון.
  ['SERVICE_UPDATED', 'עדכון בשירות {{שם השירות}}',
    'שלום,\n\nפרטי השירות {{שם השירות}} ({{ספק}}) עודכנו באפליקציית השיכון.\n\nמה השתנה: {{מה השתנה}}\n\nאת כל הפרטים — תנאי השירות, מחירון ואנשי קשר — אפשר לראות במסך "שירותים" באפליקציה.\n\nבברכה,\nועד הקהילה',
    'נשלח לכל תושבי השיכון רק כשמנהל-על לוחץ ידנית על "עדכון תושבים" במסך עריכת שירות — אף פעם לא אוטומטית. הכפתור לאפליקציה מתווסף אוטומטית בעיצוב',
    PERM_SUPER, 'כן'],

  ['GYM_APPLICATION_RECEIVED', 'קיבלנו את בקשת ההרשמה שלך למכון הכושר',
    'שלום {{שם}},\n\nקיבלנו את בקשת ההרשמה שלך למכון הכושר. נעדכן אותך בכל שינוי, ואפשר לעקוב אחרי הסטטוס גם במסך "מכון כושר" באפליקציה.\n\nבברכה,\nועד הקהילה',
    'נשלח לתושב מיד עם שליחת טופס ההרשמה למכון', PERM_GYM, 'כן'],
  ['GYM_APPROVED_AWAITING_PAYMENT', 'ההרשמה למכון אושרה — נשאר להסדיר תשלום',
    'שלום {{שם}},\n\nההרשמה שלך למכון הכושר אושרה. כדי להפעיל את המנוי יש להסדיר תשלום של {{סכום}} ₪ עבור {{מסלול}}.\n\nאת פרטי התשלום אפשר לראות במסך "מכון כושר" באפליקציה.\n\nבברכה,\nועד הקהילה',
    'נשלח כשהבקשה מאושרת (אוטומטית כשאין דגלי בריאות, או ידנית ע"י מנהל המכון)', PERM_GYM, 'כן'],
  ['GYM_DOCTOR_NOTE_REQUIRED', 'נדרש אישור רופא להשלמת ההרשמה למכון',
    'שלום {{שם}},\n\nבהצהרת הבריאות שמילאת סימנת "כן" באחת מהשאלות ({{שאלות}}), ולכן לפי תקנון המכון נדרשת תעודה רפואית מרופא המאשרת שאין סיכון לבריאותך באימון במכון כושר.\n\nחשוב: המכון יכול לקבל רק אישור שלא עברו 3 חודשים ממועד הנפקתו. את האישור יש להעביר לאחראית חדר הכושר בשיכון.\n\nבברכה,\nועד הקהילה',
    'נשלח אוטומטית כשתושב עונה "כן" על שאלה המסומנת כדגל חוסם', PERM_GYM, 'כן'],
  ['GYM_DECLARATION_REQUEST', 'נדרשת הצהרת בריאות למנוי במכון הכושר',
    'שלום {{שם}},\n\nנפתח עבורך מנוי במכון הכושר, ונשאר רק למלא הצהרת בריאות וחתימה — זה לוקח דקה. נכנסים לאפליקציה, בוחרים "מתקנים" ואז "מכון כושר".\n\nבברכה,\nועד הקהילה',
    'נשלח כשמנהל המכון מקים מנוי ידנית ומבקש מהתושב למלא הצהרה, או לוחץ "בקשת הצהרה" על מנוי קיים', PERM_GYM, 'כן'],

  ['GYM_PAYMENT_REPORTED', 'קיבלנו את דיווח התשלום שלך',
    'שלום {{שם}},\n\nקיבלנו את הדיווח על תשלום {{סכום}} ₪ עבור המנוי במכון הכושר. הדיווח ממתין לאימות מול הוועד, ונעדכן אותך ברגע שהמנוי יופעל.\n\nבברכה,\nועד הקהילה',
    'נשלח לתושב מיד עם דיווח התשלום', PERM_GYM, 'כן'],
  ['GYM_ACTIVE', 'המנוי שלך במכון הכושר פעיל',
    'שלום {{שם}},\n\nהתשלום אומת והמנוי שלך במכון הכושר פעיל — בתוקף עד {{תוקף}}.\n\nקוד הכניסה למכון מחכה לך במסך "מכון כושר" באפליקציה. לפי התקנון אין להעביר אותו לאחרים.\n\nאימונים נעימים,\nועד הקהילה',
    'נשלח כשמנהל/ת המכון מאמת/ת את התשלום. שים לב: הקוד עצמו לא נשלח במייל בכוונה', PERM_GYM, 'כן'],
  ['GYM_PAYMENT_NOT_FOUND', 'לא איתרנו את התשלום למכון הכושר',
    'שלום {{שם}},\n\nבדקנו ולא הצלחנו לאתר את התשלום שדיווחת עליו.{{הערה}}\n\nאפשר לבדוק שוב ולדווח מחדש במסך "מכון כושר" באפליקציה, או לפנות לאחראית חדר הכושר.\n\nבברכה,\nועד הקהילה',
    'נשלח כשמנהל/ת המכון לוחץ/ת "לא נמצא תשלום" — {{הערה}} מכיל את הערת המנהל אם נכתבה', PERM_GYM, 'כן'],
  ['GYM_EXTENDED', 'תוקף המנוי שלך במכון הכושר עודכן',
    'שלום {{שם}},\n\nתוקף המנוי שלך במכון הכושר עודכן והוא בתוקף עד {{תוקף}}.\n\nבברכה,\nועד הקהילה',
    'נשלח כשמנהל/ת המכון מאריך/ה מנוי קיים', PERM_GYM, 'כן'],

  ['GYM_EXPIRY_REMINDER', 'המנוי שלך במכון הכושר עומד להסתיים',
    'שלום {{שם}},\n\nהמנוי שלך במכון הכושר בתוקף עד {{תוקף}} — עוד {{ימים}} ימים.\n\nכדי להמשיך להתאמן ברצף אפשר לחדש כבר עכשיו במסך "מכון כושר" באפליקציה. אם הצהרת הבריאות שלך עדיין בתוקף, החידוש הוא שתי לחיצות.\n\nבברכה,\nועד הקהילה',
    'נשלח X ימים לפני סיום המנוי (ר\' RULE_GYM_RENEW_DAYS_BEFORE)', PERM_GYM, 'כן'],
  ['GYM_EXPIRED', 'המנוי שלך במכון הכושר הסתיים',
    'שלום {{שם}},\n\nהמנוי שלך במכון הכושר הסתיים ב-{{תוקף}}, וקוד הכניסה כבר אינו פעיל עבורך.\n\nאפשר לחדש בכל רגע במסך "מכון כושר" באפליקציה.\n\nבברכה,\nועד הקהילה',
    'נשלח ביום שבו המנוי פג. הסטטוס בגיליון משתנה אוטומטית ל"פג תוקף"', PERM_GYM, 'כן'],
  ['GYM_PAYMENT_NUDGE', 'תזכורת: נשאר להסדיר את התשלום למכון הכושר',
    'שלום {{שם}},\n\nההרשמה שלך למכון אושרה, ועדיין לא נקלט תשלום. הסכום הוא {{סכום}} ₪.\n\nאת פרטי התשלום והדיווח עליו אפשר למצוא במסך "מכון כושר" באפליקציה.\n\nבברכה,\nועד הקהילה',
    'תזכורת חד-פעמית אחרי X ימים בסטטוס "ממתין לתשלום"', PERM_GYM, 'כן'],
  ['GYM_DECLARATION_EXPIRING', 'הצהרת הבריאות שלך למכון עומדת לפוג',
    'שלום {{שם}},\n\nהצהרת הבריאות שחתמת עליה תקפה עד {{תוקף}}. אחרי התאריך הזה, חידוש המנוי יחייב מילוי הצהרה חדשה — זה לוקח כמה דקות במסך "מכון כושר".\n\nבברכה,\nועד הקהילה',
    'נשלח X ימים לפני שההצהרה חוצה את השנתיים', PERM_GYM, 'כן'],

  ['GYM_CANCELLED', 'המנוי שלך במכון הכושר בוטל',
    'שלום {{שם}},\n\nהמנוי שלך במכון הכושר בוטל.{{הערה}}\n\nלשאלות אפשר לפנות לאחראית חדר הכושר.\n\nבברכה,\nועד הקהילה',
    'נשלח כשמנהל/ת המכון מבטל/ת מנוי — {{הערה}} מכיל את הסיבה אם נכתבה', PERM_GYM, 'כן'],
  ['GYM_REJECTED', 'עדכון לגבי בקשתך למכון הכושר',
    'שלום {{שם}},\n\nלצערנו הבקשה שלך למכון הכושר לא אושרה.{{הערה}}\n\nלשאלות אפשר לפנות לאחראית חדר הכושר.\n\nבברכה,\nועד הקהילה',
    'נשלח כשמנהל/ת המכון דוחה בקשה', PERM_GYM, 'כן'],

  ['ADMIN_STALE_GYM', 'בקשת מכון ממתינה כבר {{ימים}} ימים',
    'הבקשה של {{שם}} במכון הכושר ממתינה לטיפול כבר {{ימים}} ימים (סטטוס: {{סטטוס}}).',
    'למנהלי מכון + מנהל-על. תזכורת חד-פעמית כשבקשה חוצה את הסף', PERM_GYM, 'כן'],

  ['ADMIN_GYM_PAYMENT_REPORTED', 'תושב דיווח על תשלום למכון — ממתין לאימות',
    '{{שם}} דיווח/ה על תשלום {{סכום}} ₪ עבור המנוי במכון (מס\' {{מזהה}}).\n\nאמצעי: {{אמצעי}} · אסמכתא: {{אסמכתא}}\n\nהדיווח ממתין לאימות שלך באפליקציה.',
    'למנהלי מכון + מנהל-על', PERM_GYM, 'כן'],

  ['ADMIN_NEW_GYM_FLAGGED', 'בקשת הרשמה למכון עם דגל בריאות ממתינה',
    'התקבלה בקשת הרשמה למכון הכושר מ-{{שם}} ({{אימייל}}) עם דגל בריאות: {{שאלות}}.\n\nהבקשה ממתינה לאישור רופא ולאישורך.',
    'למנהלי מכון + מנהל-על. שים לב: בקשה נקייה (כל התשובות "לא") מאושרת אוטומטית ולא שולחת מייל למנהל', PERM_GYM, 'כן'],

  ['ADMIN_WEEKLY_DIGEST', 'סיכום שבועי — מה פתוח באפליקציית הוועד',
    'הנה סיכום כל מה שממתין לטיפול השבוע:', 'נשלח ביום RULE_WEEKLY_DAY, לכל מנהל רק הסעיפים שבהרשאתו — חוצה מידורים ולכן שייך למנהל-על', PERM_SUPER, 'כן'],
  ['ADMIN_MONTHLY_DIGEST', 'תזכורת: בקשות החזר פתוחות לפני סגירת החלון ב-19 לחודש',
    'תזכורת — עוד מעט נסגר חלון ההחזרים החודשי (ה-19 לחודש). הנה כל בקשות ההחזר שעדיין פתוחות:', 'נשלח ביום RULE_MONTHLY_DAY, למנהלי תקציב + מנהל-על בלבד', PERM_BUDGET, 'כן']
];

/** יוצר את גיליון ההגדרות אם אינו קיים, וממלא רק מפתחות/עמודות חסרים — לא נוגע
 * בערך שכבר קיים. זו התשתית ל"עריכה ממסך מנהל" שיועד ביקש: מסך "ניהול מיילים"
 * באפליקציה (שלב 1, 2026-08-18) קורא/כותב לאותו גיליון בדיוק, בלי שינוי מבנה —
 * ועדיין אפשר לערוך הכול ישירות בגיליון גם בלי המסך.
 * מיגרציה (2026-08-18): גיליונות שנוצרו לפני שנוספו העמודות "תחום"/"פעיל"
 * מקבלים אותן אוטומטית, ורק תאים ריקים מתמלאים בברירת המחדל — עריכה ידנית
 * קיימת (אם מישהו כבר מילא תחום/פעיל בעצמו) לעולם לא נדרסת. */
function ensureEmailSettingsSheet_(ss) {
  var sh = ss.getSheetByName(EMAIL_SETTINGS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(EMAIL_SETTINGS_SHEET);
    sh.getRange(1, 1, 1, 6).setValues([['מפתח', 'נושא', 'תוכן', 'הערה', 'תחום', 'פעיל']]);
    sh.getRange(1, 1, 1, 6).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 260); sh.setColumnWidth(3, 420); sh.setColumnWidth(4, 300);
    sh.setColumnWidth(5, 90); sh.setColumnWidth(6, 70);
  } else if (sh.getLastColumn() < 6) {
    if (sh.getLastColumn() < 5) sh.getRange(1, 5).setValue('תחום');
    sh.getRange(1, 6).setValue('פעיל');
    sh.getRange(1, 1, 1, 6).setFontWeight('bold');
    sh.setColumnWidth(5, 90); sh.setColumnWidth(6, 70);
  }

  var values = sh.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < values.length; r++) { var k = String(values[r][0]).trim(); if (k) existing[k] = true; }
  var toAdd = DEFAULT_EMAIL_SETTINGS.filter(function (row) { return !existing[row[0]]; });
  if (toAdd.length) {
    /* הקשחה (2026-08-20, אחרי תקלה אמיתית): setValues דורש מערך מלבני מדויק.
     * כשנוספו תבניות המכון הן נכתבו עם 4 שדות בלבד — בלי "תחום"/"פעיל" שנוספו
     * למערכת יום קודם — וכל קריאה ל-ensureEmailSettingsSheet_ זרקה שגיאה.
     * מכיוון ש-getEmailSettings_ נשען עליה, **כל המיילים במערכת הפסיקו להישלח
     * בשקט** (הקריאות עטופות ב-try/catch, אז אף אחד לא ראה שגיאה).
     * מכאן: מיישרים כל שורה ל-6 עמודות לפני הכתיבה, כך ששורה חסרה תיכתב
     * חלקית במקום להשבית את כל מערכת המיילים. */
    var normalized = toAdd.map(function (row) {
      var r = row.slice(0, 6);
      while (r.length < 6) r.push('');
      if (!r[5]) r[5] = 'כן';
      return r;
    });
    sh.getRange(sh.getLastRow() + 1, 1, normalized.length, 6).setValues(normalized);
  }

  // מילוי "תחום"/"פעיל" לשורות ישנות (או לשורה חדשה שמישהו הוסיף ידנית בלי
  // למלא את שתי העמודות האלה) — נוגע רק בתאים ריקים.
  var domainByKey = {};
  DEFAULT_EMAIL_SETTINGS.forEach(function (row) { domainByKey[row[0]] = row[4]; });
  values = sh.getDataRange().getValues();
  for (var r2 = 1; r2 < values.length; r2++) {
    var key2 = String(values[r2][0]).trim();
    if (!key2) continue;
    var domainCell = values[r2][4], activeCell = values[r2][5];
    if (domainCell === '' || domainCell === undefined) sh.getRange(r2 + 1, 5).setValue(domainByKey[key2] || PERM_SUPER);
    if (activeCell === '' || activeCell === undefined) sh.getRange(r2 + 1, 6).setValue('כן');
  }
  return sh;
}

/** קורא את גיליון ההגדרות למפה {מפתח: {subject, body, note, domain, active}}.
 * נקרא מחדש מהגיליון בכל הרצה (בלי קאש) כדי שעריכה ידנית של יועד — או עריכה
 * ממסך "ניהול מיילים" — תיכנס לתוקף מיד, בלי לחכות לפריסה. */
function getEmailSettings_(ss) {
  var sh = ensureEmailSettingsSheet_(ss);
  var values = sh.getDataRange().getValues();
  var map = {};
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    if (!k) continue;
    map[k] = {
      subject: String(values[r][1] || ''), body: String(values[r][2] || ''),
      note: String(values[r][3] || ''), domain: String(values[r][4] || PERM_SUPER).trim(),
      active: String(values[r][5] || 'כן').trim() !== 'לא'
    };
  }
  return map;
}

/** האם מותר לשלוח מייל לפי מפתח נתון כרגע: המתג הראשי (MASTER_ENABLED) דלוק,
 * וגם התבנית הספציפית הזו מסומנת פעילה. משמש את כל שלושת ערוצי השליחה
 * (sendResidentTemplate_/notifyAdmins_/sendDigestBySection_) — כשמושבת, שום
 * דבר אחר לא נכשל: הפעולה עצמה (שמירת תנועה/אישור שריון וכו') ממשיכה כרגיל,
 * רק המייל לא נשלח. */
function emailEnabled_(settings, key) {
  var master = settings['MASTER_ENABLED'];
  if (master && master.active === false) return false;
  var t = settings[key];
  if (t && t.active === false) return false;
  return true;
}

/** ערך חוק בודד (RULE_...) כמספר, עם נפילה לברירת מחדל אם חסר/לא מספרי. */
function emailRule_(settings, key, fallback) {
  var n = Number(settings[key] && settings[key].body);
  return isNaN(n) ? fallback : n;
}

/** מחליף {{placeholder}} בטקסט התבנית בערך בפועל מתוך vars. */
function renderTemplate_(str, vars) {
  return String(str || '').replace(/\{\{(.+?)\}\}/g, function (_, key) {
    var v = vars[key.trim()];
    return (v === undefined || v === null) ? '' : String(v);
  });
}

/** בורח מתווי HTML מיוחדים — כדי שערך חופשי (שם תושב, הערת בדיקה וכו') שהוזן
 * במקום כלשהו ומוזרק לתוך תבנית המייל לא ישבור את מבנה ה-HTML של המייל. */
function escapeHtml_(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** עוטף טקסט מייל פשוט (כפי שנשמר בטאב "הגדרות מיילים", עם \n כירידת שורה) בעיצוב
 * HTML נקי ומודרני, מותאם עברית (dir="rtl", גופן עברי סטנדרטי בתוכנות מייל),
 * ותואם את שפת העיצוב של האפליקציה עצמה (ר' [[cba-design-system]]): הרבה שטח
 * לבן, כרטיסייה עם הצללה עדינה, כפתור שחור מלא ל-CTA במקום קישור כחול גולמי.
 * הטקסט במקור נשאר טקסט-פשוט בגיליון בכוונה — כל העיצוב קורה כאן בקוד, כדי
 * שיועד ימשיך לערוך נוסח בלי לגעת ב-HTML בכלל.
 * accent: 'emerald' (ברירת מחדל — עדכון חיובי/ניטרלי) | 'rose' (דחייה) |
 * 'neutral' (התראות מנהל — מידע, לא סטטוס). פס צבע דק בראש הכרטיסייה בלבד —
 * שימוש מדוד בצבע, כמו בשאר האפליקציה. */
function buildEmailHtml_(bodyText, ctaUrl, ctaLabel, accent) {
  var ACCENTS = { emerald: '#059669', rose: '#e11d48', neutral: '#111827' };
  var accentColor = ACCENTS[accent] || ACCENTS.emerald;
  var paragraphs = String(bodyText || '').split(/\n{2,}/).map(function (p) {
    return '<p style="margin:0 0 14px;">' + escapeHtml_(p).replace(/\n/g, '<br>') + '</p>';
  }).join('');
  var button = ctaUrl ? (
    '<div style="text-align:center;margin-top:24px;">' +
      '<a href="' + ctaUrl + '" style="display:inline-block;background:#111827;color:#ffffff;' +
      'text-decoration:none;font-weight:600;font-size:14px;padding:12px 30px;border-radius:10px;">' +
      escapeHtml_(ctaLabel || 'פתיחת האפליקציה') + '</a></div>'
  ) : '';
  return '' +
    '<div dir="rtl" style="background:#f8fafc;padding:32px 12px;' +
    "font-family:'Segoe UI',Tahoma,Arial,sans-serif;" + '">' +
      '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;' +
      'box-shadow:0 4px 24px rgba(17,24,39,.08);overflow:hidden;">' +
        '<div style="height:4px;background:' + accentColor + ';"></div>' +
        '<div style="padding:30px 32px;">' +
          '<div style="font-size:12px;letter-spacing:.03em;color:#9ca3af;margin-bottom:18px;">ועד הקהילה</div>' +
          '<div style="font-size:15px;color:#111827;line-height:1.75;">' + paragraphs + '</div>' +
          button +
        '</div>' +
      '</div>' +
      '<div style="max-width:480px;margin:14px auto 0;text-align:center;font-size:11px;color:#9ca3af;">' +
        'מייל אוטומטי מאפליקציית ניהול התקציב של הוועד' +
      '</div>' +
    '</div>';
}

/** שולח מייל בודד — לעולם לא זורק שגיאה החוצה, כדי ששליחת מייל כושלת לא תפיל
 * שום פעולה אחרת (שמירת קבלה/שריון/הרשמה). שגיאות נרשמות ל-Logger בלבד.
 * plainBody הוא הגיבוי לתוכנות מייל שלא מציגות HTML; htmlBody הוא מה שרוב
 * הנמענים בפועל יראו. */
function sendMail_(toList, subject, plainBody, htmlBody) {
  var to = (toList || []).filter(Boolean);
  if (!to.length || !subject) return;
  try {
    var opts = { to: to.join(','), subject: subject, body: plainBody };
    if (htmlBody) opts.htmlBody = htmlBody;
    MailApp.sendEmail(opts);
  } catch (err) {
    Logger.log('שליחת מייל נכשלה אל ' + to.join(',') + ': ' + err);
  }
}

/** שולח לתושב לפי מפתח תבנית מהגדרות + placeholders, לרשימת כתובות (בד"כ שני
 * המיילים של משק הבית ביחד — ר' emailsForResidentRow_/emailsForFamilyId_).
 * אדום (rose) אוטומטית לכל תבנית שהמפתח שלה מסתיים ב-REJECTED, ירוק (emerald)
 * לכל השאר — בלי צורך לסמן את זה ידנית בכל קריאה. */
function sendResidentTemplate_(ss, key, emails, vars) {
  var settings = getEmailSettings_(ss);
  if (!emailEnabled_(settings, key)) return;
  var t = settings[key];
  if (!t) return;
  var plain = renderTemplate_(t.body, vars);
  var accent = key.indexOf('REJECTED') !== -1 ? 'rose' : 'emerald';
  var html = buildEmailHtml_(plain, CBA_APP_URL, 'פתיחת האפליקציה', accent);
  sendMail_(emails, renderTemplate_(t.subject, vars), plain + '\n\n' + CBA_APP_URL, html);
}

/** שני האימיילים (אם קיימים) של שורת תושב נתונה בטאב "תושבים". */
function emailsForResidentRow_(rsh, rowIndex) {
  var headers = rsh.getRange(1, 1, 1, rsh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var emailCols = [];
  headers.forEach(function (h, i) { if (h.indexOf('אימייל') !== -1) emailCols.push(i); });
  if (!emailCols.length || rowIndex < 2) return [];
  var row = rsh.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  return emailCols.map(function (c) { return String(row[c] || '').trim(); }).filter(Boolean);
}

/** מאתר שורת משק בית לפי "מזהה קבוע" (עם נפילה למספר בית אם עדיין אין מזהה קבוע
 * — אותה לוגיקה בדיוק כמו lookupResident_/saveTransaction_), ומחזיר את מיילי השורה. */
function emailsForFamilyId_(ss, familyId) {
  if (!familyId) return [];
  var rsh = ss.getSheetByName('תושבים');
  if (!rsh) return [];
  var values = rsh.getDataRange().getValues();
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var idCol = -1, houseCol = -1;
  headers.forEach(function (h, i) {
    if (h.indexOf(RESIDENT_ID_HEADER) !== -1) idCol = i;
    else if (h.indexOf('בית') !== -1 && houseCol === -1) houseCol = i;
  });
  for (var r = 1; r < values.length; r++) {
    var idVal = idCol > -1 ? String(values[r][idCol]).trim() : '';
    var houseVal = houseCol > -1 ? String(values[r][houseCol]).trim() : '';
    if ((idVal && idVal === String(familyId)) || (!idVal && houseVal === String(familyId))) {
      return emailsForResidentRow_(rsh, r + 1);
    }
  }
  return [];
}

/** כל כתובות המייל של תושבים פעילים בעלי הרשאה נתונה (או מנהל-על) — אותה לוגיקת
 * "משבצת אימייל + הרשאות N לפי סדר, עם נפילה לעמודת 'תפקיד' הישנה" כמו ב-
 * permissionsFor_/lookupResident_, רק שסורקת את כל הטאב במקום אימייל בודד. */
function adminEmailsByPerm_(ss, permKey) {
  var rsh = ss.getSheetByName('תושבים');
  if (!rsh) return [];
  var values = rsh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var emailCols = [], permCols = [], roleCol = -1, statusCol = -1;
  headers.forEach(function (h, i) {
    if (h.indexOf(PERM_HEADER) !== -1) permCols.push(i);
    else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    else if (h.indexOf('תפקיד') !== -1) roleCol = i;
    else if (h.indexOf('סטטוס') !== -1) statusCol = i;
  });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var active = !(statusCol > -1 && String(row[statusCol]).indexOf('פעיל') === -1);
    if (!active) continue;
    var role = roleCol > -1 ? String(row[roleCol]).trim() : '';
    for (var c = 0; c < emailCols.length; c++) {
      var email = String(row[emailCols[c]] || '').trim();
      if (!email) continue;
      var perms = parsePerms_(permCols[c] !== undefined ? row[permCols[c]] : '');
      if (!perms.length && role.indexOf('מנהל') !== -1) perms = [PERM_SUPER];
      if (perms.indexOf(PERM_SUPER) !== -1 || perms.indexOf(permKey) !== -1) out.push(email);
    }
  }
  return out.filter(function (e, i, a) { return a.indexOf(e) === i; }); // ייחוד
}

/** שולח מייל למנהלים לפי תבנית + מידור הרשאה, ללא כפילויות. */
function notifyAdmins_(ss, permKey, key, vars) {
  var settings = getEmailSettings_(ss);
  if (!emailEnabled_(settings, key)) return;
  var emails = adminEmailsByPerm_(ss, permKey);
  if (!emails.length) return;
  var t = settings[key];
  if (!t) return;
  var plain = renderTemplate_(t.body, vars);
  var linkUrl = (vars && vars['קישור']) || CBA_APP_URL;
  var html = buildEmailHtml_(plain, linkUrl, 'לטיפול באפליקציה', 'neutral');
  sendMail_(emails, renderTemplate_(t.subject, vars), plain + '\n\n' + CBA_APP_URL, html);
}

/* ============================================================================
 *  מסך "ניהול מיילים" — שלב 1 (2026-08-18)
 * ----------------------------------------------------------------------------
 *  קריאה/עריכה של אותו גיליון "הגדרות מיילים" שהמייל-אנג'ין קורא ממנו ישירות
 *  (getEmailSettings_) — אין טבלת מקור נוספת, אין קאש, אז שינוי במסך נכנס
 *  לתוקף באותה שנייה, בדיוק כמו עריכה ידנית בגיליון.
 *  מידור: מנהל-על רואה/עורך הכול. מנהל תחום (תקציב/מועדון/תושבים) רואה/עורך
 *  רק שורות ש"תחום" שלהן הוא התחום שלו — שורות "תחום"=מנהל-על (כללים גלובליים,
 *  המתג הראשי, הסיכום השבועי) מוסתרות ממנו לגמרי, לא רק נעולות לעריכה.
 * ========================================================================== */
/** רשימת כל הגדרות המייל שהמבקש רשאי לראות (מסונן לפי הרשאה), למסך "ניהול מיילים". */
function handleListEmailSettings_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_ANY_ADMIN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var isSuper = gate.perm.isSuper;
    var perms = gate.perm.perms || [];
    var sh = ensureEmailSettingsSheet_(ss);
    var values = sh.getDataRange().getValues();
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var key = String(values[r][0]).trim();
      if (!key) continue;
      var domain = String(values[r][4] || PERM_SUPER).trim();
      var canSee = isSuper || (domain !== PERM_SUPER && perms.indexOf(domain) !== -1);
      if (!canSee) continue;
      rows.push({
        key: key, subject: String(values[r][1] || ''), body: String(values[r][2] || ''),
        note: String(values[r][3] || ''), domain: domain,
        active: String(values[r][5] || 'כן').trim() !== 'לא'
      });
    }
    return json_({ ok: true, rows: rows, isSuper: isSuper, perms: perms });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** שמירת שדה/שדות של הגדרת מייל בודדת (נושא/תוכן/פעיל), עם בדיקת הרשאה לפי
 * "תחום" השורה בפועל בגיליון (לא לפי מה שהלקוח טוען) — כדי שמנהל תחום לא יוכל
 * לערוך שורה של תחום אחר גם אם ניסה לזייף בקשה ידנית. */
function saveEmailSetting_(ss, body) {
  var key = String(body.key || '').trim();
  if (!key) return { ok: false, error: 'חסר מפתח' };
  var sh = ensureEmailSettingsSheet_(ss);
  var values = sh.getDataRange().getValues();
  var rowIdx = -1, domain = PERM_SUPER;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === key) { rowIdx = r + 1; domain = String(values[r][4] || PERM_SUPER).trim(); break; }
  }
  if (rowIdx === -1) return { ok: false, error: 'מפתח לא נמצא: ' + key };
  var perm = body._perm || {};
  var allowed = perm.isSuper || (domain !== PERM_SUPER && (perm.perms || []).indexOf(domain) !== -1);
  if (!allowed) return { ok: false, error: 'אין לך הרשאה לערוך הגדרה זו' };
  var fields = body.fields || {};
  if (fields.subject !== undefined) sh.getRange(rowIdx, 2).setValue(String(fields.subject));
  if (fields.body !== undefined) sh.getRange(rowIdx, 3).setValue(String(fields.body));
  if (fields.active !== undefined) sh.getRange(rowIdx, 6).setValue(fields.active ? 'כן' : 'לא');
  return { ok: true };
}

/* ============================================================================
 *  משימה יומית מתוזמנת — תזכורת מועדון, תזכורת "ממתין הרבה זמן", סיכום שבועי,
 *  סיכום חודשי (17 לחודש)
 * ----------------------------------------------------------------------------
 *  installDailyEmailTrigger() צריך להיות מורץ **פעם אחת בלבד**, ידנית, מתוך
 *  עורך ה-Apps Script (בוחרים אותה בתפריט הפונקציות למעלה ולוחצים Run). בלי זה
 *  dailyEmailJobs_ לא ירוץ מעצמו בכלל.
 * ========================================================================== */
/** בדיקת אבחון ידנית (2026-08-09): שולחת מייל בדיקה פשוט אליך עצמך, בלי שום
 * try/catch שמבליע שגיאות — בניגוד לכל שאר הפונקציות במודול הזה, שמתעלמות
 * בכוונה משגיאת מייל כדי לא להפיל פעולה אחרת. מריצים ידנית מהעורך (בוחרים
 * testSendMail מהתפריט למעלה ולוחצים Run) כדי לוודא שהרשאת השליחה בכלל תקינה —
 * אם משהו לא בסדר (למשל הרשאה שלא אושרה), השגיאה האמיתית תופיע כאן במקום
 * להישרף בשקט ב-Logger. הרצה ראשונה עשויה לבקש ממך לאשר הרשאות — מאשרים.
 */
function testSendMail() {
  var to = Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: to, subject: 'בדיקת מייל מאפליקציית הוועד', body: 'אם זה הגיע — שליחת המיילים עובדת תקין.' });
  Logger.log('✓ מייל בדיקה נשלח אל ' + to);
}

function installDailyEmailTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'dailyEmailJobs_') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyEmailJobs_').timeBased().everyDays(1).atHour(8).create();
  Logger.log('✓ טריגר יומי הותקן — ירוץ כל בוקר סביב השעה 08:00');
}

function dailyEmailJobs_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { clubReminderJob_(ss); } catch (e) { Logger.log('clubReminderJob_ נכשל: ' + e); }
  try { staleNudgeJob_(ss); } catch (e) { Logger.log('staleNudgeJob_ נכשל: ' + e); }
  try { gymDailyJob_(ss); } catch (e) { Logger.log('gymDailyJob_ נכשל: ' + e); }
  try { weeklyDigestJob_(ss); } catch (e) { Logger.log('weeklyDigestJob_ נכשל: ' + e); }
  try { monthlyDigestJob_(ss); } catch (e) { Logger.log('monthlyDigestJob_ נכשל: ' + e); }
}

/* ============================================================================
 *  מכון כושר — שלב 5: אוטומציות יומיות (2026-08-20)
 * ----------------------------------------------------------------------------
 *  רץ פעם ביום מתוך dailyEmailJobs_. חמש משימות, כולן על אותה סריקה אחת של
 *  הטאב — לא חמש קריאות נפרדות לגיליון.
 *
 *  שתי החלטות תכנוניות:
 *  • רוב הבדיקות הן "בדיוק N ימים" ולא "N ימים ומעלה" — כך הן חד-פעמיות
 *    מעצמן ואין צורך לסמן "כבר נשלח" (אותה תבנית כמו clubReminderJob_).
 *  • סימון מנויים שפגו כותב את עמודת הסטטוס **בכתיבה אחת מרוכזת** בסוף,
 *    ולא תא-תא. ר' הלקח ב-gymRowWriter_.
 * ========================================================================== */
function gymDailyJob_(ss) {
  var sh = ss.getSheetByName(GYM_SHEET);
  if (!sh || sh.getLastRow() < 2) return;

  var settings = getEmailSettings_(ss);
  var renewDays = emailRule_(settings, 'RULE_GYM_RENEW_DAYS_BEFORE', 14);
  var nudgeDays = emailRule_(settings, 'RULE_GYM_PAYMENT_NUDGE_DAYS', 5);
  var declWarn  = emailRule_(settings, 'RULE_GYM_DECL_WARN_DAYS', 30);
  var staleDays = emailRule_(settings, 'RULE_STALE_DAYS', 3);

  var cfg = readGymSettings_(ss);
  var declMonths = Number(cfg.settings['תוקף הצהרה בחודשים']) || 24;

  var tz = Session.getScriptTimeZone();
  var today = new Date(); today.setHours(0, 0, 0, 0);
  function daysBetween_(from, to) { return Math.round((to - from) / 86400000); }

  var cols = gymCols_(sh);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  function cell(row, name) { return cols[name] ? row[cols[name] - 1] : ''; }

  var statusCol = cols['סטטוס'];
  var statusUpdates = [];   // {rowIndex, value} — נכתבות יחד בסוף

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(cell(row, 'מזהה')).trim();
    if (!id) continue;
    var status = String(cell(row, 'סטטוס')).trim();
    var email = String(cell(row, 'אימייל')).trim();
    if (!email) continue;
    var name = String(cell(row, 'שם פרטי')).trim() || email;

    var until = gymToDate_(cell(row, 'בתוקף עד'));
    if (until) until.setHours(0, 0, 0, 0);

    /* 1. מנוי שפג — סימון סטטוס + הודעה. מרגע זה קוד הכניסה מפסיק לצאת
       ללקוח (handleGymMy_ בודק גם סטטוס וגם תאריך). */
    if (status === GYM_ST_ACTIVE && until && until < today) {
      statusUpdates.push({ r: i, v: GYM_ST_EXPIRED });
      try {
        sendResidentTemplate_(ss, 'GYM_EXPIRED', [email], {
          'שם': name, 'תוקף': Utilities.formatDate(until, tz, 'dd/MM/yyyy')
        });
      } catch (e) { Logger.log('GYM_EXPIRED נכשל: ' + e); }
      continue;   // אין טעם גם להזכיר חידוש באותו יום
    }

    /* 2. תזכורת חידוש — בדיוק N ימים לפני הסוף */
    if (status === GYM_ST_ACTIVE && until && daysBetween_(today, until) === renewDays) {
      try {
        sendResidentTemplate_(ss, 'GYM_EXPIRY_REMINDER', [email], {
          'שם': name, 'תוקף': Utilities.formatDate(until, tz, 'dd/MM/yyyy'), 'ימים': renewDays
        });
      } catch (e) { Logger.log('GYM_EXPIRY_REMINDER נכשל: ' + e); }
    }

    /* 3. נודניק תשלום — בדיוק N ימים אחרי ההגשה, ורק אם עדיין לא שולם */
    if (status === GYM_ST_PAYMENT) {
      var submitted = gymToDate_(cell(row, 'הוגש בתאריך'));
      if (submitted) {
        submitted.setHours(0, 0, 0, 0);
        if (daysBetween_(submitted, today) === nudgeDays) {
          try {
            sendResidentTemplate_(ss, 'GYM_PAYMENT_NUDGE', [email], {
              'שם': name, 'סכום': cell(row, 'מחיר מוסכם')
            });
          } catch (e) { Logger.log('GYM_PAYMENT_NUDGE נכשל: ' + e); }
        }
      }
    }

    /* 4. הצהרת בריאות שעומדת לפוג — רלוונטי רק למנוי חי */
    var signed = gymToDate_(cell(row, 'תאריך חתימה'));
    if (signed && GYM_OPEN_STATUSES.indexOf(status) !== -1) {
      var declEnd = new Date(signed.getTime());
      declEnd.setMonth(declEnd.getMonth() + declMonths);
      declEnd.setHours(0, 0, 0, 0);
      if (daysBetween_(today, declEnd) === declWarn) {
        try {
          sendResidentTemplate_(ss, 'GYM_DECLARATION_EXPIRING', [email], {
            'שם': name, 'תוקף': Utilities.formatDate(declEnd, tz, 'dd/MM/yyyy')
          });
        } catch (e) { Logger.log('GYM_DECLARATION_EXPIRING נכשל: ' + e); }
      }
    }

    /* 5. בקשה שתקועה אצל המנהל — התרעה למנהלי המכון */
    if (status === GYM_ST_DOCTOR || status === GYM_ST_REVIEW || status === GYM_ST_VERIFY) {
      var sub2 = gymToDate_(cell(row, 'הוגש בתאריך'));
      if (sub2) {
        sub2.setHours(0, 0, 0, 0);
        if (daysBetween_(sub2, today) === staleDays) {
          try {
            notifyAdmins_(ss, PERM_GYM, 'ADMIN_STALE_GYM', {
              'שם': name, 'ימים': staleDays, 'סטטוס': status, 'קישור': CBA_APP_URL
            });
          } catch (e) { Logger.log('ADMIN_STALE_GYM נכשל: ' + e); }
        }
      }
    }
  }

  // כתיבה מרוכזת של שינויי הסטטוס — טווח רציף אחד, לא תא-תא
  if (statusUpdates.length && statusCol) {
    var colVals = sh.getRange(2, statusCol, lastRow - 1, 1).getValues();
    statusUpdates.forEach(function (u) { colVals[u.r][0] = u.v; });
    sh.getRange(2, statusCol, lastRow - 1, 1).setValues(colVals);
  }
}

/** תזכורת חוקים+תשלום לתושב, לשריונים מאושרים שחלים בעוד בדיוק N ימים (ר'
 * RULE_CLUB_REMINDER_DAYS_BEFORE). בדיקת "בדיוק N ימים" (ולא "N ימים ומעלה")
 * מבטיחה שליחה חד-פעמית בלי צורך לסמן על האירוע "כבר נשלחה תזכורת". */
function clubReminderJob_(ss) {
  var settings = getEmailSettings_(ss);
  var daysBefore = emailRule_(settings, 'RULE_CLUB_REMINDER_DAYS_BEFORE', 2);
  var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
  if (!cal) return;
  var tz = Session.getScriptTimeZone();
  var target = new Date(); target.setDate(target.getDate() + daysBefore);
  var dayStart = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0);
  var dayEnd = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59);
  cal.getEvents(dayStart, dayEnd).forEach(function (ev) {
    if (ev.getTag('status') !== 'approved') return;
    var email = ev.getTag('email');
    if (!email) return;
    sendResidentTemplate_(ss, 'CLUB_REMINDER', [email], {
      'שם': ev.getTag('family') || 'תושב',
      'תאריך': Utilities.formatDate(ev.getStartTime(), tz, 'dd/MM/yyyy'),
      'שעה': Utilities.formatDate(ev.getStartTime(), tz, 'HH:mm') + '–' + Utilities.formatDate(ev.getEndTime(), tz, 'HH:mm')
    });
  });
}

/** תזכורת למנהל על בקשות (הרשמה/החזר/מועדון) שממתינות בדיוק N ימים (RULE_STALE_DAYS)
 * — אותו עיקרון של "בדיוק N", לא "N ומעלה", כדי שהתזכורת תישלח פעם אחת בלבד. */
function staleNudgeJob_(ss) {
  var settings = getEmailSettings_(ss);
  var staleDays = emailRule_(settings, 'RULE_STALE_DAYS', 3);
  var tz = Session.getScriptTimeZone();

  function daysAgoStr_(n) {
    var d = new Date(); d.setDate(d.getDate() - n);
    return Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  }
  var thresholdStr = daysAgoStr_(staleDays);

  // הרשמות ממתינות
  var ssh = getSignupsSheet_(ss);
  var svalues = ssh.getDataRange().getValues();
  for (var r = 1; r < svalues.length; r++) {
    var v = svalues[r];
    if (String(v[6]).trim() !== 'ממתין') continue;
    var reqDate = v[1] instanceof Date ? Utilities.formatDate(v[1], tz, 'yyyy-MM-dd') : String(v[1] || '').slice(0, 10);
    if (reqDate !== thresholdStr) continue;
    notifyAdmins_(ss, PERM_RESIDENTS, 'ADMIN_STALE_SIGNUP', {
      'שם': (String(v[3] || '') + ' ' + String(v[4] || '')).trim(), 'אימייל': String(v[2] || ''),
      'ימים': staleDays, 'קישור': CBA_APP_URL
    });
  }

  // בקשות החזר ממתינות — שנת התקציב הנוכחית בלבד (ר' readSettings_)
  var curYear = readSettings_(ss)['שנה נוכחית'];
  var tsh = curYear ? ss.getSheetByName('תנועות ' + curYear) : null;
  if (tsh) {
    var tvalues = tsh.getDataRange().getValues();
    var theaders = tvalues[0].map(function (h) { return String(h).trim(); });
    var idxOf = {}; theaders.forEach(function (h, i) { idxOf[h] = i; });
    var subDateIdx = idxOf[SUBMIT_DATE_HEADER];
    for (var i = 1; i < tvalues.length; i++) {
      var row = tvalues[i];
      var status = String(row[idxOf['סטטוס']] || '');
      var source = String(row[idxOf['מקור']] || '');
      if (source !== SOURCE_HE.resident) continue;
      if (status !== STATUS_HE.submitted && status !== STATUS_HE.review) continue;
      if (subDateIdx === undefined) continue; // שורות ישנות בלי התאריך המדויק — אין איך לחשב, מדלגים
      var subVal = row[subDateIdx];
      var subDate = subVal instanceof Date ? Utilities.formatDate(subVal, tz, 'yyyy-MM-dd') : String(subVal || '').slice(0, 10);
      if (subDate !== thresholdStr) continue;
      notifyAdmins_(ss, PERM_BUDGET, 'ADMIN_STALE_REIMBURSEMENT', {
        'שם': row[idxOf['רוכש']] || '', 'סכום': Math.round(Number(row[idxOf['סכום']]) || 0),
        'מזהה': row[idxOf['מזהה']], 'ימים': staleDays, 'קישור': CBA_APP_URL
      });
    }
  }

  // שריוני מועדון ממתינים
  var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
  if (cal) {
    var from = new Date(Date.now() - 40 * 24 * 3600 * 1000), to = new Date(Date.now() + 180 * 24 * 3600 * 1000);
    cal.getEvents(from, to).forEach(function (ev) {
      if (ev.getTag('status') !== 'pending') return;
      var reqAt = Number(ev.getTag('requestedAt'));
      if (!reqAt) return;
      var reqStr = Utilities.formatDate(new Date(reqAt), tz, 'yyyy-MM-dd');
      if (reqStr !== thresholdStr) return;
      notifyAdmins_(ss, PERM_CLUB, 'ADMIN_STALE_CLUB', {
        'שם': ev.getTag('family') || 'תושב',
        'תאריך': Utilities.formatDate(ev.getStartTime(), tz, 'dd/MM/yyyy'),
        'ימים': staleDays, 'קישור': CBA_APP_URL
      });
    });
  }
}

/** אוסף את כל הפריטים הפתוחים כרגע, לפי מידור — משמש גם לסיכום השבועי וגם לחודשי. */
function collectOpenItems_(ss) {
  var tz = Session.getScriptTimeZone();
  var out = { residents: [], budget: [], club: [], gym: [] };

  // מכון כושר — מה ממתין לטיפול, ומי לא מסונכרן מול התשלומים
  try {
    var gsh = ss.getSheetByName(GYM_SHEET);
    if (gsh && gsh.getLastRow() > 1) {
      var gcols = gymCols_(gsh);
      var grows = gsh.getRange(2, 1, gsh.getLastRow() - 1, gsh.getLastColumn()).getValues();
      for (var gi = 0; gi < grows.length; gi++) {
        function gv(n) { return gcols[n] ? String(grows[gi][gcols[n] - 1]).trim() : ''; }
        var gname = (gv('שם פרטי') + ' ' + gv('שם משפחה')).trim() || gv('אימייל');
        var gst = gv('סטטוס');
        if (gst === GYM_ST_DOCTOR || gst === GYM_ST_REVIEW || gst === GYM_ST_VERIFY) {
          out.gym.push('• ' + gname + ' — ' + gst);
        }
        var sync = gv('מצב סנכרון');
        if (sync && sync !== 'מסונכרן') out.gym.push('• ' + gname + ' — ' + sync);
      }
    }
  } catch (gErr) { Logger.log('סעיף מכון בסיכום נכשל: ' + gErr); }

  var ssh = getSignupsSheet_(ss);
  var svalues = ssh.getDataRange().getValues();
  for (var r = 1; r < svalues.length; r++) {
    var v = svalues[r];
    if (String(v[6]).trim() === 'ממתין') {
      out.residents.push('• ' + String(v[3] || '') + ' ' + String(v[4] || '') + ' (' + String(v[2] || '') + ')');
    }
  }

  var curYear = readSettings_(ss)['שנה נוכחית'];
  var tsh = curYear ? ss.getSheetByName('תנועות ' + curYear) : null;
  if (tsh) {
    var tvalues = tsh.getDataRange().getValues();
    var theaders = tvalues[0].map(function (h) { return String(h).trim(); });
    var idxOf = {}; theaders.forEach(function (h, i) { idxOf[h] = i; });
    for (var i = 1; i < tvalues.length; i++) {
      var row = tvalues[i];
      var status = String(row[idxOf['סטטוס']] || '');
      var source = String(row[idxOf['מקור']] || '');
      if (source !== SOURCE_HE.resident) continue;
      if (status === STATUS_HE.paid || status === STATUS_HE.rejected) continue;
      out.budget.push('• ' + (row[idxOf['רוכש']] || '') + ' — ' + Math.round(Number(row[idxOf['סכום']]) || 0) +
        " ₪ (מס' " + row[idxOf['מזהה']] + ', סטטוס: ' + status + ')');
    }
  }

  var cal = CalendarApp.getCalendarById(CLUB_CALENDAR_ID);
  if (cal) {
    var from = new Date(Date.now() - 3 * 24 * 3600 * 1000), to = new Date(Date.now() + 90 * 24 * 3600 * 1000);
    cal.getEvents(from, to).forEach(function (ev) {
      if (ev.getTag('status') !== 'pending') return;
      out.club.push('• ' + (ev.getTag('family') || 'תושב') + ' — ' + Utilities.formatDate(ev.getStartTime(), tz, 'dd/MM/yyyy HH:mm'));
    });
  }
  return out;
}

/** שולח דוח מרוכז (שבועי/חודשי) — כל מנהל מקבל רק את הסעיפים שבהרשאתו, מנהל-על
 * מקבל את כל הסעיפים שבדוח הזה, ואף אחד לא מקבל שני מיילים גם אם הוא בכמה מידורים. */
function sendDigestBySection_(ss, subjectKey, sections, includeKeys) {
  var settings = getEmailSettings_(ss);
  if (!emailEnabled_(settings, subjectKey)) return;
  var t = settings[subjectKey];
  if (!t) return;
  var recipients = {}; // email -> { residents:bool, budget:bool, club:bool }
  function addAll_(permKey, flagKey) {
    if (includeKeys.indexOf(flagKey) === -1) return;
    adminEmailsByPerm_(ss, permKey).forEach(function (e) {
      recipients[e] = recipients[e] || {};
      recipients[e][flagKey] = true;
    });
  }
  addAll_(PERM_RESIDENTS, 'residents');
  addAll_(PERM_BUDGET, 'budget');
  addAll_(PERM_CLUB, 'club');
  addAll_(PERM_GYM, 'gym');
  adminEmailsByPerm_(ss, PERM_SUPER).forEach(function (e) {
    recipients[e] = recipients[e] || {};
    includeKeys.forEach(function (k) { recipients[e][k] = true; });
  });

  var LABELS = { residents: 'הרשמות ממתינות', budget: 'בקשות החזר פתוחות', club: 'שריוני מועדון ממתינים', gym: 'מכון כושר — ממתין לטיפול' };
  Object.keys(recipients).forEach(function (email) {
    var flags = recipients[email];
    var parts = [t.body];
    includeKeys.forEach(function (k) {
      if (!flags[k]) return;
      var list = sections[k];
      parts.push('\n' + LABELS[k] + ':\n' + (list.length ? list.join('\n') : '(אין)'));
    });
    if (parts.length === 1) return; // אין לו אף סעיף רלוונטי בדוח הזה — לא שולחים מייל ריק
    var plainDigest = parts.join('\n');
    var html = buildEmailHtml_(plainDigest, CBA_APP_URL, 'פתיחת האפליקציה', 'neutral');
    sendMail_([email], t.subject, plainDigest + '\n\n' + CBA_APP_URL, html);
  });
}

/** סיכום שבועי — ביום RULE_WEEKLY_DAY (0=ראשון), שלושת המידורים יחד. */
function weeklyDigestJob_(ss) {
  var settings = getEmailSettings_(ss);
  var weeklyDay = emailRule_(settings, 'RULE_WEEKLY_DAY', 0);
  if (new Date().getDay() !== weeklyDay) return;
  var sections = collectOpenItems_(ss);
  sendDigestBySection_(ss, 'ADMIN_WEEKLY_DIGEST', sections, ['residents', 'budget', 'club', 'gym']);
}

/** סיכום חודשי — ביום RULE_MONTHLY_DAY (17), רק בקשות החזר פתוחות (לפני סגירת
 * החלון ב-19), למנהלי תקציב + מנהל-על בלבד. */
function monthlyDigestJob_(ss) {
  var settings = getEmailSettings_(ss);
  var monthlyDay = emailRule_(settings, 'RULE_MONTHLY_DAY', 17);
  if (new Date().getDate() !== monthlyDay) return;
  var sections = collectOpenItems_(ss);
  sendDigestBySection_(ss, 'ADMIN_MONTHLY_DIGEST', sections, ['budget']);
}

/* ==== תיקון חד-פעמי (2026-08-10): קבלות שהוזזו בטעות לתיקיית חודש שגוי ==== */
/* פונקציה חד-פעמית לאבחון/תיקון קבלות שהועברו בטעות לתיקיית "החודש הנוכחי" בדרייב
 * (הבאג שתוקן למעלה ב-getReceiptsFolder_) במקום לתיקיית "חודש הגשה" האמיתי שלהן.
 * dryRun=true (ברירת מחדל): רק מדווחת ל-Logger מה היה זז, לא נוגעת בקבצים.
 * dryRun=false: מזיזה בפועל. יש להריץ קודם עם dryRun=true ולבדוק את הלוג!
 * מיועדת להסרה אחרי שהתיקון בוצע ואומת. */
function repairMisplacedReceipts_(dryRun) {
  dryRun = (dryRun !== false);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var report = [];
  var moved = 0, alreadyOk = 0, skipped = 0, errors = 0;

  sheets.forEach(function (sh) {
    var name = sh.getName();
    if (name.indexOf('תנועות ') !== 0) return;

    var lastCol = sh.getLastColumn();
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return;
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
    var idCol = headers.indexOf('מזהה');
    var monthCol = headers.indexOf('חודש הגשה');
    var statusCol = headers.indexOf('סטטוס');
    var urlCol = headers.indexOf('קישור קבלה');
    if (idCol === -1 || monthCol === -1 || statusCol === -1 || urlCol === -1) return;

    var data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    data.forEach(function (row) {
      var status = String(row[statusCol]);
      var url = String(row[urlCol]);
      var rawMonth = row[monthCol];
      var id = row[idCol];
      if (!url) return;
      if (status !== STATUS_HE.ready && status !== STATUS_HE.paid) return;

      var fileId = extractDriveFileId_(url);
      if (!fileId) { errors++; report.push({ sheet: name, id: id, issue: 'לא ניתן לחלץ מזהה קובץ מהקישור' }); return; }

      try {
        var file = DriveApp.getFileById(fileId);
        var parentsIter = file.getParents();
        var monthFolder = parentsIter.hasNext() ? parentsIter.next() : null;
        var currentMonthName = monthFolder ? monthFolder.getName() : '(אין הורה)';
        var currentYearName = '(?)';
        if (monthFolder) {
          var yearParentsIter = monthFolder.getParents();
          if (yearParentsIter.hasNext()) currentYearName = yearParentsIter.next().getName();
        }

        var mk = normalizeMonthKey_(rawMonth);
        if (!mk) { skipped++; report.push({ sheet: name, id: id, issue: 'אין חודש הגשה תקין', month: String(rawMonth) }); return; }
        var targetYearName = mk.split('-')[0];
        var targetMonthName = String(Number(mk.split('-')[1]));

        if (currentYearName === targetYearName && currentMonthName === targetMonthName) {
          alreadyOk++;
          return;
        }

        report.push({
          sheet: name, id: id, month: mk, fileName: file.getName(),
          from: currentYearName + '/' + currentMonthName, to: targetYearName + '/' + targetMonthName
        });

        if (!dryRun) {
          file.moveTo(getReceiptsFolder_(mk));
        }
        moved++;
      } catch (e) {
        errors++;
        report.push({ sheet: name, id: id, issue: 'שגיאה: ' + e.message });
      }
    });
  });

  var summary = { dryRun: dryRun, moved: moved, alreadyOk: alreadyOk, skipped: skipped, errors: errors };
  Logger.log(JSON.stringify(summary));

  // כותבים את הדוח המלא לטאב ייעודי (הלוג הרגיל נחתך כשהוא ארוך מדי) — כדי שאפשר
  // יהיה לבדוק את כל 68+ השורות לפני/אחרי ההרצה בפועל.
  var logSheetName = 'לוג תיקון קבלות 2026-08-10';
  var logSheet = ss.getSheetByName(logSheetName);
  if (!logSheet) logSheet = ss.insertSheet(logSheetName);
  logSheet.clear();
  logSheet.appendRow(['dryRun', dryRun, 'moved', moved, 'alreadyOk', alreadyOk, 'skipped', skipped, 'errors', errors, 'timestamp', new Date()]);
  logSheet.appendRow(['sheet', 'id', 'month', 'fileName', 'from', 'to', 'issue']);
  report.forEach(function (r) {
    logSheet.appendRow([r.sheet || '', r.id || '', r.month || '', r.fileName || '', r.from || '', r.to || '', r.issue || '']);
  });

  return summary;
}

function repairMisplacedReceiptsDryRun() { return repairMisplacedReceipts_(true); }
function repairMisplacedReceiptsExecute() { return repairMisplacedReceipts_(false); }

/* ============================================================================
 *  "שירותים לתושב" (2026-08-18)
 * ----------------------------------------------------------------------------
 *  מסך חדש באזור התושב שמציג כרטיסי שירות (גז, אינטרנט, תקלות בינוי…), וכל
 *  כרטיס נפתח לפירוט מלא ומובנה בתוך האפליקציה — לא קישור ל-PDF (הוחלט עם
 *  יועד: PDF בעברית לא קריא בנייד ואי אפשר לערוך אותו מהאפליקציה).
 *
 *  התבנית כאן היא **בדיוק** זו של עץ ועד השיכון למעלה, במכוון:
 *    - קריאה (action=services ב-doGet) פתוחה לכל תושב מחובר ופעיל — need=null,
 *      ולכן היא לא מופיעה ב-ACTION_PERMS בכלל.
 *    - שמירה (saveServices) מוגבלת למנהל-על ב-ACTION_PERMS, כמו saveCommitteeTree.
 *    - שמירה מחליפה את כל הטבלה, לא "מפזלת" שינויים חלקיים.
 *
 *  שני טאבים, לא אחד: לכל שירות יש מספר *משתנה* של סעיפים, אז דחיסה לשורה
 *  אחת הייתה דורשת עשרות עמודות ריקות. אותה הפרדה בדיוק כמו עץ הוועד מול
 *  קטגוריות הוועד.
 *
 *  התוכן נשמר בפורמט קריא-לעין ולא כ-JSON בתא, בכוונה: אם משהו יישבר
 *  באפליקציה, אפשר עדיין לקרוא ולערוך הכול ידנית בגיליון. הפורמט לפי "סוג":
 *    טקסט/הדגשה — טקסט חופשי (שורה ריקה = פסקה חדשה)
 *    רשימה      — שורה = בולט
 *    טבלה       — תאים מופרדים ב-"|", השורה הראשונה היא הכותרות
 *    אנשי קשר   — שורה = "שם|תפקיד|טלפון"
 *    שעות       — "ימים | טווחים" · "עונה | 15/05-30/09" · "חריג | 02/10 | סגור"
 *                 (הפענוח והחישוב בצד הלקוח, ר' CBA.serviceUtils ב-services.js)
 * ========================================================================== */
var SERVICES_SHEET = 'שירותים לתושב';
var SERVICES_HEADERS = ['מזהה שירות', 'שם', 'תיאור קצר', 'אייקון', 'ספק',
  'טלפון ראשי', 'קישור למסמך', 'סדר', 'פעיל', 'עודכן', 'עודכן ע"י',
  /* 2026-09-08 — ההבחנה בין ספק חיצוני (דורגז, אינטרנט) לתשתית ציבורית של
     השיכון (בריכה, מכון כושר, מגרשים). ריק = ספק חיצוני, כדי שכל השורות
     שכבר בגיליון ימשיכו להתנהג בדיוק כמו קודם. */
  'סוג שירות'];

var SERVICE_SECTIONS_SHEET = 'סעיפי שירותים';
var SERVICE_SECTIONS_HEADERS = ['מזהה שירות', 'מזהה סעיף', 'סדר', 'סוג', 'כותרת', 'תוכן'];

/** סוגי הסעיפים המותרים. שמירה עם סוג שאינו ברשימה נדחית — עדיף להיכשל
 * בבירור מאשר לכתוב לגיליון ערך שהמסך לא ידע לצייר. */
var SERVICE_SECTION_TYPES = ['טקסט', 'רשימה', 'טבלה', 'אנשי קשר', 'הדגשה', 'שעות'];

/** משלים כותרות חסרות בטאב קיים ומחזיר את שורת הכותרות בפועל.
 *
 *  ⚠️ למה זה קיים, ולמה זה לא "רק להוסיף לקבוע": ensureServicesSheet_ יצר
 *     כותרות רק כשהטאב לא היה קיים. בגיליון שכבר רץ בייצור, הוספת שם חדש
 *     ל-SERVICES_HEADERS הייתה גורמת ל-saveServices_ לכתוב ערך לעמודה
 *     ה-12 — עמודה בלי כותרת. ו-readTable_ מדלג על עמודות בלי כותרת, אז
 *     הערך היה *נעלם בשקט* בקריאה הבאה. בדיוק סוג התקלה שלא מתגלה עד
 *     שמישהו שואל למה השדה מתאפס.
 *
 *  אידמפוטנטי: רץ בכל קריאה, מוסיף רק מה שחסר, ולעולם לא מזיז או משנה
 *  עמודה קיימת — כך שסדר עמודות שיועד שינה ידנית בגיליון נשמר. */
function ensureHeaders_(sh, required) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var have = sh.getRange(1, 1, 1, lastCol).getValues()[0]
               .map(function (h) { return String(h).trim(); });
  var missing = required.filter(function (h) { return have.indexOf(h) === -1; });
  if (missing.length) {
    sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
    have = have.concat(missing);
  }
  return have;
}

function ensureServicesSheet_(ss) {
  var sh = ss.getSheetByName(SERVICES_SHEET);
  if (sh) { ensureHeaders_(sh, SERVICES_HEADERS); return sh; }
  sh = ss.insertSheet(SERVICES_SHEET);
  sh.getRange(1, 1, 1, SERVICES_HEADERS.length).setValues([SERVICES_HEADERS]);
  sh.getRange(1, 1, 1, SERVICES_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 130); sh.setColumnWidth(3, 300);
  sh.setColumnWidth(4, 70); sh.setColumnWidth(5, 130); sh.setColumnWidth(6, 120);
  sh.setColumnWidth(7, 220);
  return sh;
}

function ensureServiceSectionsSheet_(ss) {
  var sh = ss.getSheetByName(SERVICE_SECTIONS_SHEET);
  if (sh) { ensureHeaders_(sh, SERVICE_SECTIONS_HEADERS); return sh; }
  sh = ss.insertSheet(SERVICE_SECTIONS_SHEET);
  sh.getRange(1, 1, 1, SERVICE_SECTIONS_HEADERS.length).setValues([SERVICE_SECTIONS_HEADERS]);
  sh.getRange(1, 1, 1, SERVICE_SECTIONS_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 120); sh.setColumnWidth(2, 110); sh.setColumnWidth(3, 60);
  sh.setColumnWidth(4, 100); sh.setColumnWidth(5, 180); sh.setColumnWidth(6, 560);
  return sh;
}

/** קריאה — פתוחה לכל תושב מחובר ופעיל (need=null), בדיוק כמו handleCommitteeTree_.
 * יוצרת את שני הטאבים אוטומטית בפעם הראשונה כדי שיועד לא יצטרך להכין כלום ידנית.
 * מחזירה את שני הטאבים בקריאה אחת — המסך צריך את שניהם תמיד, ואין טעם בשתי
 * נסיעות רשת. הסינון ל"פעיל בלבד" נעשה בלקוח ולא כאן, כי מנהל-על צריך לראות
 * גם את המוסתרים במסך הניהול. */
function handleServices_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureServicesSheet_(ss);
    ensureServiceSectionsSheet_(ss);
    return json_({
      ok: true,
      services: readTable_(ss, SERVICES_SHEET),
      sections: readTable_(ss, SERVICE_SECTIONS_SHEET)
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** שמירה — מנהל-על בלבד (נאכף ב-ACTION_PERMS, לא כאן). מחליפה את שני הטאבים
 * במלואם, כמו saveCommitteeTree_: הטבלאות קטנות (עשרות שורות לכל היותר),
 * והעריכה במסך היא על הכרטיס כמקשה אחת — הוספת/הסרת סעיף, שינוי סדר —
 * ולא על שורה בודדת. נעילה כדי ששתי שמירות לא יתנגשו.
 *
 * ולידציה לפני כתיבה (ולא אחריה): שירות בלי שם או בלי מזהה, מזהה כפול, או
 * סעיף עם "סוג" לא מוכר — כולם נדחים עם הודעה ברורה, כדי שלא ניכתב לגיליון
 * מצב שהמסך לא יידע לצייר. */
function saveServices_(ss, body) {
  var services = Array.isArray(body.services) ? body.services : [];
  var sections = Array.isArray(body.sections) ? body.sections : [];

  var seenIds = {};
  for (var i = 0; i < services.length; i++) {
    var svc = services[i] || {};
    var id = String(svc['מזהה שירות'] || '').trim();
    var name = String(svc['שם'] || '').trim();
    if (!id) return { ok: false, error: 'שירות ללא מזהה (שורה ' + (i + 1) + ')' };
    if (!name) return { ok: false, error: 'שירות ללא שם (מזהה ' + id + ')' };
    if (seenIds[id]) return { ok: false, error: 'מזהה שירות כפול: ' + id };
    seenIds[id] = true;
  }
  for (var j = 0; j < sections.length; j++) {
    var sec = sections[j] || {};
    var owner = String(sec['מזהה שירות'] || '').trim();
    var type = String(sec['סוג'] || '').trim();
    if (!seenIds[owner]) return { ok: false, error: 'סעיף משויך לשירות שאינו קיים: ' + owner };
    if (SERVICE_SECTION_TYPES.indexOf(type) === -1) {
      return { ok: false, error: 'סוג סעיף לא מוכר: "' + type + '"' };
    }
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    // body._email נקבע ע"י שער ההרשאות ב-doPost (gate.email) — אין צורך
    // לפענח את המושב שוב כאן.
    var who = String(body._email || '').trim();
    var stamp = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');

    /* הכתיבה מסודרת לפי *שורת הכותרות שבגיליון*, לא לפי סדר הקבוע. אחרת
       עמודה שנוספה בסוף (או שיועד הזיז ידנית) הייתה נכתבת למקום הלא נכון. */
    var svcSheet = ensureServicesSheet_(ss);
    var svcHead = ensureHeaders_(svcSheet, SERVICES_HEADERS);
    var lastSvc = svcSheet.getLastRow();
    if (lastSvc > 1) svcSheet.getRange(2, 1, lastSvc - 1, svcHead.length).clearContent();
    if (services.length) {
      var svcGrid = services.map(function (r, idx) {
        var row = {};
        svcHead.forEach(function (h) { row[h] = (r[h] == null) ? '' : r[h]; });
        // "סדר" נגזר תמיד ממיקום בפועל במערך שהגיע מהמסך — כך שגרירה/חצים
        // במסך הניהול הם מקור האמת היחיד, ואי אפשר להגיע למצב של שני שירותים
        // עם אותו מספר סדר.
        row['סדר'] = idx + 1;
        row['עודכן'] = stamp;
        if (who) row['עודכן ע"י'] = who;
        return svcHead.map(function (h) { return row[h]; });
      });
      svcSheet.getRange(2, 1, svcGrid.length, svcHead.length).setValues(svcGrid);
    }

    var secSheet = ensureServiceSectionsSheet_(ss);
    var secHead = ensureHeaders_(secSheet, SERVICE_SECTIONS_HEADERS);
    var lastSec = secSheet.getLastRow();
    if (lastSec > 1) secSheet.getRange(2, 1, lastSec - 1, secHead.length).clearContent();
    if (sections.length) {
      var secGrid = sections.map(function (r) {
        return secHead.map(function (h) { return (r[h] == null) ? '' : r[h]; });
      });
      secSheet.getRange(2, 1, secGrid.length, secHead.length).setValues(secGrid);
    }

    return { ok: true, services: services.length, sections: sections.length };
  } finally {
    lock.releaseLock();
  }
}

/** עדכון תושבים על שינוי בשירות — **ידני בלבד**, נשלח רק כשמנהל-על לוחץ על
 * הכפתור במסך העריכה. הוחלט כך במפורש (2026-08-18): שליחה אוטומטית בכל שמירה
 * הייתה גורמת לתיקון פסיק לשלוח מייל לכל השיכון.
 * עובר דרך אותה מערכת מיילים כמו כל השאר (getEmailSettings_/emailEnabled_/
 * sendMail_) — התבנית SERVICE_UPDATED יושבת בטאב "הגדרות מיילים" וניתנת
 * לעריכה ממסך "ניהול מיילים", בלי לגעת בקוד. */
function notifyServiceUpdate_(ss, body) {
  var name = String(body.serviceName || '').trim();
  if (!name) return { ok: false, error: 'חסר שם השירות' };

  var settings = getEmailSettings_(ss);
  if (!emailEnabled_(settings, 'SERVICE_UPDATED')) {
    return { ok: false, error: 'שליחת המייל הזה כבויה כרגע במסך "ניהול מיילים"' };
  }
  var t = settings['SERVICE_UPDATED'];
  if (!t) return { ok: false, error: 'תבנית SERVICE_UPDATED חסרה בגיליון "הגדרות מיילים"' };

  var emails = allActiveResidentEmails_(ss);
  if (!emails.length) return { ok: false, error: 'לא נמצאו כתובות מייל של תושבים פעילים' };

  var vars = {
    'שם השירות': name,
    'ספק': String(body.provider || ''),
    'מה השתנה': String(body.whatChanged || '')
  };
  var plain = renderTemplate_(t.body, vars);
  var html = buildEmailHtml_(plain, CBA_APP_URL, 'לצפייה בשירות', 'emerald');
  sendMail_(emails, renderTemplate_(t.subject, vars), plain + '\n\n' + CBA_APP_URL, html);
  return { ok: true, sent: emails.length };
}

/** כל כתובות המייל של תושבים פעילים (בלי סינון הרשאה) — אותה לוגיקת סריקה
 * כמו adminEmailsByPerm_, רק בלי בדיקת ההרשאות: כאן היעד הוא כל השיכון.
 * מוגדרת בנפרד ולא כפרמטר ל-adminEmailsByPerm_ כדי לא לשנות התנהגות של
 * פונקציה שכבר עובדת בייצור. */
function allActiveResidentEmails_(ss) {
  var rsh = ss.getSheetByName('תושבים');
  if (!rsh) return [];
  var values = rsh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var emailCols = [], statusCol = -1;
  headers.forEach(function (h, i) {
    if (h.indexOf(PERM_HEADER) !== -1) return;      // עמודת הרשאות, לא מייל
    if (h.indexOf('אימייל') !== -1) emailCols.push(i);
    else if (h.indexOf('סטטוס') !== -1) statusCol = i;
  });
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (statusCol > -1 && String(row[statusCol]).indexOf('פעיל') === -1) continue;
    emailCols.forEach(function (c) {
      var email = String(row[c] || '').trim();
      if (email) out.push(email);
    });
  }
  return out.filter(function (e, i, a) { return a.indexOf(e) === i; });
}

/** מילוי אוטומטי של כרטיס שירות ממסמך (2026-08-18) — אותו דפוס בדיוק כמו
 * סריקת קבלות: קריאה אחת ל-Gemini עם הקובץ, פלט JSON קשיח לפי סכימה, ו**שום
 * דבר לא נשמר** — התוצאה חוזרת ללקוח ונכנסת לעורך הפתוח לעריכה של המנהל.
 * מנהל-על בלבד (ACTION_PERMS), בניגוד ל-scanReceipt שפתוח לכל תושב, כי רק
 * מנהל-על עורך כרטיסי שירות בכלל. */
function scanServiceDocWithGemini_(dataBase64, mimeType) {
  var key = geminiApiKey_();
  if (!key) {
    return { ok: false, error: 'GEMINI_API_KEY חסר. יש להוסיף אותו תחת Project Settings → Script Properties בעורך Apps Script.' };
  }
  var prompt =
    'זהו מסמך (חוזה/נוהל/מחירון) של שירות שניתן לתושבי שיכון בישראל — למשל גז, ' +
    'אינטרנט או תחזוקה. המטרה: להפוך אותו לכרטיס מידע מובנה לתושב. ' +
    'החזר אך ורק JSON תקין, בלי מרקדאון ובלי הסברים. ' +
    'שדות ברמת הכרטיס: "name" (שם השירות בשתי מילים לכל היותר, למשל "גז"), ' +
    '"provider" (שם החברה/הספק), "desc" (תיאור קצר של שורה אחת, עד 8 מילים), ' +
    '"phone" (הטלפון הראשי ליצירת קשר). ' +
    'ובנוסף "sections": מערך סעיפים לפי סדר הופעתם במסמך. לכל סעיף: ' +
    '"type" (אחד מ: "טקסט", "רשימה", "טבלה", "אנשי קשר", "הדגשה"), ' +
    '"title" (כותרת קצרה בעברית), ו-"content" בפורמט שתלוי ב-type: ' +
    'עבור "טקסט" ו"הדגשה" — טקסט חופשי (שורה ריקה מפרידה בין פסקאות); ' +
    'עבור "רשימה" — כל שורה היא פריט אחד; ' +
    'עבור "טבלה" — תאים מופרדים בתו "|" והשורה הראשונה היא הכותרות; ' +
    'עבור "אנשי קשר" — כל שורה בפורמט "שם|תפקיד|טלפון". ' +
    'הנחיות: השתמש ב"טבלה" למחירונים, ב"אנשי קשר" לכל רשימת טלפונים, וב"הדגשה" ' +
    'רק לאזהרות או לדברים שהתושב חייב לשים לב אליהם. ' +
    'אל תמציא מידע שאינו במסמך — שדה שלא מופיע יוחזר כמחרוזת ריקה. ' +
    'שמור על הניסוח המקורי של המסמך ככל האפשר, רק קצר וסדר אותו.';

  var payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType || 'application/pdf', data: dataBase64 } }
      ]
    }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          provider: { type: 'STRING' },
          desc: { type: 'STRING' },
          phone: { type: 'STRING' },
          sections: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                type: { type: 'STRING' },
                title: { type: 'STRING' },
                content: { type: 'STRING' }
              },
              required: ['type', 'title', 'content']
            }
          }
        },
        required: ['name', 'provider', 'desc', 'phone', 'sections']
      }
    }
  };

  var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
    ':generateContent?key=' + encodeURIComponent(key);
  var resp;
  try {
    resp = UrlFetchApp.fetch(url, {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
  } catch (e) {
    return { ok: false, error: 'שגיאת רשת בקריאה ל-Gemini: ' + String(e) };
  }
  if (resp.getResponseCode() !== 200) {
    return { ok: false, error: 'Gemini החזיר קוד ' + resp.getResponseCode(), raw: resp.getContentText() };
  }
  try {
    var data = JSON.parse(resp.getContentText());
    var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
      data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
      data.candidates[0].content.parts[0].text;
    if (!text) return { ok: false, error: 'תשובה לא צפויה מ-Gemini (בלי טקסט בפלט)' };
    var fields = JSON.parse(text);
    // מסננים סעיפים עם סוג לא חוקי במקום להחזיר אותם ולתת ל-saveServices_
    // להיכשל אחר כך — עדיף שהמנהל יראה סעיף אחד חסר מאשר שמירה שנתקעת.
    if (Array.isArray(fields.sections)) {
      fields.sections = fields.sections.filter(function (s) {
        return s && SERVICE_SECTION_TYPES.indexOf(String(s.type || '').trim()) !== -1;
      });
    } else {
      fields.sections = [];
    }
    return { ok: true, fields: fields };
  } catch (e) {
    return { ok: false, error: 'שגיאה בפענוח תשובת Gemini: ' + String(e) };
  }
}

/** עטיפה מול הלקוח — מנהל-על בלבד (ACTION_PERMS). לא נוגעת בגיליון/Drive כלל. */
function handleScanServiceDoc_(ss, body) {
  if (!body.dataBase64) return { ok: false, error: 'לא צורף מסמך לסריקה' };
  return scanServiceDocWithGemini_(body.dataBase64, body.mimeType || 'application/pdf');
}

/* ============================================================================
 *  מכון כושר — שלב 1: תשתית נתונים והרשאות (2026-08-18)
 * ----------------------------------------------------------------------------
 *  שלושה טאבים, ורק אחד מהם כזה שנפתח ביום-יום:
 *
 *  1. "מכון כושר"         — שורה אחת לכל מנוי. זה הטאב הראשי.
 *  2. "מכון כושר — יומן"  — שורה לכל אירוע (תשלום, הארכה, שינוי סטטוס). מתמלא לבד.
 *  3. "הגדרות מכון"       — מסלולים, שאלון, תקנון וקוד הכניסה. נערך ממסך הניהול.
 *
 *  למה טאב הגדרות אחד ולא שלושה (מסלולים/שאלון/תקנון בנפרד): יועד ביקש מפורשות
 *  כמה שפחות טאבים. הפתרון הוא עמודת "סוג" שמבדילה בין סוגי השורות, כמו שטאב
 *  "הגדרות מיילים" מחזיק גם תבניות מייל וגם כללי זמן (RULE_*) באותה טבלה.
 *
 *  למה תשובות השאלון הן **עמודות** בטאב הראשי ולא טאב רביעי: כך כל מה שצריך
 *  לדעת על אדם יושב בשורה אחת וקריא בעין. אותו מנגנון בדיוק כמו
 *  ensureResidentCols_ בטאב "תושבים" — ר' ensureGymQuestionCols_ למטה.
 *
 *  שלב 1 יוצר את הטאבים, זורע את התוכן ההתחלתי וקורא אותם למסך הניהול. אין
 *  עדיין שום כתיבה — הרשמה, תשלומים ואישורים מגיעים בשלבים 2-3.
 * ========================================================================== */
var GYM_SHEET          = 'מכון כושר';
var GYM_LOG_SHEET      = 'מכון כושר — יומן';
var GYM_SETTINGS_SHEET = 'הגדרות מכון';

/* העמודות הקבועות של הטאב הראשי. עמודות השאלון נוספות **אחריהן** דינמית
 * (ensureGymQuestionCols_), כך שהוספת שאלה בעתיד לא נוגעת ברשימה הזו. */
var GYM_HEADERS = [
  'מזהה', 'מזהה קבוע', 'אימייל', 'שם פרטי', 'שם משפחה', 'טלפון', 'מספר בית',
  'ת.ז.', 'תאריך לידה',
  'מסלול', 'מחיר מוסכם', 'תאריך התחלה', 'בתוקף עד', 'סטטוס',
  'סה"כ שולם', 'תשלום אחרון', 'חודשים ששולמו', 'מצב סנכרון',
  'שאלות שנענו בכן', 'דגלים', 'הערת דגל',
  'תאריך חתימה', 'קישור חתימה', 'גרסת שאלון',
  'אישור רופא', 'תאריך הנפקת האישור', 'קישור אישור',
  'אישור תקנון', 'הוגש בתאריך', 'טופל בתאריך', 'טופל ע"י', 'הערות מנהל',
  'מנוי קודם', 'דגלי תזכורת'
];

var GYM_LOG_HEADERS = [
  'מזהה אירוע', 'מזהה מנוי', 'תאריך', 'סוג אירוע', 'סכום', 'אמצעי תשלום',
  'אסמכתא', 'בתוקף עד (אחרי)', 'בוצע ע"י', 'הערה'
];

/* טאב ההגדרות. עמודת "סוג" קובעת מה השורה מייצגת:
 *   הגדרה — מזהה=מפתח, תוכן=ערך            (קוד כניסה, קישור פייבוקס, כללי זמן)
 *   מסלול — כותרת=שם המסלול, חודשים, מחיר לחודש
 *   שאלה  — כותרת=שם קצר (זה שם העמודה בטאב הראשי!), תוכן=נוסח מלא, דגל=חוסם/התראה
 *   תקנון — כותרת=כותרת המקטע, תוכן=הנוסח המלא */
var GYM_SETTINGS_HEADERS = [
  'סוג', 'מזהה', 'סדר', 'כותרת', 'תוכן', 'חודשים', 'מחיר לחודש', 'דגל', 'פעיל', 'הערה'
];

/* ערכי ההתחלה. נכתבים **רק** אם המזהה עדיין לא קיים בטאב — בדיוק כמו
 * DEFAULT_EMAIL_SETTINGS: עריכה ידנית של יועד לעולם לא נדרסת בעדכון קוד.
 *
 * השאלון והתקנון הועתקו אחד לאחד מטופס "הרשמה לחדר כושר 2026-2027 - שיכון
 * פלמחים" שהיה בשימוש עד היום. 13 שאלות הבריאות מסומנות כולן "חוסם", כי
 * בטופס המקורי כל תשובת "כן" מחייבת תעודה רפואית. מנהל המכון יכול לשנות
 * כל אחת מהן ל"התראה" ממסך הניהול — ר' האפיון.
 *
 * ⚠ קוד הכניסה יושב **רק כאן, בגיליון** ולא בקוד: הריפו ציבורי ב-GitHub. */
var GYM_DEFAULT_SETTINGS = [
  ['הגדרה', 'קוד כניסה', '', 'קוד הכניסה למכון', '0606', '', '', '', 'כן',
   'מוצג באפליקציה רק למנוי פעיל, ואף פעם לא נשלח במייל. להחלפה — לשנות כאן בלבד'],
  ['הגדרה', 'קישור פייבוקס', '', 'קישור לתשלום', '', '', '', '', 'כן',
   'הקישור שאליו נשלח התושב לתשלום דמי המנוי'],
  ['הגדרה', 'גיל מינימום', '', 'גיל מינימום להרשמה', '18', '', '', '', 'כן',
   'לפי התקנון: הכניסה מגיל 18 (מתחת לכך רק בליווי מדריך)'],
  ['הגדרה', 'תוקף הצהרה בחודשים', '', 'כמה זמן הצהרת בריאות תקפה', '24', '', '', '', 'כן',
   'לפי נוסח ההצהרה: "לאחר שנתיים... אדרש להמציא הצהרת בריאות חדשה"'],
  ['הגדרה', 'תוקף אישור רופא בחודשים', '', 'עד כמה אישור רופא נחשב עדכני', '3', '', '', '', 'כן',
   'לפי התקנון: "מכון כושר יקבל מתאמן שהמציא תעודה רפואית שלא עברו 3 חודשים ממועד הנפקתה"'],
  ['הגדרה', 'אישור אוטומטי ללא דגלים', '', 'לאשר בקשה נקייה בלי מנהל', 'כן', '', '', '', 'כן',
   'בקשה שכל תשובותיה "לא" עוברת ישר ל"ממתין לתשלום". אימות התשלום נשאר ידני תמיד'],

  ['מסלול', 'PLAN-6M', '1', 'מנוי חצי שנתי', 'רישום לחצי שנה מראש', '6', '30', '', 'כן',
   '30 ₪ לחודש × 6 חודשים = 180 ₪. המחיר החודשי הוא הבסיס לחישוב סנכרון התשלומים'],

  ['תקנון', 'R1', '1', 'תנאי כניסה ושימוש',
   'הכניסה לחדר הכושר מותרת רק למנויים ששילמו דמי רצינות לחדר הכושר וחתמו על הצהרת בריאות.\n' +
   'על המתאמן לאשר כי מצבו הבריאותי מאפשר פעילות גופנית, כל אחריות רפואית חלה עליו בלבד.\n' +
   'חל איסור להכניס אנשים שלא שילמו או ילדים לחדר הכושר - הכניסה מותרת מעל גיל 18 (מתחת לגיל 18 רק בליווי מדריך).\n' +
   'הכניסה תתאפשר באמצעות מפתח. בהמשך יהיה עם קוד שינתן רק למנויים - חל איסור להעביר את הקוד.\n' +
   'המחיר הוא אישי ולא לשני בני הזוג.', '', '', '', 'כן', ''],
  ['תקנון', 'R2', '2', 'התנהלות במתחם',
   'יש להתנהג לפי התקנון של חדר הכושר.\n' +
   'חל איסור מוחלט על הכנסת אלכוהול וכלי זכוכית למתחם.\n' +
   'יש לשמוע מוזיקה באוזניות בלבד.\n' +
   'יש לשמור על לבוש וציוד ספורט תקני כמו נעלי ספורט וכדומה.', '', '', '', 'כן', ''],
  ['תקנון', 'R3', '3', 'שמירה על סדר וניקיון',
   'חובה להשתמש במגבת אישית ולנקות את המכשירים לאחר כל שימוש, כולל מושבים וידיות.\n' +
   'יש להחזיר משקולות, מתקנים ואביזרים לחוליה או למקום המיועד בתום האימון.\n' +
   'יש להשליך פסולת לפחים בלבד ולהשאיר את המקום נקי.\n' +
   'במקרה של לכלוך חריג, נזילה או תקלה - חובה לדווח לאחראית חדר הכושר בשיכון.\n' +
   'בסיום השימוש יש לכבות את כלל המזגנים והאורות במקום.', '', '', '', 'כן', ''],
  ['תקנון', 'R4', '4', 'שמירה על ציוד ובטיחות',
   'חובה להשתמש בציוד לפי ההנחיות המוצגות על המתקן.\n' +
   'חל איסור להשליך משקולות לרצפה או לבצע שימוש חריג שיכול לגרום נזק.\n' +
   'במידה ונתקלים בתקלה במכשיר - יש לשים עליו שלט, לא להשתמש עד תיקון התקלה ולעדכן את אחראית חדר הכושר בשיכון.\n' +
   'מומלץ לבצע חימום לפני כל אימון ולהימנע ממאמץ מעבר ליכולת.', '', '', '', 'כן', ''],

  ['שאלה', 'Q1',  '1',  'מחלת לב',            'האם הרופא שלך אמר לך שאתה סובל ממחלת לב?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q2',  '2',  'כאבים בחזה במנוחה',  'האם אתה חש כאבים בחזה בזמן מנוחה?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q3',  '3',  'כאבים בחזה ביום-יום','האם אתה חש כאבים בחזה במהלך פעילות שגרה ביום-יום?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q4',  '4',  'כאבים בחזה במאמץ',   'האם אתה חש כאבים בחזה בזמן שאתה מבצע פעילות גופנית?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q5',  '5',  'סחרחורת',            'האם במהלך השנה החולפת איבדת שיווי משקל עקב סחרחורת? סמן לא אם הסחרחורת נבעה מנשימת יתר (כולל במהלך פעילות גופנית)', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q6',  '6',  'אובדן הכרה',         'האם במהלך השנה החולפת איבדת את הכרתך?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q7',  '7',  'אסתמה - תרופות',     'האם רופא אבחן שאתה סובל ממחלת האסתמה ולכן בשלושת החודשים האחרונים נזקקת לטיפול תרופתי?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q8',  '8',  'אסתמה - קוצר נשימה', 'האם רופא אבחן שאתה סובל ממחלת האסתמה ולכן בשלושת החודשים סבלת מקוצר נשימה או צפצופים?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q9',  '9',  'מחלת לב במשפחה',     'האם אחד מבני משפחתך מדרגת קרבה ראשונה נפטר ממחלת לב?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q10', '10', 'מוות פתאומי במשפחה', 'האם אחד מבני משפחתך מדרגת קרבה ראשונה נפטר ממוות פתאומי בגיל מוקדם? (לפני גיל 55 אם מדובר בגבר, ולפני גיל 65 אם מדובר באישה)', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q11', '11', 'השגחה רפואית',       'האם הרופא שלך אמר לך ב-5 השנים האחרונות לבצע פעילות גופנית רק תחת השגחה רפואית?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q12', '12', 'מחלה כרונית',        'האם הינך סובל ממחלה קבועה (כרונית), שאינה נזכרת בשאלות לעיל ועלולה למנוע או להגביל אותך בביצוע פעילות גופנית?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q13', '13', 'בעיה אורתופדית',     'האם סבלת בעבר ו/או סובל בהווה מבעיה אורתופדית כלשהי שעלולה להגבילך בפעילותך בחדר כושר?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q14', '14', 'בעיה רפואית אחרת',   'האם סבלת בעבר ו/או סובל בהווה מבעיה רפואית כלשהי שלא מופיעה בטופס זה, ואשר עלולה להגבילך בפעילותך בחדר כושר?', '', '', 'חוסם', 'כן', ''],
  ['שאלה', 'Q15', '15', 'הריון בסיכון',       'לנשים בהריון - האם ההיריון הזה או כל הריון קודם הוגדר הריון בסיכון?', '', '', 'חוסם', 'כן', '']
];

/** יוצר את שלושת הטאבים אם הם חסרים. בטוח להרצה חוזרת — טאב קיים לא נגוע. */
function ensureGymSheets_(ss) {
  var main = ss.getSheetByName(GYM_SHEET);
  if (main) gymRepairHeaders_(main);   // ריפוי-עצמי, ר' ההערה ליד הפונקציה
  if (!main) {
    main = ss.insertSheet(GYM_SHEET);
    main.getRange(1, 1, 1, GYM_HEADERS.length).setValues([GYM_HEADERS]);
    main.getRange(1, 1, 1, GYM_HEADERS.length).setFontWeight('bold');
    main.setFrozenRows(1);
    main.setColumnWidth(1, 100); main.setColumnWidth(3, 210);
    main.setColumnWidth(4, 100); main.setColumnWidth(5, 110);
  }

  var log = ss.getSheetByName(GYM_LOG_SHEET);
  if (!log) {
    log = ss.insertSheet(GYM_LOG_SHEET);
    log.getRange(1, 1, 1, GYM_LOG_HEADERS.length).setValues([GYM_LOG_HEADERS]);
    log.getRange(1, 1, 1, GYM_LOG_HEADERS.length).setFontWeight('bold');
    log.setFrozenRows(1);
    log.setColumnWidth(1, 110); log.setColumnWidth(2, 100); log.setColumnWidth(10, 300);
  }

  var cfg = ss.getSheetByName(GYM_SETTINGS_SHEET);
  if (!cfg) {
    cfg = ss.insertSheet(GYM_SETTINGS_SHEET);
    cfg.getRange(1, 1, 1, GYM_SETTINGS_HEADERS.length).setValues([GYM_SETTINGS_HEADERS]);
    cfg.getRange(1, 1, 1, GYM_SETTINGS_HEADERS.length).setFontWeight('bold');
    cfg.setFrozenRows(1);
    cfg.setColumnWidth(1, 70);  cfg.setColumnWidth(2, 90);  cfg.setColumnWidth(3, 55);
    cfg.setColumnWidth(4, 180); cfg.setColumnWidth(5, 480); cfg.setColumnWidth(10, 300);
  }
  // זריעה: רק מזהים שעדיין לא קיימים. ערך שיועד ערך ידנית לעולם לא נדרס.
  var values = cfg.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0]).trim() + '|' + String(values[r][1]).trim();
    if (key !== '|') existing[key] = true;
  }
  var toAdd = GYM_DEFAULT_SETTINGS.filter(function (row) {
    return !existing[String(row[0]).trim() + '|' + String(row[1]).trim()];
  });
  if (toAdd.length) {
    cfg.getRange(cfg.getLastRow() + 1, 1, toAdd.length, GYM_SETTINGS_HEADERS.length).setValues(toAdd);
  }

  ensureGymQuestionCols_(ss, main, cfg);
  return main;
}

/** מוסיף לטאב הראשי עמודה לכל שאלה פעילה שעדיין אין לה עמודה, לפי "כותרת"
 * (השם הקצר) מטאב ההגדרות. אותה תבנית בדיוק כמו ensureResidentCols_.
 * העמודות מוסתרות כברירת מחדל — כמעט כולן יהיו "לא", והעין צריכה את
 * "שאלות שנענו בכן" ולא 15 עמודות זהות. */
function ensureGymQuestionCols_(ss, main, cfg) {
  main = main || ss.getSheetByName(GYM_SHEET);
  cfg  = cfg  || ss.getSheetByName(GYM_SETTINGS_SHEET);
  if (!main || !cfg) return { ok: false, error: 'טאבי המכון חסרים' };

  var rows = cfg.getDataRange().getValues();
  var wanted = [];
  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][0]).trim() !== 'שאלה') continue;
    if (String(rows[r][8]).trim() === 'לא') continue;      // שאלה מכובה
    var label = String(rows[r][3]).trim();
    if (label && wanted.indexOf(label) === -1) wanted.push(label);
  }
  if (!wanted.length) return { ok: true, added: [] };

  var lastCol = main.getLastColumn();
  var headers = main.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var missing = wanted.filter(function (c) { return headers.indexOf(c) === -1; });
  if (!missing.length) return { ok: true, added: [] };

  main.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
  main.getRange(1, lastCol + 1, 1, missing.length).setFontWeight('bold');
  try { main.hideColumns(lastCol + 1, missing.length); } catch (e) {}
  return { ok: true, added: missing };
}

/** קורא את טאב ההגדרות ומפרק אותו לארבעה חלקים שהמסך יודע לצייר.
 * נקרא מחדש בכל בקשה (בלי קאש), כדי שעריכה ידנית בגיליון תיכנס לתוקף מיד. */
function readGymSettings_(ss) {
  var cfg = ss.getSheetByName(GYM_SETTINGS_SHEET);
  var out = { settings: {}, plans: [], questions: [], rules: [] };
  if (!cfg) return out;
  var rows = cfg.getDataRange().getValues();
  for (var r = 1; r < rows.length; r++) {
    var kind   = String(rows[r][0]).trim();
    var id     = String(rows[r][1]).trim();
    var order  = rows[r][2];
    var title  = String(rows[r][3]).trim();
    var body   = String(rows[r][4] == null ? '' : rows[r][4]);
    var months = rows[r][5];
    var price  = rows[r][6];
    var flag   = String(rows[r][7]).trim();
    var active = String(rows[r][8]).trim() !== 'לא';
    if (!kind) continue;
    if (kind === 'הגדרה') {
      out.settings[id] = body;
    } else if (kind === 'מסלול') {
      out.plans.push({
        id: id, name: title, note: body, active: active,
        months: Number(months) || 0, monthlyPrice: Number(price) || 0,
        total: (Number(months) || 0) * (Number(price) || 0)
      });
    } else if (kind === 'שאלה') {
      out.questions.push({
        id: id, order: Number(order) || 0, label: title, text: body,
        flag: flag, active: active
      });
    } else if (kind === 'תקנון') {
      out.rules.push({ id: id, order: Number(order) || 0, title: title, text: body, active: active });
    }
  }
  out.plans.sort(function (a, b) { return a.id < b.id ? -1 : 1; });
  out.questions.sort(function (a, b) { return a.order - b.order; });
  out.rules.sort(function (a, b) { return a.order - b.order; });
  return out;
}

/** קריאת מסך הניהול. מוגנת ב-PERM_GYM (ר' ACTION_PERMS) ולא פתוחה לכל תושב,
 * כי היא מחזירה תשובות שאלון ודגלי בריאות. יוצרת את הטאבים בפעם הראשונה,
 * כך שאין שום הכנה ידנית בגיליון.
 *
 * שים לב מה **לא** מוחזר: קוד הכניסה. הוא ייצא ללקוח רק בשלב 4, בתשובה
 * ל-gymMy, ורק אחרי שהשרת אימת שהמנוי של המבקש פעיל היום. */
function handleGymList_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_GYM);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureGymSheets_(ss);
    var cfg = readGymSettings_(ss);
    // הקוד לא נשלח למסך הניהול — רק חיווי אם הוגדר, לצורך תצוגת מצב.
    var hasCode = !!String(cfg.settings['קוד כניסה'] || '').trim();
    delete cfg.settings['קוד כניסה'];
    return json_({
      ok: true,
      members: readTable_(ss, GYM_SHEET),
      log: readTable_(ss, GYM_LOG_SHEET),
      settings: cfg.settings,
      plans: cfg.plans,
      questions: cfg.questions,
      rules: cfg.rules,
      hasEntryCode: hasCode
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** להרצה ידנית פעם אחת מעורך Apps Script (Run) — יוצר את הטאבים ואת עמודות
 * הת.ז. בטאב "תושבים" בלי לחכות לקריאה הראשונה מהאפליקציה. בטוח לחזרה. */
function setupGymModule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGymSheets_(ss);
  var cols = ensureResidentCols_(ss, {});
  var cfg = readGymSettings_(ss);
  Logger.log('טאבי המכון מוכנים. מסלולים: ' + cfg.plans.length +
             ', שאלות: ' + cfg.questions.length +
             ', מקטעי תקנון: ' + cfg.rules.length +
             '. עמודות שנוספו לתושבים: ' + JSON.stringify(cols.added || []));
  return { ok: true };
}

/* ============================================================================
 *  מכון כושר — שלב 2: הרשמה (2026-08-19)
 * ----------------------------------------------------------------------------
 *  שני מסלולי כניסה למנוי, ושניהם נוחתים על אותה שורה בטאב "מכון כושר":
 *
 *  א. התושב נרשם בעצמו (submitGymApplication) — ממלא פרטים, מאשר תקנון, עונה
 *     על השאלון וחותם. אם כל התשובות "לא" והמתג "אישור אוטומטי ללא דגלים"
 *     דלוק — הבקשה עוברת ישר ל"ממתין לתשלום" בלי שמנהל ייגע בה.
 *
 *  ב. מנהל המכון מקים ידנית (createGymMembership) — למי שנרשם פיזית או שלא
 *     משתמש באפליקציה. שתי אפשרויות להצהרה: לסמן שהתקבלה (בנייר) עם תאריך,
 *     או לשלוח לתושב מייל שיבקש ממנו למלא אותה באפליקציה. מנוי כזה נולד תמיד
 *     כ"ממתין לתשלום" (או "ממתין להצהרה") — לעולם לא כפעיל, כי התשלום מאומת
 *     ידנית תמיד. זו החלטה מפורשת של יועד.
 *
 *  כשמנהל ביקש הצהרה והתושב ממלא אותה — submitGymApplication **מעדכן את השורה
 *  הקיימת** במקום ליצור חדשה. זו הנקודה שמחברת בין שני המסלולים.
 * ========================================================================== */

var GYM_ST_DECLARATION = 'ממתין להצהרה';
var GYM_ST_DOCTOR      = 'ממתין לאישור רופא';
var GYM_ST_REVIEW      = 'ממתין לאישור';
var GYM_ST_PAYMENT     = 'ממתין לתשלום';
var GYM_ST_VERIFY      = 'ממתין לאימות';
var GYM_ST_ACTIVE      = 'פעיל';
var GYM_ST_EXPIRED     = 'פג תוקף';
var GYM_ST_FROZEN      = 'מוקפא';
var GYM_ST_REJECTED    = 'נדחה';
var GYM_ST_CANCELLED   = 'בוטל';

/* סטטוסים שנחשבים "מנוי חי" — אי אפשר לפתוח שני כאלה לאותו אדם. */
var GYM_OPEN_STATUSES = [GYM_ST_DECLARATION, GYM_ST_DOCTOR, GYM_ST_REVIEW,
                         GYM_ST_PAYMENT, GYM_ST_VERIFY, GYM_ST_ACTIVE, GYM_ST_FROZEN];

/** מפת כותרת -> מספר עמודה (1-based). נקראת מחדש בכל פעם, כי עמודות השאלון
 * נוספות דינמית ולכן המפה משתנה לאורך חיי הגיליון. */
function gymCols_(sh) {
  var last = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, last).getValues()[0];
  var map = {};
  for (var i = 0; i < headers.length; i++) {
    var h = String(headers[i]).trim();
    if (h) map[h] = i + 1;
  }
  return map;
}

/** מאתר שורת מנוי לפי אימייל. מחזיר את השורה ה"חיה" אם יש, אחרת את האחרונה
 * שנמצאה (למשל מנוי שפג) — כדי שמסך התושב יוכל להציג "חדש/חידוש" נכון. */
function gymFindRow_(sh, cols, email) {
  var target = normalizeEmail_(email);
  if (!target || !cols['אימייל']) return { row: 0, status: '' };
  var last = sh.getLastRow();
  if (last < 2) return { row: 0, status: '' };
  var emails = sh.getRange(2, cols['אימייל'], last - 1, 1).getValues();
  var statuses = cols['סטטוס'] ? sh.getRange(2, cols['סטטוס'], last - 1, 1).getValues() : [];
  var fallback = 0, fallbackStatus = '';
  for (var i = 0; i < emails.length; i++) {
    if (normalizeEmail_(emails[i][0]) !== target) continue;
    var st = statuses.length ? String(statuses[i][0]).trim() : '';
    if (GYM_OPEN_STATUSES.indexOf(st) !== -1) return { row: i + 2, status: st };
    fallback = i + 2; fallbackStatus = st;
  }
  return { row: fallback, status: fallbackStatus };
}

/** מוסיף שורה ריקה בגודל הכותרות ומחזיר את מספרה. appendRow דורש מערך באורך
 * תואם, ולכן לא אפשר להעביר לו [] — זו הייתה שגיאה בשלב הבנייה. */

/* ---------------------------------------------------------------------------
 *  כותב-שורה מרוכז (2026-08-19, אחרי מדידה בייצור)
 * ---------------------------------------------------------------------------
 *  למה זה קיים: הגרסה הראשונה כתבה כל שדה בנפרד (sh.getRange(...).setValue()).
 *  בהגשת בקשת הרשמה זה יצא **כ-35 נסיעות רשת נפרדות** לגיליון, וההפעלה בייצור
 *  ארכה 12.45 שניות. מבחינת התושב זה נראה כאילו כלום לא קורה, והוא עוזב את
 *  הדף — בדיוק אותו כשל שכבר נמצא פעם אחת ב-submitReceipt.
 *
 *  הפתרון: אוספים את כל השינויים במערך בזיכרון וכותבים **פעם אחת** ב-setValues.
 *  35 נסיעות הופכות לאחת. אותה סמנטיקה בדיוק, רק מהיר בסדר גודל.
 *
 *  שימוש:
 *      var w = gymRowWriter_(sh, rowIndex);
 *      w.set('סטטוס', 'פעיל');
 *      w.flush();            // בלי זה שום דבר לא נכתב!
 */
function gymRowWriter_(sh, rowIndex) {
  var lastCol = sh.getLastColumn();
  var cols = gymCols_(sh);
  var values = sh.getRange(rowIndex, 1, 1, lastCol).getValues()[0];
  var dirty = false;
  return {
    cols: cols,
    has: function (name) { return !!cols[name]; },
    set: function (name, val) {
      if (!cols[name]) return;
      values[cols[name] - 1] = val;
      dirty = true;
    },
    get: function (name) { return cols[name] ? values[cols[name] - 1] : ''; },
    flush: function () {
      if (dirty) sh.getRange(rowIndex, 1, 1, lastCol).setValues([values]);
      dirty = false;
    }
  };
}



/* ⚠ באג אמיתי שנתפס בייצור (2026-08-19) — לקרוא לפני שנוגעים כאן.
 *
 *  הגרסה הקודמת עשתה sh.appendRow(['','',...]) ואז החזירה sh.getLastRow().
 *  הבעיה: שורה של מחרוזות ריקות אינה "תוכן" מבחינת Sheets — appendRow לא
 *  מוסיף שורה בפועל, ו-getLastRow() ממשיך להחזיר את שורת **הכותרות** (1).
 *  התוצאה: כל הבקשה הראשונה נכתבה לשורה 1 ודרסה את הכותרות, ומאותו רגע כל
 *  קריאה מהטאב נשברה (gymCols_ מיפה שמות שכבר לא היו שם) — התושב "לא ראה
 *  כלום" למרות שהנתונים נשמרו.
 *
 *  התיקון: לא לגעת ב-appendRow בכלל. פשוט לחשב את השורה הבאה אחרי השורה
 *  האחרונה שיש בה תוכן, ולוודא שיש מספיק שורות בגריד. הכתיבה עצמה
 *  (gymRowWriter_.flush) יוצרת את השורה. */
function gymAppendBlankRow_(sh) {
  var target = Math.max(sh.getLastRow(), 1) + 1;
  var maxRows = sh.getMaxRows();
  if (maxRows < target) sh.insertRowsAfter(maxRows, target - maxRows);
  return target;
}

/* ריפוי-עצמי לשורת הכותרות (2026-08-19). רץ בכל ensureGymSheets_, כלומר בכל
 * קריאה למודול — ולכן גיליון שנפגע מהבאג למעלה מתקן את עצמו בלי התערבות.
 *
 * זיהוי: אם A1 אינו 'מזהה', שורת הכותרות נדרסה.
 * תיקון: מכניסים שורת כותרות נקייה מעל, ואז מנקים משורות הנתונים תאים
 * שהערך שבהם זהה לשם הכותרת של אותה עמודה — אלה בדיוק השאריות של הדריסה. */
function gymRepairHeaders_(sh) {
  if (sh.getLastRow() < 1) return false;
  var width = Math.max(sh.getLastColumn(), GYM_HEADERS.length);
  var first = sh.getRange(1, 1, 1, width).getValues()[0];
  if (String(first[0]).trim() === GYM_HEADERS[0]) return false;   // תקין

  sh.insertRowBefore(1);
  sh.getRange(1, 1, 1, GYM_HEADERS.length).setValues([GYM_HEADERS]);
  sh.getRange(1, 1, 1, GYM_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);

  // ניקוי שאריות הדריסה בשורות הנתונים שמתחת
  var lastRow = sh.getLastRow();
  if (lastRow >= 2) {
    var n = lastRow - 1;
    var rng = sh.getRange(2, 1, n, GYM_HEADERS.length);
    var vals = rng.getValues();
    var changed = false;
    for (var r = 0; r < vals.length; r++) {
      for (var c = 0; c < GYM_HEADERS.length; c++) {
        if (String(vals[r][c]).trim() === GYM_HEADERS[c]) { vals[r][c] = ''; changed = true; }
      }
    }
    if (changed) rng.setValues(vals);
    // עמודות שמעבר לכותרות הקבועות (עמודות השאלון) איבדו את הכותרת שלהן
    // בדריסה, ולכן הערכים שם יתומים. מנקים אותן; ensureGymQuestionCols_
    // ייצור עמודות שאלון נקיות מיד אחרי.
    var extra = sh.getLastColumn() - GYM_HEADERS.length;
    if (extra > 0) sh.getRange(1, GYM_HEADERS.length + 1, lastRow, extra).clearContent();
  }
  Logger.log('gymRepairHeaders_: שורת הכותרות שוחזרה');
  return true;
}

function nextGymId_(sh, cols) {
  var last = sh.getLastRow();
  if (last < 2 || !cols['מזהה']) return 'GYM-0001';
  var ids = sh.getRange(2, cols['מזהה'], last - 1, 1).getValues();
  var max = 0;
  for (var i = 0; i < ids.length; i++) {
    var m = String(ids[i][0]).match(/(\d+)\s*$/);
    if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
  }
  var next = String(max + 1);
  while (next.length < 4) next = '0' + next;
  return 'GYM-' + next;
}

/** גיל מלא בשנים מתאריך לידה (מחרוזת YYYY-MM-DD). מחזיר -1 אם לא ניתן לחשב. */
function gymAge_(birth) {
  if (!birth) return -1;
  var d = new Date(String(birth).length <= 10 ? String(birth) + 'T00:00:00' : birth);
  if (isNaN(d.getTime())) return -1;
  var now = new Date();
  var age = now.getFullYear() - d.getFullYear();
  var m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

/** שומר את תמונת החתימה (dataURL מהקנבס) בדרייב ומחזיר קישור לצפייה.
 * אותה תיקיית-שורש של הקבלות, תת-תיקייה נפרדת — כדי שהכול יישאר במקום אחד
 * שיועד כבר מכיר, ובלי לפזר קבצים בדרייב. */
function gymSaveSignature_(dataUrl, fileName) {
  if (!dataUrl || String(dataUrl).indexOf('data:image/') !== 0) return '';
  try {
    var parts = String(dataUrl).split(',');
    var meta = parts[0];
    var mime = meta.substring(meta.indexOf(':') + 1, meta.indexOf(';'));
    var bytes = Utilities.base64Decode(parts[1]);
    var blob = Utilities.newBlob(bytes, mime, fileName + '.png');
    var root = DriveApp.getFolderById(ROOT_RECEIPTS_FOLDER_ID);
    var gymFolder = findOrCreateSubfolder_(root, 'מכון כושר');
    var sigFolder = findOrCreateSubfolder_(gymFolder, 'הצהרות בריאות');
    var file = sigFolder.createFile(blob);
    return file.getUrl();
  } catch (err) {
    Logger.log('שמירת חתימה נכשלה: ' + err);
    return '';
  }
}

/** מחשב אילו שאלות הרימו דגל. מחזיר את **התוויות הקצרות** (לא מזהי Q) כדי
 * שגם המייל וגם המסך יהיו קריאים לבן אדם. */
function gymEvalFlags_(questions, answers) {
  var flagged = [], blocking = false;
  answers = answers || {};
  for (var i = 0; i < questions.length; i++) {
    var q = questions[i];
    if (!q.active || !q.flag) continue;
    var ans = String(answers[q.id] == null ? '' : answers[q.id]).trim();
    if (ans !== 'כן') continue;
    flagged.push(q.label || q.id);
    if (q.flag === 'חוסם') blocking = true;
  }
  return { flagged: flagged, blocking: blocking };
}

/** שורה ביומן. כל שינוי מצב נרשם — זה מה שיאפשר בשלב 3 לחשב סנכרון תשלומים
 * ולהסביר בדיעבד "למה המנוי הזה נראה ככה". */
function gymLog_(ss, membershipId, type, extra) {
  try {
    var sh = ss.getSheetByName(GYM_LOG_SHEET);
    if (!sh) return;
    extra = extra || {};
    var cols = gymCols_(sh);
    var row = [];
    for (var c = 0; c < sh.getLastColumn(); c++) row.push('');
    function put(name, val) { if (cols[name]) row[cols[name] - 1] = val; }
    put('מזהה אירוע', 'LOG-' + Date.now());
    put('מזהה מנוי', membershipId);
    put('תאריך', new Date());
    put('סוג אירוע', type);
    put('סכום', extra.amount || '');
    put('אמצעי תשלום', extra.method || '');
    put('אסמכתא', extra.ref || '');
    put('בתוקף עד (אחרי)', extra.validUntil || '');
    put('בוצע ע"י', extra.by || '');
    put('הערה', extra.note || '');
    sh.appendRow(row);
  } catch (err) {
    Logger.log('כתיבה ליומן המכון נכשלה: ' + err);
  }
}

/** תוכן האשף. פתוח לכל תושב מחובר ופעיל — אין כאן שום דבר רגיש: נוסח השאלון
 * והתקנון גלויים ממילא לכל מי שנרשם, וקוד הכניסה לא נכלל. */
function handleGymForm_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureGymSheets_(ss);
    var cfg = readGymSettings_(ss);
    var me = lookupResident_(gate.email);
    return json_({
      ok: true,
      questions: cfg.questions.filter(function (q) { return q.active; }),
      rules:     cfg.rules.filter(function (r) { return r.active; }),
      plans:     cfg.plans.filter(function (pl) { return pl.active; }),
      minAge:    Number(cfg.settings['גיל מינימום']) || 18,
      // מילוי מראש — כדי שהתושב יקליד כמה שפחות. ת.ז. מגיעה מטאב "תושבים"
      // אם כבר נאספה בעבר, ואז לא נשאל עליה שוב.
      prefill: me.found ? {
        firstName: me.firstName || '', lastName: me.family || '',
        house: me.house || '', familyId: me.familyId || '',
        idNumber: gymResidentIdNumber_(ss, me)
      } : null
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** קורא "ת.ז. N" מטאב התושבים לפי המשבצת של אותו אדם (slot), באותו היגיון
 * בדיוק כמו "אימייל N"/"הרשאות N". מחזיר '' אם העמודה עוד לא מולאה. */
function gymResidentIdNumber_(ss, me) {
  try {
    if (!me || !me.found) return '';
    var sh = ss.getSheetByName('תושבים');
    if (!sh) return '';
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    var col = headers.indexOf('ת.ז. ' + me.slot);
    if (col === -1) return '';
    return String(sh.getRange(me.rowIndex, col + 1).getValue()).trim();
  } catch (err) { return ''; }
}

/** כותב את הת.ז. חזרה לטאב "תושבים" (עמודה לפי המשבצת). זה מה שגורם למאגר
 * הת.ז. להתמלא מעצמו לאורך גל ההרשמה, בלי מבצע איסוף נפרד. לא דורס ערך קיים. */
function gymWriteResidentId_(ss, me, idNumber) {
  try {
    if (!me || !me.found || !idNumber) return;
    ensureResidentCols_(ss, {});
    var sh = ss.getSheetByName('תושבים');
    if (!sh) return;
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    var col = headers.indexOf('ת.ז. ' + me.slot);
    if (col === -1) return;
    var cell = sh.getRange(me.rowIndex, col + 1);
    if (String(cell.getValue()).trim()) return;   // כבר קיים — לא נוגעים
    cell.setValue(idNumber);
  } catch (err) {
    Logger.log('כתיבת ת.ז. לטאב תושבים נכשלה: ' + err);
  }
}

/** המנוי של המשתמש המחובר. **תמיד לפי האימייל שבמושב החתום** ולעולם לא לפי
 * פרמטר מהלקוח — אחרת כל תושב היה יכול לבקש את המנוי של שכן.
 * קוד הכניסה עדיין לא מוחזר כאן; הוא מצטרף בשלב 4 יחד עם כרטיס המנוי. */
function handleGymMy_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var found = gymFindRow_(sh, cols, gate.email);
    var cfg = readGymSettings_(ss);
    var membership = null;
    if (found.row) {
      var values = sh.getRange(found.row, 1, 1, sh.getLastColumn()).getValues()[0];
      var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
      membership = {};
      for (var i = 0; i < headers.length; i++) {
        var h = String(headers[i]).trim();
        if (!h) continue;
        var v = values[i];
        membership[h] = (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd')
                                            : String(v == null ? '' : v);
      }
    }
    /* --- קוד הכניסה (שלב 4, 2026-08-19) ---
     * נשלח ללקוח **אך ורק** אם המנוי פעיל ותאריך התוקף עוד לא עבר, והבדיקה
     * נעשית כאן בשרת ולא במסך. הסיבה: מסך אפשר לרמות, שרת לא. התקנון שלכם
     * גם אוסר במפורש להעביר את הקוד, ולכן הוא גם לא נכנס לשום מייל. */
    var entryCode = '';
    var declValidUntil = '';
    var declMonths = Number(cfg.settings['תוקף הצהרה בחודשים']) || 24;
    if (membership) {
      var isActive = String(membership['סטטוס'] || '').trim() === GYM_ST_ACTIVE;
      var until = gymToDate_(membership['בתוקף עד']);
      var stillValid = until ? (until.getTime() >= new Date().setHours(0, 0, 0, 0)) : false;
      if (isActive && stillValid) entryCode = String(cfg.settings['קוד כניסה'] || '').trim();

      // עד מתי ההצהרה שנחתמה עדיין תקפה — זה מה שקובע אם חידוש ידרוש
      // למלא את השאלון מחדש או שיהיה שתי לחיצות בלבד.
      var signed = gymToDate_(membership['תאריך חתימה']);
      if (signed) {
        var dv = new Date(signed.getTime());
        dv.setMonth(dv.getMonth() + declMonths);
        declValidUntil = Utilities.formatDate(dv, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      }
    }

    return json_({
      ok: true,
      membership: membership,
      plans: cfg.plans.filter(function (pl) { return pl.active; }),
      declarationMonths: declMonths,
      declarationValidUntil: declValidUntil,
      renewDaysBefore: Number(cfg.settings['ימים לתזכורת חידוש']) || 14,
      entryCode: entryCode,
      hasEntryCode: !!String(cfg.settings['קוד כניסה'] || '').trim(),
      payboxUrl: String(cfg.settings['קישור פייבוקס'] || '').trim()
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** הרשמה עצמית של תושב. מטפלת בשני מצבים: בקשה חדשה לגמרי, והשלמת הצהרה
 * למנוי שמנהל כבר הקים ("ממתין להצהרה"). */
function submitGymApplication_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGymSheets_(ss);
    var cfg = readGymSettings_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var email = normalizeEmail_(body._email);
    var me = lookupResident_(email);

    // --- ולידציה. נכשלים לפני שנוגעים בגיליון, לא אחרי. ---
    var minAge = Number(cfg.settings['גיל מינימום']) || 18;
    var age = gymAge_(body.birthDate);
    if (age < 0) return { ok: false, error: 'חסר תאריך לידה תקין' };
    if (age < minAge) {
      return { ok: false, error: 'ההרשמה העצמאית אפשרית מגיל ' + minAge +
        '. מתחת לגיל זה יש לפנות לאחראית חדר הכושר.' };
    }
    var activeQs = cfg.questions.filter(function (q) { return q.active; });
    var answers = body.answers || {};
    for (var i = 0; i < activeQs.length; i++) {
      var a = String(answers[activeQs[i].id] == null ? '' : answers[activeQs[i].id]).trim();
      if (a !== 'כן' && a !== 'לא') {
        return { ok: false, error: 'יש לענות על כל שאלות ההצהרה (חסר: ' + activeQs[i].label + ')' };
      }
    }
    var activeRules = cfg.rules.filter(function (r) { return r.active; });
    var acks = body.ruleAcks || {};
    for (var j = 0; j < activeRules.length; j++) {
      if (!acks[activeRules[j].id]) {
        return { ok: false, error: 'יש לאשר קריאה של כל מקטעי התקנון' };
      }
    }
    if (!body.signature) return { ok: false, error: 'חסרה חתימה' };

    var plan = null;
    var existing = gymFindRow_(sh, cols, email);
    var isCompletion = existing.row && existing.status === GYM_ST_DECLARATION;
    if (isCompletion && cols['מסלול']) {
      // מנוי שהמנהל הקים — המסלול כבר נקבע, לא נותנים לתושב לשנות אותו
      var existingPlanName = String(sh.getRange(existing.row, cols['מסלול']).getValue()).trim();
      for (var k = 0; k < cfg.plans.length; k++) {
        if (cfg.plans[k].name === existingPlanName) { plan = cfg.plans[k]; break; }
      }
    }
    if (!plan) {
      for (var m = 0; m < cfg.plans.length; m++) {
        if (cfg.plans[m].id === body.planId && cfg.plans[m].active) { plan = cfg.plans[m]; break; }
      }
    }
    if (!plan) return { ok: false, error: 'לא נבחר מסלול תקין' };

    if (existing.row && !isCompletion && GYM_OPEN_STATUSES.indexOf(existing.status) !== -1) {
      return { ok: false, error: 'כבר קיימת עבורך בקשה פעילה במכון (סטטוס: ' + existing.status + ')' };
    }

    // --- חישוב דגלים והסטטוס שנובע מהם ---
    var flags = gymEvalFlags_(activeQs, answers);
    var autoApprove = String(cfg.settings['אישור אוטומטי ללא דגלים'] || 'כן').trim() !== 'לא';
    var status;
    if (flags.blocking)      status = GYM_ST_DOCTOR;
    else if (autoApprove)    status = GYM_ST_PAYMENT;
    else                     status = GYM_ST_REVIEW;

    var now = new Date();
    var rowIndex = isCompletion ? existing.row : 0;
    var id = rowIndex ? String(sh.getRange(rowIndex, cols['מזהה']).getValue()).trim()
                      : nextGymId_(sh, cols);
    var sigUrl = gymSaveSignature_(body.signature, 'חתימה ' + id + ' ' +
      Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd'));

    if (!rowIndex) {
      // שורה ריקה בגודל הכותרות (appendRow לא מקבל מערך ריק), וממלאים אותה
      // בכתיבות ממוקדות לפי שם עמודה — עמיד לשינוי סדר עמודות בגיליון.
      rowIndex = gymAppendBlankRow_(sh);
    }
    // כתיבה מרוכזת — כל השדות נאספים בזיכרון ונכתבים בנסיעה אחת (ר' gymRowWriter_)
    var w = gymRowWriter_(sh, rowIndex);
    cols = w.cols;
    function put(name, val) { w.set(name, val); }

    put('מזהה', id);
    put('מזהה קבוע', me.found ? me.familyId : '');
    put('אימייל', email);
    put('שם פרטי', body.firstName || (me.found ? me.firstName : ''));
    put('שם משפחה', body.lastName || (me.found ? me.family : ''));
    put('טלפון', body.phone || '');
    put('מספר בית', body.house || (me.found ? me.house : ''));
    put('ת.ז.', body.idNumber || '');
    put('תאריך לידה', body.birthDate || '');
    put('מסלול', plan.name);
    put('מחיר מוסכם', plan.total);
    put('סטטוס', status);
    put('שאלות שנענו בכן', flags.flagged.join(', '));
    put('דגלים', flags.blocking ? 'חוסם' : (flags.flagged.length ? 'התראה' : ''));
    put('תאריך חתימה', now);
    put('קישור חתימה', sigUrl);
    put('גרסת שאלון', activeQs.length ? activeQs.length : '');
    put('אישור תקנון', activeRules.map(function (r) { return r.id; }).join(', '));
    if (!isCompletion) put('הוגש בתאריך', now);

    // תשובות השאלון -> עמודות. הכותרת היא ה"כותרת" הקצרה של השאלה.
    for (var q2 = 0; q2 < activeQs.length; q2++) {
      put(activeQs[q2].label, String(answers[activeQs[q2].id]).trim());
    }
    w.flush();   // ← הכתיבה היחידה לגיליון בכל הפונקציה

    gymWriteResidentId_(ss, me, body.idNumber);
    gymLog_(ss, id, isCompletion ? 'השלמת הצהרה' : 'הגשת בקשה', {
      by: email, note: flags.flagged.length ? ('דגלים: ' + flags.flagged.join(', ')) : ''
    });

    // --- מיילים (אותה מערכת תבניות כמו כל השאר, ר' הגדרות מיילים) ---
    var displayName = (body.firstName || (me.found ? me.firstName : '') || email);
    try {
      sendResidentTemplate_(ss, 'GYM_APPLICATION_RECEIVED', [email], { 'שם': displayName });
      if (flags.blocking) {
        sendResidentTemplate_(ss, 'GYM_DOCTOR_NOTE_REQUIRED', [email], {
          'שם': displayName, 'שאלות': flags.flagged.join(', ')
        });
        notifyAdmins_(ss, PERM_GYM, 'ADMIN_NEW_GYM_FLAGGED', {
          'שם': displayName, 'אימייל': email,
          'שאלות': flags.flagged.join(', '), 'קישור': CBA_APP_URL
        });
      } else if (status === GYM_ST_PAYMENT) {
        sendResidentTemplate_(ss, 'GYM_APPROVED_AWAITING_PAYMENT', [email], {
          'שם': displayName, 'סכום': plan.total, 'מסלול': plan.name
        });
      }
    } catch (mailErr) { Logger.log('מייל מכון נכשל: ' + mailErr); }

    return { ok: true, id: id, status: status, flagged: flags.flagged };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** הקמת מנוי ידנית ע"י מנהל המכון. נולד תמיד כ"ממתין לתשלום" (או "ממתין
 * להצהרה" אם המנהל בחר לבקש מהתושב למלא) — אף פעם לא כפעיל, כי אימות התשלום
 * הוא תמיד ידני. ר' ההערה בראש הסעיף. */
function createGymMembership_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGymSheets_(ss);
    var cfg = readGymSettings_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);

    var email = normalizeEmail_(body.email);
    if (!email) return { ok: false, error: 'חסר אימייל' };
    var me = lookupResident_(email);
    if (!me.found) {
      return { ok: false, error: 'האימייל אינו רשום בטאב "תושבים". יש להוסיף את התושב קודם.' };
    }

    var existing = gymFindRow_(sh, cols, email);
    if (existing.row && GYM_OPEN_STATUSES.indexOf(existing.status) !== -1) {
      return { ok: false, error: 'כבר קיים מנוי פתוח לאימייל הזה (סטטוס: ' + existing.status + ')' };
    }

    var plan = null;
    for (var i = 0; i < cfg.plans.length; i++) {
      if (cfg.plans[i].id === body.planId) { plan = cfg.plans[i]; break; }
    }
    if (!plan) plan = cfg.plans[0];
    if (!plan) return { ok: false, error: 'לא הוגדר מסלול מנוי בהגדרות המכון' };

    // "התקבלה" = הצהרה על נייר, נשמר התאריך. "בקשה" = נשלח מייל לתושב.
    var mode = String(body.declarationMode || 'request').trim();
    var status = (mode === 'received') ? GYM_ST_PAYMENT : GYM_ST_DECLARATION;

    var now = new Date();
    var id = nextGymId_(sh, cols);
    var rowIndex = gymAppendBlankRow_(sh);
    var w = gymRowWriter_(sh, rowIndex);
    cols = w.cols;
    function put(name, val) { w.set(name, val); }

    put('מזהה', id);
    put('מזהה קבוע', me.familyId || '');
    put('אימייל', email);
    put('שם פרטי', body.firstName || me.firstName || '');
    put('שם משפחה', body.lastName || me.family || '');
    put('טלפון', body.phone || '');
    put('מספר בית', body.house || me.house || '');
    put('ת.ז.', body.idNumber || '');
    put('תאריך לידה', body.birthDate || '');
    put('מסלול', plan.name);
    put('מחיר מוסכם', plan.total);
    put('סטטוס', status);
    put('הוגש בתאריך', now);
    put('טופל בתאריך', now);
    put('טופל ע"י', body._email || '');
    put('הערות מנהל', body.note || '');
    if (mode === 'received') {
      put('תאריך חתימה', body.declarationDate || now);
      put('קישור חתימה', 'הצהרה נמסרה בנייר');
    }

    w.flush();

    gymWriteResidentId_(ss, me, body.idNumber);
    gymLog_(ss, id, 'הקמה ידנית', {
      by: body._email || '',
      note: (mode === 'received' ? 'הצהרה נמסרה בנייר' : 'נשלחה בקשה למילוי הצהרה') +
            (body.note ? (' · ' + body.note) : '')
    });

    var displayName = body.firstName || me.firstName || email;
    try {
      if (mode === 'received') {
        sendResidentTemplate_(ss, 'GYM_APPROVED_AWAITING_PAYMENT', [email], {
          'שם': displayName, 'סכום': plan.total, 'מסלול': plan.name
        });
      } else {
        sendResidentTemplate_(ss, 'GYM_DECLARATION_REQUEST', [email], {
          'שם': displayName, 'קישור': CBA_APP_URL
        });
      }
    } catch (mailErr) { Logger.log('מייל הקמה ידנית נכשל: ' + mailErr); }

    return { ok: true, id: id, status: status };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** "בקשת הצהרה" על מנוי קיים — מחזיר אותו ל"ממתין להצהרה" ושולח מייל.
 * שימושי גם כשמנוי הוקם עם "הצהרה בנייר" ואז מתברר שצריך הצהרה דיגיטלית. */
function requestGymDeclaration_(ss, body) {
  try {
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var id = String(body.id || '').trim();
    if (!id) return { ok: false, error: 'חסר מזהה מנוי' };

    var last = sh.getLastRow();
    var ids = sh.getRange(2, cols['מזהה'], last - 1, 1).getValues();
    var rowIndex = 0;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) { rowIndex = i + 2; break; }
    }
    if (!rowIndex) return { ok: false, error: 'המנוי לא נמצא' };

    var email = String(sh.getRange(rowIndex, cols['אימייל']).getValue()).trim();
    var name = String(sh.getRange(rowIndex, cols['שם פרטי']).getValue()).trim() || email;
    sh.getRange(rowIndex, cols['סטטוס']).setValue(GYM_ST_DECLARATION);

    gymLog_(ss, id, 'בקשת הצהרה', { by: body._email || '' });
    try {
      sendResidentTemplate_(ss, 'GYM_DECLARATION_REQUEST', [email], {
        'שם': name, 'קישור': CBA_APP_URL
      });
    } catch (mailErr) { Logger.log('מייל בקשת הצהרה נכשל: ' + mailErr); }

    return { ok: true, id: id, status: GYM_ST_DECLARATION };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/* ============================================================================
 *  מכון כושר — שלב 3: תשלום, אימות ותוקף (2026-08-19)
 * ----------------------------------------------------------------------------
 *  ההחלטה המרכזית של יועד כאן: **התוקף נקבע ידנית, לא בנוסחה.** מנהל/ת המכון
 *  מזין/ה עד איזה חודש המנוי בתוקף, יכול/ה להאריך בכל רגע ומכל סיבה, והמערכת
 *  לעולם לא חוסמת — היא רק **מודדת ומתריעה** על פער מול מה ששולם בפועל.
 *
 *  למה דווקא ככה: המציאות בוועד היא לא נוסחה. לפעמים מאריכים חודש כמחווה,
 *  לפעמים מישהו שילם במזומן ולא נרשם. מערכת שחוסמת הייתה מייצרת עקיפות ידניות
 *  מחוץ למערכת ומאבדת את האמון; מערכת שמודדת משאירה את השליטה בידיים ולא נותנת
 *  לפער להישכח.
 *
 *  זרימת הכסף:
 *    התושב משלם בפייבוקס → מדווח (עם צילום אישור, אופציונלי, שנסרק ב-Gemini)
 *    → הסטטוס עובר ל"ממתין לאימות" → מנהל/ת מאמת/ת, קובע/ת חודש תוקף
 *    → המנוי הופך ל"פעיל". **תמיד ידני, גם למי שהוקם ידנית.**
 * ========================================================================== */

/** מוצא מסלול לפי שמו כפי שנשמר בשורת המנוי. המחיר החודשי שלו הוא הבסיס
 * לחישוב "כמה חודשים שולמו" — ולכן הוא שדה נפרד ולא רק מחיר כולל. */
function gymPlanByName_(cfg, name) {
  var target = String(name || '').trim();
  for (var i = 0; i < cfg.plans.length; i++) {
    if (cfg.plans[i].name === target) return cfg.plans[i];
  }
  return cfg.plans[0] || null;
}

/** "YYYY-MM" -> אובייקט Date של **היום האחרון** באותו חודש. ככה "בתוקף עד
 * פברואר" באמת אומר עד סוף פברואר, ולא עד ה-1 בו. */
function gymMonthEnd_(ym) {
  var m = String(ym || '').match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]), 0);   // יום 0 של החודש הבא = סוף החודש הנוכחי
}

/** מספר חודשים כולל בין שני תאריכים (כולל חודש ההתחלה וחודש הסיום). */
function gymMonthsBetween_(from, to) {
  if (!from || !to) return 0;
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
}

function gymToDate_(v) {
  if (!v) return null;
  if (v instanceof Date) return v;
  var d = new Date(String(v).length <= 10 ? String(v) + 'T00:00:00' : String(v));
  return isNaN(d.getTime()) ? null : d;
}

/** מוצא שורת מנוי לפי מזהה. */
function gymRowById_(sh, cols, id) {
  var last = sh.getLastRow();
  if (last < 2 || !cols['מזהה']) return 0;
  var ids = sh.getRange(2, cols['מזהה'], last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) return i + 2;
  }
  return 0;
}

/** לב מנגנון הסנכרון. מחשב שני מספרים ומשווה:
 *    חודשים שהוקצו = מתאריך ההתחלה עד "בתוקף עד" (מה שהמנהל קבע בפועל)
 *    חודשים ששולמו = סך התשלומים ביומן ÷ המחיר החודשי של המסלול
 * ומחזיר תגית קריאה. גם כותב את התוצאה חזרה לשורה, כדי שהיא תהיה גלויה
 * בגיליון עצמו ולא רק במסך.
 *
 * "עודף" מוצג כמידע ולא כאזהרה: הוא בדרך כלל אומר ששכחו להאריך, לא שמישהו
 * טעה. "חוסר" הוא זה שדורש תשומת לב. */
function gymPaymentSync_(ss, id) {
  var sh = ss.getSheetByName(GYM_SHEET);
  var cols = gymCols_(sh);
  var row = gymRowById_(sh, cols, id);
  if (!row) return { ok: false, error: 'המנוי לא נמצא' };

  var cfg = readGymSettings_(ss);
  var planName = cols['מסלול'] ? String(sh.getRange(row, cols['מסלול']).getValue()).trim() : '';
  var plan = gymPlanByName_(cfg, planName);
  var monthly = (plan && plan.monthlyPrice) || 0;

  // סכימת התשלומים מהיומן — היומן הוא מקור האמת, לא שדה מסוכם בשורה
  var totalPaid = 0, lastPaid = '';
  var logSh = ss.getSheetByName(GYM_LOG_SHEET);
  if (logSh && logSh.getLastRow() > 1) {
    var lc = gymCols_(logSh);
    var n = logSh.getLastRow() - 1;
    var rows = logSh.getRange(2, 1, n, logSh.getLastColumn()).getValues();
    for (var i = 0; i < rows.length; i++) {
      var rid = lc['מזהה מנוי'] ? String(rows[i][lc['מזהה מנוי'] - 1]).trim() : '';
      var typ = lc['סוג אירוע'] ? String(rows[i][lc['סוג אירוע'] - 1]).trim() : '';
      if (rid !== String(id).trim() || typ !== 'תשלום') continue;
      var amt = lc['סכום'] ? Number(rows[i][lc['סכום'] - 1]) : 0;
      if (!isNaN(amt)) totalPaid += amt;
      var dt = lc['תאריך'] ? rows[i][lc['תאריך'] - 1] : '';
      if (dt) lastPaid = (dt instanceof Date)
        ? Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd') : String(dt);
    }
  }

  var start = gymToDate_(cols['תאריך התחלה'] ? sh.getRange(row, cols['תאריך התחלה']).getValue() : '');
  var end   = gymToDate_(cols['בתוקף עד'] ? sh.getRange(row, cols['בתוקף עד']).getValue() : '');
  var allocated = (start && end) ? gymMonthsBetween_(start, end) : 0;
  var paidMonths = monthly ? (totalPaid / monthly) : 0;

  // סובלנות של חצי חודש — כדי שעיגולים לא יסמנו פער שלא קיים באמת
  var diff = Math.round((paidMonths - allocated) * 10) / 10;
  var label;
  if (!allocated && !totalPaid) label = '';
  else if (Math.abs(diff) < 0.5) label = 'מסונכרן';
  else if (diff < 0) label = 'חוסר ' + Math.round(Math.abs(diff)) + ' חודשים';
  else label = 'עודף ' + Math.round(diff) + ' חודשים';

  var w = gymRowWriter_(sh, row);
  w.set('סה"כ שולם', totalPaid || '');
  w.set('תשלום אחרון', lastPaid);
  w.set('חודשים ששולמו', monthly ? Math.round(paidMonths * 10) / 10 : '');
  w.set('מצב סנכרון', label);
  w.flush();

  return {
    ok: true, totalPaid: totalPaid, monthly: monthly,
    allocatedMonths: allocated, paidMonths: Math.round(paidMonths * 10) / 10,
    diff: diff, label: label
  };
}

/** סריקת צילום אישור התשלום. אותו מנגנון בדיוק כמו סריקת קבלות שכבר עובד —
 * רק פרומפט אחר, שמותאם לאישור העברה בפייבוקס/ביט ולא לחשבונית ספק.
 * הפלט תמיד חוזר ללקוח לעריכה ולעולם לא נשמר אוטומטית. */
function scanGymPayment_(ss, body) {
  if (!body.dataBase64) return { ok: false, error: 'לא צורפה תמונה לסריקה' };
  var key = geminiApiKey_();
  if (!key) return { ok: false, error: 'GEMINI_API_KEY חסר בהגדרות הסקריפט.' };

  var prompt = 'זהו צילום מסך של אישור תשלום מאפליקציית תשלומים ישראלית (פייבוקס, ביט, ' +
    'העברה בנקאית וכדומה). חלץ ממנו את השדות הבאים והחזר אך ורק JSON תקין, בלי טקסט נוסף: ' +
    '{"amount": מספר (הסכום ששולם, בלי סימן מטבע), ' +
    '"date": מחרוזת בפורמט YYYY-MM-DD (תאריך התשלום כפי שמופיע; אם מופיע רק "היום" או ' +
    'שעה בלבד — החזר מחרוזת ריקה), ' +
    '"reference": מחרוזת (מספר אסמכתא/עסקה/אישור אם מופיע, אחרת ריק), ' +
    '"payer": מחרוזת (שם המשלם אם מופיע, אחרת ריק), ' +
    '"method": מחרוזת (שם האפליקציה/אמצעי התשלום, למשל "פייבוקס" או "ביט"; אחרת ריק)}. ' +
    'אם שדה לא ברור או לא מופיע — החזר ערך ריק (0 למספר, "" למחרוזת). לעולם אל תמציא ערך.';

  var payload = {
    contents: [{ parts: [
      { text: prompt },
      { inline_data: { mime_type: body.mimeType || 'image/jpeg', data: body.dataBase64 } }
    ] }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: {
        type: 'OBJECT',
        properties: {
          amount: { type: 'NUMBER' }, date: { type: 'STRING' },
          reference: { type: 'STRING' }, payer: { type: 'STRING' }, method: { type: 'STRING' }
        },
        required: ['amount', 'date', 'reference', 'payer', 'method']
      }
    }
  };

  try {
    var resp = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL +
      ':generateContent?key=' + encodeURIComponent(key),
      { method: 'post', contentType: 'application/json',
        payload: JSON.stringify(payload), muteHttpExceptions: true });
    if (resp.getResponseCode() !== 200) {
      return { ok: false, error: 'Gemini החזיר קוד ' + resp.getResponseCode() };
    }
    var data = JSON.parse(resp.getContentText());
    var text = data.candidates && data.candidates[0] && data.candidates[0].content &&
               data.candidates[0].content.parts && data.candidates[0].content.parts[0] &&
               data.candidates[0].content.parts[0].text;
    if (!text) return { ok: false, error: 'תשובה לא צפויה מ-Gemini' };
    return { ok: true, fields: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: 'שגיאה בסריקה: ' + String(e) };
  }
}

/** דיווח תשלום ע"י התושב. לא מפעיל את המנוי — רק מסמן שדווח וממתין לאימות. */
function reportGymPayment_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var email = normalizeEmail_(body._email);
    var found = gymFindRow_(sh, cols, email);
    if (!found.row) return { ok: false, error: 'לא נמצא עבורך מנוי' };
    if (found.status !== GYM_ST_PAYMENT && found.status !== GYM_ST_VERIFY) {
      return { ok: false, error: 'המנוי אינו בשלב תשלום (סטטוס: ' + found.status + ')' };
    }
    var row = found.row;
    var id = String(sh.getRange(row, cols['מזהה']).getValue()).trim();

    var proofUrl = '';
    if (body.dataBase64) {
      proofUrl = gymSaveSignature_('data:' + (body.mimeType || 'image/jpeg') + ';base64,' + body.dataBase64,
        'אישור תשלום ' + id);
    }

    var w = gymRowWriter_(sh, row);
    function put(name, val) { w.set(name, val); }
    put('סטטוס', GYM_ST_VERIFY);
    put('סטטוס תשלום', 'דווח ע"י תושב');
    put('אמצעי תשלום', body.method || 'פייבוקס');
    put('אסמכתא', body.reference || '');
    put('דווח בתאריך', body.date || new Date());
    if (proofUrl) put('קישור אישור', proofUrl);
    w.flush();

    // לא נכתב ליומן כ"תשלום"! רק אימות של מנהל יוצר שורת תשלום אמיתית —
    // אחרת דיווח שלא אומת היה משפיע על חישוב הסנכרון.
    gymLog_(ss, id, 'דיווח תשלום', {
      amount: body.amount || '', method: body.method || '', ref: body.reference || '',
      by: email, note: proofUrl ? 'צורף צילום אישור' : ''
    });

    var name = String(sh.getRange(row, cols['שם פרטי']).getValue()).trim() || email;
    try {
      sendResidentTemplate_(ss, 'GYM_PAYMENT_REPORTED', [email], {
        'שם': name, 'סכום': body.amount || ''
      });
      notifyAdmins_(ss, PERM_GYM, 'ADMIN_GYM_PAYMENT_REPORTED', {
        'שם': name, 'סכום': body.amount || '', 'מזהה': id,
        'אמצעי': body.method || '', 'אסמכתא': body.reference || '', 'קישור': CBA_APP_URL
      });
    } catch (mailErr) { Logger.log('מייל דיווח תשלום נכשל: ' + mailErr); }

    return { ok: true, id: id, status: GYM_ST_VERIFY };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** הפעלת מנוי אחרי אימות תשלום. **כאן נקבעים התאריכים** — לא בהגשה ולא באישור.
 * validUntil מגיע כ-"YYYY-MM" והופך ליום האחרון באותו חודש. */
function gymActivate_(ss, body, isManual) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var id = String(body.id || '').trim();
    var row = gymRowById_(sh, cols, id);
    if (!row) return { ok: false, error: 'המנוי לא נמצא' };

    var end = gymMonthEnd_(body.validUntil);
    if (!end) return { ok: false, error: 'יש לבחור עד איזה חודש המנוי בתוקף' };
    var amount = Number(body.amount || 0);
    if (!(amount > 0)) return { ok: false, error: 'יש להזין את הסכום שהתקבל' };

    var start = gymToDate_(cols['תאריך התחלה'] ? sh.getRange(row, cols['תאריך התחלה']).getValue() : '');
    if (!start) start = new Date();

    var w = gymRowWriter_(sh, row);
    function put(name, val) { w.set(name, val); }
    put('תאריך התחלה', start);
    put('בתוקף עד', end);
    put('סטטוס', GYM_ST_ACTIVE);
    put('סטטוס תשלום', 'אומת');
    put('אמצעי תשלום', body.method || (isManual ? 'מזומן' : 'פייבוקס'));
    put('אסמכתא', body.reference || '');
    put('אומת בתאריך', new Date());
    put('אומת ע"י', body._email || '');
    if (body.note) put('הערות מנהל', body.note);
    w.flush();

    var validLabel = Utilities.formatDate(end, Session.getScriptTimeZone(), 'MM/yyyy');
    gymLog_(ss, id, 'תשלום', {
      amount: amount, method: body.method || (isManual ? 'מזומן' : 'פייבוקס'),
      ref: body.reference || '', validUntil: validLabel,
      by: body._email || '', note: isManual ? 'נרשם ידנית ע"י מנהל' : 'אומת מול דיווח התושב'
    });

    var sync = gymPaymentSync_(ss, id);

    var email = String(sh.getRange(row, cols['אימייל']).getValue()).trim();
    var name = String(sh.getRange(row, cols['שם פרטי']).getValue()).trim() || email;
    try {
      sendResidentTemplate_(ss, 'GYM_ACTIVE', [email], { 'שם': name, 'תוקף': validLabel });
    } catch (mailErr) { Logger.log('מייל הפעלת מנוי נכשל: ' + mailErr); }

    return { ok: true, id: id, status: GYM_ST_ACTIVE, validUntil: validLabel, sync: sync };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

function confirmGymPayment_(ss, body) { return gymActivate_(ss, body, false); }
function recordGymPayment_(ss, body)  { return gymActivate_(ss, body, true); }

/** "לא נמצא תשלום" — מחזיר את המנוי לשלב התשלום ומודיע לתושב. לא מוחק את
 * הדיווח מהיומן: חשוב שיישאר תיעוד שדווח ולא אותר. */
function rejectGymPayment_(ss, body) {
  try {
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var id = String(body.id || '').trim();
    var row = gymRowById_(sh, cols, id);
    if (!row) return { ok: false, error: 'המנוי לא נמצא' };

    var w = gymRowWriter_(sh, row);
    function put(name, val) { w.set(name, val); }
    put('סטטוס', GYM_ST_PAYMENT);
    put('סטטוס תשלום', 'לא אותר');
    if (body.note) put('הערות מנהל', body.note);
    w.flush();

    gymLog_(ss, id, 'תשלום לא אותר', { by: body._email || '', note: body.note || '' });

    var email = String(sh.getRange(row, cols['אימייל']).getValue()).trim();
    var name = String(sh.getRange(row, cols['שם פרטי']).getValue()).trim() || email;
    try {
      sendResidentTemplate_(ss, 'GYM_PAYMENT_NOT_FOUND', [email], {
        'שם': name, 'הערה': body.note ? (' ' + body.note) : ''
      });
    } catch (mailErr) { Logger.log('מייל תשלום לא אותר נכשל: ' + mailErr); }

    return { ok: true, id: id, status: GYM_ST_PAYMENT };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/** הארכת תוקף — זמינה תמיד, גם בלי תשלום חדש וגם באמצע תקופה. **לא חוסמת**:
 * אם ההארכה יוצרת פער מול מה ששולם, המידע חוזר ללקוח כדי שיציג אזהרה, אבל
 * הפעולה מתבצעת. זו בדיוק הדרישה של יועד. */
function extendGymMembership_(ss, body) {
  try {
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var id = String(body.id || '').trim();
    var row = gymRowById_(sh, cols, id);
    if (!row) return { ok: false, error: 'המנוי לא נמצא' };

    var end = gymMonthEnd_(body.validUntil);
    if (!end) return { ok: false, error: 'יש לבחור עד איזה חודש להאריך' };

    var start = gymToDate_(cols['תאריך התחלה'] ? sh.getRange(row, cols['תאריך התחלה']).getValue() : '');
    if (!start) { start = new Date(); if (cols['תאריך התחלה']) sh.getRange(row, cols['תאריך התחלה']).setValue(start); }

    var w = gymRowWriter_(sh, row);
    w.set('בתוקף עד', end);
    // הארכה מחזירה לפעיל מנוי שפג — זו בדיוק המטרה השכיחה של הפעולה
    if (String(w.get('סטטוס')).trim() === GYM_ST_EXPIRED) w.set('סטטוס', GYM_ST_ACTIVE);
    w.flush();

    var validLabel = Utilities.formatDate(end, Session.getScriptTimeZone(), 'MM/yyyy');
    gymLog_(ss, id, 'הארכת תוקף', {
      validUntil: validLabel, by: body._email || '', note: body.reason || ''
    });

    var sync = gymPaymentSync_(ss, id);

    var email = String(sh.getRange(row, cols['אימייל']).getValue()).trim();
    var name = String(sh.getRange(row, cols['שם פרטי']).getValue()).trim() || email;
    try {
      sendResidentTemplate_(ss, 'GYM_EXTENDED', [email], { 'שם': name, 'תוקף': validLabel });
    } catch (mailErr) { Logger.log('מייל הארכה נכשל: ' + mailErr); }

    return { ok: true, id: id, validUntil: validLabel, sync: sync };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

/* ============================================================================
 *  מכון כושר — שלב 4: חידוש מנוי (2026-08-19)
 * ----------------------------------------------------------------------------
 *  כאן משתלמת ההחלטה שההצהרה תקפה לשנתיים (כך כתוב בטופס שלכם): מכיוון
 *  שנרשמים לחצי שנה, **שלושה חידושים מתוך ארבעה לא דורשים שאלון בכלל** —
 *  רק בחירת מסלול ותשלום.
 *
 *  החידוש פותח **שורה חדשה** ולא דורס את הישנה, כדי שההיסטוריה תישמר: מי היה
 *  מנוי, מתי, וכמה שילם. השורה החדשה מצביעה על הקודמת בעמודת "מנוי קודם".
 *
 *  מה שלא משתנה: המנוי החדש נולד "ממתין לתשלום" ולעולם לא "פעיל". אימות
 *  התשלום ידני תמיד — גם בחידוש.
 * ========================================================================== */
function renewGymMembership_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGymSheets_(ss);
    var cfg = readGymSettings_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var email = normalizeEmail_(body._email);
    var me = lookupResident_(email);

    var prev = gymFindRow_(sh, cols, email);
    if (!prev.row) return { ok: false, error: 'לא נמצא מנוי קודם לחידוש' };
    if (GYM_OPEN_STATUSES.indexOf(prev.status) !== -1) {
      return { ok: false, error: 'המנוי הנוכחי עדיין פעיל או בטיפול (סטטוס: ' + prev.status + ')' };
    }

    // האם ההצהרה הקודמת עדיין בתוקף? זה מה שמחליט אם אפשר לחדש בלי שאלון.
    var declMonths = Number(cfg.settings['תוקף הצהרה בחודשים']) || 24;
    var signed = gymToDate_(cols['תאריך חתימה'] ? sh.getRange(prev.row, cols['תאריך חתימה']).getValue() : '');
    var declOk = false;
    if (signed) {
      var expiry = new Date(signed.getTime());
      expiry.setMonth(expiry.getMonth() + declMonths);
      declOk = expiry.getTime() >= Date.now();
    }
    if (!declOk) {
      return { ok: false, error: 'הצהרת הבריאות שלך אינה בתוקף יותר — יש למלא טופס הרשמה מלא.',
               needsDeclaration: true };
    }

    var plan = null;
    for (var i = 0; i < cfg.plans.length; i++) {
      if (cfg.plans[i].id === body.planId && cfg.plans[i].active) { plan = cfg.plans[i]; break; }
    }
    if (!plan) plan = cfg.plans[0];
    if (!plan) return { ok: false, error: 'לא הוגדר מסלול מנוי' };

    // מעתיקים את כל השורה הקודמת ומעדכנים רק את מה שמשתנה — כך שההצהרה,
    // התשובות והחתימה עוברות איתה, ולא נוצר מנוי בלי רקע רפואי.
    var prevValues = sh.getRange(prev.row, 1, 1, sh.getLastColumn()).getValues()[0];
    var prevId = cols['מזהה'] ? String(prevValues[cols['מזהה'] - 1]).trim() : '';
    var newId = nextGymId_(sh, cols);
    sh.appendRow(prevValues);
    var rowIndex = sh.getLastRow();
    var w = gymRowWriter_(sh, rowIndex);
    cols = w.cols;
    function put(name, val) { w.set(name, val); }

    put('מזהה', newId);
    put('מסלול', plan.name);
    put('מחיר מוסכם', plan.total);
    put('סטטוס', GYM_ST_PAYMENT);
    put('סטטוס תשלום', 'לא שולם');
    put('תאריך התחלה', '');
    put('בתוקף עד', '');
    put('סה"כ שולם', '');
    put('תשלום אחרון', '');
    put('חודשים ששולמו', '');
    put('מצב סנכרון', '');
    put('אמצעי תשלום', '');
    put('אסמכתא', '');
    put('דווח בתאריך', '');
    put('אומת בתאריך', '');
    put('אומת ע"י', '');
    put('הוגש בתאריך', new Date());
    put('טופל בתאריך', '');
    put('טופל ע"י', '');
    put('מנוי קודם', prevId);
    put('דגלי תזכורת', '');
    put('מזהה קבוע', me.found ? me.familyId : (cols['מזהה קבוע'] ? prevValues[cols['מזהה קבוע'] - 1] : ''));
    w.flush();

    gymLog_(ss, newId, 'חידוש מנוי', {
      by: email, note: 'חידוש של ' + prevId + ' · הצהרה מ-' +
        Utilities.formatDate(signed, Session.getScriptTimeZone(), 'yyyy-MM-dd') + ' עדיין בתוקף'
    });

    var name = String(sh.getRange(rowIndex, cols['שם פרטי']).getValue()).trim() || email;
    try {
      sendResidentTemplate_(ss, 'GYM_APPROVED_AWAITING_PAYMENT', [email], {
        'שם': name, 'סכום': plan.total, 'מסלול': plan.name
      });
    } catch (mailErr) { Logger.log('מייל חידוש נכשל: ' + mailErr); }

    return { ok: true, id: newId, status: GYM_ST_PAYMENT, previous: prevId };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 *  מכון כושר — עריכה, דחייה וביטול (2026-08-20)
 * ----------------------------------------------------------------------------
 *  עד עכשיו למנהל/ת המכון היו רק פעולות "מסלוליות" (אשר, אמת, האֲרך). בפועל
 *  צריך גם לתקן: מסלול שנבחר לא נכון, תאריך התחלה שגוי, סטטוס שצריך לחזור
 *  אחורה, וכמובן **דחייה וביטול** — שלא היו קיימים בכלל.
 *
 *  עיקרון: פעולה אחת שמקבלת רק את השדות שהשתנו, כותבת בכתיבה מרוכזת אחת,
 *  רושמת ביומן מה שונה (כדי שתמיד יהיה אפשר להסביר בדיעבד), ושולחת מייל
 *  לתושב רק כשהשינוי באמת נוגע לו — דחייה או ביטול.
 * ========================================================================== */

/** הסטטוסים שמותר להגיע אליהם בעריכה ידנית. רשימה סגורה בכוונה: סטטוס שאינו
 * ברשימה היה שובר את כל הלוגיקה שנשענת על השמות האלה. */
var GYM_EDITABLE_STATUSES = [
  GYM_ST_DECLARATION, GYM_ST_DOCTOR, GYM_ST_REVIEW, GYM_ST_PAYMENT,
  GYM_ST_VERIFY, GYM_ST_ACTIVE, GYM_ST_EXPIRED, GYM_ST_FROZEN,
  GYM_ST_REJECTED, GYM_ST_CANCELLED
];

function updateGymMembership_(ss, body) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGymSheets_(ss);
    var sh = ss.getSheetByName(GYM_SHEET);
    var cols = gymCols_(sh);
    var id = String(body.id || '').trim();
    var row = gymRowById_(sh, cols, id);
    if (!row) return { ok: false, error: 'המנוי לא נמצא' };

    var cfg = readGymSettings_(ss);
    var w = gymRowWriter_(sh, row);
    var changes = [];

    var prevStatus = String(w.get('סטטוס')).trim();

    if (body.planId) {
      var plan = null;
      for (var i = 0; i < cfg.plans.length; i++) if (cfg.plans[i].id === body.planId) plan = cfg.plans[i];
      if (plan) {
        if (String(w.get('מסלול')).trim() !== plan.name) changes.push('מסלול → ' + plan.name);
        w.set('מסלול', plan.name);
        if (body.price === undefined || body.price === '') w.set('מחיר מוסכם', plan.total);
      }
    }
    if (body.price !== undefined && body.price !== '') {
      var pr = Number(body.price);
      if (!isNaN(pr)) { changes.push('מחיר → ' + pr); w.set('מחיר מוסכם', pr); }
    }
    if (body.startDate) {
      var sd = gymToDate_(body.startDate);
      if (sd) { changes.push('תאריך התחלה → ' + body.startDate); w.set('תאריך התחלה', sd); }
    }
    if (body.validUntil) {
      var end = gymMonthEnd_(body.validUntil);
      if (!end) return { ok: false, error: 'חודש תוקף לא תקין (נדרש YYYY-MM)' };
      changes.push('בתוקף עד → ' + body.validUntil);
      w.set('בתוקף עד', end);
    }
    if (body.status) {
      var st = String(body.status).trim();
      if (GYM_EDITABLE_STATUSES.indexOf(st) === -1) {
        return { ok: false, error: 'סטטוס לא מוכר: ' + st };
      }
      if (st !== prevStatus) changes.push('סטטוס: ' + prevStatus + ' → ' + st);
      w.set('סטטוס', st);
    }
    if (body.note !== undefined) w.set('הערות מנהל', body.note);

    if (!changes.length && body.note === undefined) {
      return { ok: false, error: 'לא נבחר שום שינוי' };
    }

    w.set('טופל בתאריך', new Date());
    w.set('טופל ע"י', body._email || '');
    w.flush();

    gymLog_(ss, id, 'עריכה ידנית', {
      by: body._email || '',
      note: changes.join(' · ') + (body.reason ? (' | סיבה: ' + body.reason) : '')
    });

    var sync = null;
    try { sync = gymPaymentSync_(ss, id); } catch (e) { Logger.log('sync אחרי עריכה נכשל: ' + e); }

    // מייל לתושב רק כשהשינוי נוגע לו באמת
    var newStatus = String(body.status || prevStatus).trim();
    if (newStatus !== prevStatus && (newStatus === GYM_ST_REJECTED || newStatus === GYM_ST_CANCELLED)) {
      try {
        var email = String(sh.getRange(row, cols['אימייל']).getValue()).trim();
        var name = String(sh.getRange(row, cols['שם פרטי']).getValue()).trim() || email;
        var reasonTxt = body.reason ? (' ' + body.reason) : '';
        sendResidentTemplate_(ss,
          newStatus === GYM_ST_REJECTED ? 'GYM_REJECTED' : 'GYM_CANCELLED',
          [email], { 'שם': name, 'הערה': reasonTxt });
      } catch (mailErr) { Logger.log('מייל עריכה נכשל: ' + mailErr); }
    }

    return { ok: true, id: id, status: newStatus, changes: changes, sync: sync };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    lock.releaseLock();
  }
}

/* ============================================================================
 *  סיור היכרות (2026-08-28)
 * ----------------------------------------------------------------------------
 *  חפיסת מסכים שנפתחת בכניסה הראשונה, בסגנון הפעלה של מכשיר חדש. התוכן כולו
 *  יושב בטאב "סיור היכרות" ולא בקוד — בדיוק כמו תבניות המיילים ומסך השירותים —
 *  כדי שאפשר יהיה לשנות נוסח, להוסיף צעד או לכבות צעד בלי דיפלוי.
 *
 *  העמודות:
 *    מזהה    — מזהה קבוע לצעד. לא לשנות אחרי שפורסם.
 *    סדר     — סדר התצוגה בתוך אותה גרסה.
 *    גרסה    — **המנגנון המרכזי.** לכל תושב נשמר "עד איזו גרסה ראית"
 *              (עמודה "סיור נצפה" בטאב תושבים). תושב חדש רואה הכול; תושב ותיק
 *              רואה רק צעדים שהגרסה שלהם גבוהה ממה שכבר ראה — וגם אותם
 *              לא כהשתלטות על המסך אלא ככרטיס קטן בעמוד הקבלה.
 *              **כשמוסיפים פיצ'ר חדש: שורה חדשה עם גרסה +1. זהו.**
 *    קהל     — "כולם" / "מנהלים" / "תושבים". מסונן בשרת, לא בלקוח.
 *    פעיל    — "לא" מכבה צעד בלי למחוק אותו.
 *    כותרת, טקסט — התוכן עצמו.
 *    כפתור, מסך יעד — פעולה משנית אופציונלית. "מסך יעד" הוא מפתח מסך
 *              (resSubmit/resReserve/resMap...) או אחת משתי מילות מפתח:
 *              "security" (פותח את מסך אבטחת המידע) ו-"install" (הוספה למסך
 *              הבית). ריק = אין כפתור.
 *    אייקון  — שם מתוך המפה בלקוח: wave/receipt/key/map/shield/phone/star.
 * ========================================================================== */
var TOUR_SHEET = 'סיור היכרות';
var TOUR_HEADERS = ['מזהה', 'סדר', 'גרסה', 'קהל', 'פעיל', 'כותרת', 'טקסט', 'כפתור', 'מסך יעד', 'אייקון'];
var TOUR_SEEN_HEADER = 'סיור נצפה';

/** תוכן ברירת המחדל בפתיחה ראשונה. מכאן והלאה — נערך בגיליון, לא בקוד. */
function tourSeed_() {
  return [
    ['welcome', 1, 1, 'כולם', 'כן', 'ברוכים הבאים',
      'זו האפליקציה של השיכון. מכאן מגישים קבלות ומקבלים החזרים, משריינים את המועדון, ורואים מי גר איפה ומי אחראי על מה. שתי דקות ונכיר את הכול.',
      '', '', 'wave'],
    ['receipts', 2, 1, 'כולם', 'כן', 'שילמתם מהכיס? קבלו החזר',
      'מצלמים את הקבלה, בוחרים סעיף, שולחים. המערכת קוראת את הסכום מהקבלה לבד, ואתם עוקבים אחרי הסטטוס — הוגשה, אושרה, שולמה — בלי לרדוף אחרי אף אחד.',
      'להגשת קבלה', 'resSubmit', 'receipt'],
    ['facilities', 3, 1, 'כולם', 'כן', 'המועדון ומכון הכושר',
      'בוחרים תאריך ושעות, רואים מיד מה פנוי, ושולחים בקשה. אישור מגיע במייל וגם מופיע כאן. במכון הכושר מנהלים את המנוי המשפחתי מאותו מקום.',
      'ללוח השריונים', 'resReserve', 'key'],
    ['neighborhood', 4, 1, 'כולם', 'כן', 'להכיר את השיכון',
      'מפה אינטראקטיבית של כל הבתים, מדריך שכנים עם טלפונים, עץ הוועד — מי אחראי על מה — ורשימת השירותים של השיכון.',
      'למפת השיכון', 'resMap', 'map'],
    ['security', 5, 1, 'כולם', 'כן', 'המידע שלכם מוגן',
      'אין לאפליקציה מאגר נתונים פרטי ואין לה סיפור סיסמאות משלה. הכול יושב בתוך חשבון Google של הוועד, וההתחברות היא דרך גוגל. יש מסך שמסביר בדיוק מה מוגן ואיך.',
      'לקרוא בהרחבה', 'security', 'shield'],
    ['install', 6, 1, 'כולם', 'כן', 'שימו אותנו על מסך הבית',
      'אפשר להוסיף את האפליקציה למסך הבית של הטלפון, ואז היא נפתחת כמו כל אפליקציה אחרת — מסך מלא, בלי שורת כתובת, וגם עובדת כשאין קליטה.',
      'להוספה למסך הבית', 'install', 'phone'],
    ['admin', 7, 1, 'מנהלים', 'כן', 'ומה שונה אצלכם',
      'כמנהלים אתם רואים גם את "מה מחכה לאישורך" בעמוד הבית — הוצאות, שריונים ובקשות הרשמה שממתינות לכם, כל אחת קופצת ישר למקום. המעבר בין אזור הניהול לאזור התושב הוא מתפריט המשתמש למעלה.',
      '', '', 'star']
  ];
}

function ensureTourSheet_(ss) {
  var sh = ss.getSheetByName(TOUR_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(TOUR_SHEET);
  sh.getRange(1, 1, 1, TOUR_HEADERS.length).setValues([TOUR_HEADERS]);
  sh.getRange(1, 1, 1, TOUR_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  var seed = tourSeed_();
  sh.getRange(2, 1, seed.length, TOUR_HEADERS.length).setValues(seed);
  sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 55); sh.setColumnWidth(3, 60);
  sh.setColumnWidth(4, 80);  sh.setColumnWidth(5, 60); sh.setColumnWidth(6, 200);
  sh.setColumnWidth(7, 460); sh.setColumnWidth(8, 150); sh.setColumnWidth(9, 120);
  sh.setColumnWidth(10, 90);
  sh.getRange(2, 7, seed.length, 1).setWrap(true);
  return sh;
}

/** מוסיף את עמודת "סיור נצפה" לטאב תושבים אם אינה קיימת, ומחזיר את מספרה. */
function ensureTourSeenCol_(ss) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return -1;
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var idx = headers.indexOf(TOUR_SEEN_HEADER);
  if (idx !== -1) return idx + 1;
  sh.getRange(1, lastCol + 1, 1, 1).setValues([[TOUR_SEEN_HEADER]]);
  sh.getRange(1, lastCol + 1, 1, 1).setFontWeight('bold');
  return lastCol + 1;
}

function tourSeenFor_(ss, email) {
  var col = ensureTourSeenCol_(ss);
  if (col === -1) return 0;
  var r = lookupResident_(email);
  if (!r.found) return 0;
  var sh = ss.getSheetByName('תושבים');
  var v = sh.getRange(r.rowIndex, col).getValue();
  var n = parseInt(v, 10);
  return isNaN(n) ? 0 : n;
}

/* קריאה: מחזיר את הצעדים שמתאימים לקהל של הקורא, ואת הגרסה שכבר ראה.
   הסינון לפי קהל נעשה כאן ולא בלקוח — צעד שמיועד למנהלים לא יוצא מהשרת
   למי שאינו מנהל, בדיוק כמו כל שאר המידע המסונן-לפי-הרשאה במערכת. */
function handleTour_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureTourSheet_(ss);
    var isAdmin = gate.perm.isSuper || (gate.perm.perms && gate.perm.perms.length > 0);
    var rows = readTable_(ss, TOUR_SHEET).filter(function (r) {
      if (String(r['פעיל'] || '').trim() === 'לא') return false;
      var aud = String(r['קהל'] || 'כולם').trim();
      if (aud === 'מנהלים' && !isAdmin) return false;
      if (aud === 'תושבים' && isAdmin) return false;
      /* קהל שהוא **שם הרשאה** ("גינון", "מועדון"...) — צעד שמוצג רק לבעלי
       * אותה הרשאה. נוסף 7.9.26 עם מודול הגינון: "מנהלים" היה מציג את צעד
       * הגינון גם למנהל תקציב שאין לו שום קשר אליו, ורעש בסיור הוא הדרך
       * הבטוחה לגרום לאנשים לדלג עליו. מנהל-על רואה הכול, כרגיל. */
      if (ALL_PERMS.indexOf(aud) !== -1) {
        if (gate.perm.isSuper) return true;
        return (gate.perm.perms || []).indexOf(aud) !== -1;
      }
      return true;
    }).sort(function (a, b) {
      var va = parseInt(a['גרסה'], 10) || 1, vb = parseInt(b['גרסה'], 10) || 1;
      if (va !== vb) return va - vb;
      return (parseInt(a['סדר'], 10) || 0) - (parseInt(b['סדר'], 10) || 0);
    });
    return json_({ ok: true, steps: rows, seen: tourSeenFor_(ss, gate.email) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* כתיבה: "ראיתי עד גרסה N". לא ב-ACTION_PERMS בכוונה — זו פעולה של כל תושב
   מחובר על השורה של עצמו בלבד, בדיוק כמו דיווח תשלום או שריון מועדון.
   שים לב: השורה נקבעת מהאימייל שבמושב החתום (gate.email) ולעולם לא מפרמטר
   שהגיע מהלקוח — אחרת תושב אחד היה יכול לסמן עבור אחר. */
function markTourSeen_(ss, body) {
  var col = ensureTourSeenCol_(ss);
  if (col === -1) return { ok: false, error: 'אין טאב "תושבים"' };
  var r = lookupResident_(body._email);
  if (!r.found) return { ok: false, error: 'המשתמש אינו ברשימת התושבים' };
  var n = parseInt(body.version, 10);
  if (isNaN(n) || n < 0) return { ok: false, error: 'גרסה לא תקינה' };
  var sh = ss.getSheetByName('תושבים');
  var cur = parseInt(sh.getRange(r.rowIndex, col).getValue(), 10);
  if (!isNaN(cur) && cur >= n) return { ok: true, seen: cur };   // לא יורדים אחורה
  sh.getRange(r.rowIndex, col).setValue(n);
  return { ok: true, seen: n };
}

/** מוסיף את צעד הסיור של "הפרטים שלי" (גרסה 2). אידמפוטנטי — הרצה חוזרת
 *  לא תיצור כפילות. זו ההפעלה הראשונה של מנגנון הגרסאות: ותיקים לא יקבלו
 *  מסך מלא אלא כרטיס "יש חדש" בעמוד הבית. */
function setupTourStepV2() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureTourSheet_(ss);
  var existing = readTable_(ss, TOUR_SHEET).some(function (r) {
    return String(r['מזהה'] || '').trim() === 'myprofile';
  });
  if (existing) return 'הצעד כבר קיים — לא נוסף שוב';
  sh.appendRow(['myprofile', 1, 2, 'כולם', 'כן', 'חדש: הפרטים שלכם בידיים שלכם',
    'עכשיו אפשר לעדכן לבד את הטלפון, המקצוע ושמות הילדים — בלי לפנות לאף אחד. ' +
    'נכנסים לתפריט למעלה ובוחרים "הפרטים שלי". שינוי כתובת המייל עדיין עובר אישור של הוועד, ' +
    'כי זו הכתובת שאיתה נכנסים לאפליקציה.',
    'לפרטים שלי', 'resMe', 'star']);
  return 'נוסף צעד סיור "myprofile" בגרסה 2';
}

/** צעדי הסיור של מודול הגינון (גרסה 3). אידמפוטנטי, כמו setupTourStepV2.
 *  שני צעדים ולא אחד: התושב והמנהל פוגשים את המודול בשני מקומות שונים
 *  ובשתי מטרות שונות, וצעד אחד שמנסה לדבר לשניהם לא מדבר לאף אחד.
 *  ⚠️ הצעד הניהולי מסומן בקהל "גינון" — כלומר רק בעלי הרשאת גינון (ומנהל-על)
 *  יראו אותו. ר' הפילטר ב-handleTour_. */
function setupTourStepV3() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ensureTourSheet_(ss);
  var have = readTable_(ss, TOUR_SHEET).map(function (r) {
    return String(r['מזהה'] || '').trim();
  });
  var added = [];
  if (have.indexOf('garden') === -1) {
    sh.appendRow(['garden', 1, 3, 'כולם', 'כן', 'חדש: מראה שיכון',
      'ממטרה שבורה, ענף שנפל, מדשאה שלא כוסחה — מדווחים ישירות מהאפליקציה. ' +
      'בוחרים קטגוריה, מסמנים על המפה איפה בדיוק, ומצרפים תמונה. ' +
      'אחר כך עוקבים אחרי הטיפול בדיוק כמו אחרי קבלה, ובסוף אפשר גם לומר לנו אם זה נסגר כמו שצריך.',
      'לדיווח על תקלה', 'resGarden', 'leaf']);
    added.push('garden');
  }
  if (have.indexOf('gardenAdmin') === -1) {
    sh.appendRow(['gardenAdmin', 2, 3, 'גינון', 'כן', 'ניהול הגינון',
      'הטאב "גינון" באזור הניהול מרכז את הכול: דיווחים חדשים שממתינים לשיבוץ לשבוע, ' +
      'משימות הצוות לשבוע הנוכחי, ומה שהצוות סימן כבוצע וממתין לאישור שלך. ' +
      'רק אתה קובע שמשימה הושלמה — הצוות מדווח, אתה מאשר.',
      'לניהול הגינון', 'gardenTasks', 'leaf']);
    added.push('gardenAdmin');
  }
  return added.length ? 'נוספו צעדי סיור: ' + added.join(', ') + ' (גרסה 3)'
                      : 'כל צעדי הגינון כבר קיימים — לא נוסף דבר';
}

/** התקנה ידנית מהעורך: יוצר את הטאב ואת העמודה בלי לחכות לקריאה הראשונה. */
function setupTourModule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureTourSheet_(ss);
  var col = ensureTourSeenCol_(ss);
  return 'טאב "' + TOUR_SHEET + '" מוכן; עמודת "' + TOUR_SEEN_HEADER + '" בעמודה ' + col;
}

/* ============================================================================
 *  "הפרטים שלי" (2026-08-28)
 * ----------------------------------------------------------------------------
 *  תושב מעדכן את הפרטים של עצמו, במקום שמישהו בוועד יקליד ידנית.
 *
 *  המבנה שקובע הכול: בטאב "תושבים" **שורה = משק בית, לא אדם**, ולכל שורה שתי
 *  משבצות (אימייל 1/2, טלפון 1/2, מקצוע 1/2...). lookupResident_ מחזיר את
 *  המשבצת של המחובר. מכאן שלוש רמות:
 *    • שדה אישי    — נכתב לתא של המשבצת שלי. אין התנגשות עם בן/בת הזוג.
 *    • שדה משפחתי  — תא אחד לשניהם (שמות ילדים). אחרון קובע + חיווי מי ומתי.
 *    • שדה מבני    — בית/משפחה/סטטוס/הרשאות. **לא נחשף למסך הזה בכלל.**
 *
 *  ארבעה כללי אבטחה — בלעדיהם זה חור, לא פיצ'ר:
 *   1. השורה נגזרת מ-gate.email שבמושב החתום, **לעולם לא מפרמטר של הלקוח**.
 *   2. רשימת שדות מותרת סגורה. saveResidentRow_ הקיים כותב לכל עמודה תואמת —
 *      הוא מסלול *מנהל*, ואסור לפתוח אותו לתושב. הפעולות כאן נפרדות ממנו.
 *   3. שדה משבצתי נפתר לפי המשבצת של הקורא ("טלפון 2", לא "טלפון").
 *   4. סטטוס והרשאות לא יוצאים מהשרת למסך הזה. מה שלא נשלח — אי אפשר לשנות.
 *
 *  האימייל הוא היוצא מן הכלל: הוא הזהות שאיתה נכנסים, ולכן **לא** נשמר מיד
 *  אלא נכנס כבקשה לטאב "בקשות שינוי" וממתין לאישור מנהל. תושב שיקליד אותו
 *  לא נכון ננעל בחוץ בלי דרך לתקן מבפנים.
 * ========================================================================== */
var PROFILE_SHEET = 'בקשות שינוי';
var PROFILE_HEADERS = ['מזהה', 'תאריך', 'מזהה קבוע', 'אימייל מבקש', 'שדה',
  'ערך נוכחי', 'ערך מבוקש', 'סטטוס', 'טופל ע"י', 'טופל בתאריך'];
var PROFILE_TOUCH_BY = 'עודכן ע"י';
var PROFILE_TOUCH_AT = 'עודכן בתאריך';

/* השדות שתושב רשאי לשנות בעצמו. slot=true → נפתר למשבצת של הקורא.
   להוסיף שדה כאן = לפתוח אותו לעריכה עצמית. לא להוסיף שדה מבני. */
var MY_PROFILE_FIELDS = [
  { key: 'phone', frag: 'טלפון', slot: true,  label: 'טלפון' },
  { key: 'job',   frag: 'מקצוע', slot: true,  label: 'מקצוע' },
  { key: 'kids',  frag: 'ילדים', slot: false, label: 'שמות וגילאי הילדים' }
];
/* שדות שדורשים אישור מנהל — לא נכתבים ישירות לעולם. */
var MY_PROFILE_REQUEST_FIELDS = [
  { key: 'email', frag: 'אימייל', slot: true, label: 'אימייל' }
];

function profileFieldDef_(key) {
  var all = MY_PROFILE_FIELDS.concat(MY_PROFILE_REQUEST_FIELDS);
  for (var i = 0; i < all.length; i++) if (all[i].key === key) return all[i];
  return null;
}

/** עמודות שהכותרת שלהן מכילה frag, לפי סדר הופעתן בגיליון. */
function profileColsByFrag_(headers, frag) {
  var out = [];
  headers.forEach(function (h, i) { if (String(h).indexOf(frag) !== -1) out.push(i); });
  return out;
}
/** העמודה (0-based) של שדה עבור המשבצת הנתונה; -1 אם אין. */
function profileColFor_(headers, def, slot) {
  var cols = profileColsByFrag_(headers, def.frag);
  if (!cols.length) return -1;
  if (!def.slot) return cols[0];
  var idx = (parseInt(slot, 10) || 1) - 1;
  return (idx >= 0 && idx < cols.length) ? cols[idx] : -1;
}

function ensureProfileSheet_(ss) {
  var sh = ss.getSheetByName(PROFILE_SHEET);
  if (sh) return sh;
  sh = ss.insertSheet(PROFILE_SHEET);
  sh.getRange(1, 1, 1, PROFILE_HEADERS.length).setValues([PROFILE_HEADERS]);
  sh.getRange(1, 1, 1, PROFILE_HEADERS.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 110); sh.setColumnWidth(2, 140); sh.setColumnWidth(3, 110);
  sh.setColumnWidth(4, 210); sh.setColumnWidth(5, 90);  sh.setColumnWidth(6, 210);
  sh.setColumnWidth(7, 210); sh.setColumnWidth(8, 90);  sh.setColumnWidth(9, 180);
  sh.setColumnWidth(10, 140);
  return sh;
}

/** מוסיף את שתי עמודות ה"עודכן ע"י/בתאריך" לטאב תושבים אם חסרות. */
function ensureProfileTouchCols_(ss) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { by: -1, at: -1 };
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var missing = [PROFILE_TOUCH_BY, PROFILE_TOUCH_AT].filter(function (c) { return headers.indexOf(c) === -1; });
  if (missing.length) {
    sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    sh.getRange(1, lastCol + 1, 1, missing.length).setFontWeight('bold');
    headers = headers.concat(missing);
  }
  return { by: headers.indexOf(PROFILE_TOUCH_BY), at: headers.indexOf(PROFILE_TOUCH_AT) };
}

function profileRowsFor_(ss, email) {
  ensureProfileSheet_(ss);
  var target = normalizeEmail_(email);
  return readTable_(ss, PROFILE_SHEET).filter(function (r) {
    return normalizeEmail_(String(r['אימייל מבקש'] || '')) === target;
  });
}

/* ------------------------------------------------------------------ קריאה */
/* מחזיר רק את מה שהמסך באמת צריך. סטטוס והרשאות לא נכללים בכוונה. */
function handleMyProfile_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var r = lookupResident_(gate.email);
    if (!r.found) return json_({ ok: false, error: 'המשתמש אינו ברשימת התושבים' });

    ensureProfileSheet_(ss);
    var touch = ensureProfileTouchCols_(ss);
    var sh = ss.getSheetByName('תושבים');
    var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    var row = sh.getRange(r.rowIndex, 1, 1, headers.length).getValues()[0];

    var values = {};
    MY_PROFILE_FIELDS.concat(MY_PROFILE_REQUEST_FIELDS).forEach(function (def) {
      var c = profileColFor_(headers, def, r.slot);
      values[def.key] = c === -1 ? '' : String(row[c] == null ? '' : row[c]);
    });

    var pending = profileRowsFor_(ss, gate.email).filter(function (x) {
      return String(x['סטטוס'] || '').trim() === 'ממתין';
    });

    return json_({
      ok: true,
      slot: r.slot,
      values: values,
      // לתצוגה בלבד — המסך מראה אותם אפורים עם "לשינוי, פנו לוועד"
      readOnly: { family: r.family, house: r.house, firstName: r.firstName },
      touchedBy: touch.by === -1 ? '' : String(row[touch.by] || ''),
      touchedAt: touch.at === -1 ? '' : String(row[touch.at] || ''),
      pending: pending
    });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/* ------------------------------------------------------- שמירה מיידית */
function saveMyProfile_(ss, body) {
  var r = lookupResident_(body._email);
  if (!r.found) return { ok: false, error: 'המשתמש אינו ברשימת התושבים' };
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var touch = ensureProfileTouchCols_(ss);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });

  var fields = body.fields || {};
  var written = [], householdChanged = false;
  Object.keys(fields).forEach(function (key) {
    // רשימה סגורה: מפתח שאינו כאן פשוט מתעלמים ממנו, בלי שגיאה ובלי כתיבה
    var def = null;
    for (var i = 0; i < MY_PROFILE_FIELDS.length; i++) {
      if (MY_PROFILE_FIELDS[i].key === key) { def = MY_PROFILE_FIELDS[i]; break; }
    }
    if (!def) return;
    var c = profileColFor_(headers, def, r.slot);
    if (c === -1) return;
    sh.getRange(r.rowIndex, c + 1).setValue(String(fields[key] == null ? '' : fields[key]));
    written.push(key);
    if (!def.slot) householdChanged = true;
  });
  if (!written.length) return { ok: false, error: 'לא נמצאו שדות מותרים לעדכון' };

  // חיווי "אחרון קובע" — נרשם רק כששדה משפחתי השתנה, כי רק שם יש מה להסביר
  if (householdChanged && touch.by !== -1 && touch.at !== -1) {
    var who = (r.firstName || '').trim() || body._email;
    sh.getRange(r.rowIndex, touch.by + 1).setValue(who);
    sh.getRange(r.rowIndex, touch.at + 1).setValue(new Date());
  }
  return { ok: true, written: written };
}

/* ------------------------------------------------------- בקשת שינוי */
function submitProfileChange_(ss, body) {
  var def = null;
  for (var i = 0; i < MY_PROFILE_REQUEST_FIELDS.length; i++) {
    if (MY_PROFILE_REQUEST_FIELDS[i].key === body.field) { def = MY_PROFILE_REQUEST_FIELDS[i]; break; }
  }
  if (!def) return { ok: false, error: 'שדה לא נתמך' };

  var want = String(body.value || '').trim();
  if (def.key === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(want)) {
    return { ok: false, error: 'כתובת אימייל לא תקינה' };
  }
  var r = lookupResident_(body._email);
  if (!r.found) return { ok: false, error: 'המשתמש אינו ברשימת התושבים' };

  var sh = ss.getSheetByName('תושבים');
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var c = profileColFor_(headers, def, r.slot);
  var current = c === -1 ? '' : String(sh.getRange(r.rowIndex, c + 1).getValue() || '');
  if (normalizeEmail_(current) === normalizeEmail_(want)) {
    return { ok: false, error: 'הערך המבוקש זהה לקיים' };
  }

  var psh = ensureProfileSheet_(ss);
  var mine = profileRowsFor_(ss, body._email);
  var dup = mine.some(function (x) {
    return String(x['סטטוס'] || '').trim() === 'ממתין' && String(x['שדה'] || '').trim() === def.key;
  });
  if (dup) return { ok: false, error: 'כבר יש בקשה ממתינה לשדה הזה' };

  var id = 'PC' + new Date().getTime();
  psh.appendRow([id, new Date(), r.familyId, body._email, def.key, current, want, 'ממתין', '', '']);

  var name = (r.firstName || '').trim() || body._email;
  try {
    sendResidentTemplate_(ss, 'PROFILE_CHANGE_RECEIVED', [body._email],
      { 'שם': name, 'שדה': def.label, 'ערך': want });
    notifyAdmins_(ss, PERM_RESIDENTS, 'PROFILE_CHANGE_NEW',
      { 'שם': name, 'שדה': def.label, 'ערך נוכחי': current || '(ריק)', 'ערך מבוקש': want });
  } catch (mailErr) { Logger.log('מייל בקשת שינוי נכשל: ' + mailErr); }

  return { ok: true, id: id };
}

function profileRowById_(sh, id) {
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === String(id).trim()) return r + 1;
  }
  return -1;
}

function cancelProfileChange_(ss, body) {
  var sh = ensureProfileSheet_(ss);
  var row = profileRowById_(sh, body.id);
  if (row === -1) return { ok: false, error: 'בקשה לא נמצאה' };
  var rec = sh.getRange(row, 1, 1, PROFILE_HEADERS.length).getValues()[0];
  // רק על הבקשות של עצמי, ורק כל עוד הן ממתינות
  if (normalizeEmail_(String(rec[3] || '')) !== normalizeEmail_(body._email)) {
    return { ok: false, error: 'אין הרשאה' };
  }
  if (String(rec[7] || '').trim() !== 'ממתין') return { ok: false, error: 'הבקשה כבר טופלה' };
  sh.getRange(row, 8).setValue('בוטלה');
  sh.getRange(row, 10).setValue(new Date());
  return { ok: true };
}

/* ------------------------------------------------------- צד המנהל */
function handleProfileChanges_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_RESIDENTS);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    ensureProfileSheet_(ss);
    return json_({ ok: true, rows: readTable_(ss, PROFILE_SHEET) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function approveProfileChange_(ss, body) {
  var sh = ensureProfileSheet_(ss);
  var row = profileRowById_(sh, body.id);
  if (row === -1) return { ok: false, error: 'בקשה לא נמצאה' };
  var rec = sh.getRange(row, 1, 1, PROFILE_HEADERS.length).getValues()[0];
  if (String(rec[7] || '').trim() !== 'ממתין') return { ok: false, error: 'הבקשה כבר טופלה' };

  var reqEmail = String(rec[3] || ''), fieldKey = String(rec[4] || '').trim(), want = String(rec[6] || '');
  var def = profileFieldDef_(fieldKey);
  if (!def) return { ok: false, error: 'שדה לא נתמך' };

  // השורה נמצאת לפי המייל של *המבקש* כפי שנרשם בבקשה — לא לפי פרמטר מהלקוח
  var r = lookupResident_(reqEmail);
  if (!r.found) return { ok: false, error: 'המבקש אינו ברשימת התושבים' };
  var rsh = ss.getSheetByName('תושבים');
  var headers = rsh.getRange(1, 1, 1, rsh.getLastColumn()).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  var c = profileColFor_(headers, def, r.slot);
  if (c === -1) return { ok: false, error: 'לא נמצאה עמודה מתאימה' };

  rsh.getRange(r.rowIndex, c + 1).setValue(want);
  sh.getRange(row, 8).setValue('אושר');
  sh.getRange(row, 9).setValue(body._email);
  sh.getRange(row, 10).setValue(new Date());

  try {
    // המייל נשלח לכתובת החדשה *ולישנה* — הישנה כדי שהתושב יידע שהזהות שלו
    // השתנתה גם אם החדשה שגויה, החדשה כדי שיוכל לוודא שהיא עובדת.
    var to = def.key === 'email' ? [want, reqEmail] : [reqEmail];
    sendResidentTemplate_(ss, 'PROFILE_CHANGE_APPROVED', to,
      { 'שם': (r.firstName || '').trim() || reqEmail, 'שדה': def.label, 'ערך': want });
  } catch (mailErr) { Logger.log('מייל אישור שינוי נכשל: ' + mailErr); }

  return { ok: true };
}

function rejectProfileChange_(ss, body) {
  var sh = ensureProfileSheet_(ss);
  var row = profileRowById_(sh, body.id);
  if (row === -1) return { ok: false, error: 'בקשה לא נמצאה' };
  var rec = sh.getRange(row, 1, 1, PROFILE_HEADERS.length).getValues()[0];
  if (String(rec[7] || '').trim() !== 'ממתין') return { ok: false, error: 'הבקשה כבר טופלה' };

  var reqEmail = String(rec[3] || '');
  var def = profileFieldDef_(String(rec[4] || '').trim());
  sh.getRange(row, 8).setValue('נדחתה');
  sh.getRange(row, 9).setValue(body._email);
  sh.getRange(row, 10).setValue(new Date());

  var r = lookupResident_(reqEmail);
  try {
    sendResidentTemplate_(ss, 'PROFILE_CHANGE_REJECTED', [reqEmail],
      { 'שם': (r.found && r.firstName) ? r.firstName : reqEmail,
        'שדה': def ? def.label : '', 'סיבה': String(body.reason || '').trim() || '—' });
  } catch (mailErr) { Logger.log('מייל דחיית שינוי נכשל: ' + mailErr); }

  return { ok: true };
}

/** התקנה ידנית מהעורך — יוצר את הטאב ואת שתי העמודות מראש. */
function setupProfileModule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureProfileSheet_(ss);
  var t = ensureProfileTouchCols_(ss);
  return 'טאב "' + PROFILE_SHEET + '" מוכן; "' + PROFILE_TOUCH_BY + '" בעמודה ' + (t.by + 1) +
    ', "' + PROFILE_TOUCH_AT + '" בעמודה ' + (t.at + 1);
}


/* ============================================================================
 *  מודול הגינון — "מראה שיכון" · שלב א', תשתית (2026-09-07)
 * ----------------------------------------------------------------------------
 *  מבוסס על "אפיון פונקציונלי מלא — מערכת ניהול הגינון פלמחים" v1.0 (5.9.2026)
 *  אחרי סבב ההכרעות של יועד. ההחלטות שמעצבות את המבנה כאן:
 *
 *  1. **שלושה שדות ולא סטטוס אחד.** האפיון המקורי החזיק 12 סטטוסים בשדה אחד
 *     שערבב שלושה צירים שונים. כאן: "שלב" (5 ערכים — מה שהתושב רואה), "דגל"
 *     (חריגה אחת לכל היותר, יכולה להתקיים במקביל לכל שלב), ו"סגירה" (קיימת רק
 *     כששלב=הושלם ועונה על *למה* נסגר). כך "בטיפול + מומלץ להעביר לבינוי",
 *     שהוא מצב אמיתי ונפוץ, אפשרי — ובשדה אחד הוא לא היה.
 *  2. **צוות הגינון מקדם שלב עד "בטיפול" ומרים דגל "ממתין לאישור". רק מנהל
 *     קובע "הושלם"** ובוחר סיבת סגירה. זה כל מנגנון האישור של האפיון, בחוק אחד.
 *  3. **סט טאבים אחד עם עמודת "שנת תקציב"**, ולא טאב לכל שנה כמו "תנועות".
 *     אחרת ארבעה טאבים היו מוכפלים מדי שנה, ותבניות השגרה — שהן החוזה ואינן
 *     משתנות בין שנים — היו משוכפלות איתם.
 *  4. **אין חובת תיעוד בתמונה.** יועד בחר להתבסס על אמון. השדות נבנים ונשארים
 *     אופציונליים, כך שהחזרת חובה בעתיד תהיה הגדרה ולא בנייה מחדש.
 *
 *  שלב א' הוא תשתית בלבד: טאבים, אוצר מילים והרשאות. מנוע השגרה (שדות
 *  ה"תבנית" בטאב השגרה) נבנה בשלב ב' — הטאב נוצר עכשיו כדי שאפשר יהיה
 *  להתחיל להזין אליו את החוזה במקביל לפיתוח.
 * ========================================================================== */

var GARDEN_REPORTS_SHEET  = 'גינון — דיווחים';
var GARDEN_TASKS_SHEET    = 'גינון — משימות';
var GARDEN_ROUTINE_SHEET  = 'גינון — שגרה';
var GARDEN_LOG_SHEET      = 'גינון — יומן';
var GARDEN_SETTINGS_SHEET = 'גינון — הגדרות';

/* אוצר המילים. שלושה מערכים = שלושת השדות. */
var GARDEN_STAGES = ['התקבל', 'נבדק', 'מתוכנן', 'בטיפול', 'הושלם'];
/* דגלים — **בסדר קדימות יורד**. אם יותר מאחד חל, מוצג הראשון ברשימה בלבד:
 * שני דגלים על שורה אחת הורסים את יכולת הסריקה של המסך. */
var GARDEN_FLAGS = ['דורש בדיקה חוזרת', 'הוחזר להשלמה', 'דורש בדיקה בשטח', 'ממתין לאישור', 'נגררה'];
/* סיבות סגירה — רלוונטיות רק כששלב = "הושלם". "בוצע" היא ברירת המחדל
 * ואינה מוצגת בממשק בכלל: שקט = תקין. */
/* ⚠️ 'אוחד' נוסף מעבר לארבע הסגירות שבאפיון (2026-09-07). הנימוק: ארבעתן
 * מתארות *תוצאה של עבודה*, ולמשימה שאוחדה אין תוצאה — היא חדלה להתקיים
 * כמשימה נפרדת. דחיסה שלה ל'בוטל' הייתה מזהמת את הסטטיסטיקה בהמשך: "בוטל"
 * היה סופר גם ביטולים אמיתיים וגם איחודים. היא **אינה** נבחרת ידנית — רק
 * gardenMerge_ כותב אותה, ולכן היא לא מופיעה במסך הסגירה. */
var GARDEN_CLOSURE_MERGED = 'אוחד';
var GARDEN_CLOSURES = ['בוצע', 'הועבר לבינוי', 'בוטל', 'לא רלוונטי', GARDEN_CLOSURE_MERGED];

/* מקור המשימה (עמודת "סוג" בטאב המשימות). שלושה ערכים, רשימה סגורה:
 *   שגרה       — נולדה מתבנית בטאב "גינון — שגרה", ולכן יש לה "מזהה תבנית"
 *                שמצביע על השורה שם, ובה העמודה "סעיף בתוכנית". זה הקישור
 *                שמאפשר להגיד על כל משימה אם היא חלק מתוכנית העבודה או תוספת.
 *   דיווח תושב — נולדה מדיווח באפליקציה. יש לה שורה מקבילה בטאב הדיווחים.
 *   יזום       — מנהל הגינון פתח אותה בעצמו. לא בתוכנית ולא דיווח.
 * ⚠️ מונחים (2026-09-08, החלטת יועד): בכל טקסט שמגיע למסך אומרים "תוכנית
 * העבודה", לא "חוזה", ולא "קבלן". המטרה היא עבודה משותפת מול הצוות ולא
 * תחושת מעקב — ר' גם הכותרת "סעיף בתוכנית" בטאב השגרה. ההפרדה בין שלושת
 * הערכים נשארת, כי היא זו שמאפשרת להגיד "מה תוכנן מול מה נוסף". */
var GARDEN_KIND_ROUTINE = 'שגרה';
var GARDEN_KIND_REPORT  = 'דיווח תושב';
var GARDEN_KIND_MANUAL  = 'יזום';
var GARDEN_KINDS = [GARDEN_KIND_ROUTINE, GARDEN_KIND_REPORT, GARDEN_KIND_MANUAL];

/* עד 7.9.2026 דיווח תושב נכתב כ'תקלה'. שום דבר לא היה בייצור, אז הערך שונה
 * במקום להישאר לנצח — אבל שורות בדיקה שנוצרו לפני כן עדיין נושאות אותו,
 * ולכן הקריאה מנרמלת. אין כאן כתיבה חוזרת לגיליון בכוונה: מיגרציה על נתוני
 * בדיקה היא סיכון בלי תמורה. */
var GARDEN_KIND_LEGACY = { 'תקלה': GARDEN_KIND_REPORT };

var GARDEN_REPORT_HEADERS = [
  'מזהה', 'תאריך דיווח', 'מזהה משפחה', 'שם מדווח', 'טלפון',
  'קטגוריה', 'אזור', 'מיקום X', 'מיקום Y', 'מיקום מילולי', 'תיאור', 'תמונות',
  'מזהה משימה', 'אוחד לדיווח', 'שנת תקציב',
  'משוב', 'תאריך משוב', 'הערת משוב'
];

/* מיקום X/Y נשמרים **מנורמלים 0–1** ולא בפיקסלים ולא באחוזי המפה הנוכחית.
 * הסיבה: מפת השיכון עומדת לפני בנייה מחדש (map-geo.json), וכל הקואורדינטות
 * שנמדדו היום בעין יימחקו. ערך מנורמל הופך את המעבר להמרה חד-פעמית במקום
 * הזנה מחדש של כל הדיווחים שנצברו. */
var GARDEN_TASK_HEADERS = [
  /* "נוצר בתאריך" (2026-09-07) — מתי המשימה נולדה, להבדיל מ"עודכן בתאריך"
   * שנדרס בכל פעולה. בלעדיה אי אפשר לחשב זמן טיפול, וזה נתון שאי אפשר
   * להשלים רטרואקטיבית: שורה שנוצרה בלעדיו לא תדע לעולם מתי נפתחה. */
  'מזהה', 'סוג', 'כותרת', 'קטגוריה', 'אזור', 'מיקום X', 'מיקום Y', 'נוצר בתאריך',
  'שלב', 'דגל', 'סגירה',
  'מזהה תבנית', 'שבוע', 'תאריך יעד', 'מספר עובדים',
  'תמונות ביצוע', 'הערת ביצוע', 'מונה גרירות', 'שבוע מקורי',
  'עודכן בתאריך', 'עודכן על ידי', 'אושר על ידי', 'תאריך אישור', 'שנת תקציב'
];

/* ============================================================================
 *  תוכנית העבודה — סכימת טאב השגרה (2026-09-08, אחרי הצוות האדום)
 * ----------------------------------------------------------------------------
 *  המודל שיועד הגדיר: **לא מנוע אוטומטי, אלא אירועים חוזרים שפשוט קיימים
 *  והמנהל עורך אותם.** לכן הטאב הזה מחזיק *הגדרות*, לא משימות. משימה נולדת
 *  ממנו רק כשהשבוע שלה מגיע (ר' gardenMaterializeWeek_).
 *
 *  שלוש החלטות שמעצבות את הכותרות:
 *  1. **תדירות היא הציר היחיד לקיבוץ, וחלון הזמן הוא תכונה.** קודם היה כאן
 *     גם 'עונה', וזה ערבב שני צירים: משימה יכולה להיות *חודשית* וגם *רק
 *     בחורף*, ואז היא שייכת לשתי קבוצות. עכשיו: תדירות = כל כמה זמן,
 *     'חודשים פעילים' = מתי בכלל. 'הכנת ההשקיה לחורף' היא שנתית שחלונה
 *     אוקטובר — לא "תדירות עונתית".
 *  2. **'שבוע ראשון' הוא העוגן.** בלעדיו אי אפשר לדעת על איזה משני השבועות
 *     נופל מחזור דו-שבועי. הוא תאריך של יום ראשון, וממנו נספרות המחזורים.
 *  3. **אין עמודת עדיפות, בכוונה.** הדחיפות נגזרת (דגל × גרירות × ותק) —
 *     החלטת יועד 8.9: שדה ידני ב-12 משימות בשבוע הוא משבצת שאיש לא ימלא.
 *
 *  ⚠️ 'עונה' ירדה מהרשימה. gardenAddMissingCols_ לא מוחק עמודות, ולכן היא
 *  תישאר בטאב קיים כעמודה ריקה ומיותמת — אפשר למחוק ידנית, ואין נזק אם לא.
 * ========================================================================== */
var GARDEN_FREQS = ['שבועי', 'דו-שבועי', 'חודשי', 'שנתי'];

var GARDEN_ROUTINE_HEADERS = [
  'מזהה', 'שם משימה', 'קטגוריה', 'אזורים', 'תדירות',
  'שבוע ראשון',      // עוגן — יום ראשון של המופע הראשון. חובה לדו-שבועי.
  'שבוע בחודש',      // 1–4 לחודשי. לעולם לא 5 (ר' ההערה במנוע).
  'חודשים פעילים',   // '3-11' · '10' · '11,12,1,2' · ריק = כל השנה
  'סבב אזורים',      // 'כן' = אזור אחד בכל מופע, לפי הסדר (§13.3)
  'סעיף בתוכנית', 'פעיל', 'הערות'
];

/* היסטוריה שאינה משתכתבת (עקרון מהאפיון) — כל שינוי שלב/דגל/סגירה נרשם כאן
 * כשורה חדשה. אין עדכון ואין מחיקה בטאב הזה. */
var GARDEN_LOG_HEADERS = [
  'חותמת זמן', 'מזהה משימה', 'סוג רשומה', 'שדה', 'מערך', 'לערך', 'מבצע', 'הערה'
];

var GARDEN_SETTINGS_HEADERS = ['סוג', 'מזהה', 'סדר', 'ערך', 'פעיל', 'הערות'];

/* רשימת האזורים והקטגוריות — מקור אמת יחיד לשני הצדדים (מסך הדיווח של התושב
 * ותבניות השגרה), ר' הממצא על "אין בעלים לרשימת האזורים". נזרעות פעם אחת
 * וניתנות לעריכה מתוך מסך ניהול הגינון; ערך שנערך ידנית לעולם לא נדרס.
 * האזורים לקוחים מסעיף 15.2 באפיון, הקטגוריות מסעיף 6.1 (רשימה סגורה,
 * ובכוונה בלי "אחר" — נושא שאינו גינון לא אמור להיפתח כאן בכלל). */
var GARDEN_DEFAULT_SETTINGS = [
  ['אזור', 'A1', '1', 'שכונה צפונית', 'כן', ''],
  ['אזור', 'A2', '2', 'שכונה מרכזית צפונית', 'כן', ''],
  ['אזור', 'A3', '3', 'שכונה מרכזית דרומית', 'כן', ''],
  ['אזור', 'A4', '4', 'שכונה דרומית', 'כן', ''],
  ['אזור', 'A5', '5', 'מתחמים משותפים', 'כן', ''],
  ['אזור', 'A6', '6', 'ציר מזרחי', 'כן', ''],
  ['אזור', 'A7', '7', 'ציר מערבי', 'כן', ''],
  /* חמשת אלה מגיעים מסעיף 23.3 בתוכנית העבודה של יועד ("מתחמים וצירים").
     הם יושבים *בתוך* "מתחמים משותפים", אבל בתוכנית יש לכל אחד תדירות ומועד
     משלו — ולכן הם חייבים להיות אזורים בפני עצמם, אחרת אי אפשר להגדיר
     "מועדון ילדים כל חודשיים" בנפרד מ"גינת כלבים כל רבעון".
     "מתחמים משותפים" (A5) נשאר לדיווח תושב שאינו נופל באף אחד מהם. */
  ['אזור', 'A8',  '8',  'פארק משחקים',   'כן', ''],
  ['אזור', 'A9',  '9',  'גני ילדים',      'כן', ''],
  ['אזור', 'A10', '10', 'מועדון ילדים',   'כן', ''],
  ['אזור', 'A11', '11', 'גינת כלבים',     'כן', ''],
  ['אזור', 'A12', '12', 'מועדון משפחות',  'כן', ''],
  ['קטגוריה', 'C1', '1', 'מדשאות', 'כן', ''],
  ['קטגוריה', 'C2', '2', 'השקיה / ממטרות', 'כן', ''],
  ['קטגוריה', 'C3', '3', 'עצים', 'כן', ''],
  ['קטגוריה', 'C4', '4', 'שיחים / גיזום', 'כן', ''],
  ['קטגוריה', 'C5', '5', 'עשבייה / קרקע', 'כן', ''],
  ['קטגוריה', 'C6', '6', 'ניקיון גינון / גזם', 'כן', ''],
  ['קטגוריה', 'C7', '7', 'ערוגות / שתילות', 'כן', '']
];

/** עזר: יוצר טאב עם שורת כותרות מוקפאת אם אינו קיים. מחזיר את הטאב.
 *  בטוח להרצה חוזרת — טאב קיים לא נגוע, גם לא שורת הכותרות שלו. */
function gardenEnsureSheet_(ss, name, headers, widths) {
  var sh = ss.getSheetByName(name);
  /* טאב קיים: משלימים עמודות שנוספו לקוד אחרי שהוא נוצר. בלי זה עמודה חדשה
   * ב-GARDEN_*_HEADERS פשוט לא קיימת בגיליון שכבר הותקן, gardenCols_ מחזיר
   * עבורה undefined, וכל כתיבה אליה נופלת בשקט — הפיצ'ר "עובד" ולא שומר
   * כלום. העמודות נוספות מימין ואף עמודה קיימת לא זזה, כך שנתונים ועריכות
   * ידניות של יועד נשמרים. (2026-09-07, אחרי שעמודת "נוצר בתאריך" נוספה
   * לטאב שכבר היה בייצור.) */
  if (sh) { gardenAddMissingCols_(sh, headers); return sh; }
  sh = ss.insertSheet(name);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sh.setFrozenRows(1);
  (widths || []).forEach(function (w, i) { if (w) sh.setColumnWidth(i + 1, w); });
  return sh;
}

/* ============================================================================
 *  דילוג על ensureGardenSheets_ בשמירות חוזרות (2026-09-08 — תיקון ביצועים)
 * ----------------------------------------------------------------------------
 *  ensureGardenSheets_ רץ בכל שמירה, וכל ריצה היא כ-10 פניות לגיליון:
 *  חמישה getSheetByName ועוד קריאת שורת-כותרות לכל טאב בתוך
 *  gardenAddMissingCols_. בקצב שנמדד (~100-300ms לפעולת גיליון) זה
 *  1-3 שניות שהתושב מחכה להן בכל דיווח — כמעט תמיד רק כדי לגלות
 *  שהכול כבר במקום.
 *
 *  מעכשיו שני מסלולי הכתיבה (submitGardenReport_ / gardenCreateTask_)
 *  עוברים דרך ensureGardenSheetsCached_, שרושם דגל במטמון אחרי ריצה
 *  מוצלחת ומדלגים בפעם הבאה.
 *
 *  ⚠️ שתי דרכים לאלץ ריצה מחדש אחרי שמוסיפים עמודה ל-GARDEN_*_HEADERS:
 *     (א) להעלות את GARDEN_SCHEMA_REV כאן למטה — זו הדרך הנכונה;
 *     (ב) להריץ installGardenModule() מהעורך — הוא עוקף את המטמון בכוונה.
 *     בלעדיהן עמודה חדשה לא תיווצר עד שהמטמון יפוג, וכל כתיבה
 *     אליה תיפול בשקט (זו בדיוק התקלה ש-gardenAddMissingCols_ נולד לפתור).
 * ========================================================================== */
/* 2 (2026-09-08): GARDEN_ROUTINE_HEADERS השתנו עם תוכנית העבודה — נוספו
   'שבוע ראשון' ו'סבב אזורים'. בלי ההעלאה הזאת המטמון היה מדלג על
   ensureGardenSheets_ עד שיפוג, והעמודות החדשות פשוט לא היו נוצרות. */
var GARDEN_SCHEMA_REV = 2;
function ensureGardenSheetsCached_(ss) {
  var key = 'garden_schema_v' + GARDEN_SCHEMA_REV;
  try {
    var c = CacheService.getScriptCache();
    if (c.get(key)) return;
    ensureGardenSheets_(ss);
    c.put(key, '1', 21600);   // 6 שעות — המקסימום ש-CacheService מאפשר
  } catch (e) {
    ensureGardenSheets_(ss);  // מטמון לא זמין — מתנהגים בדיוק כמו קודם
  }
}

/** יוצר את חמשת הטאבים של הגינון. בטוח להרצה חוזרת. */
function ensureGardenSheets_(ss) {
  gardenEnsureSheet_(ss, GARDEN_REPORTS_SHEET, GARDEN_REPORT_HEADERS,
    [70, 120, 100, 140, 110, 130, 150, 80, 80, 160, 300, 220]);
  gardenEnsureSheet_(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_HEADERS,
    [70, 80, 260, 130, 150, 80, 80, 100, 140, 120]);
  gardenEnsureSheet_(ss, GARDEN_ROUTINE_SHEET, GARDEN_ROUTINE_HEADERS,
    [70, 220, 130, 220, 110, 200, 100, 90, 140, 60, 240]);
  gardenEnsureSheet_(ss, GARDEN_LOG_SHEET, GARDEN_LOG_HEADERS,
    [140, 90, 110, 100, 140, 140, 160, 280]);

  var cfg = gardenEnsureSheet_(ss, GARDEN_SETTINGS_SHEET, GARDEN_SETTINGS_HEADERS,
    [90, 70, 55, 220, 60, 260]);
  // זריעה: רק מזהים שעדיין לא קיימים. אותה תבנית בדיוק כמו ensureGymSheets_ —
  // ערך שיועד או אחראי הגינון ערכו ידנית לעולם לא נדרס.
  var values = cfg.getDataRange().getValues();
  var existing = {};
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0]).trim() + '|' + String(values[r][1]).trim();
    if (key !== '|') existing[key] = true;
  }
  var toAdd = GARDEN_DEFAULT_SETTINGS.filter(function (row) {
    return !existing[String(row[0]).trim() + '|' + String(row[1]).trim()];
  });
  if (toAdd.length) {
    cfg.getRange(cfg.getLastRow() + 1, 1, toAdd.length, GARDEN_SETTINGS_HEADERS.length)
       .setValues(toAdd);
  }
  return cfg;
}

/** מוסיף לטאב "תושבים" את עמודת "סוג משתמש" אם אינה קיימת. ר' EXTERNAL_HEADER.
 *  לא נוגע בשום ערך קיים — רק מוסיף כותרת בעמודה הפנויה הראשונה. */
function ensureExternalCol_(ss) {
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return { ok: false, error: 'אין טאב "תושבים"' };
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  for (var i = 0; i < headers.length; i++) {
    if (headers[i].indexOf(EXTERNAL_HEADER) !== -1) {
      return { ok: true, added: false, col: i + 1 };
    }
  }
  var col = lastCol + 1;
  sh.getRange(1, col).setValue(EXTERNAL_HEADER);
  sh.getRange(1, col).setFontWeight('bold');
  sh.setColumnWidth(col, 110);
  return { ok: true, added: true, col: col };
}

/* ----------------------------------------------------------------------------
 *  התקנה — להרצה ידנית פעם אחת מתוך עורך ה-Apps Script (כפתור Run).
 *  יוצרת את חמשת הטאבים, מוסיפה את עמודת "סוג משתמש" לטאב תושבים, ומרעננת
 *  את טאב הגדרות המיילים כדי שתבניות הגינון ייכנסו אליו.
 *  אידמפוטנטית לחלוטין — אפשר להריץ שוב בלי נזק.
 * -------------------------------------------------------------------------- */
function installGardenModule() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGardenSheets_(ss);
  var ext = ensureExternalCol_(ss);
  ensureEmailSettingsSheet_(ss);
  Logger.log('✓ טאבי הגינון מוכנים: ' +
    [GARDEN_REPORTS_SHEET, GARDEN_TASKS_SHEET, GARDEN_ROUTINE_SHEET,
     GARDEN_LOG_SHEET, GARDEN_SETTINGS_SHEET].join(' · '));
  Logger.log(ext.added
    ? '✓ נוספה עמודת "' + EXTERNAL_HEADER + '" לטאב תושבים (עמודה ' + ext.col + ')'
    : '✓ עמודת "' + EXTERNAL_HEADER + '" כבר קיימת בטאב תושבים (עמודה ' + ext.col + ')');
  Logger.log('✓ תבניות המייל של הגינון נוספו לטאב "' + EMAIL_SETTINGS_SHEET + '"');
  Logger.log('— כדי לתת לאביתר גישה: שורה בטאב תושבים, אימייל הגוגל שלו, ' +
    '"' + PERM_GARDEN + '" בעמודת ההרשאות, ו-"' + EXTERNAL_VALUE + '" בעמודת "' + EXTERNAL_HEADER + '".');
  return { ok: true };
}


/* ============================================================================
 *  מודול הגינון — צד השרת של אזור התושב (2026-09-07, צעד 3)
 * ----------------------------------------------------------------------------
 *  שלוש פעולות: הגשת דיווח, שליפת הדיווחים של הקורא, ומשוב אחרי סגירה.
 *  כולן **אינן** ב-ACTION_PERMS בכוונה — הן פתוחות לכל תושב מחובר ופעיל,
 *  כמו הגשת קבלה, ופועלות אך ורק על השורות של הקורא לפי המושב החתום.
 *
 *  דיווח תושב יוצר **שתי שורות**: אחת בטאב הדיווחים (מה שהתושב אמר) ואחת
 *  בטאב המשימות (מה שהצוות מטפל בו). ההפרדה היא הליבה של האפיון — שני
 *  תושבים יכולים לדווח על אותה תקלה, וכל דיווח נשמר בפני עצמו לצורכי
 *  היסטוריה בעוד הטיפול מתנהל במקום אחד. עמודת "מזהה משימה" היא הקישור,
 *  ובשלב 6 (איחוד כפילויות) דיווח חדש יצביע למשימה קיימת במקום ליצור חדשה.
 * ========================================================================== */

var GARDEN_PHOTOS_FOLDER_NAME = 'גינון';

/** תיקיית תמונות הגינון לחודש נתון, תחת אותה תיקיית "שיכון" של הקבלות.
 *  הקבצים נשארים **פרטיים** — הצפייה עוברת דרך handleGardenPhoto_ שבודק
 *  הרשאה ומגיש את הקובץ בעצמו, בדיוק כמו handleReceiptFile_ בקבלות. */
function getGardenPhotosFolder_(monthKey) {
  var root = DriveApp.getFolderById(ROOT_RECEIPTS_FOLDER_ID);
  var g = findOrCreateSubfolder_(root, GARDEN_PHOTOS_FOLDER_NAME);
  return findOrCreateSubfolder_(g, monthKey ||
    Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM'));
}

/** מפת כותרת->אינדקס, כדי שסדר העמודות בגיליון יוכל להשתנות בלי לשבור קוד. */
/* כותרות שהשם שלהן השתנה אחרי שכבר היו טאבים בשטח. בלי המפה הזאת
   gardenAddMissingCols_ היה מוסיף עמודה חדשה וריקה ומשאיר את הישנה עם כל
   הנתונים — כלומר "עבד" ואיבד את המידע בשקט. שם ישן -> שם חדש. */
var GARDEN_RENAMED_COLS = {
  'סעיף בחוזה': 'סעיף בתוכנית'   // 2026-09-08, החלטת מונחים: "תוכנית העבודה"
};

/** משלים לטאב קיים עמודות שקיימות ב-headers ואינן בשורת הכותרת,
 *  ומעדכן קודם כותרות ששמן שונה (ר' GARDEN_RENAMED_COLS). */
function gardenAddMissingCols_(sh, headers) {
  try {
    var last = sh.getLastColumn();
    if (!last) { sh.getRange(1, 1, 1, headers.length).setValues([headers]); return; }
    var rng = sh.getRange(1, 1, 1, last);
    var have = rng.getValues()[0].map(function (h) { return String(h).trim(); });

    var renamed = false;
    for (var i = 0; i < have.length; i++) {
      var to = GARDEN_RENAMED_COLS[have[i]];
      // רק אם השם החדש נחוץ לטאב הזה ועדיין אינו בו — אחרת שני טורים באותו שם.
      if (to && headers.indexOf(to) !== -1 && have.indexOf(to) === -1) {
        have[i] = to; renamed = true;
      }
    }
    if (renamed) rng.setValues([have]);

    var missing = headers.filter(function (h) { return have.indexOf(h) === -1; });
    if (!missing.length) return;
    sh.getRange(1, last + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  } catch (e) { /* השלמת עמודות לא מפילה התקנה */ }
}

function gardenCols_(sh) {
  var last = sh.getLastColumn();
  var h = sh.getRange(1, 1, 1, last).getValues()[0];
  var m = {};
  for (var i = 0; i < h.length; i++) m[String(h[i]).trim()] = i;
  return m;
}

/** המזהה הפנוי הבא בטאב (מספר רץ, לא תלוי במספר השורות — כך שמחיקת שורה
 *  ידנית לא תגרום לשני פריטים לקבל אותו מספר). */
function nextGardenId_(sh, colName) {
  var c = gardenCols_(sh)[colName || 'מזהה'];
  var n = Math.max(sh.getLastRow() - 1, 0);
  if (!n) return 1;
  var vals = sh.getRange(2, c + 1, n, 1).getValues();
  var max = 0;
  for (var i = 0; i < vals.length; i++) {
    var v = parseInt(String(vals[i][0]).replace(/\D/g, ''), 10);
    if (!isNaN(v) && v > max) max = v;
  }
  return max + 1;
}

/** רשימות האזורים והקטגוריות מטאב ההגדרות — מקור אמת יחיד. */
function gardenLists_(ss) {
  var sh = ss.getSheetByName(GARDEN_SETTINGS_SHEET);
  var out = { areas: [], categories: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) {
    var kind = String(v[r][0]).trim(), val = String(v[r][3]).trim(),
        active = String(v[r][4]).trim();
    if (!val || active === 'לא') continue;
    if (kind === 'אזור') out.areas.push(val);
    else if (kind === 'קטגוריה') out.categories.push(val);
  }
  return out;
}

/** שורה ליומן. היסטוריה שאינה משתכתבת — רק הוספה, לעולם לא עדכון. */
function gardenLog_(ss, taskId, kind, field, from, to, who, note) {
  try {
    var sh = ss.getSheetByName(GARDEN_LOG_SHEET);
    if (!sh) return;
    sh.appendRow([new Date(), taskId, kind, field || '', from || '', to || '',
                  who || '', note || '']);
  } catch (e) { /* יומן לא מפיל פעולה */ }
}

/* ---------- קטגוריות ואזורים למסך הדיווח (doGet) ---------- */
function handleGardenMeta_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var lists = gardenLists_(ss);
    var settings = getEmailSettings_(ss);
    return json_({
      ok: true,
      categories: lists.categories,
      areas: lists.areas,
      photoMax: parseInt(emailRule_(settings, 'RULE_GARDEN_PHOTO_MAX', 8), 10) || 8,
      feedbackDays: parseInt(emailRule_(settings, 'RULE_GARDEN_FEEDBACK_DAYS', 7), 10) || 7
    });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ---------- הדיווחים של הקורא (doGet) ---------- */
function handleMyGardenReports_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var famId = String(gate.perm.familyId || '');
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    if (!rsh || rsh.getLastRow() < 2) return json_({ ok: true, rows: [] });

    var rc = gardenCols_(rsh);
    var rows = rsh.getDataRange().getValues();

    // מפת משימות לפי מזהה — כדי לא לסרוק את הטאב מחדש לכל דיווח
    var tasks = {};
    if (tsh && tsh.getLastRow() > 1) {
      var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
      for (var i = 1; i < tv.length; i++) {
        var tid = String(tv[i][tc['מזהה']]).trim();
        if (tid) tasks[tid] = {
          stage:   String(tv[i][tc['שלב']] || '').trim(),
          flag:    String(tv[i][tc['דגל']] || '').trim(),
          closure: String(tv[i][tc['סגירה']] || '').trim(),
          approvedAt: tv[i][tc['תאריך אישור']] || ''
        };
      }
    }

    /* ההסבר שהמנהל כתב בסגירה — נשלף מהיומן ולא מעמודה חדשה, כי הוא כבר
       נשמר שם (gardenLog_ עם סוג רשומה "סגירה"). כך התושב רואה באפליקציה
       בדיוק את מה שקיבל במייל, ולא רק את המילה "בוטל". */
    var closeWhy = {};
    try {
      var lsh = ss.getSheetByName(GARDEN_LOG_SHEET);
      if (lsh && lsh.getLastRow() > 1) {
        var lc = gardenCols_(lsh), lv = lsh.getDataRange().getValues();
        for (var li = 1; li < lv.length; li++) {
          if (String(lv[li][lc['סוג רשומה']]).trim() !== 'סגירה') continue;
          var note = String(lv[li][lc['הערה']] || '').trim();
          if (note) closeWhy[String(lv[li][lc['מזהה משימה']]).trim()] = note;
        }
      }
    } catch (e) { /* בלי היומן פשוט אין הסבר — הסטטוס עצמו עדיין מוצג */ }

    var settings = getEmailSettings_(ss);
    var fbDays = parseInt(emailRule_(settings, 'RULE_GARDEN_FEEDBACK_DAYS', 7), 10) || 7;
    var now = new Date().getTime();
    var out = [];
    for (var r = 1; r < rows.length; r++) {
      if (String(rows[r][rc['מזהה משפחה']]).trim() !== famId) continue;
      var taskId = String(rows[r][rc['מזהה משימה']] || '').trim();
      var t = tasks[taskId] || { stage: 'התקבל', flag: '', closure: '', approvedAt: '' };
      var closedAt = rows[r][rc['תאריך משוב']];
      var d = rows[r][rc['תאריך דיווח']];
      var already = String(rows[r][rc['משוב']] || '').trim();
      /* חלון המשוב (F-11): שבוע מרגע **האישור**, לא מרגע הדיווח. עד 7.9 לא
         הייתה חותמת אישור בטאב המשימות והחלון לא נאכף בכלל; מאז שנוספה
         "תאריך אישור" אפשר לחשב אותו נכון. משימה שאושרה לפני יותר משבוע
         כבר לא פתוחה למשוב — וזו בדיוק ההגבלה שהאפיון ביקש. */
      var appr = t.approvedAt instanceof Date ? t.approvedAt.getTime() : 0;
      var inWindow = !appr || (now - appr) <= fbDays * 86400000;
      var canFb = (t.stage === 'הושלם') && !already && inWindow &&
                  t.closure !== GARDEN_CLOSURE_MERGED;
      out.push({
        closeWhy: closeWhy[taskId] || '',
        id: String(rows[r][rc['מזהה']]),
        date: d instanceof Date ? d.toISOString() : String(d || ''),
        category: String(rows[r][rc['קטגוריה']] || ''),
        area: String(rows[r][rc['אזור']] || ''),
        x: parseFloat(rows[r][rc['מיקום X']]) || null,
        y: parseFloat(rows[r][rc['מיקום Y']]) || null,
        place: String(rows[r][rc['מיקום מילולי']] || ''),
        desc: String(rows[r][rc['תיאור']] || ''),
        photos: String(rows[r][rc['תמונות']] || '').split(',')
                  .map(function (x) { return x.trim(); }).filter(Boolean),
        stage: t.stage, flag: t.flag, closure: t.closure,
        mergedInto: String(rows[r][rc['אוחד לדיווח']] || ''),
        feedback: already,
        canFeedback: canFb
      });
    }
    out.reverse();   // החדש למעלה
    return json_({ ok: true, rows: out });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ---------- הגשת דיווח (doPost) ---------- */
function submitGardenReport_(ss, body) {
  var perm = body._perm || {};
  var lists = gardenLists_(ss);
  var cat = String(body.category || '').trim();
  // רשימה סגורה, ובכוונה: נושא שאינו גינון לא אמור להיפתח כאן בכלל.
  if (lists.categories.length && lists.categories.indexOf(cat) === -1) {
    return { ok: false, error: 'קטגוריה לא מוכרת' };
  }
  var desc = String(body.desc || '').trim();
  if (!cat) return { ok: false, error: 'לא נבחרה קטגוריה' };

  var x = (body.x === null || body.x === undefined) ? '' : Number(body.x);
  var y = (body.y === null || body.y === undefined) ? '' : Number(body.y);
  // קואורדינטות מנורמלות 0–1 בלבד. ר' ההערה ליד GARDEN_TASK_HEADERS.
  if (x !== '' && (x < 0 || x > 1)) return { ok: false, error: 'מיקום לא תקין' };
  if (y !== '' && (y < 0 || y > 1)) return { ok: false, error: 'מיקום לא תקין' };
  if (x === '' && !String(body.place || '').trim()) {
    return { ok: false, error: 'צריך לסמן מיקום על המפה או לכתוב אותו במילים' };
  }

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGardenSheetsCached_(ss);   // ר' ההערה ליד ensureGardenSheetsCached_
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    var rc = gardenCols_(rsh), tc = gardenCols_(tsh);

    var settings = getEmailSettings_(ss);
    var photoMax = parseInt(emailRule_(settings, 'RULE_GARDEN_PHOTO_MAX', 8), 10) || 8;

    // תמונות — לתיקייה פרטית, כמו קבלות. שומרים מזהי קובץ ולא קישורים.
    var ids = [];
    var photos = (body.photos || []).slice(0, photoMax);
    for (var i = 0; i < photos.length; i++) {
      try {
        var blob = Utilities.newBlob(
          Utilities.base64Decode(photos[i].data),
          photos[i].mime || 'image/jpeg',
          photos[i].name || ('garden-' + Date.now() + '-' + i + '.jpg'));
        ids.push(getGardenPhotosFolder_().createFile(blob).getId());
      } catch (e) { /* תמונה שנכשלה לא מפילה את הדיווח */ }
    }

    var year = readSettings_(ss)['שנה נוכחית'] || '';
    var taskId = nextGardenId_(tsh);
    var repId  = nextGardenId_(rsh);
    var name = ((perm.firstName || '') + ' ' + (perm.family || '')).trim() || body._email;
    var title = cat + (body.place ? ' — ' + String(body.place).trim() : '');

    // 1. המשימה — מה שהצוות מטפל בו
    var trow = new Array(tsh.getLastColumn()).fill('');
    trow[tc['מזהה']] = taskId;
    trow[tc['סוג']] = GARDEN_KIND_REPORT;
    trow[tc['כותרת']] = desc ? desc.substring(0, 120) : title;
    trow[tc['קטגוריה']] = cat;
    trow[tc['אזור']] = String(body.area || '');
    trow[tc['מיקום X']] = x; trow[tc['מיקום Y']] = y;
    trow[tc['שלב']] = 'התקבל';
    trow[tc['נוצר בתאריך']] = new Date();
    trow[tc['עודכן בתאריך']] = new Date();
    trow[tc['עודכן על ידי']] = name;
    trow[tc['שנת תקציב']] = year;
    tsh.appendRow(trow);

    // 2. הדיווח — מה שהתושב אמר
    var rrow = new Array(rsh.getLastColumn()).fill('');
    rrow[rc['מזהה']] = repId;
    rrow[rc['תאריך דיווח']] = new Date();
    rrow[rc['מזהה משפחה']] = perm.familyId || '';
    rrow[rc['שם מדווח']] = name;
    rrow[rc['טלפון']] = String(body.phone || '');
    rrow[rc['קטגוריה']] = cat;
    rrow[rc['אזור']] = String(body.area || '');
    rrow[rc['מיקום X']] = x; rrow[rc['מיקום Y']] = y;
    rrow[rc['מיקום מילולי']] = String(body.place || '');
    rrow[rc['תיאור']] = desc;
    rrow[rc['תמונות']] = ids.join(',');
    rrow[rc['מזהה משימה']] = taskId;
    rrow[rc['שנת תקציב']] = year;
    rsh.appendRow(rrow);

    gardenLog_(ss, taskId, 'נפתח', 'שלב', '', 'התקבל', name, 'דיווח תושב #' + repId);

    var place = String(body.place || body.area || '').trim() || 'השיכון';
    try {
      sendResidentTemplate_(ss, 'GARDEN_REPORT_RECEIVED',
        emailsForFamilyId_(ss, perm.familyId),
        { 'שם': perm.firstName || name, 'מזהה': repId, 'קטגוריה': cat, 'מיקום': place });
      notifyAdmins_(ss, PERM_GARDEN, 'ADMIN_NEW_GARDEN_REPORT',
        { 'שם': name, 'מזהה': repId, 'קטגוריה': cat, 'מיקום': place });
    } catch (e) { /* כשל מייל לא מבטל דיווח שכבר נשמר */ }

    return { ok: true, id: repId, taskId: taskId, photos: ids };
  } finally { lock.releaseLock(); }
}

/* ---------- משוב אחרי סגירה (doPost) ---------- */
function gardenFeedback_(ss, body) {
  var perm = body._perm || {};
  var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
  if (!rsh) return { ok: false, error: 'אין טאב דיווחים' };
  var rc = gardenCols_(rsh);
  var v = rsh.getDataRange().getValues();
  var famId = String(perm.familyId || '');

  for (var r = 1; r < v.length; r++) {
    if (String(v[r][rc['מזהה']]) !== String(body.id)) continue;
    // רק על הדיווח שלך. בדיקה בשרת, לא בלקוח.
    if (String(v[r][rc['מזהה משפחה']]).trim() !== famId) {
      return { ok: false, error: 'הדיווח אינו שלך' };
    }
    if (String(v[r][rc['משוב']] || '').trim()) {
      return { ok: false, error: 'כבר נתת משוב על הדיווח הזה' };
    }
    var positive = !!body.positive;
    rsh.getRange(r + 1, rc['משוב'] + 1).setValue(positive ? 'חיובי' : 'שלילי');
    rsh.getRange(r + 1, rc['תאריך משוב'] + 1).setValue(new Date());
    rsh.getRange(r + 1, rc['הערת משוב'] + 1).setValue(String(body.note || '').substring(0, 500));

    var taskId = String(v[r][rc['מזהה משימה']] || '').trim();
    var name = ((perm.firstName || '') + ' ' + (perm.family || '')).trim();
    gardenLog_(ss, taskId, 'משוב', 'משוב', '', positive ? 'חיובי' : 'שלילי', name,
      String(body.note || ''));

    /* משוב שלילי **לא** פותח את התקלה מחדש אוטומטית — הוא מרים דגל
       "דורש בדיקה חוזרת" וההחלטה נשארת אנושית. ר' §18.3 באפיון. */
    if (!positive && taskId) {
      var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
      if (tsh) {
        var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
        for (var i = 1; i < tv.length; i++) {
          if (String(tv[i][tc['מזהה']]) !== taskId) continue;
          tsh.getRange(i + 1, tc['דגל'] + 1).setValue('דורש בדיקה חוזרת');
          break;
        }
      }
      try {
        notifyAdmins_(ss, PERM_GARDEN, 'ADMIN_GARDEN_NEGATIVE_FEEDBACK', {
          'שם': name, 'מזהה': body.id,
          'קטגוריה': String(v[r][rc['קטגוריה']] || ''),
          'מיקום': String(v[r][rc['מיקום מילולי']] || v[r][rc['אזור']] || ''),
          'הערה': String(body.note || '(לא נכתבה הערה)')
        });
      } catch (e) { /* לא קריטי */ }
    }
    return { ok: true };
  }
  return { ok: false, error: 'הדיווח לא נמצא' };
}

/* ---------- הגשת תמונת גינון (doGet) ----------
 *  אותה תבנית כמו handleReceiptFile_: הקובץ פרטי ב-Drive, והשרת מגיש אותו
 *  רק אחרי בדיקת הרשאה — המדווח עצמו, או מי שיש לו הרשאת גינון. */
function handleGardenPhoto_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, null);
    if (!gate.ok) return ContentService.createTextOutput('אין הרשאה');
    var id = String(p.fileId || '').trim();
    if (!id) return ContentService.createTextOutput('חסר מזהה');

    var isGardener = !!gate.perm.isSuper ||
      (gate.perm.perms || []).indexOf(PERM_GARDEN) !== -1;
    if (!isGardener) {
      // לא איש גינון — מותר לו רק תמונה ששייכת לדיווח שלו
      var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
      var mine = false;
      if (rsh && rsh.getLastRow() > 1) {
        var rc = gardenCols_(rsh), v = rsh.getDataRange().getValues();
        var famId = String(gate.perm.familyId || '');
        for (var r = 1; r < v.length; r++) {
          if (String(v[r][rc['מזהה משפחה']]).trim() !== famId) continue;
          if (String(v[r][rc['תמונות']] || '').indexOf(id) !== -1) { mine = true; break; }
        }
      }
      if (!mine) return ContentService.createTextOutput('אין הרשאה');
    }
    var file = DriveApp.getFileById(id);
    return ContentService
      .createTextOutput(Utilities.base64Encode(file.getBlob().getBytes()))
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) { return ContentService.createTextOutput('שגיאה'); }
}

/* ==========================================================================
   מראה שיכון — שלב 4: משימות הצוות
   --------------------------------------------------------------------------
   מי רואה מה: שתי אוכלוסיות חולקות את PERM_GARDEN ונבדלות בעמודה "סוג משתמש".
   אחראי הגינון (חיצוני) מקבל רשימת ביצוע בלבד; מנהל הגינון (פנימי) מקבל את
   אותה רשימה ובנוסף את מה ששייך לתכנון ולאישור. ההבחנה הזאת כבר קיימת במערכת
   (perm.isExternal, ר' authorize_) ולכן לא נוצרה כאן הרשאה שלישית.

   מפתח השבוע: תאריך יום ראשון של אותו שבוע בפורמט YYYY-MM-DD. נבחר על פני
   "מספר שבוע" כי הוא חד-משמעי, לא תלוי בשנה אזרחית מול שנת תקציב, ומאפשר
   לחשב "שבוע קודם/הבא" בחיבור פשוט של 7 ימים. התצוגה ("שבוע 2 בספטמבר")
   נגזרת ממנו בצד הלקוח.
   ========================================================================== */

/** יום ראשון של השבוע שבו נופל התאריך, כמחרוזת YYYY-MM-DD. */
function gardenWeekKey_(d) {
  var t = d ? new Date(d) : new Date();
  if (isNaN(t.getTime())) t = new Date();
  t.setHours(12, 0, 0, 0);              // צהריים — חסין מפני מעבר שעון קיץ
  t.setDate(t.getDate() - t.getDay());  // getDay: 0 = ראשון
  return Utilities.formatDate(t, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** הזזת מפתח שבוע בכמה שבועות קדימה/אחורה. */
function gardenWeekShift_(key, weeks) {
  var p = String(key || '').split('-');
  var t = new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0);
  if (isNaN(t.getTime())) t = new Date();
  t.setDate(t.getDate() + (weeks || 0) * 7);
  return gardenWeekKey_(t);
}

/** ערך תא -> מחרוזת נקייה (תאריכים מגיעים מהגיליון כאובייקט Date). */
function gardenCell_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).trim();
}

/** שורת משימה -> אובייקט ללקוח. שם השדה באנגלית, הערך בעברית כפי שהוא בגיליון. */
function gardenTaskObj_(row, c) {
  function g(name) { return gardenCell_(row[c[name]]); }
  var x = row[c['מיקום X']], y = row[c['מיקום Y']];
  var kind = g('סוג');
  return {
    id:        g('מזהה'),
    kind:      GARDEN_KIND_LEGACY[kind] || kind,
    templateId: g('מזהה תבנית'),
    title:     g('כותרת'),
    category:  g('קטגוריה'),
    area:      g('אזור'),
    x:         (x === '' || x === null || x === undefined) ? null : Number(x),
    y:         (y === '' || y === null || y === undefined) ? null : Number(y),
    stage:     g('שלב'),
    flag:      g('דגל'),
    closure:   g('סגירה'),
    week:      g('שבוע'),
    due:       g('תאריך יעד'),
    note:      g('הערת ביצוע'),
    drags:     parseInt(g('מונה גרירות'), 10) || 0,
    firstWeek: g('שבוע מקורי'),
    createdAt: g('נוצר בתאריך'),
    updatedAt: g('עודכן בתאריך'),
    updatedBy: g('עודכן על ידי'),
    /* מי אישר ומתי (2026-09-08). בלי שני אלה משימה שאושרה נראית בדיוק כמו
       משימה שנסגרה מעצמה, ואי אפשר לענות על "מי סגר את זה ומתי" — שאלה
       שנשאלת דווקא כשמשהו השתבש. */
    approvedBy: g('אושר על ידי'),
    approvedAt: g('תאריך אישור')
  };
}

/* ---------- רשימת המשימות (doGet) ----------
   week   — מפתח שבוע; ברירת מחדל: השבוע הנוכחי.
   scope  — 'week' (ברירת מחדל) | 'unplanned' (בלי שבוע משובץ) | 'pending' (ממתין לאישור).
   'unplanned' ו-'pending' הן תצוגות של המנהל בלבד: לאחראי הגינון אין מה
   לעשות עם משימה שטרם תוכננה, והאישור אינו בסמכותו. */
function handleGardenTasks_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_GARDEN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var perm = gate.perm || {};
    var scope = String(p.scope || 'week');
    /* ⚠️ הגנן רואה גם 'unplanned' (החלטת יועד 8.9): **שיבוץ תקלת תושב עבר
       אליו**, והוא זה שיודע אם שתי פניות הן אותה ממטרה ואם משהו כבר מתוזמן.
       'pending' — תור האישורים — נשאר חסום: זה תור שממתין *למנהל*, ולתת
       לקבלן לראות את מה שממתין לאישור שלו עצמו זה להזמין לחץ. */
    if (perm.isExternal && scope !== 'week' && scope !== 'unplanned') scope = 'week';

    var week = String(p.week || '').match(/^\d{4}-\d{2}-\d{2}$/) ? p.week : gardenWeekKey_();
    /* מימוש התוכנית לשבוע המבוקש — **לפני** קריאת הגיליון, אחרת המשימות
       שנוצרו עכשיו לא יופיעו בתשובה הזאת אלא רק ברענון הבא. הפעולה
       אידמפוטנטית ואינה נוגעת בשבועות שעברו (ר' gardenMaterializeWeek_),
       ולכן בטוח לקרוא לה בכל טעינה. */
    if (scope === 'week') {
      try { gardenMaterializeWeek_(ss, week); }
      catch (mErr) { /* כשל מימוש לא מפיל את טעינת המסך */ }
    }

    var sh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    if (!sh || sh.getLastRow() < 2) {
      return json_({ ok: true, rows: [], week: week, isManager: !perm.isExternal });
    }
    var c = gardenCols_(sh);
    var vals = sh.getDataRange().getValues();

    var rows = [];
    // כל המשימות הפתוחות — נחוץ רק לזיהוי כפילויות בתצוגת "לשיבוץ",
    // כי מועמד לאיחוד יכול להיות משימה שכבר שובצה לשבוע אחר.
    var all = [];
    for (var r = 1; r < vals.length; r++) {
      if (!gardenCell_(vals[r][c['מזהה']])) continue;
      var o = gardenTaskObj_(vals[r], c);
      /* משימה סגורה **חוזרת לתצוגת השבוע** (2026-09-08). עד היום היא נעלמה
         מהאפליקציה לגמרי ברגע האישור, ויועד תיאר בדיוק את התוצאה: "לוחצים
         אישור והיא פשוט נעלמת, אין דרך לראות משימות שבוצעו".
         ⚠️ זה גם היה באג במונה: `סה"כ` נספר מ-rows, ולכן כל אישור *הקטין*
         את המכנה — שבוע שהושלם כולו הראה "אין משימות" במקום 12 מתוך 12.
         היא נשארת מחוץ ל-unplanned, ל-pending ולבריכת הכפילויות: שם היא
         באמת לא רלוונטית, ו"אוחד" הוא סגירה בפני עצמה. */
      if (scope === 'unplanned') { if (!o.closure && !o.week) rows.push(o); }
      else if (scope === 'pending') { if (!o.closure && o.flag === 'ממתין לאישור') rows.push(o); }
      else if (o.week === week) rows.push(o);
      if (o.closure) continue;
      /* all נאסף תמיד ובלי תלות ב-scope: מועמד לאיחוד יכול להיות דווקא משימה
         שכבר שובצה לשבוע — וזה המקרה השכיח, כי הכפילות מגיעה אחרי המקור. */
      all.push(o);
    }
    /* מועמד לאיחוד מחושב רק לתצוגת "לשיבוץ" ורק למנהל: זה הרגע שבו הוא פוגש
       דיווח חדש בפעם הראשונה, ולפני ששיבץ עבודה כפולה. ר' gardenDupCandidate_. */
    if (scope === 'unplanned') {
      var defs = gardenPlanRows_(ss);
      var lists0 = gardenLists_(ss);
      for (var q = 0; q < rows.length; q++) {
        rows[q].dupOf = gardenDupCandidate_(rows[q], all);
        rows[q].coveredBy = gardenPlanCovers_(ss, rows[q], defs, lists0.areas);
      }
    }
    /* areas/categories מוחזרות בסדר שבו הן מוגדרות בטאב ההגדרות (עמודת "סדר"),
       ולא לפי א"ב. זה הסדר שבו הן נכתבו — צפון לדרום — והוא הסדר שבו אחראי
       הגינון באמת מתקדם בשטח. הלקוח מקבץ לפיו. */
    var lists = gardenLists_(ss);
    return json_({
      ok: true, rows: rows, week: week, scope: scope,
      isManager: !perm.isExternal,
      areas: lists.areas, categories: lists.categories
    });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ============================================================================
 *  תוכנית העבודה — המנוע (2026-09-08)
 * ----------------------------------------------------------------------------
 *  המודל, במילים של יועד: *"לא מנוע אוטומטי, אלא מערכת שבה אני מייצר אירועים
 *  חוזרים... זה פשוט קיים בזיכרון כמשימות שגרה. המנהל עורך אותן."*
 *
 *  ולכן: הטאב מחזיק **הגדרות**. שורת משימה נולדת רק כשהשבוע שלה מגיע ומישהו
 *  פותח אותו — gardenMaterializeWeek_. שלוש תוצאות שנובעות מזה, וכולן רצויות:
 *
 *  1. **עריכה משפיעה קדימה בלבד**, בלי שום קוד מיוחד: שבוע שכבר מומש מחזיק
 *     שורות אמיתיות, ושינוי ההגדרה לא נוגע בהן.
 *  2. **אין מימוש רטרואקטיבי.** שבוע שעבר ואיש לא פתח נשאר ריק לנצח — וזו
 *     האמת: אף אחד לא עבד לפיו. מימוש אחורה היה ממציא עבודה שלא נעשתה
 *     ומזייף את המכנה של "כמה מהתוכנית בוצע".
 *  3. **המכנה לסטטיסטיקה תמיד זמין**, גם לשבועות שלא מומשו: כמה *היה אמור*
 *     לקרות מחושב מההגדרות בכל רגע (gardenPlanForWeek_), בלי לגעת בגיליון.
 *
 *  ⚠️ שבוע 5 לעולם אינו מקבל שגרה. החודש הוא ארבעה שבועות (החלטת יועד),
 *  והשבוע החמישי נוצר רק כשמשימה **נגררת** אליו. שגרה שתיפול בו הייתה
 *  מייצרת חודש בן חמישה כיסוחים פעם בכמה חודשים, בלי שאיש ביקש.
 * ========================================================================== */

/** פירוק מפתח שבוע (יום ראשון) למה שהמנוע צריך: מספר השבוע בחודש, חודש, שנה. */
function gardenWeekMeta_(weekKey) {
  var p = String(weekKey || '').split('-');
  var d = new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0);
  if (isNaN(d.getTime())) return null;
  return {
    date: d,
    n: Math.floor((d.getDate() - 1) / 7) + 1,   // 1–5, לפי יום ראשון
    month: d.getMonth() + 1,
    year: d.getFullYear()
  };
}

/** '3-11' · '10' · '11,12,1,2' · ריק. מחזיר null כשאין הגבלה (כל השנה). */
function gardenParseMonths_(txt) {
  var t = String(txt || '').trim();
  if (!t) return null;
  var out = {};
  t.split(',').forEach(function (part) {
    var m = part.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (m) {
      var a = +m[1], b = +m[2];
      // טווח שעובר את סוף השנה ('11-2') נספר מסביב ולא הופך לריק.
      for (var i = 0; i < 12; i++) {
        var mo = ((a - 1 + i) % 12) + 1;
        out[mo] = 1;
        if (mo === b) break;
      }
    } else {
      var one = parseInt(part, 10);
      if (one >= 1 && one <= 12) out[one] = 1;
    }
  });
  return Object.keys(out).length ? out : null;
}

/** קריאת טאב השגרה כאובייקטים. defs תמיד מערך, גם כשהטאב ריק. */
function gardenPlanRows_(ss) {
  var sh = ss.getSheetByName(GARDEN_ROUTINE_SHEET);
  if (!sh || sh.getLastRow() < 2) return [];
  var c = gardenCols_(sh);
  var v = sh.getDataRange().getValues();
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var g = function (k) { return c[k] === undefined ? '' : gardenCell_(v[r][c[k]]); };
    if (!g('מזהה')) continue;
    var first = c['שבוע ראשון'] === undefined ? '' : v[r][c['שבוע ראשון']];
    out.push({
      id:        g('מזהה'),
      row:       r + 1,
      title:     g('שם משימה'),
      category:  g('קטגוריה'),
      areas:     String(g('אזורים') || '').split(',')
                   .map(function (x) { return x.trim(); }).filter(Boolean),
      freq:      g('תדירות') || 'שבועי',
      firstWeek: (first instanceof Date) ? gardenWeekKey_(first) : String(first || '').trim(),
      weekOfMonth: parseInt(g('שבוע בחודש'), 10) || 1,
      months:    g('חודשים פעילים'),
      rotate:    /^(כן|yes|true|1)$/i.test(String(g('סבב אזורים') || '')),
      clause:    g('סעיף בתוכנית'),
      active:    !/^(לא|no|false|0)$/i.test(String(g('פעיל') || 'כן')),
      note:      g('הערות')
    });
  }
  return out;
}

/* מונה המופעים מאז העוגן. הוא משמש לשני דברים: להכריע אם מחזור דו-שבועי
   נופל על השבוע הזה, ולקבוע לאיזה אזור הגיע התור בסבב (§13.3). בלי עוגן
   נופלים לראשון בינואר של שנת השבוע — דטרמיניסטי, ולכן הסבב עדיין יציב. */
function gardenOccIndex_(def, meta) {
  var a = gardenWeekMeta_(def.firstWeek) ||
          gardenWeekMeta_(gardenWeekKey_(new Date(meta.year, 0, 1)));
  var days = Math.round((meta.date.getTime() - a.date.getTime()) / 86400000);
  if (def.freq === 'שבועי')     return Math.floor(days / 7);
  if (def.freq === 'דו-שבועי')  return Math.floor(days / 14);
  if (def.freq === 'חודשי')     return (meta.year - a.year) * 12 + (meta.month - a.month);
  return meta.year - a.year;                       // שנתי
}

/** האם ההגדרה חלה על השבוע הזה. */
function gardenPlanApplies_(def, meta) {
  if (!def.active) return false;
  if (meta.n === 5) return false;                  // ⚠️ ר' ההערה בראש המנוע
  if (def.firstWeek && def.firstWeek > gardenWeekKey_(meta.date)) return false;

  var months = gardenParseMonths_(def.months);
  if (months && !months[meta.month]) return false;

  if (def.freq === 'שבועי') return true;
  if (def.freq === 'דו-שבועי') {
    var a = gardenWeekMeta_(def.firstWeek);
    if (!a) return meta.n === 1 || meta.n === 3;   // בלי עוגן: שבועות 1 ו-3
    var days = Math.round((meta.date.getTime() - a.date.getTime()) / 86400000);
    return days % 14 === 0;
  }
  // חודשי ושנתי — שניהם נופלים על שבוע קבוע בחודש. ההבדל ביניהם הוא
  // 'חודשים פעילים', שכבר סונן למעלה: לשנתי יש שם חודש אחד.
  return meta.n === Math.min(Math.max(def.weekOfMonth, 1), 4);
}

/** האזורים שמקבלים עבודה במופע הזה. סבב = אזור אחד, לפי התור.
 * ----------------------------------------------------------------------------
 * ⚠️ הסבב מפתח לפי **השבוע בחודש**, לא לפי מונה מופעים (תוקן 8.9 אחרי
 * שקראתי את תוכנית העבודה של יועד). התוכנית שלו כתובה בדיוק ככה:
 *   "גיזום עצים · מרץ/יוני/ספטמבר/דצמבר · שבוע 1 צפונית; 2 מרכזית צפונית;
 *    3 מרכזית דרומית; 4 דרומית"
 * כלומר: המשימה רצה כל שבוע בחודשים האלה, והאזור נקבע מהשבוע בחודש.
 * מונה מופעים היה נותן אזור אחד לכל *חודש* — מה שהופך משימה של ארבעה
 * שבועות למשימה אחת, ומשאיר שלושה אזורים בלי טיפול.
 * זה גם פשוט יותר לזכור בשטח: "בשבוע הראשון של החודש אני בצפון".
 * לתדירות שאינה שבועית אין "שבוע בחודש" משמעותי, ושם נשאר מונה המופעים.
 */
function gardenPlanAreas_(def, meta, allAreas) {
  /* ⚠️ עמודת "אזורים" ריקה = **משימה כללית אחת**, לא "כל האזורים".
     קודם היא נפלה חזרה לרשימת כל האזורים, ולכן "גיזום דקלים" — שורה אחת
     בתוכנית, פעם בשנה — הייתה מתפוצצת ל-12 משימות נפרדות באותו שבוע, וגם
     המכנה של "עמידה בתוכנית" היה גדל פי 12 בלי שאיש ביקש. מי שרוצה משימה
     לכל אזור מפרט את האזורים; זו גם הצורה היחידה שבה סבב אזורים אפשרי. */
  var list = def.areas.length ? def.areas : [];
  if (!list.length) return [''];                   // בלי אזורים — משימה אחת כללית
  if (!def.rotate) return list;
  var i = (def.freq === 'שבועי') ? (meta.n - 1) : gardenOccIndex_(def, meta);
  return [list[((i % list.length) + list.length) % list.length]];
}

/** מה *אמור* לקרות בשבוע נתון — מחושב מההגדרות בלבד, בלי לגעת בגיליון.
 *  זה המכנה של "כמה מתוכנית העבודה בוצע", והוא זמין גם לשבוע שלא מומש. */
function gardenPlanForWeek_(ss, weekKey, defs, allAreas) {
  var meta = gardenWeekMeta_(weekKey);
  if (!meta) return [];
  var list = defs || gardenPlanRows_(ss);
  var areas = allAreas || gardenLists_(ss).areas;
  var out = [];
  list.forEach(function (def) {
    if (!gardenPlanApplies_(def, meta)) return;
    gardenPlanAreas_(def, meta, areas).forEach(function (area) {
      out.push({ def: def, area: area });
    });
  });
  return out;
}

/** מימוש: יוצר בטאב המשימות את מה שחסר לשבוע הזה. אידמפוטנטי — מפתח
 *  הזהות הוא (מזהה תבנית, שבוע, אזור), ולכן קריאה חוזרת לא מכפילה כלום.
 *  אינו נוגע בשבועות שעברו (ר' ההערה בראש המנוע). מחזיר כמה נוצרו. */
function gardenMaterializeWeek_(ss, weekKey) {
  if (weekKey < gardenWeekKey_()) return 0;        // אין מימוש אחורה
  var meta = gardenWeekMeta_(weekKey);
  if (!meta || meta.n === 5) return 0;

  var defs = gardenPlanRows_(ss);
  if (!defs.length) return 0;
  var want = gardenPlanForWeek_(ss, weekKey, defs);
  if (!want.length) return 0;

  var sh = gardenEnsureSheet_(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_HEADERS);
  var c = gardenCols_(sh);
  var v = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [];
  var seen = {};
  for (var r = 1; r < v.length; r++) {
    var tpl = gardenCell_(v[r][c['מזהה תבנית']]);
    if (!tpl) continue;
    seen[tpl + '|' + gardenCell_(v[r][c['שבוע']]) + '|' + gardenCell_(v[r][c['אזור']])] = 1;
  }

  var now = new Date();
  /* ⚠️ אין gardenBudgetYear_ במערכת. הדפוס הקיים בכל שאר הקוד הוא קריאה
     ישירה מההגדרות (ר' gardenCreateTask_), וזה מה שנעשה כאן. שם פונקציה
     שאינו קיים היה נופל ב-ReferenceError בזמן ריצה ולא בבדיקת התחביר. */
  var year = readSettings_(ss)['שנה נוכחית'] || '';
  var nextId = nextGardenId_(sh, 'מזהה');
  var add = [];
  want.forEach(function (w) {
    if (seen[w.def.id + '|' + weekKey + '|' + w.area]) return;
    var row = new Array(sh.getLastColumn()).fill('');
    function set(k, val) { if (c[k] !== undefined) row[c[k]] = val; }
    set('מזהה', nextId++);
    set('סוג', GARDEN_KIND_ROUTINE);
    set('כותרת', w.def.title);
    set('קטגוריה', w.def.category);
    set('אזור', w.area);
    /* ⚠️ בלי זה אי אפשר לחשב זמן טיפול, ואי אפשר להשלים רטרואקטיבית.
       זה הנתון שכמעט איבדנו פעם אחת כבר. */
    set('נוצר בתאריך', now);
    set('שלב', 'מתוכננת');
    set('מזהה תבנית', w.def.id);
    set('שבוע', weekKey);
    /* "שבוע מקורי" נכתב כבר עכשיו ולא רק בגרירה הראשונה: הוא המכנה של
       "בוצע בשבוע שלו", והוא חייב לשקף את מה שהתוכנית ביקשה. */
    set('שבוע מקורי', weekKey);
    set('מונה גרירות', 0);
    set('עודכן בתאריך', now);
    set('עודכן על ידי', 'תוכנית העבודה');
    if (year) set('שנת תקציב', year);
    add.push(row);
  });
  if (!add.length) return 0;
  sh.getRange(sh.getLastRow() + 1, 1, add.length, add[0].length).setValues(add);
  return add.length;
}

/* ---------- תוכנית העבודה: קריאה (doGet) ---------- */
function handleGardenPlan_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_GARDEN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    /* ⚠️ מידור, לא הסתרה: התוכנית היא סמכות המנהל. אחראי הגינון החיצוני
       לא רואה אותה — וזה נבדק כאן בשרת, לא רק בתפריט הניווט בלקוח. */
    if ((gate.perm || {}).isExternal) {
      return json_({ ok: false, error: 'תוכנית העבודה היא בסמכות מנהל הגינון' });
    }
    var lists = gardenLists_(ss);
    return json_({
      ok: true,
      defs: gardenPlanRows_(ss),
      freqs: GARDEN_FREQS,
      areas: lists.areas,
      categories: lists.categories
    });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ---------- תוכנית העבודה: כתיבה (doPost) ---------- */
function gardenPlanSave_(ss, body) {
  var perm = body._perm || {};
  if (perm.isExternal) return { ok: false, error: 'תוכנית העבודה היא בסמכות מנהל הגינון' };

  var title = String(body.title || '').trim();
  if (!title) return { ok: false, error: 'צריך שם למשימה' };
  var freq = String(body.freq || '').trim();
  if (GARDEN_FREQS.indexOf(freq) === -1) return { ok: false, error: 'תדירות לא מוכרת' };
  if (freq === 'דו-שבועי' && !String(body.firstWeek || '').match(/^\d{4}-\d{2}-\d{2}$/)) {
    /* בלי עוגן אי אפשר לדעת על איזה משני השבועות המחזור נופל. אפשר היה
       לבחור ברירת מחדל בשקט, אבל אז השבוע היה נקבע במקרה — ויועד היה
       מגלה את זה רק כשהצוות מגיע בשבוע הלא נכון. */
    return { ok: false, error: 'למחזור דו-שבועי צריך לבחור את השבוע הראשון' };
  }

  var sh = gardenEnsureSheet_(ss, GARDEN_ROUTINE_SHEET, GARDEN_ROUTINE_HEADERS);
  var c = gardenCols_(sh);
  var vals = {
    'שם משימה':      title,
    'קטגוריה':       String(body.category || '').trim(),
    'אזורים':        (body.areas || []).join(', '),
    'תדירות':        freq,
    'שבוע ראשון':    String(body.firstWeek || '').trim(),
    'שבוע בחודש':    Math.min(Math.max(parseInt(body.weekOfMonth, 10) || 1, 1), 4),
    'חודשים פעילים': String(body.months || '').trim(),
    'סבב אזורים':    body.rotate ? 'כן' : '',
    'סעיף בתוכנית':  String(body.clause || '').trim(),
    'פעיל':          body.active === false ? 'לא' : 'כן',
    'הערות':         String(body.note || '').trim().substring(0, 500)
  };

  var id = String(body.id || '').trim();
  if (id) {
    var found = gardenPlanFindRow_(sh, id);
    if (!found) return { ok: false, error: 'המשימה לא נמצאה בתוכנית' };
    Object.keys(vals).forEach(function (k) {
      if (c[k] !== undefined) sh.getRange(found, c[k] + 1).setValue(vals[k]);
    });
    return { ok: true, id: id };
  }
  var row = new Array(sh.getLastColumn()).fill('');
  var newId = 'T' + nextGardenId_(sh, 'מזהה');
  row[c['מזהה']] = newId;
  Object.keys(vals).forEach(function (k) { if (c[k] !== undefined) row[c[k]] = vals[k]; });
  sh.appendRow(row);
  return { ok: true, id: newId };
}

function gardenPlanSetActive_(ss, body) {
  var perm = body._perm || {};
  if (perm.isExternal) return { ok: false, error: 'תוכנית העבודה היא בסמכות מנהל הגינון' };
  var sh = ss.getSheetByName(GARDEN_ROUTINE_SHEET);
  if (!sh) return { ok: false, error: 'טאב השגרה לא קיים' };
  var found = gardenPlanFindRow_(sh, String(body.id || '').trim());
  if (!found) return { ok: false, error: 'המשימה לא נמצאה בתוכנית' };
  var c = gardenCols_(sh);
  if (c['פעיל'] === undefined) return { ok: false, error: 'אין עמודת "פעיל"' };
  sh.getRange(found, c['פעיל'] + 1).setValue(body.active ? 'כן' : 'לא');
  return { ok: true };
}

/* ============================================================================
 *  תוכנית העבודה — ברירת המחדל (2026-09-08)
 * ----------------------------------------------------------------------------
 *  תרגום ישיר של סעיפים 23.2–23.4 במסמך שיועד מסר, כדי שלא יצטרך להזין ידנית.
 *  ארבע החלטות תרגום שכדאי להכיר, כי הן לא חד-חד-ערכיות:
 *
 *  1. **"מחזור צפוני / מחזור דרומי" = שתי הגדרות, לא אחת.** שתיהן דו-שבועיות,
 *     והעוגן שלהן מוסט בשבוע — כך הצפון נופל בשבועות האי-זוגיים והדרום
 *     בזוגיים, וכל שבוע יש עבודה באחד מהם. זה מה ש"מחזור" אומר בפועל.
 *  2. **"שבוע 1 צפונית; 2 מרכזית צפונית; …" = תדירות שבועית + סבב אזורים.**
 *     לא חודשית: המשימה רצה כל שבוע בחודשים הפעילים, והאזור נגזר מהשבוע
 *     בחודש (ר' gardenPlanAreas_). סדר האזורים ברשימה **הוא** סדר הסבב.
 *  3. **בדיקת ההשקיה מפוצלת לשתיים** — קיץ ("אפריל-אוקטובר: כל שבועיים")
 *     וחורף ("נובמבר-מרץ: חודשי"). תדירות אחת לא יכולה להחזיק את שתיהן.
 *  4. **סעיף 23.5 (לוח השנה החודשי) אינו נזרע.** הוא *תוצאה* של ההגדרות
 *     האלה ולא קלט — המנוע מייצר אותו. אם הוא יוצא שונה מהטבלה במסמך, זה
 *     סימן שאחת ההגדרות כאן לא מדויקת, וזו בדיוק הבדיקה שכדאי לעשות.
 *
 *  העוגן: הראשון בינואר 2026 מיושר ליום ראשון. שינוי שלו מזיז את כל המחזורים.
 * ========================================================================== */
var GARDEN_PLAN_ANCHOR_A = '2026-01-04';   // מחזור צפוני — שבוע ראשון
var GARDEN_PLAN_ANCHOR_B = '2026-01-11';   // מחזור דרומי — שבוע אחריו

var GARDEN_PLAN_SEED = [
  // שם, קטגוריה, אזורים, תדירות, שבוע ראשון, שבוע בחודש, חודשים, סבב
  ['כיסוח דשא', 'מדשאות', 'שכונה צפונית, שכונה מרכזית צפונית',
   'דו-שבועי', GARDEN_PLAN_ANCHOR_A, 1, '', false],
  ['כיסוח דשא', 'מדשאות', 'שכונה מרכזית דרומית, שכונה דרומית',
   'דו-שבועי', GARDEN_PLAN_ANCHOR_B, 1, '', false],
  ['חרמש', 'עשבייה / קרקע', 'שכונה צפונית, שכונה מרכזית צפונית',
   'דו-שבועי', GARDEN_PLAN_ANCHOR_A, 1, '', false],
  ['חרמש', 'עשבייה / קרקע', 'שכונה מרכזית דרומית, שכונה דרומית',
   'דו-שבועי', GARDEN_PLAN_ANCHOR_B, 1, '', false],
  // קיץ: נצמד למחזורים. חורף: אזור אחד בשבוע, בסבב.
  ['בדיקת מערכת השקיה וטיפול באזורים צהובים', 'השקיה / ממטרות',
   'שכונה צפונית, שכונה מרכזית צפונית', 'דו-שבועי', GARDEN_PLAN_ANCHOR_A, 1, '4-10', false],
  ['בדיקת מערכת השקיה וטיפול באזורים צהובים', 'השקיה / ממטרות',
   'שכונה מרכזית דרומית, שכונה דרומית', 'דו-שבועי', GARDEN_PLAN_ANCHOR_B, 1, '4-10', false],
  ['בדיקת מערכת השקיה וטיפול באזורים צהובים', 'השקיה / ממטרות',
   'שכונה צפונית, שכונה מרכזית צפונית, שכונה מרכזית דרומית, שכונה דרומית',
   'שבועי', '', 1, '11-3', true],
  ['ניקיון שבילים', 'ניקיון גינון / גזם',
   'שכונה צפונית, שכונה מרכזית צפונית, שכונה מרכזית דרומית, שכונה דרומית',
   'שבועי', '', 1, '', false],
  ['גיזום עצים', 'עצים',
   'שכונה צפונית, שכונה מרכזית צפונית, שכונה מרכזית דרומית, שכונה דרומית',
   'שבועי', '', 1, '3,6,9,12', true],
  ['טיפול בחניות', 'ניקיון גינון / גזם',
   'שכונה צפונית, שכונה מרכזית צפונית, שכונה מרכזית דרומית, שכונה דרומית',
   'שבועי', '', 1, '2,7,11', true],

  // ---- 23.3 מתחמים וצירים ----
  ['תחזוקת פארק משחקים', 'ניקיון גינון / גזם', 'פארק משחקים', 'חודשי', '', 1, '', false],
  ['תחזוקת ציר מזרחי',   'ניקיון גינון / גזם', 'ציר מזרחי',   'חודשי', '', 2, '', false],
  ['תחזוקת ציר מערבי',   'ניקיון גינון / גזם', 'ציר מערבי',   'חודשי', '', 3, '', false],
  ['תחזוקת גני ילדים',    'ניקיון גינון / גזם', 'גני ילדים',    'חודשי', '', 3, '2,5,8,11', false],
  ['תחזוקת מועדון ילדים', 'ניקיון גינון / גזם', 'מועדון ילדים', 'חודשי', '', 3, '2,4,6,8,10,12', false],
  ['תחזוקת גינת כלבים',   'ניקיון גינון / גזם', 'גינת כלבים',   'חודשי', '', 2, '1,4,7,10', false],
  ['תחזוקת מועדון משפחות','ניקיון גינון / גזם', 'מועדון משפחות','חודשי', '', 4, '1,3,5,7,9,11', false],

  // ---- 23.4 עונתיות ----
  ['שתילות אביב', 'ערוגות / שתילות', '', 'שנתי', '', 1, '4', false],
  ['שתילות סתיו', 'ערוגות / שתילות', '', 'שנתי', '', 1, '9', false],
  ['גיזום דקלים', 'עצים',            '', 'שנתי', '', 1, '9', false]
];

/** זריעת תוכנית העבודה. בטוח להרצה חוזרת: מדלג על שורה ששמה+אזוריה כבר
 *  קיימים, ולכן לא מכפיל ולא דורס עריכות שיועד עשה. */
function seedGardenPlan() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureGardenSheets_(ss);
  var sh = gardenEnsureSheet_(ss, GARDEN_ROUTINE_SHEET, GARDEN_ROUTINE_HEADERS);
  var c = gardenCols_(sh);

  var have = {};
  if (sh.getLastRow() > 1) {
    var v = sh.getDataRange().getValues();
    for (var r = 1; r < v.length; r++) {
      have[String(v[r][c['שם משימה']]).trim() + '|' + String(v[r][c['אזורים']]).trim()] = 1;
    }
  }

  var wide = sh.getLastColumn();
  var next = nextGardenId_(sh, 'מזהה');
  var add = [];
  GARDEN_PLAN_SEED.forEach(function (p) {
    if (have[p[0] + '|' + p[2]]) return;
    var row = new Array(wide).fill('');
    function set(k, val) { if (c[k] !== undefined) row[c[k]] = val; }
    set('מזהה', 'T' + (next++));
    set('שם משימה', p[0]);
    set('קטגוריה', p[1]);
    set('אזורים', p[2]);
    set('תדירות', p[3]);
    set('שבוע ראשון', p[4]);
    set('שבוע בחודש', p[5]);
    set('חודשים פעילים', p[6]);
    set('סבב אזורים', p[7] ? 'כן' : '');
    set('פעיל', 'כן');
    add.push(row);
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, wide).setValues(add);

  SpreadsheetApp.getUi && SpreadsheetApp.getActive().toast(
    add.length ? ('נוספו ' + add.length + ' משימות שגרה') : 'התוכנית כבר מלאה — לא נוסף כלום',
    'תוכנית העבודה', 8);
  Logger.log('seedGardenPlan: added %s of %s', add.length, GARDEN_PLAN_SEED.length);
  return add.length;
}

/** מחיקה מהתוכנית (בקשת יועד 8.9 — כיבוי לבדו לא הספיק).
 * ⚠️ המשימות שכבר נוצרו מההגדרה **אינן נמחקות**, ובכוונה: הן היסטוריה, הן
 * מופיעות בארכיון של השבוע שלהן, וחלקן כבר אושרו. הן ימשיכו להחזיק
 * "מזהה תבנית" שמצביע לשורה שאיננה — וזה בסדר, כי הוא משמש רק לקיבוץ
 * אישור מרוכז ולמניעת כפילות במימוש, ושניהם עובדים על מחרוזת ולא על קשר.
 * מה שכן מפסיק: ייצור מופעים חדשים. זה בדיוק ההבדל מכיבוי — כיבוי משאיר
 * את השורה כדי שאפשר יהיה להחזיר אותה, מחיקה אומרת "זה כבר לא בתוכנית".
 */
function gardenPlanDelete_(ss, body) {
  var perm = body._perm || {};
  if (perm.isExternal) return { ok: false, error: 'תוכנית העבודה היא בסמכות מנהל הגינון' };
  var sh = ss.getSheetByName(GARDEN_ROUTINE_SHEET);
  if (!sh) return { ok: false, error: 'טאב השגרה לא קיים' };
  var id = String(body.id || '').trim();
  var row = gardenPlanFindRow_(sh, id);
  if (!row) return { ok: false, error: 'המשימה לא נמצאה בתוכנית' };

  /* כמה משימות כבר נולדו ממנה — מוחזר ללקוח כדי שההודעה אחרי המחיקה תגיד
     את האמת ("3 משימות שכבר נוצרו נשארות") ולא הבטחה כללית. */
  var made = 0;
  try {
    var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    if (tsh && tsh.getLastRow() > 1) {
      var tc = gardenCols_(tsh);
      var tv = tsh.getRange(2, tc['מזהה תבנית'] + 1, tsh.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < tv.length; i++) if (String(tv[i][0]).trim() === id) made++;
    }
  } catch (e) { /* ספירה בלבד — לא מעכבת מחיקה */ }

  sh.deleteRow(row);
  return { ok: true, made: made };
}

function gardenPlanFindRow_(sh, id) {
  if (!id) return 0;
  var c = gardenCols_(sh);
  var n = sh.getLastRow() - 1;
  if (n < 1) return 0;
  var ids = sh.getRange(2, c['מזהה'] + 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === id) return i + 2;
  }
  return 0;
}

/* האם תוכנית העבודה כבר מכסה את הדיווח הזה, ומתי.
 * ----------------------------------------------------------------------------
 * זו התשובה השלישית בתיבה הנכנסת, וזו שנפתחה רק ברגע שיש תוכנית: "הדשא
 * גבוה" לא צריך משימה חדשה אם כיסוח מתוכנן ליום שלישי. בלי זה המנהל פותח
 * עבודה כפולה למשהו שכבר מתוזמן.
 * המפתח הוא **קטגוריה + אזור**, ולא הכותרת: הכותרת היא מה שהתושב הקליד.
 * מסתכלים ארבעה שבועות קדימה בלבד — "מתוכנן בעוד חודשיים" אינה תשובה
 * לתושב שמחכה, ושם התשובה הנכונה היא שיבוץ אמיתי. */
function gardenPlanCovers_(ss, task, defs, allAreas) {
  if (!defs || !defs.length || !task.category) return null;
  var wk = gardenWeekKey_();
  for (var i = 0; i < 4; i++) {
    var meta = gardenWeekMeta_(wk);
    if (meta && meta.n !== 5) {
      for (var d = 0; d < defs.length; d++) {
        var def = defs[d];
        if (def.category !== task.category) continue;
        if (!gardenPlanApplies_(def, meta)) continue;
        var areas = gardenPlanAreas_(def, meta, allAreas);
        // אזור ריק בדיווח = לא ידוע איפה, ואז אי אפשר להבטיח שהסבב יגיע לשם.
        if (task.area && areas.indexOf(task.area) === -1) continue;
        if (!task.area && def.rotate) continue;
        return { defId: def.id, title: def.title, week: wk };
      }
    }
    wk = gardenShiftWeek_(wk, 1);
  }
  return null;
}

function gardenShiftWeek_(weekKey, n) {
  var m = gardenWeekMeta_(weekKey);
  if (!m) return weekKey;
  var d = new Date(m.date.getTime());
  d.setDate(d.getDate() + n * 7);
  return gardenWeekKey_(d);
}

/* "כבר בתוכנית" — מממש את השבוע, מוצא את משימת השגרה שמכסה, ומאחד לתוכה.
   האיחוד הוא המנגנון הקיים (gardenMerge_): הדיווח נסגר כ"אוחד", התושב
   נשאר קשור למשימה שתטפל בו, והוא יקבל את הודעת הסיום כשהיא תסגר. */
function gardenCoverByPlan_(ss, body) {
  var perm = body._perm || {};
  /* "כבר בתוכנית" **אינו** חסום לגנן (8.9) — הוא נופל תחת אותו שיפוט שטח
     כמו איחוד, והוא בעצם איחוד אל תוך משימת שגרה. */
  var week = String(body.week || '').match(/^\d{4}-\d{2}-\d{2}$/) ? body.week : '';
  var defId = String(body.defId || '').trim();
  if (!week || !defId) return { ok: false, error: 'חסרים פרטי התוכנית' };

  gardenMaterializeWeek_(ss, week);

  var sh = ss.getSheetByName(GARDEN_TASKS_SHEET);
  if (!sh) return { ok: false, error: 'טאב המשימות לא קיים' };
  var c = gardenCols_(sh);
  var v = sh.getDataRange().getValues();

  var src = null;
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][c['מזהה']]).trim() === String(body.id).trim()) { src = gardenTaskObj_(v[r], c); break; }
  }
  if (!src) return { ok: false, error: 'הדיווח לא נמצא' };

  /* מחפשים את המופע שמתאים לאזור של הדיווח. אם התוכנית מייצרת שורה לכל
     אזור, יש כמה מועמדים — ורק זה שבאזור הנכון באמת יטפל בו. */
  var target = null, fallback = null;
  for (var r2 = 1; r2 < v.length; r2++) {
    if (String(v[r2][c['מזהה תבנית']]).trim() !== defId) continue;
    if (String(v[r2][c['שבוע']]).trim() !== week) continue;
    if (gardenCell_(v[r2][c['סגירה']])) continue;
    var o = gardenTaskObj_(v[r2], c);
    if (!fallback) fallback = o;
    if (!src.area || o.area === src.area) { target = o; break; }
  }
  target = target || fallback;
  if (!target) return { ok: false, error: 'לא נמצאה משימת שגרה מתאימה בשבוע הזה' };

  /* מעבירים גם _email: gardenMerge_ נופל עליו כשאין שם פרטי/משפחה בהרשאה,
     ובלעדיו שורת היומן הייתה נרשמת בלי מבצע — בדיוק בפעולה שכל הערך שלה
     הוא שיהיה אפשר לשחזר מי החליט. */
  return gardenMerge_(ss, { id: src.id, into: target.id,
                            _perm: perm, _email: body._email });
}

/* ============================================================================
 *  מסך הנתונים — החישוב (2026-09-08)
 * ----------------------------------------------------------------------------
 *  ארבע החלטות שנסגרו באודיט ומכתיבות את כל מה שכאן:
 *
 *  1. **"מצב כללי" = אחוז מתוכנית העבודה שבוצע בשבוע שלו.** לא ציון מומצא.
 *     המונה: משימת שגרה שנסגרה "בוצע", בשבוע שאליו שובצה, בלי גרירות.
 *     המכנה: מה שהתוכנית ביקשה לאותו שבוע — מחושב מההגדרות, ולכן זמין גם
 *     לשבוע שאיש לא פתח (ר' gardenPlanForWeek_). שבוע שאיש לא עבד לפיו
 *     נותן 0% וזו האמת, לא חור בנתונים.
 *  2. **חציון, לא ממוצע.** ב-12 משימות בשבוע משימה אחת תקועה 40 יום מזיזה
 *     ממוצע לגמרי. החציון אומר אם המערכת בריאה; "שלוש הכי תקועות" אומרות
 *     במה לטפל. שניהם יחד, אף אחד לבד.
 *  3. **זמן הטיפול מפורק לשלושה מקטעים** ולא מספר אחד: מהדיווח עד השיבוץ,
 *     מהשיבוץ עד סימון הביצוע, ומהביצוע עד האישור. מספר אחד מסתיר את הדבר
 *     היחיד שמעניין — **מי מעכב**. הנתונים כבר ביומן מהיום הראשון.
 *  4. ⚠️ **אחראי הגינון אינו רואה ציון.** F-13 הוריד את הציון 0–100 בכוונה,
 *     ומסך שאומר לאביתר "58%" מחזיר אותו בדלת האחורית. הוא רואה מה עשה;
 *     החתך מול התוכנית והמשוב הם למנהל בלבד. הסינון כאן בשרת, לא בתצוגה.
 * ========================================================================== */

/** כמה שבועות אחורה. 8 הוא איזון: מספיק למגמה, קצר מספיק שהחישוב יישאר זול. */
var GARDEN_STATS_WEEKS = 8;

function handleGardenStats_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_GARDEN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var perm = gate.perm || {};
    var isMgr = !perm.isExternal;

    var weeks = Math.min(Math.max(parseInt(p.weeks, 10) || GARDEN_STATS_WEEKS, 2), 26);
    var thisWeek = gardenWeekKey_();
    var keys = [];
    for (var i = weeks - 1; i >= 0; i--) keys.push(gardenShiftWeek_(thisWeek, -i));
    var inWindow = {};
    keys.forEach(function (k) { inWindow[k] = true; });

    // ---------- קריאה אחת לכל טאב ----------
    var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    var tasks = [];
    if (tsh && tsh.getLastRow() > 1) {
      var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
      for (var r = 1; r < tv.length; r++) {
        if (!gardenCell_(tv[r][tc['מזהה']])) continue;
        tasks.push(gardenTaskObj_(tv[r], tc));
      }
    }

    var lists = gardenLists_(ss);
    var defs = gardenPlanRows_(ss);

    // ---------- 1. עמידה בתוכנית, שבוע-שבוע ----------
    /* נחשב תמיד (גם לאביתר) כי הוא המקור גם למספרים שכן מותר לו — אבל
       מוחזר ללקוח רק למנהל. ר' ההחלטה 4 בראש הקובץ. */
    /* perDef — אותה ספירה בדיוק, אבל לפי **סעיף בתוכנית** ולא לפי שבוע.
       האחוז השבועי אומר "כמה מהתוכנית קרה"; הוא לא אומר *מה* לא קרה, וזו
       השאלה היחידה שאפשר לעשות איתה משהו: סעיף שנופל שוב ושוב הוא או
       תוכנית לא ריאלית או חסם בשטח, ובשני המקרים המנהל צריך לגעת בסעיף.
       ⚠️ השבוע הנוכחי לא נספר כאן, בדיוק כמו ב-overall — הוא עדיין רץ. */
    var perDef = {};
    var byWeek = keys.map(function (k) {
      var want = gardenPlanForWeek_(ss, k, defs, lists.areas);
      var planned = want.length;
      var counts = (k !== thisWeek);
      if (counts) want.forEach(function (w) {
        var e = perDef[w.def.id];
        if (!e) e = perDef[w.def.id] = { id: w.def.id, title: w.def.title,
                                         clause: w.def.clause || '', want: 0, got: 0 };
        e.want++;
      });
      var onTime = 0, done = 0;
      tasks.forEach(function (t) {
        if (t.kind !== GARDEN_KIND_ROUTINE) return;
        if ((t.firstWeek || t.week) !== k) return;
        if (t.closure !== 'בוצע') return;
        done++;
        if (!t.drags && t.week === k) onTime++;
        if (counts && t.templateId && perDef[t.templateId]) perDef[t.templateId].got++;
      });
      return { week: k, planned: planned, done: done, onTime: onTime,
               pct: planned ? Math.round((onTime / planned) * 100) : null };
    });
    /* סף של 2 מופעים: סעיף שהיה אמור לקרות פעם אחת ולא קרה הוא אירוע, לא
       דפוס, ולהציג אותו כ"הכי נופל" זה לייצר אזעקה מרעש. */
    var falling = Object.keys(perDef).map(function (x) { return perDef[x]; })
      .filter(function (e) { return e.want >= 2 && e.got < e.want; })
      .sort(function (a, b) {
        return (b.want - b.got) - (a.want - a.got) ||
               (a.got / a.want) - (b.got / b.want);
      })[0] || null;
    /* "מצב כללי" מחושב על החלון כולו ולא כממוצע-של-אחוזים: שבוע עם משימה
       אחת ושבוע עם עשרים אינם שווי משקל, וממוצע אחוזים היה נותן להם משקל זהה.
       ⚠️ **והשבוע הנוכחי אינו נספר.** הוא עדיין רץ, ולכן הוא תמיד חלקי —
       הכללתו הייתה גוררת את המספר למטה כל שבוע מחדש בלי שקרה שום דבר,
       והמנהל היה לומד להתעלם ממנו. הוא כן מצויר בגרף, מסומן כחלקי. */
    var totPlanned = 0, totOnTime = 0, closedWeeks = 0;
    byWeek.forEach(function (w) {
      if (w.week === thisWeek) return;
      totPlanned += w.planned; totOnTime += w.onTime;
      if (w.planned) closedWeeks++;
    });
    var overall = totPlanned ? Math.round((totOnTime / totPlanned) * 100) : null;

    // ---------- 2. קו הזמן של כל משימה, מהיומן ----------
    var stamps = {};   // מזהה -> { נפתח, שיבוץ, ביצוע, סגירה }
    var lsh = ss.getSheetByName(GARDEN_LOG_SHEET);
    if (lsh && lsh.getLastRow() > 1) {
      var lc = gardenCols_(lsh), lv = lsh.getDataRange().getValues();
      for (var q = 1; q < lv.length; q++) {
        var id = String(lv[q][lc['מזהה משימה']]).trim();
        if (!id) continue;
        var kind = String(lv[q][lc['סוג רשומה']]).trim();
        var ts = lv[q][lc['חותמת זמן']];
        if (!(ts instanceof Date)) continue;
        if (!stamps[id]) stamps[id] = {};
        /* **הראשון מנצח.** משימה שהוחזרה להשלמה מקבלת "ביצוע" שני, ולקחת
           את האחרון היה מודד את הסבב האחרון במקום את זמן הטיפול האמיתי. */
        if (!stamps[id][kind]) stamps[id][kind] = ts.getTime();
      }
    }

    var segs = { toPlan: [], toDo: [], toApprove: [], total: [] };
    var stuck = [];
    tasks.forEach(function (t) {
      var s = stamps[t.id];
      if (!s) return;
      var born = s['נפתח'] || (t.createdAt instanceof Date ? t.createdAt.getTime() : 0);
      var pushDays = function (arr, from, to) {
        if (!from || !to || to < from) return;
        arr.push((to - from) / 86400000);
      };
      pushDays(segs.toPlan,    born,          s['שיבוץ']);
      pushDays(segs.toDo,      s['שיבוץ'] || born, s['ביצוע']);
      pushDays(segs.toApprove, s['ביצוע'],    s['סגירה']);
      if (born && s['סגירה']) {
        var d = (s['סגירה'] - born) / 86400000;
        segs.total.push(d);
        stuck.push({ id: t.id, title: t.title, category: t.category, area: t.area,
                     kind: t.kind, days: Math.round(d) });
      } else if (born && !t.closure) {
        /* עדיין פתוחה — הוותק שלה הוא זמן הטיפול *עד עכשיו*, וזו בדיוק
           המשימה שמעניין לראות ברשימת התקועות. */
        stuck.push({ id: t.id, title: t.title, category: t.category, area: t.area,
                     kind: t.kind, open: true,
                     days: Math.round((Date.now() - born) / 86400000) });
      }
    });
    stuck.sort(function (a, b) { return b.days - a.days; });

    /* ---------- 2ב. קצב: נפתחו מול נסגרו, שבוע-שבוע ----------
       ⚠️ הנתון החשוב ביותר שלא היה כאן. מספר המשימות הפתוחות לבדו לא אומר
       אם מנצחים — הוא אותו מספר גם כשהכול תחת שליטה וגם כשהערימה גדלה
       בשתיים בשבוע. ההפרש הוא שאומר, והוא מתגלה חודשיים לפני שמרגישים.
       הפתיחה נלקחת מ'נפתח' ביומן ולא מ'נוצר בתאריך': משימות שנוצרו לפני
       שהעמודה הזאת נולדה (7.9) אין להן ערך, וליומן כן יש. */
    var flow = keys.map(function (k) { return { week: k, opened: 0, closed: 0 }; });
    var flowIx = {};
    keys.forEach(function (k, i) { flowIx[k] = i; });
    Object.keys(stamps).forEach(function (id) {
      var o = stamps[id]['נפתח'];
      if (o) {
        var wo = flowIx[gardenWeekKey_(new Date(o))];
        if (wo !== undefined) flow[wo].opened++;
      }
      var c2 = stamps[id]['סגירה'];
      if (c2) {
        var wc = flowIx[gardenWeekKey_(new Date(c2))];
        if (wc !== undefined) flow[wc].closed++;
      }
    });
    flow.forEach(function (f) { f.net = f.opened - f.closed; });

    /* ---------- 2ג. תמהיל: כמה מהעבודה מתוכננת וכמה תגובה ----------
       אם רוב העבודה היא דיווחי תושבים, התוכנית לא מכסה את מה שקורה בשטח —
       וזו מסקנה שמשנה את התוכנית, לא את קצב העבודה. */
    var mix = { routine: 0, report: 0, manual: 0 };
    tasks.forEach(function (t) {
      if (!inWindow[t.week] && !inWindow[t.firstWeek]) return;
      if (t.kind === GARDEN_KIND_ROUTINE) mix.routine++;
      else if (t.kind === GARDEN_KIND_REPORT) mix.report++;
      else mix.manual++;
    });

    // ---------- 3. מצב עכשיו ----------
    var now = { open: 0, waiting: 0, dragged: 0, attention: 0, blocked: 0, closedThisWeek: 0 };
    tasks.forEach(function (t) {
      if (t.closure) {
        if (t.week === thisWeek && t.closure === 'בוצע') now.closedThisWeek++;
        return;
      }
      now.open++;
      if (t.flag === 'ממתין לאישור') now.waiting++;
      if (t.drags) now.dragged++;
      if (t.flag === 'דורש בדיקה חוזרת' || t.flag === 'דורש בדיקה בשטח' ||
          t.flag === 'הוחזר להשלמה') now.attention++;
      /* חסימה נספרת לחוד. זה הדגל היחיד שבו **הצוות אומר לך משהו** ומחכה
         להחלטה שלך — הוא לא סוגר משימות, הוא מרים יד. אם הוא נבלע בתוך
         "דורש תשומת לב" הוא מגיע אליך רק כשמישהו מתלונן. */
      if (t.flag === 'דורש בדיקה בשטח') now.blocked++;
    });

    // ---------- 4. אזורים ----------
    /* מצב אזור נגזר משני דברים בלבד, ושניהם מדידים: כמה פתוח בו, וכמה מתוכו
       מסומן בדגל. אחוז עמידה פר-אזור היה נראה מדויק יותר ומטעה יותר — מספר
       המשימות באזור אחד בשבוע הוא לרוב חד-ספרתי, ואחוז על מדגם כזה קופץ
       בין 0 ל-100 בלי שקרה שום דבר אמיתי. */
    var areaMap = {};
    lists.areas.forEach(function (a) {
      areaMap[a] = { area: a, open: 0, attention: 0, dragged: 0, reports: 0, closed: 0 };
    });
    tasks.forEach(function (t) {
      var a = areaMap[t.area];
      if (!a) return;
      if (t.closure) { if (inWindow[t.week]) a.closed++; return; }
      a.open++;
      if (t.kind === GARDEN_KIND_REPORT) a.reports++;
      if (t.drags) a.dragged++;
      if (t.flag && t.flag !== 'ממתין לאישור') a.attention++;
    });
    var areas = lists.areas.map(function (a) {
      var x = areaMap[a];
      /* סולם מצב ולא גוון שרירותי לכל אזור: תקין / במעקב / בעיה. שלושה
         מצבים הם מה שאפשר לפעול לפיו — עשרה גוונים הם קישוט. */
      x.state = x.attention >= 2 ? 'בעיה'
              : (x.attention === 1 || x.dragged >= 2) ? 'במעקב' : 'תקין';
      return x;
    });

    // ---------- 5. איפה הכאב חוזר ----------
    var pain = {};
    tasks.forEach(function (t) {
      if (t.kind !== GARDEN_KIND_REPORT || !t.area || !t.category) return;
      var k = t.area + ' · ' + t.category;
      if (!pain[k]) pain[k] = { key: k, area: t.area, category: t.category, n: 0, merged: 0 };
      pain[k].n++;
      if (t.closure === GARDEN_CLOSURE_MERGED) pain[k].merged++;
    });
    var repeats = Object.keys(pain).map(function (k) { return pain[k]; })
      .filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);

    // ---------- 6. משוב תושבים ----------
    var fb = { yes: 0, no: 0 };
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    if (rsh && rsh.getLastRow() > 1) {
      var rc2 = gardenCols_(rsh), rv2 = rsh.getDataRange().getValues();
      for (var z = 1; z < rv2.length; z++) {
        var v = String(rv2[z][rc2['משוב']] || '').trim();
        if (v === 'חיובי' || v === 'כן') fb.yes++;
        else if (v === 'שלילי' || v === 'לא') fb.no++;
      }
    }

    var out = {
      ok: true, isManager: isMgr, weeks: weeks, thisWeek: thisWeek,
      now: now,
      timing: {
        toPlan: gardenStat_(segs.toPlan),
        toDo: gardenStat_(segs.toDo),
        toApprove: gardenStat_(segs.toApprove),
        total: gardenStat_(segs.total)
      },
      stuck: stuck.slice(0, 3)
    };
    /* ⚠️ הגבול של אביתר. הוא רואה מה עשה ומה פתוח אצלו — לא איך הוא נמדד
       מול התוכנית, לא את משוב התושבים, ולא את מפת "איפה הכאב חוזר". */
    if (isMgr) {
      out.overall = overall;
      out.overallWeeks = closedWeeks;   // כמה שבועות *שהסתיימו* עומדים מאחורי המספר
      out.byWeek = byWeek;
      out.falling = falling;
      out.flow = flow;
      out.mix = mix;
      out.areas = areas;
      out.repeats = repeats;
      out.feedback = fb;
      out.planSize = defs.filter(function (d) { return d.active; }).length;
    }
    return json_(out);
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/** חציון + הקצה העליון. מחזיר null כשאין מספיק נתונים — עדיף "אין עדיין"
 *  מאשר מספר שנשען על מדידה אחת. */
function gardenStat_(arr) {
  if (!arr || arr.length < 2) return { n: arr ? arr.length : 0, median: null, p90: null };
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  var med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return {
    n: s.length,
    median: Math.round(med * 10) / 10,
    p90: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] * 10) / 10
  };
}

/* ---------- יומן המשימה (doGet) — "תיעוד אחורה" ----------
   הטאב הזה נכתב מהיום הראשון ומעולם לא נקרא. הוא מחזיק את קו הזמן המלא של
   כל משימה — נפתח · שיבוץ · ביצוע · סגירה · החזרה · גרירה · חסימה · איחוד ·
   משוב — עם חותמת זמן ומבצע לכל מעבר. זה גם מה שעונה על "מי עשה מה ומתי",
   וגם הבסיס לחישוב זמני הטיפול בלוח הנתונים. */
function handleGardenTaskLog_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_GARDEN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var id = String(p.id || '').trim();
    if (!id) return json_({ ok: false, error: 'חסר מזהה משימה' });

    var sh = ss.getSheetByName(GARDEN_LOG_SHEET);
    if (!sh || sh.getLastRow() < 2) return json_({ ok: true, rows: [] });
    var c = gardenCols_(sh);
    var v = sh.getDataRange().getValues();
    var out = [];
    for (var r = 1; r < v.length; r++) {
      if (String(v[r][c['מזהה משימה']]).trim() !== id) continue;
      var ts = v[r][c['חותמת זמן']];
      out.push({
        at:   (ts instanceof Date) ? ts.toISOString() : String(ts || ''),
        kind: gardenCell_(v[r][c['סוג רשומה']]),
        field: gardenCell_(v[r][c['שדה']]),
        from: gardenCell_(v[r][c['מערך']]),
        to:   gardenCell_(v[r][c['לערך']]),
        who:  gardenCell_(v[r][c['מבצע']]),
        note: gardenCell_(v[r][c['הערה']])
      });
    }
    /* מיון בשרת ולא בלקוח: היומן הוא append-only ולכן *בדרך כלל* כרונולוגי,
       אבל שורה שנערכה ידנית בגיליון יכולה לשבור את זה, ותצוגת קו-זמן שיוצאת
       מהסדר קשה יותר לזהות כשגויה מאשר רשימה שממוינת תמיד. */
    out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    return json_({ ok: true, rows: out });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/** איתור שורת משימה לפי מזהה. מחזיר null אם לא נמצאה. */
function gardenFindTask_(sh, id) {
  var c = gardenCols_(sh);
  var n = sh.getLastRow() - 1;
  if (n < 1) return null;
  var ids = sh.getRange(2, c['מזהה'] + 1, n, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id).trim()) {
      return { row: i + 2, cols: c };
    }
  }
  return null;
}

/** כתיבת ערך לתא בשורת משימה + חותמת "עודכן". */
function gardenSet_(sh, row, cols, field, value) {
  if (cols[field] === undefined) return;
  sh.getRange(row, cols[field] + 1).setValue(value);
}

/** הדיווחים שנקשרו למשימה. משמש למייל "הושלם": דיווח אחד, או כמה אם אוחדו. */
function gardenReportsForTask_(ss, taskId) {
  var out = [];
  var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
  if (!rsh || rsh.getLastRow() < 2) return out;
  var rc = gardenCols_(rsh);
  var v = rsh.getDataRange().getValues();
  for (var r = 1; r < v.length; r++) {
    if (String(v[r][rc['מזהה משימה']] || '').trim() !== String(taskId).trim()) continue;
    out.push({
      id:       String(v[r][rc['מזהה']] || ''),
      familyId: String(v[r][rc['מזהה משפחה']] || ''),
      name:     String(v[r][rc['שם מדווח']] || ''),
      category: String(v[r][rc['קטגוריה']] || ''),
      place:    String(v[r][rc['מיקום מילולי']] || v[r][rc['אזור']] || ''),
      mergedInto: String(v[r][rc['אוחד לדיווח']] || '')
    });
  }
  return out;
}

/* סגירה בלי ביצוע — מייל לכל מי שדיווח. זו הייתה הפינה השקטה של המודול:
   התושב דיווח, המנהל סגר "לא רלוונטי", ואף אחד לא אמר לו כלום.
   ⚠️ ההסבר עצמו (why) הוא טקסט שהמנהל כתב, לא שם הסגירה. */
function gardenNotifyDeclined_(ss, taskId, closure, why) {
  try {
    var reps = gardenReportsForTask_(ss, taskId);
    for (var i = 0; i < reps.length; i++) {
      var rep = reps[i];
      if (!rep.familyId) continue;
      sendResidentTemplate_(ss, 'GARDEN_REPORT_DECLINED', emailsForFamilyId_(ss, rep.familyId), {
        'שם': rep.name || '',
        'מזהה': rep.id,
        'קטגוריה': rep.category || '',
        'מיקום': rep.place || '',
        'סיבה': String(why || '').trim()
      });
    }
  } catch (e) { /* מייל שנכשל לא מבטל סגירה שכבר נרשמה */ }
}

/** מייל "הטיפול הושלם" לכל מי שדיווח על המשימה. נשלח **רק** אחרי אישור מנהל
 *  ורק בסגירה "בוצע" — סגירה מסוג אחר יוצאת דרך gardenNotifyDeclined_. */
function gardenNotifyCompleted_(ss, taskId) {
  try {
    var reps = gardenReportsForTask_(ss, taskId);
    for (var i = 0; i < reps.length; i++) {
      var rep = reps[i];
      if (!rep.familyId) continue;
      sendResidentTemplate_(ss, 'GARDEN_COMPLETED', emailsForFamilyId_(ss, rep.familyId), {
        'שם': rep.name || '',
        'מזהה': rep.id,
        'קטגוריה': rep.category,
        'מיקום': rep.place || 'השיכון',
        'איחוד': rep.mergedInto
          ? 'הדיווח שלך אוחד עם פנייה מס\' ' + rep.mergedInto + '.\n\n' : ''
      });
    }
  } catch (e) { /* כשל מייל לא מבטל אישור שכבר נשמר */ }
}

/** סוגר משימה אחת בשורה נתונה. מרכז את כל מה שאישור/סגירה משנים, כדי
 *  שאישור בודד ואישור מרוכז לעולם לא ייפרדו בהתנהגות. */
function gardenCloseRow_(ss, sh, row, c, cur, closure, who, why) {
  gardenSet_(sh, row, c, 'שלב', 'הושלם');
  gardenSet_(sh, row, c, 'דגל', '');
  gardenSet_(sh, row, c, 'סגירה', closure);
  gardenSet_(sh, row, c, 'אושר על ידי', who);
  gardenSet_(sh, row, c, 'תאריך אישור', new Date());
  gardenSet_(sh, row, c, 'עודכן בתאריך', new Date());
  gardenSet_(sh, row, c, 'עודכן על ידי', who);
  gardenLog_(ss, cur.id, 'סגירה', 'סגירה', cur.closure, closure, who,
             String(why || '').trim());
  if (closure === 'בוצע') { gardenNotifyCompleted_(ss, cur.id); return; }
  /* "אוחד" יוצא דרך gardenMerge_, ולתושב כבר נשלח GARDEN_REPORT_MERGED —
     שליחה נוספת כאן הייתה אומרת לו גם "אוחד" וגם "לא ייפתח טיפול". */
  if (closure === GARDEN_CLOSURE_MERGED) return;
  gardenNotifyDeclined_(ss, cur.id, closure, why);
}




/* ---------- פתיחת משימה יזומה (doPost) ----------
   המנהל פותח משימה שלא נולדה מדיווח ולא מתבנית שגרה — עץ שהוא ראה בעצמו,
   עבודה שהוחלט עליה בישיבה, או בדיקה בשטח. `סוג` = "יזום" (ר' GARDEN_KINDS),
   ולכן היא **לא** נספרת כחלק מתוכנית העבודה ולא כדיווח תושב.
   ⚠️ לא פתוח לאחראי הגינון: פתיחת משימה היא הגדרת עבודה, וזו סמכות המנהל.
   הצוות מדווח על מה שמונע ביצוע (op:'block') — לא פותח לעצמו משימות. */
function gardenCreateTask_(ss, body) {
  var perm = body._perm || {};
  if (perm.isExternal) return { ok: false, error: 'פתיחת משימה היא בסמכות מנהל הגינון' };
  var who = ((perm.firstName || '') + ' ' + (perm.family || '')).trim() || body._email || '';

  var title = String(body.title || '').trim().substring(0, 120);
  if (!title) return { ok: false, error: 'צריך כותרת למשימה' };
  var lists = gardenLists_(ss);
  var cat = String(body.category || '').trim();
  if (lists.categories.length && lists.categories.indexOf(cat) === -1) {
    return { ok: false, error: 'קטגוריה לא מוכרת' };
  }
  var area = String(body.area || '').trim();
  if (area && lists.areas.length && lists.areas.indexOf(area) === -1) {
    return { ok: false, error: 'אזור לא מוכר' };
  }
  var wk = String(body.week || '').trim();
  if (wk && !/^\d{4}-\d{2}-\d{2}$/.test(wk)) return { ok: false, error: 'שבוע לא תקין' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    ensureGardenSheetsCached_(ss);   // ר' ההערה ליד ensureGardenSheetsCached_
    var sh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    var tc = gardenCols_(sh);
    var id = nextGardenId_(sh);
    var row = new Array(sh.getLastColumn()).fill('');
    row[tc['מזהה']] = id;
    row[tc['סוג']] = GARDEN_KIND_MANUAL;
    row[tc['כותרת']] = title;
    row[tc['קטגוריה']] = cat;
    row[tc['אזור']] = area;
    if (tc['נוצר בתאריך'] !== undefined) row[tc['נוצר בתאריך']] = new Date();
    // משימה שנפתחה עם שבוע כבר מתוכננת; בלי שבוע היא ממתינה לשיבוץ כמו דיווח.
    row[tc['שלב']] = wk ? 'מתוכנן' : 'התקבל';
    if (wk) row[tc['שבוע']] = wk;
    row[tc['עודכן בתאריך']] = new Date();
    row[tc['עודכן על ידי']] = who;
    row[tc['שנת תקציב']] = readSettings_(ss)['שנה נוכחית'] || '';
    sh.appendRow(row);
    gardenLog_(ss, id, 'נפתח', 'שלב', '', row[tc['שלב']], who, 'משימה יזומה');
    return { ok: true, id: id };
  } finally { lock.releaseLock(); }
}

/* ---------- איחוד כפילויות (F-05) ----------
   הסף הוא **מבני ולא סמנטי**: אותה קטגוריה, אותו אזור, בתוך 14 יום. אין כאן
   שום ניסיון להבין טקסט — שני תושבים מתארים את אותה ממטרה בשתי מילים שונות,
   ודמיון טקסטואלי היה מפספס אותם או מחבר דברים שונים.
   ⚠️ **הזיהוי מציע, המנהל מחליט.** אותו עיקרון כמו בדגלים ובגרירות: המערכת
   מרימה יד, ההכרעה אנושית. איחוד אוטומטי היה מסתיר תקלה שנייה אמיתית. */
var GARDEN_DUP_DAYS = 14;

/** מועמד לאיחוד עבור משימה נתונה, או null. מחזיר את המשימה **הוותיקה**,
 *  כי היא זו שנשארת והשנייה מתאחדת לתוכה. */
function gardenDupCandidate_(o, all) {
  if (o.kind !== GARDEN_KIND_REPORT) return null;   // רק דיווחי תושבים
  var mine = gardenDateOf_(o.createdAt);
  if (!mine) return null;
  var best = null;
  for (var i = 0; i < all.length; i++) {
    var c = all[i];
    if (String(c.id) === String(o.id)) continue;
    if (c.closure) continue;
    if (c.category !== o.category || c.area !== o.area) continue;
    var his = gardenDateOf_(c.createdAt);
    if (!his) continue;
    if (Math.abs(mine - his) > GARDEN_DUP_DAYS * 86400000) continue;
    if (his > mine) continue;                        // רק ותיקה ממני
    if (!best || his < gardenDateOf_(best.createdAt)) best = c;
  }
  return best ? { id: best.id, title: best.title, week: best.week } : null;
}

function gardenDateOf_(v) {
  if (!v) return 0;
  var d = (v instanceof Date) ? v : new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

/* ---------- ביצוע האיחוד (doPost) ----------
   מה קורה בפועל: הדיווחים שהצביעו על המשימה הנבלעת **מופנים למשימה הבולעת**,
   ומסומנים ב"אוחד לדיווח". זה מה שגורם למייל "הושלם" להישלח בבוא היום גם
   להם — בלי שורת קוד נוספת, כי gardenReportsForTask_ פשוט ימצא אותם שם.
   המשימה הנבלעת נסגרת ב'אוחד' ויורדת מרשימות העבודה. */
function gardenMerge_(ss, body) {
  var perm = body._perm || {};
  /* איחוד **אינו** חסום לגנן (8.9): זיהוי ששתי פניות הן אותה תקלה הוא שיפוט
     שטח, לא החלטת ועד. הוא גם מה שמונע ממנו לנסוע פעמיים לאותה ממטרה. */
  var who = ((perm.firstName || '') + ' ' + (perm.family || '')).trim() || body._email || '';
  var childId = String(body.id || '').trim();
  var parentId = String(body.into || '').trim();
  if (!childId || !parentId) return { ok: false, error: 'חסרה משימה לאיחוד' };
  if (childId === parentId) return { ok: false, error: 'אי אפשר לאחד משימה עם עצמה' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    if (!sh) return { ok: false, error: 'טאב המשימות חסר' };
    var fc = gardenFindTask_(sh, childId), fp = gardenFindTask_(sh, parentId);
    if (!fc || !fp) return { ok: false, error: 'אחת המשימות לא נמצאה' };
    var c = fc.cols;
    var wide = sh.getLastColumn();
    var child = gardenTaskObj_(sh.getRange(fc.row, 1, 1, wide).getValues()[0], c);
    var parent = gardenTaskObj_(sh.getRange(fp.row, 1, 1, wide).getValues()[0], c);
    if (child.closure) return { ok: false, error: 'המשימה כבר סגורה' };
    if (parent.closure) return { ok: false, error: 'אי אפשר לאחד לתוך משימה סגורה' };

    // 1. הפניית הדיווחים של הנבלעת אל הבולעת
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    var moved = [];
    if (rsh && rsh.getLastRow() > 1) {
      var rc = gardenCols_(rsh), rv = rsh.getDataRange().getValues();
      // מזהה הדיווח הראשי — מה שהתושב יראה כ"אוחד עם פנייה מס' X"
      var parentRepId = '';
      for (var k = 1; k < rv.length; k++) {
        if (String(rv[k][rc['מזהה משימה']] || '').trim() === parentId) {
          parentRepId = String(rv[k][rc['מזהה']] || ''); break;
        }
      }
      for (var r = 1; r < rv.length; r++) {
        if (String(rv[r][rc['מזהה משימה']] || '').trim() !== childId) continue;
        rsh.getRange(r + 1, rc['מזהה משימה'] + 1).setValue(parentId);
        rsh.getRange(r + 1, rc['אוחד לדיווח'] + 1).setValue(parentRepId || parentId);
        moved.push({
          id: String(rv[r][rc['מזהה']] || ''),
          familyId: String(rv[r][rc['מזהה משפחה']] || ''),
          name: String(rv[r][rc['שם מדווח']] || ''),
          category: String(rv[r][rc['קטגוריה']] || ''),
          place: String(rv[r][rc['מיקום מילולי']] || rv[r][rc['אזור']] || ''),
          parentRep: parentRepId || parentId
        });
      }
    }

    // 2. סגירת המשימה הנבלעת
    gardenSet_(sh, fc.row, c, 'שלב', 'הושלם');
    gardenSet_(sh, fc.row, c, 'דגל', '');
    gardenSet_(sh, fc.row, c, 'סגירה', GARDEN_CLOSURE_MERGED);
    gardenSet_(sh, fc.row, c, 'עודכן בתאריך', new Date());
    gardenSet_(sh, fc.row, c, 'עודכן על ידי', who);
    gardenLog_(ss, childId, 'איחוד', 'סגירה', '', GARDEN_CLOSURE_MERGED, who,
               'אוחדה לתוך משימה #' + parentId);
    gardenLog_(ss, parentId, 'איחוד', 'דיווחים', '', String(moved.length), who,
               'קלטה את משימה #' + childId);

    // 3. מייל לתושבים שדיווחו — זה מה שיאפשר להם להבין מייל סיום עתידי
    for (var m = 0; m < moved.length; m++) {
      try {
        if (!moved[m].familyId) continue;
        sendResidentTemplate_(ss, 'GARDEN_REPORT_MERGED',
          emailsForFamilyId_(ss, moved[m].familyId), {
            'שם': moved[m].name || '',
            'מזהה אב': moved[m].parentRep,
            'קטגוריה': moved[m].category,
            'מיקום': moved[m].place || 'השיכון'
          });
      } catch (e) { /* כשל מייל לא מבטל איחוד שנשמר */ }
    }
    return { ok: true, moved: moved.length };
  } finally { lock.releaseLock(); }
}

/* ---------- אישור מרוכז (doPost) ----------
   החלטה 3 באפיון: **רק משימות שגרה, מאותה תבנית ובאותו שבוע.** תקלה מדיווח
   תושב מאושרת תמיד לבד — היא נוגעת לאדם מסוים שקיבל עליה מייל, ואישור
   בסיטונות של תקלות הוא בדיוק מה שהופך אישור לחותמת גומי.
   האכיפה כאן, בשרת, ולא במסך: המסך רק לא *מציע* קיבוץ אסור. */
function gardenApproveBatch_(ss, body) {
  var perm = body._perm || {};
  if (perm.isExternal) return { ok: false, error: 'אישור הוא בסמכות מנהל הגינון' };
  var who = ((perm.firstName || '') + ' ' + (perm.family || '')).trim() || body._email || '';
  var ids = (body.ids || []).map(function (x) { return String(x).trim(); })
    .filter(function (x) { return x; });
  if (!ids.length) return { ok: false, error: 'לא נבחרו משימות' };
  if (ids.length > 60) return { ok: false, error: 'יותר מדי משימות בבת אחת' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(25000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    if (!sh) return { ok: false, error: 'טאב המשימות חסר' };
    var c = gardenCols_(sh);
    var vals = sh.getDataRange().getValues();

    // איסוף השורות, ואז אימות ההומוגניות לפני שנוגעים בגיליון
    var picked = [];
    for (var r = 1; r < vals.length; r++) {
      var o = gardenTaskObj_(vals[r], c);
      if (ids.indexOf(String(o.id)) === -1) continue;
      picked.push({ row: r + 1, o: o });
    }
    if (picked.length !== ids.length) return { ok: false, error: 'חלק מהמשימות לא נמצאו' };

    var tpl = picked[0].o.templateId, wk = picked[0].o.week;
    for (var i = 0; i < picked.length; i++) {
      var o2 = picked[i].o;
      if (o2.closure) return { ok: false, error: 'משימה ' + o2.id + ' כבר נסגרה' };
      if (o2.flag !== 'ממתין לאישור') return { ok: false, error: 'משימה ' + o2.id + ' אינה ממתינה לאישור' };
      if (o2.kind !== GARDEN_KIND_ROUTINE || !o2.templateId) {
        return { ok: false, error: 'אישור מרוכז הוא למשימות שגרה בלבד' };
      }
      if (o2.templateId !== tpl || o2.week !== wk) {
        return { ok: false, error: 'אישור מרוכז דורש אותה תבנית ואותו שבוע' };
      }
    }

    for (var j = 0; j < picked.length; j++) {
      gardenCloseRow_(ss, sh, picked[j].row, c, picked[j].o, 'בוצע', who);
    }
    return { ok: true, count: picked.length };
  } finally { lock.releaseLock(); }
}

/* ---------- פעולות על משימה (doPost) ----------
   כל הפעולות כאן פתוחות לכל בעל PERM_GARDEN — גם לאחראי החיצוני. הן נוגעות
   אך ורק לביצוע בשטח (סימון, הערה, דחייה, חסימה) ואף אחת מהן אינה *סוגרת*
   משימה: הסגירה היא של המנהל בלבד (שלב 5). זאת הסיבה שסימון ביצוע מרים דגל
   "ממתין לאישור" ולא כותב "סגירה". */
function gardenTaskAction_(ss, body) {
  var perm = body._perm || {};
  var who = ((perm.firstName || '') + ' ' + (perm.family || '')).trim() || body._email || '';
  var id = String(body.id || '').trim();
  var act = String(body.op || '').trim();
  if (!id) return { ok: false, error: 'לא נבחרה משימה' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try {
    var sh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    if (!sh) return { ok: false, error: 'טאב המשימות חסר' };
    var f = gardenFindTask_(sh, id);
    if (!f) return { ok: false, error: 'המשימה לא נמצאה' };
    var c = f.cols, row = f.row;
    var cur = gardenTaskObj_(sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0], c);
    if (cur.closure) return { ok: false, error: 'המשימה כבר נסגרה' };

    if (act === 'done') {
      /* ⚠️ הצוות מקדם עד "בטיפול" בלבד — **רק המנהל קובע "הושלם"** (עקרון
       * מהאפיון). סימון הוא הצהרה, לא קבלה. עד 7.9 נכתב כאן 'הושלם', מה
       * שנתן לקבלן לקבוע את השלב האחרון והציג לתושב "הושלם" לפני שהוועד
       * ראה את העבודה. הדגל הוא מה שמסמן שהעבודה נעשתה. */
      gardenSet_(sh, row, c, 'שלב', 'בטיפול');
      gardenSet_(sh, row, c, 'דגל', 'ממתין לאישור');
      gardenLog_(ss, id, 'ביצוע', 'דגל', cur.flag, 'ממתין לאישור', who, '');

    } else if (act === 'undo') {
      if (cur.flag !== 'ממתין לאישור') return { ok: false, error: 'אי אפשר לבטל אחרי אישור' };
      gardenSet_(sh, row, c, 'דגל', '');
      gardenLog_(ss, id, 'ביטול ביצוע', 'דגל', 'ממתין לאישור', '', who, '');

    } else if (act === 'note') {
      var note = String(body.note || '').trim().substring(0, 500);
      gardenSet_(sh, row, c, 'הערת ביצוע', note);
      gardenLog_(ss, id, 'הערה', 'הערת ביצוע', cur.note, note, who, '');

    } else if (act === 'defer') {
      // גרירה לשבוע הבא. מונה הגרירות ו"שבוע מקורי" הם מה שמאפשר למנהל לראות
      // מה נגרר שוב ושוב — ולכן "שבוע מקורי" נכתב פעם אחת בלבד, בגרירה הראשונה.
      if (!cur.week) return { ok: false, error: 'למשימה אין שבוע משובץ' };
      var next = gardenWeekShift_(cur.week, 1);
      gardenSet_(sh, row, c, 'שבוע', next);
      gardenSet_(sh, row, c, 'דגל', 'נגררה');
      gardenSet_(sh, row, c, 'מונה גרירות', (cur.drags || 0) + 1);
      if (!cur.firstWeek) gardenSet_(sh, row, c, 'שבוע מקורי', cur.week);
      gardenLog_(ss, id, 'גרירה', 'שבוע', cur.week, next, who,
                 String(body.note || '').trim().substring(0, 300));

    } else if (act === 'approve' || act === 'close') {
      /* אישור וסגירה — סמכות מנהל בלבד. שניהם אותה פעולה עם סיבת סגירה
       * שונה: 'approve' הוא קיצור ל-close עם "בוצע", שהיא הסגירה היחידה
       * ששולחת מייל לתושב. ר' gardenCloseRow_. */
      if (perm.isExternal) return { ok: false, error: 'אישור הוא בסמכות מנהל הגינון' };
      var reason = act === 'approve' ? 'בוצע' : String(body.closure || '').trim();
      if (GARDEN_CLOSURES.indexOf(reason) === -1) return { ok: false, error: 'סיבת סגירה לא מוכרת' };
      var why = String(body.note || '').trim().substring(0, 600);
      /* ⚠️ סגירה בלי ביצוע של פנייה שתושב פתח מחייבת הסבר. "בוטל" הוא ערך
         במערכת, לא תשובה לאדם — והמייל שיוצא אליו בנוי סביב ההסבר הזה. */
      if (reason !== 'בוצע' && cur.kind === GARDEN_KIND_REPORT && !why) {
        return { ok: false, error: 'צריך לכתוב לתושב מה הסיבה' };
      }
      gardenCloseRow_(ss, sh, row, c, cur, reason, who, why);
      return { ok: true };

    } else if (act === 'return') {
      /* החזרה להשלמה — הדגל שמחזיר את המשימה לצוות. השלב חוזר ל"בטיפול"
       * כי היא שוב בעבודה, וההערה נשמרת כדי שהצוות ידע מה חסר. */
      if (perm.isExternal) return { ok: false, error: 'הפעולה בסמכות מנהל הגינון' };
      var why = String(body.note || '').trim().substring(0, 500);
      if (!why) return { ok: false, error: 'צריך לכתוב מה חסר' };
      gardenSet_(sh, row, c, 'שלב', 'בטיפול');
      gardenSet_(sh, row, c, 'דגל', 'הוחזר להשלמה');
      gardenSet_(sh, row, c, 'הערת ביצוע', why);
      gardenLog_(ss, id, 'החזרה', 'דגל', cur.flag, 'הוחזר להשלמה', who, why);

    } else if (act === 'plan') {
      /* שיבוץ לשבוע — החוליה שהייתה חסרה. דיווח תושב נשמר עם שלב "התקבל"
       * ובלי "שבוע", ולכן לא הופיע בשום רשימה שבועית: לא אצל הצוות ולא אצל
       * המנהל. השיבוץ הוא מה שמכניס אותו לתוכנית העבודה, והוא מקדם את השלב
       * ל"מתוכנן" — הערך שהאפיון ייעד בדיוק לרגע הזה. */
      /* שיבוץ **אינו** חסום לגנן (8.9). הוא מי שנמצא בשטח ויודע מתי הוא
         מגיע לשם; המנהל רואה את התוצאה כמטלה פתוחה במעקב. */
      var wk = String(body.week || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) return { ok: false, error: 'שבוע לא תקין' };
      gardenSet_(sh, row, c, 'שבוע', wk);
      if (GARDEN_STAGES.indexOf(cur.stage) < GARDEN_STAGES.indexOf('מתוכנן')) {
        gardenSet_(sh, row, c, 'שלב', 'מתוכנן');
      }
      // "נגררה" הוא דגל של גרירה אוטומטית; שיבוץ ידני מנקה אותו.
      if (cur.flag === 'נגררה') gardenSet_(sh, row, c, 'דגל', '');
      gardenLog_(ss, id, 'שיבוץ', 'שבוע', cur.week, wk, who, '');

    } else if (act === 'block') {
      // "לא ניתן לביצוע" — לא סוגר ולא מעביר לבינוי. מרים דגל שמחזיר את
      // המשימה לשולחן המנהל עם הסיבה, כי רק הוא מוסמך לסגור או להעביר.
      var why = String(body.note || '').trim().substring(0, 500);
      if (!why) return { ok: false, error: 'צריך לכתוב מה מונע את הביצוע' };
      gardenSet_(sh, row, c, 'דגל', 'דורש בדיקה בשטח');
      gardenSet_(sh, row, c, 'הערת ביצוע', why);
      gardenLog_(ss, id, 'חסימה', 'דגל', cur.flag, 'דורש בדיקה בשטח', who, why);
      try {
        notifyAdmins_(ss, PERM_GARDEN, 'ADMIN_GARDEN_TASK_BLOCKED',
          { 'מזהה': id, 'כותרת': cur.title, 'סיבה': why, 'שם': who });
      } catch (e) { /* כשל מייל לא מבטל פעולה שנשמרה */ }

    } else {
      return { ok: false, error: 'פעולה לא מוכרת' };
    }

    gardenSet_(sh, row, c, 'עודכן בתאריך', new Date());
    gardenSet_(sh, row, c, 'עודכן על ידי', who);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
