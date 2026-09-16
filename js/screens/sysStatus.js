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

  var st = { flags: null, keys: [], error: "", busy: "", probes: {} };

  /* 🔴 **התיאור הוא חלק מהדגל, לא קישוט.** דגל בשם `budgetTxFromFirestore`
     אומר לי מה הוא עושה כי כתבתי אותו; בעוד חצי שנה, בשתיים בלילה, הוא
     לא יאמר את זה לאיש. השורה הזאת היא מה שיישאר. */
  var FLAG_INFO = {
    gardenPlanFromFirestore:  ["תוכנית הגינון", "מסכי הגינון קוראים את התוכנית ישירות מ-Firestore במקום מ-Apps Script."],
    servicesFromFirestore:    ["שירותים לתושב", "כרטיסי השירותים נקראים ישירות מ-Firestore."],
    budgetYearFromFirestore:  ["תקציב לפי שנה", "שנה שנמשכת לפי דרישה נקראת מ-Firestore במקום מהגיליון."],
    budgetTxStatusToFirestore: ["שינוי סטטוס תנועה", "כתיבה: שינוי סטטוס נכתב ישירות ל-Firestore, וטריגר מחיל אותו על הגיליון."],
    budgetTxFromFirestore:    ["תנועות התקציב", "התנועות של השנה הנוכחית נקראות מ-Firestore ולא נשלחות במטען."],
    pulseToFirestore:         ["הפעימה החיה", "השרת כותב מסמך פעימה, והלקוח מאזין לו במקום לסקור כל 3 שניות."],
    bootFromFirestore:        ["טעינה קרה", "כשאין מטמון מקומי — השנה הנוכחית נבנית מ-Firestore ומצוירת מיד."]
  };

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
    var on = st.flags && st.flags[key] === true;
    var busy = st.busy === key;
    return '<div class="sys-flag' + (on ? " sys-flag--on" : "") + '">' +
             '<div class="sys-flag__text">' +
               '<div class="sys-flag__name">' + esc(info[0]) + "</div>" +
               '<div class="sys-flag__desc">' + esc(info[1]) + "</div>" +
               '<div class="sys-flag__key">' + esc(key) + "</div>" +
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

    var probes = probeList();
    var probeHTML = '<div class="card">' +
      '<div class="sys-sec">קריאה אמיתית מהדפדפן הזה</div>' +
      probes.map(probeRow).join("") +
      '<div class="sys-note">🔴 הבדיקה רצה כאן ולא בשרת: כללי האבטחה נאכפים על הקורא, ' +
        'ו-Apps Script עוקף אותם דרך חשבון שירות. "נדחה" בקוד הכניסה למכון הוא ' +
        'התנהגות תקינה כשאין מנוי פעיל.</div>' +
    "</div>";

    container.innerHTML = head + flagsHTML + probeHTML;

    Array.prototype.forEach.call(container.querySelectorAll("[data-flag]"), function (btn) {
      btn.addEventListener("click", function () { toggle(container, btn.getAttribute("data-flag")); });
    });
  }

  function toggle(container, key) {
    if (st.busy || !st.flags) return;
    var next = !(st.flags[key] === true);
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
    CBA.data.getFlags(function (res) {
      if (res && res.ok) { st.flags = res.flags || {}; st.keys = res.keys || []; }
      else { st.error = (res && res.error) || "לא ניתן לטעון את הדגלים."; }
      draw(container);
    });
    /* ⚠️ הבדיקות רצות **במקביל** ולא בטור: כל אחת היא קריאת Firestore
       של עשרות אלפיות, ושרשור שמונה כאלה היה הופך אותן לשנייה שלמה
       בלי שום סיבה. כל תשובה מציירת מחדש בעצמה. */
    probeList().forEach(function (item) {
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
