/* ============================================================================
 *  gardenRules.js — כללי החזרתיות ומנוע האופק של תוכנית העבודה
 *  2026-09-22 · הגינון ל-Firestore מלא
 * ----------------------------------------------------------------------------
 *  🔴🔴 **קובץ אחד, שני צדדים.** אותו קובץ בדיוק נטען בדפדפן (index.html)
 *  וב-Apps Script (GardenRules.gs). `tools/test-garden-rules.js` מפיל את
 *  המארז אם שני העותקים אינם זהים לבית. זה מה שמונע ממסך הנתונים,
 *  מהדפדפן ומהטריגר השעתי לסטות זה מזה בשקט — מלכודת השכפול מהאפיון.
 *
 *  ולכן: **אין כאן שום תלות בסביבה.** לא window, לא CBA, לא
 *  SpreadsheetApp, לא Utilities. פונקציות טהורות על אובייקטים.
 *
 *  🔑 **המודל (יועד, 8.9 ו-22.9):** הגדרה = כלל חזרה. מופע = מסמך משימה
 *  שנולד מהכלל לשבוע ואזור מסוימים. המנוע מחזיק **אופק** של
 *  GARDEN_HORIZON_WEEKS שבועות קדימה מלאים במופעים, ומתאם אותם לכלל:
 *  מופע שהכלל כבר לא מייצר **ואיש לא נגע בו** — יורד. מופע שנגעו בו —
 *  נשאר לנצח, כי הוא היסטוריה. שינוי בהגדרה נכנס לתוקף מ-`effectiveFrom`.
 *
 *  ⚠️ שבוע 5 לעולם אינו מקבל שגרה. החודש הוא ארבעה שבועות (החלטת
 *     יועד); השבוע החמישי נוצר רק כשמשימה **נגררת** אליו.
 * ========================================================================== */

var GardenRules = (function () {
  'use strict';

  /** כמה שבועות קדימה האופק מלא. 8 = כל משימה חודשית נראית תמיד. */
  var GARDEN_HORIZON_WEEKS = 8;

  var KIND_ROUTINE = 'שגרה';
  var STAGE_PLANNED = 'מתוכנן';
  var FREQS = ['שבועי', 'דו-שבועי', 'חודשי', 'שנתי'];

  /* ---------- שבועות ---------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** מפתח שבוע = תאריך יום ראשון, 'YYYY-MM-DD'. צהריים — חסין שעון קיץ. */
  function weekKey(d) {
    var t = d ? new Date(d) : new Date();
    if (isNaN(t.getTime())) t = new Date();
    t.setHours(12, 0, 0, 0);
    t.setDate(t.getDate() - t.getDay());
    return t.getFullYear() + '-' + pad2(t.getMonth() + 1) + '-' + pad2(t.getDate());
  }

  function weekShift(key, weeks) {
    var p = String(key || '').split('-');
    var t = new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0);
    if (isNaN(t.getTime())) t = new Date();
    t.setDate(t.getDate() + 7 * (weeks || 0));
    return weekKey(t);
  }

  /** פירוק מפתח שבוע: מספר השבוע בחודש (1–5), חודש, שנה. */
  function weekMeta(key) {
    var p = String(key || '').split('-');
    var d = new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0);
    if (isNaN(d.getTime())) return null;
    return { date: d, n: Math.floor((d.getDate() - 1) / 7) + 1,
             month: d.getMonth() + 1, year: d.getFullYear() };
  }

  /* ---------- הכללים (פורט 1:1 מ-Code.gs, 8.9) ---------- */

  /** '3-11' · '10' · '11,12,1,2' · ריק. null = כל השנה. */
  function parseMonths(txt) {
    var t = String(txt || '').trim();
    if (!t) return null;
    var out = {};
    t.split(',').forEach(function (part) {
      var m = part.trim().match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})$/);
      if (m) {
        var a = +m[1], b = +m[2];
        for (var i = 0; i < 12; i++) {
          var mo = ((a - 1 + i) % 12) + 1;
          out[mo] = 1;
          if (mo === b) break;
        }
      } else {
        var one = parseInt(part, 10);
        if (one >= 1 && one <= 12) out[one] = 1;
      }
    });
    return Object.keys(out).length ? out : null;
  }

  /** מונה המופעים מאז העוגן — לדו-שבועי ולסבב אזורים. */
  function occIndex(def, meta) {
    var a = weekMeta(def.firstWeek) ||
            weekMeta(weekKey(new Date(meta.year, 0, 1)));
    var days = Math.round((meta.date.getTime() - a.date.getTime()) / 86400000);
    if (def.freq === 'שבועי')     return Math.floor(days / 7);
    if (def.freq === 'דו-שבועי')  return Math.floor(days / 14);
    if (def.freq === 'חודשי')     return (meta.year - a.year) * 12 + (meta.month - a.month);
    return meta.year - a.year;
  }

  /** האם ההגדרה חלה על השבוע הזה. */
  function applies(def, meta) {
    if (!def || def.active === false) return false;
    if (meta.n === 5) return false;
    var wk = weekKey(meta.date);
    if (def.firstWeek && def.firstWeek > wk) return false;
    /* 🔑 effectiveFrom — שינוי בהגדרה נכנס לתוקף מהשבוע הזה והלאה. */
    if (def.effectiveFrom && def.effectiveFrom > wk) return false;

    var months = parseMonths(def.months);
    if (months && !months[meta.month]) return false;

    if (def.freq === 'שבועי') return true;
    if (def.freq === 'דו-שבועי') {
      var a = weekMeta(def.firstWeek);
      if (!a) return meta.n === 1 || meta.n === 3;
      var days = Math.round((meta.date.getTime() - a.date.getTime()) / 86400000);
      return days % 14 === 0;
    }
    var wom = parseInt(def.weekOfMonth, 10) || 1;
    return meta.n === Math.min(Math.max(wom, 1), 4);
  }

  /** האזורים שמקבלים עבודה במופע. ריק = משימה כללית אחת. סבב = אחד לפי התור. */
  function areasFor(def, meta) {
    var list = (def.areas || []).filter(Boolean);
    if (!list.length) return [''];
    if (!def.rotate) return list;
    var i = (def.freq === 'שבועי') ? (meta.n - 1) : occIndex(def, meta);
    return [list[((i % list.length) + list.length) % list.length]];
  }

  /** מה *אמור* לקרות בשבוע — המכנה של "עמידה בתוכנית". */
  function forWeek(defs, key) {
    var meta = weekMeta(key);
    if (!meta) return [];
    var out = [];
    (defs || []).forEach(function (def) {
      if (!applies(def, meta)) return;
      areasFor(def, meta).forEach(function (area) {
        out.push({ def: def, week: key, area: area });
      });
    });
    return out;
  }

  /* ---------- מופעים ---------- */

  /** מזהה מופע דטרמיניסטי. 🔑 זה מה שהופך את המנוע לאידמפוטנטי בין
   *  שני דפדפנים ובין הדפדפן לשרת: אותו מופע = אותו מזהה, ו-create
   *  שני פשוט נכשל. בלי מונה, בלי נעילה. */
  function occId(defId, week, area) {
    return ('R_' + defId + '_' + week + '_' + (area || 'כללי')).replace(/\//g, '-');
  }

  function occKey(defId, week, area) { return defId + '|' + week + '|' + (area || ''); }

  /** מסמך משימה חדש למופע — בדיוק בצורת gtFields בכללי האבטחה. */
  function newOccDoc(def, week, area, now, year) {
    return {
      id: occId(def.id, week, area),
      kind: KIND_ROUTINE, templateId: String(def.id),
      title: String(def.title || ''), category: String(def.category || ''),
      area: String(area || ''), x: null, y: null,
      stage: STAGE_PLANNED, flag: '', closure: '',
      week: week, due: '', note: '', drags: 0, firstWeek: week,
      createdAt: now, updatedAt: now, approvedBy: '', approvedAt: '',
      repId: '', photos: [], order: 0,
      year: String(year || ''), schema: 1
    };
  }

  /** "נגעו בה" — כל סימן שאדם עשה משהו. מופע כזה הוא היסטוריה ולא נמחק. */
  function touched(t) {
    if (!t) return false;
    if (String(t.stage || STAGE_PLANNED) !== STAGE_PLANNED) return true;
    if (String(t.flag || '') || String(t.closure || '') || String(t.note || '')) return true;
    if ((parseInt(t.drags, 10) || 0) > 0) return true;
    if (t.firstWeek && t.week && String(t.firstWeek) !== String(t.week)) return true;
    if (t.photos && t.photos.length) return true;
    if (String(t.approvedBy || '')) return true;
    return false;
  }

  /* ---------- המנוע ----------
   *  horizon(defs, tasks, fromWeek, opts) → { create: [doc], remove: [id],
   *                                          kept: n, frozen: n, weeks: [...] }
   *  - desired  = כל המופעים ש-forWeek מייצר לשבועות [from, from+H)
   *  - existing = משימות שגרה קיימות בחלון, לפי (templateId, week, area)
   *  - create   = desired שאין לו קיים
   *  - remove   = קיים שאינו desired **ולא נגעו בו** — למעט מופע ששבועו
   *               קודם ל-effectiveFrom של ההגדרה שלו (קפוא: "מהשבוע הבא"
   *               אומר שהשבוע הנוכחי נשאר כפי שהיה).
   *  ⚠️ הגדרה שנמחקה: כל מופעיה העתידיים שלא נגעו בהם יורדים. */
  function horizon(defs, tasks, fromWeek, opts) {
    opts = opts || {};
    var H = opts.weeks || GARDEN_HORIZON_WEEKS;
    var now = opts.now || new Date();
    var year = opts.year || '';
    var from = fromWeek || weekKey(now);
    var toExcl = weekShift(from, H);

    var defById = {};
    (defs || []).forEach(function (d) { if (d && d.id) defById[String(d.id)] = d; });

    var weeks = [];
    for (var i = 0; i < H; i++) weeks.push(weekShift(from, i));

    var desired = {};
    weeks.forEach(function (wk) {
      forWeek(defs, wk).forEach(function (o) {
        desired[occKey(o.def.id, wk, o.area)] = o;
      });
    });

    /* ⚠️ מערך לכל סלוט, לא מסמך אחד: משימה שנגררה לשבוע הבא נוחתת על
       הסלוט של המופע שכבר שם. שניהם חייבים להיספר — אחרת אחד מהם
       נעלם מההחלטה בשקט (נתפס במארז, 22.9). */
    var existing = {};
    (tasks || []).forEach(function (t) {
      if (!t || String(t.kind || '') !== KIND_ROUTINE) return;
      var wk = String(t.week || '');
      if (!wk || wk < from || wk >= toExcl) return;
      var k = occKey(String(t.templateId || ''), wk, t.area);
      (existing[k] = existing[k] || []).push(t);
    });

    var create = [], remove = [], rename = [], kept = 0, frozen = 0;
    Object.keys(desired).forEach(function (k) {
      var o = desired[k];
      if (existing[k] && existing[k].length) {
        kept++;
        /* 🔴 22.9 (סימולציה, ממצא F) — **שם/קטגוריה חדשים מגיעים לכרטיסים
           שכבר נוצרו.** בלי זה שינוי שם בתבנית הופיע רק במופעים שייווצרו
           בעתיד, ו-8 שבועות של כרטיסים נשארו עם השם הישן. רק מופעים שלא
           נגעו בהם ורק אם ההגדרה בתוקף לשבוע (effectiveFrom) — נגוע
           הוא היסטוריה, וההיסטוריה לא משתנה. */
        existing[k].forEach(function (t) {
          if (touched(t)) return;
          if (o.def.effectiveFrom && String(t.week) < String(o.def.effectiveFrom)) return;
          var title = String(o.def.title || ''), cat = String(o.def.category || '');
          if (String(t.title || '') === title && String(t.category || '') === cat) return;
          rename.push({ id: String(t.id), title: title, category: cat });
        });
        return;
      }
      create.push(newOccDoc(o.def, o.week, o.area, now, year));
    });
    Object.keys(existing).forEach(function (k) {
      if (desired[k]) return;
      existing[k].forEach(function (t) {
        var def = defById[String(t.templateId || '')];
        if (def && def.effectiveFrom && String(t.week) < String(def.effectiveFrom)) { frozen++; return; }
        if (touched(t)) { frozen++; return; }
        remove.push(String(t.id));
      });
    });

    return { create: create, remove: remove, rename: rename, kept: kept, frozen: frozen,
             weeks: weeks, from: from, horizonWeeks: H };
  }

  /** האם שינוי בהגדרה משפיע על מופעים (ואז שואלים "מאיזה שבוע"). */
  function affectsOccurrences(before, after) {
    if (!before) return true;
    var keys = ['freq', 'firstWeek', 'weekOfMonth', 'months', 'rotate', 'active', 'category', 'title'];
    for (var i = 0; i < keys.length; i++) {
      if (String(before[keys[i]] == null ? '' : before[keys[i]]) !==
          String(after[keys[i]] == null ? '' : after[keys[i]])) return true;
    }
    var a = (before.areas || []).slice().sort().join('|');
    var b = (after.areas || []).slice().sort().join('|');
    return a !== b;
  }

  return {
    HORIZON_WEEKS: GARDEN_HORIZON_WEEKS, KIND_ROUTINE: KIND_ROUTINE, FREQS: FREQS,
    weekKey: weekKey, weekShift: weekShift, weekMeta: weekMeta,
    parseMonths: parseMonths, occIndex: occIndex, applies: applies,
    areasFor: areasFor, forWeek: forWeek,
    occId: occId, occKey: occKey, newOccDoc: newOccDoc, touched: touched,
    horizon: horizon, affectsOccurrences: affectsOccurrences
  };
})();

/* בדפדפן — גם תחת CBA, כדי שהמסכים יגיעו אליו בדרך הרגילה. */
if (typeof CBA !== 'undefined' && CBA) { CBA.gardenRules = GardenRules; }
