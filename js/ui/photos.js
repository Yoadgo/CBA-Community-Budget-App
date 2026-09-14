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

  return { open: open };
})();
