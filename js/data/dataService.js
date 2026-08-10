/* dataService.js — שכבת הנתונים המרכזית.
   כל המסכים פונים רק לכאן, אף פעם לא ישירות ל-mock.
   ביום שנתחבר ל-Google Sheets, נשנה רק את הקובץ הזה — והמסכים לא ידעו בכלל.

   כלל חישוב הביצוע: הוצאה נספרת כ"בוצעה" רק אם הסטטוס שלה
   "שולם" (paid) או "אושר" (approved). "ממתין"/"נדחה" לא נספרים. */

window.CBA = window.CBA || {};

CBA.data = (function () {
  "use strict";

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
    const all = getTransactions();
    let pendingExpenses = 0, reviewExpenses = 0;
    all.forEach(function (t) {
      if (t.status === "submitted") pendingExpenses++;
      else if (t.status === "review") reviewExpenses++;
    });
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

  // שם הסעיף לפי מזהה
  function categoryName(catId) {
    const c = CBA.mock.categories.find(function (x) { return x.id === catId; });
    return c ? c.name : "—";
  }

  // --- פעולות על תנועות (הוספה/עריכה/מחיקה) — מסונכרנות לגיליון כשמחוברים ---
  function pushConnected() { return CBA.sheets && CBA.sheets.push && CBA.mock._source === "sheets"; }
  function syncTx(t) {
    if (!pushConnected()) return;
    const payload = Object.assign({}, t, { fileName: receiptFileName(t) });
    CBA.sheets.push("saveTransaction", { year: t.year || getCurrentYear(), tx: payload });
  }
  function addTransaction(tx) {
    const seq = CBA.mock.transactions.reduce(function (m, t) { return Math.max(m, t.id || 0); }, 0) + 1;
    const row = Object.assign({ id: seq, source: "admin", status: "submitted", year: getCurrentYear() }, tx);
    CBA.mock.transactions.push(row);
    syncTx(row);
    return row;
  }
  function updateTransaction(id, fields) {
    const t = CBA.mock.transactions.find(function (x) { return x.id === id; });
    if (t) { Object.assign(t, fields); syncTx(t); }
    return t;
  }
  function deleteTransaction(id) {
    const t = CBA.mock.transactions.find(function (x) { return x.id === id; });
    const yr = t && t.year;
    CBA.mock.transactions = CBA.mock.transactions.filter(function (x) { return x.id !== id; });
    if (pushConnected()) CBA.sheets.push("deleteTransaction", { year: yr || getCurrentYear(), id: id });
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
    const groupName = function (id) { const g = CBA.mock.groups.find(function (x) { return x.id === id; }); return g ? g.name : (id || ""); };
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
        // (בשונה מ-sources, גם פריט יחיד תקף — ר' normalizeCategory).
        items: (c.items && c.items.length)
          ? c.items.map(function (it) { return { name: it.name, plan: Number(it.plan) || 0 }; })
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
    const groups = getGroups().map(function (g) { return g.name; });
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
    CBA.sheets.push("saveNotes", { year: year, content: content, editedBy: editedBy || "" }, cb);
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
  function submitReceipt(fields, cb, onProgress) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    const year = getCurrentYear();
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
  // --- ניהול אישורי שריון (מסך המנהל) — הסיסמה מצורפת אוטומטית ע"י CBA.sheets.get ---
  function getClubList(cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "clubList" }, cb);
  }
  function approveClubReservation(id, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "approveClubReservation", id: id }, cb);
  }
  function rejectClubReservation(id, cb) {
    if (!pushConnected()) { if (cb) cb({ ok: false, error: "לא מחובר לגיליון" }); return; }
    CBA.sheets.get({ action: "rejectClubReservation", id: id }, cb);
  }
   
  // --- רשימת התושבים (טאב "תושבים" המלא, כולל PII) — מוגן בסיסמת מנהל בשרת,
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
  function saveCommitteeCategories(rows, cb) {
    CBA.sheets.postRead("saveCommitteeCategories", { rows: rows }, function (res) {
      if (res && res.ok) committeeCatsCache = null;
      if (cb) cb(res);
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
  const FISCAL_KEYS = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02",
                       "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  function getFiscalMonths() {
    const labels = getMonthLabels();
    return FISCAL_KEYS.map(function (k, i) { return { key: k, label: labels[i], index: i }; });
  }
  function currentFiscalIndex() {
    const today = new Date().toISOString().slice(0, 7);
    const i = FISCAL_KEYS.indexOf(today);
    return i < 0 ? FISCAL_KEYS.length - 1 : i;
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
    const keys = FISCAL_KEYS.slice(0, asOf + 1);
    return getTransactions().filter(function (t) {
      return t.categoryId === c.id && SPENT_STATUSES.indexOf(t.status) !== -1 && keys.indexOf(t.month) !== -1;
    }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
  }
  // שורות תקציב "נכון לחודש X" — צפי מול ביצוע עד אותו חודש
  function getBudgetRowsAsOf(asOf) {
    const monthKeys = FISCAL_KEYS.slice(0, asOf + 1);
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
    const monthly = getCategories().map(categoryMonthly);
    const plan = [], actual = [];
    let cp = 0, ca = 0;
    for (let i = 0; i < 12; i++) {
      cp += monthly.reduce(function (s, arr) { return s + arr[i]; }, 0);
      ca += getTransactions().filter(function (t) {
        return SPENT_STATUSES.indexOf(t.status) !== -1 && t.month === FISCAL_KEYS[i];
      }).reduce(function (s, t) { return s + (t.amount || 0); }, 0);
      plan.push(cp); actual.push(ca);
    }
    return { labels: getFiscalMonths().map(function (m) { return m.label; }), plan: plan, actual: actual };
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
  function setCurrentYear(y) {
    if (CBA.mock.years[y]) CBA.mock.currentYear = y;
    return CBA.mock.currentYear;
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
    if (!c.incomeSourceId) c.incomeSourceId = "dues";
    // פיצול בין כמה מקורות הכנסה (סעיף 4, 2026-08-10) — c.sources תקף רק כשיש
    // בו 2+ שורות (זו ההגדרה של "סעיף מפוצל"); מערך עם 0/1 שורות מתקפל בחזרה
    // למקור יחיד (incomeSourceId), כדי שלא יישאר "פיצול" שקוף עם שורה אחת בלבד.
    // incomeSourceId תמיד נשאר מסונכרן עם השורה הראשונה בפיצול — משמש כברירת
    // מחדל/תאימות לאחור לכל קוד שעדיין לא יודע להסתכל על sources (למשל שרת ישן).
    if (c.sources && c.sources.length > 1) {
      c.sources = c.sources.map(function (s) {
        return { incomeSourceId: s.incomeSourceId || "dues", amount: Number(s.amount) || 0 };
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
    const c = normalizeCategory(Object.assign(
      { id: newId("cat"), name: "סעיף חדש", plan: 0, group: "misc" }, fields || {}));
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
          const sid = s.incomeSourceId || "dues";
          alloc[sid] = (alloc[sid] || 0) + (Number(s.amount) || 0);
        });
        return;
      }
      const sid = c.incomeSourceId || "dues";
      alloc[sid] = (alloc[sid] || 0) + (c.plan || 0);
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

  return {
    getMonthLabels: getMonthLabels,
    getGroups: getGroups,
    getCategories: getCategories,
    getTransactions: getTransactions,
    categoryName: categoryName,
    addTransaction: addTransaction,
    updateTransaction: updateTransaction,
    deleteTransaction: deleteTransaction,
    uploadReceiptFile: uploadReceiptFile,
    deleteReceiptFile: deleteReceiptFile,
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
    approveClubReservation: approveClubReservation,
    rejectClubReservation: rejectClubReservation,
    getResidents: getResidents,
    refreshResidents: function (cb) { residentsCache = null; directoryCache = null; communityCache = null; getResidents(cb); },
    residentPickerOptions: residentPickerOptions,
    getCommunityDirectory: getCommunityDirectory,
    getCommitteeTree: getCommitteeTree,
    saveCommitteeTree: saveCommitteeTree,
    getCommitteeCategories: getCommitteeCategories,
    saveCommitteeCategories: saveCommitteeCategories,
    // בקשות הרשמה וניהול תושבים (2026-08-07)
    listSignups: function (cb) { CBA.sheets.get({ action: "listSignups" }, cb); },
    approveSignup: function (payload, cb) { CBA.sheets.postRead("approveSignup", payload, cb); },
    rejectSignup: function (id, cb) { CBA.sheets.postRead("rejectSignup", { id: id }, cb); },
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
    getYears: getYears,
    getCurrentYear: getCurrentYear,
    setCurrentYear: setCurrentYear,
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
    logBudgetUpdate: logBudgetUpdate
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
    CBA.data.saveCommitteeCategories(rows, function (res) {
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
  return {
    loadCategories: loadCategories, catsList: catsList, catInfo: catInfo, addCategory: addCategory,
    buildBoxes: buildBoxes, descendantIds: descendantIds
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
