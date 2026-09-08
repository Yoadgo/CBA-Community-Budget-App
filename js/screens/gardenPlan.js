/* ============================================================================
 *  "מראה שיכון" — תוכנית העבודה (2026-09-08)
 * ----------------------------------------------------------------------------
 *  המסך שחסר. עד היום היה טאב "גינון — שגרה" בגיליון ואף מסך לא כתב אליו,
 *  ולכן על השאלה "איפה אני עורך משימות שבועיות/חודשיות" לא הייתה תשובה.
 *
 *  שלוש החלטות עיצוב שנסגרו בצוות האדום של 8.9:
 *  1. **הקיבוץ הוא לפי תדירות בלבד** — שבועי / דו-שבועי / חודשי / שנתי.
 *     קודם קובץ גם לפי "עונה", וזה ערבב שני צירים: משימה יכולה להיות חודשית
 *     *וגם* רק בחורף. חלון החודשים ירד להיות תכונה על השורה.
 *  2. **"כל השנה" אינו מוצג.** ברירת מחדל שחוזרת בכל שורה מפסיקה להיות מידע.
 *  3. **אין מחיקה, יש כיבוי.** הגדרה שנמחקת לוקחת איתה את ההיסטוריה של
 *     המשימות שנולדו ממנה (הן מצביעות אליה ב"מזהה תבנית"). מתג פעיל/כבוי
 *     עוצר את הייצור קדימה ומשאיר את העבר שלם.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};
  var esc = CBA.esc;

  var ICONS = {
    lawn:  '<path d="M3 20h18"/><path d="M6 20c0-4 1-6 2-8M11 20c0-5 1-8 1-11M16 20c0-4 1-6 2-8"/>',
    water: '<path d="M12 3c3.5 4.5 5.5 7.4 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10.4 8.5 7.5 12 3Z"/>',
    tree:  '<path d="M12 21v-5"/><path d="M12 16a5.5 5.5 0 0 0 1.6-10.8A4.4 4.4 0 0 0 7 5.6 4.2 4.2 0 0 0 8.6 14 5.4 5.4 0 0 0 12 16Z"/>',
    prune: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M7.7 16.3 18 4M16.3 16.3 6 4"/>',
    weed:  '<path d="M12 21v-8"/><path d="M12 13c0-3-2.2-5-5-5 0 3 2.2 5 5 5Z"/><path d="M12 13c0-3.4 2.5-5.6 5.6-5.6 0 3.4-2.5 5.6-5.6 5.6Z"/>',
    clean: '<path d="M5 7h14"/><path d="M10 7V4.6h4V7"/><path d="M6.6 7 8 20h8l1.4-13"/>',
    bed:   '<circle cx="12" cy="8.4" r="2.4"/><path d="M12 6c0-2.2-3.6-2.2-3.6 0S12 10.6 12 8.4ZM12 6c0-2.2 3.6-2.2 3.6 0S12 10.6 12 8.4ZM12 21v-8"/>',
    pin:   '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    cal:   '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14"/><path d="M10 7V4.6h4V7"/><path d="M6.6 7 8 20h8l1.4-13"/>' +
           '<path d="M10 11v5M14 11v5"/>',
    edit:  '<path d="M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5 4 20Z"/>',
    cloud: '<path d="M6.5 19a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.2-1.6A4.2 4.2 0 0 1 21 12.6"/>' +
           '<path d="m15 15 6 6M21 15l-6 6"/>',
    rot:   '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9a3 3 0 0 1 3-3h14"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v2a3 3 0 0 1-3 3h-14"/>'
  };
  function ico(n, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round"' +
      (w ? ' style="width:' + w + 'px;height:' + w + 'px"' : '') + '>' + (ICONS[n] || "") + '</svg>';
  }

  /* אותה טבלה בדיוק כמו ב-gardenTasks.js ו-resGarden.js — אותה קטגוריה
     חייבת להיראות זהה בשלושת המסכים, אחרת הצבע מפסיק להיות שפה. */
  var CATS = [
    { key: "lawn",  match: /דשא|מדשא/,   ico: "lawn"  },
    { key: "water", match: /השקי|ממטר/,  ico: "water" },
    { key: "tree",  match: /^עצים|עץ/,    ico: "tree"  },
    { key: "prune", match: /גיזום|שיח/,  ico: "prune" },
    { key: "weed",  match: /עשבי|קרקע/,  ico: "weed"  },
    { key: "clean", match: /ניקיון|גזם/, ico: "clean" },
    { key: "bed",   match: /ערוג|שתיל/,  ico: "bed"   }
  ];
  function catOf(name) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].match.test(name || "")) return CATS[i];
    return { key: "lawn", ico: "lawn" };
  }

  /* סדר התצוגה של הקבוצות. הוא לא א"ב ולא סדר הגדרה — הוא מהתכוף לנדיר,
     כי ככה גם נראית שנת עבודה: מה שקורה כל שבוע הוא העיקר. */
  var FREQS = ["שבועי", "דו-שבועי", "חודשי", "שנתי"];
  var FREQ_LABEL = { "שבועי": "כל שבוע", "דו-שבועי": "כל שבועיים",
                     "חודשי": "כל חודש", "שנתי": "פעם בשנה" };
  var MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
                "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  /* '3-11' -> "מרץ–נובמבר" · '10' -> "אוקטובר" · ריק -> "" (ר' החלטה 2).
     מחרוזת שלא מתפרשת מוצגת כמו שהיא ולא נבלעת: הגיליון פתוח לעריכה ידנית,
     ועדיף שיועד יראה טקסט מוזר מאשר ששורה תיראה כאילו אין לה חלון. */
  function windowLabel(txt) {
    var t = String(txt || "").trim();
    if (!t) return "";
    var m = t.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 12) {
      return MONTHS[+m[1] - 1] + "–" + MONTHS[+m[2] - 1];
    }
    var parts = t.split(",").map(function (x) { return x.trim(); });
    if (parts.every(function (x) { return /^\d{1,2}$/.test(x) && +x >= 1 && +x <= 12; })) {
      return parts.map(function (x) { return MONTHS[+x - 1]; }).join(", ");
    }
    return t;
  }

  /* ⚠️ ריק ≠ "כל האזורים". שורה בלי אזורים מייצרת **משימה כללית אחת**
     (ר' gardenPlanAreas_ בשרת), ולא משימה נפרדת לכל אזור. הכיתוב הקודם
     אמר את ההפך, ומי שקרא אותו היה מצפה ל-12 משימות ומקבל אחת. */
  function areaLabel(d, allAreas) {
    if (!d.areas || !d.areas.length) return "משימה אחת, בלי חלוקה לאזורים";
    if (d.rotate) return "אזור אחד בכל מופע, בסבב";
    if (allAreas && d.areas.length === allAreas.length) return "כל האזורים";
    return d.areas.join(" · ");
  }

  CBA.screens.gardenPlan = {
    render: function (container) {
      var defs = [], areas = [], cats = [], busy = false;
      /* כישלון טעינה אינו תוכנית ריקה — ר' אותה הערה ב-gardenTasks.js.
         כאן זה חמור אפילו יותר: "התוכנית עדיין ריקה" מזמין את המנהל להזין
         מחדש משימות שכבר קיימות. */
      var loadErr = null;

      container.innerHTML = '<div class="gd-screen" id="gp-root"></div>';
      var root = container.querySelector("#gp-root");
      draw(true);
      load();

      function load() {
        CBA.data.getGardenPlan(function (res) {
          if (!res || !res.ok) {
            loadErr = (res && res.error) || "לא הצלחתי לטעון את התוכנית";
            draw();
            return;
          }
          loadErr = null;
          defs = res.defs || [];
          areas = res.areas || [];
          cats = res.categories || [];
          draw();
        });
      }

      function row(d) {
        var cat = catOf(d.category);
        var win = windowLabel(d.months);
        var bits = [];
        if (d.category) bits.push('<span class="gp-cat">' + ico(cat.ico, 12) + esc(d.category) + '</span>');
        bits.push('<span class="nb">' + ico("pin", 12) + esc(areaLabel(d, areas)) + '</span>');
        if (d.freq === "חודשי" || d.freq === "שנתי") {
          bits.push('<span class="nb">' + ico("cal", 12) + 'שבוע ' + (d.weekOfMonth || 1) + '</span>');
        }
        return '<article class="gd-rep gp-row k-' + cat.key + (d.active ? "" : " is-off") +
            '" data-id="' + esc(d.id) + '">' +
          '<div class="gp-b">' +
            '<div class="gp-t">' + esc(d.title || "משימה") + '</div>' +
            '<div class="gp-m">' + bits.join('<i>·</i>') +
              (win ? '<span class="gp-win">' + esc(win) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<button type="button" class="gp-edit" data-act="edit" aria-label="עריכה">' +
            ico("edit", 15) + '</button>' +
          '<button type="button" class="gp-sw' + (d.active ? "" : " off") +
            '" data-act="toggle" role="switch" aria-checked="' + (d.active ? "true" : "false") +
            '" aria-label="' + (d.active ? "כיבוי" : "הפעלה") + '"></button>' +
        '</article>';
      }

      function draw(skeleton) {
        if (loadErr && !skeleton) {
          root.innerHTML =
            '<div class="gd-reps"><div class="gd-rep gt-err">' +
              '<u>' + ico("cloud", 30) + '</u><b>לא הצלחתי לטעון</b>' +
              '<span>' + esc(loadErr) + '</span>' +
              '<button type="button" class="gd-cta" id="gp-retry">נסה שוב</button>' +
            '</div></div>';
          root.querySelector("#gp-retry").addEventListener("click", function () {
            loadErr = null; draw(true); load();
          });
          return;
        }
        var body;
        if (skeleton) {
          body = '<div class="gd-reps">' +
            '<div class="skeleton" style="height:62px;border-radius:16px"></div>'.repeat(4) + '</div>';
        } else if (!defs.length) {
          body = CBA.ui.emptyState({
            title: "התוכנית עדיין ריקה",
            sub: "כאן מגדירים מה אמור לקרות וכל כמה זמן. כל הגדרה תייצר משימה " +
                 "בשבוע שלה, מעצמה."
          });
        } else {
          body = FREQS.map(function (f) {
            var list = defs.filter(function (d) { return (d.freq || "שבועי") === f; });
            if (!list.length) return "";
            return '<div class="gt-grp">' + esc(FREQ_LABEL[f] || f) +
              ' <em>· ' + list.length + '</em><hr></div>' +
              '<div class="gd-reps">' + list.map(row).join("") + '</div>';
          }).join("");
          /* תדירות שאינה ברשימה (הוקלדה ידנית בגיליון) לא נעלמת בשקט. */
          var other = defs.filter(function (d) { return FREQS.indexOf(d.freq || "שבועי") === -1; });
          if (other.length) {
            body += '<div class="gt-grp">תדירות לא מוכרת <em>· ' + other.length + '</em><hr></div>' +
              '<div class="gd-reps">' + other.map(row).join("") + '</div>';
          }
        }

        var on = defs.filter(function (d) { return d.active; }).length;
        root.innerHTML =
          '<div class="gt-ctl">' +
            '<div class="gp-sum">' + (defs.length
              ? '<b>' + on + '</b> משימות שגרה פעילות' +
                (defs.length - on ? ' <em>· ' + (defs.length - on) + ' כבויות</em>' : '')
              : 'תוכנית העבודה') + '</div>' +
            '<button type="button" class="gt-tool is-primary" id="gp-new" aria-label="משימה חדשה">' +
              ico("plus", 16) + '</button>' +
          '</div>' +
          '<p class="gp-hint">שינוי כאן משפיע קדימה בלבד. משימות שכבר נכנסו לשבוע לא זזות.</p>' +
          body;

        var nb = root.querySelector("#gp-new");
        if (nb) nb.addEventListener("click", function () { openForm(null); });
        root.addEventListener("click", onClick);
      }

      function byId(id) {
        for (var i = 0; i < defs.length; i++) if (String(defs[i].id) === String(id)) return defs[i];
        return null;
      }

      function onClick(e) {
        var btn = e.target.closest("[data-act]");
        if (!btn) return;
        var art = btn.closest(".gp-row");
        if (!art) return;
        var d = byId(art.dataset.id);
        if (!d) return;
        if (btn.dataset.act === "edit") return openForm(d);
        if (btn.dataset.act === "toggle") return toggle(d, btn);
      }

      /* המתג מתהפך מיד ומתוקן אם השרת סירב. הפעולה הזאת היא היחידה במסך
         שנעשית בלחיצה אחת בלי דיאלוג, ולכן היא גם היחידה שבה השהיה של שנייה
         נקראת כ"לא עבד" ומזמינה לחיצה שנייה. */
      function toggle(d, btn) {
        if (busy) return;
        busy = true;
        var next = !d.active;
        d.active = next;
        btn.classList.toggle("off", !next);
        btn.setAttribute("aria-checked", next ? "true" : "false");
        btn.closest(".gp-row").classList.toggle("is-off", !next);
        CBA.data.gardenPlanActive(d.id, next, function (res) {
          busy = false;
          if (res && res.ok) {
            CBA.ui.toast(next ? "הופעלה" : "כובתה — לא תייצר משימות חדשות");
            return;
          }
          d.active = !next;
          draw();
          CBA.ui.alert((res && res.error) || "השינוי לא נשמר");
        });
      }

      function openForm(d) {
        var isNew = !d;
        d = d || { freq: "שבועי", weekOfMonth: 1, areas: [], active: true };
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap";

        function opt(v, sel) {
          return '<option value="' + esc(v) + '"' + (String(sel) === String(v) ? " selected" : "") +
            '>' + esc(v) + '</option>';
        }
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet" role="dialog" aria-label="' +
            (isNew ? "משימה חדשה בתוכנית" : "עריכת משימה בתוכנית") + '">' +
            '<div class="gt-grip" aria-hidden="true"></div>' +
            '<h4>' + (isNew ? "משימה חדשה בתוכנית" : "עריכה") + '</h4>' +
            '<p class="sub">מה אמור לקרות, וכל כמה זמן.</p>' +

            '<label class="gd-lbl">מה צריך לעשות <s>*</s></label>' +
            '<input class="gd-inp" id="gp-title" maxlength="120" autocomplete="off" ' +
              'value="' + esc(d.title || "") + '" placeholder="למשל: כיסוח מדשאות">' +

            '<div class="gd-row2" style="margin-top:10px">' +
              '<div><label class="gd-lbl">קטגוריה</label>' +
                '<select class="gd-inp" id="gp-cat"><option value=""></option>' +
                cats.map(function (x) { return opt(x, d.category); }).join("") + '</select></div>' +
              '<div><label class="gd-lbl">תדירות <s>*</s></label>' +
                '<select class="gd-inp" id="gp-freq">' +
                FREQS.map(function (f) {
                  return '<option value="' + esc(f) + '"' +
                    ((d.freq || "שבועי") === f ? " selected" : "") + '>' +
                    esc(FREQ_LABEL[f]) + '</option>';
                }).join("") + '</select></div>' +
            '</div>' +

            /* שני השדות התלויים בתדירות. הם מוצגים/מוסתרים ב-syncFreq ולא
               מוסרים מה-DOM, כדי שערך שהוקלד לא ייעלם כשמשנים תדירות ומחזירים. */
            '<div id="gp-anchor" hidden style="margin-top:10px">' +
              '<label class="gd-lbl">השבוע הראשון <s>*</s></label>' +
              '<input class="gd-inp" id="gp-first" type="date" value="' +
                esc(d.firstWeek || "") + '">' +
              '<p class="gp-note">ממנו נספרים המחזורים. בחרו יום ראשון.</p>' +
            '</div>' +
            '<div id="gp-wom" hidden style="margin-top:10px">' +
              '<label class="gd-lbl">שבוע בחודש</label>' +
              '<select class="gd-inp" id="gp-week">' +
                [1,2,3,4].map(function (n) {
                  return '<option value="' + n + '"' +
                    ((d.weekOfMonth || 1) === n ? " selected" : "") + '>שבוע ' + n + '</option>';
                }).join("") + '</select>' +
              '<p class="gp-note">אין שבוע 5 — החודש הוא ארבעה שבועות.</p>' +
            '</div>' +

            '<label class="gd-lbl" style="margin-top:10px">חודשים פעילים</label>' +
            '<input class="gd-inp" id="gp-months" maxlength="40" autocomplete="off" ' +
              'value="' + esc(d.months || "") + '" placeholder="3-11 · 10 · 11,12,1,2">' +
            '<p class="gp-note">ריק = כל השנה.</p>' +

            '<label class="gd-lbl" style="margin-top:10px">אזורים</label>' +
            '<div class="gp-areas" id="gp-areas">' +
              areas.map(function (a) {
                var on = (d.areas || []).indexOf(a) !== -1;
                return '<button type="button" class="gp-chip' + (on ? " on" : "") +
                  '" data-area="' + esc(a) + '">' + esc(a) + '</button>';
              }).join("") +
            '</div>' +
            '<p class="gp-note">בלי בחירה — משימה כללית אחת, בלי חלוקה לאזורים.</p>' +

            '<label class="gp-check" style="margin-top:10px">' +
              '<input type="checkbox" id="gp-rot"' + (d.rotate ? " checked" : "") + '>' +
              '<span>' + ico("rot", 13) + ' סבב — אזור אחד בכל מופע, לפי הסדר</span>' +
            '</label>' +

            '<label class="gd-lbl" style="margin-top:10px">סעיף בתוכנית</label>' +
            '<input class="gd-inp" id="gp-clause" maxlength="60" autocomplete="off" ' +
              'value="' + esc(d.clause || "") + '" placeholder="לא חובה">' +

            '<button type="button" class="gd-cta" id="gp-save" style="margin-top:16px">' +
              (isNew ? "הוספה לתוכנית" : "שמירה") + '</button>' +
            /* מחיקה יושבת בתוך טופס העריכה ולא כפעולה על השורה: היא בלתי
               הפיכה, וכפתור פח ליד מתג בשורה צפופה הוא הזמנה ללחיצה בטעות.
               כאן צריך לפתוח, לקרוא, ולבחור אותה במפורש. */
            (isNew ? '' :
              '<button type="button" class="gp-del" id="gp-delete">' +
                ico("trash", 14) + 'מחיקה מהתוכנית</button>') +
          '</div>';

        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });
        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);

        var freqEl = wrap.querySelector("#gp-freq");
        function syncFreq() {
          var f = freqEl.value;
          wrap.querySelector("#gp-anchor").hidden = f !== "דו-שבועי";
          wrap.querySelector("#gp-wom").hidden = (f !== "חודשי" && f !== "שנתי");
        }
        freqEl.addEventListener("change", syncFreq);
        syncFreq();

        wrap.querySelector("#gp-areas").addEventListener("click", function (e) {
          var b = e.target.closest("[data-area]");
          if (b) b.classList.toggle("on");
        });

        var delBtn = wrap.querySelector("#gp-delete");
        if (delBtn) delBtn.addEventListener("click", function () {
          CBA.ui.confirm(
            '"' + (d.title || "המשימה") + '" תרד מתוכנית העבודה ולא תייצר יותר משימות. ' +
            'משימות שכבר נוצרו ממנה יישארו כמו שהן.',
            { title: "מחיקה מהתוכנית", okText: "מחיקה", danger: true }
          ).then(function (yes) {
            if (!yes || busy) return;
            busy = true;
            CBA.data.gardenPlanDelete(d.id, function (res) {
              busy = false;
              if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "המחיקה לא הצליחה");
              close();
              /* ההודעה אומרת מה באמת קרה ולא הבטחה כללית: אם נוצרו ממנה
                 משימות, זה הרגע היחיד שבו נכון להזכיר שהן נשארו. */
              CBA.ui.toast(res.made
                ? "הוסרה מהתוכנית · " + res.made + " משימות שכבר נוצרו נשארו"
                : "הוסרה מהתוכנית");
              load();
            });
          });
        });

        wrap.querySelector("#gp-save").addEventListener("click", function () {
          if (busy) return;
          var picked = Array.prototype.map.call(
            wrap.querySelectorAll(".gp-chip.on"), function (b) { return b.dataset.area; });
          var payload = {
            id: isNew ? "" : d.id,
            title: wrap.querySelector("#gp-title").value.trim(),
            category: wrap.querySelector("#gp-cat").value,
            freq: freqEl.value,
            firstWeek: wrap.querySelector("#gp-first").value,
            weekOfMonth: wrap.querySelector("#gp-week").value,
            months: wrap.querySelector("#gp-months").value.trim(),
            areas: picked,
            rotate: wrap.querySelector("#gp-rot").checked,
            clause: wrap.querySelector("#gp-clause").value.trim(),
            active: d.active !== false
          };
          if (!payload.title) return CBA.ui.alert("צריך שם למשימה");
          /* אותה בדיקה בדיוק רצה גם בשרת. היא כאן כדי לא לשלוח בקשה שתידחה,
             ושם כי לקוח אינו גבול אבטחה. ר' gardenPlanSave_. */
          if (payload.freq === "דו-שבועי" && !payload.firstWeek) {
            return CBA.ui.alert("למחזור דו-שבועי צריך לבחור את השבוע הראשון");
          }
          busy = true;
          CBA.data.gardenPlanSave(payload, function (res) {
            busy = false;
            if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "השמירה לא הצליחה");
            close();
            CBA.ui.toast(isNew ? "נוספה לתוכנית" : "נשמר");
            load();
          });
        });
      }
    }
  };
})();
