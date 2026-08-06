/* mobile.js — התנהגויות מובייל בלבד.
   שלב 1: (1) העברת הניווט לבר תחתון מקובע, (2) הסתרת הכותרת בגלילה.
   הכל פועל רק במסך צר; בדסקטופ הקוד מחזיר הכל למקומו ואינו משפיע. */
(function () {
  "use strict";

  var mq          = window.matchMedia("(max-width: 720px)");
  var header      = document.querySelector(".app-header");
  var headerInner = document.querySelector(".app-header__inner");
  var nav         = document.getElementById("app-nav");

  // מעדכן משתנה CSS עם הגובה האמיתי של הכותרת (כדי שהתוכן יתחיל בדיוק מתחתיה)
  function setHeaderVar() {
    if (header) {
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    }
  }

  // ממקם את הניווט: במובייל כילד ישיר של body (בר תחתון), בדסקטופ בחזרה בכותרת.
  // חשוב: מזיזים את אותו אלמנט, כך שה-listener שב-app.js ממשיך לעבוד.
  function placeNav() {
    if (!nav || !headerInner) return;
    if (mq.matches) {
      if (nav.parentElement !== document.body) document.body.appendChild(nav);
      nav.classList.add("app-nav--bottom");
    } else {
      if (nav.parentElement !== headerInner) headerInner.appendChild(nav);
      nav.classList.remove("app-nav--bottom");
      header.classList.remove("app-header--hidden");
    }
    setHeaderVar();
  }

  // הסתרת הכותרת בגלילה למטה, הצגה בגלילה למעלה (מובייל בלבד — ה-CSS מגביל).
  var lastY = 0, ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.pageYOffset || document.documentElement.scrollTop || 0;
      if (mq.matches && y > lastY && y > 80) {
        header.classList.add("app-header--hidden");
      } else {
        header.classList.remove("app-header--hidden");
      }
      lastY = y;
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", placeNav);
  window.addEventListener("load", setHeaderVar);
  if (mq.addEventListener) mq.addEventListener("change", placeNav);

  placeNav();
})();


/* ==========================================================================
   שלב 2: החלקה על כרטיס תקציב לחשיפת "הוסף הוצאה"
   מובייל בלבד. עובד עם האצלת אירועים (document) כדי לשרוד ציור מחדש של המסך.
   ========================================================================== */
(function () {
  "use strict";

  var OPEN = -132;   // כמה הכרטיס מחליק שמאלה כשהוא פתוח (רוחב הכפתור)
  var THRESH = 55;   // מרחק מינימלי כדי לנעול פתיחה
  var mqm = window.matchMedia("(max-width: 720px)");

  var start = null;              // מצב מגע פעיל
  var openWrap = null;           // הכרטיס הפתוח כרגע (אחד בלבד)
  var suppressClickUntil = 0;    // מונע הקלקת־שווא מיד אחרי החלקה

  function closeOpen() {
    if (!openWrap) return;
    var c = openWrap.querySelector(".bcard");
    if (c) c.style.transform = "";
    openWrap.classList.remove("is-open");
    openWrap = null;
  }

  document.addEventListener("touchstart", function (e) {
    if (!mqm.matches) return;
    var wrap = e.target.closest(".bcard-swipe");
    if (openWrap && wrap !== openWrap) closeOpen();      // הקשה מחוץ לכרטיס פתוח סוגרת אותו
    if (!wrap) { start = null; return; }
    if (e.target.closest(".bcard-action")) return;       // הקשה על הכפתור עצמו — לא החלקה
    var t = e.touches[0];
    start = {
      x: t.clientX, y: t.clientY, wrap: wrap,
      card: wrap.querySelector(".bcard"),
      base: (openWrap === wrap) ? OPEN : 0,
      locked: false, horiz: false, swiped: false
    };
  }, { passive: true });

  document.addEventListener("touchmove", function (e) {
    if (!start) return;
    var t = e.touches[0];
    var dx = t.clientX - start.x, dy = t.clientY - start.y;
    if (!start.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      start.locked = true;
      start.horiz = Math.abs(dx) > Math.abs(dy);
      if (start.horiz) start.wrap.classList.add("is-swiping");
    }
    if (!start.horiz) return;
    e.preventDefault();                                  // עוצר גלילה אנכית בזמן החלקה אופקית
    var tx = Math.max(OPEN, Math.min(0, start.base + dx));
    start.card.style.transform = "translateX(" + tx + "px)";
    start.swiped = true;
  }, { passive: false });

  document.addEventListener("touchend", function () {
    if (!start) return;
    var s = start; start = null;
    if (!s.horiz) return;
    s.wrap.classList.remove("is-swiping");
    var m = (s.card.style.transform.match(/-?\d+(?:\.\d+)?/) || [0]);
    var tx = parseFloat(m[0]) || 0;
    if (s.swiped) suppressClickUntil = Date.now() + 350;
    if (tx <= -THRESH) {
      s.card.style.transform = "translateX(" + OPEN + "px)";
      s.wrap.classList.add("is-open");
      openWrap = s.wrap;
    } else {
      s.card.style.transform = "";
      s.wrap.classList.remove("is-open");
      if (openWrap === s.wrap) openWrap = null;
    }
  }, { passive: true });

  // הקלקות: הכפתור פותח את טופס ההוספה; אחרי החלקה חוסמים פתיחת פירוט בטעות
  document.addEventListener("click", function (e) {
    var addBtn = e.target.closest(".bcard-action");
    if (addBtn) {
      e.preventDefault(); e.stopPropagation();
      var catId = addBtn.dataset.addCat;
      closeOpen();
      if (window.CBA && CBA.screens && CBA.screens.expenses &&
          CBA.screens.expenses.openAddForCategory) {
        CBA.screens.expenses.openAddForCategory(catId);
      }
      return;
    }
    if (Date.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
    if (openWrap && e.target.closest(".bcard-swipe") === openWrap) {
      e.preventDefault(); e.stopPropagation();
      closeOpen();
    }
  }, true);   // capture — לרוץ לפני מאזין הכרטיס של מסך התקציב
})();
