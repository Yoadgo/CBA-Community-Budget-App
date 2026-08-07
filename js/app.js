/* app.js — המנוע הראשי.
   בטעינה מושך נתונים מהגיליון (Google Sheets) דרך CBA.sheets; אם נכשל —
   נשאר על נתוני דמה (mock) ומסמן זאת. מנהל את מתג השנה, כפתור המשתמש, וציור המסכים. */
(function () {
  "use strict";

  const nav      = document.getElementById("app-nav");
  const main     = document.getElementById("app-main");
  const yearBox  = document.getElementById("year-switch");
  const controls = document.getElementById("app-controls");
  let currentScreen = "budget";

  // opts.silent=true — עדכון רקע (poll) ולא ניווט של המשתמש: לא מפעילים את
  // אנימציית "הכניסה" של כל המסך (פייד + הזזה קלה), כדי שרענון נתונים לא
  // יגרום למסך "לקפוץ"/לרצד. הדרך היחידה שבה עדכון רקע נראה לעין היא ה"פולס"
  // על המספרים הבודדים שבאמת השתנו (ר' pulseChangedValues / applyPulse).
  function showScreen(name, opts) {
    const screen = CBA.screens[name];
    if (!screen) return;
    // חסימת גישה: לא מציגים מסך שאינו שייך לאזור הנוכחי (תושב לא ניגש למסכי ניהול)
    if (AREAS[currentArea] && AREAS[currentArea].screens.indexOf(name) === -1) return;
    const silent = !!(opts && opts.silent);
    const before = silent ? pulseSnapshot(main) : null;
    currentScreen = name;
    main.innerHTML = "";
    document.body.dataset.screen = name;
    screen.render(main, opts);
    if (silent) {
      applyPulse(main, before);
    } else {
      // אנימציית כניסה עדינה בכל החלפת מסך יזומה ע"י המשתמש (re-trigger ע"י reflow)
      main.classList.remove("screen-enter");
      void main.offsetWidth;
      main.classList.add("screen-enter");
    }
    nav.querySelectorAll(".app-nav__tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.screen === name);
    });
    // הצגת כפתור "צור שנה" רק בבניית תקציב נשלטת ב-CSS לפי body[data-screen]
    saveRoute();   // זוכרים איפה היינו — כדי שרענון עמוד (F5) יחזיר לכאן
  }

  /* ==========================================================================
     הרשאות ומידור (2026-08-07)
     --------------------------------------------------------------------------
     כל מי שרשום ופעיל הוא **תושב** — זו רמת הבסיס, וכולם מקבלים אותה.
     מעליה יש **מידורים**, כל אחד פותח קבוצת מסכים אחת:
        תקציב  → תכנון מול ביצוע, ניהול הוצאות, בניית תקציב
        מועדון → שריון מועדון (ניהול)
        תושבים → מסך התושבים ובקשות ההרשמה
     **מנהל על** ('על') רואה הכול והוא היחיד שרשאי לשנות הרשאות.

     כאן מסתירים תוכן. האכיפה האמיתית היא בשרת (authorize_ ב-Code.gs) — הסתרה
     לבדה היא נוחות, לא אבטחה.
     ========================================================================== */
  const PERM = { SUPER: "על", BUDGET: "תקציב", CLUB: "מועדון", RESIDENTS: "תושבים" };
  const PERM_LABEL = {
    "על": "מנהל על", "תקציב": "ניהול תקציב ותשלומים",
    "מועדון": "ניהול מועדון", "תושבים": "ניהול תושבים"
  };
  // איזו הרשאה נדרשת לכל מסך ניהול
  const SCREEN_PERM = {
    budget: PERM.BUDGET, expenses: PERM.BUDGET, planning: PERM.BUDGET,
    clubAdmin: PERM.CLUB, residents: PERM.RESIDENTS, settings: PERM.SUPER
  };

  function myPerms() {
    var u = simUser || currentUser;
    if (!u) return [];
    if (Array.isArray(u.perms)) return u.perms;
    // תאימות לאחור: מושב ישן/הדמיה שנשמרו לפני שהיו הרשאות
    return (u.role && u.role.indexOf("מנהל") !== -1) ? [PERM.SUPER] : [];
  }
  function isSuper() { return myPerms().indexOf(PERM.SUPER) !== -1; }
  function can(perm) { return !perm || isSuper() || myPerms().indexOf(perm) !== -1; }
  function canScreen(name) { return !SCREEN_PERM[name] || can(SCREEN_PERM[name]); }
  // האם יש למשתמש בכלל דריסת רגל באזור הניהול
  function hasAnyAdmin() {
    return isSuper() || [PERM.BUDGET, PERM.CLUB, PERM.RESIDENTS].some(function (p) {
      return myPerms().indexOf(p) !== -1;
    });
  }
  // תיאור ההרשאה להצגה בתפריט המשתמש
  function myRoleLabel() {
    if (isSuper()) return "מנהל על";
    var ps = myPerms().filter(function (p) { return p !== PERM.SUPER; });
    return ps.length ? ps.map(function (p) { return PERM_LABEL[p] || p; }).join(" · ") : "תושב";
  }

  /* --- אזורים: ניהול מול תושב. לכל אזור טאבים ומסכים משלו.
     האזור הניהולי מסונן לפי ההרשאות — מי שיש לו רק "מועדון" יראה טאב אחד. --- */
  let currentArea = "admin";
  const AREAS_ALL = {
    admin: {
      def: "budget",
      screens: ["budget", "expenses", "planning", "clubAdmin", "residents", "settings"],
      tabs: [["budget", "תכנון מול ביצוע"], ["expenses", "ניהול הוצאות"], ["planning", "בניית תקציב"], ["clubAdmin", "שריון מועדון"], ["residents", "תושבים"]]
    },
    resident: {
      def: "resRequests",
      screens: ["resRequests", "resSubmit", "resReserve"],
      tabs: [["resRequests", "הבקשות שלי"], ["resSubmit", "הגשת קבלה"], ["resReserve", "שריון מועדון"]]
    }
  };
  // AREAS הוא תצוגה מסוננת של AREAS_ALL לפי ההרשאות של המשתמש הנוכחי. הוא נבנה
  // מחדש בכל התחברות/החלפת משתמש/כניסה ויציאה ממצב הדמיה (ר' applyUser).
  let AREAS = JSON.parse(JSON.stringify(AREAS_ALL));
  function rebuildAreas() {
    var a = AREAS_ALL.admin;
    var screens = a.screens.filter(canScreen);
    var tabs = a.tabs.filter(function (t) { return canScreen(t[0]); });
    AREAS = {
      admin: { def: (tabs[0] && tabs[0][0]) || "budget", screens: screens, tabs: tabs },
      resident: AREAS_ALL.resident
    };
  }
  // אייקוני קו מונוכרומיים לטאבים (דסקטופ). במובייל האייקון מגיע מ-CSS mask (::before)
  var NAV_ICONS = {
    budget:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21v-8M12 21V4M19 21v-6"/></svg>',
    expenses:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
    planning:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
    clubAdmin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8.5 15l2 2 4-4"/></svg>',
    resRequests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6h9M11 12h9M11 18h9"/><path d="M4 6l1.3 1.3L7 4.7M4 12l1.3 1.3L7 10.7M4 18l1.3 1.3L7 16.7"/></svg>',
    resSubmit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    resReserve:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>'
  };
  function renderNav(area) {
    if (!nav) return;
    // שומרים את "המחוון הנוזלי" (nav-indicator, מתווסף ע"י motion.js) לפני שמוחקים
    // את תוכן הניווט — אחרת הוא נהרס ונוצר מחדש בכל רענון, וזה מה שגרם לרקע השחור
    // מתחת לטאב הפעיל "לרוץ" מחדש מאפס בכל רענון תגיות, במקום פשוט להישאר במקום.
    var keepIndicator = nav.querySelector(".nav-indicator");
    if (keepIndicator && keepIndicator.parentNode) keepIndicator.parentNode.removeChild(keepIndicator);
    nav.innerHTML = AREAS[area].tabs.map(function (t) {
      var ico = NAV_ICONS[t[0]] ? '<span class="app-nav__ico">' + NAV_ICONS[t[0]] + '</span>' : '';
      var n = navBadgeCount(t[0]);
      var badge = n ? '<span class="nav-badge">' + (n > 9 ? "9+" : n) + '</span>' : '';
      // מסמנים "פעיל" לפי המסך הנוכחי (לא תמיד הראשון ברשימה) — כדי שרענון תגיות
      // ההתרעות (שקורה כל כמה שניות, ראה refreshAlerts) לא "יקפיץ" את הטאב הפעיל.
      return '<button class="app-nav__tab' + (t[0] === currentScreen ? " is-active" : "") + '" data-screen="' + t[0] + '">' + ico + CBA.esc(t[1]) + badge + '</button>';
    }).join("");
    if (keepIndicator) nav.insertBefore(keepIndicator, nav.firstChild);
  }
  /* --- התרעות (2026-08): שני מקורות —
     (א) מקומי, מיידי, מהזיכרון: הוצאות ממתינות/בבדיקה + סעיפים בחריגת תקציב
         (CBA.data.getAlertCounts) — מחושב בלי קריאת רשת, אפשר לרענן בתדירות גבוהה.
     (ב) שריוני מועדון ממתינים לאישור מנהל: דורש קריאת רשת (Calendar דרך Apps
         Script) — מרוענן בתדירות נמוכה יותר ורק כשמחוברים כמנהל, כדי לא להעמיס.
     שתי התוצאות מוצגות בשלושה מקומות: נקודה אדומה על כפתור המשתמש, תגית מספר
     על טאבי הניווט הרלוונטיים ("ניהול הוצאות"/"שריון מועדון"), ורשימה אמיתית
     בתוך המגש הנפתח (userPanelHTML) — כל אלה קודם היו קיימים ויזואלית אבל לא
     הציגו שום דבר אמיתי (הפעמון תמיד אמר "אין התראות חדשות"). */
  var notif = { pendingExpenses: 0, reviewExpenses: 0, overBudget: 0, pendingClub: 0, clubChecked: false };
  var clubAlertsInFlight = false;

  function navBadgeCount(screenKey) {
    if (screenKey === "expenses") return can(PERM.BUDGET) ? notif.pendingExpenses + notif.reviewExpenses : 0;
    if (screenKey === "clubAdmin") return can(PERM.CLUB) ? notif.pendingClub : 0;
    return 0;
  }
  // ההתראות מסוננות לפי הרשאה — מי שמנהל רק את המועדון לא צריך לראות חריגות תקציב
  function alertsTotal() {
    return (can(PERM.BUDGET) ? notif.pendingExpenses + notif.reviewExpenses + notif.overBudget : 0) +
           (can(PERM.CLUB) ? notif.pendingClub : 0);
  }

  function refreshAlertsLocal() {
    if (!(window.CBA.data && CBA.data.getAlertCounts)) return;
    var c = CBA.data.getAlertCounts();
    // מרעננים ניווט/תפריט משתמש רק אם מספר ההתראות באמת השתנה — קודם זה קרה
    // בכל מחזור (כל 3 שניות) גם כשכלום לא השתנה, וזה מה שגרם לניווט "להבהב".
    var changed = c.pendingExpenses !== notif.pendingExpenses || c.reviewExpenses !== notif.reviewExpenses || c.overBudget !== notif.overBudget;
    notif.pendingExpenses = c.pendingExpenses;
    notif.reviewExpenses = c.reviewExpenses;
    notif.overBudget = c.overBudget;
    if (inited && changed) { renderNav(currentArea); renderControls(); }
  }
  function refreshAlertsClub() {
    if (clubAlertsInFlight) return;
    if (!(can(PERM.CLUB) && window.CBA.connected && CBA.data && CBA.data.getClubList)) return;
    clubAlertsInFlight = true;
    CBA.data.getClubList(function (res) {
      clubAlertsInFlight = false;
      if (res && res.ok) {
        notif.pendingClub = (res.reservations || []).filter(function (r) { return r.status === "pending"; }).length;
        notif.clubChecked = true;
        if (inited) { renderNav(currentArea); renderControls(); }
      }
    });
  }
  // חשוף לשאר המסכים (למשל expenses.js אחרי כל פעולה) כדי שהתגיות יתעדכנו מיד,
  // בלי לחכות למחזור הרענון התקופתי.
  window.CBA.refreshAlerts = function () { refreshAlertsLocal(); refreshAlertsClub(); };
  // מסך "שריון מועדון — ניהול" כבר שולף בעצמו את רשימת השריונים (לתצוגה שלו) —
  // כך הוא יכול לעדכן את הספירה הגלובלית ישירות בלי קריאת רשת כפולה.
  window.CBA.setClubPendingCount = function (n) {
    notif.pendingClub = n; notif.clubChecked = true;
    if (inited) { renderNav(currentArea); renderControls(); }
  };

  function setArea(area) {
    if (area === "admin" && !hasAnyAdmin()) area = "resident";   // אין הרשאת ניהול — אין אזור ניהול
    if (!AREAS[area]) area = "resident";
    currentArea = area;
    document.body.dataset.area = area;
    renderNav(area);
    renderControls();   // מרענן את תפריט המשתמש כדי שמתג המעבר ישקף את האזור הנוכחי
    showScreen(AREAS[area].def);
  }
  // ניתוב לפי תפקיד: מנהל → אזור ניהול (עם מעבר לתושב); תושב → אזור תושב בלבד.
  // משתמש ב-initialRoute (לא setArea) כדי לשחזר את המסך האחרון אם רענון עמוד הביא אותנו לכאן.
  /* ---------- מצב הדמיית תושב (כלי פיתוח, 2026-08-06) ----------
     מאפשר למנהל להיכנס לאזור התושב "בתור" תושב מסוים ולראות בדיוק מה הוא רואה.
     זהות ההדמיה חיה בזיכרון בלבד — רענון דף מחזיר לזהות האמיתית, וכל הכתיבות
     לגיליון ממשיכות להתבצע תחת המשתמש האמיתי. כלי זמני לשלב הפיתוח. */
  let simUser = null;
  function applyUser() {
    window.CBA.user = simUser || currentUser;
    window.CBA.perms = myPerms();
    window.CBA.isSuper = isSuper();
    rebuildAreas();
  }
  window.CBA.isSimulating = function () { return !!simUser; };

  function startSim(opt) {
    simUser = { name: opt.label, email: "(הדמיה)", role: "תושב", perms: [], familyId: opt.rid, house: opt.rid };
    applyUser();
    renderSimBanner();
    setArea("resident");
  }
  function stopSim() {
    simUser = null;
    applyUser();
    renderSimBanner();
    setArea(hasAnyAdmin() ? "admin" : "resident");
  }
  function renderSimBanner() {
    let bar = document.getElementById("sim-banner");
    if (!simUser) { if (bar) bar.remove(); document.body.classList.remove("has-sim"); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "sim-banner";
      bar.className = "sim-banner";
      document.body.appendChild(bar);
    }
    bar.innerHTML =
      '<span class="sim-banner__txt">מצב הדמיה — רואה בתור <b>' + CBA.esc(simUser.name) + '</b></span>' +
      '<button type="button" class="sim-banner__x" id="sim-exit">צא מהדמיה</button>';
    document.body.classList.add("has-sim");
    bar.querySelector("#sim-exit").addEventListener("click", stopSim);
  }

  /* בורר התושב להדמיה — משתמש באותה רשימת תושבים של השלמת השמות בטופס ההוצאות */
  function openSimPicker() {
    const wrap = document.createElement("div");
    wrap.className = "peek-backdrop";
    wrap.id = "sim-picker";
    wrap.innerHTML =
      '<div class="peek sim-pick" role="dialog" aria-label="בחירת תושב להדמיה">' +
        '<div class="peek__head"><span class="peek__title">הדמיית תושב</span>' +
          '<button class="peek__x" aria-label="סגור">×</button></div>' +
        '<div class="sim-pick__body">' +
          '<input class="field-input" id="sim-q" type="text" placeholder="הקלד/י שם תושב…" autocomplete="off">' +
          '<div class="sim-pick__list" id="sim-list"><div class="sim-pick__empty">טוען רשימת תושבים…</div></div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    const close = function () { wrap.remove(); };
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    wrap.querySelector(".peek__x").addEventListener("click", close);

    const listEl = wrap.querySelector("#sim-list");
    const qEl = wrap.querySelector("#sim-q");
    CBA.data.residentPickerOptions(function (opts) {
      const all = opts || [];
      if (!all.length) { listEl.innerHTML = '<div class="sim-pick__empty">לא הצלחנו לטעון את רשימת התושבים</div>'; return; }
      function draw() {
        const q = (qEl.value || "").trim();
        const idx = all.map(function (o, i) { return i; })
          .filter(function (i) { return !q || all[i].label.indexOf(q) !== -1; })
          .slice(0, 60);
        listEl.innerHTML = idx.length
          ? idx.map(function (i) { return '<button type="button" class="sim-pick__item" data-i="' + i + '">' + CBA.esc(all[i].label) + '</button>'; }).join("")
          : '<div class="sim-pick__empty">לא נמצא תושב בשם הזה</div>';
      }
      draw();
      qEl.addEventListener("input", draw);
      listEl.addEventListener("click", function (e) {
        const b = e.target.closest("[data-i]"); if (!b) return;
        const opt = all[parseInt(b.dataset.i, 10)];
        if (opt) { close(); startSim(opt); }
      });
      qEl.focus();
    });
  }

  function routeByRole() {
    applyUser();
    initialRoute(hasAnyAdmin() ? "admin" : "resident");
  }

  /* שלד טעינה — מבנה shimmer שדומה למסך התקציב, כדי שהמעבר לא ירגיש קופצני */
  function skeletonScreen() {
    return (
      '<div class="screen-enter">' +
        '<div class="skeleton sk-h1"></div>' +
        '<div class="skeleton sk-h2"></div>' +
        '<div class="sk-summary">' +
          '<div class="skeleton sk-stat"></div>'.repeat(4) +
        '</div>' +
        '<div class="sk-cards">' +
          '<div class="skeleton sk-card sk-tall"></div>' +
          '<div class="skeleton sk-card"></div>' +
        '</div>' +
      '</div>'
    );
  }

  /* טוסט קצר "מעודכן" — מוצג רק כשרענון הרקע הביא נתונים אחרי שכבר הצגנו מטמון */
  function toastRefreshed() {
    var t = document.createElement("div");
    t.className = "refresh-toast";
    t.innerHTML = '<span class="dot"></span>מעודכן';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 1900);
  }

  /* טביעת אצבע קלה של הנתונים הנוכחיים — כדי לדעת אם רענון (מחזורי או ראשוני)
     באמת הביא נתונים שונים, לפני שמטריחים את המסך לצייר את עצמו מחדש. בלי זה,
     כל רענון (כל 3 שניות!) פירק ובנה מחדש את המסך גם כשכלום לא השתנה — זו הסיבה
     לתזוזה/הבהוב שיועד דיווח עליהם. */
  var lastDataFingerprint = null;
  function dataFingerprint() {
    try { return CBA.mock.currentYear + "|" + JSON.stringify(CBA.mock.years); }
    catch (e) { return null; }   // נכשל? מתייחסים כאילו תמיד השתנה — פחות יעיל אבל בטוח
  }

  /* "פולס" על מספרים שהשתנו בעדכון רקע — במקום להבהב/להזיז את כל המסך.
     כל אלמנט שמסמן את עצמו כ-[data-pulse-key="..."] (מסכים בוחרים אילו ערכים
     "שווה" לפולס — בד"כ סכומי כסף מרכזיים) נסרק לפני שהמסך נהרס ונבנה מחדש;
     אחרי הבנייה מחדש, כל אלמנט עם אותו מפתח שהטקסט שלו השתנה מקבל קלאס רגעי
     שמפעיל אנימציית "דופק" קלה (ר' .value-pulse ב-loading.css). */
  function pulseSnapshot(root) {
    var map = {};
    root.querySelectorAll("[data-pulse-key]").forEach(function (el) {
      map[el.dataset.pulseKey] = el.textContent;
    });
    return map;
  }
  function applyPulse(root, before) {
    if (!before) return;
    root.querySelectorAll("[data-pulse-key]").forEach(function (el) {
      var key = el.dataset.pulseKey;
      if (Object.prototype.hasOwnProperty.call(before, key) && before[key] !== el.textContent) {
        el.classList.add("value-pulse");
        el.addEventListener("animationend", function onEnd() {
          el.classList.remove("value-pulse");
          el.removeEventListener("animationend", onEnd);
        });
      }
    });
  }

  /* --- אזור הבקרה (פינה שמאלית עליונה): כפתור משתמש שפותח מגש --- */
  const GOOGLE_CLIENT_ID = "312365638466-l1tug16dd953t08khr9f8qrh76iro46i.apps.googleusercontent.com";
  let panelOutsideBound = false;
  let googleReady = false;
  let currentUser = null;   // {name,email,picture,role,family,house} אחרי התחברות מאומתת
  let loginError = null;

  /* --- מושב מתמשך: זוכר משתמש מאומת ~12ש', כדי לא להבזיק מסך כניסה בכל רענון.
     הערה: זו נוחות תצוגה בלבד — לא אבטחה. אבטחת אמת = אימות טוקן ב-GAS בכל כתיבה. --- */
  // v2 (2026-08-07): המבנה השתנה — המושב מחזיק עכשיו גם טוקן חתום מהשרת וגם את
  // רשימת ההרשאות. שינוי המפתח מאלץ התחברות אחת מחדש לכל המשתמשים, וזה מכוון:
  // מושב ישן לא מכיל טוקן, ובלעדיו השרת ידחה כל כתיבה.
  var SESSION_KEY = "cba_session_v2";
  var SESSION_TTL = 12 * 3600 * 1000;   // 12 שעות
  function saveSession(user) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ exp: Date.now() + SESSION_TTL, user: user })); } catch (e) {}
  }
  function loadSession() {
    try {
      var s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (!s || !s.user || !s.exp || s.exp < Date.now()) { localStorage.removeItem(SESSION_KEY); return null; }
      // בלי טוקן חתום אין טעם להמשיך — כל כתיבה תידחה בשרת. עדיף מסך התחברות.
      if (!s.user.session) { localStorage.removeItem(SESSION_KEY); return null; }
      window.CBA.authSession = s.user.session;
      return s.user;
    } catch (e) { return null; }
  }
  function clearSession() { window.CBA.authSession = ""; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }

  /* --- מיקום אחרון: זוכר איזה אזור/מסך היו פתוחים, כדי שרענון עמוד (F5) יחזיר
     למקום שהיינו בו במקום לקפוץ תמיד למסך ברירת המחדל. --- */
  var ROUTE_KEY = "cba_last_route_v1";
  function saveRoute() {
    try { localStorage.setItem(ROUTE_KEY, JSON.stringify({ area: currentArea, screen: currentScreen })); } catch (e) {}
  }
  function loadRoute() {
    try { return JSON.parse(localStorage.getItem(ROUTE_KEY) || "null"); } catch (e) { return null; }
  }
  function clearRoute() { try { localStorage.removeItem(ROUTE_KEY); } catch (e) {} }
  // כניסה ראשונית לאזור: משחזר את המסך השמור אם הוא שייך לאזור הזה, אחרת ברירת המחדל
  function initialRoute(area) {
    if (area === "admin" && !hasAnyAdmin() && currentUser) area = "resident";
    if (!AREAS[area]) area = "resident";
    currentArea = area;
    document.body.dataset.area = area;
    renderNav(area);
    renderControls();
    var saved = loadRoute();
    var target = (saved && saved.area === area && AREAS[area].screens.indexOf(saved.screen) !== -1)
      ? saved.screen : AREAS[area].def;
    showScreen(target);
  }

  // אייקוני קו מונוכרומיים (currentColor) — ללא אימוג'ים צבעוניים
  const ICON = {
    bell: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    gear: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    logout: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    swap: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 4l3 3-3 3"/><path d="M20 7H8a4 4 0 0 0-4 4"/><path d="M7 20l-3-3 3-3"/><path d="M4 17h12a4 4 0 0 0 4-4"/></svg>'
  };

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "•";
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function renderControls() {
    if (!controls) return;
    const avatarMode = !!(currentUser && currentUser.picture);
    // הנקודה האדומה מוצגת רק למנהל (כולל כשהוא באזור התושב דרך המתג) — לתושב
    // רגיל אין גישה להתרעות ניהוליות, אז גם לא מציגים לו רמז עליהן.
    const hasAlerts = alertsTotal() > 0 && hasAnyAdmin();
    controls.innerHTML =
      '<button class="user-btn' + (avatarMode ? ' user-btn--avatar' : '') + '" id="user-btn" title="תפריט משתמש" aria-label="תפריט משתמש">' + userBtnFace() +
        (hasAlerts ? '<span class="user-btn__dot" aria-hidden="true"></span>' : '') + '</button>' +
      '<div class="user-panel" id="user-panel" hidden>' + userPanelHTML() + '</div>';

    const panel = controls.querySelector("#user-panel");
    const btn = controls.querySelector("#user-btn");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      btn.classList.toggle("is-open", !panel.hidden);
      if (!panel.hidden) { renderGoogleButton(); refreshAlertsClub(); }   // ציור כפתור גוגל + בדיקת התרעות טריות רק כשהמגש גלוי
    });
    const setBtn = panel.querySelector("[data-panel-settings]");
    if (setBtn) setBtn.addEventListener("click", function () {
      panel.hidden = true; btn.classList.remove("is-open"); showScreen("settings");
    });
    const swBtn = panel.querySelector("[data-panel-switch]");
    if (swBtn) swBtn.addEventListener("click", function () {
      panel.hidden = true; btn.classList.remove("is-open"); setArea(swBtn.dataset.panelSwitch);
    });
    panel.querySelectorAll("[data-panel-goto]").forEach(function (gBtn) {
      gBtn.addEventListener("click", function () {
        panel.hidden = true; btn.classList.remove("is-open");
        const target = gBtn.dataset.panelGoto;
        if (currentArea !== "admin" && hasAnyAdmin()) setArea("admin");
        if (target === "expenses-pending" && CBA.screens.expenses && CBA.screens.expenses.showPending) CBA.screens.expenses.showPending();
        else showScreen(target);
      });
    });
    const simBtn = panel.querySelector("[data-panel-sim]");
    if (simBtn) simBtn.addEventListener("click", function () {
      panel.hidden = true; btn.classList.remove("is-open"); openSimPicker();
    });
    const simStopBtn = panel.querySelector("[data-panel-simstop]");
    if (simStopBtn) simStopBtn.addEventListener("click", function () {
      panel.hidden = true; btn.classList.remove("is-open"); stopSim();
    });
    const outBtn = panel.querySelector("[data-panel-logout]");
    if (outBtn) outBtn.addEventListener("click", logout);

    if (!panelOutsideBound) {   // סגירה בלחיצה מחוץ למגש — נרשם פעם אחת בלבד
      panelOutsideBound = true;
      document.addEventListener("click", function (e) {
        const p = document.getElementById("user-panel");
        if (p && !p.hidden && !controls.contains(e.target)) {
          p.hidden = true;
          const b = document.getElementById("user-btn");
          if (b) b.classList.remove("is-open");
        }
      });
    }
  }

  function userBtnFace() {
    if (currentUser && currentUser.picture) return '<img class="up-avatar-img" src="' + CBA.esc(currentUser.picture) + '" alt="">';
    if (currentUser) return '<span class="up-initials">' + CBA.esc(initials(currentUser.name || currentUser.email)) + '</span>';
    return '<span class="up-initials">•</span>';
  }

  function userPanelHTML() {
    // גרסת השרת + האם יש מושב חתום. שתי העובדות האלה מסבירות כמעט כל תקלת
    // "אין הרשאה": שרת ישן שעוד לא עודכן, או מושב שפג/לא הונפק.
    var srvVer = (CBA.mock && CBA.mock._serverVersion) || "";
    var hasSess = !!window.CBA.authSession;
    const conn = window.CBA.connected === true
      ? '<span class="up-status up-status--on"><span class="up-dot"></span>מחובר לגיליון' +
        (srvVer ? ' <span class="up-ver">· ' + CBA.esc(srvVer) + '</span>' : '') +
        (currentUser && !hasSess ? ' <span class="up-ver up-ver--warn">· ללא מושב</span>' : '') + '</span>'
      : (window.CBA.connected === false ? '<span class="up-status up-status--off"><span class="up-dot"></span>לא מחובר · נתוני דמו</span>' : '');

    let head, action;
    if (currentUser) {
      const avatar = currentUser.picture
        ? '<img class="up-avatar-img" src="' + CBA.esc(currentUser.picture) + '" alt="">'
        : '<span class="up-avatar">' + CBA.esc(initials(currentUser.name || currentUser.email)) + '</span>';
      head =
        '<div class="up-head">' + avatar +
          '<div class="up-head__txt">' +
            '<div class="up-name">' + CBA.esc(currentUser.name || currentUser.email) + '</div>' +
            '<div class="up-sub">' + CBA.esc(currentUser.email) + '</div>' +
          '</div>' +
          '<span class="up-role">' + CBA.esc(myRoleLabel()) + '</span>' +
        '</div>';
      action = '<button class="up-item up-item--logout" data-panel-logout><span class="up-row__ico">' + ICON.logout + '</span>יציאה</button>';
    } else {
      head =
        '<div class="up-head"><span class="up-avatar">•</span>' +
          '<div class="up-head__txt"><div class="up-name">אורח</div><div class="up-sub">לא מחובר לחשבון</div></div></div>' +
        (loginError ? '<div class="up-err">' + CBA.esc(loginError) + '</div>' : '') +
        '<div class="up-signin" id="g-signin"></div>';
      action = "";
    }

    // מתג המעבר בין האזורים מוצג רק למי שיש לו בכלל הרשאת ניהול כלשהי
    var switchItem = hasAnyAdmin()
      ? (currentArea === "admin"
          ? '<button class="up-item" data-panel-switch="resident"><span class="up-row__ico">' + ICON.swap + '</span>עבור לאזור תושב</button>'
          : '<button class="up-item" data-panel-switch="admin"><span class="up-row__ico">' + ICON.swap + '</span>חזרה לאזור ניהול</button>')
      : "";
    // הגדרות — מנהל על בלבד
    var settingsItem = (currentArea === "admin" && isSuper())
      ? '<button class="up-item" data-panel-settings><span class="up-row__ico">' + ICON.gear + '</span>הגדרות</button>'
      : "";
    // הדמיית תושב — כלי רב-עוצמה (רואים דרכו נתונים של אחרים), מנהל על בלבד
    var simItem = isSuper()
      ? (window.CBA.isSimulating && window.CBA.isSimulating()
          ? '<button class="up-item up-item--sim" data-panel-simstop><span class="up-row__ico">' + ICON.swap + '</span>צא ממצב הדמיה</button>'
          : '<button class="up-item up-item--sim" data-panel-sim><span class="up-row__ico">' + ICON.swap + '</span>הדמיית תושב</button>')
      : "";

    return (
      head +
      '<div class="up-row">' + conn + '</div>' +
      notifItemsHTML() +
      '<div class="up-sep"></div>' +
      switchItem +
      simItem +
      settingsItem +
      action
    );
  }

  /* רשימת ההתרעות בפועל בתוך המגש — קודם תמיד הציגה "אין התראות חדשות" גם כשהיו
     שריונים/הוצאות שממתינים; עכשיו שורה אמיתית לכל סוג התרעה עם ספירה ולחיצה
     שקופצת ישר למסך הרלוונטי. תושבים לא רואים התרעות ניהוליות (בשלב זה). */
  function notifItemsHTML() {
    if (!hasAnyAdmin()) {
      return '<div class="up-row"><span class="up-row__ico">' + ICON.bell + '</span><span>אין התראות חדשות</span></div>';
    }
    var items = [];
    if (can(PERM.BUDGET)) {
      if (notif.pendingExpenses) items.push({ n: notif.pendingExpenses, label: "הוצאות ממתינות לאישור", target: "expenses-pending" });
      if (notif.reviewExpenses) items.push({ n: notif.reviewExpenses, label: "הוצאות בבדיקה", target: "expenses-pending" });
      if (notif.overBudget) items.push({ n: notif.overBudget, label: notif.overBudget === 1 ? "סעיף אחד בחריגת תקציב" : notif.overBudget + " סעיפים בחריגת תקציב", target: "budget" });
    }
    if (can(PERM.CLUB) && notif.pendingClub) items.push({ n: notif.pendingClub, label: "שריוני מועדון ממתינים לאישור", target: "clubAdmin" });
    if (!items.length) {
      var msg = notif.clubChecked ? "אין התראות חדשות" : "בודק התראות…";
      return '<div class="up-row"><span class="up-row__ico">' + ICON.bell + '</span><span>' + msg + '</span></div>';
    }
    return items.map(function (it) {
      return '<button type="button" class="up-item up-item--alert" data-panel-goto="' + it.target + '">' +
        '<span class="up-row__ico">' + ICON.bell + '</span>' +
        '<span class="up-alert__txt">' + CBA.esc(it.label) + '</span>' +
        '<span class="up-alert__n">' + it.n + '</span>' +
        '</button>';
    }).join("");
  }

  /* --- כניסת Google (Identity Services) --- */
  function initGoogle() {
    if (googleReady || !(window.google && google.accounts && google.accounts.id)) return;
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: onGoogleLogin,
      auto_select: true   // התחברות אוטומטית לחוזרים — פחות חיכוך בכל רענון
    });
    googleReady = true;
  }
  // GIS קורא לזה כשהספרייה נטענת — מאתחל ומצייר את הכפתור שקיים כרגע
  window.onGoogleLibraryLoad = function () { initGoogle(); renderGateButton(); renderGoogleButton(); };

  // כפתור גוגל בתוך המגש (רלוונטי רק אחרי יציאה ידנית)
  function renderGoogleButton() {
    if (!googleReady) { initGoogle(); }
    if (!googleReady) return;
    const el = document.getElementById("g-signin");
    if (!el || el.childElementCount) return;
    google.accounts.id.renderButton(el, {
      type: "standard", theme: "outline", size: "large",
      shape: "pill", text: "signin_with", locale: "he", width: 236
    });
  }

  /* --- מסך כניסה חוסם: חובה להתחבר לפני שרואים את האפליקציה --- */
  function showLoginGate() {
    let gate = document.getElementById("login-gate");
    if (!gate) {
      gate = document.createElement("div");
      gate.id = "login-gate"; gate.className = "login-gate";
      document.body.appendChild(gate);
    }
    gate.hidden = false;
    document.body.classList.add("is-gated");
    gate.innerHTML =
      '<div class="login-card">' +
        '<div class="login-logo">' + CBA.logoSVG(28) + '</div>' +
        '<h1 class="login-title">ניהול קהילה</h1>' +
        '<p class="login-sub">התחברות לחברי הקהילה</p>' +
        (loginError ? '<div class="up-err">' + CBA.esc(loginError) + '</div>' : '') +
        '<div class="login-btn" id="gate-signin"></div>' +
        // מוצג רק אחרי התחברות מוצלחת לגוגל שהמייל שלה אינו ברשימת התושבים
        (signupToken
          ? '<button type="button" class="login-signup" id="gate-signup">בקשת הרשמה לקהילה</button>'
          : '') +
      '</div>';
    renderGateButton();
    const su = document.getElementById("gate-signup");
    if (su) su.addEventListener("click", openSignupForm);
  }

  /* ---------- טופס בקשת הרשמה (2026-08-07) ----------
     נשלח יחד עם טוקן גוגל שהשרת מאמת, כך שהמייל בבקשה תמיד אמיתי. */
  let signupToken = null;
  let signupPrefill = null;

  function openSignupForm() {
    const guess = (signupPrefill && signupPrefill.name || "").trim().split(/\s+/);
    const old = document.getElementById("signup-modal");
    if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "signup-modal";
    wrap.className = "peek-backdrop";
    wrap.innerHTML =
      '<div class="peek signup-card" role="dialog" aria-label="בקשת הרשמה">' +
        '<div class="peek__head"><span class="peek__title">בקשת הרשמה לקהילה</span>' +
          '<button class="peek__x" aria-label="סגור">×</button></div>' +
        '<div class="signup-body">' +
          '<p class="signup-note">הבקשה תישלח לוועד לאישור. נשלח אליך גישה לאחר האישור.</p>' +
          '<div class="form-field"><label>אימייל</label>' +
            '<input class="field-input" value="' + CBA.esc(signupPrefill ? signupPrefill.email : "") + '" disabled></div>' +
          '<div class="form-field"><label>שם פרטי</label>' +
            '<input class="field-input" id="su-first" value="' + CBA.esc(guess[0] || "") + '"></div>' +
          '<div class="form-field"><label>שם משפחה</label>' +
            '<input class="field-input" id="su-last" value="' + CBA.esc(guess.slice(1).join(" ")) + '"></div>' +
          '<div class="form-field"><label>מספר בית</label>' +
            '<input class="field-input" id="su-house" inputmode="numeric"></div>' +
          '<div class="signup-msg" id="su-msg" hidden></div>' +
          '<button type="button" class="btn-primary signup-send" id="su-send">שלח בקשה</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    const close = function () { wrap.remove(); };
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    wrap.querySelector(".peek__x").addEventListener("click", close);

    const msg = wrap.querySelector("#su-msg");
    const send = wrap.querySelector("#su-send");
    send.addEventListener("click", function () {
      const first = wrap.querySelector("#su-first").value.trim();
      const last = wrap.querySelector("#su-last").value.trim();
      const house = wrap.querySelector("#su-house").value.trim();
      if (!first || !last || !house) {
        msg.hidden = false; msg.className = "signup-msg signup-msg--err";
        msg.textContent = "צריך למלא שם פרטי, שם משפחה ומספר בית.";
        return;
      }
      send.disabled = true; send.textContent = "שולח…";
      const q = "?action=submitSignup&token=" + encodeURIComponent(signupToken) +
        "&firstName=" + encodeURIComponent(first) +
        "&lastName=" + encodeURIComponent(last) +
        "&house=" + encodeURIComponent(house);
      fetch(CBA.sheets.url + q)
        .then(function (r) { return r.json(); })
        .then(function (d) {
          msg.hidden = false;
          if (d && d.ok) {
            msg.className = "signup-msg signup-msg--ok";
            msg.textContent = d.duplicate ? "בקשה שלך כבר ממתינה לאישור." : "הבקשה נשלחה. נעדכן אותך לאחר האישור.";
            send.style.display = "none";
          } else {
            msg.className = "signup-msg signup-msg--err";
            msg.textContent = (d && d.error) || "שליחת הבקשה נכשלה.";
            send.disabled = false; send.textContent = "שלח בקשה";
          }
        })
        .catch(function () {
          msg.hidden = false; msg.className = "signup-msg signup-msg--err";
          msg.textContent = "שגיאת תקשורת. נסה שוב.";
          send.disabled = false; send.textContent = "שלח בקשה";
        });
    });
  }

  function renderGateButton() {
    if (!googleReady) { initGoogle(); }
    if (!googleReady) return;
    const el = document.getElementById("gate-signin");
    if (!el || el.childElementCount) return;   // כבר צויר — לא מציירים שוב (מונע prompt כפול)
    google.accounts.id.renderButton(el, {
      type: "standard", theme: "outline", size: "large",
      shape: "pill", text: "signin_with", locale: "he", width: 260
    });
    google.accounts.id.prompt();   // ניסיון התחברות אוטומטי/One-Tap לחוזרים
  }

  function hideLoginGate() {
    const gate = document.getElementById("login-gate");
    if (gate) gate.hidden = true;
    document.body.classList.remove("is-gated");
  }

  function onGoogleLogin(resp) {
    loginError = null;
    fetch(CBA.sheets.url + "?action=login&token=" + encodeURIComponent(resp.credential))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.authorized) {
          currentUser = data;
          // הטוקן החתום שהשרת הנפיק — נשלח מעכשיו בכל פעולת כתיבה במקום הסיסמה
          window.CBA.authSession = data.session || "";
          saveSession(currentUser);
          hideLoginGate();
          renderControls();
          routeByRole();   // מנהל → אזור ניהול; תושב → אזור תושב
        } else {
          // מייל מאומת שאינו ברשימת התושבים — מציעים לו לבקש הרשמה (2026-08-07).
          // שומרים את הטוקן כדי שהבקשה תישלח מאומתת, בלי סיסמת מנהל.
          const notListed = data && data.ok && data.authorized === false && data.reason !== "inactive";
          signupToken = notListed ? resp.credential : null;
          signupPrefill = notListed ? { email: data.email || "", name: data.name || "" } : null;
          loginError = (data && data.ok && data.authorized === false)
            ? (data.reason === "inactive"
                ? "המשתמש מסומן כ'עזב' — הגישה חסומה."
                : "האימייל שלך לא נמצא ברשימת התושבים.")
            : ((data && data.error) || "ההתחברות נכשלה.");
          currentUser = null;
          showLoginGate();
        }
      })
      .catch(function () { loginError = "שגיאת תקשורת מול השרת."; showLoginGate(); });
  }

  function logout() {
    if (googleReady && google.accounts.id.disableAutoSelect) google.accounts.id.disableAutoSelect();
    clearSession();
    clearRoute();
    if (CBA.sheets.clearCache) CBA.sheets.clearCache();
    currentUser = null; loginError = null;
    renderControls();
    showLoginGate();
  }

  /* --- מתג השנה — בורר בין כל השנים + כפתור יצירת שנה --- */
  function renderYearSwitch() {
    if (!yearBox) return;
    const years = CBA.data.getYears();
    const cur   = CBA.data.getCurrentYear();
    yearBox.innerHTML =
      '<span class="year-switch__label">שנת תקציב</span>' +
      '<select class="year-switch__select" id="year-select" aria-label="בחירת שנת תקציב">' +
        years.map(function (y) {
          return '<option value="' + CBA.esc(y) + '"' + (y === cur ? " selected" : "") + '>' + CBA.esc(y) + '</option>';
        }).join("") +
      '</select>' +
      '<button class="year-switch__add" id="year-add" title="צור שנה חדשה" aria-label="צור שנה חדשה">+</button>';

    yearBox.querySelector("#year-select").addEventListener("change", function () {
      CBA.data.setCurrentYear(this.value);
      showScreen(currentScreen);
    });
    yearBox.querySelector("#year-add").addEventListener("click", function () {
      const name = window.prompt('שם השנה החדשה (למשל תשפ"ח):');
      if (name && name.trim()) {
        const y = name.trim();
        CBA.data.addYear(y, CBA.data.getCurrentYear());
        CBA.data.setCurrentYear(y);
        renderYearSwitch();
        showScreen(currentScreen);
      }
    });
  }

  window.CBA = window.CBA || {};
  window.CBA.navigate = showScreen;

  nav.addEventListener("click", (e) => {
    const tab = e.target.closest(".app-nav__tab");
    if (tab) showScreen(tab.dataset.screen);
  });

  // אתחול: מושב מתמשך + מטמון מקומי → תצוגה מיידית, ורענון ברקע (stale-while-revalidate)
  let inited = false;
  let headerReady = false;
  currentUser = loadSession();          // מושב שמור ותקף? נחשוף את האפליקציה מיד — בלי מסך כניסה
  main.innerHTML = skeletonScreen();    // שלד shimmer במקום "טוען נתונים…"
  if (!currentUser) showLoginGate();    // אין מושב תקף — חוסמים עד התחברות מאומתת

  // מעטפת האפליקציה (ניווט/משתמש/בורר שנה) לא תלויה במספרי התקציב עצמם —
  // מוכנים ברגע שיש לנו כל נתונים בפועל (מטמון או רשת), גם אם עוד לא ברור
  // אם התוכן של המסך כבר "מאושר". נקראת פעם אחת בלבד (idempotent).
  function ensureHeaderShell() {
    if (headerReady) return;
    headerReady = true;
    applyUser();
    renderControls();
    renderYearSwitch();
    initGoogle();
    renderGateButton();
  }

  // מסך "לא הצלחנו לטעון" — מוצג רק כשאין שום נתונים אמיתיים להראות (לא
  // מטמון מפעם קודמת ולא תשובה מהרשת). לא נופלים חזרה לנתוני הדמו המקוריים
  // מ-mock.js (אלה נבנו בתחילת הפיתוח כדי לעצב את המסכים, לפני שהייתה בכלל
  // אינטגרציה עם הגיליון) — יועד ביקש במפורש שלא להציג אותם כאילו הם אמיתיים.
  function showLoadFailure() {
    main.innerHTML =
      '<div class="load-error">' +
        '<div class="load-error__title">לא הצלחנו לטעון את נתוני התקציב</div>' +
        '<div class="load-error__sub">ייתכן שיש בעיית חיבור לאינטרנט. אפשר לנסות שוב.</div>' +
        '<button type="button" class="btn-primary" id="load-retry">נסה שוב</button>' +
      '</div>';
    const btn = document.getElementById("load-retry");
    if (btn) btn.addEventListener("click", function () {
      main.innerHTML = skeletonScreen();
      CBA.sheets.load(sheetsLoadHandler);
    });
  }

  function sheetsLoadHandler(ok, info) {
    window.CBA.connected = CBA.sheets.isConnected();

    if (info && info.source === "cache") {
      // יש מטמון מקומי אמיתי (נשלף בעבר מהגיליון בפועל), אבל הוא עלול להיות
      // לא עדכני — לא מציגים אותו כתוכן "מאושר" (בלי מספרים שעלולים להיות
      // שגויים, כמו שיועד ביקש). מכינים רק את המעטפת; תוכן המסך נשאר שלד/שימר
      // עד שהרשת תאשר, אלא אם היא בסוף תיכשל — או אז נשתמש במטמון הזה עצמו
      // כגיבוי אמיתי (ר' "cache-kept" למטה), ולא בנתוני דמו.
      ensureHeaderShell();
      return;   // מחכים לקריאה הבאה (תוצאת הרשת) לפני שמציגים תוכן
    }

    if (!inited) {
      if (!ok && info && info.source === "none") {
        // אין מטמון ואין תשובה מהרשת — שום נתון אמיתי להראות. לא מציגים את
        // נתוני הדמו המקוריים כאילו הם אמיתיים; מציגים מסך שגיאה עם "נסה שוב".
        ensureHeaderShell();
        showLoadFailure();
        return;
      }
      // ציור ראשון — יש לנו נתונים אמיתיים (מהרשת עכשיו, או מהמטמון כגיבוי
      // אחרי שהרשת נכשלה — "cache-kept" למעלה כבר החיל אותם על CBA.mock)
      inited = true;
      ensureHeaderShell();
      if (currentUser) { routeByRole(); }
      else { applyUser(); AREAS = JSON.parse(JSON.stringify(AREAS_ALL)); initialRoute("admin"); }   // אורח מאחורי הגייט — שלד מלא, לא נגיש בפועל
      window.CBA.refreshAlerts();
      lastDataFingerprint = dataFingerprint();
    } else {
      // הגיע עדכון נוסף — מציגים רק אם הנתונים בפועל שונים, ובעדינות (פולס
      // על המספרים, לא ריצוד של המסך)
      var fp = dataFingerprint();
      var changed = fp === null || fp !== lastDataFingerprint;
      lastDataFingerprint = fp;
      if (changed) {
        renderYearSwitch();
        showScreen(currentScreen, { silent: true });
        if (info && info.source === "fresh" && info.hadCache) toastRefreshed();
      }
      window.CBA.refreshAlerts();
    }
  }

  CBA.sheets.load(sheetsLoadHandler);

  /* --- רענון תקופתי (2026-08-05, כמה סבבים לבקשת יועד — קצב הלך והואץ, ולבסוף
     ביקש שהקצב המהיר יפעל רק כל עוד הוא בפועל משתמש באפליקציה, כדי לא "לבזבז"
     קצב מהיר על טאב פתוח שלא נוגעים בו):
     - כל עוד יש פעילות (עכבר/מקלדת/מגע/גלילה) בעשרות השניות האחרונות — רענון כל
       3 שניות. ברגע שאין פעילות מעל IDLE_MS (2 דקות) — עוצרים לגמרי (לא שולחים
       בקשות מיותרות ברקע על טאב "נטוש", גם אם הוא עדיין גלוי).
     - ברגע שחוזרת פעילות אחרי הפסקה, או שחוזרים לטאב אחרי שהיה ברקע — רענון
       מיידי, בלי לחכות למחזור הבא. זה גם פותר את "יש מקרים שמחכים הרבה זמן":
       השהייה הכי ארוכה האפשרית היא בדיוק הזמן שבו לא נגעת באפליקציה בכלל. */
  var POLL_MS = 3000;
  var IDLE_MS = 120000;   // 2 דקות בלי פעילות = "לא באפליקציה כרגע"
  var pollInFlight = false;
  var lastActivity = Date.now();
  var wasIdle = false;

  function doPoll() {
    if (document.hidden || !inited || !currentUser || pollInFlight) return;
    if (Date.now() - lastActivity > IDLE_MS) { wasIdle = true; return; }   // לא פעילים — משהים רענון
    pollInFlight = true;
    CBA.sheets.refresh(function (ok, info) {
      pollInFlight = false;
      if (!ok) return;
      window.CBA.connected = CBA.sheets.isConnected();
      // מציירים את המסך מחדש רק אם הנתונים שהגיעו באמת שונים ממה שכבר על המסך —
      // קודם זה קרה בכל מחזור (כל 3 שניות) גם בלי שינוי, וזה מה שגרם ל"תזוזת עמוד".
      var fp = dataFingerprint();
      var changed = fp === null || fp !== lastDataFingerprint;
      lastDataFingerprint = fp;
      if (changed) {
        renderYearSwitch();
        showScreen(currentScreen, { silent: true });   // עדכון רקע — פולס על מה שהשתנה, לא רענון מסך מלא
        if (info && info.source === "fresh") toastRefreshed();
      }
      refreshAlertsLocal();   // מקומי בלבד (זול) — שריוני מועדון מתעדכנים בקצב נמוך יותר, ראה מעלה
    });
  }
  function markActive() {
    lastActivity = Date.now();
    if (wasIdle) { wasIdle = false; doPoll(); }   // חוזרים אחרי הפסקה — רענון מיידי, לא מחכים למחזור
  }
  ["mousemove", "mousedown", "keydown", "touchstart", "scroll"].forEach(function (ev) {
    document.addEventListener(ev, markActive, { passive: true });
  });
  setInterval(doPoll, POLL_MS);
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) { markActive(); doPoll(); refreshAlertsClub(); }   // חזרה לטאב — רענון מיידי במקום לחכות למחזור הבא
  });

  // שריוני מועדון ממתינים: קריאת רשת נפרדת (Calendar), בקצב נמוך בהרבה מרענון
  // הנתונים הרגיל (כדי לא להעמיס) — כל 45 שניות, ורק כשמנהל פעיל ורואה את הטאב.
  var CLUB_ALERT_MS = 45000;
  setInterval(function () {
    if (document.hidden || !inited || !currentUser) return;
    if (Date.now() - lastActivity > IDLE_MS) return;
    refreshAlertsClub();
  }, CLUB_ALERT_MS);
})();
