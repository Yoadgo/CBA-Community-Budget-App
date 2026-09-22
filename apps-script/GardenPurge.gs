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

/** ============================================================================
 *  פירוט — שורה לכל משימה ולכל דיווח, כדי להכריע מה זבל ומה אמיתי.
 *  🔴 קריאה בלבד, בדיוק כמו gardenPurgeDryRun.
 * ========================================================================== */
function gardenPurgeDetail() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  function pad(s, n) {
    s = String(s == null ? '' : s);
    while (s.length < n) s += ' ';
    return s.length > n ? s.substring(0, n) : s;
  }

  var thisWeek = gardenWeekKey_();
  L('════════ פירוט · ' + GP_VER + ' · השבוע ' + thisWeek + ' ════════');

  /* מפת repId מ-Firestore — זה השדה שהאפליקציה מסווגת לפיו
     "תקלה שמנהל פתח" (repId ריק) מול "דיווח תושב". */
  var fsRep = {};
  try {
    fsList_(FS_GARDEN_TASKS).forEach(function (d) {
      var v = (d.data && d.data.repId);
      fsRep[d.id] = (v === undefined) ? 'חסר' : (String(v).trim() || 'ריק');
    });
  } catch (e) { L('⚠️ Firestore לא נקרא: ' + e); }

  var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
  var repByTask = {};
  var repRows = [];
  if (rsh && rsh.getLastRow() > 1) {
    var rc = gardenCols_(rsh), rv = rsh.getDataRange().getValues();
    for (var j = 1; j < rv.length; j++) {
      var o = {
        id: gardenCell_(rv[j][rc['מזהה']]),
        taskId: gardenCell_(rv[j][rc['מזהה משימה']]),
        fam: gardenCell_(rv[j][rc['מזהה משפחה']]),
        who: gardenCell_(rv[j][rc['שם מדווח']]),
        when: gardenCell_(rv[j][rc['תאריך דיווח']]),
        title: gardenCell_(rv[j][rc['כותרת']]) || gardenCell_(rv[j][rc['תיאור']]),
        photos: gardenCell_(rv[j][rc['תמונות']])
      };
      repRows.push(o);
      if (o.taskId) repByTask[o.taskId] = o;
    }
  }

  var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
  L('');
  L('מזהה | סוג | מצב | שבוע | נוצר | ע"י | repId | כותרת');
  L('------------------------------------------------------------');
  if (tsh && tsh.getLastRow() > 1) {
    var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < tv.length; i++) rows.push(tv[i]);
    rows.sort(function (a, b) {
      return (parseInt(a[tc['מזהה']], 10) || 0) - (parseInt(b[tc['מזהה']], 10) || 0);
    });
    rows.forEach(function (r) {
      var id = gardenCell_(r[tc['מזהה']]);
      var raw = gardenCell_(r[tc['סוג']]);
      var kind = GARDEN_KIND_LEGACY[raw] || raw;
      var closure = gardenCell_(r[tc['סגירה']]);
      var stage = gardenCell_(r[tc['שלב']]);
      var st = closure ? closure : (stage === 'הושלם' ? 'הושלם' : 'פעילה');
      var rep = repByTask[id];
      L(pad(id, 4) + '| ' + pad(kind, 11) + '| ' + pad(st, 12) + '| ' +
        pad(gardenCell_(r[tc['שבוע']]), 11) + '| ' +
        pad(gardenCell_(r[tc['נוצר בתאריך']]), 11) + '| ' +
        pad(gardenCell_(r[tc['עודכן על ידי']]), 14) + '| ' +
        pad(fsRep[id] || '?', 6) + '| ' +
        gardenCell_(r[tc['כותרת']]).substring(0, 34) +
        (rep ? '   ←דיווח#' + rep.id + ' (' + rep.who + ')' : ''));
    });
  }

  L('');
  L('── הדיווחים (טאב גינון — דיווחים) ──');
  repRows.forEach(function (o) {
    L('דיווח#' + pad(o.id, 4) + '| משימה#' + pad(o.taskId, 4) + '| ' +
      pad(o.when, 11) + '| ' + pad(o.who, 16) + '| משפחה ' + pad(o.fam, 8) +
      '| ' + (o.photos ? 'תמונה' : '     ') + '| ' + o.title.substring(0, 34));
  });

  L('');
  L('════════ סוף · לא נכתב כלום ════════');
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}

/* ============================================================================
 *  הניקוי עצמו   (מאושר ע"י יועד, 22.9.2026)
 * ----------------------------------------------------------------------------
 *  🔑 **הכלל היחיד שמנהל את הכול: רשימת השימור.** כל מה שאינו ברשימה
 *     הזאת נמחק — בגיליון, ב-Firestore, ביומן ובדרייב. הגדרה חיובית
 *     ולא שלילית: אי אפשר "לשכוח" למחוק רפאים, ואי אפשר למחוק בטעות
 *     משהו שנמצא ברשימה.
 *
 *  🔴 **שער הזהות** — לפני מחיקה אחת, קבוצת המזהים בגיליון חייבת
 *     להיות **בדיוק** GP_KEEP ∪ GP_KILL. נכנסה משימה חדשה מאז הריצה
 *     היבשה? הפעולה נעצרת ולא מוחקת כלום. זה מה שמונע מהרשימה
 *     שאושרה ב-22.9 לפעול על נתונים אחרים.
 *
 *  🔴 **שער Firestore** — אם המונים אינם נקראים, עוצרים. מחיקת שורה
 *     בלי מחיקת המסמך היא בדיוק הבאג של 16.9 ("מחקתי שלוש פעמים
 *     והיא חזרה"), ומאז שהדגלים דלוקים אין יותר סחיפת יתומים שתתקן.
 *
 *  ⚠️ הסדר: Firestore קודם, גיליון אחריו. כישלון באמצע משאיר שורה
 *     בלי מסמך — מצב גלוי שהריצה היבשה מדווחת עליו — ולא מסמך בלי
 *     שורה, שהוא בדיוק הרפאים שאיש לא רואה.
 * ========================================================================== */

/** 11 המשימות שנשארות. זו הרשימה שקובעת. */
var GP_KEEP = ['60','61','62','63','64','65','66','67','68','69','70'];

/** 35 המזהים שאושרו למחיקה. משמש **לשער בלבד** — לא הוא שמוחק. */
var GP_KILL = ['4','5','6','7','8','9','12','15','16','17','18','19','20',
               '21','22','24','25','26','27','28','29','33','34','38','39',
               '40','41','43','44','45','53','55','59','73','74'];

function gpSet_(arr) { var m = {}; arr.forEach(function (x) { m[String(x)] = 1; }); return m; }

/** ============================================================================
 *  צעד 1 — צילום מצב. גיבוי מלא + עותק מתוארך של שלושת הטאבים החיים.
 *  זו נקודת השחזור, והיא חייבת לרוץ לפני הניקוי.
 * ========================================================================== */
function gardenPurgeSnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM-dd HH:mm');

  L('════════ צילום מצב לפני ניקוי · ' + stamp + ' ════════');

  /* גיבוי מלא — כותב את טאבי _נתוני_ מחדש מ-Firestore, כך שהגיבוי
     מייצג את המצב **הנוכחי** ולא מצב חלקי מצטבר. */
  try {
    var bk = fsBackupAll_(ss);
    L('גיבוי מלא: ' + bk.read + ' מסמכים');
    bk.tabs.forEach(function (t) { L('   ' + t.tab + ': ' + t.docs); });
    if (bk.errors.length) L('⚠️ שגיאות: ' + bk.errors.join(' | '));
  } catch (e) { L('🔴 הגיבוי נכשל: ' + e + ' — אין לרוץ הלאה.'); }

  /* עותק של הטאבים החיים. הגיבוי המלא שיירוץ **אחרי** הניקוי ידרוס
     את טאבי _נתוני_, ולכן צריך עותק שאינו תלוי בהם. */
  [GARDEN_TASKS_SHEET, GARDEN_REPORTS_SHEET, GARDEN_LOG_SHEET].forEach(function (name) {
    try {
      var sh = ss.getSheetByName(name);
      if (!sh) { L('⚠️ אין טאב ' + name); return; }
      var copy = sh.copyTo(ss);
      copy.setName('גיבוי ' + stamp + ' — ' + name.replace('גינון — ', ''));
      copy.hideSheet();
      L('עותק: ' + copy.getName() + ' (' + Math.max(sh.getLastRow() - 1, 0) + ' שורות)');
    } catch (e) { L('⚠️ העתקת ' + name + ' נכשלה: ' + e); }
  });

  L('════════ אפשר להריץ את gardenPurgeExecute ════════');
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}

/** ============================================================================
 *  צעד 2 — הניקוי.
 * ========================================================================== */
function gardenPurgeExecute() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  function done() { var t = lines.join('\n'); Logger.log(t); return t; }

  var keep = gpSet_(GP_KEEP), kill = gpSet_(GP_KILL);
  L('════════ ניקוי גינון · ' + GP_VER + ' ════════');

  /* ---------- שער Firestore ---------- */
  var ctBefore, crBefore;
  try {
    ctBefore = parseInt((fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_TASK_COUNTER)) || {}).n, 10);
    crBefore = parseInt((fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_REPORT_COUNTER)) || {}).n, 10);
  } catch (e) {
    L('🔴 עצירה — Firestore אינו זמין: ' + e);
    L('   בלי מחיקת המסמכים היינו יוצרים רפאים. לא נמחק כלום.');
    return done();
  }
  if (!(ctBefore > 0) || !(crBefore > 0)) {
    L('🔴 עצירה — המונים לא נקראו (משימות=' + ctBefore + ' דיווחים=' + crBefore + ').');
    return done();
  }
  L('מונים לפני: משימות=' + ctBefore + ' · דיווחים=' + crBefore);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { L('🔴 עצירה — המערכת תפוסה. לנסות שוב.'); return done(); }

  try {
    var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    var lsh = ss.getSheetByName(GARDEN_LOG_SHEET);
    if (!tsh || !rsh || !lsh) { L('🔴 עצירה — טאב גינון חסר.'); return done(); }

    /* ---------- שער הזהות ---------- */
    var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
    var present = {}, unexpected = [];
    for (var i = 1; i < tv.length; i++) {
      var id = gardenCell_(tv[i][tc['מזהה']]);
      present[id] = 1;
      if (!keep[id] && !kill[id]) unexpected.push(id);
    }
    var missing = GP_KEEP.filter(function (id) { return !present[id]; });
    if (unexpected.length) {
      L('🔴 עצירה — מזהים שאינם באף רשימה: ' + unexpected.join(', '));
      L('   הנתונים השתנו מאז האישור. להריץ gardenPurgeDryRun ולאשר מחדש.');
      return done();
    }
    if (missing.length) {
      L('🔴 עצירה — משימות שימור חסרות מהגיליון: ' + missing.join(', '));
      return done();
    }
    L('שער הזהות עבר: ' + (tv.length - 1) + ' משימות, מתוכן ' + GP_KEEP.length + ' לשימור.');

    /* ---------- מה נמחק בטאב הדיווחים, ואילו תמונות ---------- */
    var rc = gardenCols_(rsh), rv = rsh.getDataRange().getValues();
    var keepReps = {}, killRepRows = [], killRepIds = [], photoCells = [];
    for (var j = 1; j < rv.length; j++) {
      var rid = gardenCell_(rv[j][rc['מזהה']]);
      var rtid = gardenCell_(rv[j][rc['מזהה משימה']]);
      if (rtid && keep[rtid]) { keepReps[rid] = 1; continue; }
      killRepRows.push(j + 1);
      killRepIds.push(rid);
      var ph = gardenCell_(rv[j][rc['תמונות']]);
      if (ph) photoCells.push(ph);
    }
    L('דיווחים: ' + Object.keys(keepReps).length + ' לשימור, ' +
      killRepIds.length + ' למחיקה (' + killRepIds.join(', ') + ')');

    /* ---------- Firestore קודם ---------- */
    var fsT = 0, fsR = 0, fsL = 0, errs = [];
    try {
      fsList_(FS_GARDEN_TASKS).forEach(function (d) {
        if (keep[d.id]) return;
        try { fsDelete_(fsDocPath_(FS_GARDEN_TASKS, d.id)); fsT++; }
        catch (e) { errs.push('משימה ' + d.id + ': ' + e); }
      });
    } catch (e) { errs.push('רשימת משימות: ' + e); }
    try {
      fsList_(FS_GARDEN_REPORTS).forEach(function (d) {
        if (keepReps[d.id]) return;
        try { fsDelete_(fsDocPath_(FS_GARDEN_REPORTS, d.id)); fsR++; }
        catch (e) { errs.push('דיווח ' + d.id + ': ' + e); }
      });
    } catch (e) { errs.push('רשימת דיווחים: ' + e); }
    try {
      fsList_('gardenLog').forEach(function (d) {
        var tid = String((d.data && d.data.taskId) || '').trim();
        if (tid && keep[tid]) return;
        try { fsDelete_(fsDocPath_('gardenLog', d.id)); fsL++; }
        catch (e) { errs.push('יומן ' + d.id + ': ' + e); }
      });
    } catch (e) { errs.push('רשימת יומן: ' + e); }
    L('Firestore: נמחקו ' + fsT + ' משימות, ' + fsR + ' דיווחים, ' + fsL + ' שורות יומן');
    if (errs.length) L('⚠️ שגיאות Firestore: ' + errs.slice(0, 5).join(' | '));

    /* ---------- תמונות בדרייב ---------- */
    var photoN = 0;
    photoCells.forEach(function (p) {
      photoN += String(p).split(',').filter(function (x) { return x.trim(); }).length;
      gardenDeletePhotos_(p);
    });
    L('דרייב: ' + photoN + ' קבצי תמונה הועברו לסל המיחזור');

    /* ---------- שורות הגיליון, מלמטה למעלה ---------- */
    for (var k = killRepRows.length - 1; k >= 0; k--) rsh.deleteRow(killRepRows[k]);

    var killTaskRows = [];
    for (var i2 = 1; i2 < tv.length; i2++) {
      if (!keep[gardenCell_(tv[i2][tc['מזהה']])]) killTaskRows.push(i2 + 1);
    }
    for (var k2 = killTaskRows.length - 1; k2 >= 0; k2--) tsh.deleteRow(killTaskRows[k2]);
    L('גיליון: נמחקו ' + killTaskRows.length + ' שורות משימה ו-' +
      killRepRows.length + ' שורות דיווח');

    var lc = gardenCols_(lsh), lv = lsh.getDataRange().getValues();
    var killLogRows = [];
    for (var m = 1; m < lv.length; m++) {
      var ltid = gardenCell_(lv[m][lc['מזהה משימה']]);
      if (!ltid || !keep[ltid]) killLogRows.push(m + 1);
    }
    for (var k3 = killLogRows.length - 1; k3 >= 0; k3--) lsh.deleteRow(killLogRows[k3]);
    L('יומן בגיליון: נמחקו ' + killLogRows.length + ' שורות, נשארו ' +
      Math.max(lsh.getLastRow() - 1, 0));

    /* ---------- אימות המונים ---------- */
    var ctAfter = null, crAfter = null;
    try {
      ctAfter = parseInt((fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_TASK_COUNTER)) || {}).n, 10);
      crAfter = parseInt((fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_REPORT_COUNTER)) || {}).n, 10);
    } catch (e) { L('⚠️ המונים לא נקראו אחרי: ' + e); }
    L('מונים אחרי: משימות=' + ctAfter + ' · דיווחים=' + crAfter);
    if (ctAfter < ctBefore || crAfter < crBefore) {
      L('🔴🔴 המונה ירד! המשימה הבאה עלולה לקבל מזהה תפוס. לא להמשיך בלי לתקן.');
    } else {
      L('✅ המונים לא זזו אחורה — המשימה הבאה תקבל ' + (ctAfter + 1) +
        ', הדיווח הבא ' + (crAfter + 1) + '.');
    }

    L('════════ הניקוי הסתיים ════════');
    L('הצעד הבא: gardenPurgeBackupRun, ואז gardenPurgeDryRun לאימות.');
    return done();
  } finally {
    lock.releaseLock();
  }
}

/** ============================================================================
 *  צעד 3 — גיבוי מלא אחרי הניקוי. בלעדיו הזבל ממשיך לשבת בטאבי
 *  _נתוני_, והגיבוי המצטבר לעולם לא יסיר אותו (upsert בלבד).
 * ========================================================================== */
function gardenPurgeBackupRun() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  L('════════ גיבוי מלא אחרי הניקוי ════════');
  try {
    var bk = fsBackupAll_(ss);
    L('נקראו ' + bk.read + ' מסמכים');
    bk.tabs.forEach(function (t) { L('   ' + t.tab + ': ' + t.docs + ' מסמכים'); });
    if (bk.errors.length) L('⚠️ ' + bk.errors.join(' | '));
    else L('✅ ללא שגיאות');
  } catch (e) { L('🔴 נכשל: ' + e); }
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}
