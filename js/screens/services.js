/* מסך "שירותים" באזור התושב (2026-08-18).
   מציג את כרטיסי השירות שבטאב "שירותים לתושב" בגיליון — גז, אינטרנט, תקלות
   בינוי וכו' — וכל כרטיס נפתח ל-drawer עם כל הפרטים: תנאי שירות, מחירון,
   אנשי קשר עם כפתורי חיוג. פתוח לכל תושב מחובר; העריכה נמצאת במסך נפרד
   באזור הניהול (servicesAdmin, מנהל-על בלבד) — בדיוק כמו resCommittee מול
   committeeAdmin.

   CBA.serviceUtils (למטה) הוא הלוגיקה המשותפת בין המסך הזה למסך הניהול:
   פענוח פורמט התוכן וציור הסעיפים. חי כאן ולא בכל מסך בנפרד כדי ששני
   הצדדים יציירו את אותו סעיף אותו דבר בדיוק, ולא ייסחפו זה מזה עם הזמן
   (אותו שיקול כמו CBA.committee ב-dataService.js). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

/* ============================================================================
 *  לוגיקה משותפת — פענוח מבנה הנתונים וציור סעיפים
 * ----------------------------------------------------------------------------
 *  התוכן נשמר בגיליון בפורמט קריא-לעין ולא כ-JSON בתא (החלטה מודעת: אם משהו
 *  יישבר באפליקציה, אפשר עדיין לקרוא ולערוך הכול ידנית בגוגל-שיטס). הפורמט
 *  לכל "סוג" מתועד ליד parseSection למטה.
 * ========================================================================== */
CBA.serviceUtils = (function () {
  "use strict";

  var TYPES = ["טקסט", "רשימה", "טבלה", "אנשי קשר", "הדגשה", "שעות"];

  /* סוג השירות (2026-09-08) — ההבחנה שיועד ביקש בין ספק חיצוני (דורגז,
     אינטרנט) לבין תשתית ציבורית של השיכון (בריכה, מכון כושר, מגרשים).
     היא לא קוסמטית: לתשתית יש שעות ותקופת פתיחה ואין לה "ספק" לחייג
     אליו, ולכן היא נקראת אחרת ומוצגת בקבוצה נפרדת. ריק = ספק, כדי שכל
     השורות הקיימות בגיליון ימשיכו להתנהג בדיוק כמו קודם. */
  var KIND_INFRA = "תשתית ציבורית", KIND_VENDOR = "ספק חיצוני";
  var KINDS = [KIND_VENDOR, KIND_INFRA];

  /* ערוץ טלפון (2026-09-22) — יועד ביקש להבדיל בין טלפון רגיל, מוקד עסקי
     וואטסאפ, ושניהם. חל גם על "טלפון ראשי" (חדש — עד היום היה שם רק חיוג)
     וגם על מספרי "אנשי קשר" (עד היום שניהם תמיד, בלי אפשרות בחירה). ברירת
     המחדל שונה בכוונה בין השניים — ר' build()/toContacts() למטה — כדי
     שהתנהגות קיימת לא תשתנה בשקט. */
  var CH_PHONE = "טלפון", CH_WA = "וואטסאפ עסקי", CH_BOTH = "טלפון + וואטסאפ";
  var PHONE_CHANNELS = [CH_PHONE, CH_WA, CH_BOTH];

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  /* ממזג את שני הטאבים לרשימת אובייקטים נוחה: כל שירות עם מערך הסעיפים שלו
     כבר בתוכו, ממוין לפי "סדר". השרת מחזיר שתי טבלאות שטוחות — כל המסכים
     עובדים על התוצאה של הפונקציה הזאת, אף אחד לא נוגע בשורות הגולמיות. */
  function build(serviceRows, sectionRows) {
    var byId = {};
    var out = (serviceRows || []).map(function (r) {
      var svc = {
        id: String(r["מזהה שירות"] || "").trim(),
        name: String(r["שם"] || "").trim(),
        desc: String(r["תיאור קצר"] || "").trim(),
        icon: String(r["אייקון"] || "").trim(),
        // מזהה קטגוריה (2026-09-22) — הקישור העיקרי לקבוצה במסך התושב.
        // שורה ישנה שעדיין לא נערכה מאז שהתווסף העמודה: נגזר מהערך הישן
        // ב"סוג שירות" (KIND_INFRA/KIND_VENDOR), כך שאין צורך במיגרציה
        // חד-פעמית לגיליון — ר' הערה מקבילה ב-Code.gs.
        categoryId: String(r["מזהה קטגוריה"] || "").trim() ||
          (String(r["סוג שירות"] || "").trim() === KIND_INFRA ? "infra" : "vendor"),
        // נשאר לצורך תאימות-לאחור בלבד (טקסט ידידותי בגיליון) — לא נקרא
        // יותר בלקוח, רק מועבר הלאה כמו שהוא ב-flatten() כדי לא לאבד אותו.
        legacyKind: String(r["סוג שירות"] || "").trim(),
        provider: String(r["ספק"] || "").trim(),
        phone: String(r["טלפון ראשי"] || "").trim(),
        // ריק = CH_PHONE (חיוג בלבד) — ההתנהגות שהייתה קיימת לפני שהתווסף
        // כפתור וואטסאפ ל"טלפון ראשי".
        phoneChannel: String(r["ערוץ טלפון"] || "").trim() || CH_PHONE,
        doc: String(r["קישור למסמך"] || "").trim(),
        order: Number(r["סדר"] || 0) || 0,
        active: String(r["פעיל"] == null ? "כן" : r["פעיל"]).trim() !== "לא",
        /* ⚠️ רק התאריך, בלי השעה (2026-09-15). התא בגיליון הוא תאריך
           אמיתי, ולכן Apps Script מחזיר ISO מלא ("2026-09-13T07:00:00.000Z")
           ו-Firestore מחזיר "2026-09-13". חיתוך כאן מבטיח **ששני המסלולים
           מציגים אותו דבר** — ודרך אגב מסיר חותמת זמן גולמית
           שהוצגה למשתמש עד היום. */
        updated: String(r["עודכן"] || "").trim().slice(0, 10),
        updatedBy: String(r['עודכן ע"י'] || "").trim(),
        sections: []
      };
      byId[svc.id] = svc;
      return svc;
    });

    (sectionRows || []).forEach(function (r) {
      var ownerId = String(r["מזהה שירות"] || "").trim();
      var svc = byId[ownerId];
      // סעיף יתום (שירות שנמחק והסעיף נשאר) — מדלגים בשקט במקום להתרסק.
      // saveServices_ בשרת כבר דוחה מצב כזה, אז זה קורה רק אם מישהו ערך
      // את הגיליון ידנית.
      if (!svc) return;
      svc.sections.push({
        secId: String(r["מזהה סעיף"] || "").trim(),
        order: Number(r["סדר"] || 0) || 0,
        type: String(r["סוג"] || "").trim(),
        title: String(r["כותרת"] || "").trim(),
        content: String(r["תוכן"] || "")
      });
    });

    out.forEach(function (s) {
      s.sections.sort(function (a, b) { return a.order - b.order; });
    });
    out.sort(function (a, b) { return a.order - b.order; });
    return out;
  }

  /* הדרך ההפוכה — מהמבנה הנוח בחזרה לשתי טבלאות שטוחות לשמירה בשרת.
     "סדר" נכתב מחדש לפי המיקום בפועל במערך, כך שגרירה במסך הניהול היא
     מקור האמת היחיד (השרת עושה את אותו הדבר לכרטיסים, ר' saveServices_). */
  function flatten(services) {
    var svcRows = [], secRows = [];
    (services || []).forEach(function (s, i) {
      svcRows.push({
        "מזהה שירות": s.id, "שם": s.name, "תיאור קצר": s.desc,
        "אייקון": s.icon, "סוג שירות": s.legacyKind || "",
        "מזהה קטגוריה": s.categoryId || "vendor",
        "ספק": s.provider, "טלפון ראשי": s.phone, "ערוץ טלפון": s.phoneChannel || CH_PHONE,
        "קישור למסמך": s.doc, "סדר": i + 1, "פעיל": s.active ? "כן" : "לא",
        "עודכן": s.updated || "", 'עודכן ע"י': s.updatedBy || ""
      });
      (s.sections || []).forEach(function (sec, j) {
        secRows.push({
          "מזהה שירות": s.id,
          "מזהה סעיף": sec.secId || (s.id + "_s" + (j + 1)),
          "סדר": j + 1, "סוג": sec.type,
          "כותרת": sec.title, "תוכן": sec.content
        });
      });
    });
    return { services: svcRows, sections: secRows };
  }

  /* קטגוריות שירותים (2026-09-22) — אותו רעיון בדיוק כמו build()/flatten()
     למעלה, אבל לטבלה הקטנה הנפרדת: ממיר שורות גיליון גולמיות (מפתחות
     בעברית) לאובייקטים נוחים {id,name,icon,order,active}, וחזרה. גם מסך
     התושב (קיבוץ כרטיסים) וגם מסך הניהול (ניהול קטגוריות) עובדים על
     הצורה הנוחה, אף אחד לא נוגע בשורות הגולמיות. */
  function buildCategories(rows) {
    return (rows || []).map(function (r) {
      return {
        id: String(r["מזהה"] || "").trim(),
        name: String(r["שם"] || "").trim(),
        icon: String(r["אייקון"] || "").trim(),
        order: Number(r["סדר"] || 0) || 0,
        active: String(r["פעיל"] == null ? "כן" : r["פעיל"]).trim() !== "לא"
      };
    }).sort(function (a, b) { return a.order - b.order; });
  }
  function flattenCategories(list) {
    return (list || []).map(function (c, i) {
      return {
        "מזהה": c.id, "שם": c.name, "אייקון": c.icon || "",
        "סדר": i + 1, "פעיל": c.active ? "כן" : "לא"
      };
    });
  }

  /* פענוח "תוכן" לפי סוג — פונקציות טהורות, בלי DOM, כדי שגם עורך הסעיפים
     במסך הניהול ישתמש בהן ולא יפרש את הפורמט בעצמו:
       טקסט/הדגשה — טקסט חופשי; שורה ריקה כפולה = פסקה חדשה
       רשימה      — שורה = בולט
       טבלה       — תאים מופרדים ב-"|", שורה ראשונה = כותרות
       אנשי קשר   — שורה = "שם|תפקיד|טלפון" */
  function toLines(content) {
    return String(content || "").split("\n").filter(function (l) { return l.trim() !== ""; });
  }
  function toGrid(content) {
    return String(content || "").split("\n")
      .filter(function (l) { return l.trim() !== ""; })
      .map(function (r) { return r.split("|").map(function (c) { return c.trim(); }); });
  }
  function toContacts(content) {
    return toLines(content).map(function (l) {
      var p = l.split("|");
      // ריק = CH_BOTH — עד היום כל מספר איש-קשר הציג תמיד גם חיוג וגם
      // וואטסאפ, ולכן ברירת המחדל שומרת על ההתנהגות הקיימת בכל השורות
      // שכבר בגיליון.
      return {
        name: (p[0] || "").trim(), role: (p[1] || "").trim(), phone: (p[2] || "").trim(),
        channel: (p[3] || "").trim() || CH_BOTH
      };
    });
  }

  /* מנקה מספר טלפון לשימוש ב-tel:/wa.me — מסיר מקפים, רווחים וסוגריים.
     wa.me דורש קידומת בינלאומית בלי "+" ובלי 0 מוביל, ולכן 0 מוביל של מספר
     ישראלי מוחלף ב-972. מספר שכבר בא עם קידומת נשאר כמו שהוא. */
  function telDigits(phone) { return String(phone || "").replace(/[^\d+]/g, ""); }
  function waDigits(phone) {
    var d = telDigits(phone).replace(/^\+/, "");
    if (d.indexOf("972") === 0) return d;
    if (d.indexOf("0") === 0) return "972" + d.substring(1);
    return d;
  }

  /* ==========================================================================
   *  סעיף "שעות" — לוח פתיחה שהאפליקציה יודעת לקרוא (2026-09-08)
   * --------------------------------------------------------------------------
   *  למה סוג סעיף ולא עמודה: ככה זה נשאר בדיוק כמו כל שאר המודול — קריא לעין
   *  בגיליון, נערך באותו מסך ניהול, ומצויר באותו מנוע. תשתית ציבורית (בריכה,
   *  מכון כושר, מגרשים) היא בעיקר שעות ותקופה, ולכן זה הסעיף שנותן לה ערך.
   *
   *  הפורמט — שורה = "מפתח | ערך", בדיוק כמו סעיף "אנשי קשר":
   *      עונה | 15/05-30/09
   *      ראשון-חמישי | 06:00-08:00, 16:00-20:00
   *      שישי | 06:00-10:00
   *      שבת | סגור
   *      חריג | 02/10 | סגור
   *      חריג | 15/08 | 06:00-12:00
   *
   *  ⚠️ הכלל שמנחה את כל הקובץ הזה: **לעולם לא להמציא "פתוח"**. שורה שלא
   *     נקראה היא לא שורה שאפשר להתעלם ממנה — היא בדיוק עלולה להיות זו
   *     שאומרת שסגור היום. לכן:
   *       · שורת "עונה" או "חריג" שבורה  -> הסטטוס כולו "לפי הלוח" (unknown)
   *       · שורת יום שבורה               -> רק אותו יום unknown, השאר תקינים
   *     מנגנון שלא יכול להגיד "לא" הוא קישוט, ותג שאומר "פתוח" כשהבריכה
   *     סגורה גרוע מאין תג בכלל.
   *
   *  ⚠️ החישוב לפי שעון הדפדפן. תושב שפותח את האפליקציה מחו"ל יראה סטטוס לפי
   *     השעון שלו. זה מודע: הוספת אזור-זמן קשיח הייתה שוברת את המקרה שבו
   *     המכשיר דווקא כן בישראל אבל מוגדר אחרת, וזה המקרה הנפוץ מבין השניים.
   * ======================================================================== */

  var DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var DAY_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

  /* שם יום -> אינדקס 0..6, או null. מקבל "יום שלישי", "שלישי", "ג", "ג׳". */
  function dayIndex(word) {
    var w = String(word || "").trim().replace(/^יום\s+/, "").replace(/["'׳״]/g, "");
    var i = DAY_NAMES.indexOf(w);
    if (i >= 0) return i;
    i = DAY_SHORT.indexOf(w);
    return i >= 0 ? i : null;
  }

  /* "ראשון-חמישי" / "ראשון, שלישי" / "כל יום" -> מערך אינדקסים. null = לא הובן. */
  function parseDays(spec) {
    var s = String(spec || "").trim();
    if (!s) return null;
    if (/^(כל יום|כל השבוע|כל הימים|יומיומי)$/.test(s)) return [0, 1, 2, 3, 4, 5, 6];
    var out = [], parts = s.split(/\s*,\s*/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var m = p.split(/\s*[-–]\s*/);
      if (m.length === 2) {
        var a = dayIndex(m[0]), b = dayIndex(m[1]);
        if (a === null || b === null) return null;
        // טווח שעובר את סוף השבוע ("שישי-ראשון") מתגלגל, ולא מוחזר ריק
        for (var d = a; ; d = (d + 1) % 7) { out.push(d); if (d === b) break; }
      } else {
        var one = dayIndex(p);
        if (one === null) return null;
        out.push(one);
      }
    }
    return out.length ? out : null;
  }

  /* "06:00" -> 360 דקות מחצות. null = לא הובן. */
  function parseClock(t) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
    if (!m) return null;
    var h = +m[1], mi = +m[2];
    if (h > 24 || mi > 59) return null;
    return h * 60 + mi;
  }

  /* "06:00-08:00 שחיית בוקר, 16:00-20:00" -> [{a,b,l,off},...]
     "סגור" -> [] · null = לא הובן.

     ⚠️ שתי החלטות שנגזרו מהשלט האמיתי של הבריכה (2026-09-08), ושתיהן על
        אותו ציר — שהמנוע לעולם לא יכריז "פתוח" בטעות:

     1. **תווית היא מידע בלבד.** "08:00-10:00 שחיית גברים" הוא טווח פתוח
        שהתווית שלו מספרת למי. התווית לא נבדקת מול שום מילון ולא משנה אף
        פעם את הפתיחה — כי מילון מילים ("ניקיון"? "תחזוקה"? "אירוע"?) הוא
        בדיוק המנגנון שיחמיץ מילה חדשה ויכריז "פתוח" על בריכה סגורה.

     2. **סוגריים = לא פתוח לקהל, אבל כן מוצג.** בשלט כתוב
        "08:00-15:00 ניקיון בריכה" ביום א׳ — שעה שאסור לספור כפתוחה. במקום
        לנחש מהמילים, יועד עוטף אותה בסוגריים. הכיוון בטוח: סוגריים רק
        *מורידים* זמינות. טעות אפשרית = משהו נראה סגור בזמן שהוא פתוח,
        ולעולם לא ההפך.

     כל מה שלא נרשם בכלל — סגור. זו ברירת המחדל, ולכן גם מי ששוכח לרשום
     משהו נופל לצד הבטוח.

     חוצה חצות ("22:00-01:00") נחתך בחצות — היום מקבל 22:00-24:00 וההמשך
     ליום הבא נשמר בנפרד, כדי שחישוב "פתוח עכשיו" יישאר השוואה פשוטה. */
  var RANGE_RE = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})(?:\s+(.*))?$/;
  function parseRanges(spec) {
    var s = String(spec || "").trim();
    if (!s) return null;
    if (/^(סגור|סגורה|אין|—|-)$/.test(s)) return [];
    var out = [], over = [], parts = s.split(/\s*,\s*/);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i].trim(), off = false;
      if (part.charAt(0) === "(" && part.charAt(part.length - 1) === ")") {
        off = true; part = part.slice(1, -1).trim();
      }
      var m = RANGE_RE.exec(part);
      if (!m) return null;
      var a = parseClock(m[1]), b = parseClock(m[2]);
      if (a === null || b === null || b === a) return null;
      var lab = (m[3] || "").trim();
      if (b < a) {
        out.push({ a: a, b: 1440, l: lab, off: off || undefined });
        if (!off) over.push({ a: 0, b: b, l: lab });
      } else {
        out.push({ a: a, b: b, l: lab, off: off || undefined });
      }
    }
    out.sort(function (x, y) { return x.a - y.a; });
    if (over.length) out.over = over;
    return out;
  }

  /* "15/05" או "15/05/2026" -> {d,m,y|null}. null = לא הובן. */
  function parseDate(t) {
    var m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(String(t || "").trim());
    if (!m) return null;
    var d = +m[1], mo = +m[2];
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
    return { d: d, m: mo, y: m[3] ? +m[3] : null };
  }
  function dayOfYear(d, m) { return m * 100 + d; }   // השוואה בלבד, לא תאריך אמיתי

  /* ------------------------------------------------------------------------
   *  parseHours — מטקסט הסעיף למבנה. תמיד מחזיר אובייקט, לעולם לא זורק.
   *    { season, week[7], exceptions{}, bad[], hardBad }
   *  hardBad = נכשלה שורת "עונה"/"חריג", כלומר אסור להסיק מכאן "פתוח".
   * ---------------------------------------------------------------------- */
  function parseHours(content) {
    var res = { season: null, week: [null, null, null, null, null, null, null],
                exceptions: {}, bad: [], hardBad: false };
    var lines = String(content || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i], line = raw.trim();
      if (!line) continue;
      var cells = line.split("|").map(function (c) { return c.trim(); });
      var key = cells[0];

      if (/^עונה$/.test(key)) {
        var sp = String(cells[1] || "").split(/\s*[-–]\s*/);
        var f = parseDate(sp[0]), t = parseDate(sp[1]);
        if (!f || !t) { res.bad.push(line); res.hardBad = true; continue; }
        res.season = { from: f, to: t };
        continue;
      }
      if (/^חריג$/.test(key)) {
        var dt = parseDate(cells[1]);
        var rg = parseRanges(cells[2]);
        if (!dt || rg === null) { res.bad.push(line); res.hardBad = true; continue; }
        var k = (dt.y ? dt.y + "-" : "") + dt.m + "/" + dt.d;
        res.exceptions[k] = rg;
        continue;
      }
      var days = parseDays(key), ranges = parseRanges(cells[1]);
      if (!days || ranges === null) { res.bad.push(line); continue; }
      for (var j = 0; j < days.length; j++) res.week[days[j]] = ranges;
    }
    return res;
  }

  function inSeason(season, now) {
    if (!season) return true;
    var cur = dayOfYear(now.getDate(), now.getMonth() + 1);
    var a = dayOfYear(season.from.d, season.from.m), b = dayOfYear(season.to.d, season.to.m);
    // עונה שעוברת את סוף השנה ("01/11-31/03") מתגלגלת
    return a <= b ? (cur >= a && cur <= b) : (cur >= a || cur <= b);
  }

  /* הטווחים שחלים על תאריך מסוים: חריג-עם-שנה גובר על חריג-בלי-שנה, ושניהם
     גוברים על הלוח השבועי. undefined = אין מידע ליום הזה. */
  function rangesOn(p, date) {
    var withY = p.exceptions[date.getFullYear() + "-" + (date.getMonth() + 1) + "/" + date.getDate()];
    if (withY) return withY;
    var noY = p.exceptions[(date.getMonth() + 1) + "/" + date.getDate()];
    if (noY) return noY;
    return p.week[date.getDay()];
  }

  /* "פתוח · עד 20:00" — ואם למשבצת יש תווית ("שחיית נשים"), היא נכנסת
     לחיווי. תושב שרואה רק "פתוח" ומגיע לשחיית נשים קיבל תשובה נכונה
     טכנית וחסרת ערך בפועל. */
  function openAt(r) {
    var d = "עד " + hhmm(r.b);
    return { state: "open", label: "פתוח", detail: r.l ? r.l + " · " + d : d, note: r.l || "" };
  }

  function hhmm(mins) {
    var h = Math.floor(mins / 60) % 24, m = mins % 60;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }
  /* ⚠️ טווח שעות בתוך פסקה בעברית **מתהפך**: "08:00–15:00" הוא רצף של שני
     מספרים אירופיים עם תו ניטרלי ביניהם, ואלגוריתם ה-bidi מסדר את *סדר
     המספרים* לפי כיוון הפסקה — כלומר RTL. התוצאה שנראתה על המסך הייתה
     "15:00–08:00", כלומר שעת הסגירה לפני שעת הפתיחה. dir="ltr" יוצר
     בידוד (isolate) ומחזיר את הסדר. חל גם על תאריכים (15/5 – 30/9). */
  function ltr(t) { return '<bdi dir="ltr">' + t + "</bdi>"; }
  function span(a, b) { return ltr(hhmm(a) + "–" + hhmm(b)); }

  /* ------------------------------------------------------------------------
   *  hoursStatus — הסטטוס ברגע נתון.
   *    { state: 'open' | 'closed' | 'season' | 'unknown', label, detail }
   *  'unknown' הוא תשובה לגיטימית ולא תקלה: עדיף "לפי הלוח" על "פתוח" שקרי.
   * ---------------------------------------------------------------------- */
  function hoursStatus(parsed, now) {
    now = now || new Date();
    var p = parsed;
    if (!p) return { state: "unknown", label: "לפי הלוח" };
    var hasAny = p.season || Object.keys(p.exceptions).length;
    for (var d = 0; d < 7; d++) if (p.week[d]) hasAny = true;
    if (!hasAny) return { state: "unknown", label: "לפי הלוח" };
    if (p.hardBad) return { state: "unknown", label: "לפי הלוח", detail: "יש שורה שלא נקראה בלוח" };

    if (!inSeason(p.season, now)) {
      return { state: "season", label: "סגור לעונה",
               detail: "העונה: " + p.season.from.d + "/" + p.season.from.m +
                       " – " + p.season.to.d + "/" + p.season.to.m };
    }

    var mins = now.getHours() * 60 + now.getMinutes();

    /* המשך של טווח שחצה חצות מאתמול — נבדק *לפני* הלוח של היום. אחרת
       "שבת | 22:00-01:00" היה מחזיר unknown בראשון ב-00:30, כי לראשון עצמו
       אין שורה בלוח. הלילה שייך ליום שהתחיל אותו. */
    var yest = new Date(now.getTime() - 86400000);
    var yr = inSeason(p.season, yest) ? rangesOn(p, yest) : null;
    if (yr && yr.over) {
      for (var o = 0; o < yr.over.length; o++) {
        if (mins >= yr.over[o].a && mins < yr.over[o].b) return openAt(yr.over[o]);
      }
    }

    var today = rangesOn(p, now);
    if (today === undefined || today === null) return { state: "unknown", label: "לפי הלוח" };
    /* טווח מסומן בסוגריים אינו זמן פתיחה — הוא רק מוצג בטבלה. */
    for (var i = 0; i < today.length; i++) {
      if (!today[i].off && mins >= today[i].a && mins < today[i].b) return openAt(today[i]);
    }
    for (var k = 0; k < today.length; k++) {
      if (!today[k].off && today[k].a > mins) {
        return { state: "closed", label: "סגור", detail: "נפתח ב-" + hhmm(today[k].a) };
      }
    }
    // סורקים קדימה עד שבוע. אם אין כלום — "סגור" בלי הבטחה מתי ייפתח.
    for (var n = 1; n <= 7; n++) {
      var dt = new Date(now.getTime() + n * 86400000);
      if (!inSeason(p.season, dt)) continue;
      var r = rangesOn(p, dt), first = null;
      if (r) for (var q = 0; q < r.length; q++) if (!r[q].off) { first = r[q]; break; }
      if (first) {
        return { state: "closed", label: "סגור",
                 detail: (n === 1 ? "נפתח מחר ב-" : "נפתח ביום " + DAY_NAMES[dt.getDay()] + " ב-") + hhmm(first.a) };
      }
    }
    return { state: "closed", label: "סגור" };
  }

  /* שורת "היום" — הטווחים שחלים על התאריך הנוכחי, כטקסט קצר. משמשת את
     הפופאפ במפה, שבו אין מקום לטבלה שלמה אבל דווקא שם השאלה היא "עכשיו". */
  function hoursToday(parsed, now) {
    now = now || new Date();
    if (!parsed) return "";
    if (!inSeason(parsed.season, now)) return "מחוץ לעונה";
    var r = rangesOn(parsed, now);
    if (r === null || r === undefined) return "";
    var open = r.filter(function (x) { return !x.off; });
    if (!open.length) return "סגור";
    return open.map(function (x) {
      return hhmm(x.a) + "–" + hhmm(x.b) + (x.l ? " " + x.l : "");
    }).join(" · ");
  }

  /* הסעיף הראשון מסוג "שעות" בשירות — יש רק אחד בפועל, אבל לא מסתמכים על זה. */
  function serviceHours(svc) {
    var secs = (svc && svc.sections) || [];
    for (var i = 0; i < secs.length; i++) {
      if (secs[i].type === "שעות") return parseHours(secs[i].content);
    }
    return null;
  }
  function serviceStatus(svc, now) {
    var p = serviceHours(svc);
    return p ? hoursStatus(p, now) : null;
  }

  /* ציור הסעיף: טבלת שבוע קריאה + שורת עונה + חריגים קרובים. שורה שלא נקראה
     מוצגת כמו שהיא ומסומנת — הפער חייב לצעוק, לא להיעלם. */
  function renderHours(content, now) {
    var p = parseHours(content);
    now = now || new Date();
    var html = "";
    var st = hoursStatus(p, now);
    if (st && st.state !== "unknown") {
      html += '<div class="svc-hrs__now svc-hrs__now--' + st.state + '">' +
        '<span class="svc-hrs__dot"></span><b>' + esc(st.label) + "</b>" +
        (st.detail ? ' <span class="svc-hrs__det">' + esc(st.detail) + "</span>" : "") + "</div>";
    }
    if (p.season) {
      html += '<div class="svc-hrs__season">תקופת פתיחה: ' +
        ltr(p.season.from.d + "/" + p.season.from.m + " – " + p.season.to.d + "/" + p.season.to.m) + "</div>";
    }
    var rows = "";
    for (var d = 0; d < 7; d++) {
      var r = p.week[d];
      var isToday = d === now.getDay(), cell;
      if (r === null || r === undefined) cell = "—";
      else if (!r.length) cell = "סגור";
      else cell = r.map(function (x) {
        return '<span class="svc-hrs__slot' + (x.off ? " svc-hrs__off" : "") + '">' +
          "<b>" + span(x.a, x.b) + "</b>" +
          (x.l ? ' <span class="svc-hrs__lab">' + esc(x.l) + "</span>" : "") +
          (x.off ? ' <span class="svc-hrs__lab">(סגור)</span>' : "") + "</span>";
      }).join("");
      rows += '<tr' + (isToday ? ' class="is-today"' : "") + "><th>" + DAY_NAMES[d] + "</th><td>" + cell + "</td></tr>";
    }
    html += '<table class="svc-hrs"><tbody>' + rows + "</tbody></table>";

    var exKeys = Object.keys(p.exceptions);
    if (exKeys.length) {
      html += '<div class="svc-hrs__ex"><b>חריגים</b><ul>' + exKeys.map(function (k) {
        var parts = k.split("-"), md = (parts[1] || parts[0]).split("/");
        var r = p.exceptions[k];
        return "<li>" + esc(md[1] + "/" + md[0] + (parts[1] ? "/" + parts[0] : "")) + " — " +
          (r.length ? r.map(function (x) {
            return span(x.a, x.b) + esc((x.l ? " " + x.l : "") + (x.off ? " (סגור)" : ""));
          }).join(", ") : "סגור") + "</li>";
      }).join("") + "</ul></div>";
    }
    if (p.bad.length) {
      html += '<div class="svc-hrs__bad"><b>שורות שלא נקראו</b> — הן מוצגות כאן כלשונן, ' +
        "ואינן משפיעות על חיווי הפתיחה:<ul>" +
        p.bad.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul></div>";
    }
    return html;
  }

  /* קישור בתוך שורה → כפתור לחיץ (2026-09-22). helper משותף לכל סוגי
     הסעיפים החופשיים-טקסט (טקסט/הדגשה/רשימה) — במקום להגביל את הזיהוי
     ל"רשימה" בלבד, מה שהחמיץ קישורים בסעיפים שהוגדרו כ"טקסט". מחזיר null
     אם השורה לא מכילה קישור, כדי שקורא יידע להישאר עם הטקסט הרגיל. */
  var svcUrlRe = /(https?:\/\/\S+)/;
  function linkifyLine(l) {
    var m = l.match(svcUrlRe);
    if (!m) return null;
    var url = m[1].replace(/[),.;]+$/, "");
    var label = l.slice(0, m.index).replace(/[:\-–]\s*$/, "").trim();
    return '<a class="svc-linkbtn" href="' + esc(url) + '" target="_blank" rel="noopener">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.5-1.5"/></svg>' +
      '<span>' + esc(label || url) + "</span></a>";
  }

  /* ציור סעיף בודד ל-HTML. משמש גם את מסך התושב וגם את התצוגה-המקדימה
     שבמסך הניהול, כדי שמה שהמנהל רואה בעריכה יהיה מה שהתושב יראה בפועל. */
  function renderSection(sec) {
    var c = sec.content || "";
    if (sec.type === "טקסט") {
      return c.split(/\n\s*\n/).filter(function (p) { return p.trim() !== ""; })
        .map(function (p) {
          var html = p.split("\n").map(function (l) { return linkifyLine(l) || esc(l); }).join("<br>");
          return '<p class="svc-p">' + html + "</p>";
        }).join("");
    }
    if (sec.type === "הדגשה") {
      var hHtml = c.split("\n").map(function (l) { return linkifyLine(l) || esc(l); }).join("<br>");
      return '<div class="svc-hilite"><span class="svc-hilite__ico">!</span><div>' + hHtml + "</div></div>";
    }
    if (sec.type === "רשימה") {
      // 2026-09-22 — שורה שמכילה קישור (http/https) מוצגת ככפתור לחיץ במקום
      // כטקסט רגיל. חל על כל סעיף מסוג "רשימה" (למשל "קישורים"), לא רק על
      // סעיף עם כותרת מסוימת — כך שגם סעיפים קיימים אחרים עם קישורים
      // מתעדכנים אוטומטית, בלי לגעת בנתונים בגיליון.
      return '<ul class="svc-ul">' + toLines(c).map(function (l) {
        var btn = linkifyLine(l);
        return btn ? '<li class="svc-ul__link">' + btn + "</li>" : "<li>" + esc(l) + "</li>";
      }).join("") + "</ul>";
    }
    if (sec.type === "טבלה") {
      var grid = toGrid(c);
      if (!grid.length) return "";
      var head = grid[0], body = grid.slice(1);
      // גלילה אופקית בעטיפה ולא על הטבלה עצמה — כדי שטבלת מחירון עם 3-4
      // עמודות לא תשבור את רוחב ה-drawer בנייד.
      return '<div class="svc-table-wrap"><table class="svc-table"><thead><tr>' +
        head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
        "</tr></thead><tbody>" +
        body.map(function (r) {
          return "<tr>" + head.map(function (_, i) {
            return "<td>" + esc(r[i] || "") + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (sec.type === "שעות") return renderHours(c);
    if (sec.type === "אנשי קשר") {
      return toContacts(c).map(function (p) {
        if (!p.name && !p.phone) return "";
        var acts = "";
        // ערוץ הטלפון קובע אילו כפתורים מוצגים — ר' PHONE_CHANNELS למעלה.
        // ברירת מחדל (אין ערוץ בתוכן) היא CH_BOTH, ולכן שורה ישנה מציגה
        // בדיוק את שני הכפתורים שהיא הציגה עד היום.
        var ch = p.channel || CH_BOTH;
        if (p.phone && ch !== CH_WA) {
          acts +=
            '<button type="button" class="svc-icb" data-call="' + esc(p.phone) + '" title="חיוג" aria-label="חיוג ל' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' +
            "</button>";
        }
        if (p.phone && ch !== CH_PHONE) {
          acts +=
            '<a class="svc-icb svc-icb--wa" href="https://wa.me/' + esc(waDigits(p.phone)) + '" target="_blank" rel="noopener" title="וואטסאפ" aria-label="וואטסאפ ל' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2 1.2.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 1c.3.1.4.2.5.3v1.4z"/></svg>' +
            "</a>";
        }
        return '<div class="svc-contact">' +
            '<div class="svc-contact__t"><div class="svc-contact__n">' + esc(p.name) + "</div>" +
            (p.role ? '<div class="svc-contact__r">' + esc(p.role) + "</div>" : "") + "</div>" +
            (p.phone ? '<span class="svc-contact__p">' + esc(p.phone) + "</span>" : "") +
            '<div class="svc-contact__acts">' + acts + "</div>" +
          "</div>";
      }).join("");
    }
    return "";
  }

  /* טקסט חופשי לחיפוש — כולל תוכן הסעיפים, כדי שחיפוש "בלון" ימצא את כרטיס
     הגז גם אם המילה לא מופיעה בשם או בתיאור הקצר. */
  function searchText(svc) {
    return [svc.name, svc.provider, svc.desc, svc.phone].concat(
      (svc.sections || []).map(function (s) { return s.title + " " + s.content; })
    ).join(" ");
  }

  return {
    TYPES: TYPES, KINDS: KINDS, KIND_INFRA: KIND_INFRA, KIND_VENDOR: KIND_VENDOR,
    PHONE_CHANNELS: PHONE_CHANNELS, CH_PHONE: CH_PHONE, CH_WA: CH_WA, CH_BOTH: CH_BOTH,
    // מזהי הקטגוריות הקבועים שנזרעו ב-Code.gs (SERVICE_CATEGORIES_SEED) —
    // מזהה יציב שלא משתנה גם אם המנהל משנה את שם הקטגוריה, ר' הערה ב-build().
    CATEGORY_INFRA_ID: "infra", CATEGORY_VENDOR_ID: "vendor",
    buildCategories: buildCategories, flattenCategories: flattenCategories,
    build: build, flatten: flatten,
    parseHours: parseHours, hoursStatus: hoursStatus, hoursToday: hoursToday,
    serviceHours: serviceHours, serviceStatus: serviceStatus, renderHours: renderHours,
    toLines: toLines, toGrid: toGrid, toContacts: toContacts,
    telDigits: telDigits, waDigits: waDigits,
    renderSection: renderSection, searchText: searchText
  };
})();

/* ============================================================================
 *  מסך התושב
 * ========================================================================== */
var svcState = { list: [], loaded: false, query: "", residentCards: [], residentSvcMap: {}, recCatId: null, reactionCounts: {}, commentCounts: {} };
var svcRepaint = null;

function svcEsc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

/* תג "פתוח/סגור" — מצויר רק לשירות שיש לו סעיף שעות. שירות בלי לוח לא מקבל
   תג בכלל, ותג במצב unknown אומר "לפי הלוח" ולא ממציא תשובה. */
function svcStatusTag(svc) {
  var st = CBA.serviceUtils.serviceStatus(svc);
  if (!st) return "";
  return '<span class="svc-st svc-st--' + st.state + '"><i></i>' + svcEsc(st.label) +
    (st.detail ? ' <em>' + svcEsc(st.detail) + "</em>" : "") + "</span>";
}

CBA.screens.resServices = {
  title: "שירותים",

  render: function (container) {
    /* קיצור למנהל-על (2026-09-08, לבקשת יועד) — מסך העריכה תמיד היה קיים
       (servicesAdmin, אזור הניהול), אבל מי שעומד כאן ורואה משהו לתקן צריך
       לזכור שהוא נמצא במקום אחר לגמרי. הכפתור לא משנה שום הרשאה: האכיפה
       היא בשרת (saveServices: PERM_SUPER ב-ACTION_PERMS), וזה רק ניווט.
       ⚠️ CBA.isSuper נקבע פעם אחת באתחול (app.js) — לא לגזור הרשאה מכאן
          לשום דבר מלבד הצגת קיצור דרך. */
    var canEdit = window.CBA && CBA.isSuper === true && CBA.screens && CBA.screens.servicesAdmin;
    container.innerHTML =
      '<div class="screen-head screen-head--row">' +
        '<div><div class="screen-head__title">שירותים</div>' +
        '<div class="screen-head__sub">כל השירותים בשיכון — פרטים מלאים, מחירים ואנשי קשר</div></div>' +
        (canEdit ? '<button type="button" class="btn-ghost btn-sm" id="svc-edit">עריכת הכרטיסים</button>' : '') +
      '</div>' +
      '<div id="svc-body"></div>';

    if (canEdit) {
      var ed = container.querySelector("#svc-edit");
      if (ed) ed.addEventListener("click", function () { CBA.navigate("servicesAdmin"); });
    }

    var body = container.querySelector("#svc-body");

    function paint() {
      // כל תושב מחובר יכול להוסיף המלצה — לא רק מנהל-על (ר' האפיון).
      var canRecommend = !!(window.CBA && CBA.user && CBA.user.familyId);
      body.innerHTML =
        '<div class="svc-toolbar">' +
          '<div class="svc-search">' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
            '<input id="svc-q" class="field-input" placeholder="חיפוש שירות, ספק או תוכן…" value="' + svcEsc(svcState.query) + '">' +
          "</div>" +
          '<span class="svc-count" id="svc-count"></span>' +
          (canRecommend ? '<button type="button" class="btn-primary btn-sm" id="svc-add-rec">+ הוספת המלצה</button>' : "") +
        "</div>" +
        '<div class="svc-grid" id="svc-grid"></div>';
      paintGrid();

      var q = body.querySelector("#svc-q");
      q.addEventListener("input", function () { svcState.query = q.value; paintGrid(); });

      var addBtn = body.querySelector("#svc-add-rec");
      if (addBtn) addBtn.addEventListener("click", function () { svcOpenRecommendForm(); });
    }
    svcRepaint = paint;

    function paintGrid() {
      var q = String(svcState.query || "").trim();
      var list = svcState.list.filter(function (s) {
        if (!s.active) return false;
        return !q || CBA.serviceUtils.searchText(s).indexOf(q) !== -1;
      });
      var grid = body.querySelector("#svc-grid");
      var count = body.querySelector("#svc-count");
      if (count) count.textContent = list.length ? list.length + " שירותים" : "";

      if (!list.length) {
        grid.innerHTML = '<div class="card club-card svc-empty">' +
          (q ? "לא נמצא שירות שמתאים לחיפוש." : "עדיין לא הוגדרו שירותים. מנהל-על יכול להוסיף אותם ממסך ניהול השירותים.") +
          "</div>";
        return;
      }

      function card(s) {
        // כרטיס המלצת תושב (2026-09-23) — אותו שלד כרטיס בדיוק, רק תג
        // "המלצת תושב" במקום אייקון, שם משפחה במקום ספק, ותקציר הטקסט
        // החופשי במקום "תיאור קצר". בלי כפתורי טלפון — אין שדה טלפון
        // בכרטיס המלצה (ר' האפיון).
        var recFam = s.isResident ? (CBA.data.familyDisplayName(s.familyId) || "תושב") : "";
        return '<article class="svc-card' + (s.isResident ? ' svc-card--rec' : '') + '" data-svc="' + svcEsc(s.id) + '">' +
            (s.isResident
              ? '<div class="svc-badge">המלצת תושב</div>'
              : (s.icon ? '<div class="svc-card__ico">' + svcEsc(s.icon) + "</div>" : "")) +
            '<h3 class="svc-card__name">' + svcEsc(s.name) + "</h3>" +
            svcStatusTag(s) +
            (s.isResident
              ? (recFam ? '<div class="svc-card__prov">' + svcEsc(recFam) + "</div>" : "")
              : (s.provider ? '<div class="svc-card__prov">' + svcEsc(s.provider) + "</div>" : "")) +
            (s.isResident
              ? '<p class="svc-card__desc">' + svcEsc((s.body || "").slice(0, 110)) + ((s.body || "").length > 110 ? "…" : "") + "</p>"
              : (s.desc ? '<p class="svc-card__desc">' + svcEsc(s.desc) + "</p>" : '<p class="svc-card__desc"></p>')) +
            svcCardReactsHtml(s.id) +
            '<div class="svc-card__acts">' +
              '<button type="button" class="btn-primary btn-sm" data-open="' + svcEsc(s.id) + '">כל הפרטים</button>' +
              (s.isResident ? "" : svcPhoneBtns(s, "btn-ghost btn-sm")) +
            "</div>" +
          "</article>";
      }

      /* קיבוץ דינמי לפי קטגוריות (2026-09-22) — הרשימה שמנהל-על מנהל
         (ניהול קטגוריות במסך הניהול), לא עוד שתי כותרות קשיחות בקוד.
         קטגוריה בלי אף שירות (אחרי הסינון) לא מוצגת בכלל — כותרת קבוצה
         מעל רשימה ריקה היא רעש. סדר הקבוצות = "סדר" בטאב הקטגוריות.
         כשיש בפועל רק קבוצה אחת (או שהקטגוריות לא נטענו) — בלי כותרות,
         בדיוק כמו ההתנהגות הקודמת. */
      var cats = (svcState.categories || []).filter(function (c) { return c.active; });
      var groups = cats.map(function (c) {
        return { cat: c, items: list.filter(function (s) { return s.categoryId === c.id; }) };
      }).filter(function (g) { return g.items.length; });

      // שירותים בלי קטגוריה תקפה (קטגוריה נמחקה בגיליון ידנית) — לא נעלמים,
      // מוצגים בקבוצה "ללא קטגוריה" בסוף כדי שאף שירות לא ייעלם בשקט.
      var grouped = {};
      groups.forEach(function (g) { g.items.forEach(function (s) { grouped[s.id] = 1; }); });
      var orphans = list.filter(function (s) { return !grouped[s.id]; });
      if (orphans.length) groups.push({ cat: { name: "ללא קטגוריה" }, items: orphans });

      grid.innerHTML = groups.length > 1
        ? groups.map(function (g) {
            return '<h2 class="svc-group">' + svcEsc(g.cat.name) + '</h2><div class="svc-grid__in">' +
              g.items.map(card).join("") + "</div>";
          }).join("")
        : '<div class="svc-grid__in">' + list.map(card).join("") + "</div>";

      grid.querySelectorAll("[data-open]").forEach(function (btn) {
        btn.addEventListener("click", function () { svcOpenDrawer(btn.dataset.open); });
      });
      svcBindCallButtons(grid);
    }

    // סקלטון עד שהנתונים חוזרים — עקבי עם שאר המסכים (ר' app.js)
    body.innerHTML = CBA.skel.tiles(6);

    CBA.data.getServices(function (res) {
      if (!res || !res.ok) {
        body.innerHTML = '<div class="card club-card"><div class="club-empty">לא ניתן לטעון את השירותים כרגע. ' +
          svcEsc((res && res.error) || "") + "</div></div>";
        return;
      }
      svcState.list = CBA.serviceUtils.build(res.services, res.sections);
      svcState.categories = CBA.serviceUtils.buildCategories(res.categories);
      svcState.recCatId = svcRecommendCategoryId();
      // כרטיסי המלצות תושבים (WAVE 3) — נטענים בנפרד מ-Firestore ומתמזגים
      // לתוך אותה רשימה, ככה שהם עוברים באותו קיבוץ-לפי-קטגוריה, אותו
      // חיפוש ואותה מגירה כמו כרטיסי מנהל. אם הטעינה נכשלת (Firestore לא
      // זמין) — לא נופלים בשקט: מסך השירותים הרשמי עדיין עולה, רק בלי
      // ההמלצות באותו רגע (בדיוק כמו תגובות גינון).
      svcLoadResidentExtras(function () {
        svcLoadEngagementSummary(function () {
          svcState.loaded = true;
          paint();
        });
      });
    });
  }
};

/* כפתור/י הטלפון של "טלפון ראשי" — כרטיס ומגירה משתמשים באותה פונקציה כדי
   שערוץ הטלפון (חיוג בלבד / וואטסאפ עסקי בלבד / שניהם) יתנהג אותו דבר בשני
   המקומות. mainCls הוא הכפתור העיקרי (חיוג, או וואטסאפ כשאין חיוג בכלל);
   secondaryCls הוא כפתור וואטסאפ נוסף כשיש גם וגם (לא חובה — בכרטיס אין
   הבדל בין ראשי למשני, אז אותו class לשניהם). suffix הוא " לפלוני" ליד
   "חיוג"/"וואטסאפ", בדיוק כמו שהיה בכפתור החיוג הישן במגירה. */
function svcPhoneBtns(svc, mainCls, secondaryCls, suffix) {
  if (!svc.phone) return "";
  suffix = suffix || "";
  var U = CBA.serviceUtils;
  var ch = svc.phoneChannel || U.CH_PHONE;
  var html = "";
  if (ch !== U.CH_WA) {
    html += '<button type="button" class="' + mainCls + '" data-call="' + svcEsc(svc.phone) + '">חיוג' + svcEsc(suffix) + "</button>";
  }
  if (ch !== U.CH_PHONE) {
    var cls = (ch === U.CH_BOTH && secondaryCls) ? secondaryCls : mainCls;
    html += '<a class="' + cls + '" href="https://wa.me/' + svcEsc(U.waDigits(svc.phone)) + '" target="_blank" rel="noopener">וואטסאפ' + svcEsc(suffix) + "</a>";
  }
  return html;
}

/* חיוג: בנייד פותח את המחייגן (tel:), בדסקטופ מעתיק את המספר ומראה טוסט.
   הסיבה: בדסקטופ לחיצה על tel: לרוב לא עושה כלום ונראית כמו כפתור שבור —
   העתקה היא הפעולה שהמשתמש באמת רצה שם. */
function svcBindCallButtons(root) {
  root.querySelectorAll("[data-call]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var phone = btn.dataset.call;
      var isMobile = window.matchMedia("(max-width: 760px)").matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) { window.location.href = "tel:" + CBA.serviceUtils.telDigits(phone); return; }
      var done = function () { svcToast("המספר " + phone + " הועתק"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phone).then(done, function () { svcToast("המספר: " + phone); });
      } else {
        done();
      }
    });
  });
}

var svcToastTimer = null;
function svcToast(msg) {
  var el = document.getElementById("svc-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "svc-toast";
    el.className = "svc-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  // כפיית reflow כדי שהאנימציה תרוץ גם כשהטוסט כבר קיים מקריאה קודמת
  void el.offsetWidth;
  el.classList.add("is-show");
  clearTimeout(svcToastTimer);
  svcToastTimer = setTimeout(function () { el.classList.remove("is-show"); }, 2400);
}

function svcCloseDrawer() {
  var el = document.getElementById("svc-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", svcDrawerKey);
}
function svcDrawerKey(e) { if (e.key === "Escape") svcCloseDrawer(); }

function svcOpenDrawer(id) {
  svcCloseDrawer();
  var svc = null;
  for (var i = 0; i < svcState.list.length; i++) if (svcState.list[i].id === id) svc = svcState.list[i];
  if (!svc) return;

  // הסעיף הראשון פתוח, השאר סגורים — בנייד זה ההבדל בין מסך שאפשר לסרוק
  // לבין גלילה ארוכה של חוזה שלם.
  /* הסעיף הראשון פתוח — וגם סעיף השעות, תמיד. מי שנכנס לכרטיס של תשתית
     ציבורית בא לראות מתי פתוח, ולא הגיוני שיצטרך לפתוח אקורדיון בשביל זה. */
  var sectionsHtml = svc.sections.map(function (sec, k) {
    var open = k === 0 || sec.type === "שעות";
    return '<div class="svc-acc' + (open ? " is-open" : "") + '">' +
        '<button type="button" class="svc-acc__btn" aria-expanded="' + (open ? "true" : "false") + '">' +
          '<span>' + svcEsc(sec.title) + "</span>" +
          '<svg class="svc-acc__chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
        "</button>" +
        '<div class="svc-acc__body">' + CBA.serviceUtils.renderSection(sec) + "</div>" +
      "</div>";
  }).join("");

  // בעל הכרטיס (לעריכה/מחיקה עצמית) ומנהל-על (להסתרה) — ר' האפיון: כל
  // כרטיס גלוי לכולם, אבל רק היוצר או מנהל-על יכולים לגעת בו.
  var myFid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
  var isOwner = svc.isResident && myFid && svc.familyId === myFid;
  var isSuperAdmin = window.CBA && CBA.isSuper === true;
  var recFamName = svc.isResident ? (CBA.data.familyDisplayName(svc.familyId) || "תושב") : "";

  var overlay = document.createElement("div");
  overlay.id = "svc-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-sclose></div>' +
    '<aside class="drawer" role="dialog" aria-label="פרטי שירות">' +
      '<div class="drawer__head">' +
        '<div class="svc-drawer__head">' +
          (svc.isResident
            ? ""
            : (svc.icon ? '<span class="svc-drawer__ico">' + svcEsc(svc.icon) + "</span>" : "")) +
          "<div>" +
          (svc.isResident ? '<div class="svc-badge">המלצת תושב</div>' : "") +
          "<div class=\"drawer__title\">" + svcEsc(svc.name) + "</div>" +
          (svc.isResident
            ? (recFamName ? '<div class="drawer__sub">' + svcEsc(recFamName) + "</div>" : "")
            : (svc.provider ? '<div class="drawer__sub">' + svcEsc(svc.provider) + "</div>" : "")) +
          svcStatusTag(svc) + "</div>" +
        "</div>" +
        '<button class="drawer__close" data-sclose aria-label="סגור">×</button>' +
      "</div>" +
      '<div class="drawer__body svc-drawer__body">' +
        (sectionsHtml || '<div class="club-empty">אין עדיין פרטים לשירות הזה.</div>') +
        (svc.updated ? '<div class="svc-updated">עודכן לאחרונה: ' + svcEsc(svc.updated) + "</div>" : "") +
        '<div class="hairline-sep" style="height:1px;background:var(--hairline);margin:16px 0"></div>' +
        '<div id="svc-react-zone" data-cardid="' + svcEsc(svc.id) + '">' + svcSkeletonReactions() + "</div>" +
        (isOwner || isSuperAdmin
          ? '<div class="svc-admin-zone">' +
              '<div class="svc-admin-zone__label">' + (isOwner ? "הכרטיס שלך" : "פעולות ניהול") + "</div>" +
              (isOwner
                ? '<button type="button" class="btn-ghost btn-sm" id="svc-rec-edit">עריכת הכרטיס</button>' +
                  '<button type="button" class="btn-ghost btn-sm" id="svc-rec-del" style="color:#F43F5E">מחיקת הכרטיס</button>'
                : "") +
              (isSuperAdmin && !isOwner && svc.isResident
                ? '<button type="button" class="btn-ghost btn-sm" id="svc-rec-hide" style="color:#F43F5E">הסתרת כרטיס</button>'
                : "") +
            "</div>"
          : "") +
      "</div>" +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          (svc.isResident
            ? (svc.mapsUrl ? '<a class="btn-ghost" href="' + svcEsc(svc.mapsUrl) + '" target="_blank" rel="noopener">פתח במפות</a>' : "")
            : svcPhoneBtns(svc, "btn-primary", "btn-ghost", svc.provider ? " ל" + svcEsc(svc.provider) : "")) +
          (svc.doc ? '<a class="btn-ghost" href="' + svcEsc(svc.doc) + '" target="_blank" rel="noopener">המסמך המקורי</a>' : "") +
          '<button type="button" class="btn-ghost" data-sclose>סגירה</button>' +
        "</div>" +
      "</div>" +
    "</aside>";
  document.body.appendChild(overlay);

  overlay.querySelectorAll("[data-sclose]").forEach(function (el) {
    el.addEventListener("click", svcCloseDrawer);
  });
  overlay.querySelectorAll(".svc-acc__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var acc = btn.parentNode;
      var open = acc.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  svcBindCallButtons(overlay);

  var editBtn = overlay.querySelector("#svc-rec-edit");
  if (editBtn) editBtn.addEventListener("click", function () {
    svcOpenRecommendForm(svcState.residentSvcMap[svc.id]);
  });
  var delBtn = overlay.querySelector("#svc-rec-del");
  if (delBtn) delBtn.addEventListener("click", function () { svcDeleteRecommend(svc.id, false); });
  var hideBtn = overlay.querySelector("#svc-rec-hide");
  if (hideBtn) hideBtn.addEventListener("click", function () { svcDeleteRecommend(svc.id, true); });

  svcPaintReactions(svc.id);
  document.addEventListener("keydown", svcDrawerKey);
}

/* ============================================================================
 *  המלצות תושבים + לייק/דיסלייק/תגובות (2026-09-23, WAVE 3)
 * ----------------------------------------------------------------------------
 *  כרטיסי המלצה נטענים מ-Firestore (residentServiceCards) ומתמזגים לתוך
 *  svcState.list כ"שירות" רגיל לכל דבר — אותו card()/svcOpenDrawer, אותו
 *  קיבוץ-לפי-קטגוריה. הקטגוריה עצמה ("המלצות תושבים") כבר קיימת בפועל
 *  (מזהה cat_mud7r57ebu, נוצרה ידנית ע"י יועד) — לא נזרעת כאן בקוד, רק
 *  מזוהה לפי שם. לייק/דיסלייק/תגובות חלים על **כל** כרטיס, רשמי או תושב
 *  (ר' [[cba-service-reactions-recommendations-spec-2026-09-22]]).
 * ========================================================================== */

function svcRecommendCategoryId() {
  var list = svcState.categories || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].name === "המלצות תושבים") return list[i].id;
  }
  return null;
}

/* כרטיס המלצה -> אותו מבנה "שירות" שהקוד הקיים יודע לצייר. גוף הטקסט נכנס
   כסעיף "טקסט" רגיל, וקישור המפות (אם יש) כסעיף "רשימה" עם שורה שמכילה
   URL — linkifyLine הקיים כבר יודע להפוך אותה לכפתור "פתח במפות", בלי
   מנגנון ציור נפרד. */
function svcResidentToService(card) {
  var sections = [{ secId: "body", order: 1, type: "טקסט", title: "על ההמלצה", content: card.body || "" }];
  if (card.mapsUrl) {
    sections.push({ secId: "maps", order: 2, type: "רשימה", title: "קישורים", content: "פתח במפות: " + card.mapsUrl });
  }
  return {
    id: card.id, name: card.title, desc: "", icon: "",
    categoryId: svcState.recCatId || "", legacyKind: "", provider: "",
    phone: "", phoneChannel: "", doc: "", order: 9999,
    active: card.active !== false,
    updated: String(card.updatedAt || "").trim().slice(0, 10), updatedBy: "",
    sections: sections,
    isResident: true, familyId: card.familyId, mapsUrl: card.mapsUrl || "", body: card.body || ""
  };
}

/* טעינה נפרדת מ-getServices (מודל ב', ר' הערה ב-dataService.js) — אם היא
   נכשלת, מסך השירותים הרשמי עדיין עולה, רק בלי ההמלצות באותו רגע. */
function svcLoadResidentExtras(cb) {
  CBA.data.ensureFamilyNames(function () {
    CBA.data.getResidentServiceCards(true, function (res) {
      svcState.residentCards = (res && res.ok && res.cards) || [];
      svcState.residentSvcMap = {};
      svcState.residentCards.forEach(function (c) {
        var svc = svcResidentToService(c);
        svcState.residentSvcMap[svc.id] = c;
        svcState.list.push(svc);
      });
      if (cb) cb();
    });
  });
}

/* אחרי יצירה/עריכה/מחיקה/הסתרה של המלצה — מסיר את הפסאודו-שירותים
   הישנים, טוען מחדש רק אותם (בלי לבזבז קריאה נוספת ל-getServices), ומרענן
   את הרשת דרך svcRepaint (ר' ההערה ליד ההגדרה שלו). */
function svcReloadAfterRecommend() {
  svcState.list = svcState.list.filter(function (s) { return !s.isResident; });
  svcLoadResidentExtras(function () {
    if (typeof svcRepaint === "function") svcRepaint();
  });
}

/* חיפוש כפילות פשוט בצד הלקוח (בלי שירות חיצוני, ר' האפיון) — התאמת
   טקסט בין הכותרת המוקלדת לכותרות ההמלצות הקיימות. */
function svcFindDuplicateTitle(title, excludeId) {
  var t = String(title || "").trim().toLowerCase();
  if (t.length < 2) return null;
  for (var i = 0; i < svcState.residentCards.length; i++) {
    var c = svcState.residentCards[i];
    if (excludeId && c.id === excludeId) continue;
    var n = String(c.title || "").trim().toLowerCase();
    if (!n) continue;
    if (n === t || n.indexOf(t) !== -1 || t.indexOf(n) !== -1) return c;
  }
  return null;
}

/* ---------- טופס יצירה/עריכה של המלצה ---------- */

function svcOpenRecommendForm(existing) {
  var isEdit = !!existing;
  var html =
    '<div class="form-field form-field--wide"><label>כותרת ההמלצה</label>' +
      '<input class="field-input" id="rsvc-title" maxlength="80" value="' + svcEsc(isEdit ? existing.title : "") +
      '" placeholder="למשל: ירקן דוד — פינת הירקות"></div>' +
    '<div class="svc-dup-suggest" id="rsvc-dup"></div>' +
    '<div class="form-field form-field--wide"><label>על ההמלצה</label>' +
      '<textarea class="field-input" id="rsvc-body" rows="5" maxlength="1500" placeholder="למה כדאי, איך מזמינים, וכל מה שיעזור לשכנים">' +
      svcEsc(isEdit ? existing.body : "") + '</textarea></div>' +
    '<div class="form-field form-field--wide"><label>קישור ב-Google Maps (לא חובה)</label>' +
      '<input class="field-input" id="rsvc-maps" dir="ltr" value="' + svcEsc(isEdit ? (existing.mapsUrl || "") : "") +
      '" placeholder="https://maps.app.goo.gl/…"></div>';

  CBA.ui.dialog({
    title: isEdit ? "עריכת ההמלצה" : "המלצה חדשה",
    html: html, wide: true, sticky: true,
    okText: isEdit ? "שמירה" : "פרסום", cancelText: "ביטול",
    onMount: function (wrap, close) {
      var titleEl = wrap.querySelector("#rsvc-title");
      var dupEl = wrap.querySelector("#rsvc-dup");
      titleEl.addEventListener("input", function () {
        var dup = svcFindDuplicateTitle(titleEl.value, isEdit ? existing.id : null);
        if (!dup) { dupEl.style.display = "none"; return; }
        dupEl.style.display = "block";
        dupEl.innerHTML = 'כבר יש המלצה בשם "' + svcEsc(dup.title) +
          '" — אולי כדאי <a href="#" id="rsvc-dup-open">להצטרף אליה</a> (לייק/תגובה) במקום ליצור כפולה.';
        var openLink = dupEl.querySelector("#rsvc-dup-open");
        if (openLink) openLink.addEventListener("click", function (e) {
          e.preventDefault();
          close(false);
          svcOpenDrawer(dup.id);
        });
      });
    },
    onOk: function (wrap, close) {
      var title = wrap.querySelector("#rsvc-title").value;
      var body = wrap.querySelector("#rsvc-body").value;
      var mapsUrl = wrap.querySelector("#rsvc-maps").value;
      if (!String(title || "").trim()) { CBA.ui.toast("צריך כותרת"); return; }
      var okBtn = wrap.querySelector('[data-dlg="ok"]');
      var done = CBA.ui.busy(okBtn, isEdit ? "שומר…" : "מפרסם…");
      var fields = { title: title, body: body, mapsUrl: mapsUrl };
      var after = function (res) {
        done();
        if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "השמירה נכשלה"); return; }
        close(true);
        CBA.ui.toast(isEdit ? "ההמלצה עודכנה" : "ההמלצה פורסמה");
        svcReloadAfterRecommend();
      };
      if (isEdit) CBA.data.updateResidentServiceCard(existing.id, fields, after);
      else CBA.data.createResidentServiceCard(fields, after);
    }
  });
}

/* hideOnly=true — מנהל-על מסתיר (setResidentServiceCardActive), הכרטיס
   נשאר בגיליון/Firestore ואפשר להציג בחזרה ממסך הניהול. hideOnly=false —
   היוצר מוחק לצמיתות (ר' ההערה ב-dataService.js על לייקים/תגובות יתומים). */
function svcDeleteRecommend(cardId, hideOnly) {
  var msg = hideOnly
    ? "להסתיר את הכרטיס מהתושבים? אפשר להציג אותו בחזרה דרך מסך ניהול השירותים."
    : "למחוק את ההמלצה לצמיתות? הפעולה לא הפיכה.";
  CBA.ui.confirm(msg, {
    title: hideOnly ? "הסתרת כרטיס" : "מחיקת המלצה",
    okText: hideOnly ? "הסתרה" : "מחיקה", danger: true
  }).then(function (ok) {
    if (!ok) return;
    var after = function (res) {
      if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "הפעולה נכשלה"); return; }
      svcCloseDrawer();
      CBA.ui.toast(hideOnly ? "הכרטיס הוסתר" : "ההמלצה נמחקה");
      svcReloadAfterRecommend();
    };
    if (hideOnly) CBA.data.setResidentServiceCardActive(cardId, false, after);
    else CBA.data.deleteResidentServiceCard(cardId, after);
  });
}

/* ---------- לייק/דיסלייק + תגובות (בתוך מגירת הכרטיס, כל סוגי הכרטיסים) ---------- */

function svcThumbIcon(up) {
  var d = up
    ? "M7 10v11M2 10h5v11H2zM7 10l4.5-7a1.5 1.5 0 0 1 2.6.9v4.6H19a2 2 0 0 1 2 2.4l-1.4 6a2 2 0 0 1-2 1.6H7"
    : "M17 14V3M22 14h-5V3h5zM17 14l-4.5 7a1.5 1.5 0 0 1-2.6-.9v-4.6H5a2 2 0 0 1-2-2.4l1.4-6a2 2 0 0 1 2-1.6H17";
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>';
}
function svcTrashIcon() {
  return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>';
}

function svcSkeletonReactions() {
  return CBA.skel.rows(2, { avatar: true, actions: false });
}

function svcReactionsHtml(cardId, cardType, reacts, comments) {
  var myFid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
  var isSuperAdmin = window.CBA && CBA.isSuper === true;
  var mine = reacts.mine;

  var reactHtml =
    '<div class="svc-reactions">' +
      '<button type="button" class="svc-react-btn svc-react-btn--like' + (mine === "like" ? " is-on" : "") + '" data-react="like">' +
        svcThumbIcon(true) + " לייק · " + (reacts.like || 0) +
      "</button>" +
      '<button type="button" class="svc-react-btn svc-react-btn--dislike' + (mine === "dislike" ? " is-on" : "") + '" data-react="dislike">' +
        svcThumbIcon(false) + " דיסלייק · " + (reacts.dislike || 0) +
      "</button>" +
      (mine ? '<span class="svc-react-mine">ההצבעה שלך — אפשר לשנות בכל עת</span>' : "") +
    "</div>";

  var commentsHtml =
    '<div class="svc-comments-title">תגובות (' + comments.length + ")</div>" +
    '<div class="svc-comments">' +
      (comments.length ? comments.map(function (c) {
        var mineC = !!(myFid && c.familyId === myFid);
        var canDel = mineC || isSuperAdmin;
        var fam = CBA.data.familyDisplayName(c.familyId) || "תושב";
        var initial = fam.trim().charAt(0) || "?";
        return '<div class="svc-comment' + (mineC ? " svc-comment--mine" : "") + '">' +
            '<div class="svc-comment__ava">' + svcEsc(initial) + "</div>" +
            '<div class="svc-comment__t">' +
              '<div class="svc-comment__head">' +
                '<div class="svc-comment__name">' + svcEsc(fam) +
                  (mineC ? ' <span class="svc-comment__mine-tag">(אתה)</span>' : "") + "</div>" +
                (canDel ? '<button type="button" class="svc-comment__del" data-del-comment="' + svcEsc(c.id) +
                  '" aria-label="מחיקת תגובה">' + svcTrashIcon() + "</button>" : "") +
              "</div>" +
              '<div class="svc-comment__body">' + svcEsc(c.text) + "</div>" +
            "</div>" +
          "</div>";
      }).join("") : '<div class="svc-comment-empty">היו הראשונים להגיב.</div>') +
    "</div>" +
    (myFid
      ? '<div class="svc-comment-form"><input type="text" class="field-input" id="svc-comment-input" maxlength="500" placeholder="הוסיפו תגובה…">' +
          '<button type="button" class="btn-primary btn-sm" id="svc-comment-send">שלח</button></div>'
      : "");

  return reactHtml + commentsHtml;
}

function svcBindReactionZone(zone, cardId, cardType) {
  zone.querySelectorAll("[data-react]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = btn.dataset.react;
      var isOn = btn.classList.contains("is-on");
      var done = CBA.ui.busy(btn, "");
      if (isOn) {
        CBA.data.clearServiceReaction(cardId, function () { done(); svcPaintReactions(cardId); });
      } else {
        CBA.data.setServiceReaction(cardId, cardType, val, function () { done(); svcPaintReactions(cardId); });
      }
    });
  });

  var sendBtn = zone.querySelector("#svc-comment-send");
  var input = zone.querySelector("#svc-comment-input");
  if (sendBtn && input) {
    var send = function () {
      var text = input.value;
      if (!text || !text.trim()) return;
      var done = CBA.ui.busy(sendBtn, "שולח…");
      CBA.data.addServiceComment(cardId, cardType, text, function (res) {
        done();
        if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "שליחה נכשלה"); return; }
        svcPaintReactions(cardId);
      });
    };
    sendBtn.addEventListener("click", send);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
  }

  zone.querySelectorAll("[data-del-comment]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      CBA.ui.confirm("למחוק את התגובה?", { title: "מחיקת תגובה", okText: "מחיקה", danger: true }).then(function (ok) {
        if (!ok) return;
        CBA.data.deleteServiceComment(btn.dataset.delComment, function (res) {
          if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "מחיקה נכשלה"); return; }
          svcPaintReactions(cardId);
        });
      });
    });
  });
}

/* טוען לייקים/דיסלייקים/תגובות ומצייר אותם בתוך #svc-react-zone שבמגירה
   הפתוחה. אם המגירה נסגרה בינתיים (משתמש לחץ Escape בזמן שהבקשה עדיין
   באוויר) — הבדיקה על קיום הרכיב מונעת ציור על תוכן שכבר לא במסך. */
function svcPaintReactions(cardId) {
  var svc = null;
  for (var i = 0; i < svcState.list.length; i++) if (svcState.list[i].id === cardId) svc = svcState.list[i];
  if (!svc) return;
  var cardType = svc.isResident ? "resident" : "official";

  CBA.data.getServiceReactions(cardId, function (rres) {
    CBA.data.getServiceComments(cardId, function (cres) {
      var reacts = (rres && rres.ok) ? rres : { like: 0, dislike: 0, mine: null };
      var comments = (cres && cres.ok && cres.comments) || [];

      // מעדכן גם את מטמון הספירה של הרשת הראשית (בלי בקשה נוספת ל-
      // Firestore) — כדי שמספר הלייקים על הקוביה יישאר תואם למה שקורה
      // בתוך המגירה, בלי לחכות לרענון מלא של המסך.
      svcState.reactionCounts[cardId] = { like: reacts.like || 0, dislike: reacts.dislike || 0 };
      svcState.commentCounts[cardId] = comments.length;
      if (typeof svcRepaint === "function") svcRepaint();

      var zone = document.querySelector('#svc-react-zone[data-cardid]');
      if (!zone || zone.dataset.cardid !== cardId) return;
      zone.innerHTML = svcReactionsHtml(cardId, cardType, reacts, comments);
      svcBindReactionZone(zone, cardId, cardType);
    });
  });
}

/* שורת מספרים על גבי הקוביה עצמה ברשת הראשית (2026-09-23, ר' בקשת יועד) —
   נטענת פעם אחת לכל המסך (svcLoadEngagementSummary), לא לכל כרטיס בנפרד. */
function svcLoadEngagementSummary(cb) {
  CBA.data.getServiceEngagementSummary(function (res) {
    svcState.reactionCounts = (res && res.ok && res.reactions) || {};
    svcState.commentCounts = {};
    var c = (res && res.ok && res.comments) || {};
    Object.keys(c).forEach(function (id) { svcState.commentCounts[id] = c[id]; });
    if (cb) cb();
  });
}

function svcCommentIcon() {
  return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
}

function svcCardReactsHtml(cardId) {
  var r = svcState.reactionCounts[cardId] || { like: 0, dislike: 0 };
  var cc = svcState.commentCounts[cardId] || 0;
  return '<div class="svc-card__reacts">' +
      '<span class="svc-card__react svc-card__react--like">' + svcThumbIcon(true) + r.like + "</span>" +
      '<span class="svc-card__react svc-card__react--dislike">' + svcThumbIcon(false) + r.dislike + "</span>" +
      '<span class="svc-card__react svc-card__react--comments">' + svcCommentIcon() + cc + "</span>" +
    "</div>";
}
