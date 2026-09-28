/* mobile.js — התנהגויות מובייל בלבד.
   שלב 1: (1) העברת הניווט לבר תחתון מקובע, (2) הסתרת הכותרת בגלילה.
   הכל פועל רק במסך צר; בדסקטופ הקוד מחזיר הכל למקומו ואינו משפיע. */
(function () {
  "use strict";

  var mq          = window.matchMedia("(max-width: 720px)");
  var header      = document.querySelector(".app-header");
  var headerInner = document.querySelector(".app-header__inner");
  var nav         = document.getElementById("app-nav");
  // 2026-08-08: בדסקטופ nav חוזר לתוך .app-nav__viewport (לא ישירות לתוך
  // headerInner) — ה"מכל" הבלתי-נראה שסופג את לחץ הפריסה, ר' index.html + style.css.
  var navViewport = document.getElementById("app-nav-viewport");

  // מעדכן משתנה CSS עם הגובה האמיתי של הכותרת (כדי שהתוכן יתחיל בדיוק מתחתיה)
  function setHeaderVar() {
    if (header) {
      document.documentElement.style.setProperty("--header-h", header.offsetHeight + "px");
    }
  }

  // ממקם את הניווט: במובייל כילד ישיר של body (בר תחתון), בדסקטופ בחזרה
  // לתוך app-nav__viewport בכותרת. חשוב: מזיזים את אותו אלמנט, כך שה-
  // listener שב-app.js ממשיך לעבוד.
  function placeNav() {
    if (!nav || !headerInner) return;
    if (mq.matches) {
      if (nav.parentElement !== document.body) document.body.appendChild(nav);
      nav.classList.add("app-nav--bottom");
    } else {
      if (navViewport && nav.parentElement !== navViewport) navViewport.appendChild(nav);
      nav.classList.remove("app-nav--bottom");
      header.classList.remove("app-header--hidden");
    }
    setHeaderVar();
    ensureSearchFab();
    if (!mq.matches) document.body.classList.remove("nav-mini");
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
        setMini(true);
      } else if (y < lastY - 4 || y <= 80) {
        header.classList.remove("app-header--hidden");
        setMini(false);
      }
      lastY = y;
      ticking = false;
    });
  }

  // (2026-08-18) חושפים את המדידה החוצה — app.js קורא לה בכל שינוי של חיווי
  // השמירה, כרשת ביטחון: אם משום מה הכותרת כן משנה גובה, --header-h (שקובע
  // מאיפה מתחיל התוכן) יתעדכן איתה במקום להישאר על הערך מרגע הטעינה.
  /* ---------- 27.9.26 — ניווט מובייל v2 (ר' claude/mobile-nav-spec-2026-09-27.md) ----------
     (1) כיווץ הבר בגלילה למטה (body.nav-mini), חזרה בגלילה למעלה או בהקשה.
     (2) כפתור חיפוש עגול ליד הבר (במקום הכפתור בכותרת).
     (3) לחיצה-וגרירה על הבר: המחוון עוקב אחרי האצבע (.is-hot, ר' motion.js),
         והבחירה נעשית בשחרור. הקשה רגילה נשארת קליק רגיל לגמרי. */
  function setMini(on) {
    on = !!on && mq.matches;
    if (document.body.classList.contains("nav-mini") === on) return;
    if (on && nav) {
      /* הבר המכווץ + כפתור החיפוש ממורכזים יחד: אותו מרחק מהקצה לשניהם.
         50px ליעד, 8px ריפוד (+2 מסגרת), 8px רווח, 50px חיפוש (ר' mobile.css). */
      var n = nav.querySelectorAll(":scope > .app-nav__tab, :scope > .app-nav__group").length;
      var total = n * 50 + 10 + 8 + 50;
      var start = Math.max(12, Math.round((document.documentElement.clientWidth - total) / 2));
      document.documentElement.style.setProperty("--nm-start", start + "px");
    }
    document.body.classList.toggle("nav-mini", on);
  }

  var fab = null;
  function ensureSearchFab() {
    if (!mq.matches) { if (fab) fab.hidden = true; return; }
    if (!fab) {
      fab = document.createElement("button");
      fab.type = "button";
      fab.className = "nav-search-fab";
      fab.setAttribute("aria-label", "חיפוש");
      fab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>';
      fab.addEventListener("click", function () {
        if (window.CBA && CBA.search && CBA.search.open) CBA.search.open();
      });
      document.body.appendChild(fab);
    }
    fab.hidden = false;
  }

  var press = null;
  function tabAt(x, y) {
    var el = document.elementFromPoint(x, y);
    var t = el && el.closest && el.closest(".app-nav__tab");
    return (t && nav.contains(t)) ? t : null;
  }
  function setHot(t) {
    if (!press || press.hot === t) return;
    if (press.hot) press.hot.classList.remove("is-hot");
    press.hot = t;
    if (t) t.classList.add("is-hot");
  }
  function endPress(commit, e) {
    if (!press) return;
    /* 🔴 27.9.26, דיווח 32 ("בגלילה על מסך שירותים זה עובר ללוח אירועים"):
       גלילה שהתחילה על הבר ויצאה ממנו נחשבה לגרירה, והשחרור — מעל התוכן —
       "בחר" את הכפתור האחרון שעבר מתחת לאצבע. עכשיו בחירה בגרירה רק אם
       האצבע שוחררה על הבר עצמו. */
    if (commit && e && press.hot !== press.down) {
      var br = nav.getBoundingClientRect();
      if (e.clientY < br.top - 12 || e.clientY > br.bottom + 12) commit = false;
    }
    var p = press; press = null;
    nav.classList.remove("is-pressed");
    if (p.hot) p.hot.classList.remove("is-hot");
    /* רק אם האצבע נגררה לכפתור אחר — הקשה רגילה מטופלת ע"י הקליק הטבעי */
    if (commit && p.hot && p.hot !== p.down) {
      /* הקליק הטבעי (על הכפתור שבו התחילה הלחיצה, בגלל לכידת מגע) נבלע —
         אחרת היינו מנווטים פעמיים: פעם למקור ופעם ליעד. */
      swallowUntil = Date.now() + 450;
      var target = p.hot;
      ownClick = true; try { target.click(); } finally { ownClick = false; }
    }
  }
  var swallowUntil = 0, ownClick = false;
  if (nav) {
    nav.addEventListener("pointerdown", function (e) {
      if (!mq.matches || e.button > 0) return;
      if (document.body.classList.contains("nav-mini")) setMini(false);
      var t = tabAt(e.clientX, e.clientY);
      if (!t) return;
      press = { down: t, hot: null, x: e.clientX, y: e.clientY };
      nav.classList.add("is-pressed");
      setHot(t);
    });
    nav.addEventListener("pointermove", function (e) {
      if (!press) return;
      /* תנועה אנכית בעיקרה = ניסיון גלילה, לא גרירה על הבר — מבטלים */
      var dx = Math.abs(e.clientX - press.x), dy = Math.abs(e.clientY - press.y);
      if (dy > 18 && dy > dx) { endPress(false); return; }
      var t = tabAt(e.clientX, e.clientY);
      if (t) setHot(t);
    });
    nav.addEventListener("click", function (e) {
      if (!ownClick && swallowUntil && Date.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    nav.addEventListener("pointerup", function (e) { endPress(true, e); });
    nav.addEventListener("pointercancel", function () { endPress(false); });
    nav.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") endPress(false); });
  }

  window.CBA = window.CBA || {};
  window.CBA.measureHeader = setHeaderVar;

  window.addEventListener("scroll", onScroll, { passive: true });
  /* בועת קבוצה פתוחה נסגרת בכל גלילה של הדף (27.9.26) */
  window.addEventListener("scroll", function () {
    if (document.getElementById("nav-sheet") && window.CBA && CBA.closeNavSheet) CBA.closeNavSheet();
  }, { passive: true });
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
