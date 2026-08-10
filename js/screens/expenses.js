/* מסך "ניהול הוצאות" — ספר ההוצאות השוטף.
   סרגל דביק (סינון + חיפוש + סיכום + הוספה), טבלה עם מיון לפי כל עמודה,
   זרימת סטטוסים (הוגשה→אושר→הועבר להנה"ח→שולם), ו-drawer־טופס להוספה/עריכה
   הכולל: סוג תשלום (החזר לדייר / תשלום לספק) + פרטי בנק, כפתור העתקת שם קובץ,
   כפתור סריקת AI (בשלב זה placeholder), ותצוגה מקדימה של הקבלה. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

var txFilters = { year: "", month: "", category: "", status: "", source: "", type: "", search: "" };
// ברירת מחדל: לפי חודש הגשה (החדש ביותר למעלה), ובתוך אותו חודש — מהחדש לישן
// (ראה טיפול מיוחד ב-txSortRows). לחיצה על כותרת עמודה אחרת עדיין ממיינת לפי
// אותה עמודה בלבד, כרגיל.
var txSort = { col: "month", dir: -1 };
var txView = "all";      // תצוגה: all | pending | gardening | over | c:<id>
var txSelected = {};     // מזהי שורות שנבחרו לפעולה גורפת
var txCustomViews = [];  // תצוגות שמורות מותאמות אישית (סינון שמור)
var txViewSeq = 0;
var txPresetCategory = null;  // סעיף שנבחר מראש (כשמגיעים מהחלקה על כרטיס תקציב)
var txFiltersOpen = false;    // האם גיליון הסינון התחתון (מובייל) פתוח
var txScrollTop = 0;          // מיקום גלילה בתוך רשימת הטבלה, נשמר בין רינדורים
var txWinScrollY = 0;         // מיקום גלילת העמוד (מובייל — הרשימה לא גוללת בנפרד)

// אייקון "יש הערה" קטן — מוצג ליד תגית הסטטוס כשיש הערת בדיקה (tooltip מציג את הטקסט)
var TX_NOTE_ICO = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v12H8l-4 4V4z"/><path d="M8 8h8M8 11h5"/></svg>';

// אייקון "תצוגה מקדימה" (עין) — מוצג בשורה רק כשיש קבלה מצורפת (2026-08-06)
var TX_PEEK_ICO = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 12S5 5.5 12 5.5 22.5 12 22.5 12 19 18.5 12 18.5 1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/></svg>';

// עמודות תקניות "הניתנות להסתרה/שינוי שם" דרך "ניהול עמודות" (סעיף 6, 2026-08-06).
// width תואם בדיוק לרוחב הקבוע בעבר ב-css (.tx-head, .tx-row) — עכשיו הרוחב
// מחושב דינמית (ר' txGridColsCss) כדי לתמוך בהסתרה/הוספת עמודות מותאמות אישית.
// סטטוס+פעולות נשארים קבועים בסוף השורה תמיד, לא חלק מהרשימה הזו (ר' txRowHTML).
var TX_STD_COLS = [
  { key: "month",    label: "חודש הגשה",   width: "72px",  get: function (t) { return t.month || ""; } },
  { key: "date",     label: "תאריך רכישה", width: "90px",  get: function (t) { return t.date || ""; } },
  // רוחבי רוכש/סעיף צומצמו (2026-08-06) כדי לפנות מקום לכפתורי הפעולות משמאל
  { key: "buyer",    label: "רוכש",        width: "0.8fr", get: function (t) { return t.buyer || ""; } },
  { key: "supplier", label: "ספק / נמען",  width: "1.1fr", get: function (t) { return t.supplier || ""; } },
  // תיאור ההוצאה — בין הספק לסעיף התקציבי (לבקשת יועד, 2026-08-06). הערך כבר
  // נקרא מעמודת "תיאור" בגיליון (ר' toTx ב-sheets.js), פשוט לא הוצג עד עכשיו.
  { key: "description", label: "תיאור",    width: "1.3fr", get: function (t) { return t.description || ""; } },
  { key: "category", label: "סעיף",        width: "0.8fr", get: function (t) { return CBA.data.categoryName(t.categoryId); } },
  { key: "amount",   label: "סכום",        width: "100px", get: function (t) { return t.amount || 0; } }
];
// כל העמודות (כולל סטטוס) — משמש רק לחיפוש עמודת המיון הנוכחית (txSortRows),
// לא לרינדור (סטטוס מרונדר בנפרד, קבוע, ר' txRowHTML).
var TX_COLS = TX_STD_COLS.concat([{ key: "status", label: "סטטוס", get: function (t) { return t.status || ""; } }]);

function txColumnConfig() { return (CBA.data && CBA.data.getColumnConfig && CBA.data.getColumnConfig()) || { hidden: [], labels: {}, custom: [] }; }
function txHiddenStdCols() { return txColumnConfig().hidden || []; }
function txCustomCols() { return txColumnConfig().custom || []; }
function txColLabel(c) { return (txColumnConfig().labels || {})[c.key] || c.label; }
function txVisibleStdCols() {
  var hidden = txHiddenStdCols();
  return TX_STD_COLS.filter(function (c) { return hidden.indexOf(c.key) === -1; });
}
function txVisibleCustomCols() {
  var hidden = txHiddenStdCols();
  return txCustomCols().filter(function (c) { return hidden.indexOf(c.key) === -1; });
}
// --tx-cols דינמי: 32px (צ'קבוקס) + 30px (תצוגה מקדימה של קבלה) + עמודות תקניות
// גלויות + עמודות מותאמות (כולן 1fr) + 168px (סטטוס, קבוע) + 250px (פעולות, קבוע).
function txGridColsCss() {
  var mid = txVisibleStdCols().map(function (c) { return c.width; })
    .concat(txVisibleCustomCols().map(function () { return "1fr"; }));
  return "32px 30px " + mid.join(" ") + (mid.length ? " " : "") + "142px 196px";
}

CBA.screens.expenses = {
  title: "ניהול הוצאות",

  render(container) {
    // נשמר לפני שה-innerHTML נדרס, ומוחזר בסוף (ר' ההערה למטה)
    const prevList = container.querySelector(".tx-list");
    if (prevList) txScrollTop = prevList.scrollTop;
    txWinScrollY = window.scrollY || 0;

    const all = CBA.data.getTransactions();
    const rows = txSortRows(txApplyFilters(all));
    const total = rows.reduce(function (s, t) { return s + (t.amount || 0); }, 0);
    const selCount = txSelCount();
    const allChecked = rows.length > 0 && rows.every(function (t) { return txSelected[t.id]; });

    container.innerHTML = `
      <div class="tx-views">
        ${txViewTab("all", "הכל")}
        ${txViewTab("pending", "ממתינות לאישור")}
        ${txViewTab("gardening", "גינון בלבד")}
        ${txViewTab("over", "חריגות")}
        ${txCustomViews.map(txCustomTab).join("")}
        <button class="tx-view tx-view--add" data-save-view title="שמור את הסינון הנוכחי כתצוגה">+ שמור תצוגה</button>
      </div>

      <div class="tx-bar">
        <div class="tx-filters">
          <div class="tx-selects">
            <select class="year-select" data-f="year">${txYearOptions(all)}</select>
            <select class="year-select" data-f="month">${txMonthOptions(all)}</select>
            <select class="year-select" data-f="category">${txCatOptions()}</select>
            <select class="year-select" data-f="status">${txStatusOptions()}</select>
            <select class="year-select" data-f="type">${txTypeOptions()}</select>
            <select class="year-select" data-f="source">${txSourceOptions()}</select>
            <button type="button" class="btn-primary btn-sm tx-sheet-apply" data-close-filters>הצג תוצאות</button>
          </div>
          <input class="tx-search" data-f="search" placeholder="חיפוש רוכש / ספק / תיאור" value="${CBA.esc(txFilters.search)}">
          <button type="button" class="tx-filter-btn" data-open-filters aria-label="סינון">סינון</button>
        </div>
        <div class="tx-actions">
          <div class="tx-summary"><span>סה״כ מסונן</span> <b>${CBA.formatILS(total)}</b> <span class="tx-summary__count">· ${rows.length} תנועות</span></div>
          <button class="btn-ghost btn-sm" data-manage-cols title="הצג/הסתר/שנה שם עמודות, או הוסף עמודה מותאמת אישית">⚙ עמודות</button>
          <button class="btn-primary btn-sm tx-add-inline" data-add-tx>+ הוספת הוצאה</button>
        </div>
      </div>

      ${selCount ? txBulkBar(selCount) : ""}

      <div class="card tx-card" style="--tx-cols: ${txGridColsCss()}">
        <div class="tx-head">
          <div class="tx-check"><input type="checkbox" data-check-all ${allChecked ? "checked" : ""}></div>
          <div></div>
          ${txVisibleStdCols().map(function (c) { return txHeadCell({ key: c.key, label: txColLabel(c) }); }).join("")}
          ${txVisibleCustomCols().map(function (c) { return '<div class="tx-sort tx-sort--static" data-custom-col="' + CBA.esc(c.key) + '">' + CBA.esc(c.label) + '</div>'; }).join("")}
          ${txHeadCell({ key: "status", label: "סטטוס" })}
          <div></div>
        </div>
        <div class="tx-list">
          ${rows.length ? rows.map(txRowHTML).join("") : txEmptyState(all.length)}
        </div>
      </div>

      ${txMobileList(rows, all.length)}
      <button class="tx-fab" data-add-fab aria-label="הוספת הוצאה">+</button>
    `;

    // שחזור מיקום הגלילה (2026-08-06 — תיקון באג): כל פעולה בשורה מפעילה
    // render() מחדש, וה-innerHTML החדש איפס את הגלילה לראש הרשימה. מי שאישר
    // הוצאה בתחתית הטבלה "נזרק" חזרה למעלה. עכשיו המיקום נשמר ומוחזר.
    const listEl = container.querySelector(".tx-list");
    if (listEl && txScrollTop) listEl.scrollTop = txScrollTop;
    if (txWinScrollY) window.scrollTo(0, txWinScrollY);
    txScrollTop = 0; txWinScrollY = 0;

    txBind(container);
    // מעדכן מיד את פעמון ההתרעות + תגית הטאב (ולא מחכה למחזור הרענון התקופתי) —
    // render() נקרא מחדש אחרי כל פעולה במסך הזה (אישור/דחייה/לבדיקה/שמירה/מחיקה).
    if (window.CBA.refreshAlerts) window.CBA.refreshAlerts();
  }
};

/* נקודת כניסה מבחוץ: מעבר למסך ההוצאות ופתיחת טופס הוספה עם סעיף ממולא מראש.
   בשימוש ההחלקה על כרטיס תקציב במובייל ("הוסף הוצאה לסעיף זה"). */
/* מעבר מהדשבורד לתצוגת "ממתינות לאישור" */
CBA.screens.expenses.showPending = function () {
  txView = "pending"; txSelected = {};
  if (CBA.navigate) CBA.navigate("expenses");
};

CBA.screens.expenses.openAddForCategory = function (catId) {
  var container = document.getElementById("app-main");
  if (!container) return;
  if (CBA.navigate) CBA.navigate("expenses");
  txPresetCategory = catId || null;
  txOpenDrawer(container, null);
  txPresetCategory = null;
};

function txSelCount() { return Object.keys(txSelected).filter(function (k) { return txSelected[k]; }).length; }
function txViewTab(key, label) { return `<button class="tx-view${txView === key ? " is-active" : ""}" data-view="${key}">${label}</button>`; }
function txCustomTab(v) { return `<button class="tx-view${txView === "c:" + v.id ? " is-active" : ""}" data-cview="${v.id}">${CBA.esc(v.name)}<span class="tx-view__x" data-del-cview="${v.id}">×</span></button>`; }
function txBulkBar(n) {
  const catOpts = CBA.data.getCategories().map(function (c) { return `<option value="${CBA.esc(c.id)}">${CBA.esc(c.name)}</option>`; }).join("");
  return `
    <div class="tx-bulk">
      <span class="tx-bulk__count">${n} נבחרו</span>
      <button class="btn-approve" data-bulk="approve">סמן מוכן לתשלום</button>
      <span class="tx-bulk__cat">שנה סעיף: <select class="year-select" data-bulk-cat>${catOpts}</select><button class="btn-ghost btn-sm" data-bulk="category">החל</button></span>
      <button class="btn-ghost btn-sm btn-danger" data-bulk="delete">מחק</button>
      <button class="btn-ghost btn-sm" data-bulk="clear">נקה בחירה</button>
    </div>`;
}
function txEmptyState(totalCount) {
  const ico = '<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 12.5h7M8.5 16h4.5"/></svg>';
  if (totalCount === 0) {
    return `<div class="tx-empty"><div class="tx-empty__ico">${ico}</div>
      <div class="tx-empty__title">עדיין אין הוצאות</div>
      <div class="tx-empty__sub">הוסף את ההוצאה הראשונה כדי להתחיל.</div>
      <button class="btn-primary btn-sm" data-add-tx>+ הוסף הוצאה ראשונה</button></div>`;
  }
  return `<div class="tx-empty"><div class="tx-empty__ico">${ico}</div>
    <div class="tx-empty__title">לא נמצאו הוצאות</div>
    <div class="tx-empty__sub">אין תנועות התואמות לסינון או לחיפוש.</div>
    <button class="btn-ghost btn-sm" data-clear-filters>נקה סינון</button></div>`;
}

/* --- כותרת עמודה עם מיון --- */
function txHeadCell(col) {
  const active = txSort.col === col.key;
  const arrow = active ? (txSort.dir === 1 ? " ▲" : " ▼") : "";
  return `<div class="tx-sort${active ? " is-active" : ""}" data-sort="${col.key}">${col.label}${arrow}</div>`;
}

/* --- תצוגות שמורות --- */
function txCategoryGroup(catId) {
  const c = CBA.data.findCategory(catId);
  return c ? c.group : "";
}
function txOverCats() {
  return CBA.data.getBudgetRows().filter(function (r) { return r.remaining < 0; }).map(function (r) { return r.id; });
}
function txMatchesView(t) {
  if (txView === "pending") return t.status === "submitted" || t.status === "review";
  if (txView === "gardening") return txCategoryGroup(t.categoryId) === "gardening";
  if (txView === "over") return txOverCats().indexOf(t.categoryId) !== -1;
  return true;
}

/* תיוג חכם: הסעיף השכיח ביותר עבור ספק/רוכש חוזר */
function txSuggestCategory(name) {
  name = (name || "").trim();
  if (name.length < 2) return null;
  const counts = {};
  CBA.data.getTransactions().forEach(function (t) {
    const key = t.supplier || t.buyer || "";
    if (key && (key === name || key.indexOf(name) !== -1 || name.indexOf(key) !== -1)) {
      counts[t.categoryId] = (counts[t.categoryId] || 0) + 1;
    }
  });
  let best = null, bestN = 0;
  Object.keys(counts).forEach(function (k) { if (counts[k] > bestN) { bestN = counts[k]; best = k; } });
  if (!best) return null;
  return { catId: best, catName: CBA.data.categoryName(best), n: bestN };
}

/* --- סינון + מיון --- */
function txApplyFilters(list) {
  const f = txFilters;
  const q = (f.search || "").trim();
  return list.filter(function (t) {
    if (!txMatchesView(t)) return false;
    if (f.year && t.year !== f.year) return false;
    if (f.month && t.month !== f.month) return false;
    if (f.category && t.categoryId !== f.category) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.source && t.source !== f.source) return false;
    if (f.type && CBA.data.expenseTypeOf(t) !== f.type) return false;
    if (q) {
      const hay = (t.buyer || "") + " " + (t.supplier || "") + " " + (t.description || "");
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
}
function txSortRows(list) {
  const dir = txSort.dir;
  // מיון מורכב לעמודת "חודש הגשה": קודם לפי החודש עצמו, ובתוך אותו חודש — לפי
  // תאריך רכישה, ובתוך אותו תאריך — לפי מזהה (הכי חדש קודם). זו גם ברירת המחדל
  // של המסך וגם מה שקורה אם לוחצים על כותרת "חודש הגשה" (אותה עמודה בדיוק).
  if (txSort.col === "month") {
    return list.slice().sort(function (a, b) {
      const ma = a.month || "", mb = b.month || "";
      if (ma !== mb) return ma.localeCompare(mb, "he") * dir;
      const da = a.date || "", db = b.date || "";
      if (da !== db) return da.localeCompare(db, "he") * dir;
      return ((a.id || 0) - (b.id || 0)) * dir;
    });
  }
  const col = TX_COLS.find(function (c) { return c.key === txSort.col; }) || TX_COLS[1];
  return list.slice().sort(function (a, b) {
    const va = col.get(a), vb = col.get(b);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb), "he") * dir;
  });
}

/* --- אפשרויות סינון --- */
function txYearOptions(list) {
  const years = {};
  list.forEach(function (t) { if (t.year) years[t.year] = true; });
  return `<option value="">כל השנים</option>` + Object.keys(years).map(function (y) {
    return `<option value="${CBA.esc(y)}"${txFilters.year === y ? " selected" : ""}>${CBA.esc(y)}</option>`;
  }).join("");
}
function txMonthOptions(list) {
  const months = {};
  list.forEach(function (t) { if (t.month) months[t.month] = true; });
  const keys = Object.keys(months).sort().reverse();
  return `<option value="">כל החודשים</option>` + keys.map(function (m) {
    return `<option value="${m}"${txFilters.month === m ? " selected" : ""}>${txMonthLabel(m)}</option>`;
  }).join("");
}
// עיצוב "חודש הגשה" בעברית (למשל "אוגוסט 2026") — היה מוצג כ-MM/YYYY גולמי,
// לא ברור לתושבים/מנהל. ר' CBA.data.hebrewMonth (2026-08-06).
function txMonthLabel(m) { return CBA.data.hebrewMonth(m); }
function txCatOptions() {
  return `<option value="">כל הסעיפים</option>` + CBA.data.getCategories().map(function (c) {
    return `<option value="${CBA.esc(c.id)}"${txFilters.category === c.id ? " selected" : ""}>${CBA.esc(c.name)}</option>`;
  }).join("");
}
function txStatusOptions() {
  let html = `<option value="">כל הסטטוסים</option>`;
  CBA.data.statusList().forEach(function (k) {
    html += `<option value="${k}"${txFilters.status === k ? " selected" : ""}>${CBA.data.statusMeta(k).label}</option>`;
  });
  return html;
}
function txSourceOptions() {
  const opts = [["", "כל המקורות"], ["admin", "מנהל"], ["resident", "תושב"]];
  return opts.map(function (o) {
    return `<option value="${o[0]}"${txFilters.source === o[0] ? " selected" : ""}>${o[1]}</option>`;
  }).join("");
}
function txTypeOptions() {
  let html = `<option value="">כל הסוגים</option>`;
  CBA.data.expenseTypeList().forEach(function (e) {
    html += `<option value="${e.key}"${txFilters.type === e.key ? " selected" : ""}>${CBA.esc(e.label)}</option>`;
  });
  return html;
}

/* --- שורת תנועה --- */
// תא עמודה תקנית בודדת בטבלת ניהול ההוצאות — משמש גם ב-txRowHTML וגם (בעתיד)
// בכל מקום אחר שצריך את אותה תצוגה בדיוק, כדי לא לשכפל את הלוגיקה.
function txStdCellHTML(key, t) {
  switch (key) {
    case "month": return txMonthLabel(t.month || "");
    case "date": return CBA.esc(CBA.data.hebrewDateShort(t.date || ""));
    case "buyer": return CBA.esc(t.buyer || "");
    case "supplier": return CBA.esc(t.supplier || "");
    case "description": return CBA.esc(t.description || "");
    case "category": return CBA.esc(CBA.data.categoryName(t.categoryId));
    case "amount": return CBA.formatILS(t.amount || 0);
    default: return "";
  }
}
function txRowHTML(t) {
  const pending = t.status === "submitted";
  const s = CBA.data.statusMeta(t.status);
  const src = t.source === "resident" ? "תושב" : "מנהל";
  const typ = CBA.data.expenseTypeShort(CBA.data.expenseTypeOf(t));
  const next = CBA.data.statusNext(t.status);
  // מי מוצג מתי (2026-08-06): "בדיקה" רלוונטי רק כשעוד לא בבדיקה ולא נסגר;
  // "דחה" זמין בכל שלב שלפני "שולם" — כולל אחרי ההעברה להנה"ח, לבקשת יועד.
  const canReview = t.status === "submitted" || t.status === "ready";
  const canReject = t.status === "submitted" || t.status === "review" || t.status === "ready";
  const stdCells = txVisibleStdCols().map(function (c) {
    // התיאור והספק נחתכים בשורה אחת — title מציג את הטקסט המלא בריחוף
    const raw = (c.key === "description" ? (t.description || "") : c.key === "supplier" ? (t.supplier || "") : "");
    const ttl = raw ? ' title="' + CBA.esc(raw) + '"' : "";
    return '<div class="tx-c' + (c.key === "amount" ? " tx-c--amount" : c.key === "description" ? " tx-c--desc" : "") + '"' + ttl + '>' + txStdCellHTML(c.key, t) + '</div>';
  }).join("");
  const customCells = txVisibleCustomCols().map(function (c) {
    return '<div class="tx-c">' + CBA.esc((t.customFields && t.customFields[c.key]) || "") + '</div>';
  }).join("");
  return `
    <div class="tx-row${pending ? " is-pending" : ""}${txSelected[t.id] ? " is-selected" : ""}" data-tx="${t.id}">
      <div class="tx-check"><input type="checkbox" data-check="${t.id}" ${txSelected[t.id] ? "checked" : ""}></div>
      <div class="tx-c tx-c--peek">${t.receiptUrl ? `<button class="tx-peek" data-peek="${t.id}" title="תצוגה מקדימה של הקבלה" aria-label="תצוגה מקדימה של הקבלה">${TX_PEEK_ICO}</button>` : ""}</div>
      ${stdCells}
      ${customCells}
      <div class="tx-c tx-c--status">
        <span class="badge badge--${s.cls}">${s.label}</span>
        ${t.reviewNote ? `<span class="tx-note-ico" title="${CBA.esc(t.reviewNote)}">${TX_NOTE_ICO}</span>` : ""}
        <span class="badge-src">${typ}</span>
      </div>
      <!-- כפתורים מפורשים, בלי תפריט (2026-08-06, לבקשת יועד): פעולה ראשית
           בטקסט מלא ללא שבירת שורה, ולידה "?" לסימון בדיקה ו-"✕" למחיקה. -->
      <div class="tx-c--actions">
        ${next ? `<button class="btn-approve" data-advance="${t.id}">${s.next}</button>` : ""}
        ${canReject ? `<button class="btn-reject" data-reject="${t.id}">דחה</button>` : ""}
        ${canReview ? `<button class="tx-ico-btn tx-ico-btn--review" data-review="${t.id}" title="העבר לבדיקה" aria-label="העבר לבדיקה">?</button>` : ""}
        <button class="tx-ico-btn tx-ico-btn--del" data-del-tx="${t.id}" title="מחק" aria-label="מחק">✕</button>
      </div>
    </div>`;
}

/* --- רשימת מובייל (מוצגת רק במסך צר; הטבלה מוסתרת שם) --- */
function txMobileList(rows, totalCount) {
  const body = rows.length ? rows.map(txMRowHTML).join("") : txEmptyState(totalCount);
  return `<div class="tx-mlist">${body}</div>`;
}
function txMRowHTML(t) {
  const pending = t.status === "submitted";
  const s = CBA.data.statusMeta(t.status);
  const src = t.source === "resident" ? "תושב" : "מנהל";
  const typ = CBA.data.expenseTypeShort(CBA.data.expenseTypeOf(t));
  const next = CBA.data.statusNext(t.status);
  // מי מוצג מתי (2026-08-06): "בדיקה" רלוונטי רק כשעוד לא בבדיקה ולא נסגר;
  // "דחה" זמין בכל שלב שלפני "שולם" — כולל אחרי ההעברה להנה"ח, לבקשת יועד.
  const canReview = t.status === "submitted" || t.status === "ready";
  const canReject = t.status === "submitted" || t.status === "review" || t.status === "ready";
  const title = t.supplier || t.buyer || "(ללא ספק)";
  const meta = CBA.data.hebrewDate(t.date || "") + " · " + CBA.data.categoryName(t.categoryId);
  return `
    <div class="tx-mrow${pending ? " is-pending" : ""}" data-tx="${t.id}">
      <button type="button" class="tx-mcard" data-tx-toggle="${t.id}">
        <span class="tx-mcard__main">
          <span class="tx-mcard__title">${CBA.esc(title)}</span>
          <span class="tx-mcard__meta">${CBA.esc(meta)}</span>
        </span>
        <span class="tx-mcard__side">
          <span class="tx-mcard__amount">${CBA.formatILS(t.amount || 0)}</span>
          <span class="badge badge--${s.cls}">${s.label}</span>
        </span>
        <span class="tx-mcard__chev" aria-hidden="true">⌄</span>
      </button>
      <div class="tx-mdetails" hidden>
        <div class="tx-md__grid">
          <div><span class="tx-md__k">רוכש</span><span class="tx-md__v">${CBA.esc(t.buyer || "—")}</span></div>
          <div><span class="tx-md__k">חודש הגשה</span><span class="tx-md__v">${CBA.esc(txMonthLabel(t.month || "") || "—")}</span></div>
          <div><span class="tx-md__k">מקור</span><span class="tx-md__v">${src}</span></div>
          <div><span class="tx-md__k">סוג</span><span class="tx-md__v">${CBA.esc(CBA.data.expenseTypeLabel(CBA.data.expenseTypeOf(t)))}</span></div>
          <div><span class="tx-md__k">תיאור</span><span class="tx-md__v">${CBA.esc(t.description || "—")}</span></div>
          ${txVisibleCustomCols().map(function (c) {
            const v = (t.customFields && t.customFields[c.key]) || "";
            return v ? `<div><span class="tx-md__k">${CBA.esc(c.label)}</span><span class="tx-md__v">${CBA.esc(v)}</span></div>` : "";
          }).join("")}
          ${t.reviewNote ? `<div class="tx-md--wide"><span class="tx-md__k">הערת בדיקה</span><span class="tx-md__v">${CBA.esc(t.reviewNote)}</span></div>` : ""}
          ${t.receiptUrl ? `<div class="tx-md--wide"><span class="tx-md__k">קבלה</span><button type="button" class="tx-receipt tx-receipt--btn" data-peek="${t.id}">${TX_PEEK_ICO} תצוגה מקדימה</button></div>` : ""}
        </div>
        <div class="tx-md__actions">
          ${next ? `<button class="btn-approve" data-advance="${t.id}">${s.next}</button>` : ""}
          ${canReview ? `<button class="btn-ghost btn-sm" data-review="${t.id}">לבדיקה</button>` : ""}
          ${canReject ? `<button class="btn-ghost btn-sm btn-danger" data-reject="${t.id}">דחה</button>` : ""}
          <button class="btn-ghost btn-sm" data-medit="${t.id}">עריכה</button>
          <button class="btn-ghost btn-sm btn-danger" data-del-tx="${t.id}">מחיקה</button>
        </div>
      </div>
    </div>`;
}

/* --- גיליון סינון תחתון (מובייל) --- */
function txApplyFiltersOpenState(container) {
  const sel = container.querySelector(".tx-selects");
  if (!sel) return;
  sel.classList.add("is-open");
  if (!document.getElementById("tx-sheet-bd")) {
    const bd = document.createElement("div");
    bd.id = "tx-sheet-bd"; bd.className = "tx-sheet-backdrop";
    document.body.appendChild(bd);
    bd.addEventListener("click", txCloseFilters);
  }
}
function txRemoveSheetBackdrop() { const bd = document.getElementById("tx-sheet-bd"); if (bd) bd.remove(); }
function txOpenFilters(container) { txFiltersOpen = true; txApplyFiltersOpenState(container); }
function txCloseFilters() {
  txFiltersOpen = false;
  document.querySelectorAll(".tx-selects.is-open").forEach(function (s) { s.classList.remove("is-open"); });
  txRemoveSheetBackdrop();
}

/* --- אירועים --- */
function txBind(container) {
  container.querySelectorAll("[data-f]").forEach(function (el) {
    const ev = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(ev, function () {
      txFilters[el.dataset.f] = el.value;
      if (txView.indexOf("c:") === 0) txView = "all";
      if (ev === "input") txRerenderList(container);
      else CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      txView = btn.dataset.view; txSelected = {};
      CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-cview]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      if (e.target.closest("[data-del-cview]")) return;
      const v = txCustomViews.find(function (x) { return x.id === btn.dataset.cview; });
      if (v) { txFilters = Object.assign({}, v.filters); txView = "c:" + v.id; txSelected = {}; }
      CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-del-cview]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const id = btn.dataset.delCview;
      txCustomViews = txCustomViews.filter(function (x) { return x.id !== id; });
      if (txView === "c:" + id) txView = "all";
      CBA.screens.expenses.render(container);
    });
  });
  const saveViewBtn = container.querySelector("[data-save-view]");
  if (saveViewBtn) saveViewBtn.addEventListener("click", function () {
    const name = window.prompt("שם לתצוגה השמורה:");
    if (name && name.trim()) {
      const v = { id: "v" + (++txViewSeq), name: name.trim(), filters: Object.assign({}, txFilters) };
      txCustomViews.push(v); txView = "c:" + v.id;
      CBA.screens.expenses.render(container);
    }
  });
  container.querySelectorAll("[data-sort]").forEach(function (h) {
    h.addEventListener("click", function () {
      const k = h.dataset.sort;
      if (txSort.col === k) txSort.dir = -txSort.dir;
      else { txSort.col = k; txSort.dir = (k === "amount" || k === "date" || k === "month") ? -1 : 1; }
      CBA.screens.expenses.render(container);
    });
  });
  const addBtn = container.querySelector(".tx-actions [data-add-tx]");
  if (addBtn) addBtn.addEventListener("click", function () { txOpenDrawer(container, null); });
  const colsBtn = container.querySelector("[data-manage-cols]");
  if (colsBtn) colsBtn.addEventListener("click", function () { txOpenColumnManager(container); });

  const checkAll = container.querySelector("[data-check-all]");
  if (checkAll) checkAll.addEventListener("change", function () {
    txSortRows(txApplyFilters(CBA.data.getTransactions())).forEach(function (t) { txSelected[t.id] = checkAll.checked; });
    CBA.screens.expenses.render(container);
  });
  container.querySelectorAll("[data-bulk]").forEach(function (btn) {
    btn.addEventListener("click", function () { txBulkAction(container, btn.dataset.bulk); });
  });

  // גיליון סינון תחתון (מובייל): פתיחה, סגירה, ושחזור מצב פתוח אחרי ציור מחדש
  const openF = container.querySelector("[data-open-filters]");
  if (openF) openF.addEventListener("click", function () { txOpenFilters(container); });
  container.querySelectorAll("[data-close-filters]").forEach(function (b) { b.addEventListener("click", txCloseFilters); });
  if (txFiltersOpen) txApplyFiltersOpenState(container); else txRemoveSheetBackdrop();

  // כפתור + מרחף (FAB) — הוספת הוצאה מהירה במובייל
  const fab = container.querySelector(".tx-fab");
  if (fab) fab.addEventListener("click", function () { txCloseFilters(); txOpenDrawer(container, null); });

  txBindRows(container);
}
function txBindRows(container) {
  const list = container.querySelector(".tx-list");

  // אקורדיון במובייל: לחיצה על שורה מרחיבה פרטים (וסוגרת שורות אחרות)
  container.querySelectorAll("[data-tx-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const row = btn.closest(".tx-mrow"); if (!row) return;
      const det = row.querySelector(".tx-mdetails");
      const isOpen = row.classList.contains("is-open");
      container.querySelectorAll(".tx-mrow.is-open").forEach(function (r) {
        r.classList.remove("is-open");
        const d = r.querySelector(".tx-mdetails"); if (d) d.setAttribute("hidden", "");
      });
      if (!isOpen) { row.classList.add("is-open"); if (det) det.removeAttribute("hidden"); }
    });
  });
  container.querySelectorAll("[data-medit]").forEach(function (btn) {
    btn.addEventListener("click", function (e) { e.stopPropagation(); txOpenDrawer(container, parseInt(btn.dataset.medit, 10)); });
  });

  container.querySelectorAll(".tx-row").forEach(function (row) {
    row.addEventListener("click", function (e) {
      if (e.target.closest(".tx-check") || e.target.closest("[data-advance]") || e.target.closest("[data-del-tx]")) return;
      txOpenDrawer(container, parseInt(row.dataset.tx, 10));
    });
  });
  container.querySelectorAll("[data-check]").forEach(function (cb) {
    cb.addEventListener("change", function (e) {
      e.stopPropagation();
      txSelected[parseInt(cb.dataset.check, 10)] = cb.checked;
      CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-advance]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const t = CBA.data.getTransactions().find(function (x) { return x.id === parseInt(btn.dataset.advance, 10); });
      if (!t) return;
      const n = CBA.data.statusNext(t.status);
      if (!n) return;
      // אישור ("הוגשה קבלה"/"בבדיקה" -> "הועבר להנה"ח") מחייב פרטים מלאים — בעיקר
      // בקשות מתושבים שמגיעות בלי סעיף תקציבי. אם משהו חסר: לא מאשרים, פותחים עריכה להשלמה.
      if (t.status === "submitted" || t.status === "review") {
        const missing = CBA.data.missingApprovalFields(t);
        if (missing.length) {
          window.alert('לא ניתן לאשר להנה"ח — חסרים פרטים: ' + missing.join(", ") + ".\nנפתח טופס עריכה להשלמה.");
          txOpenDrawer(container, t.id);
          return;
        }
      }
      // יציאה מ"בבדיקה" מוחקת את הערת הבדיקה — היא שייכת לסטטוס הזה בלבד
      CBA.data.updateTransaction(t.id, n === "review" ? { status: n } : { status: n, reviewNote: "" });
      CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-peek]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();   // לא לפתוח את חלון העריכה בלחיצה על העין
      txOpenPeek(CBA.data.getTransactions().find(function (x) { return x.id === parseInt(btn.dataset.peek, 10); }));
    });
  });
  container.querySelectorAll("[data-review]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      const t = CBA.data.getTransactions().find(function (x) { return x.id === parseInt(btn.dataset.review, 10); });
      if (!t) return;
      const note = window.prompt("למה ההוצאה הזו עוברת לבדיקה?", t.reviewNote || "");
      if (note === null) return;   // בוטל
      CBA.data.updateTransaction(t.id, { status: "review", reviewNote: note.trim() });
      CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-reject]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      CBA.data.updateTransaction(parseInt(btn.dataset.reject, 10), { status: "rejected", reviewNote: "" });
      CBA.screens.expenses.render(container);
    });
  });
  container.querySelectorAll("[data-del-tx]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (window.confirm("למחוק את התנועה?")) {
        CBA.data.deleteTransaction(parseInt(btn.dataset.delTx, 10));
        CBA.screens.expenses.render(container);
      }
    });
  });
  if (list) {
    list.querySelectorAll("[data-add-tx]").forEach(function (b) { b.addEventListener("click", function () { txOpenDrawer(container, null); }); });
    list.querySelectorAll("[data-clear-filters]").forEach(function (b) {
      b.addEventListener("click", function () {
        txFilters = { year: "", month: "", category: "", status: "", source: "", type: "", search: "" }; txView = "all";
        CBA.screens.expenses.render(container);
      });
    });
  }
}
function txBulkAction(container, action) {
  const ids = Object.keys(txSelected).filter(function (k) { return txSelected[k]; }).map(function (k) { return parseInt(k, 10); });
  if (action === "clear") { txSelected = {}; }
  else if (action === "approve") {
    const items = ids.map(function (id) { return CBA.data.getTransactions().find(function (x) { return x.id === id; }); }).filter(Boolean);
    const blocked = [];
    items.forEach(function (t) {
      if (t.status === "submitted" || t.status === "review") {
        const missing = CBA.data.missingApprovalFields(t);
        if (missing.length) { blocked.push({ t: t, missing: missing }); return; }
      }
      CBA.data.updateTransaction(t.id, { status: "ready" });
    });
    txSelected = {};
    if (blocked.length) {
      const lines = blocked.map(function (b) {
        return "• " + (b.t.supplier || b.t.buyer || ("#" + b.t.id)) + " — חסר: " + b.missing.join(", ");
      });
      window.alert((items.length - blocked.length) + " מתוך " + items.length + ' אושרו להנה"ח.\n' +
        blocked.length + " לא אושרו כי חסרים בהן פרטים:\n" + lines.join("\n"));
    }
  }
  else if (action === "delete") {
    if (!ids.length || !window.confirm("למחוק " + ids.length + " תנועות?")) return;
    ids.forEach(function (id) { CBA.data.deleteTransaction(id); }); txSelected = {};
  } else if (action === "category") {
    const sel = container.querySelector("[data-bulk-cat]");
    if (sel && sel.value) { ids.forEach(function (id) { CBA.data.updateTransaction(id, { categoryId: sel.value }); }); txSelected = {}; }
  }
  CBA.screens.expenses.render(container);
}
function txRerenderList(container) {
  const all = CBA.data.getTransactions();
  const rows = txSortRows(txApplyFilters(all));
  const total = rows.reduce(function (s, t) { return s + (t.amount || 0); }, 0);
  const list = container.querySelector(".tx-list");
  if (list) list.innerHTML = rows.length ? rows.map(txRowHTML).join("") : txEmptyState(all.length);
  const mlist = container.querySelector(".tx-mlist");
  if (mlist) mlist.outerHTML = txMobileList(rows, all.length);
  const sum = container.querySelector(".tx-summary");
  if (sum) sum.innerHTML = `<span>סה״כ מסונן</span> <b>${CBA.formatILS(total)}</b> <span class="tx-summary__count">· ${rows.length} תנועות</span>`;
  txBindRows(container);
}

/* חודש הגשה כברירת מחדל: מה-20 בחודש ואילך — עוברים לחודש הבא.
   (למשל 21 באוגוסט => חודש הגשה ספטמבר.) */
function txDefaultSubmissionMonth() {
  const now = new Date();
  let y = now.getFullYear(), m = now.getMonth(); // m: 0-11
  if (now.getDate() >= 20) { m += 1; if (m > 11) { m = 0; y += 1; } }
  return y + "-" + String(m + 1).padStart(2, "0");
}

/* --- drawer טופס הוספה/עריכה --- */

// autocomplete כללי לשדה טקסט מול רשימת תושבים (CBA.data.residentPickerOptions):
// מציג רשימת התאמות חיה מתחת לשדה, ובבחירה קובע גם את הטקסט וגם state.familyId
// (המזהה הקבוע היציב) — כדי שהקישור למשפחה יירשם מיד בזמן ההזנה, לכל סוגי
// ההוצאה (החזר לדייר / תשלום לספק / כללי), לא רק בהחזר כמו קודם. 2026-08-06.
function txWireAutocomplete(form, state, residentOptions, fieldKey, onPick) {
  const input = form.querySelector('[data-ac="' + fieldKey + '"]');
  const list = form.querySelector('[data-ac-list="' + fieldKey + '"]');
  if (!input || !list) return;
  function render(q) {
    const query = (q || "").trim();
    if (!query) { list.hidden = true; list.innerHTML = ""; return; }
    /* מזהים כל אפשרות לפי המיקום שלה ברשימה ולא לפי rid (תיקון באג 2026-08-06):
       שני בני זוג באותו בית חולקים את אותו "מזהה קבוע", ולכן חיפוש לפי rid החזיר
       תמיד את הראשון אלפביתית — בחירה ב"אורטל כהן" הפכה ל"אבירם כהן". */
    const matches = residentOptions
      .map(function (o, i) { return { o: o, i: i }; })
      .filter(function (x) { return x.o.label.indexOf(query) !== -1; })
      .slice(0, 8);
    if (!matches.length) { list.hidden = true; list.innerHTML = ""; return; }
    list.innerHTML = matches.map(function (x) {
      return '<div class="ac-item" data-ac-idx="' + x.i + '">' + CBA.esc(x.o.label) + '</div>';
    }).join("");
    list.hidden = false;
  }
  input.addEventListener("input", function () {
    state.familyId = ""; // הקלדה ידנית מבטלת קישור קודם עד שתיבחר התאמה מהרשימה
    render(input.value);
  });
  input.addEventListener("focus", function () { if (input.value) render(input.value); });
  input.addEventListener("blur", function () { setTimeout(function () { list.hidden = true; }, 150); });
  list.addEventListener("mousedown", function (e) {
    const item = e.target.closest("[data-ac-idx]");
    if (!item) return;
    e.preventDefault();
    const opt = residentOptions[parseInt(item.dataset.acIdx, 10)];
    if (opt) {
      input.value = opt.label;
      state.familyId = opt.rid;
      if (onPick) onPick(opt);
    }
    list.hidden = true;
  });
}

// מזהה הקובץ מתוך קישור Google Drive (תומך בשני הפורמטים ש-Apps Script/משתמשים
// עשויים להפיק: .../file/d/<id>/view וגם .../open?id=<id>). משמש גם לתצוגה
// המקדימה המוטמעת וגם (בעתיד) להחלפת/מחיקת הקובץ הישן ב-Drive.
function driveFileId(url) {
  if (!url) return null;
  const m = /\/file\/d\/([a-zA-Z0-9_-]+)/.exec(url) || /[?&]id=([a-zA-Z0-9_-]+)/.exec(url);
  return m ? m[1] : null;
}

/* תצוגה מקדימה מהירה של קבלה מתוך שורה בטבלה (2026-08-06, לבקשת יועד) —
   חלונית קופצת קלה, בלי לפתוח את חלון העריכה המלא. משתמשת באותה לוגיקה
   כמו התצוגה שבתוך החלון: Drive מוצג ב-iframe, תמונה רגילה כ-<img>. */
function txClosePeek() {
  const el = document.getElementById("tx-peek-overlay");
  if (el) el.remove();
  document.removeEventListener("keydown", txPeekEsc);
}
function txPeekEsc(e) { if (e.key === "Escape") txClosePeek(); }
function txOpenPeek(t) {
  if (!t || !t.receiptUrl) return;
  txOpenPeekUrl(t.receiptUrl, t.supplier || t.buyer || "קבלה");
}
/* פתיחת תצוגה מקדימה מכתובת בלבד — כדי שכל מקום באפליקציה שמציג קבלה
   (כולל אזור התושב) יוכל להשתמש באותה חלונית במקום לפתוח טאב חדש. */
function txOpenPeekUrl(url, title) {
  const t = { receiptUrl: url, supplier: title };
  if (!t.receiptUrl) return;
  txClosePeek();
  const id = driveFileId(t.receiptUrl);
  const isImg = !id && /\.(png|jpe?g|gif|webp)$/i.test(t.receiptUrl);
  const body = id
    ? '<iframe class="peek__frame" src="https://drive.google.com/file/d/' + CBA.esc(id) + '/preview" title="תצוגת קבלה" allow="autoplay"></iframe>'
    : isImg
      ? '<img class="peek__img" src="' + CBA.esc(t.receiptUrl) + '" alt="קבלה">'
      : '<div class="peek__empty">לא ניתן להציג תצוגה מקדימה לקישור הזה</div>';
  const wrap = document.createElement("div");
  wrap.id = "tx-peek-overlay";
  wrap.className = "peek-backdrop";
  wrap.innerHTML =
    '<div class="peek" role="dialog" aria-label="תצוגה מקדימה של הקבלה">' +
      '<div class="peek__head">' +
        '<span class="peek__title">' + CBA.esc(t.supplier || t.buyer || "קבלה") + '</span>' +
        '<a class="peek__open" href="' + CBA.esc(t.receiptUrl) + '" target="_blank" rel="noopener">פתח בחלון חדש</a>' +
        '<button class="peek__x" aria-label="סגור">×</button>' +
      '</div>' + body +
    '</div>';
  document.body.appendChild(wrap);
  wrap.addEventListener("click", function (e) { if (e.target === wrap) txClosePeek(); });
  wrap.querySelector(".peek__x").addEventListener("click", txClosePeek);
  document.addEventListener("keydown", txPeekEsc);
}

/* חשיפה גלובלית + מאזין אחד לכל האפליקציה: כל אלמנט עם data-peek-url ייפתח
   כתצוגה מקדימה במקום לנווט לטאב חדש (2026-08-06, לבקשת יועד). */
window.CBA = window.CBA || {};
CBA.openReceiptPreview = txOpenPeekUrl;
document.addEventListener("click", function (e) {
  const el = e.target.closest && e.target.closest("[data-peek-url]");
  if (!el) return;
  e.preventDefault();
  e.stopPropagation();
  txOpenPeekUrl(el.dataset.peekUrl, el.dataset.peekTitle || "קבלה");
});

/* --- "ניהול עמודות" (סעיף 6, 2026-08-06): הצג/הסתר עמודות תקניות, שנה את שם
   התצוגה שלהן, והוסף/הסר עמודות מותאמות אישית. נשמר בגיליון (לא רק במכשיר הזה)
   דרך CBA.data.saveColumnConfig — ר' Code.gs saveColumnConfig_. חלון עצמאי, לא
   קשור ל-drawer העריכה (יכולים להיסגר זה בלי להשפיע על זה). */
function txCloseColumnManager() {
  const el = document.getElementById("cba-colmgr");
  if (el) el.remove();
}
function txOpenColumnManager(container) {
  txCloseColumnManager();
  const cfg = txColumnConfig();
  const hiddenSet = {};
  (cfg.hidden || []).forEach(function (k) { hiddenSet[k] = true; });

  const stdRows = TX_STD_COLS.map(function (c) {
    const lbl = (cfg.labels || {})[c.key] || "";
    return '<div class="colmgr-row">' +
      '<label class="colmgr-check"><input type="checkbox" data-col-visible="' + CBA.esc(c.key) + '"' + (hiddenSet[c.key] ? "" : " checked") + '> ' + CBA.esc(c.label) + '</label>' +
      '<input class="field-input colmgr-label" type="text" data-col-label="' + CBA.esc(c.key) + '" value="' + CBA.esc(lbl) + '" placeholder="שם תצוגה (ברירת מחדל: ' + CBA.esc(c.label) + ')">' +
      '</div>';
  }).join("");
  const customRows = (cfg.custom || []).map(function (c) {
    return '<div class="colmgr-row">' +
      '<label class="colmgr-check"><input type="checkbox" data-col-visible="' + CBA.esc(c.key) + '"' + (hiddenSet[c.key] ? "" : " checked") + '> ' + CBA.esc(c.label) + ' <span class="colmgr-tag">מותאם אישית</span></label>' +
      '<button type="button" class="btn-ghost btn-sm btn-danger" data-remove-custom-col="' + CBA.esc(c.key) + '">הסר</button>' +
      '</div>';
  }).join("");

  const overlay = document.createElement("div");
  overlay.id = "cba-colmgr";
  overlay.innerHTML = `
    <div class="drawer-backdrop" data-colmgr-close></div>
    <aside class="drawer drawer--narrow" role="dialog" aria-label="ניהול עמודות">
      <div class="drawer__head">
        <div class="drawer__title">ניהול עמודות הטבלה</div>
        <button class="drawer__close" data-colmgr-close aria-label="סגור">×</button>
      </div>
      <div class="drawer__body">
        <div class="colmgr-hint">בטל סימון כדי להסתיר עמודה מהטבלה, ושנה את שם התצוגה שלה (ריק = ברירת המחדל). המידע עצמו תמיד נשאר בגיליון.</div>
        ${stdRows}
        ${customRows ? '<div class="colmgr-sep">עמודות מותאמות אישית</div>' + customRows : ""}
        <button type="button" class="btn-ghost btn-sm" data-add-custom-col style="margin-top:12px;">+ הוסף עמודה מותאמת אישית</button>
      </div>
      <div class="drawer__actions">
        <button class="btn-primary" data-save-cols>שמור</button>
        <button class="btn-ghost" data-colmgr-close>ביטול</button>
      </div>
    </aside>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-colmgr-close]").forEach(function (el) { el.addEventListener("click", txCloseColumnManager); });

  const addCustomBtn = overlay.querySelector("[data-add-custom-col]");
  if (addCustomBtn) addCustomBtn.addEventListener("click", function () {
    const name = (window.prompt("שם העמודה החדשה:") || "").trim();
    if (!name) return;
    const clash = TX_STD_COLS.some(function (c) { return c.key === name || c.label === name; }) ||
      (cfg.custom || []).some(function (c) { return c.key === name; });
    if (clash) { window.alert('כבר קיימת עמודה בשם "' + name + '".'); return; }
    cfg.custom = (cfg.custom || []).concat([{ key: name, label: name }]);
    txOpenColumnManager(container); // רינדור מחדש עם העמודה החדשה — עדיין לא נשמר עד "שמור"
  });
  overlay.querySelectorAll("[data-remove-custom-col]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const key = btn.dataset.removeCustomCol;
      if (!window.confirm('להסיר את העמודה "' + key + '" מהתצוגה? הנתונים שכבר הוזנו נשארים בגיליון.')) return;
      cfg.custom = (cfg.custom || []).filter(function (c) { return c.key !== key; });
      txOpenColumnManager(container);
    });
  });
  const saveBtn = overlay.querySelector("[data-save-cols]");
  if (saveBtn) saveBtn.addEventListener("click", function () {
    const newHidden = [];
    const newLabels = {};
    overlay.querySelectorAll("[data-col-visible]").forEach(function (cb) {
      if (!cb.checked) newHidden.push(cb.dataset.colVisible);
    });
    overlay.querySelectorAll("[data-col-label]").forEach(function (inp) {
      const v = inp.value.trim();
      if (v) newLabels[inp.dataset.colLabel] = v;
    });
    const newConfig = { hidden: newHidden, labels: newLabels, custom: cfg.custom || [] };
    CBA.data.saveColumnConfig(newConfig, function () {});
    txCloseColumnManager();
    CBA.screens.expenses.render(container);
  });
}

/* אפשרויות בורר "תת-סעיף" (סעיף 5, 2026-08-10) — תלוי בסעיף התקציבי הנבחר:
   תת-הסעיפים המתוכננים שלו (אם יש) + "— ללא —" + "+ צור תת-סעיף חדש" ליצירה
   בזמן אמת. אם selectedId לא נמצא ברשימה הנוכחית (למשל תת-סעיף שנמחק/שונה
   שם אחרי שהתנועה כבר שויכה אליו) — לא נבחרת אף אופציה, כלומר "— ללא —"
   בפועל (בדיוק הכוונה: תנועה כזו מוצגת כ"לא משויך", בלי לאבד את הערך הישן
   בפועל ב-state עד שהמנהל ישמור בפירוש). */
function txSubItemOptions(categoryId, selectedId) {
  const items = CBA.data.getCategoryItems(categoryId);
  const known = items.some(function (it) { return it.id === selectedId; });
  const opts = items.map(function (it) {
    return `<option value="${CBA.esc(it.id)}"${it.id === selectedId ? " selected" : ""}>${CBA.esc(it.name)}</option>`;
  }).join("");
  return `<option value=""${(!selectedId || !known) ? " selected" : ""}>— ללא —</option>` + opts +
    `<option value="__new__">+ צור תת-סעיף חדש</option>`;
}

function txOpenDrawer(container, id) {
  txForceCloseDrawer();   // פתיחה חדשה — אין מה להזהיר עליו
  const editing = id !== null;
  const t = editing ? CBA.data.getTransactions().find(function (x) { return x.id === id; }) : {
    date: new Date().toISOString().slice(0, 10), month: txDefaultSubmissionMonth(),
    year: CBA.data.getCurrentYear(), buyer: "", supplier: "", amount: "", bankName: "", bankBranch: "", bankAccount: "",
    categoryId: txPresetCategory || (CBA.data.getCategories()[0] || {}).id, source: "admin", expenseType: "supplier", payType: "supplier",
    status: "ready", description: "", receiptUrl: "", reviewNote: "",
    // תת-סעיף (רשות) — קישור ספציפי בתוך הסעיף התקציבי (סעיף 5, 2026-08-10)
    subItemId: ""
  };
  if (!t) return;
  const state = Object.assign({}, t); // עותק עבודה

  const overlay = document.createElement("div");
  overlay.id = "cba-drawer";
  overlay.innerHTML = `
    <div class="drawer-backdrop" data-close></div>
    <aside class="drawer" role="dialog" aria-label="${editing ? "עריכת הוצאה" : "הוספת הוצאה"}">
      <div class="drawer__head">
        <div class="drawer__title">${editing ? "עריכת הוצאה" : "הוספת הוצאה"}</div>
        <div class="drawer__head-actions">
          <button class="btn-ai" data-ai title="סריקת קבלה ב-AI (בקרוב)">✨ AI</button>
          <button class="drawer__close" data-close aria-label="סגור">×</button>
        </div>
      </div>
      <div class="drawer__body" id="tx-form"></div>
    </aside>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-close]").forEach(function (el) { el.addEventListener("click", txCloseDrawer); });
  document.addEventListener("keydown", txEscDrawer);
  const aiBtn = overlay.querySelector("[data-ai]");
  if (aiBtn) aiBtn.addEventListener("click", function () { aiBtn.textContent = "✨ בקרוב"; aiBtn.disabled = true; });

  // רשימת התושבים (עם מזהה קבוע ליד כל שם) נטענת (או נשלפת מה-cache) לפני
  // הרינדור הראשון של הטופס, כדי ששדה "רוכש/מטפל" יהיה מוכן מיד עם הפתיחה. אם
  // הטעינה נכשלת מתקבל מערך ריק — שדה הטקסט החופשי ממשיך לעבוד רגיל, רק בלי
  // הצעות autocomplete וקישור אוטומטי למשפחה.
  overlay.querySelector("#tx-form").innerHTML = '<div class="rs-slots__msg"><div class="rs-spin"></div>טוען…</div>';
  CBA.data.residentPickerOptions(function (options) {
    txRenderForm(container, overlay, state, editing, id, options || []);
  });
}

function txRenderForm(container, overlay, state, editing, id, residentOptions) {
  residentOptions = residentOptions || [];
  const form = overlay.querySelector("#tx-form");
  const etype = state.expenseType || (state.payType === "refund" ? "refund" : "supplier");
  state.expenseType = etype;
  const isRefund = etype === "refund", isSupplier = etype === "supplier", isGeneral = etype === "general";
  const showBank = !isRefund; // פרטי בנק רלוונטיים רק לתשלום ישיר לספק — לא להחזר לתושב
  const buyerLabel = isRefund ? "שם התושב" : (isSupplier ? "מי טיפל (רשות)" : "רוכש (רשות)");
  const supplierLabel = isRefund ? "היכן נרכש / שם בית העסק" : (isSupplier ? "שם הספק" : "שם המקבל / ספק");
  const catOpts = CBA.data.getCategories().map(function (c) {
    return `<option value="${CBA.esc(c.id)}"${c.id === state.categoryId ? " selected" : ""}>${CBA.esc(c.name)}</option>`;
  }).join("");
  // תת-סעיף (סעיף 5, 2026-08-10) — אפשרויות הבורר תלויות בסעיף התקציבי הנבחר
  // (ר' txSubItemOptions), כולל שיוך "+ צור תת-סעיף חדש" ליצירה בזמן אמת.
  const subItemOpts = txSubItemOptions(state.categoryId, state.subItemId);
  const srcOpts = [["admin", "מנהל"], ["resident", "תושב"]].map(function (o) {
    return `<option value="${o[0]}"${o[0] === state.source ? " selected" : ""}>${o[1]}</option>`;
  }).join("");
  const stOpts = CBA.data.statusList().map(function (k) {
    return `<option value="${k}"${k === state.status ? " selected" : ""}>${CBA.data.statusMeta(k).label}</option>`;
  }).join("");
  const fileName = CBA.data.receiptFileName(state);
  const driveId = driveFileId(state.receiptUrl);
  const hasImg = !driveId && state.receiptUrl && /\.(png|jpe?g|gif|webp)$/i.test(state.receiptUrl);

  // שדות מותאמים אישית (סעיף 6, 2026-08-06) — כל עמודה שהוגדרה דרך "ניהול עמודות"
  // מוצגת כאן כשדה טקסט חופשי, שמור תחת state.customFields[key].
  const customDefs = txCustomCols();
  const customFieldsHtml = customDefs.length ? customDefs.map(function (c) {
    const val = (state.customFields && state.customFields[c.key]) || "";
    return '<div class="form-field"><label>' + CBA.esc(c.label) + '</label>' +
      '<input class="field-input" type="text" data-custom-field="' + CBA.esc(c.key) + '" value="' + CBA.esc(val) + '"></div>';
  }).join("") : "";

  // שדה "רוכש/מטפל": autocomplete אחיד מול רשימת התושבים (טאב תושבים), לכל
  // סוגי ההוצאה — כולל תשלום לספק והוצאה כללית, לא רק החזר לדייר כמו קודם.
  // תמיד נשאר גם טקסט חופשי (לתושב שעדיין לא רשום, לחברת שיפוצים חיצונית וכו')
  // — בחירה מהרשימה קובעת גם קישור מדויק ל-familyId, ומבטיחה איות אחיד.
  const buyerFieldHtml = `
    <div class="ac-wrap">
      <input class="field-input" type="text" data-field="buyer" data-ac="buyer" autocomplete="off"
        value="${CBA.esc(state.buyer || "")}" placeholder="הקלד/י שם…">
      <div class="ac-list" data-ac-list="buyer" hidden></div>
    </div>`;

  form.innerHTML = `
    <div class="seg" style="margin-bottom:16px;">
      <button type="button" class="seg__opt${isRefund ? " is-active" : ""}" data-etype="refund">החזר לדייר</button>
      <button type="button" class="seg__opt${isSupplier ? " is-active" : ""}" data-etype="supplier">תשלום לספק</button>
      <button type="button" class="seg__opt${isGeneral ? " is-active" : ""}" data-etype="general">הוצאה כללית</button>
    </div>

    <div class="form-block form-block--first">
      <div class="form-grid">
        <div class="form-field"><label>תאריך רכישה</label><input class="field-input" type="date" data-field="date" value="${CBA.esc(state.date || "")}"></div>
        <div class="form-field"><label>חודש הגשה</label><input class="field-input" type="month" data-field="month" value="${CBA.esc(state.month || "")}"></div>
        <div class="form-field"><label>סכום</label><input class="field-input" type="number" inputmode="decimal" data-field="amount" value="${state.amount}"></div>
        <div class="form-field"><label>${buyerLabel}</label>${buyerFieldHtml}</div>
        <div class="form-field"><label>${supplierLabel}</label><input class="field-input" type="text" data-field="supplier" value="${CBA.esc(state.supplier || "")}"></div>
        <div class="form-field form-field--wide"><label>תיאור</label><input class="field-input" type="text" data-field="description" value="${CBA.esc(state.description || "")}"></div>
        ${customFieldsHtml}
      </div>
    </div>

    <div class="form-block form-block--approval" id="tx-approval-block">
      <div class="form-block__warn" id="tx-approval-warn" hidden></div>
      <div class="form-grid">
        <div class="form-field form-field--wide"><label>סעיף תקציבי</label><select class="field-input" data-field="categoryId">${catOpts}</select>
          <div class="tx-suggest" id="tx-suggest" hidden></div>
        </div>
        <div class="form-field form-field--wide"><label>תת-סעיף (רשות)</label>
          <select class="field-input" data-field="subItemId" id="tx-subitem-select">${subItemOpts}</select>
        </div>
        <div class="form-field"><label>מקור</label><select class="field-input" data-field="source">${srcOpts}</select></div>
        <div class="form-field"><label>סטטוס</label><select class="field-input" data-field="status">${stOpts}</select></div>
        <!-- הערת בדיקה — מוצגת רק כשהסטטוס "בבדיקה", או כשכבר יש בה תוכן כדי
             שהערה קיימת לא תיעלם מהעין (2026-08-06). ר' refreshReviewField. -->
        <div class="form-field form-field--wide" id="tx-review-field"${(state.status === "review" || state.reviewNote) ? "" : " hidden"}>
          <label>הערת בדיקה</label>
          <input class="field-input" type="text" data-field="reviewNote" value="${CBA.esc(state.reviewNote || "")}" placeholder="למה ההוצאה הזו בבדיקה">
        </div>
      </div>
      <!-- מועד ההחזר הצפוי — נגזר מהסטטוס ומחודש ההגשה, ולכן מקומו כאן ולא
           בבלוק פרטי ההוצאה שבו ישב קודם (2026-08-06). -->
      <div class="form-hint form-hint--refund" id="tx-refund-hint" hidden></div>
    </div>

    <div class="form-block">
      <div class="form-grid">
        ${showBank ? `<div class="form-field form-field--wide"><label>פרטי חשבון בנק (רשות)</label>
          <div class="bank-row">
            <input class="field-input" type="text" data-field="bankName" placeholder="בנק" value="${CBA.esc(state.bankName || "")}">
            <input class="field-input" type="text" data-field="bankBranch" placeholder="סניף" value="${CBA.esc(state.bankBranch || "")}">
            <input class="field-input" type="text" data-field="bankAccount" placeholder="חשבון" value="${CBA.esc(state.bankAccount || "")}">
          </div></div>` : ``}
      </div>

      ${editing ? `
      <div class="tx-receipt-actions">
        <label class="btn-ghost btn-sm" for="tx-receipt-file">📎 ${state.receiptUrl ? "החלף קובץ קבלה" : "העלה קובץ קבלה"}</label>
        <input type="file" id="tx-receipt-file" accept="image/*,application/pdf" hidden>
        ${state.receiptUrl ? '<button type="button" class="btn-ghost btn-sm btn-danger" data-del-receipt>מחק קבלה</button>' : ""}
        <span class="tx-receipt-status" id="tx-receipt-status"></span>
      </div>` : `
      <div class="tx-receipt-actions"><span class="tx-receipt-status">אפשר לצרף/להחליף/למחוק קובץ קבלה אחרי השמירה הראשונה</span></div>`}

      <!-- תצוגה מקדימה מקופלת כברירת מחדל (2026-08-06) — הטופס היה ארוך פי שניים
           בגללה, ובלאו הכי יש כפתור עין בטבלה לצפייה מהירה. -->
      ${state.receiptUrl ? `
      <details class="tx-preview-fold">
        <summary class="tx-preview-fold__sum">הצג את הקבלה</summary>
        <div class="tx-preview">
          ${driveId
            ? `<iframe class="tx-preview__frame" src="https://drive.google.com/file/d/${CBA.esc(driveId)}/preview" title="תצוגת קבלה" allow="autoplay" loading="lazy"></iframe>`
            : hasImg
              ? `<img class="tx-preview__img" src="${CBA.esc(state.receiptUrl)}" alt="קבלה" loading="lazy">`
              : `<div class="tx-preview__empty">לא ניתן להציג תצוגה מקדימה לקישור הזה</div>`}
        </div>
      </details>` : ""}

      <!-- שדות טכניים שנדרשים רק לעיתים רחוקות — מקופלים כדי לא להעמיס (2026-08-06) -->
      <details class="tx-adv">
        <summary class="tx-adv__sum">אפשרויות מתקדמות</summary>
        <div class="form-grid tx-adv__body">
          <div class="form-field form-field--wide"><label>קישור לקבלה</label><input class="field-input" type="url" data-field="receiptUrl" value="${CBA.esc(state.receiptUrl || "")}"></div>
        </div>
        <div class="tx-filename">
          <button type="button" class="btn-ghost btn-sm" data-copy-name>העתק שם קובץ</button>
          <span class="tx-filename__val" id="tx-fname" title="${CBA.esc(fileName)}">${CBA.esc(fileName)}</span>
        </div>
      </details>
    </div>

    <!-- פס פעולות דביק (2026-08-06): קודם הוא ישב בתחתית הטופס, אחרי תצוגת
         הקבלה בגובה 460px — כדי לשמור היה צריך לגלול את כל הטופס. עכשיו הוא
         נשאר גלוי תמיד. "מחק" מופרד לצד השני כדי שלא ילחצו עליו בטעות. -->
    <div class="drawer__actions drawer__actions--sticky">
      <div class="drawer__actions-main">
        <button class="btn-primary" data-save>שמור</button>
        <button class="btn-ghost" data-close>ביטול</button>
      </div>
      ${editing ? '<button class="btn-ghost btn-danger" data-delete>מחק</button>' : ""}
    </div>
  `;

  // עדכון ה-state מהשדות
  function collect() {
    form.querySelectorAll("[data-field]").forEach(function (inp) { state[inp.dataset.field] = inp.value; });
    state.amount = parseFloat(state.amount) || 0;
    state.customFields = state.customFields || {};
    form.querySelectorAll("[data-custom-field]").forEach(function (inp) { state.customFields[inp.dataset.customField] = inp.value; });
  }
  // תזכורת מועד החזר צפוי (סעיף 7, 2026-08-06) — מוצגת בטופס גם בזמן המילוי וגם
  // בזמן האישור (זה אותו טופס), רק בהחזר לדייר. מבוססת על CBA.data.expectedRefundDate.
  function refreshRefundHint() {
    const hint = form.querySelector("#tx-refund-hint");
    if (!hint) return;
    const label = CBA.data.expectedRefundDateLabel(state);
    if (label) { hint.hidden = false; hint.textContent = "💰 מועד החזר צפוי לתושב: " + label; }
    else { hint.hidden = true; hint.textContent = ""; }
  }
  // הבלטת בלוק "אישור וסיווג" כל עוד חסרים בו (או בהוצאה בכלל) פרטים שדרושים
  // לפני אישור והעברה להנה"ח — צבע אזהרה (--warn) + פירוט מה חסר, במקום פופ-אפ
  // נפרד. מבוסס על CBA.data.missingApprovalFields, אותה בדיקה שכבר חוסמת את
  // כפתור "העברה להנה"ח" בטבלה הראשית (2026-08-06).
  function refreshApproval() {
    const missing = CBA.data.missingApprovalFields(state);
    const block = form.querySelector("#tx-approval-block");
    const warn = form.querySelector("#tx-approval-warn");
    if (!block) return;
    if (missing.length) {
      block.classList.add("form-block--warn");
      if (warn) { warn.hidden = false; warn.textContent = 'חסר להשלמה לפני אישור והעברה להנה"ח: ' + missing.join(", "); }
    } else {
      block.classList.remove("form-block--warn");
      if (warn) { warn.hidden = true; warn.textContent = ""; }
    }
  }
  /* הערת הבדיקה שייכת לסטטוס "בבדיקה" בלבד: מוצגת רק בו, וברגע שמשנים סטטוס
     לאחר — ההערה נמחקת והשדה נעלם (2026-08-06, לבקשת יועד). המחיקה מתבצעת רק
     בשינוי סטטוס יזום בטופס, ולא בעצם פתיחת הוצאה ישנה לצפייה. */
  function refreshReviewField() {
    const f = form.querySelector("#tx-review-field");
    if (!f) return;
    f.hidden = state.status !== "review";
  }
  function clearReviewNote() {
    state.reviewNote = "";
    const inp = form.querySelector('[data-field="reviewNote"]');
    if (inp) inp.value = "";
  }
  function refreshName() {
    collect();
    const el = form.querySelector("#tx-fname");
    if (el) el.textContent = CBA.data.receiptFileName(state);
    refreshApproval();
    refreshRefundHint();
    refreshReviewField();
  }
  function updateSuggest() {
    const box = form.querySelector("#tx-suggest");
    if (!box) return;
    const sug = txSuggestCategory(state.supplier || state.buyer);
    if (sug && sug.catId !== state.categoryId) {
      box.innerHTML = '<span class="tx-suggest__ico">⚡</span>סיווג אוטומטי מזוהה: <b>' + CBA.esc(sug.catName) + '</b><button type="button" class="tx-suggest__apply" data-apply="' + sug.catId + '">שייך</button>';
      box.hidden = false;
    } else { box.innerHTML = ""; box.hidden = true; }
  }
  // תת-סעיף (סעיף 5, 2026-08-10) — אפשרויות הבורר תלויות בסעיף הנבחר, אז
  // נבנות מחדש בכל שינוי סעיף (בלי ריענון מלא של הטופס כדי לא לאבד פוקוס).
  function refreshSubItemOptions() {
    const sel = form.querySelector("#tx-subitem-select");
    if (!sel) return;
    sel.innerHTML = txSubItemOptions(state.categoryId, state.subItemId);
  }
  form.querySelectorAll("[data-field]").forEach(function (inp) {
    inp.addEventListener("input", function () { refreshName(); updateSuggest(); });
  });
  form.querySelectorAll("[data-custom-field]").forEach(function (inp) {
    inp.addEventListener("input", function () { refreshName(); });
  });
  const suggestBox = form.querySelector("#tx-suggest");
  if (suggestBox) suggestBox.addEventListener("click", function (e) {
    const b = e.target.closest("[data-apply]"); if (!b) return;
    state.categoryId = b.dataset.apply;
    const catSel = form.querySelector('[data-field="categoryId"]'); if (catSel) catSel.value = state.categoryId;
    state.subItemId = "";   // סעיף אחר = תת-הסעיפים הקודמים כבר לא רלוונטיים
    refreshSubItemOptions();
    updateSuggest(); refreshName();
  });
  // מעבר בין סעיפים תקציביים — מרענן את רשימת תת-הסעיפים הזמינים (בורר תלוי-בורר)
  const catSel = form.querySelector('[data-field="categoryId"]');
  if (catSel) catSel.addEventListener("change", function () {
    state.categoryId = catSel.value;
    state.subItemId = "";
    refreshSubItemOptions();
  });
  // בחירת "+ צור תת-סעיף חדש" — מבקש שם, יוצר תת-סעיף אמיתי בסעיף הנבחר
  // (נשמר מיד לגיליון, ר' CBA.data.addCategoryItem) ובוחר אותו מיד בבורר.
  // ביטול/שם ריק — חוזר לבחירה הקודמת ("— ללא —").
  const subItemSel = form.querySelector("#tx-subitem-select");
  if (subItemSel) subItemSel.addEventListener("change", function () {
    if (subItemSel.value !== "__new__") { state.subItemId = subItemSel.value; return; }
    const name = window.prompt("שם תת-הסעיף החדש:");
    if (!name || !name.trim()) { refreshSubItemOptions(); return; }
    CBA.data.addCategoryItem(state.categoryId, name.trim(), function (it) {
      state.subItemId = it ? it.id : "";
      refreshSubItemOptions();
    });
  });
  updateSuggest();
  refreshApproval();
  refreshRefundHint();
  refreshReviewField();

  // שינוי סטטוס יזום: יציאה מ"בבדיקה" מוחקת את ההערה ומעלימה את השדה
  const statusSel = form.querySelector('[data-field="status"]');
  if (statusSel) statusSel.addEventListener("change", function () {
    if (statusSel.value !== "review") clearReviewNote();
    refreshName();
  });

  /* שמירת "טביעת אצבע" של הטופס בפתיחה, כדי לדעת ביציאה אם באמת השתנה משהו
     ולהזהיר רק אז — ולא בכל סגירה (2026-08-06). ר' txCloseDrawer. */
  collect();
  txDirtyBaseline = JSON.stringify(state);
  txDirtyCheck = function () { collect(); return JSON.stringify(state) !== txDirtyBaseline; };

  // autocomplete תושבים בשדה "רוכש/מטפל" — לכל סוגי ההוצאה
  txWireAutocomplete(form, state, residentOptions, "buyer", function () { refreshName(); updateSuggest(); });

  // מעבר בין החזר לדייר / תשלום לספק / הוצאה כללית
  form.querySelectorAll("[data-etype]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      collect();
      state.expenseType = btn.dataset.etype;
      state.payType = state.expenseType === "refund" ? "refund" : "supplier";
      state.source = state.expenseType === "refund" ? "resident" : "admin";
      txRenderForm(container, overlay, state, editing, id, residentOptions);
    });
  });

  // העתקת שם הקובץ ללוח
  form.querySelector("[data-copy-name]").addEventListener("click", function (e) {
    collect();
    const name = CBA.data.receiptFileName(state);
    txCopy(name);
    e.target.textContent = "הועתק ✓";
    setTimeout(function () { e.target.textContent = "העתק שם קובץ"; }, 1500);
  });

  // העלאה/החלפה בפועל של קובץ קבלה (סעיף 4, 2026-08-06) — רק בעריכת תנועה קיימת
  // (יש id אמיתי בגיליון). מוחקת בפועל את הקובץ הישן ב-Drive (לא רק מנתקת קישור).
  const receiptFileInput = form.querySelector("#tx-receipt-file");
  const receiptStatusEl = form.querySelector("#tx-receipt-status");
  if (receiptFileInput) receiptFileInput.addEventListener("change", function () {
    const file = receiptFileInput.files && receiptFileInput.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      window.alert("הקובץ גדול מדי (מקסימום 8MB).");
      receiptFileInput.value = "";
      return;
    }
    collect();
    if (receiptStatusEl) receiptStatusEl.textContent = "מעלה…";
    const reader = new FileReader();
    reader.onload = function () {
      const base64 = String(reader.result).split(",")[1];
      // uploadReceiptFile עובר ב-postRead (לא push) — לא נספר אוטומטית
      // ב-inFlightWrites, אז מסמנים ידנית (ר' מדיניות רענון נתונים).
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("expenseReceiptFile");
      CBA.data.uploadReceiptFile(state, {
        dataBase64: base64,
        mimeType: file.type || "application/octet-stream",
        fileName: CBA.data.receiptFileName(state)
      }, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("expenseReceiptFile");
        if (res && res.ok) {
          state.receiptUrl = res.url;
          txRenderForm(container, overlay, state, editing, id, residentOptions);
        } else {
          if (receiptStatusEl) receiptStatusEl.textContent = "";
          window.alert("העלאה נכשלה: " + ((res && res.error) || "שגיאה לא ידועה"));
        }
      });
    };
    reader.onerror = function () {
      if (receiptStatusEl) receiptStatusEl.textContent = "";
      window.alert("קריאת הקובץ נכשלה.");
    };
    reader.readAsDataURL(file);
  });
  const delReceiptBtn = form.querySelector("[data-del-receipt]");
  if (delReceiptBtn) delReceiptBtn.addEventListener("click", function () {
    if (!window.confirm("למחוק את קובץ הקבלה? הפעולה מוחקת את הקובץ בפועל מ-Drive, לא רק מנתקת את הקישור.")) return;
    collect();
    delReceiptBtn.disabled = true;
    if (CBA.sheets.markDirty) CBA.sheets.markDirty("expenseReceiptFile");
    CBA.data.deleteReceiptFile(state, function (res) {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("expenseReceiptFile");
      delReceiptBtn.disabled = false;
      if (res && res.ok) {
        state.receiptUrl = "";
        state.fileName = "";
        txRenderForm(container, overlay, state, editing, id, residentOptions);
      } else {
        window.alert("מחיקה נכשלה: " + ((res && res.error) || "שגיאה לא ידועה"));
      }
    });
  });

  form.querySelector("[data-save]").addEventListener("click", function () {
    collect();
    if (!state.month && state.date) state.month = state.date.slice(0, 7);
    const fields = {
      date: state.date, month: state.month, year: state.year, buyer: state.buyer, supplier: state.supplier,
      bankName: state.bankName, bankBranch: state.bankBranch, bankAccount: state.bankAccount, amount: state.amount, categoryId: state.categoryId, source: state.source,
      expenseType: state.expenseType, payType: state.payType, status: state.status, reviewNote: state.reviewNote, description: state.description, receiptUrl: state.receiptUrl,
      familyId: (state.familyId != null ? state.familyId : ""),
      // תת-סעיף (רשות, סעיף 5, 2026-08-10) — "" אם לא שויך תת-סעיף ספציפי
      subItemId: (state.subItemId && state.subItemId !== "__new__") ? state.subItemId : "",
      customFields: state.customFields || {}
    };
    if (editing) CBA.data.updateTransaction(id, fields);
    else CBA.data.addTransaction(fields);
    txForceCloseDrawer();   // נשמר — בלי אזהרה
    CBA.screens.expenses.render(container);
  });
  const delBtn = form.querySelector("[data-delete]");
  if (delBtn) delBtn.addEventListener("click", function () {
    if (window.confirm("למחוק את התנועה?")) {
      CBA.data.deleteTransaction(id);
      txForceCloseDrawer();   // נמחק — בלי אזהרה
      CBA.screens.expenses.render(container);
    }
  });
  overlay.querySelectorAll("[data-close]").forEach(function (el) { el.addEventListener("click", txCloseDrawer); });
}

function txCopy(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  else {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    ta.remove();
  }
}
/* מעקב שינויים שלא נשמרו (2026-08-06) — קודם כל סגירה מחקה הכול בשקט.
   txDirtyCheck נקבע בעת בניית הטופס; מתאפס בכל סגירה כדי שלא ידלוף לחלון הבא. */
var txDirtyBaseline = null;
var txDirtyCheck = null;
function txForceCloseDrawer() {
  const el = document.getElementById("cba-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", txEscDrawer);
  txDirtyBaseline = null;
  txDirtyCheck = null;
}
function txCloseDrawer() {
  if (txDirtyCheck) {
    var dirty = false;
    try { dirty = txDirtyCheck(); } catch (e) { dirty = false; }
    if (dirty && !window.confirm("יש שינויים שלא נשמרו. לצאת בלי לשמור?")) return;
  }
  txForceCloseDrawer();
}
function txEscDrawer(e) { if (e.key === "Escape") txCloseDrawer(); }
