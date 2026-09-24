/* ============================================================================
 *  doorAdmin.js — כרטיס "הדלת" בתוך ניהול המכון   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  מסך 4 בסקיצה. לא מסך נפרד ולא לשונית — כרטיס בראש gymAdmin
 *  (gymAdmin אין לו לשוניות, ר' CBA.doorAdmin.render בתוך render שלו).
 *    • כל מנהל מכון: מצב המנעול, סוללה, פתיחות היום, יומן, פתיחה מרחוק,
 *      ואיש הקשר שמוצג לתושב כשהפתיחה נכשלת.
 *    • מנהל-על בלבד: מצב הדלת (כבוי/הדמיה/אמיתי), מעבר המכון מקוד לדלת,
 *      טוקן Nuki ומזהה המנעול. 🔐 הטוקן נשלח לשרת ולא חוזר לעולם.
 * ========================================================================== */
window.CBA = window.CBA || {};

CBA.doorAdmin = (function () {
  "use strict";
  var st = { s: null, log: null, nuki: null, err: "" };
  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }
  function D() { return CBA.door; }
  var MODE_LABEL = { off: "כבויה", sim: "הדמיה", live: "מחוברת" };

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

  function superHTML() {
    if (!CBA.isSuper || !st.s) return "";
    var s = st.s;
    function seg(m) { return '<button type="button" class="ww-seat" data-da-mode="' + m + '" aria-pressed="' + (s.modeRaw === m) + '">' + MODE_LABEL[m] + "</button>"; }
    return '<div class="da-super">' +
      '<div class="ww-sec-t">הגדרות חיבור <span class="gym-pill gym-pill--muted">מנהל-על</span></div>' +
      '<div class="ww-lbl">מצב הדלת</div><div class="ww-seats">' + seg("off") + seg("sim") + seg("live") + "</div>" +
      '<div class="ww-note">הדמיה = הכול עובד והפתיחה נרשמת ביומן, בלי לפתוח באמת. אמיתי דורש טוקן ומזהה מנעול.</div>' +
      '<label class="da-switch' + (s.mode !== "live" ? " is-off" : "") + '"><input type="checkbox" id="da-gymon" data-da-gymon' + (s.gymOn ? " checked" : "") + (s.mode !== "live" && !s.gymOn ? " disabled" : "") + '>' +
        "<span><b>המכון עובר לדלת</b><small>" + (s.mode !== "live"
          ? "זמין רק כשהדלת במצב אמיתי ועובדת — אחרת מנויים יישארו בלי קוד ובלי דלת." + (s.gymWanted ? " (מופעל, אבל מושהה עד שהדלת תחזור לעבוד — הקוד מוצג בינתיים.)" : "")
          : "מסתיר את קוד הכניסה הקבוע ומציג למנויים את כפתור הדלת. אפשר להחזיר בכל רגע.") + "</small></span></label>" +
      '<div class="gym-field"><label for="da-token">טוקן Nuki Web API ' + (s.tokenSet ? '<span class="gym-pill gym-pill--ok">שמור</span>' : '<span class="gym-pill gym-pill--warn">חסר</span>') + "</label>" +
        '<input type="password" id="da-token" autocomplete="off" placeholder="' + (s.tokenSet ? "להחלפה — להדביק טוקן חדש" : "להדביק כאן את הטוקן מ-Nuki Web") + '"></div>' +
      '<div class="gym-field"><label for="da-lock">מזהה המנעול</label>' +
        '<div class="da-inline"><input type="text" inputmode="numeric" id="da-lock" value="' + esc(s.lockId === "set" ? "" : (s.lockId || "")) + '" placeholder="מספר">' +
        '<button type="button" class="btn-ghost btn-sm" data-da-test>בדיקת חיבור</button></div><div data-da-locks></div></div>' +
      '<button type="button" class="btn-primary" data-da-save>שמירת החיבור</button>' +
    "</div>";
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
      if ((t = e.target.closest("[data-da-mode]"))) {
        var m = t.getAttribute("data-da-mode");
        var go = function () {
          var release = CBA.ui.busy(t, "…");
          D().configure({ mode: m }, function (res) {
            release();
            if (!res.ok) return CBA.ui.alert(res.error || "השמירה נכשלה");
            st.s = res; CBA.ui.toast("מצב הדלת: " + MODE_LABEL[res.mode]); el.innerHTML = html(); redraw(el);
          });
        };
        if (m === "live") CBA.ui.confirm("לעבור למצב אמיתי? מעכשיו כל לחיצה תפתח את הדלת באמת.", { title: "מצב אמיתי", okText: "לעבור" }).then(function (ok) { if (ok) go(); });
        else go();
        return;
      }
      if ((t = e.target.closest("[data-da-test]"))) {
        var tokIn = el.querySelector("#da-token");
        var runTest = function () {
          var release = CBA.ui.busy(t, "בודק…");
          D().testConnection(function (res) {
            release();
            var box = el.querySelector("[data-da-locks]");
            if (!res.ok) { if (box) box.innerHTML = '<div class="ww-why">' + esc(res.error) + "</div>"; return; }
            if (box) box.innerHTML = '<div class="ww-note">החיבור עובד. בחר/י מנעול:</div>' + (res.locks || []).map(function (l) {
              return '<button type="button" class="btn-ghost btn-sm" data-da-pick="' + esc(l.id) + '">' + esc(l.name || "מנעול") + " · " + esc(l.id) + "</button>";
            }).join(" ");
          });
        };
        if (tokIn && tokIn.value.trim()) {
          D().configure({ token: tokIn.value.trim() }, function (res) {
            if (!res.ok) return CBA.ui.alert(res.error || "שמירת הטוקן נכשלה");
            tokIn.value = ""; st.s = res; runTest();
          });
        } else runTest();
        return;
      }
      if ((t = e.target.closest("[data-da-pick]"))) {
        var li = el.querySelector("#da-lock"); if (li) li.value = t.getAttribute("data-da-pick");
        return;
      }
      if ((t = e.target.closest("[data-da-save]"))) {
        var p = {};
        var tok = el.querySelector("#da-token"), lk = el.querySelector("#da-lock");
        if (tok && tok.value.trim()) p.token = tok.value.trim();
        if (lk) p.lockId = lk.value.trim();
        var release = CBA.ui.busy(t, "שומר…");
        D().configure(p, function (res) {
          release();
          if (!res.ok) return CBA.ui.alert(res.error || "השמירה נכשלה");
          st.s = res; CBA.ui.toast("החיבור נשמר"); el.innerHTML = html(); redraw(el);
        });
        return;
      }
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
    el.addEventListener("change", function (e) {
      var cb = e.target.closest("[data-da-gymon]");
      if (!cb) return;
      var want = cb.checked;
      var msg = want ? "להעביר את המכון לדלת? קוד הכניסה הקבוע יוסתר מכל המנויים, והם יראו את כפתור הדלת." :
        "להחזיר את קוד הכניסה הקבוע? כפתור הדלת ייעלם ממסך המנויים.";
      CBA.ui.confirm(msg, { title: "המכון והדלת", okText: want ? "להעביר" : "להחזיר" }).then(function (ok) {
        if (!ok) { cb.checked = !want; return; }
        D().configure({ gymOn: want }, function (res) {
          if (!res.ok) { cb.checked = !want; return CBA.ui.alert(res.error || "השמירה נכשלה"); }
          st.s = res; CBA.ui.toast(want ? "המכון עבר לדלת" : "קוד הכניסה חזר");
        });
      });
    });
  }

  return { render: render };
})();
