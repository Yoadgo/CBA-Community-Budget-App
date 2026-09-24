/* ============================================================================
 *  Maintenance.gs — פעולות תחזוקה חד-פעמיות על הגיליון (24.9.2026)
 * ----------------------------------------------------------------------------
 *  פונקציות שמריצים **ידנית מהעורך** (Run), לא דרך doGet/doPost. אף אחת מהן
 *  אינה נחשפת ללקוח. כל פונקציה כאן אידמפוטנטית — הרצה חוזרת לא משנה כלום.
 *
 *  tidyResidentsSheet — סידור טאב "תושבים": סדר עמודות קבוע + עיצוב אחיד.
 *  🔴 הסדר בטוח כי **כל הקוד מאתר עמודות לפי כותרת**, לא לפי מיקום (נבדק
 *     24.9.26: 36 נקודות גישה, אפס גישות באינדקס קבוע). שני תנאים שהקוד
 *     כן מניח, ושהסדר כאן מקיים:
 *     1. שמות הכותרות נשארים זהים תו-בתו (הזיהוי הוא לפי הכלה — "אימייל",
 *        "טלפון", "הרשאות"…).
 *     2. בכל משפחת עמודות "…1" לפני "…2" (המשבצות מזווגות לפי סדר הופעה,
 *        ר' residentSlotCols_ / lookupResident_).
 *  ⚠️ הפונקציה **מסרבת לרוץ** אם קבוצת הכותרות בגיליון אינה בדיוק הרשימה
 *     כאן (כותרת חסרה / עודפת / כפולה) — עדיף לעצור מאשר לסדר חצי.
 *  ⚠️ לפני כל שינוי נוצר עותק מוסתר של הטאב ("תושבים — גיבוי <תאריך>").
 * ========================================================================== */

var RESIDENTS_COLUMN_ORDER = [
  /* זיהוי */
  'מזהה קבוע', 'משפחה', 'מספר בית', 'סטטוס (פעיל/עזב)', 'סוג משתמש',
  /* דייר 1 */
  'שם פרטי 1', 'כתובת אימייל 1', 'מספר טלפון 1', 'מקצוע 1', 'תאריך לידה 1', 'ת.ז. 1', 'הרשאות 1',
  /* דייר 2 */
  'שם פרטי 2', 'כתובת אימייל 2', 'מספר טלפון 2', 'מקצוע 2', 'תאריך לידה 2', 'ת.ז. 2', 'הרשאות 2',
  /* משק בית */
  'שמות ילדים', 'הערות',
  /* מערכת */
  'תפקיד (תושב/מנהל)', 'סיור נצפה', 'מזהה Firebase 1', 'מזהה Firebase 2', 'עודכן ע"י', 'עודכן בתאריך'
];
var RESIDENTS_SYSTEM_COLS_FROM = 22;   // 1-based: מכאן ואילך "מערכת" (אפור)
var RESIDENTS_TEXT_COLS = ['מספר בית', 'מספר טלפון 1', 'מספר טלפון 2', 'ת.ז. 1', 'ת.ז. 2'];
var RESIDENTS_COL_WIDTHS = {
  'משפחה': 110, 'מספר בית': 80, 'מזהה קבוע': 80, 'סטטוס (פעיל/עזב)': 100, 'סוג משתמש': 90,
  'שם פרטי 1': 100, 'כתובת אימייל 1': 210, 'מספר טלפון 1': 110, 'מקצוע 1': 130, 'תאריך לידה 1': 100, 'ת.ז. 1': 100, 'הרשאות 1': 110,
  'שם פרטי 2': 100, 'כתובת אימייל 2': 210, 'מספר טלפון 2': 110, 'מקצוע 2': 130, 'תאריך לידה 2': 100, 'ת.ז. 2': 100, 'הרשאות 2': 110,
  'שמות ילדים': 180, 'הערות': 220,
  'תפקיד (תושב/מנהל)': 110, 'סיור נצפה': 80, 'מזהה Firebase 1': 200, 'מזהה Firebase 2': 200, 'עודכן ע"י': 160, 'עודכן בתאריך': 130
};

/** בודק בלבד — מדפיס מה יזוז, בלי לגעת. להריץ קודם. */
function tidyResidentsSheetDryRun() {
  return tidyResidentsSheet_(true);
}

/** מסדר ומעצב. מחזיר דוח. */
function tidyResidentsSheet() {
  return tidyResidentsSheet_(false);
}

function tidyResidentsSheet_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('תושבים');
  if (!sh) throw new Error('אין טאב "תושבים"');
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });

  /* --- שומר: קבוצת הכותרות חייבת להיות בדיוק הרשימה --- */
  var problems = [];
  var seen = {};
  headers.forEach(function (h, i) {
    if (!h) { problems.push('עמודה ריקה במיקום ' + (i + 1)); return; }
    if (seen[h]) problems.push('כותרת כפולה: ' + h);
    seen[h] = true;
    if (RESIDENTS_COLUMN_ORDER.indexOf(h) === -1) problems.push('כותרת לא מוכרת: ' + h);
  });
  RESIDENTS_COLUMN_ORDER.forEach(function (h) { if (!seen[h]) problems.push('כותרת חסרה: ' + h); });
  if (problems.length) {
    var msg = 'לא מסדרים — ' + problems.join(' · ');
    Logger.log(msg);
    throw new Error(msg);
  }

  /* --- תוכנית ההזזות (מחושבת על עותק, לפני שנוגעים) --- */
  var plan = [];
  var sim = headers.slice();
  for (var i = 0; i < RESIDENTS_COLUMN_ORDER.length; i++) {
    var want = RESIDENTS_COLUMN_ORDER[i];
    var cur = sim.indexOf(want);          // 0-based
    if (cur === i) continue;
    /* cur > i תמיד: כל מה שלפני i כבר במקומו. moveColumns עם יעד i+1
       (על קואורדינטות **לפני** ההזזה) מכניס את העמודה לפני העמודה i+1,
       כלומר היא נוחתת בדיוק ב-i+1 ומה שביניהם זז ימינה באחד. */
    plan.push({ header: want, from: cur + 1, to: i + 1 });
    sim.splice(cur, 1);
    sim.splice(i, 0, want);
  }
  var report = { moves: plan.length, plan: plan, dryRun: !!dryRun };
  Logger.log(JSON.stringify(report));
  if (sim.join('|') !== RESIDENTS_COLUMN_ORDER.join('|')) throw new Error('סימולציית הסידור לא הגיעה לסדר היעד — לא נוגעים');
  if (dryRun) return report;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    /* --- גיבוי מוסתר (פעם אחת ליום) --- */
    var day = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy');
    var bkName = 'תושבים — גיבוי ' + day;
    if (!ss.getSheetByName(bkName)) {
      var bk = sh.copyTo(ss);
      bk.setName(bkName);
      bk.hideSheet();
    }

    /* --- הזזות --- */
    plan.forEach(function (m) {
      sh.moveColumns(sh.getRange(1, m.from, 1, 1), m.to);
    });
    SpreadsheetApp.flush();

    /* --- אימות: הכותרות עכשיו בדיוק בסדר היעד --- */
    var after = sh.getRange(1, 1, 1, RESIDENTS_COLUMN_ORDER.length).getValues()[0].map(function (h) { return String(h || '').trim(); });
    if (after.join('|') !== RESIDENTS_COLUMN_ORDER.join('|')) {
      throw new Error('אחרי ההזזה הסדר אינו כמצופה: ' + after.join(' | ') + ' — יש גיבוי בטאב "' + bkName + '"');
    }

    /* --- עיצוב אחיד --- */
    formatResidentsTidy_(sh);
    report.formatted = true;
    report.backup = bkName;
  } finally {
    lock.releaseLock();
  }
  Logger.log(JSON.stringify(report));
  return report;
}

/** עיצוב: פונט אחד, כותרת מודגשת וקבועה, 3 עמודות זיהוי קפואות, טקסט
 *  לעמודות מספריות-לכאורה, רוחב עמודות, וקבוצת "מערכת" באפור. */
function formatResidentsTidy_(sh) {
  var n = RESIDENTS_COLUMN_ORDER.length;
  var lastRow = Math.max(sh.getLastRow(), 2);
  var all = sh.getRange(1, 1, lastRow, n);
  all.setFontFamily('Arial').setFontSize(10).setFontColor('#1f2937')
     .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
     .setBackground(null).setFontWeight('normal').setFontStyle('normal');

  var head = sh.getRange(1, 1, 1, n);
  head.setFontWeight('bold').setBackground('#f3f4f6').setFontColor('#111827');
  sh.setRowHeight(1, 32);

  /* עמודות "מערכת" — אפור, גם בכותרת וגם בגוף */
  var sysCount = n - RESIDENTS_SYSTEM_COLS_FROM + 1;
  sh.getRange(1, RESIDENTS_SYSTEM_COLS_FROM, lastRow, sysCount).setFontColor('#6b7280');
  sh.getRange(1, RESIDENTS_SYSTEM_COLS_FROM, 1, sysCount).setBackground('#e5e7eb');

  /* עמודות טקסט — שלא ייעלמו אפסים מובילים (טלפון/ת.ז./בית) */
  RESIDENTS_TEXT_COLS.forEach(function (h) {
    var c = RESIDENTS_COLUMN_ORDER.indexOf(h) + 1;
    if (c > 0) sh.getRange(1, c, lastRow, 1).setNumberFormat('@');
  });

  /* רוחב עמודות */
  RESIDENTS_COLUMN_ORDER.forEach(function (h, i) {
    var w = RESIDENTS_COL_WIDTHS[h];
    if (w) sh.setColumnWidth(i + 1, w);
  });

  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
  if (!sh.isRightToLeft()) sh.setRightToLeft(true);
}
