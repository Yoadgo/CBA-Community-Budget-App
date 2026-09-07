/* resident.js — אזור התושב (פורטל).
   שלושה מסכים: "הבקשות שלי", "הגשת קבלה", "שריון מועדון".
   נגזר מעיצוב האפליקציה. הנתונים האמיתיים (סינון לפי אימייל) + הצנרת יתווספו בשלבים 3-5.
   קורא את המשתמש המחובר מ-window.CBA.user (מוגדר ע"י app.js). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";

  function user() { return (window.CBA && CBA.user) || {}; }
  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var plusIcon   = svg('<path d="M12 5v14M5 12h14"/>');
  var cameraIcon = svg('<path d="M9 4h6l1 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3z"/><circle cx="12" cy="13" r="3.2"/>');
  var sendIcon   = svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>');
  var inboxIcon  = svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>');
  var checkIcon  = svg('<path d="M20 6L9 17l-5-5"/>');
  var docIcon    = svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>');
  var xIcon      = svg('<path d="M18 6L6 18M6 6l12 12"/>');
  var scanIcon   = svg('<path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="2.5"/>');
  var clockIcon  = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>');
  var chevLeftIcon  = svg('<path d="M15 6l-6 6 6 6"/>');
  var chevDownIcon  = svg('<path d="M6 9l6 6 6-6"/>');
  var chevRightIcon = svg('<path d="M9 6l6 6-6 6"/>');
  var calCheckIcon  = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/><path d="M8.5 14.5l2 2 4.5-4.5"/>');
  var calGridIcon   = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>');
  var kidsIcon   = svg('<circle cx="12" cy="7" r="3"/><path d="M6 21v-2a6 6 0 0 1 12 0v2"/>');
  var roleIcon   = svg('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'); // חיווי "תפקיד בוועד" — סעיף 5
  var phoneIcon  = svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .36 1.98.68 2.92a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.16-1.16a2 2 0 0 1 2.11-.45c.94.32 1.92.55 2.92.68A2 2 0 0 1 22 16.92z"/>');
  var minusIcon  = svg('<path d="M5 12h14"/>');
  var searchIcon = svg('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>');
  var fitIcon    = svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/>');
  var parkIcon   = svg('<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M9 16V8h4a3 3 0 0 1 0 6H9"/>');
  var pinIcon    = svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>');
  /* סמלילי המרחבים המשותפים — סט ייעודי, סמל אחד לכל מרחב אמיתי בשיכון.
     נבדקו ב-15px (הגודל במפה) ולא רק בגודל מלא. */
  var amenIcons = {
    pool:   '<path d="M3 9.5q3-3 6 0t6 0 6 0"/><path d="M3 15.5q3-3 6 0t6 0 6 0"/>',
    gym:    '<path d="M4 9.5v5M7.5 7v10M7.5 12h9M16.5 7v10M20 9.5v5"/>',
    hall:   '<path d="M2.6 20.5V12.4C2.6 8 6.8 4.6 12 4.6s9.4 3.4 9.4 7.8v8.1z"/><path d="M9 20.5v-5.2h6v5.2"/>',
    ball:   '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4l3.8 2.8-1.5 4.5H9.7L8.2 10.2z" fill="currentColor" stroke="none"/><path d="M12 3.4v4M19.6 9.9l-3.8 2.8M16.7 20.2l-1.5-4.5M7.3 20.2l1.5-4.5M4.4 9.9l3.8 2.8"/>',
    hoop:   '<path d="M3.5 3.5h17v9.5h-17z"/><path d="M8.8 13v2.4c0 2 1.4 3.6 3.2 3.6s3.2-1.6 3.2-3.6V13"/>',
    tennis: '<ellipse cx="10.2" cy="9" rx="5.4" ry="6.2"/><path d="M10.2 15.2L6.8 21"/><circle cx="18.6" cy="16.8" r="2.3"/>',
    flag:   '<path d="M6 21V3"/><path d="M6 4.6h11.5l-2.4 3.4 2.4 3.4H6z"/>',
    slide:  '<path d="M3.5 20h4.5l7-11h5"/><path d="M15 9h5v11"/><path d="M8 20v-4.5"/>',
    blocks: '<rect x="3.2" y="12.6" width="7.6" height="7.6" rx="1.2"/><rect x="13.2" y="12.6" width="7.6" height="7.6" rx="1.2"/><rect x="8.2" y="3.8" width="7.6" height="7.6" rx="1.2"/>',
    kite:   '<path d="M12 2.6l5.6 6-5.6 9.6-5.6-9.6z"/><path d="M6.4 8.6h11.2"/><path d="M12 18.2c-1.3 1-.4 2.2.9 2.6"/>',
    brush:  '<path d="M3.2 20.8c2.6.4 5-1.1 5-3.6 0-1.4-1.1-2.5-2.5-2.5s-2.5 1.1-2.5 2.5z"/><path d="M8.6 16.2L19.4 5.4a2.2 2.2 0 0 0-3.1-3.1L5.5 13.1"/>',
    cart:   '<circle cx="9.5" cy="19.8" r="1.7"/><circle cx="17.5" cy="19.8" r="1.7"/><path d="M2.5 3.5h2.7l2.6 11.6h10.9l2-8.4H6.6"/>',
    dine:   '<path d="M5.5 3v6.2a2.4 2.4 0 0 0 4.8 0V3M7.9 11.6V21"/><path d="M17.6 3c-1.8 0-3.2 2.4-3.2 5.4s1.4 4.4 3.2 4.4V21"/>',
    laptop: '<rect x="5.2" y="6" width="13.6" height="9" rx="1.2"/><path d="M2.8 18.6h18.4l-2-3.6H4.8z"/>',
    mail:   '<rect x="3" y="5.5" width="18" height="13" rx="1.6"/><path d="M3.4 6.6L12 13.4l8.6-6.8"/>',
    people: '<circle cx="9" cy="8" r="2.8"/><circle cx="16.2" cy="8.6" r="2.3"/><path d="M3.8 19.8c0-3.1 2.3-5.6 5.2-5.6s5.2 2.5 5.2 5.6"/><path d="M16.2 14.6c2.4 0 4.2 2.2 4.2 5.2"/>',
    grass:  '<path d="M20.2 3.8C10.6 3.8 4.4 9.4 4.4 18.6c0 .8 0 1.2.2 1.6 9.6 0 15.6-6 15.6-15.4 0-.4 0-.7 0-1z"/><path d="M4.6 20.2L13.4 11"/>',
    paw:    '<circle cx="8.2" cy="7.4" r="2"/><circle cx="15.8" cy="7.4" r="2"/><circle cx="4.6" cy="12.6" r="1.8"/><circle cx="19.4" cy="12.6" r="1.8"/><path d="M12 11.4c3 0 5.2 2.4 5.2 4.8s-2.2 3.8-5.2 3.8-5.2-1.4-5.2-3.8 2.2-4.8 5.2-4.8z"/>',
    house:  '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v8.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V10"/><path d="M9.5 19.5v-5.2h5v5.2"/>'
  };

  // סמל בית קטן שמוצג מעל מספר הבית בתגית המפה (טאב "מפת השיכון"), במקום רק ספרות יבשות
  var houseIcon = svg(amenIcons.house);

  /* ==== המרת קובץ קבלה ל-Base64 לפני שליחה לשרת ====
     תמונה: מכווצים/מקטינים בצד הלקוח (canvas) כדי שההעלאה תהיה מהירה גם ברשת סלולרית חלשה.
     PDF: נשלח כמו שהוא — אי אפשר לכווץ PDF בפשטות בדפדפן. */
  var MAX_DIM = 1600, JPEG_Q = 0.75, MAX_RAW_BYTES = 15 * 1024 * 1024;

  function compressImage(file, done) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        var cw = Math.max(1, Math.round(img.width * scale));
        var ch = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement("canvas");
        canvas.width = cw; canvas.height = ch;
        canvas.getContext("2d").drawImage(img, 0, 0, cw, ch);
        var dataUrl;
        try { dataUrl = canvas.toDataURL("image/jpeg", JPEG_Q); }
        catch (err) { done(new Error("שגיאה בעיבוד התמונה")); return; }
        done(null, {
          dataBase64: dataUrl.split(",")[1], mimeType: "image/jpeg",
          fileName: (file.name || "receipt").replace(/\.[^.]+$/, "") + ".jpg",
          previewUrl: dataUrl
        });
      };
      img.onerror = function () { done(new Error("קובץ תמונה לא תקין")); };
      img.src = e.target.result;
    };
    reader.onerror = function () { done(new Error("שגיאה בקריאת הקובץ")); };
    reader.readAsDataURL(file);
  }

  function readFileAsBase64(file, done) {
    var reader = new FileReader();
    reader.onload = function (e) {
      var dataUrl = e.target.result;
      done(null, {
        dataBase64: dataUrl.split(",")[1],
        mimeType: file.type || "application/octet-stream",
        fileName: file.name || "receipt",
        previewUrl: null
      });
    };
    reader.onerror = function () { done(new Error("שגיאה בקריאת הקובץ")); };
    reader.readAsDataURL(file);
  }

  function fmtBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return Math.round(n / 1024) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  // שם מלא לתצוגה/לזיהוי הוצאה: "<שם פרטי> <שם משפחה>" אם יש שם פרטי בטאב התושבים
  // (עמודת "שם פרטי" ליד עמודת האימייל, 2026-08-05), אחרת נופל חזרה לשם המשפחה בלבד
  // (התנהגות קודמת — לתושבים שעדיין אין להם שם פרטי רשום).
  function fullName(u) {
    var fam = (u.family || u.name || "").trim();
    var first = (u.firstName || "").trim();
    return first ? (first + " " + fam) : fam;
  }

  /* ==== "הבקשות שלי" ==== */
  // כל התנועות המקושרות למשפחה המחוברת (2026-08-06: לפי מזהה משפחה = מספר הבית,
  // לא ניחוש טקסטואלי לפי שם). זה מציג לא רק בקשות שהתושב עצמו הגיש דרך האפליקציה,
  // אלא גם שורות שהוזנו ע"י מנהל ומקושרות למשפחה הזו (למשל תשלום לספק שהם טיפלו בו).
  // שורות ישנות/לא-משויכות (בלי מזהה משפחה) פשוט לא יופיעו כאן עד שישויכו — במכוון,
  // כדי לא להראות לתושב משהו שלא בטוח שקשור אליו.
  function myRequests() {
    var famId = String(user().familyId || user().house || "").trim();
    if (!famId) return [];
    return CBA.data.getTransactions()
      .filter(function (t) { return String(t.familyId || "").trim() === famId; })
      .sort(function (a, b) {
        if ((a.date || "") !== (b.date || "")) return (a.date || "") < (b.date || "") ? 1 : -1;
        return (b.id || 0) - (a.id || 0);
      });
  }

  /* כל הבקשות של המשפחה **מכל שנות התקציב** (2026-09-07).
     למה: אזור התושב מסתיר את בורר השנים (resident.css שורה 14), ולכן תושב
     רואה אך ורק את השנה הפעילה. ברגע שמחליפים "שנה נוכחית" בגיליון — כל
     ההיסטוריה שלו נעלמת לו מהמסך, כולל החזרים ששולמו. הנתונים כבר קיימים
     בזיכרון (doGet מחזיר את כל השנים), אז זו קריאה בלבד בלי פנייה לשרת.

     myRequests() לעיל נשארת פר-שנה **במכוון**: היא מזינה את המונים
     "ממתינות/אושרו/שולמו השנה" כאן ובמסך הבית, ושינוי שלה היה הופך את
     "שולמו השנה" ל"שולמו אי פעם" בלי שאיש ישים לב. */
  function myRequestsAllYears() {
    var famId = String(user().familyId || user().house || "").trim();
    if (!famId) return [];
    if (!(window.CBA && CBA.data && CBA.data.getAllTransactions)) return [];
    return CBA.data.getAllTransactions()
      .filter(function (t) { return String(t.familyId || "").trim() === famId; })
      .sort(function (a, b) {
        if ((a.date || "") !== (b.date || "")) return (a.date || "") < (b.date || "") ? 1 : -1;
        return (b.id || 0) - (a.id || 0);
      });
  }

  // מפצל את הבקשות של המשפחה לשתי קבוצות: החזר כספי בפועל לדייר (payType=refund)
  // מול כל השאר (תשלום לספק/הוצאה כללית) שהמשפחה רק טיפלה בהם/הייתה איש הקשר —
  // כדי שלא ייראה כאילו כל מה שמופיע כאן זה כסף שמגיע לתושב (יועד, 2026-08-06).
  function splitRequests(list) {
    var refunds = [], handled = [];
    list.forEach(function (t) {
      (t.payType === "refund" ? refunds : handled).push(t);
    });
    return { refunds: refunds, handled: handled };
  }

  var STATUS_PILL = {
    submitted: { cls: "warn", ico: clockIcon },
    ready:     { cls: "blue", ico: clockIcon },
    paid:      { cls: "ok",   ico: checkIcon },
    rejected:  { cls: "gray", ico: xIcon }
  };

  /* נדלק כשכרטיס הסיכום מוצג במסך. אז אין טעם לחזור על אותו מועד החזר
     בכל כרטיס בנפרד — הסיכום כבר אמר אותו פעם אחת, בגדול. נשאר מוצג
     בבקשות שעדיין בבדיקה, כי הן *לא* נכללות בסיכום. */
  var refundSummaryShown = false;

  function reqCardHTML(t) {
    var s = CBA.data.statusMeta(t.status);
    var pill = STATUS_PILL[t.status] || STATUS_PILL.submitted;
    var title = t.supplier || t.buyer || "בקשה";
    var typeLabel = CBA.data.expenseTypeLabel(CBA.data.expenseTypeOf(t));
    // מועד החזר צפוי (סעיף 7, 2026-08-06) — רק לבקשות החזר שעדיין ממתינות (לא
    // שולם/נדחה כבר, שם המועד הצפוי כבר לא רלוונטי). ר' CBA.data.expectedRefundDate.
    var pending = t.status !== "paid" && t.status !== "rejected";
    var coveredBySummary = refundSummaryShown && t.status === "ready";
    var refundLabel = (pending && !coveredBySummary) ? CBA.data.expectedRefundDateLabel(t) : "";
    return (
      '<div class="card rq">' +
        '<div class="rq__top">' +
          '<div><div class="rq__sup">' + CBA.esc(title) + '</div>' +
            '<div class="rq__desc">' + CBA.esc(typeLabel) + (t.description ? " · " + CBA.esc(t.description) : "") + '</div></div>' +
          '<span class="rs-pill rs-pill--' + pill.cls + '">' + pill.ico + CBA.esc(s.label) + '</span>' +
        '</div>' +
        '<div class="rq__amt">' + CBA.formatILS(t.amount || 0) + '</div>' +
        (refundLabel ? '<div class="rq__refund">💰 מועד החזר צפוי: ' + CBA.esc(refundLabel) + '</div>' : '') +
        '<div class="rq__foot">' +
          '<span class="rq__date">' + CBA.esc(CBA.data.hebrewDate(t.date || "")) +
            (t.month ? ' · הוגש בחודש ' + CBA.esc(CBA.data.hebrewMonth(t.month)) : '') + '</span>' +
          (t.receiptUrl
            ? '<button type="button" class="rs-ghost" data-peek-url="' + CBA.esc(t.receiptUrl) + '" data-peek-title="' + CBA.esc(t.supplier || "קבלה") + '">' + docIcon + ' הצג קבלה</button>'
            : '') +
        '</div>' +
      '</div>'
    );
  }

  /* ==== כרטיס "מכון כושר" בתוך "הבקשות שלי" (2026-08-19) ====
     נוסף אחרי שיועד הגיש בקשה אמיתית ואז חיפש אותה כאן — וזה הגיוני: "הבקשות
     שלי" הוא המקום שבו תושב מצפה למצוא כל בקשה ששלח, לא רק החזרים. המסך
     המלא של המכון נשאר במקומו; זה קיצור-דרך שמראה סטטוס ומוביל אליו.

     המצב נשמר במשתנה מודול כדי שהכרטיס יופיע מיד בציור הבא (render נקרא גם
     ברענון רקע), ומתרענן ברקע בלי להבהב. */
  var gymSnap = null;

  var GYM_TONE = {
    "פעיל": "ok", "פג תוקף": "muted", "מוקפא": "muted",
    "ממתין לאישור רופא": "danger", "נדחה": "danger", "בוטל": "danger"
  };
  var GYM_NEXT = {
    "ממתין להצהרה": "נשאר למלא הצהרת בריאות וחתימה.",
    "ממתין לאישור רופא": "נדרשת תעודה רפואית מרופא.",
    "ממתין לאישור": "הבקשה ממתינה לאישור מנהל/ת המכון.",
    "ממתין לתשלום": "נשאר להסדיר את התשלום.",
    "ממתין לאימות": "התשלום דווח וממתין לאימות הוועד.",
    "פעיל": "המנוי בתוקף. קוד הכניסה מחכה במסך המכון.",
    "פג תוקף": "המנוי הסתיים — אפשר לחדש."
  };

  // התאריכים מ-gymMy מגיעים כ-yyyy-MM-dd; מציגים אותם בפורמט הישראלי
  function gymFmtDate(v) {
    var p = String(v == null ? "" : v).trim().split("-");
    return p.length === 3 ? (p[2] + "." + p[1] + "." + p[0]) : String(v == null ? "" : v);
  }

  function gymCardHTML() {
    if (!gymSnap || !gymSnap.membership) return "";
    var m = gymSnap.membership;
    var status = String(m["סטטוס"] || "").trim();
    if (!status) return "";
    var tone = GYM_TONE[status] || "warn";
    return '<div class="rq-section-title">מכון כושר</div>' +
           '<div class="rq-list"><button type="button" class="gym-mini" data-goto-gym>' +
             '<div class="gym-mini__main">' +
               '<div class="gym-mini__title">בקשת מנוי ' + CBA.esc(m["מזהה"] || "") + '</div>' +
               '<div class="gym-mini__sub">' + CBA.esc(GYM_NEXT[status] || "") + '</div>' +
               (m["בתוקף עד"] ? '<div class="gym-mini__sub">בתוקף עד ' + CBA.esc(gymFmtDate(m["בתוקף עד"])) + '</div>' : "") +
             '</div>' +
             '<span class="gym-pill gym-pill--' + tone + '">' + CBA.esc(status) + '</span>' +
           '</button></div>';
  }

  /* מרענן את הכרטיס במקום, בלי לצייר מחדש את כל המסך — כך שגלילה ומיקוד
     נשמרים, וגם אין הבהוב אם התשובה זהה למה שכבר מוצג. */
  function refreshGymCard(container) {
    if (!(CBA.data && CBA.data.getGymMy)) return;
    CBA.data.getGymMy(function (res) {
      if (!res || !res.ok) return;
      var before = gymCardHTML();
      gymSnap = res;
      var after = gymCardHTML();
      if (before === after) return;
      var slot = container.querySelector("#rq-gym");
      if (!slot) return;
      slot.innerHTML = after;
      bindGymCard(slot);
    });
  }

  function bindGymCard(root) {
    var btn = root.querySelector("[data-goto-gym]");
    if (btn) btn.addEventListener("click", function () { CBA.navigate("resGym"); });
  }

  /* ==== סיכום ההחזרים שבדרך (2026-09-07) ====
     למה זה קיים: התושב מקבל בחשבון הבנק **העברה אחת מרוכזת** ולא העברה לכל
     קבלה. בלי הכרטיס הזה הוא צריך לשבת ולחבר בעצמו את הקבלות כדי להבין מה
     ההפקדה שראה. הכרטיס מראה את הסכום שיגיע, מתי, ומה מרכיב אותו.

     נספרות **רק** בקשות בסטטוס ready ("הועבר להנה"ח") — כסף שכבר בדרך.
     בקשות שעדיין בבדיקה מוזכרות בשורה נפרדת ובמפורש אינן נכללות בסכום,
     כדי שלא נבטיח כסף שטרם אושר.

     המועד כאן הוא עדיין **הערכה מחושבת** (ר' CBA.data.expectedRefundDate),
     ולכן הניסוח "צפוי". כשמודול השוואת החיובים ייכנס ויגיע תאריך אמיתי
     מהבסיס — אותו כרטיס יאמר "ייכנס ב-" בלי "צפוי", וההבדל בין הערכה
     לעובדה יישאר גלוי לתושב במקום להיטשטש.

     קיבוץ לפי מועד ולא סכום אחד גדול: אם בקשה פספסה סבב, המועד שלה שונה,
     ואיחוד היה מציג לתושב תאריך שגוי לחלק מהכסף. */
  function refundSummaryHTML(refunds) {
    var groups = {}, order = [], inReview = 0;
    refunds.forEach(function (t) {
      if (t.status === "ready") {
        var iso = CBA.data.expectedRefundDate(t);
        if (!iso) return;
        if (!groups[iso]) { groups[iso] = []; order.push(iso); }
        groups[iso].push(t);
      } else if (t.status === "submitted" || t.status === "review") {
        inReview++;
      }
    });
    if (!order.length) return "";
    order.sort();
    return order.map(function (iso, gi) {
      var list = groups[iso];
      var total = list.reduce(function (sum, t) { return sum + (Number(t.amount) || 0); }, 0);
      var rows = list.map(function (t) {
        return '<div class="rq-sum__row">' +
                 '<span class="rq-sum__row-n">' + CBA.esc(t.supplier || t.buyer || "בקשה") + '</span>' +
                 '<span class="rq-sum__row-a">' + CBA.formatILS(t.amount || 0) + '</span>' +
               '</div>';
      }).join("");
      return '<div class="rq-sum">' +
          '<div class="rq-sum__label">צפוי לתשלום</div>' +
          '<div class="rq-sum__amt">' + CBA.formatILS(total) + '</div>' +
          '<div class="rq-sum__when">' + list.length + (list.length === 1 ? " החזר" : " החזרים") +
            " · אמור להיכנס ב־" + CBA.esc(CBA.data.hebrewDate(iso)) + ", בהעברה אחת</div>" +
          ((gi === 0 && inReview)
            ? '<div class="rq-sum__note">ועוד ' + inReview +
              (inReview === 1 ? " בקשה שעדיין בבדיקה" : " בקשות שעדיין בבדיקה") +
              " — לא נכללות בסכום.</div>"
            : "") +
          '<button type="button" class="rq-sum__toggle" aria-expanded="false">' +
            '<span class="rq-sum__toggle-t">הצג פירוט</span>' + chevDownIcon +
          '</button>' +
          '<div class="rq-sum__detail">' + rows + '</div>' +
        '</div>';
    }).join("");
  }

  /* ==== היסטוריה משנים קודמות (2026-09-07) ====
     מקופלת כברירת מחדל. קיימת כדי שהחלפת "שנה נוכחית" בגיליון לא תמחק
     לתושב את העבר מהמסך — ר' ההערה ב-myRequestsAllYears.
     כשאין שנים קודמות (המצב היום) מוחזרת מחרוזת ריקה ושום דבר במסך
     לא משתנה. */
  function pastYearsHTML(all, curYear) {
    var past = all.filter(function (t) { return String(t.year || "") !== String(curYear); });
    if (!past.length) return "";
    var byYear = {}, years = [];
    past.forEach(function (t) {
      var y = String(t.year || "—");
      if (!byYear[y]) { byYear[y] = []; years.push(y); }
      byYear[y].push(t);
    });
    var body = years.map(function (y) {
      return '<div class="rq-past__y">' + CBA.esc(y) + '</div>' +
             '<div class="rq-list">' + byYear[y].map(reqCardHTML).join("") + '</div>';
    }).join("");
    return '<div class="rq-past">' +
        '<button type="button" class="rq-past__toggle" aria-expanded="false">' +
          '<span class="rq-past__toggle-t">הצג היסטוריה משנים קודמות (' + past.length + ')</span>' +
          chevDownIcon +
        '</button>' +
        '<div class="rq-past__body">' + body + '</div>' +
      '</div>';
  }

  /* מחבר את שני הכפתורים המתקפלים שנוספו כאן. אותה מוסכמה כמו .svc-acc
     במסך השירותים: מחלקת is-open על המכל, והחץ מסתובב ב-CSS. */
  function bindCollapsibles(container) {
    Array.prototype.forEach.call(container.querySelectorAll(".rq-sum__toggle"), function (btn) {
      btn.addEventListener("click", function () {
        var card = btn.parentNode;
        var open = card.classList.toggle("is-open");
        btn.setAttribute("aria-expanded", open ? "true" : "false");
        var t = btn.querySelector(".rq-sum__toggle-t");
        if (t) t.textContent = open ? "הסתר פירוט" : "הצג פירוט";
      });
    });
    var pastBtn = container.querySelector(".rq-past__toggle");
    if (pastBtn) {
      pastBtn.addEventListener("click", function () {
        var box = pastBtn.parentNode;
        var open = box.classList.toggle("is-open");
        pastBtn.setAttribute("aria-expanded", open ? "true" : "false");
        var t = pastBtn.querySelector(".rq-past__toggle-t");
        // הטקסט הסגור נושא את מספר הבקשות, אז שומרים אותו כמו שהוא ולא
        // מרכיבים אותו מחדש — אחרת הספירה נעלמת אחרי פתיחה וסגירה.
        if (t) {
          if (!t.dataset.closedLabel) t.dataset.closedLabel = t.textContent;
          t.textContent = open ? "הסתר היסטוריה" : t.dataset.closedLabel;
        }
      });
    }
  }

  CBA.screens.resRequests = {
    render: function (container) {
      // שימור מיקום גלילה (אותו פתרון כמו expenses.js/residents.js/clubAdmin.js) —
      // render() כאן נקרא מחדש גם ברענון רקע שקט, וה-innerHTML החדש היה מאפס גלילה.
      var rqWinScrollY = window.scrollY || 0;
      // מאפסים בכל ציור מחדש: זהו דגל ברמת המודול, ורנדר קודם שהציג סיכום
      // היה משאיר אותו דלוק ומסתיר תאריכים בציור שאין בו סיכום כלל.
      refundSummaryShown = false;
      var u = user();
      var fam = u.family || u.name || "תושב";
      var house = u.house ? ("בית " + u.house) : "אזור תושב";
      var groups = splitRequests(myRequests());
      var refunds = groups.refunds, handled = groups.handled;
      // כל השנים — לחלק ההיסטוריה בלבד. הרשימה הראשית והמונים נשארים
      // על השנה הפעילה, כדי ש"שולמו" ימשיך להיות "שולמו השנה".
      var allYears = myRequestsAllYears();

      // הסטטיסטיקות למעלה (ממתינות/אושרו/שולמו) מתייחסות רק להחזרים בפועל —
      // "בקשות אחרות שטיפלנו בהן" זה לא כסף שמגיע למשפחה, אז לא נספר בתוכן.
      var counts = { pending: 0, ready: 0, paid: 0 };
      refunds.forEach(function (t) {
        if (t.status === "submitted") counts.pending++;
        else if (t.status === "ready") counts.ready++;
        else if (t.status === "paid") counts.paid += (t.amount || 0);
      });

      var listHTML = "";
      if (refunds.length || handled.length) {
        // הסיכום נבנה *לפני* הכרטיסים, כי הוא מדליק את refundSummaryShown
        // שהכרטיסים נשענים עליו כדי לא לחזור על אותו תאריך.
        var sumHTML = refundSummaryHTML(refunds);
        refundSummaryShown = !!sumHTML;
        // הסיכום יושב **מעל** כותרת המקטע ולא בתוכו, והוא לא לבוש כ-.card:
        // הוא אינו פריט ברשימה אלא הסכום שכל הרשימה מסתכמת אליו. ההבדל
        // מגיע מהמבנה (אין משטח כרטיס, מספר גדול, קו חותך) ולא מצבע —
        // כך הוא לא מתנגש בכפתור ה-CTA השחור שמעליו (יועד בחר, 7.9.26).
        listHTML += sumHTML;
        listHTML += '<div class="rq-section-title">ההחזרים שלנו</div>';
        listHTML += refunds.length
          ? '<div class="rq-list">' + refunds.map(reqCardHTML).join("") + '</div>'
          : '<div class="rs-empty rs-empty--compact"><p>אין החזרים כרגע.</p></div>';
        if (handled.length) {
          listHTML += '<div class="rq-section-title">בקשות אחרות שטיפלנו בהן</div>';
          listHTML += '<div class="rq-list">' + handled.map(reqCardHTML).join("") + '</div>';
        }
      } else {
        listHTML = '<div class="rs-empty">' + inboxIcon +
              '<b>עדיין אין בקשות</b>' +
              '<p>לחצו על "הגשת בקשה חדשה" כדי לשלוח קבלה ראשונה. הבקשות שלכם יופיעו כאן עם הסטטוס שלהן.</p>' +
            '</div>';
      }

      // היסטוריה משנים קודמות — תמיד בסוף, גם כשהשנה הפעילה ריקה.
      // מכבים את הדגל קודם: הסיכום מכסה רק את השנה הפעילה, ובקשה משנה
      // קודמת שעדיין "הועבר להנה"ח" כן צריכה להציג את המועד שלה.
      refundSummaryShown = false;
      listHTML += pastYearsHTML(allYears, CBA.data.getCurrentYear());

      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">שלום, ' + CBA.esc(fullName(u)) + '</div>' +
          '<div class="screen-head__sub">' + CBA.esc(house) + ' · אזור תושב</div></div>' +
        '<div class="summary res-summary">' +
          '<div class="stat stat--warn"><div class="stat__label">ממתינות</div><div class="stat__value">' + counts.pending + '</div></div>' +
          '<div class="stat stat--blue"><div class="stat__label">אושרו</div><div class="stat__value">' + counts.ready + '</div></div>' +
          '<div class="stat stat--ok"><div class="stat__label">שולמו</div><div class="stat__value">' + CBA.formatILS(counts.paid) + '</div></div>' +
        '</div>' +
        '<button class="btn-primary rs-cta" data-goto="resSubmit">' + plusIcon + ' הגשת בקשה חדשה</button>' +
        '<div id="rq-gym">' + gymCardHTML() + '</div>' +
        listHTML;

      var cta = container.querySelector("[data-goto]");
      if (cta) cta.addEventListener("click", function () { CBA.navigate("resSubmit"); });
      var gymSlot = container.querySelector("#rq-gym");
      if (gymSlot) bindGymCard(gymSlot);
      refreshGymCard(container);
      bindCollapsibles(container);
      if (rqWinScrollY) window.scrollTo(0, rqWinScrollY);
    }
  };

  /* ==== "הגשת קבלה" — טופס ==== */
  var HINTS = {
    refund:   "שילמת מכיסך ומבקש החזר. השם שלך מזוהה אוטומטית — אין צורך בפרטי בנק.",
    supplier: "הוועד ישלם ישירות לספק. יש לצרף את פרטי חשבון הבנק של הספק (מופיעים בדרך כלל בקבלה)."
  };

  CBA.screens.resSubmit = {
    render: function (container) {
      var u = user();
      var fam = u.family || u.name || "תושב";
      var house = u.house ? ("בית " + u.house) : "";

      var picked = null;       // {dataBase64, mimeType, fileName, previewUrl, size} אחרי עיבוד
      var processing = false;  // מכווצים תמונה כרגע
      var expenseType = "refund";

      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">הגשת בקשה</div>' +
          '<div class="screen-head__sub">' + CBA.esc(fullName(u)) + (house ? " · " + CBA.esc(house) : "") + '</div></div>' +
        '<div class="rs-form">' +
          '<div class="rs-seg" id="type-seg">' +
            '<button data-type="refund" class="on">החזר לדייר</button>' +
            '<button data-type="supplier">תשלום לספק</button>' +
          '</div>' +
          '<div class="rs-hint" id="type-hint">' + HINTS.refund + '</div>' +
          '<div class="rs-upload" id="rs-upload">' + cameraIcon + '<b>צילום או העלאת קבלה</b><small>JPG, PNG או PDF</small></div>' +
          '<button type="button" class="rs-ghost rs-scan-btn" id="rs-scan-btn" hidden>' + scanIcon + ' <span>סריקה חכמה</span></button>' +
          '<div class="rs-scan-msg" id="rs-scan-msg" hidden></div>' +
          '<input type="file" id="rs-file" accept="image/*,application/pdf" hidden>' +
          '<div class="form-grid">' +
            '<div class="form-field"><label>סכום (₪)</label>' +
              '<input class="field-input num-input" id="rs-amount" type="number" inputmode="decimal" placeholder="0.00" min="0" step="0.01"></div>' +
            '<div class="form-field"><label>פרטי ספק</label>' +
              '<input class="field-input" id="rs-supplier" type="text" placeholder="שם בית העסק"></div>' +
            '<div class="form-field form-field--wide"><label>תיאור ההוצאה — לטובת מה</label>' +
              '<input class="field-input" id="rs-desc" type="text" placeholder="למשל: כיבוד לאירוע קהילה"></div>' +
            '<div class="form-field form-field--wide" id="bank-field" style="display:none;">' +
              '<label>חשבון בנק של הספק</label>' +
              '<div class="bank-row">' +
                '<input class="field-input" id="rs-bank-name" type="text" placeholder="בנק">' +
                '<input class="field-input" id="rs-bank-branch" type="text" placeholder="סניף">' +
                '<input class="field-input" id="rs-bank-account" type="text" placeholder="מספר חשבון">' +
              '</div></div>' +
          '</div>' +
          '<button class="btn-primary rs-submit" id="rs-submit-btn">' + sendIcon + ' <span>שלח בקשה</span></button>' +
          '<div class="rs-err" id="rs-err" hidden></div>' +
        '</div>';

      var uploadEl  = container.querySelector("#rs-upload");
      var fileInput = container.querySelector("#rs-file");
      var errEl     = container.querySelector("#rs-err");
      var submitBtn = container.querySelector("#rs-submit-btn");
      var scanBtn   = container.querySelector("#rs-scan-btn");
      var scanMsg   = container.querySelector("#rs-scan-msg");

      function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
      function hideError() { errEl.hidden = true; }

      function resetScanBtn() { scanBtn.disabled = false; scanBtn.innerHTML = scanIcon + ' <span>נסה שוב</span>'; }
      function hideScanMsg() { scanMsg.hidden = true; }
      function showScanMsg(text, isError) {
        scanMsg.textContent = text;
        scanMsg.hidden = false;
        scanMsg.classList.toggle("rs-scan-msg--err", !!isError);
      }

      function renderUploadEmpty() {
        uploadEl.classList.remove("is-filled", "is-busy");
        uploadEl.innerHTML = cameraIcon + '<b>צילום או העלאת קבלה</b><small>JPG, PNG או PDF</small>';
        scanBtn.hidden = true;
        hideScanMsg();
      }
      function renderUploadBusy() {
        uploadEl.classList.remove("is-filled");
        uploadEl.classList.add("is-busy");
        uploadEl.innerHTML = '<div class="rs-spin"></div><b>מעבד קובץ…</b>';
      }
      function renderUploadFilled() {
        uploadEl.classList.remove("is-busy");
        uploadEl.classList.add("is-filled");
        var thumb = picked.previewUrl
          ? '<img class="rs-upload__thumb" src="' + picked.previewUrl + '" alt="">'
          : '<div class="rs-upload__thumb rs-upload__thumb--doc">' + docIcon + '</div>';
        uploadEl.innerHTML =
          thumb +
          '<div class="rs-upload__info"><div class="rs-upload__name">' + CBA.esc(picked.fileName) + '</div>' +
            '<div class="rs-upload__meta">' + fmtBytes(picked.size) + ' · נבחרה קבלה</div></div>' +
          '<button type="button" class="rs-upload__remove" id="rs-remove-file" aria-label="הסר קובץ">' + xIcon + '</button>';
        var rm = uploadEl.querySelector("#rs-remove-file");
        if (rm) rm.addEventListener("click", function (e) {
          e.stopPropagation();
          picked = null;
          fileInput.value = "";
          // בוטל הקובץ שנבחר — כבר אין מה לאבד ברענון רקע (ר' markDirty למטה)
          if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("receiptUpload");
          renderUploadEmpty();
        });
        /* קובץ חדש נבחר -> מסתירים כפתור/הודעת סריקה קודמים (שייכים לקובץ הקודם); הסריקה
           מופעלת אוטומטית מיד אחרי (ר' runScan למטה), הכפתור מוצג רק אם הסריקה נכשלת */
        scanBtn.hidden = true;
        hideScanMsg();
      }

      uploadEl.addEventListener("click", function () {
        if (processing) return;
        fileInput.click();
      });

      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        hideError();
        if (file.size > MAX_RAW_BYTES) {
          showError("הקובץ גדול מדי (מקסימום 15MB). נסו לצלם שוב או לבחור קובץ קטן יותר.");
          fileInput.value = "";
          return;
        }
        // (2026-08-09) יש עכשיו קובץ בעיבוד/נבחר שעדיין לא נשלח — עד שהבקשה
        // תישלח בהצלחה (או תבוטל) לא רוצים שרענון רקע "יאפס" את המסך הזה
        // וימחק את מה שהמשתמש בחר, ר' ההסבר המלא ב-sheets.js (markDirty/isDirty).
        if (CBA.sheets.markDirty) CBA.sheets.markDirty("receiptUpload");
        processing = true;
        renderUploadBusy();
        var isImage = file.type.indexOf("image/") === 0;
        var handler = isImage ? compressImage : readFileAsBase64;
        handler(file, function (err, result) {
          processing = false;
          if (err) {
            showError(err.message || "שגיאה בעיבוד הקובץ");
            if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("receiptUpload");   // העיבוד נכשל — אין יותר קובץ ממתין
            renderUploadEmpty();
            return;
          }
          result.size = isImage ? Math.round((result.dataBase64.length * 3) / 4) : file.size;
          picked = result;
          renderUploadFilled();
          runScan();
        });
      });

      /* סריקה חכמה (שלב 4, 2026-08-08; עודכן ל-אוטומטית ב-2026-08-08): ברגע שקובץ
         נבחר ועובד (נדחס/נקרא) בהצלחה, הסריקה מופעלת לבד — אין צורך בלחיצה. שולחת
         את הקובץ ל-Gemini דרך Code.gs (action scanReceipt, אומת חי — ר' STEP C
         בזיכרון הפרויקט) וממלאת את שדות הטופס מהתשובה. תמיד רק הצעת-מילוי — התושב
         רואה ועורך הכל לפני "שלח בקשה"; אין שליחה אוטומטית של הבקשה עצמה. אם הסריקה
         נכשלת מופיע כפתור "נסה שוב" קטן שמריץ runScan שוב (סבב עיצוב 2026-08-08). */
      var scanning = false;
      function runScan() {
        if (!picked || scanning) return;
        scanning = true;
        scanBtn.hidden = true;
        showScanMsg("סורק את הקבלה אוטומטית…");
        CBA.data.scanReceipt(picked.dataBase64, picked.mimeType, function (res) {
          scanning = false;
          /* לוג אבחון זמני (2026-08-09) — כדי לראות מיד בקונסול הדפדפן בדיוק מה חזר
             מהשרת לכל שדה (כולל בנק/סניף/חשבון), בלי להמתין ליומני Apps Script.
             אפשר להסיר בהמשך. */
          console.log("CBA scanReceipt result:", res);
          if (!picked) return; // הקובץ הוסר בזמן שהסריקה רצה — אין מה לעדכן
          resetScanBtn();
          if (!res || !res.ok || !res.fields) {
            showScanMsg("הסריקה נכשלה — אפשר למלא ידנית או לנסות שוב.", true);
            scanBtn.hidden = false;
            return;
          }
          var f = res.fields;
          var filledLabels = [];
          if (f.amount) {
            container.querySelector("#rs-amount").value = f.amount;
            filledLabels.push("סכום");
          }
          if (f.supplier) {
            container.querySelector("#rs-supplier").value = f.supplier;
            filledLabels.push("ספק");
          }
          if (f.description) {
            container.querySelector("#rs-desc").value = f.description;
            filledLabels.push("תיאור");
          }
          /* פרטי בנק (2026-08-09): רק כשמופיעים בקבלה/חשבונית (ר' bankName/bankBranch/
             bankAccount ב-scanReceiptWithGemini_ ב-Code.gs) וגם רק אם מדובר בתשלום לספק —
             השדות עצמם קיימים ב-DOM תמיד, רק מוסתרים בהחזר לדייר, אז אין נזק במילוי גם אז. */
          if (f.bankName) {
            container.querySelector("#rs-bank-name").value = f.bankName;
            filledLabels.push("בנק");
          }
          if (f.bankBranch) {
            container.querySelector("#rs-bank-branch").value = f.bankBranch;
            filledLabels.push("סניף");
          }
          if (f.bankAccount) {
            container.querySelector("#rs-bank-account").value = f.bankAccount;
            filledLabels.push("מס' חשבון");
          }
          if (filledLabels.length) {
            showScanMsg("מולא אוטומטית: " + filledLabels.join(", ") + " — כדאי לבדוק ולערוך לפני השליחה.");
          } else {
            showScanMsg("לא זוהו פרטים ברורים בתמונה — אפשר למלא ידנית.");
          }
        });
      }

      scanBtn.addEventListener("click", function () {
        if (scanBtn.disabled) return;
        runScan();
      });

      /* מתג סוג הבקשה — חושף/מסתיר את שדה הבנק */
      var seg = container.querySelector("#type-seg");
      seg.addEventListener("click", function (e) {
        var b = e.target.closest("[data-type]");
        if (!b) return;
        expenseType = b.dataset.type;
        var isSupplier = expenseType === "supplier";
        seg.querySelectorAll("[data-type]").forEach(function (x) { x.classList.toggle("on", x === b); });
        container.querySelector("#bank-field").style.display = isSupplier ? "block" : "none";
        container.querySelector("#type-hint").textContent = isSupplier ? HINTS.supplier : HINTS.refund;
      });

      function val(sel) { var el = container.querySelector(sel); return el ? el.value.trim() : ""; }

      function validate() {
        var errs = [];
        if (!picked) errs.push("יש לצרף תמונה או קובץ של הקבלה.");
        var amount = parseFloat(val("#rs-amount"));
        if (!amount || amount <= 0) errs.push("יש להזין סכום תקין.");
        if (!val("#rs-supplier")) errs.push("יש למלא את פרטי הספק / בית העסק.");
        if (!val("#rs-desc")) errs.push("יש למלא תיאור קצר של ההוצאה.");
        if (expenseType === "supplier") {
          if (!val("#rs-bank-name")) errs.push("יש למלא את שם הבנק של הספק.");
          if (!val("#rs-bank-account")) errs.push("יש למלא את מספר חשבון הספק.");
        }
        return errs;
      }

      function renderSent() {
        container.innerHTML =
          '<div class="rs-sent">' +
            '<div class="rs-sent__icon">' + checkIcon + '</div>' +
            '<b>הבקשה נשלחה!</b>' +
            '<p>הבקשה שלכם התקבלה ותיבדק בהקדם. תוכלו לעקוב אחר הסטטוס במסך "הבקשות שלי".</p>' +
            '<button class="btn-primary rs-cta" id="rs-again">' + plusIcon + ' שליחת בקשה נוספת</button>' +
            '<button class="rs-ghost" id="rs-to-list" style="margin:10px auto 0;">אל הבקשות שלי</button>' +
          '</div>';
        var again = container.querySelector("#rs-again");
        if (again) again.addEventListener("click", function () { CBA.screens.resSubmit.render(container); });
        var toList = container.querySelector("#rs-to-list");
        if (toList) toList.addEventListener("click", function () { CBA.navigate("resRequests"); });
      }

      submitBtn.addEventListener("click", function () {
        hideError();
        var errs = validate();
        if (errs.length) { showError(errs.join(" ")); return; }

        openReceiptPurposeModal(function (purposeText) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = '<div class="rs-spin"></div><span>שולח…</span>';

          var desc = val("#rs-desc");
          if (purposeText) desc = desc ? (desc + " לטובת " + purposeText) : ("לטובת " + purposeText);

          var fields = {
            expenseType: expenseType,
            amount: parseFloat(val("#rs-amount")),
            supplier: val("#rs-supplier"),
            description: desc,
            buyer: fullName(u),
            email: u.email || "",
            // מזהה משפחה (נמצא בסימולציה חיה, 2026-08-10): רק כדי שהעותק המקומי
            // האופטימי (ר' ההערה ב-dataService.js/submitReceipt) יכלול familyId —
            // בלעדיו myRequests() כאן למעלה (שמסננת לפי familyId) לא מציגה את
            // הבקשה החדשה עד רענון מלא של העמוד. השרת ממשיך לחשב את מזהה
            // המשפחה האמיתי בעצמו לפי האימייל המאומת (submitReceipt_ ב-Code.gs)
            // ולא סומך על השדה הזה — הוא משמש רק לתצוגה המיידית בצד הלקוח.
            familyId: String(u.familyId || u.house || ""),
            fileName: picked.fileName,
            mimeType: picked.mimeType,
            dataBase64: picked.dataBase64
          };
          if (expenseType === "supplier") {
            fields.bankName = val("#rs-bank-name");
            fields.bankBranch = val("#rs-bank-branch");
            fields.bankAccount = val("#rs-bank-account");
          }

          // submitReceipt עובר ב-postReadProgress (לא push) — לא נספר אוטומטית
          // ב-inFlightWrites. מסמנים כאן במפורש כדי שגם הבקשה עצמה (לא רק
          // "יש קובץ נבחר") תהיה מוגנת — כולל בניסיון חוזר אחרי כישלון,
          // כשה"receiptUpload" הקודם כבר נוקה (ר' ההערה בענף הכישלון למטה).
          if (CBA.sheets.markDirty) CBA.sheets.markDirty("receiptUpload");
          CBA.data.submitReceipt(fields, function (res) {
            if (res && res.ok) {
              if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("receiptUpload");   // נשלח בהצלחה — אין יותר מה להגן עליו
              renderSent();
            } else {
              submitBtn.disabled = false;
              submitBtn.innerHTML = sendIcon + ' <span>שלח בקשה</span>';
              showError("השליחה נכשלה — בדקו את החיבור לאינטרנט ונסו שוב.");
              // (2026-08-09, תיקון באג): בעבר לא ניקינו כאן בכוונה, כדי "להגן" על
              // הקובץ הנבחר עד ניסיון חוזר. אבל isDirty הוא דגל *גלובלי* — נשאר
              // תקוע "dirty" עד שהמשתמש יסיר/יבחר קובץ מחדש היה חוסם רענון רקע
              // בכל האפליקציה (לא רק במסך הזה) אם המשתמש פשוט עוזב את המסך אחרי
              // כישלון בלי לפעול. מנקים כאן — אם המשתמש ינסה שוב, בחירת קובץ
              // חדשה תסמן dirty מחדש; קובץ שנשאר מהניסיון הקודם עדיין מוצג במסך
              // (picked לא התאפס), רק לא מוגן מרענון רקע במקרה הקצה שהמשתמש
              // משאיר את מסך השגיאה פתוח בלי לפעול.
              if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("receiptUpload");
            }
          });
        });
      });
    }
  };

  /* ==== "שריון מועדון" (שלב 8, + הרחבה) ====
     מסך עם שני טאבים פנימיים: "לוח ושריון" (בחירת זמן + יצירה) ו"השריונים שלי" (רשימה + ביטול).
     בלוח: רשימת משבצות של חצי-שעה ליום נבחר — אפור=תפוס (מ-Google Calendar), לבן=פנוי ולחיץ.
     בחירה: לחיצה-לחיצה (מגע, נשאר פשוט וזול לגלילה) או גרירת עכבר רציפה (דסקטופ, "pointer:fine"
     בלבד — כדי לא להתנגש עם גלילת מגע). שתי השיטות מרחיבות לטווח חופשי (לא משבצות קשיחות),
     עוצרות במשבצת חסומה. יש גם תצוגה חודשית (ימים עם שריון מודגשים) לניווט מהיר לתאריך עמוס.
     כתיבה/מחיקה עוברות ל-Code.gs (handleReserveClub_/handleCancelClubReservation_) עם בדיקת
     חפיפה/בעלות טרייה בשרת. */
  var WEEKDAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  var WEEKDAYS_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  var MONTH_NAMES_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function shiftDate(dateStr, days) {
    var d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + days);
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function dateLabel(dateStr) {
    var d = new Date(dateStr + "T00:00:00");
    return "יום " + WEEKDAYS_HE[d.getDay()] + " " + pad2(d.getDate()) + "." + pad2(d.getMonth() + 1) + "." + d.getFullYear();
  }
  function slotLabel(i) { return pad2(Math.floor(i / 2)) + ":" + (i % 2 ? "30" : "00"); }
  function slotEndLabel(i) { return i === 47 ? "24:00" : slotLabel(i + 1); }
  function slotBounds(dateStr, i) {
    var h = Math.floor(i / 2), m = (i % 2) * 30;
    var start = new Date(dateStr + "T" + pad2(h) + ":" + pad2(m) + ":00");
    return { start: start, end: new Date(start.getTime() + 30 * 60000) };
  }
  function monthLabel(monthStr) {
    var p = monthStr.split("-");
    return MONTH_NAMES_HE[parseInt(p[1], 10) - 1] + " " + p[0];
  }
  function shiftMonth(monthStr, delta) {
    var p = monthStr.split("-");
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10) - 1 + delta;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + "-" + pad2(m + 1);
  }

  // מספר סידורי לכל הצגה של מסך הלוח — מאפשר למאזיני document-level (גרירת עכבר)
  // לזהות שהם "יתומים" (המסך הוחלף) ולנתק את עצמם, כדי לא להצטבר בין ניווטים חוזרים.
  var bookingSeq = 0;

  /* ---- הוראות ותקנון שימוש במועדון (טקסט קבוע, נמסר ע"י יועד 2026-08-05) ---- */
  var PAYBOX_URL = "https://links.payboxapp.com/e5vEFrqvd5b";
  var payboxIcon = svg('<path d="M4 7h16v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 7l1.6-3.2A2 2 0 0 1 7.4 2.8h9.2a2 2 0 0 1 1.8 1.1L20 7"/><path d="M9 12h6"/>');
  /* (2026-08-24) היה כאן קבוע שנבנה בזמן טעינת הקובץ. הפך לפונקציה כדי
     שקוד הרשת האלחוטית ייקרא מההגדרות בזמן ההצגה — הוא כבר לא כתוב כאן.
     ר' clubWifiHTML למטה ו-SETTINGS_PUBLIC_ALLOW ב-Code.gs. */
  function clubWifiHTML() {
    var s = (window.CBA && CBA.mock && CBA.mock._settings) || {};
    var net  = String(s['רשת אלחוטית במועדון'] || '').trim();
    var pass = String(s['סיסמת רשת המועדון'] || '').trim();
    if (!net && !pass) return '';   // לא הוגדר בגיליון — פשוט לא מציגים שורה ריקה
    return '<p><b>רשת אלחוטית:</b> ' + CBA.esc(net || '—') +
      (pass ? ('&nbsp;·&nbsp;<b>סיסמה:</b> ' + CBA.esc(pass)) : '') + '</p>';
  }
  function clubRulesHTML() {
    return
    '<p>השכרתם את מועדון המשפחות של שיכון פלמחים.</p>' +
    '<p><b>שימו לב כי חל איסור:</b></p>' +
    '<ul>' +
      '<li>לעשות פעולות יצירה במועדון.</li>' +
      '<li>תליית קישוטים על הקירות/חלונות/תקרה.</li>' +
      '<li>לקיים אירועים יחידתיים.</li>' +
      '<li>לקיים אירוע חברה/עסקי.</li>' +
    '</ul>' +
    '<p><b>בסיום האירוע:</b></p>' +
    '<ul>' +
      '<li>ניקוי רצפה, שולחנות, מטבחון, שירותים.</li>' +
      '<li>החזרת ציוד למחסן בצורה מסודרת.</li>' +
      '<li>החזרת כסאות ושולחנות למקומם.</li>' +
      '<li>ריקון פחים.</li>' +
      '<li>כיבוי מזגנים.</li>' +
      '<li>כיבוי כל התאורות (פנימיות וחיצוניות).</li>' +
      '<li>נעילת כל הדלתות.</li>' +
      '<li>בסיום השימוש יש להעביר צילום של המקום.</li>' +
    '</ul>' +
    clubWifiHTML() +
    '<p>במועדון קיימת מערכת הגברה, מיקרופון ומקרן שניתן להשתמש בהם.</p>' +
    '<p>במחסן המועדון יש מכונות מזון אותן ניתן להשכיר בנפרד ובתיאום מראש — אין להשתמש במכונות ללא רשות.</p>' +
    '<p>שמתם לב למשהו תקול/בלוי, או שחומרי ניקיון חסרים/עומדים להיגמר? נא לעדכן את הוועד בהקדם כדי שנוכל לטפל בנושא.</p>';
  }
  // הערה: נושא התשלום (200₪ + קישור PayBox) הוצא מכאן ומקבל קובייה נפרדת ובולטת
  // משלו בעמוד (.club-pay, 2026-08-06 לבקשת יועד) — לא חוזר על עצמו בטקסט התקנון.

  // תמצית "5 הדגשים" המוצגת כשכרטיס התקנון מכווץ (ברירת המחדל) — מזמינה לקרוא את
  // התקנון המלא בלי להציג "קיר טקסט" מראש. הרשימה המלאה עדיין זמינה בהרחבה.
  var CLUB_RULES_TOP5_HTML =
    '<ul class="club-rules__top5-list">' +
      '<li>איסור על פעולות יצירה, תליית קישוטים ואירועים יחידתיים/עסקיים.</li>' +
      '<li>בסיום: ניקוי, החזרת ציוד/כיסאות/שולחנות למקומם וריקון פחים.</li>' +
      '<li>כיבוי מזגנים ותאורה ונעילת כל הדלתות בסיום השימוש.</li>' +
      '<li>יש לשלוח תמונה של המקום בסיום השימוש.</li>' +
      '<li>הגברה/מיקרופון/מקרן פנויים לשימוש; מכונות המזון בתיאום נפרד בלבד.</li>' +
    '</ul>';

  var CLUB_RULES_SUMMARY_HTML =
    '<ul class="club-rules__summary">' +
      '<li>אסור: פעילויות יצירה, תליית קישוטים על קירות/חלונות/תקרה, אירועים יחידתיים או עסקיים.</li>' +
      '<li>בסיום: ניקוי (רצפה/שולחנות/מטבחון/שירותים), החזרת ציוד/כיסאות/שולחנות למקומם, ריקון פחים, כיבוי מזגנים ותאורה, נעילת הדלתות והחזרת המפתחות עד סוף היום.</li>' +
      '<li>יש לשלוח צילום של המקום בסיום השימוש.</li>' +
      '<li>עלות השימוש: 200₪ — התשלום מתבצע דרך קובית "תשלום" בעמוד.</li>' +
    '</ul>' +
    '<p class="club-rules__more">הרשימה המלאה זמינה בכרטיס ההוראות בעמוד.</p>';

  /* חלון קופץ שדורש אישור מפורש להנחיות לפני שליחת בקשת השריון בפועל.
     onConfirm נקרא רק אחרי שהתושב סימן את תיבת האישור ולחץ "אישור ושליחה". */
  function openRulesConfirm(onConfirm) {
    closeAnyModal();
    var overlay = document.createElement("div");
    overlay.id = "cba-modal";
    overlay.innerHTML =
      '<div class="modal-backdrop" data-modal-close>' +
        '<div class="modal" role="dialog">' +
          '<div class="modal__head">' +
            '<div><div class="modal__title">לפני שמאשרים שריון</div>' +
              '<div class="modal__sub">עיקרי הוראות השימוש במועדון — נא לקרוא ולאשר</div></div>' +
            '<button class="drawer__close" data-modal-close aria-label="סגור">×</button>' +
          '</div>' +
          '<div class="modal__body">' +
            CLUB_RULES_SUMMARY_HTML +
            '<label class="club-rules__agree">' +
              '<input type="checkbox" id="rc-agree"> קראתי ואני מתחייב/ת לפעול לפי ההנחיות' +
            '</label>' +
            '<div class="club-rules__modal-actions">' +
              '<button type="button" class="rs-ghost" data-modal-close>ביטול</button>' +
              '<button type="button" class="btn-primary" id="rc-agree-submit" disabled>אישור ושליחה</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
    overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeAnyModal); });
    document.addEventListener("keydown", escAnyModal);

    var agreeBox = overlay.querySelector("#rc-agree");
    var confirmBtn = overlay.querySelector("#rc-agree-submit");
    agreeBox.addEventListener("change", function () { confirmBtn.disabled = !agreeBox.checked; });
    confirmBtn.addEventListener("click", function () {
      closeAnyModal();
      openPaymentReminder(onConfirm);   // 2026-08-06: אחרי אישור התקנון, עוד חלון לתשלום לפני השליחה בפועל
    });
  }

  /* חלון שני, קופץ מיד אחרי אישור התקנון — מזכיר את עלות השימוש ומציע לעבור
     לתשלום ב-PayBox כבר עכשיו. onProceed (=הגשת השריון בפועל) נקרא רק אחרי
     שלוחצים "המשך לשליחת הבקשה", כדי לא לשלוח לפני שהתושב ראה את מסך התשלום. */
  function openPaymentReminder(onProceed) {
    closeAnyModal();
    var overlay = document.createElement("div");
    overlay.id = "cba-modal";
    overlay.innerHTML =
      '<div class="modal-backdrop" data-modal-close>' +
        '<div class="modal" role="dialog">' +
          '<div class="modal__head">' +
            '<div><div class="modal__title">לפני שממשיכים — תשלום</div>' +
              '<div class="modal__sub">עלות השימוש במועדון היא 200₪</div></div>' +
            '<button class="drawer__close" data-modal-close aria-label="סגור">×</button>' +
          '</div>' +
          '<div class="modal__body">' +
            '<div style="text-align:center;">' +
              '<a class="club-pay__btn" href="' + PAYBOX_URL + '" target="_blank" rel="noopener">' +
                payboxIcon + '<span>מעבר לתשלום ב-PayBox</span>' +
              '</a>' +
            '</div>' +
            '<p class="club-rules__more" style="text-align:center;margin-top:14px;">אפשר לשלם גם מאוחר יותר, מיד לאחר שהשריון יאושר ע"י הוועד.</p>' +
            '<div class="club-rules__modal-actions">' +
              '<button type="button" class="btn-primary" id="rc-pay-continue">המשך לשליחת הבקשה</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
    overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeAnyModal); });
    document.addEventListener("keydown", escAnyModal);
    overlay.querySelector("#rc-pay-continue").addEventListener("click", function () {
      closeAnyModal();
      onProceed();
    });
  }
  /* חלון קופץ בלחיצת "שלח בקשה" בהגשת קבלה (2026-08-08, עודכן לעיצוב חד-שלבי
     באותו יום לפי בקשת יועד) — שואל אם צוין בתיאור לאיזה שימוש הרכישה, ומציג מיד
     שדה טקסט אחד (לא חובה) למי שרוצה להוסיף. מה שמוזן שם מתווסף לתיאור בפורמט
     "<תיאור> לטובת <טקסט>" (למשל קבלה על "ציוד למסיבות" + הוספת "אירוע מבוגרים"
     -> "ציוד למסיבות לטובת אירוע מבוגרים"). כפתור אחד ("כן, שלח") תמיד מסיים —
     אם השדה ריק לא מתווסף כלום. onProceed(purposeText) נקרא רק בלחיצה על הכפתור;
     purposeText הוא null אם השדה נשאר ריק. */
  function openReceiptPurposeModal(onProceed) {
    closeAnyModal();
    var overlay = document.createElement("div");
    overlay.id = "cba-modal";
    overlay.innerHTML =
      '<div class="modal-backdrop" data-modal-close>' +
        '<div class="modal" role="dialog">' +
          '<div class="modal__head">' +
            '<div><div class="modal__title">לפני שליחה</div>' +
              '<div class="modal__sub">האם ציינת בתיאור לאיזה שימוש הרכישה?</div></div>' +
            '<button class="drawer__close" data-modal-close aria-label="סגור">×</button>' +
          '</div>' +
          '<div class="modal__body">' +
            '<div class="form-field"><label>לאיזה שימוש? (לא חובה — למלא רק אם עוד לא צוין למעלה)</label>' +
              '<input type="text" id="rp-purpose-input" class="field-input" placeholder="לדוגמה: אירוע מבוגרים"></div>' +
            '<div class="club-rules__modal-actions">' +
              '<button type="button" class="btn-primary" id="rp-yes">כן, שלח</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
    overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeAnyModal); });
    document.addEventListener("keydown", escAnyModal);

    var input = overlay.querySelector("#rp-purpose-input");
    input.focus();
    overlay.querySelector("#rp-yes").addEventListener("click", function () {
      var text = input.value.trim();
      closeAnyModal();
      onProceed(text || null);
    });
  }

  function closeAnyModal() {
    var el = document.getElementById("cba-modal");
    if (el) el.remove();
    document.removeEventListener("keydown", escAnyModal);
  }
  function escAnyModal(e) { if (e.key === "Escape") closeAnyModal(); }

  CBA.screens.resReserve = {
    render: function (container) {
      // שימור מיקום גלילה (ר' אותה תבנית ב-resRequests/resDirectory למעלה) —
      // ידוע שהמסך הזה עדיין לא שומר מצב פנימי נוסף (תקנון פתוח/סגור, רשימת
      // "השריונים שלי") מעבר לזה בין render() חוזרים; זה תיעוד ל-backlog,
      // לא נפתר כאן במלואו — ר' cba-data-refresh-policy.
      var rvWinScrollY = window.scrollY || 0;
      var u = user();
      var fam = u.family || u.name || "תושב";
      var house = u.house ? ("בית " + u.house) : "";

      // פריסה (2026-08-06, סבב שני לבקשת יועד): דסקטופ = 2 טורים (ימין ~65%
      // לוח/שריון, שמאל ~35% תשלום+תקנון+השריונים שלי, ר' res-reserve-layout
      // ב-resident.css, מוצב לפי grid-area בלי תלות בסדר ה-DOM). במובייל אין
      // כותרת עמוד נפרדת (הועברה לתוך כרטיס הלוח, ר' renderBooking) והסדר הוא
      // "השריונים שלי" -> תקנון -> לוח/שריון; קובית התשלום העצמאית (.club-pay)
      // מוסתרת במובייל לגמרי — תג PayBox קטן משובץ בכותרת כרטיס התקנון במקומה
      // (ר' club-rules__pay-chip למטה + CSS @media(min-width:1024px) שמסתיר
      // אותו שוב בדסקטופ, כי שם כבר יש את הקובייה המלאה).
      container.innerHTML =
        '<div class="res-reserve-layout" id="rv-layout">' +
          '<div class="rs-mine-sec" id="rv-mine"></div>' +
          '<div class="card club-rules" id="rc-rules">' +
            '<div class="club-rules__toggle" id="rc-rules-toggle" role="button" tabindex="0" aria-expanded="false">' +
              '<span class="club-rules__toggle-txt"><b>הוראות ותקנון המועדון</b><small>לחצו לפתיחה</small></span>' +
              '<a class="club-rules__pay-chip" href="' + PAYBOX_URL + '" target="_blank" rel="noopener">' +
                payboxIcon + '<span>200₪</span>' +
              '</a>' +
              chevLeftIcon +
            '</div>' +
            '<div class="club-rules__top5" id="rc-rules-top5">' + CLUB_RULES_TOP5_HTML + '</div>' +
            '<div class="club-rules__body" id="rc-rules-body" hidden>' + clubRulesHTML() + '</div>' +
          '</div>' +
          '<div class="card club-pay" id="rc-pay">' +
            '<div class="club-pay__head">' +
              '<span class="club-pay__badge">חובה</span>' +
              '<div class="club-pay__title">תשלום השימוש במועדון</div>' +
            '</div>' +
            '<div class="club-pay__amount">200<span>₪</span></div>' +
            '<a class="club-pay__btn" href="' + PAYBOX_URL + '" target="_blank" rel="noopener">' +
              payboxIcon + '<span>מעבר לתשלום ב-PayBox</span>' +
            '</a>' +
            '<p class="club-pay__note">התשלום מתבצע לאחר שהשריון מאושר ע"י הוועד.</p>' +
          '</div>' +
          '<div id="rv-booking"></div>' +
        '</div>';

      var rulesCard = container.querySelector("#rc-rules");
      var rulesToggle = container.querySelector("#rc-rules-toggle");
      var rulesTop5 = container.querySelector("#rc-rules-top5");
      var rulesBody = container.querySelector("#rc-rules-body");
      function setRulesOpen(open) {
        rulesTop5.hidden = open;
        rulesBody.hidden = !open;
        rulesCard.classList.toggle("is-open", open);
        rulesToggle.classList.toggle("is-open", open);
        rulesToggle.setAttribute("aria-expanded", open ? "true" : "false");
        rulesToggle.querySelector("small").textContent = open ? "לחצו לסגירה" : "לחצו לפתיחה";
      }
      rulesToggle.addEventListener("click", function (e) {
        if (e.target.closest(".club-rules__pay-chip")) return;   // קליק על תג PayBox — לא מכווצים/פותחים
        setRulesOpen(rulesBody.hidden);
      });
      rulesToggle.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRulesOpen(rulesBody.hidden); }
      });
      setRulesOpen(false);   // סגור כברירת מחדל תמיד (גם בדסקטופ) — מציגים רק את 5 הדגשים

      var bookingEl = container.querySelector("#rv-booking");
      var mineEl = container.querySelector("#rv-mine");

      // שני החלקים על אותו עמוד צריכים לרענן זה את זה: שריון חדש -> "השריונים שלי"
      // מתעדכן; ביטול -> לוח הזמינות מתעדכן. משתמשים במשתני-ביניים כדי לפתור את
      // תלות-ההדדיות בסדר היצירה (booking נוצר קודם אבל צריך לקרוא ל-mine וההפך).
      var refreshMine = function () {};
      var refreshBooking = function () {};

      var bookingHandle = renderBooking(bookingEl, u, fam, house, function () { refreshMine(); });
      refreshBooking = bookingHandle.refreshBusy;

      var mineHandle = renderMine(mineEl, u, fam, function () { refreshBooking(); });
      refreshMine = mineHandle.refresh;
      if (rvWinScrollY) window.scrollTo(0, rvWinScrollY);
    }
  };

  /* ---- לוח + טופס שריון (onReserved נקרא אחרי יצירה מוצלחת, לרענון "השריונים שלי") ---- */
  function renderBooking(root, u, fam, house, onReserved) {
    var TODAY = todayStr();
    var myInstance = ++bookingSeq;
    var state = {
      date: TODAY, busy: [], loading: true, selStart: null, selEnd: null,
      view: "day", month: TODAY.slice(0, 7), monthBusy: {}, monthLoading: false
    };

    root.innerHTML =
      '<div class="card rs-club" id="rc-daycard">' +
        '<div class="rs-club__headwrap">' +
          '<div class="screen-head__title">שריון מועדון</div>' +
          '<div class="screen-head__sub">בחרו תאריך וזמן פנוי — הבקשה תישלח לאישור המנהל</div>' +
        '</div>' +
        '<div class="rs-club__nav">' +
          '<button type="button" class="rs-club__arrow" id="rc-prev" aria-label="יום קודם">' + chevRightIcon + '</button>' +
          '<div class="rs-club__date"><input type="date" id="rc-date" min="' + TODAY + '" value="' + TODAY + '"></div>' +
          '<button type="button" class="rs-club__arrow" id="rc-next" aria-label="יום הבא">' + chevLeftIcon + '</button>' +
        '</div>' +
        '<button type="button" class="rs-ghost rs-club__month-toggle" id="rc-month-toggle">' + calGridIcon + ' תצוגה חודשית</button>' +
        '<div class="rs-club__msg" id="rc-msg" hidden></div>' +
        '<div class="rs-club__legend">' +
          '<span><i class="rs-dot rs-dot--free"></i>פנוי</span>' +
          '<span><i class="rs-dot rs-dot--busy"></i>תפוס</span>' +
          '<span><i class="rs-dot rs-dot--sel"></i>הבחירה שלכם</span>' +
        '</div>' +
        '<div class="rs-slots" id="rc-slots"></div>' +
        '<div class="rs-club__hint">בנייד: הקישו על משבצת התחלה ואז משבצת סיום. בעכבר: אפשר גם לגרור.</div>' +
      '</div>' +
      '<div class="card rs-club-month" id="rc-monthcard" hidden></div>' +
      '<div class="card rs-club-form" id="rc-form" hidden></div>';

    var dayCard = root.querySelector("#rc-daycard");
    var monthCard = root.querySelector("#rc-monthcard");
    var slotsEl = root.querySelector("#rc-slots");
    var dateInput = root.querySelector("#rc-date");
    var formEl = root.querySelector("#rc-form");
    var msgEl = root.querySelector("#rc-msg");
    var prevBtn = root.querySelector("#rc-prev");

    function isPast(end) { return end.getTime() <= Date.now(); }
    function overlapsBusy(s, e) { return state.busy.some(function (b) { return s < b.end && e > b.start; }); }
    function slotBlocked(i) {
      var b = slotBounds(state.date, i);
      return overlapsBusy(b.start, b.end) || isPast(b.end);
    }

    function renderSlots() {
      if (state.loading) {
        slotsEl.innerHTML = CBA.skel.chips(12);
        return;
      }
      var lo = state.selStart != null ? Math.min(state.selStart, state.selEnd) : null;
      var hi = state.selStart != null ? Math.max(state.selStart, state.selEnd) : null;
      var rows = "";
      for (var i = 0; i < 48; i++) {
        var b = slotBounds(state.date, i);
        var busy = overlapsBusy(b.start, b.end);
        var past = !busy && isPast(b.end);
        var blocked = busy || past;
        var inSel = lo != null && i >= lo && i <= hi;
        var cls = "rs-slot" + (busy ? " is-disabled is-busy" : (past ? " is-disabled is-past" : "")) + (inSel ? " is-sel" : "");
        rows += '<button type="button" class="' + cls + '" data-i="' + i + '"' + (blocked ? " disabled" : "") + '>' + slotLabel(i) + '</button>';
      }
      slotsEl.innerHTML = rows;
    }

    // (2026-08-09) בחירת משבצת קיימת רק בזיכרון המקומי (state) עד שנשלחת בפועל —
    // markDirty/clearDirty (ר' sheets.js) מגנים עליה מרענון רקע שהיה "שוכח" אותה.
    function hideForm() { state.selStart = state.selEnd = null; formEl.hidden = true; formEl.innerHTML = ""; if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubReserveSelect"); }
    function showMsg(cls, html) { msgEl.className = "rs-club__msg " + cls; msgEl.innerHTML = html; msgEl.hidden = false; }
    function clearMsg() { msgEl.hidden = true; msgEl.innerHTML = ""; }

    function renderForm() {
      if (state.selStart == null) { formEl.hidden = true; formEl.innerHTML = ""; return; }
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubReserveSelect");   // יש בחירת משבצת ממתינה לאישור (מוגן גם בזמן שליחת reserveClub עצמה, ר' doSubmit — לא מנוקה עד hideForm בהצלחה)
      var lo = Math.min(state.selStart, state.selEnd), hi = Math.max(state.selStart, state.selEnd);
      var startLbl = slotLabel(lo), endLbl = slotEndLabel(hi);
      var mins = (hi - lo + 1) * 30;
      var durLbl = mins >= 60 ? (Math.floor(mins / 60) + (mins % 60 ? ":" + pad2(mins % 60) : "") + " שעות") : (mins + " דקות");

      formEl.hidden = false;
      formEl.innerHTML =
        '<div class="rs-club-form__sum">' +
          '<div class="rs-club-form__range">' + startLbl + '–' + endLbl + '</div>' +
          '<div class="rs-club-form__dur">' + durLbl + ' · ' + CBA.esc(dateLabel(state.date)) + '</div>' +
        '</div>' +
        '<div class="form-field form-field--wide"><label>מטרת השריון (לא חובה)</label>' +
          '<input class="field-input" id="rc-note" type="text" placeholder="למשל: יום הולדת, מפגש שכונתי..."></div>' +
        '<div class="rs-club-form__who">בשם ' + CBA.esc(fam) + (house ? " · " + CBA.esc(house) : "") + '</div>' +
        '<button type="button" class="btn-primary rs-submit" id="rc-submit">' + calCheckIcon + ' <span>שריין את המועדון</span></button>' +
        '<div class="rs-err" id="rc-err" hidden></div>';

      var submitBtn = formEl.querySelector("#rc-submit");
      var errEl = formEl.querySelector("#rc-err");

      submitBtn.addEventListener("click", function () {
        openRulesConfirm(function () { doSubmit(); });
      });

      function doSubmit() {
        errEl.hidden = true;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="rs-spin"></div><span>שולח…</span>';
        var noteEl = formEl.querySelector("#rc-note");
        var payload = {
          date: state.date, start: startLbl, end: endLbl,
          family: fam, house: u.house || "", email: u.email || "",
          note: noteEl ? noteEl.value.trim() : ""
        };
        CBA.data.reserveClub(payload, function (res) {
          if (res && res.ok) {
            hideForm();
            showMsg("is-ok", checkIcon + ' הבקשה נשלחה וממתינה לאישור מנהל: ' + startLbl + '–' + endLbl + ', ' + CBA.esc(dateLabel(state.date)));
            loadBusy();
            if (onReserved) onReserved();
          } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = calCheckIcon + ' <span>שריין את המועדון</span>';
            errEl.textContent = (res && res.error) || "השריון נכשל — בדקו את החיבור ונסו שוב.";
            errEl.hidden = false;
            if (res && res.conflict) loadBusy();
          }
        });
      }
    }

    function loadBusy() {
      state.loading = true;
      renderSlots();
      CBA.data.getClubBusy(state.date, function (res) {
        state.loading = false;
        if (res && res.ok) {
          state.busy = (res.busy || []).map(function (b) { return { start: new Date(b.start), end: new Date(b.end) }; });
        } else {
          state.busy = [];
          slotsEl.innerHTML = '<div class="rs-slots__msg rs-slots__msg--err">' + CBA.esc((res && res.error) || "טעינת הזמינות נכשלה") + '</div>';
          return;
        }
        renderSlots();
      });
    }

    function setDate(d) {
      state.date = d;
      dateInput.value = d;
      hideForm();
      clearMsg();
      prevBtn.disabled = (state.date <= TODAY);
      loadBusy();
    }

    /* ---- בחירה: לחיצה-לחיצה (כל המכשירים) ---- */
    function selectByTap(i) {
      if (state.selStart == null || state.selStart !== state.selEnd) {
        state.selStart = state.selEnd = i;
      } else if (i === state.selStart) {
        state.selStart = state.selEnd = null;
      } else {
        var lo = Math.min(state.selStart, i), hi = Math.max(state.selStart, i);
        var blocked = false;
        for (var k = lo; k <= hi; k++) { if (slotBlocked(k)) { blocked = true; break; } }
        if (blocked) { state.selStart = state.selEnd = i; }
        else { state.selStart = lo; state.selEnd = hi; }
      }
      clearMsg();
      renderSlots();
      renderForm();
    }
    slotsEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".rs-slot");
      if (!btn || btn.disabled) return;
      selectByTap(parseInt(btn.dataset.i, 10));
    });

    /* ---- בחירה: גרירת עכבר רציפה (דסקטופ בלבד — pointer:fine, לא מתנגש עם גלילת מגע) ---- */
    var supportsDrag = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    if (supportsDrag) {
      var dragging = false, dragAnchor = null;

      function extendFrom(anchor, target) {
        var dir = target >= anchor ? 1 : -1, end = anchor;
        for (var k = anchor; dir > 0 ? k <= target : k >= target; k += dir) {
          if (slotBlocked(k)) break;
          end = k;
        }
        return end;
      }
      function slotIndexFromPoint(x, y) {
        var el = document.elementFromPoint(x, y);
        var btn = el && el.closest ? el.closest(".rs-slot") : null;
        return (btn && !btn.disabled) ? parseInt(btn.dataset.i, 10) : null;
      }
      function onMove(e) {
        if (myInstance !== bookingSeq) { document.removeEventListener("mousemove", onMove); return; }
        if (!dragging) return;
        var i = slotIndexFromPoint(e.clientX, e.clientY);
        if (i == null) return;
        var lo = Math.min(dragAnchor, i), hi = Math.max(dragAnchor, i);
        state.selStart = Math.min(extendFrom(dragAnchor, lo), extendFrom(dragAnchor, hi));
        state.selEnd = Math.max(extendFrom(dragAnchor, lo), extendFrom(dragAnchor, hi));
        renderSlots();
      }
      function onUp() {
        if (myInstance !== bookingSeq) { document.removeEventListener("mouseup", onUp); return; }
        if (!dragging) return;
        dragging = false;
        renderForm();
      }
      slotsEl.addEventListener("mousedown", function (e) {
        var btn = e.target.closest(".rs-slot");
        if (!btn || btn.disabled) return;
        e.preventDefault();
        dragging = true;
        dragAnchor = parseInt(btn.dataset.i, 10);
        state.selStart = state.selEnd = dragAnchor;
        clearMsg();
        renderSlots();
      });
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }

    /* ---- ניווט יום ---- */
    prevBtn.addEventListener("click", function () { if (state.date > TODAY) setDate(shiftDate(state.date, -1)); });
    root.querySelector("#rc-next").addEventListener("click", function () { setDate(shiftDate(state.date, 1)); });
    dateInput.addEventListener("change", function () { setDate(dateInput.value && dateInput.value >= TODAY ? dateInput.value : TODAY); });
    prevBtn.disabled = (state.date <= TODAY);

    /* ---- תצוגה חודשית: החלפת הכרטיס היומי בלוח-חודש עם ימים מודגשים ---- */
    function loadMonth() {
      state.monthLoading = true;
      renderMonthCard();
      CBA.data.getClubMonth(state.month, function (res) {
        state.monthLoading = false;
        var set = {};
        if (res && res.ok) (res.busyDates || []).forEach(function (d) { set[d] = true; });
        state.monthBusy = set;
        renderMonthCard();
      });
    }
    function openMonth() {
      state.view = "month";
      hideForm();
      clearMsg();
      dayCard.hidden = true;
      monthCard.hidden = false;
      state.month = state.date.slice(0, 7);
      loadMonth();
    }
    function closeMonth() {
      state.view = "day";
      monthCard.hidden = true;
      dayCard.hidden = false;
    }
    function renderMonthCard() {
      var p = state.month.split("-");
      var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
      var daysInMonth = new Date(y, m, 0).getDate();
      var startOffset = new Date(y, m - 1, 1).getDay();
      var cells = "";
      for (var k = 0; k < startOffset; k++) cells += '<span class="rs-month__cell rs-month__cell--empty"></span>';
      for (var d = 1; d <= daysInMonth; d++) {
        var ds = y + "-" + pad2(m) + "-" + pad2(d);
        var isPastDay = ds < TODAY;
        var cls = "rs-month__cell" +
          (isPastDay ? " is-past" : "") +
          (state.monthBusy[ds] ? " is-busy" : "") +
          (ds === TODAY ? " is-today" : "") +
          (ds === state.date ? " is-sel" : "");
        cells += '<button type="button" class="' + cls + '" data-date="' + ds + '"' + (isPastDay ? " disabled" : "") + '>' + d + '</button>';
      }
      monthCard.innerHTML =
        '<div class="rs-month__head">' +
          '<button type="button" class="rs-club__arrow" id="rc-m-prev" aria-label="חודש קודם">' + chevRightIcon + '</button>' +
          '<span class="rs-month__label">' + monthLabel(state.month) + '</span>' +
          '<button type="button" class="rs-club__arrow" id="rc-m-next" aria-label="חודש הבא">' + chevLeftIcon + '</button>' +
        '</div>' +
        '<div class="rs-month__wd">' + WEEKDAYS_SHORT.map(function (w) { return "<span>" + w + "</span>"; }).join("") + '</div>' +
        '<div class="rs-month__grid' + (state.monthLoading ? " is-loading" : "") + '">' + cells + '</div>' +
        '<button type="button" class="rs-ghost rs-club__month-toggle" id="rc-m-close">' + calGridIcon + ' חזרה ללוח היום</button>';

      monthCard.querySelector("#rc-m-prev").addEventListener("click", function () { state.month = shiftMonth(state.month, -1); loadMonth(); });
      monthCard.querySelector("#rc-m-next").addEventListener("click", function () { state.month = shiftMonth(state.month, 1); loadMonth(); });
      monthCard.querySelector("#rc-m-close").addEventListener("click", closeMonth);
      monthCard.querySelectorAll(".rs-month__cell[data-date]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          closeMonth();
          setDate(btn.dataset.date);
        });
      });
    }
    root.querySelector("#rc-month-toggle").addEventListener("click", openMonth);

    loadBusy();
    return { refreshBusy: loadBusy };
  }

  /* ---- מקטע "השריונים שלי" (onChanged נקרא אחרי ביטול מוצלח, לרענון לוח הזמינות) ----
     שתי תצוגות מאותם הנתונים, אחת מוצגת לפי מסך (ר' resident.css @media 1024px):
     - .rs-mine-compact: "אובייקט" קומפקטי (מובייל) — תג עם מספר השריונים, לחיצה פותחת
       חלון עם הרשימה המלאה.
     - .rs-mine-full: הרשימה המלאה כרוכה (דסקטופ) — טור שלישי בפריסה הרחבה.
     נתוני ה-list נשמרים בזיכרון-הפונקציה כדי שביטול יעדכן את שתי התצוגות (+ מודאל אם
     פתוח) מיידית בלי טעינה חוזרת מהשרת. */
  function renderMine(root, u, fam, onChanged) {
    root.innerHTML =
      '<div class="club-sec__title rs-mine-full-heading">השריונים שלי</div>' +
      '<button type="button" class="rs-mine-compact" id="rc-mine-compact">' +
        '<span class="rs-mine-compact__ico">' + inboxIcon + '</span>' +
        '<span class="rs-mine-compact__text"><b>השריונים שלי</b><small id="rc-mine-compact-sub">טוען…</small></span>' +
        '<span class="rs-mine-compact__badge" id="rc-mine-compact-badge">…</span>' +
        chevLeftIcon +
      '</button>' +
      '<div class="rs-mine-full" id="rc-mine-full">' + CBA.skel.rows(2, { avatar: false }) + '</div>';

    var compactBtn = root.querySelector("#rc-mine-compact");
    var compactSub = root.querySelector("#rc-mine-compact-sub");
    var compactBadge = root.querySelector("#rc-mine-compact-badge");
    var fullEl = root.querySelector("#rc-mine-full");
    var list = [];
    var loadError = null;

    function summaryText() {
      if (loadError) return "שגיאה בטעינה";
      if (!list.length) return "אין שריונים קרובים";
      var pending = list.filter(function (r) { return r.status === "pending"; }).length;
      return list.length + (list.length === 1 ? " שריון" : " שריונים") + (pending ? " · " + pending + " ממתין לאישור" : "");
    }
    function updateCompact() {
      compactSub.textContent = summaryText();
      var hasPending = list.some(function (r) { return r.status === "pending"; });
      compactBadge.textContent = String(list.length);
      compactBadge.className = "rs-mine-compact__badge" + (!list.length ? "" : (hasPending ? " is-pending" : " is-ok"));
    }
    function listHTML() {
      if (loadError) return '<div class="rs-empty">' + xIcon + '<b>שגיאה בטעינה</b><p>' + CBA.esc(loadError) + '</p></div>';
      return list.length
        ? '<div class="rq-list">' + list.map(mineCardHTML).join("") + '</div>'
        : '<div class="rs-empty">' + inboxIcon + '<b>אין שריונים קרובים</b><p>שריונים שתבצעו יופיעו כאן, עם אפשרות לביטול.</p></div>';
    }
    function bindCancel(scopeEl) {
      scopeEl.querySelectorAll("[data-cancel]").forEach(function (btn) {
        btn.addEventListener("click", function () { doCancel(btn); });
      });
      scopeEl.querySelectorAll("[data-share]").forEach(function (btn) {
        btn.addEventListener("click", function () { shareToWhatsApp(btn.dataset.share); });
      });
    }
    function doCancel(btn) {
      // (2026-08-19, ממצא 2.6) אישור ביטול — מודל של האפליקציה. שאר הפונקציה
      // הוזזה פנימה אל תוך ה-then, כי מודל הוא א-סינכרוני בניגוד ל-confirm.
      CBA.ui.confirm("הפעולה תמחק את האירוע מהיומן והמשבצת תחזור להיות פנויה.",
        { title: "לבטל את השריון?", okText: "בטל שריון", danger: true }
      ).then(function (ok) { if (ok) doCancelConfirmed(btn); });
    }
    function doCancelConfirmed(btn) {
      btn.disabled = true;
      btn.innerHTML = '<div class="rs-spin"></div>מבטל…';
      var id = btn.dataset.cancel;
      // cancelClubReservation עובר ב-CBA.sheets.get (לא push) — לא נספר
      // אוטומטית ב-inFlightWrites, אז מסמנים ידנית כדי שרענון רקע לא יתערב
      // באמצע (ר' מדיניות רענון נתונים בזיכרון הפרויקט).
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubReserveCancel");
      CBA.data.cancelClubReservation({ id: id, family: fam, email: u.email || "" }, function (r) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubReserveCancel");
        if (r && r.ok) {
          list = list.filter(function (x) { return String(x.id) !== String(id); });
          updateCompact();
          fullEl.innerHTML = listHTML();
          bindCancel(fullEl);
          var modalList = document.getElementById("rc-mine-modal-list");
          if (modalList) { modalList.innerHTML = listHTML(); bindCancel(modalList); }
          if (onChanged) onChanged();
        } else {
          btn.disabled = false;
          btn.innerHTML = xIcon + ' ביטול';
          CBA.ui.alert((r && r.error) || "הביטול נכשל, נסו שוב.");
        }
      });
    }

    compactBtn.addEventListener("click", function () {
      closeAnyModal();
      var overlay = document.createElement("div");
      overlay.id = "cba-modal";
      overlay.innerHTML =
        '<div class="modal-backdrop" data-modal-close>' +
          '<div class="modal" role="dialog">' +
            '<div class="modal__head">' +
              '<div><div class="modal__title">השריונים שלי</div><div class="modal__sub">' + CBA.esc(summaryText()) + '</div></div>' +
              '<button class="drawer__close" data-modal-close aria-label="סגור">×</button>' +
            '</div>' +
            '<div class="modal__body" id="rc-mine-modal-list">' + listHTML() + '</div>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
      overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
      overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeAnyModal); });
      document.addEventListener("keydown", escAnyModal);
      bindCancel(overlay.querySelector("#rc-mine-modal-list"));
    });

    CBA.data.getMyClubReservations({ family: fam, email: u.email || "" }, function (res) {
      if (!res || !res.ok) {
        loadError = (res && res.error) || "נסו שוב מאוחר יותר.";
        updateCompact();
        fullEl.innerHTML = listHTML();
        return;
      }
      list = res.reservations || [];
      updateCompact();
      fullEl.innerHTML = listHTML();
      bindCancel(fullEl);
    });

    return { refresh: function () { renderMine(root, u, fam, onChanged); } };
  }
  /* אייקון וואטסאפ — קו מונוכרומי כמו כל שאר האייקונים באפליקציה, בלי הלוגו
     הירוק הרשמי (שהוא סימן מסחרי ולא שייך לשפה העיצובית שלנו). */
  var waIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.3A8.5 8.5 0 1 1 20.5 11.6z"/><path d="M8.8 9.1c0 3 2.4 5.4 5.3 5.4l.9-1.4-1.8-.8-.8.8a4 4 0 0 1-1.9-1.9l.8-.8-.8-1.8z"/></svg>';

  /* פותח את וואטסאפ עם טקסט מוכן. wa.me הוא הקישור הרשמי והוא עובד גם
     בנייד (אפליקציה) וגם בדסקטופ (WhatsApp Web) — בלי SDK ובלי תלות. */
  function shareToWhatsApp(text) {
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener");
  }

  function mineCardHTML(r) {
    var s = new Date(r.start), e = new Date(r.end);
    var ds = s.getFullYear() + "-" + pad2(s.getMonth() + 1) + "-" + pad2(s.getDate());
    var timeRange = pad2(s.getHours()) + ":" + pad2(s.getMinutes()) + "–" + pad2(e.getHours()) + ":" + pad2(e.getMinutes());
    var pill = r.status === "pending"
      ? '<span class="rs-pill rs-pill--warn">' + clockIcon + 'ממתין לאישור מנהל</span>'
      : '<span class="rs-pill rs-pill--ok">' + checkIcon + 'מאושר</span>';
    /* שיתוף בוואטסאפ (2026-08-27) — רק על שריון *מאושר*. שיתוף של שריון
       שעדיין ממתין לאישור הוא הבטחה שאולי לא תתקיים, וזה בדיוק סוג ההודעה
       שגורמת לאנשים להגיע למועדון נעול. */
    var shareBtn = "";
    if (r.status !== "pending") {
      var msg = "אישרו לנו את מועדון השיכון — " + dateLabel(ds) + ", בשעות " + timeRange +
        (r.note ? " (" + r.note + ")" : "") + ".";
      shareBtn = '<button type="button" class="rs-ghost" data-share="' + CBA.esc(msg) + '">' +
        waIcon + ' שיתוף</button>';
    }
    return (
      '<div class="card rq">' +
        '<div class="rq__top">' +
          '<div><div class="rq__sup">' + CBA.esc(dateLabel(ds)) + '</div>' +
            '<div class="rq__desc">' + timeRange + (r.note ? " · " + CBA.esc(r.note) : "") + '</div></div>' +
          pill +
        '</div>' +
        '<div class="rq__foot">' +
          '<span class="rq__date"></span>' +
          shareBtn +
          '<button type="button" class="rs-ghost rs-ghost--danger" data-cancel="' + CBA.esc(r.id) + '">' + xIcon + ' ביטול</button>' +
        '</div>' +
      '</div>'
    );
  }

  /* ==== "שכנים" — ספריית קהילה ציבורית (2026-08-07) ====
     מדריך תושבים מוגבל: מספר בית, משפחה, שמות פרטיים, טלפון/ים, שמות ילדים.
     גלוי לכל תושב מחובר. הנתונים מגיעים מ-CBA.data.getCommunityDirectory
     (שרת: handleCommunityDirectory_ ב-Code.gs) — פונקציה נפרדת מזו שמשמשת
     בוררי-תושב במסכי הניהול (residentDirectory: שם+בית בלבד, מנהלים בלבד).
     זיהוי עמודות לפי הכלה בכותרת (לא שם קבוע), כדי לשרוד שינויים קלים בגיליון. */
  function dirCols(rows) {
    var keys = {};
    rows.forEach(function (r) { Object.keys(r).forEach(function (k) { keys[k] = true; }); });
    var c = { house: null, family: null, firstName: [], phone: [], kids: null, status: null, rid: null };
    Object.keys(keys).forEach(function (k) {
      var t = k.trim();
      if (t.indexOf("שם פרטי") !== -1) c.firstName.push(k);
      else if (t.indexOf("משפחה") !== -1) c.family = k;
      else if (t.indexOf("בית") !== -1) c.house = k;
      else if (t.indexOf("טלפון") !== -1) c.phone.push(k);
      else if (t.indexOf("ילדים") !== -1) c.kids = k;
      else if (t.indexOf("סטטוס") !== -1) c.status = k;
      else if (t.indexOf("מזהה קבוע") !== -1) c.rid = k; // לצורך התאמת "תפקיד בוועד" (ר' dirRoleFor)
    });
    c.firstName.sort(); c.phone.sort();
    return c;
  }
  function dirVal(row, key) { return key ? String(row[key] == null ? "" : row[key]).trim() : ""; }
  function dirIsActive(row, c) { var s = dirVal(row, c.status); return !s || s.indexOf("פעיל") !== -1; }

  function dirHouseHTML(row, c) {
    var house = dirVal(row, c.house) || "—";
    var fam = dirVal(row, c.family) || "משק בית";
    var rid = dirVal(row, c.rid);
    var nameParts = c.firstName.map(function (k) { return dirVal(row, k); }).filter(Boolean);
    var names = nameParts.join(" ו");
    var phones = c.phone.map(function (k) { return dirVal(row, k); }).filter(Boolean);
    var kids = dirVal(row, c.kids);
    // חיווי "תפקיד בוועד" (סעיף 5) — מואפר, לקריאה בלבד; אם יש כמה שמות בבית
    // מציינים לאיזה מהם שייך התפקיד ("שם — תפקיד"), אם שם אחד בלבד מספיק
    // להציג את התפקיד לבד.
    var roleLines = nameParts.map(function (fn) {
      var role = dirRoleFor(fn, fam, rid);
      if (!role) return "";
      return CBA.esc(nameParts.length > 1 ? (fn + " — " + role) : role);
    }).filter(Boolean);
    return (
      '<div class="card dir-card">' +
        '<div class="dir-card__house">בית ' + CBA.esc(house) + '</div>' +
        '<div class="dir-card__fam">משפחת ' + CBA.esc(fam) +
          (names ? ' <span class="dir-card__names">(' + CBA.esc(names) + ')</span>' : '') + '</div>' +
        (roleLines.length ? '<div class="dir-card__role" title="תפקיד בוועד השיכון — עריכה רק דרך עץ הוועד">' + roleIcon + roleLines.join(" · ") + '</div>' : '') +
        (kids ? '<div class="dir-card__kids">' + kidsIcon + CBA.esc(kids) + '</div>' : '') +
        (phones.length
          ? '<div class="dir-card__phones">' + phones.map(function (p) {
              return '<a class="dir-phone" href="tel:' + CBA.esc(p.replace(/[^\d+]/g, "")) + '">' + phoneIcon + CBA.esc(p) + '</a>';
            }).join('') + '</div>'
          : '') +
      '</div>'
    );
  }

  // (2026-08-09) מצב מתמשך במקום משתנים מקומיים שנוצרים מחדש בכל render() —
  // בלי זה, כל רענון רקע (גם כזה שלא קשור בכלל למדריך התושבים — טביעת
  // האצבע שמפעילה רענון היא גלובלית, ר' מדיניות רענון נתונים) היה שולף
  // שוב את כל המדריך מהרשת, מהבהב "טוען…", ומאפס את החיפוש שהתושב הקליד.
  // אותה תבנית בדיוק כמו resState ב-residents.js.
  var dirState = { loaded: false, loading: false, rows: [], cols: null, q: "" };
  var dirScrollY = 0;
  var dirContainer = null;   // ה-container החי האחרון — לא סומכים על רפרנס-DOM שנתפס

  // חיווי "תפקיד בוועד" בכרטיס הבית ברשימת "תושבי השיכון" (2026-08-10, לבקשת
  // יועד — סעיף 5). מטמון נפרד מ-dirState (נטען פעם אחת, לא תלוי בחיפוש/
  // רענון של המדריך), נבנה מ-CBA.data.getCommitteeTree ישירות (לא דרך
  // CBA.committee.buildBoxes — כאן צריך שורה-לפי-אדם, לא תא מאוחד). התאמה בין
  // תושב לתפקיד היא "best effort": קודם שם מלא מדויק ("פרטי משפחה", כמו
  // שה-autocomplete בעץ מזין), אחר-כך שם פרטי בלבד, ולבסוף מזהה תושב (rid)
  // רק אם יש אדם יחיד עם אותו rid בבית (כדי לא לייחס תפקיד לבן/בת הזוג הלא
  // נכון/ה). זה חיווי בלבד — לא ניתן לעריכה כאן, עריכה רק דרך עץ הוועד.
  var dirRoleIndex = null;
  var dirRoleLoading = false;
  function buildDirRoleIndex(rows) {
    var byLabel = {}, byFirst = {}, byRid = {};
    (rows || []).forEach(function (r) {
      var role = String(r["תפקיד"] || "").trim();
      var name = String(r["שם"] || "").trim();
      var rid = String(r["מזהה תושב"] || "").trim();
      if (!role || !name) return;
      (byLabel[name] = byLabel[name] || []).push(role);
      var first = name.split(" ")[0];
      if (first) (byFirst[first] = byFirst[first] || []).push(role);
      if (rid) (byRid[rid] = byRid[rid] || []).push({ name: name, role: role });
    });
    return { byLabel: byLabel, byFirst: byFirst, byRid: byRid };
  }
  function dirRoleFor(fn, fam, rid) {
    if (!dirRoleIndex || !fn) return "";
    var label = fn + " " + fam;
    if (dirRoleIndex.byLabel[label]) return dirRoleIndex.byLabel[label][0];
    if (dirRoleIndex.byFirst[fn]) return dirRoleIndex.byFirst[fn][0];
    if (rid && dirRoleIndex.byRid[rid] && dirRoleIndex.byRid[rid].length === 1) return dirRoleIndex.byRid[rid][0].role;
    return "";
  }
  function ensureDirRoleIndex() {
    if (dirRoleIndex || dirRoleLoading) return;
    dirRoleLoading = true;
    CBA.data.getCommitteeTree(function (res) {
      dirRoleLoading = false;
      dirRoleIndex = buildDirRoleIndex(res && res.ok ? res.rows : []);
      dirRenderList();
    });
  }
                              // ברגע קריאה ל-render() אחת, כי קריאה חדשה (רענון רקע
                              // נוסף שמגיע לפני שהראשונה סיימה לטעון) בונה DOM חדש,
                              // וה-callback של הבקשה הישנה חייב לכתוב לתוך ה-DOM
                              // *הנוכחי*, לא לתוך אלמנט "יתום" מרענון קודם.

  function dirRenderList() {
    var listEl = dirContainer && dirContainer.querySelector("#dir-list");
    if (!listEl || !dirState.cols) return;
    var c = dirState.cols;
    var q = dirState.q.trim();
    var rows = dirState.rows.filter(function (r) { return dirIsActive(r, c); });
    if (q) {
      rows = rows.filter(function (r) {
        var hay = [dirVal(r, c.house), dirVal(r, c.family), dirVal(r, c.kids)]
          .concat(c.firstName.map(function (k) { return dirVal(r, k); }))
          .concat(c.phone.map(function (k) { return dirVal(r, k); }))
          .join(" ");
        return hay.indexOf(q) !== -1;
      });
    }
    rows.sort(function (a, b) {
      var ha = parseFloat(dirVal(a, c.house)), hb = parseFloat(dirVal(b, c.house));
      if (isNaN(ha)) ha = Infinity;
      if (isNaN(hb)) hb = Infinity;
      return ha - hb;
    });
    /* (2026-08-19, ממצא 2.7 בדו"ח הבדיקה) קודם זו הייתה רשימה אחת רצופה —
       נמדד: 6,000 פיקסלים בדסקטופ ו-11,250 במובייל, 71 כרטיסים ברצף, בלי
       קיבוץ, בלי אינדקס ובלי שום נקודת התמצאות חוץ משדה חיפוש אחד. עכשיו
       הכרטיסים מקובצים לפי "מאה" של מספר הבית — שזה בדיוק החלוקה לשורות
       הבתים בשיכון (101-107, 201-207 וכו') — עם כותרת דביקה לכל קבוצה
       ושורת קיצור למעלה שקופצת ישירות לכל אחת. בזמן חיפוש אין קיבוץ:
       התוצאות ממילא מעטות, וקבוצה עם כרטיס אחד היא רעש. */
    if (!rows.length) {
      listEl.innerHTML = CBA.ui.emptyState({ icon: "search", title: "לא נמצאו שכנים",
        sub: "אפשר לחפש לפי שם משפחה, שם פרטי, מספר בית או טלפון.",
        ctaLabel: "נקה חיפוש", ctaAttr: 'data-dir-clear' });
      var clr = listEl.querySelector("[data-dir-clear]");
      if (clr) clr.addEventListener("click", function () {
        dirState.q = "";
        var qEl = document.getElementById("dir-q");
        if (qEl) { qEl.value = ""; qEl.focus(); }
        dirRenderList();
      });
      if (dirScrollY) { window.scrollTo(0, dirScrollY); dirScrollY = 0; }
      return;
    }
    if (q) {
      listEl.innerHTML = '<div class="dir-count">' + rows.length + ' תוצאות</div>' +
        '<div class="dir-grid">' + rows.map(function (r) { return dirHouseHTML(r, c); }).join("") + '</div>';
      if (dirScrollY) { window.scrollTo(0, dirScrollY); dirScrollY = 0; }
      return;
    }
    var groups = [], byKey = {};
    rows.forEach(function (r) {
      var h = parseInt(String(dirVal(r, c.house)).replace(/\D/g, ""), 10);
      var key = isNaN(h) ? "אחר" : String(Math.floor(h / 100) * 100);
      if (!byKey[key]) { byKey[key] = { key: key, rows: [] }; groups.push(byKey[key]); }
      byKey[key].rows.push(r);
    });
    groups.sort(function (a, b) {
      if (a.key === "אחר") return 1;
      if (b.key === "אחר") return -1;
      return parseInt(a.key, 10) - parseInt(b.key, 10);
    });
    var jump = '<div class="dir-jump">' + groups.map(function (g) {
      return '<button type="button" class="dir-jump__btn" data-dir-jump="' + CBA.esc(g.key) + '">' +
        (g.key === "אחר" ? "אחר" : g.key.slice(0, 1)) + '</button>';
    }).join("") + '</div>';
    listEl.innerHTML = jump + groups.map(function (g) {
      var label = g.key === "אחר" ? "ללא מספר בית" : ("בתים " + g.key + "–" + (parseInt(g.key, 10) + 99));
      return '<div class="dir-group" id="dir-g-' + CBA.esc(g.key) + '">' +
        '<div class="dir-group__head">' + CBA.esc(label) +
          '<span class="dir-group__n">' + g.rows.length + '</span></div>' +
        '<div class="dir-grid">' + g.rows.map(function (r) { return dirHouseHTML(r, c); }).join("") + '</div>' +
      '</div>';
    }).join("");
    listEl.querySelectorAll("[data-dir-jump]").forEach(function (b) {
      b.addEventListener("click", function () {
        var t = listEl.querySelector("#dir-g-" + CSS.escape(b.dataset.dirJump));
        if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    if (dirScrollY) { window.scrollTo(0, dirScrollY); dirScrollY = 0; }
  }

  CBA.screens.resDirectory = {
    render: function (container, opts) {
      dirScrollY = window.scrollY || 0;
      dirContainer = container;
      // רענון רקע שקט: אם כבר טענו פעם, מציירים מהמטמון בלי לפנות לרשת שוב
      // (ר' ההערה למעלה). ניווט אמיתי למסך (לא שקט) תמיד מרענן מהשרת, כדי
      // שהמדריך לא יישאר תקוע ב"טעינה ראשונה" למשך כל הסשן.
      if (!(opts && opts.silent)) dirState.loaded = false;
      ensureDirRoleIndex(); // חיווי "תפקיד בוועד" (סעיף 5) — נטען פעם אחת, מטמון נפרד מ-dirState

      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">שכנים</div>' +
          '<div class="screen-head__sub">מדריך התושבים בשיכון</div></div>' +
        '<input class="dir-search" id="dir-q" placeholder="חיפוש לפי שם, בית או טלפון" value="' + CBA.esc(dirState.q) + '">' +
        '<div id="dir-list">' + CBA.skel.rows(6) + '</div>';

      var qEl = container.querySelector("#dir-q");
      qEl.addEventListener("input", function () {
        dirState.q = qEl.value;
        dirRenderList();
      });

      // כבר נטען פעם קודמת (למשל רענון רקע שקט) — מציירים מיד מהמטמון,
      // בלי לפנות שוב לרשת ובלי הבהוב "טוען…". אם יש כבר בקשה בדרך (loading),
      // לא פותחים בקשה כפולה — ה-callback שלה יכתוב לתוך ה-DOM הנוכחי דרך
      // dirContainer/dirRenderList (לא לתוך רפרנס ישן), כך שהכיסוי תקין גם אם
      // כמה render() רצו בזמן שהבקשה הראשונה עוד לא חזרה.
      if (dirState.loaded) { dirRenderList(); return; }
      if (dirState.loading) return;
      dirState.loading = true;
      CBA.data.getCommunityDirectory(function (res) {
        dirState.loading = false;
        if (!res || !res.ok) {
          var listEl = dirContainer && dirContainer.querySelector("#dir-list");
          if (listEl) listEl.innerHTML = '<div class="rs-empty"><p>' + CBA.esc((res && res.error) || "שגיאה בטעינת הרשימה. נסו שוב מאוחר יותר.") + '</p></div>';
          return;
        }
        dirState.rows = res.rows || [];
        dirState.cols = dirCols(dirState.rows);
        dirState.loaded = true;
        dirRenderList();
      });
    }
  };

  /* ==== "מפת השיכון" — מפה אינטראקטיבית עם שכבת "שטח" מצוירת (2026-08-08, גרסה 6) ====
     נתוני המבנה (מיקומי בתים/כבישים/רחובות/חניונים/מבני ציבור/עצים) נמדדו/כוילו מול
     תצלומי אוויר של השיכון ונשמרים כאן כקבועים סטטיים — הם לא משתנים. מה שכן דינמי
     (שם משפחה/טלפון/ילדים לכל בית) נשלף בכל טעינה מ-CBA.data.getCommunityDirectory
     ומוצג דרך אותן dirCols/dirVal/dirHouseHTML שמזינות את טאב "שכנים" — כך שכרטיס
     הבית בפופאפ של המפה זהה בול לכרטיס ברשימה, ואותו כלל פרטיות חל: רק תושבים
     פעילים מוצגים. */
  /* ==== "מפת השיכון" — מנוע גיאומטריה חדש (2026-09-07) ==================
     עד היום כל מיקום כאן נמדד בעין מול תצלום אוויר ונשמר כאחוזים בקוד. זה מה
     שגרם למפה להיראות "מצוירת": הגיאומטריה הייתה משוערת, אורתוגונלית מדי,
     ולא תאמה לא לתשריט ולא לתצ״א.
     מהיום כל הגיאומטריה מגיעה מ-js/data/mapGeo.js — נוצר אוטומטית מקובץ הכיול
     (כלי "כיול מפה") מתוך תצ״א 8192×5288 בקנה מידה 0.1719 מ׳ לפיקסל, מסובב
     ב-23.5° כך שרשת השיכון יושבת ישר. **אין לערוך את הקובץ הזה ביד.**
     מה שדינמי (שם משפחה/ילדים) עדיין נשלף מ-CBA.data.getCommunityDirectory
     ומוצג דרך אותן dirCols/dirVal/dirHouseHTML של טאב "שכנים". */
  /* מספר בית לצורת השוואה — ספרות בלבד. משותף למפה, לחיפוש ולכרטיס הדייר. */
  function normHouse(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }

  var GEO = (window.CBA && CBA.mapGeo) ? CBA.mapGeo
          : { w: 1100, h: 1300, ppm: 1.6, objects: [], canopy: [], trees: [] };
  var MAP_WORLD_W = Math.round(GEO.w), MAP_WORLD_H = Math.round(GEO.h);
  var MAP_PPM = GEO.ppm || 1.6;                 /* פיקסלי־עולם למטר */
  function mapX(p) { return p / 100 * MAP_WORLD_W; }
  function mapY(p) { return p / 100 * MAP_WORLD_H; }
  function m2p(m) { return m * MAP_PPM; }

  /* ---- קטגוריות למרחבים המשותפים: גוון + אייקון ----
     שם המרחב מגיע כמות שהוא מקובץ הכיול, ולכן המיפוי הוא לפי שם. שם שלא מוכר
     מקבל אייקון ברירת מחדל ולא נופל. */
  var POI_CAT = {
    'בריכה':                  ['water','pool'],
    'חדר כושר':               ['sport','gym'],
    'אולם ספורט':             ['sport','hall'],
    'מגרש כדורגל - סינתטי':   ['sport','ball'],
    'מגרש כדור-סל':           ['sport','hoop'],
    'מגרש טניס':              ['sport','tennis'],
    "פארק נינג'ה":            ['sport','flag'],
    'גן שעשועים':             ['kids','slide'],
    'גני ילדים':              ['kids','blocks'],
    'מועדון ילדים':           ['kids','kite'],
    'חדר חוגים':              ['kids','brush'],
    'שקמ"ם':                  ['shop','cart'],
    'איטלקיה':                ['shop','dine'],
    'WeWork':                 ['shop','laptop'],
    'דואר':                   ['civic','mail'],
    'מועדון משפחות':          ['comm','people'],
    'מדשאת מועדון משפחות':    ['comm','grass'],
    'גינת כלבים':             ['pet','paw']
  };
  function poiOf(label) {
    var k = (label || '').trim();
    return POI_CAT[k] || (k.indexOf('חני') === 0 ? ['park2','house'] : ['comm','house']);
  }

  /* ---- טבלת המיכלים — זהה בול לזו שבכלי הכיול ---- */
  var BIN_KINDS = {
    trash:   { shape:'circle', fill:'#3E9B54' },
    recycle: { shape:'circle', fill:'#E08A2B' },
    glass:   { shape:'oval',   fill:'#7A5AA8' },
    carton:  { shape:'square', fill:'#C9463D' },
    ewaste:  { shape:'rect',   fill:'#E3CE63' },
    bulky:   { shape:'rect',   fill:'#2F7D46' },
    garden:  { shape:'rect',   fill:'#D8C24F', dash:1 }
  };
  var BUS_GLYPH =
    '<rect x="5" y="3.6" width="14" height="13.4" rx="2.6" fill="#fff"/>' +
    '<rect x="6.6" y="5.6" width="10.8" height="4.6" rx="1" fill="#3A73B8"/>' +
    '<rect x="6.6" y="12.2" width="3.2" height="2.2" rx=".8" fill="#3A73B8"/>' +
    '<rect x="14.2" y="12.2" width="3.2" height="2.2" rx=".8" fill="#3A73B8"/>' +
    '<circle cx="8.4" cy="18.6" r="1.7" fill="#fff"/>' +
    '<circle cx="15.6" cy="18.6" r="1.7" fill="#fff"/>';

  /* ---- MAP_TILES: משבצת לכל מספר בית ----
     נשמר באחוזי־עולם בדיוק כמו במפה הישנה, כדי שהחיפוש, goToHouse, "הבית שלי"
     וטבעת הפעימה ימשיכו לעבוד בלי שינוי. בית דו־משפחתי מתפצל לשתי משבצות —
     גוף אחד במפה, שני מספרים ללחיצה. */
  var MAP_TILES = (function () {
    var out = [];
    (GEO.objects || []).forEach(function (o) {
      if (o.t !== 'house') return;
      var a = (o.r || 0) * Math.PI / 180, ux = Math.cos(a), uy = Math.sin(a);
      var vert = Math.abs((((o.r || 0) % 180) + 180) % 180 - 90) < 45;
      function put(num, cx, cy, w, h) {
        if (!num) return;
        var fw = vert ? h : w, fh = vert ? w : h;
        out.push({ n: String(num).trim(),
          x: (cx - fw / 2) / MAP_WORLD_W * 100, y: (cy - fh / 2) / MAP_WORLD_H * 100,
          w: fw / MAP_WORLD_W * 100, h: fh / MAP_WORLD_H * 100 });
      }
      if (o.duo) {
        put(o.l,  o.x - ux * o.w / 4, o.y - uy * o.w / 4, o.w / 2, o.h);
        put(o.l2, o.x + ux * o.w / 4, o.y + uy * o.w / 4, o.w / 2, o.h);
      } else {
        put(o.l, o.x, o.y, o.w, o.h);
      }
    });
    return out;
  })();

  /* ---------------------------------------------------------------------------
   *  המפה כרכיב לשימוש חוזר (2026-09-07, צעד 2 של מודול הגינון)
   * ---------------------------------------------------------------------------
   *  עד היום המפה הייתה *מסך* של אזור התושב בלבד. מודול הגינון צריך אותה בשלושה
   *  מקומות שונים — דיווח התושב (נעיצת נקודה), מסך צוות הגינון ולוח הבקרה — ולכן
   *  היא הופכת כאן לפונקציה שאפשר לקרוא לה עם אפשרויות. **הציור, מנוע התנועה,
   *  החיפוש והפופאפ לא השתנו כהוא זה** — רק נעטפו.
   *
   *  שתי דרישות שהכתיבו את ה-API:
   *  • למשתמש חיצוני (קבלן הגינון) אין אזור תושב, ולכן גם אין לו את המסך הזה —
   *    הוא מקבל את אותה מפה בדיוק מתוך מסך הגינון, אבל עם popup:false כדי שלא
   *    יראה את כרטיס המשפחה. ר' EXTERNAL_HEADER ב-Code.gs.
   *  • נעיצה מחזירה קואורדינטות **מנורמלות 0–1** ולא פיקסלים ולא אחוזי-עולם,
   *    כי מפת השיכון עומדת לפני בנייה מחדש (map-geo.json) וכל הגיאומטריה הנוכחית
   *    תימחק. ערך מנורמל הופך את המעבר להמרה חד-פעמית במקום הזנה מחדש של כל
   *    הדיווחים שנצברו. **לא לשנות ליחידות אחרות.**
   *
   *  אפשרויות: head/search/legend/hint (בוליאני, ברירת מחדל true) · popup
   *  (true=כרטיס דיירים, false=בלי, פונקציה=HTML משלך) · pin (מצב נעיצה) ·
   *  pinAt {x,y} · onPin(fn) · markers [{id,x,y,cls,title}] · onMarker(fn).
   *  מחזירה ידית: {setMarkers, setPin, getPin, goToHouse, fit}.
   * ------------------------------------------------------------------------- */
  CBA.map = {
    render: function (container, opts) {
      opts = opts || {};
      function optOn(v) { return v !== false; }
      var oHead = optOn(opts.head), oSearch = optOn(opts.search),
          oLegend = optOn(opts.legend), oHint = optOn(opts.hint);
      container.innerHTML =
        (oHead ? '<div class="screen-head"><div class="screen-head__title">מפת השיכון</div>' +
          '<div class="screen-head__sub">שיכון פלמחים · לחצו על בית לפרטי הדיירים</div></div>' : '') +
        '<div class="map-shell' + (opts.pin ? ' is-pinning' : '') + (opts.full ? ' map-shell--full' : '') + '">' +
          (oSearch || oLegend ?
            '<div class="map-topbar">' +
              (oSearch ?
                '<div class="map-search-wrap">' +
                  '<span class="map-search-ic">' + searchIcon + '</span>' +
                  '<input id="map-q" class="map-search" placeholder="חיפוש לפי מספר בית, שם משפחה או ילד…" autocomplete="off">' +
                  '<div class="map-search-results" id="map-results"></div>' +
                '</div>'
              : '') +
              (oLegend ?
                '<button type="button" class="map-legend-toggle" id="map-legend-toggle" aria-label="מקרא">?</button>' +
                '<div class="map-legend" id="map-legend">' +
                  '<i><b class="lg-house"></b>בית</i>' +
                  '<i><b class="lg-amen"></b>מבנה ציבור</i>' +
                  '<i><b class="lg-park"></b>חניון</i>' +
                  '<i><b class="lg-road"></b>כביש</i>' +
                '</div>'
              : '') +
            '</div>'
          : '') +
          (opts.full ? '<div class="map-chipbar" id="map-chips" role="group" aria-label="הבלטה"></div>' : '') +
          '<div class="map-viewport" id="map-viewport"><div class="map-world" id="map-world"></div></div>' +
          '<div class="map-toolbar">' +
            '<button type="button" class="map-btn" id="map-zoom-in" aria-label="הגדלה">' + plusIcon + '</button>' +
            '<button type="button" class="map-btn" id="map-zoom-out" aria-label="הקטנה">' + minusIcon + '</button>' +
            '<hr>' +
            '<button type="button" class="map-btn" id="map-fit" aria-label="התאמה למסך">' + fitIcon + '</button>' +
            (opts.full ? '<hr>' +
              '<button type="button" class="map-btn" id="map-clean" aria-pressed="false" ' +
              'aria-label="מצב נקי לצילום מסך" title="מצב נקי — גיאומטריה ומספרי בתים בלבד, לצילום מסך">' +
              cameraIcon + '</button>' : '') +
          '</div>' +
          (oHint ? '<div class="map-hint">' +
            (opts.pin ? 'גררו כדי לנוע · גלגלת/צביטה כדי לזום · <b>לחצו על המקום שבו נמצאת התקלה</b>'
                      : 'גררו כדי לנוע · גלגלת/צביטה כדי לזום · לחצו על בית לפרטים') +
          '</div>' : '') +
        '</div>';

      var viewport = container.querySelector("#map-viewport");
      var worldEl = container.querySelector("#map-world");
      var qEl = container.querySelector("#map-q");
      var resultsEl = container.querySelector("#map-results");

      worldEl.style.width = MAP_WORLD_W + "px";
      worldEl.style.height = MAP_WORLD_H + "px";

      function px(p) { return mapX(p); }
      function py(p) { return mapY(p); }

      /* ================= שכבת הבסיס — SVG אחד ================= */
      (function drawBase() {
        function E(n, a, inner) {
          var s = '<' + n;
          for (var k in a) if (a[k] !== null && a[k] !== undefined) s += ' ' + k + '="' + a[k] + '"';
          return inner === undefined ? s + '/>' : s + '>' + inner + '</' + n + '>';
        }
        function poly(p, close) {
          if (!p || !p.length) return '';
          var d = 'M' + p[0][0] + ' ' + p[0][1];
          for (var i = 1; i < p.length; i++) d += 'L' + p[i][0] + ' ' + p[i][1];
          return close ? d + 'Z' : d;
        }
        /* Catmull-Rom -> בזייה, לקווים שסומנו כמעוגלים בכלי הכיול */
        function smooth(p) {
          if (p.length < 3) return poly(p, false);
          var d = 'M' + p[0][0] + ' ' + p[0][1];
          for (var i = 0; i < p.length - 1; i++) {
            var p0 = p[i ? i - 1 : 0], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
            d += 'C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ',' +
                 (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ',' +
                 p2[0] + ' ' + p2[1];
          }
          return d;
        }
        function rectAt(o, w, h, cls, rx) {
          return E('rect', { x: (-w / 2).toFixed(1), y: (-h / 2).toFixed(1),
            width: w.toFixed(1), height: h.toFixed(1), rx: (rx === undefined ? m2p(0.7) : rx).toFixed(1),
            transform: 'translate(' + o.x + ' ' + o.y + ') rotate(' + (o.r || 0) + ')', 'class': cls });
        }

        var canopy = '', green = '', caseS = '', fillS = '', isl = '', tree = '',
            bays = '', stre = '', pub = '', mkBin = '', mkShel = '', mkBus = '';

        /* קצה של קו שנכנס לקו אחר או לשטח מרוצף — נשאר חתוך ישר, כך שהצומת
           נסגר חלק. קצה שלא מוביל לשום מקום מקבל עיגול. אותה לוגיקה בדיוק
           כמו בכלי הכיול. */
        var LINES = (GEO.objects || []).filter(function (o) { return o.s === 'line' && o.t !== 'street'; });
        var PAVED = (GEO.objects || []).filter(function (o) {
          return o.t === 'parking' || o.t === 'plaza' || o.s === 'circle'; });
        function dSeg(q, A, B) {
          var vx = B[0] - A[0], vy = B[1] - A[1], L = vx * vx + vy * vy || 1;
          var t = Math.max(0, Math.min(1, ((q[0] - A[0]) * vx + (q[1] - A[1]) * vy) / L));
          return Math.hypot(q[0] - A[0] - vx * t, q[1] - A[1] - vy * t);
        }
        function rectCorners(o) {
          var a = (o.r || 0) * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a), w = o.w / 2, h = o.h / 2;
          return [[-w, -h], [w, -h], [w, h], [-w, h]].map(function (p) {
            return [o.x + p[0] * c - p[1] * sn, o.y + p[0] * sn + p[1] * c]; });
        }
        function inPoly(p, poly) {
          var ins = false, n = poly.length;
          for (var i = 0; i < n; i++) {
            var A = poly[i], B = poly[(i + 1) % n];
            if ((A[1] > p[1]) !== (B[1] > p[1])) {
              var xi = A[0] + (p[1] - A[1]) * (B[0] - A[0]) / (B[1] - A[1]);
              if (p[0] < xi) ins = !ins;
            }
          }
          return ins;
        }
        function endFree(o, p) {
          var tol = m2p(1.6), i, k;
          for (i = 0; i < LINES.length; i++) {
            var t = LINES[i]; if (t === o) continue;
            for (k = 0; k < t.p.length - 1; k++) if (dSeg(p, t.p[k], t.p[k + 1]) < tol) return false;
          }
          for (i = 0; i < PAVED.length; i++) {
            var q = PAVED[i];
            if (q.s === 'circle') { if (Math.hypot(p[0] - q.x, p[1] - q.y) < q.rad + tol) return false; continue; }
            var poly = q.p || rectCorners(q);
            if (inPoly(p, poly)) return false;
            for (k = 0; k < poly.length; k++) if (dSeg(p, poly[k], poly[(k + 1) % poly.length]) < tol) return false;
          }
          return true;
        }

        (GEO.canopy || []).forEach(function (p) { canopy += E('path', { d: poly(p, true), 'class': 'm2-canopy' }); });
        (GEO.trees || []).forEach(function (t) { tree += E('circle', { cx: t[0], cy: t[1], r: t[2], 'class': 'm2-tree' }); });

        /* סימוני חנייה: תא 2.5×5 מ׳, שורה אחת או שתיים לפי רוחב החניון */
        function bayLines(o, w, h) {
          var BW = m2p(2.5), BD = m2p(5), AI = m2p(3);
          var horiz = w >= h, L = horiz ? w : h, W = horiz ? h : w;
          if (L < 3 * BW || W < BD) return '';
          var rows = W >= 2 * BD + AI ? [-1, 1] : [-1];
          var n = Math.floor(L / BW), off = (L - n * BW) / 2, d = '';
          rows.forEach(function (s) {
            var y0 = s * W / 2, y1 = y0 - s * BD, i, x;
            for (i = 0; i <= n; i++) {
              x = -L / 2 + off + i * BW;
              d += horiz ? 'M' + x.toFixed(1) + ' ' + y0.toFixed(1) + 'V' + y1.toFixed(1)
                         : 'M' + y0.toFixed(1) + ' ' + x.toFixed(1) + 'H' + y1.toFixed(1);
            }
            d += horiz ? 'M' + (-L / 2 + off).toFixed(1) + ' ' + y1.toFixed(1) + 'H' + (-L / 2 + off + n * BW).toFixed(1)
                       : 'M' + y1.toFixed(1) + ' ' + (-L / 2 + off).toFixed(1) + 'V' + (-L / 2 + off + n * BW).toFixed(1);
          });
          return E('path', { d: d, 'class': 'm2-bay',
            transform: 'translate(' + o.x + ' ' + o.y + ') rotate(' + (o.r || 0) + ')' });
        }

        function markerG(o, inner, rot, grp) {
          var mn = 13;                                   /* מינימום פיקסלי־עולם */
          var s = Math.max(1, mn / Math.max(4, Math.min(o.w, o.h)));
          var r = rot === undefined ? (o.r || 0) : rot;
          return E('g', { 'class': 'm2-mk', 'data-x': o.x, 'data-y': o.y, 'data-r': r,
            'data-s': s.toFixed(3), 'data-g2': grp,
            transform: 'translate(' + o.x + ' ' + o.y + ') rotate(' + r + ') scale(' + s.toFixed(3) + ')' }, inner);
        }

        (GEO.objects || []).forEach(function (o) {
          if (o.t === 'house') return;                   /* בתים הם DIV, ר' למטה */
          if (o.s === 'poly') {
            if (o.t === 'green') green += E('path', { d: poly(o.p, true), 'class': 'm2-green' });
            else if (o.t === 'parking' || o.t === 'plaza') {
              var pz = o.t === 'plaza' ? ' is-path' : '';
              caseS += E('path', { d: poly(o.p, true), 'class': 'm2-casef' + pz, 'stroke-width': m2p(1.8).toFixed(1) });
              fillS += E('path', { d: poly(o.p, true), 'class': 'm2-fillf' + pz });
            } else pub += E('path', { d: poly(o.p, true), 'class': 'm2-pub' });
            return;
          }
          if (o.s === 'circle') {                        /* כיכר */
            caseS += E('circle', { cx: o.x, cy: o.y, r: (o.rad + m2p(0.9)).toFixed(1), 'class': 'm2-casef' });
            fillS += E('circle', { cx: o.x, cy: o.y, r: o.rad, 'class': 'm2-fillf' });
            isl   += E('circle', { cx: o.x, cy: o.y, r: (o.rad * (o.isl || 0.45)).toFixed(1), 'class': 'm2-green' });
            return;
          }
          if (o.s === 'line') {
            if (o.t === 'street') {                      /* סימון רחוב — לא אספלט */
              stre += E('path', { d: o.c ? smooth(o.p) : poly(o.p, false), 'class': 'm2-stdash',
                style: 'stroke-dasharray:' + m2p(3.6).toFixed(0) + ' ' + m2p(3).toFixed(0) });
              var q = o.p, tot = 0, seg = [], i;
              for (i = 1; i < q.length; i++) { var L = Math.hypot(q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]); seg.push(L); tot += L; }
              var half = tot / 2, acc = 0, mid = q[0], ang = 0;
              for (i = 0; i < seg.length; i++) {
                if (acc + seg[i] >= half) {
                  var tt = (half - acc) / (seg[i] || 1), A = q[i], B = q[i + 1];
                  mid = [A[0] + (B[0] - A[0]) * tt, A[1] + (B[1] - A[1]) * tt];
                  ang = Math.atan2(B[1] - A[1], B[0] - A[0]) * 180 / Math.PI; break;
                }
                acc += seg[i];
              }
              if (ang > 90 || ang < -90) ang += 180;
              var nm = o.l || '', wch = nm.length * 7.2 + 20;
              if (nm) stre += E('g', { 'class': 'm2-stq',
                  'data-x': mid[0].toFixed(1), 'data-y': mid[1].toFixed(1), 'data-a': ang.toFixed(1),
                  transform: 'translate(' + mid[0].toFixed(1) + ' ' + mid[1].toFixed(1) + ') rotate(' + ang.toFixed(1) + ')' },
                E('rect', { x: (-wch / 2).toFixed(1), y: -9.5, width: wch.toFixed(1), height: 19, rx: 9.5 }) +
                E('text', { x: 0, y: 1 }, CBA.esc(nm)));
              return;
            }
            var isPath = o.t === 'path';
            var d = o.c ? smooth(o.p) : poly(o.p, false);
            var cw = o.w + 2 * m2p(isPath ? 0.35 : 0.9);
            caseS += E('path', { d: d, 'class': 'm2-case' + (isPath ? ' is-path' : ''), 'stroke-width': cw.toFixed(1) });
            fillS += E('path', { d: d, 'class': 'm2-fill' + (isPath ? ' is-path' : ''), 'stroke-width': o.w });
            [o.p[0], o.p[o.p.length - 1]].forEach(function (e2) {
              if (!endFree(o, e2)) return;
              caseS += E('circle', { cx: e2[0], cy: e2[1], r: (cw / 2).toFixed(1),
                'class': 'm2-casef' + (isPath ? ' is-path' : '') });
              fillS += E('circle', { cx: e2[0], cy: e2[1], r: (o.w / 2).toFixed(1),
                'class': 'm2-fillf' + (isPath ? ' is-path' : '') });
            });
            return;
          }
          /* rect */
          if (o.t === 'plaza') {
            caseS += rectAt(o, o.w + m2p(1.8), o.h + m2p(1.8), 'm2-casef is-path', 4);
            fillS += rectAt(o, o.w, o.h, 'm2-fillf is-path', 4);
          } else if (o.t === 'parking') {
            caseS += rectAt(o, o.w + m2p(1.8), o.h + m2p(1.8), 'm2-casef', 4);
            fillS += rectAt(o, o.w, o.h, 'm2-fillf', 4);
            bays  += bayLines(o, o.w, o.h);
          } else if (o.t === 'green') {
            green += rectAt(o, o.w, o.h, 'm2-green', 4);
          } else if (o.t === 'shelter') {
            mkShel += markerG(o,
              E('rect', { x: (-o.w / 2).toFixed(1), y: (-o.h / 2).toFixed(1), width: o.w, height: o.h,
                rx: (Math.min(o.w, o.h) * 0.12).toFixed(1), 'class': 'm2-shelter' }) +
              E('rect', { x: (-o.w * 0.28).toFixed(1), y: (-o.h * 0.28).toFixed(1),
                width: (o.w * 0.56).toFixed(1), height: (o.h * 0.56).toFixed(1),
                rx: (Math.min(o.w, o.h) * 0.11).toFixed(1), 'class': 'm2-shelter-in' }), undefined, 'shelter');
          } else if (o.t === 'bus') {
            var sq = Math.min(o.w, o.h);
            mkBus += markerG(o,
              E('rect', { x: (-sq / 2).toFixed(1), y: (-sq / 2).toFixed(1), width: sq, height: sq,
                rx: (sq * 0.22).toFixed(1), 'class': 'm2-bus' }) +
              E('g', { transform: 'translate(' + (-sq * 0.31).toFixed(1) + ' ' + (-sq * 0.31).toFixed(1) +
                ') scale(' + (sq * 0.62 / 24).toFixed(4) + ')' }, BUS_GLYPH), 0, 'traffic');
          } else if (o.t === 'bin') {
            var K = BIN_KINDS[o.k] || BIN_KINDS.trash, inner;
            if (K.shape === 'circle') inner = E('circle', { cx: 0, cy: 0, r: (Math.min(o.w, o.h) / 2).toFixed(1), 'class': 'm2-bin', style: 'fill:' + K.fill });
            else if (K.shape === 'oval') inner = E('ellipse', { cx: 0, cy: 0, rx: (o.w / 2).toFixed(1), ry: (o.h / 2).toFixed(1), 'class': 'm2-bin', style: 'fill:' + K.fill });
            else inner = E('rect', { x: (-o.w / 2).toFixed(1), y: (-o.h / 2).toFixed(1), width: o.w, height: o.h,
                rx: (Math.min(o.w, o.h) * (K.shape === 'square' ? 0.14 : 0.22)).toFixed(1),
                'class': 'm2-bin' + (K.dash ? ' is-dash' : ''), style: 'fill:' + K.fill });
            mkBin += markerG(o, inner, undefined, 'waste');
          } else {
            pub += rectAt(o, o.w, o.h, 'm2-pub', m2p(0.8));
          }
        });

        worldEl.insertAdjacentHTML('afterbegin',
          '<svg class="map-terrain map-base" width="' + MAP_WORLD_W + '" height="' + MAP_WORLD_H +
          '" viewBox="0 0 ' + MAP_WORLD_W + ' ' + MAP_WORLD_H + '" aria-hidden="true">' +
            E('rect', { x: 0, y: 0, width: MAP_WORLD_W, height: MAP_WORLD_H, 'class': 'm2-ground' }) +
            E('g', { 'class': 'm2-l-canopy', 'data-g': 'green' }, canopy) +
            E('g', { 'data-g': 'green' }, green) +
            E('g', { 'class': 'm2-paved', 'data-g': 'traffic' }, E('g', {}, caseS) + E('g', {}, fillS)) +
            E('g', { 'data-g': 'green' }, isl) +
            E('g', { 'class': 'm2-l-tree', 'data-g': 'green' }, tree) +
            E('g', { 'data-g': 'traffic' }, bays) +
            E('g', { 'data-g': 'traffic' }, stre) +
            E('g', { 'data-g': 'public' }, pub) +
            E('g', { 'data-g': 'traffic' }, mkBus) +
            E('g', { 'data-g': 'shelter' }, mkShel) +
            E('g', { 'data-g': 'waste' }, mkBin) +
          '</svg>' +
          '<div class="map-grain"></div>');
      })();

      var poiSeq = 0;

      /* ---- שבב P לכל חניון, ותווית שם אם יש ---- */
      (GEO.objects || []).forEach(function (o) {
        if (o.t !== 'parking') return;
        var c = center(o);
        var el = document.createElement("div");
        el.className = "map-poi map-poi--park";
        el.dataset.g = 'traffic';
        el.style.cssText = "left:" + c[0] + "px;top:" + c[1] + "px";
        el.dataset.a = Math.round(area(o));
        el.innerHTML = '<span class="map-parking__chip">P</span>';
        worldEl.appendChild(el);
        if (o.l) { var id = 'p' + (poiSeq++); el.dataset.lbl = id;
          poiLabel(o.l, c[0], c[1] + 16, area(o), id, 'traffic'); }
      });

      /* ---- שבב + שם לכל מרחב ציבורי ---- */
      (GEO.objects || []).forEach(function (o) {
        if (o.t !== 'public') return;
        var c = center(o), cat = poiOf(o.l);
        var el = document.createElement("div");
        el.className = "map-poi map-poi--" + cat[0];
        el.dataset.g = 'public';
        el.style.cssText = "left:" + c[0] + "px;top:" + c[1] + "px";
        el.dataset.a = Math.round(area(o));
        el.innerHTML = '<span class="map-amenity__chip">' + svg(amenIcons[cat[1]] || amenIcons.house) + '</span>';
        worldEl.appendChild(el);
        if (o.l) { var id2 = 'p' + (poiSeq++); el.dataset.lbl = id2;
          poiLabel(o.l, c[0], c[1] + 16, area(o), id2, 'public'); }
      });

      /* פריסת תוויות: הגדול נכנס ראשון, השאר מנסים חמישה מיקומים ואז נופלים.
         תווית חתוכה או דחוסה גרועה מתווית חסרה. ר' "מערכת ההתנגשויות". */
      /* פריסת שבבים ותוויות — רצה מחדש בכל שינוי זום.
         שני עקרונות שנלקחו מהעבודה על שפת העיצוב:
         1. גודל קבוע על המסך — שבב ותווית לא גדלים עם הזום (ר' --inv).
         2. LOD לפני התנגשות — מרחב קטן מדי על המסך פשוט לא מוצג, במקום
            להיאבק על מקום. מה שנשאר מנסה חמישה מיקומים ואז נופל. */
      var POI = [], POI_LAID = -1;
      function collectPoi() {
        POI = [].slice.call(worldEl.querySelectorAll('.map-poi')).map(function (c) {
          return { c: c, l: c.dataset.lbl ? worldEl.querySelector('[data-for="' + c.dataset.lbl + '"]') : null,
                   a: +c.dataset.a || 0, x: parseFloat(c.style.left), y: parseFloat(c.style.top) };
        }).sort(function (a, b) { return b.a - a.a; });
      }
      /* דרגות הפירוט (2026-09-07, אחרי בדיקה על מכשיר):
         0 — רחוק: סמלילים ומספרי בתים עדינים בלבד.
         1 — בינוני: נוספים שמות מרחבים ושלטי רחוב.
         2 — קרוב: נוסף שם משפחה וחיווי ילדים.
         טקסט במפה הוא רמז, לא כותרת — ולכן הכל קטן ושקט יותר מקודם. */
      function layoutStreets(tier) {
        var inv = 1 / scale;
        [].forEach.call(svg2().querySelectorAll('.m2-stq'), function (g) {
          g.style.display = tier >= 1 ? '' : 'none';
          g.setAttribute('transform', 'translate(' + g.dataset.x + ' ' + g.dataset.y +
            ') rotate(' + g.dataset.a + ') scale(' + inv.toFixed(4) + ')');
        });
      }
      var _svg = null;
      function svg2() { return _svg || (_svg = worldEl.querySelector('.map-base')); }
      function layoutPoi(tier) {
        if (!POI.length) return;
        var inv = 1 / scale, boxes = [];
        worldEl.style.setProperty('--inv', inv.toFixed(4));
        POI.forEach(function (o) {
          var vis = Math.sqrt(o.a) * scale > 30;       /* המבנה גדול מספיק על המסך */
          var forced = EMPH && EMPH.length > 0 && o.l && EMPH.indexOf(o.l.dataset.g) >= 0;
          var lvis = vis && !!o.l && (tier >= 1 || forced);
          o.c.style.display = vis ? '' : 'none';
          if (o.l) o.l.style.display = lvis ? '' : 'none';
          if (!vis) return;
          var cw = (o.c.offsetWidth || 26) * inv, ch = (o.c.offsetHeight || 26) * inv;
          var lw = lvis ? (o.l.offsetWidth || 0) * inv : 0, lh = lvis ? (o.l.offsetHeight || 0) * inv : 0;
          var step = ch + 5 * inv, tries = [0, -step, step, -2 * step, 2 * step, -3 * step], i2;
          for (i2 = 0; i2 < tries.length; i2++) {
            var dy = tries[i2];
            var b1 = { x: o.x - cw / 2, y: o.y + dy - ch / 2, w: cw, h: ch };
            var b2 = lvis ? { x: o.x - lw / 2, y: o.y + dy + ch / 2 + 2 * inv, w: lw, h: lh } : null;
            var hit = boxes.some(function (p2) {
              function ov(b) { return b && !(b.x + b.w < p2.x || p2.x + p2.w < b.x ||
                                             b.y + b.h < p2.y || p2.y + p2.h < b.y); }
              return ov(b1) || ov(b2);
            });
            if (!hit || i2 === tries.length - 1) {
              o.c.style.top = (o.y + dy) + 'px';
              if (lvis) { o.l.style.top = (o.y + dy + ch / 2 + 2 * inv) + 'px'; boxes.push(b2); }
              boxes.push(b1);
              return;
            }
          }
        });
      }

      collectPoi();

      /* ---- מצב הבלטה (2026-09-07) ----
         בחירת קבוצה לא מסתירה כלום — היא מבליטה. כל השאר נסוג ל-24% ומאבד
         רוויה, ולכן נשאר כהקשר במקום להיעלם. הבחירות נערמות. */
      var EMPH = [];
      var shellEl = container.querySelector('.map-shell');
      function layoutMarkers() {
        var sv = svg2(); if (!sv) return;
        [].forEach.call(sv.querySelectorAll('.m2-mk'), function (g) {
          var base = +g.dataset.s || 1;
          var em = (EMPH.length && EMPH.indexOf(g.dataset.g2) >= 0) ? 1.75 : 1;
          g.setAttribute('transform', 'translate(' + g.dataset.x + ' ' + g.dataset.y +
            ') rotate(' + g.dataset.r + ') scale(' + (base * em).toFixed(3) + ')');
        });
      }
      function applyEmph() {
        var on = EMPH.length > 0;
        if (shellEl) shellEl.classList.toggle('foc', on);
        [].forEach.call(worldEl.querySelectorAll('[data-g]'), function (el) {
          el.classList.toggle('is-emph', !on || EMPH.indexOf(el.dataset.g) >= 0);
        });
        layoutMarkers();
      }
      function buildChips() {
        var bar = container.querySelector('#map-chips'); if (!bar) return;
        var GROUPS = [['traffic', 'תנועה וחנייה'], ['public', 'מבני ציבור'], ['homes', 'בתים'],
                      ['green', 'ירק ועצים'], ['waste', 'פינוי אשפה'], ['shelter', 'מיגוניות']];
        var have = {};
        [].forEach.call(worldEl.querySelectorAll('[data-g]'), function (el) { have[el.dataset.g] = 1; });
        bar.innerHTML = GROUPS.filter(function (g) { return have[g[0]]; }).map(function (g) {
          return '<button type="button" class="map-chip" data-e="' + g[0] + '" aria-pressed="false">' + g[1] + '</button>';
        }).join('') + '<button type="button" class="map-chip map-chip--all" data-e="__all">הכול</button>';
        bar.addEventListener('click', function (e) {
          var b = e.target.closest('.map-chip'); if (!b) return;
          if (b.dataset.e === '__all') EMPH = [];
          else { var i = EMPH.indexOf(b.dataset.e); if (i >= 0) EMPH.splice(i, 1); else EMPH.push(b.dataset.e); }
          [].forEach.call(bar.querySelectorAll('.map-chip'), function (x) {
            x.setAttribute('aria-pressed', x.dataset.e !== '__all' && EMPH.indexOf(x.dataset.e) >= 0);
          });
          applyEmph();
        });
      }

      function area(o) {
        if (o.p && o.p.length) {
          var xs = o.p.map(function (p) { return p[0]; }), ys = o.p.map(function (p) { return p[1]; });
          return (Math.max.apply(null, xs) - Math.min.apply(null, xs)) *
                 (Math.max.apply(null, ys) - Math.min.apply(null, ys));
        }
        return (o.w || 0) * (o.h || 0);
      }
      function center(o) {
        if (o.p && o.p.length) {
          var xs = o.p.map(function (p) { return p[0]; }), ys = o.p.map(function (p) { return p[1]; });
          return [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2,
                  (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2];
        }
        return [o.x, o.y];
      }
      function poiLabel(text, x, y, a, id, grp) {
        var lbl = document.createElement("span");
        lbl.className = "map-amenity__label";
        lbl.textContent = text;
        lbl.dataset.a = Math.round(a || 0);
        if (id) lbl.dataset.for = id;
        if (grp) lbl.dataset.g = grp;
        lbl.style.cssText = "left:" + x + "px;top:" + y + "px";
        worldEl.appendChild(lbl);
      }

      // בתים
      // (2026-08-19, ממצא 3.5 בדו"ח) שני דברים שחסרו כאן:
      // 1. "הבית שלי" לא סומן בשום צורה — תושב שנכנס למפה נאלץ לחפש ידנית את
      //    הבית של עצמו, למרות שהמערכת יודעת בדיוק מה מספרו.
      // 2. הבתים היו <div> בלי תפקיד ובלי tabindex — כלומר לא נגישים למקלדת
      //    בכלל: אי-אפשר היה להגיע אליהם ב-Tab או לפתוח ב-Enter.
      var myHouse = normHouse(user().house || user().familyId || "");
      var houseEls = {};
      MAP_TILES.forEach(function (t) {
        var el = document.createElement("div");
        var mine = myHouse && normHouse(t.n) === myHouse;
        el.className = "map-house" + (mine ? " is-mine" : "");
        el.dataset.g = 'homes';
        el.dataset.num = t.n;
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "בית " + t.n + (mine ? " — הבית שלי" : ""));
        el.style.cssText = "left:" + px(t.x) + "px;top:" + py(t.y) + "px;width:" + px(t.w) + "px;height:" + py(t.h) + "px";
        el.innerHTML =
          '<span class="mh-num"><span class="mh-num__ico">' + houseIcon + '</span>' + t.n + '</span>' +
          '<div class="mh-body"><span class="mh-corner">' + t.n + '</span>' +
          '<span class="mh-fam"></span>' +
          '<span class="mh-kids">' + kidsIcon + '</span></div>' +
          (mine ? '<span class="mh-mine">הבית שלי</span>' : "");
        el.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openPopup(t.n); }
        });
        worldEl.appendChild(el);
        houseEls[t.n] = el;
      });

      // ---- נתוני דיירים אמיתיים (זהה למקור הנתונים של טאב "שכנים") ----
      var dirRows = [], dirC = null, byHouse = {};
      CBA.data.getCommunityDirectory(function (res) {
        if (!res || !res.ok) return;
        dirC = dirCols(res.rows || []);
        dirRows = (res.rows || []).filter(function (r) { return dirIsActive(r, dirC); });
        dirRows.forEach(function (r) {
          var h = normHouse(dirVal(r, dirC.house));
          if (h) byHouse[h] = r;
        });
        MAP_TILES.forEach(function (t) {
          var row = byHouse[normHouse(t.n)];
          var el = houseEls[t.n];
          if (!row) { el.classList.add("no-data"); return; }
          el.querySelector(".mh-fam").textContent = dirVal(row, dirC.family) || "";
          if (dirVal(row, dirC.kids)) el.querySelector(".mh-kids").classList.add("has");
        });
      });

      // ---- מנוע תנועה: pan / zoom / pinch, עם שתי דרגות פירוט (שם משפחה -> +ילדים) ----
      var scale = 1, tx = 0, ty = 0, fitScaleVal = 1;
      var MAP_T1 = 1.5, MAP_T2 = 2.6;
      function minScale() { return fitScaleVal; }
      /* רצפה מוחלטת לזום המרבי: במסך צר fitScale קטן, ו-4.5 ממנו הגיע לבית של
         51 פיקסלים בלבד — כלומר במובייל אי-אפשר היה בכלל להגיע לדרגת הפירוט
         שמראה שם משפחה. */
      function maxScale() { return Math.max(fitScaleVal * 4.5, 2.6); }
      function computeFit() {
        var vw = viewport.clientWidth, vh = viewport.clientHeight;
        fitScaleVal = Math.min(vw / MAP_WORLD_W, vh / MAP_WORLD_H) * 0.94;
      }
      function clampPan() {
        var vw = viewport.clientWidth, vh = viewport.clientHeight;
        var worldW = MAP_WORLD_W * scale, worldH = MAP_WORLD_H * scale, margin = 140;
        var minTx = Math.min(vw - worldW - margin, (vw - worldW) / 2);
        var maxTx = Math.max(margin, (vw - worldW) / 2);
        var minTy = Math.min(vh - worldH - margin, (vh - worldH) / 2);
        var maxTy = Math.max(margin, (vh - worldH) / 2);
        tx = Math.max(minTx, Math.min(maxTx, tx));
        ty = Math.max(minTy, Math.min(maxTy, ty));
        /* כשהמפה כולה קטנה מהמסגרת (קורה במובייל בפתיחה, כי ההתאמה היא לרוחב)
           ממרכזים אותה במקום להצמיד לראש ולהשאיר רצועה ריקה למטה. */
        if (worldH < vh) ty = (vh - worldH) / 2;
        if (worldW < vw) tx = (vw - worldW) / 2;
      }
      /* רוחב הבית החציוני בפיקסלי־עולם — הבסיס להחלטה מתי יש מקום לשם משפחה.
         (עד היום הדרגה נקבעה לפי יחס הזום, וזה נשבר ברגע שהבתים קיבלו את
         המידות האמיתיות שלהם: 21 מ׳ במקום קופסה מצוירת.) */
      var MED_TILE = (function () {
        var ws = MAP_TILES.map(function (t) { return mapX(t.w); }).sort(function (a, b) { return a - b; });
        return ws.length ? ws[Math.floor(ws.length / 2)] : 34;
      })();
      var openTile = null, curTier = -1;
      function apply() {
        clampPan();
        worldEl.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
        /* הספים נמדדים ברוחב הבית בפיקסלים על המסך: 46 = יש מקום לשם משפחה
           קצר, 64 = יש מקום גם לחיווי הילדים. (לא יחס זום — יחס נשבר ברגע
           שהבתים קיבלו מידות אמיתיות.) */
        var tw = MED_TILE * scale;
        var tier = tw > 64 ? 2 : (tw > 46 ? 1 : 0);
        if (tier !== curTier) {
          curTier = tier;
          worldEl.classList.toggle("tier1", tier === 1);
          worldEl.classList.toggle("tier2", tier === 2);
        }
        if (Math.abs(scale - POI_LAID) > 0.001) { POI_LAID = scale; layoutPoi(tier); layoutStreets(tier); }
        if (openTile) positionPopup(openTile);
      }
      function fitToScreen(animated) {
        computeFit();
        scale = fitScaleVal;
        tx = (viewport.clientWidth - MAP_WORLD_W * scale) / 2;
        ty = (viewport.clientHeight - MAP_WORLD_H * scale) / 2;
        if (animated) { worldEl.style.transition = "transform .38s cubic-bezier(.2,.6,.2,1)"; setTimeout(function () { worldEl.style.transition = ""; }, 400); }
        apply();
      }
      /* תצוגת פתיחה (2026-08-18, ממצא 3.2 בדו"ח) — קודם המפה נפתחה תמיד
         ב"התאמה למסך" מלאה. במסך רחב זה יצא גרוע פעמיים: השיכון מצויר לגובה
         (1100×1354) בעוד החלון רחב, אז ההתאמה נקבעה לפי הגובה — נמדד: קנה
         מידה 0.457, המפה תפסה 502px מתוך 1315px רוחב (שני שליש שטח ירוק ריק),
         ובקנה המידה הזה אי אפשר היה לקרוא כלום — לא מספרי בתים ולא שמות
         רחובות. עכשיו הפתיחה ממלאת את הרוחב ומיושרת לראש השיכון, וגוררים
         למטה. "התאמה למסך" (⛶) נשאר בדיוק כמו שהיה, למבט-על על כל השכונה. */
      function initialView(animated) {
        computeFit();
        var widthFit = viewport.clientWidth / MAP_WORLD_W;
        // תקרה של 1.25 ולא 1.0: כל המפה מצוירת ב-DOM/SVG (לא תמונה), אז הגדלה
        // מעבר ל-1:1 לא מטשטשת כלום — היא רק מגדילה גם את הטקסט, וזה בדיוק מה
        // שהיה חסר. בלי התקרה מסך רחב מאוד היה מנפח את המפה בלי סוף.
        scale = Math.max(fitScaleVal, Math.min(1.25, widthFit));
        tx = (viewport.clientWidth - MAP_WORLD_W * scale) / 2;
        ty = 0;
        if (animated) { worldEl.style.transition = "transform .38s cubic-bezier(.2,.6,.2,1)"; setTimeout(function () { worldEl.style.transition = ""; }, 400); }
        apply();
      }
      // איזו תצוגה "בתוקף" כרגע — כדי שאירוע שינוי גודל (סיבוב טלפון, שינוי
      // חלון) ישחזר את מה שהמשתמש בחר ולא יזרוק אותו חזרה לברירת מחדל.
      var viewMode = "initial";   // initial | whole | manual
      function setScaleAnchored(newScale, ax, ay, animated) {
        viewMode = "manual";
        newScale = Math.max(minScale(), Math.min(maxScale(), newScale));
        var wx = (ax - tx) / scale, wy = (ay - ty) / scale;
        scale = newScale;
        tx = ax - wx * scale; ty = ay - wy * scale;
        if (animated) { worldEl.style.transition = "transform .28s cubic-bezier(.2,.6,.2,1)"; setTimeout(function () { worldEl.style.transition = ""; }, 300); }
        apply();
      }

      var dragging = false, dragStartX = 0, dragStartY = 0, txStart = 0, tyStart = 0;
      var pointers = {}, pointerCount = 0, pinchDist = null, pinchScale = 1;

      /* iOS Safari מזהה צביטה כזום־דף לפני ש-Pointer Events בכלל מגיעים, וזה מה
         שגרם ל"צביטה משנה את כל המסך". touch-action:none לבדו לא מספיק שם —
         צריך לחסום גם את אירועי ה-gesture הקנייניים. */
      ["gesturestart", "gesturechange", "gestureend"].forEach(function (n) {
        viewport.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false });
      });
      viewport.addEventListener("touchmove", function (e) {
        if (e.touches && e.touches.length > 1) e.preventDefault();
      }, { passive: false });

      viewport.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".map-popup") || e.target.closest(".map-toolbar")) return;
        viewport.setPointerCapture(e.pointerId);
        pointers[e.pointerId] = {x: e.clientX, y: e.clientY}; pointerCount++;
        if (pointerCount === 1) {
          dragging = true; viewport.classList.add("grabbing");
          dragStartX = e.clientX; dragStartY = e.clientY; txStart = tx; tyStart = ty;
        }
      });
      viewport.addEventListener("pointermove", function (e) {
        if (!pointers[e.pointerId]) return;
        pointers[e.pointerId] = {x: e.clientX, y: e.clientY};
        var ids = Object.keys(pointers);
        if (ids.length === 2) {
          var p0 = pointers[ids[0]], p1 = pointers[ids[1]];
          var dist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
          if (!pinchDist) { pinchDist = dist; pinchScale = scale; }
          else {
            var ratio = dist / pinchDist, midX = (p0.x + p1.x) / 2, midY = (p0.y + p1.y) / 2;
            var rect = viewport.getBoundingClientRect();
            setScaleAnchored(pinchScale * ratio, midX - rect.left, midY - rect.top, false);
          }
        } else if (dragging && ids.length === 1) {
          viewMode = "manual";
          tx = txStart + (e.clientX - dragStartX); ty = tyStart + (e.clientY - dragStartY);
          apply();
        }
      });
      function endPointer(e) {
        var wasSingleTap = e.type === "pointerup" && Object.keys(pointers).length === 1 &&
          Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) < 6;
        delete pointers[e.pointerId]; pointerCount = Math.max(0, pointerCount - 1);
        if (Object.keys(pointers).length < 2) pinchDist = null;
        if (Object.keys(pointers).length === 0) { dragging = false; viewport.classList.remove("grabbing"); }
        if (wasSingleTap) {
          var target = document.elementFromPoint(e.clientX, e.clientY);
          var houseEl = target && target.closest(".map-house");
          if (houseEl) openPopup(houseEl.dataset.num);
          else if (!target || (!target.closest(".map-toolbar") && !target.closest(".map-popup"))) closePopup();
        }
      }
      viewport.addEventListener("pointerup", endPointer);
      viewport.addEventListener("pointercancel", function (e) {
        delete pointers[e.pointerId];
        if (Object.keys(pointers).length < 2) pinchDist = null;
        if (Object.keys(pointers).length === 0) { dragging = false; viewport.classList.remove("grabbing"); }
      });
      /* (2026-08-18, ממצא 3.3 בדו"ח) קודם כל אירוע גלגלת מעל המפה עשה
         preventDefault — מי שגלל בעמוד והסמן עבר במקרה מעל המפה, העמוד נעצר
         והמפה התחילה לזום. זו אחת ההתנהגויות הכי מתסכלות במפות מוטמעות.
         עכשיו: זום רק עם Ctrl/⌘ (וגם צביטה במשטח מגע, שהדפדפן שולח עם
         ctrlKey=true) — אחרת העמוד גולל כרגיל, ומוצג רמז קצר. */
      var wheelHintShown = false;
      function showWheelHint() {
        if (wheelHintShown) return;
        wheelHintShown = true;
        var h = document.createElement("div");
        h.className = "map-wheel-hint";
        h.textContent = "להחזיק Ctrl (או ⌘) כדי לזום · או להשתמש בכפתורי + / –";
        viewport.appendChild(h);
        requestAnimationFrame(function () { h.classList.add("show"); });
        setTimeout(function () {
          h.classList.remove("show");
          setTimeout(function () { if (h.parentNode) h.parentNode.removeChild(h); wheelHintShown = false; }, 400);
        }, 2600);
      }
      viewport.addEventListener("wheel", function (e) {
        if (!(e.ctrlKey || e.metaKey)) { showWheelHint(); return; }   // בלי preventDefault — העמוד ממשיך לגלול
        e.preventDefault();
        var rect = viewport.getBoundingClientRect();
        var factor = Math.pow(1.0016, -e.deltaY);
        setScaleAnchored(scale * factor, e.clientX - rect.left, e.clientY - rect.top, false);
      }, {passive: false});

      container.querySelector("#map-zoom-in").addEventListener("click", function () {
        setScaleAnchored(scale * 1.4, viewport.clientWidth / 2, viewport.clientHeight / 2, true);
      });
      container.querySelector("#map-zoom-out").addEventListener("click", function () {
        setScaleAnchored(scale / 1.4, viewport.clientWidth / 2, viewport.clientHeight / 2, true);
      });
      container.querySelector("#map-fit").addEventListener("click", function () { closePopup(); viewMode = "whole"; fitToScreen(true); });

      // עוצרים את עצמנו ברגע שהמסך יצא מה-DOM (המשתמש עבר לטאב אחר) — כדי לא
      // לצבור צופי-שינוי-גודל שמצביעים לרכיבים שכבר לא קיימים.
      var ro = new ResizeObserver(function () {
        if (!document.body.contains(viewport)) { ro.disconnect(); return; }
        // משחזרים את התצוגה שהמשתמש נמצא בה, לא תמיד "התאמה למסך" (ר' viewMode)
        if (viewMode === "whole") fitToScreen(false);
        else if (viewMode === "manual") { computeFit(); apply(); }
        else initialView(false);
      });
      ro.observe(viewport);

      // ---- פופאפ בית — משתמש ב-dirHouseHTML כדי להיות זהה לכרטיס בטאב "שכנים" ----
      var popupEl = null;
      function closePopup() {
        if (popupEl) popupEl.classList.remove("show");
        openTile = null;
        Object.keys(houseEls).forEach(function (n) { houseEls[n].classList.remove("active-tile"); });
      }
      function positionPopup(num) {
        var el = houseEls[num];
        if (!el || !popupEl) return;
        var left = parseFloat(el.style.left) + parseFloat(el.style.width) / 2;
        var top = parseFloat(el.style.top);
        var pxAbs = tx + left * scale, pyAbs = ty + top * scale;
        var popX = pxAbs - 125, popY = pyAbs - 14;
        var vw = viewport.clientWidth;
        if (popX < 10) popX = 10;
        if (popX + 250 > vw - 10) popX = vw - 260;
        if (pyAbs < 220) popY = pyAbs + parseFloat(el.style.height) * scale + 14;
        else popY = pyAbs - popupEl.offsetHeight - 14;
        popupEl.style.left = popX + "px";
        popupEl.style.top = Math.max(10, popY) + "px";
      }
      function openPopup(num) {
        // popup:false — למשתמש חיצוני, שאסור שיראה כרטיסי משפחות. ר' ההערה למעלה.
        if (opts.popup === false) return;
        var el = houseEls[num];
        if (!el) return;
        closePopup();
        el.classList.add("active-tile");
        if (!popupEl) { popupEl = document.createElement("div"); popupEl.className = "map-popup"; viewport.appendChild(popupEl); }
        var row = byHouse[normHouse(num)];
        popupEl.innerHTML = '<button type="button" class="map-popup__close" aria-label="סגור">' + xIcon + '</button>' +
          (typeof opts.popup === 'function'
            ? opts.popup(num, row, dirC)
            : (row && dirC ? dirHouseHTML(row, dirC) : '<div class="card dir-card"><div class="dir-card__house">בית ' + CBA.esc(num) + '</div><div class="dir-card__names">אין נתונים זמינים לבית זה.</div></div>'));
        popupEl.querySelector(".map-popup__close").addEventListener("click", function (ev) { ev.stopPropagation(); closePopup(); });
        openTile = num;
        positionPopup(num);
        requestAnimationFrame(function () { popupEl.classList.add("show"); });
        var ring = document.createElement("div");
        ring.className = "map-pulse";
        ring.style.left = el.style.left; ring.style.top = el.style.top;
        ring.style.width = el.style.width; ring.style.height = el.style.height;
        worldEl.appendChild(ring);
        setTimeout(function () { ring.remove(); }, 2300);
      }

      // ---- חיפוש ----
      function runSearch(q) {
        q = q.trim();
        if (!q) { resultsEl.classList.remove("show"); return; }
        var matches = MAP_TILES.filter(function (t) {
          if (t.n.indexOf(q) !== -1) return true;
          var row = byHouse[normHouse(t.n)];
          if (!row || !dirC) return false;
          var hay = [dirVal(row, dirC.family), dirVal(row, dirC.kids)]
            .concat(dirC.firstName.map(function (k) { return dirVal(row, k); })).join(" ");
          return hay.indexOf(q) !== -1;
        }).slice(0, 8);
        if (!matches.length) {
          resultsEl.innerHTML = '<div class="map-search-empty">לא נמצאו תוצאות</div>';
        } else {
          resultsEl.innerHTML = matches.map(function (t) {
            var row = byHouse[normHouse(t.n)];
            var fam = row && dirC ? (dirVal(row, dirC.family) || "") : "";
            return '<div class="map-search-item" data-num="' + t.n + '">' +
              '<span class="map-search-item__house">' + t.n + '</span>' +
              '<span class="map-search-item__name">' + (fam ? "משפחת " + CBA.esc(fam) : "") + '</span>' +
            '</div>';
          }).join("");
          Array.prototype.forEach.call(resultsEl.querySelectorAll(".map-search-item"), function (it) {
            it.addEventListener("click", function () { goToHouse(it.dataset.num); });
          });
        }
        resultsEl.classList.add("show");
      }
      // (2026-09-07) החיפוש עשוי להיות מוסתר כשהמפה משמשת כרכיב — ר' opts.search
      if (qEl && resultsEl) {
        qEl.addEventListener("input", function () { runSearch(qEl.value); });
        qEl.addEventListener("focus", function () { if (qEl.value.trim()) resultsEl.classList.add("show"); });
        document.addEventListener("click", function (e) {
          if (!document.body.contains(qEl)) return;
          if (!e.target.closest(".map-search-wrap")) resultsEl.classList.remove("show");
        });
      }

      // במובייל: גלולת החיפוש נפתחת רק כשצריך, כדי לפנות כמה שיותר שטח למפה עצמה
      // מקרא במובייל (2026-08-19, ממצא 3.5) — קודם הוא הוסתר לגמרי במסך צר,
      // כלומר אף אחד בטלפון לא ידע מה מסמן הריבוע הכתום מול הכחול. עכשיו הוא
      // מתקפל מאחורי כפתור "?" קטן במקום להיעלם.
      var legendBtn = container.querySelector("#map-legend-toggle");
      var legendEl = container.querySelector("#map-legend");
      if (legendBtn && legendEl) {
        legendBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          legendEl.classList.toggle("is-open");
        });
        document.addEventListener("click", function (e) {
          if (!document.body.contains(legendEl)) return;
          if (!e.target.closest("#map-legend") && !e.target.closest("#map-legend-toggle")) legendEl.classList.remove("is-open");
        });
      }

      var searchWrap = container.querySelector(".map-search-wrap");
      if (searchWrap && window.matchMedia("(max-width: 720px)").matches) {
        searchWrap.classList.add("collapsed");
        searchWrap.addEventListener("click", function () {
          if (!searchWrap.classList.contains("collapsed")) return;
          searchWrap.classList.remove("collapsed");
          qEl.focus();
        });
        qEl.addEventListener("blur", function () {
          setTimeout(function () {
            if (!qEl.value.trim()) searchWrap.classList.add("collapsed");
          }, 120);
        });
      }

      function goToHouse(num) {
        var t = MAP_TILES.filter(function (r) { return r.n === num; })[0];
        if (!t) return;
        viewMode = "manual";
        if (resultsEl) resultsEl.classList.remove("show");
        if (qEl) qEl.blur();
        var targetScale = fitScaleVal * MAP_T2 * 1.2;
        var cx = px(t.x + t.w / 2), cy = py(t.y + t.h / 2);
        scale = Math.max(minScale(), Math.min(maxScale(), targetScale));
        tx = viewport.clientWidth / 2 - cx * scale; ty = viewport.clientHeight / 2 - cy * scale;
        worldEl.style.transition = "transform .45s cubic-bezier(.2,.6,.2,1)";
        setTimeout(function () { worldEl.style.transition = ""; }, 460);
        apply();
        setTimeout(function () { openPopup(num); }, 220);
      }

      /* ---- שכבת נעיצה וסימונים (2026-09-07) ----
         קואורדינטות **מנורמלות 0–1** בלבד. ר' ההערה בראש הרכיב. */
      var pinEl = null, markerEls = [];
      function setPin(n) {
        if (!n) { if (pinEl) { pinEl.remove(); pinEl = null; } return; }
        if (!pinEl) {
          pinEl = document.createElement("div");
          pinEl.className = "map-pin";
          worldEl.appendChild(pinEl);
        }
        pinEl.style.left = (n.x * MAP_WORLD_W) + "px";
        pinEl.style.top  = (n.y * MAP_WORLD_H) + "px";
      }
      function getPin() {
        if (!pinEl) return null;
        return { x: parseFloat(pinEl.style.left) / MAP_WORLD_W,
                 y: parseFloat(pinEl.style.top) / MAP_WORLD_H };
      }
      function setMarkers(list) {
        markerEls.forEach(function (e) { e.remove(); });
        markerEls = [];
        (list || []).forEach(function (m) {
          var el = document.createElement("div");
          el.className = "map-marker" + (m.cls ? " " + m.cls : "");
          el.style.left = (m.x * MAP_WORLD_W) + "px";
          el.style.top  = (m.y * MAP_WORLD_H) + "px";
          el.setAttribute("role", "button");
          el.setAttribute("tabindex", "0");
          el.setAttribute("aria-label", m.title || "סימון");
          el.addEventListener("click", function (ev) {
            ev.stopPropagation();
            if (opts.onMarker) opts.onMarker(m.id, m);
          });
          el.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " ") {
              ev.preventDefault();
              if (opts.onMarker) opts.onMarker(m.id, m);
            }
          });
          worldEl.appendChild(el);
          markerEls.push(el);
        });
      }
      /* מצב נעיצה — מבדילים לחיצה מגרירה לפי מרחק, אחרת כל גרירה של המפה
         הייתה מזיזה את הנקודה. מאזינים נפרדים משלנו, בלי לגעת במנוע התנועה. */
      if (opts.pin) {
        var pdX = 0, pdY = 0;
        viewport.addEventListener("pointerdown", function (e) { pdX = e.clientX; pdY = e.clientY; });
        viewport.addEventListener("pointerup", function (e) {
          if (e.target.closest(".map-popup") || e.target.closest(".map-toolbar") ||
              e.target.closest(".map-topbar")) return;
          if (Math.hypot(e.clientX - pdX, e.clientY - pdY) > 6) return;
          var rect = viewport.getBoundingClientRect();
          var wx = (e.clientX - rect.left - tx) / scale;
          var wy = (e.clientY - rect.top - ty) / scale;
          if (wx < 0 || wy < 0 || wx > MAP_WORLD_W || wy > MAP_WORLD_H) return;
          var n = { x: wx / MAP_WORLD_W, y: wy / MAP_WORLD_H };
          setPin(n);
          if (opts.onPin) opts.onPin(n);
        });
      }
      if (opts.pinAt) setPin(opts.pinAt);
      if (opts.markers && opts.markers.length) setMarkers(opts.markers);

      /* מצב נקי לצילום מסך: גיאומטריה ומספרי בתים בלבד. מצב *תצוגה* בלבד —
         הוא לא מנגנון פרטיות, הנתונים עדיין טעונים בדפדפן של תושב שממילא
         רשאי לראות אותם. הוא פשוט מייצר תמונה שאפשר לשלוח החוצה. */
      (function cleanMode() {
        var btn = container.querySelector('#map-clean'); if (!btn || !shellEl) return;
        btn.addEventListener('click', function () {
          var on = !shellEl.classList.contains('clean');
          shellEl.classList.toggle('clean', on);
          btn.setAttribute('aria-pressed', on);
        });
      })();

      /* נקרא רק אחרי שכל אלמנטי המפה קיימים — כולל הבתים, שנוצרים אחרי
         המרחבים. אחרת שבב "בתים" לא היה נוצר בכלל. */
      buildChips();
      applyEmph();

      worldEl.classList.add('map-enter');
      setTimeout(function () { worldEl.classList.remove('map-enter'); }, 1100);

      initialView(false);
      // אם ידוע לנו איפה התושב גר — ממרכזים עליו את הפתיחה (בלי לזום פנימה
      // ובלי לפתוח פופאפ; רק כדי שהעין תמצא את עצמה מיד). ר' ממצא 3.5.
      if (myHouse) {
        var myTile = MAP_TILES.filter(function (r) { return normHouse(r.n) === myHouse; })[0];
        if (myTile) {
          var cy = py(myTile.y + myTile.h / 2);
          ty = Math.min(0, viewport.clientHeight / 2 - cy * scale);
          apply();
        }
      }
      // ידית לקורא — כדי שמסך הגינון יוכל לרענן סימונים בלי לצייר מפה מחדש
      return {
        setMarkers: setMarkers, setPin: setPin, getPin: getPin,
        goToHouse: goToHouse, fit: function () { fitToScreen(true); }
      };
    }
  };

  /* מסך "מפת השיכון" של אזור התושב — עוטף דק סביב הרכיב, עם כל ברירות המחדל.
     כל ההתנהגות שהתושבים מכירים נשארת בדיוק כפי שהייתה. */
  CBA.screens.resMap = {
    render: function (container) { CBA.map.render(container, { full: true }); }
  };
  /* ==== "ועד השיכון" — עץ ארגוני של הוועד, תצוגת קריאה בלבד (2026-08-10) ====
     פתוח לכל תושב מחובר ופעיל (CBA.data.getCommitteeTree, כמו טאב
     "שכנים"/המפה). עריכה (הוספת/מחיקת תפקיד, שינוי שם/קטגוריה/הורה/אנשים)
     עברה לגמרי למסך ניהול נפרד — CBA.screens.committeeAdmin ב-residents.js,
     גלוי ופעיל רק למנהל-על באזור הניהול (לבקשת יועד: "הניהול עץ צריך
     להיות רק באזור ניהול למי שיש הרשאות מנהל על"). כאן, גם מנהל-על, רואה
     רק תצוגה — בלי כפתורי עריכה על גבי התאים.
     לוגיקת בניית העץ מהשורות השטוחות (buildBoxes/catInfo) משותפת עם מסך
     הניהול — חיה ב-CBA.committee (dataService.js) כדי ששני הצדדים תמיד
     יסכימו על אותו מבנה נתונים. בלי כותרת מסך (screen-head) בכוונה —
     שם הטאב בניווט כבר אומר "ועד השיכון", וכל השטח הפנוי הולך לעץ עצמו.
     שתי תצוגות ממש שונות בקוד, לפי רוחב המסך (נבדק פעם אחת ב-render, כמו
     שכבר נעשה במפה — ר' matchMedia ב-resMap למעלה): בדסקטופ עץ CSS אופקי
     עם גלילה (ר' .org-tree-wrap), ובמסך צר רשימה היררכית מתקפלת בלי שום
     גלילה אופקית (2026-08-10, לבקשת יועד: "רשימה היררכית מתקפלת"). */
  var chevIcon = svg('<polyline points="6 9 12 15 18 9"/>');

  CBA.screens.resCommittee = {
    render: function (container) {
      var isMobile = window.matchMedia("(max-width: 720px)").matches;
      container.innerHTML =
        '<div class="org-hint">' + (isMobile ? "לחצו על תפקיד כדי לפתוח את מי שכפוף לו." : "העץ רחב — גררו/גללו אופקית כדי לראות את כולו.") + '</div>' +
        '<div id="org-body">' + CBA.skel.tree() + '</div>';
      var bodyEl = container.querySelector("#org-body");
      var rowsCache = [];
      var expanded = null; // {boxId:true/false} — נבנה פעם אחת (ברירת מחדל), נשמר בין ציורים חוזרים

      // כרטיס בודד (2026-08-10, מנוע ציור מדויק) — כבר לא <li> מקונן; div שטוח
      // עם data-node-id, ש-layoutOrgTree ממקם אחר כך ב-left/top מוחלטים. אין
      // כפתורי פעולה כאן בכלל (תצוגת קריאה בלבד) — זה ההבדל היחיד מול הגרסה
      // המקבילה במסך הניהול (residents.js).
      function orgNodeBoxHTML(box) {
        var cat = CBA.committee.catInfo(box.category);
        var peopleHTML = box.people.length
          ? box.people.map(function (p) { return '<div class="org-box__person">' + CBA.esc(p.name) + '</div>'; }).join("")
          : "";
        return '<div class="org-tree-node" data-node-id="' + CBA.esc(box.id) + '">' +
          '<div class="org-box" style="border-top-color:' + CBA.esc(cat.color) + '" title="' + CBA.esc(cat.name) + '">' +
            '<div class="org-box__role">' + CBA.esc(box.role || "(ללא שם תפקיד)") + '</div>' +
            (peopleHTML ? '<div class="org-box__people">' + peopleHTML + '</div>' : "") +
          '</div>' +
        '</div>';
      }

      // מנוע הפריסה (2026-08-10) — זהה לחלוטין לזה שב-residents.js
      // (CBA.screens.committeeAdmin). ר' ההסבר המלא בהערת ה-CSS מעל
      // .org-tree-wrap ב-resident.css. לא מרוכז בקובץ משותף כי כל שאר
      // לוגיקת ה-DOM/ציור של עץ הוועד כאן כבר כפולה כך בין שני המסכים
      // (orgListHTML, defaultExpanded וכו') — הרחבה עקבית לדפוס הקיים.
      function layoutOrgTree(canvas, svg, nodesFlat, byParent) {
        // סבב 3 (2026-08-10, לבקשת יועד: "להקטין את המרווח בין קוביות בשליש" +
        // "להקטין את הגובה בין קוביות בחצי") — GAP_X (מרווח אופקי בין אחים)
        // 20→13 (כ-2/3 מהערך הקודם), ROW_GAP (מרווח אנכי בין הורה לילדים) 40→20.
        // סבב 4 (2026-08-10, לבקשת יועד: "תקטין את רוחב הקוביות בעוד 15%") —
        // NODE_W 140→119 (עוד 15% פחות), חייב להישאר זהה לרוחב .org-box/
        // .org-tree-node ב-resident.css כדי שהפריסה תואמת בפועל לגודל האמיתי.
        var NODE_W = 119, GAP_X = 13, ROW_GAP = 20, PAD_X = 20, PAD_TOP = 6, PAD_BOTTOM = 10;

        var heightOf = {}, elOf = {};
        nodesFlat.forEach(function (n) {
          var el = canvas.querySelector('.org-tree-node[data-node-id="' + CBA.esc(n.box.id) + '"]');
          elOf[n.box.id] = el;
          heightOf[n.box.id] = el ? el.offsetHeight : 70;
        });

        var slotOf = {}, leafCounter = 0;
        function assignSlot(id) {
          var kids = byParent[id] || [];
          if (!kids.length) { var s = leafCounter++; slotOf[id] = s; return s; }
          var centers = kids.map(function (k) { return assignSlot(k.id); });
          var c = (centers[0] + centers[centers.length - 1]) / 2;
          slotOf[id] = c;
          return c;
        }
        var roots = nodesFlat.filter(function (n) { return n.depth === 0; }).map(function (n) { return n.box; });
        roots.forEach(function (r) { assignSlot(r.id); });
        var totalSlots = Math.max(leafCounter, 1);
        var SLOT_W = NODE_W + GAP_X;
        var totalWidth = PAD_X * 2 + totalSlots * NODE_W + (totalSlots - 1) * GAP_X;

        function leftOf(id) {
          var abstractLeft = PAD_X + slotOf[id] * SLOT_W;
          return totalWidth - NODE_W - abstractLeft;
        }

        // Y — מיקום מקומי לפי-הורה, לא לפי "שורת-דור" גלובלית (סבב 2, 2026-08-10,
        // לבקשת יועד: "המרחקים בין הקוביות בציר הגובה... יש מקומות שפתאום ההפרש
        // בגובה גדול ופתאום קטן"). ר' ההסבר המלא באותה פונקציה ב-residents.js —
        // הילדים של כל קוביה מתחילים תמיד מיד אחרי התחתית *של אותה קוביה עצמה*
        // + ROW_GAP קבוע, בלי תלות בגובה קוביות אחרות בעץ. מעבר יחיד מלמעלה-
        // למטה מספיק כי nodesFlat הוא preorder (ר' collectNode למטה).
        var topOf = {};
        roots.forEach(function (r) { topOf[r.id] = PAD_TOP; });
        nodesFlat.forEach(function (n) {
          var kids = byParent[n.box.id] || [];
          if (!kids.length) return;
          var childTop = topOf[n.box.id] + heightOf[n.box.id] + ROW_GAP;
          kids.forEach(function (k) { topOf[k.id] = childTop; });
        });
        var totalHeight = PAD_TOP;
        nodesFlat.forEach(function (n) {
          var bottom = topOf[n.box.id] + heightOf[n.box.id];
          if (bottom > totalHeight) totalHeight = bottom;
        });
        totalHeight += PAD_BOTTOM;

        nodesFlat.forEach(function (n) {
          var el = elOf[n.box.id];
          if (!el) return;
          el.style.left = leftOf(n.box.id) + "px";
          el.style.top = topOf[n.box.id] + "px";
        });
        canvas.style.width = totalWidth + "px";
        canvas.style.height = totalHeight + "px";
        svg.setAttribute("width", totalWidth);
        svg.setAttribute("height", totalHeight);
        svg.setAttribute("viewBox", "0 0 " + totalWidth + " " + totalHeight);

        function centerX(id) { return leftOf(id) + NODE_W / 2; }
        var lines = [];
        nodesFlat.forEach(function (n) {
          var kids = byParent[n.box.id] || [];
          if (!kids.length) return;
          var parentBottom = topOf[n.box.id] + heightOf[n.box.id];
          var midY = parentBottom + ROW_GAP / 2;
          var childTop = topOf[kids[0].id];
          var childXs = kids.map(function (k) { return centerX(k.id); });
          var minX = Math.min.apply(null, childXs), maxX = Math.max.apply(null, childXs);
          var px = centerX(n.box.id);
          lines.push('<line x1="' + px + '" y1="' + parentBottom + '" x2="' + px + '" y2="' + midY + '"></line>');
          if (kids.length > 1) {
            lines.push('<line x1="' + minX + '" y1="' + midY + '" x2="' + maxX + '" y2="' + midY + '"></line>');
          }
          kids.forEach(function (k) {
            var cx = centerX(k.id);
            lines.push('<line x1="' + cx + '" y1="' + midY + '" x2="' + cx + '" y2="' + childTop + '"></line>');
          });
        });
        svg.innerHTML = lines.join("");
      }

      // ברירת מחדל לפתיחה/סגירה ברשימה המתקפלת: "שרשרת" (תא עם ילד יחיד)
      // נפתחת אוטומטית לגמרי — אין טעם להסתיר "מב"ס 30 → סמב"ס 30 → יו"ר
      // שיכון" מאחורי 3 לחיצות. ענף עם כמה ילדים (כמו 13 הקטגוריות תחת
      // יו"ר שיכון) מתחיל סגור — המשתמש פותח מה שמעניין אותו.
      function defaultExpanded(boxes, byParent) {
        var out = {};
        boxes.forEach(function (b) { out[b.id] = (byParent[b.id] || []).length === 1; });
        return out;
      }

      function orgListHTML(box, byParent) {
        var cat = CBA.committee.catInfo(box.category);
        var kids = byParent[box.id] || [];
        var isOpen = !!expanded[box.id];
        var peopleText = box.people.length ? box.people.map(function (p) { return CBA.esc(p.name); }).join(", ") : "";
        return '<li class="org-list__item">' +
          '<div class="org-list__row"' + (kids.length ? ' data-org-toggle="' + CBA.esc(box.id) + '"' : "") + '>' +
            (kids.length
              ? '<span class="org-list__chev' + (isOpen ? " is-open" : "") + '">' + chevIcon + '</span>'
              : '<span class="org-list__chev org-list__chev--spacer"></span>') +
            '<span class="org-list__dot" style="background:' + CBA.esc(cat.color) + '" title="' + CBA.esc(cat.name) + '"></span>' +
            '<div class="org-list__text">' +
              '<div class="org-list__role">' + CBA.esc(box.role || "(ללא שם תפקיד)") + '</div>' +
              (peopleText ? '<div class="org-list__people">' + peopleText + '</div>' : "") +
            '</div>' +
          '</div>' +
          (kids.length
            ? '<ul class="org-list__children"' + (isOpen ? "" : " hidden") + '>' +
                kids.map(function (k) { return orgListHTML(k, byParent); }).join("") +
              '</ul>'
            : "") +
        '</li>';
      }

      function draw() {
        var boxes = CBA.committee.buildBoxes(rowsCache);
        if (!boxes.length) {
          bodyEl.innerHTML = CBA.ui.emptyState({ icon: "users", title: "עץ הוועד עדיין לא הוגדר",
            sub: "כשהרכב הוועד יוזן, הוא יופיע כאן כתרשים." });
          return;
        }
        var ids = {}; boxes.forEach(function (b) { ids[b.id] = true; });
        var byParent = {};
        boxes.forEach(function (b) {
          var p = ids[b.parent] ? b.parent : "";
          (byParent[p] = byParent[p] || []).push(b);
        });
        var roots = byParent[""] || [];

        if (isMobile) {
          if (!expanded) expanded = defaultExpanded(boxes, byParent);
          bodyEl.innerHTML = '<ul class="org-list">' +
            roots.map(function (b) { return orgListHTML(b, byParent); }).join("") +
            '</ul>';
          bodyEl.querySelectorAll("[data-org-toggle]").forEach(function (row) {
            row.addEventListener("click", function () {
              var id = row.dataset.orgToggle;
              expanded[id] = !expanded[id];
              draw();
            });
          });
          return;
        }

        var nodesFlat = [];
        function collectNode(node, depth) {
          nodesFlat.push({ box: node, depth: depth });
          var kids = byParent[node.id] || [];
          kids.forEach(function (k) { collectNode(k, depth + 1); });
        }
        roots.forEach(function (r) { collectNode(r, 0); });

        // (2026-08-18, ממצאים 3.6+3.9) מקרא קטגוריות + סרגל זום מעל העץ,
        // ו"התאמה למסך" כברירת מחדל — כך שהעץ נפתח שלם ולא חתוך בשני הקצוות.
        bodyEl.innerHTML = CBA.committee.legendHTML() +
          '<div class="org-tools" id="org-tools"></div>' +
          '<div class="org-tree-wrap"><div class="org-tree-canvas" id="org-tree-canvas">' +
          '<svg class="org-tree-svg" id="org-tree-svg"></svg>' +
          nodesFlat.map(function (n) { return orgNodeBoxHTML(n.box); }).join("") +
          '</div></div>';
        layoutOrgTree(bodyEl.querySelector("#org-tree-canvas"), bodyEl.querySelector("#org-tree-svg"), nodesFlat, byParent);
        CBA.committee.attachOrgZoom(
          bodyEl.querySelector(".org-tree-wrap"),
          bodyEl.querySelector("#org-tree-canvas"),
          bodyEl.querySelector("#org-tools")
        );
        // עוגן גלילה התחלתי (2026-08-10): גם בפריסה המדויקת החדשה העץ בפועל
        // רחב מרוב מסכי מחשב — בלי גלילה מפורשת לראש העץ, אפשר "להיזרק"
        // לתוך האמצע שלו בטעינה ראשונה. גוללים במפורש אליו.
        var firstBox = roots[0] && bodyEl.querySelector('.org-tree-node[data-node-id="' + CBA.esc(roots[0].id) + '"]');
        if (firstBox && firstBox.scrollIntoView) {
          firstBox.scrollIntoView({ inline: "center", block: "nearest" });
        }
      }

      function load() {
        CBA.data.getCommitteeTree(function (res) {
          if (!res || !res.ok) {
            bodyEl.innerHTML = '<div class="rs-empty"><p>' + CBA.esc((res && res.error) || "שגיאה בטעינת עץ הוועד. נסו שוב מאוחר יותר.") + '</p></div>';
            return;
          }
          rowsCache = res.rows || [];
          draw();
        });
      }

      CBA.committee.loadCategories(function () { load(); });
    }
  };

  /* (2026-08-27) עמוד הקבלה מציג סיכום של הבקשות המשפחתיות, ולכן צריך בדיוק
     את אותו חישוב שמסך "הבקשות שלי" עושה. חושפים את שלוש הפונקציות במקום
     לשכפל את הלוגיקה שם — שכפול היה מבטיח שהמספר בעמוד הקבלה והמספר במסך
     הבקשות ייפרדו זה מזה ביום שמישהו יתקן רק אחד מהם. */
  window.CBA.residentUtils = {
    user: user, fullName: fullName,
    myRequests: myRequests, splitRequests: splitRequests
  };

})();
