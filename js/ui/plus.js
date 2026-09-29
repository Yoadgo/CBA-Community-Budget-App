/* plus.js — הכפתור הצף "+" (גל 1, 30.9.2026 · ספר האבנים F25/B2, H8/A2)
   ============================================================================
   כפתור אחד, באותו מקום בכל מסך תושב (שמאל-למטה, 56px, כהה). לחיצה פותחת
   גיליון תחתון עם פעולות היצירה. **הפעולה של המסך הנוכחי ראשונה** — במסך
   הגינון "דיווח" ראשון, במסך הבקשות "קבלה" ראשונה, במסך המועדון "שריון".

   מה הוא לא עושה (בכוונה):
   • לא פותח מצלמה (החלטת יועד, A2) — רק מנווט למסך הטופס הקיים.
   • לא מופיע באזור הניהול. הוחלט ש-"+" יהיה תלוי-מסך גם בניהול, אבל כל
     מסך ניהול יקבע את שלו בפרק שלו בספר האבנים; עד אז הכפתור מוסתר שם
     (ב-CSS: body[data-area="resident"] בלבד — ר' css/frame.css §6).
   • לא יוצר נתונים ולא קורא לשרת. ניווט בלבד, דרך CBA.navigate —
     ולכן כל בדיקת הרשאה של showScreen חלה גם כאן.

   ביטול: להסיר את תגית ה-script מ-index.html. אין תלות הפוכה.
   ========================================================================== */
window.CBA = window.CBA || {};
CBA.plus = (function () {
  "use strict";

  var ICO = {
    plus:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/></svg>',
    leaf:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/></svg>',
    key:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M15 8l2 2M18 5l2 2"/></svg>'
  };

  /* שלוש פעולות היצירה של התושב (ירדו לכאן משורת הגלולות בבית, H8).
     tint = גוון-התחום (tokens.css), כדי שהדיסקית תתאים לצבע של המסך. */
  var ACTIONS = [
    { screen: "resSubmit",    t: "הגשת קבלה להחזר",       s: "צילום או קובץ · Gemini ממלא את הפרטים", ico: "receipt", tint: "var(--dom-bud)", bg: "var(--dom-bud-bg)" },
    { screen: "resGardenNew", t: "דיווח למראה שיכון",      s: "מפגע, תקלה או בקשה בגינון",             ico: "leaf",    tint: "var(--dom-gar)", bg: "var(--dom-gar-bg)" },
    { screen: "resReserve",   t: "שריון מועדון משפחות",    s: "תאריך ושעה, אישור מהוועד",              ico: "key",     tint: "var(--dom-home)", bg: "var(--dom-home-bg)" }
  ];
  /* איזו פעולה עולה ראשונה בכל מסך */
  var FIRST = {
    resGarden: "resGardenNew", resGardenNew: "resGardenNew",
    resRequests: "resSubmit", resSubmit: "resSubmit",
    resReserve: "resReserve"
  };

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  function ordered() {
    var cur = (document.body && document.body.dataset.screen) || "";
    var first = FIRST[cur];
    if (!first) return ACTIONS.slice();
    return ACTIONS.filter(function (a) { return a.screen === first; })
      .concat(ACTIONS.filter(function (a) { return a.screen !== first; }));
  }

  function sheetHTML() {
    return '<div class="plus-t">מה תרצה לעשות?</div>' + ordered().map(function (a) {
      return '<button type="button" class="plus-opt" data-plus-go="' + esc(a.screen) + '">' +
        '<span class="plus-disc" style="background:' + a.bg + ';color:' + a.tint + '">' + ICO[a.ico] + '</span>' +
        '<span>' + esc(a.t) + '<small>' + esc(a.s) + '</small></span></button>';
    }).join("");
  }

  function open() {
    if (!(CBA.ui && CBA.ui.sheet)) return;
    CBA.ui.sheet({
      key: "plus", label: "פעולה חדשה", sheetCls: "plus-sheet", html: sheetHTML(),
      onPick: function (e, close) {
        var b = e.target.closest("[data-plus-go]");
        if (!b) return;
        close();
        if (CBA.navigate) CBA.navigate(b.getAttribute("data-plus-go"));
      }
    });
  }

  function mount() {
    if (document.getElementById("plus-fab")) return;
    var b = document.createElement("button");
    b.type = "button"; b.id = "plus-fab"; b.className = "plus-fab";
    b.setAttribute("aria-label", "פעולה חדשה");
    b.title = "פעולה חדשה";
    b.innerHTML = ICO.plus;
    b.addEventListener("click", open);
    document.body.appendChild(b);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  return { open: open, mount: mount, _ordered: ordered };
})();
