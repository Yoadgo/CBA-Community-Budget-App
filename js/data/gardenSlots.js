/* ============================================================================
 *  סידור שבועי — שכבת הנתונים   (2026-09-23, אפיון "סידור שבועי לגנן")
 * ----------------------------------------------------------------------------
 *  🔑 **השיבוץ הוא שדה אחד על מסמך המשימה** — `slot` — ולא אוסף נפרד.
 *     הכרעת יועד (23.9): "שמירה על מסמך המשימה". אוסף נפרד היה מקום שני
 *     שצריך לסנכרן, ומשימה שנמחקה או נסגרה הייתה משאירה בלוק יתום.
 *
 *     slot = { date: "YYYY-MM-DD", start: דקות מחצות, dur: דקות,
 *              who?: ["74:2"], act?: דקות בפועל, done?: true,
 *              p1?: { date, start, dur, who?, act?, done? }, p2?: { … } }
 *     slot = null  →  "לא בסידור"
 *
 *  ✂️ 25.9 — **משימה בכמה ימים** (יועד: "צריך אולי לפצל משימה ליותר מיום
 *     אחד, זאת אומרת המשך ביום אחר"). החלקים נשמרים **באותו שדה** — החלק
 *     הראשון הוא slot עצמו, וההמשכים ב-slot.p1 / slot.p2 (שלושה חלקים
 *     בסך הכול). כך הכתיבה נשארת אטומית (שדה אחד), הכלל נשאר אותו כלל,
 *     וקוד שלא מכיר את ההמשכים רואה פשוט את החלק הראשון.
 *     🔴 **מפות ולא רשימה.** נוסה קודם `more: [..]` — וכללי Firestore דחו
 *     כל רשימה עם שני איברים, גם כשהבדיקה של האיבר השני הייתה זהה לראשון
 *     (נבדק חי 23.9, גם בבדיקה מוטמעת בלי פונקציה). עם p1/p2 — עובד.
 *     `more` ישן (אם נשמר ב-15 הדקות שבהן היה חי) עדיין נקרא, ונכתב מחדש כ-p1.
 *     🔑 החלקים **תמיד ממוינים כרונולוגית** (fromParts) — slot עצמו הוא
 *     המוקדם, ולכן "יום רגיל"/"שעה רגילה" בפרופיל ממשיכים לעבוד.
 *     `done` = החלק הזה הסתיים (הכרעת יועד: "בוצע" על חלק שאינו האחרון
 *     מסמן רק אותו). המשימה עצמה נסגרת רק מהחלק האחרון, בדרך הרגילה.
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
  var WHO_RE    = /^\d{1,6}:\d$/;          // מזהה-שורה:משבצת — אטום, בלי שם

  var MAX_PARTS = 3;
  function validPart(s) {
    if (!s || typeof s !== "object") return false;
    if (!DATE_RE.test(String(s.date || ""))) return false;
    var a = s.start, d = s.dur;
    if (typeof a !== "number" || typeof d !== "number") return false;
    if (a % 1 || d % 1) return false;
    if (a < DAY_START || d < STEP || a + d > DAY_END) return false;
    /* 24.9 — עובדים (מפתחות אטומים "74:2") ומשך בפועל בדקות. שניהם אופציונליים. */
    if (s.who != null && !(s.who instanceof Array && s.who.length <= 6 &&
        s.who.every(function (k) { return WHO_RE.test(String(k)); }))) return false;
    if (s.act != null && !(typeof s.act === "number" && s.act % 1 === 0 && s.act >= 5 && s.act <= 720)) return false;
    if (s.done != null && typeof s.done !== "boolean") return false;
    return true;
  }
  function valid(s) {
    if (s === null) return true;
    if (!validPart(s)) return false;
    var extra = [s.p1, s.p2].filter(function (p) { return p != null; });
    if (!extra.every(function (p) { return validPart(p) && p.p1 == null && p.p2 == null && p.more == null; })) return false;
    if (s.more != null && !(s.more instanceof Array && s.more.length + extra.length <= MAX_PARTS - 1 &&
        s.more.every(function (p) { return validPart(p); }))) return false;
    return true;
  }

  /* מה שנכתב בפועל — רק המפתחות שהכלל מכיר (`hasOnly`). who ריק / act ריק
     לא נכתבים בכלל, כדי שמסמך בלי עובדים ייראה בדיוק כמו לפני 24.9. */
  function cleanPart(s) {
    var o = { date: String(s.date), start: Math.round(s.start), dur: Math.round(s.dur) };
    if (s.who && s.who.length) o.who = s.who.map(String);
    if (s.act != null) o.act = Math.round(s.act);
    if (s.done === true) o.done = true;
    return o;
  }
  function clean(s) {
    if (s === null) return null;
    return fromParts(parts(s));
  }

  /* ✂️ החלקים כרשימה שטוחה (הראשון = slot עצמו), ובחזרה. */
  function parts(s) {
    if (!s) return [];
    var a = [cleanPart(s)];
    [s.p1, s.p2].concat(s.more || []).forEach(function (p) { if (p) a.push(cleanPart(p)); });
    return a;
  }
  function fromParts(list) {
    var a = (list || []).filter(Boolean).map(cleanPart).sort(function (x, y) {
      return x.date < y.date ? -1 : x.date > y.date ? 1 : x.start - y.start;
    }).slice(0, MAX_PARTS);
    if (!a.length) return null;
    var o = a[0];
    if (a[1]) o.p1 = a[1];
    if (a[2]) o.p2 = a[2];
    return o;
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
   *  🔁 24.9 — כשהגנן מסמן "בוצע" מתוך הבלוק הוא נשאל כמה זמן זה לקח
   *     (`slot.act`, "כמתוכנן" בלחיצה אחת). כשיש זמן בפועל — הוא גובר.
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
  function mode(xs) {
    var c = {}, best = null, bn = 0;
    xs.forEach(function (x) { var k = String(x); c[k] = (c[k] || 0) + 1; if (c[k] > bn) { bn = c[k]; best = x; } });
    return { v: best, n: bn };
  }
  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  /* 🔑 24.9 — משך **בפועל** גובר על המתוכנן כשיש. זה כל ההבדל בין הערכה
     שמשחזרת את מה שתכננו לבין הערכה שמתקרבת למציאות. */
  function spent(r) {
    /* ✂️ משימה שפוצלה — סך כל החלקים (זה הזמן שהמשימה לקחה, לא חלק ממנו). */
    return parts(r.slot).reduce(function (sum, p) { return sum + (p.act || p.dur || 0); }, 0);
  }
  function hasAct(r) { return parts(r.slot).some(function (p) { return p.act; }); }

  /* ההיסטוריה של "אותה משימה" — מהספציפי לכללי. מחזיר { rows, src }. */
  function family(t, rows) {
    t = t || {};
    var hist = (rows || []).filter(function (r) {
      return r && r !== t && String(r.id) !== String(t.id) && r.slot && valid(r.slot) && !r.pendingDelete;
    });
    var tpl = t.templateId ? hist.filter(function (r) { return r.templateId && r.templateId === t.templateId; }) : [];
    if (tpl.length) return { rows: tpl, src: "template" };
    var tt = norm(t.title), tc = norm(t.category);
    var same = tt ? hist.filter(function (r) { return norm(r.title) === tt && norm(r.category) === tc; }) : [];
    if (same.length) return { rows: same, src: "title" };
    var k = catKey(t);
    var cat = k ? hist.filter(function (r) { return catKey(r) === k; }) : [];
    if (cat.length >= 2) return { rows: cat, src: "category" };
    return { rows: [], src: "default" };
  }

  /** { dur, src: "worker"|"template"|"title"|"category"|"default", n, actual } —
   *  who (אופציונלי): אם יש לפחות שתי דוגמאות של אותם עובדים, ההערכה שלהם. */
  function estimate(t, rows, who) {
    var f = family(t, rows);
    if (!f.rows.length) {
      var isFault = !!(t && (t.repId || t.kind === "דיווח תושב"));
      return { dur: isFault ? FAULT_DEFAULT : (DEFAULTS[catKey(t)] || 60), src: "default", n: 0, actual: 0 };
    }
    var pool = f.rows;
    if (who && who.length) {
      var mine = f.rows.filter(function (r) {
        var w = (r.slot && r.slot.who) || [];
        return w.length === who.length && who.every(function (k) { return w.indexOf(k) >= 0; });
      });
      if (mine.length >= 2) return { dur: median(mine.map(spent)), src: "worker", n: mine.length,
                                     actual: mine.filter(hasAct).length };
    }
    return { dur: median(pool.map(spent)), src: f.src, n: pool.length,
             actual: pool.filter(hasAct).length };
  }
  function estimateText(e) {
    if (!e) return "";
    if (e.src === "default") return "הערכה ראשונית";
    var times = e.n === 1 ? "פעם אחת" : e.n + " פעמים";
    var base = e.src === "category" ? "לפי " + times + " בקטגוריה"
             : e.src === "worker" ? "לפי " + times + " של אותם עובדים"
             : "לפי " + times + " קודמות";
    return base + (e.actual ? " (" + (e.actual === e.n ? "זמן בפועל" : e.actual + " בפועל") + ")" : "");
  }

  /* ==========================================================================
   *  "איך זה בדרך כלל נראה" — הפרופיל של משימה חוזרת   (24.9, בקשת יועד:
   *  "שלאט לאט ה-AI ילמד את הסידורים שהוא מייצר ואת החלוקה ביניהם")
   * --------------------------------------------------------------------------
   *  🔑 **אין אימון של מודל.** "למידה" = סטטיסטיקה על השיבוצים שנשמרו —
   *     כלומר על מה שהגנן **אישר** בסוף, כולל כל תיקון שעשה להצעה. היא
   *     משמשת לבחירת עובדים מראש, להערכת זמן, ולרמזים שנשלחים ל-AI.
   *  רק ממשפחה ספציפית (תבנית/כותרת) — "בקטגוריה דשא עובדים בראשון" אינו
   *  הרגל, זה רעש.
   * ========================================================================== */
  function dayIdx(date) {
    var p = String(date).split("-"), d = new Date(+p[0], +p[1] - 1, +p[2], 12);
    return d.getDay();
  }
  function profile(t, rows) {
    var f = family(t, rows);
    if (!f.rows.length || f.src === "category") return null;
    var rs = f.rows;
    var d = mode(rs.map(function (r) { return dayIdx(r.slot.date); }));
    var w = mode(rs.map(function (r) { return ((r.slot.who || []).slice().sort()).join(","); }).filter(Boolean));
    var st = rs.map(function (r) { return r.slot.start; }).sort(function (a, b) { return a - b; });
    return {
      n: rs.length,
      day: d.n >= 2 || rs.length === 1 ? d.v : null,
      start: st[Math.floor((st.length - 1) / 2)],
      who: w.v ? String(w.v).split(",") : [],
      whoN: w.n
    };
  }

  /* ==========================================================================
   *  הצוות — מי אפשר לשבץ   (24.9)
   * --------------------------------------------------------------------------
   *  הצוות **אינו רשימה חדשה לתחזק**: הוא משבצות ההתחברות בשורות המשתמש
   *  החיצוני בטאב התושבים (היום: שורה 74 — אביתר, עומר). השרת מחזיר
   *  { key: "74:2", name: "עומר", me }. 🔒 **השמות לא נכנסים ל-Firestore** —
   *  במסמך נשמר רק המפתח האטום, והשם מגיע מהשרת בזמן התצוגה (הגבול שיועד
   *  קבע: הקישור בין אדם לזהות נשאר בגיליון).
   *  המטמון בדפדפן (12 שעות) כדי שפתיחת הסידור לא תחכה ל-Apps Script.
   * ========================================================================== */
  var CREW_KEY = "cba.gs.crew", CREW_TTL = 12 * 3600 * 1000;
  var crewMem = null, crewWait = [];
  function crewCached() {
    if (crewMem) return crewMem;
    try {
      var c = JSON.parse(localStorage.getItem(CREW_KEY) || "null");
      if (c && c.list instanceof Array && Date.now() - c.at < CREW_TTL) crewMem = c.list;
    } catch (e) {}
    return crewMem || [];
  }
  function crewLoad(cb, force) {
    if (!force && crewMem) return cb && cb(crewMem);
    if (!force) { var c = crewCached(); if (c.length) { if (cb) cb(c); return; } }
    if (cb) crewWait.push(cb);
    if (crewWait.loading) return;
    crewWait.loading = true;
    function done(list) {
      crewWait.loading = false;
      var q = crewWait.splice(0); q.forEach(function (f) { try { f(list); } catch (e) {} });
    }
    if (!(CBA.sheets && CBA.sheets.postRead)) return done(crewCached());
    CBA.sheets.postRead("gardenCrew", {}, function (r) {
      if (r && r.ok && r.crew instanceof Array) {
        crewMem = r.crew.filter(function (x) { return x && WHO_RE.test(String(x.key)); });
        try { localStorage.setItem(CREW_KEY, JSON.stringify({ at: Date.now(), list: crewMem })); } catch (e) {}
      }
      done(crewCached());
    });
  }
  function crewName(key) {
    var c = crewCached();
    for (var i = 0; i < c.length; i++) if (c[i].key === key) return c[i].name;
    return "";
  }

  CBA.gardenSlots = {
    DAY_START: DAY_START, DAY_END: DAY_END, STEP: STEP,
    MAX_PARTS: MAX_PARTS,
    valid: valid, clean: clean, write: write, parts: parts, fromParts: fromParts,
    estimate: estimate, estimateText: estimateText, profile: profile,
    crew: crewCached, crewLoad: crewLoad, crewName: crewName
  };
})();
