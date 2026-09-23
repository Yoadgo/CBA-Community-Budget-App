/* ============================================================================
 *  סידור חכם — AI שמציע סידור לשבוע   (2026-09-23, בקשת יועד; סבב 2 — 24.9)
 * ----------------------------------------------------------------------------
 *  "תוסיף פונקציה של סידור AI, עם כמה אפשרויות — שים קודם את הנגררים /
 *   דחופים, פזר תקלות דיירים או שים אותן ראשונות... אחרי בחירת פריסטים אפשר
 *   להוסיף גם טקסט, ואז ה-AI עושה סידור. צריך לפתור את הערכת הזמנים."
 *  סבב 2: "שלאט לאט ה-AI ילמד את הסידורים שהוא מייצר, את החלוקת משימות
 *   ביניהם (העובדים) וישליך אותם גם בהערכות זמן."
 *
 *  שלושה שלבים בחלון אחד:
 *    1. **אפשרויות** — "כמו בשבוע שעבר" (בלי AI), שעות, ימים, עובדים,
 *       פריסטים, הערכות זמן (ניתנות לעריכה), טקסט חופשי.
 *    2. **ה-AI מסדר** — Gemini דרך Apps Script (`gardenAiSchedule`).
 *    3. **הצעה** — לפי ימים, עם העובדים. מוחקים מה שלא רוצים, ו"החל".
 *
 *  🔴 **פלט AI לעולם אינו נשמר לבד.** שום דבר לא נכתב עד "החל", ואחרי
 *     ההחלה יש "ביטול" בשורת הסידור.
 *  🔴 **ה-AI ממלא רק זמן פנוי ורק משימות שעוד לא בסידור** — לא מזיז בלוק.
 *  🔴 **לא סומכים על התשובה.** כל שיבוץ נבדק כאן מחדש — כולל חפיפה **לכל
 *     עובד בנפרד**. מה שנכשל → "לא נכנסו" עם סיבה.
 *  🔑 **"למידה" = רמזים מההיסטוריה**, לא אימון: לכל משימה חוזרת נשלחים
 *     היום, השעה והעובדים הרגילים שלה (gardenSlots.profile) — כלומר מה
 *     שהגנן **אישר** בסוף בשבועות קודמים, כולל כל תיקון שעשה להצעות.
 *  🔒 **פרטיות:** ל-Gemini עוברים כותרת/קטגוריה/אזור/מיקום במפה. לתקלת תושב —
 *     הקטגוריה בלבד. **עובדים נשלחים כ-W1/W2, בלי שמות.**
 *  🛟 **נפילה לאחור:** מסדר מקומי (אותם פריסטים והרגלים, בלי הטקסט החופשי).
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};
  var PREF_KEY = "cba.gs.ai";
  var TIMEOUT_MS = 45000;

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function defaults() {
    return { from: 7 * 60, to: 15 * 60, days: [0, 1, 2, 3, 4], urgent: true, faults: "first",
             group: true, buffer: false, workers: null, spread: true };
  }
  function loadPrefs() {
    var p = lsGet(PREF_KEY) || {}, d = defaults();
    Object.keys(d).forEach(function (k) { if (p[k] === undefined) p[k] = d[k]; });
    if (!(p.days instanceof Array)) p.days = d.days;
    return p;
  }

  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
    if (!m) return NaN;
    return (+m[1]) * 60 + (+m[2]);
  }
  function isFault(t) { return !!t && (!!t.repId || t.kind === "דיווח תושב"); }
  function shiftWeek(week, n) {
    var p = String(week).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2], 12);
    d.setDate(d.getDate() + 7 * n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  /* ==========================================================================
   *  זמן פנוי — שעות עבודה ∩ (06–23 פחות בלוקים קיימים **של אותו עובד**)
   *  פחות מה שכבר עבר. who=[] ⇒ כל בלוק תופס (כמו לפני שהיו עובדים).
   * ========================================================================== */
  function freeIntervals(A, ctx, date, from, to, who) {
    var today = A.todayDate(), lo = Math.max(A.D0(), from), hi = Math.min(A.D1(), to);
    if (date < today) return [];
    if (date === today) lo = Math.max(lo, Math.ceil(A.nowMin() / 15) * 15);
    if (hi - lo < 15) return [];
    var busy = A.busyOn(ctx, date, null, who || []).sort(function (a, b) { return a[0] - b[0]; });
    var out = [], cur = lo;
    busy.forEach(function (b) {
      if (b[1] <= cur) return;
      if (b[0] > cur) out.push([cur, Math.min(b[0], hi)]);
      cur = Math.max(cur, b[1]);
    });
    if (cur < hi) out.push([cur, hi]);
    return out.filter(function (r) { return r[1] - r[0] >= 15; });
  }
  function sumLen(iv) { return iv.reduce(function (s, r) { return s + (r[1] - r[0]); }, 0); }
  function ivText(A, iv) { return iv.map(function (r) { return A.hhmm(r[0]) + "-" + A.hhmm(r[1]); }); }

  /* מיקום במפה — אם יש. משמש לסדר "מסלול" בתוך יום (x,y של סיכת המשימה). */
  function xy(t) {
    var x = +t.x, y = +t.y;
    return isFinite(x) && isFinite(y) && (x || y) ? [Math.round(x), Math.round(y)] : null;
  }

  /* ==========================================================================
   *  המסדר המקומי — הנפילה לאחור. מיון לפי הפריסטים וההרגלים, ואז "הכי
   *  מוקדם שנכנס" אצל העובד המתאים. בלי הטקסט החופשי — את זה רק ה-AI קורא.
   * ========================================================================== */
  function planLocal(A, ctx, tasks, days, prefs, durs, workers) {
    var ws = workers && workers.length ? workers : [""];
    var free = {};
    ws.forEach(function (w) {
      free[w] = {};
      days.forEach(function (d) { free[w][d] = freeIntervals(A, ctx, d, prefs.from, prefs.to, w ? [w] : []); });
    });
    var prof = {};
    tasks.forEach(function (t) { prof[t.id] = CBA.gardenSlots.profile ? CBA.gardenSlots.profile(t, ctx.rows) : null; });
    var list = tasks.slice().sort(function (a, b) {
      if (prefs.faults === "first") { var f = (isFault(a) ? 0 : 1) - (isFault(b) ? 0 : 1); if (f) return f; }
      if (prefs.urgent) { var u = A.dragLevel(b, ctx) - A.dragLevel(a, ctx); if (u) return u; }
      if (prefs.group) {
        var ar = String(a.area || "").localeCompare(String(b.area || ""), "he"); if (ar) return ar;
        var pa = xy(a), pb = xy(b); if (pa && pb && (pa[0] + pa[1]) !== (pb[0] + pb[1])) return (pa[0] + pa[1]) - (pb[0] + pb[1]);
      }
      return String(a.category || "").localeCompare(String(b.category || ""), "he");
    });
    var load = {}; ws.forEach(function (w) { load[w] = 0; });
    /* ⚖️ 25.9 — פיזור על כל הימים שנבחרו (ברירת מחדל). קודם: "הכי מוקדם
       שנכנס" — ובשבוע עם שני עובדים הכול נדחס לראשון ושני. */
    var dayLoad = {}; days.forEach(function (d) { dayLoad[d] = 0; });
    function byLoad() { return days.slice().sort(function (a, b) { return dayLoad[a] - dayLoad[b] || (a < b ? -1 : 1); }); }
    var plan = [], unplaced = [], faultN = 0, gap = prefs.buffer ? 15 : 0, placedArea = {};
    list.forEach(function (t) {
      var dur = durs[t.id], p = prof[t.id];
      var early = (prefs.faults === "first" && isFault(t)) || (prefs.urgent && A.dragLevel(t, ctx) > 0);
      var order = prefs.spread !== false && !early ? byLoad() : days.slice();
      if (prefs.faults === "spread" && isFault(t)) {
        var k = faultN++ % days.length;
        order = days.slice(k).concat(days.slice(0, k));
      } else if (p && p.day != null) {
        /* ההרגל של המשימה (אותו יום בשבוע) קודם. */
        var usual = days.filter(function (d) { return new Date(d + "T12:00:00").getDay() === p.day; });
        order = usual.concat(days.filter(function (d) { return usual.indexOf(d) < 0; }));
      } else if (prefs.group && t.area && placedArea[t.area]) {
        var d0 = placedArea[t.area];
        order = [d0].concat(days.filter(function (d) { return d !== d0; }));
      }
      /* עובדים: מי שעושה את זה בדרך כלל, אחרת הפחות עמוס. */
      var wOrder = ws.slice().sort(function (a, b) { return load[a] - load[b]; });
      if (p && p.who.length) {
        var pref = wOrder.filter(function (w) { return p.who.indexOf(w) >= 0; });
        wOrder = pref.concat(wOrder.filter(function (w) { return pref.indexOf(w) < 0; }));
      }
      for (var i = 0; i < order.length; i++) {
        for (var wi = 0; wi < wOrder.length; wi++) {
          var w = wOrder[wi], iv = free[w][order[i]];
          for (var j = 0; j < iv.length; j++) {
            if (iv[j][1] - iv[j][0] >= dur) {
              var sl = { date: order[i], start: iv[j][0], dur: dur };
              if (w) sl.who = [w];
              plan.push({ id: t.id, slot: sl });
              iv[j][0] += dur + gap;
              if (iv[j][1] - iv[j][0] < 15) iv.splice(j, 1);
              if (t.area) placedArea[t.area] = order[i];
              load[w] += dur; dayLoad[order[i]] += dur;
              return;
            }
          }
        }
      }
      unplaced.push({ id: t.id, reason: "אין מספיק זמן פנוי בשעות העבודה" });
    });
    return { plan: plan, unplaced: unplaced, summary: "" };
  }
  /* לבדיקות */
  CBA.gardenScheduleAiTest = { rebalance: function () { return rebalance.apply(null, arguments); }, planLocal: function () { return planLocal.apply(null, arguments); } };

  /* ==========================================================================
   *  ⚖️ איזון — "לפזר על כל הימים" לא נשאר בגדר בקשה (25.9)
   * --------------------------------------------------------------------------
   *  נבדק חי: גם עם הוראה ויעד מספרי, Gemini השאיר לפעמים יום ריק. כאן —
   *  אחרי הבדיקה, לפני שהגנן רואה את ההצעה — מעבירים משימות מהיום העמוס
   *  ליום הריק, עד שההפרש ביניהם קטן משעה. בלי לגעת בנגררות/תקלות שהוגדרו
   *  "קודם", ורק לזמן פנוי אמיתי של אותו עובד בשעות העבודה.
   * ========================================================================== */
  function rebalance(A, ctx, items, days, prefs, byId) {
    if (prefs.spread === false || days.length < 2 || items.length < 2) return items;
    items = items.map(function (it) { var s = {}; for (var k in it.slot) s[k] = it.slot[k]; return { id: it.id, slot: s }; });
    function load(d) { return items.reduce(function (m, it) { return m + (it.slot.date === d ? it.slot.dur : 0); }, 0); }
    function early(it) {
      var t = byId[it.id];
      return !t || (prefs.faults === "first" && isFault(t)) || (prefs.urgent && A.dragLevel(t, ctx) > 0);
    }
    function others(it) { return items.filter(function (x) { return x !== it; }).map(function (x) { return x.slot; }); }
    function fit(it, d) {
      for (var a = prefs.from; a + it.slot.dur <= prefs.to; a += 15) {
        if (d === A.todayDate() && a < A.nowMin()) continue;
        if (A.isFree(ctx, d, a, it.slot.dur, null, it.slot.who || [], others(it))) return a;
      }
      return null;
    }
    var touched = {};
    for (var guard = 0; guard < 60; guard++) {
      var ls = days.map(function (d) { return { d: d, m: load(d) }; }).sort(function (a, b) { return a.m - b.m; });
      var moved = false;
      for (var hi = ls.length - 1; hi > 0 && !moved; hi--) {
        for (var lo = 0; lo < hi && !moved; lo++) {
          var gap = ls[hi].m - ls[lo].m;
          if (gap <= 60) continue;
          var cands = items.filter(function (it) { return it.slot.date === ls[hi].d && !early(it) && it.slot.dur < gap; })
            .sort(function (a, b) { return Math.abs(a.slot.dur - gap / 2) - Math.abs(b.slot.dur - gap / 2); });
          for (var c = 0; c < cands.length && !moved; c++) {
            var a0 = fit(cands[c], ls[lo].d);
            if (a0 != null) { touched[ls[hi].d] = touched[ls[lo].d] = 1; cands[c].slot.date = ls[lo].d; cands[c].slot.start = a0; moved = true; }
          }
        }
      }
      if (!moved) break;
    }
    /* ביום שממנו הוצאו משימות — לסגור את החורים שנוצרו (רק שם: ביום שלא
       נגענו בו, השעות הן מה שה-AI בחר, אולי בכוונה). */
    items.sort(function (a, b) { return a.slot.date.localeCompare(b.slot.date) || a.slot.start - b.slot.start; });
    items.forEach(function (it) {
      if (!touched[it.slot.date]) return;
      for (var a = prefs.from; a < it.slot.start; a += 15) {
        if (it.slot.date === A.todayDate() && a < A.nowMin()) continue;
        if (A.isFree(ctx, it.slot.date, a, it.slot.dur, null, it.slot.who || [], others(it))) { it.slot.start = a; break; }
      }
    });
    return items;
  }

  /* ==========================================================================
   *  בדיקת ההצעה — לא סומכים על ה-AI. who כבר במפתחות אמיתיים ("74:2").
   * ========================================================================== */
  function validate(A, ctx, raw, tasks, durs, crewKeys) {
    var ids = {}; tasks.forEach(function (t) { ids[String(t.id)] = t; });
    var dates = A.weekDates(ctx.week), today = A.todayDate(), nm = A.nowMin();
    var taken = [], accepted = [], unplaced = [], seen = {};
    crewKeys = crewKeys || [];
    function clash(date, a, b, who) {
      var busy = A.busyOn(ctx, date, null, who).concat(taken.filter(function (x) {
        return x.date === date && A.whoOverlap(who, x.who);
      }).map(function (x) { return x.r; }));
      return busy.some(function (r) { return a < r[1] && b > r[0]; });
    }
    (raw.plan || []).forEach(function (p) {
      var id = String(p && p.id || ""), t = ids[id];
      if (!t || seen[id]) return;
      var date = String(p.date || ""), start = parseHM(p.start);
      var dur = Math.round((+p.minutes || durs[id] || 60) / 15) * 15;
      start = Math.round(start / 15) * 15;
      var who = (p.who || []).map(String).filter(function (k, i, a) { return crewKeys.indexOf(k) >= 0 && a.indexOf(k) === i; });
      var why = "";
      if (dates.indexOf(date) < 0) why = "יום מחוץ לשבוע";
      else if (date < today || (date === today && start < nm)) why = "זמן שכבר עבר";
      else if (isNaN(start) || dur < 15 || start < A.D0() || start + dur > A.D1()) why = "שעה לא תקינה";
      else if (clash(date, start, start + dur, who)) why = "מתנגש במשימה אחרת" + (who.length ? " של אותו עובד" : "");
      seen[id] = 1;
      if (why) { unplaced.push({ id: id, reason: why }); return; }
      taken.push({ date: date, who: who, r: [start, start + dur] });
      var sl = { date: date, start: start, dur: dur };
      if (who.length) sl.who = who;
      accepted.push({ id: id, slot: sl });
    });
    (raw.unplaced || []).forEach(function (u) {
      var id = String(u && u.id || "");
      if (ids[id] && !seen[id]) { seen[id] = 1; unplaced.push({ id: id, reason: String(u.reason || "").slice(0, 120) || "לא נכנס" }); }
    });
    tasks.forEach(function (t) { if (!seen[String(t.id)]) unplaced.push({ id: String(t.id), reason: "לא שובצה בהצעה" }); });
    accepted.sort(function (a, b) { return a.slot.date.localeCompare(b.slot.date) || a.slot.start - b.slot.start; });
    return { plan: accepted, unplaced: unplaced, summary: String(raw.summary || "").slice(0, 600) };
  }

  /* ==========================================================================
   *  🔁 "כמו בשבוע שעבר" — בלי AI (24.9)
   * --------------------------------------------------------------------------
   *  לכל משימת שגרה שעוד לא בסידור: אם מופע של אותה תבנית היה בסידור של
   *  השבוע הקודם — אותו יום בשבוע, אותה שעה, אותו משך, אותם עובדים.
   *  התוצאה עוברת את אותה בדיקה ואת אותו מסך הצעה כמו ה-AI.
   * ========================================================================== */
  function lastWeekRaw(A, ctx, tasks) {
    var prevDates = A.weekDates(shiftWeek(ctx.week, -1)), cur = A.weekDates(ctx.week);
    var plan = [];
    tasks.forEach(function (t) {
      if (!t.templateId) return;
      var src = (ctx.rows || []).filter(function (r) {
        return r !== t && r.templateId === t.templateId && r.slot && prevDates.indexOf(r.slot.date) >= 0;
      })[0];
      if (!src) return;
      plan.push({ id: String(t.id), date: cur[prevDates.indexOf(src.slot.date)], start: A.hhmm(src.slot.start),
                  minutes: src.slot.dur, who: src.slot.who || [] });
    });
    return { plan: plan, unplaced: [], summary: "" };
  }

  /* ==========================================================================
   *  📌 כללים קבועים לסידור (25.9, יועד: "אופציה שיהיה למנהל וגנן אפשרות
   *  לשמור כללים קבועים לסידור האוטומטי")
   * --------------------------------------------------------------------------
   *  מסמך אחד — gardenMeta/scheduleRules { text, updatedAt, updatedBy } — כלל
   *  בשורה. משותף לגנן ולמנהל (hasPerm('גינון') בכללי Firestore), נשלח ל-AI
   *  בכל סידור. עד 12 כללים, עד 200 תווים לכל אחד.
   *  🔒 שמות עובדים בטקסט מוחלפים ב-W1/W2 **לפני** שהוא יוצא מהמכשיר
   *     (ר' codeNames) — גם כדי שהשם לא יגיע ל-Gemini וגם כדי שה-AI יבין
   *     על מי מדובר: הוא מכיר את העובדים רק כ-W1/W2.
   *  ⚠️ המסדר המקומי (נפילה לאחור) והאיזון האוטומטי לא קוראים טקסט — ולכן
   *     כשיש כללים או הערה, האיזון לא רץ (הוא עלול להזיז משימה לתוך יום
   *     שהכלל אסר), וההוראה ל-AI היא זו שמפזרת.
   * ========================================================================== */
  var MAX_RULES = 12, RULE_LEN = 200, rulesMem = null;
  function rulesList(text) {
    return String(text || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function loadRules(cb, force) {
    if (rulesMem && !force) return cb(rulesMem);
    if (!(CBA.fb && CBA.fb.readDoc)) return cb({ list: [], err: true });
    CBA.fb.readDoc("gardenMeta", "scheduleRules", function (e, d) {
      rulesMem = { list: e ? [] : rulesList(d && d.text), err: !!e };
      cb(rulesMem);
    });
  }
  function saveRules(list, cb) {
    var clean = list.map(function (x) { return String(x || "").replace(/\s+/g, " ").trim().slice(0, RULE_LEN); })
      .filter(Boolean).slice(0, MAX_RULES);
    if (!(CBA.fb && CBA.fb.mergeDoc)) return cb("no-fb");
    CBA.fb.mergeDoc("gardenMeta", "scheduleRules", {
      text: clean.join("\n"),
      updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date(),
      updatedBy: CBA.fb.uid ? CBA.fb.uid() : ""
    }, function (e) {
      if (!e) rulesMem = { list: clean, err: false };
      cb(e, clean);
    });
  }
  /* שם עובד → הקוד שלו בבקשה (W1). מי שלא עובד השבוע → "עובד שלא עובד השבוע". */
  function codeNames(text, crew, code) {
    var out = String(text || "");
    crew.slice().sort(function (a, b) { return String(b.name).length - String(a.name).length; }).forEach(function (c) {
      if (!c.name) return;
      var re = new RegExp(c.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      out = out.replace(re, code[c.key] || "עובד שלא עובד השבוע");
    });
    return out;
  }

  /* ==========================================================================
   *  הזרימה
   * ========================================================================== */
  function open(ctx, A) {
    var tasks = A.unscheduled(ctx);
    var esc = A.esc, F = A.Flow(ctx);
    if (!tasks.length) return A.toast("אין משימות שממתינות לסידור השבוע");
    var dates = A.weekDates(ctx.week), today = A.todayDate();
    var openDays = dates.map(function (d, i) { return d >= today ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!openDays.length) return A.toast("השבוע הזה כבר עבר — אין לאן לשבץ");

    var crew = A.crew(), crewKeys = crew.map(function (c) { return c.key; });
    var prefs = loadPrefs();
    if (!(prefs.workers instanceof Array)) prefs.workers = crewKeys.slice();
    prefs.workers = prefs.workers.filter(function (k) { return crewKeys.indexOf(k) >= 0; });
    if (crew.length && !prefs.workers.length) prefs.workers = crewKeys.slice();

    var ests = {}, durs = {};
    tasks.forEach(function (t) {
      ests[t.id] = CBA.gardenSlots.estimate(t, ctx.rows, A.defaultWho(ctx, t));
      durs[t.id] = ests[t.id].dur;
    });
    var note = "";
    var lastWeek = lastWeekRaw(A, ctx, tasks);

    function selDays() {
      return prefs.days.filter(function (i) { return openDays.indexOf(i) >= 0; })
        .sort(function (a, b) { return a - b; }).map(function (i) { return dates[i]; });
    }
    function selWorkers() { return crew.length ? prefs.workers.slice() : []; }
    function capacity() {
      var ws = selWorkers().length ? selWorkers() : [null];
      return selDays().reduce(function (s, d) {
        return s + ws.reduce(function (s2, w) { return s2 + sumLen(freeIntervals(A, ctx, d, prefs.from, prefs.to, w ? [w] : [])); }, 0);
      }, 0);
    }
    function need() { return tasks.reduce(function (s, t) { return s + durs[t.id]; }, 0); }
    function hOpts(sel) {
      var h = ""; for (var m = A.D0(); m <= A.D1(); m += 30) {
        h += '<option value="' + m + '"' + (m === sel ? " selected" : "") + '>' + A.hhmm(m) + '</option>';
      }
      return h;
    }
    function capHtml() {
      var c = capacity(), n = need();
      return '<div class="gw-ai-cap' + (n > c ? " is-over" : "") + '">' +
        '<span>נדרש <b>' + (n ? A.durText(n) : "0") + '</b></span>' +
        '<span>פנוי' + (selWorkers().length > 1 ? " לכל הצוות" : " בשעות העבודה") + ' <b>' + (c ? A.durText(c) : "0") + '</b></span>' +
        (n > c ? '<em>לא הכול ייכנס — ה-AI יגיד מה נשאר בחוץ</em>' : '') + '</div>';
    }
    function estRows() {
      return tasks.map(function (t) {
        var e = ests[t.id], changed = durs[t.id] !== e.dur;
        return '<div class="gw-ai-est" data-id="' + esc(t.id) + '">' +
          '<span class="gw-ai-est__t"><b>' + esc(t.title || t.category || "משימה") + '</b>' +
            '<small>' + esc([t.area, changed ? "שונה ידנית" : CBA.gardenSlots.estimateText(e)].filter(Boolean).join(" · ")) + '</small></span>' +
          '<span class="gw-step">' +
            '<button type="button" data-est="-15" aria-label="פחות רבע שעה">−</button>' +
            '<output>' + A.hhmm(durs[t.id]).replace(/^0/, "") + '</output>' +
            '<button type="button" data-est="15" aria-label="עוד רבע שעה">+</button>' +
          '</span></div>';
      }).join("");
    }

    /* ---------- שלב 1: אפשרויות ---------- */
    function optionsStep() {
      return ({
        title: "סידור חכם", sub: tasks.length + " משימות שעוד לא בסידור · ה-AI מציע, אתה מאשר",
        html:
          '<div class="gw-ai">' +
          (lastWeek.plan.length
            ? '<button type="button" class="gw-ai-last" data-f="last">' + '<span><b>כמו בשבוע שעבר</b><small>' +
              (lastWeek.plan.length === 1 ? "משימת שגרה אחת" : lastWeek.plan.length + " משימות שגרה") +
              ' — אותו יום, שעה ועובדים. בלי AI, מיידי.</small></span>' + '<i>›</i></button>'
            : '') +
          '<section class="gw-ai-rules"><h5>כללים קבועים <small>משותפים לגנן ולמנהל · ה-AI מקבל אותם בכל סידור</small></h5>' +
            '<div data-rules>' + rulesHtml() + '</div></section>' +
          '<section><h5>מתי עובדים</h5>' +
            '<div class="gw-ai-hours"><label>מ-<select data-p="from">' + hOpts(prefs.from) + '</select></label>' +
            '<label>עד<select data-p="to">' + hOpts(prefs.to) + '</select></label></div>' +
            '<div class="gw-ai-days">' + dates.map(function (d, i) {
              var past = openDays.indexOf(i) < 0;
              return '<button type="button" data-day="' + i + '" class="' + (prefs.days.indexOf(i) >= 0 && !past ? "on" : "") +
                (past ? " is-dis" : "") + '"' + (past ? " disabled" : "") + '>' + A.DAYS1[i] + '</button>';
            }).join("") + '</div>' +
            (crew.length ? '<h5 class="gw-ai-sub">מי עובד השבוע</h5><div class="gw-ai-crew">' + crew.map(function (c) {
              var on = prefs.workers.indexOf(c.key) >= 0;
              return '<button type="button" data-wk="' + esc(c.key) + '" class="gw-chip gw-chip--who' + (on ? " on" : "") + '" aria-pressed="' + on + '">' + esc(c.name) + '</button>';
            }).join("") + '</div>' : '') +
          '</section>' +
          '<section><h5>מה חשוב</h5>' +
            tog("urgent", "נגררות ודחופות קודם", "מה שכבר נדחה — לתחילת השבוע") +
            '<div class="gw-ai-row"><span><b>תקלות דיירים</b><small>מאחורי כל אחת יש תושב שמחכה</small></span>' +
              '<span class="gw-ai-seg">' +
                seg("faults", "first", "ראשונות") + seg("faults", "spread", "מפוזרות") + seg("faults", "normal", "רגיל") +
              '</span></div>' +
            tog("spread", "לפזר על כל הימים", "עומס דומה בכל יום שנבחר — במקום למלא קודם את תחילת השבוע") +
            tog("group", "לקבץ לפי אזור ומסלול", "פחות הליכה — לפי האזור והמיקום במפה") +
            tog("buffer", "רבע שעה בין משימות", "זמן מעבר וסידור ציוד") +
          '</section>' +
          '<details class="gw-ai-ests"><summary><span><b>הערכות זמן</b><small>לומדות מהפעמים הקודמות · אפשר לתקן</small></span>' +
            '<i data-need></i></summary><div class="gw-ai-estlist">' + estRows() + '</div></details>' +
          '<section><h5>משהו נוסף? <small>לא חובה</small></h5>' +
            '<textarea class="gd-inp" rows="3" maxlength="500" data-note placeholder="רק לשבוע הזה. למשל: ביום שלישי אני רק עד 12.">' +
            esc(note) + '</textarea>' +
            '<div class="gw-rules-act"><small>חל רק על הסידור הזה</small>' +
              '<button type="button" class="gw-linkbtn" data-f="note2rule"' + (note.trim() ? '' : ' disabled') + '>+ לשמור ככלל קבוע</button></div>' +
          '</section>' +
          '<div data-cap>' + capHtml() + '</div>' +
          '<button type="button" class="gd-cta gw-ai-go" data-f="go">' + A.SPARK + 'סדר לי</button>' +
          '</div>',
        mount: function (body) {
          /* ⚠️ המאזינים על .gw-ai (נבנה מחדש בכל הצגה) ולא על body — body הוא
             מכל החלון שנשאר בין השלבים, וחזרה לשלב הזה הכפילה מאזינים (מתג
             שנלחץ פעם אחת התהפך פעמיים). */
          var root = body.querySelector(".gw-ai") || body;
          function refresh() {
            body.querySelector("[data-cap]").innerHTML = capHtml();
            var ni = body.querySelector("[data-need]"); if (ni) ni.textContent = A.durText(need());
          }
          refresh();
          root.addEventListener("change", function (e) {
            var p = e.target.getAttribute("data-p");
            if (p) {
              prefs[p] = +e.target.value;
              if (prefs.to <= prefs.from) { prefs.to = Math.min(A.D1(), prefs.from + 60); body.querySelector('[data-p="to"]').value = prefs.to; }
              refresh();
            }
          });
          root.addEventListener("input", function (e) {
            if (!e.target.hasAttribute("data-note")) return;
            note = e.target.value;
            var nb = body.querySelector('[data-f="note2rule"]'); if (nb) nb.disabled = !note.trim();
          });
          /* הכללים נטענים ברקע — החלון לא מחכה להם. */
          loadRules(function () { var r = body.querySelector("[data-rules]"); if (r) r.innerHTML = rulesHtml(); });
          root.addEventListener("click", function (e) {
            var b = e.target.closest("button"); if (!b || b.disabled) return;
            if (b.dataset.day != null) {
              var i = +b.dataset.day, k = prefs.days.indexOf(i);
              if (k >= 0) prefs.days.splice(k, 1); else prefs.days.push(i);
              b.classList.toggle("on", k < 0); refresh();
            } else if (b.dataset.wk) {
              var j = prefs.workers.indexOf(b.dataset.wk);
              if (j >= 0) prefs.workers.splice(j, 1); else prefs.workers.push(b.dataset.wk);
              b.classList.toggle("on", j < 0); b.setAttribute("aria-pressed", String(j < 0)); refresh();
            } else if (b.dataset.tog) {
              prefs[b.dataset.tog] = !prefs[b.dataset.tog];
              b.classList.toggle("on", prefs[b.dataset.tog]); b.setAttribute("aria-pressed", String(prefs[b.dataset.tog]));
            } else if (b.dataset.seg) {
              prefs[b.dataset.seg] = b.dataset.v;
              Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.toggle("on", x === b); });
            } else if (b.dataset.est) {
              var row = b.closest(".gw-ai-est"), id = row.dataset.id;
              durs[id] = Math.max(15, Math.min(8 * 60, durs[id] + (+b.dataset.est)));
              row.querySelector("output").textContent = A.hhmm(durs[id]).replace(/^0/, "");
              var sm = row.querySelector("small"), t = A.byId(id) || {};
              sm.textContent = [t.area, durs[id] !== ests[id].dur ? "שונה ידנית" : CBA.gardenSlots.estimateText(ests[id])].filter(Boolean).join(" · ");
              refresh();
            }
          });
        },
        on: {
          go: function () { run(); },
          rules: function () { stepRules(); },
          note2rule: function () {
            var t = String(note || "").trim(); if (!t) return;
            var list = ((rulesMem && rulesMem.list) || []).concat([t]);
            if (list.length > MAX_RULES) return A.toast("אפשר עד " + MAX_RULES + " כללים קבועים");
            saveRules(list, function (e) {
              if (e) return A.toast("הכלל לא נשמר — " + (/permission/i.test(String(e.code || e)) ? "אין הרשאה" : "נסה שוב"), "error");
              note = "";
              var ta = document.querySelector(".gw-flow [data-note]"); if (ta) ta.value = "";
              var r = document.querySelector(".gw-flow [data-rules]"); if (r) r.innerHTML = rulesHtml();
              var nb = document.querySelector('.gw-flow [data-f="note2rule"]'); if (nb) nb.disabled = true;
              A.toast("נשמר ככלל קבוע");
            });
          },
          last: function () {
            stepProposal(validate(A, ctx, lastWeek, tasks, durs, crewKeys), "last", true);
          }
        }
      });
    }
    function stepOptions() { F.push(optionsStep()); }
    function rulesHtml() {
      if (!rulesMem) return '<p class="gw-rule-ex">טוען…</p>';
      var list = rulesMem.list || [];
      if (rulesMem.err && !list.length) return '<p class="gw-rule-ex">לא הצלחתי לטעון את הכללים הקבועים — הסידור ימשיך בלעדיהם.</p>';
      return (list.length
          ? '<ul class="gw-rules">' + list.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join("") + '</ul>'
          : '<p class="gw-rule-ex">עוד אין. למשל: "עומר לא עובד בשישי" · "השקיה רק לפני 10:00" · "כיסוח לפני השקיה באותו אזור".</p>') +
        '<div class="gw-rules-act"><span></span><button type="button" class="gw-linkbtn" data-f="rules">' +
          (list.length ? "עריכה" : "+ הוספת כלל") + '</button></div>';
    }
    /* ---------- עריכת הכללים הקבועים ---------- */
    function stepRules() {
      var list = ((rulesMem && rulesMem.list) || []).slice();
      if (!list.length) list.push("");
      function rows() {
        return list.map(function (r, i) {
          return '<div class="gw-rule"><input class="gd-inp" maxlength="' + RULE_LEN + '" data-ri="' + i + '" value="' + esc(r) + '" placeholder="כלל אחד בשורה">' +
            '<button type="button" data-f="rrm" data-i="' + i + '" aria-label="מחיקת הכלל">×</button></div>';
        }).join("");
      }
      function collect(body) {
        Array.prototype.forEach.call(body.querySelectorAll("[data-ri]"), function (inp) { list[+inp.dataset.ri] = inp.value; });
      }
      F.push({
        title: "כללים קבועים", sub: "משותפים לגנן ולמנהל · עד " + MAX_RULES + " כללים",
        html: '<p class="gw-rule-ex">מה שנכון תמיד, לא רק השבוע. אפשר לכתוב שמות — הם מוחלפים בקוד לפני שהכלל נשלח ל-AI.</p>' +
          '<div data-rl>' + rows() + '</div>' +
          '<button type="button" class="gw-linkbtn" data-f="radd">+ עוד כלל</button>' +
          '<button type="button" class="gd-cta" data-f="rsave" style="margin-top:12px">שמירה</button>',
        on: {
          radd: function (b) {
            var body = b.closest(".gw-flow"); collect(body);
            if (list.length >= MAX_RULES) return A.toast("אפשר עד " + MAX_RULES + " כללים");
            list.push(""); body.querySelector("[data-rl]").innerHTML = rows();
            var last = body.querySelector('[data-ri="' + (list.length - 1) + '"]'); if (last) last.focus();
          },
          rrm: function (b) {
            var body = b.closest(".gw-flow"); collect(body);
            list.splice(+b.dataset.i, 1); if (!list.length) list.push("");
            body.querySelector("[data-rl]").innerHTML = rows();
          },
          rsave: function (b) {
            var body = b.closest(".gw-flow"); collect(body);
            b.disabled = true;
            saveRules(list, function (e) {
              b.disabled = false;
              if (e) return A.toast("הכללים לא נשמרו — " + (/permission/i.test(String(e.code || e)) ? "אין הרשאה" : "נסה שוב"), "error");
              A.toast("הכללים נשמרו");
              stepOptionsBack();
            });
          }
        }
      });
    }
    function stepOptionsBack() {
      /* חזרה למסך האפשרויות — ⚠️ בנוי מחדש (F.replace) ולא "חזרה" רגילה: ה-HTML
         של שלב נבנה פעם אחת, ובחזרה רגילה המתגים והטקסט היו מוצגים כמו
         שהיו לפני היציאה, בעוד שההעדפות עצמן כבר השתנו. */
      var back = document.querySelector('.gw-flow [data-f="__back"]');
      if (back) back.click();
      F.replace(optionsStep());
    }
    function tog(k, label, sub) {
      return '<button type="button" class="gw-ai-row gw-ai-tog' + (prefs[k] ? " on" : "") + '" data-tog="' + k + '" aria-pressed="' + !!prefs[k] + '">' +
        '<span><b>' + label + '</b><small>' + sub + '</small></span><i class="gw-sw" aria-hidden="true"></i></button>';
    }
    function seg(k, v, label) {
      return '<button type="button" data-seg="' + k + '" data-v="' + v + '" class="' + (prefs[k] === v ? "on" : "") + '">' + label + '</button>';
    }

    /* ---------- שלב 2: ה-AI מסדר ---------- */
    function run() {
      var days = selDays();
      if (!days.length) return A.toast("צריך לבחור לפחות יום אחד");
      if (crew.length && !selWorkers().length) return A.toast("צריך לבחור לפחות עובד אחד");
      lsSet(PREF_KEY, prefs);
      F.push({
        title: "מסדר את השבוע…", sub: "זה לוקח כמה שניות",
        html: '<div class="gw-ai-wait">' + A.SPARK + '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'
      });
      /* 🔒 עובדים כ-W1/W2 — השמות לא יוצאים מהמכשיר. */
      var ws = selWorkers(), code = {}, back = {};
      ws.forEach(function (k, i) { code[k] = "W" + (i + 1); back["W" + (i + 1)] = k; });
      function wins(d, lo, hi, w) { return ivText(A, freeIntervals(A, ctx, d, lo, hi, w ? [w] : [])); }
      function extra(d, w) {
        return ivText(A, freeIntervals(A, ctx, d, A.D0(), A.D1(), w ? [w] : []).filter(function (r) {
          return r[1] <= prefs.from || r[0] >= prefs.to; }));
      }
      var payload = {
        week: ctx.week, today: A.todayDate(),
        prefs: { urgentFirst: !!prefs.urgent, faults: prefs.faults, groupByArea: !!prefs.group, bufferMinutes: prefs.buffer ? 15 : 0, spread: prefs.spread !== false },
        note: codeNames(String(note || "").slice(0, 500), crew, code),
        standing: ((rulesMem && rulesMem.list) || []).map(function (r) { return codeNames(r, crew, code); }).join("\n"),
        workers: ws.map(function (k) { return code[k]; }),
        days: days.map(function (d) {
          var i = dates.indexOf(d), o = { date: d, name: A.DAYS[i] };
          if (ws.length) o.byWorker = ws.map(function (k) { return { w: code[k], work: wins(d, prefs.from, prefs.to, k), extra: extra(d, k) }; });
          else { o.work = wins(d, prefs.from, prefs.to, null); o.extra = extra(d, null); }
          return o;
        }),
        tasks: tasks.map(function (t) {
          var p = CBA.gardenSlots.profile ? CBA.gardenSlots.profile(t, ctx.rows) : null, pos = xy(t);
          var o = {
            id: String(t.id),
            /* 🔒 תקלת תושב — הקטגוריה בלבד, לא הטקסט שהתושב כתב. */
            title: isFault(t) ? "תקלה — " + (t.category || "גינון") : String(t.title || t.category || "").slice(0, 80),
            category: String(t.category || "").slice(0, 40),
            area: String(t.area || "").slice(0, 60),
            fault: isFault(t),
            dragWeeks: (CBA.gardenLang && CBA.gardenLang.drag) ? (CBA.gardenLang.drag(t, ctx.thisWeek).weeks || 0) : 0,
            minutes: durs[t.id]
          };
          if (pos) { o.x = pos[0]; o.y = pos[1]; }
          if (p) {
            o.history = { times: p.n };
            if (p.day != null && p.day <= 5) o.history.usualDay = A.DAYS[p.day];
            if (p.start != null) o.history.usualStart = A.hhmm(p.start);
            var uw = p.who.filter(function (k) { return code[k]; }).map(function (k) { return code[k]; });
            if (uw.length) o.history.usualWorkers = uw;
          }
          return o;
        })
      };
      var done = false;
      function hasText() { return !!(String(note || "").trim() || ((rulesMem && rulesMem.list) || []).length); }
      function byIdMap() { var o = {}; tasks.forEach(function (t) { o[String(t.id)] = t; }); return o; }
      var timer = setTimeout(function () { finish(null, "ה-AI לא ענה בזמן"); }, TIMEOUT_MS);
      function finish(res, err) {
        if (done) return; done = true; clearTimeout(timer);
        /* החלון נסגר בזמן ההמתנה — לא פותחים אותו מחדש מעצמו. */
        if (!F.isOpen()) return A.toast("הסידור החכם בוטל");
        var mode = "ai", result;
        if (res && res.ok && res.plan) {
          res.plan.forEach(function (p) { p.who = (p.who || []).map(function (c) { return back[c]; }).filter(Boolean); });
          result = validate(A, ctx, res, tasks, durs, crewKeys);
          if (!hasText()) result.plan = rebalance(A, ctx, result.plan, days, prefs, byIdMap());
        } else {
          mode = "local";
          result = validate(A, ctx, (function (lp) {
            return { plan: lp.plan.map(function (p) {
                       return { id: p.id, date: p.slot.date, start: A.hhmm(p.slot.start), minutes: p.slot.dur, who: p.slot.who || [] }; }),
                     unplaced: lp.unplaced };
          })(planLocal(A, ctx, tasks, days, prefs, durs, ws)), tasks, durs, crewKeys);
          if (!hasText()) result.plan = rebalance(A, ctx, result.plan, days, prefs, byIdMap());
          result.why = err || (res && res.error) || "";
        }
        stepProposal(result, mode, false);
      }
      try {
        CBA.sheets.postRead("gardenAiSchedule", payload, function (res) { finish(res, res && res.error); });
      } catch (e) { finish(null, String(e)); }
    }

    /* ---------- שלב 3: ההצעה ---------- */
    function stepProposal(result, mode, push) {
      var plan = result.plan.slice(), removed = {};
      var step = {
        title: plan.length ? (mode === "last" ? "כמו בשבוע שעבר" : "ההצעה") : "לא נמצא סידור",
        sub: mode === "local" ? "סידור בסיסי — בלי AI" : mode === "last" ? "אותו יום, שעה ועובדים · אפשר להסיר לפני שמחילים"
                                                          : "סידור חכם · אפשר להסיר לפני שמחילים",
        html: '<div class="gw-ai-prop" data-prop></div>',
        mount: function (body) {
          var box = body.querySelector("[data-prop]");
          function draw() {
            var keep = plan.filter(function (p) { return !removed[p.id]; });
            var byDay = {};
            keep.forEach(function (p) { (byDay[p.slot.date] = byDay[p.slot.date] || []).push(p); });
            var h = "";
            if (mode === "local") {
              h += '<div class="gw-ai-note is-warn">ה-AI לא זמין כרגע' + (result.why ? " (" + esc(result.why) + ")" : "") +
                   ' — זה סידור בסיסי לפי האפשרויות וההרגלים. הטקסט החופשי לא נלקח בחשבון.</div>';
            } else if (result.summary) {
              h += '<div class="gw-ai-note">' + A.SPARK + '<span>' + esc(result.summary) + '</span></div>';
            }
            A.weekDates(ctx.week).forEach(function (d) {
              var xs = byDay[d]; if (!xs) return;
              var tot = xs.reduce(function (s, p) { return s + p.slot.dur; }, 0);
              h += '<div class="gw-ai-day"><h5>' + esc(A.dayLabel(d, ctx.week)) + ' <small>' + xs.length + ' · ' + A.durText(tot) + '</small></h5>' +
                xs.map(function (p) {
                  var t = A.byId(p.id) || {};
                  return '<div class="gw-ai-it"><span class="gw-ai-it__h">' + A.hhmm(p.slot.start) + '<small>' + A.hhmm(p.slot.start + p.slot.dur) + '</small></span>' +
                    '<span class="gw-ai-it__t"><b>' + esc(t.title || t.category || "משימה") + '</b><small>' +
                      esc([t.area, A.durText(p.slot.dur)].filter(Boolean).join(" · ")) + '</small>' +
                      A.whoTags(p.slot.who || [], false) + '</span>' +
                    (isFault(t) ? '<span class="gw-ai-fault" title="תקלת תושב"></span>' : '') +
                    '<button type="button" class="gw-ai-rm" data-rm="' + esc(p.id) + '" aria-label="הסרה מההצעה">×</button></div>';
                }).join("") + '</div>';
            });
            var out = result.unplaced.concat(plan.filter(function (p) { return removed[p.id]; })
              .map(function (p) { return { id: p.id, reason: "הוסרה מההצעה" }; }));
            if (mode === "last") out = out.filter(function (u) { return u.reason !== "לא שובצה בהצעה"; });
            if (out.length) {
              h += '<details class="gw-ai-out"' + (keep.length ? "" : " open") + '><summary>לא נכנסו <b>' + out.length + '</b></summary>' +
                out.map(function (u) {
                  var t = A.byId(u.id) || {};
                  return '<div><b>' + esc(t.title || t.category || u.id) + '</b><small>' + esc(u.reason) + '</small></div>';
                }).join("") + '</details>';
            }
            h += keep.length
              ? '<button type="button" class="gd-cta" data-apply>' + A.SPARK + 'החל ' + (keep.length === 1 ? "שיבוץ אחד" : keep.length + " שיבוצים") + '</button>'
              : '<p class="gw-note">אפשר לחזור לאפשרויות, להרחיב את שעות העבודה או להוסיף ימים.</p>';
            box.innerHTML = h;
          }
          draw();
          box.addEventListener("click", function (e) {
            var rm = e.target.closest("[data-rm]");
            if (rm) { removed[rm.dataset.rm] = 1; draw(); return; }
            if (e.target.closest("[data-apply]")) {
              var items = plan.filter(function (p) { return !removed[p.id]; });
              F.close();
              A.apply(ctx, items);
            }
          });
        }
      };
      if (push) F.push(step); else F.replace(step);
    }

    stepOptions();
  }

  CBA.gardenScheduleAi = {
    open: open,
    /* לבדיקות בלבד */
    _t: { planLocal: planLocal, validate: validate, freeIntervals: freeIntervals, parseHM: parseHM, lastWeekRaw: lastWeekRaw }
  };
})();
