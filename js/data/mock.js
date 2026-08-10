/* mock.js — נתוני דמה (Mock) רב־שנתיים לשלב הפיתוח.
   המבנה: מאגר לפי שנים (years), כל שנה מחזיקה income / categories / transactions / budget.
   קבוצות (groups) משותפות לכל השנים.

   טריק תאימות: מוגדרות תכונות גישה (accessor) ל-categories/income/transactions/budget
   שמצביעות תמיד על השנה הנוכחית (currentYear) — כך שכל המסכים ושכבת הנתונים
   ממשיכים לעבוד בדיוק כמו קודם, ורואים אוטומטית את השנה הפעילה.

   כשנתחבר ל-Google Sheets נחליף רק את המקור — כל שנה = שלושת הטאבים שלה. */

window.CBA = window.CBA || {};

CBA.mock = (function () {
  "use strict";

  // --- קבוצות־על (משותפות לכל השנים) ---
  const groups = [
    { id: "gardening", name: "גינון" },
    { id: "infra",     name: "תשתיות" },
    { id: "projects",  name: "פרויקטים" },
    { id: "culture",   name: "תרבות" },
    { id: "misc",      name: "שונות" }
  ];

  // מאפייני סעיף קבועים (שם, קבוצה, מקור מימון, מצב חלוקה) — התכנון (plan) משתנה בין שנים
  const CAT_META = {
    gardener_salary: { name: "שכר גנן",              group: "gardening", src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    gardener_extra:  { name: "חריגים גנן",           group: "misc",      src: "dues", dist: { mode: "unplanned", months: 12, monthly: null } },
    safety:          { name: "בטיחות ותברואה",       group: "infra",     src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    kids_culture:    { name: "תרבות ילדים",          group: "culture",   src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    adults_culture:  { name: "תרבות מבוגרים",        group: "culture",   src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    community:       { name: "ועדת קהילה",           group: "culture",   src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    construction:    { name: "בינוי ותשתיות",        group: "infra",     src: "tbr",  dist: { mode: "custom",    months: 12, monthly: [0,0,52455,11881,0,6372,0,0,0,0,4292,0] } },
    chair_gifts:     { name: 'יו"ר מתנות ושונות',    group: "misc",      src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    club_operator:   { name: "מועדון ילדים מפעיל",   group: "projects",  src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    club_running:    { name: "מועדון ילדים שוטף",    group: "projects",  src: "dues", dist: { mode: "equal",     months: 12, monthly: null } },
    club_internet:   { name: "מועדון ילדים אינטרנט", group: "projects",  src: "dues", dist: { mode: "equal",     months: 10, monthly: null } },
    other:           { name: "אחר",                  group: "misc",      src: "dues", dist: { mode: "unplanned", months: 12, monthly: null } },
    debt_repayment:  { name: "החזר חובות",           group: "misc",      src: "dues", dist: { mode: "unplanned", months: 12, monthly: null } }
  };

  // בונה סעיף חדש (עותק עצמאי) מתוך המאפיינים + תכנון שנתי
  function cat(id, plan) {
    const m = CAT_META[id];
    return {
      id: id, name: m.name, plan: plan, group: m.group, incomeSourceId: m.src,
      dist: { mode: m.dist.mode, months: m.dist.months, monthly: m.dist.monthly ? m.dist.monthly.slice() : null }
    };
  }
  function catsFor(plans) { return Object.keys(plans).map(function (id) { return cat(id, plans[id]); }); }

  // מקורות הכנסה לשנה (מיסי שיכון מחושב לפי תעריף; תב"ר וקופת תושבים משתנים בין שנים)
  function income(rate, tbr, residents) {
    return [
      { id: "dues",           name: "מיסי שיכון",          type: "dues",  families: 71, rate: rate, months: 11, tailFamilies: 51, tailMonths: 1 },
      { id: "council",        name: "תקציב קהילה מהמועצה", type: "fixed", amount: 55000 },
      { id: "tbr",            name: 'תב"ר',                type: "fixed", amount: tbr },
      { id: "residents_fund", name: "קופת תושבים",         type: "fixed", amount: residents },
      { id: "shikun_fund",    name: "קרן שיכון",           type: "fixed", amount: 0 }
    ];
  }

  // תכנון שנתי לכל שנה
  const plans_86 = { gardener_salary:432000, gardener_extra:5000, safety:10000, kids_culture:55000, adults_culture:55000, community:6000, construction:75000, chair_gifts:6000, club_operator:61000, club_running:1800, club_internet:1024, other:0 };
  const plans_87 = { gardener_salary:432000, gardener_extra:5000, safety:10000, kids_culture:80000, adults_culture:80000, community:12000, construction:100000, chair_gifts:8000, club_operator:61000, club_running:1800, club_internet:1024, other:0, debt_repayment:40000 };

  // --- תנועות לדוגמה לשנת תשפ"ו (מבוססות נתונים אמיתיים; מדגם מייצג) ---
  let seq = 0;
  const tx = [];
  function add(month, date, buyer, supplier, amount, cat, desc, source, status, etype) {
    etype = etype || (source === "resident" ? "refund" : "supplier");
    tx.push({
      id: ++seq, month: month, date: date, buyer: buyer, supplier: supplier,
      amount: amount, categoryId: cat, description: desc,
      source: source || "admin", status: status || "paid",
      expenseType: etype, payType: (etype === "refund" ? "refund" : "supplier"),
      year: 'תשפ"ו', bankName: "", bankBranch: "", bankAccount: "", receiptUrl: ""
    });
  }
  // שכר גנן — הוצאה כללית/קבועה, 10 חודשים
  ["2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05","2026-06"].forEach(function (m, i) {
    add(m, m + "-14", "מאי שמילוביץ", "אביתר נגר", i === 8 ? 37179 : 36000, "gardener_salary", "משכורת חודשית", "admin", "paid", "general");
  });
  add("2025-09","2025-08-22","שיינה","יעקב קסלר",420,"club_running","הדברה מועדון ילדים","admin","paid","supplier");
  add("2025-09","2025-08-26","סטולרו","אי וי סול אנרגיה",945.18,"other","דמי מנוי עמדות הטענה","admin","paid","supplier");
  add("2025-09","2025-09-04","יונתן אריאל","החזר לדייר יונתן אריאל",192,"kids_culture","אירוע פתיחת שנה","resident","paid","refund");
  add("2025-10","2025-10-20","עדי מנדל","החזר לדייר עדי מנדל",645,"adults_culture","פתיחת שנה מבוגרים","resident","paid","refund");
  add("2025-11","2025-11-19","עדי אברוצקי","אקזיט מותגים",13350.17,"construction","דק לוויוורק","admin","paid","supplier");
  add("2025-12","2025-12-10","עדי אופיר","יוסי עובד מועדון",9373.5,"club_operator","תשלום ליוסי","admin","paid","supplier");
  add("2026-02","2026-02-13","מאי שמילוביץ","אביתר נגר",5515,"safety","גיזום + טריף","admin","paid","supplier");
  add("2026-03","2026-02-26","מורן ממן","החזר לדייר מורן ממן",1547,"community","בריכת כדורים","resident","paid","refund");
  add("2026-04","2026-04-15","זוהר פרבר","הפעלה",6915,"community","יום קהילה","admin","ready","supplier");
  add("2026-05","2026-04-21","מורן","מיוחד מהמטבח",25600,"adults_culture","קייטרינג עצמאות","admin","paid","supplier");
  add("2026-06","2026-06-01","נתי פרבר","שי מתנדבים",2360,"chair_gifts","מתנות","admin","submitted","supplier");
  add("2026-07","2026-07-02","עדי","החזר לדייר עדי אברוצקי",2301,"chair_gifts","מתנות למשתכנים","resident","submitted","refund");
  // בנק לדוגמה על תנועת ספק
  const supTx = tx.find(function (t) { return t.supplier === "אקזיט מותגים"; });
  if (supTx) { supTx.bankName = "12"; supTx.bankBranch = "768"; supTx.bankAccount = "521548"; }
  // קבלה ממתינה לדוגמה
  tx.filter(function (t) { return t.status === "submitted" && t.source === "resident"; })
    .forEach(function (t) { t.receiptUrl = "#receipt-" + t.id; });

  // עותק עצמאי (לא רפרנס משותף) של רשימת הקבוצות — לשימוש כברירת מחדל של כל
  // שנת דמו. כל שנה מקבלת מערך עצמאי משלה (אובייקטים עצמם משוכפלים, לא רק
  // המערך) כדי ששינוי בקבוצה של שנה אחת לעולם לא ישפיע על שנה אחרת (סעיף 3,
  // 2026-08-09 — קבוצות פר-שנה. עד עכשיו groups היה משותף לכל השנים בכוונה;
  // יועד ביקש לשנות את זה).
  function cloneGroups() { return groups.map(function (g) { return Object.assign({}, g); }); }

  // --- מאגר השנים ---
  const years = {
    'תשפ"ו': {
      income: income(690, 90000, 10000),
      categories: catsFor(plans_86),
      transactions: tx,
      budget: { phase: "locked", lockedAt: "2025-09-01", baseline: null },
      notes: { content: "", editedBy: "", editedAt: "" },
      groups: cloneGroups()
    },
    'תשפ"ז': {
      income: income(790, 100000, 5000),
      categories: catsFor(plans_87),
      transactions: [],
      budget: { phase: "draft", lockedAt: null, baseline: null },
      notes: { content: "", editedBy: "", editedAt: "" },
      groups: cloneGroups()
    }
  };

  return {
    years: years,
    yearList: ['תשפ"ו', 'תשפ"ז'],
    currentYear: 'תשפ"ו',
    budgetUpdates: [],
    // יומן עריכות פנקס ההערות (סעיף 1, 2026-08-09) — כרונולוגי, כל השנים
    // ביחד (מסוננן לפי שנה בתצוגה, בדיוק כמו budgetUpdates).
    notesLog: []
  };
})();

/* תכונות גישה (accessor) — categories/income/transactions/budget/notes/groups
   של השנה הנוכחית. בזכותן שכבת הנתונים והמסכים לא צריכים לדעת בכלל שיש כמה
   שנים. groups הצטרפה לרשימה בסעיף 3 (2026-08-09) — עד אז הייתה property
   שטוחה ומשותפת לכל השנים; ר' ההסבר ליד cloneGroups למעלה. */
["categories", "income", "transactions", "budget", "notes", "groups"].forEach(function (k) {
  Object.defineProperty(CBA.mock, k, {
    get: function () { return CBA.mock.years[CBA.mock.currentYear][k]; },
    set: function (v) { CBA.mock.years[CBA.mock.currentYear][k] = v; },
    configurable: true
  });
});

/* history = כל השנים מלבד הנוכחית — משמש את תכונת "השוואה לשנה קודמת" */
Object.defineProperty(CBA.mock, "history", {
  get: function () {
    const h = {};
    Object.keys(CBA.mock.years).forEach(function (y) {
      if (y === CBA.mock.currentYear) return;
      h[y] = CBA.mock.years[y].categories.map(function (c) { return { id: c.id, name: c.name, plan: c.plan }; });
    });
    return h;
  },
  configurable: true
});
