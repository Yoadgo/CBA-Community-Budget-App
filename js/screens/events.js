/* ============================================================================
 *  events.js — לוח אירועים קהילתי
 * ============================================================================
 *  תצוגה קריאה-בלבד של אירועים קהילתיים, חגים, חופשות גנים וימי הולדת.
 *  שלוש תצוגות:
 *    • חודשית (דסקטופ) — גריד 7x6 עם כרטיסיות אירועים, סרגל צד לבחירה
 *    • שנתית (דסקטופ) — 12 קוביות חודשיות עם רשימת אירועים קומפקטית
 *    • סדר יומי (מובייל) — רשימה מקובצת לפי יום עם בחירת חודש אופקית
 *
 *  ניהול אירועים: Google Calendar (קריאה-בלבד, ללא ממשק עריכה).
 *  נתונים נוספים: myProfile v2 (ימי הולדת), שריונים (אירועים פרטיים).
 *
 *  משלוח מיילים: כפתור ידני בלבד, ללא אוטומציה (הגבלת MailApp).
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

CBA.screens.events = (function () {
  "use strict";

  // צבעים לפי קטגוריה (תואם את העיצוב)
  const CATEGORIES = {
    community: { he: "קהילה", color: "#6366F1", icon: "📢" },
    culture: { he: "תרבות", color: "#0D9488", icon: "🎭" },
    holidays: { he: "חגי ישראל", color: "#C2760A", icon: "🇮🇱" },
    breaks: { he: "חופשות גנים", color: "#7C5CC4", icon: "👶" },
    birthdays: { he: "ימי הולדת", color: "#DB2777", icon: "🎂" },
    personal: { he: "אירועים פרטיים", color: "#0EA5E9", icon: "🏠" }
  };

  const HEBREW_MONTHS = [
    "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
    "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"
  ];

  const HEBREW_WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

  // מצב הסך
  var state = {
    currentMonth: new Date(),
    selectedDate: null,
    viewMode: "monthly", // "monthly", "annual", "mobile"
    allEvents: [],
    eventsById: {}, // אינדקס מהיר לפי id, לצורך כפתור "אישור הגעה" (RSVP)
    privateEvents: [],
    loading: false,
    error: null,
    year: new Date().getFullYear()
  };

  function esc(s) {
    return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s);
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
   *  מחובר ל-CBA.data.getEventsList (dataService.js) -> handleGetEventsList_
   *  ב-Code.gs, שקורא מארבעת היומנים שאותרו ע"י listMyCalendars() ואומתו מול
   *  יועד: חגי ישראל (iw.jewish#holiday), אירועי קהילה, אירועי תרבות, גנים.
   *  ⚠️ אין כאן עדיין ימי הולדת — זה תלוי ב-myProfile v2 (עדיין לא מוזג),
   *  ולכן לא מוצג שום אירוע דמדומה בקטגוריה הזו; היא פשוט ריקה עד אז.
   * ========================================================================== */
  function loadCommunityEvents(year, callback) {
    if (!CBA.data || !CBA.data.getEventsList) {
      state.allEvents = [];
      state.error = "מנוע הנתונים לא נטען.";
      return callback();
    }
    CBA.data.getEventsList(year, function (res) {
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
          description: e.description || ""
        };
        state.eventsById[ev.id] = ev;
        return ev;
      });
      callback();
    });
  }

  /**
   * הבאת אירועים מכל המקורות — הפונקציה הראשית שהמסך קורא לה.
   */
  function loadEvents(year, callback) {
    state.loading = true;
    state.error = null;

    loadCommunityEvents(year, function () {
      loadPrivateEvents(function () {
        state.loading = false;
        if (callback) callback();
      });
    });
  }

  /**
   * תצוגה חודשית
   */
  function renderMonthlyView(container, prefixHTML) {
    var month = state.currentMonth.getMonth();
    var year = state.currentMonth.getFullYear();
    var monthEvents = state.allEvents.filter(function (e) {
      return e.date.getMonth() === month && e.date.getFullYear() === year;
    });

    var html = (prefixHTML || demoBannerHTML()) +
      '<div class="events-container">' +
      '<div class="events-grid">' +
      renderMonthlyCalendar(month, year, monthEvents) +
      '</div>' +
      (state.selectedDate ? renderSidebar(state.selectedDate, monthEvents) : "") +
      '</div>';

    container.innerHTML = html;
    wireMonthlyListeners(container, monthEvents);
  }

  function renderMonthlyCalendar(month, year, monthEvents) {
    var firstDay = new Date(year, month, 1);
    var lastDay = new Date(year, month + 1, 0);
    var startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    var html = '<div class="month-header" dir="rtl">' +
      '<button type="button" class="btn-prev-month" aria-label="חודש קודם">›</button>' +
      '<h2>' + HEBREW_MONTHS[month] + ' ' + year + '</h2>' +
      '<button type="button" class="btn-next-month" aria-label="חודש הבא">‹</button>' +
      '</div>' +
      '<div class="weekday-row">' +
      HEBREW_WEEKDAYS.map(function (d) {
        return '<div class="weekday-name">' + d + '</div>';
      }).join("") +
      '</div>' +
      '<div class="calendar-grid">';

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

      var dayHTML = '<div class="day-cell' +
        (isThisMonth ? " is-current-month" : " is-other-month") +
        (isToday ? " is-today" : "") +
        (isSelected ? " is-selected" : "") +
        '" data-date="' + current.toISOString() + '">' +
        '<div class="day-number">' + current.getDate() + '</div>' +
        '<div class="day-events">';

      // הצגת אירועים עד 2, "+X עוד" לשאר
      dayHTML += dayEvents.slice(0, 2).map(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        return '<div class="event-chip" style="background-color: ' + cat.color + ';"' +
          ' title="' + esc(e.title) + '">' + esc(e.title) + '</div>';
      }).join("");

      if (dayEvents.length > 2) {
        dayHTML += '<div class="event-overflow">+' + (dayEvents.length - 2) + ' עוד</div>';
      }

      dayHTML += '</div>';
      if (isToday) dayHTML += '<div class="today-marker"></div>';
      dayHTML += '</div>';

      html += dayHTML;
      current.setDate(current.getDate() + 1);
    }

    html += '</div>';
    return html;
  }

  function renderSidebar(date, monthEvents) {
    var dayEvents = monthEvents.filter(function (e) {
      return e.date.toDateString() === date.toDateString();
    });

    var html = '<aside class="events-sidebar" dir="rtl">' +
      '<div class="sidebar-header">' +
      '<h3>' + HEBREW_WEEKDAYS[date.getDay()] + ', ' + date.getDate() + ' ' +
      HEBREW_MONTHS[date.getMonth()] + '</h3>' +
      '</div>';

    if (dayEvents.length === 0) {
      html += '<div class="empty-day">אין אירועים ביום זה</div>';
    } else {
      html += '<ul class="sidebar-events">';
      dayEvents.forEach(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        html += '<li>' +
          '<span class="event-icon">' + cat.icon + '</span>' +
          '<span class="event-info">' +
          '<strong>' + esc(e.title) + '</strong><br>' +
          '<small>' + cat.he + '</small>' +
          '</span>' +
          '<button type="button" class="btn-rsvp" data-event-id="' + esc(e.id) + '">אישור הגעה</button>' +
          '</li>';
      });
      html += '</ul>';
    }

    html += '<div class="sidebar-action">' +
      '<button type="button" class="btn-add-calendar">הוסף ליומן שלך</button>' +
      '</div>' +
      '</aside>';

    return html;
  }

  // כל חיווט-מחדש כאן עובר דרך draw(container) ולא ישירות דרך renderMonthlyView —
  // כך הבאנר וטאב חודשי/שנתי תמיד נשארים, בלי לשכפל את הלוגיקה שבונה אותם.
  function wireMonthlyListeners(container) {
    // בחירת יום
    container.querySelectorAll(".day-cell").forEach(function (cell) {
      cell.addEventListener("click", function () {
        var date = new Date(cell.dataset.date);
        state.selectedDate = date;
        draw(container);
      });
    });

    // כפתור "הוסף ליומן"
    var addBtn = container.querySelector(".btn-add-calendar");
    if (addBtn && state.selectedDate) {
      addBtn.addEventListener("click", function () {
        var url = "https://calendar.google.com/calendar/u/0/r/day/" +
          state.selectedDate.getFullYear() + "/" +
          String(state.selectedDate.getMonth() + 1).padStart(2, "0") + "/" +
          String(state.selectedDate.getDate()).padStart(2, "0");
        window.open(url, "_blank");
      });
    }

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
    var html = (prefixHTML || demoBannerHTML()) +
      '<div class="events-annual" dir="rtl">' +
      '<div class="annual-header">' +
      '<h2>' + year + '</h2>' +
      '</div>' +
      '<div class="months-grid">';

    for (var m = 0; m < 12; m++) {
      var monthStart = new Date(year, m, 1);
      var monthEnd = new Date(year, m + 1, 0);
      var monthEvents = state.allEvents.filter(function (e) {
        return e.date >= monthStart && e.date <= monthEnd;
      });

      var isCurrentMonth = m === new Date().getMonth() && year === new Date().getFullYear();

      html += '<div class="month-cube' + (isCurrentMonth ? " is-current" : "") + '" data-month="' + m + '">' +
        '<div class="cube-header">' +
        '<h3>' + HEBREW_MONTHS[m] + '</h3>' +
        (isCurrentMonth ? '<span class="current-tag">עכשיו</span>' : "") +
        '</div>' +
        '<div class="cube-events">';

      // הצגת אירועים עד 3, "+X נוספים" לשאר
      monthEvents.slice(0, 3).forEach(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        html += '<div class="cube-event">' +
          '<span class="event-dot" style="background-color: ' + cat.color + ';"></span>' +
          '<span class="event-name">' + esc(e.title) + '</span>' +
          '<span class="event-day">(' + e.date.getDate() + ')</span>' +
          '</div>';
      });

      if (monthEvents.length > 3) {
        html += '<div class="cube-overflow">+' + (monthEvents.length - 3) + ' נוספים</div>';
      }

      if (monthEvents.length === 0) {
        html += '<div class="no-events">אין אירועים</div>';
      }

      html += '</div></div>';
    }

    html += '</div></div>';
    container.innerHTML = html;
    wireAnnualListeners(container);
  }

  // קליק על קובייה שנתית -> קפיצה לתצוגה החודשית של אותו חודש (לפי האפיון)
  function wireAnnualListeners(container) {
    container.querySelectorAll(".month-cube").forEach(function (cube) {
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
    var year = state.year;
    var html = demoBannerHTML() +
      '<div class="events-mobile" dir="rtl">' +
      renderPrivateEventsPanel() +
      renderMonthSelector() +
      renderAgendaList() +
      '</div>';

    container.innerHTML = html;
    wireMobileListeners(container);
  }

  function renderPrivateEventsPanel() {
    var html = '<div class="private-events-panel">' +
      '<div class="panel-header">האירועים הפרטיים שלי</div>';

    if (state.privateEvents.length === 0) {
      html += '<div class="empty-private">אין שריונים או אירועים פרטיים</div>';
    } else {
      html += '<ul class="private-list">';
      state.privateEvents.forEach(function (e) {
        var cat = CATEGORIES[e.category] || CATEGORIES.personal;
        html += '<li>' +
          '<span class="event-icon">' + cat.icon + '</span>' +
          '<span class="event-title">' + esc(e.title) + '</span>' +
          '<span class="event-date">' + e.date.getDate() + ' ' +
          HEBREW_MONTHS[e.date.getMonth()] + '</span>' +
          '</li>';
      });
      html += '</ul>';
    }

    html += '</div>';
    return html;
  }

  function renderMonthSelector() {
    var html = '<div class="month-selector-strip" dir="rtl">';
    for (var m = 0; m < 12; m++) {
      var month = new Date(state.year, m, 1);
      var isActive = m === state.currentMonth.getMonth() &&
        state.year === state.currentMonth.getFullYear();
      html += '<button type="button" class="month-pill' +
        (isActive ? " is-active" : "") +
        '" data-month="' + m + '">' +
        HEBREW_MONTHS[m].substring(0, 3) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderAgendaList() {
    var month = state.currentMonth.getMonth();
    var year = state.currentMonth.getFullYear();
    var monthStart = new Date(year, month, 1);
    var monthEnd = new Date(year, month + 1, 0);

    var monthEvents = state.allEvents.filter(function (e) {
      return e.date >= monthStart && e.date <= monthEnd;
    }).sort(function (a, b) {
      return a.date - b.date;
    });

    var html = '<div class="agenda-list" dir="rtl">';

    if (monthEvents.length === 0) {
      html += '<div class="empty-agenda">אין אירועים בחודש זה</div>';
    } else {
      var today = new Date();
      var grouped = {};

      monthEvents.forEach(function (e) {
        var key = e.date.toDateString();
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(e);
      });

      Object.keys(grouped).sort().forEach(function (key) {
        var date = new Date(key);
        var isToday = date.toDateString() === today.toDateString();

        html += '<div class="agenda-day' + (isToday ? " is-today" : "") + '">' +
          '<div class="agenda-day-header">' +
          '<strong>' + HEBREW_WEEKDAYS[date.getDay()] + ', ' +
          date.getDate() + ' ' + HEBREW_MONTHS[date.getMonth()] + '</strong>' +
          (isToday ? '<span class="today-label">היום</span>' : "") +
          '</div>';

        html += '<ul class="agenda-events">';
        grouped[key].forEach(function (e) {
          var cat = CATEGORIES[e.category] || CATEGORIES.personal;
          html += '<li>' +
            '<span class="event-icon">' + cat.icon + '</span>' +
            '<span class="event-details">' +
            '<strong>' + esc(e.title) + '</strong>' +
            '<br><small>' + cat.he + '</small>' +
            '</span>' +
            '<button type="button" class="btn-rsvp" data-event-id="' + esc(e.id) + '">אישור הגעה</button>' +
            '</li>';
        });
        html += '</ul></div>';
      });
    }

    html += '</div>';
    return html;
  }

  function wireMobileListeners(container) {
    container.querySelectorAll(".month-pill").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var month = parseInt(btn.dataset.month, 10);
        state.currentMonth = new Date(state.year, month, 1);
        renderMobileView(container);
      });
    });

    wireRsvpButtons(container);
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
   * ========================================================================== */

  // האם הצופה הנוכחי הוא בעל הרשאת ניהול כלשהי (כל תחום) — תואם PERM_ANY_ADMIN
  // בשרת. CBA.perms מתמלא ב-app.js (myPerms()) ונחשף גלובלית.
  function viewerIsAdmin() {
    return !!(window.CBA && Array.isArray(CBA.perms) && CBA.perms.length > 0);
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
          ctx.config = ctx.config || {};
          ctx.config.enabled = wantOpen;
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
    return '<div class="events-view-toggle" dir="rtl">' +
      '<button type="button" class="view-toggle-btn' +
        (state.viewMode === "monthly" ? " is-active" : "") +
        '" data-view="monthly">תצוגה חודשית</button>' +
      '<button type="button" class="view-toggle-btn' +
        (state.viewMode === "annual" ? " is-active" : "") +
        '" data-view="annual">תצוגה שנתית</button>' +
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

    // דסקטופ: טאב עליון + תצוגה חודשית/שנתית לפי state.viewMode.
    // כל render*View מקבל prefixHTML ומרכיב/מחווט את עצמו פעם אחת בדיוק —
    // כדי שלא ייערם חיווט כפול על אותם אלמנטים.
    var prefix = demoBannerHTML() + viewToggleHTML();
    if (state.viewMode === "annual") {
      renderAnnualView(container, prefix);
    } else {
      renderMonthlyView(container, prefix);
    }
    wireViewToggle(container);
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
  return {
    title: "לוח אירועים",
    render: function (container) {
      activeContainer = container;
      ensureResizeListener();
      loadEvents(new Date().getFullYear(), function () {
        if (activeContainer !== container || !container.isConnected) return; // המשתמש כבר עבר מסך
        state.selectedDate = null;
        state.currentMonth = new Date();
        state.year = new Date().getFullYear();
        draw(container);
      });
    }
  };
})();
