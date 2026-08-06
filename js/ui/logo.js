/* logo.js — לוגו האפליקציה: שלושה "עמודים" מדורגים בגובה, עגולים בקצה.
   הסימן קורא כפול-משמעות במתכוון — גם גרף תקציב עולה, וגם קו-רקיע של מבני קהילה.
   בסגנון מינימליסטי, גיאומטרי, מלא (לא קווי) — קרוב יותר לאייקוני מערכת של Apple.
   קובץ עצמאי — לא תלוי בשאר האפליקציה.
   שימוש: CBA.logoSVG(size) מחזיר מחרוזת SVG; הצבע נקבע ע"י color של האלמנט העוטף (currentColor). */
window.CBA = window.CBA || {};

CBA.logoSVG = function (size) {
  size = size || 24;
  return '' +
    '<svg width="' + size + '" height="' + size + '" viewBox="0 0 48 48" fill="none" ' +
      'xmlns="http://www.w3.org/2000/svg" style="display:block" aria-hidden="true">' +
      '<rect x="9"    y="21" width="7" height="13" rx="3.5" fill="currentColor"/>' +
      '<rect x="20.5" y="12" width="7" height="22" rx="3.5" fill="currentColor"/>' +
      '<rect x="32"   y="17" width="7" height="17" rx="3.5" fill="currentColor"/>' +
    '</svg>';
};
