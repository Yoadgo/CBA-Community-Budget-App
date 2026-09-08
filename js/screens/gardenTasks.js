/* ============================================================================
 *  "מראה שיכון" — משימות הצוות (2026-09-07, צעד 4 של מודול הגינון)
 * ----------------------------------------------------------------------------
 *  מסך אחד, gardenTasks, שמשרת שתי אוכלוסיות שחולקות את הרשאת הגינון:
 *    אחראי הגינון (משתמש חיצוני) — רשימת ביצוע של השבוע.
 *    מנהל הגינון (פנימי)          — אותה רשימה, ובהמשך גם תכנון ואישור.
 *  ההבחנה מגיעה מהשרת בשדה isManager ולא מהרשאה שלישית, כי היא כבר קיימת
 *  במערכת בעמודה "סוג משתמש" (ר' authorize_ ב-Code.gs).
 *
 *  שלוש החלטות שמעצבות את הקוד כאן:
 *  1. **סימון ביצוע אינו סוגר משימה.** הוא מרים דגל "ממתין לאישור" בלבד;
 *     הסגירה היא של המנהל. לכן אין כאן בשום מקום כתיבה ל"סגירה".
 *  2. **הסידור הוא של המשתמש, לא שלנו.** אזור / דחיפות / תאריך / סוג —
 *     לבקשת יועד. אזור וסוג מקבצים בכותרות; דחיפות ותאריך מחזירים רשימה
 *     שטוחה, כי קיבוץ לפי ערך רציף יוצר כותרת לכל שורה.
 *  3. **"דחיפות" מחושבת ואינה עמודה בגיליון.** אין שדה עדיפות בטאב המשימות,
 *     ולכן הסדר נגזר מהדגל (חומרה) ואז ממונה הגרירות ואז מהוותק. ר' urgency().
 *     אם בעתיד תיווסף עמודת עדיפות אמיתית — כאן המקום להחליף.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};
  var esc = CBA.esc;

  var ICONS = {
    leaf:  '<path d="M4 20c0-8 5-14 16-15 1 11-5 16-13 16"/><path d="M4 20c3-5 6-8 11-10"/>',
    lawn:  '<path d="M3 20h18"/><path d="M6 20c0-4 1-6 2-8M11 20c0-5 1-8 1-11M16 20c0-4 1-6 2-8"/>',
    water: '<path d="M12 3c3.5 4.5 5.5 7.4 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10.4 8.5 7.5 12 3Z"/>',
    tree:  '<path d="M12 21v-5"/><path d="M12 16a5.5 5.5 0 0 0 1.6-10.8A4.4 4.4 0 0 0 7 5.6 4.2 4.2 0 0 0 8.6 14 5.4 5.4 0 0 0 12 16Z"/>',
    prune: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M7.7 16.3 18 4M16.3 16.3 6 4"/>',
    weed:  '<path d="M12 21v-8"/><path d="M12 13c0-3-2.2-5-5-5 0 3 2.2 5 5 5Z"/><path d="M12 13c0-3.4 2.5-5.6 5.6-5.6 0 3.4-2.5 5.6-5.6 5.6Z"/>',
    clean: '<path d="M5 7h14"/><path d="M10 7V4.6h4V7"/><path d="M6.6 7 8 20h8l1.4-13"/>',
    bed:   '<circle cx="12" cy="8.4" r="2.4"/><path d="M12 6c0-2.2-3.6-2.2-3.6 0S12 10.6 12 8.4ZM12 6c0-2.2 3.6-2.2 3.6 0S12 10.6 12 8.4ZM12 21v-8"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    /* בממשק RTL "שבוע קודם" יושב מימין ו"שבוע הבא" משמאל, ולכן החץ של כל
       אחד מהם מצביע **החוצה** — ימינה מימין, שמאלה משמאל. הגדרות ה-SVG
       האלה תואמות את המיקום ולא את השם הלועזי: prev מצייר "›" ו-next מצייר
       "‹". קודם היה הפוך, ושני החצים הצביעו זה אל זה. */
    prev:  '<path d="M9 18l6-6-6-6"/>',
    next:  '<path d="M15 18l-6-6 6-6"/>',
    dots:  '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    undo:  '<path d="M3 8h11a5 5 0 0 1 0 10H8"/><path d="m6.5 4.5-3 3.5 3 3.5"/>',
    pin:   '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    cal:   '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    note:  '<path d="M4 5h16v11l-4 4H4z"/><path d="M20 16h-4v4"/><path d="M8 9h8M8 13h5"/>',
    merge: '<path d="M7 4v5a4 4 0 0 0 4 4h6"/><path d="M7 20v-5a4 4 0 0 1 4-4h6"/><path d="m14 9 3 2.5-3 2.5"/>',
    /* שלושת אלה נוספו ב-8.9 עם הכרטיס השקט: person מסמן דיווח תושב (החריג
       היחיד שנשאר מסומן במפורש), repeat מסמן משימה חוזרת מתוכנית העבודה,
       ו-filter/help הם שני הלחצנים בשורת הבקרה. */
    person: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
    repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9a3 3 0 0 1 3-3h14"/>' +
            '<path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v2a3 3 0 0 1-3 3h-14"/>',
    filter: '<path d="M3 5h18M6.5 12h11M10 19h4"/>',
    hist:   '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4h4"/>' +
            '<path d="M12 7.5V12l3 1.8"/>',
    help:   '<circle cx="12" cy="12" r="9"/>' +
            '<path d="M9.6 9.2a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.8.7-.8 1.3v.4"/><path d="M12 17h.01"/>'
  };
  function ico(n, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || "") + '</svg>';
  }

  /* קטגוריה -> סמליל וצבע, בהתאמה לפי מילת מפתח (לא מחרוזת מדויקת) — אותה
     טבלה בדיוק כמו ב-resGarden.js, כדי שאותה תקלה תיראה זהה בשני הצדדים. */
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

  /* חומרת הדגל — סדר יורד, זהה לסדר ב-GARDEN_FLAGS בשרת. משמש גם לצביעה
     וגם למיון לפי דחיפות. ערך גבוה = דחוף יותר. */
  var FLAG_RANK = {
    "דורש בדיקה חוזרת": 5,
    "הוחזר להשלמה":    4,
    "דורש בדיקה בשטח": 3,
    "נגררה":           2,
    "ממתין לאישור":    1
  };
  var FLAG_HOT = { "דורש בדיקה חוזרת": 1, "הוחזר להשלמה": 1, "דורש בדיקה בשטח": 1 };

  /* המילים כפי שהן רשומות בעמודה "סוג" בגיליון — ר' GARDEN_KIND_* ב-Code.gs.
     כאן הן משמשות רק לתצוגה, וההשוואה נעשית מול המחרוזת שהשרת החזיר ולא
     מול ניחוש: תצוגה שמנחשת הייתה מתייגת כל מה שאינו שגרה כדיווח תושב. */
  var GK_ROUTINE = "שגרה";
  var GK_REPORT  = "דיווח תושב";

  var MONTHS = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני",
                "יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

  function parseKey(key) {
    var p = String(key || "").split("-");
    var d = new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  function shiftKey(key, weeks) {
    var d = parseKey(key); if (!d) return key;
    d.setDate(d.getDate() + weeks * 7);
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  /* "שבוע 2 · 8–14 בספטמבר". מספר השבוע הוא בתוך החודש של יום ראשון, לפי
     הכלל של יועד: החודש הוא ארבעה שבועות, וחמישי נוצר רק כשנגרר אליו. */
  function weekLabel(key) {
    var a = parseKey(key); if (!a) return "";
    var b = new Date(a.getTime()); b.setDate(b.getDate() + 6);
    var n = Math.floor((a.getDate() - 1) / 7) + 1;
    var range = a.getDate() + "–" + b.getDate() + " ב" + MONTHS[b.getMonth()];
    if (a.getMonth() !== b.getMonth()) {
      range = a.getDate() + " ב" + MONTHS[a.getMonth()] + " – " + b.getDate() + " ב" + MONTHS[b.getMonth()];
    }
    return "שבוע " + n + " · " + range;
  }
  function todayKey() {
    var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - d.getDay());
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* ציון דחיפות. גבוה = קודם ברשימה. אין עמודת עדיפות בגיליון (ר' הערת
     הפתיחה), ולכן: חומרת הדגל דוחפת הכי חזק, אחריה כמה פעמים המשימה כבר
     נגררה, ולבסוף הוותק — משימה ישנה עולה מעל חדשה באותה חומרה. */
  function urgency(t) {
    return (FLAG_RANK[t.flag] || 0) * 1000 + Math.min(t.drags || 0, 20) * 40 + ageDays(t);
  }
  function ageDays(t) {
    var d = parseKey(t.firstWeek || t.week);
    if (!d) return 0;
    return Math.min(Math.round((Date.now() - d.getTime()) / 86400000), 400);
  }

  var SORTS = [
    { k: "area",  label: "אזור",   group: function (t) { return t.area || "ללא אזור"; } },
    { k: "urgent", label: "דחיפות", group: null },
    { k: "date",  label: "תאריך",  group: null },
    /* התווית היא "קטגוריה" ולא "סוג" בכוונה: מאז 7.9 העמודה "סוג" בגיליון
       מחזיקה את *מקור* המשימה (שגרה / דיווח תושב / יזום), וכפתור סידור בשם
       "סוג" שמקבץ לפי מדשאות-עצים-השקיה היה מתנגש בדיוק במונח הזה. */
    { k: "type",  label: "קטגוריה", group: function (t) { return t.category || "ללא קטגוריה"; } }
  ];
  function sortDef(k) {
    for (var i = 0; i < SORTS.length; i++) if (SORTS[i].k === k) return SORTS[i];
    return SORTS[0];
  }

  /* ============================================================================
   *  שני מסכים, קובץ אחד (2026-09-08)
   * ----------------------------------------------------------------------------
   *  "לטיפולך" אינו קובץ נפרד אלא **מצב** של אותו render. הסיבה מעשית: הוא
   *  משתמש באותם כרטיסים, אותו איחוד, אותו שיבוץ, אותו אישור מרוכז ואותם
   *  גיליונות. קובץ שני היה מעתיק את כולם, וכל תיקון עתידי היה צריך לקרות
   *  פעמיים — עד שיום אחד יקרה רק פעם אחת. ר' [[cba-visible-drift-rule]].
   *  ההבדל בין המצבים הוא בציור בלבד: מה נטען, ומה מצויר מעל הרשימה.
   * ========================================================================== */
  CBA.screens.gardenInbox = {
    render: function (container) { CBA.screens.gardenTasks.render(container, "inbox"); }
  };

  CBA.screens.gardenTasks = {
    render: function (container, mode) {
      var inbox = mode === "inbox";
      var week = todayKey();
      var filter = inbox ? "unplanned" : "open";   // open | done | dragged
      var sortBy = "area";
      var rows = [], isManager = false, busy = false;
      // הסדר שבו האזורים והקטגוריות מוגדרים בטאב ההגדרות. הוא הסדר שבו
      // מקבצים — לא א"ב: האזורים כתובים שם מצפון לדרום, וזה מסלול ההליכה
      // האמיתי בשטח. אזור שאינו ברשימה (נמחק/שונה שמו) יורד לסוף.
      var order = { area: [], type: [] };
      /* המשימות שטרם שובצו לשבוע נטענות בקריאה נפרדת (scope=unplanned),
         כי הן לא שייכות לאף שבוע ולכן לא מגיעות עם רשימת השבוע. הן
         מוצגות רק למנהל — לצוות אין מה לעשות עם משימה שטרם תוכננה. */
      var unplanned = [];
      /* תור האישורים נטען בנפרד (scope=pending) ו**אינו תלוי בשבוע הנבחר**.
         אישור שממתין משבוע שעבר לא אמור להיעלם כשמדפדפים לשבוע הבא —
         זו בדיוק הדרך שבה משימות נופלות בין הכיסאות. */
      var pending = [];

      container.innerHTML = '<div class="gd-screen" id="gt-root"></div>';
      var root = container.querySelector("#gt-root");
      draw(true);
      load();

      function load() {
        /* בתיבה הנכנסת אין שבוע — שני התורים שלה חוצי-שבועות בהגדרה. טעינת
           שבוע כאן הייתה גם מיותרת וגם מזיקה: היא מממשת את התוכנית, ואין
           סיבה שפתיחת התיבה תייצר משימות. */
        if (inbox) {
          rows = [];
          CBA.data.getGardenTasks({ scope: "unplanned" }, function (r1) {
            unplanned = (r1 && r1.ok) ? (r1.rows || []) : [];
            order.area = (r1 && r1.areas) || order.area;
            order.type = (r1 && r1.categories) || order.type;
            isManager = true;
            draw();
            loadPending();
          });
          return;
        }
        CBA.data.getGardenTasks({ week: week }, function (res) {
          if (!res || !res.ok) {
            rows = [];
            draw();
            if (res && res.error) CBA.ui.alert(res.error);
            return;
          }
          rows = res.rows || [];
          order.area = res.areas || [];
          order.type = res.categories || [];
          /* בהדמיית תפקיד השרת עדיין עונה לפי המשתמש האמיתי (ר' startRoleSim
             ב-app.js), אז isManager שלו יהיה "מנהל" גם כשמדמים את אחראי הגינון.
             כאן אנחנו כופים את התצוגה למה שמדמים — אחרת ההדמיה מראה מסך שאף
             אחד לא רואה בפועל. המידור עצמו נשאר בשרת ואינו מושפע מזה. */
          var sim = window.CBA.user;
          isManager = (sim && sim.isRoleSim) ? !sim.isExternal : !!res.isManager;
          if (res.week) week = res.week;
          draw();
          if (isManager) { loadUnplanned(); loadPending(); }
        });
      }

      function loadUnplanned() {
        CBA.data.getGardenTasks({ scope: "unplanned" }, function (res) {
          unplanned = (res && res.ok) ? (res.rows || []) : [];
          draw();
        });
      }
      function loadPending() {
        CBA.data.getGardenTasks({ scope: "pending" }, function (res) {
          pending = (res && res.ok) ? (res.rows || []) : [];
          draw();
        });
      }

      function counts() {
        var c = { open: 0, done: 0, dragged: 0, recheck: 0, closed: 0, total: 0 };
        rows.forEach(function (t) {
          /* משימה סגורה מגיעה עכשיו מהשרת בתצוגת השבוע, ולכן היא נספרת
             לחוד ולא כ"פתוחה". עד 8.9 היא לא הגיעה בכלל — והמונה "3 מתוך 12"
             *הקטין את המכנה* בכל אישור, כך ששבוע שהושלם כולו הראה
             "אין משימות". ר' handleGardenTasks_. */
          c.total++;
          if (t.closure) { c.closed++; return; }
          if (t.flag === "ממתין לאישור") c.done++;
          else c.open++;
          if (t.flag === "נגררה" || (t.drags || 0) > 0) c.dragged++;
        });
        // למנהל, "בוצעו" הוא התור המלא ולא רק של השבוע המוצג.
        if (isManager) c.done = pending.length;
        rows.concat(unplanned).concat(pending).forEach(function (t) {
          if (t.flag === "דורש בדיקה חוזרת") c.recheck++;
        });
        return c;
      }
      function visible() {
        if (filter === "unplanned") return unplanned.slice();
        if (filter === "done" && isManager) return pending.slice();
        if (filter === "recheck") {
          return rows.concat(unplanned).concat(pending).filter(function (t) {
            return t.flag === "דורש בדיקה חוזרת";
          });
        }
        /* "בוצעו" הוא הארכיון של השבוע — היחיד שמראה משימות סגורות. */
        if (filter === "closed") {
          return rows.filter(function (t) { return !!t.closure; });
        }
        return rows.filter(function (t) {
          if (t.closure) return false;
          if (filter === "done") return t.flag === "ממתין לאישור";
          if (filter === "dragged") return t.flag === "נגררה" || (t.drags || 0) > 0;
          return t.flag !== "ממתין לאישור";
        });
      }

      function draw(skeleton) {
        var c = counts();
        var total = c.total;
        /* ההתקדמות נמדדת ב**סגורות**, לא ב"סומן כבוצע": סימון הוא הצהרה של
           הצוות, ורק האישור סוגר. עד 8.9 הפס מדד את ההצהרות, כלומר קפץ
           קדימה ברגע שהגנן סימן — וחזר אחורה ברגע שהמנהל אישר. */
        var pct = total ? Math.round((c.closed / total) * 100) : 0;
        var s = sortDef(sortBy);
        var list = visible().slice();

        list.sort(function (a, b) {
          if (sortBy === "urgent") return urgency(b) - urgency(a);
          if (sortBy === "date") return String(a.due || a.week).localeCompare(String(b.due || b.week));
          var ga = s.group ? s.group(a) : "", gb = s.group ? s.group(b) : "";
          if (ga !== gb) return groupRank(ga) - groupRank(gb) || ga.localeCompare(gb, "he");
          return urgency(b) - urgency(a);
        });

        var body;
        if (skeleton) {
          body = '<div class="gd-reps">' +
            '<div class="skeleton" style="height:86px;border-radius:16px"></div>'.repeat(3) + '</div>';
        } else if (!list.length) {
          body = CBA.ui.emptyState(
            filter === "unplanned"
              ? { title: "הכול משובץ", sub: "כל דיווח שהגיע כבר קיבל שבוע." }
              : {
                  title: total ? "אין כאן משימות" : "אין משימות בשבוע הזה",
                  sub: total ? "נסה מסנן אחר."
                    : (isManager && unplanned.length
                        ? unplanned.length + " משימות ממתינות לשיבוץ — ר' הלשונית \"לשיבוץ\"."
                        : "כשמנהל הגינון ישבץ משימות לשבוע — הן יופיעו כאן.")
                });
        } else if (filter === "done" && isManager) {
          body = approvalBody(list);
        } else if (s.group) {
          var groups = [], seen = {};
          list.forEach(function (t) {
            var g = s.group(t);
            if (!seen[g]) { seen[g] = []; groups.push(g); }
            seen[g].push(t);
          });
          body = groups.map(function (g) {
            var n = seen[g].length;
            /* בסידור לפי קטגוריה השבב ירד מהכרטיסים, אז הכותרת נושאת את
               הצבע במקומם — נקודה קטנה בצבע הקטגוריה. בסידור לפי אזור אין
               לכותרת צבע, כי לאזור אין צבע בשום מקום אחר במסך. */
            var dot = sortBy === "type"
              ? '<span class="gt-grp__d k-' + catOf(g).key + '"></span>' : '';
            return '<div class="gt-grp">' + dot + esc(g) +
              ' <em>· ' + (n === 1 ? "משימה אחת" : n + " משימות") + '</em><hr></div>' +
              '<div class="gd-reps">' + seen[g].map(card).join("") + '</div>';
          }).join("");
        } else {
          body = '<div class="gd-reps" style="margin-top:10px">' + list.map(card).join("") + '</div>';
        }

        /* אין כותרת מסך (2026-09-08). הסמליל והכותרת "משימות השבוע" החזיקו
           68px קבועים ולא אמרו דבר שהניווט לא אומר — המשתמש הגיע לכאן מלשונית
           ששמה כתוב עליה. "משימה חדשה" עבר לשורת הבקרה כלחצן ראשי. */
        /* ================= לטיפולך ================= */
        if (inbox) {
          var newOnes = unplanned.slice();
          var toOk = pending.slice();
          root.innerHTML = (!newOnes.length && !toOk.length)
            ? '<div class="gd-reps"><div class="gd-rep gi-zero"><u>' + ico("check") + '</u>' +
              '<b>אין מה לטפל</b><span>כשתושב ידווח, או כשהצוות יסמן משימה כבוצעה — ' +
              'זה יופיע כאן.</span></div></div>'
            : (newOnes.length
                ? '<div class="gt-grp">דיווחים חדשים <em>· ' + newOnes.length + '</em><hr></div>' +
                  '<p class="gi-hint">תושב מחכה לתשובה, וזה עדיין לא עבודה.</p>' +
                  '<div class="gd-reps">' + newOnes.map(inCard).join("") + '</div>'
                : '') +
              (toOk.length
                ? '<div class="gt-grp">בוצע — ממתין לאישורך <em>· ' + toOk.length + '</em><hr></div>' +
                  '<p class="gi-hint">אין כאן מי שמחכה, ולכן זה לא נספר בתג. אישור סוגר, ' +
                  'ואם המשימה הגיעה מתושב — נשלח אליו עדכון.</p>' + approvalBody(toOk)
                : '');
          wire();
          return;
        }

        root.innerHTML =
          '<div class="gt-week">' +
            '<button type="button" data-wk="-1" aria-label="שבוע קודם">' + ico("prev") + '</button>' +
            '<div class="gt-week__c"><b>' + esc(weekLabel(week)) + '</b>' +
              '<span>' + (total ? c.closed + " מתוך " + total + " הושלמו" : "אין משימות") + '</span>' +
              '<div class="gt-bar"><i style="width:' + pct + '%"></i></div></div>' +
            '<button type="button" data-wk="1" aria-label="שבוע הבא">' + ico("next") + '</button>' +
          '</div>' +
          /* שורת בקרה אחת (2026-09-08). לפניה היו כאן שלוש שורות: ארבעה
             אריחים צבעוניים, רצועת מסננים, ורצועת "סידור לפי". האריחים
             ורצועת המסננים החזיקו את אותם מספרים בדיוק, אז נשאר אחד; הסידור
             נכנס לגיליון מאחורי סמליל המסנן, כי הוא בחירה שנעשית פעם בהרבה
             זמן ולא פעולה שחוזרת. המספר היחיד שאיבד מקום קבוע הוא "דורש
             בדיקה חוזרת" — הוא מופיע כמסנן רק כשיש כזה, כי מסנן שתמיד מציג
             אפס הוא רעש. */
          '<div class="gt-ctl">' +
            '<div class="gt-ctl__f">' +
              /* "לבדיקה" ראשון ולא אחרון, כשהוא קיים. הרצועה נגללת אופקית,
                 ובמסך 390px עם חמישה מסננים המסנן החמישי יושב מחוץ לשדה
                 הראייה — ומדובר במסנן היחיד שמצביע על משהו שהשתבש. הוא מופיע
                 רק כשיש מה לבדוק, ולכן אין כאן מיקום קבוע שנשבר. */
              (isManager && c.recheck ? seg("recheck", "לבדיקה", c.recheck) : "") +
              seg("open", "לביצוע", c.open) +
              seg("done", isManager ? "לאישורך" : "בוצעו", c.done) +
              seg("dragged", "נגררו", c.dragged) +
              (isManager && unplanned.length ? seg("unplanned", "לשיבוץ", unplanned.length) : "") +
              /* אחרון בכוונה: הוא ארכיון, לא תור עבודה. מופיע רק כשיש מה
                 להראות, כדי שבשבוע שטרם התחיל הוא לא יציע אפס. */
              (c.closed ? seg("closed", "בוצעו", c.closed) : "") +
            '</div>' +
            (isManager
              ? '<button type="button" class="gt-tool is-primary" id="gt-new" ' +
                'aria-label="משימה חדשה">' + ico("plus") + '</button>'
              : '') +
            '<button type="button" class="gt-tool" id="gt-sort" aria-label="סידור הרשימה">' +
              ico("filter") + '</button>' +
            '<button type="button" class="gt-tool" id="gt-legend" aria-label="מקרא">' +
              ico("help") + '</button>' +
          '</div>' + body;

        wire();
      }

      /* תור האישורים מקובץ אחרת מכל שאר המסך, ובכוונה: כאן הקיבוץ **הוא
         הכלל** ולא העדפת תצוגה. משימות שגרה מאותה תבנית ואותו שבוע הן
         היחידות שמותר לאשר יחד (החלטה 3), אז הן מקובצות יחד ומקבלות כפתור
         "אשר את כל N". כל השאר — דיווחי תושבים ומשימות יזומות — נופלות
         לקבוצת "לאישור פרטני", ושם כל אחת מאושרת לחוד. לכן שורת הסידור לא
         משפיעה על התצוגה הזאת.
         משותף למסך המעקב (מסנן "לאישורך") ולמסך "לטיפולך" — אותה קבוצה
         בדיוק, ולכן פונקציה אחת ולא שני עותקים. */
      function approvalBody(list) {
        var batches = [], seenB = {};
        list.forEach(function (t) {
          var k = (t.kind === GK_ROUTINE && t.templateId)
            ? "b:" + t.templateId + "|" + t.week : "solo";
          if (!seenB[k]) { seenB[k] = []; batches.push(k); }
          seenB[k].push(t);
        });
        return batches.map(function (k) {
          var items = seenB[k];
          var bulk = k !== "solo" && items.length > 1;
          var label = k === "solo" ? "לאישור פרטני"
            : "שגרה · " + (items[0].title || items[0].category || "");
          return '<div class="gt-grp">' + esc(label) +
            ' <em>· ' + (items.length === 1 ? "משימה אחת" : items.length + " משימות") + '</em><hr>' +
            (bulk ? '<button type="button" class="gt-bulk" data-act="batch" data-tpl="' +
               esc(k) + '">' + ico("check") + 'אשר את כל ' + items.length + '</button>' : '') +
            '</div><div class="gd-reps">' + items.map(card).join("") + '</div>';
        }).join("");
      }

      /* כרטיס דיווח חדש. ההבדל מכרטיס משימה הוא לא ויזואלי אלא מהותי: כאן
         לא מסמנים ביצוע אלא **מחליטים אם זו בכלל עבודה**, ולכן במקום תיבת
         סימון יש שלוש תשובות מפורשות. הראשונה — "כבר בתוכנית" — נפתחה רק
         ברגע שיש תוכנית עבודה, והיא היחידה שלא מייצרת עבודה חדשה. */
      function inCard(t) {
        var cat = catOf(t.category);
        return '<article class="gd-rep gt-row k-' + cat.key +
            '" data-id="' + esc(t.id) + '">' +
          '<div class="gt-body">' +
            '<div class="gt-t">' + esc(t.title || t.category || "משימה") + '</div>' +
            '<div class="gt-meta">' +
              (t.kind === GK_REPORT
                ? '<span class="gt-res">' + ico("person") + 'תושב</span><i>·</i>' : '') +
              '<span class="gd-kchip">' + ico(cat.ico) + esc(t.category || "") + '</span>' +
              (t.area ? '<i>·</i><span class="gt-nb">' + ico("pin") + esc(t.area) + '</span>' : '') +
            '</div>' +
            (t.note ? '<div class="gt-note">' + esc(t.note) + '</div>' : '') +
            (t.dupOf
              ? '<div class="gt-dup">' + ico("merge") +
                'נראה כמו כפילות של <b>#' + esc(t.dupOf.id) + '</b> · ' +
                esc(t.dupOf.title || "") + '</div>'
              : '') +
            '<div class="gi-acts">' +
              (t.coveredBy
                ? '<button type="button" class="gi-cta is-plan" data-act="cover">' +
                  ico("repeat") + 'כבר בתוכנית · ' + esc(shortWeek(t.coveredBy.week)) + '</button>'
                : '') +
              (t.dupOf
                ? '<button type="button" class="gi-cta" data-act="merge">' +
                  ico("merge") + 'איחוד</button>'
                : '') +
              '<button type="button" class="gi-cta' + (t.coveredBy || t.dupOf ? " is-ghost" : "") +
                '" data-act="plan">' + ico("cal") + 'שיבוץ</button>' +
              '<button type="button" class="gi-cta is-ghost" data-act="menu">עוד</button>' +
            '</div>' +
          '</div>' +
        '</article>';
      }

      /* "השבוע" / "הבא" / "6.10" — בכפתור אין מקום ל"שבוע 2 · 6–12 באוקטובר",
         והמנהל צריך לדעת רק אם זה קרוב מספיק כדי לענות לתושב. */
      function shortWeek(k) {
        if (k === todayKey()) return "השבוע";
        if (k === shiftKey(todayKey(), 1)) return "שבוע הבא";
        var d = parseKey(k);
        return d ? d.getDate() + "." + (d.getMonth() + 1) : k;
      }

      /* מיקום קבוצה בסדר שהוגדר בהגדרות. לא נמצא -> לסוף הרשימה. */
      function groupRank(name) {
        var list = order[sortBy] || [];
        var i = list.indexOf(name);
        return i === -1 ? 9999 : i;
      }

      function seg(k, label, n) {
        return '<button type="button" data-f="' + k + '"' +
          (filter === k ? ' class="on"' : '') + '>' + esc(label) + '<b>' + n + '</b></button>';
      }

      /* "לפני 3 ימים" · "אתמול" · "היום". תאריך מלא נשמר לגיליון וליומן —
         כאן חשוב *כמה זמן עבר*, לא היום בשבוע. */
      function ago(v) {
        var d = v ? new Date(v) : null;
        if (!d || isNaN(d.getTime())) return "";
        var days = Math.floor((Date.now() - d.getTime()) / 86400000);
        if (days <= 0) return "היום";
        if (days === 1) return "אתמול";
        if (days < 7) return "לפני " + days + " ימים";
        if (days < 14) return "לפני שבוע";
        if (days < 60) return "לפני " + Math.round(days / 7) + " שבועות";
        return "לפני " + Math.round(days / 30) + " חודשים";
      }

      function card(t) {
        var cat = catOf(t.category);
        var done = t.flag === "ממתין לאישור";
        /* כרטיס סגור. הוא **לא** מנוסח כמשימה שאפשר לפעול עליה: אין תיבת
           סימון, אין תפריט פעולות — רק מה נסגר, על ידי מי, ומתי, וכפתור
           שפותח את קו הזמן המלא. זה הארכיון, לא רשימת עבודה. */
        if (t.closure) {
          return '<article class="gd-rep gt-row gt-closed k-' + cat.key +
              '" data-id="' + esc(t.id) + '">' +
            '<span class="gt-cbox">' + ico("check") + '</span>' +
            '<div class="gt-body">' +
              '<div class="gt-t">' + esc(t.title || t.category || "משימה") + '</div>' +
              '<div class="gt-meta">' +
                '<span class="gt-cls">' + esc(t.closure) + '</span><i>·</i>' +
                (sortBy === "type" ? "" :
                  '<span class="gd-kchip">' + ico(cat.ico) + esc(t.category || "") + '</span>') +
                (t.area && sortBy !== "area"
                  ? (sortBy === "type" ? "" : '<i>·</i>') +
                    '<span class="gt-nb">' + ico("pin") + esc(t.area) + '</span>'
                  : '') +
                (t.approvedAt ? '<i>·</i>' + esc(ago(t.approvedAt)) : '') +
                (t.approvedBy ? '<i>·</i>' + esc(t.approvedBy) : '') +
              '</div>' +
              (t.note ? '<div class="gt-note">' + esc(t.note) + '</div>' : '') +
            '</div>' +
            '<button type="button" class="gt-more" data-act="hist" aria-label="היסטוריה">' +
              ico("hist") + '</button>' +
          '</article>';
        }
        var tags = "";
        if (t.flag && t.flag !== "ממתין לאישור") {
          tags += '<span class="gt-age' + (FLAG_HOT[t.flag] ? " is-hot" : "") + '">' +
            esc(t.flag === "נגררה" && (t.drags || 0) > 1 ? "נגררה " + t.drags + " פעמים" : t.flag) +
            '</span>';
        }
        var where = t.area || "";
        /* בתצוגת "לשיבוץ" תיבת הסימון מוחלפת בכפתור שיבוץ: אי אפשר לסמן
           כבוצעה משימה שעוד לא נכנסה לשום שבוע, והפעולה הנכונה שם היא אחת. */
        /* ⚠️ במצב "לטיפולך" הערך ההתחלתי של filter הוא "unplanned", אבל
           card() משמש שם **רק** לתור האישורים (הדיווחים החדשים מצוירים
           ב-inCard). בלי החרגת inbox כל כרטיס בתור האישורים היה מקבל כפתור
           שיבוץ במקום תיבת אישור — כלומר הפעולה הראשית של המסך פשוט לא
           הייתה שם. */
        var planning = !inbox && filter === "unplanned";
        /* בתצוגת "בוצעו" התיבה משנה משמעות לפי מי מסתכל: לצוות היא ביטול
           הסימון שלו, ולמנהל היא **האישור** — הפעולה שבאמת סוגרת. שאר
           ההחלטות של המנהל (החזרה, סגירה עם סיבה) יושבות בתפריט ה-⋯. */
        var approving = done && isManager;
        return '<article class="gd-rep gt-row k-' + cat.key +
            (done ? (approving ? " is-await" : " is-done") : "") +
            '" data-id="' + esc(t.id) + '">' +
          (planning
            ? '<button type="button" class="gt-plan" data-act="plan" aria-label="שיבוץ לשבוע">' +
                ico("cal") + '</button>'
            : '<button type="button" class="gt-box' + (approving ? " is-approve" : "") +
                '" data-act="' + (approving ? "approve" : (done ? "undo" : "done")) + '"' +
                ' aria-label="' + (approving ? "אישור" : (done ? "ביטול סימון" : "סימון כבוצע")) +
                '">' + ico("check") + '</button>') +
          '<div class="gt-body">' +
            /* הכותרת ראשונה ולבדה. מתחתיה שורת מטא אחת שבה כל שדה הוא
               סמליל + טקסט אפור, מופרדים בנקודה. הסדר קבוע ואינו תלוי
               בנתונים, כדי שהעין תמצא כל שדה באותו מקום בכל שורה:
                 מקור · קטגוריה · מיקום · מזהה · [דגל]
               המקור הוא היחיד שמשנה צורה: "תושב" נכתב במפורש ובולד (יש שם
               אדם שמחכה), שגרה מקבלת סמליל ↻ בלבד, ומשימה יזומה — כלום.
               אין מה לסמן במשימה שהמנהל פתח בעצמו והוא זה שמסתכל. */
            '<div class="gt-t">' + esc(t.title || t.category || "משימה") + '</div>' +
            '<div class="gt-meta">' +
              /* המזהה אינו על הכרטיס (2026-09-08, בקשת יועד). הוא מפתח
                 פנימי: מי שסורק רשימת משימות לא מחפש מספר, ומי שכן צריך
                 אותו — כדי לענות לתושב שמצטט מספר פנייה — פותח את התפריט
                 (⋯), שם הוא כתוב בשורה הראשונה יחד עם הקטגוריה והאזור. */
              (t.kind === GK_REPORT
                ? '<span class="gt-res">' + ico("person") + 'תושב</span><i>·</i>'
                : (t.kind === GK_ROUTINE ? ico("repeat") + '<i>·</i>' : '')) +
              /* שדה שכבר מופיע בכותרת הקבוצה אינו חוזר על הכרטיס. בסידור
                 לפי אזור, האזור נכתב פעם אחת מעל הקבוצה ואז שוב על כל אחת
                 מתשע המשימות שמתחתיו — וכשהשם ארוך ("שכונה מרכזית צפונית")
                 הוא גם שובר את שורת המטא לשתיים. אותו כלל לקטגוריה. */
              (sortBy === "type" ? "" :
                '<span class="gd-kchip">' + ico(cat.ico) + esc(t.category || "") + '</span>') +
              (where && sortBy !== "area"
                ? (sortBy === "type" ? "" : '<i>·</i>') +
                  '<span class="gt-nb">' + ico("pin") + esc(where) + '</span>'
                : '') +
              (tags ? '<i>·</i>' + tags : '') +
            '</div>' +
            (t.note ? '<div class="gt-note">' + esc(t.note) + '</div>' : '') +
            /* רמז הכפילות מופיע רק ב"לשיבוץ" — הרגע שבו המנהל פוגש דיווח
               חדש, ולפני ששיבץ עליו עבודה. הוא **הצעה**: הכפתור מאחד,
               והתעלמות ממנו משאירה את המשימה עצמאית. */
            (planning && t.dupOf
              ? '<div class="gt-dup">' + ico("merge") +
                'נראה כמו כפילות של <b>#' + esc(t.dupOf.id) + '</b> · ' +
                esc(t.dupOf.title || "") +
                '<button type="button" data-act="merge">איחוד</button></div>'
              : '') +
            /* שורת "ממתין לאישור" נשארת רק לצוות (2026-09-08). אצל המנהל
               היא הופיעה על כל כרטיס בתור האישורים — כלומר על מסך שכולו
               ממתין לאישורו — לצד תיבת אישור ירוקה שאומרת בדיוק את זה. */
            (done && !isManager
              ? '<div class="gt-wait">' + ico("clock") + 'ממתין לאישור הוועד</div>'
              : '') +
          '</div>' +
          '<button type="button" class="gt-more" data-act="menu" aria-label="עוד פעולות">' +
            ico("dots") + '</button>' +
        '</article>';
      }

      function wire() {
        Array.prototype.forEach.call(root.querySelectorAll("[data-wk]"), function (b) {
          b.addEventListener("click", function () {
            week = shiftKey(week, parseInt(b.dataset.wk, 10));
            draw(true); load();
          });
        });
        Array.prototype.forEach.call(root.querySelectorAll("[data-f]"), function (b) {
          b.addEventListener("click", function () { filter = b.dataset.f; draw(); });
        });
        var nb = root.querySelector("#gt-new");
        if (nb) nb.addEventListener("click", openNewTask);
        /* ⚠️ בדיקת קיום ולא גישה ישירה: במצב "לטיפולך" אין שורת בקרה כלל,
           ו-querySelector מחזיר null. בלי השמירה הזאת wire() נפל על
           addEventListener והמסך כולו לא היה מצויר — שגיאה שקרתה בזמן
           הציור ולכן לא הותירה אחריה כלום חוץ ממסך ריק. */
        var sortBtn = root.querySelector("#gt-sort");
        if (sortBtn) sortBtn.addEventListener("click", openSort);
        var legBtn = root.querySelector("#gt-legend");
        if (legBtn) legBtn.addEventListener("click", openLegend);
        /* הרצועה נגללת, ואחרי ציור מחדש היא חוזרת להתחלה — כך שהמסנן שנבחר
           זה עתה עלול לשבת מחוץ למסך והמשתמש רואה רשימה בלי לדעת מה סינן
           אותה. inline:"nearest" כדי לא להזיז אותה כשהוא כבר נראה. */
        var on = root.querySelector(".gt-ctl__f button.on");
        if (on && on.scrollIntoView) {
          try { on.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
        }
        root.addEventListener("click", onCardClick);
      }

      function onCardClick(e) {
        var btn = e.target.closest("[data-act]");
        if (!btn) return;
        /* "אשר את כל N" יושב בכותרת הקבוצה ולא בתוך כרטיס, ולכן הוא נבדק
           **לפני** איתור ה-.gt-row — אחרת החיפוש נכשל והלחיצה נבלעת בשקט. */
        if (btn.dataset.act === "batch") return approveBatch(btn.dataset.tpl);
        if (btn.dataset.act === "merge") {
          var mArt = btn.closest(".gt-row");
          if (mArt) askMerge(mArt.dataset.id);
          return;
        }
        var art = btn.closest(".gt-row");
        if (!art) return;
        var id = art.dataset.id;
        var act = btn.dataset.act;
        if (act === "cover") return coverByPlan(id);
        if (act === "hist") return openHistory(id);
        if (act === "menu") return openMenu(id);
        if (act === "plan") return askWeek(id);
        if (act === "approve") return run("approve", id, {});
        if (act === "done" || act === "undo") return run(act, id, {});
      }

      function byId(id) {
        var all = rows.concat(unplanned);
        for (var i = 0; i < all.length; i++) if (String(all[i].id) === String(id)) return all[i];
        return null;
      }

      /* פעולה אחת מול השרת. ננעל בזמן הפעולה כדי ששתי הקשות מהירות על אותה
         משימה לא ישלחו שתי בקשות סותרות (done ואז undo על מצב שטרם התרענן). */
      function run(op, id, extra) {
        if (busy) return;
        busy = true;
        CBA.data.gardenTask(op, id, extra || {}, function (res) {
          busy = false;
          if (!res || !res.ok) {
            CBA.ui.alert((res && res.error) || "הפעולה לא הצליחה");
            return;
          }
          if (op === "done") CBA.ui.toast("סומן כבוצע · ממתין לאישור");
          if (op === "undo") CBA.ui.toast("הסימון בוטל");
          if (op === "defer") CBA.ui.toast("נדחה לשבוע הבא");
          if (op === "note") CBA.ui.toast("ההערה נשמרה");
          if (op === "block") CBA.ui.toast("נשלח למנהל הגינון");
          if (op === "approve") CBA.ui.toast("אושר · נשלח עדכון למדווח");
          if (op === "close") CBA.ui.toast("נסגר · " + extra.closure);
          if (op === "return") CBA.ui.toast("הוחזר לצוות להשלמה");
          if (op === "plan") {
            CBA.ui.toast("שובץ · " + weekLabel(extra.week));
            // אחרי שיבוץ המשימה עוברת מרשימה לרשימה, אז חוזרים ל"לביצוע"
            filter = "open";
          }
          load();
        });
      }

      /* בחירת שבוע לשיבוץ. שלוש אפשרויות ולא לוח שנה: מנהל הגינון משבץ
         לשבוע הנוכחי או לאחד הבאים, ובחירה מתוך שלוש היא הקשה אחת במקום
         דיאלוג תאריכים. שיבוץ רחוק יותר נעשה מהשבוע ההוא. */
      function askWeek(id) {
        var t = byId(id);
        if (!t) return;
        var opts = [
          { k: shiftKey(todayKey(), 0), label: "השבוע" },
          { k: shiftKey(todayKey(), 1), label: "שבוע הבא" },
          { k: shiftKey(todayKey(), 2), label: "בעוד שבועיים" }
        ];
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet" role="dialog" aria-label="שיבוץ לשבוע">' +
            '<div class="gt-grip" aria-hidden="true"></div>' +
            '<h4>שיבוץ לשבוע</h4>' +
            '<p class="sub">' + esc(t.title || t.category || "משימה") + '</p>' +
            opts.map(function (o) {
              return '<button type="button" class="gt-opt" data-wk="' + o.k + '"><u>' +
                ico("cal") + '</u><div>' + esc(o.label) +
                '<span>' + esc(weekLabel(o.k)) + '</span></div></button>';
            }).join("") +
          '</div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });
        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);
        wrap.addEventListener("click", function (e) {
          var b = e.target.closest("[data-wk]");
          if (!b) return;
          close();
          run("plan", id, { week: b.dataset.wk });
        });
      }

      /* גיליון בסיסי — שני הגיליונות הקטנים למטה (סידור, מקרא) חלקו את אותן
         עשר שורות של יצירה-הנפשה-סגירה, וכל שכפול כזה הוא מקום שבו אחד
         מהם יפסיק להיסגר על לחיצה ברקע ואיש לא ישים לב. */
      function sheet(label, html, onPick) {
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet" role="dialog" aria-label="' + esc(label) + '">' +
            '<div class="gt-grip" aria-hidden="true"></div>' + html +
          '</div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });
        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);
        if (onPick) wrap.addEventListener("click", function (e) { onPick(e, close); });
        return close;
      }

      /* הסידור. עבר מרצועה קבועה בראש המסך לגיליון, כי הוא נבחר פעם ונשאר —
         ורצועה שיושבת שם תמיד עלתה 34px בכל מסך, כל הזמן. */
      function openSort() {
        sheet("סידור הרשימה",
          '<h4>סידור הרשימה</h4>' +
          '<p class="sub">לפי מה לסדר את המשימות שמוצגות עכשיו.</p>' +
          SORTS.map(function (o) {
            return '<button type="button" class="gt-opt" data-sort="' + o.k + '"><u>' +
              ico(o.k === "area" ? "pin" : (o.k === "date" ? "cal" : (o.k === "urgent" ? "clock" : "leaf"))) +
              '</u><div>' + esc(o.label) +
              '<span>' + esc(o.group ? "מקבץ בכותרות" : "רשימה אחת") + '</span></div>' +
              (sortBy === o.k ? '<span style="margin-inline-start:auto;color:#0F6B45">' +
                 ico("check") + '</span>' : '') + '</button>';
          }).join(""),
          function (e, close) {
            var b = e.target.closest("[data-sort]");
            if (!b) return;
            sortBy = b.dataset.sort;
            close(); draw();
          });
      }

      /* המקרא. הוא הכתובת היחידה שבה מסבירים סמלילים — ברגע שהמסך עצמו צריך
         תווית טקסט ליד כל סמליל הוא חוזר להיות עמוס, וזו בדיוק הבעיה שממנה
         באנו. שים לב שהוא מתאר את מה שבאמת על המסך: אם יתווסף סימון חדש
         לכרטיס, מקומו כאן. */
      function openLegend() {
        var cats = [
          ["lawn", "מדשאות"], ["water", "השקיה / ממטרות"], ["tree", "עצים"],
          ["prune", "שיחים / גיזום"], ["weed", "עשבייה / קרקע"],
          ["clean", "ניקיון / גזם"], ["bed", "ערוגות / שתילה"]
        ];
        sheet("מקרא",
          '<h4>מקרא</h4>' +
          '<div class="gt-lg">מאיפה המשימה הגיעה</div>' +
          '<div class="gt-lgi"><u>' + ico("person") + '</u><div><b>תושב</b>' +
            '<span>מישהו דיווח על זה מהאפליקציה. יש לו מספר פנייה, והוא מקבל עדכון בסיום.</span></div></div>' +
          '<div class="gt-lgi"><u>' + ico("repeat") + '</u><div><b>חוזרת</b>' +
            '<span>מגיעה מתוכנית העבודה וחוזרת לפי התדירות שהוגדרה לה.</span></div></div>' +
          '<div class="gt-lgi"><u style="color:#C4CBC8">—</u><div><b>בלי סימון</b>' +
            '<span>משימה שנפתחה כאן ידנית, פעם אחת.</span></div></div>' +

          '<div class="gt-lg">הפס בשפת הכרטיס</div>' +
          '<div class="gt-lgi"><u><span class="gt-lgs" style="background:var(--c-lawn)"></span></u>' +
            '<div><b>קטגוריה</b><span>מאפשר לסרוק את הרשימה לפי סוג עבודה בלי לקרוא.</span>' +
            '<div class="gt-lgc">' + cats.map(function (c) {
              return '<div><i style="background:var(--c-' + c[0] + ')"></i>' + esc(c[1]) + '</div>';
            }).join("") + '</div></div></div>' +

          '<div class="gt-lg">תג צבעוני</div>' +
          '<div class="gt-lgi"><u style="width:auto"><span class="gt-age">נגררה</span></u>' +
            '<div><b>משהו חורג</b><span>זה הדבר הצבעוני היחיד בכרטיס. אין תג — הכול כרגיל.</span></div></div>' +
          '<div class="gt-lgi"><u style="width:auto"><span class="gt-age is-hot">דורש בדיקה חוזרת</span></u>' +
            '<div><b>דורש תשומת לב</b><span>תושב אמר שהטיפול לא הושלם, או שהעבודה נחסמה בשטח.</span></div></div>' +

          '<div class="gt-lg">תיבת הסימון</div>' +
          '<div class="gt-lgi"><u><span class="gt-box" style="width:22px;height:22px;margin:0"></span></u>' +
            '<div><b>ריקה</b><span>' +
            esc(isManager ? "סימון ביצוע. לא סוגר את המשימה — מרים אותה לאישורך."
                          : "לחיצה מסמנת שביצעת. המשימה עוברת לאישור הוועד ולא נסגרת מיד.") +
            '</span></div></div>' +
          (isManager
            ? '<div class="gt-lgi"><u><span class="gt-box is-approve" style="width:22px;height:22px;margin:0">' +
              ico("check") + '</span></u><div><b>ירוקה</b>' +
              '<span>אישור. הלחיצה סוגרת את המשימה, ואם היא הגיעה מתושב — נשלח אליו עדכון.</span></div></div>'
            : '') +
          /* כפתור סגירה מפורש. שאר הגיליונות נסגרים בלחיצה על הרקע, אבל
             המקרא גבוה ~700px ובטלפון הוא כמעט ממלא את המסך — הרקע שנשאר
             הוא רצועה דקה שקשה לפגוע בה. */
          '<button type="button" class="gd-cta" data-close="1" ' +
            'style="margin-top:16px">סגירה</button>',
          function (e, close) { if (e.target.closest("[data-close]")) close(); });
      }

      /* "כבר בתוכנית". מאשרים לפני, כי התוצאה נראית לתושב: הפנייה שלו
         נסגרת כ"אוחד" והוא יקבל עדכון כשמשימת השגרה תיסגר — לא מיד. */
      function coverByPlan(id) {
        var t = byId(id);
        if (!t || !t.coveredBy || busy) return;
        CBA.ui.confirm(
          'הפנייה תיסגר ותקושר ל"' + (t.coveredBy.title || "משימת השגרה") + '" ' +
          shortWeek(t.coveredBy.week) + '. התושב יקבל עדכון כשהיא תבוצע.',
          { title: "כבר בתוכנית", okText: "אישור" }
        ).then(function (yes) {
          if (!yes || busy) return;
          busy = true;
          CBA.data.gardenCoverByPlan(id, t.coveredBy.defId, t.coveredBy.week, function (res) {
            busy = false;
            if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "הפעולה לא הצליחה");
            CBA.ui.toast("קושר לתוכנית העבודה");
            load();
          });
        });
      }

      /* קו הזמן של משימה. הנתונים כבר נכתבו מהיום הראשון בטאב היומן —
         עד 8.9 פשוט אף מסך לא קרא אותם. זו התשובה ל"מי סגר את זה ומתי",
         והיא נשאלת דווקא כשמשהו השתבש. */
      var LOG_ICON = {
        "נפתח": "plus", "שיבוץ": "cal", "ביצוע": "check", "ביטול ביצוע": "undo",
        "סגירה": "check", "החזרה": "undo", "גרירה": "cal", "חסימה": "clock",
        "הערה": "note", "איחוד": "merge", "משוב": "person"
      };
      function openHistory(id) {
        var t = byId(id);
        var close = sheet("היסטוריה",
          '<h4>היסטוריה</h4>' +
          '<p class="sub">' + esc(t ? (t.title || t.category || "משימה") : "משימה") +
            ' · #' + esc(id) + '</p>' +
          '<div id="gt-hist"><div class="skeleton" style="height:54px;border-radius:12px"></div>' +
            '<div class="skeleton" style="height:54px;border-radius:12px;margin-top:8px"></div></div>' +
          /* כפתור סגירה מפורש, בדיוק כמו במקרא: משימה ותיקה צוברת רשומות,
             הגיליון גדל עד גובה המסך, והרקע שנשאר ללחיצה הוא רצועה דקה.
             כלל: גיליון שגובהו משתנה עם הנתונים חייב כפתור. */
          '<button type="button" class="gd-cta" data-close="1" ' +
            'style="margin-top:14px">סגירה</button>',
          function (e, close) { if (e.target.closest("[data-close]")) close(); });
        CBA.data.getGardenTaskLog(id, function (res) {
          var el = document.getElementById("gt-hist");
          if (!el) return;                      // הגיליון נסגר בזמן הטעינה
          if (!res || !res.ok) {
            el.innerHTML = '<p class="gt-hist__none">' +
              esc((res && res.error) || "לא הצלחתי לטעון את ההיסטוריה") + '</p>';
            return;
          }
          var rows = res.rows || [];
          if (!rows.length) {
            el.innerHTML = '<p class="gt-hist__none">אין עדיין רשומות למשימה הזאת.</p>';
            return;
          }
          el.innerHTML = rows.map(function (r) {
            /* השינוי עצמו מוצג רק כשיש **שני** ערכים אמיתיים. "מ- ל-בוצע"
               בלי מקור קורא כמו שגיאה, וזה המצב הרגיל ברשומה ראשונה. */
            var change = (r.from && r.to) ? esc(r.from) + " ← " + esc(r.to)
                       : (r.to ? esc(r.to) : "");
            return '<div class="gt-hist"><u>' + ico(LOG_ICON[r.kind] || "note") + '</u>' +
              '<div><b>' + esc(r.kind || "שינוי") + '</b>' +
              (change ? '<span>' + change + '</span>' : '') +
              (r.note ? '<span>' + esc(r.note) + '</span>' : '') +
              '<em>' + esc(ago(r.at)) + (r.who ? " · " + esc(r.who) : "") + '</em></div></div>';
          }).join("");
        });
        return close;
      }

      /* אישור מרוכז. המפתח כולל תבנית+שבוע, ולכן אי אפשר לצרף לקבוצה משימה
         משבוע אחר גם אם המסך יצייר אותה בטעות. השרת מאמת שוב. */
      function approveBatch(key) {
        var items = visible().filter(function (t) {
          return t.kind === "שגרה" && t.templateId &&
                 ("b:" + t.templateId + "|" + t.week) === key;
        });
        if (items.length < 2) return;
        CBA.ui.confirm(items.length + " משימות שגרה מאותה תבנית ואותו שבוע ייסגרו כבוצעו.", {
          title: "אישור מרוכז", okText: "אשר את כולן"
        }).then(function (yes) {
          if (!yes || busy) return;
          busy = true;
          CBA.data.gardenApproveBatch(items.map(function (t) { return t.id; }), function (res) {
            busy = false;
            if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "האישור לא הצליח");
            CBA.ui.toast(res.count + " משימות אושרו");
            load();
          });
        });
      }

      /* איחוד. הניסוח מדגיש מה קורה לתושב, כי זו התוצאה שקשה לבטל: הוא
         יקבל בהמשך הודעת סיום על פנייה שאינה שלו, והמייל שנשלח עכשיו הוא
         מה שיאפשר לו להבין אותה. */
      function askMerge(id) {
        var t = byId(id);
        if (!t || !t.dupOf) return;
        CBA.ui.confirm(
          "משימה #" + id + " תיסגר, והדיווח שלה יצורף לפנייה #" + t.dupOf.id + ".\n\n" +
          "המדווח יקבל מייל שמסביר את האיחוד, ובהמשך גם את הודעת הסיום.", {
            title: "איחוד עם פנייה #" + t.dupOf.id, okText: "אחד"
          }).then(function (yes) {
            if (!yes || busy) return;
            busy = true;
            CBA.data.gardenMerge(id, t.dupOf.id, function (res) {
              busy = false;
              if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "האיחוד לא הצליח");
              CBA.ui.toast("אוחד עם #" + t.dupOf.id);
              load();
            });
          });
      }

      /* טופס פתיחת משימה. גיליון תחתון ולא מסך נפרד: הוא נפתח מעל הרשימה,
         נסגר אליה, והמנהל רואה מיד את המשימה נכנסת. הקטגוריות והאזורים מגיעים
         מאותה תשובת שרת שבנתה את הרשימה — מקור אמת אחד, בלי קריאה נוספת. */
      function openNewTask() {
        var cats = order.type.length ? order.type : [];
        var areas = order.area.length ? order.area : [];
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet" role="dialog" aria-label="משימה חדשה">' +
            '<div class="gt-grip" aria-hidden="true"></div>' +
            '<h4>משימה חדשה</h4>' +
            '<p class="sub">משימה שאתה פותח בעצמך — לא דיווח של תושב ולא משימה חוזרת ' +
              'מתוכנית העבודה.</p>' +
            '<label class="gd-lbl">מה צריך לעשות <s>*</s></label>' +
            '<input class="gd-inp" id="nt-title" maxlength="120" autocomplete="off" ' +
              'placeholder="למשל: לגזום את העץ שחוסם את התמרור">' +
            '<div class="gd-row2" style="margin-top:10px">' +
              '<div><label class="gd-lbl">קטגוריה <s>*</s></label>' +
                '<select class="gd-inp" id="nt-cat">' +
                  cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join("") +
                '</select></div>' +
              '<div><label class="gd-lbl">אזור</label>' +
                '<select class="gd-inp" id="nt-area"><option value="">ללא</option>' +
                  areas.map(function (a) { return '<option>' + esc(a) + '</option>'; }).join("") +
                '</select></div>' +
            '</div>' +
            '<label class="gd-lbl" style="margin-top:10px">מתי</label>' +
            '<select class="gd-inp" id="nt-week">' +
              '<option value="' + shiftKey(todayKey(), 0) + '">השבוע · ' + esc(weekLabel(shiftKey(todayKey(), 0))) + '</option>' +
              '<option value="' + shiftKey(todayKey(), 1) + '">שבוע הבא</option>' +
              '<option value="">בלי שבוע — לרשימת השיבוץ</option>' +
            '</select>' +
            '<button type="button" class="gd-cta" id="nt-go" style="margin-top:14px">' +
              ico("plus") + 'פתיחת המשימה</button>' +
          '</div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });
        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);
        var titleEl = wrap.querySelector("#nt-title");
        setTimeout(function () { titleEl.focus(); }, 120);
        wrap.querySelector("#nt-go").addEventListener("click", function () {
          var title = titleEl.value.trim();
          if (!title) { titleEl.focus(); return CBA.ui.alert("צריך לכתוב מה צריך לעשות"); }
          if (busy) return;
          busy = true;
          var wk = wrap.querySelector("#nt-week").value;
          CBA.data.gardenCreateTask({
            title: title,
            category: wrap.querySelector("#nt-cat").value,
            area: wrap.querySelector("#nt-area").value,
            week: wk
          }, function (res) {
            busy = false;
            if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "המשימה לא נפתחה");
            close();
            CBA.ui.toast("נפתחה משימה #" + res.id);
            // קופצים לרשימה שבה היא באמת נחתה, אחרת היא "נעלמת" מול העיניים
            filter = wk ? "open" : "unplanned";
            if (wk) week = wk;
            load();
          });
        });
      }

      function openMenu(id) {
        var t = byId(id);
        if (!t) return;
        var cat = catOf(t.category);
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet" role="dialog" aria-label="' + esc(t.title || "משימה") + '">' +
            '<div class="gt-grip" aria-hidden="true"></div>' +
            '<h4>' + esc(t.title || t.category || "משימה") + '</h4>' +
            '<p class="sub">#' + esc(t.id) + ' · ' + esc(t.category || "") +
              (t.area ? ' · ' + esc(t.area) : '') + '</p>' +
            (t.x !== null && t.y !== null
              ? '<button type="button" class="gt-opt" data-m="map"><u>' + ico("pin") + '</u>' +
                '<div>הצגה על המפה<span>הנקודה שסומנה בדיווח</span></div></button>' : '') +
            '<button type="button" class="gt-opt" data-m="hist"><u>' + ico("hist") + '</u>' +
              '<div>היסטוריה<span>כל מה שקרה למשימה, לפי הסדר</span></div></button>' +
            '<button type="button" class="gt-opt" data-m="note"><u>' + ico("note") + '</u>' +
              '<div>הערת ביצוע<span>מה נעשה בפועל — נשמר ביומן</span></div></button>' +
            '<button type="button" class="gt-opt" data-m="defer"><u>' + ico("cal") + '</u>' +
              '<div>דחייה לשבוע הבא<span>תסומן "נגררה" ותעלה בראש הרשימה</span></div></button>' +
            (isManager
              ? ''
              : '<button type="button" class="gt-opt" data-m="block"><u>' + ico("clock") + '</u>' +
                '<div>לא ניתן לביצוע<span>עובר למנהל הגינון עם הסיבה</span></div></button>') +
            /* פעולות המנהל. "החזרה להשלמה" מוצעת רק כשיש מה להחזיר — כלומר
               כשהצוות כבר סימן ביצוע וזה ממתין לאישור. */
            (isManager && t.flag === "ממתין לאישור"
              ? '<button type="button" class="gt-opt" data-m="return"><u>' + ico("undo") + '</u>' +
                '<div>החזרה להשלמה<span>חוזרת לצוות עם מה שחסר</span></div></button>'
              : '') +
            (isManager
              ? '<button type="button" class="gt-opt" data-m="close"><u>' + ico("check") + '</u>' +
                '<div>סגירה עם סיבה<span>הועבר לבינוי · בוטל · לא רלוונטי</span></div></button>'
              : '') +
          '</div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });

        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);
        wrap.addEventListener("click", function (e) {
          var b = e.target.closest("[data-m]");
          if (!b) return;
          var m = b.dataset.m;
          close();
          if (m === "hist") return openHistory(id);
          if (m === "map") return showOnMap(t, cat);
          if (m === "note") {
            // CBA.ui.prompt מחזירה Promise (null בביטול), לא מקבלת callback
            CBA.ui.prompt("ההערה נשמרת ביומן המשימה ונשארת גלויה למנהל.", {
              title: "הערת ביצוע", value: t.note || "",
              placeholder: "למשל: נגזם, הגזם פונה למחרת", okText: "שמירה"
            }).then(function (txt) { if (txt !== null) run("note", t.id, { note: txt }); });
          }
          if (m === "defer") {
            CBA.ui.confirm("המשימה תעבור לשבוע הבא ותסומן \"נגררה\".").then(function (yes) {
              if (yes) run("defer", t.id, {});
            });
          }
          if (m === "return") {
            CBA.ui.prompt("המשימה תחזור לצוות עם הדגל \"הוחזר להשלמה\".", {
              title: "מה חסר?",
              placeholder: "למשל: הגיזום נעשה אבל הגזם לא פונה",
              okText: "החזרה לצוות"
            }).then(function (txt) { if (txt) run("return", t.id, { note: txt }); });
          }
          if (m === "close") return askClosure(t);
          if (m === "block") {
            CBA.ui.prompt("המשימה לא תיסגר — היא חוזרת לשולחן מנהל הגינון עם הסיבה.", {
              title: "מה מונע את הביצוע?",
              placeholder: "למשל: דורש מנוף, הגישה חסומה ברכב",
              okText: "שליחה למנהל"
            }).then(function (txt) { if (txt) run("block", t.id, { note: txt }); });
          }
        });
      }

      /* סגירה שאינה "בוצע". שלוש הסיבות מהאפיון; "בוצע" לא מופיע כאן כי הוא
         כפתור האישור עצמו, והוא היחיד ששולח מייל לתושב. */
      function askClosure(t) {
        var reasons = [
          { k: "הועבר לבינוי", sub: "לא בתחום הגינון" },
          { k: "בוטל",         sub: "הוחלט לא לבצע" },
          { k: "לא רלוונטי",   sub: "הבעיה כבר לא קיימת" }
        ];
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet" role="dialog" aria-label="סגירה עם סיבה">' +
            '<div class="gt-grip" aria-hidden="true"></div>' +
            '<h4>סגירה עם סיבה</h4>' +
            '<p class="sub">' + esc(t.title || t.category || "משימה") +
              '<br>המדווח לא יקבל מייל "הושלם" — הסיבה תופיע לו במסך.</p>' +
            reasons.map(function (o) {
              return '<button type="button" class="gt-opt" data-cl="' + esc(o.k) + '"><u>' +
                ico("check") + '</u><div>' + esc(o.k) +
                '<span>' + esc(o.sub) + '</span></div></button>';
            }).join("") +
          '</div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });
        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);
        wrap.addEventListener("click", function (e) {
          var b = e.target.closest("[data-cl]");
          if (!b) return;
          close();
          run("close", t.id, { closure: b.dataset.cl });
        });
      }

      /* המפה היא הרכיב המשותף (CBA.map) — כאן במצב תצוגה בלבד: סימון בודד,
         בלי חיפוש ובלי אפשרות להזיז את הנעיצה. הקואורדינטות מנורמלות 0–1. */
      function showOnMap(t, cat) {
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap is-map";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet"><div class="gt-grip" aria-hidden="true"></div>' +
            '<h4>' + esc(t.title || "משימה") + '</h4>' +
            '<p class="sub">' + esc(t.area || "") + '</p>' +
            '<div class="gd-map" id="gt-map"></div></div>';
        document.body.appendChild(wrap);
        requestAnimationFrame(function () { wrap.classList.add("is-open"); });
        function close() {
          wrap.classList.remove("is-open");
          setTimeout(function () { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }, 240);
        }
        wrap.querySelector(".gt-sheet-bd").addEventListener("click", close);
        if (CBA.map) {
          var api = CBA.map.render(wrap.querySelector("#gt-map"), {
            head: false, search: false, legend: false, hint: false, popup: false,
            pinAt: { x: t.x, y: t.y }
          });
          if (api && api.fit) setTimeout(function () { api.fit(); }, 60);
        }
      }
    }
  };
})();
