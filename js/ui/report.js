/* ============================================================================
 *  report.js — "דיווח על האפליקציה" (2026-09-09)
 * ----------------------------------------------------------------------------
 *  כפתור צף בפינה התחתונה, בכל מסך ובשני האזורים. לחיצה פותחת שתי אפשרויות
 *  — הצעת ייעול / דיווח על תקלה — וכל אחת מהן פותחת טופס קצר עם סעיפים
 *  מרובים ואפשרות לצרף תמונה. הדיווחים נאגרים ונקראים במסך appReports
 *  (מנהל-על בלבד).
 *
 *  ⚠️ "צילום מסך" — למה זו בחירת קובץ ולא צילום אמיתי (הוכרע 9.9.26):
 *     getDisplayMedia (הדרך היחידה לצלם באמת את הלשונית) **אינו נתמך
 *     ב-Safari באייפון**, שהוא הדפדפן של רוב התושבים, ו-html2canvas היא
 *     ספרייה חיצונית שגם נשברת על ה-backdrop-filter ועל מפת ה-SVG שלנו.
 *     לכן: accept="image/*" — בטלפון זה פותח מצלמה+גלריה, והמשתמש בוחר את
 *     צילום המסך שכבר צילם. **במקום** הצילום האוטומטי נלכד ההקשר עצמו
 *     (מסך, אזור, גרסת לקוח, גרסת שרת, דפדפן) — ברוב התקלות הוא שווה יותר.
 *
 *  ⚠️ הכיווץ כאן הוא עותק מכוון של resGarden.js ולא ייבוא ממנו: resGarden
 *     הוא מסך של אזור התושב, והכפתור הזה חייב לעבוד גם כשהמסך הזה לא נטען.
 *     שינוי באחד אינו מחייב שינוי בשני — אלה שני שימושים נפרדים.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.report = (function () {
  "use strict";

  var ITEM_MAX  = 5;      // סעיפים בדיווח אחד
  var CHAR_MAX  = 300;    // תווים לסעיף
  var PHOTO_MAX = 3;
  var MAX_EDGE  = 1600;
  var JPEG_Q    = 0.72;

  var KIND_IDEA = "ייעול";
  var KIND_BUG  = "תקלה";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  var ICO = {
    /* ⚠️ הסמליל של הכפתור הצף הוא **נורה** ולא "+" (הוכרע 15.9.26): "+" אומר
       "הוספה" ואינו קשור לדיווח, והסיבוב ב-45° שנלווה אליו (כדי להפוך אותו
       ל-✕) הוא מה שגרם לתחושת ההתרחבות המוזרה. הנורה יציבה ואינה מסתובבת. */
    fab:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>',
    bulb:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>',
    bug:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12.75c1.148 0 2.278.08 3.383.237 1.037.146 1.866.966 1.866 2.013 0 3.728-2.35 6.75-5.25 6.75S6.75 18.728 6.75 15c0-1.046.83-1.867 1.866-2.013A24.204 24.204 0 0 1 12 12.75Zm0 0c2.883 0 5.647.508 8.207 1.44a23.91 23.91 0 0 1-1.152 6.06M12 12.75c-2.883 0-5.647.508-8.208 1.44.125 2.104.52 4.136 1.153 6.06M12 12.75a2.25 2.25 0 0 0 2.248-2.354M12 12.75a2.25 2.25 0 0 1-2.248-2.354M12 8.25c.995 0 1.971-.08 2.922-.236.403-.066.74-.358.795-.762a3.778 3.778 0 0 0-.399-2.25M12 8.25c-.995 0-1.97-.08-2.922-.236-.402-.066-.74-.358-.795-.762a3.734 3.734 0 0 1 .4-2.253M12 8.25a2.25 2.25 0 0 0-2.248 2.146M12 8.25a2.25 2.25 0 0 1 2.248 2.146M8.683 5a6.032 6.032 0 0 1-1.155-1.002c.07-.63.27-1.222.574-1.747m.581 2.749A3.75 3.75 0 0 1 15.318 5m0 0c.427-.283.815-.62 1.155-.999a4.471 4.471 0 0 0-.575-1.752M4.921 6a24.048 24.048 0 0 0-.392 3.314c1.668.546 3.416.914 5.223 1.082M19.08 6c.205 1.08.337 2.187.392 3.314a23.882 23.882 0 0 1-5.223 1.082"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z"/><path d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z"/></svg>'
  };

  /* ⚠️ כל ההקשר נאסף ב-js/ui/diag.js ולא כאן. הסיבה: אוסף שנטען יחד עם
     החלונית היה מתחיל להאזין רק כשהמשתמש פותח אותה — ואז שגיאת ה-JS
     שבגללה הוא פותח אותה כבר קרתה ואבדה. diag.js נטען ראשון ומאזין תמיד.
     כאן נשארת רק נפילה-לאחור למקרה שהקובץ לא נטען, כדי שהדיווח יישלח
     גם אז (דיווח בלי הקשר עדיף על כפתור שנופל). */
  function context() {
    if (CBA.diag && CBA.diag.snapshot) return CBA.diag.snapshot();
    var key = (document.body && document.body.dataset.screen) || "";
    var label = (CBA.screenLabel && key) ? CBA.screenLabel(key) : key;
    return { screen: key, screenLabel: label, ver: "", srvVer: "", ua: "",
             perms: "", year: "", net: "", dialog: "", errors: [], trail: [] };
  }

  /* --- כיווץ תמונה (ר' ההערה בראש הקובץ) --- */
  function readAsDataURL(file, cb) {
    var rd = new FileReader();
    rd.onload = function () { cb(String(rd.result)); };
    rd.onerror = function () { cb(null); };
    rd.readAsDataURL(file);
  }
  function compressImage(file, cb) {
    function fallback() { readAsDataURL(file, cb); }
    if (!file || !/^image\//.test(file.type || "")) return fallback();
    var objUrl = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      var out = null;
      try {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var scale = Math.min(1, MAX_EDGE / Math.max(w || 1, h || 1));
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(w * scale));
        cv.height = Math.max(1, Math.round(h * scale));
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        out = cv.toDataURL("image/jpeg", JPEG_Q);
      } catch (e) { out = null; }
      URL.revokeObjectURL(objUrl);
      if (!out) return fallback();
      if (file.size && (out.length * 0.75) >= file.size) return fallback();
      cb(out);
    };
    img.onerror = function () { URL.revokeObjectURL(objUrl); fallback(); };
    img.src = objUrl;
  }

  /* ====================== החלונית ====================== */
  function itemHTML(n) {
    return '<div class="rep-item">' +
             '<span class="rep-item__n">' + n + '</span>' +
             '<textarea rows="2" maxlength="' + CHAR_MAX + '" placeholder="' +
               (n === 1 ? "כתבו במשפט אחד — מה קרה או מה כדאי לשפר" : "סעיף נוסף") + '"></textarea>' +
             '<button type="button" class="rep-item__x" aria-label="הסרת הסעיף"' +
               (n === 1 ? ' hidden' : '') + '>✕</button>' +
           '</div>';
  }

  function openForm(kind) {
    var isBug = kind === KIND_BUG;
    var ctx = context();
    var photos = [];

    var html =
      '<div class="rep-form">' +
        '<div class="rep-items">' + itemHTML(1) + '</div>' +
        '<button type="button" class="rep-add">' + (isBug ? "+ עוד תקלה" : "+ עוד הצעה") + '</button>' +
        '<div class="rep-photos">' +
          '<button type="button" class="rep-photo-btn">' + ICO.photo + ' צירוף תמונה או צילום מסך</button>' +
          '<input type="file" class="rep-file" accept="image/*" multiple hidden>' +
        '</div>' +
        '<p class="rep-hint">' +
          'אם צילמתם מסך — הוא נמצא בגלריה של הטלפון, וכפתור הצירוף פותח אותה.<br>' +
          'כדי שלא תצטרכו למלא פרטים, נשלח אוטומטית יחד עם הדיווח: ' +
          esc([ctx.screenLabel ? 'מסך "' + ctx.screenLabel + '"' : "", ctx.dialog,
               ctx.ver, ctx.ua, ctx.net].filter(Boolean).join(" · ")) +
          (ctx.errors && ctx.errors.length
            ? '<br>וכן ' + ctx.errors.length + ' הודעות שגיאה טכניות שנרשמו ברקע.' : "") +
        '</p>' +
        '<p class="rep-err" hidden></p>' +
      '</div>';

    CBA.ui.dialog({
      title: isBug ? "דיווח על תקלה" : "הצעת ייעול לאפליקציה",
      html: html,
      wide: true,
      sticky: true,     // טופס עם טקסט שהוקלד — נסגר רק בכפתור מפורש
      okText: "שליחה",
      cancelText: "ביטול",
      onMount: function (wrap) {
        var itemsEl = wrap.querySelector(".rep-items");
        var addBtn  = wrap.querySelector(".rep-add");
        var fileEl  = wrap.querySelector(".rep-file");
        var photoBtn = wrap.querySelector(".rep-photo-btn");
        var photosEl = wrap.querySelector(".rep-photos");

        function renumber() {
          var rows = itemsEl.querySelectorAll(".rep-item");
          Array.prototype.forEach.call(rows, function (r, i) {
            r.querySelector(".rep-item__n").textContent = String(i + 1);
            r.querySelector(".rep-item__x").hidden = (rows.length === 1);
          });
          addBtn.disabled = rows.length >= ITEM_MAX;
        }
        addBtn.addEventListener("click", function () {
          if (itemsEl.querySelectorAll(".rep-item").length >= ITEM_MAX) return;
          var d = document.createElement("div");
          d.innerHTML = itemHTML(itemsEl.querySelectorAll(".rep-item").length + 1);
          var row = d.firstChild;
          itemsEl.appendChild(row);
          renumber();
          row.querySelector("textarea").focus();
        });
        itemsEl.addEventListener("click", function (e) {
          var x = e.target.closest(".rep-item__x");
          if (!x) return;
          x.closest(".rep-item").remove();
          renumber();
        });

        photoBtn.addEventListener("click", function () { fileEl.click(); });
        fileEl.addEventListener("change", function () {
          Array.prototype.slice.call(fileEl.files || []).forEach(function (f) {
            if (photos.length >= PHOTO_MAX) return;
            /* הכיווץ אסינכרוני — המכסה נבדקת שוב *בתוך* ה-callback, אחרת
               בחירה של כמה קבצים בבת אחת עוקפת אותה (אותו באג שתוקן בגינון). */
            compressImage(f, function (dataUrl) {
              if (!dataUrl || photos.length >= PHOTO_MAX) return;
              var comma = dataUrl.indexOf(",");
              if (comma < 0) return;
              var mime = (dataUrl.substring(0, comma).match(/data:([^;]+)/) || [])[1] || f.type || "image/jpeg";
              var name = String(f.name || "screenshot");
              if (/jpeg/.test(mime)) name = name.replace(/\.[^.]+$/, "") + ".jpg";
              photos.push({ name: name, mime: mime, data: dataUrl.substring(comma + 1) });
              var th = document.createElement("span");
              th.className = "rep-th";
              th.style.backgroundImage = "url(" + dataUrl + ")";
              th.innerHTML = '<button type="button" class="th-x" aria-label="הסרת התמונה">✕</button>';
              th.querySelector(".th-x").addEventListener("click", function () {
                var i = Array.prototype.indexOf.call(photosEl.querySelectorAll(".rep-th"), th);
                if (i >= 0) photos.splice(i, 1);
                th.remove();
                photoBtn.hidden = false;
              });
              photosEl.appendChild(th);
              photoBtn.hidden = photos.length >= PHOTO_MAX;
            });
          });
          fileEl.value = "";
        });

        renumber();
      },
      onOk: function (wrap, close) {
        var errEl = wrap.querySelector(".rep-err");
        var items = Array.prototype.map.call(wrap.querySelectorAll(".rep-item textarea"), function (t) {
          return String(t.value || "").trim().substring(0, CHAR_MAX);
        }).filter(Boolean);

        if (!items.length) {
          errEl.textContent = isBug ? "צריך לכתוב מה קרה" : "צריך לכתוב מה ההצעה";
          errEl.hidden = false;
          var first = wrap.querySelector(".rep-item textarea");
          if (first) first.focus();
          return;
        }
        errEl.hidden = true;

        var okBtn = wrap.querySelector('[data-dlg="ok"]');
        /* ⚠️ busy ולא busyText: busy הוא זה שמחזיר את פונקציית השחרור.
           busyText רק מעדכן טקסט של כפתור שכבר עסוק ומחזיר undefined —
           וקריאה לו כאן הייתה זורקת TypeError בדיוק במסלול הכישלון. */
        var release = CBA.ui.busy ? CBA.ui.busy(okBtn, "שולח…") : function () {};

        /* ⚠️ ההקשר נלקח **מחדש** כאן ולא מ-ctx שנקרא בפתיחת החלונית: בין
           הפתיחה לשליחה המשתמש עוד כותב, ולפעמים בדיוק אז נזרקת השגיאה
           שהוא מנסה לתאר. שדות שחייבים להישאר מרגע הפתיחה — המסך והחלון
           שהיו פתוחים מתחת — נלקחים מ-ctx, כי החלונית שלנו כבר מכסה אותם. */
        var now = context();
        CBA.data.submitAppReport({
          kind: kind, items: items, photos: photos,
          screen: ctx.screen, ver: now.ver, srvVer: now.srvVer, ua: now.ua,
          perms: now.perms, year: now.year, net: now.net, dialog: ctx.dialog,
          errors: (now.errors || []).join("\n"),
          trail:  (now.trail  || []).join("\n"),
          extra:  (CBA.diag && CBA.diag.extraLine) ? CBA.diag.extraLine(now) : ""
        }, function (res) {
          if (!res || !res.ok) {
            release();
            errEl.textContent = (res && res.error) || "לא הצלחנו לשלוח את הדיווח. נסו שוב.";
            errEl.hidden = false;
            return;
          }
          close(true);
          CBA.ui.toast("תודה! הדיווח נשלח · מס' " + res.id, "ok");
        });
      }
    });
  }

  /* ====================== הכפתור הצף ====================== */
  var wrapEl = null;

  function build() {
    if (wrapEl) return wrapEl;
    wrapEl = document.createElement("div");
    wrapEl.className = "rep-fab-wrap";
    wrapEl.innerHTML =
      '<div class="rep-menu" hidden>' +
        '<button type="button" class="rep-menu__btn" data-rep="' + KIND_IDEA + '">' + ICO.bulb + ' הצעת ייעול לאפליקציה</button>' +
        '<button type="button" class="rep-menu__btn" data-rep="' + KIND_BUG  + '">' + ICO.bug  + ' דיווח על תקלה</button>' +
      '</div>' +
      '<button type="button" class="rep-fab" aria-label="דיווח על האפליקציה" title="דיווח על האפליקציה" aria-expanded="false">' +
        ICO.fab + '</button>';
    document.body.appendChild(wrapEl);

    var menu = wrapEl.querySelector(".rep-menu");
    var fab  = wrapEl.querySelector(".rep-fab");

    function setOpen(on) {
      menu.hidden = !on;
      wrapEl.classList.toggle("is-open", !!on);
      fab.setAttribute("aria-expanded", on ? "true" : "false");
    }
    /* נקודת הכניסה השנייה — האריח בתפריט המשתמש. בכוונה **אותו** תפריט
       ואותו קוד ולא חלונית בחירה שנייה: שתי דרכים לבחור בין אותם שני
       כפתורים היו נפרדות זו מזו בעדכון הראשון. וזו גם הסיבה שהיא קיימת
       כבר עכשיו — כשהכפתור הצף יוסר אחרי שהאפליקציה נקלטת, האריח נשאר
       הדרך היחידה, ואין מה להמציא באותו רגע. */
    wrapEl.__openMenu = function () { setOpen(true); };
    fab.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(menu.hidden);
    });
    menu.addEventListener("click", function (e) {
      var b = e.target.closest("[data-rep]");
      if (!b) return;
      setOpen(false);
      openForm(b.dataset.rep);
    });
    document.addEventListener("click", function (e) {
      if (!menu.hidden && !wrapEl.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !menu.hidden) setOpen(false);
    });
    return wrapEl;
  }

  /* mount/unmount — נקרא מ-app.js. אורח (לא מחובר) אינו רואה את הכפתור:
     השרת ממילא דוחה דיווח בלי מושב, וכפתור שכל לחיצה עליו נכשלת גרוע
     מכפתור שאינו קיים. */
  function mount(on) {
    if (on) { build(); wrapEl.hidden = false; }
    else if (wrapEl) { wrapEl.hidden = true; }
  }

  function openMenu() {
    build();
    wrapEl.hidden = false;
    if (wrapEl.__openMenu) wrapEl.__openMenu();
  }

  return { mount: mount, open: openForm, openMenu: openMenu,
           KIND_IDEA: KIND_IDEA, KIND_BUG: KIND_BUG };
})();
