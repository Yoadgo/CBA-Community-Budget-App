/* ============================================================================
 *  appReports.js — דיווחי התושבים על האפליקציה (מנהל-על בלבד)
 * ----------------------------------------------------------------------------
 *  הצד השני של הכפתור הצף (js/ui/report.js). מכוון **פשוט**: רשימה אחת,
 *  תיבת סימון אחת ("טופל"), ותגובה אופציונלית לתושב. אין סטטוסים,
 *  אין הקצאות ואין תורים — הוחלט 9.9.26: מעקב אגרסיבי על משוב פנימי
 *  מייצר עבודת ניהול ולא מידע.
 *
 *  ⚠️ התמונות נשלפות דרך פעולת 'receipt' הקיימת ולא דרך פעולה חדשה: היא
 *     כבר מגישה קובץ פרטי מ-Drive אחרי בדיקת הרשאה, ו-`perm.isSuper` עובר
 *     בה. עוד מסלול הגשת קבצים = עוד שער שאפשר לשכוח לסגור.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

CBA.screens.appReports = (function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  var state = { rows: [], showDone: false };

  function fmtDate(v) {
    if (!v) return "";
    var d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    var p = function (n) { return n < 10 ? "0" + n : String(n); };
    return p(d.getDate()) + "." + p(d.getMonth() + 1) + "." + d.getFullYear() +
           " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function rowHTML(r) {
    var isBug = r.kind === "תקלה";
    var items = (r.items || []).filter(Boolean);
    return '<div class="rr-row' + (r.done ? " is-done" : "") + '" data-id="' + esc(r.id) + '">' +
      '<input type="checkbox" class="rr-chk" ' + (r.done ? "checked" : "") +
        ' title="' + (r.done ? "בטלו סימון" : "סמנו שטופל") + '" aria-label="טופל">' +
      '<div class="rr-body">' +
        '<div class="rr-head">' +
          '<span class="rr-kind ' + (isBug ? "rr-kind--bug" : "rr-kind--idea") + '">' +
            (isBug ? "תקלה" : "הצעת ייעול") + '</span>' +
          '<span>#' + esc(r.id) + '</span>' +
          '<span>' + esc(r.name || r.email) + '</span>' +
          '<span>' + esc(fmtDate(r.date)) + '</span>' +
        '</div>' +
        (items.length
          ? '<ul class="rr-items">' + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + '</ul>'
          : "") +
        '<div class="rr-meta">' + esc([r.screen, r.ver, r.ua].filter(Boolean).join(" · ")) + '</div>' +
        (r.reply ? '<div class="rr-reply">תגובה שנשלחה: ' + esc(r.reply) + "</div>" : "") +
        '<div class="rr-acts">' +
          ((r.photos || []).length
            ? '<button type="button" data-act="photos">תמונות (' + r.photos.length + ")</button>" : "") +
          '<button type="button" data-act="reply">' + (r.reply ? "תגובה נוספת" : "תגובה לתושב") + "</button>" +
        '</div>' +
        '<div class="rr-imgs" hidden></div>' +
      "</div>" +
    "</div>";
  }

  function listHTML() {
    var rows = state.rows.filter(function (r) { return state.showDone || !r.done; });
    var openN = state.rows.filter(function (r) { return !r.done; }).length;
    var doneN = state.rows.length - openN;

    var head =
      '<div class="screen-head"><div class="screen-head__title">דיווחים על האפליקציה</div>' +
      '<div class="screen-head__sub">' +
        (state.rows.length
          ? openN + " פתוחים · " + doneN + " טופלו"
          : "מה שתושבים שולחים דרך הכפתור הוורוד באפליקציה") +
      "</div></div>";

    var toggle = doneN
      ? '<div class="rr-acts" style="margin:0 0 6px"><button type="button" id="rr-toggle">' +
        (state.showDone ? "הסתרת מה שטופל" : "הצגת מה שטופל (" + doneN + ")") + "</button></div>"
      : "";

    if (!rows.length) {
      return head + toggle + '<div class="card club-card">' + CBA.ui.emptyState({
        icon: "inbox",
        title: state.rows.length ? "הכול טופל" : "אין עדיין דיווחים",
        sub: state.rows.length
          ? "אפשר להציג את מה שכבר סומן"
          : "הכפתור הוורוד פתוח לכל משתמש מחובר, בכל מסך"
      }) + "</div>";
    }
    return head + toggle + '<div class="card club-card">' + rows.map(rowHTML).join("") + "</div>";
  }

  return {
    title: "דיווחים על האפליקציה",

    render: function (container) {
      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">דיווחים על האפליקציה</div></div>' +
        '<div class="card club-card"><div class="club-empty">טוען…</div></div>';

      CBA.data.getAppReports(function (res) {
        if (!res || !res.ok) {
          container.innerHTML =
            '<div class="screen-head"><div class="screen-head__title">דיווחים על האפליקציה</div></div>' +
            '<div class="card club-card"><div class="club-empty">לא ניתן לטעון כרגע. ' +
            esc((res && res.error) || "") + "</div></div>";
          return;
        }
        state.rows = res.rows || [];
        paint(container);
      });
    }
  };

  /* ⚠️ כל המאזינים נתלים על .rr-root — אלמנט שנוצר מחדש בכל ציור — ולא על
     container. container הוא ה-main של האפליקציה והוא **שורד** גם מעבר בין
     מסכים: מאזין שנתלה עליו היה נערם בכל ציור (סימון אחד היה נשלח פעמיים)
     וממשיך לפעול גם אחרי שהמשתמש עבר למסך אחר. */
  function paint(container) {
    container.innerHTML = '<div class="rr-root">' + listHTML() + "</div>";
    var root = container.querySelector(".rr-root");

    var toggle = root.querySelector("#rr-toggle");
    if (toggle) toggle.addEventListener("click", function () {
      state.showDone = !state.showDone;
      paint(container);
    });

    root.addEventListener("change", function (e) {
      var chk = e.target.closest(".rr-chk");
      if (!chk) return;
      var rowEl = chk.closest(".rr-row");
      var id = rowEl.dataset.id;
      var want = chk.checked;
      chk.disabled = true;
      CBA.data.setAppReportDone(id, want, "", function (res) {
        chk.disabled = false;
        if (!res || !res.ok) {
          chk.checked = !want;
          return CBA.ui.alert((res && res.error) || "לא הצלחנו לעדכן");
        }
        var row = state.rows.filter(function (r) { return String(r.id) === String(id); })[0];
        if (row) row.done = want;
        rowEl.classList.toggle("is-done", want);
        /* לא מציירים מחדש בזמן שהמשתמש מסמן: השורה הייתה קופצת מהרשימה
           מתחת לאצבע שלו. הרשימה מסתדרת בכניסה הבאה למסך. */
      });
    });

    root.addEventListener("click", function (e) {
      var b = e.target.closest("[data-act]");
      if (!b) return;
      var rowEl = b.closest(".rr-row");
      var id = rowEl.dataset.id;
      var row = state.rows.filter(function (r) { return String(r.id) === String(id); })[0];
      if (!row) return;

      if (b.dataset.act === "photos") {
        var box = rowEl.querySelector(".rr-imgs");
        if (!box.hidden) { box.hidden = true; return; }
        box.hidden = false;
        if (box.dataset.loaded === "1") return;
        box.innerHTML = '<div class="rr-meta">טוען תמונות…</div>';
        box.dataset.loaded = "1";
        box.innerHTML = "";
        (row.photos || []).forEach(function (fid) {
          CBA.data.getReceipt(fid, function (res) {
            var d = document.createElement("div");
            if (res && res.ok && res.url) {
              d.innerHTML = '<img class="rr-img" src="' + res.url + '" alt="צילום מהדיווח">';
            } else {
              d.className = "rr-meta";
              d.textContent = (res && res.error) || "לא הצלחנו לטעון תמונה";
            }
            box.appendChild(d);
          });
        });
        return;
      }

      if (b.dataset.act === "reply") {
        CBA.ui.prompt("מה לכתוב לתושב? הטקסט יישלח אליו במייל.", {
          title: "תגובה לדיווח #" + id,
          okText: "שליחה"
        }).then(function (txt) {
          if (!txt || !String(txt).trim()) return;
          CBA.data.setAppReportDone(id, !!row.done, String(txt).trim(), function (res) {
            if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "לא הצלחנו לשלוח");
            row.reply = String(txt).trim();
            CBA.ui.toast("התגובה נשלחה", "ok");
            paint(container);
          });
        });
      }
    });
  }
})();
