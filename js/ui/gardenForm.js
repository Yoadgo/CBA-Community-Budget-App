/* ============================================================================
 *  gardenForm.js — טופס משימה אחד   (2026-09-22)
 * ----------------------------------------------------------------------------
 *  בקשת יועד: "המשימה החדשה והמשימה החדשה בתוכנית עבודה צריכים להתנהג
 *  אותו דבר, מבחינתי ברמה של נראות אותו דבר — רק שבתוכנית עבודה זה
 *  מתעורר כפריסט בתור משימה חוזרת ובמשימות זה מתעורר כפריסט במשימה."
 *
 *  עד היום היו **שני טפסים** לאותו דבר בדיוק: `openNewTask` במסך המשימות
 *  ו-`openForm` בתוכנית העבודה. הם כבר הספיקו לסטות — כותרות שונות,
 *  סדר שדות שונה, ניסוח שונה לאותה תדירות — וזו בדיוק המחלקה של שמונת
 *  הגיליונות המגולפים ביד שאיחדנו בממצאים 23 · 24 · 27.
 *
 *  🔑 **מנגנון אחד, שלושה פריסטים:**
 *     mode:"task"        → המתג כבוי  — נפתחת תקלה ב-gardenTasks
 *     mode:"plan"        → המתג דלוק  — נוספת הגדרה ב-gardenPlan
 *     mode:"plan" + data → עריכת הגדרה קיימת; המתג נעול דלוק
 *
 *  🔑 **כפתורים עם סמלילים, לא רשימות נגללות** (בקשת יועד). כל בחירה
 *     מתוך רשימה סגורה — קטגוריה, אזור, מתי, תדירות, שבוע בחודש —
 *     היא צ'יפ. `select` נשאר רק במקום שאין בו רשימה סגורה: כלומר
 *     בשום מקום כאן. הצ'יפים הם `.gd-cat` (עם סמליל וצבע קטגוריה)
 *     ו-`.gp-chip` (גלולה) — שניהם כבר קיימים ב-garden.css ומשמשים
 *     בטופס הדיווח של התושב ובתוכנית העבודה.
 *
 *  ⚠️ **תלויות מוזרקות ולא מיובאות.** `ico`, `catOf` ו-`esc` מגיעים
 *     מהמסך הקורא. זה לא טקס: טבלת הקטגוריות קיימת היום פעמיים
 *     (gardenTasks.js ו-resGarden.js) ו**כבר סטתה** — ברירת המחדל
 *     באחת היא `lawn` ובשנייה `clean`. עותק שלישי כאן היה מחמיר את
 *     הבעיה; הזרקה משאירה מקור אחד לכל קורא עד שהטבלה תאוחד בעצמה.
 *  ⚠️ הגיליון נפתח דרך `CBA.ui.mountSheet` — Escape, מלכודת מיקוד,
 *     נעילת גלילה ושומר כפילות מגיעים משם, וכך גם התצוגה כחלון צד
 *     במחשב.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.gardenForm = (function () {
  "use strict";

  var FREQS = ["שבועי", "דו-שבועי", "חודשי", "שנתי"];
  var FREQ_LABEL = { "שבועי": "כל שבוע", "דו-שבועי": "כל שבועיים",
                     "חודשי": "כל חודש", "שנתי": "פעם בשנה" };
  var PHOTO_MAX = 8;

  function chips(list, sel, attr) {
    return list.map(function (x) {
      var v = String(x.v === undefined ? x : x.v);
      var on = Array.isArray(sel) ? sel.indexOf(v) !== -1 : String(sel) === v;
      return '<button type="button" class="gp-chip' + (on ? " on" : "") + '" ' +
        attr + '="' + v.replace(/"/g, "&quot;") + '"' +
        (on ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        (x.label === undefined ? v : x.label) + '</button>';
    }).join("");
  }

  /* מתג — אותו `.gp-sw` של תוכנית העבודה, בתוך שורה עם הסבר. */
  function swRow(id, title, sub, on, locked) {
    return '<button type="button" class="nt-rep" id="' + id + '" role="switch" ' +
        'aria-checked="' + (on ? "true" : "false") + '"' +
        (locked ? ' disabled aria-disabled="true"' : '') + '>' +
      '<span class="nt-rep__t"><b>' + title + '</b><span>' + sub + '</span></span>' +
      '<i class="gp-sw' + (on ? "" : " off") + '" aria-hidden="true"></i>' +
    '</button>';
  }

  /**
   * opts:
   *   mode      "task" | "plan"
   *   data      הגדרה קיימת לעריכה (mode "plan" בלבד)
   *   cats      שמות הקטגוריות
   *   areas     שמות האזורים
   *   ico       (name) => svg
   *   catOf     (name) => {key, ico}
   *   esc       (s) => string
   *   weeks     [{v, label}] — אפשרויות "מתי" במסלול החד-פעמי
   *   onSaved   () => void
   *   onDelete  (data, close) => void   (עריכה בלבד)
   *   task      תקלה קיימת לעריכה (mode "task") — 22.9, בקשת יועד
   *   noRepeat  true = בלי המתג "משימה חוזרת" (הגנן אינו מוסיף לתוכנית)
   *   weekLabel (key) => string — לשבוע שנקבע ואינו בין האפשרויות
   */
  function open(opts) {
    opts = opts || {};
    var esc   = opts.esc || function (s) { return String(s == null ? "" : s); };
    var ico   = opts.ico || function () { return ""; };
    var catOf = opts.catOf || function () { return { key: "lawn", ico: "lawn" }; };
    var cats  = opts.cats || [];
    var areas = opts.areas || [];
    var weeks = opts.weeks || [];
    var isPlan = opts.mode === "plan";
    var d = opts.data || null;
    var isEdit = !!d;
    /* 🔴 22.9 — **עריכת תקלה** (בקשת יועד: "מי שפתח דיווח / תקלה יכול
       לפתוח אותה לעריכה"). אותו טופס בדיוק, ממולא מראש. המתג והתמונות
       יורדים: תקלה לא הופכת לשגרה, ותמונות שצורפו נשארות כפי שהן. */
    var tk = (!isPlan && opts.task) || null;
    var isTaskEdit = !!tk;
    var hideRep = isTaskEdit || !!opts.noRepeat;
    if (tk && tk.week && !weeks.some(function (w) { return w.v === tk.week; })) {
      weeks = weeks.concat([{ v: tk.week,
        label: opts.weekLabel ? opts.weekLabel(tk.week) : tk.week }]);
    }
    var picksMap = (CBA.gardenLang && CBA.gardenLang.TITLE_PICKS) || {};
    var direct = !!(CBA.data.gardenDirectWrites && CBA.data.gardenDirectWrites());

    var st = {
      repeat: isPlan,
      cat: (d && d.category) || (tk && tk.category) || "",
      area: (tk && tk.area) || "",
      areas: (d && d.areas) || [],
      week: tk ? String(tk.week || "") : (weeks.length ? weeks[0].v : ""),
      x: (tk && typeof tk.x === "number") ? tk.x : null,
      y: (tk && typeof tk.y === "number") ? tk.y : null,
      pinArea: "",
      photos: [],
      busy: false
    };

    var wrap = document.createElement("div");
    wrap.className = "gt-sheet-wrap";
    wrap.innerHTML =
      '<div class="gt-sheet-bd"></div>' +
      '<div class="gt-sheet" role="dialog" aria-label="' +
          (isEdit ? "עריכת משימה" : isTaskEdit ? "עריכת תקלה" : "משימה חדשה") + '">' +
        '<div class="gt-grip" aria-hidden="true"></div>' +
        /* 🔴 **כפתור סגירה מפורש** (2026-09-22, מסימולציה חיה).
           הטופס הוא `sticky` — Escape אינו סוגר אותו בכוונה, כי יש בו
           טקסט שהוקלד. היציאה היחידה שנשארה הייתה לחיצה על הרקע, ובחלון
           צד הרקע הוא רצועה שקופה בצד — בדיוק התלונה של ממצא 24
           ("היציאה היחידה היא לחיצה על הרקע, שאינו נראה כמשטח לחיץ").
           כרטיס הפרטים כבר מחזיק את הדפוס הזה; הטופס לא, וזה היה פער. */
        '<div class="gd-sheet-head">' +
          '<h4>' + (isEdit ? "עריכת משימה" : isTaskEdit ? "עריכת תקלה" : "משימה חדשה") + '</h4>' +
          '<button type="button" class="gd-sheet-close" id="gf-x">' +
            ico("x") + 'סגירה</button>' +
        '</div>' +
        '<p class="sub" id="gf-sub"></p>' +

        /* קטגוריה — צ'יפים עם סמליל וצבע, בדיוק כמו בטופס הדיווח של
           התושב. זו הרשימה שהמשתמש מכיר ויזואלית מהכרטיסים עצמם. */
        /* 🔴 22.9 (יועד: "זה צריך להיות אותו ממשק כמו דיווח תושב") —
           **אותו סדר כמו בטופס התושב:** קודם "מה הבעיה?" (קטגוריה), אחר כך
           "כותרת קצרה" עם הקפסולות מעליה ושדה הקלדה מתחתיה. במסלול החוזר
           (תוכנית העבודה) התווית חוזרת ל"מה צריך לעשות" והקפסולות יורדות. */
        '<label class="gd-lbl">' + (isPlan ? 'קטגוריה <em>לא חובה</em>' : 'מה הבעיה? <s>*</s>') +
          '</label>' +
        '<div class="gd-cats" id="gf-cats">' +
          cats.map(function (c) {
            var k = catOf(c);
            return '<button type="button" class="gd-cat k-' + k.key +
              (st.cat === c ? " on" : "") + '" data-c="' + esc(c) + '" ' +
              'aria-pressed="' + (st.cat === c ? "true" : "false") + '">' +
              '<u>' + ico(k.ico) + '</u>' + esc(c) + '</button>';
          }).join("") +
        '</div>' +
        /* 🔴 22.9 (בקשת יועד) — **הצעות לכותרת, כמו בדיווח התושב.** אותה
           רשימה בדיוק (gardenLang.TITLE_PICKS) ואותן קפסולות `.gd-tpick`.
           לחיצה ממלאת את "מה צריך לעשות"; הקלדה חופשית נשארת פתוחה.
           בתוכנית העבודה הן לא מוצגות — שם הכותרת היא שם של שגרה. */
        '<label class="gd-lbl" id="gf-tlbl" style="margin-top:12px">' +
          (isPlan ? 'מה צריך לעשות' : 'כותרת קצרה') + ' <s>*</s></label>' +
        (isPlan ? '' : '<div class="gd-tpicks" id="gf-tpicks"></div>') +
        '<input class="gd-inp" id="gf-title" maxlength="' + (isPlan ? 80 : 60) + '" autocomplete="off" ' +
          'value="' + esc((d && d.title) || (tk && tk.title) || "") + '" ' +
          'placeholder="' + (isPlan ? 'למשל: כיסוח דשא' : 'למשל: ראש ממטרה שבור') + '">' +

        (hideRep ? '' : swRow("gf-rep", "משימה חוזרת",
              "תיכנס לתוכנית העבודה ותיפתח מחדש בכל מחזור",
              st.repeat, isEdit)) +

        /* ---------------- מסלול חד-פעמי ---------------- */
        '<div id="gf-once"' + (st.repeat ? " hidden" : "") + '>' +
          '<label class="gd-lbl" style="margin-top:12px">מתי</label>' +
          '<div class="gp-areas" id="gf-weeks">' + chips(weeks, st.week, "data-w") + '</div>' +

          '<label class="gd-lbl" style="margin-top:12px">אזור <em>לא חובה</em></label>' +
          '<div class="gp-areas" id="gf-area">' + chips(areas, st.area, "data-a1") + '</div>' +

          (direct
            ? '<label class="gd-lbl" style="margin-top:12px">איפה זה? ' +
                '<em>לא חובה — לחצו על המפה</em></label>' +
              '<div class="gd-map nt-map" id="gf-map"></div>' +
              '<p class="gp-note" id="gf-loc">' + (st.x !== null
                ? "המיקום שסומן מוצג על המפה. אפשר ללחוץ כדי להזיז."
                : "סימון המיקום עוזר לצוות למצוא את זה בשטח.") + '</p>' +
              (isTaskEdit ? '' :
              '<label class="gd-lbl" style="margin-top:12px">תמונות ' +
                '<em><span id="gf-pc">0</span> / ' + PHOTO_MAX + '</em></label>' +
              '<div class="gd-thumbs" id="gf-thumbs">' +
                '<button type="button" class="gd-th add" id="gf-add" aria-label="הוספת תמונה">+</button>' +
              '</div>' +
              '<input type="file" id="gf-file" accept="image/*" multiple hidden>')
            : '') +
        '</div>' +

        /* ---------------- מסלול חוזר ---------------- */
        '<div id="gf-every"' + (st.repeat ? "" : " hidden") + '>' +
          '<label class="gd-lbl" style="margin-top:12px">תדירות <s>*</s></label>' +
          '<div class="gp-areas" id="gf-freq">' +
            chips(FREQS.map(function (f) { return { v: f, label: FREQ_LABEL[f] }; }),
                  (d && d.freq) || "שבועי", "data-f") +
          '</div>' +

          '<div id="gf-anchor" hidden style="margin-top:12px">' +
            '<label class="gd-lbl">השבוע הראשון <s>*</s></label>' +
            '<input class="gd-inp" id="gf-first" type="date" value="' +
              esc((d && d.firstWeek) || "") + '">' +
            '<p class="gp-note">ממנו נספרים המחזורים. בחרו יום ראשון.</p>' +
          '</div>' +

          '<div id="gf-wom" hidden style="margin-top:12px">' +
            '<label class="gd-lbl">שבוע בחודש</label>' +
            '<div class="gp-areas" id="gf-womc">' +
              chips([1,2,3,4].map(function (n) { return { v: n, label: "שבוע " + n }; }),
                    (d && d.weekOfMonth) || 1, "data-wom") +
            '</div>' +
            '<p class="gp-note">אין שבוע 5 — החודש הוא ארבעה שבועות.</p>' +
          '</div>' +

          '<label class="gd-lbl" style="margin-top:12px">חודשים פעילים</label>' +
          '<input class="gd-inp" id="gf-months" maxlength="40" autocomplete="off" ' +
            'value="' + esc((d && d.months) || "") + '" placeholder="3-11 · 10 · 11,12,1,2">' +
          '<p class="gp-note">ריק = כל השנה.</p>' +

          '<label class="gd-lbl" style="margin-top:12px">אזורים</label>' +
          '<div class="gp-areas" id="gf-areas">' + chips(areas, st.areas, "data-a") + '</div>' +
          '<p class="gp-note">בלי בחירה — משימה כללית אחת, בלי חלוקה לאזורים.</p>' +

          swRow("gf-rot", "סבב אזורים", "אזור אחד בכל מופע, לפי הסדר",
                !!(d && d.rotate), false) +

          '<label class="gd-lbl" style="margin-top:12px">סעיף בתוכנית</label>' +
          '<input class="gd-inp" id="gf-clause" maxlength="60" autocomplete="off" ' +
            'value="' + esc((d && d.clause) || "") + '" placeholder="לא חובה">' +

          /* 🔑 "מאיזה שבוע" יושב בטופס ולא במודל אחרי השמירה: רואים את
             הבחירה לפני שלוחצים, ואין קליק נוסף. הגדרה חדשה — מהשבוע
             הנוכחי (זה מה שמצפים); עריכה — מהשבוע הבא (הבטוח: השבוע
             שכבר מתוכנן לא זז). המנוע מקפיא מופעים שקודמים לבחירה. */
          '<label class="gd-lbl" style="margin-top:12px">בתוקף החל מ־</label>' +
          '<div class="gp-areas" id="gf-from">' +
            chips([{ v: "now",  label: "השבוע הנוכחי" },
                   { v: "next", label: "השבוע הבא" }], isEdit ? "next" : "now", "data-from") +
          '</div>' +
          '<p class="gp-note">' + (isEdit
            ? "משימות שכבר נוצרו לשבוע הנוכחי נשארות; מהשבוע שתבחר — לפי ההגדרה החדשה."
            : "המשימות ייווצרו מיד, 8 שבועות קדימה.") + '</p>' +
        '</div>' +

        '<button type="button" class="gd-cta" id="gf-go" style="margin-top:16px">' +
          '<span id="gf-go-t"></span></button>' +
        /* מחיקה יושבת בתוך הטופס ולא כפעולה על השורה: היא בלתי הפיכה,
           וכפתור פח בשורה צפופה הוא הזמנה ללחיצה בטעות. */
        (isEdit && opts.onDelete
          ? '<button type="button" class="gp-del" id="gf-del">' +
              ico("trash") + 'מחיקה מהתוכנית</button>'
          : '') +
      '</div>';

    var sheetClose = CBA.ui.mountSheet(wrap, { key: "gf-form", sticky: true });
    function close() { sheetClose(); }
    wrap.querySelector("#gf-x").addEventListener("click", close);
    var q = function (s) { return wrap.querySelector(s); };

    /* ---- בורר צ'יפים גנרי. יחיד או מרובה, אותו קוד. ---- */
    function pick(hostSel, attr, multi, onPick) {
      var host = q(hostSel);
      if (!host) return;
      host.addEventListener("click", function (e) {
        var b = e.target.closest("[" + attr + "]");
        if (!b || !host.contains(b)) return;
        if (multi) {
          b.classList.toggle("on");
        } else {
          Array.prototype.forEach.call(host.querySelectorAll("[" + attr + "]"), function (x) {
            x.classList.remove("on");
            x.setAttribute("aria-pressed", "false");
          });
          b.classList.add("on");
        }
        b.setAttribute("aria-pressed", b.classList.contains("on") ? "true" : "false");
        if (onPick) onPick(b.getAttribute(attr), b);
      });
    }
    function picked(hostSel, attr) {
      return Array.prototype.map.call(
        q(hostSel).querySelectorAll("[" + attr + "].on"),
        function (b) { return b.getAttribute(attr); });
    }

    pick("#gf-cats", "data-c", false, function (v) { st.cat = v; renderPicks(); });

    /* ---- הצעות לכותרת (22.9) ---- */
    var tpicksEl = q("#gf-tpicks"), titleIn = q("#gf-title");
    function renderPicks() {
      if (!tpicksEl) return;
      var list = picksMap[st.cat] || [];
      tpicksEl.hidden = !!st.repeat;
      /* אותן הנחיות בדיוק כמו בטופס התושב. */
      tpicksEl.innerHTML = !st.cat
        ? '<span class="gd-tpicks__hint">בחרו קטגוריה כדי לראות הצעות</span>'
        : !list.length
        ? '<span class="gd-tpicks__hint">אפשר גם פשוט להקליד למטה</span>'
        : list.map(function (t) {
            return '<button type="button" class="gd-tpick' +
              (titleIn.value.trim() === t ? " on" : "") + '" data-t="' + esc(t) + '">' +
              esc(t) + '</button>';
          }).join("");
    }
    if (tpicksEl) {
      tpicksEl.addEventListener("click", function (e) {
        var b = e.target.closest(".gd-tpick");
        if (!b) return;
        titleIn.value = b.getAttribute("data-t");
        renderPicks();
      });
      titleIn.addEventListener("input", renderPicks);
      renderPicks();
    }
    pick("#gf-weeks", "data-w", false, function (v) { st.week = v; });
    pick("#gf-area", "data-a1", false, function (v) { st.area = v; });
    pick("#gf-areas", "data-a", true);
    pick("#gf-womc", "data-wom", false);
    pick("#gf-freq", "data-f", false, syncFreq);
    pick("#gf-from", "data-from", false);

    /* ---- המתג ---- */
    var goT = q("#gf-go-t"), subEl = q("#gf-sub");
    function syncMode() {
      q("#gf-once").hidden = st.repeat;
      q("#gf-every").hidden = !st.repeat;
      subEl.textContent = isTaskEdit
        ? "השינויים נרשמים ביומן המשימה. תמונות שכבר צורפו נשארות."
        : st.repeat
        ? "שגרה שחוזרת מעצמה. אין לה מיקום או תמונות — היא לא תקלה בנקודה אחת."
        : "תקלה שאתה פותח בעצמך — מטופלת כמו תקלה שדייר דיווח עליה, רק בלי דייר שמחכה לתשובה.";
      goT.textContent = (isEdit || isTaskEdit) ? "שמירה" : (st.repeat ? "הוספה לתוכנית" : "פתיחת התקלה");
      var tl = q("#gf-tlbl"), ti = q("#gf-title");
      if (tl) tl.innerHTML = (st.repeat ? "מה צריך לעשות" : "כותרת קצרה") + " <s>*</s>";
      if (ti) {
        ti.maxLength = st.repeat ? 80 : 60;
        ti.placeholder = st.repeat ? "למשל: כיסוח דשא" : "למשל: ראש ממטרה שבור";
      }
      if (typeof renderPicks === "function") renderPicks();
      if (st.repeat) syncFreq();
    }
    if (!isEdit && q("#gf-rep")) {
      q("#gf-rep").addEventListener("click", function () {
        st.repeat = !st.repeat;
        this.setAttribute("aria-checked", st.repeat ? "true" : "false");
        this.querySelector(".gp-sw").classList.toggle("off", !st.repeat);
        syncMode();
      });
    }
    q("#gf-rot").addEventListener("click", function () {
      var on = this.getAttribute("aria-checked") !== "true";
      this.setAttribute("aria-checked", on ? "true" : "false");
      this.querySelector(".gp-sw").classList.toggle("off", !on);
    });

    /* ---- שדות התדירות. מוסתרים ולא מוסרים, כדי שערך שהוקלד לא ייעלם. ---- */
    function syncFreq() {
      var f = (picked("#gf-freq", "data-f")[0]) || "שבועי";
      q("#gf-anchor").hidden = (f !== "דו-שבועי");
      q("#gf-wom").hidden    = (f !== "חודשי" && f !== "שנתי");
    }
    syncMode();

    /* ---- מפה ותמונות — רק במסלול הכתיבה הישירה ---- */
    if (direct && !isPlan) {
      setTimeout(function () {
        var mapEl = q("#gf-map");
        if (!mapEl || !CBA.map) return;
        CBA.map.render(mapEl, {
          head: false, search: false, legend: false, popup: false, pin: true,
          pinAt: st.x !== null ? { x: st.x, y: st.y } : null,
          onPin: function (n, area) {
            st.x = n.x; st.y = n.y; st.pinArea = area || "";
            var loc = q("#gf-loc");
            loc.textContent = st.pinArea
              ? ("המיקום סומן · " + st.pinArea + ". אפשר ללחוץ שוב כדי להזיז.")
              : "המיקום סומן. אפשר ללחוץ שוב כדי להזיז.";
            loc.classList.add("is-ok");
            /* הנעיצה יודעת באיזה אזור היא נפלה — וממלאת אותו רק אם
               המשתמש לא בחר אזור בעצמו. */
            if (st.pinArea && !st.area) {
              var b = q('#gf-area [data-a1="' + st.pinArea.replace(/"/g, "&quot;") + '"]');
              if (b) b.click();
            }
          }
        });
      }, 180);

      var fileEl = q("#gf-file"), thumbsEl = q("#gf-thumbs"), addBtn = q("#gf-add");
      if (addBtn) addBtn.addEventListener("click", function () { fileEl.click(); });
      if (fileEl) fileEl.addEventListener("change", function () {
        Array.prototype.slice.call(fileEl.files || []).forEach(function (f) {
          if (st.photos.length >= PHOTO_MAX) return;
          /* הכיווץ אסינכרוני וכמה קבצים מסיימים בסדר לא צפוי — ולכן
             המכסה נבדקת **שוב** בתוך ה-callback. */
          CBA.photos.toUpload(f, function (item, dataUrl) {
            if (!item || st.photos.length >= PHOTO_MAX) return;
            st.photos.push(item);
            addThumb(dataUrl);
          });
        });
        fileEl.value = "";
      });
      var addThumb = function (url) {
        var el = document.createElement("span");
        el.className = "gd-th";
        el.style.backgroundImage = "url(" + url + ")";
        el.innerHTML = '<button type="button" class="th-x" aria-label="הסרת התמונה">✕</button>';
        el.dataset.i = String(st.photos.length - 1);
        el.querySelector(".th-x").addEventListener("click", function () {
          st.photos.splice(parseInt(el.dataset.i, 10), 1);
          el.remove();
          Array.prototype.forEach.call(thumbsEl.querySelectorAll(".gd-th:not(.add)"),
            function (t, k) { t.dataset.i = String(k); });
          syncPhotos();
        });
        thumbsEl.insertBefore(el, addBtn);
        syncPhotos();
      };
      var syncPhotos = function () {
        q("#gf-pc").textContent = st.photos.length;
        addBtn.style.display = st.photos.length >= PHOTO_MAX ? "none" : "grid";
      };
    }

    /* ---- שמירה ---- */
    q("#gf-go").addEventListener("click", function () {
      var titleEl = q("#gf-title");
      var title = titleEl.value.trim();
      if (!title) { titleEl.focus(); return CBA.ui.alert(st.repeat ? "צריך לכתוב מה צריך לעשות" : "צריך כותרת קצרה"); }
      if (st.busy) return;

      if (st.repeat) {
        var freq = (picked("#gf-freq", "data-f")[0]) || "שבועי";
        var first = q("#gf-first").value;
        /* אותה בדיקה בדיוק רצה בשרת ובכללי האבטחה (gpShapeOk). היא כאן
           רק כדי לא לשלוח בקשה שתידחה. */
        if (freq === "דו-שבועי" && !first) {
          return CBA.ui.alert("למחזור דו-שבועי צריך לבחור את השבוע הראשון");
        }
        st.busy = true;
        return CBA.data.gardenPlanSave({
          id: isEdit ? d.id : "",
          title: title,
          category: (picked("#gf-cats", "data-c")[0]) || "",
          freq: freq,
          firstWeek: first,
          weekOfMonth: (picked("#gf-womc", "data-wom")[0]) || 1,
          months: q("#gf-months").value.trim(),
          areas: picked("#gf-areas", "data-a"),
          rotate: q("#gf-rot").getAttribute("aria-checked") === "true",
          clause: q("#gf-clause").value.trim(),
          active: isEdit ? (d.active !== false) : true,
          /* מפתח שבוע, לא "now"/"next" — המנוע משווה מחרוזות תאריך. */
          effectiveFrom: (function () {
            var G = (typeof GardenRules !== "undefined" && GardenRules) || CBA.gardenRules;
            var wk = G ? G.weekKey(new Date()) : "";
            return ((picked("#gf-from", "data-from")[0]) === "next" && G) ? G.weekShift(wk, 1) : wk;
          })()
        }, function (res) {
          st.busy = false;
          if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "השמירה לא הצליחה");
          close();
          /* הטוסט אומר מה באמת קרה — "נוצרו 16 משימות · הוסרו 2" —
             ולא הבטחה כללית. ר' gardenHorizonSummary. */
          var what = CBA.data.gardenHorizonSummary ? CBA.data.gardenHorizonSummary(res.horizon) : "";
          CBA.ui.toast((isEdit ? "נשמר" : "נוספה לתוכנית העבודה") + (what ? " · " + what : ""));
          if (opts.onSaved) opts.onSaved();
        });
      }

      var cat = (picked("#gf-cats", "data-c")[0]) || "";
      if (!cat) return CBA.ui.alert("צריך לבחור קטגוריה");
      st.busy = true;
      if (isTaskEdit) {
        return CBA.data.gardenEditTask(tk.id, {
          title: title, category: cat,
          area: (picked("#gf-area", "data-a1")[0]) || "",
          week: (picked("#gf-weeks", "data-w")[0]) || "",
          x: st.x, y: st.y
        }, function (res) {
          st.busy = false;
          if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "העריכה לא נשמרה");
          close();
          CBA.ui.toast("התקלה עודכנה");
          if (opts.onSaved) opts.onSaved();
        });
      }
      CBA.data.gardenCreateTask({
        title: title, category: cat,
        area: (picked("#gf-area", "data-a1")[0]) || st.pinArea || "",
        week: (picked("#gf-weeks", "data-w")[0]) || "",
        asReport: true,
        x: st.x, y: st.y, photos: st.photos
      }, function (res) {
        st.busy = false;
        if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "המשימה לא נפתחה");
        close();
        CBA.ui.toast("נפתחה תקלה #" + res.id +
          (res.photosPending ? " · התמונות עולות ברקע" : ""));
        if (opts.onSaved) opts.onSaved();
      });
    });

    var delBtn = q("#gf-del");
    if (delBtn) delBtn.addEventListener("click", function () { opts.onDelete(d, close); });

    setTimeout(function () { q("#gf-title").focus(); }, 120);
    return close;
  }

  return { open: open, FREQS: FREQS, FREQ_LABEL: FREQ_LABEL };
})();
