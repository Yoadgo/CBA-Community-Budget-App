/* ============================================================================
 *  events.js — לוח אירועים קהילתי
 * ============================================================================
 *  תצוגה קריאה-בלבד של אירועים קהילתיים, חגים, חופשות גנים וימי הולדת.
 *  שלוש תצוגות:
 *    • חודשית (דסקטופ) — גריד 7x6 + צ'יפבר קטגוריות + "מה קורה החודש" + סרגל צד
 *    • שנתית (דסקטופ) — 12 קוביות חודשיות עם רשימת אירועים קומפקטית
 *    • סדר יומי (מובייל) — רשימה מקובצת לפי יום, ימים שעברו מוסתרים כברירת מחדל
 *
 *  ניהול אירועים: Google Calendar (קריאה-בלבד, ללא ממשק עריכה).
 *  נתונים נוספים: myProfile v2 (ימי הולדת — עדיין לא מחובר), שריונים (אירועים פרטיים).
 *
 *  עיצוב (2026-09-23): מיושר לסקיצה שאושרה — פלטת --cat-X ו--cat-X-tint,
 *  כרטיסי glass (.lg), צ'יפבר סינון קטגוריות, פס "מה קורה החודש".
 *  משלוח מיילים: כפתור ידני בלבד, ללא אוטומציה (הגבלת MailApp).
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

CBA.screens.events = (function () {
  "use strict";

  // צבעים לפי קטגוריה — תואם 1:1 את משתני ה-CSS (--cat-*/--cat-*-tint) בסקיצה שאושרה.
  const CATEGORIES = {
    community: { he: "קהילה", cssVar: "--cat-community", icon: "📢" },
    culture: { he: "תרבות", cssVar: "--cat-culture", icon: "🎭" },
    holidays: { he: "חגי ישראל", cssVar: "--cat-holiday", icon: "🇮🇱" },
    breaks: { he: "גנים", cssVar: "--cat-kg", icon: "👶" },
    afterschool: { he: "צהרון", cssVar: "--cat-as", icon: "🎒" },   // 28.9 — גוון בהיר של ירוק הגנים
    birthdays: { he: "ימי הולדת", cssVar: "--cat-birthday", icon: "🎂" },
    personal: { he: "אירועים פרטיים", cssVar: "--cat-personal", icon: "🔑" }
  };
  var CATEGORY_ORDER = ["community", "culture", "holidays", "breaks", "afterschool", "birthdays"];

  /* 28.9 — קוביית חודש בתצוגה השנתית מחולקת לאזורים (הכרעת יועד), מופרדים בקו.
     אזור ריק לא מוצג. */
  var YEAR_SECTIONS = [
    { he: "גנים · צהרון", cats: ["breaks", "afterschool"] },
    { he: "קהילה · תרבות", cats: ["community", "culture"] },
    { he: "חגים", cats: ["holidays"] },
    { he: "ימי הולדת", cats: ["birthdays"] }
  ];
  /* אילו קטגוריות מתאחדות לקפסולה אחת כשאותו אירוע חוזר בימים רצופים
     ("סוכות (יום 1)", "(יום 2)"…, או "חופש בגנים" ב-1.10 וב-2.10).
     ⚠️ לא קהילה/תרבות — שם לכל אירוע יש מזהה משלו לאישור הגעה ולהזמנה. */
  var MERGE_CATS = { holidays: 1, breaks: 1, afterschool: 1 };

  const HEBREW_MONTHS = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
  ];
  const HEBREW_MONTHS_SHORT = [
    "ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני",
    "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"
  ];

  const HEBREW_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  // מצב הסך
  var state = {
    currentMonth: new Date(),
    selectedDate: null,
    viewMode: "monthly", // "monthly", "annual", "mobile"
    allEvents: [],
    eventsById: {}, // אינדקס מהיר לפי id, לצורך כפתור "אישור הגעה" (RSVP) והוספה ליומן
    rsvpEnabledIds: {}, // מפת eventId -> true, לאירועים שמעקב ההגעה שלהם פתוח כרגע
    eventInfo: {}, // 28.9 — eventId -> {schedule, hasImage} (eventInfo ב-Firestore)
    rsvpCounts: {}, // 23.9 — eventId -> {families, people} · ספירה חיה, גלויה לכל תושב (הכרעת יועד)
    highlightEventId: null, // 23.9 — קישור ישיר (#event=ID): האירוע שיודגש אחרי הציור
    privateEvents: [],
    activeCategories: null, // Set (מיוצג כאובייקט) של קטגוריות פעילות בצ'יפבר; null = הכול פעיל
    showAllMonth: false, // מובייל בלבד: להציג גם ימים שעברו החודש
    loading: false,
    error: null,
    year: new Date().getFullYear()
  };

  function esc(s) {
    return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s);
  }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function startOfDay(d) {
    var x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /* ==========================================================================
   *  אירועים של כמה ימים (28.9) — "קפסולה" אחת במקום שבב לכל יום
   * --------------------------------------------------------------------------
   *  lastDay = היום האחרון (כולל) שהאירוע מכסה. מחושב מ-end שהשרת שולח
   *  (בסוף בלעדי: יום שלם שנגמר בחצות של מחר = יום אחד). בלי end — יום אחד.
   * ========================================================================== */
  var DAY_MS = 86400000;
  function addDaysEv(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function computeLastDay(start, end) {
    var s = startOfDay(start);
    if (!end || isNaN(end.getTime())) return s;
    var l = startOfDay(new Date(end.getTime() - 1));
    return l > s ? l : s;
  }
  function evLastDay(e) {
    if (e.lastDay) return e.lastDay;
    return computeLastDay(e.date, e.end ? new Date(e.end) : null);
  }
  function isMultiDay(e) { return evLastDay(e).getTime() > startOfDay(e.date).getTime(); }
  function evCovers(e, d) {
    var t = startOfDay(d).getTime();
    return t >= startOfDay(e.date).getTime() && t <= evLastDay(e).getTime();
  }
  function evOverlaps(e, from, to) {
    return startOfDay(e.date) <= to && evLastDay(e) >= startOfDay(from);
  }
  /* "11–13" באותו חודש, "25.9–2.10" בין חודשים, "22" ליום אחד (withMonth: "22.9"). */
  function rangeLabel(e, withMonth) {
    var s = e.date, l = evLastDay(e);
    var sd = s.getDate() + (withMonth ? "." + (s.getMonth() + 1) : "");
    if (!isMultiDay(e)) return sd;
    if (l.getMonth() === s.getMonth() && l.getFullYear() === s.getFullYear()) {
      return s.getDate() + "–" + l.getDate() + (withMonth ? "." + (l.getMonth() + 1) : "");
    }
    return s.getDate() + "." + (s.getMonth() + 1) + "–" + l.getDate() + "." + (l.getMonth() + 1);
  }

  /* ==========================================================================
   *  פס "עכשיו" (28.9, הכרעת יועד) — אירוע של כמה ימים שקורה היום מוצג פעם
   *  אחת, למעלה, עם "יום 3 מתוך 7" וטווח תאריכים. הימים ברשימה מציגים רק
   *  מה שמתחיל בהם — בלי "סוכות (יום 4)", "סוכות (יום 5)" שוב ושוב.
   * ========================================================================== */
  function ongoingSpans(list, today) {
    var t = startOfDay(today || new Date());
    return list.filter(function (e) { return isMultiDay(e) && evCovers(e, t); })
      .sort(function (a, b) { return evLastDay(a) - evLastDay(b); });
  }
  function spanDayOf(e, today) {
    var total = Math.round((evLastDay(e) - startOfDay(e.date)) / DAY_MS) + 1;
    var idx = Math.round((startOfDay(today) - startOfDay(e.date)) / DAY_MS) + 1;
    return { idx: idx, total: total };
  }
  function nowStripHTML(spans, today, clickable) {
    if (!spans.length) return "";
    return '<div class="ev-now" dir="rtl"><div class="ev-now__k">עכשיו</div>' +
      spans.slice(0, 4).map(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        var d = spanDayOf(e, today);
        var left = Math.round((evLastDay(e) - startOfDay(today)) / DAY_MS);
        var note = d.idx === 1 ? "מתחיל היום" : left === 0 ? "יום אחרון" : "יום " + d.idx + " מתוך " + d.total;
        var tag = clickable ? "button" : "div";
        return '<' + tag + (clickable ? ' type="button"' : "") + ' class="ev-now__i" data-now-id="' + esc(e.id) + '"' +
          ' style="background:var(' + cat.cssVar + '-tint)">' +
          '<span class="ev-now__row"><b dir="auto">' + esc(e.title) + '</b><span class="ev-now__n">' + note + '</span>' +
          '<span class="ev-now__r" dir="ltr">' + rangeLabel(e, true) + '</span></span>' +
          '<span class="ev-now__p"><i style="width:' + Math.round(100 * d.idx / d.total) + '%;background:var(' + cat.cssVar + ')"></i></span>' +
          '</' + tag + '>';
      }).join("") + '</div>';
  }

  /* איחוד רצף: אותה קטגוריה (MERGE_CATS), אותו שם בסיס (בלי "(יום N)"),
     ימים רצופים או חופפים ⇒ אירוע אחד. שם כפול "סוכות (יום 7) / הושענא רבה":
     החלק הראשון מצטרף לרצף, והשאר נשאר אירוע נפרד לאותו יום. */
  function seriesBase(title) {
    var first = String(title || "").split(" / ")[0];
    var m = /^(.*?)\s*\(יום \d+\)$/.exec(first);
    return (m ? m[1] : first).trim();
  }
  function mergeSeries(list) {
    var out = [], groups = {};
    list.forEach(function (e) {
      if (!MERGE_CATS[e.category]) { out.push(e); return; }
      var parts = String(e.title || "").split(" / ");
      if (parts.length > 1) {
        out.push(Object.assign({}, e, { id: e.id + "~2", title: parts.slice(1).join(" / "),
                                        lastDay: startOfDay(e.date), aliasOf: e.id }));
      }
      var k = e.category + "|" + seriesBase(e.title);
      (groups[k] = groups[k] || []).push(e);
    });
    Object.keys(groups).forEach(function (k) {
      var g = groups[k].sort(function (a, b) { return a.date - b.date; });
      var cur = null;
      g.forEach(function (e) {
        var s = startOfDay(e.date), l = evLastDay(e);
        if (cur && s.getTime() <= addDaysEv(cur.lastDay, 1).getTime()) {
          if (l > cur.lastDay) cur.lastDay = l;
          cur.memberIds.push(e.id);
          cur.allDay = cur.allDay && e.allDay !== false;
          return;
        }
        cur = Object.assign({}, e, { title: seriesBase(e.title) || e.title, lastDay: l, memberIds: [e.id] });
        out.push(cur);
      });
    });
    /* רצף של יום אחד נשאר עם השם המקורי ("ראש השנה (יום 2)" לבד — כפי שהוא) */
    out.forEach(function (e) {
      if (e.memberIds && e.memberIds.length === 1 && !isMultiDay(e)) {
        var orig = list.filter(function (x) { return x.id === e.memberIds[0]; })[0];
        if (orig) e.title = String(orig.title).split(" / ")[0];
      }
    });
    return out.sort(function (a, b) { return a.date - b.date; });
  }

  /* 28.9 — אותו חישוב משמש גם את הלו"ז בעמוד הבית (homeSchedule.js) */
  if (window.CBA) CBA.eventSpans = { mergeSeries: mergeSeries, computeLastDay: computeLastDay,
                                     evLastDay: evLastDay, isMultiDay: isMultiDay, rangeLabel: rangeLabel };

  function isCategoryActive(cat) {
    return !state.activeCategories || !!state.activeCategories[cat];
  }

  /* ==========================================================================
   *  שריונים פרטיים (האירועים הפרטיים שלי) — נתון אמיתי
   * --------------------------------------------------------------------------
   *  משתמש בפונקציה הקיימת CBA.data.getMyClubReservations (dataService.js),
   *  שכבר מחוברת ל-handleMyClubReservations_ ב-Code.gs וקוראת מ-CLUB_CALENDAR_ID.
   *  מחזירה { ok, reservations:[{id,start,end,note,status}] }.
   *  ⚠️ אין כאן ניחוש מבנה — זו אותה פונקציה שמשמשת את resReserve.js.
   * ========================================================================== */
  function loadPrivateEvents(callback) {
    if (!CBA.data || !CBA.data.getMyClubReservations) {
      state.privateEvents = [];
      return callback();
    }
    CBA.data.getMyClubReservations({}, function (res) {
      if (!res || !res.ok || !res.reservations) {
        state.privateEvents = [];
        return callback();
      }
      state.privateEvents = res.reservations
        // רק שריונים מאושרים/ממתינים מוצגים — לא שריונים שנדחו
        .filter(function (r) { return r.status !== "declined" && r.status !== "rejected"; })
        .map(function (r) {
          return {
            id: r.id,
            title: r.note ? ("שריון מועדון — " + r.note) : "שריון מועדון",
            date: new Date(r.start),
            endDate: r.end ? new Date(r.end) : null,
            category: "personal",
            type: "reservation",
            status: r.status
          };
        });
      callback();
    });
  }

  /* ==========================================================================
   *  ימי הולדת — נתון מ-Apps Script (קריאה מגיליון התושבים)
   * --------------------------------------------------------------------------
   *  קוראים מהשרת את כל תושבים עם ימי הולדת, משומרים ממלא, ויוצרים אירוע
   *  חוזר בשנה הנוכחית/הבאה. רק תושבים עם birthDate שמומלאו מופיעים.
   *  (2026-09-25: התוספת הראשונה של ימי הולדת לעמוד האירועים)
   *  ⏳ דורש action חדש "eventsBirthdays" בשרת (Code.gs > handleEventsBirthdays_)
   * ========================================================================== */
  /* ימי הולדת (28.9) — Apps Script בלבד (שמות תושבים לא עוברים ל-Firestore
     ולא נשמרים במכשיר). השרת מחזיר יום+חודש בלבד — בלי שנת לידה/גיל — ואנחנו
     ממקמים אותם בשנה שמוצגת בלוח. ⚠️ הלוח **לא מחכה** לקריאה הזו (~2-5ש'):
     הוא מצויר מיד, וימי ההולדת נכנסים בציור חוזר כשהם מגיעים. */
  var bdCache = null; // [{key,name,month,day}] לכל אורך המושב
  function loadBirthdayEvents(year, done) {
    function place(list) {
      return list.map(function (b) {
        var ev = { id: "bd-" + b.key + "-" + year, title: "יום הולדת — " + b.name,
                   date: new Date(year, b.month - 1, b.day), allDay: true,
                   category: "birthdays", description: "", location: "" };
        return ev;
      }).filter(function (ev) { return ev.date.getMonth() >= 0 && !isNaN(ev.date.getTime()); });
    }
    if (bdCache) return done(place(bdCache));
    if (!CBA.sheets || !CBA.sheets.get) return done([]);
    CBA.sheets.get({ action: "eventsBirthdays" }, function (res) {
      if (!res || !res.ok || !Array.isArray(res.birthdays)) return done([]);
      bdCache = res.birthdays;
      done(place(bdCache));
    });
  }

  /* ==========================================================================
   *  אירועי קהילה/תרבות/חגים/חופשות גנים — נתון אמיתי (2026-09-23)
   * --------------------------------------------------------------------------
   *  מחובר ל-CBA.data.getEventsFast (dataService.js): קודם המסמך
   *  `eventsCal/{year}` ב-Firestore, ובכל כשל — getEventsList ->
   *  handleGetEventsList_ ב-Code.gs, שקורא מארבעת היומנים שב-EVENTS_CALENDARS.
   * ========================================================================== */
  function loadCommunityEvents(year, callback) {
    var get = CBA.data && (CBA.data.getEventsFast || CBA.data.getEventsList);
    if (!get) {
      state.allEvents = [];
      state.error = "מנוע הנתונים לא נטען.";
      return callback();
    }
    get(year, function (res) {
      if (!res || !res.ok || !res.events) {
        state.allEvents = [];
        state.error = (res && res.error) || "לא הצלחנו לטעון את לוח האירועים.";
        return callback();
      }
      state.error = null;
      state.eventsById = {};
      state.allEvents = res.events.map(function (e) {
        var ev = {
          id: e.id,
          title: e.title,
          date: new Date(e.date),
          end: e.end ? new Date(e.end) : null,   // 28.9 — אירוע של כמה ימים
          allDay: e.allDay !== false,   // 28.9 — כדי להציג שעה לאירוע עם שעה
          category: e.category,
          description: e.description || "",
          location: e.location || ""
        };
        ev.lastDay = computeLastDay(ev.date, ev.end);
        return ev;
      });
      state.allEvents = mergeSeries(state.allEvents);
      state.allEvents.forEach(function (ev) {
        state.eventsById[ev.id] = ev;
        (ev.memberIds || []).forEach(function (id) { if (!state.eventsById[id]) state.eventsById[id] = ev; });
      });
      callback();
      // ימי הולדת — ברקע, ואז ציור חוזר (ר' loadBirthdayEvents)
      loadBirthdayEvents(year, function (birthdays) {
        if (!birthdays.length || state.year !== year) return;
        birthdays.forEach(function (b) {
          if (state.eventsById[b.id]) return;
          state.allEvents.push(b);
          state.eventsById[b.id] = b;
        });
        if (activeContainer && activeContainer.isConnected &&
            !document.body.classList.contains("has-cba-dlg")) draw(activeContainer);
      });
    });
  }

  /* ==========================================================================
   *  אילו אירועים פתוחים כרגע ל"אישור הגעה" — נטען פעם אחת בכניסה למסך.
   *  שאילתת שוויון יחידה על eventRSVP/{enabled:true} (Firestore, מודל ב'),
   *  כדי שכפתור ה-RSVP יוצג רק על אירוע שמנהל פתח בפועל — לא כברירת מחדל.
   * ========================================================================== */
  function loadRsvpEnabledIds(callback) {
    state.rsvpEnabledIds = {};
    if (!CBA.fb || !CBA.fb.queryCollection) return callback();
    CBA.fb.queryCollection("eventRSVP", [["enabled", true]], function (err, rows) {
      if (!err && rows) {
        rows.forEach(function (r) { if (r && r.id) state.rsvpEnabledIds[r.id] = true; });
      }
      loadRsvpCounts(callback);
    });
  }

  /* ספירה חיה לכל אירוע שמעקב ההגעה שלו פתוח (23.9.26, הכרעת יועד: גלוי
     לכולם). שאילתת שוויון אחת לכל אירוע פתוח — בדרך כלל 0-3 בחודש. אם כללי
     Firestore עדיין לא מתירים לתושב לקרוא (לפני פרסום הכללים), השאילתה
     נכשלת בשקט והתג פשוט לא מוצג — שום דבר אחר לא נשבר. */
  function loadRsvpCounts(callback) {
    state.rsvpCounts = {};
    var ids = Object.keys(state.rsvpEnabledIds);
    if (!ids.length || !CBA.fb || !CBA.fb.queryCollection) return callback();
    var left = ids.length;
    ids.forEach(function (id) {
      CBA.fb.queryCollection("eventRSVPResponses", [["eventId", id]], function (err, rows) {
        if (!err && rows) state.rsvpCounts[id] = countRsvpRows(rows);
        if (--left === 0) callback();
      });
    });
  }

  function countRsvpRows(rows) {
    var att = rows.filter(function (r) { return r && r.status === "attending"; });
    var people = att.reduce(function (n, r) { return n + (Number(r.adults) || 0) + (Number(r.children) || 0); }, 0);
    return { families: att.length, people: people };
  }

  // תג "✓ 14 משפחות · 31 איש" — ריק אם אין ספירה או שאיש עוד לא אישר.
  function rsvpCountHTML(eventId) {
    var c = state.rsvpCounts[eventId];
    if (!c || !c.families) return "";
    return '<span class="rsvp-count-pill" title="אישרו הגעה">✓ ' + c.families +
      (c.families === 1 ? " משפחה" : " משפחות") + ' · ' + c.people + ' איש</span>';
  }

  /**
   * הבאת אירועים מכל המקורות — הפונקציה הראשית שהמסך קורא לה.
   */
  /* ⚡ 24.9 (דיווח 20 של דר: "לוח אירועים לא עולה כמעט 2 דקות") — שלוש
     הטעינות **במקביל**. עד היום הן רצו בטור, וכל אחת עם פסק זמן משלה
     (Firestore 8ש', Apps Script 30ש'), כך שבמקרה הרע ההמתנות הצטברו.
     הן בלתי תלויות זו בזו: כל אחת כותבת לשדה אחר ב-state. */
  function loadEvents(year, callback) {
    state.loading = true;
    state.error = null;
    var left = 4;
    function one() {
      if (--left > 0) return;
      state.loading = false;
      if (callback) callback();
    }
    loadCommunityEvents(year, one);
    loadPrivateEvents(one);
    loadRsvpEnabledIds(one);
    loadEventInfo(year, one);   // 28.9 — הזמנה + לו"ז (Firestore, שאילתה אחת)
  }

  /* ==========================================================================
   *  הוספה ליומן — בחירה בין Google Calendar ל-Apple Calendar (ICS)
   * ========================================================================== */
  function icsDate(d) {
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }
  function icsDateTime(d) {
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
      "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) + pad2(d.getUTCSeconds()) + "Z";
  }
  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  }

  function googleAddUrl(ev) {
    var start = ev.date;
    var end = addDaysEv(evLastDay(ev), 1);   // 28.9 — אירוע של כמה ימים
    var params = new URLSearchParams({
      action: "TEMPLATE",
      text: ev.title,
      dates: icsDate(start) + "/" + icsDate(end)
    });
    if (ev.location) params.set("location", ev.location);
    if (ev.description) params.set("details", ev.description);
    return "https://calendar.google.com/calendar/render?" + params.toString();
  }

  function appleIcsDataUri(ev) {
    var start = ev.date;
    var end = addDaysEv(evLastDay(ev), 1);
    var lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CBA//Events//HE",
      "BEGIN:VEVENT",
      "UID:" + ev.id + "@cba-events",
      "DTSTAMP:" + icsDateTime(new Date()),
      "DTSTART;VALUE=DATE:" + icsDate(start),
      "DTEND;VALUE=DATE:" + icsDate(end),
      "SUMMARY:" + icsEscape(ev.title)
    ];
    if (ev.location) lines.push("LOCATION:" + icsEscape(ev.location));
    if (ev.description) lines.push("DESCRIPTION:" + icsEscape(ev.description));
    lines.push("END:VEVENT", "END:VCALENDAR");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"));
  }

  // שתי כפתורי "הוספה ליומן" קטנים — Google ו-Apple — במקום כפתור יחיד.
  function addCalHTML(eventId) {
    return '<span class="addcal-group">' +
      '<a class="addcal" data-cal="google" data-event-id="' + esc(eventId) + '" target="_blank" rel="noopener">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg>Google</a>' +
      '<a class="addcal" data-cal="apple" data-event-id="' + esc(eventId) + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 2v4M16 2v4M3 10h18"/><rect x="3" y="4" width="18" height="18" rx="2"/></svg>Apple</a>' +
      '</span>';
  }

  /* iOS — מה באמת קורה (24.9.26, הכרעת יועד אחרי בדיקה חיה):
     באייפון **אין** דרך לפתוח קובץ יומן מהאינטרנט ישירות ביומן. מאז iOS 13
     כל קובץ .ics — מקישור רגיל, מ-data: ומ-blob: — יורד קודם ל"הורדות",
     ורק לחיצה עליו שם פותחת את גיליון "הוספה ליומן". הניסיון הקודם
     (window.open על data:text/calendar) הוריד קובץ בדיוק כמו קישור download,
     רק בלי שם קובץ ובלי להסביר למשתמש מה קרה.
     לכן: מסלול אחד לכל המכשירים — הורדה עם שם קובץ ברור — ובאייפון גם
     הודעה שאומרת איפה הקובץ ומה לעשות איתו. פונקציה אחת לכל האפליקציה,
     גם עמוד הבית (homeSchedule.js) קורא לה דרך calendarLinks.openApple. */
  function isIOS() {
    var ua = navigator.userAgent || "";
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function openApple(ev) {
    var uri = appleIcsDataUri(ev);
    var link = document.createElement("a");
    link.href = uri;
    link.download = (ev.title || "event").replace(/[^\w\u0590-\u05FF -]/g, "").slice(0, 60) + ".ics";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (isIOS() && CBA.ui && CBA.ui.toast) {
      CBA.ui.toast("הקובץ ירד. לחצו על חץ ההורדות למעלה ואז על הקובץ — היומן ייפתח עם האירוע.", "ok", 7000);
    }
  }

  /* קישור ישיר לאירוע (23.9.26): כתובת האתר + #event=<מזהה>. app.js קורא את
     ה-hash בעלייה ומנתב לכאן דרך focusEvent. */
  function eventLink(ev) {
    var base = window.location.origin + window.location.pathname;
    return base + "#event=" + encodeURIComponent(ev.id);
  }
  function shareEvent(ev) {
    var url = eventLink(ev);
    var text = ev.title + " · " + ev.date.getDate() + "." + (ev.date.getMonth() + 1) + "." + ev.date.getFullYear();
    if (navigator.share) {
      navigator.share({ title: ev.title, text: text, url: url }).catch(function () {});
      return;
    }
    function done() { if (CBA.ui && CBA.ui.toast) CBA.ui.toast("הקישור לאירוע הועתק", "ok"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { window.prompt("העתקת קישור לאירוע:", url); });
    } else {
      window.prompt("העתקת קישור לאירוע:", url);
    }
  }
  function shareBtnHTML(eventId) {
    return '<button type="button" class="addcal btn-share-event" data-event-id="' + esc(eventId) + '" title="שיתוף קישור לאירוע">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>שיתוף</button>';
  }
  function wireShareButtons(container) {
    container.querySelectorAll(".btn-share-event").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var ev = state.eventsById[b.dataset.eventId];
        if (ev) shareEvent(ev);
      });
    });
  }

  function wireAddCalButtons(container) {
    container.querySelectorAll('.addcal[data-cal="google"]').forEach(function (a) {
      var ev = state.eventsById[a.dataset.eventId];
      if (ev) a.href = googleAddUrl(ev);
    });
    container.querySelectorAll('.addcal[data-cal="apple"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var ev = state.eventsById[a.dataset.eventId];
        if (ev) openApple(ev);
      });
    });
  }

  /* ==========================================================================
   *  צ'יפבר סינון קטגוריות — משותף לדסקטופ (chipbar) ולמובייל (m-chipbar)
   * ========================================================================== */
  function chipbarHTML(monthEvents, mobileClass) {
    var counts = {};
    monthEvents.forEach(function (e) { counts[e.category] = (counts[e.category] || 0) + 1; });

    var html = '<div class="' + (mobileClass ? "m-chipbar" : "chipbar") + '" dir="rtl">';
    /* EA3 (גל 3, 1.10.26) — "הכול": מופיע רק כשמשהו כבוי, ומחזיר את כל הקטגוריות */
    var anyOff = !!state.activeCategories && CATEGORY_ORDER.some(function (k) { return !isCategoryActive(k); });
    if (anyOff) html += '<button type="button" class="chip chip-all" data-cat-all>הכול</button>';
    CATEGORY_ORDER.forEach(function (key) {
      var cat = CATEGORIES[key];
      var cnt = counts[key] || 0;
      if (!cnt && mobileClass) return; // במובייל מציגים רק קטגוריות שיש בהן משהו החודש
      var on = isCategoryActive(key);
      html += '<button type="button" class="chip' + (on ? " on" : "") + '" data-cat="' + key + '" ' +
        'style="background:' + (on ? "var(" + cat.cssVar + "-tint)" : "#fff") + '">' +
        '<i class="dot" style="background:var(' + cat.cssVar + ')"></i>' + esc(cat.he) +
        (mobileClass ? "" : ' <span class="cnt">' + cnt + '</span>') +
        '</button>';
    });
    html += '</div>';
    return html;
  }

  function wireChipbar(container) {
    var allChip = container.querySelector(".chip[data-cat-all]");
    if (allChip) allChip.addEventListener("click", function () { state.activeCategories = null; draw(activeContainer); });
    container.querySelectorAll(".chip[data-cat]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cat = chip.dataset.cat;
        if (!state.activeCategories) {
          // ראשונה שנלחצת: מתחילים מ"הכול פעיל" ומכבים רק את זו
          state.activeCategories = {};
          CATEGORY_ORDER.forEach(function (k) { state.activeCategories[k] = true; });
        }
        state.activeCategories[cat] = !state.activeCategories[cat];
        draw(activeContainer);
      });
    });
  }

  function filterByActiveCategories(events) {
    return events.filter(function (e) { return isCategoryActive(e.category); });
  }

  /* ==========================================================================
   *  "מה קורה החודש" — פס תקציר בראש התצוגה החודשית
   * ========================================================================== */
  function digestHTML(monthEvents) {
    var today = startOfDay(new Date());
    var upcoming = monthEvents
      .filter(function (e) { return evLastDay(e) >= today; })
      .sort(function (a, b) { return a.date - b.date; })
      .slice(0, 4);
    if (!upcoming.length) upcoming = monthEvents.slice().sort(function (a, b) { return a.date - b.date; }).slice(0, 4);
    if (!upcoming.length) return "";

    return '<div class="digest lg" dir="rtl">' +
      '<div class="ttl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>מה קורה החודש</div>' +
      '<div class="digest-list">' +
      upcoming.map(function (e) {
        return '<div class="digest-item"><span class="date" dir="ltr">' + rangeLabel(e, true) + '</span>' +
          '<span class="t">' + esc(e.title) + '</span></div>';
      }).join("") +
      '</div></div>';
  }

  /**
   * תצוגה חודשית
   */
  function renderMonthlyView(container, prefixHTML) {
    var month = state.currentMonth.getMonth();
    var year = state.currentMonth.getFullYear();
    var mFrom = new Date(year, month, 1), mTo = new Date(year, month + 1, 0);
    var monthEventsAll = state.allEvents.filter(function (e) { return evOverlaps(e, mFrom, mTo); });
    var monthEvents = filterByActiveCategories(monthEventsAll);

    var html = (prefixHTML || demoBannerHTML()) +
      '<div class="events-container">' +
      chipbarHTML(monthEventsAll, false) +
      (function () {
        var now = new Date();
        var isCur = now.getMonth() === month && now.getFullYear() === year;
        var spans = isCur ? ongoingSpans(monthEvents, now) : [];
        return spans.length ? nowStripHTML(spans, now, true) : digestHTML(monthEvents);
      })() +
      '<div class="cal-layout">' +
      '<div class="grid-card lg">' +
      renderMonthlyCalendar(month, year, monthEvents) +
      '</div>' +
      renderSidebarColumn(state.selectedDate, monthEvents) +
      '</div>' +
      '</div>';

    container.innerHTML = html;
    wireMonthlyListeners(container, monthEvents);
    wireChipbar(container);
    wireAddCalButtons(container);
    wireShareButtons(container);
    applyHighlight(container);
    syncCanopy();
  }

  function renderMonthlyCalendar(month, year, monthEvents) {
    var firstDay = new Date(year, month, 1);
    var startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    var html = '<div class="month-header cal-toolbar" dir="rtl">' +
      '<div class="cal-title">' +
      '<div class="month-nav"><button type="button" class="btn-prev-month" aria-label="חודש קודם">›</button>' +
      '<button type="button" class="btn-next-month" aria-label="חודש הבא">‹</button></div>' +
      '<h2>' + HEBREW_MONTHS[month] + ' ' + year + '</h2>' +
      '</div>' +
      viewToggleHTML() +
      '</div>' +
      '<div class="wk-head">' +
      HEBREW_WEEKDAYS.map(function (d) { return '<span>' + d + '</span>'; }).join("") +
      '</div>' +
      '<div class="month-grid">';

    var today = new Date();
    var selected = state.selectedDate;
    /* 🔴 23.9 — גודל קבוע (בקשת יועד): לכל היותר MAX_DAY שורות אירועים ביום,
       ואז "+N נוספים". המספר נלקח מ-homeSchedule כשהוא טעון.
       28.9 — שבוע = שורה אחת: 7 תאי יום + שכבת "קפסולות" מעליהם. אירוע של
       כמה ימים הוא קפסולה אחת שנמתחת על פני הימים, ואם הוא חוצה שבוע —
       ממשיך בשורה הבאה (קצה ישר בצד ההמשך). הקפסולות לא תופסות לחיצות —
       הלחיצה עוברת ליום שמתחת. */
    var MAX_DAY = (window.CBA && CBA.homeSchedule && CBA.homeSchedule.MAX_CHIPS) || 2;
    var lastOfMonth = new Date(year, month + 1, 0);
    var weekStart = new Date(startDate);

    while (weekStart <= lastOfMonth) {
      var weekEnd = addDaysEv(weekStart, 6);
      var segs = [];
      monthEvents.forEach(function (e) {
        if (!evOverlaps(e, weekStart, weekEnd)) return;
        var s0 = startOfDay(e.date), l0 = evLastDay(e);
        var s1 = s0 < weekStart ? weekStart : s0, l1 = l0 > weekEnd ? weekEnd : l0;
        segs.push({ e: e, c1: Math.round((s1 - weekStart) / DAY_MS), c2: Math.round((startOfDay(l1) - weekStart) / DAY_MS),
                    before: s0 < weekStart, after: l0 > weekEnd });
      });
      segs.sort(function (a, b) {
        return (a.c1 - b.c1) || ((b.c2 - b.c1) - (a.c2 - a.c1)) ||
          (CATEGORY_ORDER.indexOf(a.e.category) - CATEGORY_ORDER.indexOf(b.e.category)) || (a.e.date - b.e.date);
      });
      var lanes = [], hidden = [0, 0, 0, 0, 0, 0, 0], bars = "";
      segs.forEach(function (g) {
        var lane = -1;
        for (var L = 0; L < MAX_DAY && lane < 0; L++) {
          lanes[L] = lanes[L] || [];
          var free = true;
          for (var c = g.c1; c <= g.c2; c++) if (lanes[L][c]) { free = false; break; }
          if (free) lane = L;
        }
        if (lane < 0) { for (var h = g.c1; h <= g.c2; h++) hidden[h]++; return; }
        for (var c2 = g.c1; c2 <= g.c2; c2++) lanes[lane][c2] = true;
        var cat = CATEGORIES[g.e.category] || CATEGORIES.personal;
        var multi = g.c2 > g.c1 || g.before || g.after;
        bars += '<div class="wk-bar' + (multi ? " is-span" : "") + (g.before ? " cont-before" : "") + (g.after ? " cont-after" : "") +
          '" data-bar-id="' + esc(g.e.id) + '" data-bar-day="' + addDaysEv(weekStart, g.c1).toISOString() +
          '" title="' + esc(g.e.title) + (multi ? " · " + rangeLabel(g.e, true) : "") + '" style="grid-column:' + (g.c1 + 1) + ' / ' + (g.c2 + 2) + ';grid-row:' + (lane + 1) +
          ';background:var(' + cat.cssVar + '-tint)">' +
          (g.before ? "" : '<i style="background:var(' + cat.cssVar + ')"></i>') +
          '<span class="t" dir="auto">' + esc(g.e.title) + '</span></div>';
      });

      html += '<div class="wk-row">';
      for (var i = 0; i < 7; i++) {
        var current = addDaysEv(weekStart, i);
        var isThisMonth = current.getMonth() === month;
        var isToday = current.toDateString() === today.toDateString();
        var isSelected = selected && current.toDateString() === selected.toDateString();
        html += '<div class="day' +
          (!isThisMonth ? " muted" : "") +
          (isToday ? " today" : "") +
          (isSelected ? " selected" : "") +
          '" data-date="' + current.toISOString() + '">' +
          '<span class="num">' + current.getDate() + '</span>' +
          (hidden[i] ? '<div class="more">' + (hidden[i] === 1 ? "+1 נוסף" : "+" + hidden[i] + " נוספים") + '</div>' : "") +
          '</div>';
      }
      html += '<div class="wk-bars">' + bars + '</div></div>';
      weekStart = addDaysEv(weekStart, 7);
    }

    html += '</div>';
    return html;
  }

  function renderSidebarColumn(date, monthEvents) {
    return '<div class="side-col">' +
      renderSidebar(date, monthEvents) +
      renderPrivatePanelDesktop() +
      '</div>';
  }

  function renderSidebar(date, monthEvents) {
    if (!date) {
      return '<aside class="side-panel lg" dir="rtl">' +
        '<h3>בחרו יום</h3><div class="sub">לחצו על יום בלוח כדי לראות פרטים</div>' +
        '</aside>';
    }
    var dayEvents = monthEvents.filter(function (e) { return evCovers(e, date); });

    var html = '<aside class="side-panel lg" dir="rtl">' +
      '<h3>' + HEBREW_WEEKDAYS[date.getDay()] + ', ' + date.getDate() + ' ב' +
      HEBREW_MONTHS[date.getMonth()] + '</h3>' +
      '<div class="sub">יום נבחר</div>';

    if (dayEvents.length === 0) {
      html += '<div class="empty-day">אין אירועים ביום זה</div>';
    } else {
      dayEvents.forEach(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        var rsvpOpen = !!state.rsvpEnabledIds[e.id];
        html += '<div class="ev-row" data-event-id="' + esc(e.id) + '">' +
          '<div class="bar" style="background:var(' + cat.cssVar + ')"></div>' +
          '<div class="time">' + (isMultiDay(e) ? '<span dir="ltr">' + rangeLabel(e, true) + '</span>' : e.allDay === false ? pad2(e.date.getHours()) + ":" + pad2(e.date.getMinutes()) : "כל היום") + '</div>' +
          '<div class="body">' +
          '<div class="ttl2">' + esc(e.title) + '</div>' +
          '<div class="meta">' + esc(cat.he) + (e.location ? " · 📍 " + esc(e.location) : "") + rsvpCountHTML(e.id) + '</div>' +
          extrasHTML(e, false) +
          '<div class="ev-actions">' +
          addCalHTML(e.id) + shareBtnHTML(e.id) +
          rsvpBtnHTML(e, rsvpOpen) + extraActionsHTML(e, false) +
          '</div>' +
          '</div></div>';
      });
    }

    html += '</aside>';
    return html;
  }

  function renderPrivatePanelDesktop() {
    if (!state.privateEvents.length) return "";
    var html = '<div class="private-card lg" dir="rtl">' +
      '<h4><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>האירועים הפרטיים שלי</h4>' +
      '<div class="note">נראה רק אצלך — לא מופיע ללוח הקהילתי</div>';
    state.privateEvents.forEach(function (e) {
      html += '<div class="private-row"><span>🔑</span><b>' + esc(e.title) + ' — ' +
        e.date.getDate() + '.' + (e.date.getMonth() + 1) + '</b></div>';
    });
    html += '</div>';
    return html;
  }

  // כל חיווט-מחדש כאן עובר דרך draw(container) ולא ישירות דרך renderMonthlyView —
  // כך הבאנר וטאב חודשי/שנתי תמיד נשארים, בלי לשכפל את הלוגיקה שבונה אותם.
  function wireMonthlyListeners(container) {
    /* 28.9 — לחיצה על קפסולה: פרטי האירוע בפאנל הצד (היום שלה + הדגשה) */
    container.querySelectorAll(".wk-bar[data-bar-id], .ev-now__i[data-now-id]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        state.selectedDate = b.dataset.barDay ? startOfDay(new Date(b.dataset.barDay)) : startOfDay(new Date());
        state.highlightEventId = b.dataset.barId || b.dataset.nowId;
        draw(container);
      });
    });
    // בחירת יום
    container.querySelectorAll(".day").forEach(function (cell) {
      cell.addEventListener("click", function () {
        var date = new Date(cell.dataset.date);
        state.selectedDate = date;
        draw(container);
      });
    });

    // ניווט חודשים
    var prevBtn = container.querySelector(".btn-prev-month");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
        state.selectedDate = null;
        drawOrReloadYear();
      });
    }

    var nextBtn = container.querySelector(".btn-next-month");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
        state.selectedDate = null;
        drawOrReloadYear();
      });
    }

    wireViewToggle(container);
    wireRsvpButtons(container);
  }

  // חיווט משותף לכפתורי "אישור הגעה" — משמש גם בתצוגה החודשית (דסקטופ)
  // וגם בסדר היומי (מובייל), כך שהלוגיקה כתובה פעם אחת בלבד.
  function wireRsvpButtons(container) {
    wireEventExtras(container);   // 28.9 — הזמנה, לו"ז, עריכת פרטים
    container.querySelectorAll(".btn-rsvp").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation(); // לא לגרום לבחירת יום מחדש בתצוגה החודשית
        var ev = state.eventsById[btn.dataset.eventId];
        if (ev) openRsvpDialog(ev);
      });
    });
  }

  /**
   * תצוגה שנתית
   */
  function renderAnnualView(container, prefixHTML) {
    var year = state.year;
    var allEventsActive = filterByActiveCategories(state.allEvents.filter(function (e) {
      return e.date.getFullYear() === year;
    }));

    var html = (prefixHTML || demoBannerHTML()) +
      '<div class="events-annual" dir="rtl">' +
      '<div class="cal-toolbar">' +
      '<div class="cal-title"><h2>' + year + '</h2></div>' +
      viewToggleHTML() +
      '</div>' +
      chipbarHTML(allEventsActive, false) +
      '<div class="year-grid">';

    for (var m = 0; m < 12; m++) {
      var monthStart = new Date(year, m, 1);
      var monthEnd = new Date(year, m + 1, 0);
      var monthEvents = allEventsActive.filter(function (e) {
        return evOverlaps(e, monthStart, monthEnd);
      }).sort(function (a, b) { return a.date - b.date; });

      var isCurrentMonth = m === new Date().getMonth() && year === new Date().getFullYear();
      html += '<div class="cube' + (isCurrentMonth ? " current" : "") + '" data-month="' + m + '">' +
        '<div class="ch"><span>' + HEBREW_MONTHS[m] + '</span>' +
        (isCurrentMonth ? '<em>עכשיו</em>' : "") +
        '</div>';

      /* 28.9 — אזורים מופרדים בקו (YEAR_SECTIONS). עד 3 שורות לאזור. */
      var CAP = 3, any = false;
      YEAR_SECTIONS.forEach(function (sec) {
        var list = monthEvents.filter(function (e) { return sec.cats.indexOf(e.category) !== -1; });
        if (!list.length) return;
        any = true;
        var rest = list.length - CAP;
        html += '<div class="cube-sec"><div class="cube-sec__h">' + esc(sec.he) + '</div><ul>';
        list.slice(0, CAP).forEach(function (e) {
          var cat = CATEGORIES[e.category] || CATEGORIES.personal;
          var crosses = startOfDay(e.date) < monthStart || evLastDay(e) > monthEnd;
          html += '<li><i style="background:var(' + cat.cssVar + ')"></i>' +
            '<span class="tt">' + esc(e.title) + '</span>' +
            '<span class="dd" dir="ltr">' + rangeLabel(e, crosses) + '</span></li>';
        });
        html += '</ul>' + (rest > 0 ? '<div class="more">+' + rest + ' נוספים</div>' : "") + '</div>';
      });
      if (!any) html += '<ul><li class="no-events"><span class="tt" style="color:var(--text-muted)">אין אירועים</span></li></ul>';
      html += '</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
    wireAnnualListeners(container);
    wireViewToggle(container);
    wireChipbar(container);
    syncCanopy();
  }

  // קליק על קובייה שנתית -> קפיצה לתצוגה החודשית של אותו חודש (לפי האפיון)
  function wireAnnualListeners(container) {
    container.querySelectorAll(".cube[data-month]").forEach(function (cube) {
      cube.addEventListener("click", function () {
        var m = parseInt(cube.dataset.month, 10);
        state.currentMonth = new Date(state.year, m, 1);
        state.selectedDate = null;
        state.viewMode = "monthly";
        draw(container);
      });
    });
  }

  /**
   * תצוגה מובייל (סדר יומי)
   */
  function renderMobileView(container) {
    /* EB1 (גל 3) — האיפוס של "הצגת אירועים שעברו" עבר לכניסה למסך ולמעבר
       חודש. כאן הוא מחק גם את מה שקישור ישיר ביקש (אירוע שעבר לא הוצג). */
    var html = demoBannerHTML() +
      '<div class="events-mobile" dir="rtl">' +
      renderPrivateEventsPanel() +
      renderMonthSelector() +
      chipbarHTML(monthEventsRaw(), true) +
      renderAgendaList() +
      '</div>';

    container.innerHTML = html;
    wireMobileListeners(container);
    syncCanopy();
    /* E13 (גל 3) — פס החודשים נפתח על החודש המוצג (עד היום: תמיד על ינואר) */
    var on = container.querySelector(".m-strip .p.on");
    var strip = on && on.parentNode;
    if (strip && strip.scrollWidth > strip.clientWidth) {
      try {
        var r = on.getBoundingClientRect(), sr = strip.getBoundingClientRect();
        strip.scrollLeft += (r.left + r.width / 2) - (sr.left + sr.width / 2);
      } catch (e) { /* סביבת בדיקה */ }
    }
  }

  function monthEventsRaw() {
    var month = state.currentMonth.getMonth();
    var year = state.currentMonth.getFullYear();
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0);
    return state.allEvents.filter(function (e) { return evOverlaps(e, monthStart, monthEnd); });
  }

  function renderPrivateEventsPanel() {
    if (!state.privateEvents.length) return "";
    var html = '<div class="private-card lg m-private">' +
      '<h4><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>האירועים הפרטיים שלי</h4>';
    state.privateEvents.forEach(function (e) {
      html += '<div class="private-row"><span>🔑</span><b>' + esc(e.title) + ' · ' +
        e.date.getDate() + '.' + (e.date.getMonth() + 1) + '</b></div>';
    });
    html += '</div>';
    return html;
  }

  function renderMonthSelector() {
    var html = '<div class="m-strip" dir="rtl">';
    for (var m = 0; m < 12; m++) {
      var isActive = m === state.currentMonth.getMonth() &&
        state.year === state.currentMonth.getFullYear();
      html += '<button type="button" class="p' +
        (isActive ? " on" : "") +
        '" data-month="' + m + '">' +
        HEBREW_MONTHS_SHORT[m] +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderAgendaList() {
    var monthEvents = filterByActiveCategories(monthEventsRaw()).sort(function (a, b) {
      return a.date - b.date;
    });

    var today = startOfDay(new Date());
    var isCur = state.currentMonth.getMonth() === today.getMonth() && state.currentMonth.getFullYear() === today.getFullYear();
    /* 28.9 — אירוע של כמה ימים שקורה היום עולה לפס "עכשיו" ולא חוזר ברשימה */
    var spans = isCur ? ongoingSpans(monthEvents, today) : [];
    var visibleEvents = (state.showAllMonth ? monthEvents :
      monthEvents.filter(function (e) { return evLastDay(e) >= today; }))
      .filter(function (e) { return spans.indexOf(e) === -1; });
    var hiddenCount = monthEvents.filter(function (e) { return evLastDay(e) < today; }).length;
    if (state.showAllMonth) hiddenCount = 0;

    var html = '<div class="agenda-list m-list" dir="rtl">' + nowStripHTML(spans, today, false);

    if (visibleEvents.length === 0) {
      if (!spans.length) html += '<div class="empty-agenda">אין אירועים קרובים בחודש זה</div>';
    } else {
      var grouped = {};
      var agFrom = new Date(state.currentMonth.getFullYear(), state.currentMonth.getMonth(), 1);
      if (!state.showAllMonth && today > agFrom) agFrom = today;
      visibleEvents.forEach(function (e) {
        var key = (startOfDay(e.date) < agFrom ? agFrom : startOfDay(e.date)).toDateString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });

      Object.keys(grouped).sort(function (a, b) { return new Date(a) - new Date(b); }).forEach(function (key) {
        var date = new Date(key);
        var isToday = date.toDateString() === today.toDateString();
        html += '<div class="m-day' + (isToday ? " is-today" : "") + '">' +
          '<div class="m-dn"><small>' + (isToday ? "היום" : HEBREW_WEEKDAYS[date.getDay()]) + '</small>' +
          '<b>' + date.getDate() + '.' + (date.getMonth() + 1) + '</b></div><div class="m-evs">';

        grouped[key].forEach(function (e) {
          var cat = CATEGORIES[e.category] || CATEGORIES.personal;
          var rsvpOpen = !!state.rsvpEnabledIds[e.id];
          var meta = [];
          if (e.allDay === false) meta.push(pad2(e.date.getHours()) + ":" + pad2(e.date.getMinutes()));
          if (isMultiDay(e)) meta.push('<span dir="ltr">' + rangeLabel(e, true) + '</span>');
          if (e.location) meta.push("📍 " + esc(e.location));
          var actions = (e.category !== "personal" ? addCalHTML(e.id) + shareBtnHTML(e.id) : "") +
            (rsvpOpen ? "" : rsvpBtnHTML(e, false)) + extraActionsHTML(e, true) + rsvpCountHTML(e.id);
          html += '<div class="ev-row m-it" data-event-id="' + esc(e.id) + '">' +
            '<div class="m-it__l"><i class="m-dot" style="background:var(' + cat.cssVar + ')"></i>' +
            '<span class="m-it__t" dir="auto">' + esc(e.title) + '</span>' +
            (rsvpOpen ? '<button type="button" class="btn-rsvp m-tag" data-event-id="' + esc(e.id) + '">אישור הגעה</button>' : "") +
            '</div>' +
            (meta.length ? '<div class="m-it__m">' + meta.join(" · ") + '</div>' : "") +
            extrasHTML(e, true) +
            (actions ? '<div class="ev-actions">' + actions + '</div>' : "") +
            '</div>';
        });
        html += '</div></div>';
      });
    }

    if (hiddenCount > 0) {
      html += '<button type="button" class="btn-show-all-month">הצגת ' + hiddenCount + ' אירועים שכבר עברו החודש</button>';
    }
    html += '</div>';
    return html;
  }

  function wireMobileListeners(container) {
    container.querySelectorAll(".p[data-month]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var month = parseInt(btn.dataset.month, 10);
        state.currentMonth = new Date(state.year, month, 1);
        state.showAllMonth = false;
        renderMobileView(container);
      });
    });

    var showAllBtn = container.querySelector(".btn-show-all-month");
    if (showAllBtn) {
      showAllBtn.addEventListener("click", function () {
        state.showAllMonth = true;
        renderMobileView(container);
      });
    }

    /* 28.9 — שורה נקייה; לחיצה עליה פותחת את הפעולות (יומן, שיתוף, ניהול) */
    container.querySelectorAll(".m-it").forEach(function (row) {
      row.addEventListener("click", function (ev) {
        if (ev.target.closest("button, a, summary, details, .ev-inv")) return;
        row.classList.toggle("is-open");
      });
    });

    wireChipbar(container);
    wireRsvpButtons(container);
    wireAddCalButtons(container);
    wireShareButtons(container);
    applyHighlight(container);
  }

  /* קישור ישיר: אחרי הציור מגלגלים לשורת האירוע ומהבהבים אותה פעם אחת.
     מנקים את המזהה אחרי הפעם הראשונה, כדי שניווט רגיל בלוח לא יחזור אליו. */
  function applyHighlight(container) {
    var id = state.highlightEventId;
    if (!id) return;
    var row = container.querySelector('.ev-row[data-event-id="' + id.replace(/"/g, '\\"') + '"]');
    if (!row) return;
    state.highlightEventId = null;
    row.classList.add("is-linked");
    try { row.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
    setTimeout(function () { row.classList.remove("is-linked"); }, 4000);
  }

  /* ============================================================================
   *  RSVP לאירוע — "אישור הגעה"   (2026-09-23, אפיון events-rsvp-spec)
   * ----------------------------------------------------------------------------
   *  קריאה/כתיבה ישירה מהדפדפן ל-Firestore (מודל ב' — ר' cba-hybrid-architecture),
   *  לא דרך Apps Script: eventRSVP/{eventId} הוא מסמך ההגדרה (פתוח/סגור,
   *  נכתב ע"י מנהל בלבד), eventRSVPResponses/{eventId_familyId} היא התגובה של
   *  כל משפחה. שני האוספים גדורים ע"י firestore.rules, לא ע"י הקוד כאן —
   *  זה רק ה-UI. אין כאן שם/אימייל של אף אחד: שמות משפחה מגיעים בנפרד דרך
   *  CBA.data.getRsvpFamilyNames (גשר צד-שרת, כי אסור לשמור PII ב-Firestore).
   *
   *  כפתור "אישור הגעה" עצמו מוצג רק כשה-eventId נמצא ב-state.rsvpEnabledIds
   *  (נטען פעם אחת בכניסה למסך ע"י loadRsvpEnabledIds) — לא כברירת מחדל.
   *  הדיאלוג עצמו עדיין קורא את eventRSVP/{id} מחדש כדי לתמוך במנהל שמדליק/
   *  מכבה את המעקב תוך כדי שהדיאלוג פתוח.
   * ========================================================================== */

  /* מי מנהל את לוח האירועים (פתיחה/סגירה של מעקב הגעה, רשימת המאשרים):
     הרשאת "תרבות" (23.9.26, הכרעת יועד — התחום של לוח האירועים והסקרים) או
     מנהל-על. עד היום זה היה "כל הרשאת ניהול שהיא". חייב להתאים ל-PERM_CULTURE
     ב-Code.gs ולכלל eventRSVP ב-firestore.rules — ההסתרה כאן היא נוחות בלבד,
     המידור האמיתי הוא בכללי Firestore. CBA.perms מתמלא ב-app.js. */
  var PERM_CULTURE = "תרבות";
  /* ==========================================================================
   *  פרטי אירוע: הזמנה (תמונה) + לו"ז פנימי   (28.9.26, אפיון wave4-events)
   * --------------------------------------------------------------------------
   *  🔑 מפתח = מזהה האירוע ביומן גוגל. הוא לא משתנה כשמזיזים תאריך ביומן —
   *     ולכן ההזמנה והלו"ז "זזים" עם האירוע מעצמם, בלי לכתוב ליומן.
   *     ⚠️ אירוע חוזר ביומן חולק מזהה אחד ⇒ כל המופעים יקבלו אותה הזמנה.
   *  שני אוספים ב-Firestore (מודל ב' — הדפדפן כותב, הכלל אוכף):
   *    eventInfo/{eventId}   — קטן: לו"ז, hasImage, שנה. נקרא לכל הלוח בשאילתה אחת.
   *    eventImages/{eventId} — כבד (~200-600KB): התמונה עצמה. נקרא רק כשהשורה
   *                            נראית במסך / כשפותחים את ההזמנה.
   *  כתיבה: הרשאת "תרבות" או מנהל-על (hasPerm בכלל; viewerIsAdmin כאן = נוחות).
   *  AI: קריאת הלו"ז מהתמונה דרך ה-Worker (cloudflare/door-worker.js, op=eventSchedule).
   *      התוצאה נכנסת לתיבת הטקסט בלבד — נשמרת רק בלחיצה על "שמירה".
   * ========================================================================== */
  var INFO_COL = "eventInfo", IMG_COL = "eventImages";
  /* ⚠️ אותה כתובת כמו WORKER_URL ב-js/data/door.js — שינוי שם ⇒ שינוי כאן. */
  var AI_WORKER_URL = "https://cba-door.gizbar30.workers.dev/";
  var IMG_MAX_CHARS = 900000;          // מסמך Firestore עד 1MiB; משאירים מרווח
  var imgCache = {};                   // eventId -> dataURL ("" = אין)

  function loadEventInfo(year, callback) {
    state.eventInfo = {};
    if (!CBA.fb || !CBA.fb.queryCollection) return callback();
    CBA.fb.queryCollection(INFO_COL, [["year", year]], function (err, rows) {
      if (!err && rows) rows.forEach(function (r) { if (r && r.id) state.eventInfo[r.id] = r; });
      callback();
    });
  }

  function canHaveInfo(e) { return e && e.category !== "birthdays" && e.category !== "personal"; }

  /* "20:30 — התכנסות" / "20:30 התכנסות" / "פעילות" -> {time, text} */
  function scheduleLines(text) {
    return String(text || "").split(/\r?\n/).map(function (l) {
      l = l.trim(); if (!l) return null;
      var m = l.match(/^(\d{1,2}[:.]\d{2})\s*[—–\-·:]?\s*(.*)$/);
      return m ? { time: m[1].replace(".", ":"), text: m[2] } : { time: "", text: l };
    }).filter(Boolean);
  }
  function scheduleHTML(text) {
    var items = scheduleLines(text);
    if (!items.length) return "";
    return '<ol class="ev-sch__list">' + items.map(function (i) {
      return '<li>' + (i.time ? '<b dir="ltr">' + esc(i.time) + '</b>' : '<b></b>') +
        '<span dir="auto">' + esc(i.text) + '</span></li>';
    }).join("") + '</ol>';
  }

  /* מה מוצג מתחת לכותרת האירוע. במובייל ההזמנה ברצף לכרטיס (היא ההזמנה
     עצמה); במחשב — כפתור "הזמנה" בשורת הפעולות (ר' extraActionsHTML). */
  function extrasHTML(e, mobile) {
    var inf = state.eventInfo && state.eventInfo[e.id];
    if (!inf) return "";
    var h = "";
    if (inf.hasImage && mobile) {
      h += '<button type="button" class="ev-inv" data-inv="' + esc(e.id) + '" aria-label="פתיחת ההזמנה במסך מלא">' +
        '<span class="ev-inv__ph">טוען את ההזמנה…</span></button>';
    }
    if (inf.schedule) {
      h += '<details class="ev-sch"><summary>לו״ז האירוע</summary>' + scheduleHTML(inf.schedule) + '</details>';
    }
    return h;
  }
  function extraActionsHTML(e, mobile) {
    var inf = state.eventInfo && state.eventInfo[e.id];
    var h = "";
    if (!mobile && inf && inf.hasImage) {
      h += '<button type="button" class="ev-inv-btn" data-inv-open="' + esc(e.id) + '">הזמנה</button>';
    }
    if (canHaveInfo(e) && viewerIsAdmin()) {
      /* EA1 (גל 3, 1.10.26) — "הודעות ותזכורות" ישירות מהשורה. עד היום רק דרך
         "עריכת פרטים" ← קישור, והמעבר מחק עריכה שלא נשמרה. */
      h += '<button type="button" class="ev-msg-btn" data-ev-msg="' + esc(e.id) + '">הודעה לתושבים</button>';
      h += '<button type="button" class="ev-edit-btn" data-ev-edit="' + esc(e.id) + '">עריכת פרטים</button>';
    }
    return h;
  }

  function loadImage(id, cb) {
    if (imgCache[id] != null) return cb(imgCache[id]);
    if (!CBA.fb || !CBA.fb.readDoc) return cb("");
    CBA.fb.readDoc(IMG_COL, id, function (err, d) {
      var src = (!err && d && typeof d.image === "string" && d.image.indexOf("data:image/") === 0) ? d.image : "";
      if (!err) imgCache[id] = src;       // כשל רשת לא נשמר במטמון — ננסה שוב בפעם הבאה
      cb(src);
    });
  }

  function fillInvitation(el) {
    var id = el.getAttribute("data-inv");
    loadImage(id, function (src) {
      if (!el.isConnected) return;
      el.innerHTML = src ? '<img src="' + esc(src) + '" alt="ההזמנה לאירוע" loading="lazy">'
                         : '<span class="ev-inv__ph">ההזמנה לא נטענה — לחיצה לנסות שוב</span>';
      el.classList.toggle("is-loaded", !!src);
    });
  }

  function openInvitation(id) {
    var ev = state.eventsById[id]; if (!ev) return;
    var inf = (state.eventInfo && state.eventInfo[id]) || {};
    CBA.ui.dialog({
      title: ev.title,
      html: '<div class="ev-inv-dlg"><div class="ev-inv-dlg__img">טוען…</div>' +
            (inf.schedule ? '<div class="ev-inv-dlg__sch"><b>לו״ז האירוע</b>' + scheduleHTML(inf.schedule) + '</div>' : "") +
            '</div>',
      okText: "סגירה",
      onMount: function (wrap) {
        var box = wrap.querySelector(".ev-inv-dlg__img");
        loadImage(id, function (src) {
          box.innerHTML = src ? '<img src="' + esc(src) + '" alt="ההזמנה לאירוע">' : "ההזמנה לא נטענה. אפשר לנסות שוב בעוד רגע.";
        });
      }
    });
  }

  /* חיווט — נקרא מתוך wireRsvpButtons, כך שהוא רץ גם בתצוגה החודשית וגם במובייל. */
  function wireEventExtras(container) {
    var invs = container.querySelectorAll(".ev-inv[data-inv]");
    if (invs.length && "IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { io.unobserve(en.target); fillInvitation(en.target); } });
      }, { rootMargin: "300px" });
      invs.forEach(function (el) { io.observe(el); });
    } else invs.forEach(fillInvitation);

    container.querySelectorAll(".ev-inv[data-inv], [data-inv-open]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = b.getAttribute("data-inv") || b.getAttribute("data-inv-open");
        if (b.classList.contains("ev-inv") && !b.classList.contains("is-loaded")) {
          delete imgCache[id]; return fillInvitation(b);
        }
        openInvitation(id);
      });
    });
    container.querySelectorAll("[data-ev-msg]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var ev = state.eventsById[b.getAttribute("data-ev-msg")];
        if (ev) openEventMessages(ev);
      });
    });
    container.querySelectorAll("[data-ev-edit]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var ev = state.eventsById[b.getAttribute("data-ev-edit")];
        if (ev) openEventEditor(ev);
      });
    });
  }

  /* כיווץ עד שהתמונה נכנסת במסמך אחד. מתחילים בצלע 1400 ואיכות 0.8
     ויורדים בשלבים — הזמנה היא טקסט על רקע, ו-0.6 עדיין קריא לגמרי. */
  function shrinkForDoc(file, cb) {
    if (!file || !/^image\//.test(file.type || "")) return cb(null, "זה לא קובץ תמונה");
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var steps = [[1400, 0.8], [1400, 0.7], [1200, 0.65], [1000, 0.6], [900, 0.55]];
      var out = null;
      for (var i = 0; i < steps.length; i++) {
        var k = Math.min(1, steps[i][0] / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
        var cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(img.naturalWidth * k));
        cv.height = Math.max(1, Math.round(img.naturalHeight * k));
        var cx = cv.getContext("2d");
        cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);   // PNG שקוף -> רקע לבן
        cx.drawImage(img, 0, 0, cv.width, cv.height);
        out = cv.toDataURL("image/jpeg", steps[i][1]);
        if (out.length <= IMG_MAX_CHARS) break;
      }
      URL.revokeObjectURL(url);
      if (!out || out.length > IMG_MAX_CHARS) return cb(null, "התמונה גדולה מדי גם אחרי כיווץ");
      cb(out);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null, "לא הצלחנו לקרוא את התמונה"); };
    img.src = url;
  }

  function dm(d) { return d.getDate() + "." + (d.getMonth() + 1); }

  /* קריאה ל-Worker. כשל כלשהו -> cb(null, הודעה) — אין מסלול גיבוי ב-Apps
     Script בכוונה: זו פעולת נוחות, והמנהל תמיד יכול להקליד את הלו"ז בעצמו. */
  function aiReadSchedule(image, cb) {
    if (!(CBA.fb && CBA.fb.idToken)) return cb(null, "ההתחברות ל-Firebase לא הושלמה");
    CBA.fb.idToken(function (err, tok) {
      if (err || !tok) return cb(null, "ההתחברות ל-Firebase לא הושלמה");
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
      fetch(AI_WORKER_URL, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "eventSchedule", idToken: tok, image: image }),
        signal: ctl ? ctl.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (res) { clearTimeout(timer); res && res.ok ? cb(res) : cb(null, (res && res.error) || "הקריאה נכשלה"); })
        .catch(function () { clearTimeout(timer); cb(null, "השרת לא ענה. אפשר לנסות שוב או להקליד ידנית."); });
    });
  }

  function openEventEditor(ev) {
    if (!CBA.fb || !CBA.fb.mergeDoc) return;
    var inf = (state.eventInfo && state.eventInfo[ev.id]) || {};
    var cur = { image: "", orig: "", changed: false, loaded: false };

    CBA.ui.dialog({
      title: "עריכת פרטי אירוע — " + ev.title,
      sticky: true,
      cancelText: "ביטול",
      okText: "שמירה",
      html:
        '<div class="evx" dir="rtl">' +
          '<div class="evx-note">שם, תאריך ומיקום מגיעים מיומן גוגל ולא נערכים כאן.</div>' +
          '<div class="evx-img">' +
            '<div class="evx-thumb" data-evx-thumb>טוען…</div>' +
            '<div class="evx-img-acts">' +
              '<label class="evx-btn">העלאת הזמנה<input type="file" accept="image/*" hidden data-evx-file></label>' +
              '<button type="button" class="evx-btn" data-evx-ai>קריאת הלו״ז מהתמונה</button>' +
              '<button type="button" class="evx-btn evx-btn--quiet" data-evx-del hidden>הסרת התמונה</button>' +
            '</div>' +
          '</div>' +
          '<div class="evx-status" data-evx-status hidden></div>' +
          '<label class="evx-lbl" for="evx-sch">לו״ז פנימי <small>שורה לכל פריט, למשל: 20:30 — התכנסות</small></label>' +
          '<textarea id="evx-sch" rows="6" maxlength="2000" data-evx-sch></textarea>' +
          '<label class="evx-check" data-evx-notify hidden><input type="checkbox" checked data-evx-notify-cb> לשלוח לתושבים התראה על ההזמנה</label>' +
          '<div class="evx-links">' +
            '<button type="button" class="evx-link" data-evx-rsvp>ניהול אישור הגעה ←</button>' +
            '<button type="button" class="evx-link" data-evx-msgs>הודעות ותזכורות לתושבים ←</button>' +
          '</div>' +
          '<div class="evx-err" data-evx-err hidden></div>' +
        '</div>',
      onMount: function (wrap, close) {
        var $ = function (s) { return wrap.querySelector(s); };
        var thumb = $("[data-evx-thumb]"), fileIn = $("[data-evx-file]"), aiBtn = $("[data-evx-ai]"),
            delBtn = $("[data-evx-del]"), sch = $("[data-evx-sch]"), status = $("[data-evx-status]");
        sch.value = inf.schedule || "";

        function paintThumb() {
          thumb.innerHTML = cur.image ? '<img src="' + esc(cur.image) + '" alt="">' : "אין הזמנה";
          /* התראה על הזמנה — רק כשנוספת הזמנה לאירוע שלא הייתה לו (השרת גם הוא
             שולח פעם אחת בלבד לאירוע). מנהל שמעלה מוקדם יכול לבטל את הסימון. */
          $("[data-evx-notify]").hidden = !(cur.image && !inf.hasImage);
          delBtn.hidden = !cur.image;
          aiBtn.disabled = !cur.image;
        }
        function say(msg, kind) {
          status.hidden = !msg; status.textContent = msg || "";
          status.className = "evx-status" + (kind ? " is-" + kind : "");
        }
        if (inf.hasImage) {
          loadImage(ev.id, function (src) { cur.image = cur.orig = src; cur.loaded = true; paintThumb(); });
        } else { cur.loaded = true; paintThumb(); }

        fileIn.addEventListener("change", function () {
          var f = fileIn.files && fileIn.files[0];
          if (!f) return;
          say("מכווץ את התמונה…");
          shrinkForDoc(f, function (out, err) {
            fileIn.value = "";
            if (!out) return say(err, "err");
            cur.image = out; cur.changed = true; paintThumb();
            say("התמונה מוכנה (" + Math.round(out.length * 0.75 / 1024) + "KB). אפשר לקרוא ממנה את הלו״ז.");
          });
        });
        delBtn.addEventListener("click", function () { cur.image = ""; cur.changed = true; paintThumb(); say(""); });

        aiBtn.addEventListener("click", function () {
          if (!cur.image) return;
          function run() {
            aiBtn.disabled = true; say("קורא את הלו״ז מהתמונה…");
            aiReadSchedule(cur.image, function (res, err) {
              aiBtn.disabled = false;
              if (!res) return say(err, "err");
              var items = Array.isArray(res.items) ? res.items : [];
              if (!items.length) return say("לא נמצא לו״ז בתמונה. אפשר להקליד ידנית.", "warn");
              sch.value = items.map(function (i) { return (i.time ? i.time + " — " : "") + (i.text || ""); }).join("\n");
              /* השוואה ליומן — אזהרה בלבד, לא תיקון אוטומטי */
              var warn = [];
              var md = String(res.date || "").match(/(\d{1,2})[.\/](\d{1,2})/);
              if (md && (+md[1] !== ev.date.getDate() || +md[2] !== ev.date.getMonth() + 1)) {
                warn.push("בהזמנה כתוב " + res.date + " וביומן " + dm(ev.date));
              }
              if (res.location && ev.location && ev.location.indexOf(res.location) === -1 && res.location.indexOf(ev.location) === -1) {
                warn.push("מיקום בהזמנה: " + res.location + " · ביומן: " + ev.location);
              }
              say("מולא מהתמונה — לבדוק ולתקן לפני שמירה." + (warn.length ? " ⚠ " + warn.join(" · ") : ""), "warn");
            });
          }
          if (sch.value.trim() && CBA.ui.confirm) {
            CBA.ui.confirm("הטקסט שבתיבה יוחלף במה שייקרא מהתמונה.",
                           { title: "להחליף את הלו״ז הקיים?", okText: "להחליף" }).then(function (ok) { if (ok) run(); });
          } else run();
        });

        $("[data-evx-rsvp]").addEventListener("click", function () { close(false); setTimeout(function () { openRsvpDialog(ev); }, 220); });
        $("[data-evx-msgs]").addEventListener("click", function () { close(false); setTimeout(function () { openEventMessages(ev); }, 220); });
      },
      onOk: function (wrap, close) {
        var errBox = wrap.querySelector("[data-evx-err]"), ok = wrap.querySelector('[data-dlg="ok"]');
        var schedule = wrap.querySelector("[data-evx-sch]").value.trim().slice(0, 2000);
        var cb = wrap.querySelector("[data-evx-notify-cb]");
        var announce = !!(cur.image && !inf.hasImage && cb && cb.checked);
        if (!cur.loaded) return;
        ok.disabled = true; ok.textContent = "שומר…"; errBox.hidden = true;
        var uid = CBA.fb.uid && CBA.fb.uid();
        function fail(e) {
          ok.disabled = false; ok.textContent = "שמירה";
          errBox.hidden = false;
          errBox.textContent = "השמירה נכשלה" + (e && e.code === "permission-denied" ? " — אין הרשאת \"תרבות\"" : "") + ". אפשר לנסות שוב.";
        }
        function saveInfo() {
          var doc = { year: ev.date.getFullYear(), category: String(ev.category || ""), schedule: schedule,
                      hasImage: !!cur.image, updatedByUid: uid, updatedAt: CBA.fb.serverNow() };
          CBA.fb.mergeDoc(INFO_COL, ev.id, doc, function (e) {
            if (e) return fail(e);
            state.eventInfo[ev.id] = { id: ev.id, schedule: schedule, hasImage: !!cur.image, year: doc.year };
            imgCache[ev.id] = cur.image;
            close(true);
            if (CBA.ui.toast) CBA.ui.toast(announce ? "נשמר — ההתראה על ההזמנה יוצאת לתושבים" : "פרטי האירוע נשמרו", "ok");
            if (announce) { try { CBA.sheets.postRead("notifyEventInvite", { eventId: ev.id }, function () {}); } catch (e2) {} }
            if (activeContainer && activeContainer.isConnected) setTimeout(function () { draw(activeContainer); }, 200);
          });
        }
        /* התמונה קודם, ואז המסמך הקטן: אם התמונה נכשלה — hasImage לא הודלק,
           ואף אחד לא רואה "הזמנה" שלא קיימת. */
        if (!cur.changed) return saveInfo();
        if (cur.image) {
          CBA.fb.mergeDoc(IMG_COL, ev.id, { image: cur.image, updatedByUid: uid, updatedAt: CBA.fb.serverNow() },
            function (e) { e ? fail(e) : saveInfo(); });
        } else {
          CBA.fb.deleteDoc(IMG_COL, ev.id, function (e) { e ? fail(e) : saveInfo(); });
        }
      }
    });
  }

  /* ==========================================================================
   *  הודעות ותזכורות לתושבים   (28.9.26)
   * --------------------------------------------------------------------------
   *  Firestore eventMessages/{id}. הדפדפן יוצר (status='pending') ומבטל;
   *  Apps Script שולח (טריגר כל 15 דקות, או מיד ב"שליחה עכשיו") ומסמן.
   *  ר' eventMessagesJob_ ב-Notify.gs וכלל eventMessages ב-firestore.rules.
   * ========================================================================== */
  var MSG_COL = "eventMessages";
  var MSG_STATUS = { pending: "ממתינה", sending: "בשליחה", sent: "נשלחה", canceled: "בוטלה", expired: "לא נשלחה (עבר הזמן)" };
  var HEB_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "שבת"];

  function whenLabel(ms) {
    var d = new Date(ms);
    return "יום " + HEB_DAYS[d.getDay()] + " " + dm(d) + " · " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }
  function atLocal(day, h, m) { var d = new Date(day); d.setHours(h, m || 0, 0, 0); return d.getTime(); }

  /* קיצורי זמן לפי האירוע. רק מה שעוד לא עבר, ורק בשעות 07:00–21:45. */
  function msgPresets(ev) {
    var now = Date.now(), out = [];
    var dayBefore = new Date(ev.date); dayBefore.setDate(dayBefore.getDate() - 1);
    out.push({ id: "dayBefore", label: "יום לפני, 10:00", ms: atLocal(dayBefore, 10) });
    out.push({ id: "sameDay", label: "ביום האירוע, 09:00", ms: atLocal(ev.date, 9) });
    if (ev.allDay === false) {
      var twoH = ev.date.getTime() - 2 * 3600000;
      var h = new Date(twoH).getHours();
      if (h >= 7 && h <= 21) out.push({ id: "twoHours", label: "שעתיים לפני (" + pad2(h) + ":" + pad2(new Date(twoH).getMinutes()) + ")", ms: twoH });
    }
    return out.filter(function (p) { return p.ms > now + 5 * 60000; });
  }

  function msgRowHTML(m) {
    var st = MSG_STATUS[m.status] || m.status;
    var aud = m.audience === "attending" ? "למי שאישר" : (m.audience === "pending" ? "למי שלא ענה" : "לכולם");
    var extra = m.status === "sent" && typeof m.sentPush === "number" ? " · " + m.sentPush + " מכשירים" : "";
    return '<li class="evm-item is-' + esc(m.status) + '">' +
      '<div class="evm-item__top"><span class="evm-pill">' + esc(st) + '</span>' +
        '<span class="evm-when">' + esc(whenLabel(m.sendAtMs)) + ' · ' + aud + esc(extra) + '</span>' +
        (m.status === "pending" ? '<button type="button" class="evm-cancel" data-evm-cancel="' + esc(m.id) + '">ביטול</button>' : "") +
      '</div><div class="evm-text" dir="auto">' + esc(m.text) + '</div></li>';
  }

  function openEventMessages(ev) {
    if (!CBA.fb || !CBA.fb.createDoc) return;
    var rsvpOpen = !!state.rsvpEnabledIds[ev.id];
    var presets = msgPresets(ev);
    var hours = [];
    for (var h = 7; h <= 21; h++) [0, 15, 30, 45].forEach(function (mm) { hours.push(pad2(h) + ":" + pad2(mm)); });

    CBA.ui.dialog({
      title: "הודעות ותזכורות — " + ev.title,
      sticky: true,
      okText: "סגירה",
      html:
        '<div class="evm" dir="rtl">' +
          '<ul class="evm-list" data-evm-list><li class="evm-empty">טוען…</li></ul>' +
          '<div class="evm-form">' +
            '<label class="evx-lbl" for="evm-text">הודעה חדשה <small>עד 240 תווים. תופיע כהתראה בטלפון, עם שם האירוע ככותרת.</small></label>' +
            '<textarea id="evm-text" rows="3" maxlength="240" data-evm-text placeholder="למשל: מזכירים — מחר ב-20:30 במועדון, מביאים כיסא 🙂"></textarea>' +
            '<div class="evm-count" data-evm-count>0/240</div>' +
            '<div class="evm-lbl">למי</div>' +
            '<div class="evm-seg" data-evm-aud>' +
              '<button type="button" class="is-on" data-v="all">כל התושבים</button>' +
              (rsvpOpen ? '<button type="button" data-v="attending">מי שאישר הגעה</button>' +
                          '<button type="button" data-v="pending">מי שעוד לא ענה</button>' : "") +
            '</div>' +
            '<div class="evm-lbl">מתי</div>' +
            '<div class="evm-seg evm-seg--wrap" data-evm-when>' +
              '<button type="button" class="is-on" data-v="now">עכשיו</button>' +
              presets.map(function (p) { return '<button type="button" data-v="' + p.id + '">' + esc(p.label) + '</button>'; }).join("") +
              '<button type="button" data-v="custom">מועד אחר…</button>' +
            '</div>' +
            '<div class="evm-custom" data-evm-custom hidden>' +
              '<input type="date" data-evm-date>' +
              '<select data-evm-time>' + hours.map(function (t) { return '<option' + (t === "10:00" ? " selected" : "") + '>' + t + '</option>'; }).join("") + '</select>' +
            '</div>' +
            '<div class="evm-note">מתוזמנת יוצאת עד רבע שעה אחרי המועד. בשעות השקט של מרכז ההתראות — בבוקר.</div>' +
            '<div class="evx-err" data-evm-err hidden></div>' +
            '<button type="button" class="evm-send" data-evm-send>שליחה</button>' +
          '</div>' +
        '</div>',
      onMount: function (wrap) {
        var $ = function (s) { return wrap.querySelector(s); };
        var list = $("[data-evm-list]"), txt = $("[data-evm-text]"), err = $("[data-evm-err]"), send = $("[data-evm-send]");
        var sel = { aud: "all", when: "now" };
        var dateIn = $("[data-evm-date]");
        var dflt = new Date(ev.date); dflt.setDate(dflt.getDate() - 1);
        if (dflt < new Date()) dflt = new Date();
        dateIn.value = dflt.getFullYear() + "-" + pad2(dflt.getMonth() + 1) + "-" + pad2(dflt.getDate());

        function refresh() {
          CBA.fb.queryCollection(MSG_COL, [["eventId", ev.id]], function (e, rows) {
            if (!list.isConnected) return;
            if (e) { list.innerHTML = '<li class="evm-empty">לא הצלחנו לטעון את ההודעות</li>'; return; }
            rows = (rows || []).sort(function (a, b) { return a.sendAtMs - b.sendAtMs; });
            list.innerHTML = rows.length ? rows.map(msgRowHTML).join("") : '<li class="evm-empty">עוד לא נשלחו הודעות על האירוע הזה</li>';
            list.querySelectorAll("[data-evm-cancel]").forEach(function (b) {
              b.addEventListener("click", function () {
                b.disabled = true;
                CBA.fb.mergeDoc(MSG_COL, b.getAttribute("data-evm-cancel"), { status: "canceled" }, function (e2) {
                  if (e2 && CBA.ui.toast) CBA.ui.toast("הביטול נכשל — ייתכן שההודעה כבר יצאה", "warn");
                  refresh();
                });
              });
            });
          });
        }
        refresh();

        txt.addEventListener("input", function () { $("[data-evm-count]").textContent = txt.value.length + "/240"; });
        function seg(box, key, onPick) {
          box.addEventListener("click", function (e) {
            var b = e.target.closest("button[data-v]"); if (!b) return;
            box.querySelectorAll("button").forEach(function (x) { x.classList.toggle("is-on", x === b); });
            sel[key] = b.getAttribute("data-v");
            if (onPick) onPick(sel[key]);
          });
        }
        seg($("[data-evm-aud]"), "aud");
        seg($("[data-evm-when]"), "when", function (v) {
          $("[data-evm-custom]").hidden = v !== "custom";
          send.textContent = v === "now" ? "שליחה" : "תזמון";
        });

        function sendAt() {
          if (sel.when === "now") return Date.now();
          if (sel.when === "custom") {
            var t = $("[data-evm-time]").value.split(":");
            var d = dateIn.value ? new Date(dateIn.value + "T00:00:00") : null;
            return d ? atLocal(d, +t[0], +t[1]) : NaN;
          }
          var p = presets.filter(function (x) { return x.id === sel.when; })[0];
          return p ? p.ms : NaN;
        }

        send.addEventListener("click", function () {
          var text = txt.value.trim(), at = sendAt();
          err.hidden = true;
          if (text.length < 2) { err.hidden = false; err.textContent = "כתבו את ההודעה"; return; }
          if (!isFinite(at)) { err.hidden = false; err.textContent = "בחרו מועד"; return; }
          if (sel.when !== "now" && at < Date.now() + 2 * 60000) { err.hidden = false; err.textContent = "המועד כבר עבר — בחרו מועד עתידי"; return; }
          var id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
          send.disabled = true; send.textContent = "שומר…";
          CBA.fb.createDoc(MSG_COL, id, {
            eventId: ev.id, text: text, audience: sel.aud, sendAtMs: Math.round(at), status: "pending",
            createdByUid: CBA.fb.uid && CBA.fb.uid(), createdAt: CBA.fb.serverNow()
          }, function (e) {
            if (e) {
              send.disabled = false; send.textContent = sel.when === "now" ? "שליחה" : "תזמון";
              err.hidden = false;
              err.textContent = "השמירה נכשלה" + (e.code === "permission-denied" ? " — אין הרשאת \"תרבות\"" : "") + ".";
              return;
            }
            txt.value = ""; $("[data-evm-count]").textContent = "0/240";
            refresh();
            if (sel.when !== "now") {
              send.disabled = false; send.textContent = "תזמון";
              if (CBA.ui.toast) CBA.ui.toast("התזכורת תוזמנה ל" + whenLabel(at), "ok");
              return;
            }
            send.textContent = "שולח…";
            CBA.sheets.postRead("eventMessageSendNow", { id: id }, function (res) {
              send.disabled = false; send.textContent = "שליחה";
              refresh();
              if (!CBA.ui.toast) return;
              if (res && res.ok && res.queued) CBA.ui.toast("ההודעה תצא בדקות הקרובות", "ok");
              else if (res && res.ok) CBA.ui.toast("נשלחה ל-" + (res.push || 0) + " מכשירים", "ok");
              else CBA.ui.toast("ההודעה נשמרה ותצא בסבב הבא (עד 15 דקות)", "warn");
            });
          });
        });
      }
    });
  }

  /* 28.9 — תיקון "ביצה ותרנגולת": הכפתור הופיע רק כשהמעקב כבר פתוח,
     ולכן מנהל לא יכול היה לפתוח אותו מלכתחילה (דיווח יועד: "לא רואה
     אפשרות להוסיף שאלון הגעה"). מנהל אירועים/על רואה תמיד כפתור; תושב
     רק כשהמעקב פתוח. האכיפה האמיתית נשארת בכלל eventRSVP (hasPerm('תרבות')). */
  function rsvpBtnHTML(e, open) {
    if (open) return '<button type="button" class="btn-rsvp" data-event-id="' + esc(e.id) + '">אישור הגעה</button>';
    if (e.category !== "birthdays" && viewerIsAdmin()) {
      return '<button type="button" class="btn-rsvp btn-rsvp--admin" data-event-id="' + esc(e.id) + '">+ פתיחת אישור הגעה</button>';
    }
    return "";
  }

  function viewerIsAdmin() {
    if (!window.CBA) return false;
    if (CBA.isSuper) return true;
    var ps = Array.isArray(CBA.perms) ? CBA.perms : [];
    return ps.indexOf(PERM_CULTURE) !== -1 || ps.indexOf("על") !== -1;
  }

  // מזהה המשפחה של הצופה הנוכחי — אותו דפוס כמו gardenReports/sysStatus.
  function myFamilyId() {
    var u = (window.CBA && CBA.user) || {};
    return String(u.familyId || u.house || "").trim();
  }

  function rsvpDocId(eventId, familyId) {
    return eventId + "_" + familyId;
  }

  function rsvpDialogHTML() {
    return '<div class="rsvp-loading">טוען נתוני הגעה…</div>';
  }

  // מרנדר מחדש את תוכן הדיאלוג בהתאם למצב שנטען (מנהל/תושב, פתוח/סגור).
  function renderRsvpBody(wrap, ctx) {
    var body = wrap.querySelector(".cba-dlg__body");
    if (!body) return;

    var html = "";

    if (ctx.isAdmin) {
      html += '<div class="rsvp-admin-toggle" dir="rtl">' +
        '<span>מעקב הגעה לאירוע זה: <strong>' + (ctx.config && ctx.config.enabled ? "פתוח" : "סגור") + '</strong></span>' +
        '<button type="button" class="btn-ghost btn-rsvp-toggle" data-open="' + (ctx.config && ctx.config.enabled ? "0" : "1") + '">' +
        (ctx.config && ctx.config.enabled ? "סגירת מעקב" : "פתיחת מעקב הגעה") +
        '</button></div>';
    }

    var enabled = !!(ctx.config && ctx.config.enabled);

    if (!enabled && !ctx.isAdmin) {
      html += '<div class="rsvp-closed-note" dir="rtl">מעקב הגעה לא נפתח לאירוע זה.</div>';
    }

    if (enabled) {
      var r = ctx.myResponse || {};
      html += '<form class="rsvp-form" dir="rtl">' +
        '<label class="rsvp-status">' +
        '<span>סטטוס הגעה</span>' +
        '<select class="rsvp-status-select">' +
        '<option value="attending"' + (r.status === "attending" || !r.status ? " selected" : "") + '>מגיעים</option>' +
        '<option value="not_attending"' + (r.status === "not_attending" ? " selected" : "") + '>לא מגיעים</option>' +
        '</select></label>' +
        '<label class="rsvp-count"><span>מבוגרים</span>' +
        '<input type="number" min="0" class="rsvp-adults" value="' + (r.adults != null ? r.adults : 1) + '"></label>' +
        '<label class="rsvp-count"><span>ילדים</span>' +
        '<input type="number" min="0" class="rsvp-children" value="' + (r.children != null ? r.children : 0) + '"></label>' +
        '<button type="button" class="btn-primary btn-rsvp-save">שמירת תגובה</button>' +
        '<span class="rsvp-save-status"></span>' +
        '</form>';
    }

    if (ctx.isAdmin && ctx.stats) {
      html += '<div class="rsvp-stats" dir="rtl">' +
        '<div class="rsvp-stats-cube">' +
        '<div class="rsvp-stat"><strong>' + ctx.stats.families + '</strong><span>משפחות מגיעות</span></div>' +
        '<div class="rsvp-stat"><strong>' + ctx.stats.adults + '</strong><span>מבוגרים</span></div>' +
        '<div class="rsvp-stat"><strong>' + ctx.stats.children + '</strong><span>ילדים</span></div>' +
        '</div>';
      if (ctx.rows && ctx.rows.length) {
        html += '<table class="rsvp-table"><thead><tr>' +
          '<th>משפחה</th><th>מבוגרים</th><th>ילדים</th>' +
          '</tr></thead><tbody>';
        ctx.rows.forEach(function (row) {
          html += '<tr><td>' + esc(row.name) + '</td><td>' + esc(row.adults) + '</td><td>' + esc(row.children) + '</td></tr>';
        });
        html += '</tbody></table>';
      } else {
        html += '<div class="rsvp-table-empty">עדיין אין תגובות הגעה.</div>';
      }
      html += '</div>';
    }

    body.innerHTML = html;
    wireRsvpDialogBody(wrap, ctx);
  }

  function wireRsvpDialogBody(wrap, ctx) {
    var toggleBtn = wrap.querySelector(".btn-rsvp-toggle");
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function () {
        var wantOpen = toggleBtn.dataset.open === "1";
        toggleBtn.disabled = true;
        CBA.fb.mergeDoc("eventRSVP", ctx.event.id, {
          enabled: wantOpen,
          openedByUid: CBA.fb.uid() || "",
          openedAt: CBA.fb.serverNow(),
          category: ctx.event.category
        }, function (err) {
          toggleBtn.disabled = false;
          if (err) { toggleBtn.textContent = "שגיאה — נסו שוב"; return; }
          /* 23.9 — מרכז ההתראות: "נפתח אישור הגעה" לכל התושבים, לפי הטבלה.
             שגר-ושכח. השרת בודק בעצמו שהמעקב באמת פתוח, ושולח פעם אחת
             לכל אירוע (פתיחה-סגירה-פתיחה לא שולחת שוב). */
          if (wantOpen) {
            try { CBA.sheets.postRead("notifyRsvpOpened", { eventId: ctx.event.id }, function () {}); } catch (e) {}
          }
          ctx.config = ctx.config || {};
          ctx.config.enabled = wantOpen;
          state.rsvpEnabledIds[ctx.event.id] = wantOpen || undefined;
          if (!wantOpen) delete state.rsvpEnabledIds[ctx.event.id];
          loadRsvpAdminData(ctx, function () { renderRsvpBody(wrap, ctx); });
        });
      });
    }

    var saveBtn = wrap.querySelector(".btn-rsvp-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        var statusEl = wrap.querySelector(".rsvp-status-select");
        var adultsEl = wrap.querySelector(".rsvp-adults");
        var childrenEl = wrap.querySelector(".rsvp-children");
        var statusMsg = wrap.querySelector(".rsvp-save-status");
        var fid = myFamilyId();
        if (!fid) {
          if (statusMsg) statusMsg.textContent = "לא זוהתה משפחה — לא ניתן לשמור.";
          return;
        }
        var data = {
          eventId: ctx.event.id,
          familyId: fid,
          status: statusEl.value,
          adults: Math.max(0, parseInt(adultsEl.value, 10) || 0),
          children: Math.max(0, parseInt(childrenEl.value, 10) || 0),
          updatedAt: CBA.fb.serverNow()
        };
        saveBtn.disabled = true;
        if (statusMsg) statusMsg.textContent = "שומר…";
        CBA.fb.mergeDoc("eventRSVPResponses", rsvpDocId(ctx.event.id, fid), data, function (err) {
          saveBtn.disabled = false;
          if (err) { if (statusMsg) statusMsg.textContent = "שגיאה בשמירה — נסו שוב."; return; }
          ctx.myResponse = data;
          if (statusMsg) statusMsg.textContent = "נשמר ✓";
          if (ctx.isAdmin) loadRsvpAdminData(ctx, function () { renderRsvpBody(wrap, ctx); });
        });
      });
    }
  }

  // טוען עבור מנהל: סטטיסטיקה + טבלת משפחות (עם שמות דרך הגשר rsvpFamilyNames).
  function loadRsvpAdminData(ctx, done) {
    CBA.fb.queryCollection("eventRSVPResponses", [["eventId", ctx.event.id]], function (err, rows) {
      if (err || !rows) { ctx.stats = { families: 0, adults: 0, children: 0 }; ctx.rows = []; return done(); }
      var attending = rows.filter(function (r) { return r.status === "attending"; });
      var ids = attending.map(function (r) { return r.familyId; }).filter(Boolean);
      var totals = attending.reduce(function (acc, r) {
        acc.adults += Number(r.adults) || 0;
        acc.children += Number(r.children) || 0;
        return acc;
      }, { adults: 0, children: 0 });
      ctx.stats = { families: attending.length, adults: totals.adults, children: totals.children };

      if (!ids.length || !CBA.data || !CBA.data.getRsvpFamilyNames) {
        ctx.rows = attending.map(function (r) { return { name: r.familyId, adults: r.adults, children: r.children }; });
        return done();
      }
      CBA.data.getRsvpFamilyNames(ids, function (res) {
        var names = (res && res.ok && res.names) || {};
        ctx.rows = attending.map(function (r) {
          return { name: names[r.familyId] || r.familyId, adults: r.adults, children: r.children };
        });
        done();
      });
    });
  }

  function openRsvpDialog(event) {
    if (!CBA.fb) return;
    var ctx = { event: event, isAdmin: viewerIsAdmin(), config: null, myResponse: null, stats: null, rows: null };

    var dlg = CBA.ui.dialog({
      title: "אישור הגעה — " + event.title,
      html: rsvpDialogHTML(),
      sticky: true,
      okText: "סגירה",   /* E30 (גל 3) — "סגירה" בכל החלונות */
      onMount: function (wrap, close) {
        // הכפתור "אישור" הרגיל של הדיאלוג הופך כאן ל"סגור" בלבד —
        // כל שמירה בפועל קורית דרך btn-rsvp-save/btn-rsvp-toggle למעלה.
        CBA.fb.readDoc("eventRSVP", event.id, function (err, cfg) {
          ctx.config = cfg || { enabled: false };
          var fid = myFamilyId();
          function afterMyResponse() {
            if (ctx.isAdmin) {
              loadRsvpAdminData(ctx, function () { renderRsvpBody(wrap, ctx); });
            } else {
              renderRsvpBody(wrap, ctx);
            }
          }
          if (!fid) return afterMyResponse();
          CBA.fb.readDoc("eventRSVPResponses", rsvpDocId(event.id, fid), function (err2, resp) {
            ctx.myResponse = resp || null;
            afterMyResponse();
          });
        });
      }
    });
    /* EB4 (גל 3, 1.10.26) — אחרי סגירת החלון הלוח מתעדכן: כפתור "אישור הגעה"
       מול "+ פתיחת…", ו"✓ N משפחות". עד היום נשארו ישנים עד כניסה מחדש.
       ⚠️ רק כשהלוח עצמו פתוח — מהבית (homeSchedule) יש רענון משלו. */
    if (dlg && dlg.then) dlg.then(function () {
      if (!activeContainer || !activeContainer.isConnected) return;
      if (document.body.dataset.screen !== "events") return;
      loadRsvpEnabledIds(function () {
        if (activeContainer && activeContainer.isConnected && document.body.dataset.screen === "events") draw(activeContainer);
      });
    });
  }

  /**
   * בחירת תצוגה לפי גודל המסך
   */
  function selectViewMode() {
    return window.innerWidth < 768 ? "mobile" : "monthly";
  }

  /* הערה (לא אזהרה): ימי הולדת כעת מוצגים, קרויים מ-myProfile בכל כניסה למסך.
   * כל הקטגוריות (קהילה/תרבות/חגים/גנים/ימי הולדת) הן נתון אמיתי. */
  function demoBannerHTML() {
    return '';  // אין באנר הודעות — כל הנתונים חיים
  }

  /* טאב "חודשי/שנתי" — רק בדסקטופ. עוזר במעבר בין renderMonthlyView
   * ל-renderAnnualView בלי לגלול/לנווט מחדש למסך. */
  function viewToggleHTML() {
    return '<div class="seg" dir="rtl">' +
      '<button type="button" class="view-toggle-btn' +
      (state.viewMode === "monthly" ? " on" : "") +
      '" data-view="monthly">חודש</button>' +
      '<button type="button" class="view-toggle-btn' +
      (state.viewMode === "annual" ? " on" : "") +
      '" data-view="annual">שנה</button>' +
      '</div>';
  }

  function wireViewToggle(container) {
    container.querySelectorAll(".view-toggle-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.viewMode = btn.dataset.view;
        draw(container);
      });
    });
  }

  /**
   * פונקציית ציור ראשית של המסך
   */
  /* ==========================================================================
   *  🔴 גל 3 (1.10.26, ספר האבנים פרק 5) — החופה (E1, EA2)
   * --------------------------------------------------------------------------
   *  draw מצייר עכשיו שתי שכבות: החופה (#app-main > .cnp2) והתוכן בתוך
   *  #ev-body. כל התצוגות הקיימות מקבלות את #ev-body כ-container — בדיוק
   *  כמו שקיבלו קודם את #app-main — וכשהן קוראות draw(container) עם הגוף,
   *  draw מזהה את זה ועולה לשורש. שום תצוגה לא יודעת שיש חופה.
   *  בלי canopy.js (לקוח ישן) — הכול כמו קודם, בלי שכבה.
   * ========================================================================== */
  function canopyHTML() {
    if (!(window.CBA && CBA.canopy)) return "";
    var today = new Date();
    var isCur = state.currentMonth && state.currentMonth.getMonth() === today.getMonth() &&
                state.currentMonth.getFullYear() === today.getFullYear();
    return CBA.canopy({ size: "mid", dom: "ev", wide: true, title: "לוח אירועים",
      ico: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
      sub: canopySub(), subId: "ev-cnp-sub",
      tools: '<button type="button" class="cnp2-btn" id="ev-today"' + (isCur ? " hidden" : "") + '>היום</button>' });
  }
  function canopySub() {
    if (!state.currentMonth || state.loading || state.error) return "כל מה שקורה בשיכון — קהילה, תרבות, חגים וגנים";
    var m = state.currentMonth.getMonth(), y = state.currentMonth.getFullYear();
    var from = new Date(y, m, 1), to = new Date(y, m + 1, 0);
    var n = (state.allEvents || []).filter(function (e) { return evOverlaps(e, from, to) && e.category !== "personal"; }).length;
    return (state.viewMode === "annual" && selectViewMode() !== "mobile" ? "שנת " + state.year
      : HEBREW_MONTHS[m] + " " + y) + " · " + (n === 1 ? "אירוע אחד" : n + " אירועים") + " בחודש";
  }
  function syncCanopy() {
    var root = activeContainer;
    if (!root || !root.querySelector) return;
    var sub = root.querySelector("#ev-cnp-sub");
    if (sub) sub.textContent = canopySub();
    var t = root.querySelector("#ev-today");
    if (t) {
      var now = new Date();
      t.hidden = !!(state.currentMonth && state.currentMonth.getMonth() === now.getMonth() &&
                    state.currentMonth.getFullYear() === now.getFullYear() && state.viewMode !== "annual");
    }
  }
  /* EB2 (גל 3) — חודש בשנה אחרת (דצמבר ← ינואר): טוענים את השנה ההיא.
     עד היום הלוח הציג חודש ריק, כי רק שנה אחת נטענה. */
  function drawOrReloadYear() {
    var y = state.currentMonth.getFullYear();
    if (y === state.year) return draw(activeContainer);
    var keepMonth = new Date(state.currentMonth), keepSel = state.selectedDate;
    state.loading = true;
    draw(activeContainer);
    loadEvents(y, function () {
      state.year = y;
      state.currentMonth = keepMonth;
      state.selectedDate = keepSel;
      if (activeContainer && activeContainer.isConnected && document.body.dataset.screen === "events") draw(activeContainer);
    });
  }
  function goToday() {
    var t = startOfDay(new Date());
    state.viewMode = "monthly";
    state.currentMonth = new Date(t);
    state.selectedDate = t;
    state.showAllMonth = false;
    drawOrReloadYear();
  }

  function draw(container) {
    /* החופה + הגוף. ר' ההסבר מעל canopyHTML. */
    var root = (container && container.id === "ev-body" && container.parentNode) ? container.parentNode : container;
    var cnp = canopyHTML();
    if (cnp) {
      root.innerHTML = cnp + '<div class="cnp2-body cnp2-body--wide ev-v2" id="ev-body"></div>';
      if (CBA.canopy.bindScroll) CBA.canopy.bindScroll();
      var tb = root.querySelector("#ev-today");
      if (tb) tb.addEventListener("click", goToday);
      container = root.querySelector("#ev-body");
    } else {
      container = root;
    }

    if (state.loading) {
      container.innerHTML = '<div class="events-loading">טוען אירועים...</div>';
      return;
    }

    if (state.error) {
      /* EB3 (גל 3) — שגיאה עם "לנסות שוב" (עד היום: טקסט בלבד, בלי יציאה) */
      container.innerHTML = '<div class="events-error">' + esc(state.error) +
        '<div><button type="button" class="btn-primary" data-ev-retry style="margin-top:12px">לנסות שוב</button></div></div>';
      var rb = container.querySelector("[data-ev-retry]");
      if (rb) rb.addEventListener("click", function () {
        if (CBA.screens && CBA.screens.events) CBA.screens.events.render(root);
      });
      return;
    }

    var screenMode = selectViewMode(); // "mobile" | "monthly" (= דסקטופ)

    if (screenMode === "mobile") {
      renderMobileView(container);
      return;
    }

    // דסקטופ: תצוגה חודשית/שנתית לפי state.viewMode (טאב חודש/שנה בנוי בתוך כל תצוגה).
    var prefix = demoBannerHTML();
    if (state.viewMode === "annual") {
      renderAnnualView(container, prefix);
    } else {
      renderMonthlyView(container, prefix);
    }
  }

  /* מאזין-שינוי-גודל יחיד למודול כולו (לא אחד חדש בכל כניסה למסך), כדי שלא
   * ייערמו מאזינים בכל מעבר הלוך-חזור ל"לוח אירועים" באותו סבב עבודה.
   * בודק isConnected כמו showScreen ב-app.js — אם container כבר לא בעץ
   * המסמך (המשתמש עבר למסך אחר), לא מציירים לתוכו.
   * 🔴 24.9 — בדיקת has-cba-dlg מונעת ציור כשדיאלוג פתוח (גלילה בדיאלוג
      עוררת resize event; נפתר ע"י דחיית draw עד שהדיאלוג סוגר). */
  var activeContainer = null;
  var resizeListenerAttached = false;
  function ensureResizeListener() {
    if (resizeListenerAttached) return;
    resizeListenerAttached = true;
    window.addEventListener("resize", function () {
      if (document.body.classList.contains("has-cba-dlg")) return;  // דיאלוג פתוח — אל תצייר
      if (activeContainer && activeContainer.isConnected) draw(activeContainer);
    });
  }

  /**
   * ממשק ציבורי של המסך
   */
  /* 🔴 23.9 — עמוד הבית (js/screens/homeSchedule.js) משתמש בשלושה חלקים מכאן,
     כדי שלא יהיו שתי גרסאות של אותו דבר:
       • focus(date)   — לחיצה על יום בלו"ז של הבית פותחת את הלוח על היום הזה.
       • openRsvp(ev)  — אותו דיאלוג "אישור הגעה" בדיוק (אותם מסמכים ב-Firestore).
       • calendarLinks — אותם קישורי Google / Apple של "הוספה ליומן".
     ⚠️ openRsvp מצפה ל-ev עם id, title ו-category (מפתח הקטגוריה, "community"). */
  var pendingFocus = null;
  var wasShown = false;
  var pendingEventId = null;

  return {
    title: "לוח אירועים",
    focus: function (d) {
      var x = d ? new Date(d) : null;
      pendingFocus = (x && !isNaN(x.getTime())) ? startOfDay(x) : null;
    },
    openRsvp: function (ev) { if (ev && ev.id) openRsvpDialog(ev); },
    calendarLinks: { google: googleAddUrl, apple: appleIcsDataUri, openApple: openApple, link: eventLink },
    /* קישור ישיר (23.9.26): app.js קורא לזה לפני showScreen("events") כשהכתובת
       מכילה #event=ID. האירוע נפתר אחרי הטעינה — התאריך שלו הופך ל"יום נבחר"
       והשורה שלו מודגשת. מזהה שלא נמצא (אירוע ישן/נמחק) פשוט פותח את הלוח. */
    focusEvent: function (id) { pendingEventId = id ? String(id) : null; },
    render: function (container) {
      activeContainer = container;
      var silentNow = !!CBA.renderSilent;   // הדגל תקף רק סינכרונית — לוכדים לפני הטעינה האסינכרונית
      ensureResizeListener();
      var focusDate = pendingFocus;
      pendingFocus = null;
      var wantEventId = pendingEventId;
      pendingEventId = null;
      var keepShowAll = false;   /* EB1 — קישור ישיר לאירוע שעבר משאיר את "העבר" גלוי */
      var year = focusDate ? focusDate.getFullYear() : ((silentNow && wasShown && state.year) ? state.year : new Date().getFullYear());
      loadEvents(year, function () {
        /* קישור ישיר: האירוע יכול לשבת בשנה אחרת מזו שנטענה. אם הוא לא נמצא
           בשנה הנוכחית — לא טוענים שנה שנייה (איטי), פשוט פותחים את הלוח. */
        if (wantEventId) {
          var target = state.eventsById[wantEventId];
          if (target && target.date) {
            focusDate = startOfDay(new Date(target.date));
            state.highlightEventId = wantEventId;
            state.showAllMonth = true; // במובייל: גם אם היום כבר עבר, שיהיה גלוי
            keepShowAll = true;
          } else if (CBA.ui && CBA.ui.toast) {
            CBA.ui.toast("האירוע מהקישור לא נמצא בלוח", "warn");
          }
        }
        if (activeContainer !== container || !container.isConnected) return; // המשתמש כבר עבר מסך
        /* 🔴 23.9 — container הוא #app-main, **אותו אלמנט לכל המסכים**, ולכן
           הבדיקה שמעל תמיד עוברת. נתפס חי: האפליקציה נפתחה על "לוח אירועים",
           עברתי לבית, ו-eventsList (~5 שניות) חזר וצייר את הלוח מעל עמוד הבית. */
        if (document.body.dataset.screen && document.body.dataset.screen !== "events") return;
        /* 🔴 24.9 — רענון רקע שקט לא מקפיץ את הלוח לחודש הנוכחי: משאירים חודש/יום/מסננים. */
        if (!(silentNow && wasShown && state.currentMonth && !focusDate)) {
          state.selectedDate = focusDate || startOfDay(new Date());   // 28.9 — הפאנל נפתח על היום
          state.currentMonth = focusDate ? new Date(focusDate) : new Date();
          state.year = year;
          state.activeCategories = null;
          state.showAllMonth = keepShowAll;   /* EB1 — איפוס בכניסה (עבר מ-renderMobileView) */
        }
        wasShown = true;
        draw(container);
      });
    }
  };
})();
