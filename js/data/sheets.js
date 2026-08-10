/* sheets.js — חיבור ל-Google Sheets (שלב קריאה בלבד).
   מושך JSON מ-Apps Script וממיר אותו למבנה הפנימי של האפליקציה (אותו מבנה כמו mock),
   כך שכל המסכים ושכבת הנתונים ממשיכים לעבוד בלי שינוי.
   העברית שבגיליון ממופה למפתחות הפנימיים (סטטוס/סוג/מקור/מצב חלוקה). */

window.CBA = window.CBA || {};

CBA.sheets = (function () {
  "use strict";

  // כתובת ה-Web App (מ-Apps Script). אם תשתנה — לעדכן כאן בלבד.
  var API_URL = "https://script.google.com/macros/s/AKfycbw_LLAk8s6u1wK-7zY3P3emjXaDeTCla-KqgvfD-Rgt5RTfWw6ldNkb7DbrhSUknS4o/exec";

  // מיפוי ערכי הגיליון (עברית) -> מפתחות פנימיים
  var STATUS_MAP = { "הוגשה קבלה": "submitted", "בבדיקה": "review", 'הועבר להנה"ח': "ready", "שולם": "paid", "נדחה": "rejected" };

  /* פענוח הסטטוס מהגיליון (2026-08-06 — תיקון באג).
     בשלב שיוך המשפחות נכתבו לעמודת "סטטוס" ערכים ארוכים ומפורטים שמתחילים ב-
     "בדיקה - ..." (למשל: 'בדיקה - שיוך משפחה: השם "..." לא זוהה בוודאות').
     STATUS_MAP מכיר רק את הערך המדויק "בבדיקה", ולכן כל השורות האלה נפלו
     לברירת המחדל "שולם" — 75 מתוך 135 שורות הוצגו כמשולמות במקום כדורשות
     בדיקה. עכשיו כל סטטוס שמתחיל ב-"בדיקה" מזוהה כ-review, וכל הטקסט המפורט
     נשמר כהערת בדיקה כדי שלא יאבד המידע למה השורה סומנה. */
  function parseStatus(raw, existingNote) {
    var s = String(raw || "").trim();
    if (STATUS_MAP[s]) return { status: STATUS_MAP[s], note: existingNote };
    if (s.indexOf("בדיקה") === 0) {
      var detail = s.replace(/^בדיקה\s*[-–—:]\s*/, "").trim() || s;
      return { status: "review", note: existingNote ? (existingNote + " | " + detail) : detail };
    }
    return { status: STATUS_MAP[s] || "paid", note: existingNote };
  }
  var TYPE_MAP   = { "החזר לדייר": "refund", "תשלום לספק": "supplier", "הוצאה כללית": "general" };
  var SOURCE_MAP = { "מנהל": "admin", "תושב": "resident" };
  var DIST_MAP   = { "שווה": "equal", "מותאם": "custom", "שנתי": "unplanned" };
  var MONTH_KEYS = ["תכנון ספט","תכנון אוק","תכנון נוב","תכנון דצמ","תכנון ינו","תכנון פבר",
                    "תכנון מרץ","תכנון אפר","תכנון מאי","תכנון יוני","תכנון יולי","תכנון אוג"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // מנרמל תאריך לכל פורמט אפשרי -> "YYYY-MM-DD" (כולל תיקון אזור־זמן ל-ISO מגוגל)
  function normDate(v) {
    if (v === null || v === undefined || v === "") return "";
    v = String(v);
    var dmy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);          // DD/MM/YYYY
    if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
    var isoT = v.match(/^(\d{4})-(\d{2})-(\d{2})T/);          // ISO מגוגל — עם היסט אזור־זמן
    if (isoT) { var d = new Date(v); d.setTime(d.getTime() + 12 * 3600 * 1000);
                return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
    var ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})/);            // YYYY-MM-DD
    if (ymd) return ymd[1] + "-" + ymd[2] + "-" + ymd[3];
    return v.slice(0, 10);
  }

  // splitsByName: { שם סעיף: [ {"מקור הכנסה":..., "סכום":...}, ... ] } — מגיע
  // מטאב "פיצול מימון <שנה>" (סעיף 4, 2026-08-10). itemsByName: { שם סעיף:
  // [ {"פריט":..., "תכנון":...}, ... ] } — מגיע מטאב "פירוט סעיפים <שנה>"
  // (סעיף 5, 2026-08-10). שניהם אופציונליים — נבנים ע"י הקורא (transform)
  // ומועברים פנימה, כדי ש-toCategory יישאר פונקציה טהורה על פני שורה.
  function toCategory(row, splitsByName, itemsByName) {
    var monthly = MONTH_KEYS.map(function (k) { return num(row[k]); });
    var mode = DIST_MAP[String(row["מצב חלוקה"] || "").trim()] || "equal";
    var months = monthly.filter(function (x) { return x > 0; }).length || 12;
    var name = String(row["סעיף"]).trim();
    var cat = {
      id: name,
      name: name,
      plan: num(row["תכנון שנתי"]),
      group: String(row["קבוצה"] || "").trim(),
      incomeSourceId: String(row["מקור מימון"] || "").trim(),
      dist: { mode: mode, months: months, monthly: mode === "custom" ? monthly : null }
    };
    // פיצול בין כמה מקורות הכנסה (סעיף 4, 2026-08-10) — רק אם יש 2+ שורות
    // פיצול לסעיף הזה; אחרת הוא לא "מפוצל", וממשיך עם incomeSourceId הרגיל.
    var splitRows = splitsByName && splitsByName[name];
    if (splitRows && splitRows.length > 1) {
      cat.sources = splitRows.map(function (r) {
        return { incomeSourceId: String(r["מקור הכנסה"] || "").trim(), amount: num(r["סכום"]) };
      });
      cat.incomeSourceId = cat.sources[0].incomeSourceId;
    }
    // פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10) — בשונה מ-sources למעלה, גם
    // פריט יחיד תקף (ר' normalizeCategory ב-dataService.js).
    var itemRows = itemsByName && itemsByName[name];
    if (itemRows && itemRows.length) {
      cat.items = itemRows.map(function (r) {
        return { id: String(r["פריט"] || "").trim(), name: String(r["פריט"] || "").trim(), plan: num(r["תכנון"]) };
      });
    }
    return cat;
  }

  function toIncome(row) {
    var type = (String(row["סוג"] || "").trim() === "מחושב") ? "dues" : "fixed";
    var s = { id: String(row["מקור"]).trim(), name: String(row["מקור"]).trim(), type: type, amount: num(row["סכום"]) };
    if (type === "dues") {
      s.rate = num(row["תעריף"]); s.families = num(row["משפחות"]);
      s.months = num(row["חודשים"]); s.tailFamilies = num(row["חודש אחרון"]); s.tailMonths = 1;
    }
    return s;
  }

  // כותרות תנועה "מוכרות" לאפליקציה — כל עמודה אחרת בשורה (שהמנהל הוסיף דרך
  // "ניהול עמודות", סעיף 6, 2026-08-06) נאספת אוטומטית ל-customFields, כדי שגם
  // עמודות מותאמות אישית עתידיות ייקלטו בלי לגעת כאן שוב.
  var KNOWN_TX_HEADERS = ["מזהה", "חודש הגשה", "תאריך רכישה", "רוכש", "ספק/נמען", "בנק", "סכום",
    "סעיף", "תת-סעיף", "סוג הוצאה", "מקור", "סטטוס", "הערת בדיקה", "תיאור", "שם קובץ קבלה", "קישור קבלה", "מזהה משפחה"];

  function toTx(row, year) {
    var bank = String(row["בנק"] || "").trim();
    var d = normDate(row["תאריך רכישה"]);
    var m = normDate(row["חודש הגשה"]).slice(0, 7);
    var customFields = {};
    Object.keys(row).forEach(function (k) {
      if (KNOWN_TX_HEADERS.indexOf(k) === -1 && row[k] !== "" && row[k] != null) customFields[k] = row[k];
    });
    var st = parseStatus(row["סטטוס"], String(row["הערת בדיקה"] || ""));
    return {
      id: num(row["מזהה"]) || row["מזהה"],
      month: m, date: d,
      buyer: String(row["רוכש"] || ""),
      supplier: String(row["ספק/נמען"] || ""),
      bankName: bank, bankBranch: "", bankAccount: "",
      amount: num(row["סכום"]),
      categoryId: String(row["סעיף"] || "").trim(),
      // תת-סעיף (סעיף 5, 2026-08-10) — קישור אופציונלי לפריט ספציפי בתוך הסעיף
      subItemId: String(row["תת-סעיף"] || "").trim(),
      expenseType: TYPE_MAP[String(row["סוג הוצאה"] || "").trim()] || "supplier",
      source: SOURCE_MAP[String(row["מקור"] || "").trim()] || "admin",
      status: st.status,
      reviewNote: st.note,
      description: String(row["תיאור"] || ""),
      receiptUrl: String(row["קישור קבלה"] || ""),
      payType: (TYPE_MAP[String(row["סוג הוצאה"] || "").trim()] === "refund") ? "refund" : "supplier",
      // מזהה משפחה מקושר (2026-08-06) — מספר הבית של התושב האחראי/מטפל. עשוי
      // להיות ריק בשורות ישנות שטרם שויכו, או בכוונה בשורות שאין להן שיוך.
      familyId: String(row["מזהה משפחה"] || ""),
      // שדות מותאמים אישית (סעיף 6, 2026-08-06) — {שם עמודה: ערך}
      customFields: customFields,
      year: year
    };
  }

  function transform(payload) {
    var years = {};
    (payload.years || []).forEach(function (y) {
      var d = payload.data[y] || {};
      var closed = payload.settings && payload.settings["מצב תקציב " + y] === "סגור";
      var baseline = null;
      var braw = payload.settings && payload.settings["בסיס תקציב " + y];
      if (braw) { try { baseline = JSON.parse(braw); } catch (e) { baseline = null; } }
      // קבוצות פר-שנה (סעיף 3, 2026-08-09) — d.groups קיים (גם אם ריק) בשרת
      // מעודכן; d.groups === undefined רק אם השרת עדיין בגרסה הישנה (לפני
      // שהודבק/פורסם Code.gs החדש) — אז נופלים לשדה השטוח הישן payload.groups
      // (עדיין נשלח לתאימות לאחור, ר' doGet ב-Code.gs), כדי לא לאבד את
      // הקבוצות בזמן המעבר בין שמירה בקוד ללחיצת Deploy בפועל.
      var yearGroupsRaw = (d.groups !== undefined) ? d.groups : (payload.groups || []);
      // פיצול מימון פר-שנה (סעיף 4, 2026-08-10) — d.splits הוא רשימת שורות
      // שטוחה מטאב "פיצול מימון <שנה>"; מקבצים לפי שם סעיף לפני שמעבירים ל-toCategory.
      var splitsByName = {};
      (d.splits || []).forEach(function (r) {
        var name = String(r["סעיף"] || "").trim();
        if (!name) return;
        (splitsByName[name] = splitsByName[name] || []).push(r);
      });
      // פירוט סעיפים פר-שנה (סעיף 5, 2026-08-10) — d.items הוא רשימת שורות
      // שטוחה מטאב "פירוט סעיפים <שנה>"; מקבצים לפי שם סעיף לפני toCategory.
      var itemsByName = {};
      (d.items || []).forEach(function (r) {
        var name = String(r["סעיף"] || "").trim();
        if (!name) return;
        (itemsByName[name] = itemsByName[name] || []).push(r);
      });
      years[y] = {
        income: (d.income || []).map(toIncome),
        categories: (d.budget || []).map(function (row) { return toCategory(row, splitsByName, itemsByName); }),
        transactions: (d.transactions || []).map(function (r) { return toTx(r, y); }),
        budget: { phase: closed ? "locked" : "draft", lockedAt: null, baseline: baseline },
        // פנקס הערות (סעיף 1) — payload.notes הוא מפה {שנה: {content, editedBy, editedAt}}
        // שנקראת ב-Code.gs מטאב "הערות" (שורה אחת לכל שנה, לא טאב פר-שנה)
        notes: (payload.notes && payload.notes[y]) || { content: "", editedBy: "", editedAt: "" },
        groups: yearGroupsRaw.map(function (g) { return { id: g, name: g }; })
      };
    });
    var updates = (payload.updates || []).map(function (r) {
      return {
        date: normDate(r["תאריך"]),
        year: String(r["שנה"] || "").trim(),
        section: String(r["סעיף"] || "").trim(),
        from: num(r["מ"]), to: num(r["אל"]),
        reason: String(r["סיבה"] || "")
      };
    });
    // יומן עריכות פנקס ההערות (סעיף 1) — כרונולוגי, אותו רעיון כמו "updates" למעלה
    var notesLog = (payload.notesLog || []).map(function (r) {
      return {
        date: normDate(r["תאריך"]),
        time: String(r["שעה"] || "").trim(),
        year: String(r["שנה"] || "").trim(),
        editedBy: String(r['נערך ע"י'] || "").trim()
      };
    });
    return {
      years: years,
      yearList: (payload.years || []).slice(),
      currentYear: payload.currentYear || (payload.years || [])[0],
      settings: payload.settings || {},
      version: payload.version || "",
      budgetUpdates: updates,
      notesLog: notesLog
    };
  }

  /* --- הבטחת "לא לרדת בגרסה" (2026-08-09, הורחב לאחר דוגמאות נוספות) ---
     דווחו כמה תסמינים: עדכון תקציב/העברת סעיף לקבוצה אחרת "לא נשמר באמת";
     הרענון התקופתי (כל 3 שניות) "קופץ" בחזרה לשנה שנמצאת כברירת מחדל; הסרת
     סעיף - הוא נעלם, אחרי כמה שניות חוזר, ואז שוב נעלם; עדכון תעריף מיסי
     שיכון כמה פעמים - כל פעם חוזר לסכום הישן. כולם אותה משפחת באג: יש כאן
     שני "מרוצים" (races) שונים בין קריאה (GET, רענון) לכתיבה (POST, שמירה):

     מרוץ 1 - עריכה שנדרסת *לפני* שנשלחה: אם רענון קורה בדיוק בין הרגע
     שנערך שינוי במסך (למשל גרר סעיף לקבוצה אחרת) לבין הרגע שהשמירה המושהית
     (700ms ב-planning.js) בפועל נשלחה - הרענון דורס את העריכה בזיכרון לפני
     שהיא נשלחה בכלל. פתרון: isDirty()/markDirty()/clearDirty() למטה - כל
     עוד "יש עריכה שטרם אושרה", אין שום רענון רקע (ר' apply()).

     מרוץ 2 (החדש, שמסביר "חוזר אחרי כמה שניות ונעלם שוב" ו"תמיד חוזר לישן"):
     גם בלי חפיפה בזמן העריכה - יכולה להיות בקשת GET שכבר נשלחה לשרת *לפני*
     שהשמירה החלה, ומחזירה תשובה (עם הנתונים הישנים, מלפני השמירה) רק *אחרי*
     שהשמירה כבר הסתיימה בהצלחה. מכיוון שתשובות רשת לא בהכרח חוזרות לפי סדר
     השליחה, "התשובה האחרונה שהגיעה" לא באמת אומרת "הנתונים העדכניים ביותר".
     פתרון: לכל בקשת GET יש מספר סידורי (seq) שנתפס ברגע השליחה. תשובה
     מתקבלת ומיושמת רק אם ה-seq שלה גבוה מ-writeFloor (הרף שמתעדכן בכל פעם
     ששמירה מסתיימת - "כל דבר שנשלח לפני הרגע הזה עלול להיות ישן, תתעלמו
     ממנו") וגם גבוה מ-lastAppliedSeq (כדי לא ליישם תשובה שהגיעה באיחור אחרי
     תשובה חדשה יותר שכבר יושמה). וגם - inFlightWrites הופך את isDirty()
     לאוטומטי לגמרי: ברגע ש-push() נשלח, האפליקציה "יודעת" שיש כתיבה
     בעיצומה בלי שאף מסך צריך לקרוא ל-markDirty בעצמו. כך גם מסכים שעוד לא
     חוברו למנגנון (הוצאות, תושבים, מועדון...) מוגנים אוטומטית - לא רק
     planning.js. markDirty/clearDirty נשארים בנוסף לכך, לכיסוי הפער בין
     עריכה לבין רגע השליחה בפועל (שמירה מושהית). */
  /* (2026-08-09, סבב הרחבה נוסף) עבר ממשתנה בוליאני יחיד לסט של "סיבות"
     עצמאיות. הבעיה בבוליאן יחיד: markDirty()/clearDirty() בלי פרמטר משתפים
     דגל גלובלי אחד — אם שני דברים בלתי-תלויים "מלוכלכים" בו-זמנית (למשל
     debounce של planSave() באמצע וגם drawer/מודל פתוח במסך אחר), clearDirty()
     של אחד היה מנקה גם את ההגנה שהשני עדיין נשען עליה. עכשיו לכל "סיבה" יש
     מפתח משלה (מחרוזת) בתוך אובייקט-כמו-Set: markDirty("planSave") אידמפוטנטי
     (קריאה חוזרת תוך כדי הקלדה לא "מצטברת"), וקריאה אחת ל-clearDirty("planSave")
     תמיד מנקה את זה במלואו בלי קשר לכמה markDirty קדמו לה — וסיבות שונות
     (planSave מול notesSave מול receiptUpload) לא נוגעות זו בזו כלל. קריאה
     בלי פרמטר (קוד ישן שלא עודכן) משתמשת במפתח משותף "_default" — תואם לאחור,
     אבל עדיין כדאי שכל קריאה חדשה תעביר מחרוזת-סיבה ייחודית משלה. */
  var dirtyReasons = Object.create(null);
  var seqCounter = 0;      // מספר סידורי עולה, אחד לכל בקשת GET (טעינה/רענון)
  var lastAppliedSeq = 0;  // ה-seq הגבוה ביותר שבאמת יושם על CBA.mock עד כה
  var writeFloor = 0;      // תשובת GET עם seq <= זה נחשבת "עלולה להיות מלפני שמירה" - נדחית
  var inFlightWrites = 0;  // כתיבות (push) שכרגע ברשת ועוד לא אושרו
  function isDirty() { return Object.keys(dirtyReasons).length > 0 || inFlightWrites > 0; }

  /* --- חיווי "שומר…/נשמר ✓" גלובלי (2026-08-09) ---
     יועד ביקש שתמיד יהיה ברור אם משהו עדיין נשמר או שהשמירה הסתיימה — לכל
     מסך, לא רק לתכנון תקציב. במקום שכל מסך יצייר בועת "נשמר" משלו, המקום
     הזה (שכבר עוקב מרכזית אחרי כל כתיבה, ר' מעלה) פשוט משדר אירוע בדפדפן
     בכל פעם שהמצב הכולל (isDirty) משתנה — ו-app.js מאזין לו ומצייר בועה
     אחת גלובלית. אם דפדפן ישן לא תומך ב-CustomEvent, זה נכשל בשקט (רק
     החיווי הוויזואלי לא יופיע — שום פונקציונליות לא נשברת). */
  var lastDirtyState = false;
  var lastWriteHadError = false;
  function notifyDirtyChange() {
    var d = isDirty();
    if (d === lastDirtyState) return;
    lastDirtyState = d;
    try {
      window.dispatchEvent(new CustomEvent("cba:dirty-change", { detail: { dirty: d, error: d ? null : lastWriteHadError } }));
    } catch (e) { /* לא קריטי */ }
    if (!d) lastWriteHadError = false;
  }
  function markDirty(reason) { dirtyReasons[reason || "_default"] = true; notifyDirtyChange(); }
  function clearDirty(reason) { delete dirtyReasons[reason || "_default"]; notifyDirtyChange(); }

  /* מחליף את תוכן CBA.mock בנתונים מהגיליון (תכונות הגישה נשארות תקפות).
     מחזירה true אם באמת יושם (fetchAndApply משתמש בזה כדי לעדכן lastAppliedSeq
     רק כשבאמת קרה שינוי, לא כשהוחלט לדלג). isBackgroundRefresh=true means the
     app is already running and this call comes from the periodic 3s poll
     (refresh()), not from the first load:
     - אם יש עריכה מקומית שטרם אושרה (isDirty) - מדלגים על כל ההחלפה, כדי לא
       לדרוס אותה. המחזור הבא (3 שניות אחר כך) יתפוס את הנתונים העדכניים.
     - את currentYear לא דורסים בחזרה לברירת המחדל של השרת ברענון רקע - כדי
       שרענון תקופתי לא "יקפיץ" את המשתמש חזרה לשנה שמוגדרת כברירת מחדל
       בהגדרות בזמן שהוא צופה/עורך שנה אחרת שבחר. אם השנה הנוכחית כבר לא
       קיימת ברשימת השנים העדכנית (מקרה קצה) - נופלים בחזרה לברירת המחדל
       מהשרת, כדי לא להישאר על שנה שלא קיימת. */
  function apply(store, isBackgroundRefresh) {
    if (isBackgroundRefresh && isDirty()) return false;
    // groups כבר לא שדה שטוח נפרד — הוא מקונן בתוך store.years[y].groups
    // ומועתק אוטומטית ע"י השורה הבאה (סעיף 3, קבוצות פר-שנה).
    CBA.mock.years = store.years;
    CBA.mock.yearList = store.yearList;
    if (!isBackgroundRefresh || !CBA.mock.years[CBA.mock.currentYear]) {
      CBA.mock.currentYear = store.currentYear;
    }
    CBA.mock._source = "sheets";
    CBA.mock._settings = store.settings || {};
    // גרסת השרת שעונה בפועל — כדי שאפשר יהיה לראות מיד אם ה-Apps Script עודכן
    CBA.mock._serverVersion = store.version || "";
    CBA.mock.budgetUpdates = store.budgetUpdates || [];
    CBA.mock.notesLog = store.notesLog || [];
    return true;
  }

  /* --- מושב חתום (2026-08-07) ---
     עד היום כל פעולת כתיבה נשלחה עם סיסמת המנהל, שהגיעה ללקוח בתוך ההגדרות —
     כלומר כל מי שהיה מחובר החזיק אותה. מעכשיו השרת מנפיק בהתחברות מושב חתום
     אישי (HMAC), והוא זה שנשלח בכל כתיבה. השרת קורא ממנו את האימייל, ומצליב
     את ההרשאות מול הגיליון בכל בקשה מחדש. app.js מגדיר את CBA.authSession. */
  function authSession() { return (window.CBA && CBA.authSession) || ""; }

  /* כשהשרת עונה "אין הרשאה", ברוב המקרים הסיבה אינה שבאמת חסרה הרשאה אלא אחת
     משתיים: אין מושב חתום (צריך להתחבר מחדש), או שה-Apps Script עוד לא פורסם
     בגרסה החדשה. מוסיפים את ההסבר להודעת השגיאה במקום להשאיר "אין הרשאה" יבש
     שאי אפשר לעשות איתו כלום. */
  // הגרסה המינימלית של ה-Apps Script שהאפליקציה הזו יודעת לעבוד מולה
  var MIN_SERVER = 28;
  function serverVer() {
    var m = String((CBA.mock && CBA.mock._serverVersion) || "").match(/v(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function authNote() {
    var raw = (CBA.mock && CBA.mock._serverVersion) || "";
    var n = serverVer();
    if (n && n < MIN_SERVER) {
      return ' — ה-Apps Script עדיין בגרסה "' + raw + '". צריך להדביק את Code.gs העדכני ולפרסם New version.';
    }
    if (!authSession()) return " — אין מושב פעיל. צא והתחבר מחדש.";
    return "";
  }
  // חשוף כדי שהאפליקציה תוכל להציג התראה גם בלי שנכשלה פעולה
  CBA.serverOutdated = function () { var n = serverVer(); return n > 0 && n < MIN_SERVER; };
  function withAuthNote(data) {
    if (data && data.ok === false && typeof data.error === "string" &&
        data.error.indexOf("הרשאה") !== -1) {
      data.error += authNote();
    }
    return data;
  }

  // מפתח המטמון המקומי. שינוי הגרסה מבטל מטמון ישן (למשל אם מבנה הנתונים משתנה).
  var CACHE_KEY = "cba_data_v2";   // v2 (2026-08-07): מטמון ישן הכיל את סיסמת המנהל — נזרק

  // שולפת מהגיליון, מחילה על CBA.mock ומעדכנת מטמון. משותף בין load() (רענון הרקע
  // הראשוני) ובין refresh() (רענון תקופתי מאוחר יותר, ר' למטה) — קוד אחד, לא כפול.
  function fetchAndApply(hadCache, cb, isBackgroundRefresh) {
    var mySeq = ++seqCounter;   // נתפס כאן, ברגע השליחה — לא ברגע שהתשובה חוזרת
    fetch(API_URL, { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        if (!payload || !payload.ok) throw new Error((payload && payload.error) || "bad payload");
        // תשובה "ישנה" שהגיעה באיחור (ר' ההסבר המלא ליד isDirty/writeFloor למעלה) — מתעלמים
        if (mySeq <= writeFloor || mySeq <= lastAppliedSeq) {
          cb(true, { source: "stale-ignored", hadCache: hadCache });
          return;
        }
        var store = transform(payload);
        if (apply(store, isBackgroundRefresh)) {
          lastAppliedSeq = mySeq;
          try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), store: store })); } catch (e) { /* מכסת אחסון מלאה — לא קריטי */ }
        }
        cb(true, { source: "fresh", hadCache: hadCache });
      })
      .catch(function (err) {
        console.error("[CBA] טעינה מהגיליון נכשלה:", err);
        if (!hadCache) cb(false, { source: "none" });
        else cb(true, { source: "cache-kept", error: String(err) });
      });
  }

  /* טעינה בשיטת stale-while-revalidate:
     1) אם יש מטמון מקומי — מציגים אותו מיידית (cb "cache"), האפליקציה נראית מיד.
     2) במקביל מרעננים ברקע מהגיליון; כשמגיע — מעדכנים מטמון וקוראים ל-cb שוב ("fresh").
     כך רענון הופך ממתנה של 2-3 שניות לתצוגה מיידית. cb עשוי להיקרא עד פעמיים. */
  function load(cb) {
    var hadCache = false;

    // 1) מטמון מקומי — הצגה מיידית
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        if (cached && cached.store) {
          apply(cached.store);
          hadCache = true;
          cb(true, { source: "cache" });
        }
      }
    } catch (e) { /* מטמון פגום/לא זמין — פשוט מתעלמים וממשיכים לרשת */ }

    // 2) רענון ברקע מהגיליון
    fetchAndApply(hadCache, cb);
  }

  // רענון תקופתי (2026-08-05, לבקשת יועד — "קצב רענון קצת יותר מהיר"): אותה קריאת
  // רשת בדיוק כמו שלב 2 של load(), בלי לשחזר קודם את המטמון (כבר מוצג על המסך).
  // נקרא כל כמה שניות מ-app.js כשהטאב גלוי, ובכל חזרה לטאב אחרי שהיה ברקע.
  function refresh(cb) { fetchAndApply(true, cb, true); }

  // ניקוי המטמון (למשל בעת יציאה/החלפת משתמש)
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  // כתיבה לגיליון בשיטת "שגר ושכח" (no-cors): הבקשה נשלחת ומבוצעת בשרת,
  // אבל הדפדפן לא יכול לקרוא את התשובה — לכן מניחים הצלחה (עדכון אופטימי במסך).
  // הסיסמה נלקחת אוטומטית מההגדרות שנטענו מהגיליון.
  function push(action, payload, cb) {
    // inFlightWrites++ עכשיו (לא רק בקריאות המפורשות ל-markDirty) — כדי שכל
    // כתיבה, מכל מסך, תחסום רענון רקע אוטומטית עד שהיא תיגמר (ר' isDirty למעלה),
    // ותפעיל את חיווי "שומר…" הגלובלי מיד (notifyDirtyChange).
    inFlightWrites++;
    notifyDirtyChange();
    var body = Object.assign({ action: action, session: authSession() }, payload || {});
    fetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    })
      .then(function () {
        inFlightWrites = Math.max(0, inFlightWrites - 1);
        // ברגע שכתיבה הסתיימה — כל בקשת GET שנשלחה *לפני* הרגע הזה עלולה
        // לשקף מצב ישן מלפני השמירה, גם אם התשובה שלה עוד לא חזרה. מסמנים
        // את הרף הזה כדי שתשובה כזו, כשתחזור, תידחה כ"ישנה" (ר' fetchAndApply).
        if (seqCounter > writeFloor) writeFloor = seqCounter;
        notifyDirtyChange();
        if (cb) cb({ ok: true });
      })
      .catch(function (err) {
        inFlightWrites = Math.max(0, inFlightWrites - 1);
        if (seqCounter > writeFloor) writeFloor = seqCounter;
        lastWriteHadError = true;
        notifyDirtyChange();
        console.error("[CBA] כתיבה נכשלה:", err);
        if (cb) cb({ ok: false, error: String(err) });
      });
  }

  // האם מחוברים לגיליון (ולא נתוני דמו)
  function isConnected() { return CBA.mock && CBA.mock._source === "sheets"; }

  // קריאה עם תשובה קריאה (GET רגיל, לא no-cors) — בשביל פעולות שחייבות לדעת מיד
  // אם הצליחו (למשל login, ובשלב 8: תפוסת יומן + יצירת שריון). params -> querystring.
  // מצרפת סיסמה אוטומטית (כמו push) — פעולות ניהול (clubList/approve/reject) בודקות
  // אותה בשרת; לשאר הפעולות זה פרמטר עודף ולא-נבדק, לא מזיק.
  function get(params, cb) {
    var body = Object.assign({ session: authSession() }, params || {});
    var qs = Object.keys(body).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(body[k] == null ? "" : body[k]);
    }).join("&");
    fetch(API_URL + "?" + qs)
      .then(function (r) { return r.json(); })
      .then(function (data) { cb(withAuthNote(data)); })
      .catch(function (err) { cb({ ok: false, error: String(err) }); });
  }

  // כתיבה (doPost) עם תשובה קריאה — בשביל פעולות שחייבות לדעת מיד אם הצליחו ולקבל
  // ערך חזרה (סעיף 4, 2026-08-06: העלאת/מחיקת קובץ קבלה — צריך את קישור הקובץ
  // החדש בחזרה כדי לעדכן את התצוגה מיד). בניגוד ל-push, בלי mode:"no-cors" —
  // אושר ידנית (2026-08-06) ש-fetch רגיל ל-Apps Script /exec מהמקור של האתר עצמו
  // (github.io) כן מחזיר תשובה קריאה כשה-Content-Type הוא "simple" (text/plain,
  // כמו כאן) שלא מפעיל preflight. body יכול להיות גדול (קובץ Base64) — POST, לא GET.
  function postRead(action, payload, cb) {
    var body = Object.assign({ action: action, session: authSession() }, payload || {});
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (cb) cb(withAuthNote(data)); })
      .catch(function (err) { if (cb) cb({ ok: false, error: String(err) }); });
  }

  // כמו postRead, אבל דרך XMLHttpRequest כדי לחשוף אחוז התקדמות אמיתי של
  // ההעלאה (fetch לא חושף התקדמות של גוף הבקשה בדפדפנים הנפוצים). מיועד
  // לבקשות עם קובץ Base64 גדול (למשל submitReceipt) שבהן ההעלאה בפועל יכולה
  // לקחת כמה שניות ברשת סלולרית, והמשתמש צריך לראות שזה באמת מתקדם.
  // 2026-08-08: אותה בקשה "פשוטה" (text/plain, בלי preflight) שכבר הוכחה
  // כעובדת עם postRead (תשובה קריאה, בלי no-cors) — אז אין סיבה ש-XHR
  // יתנהג אחרת; ה-CORS נבדק על הדפדפן לפי כותרות התשובה, לא לפי מנגנון
  // הבקשה (fetch מול XHR). onProgress(percent) נקרא במהלך השליחה;
  // cb(res) נקרא רק אחרי שהתשובה האמיתית מהשרת התקבלה ונפענחה — לא לפני.
  function postReadProgress(action, payload, onProgress, cb) {
    var body = Object.assign({ action: action, session: authSession() }, payload || {});
    var xhr = new XMLHttpRequest();
    xhr.open("POST", API_URL, true);
    xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");

    // הגנה מפני עזיבת הדף באמצע שליחה (נמצא בסימולציה חיה, 2026-08-10 — באג
    // אמיתי: submitReceipt "נעלם" בלי כתיבה לגיליון ובלי שום הודעת שגיאה אם
    // המשתמש עוזב את הדף ~3 שניות אחרי הלחיצה על שליחה, לפני שהתשובה מהשרת
    // חוזרת). לבקשות מהסוג הזה יש קובץ Base64 גדול + כתיבה בשרת שיכולה לקחת
    // 7-10 שניות; אם המשתמש סוגר/מרענן/חוזר-אחורה מהדף באמצע, הדפדפן מבטל את
    // הבקשה שבדרך — היא פשוט "נעלמת" בלי שהשרת כתב אותה ובלי שהמשתמש ידע.
    // beforeunload הוא המנגנון הסטנדרטי בדפדפנים למניעת אובדן מידע כזה: הוא
    // מציג את דיאלוג "לעזוב את האתר? השינויים שביצעת עלולים לא להישמר" המובנה
    // של הדפדפן (אי אפשר להתאים אישית את הטקסט — זו מגבלת אבטחה של כל
    // הדפדפנים, לא משהו לתקן אצלנו). לא נוגע בניווט הפנימי בין מסכי ה-SPA
    // (showScreen/CBA.navigate) — שם זו לא עזיבת דף אמיתית, הבקשה ממשיכה
    // לרוץ ברקע כרגיל ומגיעה ל-cb בהצלחה גם אם המסך הנראה כבר השתנה.
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = "";
      return "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    function clearUnloadGuard() { window.removeEventListener("beforeunload", onBeforeUnload); }

    if (xhr.upload && typeof onProgress === "function") {
      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
    }
    xhr.onload = function () {
      clearUnloadGuard();
      if (typeof onProgress === "function") onProgress(100);
      var data;
      try { data = JSON.parse(xhr.responseText); }
      catch (e) { if (cb) cb({ ok: false, error: "תשובה לא תקינה מהשרת" }); return; }
      if (cb) cb(withAuthNote(data));
    };
    xhr.onerror = function () {
      clearUnloadGuard();
      if (cb) cb({ ok: false, error: "שגיאת רשת" });
    };
    xhr.ontimeout = function () {
      clearUnloadGuard();
      if (cb) cb({ ok: false, error: "תם הזמן הקצוב — נסו שוב" });
    };
    xhr.send(JSON.stringify(body));
  }

  // refresh נשכח מהייצוא (התגלה 2026-08-07 בבדיקת הרשאות): app.js קורא ל-
  // CBA.sheets.refresh במחזור הרענון התקופתי, וזה נכשל בשקט — כלומר הנתונים
  // לא התרעננו מעצמם כלל, רק ברענון עמוד.
  return { url: API_URL, load: load, refresh: refresh, push: push, get: get, postRead: postRead, postReadProgress: postReadProgress, isConnected: isConnected, clearCache: clearCache, markDirty: markDirty, clearDirty: clearDirty, isDirty: isDirty };
})();
