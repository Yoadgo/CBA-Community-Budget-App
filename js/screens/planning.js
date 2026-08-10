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

// סמליל "פנקס הערות" (סעיף 1) — דף+קווים, באותו סגנון SVG כמו NAV_ICONS ב-app.js
var PLAN_NOTES_ICON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4"/><path d="M9.5 12h6M9.5 16h4"/></svg>';

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
                <div class="dist-chip" data-chip="${CBA.esc(c.id)}">${planDistLabel(c)} · ${CBA.esc(planSourceName(c))}</div>
                <div class="plan-item__more">
                  ${planSourceSplitHTML(c)}
                  ${planItemsHTML(c)}
                  ${planDistControl(c)}
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

      <div class="card bottomline-bar">
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
  if (planViewMode) return;  // מצב תצוגה סטטי לגמרי — אין מה לחבר מעבר לכפתור המתג

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
      if (chip) chip.textContent = planDistLabel(c) + " · " + planSourceName(c);
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
  container.querySelectorAll("[data-remove-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      CBA.data.removeCategory(btn.dataset.removeCat);
      planSave();
      rerender();
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
      CBA.data.removeGroup(btn.dataset.removeGroup);
      planSave();
      rerender();
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
  if (lockBtn) lockBtn.addEventListener("click", function () {
    if (window.confirm('לסגור את התקציב? המערכת תעבור למצב ביצוע, וכל שינוי בתכנון יסומן כ"עדכון תקציב".')) {
      CBA.data.lockBudget();
      rerender();
    }
  });
  const reopenBtn = container.querySelector("[data-reopen-budget]");
  if (reopenBtn) reopenBtn.addEventListener("click", function () {
    if (window.confirm("לפתוח מחדש את התקציב לעריכה? הבסיס המאושר יימחק והמערכת תחזור למצב תכנון.")) {
      CBA.data.reopenBudget();
      rerender();
    }
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
    const unassigned = CBA.data.getUnassignedCategories();
    let html = 'מתוכנן שנתי (לא מחולק לחודשים): <b>' + CBA.formatILS(annual) + "</b>";
    if (unassigned.length) html += ' · <span class="neg">' + unassigned.length + " סעיפים ללא שיוך למקור</span>";
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
  return CBA.data.getIncomeSources().map(function (s) {
    return `<option value="${CBA.esc(s.id)}"${s.id === selectedId ? " selected" : ""}>${CBA.esc(s.name)}</option>`;
  }).join("");
}

/* תווית מצב החלוקה החודשית (לשבב הקומפקטי) */
function planDistLabel(c) {
  const d = c.dist || { mode: "equal", months: 12 };
  if (d.mode === "custom") return "מותאם";
  if (d.mode === "unplanned") return "שנתי";
  return "שווה · " + d.months + " ח׳";
}

/* שם מקור ההכנסה שהסעיף משויך אליו (או "מפוצל בין N מקורות" — סעיף 4) */
function planSourceName(c) {
  if (c.sources && c.sources.length > 1) return "מפוצל בין " + c.sources.length + " מקורות";
  const s = CBA.data.getIncomeSources().find(function (x) { return x.id === c.incomeSourceId; });
  return s ? s.name : "—";
}

/* ===================================================================
   תצוגה להצגה (סעיף 6, 2026-08-10) — גרסה סטטית וקומפקטית לאותה פריסת
   קבוצות+כרטיסים, בלי שדות/כפתורי עריכה. לכל סעיף מוצגים תמיד (בלי ריחוף):
   שם, סכום, מאיזה מקור/מקורות הכנסה הוא ממומן, ואם הוא מפורט (סעיף 5) —
   גם פירוט הפריטים הפנימיים. משתמשת באותם c.sources/c.items שכבר קיימים —
   לא צריך נתונים חדשים, רק תצוגה אחרת שלהם. =================================================================== */
function planPresentHTML(groups, cats, income) {
  const blocks = groups.map(function (g) {
    const rows = cats.filter(function (c) { return c.group === g.id; });
    if (!rows.length) return "";
    const total = rows.reduce(function (s, c) { return s + (c.plan || 0); }, 0);
    return `
      <div class="present-group">
        <div class="present-group__head">
          <span class="present-group__name">${CBA.esc(g.name)}</span>
          <span class="present-group__total">${CBA.formatILS(total)}</span>
        </div>
        <div class="present-grid">
          ${rows.map(planPresentCardHTML).join("")}
        </div>
      </div>`;
  }).join("");
  return `
    <div class="plan-cols">
      ${planPresentIncomeHTML(income)}
      <div class="card plan-present-card"><div class="present-wrap">${blocks}</div></div>
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

/* כרטיס סעיף בתצוגה להצגה — שם+סכום תמיד, פירוט פריטים (אם קיים, בולט יותר
   ולפני המימון), ואחריו מימון. סדר ובולטות עודכנו לפי משוב יועד (2026-08-10) */
function planPresentCardHTML(c) {
  const items = planPresentItemRows(c);
  const funding = planPresentFundingRows(c);
  return `
    <div class="present-card">
      <div class="present-card__top">
        <span class="present-card__name">${CBA.esc(c.name)}</span>
        <span class="present-card__amount">${CBA.formatILS(c.plan || 0)}</span>
      </div>
      ${items}
      ${funding}
    </div>`;
}

/* פירוט: שורה נפרדת ובולטת לכל פריט פנימי (סעיף 5) — ריק אם הסעיף לא מפורט */
function planPresentItemRows(c) {
  if (!c.items || !c.items.length) return "";
  const rows = c.items.map(function (it) {
    return `
      <div class="present-card__item-row">
        <span class="present-card__item-name">${CBA.esc(it.name)}</span>
        <span class="present-card__item-amount">${CBA.formatILS(it.plan || 0)}</span>
      </div>`;
  }).join("");
  return `<div class="present-card__section present-card__section--items">${rows}</div>`;
}

/* מימון: שורה נפרדת לכל מקור הכנסה — מקור יחיד (בלי סכום, זהה לסכום הסעיף)
   או כמה מקורות (סעיף 4, מפוצל — כל אחד עם סכומו) */
function planPresentFundingRows(c) {
  function incName(id) {
    const s = CBA.data.getIncomeSources().find(function (x) { return x.id === id; });
    return s ? s.name : "—";
  }
  let rows;
  if (c.sources && c.sources.length > 1) {
    rows = c.sources.map(function (s) {
      return `
        <div class="present-card__fund-row">
          <span class="present-card__fund-name">${CBA.esc(incName(s.incomeSourceId))}</span>
          <span class="present-card__fund-amount">${CBA.formatILS(s.amount)}</span>
        </div>`;
    }).join("");
  } else {
    rows = `
      <div class="present-card__fund-row">
        <span class="present-card__fund-name">${CBA.esc(incName(c.incomeSourceId))}</span>
      </div>`;
  }
  return `<div class="present-card__section present-card__section--funding">${rows}</div>`;
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
var planSaveTimer = null;
function planSave() {
  if (!CBA.sheets || !CBA.sheets.isConnected || !CBA.sheets.isConnected()) return;
  var year = CBA.data.getCurrentYear();
  if (CBA.sheets.markDirty) CBA.sheets.markDirty();
  clearTimeout(planSaveTimer);
  planSaveTimer = setTimeout(function () {
    CBA.data.saveBudgetToSheet(year, function () {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty();
    });
  }, 700);
}
