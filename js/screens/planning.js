/* מסך "בניית תקציב".
   פריסה לרוחב: מימין מקורות ההכנסה (כולל מחשבון מיסים), משמאל סעיפי ההוצאה
   לפי קבוצות (זו לצד זו), ולמטה שורה תחתונה רחבה — הכנסות מול הוצאות.
   ניתן לערוך שמות וסכומים, להוסיף/להסיר סעיפים, קבוצות ומקורות הכנסה.
   העריכה משנה בזיכרון בלבד; שמירה קבועה תגיע עם החיבור ל-Google Sheets. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

var planShowCompare = false; // האם מוצגת השוואה לשנה קודמת
var planCompareYear = null;  // איזו שנה מושווית

// תצוגה להצגה (סעיף 6, 2026-08-10) — מתג בין מצב "עריכה" (המסך הרגיל, מלא
// שדות ופקדים) למצב "תצוגה": אותה פריסת קבוצות+כרטיסים, אבל סטטית וקומפקטית
// (בלי שדות/כפתורי עריכה, בלי צורך לרחף כדי לראות פירוט) — לשימוש בהצגות
// לוועד השיכון, כדי שהתקציב כולו ייראה בתמונה אחת. ר' planPresentHTML למטה.
var planViewMode = false;
/* מצב התצוגה להצגה (2026-09-09) — ברמת המודול, כדי לשרוד ציור-מחדש של המסך.
   planPresentOpen מחזיק *עקיפה* לכל סעיף (true/false), ולכן חייב להיות
   undefined ולא false כברירת מחדל — אחרת "הרחב הכל" לא היה משפיע על סעיף
   שהמשתמש נגע בו פעם אחת. */
var planPresentOpen = {};
var planPresentExpandAll = false;
var planPresentAxis = "group";   // "group" = לפי תחום · "fund" = לפי מקור מימון
/* ==== תוספות 2026-09-09 — כולן כבויות כברירת מחדל ====
   הדרישה של יועד: "תוספות על הקיים, המצב הקיים יישמר". לכן שני המתגים
   האלה מתחילים כבויים, וכשהם כבויים הפלט של מצב התצוגה זהה בדיוק למה
   שהיה לפני התוספת (יש על זה בדיקת רגרסיה — ר' scratch/t_present.js). */
var planPresentActual = false;   // false = כרטיסי תכנון בלבד, כמו היום
var planPresentChart  = null;    // null = אין גרף פתוח · "pace" · "util"
var planActualMap     = null;    // ביצוע לפי מזהה סעיף, מחושב פעם אחת לציור

// סמליל "פנקס הערות" (סעיף 1) — דף+קווים, באותו סגנון SVG כמו NAV_ICONS ב-app.js
var PLAN_NOTES_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M9.5 12h6M9.5 16h4"/></svg>';

// סמליל "חלוקה חודשית לתת-סעיף" (סעיף 7ג, 2026-08-10) — לוח שנה, פותח את
// חלון עריכת החלוקה של תת-הסעיף. ר' planItemsHTML/planOpenItemDistModal למטה.
var PLAN_DIST_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

CBA.screens.planning = {
  title: "בניית תקציב",

  render(container) {
    const years = CBA.data.getComparisonYears();
    if (planShowCompare && (!planCompareYear || years.indexOf(planCompareYear) === -1)) {
      planCompareYear = years[0] || null;
    }
    const groups = CBA.data.getGroups();
    const cats = CBA.data.getCategories();
    const income = CBA.data.getIncomeSources();

    const groupsHTML = groups.map(function (g, gi) {
      const rows = cats.filter(function (c) { return c.group === g.id; });
      return `
        <div class="plan-group" data-group-drop="${CBA.esc(g.id)}">
          <div class="plan-group__head">
            <input class="txt-input txt-input--group" data-group-name="${CBA.esc(g.id)}" value="${CBA.esc(g.name)}">
            <span class="plan-group__sub" id="pg-${planKey(g.id)}"></span>
            <button class="mini-move" data-move-group="up" data-group="${CBA.esc(g.id)}" title="הזז קבוצה ימינה"${gi === 0 ? " disabled" : ""}>→</button>
            <button class="mini-move" data-move-group="down" data-group="${CBA.esc(g.id)}" title="הזז קבוצה שמאלה"${gi === groups.length - 1 ? " disabled" : ""}>←</button>
            <button class="mini-x" data-remove-group="${CBA.esc(g.id)}" title="הסר קבוצה">×</button>
          </div>
          ${rows.map(function (c) {
            const upd = planIsUpdated(c);
            return `
              <div class="plan-item${upd ? " is-updated" : ""}" data-item="${CBA.esc(c.id)}">
                <div class="plan-item__head">
                  <input class="txt-input" data-cat-name="${CBA.esc(c.id)}" value="${CBA.esc(c.name)}">
                  <span class="plan-item__actions">
                    <span class="grip" data-drag="${CBA.esc(c.id)}" title="גרור לקבוצה או למקור הכנסה">⠿</span>
                    <button class="mini-x" data-remove-cat="${CBA.esc(c.id)}" title="הסר סעיף">×</button>
                  </span>
                </div>
                <input class="num-input num-input--full" type="number" inputmode="numeric" data-cat="${CBA.esc(c.id)}" value="${c.plan}">
                ${planBaselineLine(c)}
                ${planShowCompare ? planCompareLine(c) : ""}
                ${c.items && c.items.length ? "" : `<div class="dist-chip" data-chip="${CBA.esc(c.id)}">${planDistLabel(c)} · ${planSourceName(c)}</div>`}
                <div class="plan-item__more">
                  ${planSourceSplitHTML(c)}
                  ${planItemsHTML(c)}
                  ${c.items && c.items.length ? "" : planDistControl(c)}
                </div>
              </div>`;
          }).join("")}
          <button class="add-btn" data-add-cat="${CBA.esc(g.id)}">+ הוסף סעיף</button>
        </div>`;
    }).join("");

    const incomeHTML = income.map(planIncomeRow).join("");

    const editModeHTML = `
      <div class="plan-cols">
        <div class="card plan-income-card">
          <div class="plan-section-title">מקורות הכנסה</div>
          <div class="alloc-banner" id="alloc-banner" hidden></div>
          ${incomeHTML}
          <button class="add-btn" data-add-income>+ הוסף מקור הכנסה</button>
        </div>

        <div class="card plan-expense-card">
          <div class="plan-toolbar">
            <div class="plan-section-title" style="margin-bottom:0;">סעיפי הוצאה מתוכננים</div>
            <div class="plan-toolbar__actions">
              <button class="btn-ghost" data-toggle-compare>${planShowCompare ? "הסתר השוואה" : "השוואה לשנה קודמת"}</button>
              ${planShowCompare ? `<select class="year-select" data-compare-year>${planYearOptions()}</select>` : ""}
              ${planShowCompare ? '<button class="btn-ghost" data-copy-base>העתק שנה כבסיס</button>' : ""}
            </div>
          </div>
          <div class="plan-note" id="plan-annual"></div>
          <div class="plan-groups">${groupsHTML}</div>
          ${planShowCompare ? planExtrasHTML() : ""}
          <button class="add-btn add-btn--wide" data-add-group>+ הוסף קבוצה</button>
        </div>
      </div>`;

    container.innerHTML = `
      <button class="notes-side-tab" type="button" id="notes-side-tab" data-open-notes title="פנקס הערות כלליות לשנה זו">
        <span class="notes-side-tab__ico">${PLAN_NOTES_ICON}</span>
        <span class="notes-side-tab__label">הערות</span>
      </button>

      <div class="screen-controls">
        <div class="phase-ctrl">${planPhaseControl()}</div>
        <button class="btn-ghost" type="button" data-toggle-present>${planViewMode ? "חזרה לעריכה" : "תצוגה להצגה"}</button>
      </div>

      ${planViewMode ? planPresentHTML(groups, cats, income) : editModeHTML}

      <div class="card bottomline-bar${planViewMode ? " bottomline-bar--present" : ""}">
        ${planViewMode ? planPresentStripHTML(groups, cats, income) : ""}
        <div class="bl-cell">
          <div class="bl-cell__label">הכנסות</div>
          <div class="bl-cell__val" id="bl-income"></div>
        </div>
        <div class="bl-cell">
          <div class="bl-cell__label">הוצאות מתוכננות</div>
          <div class="bl-cell__val" id="bl-expense"></div>
        </div>
        <div class="bl-cell bl-cell--result">
          <div class="bl-cell__label" id="bl-label">עודף / גירעון</div>
          <div class="bl-cell__val" id="bl-balance"></div>
        </div>
      </div>
    `;

    planBind(container);
    planRecompute(container);

    // אנימציה עדינה: פסי מאזן המימון מתמלאים בטעינה
    requestAnimationFrame(function () {
      container.querySelectorAll(".alloc__fill").forEach(function (f) {
        const w = f.style.width; f.style.width = "0";
        requestAnimationFrame(function () { f.style.width = w; });
      });
    });
  }
};

/* שורת מקור הכנסה — במצב מנוחה: שם + סכום בולט (+ רמז אפור למיסי שיכון).
   בריחוף/מיקוד נפתח העורך (מחשבון המיסים או שדה הסכום) + מאזן המימון. */
function planIncomeRow(s) {
  if (s.type === "dues") {
    return `
      <div class="income-item" data-income-drop="${CBA.esc(s.id)}">
        <div class="income-item__head">
          <span class="income-item__name">${CBA.esc(s.name)}</span>
          <span class="income-item__amount" id="inc-amt-${planKey(s.id)}"></span>
        </div>
        <div class="income-item__hint" id="dues-hint"></div>
        <div class="income-item__more">
          <div class="dues-calc">
            <div class="dues-field"><label>משפחות</label><input class="num-input" type="number" data-dues="families" value="${s.families}"></div>
            <div class="dues-field"><label>תעריף</label><input class="num-input" type="number" data-dues="rate" value="${s.rate}"></div>
            <div class="dues-field"><label>חודשים</label><input class="num-input" type="number" data-dues="months" value="${s.months}"></div>
            <div class="dues-field dues-field--wide"><label>חודש אחרון (מספר משפחות)</label><input class="num-input" type="number" data-dues="tailFamilies" value="${s.tailFamilies}"></div>
          </div>
        </div>
        <div class="alloc" id="alloc-${planKey(s.id)}"></div>
      </div>`;
  }
  return `
    <div class="income-item" data-income-drop="${CBA.esc(s.id)}">
      <div class="income-item__head">
        <input class="txt-input income-item__name-input" data-income-name="${CBA.esc(s.id)}" value="${CBA.esc(s.name)}">
        <span class="income-item__amount" id="inc-amt-${planKey(s.id)}"></span>
      </div>
      <div class="income-item__more">
        <div class="income-edit">
          <input class="num-input" type="number" inputmode="numeric" data-src="${CBA.esc(s.id)}" value="${s.amount}">
          <button class="mini-x" data-remove-income="${CBA.esc(s.id)}" title="הסר מקור">×</button>
        </div>
      </div>
      <div class="alloc" id="alloc-${planKey(s.id)}"></div>
    </div>`;
}

/* חיבור אירועים */
function planBind(container) {
  const rerender = function () { CBA.screens.planning.render(container); };

  // מתג תצוגה להצגה (סעיף 6, 2026-08-10)
  const presentBtn = container.querySelector("[data-toggle-present]");
  if (presentBtn) presentBtn.addEventListener("click", function () {
    planViewMode = !planViewMode;
    rerender();
  });
  // מצב תצוגה — אין עריכה מכאן והלאה, רק הגלילה בריחוף ופקדי התצוגה
  if (planViewMode) { planBindPresentScroll(container); planBindPresent(container, rerender); return; }

  // שמירה אוטומטית לגיליון בכל סיום עריכת שדה (blur/change).
  // נרשם פעם אחת בלבד — ה-dataset שורד ציור-מחדש (innerHTML לא מוחק את container עצמו).
  if (!container.dataset.saveBound) {
    container.dataset.saveBound = "1";
    container.addEventListener("change", function (e) {
      if (e.target && e.target.matches("input, select")) planSave();
    });
  }

  // עריכת סכומי סעיפים
  container.querySelectorAll("[data-cat]").forEach(function (inp) {
    // תופסים את הערך שלפני העריכה — בשביל רישום ביומן העדכונים
    inp.addEventListener("focus", function () { inp.dataset.startVal = inp.value; });
    inp.addEventListener("input", function () {
      const c = findCat(inp.dataset.cat);
      if (c) c.plan = planNum(inp.value);
      planRecompute(container);
    });
    // כשהתקציב סגור — כל שינוי מסתיים ברישום ליומן "עדכוני תקציב" ובציור מחדש
    inp.addEventListener("change", function () {
      if (CBA.data.getBudgetPhase() === "locked") {
        const from = planNum(inp.dataset.startVal), to = planNum(inp.value);
        if (Math.round(from) !== Math.round(to)) {
          CBA.data.logBudgetUpdate(inp.dataset.cat, from, to);
        }
        rerender();
      }
    });
  });
  // עריכת שמות סעיפים — תוך כדי הקלדה מעדכן שם; בסיום (blur) מבצע "הגירה":
  // מזהה הסעיף מתעדכן והתנועות הישנות עוברות איתו לשם החדש (בגיליון ובזיכרון).
  container.querySelectorAll("[data-cat-name]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const c = findCat(inp.dataset.catName);
      if (c) c.name = inp.value;
    });
    inp.addEventListener("change", function () {
      const oldId = inp.dataset.catName;
      if (inp.value && inp.value.trim() && inp.value.trim() !== oldId) {
        CBA.data.renameCategory(oldId, inp.value);
        rerender();   // ריענון: מזהים חדשים + ביצוע מוצלב מחדש
      }
    });
  });
  // שיוך סעיף למקור הכנסה — מעדכן גם את מאזן המימון וגם את השבב
  container.querySelectorAll("[data-cat-src]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      const c = findCat(sel.dataset.catSrc);
      if (c) c.incomeSourceId = sel.value;
      CBA.screens.planning.render(container);
    });
  });

  // פיצול סעיף בין כמה מקורות הכנסה (סעיף 4, 2026-08-10)
  container.querySelectorAll("[data-split-source]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.splitSource);
      if (!c) return;
      const sources = CBA.data.getIncomeSources();
      const other = sources.find(function (s) { return s.id !== c.incomeSourceId; }) || sources[0];
      // שורה ראשונה = המקור/סכום הנוכחיים, שורה שנייה ריקה — כדי שהמסך יראה
      // מיד את שתי השורות המוכנות לעריכה, ולא רק כפתור "הוסף" ריק.
      c.sources = [
        { incomeSourceId: c.incomeSourceId, amount: c.plan || 0 },
        { incomeSourceId: other ? other.id : c.incomeSourceId, amount: 0 }
      ];
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-split-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.splitAdd);
      if (!c || !c.sources) return;
      const used = c.sources.map(function (s) { return s.incomeSourceId; });
      const sources = CBA.data.getIncomeSources();
      const unused = sources.find(function (s) { return used.indexOf(s.id) === -1; });
      c.sources.push({ incomeSourceId: unused ? unused.id : (sources[0] ? sources[0].id : ""), amount: 0 });
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-split-remove]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.splitRemove);
      if (!c || !c.sources) return;
      const idx = parseInt(btn.dataset.splitIdx, 10);
      c.sources.splice(idx, 1);
      // פחות משתי שורות = כבר לא "מפוצל" — חוזרים למקור יחיד (השורה שנשארה, אם יש)
      if (c.sources.length < 2) {
        if (c.sources.length === 1) c.incomeSourceId = c.sources[0].incomeSourceId;
        c.sources = null;
      }
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-split-cancel]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.splitCancel);
      if (!c) return;
      if (c.sources && c.sources[0]) c.incomeSourceId = c.sources[0].incomeSourceId;
      c.sources = null;
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-split-src]").forEach(function (sel) {
    sel.addEventListener("change", function () {
      const c = findCat(sel.dataset.splitSrc);
      if (!c || !c.sources) return;
      const idx = parseInt(sel.dataset.splitIdx, 10);
      if (c.sources[idx]) c.sources[idx].incomeSourceId = sel.value;
      if (idx === 0) c.incomeSourceId = sel.value;
      CBA.screens.planning.render(container);
    });
  });
  container.querySelectorAll("[data-split-amt]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const c = findCat(inp.dataset.splitAmt);
      if (!c || !c.sources) return;
      const idx = parseInt(inp.dataset.splitIdx, 10);
      if (c.sources[idx]) c.sources[idx].amount = planNum(inp.value);
      planRecompute(container);
      const warnEl = container.querySelector("#split-warn-" + planKey(c.id));
      if (warnEl) warnEl.innerHTML = planSplitWarnHTML(c);
    });
  });

  // פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10)
  container.querySelectorAll("[data-itemize-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.itemizeCat);
      if (!c) return;
      c.items = [CBA.data.newCategoryItem("פריט חדש", c.plan || 0)];
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-item-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.itemAdd);
      if (!c || !c.items) return;
      c.items.push(CBA.data.newCategoryItem("פריט חדש", 0));
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-item-remove]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.itemRemove);
      if (!c || !c.items) return;
      const idx = parseInt(btn.dataset.itemIdx, 10);
      c.items.splice(idx, 1);
      if (!c.items.length) c.items = null;   // בלי פריטים = לא מפורט (סעיף 5)
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-item-cancel]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.itemCancel);
      if (!c) return;
      c.items = null;
      planSave();
      rerender();
    });
  });
  // שינוי שם פריט — תוך כדי הקלדה מעדכן שם; בסיום (blur) מבצע "מיגרציה" (כמו
  // שמות קבוצה/סעיף): מזהה הפריט מתעדכן ותנועות ששויכו אליו עוברות איתו.
  container.querySelectorAll("[data-item-name]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const c = findCat(inp.dataset.itemName);
      if (!c || !c.items) return;
      const idx = parseInt(inp.dataset.itemIdx, 10);
      if (c.items[idx]) c.items[idx].name = inp.value;
    });
    inp.addEventListener("change", function () {
      const c = findCat(inp.dataset.itemName);
      if (!c || !c.items) return;
      const idx = parseInt(inp.dataset.itemIdx, 10);
      const it = c.items[idx];
      if (it && inp.value && inp.value.trim()) CBA.data.renameCategoryItem(c.id, it.id, inp.value.trim());
    });
  });
  container.querySelectorAll("[data-item-plan]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const c = findCat(inp.dataset.itemPlan);
      if (!c || !c.items) return;
      const idx = parseInt(inp.dataset.itemIdx, 10);
      if (c.items[idx]) c.items[idx].plan = planNum(inp.value);
      const warnEl = container.querySelector("#item-warn-" + planKey(c.id));
      if (warnEl) warnEl.innerHTML = planItemWarnHTML(c);
    });
  });
  // חלוקה חודשית לתת-סעיף בודד (סעיף 7ג, 2026-08-10) — כפתור קטן ליד כל
  // תת-סעיף פותח חלון עריכה ייעודי (שווה/מותאם/שנתי, כולל עורך 12 החודשים
  // במצב "מותאם") — ר' planOpenItemDistModal.
  container.querySelectorAll("[data-item-dist]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      planOpenItemDistModal(container, btn.dataset.itemDist, parseInt(btn.dataset.itemIdx, 10));
    });
  });

  // בחירת מצב חלוקה (הכפתור המחולק לשלושה)
  container.querySelectorAll("[data-dist-mode]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.cat);
      if (!c) return;
      c.dist.mode = btn.dataset.distMode;
      if (c.dist.mode === "custom") {
        if (!c.dist.monthly) c.dist.monthly = planEqualArray(c);
        CBA.screens.planning.render(container);
        planOpenCustomModal(container, c.id);
      } else {
        planSave();
        CBA.screens.planning.render(container);
      }
    });
  });
  // עריכת מספר החודשים (מצב "שווה") — עדכון השבב בזמן אמת
  container.querySelectorAll("[data-dist-months]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const c = findCat(inp.dataset.distMonths);
      if (!c) return;
      c.dist.months = Math.max(1, Math.min(12, planNum(inp.value) || 1));
      const chip = container.querySelector('[data-chip=' + CSS.escape(c.id) + ']');
      // innerHTML ולא textContent: planSourceName מחזירה סימון תקלה כ-HTML
      // (השם עצמו כבר עובר CBA.esc בתוכה)
      if (chip) chip.innerHTML = planDistLabel(c) + " · " + planSourceName(c);
    });
  });
  // עריכת שמות קבוצות — תוך כדי הקלדה מעדכן שם; בסיום (blur) מבצע "מיגרציה"
  // כדי שמזהה הקבוצה יעודכן והסעיפים המשויכים יעברו איתו (שמירה עקבית לגיליון).
  container.querySelectorAll("[data-group-name]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      CBA.data.updateGroup(inp.dataset.groupName, { name: inp.value });
    });
    inp.addEventListener("change", function () {
      CBA.data.renameGroup(inp.dataset.groupName, inp.value);
    });
  });
  // עריכת מקורות הכנסה קבועים
  container.querySelectorAll("[data-src]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const s = findIncome(inp.dataset.src);
      if (s) s.amount = planNum(inp.value);
      planRecompute(container);
    });
  });
  container.querySelectorAll("[data-income-name]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const s = findIncome(inp.dataset.incomeName);
      if (s) s.name = inp.value;
    });
    // בסיום עריכה — "מיגרציה": מזהה המקור מתעדכן והסעיפים המשויכים עוברים איתו.
    inp.addEventListener("change", function () {
      CBA.data.renameIncomeSource(inp.dataset.incomeName, inp.value);
    });
  });
  // מחשבון מיסים
  container.querySelectorAll("[data-dues]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      const dues = CBA.data.getDuesSource();
      if (dues) dues[inp.dataset.dues] = planNum(inp.value);
      planRecompute(container);
    });
  });

  // גרירת סעיף (מנגנון עצמאי) — יעד: קבוצה או מקור הכנסה
  planSetupDrag(container);

  // הוספה / הסרה (שינוי מבני -> ציור מחדש)
  container.querySelectorAll("[data-add-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const newCat = CBA.data.addCategory({ group: btn.dataset.addCat });
      planSave();
      rerender();
      // בעבר הסעיף החדש נולד "סגור" (הפאנל המורחב נגלה רק בריחוף/מיקוד),
      // כך שבפועל היה נראה כאילו הוא "נסגר" מיד אחרי ההוספה וצריך לפתוח
      // אותו שוב כדי לערוך שם/מקור מימון/חלוקה. עכשיו ממקדים מיד את שדה
      // השם של הסעיף החדש — זה גם פותח את הפאנל (דרך :focus-within) וגם
      // מסמן את הטקסט כדי שאפשר להתחיל להקליד שם מיד (משוב יועד, 2026-08-10).
      planFocusNewCategory(container, newCat.id);
    });
  });
  /* (2026-09-09) שתי המחיקות כאן היו הפעולות ההרסניות היחידות באפליקציה
     שרצו בלי אישור — לחיצה אחת על ה-"×" הקטן שצמוד לשדה השם, ותוך 700ms
     (ה-debounce של planSave) השורה נמחקת פיזית מהגיליון ע"י reconcileRows_.
     מחיקת **קבוצה** גרועה עוד יותר: removeGroup מסננת גם את כל הסעיפים
     ששייכים לה, כלומר לחיצה אחת מוחקת כמה שורות בבת אחת.
     ומלכודת נוספת: מנגנון ה-beforeunload שנבנה כדי שלא יאבדו שמירות עובד
     כאן *נגד* המשתמש — גם סגירת הטאב מיד לא מבטלת את המחיקה.
     האזהרה סופרת תנועות מקושרות, כי סעיף עם תנועות משאיר אותן "יתומות":
     הן לא נמחקות, אבל הן נעלמות מכל תצוגה שמקבצת לפי סעיף. */
  function planTxCount(catId) {
    try {
      var all = (CBA.data.getTransactions && CBA.data.getTransactions()) || [];
      return all.filter(function (t) { return String(t.categoryId || "") === String(catId); }).length;
    } catch (e) { return 0; }
  }
  function planTxNote(n) {
    if (!n) return "";
    return n === 1
      ? " יש תנועה אחת שמשויכת אליו, והיא תישאר בלי סעיף."
      : " יש " + n + " תנועות שמשויכות אליו, והן יישארו בלי סעיף.";
  }

  container.querySelectorAll("[data-remove-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var catId = btn.dataset.removeCat;
      CBA.ui.confirm(
        'הסעיף "' + catId + '" יימחק מהתקציב, כולל התכנון והחלוקה החודשית שלו.' +
        planTxNote(planTxCount(catId)) + " אי אפשר לשחזר מתוך האפליקציה.",
        { title: "למחוק את הסעיף?", okText: "כן, מחק סעיף", danger: true }
      ).then(function (ok) {
        if (!ok) return;
        CBA.data.removeCategory(catId);
        planSave();
        rerender();
        CBA.ui.toast("הסעיף נמחק");
      });
    });
  });
  const addGroup = container.querySelector("[data-add-group]");
  if (addGroup) addGroup.addEventListener("click", function () {
    CBA.data.addGroup();
    planSave();
    rerender();
  });
  container.querySelectorAll("[data-remove-group]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var gid = btn.dataset.removeGroup;
      var kids = [];
      try {
        kids = ((CBA.data.getCategories && CBA.data.getCategories()) || [])
          .filter(function (c) { return String(c.group || "") === String(gid); });
      } catch (e) { kids = []; }
      var txTotal = 0;
      kids.forEach(function (c) { txTotal += planTxCount(c.id); });

      var msg = kids.length
        ? 'הקבוצה "' + gid + '" תימחק, ואיתה ' +
          (kids.length === 1 ? "גם הסעיף שבתוכה" : "גם כל " + kids.length + " הסעיפים שבתוכה") +
          ": " + kids.map(function (c) { return c.id; }).join(" · ") + "."
        : 'הקבוצה "' + gid + '" תימחק. אין בה סעיפים.';
      /* משפט נפרד ולא המשך של רשימת הסעיפים: אחרי רשימה שמסתיימת בשם סעיף,
         מספר שמתחיל משפט חדש נקרא רגע כאילו הוא חלק מהשם. */
      if (txTotal) {
        msg += txTotal === 1
          ? " בנוסף, תנועה אחת משויכת אליהם ותישאר בלי סעיף."
          : " בנוסף, " + txTotal + " תנועות משויכות אליהם ויישארו בלי סעיף.";
      }
      msg += " אי אפשר לשחזר מתוך האפליקציה.";

      CBA.ui.confirm(msg, {
        title: kids.length ? "למחוק את הקבוצה ואת הסעיפים שבה?" : "למחוק את הקבוצה?",
        okText: "כן, מחק", danger: true
      }).then(function (ok) {
        if (!ok) return;
        CBA.data.removeGroup(gid);
        planSave();
        rerender();
        CBA.ui.toast(kids.length ? "הקבוצה והסעיפים שבה נמחקו" : "הקבוצה נמחקה");
      });
    });
  });
  // סדר קבוצות (סעיף 2) — חצים פשוטים ליד ה-X, מזיזים מקום אחד ושומרים
  container.querySelectorAll("[data-move-group]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      CBA.data.moveGroup(btn.dataset.group, btn.dataset.moveGroup);
      planSave();
      rerender();
    });
  });
  const addIncome = container.querySelector("[data-add-income]");
  if (addIncome) addIncome.addEventListener("click", function () {
    CBA.data.addIncomeSource();
    planSave();
    rerender();
  });

  // שני שלבים: סגירה / פתיחה מחדש / הצגת עדכונים
  const lockBtn = container.querySelector("[data-lock-budget]");
  // (2026-08-19, ממצא 2.6) שתי הפעולות הכי משמעותיות במסך — סגירת התקציב
  // ופתיחתו מחדש — נעשו דרך חלון אישור אפור של הדפדפן. עכשיו מודל של
  // האפליקציה, ופתיחה-מחדש (שמוחקת את הבסיס המאושר) מסומנת כפעולה הרסנית.
  if (lockBtn) lockBtn.addEventListener("click", function () {
    CBA.ui.confirm('המערכת תעבור למצב ביצוע, וכל שינוי בתכנון מכאן והלאה יסומן כ"עדכון תקציב".',
      { title: "לסגור את התקציב?", okText: "כן, סגור תקציב" }
    ).then(function (ok) {
      if (!ok) return;
      CBA.data.lockBudget();
      rerender();
      CBA.ui.toast("התקציב נסגר");
    });
  });
  const reopenBtn = container.querySelector("[data-reopen-budget]");
  if (reopenBtn) reopenBtn.addEventListener("click", function () {
    CBA.ui.confirm("הבסיס המאושר יימחק והמערכת תחזור למצב תכנון. אי אפשר לשחזר את הבסיס אחר כך.",
      { title: "לפתוח מחדש את התקציב לעריכה?", okText: "כן, פתח מחדש", danger: true }
    ).then(function (ok) {
      if (!ok) return;
      CBA.data.reopenBudget();
      rerender();
      CBA.ui.toast("התקציב נפתח לעריכה");
    });
  });
  const showUpd = container.querySelector("[data-show-updates]");
  if (showUpd) showUpd.addEventListener("click", function () { planOpenUpdatesModal(container); });

  // פנקס הערות (סעיף 1) — לשונית עם סמליל, פותחת drawer נפרד (notes.js)
  const notesBtn = container.querySelector("[data-open-notes]");
  if (notesBtn) notesBtn.addEventListener("click", function () { CBA.notesPanel.open(); });

  // השוואה לשנה קודמת
  const toggleCmp = container.querySelector("[data-toggle-compare]");
  if (toggleCmp) toggleCmp.addEventListener("click", function () {
    planShowCompare = !planShowCompare;
    rerender();
  });
  const yearSel = container.querySelector("[data-compare-year]");
  if (yearSel) yearSel.addEventListener("change", function () {
    planCompareYear = yearSel.value;
    rerender();
  });
  // העתקת שנה שלמה כבסיס
  const copyBase = container.querySelector("[data-copy-base]");
  if (copyBase) copyBase.addEventListener("click", function () {
    CBA.data.getCategories().forEach(function (c) {
      const p = CBA.data.getYearPlan(planCompareYear, c.id);
      if (p !== null) CBA.data.updateCategory(c.id, { plan: p });
    });
    planSave();
    rerender();
  });
  // לחיצה על סכום שנה קודמת — מעתיקה רק אותו
  container.querySelectorAll("[data-copy-prev]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const c = findCat(btn.dataset.copyPrev);
      const p = CBA.data.getYearPlan(planCompareYear, btn.dataset.copyPrev);
      if (c && p !== null) c.plan = p;
      planSave();
      rerender();
    });
  });
  // הוספת סעיף שהיה בשנה קודמת ואינו כעת
  container.querySelectorAll("[data-add-extra]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      CBA.data.addCategory({
        id: btn.dataset.addExtra, name: btn.dataset.addName,
        plan: planNum(btn.dataset.addPlan), group: "misc"
      });
      planSave();
      rerender();
    });
  });
  container.querySelectorAll("[data-remove-income]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      CBA.data.removeIncomeSource(btn.dataset.removeIncome);
      planSave();
      rerender();
    });
  });
}

/* חישוב מחדש של הסכומים המוצגים */
function planRecompute(container) {
  CBA.data.getGroups().forEach(function (g) {
    const sub = container.querySelector("#pg-" + planKey(g.id));
    if (!sub) return;
    const total = CBA.data.getCategories()
      .filter(function (c) { return c.group === g.id; })
      .reduce(function (s, c) { return s + (c.plan || 0); }, 0);
    sub.innerHTML = "<b>" + CBA.formatILS(total) + "</b>";
  });

  // סכום מפורמט (עם ₪) לכל מקור הכנסה — אחיד לכולם
  CBA.data.getIncomeSources().forEach(function (s) {
    const el = container.querySelector("#inc-amt-" + planKey(s.id));
    if (el) el.textContent = CBA.formatILS(s.computed || 0);
  });
  const duesSrc = CBA.data.getIncomeSources().find(function (s) { return s.type === "dues"; });
  const duesHint = container.querySelector("#dues-hint");
  if (duesHint && duesSrc) {
    const charges = duesSrc.families * duesSrc.months + duesSrc.tailFamilies * (duesSrc.tailMonths || 1);
    duesHint.textContent = CBA.formatILS(duesSrc.rate) + " × " + charges + " חיובים";
  }

  // מאזן מימון לכל מקור + התראת הקצאת־יתר
  const overList = [];
  CBA.data.getIncomeAllocation().forEach(function (a) {
    const el = container.querySelector("#alloc-" + planKey(a.id));
    if (el) {
      const pct = a.income > 0 ? Math.min(a.allocated / a.income * 100, 100) : (a.allocated > 0 ? 100 : 0);
      el.innerHTML =
        '<div class="alloc__bar"><div class="alloc__fill' + (a.over ? " alloc__fill--over" : "") + '" style="width:' + pct + '%"></div></div>' +
        '<div class="alloc__text' + (a.over ? " alloc__text--over" : "") + '">הוקצה ' + CBA.formatILS(a.allocated) + " מתוך " + CBA.formatILS(a.income) +
        (a.over ? " · חריגה של " + CBA.formatILS(-a.remaining) : "") + "</div>";
    }
    if (a.over) overList.push(a.name + " (חריגה של " + CBA.formatILS(-a.remaining) + ")");
  });
  const banner = container.querySelector("#alloc-banner");
  if (banner) {
    if (overList.length) { banner.hidden = false; banner.innerHTML = '<span style="margin-inline-end:5px;">▲</span>הקצאת יתר: ' + overList.join(" · "); }
    else banner.hidden = true;
  }

  // סיכום שנתי + התראת סעיף ללא שיוך
  const annualEl = container.querySelector("#plan-annual");
  if (annualEl) {
    const annual = CBA.data.getAnnualTotal();
    let html = 'מתוכנן שנתי (לא מחולק לחודשים): <b>' + CBA.formatILS(annual) + "</b>";
    html += planWarnHTML(CBA.data.getUnassignedCategories(), "ללא שיוך למקור");
    html += planWarnHTML(CBA.data.getSplitMismatchCategories(), "הפיצול אינו מסתכם לתכנון");
    html += planWarnHTML(CBA.data.getOrphanGroupCategories(), "בקבוצה שאינה קיימת — לא מוצגים בלוח");
    annualEl.innerHTML = html;
  }

  const income = CBA.data.getIncomeTotal();
  const expense = CBA.data.getPlanTotal();
  const balance = income - expense;
  setText(container, "#bl-income", CBA.formatILS(income));
  setText(container, "#bl-expense", CBA.formatILS(expense));

  const bal = container.querySelector("#bl-balance");
  const label = container.querySelector("#bl-label");
  if (bal) {
    bal.textContent = (balance < 0 ? "-" : "") + CBA.formatILS(Math.abs(balance));
    bal.className = "bl-cell__val " + (balance < 0 ? "neg" : "pos");
  }
  if (label) label.textContent = balance < 0 ? "גירעון" : "עודף";
  const resultCell = container.querySelector(".bl-cell--result");
  if (resultCell) resultCell.className = "bl-cell bl-cell--result " + (balance < 0 ? "bl-cell--neg" : "bl-cell--pos");
}

function planIncomeOptions(selectedId) {
  const list = CBA.data.getIncomeSources();
  const known = list.some(function (x) { return x.id === selectedId; });
  /* ⚠️ אופציית "בחר מקור" הכרחית ואסור להסיר אותה.
     כשהערך השמור אינו מוכר (סעיף חדש, או מזהה שנשאר מגרסה ישנה), הדפדפן
     מציג את האופציה הראשונה כאילו נבחרה — הסעיף *נראה* משויך למיסי שיכון
     אבל אינו נספר בשום מקום. גרוע מכך: בחירה חוזרת באותה אופציה אינה משדרת
     `change`, ולכן גם ניסיון לתקן ידנית לא שמר כלום (משוב יועד 2026-09-09). */
  const placeholder = known ? "" : '<option value="" selected>— בחר מקור —</option>';
  return placeholder + list.map(function (x) {
    return `<option value="${CBA.esc(x.id)}"${x.id === selectedId ? " selected" : ""}>${CBA.esc(x.name)}</option>`;
  }).join("");
}

/* התראת תקינות אחת בשורת הסיכום. מציגה **שמות** ולא רק מספר: התראה
   שאומרת "4 סעיפים" ואינה אומרת אילו, שולחת את יועד לחפש במסך של 23
   סעיפים (משוב 2026-09-09). עד 3 שמות בשורה, השאר ב-title. */
function planWarnHTML(list, label) {
  if (!list || !list.length) return "";
  const names = list.map(function (c) { return c.name || "(ללא שם)"; });
  const shown = names.slice(0, 3).join(", ") + (names.length > 3 ? " ועוד " + (names.length - 3) : "");
  return ' · <span class="neg" title="' + CBA.esc(names.join(" · ")) + '">'
       + list.length + " סעיפים " + label + ": " + CBA.esc(shown) + "</span>";
}

/* תווית מצב החלוקה החודשית (לשבב הקומפקטי) */
function planDistLabel(c) {
  const d = c.dist || { mode: "equal", months: 12 };
  if (d.mode === "custom") return "מותאם";
  if (d.mode === "unplanned") return "שנתי";
  return "שווה · " + d.months + " ח׳";
}

/* שם מקור ההכנסה שהסעיף משויך אליו (או "מפוצל בין N מקורות" — סעיף 4).
   מסמן בכרטיס עצמו שתי תקלות שקודם היו גלויות רק כמספר בשורת הסיכום:
   פיצול שאינו מסתכם לתכנון, ומקור שאינו קיים ברשימת המקורות. */
function planSourceName(c) {
  if (c.sources && c.sources.length > 1) {
    const sum = c.sources.reduce(function (a, s) { return a + (Number(s.amount) || 0); }, 0);
    const gap = Math.round(sum) - Math.round(c.plan || 0);
    const warn = gap
      ? ' <span class="neg">(' + (gap > 0 ? "עודף " : "חוסר ") + Math.abs(gap).toLocaleString("he-IL") + ")</span>"
      : "";
    return "מפוצל בין " + c.sources.length + " מקורות" + warn;
  }
  const s = CBA.data.getIncomeSources().find(function (x) { return x.id === c.incomeSourceId; });
  return s ? CBA.esc(s.name) : '<span class="neg">ללא מקור</span>';
}

/* ===================================================================
   תצוגה להצגה (סעיף 6, 2026-08-10) — גרסה סטטית וקומפקטית לאותה פריסת
   קבוצות+כרטיסים, בלי שדות/כפתורי עריכה. לכל סעיף מוצגים תמיד (בלי ריחוף):
   שם, סכום, מאיזה מקור/מקורות הכנסה הוא ממומן, ואם הוא מפורט (סעיף 5) —
   גם פירוט הפריטים הפנימיים. משתמשת באותם c.sources/c.items שכבר קיימים —
   לא צריך נתונים חדשים, רק תצוגה אחרת שלהם. =================================================================== */
function planPresentHTML(groups, cats, income) {
  /* ⚠️ ביצוע אינו ניתן לשיוך לציר מקורות המימון: בציר הזה סעיף מפוצל
     מפוצל גם לכרטיסים נפרדים עם מזהים סינתטיים ("<id>__<מקור>"), ואין
     בנתונים שום שיוך של תנועה למקור מימון — רק לסעיף. חלוקת הביצוע לפי
     יחס התכנון הייתה המצאה. לכן המתג פשוט לא זמין שם. */
  if (planPresentAxis === "fund") planPresentActual = false;
  planActualMap = planPresentActual ? planActualByCat() : null;

  const blocks = (planPresentAxis === "fund")
    ? planPresentFundBlocks(cats, income)
    : planPresentGroupBlocks(groups, cats);

  // אחוזים ואורכי פסים מחושבים פעם אחת לכל הלוח, לא לכל כרטיס
  const grand = blocks.reduce(function (s, b) { return s + b.total; }, 0);
  const maxBlock = blocks.reduce(function (m, b) { return Math.max(m, b.total); }, 0);
  blocks.forEach(function (b) {
    b.pct = grand ? Math.round((b.total / grand) * 1000) / 10 : 0;
    b.barPct = maxBlock ? Math.max(1, Math.round((b.total / maxBlock) * 100)) : 0;
  });

  return `
    <div class="plan-cols">
      ${planPresentIncomeHTML(income)}
      <div class="card plan-present-card">
        ${planPresentControlsHTML()}
        ${planPresentChartHTML()}
        <div class="present-wrap is-collapsed">${blocks.map(planPresentBlockHTML).join("")}</div>
      </div>
    </div>`;
}

/* פקדי מצב התצוגה — סרגל ייעודי בראש הלוח עצמו. ישבו קודם ב-screen-controls
   ונבלעו שם בין שישה כפתורים אחרים; "הרחב הכל" הוא הפקד המרכזי של המסך
   (הוא מחזיר את התצוגה המלאה שהייתה לפני הקיפול) וחייב להיות גלוי. */
function planPresentControlsHTML() {
  const expandLabel = planPresentExpandAll ? "כווץ הכל" : "הרחב הכל";
  const axisLabel = (planPresentAxis === "fund") ? "לפי תחום" : "לפי מקור מימון";
  // ההשוואה חולקת מצב עם מצב העריכה (planShowCompare/planCompareYear), כדי
  // שלא יהיו שני מתגים שסותרים זה את זה על אותו נתון
  const years = CBA.data.getComparisonYears();
  const cmpLabel = planShowCompare
    ? "הסתר השוואה"
    : ("השוואה ל" + (planCompareYear || years[0] || "שנה קודמת"));
  const cmpBtn = years.length
    ? `<button class="btn-ghost" type="button" data-present-compare aria-pressed="${planShowCompare ? "true" : "false"}">${CBA.esc(cmpLabel)}</button>`
    : "";
  /* מתג הביצוע (2026-09-09) — מוצג רק בציר התחום, ר' ההערה ב-planPresentHTML.
     כבוי כברירת מחדל: מצב התצוגה נועד להציג את *התוכנית*, והביצוע הוא
     שכבה שמוסיפים כשרוצים אותה. */
  const actBtn = (planPresentAxis === "fund")
    ? ""
    : `<button class="btn-ghost" type="button" data-present-actual aria-pressed="${planPresentActual ? "true" : "false"}">${planPresentActual ? "הסתר ביצוע" : "תכנון מול ביצוע"}</button>`;
  return `
        <div class="present-toolbar">
          <button class="btn-ghost" type="button" data-present-expand aria-pressed="${planPresentExpandAll ? "true" : "false"}">${expandLabel}</button>
          <button class="btn-ghost" type="button" data-present-axis aria-pressed="${planPresentAxis === "fund" ? "true" : "false"}">${axisLabel}</button>
          ${actBtn}
          ${cmpBtn}
          ${planPresentChartChipsHTML()}
        </div>`;
}

/* ===================================================================
   ביצוע + גרפים במצב תצוגה  (2026-09-09) — תוספת בלבד
   -------------------------------------------------------------------
   הנתונים מגיעים משכבת הנתונים ולא מחושבים כאן: getBudgetRows() לשנה
   המוצגת, ו-cumulativeSeriesFor()/getYearRows() לשנים אחרות. זה הסֶפֶר
   שמונע סחיפה בין המסך הזה למסך "תכנון מול ביצוע" בדשבורד — שני
   רינדורים, מקור מספרים אחד.
   =================================================================== */

/* ביצוע לפי מזהה סעיף לשנה המוצגת. */
function planActualByCat() {
  const map = {};
  (CBA.data.getBudgetRows() || []).forEach(function (r) { map[r.id] = r; });
  return map;
}

/* צ'יפים לפתיחת גרף. אף גרף אינו פתוח כברירת מחדל. */
function planPresentChartChipsHTML() {
  const chip = function (key, label) {
    const on = planPresentChart === key;
    return `<button class="btn-ghost present-chip${on ? " is-on" : ""}" type="button" data-present-chart="${key}" aria-pressed="${on ? "true" : "false"}">${label}</button>`;
  };
  return `<span class="present-toolbar__charts">${chip("pace", "גרף קצב")}${chip("util", "גרף ניצול")}</span>`;
}

/* פאנל הגרף — ריק לגמרי כשאין גרף פתוח, ולכן המסך נראה בדיוק כמו קודם. */
function planPresentChartHTML() {
  if (planPresentChart === "pace") return planPaceChartHTML();
  if (planPresentChart === "util") return planUtilChartHTML();
  return "";
}

/* ---- גרף 1: קצב — מצטבר, עם שנה קודמת מתחת ----
   שלוש סדרות: תכנון מצטבר (אפור מקווקו), ביצוע השנה (ירוק רציף — אותו
   צבע כמו בדשבורד, בכוונה), וביצוע השנה הקודמת (סגול עמום, רקע בלבד).
   קו הביצוע נעצר בחודש הנוכחי ולא ממשיך שטוח אל תוך העתיד.
   ⚠️ ציר הזמן שמאל->ימין (ספטמבר בשמאל) — זהה לגרף שבדשבורד. */
function planPaceChartHTML() {
  const year = CBA.data.getCurrentYear();
  const cur = CBA.data.cumulativeSeriesFor(year);
  if (!cur) return planChartShell("קצב מצטבר", '<div class="present-chart__empty">אין נתונים לשנה הזו.</div>');

  const prevYear = planPrevDataYear(year);
  const prev = prevYear ? CBA.data.cumulativeSeriesFor(prevYear) : null;
  const asOf = CBA.data.fiscalIndexIn(year);

  const W = 720, H = 220, padL = 14, padR = 58, padT = 14, padB = 24;
  const iw = W - padL - padR, ih = H - padT - padB;
  let all = cur.plan.concat(cur.actual);
  if (prev) all = all.concat(prev.actual);
  const max = Math.max.apply(null, all) || 1;
  const x = function (i) { return padL + (i / 11) * iw; };
  const y = function (v) { return padT + ih - (v / max) * ih; };
  const pts = function (arr, upto) {
    return arr.slice(0, (upto == null ? 11 : upto) + 1)
      .map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
  };
  const grid = [0.25, 0.5, 0.75, 1].map(function (f) {
    return `<line x1="${padL}" y1="${y(max * f)}" x2="${padL + iw}" y2="${y(max * f)}" stroke="#EEF0F3" stroke-width="1"></line>`;
  }).join("");
  const labels = cur.labels.map(function (lab, i) {
    return `<text x="${x(i)}" y="${H - 7}" text-anchor="middle" font-size="10" fill="#9CA3AF">${lab}</text>`;
  }).join("");
  /* תווית קצה לכל סדרה — כך הזיהוי אינו נשען על צבע בלבד.
     מעל הקו ולא לצידו: לצד הנקודה היא התנגשה עם הסמן ועם קו התכנון
     המקווקו שממשיך מעבר לחודש הנוכחי. הילה לבנה (paint-order) כדי
     שהמספר יישאר קריא גם כשהוא נופל על קו רשת. */
  const tag = function (v, i, fill, text) {
    return `<text x="${x(i)}" y="${Math.max(11, y(v) - 9)}" text-anchor="middle" font-size="10"`
         + ` font-weight="700" fill="${fill}" stroke="#fff" stroke-width="3" paint-order="stroke">${text}</text>`;
  };
  const nis = function (v) { return Math.round(v / 1000) + "K"; };
  const prevLine = prev
    ? `<polyline points="${pts(prev.actual)}" fill="none" stroke="#6D28D9" stroke-width="2" opacity=".38"></polyline>` +
      tag(prev.actual[11], 11, "#6D28D9", nis(prev.actual[11]))
    : "";
  const actLine = asOf >= 0
    ? `<polyline points="${pts(cur.actual, asOf)}" fill="none" stroke="#059669" stroke-width="2.6"></polyline>` +
      `<circle cx="${x(asOf)}" cy="${y(cur.actual[asOf])}" r="3.5" fill="#059669"></circle>` +
      tag(cur.actual[asOf], asOf, "#059669", nis(cur.actual[asOf]))
    : "";
  const legend =
    `<span><i class="present-dot" style="background:#9CA3AF"></i>תכנון מצטבר</span>` +
    `<span><i class="present-dot" style="background:#059669"></i>ביצוע ${CBA.esc(year)}</span>` +
    (prev ? `<span><i class="present-dot" style="background:#6D28D9;opacity:.45"></i>ביצוע ${CBA.esc(prevYear)}</span>` : "");
  const svg = `
        <!-- ללא preserveAspectRatio="none": מתיחה לא-אחידה מעוותת את הטקסט
             ומשטיחה את שיפוע הקווים, וכאן דווקא השיפוע הוא כל הסיפור. -->
        <svg viewBox="0 0 ${W} ${H}" style="display:block;width:100%;height:auto">
          ${grid}
          ${prevLine}
          <polyline points="${pts(cur.plan)}" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="6 4"></polyline>
          ${tag(cur.plan[11], 11, "#9CA3AF", nis(cur.plan[11]))}
          ${actLine}
          ${labels}
        </svg>`;
  return planChartShell("קצב מצטבר — תכנון מול ביצוע", svg, legend);
}

/* ---- גרף 2: ניצול לפי סעיף ----
   עמודות אופקיות ממוינות לפי אחוז ניצול. גוון אחד למי שבתוך התקציב,
   וצבע סטטוס *רק* למי שחרג — אחרת הצבע מפסיק להגיד משהו. */
function planUtilChartHTML() {
  const rows = (CBA.data.getBudgetRows() || [])
    .filter(function (r) { return (r.plan || 0) > 0 || (r.actual || 0) > 0; })
    .sort(function (a, b) { return b.pct - a.pct; });
  if (!rows.length) {
    return planChartShell("ניצול לפי סעיף", '<div class="present-chart__empty">אין סעיפים להצגה.</div>');
  }
  const spent = rows.reduce(function (a, r) { return a + (r.actual || 0); }, 0);
  if (!spent) {
    return planChartShell("ניצול לפי סעיף",
      '<div class="present-chart__empty">עוד לא נרשם ביצוע בשנה הזו. אפשר לעבור לשנה קודמת בבורר השנים כדי לראות את התמונה שלה.</div>');
  }
  const TOP = 14;
  const shown = rows.slice(0, TOP);
  const bars = shown.map(function (r) {
    const pct = Math.max(0, Math.min(r.pct, 140));
    const over = r.pct >= 100;
    // גוון אחד, כהה יותר ככל שהניצול גבוה — למעט חריגה שמקבלת צבע סטטוס
    const fill = over ? "var(--danger)" : "#0E7490";
    const op = over ? 1 : (0.35 + 0.5 * Math.min(r.pct, 100) / 100);
    return `
        <div class="present-util__row">
          <span class="present-util__name" title="${CBA.esc(r.name)}">${CBA.esc(r.name)}</span>
          <span class="present-util__track"><i style="width:${(pct / 140) * 100}%;background:${fill};opacity:${op}"></i>
            <b class="present-util__mark" style="right:${(100 / 140) * 100}%"></b></span>
          <span class="present-util__pct${over ? " is-over" : ""}">${Math.round(r.pct)}%</span>
          <span class="present-util__nums">${planNumFmt(r.actual)} / ${planNumFmt(r.plan)}</span>
        </div>`;
  }).join("");
  const more = rows.length > TOP
    ? `<div class="present-chart__note">מוצגים ${TOP} הסעיפים עם הניצול הגבוה ביותר מתוך ${rows.length}.</div>`
    : "";
  const legend = `<span><i class="present-dot" style="background:#0E7490"></i>בתוך התקציב</span>` +
                 `<span><i class="present-dot" style="background:var(--danger)"></i>חריגה</span>` +
                 `<span class="present-chart__hint">הקו האנכי = 100%</span>`;
  return planChartShell("ניצול לפי סעיף", `<div class="present-util">${bars}</div>${more}`, legend);
}

/* השנה שלפני השנה המוצגת, מבין השנים שיש להן נתונים בפועל. */
function planPrevDataYear(year) {
  const years = (CBA.data.getDataYears ? CBA.data.getDataYears() : []).slice().sort();
  const i = years.indexOf(year);
  return (i > 0) ? years[i - 1] : null;
}

/* מסגרת אחידה לכל גרף — כותרת, מקרא, גוף. */
function planChartShell(title, bodyHTML, legendHTML) {
  return `
        <div class="present-chart">
          <div class="present-chart__head">
            <span class="present-chart__title">${CBA.esc(title)}</span>
            <span class="present-chart__legend">${legendHTML || ""}</span>
          </div>
          ${bodyHTML}
        </div>`;
}

/* השוואה לשנה קודמת בכרטיס התצוגה (2026-09-09, בקשת יועד) — יושבת בפינה
   הנגדית לתגיות המימון באותה שורה. ⚠️ הצבעים כאן הם לפי הנחיית יועד:
   *הגדלת* תקציב = ירוק עם חץ למעלה, *הקטנה* = אדום עם חץ למטה. זה הפוך
   מהסמנטיקה הרגילה של חריגה, ובכוונה: כאן מסתכלים על גידול בתקציב התחום
   כעל בשורה טובה ולא כעל חריגה. */
function planPresentCompareHTML(c) {
  if (!planShowCompare || !planCompareYear) return "";
  const prev = CBA.data.getYearPlan(planCompareYear, c.id);
  if (prev === null) {
    return `<span class="present-cmp"><span class="present-cmp__new">חדש השנה</span></span>`;
  }
  const diff = Math.round((c.plan || 0) - prev);
  const delta = diff === 0
    ? '<span class="present-cmp__delta">ללא שינוי</span>'
    : `<span class="present-cmp__delta ${diff > 0 ? "up" : "down"}">${diff > 0 ? "&#9650;" : "&#9660;"} ${planNumFmt(Math.abs(diff))}</span>`;
  return `<span class="present-cmp" title="${CBA.esc(planCompareYear)}: ${CBA.formatILS(prev)}">`
       + `<span class="present-cmp__prev">${CBA.esc(planCompareYear)} ${planNumFmt(prev)}</span>${delta}</span>`;
}

/* הציר הרגיל — לפי תחום (קבוצה) */
function planPresentGroupBlocks(groups, cats) {
  return groups.map(function (g) {
    const rows = cats.filter(function (c) { return c.group === g.id; });
    if (!rows.length) return null;
    return {
      name: g.name, cards: rows,
      total: rows.reduce(function (s, c) { return s + (c.plan || 0); }, 0)
    };
  }).filter(Boolean);
}

/* היפוך הציר (2026-09-09) — אותם סעיפים בדיוק, מקובצים לפי מקור המימון.
   סעיף מפוצל מופיע פעם אחת תחת כל מקור, עם חלקו בלבד ובלי פירוט פנימי:
   הפריטים אינם משויכים למקור, והצגתם תחת אחד מהם הייתה שקר. */
function planPresentFundBlocks(cats, income) {
  return income.map(function (src) {
    const cards = [];
    cats.forEach(function (c) {
      planCatSources(c).forEach(function (s) {
        if (s.incomeSourceId !== src.id) return;
        cards.push((s.amount == null) ? c : {
          id: c.id + "__" + src.id, name: c.name, plan: s.amount,
          items: null, sources: null, incomeSourceId: src.id
        });
      });
    });
    if (!cards.length) return null;
    return {
      name: src.name, cards: cards, fundId: src.id,
      total: cards.reduce(function (s, c) { return s + (c.plan || 0); }, 0)
    };
  }).filter(Boolean);
}

/* בלוק אחד בלוח (קבוצה או מקור מימון, לפי הציר) */
function planPresentBlockHTML(b) {
  const maxInBlock = b.cards.reduce(function (m, c) { return Math.max(m, c.plan || 0); }, 0);
  return `
      <div class="present-group">
        <div class="present-group__head">
          <span class="present-group__name">${CBA.esc(b.name)}</span>
          <span class="present-group__total">${CBA.formatILS(b.total)}<span class="present-gpct">${b.pct}%</span></span>
        </div>
        <div class="present-gbar"><i style="width:${b.barPct}%"></i></div>
        <div class="present-grid">
          ${b.cards.map(function (c) { return planPresentCardHTML(c, maxInBlock); }).join("")}
        </div>
      </div>`;
}

/* פס הפרופורציות — יושב בתוך .bottomline-bar התחתונה (לבקשת יועד 9.9),
   כי שם כבר מרוכזים ההכנסות/ההוצאות/המאזן וזה המקום הטבעי לתמונה הכוללת.
   במכוון אינו חוזר על שלושת המספרים האלה, אלא מוסיף רק את מה שאין שם —
   היחס בין התחומים. מוסתר במובייל: חמישה מקטעים ברוחב 390px אינם קריאים.
   ⚠️ כל שם מחלקה כאן חייב תחילית: הגרסה הראשונה השתמשה ב-.lg/.sw/.pc,
   ו-.lg התנגש עם css/liquid-glass.css — הלגנדה קיבלה רקע זכוכית אפור. */
function planPresentStripHTML(groups, cats, income) {
  const blocks = (planPresentAxis === "fund")
    ? planPresentFundBlocks(cats, income)
    : planPresentGroupBlocks(groups, cats);
  const grand = blocks.reduce(function (a, b) { return a + b.total; }, 0);
  if (!grand || blocks.length < 2) return "";
  const ramp = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB", "#E5E7EB"];
  const color = function (b, i) {
    return b.fundId ? "var(--fund-" + planFundClass(b.fundId) + ")" : ramp[i % ramp.length];
  };
  const segs = blocks.map(function (b, i) {
    return `<i style="width:${(b.total / grand) * 100}%;background:${color(b, i)}" title="${CBA.esc(b.name)} — ${CBA.formatILS(b.total)}"></i>`;
  }).join("");
  const legend = blocks.map(function (b, i) {
    const pct = Math.round((b.total / grand) * 1000) / 10;
    return `<span class="present-legend__item"><span class="present-legend__dot" style="background:${color(b, i)}"></span>${CBA.esc(b.name)}<span class="present-legend__pct">${pct}%</span></span>`;
  }).join("");
  return `
        <div class="present-strip">
          <div class="present-stack">${segs}</div>
          <div class="present-legend">${legend}</div>
        </div>`;
}

/* עמודת מקורות ההכנסה בתצוגה להצגה — שם + סכום מחושב לכל מקור, סטטי (חוזר
   ומתעדכן ע"פ עדכון המשתמש: הוחזר לבקשת יועד, היה חסר בגרסה הראשונה) */
function planPresentIncomeHTML(income) {
  const total = income.reduce(function (s, x) { return s + (x.computed || 0); }, 0);
  const rows = income.map(function (s) {
    return `
      <div class="present-income-row">
        <span class="present-income-row__name">${CBA.esc(s.name)}</span>
        <span class="present-income-row__amount">${CBA.formatILS(s.computed || 0)}</span>
      </div>`;
  }).join("");
  return `
    <div class="card plan-present-card present-income-card">
      <div class="present-group__head">
        <span class="present-group__name">מקורות הכנסה</span>
        <span class="present-group__total">${CBA.formatILS(total)}</span>
      </div>
      <div class="present-income-list">${rows}</div>
    </div>`;
}

/* כרטיס סעיף בתצוגה להצגה — שם+סכום תמיד, פס גודל יחסי, פירוט מקופל
   (אם קיים), ותגיות מימון. עודכן 2026-09-09: הפירוט ירד להיות משני והמימון
   הפך לתגיות, כי שלוש השכבות נראו קודם זהות (משוב יועד). */
function planPresentCardHTML(c, maxInBlock) {
  const hasItems = !!(c.items && c.items.length);
  // עקיפה ידנית לסעיף בודד גוברת על "הרחב הכל" — ר' ההערה ליד planPresentOpen
  const isOpen = (planPresentOpen[c.id] != null) ? planPresentOpen[c.id] : planPresentExpandAll;

  // פער בין הפירוט לסכום הסעיף. אינו נגזר מהתצוגה אלא מהנתונים עצמם, ועד
  // היום לא היה שום מקום שבו אפשר לראות אותו (ר' [[cba-visible-drift-rule]]).
  const sum = hasItems ? c.items.reduce(function (a, it) { return a + (it.plan || 0); }, 0) : 0;
  const gap = hasItems ? Math.round((c.plan || 0) - sum) : 0;
  const flag = gap
    ? `<span class="present-gapflag" title="הפירוט אינו מסתכם לסכום הסעיף">${gap > 0 ? "חוסר" : "עודף"} ${planNumFmt(Math.abs(gap))}</span>`
    : "";

  // ⚠️ משבצת החץ קיימת בכל כרטיס, גם בלי פירוט (אז היא ריקה). בלעדיה החץ
  // דחף את הסכום פנימה רק בכרטיסים מפורטים, וטור הסכומים יצא משונן.
  // היא גם *לפני* השם ולא אחרי הסכום, כדי שהסכום יישאר צמוד לקצה הכרטיס.
  const inner =
    `<span class="present-card__chev"${hasItems ? "" : " aria-hidden=\"true\""}>${hasItems ? "&#9660;" : ""}</span>` +
    `<span class="present-card__name">${CBA.esc(c.name)}${flag}</span>` +
    `<span class="present-card__amount">${CBA.formatILS(c.plan || 0)}</span>`;

  // רק סעיף מפורט הוא כפתור — סעיף בלי פירוט אין מה לפתוח בו
  const head = hasItems
    ? `<button class="present-toggle" type="button" data-present-card="${CBA.esc(c.id)}" aria-expanded="${isOpen ? "true" : "false"}">${inner}</button>`
    : `<div class="present-card__top">${inner}</div>`;

  // מינימום 1% כדי שסעיף זעיר לא ייעלם לגמרי — אבל סעיף על 0 באמת מקבל 0,
  // אחרת היה נראה כאילו תוקצב לו משהו
  const barPct = (maxInBlock > 0 && (c.plan || 0) > 0)
    ? Math.max(1, Math.round(((c.plan || 0) / maxInBlock) * 100))
    : 0;
  /* שכבת הביצוע (2026-09-09) — נוספת *בתוך* הפס הקיים ומתחתיו, ולא
     מחליפה כלום. כשהמתג כבוי planActualMap הוא null ושתי המחרוזות
     ריקות, כך שהפלט זהה בדיוק לגרסה שלפני התוספת. */
  const act = planActualMap ? planActualMap[c.id] : null;
  const bar = (maxInBlock > 0)
    ? `<div class="present-bar"><i style="width:${barPct}%"></i></div>`
    : "";
  /* ⚠️ הביצוע מקבל מד *נפרד* ולא נדחס לתוך הפס הקיים, ואי-אפשר אחרת:
     לפס הקיים יש 100% אחר לגמרי — הוא יחסי לסעיף הגדול ביותר בבלוק, כדי
     שאפשר יהיה להשוות סעיפים זה לזה. סעיף של 30,000 לצד סעיף של 432,000
     מקבל שם 7% רוחב, וניצול של 91% בתוכו יוצא פס באורך 6% — כלומר
     בלתי-קריא לחלוטין. נוסה, נראה על המסך, והוחלף.
     המד כאן הוא יחס אחד מול גבול אחד: 100% = התכנון של הסעיף עצמו.
     גם ככה הפס הקיים נשאר בדיוק כפי שהיה — בלי מחלקה נוספת ובלי ילד נוסף. */
  const actLine = act
    ? (function () {
        const over = act.plan > 0 && act.pct >= 100;
        const w = act.plan > 0 ? Math.max(1, Math.min(Math.round(act.pct), 100)) : 0;
        const meter = act.plan > 0
          ? `<span class="present-meter"><i style="width:${w}%"></i></span>`
          : `<span class="present-meter present-meter--none"></span>`;
        return `<div class="present-actline present-actline--${act.band}">` +
            `<span class="present-actline__k">בוצע</span>` +
            meter +
            `<span class="present-actline__v">${planNumFmt(act.actual)}</span>` +
            `<span class="present-actline__pct">${act.plan > 0 ? Math.round(act.pct) + "%" : "ללא תכנון"}</span>` +
          `</div>`;
      })()
    : "";

  return `
    <div class="present-card${isOpen ? " is-open" : ""}">
      ${head}
      ${bar}${actLine}
      ${planPresentItemRows(c)}
      ${planPresentFundingChips(c, planPresentCompareHTML(c))}
    </div>`;
}

/* פירוט: שורה נפרדת ובולטת לכל פריט פנימי (סעיף 5) — ריק אם הסעיף לא מפורט */
function planPresentItemRows(c) {
  if (!c.items || !c.items.length) return "";
  const rows = c.items.map(function (it) {
    return `
      <div class="present-card__item-row">
        <span class="present-card__item-name">${CBA.esc(it.name)}</span>
        <span class="present-card__item-amount">${planNumFmt(it.plan || 0)}</span>
      </div>`;
  }).join("");
  return `<div class="present-card__section present-card__section--items">${rows}</div>`;
}

/* מקורות המימון של סעיף, במבנה אחיד: מקור יחיד מוחזר עם amount === null
   (סכומו זהה לסכום הסעיף ולכן אין טעם לחזור עליו), מפוצל — כל אחד עם חלקו. */
function planCatSources(c) {
  return (c.sources && c.sources.length > 1)
    ? c.sources
    : [{ incomeSourceId: c.incomeSourceId, amount: null }];
}

/* ⚠️ צבע התגית נקבע לפי *מיקום* המקור ברשימה, לא לפי מזהה.
   בנתונים החיים המזהה הוא שם המקור בעברית ("מיסי שיכון"), כי `toIncome`
   ב-sheets.js עושה `id: String(row["מקור"]).trim()` — אין שום קוד קבוע.
   הגרסה הראשונה מיפתה לפי המזהים של mock.js (dues/tbr/council...), הם לא
   התאימו לכלום בייצור, והכול נפל לברירת המחדל — כל התגיות יצאו באותו אפור
   (משוב יועד, 2026-09-09). מיפוי לפי מיקום עובד על כל גיליון.
   מקור מסוג "מחושב" (מיסי שיכון) מקבל תמיד את האפור השקט בלי קשר למיקומו:
   הוא ~80% מהתקציב, ומקור ברירת המחדל לא צריך לצעוק. */
var PLAN_FUND_PALETTE = ["c1", "c2", "c3", "c4", "c5"];
function planFundClass(id) {
  const all = CBA.data.getIncomeSources();
  let rank = 0;
  for (let i = 0; i < all.length; i++) {
    if (all[i].id !== id) { if (all[i].type !== "dues") rank++; continue; }
    if (all[i].type === "dues") return "dues";
    return PLAN_FUND_PALETTE[rank % PLAN_FUND_PALETTE.length];
  }
  return "dues";   // מקור שלא נמצא — אפור שקט, לא צבע אקראי
}

/* מספר בלי סימן שקל — בכרטיס שכבר יש בו ₪ בסכום הראשי, חזרת הסימן בכל
   שורת פירוט היא רעש בלבד (משוב יועד 2026-09-09). */
function planNumFmt(n) { return Math.round(n || 0).toLocaleString("he-IL"); }

/* מימון כתגיות (2026-09-09) — מקור ההכנסה הוא ציר אחר מההוצאה, ולכן קיבל
   שפה ויזואלית אחרת לגמרי במקום עוד שורת טקסט חיוורת. בסעיף מפוצל התגית
   *שומרת על הסכום*: בלעדיו הפיצול נעלם וזה איבוד מידע אמיתי. */
function planPresentFundingChips(c, extraHTML) {
  const all = CBA.data.getIncomeSources();
  const chips = planCatSources(c).map(function (s) {
    const src = all.find(function (x) { return x.id === s.incomeSourceId; });
    const amt = (s.amount == null) ? "" : ` <span class="fund-chip__n">${planNumFmt(s.amount)}</span>`;
    // מקור שאינו קיים ברשימה מסומן במפורש ולא כמקף חסר-משמעות — הלוח הזה
    // מוצג לוועד, ו-"—" נראה כמו עיצוב ולא כמו תקלה (משוב יועד 2026-09-09)
    if (!src) return `<span class="fund-chip fund-chip--missing">ללא מקור${amt}</span>`;
    return `<span class="fund-chip fund-chip--${planFundClass(s.incomeSourceId)}">${CBA.esc(src.name)}${amt}</span>`;
  }).join("");
  return `<div class="present-fundchips">${chips}${extraHTML || ""}</div>`;
}

/* פיצול סעיף בין כמה מקורות הכנסה (סעיף 4, 2026-08-10). במצב רגיל (לא מפוצל) —
   בדיוק כמו קודם: בורר יחיד + כפתור "פצל מקור". במצב מפוצל — שורה לכל מקור
   (בורר + סכום + הסרה), כפתור "הוסף מקור", כפתור "בטל פיצול", והתראה עדינה
   (לא חוסמת — כך סוכם עם יועד) אם סכום השורות לא תואם לתכנון הכולל של הסעיף. */
function planSourceSplitHTML(c) {
  if (!c.sources || c.sources.length < 2) {
    return `
      <div class="src-line">מתוקצב מ־
        <select class="src-select" data-cat-src="${CBA.esc(c.id)}">${planIncomeOptions(c.incomeSourceId)}</select>
        <button type="button" class="btn-ghost btn-sm" data-split-source="${CBA.esc(c.id)}">פצל מקור</button>
      </div>`;
  }
  const rows = c.sources.map(function (s, i) {
    return `
      <div class="src-split__row">
        <select class="src-select" data-split-src="${CBA.esc(c.id)}" data-split-idx="${i}">${planIncomeOptions(s.incomeSourceId)}</select>
        <input class="num-input num-input--sm" type="number" inputmode="numeric" data-split-amt="${CBA.esc(c.id)}" data-split-idx="${i}" value="${s.amount}">
        <button class="mini-x" data-split-remove="${CBA.esc(c.id)}" data-split-idx="${i}" title="הסר מקור">×</button>
      </div>`;
  }).join("");
  return `
    <div class="src-split">
      <div class="src-split__label">מתוקצב מ־ (מפוצל בין ${c.sources.length} מקורות)</div>
      ${rows}
      <div class="src-split__actions">
        <button type="button" class="btn-ghost btn-sm" data-split-add="${CBA.esc(c.id)}">+ הוסף מקור</button>
        <button type="button" class="btn-ghost btn-sm" data-split-cancel="${CBA.esc(c.id)}">בטל פיצול</button>
      </div>
      <div id="split-warn-${planKey(c.id)}">${planSplitWarnHTML(c)}</div>
    </div>`;
}

/* התראת אי-התאמה בין סכום שורות הפיצול לתכנון הכולל — לא חוסמת, רק מציגה */
function planSplitWarnHTML(c) {
  if (!c.sources || c.sources.length < 2) return "";
  const sum = c.sources.reduce(function (s, r) { return s + (Number(r.amount) || 0); }, 0);
  if (Math.round(sum) === Math.round(c.plan || 0)) return "";
  return `<div class="src-split__warn">⚠ סכום הפיצול (${CBA.formatILS(sum)}) לא תואם לתכנון הסעיף (${CBA.formatILS(c.plan || 0)})</div>`;
}

/* פירוט סעיף לתת-סעיפים (סעיף 5, 2026-08-10). במצב לא-מפורט — כפתור "פרט
   סעיף" בלבד. במצב מפורט — שורה לכל פריט (שם + סכום + הסרה), כפתור "הוסף
   פריט", כפתור "בטל פירוט", והתראה עדינה (לא חוסמת) אם סכום הפריטים לא תואם
   לתכנון הכולל. בשונה מפיצול מקור (סעיף 4) — כאן גם פריט יחיד תקף, כי פירוט
   לפריט אחד כבר שימושי (למשל שיוך תנועות ספציפיות אליו במסך ניהול ההוצאות),
   ולכן אין סף מינימום של 2. תת-הסעיפים האלה זמינים גם בבחירת תת-סעיף בעת
   אישור תנועה במסך ניהול ההוצאות (ר' expenses.js). */
function planItemsHTML(c) {
  if (!c.items || !c.items.length) {
    return `
      <div class="src-line">
        <button type="button" class="btn-ghost btn-sm" data-itemize-cat="${CBA.esc(c.id)}">פרט סעיף</button>
      </div>`;
  }
  const rows = c.items.map(function (it, i) {
    return `
      <div class="src-split__row">
        <input class="txt-input" data-item-name="${CBA.esc(c.id)}" data-item-idx="${i}" value="${CBA.esc(it.name)}">
        <input class="num-input num-input--sm" type="number" inputmode="numeric" data-item-plan="${CBA.esc(c.id)}" data-item-idx="${i}" value="${it.plan}">
        <button type="button" class="mini-icon-btn" data-item-dist="${CBA.esc(c.id)}" data-item-idx="${i}" title="חלוקה חודשית: ${CBA.esc(planDistLabel(it))}">${PLAN_DIST_ICON}</button>
        <button class="mini-x" data-item-remove="${CBA.esc(c.id)}" data-item-idx="${i}" title="הסר פריט">×</button>
      </div>`;
  }).join("");
  return `
    <div class="src-split">
      <div class="src-split__label">פירוט הסעיף (${c.items.length} פריטים)</div>
      ${rows}
      <div class="src-split__actions">
        <button type="button" class="btn-ghost btn-sm" data-item-add="${CBA.esc(c.id)}">+ הוסף פריט</button>
        <button type="button" class="btn-ghost btn-sm" data-item-cancel="${CBA.esc(c.id)}">בטל פירוט</button>
      </div>
      <div id="item-warn-${planKey(c.id)}">${planItemWarnHTML(c)}</div>
    </div>`;
}

/* התראת אי-התאמה בין סכום הפריטים לתכנון הכולל — לא חוסמת, רק מציגה */
function planItemWarnHTML(c) {
  if (!c.items || !c.items.length) return "";
  const sum = c.items.reduce(function (s, it) { return s + (Number(it.plan) || 0); }, 0);
  if (Math.round(sum) === Math.round(c.plan || 0)) return "";
  return `<div class="src-split__warn">⚠ סכום הפירוט (${CBA.formatILS(sum)}) לא תואם לתכנון הסעיף (${CBA.formatILS(c.plan || 0)})</div>`;
}

/* פקד מצב קומפקטי (משמאל לכותרת): כתום=תכנון, ירוק=סגור */
function planPhaseControl() {
  const phase = CBA.data.getBudgetPhase();
  if (phase === "locked") {
    const n = CBA.data.getBudgetUpdates().length;
    return `
      <span class="phase-pill phase-pill--locked"><span class="dot"></span>סגור</span>
      <button class="btn-ghost btn-sm" data-show-updates>עדכונים${n ? " (" + n + ")" : ""}</button>
      <button class="btn-ghost btn-sm" data-reopen-budget>פתח</button>`;
  }
  return `
    <span class="phase-pill phase-pill--draft"><span class="dot"></span>תכנון</span>
    <button class="btn-ghost btn-sm" data-lock-budget>סגור תקציב</button>`;
}

/* האם הסעיף עודכן מאז סגירת התקציב */
function planIsUpdated(c) {
  const base = CBA.data.getBaselinePlan(c.id);
  return base !== null && Math.round(c.plan || 0) !== Math.round(base);
}

/* שורת בסיס + תגית "עודכן" (מוצגת רק כשהתקציב סגור והסעיף שונה מהבסיס) */
function planBaselineLine(c) {
  const base = CBA.data.getBaselinePlan(c.id);
  if (base === null) return "";
  const diff = (c.plan || 0) - base;
  if (Math.round(diff) === 0) return "";
  const arrow = diff > 0 ? "▲" : "▼";
  const cls = diff > 0 ? "up" : "down";
  return `<div class="cmp-line"><span class="upd-badge">עודכן</span> בסיס ${CBA.formatILS(base)} <span class="cmp-delta ${cls}">${arrow} ${CBA.formatILS(Math.abs(diff))}</span></div>`;
}

/* חלון "עדכוני תקציב" — יומן כרונולוגי קבוע של כל שינוי אחרי נעילה */
function planOpenUpdatesModal(container) {
  planCloseModal();
  const log = CBA.data.getBudgetUpdateLog();
  const rows = log.length ? log.map(function (u) {
    const diff = (u.to || 0) - (u.from || 0);
    const arrow = diff > 0 ? "▲" : "▼";
    const cls = diff > 0 ? "up" : "down";
    return `<tr>
      <td class="dt__date">${CBA.esc(u.date || "")}</td>
      <td>${CBA.esc(u.section || "")}</td>
      <td class="dt__amount">${CBA.formatILS(u.from || 0)} ← ${CBA.formatILS(u.to || 0)}</td>
      <td><span class="cmp-delta ${cls}">${arrow} ${CBA.formatILS(Math.abs(diff))}</span></td>
      ${u.reason ? `<td>${CBA.esc(u.reason)}</td>` : "<td></td>"}
    </tr>`;
  }).join("") : `<tr><td style="color:var(--text-muted); padding:16px 4px;">אין עדכונים עדיין — שינויים בתכנון לאחר נעילת התקציב יירשמו כאן.</td></tr>`;

  const overlay = document.createElement("div");
  overlay.id = "cba-modal";
  overlay.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <div class="modal" role="dialog">
        <div class="modal__head">
          <div>
            <div class="modal__title">עדכוני תקציב</div>
            <div class="modal__sub">יומן קבוע — כל שינוי בתכנון לאחר סגירת התקציב</div>
          </div>
          <button class="drawer__close" data-modal-close aria-label="סגור">×</button>
        </div>
        <div class="modal__body">
          <table class="dt" style="width:100%;">${rows}</table>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
  overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", planCloseModal); });
  document.addEventListener("keydown", planEscModal);
}

/* אפשרויות בורר השנה להשוואה */
function planYearOptions() {
  return CBA.data.getComparisonYears().map(function (y) {
    return `<option value="${CBA.esc(y)}"${y === planCompareYear ? " selected" : ""}>${CBA.esc(y)}</option>`;
  }).join("");
}

/* שורת השוואה לשנה הנבחרת. לחיצה על הסכום מעתיקה אותו לתכנון (בלי לגעת בשאר). */
function planCompareLine(c) {
  const year = planCompareYear;
  const prev = CBA.data.getYearPlan(year, c.id);
  if (prev === null) return `<div class="cmp-line cmp-line--new">חדש — לא היה ב${CBA.esc(year)}</div>`;
  const diff = (c.plan || 0) - prev;
  const arrow = diff > 0 ? "▲" : (diff < 0 ? "▼" : "—");
  const cls = diff > 0 ? "up" : (diff < 0 ? "down" : "");
  return `<div class="cmp-line">${CBA.esc(year)}
    <button type="button" class="cmp-copy" data-copy-prev="${CBA.esc(c.id)}" title="לחץ להעתקת הסכום לתכנון">${CBA.formatILS(prev)}</button>
    <span class="cmp-delta ${cls}">${arrow} ${CBA.formatILS(Math.abs(diff))}</span></div>`;
}

/* סעיפים שהיו בשנה המושווית ואינם קיימים כעת — עם אפשרות להוסיף */
function planExtrasHTML() {
  const extras = CBA.data.getExtraFromYear(planCompareYear);
  if (!extras.length) return "";
  return `
    <div class="cmp-extras">
      <div class="cmp-extras__title">סעיפים שהיו ב${CBA.esc(planCompareYear)} ואינם כעת</div>
      ${extras.map(function (e) {
        return `<div class="cmp-extra">
          <span>${CBA.esc(e.name)} · ${CBA.formatILS(e.plan)}</span>
          <button class="btn-ghost" data-add-extra="${CBA.esc(e.id)}" data-add-name="${CBA.esc(e.name)}" data-add-plan="${e.plan}">+ הוסף</button>
        </div>`;
      }).join("")}
    </div>`;
}

/* בקרת החלוקה החודשית — כפתור מחולק לשלושה (segmented) */
function planDistControl(c) {
  const d = c.dist || { mode: "equal", months: 12 };
  return `
    <div class="seg-wrap">
      <div class="seg" title="חלוקה חודשית">
        <button type="button" class="seg__opt${d.mode === "equal" ? " is-active" : ""}" data-dist-mode="equal" data-cat="${CBA.esc(c.id)}">שווה</button>
        <button type="button" class="seg__opt${d.mode === "custom" ? " is-active" : ""}" data-dist-mode="custom" data-cat="${CBA.esc(c.id)}">מותאם</button>
        <button type="button" class="seg__opt${d.mode === "unplanned" ? " is-active" : ""}" data-dist-mode="unplanned" data-cat="${CBA.esc(c.id)}" title="סכום שנתי, לא מחולק לחודשים">שנתי</button>
      </div>
      <div class="seg-months"${d.mode === "equal" ? "" : " hidden"}>חודשים
        <input class="num-input num-input--sm" type="number" min="1" max="12" data-dist-months="${CBA.esc(c.id)}" value="${d.months}"></div>
    </div>`;
}

/* גרירת סעיף — מנגנון עצמאי (pointer) שעובד בכל דפדפן.
   גוררים את הידית (⠿) אל קבוצה (data-group-drop) או מקור הכנסה (data-income-drop). */
function planSetupDrag(container) {
  let dragId = null, ghost = null, target = null;

  function point(e) { return { x: e.clientX, y: e.clientY }; }

  function down(e) {
    const grip = e.target.closest("[data-drag]");
    if (!grip) return;
    e.preventDefault();
    dragId = grip.dataset.drag;
    const item = grip.closest(".plan-item");
    if (item) item.classList.add("dragging");
    ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = item ? item.querySelector(".txt-input").value : "";
    document.body.appendChild(ghost);
    document.body.style.userSelect = "none";
    move(e);
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }

  function move(e) {
    const p = point(e);
    if (ghost) { ghost.style.left = (p.x + 12) + "px"; ghost.style.top = (p.y + 12) + "px"; }
    const el = document.elementFromPoint(p.x, p.y);
    const t = el ? el.closest("[data-group-drop],[data-income-drop]") : null;
    if (t !== target) {
      if (target) target.classList.remove("drop-hover");
      if (t) t.classList.add("drop-hover");
      target = t;
    }
  }

  function up() {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    document.body.style.userSelect = "";
    if (ghost) { ghost.remove(); ghost = null; }
    container.querySelectorAll(".dragging").forEach(function (el) { el.classList.remove("dragging"); });
    if (target) {
      const c = findCat(dragId);
      if (c) {
        if (target.dataset.groupDrop && c.group !== target.dataset.groupDrop) c.group = target.dataset.groupDrop;
        else if (target.dataset.incomeDrop) {
          c.incomeSourceId = target.dataset.incomeDrop;
          // גרירה על מקור הכנסה מאפסת פיצול קיים לשיוך יחיד (סעיף 4, 2026-08-10;
          // כך סוכם עם יועד — גרירה היא פעולה מכוונת ומפורשת של "שייך הכל למקור הזה").
          c.sources = null;
        }
        planSave();
        CBA.screens.planning.render(container);
      }
      target.classList.remove("drop-hover");
    }
    target = null; dragId = null;
  }

  container.querySelectorAll("[data-drag]").forEach(function (grip) {
    grip.addEventListener("pointerdown", down);
  });
}

/* מערך חלוקה שווה: התכנון מחולק בין N החודשים הראשונים */
function planEqualArray(c) {
  const months = (c.dist && c.dist.months) || 12;
  const per = months > 0 ? (c.plan || 0) / months : 0;
  const arr = [];
  for (let i = 0; i < 12; i++) arr.push(i < months ? Math.round(per) : 0);
  return arr;
}

/* חלון "מותאם" — עריכת 12 החודשים ידנית, עם בדיקת סכום מול התכנון */
function planOpenCustomModal(container, catId) {
  planCloseModal();
  const c = findCat(catId);
  if (!c) return;
  if (!c.dist.monthly) c.dist.monthly = planEqualArray(c);

  const fields = CBA.data.getMonthLabels().map(function (lab, i) {
    return `<div class="month-field"><label>${lab}</label>
      <input class="num-input" type="number" data-month="${i}" value="${c.dist.monthly[i] || 0}"></div>`;
  }).join("");

  const overlay = document.createElement("div");
  overlay.id = "cba-modal";
  overlay.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <div class="modal" role="dialog">
        <div class="modal__head">
          <div>
            <div class="modal__title">חלוקה חודשית — ${CBA.esc(c.name)}</div>
            <div class="modal__sub">סכום החודשים צריך להשתוות לתכנון ${CBA.formatILS(c.plan || 0)}</div>
          </div>
          <button class="drawer__close" data-modal-close aria-label="סגור">×</button>
        </div>
        <div class="modal__body">
          <div class="months-grid">${fields}</div>
          <div class="months-sum"><span>מנוצל מהתקציב</span><span class="months-sum__val" id="msum"></span></div>
          <div class="months-note" id="mnote"></div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
  overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", planCloseModal); });
  overlay.querySelectorAll("[data-month]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      c.dist.monthly[parseInt(inp.dataset.month, 10)] = planNum(inp.value);
      planUpdateSum(c);
    });
    // שמירה לגיליון בסיום עריכת חודש (יציאה מהשדה)
    inp.addEventListener("change", function () { planSave(); });
  });
  document.addEventListener("keydown", planEscModal);
  planUpdateSum(c);
}
function planUpdateSum(c) {
  const el = document.getElementById("msum");
  const note = document.getElementById("mnote");
  if (!el) return;
  const plan = c.plan || 0;
  const sum = (c.dist.monthly || []).reduce(function (s, v) { return s + (v || 0); }, 0);
  const over = Math.round(sum) > Math.round(plan);
  el.textContent = CBA.formatILS(sum) + " / " + CBA.formatILS(plan);
  el.className = "months-sum__val " + (over ? "neg" : "pos");
  if (note) {
    const diff = plan - sum;
    note.textContent = over ? "חריגה של " + CBA.formatILS(-diff)
      : (Math.round(diff) > 0 ? "נותרו לחלוקה " + CBA.formatILS(diff) : "תואם לתכנון");
    note.className = "months-note " + (over ? "neg" : "pos");
  }
}

/* חלון עריכת חלוקה חודשית לתת-סעיף בודד (סעיף 7ג, 2026-08-10) — נפתח מהכפתור
   הקטן ליד כל תת-סעיף (סוכם עם יועד: "כפתור קטן שפותח חלון עריכה"). בשונה
   מהבקרה המפולגת ברמת הסעיף (שמוצגת רק כשהסעיף *לא* מפורט — ר' planDistControl
   וה-template שמעל, שמסתיר אותה ואת ה-dist-chip כשיש c.items) — כאן, מכיוון
   שאין בקרה חיצונית לכל תת-סעיף, כל שלושת מצבי החלוקה (שווה/מותאם/שנתי)
   נבחרים מתוך החלון עצמו. משתמש ב-planEqualArray/planUpdateSum הקיימים —
   שניהם כבר גנריים (קוראים רק target.plan/target.dist), עובדים גם על תת-סעיף. */
function planOpenItemDistModal(container, catId, itemIdx) {
  planCloseModal();
  const c = findCat(catId);
  if (!c || !c.items || !c.items[itemIdx]) return;
  const it = c.items[itemIdx];
  if (!it.dist) it.dist = { mode: "equal", months: 12, monthly: null };

  const overlay = document.createElement("div");
  overlay.id = "cba-modal";
  overlay.innerHTML = `
    <div class="modal-backdrop" data-modal-close>
      <div class="modal" role="dialog">
        <div class="modal__head">
          <div>
            <div class="modal__title">חלוקה חודשית — ${CBA.esc(it.name)}</div>
            <div class="modal__sub">תת-סעיף בתוך "${CBA.esc(c.name)}"</div>
          </div>
          <button class="drawer__close" data-modal-close aria-label="סגור">×</button>
        </div>
        <div class="modal__body" id="item-dist-body"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  function refreshRowIcon() {
    const btn = container.querySelector('[data-item-dist="' + CSS.escape(catId) + '"][data-item-idx="' + itemIdx + '"]');
    if (btn) btn.title = "חלוקה חודשית: " + planDistLabel(it);
  }

  overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
  overlay.querySelectorAll("[data-modal-close]").forEach(function (el) {
    el.addEventListener("click", function () { planCloseModal(); refreshRowIcon(); });
  });
  document.addEventListener("keydown", planEscModal);

  const body = document.getElementById("item-dist-body");
  function renderBody() {
    let html = `
      <div class="seg-wrap">
        <div class="seg" title="חלוקה חודשית">
          <button type="button" class="seg__opt${it.dist.mode === "equal" ? " is-active" : ""}" data-item-modal-mode="equal">שווה</button>
          <button type="button" class="seg__opt${it.dist.mode === "custom" ? " is-active" : ""}" data-item-modal-mode="custom">מותאם</button>
          <button type="button" class="seg__opt${it.dist.mode === "unplanned" ? " is-active" : ""}" data-item-modal-mode="unplanned" title="סכום שנתי, לא מחולק לחודשים">שנתי</button>
        </div>`;
    if (it.dist.mode === "equal") {
      html += `<div class="seg-months">חודשים
        <input class="num-input num-input--sm" type="number" min="1" max="12" id="item-modal-months" value="${it.dist.months || 12}"></div>`;
    }
    html += `</div>`;
    if (it.dist.mode === "custom") {
      if (!it.dist.monthly) it.dist.monthly = planEqualArray(it);
      const fields = CBA.data.getMonthLabels().map(function (lab, i) {
        return `<div class="month-field"><label>${lab}</label>
          <input class="num-input" type="number" data-month="${i}" value="${it.dist.monthly[i] || 0}"></div>`;
      }).join("");
      html += `
        <div class="months-grid">${fields}</div>
        <div class="months-sum"><span>מנוצל מהתכנון</span><span class="months-sum__val" id="msum"></span></div>
        <div class="months-note" id="mnote"></div>`;
    }
    body.innerHTML = html;

    body.querySelectorAll("[data-item-modal-mode]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        it.dist.mode = btn.dataset.itemModalMode;
        if (it.dist.mode === "custom" && !it.dist.monthly) it.dist.monthly = planEqualArray(it);
        planSave();
        renderBody();
        refreshRowIcon();
      });
    });
    const monthsInp = document.getElementById("item-modal-months");
    if (monthsInp) monthsInp.addEventListener("input", function () {
      it.dist.months = Math.max(1, Math.min(12, planNum(monthsInp.value) || 1));
      refreshRowIcon();
    });
    if (monthsInp) monthsInp.addEventListener("change", function () { planSave(); });
    body.querySelectorAll("[data-month]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        it.dist.monthly[parseInt(inp.dataset.month, 10)] = planNum(inp.value);
        planUpdateSum(it);
      });
      inp.addEventListener("change", function () { planSave(); });
    });
    if (it.dist.mode === "custom") planUpdateSum(it);
  }
  renderBody();
}

function planCloseModal() {
  const el = document.getElementById("cba-modal");
  if (el) el.remove();
  document.removeEventListener("keydown", planEscModal);
}
function planEscModal(e) { if (e.key === "Escape") planCloseModal(); }

/* אחרי הוספת סעיף חדש: ממקדים ובוחרים את שדה השם שלו, כדי שהפאנל המורחב
   ייפתח מיד (דרך :focus-within) והמשתמש יוכל להקליד שם בלי שלב נוסף של
   ריחוף/פתיחה (משוב יועד, 2026-08-10). גם גוללים אותו לתצוגה אם צריך. */
function planFocusNewCategory(container, catId) {
  const input = container.querySelector('[data-cat-name="' + CSS.escape(catId) + '"]');
  if (!input) return;
  input.scrollIntoView({ block: "nearest", behavior: "smooth" });
  input.focus();
  input.select();
}

/* בתצוגה להצגה: שמות ארוכים מדי לעמודה (סעיף/מקור/פריט) גוללים אוטומטית
   הצידה כשעומדים עליהם עם העכבר, בלי צורך לגרור את פס הגלילה ידנית —
   וחוזרים למצב ההתחלתי כשהעכבר יוצא (משוב יועד, 2026-08-10). פועל רק על
   שמות שבאמת חתוכים (scrollWidth > clientWidth); שם שנכנס במלואו לא זז. */
/* פקדי מצב התצוגה (2026-09-09).
   קיפול סעיף בודד מתבצע בהחלפת מחלקה בלבד, *בלי* ציור-מחדש — בלוח ארוך
   ציור-מחדש היה מקפיץ את הגלילה לראש העמוד בכל לחיצה. "הרחב הכל" והיפוך
   הציר כן מציירים מחדש, כי הם משנים את מבנה הלוח כולו. */
function planBindPresent(container, rerender) {
  container.querySelectorAll("[data-present-card]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const card = btn.closest(".present-card");
      if (!card) return;
      const open = card.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      planPresentOpen[btn.getAttribute("data-present-card")] = open;
    });
  });

  const expandBtn = container.querySelector("[data-present-expand]");
  if (expandBtn) expandBtn.addEventListener("click", function () {
    planPresentExpandAll = !planPresentExpandAll;
    planPresentOpen = {};   // מנקה עקיפות ידניות, אחרת "הרחב הכל" לא באמת מרחיב הכל
    rerender();
  });

  const cmpBtn = container.querySelector("[data-present-compare]");
  if (cmpBtn) cmpBtn.addEventListener("click", function () {
    planShowCompare = !planShowCompare;
    rerender();
  });

  const axisBtn = container.querySelector("[data-present-axis]");
  if (axisBtn) axisBtn.addEventListener("click", function () {
    planPresentAxis = (planPresentAxis === "fund") ? "group" : "fund";
    planPresentOpen = {};   // מזהי הכרטיסים שונים בין הצירים (סעיף מפוצל מקבל id מורכב)
    rerender();
  });

  /* --- התוספות של 2026-09-09 --- */
  const actualBtn = container.querySelector("[data-present-actual]");
  if (actualBtn) actualBtn.addEventListener("click", function () {
    planPresentActual = !planPresentActual;
    rerender();
  });

  // צ'יפ שכבר פתוח סוגר את עצמו — אין "אין גרף" ככפתור נפרד
  container.querySelectorAll("[data-present-chart]").forEach(function (chip) {
    chip.addEventListener("click", function () {
      const key = chip.getAttribute("data-present-chart");
      planPresentChart = (planPresentChart === key) ? null : key;
      rerender();
    });
  });
}

function planBindPresentScroll(container) {
  // תגיות המימון נשברות לשתי שורות במקום להיחתך, ולכן אינן צריכות גלילה —
  // מאז 2026-09-09 אין יותר .present-card__fund-name בתצוגה.
  const names = container.querySelectorAll(
    ".present-card__item-name, .present-income-row__name"
  );
  names.forEach(function (el) {
    el.addEventListener("mouseenter", function () {
      // באתר כולו dir="rtl", ולכן טווח הגלילה התקני הוא 0 (התחלה, ימין)
      // עד -(scrollWidth-clientWidth) (סוף, שמאל) — לא ערך חיובי כמו ב-LTR.
      const max = el.scrollWidth - el.clientWidth;
      if (max > 0) el.scrollLeft = -max;
    });
    el.addEventListener("mouseleave", function () {
      el.scrollLeft = 0;
    });
  });
}

/* חיפוש סעיף/מקור הכנסה — דרך שכבת הנתונים (מחזיר את האובייקט החי לעריכה בזיכרון) */
function findCat(id) { return CBA.data.findCategory(id); }
function findIncome(id) { return CBA.data.findIncomeSource(id); }
function planNum(v) { const n = parseFloat(v); return isNaN(n) ? 0 : n; }
// הופך מזהה (שעשוי להכיל רווחים/גרשיים כמו "מיסי שיכון" או "תב\"ר") למחרוזת
// חוקית ל-id/סלקטור של CSS. חייב לשמש גם ב-id="" וגם ב-querySelector("#...").
function planKey(id) { return String(id == null ? "" : id).replace(/[^a-zA-Z0-9_-]/g, function (ch) { return "_" + ch.charCodeAt(0) + "_"; }); }
function setText(container, sel, text) { const el = container.querySelector(sel); if (el) el.textContent = text; }

/* --- שמירה אוטומטית לגיליון --- */
// דחיית שמירה (debounce): רצף עריכות מהיר מתלכד לשמירה אחת עם המצב הסופי,
// כדי לא להעמיס עשרות כתיבות על השרת ולמנוע התנגשות נעילה. השנה נתפסת בזמן
// התזמון — כך שגם אם מחליפים שנה תוך כדי, השמירה תלך לשנה הנכונה.
// markDirty/clearDirty (2026-08-09, תיקון באג "שינויים לא נשמרים"): מהרגע
// שמתחילים לערוך ועד שהשמירה חוזרת מהשרת, מסמנים ל-sheets.js "אל תרענן ברקע
// עכשיו" — אחרת רענון שקורה תוך כדי (כל 3 שניות) עלול לדרוס את העריכה
// בזיכרון לפני שהיא נשלחת, וכשהשמירה בפועל רצה היא כבר שולחת נתונים ישנים
// (בלי השינוי) בחזרה לגיליון. ר' ההסבר המלא ב-sheets.js.
// חיווי "שומר…/נשמר ✓" (2026-08-09, הורחב): עבר לבועה גלובלית אחת ב-app.js
// שמאזינה ל-markDirty/clearDirty מכל מסך (לא רק כאן) — ר' notifyDirtyChange
// ב-sheets.js. אין יותר בועה נפרדת רק למסך הזה.
// (2026-08-18, ממצא 4.2 בדו"ח הבדיקה) השמירה עצמה הוצאה לפונקציה בשם —
// כדי שאפשר יהיה גם *להבריח* אותה (לשלוח מיד) אם המשתמש עוזב/מרענן את הדף
// בתוך 700 המילישניות של ההשהיה, במקום שהעריכה תיעלם בלי שאף אחד ידע.
// registerFlush רושם אותה ב-sheets.js; ר' flushPending/beforeunload שם.
var planSaveTimer = null;
function planSave() {
  if (!CBA.sheets || !CBA.sheets.isConnected || !CBA.sheets.isConnected()) return;
  var year = CBA.data.getCurrentYear();
  if (CBA.sheets.markDirty) CBA.sheets.markDirty();
  clearTimeout(planSaveTimer);
  var doSave = function () {
    clearTimeout(planSaveTimer);
    if (CBA.sheets.registerFlush) CBA.sheets.registerFlush("planSave", null);   // כבר נשלח — אין מה להבריח
    CBA.data.saveBudgetToSheet(year, function () {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty();
    });
  };
  if (CBA.sheets.registerFlush) CBA.sheets.registerFlush("planSave", doSave);
  planSaveTimer = setTimeout(doSave, 700);
}
