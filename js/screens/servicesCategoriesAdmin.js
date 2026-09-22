/* "ניהול קטגוריות שירותים" (2026-09-22) — דרואר קטן שנפתח מתוך מסך "ניהול
   שירותים" (servicesAdmin.js), מנהל-על בלבד. קובץ נפרד ולא עוד קוד בתוך
   servicesAdmin.js: זה רכיב עצמאי (מסך קטן משלו בתוך דרואר) עם מצב, ציור
   ושמירה משלו — בדיוק אותו שיקול הפרדה כמו services.js מול servicesAdmin.js.

   עד היום "סוג שירות" היה 2 ערכים קשיחים בקוד. מהיום זו רשימה שהמנהל מנהל
   בעצמו: הוספה, שינוי שם, סדר (חצים, כמו רשימת השירותים עצמה) והסתרה.
   מחיקה מותרת רק לקטגוריה בלי שירותים פעילים שמצביעים אליה — השרת אוכף את
   זה סופית (saveServiceCategories_ ב-Code.gs), כאן רק חסימה מוקדמת נעימה
   כדי שהמנהל לא ילחץ מחיקה ויקבל שגיאה בלי הקשר. */
window.CBA = window.CBA || {};

CBA.svcCategoriesAdmin = (function () {
  "use strict";

  var state = { open: false, list: [], usage: {}, onSaved: null, dirty: false };

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* servicesAdmin.js מעביר גם כמה שירותים פעילים משתמשים בכל מזהה קטגוריה,
     כדי שאפשר יהיה להציג את זה ולחסום מחיקה מראש בלי לשאול את השרת. */
  function open(categories, usage, onSaved) {
    state.list = clone(categories || []);
    state.usage = usage || {};
    state.onSaved = onSaved || null;
    state.dirty = false;
    state.open = true;
    paint();
  }

  function close(force) {
    if (!force && state.dirty) {
      CBA.ui.confirm("יש שינויים שלא נשמרו בקטגוריות. לצאת בלי לשמור?",
                     { title: "יציאה", okText: "יציאה בלי לשמור", danger: true })
        .then(function (ok) { if (ok) close(true); });
      return;
    }
    var el = document.getElementById("catm-drawer");
    if (el) el.remove();
    state.open = false;
  }

  function touch() { state.dirty = true; }

  function paint() {
    var existing = document.getElementById("catm-drawer");
    if (existing) existing.remove();

    var overlay = document.createElement("div");
    overlay.id = "catm-drawer";
    overlay.innerHTML =
      '<div class="drawer-backdrop" data-cclose></div>' +
      '<aside class="drawer" role="dialog" aria-label="ניהול קטגוריות שירותים">' +
        '<div class="drawer__head">' +
          '<div><div class="drawer__title">ניהול קטגוריות שירותים</div>' +
          '<div class="drawer__sub">קובעות את כותרות הקיבוץ במסך התושב — סדר, שם והסתרה</div></div>' +
          '<button class="drawer__close" data-cclose aria-label="סגור">×</button>' +
        "</div>" +
        '<div class="drawer__body"><div class="card club-card sadm-list" id="catm-list"></div>' +
          '<button type="button" class="btn-primary" id="catm-add" style="margin-top:14px">+ קטגוריה חדשה</button>' +
        "</div>" +
        '<div class="drawer__actions drawer__actions--sticky">' +
          '<div class="drawer__actions-main">' +
            '<button type="button" class="btn-primary" id="catm-save">שמירה</button>' +
            '<button type="button" class="btn-ghost" data-cclose>ביטול</button>' +
          "</div>" +
        "</div>" +
      "</aside>";
    document.body.appendChild(overlay);

    overlay.querySelectorAll("[data-cclose]").forEach(function (el) {
      el.addEventListener("click", function () { close(); });
    });
    document.getElementById("catm-add").addEventListener("click", add);
    document.getElementById("catm-save").addEventListener("click", save);

    paintList();
  }

  function paintList() {
    var box = document.getElementById("catm-list");
    if (!box) return;

    if (!state.list.length) {
      box.innerHTML = '<div class="club-empty">אין עדיין קטגוריות. הוסיפו את הראשונה.</div>';
      return;
    }

    box.innerHTML = state.list.map(function (c, i) {
      var n = state.usage[c.id] || 0;
      return '<div class="sadm-row' + (c.active ? "" : " sadm-row--off") + '" data-i="' + i + '">' +
          '<div class="sadm-row__move">' +
            '<button type="button" class="sadm-arrow" data-up="' + i + '" title="העברה למעלה"' +
              (i === 0 ? " disabled" : "") + ">▲</button>" +
            '<button type="button" class="sadm-arrow" data-down="' + i + '" title="העברה למטה"' +
              (i === state.list.length - 1 ? " disabled" : "") + ">▼</button>" +
          "</div>" +
          '<span class="sadm-row__ico">' + (c.icon ? esc(c.icon) : "•") + "</span>" +
          '<div class="sadm-row__t">' +
            '<input class="field-input catm-name" data-name="' + i + '" value="' + esc(c.name) + '">' +
            '<div class="sadm-row__m">' + n + " שירות" + (n === 1 ? "" : "ים") + "</div>" +
          "</div>" +
          '<label class="ems-toggle" title="' + (c.active ? "מוצג לתושבים — לחיצה תסתיר" : "מוסתר מהתושבים — לחיצה תציג") + '">' +
            '<input type="checkbox" data-toggle="' + i + '"' + (c.active ? " checked" : "") + ">" +
            '<span class="ems-toggle__slider"></span>' +
          "</label>" +
          '<button type="button" class="btn-ghost btn-sm btn-danger" data-del="' + i + '">מחיקה</button>' +
        "</div>";
    }).join("");

    box.querySelectorAll("[data-up]").forEach(function (b) {
      b.addEventListener("click", function () { move(Number(b.dataset.up), -1); });
    });
    box.querySelectorAll("[data-down]").forEach(function (b) {
      b.addEventListener("click", function () { move(Number(b.dataset.down), 1); });
    });
    box.querySelectorAll("[data-name]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        state.list[Number(inp.dataset.name)].name = inp.value; touch();
      });
    });
    box.querySelectorAll("[data-toggle]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        state.list[Number(inp.dataset.toggle)].active = inp.checked; touch();
      });
    });
    box.querySelectorAll("[data-del]").forEach(function (b) {
      b.addEventListener("click", function () { remove(Number(b.dataset.del)); });
    });
  }

  function move(i, dir) {
    var j = i + dir;
    if (j < 0 || j >= state.list.length) return;
    var tmp = state.list[i]; state.list[i] = state.list[j]; state.list[j] = tmp;
    touch(); paintList();
  }

  function add() {
    state.list.push({ id: "cat_" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36),
                       name: "קטגוריה חדשה", icon: "", active: true });
    touch(); paintList();
  }

  /* חסימה מוקדמת ונעימה — השרת חוסם סופית (saveServiceCategories_). קטגוריה
     בלי אף שירות פעיל אפשר למחוק גם מבלי לשמור קודם, כדי לא לאלץ "שמירה,
     ואז מחיקה" לתיקון פשוט. */
  function remove(i) {
    var c = state.list[i];
    var n = state.usage[c.id] || 0;
    if (n > 0) {
      CBA.ui.alert('אי אפשר למחוק את "' + c.name + '" — ' + n + " שירות" + (n === 1 ? "" : "ים") +
        ' פעיל' + (n === 1 ? "" : "ים") + ' עדיין משויכ' + (n === 1 ? "" : "ים") + ' אליה. קודם העבירו אותם לקטגוריה אחרת דרך עריכת השירות.');
      return;
    }
    CBA.ui.confirm('למחוק את הקטגוריה "' + c.name + '"?', { title: "מחיקת קטגוריה", okText: "מחיקה", danger: true })
      .then(function (ok) {
        if (!ok) return;
        state.list.splice(i, 1);
        touch(); paintList();
      });
  }

  function save() {
    for (var i = 0; i < state.list.length; i++) {
      if (!String(state.list[i].name || "").trim()) { CBA.ui.alert("לכל קטגוריה חייב להיות שם."); return; }
    }
    var release = CBA.ui.busy(document.getElementById("catm-save"), "שומר…");
    CBA.data.saveServiceCategories(CBA.serviceUtils.flattenCategories(state.list), function (res) {
      release();
      if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "השמירה נכשלה, נסו שוב."); return; }
      state.dirty = false;
      var cb = state.onSaved;
      close(true);
      if (cb) cb();
    });
  }

  return { open: open };
})();
