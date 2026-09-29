/* canopy.js — החופה של מסכי התושב (גל 3, 1.10.2026 · ספר האבנים B1)
   ============================================================================
   B1 (אושר 30.9): "חופה בשלושה גבהים לכל המסכים" — גבוהה בבית (home.js, משלו),
   בינונית במסך תושב, נמוכה במסכי משנה (טופס) ובניהול. הרכיב הזה הוא הבינונית
   והנמוכה: פס כהה שממשיך את ההדר, עם כותרת המסך, דיסקית בגוון-התחום, משפט,
   ומספר אחד גדול (אם למסך יש מספר שחשוב לו).

   שימוש:
     container.innerHTML = CBA.canopy({ size: "mid", dom: "gar", ico: "<path…>",
       title: "מראה שיכון", sub: "…", stat: { id: "gd-cnp-n", n: "—", label: "פתוחים" },
       minis: [{ id: "gd-cnp-wait", k: "בוצע, לאישור", b: "—" }],
       back: { id: "gd-back", label: "הדיווחים שלי" }, tools: "<html>" })
       + '<div class="cnp2-body">' + התוכן + '</div>';

   ⚠️ הרכיב מחזיר HTML בלבד — בלי מאזינים. כל מסך מחבר את הכפתורים שלו
      (לפי id), בדיוק כמו קודם. ולכן אפשר לאמץ אותו מסך אחרי מסך.
   ⚠️ הפריסה (רוחב מלא, ההדר בלי פינות מעל החופה) — ב-css/canopy.css, לפי
      body:has(.cnp2). מסך בלי חופה לא מושפע כלל.
   ביטול: להסיר את תגית ה-script ואת css/canopy.css, ולהחזיר את moduleHead במסך.
   ========================================================================== */
window.CBA = window.CBA || {};
(function () {
  "use strict";
  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  var BACK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  function canopy(o) {
    o = o || {};
    var size = o.size === "low" ? "low" : "mid";
    var disc = o.ico ? '<i class="cnp2-disc"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + o.ico + '</svg></i>' : "";
    var back = o.back ? '<button type="button" class="cnp2-back"' + (o.back.id ? ' id="' + esc(o.back.id) + '"' : "") +
      (o.back.goto ? ' data-goto="' + esc(o.back.goto) + '"' : "") + '>' + BACK + esc(o.back.label || "חזרה") + '</button>' : "";
    var stat = o.stat ? '<div class="cnp2-stat"><b' + (o.stat.id ? ' id="' + esc(o.stat.id) + '"' : "") + '>' + esc(o.stat.n == null ? "—" : o.stat.n) + '</b>' +
      '<span' + (o.stat.id ? ' id="' + esc(o.stat.id) + '-l"' : "") + '>' + esc(o.stat.label || "") + '</span></div>' : "";
    var minis = (o.minis || []).map(function (m) {
      /* ⚠️ ה-id על המספר (b) ולא על המכל — canopy.set מחליף טקסט, ולא התווית */
      return '<div class="cnp2-mini"><small>' + esc(m.k || "") + '</small><b' + (m.id ? ' id="' + esc(m.id) + '"' : "") + '>' + esc(m.b == null ? "—" : m.b) + '</b></div>';
    }).join("");
    return '<section class="cnp2 cnp2--' + size + (o.wide ? " cnp2--wide" : "") + '" data-dom="' + esc(o.dom || "home") + '" aria-label="' + esc(o.title || "") + '">' +
      '<div class="cnp2-in">' +
        back +
        '<div class="cnp2-row">' +
          '<div class="cnp2-main">' +
            '<div class="cnp2-h">' + disc + '<h1 class="cnp2-t">' + esc(o.title || "") + '</h1></div>' +
            (o.sub ? '<p class="cnp2-s"' + (o.subId ? ' id="' + esc(o.subId) + '"' : "") + '>' + esc(o.sub) + '</p>' : "") +
          '</div>' +
          ((stat || minis) ? '<div class="cnp2-side">' + stat + minis + '</div>' : "") +
        '</div>' +
        (o.tools ? '<div class="cnp2-tools">' + o.tools + '</div>' : "") +
      '</div>' +
    '</section>';
  }

  /* עדכון מספר/מיני אחרי שהנתונים הגיעו (החופה מצוירת לפני הטעינה) */
  canopy.set = function (root, id, text) {
    var el = root && root.querySelector ? root.querySelector("#" + id) : null;
    if (el) el.textContent = text == null ? "—" : String(text);
  };

  /* ההדר מקבל פינות מעוגלות רק כשהחופה יצאה מהמסך (כמו בבית, גל 2) */
  var bound = false;
  canopy.bindScroll = function () {
    if (bound || !window.addEventListener) return;
    bound = true;
    window.addEventListener("scroll", function () {
      var c = document.querySelector(".cnp2");
      if (document.body && document.body.classList) {
        document.body.classList.toggle("cnp2-past", !!c && c.getBoundingClientRect().bottom < 70);
      }
    }, { passive: true });
  };

  CBA.canopy = canopy;
})();
