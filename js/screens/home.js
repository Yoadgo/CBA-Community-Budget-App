/* home.js — עמוד הקבלה (2026-08-27)
   ============================================================================
   המסך הראשון שכל אחד רואה, מנהל ותושב כאחד. עד היום האפליקציה נפתחה ישר
   לתוך עבודה — מנהל על "תכנון מול ביצוע", תושב על "הבקשות שלי" — וזה הניח
   שלכל מי שנכנס כבר יש משימה. עמוד הקבלה מניח את ההפך: קודם מראים לך מה
   המצב, ורק אז אתה בוחר לאן ללכת.

   שלושה כללים לכל עריכה עתידית:
   1. **עמוד הקבלה לא כותב כלום.** הוא קורא ומנווט בלבד. כל כפתור בו מוביל
      למסך שבו הפעולה באמת קורית, עם כל הבדיקות שלה.
   2. **אין כאן בדיקת הרשאה חדשה.** מה שמוצג נגזר מ-CBA.perms/CBA.isSuper
      שכבר נקבעו ב-app.js, והקפיצה לאזור הניהול עוברת ב-CBA.gotoAdmin —
      שהוא בדיוק אותו מסלול של תפריט המשתמש.
   3. **טעינה עצלה בלבד.** שתי הספירות היחידות שדורשות פנייה לשרת (בקשות
      הרשמה, תשלומי מכון) נטענות רק למי שיש לו את ההרשאה המתאימה, ומציגות
      שלד עד שהן חוזרות. עמוד הקבלה לא מרשה לעצמו להיות המסך האיטי באפליקציה.
   ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  function u() { return (window.CBA && CBA.user) || {}; }
  function can(p) { return !!CBA.isSuper || ((CBA.perms || []).indexOf(p) !== -1); }
  function anyAdmin() {
    return !!CBA.isSuper || ["תקציב", "מועדון", "תושבים", "מכון"].some(can);
  }

  var ICO = {
    receipt: '<path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 12.5h7M8.5 16h4.5"/>',
    key:     '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    map:     '<path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7z"/><path d="M9 4v13M15 7v13"/>',
    users:   '<circle cx="9" cy="9" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 6.2a3.2 3.2 0 0 1 0 5.6M17.5 19a6 6 0 0 0-2-4.5"/>',
    chev:    '<path d="m14 6-6 6 6 6"/>',
    spark:   '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/>',
    person:  '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>'
  };
  function svg(d, size) {
    var n = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }

  /* ברכה לפי שעה — הדבר הקטן שגורם למסך להרגיש כמו מקום ולא כמו טופס */
  function greeting() {
    var h = new Date().getHours();
    if (h < 5)  return "לילה טוב";
    if (h < 12) return "בוקר טוב";
    if (h < 17) return "צהריים טובים";
    if (h < 21) return "ערב טוב";
    return "לילה טוב";
  }
  function todayLabel() {
    try {
      return new Date().toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" });
    } catch (e) { return ""; }
  }
  function displayName() {
    var me = u();
    if (CBA.residentUtils && CBA.residentUtils.fullName) {
      var n = CBA.residentUtils.fullName(me);
      if (n) return n;
    }
    return me.firstName || me.name || me.family || "שכן";
  }

  /* ---------------------------------------------------- "מה מחכה לאישורך" */
  /* כל שורה: תווית, מספר, ולאן קופצים. שורה עם 0 לא מוצגת בכלל — עמוד קבלה
     שמלא באפסים מלמד את העין להתעלם ממנו. */
  function taskRow(label, n, target, tone) {
    return '<button type="button" class="hm-task' + (tone ? " hm-task--" + tone : "") + '" data-admin-goto="' + esc(target) + '">' +
      '<span class="hm-task__n">' + n + '</span>' +
      '<span class="hm-task__l">' + esc(label) + '</span>' +
      '<span class="hm-task__c">' + svg(ICO.chev, 16) + '</span>' +
      '</button>';
  }

  function adminSectionHTML() {
    if (!anyAdmin()) return "";
    var a = (window.CBA.alerts ? CBA.alerts() : null) || {};
    var rows = "";
    if (can("תקציב")) {
      if (a.pendingExpenses) rows += taskRow("הוצאות ממתינות לאישור", a.pendingExpenses, "expenses-pending", "warn");
      if (a.reviewExpenses)  rows += taskRow("הוצאות שהוחזרו לבדיקה", a.reviewExpenses, "expenses-pending");
    }
    if (can("מועדון") && a.pendingClub) rows += taskRow("שריוני מועדון ממתינים לאישור", a.pendingClub, "clubAdmin", "warn");

    // שתי השורות הבאות נטענות מהשרת ולכן מקבלות מקום שמור עם שלד
    var lazy = "";
    if (can("תושבים")) lazy += '<div id="hm-signups" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    if (can("תושבים")) lazy += '<div id="hm-profile" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    if (can("מכון"))   lazy += '<div id="hm-gym" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';

    return '<section class="card hm-card">' +
      '<div class="hm-card__head"><h2 class="hm-card__t">מה מחכה לאישורך</h2>' +
        '<span class="hm-card__sub">רק מה ששייך לתחומי הניהול שלך</span></div>' +
      '<div class="hm-tasks" id="hm-tasks">' + rows + lazy + '</div>' +
      '<div class="hm-clear" id="hm-clear"' + (rows ? " hidden" : "") + '>' +
        CBA.ui.emptyState({ icon: "check", title: "הכול מטופל",
          sub: "אין כרגע שום דבר שממתין לאישור שלך." }) +
      '</div>' +
      '</section>';
  }

  /* מטמון קצר לשתי הספירות שדורשות שרת. עמוד הקבלה מצייר את עצמו מחדש בכל
     פעם שספירת ההתראות זזה (ר' refreshHomeIfOpen ב-app.js), ובלי המטמון הזה
     כל תזוזה כזו הייתה מייצרת שתי קריאות רשת נוספות. דקה היא מספיק טרי
     לעמוד נחיתה, ומספיק ארוך כדי שרצף ציורים לא יהפוך לרצף בקשות. */
  var LAZY_TTL = 60 * 1000;
  var lazyCache = { signups: null, gym: null, profile: null, ts: 0 };
  function cacheFresh() { return lazyCache.ts && (Date.now() - lazyCache.ts) < LAZY_TTL; }

  /* שלושת הסינונים, במקום אחד (2026-09-09). שני מסלולים סופרים אותם עכשיו —
     הקריאה המאוחדת והקריאות הבודדות — ושתי העתקות של אותו תנאי הן בדיוק איך
     נולד "המספר במסך לא מסכים עם המספר בגיליון". */
  function countPending(rows) {
    return (rows || []).filter(function (r) {
      return String(r.status || r["סטטוס"] || "").trim() === "ממתין";
    }).length;
  }
  function countGymPending(res) {
    return ((res && (res.members || res.rows)) || []).filter(function (x) {
      return String(x["סטטוס"] || "").trim() === "ממתין לאימות";
    }).length;
  }

  /* ============================================================================
   *  עמוד הבית בקריאה אחת (2026-09-09)
   * ----------------------------------------------------------------------------
   *  נמדד חי: קריאה ל-Apps Script עולה ~1.5 שניות **מינימום**, גם כשהיא לא
   *  נוגעת בגיליון. עמוד הבית שלח שש קריאות — כלומר ~9 שניות של תקורה טהורה
   *  לפני שנקראה שורה אחת. `profileChanges` לבדה החזירה 21 בתים ב-3.3 שניות.
   *
   *  הפונקציה הזאת מושכת הכול פעם אחת ו**מזינה את המטמונים הקיימים**. היא
   *  במכוון לא נוגעת ב-loadLazyCounts/loadNextReservation/loadNewCard עצמן:
   *  הן רצות אחריה בדיוק כמו קודם, מוצאות מטמון טרי, ולא פונות לרשת.
   *
   *  ⚠️ **זו הסיבה שהנפילה-לאחור עובדת מעצמה.** אם השרת עדיין ישן, או שהקריאה
   *     נכשלה — המטמונים נשארים ריקים ושלוש הפונקציות פונות לרשת בדיוק כמו
   *     היום. אין תלות בסדר הדיפלוי בין הלקוח לשרת.
   *  ⚠️ מקטע שהמשתמש לא רשאי לראות פשוט **לא חוזר** מהשרת (ר' handleHomeExtras_),
   *     ולכן `undefined` כאן הוא תשובה תקינה ולא כשל. */
  function primeHomeExtras(done) {
    if (!CBA.data || !CBA.data.getHomeExtras) { done(); return; }
    if (cacheFresh() && resvFresh()) { done(); return; }   // הכול טרי — אין מה למשוך
    CBA.data.getHomeExtras(function (res) {
      if (!res || !res.ok || !res.homeExtras) { done(); return; }   // שרת ישן/כשל -> המסלול הישן
      if (res.signups && res.signups.ok) lazyCache.signups = countPending(res.signups.rows);
      if (res.profile && res.profile.ok) lazyCache.profile = countPending(res.profile.rows);
      if (res.gym && res.gym.ok) lazyCache.gym = countGymPending(res.gym);
      lazyCache.ts = Date.now();

      if (res.reservations && res.reservations.ok) {
        resvCache.list = (res.reservations.reservations || []).slice().sort(function (a, b) {
          return new Date(a.start) - new Date(b.start);
        });
        resvCache.ts = Date.now();
      }
      if (res.tour && window.CBA.tour && CBA.tour.seed) CBA.tour.seed(res.tour);
      if (res.club && window.CBA.seedClubAlerts) CBA.seedClubAlerts(res.club);
      done();
    });
  }

  /* טעינת שתי הספירות שדורשות שרת. כל אחת עצמאית: כישלון של אחת לא מוחק
     את השנייה ולא שובר את העמוד — היא פשוט נעלמת בשקט. */
  function loadLazyCounts(container) {
    var slotS = container.querySelector("#hm-signups");
    var slotG = container.querySelector("#hm-gym");
    var slotP = container.querySelector("#hm-profile");

    function done(slot, html) {
      if (!slot || !slot.isConnected) return;
      slot.outerHTML = html || "";
      syncClearState(container);
      bindAdminJumps(container);
    }

    function signupRow(n) { return n ? taskRow("בקשות הרשמה לקהילה", n, "residents", "warn") : ""; }
    function profileRow(n) { return n ? taskRow("בקשות שינוי פרטים", n, "residents", "warn") : ""; }
    function gymRow(n) { return n ? taskRow("תשלומי מכון כושר לאימות", n, "gymAdmin", "warn") : ""; }

    if (cacheFresh()) {
      if (slotS) done(slotS, signupRow(lazyCache.signups || 0));
      if (slotG) done(slotG, gymRow(lazyCache.gym || 0));
      if (slotP) done(slotP, profileRow(lazyCache.profile || 0));
      return;
    }
    lazyCache.ts = Date.now();

    if (slotS && CBA.data.listSignups) {
      CBA.data.listSignups(function (res) {
        var n = (res && res.ok) ? countPending(res.rows) : 0;
        lazyCache.signups = n;
        done(slotS, signupRow(n));
      });
    } else if (slotS) { done(slotS, ""); }

    if (slotG && CBA.data.getGymList) {
      CBA.data.getGymList(function (res) {
        var n = (res && res.ok) ? countGymPending(res) : 0;
        lazyCache.gym = n;
        done(slotG, gymRow(n));
      });
    } else if (slotG) { done(slotG, ""); }

    if (slotP && CBA.data.getProfileChanges) {
      CBA.data.getProfileChanges(function (res) {
        var n = (res && res.ok) ? countPending(res.rows) : 0;
        lazyCache.profile = n;
        done(slotP, profileRow(n));
      });
    } else if (slotP) { done(slotP, ""); }
  }

  /* "הכול מטופל" מוצג רק כשבאמת לא נשארה אף שורה — כולל אחרי שהטעינות
     העצלות חזרו ריקות. */
  function syncClearState(container) {
    var tasks = container.querySelector("#hm-tasks");
    var clear = container.querySelector("#hm-clear");
    if (!tasks || !clear) return;
    var has = tasks.querySelector(".hm-task") || tasks.querySelector(".hm-lazy");
    clear.hidden = !!has;
  }

  /* ------------------------------------------------------ "אצלי בבית" */
  function mineSectionHTML() {
    var counts = { pending: 0, ready: 0, paid: 0 };
    if (CBA.residentUtils && CBA.residentUtils.myRequests) {
      var groups = CBA.residentUtils.splitRequests(CBA.residentUtils.myRequests());
      groups.refunds.forEach(function (t) {
        if (t.status === "submitted") counts.pending++;
        else if (t.status === "ready") counts.ready++;
        else if (t.status === "paid") counts.paid += (t.amount || 0);
      });
    }
    var money = CBA.formatILS ? CBA.formatILS(counts.paid) : String(counts.paid);
    return '<section class="card hm-card">' +
      '<div class="hm-card__head"><h2 class="hm-card__t">אצלנו בבית</h2>' +
        '<button type="button" class="hm-link" data-goto="resRequests">לכל הבקשות</button></div>' +
      '<div class="hm-mine">' +
        '<button type="button" class="hm-stat" data-goto="resRequests"><span class="hm-stat__v">' + counts.pending + '</span><span class="hm-stat__l">ממתינות</span></button>' +
        '<button type="button" class="hm-stat" data-goto="resRequests"><span class="hm-stat__v">' + counts.ready + '</span><span class="hm-stat__l">אושרו</span></button>' +
        '<button type="button" class="hm-stat" data-goto="resRequests"><span class="hm-stat__v hm-stat__v--money">' + money + '</span><span class="hm-stat__l">שולמו השנה</span></button>' +
      '</div>' +
      '<div id="hm-next" class="hm-next">' + CBA.skel.rows(1, { avatar: false }) + '</div>' +
      '</section>';
  }

  /* מטמון נפרד לשריון הקרוב (2026-09-09).
     ⚠️ ה-lazyCache שמעל נבנה ב-27.8 בדיוק בשביל הבעיה הזאת — אבל הוא מכסה
     שלושה מארבעת הטעונים העצלים של העמוד ו**מפספס דווקא את הרביעי**.
     נמדד חי על הייצור: טעינה אחת של עמוד הבית שלחה `myClubReservations`
     **שלוש פעמים** (העמוד מצייר את עצמו שלוש פעמים באתחול), מול פעם אחת
     לכל אחד משלושת האחרים. איחוד הבקשות ב-sheets.js תופס את שתי הראשונות
     שחופפות בזמן; השלישית יוצאת אחרי שהראשונה כבר חזרה, ורק מטמון תופס אותה.
     ts נפרד ולא שימוש ב-lazyCache.ts: הטעונים לא רצים תמיד יחד, ו-ts משותף
     היה גורם ל"טרי" לחזור אמת בזמן שהערך כאן מעולם לא נטען. */
  var resvCache = { list: null, ts: 0 };
  function resvFresh() { return resvCache.ts && (Date.now() - resvCache.ts) < LAZY_TTL; }

  /* השריון הקרוב — שורה אחת בלבד. מי שרוצה את הרשימה המלאה הולך למסך השריון. */
  function loadNextReservation(container) {
    var slot = container.querySelector("#hm-next");
    if (!slot) return;
    var me = u();
    var fam = String(me.familyId || me.house || "").trim();
    if (!fam || !CBA.data.getMyClubReservations) { slot.innerHTML = ""; return; }

    if (resvFresh()) { paintNext(slot, resvCache.list || []); return; }

    CBA.data.getMyClubReservations({ family: fam, email: me.email || "" }, function (res) {
      if (!res || !res.ok) { if (slot.isConnected) slot.innerHTML = ""; return; }
      var list = (res.reservations || []).slice().sort(function (a, b) {
        return new Date(a.start) - new Date(b.start);
      });
      resvCache.list = list;
      resvCache.ts = Date.now();
      if (!slot.isConnected) return;
      paintNext(slot, list);
    });
  }

  /* ציור השורה — חולץ מתוך ה-callback כדי שגם המסלול מהמטמון וגם המסלול
     מהרשת יציירו בדיוק אותו דבר. */
  function paintNext(slot, list) {
    {
      var next = list[0];
      if (!next) {
        slot.innerHTML = '<button type="button" class="hm-next__empty" data-goto="resReserve">' +
          svg(ICO.key, 18) + '<span>אין שריון קרוב — אפשר לשרין את המועדון</span>' + svg(ICO.chev, 16) + '</button>';
        return;
      }
      var s = new Date(next.start), e = new Date(next.end);
      var day = s.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
      var time = pad(s.getHours()) + ":" + pad(s.getMinutes()) + "–" + pad(e.getHours()) + ":" + pad(e.getMinutes());
      var pend = next.status === "pending";
      slot.innerHTML = '<button type="button" class="hm-next__row" data-goto="resReserve">' +
        '<span class="hm-next__ico">' + svg(ICO.key, 18) + '</span>' +
        '<span class="hm-next__txt"><b>המועדון ' + esc(day) + '</b><small>' + esc(time) +
          (pend ? " · ממתין לאישור" : " · מאושר") + '</small></span>' +
        svg(ICO.chev, 16) + '</button>';
    }
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }

  /* ------------------------------------------------- "יש משהו חדש" ------
     כשמוסיפים צעד לסיור עם מספר גרסה חדש, תושב ותיק לא מקבל השתלטות על
     המסך — הוא מקבל את הכרטיס הזה, וגם אותו רק אם באמת יש משהו שלא ראה.
     ההחלטה הזו היא כל ההבדל בין "האפליקציה מלמדת אותי" ל"האפליקציה קופצת
     עליי". ר' js/ui/tour.js. */
  function loadNewCard(container) {
    var slot = container.querySelector("#hm-new");
    if (!slot || !window.CBA.tour) return;
    CBA.tour.newCount(function (n) {
      if (!slot.isConnected) return;
      if (!n) { slot.innerHTML = ""; return; }
      slot.innerHTML =
        '<button type="button" class="tr-new" data-tour-new>' +
          '<span class="tr-new__ico">' + svg(ICO.spark, 18) + '</span>' +
          '<span class="tr-new__txt"><b>' +
            (n === 1 ? "נוסף משהו חדש לאפליקציה" : "נוספו " + n + " דברים חדשים לאפליקציה") +
          '</b><small>הצצה קצרה, פחות מדקה</small></span>' +
          '<span class="tr-new__c">' + svg(ICO.chev, 16) + '</span>' +
        '</button>';
    });
  }

  /* ------------------------------------------------------- פעולות מהירות */
  function actionsHTML() {
    var items = [
      ["resSubmit",  ICO.receipt, "הגשת קבלה"],
      ["resReserve", ICO.key,     "שריון מועדון"],
      ["resMap",     ICO.map,     "מפת השיכון"],
      ["resDirectory", ICO.users, "שכנים"],
      ["resMe",        ICO.person, "הפרטים שלי"]
    ];
    return '<section class="hm-actions">' + items.map(function (it) {
      return '<button type="button" class="hm-act" data-goto="' + it[0] + '">' +
        '<span class="hm-act__ico">' + svg(it[1], 22) + '</span>' +
        '<span class="hm-act__l">' + esc(it[2]) + '</span></button>';
    }).join("") + '</section>';
  }

  /* ------------------------------------------------------------- חיווט ----
     האזנה אחת על המכל כולו, ולא מאזין לכל כפתור. חלק מהכפתורים כאן נולדים
     מאוחר יותר (השריון הקרוב, שתי הספירות העצלות) — מאזין שנרשם בזמן הציור
     היה מפספס בדיוק אותם. */
  function bindClicks(container) {
    container.addEventListener("click", function (e) {
      var admin = e.target.closest("[data-admin-goto]");
      if (admin) { if (window.CBA.gotoAdmin) CBA.gotoAdmin(admin.dataset.adminGoto); return; }
      if (e.target.closest("[data-tour-new]")) { if (window.CBA.tour) CBA.tour.startNew(); return; }
      var go = e.target.closest("[data-goto]");
      if (go && CBA.navigate) CBA.navigate(go.dataset.goto);
    });
  }
  function bindAdminJumps() { /* נשמר לתאימות — החיווט עבר להאזנה על המכל */ }

  CBA.screens.resHome = {
    render: function (container) {
      container.innerHTML =
        '<header class="hm-hero">' +
          '<div class="hm-hero__hi">' + esc(greeting()) + ', ' + esc(displayName()) + '</div>' +
          '<div class="hm-hero__sub">' + esc(todayLabel()) +
            (u().house ? ' · בית ' + esc(u().house) : "") + '</div>' +
        '</header>' +
        '<div id="hm-new"></div>' +
        adminSectionHTML() +
        mineSectionHTML() +
        actionsHTML();

      bindClicks(container);
      syncClearState(container);
      /* קריאה אחת מזינה את כל המטמונים, ואז שלוש הפונקציות רצות בדיוק כמו
         קודם — רק בלי לפנות לרשת. ר' primeHomeExtras. */
      primeHomeExtras(function () {
        loadLazyCounts(container);
        loadNextReservation(container);
        loadNewCard(container);
      });
    }
  };
})();
