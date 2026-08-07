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
  var clockIcon  = svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>');
  var chevLeftIcon  = svg('<path d="M15 6l-6 6 6 6"/>');
  var chevRightIcon = svg('<path d="M9 6l6 6-6 6"/>');
  var calCheckIcon  = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/><path d="M8.5 14.5l2 2 4.5-4.5"/>');
  var calGridIcon   = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><circle cx="8" cy="15" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>');

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
          '<input type="file" id="rs-file" accept="image/*,application/pdf" capture="environment" hidden>' +
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

      function showError(msg) { errEl.textContent = msg; errEl.hidden = false; }
      function hideError() { errEl.hidden = true; }

      function renderUploadEmpty() {
        uploadEl.classList.remove("is-filled", "is-busy");
        uploadEl.innerHTML = cameraIcon + '<b>צילום או העלאת קבלה</b><small>JPG, PNG או PDF</small>';
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
          renderUploadEmpty();
        });
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
        processing = true;
        renderUploadBusy();
        var isImage = file.type.indexOf("image/") === 0;
        var handler = isImage ? compressImage : readFileAsBase64;
        handler(file, function (err, result) {
          processing = false;
          if (err) {
            showError(err.message || "שגיאה בעיבוד הקובץ");
            renderUploadEmpty();
            return;
          }
          result.size = isImage ? Math.round((result.dataBase64.length * 3) / 4) : file.size;
          picked = result;
          renderUploadFilled();
        });
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

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<div class="rs-spin"></div><span>שולח…</span>';

        var fields = {
          expenseType: expenseType,
          amount: parseFloat(val("#rs-amount")),
          supplier: val("#rs-supplier"),
          description: val("#rs-desc"),
          buyer: fullName(u),
          email: u.email || "",
          fileName: picked.fileName,
          mimeType: picked.mimeType,
          dataBase64: picked.dataBase64
        };
        if (expenseType === "supplier") {
          fields.bankName = val("#rs-bank-name");
          fields.bankBranch = val("#rs-bank-branch");
          fields.bankAccount = val("#rs-bank-account");
        }

        CBA.data.submitReceipt(fields, function (res) {
          if (res && res.ok) {
            renderSent();
          } else {
            submitBtn.disabled = false;
            submitBtn.innerHTML = sendIcon + ' <span>שלח בקשה</span>';
            showError("השליחה נכשלה — בדקו את החיבור לאינטרנט ונסו שוב.");
          }
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
  function closeAnyModal() {
    var el = document.getElementById("cba-modal");
    if (el) el.remove();
    document.removeEventListener("keydown", escAnyModal);
  }
  function escAnyModal(e) { if (e.key === "Escape") closeAnyModal(); }

  CBA.screens.resReserve = {
    render: function (container) {
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

    function hideForm() { state.selStart = state.selEnd = null; formEl.hidden = true; formEl.innerHTML = ""; }
    function showMsg(cls, html) { msgEl.className = "rs-club__msg " + cls; msgEl.innerHTML = html; msgEl.hidden = false; }
    function clearMsg() { msgEl.hidden = true; msgEl.innerHTML = ""; }

    function renderForm() {
      if (state.selStart == null) { formEl.hidden = true; formEl.innerHTML = ""; return; }
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
      if (!window.confirm("לבטל את השריון? הפעולה תמחק את האירוע מהיומן.")) return;
      btn.disabled = true;
      btn.innerHTML = '<div class="rs-spin"></div>מבטל…';
      var id = btn.dataset.cancel;
      CBA.data.cancelClubReservation({ id: id, family: fam, email: u.email || "" }, function (r) {
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
          window.alert((r && r.error) || "הביטול נכשל, נסו שוב.");
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
})();
