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
        kind: String(r["סוג שירות"] || "").trim() === KIND_INFRA ? KIND_INFRA : KIND_VENDOR,
        provider: String(r["ספק"] || "").trim(),
        phone: String(r["טלפון ראשי"] || "").trim(),
        doc: String(r["קישור למסמך"] || "").trim(),
        order: Number(r["סדר"] || 0) || 0,
        active: String(r["פעיל"] == null ? "כן" : r["פעיל"]).trim() !== "לא",
        updated: String(r["עודכן"] || "").trim(),
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
        "אייקון": s.icon, "סוג שירות": s.kind || KIND_VENDOR,
        "ספק": s.provider, "טלפון ראשי": s.phone,
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
      return { name: (p[0] || "").trim(), role: (p[1] || "").trim(), phone: (p[2] || "").trim() };
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

  /* ציור סעיף בודד ל-HTML. משמש גם את מסך התושב וגם את התצוגה-המקדימה
     שבמסך הניהול, כדי שמה שהמנהל רואה בעריכה יהיה מה שהתושב יראה בפועל. */
  function renderSection(sec) {
    var c = sec.content || "";
    if (sec.type === "טקסט") {
      return c.split(/\n\s*\n/).filter(function (p) { return p.trim() !== ""; })
        .map(function (p) { return '<p class="svc-p">' + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
    }
    if (sec.type === "הדגשה") {
      return '<div class="svc-hilite"><span class="svc-hilite__ico">!</span><div>' +
        esc(c).replace(/\n/g, "<br>") + "</div></div>";
    }
    if (sec.type === "רשימה") {
      return '<ul class="svc-ul">' + toLines(c).map(function (l) {
        return "<li>" + esc(l) + "</li>";
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
        if (p.phone) {
          acts =
            '<button type="button" class="svc-icb" data-call="' + esc(p.phone) + '" title="חיוג" aria-label="חיוג ל' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' +
            "</button>" +
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
    build: build, flatten: flatten,
    parseHours: parseHours, hoursStatus: hoursStatus,
    serviceHours: serviceHours, serviceStatus: serviceStatus, renderHours: renderHours,
    toLines: toLines, toGrid: toGrid, toContacts: toContacts,
    telDigits: telDigits, waDigits: waDigits,
    renderSection: renderSection, searchText: searchText
  };
})();

/* ============================================================================
 *  מסך התושב
 * ========================================================================== */
var svcState = { list: [], loaded: false, query: "" };

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
    container.innerHTML =
      '<div class="screen-head"><div class="screen-head__title">שירותים</div>' +
      '<div class="screen-head__sub">כל השירותים בשיכון — פרטים מלאים, מחירים ואנשי קשר</div></div>' +
      '<div id="svc-body"></div>';

    var body = container.querySelector("#svc-body");

    function paint() {
      body.innerHTML =
        '<div class="svc-toolbar">' +
          '<div class="svc-search">' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
            '<input id="svc-q" class="field-input" placeholder="חיפוש שירות, ספק או תוכן…" value="' + svcEsc(svcState.query) + '">' +
          "</div>" +
          '<span class="svc-count" id="svc-count"></span>' +
        "</div>" +
        '<div class="svc-grid" id="svc-grid"></div>';
      paintGrid();

      var q = body.querySelector("#svc-q");
      q.addEventListener("input", function () { svcState.query = q.value; paintGrid(); });
    }

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
        return '<article class="svc-card" data-svc="' + svcEsc(s.id) + '">' +
            (s.icon ? '<div class="svc-card__ico">' + svcEsc(s.icon) + "</div>" : "") +
            '<h3 class="svc-card__name">' + svcEsc(s.name) + "</h3>" +
            svcStatusTag(s) +
            (s.provider ? '<div class="svc-card__prov">' + svcEsc(s.provider) + "</div>" : "") +
            (s.desc ? '<p class="svc-card__desc">' + svcEsc(s.desc) + "</p>" : '<p class="svc-card__desc"></p>') +
            '<div class="svc-card__acts">' +
              '<button type="button" class="btn-primary btn-sm" data-open="' + svcEsc(s.id) + '">כל הפרטים</button>' +
              (s.phone ? '<button type="button" class="btn-ghost btn-sm" data-call="' + svcEsc(s.phone) + '">חיוג</button>' : "") +
            "</div>" +
          "</article>";
      }

      /* פיצול לשתי קבוצות — אבל רק כשבאמת יש שתיים. כותרת קבוצה מעל רשימה
         שהיא ממילא הכול היא רעש, ולכן בשיכון שבו הוגדרו רק ספקים המסך נראה
         בדיוק כמו קודם. */
      var infra = list.filter(function (s) { return s.kind === CBA.serviceUtils.KIND_INFRA; });
      var vend = list.filter(function (s) { return s.kind !== CBA.serviceUtils.KIND_INFRA; });
      grid.innerHTML = (infra.length && vend.length)
        ? '<h2 class="svc-group">תשתיות השיכון</h2><div class="svc-grid__in">' +
            infra.map(card).join("") + "</div>" +
          '<h2 class="svc-group">ספקים ושירותים</h2><div class="svc-grid__in">' +
            vend.map(card).join("") + "</div>"
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
      svcState.loaded = true;
      paint();
    });
  }
};

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

  var overlay = document.createElement("div");
  overlay.id = "svc-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-sclose></div>' +
    '<aside class="drawer" role="dialog" aria-label="פרטי שירות">' +
      '<div class="drawer__head">' +
        '<div class="svc-drawer__head">' +
          (svc.icon ? '<span class="svc-drawer__ico">' + svcEsc(svc.icon) + "</span>" : "") +
          "<div><div class=\"drawer__title\">" + svcEsc(svc.name) + "</div>" +
          (svc.provider ? '<div class="drawer__sub">' + svcEsc(svc.provider) + "</div>" : "") +
          svcStatusTag(svc) + "</div>" +
        "</div>" +
        '<button class="drawer__close" data-sclose aria-label="סגור">×</button>' +
      "</div>" +
      '<div class="drawer__body svc-drawer__body">' +
        (sectionsHtml || '<div class="club-empty">אין עדיין פרטים לשירות הזה.</div>') +
        (svc.updated ? '<div class="svc-updated">עודכן לאחרונה: ' + svcEsc(svc.updated) + "</div>" : "") +
      "</div>" +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          (svc.phone ? '<button type="button" class="btn-primary" data-call="' + svcEsc(svc.phone) + '">חיוג' +
            (svc.provider ? " ל" + svcEsc(svc.provider) : "") + "</button>" : "") +
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
  document.addEventListener("keydown", svcDrawerKey);
}
