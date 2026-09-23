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
  var FEAT_DAYS = 60;         // "הבא בקהילה" — רק אם הוא בחודשיים הקרובים
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
    breaks:    { he: "חופשות גנים", k: "kg"  },
    birthdays: { he: "ימי הולדת",   k: "bd"  },
    personal:  { he: "שלי",         k: "per" }
  };
  /* סדר בתוך יום: מה שלי ומה שדורש החלטה (להגיע?) קודם; ימי הולדת אחרונים,
     כי הם אלה שיתמלאו ויידחקו ל-"+N". */
  var RANK = { personal: 0, community: 1, culture: 2, holidays: 3, breaks: 4, birthdays: 5 };
  var LEGEND = ["community", "culture", "holidays", "breaks", "personal"];
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
    pin:   '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'
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
      out.push({ id: String(e.id || ""), title: String(e.title || ""), date: d, allDay: !!e.allDay,
                 cat: cat, location: String(e.location || ""), description: String(e.description || "") });
    });
    return out;
  }

  /* ---- "אישור הגעה" פתוח? — אותה שאילתה של מסך האירועים (Firestore) ---- */
  var rsvp = { ids: null, ts: 0, busy: false };
  function loadRsvp(cb) {
    if (rsvp.ids && (Date.now() - rsvp.ts) < RSVP_TTL) return cb();
    if (rsvp.busy || !(CBA.fb && CBA.fb.queryCollection)) return cb();
    rsvp.busy = true;
    try {
      CBA.fb.queryCollection("eventRSVP", [["enabled", true]], function (err, rows) {
        rsvp.busy = false;
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
    featHost: null,    // "הבא בקהילה" (תושב, מחשב)
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
  function byDay(list) {
    var m = {};
    list.forEach(function (e) { var k = dkey(e.date); (m[k] = m[k] || []).push(e); });
    Object.keys(m).forEach(function (k) {
      m[k].sort(function (a, b) {
        return (RANK[a.cat] - RANK[b.cat]) || (a.date - b.date) || a.title.localeCompare(b.title, "he");
      });
    });
    return m;
  }
  /* "הבא בקהילה" — אירוע קהילה/תרבות הבא, מהיום, בחודשיים הקרובים. */
  function nextCommunity(today) {
    var lim = addDays(today, FEAT_DAYS).getTime();
    var c = (st.ev || []).filter(function (e) {
      return (e.cat === "community" || e.cat === "culture") && e.date >= today && e.date.getTime() < lim;
    }).sort(function (a, b) { return a.date - b.date; });
    return c[0] || null;
  }
  function findEvent(id) {
    var all = allEvents();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
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
      return e.date >= from && (e.cat === "community" || e.cat === "culture" || e.cat === "breaks");
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
        '<span class="hm-ag__l"><span class="hm-ag__k">הבא בקהילה</span>' +
          '<span class="hm-ag__i"><i class="hm-dot hm-dot--' + k + '"></i><span class="hm-ag__t" dir="auto">' + esc(f.title) + '</span></span>' +
          '<span class="hm-ag__m">' + meta.join(" · ") + '</span></span></button>' +
      (open ? '<button type="button" class="hm-rsvp-sm" data-hm-rsvp="' + esc(f.id) + '">' + svg(ICO.check, 13) + 'אישור הגעה</button>' : "") +
      '</div>';
  }

  function listHTML(today, days, rows, feat, compact) {
    var out = [agendaRow(today, days[dkey(today)] || [], (days[dkey(today)] || []).length ? "" : "is-empty-today", today)];
    var shown = 0, featShown = false;
    for (var i = 1; i < LIST_DAYS && out.length < rows; i++) {
      var d = addDays(today, i), list = days[dkey(d)] || [];
      if (!list.length) continue;
      if (feat && list.indexOf(feat) !== -1) featShown = true;
      out.push(agendaRow(d, list, (shown >= 2 ? "is-extra" : ""), today));
      shown++;
    }
    if ((days[dkey(today)] || []).indexOf(feat) !== -1) featShown = true;
    if (feat && !featShown && !compact) out.push(featRowHTML(feat));
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
      var dd = addDays(today, j), l = (days[dkey(dd)] || []).filter(function (e) { return e !== feat; });
      if (!l.length) continue;
      rows.push(agendaRow(dd, l, "", today)); n++;
    }
    if (feat) rows.push(featRowHTML(feat));
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
    var all = allEvents(), days = byDay(all), feat = nextCommunity(today);
    if (st.mode === "list") return listHTML(today, days, LIST_ROWS, feat, false);
    return '<div class="hm-sch__grid">' + gridHTML(today, days) + laterHTML(today) + '</div>' +
      '<div class="hm-sch__compact">' + compactHTML(today, days, feat) + '</div>';
  }

  function featCardHTML() {
    var f = st.ev ? nextCommunity(sod(new Date())) : null;
    if (!f) return "";
    var mon = MON_SHORT[f.date.getMonth()];
    var meta = [WD_LONG[f.date.getDay()]];
    if (!f.allDay) meta.push(hm(f.date));
    var open = !!(rsvp.ids && rsvp.ids[f.id]);
    var cal = CBA.screens && CBA.screens.events && CBA.screens.events.calendarLinks;
    var gUrl = cal && cal.google ? cal.google(f) : "";
    return '<section class="card hm-card hm-feat">' +
      '<span class="hm-feat__k">הבא בקהילה · ' + CAT[f.cat].he + '</span>' +
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
      '</div></section>';
  }

  function paint() {
    var h = st.host;
    if (h && h.isConnected) {
      h.innerHTML = headHTML(st.mode, allEvents()) + '<div class="hm-sch__body">' + bodyHTML() + '</div>';
    }
    var f = st.featHost;
    if (f && f.isConnected) f.innerHTML = featCardHTML();
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
    var r = t.closest("[data-hm-rsvp]");
    if (r) {
      var ev = findEvent(r.getAttribute("data-hm-rsvp"));
      var scr = CBA.screens && CBA.screens.events;
      /* ⚠️ הדיאלוג של מסך האירועים כותב את `category` למסמך eventRSVP
         (כשמנהל פותח/סוגר) — ולכן מעבירים את המפתח בשם שהוא מכיר. */
      if (ev && scr && typeof scr.openRsvp === "function") {
        scr.openRsvp({ id: ev.id, title: ev.title, date: ev.date, location: ev.location,
                       description: ev.description, category: ev.cat });
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
    st.mode = opts.mode === "list" ? "list" : "grid";
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

  return {
    mount: mount,
    setPersonal: setPersonal,
    MAX_CHIPS: MAX_CHIPS,
    /* לבדיקות בלבד */
    _state: st, _reset: function () { mem = {}; inflight = {}; rsvp = { ids: null, ts: 0, busy: false };
                                      st.ev = null; st.err = ""; st.personal = []; st.bound = null; }
  };
})();
