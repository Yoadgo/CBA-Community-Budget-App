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

   🔴 גל 2 (30.9.26) — הבית נבנה מחדש (ר' הבלוק "הבית החדש" למטה), ו"תפקיד
   ועד" עבר למסך "לוח ניהול" (CBA.screens.adminBoard, בסוף הקובץ). שני המסכים
   חולקים את אותו מנגנון טעינה ואת אותם מטמונים — לכן הם באותו קובץ.
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
  /* מקטע הגינון ושורת "מחכה להחלטה" (2026-09-23) — מנהל־על ומנהל גינון בלבד.
     אותו תנאי של SCREEN_PERM "MANAGER" ב-app.js: הרשאת גינון **ולא** משתמש
     חיצוני (הגנן). ⚠️ והמקטע נשען על homeGarden.js — בלעדיו אין מי שימלא את
     השלד, ו"הכול מטופל" היה נחסם לנצח. */
  function canGarden() {
    return can("גינון") && !u().isExternal && !!window.CBA.homeGarden;
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
    leaf:    '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    gym:     '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
    badge:   '<path d="M12 3 2.5 8 12 13l9.5-5z"/><path d="M6 10.5V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.5"/>',
    check:   '<path d="m5 12.5 4.5 4.5L19 7.5"/>'   /* השורה השקטה (23.9) */
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
  function taskRow(label, n, target, tone, sub) {
    return '<button type="button" class="hm-task' + (tone ? " hm-task--" + tone : "") + '" data-admin-goto="' + esc(target) + '">' +
      '<span class="hm-task__n">' + n + '</span>' +
      '<span class="hm-task__l">' + esc(label) + (sub ? '<small>' + esc(sub) + '</small>' : "") + '</span>' +
      '<span class="hm-task__c">' + svg(ICO.chev, 16) + '</span>' +
      '</button>';
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
          /* 🔴 **כשל אינו אפס** (2026-09-17, ממצא 02). קודם כל כשל הפך כאן
             ל-0 והוצג כמו "אין מה לאשר" — ועוד נשמר ל-lazyCache, כך שהאפס
             השקרי נדבק גם לרענונים הבאים בחלון הטריות.
             מהיום: לא טוענים, לא זוכרים, ולא מציירים שורה. בדיוק כמו
             ש-loadMyGarden כבר עושה שתי שורות למטה. */
          if (!res || !res.ok) { lazyCache.gardenTs = 0; return done(slotN, ""); }
          var n = (res.rows || []).length;
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
    if (!fam || !CBA.data.getMyClubReservations) { paintNext(slot, []); return; }

    if (resvFresh()) { paintNext(slot, resvCache.list || []); return; }

    CBA.data.getMyClubReservations({ family: fam, email: me.email || "" }, function (res) {
      if (!res || !res.ok) { if (slot.isConnected) paintNext(slot, []); return; }
      var list = (res.reservations || []).slice().sort(function (a, b) {
        return new Date(a.start) - new Date(b.start);
      });
      resvCache.list = list;
      resvCache.ts = Date.now();
      if (!slot.isConnected) return;
      paintNext(slot, list);
    });
  }

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  /* ==========================================================================
   *  🔴 גל 2 (30.9.26) — הבית החדש. ספר האבנים, פרק 1 (החלטות יועד 29–30.9)
   * --------------------------------------------------------------------------
   *  חופה: ברכה · "מה מחכה לי" (מספר גיבור + משפט, A1) · מיני-כרטיסים:
   *        האירוע הבא (לחיצה = גיליון הכרטיסים, H17) · השריון הקרוב, או מנוי
   *        המכון כשאין שריון (H11) · ולבעל תפקיד "ממתין לטיפולך: N" (A9/H30).
   *  בנטו: השבוע (תמיד) · הדיווחים שלי (תמיד) · ההחזרים שלי (רק כשיש ממתין
   *        או מאושר, H10) · מכון כושר (רק למנויים, H13).
   *  רשימות: "מה קרה" (סיור חדש, עדכונים, אירועים עם פנים — H26) ו"דברים
   *        לעשות" (אישור הגעה, פרטי משפחה, מנוי שפג — H27, בלי "קבלה חסרה").
   *  ירדו מהבית (לא מהאפליקציה): 7 הגלולות → "+" (H8) · השורה השקטה (H14) ·
   *  גריד השבועיים → לוח האירועים (H20) · 10 ימים למנהל (H24) · "תפקיד ועד"
   *  והגינון → לוח ניהול (H31, CBA.screens.adminBoard למטה) · "שולמו השנה" →
   *  מסך הבקשות (שם הוא כבר מוצג).
   * ========================================================================== */
  var W = null;   /* מצב הציור הנוכחי של הבית — מתאפס בכל render */

  /* סכום עגול בלי ".00" — מספר גדול באריח, לא שורה בטבלה */
  function money(n) { return (CBA.formatILS ? CBA.formatILS(n) : "₪" + Math.round(n)).replace(/\.00$/, ""); }
  function dm(d) { return d.getDate() + "." + (d.getMonth() + 1); }
  var WD = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
  function disc(kind, ico) { return '<i class="hm2-disc hm2-disc--' + kind + '">' + svg(ico, 16) + '</i>'; }

  /* ---- ההחזרים (בלי קריאה — מהתנועות שבזיכרון) ---- */
  function refundCounts() {
    var c = { pending: 0, ready: 0, readyAmt: 0, known: true };
    if (window.CBA && CBA.sheets && CBA.sheets.isConnected && !CBA.sheets.isConnected()) { c.known = false; return c; }
    if (CBA.residentUtils && CBA.residentUtils.myRequests) {
      CBA.residentUtils.splitRequests(CBA.residentUtils.myRequests()).refunds.forEach(function (t) {
        if (t.status === "submitted") c.pending++;
        else if (t.status === "ready") { c.ready++; c.readyAmt += (Number(t.amount) || 0); }
      });
    }
    return c;
  }
  function refundTileHTML(c) {
    /* ⚠️ H16 — גיליון לא מחובר: לא "₪0" ולא היעלמות שקטה, אלא אריח שגיאה עם "נסה שוב" */
    if (!c.known) {
      return '<div class="hm2-tile hm2-tile--err" id="hm-refunds">' +
        '<span class="hm2-tile__h">' + disc("bud", ICO.receipt) + 'ההחזרים שלי</span>' +
        '<span class="hm2-tile__s">הנתונים הכספיים לא נטענו.</span>' +
        '<button type="button" class="hm-link" data-data-retry>נסה שוב</button></div>';
    }
    if (!c.pending && !c.ready) return "";          /* H10 — רק כשיש */
    var n, s;
    if (c.ready) {
      n = money(c.readyAmt);
      s = (c.ready === 1 ? "אושר לתשלום" : c.ready + " אושרו לתשלום") + (c.pending ? " · " + c.pending + " בבדיקה" : "");
    } else {
      n = c.pending + '<em>בבדיקה</em>';
      s = "ממתין לאישור הוועד";
    }
    return '<button type="button" class="hm2-tile" id="hm-refunds" data-goto="resRequests">' +
      '<span class="hm2-tile__h">' + disc("bud", ICO.receipt) + 'ההחזרים שלי</span>' +
      '<span class="hm2-tile__n">' + n + '</span><span class="hm2-tile__s">' + esc(s) + '</span></button>';
  }

  /* ---- הדיווחים שלי (Firestore, מיד) — אריח תמיד, 3 מצבים (H12) ---- */
  function loadMyGarden(container) {
    var slot = container.querySelector("#hm-mygarden");
    if (!slot || !(CBA.data && CBA.data.getMyGardenReports)) { heroPart("garden", 0, ""); return; }
    CBA.data.getMyGardenReports(function (res) {
      if (!slot.isConnected) return;
      var head = '<span class="hm2-tile__h">' + disc("gar", ICO.leaf) + 'הדיווחים שלי</span>';
      if (!res || !res.ok) {                        /* כשל — לא ממציאים "אין" */
        slot.className = "hm2-tile";
        slot.setAttribute("data-goto", "resGarden");
        slot.innerHTML = head + '<span class="hm2-tile__s">לא הצלחנו לטעון כרגע</span>';
        heroPart("garden", 0, "");
        return;
      }
      var rows = res.rows || [];
      var open = rows.filter(function (r) { return r && !r.closure && !r.mergedInto; });
      if (!rows.length) {
        slot.className = "hm2-tile";
        slot.setAttribute("data-goto", "resGardenNew");
        slot.innerHTML = head + '<span class="hm2-tile__n hm2-tile__n--sm">עוד לא דיווחת</span>' +
          '<span class="hm2-tile__s">ראית מפגע בשיכון? <u>דיווח ראשון</u></span>';
        heroPart("garden", 0, "");
        return;
      }
      if (!open.length) {
        slot.className = "hm2-tile";
        slot.setAttribute("data-goto", "resGarden");
        slot.innerHTML = head + '<span class="hm2-tile__n">' + rows.length + '<em>טופלו</em></span>' +
          '<span class="hm2-tile__s">כל הדיווחים שלך טופלו</span>';
        heroPart("garden", 0, "");
        return;
      }
      var last = open[open.length - 1] || {};
      var t = last.title || last.category || "";
      slot.className = "hm2-tile hm2-tile--gar";
      slot.setAttribute("data-goto", "resGarden");
      slot.innerHTML = head + '<span class="hm2-tile__n">' + open.length + '<em>בטיפול</em></span>' +
        '<span class="hm2-tile__s" dir="auto">' + esc(open.map(function (r) { return r.title || r.category || ""; })
          .filter(Boolean).slice(0, 2).join(" · ")) + '</span>';
      heroPart("garden", open.length, open.length === 1
        ? "הדיווח שלך" + (t ? " על " + t : "") + " בטיפול"
        : open.length + " דיווחים שלך בטיפול");
    });
  }

  /* ---- מכון כושר (Firestore) — אריח רק למנויים (H13), ומיני-כרטיס כשאין שריון (H11) ---- */
  function gymInfo(doc) {
    if (!doc) return null;
    var st = String(doc["סטטוס"] || "").trim();
    if (!st) return null;
    var until = String(doc["בתוקף עד"] || "").trim(), d = until ? new Date(until) : null;
    if (d && isNaN(d)) d = null;
    var days = d ? Math.ceil((d.setHours(23, 59, 0, 0) - Date.now()) / 86400000) : null;
    return { st: st, until: d, days: days };
  }
  function loadMyGym(container) {
    var slot = container.querySelector("#hm-mygym");
    if (!slot || !(CBA.data && CBA.data.getGymStatusFast)) { W.gym = null; W.gymKnown = true; syncTodo(container); return; }
    CBA.data.getGymStatusFast(function (doc) {
      if (!slot.isConnected) return;
      var g = gymInfo(doc);
      W.gym = g; W.gymKnown = true;
      if (!g) { slot.hidden = true; syncTodo(container); syncResvMini(container); return; }
      var n, s;
      if (g.st === "פעיל") {
        n = (g.days != null && g.days >= 0) ? g.days + '<em>' + (g.days === 1 ? "יום" : "ימים") + '</em>' : '<span class="hm2-tile__n--sm">פעיל</span>';
        s = "מנוי פעיל" + (g.until ? " · עד " + g.until.toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" }) : "");
      } else if (g.st === "פג תוקף") {
        n = '<span class="hm2-tile__n--sm">פג תוקף</span>'; s = "אפשר לחדש במסך המכון";
      } else {
        n = '<span class="hm2-tile__n--sm">' + esc(g.st) + '</span>'; s = "מנוי מכון כושר";
      }
      slot.hidden = false;
      slot.innerHTML = '<span class="hm2-tile__h">' + disc("gym", ICO.gym) + 'מכון כושר</span>' +
        '<span class="hm2-tile__n">' + n + '</span><span class="hm2-tile__s">' + esc(s) + '</span>';
      syncTodo(container); syncResvMini(container);
    });
  }

  /* ---- השריון הקרוב — מיני-כרטיס בחופה (H11). id="hm-next" נשמר (seedResvFast) ---- */
  function paintNext(slot, list) {
    if (window.CBA.homeSchedule) CBA.homeSchedule.setPersonal(list || []);
    if (!W) return;
    W.resv = (list || [])[0] || null; W.resvKnown = true;
    var c = slot && slot.closest ? slot.closest(".hm-page") : null;
    if (c) syncResvMini(c);
  }
  function syncResvMini(container) {
    var slot = container.querySelector("#hm-next");
    if (!slot || !W) return;
    var next = W.resv;
    if (next) {
      var a = new Date(next.start), b = new Date(next.end);
      var time = "⁦" + pad(a.getHours()) + ":" + pad(a.getMinutes()) + "–" + pad(b.getHours()) + ":" + pad(b.getMinutes()) + "⁩";
      slot.hidden = false;
      slot.setAttribute("data-goto", "resReserve");
      slot.innerHTML = '<small>השריון הקרוב' + (next.status === "pending" ? ' · <span class="hm2-mini__warn">ממתין</span>' : "") + '</small>' +
        '<b>יום ' + WD[a.getDay()] + " " + dm(a) + '</b><span>מועדון משפחות · ' + time + '</span>';
      return;
    }
    var g = W.gym;
    if (W.resvKnown && g) {
      slot.hidden = false;
      slot.setAttribute("data-goto", "resGym");
      slot.innerHTML = '<small>מכון כושר</small><b>' + esc(g.st === "פעיל" && g.days != null && g.days >= 0 ? g.days + " ימים" : g.st) + '</b>' +
        '<span>' + (g.until ? "בתוקף עד " + dm(g.until) : "מנוי") + '</span>';
      return;
    }
    slot.hidden = true;
  }

  /* ---- "יש משהו חדש" — שורה ראשונה ב"מה קרה" (H28) ---- */
  function loadNewCard(container) {
    var slot = container.querySelector("#hm-new");
    if (!slot || !window.CBA.tour) return;
    CBA.tour.newCount(function (n) {
      if (!slot.isConnected) return;
      slot.innerHTML = !n ? "" :
        '<button type="button" class="hm2-row" data-tour-new>' + disc("home", ICO.spark) +
          '<span class="hm2-row__t"><b>' + (n === 1 ? "נוסף משהו חדש לאפליקציה" : "נוספו " + n + " דברים חדשים לאפליקציה") +
          '</b><small>הצצה קצרה, פחות מדקה</small></span><span class="badge badge--info">חדש</span></button>';
      syncHappened(container);
    });
  }
  function syncHappened(container) {
    var card = container.querySelector("#hm-happened");
    if (!card) return;
    var any = !!card.querySelector(".hm2-row");
    var e = card.querySelector("#hm-happened-empty");
    if (e) e.hidden = any || !W || !W.feedReady;
  }

  /* ---- פרטי משפחה לא מלאים (H27) — "הפרטים שלי", Apps Script, מטמון 30 דק׳ ---- */
  var profCache = { ts: 0, val: null };
  function profileGaps(res) {
    if (!res || !res.ok || !res.slots) return null;
    var mine = res.slots[res.mySlot] || {}, v = mine.values || {}, gaps = [];
    if (!String(v.phone || "").trim()) gaps.push("טלפון");
    if (!String(v.birthDate || "").trim()) gaps.push("תאריך לידה");
    var kids = String(v.kids || "").trim(), missing = 0;
    if (kids) {
      try {
        var arr = JSON.parse(kids);
        if (Array.isArray(arr)) arr.forEach(function (k) { if (!k || !String(k.dob || "").trim()) missing++; });
        else missing = -1;
      } catch (e) { missing = -1; }
    }
    if (missing > 0) gaps.push(missing === 1 ? "תאריך לידה של ילד/ה" : "תאריכי לידה של " + missing + " ילדים");
    if (missing === -1) gaps.push("רשימת הילדים (פורמט ישן)");
    return gaps;
  }
  function loadProfile(container) {
    var me = u();
    if (me.isRoleSim || me.isExternal || !(CBA.data && CBA.data.getMyProfile)) { W.prof = []; W.profKnown = true; syncTodo(container); return; }
    if (profCache.val && Date.now() - profCache.ts < 30 * 60 * 1000) { W.prof = profCache.val; W.profKnown = true; syncTodo(container); return; }
    CBA.data.getMyProfile(function (res) {
      var g = profileGaps(res);
      if (g) { profCache = { ts: Date.now(), val: g }; }
      if (!W) return;
      W.prof = g || []; W.profKnown = true;
      syncTodo(container);
    });
  }

  /* ---- "דברים לעשות" ---- */
  function syncTodo(container) {
    var host = container.querySelector("#hm-todo-list");
    if (!host || !W) return;
    var items = [];
    (W.rsvp || []).forEach(function (x) {
      var e = x.ev, meta = CBA.homeSchedule && CBA.homeSchedule.metaOf ? CBA.homeSchedule.metaOf(e) : "";
      var who = x.families ? " · " + (x.families === 1 ? "משפחה אחת כבר אישרה" : x.families + " כבר אישרו") : "";
      items.push('<div class="hm2-todo"><span class="hm2-todo__t"><b dir="auto">אישור הגעה ל' + esc(e.title) + '</b>' +
        '<small>' + esc(meta + who) + '</small></span>' +
        '<button type="button" class="hm2-btn" data-hm-rsvp="' + esc(e.id) + '">אישור הגעה</button></div>');
    });
    if (W.prof && W.prof.length) {
      items.push('<div class="hm2-todo"><span class="hm2-todo__t"><b>להשלים את פרטי המשפחה</b>' +
        '<small>חסר: ' + esc(W.prof.join(" · ")) + '</small></span>' +
        '<button type="button" class="hm2-btn hm2-btn--ghost" data-goto="resMe">להשלים</button></div>');
    }
    if (W.gym && W.gym.st === "פג תוקף") {
      items.push('<div class="hm2-todo"><span class="hm2-todo__t"><b>המנוי למכון הכושר פג</b>' +
        '<small>' + (W.gym.until ? "היה בתוקף עד " + dm(W.gym.until) : "מכון כושר") + '</small></span>' +
        '<button type="button" class="hm2-btn hm2-btn--ghost" data-goto="resGym">לחידוש</button></div>');
    }
    var known = W.rsvpKnown && W.profKnown && W.gymKnown;
    host.innerHTML = items.join("") + (known
      ? '<div class="hm2-done"><i>' + svg(ICO.check, 13) + '</i>' + (items.length ? "זהו. כל השאר מסודר." : "הכול מסודר. אין מה לעשות כרגע.") + '</div>'
      : (items.length ? "" : '<span class="skeleton" style="display:block;height:60px;border-radius:12px"></span>'));
  }

  /* ---- "מה מחכה לי" — המספר הגדול (A1) ----
     סכום של: החזרים שאושרו · דיווחים שלי בטיפול · אירועים פתוחים לאישור
     הגעה שלא עניתי · עדכונים שלא נראו. ⚠️ עדכון מאותו תחום שכבר נספר
     (החזר/גינון) לא נספר פעמיים — "ההחזר אושר" הוא אותו דבר כמו האריח. */
  var HERO_KEYS = ["refund", "garden", "rsvp", "inbox"];
  function heroPart(key, n, text) {
    if (!W) return;
    W.hero[key] = { n: n || 0, t: text || "" };
    paintHero();
  }
  function paintHero() {
    var el = W && W.root && W.root.querySelector("#hm-n");
    var sEl = W && W.root && W.root.querySelector("#hm-s");
    if (!el || !sEl) return;
    var total = 0, parts = [], known = 0;
    HERO_KEYS.forEach(function (k) {
      var p = W.hero[k];
      if (!p) return;
      known++;
      total += p.n;
      if (p.n && p.t) parts.push(p.t);
    });
    var done = known === HERO_KEYS.length || W.heroTimeout;
    el.textContent = (known || done) ? String(total) : "·";
    el.classList.toggle("is-loading", !done);
    sEl.textContent = parts.length ? parts.join(" · ")
      : (done ? "הכול מסודר. אין כרגע שום דבר שמחכה לך." : "בודקים מה חדש…");
  }

  /* ---- מיני "ממתין לטיפולך" (A9) — אותן ספירות של לוח הניהול, בלי לצייר ---- */
  function loadAdminCounts(upd) {
    if (can("גינון")) {
      if (gardenFresh()) upd("garden", lazyCache.garden || 0);
      else if (CBA.data.getGardenTasks) {
        lazyCache.gardenTs = Date.now();
        CBA.data.getGardenTasks({ scope: "pending" }, function (res) {
          if (!res || !res.ok) { lazyCache.gardenTs = 0; return upd("garden", null); }
          lazyCache.garden = (res.rows || []).length;
          upd("garden", lazyCache.garden);
        });
      } else upd("garden", null);
    }
    if (canGarden() && CBA.homeGarden.undecided) CBA.homeGarden.undecided(function (n) { upd("decide", n); });
    var wantR = can("תושבים"), wantG = can("מכון");
    if (cacheFresh()) {
      if (wantR) { upd("signups", lazyCache.signups || 0); upd("profile", lazyCache.profile || 0); }
      if (wantG) upd("gym", lazyCache.gym || 0);
      return;
    }
    lazyCache.ts = Date.now();
    if (wantR && CBA.data.listSignups) CBA.data.listSignups(function (res) {
      var n = (res && res.ok) ? countPending(res.rows) : null; if (n != null) lazyCache.signups = n; upd("signups", n);
    }); else if (wantR) upd("signups", null);
    if (wantR && CBA.data.getProfileChanges) CBA.data.getProfileChanges(function (res) {
      var n = (res && res.ok) ? countPending(res.rows) : null; if (n != null) lazyCache.profile = n; upd("profile", n);
    }); else if (wantR) upd("profile", null);
    if (wantG && CBA.data.getGymList) CBA.data.getGymList(function (res) {
      var n = (res && res.ok) ? countGymPending(res) : null; if (n != null) lazyCache.gym = n; upd("gym", n);
    }); else if (wantG) upd("gym", null);
  }
  function adminBase() {
    var a = (window.CBA.alerts ? CBA.alerts() : null) || {}, n = 0;
    if (can("תקציב")) n += (a.pendingExpenses || 0) + (a.reviewExpenses || 0);
    if (can("מועדון")) n += (a.pendingClub || 0);
    return n;
  }
  function paintAdminMini(container) {
    var el = container.querySelector("#hm-mini-adm");
    if (!el || !W) return;
    var n = adminBase();
    Object.keys(W.adm).forEach(function (k) { n += W.adm[k] || 0; });
    el.innerHTML = '<small>ממתין לטיפולך</small><b>' + (W.admReady ? n : "…") + '</b>' +
      '<span>' + (W.admReady && !n ? "הכול מטופל · לוח ניהול" : "לוח ניהול ←") + '</span>';
    el.classList.toggle("is-zero", W.admReady && !n);
  }

  /* ---- המיני "האירוע הבא" + מה שמגיע מהלו״ז (homeSchedule.onChange) ---- */
  function onSchedule(container, sum) {
    if (!W || !container.isConnected) return;
    var el = container.querySelector("#hm-mini-ev");
    if (el) {
      var e = sum.mini;
      if (e) {
        var meta = [e.allDay ? "" : pad(e.date.getHours()) + ":" + pad(e.date.getMinutes()), e.location].filter(Boolean).join(" · ");
        el.hidden = false;
        /* 30.9.26 (יועד): השם גדול, התאריך קטן — היה הפוך */
        el.innerHTML = '<small>האירוע הבא</small><b dir="auto">' + esc(e.title) + '</b>' +
          '<span>' + esc("יום " + WD[e.date.getDay()] + " " + dm(e.date) + (meta ? " · " + meta : "")) + '</span>';
      } else if (sum.ready) el.hidden = true;
    }
    W.feedReady = !!sum.ready || !!sum.err;
    syncHappened(container);
    if (sum.todo) {
      W.rsvp = sum.todo; W.rsvpKnown = true;
      syncTodo(container);
      heroPart("rsvp", sum.todo.length, sum.todo.length === 1
        ? sum.todo[0].ev.title + " פתוח לאישור הגעה"
        : sum.todo.length + " אירועים פתוחים לאישור הגעה");
    } else if (sum.err) {
      W.rsvp = []; W.rsvpKnown = true; syncTodo(container); heroPart("rsvp", 0, "");
    }
  }

  /* ------------------------------------------------------------- חיווט ----
     האזנה אחת על העמוד (ר' ההערה המקורית מ-23.9: לא על #app-main). */
  function bindClicks(page) {
    if (!page || !page.addEventListener) return;
    page.addEventListener("click", function (e) {
      var admin = e.target.closest("[data-admin-goto]");
      if (admin) { if (window.CBA.gotoAdmin) CBA.gotoAdmin(admin.dataset.adminGoto); return; }
      if (e.target.closest("[data-tour-new]")) { if (window.CBA.tour) CBA.tour.startNew(); return; }
      if (e.target.closest("[data-hm-nextsheet]")) { if (CBA.homeSchedule && CBA.homeSchedule.openNextSheet) CBA.homeSchedule.openNextSheet(); return; }
      var go = e.target.closest("[data-goto]");
      if (go && CBA.navigate) CBA.navigate(go.dataset.goto);
    });
  }

  function bindAdminJumps() { /* נשמר לתאימות — החיווט עבר להאזנה על המכל */ }

  /* שורת "מחכה להחלטה" בכרטיס הוועד — מתמלאת מ-homeGarden.js. n === null
     פירושו כשל: השורה נעלמת בשקט, ולא מכריזה "אין". */
  function paintDecide(container, n, first) {
    var slot = container.querySelector("#hm-gdecide");
    if (!slot || !slot.isConnected) return;
    var html = "";
    if (n) {
      var sub = "";
      if (first && first.title) {
        sub = first.title + (first.days == null ? "" :
          first.days === 0 ? " · היום" : first.days === 1 ? " · מאתמול" : " · לפני " + first.days + " ימים");
      }
      html = taskRow(n === 1 ? "דיווח גינון מחכה להחלטה" : n + " דיווחי גינון מחכים להחלטה",
                     n, "gardenTasks", "warn", sub);
    }
    slot.outerHTML = html;
    syncClearState(container);
  }


  /* ============================================================ הבית ==== */
  CBA.screens.resHome = {
    render: function (container) {
      var admin = anyAdmin() && !u().isExternal;
      var sched = !!window.CBA.homeSchedule;
      var me = u(), rc = refundCounts();
      W = { hero: {}, heroTimeout: false, adm: {}, admReady: false, resv: null, resvKnown: false,
            gym: null, gymKnown: false, prof: null, profKnown: false, rsvp: null, rsvpKnown: !sched,
            feedReady: !sched, root: null };
      container.innerHTML =
        '<div class="hm-page hm2">' +
        '<section class="hm2-cnp" id="hm-cnp" aria-label="מה מחכה לי">' +
          '<div class="hm2-in hm2-hero">' +
            '<div class="hm2-hero__main">' +
              '<div class="hm2-hi">' + esc(greeting()) + ', ' + esc(displayName()) +
                (me.house ? '<span class="hm2-chip">בית ' + esc(me.house) + '</span>' : "") + '</div>' +
              '<div class="hm2-date">' + esc(todayLabel()) + '</div>' +
              '<div class="hm2-k">מה מחכה לי</div>' +
              '<div class="hm2-n is-loading" id="hm-n">·</div>' +
              '<div class="hm2-s" id="hm-s">בודקים מה חדש…</div>' +
            '</div>' +
            '<div class="hm2-minis">' +
              (sched ? '<button type="button" class="hm2-mini hm2-mini--go" id="hm-mini-ev" data-hm-nextsheet hidden></button>' : "") +
              '<button type="button" class="hm2-mini" id="hm-next" hidden></button>' +
              (admin ? '<button type="button" class="hm2-mini hm2-mini--adm" id="hm-mini-adm" data-admin-goto="adminBoard"></button>' : "") +
            '</div>' +
          '</div>' +
        '</section>' +
        '<div class="hm2-in hm2-body">' +
          '<section class="hm2-bento" id="hm-bento" aria-label="מה המצב אצלי">' +
            (sched ? '<div class="hm2-tile hm2-tile--week" id="hm-week"></div>' : "") +
            '<button type="button" class="hm2-tile" id="hm-mygarden" data-goto="resGarden">' +
              '<span class="hm2-tile__h">' + disc("gar", ICO.leaf) + 'הדיווחים שלי</span>' +
              '<span class="skeleton" style="display:block;height:30px;width:40%;border-radius:8px"></span></button>' +
            refundTileHTML(rc) +
            '<button type="button" class="hm2-tile" id="hm-mygym" data-goto="resGym" hidden></button>' +
          '</section>' +
          '<section class="hm2-grid2">' +
            '<div class="card hm2-card" id="hm-happened">' +
              '<div class="hm2-card__h"><h2>מה קרה</h2><button type="button" class="hm-link" data-goto="events">לוח האירועים ←</button></div>' +
              '<div id="hm-new"></div><div id="hm-inbox"></div>' +
              (sched ? '<div id="hm-feed"></div>' : "") +
              '<p class="hm2-empty" id="hm-happened-empty" hidden>אין חדש כרגע.</p>' +
            '</div>' +
            '<div class="card hm2-card" id="hm-todo">' +
              '<div class="hm2-card__h"><h2>דברים לעשות</h2></div>' +
              '<div id="hm-todo-list"></div>' +
            '</div>' +
          '</section>' +
        '</div>' +
        '</div>';

      var page = (container.querySelector && container.querySelector(".hm-page")) || container;
      W.root = page;
      /* החופה נפרדת מההדר רק כשגוללים מעבר אליה (דסקטופ: ההדר דביק) */
      if (!window.__hm2Scroll && window.addEventListener) {
        window.__hm2Scroll = true;
        window.addEventListener("scroll", function () {
          var c = document.getElementById("hm-cnp");
          document.body.classList.toggle("hm2-past", !!c && c.getBoundingClientRect().bottom < 70);
        }, { passive: true });
      }
      if (document.body && document.body.classList) document.body.classList.remove("hm2-past");
      bindClicks(page);
      if (window.CBA && CBA.wireDataRetry) CBA.wireDataRetry(container);

      /* החזרים — ידוע מיד (או לא ידוע בכלל, H16) */
      heroPart("refund", rc.ready, !rc.ready ? "" : rc.ready === 1
        ? "החזר של " + money(rc.readyAmt) + " אושר לתשלום"
        : rc.ready + " החזרים אושרו לתשלום (" + money(rc.readyAmt) + ")");
      /* עד 4 שניות — אחרי זה המספר מוצג בלי מה שלא הגיע (לא נתקעים על "·") */
      var myW = W;
      setTimeout(function () { if (W === myW) { W.heroTimeout = true; paintHero(); } }, 4000);
      /* ⚠️ ואחרי 8 שניות "דברים לעשות" מפסיק לחכות למה שלא חזר (כשל שקט של
         קריאה) — מציג את מה שיש, בלי שלד נצחי. */
      setTimeout(function () {
        if (W !== myW) return;
        W.rsvpKnown = W.profKnown = W.gymKnown = true;
        W.feedReady = true;
        syncTodo(container); syncHappened(container);
      }, 8000);

      if (sched) {
        CBA.homeSchedule.mount({ root: page,
          weekHost: container.querySelector("#hm-week"),
          feedHost: container.querySelector("#hm-feed"),
          onChange: function (sum) { onSchedule(container, sum); } });
      }
      loadMyGarden(container);
      loadMyGym(container);
      syncTodo(container);
      /* עדכונים חדשים (H9) — שורות ב"מה קרה" ומספר במספר הגיבור. מאותו תחום
         שכבר נספר (החזר שאושר / דיווח בטיפול) — לא נספר פעמיים. */
      if (window.CBA.inbox) {
        CBA.inbox.mount(container, { onList: function (list) {
          if (!W || !container.isConnected) return;
          syncHappened(container);
          var l = (list || []).filter(function (it) {
            if (it.dom === "bud" && rc.ready) return false;
            if (it.dom === "gar" && W.hero.garden && W.hero.garden.n) return false;
            return true;
          });
          heroPart("inbox", l.length, l.length === 1 ? "עדכון חדש: " + l[0].text : (l.length ? l.length + " עדכונים חדשים" : ""));
        } });
      } else heroPart("inbox", 0, "");
      if (admin) paintAdminMini(container);

      seedHomeFast(container, function () {
        primeHomeExtras(function () {
          loadNextReservation(container);
          loadNewCard(container);
          if (admin && W === myW) {
            loadAdminCounts(function (k, n) {
              if (W !== myW) return;
              W.adm[k] = n || 0;
              paintAdminMini(container);
            });
            W.admReady = true;
            paintAdminMini(container);
          }
          loadProfile(container);
        });
      });
    }
  };

  /* ======================================================= לוח ניהול ====
     🔴 גל 2 (30.9.26, ספר האבנים H30–H34) — "תפקיד ועד" יצא מהבית למסך משלו.
     אותן שורות בדיוק, אותה טעינה (seedHomeFast → primeHomeExtras →
     loadLazyCounts), אותם מזהים (#hm-tasks, #hm-clear, #hm-gardensec) — רק
     שולחן בהיר במקום משטח בתחתית הבית. הגינון: אריחי המדדים + "הכי נגררות"
     + קישור לנתוני הגינון (H33 — "קישור ללוח גינון עדיף"). */
  function boardHTML(garden) {
    var a = (window.CBA.alerts ? CBA.alerts() : null) || {};
    var rows = "";
    if (can("תקציב")) {
      if (a.pendingExpenses) rows += taskRow("הוצאות ממתינות לאישור", a.pendingExpenses, "expenses-pending", "warn");
      if (a.reviewExpenses)  rows += taskRow("הוצאות שהוחזרו לבדיקה", a.reviewExpenses, "expenses-pending");
    }
    if (can("מועדון") && a.pendingClub) rows += taskRow("שריוני מועדון ממתינים לאישור", a.pendingClub, "clubAdmin", "warn");
    var lazy = "";
    if (can("תושבים")) lazy += '<div id="hm-signups" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    if (can("תושבים")) lazy += '<div id="hm-profile" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    if (can("מכון"))   lazy += '<div id="hm-gym" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    if (can("גינון"))  lazy += '<div id="hm-garden" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    if (garden)        lazy += '<div id="hm-gdecide" class="hm-lazy">' + CBA.skel.rows(1, { avatar: false }) + '</div>';
    return '<div class="hm-page hm2-board">' +
      '<header class="hm2-bhead"><h1>לוח ניהול</h1>' +
        '<span>רק מה ששייך לתחומי הניהול שלך · ' + esc(todayLabel()) + '</span></header>' +
      '<div class="hm2-bgrid' + (garden ? " hm2-bgrid--g" : "") + '">' +
        '<section class="card hm2-card hm-vzone" id="hm-vzone" aria-label="ממתין לטיפולך">' +
          '<div class="hm2-card__h"><h2>ממתין לטיפולך</h2></div>' +
          '<div class="hm-tasks" id="hm-tasks">' + rows + lazy + '</div>' +
          '<div class="hm-clear" id="hm-clear"' + (rows ? " hidden" : "") + '>' +
            CBA.ui.emptyState({ icon: "check", title: "הכול מטופל", sub: "אין כרגע שום דבר שממתין לאישור שלך." }) +
          '</div>' +
        '</section>' +
        (garden ? '<section class="hmg hm2-bgarden" id="hm-gardensec" aria-label="גינון"></section>' : "") +
      '</div></div>';
  }

  CBA.screens.adminBoard = {
    render: function (container) {
      var garden = canGarden();
      container.innerHTML = boardHTML(garden);
      var page = (container.querySelector && container.querySelector(".hm-page")) || container;
      bindClicks(page);
      syncClearState(container);
      if (garden) {
        CBA.homeGarden.mount(container.querySelector("#hm-gardensec"), {
          board: true,
          onDecide: function (n, first) { paintDecide(container, n, first); }
        });
      }
      seedHomeFast(container, function () {
        primeHomeExtras(function () { loadLazyCounts(container); });
      });
    }
  };
})();
