/* ============================================================================
 *  resWework.js — WeWork לתושב: שריון עמדה + כפתור הדלת   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  לפי הסקיצה שאושרה (Artifact "סקיצת דלת Nuki", מסכים 1–2):
 *    • יום → שעת התחלה (לחיצה על שורה בלוח) → משך (1..maxHours) → "שריון עמדה".
 *    • לוח השעות: ריבוע לכל עמדה (3 מחשבים + כורסה), אפור = תפוס.
 *      נפתח על viewFrom–viewTo (8–21), חצים למעלה ולמטה מרחיבים (יועד, 24.9).
 *      שעות מחוץ ל-regularFrom–regularTo מסומנות בעדינות — מותר לשריין בהן.
 *    • "השריון שלי" למעלה, עם כפתור הדלת (CBA.doorButton).
 *
 *  נתונים: Firestore בלבד לקריאה (weworkConfig, weworkDays חי, weworkBookings
 *  של המשפחה). כתיבה: weworkBook / weworkCancel ב-Apps Script.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";
  var SCREEN = "resWework";
  var st = {
    cfg: null, pub: null, mine: null, slots: {}, err: "",
    day: null, from: null, hours: 2, seat: "desk",
    vFrom: null, vTo: null, done: null, unwatch: null, watchDate: ""
  };
  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }
  function D() { return CBA.door; }
  function alive() { return document.body.dataset.screen === SCREEN; }

  /* -------------------------------------------------------------- טעינה --- */
  function load(container) {
    var pending = 3, failed = "";
    function one(err) { if (err && !failed) failed = String(err); if (--pending === 0) finish(); }
    D().readConfig(function (err, cfg) { if (!err) st.cfg = cfg; one(err); });
    D().readPublic(function (err, pub) { st.pub = pub; one(null); });
    D().myBookings(function (err, list) { if (!err) st.mine = list; one(err); });
    function finish() {
      if (!alive()) return;
      st.err = failed && !st.cfg ? failed : "";
      if (st.cfg) {
        /* אחרי 22:00 אין כמעט מה לשריין היום — נפתחים על מחר. */
        if (st.day === null) st.day = D().nowMin() >= 22 * 60 ? D().addDays(D().today(), 1) : D().today();
        if (st.vFrom === null) { st.vFrom = st.cfg.viewFrom; st.vTo = st.cfg.viewTo; }
        if (st.hours > st.cfg.maxHours) st.hours = st.cfg.maxHours;
        if (st.cfg.desks < 1) st.seat = "lounge";
        if (st.from === null) st.from = defaultFrom();
        fitView();
        watch();
      }
      draw(container);
    }
  }

  /** התצוגה תמיד מכילה את הבחירה — אחרת הבחירה "נעלמת" מחוץ ללוח. */
  function fitView() {
    if (st.from < st.vFrom) st.vFrom = st.from;
    if (st.from + st.hours > st.vTo) st.vTo = Math.min(24, st.from + st.hours);
  }

  function defaultFrom() {
    var h = st.day === D().today() ? Math.floor(D().nowMin() / 60) : 9;
    return Math.max(0, Math.min(23, h));
  }

  function watch() {
    if (st.watchDate === st.day && st.unwatch) return;
    if (st.unwatch) st.unwatch();
    st.watchDate = st.day;
    st.unwatch = D().watchDay(st.day, function (err, slots) {
      if (!alive()) { if (st.unwatch) { st.unwatch(); st.unwatch = null; } return; }
      if (err) return;
      st.slots = slots || {};
      var el = document.querySelector("[data-ww-book]");
      if (el) drawBooking(el);
    });
  }

  /* -------------------------------------------------------------- ציור --- */
  function head() {
    return '<div class="screen-head"><div class="screen-head__title">WeWork</div>' +
      '<div class="screen-head__sub">שריון עמדת עבודה וכניסה לחלל</div></div>';
  }

  function draw(container) {
    if (!st.cfg && !st.err) { container.innerHTML = head() + CBA.skel.cards(2); return; }
    if (st.err) {
      container.innerHTML = head() + CBA.ui.emptyState({
        icon: "calendar", title: "לא הצלחנו לטעון את WeWork",
        sub: "בדוק/י את החיבור לאינטרנט ונסה/י שוב.", ctaLabel: "נסה שוב", ctaAttr: "data-ww-retry"
      });
      var r = container.querySelector("[data-ww-retry]");
      if (r) r.addEventListener("click", function () { st.err = ""; draw(container); load(container); });
      return;
    }
    container.innerHTML = head() +
      '<div class="ww-layout">' +
        '<div class="ww-mine" data-ww-mine></div>' +
        '<div class="ww-book" data-ww-book></div>' +
      "</div>";
    drawMine(container.querySelector("[data-ww-mine]"));
    drawBooking(container.querySelector("[data-ww-book]"));
  }

  /* -------------------------------------------------------- השריון שלי --- */
  function drawMine(el) {
    if (!el) return;
    var list = st.mine || [];
    if (!list.length) { el.innerHTML = ""; el.hidden = true; return; }
    el.hidden = false;
    var first = list[0], rest = list.slice(1);
    var ph = D().phase(first);
    el.innerHTML =
      '<section class="card lg lg-card lg--plain ww-card ww-ticket-card">' +
        '<div class="ww-ticket">' +
          '<span class="ww-ticket__ico">' + CBA.doorButton.ICO.door + "</span>" +
          '<div class="ww-ticket__txt"><div class="ww-ticket__t">' + esc(D().SEAT_LABEL[first.seat] || "עמדה") + "</div>" +
            '<div class="ww-ticket__d"><bdi>' + esc(D().whenLabel(first)) + "</bdi></div></div>" +
          (ph === "now" ? '<span class="gym-pill gym-pill--ok">פעיל עכשיו</span>' : '<span class="gym-pill gym-pill--muted">מתחיל ' + esc(D().dayLabel(first.date)) + "</span>") +
        "</div>" +
        '<div class="ww-door" data-ww-door></div>' +
        '<div class="ww-ticket__actions"><button type="button" class="btn-ghost" data-ww-cancel="' + esc(first.id) + '">ביטול השריון</button></div>' +
      "</section>" +
      (rest.length ? '<section class="card ww-card ww-next"><div class="ww-sec-t">שריונים הבאים</div>' +
        rest.map(function (b) {
          return '<div class="ww-next__row"><div><b>' + esc(D().SEAT_SHORT[b.seat]) + "</b> · <bdi>" + esc(D().whenLabel(b)) + "</bdi></div>" +
            '<button type="button" class="btn-ghost btn-sm" data-ww-cancel="' + esc(b.id) + '">ביטול</button></div>';
        }).join("") + "</section>" : "");
    CBA.doorButton.mount(el.querySelector("[data-ww-door]"), {
      reason: "wework", booking: first, mode: (st.pub && st.pub.mode) || "off", size: "lg"
    });
    Array.prototype.forEach.call(el.querySelectorAll("[data-ww-cancel]"), function (b) {
      b.addEventListener("click", function () { cancel(b.getAttribute("data-ww-cancel"), b); });
    });
  }

  function cancel(id, btn) {
    CBA.ui.confirm("לבטל את השריון? העמדה תתפנה לשכנים.", { title: "ביטול שריון", okText: "ביטול השריון", cancelText: "השאר", danger: true })
      .then(function (ok) {
        if (!ok) return;
        var release = CBA.ui.busy(btn, "מבטל…");
        D().cancel(id, function (res) {
          release();
          if (!res.ok) return CBA.ui.alert(res.error || "הביטול נכשל");
          CBA.ui.toast("השריון בוטל");
          st.mine = (st.mine || []).filter(function (b) { return b.id !== id; });
          var el = document.querySelector("[data-ww-mine]");
          drawMine(el);
        });
      });
  }

  /* -------------------------------------------------------------- שריון --- */
  function cap(seat) { return seat === "lounge" ? st.cfg.lounge : st.cfg.desks; }
  function used(h, seat) { var s = st.slots[String(h)]; return s ? (s[seat] || 0) : 0; }
  function selFull() {
    for (var h = st.from; h < st.from + st.hours; h++) {
      if (h >= 24 || used(h, st.seat) >= cap(st.seat)) return h;
    }
    return -1;
  }
  function isPast(h) { return st.day === D().today() && (h + 1) * 60 <= D().nowMin(); }

  function daysHTML() {
    var t = D().today(), out = "";
    for (var i = 0; i <= st.cfg.advanceDays; i++) {
      var ds = D().addDays(t, i), d = D().parse(ds);
      out += '<button type="button" class="ww-day" data-ww-day="' + ds + '" aria-pressed="' + (ds === st.day) + '">' +
        "<span>" + (i === 0 ? "היום" : D().DAYS[d.getDay()]) + "</span><b>" + d.getDate() + "</b><span>" + (d.getMonth() + 1) + "</span></button>";
    }
    return '<div class="ww-days" role="group" aria-label="בחירת יום">' + out + "</div>";
  }

  function seatSegHTML() {
    if (!(st.cfg.desks > 0 && st.cfg.lounge > 0)) return "";
    function opt(k, label, n) {
      return '<button type="button" class="ww-seat" data-ww-seat="' + k + '" aria-pressed="' + (st.seat === k) + '">' +
        '<span class="ww-seat__sq ww-seat__sq--' + k + '"></span>' + label + ' <small>' + n + "</small></button>";
    }
    return '<div class="ww-lbl">איזו עמדה?</div><div class="ww-seats">' +
      opt("desk", "מחשב", st.cfg.desks + " עמדות") + opt("lounge", "כורסה", st.cfg.lounge === 1 ? "עמדה אחת" : st.cfg.lounge + " עמדות") + "</div>";
  }

  function timelineHTML() {
    var rows = "", full = selFull();
    for (var h = st.vFrom; h < st.vTo; h++) {
      var sel = h >= st.from && h < st.from + st.hours;
      var out = h < st.cfg.regularFrom || h >= st.cfg.regularTo;
      var past = isPast(h);
      var seats = "";
      for (var k = 0; k < st.cfg.desks; k++) seats += '<span class="ww-sq' + (k < used(h, "desk") ? " on" : "") + '"></span>';
      if (st.cfg.lounge) {
        seats += '<span class="ww-sq-gap"></span>';
        for (var j = 0; j < st.cfg.lounge; j++) seats += '<span class="ww-sq ww-sq--lounge' + (j < used(h, "lounge") ? " on" : "") + '"></span>';
      }
      var free = cap(st.seat) - used(h, st.seat);
      rows += '<button type="button" class="ww-row' + (sel ? " sel" : "") + (sel && full !== -1 ? " full" : "") +
        (out ? " out" : "") + (past ? " past" : "") + '" data-ww-h="' + h + '"' + (past ? " disabled" : "") + ">" +
        '<span class="ww-row__h">' + D().hh(h) + "</span>" +
        '<span class="ww-row__seats">' + seats + "</span>" +
        '<span class="ww-row__free' + (free > 0 || past ? "" : " is-full") + '">' + (past ? "עבר" : free > 0 ? free + " פנ׳" : "מלא") + "</span></button>";
    }
    return '<div class="ww-lbl">לחיצה על שעה קובעת את ההתחלה</div>' +
      '<button type="button" class="ww-more" data-ww-more="up"' + (st.vFrom <= 0 ? " hidden" : "") + '>▲ שעות מוקדמות יותר</button>' +
      '<div class="ww-tl" data-seat="' + st.seat + '">' + rows + "</div>" +
      '<button type="button" class="ww-more" data-ww-more="down"' + (st.vTo >= 24 ? " hidden" : "") + '>▼ שעות מאוחרות יותר</button>' +
      '<div class="ww-legend"><span><i class="ww-sq on"></i>תפוס</span><span><i class="ww-sq"></i>פנוי</span>' +
        (st.cfg.lounge ? '<span><i class="ww-sq ww-sq--lounge"></i>כורסה</span>' : "") +
        '<span><i class="ww-sq ww-sq--sel"></i>הבחירה שלך</span></div>';
  }

  function durHTML() {
    var b = "";
    for (var n = 1; n <= st.cfg.maxHours; n++) b += '<button type="button" data-ww-dur="' + n + '" aria-pressed="' + (n === st.hours) + '">' + n + "</button>";
    return '<div class="ww-lbl">כמה שעות?</div><div class="ww-dur" style="--n:' + st.cfg.maxHours + '">' + b + "</div>";
  }

  function summaryHTML() {
    if (st.done) {
      var b = st.done;
      return '<div class="ww-done"><div class="ww-done__ico">' + CBA.doorButton.ICO.ok + "</div>" +
        '<div class="ww-done__t">השריון אושר</div>' +
        '<div class="ww-done__s">' + esc(D().SEAT_LABEL[b.seat]) + " · <bdi>" + esc(D().whenLabel(b)) + "</bdi><br>שלחנו מייל אישור. כפתור הדלת מחכה בכרטיס למעלה.</div>" +
        '<button type="button" class="btn-ghost" data-ww-again>שריון נוסף</button></div>';
    }
    var to = st.from + st.hours, full = selFull();
    var out = st.from < st.cfg.regularFrom || to > st.cfg.regularTo;
    var d = D().parse(st.day);
    var when = D().dayLabel(st.day) + " " + d.getDate() + "." + (d.getMonth() + 1) + " · " + D().range(st.from, Math.min(to, 24));
    var why = full === -1 ? "" : (full >= 24 ? "השריון חייב להסתיים עד חצות. קצר/י את המשך." :
      "ב-" + D().hh(full) + " אין " + (st.seat === "lounge" ? "כורסה פנויה" : "עמדה פנויה") + ". נסה/י שעה אחרת או משך קצר יותר.");
    return '<div class="ww-sum"><div><div class="ww-lbl">הבחירה שלך</div><div class="ww-sum__when"><bdi>' + esc(when) + "</bdi></div>" +
        '<div class="ww-sum__seat">' + esc(D().SEAT_LABEL[st.seat]) + (out ? ' · <span class="ww-out-tag">מחוץ לשעות הרגילות</span>' : "") + "</div></div>" +
        (full === -1 ? '<span class="gym-pill gym-pill--ok">יש מקום</span>' : '<span class="gym-pill gym-pill--danger">אין מקום</span>') + "</div>" +
      (why ? '<div class="ww-why">' + esc(why) + "</div>" : "") +
      '<button type="button" class="btn-primary ww-cta" data-ww-confirm' + (full === -1 ? "" : " disabled") + ">שריון עמדה</button>";
  }

  function drawBooking(el) {
    if (!el || !st.cfg) return;
    el.innerHTML =
      '<section class="card lg lg-card lg--plain ww-card ww-card--days">' + daysHTML() + seatSegHTML() + "</section>" +
      '<div class="ww-book__grid">' +
        '<section class="card lg lg-card lg--plain ww-card ww-card--tl">' + timelineHTML() + "</section>" +
        '<div class="ww-book__side">' +
          '<section class="card lg lg-card lg--plain ww-card">' + durHTML() + "</section>" +
          '<section class="card lg lg-card lg--plain ww-card ww-card--sum">' + summaryHTML() + "</section>" +
        "</div>" +
      "</div>";
    var cur = el.querySelector('.ww-day[aria-pressed="true"]');
    if (cur && cur.scrollIntoView && cur.parentNode.scrollWidth > cur.parentNode.clientWidth) {
      try { cur.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { }
    }
  }

  function wire(container) {
    container.addEventListener("click", function (e) {
      if (!alive()) return;
      var t = e.target.closest("[data-ww-day],[data-ww-h],[data-ww-dur],[data-ww-seat],[data-ww-more],[data-ww-confirm],[data-ww-again]");
      if (!t || t.disabled) return;
      var el = container.querySelector("[data-ww-book]");
      if (t.hasAttribute("data-ww-day")) {
        st.day = t.getAttribute("data-ww-day"); st.done = null; st.slots = {};
        st.from = defaultFrom();
        fitView();
        watch();
      } else if (t.hasAttribute("data-ww-h")) { st.from = +t.getAttribute("data-ww-h"); st.done = null; }
      else if (t.hasAttribute("data-ww-dur")) { st.hours = +t.getAttribute("data-ww-dur"); st.done = null; fitView(); }
      else if (t.hasAttribute("data-ww-seat")) { st.seat = t.getAttribute("data-ww-seat"); st.done = null; }
      else if (t.hasAttribute("data-ww-more")) {
        if (t.getAttribute("data-ww-more") === "up") st.vFrom = Math.max(0, st.vFrom - 2);
        else st.vTo = Math.min(24, st.vTo + 2);
      } else if (t.hasAttribute("data-ww-again")) { st.done = null; }
      else if (t.hasAttribute("data-ww-confirm")) { confirm(t); return; }
      drawBooking(el);
    });
  }

  function confirm(btn) {
    var release = CBA.ui.busy(btn, "משריין…");
    var payload = { date: st.day, from: st.from, hours: st.hours, seat: st.seat };
    D().book(payload, function (res) {
      release();
      if (!alive()) return;
      if (!res.ok) { CBA.ui.alert(res.error || "השריון נכשל"); return; }
      st.done = res.booking;
      CBA.ui.toast("השריון אושר");
      D().myBookings(function (err, list) {
        if (!err) st.mine = list;
        drawMine(document.querySelector("[data-ww-mine]"));
        drawBooking(document.querySelector("[data-ww-book]"));
      });
    });
  }

  CBA.screens[SCREEN] = {
    title: "WeWork",
    render: function (container) {
      if (!CBA.door) { container.innerHTML = head(); return; }
      draw(container);
      if (!container.__wwWired) { wire(container); container.__wwWired = true; }
      load(container);
    }
  };
})();
