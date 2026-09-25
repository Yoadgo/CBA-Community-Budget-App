/* ============================================================================
 *  doorButton.js — כפתור "פתיחת הדלת" + הסבר הפתיחה למנויי המכון (25.9.2026)
 * ----------------------------------------------------------------------------
 *  רכיב אחד לשני המסכים (WeWork ומכון) — כדי שהכפתור ייראה ויתנהג אותו דבר.
 *  🔑 הכפתור רק *מציג* מתי אפשר לפתוח. ההחלטה האמיתית בשרת (doorOpen_),
 *     בכל לחיצה מחדש. מסך אפשר לרמות, שרת לא.
 *  ⚠️ הלחיצה לוקחת 4–8 שניות (Apps Script → Nuki → המנעול). לכן יש מצב
 *     "פותח…" אמיתי עם ספינר, והכפתור נעול עד שמגיעה תשובה.
 *
 *  CBA.doorButton.mount(el, { reason:'wework'|'gym'|'admin', booking, mode, size })
 *  CBA.doorGuide.open() / maybeAuto()   — ההסבר בסגנון סיור ההיכרות (tour.css)
 * ========================================================================== */
window.CBA = window.CBA || {};

CBA.doorButton = (function () {
  "use strict";
  function esc(s) { return CBA.esc ? CBA.esc(String(s == null ? "" : s)) : String(s == null ? "" : s); }

  var ICO = {
    door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>'
  };

  function mount(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var D = CBA.door;
    var st = { s: "ready", err: "", contact: null, sim: false, timer: null, back: null };

    function base() {
      if (opts.mode === "off") return "off";
      if (opts.reason === "wework" && opts.booking) {
        var p = D.phase(opts.booking);
        if (p === "before") return "before";
        if (p === "ended") return "ended";
      }
      return "ready";
    }

    function draw() {
      if (!document.body.contains(el)) { stop(); return; }
      var s = st.s, b = opts.booking;
      var inner = "", msg = "", sub = "", extra = "", dis = false;
      if (s === "off") {
        inner = ICO.lock + "<span>עוד לא מחוברת</span>"; dis = true;
        msg = "הדלת עוד לא מחוברת לאפליקציה";
        sub = opts.reason === "gym" ? "בינתיים נכנסים כמו היום." : "השריון שמור. בינתיים נכנסים כרגיל.";
      } else if (s === "before") {
        inner = ICO.lock + "<span>ייפתח ב-" + esc(D.hh(b.from)) + "</span>"; dis = true;
        msg = "השריון מתחיל " + esc(D.dayLabel(b.date)) + " ב-" + esc(D.hh(b.from));
        sub = "הכפתור יידלק כשהשריון מתחיל.";
      } else if (s === "ended") {
        inner = ICO.lock + "<span>השריון הסתיים</span>"; dis = true;
        msg = "השריון הסתיים ב-" + esc(D.hh(b.to));
      } else if (s === "ready") {
        inner = ICO.door + "<span>פתיחת הדלת</span>";
        sub = "לוחצים כשעומדים ליד הדלת. היא תשתחרר ותיפתח.";
      } else if (s === "opening") {
        inner = "<span>פותח…</span>"; dis = true;
        msg = "שולח פקודה למנעול";
        sub = "זה לוקח כמה שניות. אפשר להתקרב לדלת.";
      } else if (s === "opened") {
        inner = ICO.ok + "<span>הדלת פתוחה</span>";
        msg = st.sim ? "הדמיה הצליחה" : "נכנסים!";
        sub = st.sim ? "מצב הדמיה: הדלת עצמה לא נפתחה. הבדיקה נרשמה ביומן." : "הדלת תינעל שוב לבד אחרי שתיסגר.";
      } else if (s === "error") {
        inner = ICO.warn + "<span>לא נפתחה</span>";
        msg = esc(st.err || "הדלת לא נפתחה");
        var c = st.contact || {};
        extra = '<button type="button" class="btn-primary dr-retry" data-dr-retry>לנסות שוב</button>' +
          (c.phone ? '<div class="dr-contact"><span>' + esc(c.name || "מנהל המכון") + '</span><bdi dir="ltr" class="dr-phone">' + esc(c.phone) + "</bdi></div>" : "");
      }
      el.innerHTML =
        '<div class="dr dr--' + (opts.size || "lg") + '">' +
          '<button type="button" class="dr-btn" data-s="' + s + '"' + (dis ? " disabled" : "") + ' data-dr-open aria-live="polite">' +
            '<span class="dr-ring" aria-hidden="true"></span><span class="dr-in">' + inner + "</span>" +
          "</button>" +
          (msg ? '<div class="dr-msg">' + msg + "</div>" : "") +
          (sub ? '<div class="dr-sub">' + sub + "</div>" : "") +
          (extra ? '<div class="dr-extra">' + extra + "</div>" : "") +
        "</div>";
    }

    function openNow() {
      if (st.s !== "ready" && st.s !== "error") return;
      st.s = "opening"; draw();
      D.open(opts.reason, opts.booking && opts.booking.id, function (res) {
        if (res && res.ok) {
          st.s = "opened"; st.sim = !!res.simulated; draw();
          if (opts.onOpened) try { opts.onOpened(res); } catch (e) { }
          clearTimeout(st.back);
          st.back = setTimeout(function () { st.s = base(); draw(); }, 6000);
        } else {
          st.err = (res && res.error) || "הדלת לא נפתחה";
          st.contact = res && res.contact;
          st.s = (res && res.code === "DOOR_OFF") ? "off" : (res && res.code === "NOT_NOW") ? base() : "error";
          if (st.s !== "error" && CBA.ui && CBA.ui.toast) CBA.ui.toast(st.err, "warn");
          draw();
        }
      });
    }

    el.addEventListener("click", function (e) {
      if (e.target.closest("[data-dr-open]") || e.target.closest("[data-dr-retry]")) openNow();
    });

    function tick() {
      if (!document.body.contains(el)) { stop(); return; }
      if (st.s === "opening" || st.s === "opened" || st.s === "error") return;
      var n = base();
      if (n !== st.s) { st.s = n; draw(); }
    }
    function stop() { clearInterval(st.timer); clearTimeout(st.back); }

    st.s = base();
    draw();
    st.timer = setInterval(tick, 30000);
    return { stop: stop, refresh: function (o) { Object.assign(opts, o || {}); st.s = base(); draw(); } };
  }

  return { mount: mount, ICO: ICO };
})();

/* ============================================================================
 *  הסבר הפתיחה — "בסגנון הסיור" (יועד, 24.9). אותן מחלקות של tour.css,
 *  אבל חפיסה קבועה של ארבעה שלבים: tour.js לא יודע לפתוח חפיסה לפי שם.
 * ========================================================================== */
CBA.doorGuide = (function () {
  "use strict";
  var KEY = "cba_door_guide_seen_v2";   /* v2 (26.9) — ההסבר החדש מוצג שוב פעם אחת */
  var el = null, idx = 0;

  function svg(p) {
    return '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + p + "</svg>";
  }
  /* 26.9 (יועד: "משהו יותר ויזואלי, ו… סימולציה של הפתיחה עם הטלפון") —
     כל דרך כניסה עם הדגמה קטנה שרצה לבד (CSS בלבד, בלי ספריות). */
  var STAGE_TAP = '<div class="dg-stage"><div class="dg-phone"><div class="dg-scr"><div class="dg-big">🔓</div>' +
    '<div class="dg-finger"></div><div class="dg-okmsg">הדלת נפתחה</div></div></div></div>';
  var STAGE_WATCH = '<div class="dg-stage dg-stage--two">' +
    '<div class="dg-mini"><div class="dg-phone dg-phone--sm"><div class="dg-scr"><div class="dg-nuki">Nuki</div><div class="dg-big dg-big--sm">🔓</div></div></div><small>אפליקציית Nuki</small></div>' +
    '<div class="dg-mini"><div class="dg-watch"><div class="dg-wscr"><div class="dg-wb">🔓</div></div></div><small>שעון חכם</small></div></div>';
  var STAGE_AUTO = '<div class="dg-stage dg-stage--map"><div class="dg-map"></div><div class="dg-fence"></div>' +
    '<div class="dg-ble"></div><div class="dg-ble dg-ble--2"></div><div class="dg-home">🚪</div><div class="dg-unlock">נפתח ✓</div><div class="dg-me"></div>' +
    '<div class="dg-lab"><span class="dg-l1">📍 רחוק מהבית — הטלפון יודע שיצאת</span><span class="dg-l2">🚶 חוזר ונכנס לאזור (GPS)</span>' +
    '<span class="dg-l3">📶 ליד הדלת — מתחבר בבלוטות\'</span><span class="dg-l4">🔓 המנעול נפתח לבד</span></div></div>';
  var STEPS = [
    { ico: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="15" cy="12" r="1.2" fill="currentColor"/>'),
      t: "אין יותר קוד כניסה", x: "את דלת המכון פותחים מהטלפון. יש שלוש דרכים — בוחרים מה שנוח לך, ואפשר גם כמה." },
    { t: "דרך 1: הכפתור כאן באפליקציה", x: "נכנסים ל\"מכון כושר\" ולוחצים \"פתיחת הדלת\" כשעומדים ליד הדלת. בלי התקנה ובלי הרשמה נוספת.",
      demo: STAGE_TAP, raw: true },
    { t: "דרך 2: אפליקציית Nuki או השעון", x: "קיבלת מייל הזמנה מ-Nuki. מתקינים את Nuki, נרשמים עם אותו מייל ומאשרים. משם פותחים בלחיצה — גם מהשעון או מווידג'ט.",
      demo: STAGE_WATCH, raw: true },
    { t: "דרך 3: פתיחה אוטומטית", x: "באפליקציית Nuki מפעילים פעם אחת \"Auto Unlock\" ומאשרים מיקום \"תמיד\" ובלוטות'. מאז — פשוט מגיעים, והדלת נפתחת.",
      demo: STAGE_AUTO + '<div class="dg-callout">עובד רק אחרי שיצאת מהאזור וחזרת — כדי שהדלת לא תיפתח סתם כשאתה בבית. הגישה נגמרת לבד עם סוף המנוי.</div>', raw: true }
  ];

  function draw() {
    var s = STEPS[idx], last = idx === STEPS.length - 1, dots = "";
    for (var i = 0; i < STEPS.length; i++) dots += '<span class="tr-dot' + (i === idx ? " is-on" : "") + '"></span>';
    el.querySelector(".tr-card").innerHTML =
      '<button type="button" class="tr-skip" data-dg-close>' + (last ? "סגירה" : "דילוג") + "</button>" +
      '<div class="tr-body is-open">' +
        (s.ico ? '<div class="tr-ico">' + s.ico + "</div>" : "") +
        '<h2 class="tr-title">' + s.t + "</h2>" +
        '<p class="tr-text">' + s.x + "</p>" +
        (s.demo ? (s.raw ? s.demo : '<div class="dg-demo">' + s.demo + "</div>") : "") +
      "</div>" +
      '<div class="tr-foot">' +
        '<button type="button" class="tr-back" data-dg-back' + (idx === 0 ? " hidden" : "") + ">הקודם</button>" +
        '<div class="tr-dots">' + dots + "</div>" +
        '<button type="button" class="tr-next" data-dg-next>' + (last ? "הבנתי" : "הבא") + "</button>" +
      "</div>";
    var n = el.querySelector("[data-dg-next]"); if (n) n.focus();
  }
  function close() {
    try { localStorage.setItem(KEY, "1"); } catch (e) { }
    if (el) { el.remove(); el = null; }
    document.body.classList.remove("tr-open");
  }
  function open() {
    if (el) close();
    idx = 0;
    el = document.createElement("div");
    el.className = "tr";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "איך פותחים את הדלת");
    el.innerHTML = '<div class="tr-card"></div>';
    document.body.appendChild(el);
    document.body.classList.add("tr-open");
    el.addEventListener("click", function (e) {
      if (e.target === el || e.target.closest("[data-dg-close]")) { close(); return; }
      if (e.target.closest("[data-dg-next]")) { if (idx < STEPS.length - 1) { idx++; draw(); } else close(); return; }
      if (e.target.closest("[data-dg-back]")) { if (idx > 0) { idx--; draw(); } }
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowLeft" && idx < STEPS.length - 1) { idx++; draw(); }
      else if (e.key === "ArrowRight" && idx > 0) { idx--; draw(); }
    });
    draw();
  }
  function maybeAuto() {
    if (el) return;   /* כבר פתוח — ציור חוזר של המסך לא פותח אותו שוב */
    var seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch (e) { seen = true; }
    if (!seen) open();
  }
  return { open: open, close: close, maybeAuto: maybeAuto, STEPS: STEPS };
})();

/* ============================================================================
 *  CBA.doorGym.mount(el) — מה שמנוי מכון רואה בכרטיס המנוי, **רק** כשהמכון
 *  עבר לדלת (doorConfig/public.gymOn). אחרת לא מצייר כלום, והקוד הקבוע
 *  ממשיך להופיע כרגיל — כך אף אחד לא נתקע בחוץ בזמן המעבר.
 *  🔑 הקוד נעלם מצד השרת (handleGymMy_/gymStatusSyncAll_ שואלים doorGymOn_),
 *     לא רק מההסתרה כאן.
 * ========================================================================== */
CBA.doorGym = (function () {
  "use strict";
  function esc(s) { return CBA.esc ? CBA.esc(String(s == null ? "" : s)) : String(s == null ? "" : s); }
  var NUKI = {
    sent: ["gym-pill--warn", "ההזמנה נשלחה", "שלחנו לך מייל מ-Nuki. מתקינים את האפליקציה, נרשמים עם אותו מייל ומאשרים את ההזמנה."],
    active: ["gym-pill--ok", "פעילה", "אפשר לפתוח גם מאפליקציית Nuki, מהשעון ומהווידג'ט."],
    expired: ["gym-pill--muted", "פג תוקף", "הגישה ב-Nuki נגמרה יחד עם המנוי."],
    error: ["gym-pill--danger", "תקלה בשליחה", "לא הצלחנו לשלוח את ההזמנה. אפשר לנסות שוב."],
    none: ["gym-pill--muted", "בהכנה", "ההזמנה ל-Nuki תישלח למייל שלך בשעה הקרובה."]
  };

  function mount(el) {
    if (!el || !CBA.door) return;
    CBA.door.readPublic(function (err, pub) {
      if (!document.body.contains(el)) return;
      if (!pub || !pub.gymOn) { el.innerHTML = ""; el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML =
        '<div class="gym-door">' +
          '<div class="gym-door__btn" data-gd-btn></div>' +
          '<div class="gym-door__alt">או מאפליקציית Nuki, מהשעון או מהווידג\'ט</div>' +
        "</div>" +
        '<div class="gym-nuki" data-gd-nuki></div>';
      CBA.doorButton.mount(el.querySelector("[data-gd-btn]"), { reason: "gym", mode: pub.mode, size: "md" });
      drawNuki(el, pub);
      if (pub.mode !== "off") CBA.doorGuide.maybeAuto();
    });
    if (!el.__gdWired) {
      el.__gdWired = true;
      el.addEventListener("click", function (e) {
        if (e.target.closest("[data-gd-guide]")) { CBA.doorGuide.open(); return; }
        var r = e.target.closest("[data-gd-resend]");
        if (r) {
          var release = CBA.ui.busy(r, "שולח…");
          CBA.door.gymResend(function (res) {
            release();
            if (!res.ok) return CBA.ui.alert(res.error || "השליחה נכשלה");
            CBA.ui.toast("ההזמנה נשלחה שוב למייל שלך");
            mount(el);
          });
        }
      });
    }
  }

  function drawNuki(el, pub) {
    var box = el.querySelector("[data-gd-nuki]");
    if (!box) return;
    function paint(doc) {
      var key = pub.mode !== "live" ? "none" : (doc && NUKI[doc.state] ? doc.state : "none");
      var n = NUKI[key];
      var email = (CBA.user && CBA.user.email) || "";
      box.innerHTML =
        '<div class="gym-nuki__h"><b>אפליקציית Nuki</b><span class="gym-pill ' + n[0] + '">' + n[1] + "</span></div>" +
        '<div class="gym-nuki__t">' + esc(n[2]) + (email && key === "sent" ? ' <span class="gym-nuki__mail">(' + esc(email) + ")</span>" : "") + "</div>" +
        '<div class="gym-nuki__act"><button type="button" class="btn-ghost" data-gd-guide>איך פותחים את הדלת?</button>' +
          (pub.mode === "live" && (key === "sent" || key === "error") ? '<button type="button" class="btn-ghost" data-gd-resend>שליחה מחדש</button>' : "") +
        "</div>";
    }
    paint(null);
    CBA.door.readGymNuki(function (err, doc) { if (!err && document.body.contains(box)) paint(doc); });
  }

  return { mount: mount };
})();
