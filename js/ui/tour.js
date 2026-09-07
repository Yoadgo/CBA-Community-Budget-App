/* tour.js — סיור היכרות (2026-08-28)
   ============================================================================
   חפיסת מסכים בסגנון הפעלה של מכשיר חדש: מסך מלא, רעיון אחד לכרטיס, "הבא",
   ו"דלג" שתמיד זמין.

   למה חפיסה ולא חיצים על הממשק האמיתי: חיצים מעוגנים לאלמנטים, וכל שינוי
   בשורת הניווט או במיקום כפתור הופך אותם לחיצים שמצביעים על אוויר — בשקט,
   בלי שגיאה, עד שתושב מתלונן. באפליקציה הזאת שורת הניווט זזה שלוש פעמים
   בחודש. חפיסה לא יודעת כלום על המבנה ולכן לא נשברת.

   שלושה מצבים:
     • כניסה ראשונה (seen = 0)      → הסיור המלא נפתח מעצמו, פעם אחת.
     • יש צעדים חדשים (גרסה > seen) → **לא** משתלט על המסך. כרטיס קטן בעמוד
                                       הקבלה, והמשתמש מחליט.
     • מתפריט המשתמש               → הסיור המלא, מתי שרוצים.

   התוכן כולו מהגיליון (טאב "סיור היכרות", ר' Code.gs). הקובץ הזה לא מכיר אף
   טקסט חוץ מכפתורי הניווט — הוספת פיצ'ר חדש לסיור היא שורה בגיליון, לא קוד.
   ========================================================================== */
window.CBA = window.CBA || {};

CBA.tour = (function () {
  "use strict";

  var steps = [];          // כל הצעדים שמתאימים לי (השרת כבר סינן לפי קהל)
  var seen = 0;            // הגרסה הגבוהה ביותר שכבר ראיתי
  var loaded = false, loading = false;
  var el = null, idx = 0, deck = [], lastFocus = null;
  var AUTO_KEY = "cba_tour_auto_v1";   // רשת ביטחון מקומית, ר' maybeAutoStart

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? (d || 0) : n; }
  function val(row, key) { return String(row[key] == null ? "" : row[key]).trim(); }

  var ICONS = {
    wave:    '<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M10 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M13 10.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2a1.5 1.5 0 0 1 3 0"/>',
    receipt: '<path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 12.5h7M8.5 16h4.5"/>',
    key:     '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    map:     '<path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7z"/><path d="M9 4v13M15 7v13"/>',
    shield:  '<path d="M12 2.8 4.8 5.6v5.9c0 4.3 2.9 8.3 7.2 9.7 4.3-1.4 7.2-5.4 7.2-9.7V5.6z"/><path d="m9 12 2.1 2.1L15.2 10"/>',
    phone:   '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7.5v7M9 11.5l3 3 3-3"/>',
    star:    '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    // עלה — מודול "מראה שיכון" (2026-09-07). אותו סמליל בדיוק כמו הטאב עצמו,
    // כדי שכרטיס הסיור והיעד שהוא מפנה אליו ייראו כמו אותו דבר.
    leaf:    '<path d="M4 20c0-8 5-14 16-15 1 11-5 16-13 16"/><path d="M4 20c3-5 6-8 11-10"/>'
  };
  function svg(name, size) {
    var d = ICONS[name] || ICONS.star, n = size || 44;
    return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }

  function maxVersion(list) {
    return (list || []).reduce(function (m, s) { return Math.max(m, num(s["גרסה"], 1)); }, 0);
  }
  function newSteps() {
    return steps.filter(function (s) { return num(s["גרסה"], 1) > seen; });
  }

  /* ------------------------------------------------------------- טעינה --- */
  function load(cb) {
    if (loaded) { if (cb) cb(true); return; }
    if (loading) { if (cb) cb(false); return; }
    if (!(CBA.data && CBA.data.getTour)) { if (cb) cb(false); return; }
    loading = true;
    CBA.data.getTour(function (res) {
      loading = false;
      if (!res || !res.ok) { if (cb) cb(false); return; }
      steps = res.steps || [];
      seen = num(res.seen, 0);
      loaded = true;
      if (cb) cb(true);
    });
  }

  /* שמירת "ראיתי עד כאן". שומרים גם מקומית מיד — כדי שכישלון רשת רגעי לא
     יגרום לסיור להיפתח שוב בפעם הבאה ולהרגיש כמו תקלה. */
  function markSeen(v) {
    if (v <= seen) return;
    seen = v;
    try { localStorage.setItem(AUTO_KEY, String(v)); } catch (e) {}
    if (CBA.data && CBA.data.markTourSeen) CBA.data.markTourSeen(v, function () {});
  }
  function localSeen() {
    try { return num(localStorage.getItem(AUTO_KEY), 0); } catch (e) { return 0; }
  }

  /* -------------------------------------------------------------- ציור --- */
  function render() {
    var s = deck[idx];
    if (!s) { close(); return; }
    var total = deck.length;
    var isLast = idx === total - 1;
    var target = val(s, "מסך יעד");
    var btnLabel = val(s, "כפתור");
    var dots = "";
    for (var i = 0; i < total; i++) {
      dots += '<span class="tr-dot' + (i === idx ? " is-on" : "") + '"></span>';
    }
    el.querySelector(".tr-card").innerHTML =
      '<button type="button" class="tr-skip" data-tr-skip>' + (isLast ? "סגירה" : "דילוג") + '</button>' +
      '<div class="tr-body">' +
        '<div class="tr-ico">' + svg(val(s, "אייקון")) + '</div>' +
        '<h2 class="tr-title">' + esc(val(s, "כותרת")) + '</h2>' +
        '<p class="tr-text">' + esc(val(s, "טקסט")) + '</p>' +
        (target && btnLabel
          ? '<button type="button" class="tr-jump" data-tr-jump="' + esc(target) + '">' + esc(btnLabel) + '</button>'
          : "") +
      '</div>' +
      '<div class="tr-foot">' +
        '<button type="button" class="tr-back" data-tr-back' + (idx === 0 ? " hidden" : "") + '>הקודם</button>' +
        '<div class="tr-dots">' + dots + '</div>' +
        '<button type="button" class="tr-next" data-tr-next>' + (isLast ? "סיימנו" : "הבא") + '</button>' +
      '</div>';
    var next = el.querySelector("[data-tr-next]");
    if (next) next.focus();
  }

  function go(d) {
    var n = idx + d;
    if (n < 0) return;
    if (n >= deck.length) { finish(); return; }
    idx = n;
    render();
  }

  /* סיום רגיל וגם דילוג מסמנים "ראיתי" — מי שדילג בחר לא לראות, ואין שום
     תועלת בלהקפיץ לו את זה שוב מחר. הוא תמיד יכול לפתוח מהתפריט. */
  function finish() {
    markSeen(maxVersion(deck) || maxVersion(steps));
    close();
    if (CBA.screens && CBA.screens.resHome && document.body.dataset.screen === "resHome") {
      if (CBA.navigate) CBA.navigate("resHome");   // מרענן כדי שכרטיס "יש חדש" ייעלם
    }
  }

  function jump(target) {
    var v = maxVersion(deck) || maxVersion(steps);
    markSeen(v);
    close();
    if (target === "security") { if (CBA.security) CBA.security.open(); return; }
    if (target === "install")  { if (CBA.pwa) CBA.pwa.promptInstall(); return; }
    if (CBA.navigate) CBA.navigate(target);
  }

  /* ------------------------------------------------------ פתיחה/סגירה --- */
  function open(list) {
    if (!list || !list.length) return;
    if (el) close();
    deck = list; idx = 0;
    lastFocus = document.activeElement;

    el = document.createElement("div");
    el.className = "tr";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "סיור היכרות");
    el.innerHTML = '<div class="tr-card"></div>';
    document.body.appendChild(el);
    document.body.classList.add("tr-open");

    el.addEventListener("click", function (e) {
      if (e.target.closest("[data-tr-skip]")) { finish(); return; }
      if (e.target.closest("[data-tr-next]")) { go(1); return; }
      if (e.target.closest("[data-tr-back]")) { go(-1); return; }
      var j = e.target.closest("[data-tr-jump]");
      if (j) jump(j.dataset.trJump);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape")     { e.preventDefault(); finish(); }
      else if (e.key === "ArrowLeft")  { e.preventDefault(); go(1); }   // RTL: שמאלה = קדימה
      else if (e.key === "ArrowRight") { e.preventDefault(); go(-1); }
    });
    // החלקה בנייד — אותו כיוון כמו החצים
    var x0 = null;
    el.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    render();
  }

  function close() {
    if (!el) return;
    el.remove(); el = null; deck = []; idx = 0;
    document.body.classList.remove("tr-open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* ------------------------------------------------------- API חיצוני --- */
  /* הסיור המלא — מתפריט המשתמש ומהכניסה הראשונה. */
  function start() { load(function (ok) { if (ok) open(steps.slice()); }); }
  /* רק מה שחדש מאז הפעם הקודמת — מהכרטיס בעמוד הקבלה. */
  function startNew() { load(function (ok) { if (ok) open(newSteps()); }); }

  /* פתיחה אוטומטית: **רק** בכניסה ראשונה אמיתית (seen = 0 גם בשרת וגם
     מקומית). כשיש צעדים חדשים לתושב ותיק — לא נוגעים במסך שלו; עמוד הקבלה
     יציג כרטיס והוא יחליט. נקרא פעם אחת אחרי שהאפליקציה מוכנה. */
  var autoDone = false;
  function maybeAutoStart() {
    if (autoDone) return;
    autoDone = true;
    load(function (ok) {
      if (!ok || !steps.length) return;
      if (seen > 0 || localSeen() > 0) return;
      if (document.getElementById("login-gate") &&
          !document.getElementById("login-gate").hidden) return;
      open(steps.slice());
    });
  }

  /* לעמוד הקבלה: כמה צעדים חדשים מחכים. מחזיר 0 כל עוד לא נטען — עמוד
     הקבלה מבקש טעינה וייקרא שוב כשהיא תחזור. */
  function newCount(cb) {
    if (loaded) { var n = seen > 0 ? newSteps().length : 0; if (cb) cb(n); return n; }
    load(function (ok) { if (cb) cb(ok && seen > 0 ? newSteps().length : 0); });
    return 0;
  }

  return {
    start: start, startNew: startNew, close: close,
    maybeAutoStart: maybeAutoStart, newCount: newCount,
    isOpen: function () { return !!el; }
  };
})();
