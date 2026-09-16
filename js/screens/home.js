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
  /* ⚠️ 2026-09-09 — "גינון" היה חסר כאן, בעוד ש-hasAnyAdmin ב-app.js כן כלל
     אותו. התוצאה: מנהל גינון ראה את מתג "ניהול" בתפריט, אבל עמוד הבית שלו
     לא הציג לו את כרטיס האישורים בכלל — ואצל מנהל־על הכרטיס הכריז "הכול
     מטופל" בזמן ששלוש משימות גינון חיכו לאישורו (נמדד חי בייצור). */
  function anyAdmin() {
    return !!CBA.isSuper || ["תקציב", "מועדון", "תושבים", "מכון", "גינון"].some(can);
  }

  var ICO = {
    receipt: '<path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 12.5h7M8.5 16h4.5"/>',
    key:     '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    map:     '<path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7z"/><path d="M9 4v13M15 7v13"/>',
    users:   '<circle cx="9" cy="9" r="3.2"/><path d="M3 19a6 6 0 0 1 12 0"/><path d="M16 6.2a3.2 3.2 0 0 1 0 5.6M17.5 19a6 6 0 0 0-2-4.5"/>',
    chev:    '<path d="m14 6-6 6 6 6"/>',
    spark:   '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6.3 6.3 2.8 2.8M14.9 14.9l2.8 2.8M17.7 6.3l-2.8 2.8M9.1 14.9l-2.8 2.8"/>',
    person:  '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20a7.2 7.2 0 0 1 14.4 0"/>',
    /* שלושת החדשים (2026-09-16) — עלה הגינון וההרמה זהים ל-NAV_ICONS
       ב-app.js במכוון: אותו נושא, אותו סמליל, בכל מקום באפליקציה. */
    leaf:    '<path d="M4 20c0-8 5-14 16-15 1 11-5 16-13 16"/><path d="M4 20c3-5 6-8 11-10"/>',
    gym:     '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
    badge:   '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/>'
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
    if (can("גינון"))  lazy += '<div id="hm-garden" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';

    /* 🔴 "תפקיד ועד" (2026-09-16) — שם וכרטיס נפרדים, לבקשת יועד.
       הרקע: הכרטיס הזה והכרטיס המשפחתי שמתחתיו ענו על שתי שאלות
       שונות לגמרי — "מה מחכה לי כגזבר" מול "מה פתוח למשפחה שלי" —
       ושניהם היו לבנים, זה מעל זה, בלי שום סימן שמפריד ביניהם.
       ⚠️ **המחלקות `hm-tasks`/`hm-clear` והמזהים לא השתנו** במכוון:
          `loadLazyCounts`, `fastPaint` ו-`syncClearState` בוחרות לפיהם,
          וכל שינוי שם היה מנתק את התגיות מהשלד שמחכה להן. */
    return '<section class="hm-card hm-vaad">' +
      '<div class="hm-vaad__head">' +
        '<span class="hm-vaad__ico">' + svg(ICO.badge, 15) + '</span>' +
        '<h2 class="hm-vaad__t">תפקיד ועד</h2>' +
        '<span class="hm-vaad__sub">רק מה ששייך לתחומי הניהול שלך</span></div>' +
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
  /* ⚠️ לגינון חותמת זמן **נפרדת** (2026-09-09). `ts` המשותף נכתב גם ע"י
     primeHomeExtras — הקריאה המאוחדת — שאינה מביאה את ספירת הגינון כלל.
     התוצאה עם ts משותף: cacheFresh() חוזר true, `garden` נשאר null, והשורה
     מצוירת כאפס ולכן לא מוצגת — לנצח. נתפס בבדיקה חיה: השרת החזיר משימה
     אחת ממתינה, והכרטיס הכריז "הכול מטופל".
     זו בדיוק המלכודת שכבר מתועדת בקובץ הזה עצמו לגבי הטעונים האחרים. */
  var lazyCache = { signups: null, gym: null, profile: null, garden: null,
                    ts: 0, gardenTs: 0 };
  function cacheFresh() { return lazyCache.ts && (Date.now() - lazyCache.ts) < LAZY_TTL; }
  function gardenFresh() { return lazyCache.gardenTs && (Date.now() - lazyCache.gardenTs) < LAZY_TTL; }

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
  function signupRow(n) { return n ? taskRow("בקשות הרשמה לקהילה", n, "residents", "warn") : ""; }
  function profileRow(n) { return n ? taskRow("בקשות שינוי פרטים", n, "residents", "warn") : ""; }
  function gymRow(n) { return n ? taskRow("תשלומי מכון כושר לאימות", n, "gymAdmin", "warn") : ""; }
  /* ⚠️ התווית חייבת לתאר בדיוק את מה שנספר. `scope:"pending"` בשרת
     מחזיר **רק** משימות עם דגל "ממתין לאישור" — לא "דורש בדיקה
     בשטח" ולא משוב שלילי, שגם הם ברשימת "להחלטתך" של מסך
     המשימות. "שמחכות לך" היה מבטיח את הרשימה הרחבה ומראה
     את המספר הצר, וזה בדיוק "שני מספרים שלא מסכימים"
     שאנחנו מנקים מהמודול. היעד נשאר gardenInbox — הוא נוחת על
     הרשימה הרחבה, שמכילה תמיד את מה שנספר כאן. */
  function gardenRow(n) { return n ? taskRow("משימות גינון לאישורך", n, "gardenInbox", "warn") : ""; }

  /* ============================================================================
   *  🔴 התגיות מ-Firestore — הציור הראשון   (2026-09-16, פעולה 3)
   * ----------------------------------------------------------------------------
   *  📊 `homeExtras` עולה 6,486 אלפיות וקריאת Firestore 24–163.
   *  עד היום כל חמש התגיות המתינו לאותה קריאה אחת.
   *
   *  ⚠️ **מחליף תוכן, לא את המכל.** `loadLazyCounts` מחליףה
   *     את ה-div עצמו (`outerHTML`) כשהתשובה הקובעת מגיעה.
   *     לו המסלול המהיר היה עושה את אותו דבר, המזהה היה
   *     נעלם והתשובה האמיתית לא היתה מוצאת לאן לצייר —
   *     כלומר מספר מ-Firestore שלעולם לא מתקן את עצמו.
   *  ⚠️ ולכן גם `hm-lazy` נשאר: הספירה עדיין בדרך, ו"הכול
   *     מטופל" אסור שיופיע על סמך מסמך שעוד לא אומת.
   * ========================================================================== */
  function fastPaint(container, sel, html) {
    var slot = container.querySelector(sel);
    if (!slot || !slot.isConnected) return;   /* התשובה הקובעת הקדימה */
    slot.innerHTML = html || "";
  }

  function seedCountsFast(container, done) {
    done = done || function () {};
    if (!(CBA.data && CBA.data.getHomeCountsFast)) return done();
    var want = [];
    if (can("תושבים")) want.push("residents");
    if (can("מכון"))   want.push("gym");
    if (can("גינון"))  want.push("garden");
    if (can("מועדון")) want.push("club");
    /* ⚠️ תושב בלי הרשאות ניהול: אין תגיות ואין מה לקרוא — אבל **כן**
       מסמנים את המטמון כטרי, אחרת `primeHomeExtras` היה יוצא לרשת
       בשבילו בדיוק כמו קודם, למרות שאין לו מה לקבל משם. */
    if (!want.length) { lazyCache.ts = Date.now(); return done(); }
    CBA.data.getHomeCountsFast(want, function (c) {
      if (!c) return done();
      /* 🔴 **מסמנים טרי רק כשכל מה שביקשנו באמת הגיע.** מסמך אחד
         שנדחה או חסר ⇒ `primeHomeExtras` יוצא כרגיל ומשלים. */
      var all = want.every(function (d) { return !!c[d]; });
      if (c.residents) {
        fastPaint(container, "#hm-signups", signupRow(Number(c.residents.signups) || 0));
        fastPaint(container, "#hm-profile", profileRow(Number(c.residents.profile) || 0));
      }
      if (c.gym)    fastPaint(container, "#hm-gym",    gymRow(Number(c.gym.pending) || 0));
      if (c.garden) fastPaint(container, "#hm-garden", gardenRow(Number(c.garden.pending) || 0));
      /* תגית המועדון יושבת בניווט, ולכן עוברת באותה דלת
         שהתשובה האמיתית עוברת בה. נקודת כניסה אחת. */
      if (c.club && window.CBA.seedClubAlerts) {
        CBA.seedClubAlerts({ ok: true, pending: Number(c.club.pending) || 0 });
      }
      if (all) {
        if (c.residents) { lazyCache.signups = Number(c.residents.signups) || 0;
                           lazyCache.profile = Number(c.residents.profile) || 0; }
        if (c.gym)    lazyCache.gym = Number(c.gym.pending) || 0;
        if (c.garden) { lazyCache.garden = Number(c.garden.pending) || 0;
                        lazyCache.gardenTs = Date.now(); }
        lazyCache.ts = Date.now();
      }
      done();
    });
  }

  /* ============================================================================
   *  🔴 הסיור והשריון הקרוב — שני האחרונים שעוד החזיקו את Apps Script
   *     (2026-09-16, צעד 12)
   * ----------------------------------------------------------------------------
   *  אחרי שהמונים עברו, `homeExtras` נשארה בחיים בשביל שני דברים בלבד:
   *  כרטיס "יש משהו חדש" ושורת השריון הקרוב. שניהם יושבים עכשיו
   *  ב-Firestore, וכשכל השלושה מגיעים — `primeHomeExtras` **מוצא את כל
   *  המטמונים טריים ואינו יוצא לרשת בכלל**. לא הוספתי מסלול דילוג חדש:
   *  התנאי שכבר קיים שם הוא זה שסוגר את הקריאה.
   *
   *  ⚠️ **כל אחד מהם עצמאי.** מסמך שנדחה או חסר משאיר את המטמון שלו
   *     ריק, ואז הקריאה יוצאת ומשלימה בדיוק כמו אתמול. אין מסלול שבו
   *     כישלון של אחד מסתיר את השני.
   * ========================================================================== */
  function seedTourFast(done) {
    done = done || function () {};
    if (!(CBA.data && CBA.data.getTourFast && window.CBA.tour && CBA.tour.seed)) return done();
    CBA.data.getTourFast(function (res) {
      if (res && res.ok) CBA.tour.seed(res);
      done();
    });
  }

  function seedResvFast(container, done) {
    done = done || function () {};
    if (!(CBA.data && CBA.data.getClubResvFast)) return done();
    CBA.data.getClubResvFast(function (res) {
      if (!res || !res.ok) return done();
      resvCache.list = (res.reservations || []).slice().sort(function (a, b) {
        return new Date(a.start) - new Date(b.start);
      });
      resvCache.ts = Date.now();
      var slot = container.querySelector("#hm-next");
      if (slot && slot.isConnected) paintNext(slot, resvCache.list);
      done();
    });
  }

  /* 🔴🔴 **הקריאה הקובעת מחכה לשלושת המהירים — עד גג.**
     בלי ההמתנה הזאת `primeHomeExtras` היה נבדק **לפני** שהמסמכים
     חזרו, מוצא מטמון ריק, ויוצא לרשת תמיד — כלומר כל הצעד הזה לא
     היה עושה דבר. ⚠️ ועם גג, כי קריאת Firestore שנתקעת אסור שתשאיר
     את עמוד הבית בלי המסלול הישן. 1,200 אלפיות מול 4,500–8,100 של
     `homeExtras` — עסקה טובה גם במקרה הגרוע. */
  var FAST_WAIT_MS = 1200;
  function seedHomeFast(container, done) {
    var left = 3, fired = false;
    function settle() { if (fired) return; fired = true; done(); }
    function one() { if (--left <= 0) settle(); }
    setTimeout(settle, FAST_WAIT_MS);
    seedCountsFast(container, one);
    seedTourFast(one);
    seedResvFast(container, one);
  }

  function primeHomeExtras(done) {
    if (!CBA.data || !CBA.data.getHomeExtras) { done(); return; }
    /* ⚠️ (2026-09-15) `gardenFresh()` נוסף לתנאי כשספירת הגינון עברה
       לקריאה המאוחדת. בלעדיו מטמון משותף טרי היה מדלג על הקריאה
       והגינון היה נשלח שוב בנפרד — זו בדיוק המלכודת ההפוכה שבגללה
       הופרדה `gardenTs` מ-`ts` ב-9.9 (ר' ההערה ליד lazyCache).
       מי שאין לו הרשאת גינון: `gardenTs` לעולם לא יתעדכן והתנאי
       ייכשל תמיד — אבל הקריאה המאוחדת זולה במיוחד עבורו (המקטעים
       שהוא לא רשאי לראות פשוט לא חוזרים), והמטמון של דקה בלום
       רצף ציורים. */
    if (cacheFresh() && resvFresh() && (!can("גינון") || gardenFresh())) { done(); return; }
    CBA.data.getHomeExtras(function (res) {
      if (!res || !res.ok || !res.homeExtras) { done(); return; }   // שרת ישן/כשל -> המסלול הישן
      /* 🔴 **שתי הצורות, ובכוונה** (2026-09-16). מהיום השרת מחזיר
         `pending` — מספר שנספר בעמודה אחת — במקום את כל השורות.
         הצורה הישנה נשארת נתמכת כאן כדי שלא תיווצר תלות בסדר
         הדיפלוי: לקוח חדש מול שרת שטרם פורסם ממשיך לעבוד בדיוק
         כמו אתמול, וכך גם ההפך.
         ⚠️ `typeof === "number"` ולא `||`: `pending: 0` הוא תשובה
            תקפה, ו-`0 || count(...)` היה מפיל אותה בחזרה לספירה. */
      if (res.signups && res.signups.ok) {
        lazyCache.signups = (typeof res.signups.pending === "number")
          ? res.signups.pending : countPending(res.signups.rows);
      }
      if (res.profile && res.profile.ok) {
        lazyCache.profile = (typeof res.profile.pending === "number")
          ? res.profile.pending : countPending(res.profile.rows);
      }
      if (res.gym && res.gym.ok) {
        lazyCache.gym = (typeof res.gym.pending === "number")
          ? res.gym.pending : countGymPending(res.gym);
      }
      lazyCache.ts = Date.now();

      if (res.reservations && res.reservations.ok) {
        resvCache.list = (res.reservations.reservations || []).slice().sort(function (a, b) {
          return new Date(a.start) - new Date(b.start);
        });
        resvCache.ts = Date.now();
      }
      /* ספירת הגינון (2026-09-15, צעד 07) — הקריאה השלישית והאחרונה
         שנשארה בתור העלייה (3.6–5.2ש' עבור מספר אחד).
         ⚠️ **חובה לעדכן גם את `gardenTs`** — הוא החותמת הנפרדת
            ש-`gardenFresh()` בודק. בלעדיו ההזרעה לא משנה כלום
            והקריאה הנפרדת תצא בכל מקרה.
         ⚠️ **שרת ישן לא מחזיר `garden` כלל** — ואז התנאי כאן לא
            מתקיים, `gardenTs` נשאר 0, והמסלול הישן עובד בדיוק
            כמו היום. אין תלות בסדר הדיפלוי.
         ⚠️ `pending: 0` הוא תשובה תקפה — לכן הבדיקה היא על `ok`
            ולא על המספר, אחרת "אפס ממתינות" היה מזמין קריאה נוספת. */
      if (res.garden && res.garden.ok) {
        lazyCache.garden = Number(res.garden.pending) || 0;
        lazyCache.gardenTs = Date.now();
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
    var slotN = container.querySelector("#hm-garden");

    function done(slot, html) {
      if (!slot || !slot.isConnected) return;
      slot.outerHTML = html || "";
      syncClearState(container);
      bindAdminJumps(container);
    }

    /* ⚠️ ארבעת בוני השורות יושבים מעל (16.9) — גם הציור
       המהיר מ-Firestore מצייר אותן שורות בדיוק. שתי גרסאות
       של אותה תווית הן בדיוק "המסך התחליף טקסט באמצע". */
    /* ⚠️ התווית חייבת לתאר בדיוק את מה שנספר. `scope:"pending"` בשרת מחזיר
       **רק** משימות עם דגל "ממתין לאישור" — לא "דורש בדיקה בשטח" ולא משוב
       שלילי, שגם הם ברשימת "להחלטתך" של מסך המשימות. "שמחכות לך" היה מבטיח
       את הרשימה הרחבה ומראה את המספר הצר, וזה בדיוק "שני מספרים שלא מסכימים"
       שאנחנו מנקים מהמודול. היעד נשאר gardenInbox — הוא נוחת על הרשימה
       הרחבה, שמכילה תמיד את מה שנספר כאן. */
    /* הגינון נטען לפי החותמת שלו ולא לפי המשותפת — ר' ההערה ליד lazyCache. */
    if (slotN) {
      if (gardenFresh()) {
        done(slotN, gardenRow(lazyCache.garden || 0));
      } else if (CBA.data.getGardenTasks) {
        lazyCache.gardenTs = Date.now();
        CBA.data.getGardenTasks({ scope: "pending" }, function (res) {
          var n = (res && res.ok) ? (res.rows || []).length : 0;
          lazyCache.garden = n;
          done(slotN, gardenRow(n));
        });
      } else { done(slotN, ""); }
    }

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
    /* ⚠️ הכרטיס הזה נגזר כולו מתנועות. אם המשיכה הראשית נכשלה, CBA.mock
       עדיין מחזיק את נתוני הדמו מ-mock.js — והכרטיס היה מציג "0 ממתינות,
       ₪0 שולמו השנה" כאילו אלה המספרים האמיתיים של המשפחה. אפס שקרי גרוע
       יותר מהודעת שגיאה, ולכן כאן מוצג הפאנל המשותף (2026-09-14). */
    if (window.CBA && CBA.sheets && !CBA.sheets.isConnected() && CBA.dataUnavailableHTML) {
      return '<section class="card hm-card">' +
        '<div class="hm-card__head"><h2 class="hm-card__t">אצלנו בבית</h2></div>' +
        CBA.dataUnavailableHTML("הנתונים הכספיים לא נטענו. שאר האפליקציה עובדת כרגיל.") +
        '</section>';
    }
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
    /* 🔴 שלושת הכרטיסים הפכו לשורה אחת (2026-09-16, החלטת יועד).
       שלושה מספרים גדולים תפסו את כל הכרטיס וענו על שאלה אחת;
       עכשיו ההחזרים מדברים באותה שפה בדיוק של המועדון, הגינון
       והמכון — אייקון, מצב, תגית, ולחיצה למסך המלא. */
    return '<section class="card hm-card">' +
      '<div class="hm-card__head"><h2 class="hm-card__t">אצלנו בבית</h2>' +
        '<span class="hm-card__sub">מה פתוח למשפחה שלי</span>' +
        '<button type="button" class="hm-link" data-goto="resRequests">לכל הבקשות</button></div>' +
      '<div class="hm-mine">' +
        refundRowHTML(counts, money) +
        '<div id="hm-next" class="hm-slot">' + CBA.skel.rows(1, { avatar: false }) + '</div>' +
        '<div id="hm-mygarden" class="hm-slot"></div>' +
        '<div id="hm-mygym" class="hm-slot"></div>' +
      '</div>' +
      '</section>';
  }

  /* ------------------------------------------------- שורת מצב משותפת ----
     ארבע השורות של "אצלנו בבית" נבנות כולן מכאן. שורה אחת לכל תחום,
     ותמיד באותו סדר פנימי: אייקון · כותרת · שורת פירוט · תגית · חץ.
     ⚠️ אותה פונקציה בונה גם את שורת "אין" (המועדון הריק, הגינון הריק),
        כדי ששתי הצורות לא ייפרדו ויתחילו להיראות אחרת. */
  function stateRow(o) {
    return '<button type="button" class="hm-row" data-goto="' + esc(o.goto) + '">' +
      '<span class="hm-row__ico">' + svg(o.ico, 17) + '</span>' +
      '<span class="hm-row__txt"><b>' + esc(o.title) + '</b>' +
        (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span>' +
      /* ⚠️ `badge` הוא רכיב התגית הכלל-מערכתי (css/style.css), ולא
         מחלקה חדשה של עמוד הבית: תגית "מאושר" כאן חייבת להיראות
         בדיוק כמו "מאושר" בטבלת ההוצאות. */
      (o.pill ? '<span class="badge badge--' + (o.tone || "info") + '">' + esc(o.pill) + '</span>' : '') +
      '<span class="hm-row__c">' + svg(ICO.chev, 16) + '</span>' +
      '</button>';
  }

  /* ההחזרים — השורה היחידה שאינה עולה דבר: היא נגזרת מהתנועות
     שכבר בזיכרון (`CBA.residentUtils.myRequests`), בלי שום קריאה. */
  function refundRowHTML(c, money) {
    var title, pill = "", tone = "", sub = "";
    if (c.pending) {
      title = c.pending === 1 ? "בקשת החזר אחת ממתינה" : c.pending + " בקשות החזר ממתינות";
      pill = "בבדיקה"; tone = "warn";
      if (c.ready) sub = c.ready === 1 ? "אחת אושרה לתשלום · " : c.ready + " אושרו לתשלום · ";
    } else if (c.ready) {
      title = c.ready === 1 ? "בקשה אחת אושרה לתשלום" : c.ready + " בקשות אושרו לתשלום";
      pill = "אושר"; tone = "ok";
    } else {
      title = "אין בקשות החזר פתוחות";
    }
    sub += money + " שולמו השנה";
    return stateRow({ goto: "resRequests", ico: ICO.receipt, title: title, sub: sub, pill: pill, tone: tone });
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
    var next = (list || [])[0];
    if (!next) {
      slot.innerHTML = stateRow({ goto: "resReserve", ico: ICO.key,
        title: "אין שריון קרוב", sub: "אפשר לשריין את המועדון" });
      return;
    }
    var a = new Date(next.start), b = new Date(next.end);
    var day = a.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "numeric" });
    var time = pad(a.getHours()) + ":" + pad(a.getMinutes()) + "–" + pad(b.getHours()) + ":" + pad(b.getMinutes());
    var pend = next.status === "pending";
    slot.innerHTML = stateRow({ goto: "resReserve", ico: ICO.key,
      title: "המועדון " + day, sub: time,
      pill: pend ? "ממתין" : "מאושר", tone: pend ? "warn" : "ok" });
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }

  /* ============================================================================
   *  🔴 שתי השורות החדשות — גינון ומכון   (2026-09-16)
   * ----------------------------------------------------------------------------
   *  שתיהן נקראות **מ-Firestore בלבד** ולכן מותר להן להיות כאן:
   *    · `getMyGardenReports` עובר ב-`fsFirstRead("gardenReports")` —
   *      נמדד בייצור היום 30ms (היה 30,002 — timeout).
   *    · `getGymStatusFast` קורא `gymStatus/{uid}` — 6–59ms.
   *  לו אחת מהן היתה קריאת Apps Script היא לא היתה נכנסת לעמוד הזה:
   *  שם המחיר הוא ~2,000ms מינימום, וכל דיאטת הפתיחה נועדה למחוק אותו.
   *
   *  ⚠️ **שתיהן מתחילות ריקות ולא בשלד.** שלד מבטיח שורה שתגיע, ואצל
   *     רוב התושבים אין כאן שורה בכלל (לא דיווחו, לא מנויים) — שלד
   *     שנעלם הוא הבטחה שנשברת. הן פשוט נכנסות כשיש מה להראות.
   *  ⚠️ **כשל אינו "אין".** שתיהן משאירות את המקום ריק בשקט; מסך
   *     הגינון עצמו הוא שמבחין בין "אין דיווחים" ל"לא הצלחנו לטעון".
   * ========================================================================== */
  function loadMyGarden(container) {
    var slot = container.querySelector("#hm-mygarden");
    if (!slot || !(CBA.data && CBA.data.getMyGardenReports)) return;
    CBA.data.getMyGardenReports(function (res) {
      if (!slot.isConnected) return;
      if (!res || !res.ok) return;                 /* כשל — לא ממציאים "אין" */
      var rows = res.rows || [];
      /* פתוח = עדיין לא נסגר ולא אוחד לתוך דיווח אחר. זו בדיוק ההגדרה
         שמסך "הדיווחים שלי" מצייר לפיה את מסלול הנקודות. */
      var open = rows.filter(function (r) { return r && !r.closure && !r.mergedInto; });
      if (!rows.length) {
        slot.innerHTML = stateRow({ goto: "resGardenNew", ico: ICO.leaf,
          title: "לא דיווחת על כלום", sub: "ראית מפגע בשיכון? אפשר לדווח" });
        return;
      }
      if (!open.length) {
        slot.innerHTML = stateRow({ goto: "resGarden", ico: ICO.leaf,
          title: "כל הדיווחים שלך טופלו", sub: rows.length + " דיווחים בסך הכול",
          pill: "הושלם", tone: "ok" });
        return;
      }
      slot.innerHTML = stateRow({ goto: "resGarden", ico: ICO.leaf,
        title: open.length === 1 ? "דיווח אחד שלי בטיפול" : open.length + " דיווחים שלי בטיפול",
        sub: open.map(function (r) { return r.title || r.category || ""; })
               .filter(Boolean).slice(0, 2).join(" · "),
        pill: "בטיפול", tone: "warn" });
    });
  }

  /* המכון — שורה רק למי שבאמת מנוי. תושב שאינו מנוי לא מקבל
     כאן "אין מנוי": זו לא משימה פתוחה שלו, וזה הכרטיס של מה
     שפתוח. מי שרוצה להצטרף מגיע דרך הפעולות המהירות. */
  function loadMyGym(container) {
    var slot = container.querySelector("#hm-mygym");
    if (!slot || !(CBA.data && CBA.data.getGymStatusFast)) return;
    CBA.data.getGymStatusFast(function (doc) {
      if (!slot.isConnected || !doc) return;
      var st = String(doc["סטטוס"] || "").trim();
      if (!st) return;
      var until = String(doc["בתוקף עד"] || "").trim();
      var tone = st === "פעיל" ? "ok" : (st === "פג תוקף" ? "danger" : "warn");
      var sub = "";
      if (st === "פעיל" && until) {
        var d = new Date(until);
        sub = isNaN(d) ? "" : "בתוקף עד " + d.toLocaleDateString("he-IL",
          { day: "numeric", month: "numeric", year: "numeric" });
      }
      slot.innerHTML = stateRow({ goto: "resGym", ico: ICO.gym,
        title: "מנוי מכון כושר", sub: sub, pill: st, tone: tone });
    });
  }

  /* ------------------------------------------------- "יש משהו חדש" ------
     כשמוסיפים צעד לסיור עם מספר גרסה חדש, תושב ותיק לא מקבל השתלטות על
     המסך — הוא מקבל את הכרטיס הזה, וגם אותו רק אם באמת יש משהו שלא ראה.
     ההחלטה הזו היא כל ההבדל בין "האפליקציה מלמדת אותי" ל"האפליקציה קופצת
     עליי". ר' js/ui/tour.js. */
  function loadNewCard(container) {
    var slot = container.querySelector("#hm-new");
    if (!slot || !window.CBA.tour) return;
    /* הדלקת העמודה השנייה — ר' ההערה ליד `hm-side` ב-render. */
    function cols(on) {
      var c = container.querySelector("#hm-cols");
      if (c) c.classList.toggle("hm-cols--two", !!on);
    }
    CBA.tour.newCount(function (n) {
      if (!slot.isConnected) return;
      cols(n);
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
  /* 🔴 גלולות בראש העמוד במקום ריבועים מתחתיו (2026-09-16).
     חמישה ריבועים בגובה ~120px ישבו **מתחת** לשני הכרטיסים, כלומר
     הדבר שהתושב הכי מרבה לעשות היה הדבר האחרון שהוא הגיע אליו.
     עכשיו: שורת גלולות בגובה ~36px מיד מתחת לברכה. השטח ירד בערך
     ב-60%, ודווקא בגלל זה היה מקום להוסיף שתי פעולות ולא להוריד. */
  function actionsHTML() {
    var items = [
      ["resSubmit",    ICO.receipt, "הגשת קבלה", 1],
      ["resGardenNew", ICO.leaf,    "דיווח למראה שיכון"],
      ["resReserve",   ICO.key,     "שריון מועדון"],
      ["resGym",       ICO.gym,     "מכון כושר"],
      ["resMap",       ICO.map,     "מפת השיכון"],
      ["resDirectory", ICO.users,   "שכנים"],
      ["resMe",        ICO.person,  "הפרטים שלי"]
    ];
    return '<section class="hm-actions">' +
      '<div class="hm-actions__edge" id="hm-acts-edge">' +
        '<div class="hm-actions__row" id="hm-acts">' + items.map(function (it) {
          return '<button type="button" class="hm-act' + (it[3] ? " hm-act--cta" : "") +
            '" data-goto="' + it[0] + '">' + svg(it[1], 15) +
            '<span>' + esc(it[2]) + '</span></button>';
        }).join("") + '</div>' +
      '</div>' +
      '<div class="hm-actions__dots" id="hm-acts-dots" hidden aria-hidden="true">' +
        '<i></i><i></i></div>' +
      '</section>';
  }

  /* ------------------------------------------------- רמז הגלילה במובייל ----
     במסך צר השורה נגללת, ובלי רמז היא נראית כמו שלושה כפתורים ותו לא.
     שלושה רמזים יחד: הכפתור הבא **נחתך** בקצה (זה החזק מביניהם), דהייה
     מעל הקצה, ושני מקפים שמראים איפה אנחנו.
     ⚠️ **הכול מותנה ב-`scrollWidth > clientWidth`** — בדסקטופ, או אצל
        תושב שרואה פחות פעולות, השורה נכנסת שלמה ואז אין מה לרמוז:
        דהייה מעל שורה שאינה נגללת היא בדיוק סוג הרעש שאנחנו מנקים. */
  function wireActionsHint(container) {
    var edge = container.querySelector("#hm-acts-edge");
    var row  = container.querySelector("#hm-acts");
    var dots = container.querySelector("#hm-acts-dots");
    if (!edge || !row) return;
    function sync() {
      var more = row.scrollWidth - row.clientWidth > 4;
      edge.classList.toggle("is-more", more);
      if (dots) dots.hidden = !more;
      if (!more) return;
      /* RTL: scrollLeft שלילי או אפס, תלוי בדפדפן. הערך המוחלט הוא
         המרחק שנגלל, וזה מה שמעניין כאן. */
      var at = Math.abs(row.scrollLeft);
      var end = at > (row.scrollWidth - row.clientWidth) / 2;
      edge.classList.toggle("is-end", end);
      var d = dots ? dots.children : null;
      if (d && d.length === 2) {
        d[0].className = end ? "" : "on";
        d[1].className = end ? "on" : "";
      }
    }
    row.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sync();
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
      /* 🔴 סדר העמוד (2026-09-16): ברכה · פעולות · אצלנו בבית · תפקיד ועד.
         העולם המשפחתי קודם והניהולי אחריו — גם למנהל־על. מי שנכנס
         נכנס קודם כל כתושב, והכובע השני הוא תוספת ולא הכותרת. */
      container.innerHTML =
        '<header class="hm-hero">' +
          '<div class="hm-hero__hi">' + esc(greeting()) + ', ' + esc(displayName()) + '</div>' +
          '<div class="hm-hero__sub">' + esc(todayLabel()) +
            (u().house ? ' · בית ' + esc(u().house) : "") + '</div>' +
        '</header>' +
        actionsHTML() +
        '<div class="hm-cols" id="hm-cols">' +
          '<div class="hm-main">' +
            mineSectionHTML() +
            adminSectionHTML() +
          '</div>' +
          /* ⚠️ העמודה השנייה נולדת ריקה, והפריסה נשארת עמודה אחת רחבה
             עד ש-`loadNewCard` מוצא משהו להראות ומדליק `hm-cols--two`.
             עמודה ריקה קבועה היתה מכווצת את הכרטיס המרכזי אצל **כל**
             התושבים בשביל כרטיס שמופיע פעם בחודש. */
          '<aside class="hm-side"><div id="hm-new"></div></aside>' +
        '</div>';

      bindClicks(container);
      wireActionsHint(container);
      // כפתור "נסה שוב" של הפאנל, אם הכרטיס הכספי הוחלף בו
      if (window.CBA && CBA.wireDataRetry) CBA.wireDataRetry(container);
      syncClearState(container);
      /* קריאה אחת מזינה את כל המטמונים, ואז שלוש הפונקציות רצות בדיוק כמו
         קודם — רק בלי לפנות לרשת. ר' primeHomeExtras. */
      /* 🔴 קודם המסלול המהיר (~75 אלפיות), ומיד אחריו הקריאה
         הקובעת. שניהם יוצאים במקביל ובכוונה — המהיר מצייר
         תגיות, והקובע מביא גם את כרטיס "יש משהו חדש"
         ואת השריון הקרוב, שאינם ב-Firestore. */
      /* שתי השורות מ-Firestore יוצאות **מיד ובמקביל**, לא בתוך
         ההמתנה של `seedHomeFast`: הן לא מזינות שום מטמון שהקריאה
         הקובעת נשענת עליו, ואין שום סיבה שיחכו לה. */
      loadMyGarden(container);
      loadMyGym(container);

      seedHomeFast(container, function () {
        primeHomeExtras(function () {
          loadLazyCounts(container);
          loadNextReservation(container);
          loadNewCard(container);
        });
      });
    }
  };
})();
