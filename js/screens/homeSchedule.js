/* homeSchedule.js — כרטיס הלו"ז של עמוד הבית (2026-09-23)
   ============================================================================
   מה יש כאן: הכרטיס שמראה "מה קורה בשיכון" בעמוד הבית, מתוך אותו לוח
   אירועים של המסך "לוח אירועים" (Google Calendar דרך eventsList), ועוד
   השריונים של המשפחה עצמה (מהמסמך המהיר ב-Firestore שעמוד הבית כבר קורא).

   שלוש צורות, לפי מי שנכנס ולפי רוחב המסך (הסקיצה שאושרה, 23.9):
     • "grid"  — תושב, מחשב: שבועיים בגריד 7×2 + שורת "בהמשך".
     • "list"  — בעל תפקיד, מחשב: רשימת 10 הימים הקרובים (הגינון לוקח את
                 שאר המקום).
     • במובייל (עד 720px) שתיהן מתכווצות: פס 7 ימים + 3 שורות (תושב),
                 או 2 שורות בלבד (בעל תפקיד). ההחלפה ב-CSS בלבד — שתי
                 הצורות נבנות יחד, כדי שסיבוב טלפון לא ידרוש ציור מחדש.

   🔴 גודל קבוע (בקשת יועד, 23.9: "להתקבע על גודל קבוע של לוח שנה שמתאים
      לכמות ממוצעת של אירועים"). תא ביום לא גדל לפי התוכן: **שני אירועים
      לכל היותר**, ומעבר לזה שורת "+N נוספים". נמדד חי ב-23.9: 33 אירועים
      ב-2026 בשלושת היומנים שכבר מחוברים, לעולם לא יותר מאחד ביום ולא יותר
      משניים בשבוע. יומן החגים (אחרי פריסת התיקון ב-Code.gs) מוסיף בערך
      אחד ביום-חג, ולכן היום העמוס הרגיל הוא "ערב חג + חופש בגנים" = שניים.
      ימי הולדת, כשיגיעו, הם שיגרמו ל"+N" — וזה בדיוק המקום הנכון לזה.
      משנים את המספר ב-MAX_CHIPS בלבד; גובה התא ב-CSS נגזר ממנו
      (--hm-day-h ב-homeSchedule.css) — לשנות את שניהם יחד.

   ⚠️ eventsList הוא קריאת Apps Script (~5 שניות, נמדד חי). עמוד הבית לא
      מחכה לה: הכרטיס מצייר שלד, ושאר העמוד ממשיך. ואחרי הפעם הראשונה —
      המטמון (זיכרון + localStorage, 15 דקות טריות) מצייר מיד, והרענון
      יוצא ברקע. **ימי הולדת לעולם לא נכתבים ל-localStorage** — הם שמות של
      תושבים, ומדיניות צמצום הנתונים אוסרת להשאיר אותם על מכשיר.
   ========================================================================== */
window.CBA = window.CBA || {};

CBA.homeSchedule = (function () {
  "use strict";

  var DAY = 86400000;
  var MAX_CHIPS = 2;          // ר' ההערה בראש הקובץ — ויחד עם --hm-day-h
  var LIST_DAYS = 10;         // "10 הימים הקרובים" אצל בעל תפקיד
  var LIST_ROWS = 5;          // גובה קבוע לרשימה: לכל היותר 5 שורות-יום (כולל היום)
  var COMPACT_ROWS = 3;       // מובייל, תושב
  var LATER_N = 3;            // "בהמשך" — שלושה אחרי השבועיים
  /* 28.9 (בקשת יועד): "הבא בקהילה" בלי מגבלת זמן — גם אם הוא בעוד
     חצי שנה. במקום החלון של 60 יום: עד FEAT_MAX שורות — קודם כל אירוע
     שפתוח לאישור הגעה, ואחריו אירוע הקהילה/תרבות הבא. */
  var FEAT_MAX = 3;
  /* אחרי זה — מציירים מהמטמון ומרעננים ברקע. שתי דקות (היה 15) מאז שהלוח
     נקרא מ-Firestore: קריאה של מסמך אחד, ~100ms, במקום ~5 שניות של Apps Script. */
  var TTL = 2 * 60 * 1000;
  var LS_KEY = "cba_home_events_v1";
  var LS_MAX_AGE = 7 * DAY;   // מטמון ישן מזה לא מוצג בכלל
  var RSVP_TTL = 5 * 60 * 1000;

  var CAT = {
    community: { he: "קהילה",       k: "com" },
    culture:   { he: "תרבות",       k: "cul" },
    holidays:  { he: "חגי ישראל",   k: "hol" },
    breaks:    { he: "גנים",        k: "kg"  },
    afterschool: { he: "צהרון",      k: "as"  },   // 28.9 — גוון בהיר של צבע הגנים
    birthdays: { he: "ימי הולדת",   k: "bd"  },
    personal:  { he: "שלי",         k: "per" }
  };
  /* סדר בתוך יום: מה שלי ומה שדורש החלטה (להגיע?) קודם; ימי הולדת אחרונים,
     כי הם אלה שיתמלאו ויידחקו ל-"+N". */
  var RANK = { personal: 0, community: 1, culture: 2, holidays: 3, breaks: 4, afterschool: 5, birthdays: 6 };
  var LEGEND = ["community", "culture", "holidays", "breaks", "afterschool", "personal"];
  var TIMED = { community: 1, culture: 1, personal: 1 };   // רק לאלה שעה מעניינת
  var WD_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  var WD_LONG = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  var WD_LETTER = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
  var MON_SHORT = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
                   "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];

  function esc(s) {
    return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function dkey(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function fromKey(k) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(k || ""));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function hm(d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function dm(d) { return d.getDate() + "." + (d.getMonth() + 1); }
  function svg(d, n) {
    return '<svg viewBox="0 0 24 24" width="' + (n || 16) + '" height="' + (n || 16) + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  }
  var ICO = {
    chev:  '<path d="m14 6-6 6 6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    cal:   '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v5M9.5 15.5h5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin:   '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    bell:  '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    down:  '<path d="m6 9 6 6 6-6"/>'
  };

  /* ================================================================ נתונים */
  /* ---- אירועי הקהילה: זיכרון → localStorage → רשת ---- */
  var mem = {};        // שנה -> { list, ts }
  var inflight = {};   // שנה -> [callbacks]

  function lsRead() {
    try {
      var o = JSON.parse(window.localStorage.getItem(LS_KEY) || "null");
      return (o && o.v === 1 && o.years) ? o : null;
    } catch (e) { return null; }
  }
  function lsWrite(year, list, ts) {
    try {
      var o = lsRead() || { v: 1, years: {} };
      o.years[year] = { ts: ts, list: (list || []).filter(function (e) {
        return e && e.category !== "birthdays";          // 🔴 לעולם לא לדיסק
      }).map(function (e) {
        return { id: e.id, title: e.title, date: e.date, allDay: !!e.allDay,
                 category: e.category, location: e.location || "" };
      }) };
      Object.keys(o.years).forEach(function (y) { if (Math.abs(+y - year) > 1) delete o.years[y]; });
      window.localStorage.setItem(LS_KEY, JSON.stringify(o));
    } catch (e) { /* מטמון הוא נוחות — מכשיר בלי אחסון פשוט טוען מהרשת */ }
  }
  function cachedYear(year) {
    if (mem[year]) return mem[year];
    var o = lsRead(), y = o && o.years[year];
    if (y && Array.isArray(y.list) && (Date.now() - y.ts) < LS_MAX_AGE) {
      mem[year] = { list: y.list, ts: y.ts };
      return mem[year];
    }
    return null;
  }
  function fetchYear(year, cb) {
    if (inflight[year]) { inflight[year].push(cb); return; }
    inflight[year] = [cb];
    function done(res) {
      var cbs = inflight[year] || [];
      delete inflight[year];
      if (res && res.ok && Array.isArray(res.events)) {
        var ts = Date.now();
        mem[year] = { list: res.events, ts: ts };
        lsWrite(year, res.events, ts);
      }
      cbs.forEach(function (f) { try { f(res); } catch (e) { /* כרטיס שנעלם */ } });
    }
    /* Firestore קודם (eventsCal/{year}), ונפילה שקטה ל-Apps Script — ר' getEventsFast. */
    var get = CBA.data && (CBA.data.getEventsFast || CBA.data.getEventsList);
    if (!get) { done({ ok: false, error: "מנוע הנתונים לא נטען" }); return; }
    try { get(year, done); } catch (e) { done({ ok: false, error: String(e) }); }
  }
  /* אילו שנים צריך: השנה, ובשוליים גם השכנה — שבוע שמתחיל בדצמבר, או
     "בהמשך" / "הבא בקהילה" שכבר בשנה הבאה. */
  function neededYears(today) {
    var ys = [today.getFullYear()];
    var from = addDays(today, -today.getDay());
    if (from.getFullYear() < ys[0]) ys.unshift(from.getFullYear());
    if (addDays(today, 90).getFullYear() > today.getFullYear()) ys.push(today.getFullYear() + 1);
    return ys;
  }

  function normalize(raw) {
    var out = [];
    (raw || []).forEach(function (e) {
      if (!e) return;
      var d = new Date(e.date);
      if (isNaN(d.getTime())) return;
      var cat = CAT[e.category] ? e.category : "community";
      var ev = { id: String(e.id || ""), title: String(e.title || ""), date: d, allDay: !!e.allDay,
                 end: e.end ? String(e.end) : "",   // 28.9 — אירוע של כמה ימים
                 cat: cat, category: cat, location: String(e.location || ""), description: String(e.description || "") };
      out.push(ev);
    });
    /* 28.9 — "סוכות (יום 1..7)" ואירוע רב-יומי ⇒ אירוע אחד עם lastDay (אותה
       פונקציה של לוח האירועים). אם events.js לא נטען — כל יום בנפרד, כמו קודם. */
    var sp = window.CBA && CBA.eventSpans;
    if (sp) {
      out.forEach(function (ev) { ev.lastDay = sp.computeLastDay(ev.date, ev.end ? new Date(ev.end) : null); });
      out = sp.mergeSeries(out);
      out.forEach(function (ev) { ev.cat = ev.category; });
    }
    return out;
  }

  /* ---- "אישור הגעה" פתוח? — אותה שאילתה של מסך האירועים (Firestore) ---- */
  var rsvp = { ids: null, ts: 0, busy: false };
  function loadRsvp(cb) {
    if (rsvp.ids && (Date.now() - rsvp.ts) < RSVP_TTL) return cb();
    if (rsvp.busy) return cb();
    if (!(CBA.fb && CBA.fb.queryCollection)) { rsvp.failed = true; return cb(); }   /* גל 2 — "לא ידוע" ≠ "עוד בדרך" */
    rsvp.busy = true;
    try {
      CBA.fb.queryCollection("eventRSVP", [["enabled", true]], function (err, rows) {
        rsvp.busy = false;
        rsvp.failed = !!err || !rows;
        if (!err && rows) {
          rsvp.ids = {};
          rows.forEach(function (r) { if (r && r.id) rsvp.ids[r.id] = true; });
          rsvp.ts = Date.now();
        }
        cb();
      });
    } catch (e) { rsvp.busy = false; cb(); }
  }

  /* ================================================================ מצב */
  var st = {
    ev: null,          // אירועי הקהילה המנורמלים; null = עוד לא נטען
    err: "",
    personal: [],      // שריונים של המשפחה (מעמוד הבית)
    host: null,        // הכרטיס
    featHost: null,    // "הבא בקהילה" (תושב, מחשב) — ישן, לא בשימוש מ-29.9
    nextHost: null,    // 29.9 — שני הכרטיסים: אירוע הקהילה הבא ואירוע התרבות הבא
    mode: "grid",
    bound: null        // האלמנט שעליו רשומה ההאזנה (ראו mount)
  };

  function rebuild(today) {
    var ys = neededYears(today), all = [], have = true;
    ys.forEach(function (y) {
      var c = cachedYear(y);
      if (c) all = all.concat(c.list); else have = false;
    });
    return have ? normalize(all) : null;
  }

  function load() {
    var today = sod(new Date());
    var ys = neededYears(today);
    var fresh = rebuild(today);
    if (fresh) { st.ev = fresh; st.err = ""; }
    paint();
    var need = ys.filter(function (y) {
      var c = cachedYear(y);
      return !c || (Date.now() - c.ts) > TTL;
    });
    need.forEach(function (y) {
      fetchYear(y, function (res) {
        var next = rebuild(sod(new Date()));
        if (next) { st.ev = next; st.err = ""; }
        else if (!(res && res.ok) && !st.ev) {
          st.err = (res && res.error) || "לא הצלחנו לטעון את לוח האירועים.";
        }
        paint();
      });
    });
    loadRsvp(paint);
  }

  /* השריונים מגיעים מעמוד הבית (resvCache) — גם מהמסלול המהיר וגם מהקובע. */
  function setPersonal(list) {
    st.personal = (list || []).filter(function (r) {
      return r && r.start && r.status !== "declined" && r.status !== "rejected";
    }).map(function (r) {
      var d = new Date(r.start);
      return { id: "resv:" + (r.id || r.start), title: r.status === "pending" ? "שריון מועדון · ממתין" : "שריון מועדון",
               date: d, allDay: false, cat: "personal", location: "המועדון", description: "", personal: true };
    }).filter(function (e) { return !isNaN(e.date.getTime()); });
    paint();
  }

  function allEvents() { return (st.ev || []).concat(st.personal || []); }
  function lastDayOf(e) { return e.lastDay || sod(e.date); }
  function isMulti(e) { return lastDayOf(e).getTime() > sod(e.date).getTime(); }
  function isOngoing(e, t) { return isMulti(e) && sod(e.date) <= t && lastDayOf(e) >= t; }
  function rangeOf(e) {
    var sp = window.CBA && CBA.eventSpans;
    return sp ? sp.rangeLabel(e, true) : dm(e.date);
  }
  /* פס "עכשיו" (28.9) — כמו בלוח האירועים */
  function nowHTML(today) {
    var list = (st.ev || []).filter(function (e) { return isOngoing(e, today); })
      .sort(function (a, b) { return lastDayOf(a) - lastDayOf(b); }).slice(0, 3);
    if (!list.length) return "";
    return '<div class="hm-now">' + list.map(function (e) {
      var total = Math.round((lastDayOf(e) - sod(e.date)) / DAY) + 1;
      var idx = Math.round((today - sod(e.date)) / DAY) + 1;
      var note = idx === 1 ? "מתחיל היום" : idx === total ? "יום אחרון" : "היום יום " + idx + " מתוך " + total;
      return '<button type="button" class="hm-now__i hm-ev--' + CAT[e.cat].k + '" data-hm-date="' + dkey(today) + '">' +
        '<span class="hm-now__row"><b dir="auto">' + esc(e.title) + '</b><span class="hm-now__n">' + note + '</span>' +
        '<span class="hm-now__r">עד <span dir="ltr">' + dm(lastDayOf(e)) + '</span></span></span>' +
        '<span class="hm-now__p"><i class="hm-dot--' + CAT[e.cat].k + '" style="width:' + Math.round(100 * idx / total) + '%"></i></span>' +
        '</button>';
    }).join("") + '</div>';
  }
  function byDay(list) {
    var m = {};
    /* 28.9 — אירוע של כמה ימים: רק ביום שבו הוא מתחיל. אם הוא כבר קורה
       היום — הוא בפס "עכשיו" (nowHTML) ולא ברשימת הימים בכלל. */
    var t0 = sod(new Date());
    list.forEach(function (e) {
      if (isOngoing(e, t0)) return;
      var k = dkey(e.date); (m[k] = m[k] || []).push(e);
    });
    Object.keys(m).forEach(function (k) {
      m[k].sort(function (a, b) {
        return (RANK[a.cat] - RANK[b.cat]) || (a.date - b.date) || a.title.localeCompare(b.title, "he");
      });
    });
    return m;
  }
  /* "הבא בקהילה" (28.9) — רשימה ולא אירוע אחד:
     1. כל אירוע עתידי שפתוח לאישור הגעה (בכל קטגוריה), לפי תאריך;
     2. אירוע הקהילה/תרבות הבא — בלי מגבלת זמן — אם עוד לא ברשימה.
     אם בשנה הנוכחית לא נשאר אירוע קהילה/תרבות, נמשכת השנה הבאה פעם אחת
     ברקע (loadNextYear) — עמוד הבית לא מחכה לה. */
  var nextYear = { y: 0, list: null, busy: false };
  function loadNextYear(y) {
    if (nextYear.y === y && (nextYear.list || nextYear.busy)) return;
    var c = cachedYear(y);
    if (c) { nextYear = { y: y, list: normalize(c.list), busy: false }; return; }
    nextYear = { y: y, list: null, busy: true };
    fetchYear(y, function () {
      var cc = cachedYear(y);
      nextYear = { y: y, list: cc ? normalize(cc.list) : [], busy: false };
      paint();
    });
  }
  function featured(today) {
    var t = today.getTime();
    var pool = (st.ev || []).slice();
    if (nextYear.list) pool = pool.concat(nextYear.list);
    var seen = {}, out = [];
    pool.filter(function (e) {
      return e.date.getTime() >= t && rsvp.ids && rsvp.ids[e.id];
    }).sort(function (a, b) { return a.date - b.date; }).forEach(function (e) {
      if (!seen[e.id] && out.length < FEAT_MAX) { seen[e.id] = 1; out.push(e); }
    });
    var com = pool.filter(function (e) {
      return (e.cat === "community" || e.cat === "culture") && e.date.getTime() >= t;
    }).sort(function (a, b) { return a.date - b.date; })[0];
    if (!com && st.ev) loadNextYear(today.getFullYear() + 1);
    if (com && !seen[com.id] && out.length < FEAT_MAX) out.push(com);
    return out.sort(function (a, b) { return a.date - b.date; });
  }
  function nextCommunity(today) { return featured(today)[0] || null; }
  function isOpen(e) { return !!(rsvp.ids && rsvp.ids[e.id]); }
  function findEvent(id) {
    var all = allEvents().concat(nextYear.list || []);
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  /* ==========================================================================
   *  29.9 — "הבא בקהילה" + "הבא בתרבות": שני כרטיסים קבועים בראש עמוד הבית
   * --------------------------------------------------------------------------
   *  תמיד: אירוע הקהילה הבא ואירוע התרבות הבא (בלי מגבלת זמן — גם בשנה
   *  הבאה). ועוד אירוע שפתוח לאישור הגעה, אם הוא לא אחד מהשניים.
   *  בכל כרטיס: התשובה שלי + כמה משפחות מגיעות (כשאישור ההגעה פתוח),
   *  ("תזכורת" לתושב ירדה בגל 2, 30.9 — ר' loadNext),
   *  ו"פרטים" שנפתחים במקום: תיאור, לו"ז, הזמנה, הוספה ליומן, שיתוף.
   * ========================================================================== */
  var nx = { data: {}, rem: null, ts: 0, busy: false, open: {}, menu: null };
  var NX_TTL = 60 * 1000;
  function myFam() {
    var u = (window.CBA && CBA.user) || {};
    return String(u.familyId || u.house || "").trim();
  }
  function nextEvents(today) {
    var t = today.getTime();
    var pool = (st.ev || []).slice();
    if (nextYear.list) pool = pool.concat(nextYear.list);
    function first(cat) {
      return pool.filter(function (e) { return e.cat === cat && sod(e.date).getTime() >= t; })
        .sort(function (a, b) { return a.date - b.date; })[0] || null;
    }
    var com = first("community"), cul = first("culture");
    if ((!com || !cul) && st.ev) loadNextYear(today.getFullYear() + 1);
    var out = [{ role: "com", ev: com }, { role: "cul", ev: cul }];
    pool.filter(function (e) { return sod(e.date).getTime() >= t && isOpen(e) && e !== com && e !== cul; })
      .sort(function (a, b) { return a.date - b.date; }).slice(0, 1)
      .forEach(function (e) { out.push({ role: "open", ev: e }); });
    return out;
  }
  /* נתונים לכל כרטיס — ברקע, ואז ציור חוזר של הכרטיסים בלבד */
  function loadNext(list, force) {
    if (!window.CBA || !CBA.fb || !CBA.fb.readDoc) return;
    var fam = myFam(), evs = list.filter(function (x) { return x.ev; }).map(function (x) { return x.ev; });
    /* אישור הגעה נפתח/נטען אחרי הקריאה הקודמת — לא מחכים לתום הדקה */
    var stale = evs.some(function (e) { var d = nx.data[e.id]; return !d || (isOpen(e) && d.families === undefined); });
    if (nx.busy || (!force && !stale && Date.now() - nx.ts < NX_TTL)) return;
    nx.busy = true;
    /* 🔴 גל 2 (30.9.26) — "תזכורת" לתושב ירדה (יועד: "זו טעות — הכוונה הייתה
       שמנהל יוסיף תזכורות מתוזמנות לכולם", וזה כבר קיים: "הודעות ותזכורות"
       בחלון האירוע של המנהל במסך האירועים). לכן אין כאן יותר eventReminders. */
    var left = evs.length * 3;
    if (!left) { nx.busy = false; nx.ts = Date.now(); paint(); return; }
    function done() { if (--left > 0) return; nx.busy = false; nx.ts = Date.now(); paint(); }
    evs.forEach(function (e) {
      var d = nx.data[e.id] = nx.data[e.id] || {};
      CBA.fb.readDoc("eventInfo", e.id, function (err, doc) { if (!err) d.info = doc || null; done(); });
      if (isOpen(e) && CBA.fb.queryCollection) {
        CBA.fb.queryCollection("eventRSVPResponses", [["eventId", e.id]], function (err, rows) {
          if (!err) {
            var att = (rows || []).filter(function (r) { return r.status === "attending"; });
            d.families = att.length;
            d.att = att.map(function (r) { return String(r.familyId || ""); }).filter(Boolean);   /* גל 2 — פנים */
            d.mine = null;
            (rows || []).forEach(function (r) { if (fam && String(r.familyId) === fam) d.mine = r; });
          } else d.families = null;   // כשל — לא מנסים שוב בכל ציור (רק אחרי דקה)
          done(); done();
        });
      } else { done(); done(); }
    });
  }
  var NX_HEAD = { com: "אירוע הקהילה הבא", cul: "אירוע התרבות הבא", open: "פתוח לאישור הגעה" };

  function nextCardHTML(x) {
    var e = x.ev;
    if (!e) {
      return '<article class="hm-nx hm-nx--' + x.role + ' is-empty"><div class="hm-nx__k"><i class="hm-dot hm-dot--' +
        (x.role === "cul" ? "cul" : "com") + '"></i>' + NX_HEAD[x.role] + '</div>' +
        '<p class="hm-nx__none">עוד לא נקבע. כשיתווסף ללוח — הוא יופיע כאן.</p></article>';
    }
    var k = CAT[e.cat].k, d = nx.data[e.id] || {}, open = isOpen(e);
    var meta = [WD_LONG[e.date.getDay()]];
    if (!e.allDay) meta.push(hm(e.date));
    if (e.location) meta.push(esc(e.location));
    var status = "";
    if (open) {
      var mine = d.mine, fams = d.families;
      var cnt = (typeof fams === "number" && fams > 0) ? (fams === 1 ? "משפחה אחת מגיעה" : fams + " משפחות מגיעות") : "";
      if (cnt) cnt = facesHTML(d.att, 4) + cnt;   /* גל 2 (A3) — פנים לכולם, החלטת יועד */
      if (mine && mine.status === "attending") {
        var who = [];
        if (Number(mine.adults)) who.push(mine.adults + (Number(mine.adults) === 1 ? " מבוגר" : " מבוגרים"));
        if (Number(mine.children)) who.push(mine.children + (Number(mine.children) === 1 ? " ילד" : " ילדים"));
        status = '<div class="hm-nx__st is-yes">' + svg(ICO.check, 14) + 'אישרתם הגעה' + (who.length ? " · " + who.join(", ") : "") + (cnt ? " · " + cnt : "") + '</div>';
      } else if (mine) {
        status = '<div class="hm-nx__st is-no">לא מגיעים' + (cnt ? " · " + cnt : "") + '</div>';
      } else if (d.families !== undefined) {
        status = '<div class="hm-nx__st is-wait">' + svg(ICO.clock, 14) + 'עוד לא עניתם' + (cnt ? " · " + cnt : "") + '</div>';
      }
    }
    var remBtn = "", menu = "";   /* גל 2 — התזכורת לתושב ירדה, ר' loadNext */
    var rsvpBtn = open ? '<button type="button" class="hm-nx__b' + (d.mine ? "" : " is-primary") + '" data-hm-rsvp="' + esc(e.id) + '">' +
      (d.mine ? "שינוי תשובה" : svg(ICO.check, 14) + "אישור הגעה") + '</button>' : "";
    var isOpenMore = !!nx.open[e.id];
    var info = d.info || {};
    var cal = CBA.screens && CBA.screens.events && CBA.screens.events.calendarLinks;
    var gUrl = cal && cal.google ? cal.google(e) : "";
    var more = isOpenMore ? '<div class="hm-nx__more">' +
      (e.description ? '<p class="hm-nx__desc" dir="auto">' + esc(String(e.description).slice(0, 600)) + '</p>' : "") +
      (info.schedule ? '<div class="hm-nx__sch">' + String(info.schedule).split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 12).map(function (l) {
          var m = l.trim().match(/^(\d{1,2}[:.]\d{2})\s*[—–\-·:]?\s*(.*)$/);
          return '<b dir="ltr">' + (m ? esc(m[1].replace(".", ":")) : "") + '</b><span dir="auto">' + esc(m ? m[2] : l.trim()) + '</span>';
        }).join("") + '</div>' : "") +
      (!e.description && !info.schedule ? '<p class="hm-nx__desc is-muted">אין עוד פרטים לאירוע הזה.</p>' : "") +
      '<div class="hm-nx__acts">' +
        (info.hasImage ? '<button type="button" class="hm-nx__b" data-nx-inv="' + esc(e.id) + '">הזמנה</button>' : "") +
        (gUrl ? '<a class="hm-nx__b" href="' + esc(gUrl) + '" target="_blank" rel="noopener">Google</a>' : "") +
        '<button type="button" class="hm-nx__b" data-hm-apple="' + esc(e.id) + '">Apple</button>' +
        '<button type="button" class="hm-nx__b" data-nx-share="' + esc(e.id) + '">שיתוף</button>' +
      '</div></div>' : "";
    return '<article class="hm-nx hm-nx--' + x.role + '">' +
      '<div class="hm-nx__k"><i class="hm-dot hm-dot--' + k + '"></i>' + NX_HEAD[x.role] + '</div>' +
      '<button type="button" class="hm-nx__top" data-hm-date="' + dkey(e.date) + '">' +
        '<span class="hm-nx__date hm-ev--' + k + '"><small>' + MON_SHORT[e.date.getMonth()] + '</small><b>' + e.date.getDate() + '</b></span>' +
        '<span class="hm-nx__txt"><b dir="auto">' + esc(e.title) + '</b><span class="hm-nx__m">' + meta.join(" · ") + '</span></span>' +
      '</button>' + status +
      '<div class="hm-nx__acts">' + rsvpBtn + remBtn +
        '<button type="button" class="hm-nx__b is-ghost" data-nx-more="' + esc(e.id) + '">פרטים ' + svg(ICO.down, 13) + '</button>' +
      '</div>' + menu + more + '</article>';
  }
  function nextHTML() {
    if (!st.ev) return "";
    var list = nextEvents(sod(new Date()));
    loadNext(targets(), false);
    return list.map(nextCardHTML).join("");
  }
  function paintNext() {
    var n = st.nextHost;
    if (n && n.isConnected) n.innerHTML = nextHTML();
  }
  function openInvite(id) {
    var e = findEvent(id);
    if (!e || !CBA.ui || !CBA.ui.dialog) return;
    CBA.ui.dialog({ title: e.title, html: '<div class="ev-inv-dlg"><div class="ev-inv-dlg__img">טוען…</div></div>', okText: "סגירה",
      onMount: function (wrap) {
        var box = wrap.querySelector(".ev-inv-dlg__img");
        CBA.fb.readDoc("eventImages", id, function (err, d) {
          var src = (!err && d && typeof d.image === "string" && d.image.indexOf("data:image/") === 0) ? d.image : "";
          box.innerHTML = src ? '<img src="' + esc(src) + '" alt="ההזמנה לאירוע" style="max-width:100%;border-radius:12px">' : "ההזמנה לא נטענה. אפשר לנסות שוב בעוד רגע.";
        });
      } });
  }
  function shareEv(id) {
    var e = findEvent(id); if (!e) return;
    var url = window.location.origin + window.location.pathname + "#event=" + encodeURIComponent(e.id);
    var text = e.title + " · " + dm(e.date);
    if (navigator.share) { navigator.share({ title: e.title, text: text, url: url }).catch(function () {}); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function () { if (CBA.ui && CBA.ui.toast) CBA.ui.toast("הקישור לאירוע הועתק", "ok"); });
    }
  }
  /* אחרי דיאלוג "אישור הגעה" — מרעננים את הכרטיס כשהוא נסגר */
  function watchDialogThenRefresh() {
    var n = 0, t = setInterval(function () {
      if (++n > 600 || !document.body.classList.contains("has-cba-dlg")) {
        clearInterval(t); loadNext(targets(), true);
      }
    }, 800);
  }

  /* ================================================================ HTML */
  function chip(e) {
    var k = CAT[e.cat].k;
    var tm = (!e.allDay && TIMED[e.cat]) ? '<span class="hm-ev__tm">' + hm(e.date) + '</span>' : "";
    return '<span class="hm-ev hm-ev--' + k + '" title="' + esc(e.title) + '">' +
      '<i class="hm-dot hm-dot--' + k + '"></i>' +
      '<span class="hm-ev__t" dir="auto">' + esc(e.title) + '</span>' + tm + '</span>';
  }
  function moreHTML(n) {
    return n > 0 ? '<span class="hm-day__more">' + (n === 1 ? "+1 נוסף" : "+" + n + " נוספים") + '</span>' : "";
  }

  function legendHTML(list) {
    var cats = LEGEND.slice();
    if (list.some(function (e) { return e.cat === "birthdays"; })) cats.splice(4, 0, "birthdays");
    return '<div class="hm-legend" aria-hidden="true">' + cats.map(function (c) {
      return '<span class="hm-legend__i"><i class="hm-dot hm-dot--' + CAT[c].k + '"></i>' + CAT[c].he + '</span>';
    }).join("") + '</div>';
  }

  function gridHTML(today, days) {
    var start = addDays(today, -today.getDay());
    var head = '<div class="hm-cal__wd" aria-hidden="true">' +
      WD_LONG.map(function (w) { return '<span>' + w + '</span>'; }).join("") + '</div>';
    var cells = "";
    for (var i = 0; i < 14; i++) {
      var d = addDays(start, i), k = dkey(d);
      var list = days[k] || [];
      var isToday = d.getTime() === today.getTime(), past = d < today;
      var tag = isToday ? '<span class="hm-day__tag">היום</span>'
        : ((i === 0 || d.getDate() === 1) ? '<span class="hm-day__mo">' + MON_SHORT[d.getMonth()] + '</span>' : "");
      var body = list.slice(0, MAX_CHIPS).map(chip).join("") + moreHTML(list.length - MAX_CHIPS);
      if (!list.length && isToday) body = '<span class="hm-day__none">אין אירועים היום</span>';
      var label = WD_LONG[d.getDay()] + " " + d.getDate() + "." + (d.getMonth() + 1) +
        (list.length ? " — " + list.map(function (e) { return e.title; }).join(", ") : " — אין אירועים");
      cells += '<button type="button" class="hm-day' + (past ? " is-past" : "") + (isToday ? " is-today" : "") +
        '" data-hm-date="' + k + '" aria-label="' + esc(label) + '">' +
        '<span class="hm-day__h"><b>' + d.getDate() + '</b>' + tag + '</span>' + body + '</button>';
    }
    return head + '<div class="hm-cal">' + cells + '</div>';
  }

  function laterHTML(today) {
    var from = addDays(today, 14 - today.getDay());
    var later = (st.ev || []).filter(function (e) {
      return e.date >= from && (e.cat === "community" || e.cat === "culture" || e.cat === "breaks" || e.cat === "afterschool");
    }).sort(function (a, b) { return a.date - b.date; }).slice(0, LATER_N);
    if (!later.length) return "";
    return '<div class="hm-later"><span class="hm-later__k">בהמשך</span><div class="hm-later__row">' +
      later.map(function (e) {
        return '<button type="button" class="hm-later__i" data-hm-date="' + dkey(e.date) + '">' +
          '<span class="hm-later__d">' + WD_SHORT[e.date.getDay()] + ' <b>' + dm(e.date) + '</b></span>' +
          '<i class="hm-dot hm-dot--' + CAT[e.cat].k + '"></i>' +
          '<span class="hm-later__t" dir="auto">' + esc(e.title) + '</span></button>';
      }).join("") + '</div></div>';
  }

  /* שורת-יום ברשימה (בעל תפקיד, ובמובייל של תושב) */
  function agendaRow(d, list, cls, today) {
    var isToday = d.getTime() === today.getTime();
    var items = list.slice(0, MAX_CHIPS).map(function (e) {
      var k = CAT[e.cat].k;
      var meta = [];
      if (!e.allDay && TIMED[e.cat]) meta.push(hm(e.date));
      if (isMulti(e)) meta.push('<span dir="ltr">' + rangeOf(e) + '</span>');
      if (e.location && e.cat !== "personal") meta.push(esc(e.location));
      return '<span class="hm-ag__i"><i class="hm-dot hm-dot--' + k + '"></i>' +
        '<span class="hm-ag__t" dir="auto">' + esc(e.title) + '</span>' +
        (meta.length ? '<span class="hm-ag__m">' + meta.join(" · ") + '</span>' : "") + '</span>';
    }).join("");
    if (list.length > MAX_CHIPS) items += moreHTML(list.length - MAX_CHIPS);
    if (!list.length) items = '<span class="hm-ag__i is-muted">אין אירועים היום</span>';
    return '<button type="button" class="hm-ag__d' + (isToday ? " is-today" : "") + (cls ? " " + cls : "") +
      '" data-hm-date="' + dkey(d) + '">' +
      '<span class="hm-ag__w"><small>' + (isToday ? "היום" : WD_SHORT[d.getDay()]) + '</small><b>' + dm(d) + '</b></span>' +
      '<span class="hm-ag__l">' + items + '</span></button>';
  }

  /* "הבא בקהילה" כשורה (רשימה/מובייל) — div ולא button, כי יש בו כפתור */
  function featRowHTML(f) {
    var k = CAT[f.cat].k;
    var meta = [WD_LONG[f.date.getDay()]];
    if (!f.allDay) meta.push(hm(f.date));
    if (f.location) meta.push(esc(f.location));
    var open = !!(rsvp.ids && rsvp.ids[f.id]);
    return '<div class="hm-ag__d hm-ag__d--feat">' +
      '<button type="button" class="hm-ag__open" data-hm-date="' + dkey(f.date) + '">' +
        '<span class="hm-ag__w"><small>' + WD_SHORT[f.date.getDay()] + '</small><b>' + dm(f.date) + '</b></span>' +
        '<span class="hm-ag__l"><span class="hm-ag__k">' + (open ? "פתוח לאישור הגעה" : "הבא בקהילה") + '</span>' +
          '<span class="hm-ag__i"><i class="hm-dot hm-dot--' + k + '"></i><span class="hm-ag__t" dir="auto">' + esc(f.title) + '</span></span>' +
          '<span class="hm-ag__m">' + meta.join(" · ") + '</span></span></button>' +
      (open ? '<button type="button" class="hm-rsvp-sm" data-hm-rsvp="' + esc(f.id) + '">' + svg(ICO.check, 13) + 'אישור הגעה</button>' : "") +
      '</div>';
  }

  function listHTML(today, days, rows, feat, compact) {
    var out = [agendaRow(today, days[dkey(today)] || [], (days[dkey(today)] || []).length ? "" : "is-empty-today", today)];
    var shown = 0, seen = [];
    feat = feat || [];
    function mark(list) { feat.forEach(function (f) { if (list.indexOf(f) !== -1) seen.push(f); }); }
    mark(days[dkey(today)] || []);
    for (var i = 1; i < LIST_DAYS && out.length < rows; i++) {
      var d = addDays(today, i), list = days[dkey(d)] || [];
      if (!list.length) continue;
      mark(list);
      out.push(agendaRow(d, list, (shown >= 2 ? "is-extra" : ""), today));
      shown++;
    }
    if (!compact) feat.forEach(function (f) { if (seen.indexOf(f) === -1) out.push(featRowHTML(f)); });
    return '<div class="hm-ag">' + out.join("") + '</div>';
  }

  /* מובייל של תושב: פס שבוע + 3 שורות + "הבא בקהילה" */
  function compactHTML(today, days, feat) {
    var start = addDays(today, -today.getDay());
    var strip = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i), list = days[dkey(d)] || [];
      var cats = [];
      list.forEach(function (e) { if (cats.indexOf(e.cat) === -1) cats.push(e.cat); });
      var isToday = d.getTime() === today.getTime();
      strip += '<button type="button" class="hm-sd' + (d < today ? " is-past" : "") + (isToday ? " is-today" : "") +
        '" data-hm-date="' + dkey(d) + '" aria-label="' + esc(WD_LONG[d.getDay()] + " " + dm(d) + (list.length ? " — " + list.length + " אירועים" : "")) + '">' +
        '<small>' + WD_LETTER[d.getDay()] + '</small><b>' + d.getDate() + '</b>' +
        '<span class="hm-sd__dots">' + cats.slice(0, 3).map(function (c) {
          return '<i class="hm-dot hm-dot--' + CAT[c].k + '"></i>';
        }).join("") + '</span></button>';
    }
    var rows = [], n = 0;
    for (var j = 0; j < 45 && n < COMPACT_ROWS; j++) {
      var dd = addDays(today, j), l = (days[dkey(dd)] || []).filter(function (e) { return (feat || []).indexOf(e) === -1; });
      if (!l.length) continue;
      rows.push(agendaRow(dd, l, "", today)); n++;
    }
    (feat || []).forEach(function (f) { rows.push(featRowHTML(f)); });
    if (!rows.length) rows.push('<p class="hm-sch__empty">אין אירועים בשבועות הקרובים.</p>');
    return '<div class="hm-strip">' + strip + '</div><div class="hm-ag">' + rows.join("") + '</div>';
  }

  function skeletonHTML(mode) {
    if (mode === "list") {
      return '<div class="hm-ag">' + [1, 2, 3, 4].map(function () {
        return '<div class="hm-ag__d is-skel"><span class="skeleton" style="width:44px;height:34px;border-radius:9px"></span>' +
          '<span class="skeleton" style="flex:1;height:14px;border-radius:7px"></span></div>';
      }).join("") + '</div>';
    }
    var cells = "";
    for (var i = 0; i < 14; i++) cells += '<div class="hm-day is-skel"><span class="skeleton" style="width:22px;height:14px;border-radius:6px"></span></div>';
    return '<div class="hm-sch__grid"><div class="hm-cal">' + cells + '</div></div>' +
      '<div class="hm-sch__compact"><div class="skeleton" style="height:58px;border-radius:12px;margin-bottom:10px"></div>' +
      '<div class="skeleton" style="height:14px;border-radius:7px;width:70%"></div></div>';
  }

  function headHTML(mode, list) {
    var grid = mode === "grid";
    return '<div class="hm-card__head hm-sch__head">' +
      '<h2 class="hm-card__t">' + (grid ? "הלו״ז שלנו" : "הלו״ז") + '</h2>' +
      '<span class="hm-card__sub hm-sch__sub">' + (grid ? "השבוע והשבוע הבא" : "10 הימים הקרובים") + '</span>' +
      (grid ? legendHTML(list) : "") +
      '<button type="button" class="hm-link" data-goto="events">ללוח המלא ' + svg(ICO.chev, 14) + '</button></div>';
  }

  function bodyHTML() {
    var today = sod(new Date());
    if (!st.ev && st.err) {
      return '<div class="hm-sch__err"><span>' + esc(st.err) + '</span>' +
        '<button type="button" class="hm-link" data-hm-retry>לנסות שוב</button></div>';
    }
    if (!st.ev) return skeletonHTML(st.mode);
    var all = allEvents(), days = byDay(all), feat = st.nextHost ? [] : featured(today), now = nowHTML(today);
    if (st.mode === "list") return now + listHTML(today, days, LIST_ROWS, feat, false);
    return now + '<div class="hm-sch__grid">' + gridHTML(today, days) + laterHTML(today) + '</div>' +
      '<div class="hm-sch__compact">' + compactHTML(today, days, feat) + '</div>';
  }

  /* כרטיס "הבא בקהילה" (תושב, מחשב) — פריט לכל אירוע ב-featured(). */
  function featCardHTML() {
    var list = st.ev ? featured(sod(new Date())) : [];
    if (!list.length) return "";
    return '<section class="card hm-card hm-feat">' + list.map(featItemHTML).join("") + '</section>';
  }
  function featItemHTML(f) {
    var mon = MON_SHORT[f.date.getMonth()];
    var meta = [WD_LONG[f.date.getDay()]];
    if (!f.allDay) meta.push(hm(f.date));
    var open = !!(rsvp.ids && rsvp.ids[f.id]);
    var cal = CBA.screens && CBA.screens.events && CBA.screens.events.calendarLinks;
    var gUrl = cal && cal.google ? cal.google(f) : "";
    return '<div class="hm-feat__item">' +
      '<span class="hm-feat__k">' + (open ? "פתוח לאישור הגעה" : "הבא בקהילה") + ' · ' + CAT[f.cat].he + '</span>' +
      '<button type="button" class="hm-feat__row" data-hm-date="' + dkey(f.date) + '">' +
        '<span class="hm-feat__date"><small>' + mon + '</small><b>' + f.date.getDate() + '</b></span>' +
        '<span class="hm-feat__txt"><b dir="auto">' + esc(f.title) + '</b>' +
          '<span class="hm-feat__m"><span>' + svg(ICO.clock, 13) + meta.join(" · ") + '</span>' +
          (f.location ? '<span>' + svg(ICO.pin, 13) + '<span dir="auto">' + esc(f.location) + '</span></span>' : "") +
          '</span></span></button>' +
      '<div class="hm-feat__acts">' +
        (open ? '<button type="button" class="btn-primary hm-feat__btn" data-hm-rsvp="' + esc(f.id) + '">' +
                svg(ICO.check, 15) + 'אישור הגעה</button>' : "") +
        '<button type="button" class="hm-feat__btn hm-feat__cal" data-hm-addcal>' + svg(ICO.cal, 15) + 'הוספה ליומן</button>' +
        '<span class="hm-feat__cals" hidden>' +
          (gUrl ? '<a class="hm-feat__btn" href="' + esc(gUrl) + '" target="_blank" rel="noopener">Google</a>' : "") +
          '<button type="button" class="hm-feat__btn" data-hm-apple="' + esc(f.id) + '">Apple</button>' +
        '</span>' +
      '</div></div>';
  }

  function paint() {
    var h = st.host;
    if (h && h.isConnected) {
      h.innerHTML = headHTML(st.mode, allEvents()) + '<div class="hm-sch__body">' + bodyHTML() + '</div>';
    }
    var f = st.featHost;
    if (f && f.isConnected) f.innerHTML = featCardHTML();
    paintNext();
    paintWave2();
  }

  /* ================================================================ פעולות */
  function openDate(k) {
    var d = fromKey(k);
    var ev = CBA.screens && CBA.screens.events;
    if (d && ev && typeof ev.focus === "function") ev.focus(d);
    if (CBA.navigate) CBA.navigate("events");
  }
  function onClick(e) {
    var t = e.target;
    var nb;
    if ((nb = t.closest("[data-nx-more]"))) { var mid = nb.getAttribute("data-nx-more"); nx.open[mid] = !nx.open[mid]; paintNext(); return; }
    if ((nb = t.closest("[data-nx-inv]"))) { openInvite(nb.getAttribute("data-nx-inv")); return; }
    if ((nb = t.closest("[data-nx-share]"))) { shareEv(nb.getAttribute("data-nx-share")); return; }
    var r = t.closest("[data-hm-rsvp]");
    if (r) {
      var ev = findEvent(r.getAttribute("data-hm-rsvp"));
      var scr = CBA.screens && CBA.screens.events;
      /* ⚠️ הדיאלוג של מסך האירועים כותב את `category` למסמך eventRSVP
         (כשמנהל פותח/סוגר) — ולכן מעבירים את המפתח בשם שהוא מכיר. */
      if (ev && scr && typeof scr.openRsvp === "function") {
        scr.openRsvp({ id: ev.id, title: ev.title, date: ev.date, location: ev.location,
                       description: ev.description, category: ev.cat });
        watchDialogThenRefresh();
      } else if (ev) openDate(dkey(ev.date));
      return;
    }
    if (t.closest("[data-hm-addcal]")) {
      var wrap = t.closest(".hm-feat__acts");
      var b = wrap && wrap.querySelector("[data-hm-addcal]"), cals = wrap && wrap.querySelector(".hm-feat__cals");
      if (b && cals) { b.hidden = true; cals.hidden = false; }
      return;
    }
    var a = t.closest("[data-hm-apple]");
    if (a) {
      var ae = findEvent(a.getAttribute("data-hm-apple"));
      var cal = CBA.screens && CBA.screens.events && CBA.screens.events.calendarLinks;
      /* 23.9 — פתיחה דרך events.js: ב-iOS פותח את יומן המערכת במקום להוריד קובץ */
      if (ae && cal && cal.openApple) cal.openApple(ae);
      return;
    }
    if (t.closest("[data-hm-retry]")) { st.err = ""; paint(); load(); return; }
    var day = t.closest("[data-hm-date]");
    if (day) openDate(day.getAttribute("data-hm-date"));
  }

  /* mount — נקרא מכל ציור של עמוד הבית.
     ⚠️ ההאזנה נרשמת על `root` — עטיפה שעמוד הבית יוצר מחדש בכל ציור — ולא
        על #app-main, שהוא אותו אלמנט לנצח (ר' ההערה ב-home.js ליד bindClicks). */
  function mount(opts) {
    st.host = opts.host || null;
    st.featHost = opts.featHost || null;
    st.nextHost = opts.nextHost || null;
    st.mode = opts.mode === "list" ? "list" : "grid";
    st.weekHost = opts.weekHost || null;      /* גל 2 */
    st.feedHost = opts.feedHost || null;
    st.onChange = opts.onChange || null;
    if (opts.root && st.bound !== opts.root) {
      opts.root.addEventListener("click", onClick);
      st.bound = opts.root;
    }
    if (st.host) {
      st.host.classList.add("hm-sch--" + st.mode);
      st.host.innerHTML = headHTML(st.mode, []) + '<div class="hm-sch__body">' + skeletonHTML(st.mode) + '</div>';
    }
    load();
  }


  /* ==========================================================================
   *  🔴 גל 2 (30.9.26) — הבית החדש. ספר האבנים, פרק 1 + החלטות 30.9:
   *    • אריח "השבוע" בבנטו (H20/H23/H25) — פס 7 ימים + "עכשיו".
   *    • אירועים קרובים בכרטיס "מה קרה" (H17/H22/H26), עם פנים (A3).
   *    • "אישור הגעה" שעוד לא ענינו — ל"דברים לעשות" ולמספר הגיבור (A1/H27).
   *    • מיני-כרטיס "האירוע הבא" בחופה, ולחיצה עליו פותחת גיליון עם כרטיסי
   *      29.9 המלאים (החלטת יועד 30.9: "גיליון").
   *  ⚠️ הגריד של שבועיים והרשימה של 10 ימים (host) עדיין כאן ועובדים — פשוט
   *     הבית כבר לא מבקש אותם. הם חיים בלוח האירועים.
   * ========================================================================== */
  /* ---- פנים (A3, החלטת יועד 30.9: "פנים לכולם") ----
     השמות מגיעים מרשימת השכנים (communityDirectory) — אותה רשימה שכל תושב
     כבר רואה במדריך. אישורי ההגעה עצמם (Firestore) מחזיקים רק familyId.
     כשל או רשימה שעוד לא נטענה ⇒ רק המספר, כמו עד היום. */
  var dir = { map: null, busy: false, tried: false };
  var FACE_COL = ["#7C3AED", "#0D9488", "#DB2777", "#0E7490", "#047857", "#B45309", "#6366F1", "#9D174D"];
  function loadDir() {
    if (dir.map || dir.busy || dir.tried || !(CBA.data && CBA.data.getCommunityDirectory)) return;
    dir.busy = true;
    CBA.data.getCommunityDirectory(function (res) {
      dir.busy = false; dir.tried = true;
      if (!res || !res.ok) return;
      var m = {};
      (res.rows || []).forEach(function (r) {
        var fam = "", rid = "", house = "";
        Object.keys(r || {}).forEach(function (k) {
          var t = String(k).trim(), v = String(r[k] == null ? "" : r[k]).trim();
          if (t.indexOf("מזהה קבוע") !== -1) rid = v;
          else if (t.indexOf("משפחה") !== -1 && t.indexOf("מזהה") === -1) fam = v;
          else if (t.indexOf("בית") !== -1) house = v;
        });
        if (!fam) return;
        if (rid) m[rid] = fam;
        if (house && !m[house]) m[house] = fam;
      });
      dir.map = m;
      paint();
    });
  }
  function faceColor(name) {
    var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return FACE_COL[h % FACE_COL.length];
  }
  function facesHTML(ids, max) {
    if (!ids || !ids.length) return "";
    if (!dir.map) { loadDir(); return ""; }
    var names = [];
    ids.forEach(function (id) { var n = dir.map[id]; if (n && names.indexOf(n) === -1) names.push(n); });
    if (!names.length) return "";
    return '<span class="hm2-faces" aria-hidden="true">' + names.slice(0, max || 4).map(function (n) {
      return '<i class="hm2-face" style="background:' + faceColor(n) + '" title="' + esc("משפחת " + n) + '">' + esc(n.charAt(0)) + '</i>';
    }).join("") + '</span>';
  }

  /* ---- מי צריך פרטים (אישורי הגעה, eventInfo) ---- */
  function openFuture(limit) {
    var t = sod(new Date()).getTime();
    return (st.ev || []).concat(nextYear.list || []).filter(function (e) {
      return sod(e.date).getTime() >= t && isOpen(e);
    }).sort(function (a, b) { return a.date - b.date; }).slice(0, limit || 4);
  }
  function feedEvents(n) {
    if (!st.ev) return [];
    var t = sod(new Date()).getTime(), seen = {};
    return (st.ev || []).concat(nextYear.list || []).filter(function (e) {
      return sod(e.date).getTime() >= t && (e.cat === "community" || e.cat === "culture" || isOpen(e));
    }).sort(function (a, b) { return a.date - b.date; }).filter(function (e) {
      if (seen[e.id]) return false; seen[e.id] = 1; return true;
    }).slice(0, n || 3);
  }
  function targets() {
    var out = [], seen = {};
    function add(e) { if (e && !seen[e.id]) { seen[e.id] = 1; out.push({ ev: e }); } }
    if (st.ev) nextEvents(sod(new Date())).forEach(function (x) { add(x.ev); });
    feedEvents(3).forEach(add);
    openFuture(4).forEach(add);
    return out;
  }

  /* ---- מה חשוב לבית: המיני-כרטיס, ומה פתוח לאישור הגעה ---- */
  function nextMini() {
    if (!st.ev) return null;
    var list = nextEvents(sod(new Date())).filter(function (x) { return x.ev; })
      .map(function (x) { return x.ev; }).sort(function (a, b) { return a.date - b.date; });
    return list[0] || null;
  }
  /* null = עוד לא ידוע (אין לוח / אין רשימת פתוחים / התשובות עוד בדרך) */
  function unanswered() {
    if (!st.ev) return null;
    /* כשל בקריאת "פתוחים לאישור" / אין Firestore ⇒ אין מה להציג, ולא "עוד בדרך" לנצח */
    if (!rsvp.ids) return rsvp.failed ? [] : null;
    if (!(CBA.fb && CBA.fb.readDoc)) return [];
    var out = [], unknown = false;
    openFuture(4).forEach(function (e) {
      var d = nx.data[e.id];
      if (!d || d.families === undefined) { unknown = true; return; }
      if (d.families === null) return;           /* כשל — לא ממציאים "לא עניתם" */
      if (!d.mine) out.push({ ev: e, families: d.families, att: d.att || [] });
    });
    return unknown ? null : out;
  }
  function summary() {
    return { ready: !!st.ev, err: st.err, mini: nextMini(), todo: unanswered() };
  }

  function metaOf(e) {
    var m = [WD_LONG[e.date.getDay()] + " " + dm(e.date)];
    if (!e.allDay) m.push(hm(e.date));
    if (e.location) m.push(e.location);
    return m.join(" · ");
  }

  /* ---- אריח "השבוע" ---- */
  function weekHTML() {
    var head = '<span class="hm2-tile__h"><i class="hm2-disc hm2-disc--ev">' + svg(ICO.cal, 16) + '</i>השבוע</span>';
    if (!st.ev && st.err) {
      return head + '<span class="hm2-tile__s">' + esc(st.err) +
        ' <button type="button" class="hm-link" data-hm-retry>לנסות שוב</button></span>';
    }
    if (!st.ev) return head + '<span class="skeleton" style="display:block;height:54px;border-radius:10px"></span>';
    var today = sod(new Date()), days = byDay(allEvents()), start = addDays(today, -today.getDay()), strip = "";
    for (var i = 0; i < 7; i++) {
      var d = addDays(start, i), list = days[dkey(d)] || [], cats = [];
      list.forEach(function (e) { if (cats.indexOf(e.cat) === -1) cats.push(e.cat); });
      var isToday = d.getTime() === today.getTime();
      strip += '<button type="button" class="hm2-sd' + (d < today ? " is-past" : "") + (isToday ? " is-today" : "") +
        '" data-hm-date="' + dkey(d) + '" aria-label="' + esc(WD_LONG[d.getDay()] + " " + dm(d) +
        (list.length ? " — " + list.map(function (e) { return e.title; }).join(", ") : " — אין אירועים")) + '">' +
        '<b>' + d.getDate() + '</b><small>' + WD_LETTER[d.getDay()] + '</small>' +
        '<span class="hm2-sd__dots">' + cats.slice(0, 3).map(function (c) {
          return '<i class="hm-dot hm-dot--' + CAT[c].k + '"></i>';
        }).join("") + '</span></button>';
    }
    return head + '<div class="hm2-strip">' + strip + '</div>' + nowHTML(today);
  }

  /* ---- שורות האירועים ב"מה קרה" ---- */
  function feedHTML() {
    if (!st.ev) return "";
    return feedEvents(3).map(function (e) {
      var d = nx.data[e.id] || {}, open = isOpen(e), right = "";
      if (open && typeof d.families === "number" && d.families > 0) {
        right = '<span class="hm2-who">' + facesHTML(d.att, 3) + '<span>' + d.families + '</span></span>';
      } else if (open) {
        right = '<span class="badge badge--info">אישור הגעה</span>';
      }
      return '<button type="button" class="hm2-row" data-hm-date="' + dkey(e.date) + '">' +
        '<i class="hm2-disc hm2-disc--ev">' + svg(ICO.cal, 16) + '</i>' +
        '<span class="hm2-row__t"><b dir="auto">' + esc(e.title) + '</b><small>' + esc(metaOf(e)) + '</small></span>' +
        right + '</button>';
    }).join("");
  }

  function paintWave2() {
    var w = st.weekHost;
    if (w && w.isConnected) w.innerHTML = weekHTML();
    var f = st.feedHost;
    if (f && f.isConnected) f.innerHTML = feedHTML();
    if (st.ev && (st.weekHost || st.feedHost)) loadNext(targets(), false);
    if (typeof st.onChange === "function") { try { st.onChange(summary()); } catch (e) { /* הבית נעלם */ } }
  }

  /* ---- הגיליון: כרטיסי 29.9 המלאים (קהילה, תרבות, פתוח לאישור) ---- */
  function openNextSheet() {
    if (!(CBA.ui && CBA.ui.sheet)) { if (CBA.navigate) CBA.navigate("events"); return; }
    var sh = CBA.ui.sheet({ key: "hm-next", label: "האירועים הבאים", sheetCls: "hm2-nxsheet",
      html: '<div class="hm2-sheet__t">האירועים הבאים</div><div class="hm2-nxlist"></div>' });
    var list = sh.wrap.querySelector(".hm2-nxlist");
    st.nextHost = list;
    paintNext();
    sh.wrap.addEventListener("click", function (e) {
      /* מעבר ללוח האירועים / אישור הגעה ⇒ קודם סוגרים את הגיליון */
      if (e.target.closest("[data-hm-date]") || e.target.closest("[data-hm-rsvp]")) sh.close();
      onClick(e);
    });
  }

  return {
    mount: mount,
    setPersonal: setPersonal,
    openNextSheet: openNextSheet,
    summary: summary,
    metaOf: metaOf,
    faces: facesHTML,
    MAX_CHIPS: MAX_CHIPS,
    /* לבדיקות בלבד */
    _state: st, _reset: function () { mem = {}; inflight = {}; rsvp = { ids: null, ts: 0, busy: false };
                                      st.ev = null; st.err = ""; st.personal = []; st.bound = null;
                                      nx.data = {}; nx.ts = 0; nx.busy = false; dir = { map: null, busy: false, tried: false }; }
  };
})();
