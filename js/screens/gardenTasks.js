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
    dots:  '<circle cx="5" cy="12" r="2.1"/><circle cx="12" cy="12" r="2.1"/><circle cx="19" cy="12" r="2.1"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/>' +
           '<path d="M6.5 7l1 12.5h9L17.5 7"/><path d="M10 11v5M14 11v5"/>',
    undo:  '<path d="M3 8h11a5 5 0 0 1 0 10H8"/><path d="m6.5 4.5-3 3.5 3 3.5"/>',
    pin:   '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    cal:   '<rect x="3" y="5" width="18" height="16" rx="2.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    note:  '<path d="M4 5h16v11l-4 4H4z"/><path d="M20 16h-4v4"/><path d="M8 9h8M8 13h5"/>',
    merge: '<path d="M7 4v5a4 4 0 0 0 4 4h6"/><path d="M7 20v-5a4 4 0 0 1 4-4h6"/><path d="m14 9 3 2.5-3 2.5"/>',
    /* שלושת אלה נוספו ב-8.9 עם הכרטיס השקט: person מסמן דיווח תושב (החריג
       היחיד שנשאר מסומן במפורש), repeat מסמן משימה חוזרת מתוכנית העבודה,
       ו-filter/help הם שני הלחצנים בשורת הבקרה. */
    person: '<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
    /* תקלה שהצוות פתח — שתי דמויות מול דמות אחת של `person`. ההבדל
       נקרא גם בגודל 13px, וזה כל מה שסמליל בשורת מטא צריך לעשות. */
    team:   '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/>' +
            '<path d="M16.5 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M18 14.4A6 6 0 0 1 21 20"/>',
    // מצלמה — תמונות שצירף התושב לדיווח (PHASE 4.2)
    camera: '<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><circle cx="12" cy="13" r="3.2"/><path d="M8.5 6.5 9.6 4.5h4.8l1.1 2"/>',
    repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9a3 3 0 0 1 3-3h14"/>' +
            '<path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v2a3 3 0 0 1-3 3h-14"/>',
    filter: '<path d="M3 5h18M6.5 12h11M10 19h4"/>',
    cloud:  '<path d="M6.5 19a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.2-1.6A4.2 4.2 0 0 1 21 12.6"/>' +
            '<path d="m15 15 6 6M21 15l-6 6"/>',
    hist:   '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4h4"/>' +
            '<path d="M12 7.5V12l3 1.8"/>',
    help:   '<circle cx="12" cy="12" r="9"/>' +
            '<path d="M9.6 9.2a2.5 2.5 0 1 1 3.2 2.4c-.6.2-.8.7-.8 1.3v.4"/><path d="M12 17h.01"/>',
    x:      '<path d="M6 6l12 12M18 6 6 18"/>',
    expand: '<path d="M9 3H4v5M15 21h5v-5M20 4l-6.5 6.5M4 20l6.5-6.5"/>'
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
  /* המילון המשותף (js/data/gardenLang.js). נטען לפני המסך הזה ב-index.html.
     הנפילה-לאחור קיימת כדי שקובץ חסר יוריד את איכות הניסוח ולא יפיל
     את המסך — אותו כלל כמו בכל תלות אחרת במודול. */
  var GL = (window.CBA && CBA.gardenLang) || {
    T: { report: "דיווח", routine: "שגרה", manager: "מנהל הגינון" },
    reportRef: function (id) { return id ? "דיווח " + id : "דיווח"; },
    mineLabel: function (m) { return m ? "להחלטתך" : "לביצוע"; }
  };
  var GK_ROUTINE = "שגרה";
  var GK_REPORT  = "דיווח תושב";
  /* 🔴🔴 **תקלת צוות — תקלה בלי תושב מאחוריה**   (2026-09-22, בקשת יועד:
     "היא צריכה להיות מסווגת שונה, לא כתקלת דייר אלא תקלה שמנהל / אחראי
     גינון פתח. אפשר דגל כחול במקום אדום ותווית מנהל.")
     🔑 **ההבחנה נגזרת מ-`repId` ולא משדה חדש.** `kind` כבר אומר "זו
        תקלה", ו-`repId` כבר אומר "יש תושב שמחכה לתשובה" — ולכן
        `GK_REPORT` בלי `repId` הוא, בהגדרה, תקלה שהצוות פתח. אפס
        שדות חדשים, אפס שינוי בכללי האבטחה, וכל הדיווחים הישנים
        ממשיכים להיקרא נכון בלי מיגרציה.
     ⚠️ הפס המקוטע נשאר על שתיהן — הוא אומר "תקלה", לא "תושב". מה
        שמשתנה הוא **צבע הפינה** והתווית. */
  function isTeamFault(t) { return !!t && t.kind === GK_REPORT && !t.repId; }

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

  /* ⚠️ ברמת המודול ולא בתוך render(). groupRank() מורמת (hoisted) ונקראת
     כבר בציור הראשון — לפני ששורות ה-var בתוך render() הספיקו לרוץ — ולכן
     קבוע שמוגדר שם היה undefined באותו רגע, ו-indexOf עליו הפיל את כל הציור:
     מסך ריק לגמרי בלי שום הודעה. אותו באג בדיוק כמו FLOW_H במסך הנתונים. */
  /* חלון הערעור — חייב להיות זהה ל-GARDEN_DISPUTE_DAYS בשרת. משימת שגרה
     נסגרת בסימון של הגנן, ובמשך החלון הזה המנהל עוד יכול לפתוח אותה מחדש.
     זה מה שהחליף את האישור מראש על כל 547 משימות השנה. */
  var DISPUTE_DAYS = 14;
  function canDispute(t) {
    if (!t.closure || t.closure !== "בוצע" || t.kind === GK_REPORT) return false;
    if (!t.approvedAt) return true;
    var ms = new Date(t.approvedAt).getTime();
    if (isNaN(ms)) return true;
    return (Date.now() - ms) <= DISPUTE_DAYS * 86400000;
  }

  var WEEK_ORDER = ["לשיבוץ · אין שבוע", "שבועות שעברו", "השבוע",
                    "שבוע הבא", "בהמשך"];

  /* ⚠️ 2026-09-21 — טבלת SORTS ו-sortDef() הוסרו. הבורר בוטל ב-9.9 ונעל
     את הסידור על "שבוע", וארבע ההגדרות נשארו כאן שנתיים-חיים בלי קורא:
     שלוש מהן לא היו נגישות מאף מסך, והרביעית הייתה קבוע. הקיבוץ היחיד
     שנותר הוא weekGroup(), והוא משרת רק את הארכיון. */

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
    /* ⚠️ "לטיפולך" אינו מסך בפני עצמו יותר (9.9) — הוא מסנן "מחכה לך"
       בתוך "משימות". הרישום נשאר כדי שקישור ישן יגיע למסך אמיתי ולא ייפול,
       והוא פשוט פותח את המסך כשהמסנן הזה כבר נבחר. */
    render: function (container) { CBA.screens.gardenTasks.render(container, "mine"); }
  };

  CBA.screens.gardenTasks = {
    render: function (container, mode) {
      var week = todayKey();
      /* ⚠️ שלושה מסננים (2026-09-09), אחרי הצוות האדום. קודם היו שישה,
         ושניים מהם שינו משמעות לפי מי מסתכל — "בוצעו" הופיע פעמיים ברצועה
         אצל הגנן, פעם למה שסימן ופעם למה שאושר.
           mine   — מה שדורש החלטה **ממני**, לפי התפקיד. זה מה שהיה "לטיפולך".
           open   — כל מה שפתוח, כולל מה שאין לו שבוע.
           closed — הארכיון, כולל מה שאין לו שבוע (ר' הממצא על משימות שאוחדו).
         "נגררו" ו"לבדיקה" ירדו כמסננים: גרירה היא תכונה של משימה ולא קטגוריה
         שלה, ומשוב שלילי הוא החלטה שממתינה — ולכן מקומו ב-mine. */
      var filter = mode === "mine" ? "mine" : "open";   // mine | open | closed
      /* הסידור הוא גם הקיבוץ. ברירת המחדל היא שבוע, כי זו השאלה שהמסך הזה
         נכשל בה: "לא ברור שיש דברים לשבוע ויש דברים שצריך להכניס לשיבוץ".
         כשהקבוצה "לשיבוץ · אין שבוע" יושבת בראש אותה רשימה, אין מה להסביר. */
      var isManager = false, busy = false;
      /* ⚠️ `busy` הוא נעילה **גלובלית** למסך, והיא נכונה רק לפעולות שנפתחות
         מדיאלוג (איחוד, סגירה, אישור מרוכז) — שם ממילא אי אפשר להתחיל שנייה
         לפני שהראשונה נגמרה. לסימון ✓ היא שגויה: יועד תיאר בדיוק את התוצאה —
         "אחרי לחיצה של וי אחד יש דיליי גדול עד שאפשר ללחוץ על הבא".
         הצוות מסמן רצף של משימות בשטח, ואין שום סיבה שסימון של אחת יחסום
         את השנייה: הן שורות שונות, וה-LockService בשרת מסדר את הכתיבות ממילא.
         לכן הנעילה של הפעולות המהירות היא **פר-שורה**. */
      var busyIds = {};
      /* ורענון אחד בסוף במקום אחד אחרי כל לחיצה: סימון חמש משימות ברצף היה
         מייצר חמש טעינות מלאות של כל הרשימה, כל אחת מהן סבב שלם לשרת. */
      var reloadTimer = null;
      // הסדר שבו האזורים והקטגוריות מוגדרים בטאב ההגדרות. הוא הסדר שבו
      // מקבצים — לא א"ב: האזורים כתובים שם מצפון לדרום, וזה מסלול ההליכה
      // האמיתי בשטח. אזור שאינו ברשימה (נמחק/שונה שמו) יורד לסוף.
      var order = { area: [], type: [] };
      /* ⚠️ **קריאה אחת.** עד 9.9 המסך שלח שלוש — week, unplanned, pending —
         ולכל אחת מהן רצפה של ~1.5 שניות ב-Apps Script גם כשהיא לא נוגעת
         בגיליון (ר' ההערה בראש handleHomeExtras_). זה גם מה שגרם לשלוש
         הרשימות להיות שלושה מצבים נפרדים שיכלו לסתור זה את זה, ולמסננים
         לשנות משמעות לפי איזו מהן נטענה. עכשיו יש רשימה אחת, והסינון
         והקיבוץ קורים בלקוח — כלומר מיידית. */
      var rowsAll = [];
      /* ⚠️ כישלון טעינה **אינו** רשימה ריקה. עד היום load() היה מאפס rows
         ומצייר "אין משימות בשבוע הזה" — כלומר אומר לגנן שאין לו עבודה בגלל
         תקלת רשת. זו התשובה הכי גרועה האפשרית: היא נראית תקינה, היא שקרית,
         והיא גורמת לו ללכת הביתה. */
      var loadErr = null;
      /* ⚠️ שורה שסומנה **חייבת להישאר רגע**. בלי זה הסימון האופטימי גורם לה
         לצאת מהמסנן באותו רגע והכרטיס נעלם בהינף — כלומר המשתמש לוחץ, משהו
         מהבהב, ואין לו שום אישור שהפעולה נקלטה. זה בדיוק אותו כשל שהוא תיאר,
         רק מהיר יותר. הרשימה מתנקה בטעינה הבאה, אחרי שהשרת אישר. */
      var justActed = {};

      container.innerHTML = '<div class="gd-screen" id="gt-root"></div>';
      var root = container.querySelector("#gt-root");
      var cardsWired = false;   // ראה wire() — מאזין הלחיצות המואצל נרשם פעם אחת
      draw(true);
      load();

      function load() {
        /* scope 'all' — כל המשימות בקריאה אחת. השרת ממש את התוכנית לשבוע
           הנוכחי לפני שהוא קורא את הגיליון, כך שמשימות שגרה שנוצרו עכשיו
           מגיעות כבר בתשובה הזאת ולא רק ברענון הבא. */
        CBA.data.getGardenTasks({ scope: "all", week: todayKey() }, function (res) {
          if (!res || !res.ok) {
            loadErr = (res && res.error) || "לא הצלחתי לטעון את המשימות";
            draw();
            return;
          }
          loadErr = null;
          justActed = {};        // השרת ענה — הרשימה חוזרת להיות מסוננת רגיל
          rowsAll = res.rows || [];
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
        });
      }

      /* ---- "מחכה לך" ----
         ⚠️ ההגדרה **תלוית תפקיד**, וזו כל הנקודה. עד היום היה מסך בשם
         "לטיפולך" שהראה לכל תפקיד חצי אחר, ואף אחד מהם לא ראה את החצי השני;
         עכשיו זו רשימה אחת שיודעת מי שואל.
         הגנן: מה שצריך שיבוץ, ומה שהוחזר אליו להשלמה.
         המנהל: מה שסומן ומחכה לאישורו, מה שנחסם בשטח, ומשוב שלילי של תושב —
         שלושתם החלטות שממתינות לו ולא עבודה. */
      function isMine(t) {
        if (isManager) {
          if (t.flag === "דורש בדיקה חוזרת") return true;   // גם אם כבר נסגרה
          if (t.closure) return false;
          return t.flag === "ממתין לאישור" || t.flag === "דורש בדיקה בשטח";
        }
        if (t.closure) return false;
        if (!t.week) return true;                            // ממתין לשיבוץ
        return t.flag === "הוחזר להשלמה";
      }

      function counts() {
        var c = { mine: 0, open: 0, closed: 0, faults: 0, weekTotal: 0, weekDone: 0 };
        rowsAll.forEach(function (t) {
          if (isMine(t)) c.mine++;
          /* ⚠️ המונה הזה סופר **את כל** דיווחי התושבים — פתוחים, משובצים
             וסגורים, מכל השבועות. זו כל הנקודה של המסנן: מקום אחד שבו
             אפשר לענות "מה קרה עם התקלה שדיווחתי" בלי לדפדף בשבועות. */
          if (t.kind === GK_REPORT) c.faults++;
          if (t.closure) c.closed++; else c.open++;
          /* פס ההתקדמות נשאר של **השבוע הנוכחי** — הוא עונה על "איך אנחנו
             עומדים השבוע", ולא על "כמה משימות יש בעולם". נמדד בסגורות ולא
             ב"סומן כבוצע": סימון הוא הצהרה של הצוות, ורק האישור סוגר. */
          if (t.week === week) { c.weekTotal++; if (t.closure) c.weekDone++; }
        });
        return c;
      }

      function visible() {
        return rowsAll.filter(function (t) {
          if (justActed[t.id]) return true;      // ר' ההערה ליד justActed
          if (filter === "mine") return isMine(t);
          if (filter === "faults") return t.kind === GK_REPORT;
          if (filter === "closed") return !!t.closure;
          return !t.closure;
        });
      }

      /* ---- קיבוץ לפי שבוע ----
         חמש קבוצות, ובסדר הזה בכוונה: שתי הראשונות הן מצבים שגויים —
         משימה בלי שבוע לא תקרה לעולם, ומשימה פתוחה משבוע שעבר כבר איחרה.
         הן יושבות מעל העבודה של השבוע כי הן מה שדורש מבט. */
      function weekGroup(t) {
        if (!t.week) return "לשיבוץ · אין שבוע";
        if (t.week < week) return "שבועות שעברו";
        if (t.week === week) return "השבוע";
        if (t.week === shiftKey(week, 1)) return "שבוע הבא";
        return "בהמשך";
      }

      function draw(skeleton) {
        /* מצויר לפני הכול, גם לפני מצב התיבה: כשהטעינה נכשלה אין שום נתון
           אמיתי להציג, וכל מסך שייבנה מעליו יהיה מסך של שקרים. */
        if (loadErr && !skeleton) {
          root.innerHTML =
            '<div class="gd-reps"><div class="gd-rep gt-err">' +
              '<u>' + ico("cloud") + '</u>' +
              '<b>לא הצלחתי לטעון</b>' +
              '<span>' + esc(loadErr) + '</span>' +
              '<button type="button" class="gd-cta" id="gt-retry">נסה שוב</button>' +
            '</div></div>';
          root.querySelector("#gt-retry").addEventListener("click", function () {
            loadErr = null; draw(true); load();
          });
          return;
        }
        var c = counts();

        /* ההתקדמות נמדדת ב**סגורות**, לא ב"סומן כבוצע": סימון הוא הצהרה של
           הצוות, ורק האישור סוגר. עד 8.9 הפס מדד את ההצהרות, כלומר קפץ
           קדימה ברגע שהגנן סימן — וחזר אחורה ברגע שהמנהל אישר. */
        var pct = c.weekTotal ? Math.round((c.weekDone / c.weekTotal) * 100) : 0;
        /* ⚠️ 2026-09-21 — בורר הסידור ירד לגמרי. הוא היה נעול על "שבוע"
           מאז 9.9, ושלושת המסלולים האחרים (דחיפות / אזור / קטגוריה) נשארו
           בקוד כענפים שאיש לא יכול היה להגיע אליהם — כולל תנאים בתוך
           הכרטיס עצמו שהסתירו שדות "לפי הסידור". קיבוץ אחד, קבוע. */
        var grp = weekGroup;
        var list = visible().slice();

        list.sort(function (a, b) {
          var ga = grp(a), gb = grp(b);
          if (ga !== gb) return groupRank(ga) - groupRank(gb) || ga.localeCompare(gb, "he");
          return urgency(b) - urgency(a);
        });

        var body;
        if (skeleton) {
          body = '<div class="gd-reps">' +
            '<div class="skeleton" style="height:86px;border-radius:16px"></div>'.repeat(3) + '</div>';
        } else if (!list.length) {
          body = CBA.ui.emptyState(
            filter === "faults"
              ? { title: "אין תקלות מתושבים",
                  sub: "כשתושב ידווח על משהו — הדיווח יופיע כאן, ויישאר כאן גם אחרי שיטופל." }
            : filter === "mine"
              ? { title: "אין מה לטפל",
                  sub: isManager
                    ? "כשהצוות יסמן משימה כבוצעה, או כשתושב יגיב על טיפול — זה יופיע כאן."
                    : "כשתושב ידווח על משהו חדש — זה יופיע כאן." }
              : filter === "closed"
                ? { title: "עוד לא נסגרה אף משימה",
                    sub: "משימה שאושרה או נסגרה בסיבה תופיע כאן, גם אם לא הייתה משובצת לשבוע." }
                : { title: "אין משימות פתוחות",
                    sub: "הכול סגור. תוכנית העבודה תייצר משימות חדשות בתחילת השבוע." });
        } else if (filter === "mine" && isManager) {
          /* ⚠️ ב"מחכה לך" של המנהל יושבים שלושה דברים שונים, ורק אחד מהם
             ניתן לאישור מרוכז. לכן הפיצול: תור האישורים מקובץ לפי תבנית
             ושבוע (החלטה 3 — רק שגרה מאותה תבנית ואותו שבוע מותרת יחד),
             וכל השאר — נחסם בשטח, ומשוב שלילי — הן החלטות פרטניות. */
          var awaiting = list.filter(function (t) { return t.flag === "ממתין לאישור"; });
          var decide   = list.filter(function (t) { return t.flag !== "ממתין לאישור"; });
          body =
            (awaiting.length
              ? '<div class="gt-grp">בוצע — ממתין לאישורך <em>· ' + awaiting.length +
                '</em><hr></div>' + approvalBody(awaiting)
              : '') +
            (decide.length
              ? '<div class="gt-grp">דורש החלטה <em>· ' + decide.length + '</em><hr></div>' +
                '<div class="gd-reps">' + decide.map(card).join("") + '</div>'
              : '');
        } else if (filter === "open") {
          /* תצוגת העבודה — מבנה קבוע. ר' openBody(). */
          body = openBody(list);
        } else if (filter === "faults") {
          /* כל תקלות התושבים, לפי מצב ולא לפי שבוע. ר' faultsBody(). */
          body = faultsBody(list);
        } else {
          /* 22.9 (הכרעת יועד, ממצא E) — מופעי שגרה שבוטלו אינם "עבודה
             שנעשתה"; הם יושבים במגירה סגורה בתחתית "סגורות", לא ברשימה. */
          var cancelled = [];
          var groups = [], seen = {};
          list.forEach(function (t) {
            if (filter === "closed" && t.kind === "שגרה" && t.closure && t.closure !== "בוצע") {
              return cancelled.push(t);
            }
            var g = grp(t);
            if (!seen[g]) { seen[g] = []; groups.push(g); }
            seen[g].push(t);
          });
          body = groups.map(function (g) {
            var n = seen[g].length;
            return '<div class="gt-grp">' + esc(g) +
              ' <em>· ' + (n === 1 ? "משימה אחת" : n + " משימות") + '</em><hr></div>' +
              '<div class="gd-reps">' + seen[g].map(card).join("") + '</div>';
          }).join("");
          if (cancelled.length) {
            cancelled.sort(function (a, b) { return String(b.week || "").localeCompare(String(a.week || "")); });
            body += '<details class="gt-drawer">' +
              '<summary>מופעי שגרה שבוטלו <em>· ' + cancelled.length + '</em></summary>' +
              '<div class="gd-reps">' + cancelled.map(card).join("") + '</div>' +
            '</details>';
          }
        }

        /* אין כותרת מסך (2026-09-08). הסמליל והכותרת "משימות השבוע" החזיקו
           68px קבועים ולא אמרו דבר שהניווט לא אומר — המשתמש הגיע לכאן מלשונית
           ששמה כתוב עליה. "משימה חדשה" עבר לשורת הבקרה כלחצן ראשי. */
        /* ⚠️ מצב "לטיפולך" הוסר (9.9). הוא היה מסך שני שהראה לכל תפקיד חצי
           אחר מאותה שאלה, ואף אחד מהם לא ראה את החצי השני. מה שהיה בו נמצא
           עכשיו במסנן "מחכה לך" של המסך הזה — ר' isMine. */
        root.innerHTML =
          /* ⚠️ בלי חיצי שבוע (9.9). המסך כבר לא ממוסגר בשבוע אחד — הוא מחזיק
             את כל המשימות, והשבוע הוא קיבוץ בתוך הרשימה. הכותרת נשארה כדי
             לענות על "איך אנחנו עומדים השבוע", וזה כל מה שהיא אומרת. */
          /* 🔴 **החצים חזרו** (2026-09-21, בקשת יועד). הנימוק לביטולם
             ב-9.9 — "המסך מחזיק את כל המשימות" — נכון, אבל כל מה שמעבר
             לשבוע הנוכחי נדחס ללהקה אחת בשם "בהמשך", בלי חלוקה
             לשבועות ובלי דרך לשאול "מה יש לי בשבוע הבא".
             ⚠️ החצים מזיזים את **חלון הקיבוץ** ולא טוענים מחדש. */
          '<div class="gt-week">' +
            '<button type="button" class="gt-wnav" data-wk="-1" aria-label="שבוע קודם">' +
              ico("prev") + '</button>' +
            '<div class="gt-week__c"><b>' + esc(weekLabel(week)) +
              (week !== todayKey()
                ? ' <button type="button" class="gt-wnow" data-wk="0" ' +
                  'aria-label="חזרה לשבוע הנוכחי">היום</button>'
                : '') + '</b>' +
              '<span>' + (c.weekTotal
                ? c.weekDone + " מתוך " + c.weekTotal + " הושלמו השבוע"
                : "אין משימות משובצות לשבוע הזה") + '</span>' +
              '<div class="gt-bar"><i style="width:' + pct + '%"></i></div></div>' +
            '<button type="button" class="gt-wnav" data-wk="1" aria-label="השבוע הבא">' +
              ico("next") + '</button>' +
          '</div>' +
          '<div class="gt-ctl">' +
            '<div class="gt-ctl__f">' +
              /* "מחכה לך" ראשון תמיד, וגם כשהוא ריק: הוא המקום שהמשתמש אמור
                 לפתוח בו את הבוקר, ומסנן שנעלם כשהוא מתרוקן מלמד לא להסתכל
                 עליו. אפס כאן הוא תשובה טובה, לא רעש. */
              /* ⚠️ 2026-09-09 — התווית נגזרת מהתפקיד. "מחכה לך" הציג שתי
                 רשימות שונות לגמרי תחת אותה מילה ואותו מונה: אצל המנהל מה
                 שממתין להחלטתו, ואצל הגנן מה שלא שובץ ומה שהוחזר אליו. */
              seg("mine", GL.mineLabel(isManager), c.mine) +
              seg("open", "פתוחות", c.open) +
              /* 🔴 מסנן רביעי (2026-09-21, בקשת יועד): "מקום שיהיה אפשר
                 לראות בו את כל התקלות דייר — לא שובצו, משובצות, טופלו
                 ומכל השבועות". זה אותו מנגנון מסנן ולא מסך חדש. */
              seg("faults", "תקלות", c.faults) +
              seg("closed", "סגורות", c.closed) +
            '</div>' +
            (isManager
              ? '<button type="button" class="gt-tool is-primary" id="gt-new" ' +
                'aria-label="משימה חדשה">' + ico("plus") + '</button>'
              : '') +
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
         לא מסמנים ביצוע אלא **מחליטים אם זו בכלל עבודה**.
         עד 9.9 היו לזה שלוש תשובות; "כבר בתוכנית" בוטלה (ר' ההערה בכרטיס),
         ונשארו שתיים: לאחד עם דיווח תושב אחר, או לשבץ לשבוע.
         inCard() הוסרה (9.9) — היא הייתה מרנדר כרטיסים שני, ייחודי למסך
         "לטיפולך", ועכשיו יש מרנדר אחד: card(). shortWeek() הוסרה איתה,
         כי "כבר בתוכנית" הייתה הקוראת האחרונה שלה. */

      /* ==========================================================================
       *  תצוגת העבודה — שלוש שכבות (2026-09-21, הכרעת יועד)
       * --------------------------------------------------------------------------
       *  ההיררכיה: **החלטות ← השבוע ← בהמשך**. שלוש שכבות, כרונולוגיות.
       *
       *   1. "ממתין להחלטה" — כרטיס רקע נפרד בראש העמוד, **תמיד מוצג גם כשהוא
       *      ריק**. בתוכו כל מה שאין לו שבוע: דיווחי תושבים שטרם שובצו, ואחריהם
       *      שגרה. עד 20.9 אלה היו שני מסלולים — "תקלות שדווחו" ו"לשיבוץ" —
       *      ששאלו בדיוק את אותה שאלה ונקראו כשתי רשימות נפרדות.
       *   2. "עבודת השבוע" — כל מה שמשובץ לשבוע שצופים בו, **מקובץ לפי אזור**.
       *      הגנן לא עובד לפי סוג עבודה אלא לפי מקום: הוא נוסע לשכונה ועושה בה
       *      את הכול.
       *      ⚠️ **דיווח תושב ששובץ יושב כאן ולא למעלה** — זו כל הנקודה של
       *      השיבוץ. עד 20.9 הוא נשלף החוצה לפי `kind` בלי קשר לשבוע, ולכן
       *      השיבוץ כתב נתון ולא הזיז דבר על המסך.
       *      הזיהוי שלו נשאר מיידי: דגל בורדו בפינה + תג "תושב" + פס מקוטע.
       *   3. 🔴 **"בהמשך" הוסר** (2026-09-22, הכרעת יועד): "נדרש להציג בתוך
       *      השבוע רק את המשימות של אותו שבוע". מופעי השגרה של 8 שבועות
       *      האופק נערמו שם בלי חלוקה. שבוע אחר = החצים בכותרת.
       *
       *  ⚠️ חל על מסנן "פתוחות" בלבד. "להחלטתך" מקובץ לפי סוג ההחלטה
       *     (approvalBody), "תקלות דיירים" לפי מצב (faultsBody), ו"סגורות"
       *     הוא ארכיון לפי שבוע — לשלושתם מבנה משלהם.
       * ======================================================================== */
      function areaRank(name) {
        var i = (order.area || []).indexOf(name);
        return i === -1 ? 9999 : i;
      }
      /* אותו כלל לקטגוריות: הסדר שבטאב ההגדרות, לא א"ב. משמש את כרטיס
         "ממתין להחלטה" — שם הקיבוץ הפנימי הוא לפי קטגוריה. */
      function catRank(name) {
        var i = (order.type || []).indexOf(name);
        return i === -1 ? 9999 : i;
      }
      function lane(label, n) {
        return '<div class="gt-grp gt-grp--lane">' + esc(label) +
          ' <em>· ' + (n === 1 ? "משימה אחת" : n + " משימות") + '</em><hr></div>';
      }
      function openBody(list) {
        var weekIsNow = week === todayKey();
        var decide = [], thisWeek = [];
        list.forEach(function (t) {
          /* 🔴 **אין שבוע = ממתין להחלטה** (2026-09-21). קודם דיווח תושב
             נשלף החוצה לפי `kind` בלי קשר לשבוע — ולכן דיווח **ששובץ**
             נשאר בראש המסך במקום לרדת לעבודת השבוע, והשיבוץ לא הזיז דבר
             על המסך. זו הייתה הסתירה שיועד זיהה: "אין שום סיבה לשבץ".
             מהיום השיבוץ הוא מה שמעביר את הכרטיס מלמעלה לשבוע שלו. */
          if (!t.week) return decide.push(t);
          /* שבוע שעבר נכנס ל"עבודת השבוע" ולא לקבוצה משלו: מבחינת הגנן זו
             עבודה שצריך לעשות עכשיו. האיחור עצמו כבר כתוב על הכרטיס.
             ⚠️ **אבל רק כשצופים בשבוע הנוכחי** — בשבוע עתידי מציגים בדיוק
             את מה שמשובץ אליו, אחרת הכותרת משקרת. */
          if (weekIsNow ? (t.week <= week) : (t.week === week)) return thisWeek.push(t);
          /* שבוע מאוחר יותר — לא מוצג כאן (ר' סעיף 3 למעלה). */
        });
        /* בתוך "ממתין להחלטה": דיווחי תושבים ראשונים — מאחורי כל אחד מהם
           עומד אדם שמחכה — ואחריהם שגרה. בכל קבוצה לפי סדר הקטגוריות
           שבהגדרות, ובתוך קטגוריה לפי דחיפות. */
        decide.sort(function (a, b) {
          var ra = a.kind === GK_REPORT ? 0 : 1, rb = b.kind === GK_REPORT ? 0 : 1;
          if (ra !== rb) return ra - rb;
          var ca = a.category || "", cb = b.category || "";
          if (ca !== cb) return catRank(ca) - catRank(cb) || ca.localeCompare(cb, "he");
          return urgency(b) - urgency(a);
        });

        /* 🔴 **כרטיס רקע אחד בראש העמוד** (2026-09-21, הכרעת יועד).
           קודם ישבו כאן שני מסלולים — "תקלות שדווחו" ו"לשיבוץ" — ששאלו
           בדיוק את אותה שאלה ("מה צריך החלטה") ונקראו כשתי רשימות נפרדות.
           תמיד מוצג, גם ריק: מסלול שנעלם כשהוא מתרוקן מלמד לא להסתכל. */
        var html = '<section class="gt-decide">' +
          lane("ממתין להחלטה", decide.length) +
          (decide.length
            ? '<div class="gd-reps">' +
                decide.map(function (t) { return card(t); }).join("") + '</div>'
            : '<div class="gt-none">אין מה להחליט — כל מה שפתוח כבר משובץ לשבוע.</div>') +
          '</section>';

        /* ⚠️ הכותרת אומרת את האמת: "עבודת השבוע" רק כשזה באמת השבוע הזה.
           אחרת — שם השבוע שצופים בו. */
        html += lane(weekIsNow ? "עבודת השבוע" : ("עבודת " + weekLabel(week)),
                     thisWeek.length);
        if (!thisWeek.length) {
          html += '<div class="gt-none">אין עבודה משובצת לשבוע הזה.</div>';
        } else {
          var areas = [], seen = {};
          thisWeek.forEach(function (t) {
            var a = t.area || "ללא אזור";
            if (!seen[a]) { seen[a] = []; areas.push(a); }
            seen[a].push(t);
          });
          /* סדר האזורים הוא הסדר שבטאב ההגדרות — הם כתובים שם מצפון לדרום,
             וזה מסלול ההליכה האמיתי בשטח. */
          areas.sort(function (a, b) {
            return areaRank(a) - areaRank(b) || a.localeCompare(b, "he");
          });
          html += areas.map(function (a) {
            /* דיווח תושב ראשון גם כאן, מאותו נימוק. */
            seen[a].sort(function (x, y) {
              var rx = x.kind === GK_REPORT ? 0 : 1, ry = y.kind === GK_REPORT ? 0 : 1;
              return (rx - ry) || urgency(y) - urgency(x);
            });
            return '<div class="gt-grp gt-grp--sub">' + esc(a) +
              ' <em>· ' + seen[a].length + '</em><hr></div>' +
              '<div class="gd-reps">' +
                seen[a].map(function (t) { return card(t, { hideArea: true }); }).join("") +
              '</div>';
          }).join("");
        }

        return html;
      }

      /* ==========================================================================
       *  "תקלות דיירים" — הכול, מכל השבועות (2026-09-21, בקשת יועד)
       * --------------------------------------------------------------------------
       *  המסנן הזה הוא **לא** מסך נוסף: אותו rowsAll, אותו card(), אותו wire().
       *  ההבדל היחיד הוא שהקיבוץ כאן הוא לפי **מצב** ולא לפי שבוע — כי
       *  השאלה שהוא עונה עליה היא "מה קרה עם הדיווח", ולא "מה לעשות היום".
       * ======================================================================== */
      function faultsBody(list) {
        var byUrg = function (a, b) { return urgency(b) - urgency(a); };
        var waiting = [], sched = [], handled = [];
        list.forEach(function (t) {
          if (t.closure) return handled.push(t);
          if (!t.week) return waiting.push(t);
          sched.push(t);
        });
        waiting.sort(byUrg);
        handled.sort(byUrg);
        /* המשובצות לפי שבוע — כרונולוגיה, לא דחיפות: כאן השאלה היא "מתי",
           והדחיפות כבר כתובה על הכרטיס עצמו. */
        sched.sort(function (a, b) {
          return String(a.week).localeCompare(String(b.week)) || urgency(b) - urgency(a);
        });

        var html = lane("ממתינות לשיבוץ", waiting.length) +
          (waiting.length
            ? '<div class="gd-reps">' +
                waiting.map(function (t) { return card(t); }).join("") + '</div>'
            : '<div class="gt-none">אין תקלות שממתינות לשיבוץ.</div>');

        html += lane("משובצות", sched.length);
        if (!sched.length) {
          html += '<div class="gt-none">אין תקלות משובצות לשבוע כלשהו.</div>';
        } else {
          var weeks = [], seenW = {};
          sched.forEach(function (t) {
            if (!seenW[t.week]) { seenW[t.week] = []; weeks.push(t.week); }
            seenW[t.week].push(t);
          });
          html += weeks.map(function (w) {
            return '<div class="gt-grp gt-grp--sub">' + esc(weekLabel(w)) +
              ' <em>· ' + seenW[w].length + '</em><hr></div>' +
              '<div class="gd-reps">' +
                seenW[w].map(function (t) { return card(t); }).join("") + '</div>';
          }).join("");
        }

        html += lane("טופלו", handled.length) +
          (handled.length
            ? '<div class="gd-reps">' +
                handled.map(function (t) { return card(t); }).join("") + '</div>'
            : '<div class="gt-none">עוד לא נסגרה אף תקלה.</div>');
        return html;
      }

      /* קיבוץ לפי שבוע הוא סדר קבוע ומשמעותי, לא סדר הגדרה בגיליון.
         משמש רק את הארכיון ("סגורות") — לשאר המסננים יש מבנה משלהם. */
      function groupRank(name) {
        var w = WEEK_ORDER.indexOf(name);
        return w === -1 ? 9999 : w;
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

      /* opt.hideArea — הכרטיס יושב בתוך קבוצה שכותרתה היא האזור, ואז אין
         טעם לחזור עליו בכל שורה. ⚠️ **אסור** לקרוא לזה כ-list.map(card):
         map מעביר את האינדקס כפרמטר שני, והוא ייקרא כ-opt. תמיד עטיפה
         מפורשת — ר' [[cba-resident-refund-summary-2026-09-07]]. */
      function card(t, opt) {
        var hideArea = !!(opt && opt.hideArea);
        var cat = catOf(t.category);
        var done = t.flag === "ממתין לאישור";
        /* כרטיס סגור. הוא **לא** מנוסח כמשימה שאפשר לפעול עליה: אין תיבת
           סימון, אין תפריט פעולות — רק מה נסגר, על ידי מי, ומתי, וכפתור
           שפותח את קו הזמן המלא. זה הארכיון, לא רשימת עבודה. */
        if (t.closure) {
          return '<article class="gd-rep gt-row gt-closed k-' + cat.key +
              (t.kind === GK_REPORT ? " is-report" : "") +
              (isTeamFault(t) ? " is-team" : "") +
              '" data-id="' + esc(t.id) + '">' +
            '<span class="gt-cbox">' + ico("check") + '</span>' +
            '<div class="gt-body">' +
              '<div class="gt-t">' + esc(t.title || t.category || "משימה") + '</div>' +
              '<div class="gt-meta">' +
                '<span class="gt-cls">' + esc(t.closure) + '</span><i>·</i>' +
                '<span class="gd-kchip">' + ico(cat.ico) + esc(t.category || "") + '</span>' +
                (t.area
                  ? '<i>·</i><span class="gt-nb">' + ico("pin") + esc(t.area) + '</span>'
                  : '') +
                (t.approvedAt ? '<i>·</i>' + esc(ago(t.approvedAt)) : '') +
                (t.approvedBy ? '<i>·</i>' + esc(t.approvedBy) : '') +
                /* ⚠️ דגל על כרטיס סגור (17.9, ממצא 20). "דורש בדיקה חוזרת"
                   נכתב על משימה סגורה אחרי משוב שלילי של תושב, והכרטיס
                   הסגור לא צייר שום דגל — כך שהסיבה שבגללה הוא יושב בתור
                   "דורש החלטה" לא הופיעה עליו בשום מקום. */
                (t.flag && t.flag !== "ממתין לאישור"
                  ? '<i>·</i><span class="gt-age' +
                    (FLAG_HOT[t.flag] ? " is-hot" : "") + '">' + esc(t.flag) + '</span>'
                  : '') +
              '</div>' +
              (t.note ? '<div class="gt-note">' + esc(t.note) + '</div>' : '') +
            '</div>' +
            /* ⚠️ כרטיס סגור אינו נעול.
               · הגנן: משימת שגרה שהוא סגר בעצמו פתוחה לערעור שבועיים.
               · **המנהל: תמיד** (17.9, ממצא 22+20). קודם התנאי היה
                 `canDispute` לשניהם, ולכן כרטיס שיושב בתור "דורש החלטה"
                 בגלל משוב שלילי של תושב חשף כפתור אחד — היסטוריה — ומנהל
                 שראה "דורש החלטה · 1" לא יכול היה להחליט דבר. אותו תנאי גם
                 מנע מחיקה של משימה סגורה, למרות שהשרת מעולם לא חסם אותה. */
            (canDispute(t) || isManager
              ? '<button type="button" class="gt-more" data-act="menu" aria-label="עוד פעולות">' +
                ico("dots") + '</button>'
              : '<button type="button" class="gt-more" data-act="hist" aria-label="היסטוריה">' +
                ico("hist") + '</button>') +
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
        /* ⚠️ הפעולה הראשית נגזרת מ**מצב המשימה**, לא מהמסנן שנבחר (9.9).
           קודם היא נגזרה מהמסנן, ולכן אותה משימה קיבלה כפתור אחר בכל רשימה
           שהיא הופיעה בה. משימה בלי שבוע אי אפשר לסמן כבוצעה — הפעולה
           הנכונה עליה היא אחת: שיבוץ. */
        var planning = !t.closure && !t.week;
        /* בתצוגת "בוצעו" התיבה משנה משמעות לפי מי מסתכל: לצוות היא ביטול
           הסימון שלו, ולמנהל היא **האישור** — הפעולה שבאמת סוגרת. שאר
           ההחלטות של המנהל (החזרה, סגירה עם סיבה) יושבות בתפריט ה-⋯. */
        var approving = done && isManager;
        return '<article class="gd-rep gt-row k-' + cat.key +
            (t.kind === GK_REPORT ? " is-report" : "") +
            (isTeamFault(t) ? " is-team" : "") +
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
              /* ⚠️ **מספר הפנייה חוזר לכרטיס** (9.9), ורק הוא. עד היום היה
                 כאן מזהה המשימה — מספר שהתושב מעולם לא ראה — ולכן ב-8.9
                 הורדנו אותו לגמרי. אבל אז נוצר המצב שיועד נתקל בו: הוא קיבל
                 "הדיווח נשלח · מספר 7", חיפש 7, ומצא משימה אחרת לגמרי, כי
                 המספר שהוא קיבל הוא של טאב הדיווחים והצוות עבד לפי טאב
                 המשימות. מהיום מוצג המספר שהתושב מחזיק ביד, והוא היחיד.
                 משימת שגרה ומשימה יזומה נשארות בלי מספר — אין להן פנייה
                 ואין מי שמצטט אותן. */
              (t.kind === GK_REPORT
                ? (isTeamFault(t)
                    ? '<span class="gt-res is-team">' + ico("team") + 'מנהל</span><i>·</i>'
                    : '<span class="gt-res">' + ico("person") +
                      esc(GL.reportRef(t.repId)) + '</span><i>·</i>')
                : (t.kind === GK_ROUTINE ? ico("repeat") + '<i>·</i>' : '')) +
              /* ---- תמונות הדיווח (PHASE 4.2, 2026-09-14) ----
                 עד היום התושב צילם, התמונה נשמרה ב-Drive, ומי שיצא לשטח
                 לא ראה אותה מעולם. זה מה שהופך "יש רטיבות ליד השביל"
                 לביקור אחד במקום שניים. מוצג רק כשיש תמונות בפועל. */
              ((t.photos && t.photos.length)
                ? '<button type="button" class="gt-nb gt-ph" data-act="photos" ' +
                    'title="צפייה בתמונות שצירף התושב">' + ico("camera") +
                    t.photos.length + '</button><i>·</i>'
                : '') +
              /* שדה שכבר מופיע בכותרת הקבוצה אינו חוזר על הכרטיס. בסידור
                 לפי אזור, האזור נכתב פעם אחת מעל הקבוצה ואז שוב על כל אחת
                 מתשע המשימות שמתחתיו — וכשהשם ארוך ("שכונה מרכזית צפונית")
                 הוא גם שובר את שורת המטא לשתיים. אותו כלל לקטגוריה. */
              '<span class="gd-kchip">' + ico(cat.ico) + esc(t.category || "") + '</span>' +
              (where && !hideArea
                ? '<i>·</i><span class="gt-nb">' + ico("pin") + esc(where) + '</span>'
                : '') +
              (tags ? '<i>·</i>' + tags : '') +
            '</div>' +
            (t.note ? '<div class="gt-note">' + esc(t.note) + '</div>' : '') +
            /* רמז הכפילות מופיע רק ב"לשיבוץ" — הרגע שבו המנהל פוגש דיווח
               חדש, ולפני ששיבץ עליו עבודה. הוא **הצעה**: הכפתור מאחד,
               והתעלמות ממנו משאירה את המשימה עצמאית. */
            /* ⚠️ הכפילות מוצעת רק כשהמועמד הוא **דיווח תושב** (2026-09-09).
               `gardenDupCandidate_` בשרת סינן רק את המקור, לא את המועמד,
               ולכן הוא הציע לאחד דיווח של תושב לתוך משימת שגרה — נראה חי
               בייצור ("נראה כמו כפילות של #36 · בדיקת מערכת השקיה", שהוא
               סעיף בתוכנית העבודה). עד שהשרת ידווח `kind`, השדה יהיה
               undefined והרמז פשוט לא יוצג — כשל בטוח לכיוון הנכון. */
            (planning && t.dupOf && t.dupOf.kind === GK_REPORT
              ? '<div class="gt-dup">' + ico("merge") +
                'נראה כמו כפילות של <b>' +
                esc(t.dupOf.repId ? GL.reportRef(t.dupOf.repId) : "#" + t.dupOf.id) + '</b> · ' +
                esc(t.dupOf.title || "") +
                '<button type="button" data-act="merge">איחוד</button></div>'
              : '') +
            /* ⚠️ 2026-09-09 — "כבר בתוכנית · קישור" הוסר, בהחלטת יועד.
               מה שהוא עשה: איחד דיווח של תושב **לתוך משימת שגרה**, כך
               שסימון הכיסוח השבועי סגר את התקלה ושלח לתושב "טופל". מכיוון
               שמשימת שגרה נסגרת מיד בסימון של הגנן, המכתב יצא בשם הוועד
               בלי שאף אדם בדק. הכלל עכשיו: **איחוד רק בין דיווחי תושבים**,
               ודיווח נסגר תמיד בפעולה מפורשת עליו.
               ⚠️ הפעולה `gardenCoverByPlan` בשרת עדיין קיימת ומגיבה —
               לחסום אותה שם בסבב ה-Code.gs הבא. */
            /* שורת "ממתין לאישור" נשארת רק לצוות (2026-09-08). אצל המנהל
               היא הופיעה על כל כרטיס בתור האישורים — כלומר על מסך שכולו
               ממתין לאישורו — לצד תיבת אישור ירוקה שאומרת בדיוק את זה. */
            (done && !isManager
              ? '<div class="gt-wait">' + ico("clock") +
                esc('ממתין לאישור ' + GL.T.manager) + '</div>'
              : '') +
          '</div>' +
          '<button type="button" class="gt-more" data-act="menu" aria-label="עוד פעולות">' +
            ico("dots") + '</button>' +
        '</article>';
      }

      function wire() {
        Array.prototype.forEach.call(root.querySelectorAll("[data-wk]"), function (b) {
          b.addEventListener("click", function () {
            var d = parseInt(b.dataset.wk, 10);
            /* 0 = "היום" — חזרה לשבוע הנוכחי, לא הזזה באפס. */
            week = d ? shiftKey(week, d) : todayKey();
            /* ⚠️ `draw()` בלבד: `rowsAll` מחזיק כבר את כל המשימות (`scope:"all"`)
               ו-`counts()` רץ בתוך draw. טעינה מחדש היתה הופכת לחיצה על חץ
               להמתנה של שנייה, בלי שום נתון חדש. */
            draw();
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
        var legBtn = root.querySelector("#gt-legend");
        if (legBtn) legBtn.addEventListener("click", openLegend);
        /* הרצועה נגללת, ואחרי ציור מחדש היא חוזרת להתחלה — כך שהמסנן שנבחר
           זה עתה עלול לשבת מחוץ למסך והמשתמש רואה רשימה בלי לדעת מה סינן
           אותה. inline:"nearest" כדי לא להזיז אותה כשהוא כבר נראה. */
        var on = root.querySelector(".gt-ctl__f button.on");
        if (on && on.scrollIntoView) {
          try { on.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (e) {}
        }
        /* ⚠️ פעם אחת בלבד (2026-09-09). wire() נקראת בכל draw(), ו-root עצמו
           אינו מוחלף — רק התוכן שלו. בלי השמירה הזאת נרשם מאזין נוסף
           בכל ציור, ואחרי ארבע החלפות מסנן לחיצה אחת על ‹› פתחה ארבעה
           גיליונות מוערמים. שאר המאזינים כאן יושבים על אלמנטים שנבנים
           מחדש בכל ציור, ולכן הם אינם צוברים. */
        if (!cardsWired) { root.addEventListener("click", onCardClick); cardsWired = true; }
      }

      function onCardClick(e) {
        var btn = e.target.closest("[data-act]");
        if (!btn) {
          /* לחיצה על גוף השורה עצמה (לא על תיבה/שיבוץ/⋯, שכולם נושאים
             data-act) פותחת את כרטיס הפרטים — רק לדיווחי תושב, שבשבילם
             נבנה הכרטיס. משימת שגרה/יזומה ממשיכה בלי תגובה, כמו קודם. */
          var detRow = e.target.closest(".gt-row");
          if (detRow && detRow.dataset.id) {
            var detT = byId(detRow.dataset.id);
            /* 🔴 **פתיחת פרטים לכל משימה** (2026-09-21, דיווח יועד).
               עד היום התנאי היה `kind === GK_REPORT`, ולכן משימה שממתינה
               לשיבוץ לא הגיבה ללחיצה בכלל — בדסקטופ זה נראה כמו מסך תקוע.
               ⚠️ `openDetails` כבר גנרי: הוא גוזר את שורת הפעולה ממצב
                  המשימה (`planning`/`closed`) ומגן על `repId`. בדקתי, לא הנחתי. */
            if (detT) openDetails(detRow.dataset.id);
          }
          return;
        }
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
        if (act === "photos") {
          var pt = byId(id);
          if (pt && CBA.photos) CBA.photos.open(pt.photos, "תמונות " + (pt.repId ? GL.reportRef(pt.repId) : "הדיווח"));
          return;
        }
        if (act === "hist") return openHistory(id);
        if (act === "menu") return openMenu(id);
        if (act === "plan") return askWeek(id);
        if (act === "approve") return run("approve", id, {});
        if (act === "done") return markDone(id);
        if (act === "undo") return run("undo", id, {});
      }

      /* חיווי ברמת השורה. החיווי הגלובלי בכותרת ("שומר") אומר שמשהו קורה
         באפליקציה; הוא לא אומר **על מה**. בטלפון, כשהאצבע על כרטיס אחד מתוך
         תשעה, זו לא אותה שאלה. */
      function markRowBusy(id, on) {
        var el = root.querySelector('.gt-row[data-id="' + String(id).replace(/"/g, '') + '"]');
        if (el) el.classList.toggle("is-saving", !!on);
      }

      function byId(id) {
        for (var i = 0; i < rowsAll.length; i++) {
          if (String(rowsAll[i].id) === String(id)) return rowsAll[i];
        }
        return null;
      }

      /* פעולה אחת מול השרת. ננעל בזמן הפעולה כדי ששתי הקשות מהירות על אותה
         משימה לא ישלחו שתי בקשות סותרות (done ואז undo על מצב שטרם התרענן). */
      /* מה שכל פעולה עושה לשורה **מיד**, לפני שהשרת ענה. שלוש הפעולות
         שנעשות בלחיצה אחת על הכרטיס הן היחידות שצריכות את זה — השאר עוברות
         דרך דיאלוג, ושם ההמתנה מובנת ממילא. הערכים זהים למה שהשרת כותב
         (ר' gardenTaskAction_): סימון מרים דגל ואינו סוגר. */
      var OPTIMISTIC = {
        /* דיווח תושב ממתין לאישור; שגרה ויזום נסגרים בסימון עצמו (9.9). */
        /* ⚠️ 2026-09-09 — גם דיווח תושב נסגר בסימון (גל 3). קודם הוא קיבל
           כאן דגל "ממתין לאישור"; זה כבר לא מה שהשרת כותב. */
        done:    function (t) {
                   t.stage = "הושלם"; t.flag = ""; t.closure = "בוצע";
                   t.approvedAt = new Date().toISOString();
                 },
        /* ⚠️ 17.9 — **כל** סגירה, לא רק "בוצע" (ממצא 22). מאז שמנהל יכול
           לפתוח מחדש סגירה בכל סיבה, התנאי הישן השאיר את הכרטיס סגור על
           המסך עד רענון מלא — בדיוק הפער בין מה שנשמר למה שנראה. */
        undo:    function (t) {
                   t.flag = "";
                   if (t.closure) {
                     t.closure = ""; t.stage = "בטיפול";
                     t.approvedAt = ""; t.approvedBy = "";
                   }
                 },
        approve: function (t) { t.stage = "הושלם"; t.flag = ""; t.closure = "בוצע";
                                t.approvedAt = new Date().toISOString(); }
      };

      /* ⚠️ 2026-09-09, גל 3 — סימון "בוצע" על **דיווח תושב** מבקש קודם משפט
         אחד על מה נעשה, והוא חובה. זה לא חיכוך לשם חיכוך: משבוטל שלב האישור,
         המשפט הזה הוא מה שנכנס למייל שיוצא לתושב במקום "אושר על ידי הוועד",
         והוא מה שהופך הודעת סיום למשהו שאפשר לערער עליו. השרת אוכף את אותו
         תנאי בעצמו — כאן זה רק כדי לא לשלוח פעולה שתידחה.
         שגרה ומשימה יזומה נסגרות בלחיצה אחת, בלי דיאלוג: אין למי לכתוב. */
      function markDone(id) {
        var t = byId(id);
        if (!t) return;
        /* 🔴 **`repId` ולא `kind`** (2026-09-22). התנאי שאל עד היום "האם זה
           דיווח", אבל מה שקובע כאן הוא "האם יש תושב שיקרא את המשפט".
           מרגע שהמנהל יכול לפתוח תקלה בעצמו (`asReport`), משימה יכולה
           להיות `GK_REPORT` **בלי** תושב מאחוריה — והדיאלוג היה מבקש
           לכתוב הודעה לאיש. זה גם התפר שכבר קיים בשכבת הכתיבה
           (`isReport` ב-dataService) ובכללי האבטחה. */
        if (!t.repId) return run("done", id, {});
        CBA.ui.prompt("המשפט הזה נשלח לתושב שדיווח, ונשמר ביומן המשימה.", {
          title: "מה נעשה?", value: t.note || "",
          placeholder: "למשל: הממטרה הוחלפה והמערכת נבדקה",
          okText: "סיום וסגירה"
        }).then(function (txt) {
          if (txt === null) return;                 // ביטול — לא סוגרים
          var note = String(txt).trim();
          if (!note) {
            /* ריק אינו ביטול: הגנן התכוון לסמן. מסבירים ומחזירים אותו לשדה,
               במקום להשאיר אותו מול כרטיס לא מסומן ובלי לדעת למה. */
            return CBA.ui.alert("צריך לכתוב מה נעשה — המשפט נשלח לתושב.")
              .then(function () { markDone(id); });
          }
          run("done", id, { note: note });
        });
      }

      /* פעולה על משימה. הכרטיס משתנה מיד ומתגלגל אחורה אם השרת סירב.
         ⚠️ עד 8.9 לא היה כאן שום שינוי מקומי: הלחיצה על תיבת הסימון לא סימנה
         כלום, המסך עבר לחיווי "שומר" הגלובלי, והווי הופיע רק אחרי סבב מלא
         לשרת ורענון של כל הרשימה. יועד: "זה לא מסמן וי אלא ישר עובר למצב
         טעינה". פעולה שהמשתמש יזם צריכה להיראות קרתה — הרשת היא פרט טכני. */
      function run(op, id, extra) {
        if (busyIds[id]) return;          // אותה שורה פעמיים — כן חוסמים
        busyIds[id] = true;

        var t = byId(id);
        /* ⚠️ נקרא **לפני** ה-OPTIMISTIC, שמשנה את השורה במקום (2026-09-09).
           ההודעה אחרי סימון הייתה קבועה — "ממתין לאישור" — גם למשימות
           שגרה ויזום, שנסגרות מיד. הגנן חיכה לאישור שכבר לא יגיע. */
        /* אותו תפר בדיוק: ההודעה "ממתין לאישור" נכונה רק כשיש תושב
           שהסגירה מחכה לו. ר' ההערה ב-markDone. */
        var wasReport = !!(t && t.repId);
        /* ⚠️ גם הוא לפני ה-OPTIMISTIC: הטוסט של undo היה קבוע ("הסימון
           בוטל"), וזה ניסוח שגוי לפתיחה מחדש של משימה שנסגרה כ"בוטל". */
        var wasClosure = (t && t.closure) || "";
        var snapshot = t ? JSON.parse(JSON.stringify(t)) : null;
        var applied = false;
        if (t && OPTIMISTIC[op]) {
          OPTIMISTIC[op](t);
          applied = true;
          justActed[id] = true;
          /* ⚠️ הסדר הפוך ממה שנראה טבעי: draw() בונה את ה-DOM מחדש, ולכן
             מחלקה שנוספה לפניו נמחקת. מסמנים אחרי. */
          draw();
          markRowBusy(id, true);
        }

        CBA.data.gardenTask(op, id, extra || {}, function (res) {
          delete busyIds[id];
          markRowBusy(id, false);
          if (!res || !res.ok) {
            /* גלגול אחורה. בלעדיו הכרטיס נשאר מסומן אחרי כשל, והמשתמש
               מאמין שהעבודה נרשמה — טעות שמתגלה רק שבוע אחרי. */
            if (applied && snapshot) {
              Object.keys(snapshot).forEach(function (k) { t[k] = snapshot[k]; });
              delete justActed[id];
              draw();
            }
            CBA.ui.alert((res && res.error) || "הפעולה לא הצליחה");
            return;
          }
          if (op === "done") CBA.ui.toast(wasReport ? "נסגר · נשלח עדכון למדווח" : "סומן כבוצע");
          if (op === "undo") {
            CBA.ui.toast(wasClosure && wasClosure !== "בוצע"
              ? 'נפתחה מחדש · הסגירה ("' + wasClosure + '") בוטלה'
              : "הסימון בוטל");
          }
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
            /* שיבוץ מזיז את המשימה בין רשימות, ולכן הוא היחיד שחייב רענון
               מיידי — הצגה אופטימית שלו הייתה מנחשת לאיזו קבוצה היא נופלת. */
            scheduleReload(0);
            return;
          }
          scheduleReload();
        });
      }

      /* רענון מושהה. כל לחיצה נוספת דוחפת את המועד קדימה, כך שרצף סימונים
         מסתיים ברענון אחד. 900ms נבחרו כדי שיהיו ארוכים מקצב לחיצה סביר
         וקצרים מספיק שהמסך יתיישר לפני שהמשתמש מספיק לשים לב. */
      function scheduleReload(ms) {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(load, ms === undefined ? 900 : ms);
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
        /* גיליון אחד משותף — Escape, מלכודת מיקוד, נעילת גלילה ושומר
           כפילות יושבים ב-CBA.ui.mountSheet (ממצאים 23 · 24 · 27). */
        var sheetClose = CBA.ui.mountSheet(wrap, { key: "gt-week" });
        function close() { sheetClose(); }
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
        /* גיליון אחד משותף — Escape, מלכודת מיקוד, נעילת גלילה ושומר
           כפילות יושבים ב-CBA.ui.mountSheet (ממצאים 23 · 24 · 27). */
        var sheetClose = CBA.ui.mountSheet(wrap, { key: "gt-sheet:" + label });
        function close() { sheetClose(); }
        if (onPick) wrap.addEventListener("click", function (e) { onPick(e, close); });
        return close;
      }

      /* openSort() הוסרה (2026-09-09, גל 2) יחד עם כפתור הסידור;
         SORTS/sortDef הוסרו אחריה (2026-09-21) אחרי שהתברר שאיש לא הגיע
         אליהם. הקיבוץ היחיד שנשאר הוא weekGroup(), והוא משרת את "סגורות". */

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
            '<span>מישהו דיווח על זה מהאפליקציה. יש לו מספר דיווח, והוא מקבל עדכון בסיום.</span></div></div>' +
          /* 🔴 הדגל החדש (2026-09-21). הוא נכנס למקרא באותה נשימה שבה הוא
             נכנס לכרטיס — זה הכלל בראש openLegend, וסימן בלי הסבר הוא בדיוק
             מה שהמקרא קיים כדי למנוע. */
          '<div class="gt-lgi"><u><span class="gt-lgf"></span></u><div><b>פינה בורדו</b>' +
            '<span>אותו דבר, רק גלוי ממרחק: כרטיס עם פינה בורדו משמאל־למעלה הגיע מתושב, ' +
            'גם כשהוא כבר משובץ לשבוע בתוך רשימת העבודה.</span></div></div>' +
          /* ⚠️ נכנס למקרא באותה נשימה שבה הוא נכנס לכרטיס — זה הכלל
             בראש openLegend, וסימן בלי הסבר הוא מה שהמקרא בא למנוע. */
          '<div class="gt-lgi"><u><span class="gt-lgf is-team"></span></u><div><b>פינה כחולה</b>' +
            '<span>תקלה שהצוות פתח בעצמו, לא דייר. מטופלת בדיוק כמו תקלת דייר — ' +
            'רק שאין מי שמחכה לתשובה, ולכן אין מייל ואין שאלת מעקב.</span></div></div>' +
          '<div class="gt-lgi"><u>' + ico("repeat") + '</u><div><b>' + esc(GL.T.routine) + '</b>' +
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
            /* ⚠️ 2026-09-09, גל 3 — הסימון סוגר הכול. מה שנשאר להסביר הוא
               ההבדל היחיד שנותר: דיווח תושב דורש משפט על מה נעשה. */
            esc(isManager
              ? "סימון ביצוע — הוא גם סוגר. בדיווח של תושב תתבקש לכתוב מה נעשה, והמשפט נשלח אליו."
              : "לחיצה מסמנת שביצעת וסוגרת. בדיווח של תושב תתבקש לכתוב מה נעשה, והמשפט נשלח אליו.") +
            '</span></div></div>' +
          (isManager
            ? '<div class="gt-lgi"><u><span class="gt-box is-approve" style="width:22px;height:22px;margin:0">' +
              ico("check") + '</span></u><div><b>ירוקה</b>' +
              '<span>אישור, ורק בדיווח של תושב. הלחיצה סוגרת ושולחת לו עדכון.</span></div></div>' +
              '<div class="gt-lgi"><u><span class="gt-cbox" style="width:22px;height:22px;margin:0">' +
              ico("check") + '</span></u><div><b>אפורה</b>' +
              '<span>נסגרה. משימת שגרה נשארת פתוחה לערעור שבועיים — «לא בוצע כמו שצריך» ' +
              'בתפריט פותחת אותה מחדש.</span></div></div>'
            : '') +
          /* כפתור סגירה מפורש. שאר הגיליונות נסגרים בלחיצה על הרקע, אבל
             המקרא גבוה ~700px ובטלפון הוא כמעט ממלא את המסך — הרקע שנשאר
             הוא רצועה דקה שקשה לפגוע בה. */
          '<button type="button" class="gd-cta" data-close="1" ' +
            'style="margin-top:16px">סגירה</button>',
          function (e, close) { if (e.target.closest("[data-close]")) close(); });
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
          "משימה #" + id + " תיסגר, והדיווח שלה יצורף ל" + GL.reportRef(t.dupOf.repId || t.dupOf.id) + ".\n\n" +
          "המדווח יקבל מייל שמסביר את האיחוד, ובהמשך גם את הודעת הסיום.", {
            title: "איחוד עם " + GL.reportRef(t.dupOf.repId || t.dupOf.id), okText: "אחד"
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
      /* טופס פתיחת משימה. מאז 22.9 זה **אותו רכיב** שמשרת גם את תוכנית
         העבודה (js/ui/gardenForm.js) — היו כאן שני טפסים לאותו דבר,
         והם כבר הספיקו לסטות זה מזה בכותרות, בסדר השדות ובניסוח.
         ההבדל היחיד בין שני המסכים הוא הפריסט של המתג. */
      function openNewTask() {
        CBA.gardenForm.open({
          mode: "task",
          cats: order.type.length ? order.type : [],
          areas: order.area.length ? order.area : [],
          ico: ico, catOf: catOf, esc: esc,
          weeks: [
            { v: shiftKey(todayKey(), 0), label: "השבוע · " + weekLabel(shiftKey(todayKey(), 0)) },
            { v: shiftKey(todayKey(), 1), label: "שבוע הבא" },
            { v: "", label: "בלי שבוע — לשיבוץ" }
          ],
          onSaved: function () {
            // קופצים לרשימה שבה היא באמת נחתה, אחרת היא "נעלמת" מול העיניים
            filter = "open";
            load();
          }
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
            '<p class="sub">' +
              (t.repId ? esc(GL.reportRef(t.repId)) + ' · ' : '') + esc(t.category || "") +
              (t.area ? ' · ' + esc(t.area) : '') + '</p>' +
            '<button type="button" class="gt-opt" data-m="hist"><u>' + ico("hist") + '</u>' +
              '<div>היסטוריה<span>כל מה שקרה למשימה, לפי הסדר</span></div></button>' +
            /* ⚠️ על משימה סגורה השרת דוחה כל פעולה חוץ מערעור, "טופל" ומחיקה
               (ר' המשמר ב-gardenTaskAction_). כפתור שמחזיר "המשימה כבר נסגרה"
               הוא כפתור מת, ולכן שלוש הפעולות האלה פשוט לא מוצגות שם. */
            (t.closure ? '' :
              '<button type="button" class="gt-opt" data-m="note"><u>' + ico("note") + '</u>' +
                '<div>הערת ביצוע<span>מה נעשה בפועל — נשמר ביומן</span></div></button>' +
              '<button type="button" class="gt-opt" data-m="defer"><u>' + ico("cal") + '</u>' +
                '<div>דחייה לשבוע הבא<span>תסומן "נגררה" ותעלה בראש הרשימה</span></div></button>' +
              (isManager ? ''
                : '<button type="button" class="gt-opt" data-m="block"><u>' + ico("clock") + '</u>' +
                  '<div>לא ניתן לביצוע<span>עובר למנהל הגינון עם הסיבה</span></div></button>')) +
            /* פעולות המנהל. "החזרה להשלמה" מוצעת רק כשיש מה להחזיר — כלומר
               כשהצוות כבר סימן ביצוע וזה ממתין לאישור. */
            (isManager && (t.flag === "ממתין לאישור" || canDispute(t) || t.closure)
              ? '<button type="button" class="gt-opt" data-m="return"><u>' + ico("undo") + '</u>' +
                '<div>' + (t.closure ? "לא בוצע כמו שצריך" : "החזרה להשלמה") +
                '<span>' + (t.closure
                  ? "פותחת מחדש וחוזרת לצוות עם מה שחסר"
                  : "חוזרת לצוות עם מה שחסר") + '</span></div></button>'
              : '') +
            /* "סימנתי בטעות" — למי שסימן, בתוך אותו חלון. */
            (canDispute(t)
              ? '<button type="button" class="gt-opt" data-m="undo"><u>' + ico("undo") + '</u>' +
                '<div>ביטול סימון<span>המשימה חוזרת להיות פתוחה</span></div></button>'
              : '') +
            /* ⚠️ "פתיחה מחדש" — סמכות מנהל, בלי הגבלת זמן (17.9, ממצא 22).
               זו הפעולה שהופכת סגירה בסיבה שגויה להפיכה. היא מוצגת רק כשאין
               כבר "ביטול סימון" למעלה, כדי לא להציע שתי דרכים לאותו דבר. */
            (isManager && t.closure && !canDispute(t)
              ? '<button type="button" class="gt-opt" data-m="reopen"><u>' + ico("undo") + '</u>' +
                '<div>פתיחה מחדש<span>מבטלת את הסגירה — המשימה חוזרת לעבודה</span></div></button>'
              : '') +
            (isManager && !t.closure
              ? '<button type="button" class="gt-opt" data-m="close"><u>' + ico("check") + '</u>' +
                '<div>סגירה עם סיבה<span>הועבר לבינוי · בוטל · לא רלוונטי</span></div></button>'
              : '') +
            /* ⚠️ הפעולה היחידה שמותרת גם על משימה סגורה. משוב שלילי של תושב
               מרים "דורש בדיקה חוזרת" גם על משימה שכבר נסגרה, ובלי הכפתור
               הזה הדגל נשאר דלוק לנצח וכל פעולה אחרת נענית "כבר נסגרה". */
            (isManager && t.flag === "דורש בדיקה חוזרת"
              ? '<button type="button" class="gt-opt" data-m="clearflag"><u>' + ico("check") + '</u>' +
                '<div>טופל<span>מוריד את סימון הבדיקה החוזרת</span></div></button>'
              : '') +
            /* ⚠️ מחיקה **אינה** סגירה. סגירה אומרת שהטיפול הסתיים והשורה
               נשארת ונספרת; מחיקה אומרת שהשורה לא הייתה צריכה להיווצר, והיא
               יורדת מהגיליון ומהנתונים. היומן נשאר שלם. ר' gardenTaskDelete_. */
            /* 🔴 22.9 (סימולציה, ממצא E) — **מופע שגרה מבוטל, לא נמחק.** מסמך
               שנמחק משאיר סלוט ריק והמנוע יוצר אותו מחדש תוך שעה; ביטול הוא
               מצבה שהמנוע מכבד והמסך מסתיר ב"סגורות". ר' gardenTaskDelete. */
            (isManager && !t.closure
              ? '<button type="button" class="gt-opt is-danger" data-m="del"><u>' +
                ico("trash") + '</u><div>' +
                (t.kind === "שגרה" ? "ביטול המופע הזה" : "מחיקה") +
                '<span>' + (t.kind === "שגרה"
                  ? "נסגר כ\"בוטל\" ויורד מהרשימה · התבנית ממשיכה כרגיל"
                  : t.repId
                    ? "התושב יראה \"נסגר\" ויקבל מייל עם הסיבה · יורדת מהנתונים"
                    : "יורדת מהנתונים · נרשמת ביומן") +
                '</span></div></button>'
              : isManager
                ? '<button type="button" class="gt-opt is-danger" data-m="del"><u>' +
                  ico("trash") + '</u><div>מחיקה' +
                  '<span>יורדת מהנתונים · נרשמת ביומן</span></div></button>'
                : '') +
          '</div>';
        /* גיליון אחד משותף — Escape, מלכודת מיקוד, נעילת גלילה ושומר
           כפילות יושבים ב-CBA.ui.mountSheet (ממצאים 23 · 24 · 27). */
        var sheetClose = CBA.ui.mountSheet(wrap, { key: "gt-menu" });
        function close() { sheetClose(); }
        wrap.addEventListener("click", function (e) {
          var b = e.target.closest("[data-m]");
          if (!b) return;
          var m = b.dataset.m;
          close();
          menuAction(t, cat, m);
        });
      }

      /* פעולות ה-⋯ ושל כרטיס הפרטים חולקות את אותה פונקציה ממש. עד עכשיו היא
         ישבה רק כ-listener פנימי ב-openMenu; עכשיו גם openDetails() קורא לה, כדי שכפתורי
         הפעולה (מה נשלח לשרת, איזה שאלה נשאלת) יישאר אחד, ולא יוכפל להסטות
         בין מקורות הקריאה השונים. */
      function menuAction(t, cat, m) {
        if (m === "hist") return openHistory(t.id);
        if (m === "note") {
          // CBA.ui.prompt מחזירה Promise (null בביטול), לא מקבלת callback
          CBA.ui.prompt("ההערה נשמרת ביומן המשימה ונשארת גלויה למנהל.", {
            title: "הערת ביצוע", value: t.note || "",
            placeholder: "למשל: נגזם, הגזם פונה למחרת", okText: "שמירה"
          }).then(function (txt) { if (txt !== null) run("note", t.id, { note: txt }); });
        }
        if (m === "clearflag") return run("clearflag", t.id, {});
        if (m === "undo") return run("undo", t.id, {});
        if (m === "reopen") {
          /* אישור, ולא לחיצה אחת: זו פעולה שמבטלת החלטה שכבר נשלחה לתושב
             במייל. הסיבה נשמרת ביומן — היא כל מה שיסביר בעוד חודש למה
             משימה שנסגרה כ"בוטל" פתוחה שוב. */
          CBA.ui.prompt(
            'הסגירה ("' + (t.closure || "") + '") תבוטל והמשימה תחזור לרשימת ' +
            'הפתוחות. מה שנרשם ביומן יישאר, ותיווסף שורת פתיחה מחדש.' +
            /* ⚠️ נאמר מראש ולא מתגלה אחרי: התושב כבר קיבל מייל סיום, והמייל
               הזה הוא מה שמתקן אותו. מנהל שלא יודע שזה קורה עלול לפתוח
               ולסגור כדי "לתקן משהו קטן" ולשלוח לתושב שני מיילים. */
            (t.kind === GK_REPORT
              ? ' התושב שדיווח יקבל על כך עדכון במייל, ומה שתכתוב כאן ייכנס אליו.'
              : ''), {
              title: "פתיחה מחדש",
              placeholder: t.kind === GK_REPORT
                ? "למשל: נסגר בטעות, הטיפול לא הושלם"
                : "למשל: נסגר בטעות בסיבה לא נכונה",
              okText: "פתיחה מחדש"
            }).then(function (why) {
              if (why === null) return;
              run("undo", t.id, { note: why });
            });
          return;
        }
        if (m === "del") {
          var isRoutine = t.kind === "שגרה" && !t.closure;
          CBA.ui.prompt(
            isRoutine
              ? "המופע הזה ייסגר כ\"בוטל\" ויעבור ל\"סגורות\". התבנית בתוכנית העבודה " +
                "ממשיכה לייצר את המופעים הבאים כרגיל. הסיבה נרשמת ביומן."
              : t.repId && !t.closure
                ? "הדיווח של התושב ייסגר (\"בוטל\") עם הסיבה שתכתוב — הוא יראה את זה " +
                  "באפליקציה ויקבל מייל. המשימה עצמה תרד מהנתונים; היומן יישאר."
                : "המשימה תרד מהנתונים. מה שכבר נרשם ביומן יישאר, " +
                  "ותיווסף שורת מחיקה עם הסיבה שתכתוב.", {
              title: isRoutine ? "ביטול מופע שגרה" : "מחיקת משימה",
              placeholder: isRoutine ? "למשל: הגשם עשה את העבודה" : "למשל: שורת בדיקה",
              okText: isRoutine ? "ביטול המופע" : "מחיקה", danger: true
            }).then(function (why) {
              if (!why) return;
              if (busy) return;
              busy = true;
              CBA.data.gardenTaskDelete(t.id, why, function (res) {
                busy = false;
                if (!res || !res.ok) {
                  return CBA.ui.alert((res && res.error) || "המשימה לא נמחקה");
                }
                CBA.ui.toast(res.cancelled ? "המופע בוטל"
                           : res.pending ? "נמחקה — התמונות ינוקו ברקע" : "נמחקה");
                load();
              });
            });
          return;
        }
        if (m === "defer") {
          CBA.ui.confirm("המשימה תעבור לשבוע הבא ותסומן \"נגררה\".").then(function (yes) {
            if (yes) run("defer", t.id, {});
          });
        }
        if (m === "return") {
          CBA.ui.prompt(t.closure
            ? "המשימה תיפתח מחדש ותחזור לצוות עם מה שחסר. הסגירה שלה תבוטל."
            : "המשימה תחזור לצוות עם הדגל \"הוחזר להשלמה\".", {
            title: t.closure ? "מה לא בוצע?" : "מה חסר?",
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
      }

      /* סגירה שאינה "בוצע". שלוש הסיבות מהאפיון; "בוצע" לא מופיע כאן כי הוא
         כפתור האישור עצמו, והוא היחיד ששולח מייל לתושב. */
      function askClosure(t) {
        /* הסבר לתושב נדרש רק כשיש תושב מאחורי הפנייה. משימת שגרה או יזומה
           נסגרת בלחיצה אחת — אין למי לכתוב. */
        var isReport = t.kind === GK_REPORT;
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
            '<p class="sub">' + esc(t.title || t.category || "משימה") + '</p>' +
            reasons.map(function (o) {
              return '<button type="button" class="gt-opt" data-cl="' + esc(o.k) + '"><u>' +
                ico("check") + '</u><div>' + esc(o.k) +
                '<span>' + esc(o.sub) + '</span></div></button>';
            }).join("") +
            /* ⚠️ שלב שני, ולא שדה שמופיע מראש: קודם בוחרים סיבה, ורק אז
               כותבים לתושב. טופס שמציג הכול בבת אחת גורם לדלג על הכתיבה —
               והכתיבה היא כל העניין. לדיווח תושב היא חובה, וגם בשרת. */
            (isReport
              ? '<div id="gt-why" hidden style="margin-top:14px">' +
                  '<label class="gd-lbl">מה לכתוב לתושב <s>*</s></label>' +
                  '<textarea class="gd-inp" id="gt-why-t" rows="3" maxlength="600" ' +
                    'placeholder="למשל: בדקנו בשטח — העץ תקין ואינו מהווה סכנה."></textarea>' +
                  '<p class="gp-note">זה ייצא אליו במייל ויופיע לו באפליקציה. ' +
                  '"בוטל" לבדו אינו תשובה.</p>' +
                  '<button type="button" class="gd-cta" id="gt-why-go" ' +
                    'style="margin-top:12px">סגירה ושליחה</button>' +
                '</div>'
              : '') +
          '</div>';
        /* גיליון אחד משותף — Escape, מלכודת מיקוד, נעילת גלילה ושומר
           כפילות יושבים ב-CBA.ui.mountSheet (ממצאים 23 · 24 · 27). */
        var sheetClose = CBA.ui.mountSheet(wrap, { key: "gt-closure", sticky: true });
        function close() { sheetClose(); }
        var picked = "";
        wrap.addEventListener("click", function (e) {
          var b = e.target.closest("[data-cl]");
          if (b) {
            if (!isReport) { close(); return run("close", t.id, { closure: b.dataset.cl }); }
            picked = b.dataset.cl;
            Array.prototype.forEach.call(wrap.querySelectorAll("[data-cl]"), function (x) {
              x.classList.toggle("is-picked", x === b);
            });
            wrap.querySelector("#gt-why").hidden = false;
            wrap.querySelector("#gt-why-t").focus();
            return;
          }
          if (!e.target.closest("#gt-why-go")) return;
          var why = wrap.querySelector("#gt-why-t").value.trim();
          if (!why) return CBA.ui.alert("צריך לכתוב לתושב מה הסיבה");
          close();
          run("close", t.id, { closure: picked, note: why });
        });
      }

      /* גלילה/החלקה על גיליון שאין לו בכלל מה לגלול (התוכן קטן מהגובה שלו)
         סוגרת אותו — בדיוק כמו לחיצה על הרקע, רק בלי לצאת מהאצבע/מהעכבר
         (יועד, 15.9). כשיש בפועל מה לגלול (תוכן ארוך) לא מתערבים — אחרת
         גלילה לגיטימית הייתה סוגרת את הגיליון על המשתמש. חצי שנייה של
         דחייה בהתחלה כדי שתנופת האנימציה של הפתיחה עצמה לא תיספר כבקשת
         סגירה. */
      /* ---------------------------------------------------------------------
         כרטיס פרטים לדיווח תושב (2026-09-15, עודכן לפי הערות יועד על הגרסה
         הראשונה). לחיצה על גוף השורה — לא על התיבה, לא על ⋮ — פותחת אותו.
         הוא **לא** מנגנון שרת חדש: כל שדה מגיע מאותו אובייקט משימה שכבר
         בזיכרון, כל פעולה עוברת דרך run()/menuAction() הקיימים, וה-⋯ נשאר
         בדיוק כמו שהיה (4 פעולות מהירות, בלי מפה — המפה עברה לכאן). מוצג רק
         לדיווחי תושב (GK_REPORT); ר' השער ב-onCardClick. */
      function openDetails(id) {
        var t = byId(id);
        if (!t) return;
        var cat = catOf(t.category);
        var closed = !!t.closure;
        var st = GL.state(t, isManager ? "manager" : "gardener");
        var hasMap = (t.x !== null && t.x !== undefined && t.y !== null && t.y !== undefined);
        var hasPhotos = !!(t.photos && t.photos.length);
        var planning = !closed && !t.week;
        var done = t.flag === "ממתין לאישור";

        /* שורת פעולה מהירה (2026-09-15, סבב ד׳) — שלושה כפתורים באותה שורה:
           יועד: "שיבוץ (שהופך לסימון כבוצע, שגם הוא כפתור שלא צריך אם יש
           כפתור סגירה)... אפשר לצמצם (לשיבוץ / סגירה, דווח סטטוס, דחייה)".
           למנהל, שיש לו סגירה ישירה בכל שלב, הסלוט הראשי הוא רק "שיבוץ" (כשאין שבוע)
           או "סגירה" (בכל מצב אחר) — בלי מצבי הביניים אישור/סימון-כבוצע/ביטול-סימון,
           שהופכים למיותרים כשיש סגירה ישירה. לגנן, שאין לו סגירה, נשאר הזרם הקודם:
           שיבוץ→סימון כבוצע→ביטול. */
        var slotHtml = "";
        if (!closed) {
          if (planning) {
            slotHtml = '<button type="button" class="gd-det-cta" data-m="plan">' +
              ico("cal") + 'שיבוץ</button>';
          } else if (isManager) {
            slotHtml = '<button type="button" class="gd-det-cta is-positive" data-m="close">' +
              ico("check") + 'סגירה</button>';
          } else if (done) {
            slotHtml = '<button type="button" class="gd-det-cta is-ghost" data-m="undo">' +
              ico("undo") + 'ביטול סימון</button>';
          } else {
            slotHtml = '<button type="button" class="gd-det-cta" data-m="markdone">' +
              ico("check") + 'סימון כבוצע</button>';
          }
        }
        var quickHtml = !closed
          ? '<div class="gd-det-quickrow">' + slotHtml +
              '<button type="button" class="gd-det-b" data-m="note">' + ico("note") + 'דווח סטטוס</button>' +
              '<button type="button" class="gd-det-b" data-m="defer">' + ico("cal") + 'דחייה</button>' +
            '</div>'
          : "";

        /* פעולות משניות — נדירות יותר, שורה נפרדת מתחת לשורה המהירה. "סגירה"
           למנהל עברה לשורה המהירה (למעלה) ואינה חוזרת כאן. */
        var secHtml = "";
        if (!closed && !isManager) {
          secHtml += '<button type="button" class="gd-det-b" data-m="block">' + ico("clock") + 'לא ניתן לביצוע</button>';
        }
        if (isManager && t.flag === "ממתין לאישור") {
          secHtml += '<button type="button" class="gd-det-b" data-m="return">' +
            ico("undo") + 'החזרה להשלמה</button>';
        }
        if (isManager && t.flag === "דורש בדיקה חוזרת") {
          secHtml += '<button type="button" class="gd-det-b" data-m="clearflag">' +
            ico("check") + 'טופל</button>';
        }
        /* ⚠️ 17.9, ממצא 20 — כרטיס הפרטים של דיווח סגור הציע למנהל מחיקה
           בלבד. זה בדיוק הכרטיס שיושב בתור "דורש החלטה" אחרי משוב שלילי,
           ושתי ההחלטות האמיתיות שם — להחזיר לצוות או לפתוח מחדש — לא היו
           קיימות בו. "פתיחה מחדש" מדלגת כשהערעור כבר מציע ביטול סימון. */
        if (isManager && closed) {
          secHtml += '<button type="button" class="gd-det-b" data-m="return">' +
            ico("undo") + 'לא בוצע כמו שצריך</button>';
          if (!canDispute(t)) {
            secHtml += '<button type="button" class="gd-det-b" data-m="reopen">' +
              ico("undo") + 'פתיחה מחדש</button>';
          }
        }
        if (isManager) {
          secHtml += '<button type="button" class="gd-det-b is-danger" data-m="del">' +
            ico("trash") + 'מחיקה</button>';
        }

        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap is-detail";
        wrap.innerHTML =
          '<div class="gt-sheet-bd"></div>' +
          '<div class="gt-sheet gd-det" role="dialog" aria-label="' + esc(t.title || "משימה") + '">' +
            '<div class="gt-grip" aria-hidden="true"></div>' +
            /* כותרת+סגירה מוזגו לשורה אחת (2026-09-15, סבב ד׳) — יועד: "כפתור
               סגירה שתופס מרווח אפשר לשים באותה שורה של הכותרת". השורה
               נבנית מתחת ל-.gd-det-kicker (למטה) כדי שהקטגוריה תישאר מעל לכותרת, לא
               בתוך השורה עצמה. */
            /* הכותרת עוברת מעל התמונה, לפי יועד — כך שהעין פוגשת קודם מה
               התקלה ומאיפה, ורק אז את מה שהתושב צילם. "נפתח" זז מהרשת
               למטה לשורת התיאור, מיד אחרי מספר הפנייה. */
            '<div class="gd-det-kicker"><span class="gd-det-dot" style="background:var(--c-' +
              esc(cat.key) + ')"></span>' + esc(t.category || "") + ' · ' +
              esc(isTeamFault(t) ? "תקלה · מנהל" : GL.T.report) + '</div>' +
            '<div class="gd-sheet-head gd-det-head">' +
              '<h4 class="gd-det-title" data-title-toggle="1">' + esc(t.title || t.category || "משימה") + '</h4>' +
              '<button type="button" class="gd-sheet-close" data-close="1">' + ico("x") + 'סגירה</button>' +
            '</div>' +
            '<p class="gd-det-sub">' +
              (t.repId ? esc(GL.reportRef(t.repId)) : "") +
              (t.createdAt ? (t.repId ? ' · ' : '') + esc(ago(t.createdAt)) : '') +
            '</p>' +
            (hasPhotos
              ? '<div class="gd-det-photo" id="gd-det-photo" data-m="photos">' +
                  '<div class="spinner" id="gd-det-photo-spin"></div>' +
                  '<button type="button" class="gd-det-photo__cnt" data-m="photos">' +
                    ico("camera") + ' ' + t.photos.length + '</button>' +
                '</div>'
              : '<div class="gd-det-nophoto">' + ico("camera") + '<span>לא צורפה תמונה</span></div>') +
            /* מצב+שבוע מוזגו לשורה קטנה אחת (2026-09-15, סבב ד׳). */
            '<div class="gd-det-staterow">' +
              '<span class="gd-det-chip is-' + esc(st.tone || "plan") + '">' + esc(st.text) + '</span>' +
              '<span class="gd-det-week">' + (t.week ? esc(weekLabel(t.week)) : 'לשיבוץ') + '</span>' +
            '</div>' +
            (t.area
              ? '<div class="gd-det-fields"><div class="gd-det-f"><span class="l">אזור</span><span class="v">' + esc(t.area) + '</span></div></div>'
              : '') +
            (hasMap
              ? '<div class="gd-det-mapbox" data-m="fullmap"><div class="gd-map" id="gd-det-map"></div>' +
                  /* כפתור "מרכז לנעיצה" גם במפה הקטנה (2026-09-15, סבב ד') — אותה
                     CBA.map.centerOnPin() כמו במפה המלאה; stopPropagation משלו
                     כדי שהקליק לא יבעבע ל-data-m="fullmap" של ההורה. */
                  '<button type="button" class="gd-map-recenter gd-map-recenter--sm" id="gd-det-map-recenter" title="מרכז לנעיצה">' + ico("pin") + '</button>' +
                  '<span class="gd-det-mapbox__hint">' + ico("expand") + '</span></div>'
              : '') +
            (t.note ? '<div class="gt-note">' + esc(t.note) + '</div>' : '') +
            (closed
              ? '<div class="gd-rep__closed"><b>' + esc(t.closure) + '</b>' +
                  (t.approvedAt
                    ? '<span>' + esc(ago(t.approvedAt)) + (t.approvedBy ? ' · ' + esc(t.approvedBy) : '') + '</span>'
                    : '') +
                '</div>'
              : '') +
            /* יומן מצומצם — שתי הפעולות האחרונות בלבד, עם כפתור "היסטוריה
               מלאה" **על אותה שורה** בדיוק כמו שיועד ביקש; ה-openHistory()
               הקיים נשאר האחראי היחיד על התצוגה המלאה. */
            '<div class="gd-det-journal">' +
              '<div class="gd-det-journal__h"><span>מה קרה עד עכשיו</span>' +
                '<button type="button" class="gd-det-journal__more" data-m="hist">' +
                  ico("hist") + 'היסטוריה מלאה</button></div>' +
              '<div class="gd-det-journal__list" id="gd-det-j-list">' +
                '<div class="skeleton sk-line sk-sm" style="width:65%"></div>' +
                '<div class="skeleton sk-line sk-sm" style="width:45%;margin-top:6px"></div>' +
              '</div>' +
            '</div>' +
            '<div class="gd-det-actions">' + quickHtml +
              (secHtml ? '<div class="gd-det-secrow">' + secHtml + '</div>' : '') +
            '</div>' +
          '</div>';
        /* גיליון אחד משותף — Escape, מלכודת מיקוד, נעילת גלילה ושומר
           כפילות יושבים ב-CBA.ui.mountSheet (ממצאים 23 · 24 · 27). */
        var sheetClose = CBA.ui.mountSheet(wrap, { key: "gt-details" });
        function close() { sheetClose(); }
        wrap.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) close(); });

        /* תמונה ראשונה בלבד, כתצוגה מקדימה — בדיוק כמו photos.js, דרך אותה
           קריאת שרת (getGardenPhoto) ואותו מטמון. הגלריה המלאה (כל התמונות,
           מסך מלא) נפתחת בנפרד בלחיצה על התמונה או על מונה התמונות. עיגול
           הטעינה הוא אותו .spinner שמופיע במסך ההתחברות — אותה שפת עיצוב. */
        if (hasPhotos) {
          var phEl = wrap.querySelector("#gd-det-photo");
          var spinEl = wrap.querySelector("#gd-det-photo-spin");
          CBA.data.getGardenPhoto(t.photos[0], function (res) {
            if (!phEl || !phEl.parentNode) return;      // הגיליון נסגר בזמן הטעינה
            if (spinEl && spinEl.parentNode) spinEl.parentNode.removeChild(spinEl);
            if (res && res.ok && res.url) {
              phEl.style.backgroundImage = "url('" + res.url + "')";
              phEl.classList.add("has-img");
            } else {
              phEl.classList.add("is-err");
            }
          });
        }
        /* אותה קריאה בדיוק ל-CBA.map כמו showOnMap — תצוגה בלבד, בלי חיפוש,
           אבל פאן/זום עובדים כרגיל ברכיב המפה המשותף. לחיצה על תיבת המפה
           פותחת את showOnMap() כתצוגת מסך-מלא עם כפתור חזרה (ר' data-m="fullmap"). */
        if (hasMap && CBA.map) {
          var mapApi = CBA.map.render(wrap.querySelector("#gd-det-map"), {
            head: false, search: false, legend: false, hint: false, popup: false,
            pinAt: { x: t.x, y: t.y }
          });
          if (mapApi) setTimeout(function () { if (mapApi.centerOnPin) mapApi.centerOnPin(); else if (mapApi.fit) mapApi.fit(); }, 60);
          var recenterSmBtn = wrap.querySelector("#gd-det-map-recenter");
          if (recenterSmBtn) recenterSmBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            if (mapApi && mapApi.centerOnPin) mapApi.centerOnPin();
          });
        }
        /* כותרת ארוכה נחתכת (ellipsis) בשורה עם כפתור הסגירה — לחיצה
           עליה פותחת אותה במלואה, שוב תחתכו בלחיצה נוספת (יועד, סבב ד׳). */
        var titleEl = wrap.querySelector("[data-title-toggle]");
        if (titleEl) titleEl.addEventListener("click", function (e) {
          e.stopPropagation();
          titleEl.classList.toggle("is-expanded");
        });
        /* שתי הרשומות האחרונות מהיומן — אותה קריאת שרת בדיוק כמו openHistory,
           רק שמוצגות כאן רק שתי האחרונות; res.rows מגיע בסדר כרונולוגי עולה
           (הישנה קודם), ולכן slice(-2) נותן את שתי האחרונות באותו סדר תצוגה. */
        CBA.data.getGardenTaskLog(id, function (res) {
          var jEl = wrap.querySelector("#gd-det-j-list");
          if (!jEl || !jEl.parentNode) return;
          /* 🔴 **כשל וריק הם שני דברים** (2026-09-17, ממצא 02). עד היום שניהם
             הציגו "אין עדיין רשומות" — כלומר יומן שלא נטען נראה בדיוק כמו
             משימה שבאמת אין לה היסטוריה. זה מה שהפך את אבחון ממצא 28 לארוך:
             היומן "היה ריק" ואיש לא ידע אם זו האמת. */
          if (!res || !res.ok) {
            jEl.innerHTML = '<p class="gd-det-journal__none">לא הצלחנו לטעון את היומן.</p>';
            return;
          }
          if (!res.rows || !res.rows.length) {
            jEl.innerHTML = '<p class="gd-det-journal__none">אין עדיין רשומות למשימה הזאת.</p>';
            return;
          }
          jEl.innerHTML = res.rows.slice(-2).map(function (r) {
            var change = (r.from && r.to) ? esc(r.from) + " ← " + esc(r.to) : (r.to ? esc(r.to) : "");
            return '<div class="gd-det-j"><u>' + ico(LOG_ICON[r.kind] || "note") + '</u>' +
              '<b>' + esc(r.kind || "שינוי") + '</b>' +
              (r.note ? '<span>' + esc(r.note) + '</span>' : (change ? '<span>' + change + '</span>' : '')) +
              '<time>' + esc(ago(r.at)) + '</time></div>';
          }).join("");
        });

        wrap.addEventListener("click", function (e) {
          var b = e.target.closest("[data-m]");
          if (!b) return;
          var m = b.dataset.m;
          if (m === "photos") {
            if (CBA.photos) {
              CBA.photos.open(t.photos, "תמונות " + (t.repId ? GL.reportRef(t.repId) : "הדיווח"));
            }
            return;
          }
          if (m === "fullmap") return showOnMap(t, cat);
          close();
          if (m === "plan") return askWeek(id);
          if (m === "approve") return run("approve", id, {});
          if (m === "markdone") return markDone(id);
          menuAction(t, cat, m);
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
            /* כפתור חזרה מפורש (יועד: "מפה... לחיצה עליה מגדילה למסך מלא
               כולל כפתור חזרה") — אותו רכיב חזותי בדיוק כמו כפתור הסגירה
               בכרטיס הפרטים (gd-sheet-close), רק עם תווית/סמליל "חזרה". */
            '<div class="gd-sheet-head"><button type="button" class="gd-sheet-close" data-close="1">' +
              ico("prev") + 'חזרה</button><h4>' + esc(t.title || "משימה") + '</h4></div>' +
            '<p class="sub">' + esc(t.area || "") + '</p>' +
            '<div class="gd-map-wrap"><div class="gd-map" id="gt-map"></div>' +
              '<button type="button" class="gd-map-recenter" id="gt-map-recenter" title="מרכז לנעיצה">' +
                ico("pin") + '</button>' +
            '</div></div>';
        /* גיליון אחד משותף — Escape, מלכודת מיקוד, נעילת גלילה ושומר
           כפילות יושבים ב-CBA.ui.mountSheet (ממצאים 23 · 24 · 27). */
        var sheetClose = CBA.ui.mountSheet(wrap, { key: "gt-map" });
        function close() { sheetClose(); }
        wrap.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) close(); });
        if (CBA.map) {
          var api = CBA.map.render(wrap.querySelector("#gt-map"), {
            head: false, search: false, legend: false, hint: false, popup: false,
            pinAt: { x: t.x, y: t.y }
          });
          if (api) setTimeout(function () { if (api.centerOnPin) api.centerOnPin(); else if (api.fit) api.fit(); }, 60);
          var recenterBtn = wrap.querySelector("#gt-map-recenter");
          if (recenterBtn) recenterBtn.addEventListener("click", function () {
            if (api && api.centerOnPin) api.centerOnPin();
          });
        }
      }
    }
  };
})();
