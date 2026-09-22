/* ============================================================================
 *  GardenHorizon.gs — הגינון ב-Firestore: שלושת שירותי הרקע שנשארים בשרת
 *  2026-09-22
 * ----------------------------------------------------------------------------
 *  🔑 **מה השרת עושה מהיום בגינון — ורק את זה:**
 *     1. `gardenHorizonRun_`      — מגלגל את האופק (8 שבועות) פעם בשעה.
 *                                   אותו מנוע בדיוק כמו בדפדפן (GardenRules.gs).
 *     2. `gardenPendingDeleteRun_` — מסיים מחיקות שהדפדפן סימן: תמונות
 *                                   לסל, דיווחים מקושרים, המסמך עצמו.
 *     3. `gardenLogRetention_`     — פעם ביום: רשומות יומן מעל 12 חודשים
 *                                   עוברות לטאב ארכיון בגיליון ויורדות
 *                                   מ-Firestore (מעל ~6,000 הגיבוי המצטבר חותך).
 *     + מיילים, תמונות וגיבוי — כמו תמיד. אין Cloud Functions ב-Spark.
 *
 *  🔴 **הישן לא נמחק כאן.** `gardenMaterializeWeek_` והמסלולים מהגיליון
 *     נשארים רדומים מאחורי `gardenFsOwns_()` — כלל גל 5: מכבים, מחכים
 *     שבוע, ורק אז מוחקים. הקריאות ב-`hourlyJobsRun_` מתפצלות לפי הדגל.
 *
 *  ⚠️ קובץ נפרד מ-`Code.gs` — אותו נימוק כמו GardenPurge.gs: Code.gs
 *     הוא חנק צוואר של סשנים מקבילים; כאן נגענו בו בשתי שורות בלבד.
 * ========================================================================== */

var GH_LOG_RETENTION_MONTHS = 12;
var GH_LOG_ARCHIVE_TAB = '_ארכיון_יומן גינון';

/* ---------- 1. האופק ---------- */

/** מגלגל את האופק. מחזיר סיכום ולעולם אינו זורק. */
function gardenHorizonRun_(ss) {
  var out = { ok: false, created: 0, existed: 0, removed: 0, kept: 0, frozen: 0, errors: [] };
  if (typeof GardenRules === 'undefined') { out.errors.push('GardenRules.gs חסר בפרויקט'); return out; }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { out.skipped = 'busy'; return out; }
  try {
    var defs = fsList_(FS_GARDEN_PLAN).map(function (d) { d.data.id = d.data.id || d.id; return d.data; });
    var tasks = fsList_(FS_GARDEN_TASKS).map(function (d) { d.data.id = d.data.id || d.id; return d.data; });
    var now = new Date();
    var year = '';
    try { year = String(readSettings_(ss || SpreadsheetApp.getActiveSpreadsheet())['שנה נוכחית'] || ''); } catch (e) {}
    var diff = GardenRules.horizon(defs, tasks, GardenRules.weekKey(now), { now: now, year: year });
    out.kept = diff.kept; out.frozen = diff.frozen;

    diff.create.forEach(function (doc) {
      try {
        /* 🔑 בדיקת קיום לפני כתיבה — `fsSet_` דורס. בין הקריאה למעלה
           לכתיבה כאן דפדפן של מנהל יכול היה ליצור את אותו מופע. */
        if (fsGet_(fsDocPath_(FS_GARDEN_TASKS, doc.id))) { out.existed++; return; }
        fsSet_(fsDocPath_(FS_GARDEN_TASKS, doc.id), doc);
        out.created++;
      } catch (e) { out.errors.push('create ' + doc.id + ': ' + e); }
    });
    diff.remove.forEach(function (id) {
      try { fsDelete_(fsDocPath_(FS_GARDEN_TASKS, id)); out.removed++; }
      catch (e) { out.errors.push('remove ' + id + ': ' + e); }
    });
    out.ok = out.errors.length === 0;
  } catch (e) {
    out.errors.push(String(e));
  } finally { lock.releaseLock(); }
  return out;
}

/** הרצה ידנית מהעורך — מילוי ראשוני של האופק. */
function gardenHorizonRunNow() {
  var r = gardenHorizonRun_(SpreadsheetApp.getActiveSpreadsheet());
  Logger.log(JSON.stringify(r));
  return r;
}

/* ---------- 2. סיום מחיקות ---------- */

/** משימות שהדפדפן סימן `pendingDelete: true`. מוחק תמונות, דיווחים
 *  מקושרים ואת המסמך. **היומן נשאר** — הוא היסטוריה, כמו תמיד. */
function gardenPendingDeleteRun_(ss) {
  var out = { ok: false, found: 0, deleted: 0, reports: 0, photos: 0, errors: [] };
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) { out.skipped = 'busy'; return out; }
  try {
    var pending = fsQuery_(FS_GARDEN_TASKS, 'pendingDelete', 'EQUAL', true, 50);
    out.found = pending.length;
    pending.forEach(function (d) {
      var id = d.id;
      try {
        var photos = [];
        (d.data.photos || []).forEach(function (p) { if (p) photos.push(String(p)); });
        /* דיווחים שמצביעים על המשימה — הולכים איתה, כמו במחיקה הישנה. */
        var reps = fsQuery_(FS_GARDEN_REPORTS, 'taskId', 'EQUAL', String(id), 50);
        reps.forEach(function (r) {
          (r.data.photos || []).forEach(function (p) { if (p) photos.push(String(p)); });
          fsDelete_(fsDocPath_(FS_GARDEN_REPORTS, r.id));
          out.reports++;
        });
        if (photos.length) { gardenDeletePhotos_(photos.join(',')); out.photos += photos.length; }
        fsDelete_(fsDocPath_(FS_GARDEN_TASKS, id));
        out.deleted++;
        /* שורת המראה בגיליון — כדי שלא תישאר כיתומה. */
        try { ghDeleteMirrorRow_(ss, GARDEN_TASKS_SHEET, id); } catch (e2) {}
        reps.forEach(function (r) { try { ghDeleteMirrorRow_(ss, GARDEN_REPORTS_SHEET, r.id); } catch (e3) {} });
      } catch (e) { out.errors.push(id + ': ' + e); }
    });
    out.ok = out.errors.length === 0;
  } catch (e) {
    out.errors.push(String(e));
  } finally { lock.releaseLock(); }
  return out;
}

/** מוחק שורה לפי 'מזהה' בטאב מראה. שקט אם אין. */
function ghDeleteMirrorRow_(ss, sheetName, id) {
  var sh = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(sheetName);
  if (!sh || sh.getLastRow() < 2) return false;
  var c = gardenCols_(sh);
  if (c['מזהה'] === undefined) return false;
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, c['מזהה'] + 1, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim() === String(id)) { sh.deleteRow(i + 2); return true; }
  }
  return false;
}

/* ---------- 3. ריטנשן היומן ---------- */

/** רשומות יומן ישנות מ-12 חודשים → טאב ארכיון בגיליון → מחיקה מ-Firestore. */
function gardenLogRetention_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var out = { ok: false, moved: 0, errors: [] };
  try {
    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - GH_LOG_RETENTION_MONTHS);
    var old = fsQuery_('gardenLog', 'at', 'LESS_THAN', cutoff, 300);
    if (!old.length) { out.ok = true; return out; }
    var sh = ss.getSheetByName(GH_LOG_ARCHIVE_TAB);
    if (!sh) {
      sh = ss.insertSheet(GH_LOG_ARCHIVE_TAB);
      sh.getRange(1, 1, 1, 4).setValues([['id', 'taskId', 'at', 'json']]);
      sh.setFrozenRows(1);
      sh.hideSheet();
    }
    var rows = old.map(function (d) {
      return [d.id, String(d.data.taskId || ''), d.data.at instanceof Date ? d.data.at : String(d.data.at || ''),
              JSON.stringify(d.data)];
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
    /* רק אחרי שהכתיבה לגיליון הצליחה — מוחקים. */
    old.forEach(function (d) {
      try { fsDelete_(fsDocPath_('gardenLog', d.id)); out.moved++; }
      catch (e) { out.errors.push(d.id + ': ' + e); }
    });
    out.ok = out.errors.length === 0;
  } catch (e) { out.errors.push(String(e)); }
  return out;
}
