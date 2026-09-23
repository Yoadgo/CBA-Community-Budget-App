/* ============================================================================
 *  סידור שבועי לגנן   (2026-09-23, אפיון + הכרעות יועד)
 * ----------------------------------------------------------------------------
 *  **מה זה:** כלי העבודה של הגנן לתכנן את השבוע — שש עמודות (ראשון–שישי),
 *  06:00–23:00, ובהן בלוקים של משימות. **גם מנהל הגינון עורך** (הכרעה 23.9).
 *
 *  🔴🔴 **שקוף לחלוטין.** הסידור אינו משנה שבוע, גרירה, דגל, שלב או יעד.
 *     הוא שדה `slot` על המשימה ותו לא (ר' js/data/gardenSlots.js). מונה
 *     "X מתוך Y הושלמו", תג "נגררה" ומסך הנתונים ממשיכים לעבוד בדיוק כמו
 *     היום — הם לא יודעים שהסידור קיים.
 *
 *  🔑 **אינו מסך נפרד — הוא מצב תצוגה של "משימות".**
 *     gardenTasks.js מחזיק את הנתונים, את כותרת השבוע ואת כל הפעולות
 *     (בוצע, סגירה, פרטים). הקובץ הזה רק מצייר את הסידור ועורך `slot`.
 *     כך "בוצע" מתוך הבלוק הוא **אותה פונקציה בדיוק** כמו מתוך הכרטיס —
 *     כולל חלון התמונות, אישור המנהל והמייל לתושב — ולא עותק שני שיסטה.
 *
 *  ממשק (ctx) שמסך המשימות מעביר:
 *    rows          — אותו מערך rowsAll (הפניות חיות, לא עותק)
 *    week          — מפתח השבוע המוצג (יום ראשון, YYYY-MM-DD)
 *    thisWeek      — מפתח השבוע הנוכחי
 *    loading       — true עד שהטעינה הראשונה חזרה
 *    ico(name)     — הסמלילים של המודול
 *    catOf(t)      — { key, ico }  (catT של gardenTasks)
 *    tiles(t)      — tileList(t) — ממנה נגזרת הפעולה הראשית של הבלוק
 *    tile(id, key) — tileAction — מבצע אותה
 *    openDetails(id)
 *    redraw()      — draw() של המסך
 *
 *  שתי דרכים לשבץ (האפיון של יועד):
 *    א. מהסידור: לחיצה ארוכה (מגע) / לחיצה (עכבר) על שעה פנויה
 *       → משימה → משך.
 *    ב. מהמשימה: "סידור" בקוביות ה-⋯ → יום → שעה → משך.
 *
 *  ✂️ 25.9 — סבב 4 (הכרעות יועד):
 *   · **בלוק = חלק של משימה.** משימה יכולה להתפצל לעד שלושה ימים ("המשך
 *     ביום אחר"). כל חלק הוא בלוק עם מפתח `<id>#<i>`. "בוצע" על חלק שאינו
 *     האחרון מסמן רק אותו ("החלק הסתיים"); האחרון סוגר את המשימה כרגיל.
 *   · **הקשה על בלוק בוחרת אותו** — ידיות למעלה/למטה משנות משך, גרירת הגוף
 *     מזיזה (גם בין ימים כשרואים כמה), וסרגל צף עם הפעולות. הקשה שנייה
 *     פותחת את הפרטים. במחשב — ריחוף מראה את קצוות הגרירה, וגרירה ישירה.
 *   · בחירה מרובה (הסרה / העברה ליום / עובד), ניקוי (שבוע / יום / עובד),
 *     ו"ביטול" לכל שינוי.
 *   · תצוגות במובייל: יום · 2 · 3 · שבוע (מפה דחוסה) · סדר יום (רשימה).
 *   · שפה: iOS, מינימליסטי, זכוכית (.lg מ-liquid-glass.css) — כלים בשורה
 *     אחת, השאר בתפריט ···.
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};

  var DAYS  = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
  var DAYS1 = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];
  var MON   = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
               "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  var LONG_MS = 450;          // לחיצה ארוכה
  var MOVE_TOL = 9;           // תזוזה שמבטלת לחיצה ארוכה / הקשה (px)
  var DRAG_TOL = 5;           // תזוזה שמתחילה גרירה של בלוק
  var WIDE_Q = "(min-width: 760px)";
  var HINT_KEY = "cba.gs.used";
  var WHO_KEY = "cba.gs.who";
  var VIEW_KEY = "cba.gs.view";
  var VIEWS = [["1", "יום"], ["2", "2"], ["3", "3"], ["map", "שבוע"], ["agenda", "סדר יום"]];
  var UNDO_MS = 7000;
  /* ✨ לסידור החכם — מוטמע כאן כי ICONS של המסך אינו כולל אותו. */
  var SPARK = '<svg class="gw-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06 4 20"/><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>' +
    '<path d="M19 15v4"/><path d="M21 17h-4"/></svg>';
  function svg(p) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  }
  var IC = {
    multi: svg('<circle cx="7" cy="7" r="3.2"/><path d="M5.6 7l1 1 1.9-2"/><circle cx="7" cy="17" r="3.2"/><path d="M13 7h8M13 17h8"/>'),
    split: svg('<rect x="3" y="4" width="8" height="7" rx="2"/><rect x="13" y="13" width="8" height="7" rx="2"/><path d="M11 7.5h2.5a2 2 0 0 1 2 2V13"/>'),
    info:  svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    broom: svg('<path d="M14 4l6 6M4.5 20.5c1-4.5 3-7.5 6.5-9l3 3c-1.5 3.5-4.5 5.5-9 6.5"/><path d="M8 15.5l1.5 1.5"/>'),
    move:  svg('<path d="M12 3v18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3"/>'),
    chev:  svg('<path d="M6 9l6 6 6-6"/>'),
    tick:  svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>')
  };
  function aiOk() { return !!CBA.gardenScheduleAi; }

  function S() { return CBA.gardenSlots; }
  function D0() { return S() ? S().DAY_START : 360; }
  function D1() { return S() ? S().DAY_END : 1380; }
  function MAXP() { return (S() && S().MAX_PARTS) || 3; }

  /* ---- מצב ברמת המודול: שורד את draw() של המסך ---- */
  var st = {
    day: null,          // יום נבחר / תחילת החלון (מובייל)
    dayWeek: null,      // לאיזה שבוע שייך הבחירה
    scroll: {},         // מיקום גלילה לפי שבוע+תצוגה
    scrolled: {},       // האם כבר גללנו אוטומטית לשבוע הזה
    flash: null,        // מפתח בלוק להבהוב אחרי שמירה
    who: null,          // מסנן העובד בתצוגה: "all" או מפתח ("74:2"). null = עוד לא נקבע
    crewAsked: false,
    view: null,         // תצוגת מובייל: "1" | "2" | "3" | "map" | "agenda"
    sel: null,          // ✂️ מפתח הבלוק הנבחר ("<id>#<i>")
    multi: false,       // מצב בחירה מרובה
    picked: {},         // מפתחות שנבחרו בבחירה מרובה
    undo: null,         // { week, label, at, items:[{id, prev, next}] }
    drag: null,         // גרירה פעילה (שינוי משך / הזזה)
    ctx: null, host: null
  };

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m, k) { if (CBA.ui && CBA.ui.toast) CBA.ui.toast(m, k); }
  function wide() { return !!(window.matchMedia && window.matchMedia(WIDE_Q).matches); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function same(a, b) { return JSON.stringify(a || null) === JSON.stringify(b || null); }

  /* ---- תאריכים ---- */
  function parseKey(k) {
    var p = String(k || "").split("-");
    var d = new Date(+p[0], (+p[1]) - 1, +p[2], 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }
  function keyOf(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }
  function weekDates(week) {
    var a = parseKey(week), out = [];
    if (!a) return out;
    for (var i = 0; i < 6; i++) { var d = new Date(a.getTime()); d.setDate(d.getDate() + i); out.push(keyOf(d)); }
    return out;
  }
  function todayDate() { var d = new Date(); d.setHours(12, 0, 0, 0); return keyOf(d); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function durText(m) {
    var h = Math.floor(m / 60), r = m % 60;
    var hs = h === 0 ? "" : h === 1 ? "שעה" : h === 2 ? "שעתיים" : h + " שעות";
    if (!r) return hs;
    if (!h) return r + " דק׳";
    if (r === 30) return hs + " וחצי";
    if (r === 15) return hs + " ורבע";
    return hs + " ו-" + r + " דק׳";
  }
  function hoursShort(m) { var h = m / 60; return (Math.round(h * 2) / 2).toString().replace(/\.0$/, "") + "ש׳"; }
  function dayLabel(date, wk) {
    var i = weekDates(wk).indexOf(date);
    return i < 0 ? date : "יום " + DAYS[i];
  }
  function dmy(date) { var d = parseKey(date); return d ? d.getDate() + "." + (d.getMonth() + 1) : ""; }
  function slotText(s, wk) { return dayLabel(s.date, wk) + " · " + hhmm(s.start) + "–" + hhmm(s.start + s.dur); }

  /* ==========================================================================
   *  מה מוצג ומה מועמד   — 🔑 כאן כל הכללים
   * ========================================================================== */
  function isOpen(t) { return !!t && !t.closure && !t.pendingDelete; }
  function partsOf(t) { return S() && t ? S().parts(t.slot) : []; }
  function inWeekDate(d, wk) { return weekDates(wk).indexOf(d) >= 0; }

  /* מועמדות לשיבוץ בשבוע wk — **אותו כלל כמו "עבודת השבוע" ב-openBody**:
     בשבוע הנוכחי גם מה שנגרר משבועות קודמים; בשבוע אחר רק מה ששייך אליו.
     משימה בלי שבוע ממתינה להחלטה ואינה מועמדת — הסידור אינו מחליט במקום
     המנהל על שבוע. */
  function candidates(ctx) {
    var wk = ctx.week, now = wk === ctx.thisWeek;
    return (ctx.rows || []).filter(function (t) {
      if (!isOpen(t) || !t.week) return false;
      return now ? t.week <= wk : t.week === wk;
    });
  }
  /* משימה מוצגת בשבוע wk: לפחות חלק אחד שלה נופל בשבוע, ו —
     · משימה סגורה: תמיד (היסטוריה — "מה עשיתי ביום שלישי").
     · משימה פתוחה: רק אם היא עדיין שייכת לשבוע הזה או לפניו. מנהל שהעביר
       אותה לשבוע הבא — הבלוק הישן נעלם מכאן לבד, **בלי שום כתיבה**.
       זה מה שמשאיר את השבוע של המשימה המקור היחיד, והסידור שקוף לו. */
  function shown(t, wk) {
    if (!t || t.pendingDelete || !t.slot) return false;
    if (!partsOf(t).some(function (p) { return inWeekDate(p.date, wk); })) return false;
    if (t.closure) return true;
    return !!t.week && t.week <= wk;
  }
  /* ✂️ בלוק = { t, s (החלק), i (אינדקס), n (כמה חלקים), key } */
  function bkey(id, i) { return String(id) + "#" + i; }
  function splitKey(k) { k = String(k); var j = k.lastIndexOf("#"); return j < 0 ? { id: k, i: 0 } : { id: k.slice(0, j), i: +k.slice(j + 1) }; }
  function blocks(ctx) {
    var out = [];
    (ctx.rows || []).forEach(function (t) {
      if (!shown(t, ctx.week)) return;
      var ps = partsOf(t);
      ps.forEach(function (s, i) {
        if (inWeekDate(s.date, ctx.week)) out.push({ t: t, s: s, i: i, n: ps.length, key: bkey(t.id, i) });
      });
    });
    return out;
  }
  function byKey(ctx, k) {
    if (!k) return null;
    var o = splitKey(k), t = byId(ctx, o.id);
    if (!t) return null;
    var ps = partsOf(t);
    return ps[o.i] ? { t: t, s: ps[o.i], i: o.i, n: ps.length, key: bkey(t.id, o.i) } : null;
  }
  function unscheduled(ctx) {
    return candidates(ctx).filter(function (t) { return !shown(t, ctx.week); });
  }
  function editable(B) { return !!B && isOpen(B.t) && !B.s.done; }
  function isLastPart(B) { return !B || B.i === B.n - 1; }

  /* ==========================================================================
   *  👷 עובדים (24.9) — "פנוי" הוא פנוי **לאותם עובדים**
   * --------------------------------------------------------------------------
   *  שני בלוקים באותה שעה מתנגשים רק אם יש להם עובד משותף. בלוק בלי עובדים
   *  (או בדיקה בלי עובדים) מתנגש בכל דבר — כך בדיוק התנהג הסידור עד היום,
   *  ולכן שיכון בלי צוות מוגדר לא מרגיש שום שינוי.
   * ========================================================================== */
  function whoOf(t) { return (t && t.slot && t.slot.who) || []; }
  function whoOfB(B) { return (B && B.s && B.s.who) || []; }
  function whoOverlap(a, b) {
    if (!a || !a.length || !b || !b.length) return true;
    return a.some(function (k) { return b.indexOf(k) >= 0; });
  }
  /* ignore: מזהה משימה (כל החלקים שלה), מפתח בלוק (רק החלק), או מערך שלהם.
     extra: שיבוצים "וירטואליים" שעוד לא נשמרו — בפעולה על כמה בלוקים יחד. */
  function ignored(B, ignore) {
    if (ignore == null || ignore === "") return false;
    var xs = ignore instanceof Array ? ignore : [ignore];
    for (var i = 0; i < xs.length; i++) {
      var x = String(xs[i]);
      if (B.key === x || (x.indexOf("#") < 0 && String(B.t.id) === x)) return true;
    }
    return false;
  }
  /* תפוסה ביום — מרווחים [start, end). */
  function busyOn(ctx, date, ignore, who, extra) {
    var r = blocks(ctx).filter(function (B) {
      return B.s.date === date && !ignored(B, ignore) && whoOverlap(who, whoOfB(B));
    }).map(function (B) { return [B.s.start, B.s.start + B.s.dur]; });
    (extra || []).forEach(function (x) {
      if (x.date === date && whoOverlap(who, x.who || [])) r.push([x.start, x.start + x.dur]);
    });
    return r;
  }
  function isFree(ctx, date, a, len, ignore, who, extra) {
    if (a < D0() || a + len > D1()) return false;
    return !busyOn(ctx, date, ignore, who, extra).some(function (r) { return a < r[1] && a + len > r[0]; });
  }
  /* כמה דקות פנויות ברצף מ-a (עד הבלוק הבא או 23:00). */
  function maxFrom(ctx, date, a, ignore, who) {
    var end = D1();
    busyOn(ctx, date, ignore, who).forEach(function (r) {
      if (r[1] > a && r[0] < a + 1) end = a;           // a עצמו תפוס
      else if (r[0] >= a && r[0] < end) end = r[0];
    });
    return Math.max(0, end - a);
  }
  /* הגבולות שבלוק יכול להתרחב אליהם בלי לגעת בבלוק אחר של אותם עובדים. */
  function limitsOf(ctx, B) {
    var lo = D0(), hi = D1(), a = B.s.start, b = a + B.s.dur;
    busyOn(ctx, B.s.date, B.key, whoOfB(B)).forEach(function (r) {
      if (r[1] <= a && r[1] > lo) lo = r[1];
      if (r[0] >= b && r[0] < hi) hi = r[0];
    });
    return { lo: lo, hi: hi };
  }
  function crew() { return (S() && S().crew) ? S().crew() : []; }
  function crewName(k) { return (S() && S().crewName) ? (S().crewName(k) || "") : ""; }
  function me() { var c = crew(); for (var i = 0; i < c.length; i++) if (c[i].me) return c[i].key; return ""; }
  /* העובדים שמסומנים מראש לשיבוץ של משימה: המסנן הפעיל → ההרגל של המשימה
     (gardenSlots.profile) → אני, אם אני בצוות. */
  function defaultWho(ctx, t) {
    var c = crew(); if (!c.length) return [];
    var keys = c.map(function (x) { return x.key; });
    if (st.who && st.who !== "all" && keys.indexOf(st.who) >= 0) return [st.who];
    var p = S().profile ? S().profile(t, ctx.rows) : null;
    if (p && p.who.length && p.who.every(function (k) { return keys.indexOf(k) >= 0; })) return p.who.slice();
    return me() ? [me()] : [];
  }
  function viewWho() { return st.who && st.who !== "all" ? [st.who] : []; }
  function pickWho() {
    var saved = lsGet(WHO_KEY), c = crew();
    if (saved && (saved === "all" || c.some(function (x) { return x.key === saved; }))) return saved;
    return me() || "all";
  }
  function visibleB(B) {
    var vw = viewWho();
    return !vw.length || !whoOfB(B).length || whoOfB(B).indexOf(vw[0]) >= 0;
  }
  function freeStarts(ctx, date, ignore, who) {
    var out = [];
    for (var a = D0(); a < D1(); a += 30) if (isFree(ctx, date, a, 15, ignore, who)) out.push(a);
    return out;
  }
  function freeMinutes(ctx, date, ignore, who) {
    var used = 0;
    busyOn(ctx, date, ignore, who).forEach(function (r) { used += Math.max(0, Math.min(r[1], D1()) - Math.max(r[0], D0())); });
    return Math.max(0, D1() - D0() - used);
  }

  /* סדר ברשימת הבחירה: נגררות קודם (הן הכי דחופות), אחר כך תקלות, ואז
     לפי קטגוריה וכותרת. אין כאן דירוג חדש — הגרירה נקראת מאותה פונקציה
     שמציירת את התג (gardenLang.drag). */
  function dragLevel(t, ctx) {
    var GL = CBA.gardenLang;
    return (GL && GL.drag) ? (GL.drag(t, ctx.thisWeek).level || 0) : 0;
  }
  function sortPick(list, ctx) {
    return list.slice().sort(function (a, b) {
      var d = dragLevel(b, ctx) - dragLevel(a, ctx); if (d) return d;
      var fa = a.repId ? 0 : 1, fb = b.repId ? 0 : 1; if (fa !== fb) return fa - fb;
      var c = String(a.category || "").localeCompare(String(b.category || ""), "he"); if (c) return c;
      return String(a.title || "").localeCompare(String(b.title || ""), "he");
    });
  }

  /* ==========================================================================
   *  פריסת חפיפות — עמודות בתוך אשכול
   * ========================================================================== */
  function layout(list) {
    var ev = list.slice().sort(function (a, b) { return a.s.start - b.s.start || b.s.dur - a.s.dur; });
    var out = [], cluster = [], cols = [], clusterEnd = -1;
    function flush() {
      var n = cols.length || 1;
      cluster.forEach(function (x) { x.n = n; });
      cluster = []; cols = [];
    }
    ev.forEach(function (B) {
      var a = B.s.start, b = a + B.s.dur;
      if (a >= clusterEnd) { flush(); clusterEnd = b; } else clusterEnd = Math.max(clusterEnd, b);
      var c = 0; while (c < cols.length && cols[c] > a) c++;
      cols[c] = b;
      var item = { b: B, t: B.t, col: c, n: 1 };
      cluster.push(item); out.push(item);
    });
    flush();
    return out;
  }

  /* ==========================================================================
   *  תצוגה
   * ========================================================================== */
  function pickDefaultDay(ctx) {
    var dates = weekDates(ctx.week), i = dates.indexOf(todayDate());
    return i >= 0 ? i : 0;
  }
  function curView() {
    if (wide()) return "week";
    if (!st.view) {
      var v = lsGet(VIEW_KEY);
      st.view = VIEWS.some(function (x) { return x[0] === v; }) ? v : "1";
    }
    return st.view;
  }
  function nDays(v) { return v === "2" ? 2 : v === "3" ? 3 : 1; }
  function winStart(v) { var n = nDays(v); return Math.max(0, Math.min(st.day, 6 - n)); }
  function visCols(v) {
    if (v === "week" || v === "map") return [0, 1, 2, 3, 4, 5];
    var n = nDays(v), a = winStart(v), out = [];
    for (var i = 0; i < n; i++) out.push(a + i);
    return out;
  }
  function viewKey(ctx) { var v = curView(); return ctx.week + ":" + v + (v === "week" || v === "map" || v === "agenda" ? "" : winStart(v)); }
  function canEditView() { var v = curView(); return v !== "map" && v !== "agenda"; }

  function render(host, ctx) {
    if (!host) return;
    closePop();
    /* שמירת הגלילה לפני שמחליפים את התוכן. */
    var old = host.querySelector(".gw-scroll");
    if (old && st.ctx) st.scroll[viewKey(st.ctx)] = old.scrollTop;
    st.ctx = ctx; st.host = host;
    if (st.dayWeek !== ctx.week || st.day == null) {
      st.day = pickDefaultDay(ctx); st.dayWeek = ctx.week;
      st.sel = null; st.multi = false; st.picked = {};
    }

    var V = curView(), W = V === "week";
    var dates = weekDates(ctx.week);
    var cols = visCols(V);
    var today = todayDate();
    /* 👷 הצוות נטען פעם אחת (מטמון 12 שעות), ברקע — הסידור לא מחכה לו.
       כשהוא מגיע: מסנן ברירת-המחדל הוא "אני" אם אני בצוות, אחרת "הכול". */
    if (!st.crewAsked && S() && S().crewLoad) {
      st.crewAsked = true;
      var before = JSON.stringify(crew());
      S().crewLoad(function (list) {
        if (st.who == null) st.who = pickWho();
        if (JSON.stringify(list || []) !== before && st.host && st.host.isConnected && st.ctx) render(st.host, st.ctx);
      });
    }
    if (st.who == null && crew().length) st.who = pickWho();
    var bl = ctx.loading ? [] : blocks(ctx).filter(visibleB);
    /* בחירה שכבר לא קיימת (נמחקה, נסגרה, סוננה) — מתאפסת בשקט. */
    if (st.sel && !bl.some(function (B) { return B.key === st.sel && editable(B); })) st.sel = null;
    if (st.multi) Object.keys(st.picked).forEach(function (k) { if (!bl.some(function (B) { return B.key === k; })) delete st.picked[k]; });
    if (!canEditView()) { st.sel = null; st.multi = false; st.picked = {}; }
    var un = ctx.loading ? [] : unscheduled(ctx);
    var cand = ctx.loading ? 0 : candidates(ctx).length;

    var html = toolbarHtml(ctx, V);

    /* --- רצועת ימים (מובייל, תצוגות יום/2/3) --- */
    if (V === "1" || V === "2" || V === "3") {
      html += '<div class="gw-days" role="tablist" aria-label="ימי השבוע">' + dates.map(function (d, i) {
        var n = bl.filter(function (B) { return B.s.date === d; }).length;
        var dd = parseKey(d), on = cols.indexOf(i) >= 0;
        var first = on && i === cols[0], last = on && i === cols[cols.length - 1];
        return '<button type="button" role="tab" data-gsday="' + i + '" aria-selected="' + on + '"' +
          ' class="' + (on ? "on" : "") + (on && cols.length > 1 ? (first ? " is-first" : last ? " is-last" : " is-mid") : "") +
          (d === today ? " is-today" : "") + (d < today ? " is-past" : "") + '">' +
          '<b>' + DAYS1[i] + '</b><small>' + dd.getDate() + '</small>' +
          '<i class="gw-dots" aria-label="' + n + ' משימות">' + (n ? new Array(Math.min(n, 4) + 1).join("<u></u>") : "") + '</i>' +
          '</button>';
      }).join("") + '</div>';
    }

    /* --- שורת הסטטוס: "לא בסידור" / מצב בחירה מרובה ----
       🖥 במחשב היא יושבת בתוך שורת הכלים (toolbarHtml) — שורה אחת פחות. */
    if (!ctx.loading && !wide()) {
      if (st.multi) {
        html += '<div class="gw-todo is-multi">' +
          '<span class="gw-todo__t">' + (Object.keys(st.picked).length ? "אפשר להוסיף עוד בהקשה" : "הקשה על משימות בוחרת אותן") + '</span>' +
          '<button type="button" class="gw-todo__b" data-gs="pickall">' + (cols.length > 1 ? "כל הימים המוצגים" : "כל היום") + '</button>' +
        '</div>';
      } else if (un.length) {
        /* ⚠️ div ולא button: יש בתוכה שני כפתורים, וכפתור בתוך כפתור אינו HTML. */
        html += '<div class="gw-todo">' +
          '<span class="gw-todo__n">' + un.length + '</span>' +
          '<span class="gw-todo__t">' + (un.length === 1 ? "משימה לא בסידור" : "לא בסידור") + '</span>' +
          '<button type="button" class="gw-todo__b" data-gs="todo">ידני</button>' +
          (aiOk() ? '<button type="button" class="gw-todo__b is-ai" data-gs="ai">' + SPARK + 'סידור חכם</button>' : '') +
        '</div>';
      } else {
        html += '<div class="gw-todo is-done">' + ctx.ico("check") +
          '<span class="gw-todo__t">' + (cand ? "כל משימות השבוע בסידור" : "אין משימות פתוחות לשבוע הזה") + '</span></div>';
      }
      if (!lsGet(HINT_KEY) && canEditView()) {
        html += '<div class="gw-hint">לחיצה ארוכה על שעה פנויה משבצת · הקשה על משימה בוחרת אותה.</div>';
      }
    }

    if (V === "agenda") html += agendaHtml(ctx, bl);
    else html += gridHtml(ctx, V, cols, bl);

    host.innerHTML = html;
    host.classList.add("gw-host");
    /* 🖥 במחשב — שורת הכלים עוברת לשורת הבקרה של המסך (ליד "רשימה", ? ו-+),
       כך שמעל הרשת נשארות רק כותרת השבוע ושורה אחת. (יועד, 25.9: "יש בחלק
       העליון בתצוגת דסקטופ יותר מדי מקום פנוי".) */
    st.tbEl = null;
    var scr = host.closest ? host.closest(".gd-screen") : null, ctl = scr && scr.querySelector(".gt-ctl");
    if (ctl) Array.prototype.forEach.call(ctl.querySelectorAll(".gw-tb"), function (x) { x.parentNode.removeChild(x); });
    if (wide() && ctl) {
      var tb = host.querySelector(".gw-tb"), vbtn = ctl.querySelector(".gw-view");
      if (tb) { ctl.insertBefore(tb, vbtn ? vbtn.nextSibling : ctl.firstChild); st.tbEl = tb; ctl.classList.add("has-gw"); }
    } else if (ctl) ctl.classList.remove("has-gw");
    host.classList.toggle("is-multi", !!st.multi);
    host.classList.toggle("is-sel", !!st.sel);
    wire(host, ctx);
    sizeScroll(host);
    restoreScroll(host, ctx, bl);
    st.flash = null;
  }

  /* ---- שורת הכלים: עובד · תצוגה · ··· (הכרעת יועד: שורה אחת + תפריט) ---- */
  function todoHtml(ctx) {
    if (ctx.loading) return "";
    var un = unscheduled(ctx), cand = candidates(ctx).length;
    if (st.multi) {
      return '<div class="gw-todo is-multi">' +
        '<span class="gw-todo__t">' + (Object.keys(st.picked).length ? "אפשר להוסיף עוד בהקשה" : "הקשה על משימות בוחרת אותן") + '</span>' +
        '<button type="button" class="gw-todo__b" data-gs="pickall">' + (visCols(curView()).length > 1 ? "כל הימים המוצגים" : "כל היום") + '</button></div>';
    }
    if (un.length) {
      return '<div class="gw-todo">' +
        '<span class="gw-todo__n">' + un.length + '</span>' +
        '<span class="gw-todo__t">' + (un.length === 1 ? "משימה לא בסידור" : "לא בסידור") + '</span>' +
        '<button type="button" class="gw-todo__b" data-gs="todo">ידני</button>' +
        (aiOk() ? '<button type="button" class="gw-todo__b is-ai" data-gs="ai">' + SPARK + 'סידור חכם</button>' : '') +
      '</div>';
    }
    return '<div class="gw-todo is-done">' + ctx.ico("check") +
      '<span class="gw-todo__t">' + (cand ? "כל משימות השבוע בסידור" : "אין משימות פתוחות לשבוע הזה") + '</span></div>';
  }
  function toolbarHtml(ctx, V) {
    var cr = crew(), h = '<div class="gw-tb' + (wide() ? " is-wide" : "") + '">';
    if (cr.length >= 2) {
      var cur = st.who && st.who !== "all" ? crewName(st.who) : "כולם";
      h += '<button type="button" class="lg lg-pill gw-tb__crew" data-gs="crew" aria-haspopup="menu" aria-label="עובד: ' + esc(cur) + '">' +
        '<span class="lg-ico">' + ctx.ico("team") + '</span><span class="gw-tb__nm">' + esc(cur) + '</span>' + IC.chev + '</button>';
    }
    if (!wide()) {
      h += '<div class="lg lg-pill gw-seg" role="tablist" aria-label="תצוגה">' + VIEWS.map(function (x) {
        var on = V === x[0];
        return '<button type="button" role="tab" data-gv="' + x[0] + '" aria-selected="' + on + '" class="' + (on ? "on" : "") + '"' +
          (x[0] === "2" || x[0] === "3" ? ' aria-label="' + x[0] + ' ימים"' : '') + '>' + x[1] + '</button>';
      }).join("") + '</div>';
    } else h += todoHtml(ctx) + '<span class="gw-tb__sp"></span>';
    h += '<button type="button" class="lg lg-circle gw-tb__more" data-gs="more" aria-haspopup="menu" aria-label="עוד פעולות">' + ctx.ico("dots") + '</button>';
    return h + '</div>';
  }

  /* ---- הרשת (יום / 2 / 3 / שבוע במחשב / מפת שבוע) ---- */
  function gridHtml(ctx, V, cols, bl) {
    var dates = weekDates(ctx.week), today = todayDate();
    var MAP = V === "map", heads = cols.length > 1;
    var hours = []; for (var h = D0(); h < D1(); h += 60) hours.push(h);
    var html = '<div class="gw-scroll" tabindex="-1"><div class="gw-grid' + (V === "week" ? " is-wide" : "") + (MAP ? " is-map" : "") +
      (!MAP && cols.length >= 3 ? " is-dense" : "") + '" style="--cols:' + cols.length + '">';
    if (heads) {
      html += '<div class="gw-hd gw-hd--corner"></div>' + cols.map(function (i) {
        var d = dates[i], dd = parseKey(d);
        return '<div class="gw-hd' + (d === today ? " is-today" : "") + (d < today ? " is-past" : "") + '"' +
          (MAP ? ' data-gsgo="' + i + '" role="button" tabindex="0" aria-label="יום ' + DAYS[i] + '"' : '') + '>' +
          '<b>' + (MAP ? DAYS1[i] : DAYS[i]) + '</b><small>' + (MAP ? dd.getDate() : dd.getDate() + ' ' + MON[dd.getMonth()]) + '</small></div>';
      }).join("");
    }
    html += '<div class="gw-times" aria-hidden="true">' + hours.map(function (m) {
      return '<span>' + (MAP ? String(m / 60) : hhmm(m)) + '</span>';
    }).join("") + '</div>';

    cols.forEach(function (i) {
      var d = dates[i];
      var dayBl = bl.filter(function (B) { return B.s.date === d; });
      html += '<div class="gw-col' + (d === today ? " is-today" : "") + (d < today ? " is-past" : "") +
        '" data-date="' + d + '" data-di="' + i + '" aria-label="יום ' + DAYS[i] + '">';
      if (d === today) {
        var nm = nowMin();
        if (nm > D0()) html += '<div class="gw-pastshade" style="height:calc(var(--gw-h) * ' + (Math.min(nm, D1()) - D0()) / 60 + ')"></div>';
        if (nm >= D0() && nm <= D1()) html += '<div class="gw-now" style="top:calc(var(--gw-h) * ' + (nm - D0()) / 60 + ')"></div>';
      }
      if (ctx.loading) {
        html += '<div class="gw-blk is-skel" style="top:calc(var(--gw-h) * ' + (1 + i % 3) + ');height:calc(var(--gw-h) * 1.5 - 4px)"></div>';
      }
      layout(dayBl).forEach(function (L) { html += MAP ? mapBlockHtml(L, ctx) : blockHtml(L, ctx, cols.length); });
      html += '</div>';
    });
    html += '</div>';
    if (MAP && !ctx.loading) html += mapSummary(ctx, bl, cols);
    html += floatHtml(ctx) + '</div>';
    return html;
  }

  function blockHtml(L, ctx, ncols) {
    var B = L.b, t = B.t, s = B.s, cat = ctx.catOf(t) || { key: "lawn", ico: "lawn" };
    var top = (s.start - D0()) / 60, h = s.dur / 60;
    var w = 100 / L.n, off = w * L.col;
    var closed = !!t.closure, pend = t.flag === "ממתין לאישור", pdone = !closed && !!s.done;
    var lvl = closed || pdone ? 0 : dragLevel(t, ctx);
    var sel = st.sel === B.key, picked = st.multi && !!st.picked[B.key];
    var ed = editable(B);
    var cls = "gw-blk k-" + cat.key + (closed ? " is-closed" : "") + (pdone ? " is-pdone" : "") + (pend ? " is-pend" : "") +
      (lvl ? " is-u" + lvl : "") + (s.dur <= 30 ? " is-short" : s.dur <= 60 ? " is-hr" : "") + (L.n > 1 ? " is-narrow" : "") +
      (sel ? " is-sel" : "") + (picked ? " is-picked" : "") + (ed ? " is-ed" : "") +
      (st.flash && String(st.flash) === B.key ? " is-flash" : "");
    var state = closed ? (t.closure === "בוצע" ? "בוצע" : t.closure) : pdone ? "החלק הסתיים" : pend ? "ממתין לאישור" : "";
    var part = B.n > 1 ? " (" + (B.i + 1) + "/" + B.n + ")" : "";
    var title = (t.title || t.category || "משימה") + part;
    var label = title + ", " + hhmm(s.start) + " עד " + hhmm(s.start + s.dur) +
      (t.area ? ", " + t.area : "") + (state ? ", " + state : "");
    var html = '<button type="button" class="' + cls + '" data-gsid="' + esc(t.id) + '" data-bk="' + esc(B.key) + '" aria-label="' + esc(label) + '"' +
      (st.multi ? ' aria-pressed="' + picked + '"' : '') +
      ' style="top:calc(var(--gw-h) * ' + top + ' + 1px);height:calc(var(--gw-h) * ' + h + ' - 3px);' +
      'inset-inline-start:calc(' + off + '% + 3px);width:calc(' + w + '% - 6px)">' +
      '<b>' + (closed || pdone ? ctx.ico("check") : pend ? ctx.ico("clock") : ctx.ico(cat.ico)) +
        '<span>' + esc(title) + '</span></b>' +
      '<em>' + esc(hhmm(s.start) + "–" + hhmm(s.start + s.dur)) + (t.area ? " · " + esc(t.area) : "") + '</em>' +
      whoTags(whoOfB(B)) +
      /* 🖱 קצוות גרירה — רק בעכבר (ריחוף), ורק לבלוק שאפשר לערוך */
      (ed && !st.multi ? '<i class="gw-edge is-top" data-edge="top" aria-hidden="true"></i><i class="gw-edge is-bot" data-edge="bot" aria-hidden="true"></i>' : '') +
      (st.multi ? '<i class="gw-check" aria-hidden="true">' + (picked ? IC.tick : '') + '</i>' : '') +
      '</button>';
    /* ✂️ ידיות iOS — מחוץ לבלוק (אחרת ה-overflow חותך אותן). כמו ביומן של
       אייפון, במראה RTL: העליונה בפינה השמאלית-עליונה, התחתונה בימנית-תחתונה. */
    if (sel && ed) {
      html += '<i class="gw-hdl is-top k-' + cat.key + '" data-hdl="top" data-bk="' + esc(B.key) + '" style="top:calc(var(--gw-h) * ' + top + ' + 1px);' +
        'inset-inline-end:calc(' + (100 - off - w) + '% + 3px)" aria-hidden="true"></i>' +
        '<i class="gw-hdl is-bot k-' + cat.key + '" data-hdl="bot" data-bk="' + esc(B.key) + '" style="top:calc(var(--gw-h) * ' + (top + h) + ' - 2px);' +
        'inset-inline-start:calc(' + off + '% + 3px)" aria-hidden="true"></i>';
    }
    return html;
  }
  /* 🗺 מפת שבוע — פס צבע בלי טקסט. */
  function mapBlockHtml(L, ctx) {
    var B = L.b, t = B.t, s = B.s, cat = ctx.catOf(t) || { key: "lawn" };
    var w = 100 / L.n, off = w * L.col;
    var dim = !!t.closure || !!s.done;
    return '<button type="button" class="gw-blk gw-mapb k-' + cat.key + (dim ? " is-dim" : "") + '" data-gsid="' + esc(t.id) + '" data-bk="' + esc(B.key) + '"' +
      ' aria-label="' + esc((t.title || t.category || "משימה") + ", " + hhmm(s.start) + "–" + hhmm(s.start + s.dur)) + '"' +
      ' style="top:calc(var(--gw-h) * ' + (s.start - D0()) / 60 + ' + 1px);height:calc(var(--gw-h) * ' + s.dur / 60 + ' - 2px);' +
      'inset-inline-start:calc(' + off + '% + 2px);width:calc(' + w + '% - 4px)"></button>';
  }
  /* מתחת למפה: כמה שעות שובצו לכל עובד בכל יום. כתום = מעל שעות העבודה
     שהוגדרו בסידור החכם (ברירת מחדל 8). */
  function capMinutes() {
    try { var p = JSON.parse(lsGet("cba.gs.ai") || "null"); if (p && p.to > p.from) return p.to - p.from; } catch (e) {}
    return 480;
  }
  function mapSummary(ctx, bl, cols) {
    var dates = weekDates(ctx.week), cr = crew(), cap = capMinutes();
    var rows = cr.length ? cr.filter(function (c) { return !viewWho().length || c.key === viewWho()[0]; }) : [{ key: "", name: "" }];
    return '<div class="gw-sum" style="--cols:' + cols.length + '">' + rows.map(function (c) {
      return '<span class="gw-sum__w">' + esc(c.name || "סה״כ") + '</span>' + cols.map(function (i) {
        var m = 0;
        bl.forEach(function (B) {
          if (B.s.date !== dates[i]) return;
          if (c.key && whoOfB(B).indexOf(c.key) < 0) return;
          m += B.s.dur;
        });
        return '<span class="' + (m > cap ? "is-over" : "") + '">' + (m ? hoursShort(m) : "–") + '</span>';
      }).join("");
    }).join("") + '</div>';
  }

  /* ---- 📋 סדר יום — רשימה לפי ימים (הכרעת יועד: גם מפה וגם סדר יום) ---- */
  function agendaHtml(ctx, bl) {
    var dates = weekDates(ctx.week), today = todayDate();
    var html = '<div class="gw-scroll gw-ag" tabindex="-1">';
    if (ctx.loading) return html + '<div class="gw-ag__card"><div class="gw-ag__row is-skel"></div><div class="gw-ag__row is-skel"></div></div>' + floatHtml(ctx) + '</div>';
    dates.forEach(function (d, i) {
      var xs = bl.filter(function (B) { return B.s.date === d; }).sort(function (a, b) { return a.s.start - b.s.start; });
      var tot = xs.reduce(function (m, B) { return m + B.s.dur; }, 0);
      html += '<section class="gw-ag__day' + (d === today ? " is-today" : "") + (d < today ? " is-past" : "") + '" data-date="' + d + '">' +
        '<h5><b>' + (d === today ? "היום · " : "") + DAYS[i] + ' ' + dmy(d) + '</b>' +
        '<small>' + (xs.length ? (xs.length === 1 ? "משימה אחת" : xs.length + " משימות") + " · " + durText(tot) : "ריק") + '</small></h5>' +
        '<div class="lg lg-card lg--plain gw-ag__card">';
      var prevEnd = null;
      xs.forEach(function (B) {
        var t = B.t, s = B.s, cat = ctx.catOf(t) || { key: "lawn" };
        if (prevEnd != null && s.start - prevEnd >= 60) {
          html += '<div class="gw-ag__gap"><span></span>' + durText(s.start - prevEnd) + ' פנויות<span></span></div>';
        }
        prevEnd = Math.max(prevEnd || 0, s.start + s.dur);
        var closed = !!t.closure || !!s.done;
        html += '<button type="button" class="gw-ag__row k-' + cat.key + (closed ? " is-closed" : "") + '" data-bk="' + esc(B.key) + '">' +
          '<span class="gw-ag__tm">' + hhmm(s.start) + '<small>' + hhmm(s.start + s.dur) + '</small></span>' +
          '<i class="gw-ag__bar"></i>' +
          '<span class="gw-ag__t"><b>' + esc((t.title || t.category || "משימה") + (B.n > 1 ? " (" + (B.i + 1) + "/" + B.n + ")" : "")) + '</b>' +
            '<small>' + esc([t.area, closed ? (t.closure || "החלק הסתיים") : ""].filter(Boolean).join(" · ")) + '</small></span>' +
          whoTags(whoOfB(B)) + '</button>';
      });
      if (d >= today || !xs.length) {
        html += d >= today
          ? '<button type="button" class="gw-ag__add" data-gsadd="' + d + '">' + ctx.ico("plus") + 'שיבוץ ליום הזה</button>'
          : '<div class="gw-ag__none">לא שובץ דבר</div>';
      }
      html += '</div></section>';
    });
    return html + floatHtml(ctx) + '</div>';
  }

  /* ---- 🫧 שכבה צפה: סרגל הבחירה + "ביטול" ----
     ⚠️ sticky בתוך אזור הגלילה ולא fixed על ה-body: אב עם backdrop-filter
     הופך fixed ליחסי אליו, ואלמנט על ה-body נשאר תלוי כשעוברים מסך. */
  function floatHtml(ctx) {
    var h = "";
    var u = st.undo;
    if (u && u.week === ctx.week && Date.now() - u.at < UNDO_MS) {
      h += '<div class="lg lg-pill gw-toast" role="status"><span>' + esc(u.label) + '</span>' +
        '<button type="button" data-gs="undo">' + ctx.ico("undo") + 'ביטול</button></div>';
    }
    if (st.multi) {
      var n = Object.keys(st.picked).length;
      h += '<div class="lg lg-card gw-bar" role="toolbar" aria-label="פעולות על הבחירה">' +
        '<span class="gw-bar__n">' + (n ? n + " נבחרו" : "בחירה") + '</span>' +
        barBtn("mday", ctx.ico("cal"), "ליום…", !n) +
        (crew().length ? barBtn("mwho", ctx.ico("team"), "עובד", !n) : "") +
        barBtn("mrm", ctx.ico("trash"), "הסרה", !n, "is-dng") +
        '<button type="button" class="gw-bar__x" data-gb="off" aria-label="סיום הבחירה">' + ctx.ico("x") + '</button></div>';
    } else if (st.sel) {
      var B = byKey(ctx, st.sel);
      if (B && editable(B)) {
        var pri = priOf(ctx, B);
        h += '<div class="lg lg-card gw-bar" role="toolbar" aria-label="פעולות על המשימה">' +
          (pri ? barBtn("pri", ctx.ico(pri.ico), pri.label) : "") +
          barBtn("info", IC.info, "פרטים") +
          (B.n < MAXP() ? barBtn("split", IC.split, "המשך ביום אחר") : "") +
          barBtn("more", IC.multi, "בחירת עוד") +
          '<button type="button" class="gw-bar__x" data-gb="off" aria-label="ביטול הבחירה">' + ctx.ico("x") + '</button></div>';
      }
    }
    return h ? '<div class="gw-float">' + h + '</div>' : "";
  }
  function barBtn(k, ico, label, dis, cls) {
    return '<button type="button" class="gw-bar__b' + (cls ? " " + cls : "") + '" data-gb="' + k + '"' + (dis ? " disabled" : "") + '>' +
      ico + '<span>' + esc(label) + '</span></button>';
  }
  /* הפעולה הראשית של בלוק: חלק שאינו האחרון — "החלק הסתיים"; אחרת — מה
     שהכרטיס היה מציע (בוצע / סגירה / אישור), מאותה רשימה בדיוק. */
  function priOf(ctx, B) {
    if (B.n > 1 && !isLastPart(B)) return { key: "partdone", ico: "check", label: "החלק הסתיים" };
    var pri = null;
    (ctx.tiles(B.t) || []).forEach(function (x) { if (x[3] === "pri" && x[0] !== "plan") pri = x; });
    return pri ? { key: pri[0], ico: pri[1], label: String(pri[2]).replace(/\u200B/g, ""), raw: pri } : null;
  }

  /* 👷 תוויות העובדים — מסגרת דקה עם השם (בקשת יועד). 🔴 25.9 (יועד: "צריך
     שהשם יופיע באופן מלא, לא רואה סיבה שיקוצר לאות אחת") — תמיד השם המלא;
     בבלוק צר הוא נחתך בסוף (…) ולא מוחלף באות. מפתח שאינו בצוות לא מוצג. */
  function whoTags(who) {
    var names = (who || []).map(crewName).filter(Boolean);
    if (!names.length) return "";
    return '<span class="gw-whos">' + names.map(function (n) {
      return '<i title="' + esc(n) + '">' + esc(n) + '</i>';
    }).join("") + '</span>';
  }

  /* גובה אזור הגלילה = מה שנשאר עד תחתית המסך. כך הדף עצמו אינו נגלל
     והכותרת + רצועת הימים נשארות במקום, והגלילה היא רק בתוך השעות. */
  function sizeScroll(host) {
    var sc = host.querySelector(".gw-scroll");
    if (!sc) return;
    var top = sc.getBoundingClientRect().top;
    var avail = Math.round(window.innerHeight - Math.max(top, 0) - 12);
    sc.style.height = Math.max(320, avail) + "px";
    /* מה שמתחת לאזור (ריווח תחתון של המסך, שוליים) — אם הדף עדיין נגלל,
       מקטינים בדיוק בכמה שחורג. (נמדד: 32px שנשארו מתחת לקצה במחשב.) */
    var se = pageScroller(host), over = se ? se.scrollHeight - se.clientHeight - se.scrollTop : 0;
    if (over > 0 && avail - over >= 320) { avail -= over; sc.style.height = avail + "px"; }
    /* 🖥 במחשב — כל היום (06:00–23:00) במסך אחד, בלי גלילה (יועד, 25.9).
       גובה שעה = מה שנשאר חלקי 17, בין 24 ל-48 פיקסלים. במסך נמוך מדי
       (פחות מ-24 לשעה) — נשארת גלילה, כי בלוק של רבע שעה חייב להיות קריא. */
    var g = sc.querySelector(".gw-grid");
    if (g && wide() && curView() === "week") {
      var hd = g.querySelector(".gw-hd");
      var H = Math.floor((Math.max(320, avail) - (hd ? hd.offsetHeight : 0) - 4) / ((D1() - D0()) / 60));
      H = Math.max(24, Math.min(48, H));
      g.style.setProperty("--gw-h", H + "px");
      g.classList.add("is-fit");
      g.classList.toggle("is-tight", H < 34);
    }
  }
  function pageScroller(el) {
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var oy = getComputedStyle(p).overflowY;
      if ((oy === "auto" || oy === "scroll") && p.scrollHeight > p.clientHeight + 1) return p;
    }
    return document.scrollingElement || document.documentElement;
  }
  function gridH(el) {
    var g = (el && el.closest ? el.closest(".gw-grid") : null) || (st.host && st.host.querySelector(".gw-grid"));
    return g ? (parseFloat(getComputedStyle(g).getPropertyValue("--gw-h")) || 56) : 56;
  }

  function restoreScroll(host, ctx, bl) {
    var sc = host.querySelector(".gw-scroll");
    if (!sc) return;
    var V = curView(), key = viewKey(ctx);
    if (V === "agenda") {
      if (st.scroll[key] != null) { sc.scrollTop = st.scroll[key]; return; }
      var td = sc.querySelector(".gw-ag__day.is-today");
      if (td) sc.scrollTop = Math.max(0, td.offsetTop - 4);
      return;
    }
    if (V === "map") { if (st.scroll[key] != null) sc.scrollTop = st.scroll[key]; return; }
    var H = gridH(sc.querySelector(".gw-grid"));
    if (st.flashScroll != null) {
      var want = Math.max(0, (st.flashScroll - D0() - 45) / 60 * H);
      /* רק אם הבלוק מחוץ לתחום הנראה — אחרי גרירה לא קופצים. */
      var cur = st.scroll[key] != null ? st.scroll[key] : want;
      var y = (st.flashScroll - D0()) / 60 * H;
      sc.scrollTop = (y < cur || y > cur + sc.clientHeight - 60) ? want : cur;
      st.flashScroll = null; st.scrolled[key] = 1;
      return;
    }
    if (st.scroll[key] != null) { sc.scrollTop = st.scroll[key]; return; }
    if (st.scrolled[key] || ctx.loading) return;
    st.scrolled[key] = 1;
    /* הפתיחה הראשונה: היום — שעה לפני עכשיו; יום אחר — שעה לפני הבלוק
       הראשון; ריק — 07:00. */
    var dates = weekDates(ctx.week), target = 7 * 60;
    var vis = visCols(V).map(function (i) { return dates[i]; });
    var firsts = bl.filter(function (B) { return vis.indexOf(B.s.date) >= 0; })
                   .map(function (B) { return B.s.start; });
    /* ⚠️ המוקדם מבין השניים: כשרואים כמה ימים, גלילה ל"עכשיו"
       הסתירה את בלוקי הבוקר של ימים אחרים. */
    var cands = firsts.map(function (m) { return m - 30; });
    if (vis.indexOf(todayDate()) >= 0 && nowMin() > D0()) cands.push(nowMin() - 60);
    if (cands.length) target = Math.min.apply(null, cands);
    sc.scrollTop = Math.max(0, (target - D0()) / 60 * H);
  }

  /* ==========================================================================
   *  תפריטים צפים (···, עובד) — תפריט הקשר בסגנון iOS
   * ========================================================================== */
  var pop = null;
  function closePop() {
    if (!pop) return;
    var p = pop; pop = null;
    document.removeEventListener("pointerdown", p.out, true);
    window.removeEventListener("resize", closePop);
    if (p.el.parentNode) p.el.parentNode.removeChild(p.el);
    if (p.anchor) p.anchor.setAttribute("aria-expanded", "false");
  }
  /* items: [{ label, ico?, sub?, on?, dng?, dis?, go }] או "-" לקו מפריד */
  function openPop(anchor, items) {
    if (pop && pop.anchor === anchor) return closePop();
    closePop();
    var el = document.createElement("div");
    el.className = "lg lg-card gw-pop";
    el.setAttribute("role", "menu");
    el.innerHTML = items.map(function (x, i) {
      if (x === "-") return '<hr>';
      return '<button type="button" role="menuitem" data-pi="' + i + '" class="' + (x.on ? "on" : "") + (x.dng ? " is-dng" : "") + '"' + (x.dis ? " disabled" : "") + '>' +
        '<span class="gw-pop__t">' + esc(x.label) + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</span>' +
        (x.on ? '<span class="gw-pop__i">' + IC.tick + '</span>' : x.ico ? '<span class="gw-pop__i">' + x.ico + '</span>' : '') + '</button>';
    }).join("");
    document.body.appendChild(el);
    el.style.left = "0px"; el.style.top = "0px";
    /* ⚠️ zoom על ה-body (הגדרת גודל טקסט באפליקציה) — getBoundingClientRect
       מחזיר ערכים מוגדלים, אבל left/top נמדדים לפני ההגדלה. בלי החלוקה
       התפריט ברח מהמסך (נצפה חי: שמות הגננים נחתכו בצד). */
    var er = el.getBoundingClientRect(), z = el.offsetWidth ? er.width / el.offsetWidth : 1;
    var r = anchor.getBoundingClientRect(), w = er.width, vw = window.innerWidth;
    /* RTL: מיושר לקצה הימני של הכפתור, אלא אם אין מקום. */
    var left = Math.min(Math.max(8, r.right - w), vw - w - 8);
    if (r.left < vw / 2) left = Math.max(8, Math.min(r.left, vw - w - 8));
    el.style.left = (left - er.left) / z + "px";
    el.style.top = (r.bottom + 6 - er.top) / z + "px";
    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-pi]"); if (!b || b.disabled) return;
      var it = items[+b.dataset.pi]; closePop(); if (it && it.go) it.go();
    });
    function out(e) { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); }
    pop = { el: el, anchor: anchor, out: out };
    anchor.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", out, true);
    window.addEventListener("resize", closePop);
    var f = el.querySelector("button:not([disabled])"); if (f && wide()) { try { f.focus({ preventScroll: true }); } catch (x) {} }
  }
  function crewMenu(anchor, ctx) {
    var cur = st.who || "all";
    openPop(anchor, [{ label: "כולם", on: cur === "all", go: function () { setWho("all"); } }].concat(crew().map(function (c) {
      return { label: c.name + (c.me ? " (אני)" : ""), on: cur === c.key, go: function () { setWho(c.key); } };
    })));
  }
  function setWho(k) { st.who = k; lsSet(WHO_KEY, k); rerender(); }
  function moreMenu(anchor, ctx) {
    var u = st.undo && st.undo.week === ctx.week ? st.undo : null;
    var items = [];
    if (canEditView()) items.push({ label: st.multi ? "סיום בחירה מרובה" : "בחירה מרובה", ico: IC.multi, go: function () { setMulti(!st.multi); } });
    items.push({ label: "ניקוי…", ico: ctx.ico("trash"), sub: "שבוע, יום או עובד", go: function () { flowClear(ctx); } });
    if (u) items.push("-", { label: "ביטול", sub: u.label, ico: ctx.ico("undo"), go: function () { undo(ctx); } });
    openPop(anchor, items);
  }

  /* ==========================================================================
   *  מחוות
   * ========================================================================== */
  function minuteAt(col, clientY) {
    var H = gridH(col);
    var y = clientY - col.getBoundingClientRect().top;
    var m = D0() + Math.floor(y / H * 2) * 30;
    return Math.max(D0(), Math.min(D1() - 30, m));
  }

  function ghost(col, m, cls, text) {
    var g = col.querySelector(".gw-ghost");
    if (!g) { g = document.createElement("div"); g.className = "gw-ghost"; col.appendChild(g); }
    g.className = "gw-ghost " + (cls || "");
    g.style.top = "calc(var(--gw-h) * " + (m - D0()) / 60 + " + 1px)";
    g.textContent = text || ("+ " + hhmm(m));
    return g;
  }
  function unghost(host) {
    Array.prototype.forEach.call(host.querySelectorAll(".gw-ghost"), function (g) { g.parentNode.removeChild(g); });
  }
  function rerender() { if (st.host && st.host.isConnected && st.ctx) render(st.host, st.ctx); }

  function setView(v) {
    if (v === st.view) return;
    st.view = v; lsSet(VIEW_KEY, v);
    rerender();
  }
  function setSel(k) { st.sel = k; rerender(); }
  function setMulti(on, first) {
    st.multi = !!on; st.picked = {};
    if (on && first) st.picked[first] = 1;
    st.sel = null;
    rerender();
  }

  function wire(host, ctx) {
    /* שורת הכלים יכולה לשבת מחוץ ל-host (במחשב) — מחפשים בשניהם. */
    function all(sel) {
      var a = Array.prototype.slice.call(host.querySelectorAll(sel));
      if (st.tbEl) a = a.concat(Array.prototype.slice.call(st.tbEl.querySelectorAll(sel)));
      return a;
    }
    Array.prototype.forEach.call(host.querySelectorAll("[data-gsday]"), function (b) {
      b.addEventListener("click", function () { setDay(+b.dataset.gsday); });
    });
    all("[data-gv]").forEach(function (b) {
      b.addEventListener("click", function () { setView(b.dataset.gv); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-gsgo]"), function (b) {
      function go() { st.day = +b.dataset.gsgo; setView("1"); }
      b.addEventListener("click", go);
      b.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    function on(sel, fn) { var b = all(sel)[0]; if (b) b.addEventListener("click", function (e) { fn(b, e); }); }
    on('[data-gs="todo"]', function () { flowFromList(ctx); });
    on('[data-gs="ai"]', function () { CBA.gardenScheduleAi.open(ctx, api()); });
    on('[data-gs="undo"]', function () { undo(ctx); });
    on('[data-gs="crew"]', function (b) { crewMenu(b, ctx); });
    on('[data-gs="more"]', function (b) { moreMenu(b, ctx); });
    on('[data-gs="pickall"]', function () {
      var cols = visCols(curView()).map(function (i) { return weekDates(ctx.week)[i]; });
      blocks(ctx).filter(visibleB).forEach(function (B) { if (editable(B) && cols.indexOf(B.s.date) >= 0) st.picked[B.key] = 1; });
      rerender();
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-gb]"), function (b) {
      b.addEventListener("click", function () { barAction(ctx, b.dataset.gb); });
    });
    /* סדר יום: הקשה על שורה = פרטי הבלוק; "+ שיבוץ ליום הזה" */
    Array.prototype.forEach.call(host.querySelectorAll(".gw-ag__row[data-bk]"), function (b) {
      b.addEventListener("click", function () { openBlock(ctx, b.dataset.bk); });
    });
    Array.prototype.forEach.call(host.querySelectorAll("[data-gsadd]"), function (b) {
      b.addEventListener("click", function () { flowForDay(ctx, b.dataset.gsadd); });
    });
    /* מקלדת על בלוק (Enter/רווח) — אותו דבר כמו הקשה. click עם detail=0
       הוא רק מקלדת; ההקשות עצמן מטופלות ב-pointerup למטה. */
    Array.prototype.forEach.call(host.querySelectorAll(".gw-grid .gw-blk[data-bk]"), function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); if (e.detail === 0) tapBlock(ctx, b.dataset.bk); });
    });

    var sc = host.querySelector(".gw-scroll");
    if (!sc || curView() === "agenda") return;

    /* ---- לחיצה ארוכה (מגע) / לחיצה (עכבר) על שעה פנויה, הקשה על בלוק ----
       ⚠️ Pointer Events ולא touch: כשהדפדפן מתחיל לגלול הוא שולח
       pointercancel, וזה בדיוק הביטול שאנחנו צריכים — גלילה אינה שיבוץ. */
    var P = null;
    sc.addEventListener("pointerdown", function (e) {
      if (e.button !== 0 || st.drag) return;
      var MAP = curView() === "map";
      /* ✂️ ידית (מגע) או קצה (עכבר) — שינוי משך */
      var hd = e.target.closest("[data-hdl]"), edge = e.target.closest("[data-edge]");
      if (!MAP && !st.multi && (hd || (edge && e.pointerType === "mouse"))) {
        var bk = hd ? hd.dataset.bk : edge.closest(".gw-blk").dataset.bk;
        var B0 = byKey(ctx, bk);
        if (editable(B0)) { e.preventDefault(); e.stopPropagation(); return startResize(ctx, B0, hd ? hd.dataset.hdl : edge.dataset.edge, e); }
      }
      var blk = e.target.closest(".gw-blk[data-bk]");
      var col = blk ? null : e.target.closest(".gw-col");
      P = { x: e.clientX, y: e.clientY, col: col, blk: blk, type: e.pointerType, t0: Date.now(), fired: false };
      /* ✂️ גרירת בלוק: בעכבר — כל בלוק שאפשר לערוך; במגע — רק הנבחר
         (אחרת כל גלילה שמתחילה על בלוק הייתה הופכת לגרירה). */
      if (blk && !MAP && !st.multi) {
        var B1 = byKey(ctx, blk.dataset.bk);
        if (editable(B1) && (e.pointerType === "mouse" || st.sel === B1.key)) P.canDrag = B1;
        return;
      }
      if (!col || e.pointerType === "mouse" || MAP || st.multi) return;
      var m = minuteAt(col, e.clientY);
      if (!isFree(ctx, col.dataset.date, m, 15, null, viewWho())) return;
      P.m = m;
      ghost(col, m, "is-press");
      P.timer = setTimeout(function () {
        if (!P) return;
        P.fired = true;
        unghost(host);
        if (navigator.vibrate) { try { navigator.vibrate(10); } catch (x) {} }
        st.sel = null;
        flowFromSlot(ctx, col.dataset.date, m);
      }, LONG_MS);
    });
    sc.addEventListener("pointermove", function (e) {
      if (st.drag) return;
      if (P && P.canDrag && (Math.abs(e.clientX - P.x) > DRAG_TOL || Math.abs(e.clientY - P.y) > DRAG_TOL)) {
        var B = P.canDrag, p0 = P; P = null;
        return startMove(ctx, B, p0, e);
      }
      if (P && P.timer && (Math.abs(e.clientX - P.x) > MOVE_TOL || Math.abs(e.clientY - P.y) > MOVE_TOL)) {
        clearTimeout(P.timer); P.timer = null; unghost(host);
      }
      /* רחף בעכבר: "+ 08:30" במקום שבו לחיצה תשבץ. */
      if (e.pointerType === "mouse" && !e.buttons && curView() !== "map" && !st.multi) {
        var col = e.target.closest(".gw-col");
        if (!col || e.target.closest(".gw-blk") || e.target.closest(".gw-hdl")) return unghost(host);
        var m = minuteAt(col, e.clientY);
        if (isFree(ctx, col.dataset.date, m, 15, null, viewWho())) {
          Array.prototype.forEach.call(host.querySelectorAll(".gw-col"), function (c) {
            if (c !== col) { var g = c.querySelector(".gw-ghost"); if (g) g.parentNode.removeChild(g); }
          });
          ghost(col, m, "is-hover");
        } else unghost(host);
      }
    });
    sc.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") unghost(host); });
    function end(e, cancelled) {
      if (!P) return;
      var p = P; P = null;
      if (p.timer) clearTimeout(p.timer);
      unghost(host);
      if (cancelled || p.fired) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      var V = curView();
      /* החלקה אופקית במובייל = יום/חלון אחר. ב-RTL היום הבא יושב משמאל,
         ולכן אצבע שנעה ימינה "מושכת" אותו פנימה. */
      if (p.type !== "mouse" && (V === "1" || V === "2" || V === "3") && Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy)) {
        return page(dx > 0 ? 1 : -1);
      }
      if (Math.abs(dx) > MOVE_TOL || Math.abs(dy) > MOVE_TOL) return;
      if (p.blk) return tapBlock(ctx, p.blk.dataset.bk);
      if (!p.col) return;
      if (V === "map") { st.day = +p.col.dataset.di; return setView("1"); }
      /* יש בחירה — הקשה על שטח ריק רק מבטלת אותה (כמו ביומן של אייפון). */
      if (st.sel) return setSel(null);
      if (st.multi) return;
      var m = minuteAt(p.col, e.clientY);
      if (!isFree(ctx, p.col.dataset.date, m, 15, null, viewWho())) return;
      if (p.type === "mouse") return flowFromSlot(ctx, p.col.dataset.date, m);
      /* הקשה קצרה במגע — מזכירים את המחווה, לא משבצים. */
      toast("לחיצה ארוכה על השעה — לשיבוץ משימה");
    }
    sc.addEventListener("pointerup", function (e) { end(e, false); });
    sc.addEventListener("pointercancel", function (e) { end(e, true); });
    sc.addEventListener("contextmenu", function (e) { if (e.target.closest(".gw-col")) e.preventDefault(); });
    sc.addEventListener("scroll", function () {
      if (st.ctx) st.scroll[viewKey(st.ctx)] = sc.scrollTop;
      closePop();
    }, { passive: true });
  }

  /* הקשה על בלוק: מפה → היום שלו · בחירה מרובה → הוספה/הסרה · סגורה →
     פרטים · לא נבחר → בחירה · נבחר → פרטים (הכרעת יועד). */
  function tapBlock(ctx, k) {
    var B = byKey(ctx, k); if (!B) return;
    if (curView() === "map") {
      st.day = weekDates(ctx.week).indexOf(B.s.date); if (st.day < 0) st.day = 0;
      if (editable(B)) st.sel = B.key;
      return setView("1");
    }
    if (st.multi) {
      if (!editable(B)) return toast(B.t.closure ? "משימה סגורה — אי אפשר לשנות אותה" : "החלק הזה כבר הסתיים");
      if (st.picked[k]) delete st.picked[k]; else st.picked[k] = 1;
      return rerender();
    }
    if (B.t.closure) return ctx.openDetails(B.t.id);
    if (!editable(B) || st.sel === k) return openBlock(ctx, k);
    setSel(k);
  }

  function page(dir) {
    var V = curView();
    if (V === "1") return setDay(st.day + dir);
    var n = nDays(V), a = winStart(V), b = Math.max(0, Math.min(6 - n, a + dir * n));
    if (b === a) return;
    st.day = b; rerender();
  }
  function setDay(i) {
    if (i < 0 || i > 5) return;
    var V = curView();
    if (V === "1" && i === st.day) return;
    st.day = i;
    rerender();
  }

  /* ==========================================================================
   *  ✂️ גרירה — שינוי משך (ידיות/קצוות) והזזה (גוף הבלוק)
   * --------------------------------------------------------------------------
   *  הבלוק זז חי על המסך, נצמד לרבעי שעה, ולא נכנס לבלוק אחר של אותם
   *  עובדים. רק בשחרור נשמר — ואז "ביטול" בבועה למטה.
   *  ⚠️ מאזינים על window: אצבע שיוצאת מהבלוק עדיין גוררת אותו.
   * ========================================================================== */
  function contentY(sc, clientY) { return clientY - sc.getBoundingClientRect().top + sc.scrollTop; }
  function autoScroll(sc, clientY) {
    var r = sc.getBoundingClientRect();
    if (clientY < r.top + 40) sc.scrollTop -= 10;
    else if (clientY > r.bottom - 40) sc.scrollTop += 10;
  }
  function pill(el, text) {
    var p = el.querySelector(".gw-dpill");
    if (!p) { p = document.createElement("span"); p.className = "gw-dpill"; el.appendChild(p); }
    p.textContent = text;
  }
  function dragEnd(fn) {
    function up(e) { cleanup(); fn(e, false); }
    function cancel(e) { cleanup(); fn(e, true); }
    function key(e) { if (e.key === "Escape") { cleanup(); fn(e, true); } }
    function cleanup() {
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
      window.removeEventListener("keydown", key, true);
    }
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", cancel, true);
    window.addEventListener("keydown", key, true);
    return cleanup;
  }

  function startResize(ctx, B, edge, e) {
    var host = st.host, sc = host.querySelector(".gw-scroll");
    var el = host.querySelector('.gw-blk[data-bk="' + cssEsc(B.key) + '"]');
    if (!sc || !el) return;
    var H = gridH(el), lim = limitsOf(ctx, B);
    var a0 = B.s.start, b0 = B.s.start + B.s.dur, a = a0, b = b0;
    var y0 = contentY(sc, e.clientY);
    host.classList.add("is-dragging");
    el.classList.add("is-drag");
    Array.prototype.forEach.call(host.querySelectorAll(".gw-hdl"), function (h) { h.style.display = "none"; });
    st.drag = { kind: "resize" };
    pill(el, hhmm(a) + "–" + hhmm(b));
    function move(ev) {
      if (ev.pointerType === "touch" || ev.pointerType === "pen") ev.preventDefault();
      autoScroll(sc, ev.clientY);
      var dm = Math.round((contentY(sc, ev.clientY) - y0) / H * 60 / 15) * 15;
      if (edge === "top") a = Math.max(lim.lo, Math.min(b0 - 15, a0 + dm));
      else b = Math.min(lim.hi, Math.max(a0 + 15, b0 + dm));
      el.style.top = "calc(var(--gw-h) * " + (a - D0()) / 60 + " + 1px)";
      el.style.height = "calc(var(--gw-h) * " + (b - a) / 60 + " - 3px)";
      pill(el, hhmm(a) + "–" + hhmm(b) + " · " + durText(b - a));
      el.classList.toggle("is-limit", (edge === "top" && a === lim.lo && a0 + dm < lim.lo) || (edge !== "top" && b === lim.hi && b0 + dm > lim.hi));
    }
    window.addEventListener("pointermove", move, { passive: false, capture: true });
    dragEnd(function (ev, cancelled) {
      window.removeEventListener("pointermove", move, { capture: true });
      st.drag = null;
      host.classList.remove("is-dragging");
      if (cancelled || (a === a0 && b === b0)) return rerender();
      var np = copyPart(B.s); np.start = a; np.dur = b - a;
      commitPart(ctx, B, np, durText(b - a) + " · " + hhmm(a) + "–" + hhmm(b));
    });
  }

  function startMove(ctx, B, p0, e) {
    var host = st.host, sc = host.querySelector(".gw-scroll");
    var el = host.querySelector('.gw-blk[data-bk="' + cssEsc(B.key) + '"]');
    if (!sc || !el) return;
    var H = gridH(el), dur = B.s.dur, who = whoOfB(B);
    var grab = contentY(sc, p0.y) - (B.s.start - D0()) / 60 * H;
    var date = B.s.date, start = B.s.start, ok = true;
    st.drag = { kind: "move" };
    st.sel = B.key;
    host.classList.add("is-dragging");
    el.classList.add("is-drag");
    el.style.width = "calc(100% - 6px)"; el.style.insetInlineStart = "3px";
    Array.prototype.forEach.call(host.querySelectorAll(".gw-hdl"), function (h) { h.style.display = "none"; });
    function move(ev) {
      if (ev.pointerType === "touch" || ev.pointerType === "pen") ev.preventDefault();
      autoScroll(sc, ev.clientY);
      /* עמודה מתחת לאצבע — כשרואים כמה ימים אפשר להזיז גם ליום אחר. */
      var cols = host.querySelectorAll(".gw-col"), col = null;
      for (var i = 0; i < cols.length; i++) {
        var r = cols[i].getBoundingClientRect();
        if (ev.clientX >= r.left && ev.clientX < r.right) { col = cols[i]; break; }
      }
      if (col && col.dataset.date !== date) { date = col.dataset.date; col.appendChild(el); }
      var m = D0() + Math.round((contentY(sc, ev.clientY) - grab) / H * 60 / 15) * 15;
      start = Math.max(D0(), Math.min(D1() - dur, m));
      ok = isFree(ctx, date, start, dur, B.key, who);
      el.style.top = "calc(var(--gw-h) * " + (start - D0()) / 60 + " + 1px)";
      el.classList.toggle("is-bad", !ok);
      pill(el, (date !== B.s.date ? DAYS1[weekDates(ctx.week).indexOf(date)] + " " : "") + hhmm(start) + "–" + hhmm(start + dur));
    }
    window.addEventListener("pointermove", move, { passive: false, capture: true });
    move(e);
    dragEnd(function (ev, cancelled) {
      window.removeEventListener("pointermove", move, { capture: true });
      st.drag = null;
      host.classList.remove("is-dragging");
      if (cancelled || (date === B.s.date && start === B.s.start)) return rerender();
      if (!ok) { rerender(); return toast("יש שם כבר משימה" + (who.length ? " לאותו עובד" : "") + " — הבלוק חזר למקומו"); }
      var np = copyPart(B.s); np.date = date; np.start = start;
      commitPart(ctx, B, np, "הוזז · " + slotText(np, ctx.week));
    });
  }
  function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/["\\#]/g, "\\$&"); }
  function copyPart(s) { var o = {}; for (var k in s) if (s.hasOwnProperty(k)) o[k] = k === "who" ? (s.who || []).slice() : s[k]; return o; }

  /* ⌨️ מקלדת במחשב: Esc מבטל בחירה · Delete מסיר · חצים מזיזים ברבע שעה
     (Shift+חץ — משנה משך). רק כשהסידור על המסך ואין חלון פתוח. */
  document.addEventListener("keydown", function (e) {
    if (!st.host || !st.host.isConnected || !st.ctx || st.drag) return;
    var tg = e.target; if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
    if (document.querySelector(".cba-dlg-backdrop.is-open, .gw-sheet-wrap.is-open")) return;
    var ctx = st.ctx;
    if (e.key === "Escape" && (st.sel || st.multi)) { closePop(); st.sel = null; st.multi = false; st.picked = {}; return rerender(); }
    var B = byKey(ctx, st.sel); if (!editable(B)) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); return removeParts(ctx, [B.key], "הוסר מהסידור"); }
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      var d = e.key === "ArrowUp" ? -15 : 15, np = copyPart(B.s);
      if (e.shiftKey) np.dur = Math.max(15, np.dur + d); else np.start += d;
      if (!isFree(ctx, np.date, np.start, np.dur, B.key, whoOfB(B))) return toast("אין מקום — יש שם משימה אחרת");
      commitPart(ctx, B, np, e.shiftKey ? durText(np.dur) : hhmm(np.start) + "–" + hhmm(np.start + np.dur));
    }
  });

  /* שינוי רוחב (סיבוב מסך, חלון שהוקטן) — ציור מחדש כשחוצים את הסף,
     ותיקון הגובה בכל שינוי. */
  var mq = window.matchMedia ? window.matchMedia(WIDE_Q) : null;
  function onMq() { rerender(); }
  if (mq) { if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq); }
  var rsz = null;
  window.addEventListener("resize", function () {
    clearTimeout(rsz);
    rsz = setTimeout(function () { if (st.host && st.host.isConnected) sizeScroll(st.host); }, 120);
  });

  /* ==========================================================================
   *  הגיליון — חלון אחד, שלבים מתחלפים בתוכו
   * --------------------------------------------------------------------------
   *  ⚠️ **חלון אחד ולא חלון לכל שלב.** `CBA.ui.sheet` חוסם פתיחה כפולה
   *     לפי תווית (ממצא 23), ושלושה חלונות מוערמים היו מחייבים שלוש
   *     סגירות. כאן השלב מוחלף בתוך אותו חלון, עם "חזרה".
   * ========================================================================== */
  function Flow(ctx, steps) {
    var sh = null, body = null, stack = [];
    closePop();
    function open() {
      if (!(CBA.ui && CBA.ui.sheet)) return;
      var r = CBA.ui.sheet({ label: "סידור שבועי", key: "gw-flow", cls: "gw-sheet-wrap", sheetCls: "gw-sheet",
                             html: '<div class="gw-flow"></div>' });
      sh = r; body = r.wrap.querySelector(".gw-flow");
      body.addEventListener("click", onClick);
    }
    var handlers = {};
    function onClick(e) {
      var b = e.target.closest("[data-f]");
      if (!b || b.disabled || b.classList.contains("is-dis")) return;
      var h = handlers[b.dataset.f];
      if (h) h(b);
    }
    function show(step) {
      handlers = step.on || {};
      var n = stack.length;
      body.innerHTML =
        '<div class="gw-fh">' +
          (n > 1 ? '<button type="button" class="gw-back" data-f="__back" aria-label="חזרה">' + ctx.ico("prev") + '</button>' : '') +
          '<div class="gw-fh__t"><h4>' + esc(step.title) + '</h4>' +
            (step.sub ? '<span>' + esc(step.sub) + '</span>' : '') + '</div>' +
          '<button type="button" class="gw-x" data-f="__close" aria-label="סגירה">' + ctx.ico("x") + '</button>' +
        '</div>' +
        (step.dots ? '<div class="gw-steps" aria-hidden="true">' + step.dots.map(function (on) {
          return '<i class="' + (on ? "on" : "") + '"></i>'; }).join("") + '</div>' : '') +
        '<div class="gw-fb">' + step.html + '</div>';
      handlers.__back = function () { stack.pop(); show(stack[stack.length - 1]); };
      handlers.__close = close;
      if (step.mount) step.mount(body);
      var f = body.querySelector(".gw-fb button:not([disabled]):not(.is-dis)");
      if (f && wide()) { try { f.focus({ preventScroll: true }); } catch (x) {} }
    }
    function push(step) { if (!sh) open(); if (!body) return; stack.push(step); show(step); }
    /* מחליף את השלב העליון — לשלב ביניים כמו "מסדר…", ש"חזרה" לא אמורה לחזור אליו. */
    function replace(step) { if (stack.length) stack.pop(); push(step); }
    function close() { if (sh) sh.close(); sh = null; }
    /* ⚠️ נסגר גם ברקע/Escape (mountSheet), בלי לעבור כאן — לכן בודקים את החלון עצמו. */
    function isOpen() { return !!sh && !!sh.wrap && sh.wrap.classList.contains("is-open"); }
    return { push: push, replace: replace, close: close, isOpen: isOpen };
  }

  function taskOpt(t, ctx, extra) {
    var cat = ctx.catOf(t) || { key: "lawn", ico: "lawn" }, lvl = dragLevel(t, ctx);
    return '<button type="button" class="gw-opt k-' + cat.key + '" data-f="task" data-id="' + esc(t.id) + '">' +
      '<span class="gt-cube">' + ctx.ico(cat.ico) + '</span>' +
      '<span class="gw-opt__t"><b>' + esc(t.title || t.category || "משימה") + '</b>' +
        '<small>' + esc([t.area, extra].filter(Boolean).join(" · ")) + '</small></span>' +
      (lvl ? '<span class="gt-age is-l' + lvl + '">נגררה</span>' : '') +
      (t.repId ? '<span class="gw-rep" title="דיווח תושב">' + ctx.ico("person") + '</span>' : '') +
      '<span class="gw-opt__go">' + ctx.ico("next") + '</span></button>';
  }

  /* ---- שלב: בחירת משימה ---- */
  function stepTask(ctx, F, title, sub, dots, onPick) {
    var list = sortPick(unscheduled(ctx), ctx);
    F.push({
      title: title, sub: sub, dots: dots,
      html: list.length
        ? '<div class="gw-list">' + list.map(function (t) { return taskOpt(t, ctx); }).join("") + '</div>'
        : '<div class="gw-empty"><b>הכול כבר בסידור</b>אין משימות פתוחות לשבוע הזה שממתינות לשעה. ' +
          'משימה בלי שבוע צריכה קודם שיבוץ לשבוע במסך המשימות.</div>',
      on: { task: function (b) { onPick(byId(ctx, b.dataset.id)); } }
    });
  }

  /* ---- שלב: יום ----  o: { who, ign, title } — להמשך של משימה מפוצלת */
  function stepDay(ctx, F, t, dots, onPick, o) {
    o = o || {};
    var dates = weekDates(ctx.week), today = todayDate();
    var who = o.who || defaultWho(ctx, t), ign = o.ign !== undefined ? o.ign : t.id;
    F.push({
      title: o.title || "באיזה יום?", sub: t.title || t.category, dots: dots,
      html: '<div class="gw-list">' + dates.map(function (d, i) {
        var fm = freeMinutes(ctx, d, ign, who), starts = freeStarts(ctx, d, ign, who).length;
        var n = blocks(ctx).filter(function (B) { return B.s.date === d && !ignored(B, ign) && whoOverlap(who, whoOfB(B)); }).length;
        var dd = parseKey(d);
        var info = [n ? (n === 1 ? "משימה אחת" : n + " משימות") : "ריק",
                    starts ? durText(Math.floor(fm / 30) * 30 || 15) + " פנויות" : "אין זמן פנוי"].join(" · ");
        return '<button type="button" class="gw-opt gw-opt--day' + (starts ? "" : " is-dis") + (d < today ? " is-past" : "") +
          '" data-f="day" data-d="' + d + '"' + (starts ? "" : " disabled") + '>' +
          '<span class="gw-dnum"><b>' + DAYS1[i] + '</b><small>' + dd.getDate() + '</small></span>' +
          '<span class="gw-opt__t"><b>יום ' + DAYS[i] +
            (d === today ? ' <i class="gw-today">היום</i>' : '') + '</b><small>' + esc(info) + '</small></span>' +
          '<span class="gw-opt__go">' + ctx.ico("next") + '</span></button>';
      }).join("") + '</div>' +
      (who.length ? '<p class="gw-note">הזמן הפנוי מחושב ל' + esc(who.map(crewName).filter(Boolean).join(" ו")) + '. אפשר לשנות עובדים בשלב האחרון.</p>' : ''),
      on: { day: function (b) { onPick(b.dataset.d); } }
    });
  }

  /* ---- שלב: שעה ---- */
  function stepTime(ctx, F, t, date, dots, onPick, o) {
    o = o || {};
    var fs = freeStarts(ctx, date, o.ign !== undefined ? o.ign : t.id, o.who || defaultWho(ctx, t));
    var today = todayDate(), nm = nowMin();
    var groups = [["בוקר", D0(), 12 * 60], ["צהריים", 12 * 60, 17 * 60], ["ערב", 17 * 60, D1()]];
    /* ההרגל של המשימה ("בדרך כלל 07:00") מסומן — הצעה, לא חובה. */
    var p = S().profile ? S().profile(t, ctx.rows) : null;
    var usual = p && p.start != null ? Math.round(p.start / 30) * 30 : null;
    F.push({
      title: "באיזו שעה? · " + dayLabel(date, ctx.week), sub: t.title || t.category, dots: dots,
      html: groups.map(function (g) {
        var xs = fs.filter(function (m) { return m >= g[1] && m < g[2]; });
        if (!xs.length) return "";
        return '<div class="gw-tg"><h5>' + g[0] + '</h5><div class="gw-chips">' + xs.map(function (m) {
          var past = date === today && m + 30 <= nm;
          return '<button type="button" class="gw-chip' + (past ? " is-past" : "") + (m === usual ? " is-usual" : "") +
            '" data-f="time" data-m="' + m + '"' + (m === usual ? ' title="השעה הרגילה של המשימה"' : '') + '>' + hhmm(m) + '</button>';
        }).join("") + '</div></div>';
      }).join("") || '<div class="gw-empty"><b>אין זמן פנוי ביום הזה</b>אפשר לחזור ולבחור יום אחר.</div>',
      on: { time: function (b) { onPick(+b.dataset.m); } }
    });
  }

  /* ==========================================================================
   *  גלגלת — רכיב אחד לשלושה שימושים: משך, עובדים+משך, זמן בפועל
   * --------------------------------------------------------------------------
   *  🔴 24.9 (יועד: "שפשוט ישר תיפתח הגלילה, בלי הפריסטים") — אין יותר
   *     צ'יפים של משך. הגלגלת פתוחה מההתחלה, ההערכה כבר מסומנת בה, וכפתור
   *     אחד שומר ("שיבוץ · שעה וחצי").
   * ========================================================================== */
  var IH = 40;
  function wheelHtml(values) {
    return '<div class="gw-wheel" tabindex="0" aria-label="משך">' +
      values.map(function (w) { return '<div class="gw-wi" data-m="' + w + '">' + durText(w) + '</div>'; }).join("") + '</div>';
  }
  /* values משתנה (עובדים אחרים ⇒ זמן פנוי אחר) — rebuild מחליף אותן ושומר על הבחירה. */
  function mountWheel(wl, values, init, onSel) {
    var cur = values.slice(), tmr = null;
    function sel() {
      if (!cur.length) return onSel(null);
      var i = Math.max(0, Math.min(cur.length - 1, Math.round(wl.scrollTop / IH)));
      Array.prototype.forEach.call(wl.children, function (c, k) { c.classList.toggle("on", k === i); });
      onSel(cur[i]);
    }
    function go(v) {
      var i = cur.indexOf(v);
      if (i < 0) { i = 0; for (var k = 0; k < cur.length; k++) if (cur[k] <= v) i = k; }
      wl.scrollTop = i * IH; sel();
    }
    wl.addEventListener("scroll", function () { clearTimeout(tmr); tmr = setTimeout(sel, 60); }, { passive: true });
    wl.addEventListener("click", function (e) {
      var it = e.target.closest(".gw-wi"); if (!it) return;
      wl.scrollTo({ top: Array.prototype.indexOf.call(wl.children, it) * IH, behavior: "smooth" });
    });
    wl.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); wl.scrollTop += (e.key === "ArrowDown" ? IH : -IH); sel(); }
    });
    /* scrollTop עובד רק כשהאלמנט כבר בעץ ובגובה אמיתי — לכן בפריים הבא. */
    setTimeout(function () { go(init); }, 0);
    return {
      rebuild: function (vals, keep) {
        cur = vals.slice(); wl.innerHTML = cur.map(function (w) { return '<div class="gw-wi" data-m="' + w + '">' + durText(w) + '</div>'; }).join("");
        setTimeout(function () { go(keep); }, 0);
      }
    };
  }
  function range(max) { var a = []; for (var m = 15; m <= Math.min(max, 8 * 60); m += 15) a.push(m); return a; }
  function crewChips(sel, disabled) {
    var c = crew(); if (!c.length) return "";
    return '<div class="gw-crewpick" role="group" aria-label="מי עושה">' + c.map(function (x) {
      var on = sel.indexOf(x.key) >= 0, dis = !on && disabled && disabled[x.key];
      return '<button type="button" class="gw-chip gw-chip--who' + (on ? " on" : "") + (dis ? " is-dis" : "") + '" data-f="who" data-k="' + esc(x.key) +
        '" aria-pressed="' + on + '"' + (dis ? ' disabled title="תפוס בשעה הזו"' : '') + '>' + esc(x.name) + '</button>';
    }).join("") + '</div>';
  }
  function whoText(who) { var n = (who || []).map(crewName).filter(Boolean); return n.length ? " · " + n.join(" ו") : ""; }

  /* ---- שלב: משך + מי (אחרון בכל מסלול) ----
     o: { ign — מה לא נחשב תפוס (ברירת מחדל: כל חלקי המשימה), note — שורת הסבר } */
  function stepDur(ctx, F, t, date, start, dots, cur, curWho, onPick, o) {
    o = o || {};
    var ign = o.ign !== undefined ? o.ign : t.id;
    var who = (curWho || defaultWho(ctx, t)).slice();
    function busyAt(k) { return !isFree(ctx, date, start, 15, ign, [k]); }
    var dis = {}; crew().forEach(function (x) { if (busyAt(x.key)) dis[x.key] = 1; });
    who = who.filter(function (k) { return !dis[k]; });
    function maxNow() { return maxFrom(ctx, date, start, ign, who); }
    function est() { return S().estimate ? S().estimate(t, ctx.rows, who) : null; }
    var e0 = est(), pick = cur || o.dur || (e0 && e0.dur) || 60, wheel = null;
    F.push({
      title: crew().length ? "מי וכמה זמן?" : "כמה זמן?",
      sub: (t.title || t.category) + " · " + dayLabel(date, ctx.week) + " " + hhmm(start), dots: dots,
      html:
        crewChips(who, dis) +
        wheelHtml(range(maxNow())) +
        '<p class="gw-est" data-est></p>' +
        (o.note ? '<p class="gw-note">' + esc(o.note) + '</p>' : '') +
        '<p class="gw-note" data-max></p>' +
        '<button type="button" class="gd-cta gw-wheel-ok" data-f="ok">שיבוץ</button>',
      mount: function (body) {
        var okb = body.querySelector("[data-f=ok]");
        function note() {
          var m = maxNow(), e = est();
          body.querySelector("[data-max]").textContent = m < D1() - start
            ? "פנוי עד " + hhmm(start + m) + " — אחרי זה כבר יש משימה" + (who.length ? " לאותם עובדים" : "") + "."
            : "פנוי עד סוף היום (" + hhmm(D1()) + ").";
          body.querySelector("[data-est]").innerHTML = e && !o.note ? SPARK + 'הערכה: <b>' + durText(e.dur) + '</b> · ' + esc(S().estimateText(e)) : "";
        }
        wheel = mountWheel(body.querySelector(".gw-wheel"), range(maxNow()), pick, function (v) {
          pick = v; okb.disabled = !v;
          okb.textContent = v ? "שיבוץ · " + durText(v) + whoText(who) : "אין זמן פנוי";
        });
        note();
        body._whoChanged = function () {
          note();
          wheel.rebuild(range(maxNow()), pick);
          Array.prototype.forEach.call(body.querySelectorAll("[data-f=who]"), function (b) {
            var on = who.indexOf(b.dataset.k) >= 0; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on));
          });
        };
      },
      on: {
        who: function (b) {
          var k = b.dataset.k, i = who.indexOf(k);
          if (i >= 0) who.splice(i, 1); else who.push(k);
          b.closest(".gw-flow")._whoChanged();
        },
        ok: function () { if (pick) onPick(pick, who.slice()); }
      }
    });
  }

  /* ---- 👷 עובדים — לבלוק אחד, או לכמה (בחירה מרובה) ---- */
  function stepWho(ctx, F, title, sub, who, dis, onPick) {
    who = (who || []).slice();
    F.push({
      title: title, sub: sub,
      html: crewChips(who, dis) +
        (dis && Object.keys(dis).length ? '<p class="gw-note">מי שמסומן כתפוס כבר משובץ למשימה אחרת בשעות האלה.</p>' : '') +
        '<button type="button" class="gd-cta" data-f="ok">שמירה</button>',
      on: {
        who: function (b) {
          var k = b.dataset.k, i = who.indexOf(k);
          if (i >= 0) who.splice(i, 1); else who.push(k);
          b.classList.toggle("on", i < 0); b.setAttribute("aria-pressed", String(i < 0));
        },
        ok: function () { onPick(who.slice()); }
      }
    });
  }

  /* ---- ⏱ כמה זמן זה לקח בפועל (24.9, הכרעת יועד: "לחיצה אחת ב'בוצע'") ----
     נשאל **לפני** הסימון: אחרי שמשימה נסגרת הכלל כבר לא מתיר לגעת ב-slot. */
  function stepActual(ctx, F, t, planned, onDone, sub) {
    var pick = planned;
    var vals = []; for (var m = 15; m <= 8 * 60; m += 15) vals.push(m);
    if (vals.indexOf(planned) < 0) vals.push(planned), vals.sort(function (a, b) { return a - b; });
    F.push({
      title: "כמה זמן זה לקח?", sub: (t.title || t.category) + " · " + (sub || "תוכנן " + durText(planned)),
      html:
        '<button type="button" class="gd-cta gw-asplan" data-f="plan">' + ctx.ico("check") + 'כמתוכנן · ' + durText(planned) + '</button>' +
        '<p class="gw-note">או לבחור כמה זה לקח באמת — ההערכה של הפעם הבאה תלמד מזה:</p>' +
        wheelHtml(vals) +
        '<button type="button" class="gw-act" data-f="save">שמירה</button>' +
        '<button type="button" class="gw-skip" data-f="skip">דלג</button>',
      mount: function (body) {
        var sb = body.querySelector("[data-f=save]");
        mountWheel(body.querySelector(".gw-wheel"), vals, planned, function (v) {
          pick = v; sb.textContent = v === planned ? "שמירה · כמתוכנן" : "שמירה · " + durText(v);
        });
      },
      on: {
        plan: function () { onDone(planned); },
        save: function () { onDone(pick); },
        skip: function () { onDone(null); }
      }
    });
  }

  function byId(ctx, id) {
    var r = (ctx && ctx.rows) || [];
    for (var i = 0; i < r.length; i++) if (String(r[i].id) === String(id)) return r[i];
    return null;
  }

  /* ==========================================================================
   *  שמירה — אופטימית, עם החזרה במקרה כשל, ו"ביטול" לכל שינוי
   * ========================================================================== */
  /* שמירה של כמה שיבוצים יחד. כל אחד נכתב לבד — מסמך לכל משימה, כמו בכל
     מקום אחר — ומה שנכשל חוזר אחורה **לבד**, בלי לבטל את מה שהצליח.
     התוצאה: "שובצו 6 מתוך 7" ולא הכול-או-כלום. */
  function saveMany(ctx, items, done) {
    var prev = items.map(function (it) { var t = byId(ctx, it.id); return { id: it.id, prev: t ? (t.slot || null) : null }; });
    items.forEach(function (it) { var t = byId(ctx, it.id); if (t) t.slot = it.slot; });
    lsSet(HINT_KEY, "1");
    ctx.redraw();
    var left = items.length, ok = [], bad = [];
    if (!left) return done && done(ok, bad);
    items.forEach(function (it, i) {
      S().write(it.id, it.slot, function (r) {
        if (r && r.ok) ok.push(prev[i]);
        else { var t = byId(ctx, it.id); if (t) t.slot = prev[i].prev; bad.push({ id: it.id, error: r && r.error }); }
        if (--left === 0) { if (bad.length) ctx.redraw(); if (done) done(ok, bad); }
      });
    });
  }
  /* 🔁 כל שינוי עובר כאן: שומר, ומשאיר "ביטול" (בועה למטה + בתפריט ···). */
  function commit(ctx, items, label, after) {
    items = items.filter(function (it) { var t = byId(ctx, it.id); return t && !same(t.slot, it.slot); });
    if (!items.length) return;
    saveMany(ctx, items, function (ok, bad) {
      var good = items.filter(function (it) { return !bad.some(function (b) { return b.id === it.id; }); });
      if (good.length) {
        st.undo = { week: ctx.week, label: label, at: Date.now(), items: good.map(function (it) {
          var p = ok.filter(function (o) { return o.id === it.id; })[0];
          return { id: it.id, prev: p ? p.prev : null, next: it.slot };
        }) };
        scheduleUndoHide();
      }
      ctx.redraw();
      if (bad.length) toast(good.length ? "נשמרו " + good.length + " מתוך " + items.length + " — השאר לא נשמרו"
                                        : (bad[0].error || "השינוי לא נשמר"), "error");
      if (after) after(good, bad);
    });
  }
  var undoTmr = null;
  function scheduleUndoHide() {
    clearTimeout(undoTmr);
    undoTmr = setTimeout(function () {
      var t = st.host && st.host.querySelector(".gw-toast");
      if (t) { t.classList.add("is-out"); setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250); }
    }, UNDO_MS);
  }
  function undo(ctx) {
    var u = st.undo; if (!u) return;
    st.undo = null; clearTimeout(undoTmr);
    /* ⚠️ מחזירים רק מה שעדיין בדיוק כפי שהשינוי השאיר אותו. שיבוץ שהמשתמש
       (או עורך אחר) שינה בינתיים — נשאר; הביטול אינו דורס עבודה חדשה. */
    var items = u.items.filter(function (x) { var t = byId(ctx, x.id); return t && same(t.slot, x.next); })
      .map(function (x) { return { id: x.id, slot: x.prev }; });
    var skipped = u.items.length - items.length;
    saveMany(ctx, items, function (ok, bad) {
      ctx.redraw();
      toast(bad.length || skipped ? "בוטל חלקית — " + (bad.length + skipped) + " לא הוחזרו" : "בוטל · " + u.label, bad.length ? "error" : undefined);
    });
  }

  /* ✂️ עריכת חלק אחד: מחליף (או מסיר, np=null) את החלק i ושומר. */
  function slotWith(t, i, np) {
    var ps = partsOf(t);
    if (np) { if (i == null || i >= ps.length) ps.push(np); else ps[i] = np; }
    else if (i != null) ps.splice(i, 1);
    return S().fromParts(ps);
  }
  /* המפתח של חלק אחרי שמירה — fromParts ממיין, והאינדקס יכול להשתנות. */
  function keyAfter(t, slot, np) {
    var ps = S().parts(slot);
    for (var i = 0; i < ps.length; i++) if (ps[i].date === np.date && ps[i].start === np.start) return bkey(t.id, i);
    return null;
  }
  function commitPart(ctx, B, np, label, F) {
    var slot = slotWith(B.t, B.i, np);
    if (F) F.close();
    if (np) {
      var k = keyAfter(B.t, slot, np);
      if (st.sel === B.key || !st.sel) st.sel = k;
      st.flash = k; st.flashScroll = np.start;
      var di = weekDates(ctx.week).indexOf(np.date);
      if (di >= 0 && curView() === "1") st.day = di;
      else if (di >= 0 && visCols(curView()).indexOf(di) < 0) st.day = di;
    } else if (st.sel === B.key) st.sel = null;
    commit(ctx, [{ id: B.t.id, slot: slot }], label);
  }
  /* הסרה של כמה חלקים (אולי מכמה משימות) — מקובץ למשימה. */
  function removeParts(ctx, keys, label) {
    var by = {};
    keys.forEach(function (k) { var o = splitKey(k); (by[o.id] = by[o.id] || []).push(o.i); });
    var items = Object.keys(by).map(function (id) {
      var t = byId(ctx, id); if (!t) return null;
      var ps = partsOf(t).filter(function (p, i) { return by[id].indexOf(i) < 0; });
      return { id: id, slot: S().fromParts(ps) };
    }).filter(Boolean);
    st.sel = null; st.picked = {};
    commit(ctx, items, label);
  }

  /* שמירה אחרי מסלול בחירה (משימה חדשה בסידור / הזזה מתוך החלון). */
  function save(ctx, t, slot, F, msg) {
    if (!t) return;
    if (F) F.close();
    if (slot) {
      st.flash = bkey(t.id, 0);
      st.flashScroll = slot.start;
      var i = weekDates(ctx.week).indexOf(slot.date);
      if (i >= 0 && (curView() === "1" || visCols(curView()).indexOf(i) < 0)) st.day = i;
    }
    commit(ctx, [{ id: t.id, slot: slot }], msg || (slot ? "שובץ · " + slotText(slot, ctx.week) : "הוסר מהסידור"));
  }

  /* מה שמודול הסידור החכם צריך — בלי לחשוף את כל הקובץ. */
  function api() {
    return {
      Flow: Flow, unscheduled: unscheduled, blocks: blocks, busyOn: busyOn, isFree: isFree,
      crew: crew, crewName: crewName, defaultWho: defaultWho, whoOf: whoOf, whoOverlap: whoOverlap,
      viewWho: viewWho, whoTags: whoTags,
      weekDates: weekDates, todayDate: todayDate, nowMin: nowMin, hhmm: hhmm, durText: durText,
      dayLabel: dayLabel, DAYS: DAYS, DAYS1: DAYS1, D0: D0, D1: D1, esc: esc, toast: toast,
      byId: function (id) { return byId(st.ctx, id); }, dragLevel: dragLevel, SPARK: SPARK,
      apply: function (ctx, items) {
        if (items.length) {
          var d = weekDates(ctx.week).indexOf(items[0].slot.date);
          if (d >= 0) st.day = d;
        }
        commit(ctx, items, "הסידור החכם שיבץ " + (items.length === 1 ? "משימה אחת" : items.length + " משימות"), function (good, bad) {
          if (!bad.length) toast("שובצו " + good.length + " משימות");
        });
      }
    };
  }

  function slotOf(date, start, dur, who, base) {
    var o = { date: date, start: start, dur: dur };
    if (who && who.length) o.who = who;
    if (base && base.act != null) o.act = base.act;
    if (base && base.done) o.done = true;
    return o;
  }

  /* ---- מסלול א׳: מהסידור (השעה ידועה) → משימה → מי וכמה זמן ---- */
  function flowFromSlot(ctx, date, start) {
    var F = Flow(ctx);
    stepTask(ctx, F, "מה לשבץ ב-" + hhmm(start) + "?",
      dayLabel(date, ctx.week) + " · משימות השבוע שעוד לא בסידור", [1, 0], function (t) {
        if (!t) return;
        stepDur(ctx, F, t, date, start, [1, 1], null, null, function (m, who) {
          save(ctx, t, slotWith(t, null, slotOf(date, start, m, who)), F);
        });
      });
  }

  /* ---- 📋 מסדר היום: "+ שיבוץ ליום הזה" → משימה → שעה → מי וכמה זמן ---- */
  function flowForDay(ctx, date) {
    var F = Flow(ctx);
    stepTask(ctx, F, "מה לשבץ ב" + dayLabel(date, ctx.week) + "?", "משימות השבוע שעוד לא בסידור", [1, 0, 0], function (t) {
      if (!t) return;
      stepTime(ctx, F, t, date, [1, 1, 0], function (start) {
        stepDur(ctx, F, t, date, start, [1, 1, 1], null, null, function (m, who) {
          save(ctx, t, slotWith(t, null, slotOf(date, start, m, who)), F);
        });
      });
    });
  }

  /* ---- מסלול ב׳: מהמשימה → יום → שעה → מי וכמה זמן ----
     i: איזה חלק מזיזים (ברירת מחדל: הראשון, אם כבר יש). שאר החלקים נשארים. */
  function flowPlace(ctx, t, F, lead, i) {
    F = F || Flow(ctx);
    var ps = partsOf(t);
    if (i == null) i = ps.length ? 0 : null;
    var base = i != null ? ps[i] : null, ign = i != null ? bkey(t.id, i) : t.id;
    var pre = lead ? [1] : [];
    var o = { ign: ign, who: base && base.who && base.who.length ? base.who : undefined };
    stepDay(ctx, F, t, pre.concat([1, 0, 0]), function (date) {
      stepTime(ctx, F, t, date, pre.concat([1, 1, 0]), function (start) {
        stepDur(ctx, F, t, date, start, pre.concat([1, 1, 1]), base && base.dur, base && base.who, function (m, who) {
          var np = slotOf(date, start, m, who, base);
          var slot = slotWith(t, i, np);
          if (F) F.close();
          st.flash = keyAfter(t, slot, np); st.flashScroll = start;
          var di = weekDates(ctx.week).indexOf(date);
          if (di >= 0 && (curView() === "1" || visCols(curView()).indexOf(di) < 0)) st.day = di;
          commit(ctx, [{ id: t.id, slot: slot }], (base ? "הוזז · " : "שובץ · ") + slotText(np, ctx.week));
        }, { ign: ign });
      }, o);
    }, o);
  }

  /* ---- ✂️ המשך ביום אחר: יום → שעה → מי וכמה (ברירת מחדל: מה שנשאר) ---- */
  function flowContinue(ctx, B) {
    var t = B.t, ps = partsOf(t), F = Flow(ctx);
    var planned = ps.reduce(function (m, p) { return m + p.dur; }, 0);
    var e = S().estimate ? S().estimate(t, ctx.rows, whoOfB(B)) : null;
    /* ברירת המחדל: מה שנשאר מההערכה. כשכבר תוכנן יותר מההערכה (היא נמוכה
       מדי) — אורך החלק הזה, כי כנראה צריך עוד יום דומה. */
    var left = e ? Math.round((e.dur - planned) / 15) * 15 : 0;
    if (left < 30) left = B.s.dur;
    var o = { ign: "", who: whoOfB(B).length ? whoOfB(B) : undefined, title: "המשך — באיזה יום?" };
    stepDay(ctx, F, t, [1, 0, 0], function (date) {
      stepTime(ctx, F, t, date, [1, 1, 0], function (start) {
        stepDur(ctx, F, t, date, start, [1, 1, 1], null, whoOfB(B), function (m, who) {
          var np = slotOf(date, start, m, who);
          var slot = slotWith(t, null, np);
          F.close();
          st.sel = keyAfter(t, slot, np); st.flash = st.sel; st.flashScroll = start;
          var di = weekDates(ctx.week).indexOf(date);
          if (di >= 0 && visCols(curView()).indexOf(di) < 0) st.day = di;
          commit(ctx, [{ id: t.id, slot: slot }], "נוסף המשך · " + slotText(np, ctx.week));
        }, { ign: "", dur: left, note: "כבר תוכננו " + durText(planned) + (e && e.src !== "default" ? " מתוך הערכה של " + durText(e.dur) : "") + "." });
      }, o);
    }, o);
  }

  /* ---- מהשורה "N לא בסידור": משימה → יום → שעה → מי וכמה זמן ---- */
  function flowFromList(ctx) {
    var F = Flow(ctx);
    stepTask(ctx, F, "מה לשבץ?", "משימות השבוע שעוד לא בסידור", [1, 0, 0, 0], function (t) {
      if (t) flowPlace(ctx, t, F, true);
    });
  }

  /* ---- ✓ "בוצע" מתוך בלוק ----
     חלק שאינו האחרון: "החלק הסתיים" — מסמן רק אותו (done + act), המשימה
     נשארת פתוחה. האחרון (או משימה בחלק אחד): כמה זמן לקח → הסימון הרגיל. */
  function doPrimary(ctx, B, F) {
    var pri = priOf(ctx, B); if (!pri) return;
    F = F || Flow(ctx);
    if (pri.key === "partdone") {
      return stepActual(ctx, F, B.t, B.s.dur, function (act) {
        var np = copyPart(B.s); np.done = true; if (act != null) np.act = act;
        commitPart(ctx, B, np, "החלק הסתיים · " + (B.i + 1) + " מתוך " + B.n, F);
      }, "חלק " + (B.i + 1) + " מתוך " + B.n + " · תוכנן " + durText(B.s.dur));
    }
    if (pri.key !== "markdone") { F.close(); return ctx.tile(B.t.id, pri.key); }
    stepActual(ctx, F, B.t, B.s.dur, function (act) {
      F.close();
      st.sel = null;
      if (act == null) return ctx.tile(B.t.id, pri.key);
      var np = copyPart(B.s); np.act = act;
      var slot = slotWith(B.t, B.i, np);
      B.t.slot = slot;
      S().write(B.t.id, slot, function () { ctx.tile(B.t.id, pri.key); });
    });
  }

  /* ---- פעולות בסרגל הצף ---- */
  function barAction(ctx, k) {
    if (k === "off") { st.sel = null; st.multi = false; st.picked = {}; return rerender(); }
    if (st.multi) {
      var keys = Object.keys(st.picked);
      if (!keys.length) return;
      if (k === "mrm") return removeParts(ctx, keys, keys.length === 1 ? "הוסר מהסידור" : "הוסרו " + keys.length + " מהסידור");
      if (k === "mday") return flowMultiDay(ctx, keys);
      if (k === "mwho") return flowMultiWho(ctx, keys);
      return;
    }
    var B = byKey(ctx, st.sel); if (!editable(B)) return;
    if (k === "pri") return doPrimary(ctx, B);
    if (k === "info") return openBlock(ctx, B.key);
    if (k === "split") return flowContinue(ctx, B);
    if (k === "more") return setMulti(true, B.key);
  }

  /* ---- בחירה מרובה: ליום… — שומר על השעה אם פנויה, אחרת הפנויה הבאה ---- */
  function flowMultiDay(ctx, keys) {
    var F = Flow(ctx), dates = weekDates(ctx.week), today = todayDate();
    F.push({
      title: "להעביר " + (keys.length === 1 ? "משימה אחת" : keys.length + " משימות") + " ליום…",
      sub: "השעות נשמרות כשהן פנויות; אחרת — הזמן הפנוי הבא",
      html: '<div class="gw-list">' + dates.map(function (d, i) {
        var dd = parseKey(d);
        return '<button type="button" class="gw-opt gw-opt--day' + (d < today ? " is-past" : "") + '" data-f="day" data-d="' + d + '">' +
          '<span class="gw-dnum"><b>' + DAYS1[i] + '</b><small>' + dd.getDate() + '</small></span>' +
          '<span class="gw-opt__t"><b>יום ' + DAYS[i] + (d === today ? ' <i class="gw-today">היום</i>' : '') + '</b></span>' +
          '<span class="gw-opt__go">' + ctx.ico("next") + '</span></button>';
      }).join("") + '</div>',
      on: { day: function (b) {
        var date = b.dataset.d, extra = [], upd = {}, moved = 0, miss = 0;
        var Bs = keys.map(function (k) { return byKey(ctx, k); }).filter(editable)
          .sort(function (x, y) { return x.s.start - y.s.start; });
        Bs.forEach(function (B) {
          var who = whoOfB(B), a = null;
          for (var m = B.s.start; m + B.s.dur <= D1() && a == null; m += 15) if (isFree(ctx, date, m, B.s.dur, keys, who, extra)) a = m;
          for (var m2 = D0(); m2 < B.s.start && a == null; m2 += 15) if (isFree(ctx, date, m2, B.s.dur, keys, who, extra)) a = m2;
          if (a == null) { miss++; return; }
          var np = copyPart(B.s); np.date = date; np.start = a;
          extra.push({ date: date, start: a, dur: B.s.dur, who: who });
          (upd[B.t.id] = upd[B.t.id] || {})[B.i] = np; moved++;
        });
        F.close();
        applyPartUpdates(ctx, upd, "הועברו " + moved + " ל" + dayLabel(date, ctx.week));
        if (miss) toast(miss + " לא נכנסו — אין להן מקום באותו יום", "error");
        var di = dates.indexOf(date); if (di >= 0 && visCols(curView()).indexOf(di) < 0) st.day = di;
      } }
    });
  }
  /* ---- בחירה מרובה: עובד ---- */
  function flowMultiWho(ctx, keys) {
    var F = Flow(ctx);
    var Bs = keys.map(function (k) { return byKey(ctx, k); }).filter(editable);
    var first = Bs.length ? whoOfB(Bs[0]) : [];
    stepWho(ctx, F, "מי עושה?", (Bs.length === 1 ? "משימה אחת" : Bs.length + " משימות") + " נבחרו", first, null, function (who) {
      var extra = [], upd = {}, done = 0, miss = 0;
      Bs.sort(function (x, y) { return x.s.date < y.s.date ? -1 : x.s.date > y.s.date ? 1 : x.s.start - y.s.start; }).forEach(function (B) {
        if (!isFree(ctx, B.s.date, B.s.start, B.s.dur, keys, who, extra)) { miss++; return; }
        var np = copyPart(B.s); if (who.length) np.who = who.slice(); else delete np.who;
        extra.push({ date: B.s.date, start: B.s.start, dur: B.s.dur, who: who });
        (upd[B.t.id] = upd[B.t.id] || {})[B.i] = np; done++;
      });
      F.close();
      applyPartUpdates(ctx, upd, who.length ? "שובצו ל" + whoText(who).replace(/^ · /, "") : "הוסרו העובדים");
      if (miss) toast(miss + " לא שונו — העובד כבר תפוס בשעות שלהן", "error");
    });
  }
  function applyPartUpdates(ctx, upd, label) {
    var items = Object.keys(upd).map(function (id) {
      var t = byId(ctx, id); if (!t) return null;
      var ps = partsOf(t).map(function (p, i) { return upd[id][i] || p; });
      return { id: id, slot: S().fromParts(ps) };
    }).filter(Boolean);
    st.picked = {}; st.multi = false;
    commit(ctx, items, label);
  }

  /* ---- 🧹 ניקוי: שבוע / הימים המוצגים / עובד (הכרעת יועד: תפריט) ----
     רק משימות פתוחות וחלקים שלא הסתיימו; מה שבוצע נשאר. תמיד עם ביטול. */
  function flowClear(ctx) {
    var F = Flow(ctx), V = curView(), dates = weekDates(ctx.week);
    var all = blocks(ctx).filter(editable);
    var opts = [{ k: "week", label: "כל השבוע", xs: all }];
    if (V === "1" || V === "2" || V === "3") {
      var vis = visCols(V).map(function (i) { return dates[i]; });
      opts.push({ k: "vis", label: vis.length === 1 ? dayLabel(vis[0], ctx.week) : "הימים המוצגים (" + DAYS1[visCols(V)[0]] + "–" + DAYS1[visCols(V)[vis.length - 1]] + ")",
                  xs: all.filter(function (B) { return vis.indexOf(B.s.date) >= 0; }) });
    }
    crew().forEach(function (c) {
      opts.push({ k: "w:" + c.key, who: c.key, label: "של " + c.name + " השבוע", xs: all.filter(function (B) { return whoOfB(B).indexOf(c.key) >= 0; }) });
    });
    F.push({
      title: "ניקוי הסידור", sub: "משימות שבוצעו נשארות. אפשר לבטל אחרי.",
      html: '<div class="gw-list">' + opts.map(function (o, i) {
        var n = o.xs.length;
        return '<button type="button" class="gw-opt' + (n ? "" : " is-dis") + '" data-f="pick" data-i="' + i + '"' + (n ? "" : " disabled") + '>' +
          '<span class="gw-opt__t"><b>' + esc(o.label) + '</b><small>' + (n ? (n === 1 ? "שיבוץ אחד" : n + " שיבוצים") : "אין מה לנקות") + '</small></span>' +
          '<span class="gw-opt__go">' + ctx.ico("next") + '</span></button>';
      }).join("") + '</div>',
      on: { pick: function (b) {
        var o = opts[+b.dataset.i];
        F.push({
          title: "לנקות " + (o.xs.length === 1 ? "שיבוץ אחד" : o.xs.length + " שיבוצים") + "?",
          sub: o.label,
          html: '<p class="gw-note" style="margin-top:0">' + (o.who
              ? "שיבוצים של " + esc(crewName(o.who)) + " לבד יוסרו מהסידור; בשיבוץ משותף רק השם שלו יורד."
              : "המשימות חוזרות לרשימת \"לא בסידור\" — הן נשארות פתוחות ובאותו שבוע.") + '</p>' +
            '<button type="button" class="gw-act is-dng is-wide gw-clear-go" data-f="go">' + ctx.ico("trash") + 'ניקוי</button>',
          on: { go: function () {
            F.close();
            if (!o.who) return removeParts(ctx, o.xs.map(function (B) { return B.key; }), "נוקו " + o.xs.length + " · " + o.label);
            var upd = {}, rm = [];
            o.xs.forEach(function (B) {
              var w = whoOfB(B).filter(function (k) { return k !== o.who; });
              if (!w.length) { rm.push(B); return; }
              var np = copyPart(B.s); np.who = w; (upd[B.t.id] = upd[B.t.id] || {})[B.i] = np;
            });
            var ids = {};
            rm.forEach(function (B) { (ids[B.t.id] = ids[B.t.id] || []).push(B.i); });
            var items = {};
            Object.keys(upd).concat(Object.keys(ids)).forEach(function (id) { items[id] = 1; });
            var list = Object.keys(items).map(function (id) {
              var t = byId(ctx, id);
              var ps = partsOf(t).map(function (p, i) { return (upd[id] && upd[id][i]) || p; })
                .filter(function (p, i) { return !(ids[id] && ids[id].indexOf(i) >= 0); });
              return { id: id, slot: S().fromParts(ps) };
            });
            st.sel = null;
            commit(ctx, list, "נוקה · " + o.label);
          } }
        });
      } }
    });
  }

  /* ---- פרטי בלוק (הקשה שנייה / "פרטים") ---- */
  function openBlock(ctx, k) {
    var B = byKey(ctx, k);
    if (!B) return;
    var t = B.t;
    /* משימה סגורה אינה ניתנת להזזה (גם הכלל דוחה) — פותחים את הפרטים. */
    if (t.closure) return ctx.openDetails(t.id);
    var pri = editable(B) ? priOf(ctx, B) : null;
    var hasCrew = crew().length > 0;
    var F = Flow(ctx);
    var part = B.n > 1 ? "חלק " + (B.i + 1) + " מתוך " + B.n + " · " : "";
    F.push({
      title: t.title || t.category || "משימה",
      sub: [t.area, part + slotText(B.s, ctx.week) + whoText(whoOfB(B))].filter(Boolean).join(" · "),
      html: '<div class="gw-acts">' +
        (pri ? '<button type="button" class="gw-act is-pri" data-f="pri">' + ctx.ico(pri.ico) + esc(pri.label) + '</button>' : '') +
        (B.s.done ? '<div class="gw-wait is-ok">' + ctx.ico("check") + 'החלק הזה הסתיים' + (B.s.act ? " · " + durText(B.s.act) : "") + '</div>' : '') +
        (t.flag === "ממתין לאישור" ? '<div class="gw-wait">' + ctx.ico("clock") + (ctx.isManager ? "בוצע · ממתין לאישורך" : "בוצע · ממתין לאישור המנהל") + '</div>' : '') +
        (editable(B) ? '<button type="button" class="gw-act" data-f="dur">' + ctx.ico("clock") + 'שינוי משך</button>' +
          '<button type="button" class="gw-act" data-f="move">' + ctx.ico("cal") + 'הזזה</button>' : '') +
        (editable(B) && hasCrew ? '<button type="button" class="gw-act is-wide" data-f="who">' + ctx.ico("team") + 'מי עושה' +
          '<small>' + esc(whoText(whoOfB(B)).replace(/^ · /, "") || "לא שובץ עובד") + '</small></button>' : '') +
        (editable(B) && B.n < MAXP() ? '<button type="button" class="gw-act is-wide" data-f="split">' + IC.split + 'המשך ביום אחר' +
          '<small>למשימה שלא נגמרת ביום אחד</small></button>' : '') +
        (B.s.done ? '<button type="button" class="gw-act is-wide" data-f="undone">' + ctx.ico("undo") + 'ביטול "החלק הסתיים"</button>' : '') +
        '<button type="button" class="gw-act is-wide" data-f="info">' + ctx.ico("note") + 'פרטי המשימה</button>' +
        '<button type="button" class="gw-act is-wide is-dng" data-f="rm">' + ctx.ico("x") + (B.n > 1 ? 'הסרת החלק הזה' : 'הסרה מהסידור') +
          '<small>' + (B.n > 1 ? "שאר החלקים נשארים" : "המשימה נשארת פתוחה ובאותו שבוע") + '</small></button>' +
      '</div>',
      on: {
        pri: function () { doPrimary(ctx, B, F); },
        info: function () { F.close(); ctx.openDetails(t.id); },
        rm: function () { F.close(); removeParts(ctx, [B.key], B.n > 1 ? "הוסר חלק " + (B.i + 1) : "הוסר מהסידור"); },
        undone: function () { var np = copyPart(B.s); delete np.done; commitPart(ctx, B, np, "החלק חזר לפתוח", F); },
        dur: function () {
          stepDur(ctx, F, t, B.s.date, B.s.start, null, B.s.dur, whoOfB(B), function (m, who) {
            commitPart(ctx, B, slotOf(B.s.date, B.s.start, m, who, B.s), "עודכן · " + durText(m) + whoText(who), F);
          }, { ign: B.key });
        },
        who: function () {
          var dis = {};
          crew().forEach(function (x) { if (!isFree(ctx, B.s.date, B.s.start, B.s.dur, B.key, [x.key])) dis[x.key] = 1; });
          stepWho(ctx, F, "מי עושה?", (t.title || t.category) + " · " + slotText(B.s, ctx.week), whoOfB(B), dis, function (who) {
            commitPart(ctx, B, slotOf(B.s.date, B.s.start, B.s.dur, who, B.s),
                       who.length ? "שובץ ל" + whoText(who).replace(/^ · /, "") : "הוסרו העובדים מהבלוק", F);
          });
        },
        split: function () { F.close(); flowContinue(ctx, B); },
        move: function () { flowPlace(ctx, t, F, false, B.i); }
      }
    });
  }

  /* ==========================================================================
   *  ממשק ציבורי
   * ========================================================================== */
  CBA.gardenSchedule = {
    /** האם להציג את הסידור בכלל. מסלול Firestore בלבד — ר' gardenSlots.js. */
    available: function () {
      return !!(CBA.gardenSlots && CBA.ui && CBA.ui.sheet && CBA.data &&
                CBA.data.gardenDirectWrites && CBA.data.gardenDirectWrites());
    },
    render: render,
    /** מסלול ב׳ מתוך כרטיס במסך המשימות (קוביית "סידור"). */
    place: function (t, ctx) {
      if (!t || t.closure) return;
      if (!t.week) return toast("קודם משבצים את המשימה לשבוע, ואז לשעה בסידור");
      flowPlace(ctx, t, null, false);
    },
    /** שורת המטא בכרטיס: "ד׳ 08:00" כשהמשימה בסידור של השבוע המוצג
        (✂️ משימה מפוצלת: החלק הראשון בשבוע + "+1"). */
    chip: function (t, week) {
      if (!shown(t, week)) return "";
      var ps = partsOf(t).filter(function (p) { return inWeekDate(p.date, week); });
      var p = ps[0], i = weekDates(week).indexOf(p.date);
      return DAYS1[i] + " " + hhmm(p.start) + (ps.length > 1 ? " +" + (ps.length - 1) : "") + whoText(p.who || []);
    },
    /* לבדיקות בלבד */
    _t: { layout: layout, candidates: candidates, shown: shown, unscheduled: unscheduled, blocks: blocks,
          maxFrom: maxFrom, freeStarts: freeStarts, durText: durText, weekDates: weekDates, api: api,
          limitsOf: limitsOf, slotWith: slotWith, st: st }
  };
})();
