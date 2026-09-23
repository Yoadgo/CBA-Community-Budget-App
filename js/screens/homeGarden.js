/* homeGarden.js — מקטע "גינון" בעמוד הבית (2026-09-23)
   ============================================================================
   למנהל־על ולמנהל הגינון בלבד (לא לגנן החיצוני — ר' canGarden ב-home.js,
   אותו תנאי של SCREEN_PERM "MANAGER" ב-app.js). הסקיצה שאושרה, 23.9:
   ארבעה אריחים (בוצעו השבוע · תקלות פתוחות · נגררות · משוב שלילי) ושלושה
   כרטיסים (הכי נגררות · התקלות לפי גיל וסוג · עמידה בתוכנית).

   🔑 **אף מספר כאן לא מחושב מחדש.** הכול יוצא מאותו מנוע של מסך "נתוני
      גינון" (CBA.gardenStatsCalc.compute) ומאותה קריאה (getGardenStatsLive,
      Firestore, ~240ms נמדד חי). "בוצעו השבוע" — אותה הגדרה בדיוק של פס
      ההתקדמות במסך המשימות (counts() ב-gardenTasks.js: משימות ששבוען הוא
      השבוע הנוכחי, ו"בוצעה" = נסגרה). כך לחיצה על אריח נוחתת על מסך שמראה
      את אותו מספר — בלי "שני מספרים שלא מסכימים".

   ⚠️ עמוד הבית מצטייר מחדש בכל רענון רקע (showScreen("resHome")). בלי המטמון
      של דקה כל ציור כזה היה קורא שוב את כל המשימות ואת היומן מ-Firestore.
   ========================================================================== */
window.CBA = window.CBA || {};

CBA.homeGarden = (function () {
  "use strict";

  var WEEKS = 8;
  var TTL = 60 * 1000;
  var REPORT = "דיווח תושב";
  var DAY = 86400000;

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  function svg(d, n) {
    return '<svg viewBox="0 0 24 24" width="' + (n || 16) + '" height="' + (n || 16) + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var ICO = {
    leaf:  '<path d="M11 20a10 10 0 0 0 10-10 25.9 25.9 0 0 0-1.04-7.281 1 1 0 0 0-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0 0 11 20"/><path d="M2 21a5 5 0 0 1 2.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    chev:  '<path d="m14 6-6 6 6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    list:  '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    trend: '<path d="M4 19.5h16"/><path d="m5 15 4-4 3 3 6-7"/>'
  };
  /* צבעי הקטגוריות — אותם ערכים של --c-* ב-garden.css (שם הם מוגדרים רק
     בתוך .gd-screen, ולכן לא זמינים בעמוד הבית). */
  var CAT_COL = { lawn: "#6E9F80", water: "#79A9C6", tree: "#4F7F63", prune: "#5E9C98",
                  weed: "#C4A463", clean: "#8795A6", bed: "#C98AA6" };
  var AGE_COL = ["#94A3B8", "#D97706", "#DB2777", "#E11D48"];

  /* ================================================================ נתונים */
  var cache = { res: null, ts: 0, busy: false, waiters: [] };
  function read(cb, force) {
    if (!force && cache.res && (Date.now() - cache.ts) < TTL) return cb(cache.res);
    cache.waiters.push(cb);
    if (cache.busy) return;
    if (!(CBA.data && CBA.data.getGardenStatsLive && CBA.gardenStatsCalc && CBA.gardenLang)) {
      return flush({ ok: false, error: "מנוע הגינון לא נטען" });
    }
    cache.busy = true;
    try {
      CBA.data.getGardenStatsLive(WEEKS, function (res) {
        cache.busy = false;
        if (res && res.ok) { cache.res = res; cache.ts = Date.now(); }
        flush(res);
      });
    } catch (e) { cache.busy = false; flush({ ok: false, error: String(e) }); }
  }
  function flush(res) {
    var w = cache.waiters; cache.waiters = [];
    w.forEach(function (f) { try { f(res); } catch (e) { /* מקטע שנעלם */ } });
  }

  function model(res) {
    var L = CBA.gardenLang;
    var M = CBA.gardenStatsCalc.compute(res.rows, res.log, {
      weeks: WEEKS, categories: res.categories,
      requireApproval: res.requireApproval, logOk: res.logOk
    });
    var cur = L.weekOf();
    var rows = (res.rows || []).filter(function (t) { return t && !t.pendingDelete; });
    var byId = {}, weekTotal = 0, weekDone = 0;
    rows.forEach(function (t) {
      byId[String(t.id)] = t;
      if (t.week === cur) { weekTotal++; if (t.closure) weekDone++; }
    });
    /* "מחכה להחלטה" — אותו תנאי של now.open.undecided במנוע: תקלה פתוחה
       שעוד אין לה שבוע. כאן גם הרשימה עצמה, בשביל הכותרת בשורת הוועד. */
    var ms = CBA.gardenStatsCalc.ms;
    var undecided = rows.filter(function (t) { return t.kind === REPORT && !t.closure && !t.week; })
      .map(function (t) { return { t: t, at: ms(t.createdAt) }; })
      .sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
    return { M: M, byId: byId, weekTotal: weekTotal, weekDone: weekDone, undecided: undecided };
  }

  /* ================================================================ HTML */
  function tile(goto, ico, label, value, sub, extraCls) {
    return '<button type="button" class="card hmg-kpi' + (extraCls ? " " + extraCls : "") + '" data-admin-goto="' + goto + '">' +
      '<span class="hmg-kpi__l">' + svg(ico, 14) + label + '</span>' +
      '<span class="hmg-kpi__v">' + value + '</span>' + sub + '</button>';
  }
  function daysLeftText() {
    var n = 6 - new Date().getDay();
    return n <= 0 ? "השבוע נסגר היום" : (n === 1 ? "עוד יום אחד לסוף השבוע" : "עוד " + n + " ימים לסוף השבוע");
  }
  function tilesHTML(m) {
    var M = m.M, pct = m.weekTotal ? Math.round(m.weekDone * 100 / m.weekTotal) : 0;
    var open = M.now.open, drag = M.now.dragged, neg = M.period.negative;
    var t1 = tile("gardenTasks", ICO.check, "בוצעו השבוע",
      m.weekTotal ? m.weekDone + '<small> / ' + m.weekTotal + '</small>' : "—",
      m.weekTotal
        ? '<span class="hmg-bar"><i style="width:' + pct + '%"></i></span><span class="hmg-kpi__s">' + daysLeftText() + '</span>'
        : '<span class="hmg-kpi__s">אין משימות מתוכננות השבוע</span>');
    var s2 = [];
    if (open.planned) s2.push(open.planned + " משובצות");
    if (open.undecided) s2.push(open.undecided === 1 ? "אחת מחכה להחלטה" : open.undecided + " מחכות להחלטה");
    var t2 = tile("gardenStats", ICO.list, "תקלות פתוחות", String(open.count),
      '<span class="hmg-kpi__s">' + (s2.length ? s2.join(" · ") : "אין תקלות פתוחות") + '</span>');
    var t3 = tile("gardenStats", ICO.clock, "נגררות", String(drag.count),
      drag.count
        ? '<span class="hmg-kpi__s">' +
            (drag.l1 ? '<span class="hmg-chip hmg-chip--l1">שבוע · ' + drag.l1 + '</span>' : "") +
            (drag.l2 ? '<span class="hmg-chip hmg-chip--l2">שבועיים+ · ' + drag.l2 + '</span>' : "") + '</span>'
        : '<span class="hmg-kpi__s">שום משימה לא נגררה</span>');
    var t4 = tile("gardenStats", ICO.trend, "משוב שלילי",
      neg.pct == null ? "—" : neg.pct + "%",
      '<span class="hmg-kpi__s">' + (neg.answered
        ? neg.negative + " מתוך " + neg.answered + " שענו · " + WEEKS + " שבועות"
        : "עוד אין משוב ב-" + WEEKS + " השבועות האחרונים") + '</span>');
    return '<div class="hmg-kpis">' + t1 + t2 + t3 + t4 + '</div>';
  }

  function dragCardHTML(m) {
    var top = (m.M.now.top || []).slice(0, 3);
    var body = top.length ? top.map(function (d) {
      var t = m.byId[d.id] || {};
      var meta = [t.area, t.kind === "שגרה" ? "שגרה" : ""].filter(Boolean).join(" · ");
      return '<button type="button" class="hm-row hmg-drag" data-hmg-open="' + esc(d.id) + '">' +
        '<span class="hm-row__txt"><b dir="auto">' + esc(t.title || t.category || "משימה") + '</b>' +
        (meta ? '<small>' + esc(meta) + '</small>' : "") + '</span>' +
        '<span class="hmg-chip hmg-chip--l' + d.level + '">' + esc(d.level >= 2 ? CBA.gardenLang.weeksText(d.weeks) : "שבוע") + '</span>' +
        '<span class="hm-row__c">' + svg(ICO.chev, 15) + '</span></button>';
    }).join("") : '<p class="hmg-empty">' + svg(ICO.check, 15) + 'שום משימה לא נגררה.</p>';
    return '<section class="card hm-card hmg-card">' +
      '<div class="hm-card__head"><h3 class="hm-card__t hmg-card__t">הכי נגררות</h3>' +
      '<button type="button" class="hm-link" data-admin-goto="gardenTasks">לכל המשימות ' + svg(ICO.chev, 14) + '</button></div>' +
      '<div class="hm-mine">' + body + '</div></section>';
  }

  function barsHTML(items) {
    var max = Math.max.apply(null, items.map(function (i) { return i.n; }).concat([1]));
    return '<div class="hmg-bars">' + items.map(function (i) {
      return '<div class="hmg-bars__r"><span class="hmg-bars__l">' + i.label + '</span>' +
        '<span class="hmg-bars__t"><i style="width:' + Math.round(i.n * 100 / max) + '%;background:' + i.col + '"></i></span>' +
        '<b>' + i.n + '</b></div>';
    }).join("") + '</div>';
  }
  function faultsCardHTML(m) {
    var M = m.M, L = CBA.gardenLang;
    var age = (M.now.age || []).map(function (a, i) { return { label: a.label, n: a.ids.length, col: AGE_COL[i] || AGE_COL[3] }; });
    var cats = (M.period.byCat || []).filter(function (c) { return c.ids.length; })
      .sort(function (a, b) { return b.ids.length - a.ids.length; }).slice(0, 4)
      .map(function (c) { return { label: esc(c.name), n: c.ids.length, col: CAT_COL[L.catOf(c.name).key] || CAT_COL.lawn }; });
    return '<section class="card hm-card hmg-card">' +
      '<div class="hm-card__head"><h3 class="hm-card__t hmg-card__t">' + M.now.open.count + ' תקלות פתוחות</h3>' +
      '<button type="button" class="hm-link" data-admin-goto="gardenStats">לנתוני הגינון ' + svg(ICO.chev, 14) + '</button></div>' +
      '<p class="hmg-sh">לפי גיל</p>' + (M.now.open.count ? barsHTML(age) : '<p class="hmg-empty">' + svg(ICO.check, 15) + 'אין תקלות פתוחות.</p>') +
      '<p class="hmg-sh">לפי סוג · ' + WEEKS + ' שבועות</p>' +
      (cats.length ? barsHTML(cats) : '<p class="hmg-empty">לא נפתחו תקלות בתקופה.</p>') +
      '</section>';
  }

  function trendCardHTML(m) {
    var M = m.M, vals = M.trends.adherence || [], keys = M.weekKeys || [];
    var last = vals.length - 1;
    var cols = vals.map(function (v, i) {
      var k = String(keys[i] || ""), mm = /^\d{4}-(\d{2})-(\d{2})$/.exec(k);
      var lbl = i === last ? "השבוע" : (mm ? (+mm[2]) + "." + (+mm[1]) : "");
      var h = v == null ? 0 : Math.max(3, v);
      return '<div class="hmg-tr__c' + (i === last ? " is-now" : "") + '">' +
        '<span class="hmg-tr__v">' + (v == null ? "—" : v + "%") + '</span>' +
        '<span class="hmg-tr__b"><i style="height:' + h + '%"></i></span>' +
        '<span class="hmg-tr__l">' + lbl + '</span></div>';
    }).join("");
    /* נמדד חי 23.9: למודול יש עדיין שבוע אחד של נתונים — שבע עמודות ריקות
       בלי הסבר נראות כמו תקלה. אומרים את זה במילים. */
    var past = vals.slice(0, last).filter(function (v) { return v != null; }).length;
    var foot = past < 2
      ? "המגמה תתמלא ככל שיצטברו שבועות. השבוע עדיין בעבודה — נסגר בשבת."
      : "השבוע עדיין בעבודה — נסגר בשבת.";
    return '<section class="card hm-card hmg-card">' +
      '<div class="hm-card__head"><h3 class="hm-card__t hmg-card__t">עמידה בתוכנית</h3>' +
      '<span class="hm-card__sub">שגרה שבוצעה בשבוע שתוכננה</span></div>' +
      '<div class="hmg-tr">' + cols + '</div>' +
      '<p class="hmg-foot">' + foot + '</p></section>';
  }

  function weekLabel() {
    var s = new Date(); s.setHours(12, 0, 0, 0); s.setDate(s.getDate() - s.getDay());
    var e = new Date(s); e.setDate(s.getDate() + 6);
    var MON = ["בינואר", "בפברואר", "במרץ", "באפריל", "במאי", "ביוני", "ביולי", "באוגוסט", "בספטמבר", "באוקטובר", "בנובמבר", "בדצמבר"];
    /* ⚠️ טווח עם מקף ארוך מתהפך ב-RTL ("26–20"). ⁦…⁩ מבודדים אותו — אותו
       פתרון של gardenStatsCalc (AGE). */
    var LI = "⁦", PD = "⁩";
    return s.getMonth() === e.getMonth()
      ? LI + s.getDate() + "–" + e.getDate() + PD + " " + MON[s.getMonth()]
      : s.getDate() + " " + MON[s.getMonth()] + " – " + e.getDate() + " " + MON[e.getMonth()];
  }

  function headHTML() {
    return '<div class="hmg-head"><span class="hmg-head__ico">' + svg(ICO.leaf, 16) + '</span>' +
      '<h2 class="hmg-head__t">גינון</h2><span class="hmg-head__s">השבוע · ' + weekLabel() + '</span>' +
      '<button type="button" class="hm-link" data-admin-goto="gardenTasks">למסך המשימות ' + svg(ICO.chev, 14) + '</button></div>';
  }

  function skeletonHTML() {
    var t = '<div class="card hmg-kpi is-skel"><span class="skeleton" style="width:50%;height:12px;border-radius:6px"></span>' +
      '<span class="skeleton" style="width:40%;height:28px;border-radius:8px"></span></div>';
    var c = '<div class="card hm-card hmg-card is-skel"><span class="skeleton" style="width:40%;height:14px;border-radius:7px"></span>' +
      '<span class="skeleton" style="height:120px;border-radius:12px"></span></div>';
    return '<div class="hmg-kpis">' + t + t + t + t + '</div><div class="hmg-cards">' + c + c + c + '</div>';
  }

  function paint(host, res) {
    if (!host || !host.isConnected) return null;
    var body = host.querySelector(".hmg-body");
    if (!body) return null;
    if (!res || !res.ok) {
      body.innerHTML = '<div class="card hm-card hmg-err"><span>לא הצלחנו לטעון את נתוני הגינון.</span>' +
        '<button type="button" class="hm-link" data-hmg-retry>לנסות שוב</button></div>';
      return null;
    }
    var m;
    try { m = model(res); } catch (e) {
      body.innerHTML = '<div class="card hm-card hmg-err"><span>לא הצלחנו לחשב את נתוני הגינון.</span></div>';
      return null;
    }
    body.innerHTML = tilesHTML(m) +
      '<div class="hmg-cards">' + dragCardHTML(m) + faultsCardHTML(m) + trendCardHTML(m) + '</div>' +
      '<button type="button" class="hm-row hmg-more" data-admin-goto="gardenStats">' +
        '<span class="hm-row__ico">' + svg(ICO.trend, 17) + '</span>' +
        '<span class="hm-row__txt"><b>הכי נגררות · גיל וסוג התקלות</b><small>ועמידה בתוכנית — במסך נתוני הגינון</small></span>' +
        '<span class="hm-row__c">' + svg(ICO.chev, 16) + '</span></button>';
    return m;
  }

  /* mount(host, opts) — host הוא <section> שעמוד הבית יצר. opts.onDecide(n, first)
     מקבל את מספר התקלות שמחכות להחלטה, בשביל השורה בכרטיס "תפקיד ועד". */
  function mount(host, opts) {
    opts = opts || {};
    if (!host) return;
    host.innerHTML = headHTML() + '<div class="hmg-body">' + skeletonHTML() + '</div>';
    function run(force) {
      read(function (res) {
        var m = paint(host, res);
        if (opts.onDecide) {
          if (m) {
            var f = m.undecided[0];
            opts.onDecide(m.M.now.open.undecided, f ? {
              title: f.t.title || f.t.category || "",
              days: isNaN(f.at) ? null : Math.max(0, Math.floor((Date.now() - f.at) / DAY))
            } : null);
          } else {
            opts.onDecide(null, null);   // כשל — השורה נעלמת, ולא מכריזה "אין"
          }
        }
      }, force);
    }
    host.addEventListener("click", function (e) {
      var o = e.target.closest("[data-hmg-open]");
      if (o) {
        var id = o.getAttribute("data-hmg-open");
        if (typeof CBA.gardenOpenCard === "function") {
          CBA.gardenOpenCard(id, function () { run(true); });
        } else if (CBA.gotoAdmin) CBA.gotoAdmin("gardenTasks");
        return;
      }
      if (e.target.closest("[data-hmg-retry]")) {
        var b = host.querySelector(".hmg-body");
        if (b) b.innerHTML = skeletonHTML();
        run(true);
      }
    });
    run(false);
  }

  return { mount: mount, _reset: function () { cache = { res: null, ts: 0, busy: false, waiters: [] }; } };
})();
