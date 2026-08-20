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

  /* busy — מצב "עסוק" בולט על הכפתור עצמו (2026-08-20).
     יועד: "הטעינה בזמן שליחת הבקשה לא מספיק ברורה. צריך שזה יהיה גם המצב
     מערכת בצד שמאל אבל גם בולט על כפתור השמירה." החיווי בכותרת מטופל
     מרכזית ב-sheets.js; כאן יושב החצי השני — הכפתור שנלחץ.

     הדפוס שהיה נפוץ באפליקציה, btn.disabled = true בלבד, נכשל בשלוש דרכים:
     הכפתור נראה כבוי אבל לא "עובד", הטקסט לא משתנה אז אין אישור שהלחיצה
     נקלטה, ומי ששכח לשחזר את disabled בענף שגיאה השאיר כפתור מת לתמיד.
     busy() מחזירה פונקציה אחת שמחזירה הכל לקדמותו — כולל הטקסט המקורי —
     ובטוח לקרוא לה פעמיים.

     שימוש:
         var done = CBA.ui.busy(btn, "שולח…");
         CBA.data.doThing(payload, function (res) { done(); ... });

     aria-busy נוסף כדי שקוראי מסך יכריזו על השינוי. */
  function busy(btn, text) {
    if (!btn) return function () {};
    if (btn.dataset.busyOn === "1") return function () {};
    var prevHTML = btn.innerHTML;
    var prevDisabled = !!btn.disabled;
    btn.dataset.busyOn = "1";
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.classList.add("is-busy");
    btn.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span>' +
                    '<span class="btn-busy-text">' + esc(text || "רגע…") + "</span>";
    var released = false;
    return function release() {
      if (released) return;
      released = true;
      btn.classList.remove("is-busy");
      btn.removeAttribute("aria-busy");
      delete btn.dataset.busyOn;
      btn.innerHTML = prevHTML;
      btn.disabled = prevDisabled;
    };
  }

  /* busyText — עדכון הטקסט בזמן שהכפתור כבר עסוק (אחוזי העלאה, שלב בתהליך). */
  function busyText(btn, text) {
    if (!btn || btn.dataset.busyOn !== "1") return;
    var t = btn.querySelector(".btn-busy-text");
    if (t) t.textContent = String(text == null ? "" : text);
  }

  /* --- שדרוג אוטומטי של כפתורים ישנים (2026-08-20) ---
     יועד ביקש לטפל גם ב"מקומות או כפתורים נוספים כאלה באפליקציה". בפועל
     הדפוס הישן חוזר בעשרות מקומות (clubAdmin, residents, expenses, app.js):
         btn.disabled = true; btn.textContent = "שומר…";
     הוא נותן טקסט, אבל לא ספינר, והכפתור נראה כבוי-ומת ולא עסוק. לשכתב את
     כל אתרי הקריאה ידנית זה שינוי רחב ומסוכן בלי צורך; במקום זה יש כאן
     משקיף אחד שמזהה את הדפוס בעצמו: כפתור שהפך ל-disabled וכתוב עליו טקסט
     שנגמר ב-"…" מקבל ספינר ואת המראה של is-busy.

     למה זה בטוח: אנחנו רק *מוסיפים* span בתחילת הכפתור ומחלקה. קוד השחזור
     הקיים (btn.textContent = "שמור") מוחק את ה-span מעצמו, והמשקיף מסיר את
     המחלקה כשה-disabled יורד. שום קוד קיים לא צריך להשתנות, ואם המשקיף לא
     נתמך בדפדפן — הכל ממשיך לעבוד בדיוק כמו קודם.
     קוד חדש עדיף שישתמש ב-CBA.ui.busy במפורש: שם גם הטקסט המקורי משוחזר
     אוטומטית, כולל בענפי שגיאה שקל לשכוח. */
  function isBusyText(btn) {
    var t = (btn.textContent || "").trim();
    return t.length > 1 && (t.slice(-1) === "…" || t.slice(-3) === "...");
  }
  function syncLegacyBusy(btn) {
    if (btn.dataset.busyOn === "1") return;             // מנוהל ע"י CBA.ui.busy
    var should = btn.disabled && isBusyText(btn);
    var has = btn.classList.contains("is-busy");
    if (should === has) return;
    if (should) {
      btn.classList.add("is-busy");
      btn.setAttribute("aria-busy", "true");
      var sp = document.createElement("span");
      sp.className = "btn-spinner";
      sp.setAttribute("aria-hidden", "true");
      btn.insertBefore(sp, btn.firstChild);
    } else {
      btn.classList.remove("is-busy");
      btn.removeAttribute("aria-busy");
      var old = btn.querySelector(".btn-spinner");
      if (old && old.parentNode) old.parentNode.removeChild(old);
    }
  }
  function watchLegacyButtons() {
    if (typeof MutationObserver !== "function") return;
    var pending = null;
    var queue = [];
    function flush() {
      pending = null;
      var list = queue; queue = [];
      list.forEach(function (b) { try { syncLegacyBusy(b); } catch (e) {} });
    }
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        var n = records[i].target;
        if (n && n.nodeType === 3) n = n.parentNode;
        if (!n || n.nodeType !== 1) continue;
        var btn = n.tagName === "BUTTON" ? n : (n.closest ? n.closest("button") : null);
        if (!btn) continue;
        if (queue.indexOf(btn) === -1) queue.push(btn);
      }
      // דחייה לסוף ה-tick: הדפוס הנפוץ הוא שתי השמות ברצף (disabled ואז
      // textContent), ואנחנו רוצים להסתכל על המצב אחרי שתיהן, לא באמצע.
      if (queue.length && !pending) pending = setTimeout(flush, 0);
    }).observe(document.body, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["disabled"]
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watchLegacyButtons);
  } else {
    watchLegacyButtons();
  }

  return { alert: alertBox, confirm: confirmBox, prompt: promptBox, toast: toast,
           busy: busy, busyText: busyText };
})();
