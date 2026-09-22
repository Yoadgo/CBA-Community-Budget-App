/* ============================================================================
 *  מסך "נתוני גינון" — המנוע   (22.9.2026, אפיון גרסה 3)
 * ----------------------------------------------------------------------------
 *  🔑 **חישוב טהור בדפדפן.** מקבל את המשימות ואת היומן כפי שנקראו
 *     מ-Firestore, ומחזיר את כל המספרים של המסך. אין כאן קריאת רשת,
 *     אין DOM ואין מצב — ולכן אפשר לבדוק כל הגדרה בנפרד
 *     (tools/test-garden-stats-2026-09-22.js).
 *
 *  🔴 למה לא בשרת: המסך הקודם חושב ב-Apps Script מטאבים בגיליון
 *     שהאפליקציה כבר לא כותבת אליהם מאז 21.9 — חלק מהמספרים שם קפאו.
 *     כאן המקור הוא הנתון החי עצמו, והמסך תמיד מעודכן. וגם בלי
 *     רצפת 1.5–3 השניות של קריאה ל-Apps Script.
 *
 *  ההגדרות המדויקות — אפיון סעיף 2. כל פונקציה כאן מצטטת את השורה שלה.
 *  "נגררה" מגיעה מ-CBA.gardenLang.drag — **אותה פונקציה** שמציירת את התג
 *  במסך המשימות, כדי שהכרטיס והמספר לעולם לא יסתרו זה את זה.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  var DAY = 86400000;
  var REPORT = "דיווח תושב", ROUTINE = "שגרה";
  /* סגירה שאינה "עבודה שלא נעשתה בזמן" — מופע שבוטל בהחלטה. */
  var CANCELLED = { "בוטל": 1, "לא רלוונטי": 1 };
  /* סדר החומרה של מצבי הנעץ — אשכול נצבע בצבע של החמורה שבו. */
  var SEVERITY = { l2: 5, l1: 4, appr: 3, wait: 2, plan: 1, done: 0 };

  function L() { return CBA.gardenLang; }

  /** כל צורת תאריך שמגיעה מהנתונים -> מילישניות (או NaN).
   *  Timestamp של Firestore, Date, מחרוזת ISO, מספר, או {seconds}. */
  function ms(v) {
    if (v === null || v === undefined || v === "") return NaN;
    if (typeof v === "number") return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v.toDate === "function") { try { return v.toDate().getTime(); } catch (e) { return NaN; } }
    if (typeof v === "object" && typeof v.seconds === "number") return v.seconds * 1000;
    var t = Date.parse(String(v));
    return isNaN(t) ? NaN : t;
  }
  function wkMs(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0).getTime() : NaN;
  }
  function shift(key, n) {
    var t = wkMs(key); if (isNaN(t)) return "";
    var d = new Date(t); d.setDate(d.getDate() + 7 * n);
    return L().weekOf(d);
  }
  function median(arr) {
    if (!arr.length) return null;
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var m = Math.floor(a.length / 2);
    var v = a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    return Math.round(v * 10) / 10;
  }
  function isFault(t) { return t.kind === REPORT; }
  function isRoutine(t) { return t.kind === ROUTINE; }
  /** מתי נפתחה. בלי createdAt (מסמך ותיק) — תחילת השבוע שלה, כדי שלא ייעלם מהספירה. */
  function openedMs(t) {
    var c = ms(t.createdAt);
    if (!isNaN(c)) return c;
    return wkMs(t.firstWeek || t.week);
  }
  /** מי פתח תקלה: תושב / מנהל / גנן. ר' isTeamFault ב-gardenTasks.js. */
  function sourceOf(t) {
    if (String(t.repId || "").trim()) return "res";
    return t.openedBy === "גנן" ? "gard" : "mgr";
  }

  /** "יצאה מהשבוע שלה" — גם אחרי שנסגרה. זה מה שהמגמה "נגררו בכל שבוע"
   *  ו"שגרה שנדחתה" סופרות: לא רק מה שנגרר **עכשיו**, אלא מה שנגרר אי פעם
   *  בתקופה, גם אם בוצע אחר כך. */
  function lateInfo(t, cur) {
    var week = String(t.week || "");
    if (!week) return null;
    var orig = String(t.firstWeek || "") || week;
    var closure = String(t.closure || "");
    if (closure === "אוחד") return null;
    var end;
    if (!closure && String(t.flag || "") === "ממתין לאישור") {
      /* הגנן סיים — מה שקובע הוא מתי סימן, לא כמה זמן המנהל טרם אישר. */
      var ua = ms(t.updatedAt);
      var uw = isNaN(ua) ? week : L().weekOf(new Date(ua));
      end = uw > week ? uw : week;
    } else if (closure) {
      var ca = ms(t.approvedAt);
      var cw = isNaN(ca) ? week : L().weekOf(new Date(ca));
      end = cw > week ? cw : week;
    } else {
      end = week > cur ? week : cur;
    }
    return { orig: orig, late: end > orig };
  }

  /** מצב הנעץ במפה. הצבע = המצב (אפיון סעיף 6). */
  function pinState(t, cur) {
    if (t.flag === "דורש בדיקה חוזרת") return "l2";
    if (t.closure) return "done";
    if (t.flag === "ממתין לאישור") return "appr";
    var d = L().drag(t, cur);
    if (d.level === 2) return "l2";
    if (d.level === 1) return "l1";
    return t.week ? "plan" : "wait";
  }

  /**
   * compute(tasks, log, opts)
   *  opts.weeks          4 | 8 | 12
   *  opts.now            Date (לבדיקות)
   *  opts.categories     סדר הקטגוריות מההגדרות (gardenMeta/lists)
   *  opts.requireApproval המתג "אישור מנהל" (gardenMeta/settings)
   *  opts.logOk          false = היומן לא נטען; המספרים שנשענים עליו יוצגו כ"—"
   */
  function compute(tasks, log, opts) {
    opts = opts || {};
    var W = [4, 8, 12].indexOf(+opts.weeks) >= 0 ? +opts.weeks : 8;
    var now = opts.now ? new Date(opts.now.getTime()) : new Date();
    var nowMs = now.getTime();
    var cur = L().weekOf(now);
    var start = shift(cur, -(W - 1));
    var startMs = wkMs(start);
    function inPeriod(t) { return !isNaN(t) && t >= startMs && t <= nowMs + DAY; }
    tasks = (tasks || []).filter(function (t) { return t && !t.pendingDelete; });
    log = (log || []).slice().sort(function (a, b) { return (ms(a.at) || 0) - (ms(b.at) || 0); });
    var logOk = opts.logOk !== false;

    var byId = {};
    tasks.forEach(function (t) { byId[String(t.id)] = t; });
    var logBy = {};
    log.forEach(function (r) {
      var k = String(r.taskId || "");
      (logBy[k] = logBy[k] || []).push(r);
    });

    var weeks = [];
    for (var i = W - 1; i >= 0; i--) weeks.push(shift(cur, -i));
    var wIdx = {};
    weeks.forEach(function (w, i) { wIdx[w] = i; });
    function zeros() { return weeks.map(function () { return 0; }); }

    /* ================= עכשיו ================= */

    /* ממתינות לאישורך — "משימות, תקלות או שגרה, שהגנן סימן כבוצעו
       ומחכות לאישור של המנהל. מתחת: כמה ימים מחכה הוותיקה שבהן." */
    var appr = tasks.filter(function (t) { return !t.closure && t.flag === "ממתין לאישור"; });
    function waitingSince(t) {
      var rows = logBy[String(t.id)] || [], best = NaN;
      rows.forEach(function (r) { if (r.kind === "ביצוע") best = ms(r.at); });
      if (isNaN(best)) best = ms(t.updatedAt);
      return best;
    }
    var apprItems = appr.map(function (t) {
      var s = waitingSince(t);
      return { id: String(t.id), days: isNaN(s) ? 0 : Math.max(0, Math.floor((nowMs - s) / DAY)) };
    }).sort(function (a, b) { return b.days - a.days; });

    /* תקלות פתוחות — "תקלה של תושב או של הצוות שעוד לא נסגרה. מתחת: כמה
       ממתינות להחלטה (עוד אין להן שבוע) וכמה כבר משובצות." */
    var openF = tasks.filter(function (t) { return isFault(t) && !t.closure; })
      .sort(function (a, b) { return (openedMs(a) || 0) - (openedMs(b) || 0); });
    var undecided = openF.filter(function (t) { return !t.week; }).length;

    /* נגררות — "משימה פתוחה, תקלה או שגרה, שיצאה מהשבוע המקורי שלה." */
    var dragged = [];
    tasks.forEach(function (t) {
      var d = L().drag(t, cur);
      if (d.level) dragged.push({ id: String(t.id), weeks: d.weeks, level: d.level, text: d.text,
        orig: String(t.firstWeek || t.week || ""), opened: openedMs(t) || 0 });
    });
    /* "ממוינות לפי כמה שבועות המשימה רחוקה מהשבוע המקורי שלה. בשוויון,
       הוותיקה עולה." */
    dragged.sort(function (a, b) {
      return (b.weeks - a.weeks) || (a.orig < b.orig ? -1 : a.orig > b.orig ? 1 : 0) || (a.opened - b.opened);
    });

    /* גיל התקלות הפתוחות — "נמדד מהרגע שהתקלה נפתחה, בלי קשר לשבוע שאליו
       שובצה." 0–3, 4–7, 8–14, 15 ומעלה. */
    /* ⚠️ טווח מספרים בתוך טקסט RTL מתהפך ("3–0"). \u2066…\u2069 מבודדים
       אותו כ-LTR — עובד גם בטקסט רגיל (כותרת גיליון), בלי HTML. */
    var LI = "\u2066", PD = "\u2069";
    var AGE = [{ label: LI + "0–3" + PD + " ימים", short: LI + "0–3" + PD, max: 3 },
               { label: LI + "4–7" + PD + " ימים", short: LI + "4–7" + PD, max: 7 },
               { label: LI + "8–14" + PD + " ימים", short: LI + "8–14" + PD, max: 14 },
               { label: "15 ימים ומעלה", short: LI + "15+" + PD, max: Infinity }];
    var age = AGE.map(function (a) { return { label: a.label, short: a.short, ids: [] }; });
    openF.forEach(function (t) {
      var o = openedMs(t);
      var days = isNaN(o) ? 0 : Math.max(0, Math.floor((nowMs - o) / DAY));
      for (var i = 0; i < AGE.length; i++) if (days <= AGE[i].max) { age[i].ids.push(String(t.id)); break; }
    });

    /* ================= בתקופה ================= */

    /* חזרו לטיפול — שני מספרים נפרדים.
       משוב תושב: "תקלה שנסגרה, ואחר כך התושב סימן 'הטיפול לא הושלם'".
       פתיחה מחדש: "תקלה שהמנהל פתח שוב אחרי שנסגרה".
       ⚠️ פתיחה מחדש נגזרת ממצב הסגירה לאורך היומן: "ביטול ביצוע" עם הערה
          נכתב רק על משימה סגורה (gardenFsTask), ו"החזרה" נספרת רק כשהסגירה
          האחרונה לפניה עוד בתוקף. היומן נטען עם מרווח לאחור לשם כך. */
    var fbItems = [], reopenItems = [], answered = [], seenFb = {};
    Object.keys(logBy).forEach(function (tid) {
      var t = byId[tid];
      var closed = false;
      logBy[tid].forEach(function (r) {
        var at = ms(r.at);
        var mgrRole = r.role !== "גנן" && r.role !== "תושב";
        if (r.kind === "סגירה") { closed = true; return; }
        if (r.kind === "ביטול ביצוע") {
          var wasClosed = !!String(r.note || "").trim() || closed;
          if (wasClosed && mgrRole && t && isFault(t) && inPeriod(at)) {
            reopenItems.push({ id: tid, at: at, who: r.who || "", role: r.role || "" });
          }
          closed = false; return;
        }
        if (r.kind === "החזרה") {
          if (closed && mgrRole && t && isFault(t) && inPeriod(at)) {
            reopenItems.push({ id: tid, at: at, who: r.who || "", role: r.role || "" });
          }
          closed = false; return;
        }
        if (r.kind === "משוב" && inPeriod(at)) {
          var neg = /^\s*שלילי/.test(String(r.note || ""));
          var note = String(r.note || "").replace(/^\s*(חיובי|שלילי)\s*(—\s*)?/, "");
          answered.push({ id: tid, at: at, negative: neg, note: note, who: r.who || "", role: r.role || "" });
          if (neg && !seenFb[tid]) {
            seenFb[tid] = 1;
            fbItems.push({ id: tid, at: at, who: r.who || "", role: r.role || "", note: note });
          }
        }
      });
    });
    reopenItems.sort(function (a, b) { return b.at - a.at; });
    fbItems.sort(function (a, b) { return b.at - a.at; });

    /* משוב שלילי — "מבין התושבים שענו על המשוב בתקופה, איזה אחוז סימנו
       'לא הושלם'. מי שלא ענה לא נספר." */
    var negN = answered.filter(function (a) { return a.negative; }).length;
    answered.sort(function (a, b) { return (b.negative - a.negative) || (b.at - a.at); });

    /* שגרה שנדחתה — "משימות מתוכנית העבודה שנדחו לפחות פעם אחת בתקופה, גם
       אם כבר בוצעו. בנפרד: כמה מופעים בוטלו." */
    var rDef = [], rCan = [], byTpl = {};
    tasks.forEach(function (t) {
      if (!isRoutine(t)) return;
      var li = lateInfo(t, cur);
      if (li && li.late && li.orig >= start && li.orig <= cur) {
        rDef.push(String(t.id));
        var k = String(t.templateId || t.title || "");
        var g = byTpl[k] = byTpl[k] || { title: t.title || t.category || "שגרה", ids: [] };
        g.ids.push(String(t.id));
      }
      if (CANCELLED[t.closure]) {
        var ca = ms(t.approvedAt);
        if (inPeriod(isNaN(ca) ? wkMs(t.week) : ca)) rCan.push(String(t.id));
      }
    });
    var tplList = Object.keys(byTpl).map(function (k) { return byTpl[k]; })
      .sort(function (a, b) { return b.ids.length - a.ids.length || a.title.localeCompare(b.title, "he"); });

    /* תקלות לפי סוג — "כל התקלות שנפתחו בתקופה, פתוחות וסגורות, מחולקות לפי
       קטגוריה. הסדר קבוע, זהה לסדר הקטגוריות בהגדרות." */
    var periodF = tasks.filter(function (t) { return isFault(t) && inPeriod(openedMs(t)); });
    var order = (opts.categories || []).slice();
    var catMap = {};
    order.forEach(function (c) { catMap[c] = []; });
    /* 🔴 23.9 — שמות ישנים ("מדשאות", "השקיה / ממטרות") נספרים תחת
       הקטגוריה המאוחדת כשהיא בהגדרות. בלי זה נוצר פס שביעי עם תקלה אחת
       (נצפה בצילום של יועד) — מסמך שלא עבר את מיגרציית 22.9. */
    var UNI = L().CAT_LAWN_WATER;
    var LEGACY = { "מדשאות": 1, "השקיה / ממטרות": 1 };
    function normCat(c) { return (UNI && LEGACY[c] && order.indexOf(UNI) >= 0) ? UNI : c; }
    periodF.forEach(function (t) {
      var c = normCat(String(t.category || "")) || "אחר";
      if (!catMap[c]) { catMap[c] = []; order.push(c); }
      catMap[c].push(String(t.id));
    });
    var byCat = order.map(function (c) {
      var k = L().catOf(c);
      return { name: c, key: k.key, ico: k.ico, ids: catMap[c] };
    });

    /* ================= המפה ================= */
    /* "על המפה מופיעות תקלות שסומן להן מיקום." פתוחות תמיד; סגורות רק
       כשהמתג דלוק, ורק אלה שנסגרו בתקופה. תקלה שנסגרה ותושב אמר שלא
       הושלמה — נשארת על המפה באדום: היא ממתינה להחלטה. */
    function hasLoc(t) {
      return t.x !== null && t.x !== undefined && t.x !== "" && t.y !== null && t.y !== undefined && t.y !== "" &&
             !isNaN(+t.x) && !isNaN(+t.y);
    }
    var pins = [];
    tasks.forEach(function (t) {
      if (!isFault(t) || !hasLoc(t)) return;
      var open = !t.closure || t.flag === "דורש בדיקה חוזרת";
      var closedIn = !open && t.closure !== "אוחד" && inPeriod(ms(t.approvedAt));
      if (!open && !closedIn) return;
      /* סמליל הנעץ לפי המשימה עצמה (דשא או טיפה לפי הכותרת — catOfTask, 23.9);
         הסינון לפי הקטגוריה המנורמלת, כמו בפס "לפי סוג". */
      var ct = L().catOfTask ? L().catOfTask(t) : L().catOf(t.category);
      pins.push({ id: String(t.id), x: +t.x, y: +t.y, state: pinState(t, cur),
                  cat: ct.key, ico: ct.ico, category: normCat(String(t.category || "")), closed: !open });
    });
    var openWithLoc = openF.filter(hasLoc).length;

    /* ================= מגמות — עמודה לשבוע ================= */
    var tr = { dragged: zeros(), schedArr: weeks.map(function () { return []; }),
               closeArr: weeks.map(function () { return []; }),
               adhDen: zeros(), adhNum: zeros(),
               src: weeks.map(function () { return { res: 0, mgr: 0, gard: 0 }; }) };
    tasks.forEach(function (t) {
      var li = lateInfo(t, cur);
      /* נגררו בכל שבוע — "כמה משימות יצאו מהשבוע שלהן בכל שבוע". */
      if (li && li.late && wIdx[li.orig] !== undefined) tr.dragged[wIdx[li.orig]]++;
      /* עמידה בתוכנית — "איזה אחוז ממשימות השגרה בוצעו בשבוע שבו תוכננו".
         מופע שבוטל בהחלטה אינו נספר לשום צד. */
      if (isRoutine(t) && li && wIdx[li.orig] !== undefined && !CANCELLED[t.closure]) {
        tr.adhDen[wIdx[li.orig]]++;
        if (t.closure === "בוצע") {
          var ca = ms(t.approvedAt);
          var cw = isNaN(ca) ? t.week : L().weekOf(new Date(ca));
          if (cw <= li.orig) tr.adhNum[wIdx[li.orig]]++;
        }
      }
      if (!isFault(t)) return;
      var o = openedMs(t);
      /* מי פתח את התקלות — תושב · מנהל · גנן, לפי שבוע הפתיחה. */
      if (!isNaN(o)) {
        var ow = wIdx[L().weekOf(new Date(o))];
        if (ow !== undefined && o >= startMs) tr.src[ow][sourceOf(t)]++;
      }
      /* זמן עד שיבוץ — מהפתיחה עד השיבוץ הראשון ביומן. */
      var rows = logBy[String(t.id)] || [];
      for (var j = 0; j < rows.length; j++) {
        if (rows[j].kind !== "שיבוץ") continue;
        var sa = ms(rows[j].at);
        if (!isNaN(sa) && !isNaN(o) && inPeriod(sa)) {
          var sw = wIdx[L().weekOf(new Date(sa))];
          if (sw !== undefined) tr.schedArr[sw].push(Math.max(0, (sa - o) / DAY));
        }
        break;
      }
      /* זמן עד סגירה — מהפתיחה עד הסגירה. */
      if (t.closure && t.closure !== "אוחד") {
        var cl = ms(t.approvedAt);
        if (!isNaN(cl) && !isNaN(o) && inPeriod(cl)) {
          var cwi = wIdx[L().weekOf(new Date(cl))];
          if (cwi !== undefined) tr.closeArr[cwi].push(Math.max(0, (cl - o) / DAY));
        }
      }
    });

    return {
      weeks: W, cur: cur, start: start, weekKeys: weeks, logOk: logOk,
      now: {
        approval: { on: opts.requireApproval !== false, count: apprItems.length,
                    oldestDays: apprItems.length ? apprItems[0].days : null, items: apprItems },
        open: { count: openF.length, undecided: undecided, planned: openF.length - undecided,
                ids: openF.map(function (t) { return String(t.id); }) },
        dragged: { count: dragged.length,
                   l1: dragged.filter(function (d) { return d.level === 1; }).length,
                   l2: dragged.filter(function (d) { return d.level === 2; }).length,
                   items: dragged },
        age: age,
        top: dragged.slice(0, 5)
      },
      period: {
        returned: { feedback: fbItems, reopen: reopenItems },
        negative: { answered: answered.length, negative: negN,
                    pct: answered.length ? Math.round(negN * 100 / answered.length) : null,
                    items: answered },
        routine: { deferred: rDef, cancelled: rCan, byTemplate: tplList },
        byCat: byCat, faultsInPeriod: periodF.length
      },
      map: { pins: pins, openTotal: openF.length, openWithLoc: openWithLoc },
      trends: {
        dragged: tr.dragged,
        sched: tr.schedArr.map(median),
        close: tr.closeArr.map(median),
        adherence: tr.adhDen.map(function (d, i) { return d ? Math.round(tr.adhNum[i] * 100 / d) : null; }),
        adhDen: tr.adhDen,
        src: tr.src
      }
    };
  }

  CBA.gardenStatsCalc = { compute: compute, ms: ms, pinState: pinState, SEVERITY: SEVERITY,
                          lookbackWeeks: 4 };
})();
