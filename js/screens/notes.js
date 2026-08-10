/* notes.js — פנקס הערות כלליות, פר שנת תקציב (סעיף 1, 2026-08-09).
   נפתח מלשונית עם סמליל במסך "בניית תקציב" (planning.js) בלבד. עורך טקסט קל
   (contenteditable) עם סרגל כלים מצומצם: הדגשה, כותרת, רשימה ממוספרת, רשימת
   תבליטים — דרך document.execCommand (בלי ספריה חיצונית, בהתאם לכלל "HTML/
   CSS/JS טהורים בלבד").

   חשוב: אין כאן עריכה בו-זמנית אמיתית (Google Docs style) — הסטאק הזה
   (HTML/JS סטטי + Google Sheets/Apps Script) אין לו תשתית real-time. לכן:
   - למעלה תמיד מוצג "נערך לאחרונה על ידי X · בתאריך" (יועד אישר את הגישה הזו).
   - כפתור "יומן עריכות" מציג מי שינה ומתי (בדומה ל"עדכוני תקציב" הקיים).
   - אם שני אנשים עורכים באותו זמן, מי ששומר אחרון מנצח — כמו בכל שמירה
     אחרת באפליקציה (planning.js/expenses.js וכו').
   שמירה: debounce 700ms בדיוק כמו planSave ב-planning.js, עם markDirty/
   clearDirty כדי שרענון רקע לא ידרוס עריכה שטרם נשלחה. */
window.CBA = window.CBA || {};

CBA.notesPanel = (function () {
  "use strict";
  var saveTimer = null;

  function currentUserLabel() {
    var u = window.CBA && CBA.user;
    return (u && (u.name || u.email)) || "";
  }

  function onEsc(e) { if (e.key === "Escape") close(); }

  function close() {
    var el = document.getElementById("cba-notes-drawer");
    if (el) el.remove();
    document.removeEventListener("keydown", onEsc);
    var tab = document.getElementById("notes-side-tab");
    if (tab) tab.classList.remove("is-hidden");
  }

  function metaLabel(n) {
    if (!n || !n.editedBy) return "עדיין לא נערך";
    var when = n.editedAt ? CBA.data.hebrewDateTime(n.editedAt) : "";
    return "נערך לאחרונה על ידי " + n.editedBy + (when ? " · " + when : "");
  }

  function scheduleSave(editorEl, metaEl) {
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("notesSave");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var year = CBA.data.getCurrentYear();
      var content = editorEl.innerHTML;
      var by = currentUserLabel();
      CBA.data.saveNotesToSheet(year, content, by, function () {
        if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("notesSave");
      });
      if (metaEl) metaEl.textContent = metaLabel(CBA.data.getNotes());
    }, 700);
  }

  /* חלון "יומן עריכות" — מי ערך את הפנקס ומתי, לשנה הנוכחית (כרונולוגי,
     החדש למעלה) — אותו רעיון בדיוק כמו planOpenUpdatesModal ב-planning.js. */
  function openLog() {
    var log = CBA.data.getNotesLog();
    var rows = log.length ? log.map(function (u) {
      var when = CBA.esc(CBA.data.hebrewDate(u.date)) + (u.time ? " · " + CBA.esc(u.time) : "");
      return '<tr><td class="dt__date">' + when + '</td><td>' + (u.editedBy ? CBA.esc(u.editedBy) : "—") + '</td></tr>';
    }).join("") : '<tr><td colspan="2" style="color:var(--text-muted); padding:16px 4px;">אין עדיין עריכות רשומות לשנה הזו.</td></tr>';

    var overlay = document.createElement("div");
    overlay.id = "cba-notes-log";
    overlay.innerHTML = `
      <div class="modal-backdrop" data-log-close>
        <div class="modal" role="dialog">
          <div class="modal__head">
            <div>
              <div class="modal__title">יומן עריכות — פנקס הערות</div>
              <div class="modal__sub">מי ערך ומתי · שנת ${CBA.esc(CBA.data.getCurrentYear())}</div>
            </div>
            <button class="drawer__close" data-log-close aria-label="סגור">×</button>
          </div>
          <div class="modal__body">
            <table class="dt" style="width:100%;">${rows}</table>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    function closeLog() {
      overlay.remove();
      document.removeEventListener("keydown", escLog);
    }
    function escLog(e) { if (e.key === "Escape") closeLog(); }
    overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
    overlay.querySelectorAll("[data-log-close]").forEach(function (el) {
      el.addEventListener("click", closeLog);
    });
    document.addEventListener("keydown", escLog);
  }

  // execCommand מיושן רשמית אך עדיין נתמך היטב בדפדפנים הרלוונטיים לאפליקציה
  // הזו — בחירה מכוונת כדי להימנע מספריית עורך-טקסט חיצונית (npm/frameworks
  // אסורים ללא אישור מפורש, ר' כללי העבודה בפרויקט).
  function exec(cmd) {
    document.execCommand(cmd, false, null);
  }
  function toggleHeading() {
    // queryCommandValue מחזיר "h3"/"H3" תלוי דפדפן — משווים באותיות קטנות
    var block = String(document.queryCommandValue("formatBlock") || "").toLowerCase();
    document.execCommand("formatBlock", false, (block === "h3" ? "p" : "h3"));
  }

  function open() {
    close();
    var tab = document.getElementById("notes-side-tab");
    if (tab) tab.classList.add("is-hidden");
    var n = CBA.data.getNotes();
    var year = CBA.data.getCurrentYear();

    var overlay = document.createElement("div");
    overlay.id = "cba-notes-drawer";
    overlay.innerHTML = `
      <div class="drawer-backdrop" data-notes-close></div>
      <aside class="drawer notes-drawer" role="dialog" aria-label="פנקס הערות">
        <div class="drawer__head">
          <div>
            <div class="drawer__title">פנקס הערות — ${CBA.esc(year)}</div>
            <div class="drawer__sub" id="notes-meta">${CBA.esc(metaLabel(n))}</div>
          </div>
          <div class="drawer__head-actions">
            <button class="btn-ghost btn-sm" type="button" data-open-log>יומן עריכות</button>
            <button class="drawer__close" data-notes-close aria-label="סגור">×</button>
          </div>
        </div>
        <div class="drawer__body notes-drawer__body">
          <div class="notes-toolbar">
            <button type="button" class="notes-tool" data-cmd="bold" title="הדגשה"><b>B</b></button>
            <button type="button" class="notes-tool" data-cmd="heading" title="כותרת">כותרת</button>
            <button type="button" class="notes-tool" data-cmd="insertOrderedList" title="רשימה ממוספרת">1.</button>
            <button type="button" class="notes-tool" data-cmd="insertUnorderedList" title="רשימת תבליטים">•</button>
          </div>
          <div class="notes-editor" id="notes-editor" contenteditable="true" dir="rtl">${n.content || ""}</div>
        </div>
      </aside>`;
    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-notes-close]").forEach(function (el) { el.addEventListener("click", close); });
    var logBtn = overlay.querySelector("[data-open-log]");
    if (logBtn) logBtn.addEventListener("click", openLog);

    var editor = overlay.querySelector("#notes-editor");
    var metaEl = overlay.querySelector("#notes-meta");

    overlay.querySelectorAll(".notes-tool").forEach(function (btn) {
      btn.addEventListener("click", function () {
        editor.focus();
        if (btn.dataset.cmd === "heading") toggleHeading();
        else exec(btn.dataset.cmd);
        editor.dispatchEvent(new Event("input"));
      });
    });

    editor.addEventListener("input", function () { scheduleSave(editor, metaEl); });
    document.addEventListener("keydown", onEsc);
    editor.focus();
  }

  return { open: open, close: close };
})();
