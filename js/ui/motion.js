/* motion.js — שכבת "זכוכית נוזלית" ותנועה, לגמרי נפרדת מלוגיקת האפליקציה.
   לא נוגע בנתונים, במסכים או ב-dataService — רק מוסיף אפקטים ויזואליים
   על גבי אלמנטים קיימים. אם הקובץ הזה לא היה נטען, האפליקציה הייתה
   ממשיכה לעבוד בדיוק אותו דבר, פשוט בלי התוספות של הפאצ' הזה.
   ========================================================================== */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 1. מחוון ניווט נוזלי ----------
     2026-08-08: פעיל גם במובייל (היה דסקטופ בלבד) — אותו #app-nav עובר בין
     הכותרת (דסקטופ) לבר תחתון צף (מובייל, ר' mobile.js placeNav), והוא עכשיו
     מעוצב זהה בשני המצבים, אז המחוון עוקב אחריו בלי תלות ברוחב המסך. */
  (function setupNavIndicator() {
    var nav = document.getElementById("app-nav");
    if (!nav) return;
    var ind = null;

    function ensureIndicator() {
      if (!ind || ind.parentElement !== nav) {
        ind = nav.querySelector(".nav-indicator");
        if (!ind) {
          ind = document.createElement("div");
          ind.className = "nav-indicator";
          nav.insertBefore(ind, nav.firstChild);
        }
      }
      return ind;
    }

    function position() {
      var el = ensureIndicator();
      if (!el) return;
      var active = nav.querySelector(".app-nav__tab.is-active");
      if (!active) { el.style.opacity = "0"; return; }
      el.style.opacity = "1";
      el.style.width = active.offsetWidth + "px";
      el.style.transform = "translateX(" + active.offsetLeft + "px)";
    }

    var mo = new MutationObserver(function () { requestAnimationFrame(position); });
    mo.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    window.addEventListener("resize", position);
    nav.addEventListener("click", function () {
      requestAnimationFrame(position);
      setTimeout(position, 60); // ליתר ביטחון, אחרי שהמסך סיים לצייר מחדש
    });
    window.addEventListener("load", position);
    requestAnimationFrame(position);
  })();

  /* ---------- 2. זוהר זכוכית עוקב-סמן (עכבר בלבד — לא נוגע במגע) ---------- */
  if (!reduceMotion && window.matchMedia("(hover: hover)").matches) {
    var glowTicking = false, glowX = 0, glowY = 0, glowEl = null;
    document.addEventListener("mousemove", function (e) {
      var el = e.target.closest && e.target.closest(".bcard, .btn-primary, .tx-view");
      if (!el) return;
      var r = el.getBoundingClientRect();
      glowEl = el;
      glowX = ((e.clientX - r.left) / r.width) * 100;
      glowY = ((e.clientY - r.top) / r.height) * 100;
      if (!glowTicking) {
        glowTicking = true;
        requestAnimationFrame(function () {
          if (glowEl) {
            glowEl.style.setProperty("--mx", glowX + "%");
            glowEl.style.setProperty("--my", glowY + "%");
          }
          glowTicking = false;
        });
      }
    }, { passive: true });
  }

  /* ---------- 3. פעימת הצלחה על כפתור "אשר" — לא נוגעת בלוגיקת האישור עצמה ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".btn-approve");
    if (!btn || reduceMotion) return;
    btn.classList.remove("is-firing");
    // reflow קטן כדי לאפשר הפעלה חוזרת של האנימציה בלחיצות רצופות
    void btn.offsetWidth;
    btn.classList.add("is-firing");
    setTimeout(function () { btn.classList.remove("is-firing"); }, 450);
  });

  /* ---------- 4. כותרת דינמית במובייל — "זכוכית" מתעצמת בגלילה ---------- */
  (function setupHeaderGlass() {
    var header = document.querySelector(".app-header");
    if (!header) return;
    var mqMobile = window.matchMedia("(max-width: 720px)");
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () {
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        if (mqMobile.matches && y > 4) header.classList.add("app-header--scrolled");
        else header.classList.remove("app-header--scrolled");
        ticking = false;
      });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  })();
})();
