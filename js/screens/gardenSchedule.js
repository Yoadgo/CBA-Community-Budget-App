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
 *       אותו מסלול נפתח גם מהשורה "N עוד לא בסידור" (עם בחירת משימה לפני).
 *
 *  ⚠️ הכרעות מבנה:
 *   · מובייל (< 760px): **יום אחד** + רצועת ימים. שש עמודות על 390px הן
 *     פסים של 55px שאף כותרת לא נכנסת בהם. במחשב — שש העמודות.
 *   · המשך: ברירות מוכנות + "אחר" עם גלגלת ב-15 דק' (הכרעת יועד).
 *   · אין חפיפה בבחירה (מציעים רק זמן פנוי), אבל **הציור יודע חפיפה** —
 *     שני עורכים (גנן ומנהל) יכולים לשבץ לאותה שעה בו-זמנית.
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};

  var DAYS  = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי"];
  var DAYS1 = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳"];
  var MON   = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
               "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
  var LONG_MS = 450;          // לחיצה ארוכה
  var MOVE_TOL = 9;           // תזוזה שמבטלת לחיצה ארוכה (px)
  var WIDE_Q = "(min-width: 760px)";
  var HINT_KEY = "cba.gs.used";
  var WHO_KEY = "cba.gs.who";
  /* ✨ לסידור החכם — מוטמע כאן כי ICONS של המסך אינו כולל אותו. */
  var SPARK = '<svg class="gw-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M9.94 14.06 4 20"/><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"/>' +
    '<path d="M19 15v4"/><path d="M21 17h-4"/></svg>';
  function aiOk() { return !!CBA.gardenScheduleAi; }

  function S() { return CBA.gardenSlots; }
  function D0() { return S() ? S().DAY_START : 360; }
  function D1() { return S() ? S().DAY_END : 1380; }

  /* ---- מצב ברמת המודול: שורד את draw() של המסך ---- */
  var st = {
    day: null,          // אינדקס יום נבחר (מובייל)
    dayWeek: null,      // לאיזה שבוע שייך הבחירה
    scroll: {},         // מיקום גלילה לפי שבוע
    scrolled: {},       // האם כבר גללנו אוטומטית לשבוע הזה
    flash: null,        // מזהה משימה להבהוב אחרי שמירה
    who: null,          // מסנן העובד בתצוגה: "all" או מפתח ("74:2"). null = עוד לא נקבע
    crewAsked: false,
    ctx: null, host: null
  };

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function toast(m, k) { if (CBA.ui && CBA.ui.toast) CBA.ui.toast(m, k); }
  function wide() { return !!(window.matchMedia && window.matchMedia(WIDE_Q).matches); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

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
  function dayLabel(date, wk) {
    var i = weekDates(wk).indexOf(date);
    return i < 0 ? date : "יום " + DAYS[i];
  }
  function slotText(s, wk) { return dayLabel(s.date, wk) + " · " + hhmm(s.start) + "–" + hhmm(s.start + s.dur); }

  /* ==========================================================================
   *  מה מוצג ומה מועמד   — 🔑 כאן כל הכללים, בשני פונקציות
   * ========================================================================== */
  function isOpen(t) { return !!t && !t.closure && !t.pendingDelete; }
  function inWeek(s, wk) { return !!s && weekDates(wk).indexOf(s.date) >= 0; }

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
  /* בלוק מוצג בשבוע wk: השיבוץ נופל בשבוע, ו —
     · משימה סגורה: תמיד (היסטוריה — "מה עשיתי ביום שלישי").
     · משימה פתוחה: רק אם היא עדיין שייכת לשבוע הזה או לפניו. מנהל שהעביר
       אותה לשבוע הבא — הבלוק הישן נעלם מכאן לבד, **בלי שום כתיבה**.
       זה מה שמשאיר את השבוע של המשימה המקור היחיד, והסידור שקוף לו. */
  function shown(t, wk) {
    if (!t || t.pendingDelete || !inWeek(t.slot, wk)) return false;
    if (t.closure) return true;
    return !!t.week && t.week <= wk;
  }
  function blocks(ctx) { return (ctx.rows || []).filter(function (t) { return shown(t, ctx.week); }); }
  function unscheduled(ctx) {
    return candidates(ctx).filter(function (t) { return !shown(t, ctx.week); });
  }

  /* ==========================================================================
   *  👷 עובדים (24.9) — "פנוי" הוא פנוי **לאותם עובדים**
   * --------------------------------------------------------------------------
   *  שני בלוקים באותה שעה מתנגשים רק אם יש להם עובד משותף. בלוק בלי עובדים
   *  (או בדיקה בלי עובדים) מתנגש בכל דבר — כך בדיוק התנהג הסידור עד היום,
   *  ולכן שיכון בלי צוות מוגדר לא מרגיש שום שינוי.
   * ========================================================================== */
  function whoOf(t) { return (t && t.slot && t.slot.who) || []; }
  function whoOverlap(a, b) {
    if (!a || !a.length || !b || !b.length) return true;
    return a.some(function (k) { return b.indexOf(k) >= 0; });
  }
  /* תפוסה ביום — מרווחים [start, end). ignore = המשימה שמזיזים. */
  function busyOn(ctx, date, ignore, who) {
    return blocks(ctx).filter(function (t) {
      return t.slot.date === date && String(t.id) !== String(ignore || "") && whoOverlap(who, whoOf(t));
    }).map(function (t) { return [t.slot.start, t.slot.start + t.slot.dur]; });
  }
  function isFree(ctx, date, a, len, ignore, who) {
    if (a < D0() || a + len > D1()) return false;
    return !busyOn(ctx, date, ignore, who).some(function (r) { return a < r[1] && a + len > r[0]; });
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
    var ev = list.slice().sort(function (a, b) { return a.slot.start - b.slot.start || b.slot.dur - a.slot.dur; });
    var out = [], cluster = [], cols = [], clusterEnd = -1;
    function flush() {
      var n = cols.length || 1;
      cluster.forEach(function (x) { x.n = n; });
      cluster = []; cols = [];
    }
    ev.forEach(function (t) {
      var a = t.slot.start, b = a + t.slot.dur;
      if (a >= clusterEnd) { flush(); clusterEnd = b; } else clusterEnd = Math.max(clusterEnd, b);
      var c = 0; while (c < cols.length && cols[c] > a) c++;
      cols[c] = b;
      var item = { t: t, col: c, n: 1 };
      cluster.push(item); out.push(item);
    });
    flush();
    return out;
  }

  /* ==========================================================================
   *  ציור
   * ========================================================================== */
  function pickDefaultDay(ctx) {
    var dates = weekDates(ctx.week), i = dates.indexOf(todayDate());
    return i >= 0 ? i : 0;
  }

  function render(host, ctx) {
    if (!host) return;
    /* שמירת הגלילה לפני שמחליפים את התוכן. */
    var old = host.querySelector(".gw-scroll");
    if (old && st.ctx) st.scroll[st.ctx.week + (wide() ? "w" : st.day)] = old.scrollTop;
    st.ctx = ctx; st.host = host;
    if (st.dayWeek !== ctx.week || st.day == null) { st.day = pickDefaultDay(ctx); st.dayWeek = ctx.week; }

    var W = wide();
    var dates = weekDates(ctx.week);
    var cols = W ? [0, 1, 2, 3, 4, 5] : [st.day];
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
    var vw = viewWho();
    var bl = ctx.loading ? [] : blocks(ctx).filter(function (t) {
      return !vw.length || !whoOf(t).length || whoOf(t).indexOf(vw[0]) >= 0;
    });
    var un = ctx.loading ? [] : unscheduled(ctx);
    var cand = ctx.loading ? 0 : candidates(ctx).length;

    var html = "";

    /* --- רצועת ימים (מובייל) --- */
    if (!W) {
      html += '<div class="gw-days" role="tablist" aria-label="ימי השבוע">' + dates.map(function (d, i) {
        var n = bl.filter(function (t) { return t.slot.date === d; }).length;
        var dd = parseKey(d);
        return '<button type="button" role="tab" data-gsday="' + i + '" aria-selected="' + (i === st.day) + '"' +
          ' class="' + (i === st.day ? "on" : "") + (d === today ? " is-today" : "") + (d < today ? " is-past" : "") + '">' +
          '<b>' + DAYS1[i] + '</b><small>' + dd.getDate() + '</small>' +
          '<i class="gw-dots" aria-label="' + n + ' משימות">' + (n ? new Array(Math.min(n, 4) + 1).join("<u></u>") : "") + '</i>' +
          '</button>';
      }).join("") + '</div>';
    }

    /* --- 👷 מסנן עובד — רק כשיש שניים ומעלה ---- */
    var cr = crew();
    if (cr.length >= 2) {
      html += '<div class="gw-crew" role="tablist" aria-label="עובד">' +
        [{ key: "all", name: "הכול" }].concat(cr).map(function (c) {
          var on = (st.who || "all") === c.key;
          return '<button type="button" role="tab" data-who="' + esc(c.key) + '" aria-selected="' + on + '" class="' + (on ? "on" : "") + '">' +
            esc(c.name) + (c.me ? ' <small>(אני)</small>' : '') + '</button>';
        }).join("") + '</div>';
    }

    /* --- שורת "לא בסידור" — גם סטטוס וגם נקודת כניסה ---- */
    if (!ctx.loading) {
      /* 🤖 "סידור חכם" הוחל — שורת ביטול, עד שסוגרים אותה או מחילים שוב. */
      if (st.aiUndo && st.aiUndo.week === ctx.week) {
        html += '<div class="gw-undo" role="status">' + SPARK +
          '<span>הסידור החכם שיבץ ' + (st.aiUndo.items.length === 1 ? "משימה אחת" : st.aiUndo.items.length + " משימות") + '</span>' +
          '<button type="button" data-gs="undo">ביטול</button>' +
          '<button type="button" class="gw-undo__x" data-gs="undo-x" aria-label="סגירה">' + ctx.ico("x") + '</button></div>';
      }
      if (un.length) {
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
      if (!lsGet(HINT_KEY)) {
        html += '<div class="gw-hint">' + (W
          ? "לחיצה על שעה פנויה — ובוחרים איזו משימה לשבץ בה."
          : "לחיצה ארוכה על שעה פנויה — ובוחרים איזו משימה לשבץ בה.") + '</div>';
      }
    }

    /* --- הרשת --- */
    var hours = []; for (var h = D0(); h < D1(); h += 60) hours.push(h);
    html += '<div class="gw-scroll" tabindex="-1"><div class="gw-grid' + (W ? " is-wide" : "") + '" style="--cols:' + cols.length + '">';
    if (W) {
      html += '<div class="gw-hd gw-hd--corner"></div>' + cols.map(function (i) {
        var d = dates[i], dd = parseKey(d);
        return '<div class="gw-hd' + (d === today ? " is-today" : "") + (d < today ? " is-past" : "") + '">' +
          '<b>' + DAYS[i] + '</b><small>' + dd.getDate() + ' ' + MON[dd.getMonth()] + '</small></div>';
      }).join("");
    }
    html += '<div class="gw-times" aria-hidden="true">' + hours.map(function (m) {
      return '<span>' + hhmm(m) + '</span>';
    }).join("") + '</div>';

    cols.forEach(function (i) {
      var d = dates[i];
      var dayBl = bl.filter(function (t) { return t.slot.date === d; });
      html += '<div class="gw-col' + (d === today ? " is-today" : "") + (d < today ? " is-past" : "") +
        '" data-date="' + d + '" aria-label="יום ' + DAYS[i] + '">';
      if (d === today) {
        var nm = nowMin();
        if (nm > D0()) html += '<div class="gw-pastshade" style="height:calc(var(--gw-h) * ' + (Math.min(nm, D1()) - D0()) / 60 + ')"></div>';
        if (nm >= D0() && nm <= D1()) html += '<div class="gw-now" style="top:calc(var(--gw-h) * ' + (nm - D0()) / 60 + ')"></div>';
      }
      if (ctx.loading) {
        html += '<div class="gw-blk is-skel" style="top:calc(var(--gw-h) * ' + (1 + i % 3) + ');height:calc(var(--gw-h) * 1.5 - 4px)"></div>';
      }
      layout(dayBl).forEach(function (L) { html += blockHtml(L, ctx); });
      html += '</div>';
    });
    html += '</div></div>';

    host.innerHTML = html;
    host.classList.add("gw-host");
    wire(host, ctx);
    sizeScroll(host);
    restoreScroll(host, ctx, bl);
    st.flash = null;
  }

  function blockHtml(L, ctx) {
    var t = L.t, s = t.slot, cat = ctx.catOf(t) || { key: "lawn", ico: "lawn" };
    var top = (s.start - D0()) / 60, h = s.dur / 60;
    var w = 100 / L.n, off = w * L.col;
    var closed = !!t.closure, pend = t.flag === "ממתין לאישור";
    var lvl = closed ? 0 : dragLevel(t, ctx);
    var cls = "gw-blk k-" + cat.key + (closed ? " is-closed" : "") + (pend ? " is-pend" : "") +
      (lvl ? " is-u" + lvl : "") + (s.dur <= 30 ? " is-short" : "") + (L.n > 1 ? " is-narrow" : "") +
      (st.flash && String(st.flash) === String(t.id) ? " is-flash" : "");
    var state = closed ? (t.closure === "בוצע" ? "בוצע" : t.closure) : pend ? "ממתין לאישור" : "";
    var label = (t.title || t.category || "משימה") + ", " + hhmm(s.start) + " עד " + hhmm(s.start + s.dur) +
      (t.area ? ", " + t.area : "") + (state ? ", " + state : "");
    return '<button type="button" class="' + cls + '" data-gsid="' + esc(t.id) + '" aria-label="' + esc(label) + '"' +
      ' style="top:calc(var(--gw-h) * ' + top + ' + 1px);height:calc(var(--gw-h) * ' + h + ' - 3px);' +
      'inset-inline-start:calc(' + off + '% + 3px);width:calc(' + w + '% - 6px)">' +
      '<b>' + (closed ? ctx.ico("check") : pend ? ctx.ico("clock") : ctx.ico(cat.ico)) +
        '<span>' + esc(t.title || t.category || "משימה") + '</span></b>' +
      '<em>' + esc(hhmm(s.start) + "–" + hhmm(s.start + s.dur)) + (t.area ? " · " + esc(t.area) : "") + '</em>' +
      /* ראשי תיבות רק כשבאמת צר: עמודת מחשב מפוצלת, או חצי שעה. בנייד יש מקום לשם. */
      whoTags(whoOf(t), (wide() && L.n > 1) || L.n > 2 || s.dur <= 30) +
      '</button>';
  }
  /* 👷 תוויות העובדים — מסגרת דקה עם השם (בקשת יועד). בבלוק צר או קצר —
     האות הראשונה בלבד, והשם המלא ב-title. מפתח שאינו בצוות (עזב) לא מוצג. */
  function whoTags(who, compact) {
    var names = (who || []).map(crewName).filter(Boolean);
    if (!names.length) return "";
    return '<span class="gw-whos' + (compact ? " is-compact" : "") + '">' + names.map(function (n) {
      return '<i title="' + esc(n) + '">' + esc(compact ? n.charAt(0) : n) + '</i>';
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
  }

  function restoreScroll(host, ctx, bl) {
    var sc = host.querySelector(".gw-scroll");
    if (!sc) return;
    var H = parseFloat(getComputedStyle(sc.querySelector(".gw-grid")).getPropertyValue("--gw-h")) || 56;
    var key = ctx.week + (wide() ? "w" : st.day);
    if (st.flashScroll != null) {
      sc.scrollTop = Math.max(0, (st.flashScroll - D0() - 45) / 60 * H);
      st.flashScroll = null; st.scrolled[key] = 1;
      return;
    }
    if (st.scroll[key] != null) { sc.scrollTop = st.scroll[key]; return; }
    if (st.scrolled[key] || ctx.loading) return;
    st.scrolled[key] = 1;
    /* הפתיחה הראשונה: היום — שעה לפני עכשיו; יום אחר — שעה לפני הבלוק
       הראשון; ריק — 07:00. */
    var dates = weekDates(ctx.week), target = 7 * 60;
    var vis = wide() ? dates : [dates[st.day]];
    var firsts = bl.filter(function (t) { return vis.indexOf(t.slot.date) >= 0; })
                   .map(function (t) { return t.slot.start; });
    /* ⚠️ המוקדם מבין השניים: במחשב רואים את כל השבוע, וגלילה ל"עכשיו"
       הסתירה את בלוקי הבוקר של ימים אחרים. */
    var cands = firsts.map(function (m) { return m - 30; });
    if (vis.indexOf(todayDate()) >= 0 && nowMin() > D0()) cands.push(nowMin() - 60);
    if (cands.length) target = Math.min.apply(null, cands);
    sc.scrollTop = Math.max(0, (target - D0()) / 60 * H);
  }

  /* ==========================================================================
   *  מחוות
   * ========================================================================== */
  function minuteAt(col, clientY) {
    var sc = col.closest(".gw-scroll");
    var H = parseFloat(getComputedStyle(col.closest(".gw-grid")).getPropertyValue("--gw-h")) || 56;
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

  function wire(host, ctx) {
    Array.prototype.forEach.call(host.querySelectorAll("[data-gsday]"), function (b) {
      b.addEventListener("click", function () { setDay(+b.dataset.gsday); });
    });
    var todo = host.querySelector('[data-gs="todo"]');
    if (todo) todo.addEventListener("click", function () { flowFromList(ctx); });
    Array.prototype.forEach.call(host.querySelectorAll("[data-who]"), function (b) {
      b.addEventListener("click", function () {
        st.who = b.dataset.who; lsSet(WHO_KEY, st.who); render(host, ctx);
      });
    });
    var aib = host.querySelector('[data-gs="ai"]');
    if (aib) aib.addEventListener("click", function () { CBA.gardenScheduleAi.open(ctx, api()); });
    var ub = host.querySelector('[data-gs="undo"]');
    if (ub) ub.addEventListener("click", function () { undoAi(ctx); });
    var ux = host.querySelector('[data-gs="undo-x"]');
    if (ux) ux.addEventListener("click", function () { st.aiUndo = null; render(host, ctx); });

    Array.prototype.forEach.call(host.querySelectorAll(".gw-blk[data-gsid]"), function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); openBlock(ctx, b.dataset.gsid); });
    });

    var sc = host.querySelector(".gw-scroll");
    if (!sc) return;

    /* ---- לחיצה ארוכה (מגע) / לחיצה (עכבר) על שעה פנויה ----
       ⚠️ Pointer Events ולא touch: כשהדפדפן מתחיל לגלול הוא שולח
       pointercancel, וזה בדיוק הביטול שאנחנו צריכים — גלילה אינה שיבוץ. */
    var P = null;
    sc.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      /* החלקה שמתחילה על בלוק עדיין מחליפה יום — אבל לחיצה ארוכה עליו
         אינה שיבוץ (הקשה עליו פותחת את הבלוק, דרך מאזין ה-click שלו). */
      var onBlk = !!e.target.closest(".gw-blk");
      var col = onBlk ? null : e.target.closest(".gw-col");
      P = { x: e.clientX, y: e.clientY, col: col, type: e.pointerType, t0: Date.now(), fired: false };
      if (!col || e.pointerType === "mouse") return;
      var m = minuteAt(col, e.clientY);
      if (!isFree(ctx, col.dataset.date, m, 15, null, viewWho())) return;
      P.m = m;
      ghost(col, m, "is-press");
      P.timer = setTimeout(function () {
        if (!P) return;
        P.fired = true;
        unghost(host);
        if (navigator.vibrate) { try { navigator.vibrate(10); } catch (x) {} }
        flowFromSlot(ctx, col.dataset.date, m);
      }, LONG_MS);
    });
    sc.addEventListener("pointermove", function (e) {
      if (P && P.timer && (Math.abs(e.clientX - P.x) > MOVE_TOL || Math.abs(e.clientY - P.y) > MOVE_TOL)) {
        clearTimeout(P.timer); P.timer = null; unghost(host);
      }
      /* רחף בעכבר: "+ 08:30" במקום שבו לחיצה תשבץ. */
      if (e.pointerType === "mouse" && !e.buttons) {
        var col = e.target.closest(".gw-col");
        if (!col || e.target.closest(".gw-blk")) return unghost(host);
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
      /* החלקה אופקית במובייל = יום אחר. ב-RTL היום הבא יושב משמאל,
         ולכן אצבע שנעה ימינה "מושכת" אותו פנימה. */
      if (p.type !== "mouse" && !wide() && Math.abs(dx) > 60 && Math.abs(dx) > 1.6 * Math.abs(dy)) {
        return setDay(st.day + (dx > 0 ? 1 : -1));
      }
      if (Math.abs(dx) > MOVE_TOL || Math.abs(dy) > MOVE_TOL || !p.col) return;
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
      if (st.ctx) st.scroll[st.ctx.week + (wide() ? "w" : st.day)] = sc.scrollTop;
    }, { passive: true });
  }

  function setDay(i) {
    if (i < 0 || i > 5 || i === st.day) return;
    st.day = i;
    if (st.host && st.ctx) render(st.host, st.ctx);
  }

  /* שינוי רוחב (סיבוב מסך, חלון שהוקטן) — ציור מחדש כשחוצים את הסף,
     ותיקון הגובה בכל שינוי. */
  var mq = window.matchMedia ? window.matchMedia(WIDE_Q) : null;
  function onMq() { if (st.host && st.host.isConnected && st.ctx) render(st.host, st.ctx); }
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

  /* ---- שלב: יום ---- */
  function stepDay(ctx, F, t, dots, onPick) {
    var dates = weekDates(ctx.week), today = todayDate(), who = defaultWho(ctx, t);
    F.push({
      title: "באיזה יום?", sub: t.title || t.category, dots: dots,
      html: '<div class="gw-list">' + dates.map(function (d, i) {
        var fm = freeMinutes(ctx, d, t.id, who), starts = freeStarts(ctx, d, t.id, who).length;
        var n = blocks(ctx).filter(function (x) { return x.slot.date === d && String(x.id) !== String(t.id) && whoOverlap(who, whoOf(x)); }).length;
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
  function stepTime(ctx, F, t, date, dots, onPick) {
    var fs = freeStarts(ctx, date, t.id, defaultWho(ctx, t));
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

  /* ---- שלב: משך + מי (אחרון בכל מסלול) ---- */
  function stepDur(ctx, F, t, date, start, dots, cur, curWho, onPick) {
    var who = (curWho || defaultWho(ctx, t)).slice();
    function busyAt(k) { return !isFree(ctx, date, start, 15, t.id, [k]); }
    var dis = {}; crew().forEach(function (x) { if (busyAt(x.key)) dis[x.key] = 1; });
    who = who.filter(function (k) { return !dis[k]; });
    function maxNow() { return maxFrom(ctx, date, start, t.id, who); }
    function est() { return S().estimate ? S().estimate(t, ctx.rows, who) : null; }
    var e0 = est(), pick = cur || (e0 && e0.dur) || 60, wheel = null;
    F.push({
      title: crew().length ? "מי וכמה זמן?" : "כמה זמן?",
      sub: (t.title || t.category) + " · " + dayLabel(date, ctx.week) + " " + hhmm(start), dots: dots,
      html:
        crewChips(who, dis) +
        wheelHtml(range(maxNow())) +
        '<p class="gw-est" data-est></p>' +
        '<p class="gw-note" data-max></p>' +
        '<button type="button" class="gd-cta gw-wheel-ok" data-f="ok">שיבוץ</button>',
      mount: function (body) {
        var okb = body.querySelector("[data-f=ok]");
        function note() {
          var m = maxNow(), e = est();
          body.querySelector("[data-max]").textContent = m < D1() - start
            ? "פנוי עד " + hhmm(start + m) + " — אחרי זה כבר יש משימה" + (who.length ? " לאותם עובדים" : "") + "."
            : "פנוי עד סוף היום (" + hhmm(D1()) + ").";
          body.querySelector("[data-est]").innerHTML = e ? SPARK + 'הערכה: <b>' + durText(e.dur) + '</b> · ' + esc(S().estimateText(e)) : "";
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

  /* ---- 👷 עובדים של בלוק קיים ---- */
  function stepWho(ctx, F, t, onPick) {
    var s = t.slot, who = whoOf(t).slice(), dis = {};
    crew().forEach(function (x) { if (!isFree(ctx, s.date, s.start, s.dur, t.id, [x.key])) dis[x.key] = 1; });
    F.push({
      title: "מי עושה?", sub: (t.title || t.category) + " · " + slotText(s, ctx.week),
      html: crewChips(who, dis) +
        (Object.keys(dis).length ? '<p class="gw-note">מי שמסומן כתפוס כבר משובץ למשימה אחרת בשעות האלה.</p>' : '') +
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
  function stepActual(ctx, F, t, onDone) {
    var planned = t.slot.dur, pick = planned;
    var vals = []; for (var m = 15; m <= 8 * 60; m += 15) vals.push(m);
    if (vals.indexOf(planned) < 0) vals.push(planned), vals.sort(function (a, b) { return a - b; });
    F.push({
      title: "כמה זמן זה לקח?", sub: (t.title || t.category) + " · תוכנן " + durText(planned),
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
    var r = ctx.rows || [];
    for (var i = 0; i < r.length; i++) if (String(r[i].id) === String(id)) return r[i];
    return null;
  }

  /* ==========================================================================
   *  שמירה — אופטימית, עם החזרה במקרה כשל
   * ========================================================================== */
  function save(ctx, t, slot, F, msg) {
    if (!t) return;
    var prev = t.slot || null;
    t.slot = slot;
    if (F) F.close();
    lsSet(HINT_KEY, "1");
    if (slot) {
      st.flash = t.id;
      st.flashScroll = slot.start;
      var i = weekDates(ctx.week).indexOf(slot.date);
      if (i >= 0) st.day = i;
    }
    ctx.redraw();
    S().write(t.id, slot, function (r) {
      if (r && r.ok) { toast(msg || (slot ? "שובץ · " + slotText(slot, ctx.week) : "הוסר מהסידור")); return; }
      t.slot = prev;
      ctx.redraw();
      toast((r && r.error) || "השיבוץ לא נשמר", "error");
    });
  }

  /* שמירה של כמה שיבוצים יחד (הסידור החכם). כל אחד נכתב לבד — מסמך לכל
     משימה, כמו בכל מקום אחר — ומה שנכשל חוזר אחורה **לבד**, בלי לבטל את
     מה שהצליח. התוצאה: "שובצו 6 מתוך 7" ולא הכול-או-כלום. */
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
  function undoAi(ctx) {
    var u = st.aiUndo; if (!u) return;
    st.aiUndo = null;
    /* ⚠️ מחזירים רק מה שעדיין בדיוק כפי שהסידור החכם שם אותו. שיבוץ
       שהמשתמש הזיז בינתיים ידנית — נשאר; הביטול אינו דורס עבודה חדשה. */
    var items = u.items.filter(function (x) {
      var t = byId(ctx, x.id);
      return t && t.slot && x.slot && t.slot.date === x.slot.date && t.slot.start === x.slot.start && t.slot.dur === x.slot.dur;
    }).map(function (x) { return { id: x.id, slot: x.prev }; });
    saveMany(ctx, items, function (ok, bad) {
      toast(bad.length ? "בוטל חלקית — " + bad.length + " לא הוחזרו" : "הסידור החכם בוטל", bad.length ? "error" : undefined);
    });
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
        saveMany(ctx, items, function (ok, bad) {
          var applied = items.filter(function (it) { return !bad.some(function (b) { return b.id === it.id; }); });
          st.aiUndo = applied.length ? {
            week: ctx.week,
            items: applied.map(function (it) {
              var p = ok.filter(function (o) { return o.id === it.id; })[0];
              return { id: it.id, slot: it.slot, prev: p ? p.prev : null };
            })
          } : null;
          if (applied.length) {
            var d = weekDates(ctx.week).indexOf(applied[0].slot.date);
            if (d >= 0) st.day = d;
          }
          ctx.redraw();
          toast(bad.length ? "שובצו " + applied.length + " מתוך " + items.length + " — השאר לא נשמרו"
                           : "שובצו " + applied.length + " משימות", bad.length ? "error" : undefined);
        });
      }
    };
  }

  function slotOf(date, start, dur, who, base) {
    var o = { date: date, start: start, dur: dur };
    if (who && who.length) o.who = who;
    if (base && base.act != null) o.act = base.act;
    return o;
  }

  /* ---- מסלול א׳: מהסידור (השעה ידועה) → משימה → מי וכמה זמן ---- */
  function flowFromSlot(ctx, date, start) {
    var F = Flow(ctx);
    stepTask(ctx, F, "מה לשבץ ב-" + hhmm(start) + "?",
      dayLabel(date, ctx.week) + " · משימות השבוע שעוד לא בסידור", [1, 0], function (t) {
        if (!t) return;
        stepDur(ctx, F, t, date, start, [1, 1], null, null, function (m, who) {
          save(ctx, t, slotOf(date, start, m, who), F);
        });
      });
  }

  /* ---- מסלול ב׳: מהמשימה → יום → שעה → מי וכמה זמן ---- */
  function flowPlace(ctx, t, F, lead) {
    F = F || Flow(ctx);
    var pre = lead ? [1] : [];
    stepDay(ctx, F, t, pre.concat([1, 0, 0]), function (date) {
      stepTime(ctx, F, t, date, pre.concat([1, 1, 0]), function (start) {
        stepDur(ctx, F, t, date, start, pre.concat([1, 1, 1]), t.slot && t.slot.dur, t.slot && t.slot.who, function (m, who) {
          save(ctx, t, slotOf(date, start, m, who), F);
        });
      });
    });
  }

  /* ---- מהשורה "N לא בסידור": משימה → יום → שעה → מי וכמה זמן ---- */
  function flowFromList(ctx) {
    var F = Flow(ctx);
    stepTask(ctx, F, "מה לשבץ?", "משימות השבוע שעוד לא בסידור", [1, 0, 0, 0], function (t) {
      if (t) flowPlace(ctx, t, F, true);
    });
  }

  /* ---- לחיצה על בלוק ---- */
  function openBlock(ctx, id) {
    var t = byId(ctx, id);
    if (!t || !t.slot) return;
    /* משימה סגורה אינה ניתנת להזזה (גם הכלל דוחה) — פותחים את הפרטים. */
    if (t.closure) return ctx.openDetails(t.id);
    var pri = null;
    (ctx.tiles(t) || []).forEach(function (x) { if (x[3] === "pri" && x[0] !== "plan") pri = x; });
    var hasCrew = crew().length > 0;
    var F = Flow(ctx);
    F.push({
      title: t.title || t.category || "משימה",
      sub: [t.area, slotText(t.slot, ctx.week) + whoText(whoOf(t))].filter(Boolean).join(" · "),
      html: '<div class="gw-acts">' +
        (pri ? '<button type="button" class="gw-act is-pri" data-f="pri">' + ctx.ico(pri[1]) +
               esc(String(pri[2]).replace(/\u200B/g, "")) + '</button>' : '') +
        (t.flag === "ממתין לאישור" ? '<div class="gw-wait">' + ctx.ico("clock") + (ctx.isManager ? "בוצע · ממתין לאישורך" : "בוצע · ממתין לאישור המנהל") + '</div>' : '') +
        '<button type="button" class="gw-act" data-f="dur">' + ctx.ico("clock") + 'שינוי משך</button>' +
        '<button type="button" class="gw-act" data-f="move">' + ctx.ico("cal") + 'הזזה</button>' +
        (hasCrew ? '<button type="button" class="gw-act is-wide" data-f="who">' + ctx.ico("team") + 'מי עושה' +
          '<small>' + esc(whoText(whoOf(t)).replace(/^ · /, "") || "לא שובץ עובד") + '</small></button>' : '') +
        '<button type="button" class="gw-act is-wide" data-f="info">' + ctx.ico("note") + 'פרטי המשימה</button>' +
        '<button type="button" class="gw-act is-wide is-dng" data-f="rm">' + ctx.ico("x") + 'הסרה מהסידור' +
          '<small>המשימה נשארת פתוחה ובאותו שבוע</small></button>' +
      '</div>',
      on: {
        pri: function () {
          /* ⏱ "בוצע" של הגנן — קודם כמה זמן זה לקח (לחיצה אחת "כמתוכנן"),
             ורק אז הסימון עצמו, אותה פונקציה בדיוק כמו מהכרטיס. */
          if (pri[0] !== "markdone") { F.close(); return ctx.tile(t.id, pri[0]); }
          stepActual(ctx, F, t, function (act) {
            F.close();
            if (act == null) return ctx.tile(t.id, pri[0]);
            var s = slotOf(t.slot.date, t.slot.start, t.slot.dur, whoOf(t));
            s.act = act;
            t.slot = s;
            S().write(t.id, s, function () { ctx.tile(t.id, pri[0]); });
          });
        },
        info: function () { F.close(); ctx.openDetails(t.id); },
        rm: function () { save(ctx, t, null, F, "הוסר מהסידור — חזר לרשימת \"לא בסידור\""); },
        dur: function () {
          stepDur(ctx, F, t, t.slot.date, t.slot.start, null, t.slot.dur, whoOf(t), function (m, who) {
            save(ctx, t, slotOf(t.slot.date, t.slot.start, m, who, t.slot), F, "עודכן · " + durText(m) + whoText(who));
          });
        },
        who: function () {
          stepWho(ctx, F, t, function (who) {
            save(ctx, t, slotOf(t.slot.date, t.slot.start, t.slot.dur, who, t.slot), F,
                 who.length ? "שובץ ל" + whoText(who).replace(/^ · /, "") : "הוסרו העובדים מהבלוק");
          });
        },
        move: function () { flowPlace(ctx, t, F, false); }
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
    /** שורת המטא בכרטיס: "ד׳ 08:00" כשהמשימה בסידור של השבוע המוצג. */
    chip: function (t, week) {
      if (!shown(t, week)) return "";
      var i = weekDates(week).indexOf(t.slot.date);
      return DAYS1[i] + " " + hhmm(t.slot.start) + whoText(whoOf(t));
    },
    /* לבדיקות בלבד */
    _t: { layout: layout, candidates: candidates, shown: shown, unscheduled: unscheduled,
          maxFrom: maxFrom, freeStarts: freeStarts, durText: durText, weekDates: weekDates, api: api }
  };
})();
