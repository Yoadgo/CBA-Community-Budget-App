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
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    prev:  '<path d="M15 18l-6-6 6-6"/>',
    next:  '<path d="M9 18l6-6-6-6"/>',
    dots:  '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    undo:  '<path d="M3 8h11a5 5 0 0 1 0 10H8"/><path d="m6.5 4.5-3 3.5 3 3.5"/>',
    pin:   '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    cal:   '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    note:  '<path d="M4 5h16v11l-4 4H4z"/><path d="M20 16h-4v4"/><path d="M8 9h8M8 13h5"/>',
    merge: '<path d="M7 4v5a4 4 0 0 0 4 4h6"/><path d="M7 20v-5a4 4 0 0 1 4-4h6"/><path d="m14 9 3 2.5-3 2.5"/>'
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

  CBA.screens.gardenTasks = {
    render: function (container) {
      var week = todayKey();
      var filter = "open";     // open | done | dragged
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

      container.innerHTML = '<div class="gd-screen" id="gt-root"></div>';
      var root = container.querySelector("#gt-root");
      draw(true);
      load();

      function load() {
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
          if (isManager) loadUnplanned();
        });
      }

      function loadUnplanned() {
        CBA.data.getGardenTasks({ scope: "unplanned" }, function (res) {
          unplanned = (res && res.ok) ? (res.rows || []) : [];
          draw();
        });
      }

      function counts() {
        var c = { open: 0, done: 0, dragged: 0 };
        rows.forEach(function (t) {
          if (t.flag === "ממתין לאישור") c.done++;
          else c.open++;
          if (t.flag === "נגררה" || (t.drags || 0) > 0) c.dragged++;
        });
        return c;
      }
      function visible() {
        if (filter === "unplanned") return unplanned.slice();
        return rows.filter(function (t) {
          if (filter === "done") return t.flag === "ממתין לאישור";
          if (filter === "dragged") return t.flag === "נגררה" || (t.drags || 0) > 0;
          return t.flag !== "ממתין לאישור";
        });
      }

      function draw(skeleton) {
        var c = counts();
        var total = rows.length;
        var pct = total ? Math.round((c.done / total) * 100) : 0;
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
          /* תור האישורים מקובץ אחרת מכל שאר המסך, ובכוונה: כאן הקיבוץ **הוא
             הכלל** ולא העדפת תצוגה. משימות שגרה מאותה תבנית ואותו שבוע הן
             היחידות שמותר לאשר יחד (החלטה 3), אז הן מקובצות יחד ומקבלות
             כפתור "אשר את כל N". כל השאר — תקלות מדיווח ומשימות יזומות —
             נופלות לקבוצת "לאישור פרטני", ושם כל אחת מאושרת לחוד.
             לכן שורת הסידור לא משפיעה על התצוגה הזאת. */
          var batches = [], seenB = {};
          list.forEach(function (t) {
            var k = (t.kind === "שגרה" && t.templateId)
              ? "b:" + t.templateId + "|" + t.week : "solo";
            if (!seenB[k]) { seenB[k] = []; batches.push(k); }
            seenB[k].push(t);
          });
          body = batches.map(function (k) {
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
        } else if (s.group) {
          var groups = [], seen = {};
          list.forEach(function (t) {
            var g = s.group(t);
            if (!seen[g]) { seen[g] = []; groups.push(g); }
            seen[g].push(t);
          });
          body = groups.map(function (g) {
            var n = seen[g].length;
            return '<div class="gt-grp">' + esc(g) +
              ' <em>· ' + (n === 1 ? "משימה אחת" : n + " משימות") + '</em><hr></div>' +
              '<div class="gd-reps">' + seen[g].map(card).join("") + '</div>';
          }).join("");
        } else {
          body = '<div class="gd-reps" style="margin-top:10px">' + list.map(card).join("") + '</div>';
        }

        root.innerHTML =
          '<div class="gd-head"><span class="gd-head__em">' + ico("leaf") + '</span>' +
            '<div class="gd-head__t"><h3>משימות השבוע</h3><p>' +
            esc(isManager ? "מנהל גינון · מראה שיכון" : "אחראי גינון · מראה שיכון") +
            '</p></div></div>' +
          '<div class="gt-week">' +
            '<button type="button" data-wk="-1" aria-label="שבוע קודם">' + ico("prev") + '</button>' +
            '<div class="gt-week__c"><b>' + esc(weekLabel(week)) + '</b>' +
              '<span>' + (total ? c.done + " מתוך " + total + " בוצעו" : "אין משימות") + '</span>' +
              '<div class="gt-bar"><i style="width:' + pct + '%"></i></div></div>' +
            '<button type="button" data-wk="1" aria-label="שבוע הבא">' + ico("next") + '</button>' +
          '</div>' +
          '<div class="gd-seg">' +
            seg("open", "לביצוע", c.open) + seg("done", "בוצעו", c.done) +
            seg("dragged", "נגררו", c.dragged) +
            (isManager ? seg("unplanned", "לשיבוץ", unplanned.length) : "") +
          '</div>' +
          '<div class="gt-sort"><b>סידור לפי</b>' +
            SORTS.map(function (o) {
              return '<button type="button" data-sort="' + o.k + '"' +
                (sortBy === o.k ? ' class="on"' : '') + '>' + esc(o.label) + '</button>';
            }).join("") +
          '</div>' + body;

        wire();
      }

      /* מיקום קבוצה בסדר שהוגדר בהגדרות. לא נמצא -> לסוף הרשימה. */
      function groupRank(name) {
        var list = order[sortBy] || [];
        var i = list.indexOf(name);
        return i === -1 ? 9999 : i;
      }

      function seg(k, label, n) {
        return '<button type="button" data-f="' + k + '"' +
          (filter === k ? ' class="on"' : '') + '>' + esc(label) + ' · ' + n + '</button>';
      }

      function card(t) {
        var cat = catOf(t.category);
        var done = t.flag === "ממתין לאישור";
        var tags = "";
        if (t.flag && t.flag !== "ממתין לאישור") {
          tags += '<span class="gt-age' + (FLAG_HOT[t.flag] ? " is-hot" : "") + '">' +
            esc(t.flag === "נגררה" && (t.drags || 0) > 1 ? "נגררה " + t.drags + " פעמים" : t.flag) +
            '</span>';
        }
        /* מקור המשימה מוצג כפי שהוא רשום בעמודה "סוג" בגיליון (שגרה / דיווח
           תושב / יזום — ר' GARDEN_KINDS ב-Code.gs), ולא נגזר בניחוש: תצוגה
           שמנחשת הייתה מתייגת כל מה שאינו שגרה כ"דיווח תושב", כולל משימות
           שהמנהל פתח בעצמו. משימת שגרה מקבלת גם רמז שהיא חוזית. */
        var src = t.kind || "משימה";
        var contract = t.kind === "שגרה";
        var where = t.area || "";
        /* בתצוגת "לשיבוץ" תיבת הסימון מוחלפת בכפתור שיבוץ: אי אפשר לסמן
           כבוצעה משימה שעוד לא נכנסה לשום שבוע, והפעולה הנכונה שם היא אחת. */
        var planning = filter === "unplanned";
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
            '<div class="gt-top"><span class="gd-rep__id">#' + esc(t.id) + '</span>' +
              '<span class="gd-kchip">' + ico(cat.ico) + esc(t.category || "") + '</span>' +
              tags + '<span class="gt-src' + (contract ? " is-contract" : "") + '">' +
                esc(src) + '</span></div>' +
            /* הכותרת והמיקום על שורה אחת (2026-09-07): המיקום הוא הקשר לכותרת
               ולא נתון עצמאי, ושורה שלישית לכל כרטיס עלתה ~18px × מספר
               המשימות — מה שהוריד כמעט שתי משימות מכל מסך. */
            '<div class="gt-t">' + esc(t.title || t.category || "משימה") +
              (where ? '<em>' + ico("pin") + esc(where) + '</em>' : '') + '</div>' +
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
            (done
              ? '<div class="gt-wait">' + ico("clock") +
                (isManager ? 'ממתין לאישורך' : 'ממתין לאישור הוועד') + '</div>'
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
        Array.prototype.forEach.call(root.querySelectorAll("[data-sort]"), function (b) {
          b.addEventListener("click", function () { sortBy = b.dataset.sort; draw(); });
        });
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
