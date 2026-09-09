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
    plus:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    bulb:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z"/></svg>',
    bug:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8.5a4 4 0 0 1 4 4v3a4 4 0 0 1-8 0v-3a4 4 0 0 1 4-4z"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0"/><path d="M4 12h4M16 12h4M4.8 7.5l2.6 1.6M19.2 7.5l-2.6 1.6M4.8 17.5l2.7-1.6M19.2 17.5l-2.7-1.6"/></svg>',
    photo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="14" rx="2.5"/><circle cx="12" cy="13" r="3.2"/><path d="M8.5 6l1.2-2h4.6L15.5 6"/></svg>'
  };

  /* --- גרסת הלקוח: נקראת מתגית ה-<script> עצמה ולא נכתבת כאן פעם שנייה.
     קבוע כפול היה נשאר מאחור בדיוק בגרסה שבה מישהו מדווח על באג. --- */
  function clientVersion() {
    try {
      var s = document.querySelector('script[src*="js/app.js"]');
      var m = s && String(s.src).match(/[?&]v=([^&"]+)/);
      return m ? m[1] : "";
    } catch (e) { return ""; }
  }

  function context() {
    var ua = "";
    try {
      var u = navigator.userAgent || "";
      var name = /CriOS|Chrome/.test(u) ? "Chrome" : /Firefox/.test(u) ? "Firefox"
               : /Edg/.test(u) ? "Edge" : /Safari/.test(u) ? "Safari" : "אחר";
      var os = /iPhone|iPad|iPod/.test(u) ? "iOS" : /Android/.test(u) ? "Android"
             : /Macintosh/.test(u) ? "Mac" : /Windows/.test(u) ? "Windows" : "";
      var standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
      ua = [name, os, (window.innerWidth + "×" + window.innerHeight), standalone ? "מותקנת" : "דפדפן"]
           .filter(Boolean).join(" · ");
    } catch (e) {}
    var key = (document.body && document.body.dataset.screen) || "";
    var label = (CBA.screenLabel && key) ? CBA.screenLabel(key) : key;
    return {
      /* מה שנרשם בגיליון: השם שהמשתמש רואה **ובסוגריים** המפתח הפנימי.
         השם לבדו לא מאפשר לאתר את הקוד; המפתח לבדו לא אומר כלום לקורא. */
      screen: key ? (label === key ? key : label + " (" + key + ")") : "",
      screenLabel: label,
      ver: clientVersion(),
      srvVer: (CBA.mock && CBA.mock._serverVersion) || "",
      ua: ua
    };
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
          'נשלח אוטומטית יחד עם הדיווח: ' +
          esc([ctx.screenLabel ? 'מסך "' + ctx.screenLabel + '"' : "", ctx.ver, ctx.ua].filter(Boolean).join(" · ")) +
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
              th.innerHTML = '<x aria-hidden="true">✕</x>';
              th.querySelector("x").addEventListener("click", function () {
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

        CBA.data.submitAppReport({
          kind: kind, items: items, photos: photos,
          screen: ctx.screen, ver: ctx.ver, srvVer: ctx.srvVer, ua: ctx.ua
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
        ICO.plus + '</button>';
    document.body.appendChild(wrapEl);

    var menu = wrapEl.querySelector(".rep-menu");
    var fab  = wrapEl.querySelector(".rep-fab");

    function setOpen(on) {
      menu.hidden = !on;
      wrapEl.classList.toggle("is-open", !!on);
      fab.setAttribute("aria-expanded", on ? "true" : "false");
    }
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

  return { mount: mount, open: openForm, KIND_IDEA: KIND_IDEA, KIND_BUG: KIND_BUG };
})();
