/* ============================================================================
 *  photos.js — מציג תמונות דיווח (PHASE 4.2, 2026-09-14)
 * ----------------------------------------------------------------------------
 *  התמונות של דיווחי הגינון נשמרות ב-Drive **פרטיות**, ולכן אי אפשר לשים
 *  את המזהה ב-src של <img>. השרת מגיש אותן אחרי בדיקת הרשאה
 *  (action=gardenPhoto), ואנחנו בונים מהן data: URL בדפדפן.
 *
 *  מודול אחד ולא שניים: גם התושב ("הדיווחים שלי") וגם צוות הגינון (מסך
 *  המשימות) פותחים בדיוק את אותה חלונית. שני מימושים היו סוטים זה מזה
 *  בעדכון הראשון — וזו בדיוק המלכודת שמסך מצבי-הריק שלנו כבר נפל בה.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.photos = (function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  /* מטמון לכל אורך המושב. תמונה היא בייטים שלא משתנים אחרי שצולמה, ובלי
     מטמון כל פתיחה חוזרת של אותו דיווח הייתה מושכת אותה מחדש — כמה שניות
     בכל פעם, על אותם בייטים בדיוק. */
  var cache = {};

  /* ------------------------------------------------------------------------
   *  כיווץ תמונה לפני העלאה   (2026-09-22)
   * ------------------------------------------------------------------------
   *  ישב עד היום ב-resGarden.js בלבד, ולכן היה זמין רק לתושב. מרגע שגם
   *  המנהל יכול לצרף תמונה למשימה שהוא פותח, שני מסכים צריכים אותו —
   *  ומימוש שני היה סוטה מהראשון בעדכון הראשון. אותו כלל בדיוק שבגללו
   *  `open` יושב כאן ולא פעמיים.
   *  הקטנה לצלע ארוכה MAX_EDGE ודחיסת JPEG: תמונה של 4MB יורדת לרבע MB.
   *  ⚠️ אם הכיווץ לא הרוויח כלום (תמונה קטנה, PNG שקוף) חוזרים לקובץ
   *     המקורי — עדיף מקור מאשר "כיווץ" שהגדיל.
   * --------------------------------------------------------------------- */
  var MAX_EDGE = 1600;
  var JPEG_Q   = 0.72;

  function readAsDataURL(file, cb) {
    var rd = new FileReader();
    rd.onload  = function () { cb(String(rd.result)); };
    rd.onerror = function () { cb(null); };
    rd.readAsDataURL(file);
  }

  function compress(file, cb) {
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
        cv.width  = Math.max(1, Math.round(w * scale));
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

  /* קובץ -> האובייקט שהשרת מצפה לו: {name, mime, data(base64 בלי הקידומת)}.
     מחזיר null כשהקריאה נכשלה — הקורא פשוט מדלג על הקובץ הזה. */
  function toUpload(file, cb) {
    compress(file, function (dataUrl) {
      if (!dataUrl) return cb(null);
      var comma = dataUrl.indexOf(",");
      if (comma < 0) return cb(null);
      var mime = (dataUrl.substring(0, comma).match(/data:([^;]+)/) || [])[1] ||
                 file.type || "image/jpeg";
      var name = String(file.name || "photo");
      if (/jpeg/.test(mime)) name = name.replace(/\.[^.]+$/, "") + ".jpg";
      cb({ name: name, mime: mime, data: dataUrl.substring(comma + 1) }, dataUrl);
    });
  }

  function fetchOne(id, cb) {
    if (cache[id]) return cb(cache[id]);
    CBA.data.getGardenPhoto(id, function (res) {
      if (res && res.ok && res.url) cache[id] = res;
      cb(res);
    });
  }

  /* open(ids, title) — חלונית עם כל התמונות של דיווח אחד.
     הטעינה היא לפי תמונה: הראשונה מופיעה בלי לחכות לאחרונה. */
  function open(ids, title) {
    ids = (ids || []).filter(Boolean);
    if (!ids.length) return;

    var html = '<div class="ph-wrap">' + ids.map(function (id, i) {
      return '<div class="ph-slot" data-ph="' + esc(id) + '">' +
               '<div class="ph-load">טוען תמונה ' + (i + 1) + ' מתוך ' + ids.length + '…</div>' +
             '</div>';
    }).join("") + '</div>';

    CBA.ui.dialog({
      title: title || (ids.length === 1 ? "התמונה שצורפה" : ids.length + " תמונות שצורפו"),
      html: html,
      wide: true,
      okText: "סגירה",
      onMount: function (wrap) {
        ids.forEach(function (id) {
          var slot = wrap.querySelector('[data-ph="' + id + '"]');
          if (!slot) return;
          fetchOne(id, function (res) {
            if (!slot.isConnected) return;   // נסגר בזמן הטעינה
            if (res && res.ok && res.url) {
              slot.innerHTML = '<img class="ph-img" src="' + res.url + '" alt="תמונה מהדיווח">';
            } else {
              slot.innerHTML = '<div class="ph-err">' +
                esc((res && res.error) || "לא הצלחנו לטעון את התמונה") + '</div>';
            }
          });
        });
      }
    });
  }

  /* ==========================================================================
   *  picker — בורר תמונות קטן לשימוש חוזר   (2026-09-23, בקשת יועד)
   * --------------------------------------------------------------------------
   *  אותו מנגנון בדיוק כמו בטופס הדיווח (gardenForm.js): כיווץ בדפדפן
   *  (toUpload), תצוגה מקדימה מקומית, והעלאה רק אחרי השמירה — ברקע.
   *  נולד בשביל סגירת תקלה ו"הערה/דיווח" של הצוות, עד שתי תמונות.
   *  משתמש בעיצוב הקיים gd-thumbs / gd-th — אין CSS חדש.
   *
   *  picker(host, max) → { items() }   items = [{name, mime, data}]
   * ========================================================================== */
  function picker(host, max) {
    max = max || 2;
    var items = [];
    host.innerHTML =
      '<label class="gd-lbl" style="margin-top:12px">תמונות ' +
        '<em><span data-pk="n">0</span> / ' + max + ' · לא חובה</em></label>' +
      '<div class="gd-thumbs" data-pk="thumbs">' +
        '<button type="button" class="gd-th add" data-pk="add" aria-label="הוספת תמונה">+</button>' +
      '</div>' +
      '<input type="file" data-pk="file" accept="image/*" multiple hidden>';
    var fileEl = host.querySelector('[data-pk="file"]');
    var thumbs = host.querySelector('[data-pk="thumbs"]');
    var addBtn = host.querySelector('[data-pk="add"]');
    function sync() {
      host.querySelector('[data-pk="n"]').textContent = items.length;
      addBtn.style.display = items.length >= max ? "none" : "grid";
    }
    addBtn.addEventListener("click", function () { fileEl.click(); });
    fileEl.addEventListener("change", function () {
      Array.prototype.slice.call(fileEl.files || []).forEach(function (f) {
        if (items.length >= max) return;
        /* הכיווץ אסינכרוני — המכסה נבדקת שוב בתוך ה-callback. */
        toUpload(f, function (item, dataUrl) {
          if (!item || items.length >= max) return;
          items.push(item);
          var el = document.createElement("span");
          el.className = "gd-th";
          el.style.backgroundImage = "url(" + dataUrl + ")";
          el.innerHTML = '<button type="button" class="th-x" aria-label="הסרת התמונה">✕</button>';
          el.querySelector(".th-x").addEventListener("click", function () {
            var k = items.indexOf(item);
            if (k !== -1) items.splice(k, 1);
            el.remove();
            sync();
          });
          thumbs.insertBefore(el, addBtn);
          sync();
        });
      });
      fileEl.value = "";
    });
    sync();
    return { items: function () { return items.slice(); } };
  }

  return { open: open, compress: compress, toUpload: toUpload, picker: picker };
})();
