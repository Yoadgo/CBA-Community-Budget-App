/* js/pwa.js — הצד שהמשתמש מרגיש ב-PWA (2026-08-20)
   ==================================================
   אחראי על ארבעה דברים בלבד, וכולם "מסביב" לאפליקציה — לא בתוכה:
     1. רישום ה-Service Worker.
     2. רענון לגרסה חדשה — דרך *אותו שער* שהרענון השוטף כבר משתמש בו.
     3. זיהוי האם אפשר להתקין, בשביל הפריט בתפריט המשתמש (app.js).
     4. שכבת ההסבר "הוספה למסך הבית" לאייפון.

   הקובץ לא נוגע בנתונים, בהרשאות ובשום מסך. */

window.CBA = window.CBA || {};

CBA.pwa = (function () {
  "use strict";

  var SW_URL   = "service-worker.js?v=20260820c";
  var HINT_KEY = "cba_install_hint_v1";

  var deferredPrompt = null;   // אנדרואיד/כרום: חלון ההתקנה שנתפס מראש
  var updateReady    = false;
  var reloading      = false;

  /* ---------- זיהוי סביבה ---------- */

  // האם אנחנו כבר רצים כאפליקציה מותקנת (ולא בתוך דפדפן)
  function isStandalone() {
    try {
      return window.matchMedia("(display-mode: standalone)").matches ||
             window.navigator.standalone === true;
    } catch (e) { return false; }
  }

  // אייפון/אייפד. שים לב: אייפד מודרני מדווח על עצמו כ-Mac עם מסך מגע,
  // ולכן הבדיקה השנייה — בלעדיה משתמשי אייפד לא היו מקבלים את ההסבר.
  function isIOS() {
    var ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  /* האם להציג את פריט "התקנת האפליקציה" בתפריט המשתמש.
     - כבר מותקן -> לא. אין טעם להציע למי שכבר בפנים.
     - אייפון -> כן תמיד, כי שם ההתקנה ידנית ואף אחד לא יגלה אותה לבד.
     - שאר הדפדפנים -> רק אם הדפדפן באמת הציע התקנה (deferredPrompt). */
  function canInstall() {
    if (isStandalone()) return false;
    if (isIOS()) return true;
    return !!deferredPrompt;
  }

  /* ---------- שער הבטיחות לרענון ---------- */

  /* זהו בדיוק אותו שער ש-doPoll ב-app.js משתמש בו כדי להחליט אם מותר
     לצייר מחדש. ההחלטה (אפיון, סעיף 5) הייתה לא להמציא מגן חדש אלא
     להישען על הקיים — כך אין התנהגות חדשה ללמוד, ואין דרך חדשה לאבד
     עבודה של משתמש. */
  function safeToReload() {
    try {
      if (document.hidden) return false;
      if (CBA.sheets && CBA.sheets.isDirty && CBA.sheets.isDirty()) return false;
      if (CBA.userIsEditingMain && CBA.userIsEditingMain()) return false;
      if (document.body.classList.contains("has-cba-dlg")) return false;   // מודל פתוח
      if (document.querySelector(".cba-dlg-backdrop")) return false;
      return true;
    } catch (e) { return false; }
  }

  function tryReload() {
    if (reloading || !updateReady) return;
    if (!safeToReload()) return;    // עסוקים — ננסה שוב במחזור הבא
    reloading = true;
    try { CBA.ui.toast("עודכנה גרסה חדשה — מרעננים…"); } catch (e) {}
    setTimeout(function () { location.reload(); }, 1200);
  }

  /* ---------- רישום ה-Service Worker ---------- */

  function register() {
    if (!("serviceWorker" in navigator)) return;
    // Service Worker דורש HTTPS. בפתיחה מקומית (file:// או http) פשוט
    // לא נרשמים — האפליקציה עובדת רגיל, רק בלי שכבת ה-PWA.
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;

    navigator.serviceWorker.register(SW_URL)
      .then(function (reg) {
        // כבר ממתינה גרסה חדשה מביקור קודם
        if (reg.waiting && navigator.serviceWorker.controller) {
          updateReady = true;
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        reg.addEventListener("updatefound", function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", function () {
            // "מותקן" + יש כבר גרסה ששולטת = זה עדכון, לא התקנה ראשונה.
            // בהתקנה ראשונה אין מה לרענן, והמשתמש לא אמור להרגיש כלום.
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              updateReady = true;
              sw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(function (err) { console.warn("[CBA] רישום Service Worker נכשל:", err); });

    navigator.serviceWorker.addEventListener("controllerchange", tryReload);
    // אותו קצב של הרענון השוטף — כך "מתי מותר" נבדק שוב ושוב עד שמותר
    setInterval(tryReload, 3000);
  }

  /* ---------- חלון ההתקנה של אנדרואיד ---------- */

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();               // לא הבאנר הגנרי — הכפתור שלנו
    deferredPrompt = e;
  });

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    try { CBA.ui.toast("האפליקציה נוספה למסך הבית"); } catch (e) {}
  });

  /* ---------- הפעולה עצמה ---------- */

  // נקראת מהפריט בתפריט המשתמש (app.js)
  function promptInstall() {
    if (isIOS() || !deferredPrompt) { showIOSSheet(); return; }
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; });
  }

  /* ---------- שכבת ההסבר לאייפון ---------- */

  /* למה איורים ולא צילומי מסך (אפיון, סעיף 7ב): אפל משנה את תפריט
     השיתוף כמעט בכל גרסת iOS. צילום מסך היה הופך לשגוי בשקט, ודווקא
     ברכיב שהכי תלויים בו. הסמלים עצמם לא משתנים. */
  var ART = {
    share: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
             '<path d="M24 6v22"/><path d="M16 14l8-8 8 8"/>' +
             '<path d="M13 21H10a2 2 0 0 0-2 2v17a2 2 0 0 0 2 2h28a2 2 0 0 0 2-2V23a2 2 0 0 0-2-2h-3"/>' +
           '</svg>',
    plus:  '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
             '<rect x="8" y="8" width="32" height="32" rx="8"/><path d="M24 17v14M17 24h14"/>' +
           '</svg>',
    // מסך בית עם אייקון אחד *מלא* — הוא הגיבור של הצעד הזה, ולכן הוא
    // היחיד שצבוע. השאר קווי מתאר בלבד, כדי שהעין תלך ישר אליו.
    home:  '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
             '<rect x="11" y="3.5" width="26" height="41" rx="6"/>' +
             '<rect x="15.5" y="12" width="7.5" height="7.5" rx="2.6" fill="currentColor" stroke="none"/>' +
             '<rect x="25" y="12" width="7.5" height="7.5" rx="2.6" opacity=".35"/>' +
             '<rect x="15.5" y="22.5" width="7.5" height="7.5" rx="2.6" opacity=".35"/>' +
             '<rect x="25" y="22.5" width="7.5" height="7.5" rx="2.6" opacity=".35"/>' +
             '<path d="M20 39.5h8"/>' +
           '</svg>'
  };

  function showIOSSheet() {
    if (document.querySelector(".pwa-sheet-backdrop")) return;

    var wrap = document.createElement("div");
    wrap.className = "pwa-sheet-backdrop";
    wrap.innerHTML =
      '<div class="pwa-sheet" role="dialog" aria-modal="true" aria-label="הוספה למסך הבית">' +
        '<div class="pwa-sheet__grip"></div>' +
        '<h3 class="pwa-sheet__title">להוסיף את "קהילה" למסך הבית</h3>' +
        '<p class="pwa-sheet__sub">שלושה צעדים, פעם אחת. אחר כך האפליקציה נפתחת בלחיצה אחת מהמסך.</p>' +
        '<ol class="pwa-steps">' +
          '<li><span class="pwa-steps__art">' + ART.share + '</span>' +
              '<span class="pwa-steps__txt">לוחצים על כפתור <b>השיתוף</b> בתחתית המסך</span></li>' +
          '<li><span class="pwa-steps__art">' + ART.plus + '</span>' +
              '<span class="pwa-steps__txt">גוללים ובוחרים <b>הוספה למסך הבית</b></span></li>' +
          '<li><span class="pwa-steps__art">' + ART.home + '</span>' +
              '<span class="pwa-steps__txt">מאשרים — והאייקון מופיע בין האפליקציות</span></li>' +
        '</ol>' +
        '<p class="pwa-sheet__note">בפתיחה הראשונה מהאייקון תתבקשו להתחבר שוב — זה תקין, ' +
          'אפל שומרת לאפליקציה מותקנת אזור נפרד משלה.</p>' +
        '<div class="pwa-sheet__actions">' +
          '<button type="button" class="pwa-sheet__btn pwa-sheet__btn--go" data-pwa="close">הבנתי</button>' +
          '<button type="button" class="pwa-sheet__btn pwa-sheet__btn--ghost" data-pwa="never">אל תציגו לי שוב</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    requestAnimationFrame(function () { wrap.classList.add("is-open"); });

    function close() {
      wrap.classList.remove("is-open");
      setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 220);
      document.removeEventListener("keydown", onKey, true);
    }
    function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    document.addEventListener("keydown", onKey, true);

    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) { close(); return; }
      var act = e.target.closest ? e.target.closest("[data-pwa]") : null;
      if (!act) return;
      if (act.dataset.pwa === "never") saveHint({ never: true });
      close();
    });
  }

  /* ---------- זיכרון ההצעה (בשימוש מלא בשלב ב') ---------- */

  function loadHint() {
    try { return JSON.parse(localStorage.getItem(HINT_KEY) || "{}") || {}; }
    catch (e) { return {}; }
  }
  function saveHint(patch) {
    try {
      var h = loadHint();
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) h[k] = patch[k];
      localStorage.setItem(HINT_KEY, JSON.stringify(h));
    } catch (e) { /* מכסת אחסון — לא קריטי */ }
  }

  register();

  return {
    canInstall:   canInstall,
    promptInstall: promptInstall,
    showIOSSheet: showIOSSheet,
    isStandalone: isStandalone,
    isIOS:        isIOS
  };
})();
