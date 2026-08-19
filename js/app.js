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
    // (2026-08-09, תיקון באג "קפיצה חזרה למסך הראשי"): הניווט העליון בראש
    // index.html מגיע עם 3 כפתורים קבועים שכבר יש להם data-screen, ולכן
    // כבר לחיצים באמת עוד לפני שהאפליקציה סיימה להיטען (inited עדיין false —
    // ר' ההסבר המלא למטה ליד ההגדרה שלו). אם המשתמש הספיק ללחוץ בחלון הזה
    // (למשל על "ניהול הוצאות", כדי להיכנס לעריכת קבלה) — ה-showScreen הזה היה
    // מבוצע, אבל שניות אחר כך, כשהטעינה האמיתית מסתיימת, הניתוב הראשוני
    // (initialRoute) היה קורא ל-showScreen שוב עם המסך השמור מהפעם הקודמת —
    // ודורס את זה שהמשתמש בחר, מה שנראה כמו "קפיצה חזרה" לא מוסברת. עכשיו
    // לחיצה לפני שהאפליקציה מוכנה פשוט לא עושה כלום (וה-CSS ב-loading.css
    // מציג את הניווט כלא-פעיל/מעומעם באותו חלון, כדי שלא ייראה תקוע).
    if (!inited) return;
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
      // ניווט אמיתי (לא רענון רקע) תמיד מצייר את הנתונים העדכניים ביותר —
      // אז אין יותר "רענון ממתין" מיושן להשלים, וטביעת האצבע כבר עדכנית.
      pendingSilentRefresh = false;
      lastDataFingerprint = dataFingerprint();
      // אנימציית כניסה עדינה בכל החלפת מסך יזומה ע"י המשתמש (re-trigger ע"י reflow)
      main.classList.remove("screen-enter");
      void main.offsetWidth;
      main.classList.add("screen-enter");
    }
    // מסמנים "פעיל" ומעדכנים אילו קבוצות-ניווט מתקפלות פתוחות/סגורות — תמיד
    // בהחלפת מחלקות במקום (לא renderNav מלא), כדי שסגירת קבוצה שהייתה פתוחה
    // (למשל בעקבות מעבר לטאב אחר לגמרי) תחליק בטרנזיציית CSS ולא תיעלם בבת-אחת.
    var g = groupForScreen(name);
    openGroup = g;
    if (nav) {
      nav.querySelectorAll(".app-nav__tab[data-screen]").forEach((tab) => {
        tab.classList.toggle("is-active", tab.dataset.screen === name);
      });
      applyNavGroupState();
      updateGroupHasActive();
    }
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
  // "מכון" (2026-08-18) — מידור מכון הכושר. **נפרד ממידור המועדון בכוונה**:
  // שני המתקנים יושבים באותה קבוצת ניווט ("מתקנים") אבל מנוהלים ע"י אנשים
  // שונים, ולכן כל אחד דורש את ההרשאה שלו. חייב להיות זהה ל-PERM_GYM בשרת.
  const PERM = { SUPER: "על", BUDGET: "תקציב", CLUB: "מועדון", RESIDENTS: "תושבים", GYM: "מכון" };
  const PERM_LABEL = {
    "על": "מנהל על", "תקציב": "ניהול תקציב ותשלומים",
    "מועדון": "ניהול מועדון", "תושבים": "ניהול תושבים",
    "מכון": "ניהול מכון כושר"
  };
  // איזו הרשאה נדרשת לכל מסך ניהול
  const SCREEN_PERM = {
    budget: PERM.BUDGET, expenses: PERM.BUDGET, planning: PERM.BUDGET,
    clubAdmin: PERM.CLUB, residents: PERM.RESIDENTS, settings: PERM.SUPER,
    // ניהול עץ הוועד — מנהל-על בלבד (2026-08-10, לבקשת יועד: "הניהול עץ
    // צריך להיות רק באזור ניהול למי שיש הרשאות מנהל על"). התצוגה-לקריאה
    // המקבילה (resCommittee, אזור תושב) פתוחה לכל תושב וללא הרשאה כאן.
    committeeAdmin: PERM.SUPER,
    // ניהול מיילים (שלב 1, 2026-08-18) — פתוח לכל מנהל (הרשאה כלשהי), לא
    // הרשאה ספציפית אחת: המסך עצמו מסנן פנימה לפי מה שהשרת מחזיר (מנהל-על
    // רואה הכול, מנהל תחום רואה/עורך רק את התחום שלו — ר' handleListEmailSettings_).
    // הערך 'ANY' מטופל במיוחד ב-canScreen למטה.
    emailSettings: "ANY",
    // ניהול "שירותים לתושב" (2026-08-18) — מנהל-על בלבד, בדיוק כמו
    // committeeAdmin. התצוגה המקבילה לתושבים (resServices, אזור התושב)
    // פתוחה לכל תושב ולכן אינה מופיעה כאן כלל.
    servicesAdmin: PERM.SUPER,
    // ניהול מכון הכושר (2026-08-18) — מידור "מכון" בלבד. מנהל-על רואה הכול
    // כרגיל (ר' can), אבל מנהל מועדון בלי מידור מכון לא יראה את המסך.
    gymAdmin: PERM.GYM
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
  // האם יש למשתמש בכלל דריסת רגל באזור הניהול
  function hasAnyAdmin() {
    return isSuper() || [PERM.BUDGET, PERM.CLUB, PERM.RESIDENTS, PERM.GYM].some(function (p) {
      return myPerms().indexOf(p) !== -1;
    });
  }
  function canScreen(name) {
    if (SCREEN_PERM[name] === "ANY") return hasAnyAdmin();
    return !SCREEN_PERM[name] || can(SCREEN_PERM[name]);
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
      screens: ["budget", "expenses", "planning", "clubAdmin", "gymAdmin", "residents", "committeeAdmin", "servicesAdmin", "emailSettings", "settings"],
      // "תכנון מול ביצוע"/"ניהול הוצאות"/"בניית תקציב" אוחדו לכפתור-קבוצה אחד
      // "תקציב" (2026-08-09), באותה תבנית בדיוק כמו קבוצת "השיכון" באזור התושב
      // (ר' renderNav/toggleGroup) — שלושתם גם חולקים את אותה הרשאה (PERM.BUDGET,
      // ר' SCREEN_PERM), כך שמי שיש לו רק הרשאת מועדון/תושבים לא יראה את הקבוצה כלל.
      // "ועד השיכון" (2026-08-10) — ניהול/עריכת עץ הוועד, מנהל-על בלבד
      // (ר' SCREEN_PERM.committeeAdmin, residents.js). התצוגה-לקריאה המקבילה
      // יושבת באזור התושב (resCommittee) ופתוחה לכולם, ר' AREAS_ALL.resident למטה.
      tabs: [
        { group: "taktziv", label: "תקציב", items: [["budget", "תכנון מול ביצוע"], ["expenses", "ניהול הוצאות"], ["planning", "בניית תקציב"]] },
        // "מתקנים" (2026-08-18) — שריון המועדון ומכון הכושר אוחדו לקבוצה אחת,
        // באותה תבנית מתקפלת של "תקציב"/"השיכון". שים לב: לכל פריט מידור משלו
        // (PERM.CLUB מול PERM.GYM), ו-rebuildAreas כבר מסנן פריט-פריט — כך
        // שמנהל מועדון יראה כאן פריט אחד, ומי שאין לו אף אחד מהם לא יראה
        // את הקבוצה בכלל. אין צורך בשום לוגיקה מיוחדת.
        { group: "mitkanim", label: "מתקנים", items: [["clubAdmin", "שריון מועדון"], ["gymAdmin", "מכון כושר"]] },
        ["residents", "תושבים"], ["committeeAdmin", "ועד השיכון"],
        // ניהול "שירותים לתושב" (2026-08-18) — הצד העורך של resServices שבאזור
        // התושב. מנהל-על בלבד (ר' SCREEN_PERM.servicesAdmin, servicesAdmin.js).
        ["servicesAdmin", "שירותים"], ["emailSettings", "ניהול מיילים"]
      ]
    },
    resident: {
      def: "resRequests",
      screens: ["resRequests", "resSubmit", "resReserve", "resDirectory", "resMap", "resCommittee", "resServices"],
      // "שכנים"/"מפת השיכון" אוחדו לכפתור-קבוצה אחד "השיכון" (2026-08-08) — לחיצה
      // עליו פותחת שני תת-כפתורים במקום לנווט ישר (ר' renderNav/toggleGroup).
      // "ועד השיכון" הצטרף כפריט שלישי (2026-08-09) — עץ הוועד, פתוח לכל תושב
      // לצפייה בלבד. עריכה (2026-08-10) עברה לגמרי למסך ניהול נפרד באזור הניהול
      // (committeeAdmin, מנהל-על בלבד) — כאן, גם מנהל-על, רואה תצוגה בלבד.
      tabs: [
        ["resRequests", "הבקשות שלי"], ["resSubmit", "הגשת קבלה"], ["resReserve", "שריון מועדון"],
        // "שירותים" (2026-08-18) הצטרף כפריט רביעי לאותה קבוצה ולא ככפתור עצמאי:
        // הוא שייך תמטית ל"מה יש בשיכון", ושורת הניווט הראשית כבר עמוסה.
        { group: "shikun", label: "השיכון", items: [["resMap", "מפת השיכון"], ["resDirectory", "תושבי השיכון"], ["resCommittee", "ועד השיכון"], ["resServices", "שירותים"]] }
      ]
    }
  };
  // מוצא את מפתח-המסך הראשון בתוך רשימת טאבים — בין אם הוא טאב רגיל [key,label]
  // או "קבור" בתוך פריט-קבוצה {group,label,items:[[key,label],...]} (ר' תקציב/השיכון).
  function firstScreenKey(tabs) {
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (t && t.group) { if (t.items.length) return t.items[0][0]; }
      else if (t) return t[0];
    }
    return null;
  }
  // AREAS הוא תצוגה מסוננת של AREAS_ALL לפי ההרשאות של המשתמש הנוכחי. הוא נבנה
  // מחדש בכל התחברות/החלפת משתמש/כניסה ויציאה ממצב הדמיה (ר' applyUser).
  let AREAS = JSON.parse(JSON.stringify(AREAS_ALL));
  function rebuildAreas() {
    var a = AREAS_ALL.admin;
    var screens = a.screens.filter(canScreen);
    // טאב-קבוצה (כמו "תקציב") מסונן לפי הפריטים שבתוכו — אם ההרשאה חוסמת חלק
    // מהם, רק הם נעלמים; אם היא חוסמת את כולם, הקבוצה כולה נעלמת (בלי כותרת ריקה).
    var tabs = a.tabs.map(function (t) {
      if (t && t.group) {
        var items = t.items.filter(function (it) { return canScreen(it[0]); });
        return items.length ? { group: t.group, label: t.label, items: items } : null;
      }
      return canScreen(t[0]) ? t : null;
    }).filter(Boolean);
    AREAS = {
      admin: { def: firstScreenKey(tabs) || "budget", screens: screens, tabs: tabs },
      resident: AREAS_ALL.resident
    };
  }
  // אייקוני קו מונוכרומיים לטאבים (דסקטופ). במובייל האייקון מגיע מ-CSS mask (::before)
  var NAV_ICONS = {
    budget:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21v-8M12 21V4M19 21v-6"/></svg>',
    expenses:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/></svg>',
    planning:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>',
    clubAdmin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M8.5 15l2 2 4-4"/></svg>',
    // מכון כושר — משקולת. "מתקנים" (כפתור-הקבוצה) — מבנה עם גג, מייצג את
    // המתקנים הפיזיים בשיכון כמכלול ולא מסך ספציפי.
    gymAdmin:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>',
    resGym:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>',
    mitkanim:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M4 21V10l8-6 8 6v11"/><path d="M9 21v-5h6v5"/></svg>',
    residents:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M16.5 6.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.4a5 5 0 0 1 3 4.6"/></svg>',
    // ניהול "ועד השיכון" באזור הניהול — אותו אייקון בדיוק כמו resCommittee
    // (אזור התושב), כי זה אותו נושא/עץ, רק צד קריאה מול צד ניהול.
    committeeAdmin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.1"/><circle cx="5.5" cy="18" r="2.1"/><circle cx="18.5" cy="18" r="2.1"/><path d="M12 7.1V11M12 11 5.5 15.9M12 11l6.5 4.9"/></svg>',
    // ניהול מיילים (שלב 1, 2026-08-18) — אייקון מעטפה
    emailSettings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/></svg>',
    // "שירותים" (2026-08-18) — אותו אייקון בשני הצדדים (resServices לתושב,
    // servicesAdmin לניהול), בדיוק כמו committeeAdmin/resCommittee: אותו נושא,
    // רק צד קריאה מול צד עריכה.
    servicesAdmin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h9"/><circle cx="19" cy="17" r="2.4"/></svg>',
    resServices: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h9"/><circle cx="19" cy="17" r="2.4"/></svg>',
    resRequests: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 6h9M11 12h9M11 18h9"/><path d="M4 6l1.3 1.3L7 4.7M4 12l1.3 1.3L7 10.7M4 18l1.3 1.3L7 16.7"/></svg>',
    resSubmit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
    resReserve:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
    resDirectory: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19.5a5.5 5.5 0 0 1 11 0"/><path d="M16.5 6.2a3 3 0 0 1 0 5.6"/><path d="M17.5 14.4a5 5 0 0 1 3 4.6"/></svg>',
    resMap:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3.5 5v16L9 19l6 2 5.5-2V3L15 5 9 3Z"/><path d="M9 3v16M15 5v16"/></svg>',
    resCommittee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.1"/><circle cx="5.5" cy="18" r="2.1"/><circle cx="18.5" cy="18" r="2.1"/><path d="M12 7.1V11M12 11 5.5 15.9M12 11l6.5 4.9"/></svg>',
    // כפתור-הקבוצה "השיכון" — מייצג את השכונה כמכלול (לא מסך ספציפי)
    shikun:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V10l4-3v14"/><path d="M13 21V6l6-3v18"/><path d="M9 13h.01M9 17h.01M17 9h.01M17 13h.01M17 17h.01"/></svg>',
    // כפתור-הקבוצה "תקציב" — מייצג את מודול התקציב כמכלול (לא מסך ספציפי), ר' AREAS_ALL.admin.tabs
    taktziv:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v3"/><path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-4"/><rect x="14" y="11" width="7" height="5" rx="1"/><circle cx="17.3" cy="13.5" r=".55" fill="currentColor" stroke="none"/></svg>'
  };
  // שברון קטן שמתהפך כשהקבוצה פתוחה
  var CHEV_ICON = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  // איזו קבוצת-ניווט מקופלת (אם יש) פתוחה כרגע. null = הכול סגור.
  // שתי קבוצות קיימות היום: "תקציב" (אזור ניהול, ר' AREAS_ALL.admin.tabs)
  // ו"השיכון" (אזור תושב, ר' AREAS_ALL.resident.tabs) — אותה תבנית בדיוק לשתיהן.
  var openGroup = null;
  // האם screenKey שייך לאיזושהי קבוצת-ניווט באזור הנוכחי — ואם כן, לאיזו
  function groupForScreen(screenKey) {
    var a = AREAS[currentArea];
    if (!a) return null;
    for (var i = 0; i < a.tabs.length; i++) {
      var t = a.tabs[i];
      if (t && t.group) {
        for (var j = 0; j < t.items.length; j++) {
          if (t.items[j][0] === screenKey) return t.group;
        }
      }
    }
    return null;
  }
  // לחיצה על כפתור-הקבוצה עצמו ("השיכון") — פותחת/סוגרת בלי לנווט לשום מסך.
  // אם המסך הנוכחי כבר שייך לקבוצה — היא תמיד תיפתח מחדש בציור הבא (ר' showScreen),
  // כלומר אי-אפשר "לסגור" אותה בזמן שממש נמצאים באחד המסכים שבתוכה — וזה מכוון.
  //
  // 2026-08-08, חידוד שלישי (לבקשת יועד — "אין תנועת החלקה שחושפת את הכפתורים,
  // הם פשוט נפתחים לצד השני ומסתתרים בסוף החלונית", וגם "כשלוחצים כפתור אחר
  // התפריט הנפתח נסגר מיד"): renderNav() עכשיו מצייר את התת-כפתורים תמיד (לא
  // רק כשפתוח), עטופים בכמוסת CSS Grid שרוחבה מונפש בין 0fr ל-1fr — כך שהם
  // תמיד קיימים ב-DOM ופתיחה/סגירה היא טרנזיציית CSS אמיתית שמחליקה, לא בנייה
  // מחדש שקופצת. toggleGroup ו-showScreen לכן רק מחליפים מחלקות במקום, בלי
  // renderNav מלא — כדי שהטרנזיציה תרוץ בכל פעם (animation לא היה חוזר על עצמו
  // באלמנט שנהרס ונוצר מחדש; transition כן, אבל רק אם האלמנט נשאר באותו DOM node).
  function toggleGroup(g) {
    openGroup = (openGroup === g) ? null : g;
    applyNavGroupState();
  }
  // 2026-08-08, גרסה שישית — חזרה לתפריט "מתרחב" בתוך שורת הטאבים עצמה (לא
  // dropdown צף) לבקשת יועד המפורשת, אחרי שה-dropdown האנכי (גרסה 5) התברר
  // כלא אינטואיטיבי ("לא הבנתי שזה השינוי שיקרה"). ההבדל המהותי מהניסיונות
  // ההיסטוריים (1-3, שגם הם היו in-flow וגם נכשלו): אז ה-nav (בדסקטופ) היה
  // shrink-to-fit ללא תקרה, אז כשהקבוצה גדלה — כל הקופסה של ה-nav גדלה איתה
  // וזזה (ר' ההסבר המפורט ב-style.css ליד .app-nav ולמעלה ב-updateNavMaxWidth).
  // עכשיו יש תקרת-רוחב יציבה (--nav-max-w, לא תלויה בתוכן הקבוצה) ו-nav הוא
  // overflow-x:auto בשני המצבים — בדיוק כמו שהבר התחתון במובייל כבר עובד —
  // כך שגדילת התוכן הפנימי לעולם לא מזיזה את הקופסה של ה-nav עצמה, רק ממלאת
  // או גולשת מעבר לתקרה (ואז גוללים אליה, ר' applyNavGroupState).
  // מיישם את מצב הפתיחה/סגירה של קבוצות-הניווט על ה-DOM הקיים (בלי renderNav).
  function applyNavGroupState() {
    if (!nav) return;
    nav.querySelectorAll("[data-group-wrap]").forEach(function (wrap) {
      var isOpen = openGroup === wrap.dataset.groupWrap;
      wrap.classList.toggle("is-open", isOpen);
      var btn = wrap.querySelector(".app-nav__tab--group");
      if (btn) btn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      // מדרג מחדש את זמן-ההשהיה של כל תת-כפתור בכל פתיחה (לא רק בציור הראשוני)
      var STAGGER_MS = 45;
      wrap.querySelectorAll(".app-nav__tab--sub").forEach(function (sub, i) {
        sub.style.transitionDelay = (i * STAGGER_MS) + "ms";
      });
      // אחרי שהתוכן הפנימי (עכשיו in-flow, ר' style.css) באמת סיים להתרחב —
      // גוללים את הקבוצה כולה (כולל התת-כפתורים שנחשפו) לתוך התצוגה, כדי
      // שברוחב צר (או הרבה טאבים) היא לא תישאר גלולה-מחוץ-לתצוגה בלי שהמשתמש
      // ידע שיש שם עוד תוכן. transitionend-גייטד (לא setTimeout קבוע) כי
      // משך ההרחבה תלוי במספר תת-הכפתורים ולא ידוע מראש.
      if (isOpen) {
        var itemsEl = wrap.querySelector(".app-nav__group-items");
        if (itemsEl) {
          var onEnd = function (e) {
            if (e.target !== itemsEl) return;
            if (e.propertyName !== "grid-template-columns") return;
            itemsEl.removeEventListener("transitionend", onEnd);
            if (wrap.classList.contains("is-open")) {
              wrap.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
            }
          };
          itemsEl.addEventListener("transitionend", onEnd);
        }
      }
    });
  }
  // הערה חשובה (2026-08-08, נבדק אמפירית ב-Playwright): נוסה כאן קודם תקרת
  // max-width נמדדת-JS על nav שנשאר shrink-to-fit (מתכווץ לפי תוכן) — זה
  // התברר לא-יציב: גם עם תקרה, ה-nav עדיין *גדל בפועל* לאורך כל שלב ההרחבה
  // (עד שמגיע לתקרה), ואיתו זז כל טאב שבתוכו כולל הפעיל — אותו באג בדיוק,
  // רק מוסתר בקצה. הפתרון היציב באמת (ר' style.css — .app-nav ב-
  // @media(min-width:721px)): flex:1 קבוע, לא shrink-to-fit בכלל — קופסת
  // ה-nav תמיד באותו רוחב (נגזר משכניו בשורת flex, לא מהתוכן הפנימי שלה),
  // בדיוק כמו הבר התחתון במובייל שכבר תמיד ברוחב calc(100%-24px) קבוע בלי
  // תלות במספר הטאבים. אין יותר צורך במדידת JS בכלל — ה-flex algorithm עושה
  // את זה נכון וישירות.
  // מרענן את "has-active" (טקסט מודגש) על כותרות הקבוצות לפי המסך הנוכחי —
  // בלי renderNav מלא, כדי לא להפריע לטרנזיציית הפתיחה/סגירה שאולי רצה עכשיו.
  function updateGroupHasActive() {
    if (!nav) return;
    var a = AREAS[currentArea];
    if (!a) return;
    a.tabs.forEach(function (t) {
      if (!(t && t.group)) return;
      var groupActive = t.items.some(function (it) { return it[0] === currentScreen; });
      var btn = nav.querySelector('.app-nav__tab--group[data-group="' + t.group + '"]');
      if (btn) btn.classList.toggle("has-active", groupActive);
    });
  }

  function renderNav(area) {
    if (!nav) return;
    // שומרים את "המחוון הנוזלי" (nav-indicator, מתווסף ע"י motion.js) לפני שמוחקים
    // את תוכן הניווט — אחרת הוא נהרס ונוצר מחדש בכל רענון, וזה מה שגרם לרקע השחור
    // מתחת לטאב הפעיל "לרוץ" מחדש מאפס בכל רענון תגיות, במקום פשוט להישאר במקום.
    var keepIndicator = nav.querySelector(".nav-indicator");
    if (keepIndicator && keepIndicator.parentNode) keepIndicator.parentNode.removeChild(keepIndicator);
    var html = "";
    AREAS[area].tabs.forEach(function (t) {
      // כפתור-קבוצה מתקפל ("השיכון") — פותח תת-תפריט של שני כפתורים במקום לנווט.
      // התת-כפתורים מצוירים מיד אחריו ב-DOM, כך שב-RTL הם נפתחים משמאלו,
      // ופס הכפתורים כולו "זז ימינה" בטבעיות (הרוחב הנוסף בולע את המרווח הגמיש
      // שאחרי הלוגו — ר' .app-brand { margin-inline-end:auto } ב-style.css).
      if (t && t.group) {
        // "has-active" (לא "is-active"!) בכוונה: כפתור-הקבוצה עצמו אף פעם לא
        // מקבל את קפסולת ה"פעיל" הכהה/המחוון הנוזלי — זה שמור לתת-הכפתור
        // המדויק שבאמת מוצג. has-active הוא רק רמז עדין (טקסט מודגש) לכך
        // שהמסך הנוכחי נמצא בתוך הקבוצה הזו.
        //
        // עדכון 2026-08-08 (לבקשת יועד — התפריט "השיכון" נפתח מהר מדי ולא היה
        // ברור שהוא כותרת-על לשני התת-כפתורים): כל הקבוצה (הכותרת + התת-
        // כפתורים, כשפתוחה) עטופה ב-.app-nav__group, שמקבלת "כרית" רקע עדינה
        // משלה כשפתוחה — כך שהיא נראית פיזית כמו מכל אחד שמכיל את שניהם,
        // ולא כשלושה כפתורים שווים זה ליד זה. התת-כפתורים גם נכנסים אחד-אחרי-
        // השני (מדורג, ר' STAGGER_MS) ולא בבת אחת, כדי שהעין תספיק לעקוב.
        var groupActive = t.items.some(function (it) { return it[0] === currentScreen; });
        var isOpen = openGroup === t.group;
        var gico = NAV_ICONS[t.group] ? '<span class="app-nav__ico">' + NAV_ICONS[t.group] + '</span>' : '';
        // תגית-מספר על כותרת הקבוצה עצמה = סכום ההתרעות של כל הפריטים שבתוכה
        // (למשל "ניהול הוצאות" שיושב היום בתוך קבוצת "תקציב") — כדי שהתרעה לא
        // "תיעלם" מהעין רק כי הטאב שלה מקופל בתוך קבוצה סגורה.
        var gn = t.items.reduce(function (sum, it) { return sum + navBadgeCount(it[0]); }, 0);
        var gbadge = gn ? '<span class="nav-badge">' + (gn > 9 ? "9+" : gn) + '</span>' : '';
        var groupHtml = '<button type="button" class="app-nav__tab app-nav__tab--group' +
          (groupActive ? " has-active" : "") +
          '" data-group="' + t.group + '" aria-expanded="' + (isOpen ? "true" : "false") + '">' +
          gico + CBA.esc(t.label) + gbadge + '<span class="app-nav__chev">' + CHEV_ICON + '</span></button>';
        // התת-כפתורים תמיד מצוירים ל-DOM (לא רק כשפתוח) — עטופים בכמוסת
        // .app-nav__group-items שרוחבה (grid-template-columns) עובר טרנזיציה
        // אמיתית בין 0fr ל-1fr כשמוסיפים/מסירים is-open. זו התנועה ש"חושפת"
        // אותם בהחלקה אמיתית, בניגוד לפתיחה הקודמת שהייתה בנייה מחדש של ה-DOM.
        var STAGGER_MS = 45;
        var itemsHtml = t.items.map(function (it, i) {
          var sico = NAV_ICONS[it[0]] ? '<span class="app-nav__ico">' + NAV_ICONS[it[0]] + '</span>' : '';
          var sn = navBadgeCount(it[0]);
          var sbadge = sn ? '<span class="nav-badge">' + (sn > 9 ? "9+" : sn) + '</span>' : '';
          return '<button type="button" class="app-nav__tab app-nav__tab--sub' +
            (it[0] === currentScreen ? " is-active" : "") + '" data-screen="' + it[0] +
            '" style="transition-delay:' + (i * STAGGER_MS) + 'ms">' + sico + CBA.esc(it[1]) + sbadge + '</button>';
        }).join("");
        groupHtml += '<div class="app-nav__group-items"><div class="app-nav__group-items-inner">' + itemsHtml + '</div></div>';
        html += '<div class="app-nav__group' + (isOpen ? " is-open" : "") + '" data-group-wrap="' + t.group + '">' + groupHtml + '</div>';
        return;
      }
      var ico = NAV_ICONS[t[0]] ? '<span class="app-nav__ico">' + NAV_ICONS[t[0]] + '</span>' : '';
      var n = navBadgeCount(t[0]);
      var badge = n ? '<span class="nav-badge">' + (n > 9 ? "9+" : n) + '</span>' : '';
      // מסמנים "פעיל" לפי המסך הנוכחי (לא תמיד הראשון ברשימה) — כדי שרענון תגיות
      // ההתרעות (שקורה כל כמה שניות, ראה refreshAlerts) לא "יקפיץ" את הטאב הפעיל.
      html += '<button type="button" class="app-nav__tab' + (t[0] === currentScreen ? " is-active" : "") + '" data-screen="' + t[0] + '">' + ico + CBA.esc(t[1]) + badge + '</button>';
    });
    nav.innerHTML = html;
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
    openGroup = null;   // מעבר אזור — כל קבוצת-ניווט מתקפלת שהייתה פתוחה נסגרת
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

  /* --- חיווי "שומר…/נשמר ✓" גלובלי (2026-08-09, לבקשת יועד; הועבר לכותרת ב-2026-08-09) ---
     יועד ביקש שבכל מסך יהיה ברור אם עדיין שומרים או שהשמירה הסתיימה, לא רק
     במסך תכנון תקציב. sheets.js כבר עוקב מרכזית אחרי כל כתיבה (ר' isDirty/
     markDirty/clearDirty שם) ומשדר אירוע "cba:dirty-change" בכל שינוי מצב —
     כך שמסך חדש שכותב לגיליון מקבל את החיווי הזה "בחינם", בלי לכתוב אותו בעצמו.
     בהמשך יועד ציין שבועה צפה בתחתית המסך היא לא מספיק בולטת — האלמנט עבר
     לעוגן קבוע בכותרת (#save-indicator-slot ב-index.html), עם fallback ל-body
     אם משום מה העוגן לא קיים (למשל דף ישן שלא רוענן עדיין). */
  var saveIndicatorHideTimer = null;
  function saveIndicatorEl() {
    var el = document.getElementById("cba-save-indicator");
    if (!el) {
      el = document.createElement("div");
      el.id = "cba-save-indicator";
      el.className = "save-indicator";
      el.innerHTML = '<span class="save-indicator__dot"></span><span class="save-indicator__text"></span>';
      var slot = document.getElementById("save-indicator-slot");
      (slot || document.body).appendChild(el);
    }
    return el;
  }
  window.addEventListener("cba:dirty-change", function (e) {
    var d = e && e.detail;
    var el = saveIndicatorEl();
    var textEl = el.querySelector(".save-indicator__text");
    clearTimeout(saveIndicatorHideTimer);
    if (d && d.dirty) {
      el.className = "save-indicator is-show";
      if (textEl) textEl.textContent = "שומר…";
      el.removeAttribute("title");
    } else if (d && d.error) {
      el.className = "save-indicator is-show is-error";
      if (textEl) textEl.textContent = "בעיית שמירה";
      el.title = "בעיית רשת בשמירה — ננסה שוב ברענון הבא";
      saveIndicatorHideTimer = setTimeout(function () { el.classList.remove("is-show"); }, 4000);
    } else {
      el.className = "save-indicator is-show is-saved";
      if (textEl) textEl.textContent = "נשמר ✓";
      el.removeAttribute("title");
      saveIndicatorHideTimer = setTimeout(function () { el.classList.remove("is-show"); }, 1400);
    }
  });

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
    openGroup = null;   // ר' הערה זהה ב-setArea — נקבע מחדש אוטומטית ב-showScreen אם צריך
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

  /* ---------- מגש המשתמש: מוצא מתוך הכותרת (2026-08-07) ----------
     ל-.app-header יש backdrop-filter, וזה הופך אותו ל"שורש הרקע" של כל צאצאיו.
     כתוצאה מכך ה-backdrop-filter של המגש דגם רק את מה שצויר בתוך הכותרת — כלומר
     כלום — והמגש נראה כמו מלבן לבן שקוף בלי טשטוש, שהתוכן מאחוריו נקרא דרכו.
     הפתרון הוא להוציא את המגש אל ה-body ברגע הפתיחה ולמקם אותו ידנית מול
     הכפתור; שם אין מעליו שורש רקע, והזכוכית עובדת כמו ב-iOS. */
  function positionUserPanel(panel, btn) {
    var r = btn.getBoundingClientRect();
    var w = panel.offsetWidth || 272;
    var rtl = getComputedStyle(document.documentElement).direction === "rtl";
    var x = rtl ? r.left : (r.right - w);
    x = Math.max(8, Math.min(x, window.innerWidth - w - 8));
    panel.style.position = "fixed";
    panel.style.insetInlineEnd = "auto";
    panel.style.left = x + "px";
    panel.style.top = (r.bottom + 10) + "px";
    panel.style.maxHeight = Math.max(200, window.innerHeight - r.bottom - 24) + "px";
  }
  function openUserPanel(panel, btn) {
    if (panel.parentNode !== document.body) document.body.appendChild(panel);
    panel.hidden = false;
    btn.classList.add("is-open");
    positionUserPanel(panel, btn);
  }
  function closeUserPanel(panel, btn) {
    if (panel) panel.hidden = true;
    if (btn) btn.classList.remove("is-open");
  }
  // מיקום מחדש כשגוללים או משנים גודל — המגש מרחף ב-body ולא זז עם הכפתור לבד
  window.addEventListener("resize", function () {
    var p = document.getElementById("user-panel"), b = document.getElementById("user-btn");
    if (p && !p.hidden && b) positionUserPanel(p, b);
  });
  window.addEventListener("scroll", function () {
    var p = document.getElementById("user-panel"), b = document.getElementById("user-btn");
    if (p && !p.hidden && b) positionUserPanel(p, b);
  }, true);

  function renderControls() {
    if (!controls) return;
    // מגש יתום מציור קודם שהועבר ל-body — מסירים לפני שמציירים חדש.
    // שומרים אם הוא היה פתוח: renderControls נקרא גם מרענון ההתרעות שרץ ברקע,
    // וקודם כל רענון כזה סגר את המגש בפרצוף המשתמש באמצע השימוש.
    var stray = document.getElementById("user-panel");
    var wasOpen = !!(stray && !stray.hidden);
    if (stray && stray.parentNode === document.body) stray.remove();
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
      if (panel.hidden) {
        openUserPanel(panel, btn);
        renderGoogleButton(); refreshAlertsClub();   // ציור כפתור גוגל + בדיקת התרעות טריות רק כשהמגש גלוי
      } else {
        closeUserPanel(panel, btn);
      }
    });
    const setBtn = panel.querySelector("[data-panel-settings]");
    if (setBtn) setBtn.addEventListener("click", function () {
      closeUserPanel(panel, btn); showScreen("settings");
    });
    const swBtn = panel.querySelector("[data-panel-switch]");
    if (swBtn) swBtn.addEventListener("click", function () {
      closeUserPanel(panel, btn); setArea(swBtn.dataset.panelSwitch);
    });
    panel.querySelectorAll("[data-panel-goto]").forEach(function (gBtn) {
      gBtn.addEventListener("click", function () {
        closeUserPanel(panel, btn);
        const target = gBtn.dataset.panelGoto;
        if (currentArea !== "admin" && hasAnyAdmin()) setArea("admin");
        if (target === "expenses-pending" && CBA.screens.expenses && CBA.screens.expenses.showPending) CBA.screens.expenses.showPending();
        else showScreen(target);
      });
    });
    const simBtn = panel.querySelector("[data-panel-sim]");
    if (simBtn) simBtn.addEventListener("click", function () {
      closeUserPanel(panel, btn); openSimPicker();
    });
    const simStopBtn = panel.querySelector("[data-panel-simstop]");
    if (simStopBtn) simStopBtn.addEventListener("click", function () {
      closeUserPanel(panel, btn); stopSim();
    });
    const outBtn = panel.querySelector("[data-panel-logout]");
    if (outBtn) outBtn.addEventListener("click", logout);

    if (wasOpen) openUserPanel(panel, btn);   // היה פתוח לפני הציור — נשאר פתוח

    if (!panelOutsideBound) {   // סגירה בלחיצה מחוץ למגש — נרשם פעם אחת בלבד
      panelOutsideBound = true;
      document.addEventListener("click", function (e) {
        const p = document.getElementById("user-panel");
        // המגש כבר לא יושב בתוך controls (הועבר ל-body), ולכן צריך לבדוק גם אותו
        if (p && !p.hidden && !controls.contains(e.target) && !p.contains(e.target)) {
          closeUserPanel(p, document.getElementById("user-btn"));
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
    var stale = !!(CBA.serverOutdated && CBA.serverOutdated());
    const conn = window.CBA.connected === true
      ? '<span class="up-status up-status--on"><span class="up-dot"></span>מחובר לגיליון' +
        (srvVer ? ' <span class="up-ver' + (stale ? ' up-ver--warn' : '') + '">· ' + CBA.esc(srvVer) +
          (stale ? ' (ישן)' : '') + '</span>' : '') +
        (currentUser && !hasSess ? ' <span class="up-ver up-ver--warn">· ללא מושב</span>' : '') + '</span>' +
        (stale ? '<span class="up-stale">ה-Apps Script לא מעודכן — חלק מהפעולות ייכשלו. להדביק את Code.gs ולפרסם New version.</span>' : '')
      : (window.CBA.connected === false ? '<span class="up-status up-status--off"><span class="up-dot"></span>לא מחובר · נתוני דמו</span>' : '');

    let head, action;
    if (currentUser) {
      const avatar = currentUser.picture
        ? '<img class="up-avatar-img" src="' + CBA.esc(currentUser.picture) + '" alt="">'
        : '<span class="up-avatar">' + CBA.esc(initials(currentUser.name || currentUser.email)) + '</span>';
      // תגית ההרשאה ירדה לשורה משלה מתחת לאימייל (2026-08-07): כשהיא ישבה בקצה
      // השורה היא נדחסה מול שם ואימייל ארוכים, נשברה לשתי שורות וגלשה מהמגש.
      head =
        '<div class="up-head">' + avatar +
          '<div class="up-head__txt">' +
            '<div class="up-name">' + CBA.esc(currentUser.name || currentUser.email) + '</div>' +
            '<div class="up-sub">' + CBA.esc(currentUser.email) + '</div>' +
            '<span class="up-role" title="' + CBA.esc(myRoleLabel()) + '">' + CBA.esc(myRoleLabel()) + '</span>' +
          '</div>' +
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

  /* מסך "מתחברים…" — מוצג מרגע שגוגל מחזיר תשובה ועד שהשרת שלנו מסיים לבדוק
     אותה (יכול לקחת כמה שניות). בלי זה המשתמש רואה שוב את כפתור הכניסה
     הרגיל ולא יודע שהלחיצה שלו בכלל התקבלה — נראה כאילו לא קרה כלום, אז
     חלקם ניסו ללחוץ שוב. (2026-08-09) */
  function showLoginConnecting() {
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
        '<div class="login-connecting"><span class="spinner" aria-hidden="true"></span><span>מתחברים…</span></div>' +
      '</div>';
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
          '<div class="form-field"><label>טלפון</label>' +
            '<input class="field-input" id="su-phone" type="tel" inputmode="tel" placeholder="050-1234567"></div>' +
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
      const phone = wrap.querySelector("#su-phone").value.trim();
      if (!first || !last || !house || !phone) {
        msg.hidden = false; msg.className = "signup-msg signup-msg--err";
        msg.textContent = "צריך למלא שם פרטי, שם משפחה, מספר בית וטלפון.";
        return;
      }
      send.disabled = true; send.textContent = "שולח…";
      const q = "?action=submitSignup&token=" + encodeURIComponent(signupToken) +
        "&firstName=" + encodeURIComponent(first) +
        "&lastName=" + encodeURIComponent(last) +
        "&house=" + encodeURIComponent(house) +
        "&phone=" + encodeURIComponent(phone);
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
    showLoginConnecting();   // גוגל כבר סיימה; עכשיו מחכים לשרת שלנו — תראו את זה, לא מסך ריק
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
    const groupBtn = e.target.closest("[data-group]");
    if (groupBtn) { toggleGroup(groupBtn.dataset.group); return; }
    const tab = e.target.closest(".app-nav__tab[data-screen]");
    if (tab) showScreen(tab.dataset.screen);
  });

  // אתחול: מושב מתמשך + מטמון מקומי → תצוגה מיידית, ורענון ברקע (stale-while-revalidate)
  let inited = false;
  let headerReady = false;
  // (2026-08-09) הניווט העליון קבוע ב-index.html וכבר "נראה" לחיץ מהרגע
  // הראשון, הרבה לפני ש-inited הופך ל-true (ר' ההערה ב-showScreen). הקלאס
  // הזה (מוגדר ב-loading.css) מעמעם אותו ומכבה לחיצות עד שהאפליקציה באמת
  // מוכנה — כדי שלחיצה מוקדמת לא "תיעלם" בלי הסבר, אלא פשוט תיראה לא-פעילה.
  document.body.classList.add("app-booting");
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
      document.body.classList.remove("app-booting");   // הניווט הופך לפעיל בדיוק עכשיו, לא לפני
      ensureHeaderShell();
      if (currentUser) { routeByRole(); }
      else { applyUser(); AREAS = JSON.parse(JSON.stringify(AREAS_ALL)); initialRoute("admin"); }   // אורח מאחורי הגייט — שלד מלא, לא נגיש בפועל
      window.CBA.refreshAlerts();
      lastDataFingerprint = dataFingerprint();
    } else {
      // הגיע עדכון נוסף — מציגים רק אם הנתונים בפועל שונים, ובעדינות (פולס
      // על המספרים, לא ריצוד של המסך). אותו שיקול "לא לגנוב הקלדה" כמו ב-doPoll.
      var fp = dataFingerprint();
      var changed = fp === null || fp !== lastDataFingerprint;
      if (changed) {
        if (userIsEditingMain()) {
          pendingSilentRefresh = true;
        } else {
          lastDataFingerprint = fp;
          renderYearSwitch();
          showScreen(currentScreen, { silent: true });
          if (info && info.source === "fresh" && info.hadCache) toastRefreshed();
        }
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

  /* (2026-08-09, לבקשת יועד — "עדכון מהיר לצד יציבות, לעולם לא לאבד נתונים")
     גם בלי שום שמירה בעיצומה (isDirty), אם המשתמש כרגע ממש מקליד/עורך שדה
     במסך (input/select/textarea בתוך #app-main) — רענון רקע לא אמור "לגנוב"
     לו את זה. markDirty/isDirty מכסים את הפער בין עריכה לשמירה בפועל, אבל
     יש מסכים (למשל טופס הגשת קבלה של תושב) שבהם המשתמש ממלא טופס ארוך
     *לפני* שיש בכלל מה לשמור — אין עדיין isDirty, אבל יש עדיין משהו יקר
     לאבד. userIsEditingMain בודק את זה ישירות, בלי שכל מסך יצטרך לדווח על
     עצמו: אם הפוקוס כרגע בתוך שדה קלט במסך הראשי, מדלגים על ציור-מחדש הפעם
     (אבל עדיין קולטים את הנתונים ל-CBA.mock ברקע — רק לא מציירים) וממתינים
     למחזור הבא, או עד שהמשתמש עוזב את השדה (ר' listener ה-blur למטה). */
  function userIsEditingMain() {
    var el = document.activeElement;
    return !!(el && main && main.contains(el) && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName));
  }
  var pendingSilentRefresh = false;

  function doPoll() {
    if (document.hidden || !inited || !currentUser || pollInFlight) return;
    // יש עריכה מקומית שטרם אושרה בשרת (למשל במסך התכנון) — מדלגים על המחזור
    // הזה כדי לא לדרוס אותה; ר' ההסבר המלא ב-sheets.js (markDirty/apply).
    if (CBA.sheets.isDirty && CBA.sheets.isDirty()) return;
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
      if (changed) {
        if (userIsEditingMain()) {
          // המשתמש באמצע הקלדה — לא מציירים עכשיו. lastDataFingerprint נשאר
          // בכוונה ישן, כדי שהמחזור הבא (או ה-blur listener) עדיין "יראה"
          // שינוי וישלים את הציור בפועל ברגע שבטוח.
          pendingSilentRefresh = true;
        } else {
          lastDataFingerprint = fp;
          renderYearSwitch();
          showScreen(currentScreen, { silent: true });   // עדכון רקע — פולס על מה שהשתנה, לא רענון מסך מלא
          if (info && info.source === "fresh") toastRefreshed();
        }
      }
      refreshAlertsLocal();   // מקומי בלבד (זול) — שריוני מועדון מתעדכנים בקצב נמוך יותר, ראה מעלה
    });
  }
  // ברגע שעוזבים שדה (blur) ואין יותר עריכה פעילה במסך — אם היה רענון ממתין
  // שדילגנו עליו, מריצים אותו מיד, כדי שהנתונים לא יישארו מיושנים מיותר מדי
  // זמן (עקרון: עדכון מהיר ברגע שבטוח, לא רק יציבות). capture:true כי blur
  // לא מבעבע (bubble) כמו רוב האירועים.
  main.addEventListener("blur", function () {
    if (pendingSilentRefresh && !userIsEditingMain()) {
      pendingSilentRefresh = false;
      doPoll();
    }
  }, true);
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
