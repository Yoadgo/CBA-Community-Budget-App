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
  var amenIcons = {
    kids:  '<path d="M12 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/>',
    park:  '<path d="M12 2 7 10h3l-4 7h5v5h2v-5h5l-4-7h3L12 2Z"/>',
    shop:  '<path d="M4 8 5.5 4h13L20 8"/><rect x="4" y="8" width="16" height="12" rx="1.5"/><path d="M9 12v4M15 12v4"/>',
    food:  '<path d="M6 3v7a2 2 0 0 0 2 2v9M6 3v18M10 3v9M18 3c-2 0-3 2-3 5s1 4 3 4v9"/>',
    club:  '<circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14c2.5.3 4.5 2.4 4.5 5"/>',
    train: '<rect x="5" y="4" width="14" height="13" rx="3"/><path d="M5 12h14M8 20l-2 2M16 20l2 2"/><circle cx="8.5" cy="14.5" r="0.5" fill="currentColor"/><circle cx="15.5" cy="14.5" r="0.5" fill="currentColor"/>',
    mail:  '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
    sport: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c2.6 2.4 2.6 14.6 0 17M3.5 12h17M5.3 6.8c2 1.7 11.4 1.7 13.4 0M5.3 17.2c2-1.7 11.4-1.7 13.4 0"/>',
    house: '<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M5.5 10v8.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V10"/><path d="M9.5 19.5v-5.2h5v5.2"/>'
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

  function reqCardHTML(t) {
    var s = CBA.data.statusMeta(t.status);
    var pill = STATUS_PILL[t.status] || STATUS_PILL.submitted;
    var title = t.supplier || t.buyer || "בקשה";
    var typeLabel = CBA.data.expenseTypeLabel(CBA.data.expenseTypeOf(t));
    // מועד החזר צפוי (סעיף 7, 2026-08-06) — רק לבקשות החזר שעדיין ממתינות (לא
    // שולם/נדחה כבר, שם המועד הצפוי כבר לא רלוונטי). ר' CBA.data.expectedRefundDate.
    var pending = t.status !== "paid" && t.status !== "rejected";
    var refundLabel = pending ? CBA.data.expectedRefundDateLabel(t) : "";
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

  CBA.screens.resRequests = {
    render: function (container) {
      // שימור מיקום גלילה (אותו פתרון כמו expenses.js/residents.js/clubAdmin.js) —
      // render() כאן נקרא מחדש גם ברענון רקע שקט, וה-innerHTML החדש היה מאפס גלילה.
      var rqWinScrollY = window.scrollY || 0;
      var u = user();
      var fam = u.family || u.name || "תושב";
      var house = u.house ? ("בית " + u.house) : "אזור תושב";
      var groups = splitRequests(myRequests());
      var refunds = groups.refunds, handled = groups.handled;

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

      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">שלום, ' + CBA.esc(fullName(u)) + '</div>' +
          '<div class="screen-head__sub">' + CBA.esc(house) + ' · אזור תושב</div></div>' +
        '<div class="summary res-summary">' +
          '<div class="stat stat--warn"><div class="stat__label">ממתינות</div><div class="stat__value">' + counts.pending + '</div></div>' +
          '<div class="stat stat--blue"><div class="stat__label">אושרו</div><div class="stat__value">' + counts.ready + '</div></div>' +
          '<div class="stat stat--ok"><div class="stat__label">שולמו</div><div class="stat__value">' + CBA.formatILS(counts.paid) + '</div></div>' +
        '</div>' +
        '<button class="btn-primary rs-cta" data-goto="resSubmit">' + plusIcon + ' הגשת בקשה חדשה</button>' +
        listHTML;

      var cta = container.querySelector("[data-goto]");
      if (cta) cta.addEventListener("click", function () { CBA.navigate("resSubmit"); });
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
  var CLUB_RULES_HTML =
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
    '<p><b>רשת אלחוטית:</b> Mesh0D45 &nbsp;·&nbsp; <b>סיסמה:</b> 1-8</p>' +
    '<p>במועדון קיימת מערכת הגברה, מיקרופון ומקרן שניתן להשתמש בהם.</p>' +
    '<p>במחסן המועדון יש מכונות מזון אותן ניתן להשכיר בנפרד ובתיאום מראש — אין להשתמש במכונות ללא רשות.</p>' +
    '<p>שמתם לב למשהו תקול/בלוי, או שחומרי ניקיון חסרים/עומדים להיגמר? נא לעדכן את הוועד בהקדם כדי שנוכל לטפל בנושא.</p>';
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
            '<div class="club-rules__body" id="rc-rules-body" hidden>' + CLUB_RULES_HTML + '</div>' +
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
        slotsEl.innerHTML = '<div class="rs-slots__msg"><div class="rs-spin"></div>טוען זמינות…</div>';
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
      '<div class="rs-mine-full" id="rc-mine-full"><div class="rs-slots__msg"><div class="rs-spin"></div>טוען שריונים…</div></div>';

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
  function mineCardHTML(r) {
    var s = new Date(r.start), e = new Date(r.end);
    var ds = s.getFullYear() + "-" + pad2(s.getMonth() + 1) + "-" + pad2(s.getDate());
    var timeRange = pad2(s.getHours()) + ":" + pad2(s.getMinutes()) + "–" + pad2(e.getHours()) + ":" + pad2(e.getMinutes());
    var pill = r.status === "pending"
      ? '<span class="rs-pill rs-pill--warn">' + clockIcon + 'ממתין לאישור מנהל</span>'
      : '<span class="rs-pill rs-pill--ok">' + checkIcon + 'מאושר</span>';
    return (
      '<div class="card rq">' +
        '<div class="rq__top">' +
          '<div><div class="rq__sup">' + CBA.esc(dateLabel(ds)) + '</div>' +
            '<div class="rq__desc">' + timeRange + (r.note ? " · " + CBA.esc(r.note) : "") + '</div></div>' +
          pill +
        '</div>' +
        '<div class="rq__foot">' +
          '<span class="rq__date"></span>' +
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
      listEl.innerHTML = '<div class="rs-empty"><p>לא נמצאו תוצאות.</p></div>';
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
        '<div id="dir-list"><div class="rs-empty"><p>טוען…</p></div></div>';

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
  var MAP_WORLD_W = 1100, MAP_WORLD_H = 1354;
  function mapX(p) { return p / 100 * MAP_WORLD_W; }
  function mapY(p) { return p / 100 * MAP_WORLD_H; }

  var MAP_LOOP_L = 23.94, MAP_LOOP_R = 94.17, MAP_LOOP_B = 98.45;
  var MAP_TAVOR = 26.33, MAP_BASHOR = 65.50;
  var MAP_LOOP_W = 48, MAP_CROSS_W = 37, MAP_DRIVE_W = 18; /* עובי בפיקסלים של "עולם" */

  var MAP_TILES = [
    {n:"101",x:39.98,y:9.13,w:6.54,h:3.24},
    {n:"103",x:46.53,y:9.13,w:6.54,h:3.24},
    {n:"105",x:54.19,y:9.13,w:6.50,h:3.24},
    {n:"107",x:60.69,y:9.13,w:6.50,h:3.24},
    {n:"201",x:54.19,y:14.18,w:6.50,h:3.37},
    {n:"203",x:60.69,y:14.18,w:6.50,h:3.37},
    {n:"205",x:78.45,y:14.18,w:6.62,h:3.37},
    {n:"207",x:85.08,y:14.18,w:6.62,h:3.37},
    {n:"301",x:39.98,y:19.88,w:6.54,h:3.30},
    {n:"303",x:46.53,y:19.88,w:6.54,h:3.30},
    {n:"305",x:54.19,y:19.88,w:6.50,h:3.30},
    {n:"307",x:60.69,y:19.88,w:6.50,h:3.30},
    {n:"309",x:78.45,y:19.82,w:6.62,h:3.30},
    {n:"311",x:85.08,y:19.82,w:6.62,h:3.30},
    {n:"302",x:44.85,y:29.47,w:6.70,h:3.43},
    {n:"304",x:52.91,y:29.60,w:6.70,h:3.30},
    {n:"306",x:60.81,y:29.53,w:6.70,h:3.37},
    {n:"308",x:77.97,y:29.47,w:6.70,h:3.37},
    {n:"310",x:85.63,y:29.53,w:6.70,h:3.30},
    {n:"401",x:44.85,y:33.42,w:6.70,h:3.24},
    {n:"403",x:52.91,y:33.42,w:6.70,h:3.30},
    {n:"405",x:60.89,y:33.35,w:6.62,h:3.30},
    {n:"407",x:77.97,y:33.68,w:6.70,h:3.24},
    {n:"409",x:85.63,y:33.68,w:6.70,h:3.30},
    {n:"402",x:44.85,y:38.41,w:6.70,h:3.24},
    {n:"404",x:52.91,y:38.41,w:6.70,h:3.37},
    {n:"406",x:60.73,y:38.34,w:6.70,h:3.30},
    {n:"505",x:77.97,y:38.67,w:6.86,h:3.37},
    {n:"507",x:85.63,y:38.67,w:6.70,h:3.37},
    {n:"501",x:58.58,y:42.29,w:6.70,h:3.37},
    {n:"503",x:66.48,y:42.16,w:6.70,h:3.37},
    {n:"502",x:58.58,y:46.24,w:6.70,h:3.37},
    {n:"504",x:66.40,y:46.31,w:6.70,h:3.24},
    {n:"601",x:27.37,y:50.45,w:6.70,h:3.30},
    {n:"603",x:44.85,y:50.58,w:6.70,h:3.24},
    {n:"605",x:52.91,y:50.58,w:6.70,h:3.37},
    {n:"607",x:60.89,y:50.52,w:6.62,h:3.30},
    {n:"506",x:77.97,y:50.71,w:6.70,h:3.30},
    {n:"508",x:85.63,y:50.71,w:6.70,h:3.30},
    {n:"602",x:44.85,y:55.96,w:6.70,h:3.24},
    {n:"604",x:52.91,y:55.96,w:6.78,h:3.24},
    {n:"606",x:60.81,y:55.89,w:6.78,h:3.30},
    {n:"608",x:77.97,y:55.96,w:6.70,h:3.30},
    {n:"610",x:85.63,y:55.96,w:6.70,h:3.30},
    {n:"701",x:52.91,y:59.91,w:6.70,h:3.37},
    {n:"703",x:60.73,y:59.84,w:6.70,h:3.30},
    {n:"705",x:77.97,y:60.04,w:6.70,h:3.37},
    {n:"707",x:85.63,y:60.04,w:6.70,h:3.37},
    {n:"702",x:44.93,y:68.13,w:6.70,h:3.37},
    {n:"704",x:52.99,y:68.20,w:6.70,h:3.30},
    {n:"706",x:60.89,y:68.13,w:6.70,h:3.37},
    {n:"708",x:77.97,y:68.13,w:6.78,h:3.37},
    {n:"710",x:85.63,y:69.82,w:6.70,h:3.30},
    {n:"801",x:44.93,y:72.47,w:6.70,h:3.37},
    {n:"803",x:52.99,y:72.47,w:6.70,h:3.37},
    {n:"805",x:60.89,y:72.47,w:6.70,h:3.24},
    {n:"807",x:77.97,y:72.34,w:6.70,h:3.30},
    {n:"809",x:85.63,y:74.55,w:6.70,h:3.24},
    {n:"802",x:44.93,y:78.69,w:6.70,h:3.30},
    {n:"804",x:52.99,y:78.76,w:6.70,h:3.30},
    {n:"806",x:60.89,y:78.69,w:6.62,h:3.30},
    {n:"808",x:78.13,y:77.91,w:6.70,h:3.24},
    {n:"810",x:85.71,y:79.40,w:6.78,h:3.37},
    {n:"901",x:40.38,y:86.33,w:6.58,h:3.37},
    {n:"903",x:46.97,y:86.33,w:6.58,h:3.37},
    {n:"905",x:54.35,y:86.33,w:6.70,h:3.37},
    {n:"907",x:61.05,y:86.33,w:6.70,h:3.37},
    {n:"909",x:72.55,y:86.33,w:6.70,h:3.37},
    {n:"902",x:54.35,y:92.03,w:6.70,h:3.30},
    {n:"904",x:61.05,y:92.03,w:6.70,h:3.30},
    {n:"906",x:72.55,y:92.03,w:6.70,h:3.30}
  ];
  var MAP_AMENITIES = [
    {x:39.27,y:42.49,w:12.29,h:7.45,label:'גן שעשועים · פארק נינג׳ה',ico:'park',park:1},
    {x:12.90,y:43.59,w:8.80,h:6.87,label:'שק"ם משפחות',ico:'shop'},
    {x:12.90,y:50.71,w:8.80,h:4.53,label:'חומוסיה',ico:'food'},
    {x:12.90,y:55.63,w:8.80,h:6.93,label:'מועדון משפחות',ico:'club',shape:'club'},
    {x:27.53,y:37.24,w:6.86,h:9.13,label:'מועדון ילדים',ico:'kids'},
    {x:27.21,y:54.40,w:7.34,h:3.89,label:'פאמטרק',ico:'train'},
    {x:28.97,y:59.00,w:2.71,h:2.85,label:'דואר',ico:'mail'}
  ];

  /* גני ילדים — המבנה עם הגג המפואר (4 גזוזטראות סביב מרכז) שנראה בכל תצלומי האוויר
     ליד הכיכר, ולא במיקום התשריט המקורי. ממוקם ממש מתחת לכיכר. */
  var MAP_LANDMARK = {x:9.5, y:9.0, w:11.5, h:8.3, label:'גני ילדים', ico:'kids'};

  /* עגול־תנועה בכניסה הצפונית — נראה בבירור בתצלומי האוויר, לא מופיע בתשריט המקורי */
  var MAP_ROUNDABOUT = {cx:15.5, cy:2.6, r:5.6};

  /* מגרשי טניס/כדורסל, אולם ספורט ומגרש דשא סינתטי שני — קיימים במציאות (תצלומי אוויר),
     לא מופיעים בתשריט הרשמי. יחס הרוחב/גובה מכוון ליחס אמיתי של מגרש טניס/כדורסל. */
  var MAP_TENNIS = {x:0.3, y:34.1, w:7.0, h:2.75};
  var MAP_BASKETBALL = {x:7.6, y:33.7, w:5.3, h:3.15};
  var MAP_SPORTS_HALL = {x:0.2, y:39.2, w:6.2, h:8.8};
  var MAP_TURF2 = {x:0.2, y:57.8, w:6.0, h:4.2};
  /* חניון הבריכה — ממש ליד הבריכה (מזרח) */
  var MAP_POOL_PARKING = {x:11.9, y:23.8, w:6.8, h:7.2};
  /* חניון שק"ם/חומוסיה/מועדון משפחות — רצועה אחת שמשרתת את שלושת המבנים */
  var MAP_SHEKEM_PARKING = {x:21.7, y:43.5, w:5.5, h:19.0};

  var MAP_PARKING = [
    {x:26.25,y:3.30, w:12.95,h:7.90 },
    {x:68.23,y:14.00,w:8.80, h:10.55},
    {x:35.48,y:29.70,w:8.90, h:11.35},
    {x:68.23,y:29.70,w:8.95, h:11.30},
    {x:79.40,y:43.10,w:13.50,h:7.20},
    {x:35.80,y:51.90,w:8.30, h:10.55},
    {x:68.60,y:51.90,w:9.00, h:10.55},
    {x:35.55,y:67.60,w:8.50, h:11.20},
    {x:68.55,y:67.60,w:9.10, h:11.20},
    {x:26.20,y:87.70,w:13.30,h:8.35 },
    {x:79.90,y:83.80,w:12.90,h:7.45 },
    /* חניית גני ילדים — ממוקמת ממש מתחת למבנה גני הילדים */
    {x:5.0, y:17.8, w:12.0, h:3.2 },
    /* חניון הבריכה */
    {x:MAP_POOL_PARKING.x, y:MAP_POOL_PARKING.y, w:MAP_POOL_PARKING.w, h:MAP_POOL_PARKING.h},
    /* חניון שק"ם/חומוסיה/מועדון משפחות */
    {x:MAP_SHEKEM_PARKING.x, y:MAP_SHEKEM_PARKING.y, w:MAP_SHEKEM_PARKING.w, h:MAP_SHEKEM_PARKING.h}
  ];

  /* שבילי גישה מהכביש הראשי אל החניונים/הכיכר */
  var MAP_DRIVES = [
    [39.90,MAP_TAVOR, 39.90,30.6],
    [72.63,MAP_TAVOR, 72.63,30.6],
    [72.63,MAP_TAVOR, 72.63,23.5],
    [38.91,MAP_BASHOR,38.91,59.8],
    [71.43,MAP_BASHOR,71.43,59.8],
    [39.90,MAP_BASHOR,39.90,69.5],
    [72.63,MAP_BASHOR,72.63,69.5],
    [MAP_LOOP_L,6.71,  27.4,6.71 ],
    [MAP_LOOP_L,90.84, 27.4,90.84],
    [MAP_LOOP_R,46.47, 90.9,46.47],
    [MAP_LOOP_R,87.12, 90.9,87.12],
    /* כיכר → חניית גני הילדים, ממש מתחתיה */
    [MAP_ROUNDABOUT.cx,MAP_ROUNDABOUT.cy+MAP_ROUNDABOUT.r, MAP_ROUNDABOUT.cx,19.0],
    /* כיכר → הכביש הראשי — כך שהכיכר מחוברת חזותית לרשת הכבישים ולא "צפה" לבד */
    [MAP_ROUNDABOUT.cx+MAP_ROUNDABOUT.r,MAP_ROUNDABOUT.cy, MAP_LOOP_L,MAP_ROUNDABOUT.cy]
  ];

  /* רחובות פנימיים — 9 השמות מהתשריט. type:'road' = תווית יושבת ישירות על אחד משני
     הכבישים הראשיים (תבור/הבשור), עם קו מקווקו על הכביש עצמו; type:'h'/'v' = שביל בין
     שורות בתים. */
  var MAP_STREETS = [
    {name:'נחל דן',      type:'h',    y:13.3,  x1:38.5, x2:68.7},
    {name:'נחל משושים',  type:'h',    y:18.7,  x1:76.0, x2:93.0},
    {name:'נחל תבור',    type:'road', y:MAP_TAVOR, x1:MAP_LOOP_L,x2:MAP_LOOP_R},
    {name:'נחל אלכסנדר', type:'h',    y:33.1,  x1:43.0, x2:93.5},
    /* נחל אילון — שביל אנכי קצר בין שני צמדי הבתים המזרחיים (505/507 מעל, 506/508 מתחת) */
    {name:'נחל אילון',   type:'v',    x:77.6,  y1:42.2, y2:50.6},
    {name:'נחל שורק',    type:'h',    y:50.0,  x1:30.5, x2:93.5},
    {name:'נחל הבשור',   type:'road', y:MAP_BASHOR,x1:MAP_LOOP_L,x2:MAP_LOOP_R},
    /* נחל צאלים — מוזז דרומה כדי לא להיצמד לנחל הבשור */
    {name:'נחל צאלים',   type:'h',    y:68.0,  x1:43.4, x2:93.8},
    {name:'נחל פארן',    type:'h',    y:91.0,  x1:38.9, x2:80.7}
  ];

  /* גושי עצים — אליפסות רכות עם מילוי דהוי */
  var MAP_TREES = [
    [13,12,5,4],[8,21,4,4],[17,31,4,4],[10,47,4,4],[16,58,4,4],[9,70,5,4],[16,82,4,4],[11,92,4,4],
    [33,10,4,3],[34,34,3,3],[32,57,4,3],[34,80,3,3],[36,95,4,3],
    [55,24,4,3],[74,10,4,3],[57,63,4,3],[79,63,4,3],[58,83,4,3],
    [97,20,4,5],[98,50,4,5],[97,80,4,5]
  ];

  var MAP_POOL  = {x:0.3, y:21.5, w:11.3, h:10.5};
  var MAP_FIELD = {x:0.2, y:48.8, w:8.6, h:8.6};

  // מספר בית מנורמל להשוואה בטוחה (בלי לסמוך על עיצוב מדויק בגיליון)
  function normHouse(s) { return String(s == null ? "" : s).replace(/\D/g, ""); }

  /* ===================== שכבת ה"שטח" (SVG אחד, מחושב פעם אחת) =====================
     כל רשת הכבישים מצוירת כמסלולים בשכבה אחת: תחילה כל ה"מסגרות" הכהות, ואז כל פני
     הכביש הבהירים מעליהן — כך צומת נוצר מעצמו, בלי תפר בין שני מלבנים שנדבקים. */
  function mapPt(x, y) { return mapX(x).toFixed(1) + ',' + mapY(y).toFixed(1); }
  function mapRoad(d, w, stroke, extra) {
    return '<path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="' + w +
      '" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '/>';
  }
  var MAP_LOOP_PATH = 'M' + mapPt(MAP_LOOP_L, -2) + ' L' + mapPt(MAP_LOOP_L, MAP_LOOP_B) +
    ' L' + mapPt(MAP_LOOP_R, MAP_LOOP_B) + ' L' + mapPt(MAP_LOOP_R, -2);
  var MAP_CROSS_PATH = 'M' + mapPt(MAP_LOOP_L, MAP_TAVOR) + ' L' + mapPt(MAP_LOOP_R, MAP_TAVOR) +
    ' M' + mapPt(MAP_LOOP_L, MAP_BASHOR) + ' L' + mapPt(MAP_LOOP_R, MAP_BASHOR);
  var MAP_DRIVE_PATH = MAP_DRIVES.map(function (d) { return 'M' + mapPt(d[0], d[1]) + ' L' + mapPt(d[2], d[3]); }).join(' ');

  var MAP_TERRAIN_SVG = (function () {
    var t = '';
    t += '<defs>' +
      '<radialGradient id="mapTreeG"><stop offset="0%" stop-color="var(--map-tree)" stop-opacity=".34"/>' +
      '<stop offset="55%" stop-color="var(--map-tree)" stop-opacity=".18"/>' +
      '<stop offset="100%" stop-color="var(--map-tree)" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="mapPoolG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#DDEFF9"/><stop offset="100%" stop-color="#BFE0F1"/></linearGradient>' +
      '<linearGradient id="mapLandG" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#EDF2E6"/><stop offset="45%" stop-color="#E7EEDF"/><stop offset="100%" stop-color="#DCE3D6"/></linearGradient>' +
      '<radialGradient id="mapGlowWarm"><stop offset="0%" stop-color="#FFF7E8" stop-opacity=".55"/><stop offset="100%" stop-color="#FFF7E8" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="mapGlowCool"><stop offset="0%" stop-color="#E4EEF6" stop-opacity=".5"/><stop offset="100%" stop-color="#E4EEF6" stop-opacity="0"/></radialGradient>' +
      '<filter id="mapSoften" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>' +
    '</defs>';
    /* 1. קרקע בסיס — גרדיאנט נזיל + כתמי אור רכים */
    t += '<rect x="0" y="0" width="' + MAP_WORLD_W + '" height="' + MAP_WORLD_H + '" fill="url(#mapLandG)"/>';
    t += '<ellipse cx="' + (MAP_WORLD_W * 0.18) + '" cy="' + (MAP_WORLD_H * 0.14) + '" rx="' + (MAP_WORLD_W * 0.24) + '" ry="' + (MAP_WORLD_H * 0.14) + '" fill="url(#mapGlowWarm)"/>';
    t += '<ellipse cx="' + (MAP_WORLD_W * 0.82) + '" cy="' + (MAP_WORLD_H * 0.42) + '" rx="' + (MAP_WORLD_W * 0.22) + '" ry="' + (MAP_WORLD_H * 0.16) + '" fill="url(#mapGlowCool)"/>';
    t += '<ellipse cx="' + (MAP_WORLD_W * 0.28) + '" cy="' + (MAP_WORLD_H * 0.82) + '" rx="' + (MAP_WORLD_W * 0.26) + '" ry="' + (MAP_WORLD_H * 0.15) + '" fill="url(#mapGlowWarm)"/>';
    /* 2. מדשאת פנים השיכון */
    t += '<rect x="' + mapX(MAP_LOOP_L) + '" y="' + mapY(-2) + '" width="' + (mapX(MAP_LOOP_R) - mapX(MAP_LOOP_L)) + '" height="' + (mapY(MAP_LOOP_B) - mapY(-2)) + '" rx="34" fill="var(--map-lawn)" stroke="var(--map-lawn-edge)" stroke-width="1.5"/>';
    /* 3. גושי עצים */
    MAP_TREES.forEach(function (tr) {
      t += '<ellipse cx="' + mapX(tr[0]).toFixed(1) + '" cy="' + mapY(tr[1]).toFixed(1) + '" rx="' + mapX(tr[2]).toFixed(1) + '" ry="' + mapY(tr[3]).toFixed(1) + '" fill="url(#mapTreeG)"/>';
    });
    /* 4. בריכה + מגרש כדורגל + דשא סינתטי שני */
    t += '<rect x="' + mapX(MAP_POOL.x) + '" y="' + mapY(MAP_POOL.y) + '" width="' + mapX(MAP_POOL.w) + '" height="' + mapY(MAP_POOL.h) + '" rx="16" fill="url(#mapPoolG)" stroke="var(--map-water-edge)" stroke-width="1.5"/>';
    t += '<rect x="' + (mapX(MAP_POOL.x) + 9) + '" y="' + (mapY(MAP_POOL.y) + 9) + '" width="' + (mapX(MAP_POOL.w) - 18) + '" height="' + (mapY(MAP_POOL.h) - 18) + '" rx="10" fill="none" stroke="#FFFFFF" stroke-opacity=".55" stroke-width="1.5"/>';
    t += '<rect x="' + mapX(MAP_FIELD.x) + '" y="' + mapY(MAP_FIELD.y) + '" width="' + mapX(MAP_FIELD.w) + '" height="' + mapY(MAP_FIELD.h) + '" rx="8" fill="#DCEBD1" stroke="#C2DCB4" stroke-width="1.5"/>';
    t += '<g stroke="#FFFFFF" stroke-opacity=".75" stroke-width="1.4" fill="none">' +
      '<rect x="' + (mapX(MAP_FIELD.x) + 7) + '" y="' + (mapY(MAP_FIELD.y) + 7) + '" width="' + (mapX(MAP_FIELD.w) - 14) + '" height="' + (mapY(MAP_FIELD.h) - 14) + '" rx="3"/>' +
      '<line x1="' + mapX(MAP_FIELD.x) + '" y1="' + (mapY(MAP_FIELD.y) + mapY(MAP_FIELD.h) / 2) + '" x2="' + (mapX(MAP_FIELD.x) + mapX(MAP_FIELD.w)) + '" y2="' + (mapY(MAP_FIELD.y) + mapY(MAP_FIELD.h) / 2) + '"/>' +
      '<circle cx="' + (mapX(MAP_FIELD.x) + mapX(MAP_FIELD.w) / 2) + '" cy="' + (mapY(MAP_FIELD.y) + mapY(MAP_FIELD.h) / 2) + '" r="14"/></g>';
    t += '<rect x="' + mapX(MAP_TURF2.x) + '" y="' + mapY(MAP_TURF2.y) + '" width="' + mapX(MAP_TURF2.w) + '" height="' + mapY(MAP_TURF2.h) + '" rx="7" fill="#DCEBD1" stroke="#C2DCB4" stroke-width="1.5"/>';
    /* 5. מסגרות הכבישים — מטושטשות קלות, כך שהכביש "זורם" על הקרקע במקום קו שרטוט קשיח */
    t += mapRoad(MAP_LOOP_PATH,  MAP_LOOP_W + 9,  'var(--map-asphalt-edge)', ' opacity=".55" filter="url(#mapSoften)"');
    t += mapRoad(MAP_CROSS_PATH, MAP_CROSS_W + 9, 'var(--map-asphalt-edge)', ' opacity=".55" filter="url(#mapSoften)"');
    t += mapRoad(MAP_DRIVE_PATH, MAP_DRIVE_W + 9, 'var(--map-asphalt-edge)', ' opacity=".55" filter="url(#mapSoften)"');
    /* 6. פני הכביש */
    t += mapRoad(MAP_LOOP_PATH,  MAP_LOOP_W,  'var(--map-asphalt)', ' opacity=".92"');
    t += mapRoad(MAP_CROSS_PATH, MAP_CROSS_W, 'var(--map-asphalt)', ' opacity=".92"');
    t += mapRoad(MAP_DRIVE_PATH, MAP_DRIVE_W, 'var(--map-asphalt)', ' opacity=".92"');
    /* 7. קו הפרדה מקווקו */
    t += mapRoad(MAP_LOOP_PATH,  2.2, 'var(--map-lane)', ' stroke-dasharray="16 14" stroke-opacity=".85"');
    t += mapRoad(MAP_CROSS_PATH, 2.2, 'var(--map-lane)', ' stroke-dasharray="16 14" stroke-opacity=".85"');
    /* 8. עגול־תנועה בכניסה — מאותם חומרי כביש בדיוק, כך שירגיש חלק מאותה מערכת כבישים */
    (function () {
      var cx = mapX(MAP_ROUNDABOUT.cx), cy = mapY(MAP_ROUNDABOUT.cy), r = mapX(MAP_ROUNDABOUT.r);
      t += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (r + 4.5).toFixed(1) + '" fill="var(--map-asphalt-edge)" opacity=".55" filter="url(#mapSoften)"/>';
      t += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="var(--map-asphalt)" opacity=".92"/>';
      t += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (r - 3).toFixed(1) + '" fill="none" stroke="var(--map-lane)" stroke-width="2.2" stroke-dasharray="7 8" stroke-opacity=".85"/>';
      t += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + (r * 0.52).toFixed(1) + '" fill="var(--map-lawn)" stroke="var(--map-lawn-edge)" stroke-width="1.5"/>';
    })();
    return t;
  })();

  CBA.screens.resMap = {
    render: function (container) {
      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">מפת השיכון</div>' +
          '<div class="screen-head__sub">שיכון פלמחים · לחצו על בית לפרטי הדיירים</div></div>' +
        '<div class="map-shell">' +
          '<div class="map-topbar">' +
            '<div class="map-search-wrap">' +
              '<span class="map-search-ic">' + searchIcon + '</span>' +
              '<input id="map-q" class="map-search" placeholder="חיפוש לפי מספר בית, שם משפחה או ילד…" autocomplete="off">' +
              '<div class="map-search-results" id="map-results"></div>' +
            '</div>' +
            '<button type="button" class="map-legend-toggle" id="map-legend-toggle" aria-label="מקרא">?</button>' +
            '<div class="map-legend" id="map-legend">' +
              '<i><b class="lg-house"></b>בית</i>' +
              '<i><b class="lg-amen"></b>מבנה ציבור</i>' +
              '<i><b class="lg-park"></b>חניון</i>' +
              '<i><b class="lg-road"></b>כביש</i>' +
            '</div>' +
          '</div>' +
          '<div class="map-viewport" id="map-viewport"><div class="map-world" id="map-world"></div></div>' +
          '<div class="map-toolbar">' +
            '<button type="button" class="map-btn" id="map-zoom-in" aria-label="הגדלה">' + plusIcon + '</button>' +
            '<button type="button" class="map-btn" id="map-zoom-out" aria-label="הקטנה">' + minusIcon + '</button>' +
            '<hr>' +
            '<button type="button" class="map-btn" id="map-fit" aria-label="התאמה למסך">' + fitIcon + '</button>' +
          '</div>' +
          '<div class="map-hint">גררו כדי לנוע · גלגלת/צביטה כדי לזום · לחצו על בית לפרטים</div>' +
        '</div>';

      var viewport = container.querySelector("#map-viewport");
      var worldEl = container.querySelector("#map-world");
      var qEl = container.querySelector("#map-q");
      var resultsEl = container.querySelector("#map-results");

      worldEl.style.width = MAP_WORLD_W + "px";
      worldEl.style.height = MAP_WORLD_H + "px";
      worldEl.insertAdjacentHTML("afterbegin",
        '<svg class="map-terrain" width="' + MAP_WORLD_W + '" height="' + MAP_WORLD_H + '" viewBox="0 0 ' + MAP_WORLD_W + ' ' + MAP_WORLD_H + '">' + MAP_TERRAIN_SVG + '</svg>' +
        '<div class="map-grain"></div>');

      function px(p) { return mapX(p); }
      function py(p) { return mapY(p); }

      // חניונים
      MAP_PARKING.forEach(function (p) {
        var el = document.createElement("div");
        el.className = "map-parking";
        el.style.cssText = "left:" + px(p.x) + "px;top:" + py(p.y) + "px;width:" + px(p.w) + "px;height:" + py(p.h) + "px";
        el.innerHTML = '<span class="map-parking__chip">P</span>';
        worldEl.appendChild(el);
      });

      // רחובות — 9 שמות מהתשריט. type:'road' יושב ישירות על אחד משני הכבישים הראשיים
      // (תבור/הבשור) ומקבל גם קו מקווקו משלו על הכביש; type:'h'/'v' הם שבילי מדרחוב.
      MAP_STREETS.forEach(function (s) {
        var lbl = document.createElement("span");
        lbl.textContent = s.name;
        if (s.type === "road") {
          lbl.className = "map-street__label map-street__label--road";
          var ry = py(s.y), rx1 = px(s.x1), rx2 = px(s.x2);
          lbl.style.cssText = "left:" + (rx1 + (rx2 - rx1) / 2) + "px;top:" + ry + "px;transform:translate(-50%,-50%)";
          var rel = document.createElement("div");
          rel.className = "map-street map-street--h map-street--onroad";
          rel.style.cssText = "top:" + ry + "px;left:" + rx1 + "px;width:" + (rx2 - rx1) + "px";
          worldEl.appendChild(rel);
          worldEl.appendChild(lbl);
          return;
        }
        var el = document.createElement("div");
        lbl.className = "map-street__label";
        if (s.type === "h") {
          el.className = "map-street map-street--h";
          var y = py(s.y), x1 = px(s.x1), x2 = px(s.x2);
          el.style.cssText = "top:" + y + "px;left:" + x1 + "px;width:" + (x2 - x1) + "px";
          lbl.style.cssText = "left:" + (x1 + (x2 - x1) / 2) + "px;top:" + (y - 10) + "px;transform:translateX(-50%)";
        } else {
          el.className = "map-street map-street--v";
          var xx = px(s.x), yy1 = py(s.y1), yy2 = py(s.y2);
          el.style.cssText = "left:" + xx + "px;top:" + yy1 + "px;height:" + (yy2 - yy1) + "px";
          lbl.style.cssText = "left:" + (xx + 9) + "px;top:" + (yy1 + (yy2 - yy1) / 2) + "px;transform:translateY(-50%)";
        }
        worldEl.appendChild(el);
        worldEl.appendChild(lbl);
      });

      // מבני ציבור
      MAP_AMENITIES.forEach(function (a) {
        var bw = px(a.w), bh = py(a.h);
        var el = document.createElement("div");
        el.className = "map-amenity" + (a.park ? " is-park" : "") + (a.shape ? " map-amenity--" + a.shape : "");
        el.style.cssText = "left:" + px(a.x) + "px;top:" + py(a.y) + "px;width:" + bw + "px;height:" + bh + "px";
        var roomInside = bw >= 68 && bh >= 50;
        el.innerHTML = '<span class="map-amenity__chip">' + svg(amenIcons[a.ico]) + '</span>' +
          (roomInside ? '<span class="map-amenity__in">' + CBA.esc(a.label) + '</span>' : "");
        worldEl.appendChild(el);
        if (!roomInside) {
          var lbl = document.createElement("span");
          lbl.className = "map-amenity__label";
          lbl.textContent = a.label;
          lbl.style.cssText = "left:" + (px(a.x) + bw / 2) + "px;top:" + (py(a.y) + bh + 5) + "px";
          worldEl.appendChild(lbl);
        }
      });

      // תווית זכוכית צפה מתחת לאלמנט — אותה שפה כמו תוויות מבני הציבור
      function floatLabel(x, y, w, h, text, extraClass) {
        var lbl = document.createElement("span");
        lbl.className = "map-amenity__label" + (extraClass ? " " + extraClass : "");
        lbl.textContent = text;
        lbl.style.cssText = "left:" + (px(x) + px(w) / 2) + "px;top:" + (py(y) + py(h) + 5) + "px";
        worldEl.appendChild(lbl);
      }

      // אולם ספורט
      (function () {
        var el = document.createElement("div");
        el.className = "map-hall";
        el.style.cssText = "left:" + px(MAP_SPORTS_HALL.x) + "px;top:" + py(MAP_SPORTS_HALL.y) + "px;width:" + px(MAP_SPORTS_HALL.w) + "px;height:" + py(MAP_SPORTS_HALL.h) + "px";
        el.innerHTML = '<span class="map-amenity__chip">' + svg(amenIcons.sport) + '</span>';
        worldEl.appendChild(el);
        floatLabel(MAP_SPORTS_HALL.x, MAP_SPORTS_HALL.y, MAP_SPORTS_HALL.w, MAP_SPORTS_HALL.h, "אולם ספורט");
      })();

      // מגרש דשא סינתטי שני
      floatLabel(MAP_TURF2.x, MAP_TURF2.y, MAP_TURF2.w, MAP_TURF2.h, "מגרש סינתטי");

      // מגרשי טניס וכדורסל
      [["tennis", MAP_TENNIS, "מגרש טניס"], ["basketball", MAP_BASKETBALL, "מגרש כדורסל"]].forEach(function (pair) {
        var el = document.createElement("div");
        el.className = "map-court " + pair[0];
        var c = pair[1];
        el.style.cssText = "left:" + px(c.x) + "px;top:" + py(c.y) + "px;width:" + px(c.w) + "px;height:" + py(c.h) + "px";
        el.innerHTML = '<span class="map-court__lines"></span>' +
          (pair[0] === "tennis" ? '<span class="map-court__net"></span>' : '<span class="map-court__hoop"></span>');
        worldEl.appendChild(el);
        floatLabel(c.x, c.y, c.w, c.h, pair[2], "map-amenity__label--court");
      });

      // מבנה ציון־דרך ליד הכניסה (גג פינוויל) — גני ילדים
      (function () {
        var bw = px(MAP_LANDMARK.w), bh = py(MAP_LANDMARK.h);
        var el = document.createElement("div");
        el.className = "map-landmark";
        el.style.cssText = "left:" + px(MAP_LANDMARK.x) + "px;top:" + py(MAP_LANDMARK.y) + "px;width:" + bw + "px;height:" + bh + "px";
        el.innerHTML = '<span class="map-landmark__chip">' + svg(amenIcons[MAP_LANDMARK.ico]) + '</span>';
        worldEl.appendChild(el);
        var lbl = document.createElement("span");
        lbl.className = "map-landmark__label";
        lbl.textContent = MAP_LANDMARK.label;
        lbl.style.cssText = "left:" + (px(MAP_LANDMARK.x) + bw + 8) + "px;top:" + (py(MAP_LANDMARK.y) + bh / 2) + "px";
        worldEl.appendChild(lbl);
      })();

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
      function maxScale() { return fitScaleVal * 4.5; }
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
      }
      var openTile = null, curTier = -1;
      function apply() {
        clampPan();
        worldEl.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
        var r = scale / fitScaleVal;
        var tier = r > MAP_T2 ? 2 : (r > MAP_T1 ? 1 : 0);
        if (tier !== curTier) {
          curTier = tier;
          worldEl.classList.toggle("tier1", tier === 1);
          worldEl.classList.toggle("tier2", tier === 2);
        }
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
        var el = houseEls[num];
        if (!el) return;
        closePopup();
        el.classList.add("active-tile");
        if (!popupEl) { popupEl = document.createElement("div"); popupEl.className = "map-popup"; viewport.appendChild(popupEl); }
        var row = byHouse[normHouse(num)];
        popupEl.innerHTML = '<button type="button" class="map-popup__close" aria-label="סגור">' + xIcon + '</button>' +
          (row && dirC ? dirHouseHTML(row, dirC) : '<div class="card dir-card"><div class="dir-card__house">בית ' + CBA.esc(num) + '</div><div class="dir-card__names">אין נתונים זמינים לבית זה.</div></div>');
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
      qEl.addEventListener("input", function () { runSearch(qEl.value); });
      qEl.addEventListener("focus", function () { if (qEl.value.trim()) resultsEl.classList.add("show"); });
      document.addEventListener("click", function (e) {
        if (!document.body.contains(qEl)) return;
        if (!e.target.closest(".map-search-wrap")) resultsEl.classList.remove("show");
      });

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
      if (window.matchMedia("(max-width: 720px)").matches) {
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
        resultsEl.classList.remove("show"); qEl.blur();
        var targetScale = fitScaleVal * MAP_T2 * 1.2;
        var cx = px(t.x + t.w / 2), cy = py(t.y + t.h / 2);
        scale = Math.max(minScale(), Math.min(maxScale(), targetScale));
        tx = viewport.clientWidth / 2 - cx * scale; ty = viewport.clientHeight / 2 - cy * scale;
        worldEl.style.transition = "transform .45s cubic-bezier(.2,.6,.2,1)";
        setTimeout(function () { worldEl.style.transition = ""; }, 460);
        apply();
        setTimeout(function () { openPopup(num); }, 220);
      }

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
    }
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
        '<div id="org-body"><div class="rs-empty"><p>טוען…</p></div></div>';
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
          bodyEl.innerHTML = '<div class="rs-empty"><p>עדיין לא הוגדר עץ ועד.</p></div>';
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


})();
