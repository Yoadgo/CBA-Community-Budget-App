/* ============================================================================
 *  diag.js — איסוף הקשר פסיבי לדיווחי תקלות (2026-09-15)
 * ----------------------------------------------------------------------------
 *  המטרה: להשאיר לתושב כמה שפחות למלא. הוא כותב משפט אחד — "זה לא עובד" —
 *  ואנחנו יודעים מי הוא, איפה הוא היה, מה היה פתוח, מה הוא עשה שלוש שניות
 *  לפני, ואיזו שגיאה נזרקה בפועל.
 *
 *  ⚠️ הקובץ הזה חייב להיטען **ראשון** מכל קבצי ה-JS של האפליקציה. מאזין
 *     שגיאות שנרשם אחרי הקוד ששובר לא יתפוס את השגיאה שקרתה בטעינה — וזו
 *     בדיוק סוג התקלה שהכי קשה לשחזר מדיווח מילולי.
 *
 *  ⚠️ הכול נשמר **בזיכרון בלבד**, בחוצץ טבעתי קטן, ונשלח רק כשהמשתמש בוחר
 *     מיוזמתו לשלוח דיווח. אין כתיבה ל-localStorage ואין שליחה אוטומטית
 *     לשום מקום — דיווח תקלה הוא פעולה של המשתמש, לא טלמטריה שרצה ברקע.
 *
 *  ⚠️ שובל הפעולות רושם **תווית** של כפתור (aria-label/title/טקסט) ולא ערכי
 *     שדות. תוכן שהמשתמש הקליד — סכומים, טלפונים, טקסט חופשי — לא נכנס
 *     לשובל לעולם; גם דיווח תקלה על מסך תקציב לא אמור לגרור סכומים לגיליון.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.diag = (function () {
  "use strict";

  var ERR_MAX   = 5;     // שגיאות אחרונות
  var TRAIL_MAX = 12;    // פעולות אחרונות
  var LABEL_MAX = 44;    // אורך תווית של פעולה

  var started     = Date.now();
  var screenSince = Date.now();
  var errors = [];
  var trail  = [];

  /* ---------- עזרים ---------- */
  function clock(t) {
    var d = new Date(t || Date.now());
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }
  function span(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var m = Math.floor(s / 60);
    return m ? (m + " דק' " + (s % 60) + " שנ'") : (s + " שנ'");
  }
  function cut(s, n) {
    s = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return s.length > n ? s.substring(0, n - 1) + "…" : s;
  }
  /* 🔴 גל 4 (24.9) — **ניקוי לפני שמירה, לא לפני שליחה.** אסימון המושב
     נוסע במחרוזת השאילתה של כל בקשת GET לשרת (ממצא 30). היום שום דבר כאן
     לא רושם כתובת בקשה — אבל שגיאת רשת עתידית שתכלול את הכתובת בהודעה
     הייתה מכניסה אסימון חי לדיווח ולגוש שמודבק בשיחה. לכן כל טקסט שנכנס
     לחוצצים עובר כאן: מחרוזות שאילתה נחתכות, ומפתחות רגישים ואסימונים
     ארוכים מוחלפים. */
  function clean(s) {
    return String(s == null ? "" : s)
      .replace(/(https?:\/\/[^\s?#"']+)\?[^\s#"']*/gi, "$1?…")
      .replace(/\b(session|idToken|token|key|auth|code)=([^&\s"']+)/gi, "$1=…")
      .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+/g, "[אסימון הוסר]")
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[מחרוזת ארוכה הוסרה]");
  }
  function push(arr, v, max) {
    arr.push(v);
    while (arr.length > max) arr.shift();
  }

  /* ---------- 1. שגיאות ---------- */
  function fileOf(src, line, col) {
    if (!src) return "";
    var f = String(src).split("?")[0].split("/").pop();
    return f + (line ? ":" + line + (col ? ":" + col : "") : "");
  }
  function addError(text, where) {
    var line = clock() + " " + cut(clean(text), 180) + (where ? "  @ " + clean(where) : "");
    /* שגיאה שחוזרת בלולאה לא מציפה חמש שורות זהות — מונה במקום כפילות. */
    var last = errors[errors.length - 1];
    if (last && last.line === line) { last.n++; return; }
    push(errors, { line: line, n: 1 }, ERR_MAX);
  }

  window.addEventListener("error", function (e) {
    try {
      if (e && e.target && e.target !== window && e.target.tagName) {
        /* כשל טעינה של משאב (script/img/css) — ה-message ריק, והמידע היחיד
           שיש הוא הכתובת. בלי הענף הזה זה נרשם כ-"Script error" ריק. */
        var url = e.target.src || e.target.href || "";
        if (url) return addError("כשל בטעינת משאב", fileOf(url));
      }
      addError((e && e.message) || "שגיאה לא מזוהה",
               fileOf(e && e.filename, e && e.lineno, e && e.colno));
    } catch (x) {}
  }, true);

  window.addEventListener("unhandledrejection", function (e) {
    try {
      var r = e && e.reason;
      var msg = (r && (r.message || r.error || r)) || "הבטחה שנדחתה";
      addError("Promise: " + msg, r && r.stack ? fileOf((String(r.stack).match(/\/([^\/\s)]+:\d+:\d+)/) || [])[1]) : "");
    } catch (x) {}
  });

  /* ---------- 2. שובל פעולות ---------- */
  function log(text) {
    if (!text) return;
    push(trail, clock() + " " + cut(clean(text), 120), TRAIL_MAX);
  }

  function labelOf(el) {
    if (!el) return "";
    var t = el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "";
    t = cut(t, LABEL_MAX);
    if (t) return t;
    return el.dataset && (el.dataset.act || el.dataset.screen) ? String(el.dataset.act || el.dataset.screen) : "";
  }

  /* capture:true — כדי לרשום גם לחיצה שהמטפל שלה עוצר (stopPropagation),
     וגם לחיצה שגורמת לשגיאה ולכן לא מגיעה לשלב ה-bubble לעולם. */
  document.addEventListener("click", function (e) {
    try {
      var el = e.target && e.target.closest
             ? e.target.closest("button, a, [role='button'], [data-screen], [data-act]") : null;
      if (!el) return;
      if (el.closest(".rep-fab-wrap, .cba-dlg__actions")) return;   // הדיווח עצמו אינו פעולה
      var lbl = labelOf(el);
      if (lbl) log("לחיצה: " + lbl);
    } catch (x) {}
  }, true);

  /* מעבר מסך — נקרא מהתצפית על body[data-screen] ולא מ-app.js, כדי שלא
     יהיה קורא שני שאפשר לשכוח לעדכן כשנוסף מסלול ניווט נוסף. */
  var lastScreen = "";
  function noteScreen() {
    try {
      var k = (document.body && document.body.dataset.screen) || "";
      if (!k || k === lastScreen) return;
      lastScreen = k;
      screenSince = Date.now();
      log("מסך: " + ((CBA.screenLabel && CBA.screenLabel(k)) || k));
    } catch (x) {}
  }
  if (window.MutationObserver) {
    new MutationObserver(noteScreen).observe(document.documentElement, {
      attributes: true, subtree: true, attributeFilter: ["data-screen"]
    });
  }
  document.addEventListener("DOMContentLoaded", noteScreen);

  window.addEventListener("online",  function () { log("החיבור לרשת חזר"); });
  window.addEventListener("offline", function () { log("החיבור לרשת נותק"); });

  /* ---------- 3. הקשר משתמש ומערכת ---------- */
  function clientVersion() {
    try {
      var s = document.querySelector('script[src*="js/app.js"]');
      var m = s && String(s.src).match(/[?&]v=([^&"]+)/);
      return m ? m[1] : "";
    } catch (e) { return ""; }
  }

  function browser() {
    try {
      var u = navigator.userAgent || "";
      var name = /CriOS/.test(u) ? "Chrome (iOS)" : /Edg/.test(u) ? "Edge"
               : /Firefox|FxiOS/.test(u) ? "Firefox" : /Chrome/.test(u) ? "Chrome"
               : /Safari/.test(u) ? "Safari" : "אחר";
      var os = /iPhone|iPad|iPod/.test(u) ? "iOS" : /Android/.test(u) ? "Android"
             : /Macintosh/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "";
      return [name, os, window.innerWidth + "×" + window.innerHeight +
              (window.devicePixelRatio > 1 ? " @" + window.devicePixelRatio + "x" : ""),
              isStandalone() ? "מותקנת" : "דפדפן"].filter(Boolean).join(" · ");
    } catch (e) { return ""; }
  }

  function isStandalone() {
    try {
      return !!(navigator.standalone ||
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches));
    } catch (e) { return false; }
  }

  function perms() {
    try {
      if (CBA.isSuper === true) return "מנהל-על";
      var p = (CBA.perms || []).filter(Boolean);
      return p.length ? p.join(", ") : "תושב";
    } catch (e) { return ""; }
  }

  function net() {
    var parts = [navigator.onLine === false ? "לא מקוון" : "מקוון"];
    try {
      var c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c && c.effectiveType) parts.push(c.effectiveType);
      if (c && c.saveData) parts.push("חיסכון בנתונים");
    } catch (e) {}
    return parts.join(" · ");
  }

  function localTime() {
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) {}
    var d = new Date();
    function p(n) { return n < 10 ? "0" + n : String(n); }
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() +
           " " + p(d.getHours()) + ":" + p(d.getMinutes()) + (tz ? " (" + tz + ")" : "");
  }

  /* מה היה פתוח על המסך ברגע הדיווח. הדיאלוג של הדיווח עצמו כבר עלה מעל
     הקודם, ולכן נלקח האחד **שלפניו** ולא האחרון — אחרת כל דיווח היה מדווח
     על עצמו. */
  function openWindow() {
    try {
      var all = Array.prototype.slice.call(document.querySelectorAll(".cba-dlg-backdrop"));
      var mine = document.querySelector(".rep-form");
      var under = all.filter(function (b) { return !mine || !b.contains(mine); });
      var top = under[under.length - 1];
      if (top) {
        var t = top.querySelector(".cba-dlg__title");
        return 'חלונית: "' + cut(t ? t.textContent : "ללא כותרת", 60) + '"';
      }
      /* מגירות/שכבות שאינן cba-dlg (peek, סימולציה, גיליון ניווט) */
      var b = document.body.className || "";
      if (/has-sim/.test(b))  return "שכבה: סימולציה";
      if (/has-active/.test(b)) return "מגירה פתוחה";
      var sheet = document.querySelector(".nav-sheet.is-open, .peek.is-open");
      if (sheet) return "מגירה: " + cut(labelOf(sheet) || sheet.className, 50);
    } catch (e) {}
    return "";
  }

  function snapshot() {
    var key = (document.body && document.body.dataset.screen) || "";
    var label = (CBA.screenLabel && key) ? CBA.screenLabel(key) : key;
    var year = "";
    try { year = String((CBA.mock && CBA.mock.currentYear) || ""); } catch (e) {}

    return {
      /* השם שהמשתמש רואה **ובסוגריים** המפתח הפנימי — השם לבדו לא מאפשר
         לאתר את הקוד, המפתח לבדו לא אומר כלום לקורא. */
      screen:      key ? (label === key ? key : label + " (" + key + ")") : "",
      screenLabel: label,
      ver:         clientVersion(),
      srvVer:      (CBA.mock && CBA.mock._serverVersion) || "",
      ua:          browser(),
      perms:       perms(),
      year:        year,
      net:         net(),
      dialog:      openWindow(),
      onScreen:    span(Date.now() - screenSince),
      session:     span(Date.now() - started),
      localTime:   localTime(),
      /* ⚠️ בלי location.search — ר' clean(). הנתיב והעוגן מספיקים לאבחון. */
      url:         cut(clean(String(location.pathname + location.hash)), 160),
      errors:      errors.map(function (e) { return e.line + (e.n > 1 ? "  (×" + e.n + ")" : ""); }),
      trail:       trail.slice()
    };
  }

  /* השורה שנשמרת בעמודת "מידע נוסף" — מה שאין לו עמודה משלו. */
  function extraLine(s) {
    return [
      s.localTime ? "זמן מקומי: " + s.localTime : "",
      s.onScreen  ? "במסך: " + s.onScreen : "",
      s.session   ? "בסשן: " + s.session : "",
      s.url       ? "כתובת: " + s.url : ""
    ].filter(Boolean).join(" · ");
  }

  /* ==========================================================================
   *  גוש "מצב לתחקור" — טקסט אחד להדבקה בשיחה או לצירוף לדיווח (גל 4)
   * --------------------------------------------------------------------------
   *  🔴 **אין כאן בקשת רשת.** הכול מהזיכרון: ההקשר, הדגלים שכבר נטענו
   *     ומדידות הטעינה (CBA.perf). מה שמגיע מהשרת (יומן הדופק) מועבר
   *     כ-`extra` ע"י הקורא, ורק אם הוא כבר ביד.
   *  🔒 עובר שוב דרך clean() — גם אם משהו נכנס לחוצצים לפני הניקוי.
   * ======================================================================== */
  function pack(extra) {
    var s = snapshot();
    var lines = ["=== CBA · מצב לתחקור ===",
      "זמן: " + s.localTime + " · בסשן " + s.session + " · במסך " + s.onScreen,
      "גרסה: לקוח " + (s.ver || "?") + " · שרת " + (s.srvVer || "?"),
      "משתמש: " + (s.perms || "?") + (s.year ? " · שנת עבודה " + s.year : ""),
      "מסך: " + (s.screen || "?") + (s.dialog ? " · " + s.dialog : ""),
      "מכשיר: " + s.ua + " · " + s.net,
      "כתובת: " + s.url];
    try {
      var fl = (CBA.fb && CBA.fb.flags && CBA.fb.flags()) || null;
      if (fl) {
        var on = [], off = [];
        Object.keys(fl).sort().forEach(function (k) {
          if (fl[k] === true) on.push(k); else if (fl[k] === false) off.push(k);
        });
        lines.push("דגלים דלוקים במפורש: " + (on.join(", ") || "—"));
        if (off.length) lines.push("דגלים כבויים במפורש: " + off.join(", "));
      }
      var st = CBA.fb && CBA.fb.state && CBA.fb.state();
      if (st) lines.push("Firebase: " + (st.user ? "מחובר" : "לא מחובר") +
                         (st.lastError ? " · שגיאה אחרונה " + st.lastError : ""));
    } catch (e) {}
    try {
      var perf = CBA.perf || {};
      var pk = Object.keys(perf);
      if (pk.length) lines.push("טעינות: " + pk.map(function (k) {
        var x = perf[k] || {};
        return k + " " + (x.source || "?") + " " + (x.ms == null ? "?" : x.ms) + "ms" + (x.why ? " (" + x.why + ")" : "");
      }).join(" | "));
    } catch (e) {}
    lines.push("שגיאות (" + errors.length + "):");
    errors.forEach(function (e) { lines.push("  " + e.line + (e.n > 1 ? "  (×" + e.n + ")" : "")); });
    lines.push("שובל פעולות:");
    trail.forEach(function (t) { lines.push("  " + t); });
    if (extra) lines.push(String(extra));
    return clean(lines.join("\n"));
  }

  return {
    snapshot: snapshot,
    pack: pack,
    clean: clean,
    extraLine: extraLine,
    log: log,
    error: addError,
    _errors: function () { return errors; },
    _trail:  function () { return trail; }
  };
})();
