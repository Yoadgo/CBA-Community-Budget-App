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
   size:"bar" — סרגל הניהול הדק (A0), ר' bar() למטה.
   ביטול: להסיר את תגית ה-script ואת css/canopy.css, ולהחזיר את moduleHead במסך.
   ========================================================================== */
window.CBA = window.CBA || {};
(function () {
  "use strict";
  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  var BACK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  /* A0/A1 (אושר ע"י יועד 30.9.26) — סרגל ניהול דק (~60px): שם + צבע תחום,
     1–2 מונים של "מה מחכה לי" (לחיצים) ופעולה ראשית. בטלפון: שם + "+" בשורה
     אחת, המונים מתחת.
       CBA.canopy({ size: "bar", dom: "ev", ico: "…", title: "תושבים",
         pills: [{ id: "res-p-su", k: "הרשמות ממתינות" }],
         act: { id: "res-bar-add", label: "הוספת משפחות" },
         extra: '<button …>' })
     המסך מחבר בעצמו את הכפתורים (לפי id) ומעדכן מונה עם CBA.canopy.pill.
     התוכן יושב ב-<div class="cnp2-body cnp2-body--adm"> — ברוחב המלא הקודם. */
  function bar(o) {
    var disc = o.ico ? '<i class="cnp2-disc"><svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + o.ico + '</svg></i>' : "";
    var pills = (o.pills || []).map(function (p) {
      return '<button type="button" class="cnp2-pill is-zero"' + (p.id ? ' id="' + esc(p.id) + '"' : "") + (p.hidden ? " hidden" : "") + '>' +
        '<b>' + esc(p.n == null ? "—" : p.n) + '</b><span>' + esc(p.k || "") + '</span></button>';
    }).join("");
    /* data-plus — בטלפון ה-"+" היחיד (plus.js, ליד בר הניווט) מפעיל את הכפתור הזה */
    var act = o.act ? '<button type="button" class="cnp2-act" data-plus="1"' + (o.act.id ? ' id="' + esc(o.act.id) + '"' : "") +
      (o.act.hidden ? " hidden" : "") + ' aria-label="' + esc(o.act.label || "") + '">' +
      '<span class="cnp2-act__l">+ ' + esc(o.act.label || "") + '</span><span class="cnp2-act__s" aria-hidden="true">+</span></button>' : "";
    return '<section class="cnp2 cnp2--bar" data-dom="' + esc(o.dom || "home") + '" aria-label="' + esc(o.title || "") + '">' +
      '<div class="cnp2-in"><div class="cnp2-row">' +
        '<div class="cnp2-main"><div class="cnp2-h">' + disc + '<h1 class="cnp2-t">' + esc(o.title || "") + '</h1></div></div>' +
        '<div class="cnp2-pills">' + pills + '</div>' +
        '<div class="cnp2-acts">' + (o.extra || "") + act + '</div>' +
      '</div></div>' +
    '</section>';
  }

  function canopy(o) {
    o = o || {};
    if (o.size === "bar") return bar(o);
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

  /* מונה בסרגל הניהול: מספר + מצב (חם כשיש, עמום באפס). label — אופציונלי. */
  canopy.pill = function (root, id, n, label) {
    var el = root && root.querySelector ? root.querySelector("#" + id) : null;
    if (!el) return;
    var num = el.querySelector("b"), lab = el.querySelector("span");
    if (num) num.textContent = n == null ? "—" : String(n);
    if (label != null && lab) lab.textContent = label;
    el.classList.toggle("is-hot", n > 0);
    el.classList.toggle("is-zero", !(n > 0));
  };

  /* A0 — מעטפת למסך ניהול: סרגל + גוף. מחזירה { bar, body, fresh }.
     fresh=true רק כשהסרגל נבנה עכשיו (ניווט / רענון שקט שריקן את main, או
     key אחר) — רק אז מחברים מאזינים לכפתורי הסרגל, אחרת הם מצטברים.
     ציור פנימי של המסך כותב ל-body.innerHTML ולא ל-container. */
  canopy.shell = function (container, o) {
    o = o || {};
    var key = o.key || o.title || "";
    var bar = container.querySelector(":scope > .cnp2--bar");
    var body = container.querySelector(":scope > .cnp2-body--adm");
    if (bar && body && bar.getAttribute("data-key") === key) return { bar: bar, body: body, fresh: false };
    var spec = {}; for (var k in o) spec[k] = o[k];
    spec.size = "bar";
    container.innerHTML = canopy(spec) + '<div class="cnp2-body cnp2-body--adm"></div>';
    bar = container.querySelector(":scope > .cnp2--bar");
    body = container.querySelector(":scope > .cnp2-body--adm");
    bar.setAttribute("data-key", key);
    return { bar: bar, body: body, fresh: true };
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
