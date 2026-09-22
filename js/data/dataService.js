/* dataService.js — שכבת הנתונים המרכזית.
   כל המסכים פונים רק לכאן, אף פעם לא ישירות ל-mock.
   ביום שנתחבר ל-Google Sheets, נשנה רק את הקובץ הזה — והמסכים לא ידעו בכלל.

   כלל חישוב הביצוע: הוצאה נספרת כ"בוצעה" רק אם הסטטוס שלה
   "שולם" (paid) או "אושר" (approved). "ממתין"/"נדחה" לא נספרים. */

window.CBA = window.CBA || {};

CBA.data = (function () {
  "use strict";

  /* ==========================================================================
   *  קריאה "Firestore קודם, גיליון כגיבוי"   (איחוד, 2026-09-15)
   * --------------------------------------------------------------------------
   *  שני התחומים שעברו שיכפלו את אותו שלד: שעון, דגל, המתנה לזהות, נפילה
   *  לאחור, ורישום מדידה. התחום השלישי היה משכפל פעם שלישית — וזה המקום
   *  שבו תיקון נכנס באחד ולא בשני. כאן הוא יושב פעם אחת.
   *
   *  🔴 **נפילה לאחור היא התנהגות, לא טיפול בשגיאה.** כל כשל מחזיר את המסך
   *  למסלול Apps Script בלי שהמשתמש ירגיש: אין SDK · אין משתמש מחובר · כלל
   *  אבטחה דחה · רשת איטית · נתונים חסרים.
   *
   *  🔴 **`settled` הוא לא קישוט.** יש כאן שלושה מקורות אפשריים לקריאה ל-cb
   *  (הצלחה, כשל, שעון עצר בתוך CBA.fb), ושניים מהם יכולים לקרות יחד.
   *  קולבק כפול מצייר מסך פעמיים ומאפס גלילה.
   *
   *  📊 המדידה נרשמת ל-`CBA.perf[key]` עם דגל `warm`. ⚠️ בלי ההבחנה בין
   *  SDK קר לחם המדידה משקרת: פתיחה ראשונה משלמת גם על ~550KB של SDK.
   *
   *  load(done)   — done(err, result). result הוא התשובה הסופית ללקוח.
   *  sheets(done) — done(result). מסלול Apps Script, כולל המטמון שלו.
   * ======================================================================== */
  function fsFirstRead(key, enabled, load, sheets, cb) {
    /* 🔑 `enabled` הוא **ברירת המחדל שבקוד**. הדגל החי נבדק
       אחרי שה-SDK עלה (שם הוא נקרא), כלומר לפני הקריאה הראשונה
       לנתונים. ברירת מחדל `false` מקצרת לגמרי — אפילו ה-SDK לא נטען. */
    var t0 = Date.now();
    var settled = false;
    var warm = !!(CBA.fb && CBA.fb.isDbReady && CBA.fb.isDbReady());

    function note(source, why) {
      try {
        CBA.perf = CBA.perf || {};
        CBA.perf[key] = { source: source, ms: Date.now() - t0, why: why || "",
                          warm: warm, at: new Date().toISOString() };
        console.log("[CBA.perf] " + key + " " + source + " " + (Date.now() - t0) + "ms" +
                    (warm ? " [SDK חם]" : " [SDK קר]") + (why ? " (" + why + ")" : ""));
      } catch (e) {}
    }

    function viaSheets(why) {
      if (settled) return;
      settled = true;
      sheets(function (res) { note("appsscript", why); if (cb) cb(res); });
    }

    /* ==========================================================================
     *  🔴🔴 נפילה לאחור היא החלטה של מנהל-על, לא ברירת מחדל שקטה
     * --------------------------------------------------------------------------
     *  (2026-09-17 — הכרעת יועד אחרי ממצא 02 בצוות האדום.)
     *
     *  עד היום **כל** כשל החזיר את המסך ל-Apps Script בשקט. בתחומים שרובם
     *  קריאה-בלבד זה עבד יפה ונמדד כעובד. בתנועות התקציב זה היה הרסני:
     *  מקור הנפילה הוא הגיליון, והגיליון מתעדכן רק בעבודה השעתית — כלומר
     *  בקשה שהוגשה לפני חמש דקות **לא קיימת שם**. נמדד חי: רשימת הבקשות של
     *  התושב ירדה מ-1 ל-0, בשקט, בלי שום הודעה, בזמן ש-Firestore החזיק אותה.
     *
     *  🔑 **ההפרדה שמכריעה כאן:**
     *    · `disabled` / `flag-off` = **החלטה**. התחום עוד לא עבר, או שמנהל-על
     *      כיבה אותו. ממשיכים ל-Apps Script כרגיל — זה מתג המיגרציה, לא כשל.
     *    · `no-user` / `db` / `firestore` = **כשל**. מכאן אין נפילה שקטה:
     *      המסך מקבל `{ok:false}` ואומר "לא הצלחנו לטעון", עם "נסה שוב".
     *
     *  ⚠️ **מתג החירום:** הדגל `appsScriptFallback` (כבוי כברירת מחדל) מחזיר
     *     את ההתנהגות הישנה **לכל התחומים בבת אחת**, בלי דיפלוי, ממסך
     *     "מצב המערכת". זה הכלי לתקלה רוחבית ב-Firestore — פעולה יזומה,
     *     לא התאוששות אוטומטית שאיש לא רואה.
     * ======================================================================== */
    function fallbackOn() {
      try {
        if (CBA.fb && CBA.fb.flag) return CBA.fb.flag("appsScriptFallback", false);
      } catch (e) {}
      return false;
    }

    function viaFailure(why) {
      if (settled) return;
      if (fallbackOn()) return viaSheets("fallback:" + why);
      settled = true;
      note("failed", why);
      /* ⚠️ הודעה בעברית ולא קוד: ארבעה מתוך חמשת המסכים מציגים את
         `res.error` **כמו שהוא** למשתמש. `cbaLoadFailed` הוא הסימן
         המכונתי, והטקסט הוא מה שקוראים. */
      if (cb) cb({ ok: false, cbaLoadFailed: true, why: why,
                   error: "לא הצלחנו לטעון את הנתונים מהשרת." });
    }

    if (!enabled || !CBA.fb || !CBA.fb.readCollection) return viaSheets("disabled");

    /* `userReady` ולא `authReady` — ר' ההסבר ליד pendingSignIn ב-firebase.js.
       בכניסה ראשונה לסשן ההתחברות ל-Firebase עוד לא יצאה לדרך, ו-`authReady`
       החזיר `null` מיד. זה מה שהפיל את הקריאה הראשונה של כל משתמש חדש. */
    var ready = (CBA.fb.userReady || CBA.fb.authReady);
    ready.call(CBA.fb, function (user) {
      if (settled) return;
      if (!user) return viaFailure("no-user");
      /* 🔴🔴 **ממתינים ל-`ensureDb` לפני שבודקים את הדגל** (2026-09-15).
         עד כאן ההערה כאן טענה ש"מגיעים לכאן רק אחרי ש-ensureDb
         קרא את הדגלים" — **וזה פשוט לא היה נכון.** `authReady`
         אינו מחכה לטעינת הדגלים, וקריאה שיוצאת מוקדם קיבלה
         מ-`flag()` את **ברירת המחדל שבקוד** במקום את הדגל.
         נתפס חי ב-15.9: הדגל `budgetYearFromFirestore` היה `false`
         והקריאה בכל זאת רצה מ-Firestore. כלומר **מתג הכיבוי לא
         עבד בדיוק בחלון שבו צריכים אותו** — בדקות הראשונות אחרי
         עלייה. הדבר לא התגלה עד עכשיו כי בגינון ובשירותים
         ברירת המחדל והדגל שניהם `true`.
         ⚠️ כשל ב-`ensureDb` הוא נפילה לאחור, לא המשך עיוור. */
      CBA.fb.ensureDb(function (dbErr) {
        if (settled) return;
        if (dbErr) return viaFailure("db:" + ((dbErr && (dbErr.code || dbErr.message)) || "?"));
        if (CBA.fb.flag && !CBA.fb.flag(key + "FromFirestore", enabled)) {
          return viaSheets("flag-off");
        }
        load(function (err, result) {
          if (settled) return;
          if (err) return viaFailure("firestore:" + ((err && (err.code || err.message)) || "?"));
          settled = true;
          note("firestore", "");
          if (cb) cb(result);
        });
      });
    });
  }

  /* ==========================================================================
   *  תוכנית העבודה — קריאה ישירה מ-Firestore   (צעד 03ג, 2026-09-15)
   * --------------------------------------------------------------------------
   *  🔴 **מתג הביטול של הצעד הוא שורה אחת:** `GARDEN_PLAN_FROM_FIRESTORE = false`
   *  מחזיר את המסך למסלול Apps Script הישן במלואו, בלי שום שינוי אחר.
   *
   *  ⚠️ **נפילה לאחור היא התנהגות, לא טיפול בשגיאה.** כל אחד מהמקרים האלה
   *  מחזיר את המסך ל-Apps Script **בלי שהמשתמש ירגיש דבר**: ה-SDK לא נטען ·
   *  אין משתמש מחובר ל-Firebase · כלל אבטחה דחה · רשת איטית מ-6 שניות ·
   *  מסמך הרשימות חסר. זה שער הבדיקה שנכשל עליו צעד שלם ב-9.9 (homeExtras),
   *  ולכן הוא נבדק לפני העלייה לייצור ולא אחריה.
   *
   *  🔑 **שתי התשובות חייבות להיראות זהות** — אותם שדות, אותו סדר. לכן
   *  ממיינים לפי `order` (רמז סדר מהגיליון) ואז לפי מספר המזהה. מסלול
   *  נפילה-לאחור שמסדר אחרת נראה למשתמש כמו באג, לא כמו גיבוי.
   *
   *  📊 המדידה נרשמת ל-`CBA.perf.gardenPlan`. **זו כל הסיבה למעבר**: קריאה
   *  ל-Apps Script עולה 1.5–3.5 שניות כרצפה, בלי קשר לגודל התשובה. אם המסלול
   *  הישיר לא ירד משמעותית מתחת לזה — הנחת היסוד של כל המעבר טעונה בדיקה.
   * ======================================================================== */
  var GARDEN_PLAN_FROM_FIRESTORE = true;

    function gardenPlanSort(rows) {
    return (rows || []).slice().sort(function (a, b) {
      var ao = a.order || 0, bo = b.order || 0;
      if (ao !== bo) return ao - bo;
      return (parseInt(String(a.id).replace(/\D/g, ""), 10) || 0) -
             (parseInt(String(b.id).replace(/\D/g, ""), 10) || 0);
    });
  }

  function gardenPlanRead(cb) {
    fsFirstRead("gardenPlan", GARDEN_PLAN_FROM_FIRESTORE, function (done) {
      var defs = null, meta = null, failed = false;
      function maybeDone() {
        if (failed || !defs || !meta) return;
        done(null, { ok: true, defs: gardenPlanSort(defs), freqs: meta.freqs || [],
                     areas: meta.areas || [], categories: meta.categories || [] });
      }
      function fail(e) { if (failed) return; failed = true; done(e); }
      CBA.fb.readCollection("gardenPlan", function (err, rows) {
        if (err) return fail(err);
        /* \ud83d\udd34 אוסף ריק אינו הצלחה — כך נראה גם סנכרון שמעולם לא רץ.
           "התוכנית עדיין ריקה" מזמין את המנהל להזין מחדש משימות
           שכבר קיימות — ר' אותה הערה בראש gardenPlan.js. */
        if (!rows || !rows.length) return fail(new Error("empty"));
        defs = rows;
        maybeDone();
      });
      CBA.fb.readDoc("gardenMeta", "lists", function (err, doc) {
        if (err) return fail(err);
        if (!doc) return fail(new Error("no-lists-doc"));
        meta = doc;
        maybeDone();
      });
    }, function (done) {
      CBA.sheets.get({ action: "gardenPlan" }, done);
    }, cb);
  }


  // סטטוסים = רמזור תהליכי. "בוצע" (נספר בביצוע) = מוכן להעברה / שולם.
  // "הוגשה קבלה", "חסר פרטים" ו"נדחה" אינם נספרים.
  const SPENT_STATUSES = ["ready", "paid"];

  // זרימת רמזור: הוגשה (ממתין לאישורך) -> מוכן להעברה (אושר) -> שולם. נדחה — בצד.
  // צבעים: כתום=דורש תשומת לב, כחול=אושר וממתין לתשלום, ירוק=שולם, אפור=נדחה/סגור.
  const STATUS_FLOW = ["submitted", "ready", "paid"];
  const STATUS_META = {
    submitted: { label: "הוגשה קבלה",     cls: "warn",   light: "amber",  next: 'אשר → הנה"ח' },
    review:    { label: "בבדיקה",         cls: "review", light: "purple", next: 'אשר → הנה"ח' },
    ready:     { label: 'הועבר להנה"ח',   cls: "blue",   light: "blue",   next: "סמן שולם" },
    paid:      { label: "שולם",        cls: "ok",   light: "green", next: null },
    rejected:  { label: "נדחה",        cls: "info", light: "gray",  next: null }
  };
  function statusMeta(k) { return STATUS_META[k] || STATUS_META.submitted; }
  // "בבדיקה" הוא ענף צד (כמו "נדחה") ולא חלק מרצף ה-STATUS_FLOW הליניארי — אבל
  // מבדיקה אפשר להמשיך הלאה לאישור, בדיוק כמו מ"הוגשה קבלה".
  function statusNext(k) {
    if (k === "review") return "ready";
    const i = STATUS_FLOW.indexOf(k);
    return (i >= 0 && i < STATUS_FLOW.length - 1) ? STATUS_FLOW[i + 1] : null;
  }
  function statusList() { return ["submitted", "review", "ready", "paid", "rejected"]; }

  // שדות שחייבים להיות מלאים לפני אישור (מעבר "הוגשה קבלה" -> "הועבר להנה"ח") — בעיקר
  // בשביל בקשות שהוגשו ע"י תושבים, שמגיעות בלי סעיף תקציבי (המנהל משייך אותו כאן).
  // מחזירה מערך שמות שדות חסרים (ריק = הכל תקין, אפשר לאשר).
  function missingApprovalFields(t) {
    const missing = [];
    if (!t.month) missing.push("חודש הגשה");
    if (!t.amount || t.amount <= 0) missing.push("סכום");
    if (!(t.supplier || "").trim()) missing.push("ספק / נמען");
    if (!t.categoryId || !findCategory(t.categoryId)) missing.push("סעיף תקציבי");
    return missing;
  }

  // --- ספירת התרעות (מוצג בפעמון תפריט המשתמש + תגיות על טאבי הניווט) ---
  // חלק סינכרוני ומיידי (לא דורש קריאת רשת): הוצאות ממתינות/בבדיקה מכל השנים,
  // וסעיפי תקציב בחריגה בשנה הנוכחית. שריונים ממתינים למועדון נספרים בנפרד
  // (getClubList) כי זו קריאה א-סינכרונית ל-Apps Script/Calendar.
  function getAlertCounts() {
    /* 🔴🔴 **ספירה על כל השנים שנטענו, לא על המוצגת** (21.9, דיווחים #8/#9).
       `getTransactions()` מחזירה את `CBA.mock.transactions`, שהיא **תכונת גישה**
       ל-`CBA.mock.years[currentYear].transactions` — כלומר השנה שעל המסך בלבד.
       ההערה כאן אמרה "מכל השנים" והקוד עשה הפך.
       נצפה בפועל: קבלה נרשמה לשנת העבודה תשפ"ז, המנהל צפה
       בתשפ"ו, והפעמון הראה אפס — כלומר בקשה של תושב נעלמה מהעין.
       ⚠️ **מה שזה עדיין לא פותר:** שנה שטרם נטענה כלל (הטעינה
          היא לפי דרישה) עדיין אינה נספרת. ספירה מלאה חוצה-שנים
          דורשת ספירה בשרת, וזה שינוי גדול יותר. */
    let pendingExpenses = 0, reviewExpenses = 0;
    var seen = {};
    try {
      var years = (CBA.mock && CBA.mock.years) || {};
      Object.keys(years).forEach(function (y) {
        ((years[y] && years[y].transactions) || []).forEach(function (t) {
          /* ⚠️ מזהה יכול לחזור בשתי שנים (העברת שנה) — לא סופרים פעמיים. */
          var k = String(y) + "|" + String(t.id);
          if (seen[k]) return;
          seen[k] = 1;
          if (t.status === "submitted") pendingExpenses++;
          else if (t.status === "review") reviewExpenses++;
        });
      });
    } catch (e) {
      getTransactions().forEach(function (t) {
        if (t.status === "submitted") pendingExpenses++;
        else if (t.status === "review") reviewExpenses++;
      });
    }
    const overBudget = getBudgetRows().filter(function (r) { return r.remaining < 0; }).length;
    return { pendingExpenses: pendingExpenses, reviewExpenses: reviewExpenses, overBudget: overBudget };
  }

  // --- שלושת סוגי ההוצאה ---
  const EXPENSE_TYPES = [
    { key: "refund",   label: "החזר לדייר" },
    { key: "supplier", label: "תשלום לספק" },
    { key: "general",  label: "הוצאה כללית" }
  ];
  function expenseTypeList() { return EXPENSE_TYPES.slice(); }
  function expenseTypeOf(t) {
    if (t.expenseType) return t.expenseType;
    if (t.payType === "refund" || t.source === "resident") return "refund";
    return "supplier";
  }
  function expenseTypeLabel(k) { const e = EXPENSE_TYPES.find(function (x) { return x.key === k; }); return e ? e.label : k; }
  function expenseTypeShort(k) { return k === "refund" ? "החזר" : (k === "supplier" ? "ספק" : "כללי"); }
  // תאימות לאחור
  function payTypeOf(t) { return expenseTypeOf(t) === "refund" ? "refund" : "supplier"; }

  // --- תאריכים בעברית (2026-08-06) --- תמיד היו מוצגים כמחרוזת ISO גולמית
  // ("2026-08-06") או "MM/YYYY" — לא בעברית בכלל, לא בדסקטופ ולא במובייל. מיישמים
  // עיצוב עברי ידני (בלי toLocaleDateString/Intl) בכוונה: יש דפדפני מובייל שבהם
  // תמיכת ה-locale "he"/"he-IL" של Intl חלקית/לא עקבית, ועיצוב מחרוזות ידני
  // עובד זהה בכל דפדפן/מכשיר בלי תלות ב-locale המותקן במכשיר.
  var HE_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
  // "תאריך רכישה" (יומי, מפורמט YYYY-MM-DD) -> "6 באוגוסט 2026"
  function hebrewDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    if (!y || !m || !d) return iso;
    var monthName = HE_MONTHS[m - 1];
    if (!monthName) return iso;
    // "ב-" תחילית תקנית: רוב החודשים "באוגוסט", אבל שמות שמתחילים ב-א/ה מקבלים "ב"
    // בלי דגש כפול (למשל "אפריל" -> "באפריל" ולא "בבאפריל") — התחילית "ב" מספיקה תמיד.
    return d + " ב" + monthName + " " + y;
  }
  // "חודש הגשה" (חודשי, מפורמט YYYY-MM) -> "אוגוסט 2026"
  function hebrewMonth(ym) {
    if (!ym) return "";
    var p = String(ym).split("-");
    if (p.length !== 2) return ym;
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10);
    var monthName = HE_MONTHS[m - 1];
    if (!monthName) return ym;
    return monthName + " " + y;
  }
  // גרסה מקוצרת (חודש מקוצר) לעמודות טבלה צרות: "6 באוג׳ 2026"
  var HE_MONTHS_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  function hebrewDateShort(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    if (p.length !== 3) return iso;
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    var monthName = HE_MONTHS_SHORT[m - 1];
    if (!y || !m || !d || !monthName) return iso;
    return d + " ב" + monthName + " " + y;
  }
  // תאריך+שעה בעברית לפנקס ההערות (סעיף 1): מקבל "YYYY-MM-DD HH:mm" (כך גם
  // Code.gs שומר וגם השמירה האופטימית המקומית מפרמטת — ר' fmtNowStamp למטה)
  // ומחזיר "6 באוגוסט 2026, 14:32".
  function hebrewDateTime(v) {
    if (!v) return "";
    var p = String(v).split(" ");
    var d = hebrewDate(p[0]);
    return p[1] ? (d + ", " + p[1]) : d;
  }
  // חותמת "עכשיו" בפורמט "YYYY-MM-DD HH:mm" — תואם למה שהשרת שומר (Code.gs
  // saveNotes_), כדי שהעדכון האופטימי המקומי והתצוגה אחרי רענון מהגיליון
  // ייראו זהים.
  function fmtNowStamp() {
    var d = new Date();
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  // שם קובץ הקבלה לפי סוג ההוצאה. לתשלום לספק מוסיף פרטי חשבון בנק.
  // תווית סוג ההוצאה בתחילת השם: "החזר לדייר <שם>" או "תשלום לספק <שם>" — כך שגם
  // מהשם לבד (בלי לפתוח את השורה) ברור מה סוג ההוצאה, בדיוק כמו במוסכמה ההיסטורית.
  function receiptFileName(t) {
    const d = (t.date || "").split("-"); // YYYY-MM-DD
    const dmy = d.length === 3 ? (d[2] + "-" + d[1] + "-" + d[0]) : (t.date || "");
    const etype = expenseTypeOf(t);
    const payee = etype === "refund" ? ("החזר לדייר " + (t.buyer || ""))
      : etype === "supplier" ? ("תשלום לספק " + (t.supplier || t.buyer || ""))
      : (t.supplier || t.buyer || "");
    let s = dmy + " " + payee + " סך: " + Math.round(t.amount || 0) + "  מתקציב: " + categoryName(t.categoryId) + " פירוט: " + (t.description || "");
    if (etype === "supplier") {
      const bank = [t.bankName ? ("בנק " + t.bankName) : "", t.bankBranch ? ("סניף " + t.bankBranch) : "", t.bankAccount ? ("חשבון " + t.bankAccount) : ""].filter(Boolean).join(" ");
      if (bank) s += " " + bank;
    }
    return s;
  }

  // חודשי שנת התקציב לפי הסדר (ספטמבר עד אוגוסט)
  function getMonthLabels() {
    return ["ספט׳", "אוק׳", "נוב׳", "דצמ׳", "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳"];
  }

  function getGroups() {
    return CBA.mock.groups.slice();
  }

  function getCategories() {
    return CBA.mock.categories.slice();
  }

  function getTransactions() {
    return CBA.mock.transactions.slice();
  }

  /* כל התנועות מכל שנות התקציב, ולא רק מהשנה הפעילה (2026-09-07).
     למה זה נחוץ: אזור התושב מסתיר את בורר השנים (ר' resident.css שורה 14),
     ולכן תושב רואה אך ורק את השנה הפעילה. ברגע שמחליפים את "שנה נוכחית"
     בגיליון, כל ההיסטוריה שלו נעלמת לו מהמסך — כולל החזרים ששולמו.
     ה-doGet כבר מחזיר את התנועות של *כל* השנים (ר' out.data[y] ב-Code.gs),
     אז זו קריאה מהזיכרון בלבד, בלי שום שינוי בשרת ובלי בקשה נוספת.
     כל שורה כבר נושאת שדה year (ר' toTx ב-sheets.js), אז אפשר לקבץ לפי שנה.
     שים לב: getTransactions() נשארת פר-שנה במכוון — המונה "שולמו השנה"
     במסך הבית ובראש "הבקשות שלי" נשען עליה, ושינוי שלה היה הופך אותו
     בשקט ל"שולמו אי פעם". */
  function getAllTransactions() {
    const out = [];
    const years = (CBA.mock && CBA.mock.years) || {};
    Object.keys(years).forEach(function (y) {
      const list = (years[y] && years[y].transactions) || [];
      for (let i = 0; i < list.length; i++) out.push(list[i]);
    });
    return out;
  }

  // שם הסעיף לפי מזהה
  function categoryName(catId) {
    const c = CBA.mock.categories.find(function (x) { return x.id === catId; });
    return c ? c.name : "—";
  }

  // --- פעולות על תנועות (הוספה/עריכה/מחיקה) — מסונכרנות לגיליון כשמחוברים ---
  /* 🔴🔴 **`_partial` הוא חלק מהשער, לא תוספת** (16.9.2026).
     הטעינה הקרה מ-Firestore מרימה `_source = "sheets"` ומצייר מסך
     לחיץ תוך עשרות אלפיות — אבל עם **שנה אחת ובלי ההגדרות**.
     כתיבה בחלון הזה נגזרת ממה שלא נטען: תצורת עמודות גלובלית
     שנדרסת בריק, ושורת "עדכוני תקציב" שלא נרשמת כי השנה נראית
     טיוטה. שתיהן שקטות ובלתי הפיכות. ר' ההערה המלאה ב-`apply()`.
     ⚠️ החלון הוא שניות ספורות — עד שהמטען האמיתי נוחת ומנקה
        את הדגל. פעולה שנחסמה מקבלת את אותה הודעה כמו ניתוק. */
  function pushConnected() {
    return CBA.sheets && CBA.sheets.push &&
           CBA.mock._source === "sheets" && !CBA.mock._partial;
  }
  /* (syncTx הוסרה 14.9 — שלושת הקוראים שלה עברו לשליחה עם בדיקת תשובה.
     פונקציה ששולחת בלי לבדוק הייתה נשארת כאן כפיתוי לקריאה הבאה.) */
  function addTransaction(tx) {
    const seq = CBA.mock.transactions.reduce(function (m, t) { return Math.max(m, t.id || 0); }, 0) + 1;
    /* 🔴 שנת **העבודה**, לא השנה המוצגת (2026-09-15, הכרעת יועד).
       הצצה לשנה קודמת היא פעולת צפייה; הזנה היא פעולת עבודה. */
    const row = Object.assign({ id: seq, source: "admin", status: "submitted", year: getWorkingYear() }, tx);
    CBA.mock.transactions.push(row);
    if (!pushConnected()) return row;

    /* 🔴🔴 **הדגל עולה כאן, באותה שורה שבה המסך השתנה.**
       עד ההיפוך הקריאה היתה מהגיליון ו-`push()` הרים דגל
       בעצמו; כתיבה ישירה ל-Firestore אינה עוברת שם, ולכן
       רענון רקע שנוחת בין התצוגה האופטימית לבין הכתיבה היה
       **מוחק את השורה מהמסך ומחזיר אותה שנייה אחר כך** —
       בדיוק הבהוב שתוקן בסטטוס ב-15.9, רק במסלול אחר. */
    txDirtyUp();

    /* 🔴 מסלול Firestore: המזהה מגיע **מהמונה**, לא מ-max+1 מקומי.
       max+1 נכון רק כשיש כותב אחד; ברגע ששניים מזינים במקביל שניהם
       מקבלים את אותו מספר ואחד דורס את השני. */
    txWriteOn(function (on) {
      if (!on) { txFellBack(); return txAddViaSheets(row); }
      CBA.fb.nextId("tx_" + row.year, function (err, n) {
        if (err) { txFellBack(); return txAddViaSheets(row); }
        /* המזהה שהוקצה מחליף את המקומי — גם על המסך, לפני הכתיבה. */
        row.id = n;
        CBA.fb.createDoc("budgetTx", txDocId(row), txToDoc(row), function (e2) {
          if (e2) { txFellBack(); return txAddViaSheets(row); }
          txWrote("add");
        });
      });
    });
    return row;
  }

  /* המסלול הישן — נשאר כפי שהיה, ומשמש גם כנפילה לאחור. */
  function txAddViaSheets(row) {
      txNote("add", "appsscript", "");
      const payload = Object.assign({}, row, { fileName: receiptFileName(row) });
      CBA.sheets.push("saveTransaction", { year: row.year || getCurrentYear(), tx: payload }, function (res) {
        if (res && res.ok === true) return;
        /* שורה שלא הגיעה לגיליון חייבת להיעלם גם מהמסך — אחרת המנהל רואה
           תנועה שלא קיימת, מסתמך עליה בסיכום, ומגלה רק ברענון הבא. */
        CBA.mock.transactions = CBA.mock.transactions.filter(function (x) { return x !== row; });
        rollbackNote("התנועה לא נשמרה בגיליון והוסרה מהמסך", res);
      });
  }

  /* מדידה אחת לכל מסלול כתיבה — כדי שאפשר יהיה לראות בייצור מה באמת רץ. */
  function txNote(op, source, why) {
    try {
      CBA.perf = CBA.perf || {};
      CBA.perf["tx_" + op] = { source: source, why: why || "", at: new Date().toISOString() };
    } catch (e) {}
  }

  /* ==========================================================================
   *  🔴🔴 **כל כתיבת תנועה ל-Firestore עוברת כאן.**
   * --------------------------------------------------------------------------
   *  שני דברים חייבים לקרות אחריה, ובלעדיהם השינוי פשוט לא נראה:
   *
   *  1. **זורקים את מטמון התנועות המקומי** — אחרת המשיכה
   *     הבאה תגיש את השורות הישנות מהזיכרון ותדרוס את מה
   *     שזה עטה נכתב. ר' `fsTxCache` ב-sheets.js.
   *  2. **דחיפה לשרת שמרימה את מונה תחום התקציב** — זה האות
   *     ש**דפדפנים אחרים** מחכים לו. עד ההיפוך הכתיבה עברה
   *     ב-Apps Script והמונה עלה מעצמו; כתיבה ישירה ל-Firestore
   *     אינה נוגעת בשרת בכלל, ולכן בלי הדחיפה הזאת הגזבר
   *     לא יראה בקשת החזר חדשה עד רשת הביטחון של 10 דקות.
   *
   *  ⚠️ כשל בדחיפה אינו שגיאה למשתמש — הכתיבה כבר הצליחה. */
  function txWrote(op) {
    txNote(op, "firestore", "");
    try { CBA.sheets.dropTxCache(); } catch (e) {}
    txNudgeApply();   /* **מחזיקה** — הדגל משוחרר בקולבק של הדחיפה */
  }

  /* נפילה לאחור למסלול הגיליון — משחררים את ההחזקה
     שלנו, כי `push()` מחזיק דגל משלו (וגם מרים את writeFloor). */
  function txFellBack() { txDirtyDown(); }
  /* ========================================================================
   *  החזרה לאחור כשהשרת דוחה  (PHASE 4.2, 2026-09-14)
   * ------------------------------------------------------------------------
   *  שלוש הפעולות האלה הן Optimistic UI: המסך משתנה מיד והשליחה לשרת
   *  יוצאת אחריה. זה נכון ומהיר — אבל עד היום התשובה **לא נבדקה בכלל**.
   *  שמירה שנדחתה (אין הרשאה, שנה שנסגרה, נעילה שלא נתפסה) השאירה את
   *  המסך מראה מציאות שלא קיימת בגיליון, והמשתמש ראה את זה רק ברענון הבא —
   *  אם בכלל. במחיקה זה החמור ביותר: השורה נעלמת מהמסך ונשארת בגיליון.
   *
   *  ⚠️ ההחזרה מחזירה את **המצב הקודם**, לא "מבטלת פעולה": אם המשתמש הספיק
   *     לערוך שוב בינתיים, אנחנו לא נוגעים — עדיף מסך לא מעודכן מדריסה של
   *     עריכה חדשה. לכן ההשוואה היא מול הרשומה שקיימת *עכשיו*.
   * ===================================================================== */
  function rollbackNote(msg, res) {
    var extra = (res && res.error) ? (" — " + res.error) : "";
    if (CBA.ui && CBA.ui.toast) CBA.ui.toast(msg + extra, "error");
    else if (CBA.ui && CBA.ui.alert) CBA.ui.alert(msg + extra);
    if (CBA.redraw) CBA.redraw();
  }

  /* ==========================================================================
   *  שינוי סטטוס — כתיבה ישירה ל-Firestore   (צעד 09א, 2026-09-15)
   * --------------------------------------------------------------------------
   *  🔴 **מתג הביטול של הצעד הוא שורה אחת:**
   *  `BUDGET_TX_STATUS_TO_FIRESTORE = false` — והכל חוזר ל-Apps Script.
   *  ⚠️ **ברירת המחדל בקוד חייבת להיות `true`** — אחרת הקוד
   *     מקצר לפני שהוא קורא את הדגל החי, והדגל לא ידליק
   *     כלום. הכיבוי הוא דרך `flagSet`, לא דרך השורה הזאת.
   *
   *  מה עובר כאן: **שינוי סטטוס בלבד** (עם או בלי הערת
   *  בדיקה). כל שינוי אחר — סכום, סעיף, קבלה — ממשיך
   *  במסלול Apps Script המלא. זה לא קיצור דרך: כלל האבטחה
   *  ב-Firestore מרשה לדפדפן לגעת **בשדות האלה בלבד**.
   *
   *  🔑 **תיבת דואר, לא בעלות:** הגיליון נשאר מקור האמת.
   *  הדפדפן מרים `statusPending:true`, והשרת מחיל ומוריד את
   *  הדגל. לכן הסנכרון מכבד את הדגל — בלעדיו הסנכרון
   *  הבא היה מוחק את השינוי בשקט.
   * ======================================================================== */
  var BUDGET_TX_STATUS_TO_FIRESTORE = true;

  /* המעברים החוקיים — תאום של `txLegalStep` ב-firestore.rules
     ושל `BTX_STEPS_` ב-Code.gs. מעבר שאינו כאן (למשל תיקון
     ידני מ"שולם" חזרה ל"בבדיקה") פשוט הולך במסלול
     המלא — לא נחסם. */
  var TX_STEPS = {
    submitted: ["review", "ready", "rejected"],
    review:    ["ready", "rejected"],
    ready:     ["paid", "rejected"]
  };
  function txLegalStep(from, to) {
    var a = TX_STEPS[from];
    return !!a && a.indexOf(to) !== -1;
  }
  function txStatusOnly(fields) {
    var ks = Object.keys(fields || {});
    if (!ks.length || ks.indexOf("status") === -1) return false;
    for (var i = 0; i < ks.length; i++) {
      if (ks[i] !== "status" && ks[i] !== "reviewNote") return false;
    }
    return true;
  }

  /* ==========================================================================
   *  🔴 **החור שהיה נפער כאן אלמלא שתי הפונקציות האלה**
   * --------------------------------------------------------------------------
   *  השנה הנוכחית **מגיעה מהמטען של Apps Script**, לא
   *  מ-Firestore (דיאטת המטען מוציאה רק שנים קודמות),
   *  ו-`apply()` דורס את `CBA.mock.years` **כל שלוש שניות**.
   *  כלומר: הסטטוס שנכתב ל-Firestore היה **נראה קופץ חזרה**
   *  תוך שלוש שניות, עד שההחלה תגיע לגיליון.
   *
   *  הפתרון משתמש במנגנון שכבר קיים: `markDirty` עוצר את
   *  הרענון התקופתי (`apply` מדלג כש-`isDirty()`). אנחנו מחזיקים
   *  את הדגל מרגע הכתיבה ל-Firestore ועד שהדחיפה מאשרת
   *  שהגיליון הדביק.
   *  ⚠️ **תווית שקט (`false`)** — זו אינה שמירה שהמשתמש צריך
   *     לחכות לה, ובועת "שומר…" על לחיצה מיידית היא רעש.
   *  ⚠️ **כל מסלול יציאה חייב לשחרר.** דגל שנתקע מרים
   *     מקפיא את הרענון התקופתי לצמיתות — גרוע בהרבה
   *     מהבעיה שהוא פותר. לכן השחרור יושב בקולבק של
   *     `CBA.sheets.get`, שמובטח להיקרא גם בשעון עצר וגם בכשל.
   * ======================================================================== */
  var txDirtyN = 0;
  function txDirtyUp() {
    if (++txDirtyN === 1) { try { CBA.sheets.markDirty("txStatus", false); } catch (e) {} }
  }
  function txDirtyDown() {
    if (txDirtyN > 0 && --txDirtyN === 0) { try { CBA.sheets.clearDirty("txStatus"); } catch (e) {} }
  }

  /* דחיפה לשרת אחרי כתיבה — כדי שהגיליון (והמייל לתושב)
     לא יחכו עד לריצה השעתית. הטריגר השעתי נשאר רשת
     הביטחון, ולכן כשל כאן אינו שגיאה למשתמש.
     השהיה קצרה מאחדת אישור גורף של 20 שורות לדחיפה אחת. */
  var txNudgeTimer = null, txNudgeHeld = 0;
  /* 🔴🔴 **לכל החזקה יש בדיוק שחרור אחד.** כל כותב מרים
     `txDirtyUp()` ברגע שהמסך משתנה, ומשחרר או דרך `txFellBack()`
     (כשל/נפילה לאחור) או דרך הדחיפה הזאת (הצלחה).
     ⚠️ **החזקה שלא תשוחרר מקפיאה את כל רענוני הרקע לצמיתות**
        (`isDirty` חוסם את `apply`). מה שמבטיח שזה לא יקרה הוא
        שכל שלב בשרשרת הכתיבה מוגבל בזמן: `authReady` (4 שניות),
        `ensureDb` (LOAD_TIMEOUT_MS) וכל פעולות הכתיבה ב-firebase.js
        עוטפות את הקולבק ב-`withTimeout`. קולבק תמיד חוזר. */
  function txNudgeApply() {
    txNudgeHeld++;
    if (txNudgeTimer) clearTimeout(txNudgeTimer);
    txNudgeTimer = setTimeout(function () {
      txNudgeTimer = null;
      var release = txNudgeHeld; txNudgeHeld = 0;
      var fired = false;
      function done() {
        if (fired) return;
        fired = true;
        for (var i = 0; i < release; i++) txDirtyDown();
      }
      /* 🔴🔴 **תושב דוחף בפעולה אחרת.** `budgetTxApply` דורש
         הרשאת תקציב — ולתושב אין, ובצדק (הוא מחיל סטטוסים
         על הגיליון). בלי הפיצול הזה, בקשת החזר של תושב
         היתה נכתבת ל-Firestore ו**הדחיפה היתה נדחית בשקט**,
         כלומר הגזבר לא היה רואה אותה — בדיוק החור שבגללו
         הצעד הזה לא יכול היה לרוץ קודם. `txPing` רק מרים מונה. */
      var seesBudget = !!(CBA.isSuper || (CBA.perms && CBA.perms.indexOf("תקציב") !== -1));
      try { CBA.sheets.get({ action: seesBudget ? "budgetTxApply" : "txPing" }, done); }
      catch (e) { done(); }
    }, 800);
  }

  /* מנסה לכתוב סטטוס ישירות. done(true) = נכתב,
     done(false) = לא נכתב וצריך לנפול אחורה. */
  function txStatusToFirestore(t, fields, done) {
    if (!BUDGET_TX_STATUS_TO_FIRESTORE) return done(false, "disabled");
    if (!(CBA.fb && CBA.fb.updateDoc && CBA.fb.ensureDb)) return done(false, "no-sdk");
    var year = t.year || getCurrentYear();
    if (!year || t.id == null) return done(false, "no-id");

    CBA.fb.authReady(function (user) {
      if (!user) return done(false, "no-user");
      /* 🔴 אותה מלכודת של `fsFirstRead`: הדגל נקרא ב-`ensureDb`,
         ובדיקה לפניו מקבלת את ברירת המחדל בקוד. */
      CBA.fb.ensureDb(function (dbErr) {
        if (dbErr) return done(false, "db");
        if (CBA.fb.flag && !CBA.fb.flag("budgetTxStatusToFirestore", BUDGET_TX_STATUS_TO_FIRESTORE)) {
          return done(false, "flag-off");
        }
        var patch = {
          statusPending: true,
          updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
        };
        patch[STATUS_COL] = statusMeta(fields.status).label;
        if (Object.prototype.hasOwnProperty.call(fields, "reviewNote")) {
          patch[NOTE_COL] = String(fields.reviewNote == null ? "" : fields.reviewNote);
        }
        /* 🔴 מרימים **לפני** הכתיבה: הרענון התקופתי יכול
           לנחות בדיוק בין השליחה לתשובה. */
        txDirtyUp();
        CBA.fb.updateDoc("budgetTx", year + "__" + t.id, patch, function (err) {
          if (err) { txDirtyDown(); return done(false, (err && (err.code || err.message)) || "write"); }
          /* השורות שבמטמון מחזיקות סטטוס ישן — ר' `txWrote`. */
          try { CBA.sheets.dropTxCache(); } catch (e) {}
          txNudgeApply();     /* הדגל משוחרר בקולבק של הדחיפה */
          done(true, "");
        });
      });
    });
  }
  var STATUS_COL = "סטטוס";
  var NOTE_COL = "הערת בדיקה";

  /* ==========================================================================
   *  כתיבת תנועות ישירות ל-Firestore   (צעד 09ב-3, 2026-09-15)
   * --------------------------------------------------------------------------
   *  🔴 **הדגל הזה מכבה קריאה וכתיבה יחד, ובכוונה.** אם הדפדפן יכתוב
   *  תנועה ל-Firestore בזמן שהמטען עדיין מביא את השנה הנוכחית מהגיליון,
   *  התנועה **תיעלם ברענון הבא** — היא לא בגיליון, והמסך נבנה מהגיליון.
   *  והכיוון ההפוך יוצר בדיוק את אותו חור. לכן מתג אחד, לא שניים.
   *
   *  ⚠️ **ברירת המחדל בקוד היא `false`**, בניגוד לדגלי הקריאה. שם
   *     `fsFirstRead` מקצרת לפני שהיא קוראת את הדגל החי, ולכן הברירה
   *     חייבת להיות `true`. כאן אנחנו בודקים את הדגל בעצמנו אחרי
   *     `ensureDb`, ולכן `false` עובד — וזה מה שמאפשר לשחרר את הקוד
   *     לייצור **בלי לשנות התנהגות**, ולהפוך את המתג בנפרד.
   * ======================================================================== */
  var BUDGET_TX_FROM_FIRESTORE = false;

  function txWriteOn(cb) {
    /* 🔴🔴 **אין כאן קיצור על הקבוע.** זו בדיוק המלכודת שנתפסה ב-15.9
       ב-`fsFirstRead`: קיצור על ברירת המחדל שבקוד הופך את הדגל החי
       לחסר משמעות — כאן בכיוון ההפוך, `flagSet` לעולם לא היה מדליק.
       הקבוע הוא **ברירת המחדל שמועברת ל-`flag()`**, לא שער. */
    if (!(CBA.fb && CBA.fb.ensureDb && CBA.fb.createDoc)) return cb(false, "no-sdk");
    /* 🔴 `userReady` ולא `authReady` (2026-09-17, ממצא 02) — **גם בצד הכתיבה.**
       בשניות הראשונות של סשן חדש `authReady` החזיר `null`, ולכן תנועה נכתבה
       ל-Apps Script בזמן שהקריאה כבר באה מ-Firestore. זה בדיוק החור שמייצר
       "הגשתי בקשה והיא לא מופיעה" — אותה משפחה כמו הבאג של מורן. */
    (CBA.fb.userReady || CBA.fb.authReady).call(CBA.fb, function (user) {
      if (!user) return cb(false, "no-user");
      CBA.fb.ensureDb(function (err) {
        if (err) return cb(false, "db");
        /* 🔴🔴 **המטען מנצח על מפת הדגלים.** מפת הדגלים של
           ה-SDK נקראת פעם אחת, ב-`ensureDb`, בטעינת העמוד — ולכן
           `flagSet` לא מגיע ללשוניות שכבר פתוחות. השרת, לעומת
           זאת, מתעדכן תוך דקה — ואז הקריאה והכתיבה מתהפכות
           בזמנים שונים, ותנועה שנכתבת למקום אחד בזמן
           שקוראים מהשני **נעלמת מהמסך**. נתפס חי ב-15.9.
           עכשיו שניהם קוראים אותו אות — הדגל שהמטען נושא.
           ⚠️ `null` = שרת ישן שעוד לא מדווח — נופלים למפת הדגלים,
              כלומר בדיוק ההתנהגות של אתמול. אין "מסך שבור"
              בחלון שבין הדחיפה ל-Deploy. */
        var fromPayload = CBA.mock && CBA.mock._txFsOn;
        if (fromPayload === true || fromPayload === false) {
          if (!fromPayload) return cb(false, "flag-off");
          return cb(true, "");
        }
        if (CBA.fb.flag && !CBA.fb.flag("budgetTxFromFirestore", BUDGET_TX_FROM_FIRESTORE)) {
          return cb(false, "flag-off");
        }
        cb(true, "");
      });
    });
  }

  /* 🔴 **נקודת ההמרה היחידה** מתנועה של הלקוח למסמך Firestore.
     היא מראה כפולה של `saveTransactionRow_` בשרת — ולכן יש בדיקה
     שמצמידה את מפתחותיה לרשימת ההיתר שם. **`רוכש` אינו כאן**: זה
     שם של אדם, והלקוח מרכיב אותו ממזהה המשפחה בקריאה. */
  var TX_TYPE_HE = { refund: "החזר לדייר", supplier: "תשלום לספק", general: "הוצאה כללית" };
  var TX_SOURCE_HE = { admin: "מנהל", resident: "תושב" };

  function txToDoc(t) {
    var fam = String(t.familyId == null ? "" : t.familyId).trim();
    var doc = {
      "מזהה": Number(t.id),
      "חודש הגשה": String(t.month || ""),
      "תאריך רכישה": String(t.date || ""),
      "ספק/נמען": String(t.supplier || ""),
      "בנק": String(t.bankName || ""),
      "סכום": Number(t.amount) || 0,
      "סעיף": String(t.categoryId || ""),
      "תת-סעיף": String(t.subItemId || ""),
      "סוג הוצאה": TX_TYPE_HE[t.expenseType] || String(t.expenseType || ""),
      "מקור": TX_SOURCE_HE[t.source] || String(t.source || ""),
      "סטטוס": statusMeta(t.status).label,
      "הערת בדיקה": String(t.reviewNote || ""),
      "תיאור": String(t.description || ""),
      "שם קובץ קבלה": String(receiptFileName(t) || ""),
      "קישור קבלה": String(t.receiptUrl || ""),
      "מזהה משפחה": fam,
      year: String(t.year || getWorkingYear()),
      familyId: fam,
      statusPending: false,
      schema: 2,
      updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
    };
    /* ⚠️ שדה ריק אינו נכתב — בדיוק כמו `btxRow_` בשרת, כדי ששני
       המסלולים ייצרו את אותו מסמך. */
    Object.keys(doc).forEach(function (k) { if (doc[k] === "") delete doc[k]; });
    return doc;
  }

  function txDocId(t) { return String(t.year || getWorkingYear()) + "__" + String(t.id); }

  /* השדות שעריכת "פרטים" רשאית לגעת בהם — תאום מדויק של
     `txDetailsUpdateOk` בכללי האבטחה. סטטוס אינו כאן. */
  var TX_DETAIL_FIELDS = ["חודש הגשה", "תאריך רכישה", "ספק/נמען", "בנק", "סכום",
                          "סעיף", "תת-סעיף", "סוג הוצאה", "תיאור",
                          "שם קובץ קבלה", "קישור קבלה"];

  function txDetailsPatch(t) {
    var full = txToDoc(t), out = {};
    TX_DETAIL_FIELDS.forEach(function (k) { out[k] = full[k] === undefined ? "" : full[k]; });
    out.updatedAt = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
    return out;
  }

  function updateTransaction(id, fields) {
    const t = CBA.mock.transactions.find(function (x) { return x.id === id; });
    if (!t) return t;
    // תצלום של השדות שעומדים להשתנות בלבד — לא של כל הרשומה
    const before = {};
    Object.keys(fields).forEach(function (k) { before[k] = t[k]; });
    const fromStatus = t.status;
    Object.assign(t, fields);
    if (!pushConnected()) return t;

    /* מסלול מהיר: סטטוס בלבד, מעבר חוקי, והמשתמש באמת
       בעל הרשאת תקציב (אחרת הכלל ידחה ונשלם סיבוב מיותר). */
    var seesBudget = !!(CBA.isSuper || (CBA.perms && CBA.perms.indexOf("תקציב") !== -1));
    if (seesBudget && txStatusOnly(fields) && txLegalStep(fromStatus, fields.status)) {
      txStatusToFirestore(t, fields, function (ok, why) {
        try {
          CBA.perf = CBA.perf || {};
          CBA.perf.txStatus = { source: ok ? "firestore" : "appsscript", why: why || "",
                                at: new Date().toISOString() };
        } catch (e) {}
        if (!ok) txPushWhole(id, t, before);
      });
      return t;
    }

    /* 🔴 עריכת פרטים ל-Firestore — **`mergeDoc` ולא `updateDoc`**.
       שם העמודה "ספק/נמען" מכיל לוכסן, ו-`update` מפרש אותו כנתיב
       שדה ונכשל ב-`invalid-argument`. נתפס חי ב-15.9. */
    txDirtyUp();   /* ר' ההערה ב-`addTransaction` */
    txWriteOn(function (on) {
      if (!on) { txFellBack(); return txPushWhole(id, t, before); }
      CBA.fb.mergeDoc("budgetTx", txDocId(t), txDetailsPatch(t), function (err) {
        if (err) { txFellBack(); return txPushWhole(id, t, before); }
        txWrote("update");
      });
    });
    return t;
  }

  function txPushWhole(id, t, before) {
    const payload = Object.assign({}, t, { fileName: receiptFileName(t) });
    CBA.sheets.push("saveTransaction", { year: t.year || getCurrentYear(), tx: payload }, function (res) {
      if (res && res.ok === true) return;
      const live = CBA.mock.transactions.find(function (x) { return x.id === id; });
      if (!live) return;   // נמחקה בינתיים — אין למה לחזור
      Object.keys(before).forEach(function (k) { live[k] = before[k]; });
      rollbackNote("העדכון לא נשמר והוחזר לקדמותו", res);
    });
  }

  function deleteTransaction(id) {
    const t = CBA.mock.transactions.find(function (x) { return x.id === id; });
    const yr = t && t.year;
    const at = CBA.mock.transactions.indexOf(t);
    const copy = t;
    CBA.mock.transactions = CBA.mock.transactions.filter(function (x) { return x.id !== id; });
    if (!pushConnected()) return;
    txDirtyUp();   /* ר' ההערה ב-`addTransaction` — כאן הסכנה הפוכה:
                      רענון שינחת באמצע מחזיר שורה שנמחקה. */
    txWriteOn(function (on) {
      if (!on || !copy) { txFellBack(); return txDeleteViaSheets(id, yr, copy, at); }
      CBA.fb.deleteDoc("budgetTx", txDocId(copy), function (err) {
        if (err) { txFellBack(); return txDeleteViaSheets(id, yr, copy, at); }
        txWrote("delete");
      });
    });
  }

  function txDeleteViaSheets(id, yr, t, at) {
    txNote("delete", "appsscript", "");
    CBA.sheets.push("deleteTransaction", { year: yr || getCurrentYear(), id: id }, function (res) {
      if (res && res.ok === true) return;
      // כבר הוחזרה איכשהו (רענון שהספיק לרוץ) — לא מכניסים כפילות
      if (CBA.mock.transactions.some(function (x) { return x.id === id; })) return;
      if (t) CBA.mock.transactions.splice(at < 0 ? CBA.mock.transactions.length : at, 0, t);
      rollbackNote("המחיקה לא בוצעה בגיליון והשורה הוחזרה", res);
    });
  }

  // --- מחזור חיי קובץ הקבלה (סעיף 4, 2026-08-06) — העלאה/החלפה ומחיקה בפועל
  // ב-Drive, לא רק ניתוק/עדכון הקישור בשדה. פעולות doPost עם תשובה קריאה
  // (postRead, לא push) כי צריך לדעת מיד אם הצליח ולקבל בחזרה את קישור הקובץ
  // החדש כדי לעדכן את הטופס. עובד רק על תנועה שכבר נשמרה (יש לה id אמיתי בגיליון).
  function uploadReceiptFile(t, fileFields, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    if (t.id == null) { if (cb) cb({ ok: false, error: "יש לשמור את התנועה לפני צירוף קבלה" }); return; }
    const payload = Object.assign({ year: t.year || getCurrentYear(), id: t.id, oldUrl: t.receiptUrl || "" }, fileFields);
    CBA.sheets.postRead("uploadReceiptFile", payload, cb);
  }
  function deleteReceiptFile(t, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    if (t.id == null) { if (cb) cb({ ok: false, error: "יש לשמור את התנועה לפני מחיקת קבלה" }); return; }
    CBA.sheets.postRead("deleteReceiptFile", { year: t.year || getCurrentYear(), id: t.id, url: t.receiptUrl || "" }, cb);
  }

  /* --- שליפת קובץ קבלה דרך השרת (2026-08-24 — תיקון אבטחה, שלב 2) ---
     קודם הדפדפן משך את הקובץ ישירות מ-Drive, מה שחייב שהקובץ יהיה משותף
     ל"כל מי שיש לו הקישור". עכשיו הקבצים פרטיים והשרת מגיש אותם אחרי בדיקת
     הרשאה (handleReceiptFile_ ב-Code.gs), כ-Base64. כאן ממירים אותו ל-Blob
     מקומי — כתובת blob: שאפשר להציג ב-<img>/<iframe> ולפתוח בחלון חדש.

     מטמון: קבלה נפתחת ונסגרת שוב ושוב בזמן בדיקה, ואין טעם למשוך את אותו
     קובץ פעמיים. שומרים עד RECEIPT_CACHE_MAX כתובות blob ומשחררים את הישנה
     ביותר (revokeObjectURL) — בלי זה הזיכרון היה גדל בלי גבול בסשן ארוך. */
  var RECEIPT_CACHE_MAX = 12;
  var receiptCache = [];   // [{id, res}] — הישן ביותר בהתחלה

  function receiptCacheGet(id) {
    for (var i = 0; i < receiptCache.length; i++) {
      if (receiptCache[i].id === id) {
        var hit = receiptCache.splice(i, 1)[0];   // מקודם לסוף = "נצפה לאחרונה"
        receiptCache.push(hit);
        return hit.res;
      }
    }
    return null;
  }
  function receiptCachePut(id, res) {
    receiptCache.push({ id: id, res: res });
    while (receiptCache.length > RECEIPT_CACHE_MAX) {
      var old = receiptCache.shift();
      try { if (old.res && old.res.url) URL.revokeObjectURL(old.res.url); } catch (e) {}
    }
  }

  function base64ToBlobUrl(b64, mimeType) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([arr], { type: mimeType || "application/octet-stream" }));
  }

  /** getGardenPhoto(fileId, cb) — תמונת דיווח גינון (PHASE 4.2).
   *  אותו צינור בדיוק של getReceipt, אבל דרך action=gardenPhoto — כי
   *  ההרשאה שונה לגמרי: שם מנהל תקציב ובעל הקבלה, כאן צוות הגינון והתושב
   *  המדווח. חולק את אותו מטמון blob (ר' receiptCache) כי המחיר זהה. */
  function getGardenPhoto(fileId, cb) {
    if (!fileId) { cb({ ok: false, error: "אין מזהה תמונה" }); return; }
    var cachedP = receiptCacheGet(fileId);
    if (cachedP) { cb(cachedP); return; }
    CBA.sheets.get({ action: "gardenPhoto", id: fileId }, function (res) {
      if (!res || !res.ok) {
        cb({ ok: false, error: (res && res.error) || "שליפת התמונה נכשלה", tooLarge: !!(res && res.tooLarge) });
        return;
      }
      var outP;
      try {
        outP = { ok: true, url: base64ToBlobUrl(res.dataBase64, res.mimeType),
                 mimeType: res.mimeType || "", name: res.name || "" };
      } catch (e) { cb({ ok: false, error: "התמונה הגיעה פגומה" }); return; }
      receiptCachePut(fileId, outP);
      cb(outP);
    });
  }

  /** getReceipt(fileId, cb) -> cb({ok:true, url, mimeType, name}) או {ok:false, error, tooLarge} */
  function getReceipt(fileId, cb) {
    if (!fileId) { cb({ ok: false, error: "אין מזהה קובץ" }); return; }
    var cached = receiptCacheGet(fileId);
    if (cached) { cb(cached); return; }
    CBA.sheets.get({ action: "receipt", id: fileId }, function (res) {
      if (!res || !res.ok) {
        cb({ ok: false, error: (res && res.error) || "שליפת הקבלה נכשלה", tooLarge: !!(res && res.tooLarge) });
        return;   // כישלון לא נכנס למטמון — ניסיון חוזר צריך באמת לנסות שוב
      }
      var out;
      try {
        out = { ok: true, url: base64ToBlobUrl(res.dataBase64, res.mimeType), mimeType: res.mimeType || "", name: res.name || "" };
      } catch (e) {
        cb({ ok: false, error: "לא הצלחנו לפענח את הקובץ" });
        return;
      }
      receiptCachePut(fileId, out);
      cb(out);
    });
  }

  // --- "ניהול עמודות" בטבלת ניהול הוצאות (סעיף 6, 2026-08-06): הצג/הסתר עמודות
  // קיימות, שם תצוגה מותאם, ועמודות מותאמות אישית. נשמר בטאב "הגדרות" (מפתח
  // "עמודות מותאמות", JSON) — משותף לכל מי שנכנס לאפליקציה, לא רק למכשיר אחד.
  function getColumnConfig() {
    const raw = (CBA.mock && CBA.mock._settings && CBA.mock._settings["עמודות מותאמות"]) || "";
    const cfg = { hidden: [], labels: {}, custom: [] };
    if (raw) { try { Object.assign(cfg, JSON.parse(raw)); } catch (e) { /* JSON פגום — מתעלמים, ברירת מחדל ריקה */ } }
    cfg.hidden = cfg.hidden || []; cfg.labels = cfg.labels || {}; cfg.custom = cfg.custom || [];
    return cfg;
  }
  function saveColumnConfig(config, cb) {
    if (CBA.mock) CBA.mock._settings = Object.assign({}, CBA.mock._settings, { "עמודות מותאמות": JSON.stringify(config) });
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.push("saveColumnConfig", { year: getCurrentYear(), config: config }, cb);
  }

  // --- מועד החזר צפוי לתושב (סעיף 7, 2026-08-06) ---
  // כלל התזמון (יועד): בקשת החזר שהוגשה עד ה-19 לחודש (כולל) מועברת בפועל
  // באחד לחודש שאחרי; הוגשה מה-20 ואילך — נדחית עוד חודש. "חודש הגשה" (t.month)
  // כבר מחושב עם אותו חיתוך בדיוק בשני המקורות (טופס מנהל: txDefaultSubmissionMonth
  // ב-expenses.js; הגשת תושב: submissionMonthForToday_ ב-Code.gs) — כך שהעברה
  // בפועל היא תמיד ב-1 לחודש שאחרי t.month, בלי לחשב חיתוך יום נוסף כאן.
  // רלוונטי רק להחזר לתושב (לא לתשלום ספק/הוצאה כללית, שאין להם מחזור קבוע).
  function expectedRefundDate(t) {
    if (!t) return null;
    const etype = t.expenseType || (t.payType === "refund" ? "refund" : "supplier");
    if (etype !== "refund" || !t.month) return null;
    const p = String(t.month).split("-");
    if (p.length !== 2) return null;
    let y = parseInt(p[0], 10), m = parseInt(p[1], 10); // m: 1-12
    if (!y || !m) return null;
    m += 1; if (m > 12) { m = 1; y += 1; }
    return y + "-" + String(m).padStart(2, "0") + "-01";
  }
  function expectedRefundDateLabel(t) {
    const iso = expectedRefundDate(t);
    return iso ? hebrewDate(iso) : "";
  }

  // --- שמירת תכנון התקציב (סעיפים + הכנסות) לגיליון ---
  // נשלח כמקשה אחת: הגיליון מסונכרן למצב שבאפליקציה (עדכון/הוספה/מחיקה).
  // מקבל שנה מפורשת (ברירת מחדל: הנוכחית) — כדי ששמירה מושהית לא תיכתב לשנה הלא-נכונה.
  // החלוקה החודשית מחושבת כאן (categoryMonthly) כדי שהגיליון יישאר עקבי.
  // cb אופציונלי (נוסף 2026-08-09) — נקרא אחרי שהבקשה לשרת חזרה (הצלחה/כישלון),
  // כדי ש-planning.js יוכל לדעת מתי לבטל את סימון "יש עריכה שטרם אושרה" (ר' sheets.js).
  function saveBudgetToSheet(year, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    year = year || getCurrentYear();
    const Y = CBA.mock.years[year];
    if (!Y) { if (cb) cb({ ok: false, error: "שנה לא קיימת" }); return; }
    // בגיליון המפתח של קבוצה/מקור-הכנסה הוא השם. פותרים כאן id -> שם, כדי שגם
    // אחרי שינוי-שם השיוך יישאר עקבי בין הסעיף לרשימת הקבוצות/ההכנסות.
    // (2026-08-18, ממצא 4.5 בדו"ח הבדיקה) קודם שתי השורות האלה קראו את רשימת
    // הקבוצות מ-CBA.mock.groups / getGroups(), ושתיהן נגזרות מ-*השנה הנוכחית*
    // ולא מ-year שהתקבל כפרמטר. הסעיפים עצמם כן נקראו מהשנה הנכונה — כלומר
    // אם המשתמש ערך סכום והחליף שנה בתוך 700 המילישניות של ההשהיה, השמירה
    // הלכה לשנה הישנה אבל לקחה איתה את רשימת הקבוצות של השנה החדשה.
    const yearGroups = (Y.groups && Y.groups.length) ? Y.groups : [];
    const groupName = function (id) { const g = yearGroups.find(function (x) { return x.id === id; }); return g ? g.name : (id || ""); };
    const incName = function (id) { const s = (Y.income || []).find(function (x) { return x.id === id; }); return s ? s.name : (id || ""); };
    const cats = (Y.categories || []).map(function (c) {
      return {
        key: c.id, name: c.name, plan: Number(c.plan) || 0,
        group: groupName(c.group), incomeSourceId: incName(c.incomeSourceId),
        distMode: (c.dist && c.dist.mode) || "equal",
        monthly: categoryMonthly(c),
        // פיצול בין כמה מקורות הכנסה (סעיף 4, 2026-08-10) — נשלח רק כשיש 2+
        // שורות (זו ההגדרה של "מפוצל"); אחרת null, ואין מה לכתוב לטאב הפיצול.
        sources: (c.sources && c.sources.length > 1)
          ? c.sources.map(function (s) { return { name: incName(s.incomeSourceId), amount: Number(s.amount) || 0 }; })
          : null,
        // פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10) — נשלח כשיש 1+ פריטים
        // (בשונה מ-sources, גם פריט יחיד תקף — ר' normalizeCategory). כל פריט
        // שולח גם את מצב החלוקה החודשית שלו (distMode/monthly, סעיף 7ג,
        // 2026-08-10) — באותו פורמט בדיוק כמו הסעיף עצמו למעלה — כדי שהחלוקה
        // הפר-פריטית תשרוד רענון מהגיליון (ר' saveBudgetItems_ ב-Code.gs).
        items: (c.items && c.items.length)
          ? c.items.map(function (it) {
              return {
                name: it.name, plan: Number(it.plan) || 0,
                distMode: (it.dist && it.dist.mode) || "equal",
                monthly: distMonthly(it.dist, it.plan)
              };
            })
          : null
      };
    });
    const income = (Y.income || []).map(function (s) {
      return {
        key: s.id, name: s.name, type: s.type,
        amount: Number(s.amount) || 0, rate: Number(s.rate) || 0,
        families: Number(s.families) || 0, months: Number(s.months) || 0,
        tailFamilies: Number(s.tailFamilies) || 0
      };
    });
    const groups = yearGroups.map(function (g) { return g.name; });
    CBA.sheets.push("saveBudget", { year: year, categories: cats, income: income, groups: groups }, cb);
  }

  // --- פנקס הערות כלליות (סעיף 1, 2026-08-09) — פר שנת תקציב ---
  // נפתח מלשונית "הערות" במסך "בניית תקציב" (ר' notes.js). תוכן = HTML של
  // עורך contenteditable (בולד/כותרת/רשימות). "מי ערך אחרון" מוצג תמיד למעלה;
  // אין עריכה בו-זמנית אמיתית (אין תשתית real-time בסטאק הזה) — מי ששומר
  // אחרון מנצח, בדיוק כמו כל שמירה אחרת באפליקציה. יומן עריכות נפרד (getNotesLog)
  // מראה מי שינה ומתי, בדומה ל"עדכוני תקציב".
  function getNotes() {
    const y = CBA.mock.years[CBA.mock.currentYear];
    if (!y.notes) y.notes = { content: "", editedBy: "", editedAt: "" };
    return y.notes;
  }
  // שמירה: מעדכן מקומית באופן אופטימי (כדי שהתצוגה תגיב מיד) ושולח לגיליון.
  // cb אופציונלי — נקרא אחרי שהבקשה חזרה, כדי ש-notes.js יוכל לבטל markDirty.
  function saveNotesToSheet(year, content, editedBy, cb) {
    const n = getNotes();
    n.content = content;
    n.editedBy = editedBy || "";
    n.editedAt = fmtNowStamp();
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    year = year || getCurrentYear();
    CBA.sheets.push("saveNotes", { year: year, content: content, editedBy: editedBy || "" }, function (res) {
      /* 🔴 השמירה מוסיפה שורה ל"יומן הערות" בשרת. מאז שהיומן
         יורד לפי דרישה (16.9, פעולה 4) ולא עם כל רענון, צריך
         לסמן אותו כלא-טעון — אחרת "יומן עריכות" היה מציג את
         המצב מלפני העריכה עד רענון הדף. */
      if (res && res.ok === true) CBA.mock._logsLoaded = false;
      if (cb) cb(res);
    });
  }
  /* ==========================================================================
   *  שני היומנים לפי דרישה   (2026-09-16, פעולה 4)
   * --------------------------------------------------------------------------
   *  נקראת מהמסכים שבאמת מציגים את היומנים (בניית תקציב,
   *  פנקס הערות). cb(changed) — `true` רק כשהגיעו נתונים חדשים,
   *  כלומר רק אז צריך לצייר מחדש. ⚠️ **חובה לבדוק את הדגל הזה**
   *  לפני ציור מחדש — ציור ללא תנאי מתוך רינדור הוא לולאה אין-סופית.
   *  ⚠️ כישלון אינו נועל: הניסיון הבא ייצא בפעם הבאה שהמסך נפתח.
   * ========================================================================== */
  var logsInFlight = false;
  function ensureBudgetLogs(cb) {
    cb = cb || function () {};
    if (CBA.mock._logsLoaded) return cb(false);
    if (logsInFlight) return cb(false);
    if (!(CBA.sheets && CBA.sheets.loadBudgetLogs && CBA.sheets.isConnected && CBA.sheets.isConnected())) return cb(false);
    logsInFlight = true;
    CBA.sheets.loadBudgetLogs(function (ok) {
      logsInFlight = false;
      cb(ok === true);
    });
  }
  // יומן העריכות של הפנקס לשנה הנוכחית — כרונולוגי, החדש למעלה
  function getNotesLog() {
    const y = getCurrentYear();
    return (CBA.mock.notesLog || []).filter(function (u) { return u.year === y; }).slice().reverse();
  }

  // --- הגשת בקשה מתושב (שלב 3): תמונה + פרטים -> Drive + שורה בגיליון ---
  // פעולה אטומית אחת בשרת (submitReceipt): מעלה את הקבלה ל-Drive ומוסיפה את
  // השורה בו-זמנית, כדי שלא נצטרך לקרוא בחזרה קישור מ-Drive לפני כתיבת השורה.
  // המזהה מחושב בשרת.
  // תוקן 2026-08-08 (באג: "מסך ההצלחה קופץ לפני שההעלאה באמת הסתיימת"):
  // עבר מ-CBA.sheets.push (POST no-cors "שגר ושכח" — התשובה לא נקראת, מניחים
  // הצלחה ברגע שה-fetch מתפענח, בלי שום מדד התקדמות אמיתי במהלך שליחת קובץ
  // Base64 גדול) ל-CBA.sheets.postReadProgress: אותה בקשה "פשוטה" בדיוק
  // (text/plain, בלי preflight) שכבר מוכחת כעובדת עם תשובה קריאה דרך
  // postRead (למשל uploadReceiptFile) — רק שהפעם דרך XMLHttpRequest כדי
  // לחשוף אחוז התקדמות אמיתי (onProgress) ולוודא ש-cb(res) נקרא אך ורק אחרי
  // שהתשובה האמיתית מהשרת התקבלה ונפענחה (לא לפני, ולא רק "הנחה" של הצלחה).
  // onProgress הוא פרמטר רביעי אופציונלי (לא שובר קריאות קיימות ל-cb כפרמטר שני).
  // cb(res) מקבל {ok:true} רק אם השרת אכן אישר הצלחה, או {ok:false, error}.
  // בהצלחה: מוסיפים גם עותק מקומי אופטימי לזיכרון, כדי שהבקשה תופיע מיד
  // ב"הבקשות שלי" בלי לחכות לרענון מהגיליון (מזהה זמני — יוחלף באמיתי ברענון הבא).
  /* ==========================================================================
   *  הגשת בקשת החזר — מפוצלת   (צעד 09ב-5ב, 2026-09-15)
   * --------------------------------------------------------------------------
   *  🔴 **סדר הפעולות הוא הכרעה, לא מקריות** (יועד, 15.9): **קודם
   *  הקובץ, אחר כך המסמך.** אם ניפול באמצע, נשאר קובץ יתום ב-Drive —
   *  בלתי נראה לאף אחד. הסדר ההפוך היה משאיר לתושב **בקשה בלי קבלה**
   *  על המסך, והוא לא היה מבין למה.
   *
   *  🔴 **מזהה המשפחה מגיע מהשרת**, שגוזר אותו מהמייל המאומת — לא
   *  מהטופס. זה הבאג של 9.9 שלא נחזור עליו.
   *
   *  ⚠️ **`mailPending:true`** — כלל אבטחה אינו יכול לשלוח מייל. הטריגר
   *     סוחט וסולח, ותבנית המייל נגזרת ממצב המסמך ולא משדה של הלקוח.
   * ======================================================================== */
  function submitReceiptViaFirestore(fields, cb, onProgress, fallback) {
    const year = getWorkingYear();
    CBA.sheets.postReadProgress("uploadReceiptOnly",
      Object.assign({ year: year }, fields), onProgress, function (up) {
        if (!up || !up.ok || !up.url) return fallback();
        CBA.fb.nextId("tx_" + year, function (err, n) {
          if (err) return fallback();
          txDirtyUp();   /* ר' ההערה ב-`addTransaction` */
          const today = new Date().toISOString().slice(0, 10);
          const t = {
            id: n, year: year, month: today.slice(0, 7), date: today,
            supplier: fields.supplier || "", bankName: fields.bankName || "",
            amount: Number(fields.amount) || 0, categoryId: "", subItemId: "",
            expenseType: fields.expenseType, source: "resident", status: "submitted",
            description: fields.description || "", receiptUrl: up.url,
            familyId: String(up.familyId || fields.familyId || "")
          };
          const doc = txToDoc(t);
          doc["שם קובץ קבלה"] = String(up.fileName || "");
          doc["הוגש בתאריך"] = String(up.submittedAt || new Date().toISOString());
          doc.mailPending = true;
          CBA.fb.createDoc("budgetTx", txDocId(t), doc, function (e2) {
            if (e2) { txFellBack(); return fallback(); }
            txWrote("receipt");
            CBA.mock.transactions.push(Object.assign({ buyer: fields.buyer || "", payType:
              fields.expenseType === "refund" ? "refund" : "supplier" }, t));
            if (cb) cb({ ok: true, id: n });
          });
        });
      });
  }

  function submitReceipt(fields, cb, onProgress) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    var wentFs = false;
    txWriteOn(function (on) {
      if (!on || wentFs) return submitReceiptViaSheets(fields, cb, onProgress);
      wentFs = true;
      submitReceiptViaFirestore(fields, cb, onProgress, function () {
        submitReceiptViaSheets(fields, cb, onProgress);
      });
    });
  }

  function submitReceiptViaSheets(fields, cb, onProgress) {
    txNote("receipt", "appsscript", "");
    /* 🔴🔴 **שנת העבודה, לא השנה המוצגת** (2026-09-15).
       זה המסלול שבו תושב מגיש בקשת החזר, והוא זה שגרם
       לכך שהוצאות ספטמבר 2026 נרשמו לשנה הקודמת. */
    const year = getWorkingYear();
    const payload = Object.assign({ year: year }, fields);
    CBA.sheets.postReadProgress("submitReceipt", payload, onProgress, function (res) {
      if (res && res.ok) {
        const today = new Date().toISOString().slice(0, 10);
        CBA.mock.transactions.push({
          id: Date.now(), month: today.slice(0, 7), date: today,
          buyer: fields.buyer || "", supplier: fields.supplier || "",
          bankName: fields.bankName || "", bankBranch: fields.bankBranch || "", bankAccount: fields.bankAccount || "",
          amount: Number(fields.amount) || 0, categoryId: "", description: fields.description || "",
          source: "resident", status: "submitted",
          expenseType: fields.expenseType, payType: fields.expenseType === "refund" ? "refund" : "supplier",
          receiptUrl: "", year: year,
          // תוקן 2026-08-10 (באג שנמצא בסימולציה חיה): בלי השדה הזה העותק
          // האופטימי הזה לא היה תואם את הסינון ב-myRequests() (resident.js),
          // אז "הבקשות שלי" המשיך להראות "אין בקשות" עד רענון מלא של העמוד —
          // resident.js שולח כעת fields.familyId מפורשות בשביל השורה הזו בדיוק.
          familyId: fields.familyId || ""
        });
      }
      if (cb) cb(res);
    });
  }

  // --- סריקה חכמה של קבלה (שלב 4, 2026-08-08): שולחת את התמונה ל-Gemini דרך
  // Code.gs (doPost action 'scanReceipt', ר' STEP C באימות שבזיכרון הפרויקט) ומקבלת
  // בחזרה {ok, fields:{amount,supplier,description,date}} למילוי אוטומטי של הטופס.
  // דרך CBA.sheets.postRead (תשובה קריאה, בלי no-cors) — לא postReadProgress, כי
  // אין כאן צורך אמיתי בפס-התקדמות (הסריקה עצמה, לא ההעלאה, היא ה"המתנה" העיקרית
  // כאן — כ-2-3 שניות סבב מול Gemini; מסופק spinner בכפתור במקום זאת, ר' resident.js).
  // התוצאה היא תמיד הצעת-מילוי בלבד — התושב תמיד רואה ועורך את השדות לפני שליחה
  // בפועל (submitReceipt נשאר נפרד ולא מושפע), אף פעם לא שליחה אוטומטית.
  function scanReceipt(dataBase64, mimeType, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("scanReceipt", { dataBase64: dataBase64, mimeType: mimeType }, cb);
  }

  // --- שריון מועדון (שלב 8): תפוסה מיומן Google Calendar ייעודי + יצירת שריון ---
  // שתי הפעולות עוברות דרך CBA.sheets.get (GET קריא, לא no-cors) כי חייבים לדעת
  // מיד אם השריון הצליח או שהזמן נתפס (בדיוק כמו login). לא נוגעות בגיליון/ב-mock.
  function getClubBusy(dateStr, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "clubBusy", date: dateStr }, cb);
  }
  function reserveClub(fields, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get(Object.assign({ action: "reserveClub" }, fields), cb);
  }
  function getClubMonth(monthStr, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "clubMonth", month: monthStr }, cb);
  }
  function getMyClubReservations(fields, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get(Object.assign({ action: "myClubReservations" }, fields), cb);
  }
  function cancelClubReservation(fields, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get(Object.assign({ action: "cancelClubReservation" }, fields), cb);
  }
  // --- ניהול אישורי שריון (מסך המנהל) — המושב החתום מצורף אוטומטית ע"י CBA.sheets.get ---
  function getClubList(cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "clubList" }, cb);
  }
  // --- מכון כושר (שלב 1, 2026-08-18) — קריאת מסך הניהול. מוגנת ב-PERM_GYM
  // בשרת, ולכן מחזירה שגיאה מסודרת למי שאין לו את המידור, ולא מסך ריק.
  /* ==========================================================================
   *  🔴 **דגלי זמן ריצה — סוף-סוף עם פנים**  (2026-09-16)
   * --------------------------------------------------------------------------
   *  הדגלים קיימים מ-05א, אבל עד היום אפשר היה להדליק ולכבות אותם רק
   *  בהקלדת כתובת Apps Script ידנית. כלומר: בשעת חירום, מי שצריך לכבות
   *  תחום הוא היחיד שאינו יכול — ואין שום מקום שמראה **מה בכלל דלוק**.
   *  ⚠️ שתי הפעולות מוגנות ב-PERM_SUPER בשרת (`GET_ACTION_PERMS`).
   *     ההסתרה בלקוח היא נוחות; המידור הוא שם.
   * ======================================================================== */
  function getFlags(cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "flagsGet" }, cb);
  }
  function setFlag(key, value, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "flagSet", key: String(key), value: value ? "true" : "false" }, cb);
  }

  /* ==========================================================================
   *  🔴 **בדיקת בריאות של תחום ב-Firestore** (2026-09-16)
   * --------------------------------------------------------------------------
   *  שואלת שאלה אחת ומחזירה תשובה אחת: **האם הדפדפן הזה, עם המשתמש הזה,
   *  באמת מצליח לקרוא את המסמך — וכמה זמן זה לקח.** זו השאלה שאי-אפשר
   *  לענות עליה מהשרת: הכללים נאכפים על **הקורא**, ומנהל-על בשרת עוקף
   *  אותם דרך חשבון השירות. בדיקה שרצה בשרת הייתה תמיד מצליחה.
   *  ⚠️ שגיאה אינה תקלה בהכרח — `gymCode` **אמור** להידחות כשהמנוי פג.
   *     לכן מוחזר גם הטקסט, והמסך הוא זה שמחליט מה להגיד עליו.
   * ======================================================================== */
  function probeDoc(collection, id, cb) {
    cb = cb || function () {};
    var t0 = Date.now();
    function out(state, note) { cb({ state: state, ms: Date.now() - t0, note: note || "" }); }
    if (!(CBA.fb && CBA.fb.readDoc && CBA.fb.ensureDb)) return out("no-sdk");
    CBA.fb.authReady(function (user) {
      if (!user) return out("no-user");
      CBA.fb.ensureDb(function (err) {
        if (err) return out("no-db", String(err && err.message || err));
        CBA.fb.readDoc(collection, id, function (e2, doc) {
          if (e2) return out("denied", String((e2 && e2.code) || (e2 && e2.message) || e2));
          if (!doc) return out("missing");
          out("ok");
        });
      });
    });
  }

  /* ==========================================================================
   *  🔴 **מוני עמוד הבית מ-Firestore** — הציור הראשון
   *     (2026-09-16, פעולה 3)
   * --------------------------------------------------------------------------
   *  📊 נמדד בייצור (16.9): `homeExtras` — 6,486 אלפיות;
   *  קריאת Firestore — 24 עד 163. חמש תגיות הספירה של עמוד
   *  הבית הן חמישה מספרים, והם חיכו שש שניות.
   *
   *  ⚠️ **זה לא מחליף את `homeExtras`** — הוא נדרש בכל מקרה
   *     לכרטיס "יש משהו חדש" ולשריון הקרוב, והתשובה
   *     שלו היא **הקובעת**. המסמכים כאן הם הציור הראשון
   *     בלבד, ולכן אפילו מסמך מיושן מתקן תוך שניות.
   *  ⚠️ **מבקשים רק את מה שמותר.** מסמך לכל הרשאה, והקורא
   *     מעביר את הרשימה — קריאה למסמך שאינו שלו נדחית
   *     בכלל האבטחה, ואין שום סיבה לשלוח אותה.
   *  ⚠️ כל כשל — אין SDK, אין משתמש, הדגל כבוי, כלל דחה —
   *     מחזיר `null`, והמסך מתנהג בדיוק כמו אתמול.
   *  🔴 **הדגל נבדק אחרי `ensureDb`** ולא לפניו — לפני כן
   *     `CBA.fb.flag` מחזיר את ברירת המחדל שבקוד במקום את
   *     הדגל החי. זה נתפס חי ב-15.9 ומתועד ב-`fsFirstRead`.
   * ======================================================================== */
  var HOME_COUNTS_FROM_FIRESTORE = false;
  function getHomeCountsFast(domains, cb) {
    cb = cb || function () {};
    var want = (domains || []).slice();
    if (!want.length) return cb(null);
    if (!(CBA.fb && CBA.fb.readDoc && CBA.fb.ensureDb)) return cb(null);
    var t0 = Date.now();
    CBA.fb.authReady(function (user) {
      if (!user) return cb(null);
      CBA.fb.ensureDb(function (err) {
        if (err) return cb(null);
        if (CBA.fb.flag && !CBA.fb.flag("homeCountsFromFirestore", HOME_COUNTS_FROM_FIRESTORE)) {
          return cb(null);
        }
        var out = {}, left = want.length, settled = false;
        function settle() {
          if (settled) return;
          settled = true;
          try {
            CBA.perf = CBA.perf || {};
            CBA.perf.homeCounts = { source: "firestore", ms: Date.now() - t0,
                                    got: Object.keys(out).join(","), at: new Date().toISOString() };
          } catch (e) {}
          cb(out);
        }
        want.forEach(function (d) {
          CBA.fb.readDoc("homeCounts", d, function (e2, doc) {
            if (!e2 && doc) out[d] = doc;
            if (--left <= 0) settle();
          });
        });
      });
    });
  }

  /* ==========================================================================
   *  🔴 **כרטיס הסיור והשריון הקרוב מ-Firestore**   (צעד 12, 2026-09-16)
   * --------------------------------------------------------------------------
   *  📊 נמדד בייצור אחרי פריסה 132: `homeExtras` 4,500–8,100 אלפיות,
   *  קריאת Firestore 40–57. ואחרי שהמונים כבר עברו, **שני אלה הם כל מה
   *  שנשאר** שמחזיק את עמוד הבית תלוי ב-Apps Script.
   *
   *  🔴 **ולמה הרצפה לא נעלמת בלי זה:** `rev` — המדידה שממנה גזרנו
   *  "רצפה של שתי שניות" — חוזרת **לפני שער ההרשאות**, ולכן אינה קוראת
   *  את טאב התושבים בכלל. כל פעולה מאומתת משלמת קריאה מלאה של הטאב
   *  הזה, וזה מה שנשאר ב-`tour` גם אחרי שהטבלה עברה למטמון.
   *
   *  ⚠️ **התשובה בנויה בדיוק כמו זו של `action=tour`** — `{ok, steps, seen}` —
   *     כדי ש-`CBA.tour.seed` יקבל אותה בלי פענוח שני של הפורמט.
   *  ⚠️ **הקהל נבחר בלקוח, אבל נאכף בשרת.** הלקוח מבקש רק את המסמכים
   *     שמותרים לו; מי שיבקש אחר — כלל האבטחה ידחה. הבחירה כאן היא
   *     חיסכון בקריאות, לא שער.
   * ======================================================================== */
  var TOUR_FROM_FIRESTORE = false;
  var CLUB_RESV_FROM_FIRESTORE = false;

  /* הרשאה → מזהה מסמך. ⚠️ חייב להתאים ל-TOUR_PERM_DOC ב-Code.gs;
     יש בדיקה שמצליבה את שתי הרשימות. "תושבים" אינו כאן בכוונה — ר' שם. */
  var TOUR_PERM_DOC = { "על": "perm-super", "תקציב": "perm-budget",
                        "מועדון": "perm-club", "מכון": "perm-gym", "גינון": "perm-garden" };

  function tourDocIdsForMe() {
    var ids = ["all"];
    var perms = (window.CBA && CBA.perms) || [];
    var isSuper = !!(window.CBA && CBA.isSuper);
    var isAdmin = isSuper || perms.length > 0;
    /* 🔴 אותה הגדרת "מנהל" בדיוק כמו `handleTour_`: מנהל-על, או מי
       שיש לו ולו הרשאה אחת. שתי הגדרות היו "הצעד מופיע במסלול אחד
       ולא בשני". */
    ids.push(isAdmin ? "admins" : "residents");
    Object.keys(TOUR_PERM_DOC).forEach(function (k) {
      if (isSuper || perms.indexOf(k) !== -1) ids.push(TOUR_PERM_DOC[k]);
    });
    return ids;
  }

  /* 🔴 אותו מיון בדיוק כמו `tourStepCompare_` בשרת. שני סדרים שונים =
     "הצעדים מופיעים בסדר אחר בכל מסלול", וזו תקלה שנראית אקראית. */
  function tourStepCompare(a, b) {
    var va = parseInt(a["גרסה"], 10) || 1, vb = parseInt(b["גרסה"], 10) || 1;
    if (va !== vb) return va - vb;
    return (parseInt(a["סדר"], 10) || 0) - (parseInt(b["סדר"], 10) || 0);
  }

  function fsReady(cb) {
    if (!(CBA.fb && CBA.fb.readDoc && CBA.fb.ensureDb)) return cb(false);
    CBA.fb.authReady(function (user) {
      if (!user) return cb(false);
      CBA.fb.ensureDb(function (err) { cb(!err); });
    });
  }

  function getTourFast(cb) {
    cb = cb || function () {};
    var t0 = Date.now();
    fsReady(function (ready) {
      if (!ready) return cb(null);
      if (CBA.fb.flag && !CBA.fb.flag("tourFromFirestore", TOUR_FROM_FIRESTORE)) return cb(null);
      var ids = tourDocIdsForMe();
      var uid = CBA.fb.uid && CBA.fb.uid();
      var steps = [], seen = 0, left = ids.length + (uid ? 1 : 0), got = 0, settled = false;
      var missed = [];
      function done() {
        if (settled) return;
        settled = true;
        /* 🔴 אף מסמך לא נקרא ⇒ null, כלומר **נפילה לאחור ל-homeExtras**.
           רשימת צעדים ריקה היא תשובה תקפה רק אם משהו באמת נקרא. */
        try {
          if (missed.length && CBA.diag && CBA.diag.log) {
            CBA.diag.log("צעדי סיור שלא נטענו: " + missed.join(", "));
          }
        } catch (x) {}
        if (!got) return cb(null);
        steps.sort(tourStepCompare);
        try {
          CBA.perf = CBA.perf || {};
          CBA.perf.tour = { source: "firestore", ms: Date.now() - t0, docs: got,
                            at: new Date().toISOString() };
        } catch (e) {}
        cb({ ok: true, steps: steps, seen: seen });
      }
      /* ⚠️ 17.9, גל 2 · ממצא 13 — **מסמך סיור חסר נבלע בשקט.**
         המסלול עצמו תקין מאז 16.9 (השרת ממפה "תושבים"→`residents`, הלקוח
         מבקש אותו, והכלל מתיר אותו), ולכן מה שנשאר מהממצא אינו באג במסלול
         אלא היעדר עקבה: אם המסמך לא קיים — כי אין שורה כזו בגיליון, כי
         `fsSweepOrphans_` מחק אותו, או כי כלל האבטחה דחה — התוצאה זהה
         לחלוטין לרשימת צעדים ריקה, והצעד פשוט לא מופיע לאיש.
         נרשם ל-`CBA.diag` בלבד, בלי מנגנון חדש ובלי הודעה למשתמש. */
      ids.forEach(function (id) {
        CBA.fb.readDoc("tourSteps", id, function (e, d) {
          if (!e && d) { got++; steps = steps.concat(d.steps || []); }
          else missed.push(id + (e ? " (שגיאה)" : " (אין מסמך)"));
          if (--left <= 0) done();
        });
      });
      if (uid) {
        CBA.fb.readDoc("tourSeen", uid, function (e, d) {
          /* ⚠️ אין מסמך = לא ראה כלום = 0. זו תשובה תקפה ולא כשל. */
          if (!e && d) { got++; seen = parseInt(d.v, 10) || 0; }
          if (--left <= 0) done();
        });
      }
    });
  }

  /* השריון הקרוב — מסמך אחד, לפי מזהה המשפחה של הקורא.
     ⚠️ **בלי הערה ובלי אימייל** (ר' `clubResvSyncAll_`), ולכן זה מזין
        את שורת עמוד הבית בלבד. מסך "השריונים שלי" ממשיך כרגיל. */
  function getClubResvFast(cb) {
    cb = cb || function () {};
    var t0 = Date.now();
    /* ⚠️ אותו מקור בדיוק שממנו `sheets.js` גוזר את תנועות המשפחה
       (`CBA.user.familyId`) — שני מקורות היו נפרדים בשקט. */
    var fid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
    if (!fid) return cb(null);
    fsReady(function (ready) {
      if (!ready) return cb(null);
      if (CBA.fb.flag && !CBA.fb.flag("clubResvFromFirestore", CLUB_RESV_FROM_FIRESTORE)) return cb(null);
      CBA.fb.readDoc("clubReservations", fid, function (e, d) {
        if (e) return cb(null);
        try {
          CBA.perf = CBA.perf || {};
          CBA.perf.clubResv = { source: "firestore", ms: Date.now() - t0,
                                n: d ? (d.items || []).length : 0, at: new Date().toISOString() };
        } catch (er) {}
        /* 🔴 **אין מסמך = אין שריונים**, ולא כשל: משפחה בלי שריונים
           כלל לא מקבלת מסמך. החזרת null כאן היתה מפילה את עמוד
           הבית בחזרה ל-homeExtras עבור רוב המשפחות, תמיד. */
        cb({ ok: true, reservations: (d && d.items) || [] });
      });
    });
  }

  function getGymList(cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "gymList" }, cb);
  }
  // --- מכון כושר, שלב 2 (2026-08-19) ---
  // gymForm/gymMy הן קריאות של התושב (GET, פתוחות לכל תושב מחובר ופעיל).
  function getGymForm(cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "gymForm" }, cb);
  }
  function getGymMy(cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "gymMy" }, cb);
  }

  /* ==========================================================================
   *  🔴 **סטטוס המנוי מ-Firestore** — מהיר, חלקי, לציור הראשון
   * --------------------------------------------------------------------------
   *  צעד 10ב-2. נמדד בייצור (16.9): קריאת Apps Script עולה 2.4–10
   *  שניות, וקריאת Firestore 6–59 **אלפיות שנייה**. והמסך הזה
   *  הוא הנפתח ביותר ע"י תושבים — "בדרך למכון, כדי לראות את
   *  הקוד" (מתוך resGym.js עצמו).
   *
   *  ⚠️ **חלקי במכוון.** המסמך מכיל רק שדות סטטוס — אין בו
   *     ת.ז., תאריך לידה, תשובות שאלון, ולא את קוד הכניסה.
   *     לכן הוא משמש לציור הראשון בלבד, ו-`gymMy` משלים.
   *  ⚠️ כל כשל — אין SDK, אין משתמש, אין מסמך — מחזיר `null`
   *     והמסך מתנהג בדיוק כמו קודם. אין מסלול שמציג שגיאה.
   * ======================================================================== */
  function getGymStatusFast(cb) {
    cb = cb || function () {};
    if (!(CBA.fb && CBA.fb.readDoc && CBA.fb.ensureDb)) return cb(null);
    CBA.fb.authReady(function (user) {
      if (!user) return cb(null);
      CBA.fb.ensureDb(function (err) {
        if (err) return cb(null);
        var uid = CBA.fb.uid && CBA.fb.uid();
        if (!uid) return cb(null);
        CBA.fb.readDoc("gymStatus", uid, function (e2, doc) {
          if (e2 || !doc) return cb(null);
          cb(doc);
        });
      });
    });
  }
  /* ==========================================================================
   *  🔴 **קוד הכניסה למכון — הדבר היחיד שבשבילו פותחים את המסך**
   *     (צעד 10ב-3, 2026-09-16)
   * --------------------------------------------------------------------------
   *  התושב פותח את מסך המכון בדרך לחדר הכושר, בשביל שורה אחת:
   *  הקוד. עד היום הוא חיכה 2.4–10 שניות לתשובת Apps Script.
   *
   *  ⚠️ **כישלון כאן הוא חסר-קוד, לעולם לא שגיאה.** כלל האבטחה
   *     דוחה את הקריאה ברגע שהמנוי פג — וזו תשובה תקינה
   *     ומצופה, לא תקלה. התשובה מ-Apps Script היא הקובעת בכל
   *     מקרה, והיא תמיד מגיעה.
   *  ⚠️ **אין כאן שום בדיקת תוקף בלקוח.** לא בגלל אמון בלקוח
   *     אלא להפך: השער היחיד הוא הכלל בשרת. בדיקה שנייה כאן
   *     היתה מזמינה את השתיים להיפרד.
   * ======================================================================== */
  function getGymCodeFast(cb) {
    cb = cb || function () {};
    if (!(CBA.fb && CBA.fb.readDoc && CBA.fb.ensureDb)) return cb("");
    CBA.fb.authReady(function (user) {
      if (!user) return cb("");
      CBA.fb.ensureDb(function (err) {
        if (err) return cb("");
        var uid = CBA.fb.uid && CBA.fb.uid();
        if (!uid) return cb("");
        CBA.fb.readDoc("gymCode", uid, function (e2, doc) {
          /* דחיית הרשאה = המנוי פג. אין קוד, ואין מה לומר. */
          if (e2 || !doc || !doc.code) return cb("");
          cb(String(doc.code));
        });
      });
    });
  }

  // כתיבות — עוברות ב-postRead כדי שנקבל את תשובת השרת בחזרה (הצלחה/שגיאה),
  // בדיוק כמו submitReceipt. שליחה "עיוורת" לא מתאימה כאן: התושב חייב לדעת
  // מיד אם הבקשה נקלטה, ומה הסטטוס שיצא לו.
  // postReadProgress ולא postRead, משתי סיבות שנמדדו בייצור (2026-08-19):
  // (א) הבקשה נושאת תמונת חתימה ב-Base64 והכתיבה בשרת אורכת כמה שניות —
  //     בלי אחוז התקדמות אמיתי המשתמש חושב שנתקע ועוזב את הדף;
  // (ב) ל-postReadProgress יש כבר הגנת beforeunload, שנוספה בדיוק אחרי
  //     שהתגלה ש-submitReceipt "נעלם" כשעוזבים את הדף באמצע שליחה.
  function submitGymApplication(data, cb, onProgress) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postReadProgress("submitGymApplication", data || {}, onProgress || function () {}, cb);
  }
  function createGymMembership(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("createGymMembership", data || {}, cb);
  }
  function requestGymDeclaration(id, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("requestGymDeclaration", { id: id }, cb);
  }
  // --- מכון כושר, שלב 3 (2026-08-19) — כסף ---
  function scanGymPayment(dataBase64, mimeType, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("scanGymPayment", { dataBase64: dataBase64, mimeType: mimeType }, cb);
  }
  function reportGymPayment(data, cb, onProgress) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    // גם כאן יכולה להיות תמונה (צילום אישור התשלום) — אותו נימוק בדיוק
    CBA.sheets.postReadProgress("reportGymPayment", data || {}, onProgress || function () {}, cb);
  }
  function confirmGymPayment(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("confirmGymPayment", data || {}, cb);
  }
  function recordGymPayment(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("recordGymPayment", data || {}, cb);
  }
  function rejectGymPayment(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("rejectGymPayment", data || {}, cb);
  }
  function extendGymMembership(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("extendGymMembership", data || {}, cb);
  }
  function renewGymMembership(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("renewGymMembership", data || {}, cb);
  }
  /* עריכה ידנית של מנוי (2026-08-20, בקשת יועד: "צריך אפשרות לדחות את המנוי
     ולהרחיב את אפשרויות העריכה"). פעולה אחת שמקבלת רק את השדות שהשתנו:
     {id, planId?, price?, startDate?, validUntil?, status?, note?, reason?}.
     דחייה וביטול הם פשוט status="נדחה"/"בוטל" — השרת שולח את המייל המתאים
     לתושב רק כשהסטטוס באמת *משתנה* לאחד מהם. */
  function updateGymMembership(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("updateGymMembership", data || {}, cb);
  }
  /* מצב המודול → עדכון הגדרה בודדת (2026-09-16), למשל {key:"קוד כניסה", value:"0606"}.
     רשימת המפתחות המותרים נאכפת בשרת (GYM_EDITABLE_SETTING_KEYS), לא כאן. */
  function updateGymSetting(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("updateGymSetting", data || {}, cb);
  }
  /* שאלון בריאות → עריכה מלאה (2026-09-16). saveGymQuestion: upsert
     ({id?, label, text, flag, active, order}); deleteGymQuestion: מחיקה
     לגמרי ({id}). */
  function saveGymQuestion(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("saveGymQuestion", data || {}, cb);
  }
  function deleteGymQuestion(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("deleteGymQuestion", data || {}, cb);
  }
  /* מחיקת מנוי לצמיתות (2026-09-16) — שונה מ-updateGymMembership עם
     status="בוטל": זו מחיקה בלתי הפיכה של השורה כולה + ניקוי Firestore. */
  function deleteGymMembership(data, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.postRead("deleteGymMembership", data || {}, cb);
  }
  function approveClubReservation(id, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "approveClubReservation", id: id }, cb);
  }
  function rejectClubReservation(id, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "rejectClubReservation", id: id }, cb);
  }
   
  // --- רשימת התושבים (טאב "תושבים" המלא, כולל PII) — מוגן בהרשאת תושבים בשרת,
  // בדיוק כמו getClubList. בשימוש ע"י מסך ניהול הוצאות (2026-08-06) כדי לתת למנהל
  // לבחור "רוכש"/"מטפל" מתוך רשימה סגורה במקום טקסט חופשי — כך שהאיות תמיד אחיד
  // ותואם לטאב תושבים. נשמר בזיכרון-מודול (cache) כי הרשימה משתנה לעיתים רחוקות
  // ואין טעם לקרוא לשרת בכל פתיחת טופס. (תוקן 2026-08-06: הייתה כפולה בטעות.)
  var residentsCache = null; // null=טרם נטען, מערך=נטען
  function getResidents(cb) {
    if (residentsCache) { if (cb) cb({ ok: true, rows: residentsCache }); return; }
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "getResidents" }, function (res) {
      if (res && res.ok) residentsCache = res.rows || [];
      if (cb) cb(res);
    });
  }

  // רשימה שטוחה של "בחירות" עבור שדה רוכש/מטפל עם autocomplete: שם מלא (פרטי +
  // משפחה) + rid (המזהה הקבוע היציב מטאב תושבים — לא מספר בית). כל בן/בת זוג
  // מופיע כרשומה עצמאית, כדי ששניהם יהיו ניתנים לבחירה בנפרד. משמש בטופס ניהול
  // הוצאות (2026-08-06) — בחירה מהרשימה קובעת גם את t.familyId ישירות, כדי
  // שהקישור למשפחה ייווצר מיד ברגע ההזנה ולא יזדקק לשיוך רטרואקטיבי בעתיד.
  // ספריית שמות מצומצמת (2026-08-07): רק שמות/משפחה/מזהה — בלי אימייל וטלפון.
  // בשימוש ההשלמה האוטומטית, שנחוצה גם למי שמנהל תקציב ואין לו הרשאת "תושבים";
  // getResidents המלאה נשארת למסך התושבים בלבד.
  var directoryCache = null;
  function getResidentDirectory(cb) {
    if (directoryCache) { if (cb) cb({ ok: true, rows: directoryCache }); return; }
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "residentDirectory" }, function (res) {
      if (res && res.ok) directoryCache = res.rows || [];
      if (cb) cb(res);
    });
  }

  // ספריית קהילה ציבורית (2026-08-07): בית/משפחה/שם פרטי/טלפון/שמות ילדים —
  // פתוחה לכל תושב מחובר ופעיל (לא רק מנהל). בשימוש טאב "שכנים" באזור התושב
  // ומפת השיכון האינטראקטיבית. שונה מ-getResidentDirectory (שם+בית בלבד,
  // מנהלים בלבד, לבורר בטפסי ניהול) — לא לערבב בין השניים.
  var communityCache = null;
  function getCommunityDirectory(cb) {
    if (communityCache) { if (cb) cb({ ok: true, rows: communityCache }); return; }
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "communityDirectory" }, function (res) {
      if (res && res.ok) communityCache = res.rows || [];
      if (cb) cb(res);
    });
  }

  // עץ ועד השיכון (2026-08-09): טאב "עץ ועד השיכון" בגיליון — כל שורה היא אדם
  // אחד בתפקיד אחד; "מזהה תא" משותף בין כמה שורות מרכיב תא (תפקיד) אחד עם
  // כמה אנשים. פתוח לקריאה לכל תושב מחובר (כמו getCommunityDirectory) —
  // מסך "ועד השיכון" באזור התושב בונה מזה את עץ הוועד. עריכה (saveCommitteeTree
  // למטה) מוגבלת למנהל-על בשרת (ACTION_PERMS), בלי קשר למטמון הקריאה כאן.
  var committeeCache = null;
  function getCommitteeTree(cb) {
    if (committeeCache) { if (cb) cb({ ok: true, rows: committeeCache }); return; }
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "committeeTree" }, function (res) {
      if (res && res.ok) committeeCache = res.rows || [];
      if (cb) cb(res);
    });
  }
  // שמירה מוחקת ומחליפה את כל הטבלה בשרת (ר' saveCommitteeTree_ ב-Code.gs) —
  // כי העריכה במסך היא על העץ כמקשה אחת (הוספה/הסרה/שינוי הורה), לא שורה
  // בודדת. מנקה את המטמון המקומי כדי שהקריאה הבאה תביא את הגרסה הטרייה.
  function saveCommitteeTree(rows, cb) {
    CBA.sheets.postRead("saveCommitteeTree", { rows: rows }, function (res) {
      if (res && res.ok) committeeCache = null;
      if (cb) cb(res);
    });
  }

  // קטגוריות עץ הוועד (2026-08-10) — טאב נפרד "קטגוריות ועד השיכון" (שם+צבע),
  // אותו דפוס בדיוק כמו עץ הוועד עצמו: קריאה פתוחה לכולם, שמירה (הוספת/שינוי
  // קטגוריה) מוגבלת למנהל-על בשרת. CBA.committee (למטה) עוטף את זה בשכבת
  // מטמון/API נוחה יותר למסכים — המסכים לא קוראים לפונקציות האלה ישירות.
  var committeeCatsCache = null;
  function getCommitteeCategories(cb) {
    if (committeeCatsCache) { if (cb) cb({ ok: true, rows: committeeCatsCache }); return; }
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "committeeCategories" }, function (res) {
      if (res && res.ok) committeeCatsCache = res.rows || [];
      if (cb) cb(res);
    });
  }
  /* --- "שירותים לתושב" (2026-08-18) ---------------------------------------
     טאב "שירותים לתושב" (כרטיס לכל שורה) + טאב "סעיפי שירותים" (סעיף לכל
     שורה), מוחזרים יחד בקריאה אחת (ר' handleServices_ ב-Code.gs). קריאה
     פתוחה לכל תושב מחובר; שמירה מוגבלת למנהל-על בשרת (ACTION_PERMS), בלי
     קשר למטמון כאן. אותו דפוס בדיוק כמו getCommitteeTree/saveCommitteeTree. */
  var servicesCache = null;

  /* ==========================================================================
   *  "הדיווחים שלי" — קריאה ישירה מ-Firestore   (2026-09-16)
   * --------------------------------------------------------------------------
   *  🔴 **המסך היקר ביותר במערכת, וההפרש הכי אבסורדי:** נמדד בייצור
   *  **9,498ms עבור 367 בתים.** הזמן לא הלך על נתונים — הוא הלך על
   *  שלוש סריקות גיליון (דיווחים, משימות, יומן) ועל חישוב מחדש של
   *  שלב, הסבר סגירה וחלון משוב, **בכל קריאה של כל תושב**. עכשיו
   *  הכול מחושב פעם אחת בסנכרון, והדפדפן קורא מסמכים מוכנים.
   *
   *  🔴 **שאילתה לפי `familyId`, ולא קריאת האוסף.** לא רק כדי לקרוא
   *  פחות: כלל האבטחה **ידחה** שאילתה בלי המסנן הזה, לפני שנקרא
   *  מסמך אחד. אין מסלול של "לקרוא הכול ולסנן כאן", וזה מכוון.
   *
   *  ⚠️⚠️ **אוסף ריק הוא תשובה תקינה כאן — ולא נפילה לאחור.**
   *  בשירותים ובתוכנית הגינון "ריק" פירושו שמשהו השתבש (תמיד יש
   *  שירותים), ולכן שם הוא מפיל למסלול Apps Script. כאן ההפך:
   *  **תושב שמעולם לא דיווח הוא המקרה השכיח.** נפילה לאחור על ריק
   *  היתה מענישה בדיוק אותו — 9.5 שניות כדי לגלות שאין מה להציג.
   *  המחיר: בחלון ההפצה של דקה אחרי הזריעה תושב עם דיווחים עלול
   *  לראות רשימה ריקה. זה אירוע חד-פעמי בהעלאה, לא מצב מתמשך —
   *  ולכן הדגל נדלק רק אחרי אימות ידני שהמסמכים נקראים מהדפדפן.
   *
   *  ⚠️ **המיון בלקוח, ובלי `orderBy`.** מיון בשאילתה היה דורש
   *  אינדקס, וקונסולת Google Cloud חסומה. `handleMyGardenReports_`
   *  עושה `reverse()` על סדר השורות — כלומר החדש למעלה — ומזהה
   *  דיווח הוא מספר רץ, ולכן מיון יורד לפי מזהה משחזר אותו בדיוק.
   * ======================================================================== */
  var GARDEN_REPORTS_FROM_FIRESTORE = true;

  /* 🔴 **קיפול חלון המשוב מול השעון של הלקוח.** המסמך נושא גם
     `canFeedback` (נכון לרגע הסנכרון) וגם `feedbackUntil` (מועד
     מוחלט). מסמך בן שעה היה מציג "אפשר להגיב" אחרי שהחלון נסגר.
     ⚠️ השורה הזאת נכונה **גם במסלול Apps Script** — שם הערך כבר
        טרי והקיפול אינו משנה דבר. לכן היא כאן ולא בענף. */
  function gardenFoldFeedback(r) {
    if (r && r.canFeedback && r.feedbackUntil && Date.now() > r.feedbackUntil) {
      r.canFeedback = false;
    }
    return r;
  }

  /* מזהה דיווח הוא מספר רץ. נופל למחרוזת אם אינו מספרי — לא כדי
     להיות יסודי, אלא כי מזהה שנערך ידנית בגיליון לא אמור להפיל
     את כל המסך. */
  function gardenReportNewestFirst(a, b) {
    var na = parseInt(a && a.id, 10), nb = parseInt(b && b.id, 10);
    if (!isNaN(na) && !isNaN(nb) && na !== nb) return nb - na;
    return String((b && b.id) || "").localeCompare(String((a && a.id) || ""));
  }

  function myGardenReportsRead(cb) {
    var fid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
    fsFirstRead("gardenReports", GARDEN_REPORTS_FROM_FIRESTORE, function (done) {
      /* בלי מזהה משפחה אין שאילתה חוקית — והכלל היה דוחה אותה ממילא. */
      if (!fid) return done(new Error("no-family"));
      CBA.fb.queryCollection("gardenReports", [["familyId", fid]], function (err, rows) {
        if (err) return done(err);
        var out = (rows || []).map(gardenFoldFeedback).sort(gardenReportNewestFirst);
        done(null, { ok: true, rows: out });
      });
    }, function (done) {
      CBA.sheets.get({ action: "myGardenReports" }, function (res) {
        if (res && res.ok && res.rows) res.rows = res.rows.map(gardenFoldFeedback);
        done(res);
      });
    }, cb);
  }


  /* ==========================================================================
   *  🔴🔴  הגשת דיווח גינון — הדפדפן כותב ל-Firestore   (2026-09-16)
   * --------------------------------------------------------------------------
   *  **ההיפוך.** עד היום: הדפדפן שלח הכול ל-Apps Script, שכתב שורה
   *  בגיליון, ועבודה שעתית העתיקה ל-Firestore. מהיום: הדפדפן כותב
   *  את המסמך, ו-Apps Script נשאר לשני דברים שהוא היחיד שיודע
   *  לעשות — **להעלות ל-Drive** ו**לשלוח מייל**. שניהם שגר-ושכח.
   *
   *  🔴 **התמונות עולות אחת-אחת, וזו החלטה ולא מימוש עצלן:**
   *    1. **אחוז אמיתי בלי המלכודת.** אחוזי העלאה אמיתיים דורשים
   *       מאזין על `xhr.upload` — וזה בדיוק מה ששבר את הבקשה מול
   *       Apps Script (ר' sheets.js; יש בדיקה שמונעת את חזרתו).
   *       תמונה-תמונה נותנת "2 מתוך 3" — אחוז נכון, בלי המאזין.
   *    2. **כישלון חלקי הופך לנתון.** בקריאה אחת תמונה שנפלה
   *       נבלעה, והתושב קיבל "נשלח" כרגיל. עכשיו יודעים בדיוק מה
   *       נחת, המסמך נושא את הפער, והתושב מופנה להשלים.
   *
   *  ⚠️ **סדר הפעולות אינו שרירותי:** המסמך נכתב **לפני** התמונות.
   *     דיווח בלי תמונה הוא דיווח; תמונה בלי דיווח היא כלום. אם
   *     האפליקציה תיסגר באמצע, מה ששרד הוא הדבר הנכון.
   * ======================================================================== */
  var GARDEN_WRITE_TO_FIRESTORE = false;

  /** מעלה תמונה אחת דרך Apps Script. מחזיר מזהה Drive או שגיאה. */
  function gardenUploadPhoto(photo, cb) {
    CBA.sheets.postRead("gardenPhotoOne", { photo: photo }, function (res) {
      cb(res && res.ok ? null : ((res && res.error) || "העלאה נכשלה"), res && res.id);
    });
  }

  /* ============================================================================
   *  העלאה **במקביל**  (2026-09-17, החלטת יועד)
   * ----------------------------------------------------------------------------
   *  🔴 **מה השתנה ולמה.** עד היום התמונות עלו בזו אחר זו, וכל אחת היא
   *  קריאה שלמה ל-Apps Script. עם החציון המדוד של 3.2 שניות (וזנב עד
   *  14.7), דיווח עם שלוש תמונות היה **ארבע קריאות סדרתיות** — וזה,
   *  ולא הכתיבה לגיליון, היה רוב 70 השניות שנמדדו ב-16.9.
   *
   *  ⚠️ **מד ההתקדמות ירד בכוונה.** הוא היה הסיבה היחידה לסדרתיות
   *     ("2 מתוך 3" דורש סדר). יועד: "מד ההתקדמות לא מעניין... התמונות
   *     ממשיכות לעלות ואפשר להמשיך לגלוש, זה החלק החשוב."
   *
   *  ⚠️ **הסדר נשמר למרות המקביליות.** כל תוצאה נכתבת למקום שלה לפי
   *     אינדקס ורק בסוף מסוננת — אחרת סדר התמונות אצל התושב היה נקבע
   *     לפי מי סיים ראשון, כלומר לפי גודל הקובץ.
   *
   *  ⚠️ **תמונה שנפלה אינה מפילה את האחרות**, וזה נשאר כפי שהיה: אין
   *     כאן `Promise.all` שנכשל על הראשונה. כל קריאה מדווחת לעצמה.
   * ========================================================================== */
  function gardenUploadPhotos(photos, onStep, done) {
    var n = photos.length;
    if (!n) return done([], 0);
    var slot = new Array(n), left = n, failed = 0, settled = false;
    if (onStep) onStep(1, n);          /* פעם אחת, רק כדי לומר "התחיל" */
    function finish() {
      if (settled) return;
      settled = true;
      var ids = [];
      for (var k = 0; k < n; k++) if (slot[k]) ids.push(slot[k]);
      done(ids, failed);
    }
    photos.forEach(function (ph, idx) {
      gardenUploadPhoto(ph, function (err, id) {
        if (err || !id) failed++; else slot[idx] = id;
        if (--left <= 0) finish();
      });
    });
  }

  /* ==========================================================================
   *  🔴🔴  פעולות המנהל נכתבות מהדפדפן   (2026-09-18, גל 3)
   * --------------------------------------------------------------------------
   *  ההכרעה של יועד: "תעביר הכול מהכול ל-Firestore. אני לא רוצה
   *  יותר שימוש ב-Apps Script מלבד העלאת התמונות."
   *
   *  עד היום כל לחיצה הייתה קריאה ל-Apps Script שעבדה מול הגיליון
   *  ושלחה מייל באותה נשימה. נמדד בייצור (18.9): "בוצע" = **28.9 שניות**.
   *  מעכשיו הדפדפן כותב ישירות ל-Firestore, והמייל יוצא ברקע.
   *
   *  🔴 **השומרים אינם כאן.** מי רשאי לסגור, מה מותר על משימה
   *  סגורה, ומתי חובה לכתוב לתושב — כל אלה יושבים **בכללי
   *  האבטחה** (`gtUpdateOk`). מה שכתוב כאן הוא העתק לנוחות המשתמש
   *  בלבד, כדי שהוא יקבל משפט בעברית ולא "permission-denied".
   *  ⚠️ **שומר שיושב רק כאן הוא לא שומר** — אם תוסיף בדיקה
   *     חדשה כאן, הוסף אותה גם לכללים.
   *
   *  🔑 **המייל — הרחבה של `mailPending`, בלי מנגנון חדש.** הדפדפן מרים
   *  `notifyPending` על אותו מסמך ומפעיל קריאת שגר-ושכח שאיש אינו
   *  ממתין לה. הסריקה השעתית היא הרשת אם הקריאה נפלה.
   *  **הנמענים נשלפים בשרת** מטאב התושבים — הקו האדום נשמר.
   * ========================================================================== */

  var GARDEN_STAGES_C   = ["התקבל", "נבדק", "מתוכנן", "בטיפול", "הושלם"];
  var GARDEN_CLOSURES_C = ["בוצע", "הועבר לבינוי", "בוטל", "לא רלוונטי", "אוחד"];

  /** הדגל שמחליף את כל מסלולי הכתיבה של הגינון.
   *  ⚠️ כבוי = הכול חוזר ל-Apps Script בלי דיפלוי. אחרי 16.9, העברה
   *     של כל מסלולי הכתיבה בבת אחת בלי מתג כזה אינה אפשרות. */
  function gardenWritesOn() {
    return !!(CBA.fb && CBA.fb.flag &&
              CBA.fb.flag("gardenWritesFromBrowser", false) &&
              CBA.fb.flag("gardenTasksFromFirestore", GARDEN_TASKS_FROM_FIRESTORE) &&
              CBA.fb.uid && CBA.fb.uid());
  }

  /** מי עושה את הפעולה — אותה צורה שהשרת בנה ב-`who`. */
  function gardenWho() {
    var u = (window.CBA && CBA.user) || {};
    return ((u.firstName || "") + " " + (u.family || "")).trim() || (u.email || "");
  }

  function gardenIsMgr() {
    var u = (window.CBA && CBA.user) || {};
    return !u.isExternal;
  }

  /** שבוע + n — העתק של `gardenWeekShift_`. מפתח השבוע הוא YYYY-MM-DD. */
  function gardenWeekShift(week, n) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(week || "").trim());
    if (!m) return "";
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    d.setDate(d.getDate() + 7 * n);
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  /** קריאת שגר-ושכח שמוציאה את המייל תוך שניות במקום לחכות לשעה.
   *  ⚠️ **אין כאן קולבק ואין מה לחכות לו.** המסמך כבר נכתב,
   *     הדגל עליו דלוק, ואם הקריאה הזאת תיפול — הסריקה
   *     השעתית תשלח אותו. זה בדיוק הדפוס של `gardenNotifyReport`. */
  function gardenNotifyFire(taskId) {
    try {
      CBA.sheets.postRead("gardenNotifyTask", { id: String(taskId) }, function () {});
    } catch (e) { /* שגר ושכח */ }
  }

  /** שגיאה מ-Firestore — למשפט בעברית. `permission-denied` כאן פירושו
   *  שהשומר בכללי האבטחה עצר את הפעולה — לא תקלה. */
  function gardenFsErr(e, fallback) {
    var code = String((e && e.code) || "");
    if (code.indexOf("permission-denied") !== -1) {
      return "הפעולה לא אושרה — ייתכן שהמשימה כבר נסגרה או שאין לך הרשאה";
    }
    return fallback || "הפעולה נכשלה";
  }

  /** המנוע — עשר הפעולות בפונקציה אחת, כמו בשרת.
   *  קורא את המסמך, מחשב פאצ', כותב, רושם ביומן ומפעיל מייל. */
  function gardenFsTask(op, id, extra, cb) {
    extra = extra || {};
    var who = gardenWho();
    CBA.fb.readDoc("gardenTasks", String(id), function (e, cur) {
      if (e || !cur) return cb({ ok: false, error: "המשימה לא נמצאה" });

      var closure = String(cur.closure || "").trim();
      var isReport = String(cur.repId || "").trim() !== "";
      var note = String(extra.note || "").trim().substring(0, 600);
      var patch = {}, log = null, notify = "";

      /* ⚠️ העתק לנוחות בלבד — האכיפה האמיתית ב-`gtClosedOk`. */
      if (closure) {
        var reopenAct = (op === "undo" || op === "return");
        var reopenable = reopenAct && (gardenIsMgr() || closure === "בוצע");
        if (op !== "clearflag" && !reopenable) {
          return cb({ ok: false, error: "המשימה כבר נסגרה" });
        }
      }

      function close(reason, why) {
        patch.stage = "הושלם";
        patch.flag = "";
        patch.closure = reason;
        patch.approvedBy = who;
        /* 🔴 **חותמת זמן ולא מחרוזת** — בלעדיה `gtWithinDispute`
           בכללי האבטחה לא יכול לאכוף את חלון הערעור בכלל. */
        patch.approvedAt = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
        if (why) patch.note = why;
        log = { kind: "סגירה", note: reason + (why ? " — " + why : "") };
        if (reason === "בוצע") notify = "GARDEN_COMPLETED";
        else if (reason !== "אוחד") notify = "GARDEN_REPORT_DECLINED";
      }

      if (op === "done") {
        if (isReport && !note) {
          return cb({ ok: false,
                      error: "צריך לכתוב מה נעשה — המשפט הזה נשלח לתושב שדיווח." });
        }
        close("בוצע", note || String(cur.note || ""));

      } else if (op === "undo") {
        if (closure) {
          patch.closure = "";
          patch.stage = "בטיפול";
          patch.flag = "";
          patch.approvedBy = "";
          patch.approvedAt = "";
          notify = "GARDEN_REOPENED";
          log = { kind: "ביטול ביצוע", note: closure + (note ? " — " + note : "") };
        } else {
          patch.flag = "";
          log = { kind: "ביטול ביצוע", note: "" };
        }

      } else if (op === "note") {
        patch.note = note;
        log = { kind: "הערה", note: note };
        /* 🔴 ממצא 32 — הערת ביצוע על דיווח תושב היא אינטראקציה איתו,
           ולכן מייל. ⚠️ רק כשנכתב משהו: הערה ריקה אינה עדכון. */
        if (isReport && note) notify = "GARDEN_STATUS_NOTE";

      } else if (op === "defer") {
        if (!cur.week) return cb({ ok: false, error: "למשימה אין שבוע משובץ" });
        var nxt = gardenWeekShift(cur.week, 1);
        if (!nxt) return cb({ ok: false, error: "שבוע לא תקין" });
        patch.week = nxt;
        patch.flag = "נגררה";
        patch.drags = (Number(cur.drags) || 0) + 1;
        /* "שבוע מקורי" נכתב פעם אחת — זה מה שמראה מה נגרר שוב ושוב. */
        if (!cur.firstWeek) patch.firstWeek = cur.week;
        log = { kind: "גרירה", note: cur.week + " ← " + nxt + (note ? " — " + note : "") };
        /* 🔴 ממצא 32 — דחייה לשבוע אחר היא בדיוק מה שהתושב ממתין לו.
           עד היום היא נרשמה ביומן ולא נאמרה לו בשום מקום. */
        if (isReport) notify = "GARDEN_RESCHEDULED";

      } else if (op === "approve" || op === "close") {
        if (!gardenIsMgr()) {
          return cb({ ok: false, error: "אישור הוא בסמכות מנהל הגינון" });
        }
        var reason = op === "approve" ? "בוצע" : String(extra.closure || "").trim();
        if (GARDEN_CLOSURES_C.indexOf(reason) === -1) {
          return cb({ ok: false, error: "סיבת סגירה לא מוכרת" });
        }
        if (reason !== "בוצע" && isReport && !note) {
          return cb({ ok: false, error: "צריך לכתוב לתושב מה הסיבה" });
        }
        close(reason, note);

      } else if (op === "return") {
        if (!note) return cb({ ok: false, error: "צריך לכתוב מה חסר" });
        if (closure) {
          patch.closure = "";
          patch.approvedBy = "";
          patch.approvedAt = "";
          notify = "GARDEN_REOPENED";
        }
        patch.stage = "בטיפול";
        patch.flag = "הוחזר להשלמה";
        patch.note = note;
        log = { kind: "החזרה", note: note };

      } else if (op === "plan") {
        var wk = String(extra.week || "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
          return cb({ ok: false, error: "שבוע לא תקין" });
        }
        patch.week = wk;
        if (GARDEN_STAGES_C.indexOf(String(cur.stage || "")) <
            GARDEN_STAGES_C.indexOf("מתוכנן")) {
          patch.stage = "מתוכנן";
        }
        if (String(cur.flag || "") === "נגררה") patch.flag = "";
        log = { kind: "שיבוץ", note: (cur.week || "—") + " ← " + wk };
        /* ⚠️ שיבוץ **ראשון** הוא "הדיווח שלך נכנס לתוכנית העבודה".
           🔴 ממצא 32 — ושיבוץ מחדש לשבוע אחר הוא שינוי מועד ולא שתיקה.
              שיבוץ חוזר **לאותו שבוע** אינו שולח כלום: אין מה לבשר. */
        if (isReport) {
          if (!cur.week) notify = "GARDEN_PLANNED";
          else if (String(cur.week) !== wk) notify = "GARDEN_RESCHEDULED";
        }

      } else if (op === "clearflag") {
        patch.flag = "";
        log = { kind: "דגל", note: note || "" };

      } else if (op === "block") {
        if (!note) return cb({ ok: false, error: "צריך לכתוב מה חוסם" });
        patch.flag = "דורש בדיקה בשטח";
        patch.note = note;
        log = { kind: "חסימה", note: note };

      } else {
        return cb({ ok: false, error: "פעולה לא מוכרת" });
      }

      patch.updatedAt = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
      if (notify) {
        patch.notify = notify;
        patch.notifyPending = true;
        patch.notifyNote = note || String(patch.note || cur.note || "");
      }

      CBA.fb.updateDoc("gardenTasks", String(id), patch, function (e2) {
        if (e2) return cb({ ok: false, error: gardenFsErr(e2) });
        /* מכאן הפעולה **קיימת**. כל מה שנכשל אחריה אינו מבטל אותה. */
        if (log) gardenLogAppend(String(id), log.kind, log.note, { repId: cur.repId });
        if (notify) gardenNotifyFire(id);
        cb({ ok: true });
      });
    });
  }

  /** אישור מרוכז — לולאה על אותה פעולה בדיוק.
   *  ⚠️ **סדרתי ולא מקבילי**, כדי שכשל באמצע ישאיר מצב שניתן
   *     להסבר ("אושרו 3 מתוך 5") ולא קבוצה אקראית שעברה. */
  function gardenFsApproveBatch(ids, cb) {
    var list = (ids || []).map(function (x) { return String(x || "").trim(); })
                          .filter(Boolean);
    if (!list.length) return cb({ ok: false, error: "לא נבחרו משימות" });
    var done = 0, failed = [];
    function step(i) {
      if (i >= list.length) {
        return cb(failed.length
          ? { ok: false, error: "אושרו " + done + " מתוך " + list.length +
                                " — נכשלו: " + failed.join(", ") }
          : { ok: true, count: done });
      }
      gardenFsTask("approve", list[i], {}, function (r) {
        if (r && r.ok) done++; else failed.push(list[i]);
        step(i + 1);
      });
    }
    step(0);
  }

  /** פתיחת משימה יזומה ע"י הצוות. payload: {title, category, area, week}.
   *  ⚠️ אין כאן `repId` ואין מייל — אין תושב שמחכה לתשובה. */
  function gardenFsCreateTask(payload, cb) {
    payload = payload || {};
    var title = String(payload.title || "").trim().substring(0, 60);
    if (!title) return cb({ ok: false, error: "צריך כותרת" });
    var cat = String(payload.category || "").trim();
    if (!cat) return cb({ ok: false, error: "צריך קטגוריה" });
    var wk = String(payload.week || "").trim();
    if (wk && !/^\d{4}-\d{2}-\d{2}$/.test(wk)) {
      return cb({ ok: false, error: "שבוע לא תקין" });
    }

    /* 🔴🔴 **`asReport` — משימה שהמנהל פותח והיא מטופלת כתקלת תושב**
       (2026-09-22, בקשת יועד: "משימה שהיא כמו דיווח דייר").

       🔑 **שני שדות, שתי משמעויות נפרדות — וזו כל התשתית של הפיצ'ר:**
       - `kind: "דיווח תושב"` קובע איך המשימה **נראית ומטופלת**: היא
         עולה לראש הרשימה, נכנסת למסנן "תקלות דיירים", מקבלת פינת
         בורדו, כרטיס פירוט עם מפה ותמונות, ואת תפריט הפעולות של
         דיווח. אף אחד מאלה לא נכתב מחדש — הם כבר מותנים ב-`kind`.
       - `repId: ""` קובע ש**אין תושב שמחכה לתשובה**: בלי מייל, בלי
         "מה נעשה?" בסגירה, בלי קו זמן לתושב.

       זה אינו תפר שהומצא כאן. `gardenFsTask` כבר גוזר
       `isReport = String(cur.repId || "").trim() !== ""` (ר' למעלה),
       וכללי האבטחה כתבו את ההחלטה במפורש ב-18.9: "`repId` ולא `kind`
       — `repId` אינו משתמע לשתי פנים". כל עשרת המקומות במסך שנוגעים
       ב-`repId` כבר כתובים `t.repId ? … : …`.

       ⚠️ **אין שדה תיאור, ובכוונה.** בדקתי את כרטיס הפירוט של המנהל
          שורה-שורה: הוא מצייר כותרת, קטגוריה, אזור, תמונות, מפה,
          `note` ויומן — ואת `desc` של התושב הוא **אינו מציג בשום
          מקום**. שדה שאיש לא מצייר הוא שדה שאסור להוסיף, והוא גם
          היחיד שהיה דורש שינוי בכללי האבטחה. אפס שינוי בכללים.
       ⚠️ `gtShapeOk` דורש `hasOnly(gtFields())` — כל שדה כאן נמצא שם. */
    var asReport = !!payload.asReport;
    var hasPin = typeof payload.x === "number" && typeof payload.y === "number" &&
                 payload.x >= 0 && payload.x <= 1 && payload.y >= 0 && payload.y <= 1;
    var photos = payload.photos || [];

    CBA.fb.nextId("gardenTask", function (e1, taskId) {
      if (e1) return cb({ ok: false, error: "לא הצלחנו להקצות מספר למשימה" });
      var now = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
      var doc = {
        id: String(taskId),
        kind: asReport ? GARDEN_KIND_REPORT : "יזום",
        title: title,
        category: cat, area: String(payload.area || ""),
        x: hasPin ? Number(payload.x) : null,
        y: hasPin ? Number(payload.y) : null,
        stage: wk ? "מתוכנן" : "התקבל",
        week: wk, repId: "", photos: [],
        createdAt: now, updatedAt: now, order: 0,
        year: String((CBA.mock && CBA.mock.currentYear) || ""), schema: 1
      };
      CBA.fb.createDoc("gardenTasks", String(taskId), doc, function (e2) {
        if (e2) return cb({ ok: false, error: gardenFsErr(e2, "לא הצלחנו לפתוח את המשימה") });
        gardenLogAppend(String(taskId), "נפתח",
          asReport ? "תקלה שפתח הצוות" : "משימה יזומה");

        /* ⚠️ **התשובה חוזרת כאן, לפני התמונות** — אותה הכרעה בדיוק כמו
           בדיווח של תושב (17.9): מרגע שהמסמך נכתב המשימה קיימת, יש לה
           מספר, והמנהל חופשי להמשיך. ההעלאה ל-Drive ממשיכה ברקע.
           ⚠️ ואין כאן `beforeunload`: חסימת סגירת הדף הייתה מבטלת בדיוק
              את מה שהמבנה הזה בא לתת. */
        cb({ ok: true, id: taskId, photosPending: photos.length });

        if (!photos.length) return;
        gardenUploadPhotos(photos, null, function (ids, failed) {
          if (!ids.length) {
            return gardenPhotoWarn("אף תמונה לא עלתה למשימה", taskId, failed);
          }
          /* `photos` נמצא ב-gtTeamUpdateOk, ולמנהל יש הרשאת גינון —
             כלומר הכתיבה הזאת מותרת. כשל כאן אינו מבטל את המשימה. */
          CBA.fb.mergeDoc("gardenTasks", String(taskId), {
            photos: ids,
            updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
          }, function (eM) {
            if (eM) gardenPhotoWarn("מסמך המשימה לא עודכן בתמונות", taskId, eM);
          });
        });
      });
    });
  }

  /* ==========================================================================
   *  סעיפים 3–5 — תוכנית העבודה, איחוד ומשוב   (2026-09-21)
   * ========================================================================== */

  /** מזהה חדש להגדרה בתוכנית, בצורת `T<מספר>` כמו בשרת.
   *  ⚠️ **נבדק שהוא פנוי לפני כתיבה**, ואם לא — מנסים את הבא.
   *     `createDoc` משתמש ב-`set`, שדורס; בלי הבדיקה שני מנהלים
   *     שמוסיפים באותה דקה היו מוחקים זה את ההגדרה של זה, בשקט. */
  function gardenPlanNewId(rows, attempt) {
    var max = 0;
    (rows || []).forEach(function (r) {
      var m = /^T(\d+)$/.exec(String(r.id || "").trim());
      if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
    });
    return "T" + (max + 1 + (attempt || 0));
  }

  function gardenPlanFsSave(payload, cb) {
    payload = payload || {};
    var title = String(payload.title || "").trim();
    if (!title) return cb({ ok: false, error: "צריך שם למשימה" });
    var freq = String(payload.freq || "").trim();
    if (["שבועי", "דו-שבועי", "חודשי", "שנתי"].indexOf(freq) === -1) {
      return cb({ ok: false, error: "תדירות לא מוכרת" });
    }
    /* ⚠️ אותה בדיקה בדיוק כמו בשרת ובכללי האבטחה. */
    if (freq === "דו-שבועי" && !/^\d{4}-\d{2}-\d{2}$/.test(String(payload.firstWeek || ""))) {
      return cb({ ok: false, error: "למחזור דו-שבועי צריך לבחור את השבוע הראשון" });
    }

    function docOf(id, order) {
      return {
        id: String(id), title: title,
        category: String(payload.category || "").trim(),
        areas: payload.areas || [],
        freq: freq,
        firstWeek: String(payload.firstWeek || "").trim(),
        weekOfMonth: Math.min(Math.max(parseInt(payload.weekOfMonth, 10) || 1, 1), 4),
        months: String(payload.months || "").trim(),
        rotate: !!payload.rotate,
        clause: String(payload.clause || "").trim(),
        active: payload.active === false ? false : true,
        note: String(payload.note || "").trim().substring(0, 500),
        order: order || 0, schema: 1,
        updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
      };
    }

    var id = String(payload.id || "").trim();
    if (id) {
      /* עדכון — `mergeDoc` ולא `createDoc`, כדי ש-`order` הקיים לא יאופס. */
      var patch = docOf(id, undefined);
      delete patch.order;
      return CBA.fb.mergeDoc("gardenPlan", id, patch, function (e) {
        cb(e ? { ok: false, error: gardenFsErr(e, "השמירה נכשלה") } : { ok: true, id: id });
      });
    }

    CBA.fb.readCollection("gardenPlan", function (e1, rows) {
      if (e1) return cb({ ok: false, error: gardenFsErr(e1, "לא הצלחנו לקרוא את התוכנית") });
      var order = (rows || []).length + 1;
      function tryId(attempt) {
        if (attempt > 4) return cb({ ok: false, error: "לא הצלחנו להקצות מזהה" });
        var nid = gardenPlanNewId(rows, attempt);
        CBA.fb.readDoc("gardenPlan", nid, function (e2, existing) {
          if (!e2 && existing) return tryId(attempt + 1);
          CBA.fb.createDoc("gardenPlan", nid, docOf(nid, order), function (e3) {
            cb(e3 ? { ok: false, error: gardenFsErr(e3, "השמירה נכשלה") } : { ok: true, id: nid });
          });
        });
      }
      tryId(0);
    });
  }

  function gardenPlanFsActive(id, active, cb) {
    CBA.fb.mergeDoc("gardenPlan", String(id), {
      active: !!active,
      updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
    }, function (e) {
      cb(e ? { ok: false, error: gardenFsErr(e) } : { ok: true });
    });
  }

  function gardenPlanFsDelete(id, cb) {
    CBA.fb.deleteDoc("gardenPlan", String(id), function (e) {
      cb(e ? { ok: false, error: gardenFsErr(e, "המחיקה נכשלה") } : { ok: true });
    });
  }

  /** איחוד כפילות — משימה `id` נבלעת לתוך `into`.
   *  ⚠️ **אינו חסום לגנן** — זיהוי ששתי פניות הן אותה תקלה הוא
   *     שיפוט שטח. הכלל `gtClosureAuthOk` מתיר 'אוחד' במפורש. */
  function gardenFsMerge(childId, parentId, cb) {
    childId = String(childId || "").trim();
    parentId = String(parentId || "").trim();
    if (!childId || !parentId) return cb({ ok: false, error: "חסרה משימה לאיחוד" });
    if (childId === parentId) return cb({ ok: false, error: "אי אפשר לאחד משימה עם עצמה" });

    CBA.fb.readDoc("gardenTasks", childId, function (e1, child) {
      if (e1 || !child) return cb({ ok: false, error: "אחת המשימות לא נמצאה" });
      CBA.fb.readDoc("gardenTasks", parentId, function (e2, parent) {
        if (e2 || !parent) return cb({ ok: false, error: "אחת המשימות לא נמצאה" });
        if (String(child.closure || "")) return cb({ ok: false, error: "המשימה כבר סגורה" });
        if (String(parent.closure || "")) {
          return cb({ ok: false, error: "אי אפשר לאחד לתוך משימה סגורה" });
        }
        var parentRep = String(parent.repId || "").trim() || parentId;
        /* הדיווחים של הנבלעת מופנים אל הבולעת. */
        CBA.fb.queryCollection("gardenReports", [["taskId", childId]], function (e3, reps) {
          var list = (reps || []);
          var left = list.length, failed = 0;
          function closeChild() {
            var now = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
            CBA.fb.updateDoc("gardenTasks", childId, {
              stage: "הושלם", flag: "", closure: "אוחד",
              updatedAt: now, notify: "GARDEN_REPORT_MERGED", notifyPending: true,
              notifyNote: "אוחד עם פנייה מס' " + parentRep
            }, function (e4) {
              if (e4) return cb({ ok: false, error: gardenFsErr(e4, "האיחוד נכשל") });
              gardenLogAppend(childId, "איחוד", "אוחדה לתוך משימה #" + parentId);
              gardenLogAppend(parentId, "איחוד", "נבלעה משימה #" + childId +
                              " עם " + list.length + " דיווחים");
              gardenNotifyFire(childId);
              cb({ ok: true, moved: list.length, failed: failed });
            });
          }
          if (!left) return closeChild();
          list.forEach(function (rep) {
            CBA.fb.mergeDoc("gardenReports", String(rep.id), {
              taskId: parentId, mergedInto: parentRep,
              updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
            }, function (eR) {
              if (eR) { failed++; gardenPhotoWarn("דיווח לא הופנה באיחוד", rep.id, eR); }
              if (--left <= 0) closeChild();
            });
          });
        });
      });
    });
  }

  /** משוב התושב. הכלל `grFeedbackOk` כבר היה קיים — מה שחסר היה
   *  הדגל על המשימה (`gtReportFlagOk`) והמייל למנהלים.
   *  ⚠️ משוב שלילי **אינו פותח מחדש** — הוא מרים דגל
   *     וההחלטה נשארת אנושית. ר' §18.3 באפיון. */
  function gardenFsFeedback(id, positive, note, cb) {
    var now = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
    CBA.fb.readDoc("gardenReports", String(id), function (e0, rep) {
      if (e0 || !rep) return cb({ ok: false, error: "הדיווח לא נמצא" });
      if (String(rep.feedback || "").trim()) {
        return cb({ ok: false, error: "כבר נתת משוב על הדיווח הזה" });
      }
      CBA.fb.mergeDoc("gardenReports", String(id), {
        feedback: positive ? "חיובי" : "שלילי",
        feedbackNote: String(note || "").substring(0, 500),
        feedbackAt: now, updatedAt: now
      }, function (e1) {
        if (e1) return cb({ ok: false, error: gardenFsErr(e1, "המשוב לא נשמר") });
        var taskId = String(rep.taskId || "").trim();
        gardenLogAppend(taskId, "משוב", (positive ? "חיובי" : "שלילי") +
                        (note ? " — " + note : ""),
                        { familyId: (((window.CBA && CBA.user) || {}).familyId || "") });
        if (positive || !taskId) return cb({ ok: true });
        /* משוב שלילי — דגל ומייל למנהלים. שניהם שגר-ושכח:
           המשוב של התושב כבר נשמר, ואין סיבה להחזיר לו שגיאה. */
        CBA.fb.updateDoc("gardenTasks", taskId, {
          flag: "דורש בדיקה חוזרת", updatedAt: now
        }, function (e2) {
          if (e2) gardenPhotoWarn("הדגל לא הורם אחרי משוב שלילי", taskId, e2);
          try {
            CBA.sheets.postRead("gardenFeedbackNotify", { id: String(id) }, function () {});
          } catch (e3) { /* שגר ושכח */ }
          cb({ ok: true });
        });
      });
    });
  }

  function gardenReportFsWrite(payload, cb, onProgress) {
    var user = (window.CBA && CBA.user) || {};
    var fid = String(user.familyId || "").trim();
    var photos = payload.photos || [];

    /* 🔴🔴 **הבדיקה לפני ההקצאה** (18.9, ממצא ג').
       הכתיבה היא שני מסמכים: קודם המשימה, אחר כך הדיווח.
       כשהדיווח נדחה — המשימה **נשארת**, מצביעה ל-`repId`
       שאינו קיים, וצפה במסך הצוות כמשימה בלי מדווח ובלי מדווחן.
       נצפה חי ב-18.9: משימה #55 ← דיווח 11 שאינו קיים.
       התנאי הזה הוא העתק מדויק של `grPlaceOk` בכללי האבטחה:
       או נעיצה מנורמלת 0–1, או מיקום מילולי. בלי אחד מהם
       הכתיבה נדחית בוודאות — ועדיף לא לפתוח כלום מאשר להשאיר חצי. */
    var hasPin = typeof payload.x === "number" && typeof payload.y === "number" &&
                 payload.x >= 0 && payload.x <= 1 && payload.y >= 0 && payload.y <= 1;
    var hasPlace = String(payload.place || "").trim() !== "";
    if (!hasPin && !hasPlace) {
      return cb({ ok: false, error: "צריך לסמן מיקום על המפה או לכתוב אותו" });
    }
    if (!fid) {
      return cb({ ok: false, error: "חסר מזהה משפחה — רענן ונסה שוב" });
    }

    CBA.fb.nextId("gardenReport", function (e1, repId) {
      if (e1) return cb({ ok: false, error: "לא הצלחנו להקצות מספר לדיווח" });
      CBA.fb.nextId("gardenTask", function (e2, taskId) {
        if (e2) return cb({ ok: false, error: "לא הצלחנו להקצות מספר למשימה" });

        var now = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
        var year = (CBA.mock && CBA.mock.currentYear) || "";
        var task = {
          /* 🔴🔴 **הערך הקנוני, לא הישן** (21.9). עד היום נכתב כאן
             `"תקלה"` — הערך הישן — בעוד מסך הניהול משווה מול
             `GK_REPORT = "דיווח תושב"`. השרת ממפה ביניהם
             (`GARDEN_KIND_LEGACY`) — **הלקוח לא.**
             התוצאה: כל דיווח של תושב מאז שהדגל נדלק נראה
             למנהל כמשימה רגילה של השבוע, בלי הטיפול של דיווח
             תושב. נצפה ע"י יועד על תקלות 21 ו-22. */
          id: String(taskId), kind: GARDEN_KIND_REPORT, title: payload.title,
          category: payload.category, area: payload.area || "",
          x: (payload.x === null || payload.x === undefined) ? null : Number(payload.x),
          y: (payload.y === null || payload.y === undefined) ? null : Number(payload.y),
          stage: "התקבל", repId: String(repId), photos: [],
          createdAt: now, updatedAt: now, order: 0,
          year: String(year), schema: 1
        };
        var report = {
          id: String(repId), familyId: fid, date: new Date().toISOString(),
          category: payload.category, area: payload.area || "",
          title: payload.title, desc: payload.desc || "",
          place: payload.place || "", x: task.x, y: task.y,
          photos: [], photosExpected: photos.length,
          /* 🔴🔴 **הדגל נכתב מראש ויורד בסוף — לא נכתב בסוף.**
             עד היום `photosIncomplete` נכתב יחד עם התוצאה, כלומר הוא
             סימן "העלאה שהסתיימה עם כשלים". דפדפן שנסגר באמצע לא הגיע
             לכתיבה הזאת בכלל, המסמך נשאר עם `photos: []` ובלי דגל,
             והסריקה השעתית — ששואלת `photosIncomplete == true` —
             **לא ראתה אותו לעולם**. מאז שההעלאה עברה לרקע והתושב ממשיך
             לגלוש, זה הפסיק להיות מקרה קצה.
             זה בדיוק הדפוס של `mailPending`: מסמן ממתין, ומי שמסיים מכבה. */
          photosIncomplete: photos.length > 0,
          taskId: String(taskId), clientRef: String(payload.clientRef || ""),
          /* 🔴 הדגל שגורם למייל לצאת — גם אם הקריאה מיד אחריו תיפול,
             הסריקה השעתית תתפוס אותו. ר' gardenMailPending_. */
          mailPending: true,
          year: String(year), schema: 1, updatedAt: now
        };

        /* המשימה קודם: מסמך הדיווח מצביע עליה, ותושב שיראה דיווח
           שמצביע למשימה שאינה קיימת יראה שלב ריק. */
        CBA.fb.createDoc("gardenTasks", String(taskId), task, function (e3) {
          if (e3) return cb({ ok: false, error: "לא הצלחנו לפתוח את המשימה" });
          CBA.fb.createDoc("gardenReports", String(repId), report, function (e4) {
            if (e4) {
              /* 🔴 **גלגול אחורה** (18.9, ממצא ג'). המשימה כבר נכתבה,
                 ובלי המחיקה הזאת היא נשארת לנצח כמשימה יתומה.
                 כלל האבטחה `gtOrphanCleanupOk` מתיר את המחיקה **רק**
                 כל עוד אין מסמך דיווח שמצביע עליה — כלומר בדיוק
                 במצב הזה, ולעולם לא על משימה חיה.
                 ⚠️ שגר ושכח: כשל במחיקה אינו משנה את מה שהתושב רואה. */
              CBA.fb.deleteDoc("gardenTasks", String(taskId), function (eD) {
                if (eD) gardenPhotoWarn("משימה יתומה לא נמחקה", taskId, eD);
              });
              return cb({ ok: false, error: "לא הצלחנו לשמור את הדיווח" });
            }

            /* מכאן הדיווח **קיים**. כל מה שנכשל אחרי זה אינו מבטל אותו. */
            gardenLogAppend(String(taskId), "נפתח", "דיווח תושב #" + repId, { familyId: fid });
            CBA.sheets.postRead("gardenNotifyReport", { id: String(repId) }, function () {});

            /* 🔴🔴 **ההגשה נסגרת כאן, לפני התמונות** (17.9, החלטת יועד).
               מרגע שהמסמך נכתב הדיווח קיים, יש לו מספר, והתושב חופשי
               ללכת. התמונות ממשיכות לעלות ברקע — ואם הוא ייסגר באמצע,
               `photosIncomplete` שכבר דלוק הוא מה שיביא את הסריקה
               השעתית להתריע ואת הבאנר ב"הדיווחים שלי" להופיע.
               ⚠️ **אין כאן `beforeunload`.** זו הנקודה: חסימה של סגירת
                  הדף הייתה מבטלת בדיוק את מה שהשינוי הזה בא לתת. */
            cb({ ok: true, id: repId, taskId: taskId,
                 photos: [], photosFailed: 0,
                 photosExpected: photos.length, photosPending: photos.length });

            if (!photos.length) return;

            gardenUploadPhotos(photos, null, function (ids, failed) {
              var patch = {
                photos: ids,
                /* ⚠️ מכבים **רק** כשהכול נחת. `failed > 0` משאיר דלוק. */
                photosIncomplete: ids.length < photos.length,
                updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
              };
              CBA.fb.mergeDoc("gardenReports", String(repId), patch, function (eM) {
                /* ⚠️ אם הכתיבה הזאת נכשלה — הדגל נשאר דלוק מהיצירה, וזה
                   בדיוק מה שצריך לקרות. נרשם, כי כשל שקט כאן פירושו
                   תמונות ב-Drive שאף אחד לא יודע עליהן. */
                if (eM) gardenPhotoWarn("מסמך הדיווח לא עודכן בתמונות", repId, eM);
                if (!ids.length) return;
                /* ⚠️ כלל `gtTeamUpdateOk` דורש הרשאת גינון, ולכן אצל תושב
                   רגיל הכתיבה הזאת **נדחית**. עד היום היא נבלעה ב-callback
                   ריק. היום היא נרשמת, ומסמך המשימה מקבל את התמונות
                   מהסנכרון. ⏭ נסגר סופית בשלב המראה. */
                CBA.fb.mergeDoc("gardenTasks", String(taskId), { photos: ids },
                  function (eT) {
                    if (eT) gardenPhotoWarn("מסמך המשימה לא עודכן בתמונות", taskId, eT);
                  });
              });
            });
          });
        });
      });
    });
  }

  /** כשל בכתיבת התמונות — רועש ולא שקט. אותו `CBA.diag` שכבר נוסע
   *  עם כל דיווח תקלה של תושב; בלי מנגנון שני. */
  function gardenPhotoWarn(what, id, err) {
    try {
      var line = "תמונות גינון · " + what + " · #" + String(id) + " — " + String(err);
      if (window.CBA && CBA.diag && CBA.diag.error) CBA.diag.error(line, "dataService.js");
      if (window.console && console.warn) console.warn("[CBA] " + line);
    } catch (e) {}
  }

  /* 🔴 **אילו סוגי אירוע נושאים `familyId`** (2026-09-22, ממצא 32).
     זה אינו עניין של תצוגה אלא של גבול: שורה בלי `familyId` אינה
     נקראת ע"י תושב לעולם, ולכן "חסימה", "דגל" ו"איחוד" — פעולות
     פנימיות של הצוות — פשוט אינן מגיעות אליו.
     ⚠️ **הרשימה הזאת חייבת להיות זהה ל-`glResidentKinds()` בכללי
        האבטחה.** שם היא נאכפת; כאן היא נמנעת מלכתחילה.
        `tools/test-finding32-timeline.js` משווה ביניהן. */
  var GARDEN_LOG_RESIDENT_KINDS = {
    "נפתח": 1, "שיבוץ": 1, "גרירה": 1, "הערה": 1, "החזרה": 1,
    "ביטול ביצוע": 1, "ביצוע": 1, "סגירה": 1, "משוב": 1
  };

  /** שורת יומן. שגר ושכח — יומן שנכשל אינו מבטל פעולה שהצליחה.
   *
   *  🔴 **`familyId` על השורה — ממצא 32** (2026-09-22). כלל אבטחה
   *  פועל על מסמך שלם ואינו יודע להצטלב לאוסף אחר, ולכן הדרך היחידה
   *  לפתוח לתושב את ההיסטוריה של הדיווח שלו היא ששורת היומן תישא
   *  בעצמה את מזהה המשפחה. שורה בלי `familyId` (משימת שגרה, איחוד)
   *  לעולם אינה מגיעה לתושב — וזה הגבול, לא תופעת לוואי.
   *
   *  `opts`: `{familyId}` כשהכותב הוא התושב עצמו, או `{repId}`
   *  כשהכותב הוא הצוות וצריך לשלוף את המשפחה מהדיווח. */
  function gardenLogAppend(taskId, kind, note, opts) {
    try {
      var uid = (CBA.fb && CBA.fb.uid && CBA.fb.uid()) || "";
      if (!uid) return;
      opts = opts || {};
      var fid = String(opts.familyId == null ? "" : opts.familyId).trim();
      var repId = String(opts.repId == null ? "" : opts.repId).trim();

      function write(familyId) {
        var id = String(taskId) + "_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7);
        var doc = {
          taskId: String(taskId), kind: String(kind || ""),
          actorUid: uid, note: String(note || ""),
          at: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date(), schema: 1
        };
        /* ⚠️ שדה ריק אינו נכתב בכלל. `myFamilyId()` מחזירה `''` למי
           שאינו חבר, ושורה עם `familyId: ""` היתה נקראת ע"י הכלל
           כ-`'' == ''` — כלומר נפתחת לכולם. אותה מלכודת בדיוק
           כמו ב-`canSeeFamilyTx`.
           🔴 **וסוג פנימי אינו נחתם כלל** — ר' GARDEN_LOG_RESIDENT_KINDS. */
        if (familyId && GARDEN_LOG_RESIDENT_KINDS[String(kind || "")]) {
          doc.familyId = String(familyId);
        }
        CBA.fb.createDoc("gardenLog", id, doc, function () {});
      }

      if (fid) return write(fid);
      /* 🔑 **הקריאה הזאת אינה מאטה שום פעולה.** `gardenLogAppend` היא
         שגר-ושכח מלכתחילה: המסמך כבר נכתב, הפעולה כבר קיימת, ואיש
         אינו ממתין ליומן. לכן שליפת המשפחה מהדיווח יושבת דווקא כאן
         ולא במסלול הפעולה עצמה. */
      if (repId) {
        return CBA.fb.readDoc("gardenReports", repId, function (e, rep) {
          write((rep && rep.familyId) || "");
        });
      }
      write("");
    } catch (e) {}
  }

  /* ==========================================================================
   *  🔴 ממצא 32 — קו הזמן של התושב   (2026-09-22)
   * --------------------------------------------------------------------------
   *  **שאילתה לפי `familyId` ולא לפי `taskId`, ובכוונה.** הכלל
   *  שפותח את היומן לתושב מותנה במזהה המשפחה שעל השורה — שאילתה
   *  בלי המסנן הזה נדחית לפני שנקרא מסמך אחד. היתרון הנלווה: קריאה
   *  אחת לכל המסך במקום קריאה לכל דיווח.
   *
   *  ⚠️ **אין נפילה לאחור ל-Apps Script**, וזו החלטה. אין שם פעולה
   *     שמחזירה יומן לתושב — `gardenTaskLog` דורשת הרשאת גינון —
   *     ולכן כשל מחזיר `ok:false`, והמסך אומר "לא הצלחנו לטעון את
   *     העדכונים" במקום כרטיס שנראה כאילו לא קרה בו כלום.
   * ======================================================================== */
  function gardenMyLogRead(cb) {
    var fid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
    /* בלי מזהה משפחה אין שאילתה חוקית — והכלל היה דוחה אותה ממילא.
       ⚠️ `ok:true` ולא שגיאה: "אין לי משפחה" אינו כשל טעינה. */
    if (!fid) return cb({ ok: true, rows: [] });
    if (!CBA.fb || !CBA.fb.queryCollection) return cb({ ok: false, error: "no-sdk" });
    try {
      /* 🔴 **`userReady` ולא קריאה מיידית** — אותה מלכודת של ממצא 02:
         ההתחברות ל-Firebase נדחית בכוונה חמש שניות אחרי המטען, ולכן
         בדפדפן חדש שאילתה מיידית נדחית ב-`permission-denied` והתושב
         היה רואה "לא הצלחנו לטעון" בדיוק בכניסה הראשונה שלו. */
      var ready = (CBA.fb.userReady || CBA.fb.authReady);
      ready.call(CBA.fb, function (user) {
        if (!user) return cb({ ok: false, error: "no-user" });
        CBA.fb.ensureDb(function (dbErr) {
          if (dbErr) return cb({ ok: false, error: "db" });
          CBA.fb.queryCollection("gardenLog", [["familyId", fid]], function (err, rows) {
            if (err) return cb({ ok: false, error: "firestore" });
            var out = (rows || []).slice().sort(function (a, b) {
              return gardenDateOf(a.at) - gardenDateOf(b.at);
            });
            cb({ ok: true, rows: out });
          });
        });
      });
    } catch (e) { cb({ ok: false, error: "no-log" }); }
  }

  /** 🔴 השלמת תמונות לדיווח שכבר הוגש. ר' מסך resGardenPhotos. */
  function gardenCompletePhotos(repId, taskId, photos, cb, onProgress) {
    /* ⚠️ כאן התושב **כן** ממתין מול המסך — זו פעולה שהוא יזם כדי לסגור
       פינה — ולכן הקריאה חוזרת רק בסוף. מה שירד הוא האחוזים בלבד. */
    if (onProgress) onProgress(1, 1, photos.length);
    gardenUploadPhotos(photos, null, function (ids, failed) {
      CBA.fb.readDoc("gardenReports", String(repId), function (e, doc) {
        var have = (doc && doc.photos) || [];
        var all = have.concat(ids);
        /* ⚠️ `failed > 0` ולא `all.length < photosExpected`: השלמה חלקית
           שהצליחה במלואה מכבה את הדגל גם אם התושב בחר פחות קבצים ממה
           שחסר — הוא זה שמחליט מתי סיים. */
        var patch = { photos: all, photosIncomplete: failed > 0,
                      updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date() };
        CBA.fb.mergeDoc("gardenReports", String(repId), patch, function (e2) {
          if (taskId && all.length) {
            CBA.fb.mergeDoc("gardenTasks", String(taskId), { photos: all }, function () {});
          }
          if (onProgress) onProgress(100, photos.length, photos.length);
          cb({ ok: !e2, added: ids.length, failed: failed });
        });
      });
    });
  }


  /* ==========================================================================
   *  🔴🔴  מסך המשימות — קריאה ישירה מ-Firestore   (2026-09-16, ההיפוך)
   * --------------------------------------------------------------------------
   *  נמדד בייצור: **8,053ms**. אותו סיפור כמו בדיווחים — הזמן לא
   *  הלך על נתונים אלא על סריקות גיליון ועל חישוב שנעשה מחדש בכל
   *  קריאה של כל משתמש.
   *
   *  🔴 **`dupOf` מחושב כאן ולא בשרת, וזו החלטה ולא קיצור דרך.**
   *  מועמד לאיחוד נגזר מהשוואה של משימה מול **כל** שאר המשימות
   *  הפתוחות. בשרת זה היה חישוב שרץ מחדש בכל בקשה; כאן כל
   *  המשימות ממילא כבר בזיכרון הדפדפן, ולכן זה חינם. חישוב
   *  שהקלט שלו כבר מקומי אין סיבה לשלוח עליו בקשה.
   *  ⚠️ **הכללים הועתקו אחד-לאחד מ-`gardenDupCandidate_`** ולא
   *     נכתבו מחדש: רק דיווחי תושבים, אותה קטגוריה ואותו אזור,
   *     בתוך 14 יום, ורק משימה ותיקה ממני. יש בדיקה שמצליבה.
   *
   *  ⚠️ **`isManager` נגזר מהמשתמש ולא מהשרת.** קודם השרת החזיר
   *     אותו כשדה; כאן אין בקשה לשרת. זה בטוח **כי הוא אינו
   *     הרשאה** — ההרשאה נאכפת בכללי האבטחה ובשרת, וזה רק מה
   *     המסך מציג. ר' ההערה בראש gardenTasks.js.
   * ======================================================================== */
  var GARDEN_TASKS_FROM_FIRESTORE = true;
  var GARDEN_DUP_DAYS = 14;
  var GARDEN_KIND_REPORT = "דיווח תושב";
  /* העתק של `GARDEN_KIND_LEGACY` מ-Code.gs — ר' ההסבר ב-`gardenTasksRead`. */
  var GARDEN_KIND_LEGACY = { "תקלה": GARDEN_KIND_REPORT };

  function gardenDateOf(v) {
    if (!v) return 0;
    var d = (v instanceof Date) ? v : new Date(v && v.toDate ? v.toDate() : v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  /* עותק מדויק של gardenDupCandidate_ בשרת. ר' ההערה מעל. */
  function gardenDupCandidate(o, all) {
    if (o.kind !== GARDEN_KIND_REPORT) return null;
    var mine = gardenDateOf(o.createdAt);
    if (!mine) return null;
    var best = null;
    for (var i = 0; i < all.length; i++) {
      var c = all[i];
      if (String(c.id) === String(o.id)) continue;
      if (c.closure) continue;
      if (c.kind !== GARDEN_KIND_REPORT) continue;
      if (c.category !== o.category || c.area !== o.area) continue;
      var his = gardenDateOf(c.createdAt);
      if (!his) continue;
      if (Math.abs(mine - his) > GARDEN_DUP_DAYS * 86400000) continue;
      if (his > mine) continue;
      if (!best || his < gardenDateOf(best.createdAt)) best = c;
    }
    return best ? { id: best.id, title: best.title, week: best.week,
                    kind: best.kind, repId: best.repId } : null;
  }

  function gardenTasksRead(opts, cb) {
    var scope = (opts && opts.scope) || "week";
    var week = (opts && opts.week) || "";
    fsFirstRead("gardenTasks", GARDEN_TASKS_FROM_FIRESTORE, function (done) {
      CBA.fb.readCollection("gardenTasks", function (err, rows) {
        if (err) return done(err);
        /* ⚠️ אוסף ריק **כן** מפיל לאחור כאן — בניגוד לדיווחים.
           לשיכון תמיד יש משימות גינון; ריק פירושו שמשהו השתבש
           (הפצה, זריעה), ולא "אין עבודה השבוע". ההבדל מהדיווחים
           מכוון: שם ריק הוא המקרה השכיח. */
        if (!rows || !rows.length) return done(new Error("empty"));
        /* 🔴🔴 **מפת התאימות של `kind`** (21.9) — העתק של
           `GARDEN_KIND_LEGACY` מהשרת. מסמכים שנכתבו בדפדפן לפני
           התיקון מחזיקים `"תקלה"`, והמסך משווה מול `"דיווח תושב"`.
           ⚠️ **ממפים בקריאה ולא מהגרים את הנתונים** — כך תקלות
              21 ו-22 (וכל שאר הדיווחים מאז 18.9) חוזרות להיראות
              כדיווחי תושב מיד, בלי לגעת באף מסמך. */
        rows.forEach(function (t) {
          if (GARDEN_KIND_LEGACY[t.kind]) t.kind = GARDEN_KIND_LEGACY[t.kind];
        });
        var all = rows.filter(function (t) { return !t.closure; });
        var out = rows.filter(function (t) {
          if (scope === "all") return true;
          if (scope === "unplanned") return !t.closure && !t.week;
          if (scope === "pending") return t.flag === "ממתין לאישור";
          return t.week === week;
        });
        if (scope === "unplanned" || scope === "all") {
          out.forEach(function (t) {
            if (t.closure || t.week) return;
            t.dupOf = gardenDupCandidate(t, all);
          });
        }
        out.sort(function (a, b) {
          return (parseInt(b.id, 10) || 0) - (parseInt(a.id, 10) || 0);
        });
        CBA.fb.readDoc("gardenMeta", "lists", function (e2, lists) {
          var perm = (window.CBA && CBA.user) || {};
          done(null, {
            ok: true, rows: out, week: week, scope: scope,
            isManager: !perm.isExternal,
            areas: (lists && lists.areas) || [],
            categories: (lists && lists.categories) || []
          });
        });
      });
    }, function (done) {
      var q = { action: "gardenTasks" };
      if (week) q.week = week;
      if (scope) q.scope = scope;
      CBA.sheets.get(q, done);
    }, cb);
  }

  /* יומן משימה — אוסף הוספה-בלבד. שאילתת שוויון על שדה אחד,
     בלי אינדקס מורכב; המיון בלקוח. */
  function gardenTaskLogRead(id, cb) {
    /* 🔴🔴 **`false` ולא הדגל, ובכוונה** (16.9). אוסף `gardenLog`
       ב-Firestore **ריק** — אף אחד בשרת אינו כותב אליו. `gardenLog_`
       כותבת שורה בטאב בלבד, ואין `gardenLogSyncAll_`. הכותב היחיד
       הוא `gardenLogAppend` כאן בלקוח, והוא מאחורי `GARDEN_WRITE_TO_FIRESTORE`
       שכבוי. ורשימה ריקה אינה שגיאה — ולכן **אין נפילה לאחור**
       והמסך הציג היסטוריה ריקה בלי שום סימן.
       ⚠️ **וגם לא היה אפשר לכבות את זה:** `fsFirstRead` בונה את שם
          הדגל מהמפתח (`gardenLogFromFirestore`), והוא אינו ב-`FLAG_KEYS`.
          `flag()` על מפתח לא מוכר מחזיר את ברירת המחדל — true.
       ⏭ התיקון האמיתי הוא לסנכרן את היומן ולהוסיף דגל אמיתי.
          עד אז היומן נקרא מ-Apps Script, וזו קריאה אחת שנשלחת
          רק כשמישהו פותח היסטוריה — נדיר. */
    fsFirstRead("gardenLog", false, function (done) {
      CBA.fb.queryCollection("gardenLog", [["taskId", String(id)]], function (err, rows) {
        if (err) return done(err);
        (rows || []).sort(function (a, b) { return gardenDateOf(a.at) - gardenDateOf(b.at); });
        done(null, { ok: true, rows: rows || [] });
      });
    }, function (done) {
      CBA.sheets.get({ action: "gardenTaskLog", id: id }, done);
    }, cb);
  }

  function getServices(cb) {
    if (servicesCache) { if (cb) cb({ ok: true, services: servicesCache.services, sections: servicesCache.sections }); return; }
    servicesRead(cb);
  }

  /* ==========================================================================
   *  "שירותים לתושב" — קריאה ישירה מ-Firestore   (צעד 04ג, 2026-09-15)
   * --------------------------------------------------------------------------
   *  🔴 **מתג הביטול:** `SERVICES_FROM_FIRESTORE = false` מחזיר את המסך
   *  למסלול Apps Script במלואו, בלי שום שינוי אחר.
   *
   *  🔑 **המסמך ב-Firestore מקנן את הסעיפים בתוך השירות; הלקוח משטח בחזרה**
   *  ל-{services, sections}, כי זו הצורה שכל המסך מצפה לה. מסמך אחד לשירות
   *  חוסך קריאה שנייה ומסמכים מיותמים — אבל אסור שזה ידלוף לצורת התשובה.
   *
   *  ⚠️ **`עודכן ע"י` אינו קיים ב-Firestore בכוונה** (אימייל של מנהל).
   *  זה בטוח: `saveServices_` דורסת את העמודה מהמושב בכל שמירה, ולכן הערך
   *  שהמסך שולח בחזרה נזרק ממילא.
   * ======================================================================== */
  var SERVICES_FROM_FIRESTORE = true;
  var SVC_DOC_ONLY = { sections: 1, order: 1, schema: 1, updatedAt: 1 };

  function servicesFromDocs(docs) {
    var services = [], sections = [];
    (docs || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    }).forEach(function (d) {
      var row = {};
      Object.keys(d).forEach(function (k) { if (!SVC_DOC_ONLY[k]) row[k] = d[k]; });
      services.push(row);
      (d.sections || []).forEach(function (s) { sections.push(s); });
    });
    return { services: services, sections: sections };
  }

  function servicesRead(cb) {
    fsFirstRead("services", SERVICES_FROM_FIRESTORE, function (done) {
      CBA.fb.readCollection("services", function (err, rows) {
        if (err) return done(err);
        /* \ud83d\udd34 אותו שיקול כמו בתוכנית הגינון. התרחיש קרה בייצור תוך
           שעה מהכתיבה: הפצת כללים ומסמכים ב-Firestore אינה מיידית. */
        if (!rows || !rows.length) return done(new Error("empty"));
        var out = servicesFromDocs(rows);
        servicesCache = out;
        done(null, { ok: true, services: out.services, sections: out.sections });
      });
    }, function (done) {
      if (!pushConnected()) { done({ ok: false, error: "לא מחובר לגיליון" }); return; }
      CBA.sheets.get({ action: "services" }, function (res) {
        if (res && res.ok) servicesCache = { services: res.services || [], sections: res.sections || [] };
        done(res);
      });
    }, cb);
  }

  /* שמירה מחליפה את שני הטאבים במלואם בשרת (ר' saveServices_) — העריכה במסך
     היא על הכרטיס כמקשה אחת (הוספת/הסרת סעיף, שינוי סדר), לא שורה בודדת. */
  function saveServices(services, sections, cb) {
    CBA.sheets.postRead("saveServices", { services: services, sections: sections }, function (res) {
      if (res && res.ok) servicesCache = null;
      if (cb) cb(res);
    });
  }

  function saveCommitteeCategories(rows, cb) {
    CBA.sheets.postRead("saveCommitteeCategories", { rows: rows }, function (res) {
      if (res && res.ok) committeeCatsCache = null;
      if (cb) cb(res);
    });
  }

  /* ========================================================================
   *  שם משפחה מתוך מזהה   (צעד 08ב-3, 2026-09-15)
   * ------------------------------------------------------------------------
   *  🔴 **למה זה קיים:** שם הרוכש הוא נתון אישי, ולכן
   *  **אינו נכתב ל-Firestore** (הכרעה קבועה — ר׳ שיטת העבודה).
   *  מסמך התנועות נושא מזהה משפחה בלבד, והשם מורכב כאן.
   *
   *  ⚠️ **המזהה מזהה משק בית, לא אדם.** שני בני זוג חולקים שורה
   *  ומזהה (נמדד: 9 מתוך 18 המשפחות עם תנועות), ולכן השם
   *  המורכב אינו מבחין ביניהם. זו התנהגות מוסכמת.
   *
   *  ⚠️ **הספרייה מגיעה מ-Apps Script ותישאר שם** — יש בה שמות.
   *  לכן הקריאה הראשונה עולה סבב של Apps Script; אחריה הכול
   *  מהמטמון. ב-`loadYear` היא רצה **במקביל** לקריאות Firestore
   *  ולא אחריהן — אחרת היינו משלמים את שתי ההמתנות זו אחרי זו.
   * ====================================================================== */
  var familyNameMap = null;   // {מזהה: שם לתצוגה}

  function buildFamilyNameMap(rows) {
    var map = {};
    (rows || []).forEach(function (r) {
      var rid = r["מזהה קבוע"];
      if (rid == null || rid === "") return;
      var fam = String(r["משפחה"] || "").trim();
      var a = String(r["שם פרטי 1"] || "").trim();
      var b = String(r["שם פרטי 2"] || "").trim();
      var label = (a && b) ? (a + " ו" + b + (fam ? " " + fam : ""))
                : (a || b)  ? ((a || b) + (fam ? " " + fam : ""))
                : fam       ? ("משפחת " + fam) : "";
      if (label) map[String(rid).trim()] = label;
    });
    return map;
  }

  /* סינכרונית. מחזירה "" כל עוד הספרייה לא נטענה — הקורא
     אחראי לקרוא קודם ל-`ensureFamilyNames`. */
  function familyDisplayName(familyId) {
    var k = String(familyId == null ? "" : familyId).trim();
    if (!k || !familyNameMap) return "";
    return familyNameMap[k] || "";
  }

  function ensureFamilyNames(cb) {
    if (familyNameMap) { if (cb) cb(true); return; }
    getResidentDirectory(function (res) {
      if (res && res.ok) familyNameMap = buildFamilyNameMap(res.rows);
      if (cb) cb(!!(res && res.ok));
    });
  }

  function residentPickerOptions(cb) {
    getResidentDirectory(function (res) {
      var rows = (res && res.ok && res.rows) || [];
      var out = [];
      rows.forEach(function (r) {
        var fam = String(r["משפחה"] || "").trim();
        var rid = r["מזהה קבוע"];
        if (!fam || rid == null || rid === "") return;
        ["שם פרטי 1", "שם פרטי 2"].forEach(function (k) {
          var fn = String(r[k] || "").trim();
          if (fn) out.push({ label: fn + " " + fam, rid: rid, family: fam });
        });
      });
      out.sort(function (a, b) { return a.label.localeCompare(b.label, "he"); });
      if (cb) cb(out);
    });
  }

  // סכום הביצוע לכל סעיף (רק הוצאות שנספרות)
  function actualByCategory() {
    const sums = {};
    getCategories().forEach(function (c) { sums[c.id] = 0; });
    getTransactions().forEach(function (t) {
      if (SPENT_STATUSES.indexOf(t.status) !== -1 && sums.hasOwnProperty(t.categoryId)) {
        sums[t.categoryId] += t.amount;
      }
    });
    return sums;
  }

  // ניצול תת-סעיפים (סעיף 6, 2026-08-10) — עבור סעיף מפורט (c.items, ר' סעיף 5),
  // מחזיר לכל פריט את הביצוע בפועל (סכום תנועות נספרות ששויכו אליו דרך
  // subItemId), לתצוגה קלה (מלל מוקטן) במסך "תכנון מול ביצוע". null אם הסעיף
  // לא מפורט בכלל — כדי שהתצוגה תדע לדלג בלי בדיקת אורך בכל מקום.
  // txFilter אופציונלי (למשל סינון לפי חודש ב-getBudgetRowsAsOf) — אותו סינון
  // בדיוק צריך לחול גם כאן כדי שהסכומים יהיו עקביים עם r.actual של הסעיף עצמו.
  function itemsActualForCategory(c, txFilter) {
    if (!c.items || !c.items.length) return null;
    const sums = {};
    c.items.forEach(function (it) { sums[it.id] = 0; });
    getTransactions().forEach(function (t) {
      if (t.categoryId !== c.id) return;
      if (SPENT_STATUSES.indexOf(t.status) === -1) return;
      if (!sums.hasOwnProperty(t.subItemId)) return;
      if (txFilter && !txFilter(t)) return;
      sums[t.subItemId] += t.amount || 0;
    });
    return c.items.map(function (it) { return { name: it.name, plan: it.plan || 0, actual: sums[it.id] || 0 }; });
  }

  // שורת תקציב מוכנה לתצוגה: תכנון, ביצוע, יתרה, אחוז ניצול, ורמת מצב
  function getBudgetRows() {
    const actual = actualByCategory();
    return getCategories().map(function (c) {
      const spent = actual[c.id] || 0;
      const remaining = c.plan - spent;
      const pct = c.plan > 0 ? (spent / c.plan) * 100 : (spent > 0 ? 999 : 0);
      let band = "ok";                  // ok = ירוק
      if (pct >= 100) band = "danger";  // חריגה = אדום
      else if (pct >= 85) band = "warn"; // קרוב לחריגה = כתום
      return {
        id: c.id, name: c.name, plan: c.plan, group: c.group,
        actual: spent, remaining: remaining, pct: pct, band: band,
        items: itemsActualForCategory(c)
      };
    });
  }

  // קיבוץ שורות כלשהן לפי קבוצת־על
  function groupRowsByGroup(rows) {
    return getGroups().map(function (g) {
      const gr = rows.filter(function (r) { return r.group === g.id; });
      return {
        id: g.id, name: g.name, rows: gr,
        plan: gr.reduce(function (s, r) { return s + (r.plan || 0); }, 0),
        actual: gr.reduce(function (s, r) { return s + (r.actual || 0); }, 0),
        expected: gr.reduce(function (s, r) { return s + (r.expected || 0); }, 0)
      };
    }).filter(function (g) { return g.rows.length > 0; });
  }
  function getBudgetByGroup() { return groupRowsByGroup(getBudgetRows()); }

  // --- תצוגה "מול השלב בשנה" ---
  /* ⚠️ 2026-09-09 — הרשימה הזאת הייתה מקודדת קשיח לתשפ"ו (2025-09..2026-08).
     ברגע שתשפ"ז נהייתה השנה הפעילה זה נשבר בשקט ובגדול: תנועות ספטמבר 2026
     נושאות חודש "2026-09" שאינו ברשימה, ולכן actualToDate החזירה 0 לכל סעיף,
     cumulativeSeries צייר קו ביצוע שטוח באפס, ו-currentFiscalIndex לא מצאה
     את החודש הנוכחי ונפלה ל-11 — כלומר המסך "מול השלב בשנה" הכריז שהשנה
     נגמרה והציג צפי של כל התקציב השנתי מול ביצוע אפס.
     מעכשיו החודשים נגזרים משם השנה. לתשפ"ו התוצאה זהה **בדיוק** לרשימה
     הישנה, ולכן שום דבר קיים לא זז. */
  const FISCAL_KEYS_LEGACY = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
                              "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

  /* גימטריה של שם שנה עברית -> שנת ההתחלה הלועזית (ספטמבר).
     תשפ"ו = 400+300+80+6 = 786 -> 5786 -> 5786-3761 = 2025.
     תשפ"ז -> 787 -> 2026. גרשיים/רווחים מתעלמים. אות לא מוכרת או תוצאה
     מחוץ לטווח הסביר -> null, והקורא נופל חזרה להתנהגות הישנה. */
  const HEB_GEMATRIA = {
    "א":1,"ב":2,"ג":3,"ד":4,"ה":5,"ו":6,"ז":7,"ח":8,"ט":9,
    "י":10,"כ":20,"ך":20,"ל":30,"מ":40,"ם":40,"נ":50,"ן":50,
    "ס":60,"ע":70,"פ":80,"ף":80,"צ":90,"ץ":90,"ק":100,"ר":200,"ש":300,"ת":400
  };
  function hebYearStartGreg(name) {
    const letters = String(name || "").replace(/[^\u05D0-\u05EA]/g, "");
    if (!letters) return null;
    let n = 0;
    for (let i = 0; i < letters.length; i++) {
      const v = HEB_GEMATRIA[letters.charAt(i)];
      if (!v) return null;
      n += v;
    }
    if (n < 700 || n > 899) return null;   // ה'ת"ש עד ה'תתצ"ט — טווח שפוי לאלף השישי
    return 5000 + n - 3761;
  }
  /* 12 מפתחות החודשים (yyyy-MM) של שנת תקציב, ספטמבר עד אוגוסט. */
  function fiscalKeysFor(year) {
    const g = hebYearStartGreg(year);
    if (g == null) return FISCAL_KEYS_LEGACY;
    const out = [];
    for (let i = 0; i < 12; i++) {
      let m = 9 + i, y = g;
      if (m > 12) { m -= 12; y += 1; }
      out.push(y + "-" + (m < 10 ? "0" + m : String(m)));
    }
    return out;
  }
  function fiscalKeys() { return fiscalKeysFor(getCurrentYear()); }
  function getFiscalMonths() {
    const labels = getMonthLabels();
    return fiscalKeys().map(function (k, i) { return { key: k, label: labels[i], index: i }; });
  }
  function currentFiscalIndex() {
    const today = new Date().toISOString().slice(0, 7);
    const keys = fiscalKeys();
    const i = keys.indexOf(today);
    /* לפני תחילת השנה -> 0 (עוד לא נצבר כלום), אחריה -> 11 (השנה נגמרה).
       הנפילה הגורפת ל-11 היא שגרמה לשנה חדשה להיראות כאילו הסתיימה. */
    if (i >= 0) return i;
    return today < keys[0] ? 0 : keys.length - 1;
  }
  // חלוקה חודשית מחושבת לפי מצב נתון (12 ערכים) — לוגיקה משותפת לסעיף
  // שלם ולתת-סעיף בודד (סעיף 7ג, 2026-08-10).
  function distMonthly(dist, plan) {
    const d = dist || { mode: "equal", months: 12, monthly: null };
    if (d.mode === "custom" && d.monthly) { const a = d.monthly.slice(); while (a.length < 12) a.push(0); return a; }
    const arr = new Array(12).fill(0);
    if (d.mode === "unplanned") { arr[11] = plan || 0; return arr; }  // שנתי -> סוף שנה
    const m = d.months || 12, per = m > 0 ? (plan || 0) / m : 0;
    for (let i = 0; i < 12; i++) arr[i] = i < m ? per : 0;
    return arr;
  }
  // חלוקה חודשית מחושבת לפי מצב הסעיף (12 ערכים). אם הסעיף מפורט לתת-סעיפים
  // (סעיף 7ג) — כל תת-סעיף מחזיק חלוקה משלו, וחלוקת הסעיף היא סכום כל
  // תת-הסעיפים; בקרת החלוקה של הסעיף עצמו לא מוצגת/משמשת יותר במקרה הזה.
  function categoryMonthly(c) {
    if (c.items && c.items.length) {
      const sum = new Array(12).fill(0);
      c.items.forEach(function (it) {
        const a = distMonthly(it.dist, it.plan);
        for (let i = 0; i < 12; i++) sum[i] += a[i];
      });
      return sum;
    }
    return distMonthly(c.dist, c.plan);
  }
  function expectedToDate(c, asOf) {
    const arr = categoryMonthly(c); let s = 0;
    for (let i = 0; i <= asOf && i < 12; i++) s += arr[i];
    return s;
  }
  function actualToDate(c, asOf) {
    const keys = fiscalKeys().slice(0, asOf + 1);
    return getTransactions().filter(function (t) {
      return t.categoryId === c.id && SPENT_STATUSES.indexOf(t.status) !== -1 && keys.indexOf(t.month) !== -1;
    }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
  }
  // שורות תקציב "נכון לחודש X" — צפי מול ביצוע עד אותו חודש
  function getBudgetRowsAsOf(asOf) {
    const monthKeys = fiscalKeys().slice(0, asOf + 1);
    return getCategories().map(function (c) {
      const expected = expectedToDate(c, asOf);
      const actual = actualToDate(c, asOf);
      const pct = expected > 0 ? (actual / expected * 100) : (actual > 0 ? 999 : 0);
      let band = "ok";
      if (pct > 110) band = "danger"; else if (pct > 100) band = "warn";
      return {
        id: c.id, name: c.name, group: c.group, plan: c.plan, expected: expected, actual: actual, diff: actual - expected, pct: pct, band: band,
        items: itemsActualForCategory(c, function (t) { return monthKeys.indexOf(t.month) !== -1; })
      };
    });
  }
  // סדרות מצטברות לגרף: תכנון מצטבר מול ביצוע מצטבר לאורך החודשים
  function cumulativeSeries() {
    const keys = fiscalKeys();
    const monthly = getCategories().map(categoryMonthly);
    const plan = [], actual = [];
    let cp = 0, ca = 0;
    for (let i = 0; i < 12; i++) {
      cp += monthly.reduce(function (s, arr) { return s + arr[i]; }, 0);
      ca += getTransactions().filter(function (t) {
        return SPENT_STATUSES.indexOf(t.status) !== -1 && t.month === keys[i];
      }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      plan.push(cp); actual.push(ca);
    }
    return { labels: getFiscalMonths().map(function (m) { return m.label; }), plan: plan, actual: actual };
  }

  /* ==================================================================
     נתוני שנה כלשהי  (2026-09-09) — תוספת בלבד, שום קוד קיים לא משתנה
     ------------------------------------------------------------------
     כל הפונקציות שמעל קוראות את השנה הפעילה דרך ה-getters של CBA.mock
     (ר' mock.js: categories/transactions/income הם getters על
     years[currentYear]). השוואה בין שנים צריכה בדיוק אותם חישובים על
     שנה אחרת — בלי להחליף את השנה הפעילה ובלי לגעת במסכים הקיימים.
     הנתונים כבר בזיכרון: doGet מחזיר את כל השנים, אז אין כאן פנייה לשרת.

     ⚠️ הלוגיקה כאן תאומה ל-getBudgetRows / cumulativeSeries שמעל. אם
        משתנה כלל ספירה (SPENT_STATUSES, ספי הרמזור) — לשנות בשני המקומות.
        זו בדיוק מלכודת השכפול, ולכן ההערה הזאת קיימת.
     ================================================================== */
  function yearData(year) { return (CBA.mock.years || {})[year] || null; }
  function getDataYears() { return Object.keys(CBA.mock.years || {}); }

  /* שורות תכנון-מול-ביצוע לשנה כלשהי. אותם שדות כמו getBudgetRows(). */
  function getYearRows(year) {
    const d = yearData(year);
    if (!d) return [];
    const cats = d.categories || [], txs = d.transactions || [];
    const sums = {};
    cats.forEach(function (c) { sums[c.id] = 0; });
    txs.forEach(function (t) {
      if (SPENT_STATUSES.indexOf(t.status) !== -1 && sums.hasOwnProperty(t.categoryId)) {
        sums[t.categoryId] += (t.amount || 0);
      }
    });
    return cats.map(function (c) {
      const plan = Number(c.plan) || 0;
      const spent = sums[c.id] || 0;
      const pct = plan > 0 ? (spent / plan) * 100 : (spent > 0 ? 999 : 0);
      let band = "ok";
      if (pct >= 100) band = "danger";
      else if (pct >= 85) band = "warn";
      return {
        id: c.id, name: c.name, group: c.group,
        incomeSourceId: c.incomeSourceId, sources: c.sources,
        plan: plan, actual: spent, remaining: plan - spent, pct: pct, band: band
      };
    });
  }

  /* תכנון מצטבר מול ביצוע מצטבר לשנה כלשהי — 12 ערכים לכל סדרה.
     מחזיר null לשנה שאין לה נתונים, כדי שהקורא ידע לוותר על הסדרה. */
  function cumulativeSeriesFor(year) {
    const d = yearData(year);
    if (!d) return null;
    const keys = fiscalKeysFor(year);
    const monthly = (d.categories || []).map(categoryMonthly);
    const txs = d.transactions || [];
    const plan = [], actual = [];
    let cp = 0, ca = 0;
    for (let i = 0; i < 12; i++) {
      cp += monthly.reduce(function (s, arr) { return s + arr[i]; }, 0);
      ca += txs.filter(function (t) {
        return SPENT_STATUSES.indexOf(t.status) !== -1 && t.month === keys[i];
      }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      plan.push(cp); actual.push(ca);
    }
    return { year: year, labels: getMonthLabels(), plan: plan, actual: actual, keys: keys };
  }

  /* מקורות ההכנסה של שנה כלשהי, עם computed — כמו getIncomeSources(). */
  function getIncomeSourcesFor(year) {
    const d = yearData(year);
    if (!d) return [];
    return (d.income || []).map(function (src) {
      const copy = Object.assign({}, src);
      copy.computed = incomeAmount(src);
      return copy;
    });
  }

  /* עד איזה חודש (0-11) יש משמעות להשוואה בשנה נתונה: השנה שהסתיימה —
     כל ה-12; השנה שרצה — עד החודש הנוכחי. משמש כדי לא לצייר קו ביצוע
     שנופל לאפס בחודשים שעוד לא קרו. */
  function fiscalIndexIn(year) {
    const keys = fiscalKeysFor(year);
    const today = new Date().toISOString().slice(0, 7);
    const i = keys.indexOf(today);
    if (i >= 0) return i;
    return today < keys[0] ? -1 : 11;
  }

  // סיכום כללי לראש הדשבורד
  function getSummary() {
    const rows = getBudgetRows();
    const totalPlan   = rows.reduce(function (s, r) { return s + r.plan; }, 0);
    const totalActual = rows.reduce(function (s, r) { return s + r.actual; }, 0);
    return {
      totalPlan: totalPlan,
      totalActual: totalActual,
      remaining: totalPlan - totalActual,
      pct: totalPlan > 0 ? (totalActual / totalPlan) * 100 : 0
    };
  }

  // --- הכנסות ותכנון ---

  // סכום של מקור הכנסה בודד (מיסים מחושבים, שאר מקורות סכום קבוע)
  function incomeAmount(src) {
    if (src.type === "dues") {
      return src.rate * (src.families * src.months + src.tailFamilies * src.tailMonths);
    }
    return src.amount || 0;
  }

  function getIncomeSources() {
    return CBA.mock.income.map(function (s) {
      const copy = Object.assign({}, s);
      copy.computed = incomeAmount(s);
      return copy;
    });
  }

  function getIncomeTotal() {
    return CBA.mock.income.reduce(function (sum, s) { return sum + incomeAmount(s); }, 0);
  }

  // סך התקציב המתוכנן (סכום כל הסעיפים)
  function getPlanTotal() {
    return getCategories().reduce(function (sum, c) { return sum + (c.plan || 0); }, 0);
  }

  // שורה תחתונה: הכנסות פחות הוצאות מתוכננות (חיובי = עודף, שלילי = גירעון)
  function getPlanningBalance() {
    return getIncomeTotal() - getPlanTotal();
  }

  // סך התכנון ה"שנתי" — סעיפים שסומנו כלא מחולקים לחודשים
  function getAnnualTotal() {
    return getCategories()
      .filter(function (c) { return c.dist && c.dist.mode === "unplanned"; })
      .reduce(function (s, c) { return s + (c.plan || 0); }, 0);
  }

  // --- שני שלבים: תכנון (draft) / ביצוע (locked) ---
  function getBudgetPhase() { return (CBA.mock.budget || {}).phase || "draft"; }
  function getBudgetInfo() { return CBA.mock.budget || {}; }

  function lockBudget() {
    const b = CBA.mock.budget;
    b.phase = "locked";
    b.lockedAt = new Date().toISOString().slice(0, 10);
    if (pushConnected()) CBA.sheets.push("setBudgetMeta", { year: getCurrentYear(), phase: "סגור", baseline: null });
  }
  function reopenBudget() {
    const b = CBA.mock.budget;
    b.phase = "draft"; b.lockedAt = null;
    if (pushConnected()) CBA.sheets.push("setBudgetMeta", { year: getCurrentYear(), phase: "טיוטה", baseline: null });
  }

  // --- יומן עדכוני תקציב (טאב "עדכוני תקציב") ---
  // כל שינוי בתכנון סעיף לאחר נעילה נרשם כשורה קבועה. היומן נשמר לתמיד.
  function logBudgetUpdate(section, from, to, reason) {
    const row = {
      date: new Date().toISOString().slice(0, 10),
      year: getCurrentYear(),
      section: String(section),
      from: Number(from) || 0, to: Number(to) || 0,
      reason: reason || ""
    };
    if (!CBA.mock.budgetUpdates) CBA.mock.budgetUpdates = [];
    CBA.mock.budgetUpdates.push(row);
    if (pushConnected()) CBA.sheets.push("logBudgetUpdate", row);
    return row;
  }
  // כל שורות היומן של השנה הנוכחית, בסדר כרונולוגי (כפי שנרשמו)
  function updatesForYear() {
    const y = getCurrentYear();
    return (CBA.mock.budgetUpdates || []).filter(function (u) { return u.year === y; });
  }
  // קיבוץ לפי סעיף: הבסיס = ה"מ" של העדכון הראשון; הנוכחי = התכנון החי
  function updatesBySection() {
    const map = {};
    updatesForYear().forEach(function (u) {
      if (!map[u.section]) map[u.section] = { section: u.section, base: u.from, rows: [] };
      map[u.section].rows.push(u);
    });
    return map;
  }

  // שינוי שם סעיף — עם הגירה: מעדכן את מזהה/שם הסעיף, מעביר את כל התנועות
  // (של השנה) מהשם הישן לחדש בזיכרון, ומסנכרן לגיליון (תקציב + תנועות).
  function renameCategory(oldId, newName) {
    newName = String(newName == null ? "" : newName).trim();
    const c = findCategory(oldId);
    if (!c || !newName || newName === oldId) return c;
    if (pushConnected()) {
      const year = getCurrentYear();
      getTransactions().forEach(function (t) { if (t.categoryId === oldId) t.categoryId = newName; });
      const b = CBA.mock.budget;
      if (b && b.baseline && b.baseline[oldId] != null) { b.baseline[newName] = b.baseline[oldId]; delete b.baseline[oldId]; }
      c.id = newName; c.name = newName;
      CBA.sheets.push("renameCategory", { year: year, oldName: oldId, newName: newName });
      if (b && b.phase === "locked" && b.baseline) CBA.sheets.push("setBudgetMeta", { year: year, phase: "סגור", baseline: b.baseline });
    } else {
      c.name = newName;
    }
    return c;
  }
  // ערך הבסיס (המאושר) של סעיף — ה"מ" של העדכון הראשון ביומן (אם קיים)
  function getBaselinePlan(catId) {
    const m = updatesBySection()[catId];
    return m ? m.base : null;
  }
  // סיכום עדכונים לפי סעיף (לתגית "עודכן" ולמונה) — נגזר מיומן העדכונים
  function getBudgetUpdates() {
    const m = updatesBySection();
    return getCategories().filter(function (c) { return m[c.id]; }).map(function (c) {
      const base = m[c.id].base;
      return { id: c.id, name: c.name, base: base, current: c.plan || 0, diff: (c.plan || 0) - base, count: m[c.id].rows.length };
    }).filter(function (u) { return Math.round(u.diff) !== 0 || u.count > 0; });
  }
  // יומן העדכונים המלא של השנה — כרונולוגי, החדש למעלה (למסך "עדכונים")
  function getBudgetUpdateLog() {
    return updatesForYear().slice().reverse();
  }

  // --- ניהול שנים (רב־שנתי) ---
  function getYears() { return (CBA.mock.yearList || []).slice(); }
  function getCurrentYear() { return CBA.mock.currentYear; }
  /* ⚠️ עד 2026-09-09 הפונקציה הזאת שינתה **רק** משתנה בזיכרון הדפדפן, ואף
     שורה במערכת לא כתבה אי פעם להגדרה 'שנה נוכחית' בגיליון. התוצאה: בורר
     השנה שינה מה שהמשתמש רואה, האפליקציה המשיכה להיפתח על השנה הישנה, וכל
     הוצאה חדשה נכתבה אליה — כך כל הוצאות ספטמבר 2026 נרשמו לתשפ"ו.
     persist=true שומר את הבחירה בשרת לכל המשתמשים (מוגן PERM_BUDGET שם).
     בלי persist ההתנהגות נשארת מקומית בדיוק כמו קודם — למי שאין לו הרשאת
     תקציב, ולמסלול השחזור מ-localStorage בעליית האפליקציה. */
  function setCurrentYear(y, persist) {
    if (!CBA.mock.years[y]) return CBA.mock.currentYear;
    /* רשת ביטחון (2026-09-14): שנה שקיימת ברשימה אבל הנתונים שלה עוד לא
       נמשכו היא מסך תקציב ריק שנראה אמיתי. המעבר אליה חייב לעבור קודם
       ב-CBA.sheets.loadYear. ⚠️ זה שומר גם על מסלולים שעוד לא נכתבו. */
    if (CBA.mock.years[y]._loaded === false) return CBA.mock.currentYear;
    CBA.mock.currentYear = y;
    if (persist && pushConnected()) {
      CBA.sheets.push("setCurrentYear", { year: y });
      // עדכון אופטימי של ההגדרה המקומית, כדי שהסימון "שנת העבודה" יתעדכן
      // מיד ולא רק אחרי המשיכה הבאה מהשרת
      CBA.mock._settings = Object.assign({}, CBA.mock._settings, { "שנה נוכחית": y });
    }
    return CBA.mock.currentYear;
  }

  /* ⚠️ שתי שנים שונות, ואסור לבלבל ביניהן:
     • getCurrentYear()  — השנה ש**מוצגת** כרגע. אישית, זמנית, לא נשמרת בשרת.
     • getWorkingYear()  — שנת התקציב ש**עובדים עליה**, מההגדרה 'שנה נוכחית'
       בגיליון. גלובלית לכל המשתמשים, וזו שהאפליקציה נפתחת עליה.
     ההפרדה נוספה 9.9.26 אחרי שיועד הצביע על כך שגרסה קודמת ערבבה ביניהן,
     והפכה כל הצצה לשנה קודמת לשינוי גלובלי. */
  function getWorkingYear() {
    const w = String((CBA.mock._settings || {})["שנה נוכחית"] || "").trim();
    return w || getCurrentYear();
  }
  // יצירת שנה חדשה — משוכפלת מבנית משנה קיימת (סעיפים + מקורות הכנסה), תנועות ריקות, מצב טיוטה
  function addYear(newYear, fromYear) {
    if (!newYear || CBA.mock.years[newYear]) return CBA.mock.years[newYear] || null;
    const srcY = CBA.mock.years[fromYear || CBA.mock.currentYear];
    const cats = (srcY ? srcY.categories : []).map(function (c) {
      return {
        id: c.id, name: c.name, plan: c.plan, group: c.group, incomeSourceId: c.incomeSourceId,
        dist: { mode: c.dist.mode, months: c.dist.months, monthly: c.dist.monthly ? c.dist.monthly.slice() : null }
      };
    });
    const inc = (srcY ? srcY.income : []).map(function (s) { return Object.assign({}, s); });
    // קבוצות התקציב מועתקות מהשנה המקורית כעותק עצמאי — משם והלאה שינוי בקבוצות
    // של שנה אחת לא ישפיע על השנייה (סעיף 3, קבוצות פר-שנה).
    const grp = (srcY ? srcY.groups : []).map(function (g) { return Object.assign({}, g); });
    CBA.mock.years[newYear] = {
      income: inc, categories: cats, transactions: [],
      budget: { phase: "draft", lockedAt: null, baseline: null },
      // פנקס הערות מתחיל ריק בשנה חדשה — לא משוכפל מהשנה שממנה יוצרים (סעיף 1)
      notes: { content: "", editedBy: "", editedAt: "" },
      groups: grp
    };
    CBA.mock.yearList.push(newYear);
    if (pushConnected()) CBA.sheets.push("addYear", { year: newYear, fromYear: fromYear || CBA.mock.currentYear });
    return CBA.mock.years[newYear];
  }

  // --- השוואה לשנים קודמות ---
  function getComparisonYears() { return Object.keys(CBA.mock.history || {}); }
  function getYearPlan(year, catId) {
    const arr = (CBA.mock.history || {})[year] || [];
    const e = arr.find(function (x) { return x.id === catId; });
    return e ? e.plan : null;
  }
  // סעיפים שהיו בשנה המושווית אך אינם קיימים כעת
  function getExtraFromYear(year) {
    const ids = getCategories().map(function (c) { return c.id; });
    return ((CBA.mock.history || {})[year] || []).filter(function (e) { return ids.indexOf(e.id) === -1; });
  }

  // סעיפים שמשויכים למקור הכנסה שכבר לא קיים (כולל שורות בפיצול, סעיף 4)
  /* סעיפים מפוצלים שסכום שורות הפיצול בהם אינו שווה לתכנון הסעיף.
     נמצא חי 9.9.26 (תרבות מבוגרים 72,000 מול 73,000; יוזמות תושבים 5,000
     מול 6,000) ולא הייתה שום דרך לראות את זה במסך. ר' [[cba-visible-drift-rule]] */
  function getSplitMismatchCategories() {
    return getCategories().filter(function (c) {
      if (!c.sources || c.sources.length < 2) return false;
      const sum = c.sources.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
      return Math.round(sum) !== Math.round(c.plan || 0);
    });
  }

  /* סעיפים ששויכו לקבוצה שאינה קיימת — הם פשוט לא מרונדרים בלוח, ולכן
     סכום העמודות קטן מהשורה התחתונה בלי שום הסבר (נמצא חי 9.9.26: 2,500 ₪). */
  function getOrphanGroupCategories() {
    const gids = getGroups().map(function (g) { return g.id; });
    return getCategories().filter(function (c) { return gids.indexOf(c.group) === -1; });
  }

  function getUnassignedCategories() {
    const ids = getIncomeSources().map(function (s) { return s.id; });
    return getCategories().filter(function (c) {
      if (c.sources && c.sources.length > 1) {
        return c.sources.some(function (s) { return ids.indexOf(s.incomeSourceId) === -1; });
      }
      return ids.indexOf(c.incomeSourceId) === -1;
    });
  }

  // --- עוזרי חיפוש (מחזירים את האובייקט החי מה-store) ---
  function findCategory(id)     { return CBA.mock.categories.find(function (c) { return c.id === id; }); }
  function findGroup(id)        { return CBA.mock.groups.find(function (g) { return g.id === id; }); }
  function findIncomeSource(id) { return CBA.mock.income.find(function (s) { return s.id === id; }); }
  function getDuesSource()      { return CBA.mock.income.find(function (s) { return s.type === "dues"; }); }

  // מזהה ייחודי חדש לרשומה
  function newId(prefix) { return prefix + "_" + Math.random().toString(36).slice(2, 8); }

  // נרמול סעיף: מבטיח שלכל סעיף יש שיוך למקור הכנסה + מצב חלוקה חודשית + סכום מספרי
  function normalizeCategory(c) {
    /* ⚠️ אין כאן ברירת מחדל בכוונה (2026-09-09, הנחיית יועד).
       קודם נכתב כאן `"dues"` — מזהה מ-mock.js שאינו קיים בייצור, ולכן סעיף
       חדש "נולד" על מקור רפאים: הוא *נראה* משויך למיסי שיכון (כי ה-select
       נופל לאופציה הראשונה כשהערך אינו מוכר) אבל לא נספר בשום מקום, ובחירה
       חוזרת באותו ערך גם לא שידרה `change` ולכן לא שמרה כלום.
       מקור ריק נשאר ריק, מסומן "ללא מקור", ומחייב בחירה מפורשת. */
    if (!c.incomeSourceId) c.incomeSourceId = "";
    // פיצול בין כמה מקורות הכנסה (סעיף 4, 2026-08-10) — c.sources תקף רק כשיש
    // בו 2+ שורות (זו ההגדרה של "סעיף מפוצל"); מערך עם 0/1 שורות מתקפל בחזרה
    // למקור יחיד (incomeSourceId), כדי שלא יישאר "פיצול" שקוף עם שורה אחת בלבד.
    // incomeSourceId תמיד נשאר מסונכרן עם השורה הראשונה בפיצול — משמש כברירת
    // מחדל/תאימות לאחור לכל קוד שעדיין לא יודע להסתכל על sources (למשל שרת ישן).
    if (c.sources && c.sources.length > 1) {
      c.sources = c.sources.map(function (s) {
        return { incomeSourceId: s.incomeSourceId || "", amount: Number(s.amount) || 0 };
      });
      c.incomeSourceId = c.sources[0].incomeSourceId;
    } else {
      c.sources = null;
    }
    // פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10) — בשונה מ-sources למעלה, כאן
    // גם 1 פריט תקף (פריט יחיד כבר אומר "יש כאן פירוט" — אין "ברירת מחדל"
    // חלופית שאליה חוזרים כמו incomeSourceId). 0 פריטים = לא מפורט (null).
    // כל תת-סעיף מחזיק גם בקרת חלוקה חודשית משלו (dist, סעיף 7ג, 2026-08-10) —
    // ברגע שהסעיף מפורט, בקרת החלוקה של הסעיף עצמו כבר לא מוצגת/משמשת
    // (ר' categoryMonthly למעלה); כל תת-סעיף חדש מתחיל בברירת המחדל הרגילה
    // ("שווה" על פני 12 חודשים), בלי תלות במה שהיה מוגדר קודם ברמת הסעיף.
    if (c.items && c.items.length) {
      c.items = c.items.map(function (it) {
        return {
          id: it.id || newId("item"),
          name: it.name || "",
          plan: Number(it.plan) || 0,
          dist: it.dist || { mode: "equal", months: 12, monthly: null }
        };
      });
    } else {
      c.items = null;
    }
    if (!c.dist) c.dist = { mode: "equal", months: 12, monthly: null };
    if (typeof c.plan !== "number") c.plan = parseFloat(c.plan) || 0;
    return c;
  }

  // תת-סעיפים של סעיף תקציבי (סעיף 5, 2026-08-10) — [] אם הסעיף לא מפורט
  function getCategoryItems(categoryId) {
    const c = findCategory(categoryId);
    return (c && c.items) ? c.items.slice() : [];
  }

  // בונה אובייקט תת-סעיף חדש (עם מזהה ייחודי) בלי לגעת ב-store — פעולה טהורה,
  // בדיוק כמו newId עצמו. משמש גם את כפתור "פרט סעיף" ב-planning.js (מוסיף
  // ישירות ל-c.items ואז קורא ל-planSave() משלו, באותו דפוס בדיוק כמו
  // addGroup/addCategory) וגם את addCategoryItem למטה.
  function newCategoryItem(name, plan, dist) {
    return {
      id: newId("item"),
      name: String(name == null ? "" : name).trim() || "פריט חדש",
      plan: Number(plan) || 0,
      dist: dist || { mode: "equal", months: 12, monthly: null }
    };
  }

  // יצירת תת-סעיף "בזמן אמת" — משמש את מסך ניהול ההוצאות כשמנהל מאשר תנועה
  // ורוצה לשייך אותה לתת-סעיף שעדיין לא קיים ברשימה המתוכננת (סעיף 5,
  // 2026-08-10; לא רק ממסך בניית התקציב). בשונה מ-planning.js — כאן אין מנגנון
  // debounce/planSave מקומי למסך, אז שומר מיד לגיליון עם היווצרות הפריט.
  function addCategoryItem(categoryId, name, cb) {
    const c = findCategory(categoryId);
    if (!c) { if (cb) cb(null); return null; }
    if (!c.items) c.items = [];
    const it = newCategoryItem(name, 0);
    c.items.push(it);
    saveBudgetToSheet(getCurrentYear(), function () { if (cb) cb(it); });
    return it;
  }

  // שינוי שם תת-סעיף עם "מיגרציה" — כמו renameGroup/renameIncomeSource למעלה:
  // תנועות ששויכו לתת-סעיף (t.subItemId, אותו סעיף בלבד) עוברות איתו למזהה
  // החדש, כדי ששמירות עוקבות עדיין יזהו את אותה שורה בגיליון.
  function renameCategoryItem(categoryId, itemId, newName) {
    const c = findCategory(categoryId);
    if (!c || !c.items) return null;
    const it = c.items.find(function (x) { return x.id === itemId; });
    if (!it) return null;
    newName = String(newName == null ? "" : newName);
    if (newName && newName !== it.id && CBA.mock._source === "sheets") {
      getTransactions().forEach(function (t) {
        if (t.categoryId === categoryId && t.subItemId === it.id) t.subItemId = newName;
      });
      it.id = newName;
    }
    it.name = newName;
    return it;
  }

  // --- CRUD סעיפי תקציב ---
  function addCategory(fields) {
    // incomeSourceId ריק במפורש — הבחירה חייבת להיות של המשתמש (ר' ההערה
    // ב-normalizeCategory). group: "misc" נשאר כברירת מחדל היסטורית, אבל
    // בפועל כפתור ההוספה תמיד מעביר את הקבוצה שממנה נלחץ.
    const c = normalizeCategory(Object.assign(
      { id: newId("cat"), name: "סעיף חדש", plan: 0, group: "misc", incomeSourceId: "" }, fields || {}));
    CBA.mock.categories.push(c);
    return c;
  }
  function updateCategory(id, fields) {
    const c = findCategory(id);
    if (c) { Object.assign(c, fields); normalizeCategory(c); }
    return c;
  }
  function removeCategory(id) {
    CBA.mock.categories = CBA.mock.categories.filter(function (c) { return c.id !== id; });
  }

  // --- CRUD קבוצות־על ---
  function addGroup(fields) {
    const g = Object.assign({ id: newId("grp"), name: "קבוצה חדשה" }, fields || {});
    CBA.mock.groups.push(g);
    return g;
  }
  function updateGroup(id, fields) {
    const g = findGroup(id);
    if (g) Object.assign(g, fields);
    return g;
  }
  function removeGroup(id) {
    CBA.mock.groups = CBA.mock.groups.filter(function (g) { return g.id !== id; });
    CBA.mock.categories = CBA.mock.categories.filter(function (c) { return c.group !== id; });
  }
  // סדר קבוצות (סעיף 2 בסדר העבודה, 2026-08-09) — מזיז קבוצה מקום אחד למעלה/
  // למטה במערך (מחליף עם השכנה). הסדר במערך הוא גם הסדר שנשמר לגיליון
  // (saveGroups_ ב-Code.gs כותב לפי סדר המערך, ו-readColumn_ קורא באותו סדר) —
  // אז אין צורך בשדה "סדר" נפרד, מספיק לשמור אחרי ההזזה (ר' planSave ב-planning.js).
  function moveGroup(id, dir) {
    const arr = CBA.mock.groups;
    const i = arr.findIndex(function (g) { return g.id === id; });
    if (i === -1) return;
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= arr.length) return;
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }

  // --- CRUD מקורות הכנסה ---
  function addIncomeSource(fields) {
    const s = Object.assign({ id: newId("inc"), name: "מקור חדש", type: "fixed", amount: 0 }, fields || {});
    CBA.mock.income.push(s);
    return s;
  }
  function updateIncomeSource(id, fields) {
    const s = findIncomeSource(id);
    if (s) Object.assign(s, fields);
    return s;
  }
  function removeIncomeSource(id) {
    CBA.mock.income = CBA.mock.income.filter(function (s) { return s.id !== id; });
  }

  // --- שינוי שם עם "מיגרציה" של השיוכים ---
  // בגיליון המפתח של קבוצה/מקור הוא השם. כששם משתנה, מעבירים את כל הסעיפים
  // המשויכים למזהה החדש ומעדכנים את מזהה האובייקט — כך שמירות עוקבות מזהות
  // את אותה שורה ולא נוצרת כפילות. (במצב דמו לא נוגעים במזהה.)
  function renameGroup(id, newName) {
    const g = findGroup(id);
    if (!g) return null;
    newName = String(newName == null ? "" : newName);
    if (newName && newName !== g.id && CBA.mock._source === "sheets") {
      getCategories().forEach(function (c) { if (c.group === g.id) c.group = newName; });
      g.id = newName;
    }
    g.name = newName;
    return g;
  }
  function renameIncomeSource(id, newName) {
    const s = findIncomeSource(id);
    if (!s) return null;
    newName = String(newName == null ? "" : newName);
    if (newName && newName !== s.id && CBA.mock._source === "sheets") {
      getCategories().forEach(function (c) {
        if (c.incomeSourceId === s.id) c.incomeSourceId = newName;
        // מיגרציה גם בתוך שורות פיצול (סעיף 4) — אחרת שורה בפיצול תישאר תקועה
        // על המזהה הישן אחרי שינוי שם מקור ההכנסה.
        if (c.sources) c.sources.forEach(function (row) { if (row.incomeSourceId === s.id) row.incomeSourceId = newName; });
      });
      s.id = newName;
    }
    s.name = newName;
    return s;
  }

  // מאזן מימון לכל מקור הכנסה: כמה תוקצב מולו מול כמה שיש בו
  function getIncomeAllocation() {
    const alloc = {};
    getCategories().forEach(function (c) {
      // סעיף מפוצל (סעיף 4, 2026-08-10) — כל שורת פיצול מקצה לפי הסכום שלה,
      // לא לפי כל התכנון של הסעיף כמו שהיה נכון למקור יחיד.
      if (c.sources && c.sources.length > 1) {
        c.sources.forEach(function (s) {
          // בלי `|| "dues"`: מזהה ריק/לא מוכר לא נזקף לשום מקור, וכך הוא
          // נשאר גלוי כ"ללא שיוך" במקום להיבלע בדלי שאיש לא רואה
          const sid = s.incomeSourceId;
          if (sid) alloc[sid] = (alloc[sid] || 0) + (Number(s.amount) || 0);
        });
        return;
      }
      const sid = c.incomeSourceId;
      if (sid) alloc[sid] = (alloc[sid] || 0) + (c.plan || 0);
    });
    return getIncomeSources().map(function (s) {
      const allocated = alloc[s.id] || 0;
      return {
        id: s.id, name: s.name, income: s.computed,
        allocated: allocated, remaining: s.computed - allocated,
        over: allocated > s.computed
      };
    });
  }

  /* ==========================================================================
   *  שער ההזרעה של עמוד הבית   (2026-09-15, צעד 06)
   * --------------------------------------------------------------------------
   *  📊 **המדידה שהולידה את זה (אתר חי, 15.9):** חמש קריאות
   *  Apps Script בעלייה — `(boot)` 3.8ש' · `homeExtras` 8.4ש' · `clubList`
   *  6.3ש' · `tour` 4.3ש' · `gardenTasks` 3.6ש'. **ושתיים מהן מיותרות
   *  לחלוטין:** `homeExtras` מחזירה את `tour` ואת `club` בתוכה, וההזרעה
   *  (`seedClubAlerts` / `CBA.tour.seed`) נבנתה בדיוק כדי לבטל אותן.
   *
   *  🔴 **למה ההזרעה לא עבדה:** שתי הקריאות הושהו בשעון קבוע
   *  (2,500מלי ו-3,200מלי), שכוייל כש-`homeExtras` חזרה תוך ~1.5–3 שניות.
   *  היום היא לוקחת 7–8 שניות, השעון מצלצל הרבה לפני שההזרעה
   *  מגיעה, ושתי הקריאות יוצאות. גרוע מזה: התור של Apps Script
   *  משותף למשתמש, ולכן הן מאטות את `homeExtras` עצמה — **מעגל שמזין
   *  את עצמו**: ככל שהיא איטית יותר, כך גדל הסיכוי שהכפילויות יצאו.
   *
   *  התיקון הוא **להמתין לאירוע ולא לשעון**. מספר גדול יותר היה
   *  סוגר את זה היום ונשבר שוב בפעם הבאה שהשרת יאט.
   *
   *  שלושה מצבים, ולכל אחד תשובה שונה:
   *    `idle`    — עמוד הבית לא נפתח (מנהל שנחת על מסך ניהול). אין
   *                הזרעה בדרך — הקריאה הבודדת יוצאת, בדיוק כמו היום.
   *    `pending` — הקריאה המאוחדת באוויר. מחכים לה.
   *    `done`    — חזרה. ממשיכים מיד; הקורא בודק אם הוזרע בפועל.
   *
   *  ⚠️ **לעולם לא נתקעים.** גם ב-`pending` יש תקרה (`capMs`): אם
   *     `homeExtras` לא חזרה כלל — הקריאה הבודדת יוצאת בכל מקרה.
   *  ⚠️ **השעון הישן לא נמחק — הוא הפך ל-`graceMs`**: הזמן שנותנים
   *     לעמוד הבית לפתוח ולהתחיל את הקריאה. מי שלא נוחת על עמוד
   *     הבית מקבל בדיוק את ההתנהגות של היום, באותו עיתוי.
   *  ⚠️ השער מתאפס בכל קריאה חדשה ל-`getHomeExtras` (רענון, חזרה
   *     לעמוד הבית), כך שהוא מתאר תמיד את הקריאה האחרונה.
   * ====================================================================== */
  var hxState = "idle";        // idle | pending | done
  var hxWaiters = [];

  function hxSettle() {
    hxState = "done";
    var list = hxWaiters;
    hxWaiters = [];
    for (var i = 0; i < list.length; i++) {
      try { list[i](); } catch (e) { /* ממתין אחד שזורק לא מפיל את השאר */ }
    }
  }

  function homeExtrasWhenSettled(cb, graceMs, capMs) {
    var fired = false;
    function go() { if (fired) return; fired = true; try { cb(); } catch (e) {} }
    function waitForIt() { hxWaiters.push(go); setTimeout(go, capMs || 12000); }

    if (hxState === "done")    { go(); return; }
    if (hxState === "pending") { waitForIt(); return; }
    setTimeout(function () {
      if (fired) return;
      if (hxState === "pending") { waitForIt(); return; }
      go();                                   // idle (עמוד הבית לא נפתח) או done
    }, graceMs || 2500);
  }

  return {
    getMonthLabels: getMonthLabels,
    getGroups: getGroups,
    getCategories: getCategories,
    getTransactions: getTransactions,
    getAllTransactions: getAllTransactions,
    categoryName: categoryName,
    addTransaction: addTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    uploadReceiptFile: uploadReceiptFile,
    deleteReceiptFile: deleteReceiptFile,
    getReceipt: getReceipt,
    getGardenPhoto: getGardenPhoto,
    getColumnConfig: getColumnConfig,
    saveColumnConfig: saveColumnConfig,
    expectedRefundDate: expectedRefundDate,
    expectedRefundDateLabel: expectedRefundDateLabel,
    saveBudgetToSheet: saveBudgetToSheet,
    submitReceipt: submitReceipt,
    scanReceipt: scanReceipt,
    getClubBusy: getClubBusy,
    reserveClub: reserveClub,
    getClubMonth: getClubMonth,
    getMyClubReservations: getMyClubReservations,
    cancelClubReservation: cancelClubReservation,
    getClubList: getClubList,
    getGymList: getGymList,
    getGymForm: getGymForm,
    getGymMy: getGymMy,
    getFlags: getFlags,
    setFlag: setFlag,
    probeDoc: probeDoc,
    getGymStatusFast: getGymStatusFast,
    getGymCodeFast: getGymCodeFast,
    submitGymApplication: submitGymApplication,
    createGymMembership: createGymMembership,
    requestGymDeclaration: requestGymDeclaration,
    scanGymPayment: scanGymPayment,
    reportGymPayment: reportGymPayment,
    confirmGymPayment: confirmGymPayment,
    recordGymPayment: recordGymPayment,
    rejectGymPayment: rejectGymPayment,
    extendGymMembership: extendGymMembership,
    renewGymMembership: renewGymMembership,
    updateGymMembership: updateGymMembership,
    updateGymSetting: updateGymSetting,
    saveGymQuestion: saveGymQuestion,
    deleteGymQuestion: deleteGymQuestion,
    deleteGymMembership: deleteGymMembership,
    approveClubReservation: approveClubReservation,
    /* אישור מרובה (2026-08-28) — מזהים מופרדים בפסיק בקריאה אחת, במקום N
       קריאות רשת. השרת נועל פעם אחת ומדווח בנפרד על כל שריון שנכשל. */
    approveClubReservations: function (ids, cb) {
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubBulkApprove");
      CBA.sheets.get({ action: "approveClubReservations", ids: (ids || []).join(",") }, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubBulkApprove");
        cb(res);
      });
    },
    rejectClubReservation: rejectClubReservation,
    getResidents: getResidents,
    refreshResidents: function (cb) { residentsCache = null; directoryCache = null; communityCache = null; getResidents(cb); },
    residentPickerOptions: residentPickerOptions,
    familyDisplayName: familyDisplayName,
    ensureFamilyNames: ensureFamilyNames,
    /* משותף עם sheets.js (צעד 08ב-3): מנגנון הדגל + הנפילה
       לאחור הוא אחד בלבד. שכפול שלו היה נפרד בשקט. */
    fsFirstRead: fsFirstRead,
    txLegalStep: txLegalStep,
    txStatusOnly: txStatusOnly,
    getCommunityDirectory: getCommunityDirectory,
    getCommitteeTree: getCommitteeTree,
    saveCommitteeTree: saveCommitteeTree,
    getCommitteeCategories: getCommitteeCategories,
    saveCommitteeCategories: saveCommitteeCategories,
    // בקשות הרשמה וניהול תושבים (2026-08-07)
    listSignups: function (cb) { CBA.sheets.get({ action: "listSignups" }, cb); },
    approveSignup: function (payload, cb) { CBA.sheets.postRead("approveSignup", payload, cb); },
    rejectSignup: function (id, cb) { CBA.sheets.postRead("rejectSignup", { id: id }, cb); },
    /* ⚠️ 17.9, ממצא 14 — מחיקת משק בית. השומרים (היסטוריה כספית, שלילת
       גישה לפני מחיקת השורה) יושבים **בשרת** ולא כאן; הלקוח רק שואל. */
    deleteResidentRow: function (rowIndex, cb) {
      CBA.sheets.postRead("deleteResidentRow", { rowIndex: rowIndex }, cb);
    },
    saveResidentRow: function (rowIndex, fields, cb) {
      CBA.sheets.postRead("saveResidentRow", { rowIndex: rowIndex, fields: fields }, cb);
    },
    ensureResidentCols: function (cb) { CBA.sheets.postRead("ensureResidentCols", {}, cb); },
    replaceFamily: function (payload, cb) { CBA.sheets.postRead("replaceFamily", payload, cb); },
    // הרשאות (2026-08-07) — slot הוא מספר משבצת האימייל (1/2) בתוך השורה,
    // כי לכל בן/בת זוג יש הרשאות משלו ולא ברמת משק הבית
    savePermissions: function (rowIndex, slot, perms, cb) {
      CBA.sheets.postRead("savePermissions", { rowIndex: rowIndex, slot: slot, perms: perms }, cb);
    },
    ensurePermissionCols: function (cb) { CBA.sheets.postRead("ensurePermissionCols", {}, cb); },
    /* ---- בדיקת החזרים (PHASE 4.2) ----
       postRead ולא push: זו קריאה שממתינים לתשובתה, והיא לא כותבת כלום. */
    parseChargeFile: function (payload, cb) {
      CBA.sheets.postRead("parseChargeFile", payload, cb);
    },

    /* ---- דיווחים על האפליקציה (2026-09-09) ----
       submitAppReport פתוח לכל משתמש מחובר (הכפתור הצף בכל מסך);
       שני האחרים הם מנהל-על בלבד, והאכיפה בשרת. */
    submitAppReport: function (payload, cb) {
      CBA.sheets.postRead("submitAppReport", payload, cb);
    },
    getAppReports: function (cb) { CBA.sheets.get({ action: "appReports" }, cb); },
    setAppReportDone: function (id, done, reply, cb) {
      CBA.sheets.postRead("setAppReportDone", { id: id, done: !!done, reply: reply || "" }, cb);
    },

    /* ---- מראה שיכון / גינון (2026-09-07) ----
       שלוש הפעולות פתוחות לכל תושב מחובר ופעיל ומחזירות רק את הנתונים שלו —
       הסינון נעשה בשרת לפי המושב החתום, לא כאן. ר' handleMyGardenReports_. */
    /* 🔴 18.9, גל 3 — הרשימות מ-Firestore. אותו מסמך בדיוק
       שמסך הניהול כבר קורא — חיבור של חוט שכבר מתוח. */
    getGardenMeta: function (cb) {
      fsFirstRead("gardenMeta", true, function (done) {
        CBA.fb.readDoc("gardenMeta", "lists", function (err, doc) {
          if (err) return done(err);
          if (!doc) return done(new Error("no-lists-doc"));
          done(null, { ok: true,
                       areas: doc.areas || [],
                       categories: doc.categories || [] });
        });
      }, function (done) {
        CBA.sheets.get({ action: "gardenMeta" }, done);
      }, cb);
    },
    getMyGardenReports: myGardenReportsRead,
    getMyGardenLog: gardenMyLogRead,
    /* ⚠️ postReadProgress ולא postRead, משתי סיבות (2026-09-14):
       (א) **הגנת beforeunload.** ל-postRead אין אחת, ולכן תושב שסגר/רענן את
           הדף באמצע שליחה איבד את הדיווח **בשקט** — בלי שורה בגיליון ובלי
           הודעת שגיאה. זה אותו באג בדיוק שנמצא בייצור ב-submitReceipt
           (10.8.26) ותוקן שם, ונשאר פתוח כאן.
       (ב) אחוזי העלאה אמיתיים. הדיווח נושא עד 8 תמונות Base64, והשליחה
           לוקחת כמה שניות — בלי מדד אמיתי הכפתור נראה תקוע.
       onProgress הוא פרמטר שלישי אופציונלי; קריאות קיימות עם cb בלבד
       ממשיכות לעבוד כמו שהן. */
    submitGardenReport: function (payload, cb, onProgress) {
      /* 🔴 ההיפוך (16.9) — ר' הבלוק מעל `gardenReportFsWrite`.
         הדגל מכבה **כתיבה וקריאה יחד** דרך אותו מתג של הדיווחים:
         כתיבה ל-Firestore בזמן שהמסך נבנה מהגיליון = דיווח שנעלם. */
      var on = CBA.fb && CBA.fb.flag &&
               CBA.fb.flag("gardenReportsFromFirestore", GARDEN_REPORTS_FROM_FIRESTORE) &&
               CBA.fb.flag("gardenWriteToFirestore", GARDEN_WRITE_TO_FIRESTORE) &&
               CBA.fb.uid && CBA.fb.uid();
      if (on) return gardenReportFsWrite(payload, cb, onProgress);
      CBA.sheets.postReadProgress("submitGardenReport", payload,
        onProgress || function () {}, cb);
    },
    gardenCompletePhotos: gardenCompletePhotos,
    gardenFeedback: function (id, positive, note, cb) {
      if (gardenWritesOn()) return gardenFsFeedback(id, positive, note, cb);
      CBA.sheets.postRead("gardenFeedback", { id: id, positive: positive, note: note }, cb);
    },
    /* מסך הנתונים. weeks הוא חלון הזמן; השרת חוסם אותו ל-2..26.
       ⚠️ מה שמוחזר תלוי בתפקיד — אחראי הגינון לא מקבל את החתך מול
       התוכנית ולא את המשוב. הסינון בשרת ולא בתצוגה (F-13). */
    getGardenStats: function (weeks, cb) {
      CBA.sheets.get({ action: "gardenStats", weeks: weeks || 8 }, cb);
    },
    /* יומן המשימה — קו הזמן המלא שלה (2026-09-08). הטאב נכתב מהיום הראשון
       ומעולם לא נקרא; זה מה שהופך "מי סגר את זה ומתי" לשאלה שאפשר לענות. */
    getGardenTaskLog: function (id, cb) {
      gardenTaskLogRead(id, cb);
    },
    /* תוכנית העבודה (2026-09-08) — ההגדרות החוזרות, לא משימות. השרת חוסם
       אותה למשתמש חיצוני, ולכן הקריאה תיכשל אצל אחראי הגינון גם אם איכשהו
       יגיע למסך. ר' handleGardenPlan_. */
    getGardenPlan: function (cb) {
      gardenPlanRead(cb);
    },
    /* יצירה או עדכון של הגדרה. עם id — עדכון; בלי — חדשה. */
    gardenPlanSave: function (payload, cb) {
      if (gardenWritesOn()) return gardenPlanFsSave(payload, cb);
      CBA.sheets.postRead("gardenPlanSave", payload, cb);
    },
    /* "כבר בתוכנית" — קושר דיווח למשימת שגרה שכבר מתוזמנת, במקום לפתוח
       עבודה כפולה. בשרת זה מתגלגל ל-gardenMerge_, ולכן התושב נשאר קשור. */
    gardenCoverByPlan: function (id, defId, week, cb) {
      CBA.sheets.postRead("gardenCoverByPlan", { id: id, defId: defId, week: week }, cb);
    },
    /* מחיקה מהתוכנית. משימות שכבר נוצרו ממנה נשארות — ר' gardenPlanDelete_. */
    gardenPlanDelete: function (id, cb) {
      if (gardenWritesOn()) return gardenPlanFsDelete(id, cb);
      CBA.sheets.postRead("gardenPlanDelete", { id: id }, cb);
    },
    gardenPlanActive: function (id, active, cb) {
      if (gardenWritesOn()) return gardenPlanFsActive(id, active, cb);
      CBA.sheets.postRead("gardenPlanActive", { id: id, active: !!active }, cb);
    },
    /* שלב 4 — משימות הצוות. opts: { week, scope }. שתיהן אופציונליות: בלי week
       השרת מחזיר את השבוע הנוכחי, ו-scope='week' הוא ברירת המחדל. */
    getGardenTasks: function (opts, cb) { gardenTasksRead(opts, cb); },
    /* מחיקת משימה — מנהל בלבד, סיבה חובה. מוחקת גם את שורות הדיווח
       המקושרות ואת התמונות; היומן נשאר שלם. ר' gardenTaskDelete_ בשרת. */
    gardenTaskDelete: function (id, why, cb) {
      CBA.sheets.postRead("gardenTaskDelete", { id: id, why: why }, cb);
    },
    /* מחיקת דיווח ע"י התושב שכתב אותו — רק כל עוד איש לא נגע בו. */
    gardenReportDelete: function (id, cb) {
      CBA.sheets.postRead("gardenReportDelete", { id: id }, cb);
    },
    /* פעולה בודדת על משימה. op: done | undo | note | defer | block | plan |
       return | approve | close | clearflag */
    gardenTask: function (op, id, extra, cb) {
      /* 🔴 18.9, גל 3 — המסלול החדש. הדגל כבוי → הכול כמקודם. */
      if (gardenWritesOn()) return gardenFsTask(op, id, extra || {}, cb);
      var payload = { op: op, id: id };
      if (extra && extra.note !== undefined) payload.note = extra.note;
      if (extra && extra.week !== undefined) payload.week = extra.week;
      if (extra && extra.closure !== undefined) payload.closure = extra.closure;
      CBA.sheets.postRead("gardenTask", payload, cb);
    },
    /* האם הדפדפן כותב ישירות. מסך שצריך לדעת אם להציג שדות שרק המסלול
       הישיר יודע לשמור (מפה, תמונות) שואל כאן, ולא גוזר את הביטוי מחדש. */
    gardenDirectWrites: function () { return gardenWritesOn(); },
    /* פתיחת משימה יזומה ע"י המנהל.
       payload: {title, category, area, week, asReport, x, y, photos}. */
    gardenCreateTask: function (payload, cb) {
      if (gardenWritesOn()) return gardenFsCreateTask(payload, cb);
      CBA.sheets.postRead("gardenCreateTask", payload, cb);
    },
    /* איחוד כפילות: משימה id נבלעת לתוך משימה into. */
    gardenMerge: function (id, into, cb) {
      if (gardenWritesOn()) return gardenFsMerge(id, into, cb);
      CBA.sheets.postRead("gardenMerge", { id: id, into: into }, cb);
    },
    /* אישור מרוכז — רק שגרה מאותה תבנית ואותו שבוע. השרת אוכף (ר' החלטה 3). */
    gardenApproveBatch: function (ids, cb) {
      if (gardenWritesOn()) return gardenFsApproveBatch(ids, cb);
      CBA.sheets.postRead("gardenApproveBatch", { ids: ids }, cb);
    },
    // ייצוא לגיליון חדש (2026-08-07). payload: { columns, rowIndexes, name, subtitle }
    exportResidents: function (payload, cb) { CBA.sheets.postRead("exportResidents", payload, cb); },
    // יצירת משקי בית חדשים (2026-08-07). rows: [{ values:{כותרת:ערך}, markLeftRowIndex }]
    createResidents: function (rows, cb) { CBA.sheets.postRead("createResidents", { rows: rows }, cb); },
    hebrewDate: hebrewDate,
    hebrewMonth: hebrewMonth,
    hebrewDateShort: hebrewDateShort,
    hebrewDateTime: hebrewDateTime,
    getNotes: getNotes,
    saveNotesToSheet: saveNotesToSheet,
    getNotesLog: getNotesLog,
    ensureBudgetLogs: ensureBudgetLogs,
    getHomeCountsFast: getHomeCountsFast,
    getTourFast: getTourFast,
    getClubResvFast: getClubResvFast,
    statusMeta: statusMeta,
    statusNext: statusNext,
    statusList: statusList,
    missingApprovalFields: missingApprovalFields,
    getAlertCounts: getAlertCounts,
    payTypeOf: payTypeOf,
    expenseTypeList: expenseTypeList,
    expenseTypeOf: expenseTypeOf,
    expenseTypeLabel: expenseTypeLabel,
    expenseTypeShort: expenseTypeShort,
    receiptFileName: receiptFileName,
    getBudgetRows: getBudgetRows,
    getBudgetByGroup: getBudgetByGroup,
    groupRowsByGroup: groupRowsByGroup,
    getFiscalMonths: getFiscalMonths,
    currentFiscalIndex: currentFiscalIndex,
    getBudgetRowsAsOf: getBudgetRowsAsOf,
    cumulativeSeries: cumulativeSeries,
    // השוואה בין שנים (2026-09-09) — תוספת, ר' הבלוק "נתוני שנה כלשהי"
    getDataYears: getDataYears,
    getYearRows: getYearRows,
    cumulativeSeriesFor: cumulativeSeriesFor,
    getIncomeSourcesFor: getIncomeSourcesFor,
    fiscalIndexIn: fiscalIndexIn,
    fiscalKeysFor: fiscalKeysFor,
    getSummary: getSummary,
    getIncomeSources: getIncomeSources,
    getIncomeTotal: getIncomeTotal,
    getDuesSource: getDuesSource,
    findCategory: findCategory,
    findGroup: findGroup,
    findIncomeSource: findIncomeSource,
    addCategory: addCategory,
    updateCategory: updateCategory,
    removeCategory: removeCategory,
    getCategoryItems: getCategoryItems,
    newCategoryItem: newCategoryItem,
    addCategoryItem: addCategoryItem,
    distMonthly: distMonthly,
    renameCategoryItem: renameCategoryItem,
    addGroup: addGroup,
    updateGroup: updateGroup,
    removeGroup: removeGroup,
    moveGroup: moveGroup,
    addIncomeSource: addIncomeSource,
    updateIncomeSource: updateIncomeSource,
    removeIncomeSource: removeIncomeSource,
    renameGroup: renameGroup,
    renameIncomeSource: renameIncomeSource,
    renameCategory: renameCategory,
    getPlanTotal: getPlanTotal,
    getPlanningBalance: getPlanningBalance,
    getIncomeAllocation: getIncomeAllocation,
    getAnnualTotal: getAnnualTotal,
    getUnassignedCategories: getUnassignedCategories,
    getSplitMismatchCategories: getSplitMismatchCategories,
    getOrphanGroupCategories: getOrphanGroupCategories,
    getYears: getYears,
    getCurrentYear: getCurrentYear,
    setCurrentYear: setCurrentYear,
    getWorkingYear: getWorkingYear,
    addYear: addYear,
    getComparisonYears: getComparisonYears,
    getYearPlan: getYearPlan,
    getExtraFromYear: getExtraFromYear,
    getBudgetPhase: getBudgetPhase,
    getBudgetInfo: getBudgetInfo,
    lockBudget: lockBudget,
    reopenBudget: reopenBudget,
    getBaselinePlan: getBaselinePlan,
    getBudgetUpdates: getBudgetUpdates,
    getBudgetUpdateLog: getBudgetUpdateLog,
    logBudgetUpdate: logBudgetUpdate,
    // ניהול מיילים (שלב 1, 2026-08-18) — ר' emailSettings.js. listEmailSettings
    // כבר מגיע מסונן מהשרת לפי הרשאת המבקש (מנהל תחום רואה רק את התחום שלו).
    /* סיור היכרות (2026-08-28) — הצעדים והגרסה שכבר נראתה מגיעים בקריאה אחת.
       הסימון "ראיתי" עובר ב-postRead ולא ב-push: זו כתיבה קטנה שאין טעם
       להכניס לתור השמירות ולחיווי "שומר…" בכותרת. */
    /* "הפרטים שלי" (2026-08-28). שים לב: אף אחת מהפעולות לא מקבלת מזהה שורה —
       השרת גוזר את השורה ואת המשבצת מהמושב החתום. ר' Code.gs. */
    getMyProfile: function (cb) { CBA.sheets.get({ action: "myProfile" }, cb); },
    saveMyProfile: function (fields, cb) { CBA.sheets.postRead("saveMyProfile", { fields: fields }, cb); },
    submitProfileChange: function (field, value, cb) {
      CBA.sheets.postRead("submitProfileChange", { field: field, value: value }, cb);
    },
    cancelProfileChange: function (id, cb) { CBA.sheets.postRead("cancelProfileChange", { id: id }, cb); },
    getProfileChanges: function (cb) { CBA.sheets.get({ action: "profileChanges" }, cb); },
    approveProfileChange: function (id, cb) { CBA.sheets.postRead("approveProfileChange", { id: id }, cb); },
    rejectProfileChange: function (id, reason, cb) {
      CBA.sheets.postRead("rejectProfileChange", { id: id, reason: reason || "" }, cb);
    },
    getTour: function (cb) { CBA.sheets.get({ action: "tour" }, cb); },
    /* עמוד הבית בקריאה אחת (2026-09-09). מחזירה את כל מה שהעמוד צריך —
       ר' handleHomeExtras_ ב-Code.gs. אם השרת עדיין ישן, התשובה לא תכיל
       `homeExtras:true` והלקוח נופל חזרה לקריאות הבודדות. */
    getHomeExtras: function (cb) {
      hxState = "pending";
      hxWaiters = [];
      CBA.sheets.get({ action: "homeExtras" }, function (res) {
        /* 🔴 **הסדר כאן הוא כל העניין, והוא נתפס רק במדידה חיה.**
           ה-`cb` כאן הוא `primeHomeExtras`, והוא זה שמבצע את ההזרעה
           עצמה (`CBA.tour.seed` / `seedClubAlerts`). כששחררנו את הממתינים
           לפני כן, הם בדקו את `clubChecked` כשהוא עדיין false — ושלחו
           את שתי הקריאות הכפולות שהשער נועד למנוע.
           נמדד בייצור (15.9): הן אכן יצאו — רק מאוחר יותר. ההזרעה
           חייבת לקדום לשחרור, וזה כל ההבדל בין השער שעובד לשער
           שרק מזיז את הקריאות הכפולות קדימה בזמן.
           `finally` — כדי ש-`cb` שזורק לא ישאיר את הממתינים תקועים. */
        try { if (cb) cb(res); }
        finally { hxSettle(); }
      });
    },
    /* מי שרוצה את אותו מידע ש-`homeExtras` מביאה ממתין לה דרך כאן
       במקום לנחש זמן בשעון. ר' ההסבר המלא למעלה. */
    homeExtrasWhenSettled: homeExtrasWhenSettled,
    markTourSeen: function (version, cb) { CBA.sheets.postRead("markTourSeen", { version: version }, cb); },
    listEmailSettings: function (cb) { CBA.sheets.get({ action: "listEmailSettings" }, cb); },
    saveEmailSetting: function (key, fields, cb) {
      CBA.sheets.postRead("saveEmailSetting", { key: key, fields: fields }, cb);
    },

    /* "שירותים לתושב" (2026-08-18) — ר' services.js/servicesAdmin.js.
       אותו דפוס מטמון בדיוק כמו getCommitteeTree למעלה: רשימת השירותים
       משתנה נדיר מאוד (כמה פעמים בשנה), אז נטענת פעם אחת לכניסה ונשמרת —
       חזרה למסך היא מיידית בלי נסיעת רשת נוספת. כל שמירה של מנהל-על
       מנקה את המטמון כדי שהקריאה הבאה תביא גרסה טרייה.
       השרת מחזיר את שני הטאבים יחד (services + sections), ולכן גם המטמון
       מחזיק את שניהם — אין מצב שבו הכרטיסים טריים והסעיפים ישנים. */
    getServices: getServices,
    saveServices: saveServices,
    /* עדכון תושבים במייל — ידני בלבד, נשלח רק בלחיצה מפורשת של מנהל-על
       (ר' notifyServiceUpdate_ ב-Code.gs). לא מנקה מטמון: הוא לא משנה נתונים. */
    notifyServiceUpdate: function (payload, cb) {
      CBA.sheets.postRead("notifyServiceUpdate", payload || {}, cb);
    },
    /* מילוי אוטומטי ממסמך (Gemini) — לא שומר כלום, רק מחזיר סעיפים מוצעים
       לעריכה בעורך הפתוח, בדיוק כמו scanReceipt. */
    scanServiceDoc: function (dataBase64, mimeType, cb) {
      CBA.sheets.postRead("scanServiceDoc", { dataBase64: dataBase64, mimeType: mimeType }, cb);
    }
  };
})();

/* עוזרי "עץ ועד השיכון" (2026-08-10) — לוגיקת מבנה-הנתונים המשותפת בין
   תצוגת הקריאה (resCommittee, אזור תושב, כל תושב) לתצוגת הניהול/עריכה
   (committeeAdmin, אזור ניהול, מנהל-על בלבד — ר' residents.js). חיה כאן
   ולא בתוך אחד ממסכי המסך, כדי ששני הצדדים ישתמשו באותה לוגיקה בדיוק
   ולא ייסחפו זה מזה עם הזמן. פונקציות טהורות — לא נוגעות ב-DOM. */
CBA.committee = (function () {
  "use strict";
  // קטגוריות (2026-08-10): הפכו מרשימה קבועה בקוד לרשימה ניתנת-לעריכה
  // שנטענת מהשרת (טאב "קטגוריות ועד השיכון" — ר' CBA.data.getCommitteeCategories),
  // כדי שמנהל-על יוכל להוסיף קטגוריה חדשה עם צבע משלה ישירות מטופס עריכת
  // התפקיד, לא רק לבחור מתוך רשימה קבועה מראש. יש לקרוא ל-loadCategories
  // (עם callback) לפני שמשתמשים ב-catInfo/catsList בתוך render — אותו דפוס
  // בדיוק כמו טעינת rowsCache לפני buildBoxes.
  var DEFAULT_COLOR = "#111827";
  var catsCache = null; // מערך {name,color} אחרי טעינה מוצלחת; null=עוד לא נטען

  function normalizeCat(r) {
    return { name: String(r["שם"] || "").trim(), color: String(r["צבע"] || "").trim() || DEFAULT_COLOR };
  }
  function loadCategories(cb) {
    if (catsCache) { if (cb) cb(catsCache); return; }
    CBA.data.getCommitteeCategories(function (res) {
      catsCache = (res && res.ok && res.rows) ? res.rows.map(normalizeCat) : [];
      if (cb) cb(catsCache);
    });
  }
  function catsList() { return catsCache || []; }
  // פרטי קטגוריה בודדת לפי שם — נופל חזרה לקטגוריה הראשונה הטעונה (אם יש)
  // או לצבע ברירת מחדל אם עוד לא נטען כלום (למשל אם loadCategories לא נקרא).
  function catInfo(name) {
    var list = catsCache || [];
    for (var i = 0; i < list.length; i++) if (list[i].name === name) return list[i];
    return list[0] || { name: name || "", color: DEFAULT_COLOR };
  }
  // הוספת קטגוריה חדשה (מנהל-על בלבד בפועל — נאכף בשרת, ר' ACTION_PERMS).
  // שומרת את כל הרשימה כולל החדשה (כמו saveCommitteeCategories_ ב-Code.gs)
  // ומעדכנת את המטמון המקומי מיד עם הצלחה, כדי שהתפריט יתעדכן בלי טעינה נוספת.
  function addCategory(name, color, cb) {
    name = String(name || "").trim();
    if (!name) { if (cb) cb({ ok: false, error: "צריך שם קטגוריה" }); return; }
    var list = (catsCache || []).slice();
    if (list.some(function (c) { return c.name === name; })) {
      if (cb) cb({ ok: false, error: 'קטגוריה בשם "' + name + '" כבר קיימת' });
      return;
    }
    list.push({ name: name, color: color || DEFAULT_COLOR });
    var rows = list.map(function (c) { return { "שם": c.name, "צבע": c.color }; });
    // (2026-08-18, ממצא 4.4) זו הייתה הכתיבה היחידה באפליקציה בלי שום הגנה:
    // בלי markDirty רענון רקע יכול היה לרוץ באמצע, ובלי חיווי "שומר…" הכפתור
    // פשוט "נתקע" לרגע בלי שהמשתמש יבין מה קורה.
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("committeeCatSave");
    CBA.data.saveCommitteeCategories(rows, function (res) {
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("committeeCatSave");
      if (res && res.ok) catsCache = list;
      if (cb) cb(res);
    });
  }
  // הופך שורות שטוחות מהשרת (שורה = אדם אחד) למבנה תאים: מקבץ לפי "מזהה תא"
  // (כמה שורות עם אותו מזהה = כמה אנשים באותו תפקיד), ושומר את אינדקס
  // ההופעה הראשון של כל תא כדי לשמר את סדר הגיליון בתצוגה (אין עמודת "סדר").
  function buildBoxes(rows) {
    var byId = {}, order = [];
    (rows || []).forEach(function (r, i) {
      var id = String(r["מזהה תא"] || "").trim();
      if (!id) return;
      if (!byId[id]) {
        byId[id] = {
          id: id,
          parent: String(r["הורה"] || "").trim(),
          role: String(r["תפקיד"] || "").trim(),
          category: String(r["קטגוריה"] || "").trim(),
          people: [],
          idx: i
        };
        order.push(byId[id]);
      }
      var name = String(r["שם"] || "").trim();
      if (name) {
        var rid = r["מזהה תושב"];
        byId[id].people.push({ name: name, rid: (rid == null ? "" : String(rid)) });
      }
    });
    return order;
  }
  // כל צאצאי תא נתון (בכל עומק) — כדי לחסום בחירת "הורה" חדש שהוא בעצם
  // צאצא של התא הנערך (היה יוצר מעגל בעץ). רלוונטי רק לצד העריכה.
  function descendantIds(boxes, id) {
    var out = {}, stack = [id];
    while (stack.length) {
      var cur = stack.pop();
      boxes.forEach(function (b) {
        if (b.parent === cur && !out[b.id]) { out[b.id] = true; stack.push(b.id); }
      });
    }
    return out;
  }
  /* ---------- זום/התאמה-למסך לעץ הוועד (2026-08-18, ממצא 3.6 בדו"ח) ----------
     נמדד: ברוחב מסך 1440px הקנבס של העץ הוא 1743px מול 1412px גלויים, והוא
     נפתח כשהוא גלול לאמצע — 7 מתוך 29 הקוביות חתוכות *בשני* הקצוות בו-זמנית
     (ביניהן "גזבר"), ואפילו לא ברור לאיזה כיוון לגלול. במפה כבר קיים בדיוק
     הפתרון (זום + "התאמה למסך"), אז אותו רעיון מובא לכאן. יושב ב-CBA.committee
     ולא בשני המסכים בנפרד — resCommittee (תצוגה) ו-committeeAdmin (ניהול)
     מציירים את אותו עץ, ואין סיבה שיחזיקו שני עותקים של אותה מתמטיקה.
     transform:scale לא משנה פריסה, ולכן הקנבס נעטף ב"סרגל גודל" שרוחבו וגובהו
     הם המידות *אחרי* ההקטנה — כך הגלילה תמיד מדויקת בדיוק כמה שצריך. */
  function attachOrgZoom(wrap, canvas, toolbarHost) {
    if (!wrap || !canvas) return null;
    var baseW = parseFloat(canvas.style.width) || canvas.offsetWidth || 1;
    var baseH = parseFloat(canvas.style.height) || canvas.offsetHeight || 1;

    var sizer = document.createElement("div");
    sizer.className = "org-tree-sizer";
    canvas.parentNode.insertBefore(sizer, canvas);
    sizer.appendChild(canvas);
    canvas.style.transformOrigin = "top right";   // RTL — העוגן הוא הפינה הימנית העליונה

    var MIN = 0.42, MAX = 1.6;
    var scale = 1, pctEl = null;
    function setScale(v, animated) {
      scale = Math.max(MIN, Math.min(MAX, v));
      canvas.style.transition = animated ? "transform .28s cubic-bezier(.2,.6,.2,1)" : "";
      canvas.style.transform = "scale(" + scale + ")";
      sizer.style.width = Math.round(baseW * scale) + "px";
      sizer.style.height = Math.round(baseH * scale) + "px";
      if (pctEl) pctEl.textContent = Math.round(scale * 100) + "%";
    }
    function fit(animated) {
      // clientWidth כולל ריפוד — צריך את רוחב התוכן בפועל, אחרת ההתאמה יוצאת
      // רחבה מדי בדיוק בגודל הריפוד ונשארת גלילה של כמה פיקסלים שנראית כמו באג.
      var cs = window.getComputedStyle(wrap);
      var pad = (parseFloat(cs.paddingInlineStart) || parseFloat(cs.paddingLeft) || 0) +
                (parseFloat(cs.paddingInlineEnd) || parseFloat(cs.paddingRight) || 0);
      var avail = Math.max(120, (wrap.clientWidth || baseW) - pad - 2);
      setScale(Math.min(1, avail / baseW), animated);
      wrap.scrollLeft = 0;
    }
    if (toolbarHost) {
      /* חיפוש בעץ (2026-08-19, ממצא 3.11 בדו"ח) — העץ היה "תמונה סטטית": 29
         תפקידים היום, וזה רק יגדל, בלי שום דרך למצוא תפקיד או אדם חוץ מלסרוק
         בעיניים. מדגיש את ההתאמות ומעמעם את השאר, וגולל לראשונה שנמצאה.
         (הרעיון המקורי בדו"ח היה לקשר כל אדם לכרטיס התושב שלו, אבל עמודת
         "מזהה תושב" בטאב העץ ריקה כמעט לגמרי בפועל — אז זה ייתן ערך רק אחרי
         שהיא תמולא. חיפוש עובד כבר עכשיו, בלי תלות בנתונים.) */
      var searchWrap = document.createElement("div");
      searchWrap.className = "org-search";
      searchWrap.innerHTML = '<input type="search" class="org-search__input" placeholder="חיפוש תפקיד או שם…" aria-label="חיפוש בעץ הוועד">';
      toolbarHost.appendChild(searchWrap);
      var searchInput = searchWrap.querySelector("input");
      searchInput.addEventListener("input", function () {
        var q = searchInput.value.trim();
        var nodes = canvas.querySelectorAll(".org-tree-node");
        if (!q) {
          Array.prototype.forEach.call(nodes, function (n) { n.classList.remove("is-dim", "is-hit"); });
          return;
        }
        var first = null;
        Array.prototype.forEach.call(nodes, function (n) {
          var hit = (n.textContent || "").indexOf(q) !== -1;
          n.classList.toggle("is-hit", hit);
          n.classList.toggle("is-dim", !hit);
          if (hit && !first) first = n;
        });
        if (first && first.scrollIntoView) first.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
      });

      var bar = document.createElement("div");
      bar.className = "org-zoom";
      bar.innerHTML =
        '<button type="button" class="org-zoom__btn" data-org-zoom="out" aria-label="הקטנה" title="הקטנה">–</button>' +
        '<span class="org-zoom__pct" aria-live="polite">100%</span>' +
        '<button type="button" class="org-zoom__btn" data-org-zoom="in" aria-label="הגדלה" title="הגדלה">+</button>' +
        '<button type="button" class="org-zoom__btn org-zoom__btn--fit" data-org-zoom="fit" title="התאמה למסך">התאמה למסך</button>';
      toolbarHost.appendChild(bar);
      pctEl = bar.querySelector(".org-zoom__pct");
      bar.addEventListener("click", function (e) {
        var b = e.target.closest("[data-org-zoom]");
        if (!b) return;
        var a = b.dataset.orgZoom;
        if (a === "in") setScale(scale * 1.2, true);
        else if (a === "out") setScale(scale / 1.2, true);
        else fit(true);
      });
    }
    fit(false);
    return { fit: fit, setScale: setScale };
  }

  /* מקרא הקטגוריות (2026-08-18, ממצא 3.9) — פס הצבע על ראש כל קוביה לא אמר
     כלום: שם הקטגוריה הופיע רק כ-tooltip בריחוף, כלומר במובייל בכלל לא. */
  function legendHTML() {
    var cats = catsList();
    if (!cats.length) return "";
    return '<div class="org-legend">' + cats.map(function (c) {
      return '<span class="org-legend__item"><i style="background:' + CBA.esc(c.color) + '"></i>' + CBA.esc(c.name) + '</span>';
    }).join("") + '</div>';
  }

  return {
    loadCategories: loadCategories, catsList: catsList, catInfo: catInfo, addCategory: addCategory,
    buildBoxes: buildBoxes, descendantIds: descendantIds,
    attachOrgZoom: attachOrgZoom, legendHTML: legendHTML
  };
})();

/* עוזר עיצוב מספרים: 36000 -> "₪36,000". גלובלי לכל המסכים. */
CBA.formatILS = function (n) {
  const rounded = Math.round(n);
  return "₪" + rounded.toLocaleString("he-IL");
};

/* "בריחה" של טקסט לפני הכנסה ל-HTML — מונע שבירה כשיש גרשיים/סימנים בשם */
CBA.esc = function (s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (ch) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
};
