/* ============================================================================
 *  סידור חכם — AI שמציע סידור לשבוע   (2026-09-23, בקשת יועד)
 * ----------------------------------------------------------------------------
 *  "תוסיף פונקציה של סידור AI, עם כמה אפשרויות — שים קודם את הנגררים /
 *   דחופים, פזר תקלות דיירים או שים אותן ראשונות... אחרי בחירת פריסטים אפשר
 *   להוסיף גם טקסט, ואז ה-AI עושה סידור. צריך לפתור את הערכת הזמנים."
 *
 *  שלושה שלבים בחלון אחד:
 *    1. **אפשרויות** — שעות עבודה, ימים, מה חשוב (פריסטים), הערכות זמן
 *       (ניתנות לעריכה), וטקסט חופשי.
 *    2. **ה-AI מסדר** — Gemini דרך Apps Script (`gardenAiSchedule`).
 *       המפתח נשאר ב-Script Properties; הדפדפן לא רואה אותו.
 *    3. **הצעה** — רשימה לפי ימים. מוחקים מה שלא רוצים, ו"החל".
 *
 *  🔴 **פלט AI לעולם אינו נשמר לבד** (כלל הליבה). שום דבר לא נכתב עד
 *     "החל", ואחרי ההחלה יש "ביטול" בשורת הסידור.
 *  🔴 **ה-AI ממלא רק זמן פנוי ורק משימות שעוד לא בסידור.** הוא לא מזיז
 *     בלוק קיים — מה שהגנן כבר קבע, קבוע.
 *  🔴 **לא סומכים על התשובה.** כל שיבוץ נבדק כאן מחדש (משימה קיימת, יום
 *     בשבוע ולא בעבר, זמן פנוי, אין חפיפה). מה שנכשל — עובר ל"לא נכנסו"
 *     עם הסיבה, ולא נבלע.
 *  🔒 **פרטיות:** ל-Gemini עוברים כותרת/קטגוריה/אזור בלבד. לתקלת תושב
 *     עוברת הקטגוריה ("תקלה — השקיה") ולא הכותרת החופשית שהתושב כתב,
 *     ולעולם לא שם, תיאור או תמונה.
 *  🛟 **נפילה לאחור:** אם ה-AI לא זמין — מסדר מקומי פשוט (אותם פריסטים,
 *     בלי הטקסט החופשי), ומסומן ככזה במפורש.
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};
  var PREF_KEY = "cba.gs.ai";
  var TIMEOUT_MS = 45000;

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function defaults() {
    return { from: 7 * 60, to: 15 * 60, days: [0, 1, 2, 3, 4], urgent: true, faults: "first", group: true, buffer: false };
  }
  function loadPrefs() {
    var p = lsGet(PREF_KEY) || {}, d = defaults();
    Object.keys(d).forEach(function (k) { if (p[k] == null) p[k] = d[k]; });
    if (!(p.days instanceof Array)) p.days = d.days;
    return p;
  }

  function parseHM(s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim());
    if (!m) return NaN;
    return (+m[1]) * 60 + (+m[2]);
  }
  function isFault(t) { return !!t && (!!t.repId || t.kind === "דיווח תושב"); }

  /* ==========================================================================
   *  זמן פנוי — שעות עבודה ∩ (06–23 פחות בלוקים קיימים) פחות מה שכבר עבר
   * ========================================================================== */
  function freeIntervals(A, ctx, date, from, to) {
    var today = A.todayDate(), lo = Math.max(A.D0(), from), hi = Math.min(A.D1(), to);
    if (date < today) return [];
    if (date === today) lo = Math.max(lo, Math.ceil(A.nowMin() / 15) * 15);
    if (hi - lo < 15) return [];
    var busy = A.busyOn(ctx, date).sort(function (a, b) { return a[0] - b[0]; });
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

  /* ==========================================================================
   *  המסדר המקומי — הנפילה לאחור. פשוט בכוונה: מיון לפי הפריסטים, ואז
   *  "הכי מוקדם שנכנס". בלי הטקסט החופשי — את זה רק ה-AI יודע לקרוא.
   * ========================================================================== */
  function planLocal(A, ctx, tasks, days, prefs, durs) {
    var free = {};
    days.forEach(function (d) { free[d] = freeIntervals(A, ctx, d, prefs.from, prefs.to); });
    var list = tasks.slice().sort(function (a, b) {
      if (prefs.faults === "first") { var f = (isFault(a) ? 0 : 1) - (isFault(b) ? 0 : 1); if (f) return f; }
      if (prefs.urgent) { var u = A.dragLevel(b, ctx) - A.dragLevel(a, ctx); if (u) return u; }
      if (prefs.group) { var ar = String(a.area || "").localeCompare(String(b.area || ""), "he"); if (ar) return ar; }
      return String(a.category || "").localeCompare(String(b.category || ""), "he");
    });
    var plan = [], unplaced = [], faultN = 0, gap = prefs.buffer ? 15 : 0, placedArea = {};
    list.forEach(function (t) {
      var dur = durs[t.id];
      var order = days.slice();
      if (prefs.faults === "spread" && isFault(t)) {
        var k = faultN++ % days.length;
        order = days.slice(k).concat(days.slice(0, k));
      } else if (prefs.group && t.area && placedArea[t.area]) {
        var d0 = placedArea[t.area];
        order = [d0].concat(days.filter(function (d) { return d !== d0; }));
      }
      for (var i = 0; i < order.length; i++) {
        var iv = free[order[i]];
        for (var j = 0; j < iv.length; j++) {
          if (iv[j][1] - iv[j][0] >= dur) {
            plan.push({ id: t.id, slot: { date: order[i], start: iv[j][0], dur: dur } });
            iv[j][0] += dur + gap;
            if (iv[j][1] - iv[j][0] < 15) iv.splice(j, 1);
            if (t.area) placedArea[t.area] = order[i];
            return;
          }
        }
      }
      unplaced.push({ id: t.id, reason: "אין מספיק זמן פנוי בשעות העבודה" });
    });
    return { plan: plan, unplaced: unplaced, summary: "" };
  }

  /* ==========================================================================
   *  בדיקת ההצעה — לא סומכים על ה-AI
   * ========================================================================== */
  function validate(A, ctx, raw, tasks, durs) {
    var ids = {}; tasks.forEach(function (t) { ids[String(t.id)] = t; });
    var dates = A.weekDates(ctx.week), today = A.todayDate(), nm = A.nowMin();
    var taken = {}, accepted = [], unplaced = [], seen = {};
    function clash(date, a, b) {
      var busy = A.busyOn(ctx, date).concat(taken[date] || []);
      return busy.some(function (r) { return a < r[1] && b > r[0]; });
    }
    (raw.plan || []).forEach(function (p) {
      var id = String(p && p.id || ""), t = ids[id];
      if (!t || seen[id]) return;
      var date = String(p.date || ""), start = parseHM(p.start);
      var dur = Math.round((+p.minutes || durs[id] || 60) / 15) * 15;
      start = Math.round(start / 15) * 15;
      var why = "";
      if (dates.indexOf(date) < 0) why = "יום מחוץ לשבוע";
      else if (date < today || (date === today && start < nm)) why = "זמן שכבר עבר";
      else if (isNaN(start) || dur < 15 || start < A.D0() || start + dur > A.D1()) why = "שעה לא תקינה";
      else if (clash(date, start, start + dur)) why = "מתנגש במשימה אחרת";
      seen[id] = 1;
      if (why) { unplaced.push({ id: id, reason: why }); return; }
      (taken[date] = taken[date] || []).push([start, start + dur]);
      accepted.push({ id: id, slot: { date: date, start: start, dur: dur } });
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
   *  הזרימה
   * ========================================================================== */
  function open(ctx, A) {
    var tasks = A.unscheduled(ctx);
    var esc = A.esc, F = A.Flow(ctx);
    if (!tasks.length) return A.toast("אין משימות שממתינות לסידור השבוע");
    var dates = A.weekDates(ctx.week), today = A.todayDate();
    var openDays = dates.map(function (d, i) { return d >= today ? i : -1; }).filter(function (i) { return i >= 0; });
    if (!openDays.length) return A.toast("השבוע הזה כבר עבר — אין לאן לשבץ");

    var prefs = loadPrefs();
    var ests = {}, durs = {};
    tasks.forEach(function (t) {
      ests[t.id] = CBA.gardenSlots.estimate(t, ctx.rows);
      durs[t.id] = ests[t.id].dur;
    });
    var note = "";

    function selDays() {
      return prefs.days.filter(function (i) { return openDays.indexOf(i) >= 0; })
        .sort(function (a, b) { return a - b; }).map(function (i) { return dates[i]; });
    }
    function capacity() {
      return selDays().reduce(function (s, d) { return s + sumLen(freeIntervals(A, ctx, d, prefs.from, prefs.to)); }, 0);
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
        '<span>פנוי בשעות העבודה <b>' + (c ? A.durText(c) : "0") + '</b></span>' +
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
    function stepOptions() {
      F.push({
        title: "סידור חכם", sub: tasks.length + " משימות שעוד לא בסידור · ה-AI מציע, אתה מאשר",
        html:
          '<div class="gw-ai">' +
          '<section><h5>מתי עובדים</h5>' +
            '<div class="gw-ai-hours"><label>מ-<select data-p="from">' + hOpts(prefs.from) + '</select></label>' +
            '<label>עד<select data-p="to">' + hOpts(prefs.to) + '</select></label></div>' +
            '<div class="gw-ai-days">' + dates.map(function (d, i) {
              var past = openDays.indexOf(i) < 0;
              return '<button type="button" data-day="' + i + '" class="' + (prefs.days.indexOf(i) >= 0 && !past ? "on" : "") +
                (past ? " is-dis" : "") + '"' + (past ? " disabled" : "") + '>' + A.DAYS1[i] + '</button>';
            }).join("") + '</div></section>' +
          '<section><h5>מה חשוב</h5>' +
            tog("urgent", "נגררות ודחופות קודם", "מה שכבר נדחה — לתחילת השבוע") +
            '<div class="gw-ai-row"><span><b>תקלות דיירים</b><small>מאחורי כל אחת יש תושב שמחכה</small></span>' +
              '<span class="gw-ai-seg">' +
                seg("faults", "first", "ראשונות") + seg("faults", "spread", "מפוזרות") + seg("faults", "normal", "רגיל") +
              '</span></div>' +
            tog("group", "לקבץ לפי אזור", "פחות הליכה בין קצוות השיכון") +
            tog("buffer", "רבע שעה בין משימות", "זמן מעבר וסידור ציוד") +
          '</section>' +
          '<details class="gw-ai-ests"><summary><span><b>הערכות זמן</b><small>לומדות מהפעמים הקודמות · אפשר לתקן</small></span>' +
            '<i data-need></i></summary><div class="gw-ai-estlist">' + estRows() + '</div></details>' +
          '<section><h5>משהו נוסף? <small>לא חובה</small></h5>' +
            '<textarea class="gd-inp" rows="3" maxlength="500" data-note placeholder="למשל: ביום שלישי אני רק עד 12. כיסוח לפני השקיה. את הערוגות ביום חמישי.">' +
            esc(note) + '</textarea></section>' +
          '<div data-cap>' + capHtml() + '</div>' +
          '<button type="button" class="gd-cta gw-ai-go" data-f="go">' + A.SPARK + 'סדר לי</button>' +
          '</div>',
        mount: function (body) {
          function refresh() {
            body.querySelector("[data-cap]").innerHTML = capHtml();
            var ni = body.querySelector("[data-need]"); if (ni) ni.textContent = A.durText(need());
          }
          refresh();
          body.addEventListener("change", function (e) {
            var p = e.target.getAttribute("data-p");
            if (p) {
              prefs[p] = +e.target.value;
              if (prefs.to <= prefs.from) { prefs.to = Math.min(A.D1(), prefs.from + 60); body.querySelector('[data-p="to"]').value = prefs.to; }
              refresh();
            }
          });
          body.addEventListener("input", function (e) { if (e.target.hasAttribute("data-note")) note = e.target.value; });
          body.addEventListener("click", function (e) {
            var b = e.target.closest("button"); if (!b || b.disabled) return;
            if (b.dataset.day != null) {
              var i = +b.dataset.day, k = prefs.days.indexOf(i);
              if (k >= 0) prefs.days.splice(k, 1); else prefs.days.push(i);
              b.classList.toggle("on", k < 0); refresh();
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
        on: { go: function () { run(); } }
      });
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
      lsSet(PREF_KEY, prefs);
      F.push({
        title: "מסדר את השבוע…", sub: "זה לוקח כמה שניות",
        html: '<div class="gw-ai-wait">' + A.SPARK + '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>'
      });
      var payload = {
        week: ctx.week, today: A.todayDate(),
        prefs: { urgentFirst: !!prefs.urgent, faults: prefs.faults, groupByArea: !!prefs.group, bufferMinutes: prefs.buffer ? 15 : 0 },
        note: String(note || "").slice(0, 500),
        days: days.map(function (d) {
          var i = dates.indexOf(d);
          return { date: d, name: A.DAYS[i],
                   work: ivText(A, freeIntervals(A, ctx, d, prefs.from, prefs.to)),
                   extra: ivText(A, freeIntervals(A, ctx, d, A.D0(), A.D1()).filter(function (r) {
                     return r[1] <= prefs.from || r[0] >= prefs.to; })) };
        }),
        tasks: tasks.map(function (t) {
          return {
            id: String(t.id),
            /* 🔒 תקלת תושב — הקטגוריה בלבד, לא הטקסט שהתושב כתב. */
            title: isFault(t) ? "תקלה — " + (t.category || "גינון") : String(t.title || t.category || "").slice(0, 80),
            category: String(t.category || "").slice(0, 40),
            area: String(t.area || "").slice(0, 60),
            fault: isFault(t),
            dragWeeks: (CBA.gardenLang && CBA.gardenLang.drag) ? (CBA.gardenLang.drag(t, ctx.thisWeek).weeks || 0) : 0,
            minutes: durs[t.id]
          };
        })
      };
      var done = false;
      var timer = setTimeout(function () { finish(null, "ה-AI לא ענה בזמן"); }, TIMEOUT_MS);
      function finish(res, err) {
        if (done) return; done = true; clearTimeout(timer);
        /* החלון נסגר בזמן ההמתנה — לא פותחים אותו מחדש מעצמו. */
        if (!F.isOpen()) return A.toast("הסידור החכם בוטל");
        var local = false, result;
        if (res && res.ok && res.plan) {
          result = validate(A, ctx, res, tasks, durs);
        } else {
          local = true;
          result = validate(A, ctx, (function (lp) {
            return { plan: lp.plan.map(function (p) { return { id: p.id, date: p.slot.date, start: A.hhmm(p.slot.start), minutes: p.slot.dur }; }),
                     unplaced: lp.unplaced };
          })(planLocal(A, ctx, tasks, days, prefs, durs)), tasks, durs);
          result.why = err || (res && res.error) || "";
        }
        stepProposal(result, local);
      }
      try {
        CBA.sheets.postRead("gardenAiSchedule", payload, function (res) { finish(res, res && res.error); });
      } catch (e) { finish(null, String(e)); }
    }

    /* ---------- שלב 3: ההצעה ---------- */
    function stepProposal(result, local) {
      var plan = result.plan.slice(), removed = {};
      F.replace({
        title: plan.length ? "ההצעה" : "לא נמצא סידור",
        sub: local ? "סידור בסיסי — בלי AI" : "סידור חכם · אפשר להסיר לפני שמחילים",
        html: '<div class="gw-ai-prop" data-prop></div>',
        mount: function (body) {
          var box = body.querySelector("[data-prop]");
          function draw() {
            var keep = plan.filter(function (p) { return !removed[p.id]; });
            var byDay = {};
            keep.forEach(function (p) { (byDay[p.slot.date] = byDay[p.slot.date] || []).push(p); });
            var h = "";
            if (local) {
              h += '<div class="gw-ai-note is-warn">ה-AI לא זמין כרגע' + (result.why ? " (" + esc(result.why) + ")" : "") +
                   ' — זה סידור בסיסי לפי האפשרויות שבחרת. הטקסט החופשי לא נלקח בחשבון.</div>';
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
                      esc([t.area, A.durText(p.slot.dur)].filter(Boolean).join(" · ")) + '</small></span>' +
                    (isFault(t) ? '<span class="gw-ai-fault" title="תקלת תושב"></span>' : '') +
                    '<button type="button" class="gw-ai-rm" data-rm="' + esc(p.id) + '" aria-label="הסרה מההצעה">×</button></div>';
                }).join("") + '</div>';
            });
            var out = result.unplaced.concat(plan.filter(function (p) { return removed[p.id]; })
              .map(function (p) { return { id: p.id, reason: "הוסרה מההצעה" }; }));
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
      });
    }

    stepOptions();
  }

  CBA.gardenScheduleAi = {
    open: open,
    /* לבדיקות בלבד */
    _t: { planLocal: planLocal, validate: validate, freeIntervals: freeIntervals, parseHM: parseHM }
  };
})();
