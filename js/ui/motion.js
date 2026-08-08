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

    // 2026-08-08, תיקון דחוף (לבקשת יועד — "המסגרת צבע עוברת למפה למרות
    // שבפועל אני עדיין על תפריט אחר", "התנועה מהירה מדי ולא אחידה",
    // "הפתיחה תקולה"): הבאג היה ב-2 מקומות משולבים.
    //
    // (1) כשהטאב הפעיל (is-active) נמצא בתוך קבוצת-ניווט מתקפלת שסגורה כרגע —
    // הוא קיים ב-DOM אבל ברוחב 0 (מוסתר מאחורי overflow:hidden, ר' style.css
    // .app-nav__group-items). position() היה קורא offsetWidth/offsetLeft של
    // האלמנט הזה כמו שהוא — כלומר רוחב 0, מיקום כלשהו בתוך הקבוצה הסגורה —
    // והמחוון "נעלם" לנקודה כמעט בלתי-נראית. ברגע שהקבוצה נפתחת (המשתמש לוחץ
    // על "השיכון" בלי לנווט לשום מקום), האלמנט הזה מתחיל לתפוס רוחב אמיתי,
    // אבל שום דבר לא יזם reposition נכון — targetEl() למטה פותר את זה: אם
    // הטאב הפעיל נמצא בתוך קבוצה סגורה, מצביעים במקום זאת על כותרת הקבוצה
    // עצמה (שתמיד גלויה), עד שהקבוצה נפתחת בפועל.
    //
    // (2) גם כשהיעד היה נכון, ה-timing של המדידה היה שגוי: nav.click הפעיל
    // position() מיד (rAF) ועוד פעם אחרי 60ms קבועים — אבל הרוחב האמיתי של
    // תת-כפתור שנחשף מגיע רק בסוף טרנזיציית ה-grid-template-columns של
    // .app-nav__group-items (620-780ms!). המדידה ב-60ms תפסה גודל-ביניים
    // קטן/שגוי באמצע ההחלקה, והמחוון "רץ" חלק (בטרנזיציית ה-CSS שלו עצמו)
    // אל היעד השגוי הזה ונשאר שם — בדיוק התחושה של "מהיר מדי ולא אחיד" ו"תקול"
    // שיועד תיאר. התיקון: להאזין ל-transitionend האמיתי על הפס (מבעבע מכל
    // צאצא — כולל .app-nav__group-items, .app-nav__tab--sub, .app-nav__chev)
    // ולמדוד מחדש רק אחרי שהתנועה שגרמה לשינוי הגודל/מיקום באמת נגמרה.
    function targetEl() {
      var active = nav.querySelector(".app-nav__tab.is-active");
      if (!active) return null;
      var closedGroup = active.closest(".app-nav__group:not(.is-open)");
      if (closedGroup) {
        var groupBtn = closedGroup.querySelector(".app-nav__tab--group");
        if (groupBtn) return groupBtn;
      }
      return active;
    }

    // 2026-08-08, תיקון נוסף (יועד: "לוחץ על טאב (השיכון) הסימון השחור מנסה
    // לזוז ואז חוזר" — כלומר המחוון "קופץ" גם כשהטאב הפעיל בפועל לא השתנה
    // ולא אמור לזוז בכלל, למשל לחיצה על "השיכון" בעוד טאב אחר, לא בתוך
    // הקבוצה, עדיין פעיל). שורש הבעיה: מאז תיקון ה"מכל" הכפול (ר' style.css,
    // .app-nav__viewport) — nav עצמו חזר להיות width:fit-content, כלומר
    // גדל/מתכווץ עם התוכן שלו (בדיוק כמו שצריך ויזואלית). אבל .nav-indicator
    // הוא ילד של nav וממוקם בעזרת position:absolute + translateX(offsetLeft)
    // — כלומר ביחס לקצה השמאלי הפנימי של nav. ב-RTL הקצה הימני של nav הוא
    // העוגן היציב (שם nav "נתפס" למכל שסביבו), והקצה השמאלי הוא זה שזז
    // כשnav גדל/מתכווץ (ר' לקח #17-#18 בזיכרון הפרויקט) — אז גם אם הטאב
    // הפעיל עצמו לא זז על המסך בכלל (למשל כי הוא ממוקם *לפני* הקבוצה
    // שנפתחת ב-DOM, מימין לה), ה-offsetLeft שלו (מדוד מהקצה השמאלי הנודד)
    // עדיין משתנה במהלך האנימציה — נמדד רגע לפני הפתיחה מול רגע אחריה, שני
    // ערכים שונים לגמרי, אף שוויזואלית שום דבר לא זז. זה מה שגרם למחוון
    // "לזוז ואז לחזור": מדידה אחת (מוקדמת, כמעט נכונה) ואז מדידה שנייה
    // (בסיום הטרנזיציה, "נכונה" לפי הקואורדינטות הפנימיות החדשות של nav, אבל
    // לא זהה למדידה הקודמת) — וההבדל ביניהן מונפש חלק על ידי הטרנזיציה
    // (transition:transform) של המחוון עצמו, כאילו הטאב הפעיל *באמת* זז.
    //
    // התיקון: למדוד ולמקם את המחוון ביחס לקצה *הימני* של nav (העוגן היציב
    // ב-RTL) במקום השמאלי. algebraית זה שקול למדידת "המרחק מהקצה הימני של
    // nav ועד לקצה הימני של הטאב" — ערך שנשאר קבוע כל עוד שום דבר *בין* הטאב
    // לבין הקצה הימני לא השתנה (בדיוק המקרה שלנו: קבוצה שנפתחת מימין לטאב
    // בסדר ה-DOM לא נמצאת "בין" הטאב לקצה הימני, ולכן לא משפיעה על המרחק
    // הזה כלל, לאורך כל האנימציה, לא רק בהתחלה/בסוף שלה).
    function position() {
      var el = ensureIndicator();
      if (!el) return;
      var active = targetEl();
      if (!active) { el.style.opacity = "0"; return; }
      el.style.opacity = "1";
      el.style.width = active.offsetWidth + "px";
      var offsetFromRight = nav.clientWidth - active.offsetLeft - active.offsetWidth;
      el.style.transform = "translateX(" + (-offsetFromRight) + "px)";
    }

    var mo = new MutationObserver(function () { requestAnimationFrame(position); });
    mo.observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });

    window.addEventListener("resize", position);
    nav.addEventListener("click", function () {
      requestAnimationFrame(position);
    });
    // המדידה הסופית והאמינה: אחרי שכל טרנזיציה רלוונטית בתוך הפס נגמרה בפועל
    // (פתיחת/סגירת קבוצה, דהייה של תת-כפתור) — לא נקודת-זמן קבועה שמנחשת.
    nav.addEventListener("transitionend", function (e) {
      if (e.propertyName === "grid-template-columns" || e.propertyName === "opacity" ||
          e.propertyName === "transform" || e.propertyName === "width") {
        requestAnimationFrame(position);
      }
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
