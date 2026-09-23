/* ============================================================================
 *  סידור שבועי — שכבת הנתונים   (2026-09-23, אפיון "סידור שבועי לגנן")
 * ----------------------------------------------------------------------------
 *  🔑 **השיבוץ הוא שדה אחד על מסמך המשימה** — `slot` — ולא אוסף נפרד.
 *     הכרעת יועד (23.9): "שמירה על מסמך המשימה". אוסף נפרד היה מקום שני
 *     שצריך לסנכרן, ומשימה שנמחקה או נסגרה הייתה משאירה בלוק יתום.
 *
 *     slot = { date: "YYYY-MM-DD", start: דקות מחצות, dur: דקות }
 *     slot = null  →  "לא בסידור"
 *
 *  🔴🔴 **הסידור שקוף לכל השאר.** (יועד, 23.9: "אין שום השפעה של הסידור
 *     השבועי על עמידה ביעדים, משימות נגררות וכאלה.")
 *     לכן הכתיבה כאן נוגעת ב-`slot` וב-`updatedAt` **בלבד** — לא ב-`week`,
 *     לא ב-`firstWeek`, לא ב-`drags`, לא ב-`flag`, לא ב-`stage`.
 *     הכלל `gtSlotUpdateOk` בכללי Firestore אוכף בדיוק את זה, ולכן גם באג
 *     כאן לא יכול לגרור משימה או לשנות לה שלב.
 *     ⚠️ `updatedAt` כן מתעדכן — בלעדיו הגיבוי המצטבר (`updatedAt > X`)
 *        לא היה רואה את השינוי, והשחזור היה מאבד שיבוצים.
 *
 *  ⚠️ אין כאן יומן ואין מייל. זה כלי עבודה של הצוות, לא אינטראקציה
 *     עם תושב, ושורת יומן לכל הזזה הייתה מציפה את היסטוריית המשימה.
 *
 *  ⚠️ מסלול Firestore בלבד. בנפילה-לאחור ל-Apps Script אין `slot` בשורות
 *     ואין לאן לכתוב — ולכן המסך מציג את הסידור רק כשהכתיבה הישירה דלוקה
 *     (`CBA.data.gardenDirectWrites()`), ולא מבטיח משהו שלא יתקיים.
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};

  /* גבולות היום — 06:00 עד 23:00. **חייבים להיות זהים ל-gtSlotOk בכללים.** */
  var DAY_START = 6 * 60;       // 360
  var DAY_END   = 23 * 60;      // 1380
  var STEP      = 15;           // רזולוציית המשך
  var DATE_RE   = /^\d{4}-\d{2}-\d{2}$/;

  function valid(s) {
    if (s === null) return true;
    if (!s || typeof s !== "object") return false;
    if (!DATE_RE.test(String(s.date || ""))) return false;
    var a = s.start, d = s.dur;
    if (typeof a !== "number" || typeof d !== "number") return false;
    if (a % 1 || d % 1) return false;
    if (a < DAY_START || d < STEP || a + d > DAY_END) return false;
    return true;
  }

  /* מה שנכתב בפועל — שלושה מפתחות בדיוק, כי הכלל בודק `hasOnly`. */
  function clean(s) {
    if (s === null) return null;
    return { date: String(s.date), start: Math.round(s.start), dur: Math.round(s.dur) };
  }

  function fsErr(e) {
    var code = String((e && (e.code || e.message)) || e || "");
    if (/permission/i.test(code)) {
      return "אין הרשאה לשמור את השיבוץ. אם זה חוזר — צריך לעדכן את כללי האבטחה.";
    }
    if (/unavailable|network|offline|timeout/i.test(code)) {
      return "אין חיבור כרגע — השיבוץ לא נשמר. נסה שוב.";
    }
    return "השיבוץ לא נשמר. נסה שוב.";
  }

  /** כתיבת שיבוץ (או null להסרה) למשימה אחת.
   *  cb({ ok, error? }) — נקרא פעם אחת בדיוק. */
  function write(taskId, slot, cb) {
    cb = cb || function () {};
    if (!valid(slot)) return cb({ ok: false, error: "שעה או משך לא תקינים" });
    if (!(CBA.fb && CBA.fb.updateDoc)) return cb({ ok: false, error: "החיבור למסד עוד לא מוכן" });
    var patch = {
      slot: clean(slot),
      updatedAt: CBA.fb.serverNow ? CBA.fb.serverNow() : new Date()
    };
    var done = false;
    CBA.fb.updateDoc("gardenTasks", String(taskId), patch, function (e) {
      if (done) return; done = true;
      if (e) return cb({ ok: false, error: fsErr(e) });
      cb({ ok: true });
    });
  }

  /* ==========================================================================
   *  הערכת זמן — "לומדת" מהסידורים הקודמים   (23.9, בקשת יועד)
   * --------------------------------------------------------------------------
   *  🔑 **אין כאן אחסון חדש.** כל משימה שכבר שובצה פעם נושאת `slot.dur` —
   *     כמה זמן הצוות הקצה לה. המסך טוען ממילא את *כל* המשימות (כולל
   *     הסגורות), ולכן ההיסטוריה כבר בזיכרון.
   *  סדר המקורות — מהספציפי לכללי:
   *    1. אותה תבנית שגרה (templateId) — "כיסוח מדשאה צפונית" של שבועות קודמים.
   *    2. אותה כותרת + קטגוריה.
   *    3. אותה קטגוריה (לפחות 2 דוגמאות, אחרת זה רעש).
   *    4. ברירת מחדל לפי קטגוריה.
   *  חציון ולא ממוצע: פעם אחת של "4 שעות כי היה גשם" לא מזיזה את ההערכה.
   *  🔁 **הלולאה:** מה שהגנן מתקן בהערכה נשמר כמשך של השיבוץ, ולכן הופך
   *     להיסטוריה של הפעם הבאה. אין "אימון" נפרד — השימוש הוא האימון.
   *  ⚠️ זה זמן **מתוכנן**, לא זמן בפועל. אין במערכת שעת התחלה/סיום של
   *     ביצוע; שדה כזה הוא גרסה 2 (ר' המפרט).
   * ========================================================================== */
  var DEFAULTS = { lawn: 120, water: 60, tree: 90, prune: 90, weed: 90, clean: 60, bed: 90 };
  var FAULT_DEFAULT = 60;

  function catKey(t) {
    var GL = CBA.gardenLang;
    var c = GL && GL.catOfTask ? GL.catOfTask(t) : (GL && GL.catOf ? GL.catOf(t && t.category) : null);
    return (c && c.key) || "";
  }
  function median(xs) {
    var a = xs.slice().sort(function (x, y) { return x - y; }), n = a.length;
    if (!n) return 0;
    var m = n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
    return Math.max(STEP, Math.round(m / STEP) * STEP);
  }
  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  /** { dur, src: "template"|"title"|"category"|"default", n } */
  function estimate(t, rows) {
    t = t || {};
    var hist = (rows || []).filter(function (r) {
      return r && r !== t && String(r.id) !== String(t.id) && r.slot && valid(r.slot) && !r.pendingDelete;
    });
    var tpl = t.templateId ? hist.filter(function (r) { return r.templateId && r.templateId === t.templateId; }) : [];
    if (tpl.length) return { dur: median(tpl.map(function (r) { return r.slot.dur; })), src: "template", n: tpl.length };
    var tt = norm(t.title), tc = norm(t.category);
    var same = tt ? hist.filter(function (r) { return norm(r.title) === tt && norm(r.category) === tc; }) : [];
    if (same.length) return { dur: median(same.map(function (r) { return r.slot.dur; })), src: "title", n: same.length };
    var k = catKey(t);
    var cat = k ? hist.filter(function (r) { return catKey(r) === k; }) : [];
    if (cat.length >= 2) return { dur: median(cat.map(function (r) { return r.slot.dur; })), src: "category", n: cat.length };
    var isFault = !!t.repId || t.kind === "דיווח תושב";
    return { dur: isFault ? FAULT_DEFAULT : (DEFAULTS[k] || 60), src: "default", n: 0 };
  }
  function estimateText(e) {
    if (!e) return "";
    if (e.src === "default") return "הערכה ראשונית";
    var times = e.n === 1 ? "פעם אחת" : e.n + " פעמים";
    return e.src === "category" ? "לפי " + times + " בקטגוריה" : "לפי " + times + " קודמות";
  }

  CBA.gardenSlots = {
    DAY_START: DAY_START, DAY_END: DAY_END, STEP: STEP,
    valid: valid, clean: clean, write: write,
    estimate: estimate, estimateText: estimateText
  };
})();
