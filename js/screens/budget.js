/* מסך "תכנון מול ביצוע" — לב המערכת.
   שני מבטים: "מול סך השנה" (ביצוע מול התכנון השנתי) ו"מול השלב בשנה"
   (ביצוע עד החודש הנבחר מול הצפי המצטבר לאותו שלב). כרטיסיות בקבוצות,
   ובמבט הקצב גם גרף מצטבר של תכנון מול ביצוע. לחיצה על כרטיסייה פותחת פירוט.

   שני מצבי ציור (2026-08-06, לבקשת יועד — טעינה מהירה וחלקה יותר):
   - ניווט רגיל (opts.silent לא true — המשתמש נכנס למסך/החליף תצוגה/שנה):
     טעינה מדורגת בשני שלבים. שלב 1 מצייר מיד את מה שלא תלוי ברשימת הסעיפים
     (בקרות, גרף, שורה תחתונה) כדי שהמסך יגיב מיד; שלב 2, בפריים הבא, בונה
     ומכניס את כרטיסיות הסעיפים עצמן (עם כניסה מדורגת אחת-אחרי-השנייה).
   - עדכון רקע שקט (opts.silent === true — הגיעו נתונים חדשים מהשרת בזמן
     שהמסך כבר פתוח): הכול מצטייר בבת אחת, בלי שום אנימציית כניסה/מילוי —
     רק המספרים הספציפיים שבאמת השתנו "פועמים" לרגע (ר' data-pulse-key
     ו-app.js: pulseSnapshot/applyPulse). כך רענון ברקע לא "קופץ" או מהבהב. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

var budgetView = "annual"; // annual | pace
var budgetAsOf = null;     // אינדקס החודש במבט הקצב
var budgetSeries = null;   // סדרות הגרף (לשימוש ה-Tooltip)
var cardStaggerIndex = 0;  // מונה טעינה מדורגת: כל כרטיסייה "נכנסת" קצת אחרי הקודמת לה
var renderGen = 0;         // "דור" ציור — מונע משלב-2 מאוחר (מהפריים הבא) לכתוב על ציור חדש יותר

CBA.screens.budget = {
  title: "תכנון מול ביצוע",

  render(container, opts) {
    const silent = !!(opts && opts.silent);
    const fiscal = CBA.data.getFiscalMonths();
    if (budgetAsOf === null) budgetAsOf = CBA.data.currentFiscalIndex();
    const pace = budgetView === "pace";

    const rows = pace ? CBA.data.getBudgetRowsAsOf(budgetAsOf) : CBA.data.getBudgetRows();
    const groups = CBA.data.groupRowsByGroup(rows);
    // מאפסים את מונה הכניסה המדורגת לפני שמציירים את הכרטיסיות מחדש — כדי
    // שבכל ציור (כולל מעבר בין "מול סך השנה" / "מול השלב בשנה") השורות ייכנסו
    // שוב אחת אחרי השנייה, במקום לקפוץ כולן יחד בבת אחת.
    cardStaggerIndex = 0;
    const summary = pace ? paceSummary(rows) : CBA.data.getSummary();
    const pending = CBA.data.getTransactions().filter(function (t) { return t.status === "submitted"; });
    const pendingSum = pending.reduce(function (s, t) { return s + (t.amount || 0); }, 0);

    const topHTML =
      (pending.length ? pendingBanner(pending.length, pendingSum) : "") +
      '<div class="screen-controls">' +
        '<div class="phase-ctrl">' +
          '<div class="seg seg--view">' +
            '<button type="button" class="seg__opt' + (pace ? "" : " is-active") + '" data-view="annual">מול סך השנה</button>' +
            '<button type="button" class="seg__opt' + (pace ? " is-active" : "") + '" data-view="pace">מול השלב בשנה</button>' +
          '</div>' +
          (pace ? ('<select class="year-select" data-asof>' + fiscal.map(function (m, i) { return '<option value="' + i + '"' + (i === budgetAsOf ? " selected" : "") + '>נכון ל-' + m.label + '</option>'; }).join("") + '</select>') : "") +
        '</div>' +
      '</div>' +
      (pace ? cumulativeChart() : "");

    const bottomHTML = '<div class="card bottomline-bar">' + bottomBar(summary, pace) + '</div>';
    const cardsHTML = groups.map(function (g) { return groupHTML(g, pace, silent); }).join("");

    if (silent) {
      // עדכון רקע: הכול בבת אחת (בלי שלב נפרד/פריים נוסף) כדי שלא יהיה אפילו
      // רגע אחד שבו השורות נעלמות ומופיעות מחדש — רק מה שהשתנה בפועל "פועם".
      container.innerHTML = topHTML + '<div class="budget-cols">' + cardsHTML + '</div>' + bottomHTML;
      bindTopControls(container);
      container.querySelectorAll("[data-count]").forEach(function (el) {
        el.textContent = CBA.formatILS(parseFloat(el.dataset.count) || 0);
      });
      bindCards(container);
      bindChartHover(container);
      return;
    }

    // ניווט רגיל / החלפת תצוגה או שנה: טעינה מדורגת בשני שלבים.
    var myGen = ++renderGen;
    container.innerHTML = topHTML + '<div class="budget-cols" data-cols-slot></div>' + bottomHTML;
    bindTopControls(container);
    container.querySelectorAll("[data-count]").forEach(function (el) {
      countUp(el, parseFloat(el.dataset.count) || 0);
    });
    bindChartHover(container);

    // שלב 2: בונים את כרטיסיות הסעיפים ומכניסים אותן בפריים הבא — כך הדפדפן
    // מספיק לצייר את שאר המסך (בקרות/גרף/שורה תחתונה) לפני שממשיכים לשורות
    // עצמן, וזה מה שנותן את התחושה של "השורות מתמלאות" אחרי שהעמוד כבר עלה.
    requestAnimationFrame(function () {
      if (myGen !== renderGen) return;   // ציור חדש יותר כבר קרה בינתיים — מתעלמים
      const slot = container.querySelector("[data-cols-slot]");
      if (!slot) return;
      slot.innerHTML = cardsHTML;
      bindCards(container);
      requestAnimationFrame(function () {
        if (myGen !== renderGen) return;
        slot.querySelectorAll(".bar__fill[data-fill]").forEach(function (f) { f.style.width = (f.dataset.fill || 0) + "%"; });
      });
    });
  }
};

/* מאזינים של פס הבקרות העליון (התראת ממתינות, מתג תצוגה, בורר "נכון ל-")
   — משותף לשני מסלולי הציור, כדי לא לשכפל קוד. */
function bindTopControls(container) {
  const pb = container.querySelector("[data-goto-pending]");
  if (pb) pb.addEventListener("click", function () { if (CBA.screens.expenses && CBA.screens.expenses.showPending) CBA.screens.expenses.showPending(); });

  container.querySelectorAll("[data-view]").forEach(function (btn) {
    btn.addEventListener("click", function () { budgetView = btn.dataset.view; CBA.screens.budget.render(container); });
  });
  const asof = container.querySelector("[data-asof]");
  if (asof) asof.addEventListener("change", function () { budgetAsOf = parseInt(asof.value, 10); CBA.screens.budget.render(container); });
}

/* לחיצה על כרטיסייה פותחת את חלון הפירוט — משותף לשני מסלולי הציור */
function bindCards(container) {
  container.querySelectorAll(".bcard").forEach(function (el) {
    el.addEventListener("click", function () { openDrawer(el.dataset.cat); });
  });
}

/* אנימציית ספירה: מ-0 עד היעד, מעוצב כמטבע (רק בניווט רגיל — לא בעדכון רקע שקט) */
function countUp(el, target) {
  const dur = 550, start = performance.now();
  el.textContent = CBA.formatILS(0);
  function step(now) {
    const p = Math.min((now - start) / dur, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = CBA.formatILS(target * eased);
    if (p < 1) requestAnimationFrame(step); else el.textContent = CBA.formatILS(target);
  }
  requestAnimationFrame(step);
}

/* התראת קבלות שממתינות לאישור המנהל — קליק מעביר למסך ההוצאות בתצוגת "ממתינות" */
function pendingBanner(n, sum) {
  return `<div class="pending-banner" data-goto-pending role="button" tabindex="0">
    <span class="pending-banner__flag">⚑</span>
    <span>${n === 1 ? "קבלה אחת ממתינה" : "<b>" + n + "</b> קבלות ממתינות"} לאישורך · <b>${CBA.formatILS(sum)}</b></span>
    <span class="pending-banner__cta">מעבר לאישור →</span>
  </div>`;
}

/* --- סיכום עליון --- */
function paceSummary(rows) {
  const expected = rows.reduce(function (s, r) { return s + r.expected; }, 0);
  const actual = rows.reduce(function (s, r) { return s + r.actual; }, 0);
  return { expected: expected, actual: actual, diff: actual - expected };
}
/* שורה תחתונה דביקה וקומפקטית (כמו בבניית תקציב).
   data-pulse-key קבוע לכל תא (primary/secondary/result) בלי תלות בתצוגה
   (annual/pace) — כדי שעדכון רקע ידע להשוות "אותו תא" גם אם הטקסט/הכיוון
   שלו משתנה בין תצוגות, ויפעים אותו רק כשהערך באמת השתנה. */
function bottomBar(summary, pace) {
  if (pace) {
    const over = summary.diff > 0;
    return `
      <div class="bl-cell"><div class="bl-cell__label">צפי עד עכשיו</div><div class="bl-cell__val" data-pulse-key="bl-primary" data-count="${summary.expected}">${CBA.formatILS(summary.expected)}</div></div>
      <div class="bl-cell"><div class="bl-cell__label">בוצע עד כה</div><div class="bl-cell__val" data-pulse-key="bl-secondary" data-count="${summary.actual}">${CBA.formatILS(summary.actual)}</div></div>
      <div class="bl-cell bl-cell--result ${over ? "bl-cell--neg" : "bl-cell--pos"}"><div class="bl-cell__label">${over ? '<span class="ico-over">▲</span>חריגה מהקצב' : '<span class="ico-under">▼</span>מתחת לקצב'}</div><div class="bl-cell__val ${over ? "neg" : "pos"}" data-pulse-key="bl-result" data-count="${Math.abs(summary.diff)}">${CBA.formatILS(Math.abs(summary.diff))}</div></div>`;
  }
  return `
    <div class="bl-cell"><div class="bl-cell__label">תקציב מתוכנן</div><div class="bl-cell__val" data-pulse-key="bl-primary" data-count="${summary.totalPlan}">${CBA.formatILS(summary.totalPlan)}</div></div>
    <div class="bl-cell"><div class="bl-cell__label">בוצע עד כה</div><div class="bl-cell__val" data-pulse-key="bl-secondary" data-count="${summary.totalActual}">${CBA.formatILS(summary.totalActual)}</div></div>
    <div class="bl-cell bl-cell--result ${summary.remaining < 0 ? "bl-cell--neg" : "bl-cell--pos"}"><div class="bl-cell__label">יתרה</div><div class="bl-cell__val ${summary.remaining < 0 ? "neg" : "pos"}" data-pulse-key="bl-result" data-count="${summary.remaining}">${CBA.formatILS(summary.remaining)}</div></div>`;
}

/* --- גרף מצטבר: תכנון (מקווקו) מול ביצוע (רציף) + תחזית Run-Rate + Tooltip --- */
function cumulativeChart() {
  const s = CBA.data.cumulativeSeries();
  budgetSeries = s;
  const asof = budgetAsOf;
  const W = 720, H = 112, padL = 12, padR = 12, padT = 8, padB = 20;
  const iw = W - padL - padR, ih = H - padT - padB;
  // תחזית: קצב = ביצוע עד כה / חודשים שחלפו; מוקרן לסוף השנה
  const runRate = asof >= 0 ? s.actual[asof] / (asof + 1) : 0;
  const projEnd = s.actual[asof] + runRate * (11 - asof);
  const max = Math.max.apply(null, s.plan.concat(s.actual).concat([projEnd])).valueOf() || 1;
  const x = function (i) { return padL + (i / 11) * iw; };
  const y = function (v) { return padT + ih - (v / max) * ih; };
  const pts = function (arr) { return arr.map(function (v, i) { return x(i) + "," + y(v); }).join(" "); };
  const planPts = pts(s.plan);
  const actualPts = s.actual.slice(0, asof + 1).map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
  const forecastPts = asof < 11 ? (x(asof) + "," + y(s.actual[asof]) + " " + x(11) + "," + y(projEnd)) : "";
  const markX = x(asof);
  const labels = s.labels.map(function (lab, i) {
    return `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#9CA3AF">${lab}</text>`;
  }).join("");
  return `
    <div class="cum-chart card" id="cum-chart">
      <div class="cum-chart__legend">
        <span><i class="cum-dot cum-dot--plan"></i>תכנון מצטבר</span>
        <span><i class="cum-dot cum-dot--actual"></i>ביצוע מצטבר</span>
        ${asof < 11 ? '<span><i class="cum-dot cum-dot--forecast"></i>תחזית לפי הקצב</span>' : ""}
      </div>
      <div class="cum-rotate-hint">⟳ סובבו את המכשיר לגרף רחב יותר</div>
      <div class="cum-chart__plot">
        <div class="cum-cursor" id="cum-cursor" hidden></div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block;">
          <line x1="${markX}" y1="${padT}" x2="${markX}" y2="${padT + ih}" stroke="#E5E7EB" stroke-width="1" stroke-dasharray="3 3"></line>
          <polyline points="${planPts}" fill="none" stroke="#9CA3AF" stroke-width="2" stroke-dasharray="6 4"></polyline>
          ${forecastPts ? `<polyline points="${forecastPts}" fill="none" stroke="#059669" stroke-width="2" stroke-dasharray="5 4" opacity="0.55"></polyline>` : ""}
          <polyline points="${actualPts}" fill="none" stroke="#059669" stroke-width="2.6"></polyline>
          ${labels}
        </svg>
        <div class="cum-tip" id="cum-tip" hidden></div>
      </div>
    </div>`;
}

/* Tooltip על הגרף — עכבר בריחוף (דסקטופ) או גרירת אצבע (מובייל).
   מוצג חודש + פער מדויק, וקו אנכי שעוקב אחרי המיקום. */
function bindChartHover(container) {
  const wrap = container.querySelector("#cum-chart .cum-chart__plot");
  const svg = wrap && wrap.querySelector("svg");
  const tip = container.querySelector("#cum-tip");
  const cursor = container.querySelector("#cum-cursor");
  if (!wrap || !svg || !tip || !budgetSeries) return;
  const s = budgetSeries, asof = budgetAsOf;

  function showAt(clientX) {
    const rect = svg.getBoundingClientRect();
    let relX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    let i = Math.round((relX / rect.width) * 11);
    i = Math.max(0, Math.min(11, i));
    const plan = s.plan[i], act = s.actual[i], gap = act - plan;
    const future = i > asof;
    tip.innerHTML =
      '<div class="cum-tip__m">' + s.labels[i] + '</div>' +
      '<div>תכנון: <b>' + CBA.formatILS(plan) + '</b></div>' +
      '<div>' + (future ? "ביצוע (עד היום): " : "ביצוע: ") + '<b>' + CBA.formatILS(act) + '</b></div>' +
      '<div class="' + (gap > 0 ? "neg" : "pos") + '">פער: ' + (gap > 0 ? "+" : "") + CBA.formatILS(gap) + '</div>';
    tip.hidden = false;
    tip.style.left = Math.max(6, Math.min(relX + 10, rect.width - 150)) + "px";
    tip.style.top = "6px";
    if (cursor) { cursor.hidden = false; cursor.style.left = ((i / 11) * rect.width) + "px"; }
  }
  function hide() { tip.hidden = true; if (cursor) cursor.hidden = true; }

  wrap.addEventListener("mousemove", function (e) { showAt(e.clientX); });
  wrap.addEventListener("mouseleave", hide);
  wrap.addEventListener("touchstart", function (e) { if (e.touches[0]) showAt(e.touches[0].clientX); }, { passive: true });
  wrap.addEventListener("touchmove", function (e) {
    if (e.touches[0]) { showAt(e.touches[0].clientX); e.preventDefault(); }  // עוצר גלילה בזמן גרירה על הגרף
  }, { passive: false });
  wrap.addEventListener("touchend", hide);
}

/* --- קבוצה + כרטיסיות --- */
function groupHTML(g, pace, silent) {
  const sub = pace
    ? `בוצע <b>${CBA.formatILS(g.actual)}</b> מתוך צפי ${CBA.formatILS(g.expected)}`
    : `בוצע <b>${CBA.formatILS(g.actual)}</b> מתוך ${CBA.formatILS(g.plan)}`;
  return `
    <div class="bgroup">
      <div class="bgroup__head">
        <div class="bgroup__name">${CBA.esc(g.name)}</div>
        <div class="bgroup__sub">${sub}</div>
      </div>
      <div class="budget-grid">
        ${g.rows.map(function (r) { return swipeWrap(r, pace ? paceCardHTML(r, silent) : cardHTML(r, silent)); }).join("")}
      </div>
    </div>`;
}

/* עוטף כרטיס במעטפת החלקה + כפתור "הוסף הוצאה" שנחשף במובייל בלבד.
   בדסקטופ הכפתור מוסתר ב-CSS והמעטפת שקופה לחלוטין. */
function swipeWrap(r, inner) {
  return '<div class="bcard-swipe">' + inner +
    '<button class="bcard-action" data-add-cat="' + r.id + '" tabindex="-1" aria-hidden="true">הוסף הוצאה</button></div>';
}

/* כרטיסייה — מבט "מול סך השנה".
   silent=true (עדכון רקע): בלי אנימציית כניסה ובלי "מילוי" פס — הכול מופיע
   ישר במצבו הסופי, כדי שרענון ברקע לא יזיז/יהבהב שום דבר. */
function cardHTML(r, silent) {
  const noBudget = r.plan === 0;
  const pctText = noBudget ? (r.actual > 0 ? "ללא תקציב" : "0%") : Math.round(r.pct) + "%";
  const barWidth = Math.min(r.pct, 100);
  const over = r.remaining < 0;
  const remainHTML = noBudget
    ? (r.actual > 0 ? `<span class="ico-over">▲</span>הוצאו <b class="is-over">${CBA.formatILS(r.actual)}</b> ללא סעיף מתוכנן` : `אין הוצאות`)
    : (over ? `<span class="ico-over">▲</span>חריגה של <b class="is-over">${CBA.formatILS(-r.remaining)}</b>` : `<span class="ico-under">▼</span>נותרו <b>${CBA.formatILS(r.remaining)}</b>`);
  const delay = cardEnterDelay();
  const cardStyle = silent ? "animation:none" : ("animation-delay:" + delay + "ms");
  const barStyle = silent ? ("width:" + barWidth + "%") : "width:0";
  return `
    <div class="bcard bcard--${r.band}" data-cat="${CBA.esc(r.id)}" style="${cardStyle}">
      <div class="bcard__top">
        <div class="bcard__name">${CBA.esc(r.name)}</div>
        <div class="bcard__pct bcard__pct--${r.band}">${pctText}</div>
      </div>
      <div class="bcard__amounts">
        <span class="bcard__actual">${CBA.formatILS(r.actual)}</span>
        <span class="bcard__plan">/ ${CBA.formatILS(r.plan)}</span>
      </div>
      <div class="bar"><div class="bar__fill bar__fill--${r.band}" style="${barStyle}" data-fill="${barWidth}"></div></div>
      <div class="bcard__remain">${remainHTML}</div>
      ${itemsListHTML(r.items)}
    </div>`;
}

/* רשימת ניצול תת-סעיפים (סעיף 6, 2026-08-10) — מלל מוקטן ובהיר מתחת לכרטיסייה,
   שורה לכל פריט: שם + בוצע/מתוכנן. מוצג רק לסעיף מפורט (r.items לא null/ריק,
   ר' itemsActualForCategory ב-dataService.js) — סעיף רגיל לא מקבל שורה נוספת. */
function itemsListHTML(items) {
  if (!items || !items.length) return "";
  return '<div class="bcard__items">' + items.map(function (it) {
    return '<div class="bcard__items-row"><span class="bcard__items-name">' + CBA.esc(it.name) + '</span>' +
      '<span class="bcard__items-val">' + CBA.formatILS(it.actual) + ' / ' + CBA.formatILS(it.plan) + '</span></div>';
  }).join("") + '</div>';
}

/* עיכוב הכניסה של הכרטיסייה הבאה בתור — גדל בהדרגה כדי לתת תחושה של "מילוי"
   השורות אחת אחרי השנייה, אבל מוגבל לתקרה כדי שהמסך לא ירגיש איטי כשיש הרבה סעיפים.
   רלוונטי רק בניווט רגיל (silent=false) — בעדכון רקע שקט זה לא בשימוש. */
function cardEnterDelay() {
  const i = cardStaggerIndex++;
  return 60 + Math.min(i, 10) * 35;
}

/* כרטיסייה — מבט "מול השלב בשנה" (ביצוע מול צפי מצטבר) */
function paceCardHTML(r, silent) {
  const noExp = r.expected === 0;
  const pctText = noExp ? (r.actual > 0 ? "מעל הצפי" : "—") : Math.round(r.pct) + "%";
  const barWidth = Math.min(r.pct, 100);
  const remainHTML = r.diff > 0
    ? `<span class="ico-over">▲</span>חריגה מהקצב <b class="is-over">${CBA.formatILS(r.diff)}</b>`
    : (r.diff < 0 ? `<span class="ico-under">▼</span>מתחת לקצב <b>${CBA.formatILS(-r.diff)}</b>` : `בדיוק בקצב`);
  const delay = cardEnterDelay();
  const cardStyle = silent ? "animation:none" : ("animation-delay:" + delay + "ms");
  const barStyle = silent ? ("width:" + barWidth + "%") : "width:0";
  return `
    <div class="bcard bcard--${r.band}" data-cat="${CBA.esc(r.id)}" style="${cardStyle}">
      <div class="bcard__top">
        <div class="bcard__name">${CBA.esc(r.name)}</div>
        <div class="bcard__pct bcard__pct--${r.band}">${pctText}</div>
      </div>
      <div class="bcard__amounts">
        <span class="bcard__actual">${CBA.formatILS(r.actual)}</span>
        <span class="bcard__plan">/ צפי ${CBA.formatILS(r.expected)}</span>
      </div>
      <div class="bar"><div class="bar__fill bar__fill--${r.band}" style="${barStyle}" data-fill="${barWidth}"></div></div>
      <div class="bcard__remain">${remainHTML}</div>
      ${itemsListHTML(r.items)}
    </div>`;
}

/* פתיחת חלון צד עם פירוט ההוצאות של הסעיף */
function openDrawer(catId) {
  closeDrawer();
  const cat = CBA.data.getBudgetRows().find(function (r) { return r.id === catId; });
  const items = CBA.data.getTransactions().filter(function (t) { return t.categoryId === catId; });
  const rowsHTML = items.length ? items.map(function (t) {
    return `
      <tr>
        <td class="dt__date">${CBA.esc(t.date || "")}</td>
        <td>${CBA.esc(t.description)}<div class="dt__supplier">${CBA.esc(t.supplier)}</div></td>
        <td class="dt__amount">${CBA.formatILS(t.amount)}</td>
        <td>${statusBadge(t)}</td>
      </tr>`;
  }).join("") : `<tr><td style="color:var(--text-muted); padding:16px 4px;">אין הוצאות בסעיף זה.</td></tr>`;

  const overlay = document.createElement("div");
  overlay.id = "cba-drawer";
  overlay.innerHTML = `
    <div class="drawer-backdrop" data-close></div>
    <aside class="drawer" role="dialog" aria-label="פירוט ${CBA.esc(cat.name)}">
      <div class="drawer__head">
        <div>
          <div class="drawer__title">${CBA.esc(cat.name)}</div>
          <div class="drawer__sub">בוצע ${CBA.formatILS(cat.actual)} מתוך ${CBA.formatILS(cat.plan)}</div>
        </div>
        <button class="drawer__close" data-close aria-label="סגור">×</button>
      </div>
      <div class="drawer__body">
        <table class="dt">${rowsHTML}</table>
      </div>
    </aside>`;
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-close]").forEach(function (el) { el.addEventListener("click", closeDrawer); });
  document.addEventListener("keydown", onEscClose);
}
function closeDrawer() {
  const el = document.getElementById("cba-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", onEscClose);
}
function onEscClose(e) { if (e.key === "Escape") closeDrawer(); }

function statusBadge(t) {
  const s = CBA.data.statusMeta(t.status);
  const src = t.source === "resident" ? "תושב" : "מנהל";
  return `<span class="badge badge--${s.cls}">${s.label}</span><span class="badge-src">${src}</span>`;
}
