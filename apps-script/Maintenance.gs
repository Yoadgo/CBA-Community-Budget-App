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
  'תפקיד (תושב/מנהל)', 'סיור נצפה 1', 'סיור נצפה 2', 'מזהה Firebase 1', 'מזהה Firebase 2', 'עודכן ע"י', 'עודכן בתאריך'
];
/* לפני migrateResidentsPerSlot הטאב מחזיק את העמודה הישנה "סיור נצפה" במקום
   שתי עמודות המשבצות. tidyResidentsSheet מקבל את שני המצבים. */
function residentsExpectedOrder_(headers) {
  if (headers.indexOf('סיור נצפה') === -1) return RESIDENTS_COLUMN_ORDER.slice();
  var out = [];
  RESIDENTS_COLUMN_ORDER.forEach(function (h) {
    if (h === 'סיור נצפה 1') out.push('סיור נצפה');
    else if (h !== 'סיור נצפה 2') out.push(h);
  });
  return out;
}
var RESIDENTS_SYSTEM_COLS_FROM = 22;   // 1-based: מכאן ואילך "מערכת" (אפור)
var RESIDENTS_TEXT_COLS = ['מספר בית', 'מספר טלפון 1', 'מספר טלפון 2', 'ת.ז. 1', 'ת.ז. 2'];
var RESIDENTS_COL_WIDTHS = {
  'משפחה': 110, 'מספר בית': 80, 'מזהה קבוע': 80, 'סטטוס (פעיל/עזב)': 100, 'סוג משתמש': 90,
  'שם פרטי 1': 100, 'כתובת אימייל 1': 210, 'מספר טלפון 1': 110, 'מקצוע 1': 130, 'תאריך לידה 1': 100, 'ת.ז. 1': 100, 'הרשאות 1': 110,
  'שם פרטי 2': 100, 'כתובת אימייל 2': 210, 'מספר טלפון 2': 110, 'מקצוע 2': 130, 'תאריך לידה 2': 100, 'ת.ז. 2': 100, 'הרשאות 2': 110,
  'שמות ילדים': 180, 'הערות': 220,
  'תפקיד (תושב/מנהל)': 110, 'סיור נצפה': 80, 'סיור נצפה 1': 80, 'סיור נצפה 2': 80, 'מזהה Firebase 1': 200, 'מזהה Firebase 2': 200, 'עודכן ע"י': 160, 'עודכן בתאריך': 130
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
  var ORDER = residentsExpectedOrder_(headers);

  /* --- שומר: קבוצת הכותרות חייבת להיות בדיוק הרשימה --- */
  var problems = [];
  var seen = {};
  headers.forEach(function (h, i) {
    if (!h) { problems.push('עמודה ריקה במיקום ' + (i + 1)); return; }
    if (seen[h]) problems.push('כותרת כפולה: ' + h);
    seen[h] = true;
    if (ORDER.indexOf(h) === -1) problems.push('כותרת לא מוכרת: ' + h);
  });
  ORDER.forEach(function (h) { if (!seen[h]) problems.push('כותרת חסרה: ' + h); });
  if (problems.length) {
    var msg = 'לא מסדרים — ' + problems.join(' · ');
    Logger.log(msg);
    throw new Error(msg);
  }

  /* --- תוכנית ההזזות (מחושבת על עותק, לפני שנוגעים) --- */
  var plan = [];
  var sim = headers.slice();
  for (var i = 0; i < ORDER.length; i++) {
    var want = ORDER[i];
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
  if (sim.join('|') !== ORDER.join('|')) throw new Error('סימולציית הסידור לא הגיעה לסדר היעד — לא נוגעים');
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
    var after = sh.getRange(1, 1, 1, ORDER.length).getValues()[0].map(function (h) { return String(h || '').trim(); });
    if (after.join('|') !== ORDER.join('|')) {
      throw new Error('אחרי ההזזה הסדר אינו כמצופה: ' + after.join(' | ') + ' — יש גיבוי בטאב "' + bkName + '"');
    }

    /* --- עיצוב אחיד --- */
    formatResidentsTidy_(sh, ORDER);
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
function formatResidentsTidy_(sh, ORDER) {
  ORDER = ORDER || RESIDENTS_COLUMN_ORDER;
  var n = ORDER.length;
  var lastRow = Math.max(sh.getLastRow(), 2);
  var all = sh.getRange(1, 1, lastRow, n);
  all.setFontFamily('Arial').setFontSize(10).setFontColor('#1f2937')
     .setVerticalAlignment('middle').setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
     .setBackground(null).setFontWeight('normal').setFontStyle('normal');

  var head = sh.getRange(1, 1, 1, n);
  head.setFontWeight('bold').setBackground('#f3f4f6').setFontColor('#111827');
  sh.setRowHeight(1, 32);

  /* עמודות "מערכת" — אפור, גם בכותרת וגם בגוף */
  var sysFrom = ORDER.indexOf('תפקיד (תושב/מנהל)') + 1 || RESIDENTS_SYSTEM_COLS_FROM;
  var sysCount = n - sysFrom + 1;
  sh.getRange(1, sysFrom, lastRow, sysCount).setFontColor('#6b7280');
  sh.getRange(1, sysFrom, 1, sysCount).setBackground('#e5e7eb');

  /* עמודות טקסט — שלא ייעלמו אפסים מובילים (טלפון/ת.ז./בית) */
  RESIDENTS_TEXT_COLS.forEach(function (h) {
    var c = ORDER.indexOf(h) + 1;
    if (c > 0) sh.getRange(1, c, lastRow, 1).setNumberFormat('@');
  });

  /* רוחב עמודות */
  ORDER.forEach(function (h, i) {
    var w = RESIDENTS_COL_WIDTHS[h];
    if (w) sh.setColumnWidth(i + 1, w);
  });

  sh.setFrozenRows(1);
  sh.setFrozenColumns(3);
  if (!sh.isRightToLeft()) sh.setRightToLeft(true);
}

/* ============================================================================
 *  migrateResidentsPerSlot — מעבר חד-פעמי לנתונים "לכל דייר"   (24.9.2026)
 * ----------------------------------------------------------------------------
 *  שני תיקונים מהערב של דר, שניהם "עמודה אחת לשורה במקום לכל דייר":
 *
 *  1. הרשאות: שורה שבה "תפקיד" מכיל "מנהל" ושתי עמודות "הרשאות N" ריקות —
 *     כותבים "על" ב"הרשאות 1" בלבד ומרוקנים את "תפקיד". מאותו רגע הקוד לא
 *     קורא יותר את "תפקיד" (ר' permissionsFor_), ולכן בן/בת הזוג אינו מנהל
 *     אלא אם כתוב לו במפורש. בגיליון החי (24.9) רק שורה 401 עונה על זה.
 *
 *  2. סיור: העמודה "סיור נצפה" הופכת במקום ל"סיור נצפה 1", ומיד אחריה
 *     נוספת "סיור נצפה 2". הערך הישן (של השורה) עובר לדייר שכנראה ראה
 *     את הסיור: אם רק לאחד מהם יש "מזהה Firebase" — לו; אחרת לדייר 1.
 *     הדייר השני יקבל את הסיור בכניסה הבאה (פעם אחת).
 *
 *  ואחר כך: members/{uid} ב-Firestore לשורות שהשתנו (fbSyncRow_), ו-tourSeen
 *  לכולם (tourSeenSyncAll_) — אחרת Firestore היה ממשיך לומר את הישן.
 *
 *  ⚠️ אידמפוטנטית: הרצה שנייה לא מוצאת מה לשנות ומחזירה אפסים.
 *  ⚠️ לפני שינוי — גיבוי מוסתר "תושבים — לפני מעבר <תאריך>" (פעם ביום).
 *  ⚠️ migrateResidentsPerSlotDryRun מדפיסה מה ישתנה בלי לגעת.
 * ========================================================================== */
function migrateResidentsPerSlotDryRun() { return migrateResidentsPerSlot_(true); }
function migrateResidentsPerSlot() { return migrateResidentsPerSlot_(false); }

function migrateResidentsPerSlot_(dryRun) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('תושבים');
  if (!sh) throw new Error('אין טאב "תושבים"');
  var report = { dryRun: !!dryRun, perms: [], tour: null, fbSynced: 0, tourSync: null };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var lastCol = sh.getLastColumn(), lastRow = sh.getLastRow();
    var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h || '').trim(); });
    var vals = lastRow > 1 ? sh.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
    var cols = residentSlotCols_(sh);
    var roleCol = -1, famCol = -1, houseCol = -1;
    headers.forEach(function (h, i) {
      if (h.indexOf('תפקיד') !== -1) roleCol = i;
      else if (h === 'משפחה') famCol = i;
      else if (h === 'מספר בית') houseCol = i;
    });

    if (!dryRun) {
      var day = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'dd.MM.yyyy');
      var bkName = 'תושבים — לפני מעבר ' + day;
      if (!ss.getSheetByName(bkName)) { var bk = sh.copyTo(ss); bk.setName(bkName); bk.hideSheet(); }
      report.backup = bkName;
    }

    /* --- 1. הרשאות --- */
    var touchedRows = [];
    if (roleCol > -1 && cols.perm.length) {
      for (var r = 0; r < vals.length; r++) {
        var role = String(vals[r][roleCol] || '').trim();
        if (role.indexOf('מנהל') === -1) continue;
        var anyPerm = cols.perm.some(function (c) { return String(vals[r][c] || '').trim() !== ''; });
        var e1 = String(vals[r][cols.email[0]] || '').trim();
        var item = { row: r + 2, house: houseCol > -1 ? String(vals[r][houseCol]) : '', family: famCol > -1 ? String(vals[r][famCol]) : '',
                     role: role, action: anyPerm ? 'יש כבר הרשאות — רק מרוקנים תפקיד' : ('הרשאות 1 = על (' + e1 + ')') };
        report.perms.push(item);
        if (dryRun) continue;
        if (!anyPerm && e1) sh.getRange(r + 2, cols.perm[0] + 1).setValue(PERM_SUPER);
        sh.getRange(r + 2, roleCol + 1).setValue('');
        touchedRows.push(r + 2);
      }
    }

    /* --- 2. סיור נצפה --- */
    var legacyIdx = headers.indexOf(TOUR_SEEN_HEADER);   // 0-based
    var tsc = tourSeenCols_(sh);
    if (legacyIdx === -1) {
      report.tour = tsc.slots.length ? 'כבר לכל דייר' : 'אין עמודה — תיווצר בקריאה הראשונה';
    } else {
      var moves = { toSlot1: 0, toSlot2: 0, empty: 0 };
      var s1 = [], s2 = [];
      for (var q = 0; q < vals.length; q++) {
        var v = vals[q][legacyIdx];
        var has = !(v === '' || v === null);
        var uid1 = cols.uid[0] !== undefined ? String(vals[q][cols.uid[0]] || '').trim() : '';
        var uid2 = cols.uid[1] !== undefined ? String(vals[q][cols.uid[1]] || '').trim() : '';
        var toSecond = has && !uid1 && !!uid2;
        s1.push([has && !toSecond ? v : '']);
        s2.push([toSecond ? v : '']);
        if (!has) moves.empty++; else if (toSecond) moves.toSlot2++; else moves.toSlot1++;
      }
      report.tour = moves;
      if (!dryRun) {
        var col1 = legacyIdx + 1;
        sh.insertColumnAfter(col1);
        sh.getRange(1, col1, 1, 2).setValues([[TOUR_SEEN_HEADER + ' 1', TOUR_SEEN_HEADER + ' 2']]).setFontWeight('bold');
        if (vals.length) {
          sh.getRange(2, col1, vals.length, 1).setValues(s1);
          sh.getRange(2, col1 + 1, vals.length, 1).setValues(s2);
        }
        SpreadsheetApp.flush();
      }
    }
  } finally {
    lock.releaseLock();
  }

  if (!dryRun) {
    /* Firestore — אחרי השחרור: fbSyncRow_ קוראת permissionsFor_ מהגיליון. */
    PERMS_MEMO_ = {};
    (touchedRows || []).forEach(function (row) { report.fbSynced += fbSyncRow_(ss, row) || 0; });
    try { report.tourSync = tourSeenSyncAll_(ss); } catch (e) { report.tourSync = String(e); }
  }
  Logger.log(JSON.stringify(report));
  return report;
}
