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
    breaks: { he: "חופשות גנים", cssVar: "--cat-kg", icon: "👶" },
    birthdays: { he: "ימי הולדת", cssVar: "--cat-birthday", icon: "🎂" },
    personal: { he: "אירועים פרטיים", cssVar: "--cat-personal", icon: "🔑" }
  };
  var CATEGORY_ORDER = ["community", "culture", "holidays", "breaks", "birthdays"];

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
   *  אירועי קהילה/תרבות/חגים/חופשות גנים — נתון אמיתי (2026-09-23)
   * --------------------------------------------------------------------------
   *  מחובר ל-CBA.data.getEventsFast (dataService.js): קודם המסמך
   *  `eventsCal/{year}` ב-Firestore, ובכל כשל — getEventsList ->
   *  handleGetEventsList_ ב-Code.gs, שקורא מארבעת היומנים שב-EVENTS_CALENDARS.
   *  ⚠️ אין כאן עדיין ימי הולדת — זה תלוי ב-myProfile v2 (עדיין לא מוזג),
   *  ולכן לא מוצג שום אירוע דמדומה בקטגוריה הזו; היא פשוט ריקה עד אז.
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
          category: e.category,
          description: e.description || "",
          location: e.location || ""
        };
        state.eventsById[ev.id] = ev;
        return ev;
      });
      callback();
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
  function loadEvents(year, callback) {
    state.loading = true;
    state.error = null;

    loadCommunityEvents(year, function () {
      loadPrivateEvents(function () {
        loadRsvpEnabledIds(function () {
          state.loading = false;
          if (callback) callback();
        });
      });
    });
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
    var end = new Date(start);
    end.setDate(end.getDate() + 1);
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
    var end = new Date(start);
    end.setDate(end.getDate() + 1);
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
      .filter(function (e) { return startOfDay(e.date) >= today; })
      .sort(function (a, b) { return a.date - b.date; })
      .slice(0, 4);
    if (!upcoming.length) upcoming = monthEvents.slice().sort(function (a, b) { return a.date - b.date; }).slice(0, 4);
    if (!upcoming.length) return "";

    return '<div class="digest lg" dir="rtl">' +
      '<div class="ttl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>מה קורה החודש</div>' +
      '<div class="digest-list">' +
      upcoming.map(function (e) {
        return '<div class="digest-item"><span class="date">' + e.date.getDate() + '.' + (e.date.getMonth() + 1) + '</span>' +
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
    var monthEventsAll = state.allEvents.filter(function (e) {
      return e.date.getMonth() === month && e.date.getFullYear() === year;
    });
    var monthEvents = filterByActiveCategories(monthEventsAll);

    var html = (prefixHTML || demoBannerHTML()) +
      '<div class="events-container">' +
      chipbarHTML(monthEventsAll, false) +
      digestHTML(monthEvents) +
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

    var current = new Date(startDate);
    var today = new Date();
    var selected = state.selectedDate;

    while (current.getMonth() === month || current < new Date(year, month + 1, 1)) {
      var isThisMonth = current.getMonth() === month;
      var isToday = current.toDateString() === today.toDateString();
      var isSelected = selected && current.toDateString() === selected.toDateString();

      var dayEvents = monthEvents.filter(function (e) {
        return e.date.toDateString() === current.toDateString();
      });

      var dayHTML = '<div class="day' +
        (!isThisMonth ? " muted" : "") +
        (isToday ? " today" : "") +
        (isSelected ? " selected" : "") +
        '" data-date="' + current.toISOString() + '">' +
        '<span class="num">' + current.getDate() + '</span>';

      /* 🔴 23.9 — גודל קבוע, אותו כלל של הלו"ז בעמוד הבית (בקשת יועד): לכל
         היותר MAX_DAY שבבים, בשורה אחת כל אחד, ואז "+N נוספים". התא לא גדל
         לפי התוכן (height ולא min-height ב-events.css). המספר נלקח מ-homeSchedule
         כשהוא טעון — מקור אחד לשני המסכים. */
      var MAX_DAY = (window.CBA && CBA.homeSchedule && CBA.homeSchedule.MAX_CHIPS) || 2;
      dayHTML += dayEvents.slice(0, MAX_DAY).map(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        return '<div class="ev" style="background:var(' + cat.cssVar + '-tint)" title="' + esc(e.title) + '">' +
          '<i style="background:var(' + cat.cssVar + ')"></i><span class="t" dir="auto">' + esc(e.title) + '</span></div>';
      }).join("");

      if (dayEvents.length > MAX_DAY) {
        var extra = dayEvents.length - MAX_DAY;
        dayHTML += '<div class="more">' + (extra === 1 ? "+1 נוסף" : "+" + extra + " נוספים") + '</div>';
      }

      dayHTML += '</div>';

      html += dayHTML;
      current.setDate(current.getDate() + 1);
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
    var dayEvents = monthEvents.filter(function (e) {
      return e.date.toDateString() === date.toDateString();
    });

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
          '<div class="time">כל היום</div>' +
          '<div class="body">' +
          '<div class="ttl2">' + esc(e.title) + '</div>' +
          '<div class="meta">' + esc(cat.he) + (e.location ? " · 📍 " + esc(e.location) : "") + rsvpCountHTML(e.id) + '</div>' +
          '<div class="ev-actions">' +
          addCalHTML(e.id) + shareBtnHTML(e.id) +
          (rsvpOpen ? '<button type="button" class="btn-rsvp" data-event-id="' + esc(e.id) + '">אישור הגעה</button>' : "") +
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
        draw(container);
      });
    }

    var nextBtn = container.querySelector(".btn-next-month");
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
        state.selectedDate = null;
        draw(container);
      });
    }

    wireViewToggle(container);
    wireRsvpButtons(container);
  }

  // חיווט משותף לכפתורי "אישור הגעה" — משמש גם בתצוגה החודשית (דסקטופ)
  // וגם בסדר היומי (מובייל), כך שהלוגיקה כתובה פעם אחת בלבד.
  function wireRsvpButtons(container) {
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
      var monthEnd = new Date(year, m + 1, 0, 23, 59, 59);
      var monthEvents = allEventsActive.filter(function (e) {
        return e.date >= monthStart && e.date <= monthEnd;
      }).sort(function (a, b) { return a.date - b.date; });

      var isCurrentMonth = m === new Date().getMonth() && year === new Date().getFullYear();
      var CAP = 6;
      var shown = monthEvents.slice(0, CAP);
      var rest = monthEvents.length - shown.length;

      html += '<div class="cube' + (isCurrentMonth ? " current" : "") + '" data-month="' + m + '">' +
        '<div class="ch"><span>' + HEBREW_MONTHS[m] + '</span>' +
        (isCurrentMonth ? '<em>עכשיו</em>' : "") +
        '</div><ul>';

      shown.forEach(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        html += '<li><i style="background:var(' + cat.cssVar + ')"></i>' +
          '<span class="tt">' + esc(e.title) + '</span>' +
          '<span class="dd">(' + e.date.getDate() + ')</span></li>';
      });

      if (!shown.length) html += '<li class="no-events"><span class="tt" style="color:var(--text-muted)">אין אירועים</span></li>';

      html += '</ul>' + (rest > 0 ? '<div class="more">+' + rest + ' נוספים</div>' : "") + '</div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
    wireAnnualListeners(container);
    wireViewToggle(container);
    wireChipbar(container);
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
    state.showAllMonth = false; // חוזרים לברירת המחדל (ימי עבר מוסתרים) בכל כניסה מחדש
    var html = demoBannerHTML() +
      '<div class="events-mobile" dir="rtl">' +
      renderPrivateEventsPanel() +
      renderMonthSelector() +
      chipbarHTML(monthEventsRaw(), true) +
      renderAgendaList() +
      '</div>';

    container.innerHTML = html;
    wireMobileListeners(container);
  }

  function monthEventsRaw() {
    var month = state.currentMonth.getMonth();
    var year = state.currentMonth.getFullYear();
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
    return state.allEvents.filter(function (e) { return e.date >= monthStart && e.date <= monthEnd; });
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
    var visibleEvents = state.showAllMonth ? monthEvents :
      monthEvents.filter(function (e) { return startOfDay(e.date) >= today; });
    var hiddenCount = monthEvents.length - visibleEvents.length;

    var html = '<div class="agenda-list" dir="rtl">';

    if (hiddenCount > 0) {
      html += '<button type="button" class="btn-show-all-month">הצגת כל אירועי החודש (כולל ' + hiddenCount + ' שעברו)</button>';
    }

    if (visibleEvents.length === 0) {
      html += '<div class="empty-agenda">אין אירועים קרובים בחודש זה</div>';
    } else {
      var grouped = {};
      visibleEvents.forEach(function (e) {
        var key = e.date.toDateString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });

      Object.keys(grouped).sort(function (a, b) { return new Date(a) - new Date(b); }).forEach(function (key) {
        var date = new Date(key);
        var isToday = date.toDateString() === today.toDateString();

        html += '<div class="day-group">' +
          '<div class="gh"><span class="dd">' + date.getDate() + '</span>' +
          '<span class="dw">' + HEBREW_WEEKDAYS[date.getDay()] + ', ' + HEBREW_MONTHS[date.getMonth()] + '</span>' +
          (isToday ? '<span class="tag">היום</span>' : "") +
          '</div>';

        grouped[key].forEach(function (e) {
          var cat = CATEGORIES[e.category] || CATEGORIES.personal;
          var rsvpOpen = !!state.rsvpEnabledIds[e.id];
          html += '<div class="ev-row lg m-ev" data-event-id="' + esc(e.id) + '">' +
            '<div class="bar" style="background:var(' + cat.cssVar + ')"></div>' +
            '<div class="time">' + cat.icon + '</div>' +
            '<div class="body">' +
            '<div class="ttl2">' + esc(e.title) + '</div>' +
            '<div class="meta">' + esc(cat.he) + (e.location ? " · 📍 " + esc(e.location) : "") + rsvpCountHTML(e.id) + '</div>' +
            '<div class="ev-actions">' +
            (e.category !== "personal" ? addCalHTML(e.id) + shareBtnHTML(e.id) : "") +
            (rsvpOpen ? '<button type="button" class="btn-rsvp" data-event-id="' + esc(e.id) + '">אישור הגעה</button>' : "") +
            '</div>' +
            '</div></div>';
        });

        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  function wireMobileListeners(container) {
    container.querySelectorAll(".p[data-month]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var month = parseInt(btn.dataset.month, 10);
        state.currentMonth = new Date(state.year, month, 1);
        renderMobileView(container);
      });
    });

    var showAllBtn = container.querySelector(".btn-show-all-month");
    if (showAllBtn) {
      showAllBtn.addEventListener("click", function () {
        state.showAllMonth = true;
        container.innerHTML = demoBannerHTML() +
          '<div class="events-mobile" dir="rtl">' +
          renderPrivateEventsPanel() +
          renderMonthSelector() +
          chipbarHTML(monthEventsRaw(), true) +
          renderAgendaList() +
          '</div>';
        wireMobileListeners(container);
      });
    }

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

    CBA.ui.dialog({
      title: "אישור הגעה — " + event.title,
      html: rsvpDialogHTML(),
      sticky: true,
      okText: "סגור",
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
  }

  /**
   * בחירת תצוגה לפי גודל המסך
   */
  function selectViewMode() {
    return window.innerWidth < 768 ? "mobile" : "monthly";
  }

  /* הערה (לא אזהרה): ימי הולדת עדיין לא מוצגים כי הם תלויים ב-myProfile v2
   * שטרם מוזג. כל שאר הקטגוריות (קהילה/תרבות/חגים/גנים) הן נתון אמיתי
   * מ-Google Calendar, ולכן אין יותר באנר "נתוני דמה" כללי. */
  function demoBannerHTML() {
    return '<div class="events-info-banner" dir="rtl">' +
      'ℹ️ ימי הולדת יתווספו כאן לאחר עדכון "הפרטים שלי" — עדיין לא זמינים.' +
      '</div>';
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
  function draw(container) {
    if (state.loading) {
      container.innerHTML = '<div class="events-loading">טוען אירועים...</div>';
      return;
    }

    if (state.error) {
      container.innerHTML = '<div class="events-error">' + esc(state.error) + '</div>';
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
   * המסמך (המשתמש עבר למסך אחר), לא מציירים לתוכו. */
  var activeContainer = null;
  var resizeListenerAttached = false;
  function ensureResizeListener() {
    if (resizeListenerAttached) return;
    resizeListenerAttached = true;
    window.addEventListener("resize", function () {
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
          state.selectedDate = focusDate;
          state.currentMonth = focusDate ? new Date(focusDate) : new Date();
          state.year = year;
          state.activeCategories = null;
        }
        wasShown = true;
        draw(container);
      });
    }
  };
})();
