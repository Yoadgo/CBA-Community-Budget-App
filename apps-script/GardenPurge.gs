/* ============================================================================
 *  GardenPurge.gs — כלי ניקוי חד-פעמי של נתוני הגינון לקראת ההשקה
 *  2026-09-22
 * ----------------------------------------------------------------------------
 *  🔴 **קובץ נפרד ולא בתוך Code.gs, בכוונה:**
 *     1. `Code.gs` הוא חנק צוואר שסשנים מקבילים נוגעים בו; קובץ חדש
 *        אינו מתנגש עם אף אחד.
 *     2. הכלי חד-פעמי — אחרי ההשקה מוחקים את הקובץ ולא נשאר חוב.
 *     3. **אף פונקציה כאן אינה מחוברת ל-`doGet`/`doPost`** — ולכן
 *        **אין צורך ב-Deploy**, והייצור אינו מושפע מעצם קיום הקובץ.
 *        שמירה בעורך מספיקה כדי להריץ; רק Deploy משנה את הייצור.
 *
 *  🔴🔴 **`gardenPurgeDryRun` היא קריאה בלבד.** אין בה שורת כתיבה אחת —
 *     לא לגיליון, לא ל-Firestore, לא ל-Drive. אפשר להריץ אותה כמה
 *     פעמים שרוצים, בכל שעה, בלי סיכון.
 *
 *  ⚠️ מונחים בדוח: "סגורה" = יש ערך בעמודת 'סגירה' **או** שלב 'הושלם'.
 *     "פעילה" = כל השאר.
 * ========================================================================== */

var GP_VER = '2026-09-22a';

/** מצרף רשימת מזהים לשורה קריאה, עם קיצור כשהיא ארוכה. */
function gpIds_(arr) {
  if (!arr.length) return '—';
  var s = arr.join(', ');
  return arr.length + ' פריטים: ' + s;
}

/** ============================================================================
 *  הריצה היבשה — תמונת מצב מלאה של נתוני הגינון, בלי לגעת בכלום.
 *  מריצים בעורך Apps Script ומסתכלים ביומן ההפעלה.
 * ========================================================================== */
function gardenPurgeDryRun() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }

  var thisWeek = gardenWeekKey_();
  L('════════ ריצה יבשה · ניקוי גינון · ' + GP_VER + ' ════════');
  L('השבוע הנוכחי (מפתח): ' + thisWeek);
  L('');

  /* ---------- 1. דגלי המיגרציה — קובעים מי הבעלים על הנתון ---------- */
  L('── דגלים חיים ──');
  try {
    var f = fsGet_(FS_FLAGS_DOC) || {};
    L('  gardenTasksFromFirestore   = ' + (f.gardenTasksFromFirestore === true));
    L('  gardenReportsFromFirestore = ' + (f.gardenReportsFromFirestore === true));
    L('  gardenWriteToFirestore     = ' + (f.gardenWriteToFirestore === true) +
      '   ← זה הדגל ש-gardenFsOwns_() בודק');
    L('  gardenWritesFromBrowser    = ' + (f.gardenWritesFromBrowser === true));
  } catch (e) { L('  ⚠️ לא נקראו: ' + e); }
  L('');

  /* ---------- 2. מוני המזהים — הדבר היחיד שאסור לו לרדת ---------- */
  L('── מוני מזהים ──');
  var ctN = null, crN = null;
  try {
    var ct = fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_TASK_COUNTER)) || {};
    var cr = fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_REPORT_COUNTER)) || {};
    ctN = ct.n; crN = cr.n;
    L('  counters/gardenTask   n = ' + ctN);
    L('  counters/gardenReport n = ' + crN);
  } catch (e) { L('  ⚠️ לא נקראו: ' + e); }

  /* ---------- 3. קריאת שלושת הטאבים ---------- */
  var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
  var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
  var lsh = ss.getSheetByName(GARDEN_LOG_SHEET);

  var tasks = [], reports = [], logRows = [];

  if (tsh && tsh.getLastRow() > 1) {
    var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
    for (var i = 1; i < tv.length; i++) {
      var raw = gardenCell_(tv[i][tc['סוג']]);
      tasks.push({
        row: i + 1,
        id: gardenCell_(tv[i][tc['מזהה']]),
        kind: GARDEN_KIND_LEGACY[raw] || raw,
        rawKind: raw,
        title: gardenCell_(tv[i][tc['כותרת']]),
        area: gardenCell_(tv[i][tc['אזור']]),
        stage: gardenCell_(tv[i][tc['שלב']]),
        flag: gardenCell_(tv[i][tc['דגל']]),
        closure: gardenCell_(tv[i][tc['סגירה']]),
        tpl: gardenCell_(tv[i][tc['מזהה תבנית']]),
        week: gardenCell_(tv[i][tc['שבוע']]),
        created: gardenCell_(tv[i][tc['נוצר בתאריך']])
      });
    }
  }

  if (rsh && rsh.getLastRow() > 1) {
    var rc = gardenCols_(rsh), rv = rsh.getDataRange().getValues();
    for (var j = 1; j < rv.length; j++) {
      reports.push({
        row: j + 1,
        id: gardenCell_(rv[j][rc['מזהה']]),
        taskId: gardenCell_(rv[j][rc['מזהה משימה']]),
        famId: gardenCell_(rv[j][rc['מזהה משפחה']]),
        title: gardenCell_(rv[j][rc['כותרת']]),
        merged: gardenCell_(rv[j][rc['אוחד לדיווח']]),
        photos: gardenCell_(rv[j][rc['תמונות']]),
        when: gardenCell_(rv[j][rc['תאריך דיווח']])
      });
    }
  }

  if (lsh && lsh.getLastRow() > 1) {
    var lc = gardenCols_(lsh), lv = lsh.getDataRange().getValues();
    for (var k = 1; k < lv.length; k++) {
      logRows.push({ row: k + 1, taskId: gardenCell_(lv[k][lc['מזהה משימה']]),
                     kind: gardenCell_(lv[k][lc['סוג רשומה']]) });
    }
  }

  L('');
  L('── גדלים בגיליון ──');
  L('  משימות: ' + tasks.length + ' שורות · דיווחים: ' + reports.length +
    ' שורות · יומן: ' + logRows.length + ' שורות');

  /* ---------- 4. מזהים כפולים והמזהה הגבוה ---------- */
  var seenT = {}, dupT = [], maxT = 0;
  tasks.forEach(function (t) {
    if (seenT[t.id]) dupT.push(t.id); else seenT[t.id] = 1;
    var n = parseInt(String(t.id).replace(/\D/g, ''), 10);
    if (!isNaN(n) && n > maxT) maxT = n;
  });
  var seenR = {}, dupR = [], maxR = 0;
  reports.forEach(function (r) {
    if (seenR[r.id]) dupR.push(r.id); else seenR[r.id] = 1;
    var m = parseInt(String(r.id).replace(/\D/g, ''), 10);
    if (!isNaN(m) && m > maxR) maxR = m;
  });
  L('  מזהה גבוה בגיליון: משימות=' + maxT + ' · דיווחים=' + maxR);
  L('  מזהים כפולים: משימות ' + gpIds_(dupT) + ' | דיווחים ' + gpIds_(dupR));
  if (ctN !== null && ctN < maxT) L('  🔴 המונה (' + ctN + ') נמוך מהמזהה הגבוה (' + maxT + ')!');
  if (crN !== null && crN < maxR) L('  🔴 מונה הדיווחים (' + crN + ') נמוך מהמזהה הגבוה (' + maxR + ')!');

  /* ---------- 5. סיווג המשימות לדליים ---------- */
  var repsByTask = {};
  reports.forEach(function (r) {
    if (!r.taskId) return;
    (repsByTask[r.taskId] = repsByTask[r.taskId] || []).push(r.id);
  });

  var buckets = {};
  function put(name, t) { (buckets[name] = buckets[name] || []).push(t); }

  tasks.forEach(function (t) {
    var closed = !!t.closure || t.stage === 'הושלם';
    var state = closed ? ('סגורה (' + (t.closure || 'הושלם') + ')') : 'פעילה';
    if (t.kind === GARDEN_KIND_ROUTINE) {
      if (closed) put('שגרה · ' + state, t);
      else if (t.week && t.week >= thisWeek) put('שגרה · פעילה · שבוע נוכחי או עתידי', t);
      else put('שגרה · פעילה · שבוע שעבר (' + (t.week || 'בלי שבוע') + ')', t);
    } else if (t.kind === GARDEN_KIND_REPORT) {
      var fromResident = !!(repsByTask[t.id] && repsByTask[t.id].length);
      var who = fromResident ? 'דיווח תושב' : 'תקלה שמנהל פתח';
      put(who + ' · ' + state, t);
    } else {
      put((t.kind || 'ללא סוג') + ' · ' + state, t);
    }
  });

  L('');
  L('── סיווג המשימות ──');
  Object.keys(buckets).sort().forEach(function (name) {
    var ids = buckets[name].map(function (t) { return t.id; });
    L('  [' + name + ']  ' + gpIds_(ids));
  });

  /* ---------- 6. יתומים ורפאים בגיליון ---------- */
  var taskExists = seenT;
  var orphanReports = reports.filter(function (r) {
    return !r.taskId || !taskExists[r.taskId];
  }).map(function (r) { return r.id + (r.taskId ? '→' + r.taskId : '→ריק'); });

  var logGhost = {}, logLive = {};
  logRows.forEach(function (lr) {
    if (lr.taskId && taskExists[lr.taskId]) logLive[lr.taskId] = (logLive[lr.taskId] || 0) + 1;
    else logGhost[lr.taskId || '(ריק)'] = (logGhost[lr.taskId || '(ריק)'] || 0) + 1;
  });
  var ghostKeys = Object.keys(logGhost);
  var ghostRows = 0;
  ghostKeys.forEach(function (k) { ghostRows += logGhost[k]; });

  L('');
  L('── יתומים בגיליון ──');
  L('  שורות דיווח בלי שורת משימה: ' + gpIds_(orphanReports));
  L('  שורות יומן של משימות שכבר אינן קיימות: ' + ghostRows + ' שורות, על ' +
    ghostKeys.length + ' מזהים — ' + gpIds_(ghostKeys));

  /* ---------- 7. Firestore מול הגיליון ---------- */
  L('');
  L('── Firestore מול הגיליון ──');
  try {
    var fsT = fsList_(FS_GARDEN_TASKS);
    var fsR = fsList_(FS_GARDEN_REPORTS);
    var ghostT = fsT.filter(function (d) { return !taskExists[d.id]; }).map(function (d) { return d.id; });
    var ghostR = fsR.filter(function (d) { return !seenR[d.id]; }).map(function (d) { return d.id; });
    var missT = tasks.filter(function (t) {
      return !fsT.some(function (d) { return d.id === t.id; });
    }).map(function (t) { return t.id; });
    var missR = reports.filter(function (r) {
      return !fsR.some(function (d) { return d.id === r.id; });
    }).map(function (r) { return r.id; });
    L('  gardenTasks: ' + fsT.length + ' מסמכים מול ' + tasks.length + ' שורות');
    L('    מסמכי רפאים (בלי שורה): ' + gpIds_(ghostT));
    L('    שורות בלי מסמך: ' + gpIds_(missT));
    L('  gardenReports: ' + fsR.length + ' מסמכים מול ' + reports.length + ' שורות');
    L('    מסמכי רפאים (בלי שורה): ' + gpIds_(ghostR));
    L('    שורות בלי מסמך: ' + gpIds_(missR));
  } catch (e) { L('  ⚠️ לא נקרא: ' + e); }

  /* ---------- 8. יומן Firestore ---------- */
  try {
    var fsL = fsList_('gardenLog');
    var byTask = {}, ghostL = 0;
    fsL.forEach(function (d) {
      var tid = String((d.data && d.data.taskId) || '').trim();
      byTask[tid] = (byTask[tid] || 0) + 1;
      if (!tid || !taskExists[tid]) ghostL++;
    });
    L('  gardenLog: ' + fsL.length + ' מסמכים, מהם ' + ghostL +
      ' שייכים למשימות שכבר אינן קיימות בגיליון');
    L('    (מגבלת הגיבוי המצטבר היא 6,000 מסמכים — ר\' ההערה ב-fsList_)');
  } catch (e) { L('  ⚠️ gardenLog לא נקרא: ' + e); }

  /* ---------- 9. תמונות ---------- */
  var withPhotos = reports.filter(function (r) { return !!r.photos; });
  var photoCount = 0;
  withPhotos.forEach(function (r) {
    photoCount += String(r.photos).split(',').filter(function (x) { return x.trim(); }).length;
  });
  L('');
  L('── תמונות ב-Drive ──');
  L('  ' + withPhotos.length + ' דיווחים נושאים סה"כ ' + photoCount + ' קבצים');

  /* ---------- 10. טאבי הגיבוי ---------- */
  L('');
  L('── טאבי הגיבוי (upsert בלבד — לא רואים מחיקות) ──');
  ['gardenTasks', 'gardenReports', 'gardenLog'].forEach(function (col) {
    for (var b = 0; b < BK_COLLECTIONS.length; b++) {
      if (BK_COLLECTIONS[b].collection !== col) continue;
      var bsh = ss.getSheetByName(BK_COLLECTIONS[b].tab);
      L('  ' + BK_COLLECTIONS[b].tab + ': ' +
        (bsh ? Math.max(bsh.getLastRow() - 1, 0) + ' שורות' : 'אין טאב'));
    }
  });

  L('');
  L('════════ סוף הריצה היבשה · לא נכתב כלום ════════');
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}
