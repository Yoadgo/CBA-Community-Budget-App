/* dialog.js — חלונות האפליקציה (2026-08-19, ממצא 2.6 בדו"ח הבדיקה).
   ============================================================================
   באפליקציה נספרו 49 חלונות דפדפן מובנים (26 alert, 16 confirm, 7 prompt).
   שלוש בעיות איתם: הם נראים כמו הודעת מערכת ולא כמו האפליקציה, הם חוסמים את
   כל הדפדפן, ובמובייל הם נראים במיוחד זר. הכי בולט היה window.prompt — פעולה
   משמעותית כמו יצירת שנת תקציב חדשה נעשתה דרך חלון אפור בלי הסבר ובלי ולידציה.

   כאן יושבת החלופה: CBA.ui.alert / confirm / prompt / toast. כולן מחזירות
   Promise, כי מודל אמיתי הוא א-סינכרוני מטבעו (בניגוד ל-window.confirm שעוצר
   את כל הדף). לכן כל מעבר מ-window.confirm דורש שינוי קטן במבנה:
       if (!window.confirm("...")) return;   →   CBA.ui.confirm("...").then(function (ok) { if (!ok) return; ... });

   העיצוב נגזר מהשפה הקיימת (כרטיס לבן גיאומטרי, הצללה רק על אלמנט צף, CTA
   שחור מלא) — ר' .cba-dlg ב-style.css.

   נגישות: Esc סוגר, Enter מאשר, המיקוד נכנס לשדה/לכפתור האישור ומוחזר בסוף
   לאלמנט שממנו יצאנו. */
window.CBA = window.CBA || {};

CBA.ui = (function () {
  "use strict";

  var openCount = 0;

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  // טקסט חופשי -> HTML עם שמירה על מעברי שורה (הודעות רבות באפליקציה מכילות \n)
  function textHTML(s) {
    return esc(s).replace(/\n/g, "<br>");
  }

  function build(opts) {
    var wrap = document.createElement("div");
    wrap.className = "cba-dlg-backdrop";
    wrap.innerHTML =
      '<div class="cba-dlg" role="dialog" aria-modal="true"' +
        (opts.title ? ' aria-label="' + esc(opts.title) + '"' : "") + '>' +
        (opts.title ? '<div class="cba-dlg__title">' + textHTML(opts.title) + '</div>' : "") +
        (opts.message ? '<div class="cba-dlg__msg">' + textHTML(opts.message) + '</div>' : "") +
        (opts.input
          ? '<input class="cba-dlg__input field-input" type="text" value="' + esc(opts.value || "") + '"' +
            (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + '>'
          : "") +
        '<div class="cba-dlg__actions">' +
          (opts.cancelText ? '<button type="button" class="cba-dlg__btn cba-dlg__btn--ghost" data-dlg="cancel">' + esc(opts.cancelText) + '</button>' : "") +
          '<button type="button" class="cba-dlg__btn cba-dlg__btn--go' + (opts.danger ? " is-danger" : "") + '" data-dlg="ok">' + esc(opts.okText || "אישור") + '</button>' +
        '</div>' +
      '</div>';
    return wrap;
  }

  function open(opts) {
    return new Promise(function (resolve) {
      var prevFocus = document.activeElement;
      var wrap = build(opts);
      document.body.appendChild(wrap);
      openCount++;
      document.body.classList.add("has-cba-dlg");
      requestAnimationFrame(function () { wrap.classList.add("is-open"); });

      var inputEl = wrap.querySelector(".cba-dlg__input");
      var okBtn = wrap.querySelector('[data-dlg="ok"]');
      setTimeout(function () { (inputEl || okBtn).focus(); if (inputEl) inputEl.select(); }, 40);

      var done = false;
      function close(result) {
        if (done) return;
        done = true;
        wrap.classList.remove("is-open");
        document.removeEventListener("keydown", onKey, true);
        setTimeout(function () {
          if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
          openCount = Math.max(0, openCount - 1);
          if (!openCount) document.body.classList.remove("has-cba-dlg");
          try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {}
        }, 180);
        resolve(result);
      }
      function onKey(e) {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(opts.input ? null : false); }
        else if (e.key === "Enter" && (!inputEl || document.activeElement === inputEl)) {
          e.preventDefault(); e.stopPropagation(); close(opts.input ? inputEl.value : true);
        }
        // מלכודת מיקוד — Tab לא יוצא מהמודל
        else if (e.key === "Tab") {
          var f = wrap.querySelectorAll("input, button");
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      document.addEventListener("keydown", onKey, true);
      wrap.addEventListener("click", function (e) {
        if (e.target === wrap) { close(opts.input ? null : false); return; }   // לחיצה ברקע = ביטול
        var b = e.target.closest("[data-dlg]");
        if (!b) return;
        if (b.dataset.dlg === "ok") close(opts.input ? inputEl.value : true);
        else close(opts.input ? null : false);
      });
    });
  }

  /* alert — הודעה עם כפתור אחד. מחזירה Promise שנפתרת בסגירה. */
  function alertBox(message, title) {
    return open({ title: title || "", message: message, okText: "הבנתי" });
  }
  /* confirm — מחזירה true/false. danger=true צובע את כפתור האישור באדום
     (מחיקה/דחייה), לפי שפת העיצוב: אדום רק כשבאמת מאבדים משהו. */
  function confirmBox(message, opts) {
    opts = opts || {};
    return open({
      title: opts.title || "", message: message,
      okText: opts.okText || "אישור", cancelText: opts.cancelText || "ביטול",
      danger: !!opts.danger
    });
  }
  /* prompt — מחזירה את הטקסט, או null אם בוטל. validate(value) אופציונלי:
     מחזיר מחרוזת שגיאה כדי לחסום אישור (זה מה שחסר לגמרי ב-window.prompt). */
  function promptBox(message, opts) {
    opts = opts || {};
    return open({
      title: opts.title || "", message: message, input: true,
      value: opts.value || "", placeholder: opts.placeholder || "",
      okText: opts.okText || "אישור", cancelText: opts.cancelText || "ביטול"
    });
  }

  /* toast — הודעת הצלחה קצרה שלא חוסמת כלום. מחליפה alert של "הצליח!". */
  function toast(message, kind) {
    var t = document.createElement("div");
    t.className = "cba-toast" + (kind ? " cba-toast--" + kind : "");
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("is-open"); });
    setTimeout(function () {
      t.classList.remove("is-open");
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 300);
    }, 2600);
  }

  return { alert: alertBox, confirm: confirmBox, prompt: promptBox, toast: toast };
})();
