/* js/lazy.js — טעינת קבוצות מסכים לפי דרישה (3.10.2026, אושר ע"י יועד)
   ================================================================
   מה זה עושה, בשפה פשוטה: במקום שכל 3.4MB של JavaScript ייטענו לכולם בפתיחה,
   מסכי הניהול (ר' js/lazyManifest.js) נטענים רק כשמישהו מנווט אליהם.
   תושב רגיל לא מוריד ולא מריץ אותם לעולם; מנהל מקבל אותם בפעם הראשונה שהוא
   נכנס למסך כזה (שלד לרגע, ואז המסך), ומאז הם בזיכרון.

   שלושה כללים:
   1. קבוצה נטענת **כולה ובסדר** (קובץ אחרי קובץ) — יש תלויות בתוך קבוצה.
   2. טעינה כפולה אינה אפשרית: load() לאותה קבוצה מחזיר תמיד את אותו Promise.
   3. כשל רשת לא נתקע לנצח: הקבוצה חוזרת למצב "לא נטענה", והניסיון הבא מתחיל מחדש.

   הכתובות (?v=) מגיעות מהמניפסט כפי ש-tools/stamp-versions.js הטביע אותן,
   ולכן ה-service worker מגיש אותן מהמטמון (cache-first) בדיוק כמו את השאר.

   warm(perms) — אחרי שהבית צויר, מנהל מקבל "חימום": הקבצים של הקבוצות
   שמותרות לו **נמשכים למטמון בלבד** (fetch), בלי להריץ אותם. כך הניווט
   הראשון מהיר גם בטלפון, בלי לשלם את זמן הפרסור בפתיחה — וזה בדיוק מה
   שיועד ביקש: "מסך תקציב משמש כ-10%, עדיף לטעון רק בדרישה". */
window.CBA = window.CBA || {};
CBA.lazy = (function () {
  "use strict";

  var loading = {};   // group -> Promise (בטעינה או שנטענה)
  var done = {};      // group -> true כשכל הקבצים רצו
  var warmed = false;

  function manifest() { return (window.CBA && CBA.lazyManifest) || {}; }

  /* לאיזו קבוצה שייך מסך (או שם קבוצה עצמו). null = לא לפי דרישה. */
  function groupFor(nameOrGroup) {
    var m = manifest();
    if (!nameOrGroup) return null;
    if (m[nameOrGroup]) return nameOrGroup;
    var found = null;
    Object.keys(m).forEach(function (g) {
      if (!found && (m[g].screens || []).indexOf(nameOrGroup) !== -1) found = g;
    });
    return found;
  }

  function isReady(nameOrGroup) {
    var g = groupFor(nameOrGroup);
    return !!(g && done[g]);
  }

  function mark(label) {
    try { if (window.CBA && CBA.diag && CBA.diag.mark) CBA.diag.mark(label); } catch (e) {}
  }

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = false;              // סדר הביצוע = סדר ההוספה, גם כשההורדה מקבילה
      s.onload = function () { resolve(src); };
      s.onerror = function () { reject(new Error("lazy: נכשלה טעינת " + src)); };
      document.head.appendChild(s);
    });
  }

  /* טוען קבוצה (או את הקבוצה של מסך). מחזיר Promise שמתממש כשכל הקבצים רצו. */
  function load(nameOrGroup) {
    var g = groupFor(nameOrGroup);
    if (!g) return Promise.reject(new Error("lazy: אין קבוצה עבור " + nameOrGroup));
    if (loading[g]) return loading[g];
    var files = (manifest()[g].files || []).slice();
    var t0 = Date.now();
    var p = files.reduce(function (chain, src) {
      return chain.then(function () { return injectScript(src); });
    }, Promise.resolve()).then(function () {
      done[g] = true;
      mark("קבוצה נטענה: " + g + " (" + files.length + " קבצים, " + (Date.now() - t0) + "ms)");
      return g;
    }, function (err) {
      delete loading[g];          // כשל — הניסיון הבא מתחיל נקי
      mark("קבוצה נכשלה: " + g);
      throw err;
    });
    loading[g] = p;
    return p;
  }

  /* מריץ fn אחרי שהקבוצה של המסך/הייצוא זמינה. נוח לקריאות השמורות
     (CBA.screens.expenses.showPending וכד'). אם אין קבוצה — רץ מיד. */
  function ensure(nameOrGroup, fn) {
    var g = groupFor(nameOrGroup);
    if (!g || done[g]) { try { fn(); } catch (e) {} return Promise.resolve(); }
    return load(g).then(function () { fn(); });
  }

  /* אילו קבוצות מותרות למשתמש לפי ההרשאות שלו (מנהל-על: הכול). */
  function groupsFor(perms, isSuper) {
    var m = manifest();
    var ps = Array.isArray(perms) ? perms : [];
    return Object.keys(m).filter(function (g) {
      if (isSuper) return true;
      var need = m[g].perms || [];
      return need.some(function (p) { return ps.indexOf(p) !== -1; });
    });
  }

  /* חימום: מושך למטמון (בלי להריץ) את הקבצים של הקבוצות המותרות. פעם אחת
     לכל טעינת עמוד, ורק אחרי שהבית כבר מצויר (app.js קורא עם השהיה). */
  function warm(perms, isSuper) {
    if (warmed) return;
    warmed = true;
    var m = manifest();
    var groups = groupsFor(perms, isSuper);
    if (!groups.length) return;
    var urls = [];
    groups.forEach(function (g) { if (!done[g]) urls = urls.concat(m[g].files || []); });
    var i = 0;
    (function next() {
      if (i >= urls.length) { mark("חימום מטמון: " + urls.length + " קבצים"); return; }
      var u = urls[i++];
      try {
        fetch(u, { credentials: "same-origin" }).then(function () { next(); }, function () { next(); });
      } catch (e) { next(); }
    })();
  }

  return { groupFor: groupFor, isReady: isReady, load: load, ensure: ensure, warm: warm, groupsFor: groupsFor };
})();
