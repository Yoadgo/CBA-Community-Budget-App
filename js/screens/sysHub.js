/* ============================================================================
 *  sysHub.js — "ניהול מערכת": מקום אחד לכל מה שקשור לתפעול   (גל 4, 24.9.2026)
 * ----------------------------------------------------------------------------
 *  הכרעת יועד: אריח אחד בתפריט המשתמש במקום שלושה, וארבע לשוניות:
 *    דיווחים · תחקור · מצב מערכת · התראות.
 *
 *  🔑 **כל מנהל רואה את האריח, אבל רק את הלשוניות שמותרות לו.** מרכז
 *     ההתראות פתוח לכל מנהל (SCREEN_PERM "ANY"); שלוש האחרות — מנהל-על.
 *     מנהל תחום רואה אפוא רק "התראות", ואף אחד לא מאבד גישה שהייתה לו.
 *     ⚠️ ההסתרה כאן היא נוחות; האכיפה בשרת ובכללי Firestore.
 *
 *  🔴 **שום דבר כאן לא רץ בטעינה, בניווט או ברענון.** כל לשונית טוענת את
 *     הנתונים שלה רק כשפותחים אותה. יומן הדופק וההשוואה — קריאת שרת אחת,
 *     רק כשמנהל-על פותח את "תחקור" או לוחץ "השוואה".
 *
 *  ⚠️ שלוש הלשוניות הוותיקות הן המסכים הקיימים עצמם (appReports,
 *     sysStatus, emailSettings), מצוירים לתוך חלונית. שום קוד לא שוכפל.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  var TAB_KEY = "cba_hub_tab";

  function isSuper() { return CBA.isSuper === true; }

  var TABS = [
    { id: "reports", label: "דיווחים", sub: "מה שמשתמשים שולחים דרך הכפתור הוורוד", superOnly: true },
    { id: "diag",    label: "תחקור",   sub: "מה השרת עשה, ואיפה המסמך והגיליון לא מסכימים", superOnly: true },
    { id: "status",  label: "מצב מערכת", sub: "אילו תחומים נקראים מ-Firestore, והאם הדפדפן הזה מצליח לקרוא אותם", superOnly: true },
    { id: "notify",  label: "התראות",  sub: "מי מקבל מייל או פוש על כל פעולה. להפעלת התראות בטלפון שלך: התפריט האישי ← \"התראות לטלפון\"", superOnly: false }
  ];

  function allowedTabs() { return TABS.filter(function (t) { return !t.superOnly || isSuper(); }); }

  var hub = { tab: "" };

  /* ===================== לשונית "תחקור" ===================== */

  var STAGE_HE = {
    "פתיחה": "פתיחה",
    notifyApplyNewTextsOnce_: "נוסחי התראות", notifyFlushQueue_: "תור פוש",
    eventsWeekJob_: "\"השבוע בשיכון\"", customTriggersJob_: "טריגרים מותאמים",
    btxMirrorToSheet_: "מראת התנועות", budgetTxApplyPending_: "סטטוסים ממתינים",
    budgetTxMailPending_: "מיילי תנועות", seedTxCounters_: "מוני תנועות",
    gardenMailPending_: "מיילי גינון", gardenPhotosIncomplete_: "תמונות גינון חסרות",
    seedGardenCounters_: "מוני גינון", bootSync_: "טעינה קרה",
    currentBudgetYearSync_: "שנת התקציב", gymStatusSyncAll_: "סנכרון מכון",
    tourSyncAll_: "סיור ושריונים", homeCountsSyncAll_: "מוני עמוד הבית",
    eventsSyncAll_: "לוח האירועים", gardenMirrorToSheet_: "מראת הגינון",
    gardenHorizonRun_: "אופק הגינון", gardenDataSyncAll_: "נתוני גינון",
    appReportsHourly_: "דיווחי אפליקציה", fsBackupIncremental_: "גיבוי מצטבר"
  };
  function stageName(k) { return STAGE_HE[k] || k; }

  var dg = { pulse: null, pulseErr: "", cmp: null, cmpErr: "", cmpBusy: false,
             kind: "task", id: "", year: "", reports: null };

  function secs(n) { return (Math.round(Number(n || 0) * 10) / 10) + " ש'"; }
  function p2(n) { return n < 10 ? "0" + n : String(n); }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? "" : d.getDate() + "." + (d.getMonth() + 1) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()); }

  function kpisHTML() {
    var P = dg.pulse;
    if (!P) return "";
    var runs = (P.runs || []).filter(function (r) { return !r.skip; });
    var skips = (P.runs || []).length - runs.length;
    var avg = runs.length ? runs.reduce(function (s, r) { return s + Number(r.d || 0); }, 0) / runs.length : 0;
    var mx = runs.reduce(function (m, r) { return Math.max(m, Number(r.d || 0)); }, 0);
    var sent = runs.reduce(function (s, r) { return s + Number(r.m || 0) + Number(r.p || 0); }, 0);
    var q = P.last && P.last.q >= 0 ? P.last.q : null;
    function k(v, l, cls) { return '<div class="rr-kpi"><div class="rr-kpi__v' + (cls ? " " + cls : "") + '">' + esc(v) + '</div><div class="rr-kpi__l">' + esc(l) + "</div></div>"; }
    return '<div class="rr-kpis">' +
      k(runs.length ? secs(avg) : "—", "ריצה שעתית, ממוצע") +
      k(runs.length ? secs(mx) : "—", "הארוכה ביותר (תקרה 360)", mx > 240 ? "is-warn" : "") +
      k(skips, "ריצות שדולגו") +
      k(sent, "מיילים ופוש ב-" + runs.length + " ריצות" + (q === null ? "" : " · מכסת מייל שנותרה היום: " + q)) +
    "</div>";
  }

  function chartHTML() {
    var P = dg.pulse;
    var runs = (P && P.runs) || [];
    if (!runs.length) {
      return '<div class="hub-empty">עדיין אין ריצות מתועדות. היומן מתמלא מהריצה השעתית הבאה.</div>';
    }
    var W = 640, H = 150, top = 12, base = 132, ceil = Number((P && P.ceiling) || 360);
    var n = runs.length, slot = W / Math.max(n, 12);
    var bars = runs.map(function (r, i) {
      /* ⚠️ מימין לשמאל: הריצה הישנה בימין, החדשה בשמאל — כמו כיוון הקריאה. */
      var x = W - (i + 1) * slot + 3, w = slot - 6;
      if (r.skip) {
        return '<rect x="' + x + '" y="' + (base - 6) + '" width="' + w + '" height="6" rx="2" class="hub-bar hub-bar--skip"><title>' +
               esc(hhmm(r.t) + " · דולגה (" + (r.why || "נעילה תפוסה") + ")") + "</title></rect>";
      }
      var h = Math.max(2, Math.min(1, Number(r.d || 0) / ceil) * (base - top));
      var cls = Number(r.d || 0) > 240 ? "hub-bar hub-bar--hi" : "hub-bar";
      var top3 = Object.keys(r.top || {}).sort(function (a, b) { return r.top[b] - r.top[a]; }).slice(0, 3)
        .map(function (k) { return stageName(k) + " " + r.top[k] + "ש'"; }).join(", ");
      return '<rect x="' + x + '" y="' + (base - h) + '" width="' + w + '" height="' + h + '" rx="2" class="' + cls + '"><title>' +
             esc(hhmm(r.t) + " · " + secs(r.d) + (r.f ? " · " + r.f + " כשלים" : "") + (top3 ? " · " + top3 : "")) + "</title></rect>";
    }).join("");
    /* ⚠️ התוויות מחוץ ל-SVG: טקסט עברי בתוך SVG בעמוד RTL מתהפך בעוגן ונחתך. */
    return '<div class="hub-legend"><span><i class="hub-key hub-key--ceil"></i>תקרת זמן הריצה: ' + ceil + " ש'</span>" +
        '<span><i class="hub-key hub-key--hi"></i>מעל 240 ש\'</span><span><i class="hub-key hub-key--skip"></i>דולגה</span></div>' +
      '<svg class="hub-chart" viewBox="0 0 ' + W + " " + (base + 4) + '" role="img" aria-label="משך הריצה השעתית בריצות האחרונות">' +
      '<line x1="0" y1="' + top + '" x2="' + W + '" y2="' + top + '" class="hub-ceil"/>' +
      bars +
      '<line x1="0" y1="' + base + '" x2="' + W + '" y2="' + base + '" class="hub-base"/>' +
    "</svg>" +
    '<div class="hub-axisrow"><span>לפני ' + n + " שעות</span><span>עכשיו</span></div>";
  }

  function stagesHTML() {
    var L = dg.pulse && dg.pulse.last;
    if (!L || !(L.st || []).length) return '<div class="hub-empty">הפירוק לשלבים יופיע אחרי הריצה השעתית הבאה.</div>';
    var st = (L.st || []).slice().sort(function (a, b) { return b[1] - a[1]; });
    var total = Number(L.d || 0) || st.reduce(function (s, x) { return s + x[1]; }, 0) || 1;
    var shown = st.slice(0, 7), rest = st.slice(7).reduce(function (s, x) { return s + x[1]; }, 0);
    if (rest > 0) shown.push(["אחר", Math.round(rest * 10) / 10]);
    var failBy = {};
    (L.fail || []).forEach(function (f) { failBy[f[0]] = f[1]; });
    return shown.map(function (x) {
      var pct = Math.max(1, Math.round(x[1] / total * 100));
      return '<div class="hub-stage">' +
        '<span class="hub-stage__n">' + esc(stageName(x[0])) + (failBy[x[0]] ? ' <span class="hub-fail" title="' + esc(failBy[x[0]]) + '">נכשל</span>' : "") + "</span>" +
        '<span class="hub-stage__bar"><span style="width:' + pct + '%"></span></span>' +
        '<span class="hub-stage__v">' + secs(x[1]) + "</span>" +
      "</div>";
    }).join("") +
    ((L.fail || []).length ? '<div class="hub-note">כשלים בריצה: ' + (L.fail || []).map(function (f) { return esc(stageName(f[0]) + " — " + f[1]); }).join(" · ") + "</div>" : "") +
    '<div class="hub-note">הריצה מ-' + esc(hhmm(L.t)) + " · סה\"כ " + secs(L.d) + "</div>";
  }

  var KINDS = [["task", "משימת גינון"], ["greport", "דיווח גינון"], ["tx", "תנועת תקציב"], ["app", "דיווח על האפליקציה"]];

  function compareHTML() {
    var form = '<div class="hub-cmp">' +
      '<select id="hub-cmp-kind">' + KINDS.map(function (k) {
        return '<option value="' + k[0] + '"' + (dg.kind === k[0] ? " selected" : "") + ">" + k[1] + "</option>";
      }).join("") + "</select>" +
      '<input id="hub-cmp-id" inputmode="numeric" placeholder="מזהה, למשל 57" value="' + esc(dg.id) + '">' +
      (dg.kind === "tx" ? '<input id="hub-cmp-year" class="hub-cmp__year" placeholder="שנה (ריק = נוכחית)" value="' + esc(dg.year) + '">' : "") +
      '<button type="button" class="btn-ghost" id="hub-cmp-go"' + (dg.cmpBusy ? " disabled" : "") + ">" + (dg.cmpBusy ? "בודק…" : "השוואה") + "</button>" +
    "</div>";
    var out = "";
    if (dg.cmpErr) out = '<div class="hub-note hub-note--err">' + esc(dg.cmpErr) + "</div>";
    var R = dg.cmp;
    if (R) {
      var head;
      if (!R.docExists && !R.rowExists) head = "הפריט לא נמצא לא במסמך ולא בגיליון.";
      else if (!R.docExists) head = "יש שורה בגיליון (שורה " + R.rowNum + ") אבל אין מסמך ב-Firestore.";
      else if (!R.rowExists) head = "יש מסמך ב-Firestore אבל עדיין אין שורה בגיליון — המראה עוד לא רצה עליו.";
      else head = R.diffs ? (R.diffs === 1 ? "שדה אחד לא מסכים" : R.diffs + " שדות לא מסכימים") : "המסמך והגיליון מסכימים בכל השדות.";
      var tone = (!R.docExists || !R.rowExists || R.diffs) ? "hub-verdict--warn" : "hub-verdict--ok";
      var pend = R.pending ? [R.pending.mail && "ממתין למייל", R.pending.mirror && "ממתין למראה", R.pending.reply && "ממתינה תשובה"].filter(Boolean).join(" · ") : "";
      var rows = (R.fields || []).filter(function (f) { return !f.same || dg.showAll; });
      out += '<div class="hub-verdict ' + tone + '">' + esc(head) + "</div>" +
        '<div class="hub-note">מקור האמת: ' + esc(R.owner || "?") + (R.year ? " · שנה " + esc(R.year) : "") + (pend ? " · " + esc(pend) : "") + "</div>" +
        (rows.length ? '<div class="hub-tbl"><table><thead><tr><th>שדה</th><th>במסמך</th><th>בגיליון</th></tr></thead><tbody>' +
          rows.map(function (f) {
            return '<tr class="' + (f.same ? "" : "is-diff") + '"><td>' + esc(f.col) + "</td><td>" + esc(f.doc || "—") + "</td><td>" + esc(f.row || "—") + "</td></tr>";
          }).join("") + "</tbody></table></div>" : "") +
        '<button type="button" class="hub-link" id="hub-cmp-all">' + (dg.showAll ? "רק שדות שלא מסכימים" : "הצגת כל השדות") + "</button>" +
        (R.pulse ? '<div class="hub-note">' + esc(R.pulse) + "</div>" : "");
    }
    return form + out;
  }

  function recurringHTML() {
    var rows = dg.reports;
    if (!rows) return '<div class="hub-empty">טוען…</div>';
    var since = Date.now() - 30 * 86400000;
    var recent = rows.filter(function (r) { var d = new Date(r.date); return !isNaN(d.getTime()) && d.getTime() >= since; });
    if (!recent.length) return '<div class="hub-empty">אין דיווחים ב-30 הימים האחרונים.</div>';
    var byScreen = {}, byErr = {};
    recent.forEach(function (r) {
      var sc = String(r.screen || "לא ידוע").replace(/\s*\([^)]*\)\s*$/, "");
      byScreen[sc] = byScreen[sc] || { n: 0, e: 0 };
      byScreen[sc].n++;
      if (String(r.errors || "").trim()) byScreen[sc].e++;
      String(r.errors || "").split("\n").filter(Boolean).forEach(function (line) {
        var msg = line.replace(/^\d\d:\d\d:\d\d\s+/, "").replace(/\s+@\s+.*$/, "").replace(/\s+\(×\d+\)$/, "").trim();
        if (msg) byErr[msg] = (byErr[msg] || 0) + 1;
      });
    });
    var scr = Object.keys(byScreen).sort(function (a, b) { return byScreen[b].n - byScreen[a].n; }).slice(0, 5);
    var errs = Object.keys(byErr).sort(function (a, b) { return byErr[b] - byErr[a]; }).slice(0, 4);
    return scr.map(function (k) {
      return '<div class="hub-row"><span>' + esc(k) + "</span><span>" + (byScreen[k].n === 1 ? "דיווח אחד" : byScreen[k].n + " דיווחים") +
             (byScreen[k].e ? " · " + byScreen[k].e + " עם שגיאה" : "") + "</span></div>";
    }).join("") +
    errs.map(function (k) {
      return '<div class="hub-row hub-row--err"><span>"' + esc(k.length > 90 ? k.substring(0, 89) + "…" : k) + '"</span><span>' + (byErr[k] === 1 ? "פעם אחת" : byErr[k] + " פעמים") + "</span></div>";
    }).join("");
  }

  function drawDiag(pane) {
    var pulseBlock = dg.pulseErr
      ? '<div class="hub-note hub-note--err">' + esc(dg.pulseErr) + "</div>"
      : (dg.pulse ? kpisHTML() : (CBA.skel && CBA.skel.cards ? CBA.skel.cards(1) : "טוען…"));
    pane.innerHTML =
      '<div class="hub-toolbar"><button type="button" class="btn-ghost" id="hub-copy">העתקת מצב לתחקור</button>' +
        '<button type="button" class="btn-ghost" id="hub-refresh">רענון</button></div>' +
      pulseBlock +
      '<div class="card hub-card"><div class="hub-h">משך העבודה השעתית<span>24 ריצות אחרונות · מעבר עכבר מציג פרטים</span></div>' +
        (dg.pulse ? chartHTML() : '<div class="hub-empty">טוען…</div>') + "</div>" +
      '<div class="card hub-card"><div class="hub-h">לאן הלך הזמן בריצה האחרונה</div>' +
        (dg.pulse ? stagesHTML() : '<div class="hub-empty">טוען…</div>') + "</div>" +
      '<div class="card hub-card"><div class="hub-h">השוואת פריט<span>מסמך Firestore מול שורת הגיליון</span></div>' + compareHTML() + "</div>" +
      '<div class="card hub-card"><div class="hub-h">מה חוזר בדיווחים<span>30 יום אחרונים</span></div>' + recurringHTML() + "</div>";
    wireDiag(pane);
  }

  function loadPulse(pane) {
    dg.pulseErr = "";
    CBA.data.getDiagPulse(function (res) {
      if (!res || !res.ok) dg.pulseErr = "לא הצלחנו לטעון את יומן הדופק. " + ((res && res.error) || "");
      else dg.pulse = res;
      if (pane.isConnected) drawDiag(pane);
    });
  }

  function loadReportsForStats(pane) {
    var ar = CBA.screens.appReports;
    var have = ar && ar.rows && ar.rows();
    if (have && have.length) { dg.reports = have; return; }
    if (!ar || !ar.load) { dg.reports = []; return; }
    ar.load(function () {
      dg.reports = ar.rows();
      if (pane.isConnected) drawDiag(pane);
    });
  }

  function wireDiag(pane) {
    var q = function (sel) { return pane.querySelector(sel); };
    q("#hub-refresh").addEventListener("click", function () { dg.pulse = null; drawDiag(pane); loadPulse(pane); });
    q("#hub-copy").addEventListener("click", function () {
      var extra = dg.pulse && dg.pulse.line ? "שרת: " + dg.pulse.line : "";
      var txt = (CBA.diag && CBA.diag.pack) ? CBA.diag.pack(extra) : extra;
      (CBA.report && CBA.report.copyText ? CBA.report.copyText : function (t, cb) { cb(false); })(txt, function (ok) {
        CBA.ui.toast(ok ? "המצב הועתק — אפשר להדביק בשיחה" : "ההעתקה נכשלה", ok ? "ok" : "error");
      });
    });
    q("#hub-cmp-kind").addEventListener("change", function (e) { dg.kind = e.target.value; dg.cmp = null; dg.cmpErr = ""; drawDiag(pane); });
    q("#hub-cmp-id").addEventListener("input", function (e) { dg.id = e.target.value; });
    var y = q("#hub-cmp-year"); if (y) y.addEventListener("input", function (e) { dg.year = e.target.value; });
    function go() {
      var id = String(dg.id || "").trim();
      if (!id) { dg.cmpErr = "צריך להקליד מזהה"; return drawDiag(pane); }
      dg.cmpBusy = true; dg.cmpErr = ""; drawDiag(pane);
      CBA.data.diagCompare(dg.kind, id, String(dg.year || "").trim(), function (res) {
        dg.cmpBusy = false;
        if (!res || !res.ok) { dg.cmp = null; dg.cmpErr = (res && res.error) || "ההשוואה נכשלה"; }
        else { dg.cmp = res; dg.showAll = false; }
        if (pane.isConnected) drawDiag(pane);
      });
    }
    q("#hub-cmp-go").addEventListener("click", go);
    q("#hub-cmp-id").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    var all = q("#hub-cmp-all");
    if (all) all.addEventListener("click", function () { dg.showAll = !dg.showAll; drawDiag(pane); });
  }

  /* פתיחה מבחוץ — כפתור "השוואה" בהיסטוריית משימה. */
  function openCompare(kind, id) {
    dg.kind = kind; dg.id = String(id); dg.cmp = null;
    try { localStorage.setItem(TAB_KEY, "diag"); } catch (e) {}
    if (CBA.gotoAdmin) CBA.gotoAdmin("sysHub");
    setTimeout(function () {
      var btn = document.querySelector("#hub-cmp-go");
      if (btn) btn.click();
    }, 120);
  }

  /* ===================== מסגרת הלשוניות ===================== */

  function paneFor(tabId, pane) {
    if (tabId === "reports") return CBA.screens.appReports.render(pane, { embedded: true });
    if (tabId === "status" && CBA.screens.sysStatus) return CBA.screens.sysStatus.render(pane);
    if (tabId === "notify" && CBA.screens.emailSettings) return CBA.screens.emailSettings.render(pane);
    if (tabId === "diag") {
      drawDiag(pane);
      loadReportsForStats(pane);
      if (!dg.pulse) loadPulse(pane);
    }
  }

  function render(container, opts) {
    var tabs = allowedTabs();
    var want = (opts && opts.tab) || hub.tab;
    if (!want) { try { want = localStorage.getItem(TAB_KEY) || ""; } catch (e) {} }
    if (!tabs.some(function (t) { return t.id === want; })) want = tabs[0].id;
    hub.tab = want;
    var cur = tabs.filter(function (t) { return t.id === want; })[0];

    container.innerHTML =
      '<div class="screen-head"><div class="screen-head__title">ניהול מערכת</div>' +
        '<div class="screen-head__sub">' + esc(cur.sub) + "</div></div>" +
      (tabs.length > 1
        ? '<div class="seg hub-tabs" role="tablist">' + tabs.map(function (t) {
            return '<button type="button" role="tab" class="seg__opt' + (t.id === want ? " is-active" : "") +
                   '" aria-selected="' + (t.id === want) + '" data-hub-tab="' + t.id + '">' + esc(t.label) + "</button>";
          }).join("") + "</div>"
        : "") +
      '<div class="hub-pane" data-pane="' + want + '"></div>';

    Array.prototype.forEach.call(container.querySelectorAll("[data-hub-tab]"), function (b) {
      b.addEventListener("click", function () {
        hub.tab = b.dataset.hubTab;
        try { localStorage.setItem(TAB_KEY, hub.tab); } catch (e) {}
        render(container);
      });
    });
    paneFor(want, container.querySelector(".hub-pane"));
  }

  CBA.screens.sysHub = { title: "ניהול מערכת", render: render, openCompare: openCompare };
})();
