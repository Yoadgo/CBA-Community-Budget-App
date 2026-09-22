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
 *  ניקוי מלא — "הכול הכול"   (הכרעת יועד, 22.9.2026)
 * ----------------------------------------------------------------------------
 *  🔑 **הכלל: לא נשאר כלום.** ארבעה טאבים בגיליון (שורות בלבד — הכותרות
 *     נשארות כדי לא לשבור את מבנה העמודות), ארבעה אוספים ב-Firestore,
 *     וכל תמונות הדיווחים בדרייב.
 *
 *  ✋ **מה לא נוגעים בו:** טאב "גינון — הגדרות" (7 אזורים + 7 קטגוריות)
 *     ו-`gardenMeta/lists` — מקור האמת היחיד לטופס הדיווח של התושב
 *     ולתבניות השגרה. בלעדיו אין לתושב מה לבחור.
 *
 *  🔴 **למה Firestore קודם והגיליון אחריו:** `gardenMirrorToSheet_` רצה
 *     כל שעה, קוראת מ-Firestore וכותבת לגיליון — והיא **רק מוסיפה**.
 *     ניקוי הגיליון לבדו היה מוחזר תוך שעה.
 *
 *  🔴 **למה אין כאן שער זהות כמו בגרסה הסלקטיבית:** אין רשימת שימור.
 *     "הכול" הוא הגדרה שאינה יכולה להתיישן, ולכן ריצה על נתונים
 *     שהשתנו מאז האישור אינה מסוכנת — היא פשוט מוחקת גם אותם.
 *     זה מה שהופך את הניקוי המלא לבטוח **יותר** מהסלקטיבי.
 * ========================================================================== */

var GP_TABS = null;   /* מאותחל בזמן ריצה — הקבועים חיים ב-Code.gs */
function gpTabs_() {
  return [GARDEN_TASKS_SHEET, GARDEN_REPORTS_SHEET, GARDEN_LOG_SHEET, GARDEN_ROUTINE_SHEET];
}
function gpCollections_() {
  return [FS_GARDEN_TASKS, FS_GARDEN_REPORTS, 'gardenLog', FS_GARDEN_PLAN];
}
/** טאבי הגיבוי של הגינון — גם הם מחזיקים מזהים ישנים. */
function gpBackupTabs_() {
  var out = [];
  var mine = gpCollections_();
  for (var i = 0; i < BK_COLLECTIONS.length; i++) {
    if (mine.indexOf(BK_COLLECTIONS[i].collection) >= 0) out.push(BK_COLLECTIONS[i].tab);
  }
  return out;
}

/** ============================================================================
 *  צעד 1 — ארכיון. עותק מוסתר של ארבעת הטאבים החיים, לפני שנוגעים בכלום.
 *  ⚠️ הארכיון מחזיק מזהים ישנים. הוא אינרטי — אף קוד אינו קורא אותו —
 *     אבל **אין להדביק אותו בחזרה אחרי איפוס המונים** בלי להרים אותם קודם.
 * ========================================================================== */
function gardenPurgeSnapshot() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM HH:mm');

  L('════════ ארכיון לפני ניקוי · ' + stamp + ' ════════');
  gpTabs_().forEach(function (name) {
    try {
      var sh = ss.getSheetByName(name);
      if (!sh) { L('⚠️ אין טאב ' + name); return; }
      var copy = sh.copyTo(ss);
      copy.setName('ארכיון ' + stamp + ' — ' + name.replace('גינון — ', ''));
      copy.hideSheet();
      L('  ' + copy.getName() + ' (' + Math.max(sh.getLastRow() - 1, 0) + ' שורות)');
    } catch (e) { L('⚠️ העתקת ' + name + ' נכשלה: ' + e); }
  });
  L('');
  L('⚠️ הארכיון מחזיק מזהים ישנים ואינו מנוקה ע"י הניקוי.');
  L('   הוא אינרטי — אף קוד אינו קורא אותו. אל תדביק אותו בחזרה אחרי');
  L('   איפוס המונים בלי להרים את המונים קודם.');
  L('════════ הצעד הבא: gardenPurgeWipe ════════');
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}

/** ============================================================================
 *  צעד 2 — הניקוי המלא.
 * ========================================================================== */
function gardenPurgeWipe() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  function done() { var t = lines.join('\n'); Logger.log(t); return t; }

  L('════════ ניקוי מלא של הגינון · ' + GP_VER + ' ════════');

  /* ---------- שער Firestore: בלי מחיקת מסמכים אין טעם להתחיל ---------- */
  try {
    fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_TASK_COUNTER));
  } catch (e) {
    L('🔴 עצירה — Firestore אינו זמין: ' + e);
    L('   המראה השעתית הייתה מחזירה לגיליון כל שורה שהיינו מוחקים.');
    return done();
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { L('🔴 עצירה — המערכת תפוסה. לנסות שוב.'); return done(); }

  try {
    /* ---------- אוספים את מזהי התמונות לפני שמוחקים את השורות ---------- */
    var photoCells = [];
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    if (rsh && rsh.getLastRow() > 1) {
      var rc = gardenCols_(rsh), rv = rsh.getDataRange().getValues();
      for (var j = 1; j < rv.length; j++) {
        var ph = gardenCell_(rv[j][rc['תמונות']]);
        if (ph) photoCells.push(ph);
      }
    }

    /* ---------- Firestore קודם ---------- */
    var errs = [];
    gpCollections_().forEach(function (col) {
      var n = 0;
      try {
        fsList_(col).forEach(function (d) {
          try { fsDelete_(fsDocPath_(col, d.id)); n++; }
          catch (e) { errs.push(col + '/' + d.id + ': ' + e); }
        });
        L('Firestore · ' + col + ': נמחקו ' + n + ' מסמכים');
      } catch (e) {
        errs.push(col + ' (רשימה): ' + e);
        L('Firestore · ' + col + ': 🔴 ' + e);
      }
    });
    if (errs.length) L('⚠️ שגיאות: ' + errs.slice(0, 6).join(' | '));

    /* ---------- תמונות בדרייב ---------- */
    var photoN = 0;
    photoCells.forEach(function (p) {
      photoN += String(p).split(',').filter(function (x) { return x.trim(); }).length;
      gardenDeletePhotos_(p);
    });
    L('דרייב: ' + photoN + ' קבצי תמונה הועברו לסל המיחזור');

    /* ---------- שורות הגיליון ----------
       ⚠️ `deleteRows(2, n)` בקריאה אחת ולא לולאה — אין כאן בכלל בעיית
          הזזת אינדקסים, וזה גם מהיר בסדר גודל. שורה 1 (הכותרות) נשארת. */
    gpTabs_().forEach(function (name) {
      try {
        var sh = ss.getSheetByName(name);
        if (!sh) { L('גיליון · ' + name + ': אין טאב'); return; }
        var n = sh.getLastRow() - 1;
        if (n > 0) sh.deleteRows(2, n);
        L('גיליון · ' + name + ': נמחקו ' + Math.max(n, 0) + ' שורות, נשארו ' +
          Math.max(sh.getLastRow() - 1, 0));
      } catch (e) { L('גיליון · ' + name + ': 🔴 ' + e); }
    });

    L('');
    L('════════ הניקוי הסתיים ════════');
    L('הצעד הבא: gardenPurgeBackupRun (מנקה את טאבי הגיבוי),');
    L('ואז gardenPurgeVerify — ורק אם הוא אומר "נקי", gardenPurgeResetCounters.');
    return done();
  } finally {
    lock.releaseLock();
  }
}

/** ============================================================================
 *  צעד 3 — גיבוי מלא. כותב את טאבי _נתוני_ מחדש מ-Firestore הריק,
 *  ובכך מנקה מהם את המזהים הישנים. בלעדיו הגיבוי המצטבר (upsert בלבד)
 *  לא היה מסיר אותם לעולם, ושחזור עתידי היה מחזיר את כל הזבל.
 * ========================================================================== */
function gardenPurgeBackupRun() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  L('════════ גיבוי מלא ════════');
  try {
    var bk = fsBackupAll_(ss);
    L('נקראו ' + bk.read + ' מסמכים');
    bk.tabs.forEach(function (t) { L('   ' + t.tab + ': ' + t.docs); });
    if (bk.errors.length) L('⚠️ ' + bk.errors.join(' | '));
    else L('✅ ללא שגיאות');
  } catch (e) { L('🔴 נכשל: ' + e); }
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}

/** ============================================================================
 *  צעד 4 — אימות. קריאה בלבד.
 *  סורק **כל** טאב בגיליון ו**כל** אוסף ב-Firestore, ומחזיר פסק דין אחד:
 *  האם מותר לאפס את המונים.
 *
 *  🔑 זה השער שיועד התנה בו את האיפוס (22.9): "בתנאי שממש כל הנתונים
 *     הישנים מתנקים ולא תהיה התנגשות".
 * ========================================================================== */
function gpAllCollections_() {
  /* כל האוספים שהקוד מכיר. מסמכים בודדים (appConfig/*, gardenMeta/lists)
     אינם אוספים ואינם נסרקים — אין בהם מזהי גינון. */
  return ['gardenTasks', 'gardenReports', 'gardenLog', 'gardenPlan',
          'services', 'gymStatus', 'gymCode', 'clubReservations',
          'tourSteps', 'tourSeen', 'homeCounts', 'budgetYears',
          'budgetTx', 'counters', 'pushSubscriptions', 'members'];
}

function gardenPurgeVerify() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  var blockers = [], archives = [];

  L('════════ אימות לפני איפוס מונים · ' + GP_VER + ' ════════');

  /* ---------- א. כל טאב בגיליון ---------- */
  L('');
  L('── כל הטאבים בגיליון ──');
  var liveTabs = gpTabs_(), bkTabs = gpBackupTabs_();
  ss.getSheets().forEach(function (sh) {
    var name = sh.getName();
    var rows = Math.max(sh.getLastRow() - 1, 0);
    var isLive = liveTabs.indexOf(name) >= 0;
    var isBk = bkTabs.indexOf(name) >= 0;
    /* טאב שאינו מוכר אך נושא עמודת "מזהה משימה" מחזיק מזהי גינון. */
    var hasCol = false;
    try {
      if (!isLive && !isBk && sh.getLastColumn() > 0) {
        var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        hasCol = hdr.some(function (h) { return String(h).trim() === 'מזהה משימה'; });
      }
    } catch (e) {}

    if (isLive || isBk) {
      L('  [' + (isLive ? 'חי' : 'גיבוי') + '] ' + name + ': ' + rows + ' שורות' +
        (rows > 0 ? '   🔴' : '   ✅'));
      if (rows > 0) blockers.push(name + ' (' + rows + ' שורות)');
    } else if (hasCol) {
      L('  [ארכיון] ' + name + ': ' + rows + ' שורות — מחזיק מזהי גינון');
      if (rows > 0) archives.push(name + ' (' + rows + ')');
    }
  });
  L('  (טאבים אחרים בגיליון אינם מחזיקים מזהי גינון ולא נספרו)');

  /* ---------- ב. כל אוסף ב-Firestore ---------- */
  L('');
  L('── כל האוספים ב-Firestore ──');
  var mine = gpCollections_();
  gpAllCollections_().forEach(function (col) {
    try {
      var n = fsList_(col).length;
      var isMine = mine.indexOf(col) >= 0;
      L('  ' + (isMine ? '[גינון] ' : '        ') + col + ': ' + n + ' מסמכים' +
        (isMine ? (n > 0 ? '   🔴' : '   ✅') : ''));
      if (isMine && n > 0) blockers.push('Firestore/' + col + ' (' + n + ' מסמכים)');
    } catch (e) {
      L('  ' + col + ': ⚠️ ' + e);
    }
  });

  /* ---------- ג. המונים ---------- */
  L('');
  L('── מונים ──');
  try {
    var ct = fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_TASK_COUNTER)) || {};
    var cr = fsGet_(fsDocPath_(FS_COUNTERS, GARDEN_REPORT_COUNTER)) || {};
    L('  counters/gardenTask   n = ' + ct.n);
    L('  counters/gardenReport n = ' + cr.n);
  } catch (e) { L('  ⚠️ ' + e); }

  /* ---------- ד. פסק דין ---------- */
  L('');
  if (blockers.length) {
    L('🔴 לא נקי. איפוס המונים חסום. מה שנשאר:');
    blockers.forEach(function (b) { L('   · ' + b); });
  } else {
    L('✅ נקי — אפס מזהי גינון חיים בגיליון וב-Firestore.');
    L('   מותר להריץ gardenPurgeResetCounters.');
  }
  if (archives.length) {
    L('');
    L('ℹ️ טאבי ארכיון (אינרטיים, אף קוד אינו קורא אותם): ' + archives.join(', '));
    L('   אינם חוסמים את האיפוס — אבל אין להדביק מהם בחזרה אחרי האיפוס.');
  }
  L('════════════════════════════════');
  var text = lines.join('\n');
  Logger.log(text);
  return text;
}

/** ============================================================================
 *  צעד 5 — איפוס המונים ל-0, כך שהמשימה הבאה תהיה #1.
 *
 *  🔴 **הפונקציה בודקת בעצמה ומסרבת אם לא נקי.** היא אינה סומכת על כך
 *     שמישהו הריץ `gardenPurgeVerify` קודם — אותן בדיקות רצות כאן שוב.
 *     מונה שיורד בזמן שקיים ולו מסמך אחד הוא הנזק היחיד שאי אפשר
 *     לתקן אחר כך: הדיווח הבא היה **דורס** מסמך קיים.
 *
 *  ⚠️ מסמך המונה נשאר קיים עם n=0 ולא נמחק — `nextId` בדפדפן זורק
 *     "no-counter" על מסמך חסר, ובכוונה: מונה חסר הוא שגיאה, לא
 *     התחלה מאפס.
 * ========================================================================== */
function gardenPurgeResetCounters() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lines = [];
  function L(s) { lines.push(String(s)); }
  function done() { var t = lines.join('\n'); Logger.log(t); return t; }

  L('════════ איפוס מונים ════════');

  var blockers = [];

  /* אותן בדיקות בדיוק כמו ב-gardenPurgeVerify — כאן הן תנאי, לא דוח. */
  var liveTabs = gpTabs_(), bkTabs = gpBackupTabs_();
  liveTabs.concat(bkTabs).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return;
    var rows = Math.max(sh.getLastRow() - 1, 0);
    if (rows > 0) blockers.push(name + ' (' + rows + ' שורות)');
  });

  try {
    gpCollections_().forEach(function (col) {
      var n = fsList_(col).length;
      if (n > 0) blockers.push('Firestore/' + col + ' (' + n + ' מסמכים)');
    });
  } catch (e) {
    L('🔴 עצירה — לא הצלחתי לקרוא את Firestore: ' + e);
    L('   בלי ספירה ודאית אסור להוריד מונה.');
    return done();
  }

  if (blockers.length) {
    L('🔴 עצירה — עדיין קיימים נתוני גינון:');
    blockers.forEach(function (b) { L('   · ' + b); });
    L('   המונים לא שונו. להריץ gardenPurgeWipe ו-gardenPurgeBackupRun ולנסות שוב.');
    return done();
  }

  L('✅ אפס מזהי גינון חיים. מאפס.');
  var pairs = [
    { id: GARDEN_TASK_COUNTER,   label: 'משימות' },
    { id: GARDEN_REPORT_COUNTER, label: 'דיווחים' }
  ];
  pairs.forEach(function (p) {
    try {
      var before = (fsGet_(fsDocPath_(FS_COUNTERS, p.id)) || {}).n;
      fsSet_(fsDocPath_(FS_COUNTERS, p.id), { n: 0, schema: 1, updatedAt: new Date() });
      var after = (fsGet_(fsDocPath_(FS_COUNTERS, p.id)) || {}).n;
      L('  ' + p.label + ': ' + before + ' → ' + after +
        (String(after) === '0' ? '   ✅' : '   🔴 לא נכתב!'));
    } catch (e) { L('  ' + p.label + ': 🔴 ' + e); }
  });

  L('');
  L('המשימה הבאה תקבל #1 והדיווח הבא #1.');
  L('⚠️ seedGardenCounters_ השעתית לוקחת max(מונה, גיליון) ולעולם אינה מורידה —');
  L('   עם שניהם על 0 היא תשאיר 0. אין צורך בפעולה נוספת.');
  return done();
}
