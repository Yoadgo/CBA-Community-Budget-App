/* ============================================================================
 *  מסך "מצב המערכת" — מנהל-על בלבד            (2026-09-16)
 * ----------------------------------------------------------------------------
 *  🔴 **הבעיה שהמסך הזה פותר.** מאז צעד 05א כל תחום שעבר ל-Firestore חי
 *  מאחורי דגל זמן-ריצה, שאפשר להדליק ולכבות בלי דיפלוי. זה עבד — אבל
 *  הפעולה עצמה הייתה הקלדה ידנית של כתובת Apps Script. המשמעות המעשית:
 *  בשעת חירום, האדם שצריך לכבות תחום הוא היחיד שאינו יכול, ואין שום
 *  מקום באפליקציה שעונה על השאלה **"מה בכלל דלוק עכשיו?"**.
 *
 *  🔴🔴 **ולמה הבדיקה חייבת לרוץ כאן, בדפדפן, ולא בשרת.** כללי האבטחה
 *  נאכפים על **הקורא**. Apps Script קורא דרך חשבון שירות שעוקף אותם
 *  לגמרי — ולכן "בדיקת בריאות" שרצה בשרת הייתה מצליחה **תמיד**, גם
 *  כשכל תושב בשיכון מקבל דחייה. המסך הזה מריץ את הקריאה האמיתית,
 *  עם המשתמש האמיתי, מול הכללים האמיתיים. זו השאלה היחידה שחשובה.
 *
 *  ⚠️ **"נדחה" אינו בהכרח תקלה.** `gymCode` **אמור** להידחות למי שהמנוי
 *     שלו פג — זה הכלל עובד, לא נשבר. לכן כל שורה נושאת את הציפייה
 *     שלה, והמסך אומר "כצפוי" במקום "שגיאה".
 *  ⚠️ **אין כאן כתיבה לשום מסמך.** המסך קורא בלבד; ההדלקה והכיבוי
 *     עוברים ב-Apps Script (`flagSet`, PERM_SUPER), בדיוק כמו קודם.
 *  ⚠️ ההסתרה כאן היא נוחות בלבד — המידור הוא `GET_ACTION_PERMS` בשרת.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }

  var st = { flags: null, keys: [], error: "", busy: "", probes: {}, rows: [],
             fixBusy: false, fixMsg: "" };

  /* 🔴 **התיאור הוא חלק מהדגל, לא קישוט.** דגל בשם `budgetTxFromFirestore`
     אומר לי מה הוא עושה כי כתבתי אותו; בעוד חצי שנה, בשתיים בלילה, הוא
     לא יאמר את זה לאיש. השורה הזאת היא מה שיישאר. */
  /* 🔴🔴 **הערך השלישי הוא ברירת המחדל שבקוד, והוא לא אופציונלי**
     (16.9.2026, נתפס בסקירה לפני שהמסך שימש בפעם הראשונה).
     `flagsSet_` בשרת שומר **רק** מפתחות שמישהו שינה אי-פעם; מפתח
     שאינו במסמך פירושו "ברירת המחדל שבקוד", ו-`CBA.fb.flag(key, dflt)`
     מכבד את זה. חמישה מהדגלים דלוקים כברירת מחדל.
     ⚠️ מסך שהיה קורא `flags[key] === true` בלבד היה מציג אותם
        כ**כבויים** — ומציע כפתור "הדלק" על תחום שכבר חי. כלומר
        המסך שכל תכליתו כיבוי חירום לא היה מציע לכבות בדיוק את
        חמשת התחומים שדולקים היום, והלחיצה הראשונה לא הייתה
        עושה כלום. צריך היה ללחוץ פעמיים.
     ⚠️ יש בדיקה שמצליבה כל ערך כאן מול הקבוע האמיתי בקוד הלקוח. */
  var FLAG_INFO = {
    gardenPlanFromFirestore:  ["תוכנית הגינון", "מסכי הגינון קוראים את התוכנית ישירות מ-Firestore במקום מ-Apps Script.", true],
    servicesFromFirestore:    ["שירותים לתושב", "כרטיסי השירותים נקראים ישירות מ-Firestore.", true],
    budgetYearFromFirestore:  ["תקציב לפי שנה", "שנה שנמשכת לפי דרישה נקראת מ-Firestore במקום מהגיליון.", true],
    budgetTxStatusToFirestore: ["שינוי סטטוס תנועה", "כתיבה: שינוי סטטוס נכתב ישירות ל-Firestore, וטריגר מחיל אותו על הגיליון.", true],
    budgetTxFromFirestore:    ["תנועות התקציב", "התנועות של השנה הנוכחית נקראות מ-Firestore ולא נשלחות במטען.", true],
    pulseToFirestore:         ["הפעימה החיה", "השרת כותב מסמך פעימה, והלקוח מאזין לו במקום לסקור כל 3 שניות.", false],
    bootFromFirestore:        ["טעינה קרה", "כשאין מטמון מקומי — השנה הנוכחית נבנית מ-Firestore ומצוירת מיד.", false],
    homeCountsFromFirestore:  ["מוני עמוד הבית", "תגיות הספירה בעמוד הבית נקראות ישירות מ-Firestore ומצוירות מיד, בלי לחכות ל-homeExtras.", false],
    tourFromFirestore:        ["כרטיס הסיור", "צעדי הסיור ו\"מה כבר ראיתי\" נקראים מ-Firestore במקום מ-Apps Script.", false],
    clubResvFromFirestore:    ["השריון הקרוב", "שורת השריון הקרוב בעמוד הבית נקראת מהמסמך של המשפחה ב-Firestore.", false],
    /* 23.9 — ברירת מחדל true, כמו EVENTS_FROM_FIRESTORE ב-dataService. כיבוי
       מחזיר את הלוח ל-Apps Script (היומן עצמו), בלי שום אובדן נתונים. */
    /* גל 4 (24.9) — ברירת מחדל true, כמו APP_REPORTS_FS_DEFAULT ב-dataService.
       כיבוי מחזיר שליחה ומסך ניהול ל-Apps Script; השרת ממשיך לכתוב מסמך. */
    appReportsFromFirestore:  ["דיווחים על האפליקציה", "שליחת דיווח נכתבת ישירות ל-Firestore, ומסך הדיווחים קורא משם. מייל ומראה לגיליון — ברקע ב-Apps Script.", true],
    eventsFromFirestore:      ["לוח האירועים", "לוח האירועים (בית + מסך האירועים) נקרא ממסמך השנה ב-Firestore, שמתעדכן מהיומן תוך דקה. כשל — נופל בשקט ל-Apps Script, שקורא את היומן ישירות.", true],
    /* ⚠️ ברירת המחדל כאן היא `true` ולא בגלל אופטימיות: `fsFirstRead`
       מקצרת על ברירת המחדל שבקוד לפני שהיא קוראת את הדגל החי,
       ולכן `false` היה הופך את המתג הזה לחסר השפעה לחלוטין. */
    /* ⚠️ ברירת המחדל false: הכתיבה נבדקת בקוד עצמו (לא דרך
       fsFirstRead), ולכן false כאן **כן** עובד — וזה מה שמאפשר
       לדחוף את הקוד לייצור בלי לשנות התנהגות. */
    gardenTasksFromFirestore: ["מסך ניהול הגינון", "משימות, רשימות ויומן נקראים ישירות מ-Firestore במקום מ-Apps Script (נמדד: 8,053ms). הכתיבה ממשיכה דרך Apps Script.", true],
    /* 🔴🔴 גל 3 — המתג שמחזיר את כל פעולות המנהל
       ל-Apps Script בלי דיפלוי. אם משהו בגינון נשבר — זה הכפתור. */
    gardenWritesFromBrowser: ["פעולות המנהל בגינון", "בוצע, החזרה, אישור, הערה, דחייה ושיבוץ נכתבים ישירות ל-Firestore במקום דרך Apps Script (נמדד: 28.9 שניות ללחיצה). המייל יוצא ברקע. כיבוי מחזיר את הכול ל-Apps Script מיד.", false],
    gardenWriteToFirestore: ["כתיבת דיווח גינון", "הדפדפן כותב דיווח ישירות ל-Firestore; Apps Script נשאר לתמונות ולמיילים בלבד. נבדק יחד עם \"הדיווחים שלי\" — לעולם לא לבדו.", false],
    gardenReportsFromFirestore: ["הדיווחים שלי", "דיווחי הגינון של המשפחה נקראים ישירות מ-Firestore לפי מזהה משפחה, במקום מ-Apps Script (נמדד: 9,498ms ל-367 בתים).", true],
    appsScriptFallback: ["חירום: חזרה ל-Apps Script", "מתג חירום לתקלה רוחבית ב-Firestore. כבוי = כשל טעינה מציג \"לא הצלחנו לטעון\" עם \"נסה שוב\". דלוק = כל התחומים חוזרים לקרוא מהגיליון דרך Apps Script, כולל נתונים שמפגרים עד שעה.", false],
    writeWatchdog: ["שומר הכתיבות", "כתיבה שלא ענתה תוך 60 שניות משוחררת ונכנסת לתור, ומצב \"עסוק\" שנתקע מעל שתי דקות משוחרר אוטומטית. כיבוי מחזיר את הבאג שבגללו האפליקציה מפסיקה לקלוט נתונים חדשים עד רענון עמוד.", true]
  };

  /* המצב **האפקטיבי**: מה שכתוב במסמך, ואם אינו כתוב — ברירת המחדל
     שבקוד. זו בדיוק הנוסחה של `CBA.fb.flag`, ולכן המסך אומר את מה
     שהאפליקציה באמת עושה. דגל שאין לו תיאור (נוסף בשרת ואינו מוכר
     כאן) מוצג לפי המסמך בלבד — זה כל מה שידוע עליו. */
  function effective(key) {
    if (st.flags && st.flags[key] === true) return true;
    if (st.flags && st.flags[key] === false) return false;
    var info = FLAG_INFO[key];
    return !!(info && info[2]);
  }

  /* מה נבדק, ומה התשובה הצפויה. `expect` הוא מה שאומר לנו אם "נדחה"
     הוא הכלל עובד או הכלל שבור. */
  function probeList() {
    var uid = (CBA.fb && CBA.fb.uid && CBA.fb.uid()) || "";
    var year = (CBA.mock && CBA.mock.currentYear) || "";
    var list = [
      { key: "flags",  label: "מפת הדגלים",  c: "appConfig",  id: "flags", expect: "ok" },
      { key: "rev",    label: "מסמך הפעימה", c: "appConfig",  id: "rev",   expect: "ok" },
      { key: "boot",   label: "מסמך הפתיחה", c: "appConfig",  id: "boot",  expect: "ok" },
      { key: "garden", label: "רשימות הגינון", c: "gardenMeta", id: "lists", expect: "ok" }
    ];
    if (year) list.push({ key: "year", label: "תקציב " + year, c: "budgetYears", id: year, expect: "ok" });
    /* 🔴 **בלי uid אין מה לשאול לפי משתמש.** קריאה עם מזהה ריק נדחית,
       והשורה הייתה נצבעת אדום ומאשימה את הכללים במקום לומר את
       האמת: עדיין אין חיבור Firebase. `no-user` כבר אומר את זה
       בשורות האחרות, וזה מספיק. */
    if (uid) {
      list.push({ key: "member", label: "רשומת החבר שלי", c: "members", id: uid, expect: "ok" });
      list.push({ key: "gym",  label: "מנוי הכושר שלי", c: "gymStatus", id: uid, expect: "any" });
      /* 🔴 היחיד שדחייה שלו היא **התנהגות תקינה** — ר' הכותרת. */
      list.push({ key: "code", label: "קוד הכניסה למכון", c: "gymCode", id: uid, expect: "any" });
    }
    /* 🔴 מוני עמוד הבית (16.9, פעולה 3) — `any`, כי דחייה
       כאן היא הכלל עובד: מסמך `residents` נקרא **רק**
       לבעלי הרשאת תושבים, ומנהל המכון אמור להידחות ממנו. */
    list.push({ key: "counts", label: "מוני עמוד הבית", c: "homeCounts", id: "residents", expect: "any" });
    /* צעד 12 — שני האחרונים שמוציאים את עמוד הבית מ-Apps Script.
       `all` פתוח לכל חבר פעיל ולכן `ok`; השריון תלוי במזהה משפחה
       ובכך שיש למשפחה בכלל שריון, ולכן `any`. */
    list.push({ key: "tour", label: "צעדי הסיור", c: "tourSteps", id: "all", expect: "ok" });
    /* 23.9 — לוח האירועים. `ok`: פתוח לכל חבר פעיל שאינו חיצוני, והמסמך נזרע
       מהיומן. "אין מסמך" כאן = הזריעה עוד לא רצה (eventsSync / הריצה השעתית). */
    list.push({ key: "events", label: "לוח האירועים " + new Date().getFullYear(), c: "eventsCal",
                id: String(new Date().getFullYear()), expect: "ok" });
    var fam = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
    if (fam) list.push({ key: "resv", label: "השריון הקרוב שלי", c: "clubReservations", id: fam, expect: "any" });
    return list;
  }

  var STATE_HE = {
    ok: "נקרא", missing: "אין מסמך", denied: "נדחה",
    "no-sdk": "אין SDK", "no-user": "אין משתמש", "no-db": "אין חיבור"
  };

  function toneFor(p, expect) {
    if (!p) return "muted";
    if (p.state === "ok") return "ok";
    if (expect === "any") return "muted";   /* תלוי-הרשאה — לא תקלה */
    return p.state === "missing" ? "warn" : "danger";
  }

  function probeRow(item) {
    var p = st.probes[item.key];
    var tone = toneFor(p, item.expect);
    var right = p
      ? esc(STATE_HE[p.state] || p.state) + (p.state === "ok" ? " · " + p.ms + " מ״ש" : "")
      : "בודק…";
    return '<div class="sys-row">' +
             '<span class="sys-dot sys-dot--' + tone + '"></span>' +
             '<span class="sys-row__name">' + esc(item.label) + "</span>" +
             '<span class="sys-row__path">' + esc(item.c + "/" + item.id) + "</span>" +
             '<span class="sys-row__val">' + right + "</span>" +
           "</div>";
  }

  function flagRow(key) {
    var info = FLAG_INFO[key] || [key, ""];
    var on = effective(key);
    /* ⚠️ מפתח שאינו במסמך = ברירת המחדל שבקוד. אומרים את זה בפירוש,
       כי "דלוק" שלא נכתב מעולם ו"דלוק" שמישהו הדליק אינם אותו דבר:
       הראשון נעלם ברגע שמישהו יכבה וידליק מחדש. */
    var implicit = !(st.flags && (st.flags[key] === true || st.flags[key] === false));
    var busy = st.busy === key;
    return '<div class="sys-flag' + (on ? " sys-flag--on" : "") + '">' +
             '<div class="sys-flag__text">' +
               '<div class="sys-flag__name">' + esc(info[0]) + "</div>" +
               '<div class="sys-flag__desc">' + esc(info[1]) + "</div>" +
               '<div class="sys-flag__key">' + esc(key) +
                 (implicit ? ' · ברירת מחדל' : "") + "</div>" +
             "</div>" +
             '<button type="button" class="btn-ghost sys-flag__btn" data-flag="' + esc(key) + '"' +
               (busy ? " disabled" : "") + ">" +
               (busy ? "רגע…" : (on ? "כבה" : "הדלק")) +
             "</button>" +
           "</div>";
  }

  function draw(container) {
    var head =
      '<div class="screen-head">' +
        '<div class="screen-head__title">מצב המערכת</div>' +
        '<div class="screen-head__sub">אילו תחומים נקראים מ-Firestore, והאם הדפדפן הזה באמת מצליח לקרוא אותם</div>' +
      "</div>";

    var flagsHTML;
    if (st.error) {
      flagsHTML = '<div class="card"><div class="club-empty">' + esc(st.error) + "</div></div>";
    } else if (!st.flags) {
      flagsHTML = CBA.skel.cards(2);
    } else {
      flagsHTML = '<div class="card">' +
        '<div class="sys-sec">דגלי זמן ריצה</div>' +
        /* ⚠️ הרשימה מגיעה **מהשרת** (FLAG_KEYS), לא מהמפה כאן. דגל חדש
           שנוסף בשרת מופיע מיד, גם בלי גרסת לקוח חדשה — עם שמו בלבד. */
        st.keys.map(flagRow).join("") +
        '<div class="sys-note">שינוי נכנס לתוקף בשרת מיד, ובלשוניות פתוחות תוך דקה. ' +
          'לשונית שכבר פתוחה קוראת את מפת הדגלים פעם אחת בטעינה — רענון מחיל מיד.</div>' +
      "</div>";
    }

    /* 🔴 **הרשימה נקבעת פעם אחת, בטעינה** (16.9, נתפס בסקירה).
       `probeList()` תלויה ב-`CBA.fb.uid()`, שעדיין ריק בשנייה
       הראשונה. חישוב מחדש בכל ציור היה מוסיף שלוש שורות אחרי
       ש-`load()` כבר החליט מה להריץ — והן היו תקועות על "בודק…"
       לנצח, כי אף אחד לא התחיל אותן. */
    var probes = st.rows;
    var probeHTML = '<div class="card">' +
      '<div class="sys-sec">קריאה אמיתית מהדפדפן הזה</div>' +
      probes.map(probeRow).join("") +
      '<div class="sys-note">🔴 הבדיקה רצה כאן ולא בשרת: כללי האבטחה נאכפים על הקורא, ' +
        'ו-Apps Script עוקף אותם דרך חשבון שירות. "נדחה" בקוד הכניסה למכון הוא ' +
        'התנהגות תקינה כשאין מנוי פעיל.</div>' +
    "</div>";

    /* ==========================================================================
     *  🔧 תחזוקה — פעולות חד-פעמיות   (2026-09-22)
     * --------------------------------------------------------------------------
     *  ⚠️ **זה לא דגל.** דגל משנה התנהגות מכאן והלאה; מה שיושב כאן מתקן
     *     נתונים שכבר נכתבו. ההפרדה מכוונת — כפתור שמריץ כתיבה על עשרות
     *     מסמכים לא צריך להיראות כמו מתג הפעלה.
     * ======================================================================== */
    var fixHTML = '<div class="card">' +
      '<div class="sys-sec">תחזוקה</div>' +
      '<div class="sys-flag">' +
        '<div class="sys-flag__text">' +
          '<div class="sys-flag__name">יישור סטטוס לדיווחי תושבים</div>' +
          '<div class="sys-flag__desc">מעתיק שלב, דגל וסיבת סגירה מכל משימה אל הדיווח ' +
            'שמאחוריה. נדרש פעם אחת לדיווחים שנפתחו מאז 16.9 ונשארו תקועים על ' +
            '"התקבל". בטוח להרצה חוזרת.</div>' +
          (st.fixMsg ? '<div class="sys-flag__key">' + esc(st.fixMsg) + '</div>' : '') +
        '</div>' +
        '<button type="button" class="btn-ghost sys-flag__btn" id="sys-fix-reports"' +
          (st.fixBusy ? " disabled" : "") + '>' +
          (st.fixBusy ? "רגע…" : "הרץ") +
        '</button>' +
      '</div>' +
    '</div>';

    container.innerHTML = head + flagsHTML + probeHTML + fixHTML;

    Array.prototype.forEach.call(container.querySelectorAll("[data-flag]"), function (btn) {
      btn.addEventListener("click", function () { toggle(container, btn.getAttribute("data-flag")); });
    });

    var fixBtn = container.querySelector("#sys-fix-reports");
    if (fixBtn) fixBtn.addEventListener("click", function () { repairReports(container); });
  }

  function repairReports(container) {
    if (st.fixBusy || !CBA.data.gardenRepairReportStatus) return;
    CBA.ui.confirm(
      "כל דיווח תושב יקבל את השלב והסגירה של המשימה שלו. הפעולה אינה מוחקת דבר " +
      "ואפשר להריץ אותה שוב.",
      { title: "יישור סטטוס לדיווחי תושבים", okText: "הרץ" }
    ).then(function (yes) {
      if (!yes) return;
      st.fixBusy = true; st.fixMsg = "";
      draw(container);
      CBA.data.gardenRepairReportStatus(function (res) {
        st.fixBusy = false;
        if (res && res.ok) {
          st.fixMsg = "יושרו " + (res.count || 0) + " דיווחים מתוך " + (res.total || 0) + ".";
        } else {
          st.fixMsg = (res && res.error) || "הפעולה נכשלה.";
        }
        draw(container);
      });
    });
  }

  function toggle(container, key) {
    if (st.busy || !st.flags) return;
    /* 🔴 ההפך של המצב **האפקטיבי**, לא של מה שכתוב במסמך. */
    var next = !effective(key);
    var info = FLAG_INFO[key] || [key, ""];
    CBA.ui.confirm(
      (info[1] || "") + " השינוי חל על כל המשתמשים.",
      { title: (next ? "להדליק" : "לכבות") + " — " + info[0],
        okText: next ? "הדלק" : "כבה", danger: !next }
    ).then(function (yes) {
      if (!yes) return;
      st.busy = key;
      draw(container);
      CBA.data.setFlag(key, next, function (res) {
        st.busy = "";
        if (res && res.ok && res.flags) { st.flags = res.flags; }
        else { CBA.ui.alert((res && res.error) || "השינוי נכשל."); }
        draw(container);
      });
    });
  }

  function load(container) {
    st.error = ""; st.flags = null; st.keys = []; st.probes = {};
    st.rows = probeList();
    CBA.data.getFlags(function (res) {
      if (res && res.ok) { st.flags = res.flags || {}; st.keys = res.keys || []; }
      else { st.error = (res && res.error) || "לא ניתן לטעון את הדגלים."; }
      draw(container);
    });
    /* ⚠️ הבדיקות רצות **במקביל** ולא בטור: כל אחת היא קריאת Firestore
       של עשרות אלפיות, ושרשור שמונה כאלה היה הופך אותן לשנייה שלמה
       בלי שום סיבה. כל תשובה מציירת מחדש בעצמה. */
    st.rows.forEach(function (item) {
      if (!CBA.data.probeDoc) return;
      CBA.data.probeDoc(item.c, item.id, function (p) {
        st.probes[item.key] = p;
        try { draw(container); } catch (e) {}
      });
    });
  }

  CBA.screens.sysStatus = {
    title: "מצב המערכת",
    render: function (container) {
      draw(container);
      load(container);
    }
  };
})();
