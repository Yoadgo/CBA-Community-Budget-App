/* ============================================================================
 *  doorAdmin.js — כרטיס "הדלת" בתוך ניהול המכון   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  מסך 4 בסקיצה. לא מסך נפרד ולא לשונית — כרטיס בראש gymAdmin
 *  (gymAdmin אין לו לשוניות, ר' CBA.doorAdmin.render בתוך render שלו).
 *    • כל מנהל מכון: מצב המנעול, סוללה, פתיחות היום, יומן, פתיחה מרחוק,
 *      ואיש הקשר שמוצג לתושב כשהפתיחה נכשלת.
 *    • מנהל-על בלבד: שורת מצב + כפתור "הגדרות חיבור" שפותח מסך נפרד בשלושה
 *      שלבים (חיבור ל-Nuki → מצב הדלת → המכון עובר לדלת). 🔐 הטוקן נשלח
 *      לשרת ולא חוזר לעולם. המנעול נבחר מהרשימה של Nuki — לא מקלידים מזהה.
 * ========================================================================== */
window.CBA = window.CBA || {};

CBA.doorAdmin = (function () {
  "use strict";
  var st = { s: null, log: null, nuki: null, err: "" };
  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }
  function D() { return CBA.door; }
  var MODE_LABEL = { off: "כבויה", sim: "הדמיה", live: "אמיתי" };

  function famName(fid) {
    var n = fid && CBA.data && CBA.data.familyDisplayName ? CBA.data.familyDisplayName(fid) : "";
    return n || (fid ? "משפחה " + fid : "—");
  }
  function hm(ms) { var d = new Date(ms); return D().pad(d.getHours()) + ":" + D().pad(d.getMinutes()); }

  function kpisHTML() {
    var s = st.s, stt = (s && s.state) || {};
    var lock = !s ? "…" : s.mode === "off" ? "כבויה" : s.mode === "sim" ? "הדמיה" : (stt.online ? "מחוברת" : "מנותקת");
    var tone = !s ? "" : s.mode === "live" ? (stt.online ? "ok" : "danger") : "muted";
    var batt = !s ? "…" : (stt.battery >= 0 ? stt.battery + "%" : "—");
    var opens = st.log ? st.log.filter(function (e) { return e.result !== "fail"; }).length : "…";
    var fails = st.log ? st.log.filter(function (e) { return e.result === "fail"; }).length : 0;
    var nuki = st.nuki ? st.nuki.filter(function (d) { return d.state === "sent" || d.state === "active"; }).length : "…";
    var pend = st.nuki ? st.nuki.filter(function (d) { return d.state === "sent"; }).length : 0;
    function tile(l, v, sub, t) { return '<div class="wa-kpi' + (t ? " wa-kpi--" + t : "") + '"><div class="wa-kpi__l">' + l + '</div><div class="wa-kpi__v">' + v + '</div><div class="wa-kpi__s">' + sub + "</div></div>"; }
    return '<div class="wa-kpis wa-kpis--4">' +
      tile("המנעול", lock, s && s.state && s.state.lastCheckMs ? "בדיקה אחרונה " + hm(s.state.lastCheckMs) : "&nbsp;", tone) +
      tile("סוללה", batt, s && stt.batteryCritical ? "קריטית!" : "&nbsp;", s && (stt.batteryCritical || (stt.battery >= 0 && stt.battery < 20)) ? "danger" : "") +
      tile("פתיחות היום", opens, fails ? fails + " נכשלו" : "&nbsp;", fails ? "warn" : "") +
      tile("גישת Nuki", nuki + " <small>פעילים</small>", pend ? pend + " טרם אישרו" : "&nbsp;") +
      "</div>";
  }

  function logHTML() {
    if (!st.log) return CBA.skel.rows(3);
    if (!st.log.length) return '<div class="ww-note">אין פתיחות היום עדיין.</div>';
    return '<div class="wa-list">' + st.log.slice(0, 12).map(function (e) {
      var kind = e.kind === "wework" ? "WeWork" : e.kind === "gym" ? "מכון" : "ניהול";
      var src = e.source === "nuki" ? "אפליקציית Nuki" : "כפתור באפליקציה";
      var res = e.result === "fail" ? "נכשל: " + (e.error || "המנעול לא ענה") : e.result === "sim" ? src + " · הדמיה" : src;
      return '<div class="wa-row wa-row--log' + (e.result === "fail" ? " is-fail" : "") + '">' +
        '<span class="wa-row__t">' + hm(e.atMs) + "</span>" +
        '<div class="wa-row__who"><b>' + esc(famName(e.familyId)) + "</b><div>" + esc(res) + "</div></div>" +
        '<span class="gym-pill gym-pill--' + (e.result === "fail" ? "danger" : "muted") + '">' + (e.result === "fail" ? "תקלה" : kind) + "</span></div>";
    }).join("") + "</div>";
  }

  /* ⚙ 25.9 (בקשת יועד, דיווח 30): הגדרות החיבור עברו למסך נפרד (setupHTML
     למטה), נפתח מכפתור בכרטיס. בכרטיס נשארת רק שורת מצב אחת. */
  function superHTML() {
    if (!CBA.isSuper || !st.s) return "";
    var s = st.s, stt = s.state || {};
    var line = s.mode === "live" && stt.errorText ? '<span class="da-bad">' + esc(stt.errorText) + "</span>" :
      !s.tokenSet ? "עוד לא חובר מנעול" :
      "מצב: <b>" + MODE_LABEL[s.mode] + "</b>" + (s.lockName ? " · " + esc(s.lockName) : "") + (s.gymOn ? " · המכון עבר לדלת" : " · קוד הכניסה פעיל");
    return '<div class="da-super da-super--line"><span>' + line + "</span>" +
      '<button type="button" class="btn-ghost btn-sm" data-da-setup>הגדרות חיבור</button></div>';
  }

  /* ---------------------------------------------------- מסך הגדרות החיבור --- */
  var su = { locks: null, msg: null, busy: "" };   /* msg: {step, ok, text} */
  function stepMsg(n) {
    if (!su.msg || su.msg.step !== n) return "";
    return '<div class="' + (su.msg.ok ? "da-ok" : "da-bad") + '" role="status">' + esc(su.msg.text) + "</div>";
  }
  function setupHTML() {
    var s = st.s || {}, stt = s.state || {};
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
    return '<div class="da-setup">' +
      '<div class="da-setup__h"><h2>הגדרות חיבור הדלת</h2><button type="button" class="btn-ghost btn-sm" data-da-close>סגירה</button></div>' +
      '<section class="da-step' + (lockOk ? " is-done" : "") + '"><div class="da-step__n">1</div><div class="da-step__b">' +
        "<h3>חיבור ל-Nuki</h3>" +
        (lockOk && !(su.msg && su.msg.step === 1) ? '<div class="da-ok">מחובר ל' + esc(s.lockName || "מנעול") + "</div>" : lockOk ? "" : '<p class="ww-note">מדביקים את המפתח (API token) מ-web.nuki.io ולוחצים "בדיקה". המנעול נבחר לבד.</p>') +
        '<div class="da-inline"><input type="password" id="da-token" autocomplete="off" placeholder="' + (s.tokenSet ? "המפתח שמור · להחלפה מדביקים חדש" : "להדביק כאן את המפתח") + '">' +
        '<button type="button" class="btn-primary btn-sm" data-da-test>' + (su.busy === "test" ? "בודק…" : "בדיקה") + "</button></div>" +
        (locks ? '<div class="da-locks">' + locks + "</div>" : "") + stepMsg(1) +
      "</div></section>" +
      '<section class="da-step' + (lockOk ? "" : " is-locked") + '"><div class="da-step__n">2</div><div class="da-step__b">' +
        "<h3>מצב הדלת</h3>" +
        '<div class="ww-seats">' + seg("off") + seg("sim") + seg("live") + "</div>" +
        '<p class="ww-note"><b>כבויה</b> — הכפתור לא פותח. <b>הדמיה</b> — הכול עובד ונרשם ביומן, הדלת לא זזה. <b>אמיתי</b> — כל לחיצה פותחת באמת' + (lockOk ? "" : " (זמין אחרי שלב 1)") + ".</p>" + stepMsg(2) +
      "</div></section>" +
      '<section class="da-step' + (s.mode === "live" ? "" : " is-locked") + '"><div class="da-step__n">3</div><div class="da-step__b">' +
        "<h3>המכון עובר לדלת</h3>" +
        '<label class="da-switch' + (s.mode !== "live" ? " is-off" : "") + '"><input type="checkbox" data-da-gymon' + (s.gymOn ? " checked" : "") + (s.mode !== "live" && !s.gymOn ? " disabled" : "") + ">" +
          "<span><b>" + (s.gymOn ? "פעיל — קוד הכניסה מוסתר" : "כבוי — קוד הכניסה פעיל") + "</b><small>" + (s.mode !== "live"
            ? "זמין רק כשהדלת במצב אמיתי ועובדת." + (s.gymWanted ? " (מופעל, אבל מושהה עד שהדלת תחזור לעבוד.)" : "")
            : "מסתיר את קוד הכניסה ושולח למנויים הזמנות Nuki. אפשר להחזיר בכל רגע.") + "</small></span></label>" + stepMsg(3) +
      "</div></section>" +
    "</div>";
  }
  function openSetup(cardEl) {
    su = { locks: null, msg: null, busy: "" };
    return CBA.ui.sheet({ label: "הגדרות חיבור הדלת", sheetCls: "da-sheet", html: setupHTML(), onMount: function (wrap, close) {
      var box = wrap.querySelector(".gt-sheet");
      function paint() {
        var grip = box.querySelector(".gt-grip");
        box.innerHTML = ""; if (grip) box.appendChild(grip);
        box.insertAdjacentHTML("beforeend", setupHTML());
      }
      function after(res, step, okText) {
        if (res && res.ok) { if (res.status) st.s = res.status; else if (res.mode) st.s = res; su.msg = okText ? { step: step, ok: true, text: okText } : null; }
        else su.msg = { step: step, ok: false, text: (res && res.error) || "משהו השתבש. נסו שוב." };
        paint();
        if (cardEl && document.body.contains(cardEl)) { cardEl.innerHTML = html(); redraw(cardEl); }
      }
      wrap.addEventListener("click", function (e) {
        var t;
        if (e.target.closest("[data-da-close]")) { close(); return; }
        if ((t = e.target.closest("[data-da-test]"))) {
          if (su.busy) return;
          var tokIn = wrap.querySelector("#da-token"), tok = tokIn ? tokIn.value.trim() : "";
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
        if ((t = e.target.closest("[data-da-mode]"))) {
          var m = t.getAttribute("data-da-mode");
          var go = function () {
            su.msg = { step: 2, ok: true, text: "שומר…" }; paint();
            D().configure({ mode: m }, function (res) { after(res, 2, "מצב הדלת: " + MODE_LABEL[m] + " ✓"); });
          };
          if (m === "live") CBA.ui.confirm("לעבור למצב אמיתי? מעכשיו כל לחיצה תפתח את הדלת באמת.", { title: "מצב אמיתי", okText: "לעבור" }).then(function (ok) { if (ok) go(); });
          else go();
        }
      });
      wrap.addEventListener("change", function (e) {
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
    } });
  }

  function contactHTML() {
    var c = (st.s && st.s.contact) || {};
    return '<div class="da-contact"><div class="ww-sec-t">למי מתקשרים כשהדלת לא נפתחת</div>' +
      '<div class="ww-note">מוצג לתושב רק כשהפתיחה נכשלה.</div>' +
      '<div class="da-inline"><input type="text" id="da-cname" placeholder="שם" value="' + esc(c.name || "") + '">' +
      '<input type="tel" id="da-cphone" placeholder="טלפון" dir="ltr" value="' + esc(c.phone || "") + '">' +
      '<button type="button" class="btn-ghost btn-sm" data-da-contact>שמירה</button></div></div>';
  }

  function html() {
    return '<div class="ww-sec-h"><div class="ww-sec-t">הדלת</div>' +
        '<button type="button" class="btn-ghost btn-sm" data-da-open>פתיחה מרחוק</button></div>' +
      '<div data-da-kpis>' + kpisHTML() + "</div>" +
      (st.err ? '<div class="ww-why">' + esc(st.err) + "</div>" : "") +
      '<div class="da-grid"><div><div class="ww-lbl">כניסות היום</div><div data-da-log>' + logHTML() + "</div></div>" +
        "<div>" + contactHTML() +
          '<div class="ww-note">התראות (סוללה מתחת ל-20%, ניתוק, פתיחה שנכשלה) נשלחות למנהלי המכון במייל ובפוש — אפשר לכבות ב"ניהול התראות".</div>' +
        "</div></div>" +
      superHTML();
  }

  function render(el) {
    if (!el || !CBA.door) return;
    /* רענון שקט של gymAdmin מצייר מחדש את כל המסך — לא שולחים שוב
       בקשה ל-Apps Script על כל רענון, רק מציירים ממה שכבר יש. */
    if (CBA.renderSilent && st.s) {
      el.innerHTML = html(); redraw(el);
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
      if (CBA.data && CBA.data.ensureFamilyNames) CBA.data.ensureFamilyNames(function () { redraw(el); });
      redraw(el);
    });
    if (CBA.fb && CBA.fb.readCollection) {
      CBA.fb.readCollection("gymNuki", function (err, rows) { st.nuki = err ? [] : (rows || []); redraw(el); });
    }
  }
  function redraw(el) {
    var k = el.querySelector("[data-da-kpis]"); if (k) k.innerHTML = kpisHTML();
    var l = el.querySelector("[data-da-log]"); if (l) l.innerHTML = logHTML();
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
            render(el);
          });
        });
        return;
      }
      if (e.target.closest("[data-da-setup]")) { openSetup(el); return; }
      if ((t = e.target.closest("[data-da-contact]"))) {
        var n = el.querySelector("#da-cname"), ph = el.querySelector("#da-cphone");
        var rel = CBA.ui.busy(t, "שומר…");
        D().saveContact({ name: n ? n.value : "", phone: ph ? ph.value : "" }, function (res) {
          rel();
          if (!res.ok) return CBA.ui.alert(res.error || "השמירה נכשלה");
          CBA.ui.toast("נשמר");
        });
      }
    });
  }

  return { render: render };
})();
