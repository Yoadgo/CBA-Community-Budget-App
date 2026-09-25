/* ============================================================================
 *  weworkAdmin.js — ניהול WeWork   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  מסך 5 בסקיצה. תחום הרשאה עצמאי PERM "WeWork" (יועד, 24.9: "מנהל WeWork
 *  הוא עצמאי"). רואה שריונים לפי יום, מבטל שריון של כל תושב, ועורך את כללי
 *  השריון — ליד הפיצ'ר, לא במסך הגדרות כללי.
 *  🔑 מצב המנעול/סוללה/התראות **אינם** כאן — הם של מנהל המכון (doorAdmin).
 *  🔑 המנהל רואה שריונים על המסך בלבד — אין מייל על כל שריון (יועד, 24.9).
 *  שמות: Firestore נושא רק familyId; השם מגיע מ-CBA.data.familyDisplayName.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";
  var SCREEN = "weworkAdmin";
  var st = { cfg: null, day: null, rows: null, err: "", names: false };
  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }
  function D() { return CBA.door; }
  function alive() { return document.body.dataset.screen === SCREEN; }

  var FIELDS = [
    ["desks", "עמדות מחשב"], ["lounge", "עמדות כורסאות"],
    ["maxHours", "שריון ארוך ביותר (שעות)"], ["advanceDays", "כמה ימים קדימה"],
    ["perFamily", "שריונים חופפים למשפחה"],
    ["regularFrom", "שעות רגילות — מ"], ["regularTo", "שעות רגילות — עד"],
    ["viewFrom", "התצוגה נפתחת מ"], ["viewTo", "התצוגה נפתחת עד"]
  ];

  function head() {
    return '<div class="screen-head"><div class="screen-head__title">ניהול WeWork</div>' +
      '<div class="screen-head__sub">שריונים, כניסות וכללי השריון</div></div>';
  }

  function load(container) {
    D().readConfig(function (err, cfg) {
      if (!alive()) return;
      if (err) { st.err = String(err); draw(container); return; }
      st.cfg = cfg;
      if (!st.day) st.day = D().today();
      loadDay(container);
    });
    if (!st.names && CBA.data && CBA.data.ensureFamilyNames) {
      CBA.data.ensureFamilyNames(function () { st.names = true; if (alive() && st.rows) drawList(container); });
    }
  }
  function loadDay(container) {
    st.rows = null;
    draw(container);
    D().dayBookings(st.day, function (err, rows) {
      if (!alive()) return;
      if (err) { st.err = String(err); draw(container); return; }
      st.rows = rows;
      draw(container);
    });
  }

  /* 26.9 — שם פרטי של מי ששריין (slot), ורק אם אין — שם המשפחה. */
  function famName(fid, slot) {
    var p = CBA.data && CBA.data.personName ? CBA.data.personName(fid, slot) : "";
    if (p) return p;
    var n = CBA.data && CBA.data.familyDisplayName ? CBA.data.familyDisplayName(fid) : "";
    return n || "תושב";
  }

  function kpis() {
    var rows = (st.rows || []).filter(function (b) { return b.status === "active"; });
    var nowRows = st.day === D().today() ? rows.filter(function (b) { return D().phase(b) === "now"; }) : [];
    var total = st.cfg.desks + st.cfg.lounge;
    var hours = rows.reduce(function (a, b) { return a + (b.to - b.from); }, 0);
    var entered = rows.filter(function (b) { return b.enteredAtMs; }).length;
    function tile(l, v, s) { return '<div class="wa-kpi"><div class="wa-kpi__l">' + l + '</div><div class="wa-kpi__v">' + v + '</div><div class="wa-kpi__s">' + s + "</div></div>"; }
    return '<div class="wa-kpis">' +
      (st.day === D().today() ? tile("עכשיו", nowRows.length + " <small>מתוך " + total + "</small>", total - nowRows.length > 0 ? (total - nowRows.length) + " פנויות" : "הכול תפוס") : "") +
      tile(st.day === D().today() ? "היום" : esc(D().dayLabel(st.day)), rows.length + " <small>שריונים</small>", hours + " שעות עמדה") +
      tile("הגיעו", entered + " <small>מתוך " + rows.length + "</small>", "לפי יומן הדלת") +
      "</div>";
  }

  function daysHTML() {
    var t = D().today(), out = "";
    for (var i = -2; i <= st.cfg.advanceDays; i++) {
      var ds = D().addDays(t, i), d = D().parse(ds);
      out += '<button type="button" class="ww-day' + (i < 0 ? " is-past" : "") + '" data-wa-day="' + ds + '" aria-pressed="' + (ds === st.day) + '">' +
        "<span>" + (i === 0 ? "היום" : D().DAYS[d.getDay()]) + "</span><b>" + d.getDate() + "</b><span>" + (d.getMonth() + 1) + "</span></button>";
    }
    return '<div class="ww-days">' + out + "</div>";
  }

  function listHTML() {
    if (!st.rows) return CBA.skel.rows(4);
    if (!st.rows.length) {
      return CBA.ui.emptyState({ icon: "calendar", title: "אין שריונים ביום הזה", sub: "שריונים חדשים יופיעו כאן מיד." });
    }
    return '<div class="wa-list">' + st.rows.map(function (b) {
      var ph = D().phase(b), active = b.status === "active";
      var status = !active ? '<span class="gym-pill gym-pill--muted">' + (b.canceledBy === "admin" ? "בוטל ע״י מנהל" : "בוטל") + "</span>" :
        b.enteredAtMs ? '<span class="gym-pill gym-pill--ok">נכנס/ה ' + esc(new Date(b.enteredAtMs).toTimeString().slice(0, 5)) + "</span>" :
        ph === "ended" ? '<span class="gym-pill gym-pill--warn">לא הגיע/ה</span>' :
        ph === "now" ? '<span class="gym-pill gym-pill--warn">עוד לא הגיע/ה</span>' : '<span class="gym-pill gym-pill--muted">מתוכנן</span>';
      return '<div class="wa-row' + (active ? "" : " is-off") + '">' +
        '<span class="wa-row__t"><bdi dir="ltr">' + esc(D().range(b.from, b.to)) + "</bdi></span>" +
        '<div class="wa-row__who"><b>' + esc(famName(b.familyId, b.slot)) + "</b><div>" + esc(D().SEAT_LABEL[b.seat] || "") + "</div></div>" +
        status +
        (active && ph !== "ended" ? '<button type="button" class="btn-ghost btn-sm" data-wa-cancel="' + esc(b.id) + '">ביטול</button>' : '<span class="wa-row__sp"></span>') +
      "</div>";
    }).join("") + "</div>";
  }

  function rulesHTML() {
    var c = st.cfg;
    function row(l, v) { return '<div class="wa-rule"><span>' + l + "</span><b>" + v + "</b></div>"; }
    return '<div class="ww-sec-h"><div class="ww-sec-t">כללי השריון</div><button type="button" class="btn-ghost btn-sm" data-wa-edit>עריכה</button></div>' +
      row("שעות רגילות", '<bdi dir="ltr">' + D().range(c.regularFrom, c.regularTo) + "</bdi>") +
      row("התצוגה נפתחת על", '<bdi dir="ltr">' + D().range(c.viewFrom, c.viewTo) + "</bdi>") +
      row("עמדות", c.desks + " מחשב · " + c.lounge + " כורסה") +
      row("שריון ארוך ביותר", c.maxHours + " שעות") +
      row("כמה זמן קדימה", c.advanceDays + " ימים") +
      row("חופפים למשפחה", String(c.perFamily)) +
      '<div class="ww-note">מחוץ לשעות הרגילות מותר לשריין — זה רק מסומן לתושב.</div>';
  }

  function draw(container) {
    if (st.err) {
      container.innerHTML = head() + CBA.ui.emptyState({ icon: "calendar", title: "לא הצלחנו לטעון", sub: st.err, ctaLabel: "נסה שוב", ctaAttr: "data-wa-retry" });
      var r = container.querySelector("[data-wa-retry]");
      if (r) r.addEventListener("click", function () { st.err = ""; load(container); });
      return;
    }
    if (!st.cfg) { container.innerHTML = head() + CBA.skel.stats(3) + CBA.skel.table(5, 4); return; }
    container.innerHTML = head() +
      '<div data-wa-kpis>' + kpis() + "</div>" +
      '<div class="wa-grid">' +
        '<section class="card club-card ww-card wa-day">' + daysHTML() + '<div data-wa-list>' + listHTML() + "</div></section>" +
        '<section class="card club-card ww-card wa-rules">' + rulesHTML() + "</section>" +
      "</div>";
    var cur = container.querySelector('.ww-day[aria-pressed="true"]');
    if (cur) { try { cur.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { } }
  }
  function drawList(container) {
    var el = container.querySelector("[data-wa-list]");
    if (el) el.innerHTML = listHTML();
  }

  function cancel(container, id, btn) {
    var b = (st.rows || []).filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    CBA.ui.confirm("לבטל את השריון של " + famName(b.familyId, b.slot) + " (" + D().range(b.from, b.to) + ")? התושב יקבל על כך מייל.",
      { title: "ביטול שריון", okText: "ביטול השריון", cancelText: "השאר", danger: true })
      .then(function (ok) {
        if (!ok) return;
        var release = CBA.ui.busy(btn, "מבטל…");
        D().cancel(id, function (res) {
          release();
          if (!res.ok) return CBA.ui.alert(res.error || "הביטול נכשל");
          CBA.ui.toast("השריון בוטל ונשלח מייל לתושב");
          loadDay(container);
        });
      });
  }

  function edit(container) {
    var c = st.cfg;
    var html = '<div class="wa-form">' + FIELDS.map(function (f) {
      return '<div class="gym-field"><label for="wa-f-' + f[0] + '">' + f[1] + '</label><input type="number" inputmode="numeric" id="wa-f-' + f[0] + '" data-k="' + f[0] + '" value="' + c[f[0]] + '"></div>';
    }).join("") + "</div>";
    CBA.ui.dialog({
      title: "כללי השריון", html: html, okText: "שמירה", cancelText: "ביטול",
      onOk: function (wrap, close) {
        var p = {};
        Array.prototype.forEach.call(wrap.querySelectorAll("input[data-k]"), function (i) { p[i.getAttribute("data-k")] = i.value; });
        var ok = wrap.querySelector('[data-dlg="ok"]');
        var release = ok ? CBA.ui.busy(ok, "שומר…") : function () {};
        D().saveConfig(p, function (res) {
          release();
          if (!res.ok) { CBA.ui.alert(res.error || "השמירה נכשלה"); return; }
          st.cfg = res.config || st.cfg;
          CBA.ui.toast("הכללים נשמרו");
          close();
          draw(container);
        });
        return false;
      }
    });
  }

  function wire(container) {
    container.addEventListener("click", function (e) {
      if (!alive()) return;
      var d = e.target.closest("[data-wa-day]");
      if (d) { st.day = d.getAttribute("data-wa-day"); loadDay(container); return; }
      var c = e.target.closest("[data-wa-cancel]");
      if (c) { cancel(container, c.getAttribute("data-wa-cancel"), c); return; }
      if (e.target.closest("[data-wa-edit]")) edit(container);
    });
  }

  CBA.screens[SCREEN] = {
    title: "ניהול WeWork",
    render: function (container) {
      if (!CBA.door) { container.innerHTML = head(); return; }
      draw(container);
      if (!container.__waWired) { wire(container); container.__waWired = true; }
      load(container);
    }
  };
})();
