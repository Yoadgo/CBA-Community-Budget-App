/* ============================================================================
 *  reconcile.js — "בדיקת החזרים" (PHASE 4.2, 2026-09-14)
 * ----------------------------------------------------------------------------
 *  המסך שחסר למנוע ההשוואה. המנוע (js/data/reconkile — js/data/reconcile.js)
 *  נכתב ונבדק ב-7.9 ומאז שכב בלי שאיש קרא לו, כי לא היה מי שיביא לו את
 *  הטבלה ולא היה איפה להציג את התוצאה. ⚠️ כל ההשוואה נשארת שם — הקובץ הזה
 *  אינו מחשב כלום בעצמו, הוא מציג. שני מקומות שמחשבים היו סוטים זה מזה.
 *
 *  הזרימה: בוחרים קובץ xlsx -> השרת ממיר אותו ומחזיר טבלה (parseChargeFile,
 *  ר' Code.gs) -> reconcile.parseChargeGrid מסנן למגזר "שיכון" ->
 *  reconcile.compare משווה מול הבקשות הפתוחות -> ארבע רשימות.
 *
 *  ⚠️ **קריאה בלבד בגרסה הזו.** שום דבר לא נכתב לגיליון, שום מייל לא נשלח
 *     ואף סטטוס לא משתנה. אישור הסבב ומייל מרוכז למשפחה הם השלב הבא, ובמכוון
 *     אחרי שיועד יראה פלט אמיתי על קובץ אמיתי — ר' "מבחן האדום" באפיון:
 *     אם הכול תמיד תואם, המנגנון שווה מעט, וזה נמדד ולא מנוחש.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

CBA.screens.reconcile = (function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  function money(ag) {
    var n = (Number(ag) || 0) / 100;
    return "₪" + n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var state = { result: null, meta: null, err: "", busy: false, rows: null };

  /* RCB2 (גל 9, 1.10.26) — התוצאה מחושבת מחדש בכל ציור מהשורות השמורות, כדי שבקשה שסומנה "שולם" תרד מהרשימות. */
  function recompute() {
    if (!state.rows || !state.meta) return;
    try {
      var txs = CBA.data.getAllTransactions ? CBA.data.getAllTransactions() : CBA.data.getTransactions();
      state.result = CBA.reconcile.compare(state.rows, txs, {});
    } catch (e) { state.result = null; state.err = "הקובץ נקרא אבל לא הצלחנו להשוות אותו: " + String(e); }
  }

  /* RCB1 (גל 9, 1.10.26) — קולבק שחוזר אחרי שהמשתמש עבר מסך שומר את התוצאה אבל לא מצייר לתוך מסך אחר. */
  function drawIfHere(container) {
    if (CBA.onScreen && !CBA.onScreen("reconcile")) return;
    draw(container);
  }

  function txLine(t) {
    return '<li>' + esc(t.supplier || t.buyer || ("בקשה #" + t.id)) +
           ' · <b>' + money(CBA.reconcile.agorot(t.amount)) + '</b>' +
           (t.month ? ' · ' + esc(t.month) : '') +
           ' · #' + esc(t.id) + '</li>';
  }

  function explainHTML(item) {
    var e = item.explain || {};
    if (e.mode === "one") {
      return '<div class="rc-why">' +
        'הסכום ששולם מכסה בדיוק ' + e.included.length + ' מהבקשות. ' +
        '<b>לא נכלל:</b><ul class="rc-txs">' + e.excluded.map(txLine).join("") + '</ul></div>';
    }
    if (e.mode === "many") {
      return '<div class="rc-why">יש ' + e.count + ' צירופים שונים שמסתכמים בדיוק לסכום ששולם — ' +
             'לא ננחש איזה מהם. צריך לבדוק מול הרשימה.</div>';
    }
    if (e.mode === "too-many") {
      return '<div class="rc-why">' + e.n + ' בקשות פתוחות — יותר מדי כדי לבדוק כל צירוף.</div>';
    }
    return '<div class="rc-why">שום צירוף של הבקשות הפתוחות לא מסתכם לסכום ששולם.</div>';
  }

  function pendingHTML(item) {
    if (!item.withPending) return "";
    return '<div class="rc-why rc-why--warn">' +
      '⚠️ הפער נסגר בדיוק אם מצרפים בקשה ש<b>עדיין לא אושרה</b>. כלומר ייתכן ' +
      'ששולם על משהו שטרם עבר אישור:<ul class="rc-txs">' +
      item.withPending.included.filter(function (t) {
        return t.status === "submitted" || t.status === "review";
      }).map(txLine).join("") + '</ul></div>';
  }

  /* 29.9.26 — כשההתאמה נעשתה לפי מילים משותפות ולא לפי שם זהה, מראים
     למי חיברנו, כדי שאפשר יהיה לתפוס חיבור שגוי בעין. */
  function matchNote(it) {
    if (it.how !== "fuzzy") return "";
    return '<div class="rc-sub">זוהה לפי שם דומה ← ' + esc(it.group.label) + '</div>';
  }

  function block(title, tone, n, bodyHTML, sub) {
    if (!n) return "";
    return '<section class="card club-card rc-block is-' + tone + '">' +
      '<div class="rc-head"><b>' + esc(title) + '</b><span class="rc-n">' + n + '</span></div>' +
      (sub ? '<p class="rc-sub">' + esc(sub) + '</p>' : "") +
      bodyHTML + '</section>';
  }

  function resultHTML() {
    var r = state.result, m = state.meta;
    var head =
      '<div class="rc-meta card club-card">' +
        '<div><b>' + esc(m.fileName) + '</b> · גיליון "' + esc(m.sheet) + '"</div>' +
        '<div class="rc-sub">' + m.mineRows + ' שורות במגזר "שיכון" מתוך ' + m.allRows + ' בקובץ' +
          (m.creditDate ? ' · תאריך זיכוי צפוי: ' + esc(m.creditDate) : '') + '</div>' +
        '<button type="button" class="rc-again">קובץ אחר</button>' +
      '</div>';

    var gaps = r.gap.map(function (it) {
      return '<div class="rc-item">' +
        '<div class="rc-item__top"><b>' + esc(it.row.name) + '</b>' +
          '<span class="rc-nums">בקובץ ' + money(it.row.amountAg) +
          ' · אצלנו ' + money(it.sumAg) +
          ' · <u>' + (it.deltaAg > 0 ? "עודף " : "חסר ") + money(Math.abs(it.deltaAg)) + '</u></span></div>' +
        matchNote(it) +
        '<ul class="rc-txs">' + it.group.txs.map(txLine).join("") + '</ul>' +
        explainHTML(it) + pendingHTML(it) +
      '</div>';
    }).join("");

    var none = r.noRequests.map(function (it) {
      return '<div class="rc-item">' +
        '<div class="rc-item__top"><b>' + esc(it.row.name) + '</b>' +
          '<span class="rc-nums">שולם ' + money(it.row.amountAg) + '</span></div>' +
        '<div class="rc-why">' +
          (it.pendingOnly
            ? 'אין לו בקשה שאושרה להעברה — אבל יש בקשות שעדיין ממתינות לאישור. ייתכן ששולם לפני האישור.'
            : 'אין לו שום בקשה פתוחה אצלנו. זה הדגל האדום החזק ביותר בדף הזה.') +
        '</div>' +
        (it.candidates && it.candidates.length
          ? '<div class="rc-why rc-why--warn">' +
            (it.level === "ambiguous"
              ? 'השם דומה ליותר מנמען אחד, ולכן לא חיברנו אוטומטית: '
              : 'התאמה בינונית — ייתכן שזה: ') +
            it.candidates.map(function (c) {
              return '<b>' + esc(c.group.label) + '</b>' +
                     (c.shared && c.shared.length ? ' (משותף: ' + esc(c.shared.join(" ")) + ')' : '');
            }).join(" / ") + '</div>'
          : '') +
        '</div>';
    }).join("");

    var missing = r.notInFile.map(function (it) {
      return '<div class="rc-item">' +
        '<div class="rc-item__top"><b>' + esc(it.group.label) + '</b>' +
          '<span class="rc-nums">' + money(it.sumAg) + '</span></div>' +
        '<ul class="rc-txs">' + it.group.txs.map(txLine).join("") + '</ul></div>';
    }).join("");

    var okList = r.ok.map(function (it) {
      return '<div class="rc-ok-row"><span>' + esc(it.row.name) +
             (it.how === "fuzzy" ? ' <span class="rc-sub">(' + esc(it.group.label) + ')</span>' : '') +
             '</span>' +
             '<b>' + money(it.sumAg) + '</b>' +
             '<span class="rc-sub">' + it.group.txs.length +
             (it.group.txs.length === 1 ? ' בקשה' : ' בקשות') + '</span></div>';
    }).join("");

    var body =
      block("שולם בלי שום בקשה פתוחה", "danger", r.noRequests.length, none,
            "הדבר הראשון לבדוק. תשלום שיצא ואין לו בקשה מאושרת אצלנו.") +
      block("פער בסכום", "danger", r.gap.length, gaps,
            "הנמען זוהה, אבל הסכום בקובץ אינו שווה לסכום הבקשות הפתוחות שלו.") +
      block("בקשות פתוחות שאינן בקובץ", "warn", r.notInFile.length, missing,
            "אושרו להעברה אצלנו ולא הופיעו ברשימת התשלומים הזו.") +
      block("תואם", "ok", r.ok.length, '<div class="rc-oks">' + okList + '</div>');

    if (!r.noRequests.length && !r.gap.length && !r.notInFile.length) {
      body += '<section class="card club-card">' + CBA.ui.emptyState({
        icon: "check", title: "הכול תואם",
        sub: "כל שורה בקובץ נפגשה עם הבקשות הפתוחות שלה, ולא נשארה אף בקשה בחוץ."
      }) + '</section>';
    }
    return head + body;
  }

  /* A0/A1 (אושר ע"י יועד 30.9.26, ספר האבנים) — סרגל הניהול הדק של "בדיקת החזרים".
     • "ממתינות לתשלום" — בקשות בסטטוס ready מכל השנים שנטענו: בדיוק הרשימה
       "open" שהמנוע משווה מולה (אותו getAllTransactions שנמסר ל-compare).
       לחיצה גוללת לתוצאות / לבורר.
     • "דגלים אדומים" — שני הבלוקים האדומים של התוצאה ("שולם בלי שום בקשה
       פתוחה" + "פער בסכום"), מאותה תוצאה שעל המסך. לפני בחירת קובץ: "—".
       לחיצה גוללת לבלוק האדום הראשון.
     • "בחירת קובץ" עבר מכרטיס הבורר לסרגל — אותו input#rc-file ואותו load().
       ה-input יושב בסרגל, ולכן אפשר לבחור קובץ חדש גם כשהתוצאה מוצגת
       ("קובץ אחר" בגוף נשאר כמו שהוא). מוסתר בזמן קריאת קובץ.
     בלי canopy.js — המסך בדיוק כמו קודם (כותרת, כפתור וקלט בגוף). */
  var ICO = '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>';
  function shell(container) {
    if (!CBA.canopy || !CBA.canopy.shell) return null;
    var sh = CBA.canopy.shell(container, { key: "reconcile", dom: "bud", ico: ICO, title: "בדיקת החזרים",
      pills: [{ id: "rc-p-topay", k: "ממתינות לתשלום" }, { id: "rc-p-red", k: "דגלים אדומים" }],
      act: { id: "rc-bar-go", label: "בחירת קובץ" },
      extra: '<input type="file" id="rc-file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' });
    if (sh.fresh) {
      var file = sh.bar.querySelector("#rc-file");
      var act = sh.bar.querySelector("#rc-bar-go");
      var l = act.querySelector(".cnp2-act__l"), sm = act.querySelector(".cnp2-act__s");
      if (l) l.textContent = "בחירת קובץ";   // הרכיב מוסיף "+" — כאן זו בחירה, לא יצירה
      if (sm) sm.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>';
      act.addEventListener("click", function () { if (!state.busy) file.click(); });
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        file.value = "";
        if (f) load(container, f);
      });
      sh.bar.querySelector("#rc-p-topay").addEventListener("click", function () {
        var el = sh.body.querySelector(".rc-root");
        if (el) { try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
      });
      sh.bar.querySelector("#rc-p-red").addEventListener("click", function () {
        var el = sh.body.querySelector(".rc-block.is-danger");
        if (el) { try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {} }
      });
    }
    return sh;
  }
  function updateBar(sh) {
    if (!sh) return;
    var txs = CBA.data.getAllTransactions ? CBA.data.getAllTransactions() : CBA.data.getTransactions();
    var open = (txs || []).filter(function (t) { return t.status === "ready"; }).length;
    var r = state.result;
    CBA.canopy.pill(sh.bar, "rc-p-topay", open);
    CBA.canopy.pill(sh.bar, "rc-p-red", (r && !state.busy) ? r.noRequests.length + r.gap.length : null);
    sh.bar.querySelector("#rc-bar-go").hidden = !!state.busy;
  }

  function pickerHTML(inBar) {
    return '<section class="card club-card rc-pick">' +
      CBA.ui.emptyState({
        icon: "inbox",
        title: "בדיקת קובץ החיובים החודשי",
        sub: "בוחרים את קובץ ה-Excel שהתקבל מהעמותה. הקובץ נקרא, מושווה מול הבקשות " +
             "שאושרו להעברה, ונמחק. שום דבר לא נשמר ושום מייל לא נשלח."
      }) +
      (inBar ? "" :
      '<div class="rc-actions">' +
        '<button type="button" class="rc-btn" id="rc-go">בחירת קובץ</button>' +
        '<input type="file" id="rc-file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden>' +
      '</div>') +
      (state.err ? '<p class="rc-err">' + esc(state.err) + '</p>' : "") +
    '</section>';
  }

  function draw(container) {
    if (!state.busy) recompute();   /* RCB2 (גל 9, 1.10.26) — ר' recompute */
    var sh = shell(container);   // A0 — בלי canopy.js: null, והמסך כמו קודם
    (sh ? sh.body : container).innerHTML =
      /* A0 — הכותרת עברה לסרגל; שורת ההסבר נשארת בגוף */
      (sh ? '<div class="screen-head"><div class="screen-head__sub">השוואה בין רשימת התשלומים של העמותה לבין הבקשות שאושרו להעברה</div></div>'
          : '<div class="screen-head"><div class="screen-head__title">בדיקת החזרים</div>' +
            '<div class="screen-head__sub">השוואה בין רשימת התשלומים של העמותה לבין הבקשות שאושרו להעברה</div></div>') +
      '<div class="rc-root">' +
        (state.busy
          ? '<section class="card club-card"><div class="club-empty">קורא את הקובץ…</div></section>'
          : (state.result ? resultHTML() : pickerHTML(!!sh))) +
      '</div>';
    updateBar(sh);

    var root = container.querySelector(".rc-root");

    var again = root.querySelector(".rc-again");
    if (again) again.addEventListener("click", function () {
      state.result = null; state.meta = null; state.rows = null; state.err = ""; draw(container);
    });

    var go = root.querySelector("#rc-go");
    var file = root.querySelector("#rc-file");
    if (go && file) {
      go.addEventListener("click", function () { file.click(); });
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        file.value = "";
        if (f) load(container, f);
      });
    }
  }

  function load(container, f) {
    state.err = ""; state.busy = true; draw(container);
    var rd = new FileReader();
    rd.onerror = function () {
      state.busy = false; state.err = "לא הצלחנו לקרוא את הקובץ מהמחשב."; drawIfHere(container);
    };
    rd.onload = function () {
      var s = String(rd.result || "");
      var comma = s.indexOf(",");
      if (comma < 0) { state.busy = false; state.err = "הקובץ ריק."; return drawIfHere(container); }
      CBA.data.parseChargeFile({
        fileName: f.name, mime: f.type || "", data: s.substring(comma + 1)
      }, function (res) {
        state.busy = false;
        if (!res || !res.ok) {
          state.err = (res && res.error) || "השרת לא הצליח לקרוא את הקובץ.";
          return drawIfHere(container);
        }
        try { apply(res, f.name); }
        catch (e) { state.err = "הקובץ נקרא אבל לא הצלחנו להשוות אותו: " + String(e); }
        drawIfHere(container);   /* RCB1 (גל 9, 1.10.26) — ר' drawIfHere */
      });
    };
    rd.readAsDataURL(f);
  }

  function apply(res, fileName) {
    var parsed = CBA.reconcile.parseChargeGrid(res.grid);
    var txs = CBA.data.getAllTransactions ? CBA.data.getAllTransactions() : CBA.data.getTransactions();
    /* RCB3 (גל 9, 1.10.26) — המנוע תומך במיפוי ספקים שמור, אבל אין כזה בשום מקום (לא בגיליון ולא ב-Firestore) — נשאר {}. */
    state.result = CBA.reconcile.compare(parsed.rows, txs, {});
    state.rows = parsed.rows;   /* RCB2 (גל 9, 1.10.26) — נשמר לחישוב מחדש בכל ציור */
    state.meta = {
      fileName: fileName,
      sheet: res.sheet || "",
      allRows: res.rows || 0,
      mineRows: parsed.rows.length,
      creditDate: parsed.rows.length ? CBA.reconcile.creditDateFor(parsed.rows[0].payDate) : ""
    };
    if (!parsed.rows.length) {
      var found = Object.keys(parsed.sectors || {}).filter(Boolean).join(", ");
      state.result = null; state.meta = null; state.rows = null;
      state.err = 'לא נמצאה אף שורה במגזר "שיכון" בגיליון "' + (res.sheet || "") + '"' +
                  (found ? ' (נמצאו: ' + found + ')' : '') + '.';
    }
  }

  return {
    title: "בדיקת החזרים",
    render: function (container) {
      if (!window.CBA.reconcile) {
        container.innerHTML = '<div class="card club-card"><div class="club-empty">' +
          'מנוע ההשוואה לא נטען.</div></div>';
        return;
      }
      draw(container);
    }
  };
})();
