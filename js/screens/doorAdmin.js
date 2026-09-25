/* ============================================================================
 *  doorAdmin.js — כרטיס "בקרת כניסה" במסך המכון + לשונית ההגדרות שלה  (26.9.2026)
 * ----------------------------------------------------------------------------
 *  בקשת יועד (26.9): "מסך אחד עם שני כרטיסים, קומפקטי" + "הגדרות בקרת כניסה
 *  במקום הגדרות חיבור, ושם גם למי מתקשרים".
 *    • render(el)          — הכרטיס: שורת מצב המנעול, פתיחה מרחוק, כניסות היום.
 *    • mountSetup(pane,el) — לשונית "בקרת כניסה" בגיליון ההגדרות של המכון:
 *        מנהל-על: חיבור ל-Nuki → מצב הדלת + סוג הפעולה → המכון עובר לדלת.
 *        כל מנהל מכון: איש הקשר לתקלה.
 *    • onSettings          — gymAdmin מחבר כאן את פתיחת הגיליון על הלשונית.
 *  🔐 הטוקן נשלח לשרת ולא חוזר לעולם. המנעול נבחר מהרשימה של Nuki.
 *  👤 ביומן — שם פרטי של מי שלחץ (slot 1/2 מהיומן + ספריית התושבים), לא
 *     "משפחה X". השם עצמו לא נשמר ב-Firestore.
 * ========================================================================== */
window.CBA = window.CBA || {};

CBA.doorAdmin = (function () {
  "use strict";
  var st = { s: null, log: null, err: "", all: false };
  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }
  function D() { return CBA.door; }
  var MODE_LABEL = { off: "כבויה", sim: "הדמיה", live: "אמיתי" };
  var ACTION_LABEL = { 3: "שחרור לשונית", 1: "פתיחת נעילה בלבד" };

  function who(e) {
    var n = e && CBA.data && CBA.data.personName ? CBA.data.personName(e.familyId, e.slot) : "";
    if (n) return n;
    var f = e && e.familyId && CBA.data && CBA.data.familyDisplayName ? CBA.data.familyDisplayName(e.familyId) : "";
    return f || "תושב";
  }
  function hm(ms) { var d = new Date(ms); return D().pad(d.getHours()) + ":" + D().pad(d.getMinutes()); }

  /* ------------------------------------------------------------ הכרטיס --- */
  function lockLineHTML() {
    var s = st.s, stt = (s && s.state) || {};
    var tone, title, sub;
    if (!s) { tone = "muted"; title = "בודק את הדלת…"; sub = ""; }
    else if (s.mode === "off") { tone = "muted"; title = "הדלת כבויה"; sub = "הכפתור לא פותח. קוד הכניסה פעיל"; }
    else if (s.mode === "sim") { tone = "muted"; title = "מצב הדמיה"; sub = "פתיחות נרשמות ביומן, הדלת לא זזה"; }
    else if (stt.error || !stt.online) { tone = "danger"; title = "המנעול לא עונה"; sub = stt.errorText || "ייתכן שהוא מנותק מהרשת"; }
    else {
      tone = (stt.batteryCritical || (stt.battery >= 0 && stt.battery < 20)) ? "warn" : "ok";
      title = "הדלת מחוברת";
      sub = (stt.battery >= 0 ? "סוללה " + stt.battery + "%" : "") + (stt.lastCheckMs ? " · נבדק " + hm(stt.lastCheckMs) : "");
    }
    return '<div class="da-line da-line--' + tone + '"><span class="da-dot"></span>' +
      '<div class="da-line__t"><b>' + esc(title) + "</b><small>" + esc(sub) + "</small></div>" +
      (s && s.mode !== "off" ? '<button type="button" class="btn-primary btn-sm" data-da-open>פתיחה מרחוק</button>' : "") + "</div>";
  }
  function logHTML() {
    if (!st.log) return CBA.skel ? CBA.skel.rows(3) : "";
    if (!st.log.length) return '<div class="ww-note">אין כניסות היום עדיין.</div>';
    var rows = st.all ? st.log : st.log.slice(0, 6);
    return '<div class="da-log">' + rows.map(function (e) {
      var kind = e.kind === "wework" ? "WeWork" : e.kind === "gym" ? "מכון" : "ניהול";
      var how = e.result === "fail" ? (e.error ? "נכשל · " + e.error : "המנעול לא ענה") :
        (e.source === "nuki" ? "אפליקציית Nuki" : "כפתור באפליקציה") + (e.result === "sim" ? " · הדמיה" : "") +
        (e.ms ? " · " + (Math.round(e.ms / 100) / 10) + " ש׳" : "");
      return '<div class="da-lg' + (e.result === "fail" ? " is-fail" : "") + '"><span class="da-lg__t">' + hm(e.atMs) + "</span>" +
        "<div><b>" + esc(who(e)) + "</b><small>" + esc(how) + "</small></div>" +
        '<span class="gym-pill gym-pill--' + (e.result === "fail" ? "danger" : "muted") + '">' + (e.result === "fail" ? "תקלה" : kind) + "</span></div>";
    }).join("") + "</div>";
  }
  function footHTML() {
    if (!st.log) return "";
    var ok = st.log.filter(function (e) { return e.result !== "fail"; }).length, bad = st.log.length - ok;
    return '<div class="da-foot"><span>היום: ' + ok + " כניסות" + (bad ? " · " + bad + " תקלות" : "") + "</span>" +
      (st.log.length > 6 ? '<button type="button" class="da-link" data-da-all>' + (st.all ? "פחות" : "כל היום (" + st.log.length + ")") + "</button>" : "") +
      '<button type="button" class="da-link" data-da-settings>הגדרות בקרת כניסה</button></div>';
  }
  function html() {
    return '<div class="ga-card__h"><div class="club-sec__title">בקרת כניסה</div></div>' +
      '<div data-da-line>' + lockLineHTML() + "</div>" +
      (st.err ? '<div class="ww-why">' + esc(st.err) + "</div>" : "") +
      '<div data-da-log>' + logHTML() + "</div>" +
      '<div data-da-foot>' + footHTML() + "</div>";
  }
  function redraw(el) {
    var l = el.querySelector("[data-da-line]"); if (l) l.innerHTML = lockLineHTML();
    var g = el.querySelector("[data-da-log]"); if (g) g.innerHTML = logHTML();
    var f = el.querySelector("[data-da-foot]"); if (f) f.innerHTML = footHTML();
  }

  function render(el) {
    if (!el || !CBA.door) return;
    /* רענון שקט של gymAdmin מצייר מחדש — לא שולחים שוב בקשה על כל רענון. */
    if (CBA.renderSilent && st.s) {
      el.innerHTML = html();
      if (!el.__daWired) { wire(el); el.__daWired = true; }
      return;
    }
    el.innerHTML = html();
    if (!el.__daWired) { wire(el); el.__daWired = true; }
    D().status(function (res) {
      if (!document.body.contains(el)) return;
      if (res.ok) { st.s = res; st.err = ""; } else st.err = res.error || "לא הצלחנו לקרוא את מצב הדלת";
      el.innerHTML = html();
    });
    D().dayLog(D().today(), "", function (err, rows) {
      st.log = err ? [] : rows;
      redraw(el);
      if (CBA.data && CBA.data.ensureFamilyNames) CBA.data.ensureFamilyNames(function () { redraw(el); });
    });
  }

  function wire(el) {
    el.addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-da-open]"))) {
        CBA.ui.confirm("לפתוח את הדלת עכשיו מרחוק?", { title: "פתיחה מרחוק", okText: "פתיחה" }).then(function (ok) {
          if (!ok) return;
          var release = CBA.ui.busy(t, "פותח…");
          D().open("admin", "", function (res) {
            release();
            if (!res.ok) return CBA.ui.alert(res.error || "הדלת לא נפתחה");
            CBA.ui.toast(res.simulated ? "הדמיה: נרשם ביומן" : "הדלת נפתחה");
            setTimeout(function () { render(el); }, 2500);   /* היומן נכתב ברקע */
          });
        });
        return;
      }
      if (e.target.closest("[data-da-all]")) { st.all = !st.all; redraw(el); return; }
      if (e.target.closest("[data-da-settings]") && api.onSettings) api.onSettings();
    });
  }

  /* ------------------------------------------ לשונית "בקרת כניסה" בהגדרות --- */
  var su = { locks: null, msg: null, busy: "" };   /* msg: {step, ok, text} */
  function stepMsg(n) {
    if (!su.msg || su.msg.step !== n) return "";
    return '<div class="' + (su.msg.ok ? "da-ok" : "da-bad") + '" role="status">' + esc(su.msg.text) + "</div>";
  }
  function contactStepHTML(n) {
    var c = (st.s && st.s.contact) || {};
    return '<section class="da-step"><div class="da-step__n">' + n + '</div><div class="da-step__b">' +
      "<h3>למי מתקשרים כשהדלת לא נפתחת</h3>" +
      '<div class="da-inline"><input type="text" id="da-cname" placeholder="שם" value="' + esc(c.name || "") + '">' +
      '<input type="tel" id="da-cphone" placeholder="טלפון" dir="ltr" value="' + esc(c.phone || "") + '">' +
      '<button type="button" class="btn-ghost btn-sm" data-da-contact>שמירה</button></div>' +
      '<p class="ww-note">מוצג לתושב רק כשהפתיחה נכשלה. התראות (סוללה חלשה, ניתוק, פתיחה שנכשלה) נשלחות למנהלי המכון במייל ובפוש.</p>' + stepMsg(n) +
      "</div></section>";
  }
  function setupHTML() {
    var s = st.s || {}, stt = s.state || {};
    if (!st.s) return '<div class="ww-note">טוען…</div>';
    if (!CBA.isSuper) return '<div class="da-setup">' + contactStepHTML(1) + "</div>";
    var lockOk = !!(s.tokenSet && s.lockId && !(s.mode === "live" && stt.error));
    var locks = su.locks ? su.locks.map(function (l) {
      var on = String(l.id) === String(s.lockId);
      return '<button type="button" class="da-lock' + (on ? " is-on" : "") + '" data-da-pick="' + esc(l.id) + '" aria-pressed="' + on + '">' +
        "<b>" + esc(l.name || "מנעול") + "</b><small>" + (l.online ? "מחובר" : "לא מחובר") +
        (l.battery >= 0 ? " · סוללה " + l.battery + "%" : "") + "</small></button>";
    }).join("") : "";
    function seg(m) {
      var dis = m === "live" && !lockOk;
      return '<button type="button" class="ww-seat" data-da-mode="' + m + '" aria-pressed="' + (s.modeRaw === m) + '"' + (dis ? " disabled" : "") + ">" + MODE_LABEL[m] + "</button>";
    }
    function act(a) {
      return '<button type="button" class="ww-seat" data-da-action="' + a + '" aria-pressed="' + (Number(s.action || 3) === a) + '">' + ACTION_LABEL[a] + "</button>";
    }
    return '<div class="da-setup">' +
      '<section class="da-step' + (lockOk ? " is-done" : "") + '"><div class="da-step__n">1</div><div class="da-step__b">' +
        "<h3>חיבור ל-Nuki</h3>" +
        (lockOk && !(su.msg && su.msg.step === 1) ? '<div class="da-ok">מחובר ל' + esc(s.lockName || "מנעול") + (stt.battery >= 0 ? " · סוללה " + stt.battery + "%" : "") + "</div>" : "") +
        (lockOk ? "" : '<p class="ww-note">מדביקים את המפתח (API token) מ-web.nuki.io ולוחצים "בדיקה". המנעול נבחר לבד.</p>') +
        '<div class="da-inline"><input type="password" id="da-token" autocomplete="off" placeholder="' + (s.tokenSet ? "המפתח שמור · להחלפה מדביקים חדש" : "להדביק כאן את המפתח") + '">' +
        '<button type="button" class="btn-primary btn-sm" data-da-test>' + (su.busy === "test" ? "בודק…" : "בדיקה") + "</button></div>" +
        (locks ? '<div class="da-locks">' + locks + "</div>" : "") + stepMsg(1) +
      "</div></section>" +
      '<section class="da-step' + (lockOk ? "" : " is-locked") + '"><div class="da-step__n">2</div><div class="da-step__b">' +
        "<h3>מצב הדלת</h3>" +
        '<div class="ww-seats">' + seg("off") + seg("sim") + seg("live") + "</div>" +
        '<p class="ww-note"><b>כבויה</b> — הכפתור לא פותח. <b>הדמיה</b> — הכול עובד ונרשם ביומן, הדלת לא זזה. <b>אמיתי</b> — כל לחיצה פותחת באמת' + (lockOk ? "" : " (זמין אחרי שלב 1)") + ".</p>" +
        '<div class="ww-lbl">מה הלחיצה עושה</div><div class="ww-seats">' + act(3) + act(1) + "</div>" +
        '<p class="ww-note">"שחרור לשונית" פותח את הדלת עד הסוף. אם המנוע נתקע או ממשיך לרוץ — "פתיחת נעילה בלבד", ואז דוחפים את הידית.</p>' + stepMsg(2) +
      "</div></section>" +
      '<section class="da-step' + (s.mode === "live" ? "" : " is-locked") + '"><div class="da-step__n">3</div><div class="da-step__b">' +
        "<h3>המכון עובר לדלת</h3>" +
        '<label class="da-switch' + (s.mode !== "live" ? " is-off" : "") + '"><input type="checkbox" data-da-gymon' + (s.gymOn ? " checked" : "") + (s.mode !== "live" && !s.gymOn ? " disabled" : "") + ">" +
          "<span><b>" + (s.gymOn ? "פעיל — קוד הכניסה מוסתר" : "כבוי — קוד הכניסה פעיל") + "</b><small>" + (s.mode !== "live"
            ? "זמין רק כשהדלת במצב אמיתי ועובדת." + (s.gymWanted ? " (מופעל, אבל מושהה עד שהדלת תחזור לעבוד.)" : "")
            : "מסתיר את קוד הכניסה ושולח למנויים הזמנות Nuki. אפשר להחזיר בכל רגע.") + "</small></span></label>" + stepMsg(3) +
      "</div></section>" +
      contactStepHTML(4) +
    "</div>";
  }

  function mountSetup(pane, cardEl) {
    if (!pane) return;
    su = { locks: null, msg: null, busy: "" };
    function paint() { pane.innerHTML = setupHTML(); }
    function after(res, step, okText) {
      if (res && res.ok) { if (res.status) st.s = res.status; else if (res.mode) st.s = res; su.msg = okText ? { step: step, ok: true, text: okText } : null; }
      else su.msg = { step: step, ok: false, text: (res && res.error) || "משהו השתבש. נסו שוב." };
      paint();
      if (cardEl && document.body.contains(cardEl)) redraw(cardEl);
    }
    paint();
    if (!st.s) D().status(function (res) { if (res && res.ok) st.s = res; paint(); });
    var contactStep = CBA.isSuper ? 4 : 1;
    pane.addEventListener("click", function (e) {
      var t;
      if ((t = e.target.closest("[data-da-test]"))) {
        if (su.busy) return;
        var tokIn = pane.querySelector("#da-token"), tok = tokIn ? tokIn.value.trim() : "";
        if (!tok && !(st.s && st.s.tokenSet)) { su.msg = { step: 1, ok: false, text: "צריך קודם להדביק את המפתח." }; paint(); return; }
        su.busy = "test"; su.msg = null; paint();
        D().testConnection(tok ? { token: tok } : {}, function (res) {
          su.busy = "";
          if (res.ok) su.locks = res.locks || [];
          var name = res.ok && res.picked ? ((res.locks || []).filter(function (l) { return String(l.id) === String(res.picked); })[0] || {}).name : "";
          after(res, 1, !res.ok ? "" : res.picked ? "המפתח עובד ✓ מחובר ל" + (name || "מנעול") + "." : "המפתח עובד ✓ בוחרים מנעול מהרשימה.");
        });
        return;
      }
      if ((t = e.target.closest("[data-da-pick]"))) {
        D().configure({ lockId: t.getAttribute("data-da-pick") }, function (res) { after(res, 1, "המנעול נבחר ✓"); });
        return;
      }
      if ((t = e.target.closest("[data-da-action]"))) {
        var a = Number(t.getAttribute("data-da-action"));
        D().configure({ action: a }, function (res) { after(res, 2, "נשמר: " + ACTION_LABEL[a] + " ✓"); });
        return;
      }
      if ((t = e.target.closest("[data-da-mode]"))) {
        var m = t.getAttribute("data-da-mode");
        var go = function () {
          su.msg = { step: 2, ok: true, text: "שומר…" }; paint();
          D().configure({ mode: m }, function (res) { after(res, 2, "מצב הדלת: " + MODE_LABEL[m] + " ✓"); });
        };
        if (m === "live") CBA.ui.confirm("לעבור למצב אמיתי? מעכשיו כל לחיצה תפתח את הדלת באמת.", { title: "מצב אמיתי", okText: "לעבור" }).then(function (ok) { if (ok) go(); });
        else go();
        return;
      }
      if ((t = e.target.closest("[data-da-contact]"))) {
        var n = pane.querySelector("#da-cname"), ph = pane.querySelector("#da-cphone");
        var rel = CBA.ui.busy(t, "שומר…");
        D().saveContact({ name: n ? n.value : "", phone: ph ? ph.value : "" }, function (res) {
          rel();
          if (res && res.ok && st.s) st.s.contact = res.contact;
          after(res, contactStep, "נשמר ✓");
        });
      }
    });
    pane.addEventListener("change", function (e) {
      var cb = e.target.closest("[data-da-gymon]");
      if (!cb) return;
      var want = cb.checked;
      var msg = want ? "להעביר את המכון לדלת? קוד הכניסה הקבוע יוסתר מכל המנויים, והם יקבלו הזמנות Nuki." :
        "להחזיר את קוד הכניסה הקבוע? כפתור הדלת ייעלם ממסך המנויים.";
      CBA.ui.confirm(msg, { title: "המכון והדלת", okText: want ? "להעביר" : "להחזיר" }).then(function (ok) {
        if (!ok) { cb.checked = !want; return; }
        D().configure({ gymOn: want }, function (res) { after(res, 3, want ? "המכון עבר לדלת ✓" : "קוד הכניסה חזר ✓"); });
      });
    });
  }

  var api = { render: render, mountSetup: mountSetup, onSettings: null };
  return api;
})();
