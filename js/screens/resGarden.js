/* ============================================================================
 *  "מראה שיכון" — אזור התושב (2026-09-07, צעד 3 של מודול הגינון)
 * ----------------------------------------------------------------------------
 *  שני מסכים:
 *    resGarden     — "הדיווחים שלי". זה מה שהטאב פותח.
 *    resGardenNew  — טופס דיווח חדש. לא טאב; מגיעים אליו מכפתור בתוך המסך.
 *
 *  שלוש החלטות שמעצבות את הקוד כאן:
 *  1. **התושב רואה חמישה שלבים בלבד.** הדגל ("ממתין לאישור" וכו') מוצג
 *     כתג נפרד ובניסוח אנושי — לא כשלב שישי. ר' stageIdx ו-flagText למטה,
 *     והמילון המשותף ב-js/data/gardenLang.js.
 *  2. **המפה היא הרכיב המשותף** (CBA.map ב-resident.js) במצב pin, והנעיצה
 *     מוחזרת מנורמלת 0–1. לא לשנות ליחידות אחרות — ר' ההערה שם.
 *  3. **סינון הדיווחים נעשה בשרת** לפי המושב החתום. המסך הזה לא מקבל בכלל
 *     דיווחים של אחרים, ולכן אין כאן שום בדיקת בעלות.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};
  var esc = CBA.esc;

  /* ============================================================================
   *  שליחת דיווח ברקע (2026-09-14 — לבקשת יועד)
   * ----------------------------------------------------------------------------
   *  השליחה לוקחת 5-8 שניות עם שתי תמונות: העלאת הקבצים, יצירתם בדרייב,
   *  שלוש כתיבות לגיליון ושני מיילים שנשלחים בתוך הבקשה. עד היום הכפתור אמר
   *  "שולח…" בלי לזוז והתושב היה כלוא במסך.
   *
   *  עכשיו הוא חופשי לעבור מסך: ⚠️ **בקשת XHR שורדת ניווט פנימי ב-SPA** —
   *  showScreen/CBA.navigate אינם עזיבת דף אמיתית, והבקשה ממשיכה לרוץ ומגיעה
   *  ל-callback גם אם המסך הנראה כבר התחלף (ר' ההערה ב-sheets.js).
   *
   *  ⚠️ הטופס המלא — כולל התמונות המכווצות — נשמר כאן ברמת המודול ולא במסך,
   *     כדי שכישלון בזמן שהתושב במקום אחר לא ימחק את מה שהקליד. **בזיכרון
   *     בלבד, לא ב-localStorage:** תמונה מכווצת היא ~250KB ויש עד 8, מעל
   *     המכסה של localStorage — והזיכרון חי בדיוק כל עוד הלשונית חיה, שזה
   *     בדיוק הטווח שהבקשה חיה בו. את סגירת הלשונית תופס beforeunload
   *     שב-postReadProgress.
   * ========================================================================== */
  var pendingReport = null;

  /* מזהה שנוצר **פעם אחת לטופס** ולא פעם אחת לכל ניסיון שליחה. הוא נוסע עם
     הדיווח, השרת שומר אותו בעמודה 'מזהה שליחה', ושליחה חוזרת עם אותו מזהה
     מחזירה את הדיווח הקיים במקום ליצור חדש.
     ⚠️ בלי זה, "נסה שוב" אחרי נפילת רשת מייצר דיווח כפול — וזה קרה בייצור
        ב-14.9: השרת כתב את הדיווח ורץ 15 שניות, והדפדפן הודיע "שגיאת רשת". */
  /* קפסולות כותרת-מהירה לפי קטגוריה (2026-09-15) — יועד אישר את הרשימה.
     המפתחות הם בדיוק המחרוזות מ-GARDEN_DEFAULT_SETTINGS ב-Code.gs; קטגוריה
     שלא ברשימה (לא אמור לקרות, הרשימה סגורה) פשוט לא מציגה קפסולות ומשאירה
     מילוי חופשי בלבד. */
  /* 22.9 — הרשימה עברה למילון המשותף (gardenLang.js), כדי שטופס הצוות
     יציע בדיוק את אותן קפסולות. הנפילה-לאחור: אובייקט ריק = בלי קפסולות,
     והטופס ממשיך במילוי חופשי. */
  var TITLE_PICKS = (window.CBA && CBA.gardenLang && CBA.gardenLang.TITLE_PICKS) || {};

  function newRef() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  /* הניסוח לפי שניות שחלפו. שליחה עם תמונה נמדדה בייצור ב-15 שניות
     (14.9.26), ולכן הטקסט מכין לזה במקום להיראות תקוע. */
  function stageText(sec) {
    if (sec < 4)  return "שולח את הדיווח…";
    if (sec < 10) return "עוד רגע (" + sec + " שנ׳)";
    return "עדיין עובד, הדיווח בדרך. אפשר להמשיך לגלוש (" + sec + " שנ׳)";
  }

  function sendReport(data, btn) {
    pendingReport = data;
    /* חוסם רענון רקע כל עוד הדיווח בדרך — אותו מנגנון שמגן על העלאת קבלה. */
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gardenReport");

    var release = (btn && CBA.ui.busy) ? CBA.ui.busy(btn, "שולח…") : function () {};
    var prog = null;
    if (btn && btn.parentNode) {
      prog = document.createElement("div");
      prog.className = "gd-progress";
      prog.textContent = stageText(0);
      btn.parentNode.insertBefore(prog, btn.nextSibling);
    } else {
      CBA.ui.toast("שולח את הדיווח…");
    }

    /* ⚠️ החיווי לפי **זמן שחלף** ולא לפי אחוזי העלאה, כי אחוזים אמיתיים
       דורשים מאזין על xhr.upload — וזה בדיוק מה ששובר את הבקשה מול
       Apps Script (ר' ההערה הארוכה ב-sheets.js). לא ממציאים מספרים:
       אומרים כמה זמן עבר ומה קורה עכשיו. */
    var t0 = Date.now();
    var ticker = setInterval(function () {
      var sec = Math.round((Date.now() - t0) / 1000);
      if (prog) prog.textContent = stageText(sec);
      if (btn && btn.isConnected && CBA.ui.busyText) {
        CBA.ui.busyText(btn, sec < 4 ? "שולח…" : ("שולח… " + sec + " שנ׳"));
      }
    }, 1000);

    CBA.data.submitGardenReport(data, function (res) {
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gardenReport");
      /* isConnected עונה בדיוק על השאלה "התושב עדיין בטופס?" — כשהמסך מתחלף
         ה-container נכתב מחדש והכפתור מתנתק מה-DOM. בלי צורך לחשוף את
         currentScreen מ-app.js. */
      var onForm = !!(btn && btn.isConnected);
      clearInterval(ticker);
      if (prog && prog.parentNode) prog.parentNode.removeChild(prog);
      release();

      if (res && res.ok) {
        pendingReport = null;
        /* duplicate=true — השרת מצא שהדיווח כבר נכתב עם אותו מזהה שליחה.
           אומרים את האמת ולא "נשלח", כדי שהתושב לא יחפש דיווח שני. */
        var base = (res.duplicate ? "הדיווח כבר נשמר · מספר " : "הדיווח נשלח · מספר ") + res.id;

        /* 🔴🔴 **תמונה שנכשלה מפסיקה להיבלע** (2026-09-16).
           עד היום השרת בלע כישלון העלאה ב-`catch` שקט, והתושב קיבל
           "נשלח" בדיוק כמו תמיד — שלח שלוש, נחתה אחת, ואיש לא ידע.
           עכשיו אומרים את האמת, **ומפנים אותו להשלים**: התמונות
           עדיין בזיכרון, ולכן ההשלמה היא לחיצה אחת ולא צילום מחדש. */
        if (res.photosFailed > 0) {
          var miss = res.photosFailed;
          CBA.ui.toast(base + " — " + (miss === 1 ? "תמונה אחת לא עלתה" : miss + " תמונות לא עלו"));
          var keep = (data.photos || []).slice(-miss);
          if (onForm) {
            return CBA.navigate("resGardenNew", {
              completeFor: res.id, taskId: res.taskId, photos: keep
            });
          }
          /* לא בטופס — לא גוררים אותו. הבאנר ב"הדיווחים שלי" ימתין לו. */
          return;
        }

        /* ⚠️ 17.9 — **אומרים שהתמונות עדיין בדרך.** ההגשה נסגרת עכשיו
           לפני שהן עלו, ולכן "הדיווח נשלח" לבדו היה חצי אמת: התושב היה
           נכנס ל"הדיווחים שלי", רואה דיווח בלי תמונות, וחושב שהן אבדו.
           הן באמת ממשיכות לעלות, והוא באמת חופשי ללכת. */
        var pend = res.photosPending || 0;
        CBA.ui.toast(pend > 0
          ? base + " · " + (pend === 1 ? "התמונה ממשיכה לעלות ברקע"
                                       : "התמונות ממשיכות לעלות ברקע")
          : base);
        /* ⚠️ לנווט רק אם הוא עדיין בטופס. אם הוא כבר עבר למסך אחר, גרירה
           חזרה לרשימת הדיווחים היא בדיוק מה שהיציאה-ברקע באה למנוע. */
        if (onForm) CBA.navigate("resGarden");
        return;
      }

      var msg = (res && res.error) || "לא הצלחנו לשלוח את הדיווח";
      if (onForm) return CBA.ui.alert(msg);
      CBA.ui.confirm(msg + ". מה שכתבת נשמר — לנסות לשלוח שוב?", {
        title: "השליחה נכשלה", okText: "נסה שוב", cancelText: "לא עכשיו"
      }).then(function (yes) {
        if (yes) sendReport(pendingReport, null);
      });
    }, function (pct) {
      /* ⚠️ 17.9 — **מד ההתקדמות לפי תמונה ירד** (החלטת יועד). הוא היה
         הסיבה היחידה שהתמונות עלו בזו אחר זו, והסדרתיות היא שעשתה את
         70 השניות. מה שנשאר כאן משרת רק את מסלול הנפילה לאחור
         (Apps Script), שבו הכל עדיין קריאה אחת ארוכה. */
      if (prog && pct >= 100) prog.textContent = "התקבל, מסיים…";
    });
  }

  /* כיווץ תמונה לפני שליחה — המימוש, הנימוקים והמלכודות (EXIF, HEIC,
     נפילה חזרה לקובץ המקורי) עברו ל-js/ui/photos.js ב-22.9.2026, כדי
     שגם מסך המשימות יוכל לצרף תמונה מאותו קוד. כאן נשאר רק השם המקומי
     ששמונה הקריאות בקובץ הזה משתמשות בו. */
  function compressImage(file, cb) { CBA.photos.compress(file, cb); }

  var STAGES = ["התקבל", "נבדק", "מתוכנן", "בטיפול", "הושלם"];
  function stageIdx(s) { var i = STAGES.indexOf(String(s || "").trim()); return i < 0 ? 0 : i; }

  /* ==========================================================================
   *  🔴🔴  שדות הצוות חסרים במסמך — "התקבל", לא ריק   (2026-09-22)
   * --------------------------------------------------------------------------
   *  מאז שהדפדפן כותב ישירות ל-Firestore, מסמך הדיווח **נולד בלי**
   *  `stage`/`flag`/`closure`: כלל היצירה `grShapeOk` אוסר על התושב
   *  לשלוח אותם (`grTeamFields`), והסנכרון השעתי שמילא אותם בעבר
   *  (`gardenReportsSyncAll_`) מסרב לרוץ מרגע ש-Firestore הוא הבעלים.
   *
   *  התוצאה שנצפתה על דיווחים 21 ו-22: `stageIdx(undefined)` הוא 0
   *  ולכן הבר תקוע בנקודה הראשונה; משפט המצב הציג `undefined`;
   *  ו**כפתור המחיקה נעלם**, כי התנאי שלו הוא `stage === "התקבל"`.
   *
   *  🔑 שדה חסר פירושו **איש עוד לא נגע** — וזה בדיוק "התקבל".
   *     נפילה-לאחור כאן נכונה בשני המסלולים: במסלול Apps Script
   *     השדות תמיד מלאים, ולכן הפונקציה הזאת לא משנה שם דבר.
   *  ⚠️ זו חצי מהתשובה. החצי השני הוא המראה `gardenMirrorToReports`
   *     ב-dataService.js, שמעדכנת את המסמך בכל פעולה של הצוות.
   * ========================================================================== */
  function normRep(r) {
    r = r || {};
    if (!String(r.stage || "").trim()) r.stage = "התקבל";
    if (r.flag == null) r.flag = "";
    if (r.closure == null) r.closure = "";
    return r;
  }

  /* ניסוח הדגל לתושב. השם הפנימי ("ממתין לאישור") הוא שפה של הצוות —
     התושב מקבל משפט שמסביר לו מה קורה ולמה עוד לא סגור.
     ⚠️ 2026-09-09 — הטבלה עברה ל-js/data/gardenLang.js. היא ישבה כאן,
     ובמקביל מסך המשימות ניסח את אותם מצבים במילים אחרות ("ממתין לאישור
     הוועד" מול "הוועד" מול "ממתין לאישורך"). מקור אחד לניסוח. */
  function flagText(flag) {
    return (CBA.gardenLang && CBA.gardenLang.flagText)
      ? CBA.gardenLang.flagText(flag, "resident")
      : flag;
  }

  /* קטגוריה -> סמליל וצבע. ההתאמה לפי מילת מפתח ולא לפי מחרוזת מדויקת,
     כדי שעריכה קלה של השם בטאב ההגדרות לא תשבור את התצוגה. */
  var CATS = [
    { key: "lawn",  match: /דשא|מדשא/,        ico: "lawnwater" },
    { key: "water", match: /השקי|ממטר/,        ico: "water" },
    { key: "tree",  match: /^עצים|עץ/,          ico: "tree"  },
    { key: "prune", match: /גיזום|שיח/,        ico: "prune" },
    { key: "weed",  match: /עשבי|קרקע/,        ico: "weed"  },
    { key: "clean", match: /ניקיון|גזם/,       ico: "clean" },
    { key: "bed",   match: /ערוג|שתיל/,        ico: "bed"   }
  ];
  function catOf(name) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].match.test(name)) return CATS[i];
    return { key: "clean", ico: "clean" };
  }
  /* 23.9 — דיווח קיים: בקטגוריה המאוחדת הכותרת מכריעה בין דשא לטיפה. */
  function catOfR(r) {
    var c = catOf(r && r.category);
    if ((c.key === "lawn" || c.key === "water") && CBA.gardenLang && CBA.gardenLang.lawnOrWater) {
      return CBA.gardenLang.lawnOrWater(r && r.title);
    }
    return c;
  }

  /* 23.9 — אותו סט Lucide כמו gardenTasks.js (הדשא נשאר המקורי). */
  var ICONS = {
    leaf: '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    lawn: '<path d="M3 20h18"/><path d="M6 20c0-4 1-6 2-8M11 20c0-5 1-8 1-11M16 20c0-4 1-6 2-8"/>',
    lawnwater: '<g transform="translate(0 2) scale(.86)"><path d="M3 20h18"/><path d="M6 20c0-4 1-6 2-8M11 20c0-5 1-8 1-11M16 20c0-4 1-6 2-8"/></g><path transform="translate(14.2 .4) scale(.42)" stroke-width="2" style="fill:var(--c-water,#52AED6);stroke:var(--c-water,#52AED6)" d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    water: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>',
    tree: '<path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.04a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z"/><path d="M12 19v3"/>',
    prune: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    weed: '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
    clean: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    bed: '<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/><circle cx="12" cy="8" r="2"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    trash: '<path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    list: '<path d="M13 5h8"/><path d="M13 12h8"/><path d="M13 19h8"/><path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/>',
    back: '<path d="M15 18l-6-6 6-6"/>'
  };
  function ico(n, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || "") + '</svg>';
  }

  function moduleHead(title, sub, rightHTML) {
    return '<div class="gd-head">' +
      '<span class="gd-head__em">' + ico("leaf") + '</span>' +
      '<div class="gd-head__t"><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div>' +
      (rightHTML || "") + '</div>';
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getDate() + "." + (d.getMonth() + 1);
  }

  /* ==========================================================================
   *  🔴 ממצא 32 — "מה קרה עם הדיווח"   (2026-09-22)
   * --------------------------------------------------------------------------
   *  עד היום התושב ראה שני אירועים בלבד — פתיחה וסגירה — וכל מה
   *  שביניהם (שיבוץ, דחייה לשבוע אחר, ביטול, עדכון מהצוות) קרה
   *  בשקט מוחלט. מבחינת מי שדיווח לפני שבועיים, המסך אמר בדיוק
   *  מה שהוא אמר ביום הראשון.
   *
   *  🔑 **המילון הזה הוא הגבול, לא עיצוב.** מה שאינו כאן אינו מוצג
   *  לתושב: "חסימה" ו"דגל" הן פעולות פנימיות של הצוות (הכרעת יועד,
   *  22.9), ו"איחוד" נושאת מזהי משימות פנימיים ויש לה כרטיס ומייל
   *  משלה.
   *
   *  ⚠️ **ההערה הגולמית אינה מוצגת כמות שהיא.** שורת "שיבוץ" נכתבת
   *     כ-`2026-09-20 ← 2026-09-27` — מחרוזת פנימית. מוציאים ממנה
   *     את השבוע, ומה שנשאר אחרי הסרת התאריכים הוא הטקסט החופשי.
   * ======================================================================== */
  var TL_KINDS = {
    "נפתח":        { t: "הדיווח התקבל",         i: "plus" },
    "שיבוץ":       { t: "נכנס לתוכנית העבודה",  i: "clock", w: 1, n: 1 },
    "גרירה":       { t: "הטיפול נדחה",           i: "clock", w: 1, n: 1 },
    "הערה":        { t: "עדכון מהצוות",          i: "list",  n: 1 },
    "החזרה":       { t: "הוחזר לצוות להשלמה",    i: "back",  n: 1 },
    "ביטול ביצוע": { t: "הטיפול נפתח מחדש",      i: "back" },
    "ביצוע":       { t: "סומן כבוצע",            i: "check" },
    "סגירה":       { t: "הטיפול הסתיים",         i: "check" },
    "משוב":        { t: "שלחת משוב",             i: "send",  n: 1 }
  };

  /* השבוע החדש הוא מה שאחרי החץ. נפילה לאחור לתאריך הראשון
     שנמצא — שורה שנכתבה ידנית בגיליון לא אמורה לרוקן את השורה. */
  function tlWeek(note) {
    var t = String(note || "");
    var after = t.indexOf("←") >= 0 ? t.slice(t.indexOf("←") + 1) : t;
    var m = after.match(/(\d{4})-(\d{2})-(\d{2})/) || t.match(/(\d{4})-(\d{2})-(\d{2})/);
    return m ? (Number(m[3]) + "." + Number(m[2])) : "";
  }

  function tlText(row, k) {
    var note = String(row.note || "").trim();
    var out = [];
    if (k.w) {
      var wk = tlWeek(note);
      if (wk) out.push("שבוע " + wk);
      note = note.replace(/(\d{4})-(\d{2})-(\d{2})/g, "").replace(/←/g, "")
                 .replace(/^[\s—–-]+/, "").replace(/[\s—–-]+$/, "").trim();
    }
    if (k.n && note) out.push(note);
    return out.join(" · ");
  }

  function tlDate(v) {
    if (!v) return "";
    var d = (v && typeof v.toDate === "function") ? v.toDate() : new Date(v);
    if (!d || isNaN(d.getTime())) return "";
    return d.getDate() + "." + (d.getMonth() + 1);
  }

  /* מטא (קטגוריות/אזורים) נטען פעם אחת ונשמר — הוא כמעט לא משתנה, ואין
     סיבה לבקש אותו מהשרת בכל מעבר בין שני המסכים. */
  var META = null;
  function withMeta(cb) {
    if (META) return cb(META);
    CBA.data.getGardenMeta(function (res) {
      /* ⚠️ שומרים במטמון **רק הצלחה** (2026-09-09). קודם גם כישלון נשמר,
         ולכן נפילת רשת אחת נעלה את המסך על רשימת קטגוריות ריקה עד רענון
         מלא של הדף — כולל שדה חובה שאין בו מה לבחור. */
      if (res && res.ok) { META = res; return cb(META); }
      cb({ categories: [], areas: [], photoMax: 8, failed: true });
    });
  }

  /* ==========================================================================
   *  מסך 1 — הדיווחים שלי
   * ======================================================================== */
  CBA.screens.resGarden = {
    render: function (container) {
      // .gd-screen עוטף כדי שהרקע האמביינטי (::before) יהיה מתחת לתוכן —
      // בלעדיו הזכוכית על הכרטיסים לא מראה כלום. ר' css/garden.css.
      container.innerHTML = '<div class="gd-screen">' +
        moduleHead("מראה שיכון", "הדיווחים שלך על הגינון, ומה קרה איתם",
          '<button type="button" class="gd-newbtn" id="gd-new">' + ico("plus") + ' דיווח חדש</button>') +
        '<div id="gd-list">' + (CBA.skel ? CBA.skel.cards(4) : "") + '</div>' +
      '</div>';

      container.querySelector("#gd-new").addEventListener("click", function () {
        CBA.navigate("resGardenNew");
      });

      var listEl = container.querySelector("#gd-list");
      var all = [], filter = "all", loadErr = false;
      /* ממצא 32 — קו הזמן. `logErr` נפרד מ-`loadErr`: כשל בטעינת
         היומן אינו מוחק את הדיווחים מהמסך, הוא רק מחליף את הבלוק
         בשורה שאומרת שלא הצלחנו. */
      var logRows = [], logErr = false;

      function counts() {
        var open = 0, wait = 0, done = 0;
        all.forEach(function (r) {
          if (r.stage === "הושלם") done++;
          else { open++; if (r.flag === "ממתין לאישור") wait++; }
        });
        return { open: open, wait: wait, done: done };
      }

      function draw() {
        if (loadErr) {
          listEl.innerHTML = CBA.ui.emptyState({
            title: "לא הצלחנו לטעון את הדיווחים",
            sub: "זו תקלת תקשורת, לא מחיקה — הדיווחים שלך שמורים.",
            ctaLabel: "לנסות שוב", ctaAttr: 'id="gd-retry"'
          });
          var rb = listEl.querySelector("#gd-retry");
          if (rb) rb.addEventListener("click", function () {
            listEl.innerHTML = CBA.skel ? CBA.skel.cards(4) : "";
            load();
          });
          return;
        }
        if (!all.length) {
          listEl.innerHTML = CBA.ui.emptyState({
            title: "עדיין לא דיווחת על כלום",
            sub: "אם משהו בגינון לא נראה תקין — צילום, נקודה על המפה, וזהו.",
            ctaLabel: "לדיווח הראשון", ctaAttr: 'id="gd-empty-cta"'
          });
          var c = listEl.querySelector("#gd-empty-cta");
          if (c) c.addEventListener("click", function () { CBA.navigate("resGardenNew"); });
          return;
        }
        var n = counts();
        var shown = all.filter(function (r) {
          if (filter === "open") return r.stage !== "הושלם";
          if (filter === "done") return r.stage === "הושלם";
          return true;
        });

        listEl.innerHTML =
          '<div class="gd-stats">' +
            /* ⚠️ התוויות כאן חייבות להסכים עם מה שכתוב על הכרטיס ועל הסינון
               (2026-09-09). "בטיפול" ספר גם דיווחים שאיש עוד לא נגע בהם,
               בזמן שהכרטיס שמתחתיו אמר "התקבל"; ו"ממתין לאישור" בניסוח הגולמי
               נקרא כאילו הדיווח לא אושר, כשהכוונה הפוכה — העבודה כבר בוצעה. */
            statTile("open", "clock", n.open, "פתוחים") +
            statTile("wait", "list", n.wait, "בוצע, לאישור") +
            statTile("done", "check", n.done, "הושלמו") +
          '</div>' +
          '<div class="gd-seg" role="tablist">' +
            segBtn("all", "הכול", all.length) +
            segBtn("open", "פתוחים", n.open) +
            segBtn("done", "הושלמו", n.done) +
          '</div>' +
          (shown.length
            ? '<div class="gd-reps">' + shown.map(card).join("") + '</div>'
            /* סינון שאין בו כלום הציג אזור ריק בלי מילה — ר' הצוות האדום. */
            : '<div class="gd-none">' +
                (filter === "done" ? "עוד לא הושלם אף דיווח."
                                   : "אין דיווחים פתוחים. הכול טופל.") +
              '</div>');

        Array.prototype.forEach.call(listEl.querySelectorAll(".gd-seg button"), function (b) {
          b.addEventListener("click", function () { filter = b.dataset.f; draw(); });
        });
        Array.prototype.forEach.call(listEl.querySelectorAll("[data-fb]"), function (b) {
          b.addEventListener("click", function () { sendFeedback(b.dataset.id, b.dataset.fb === "y"); });
        });
        Array.prototype.forEach.call(listEl.querySelectorAll("[data-del]"), function (b) {
          b.addEventListener("click", function () {
            var rep = all.filter(function (x) { return String(x.id) === String(b.dataset.del); })[0];
            askDelete(b.dataset.del, rep && rep.taskId);
          });
        });
        // התמונות שהתושב עצמו צירף (PHASE 4.2) — ר' js/ui/photos.js
        Array.prototype.forEach.call(listEl.querySelectorAll("[data-photos]"), function (b) {
          b.addEventListener("click", function () {
            var rep = all.filter(function (x) { return String(x.id) === String(b.dataset.photos); })[0];
            if (rep && CBA.photos) CBA.photos.open(rep.photos, "התמונות שצירפת לדיווח #" + rep.id);
          });
        });
        /* 🔴 השלמת תמונות — ר' renderCompletePhotos. התמונות עצמן
           כבר לא בזיכרון בשלב הזה, ולכן המסך יבקש לבחור אותן שוב. */
        Array.prototype.forEach.call(listEl.querySelectorAll("[data-complete]"), function (b) {
          b.addEventListener("click", function () {
            CBA.navigate("resGardenNew", {
              completeFor: b.dataset.complete, taskId: b.dataset.task, photos: []
            });
          });
        });
      }

      function statTile(kind, iconName, num, label) {
        return '<div class="gd-stat is-' + kind + '"><u>' + ico(iconName) + '</u>' +
          '<div><b>' + num + '</b><span>' + esc(label) + '</span></div></div>';
      }
      function segBtn(k, label, n) {
        return '<button type="button" data-f="' + k + '"' +
          (filter === k ? ' class="on"' : '') + '>' + esc(label) + ' · ' + n + '</button>';
      }

      function card(r) {
        var c = catOfR(r);
        var idx = stageIdx(r.stage);
        var done = r.stage === "הושלם";
        /* 🔴 2026-09-14 — שני תיקונים, ושניהם נמדדו בהרמס.
           (א) דיווח שנסגר **בלי שבוצעה עבודה** הציג "הושלם" מעל מסלול נקודות
               ירוק ומלא, ומיד מתחתיו "לא נפתח טיפול · בוטל" — שתי אמירות
               סותרות באותו כרטיס. המילון המשותף (גל 1) כבר יודע להכריע; הוא
               פשוט לא חובר לכאן.
           ⚠️ (ב) אבל **רק על דיווח סגור**. `L.state` נכתב לאובייקט *משימה*,
               ובדיקה 9 שלו היא `if (!t.week)`. הדיווח שהשרת שולח לתושב לא
               מכיל `week` כלל, ולכן שימוש גורף הפך כל דיווח פתוח ל"התקבל,
               ממתין לשיבוץ" — גם כשהוא "בטיפול". נמדד: #39 בשלב "בטיפול"
               הציג "ממתין לשיבוץ". לדיווח פתוח סולם 5 השלבים של התושב הוא
               הניסוח הנכון, והוא גם מה שהנקודות מציירות.
           ⚠️ (ג) "אוחד" מוחרג — לזה יש כבר בלוק משלו מתחת, ו-L.state היה
               אומר את אותו משפט פעם שנייה. */
        var shut = !!(r.closure && r.closure !== "בוצע" && !r.mergedInto);
        var st = (r.closure && !r.mergedInto && CBA.gardenLang && CBA.gardenLang.state)
          ? CBA.gardenLang.state(r, "resident")
          : { text: r.stage, tone: "" };
        /* ⚠️ עד 9.9 התנאי היה i < idx בלבד, כלומר **השלב הנוכחי לא הודלק**:
           דיווח חדש בשלב "התקבל" הציג חמש נקודות ריקות, בדיוק ברגע שבו התושב
           הכי צריך לראות שמשהו קרה. עכשיו: מה שמאחור מלא, הנוכחי מודגש. */
        var dots = "";
        for (var i = 0; i < 5; i++) {
          var cls = i < idx ? "on" : (i === idx ? (done ? (shut ? "shut" : "done") : "now") : "");
          dots += '<i class="' + cls + '"></i>';
        }
        var flagTxt = r.flag ? flagText(r.flag) : "";
        var crit = r.flag === "דורש בדיקה חוזרת";
        return '<article class="gd-rep k-' + c.key + '">' +
          /* ⚠️ 2026-09-09 — כאן ישב ריבוע עם גרדיאנט ירוק ותכונת data-photo
             שאיש לא קרא אף פעם, ומי שצירף שמונה תמונות ראה בדיוק את אותו
             ריבוע כמו מי שלא צירף כלום.
             ✅ 2026-09-14 (PHASE 4.2) — התמונות סוף-סוף ניתנות לצפייה:
             הקבצים נשארים פרטיים ב-Drive והשרת מגיש אותם אחרי בדיקת הרשאה
             (action=gardenPhoto). האריח עם המונה הוא עכשיו **כפתור**. */
          (r.photos && r.photos.length
            ? '<button type="button" class="gd-rep__th gd-rep__th--btn" data-photos="' + esc(r.id) + '" ' +
                'title="צפייה ב-' + r.photos.length + ' תמונות שצירפת" ' +
                'aria-label="צפייה בתמונות שצירפת לדיווח">' + ico(c.ico) +
                '<b class="gd-rep__ph">' + r.photos.length + '</b>' +
              '</button>'
            : '<span class="gd-rep__th">' + ico(c.ico) + '</span>') +
          '<div class="gd-rep__b">' +
            /* 🔴 **תמונה שלא עלתה מקבלת שורה משלה, לא היעלמות**
               (2026-09-16). זו הדרך של מי שסגר את האפליקציה באמצע
               לגלות שחסר משהו — ולחזור להשלים בלחיצה. */
            (r.photosIncomplete
              ? '<button type="button" class="gd-rep__warn" data-complete="' + esc(r.id) +
                  '" data-task="' + esc(r.taskId || "") + '">' +
                  'חסרות תמונות בדיווח הזה · להשלמה' +
                '</button>'
              : '') +
            '<div class="gd-rep__top">' +
              '<span class="gd-rep__id">#' + esc(r.id) + '</span>' +
              '<span class="gd-kchip">' + ico(c.ico) + esc(r.category) + '</span>' +
              /* ⚠️ מחיקה מוצעת **רק כל עוד איש לא נגע** — עדיין "התקבל",
                 בלי דגל ובלי איחוד. ברגע שהצוות שיבץ או סימן משהו, יש כבר
                 עבודה מאחורי הדיווח וזה כבר לא "טעות בהקלדה"; השרת אוכף את
                 אותו תנאי בעצמו (gardenReportDelete_), וזה כאן רק כדי לא
                 להציע כפתור שייתן שגיאה. */
              (r.stage === "התקבל" && !r.flag && !r.mergedInto && !r.closure
                ? '<button type="button" class="gd-rep__del" data-del="' + esc(r.id) + '" ' +
                  'aria-label="מחיקת הדיווח">' + ico("trash") + '</button>'
                : '') +
            '</div>' +
            /* ⚠️ הנפילה־לאחור הייתה לשם הקטגוריה — בדיוק מה שכתוב בתג שורה
               מעל. דיווח בלי תיאור הציג "השקיה / ממטרות" פעמיים ולא אמר כלום.
               עכשיו: תיאור, ואם אין — המיקום, ואם גם אין — מספר הדיווח.
               וכשהמיקום עלה לכותרת הוא יורד משורת המטא, כדי לא לחזור עליו. */
            '<div class="gd-rep__t">' +
              esc(r.title || r.desc || r.place || r.area || ("דיווח #" + r.id)) + '</div>' +
            '<div class="gd-rep__m">' +
              (r.desc
                ? (r.place ? esc(r.place) + " · " : (r.area ? esc(r.area) + " · " : ""))
                : "") +
              'דווח ב-' + fmtDate(r.date) + '</div>' +
            '<div class="gd-axis' + (done && !shut ? " is-done" : "") +
              (shut ? " is-shut" : "") + '">' +
              '<span class="gd-track">' + dots + '</span>' +
              '<b>' + esc(st.text) + '</b>' +
              (flagTxt ? '<span class="gd-flag' + (crit ? " is-crit" : "") + '">' + esc(flagTxt) + '</span>' : '') +
            '</div>' +
            (r.mergedInto
              /* "פנייה" נמחק מהמילון — יש שם אחד, "דיווח". */
              ? '<div class="gd-rep__merged">אוחד עם דיווח #' + esc(r.mergedInto) +
                (r.closure ? ' · נסגר: ' + esc(r.closure) : '') + '</div>'
              /* סגירה בלי ביצוע: מציגים את **ההסבר שהמנהל כתב** ולא רק את
                 המילה "בוטל". זה בדיוק אותו טקסט שנשלח לתושב במייל
                 (GARDEN_REPORT_DECLINED), וכך המייל והאפליקציה לא סותרים.
                 שם הסגירה נשאר כתווית קטנה — הוא הקטגוריה, לא התשובה. */
              /* 🔴 2026-09-14 — החצי החסר של רשת הביטחון.
                 מגל 3 הגנן סוגר דיווח תושב **לבד**, ומה שהחליף את אישור
                 המנהל הוא שהתושב יכול לומר "לא הושלם". בשביל זה הוא חויב
                 לכתוב "מה נעשה", והמשפט הזה נשלח במייל — אבל **באפליקציה
                 הוא לא הוצג מעולם**: הבלוק הזה רץ רק כש-closure שונה מ"בוצע",
                 כלומר רק על סגירה בלי טיפול. התוצאה: התושב נשאל "הטיפול היה
                 בסדר?" מעל המילה "הושלם" ותו לא — מתבקש לשפוט עבודה בלי
                 שנאמר לו מה נעשה בה. */
              : (done && r.closure === "בוצע" && r.closeWhy
                  ? '<div class="gd-rep__done">' +
                    '<b>מה נעשה</b>' +
                    '<span>' + esc(r.closeWhy) + '</span>' +
                    '</div>'
              : (done && r.closure && r.closure !== "בוצע"
                  /* ⚠️ הכותרת ירדה מכאן: מאז שהציר מציג את משפט המצב
                     ("לא נפתח טיפול · בוטל") היא נאמרה פעמיים באותו כרטיס.
                     נשאר רק ההסבר — שהוא הדבר היחיד שהציר לא יכול לומר. */
                  ? (r.closeWhy
                      ? '<div class="gd-rep__closed"><span>' +
                        esc(r.closeWhy) + '</span></div>' : '')
                  : ''))) +
            timeline(r) +
            /* ⚠️ 2026-09-09 — קודם השאלה הוצגה גם על דיווח שנסגר בלי טיפול
               ("לא נפתח טיפול · בוטל"), כלומר ביקשנו מהתושב לדרג עבודה שלא
               נעשתה. משוב הוא על ביצוע; סגירה בלי ביצוע היא החלטה, ואם היא
               לא ברורה — מקומה בשיחה, לא בכפתור "לא הושלם". */
            ((r.canFeedback && (!r.closure || r.closure === "בוצע"))
              ? '<div class="gd-fb"><span>הטיפול היה בסדר?</span>' +
                '<button type="button" class="y" data-fb="y" data-id="' + esc(r.id) + '">כן, תודה</button>' +
                '<button type="button" class="n" data-fb="n" data-id="' + esc(r.id) + '">לא הושלם</button></div>'
              : (r.feedback ? '<div class="gd-rep__merged">המשוב שלך: ' + esc(r.feedback) + '</div>' : '')) +
          '</div></article>';
      }

      /* 🔴 ממצא 32 — קו הזמן של הדיווח, בשפה של מי שדיווח.
         ⚠️ **מתחת לשתי שורות לא מציגים כלום.** שורה אחת היא תמיד
            "הדיווח התקבל", וזה כבר כתוב בכרטיס ("דווח ב-..."). קו
            זמן של פריט אחד הוא רעש, לא מידע. */
      /* 🔴 22.9 (בקשת יועד) — מי מהצוות עשה את זה: "<שם> · גנן" או
         "מנהל גינון". שורות של התושב עצמו — בלי חותם (זה הוא). */
      function tlWho(x) {
        if (!x || x.role === "תושב" || !CBA.data.gardenLogWho) return "";
        var w = CBA.data.gardenLogWho(x);
        return w ? " · " + esc(w) : "";
      }
      function timeline(r) {
        var tid = String(r.taskId || "").trim();
        if (!tid) return "";
        if (logErr) {
          return '<div class="gd-tl gd-tl--err">לא הצלחנו לטעון את העדכונים.</div>';
        }
        var rows = logRows.filter(function (x) {
          return String(x.taskId || "") === tid && TL_KINDS[String(x.kind || "")];
        });
        if (rows.length < 2) return "";
        var last = TL_KINDS[String(rows[rows.length - 1].kind || "")];
        return '<details class="gd-tl"><summary>' +
            '<span>מה קרה עם הדיווח</span><b>' + esc(last.t) + '</b>' +
          '</summary>' +
          rows.map(function (x) {
            var k = TL_KINDS[String(x.kind || "")];
            var extra = tlText(x, k);
            return '<div class="gd-tl__r">' + ico(k.i) +
              '<div><b>' + esc(k.t) + '</b>' +
              (extra ? '<span>' + esc(extra) + '</span>' : '') +
              '<em>' + esc(tlDate(x.at)) + tlWho(x) + '</em></div></div>';
          }).join("") +
        '</details>';
      }

      /* מחיקת דיווח על ידי מי שכתב אותו. הטקסט אומר במפורש מה יורד ומה
         נשאר — התמונות יורדות איתו, וזה לא מובן מאליו. */
      function askDelete(id, taskId) {
        CBA.ui.confirm(
          "הדיווח והתמונות שצירפת יימחקו, ולא נטפל בו. אי אפשר לבטל את זה.",
          { title: "מחיקת דיווח #" + id, okText: "מחיקה", danger: true }
        ).then(function (yes) {
          if (!yes) return;
          CBA.data.gardenReportDelete(id, taskId, function (res) {
            if (!res || !res.ok) {
              return CBA.ui.alert((res && res.error) || "הדיווח לא נמחק");
            }
            CBA.ui.toast("הדיווח נמחק");
            load();
          });
        });
      }

      function sendFeedback(id, positive) {
        function done(note) {
          CBA.data.gardenFeedback(id, positive, note || "", function (res) {
            if (!res || !res.ok) {
              CBA.ui.alert((res && res.error) || "לא הצלחנו לשמור את המשוב");
              return;
            }
            CBA.ui.toast(positive ? "תודה!" : "המשוב נשלח לוועד");
            load();
          });
        }
        if (positive) return done("");
        // CBA.ui.prompt מחזירה Promise (null בביטול), לא מקבלת callback
        CBA.ui.prompt("המשוב עובר למנהל הגינון, והתקלה תיבדק שוב.", {
          title: "מה לא הושלם?",
          placeholder: "למשל: הענף הוסר אבל הגזם נשאר על השביל",
          okText: "שליחת משוב"
        }).then(function (txt) { if (txt !== null) done(txt); });
      }

      function load() {
        /* 🔴 **שתי השאילתות יוצאות יחד ולא בזו אחר זו** (ממצא 32).
           שתיהן שאילתות שוויון ל-Firestore באותו חיבור; סדרתי היה
           מכפיל את זמן הנחיתה של המסך בשביל בלוק משני. */
        var gotReports = false, gotLog = false;
        function maybeDraw() { if (gotReports && gotLog) draw(); }

        CBA.data.getMyGardenReports(function (res) {
          /* ⚠️ כשל רשת אינו "אין דיווחים" (2026-09-09). קודם שניהם הובילו
             לאותו מסך — "עדיין לא דיווחת על כלום" — ותושב שדיווח אתמול על
             עץ שנפל ראה שהמערכת שכחה אותו. */
          loadErr = !(res && res.ok);
          all = loadErr ? [] : (res.rows || []).map(normRep);
          gotReports = true;
          maybeDraw();
        });

        if (CBA.data.getMyGardenLog) {
          CBA.data.getMyGardenLog(function (res) {
            logErr = !(res && res.ok);
            logRows = (res && res.rows) || [];
            gotLog = true;
            maybeDraw();
          });
        } else {
          /* לקוח ישן במטמון — הכרטיס פשוט לא מציג קו זמן. */
          logErr = false; logRows = []; gotLog = true;
        }
      }
      withMeta(function () { load(); });
    }
  };

  /* ==========================================================================
   *  מסך 2 — דיווח חדש
   * ======================================================================== */
  /* ==========================================================================
   *  🔴 השלמת תמונות לדיווח שכבר הוגש   (2026-09-16)
   * --------------------------------------------------------------------------
   *  בקשת יועד, במילים שלו: *"כאשר זה נכשל אני רוצה שזה יפנה את
   *  האדם לטופס עצמו שכבר הגיש עם הפרטים שמולאו כדי להשלים את
   *  החלק שנכשל של התמונות."*
   *
   *  ⚠️ **הפרטים מוצגים ואינם ניתנים לעריכה, וזה מכוון.** הדיווח
   *     כבר הוגש והצוות אולי כבר ראה אותו; "טופס מלא" שאפשר לשנות
   *     בו את התיאור היה עריכה רטרואקטיבית במסווה של השלמה.
   *     כלל האבטחה אוכף בדיוק את זה (`grPhotosOk` — photos בלבד),
   *     כך שגם אם המסך היה מאפשר, השרת היה מסרב.
   *
   *  ⚠️ **התמונות שנכשלו עדיין בזיכרון** כשמגיעים לכאן מיד אחרי
   *     ההגשה — ואז ההשלמה היא לחיצה אחת. מי שהגיע מהבאנר אחרי
   *     שסגר את האפליקציה יבחר אותן מחדש; אין דרך לשמור אותן,
   *     ור' ההסבר על Background Sync.
   * ======================================================================== */
  function renderCompletePhotos(container, opts) {
    var repId = String(opts.completeFor);
    var taskId = opts.taskId ? String(opts.taskId) : "";
    var pending = (opts.photos || []).slice();
    var busy = false;

    function draw(rep) {
      var det = rep ? ('<div class="gd-card">' +
            '<p class="gd-lbl">הדיווח שהוגש</p>' +
            '<p><b>' + esc(rep.title || "") + '</b></p>' +
            '<p class="gd-muted">' + esc(rep.category || "") +
              (rep.place ? " · " + esc(rep.place) : "") + '</p>' +
            (rep.desc ? '<p>' + esc(rep.desc) + '</p>' : '') +
          '</div>') : '';
      container.innerHTML = '<div class="gd-screen">' +
        moduleHead("השלמת תמונות · דיווח " + esc(repId),
          "הדיווח נשמר. חסרות בו תמונות שלא הצליחו לעלות.",
          '<button type="button" class="gd-backbtn" id="gd-back">' + ico("back") +
          ' לדיווחים שלי</button>') +
        det +
        '<div class="gd-card">' +
          '<p class="gd-lbl">התמונות שלא עלו</p>' +
          '<div id="gd-thumbs2" class="gd-thumbs"></div>' +
          '<input type="file" id="gd-file2" accept="image/*" multiple hidden>' +
          '<button type="button" class="gd-btn2" id="gd-add2">הוספת תמונה</button>' +
          '<div id="gd-prog2" class="gd-progress" hidden></div>' +
          '<button type="button" class="gd-send" id="gd-up2">העלאת התמונות</button>' +
        '</div></div>';

      container.querySelector("#gd-back")
        .addEventListener("click", function () { CBA.navigate("resGarden"); });

      var thumbs = container.querySelector("#gd-thumbs2");
      function paint() {
        thumbs.innerHTML = "";
        pending.forEach(function (p, i) {
          var el = document.createElement("span");
          el.className = "gd-th";
          el.style.backgroundImage = "url(data:" + p.mime + ";base64," + p.data + ")";
          el.innerHTML = '<button type="button" class="th-x" aria-label="הסרת התמונה">✕</button>';
          el.querySelector(".th-x").addEventListener("click", function () {
            pending.splice(i, 1); paint();
          });
          thumbs.appendChild(el);
        });
        container.querySelector("#gd-up2").disabled = !pending.length || busy;
      }
      paint();

      var fileEl = container.querySelector("#gd-file2");
      container.querySelector("#gd-add2")
        .addEventListener("click", function () { fileEl.click(); });
      fileEl.addEventListener("change", function () {
        Array.prototype.slice.call(fileEl.files || []).forEach(function (f) {
          compressImage(f, function (dataUrl) {
            if (!dataUrl) return;
            var comma = dataUrl.indexOf(",");
            if (comma < 0) return;
            var mime = (dataUrl.substring(0, comma).match(/data:([^;]+)/) || [])[1] ||
                       f.type || "image/jpeg";
            pending.push({ name: String(f.name || "photo"), mime: mime,
                           data: dataUrl.substring(comma + 1) });
            paint();
          });
        });
        fileEl.value = "";
      });

      container.querySelector("#gd-up2").addEventListener("click", function () {
        if (!pending.length || busy) return;
        busy = true; paint();
        var prog = container.querySelector("#gd-prog2");
        prog.hidden = false;
        prog.textContent = "מעלה…";
        CBA.data.gardenCompletePhotos(repId, taskId, pending, function (res) {
          busy = false;
          if (res && res.ok && !res.failed) {
            CBA.ui.toast("התמונות הועלו");
            return CBA.navigate("resGarden");
          }
          prog.textContent = "";
          prog.hidden = true;
          paint();
          CBA.ui.alert(res && res.failed
            ? "חלק מהתמונות עדיין לא עלו. אפשר לנסות שוב."
            : "ההעלאה נכשלה. אפשר לנסות שוב.");
        }, function (pct, n, total) {
          /* ⚠️ בלי אחוזים (17.9) — ההעלאה מקבילה ואין "תמונה 2 מתוך 3".
             כאן התושב כן ממתין, ולכן נשאר משפט אחד שאומר שזה רץ. */
          prog.textContent = total > 1 ? ("מעלה " + total + " תמונות…") : "מעלה…";
        });
      });
    }

    /* הפרטים נקראים מהמסמך עצמו ולא נשמרים בלקוח — מקור אחד. */
    if (CBA.fb && CBA.fb.readDoc) {
      CBA.fb.readDoc("gardenReports", repId, function (e, doc) { draw(doc || null); });
    } else {
      draw(null);
    }
  }

  CBA.screens.resGardenNew = {
    render: function (container, opts) {
      /* 🔴 מצב השלמת תמונות — ר' הבלוק מעל renderCompletePhotos. */
      if (opts && opts.completeFor) return renderCompletePhotos(container, opts);
      var WORD_MAX = 75;
      var state = { cat: "", x: null, y: null, area: "", photos: [], clientRef: newRef() };
      var user = (window.CBA && CBA.user) || {};

      /* ⚠️ 2026-09-09 — עד היום הטופס לא צייר כלום עד ש-getGardenMeta חזר,
         ולכן הכניסה הראשונה הייתה מסך לבן של כשנייה וחצי (קריאה ל-Apps
         Script עולה ~1.5ש' מינימום — ר' זיכרון הביצועים). */
      container.innerHTML = '<div class="gd-screen">' +
        moduleHead("דיווח חדש", "מגיע ישירות לצוות הגינון · שיכון פלמחים", "") +
        (CBA.skel ? CBA.skel.cards(3) : "") + '</div>';

      withMeta(function (meta) {
        var cats = (meta.categories || []);
        var photoMax = meta.photoMax || 8;

        /* רשימת קטגוריות ריקה = הטופס אינו שמיש (הקטגוריה היא שדה חובה).
           עדיף לומר את זה מראש מאשר לתת ללחוץ "שליחה" ולקבל "צריך לבחור
           קטגוריה" על שדה שאין בו מה לבחור. */
        if (!cats.length) {
          container.innerHTML = '<div class="gd-screen">' +
            moduleHead("דיווח חדש", "מגיע ישירות לצוות הגינון · שיכון פלמחים",
              '<button type="button" class="gd-backbtn" id="gd-back">' + ico("back") +
              ' לדיווחים שלי</button>') +
            CBA.ui.emptyState({
              title: "לא הצלחנו לטעון את הטופס",
              sub: "זו תקלת תקשורת. אפשר לנסות שוב בעוד רגע.",
              ctaLabel: "לנסות שוב", ctaAttr: 'id="gd-retry"'
            }) + '</div>';
          var bk = container.querySelector("#gd-back");
          if (bk) bk.addEventListener("click", function () { CBA.navigate("resGarden"); });
          var rt = container.querySelector("#gd-retry");
          if (rt) rt.addEventListener("click", function () {
            CBA.screens.resGardenNew.render(container);
          });
          return;
        }

        container.innerHTML = '<div class="gd-screen">' +
          moduleHead("דיווח חדש", "מגיע ישירות לצוות הגינון · שיכון פלמחים",
            '<button type="button" class="gd-backbtn" id="gd-back">' + ico("back") + ' לדיווחים שלי</button>') +
          '<div class="gd-cols">' +
            '<div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">מה הבעיה? <s>*</s></p>' +
                '<div class="gd-cats" id="gd-cats">' +
                  cats.map(function (c) {
                    var k = catOf(c);
                    return '<button type="button" class="gd-cat k-' + k.key + '" data-c="' + esc(c) + '">' +
                      '<u>' + ico(k.ico) + '</u>' + esc(c) + '</button>';
                  }).join("") +
                '</div>' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">כותרת קצרה <s>*</s></p>' +
                '<div class="gd-tpicks" id="gd-tpicks"><span class="gd-tpicks__hint">בחרו קטגוריה כדי לראות הצעות</span></div>' +
                '<input class="gd-inp" id="gd-title" maxlength="60" placeholder="למשל: ראש ממטרה שבור">' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">תיאור <em id="gd-wc">0 / ' + WORD_MAX + ' מילים</em></p>' +
                '<textarea class="gd-inp gd-ta" id="gd-desc" rows="3" ' +
                  'placeholder="מה קרה ואיפה בדיוק? כמה משפטים מספיקים."></textarea>' +
                '<div class="gd-meter"><i id="gd-meter"></i></div>' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">תמונות <em><span id="gd-pc">0</span> / ' + photoMax + '</em></p>' +
                '<div class="gd-thumbs" id="gd-thumbs">' +
                  '<button type="button" class="gd-th add" id="gd-add">+</button>' +
                '</div>' +
                '<input type="file" id="gd-file" accept="image/*" multiple hidden>' +
              '</div>' +
              '<div class="gd-card">' +
                // בלי "מולא אוטומטית": השם והבית אכן מגיעים מהמושב, אבל הטלפון
                // **אינו** חלק מתשובת ההתחברות — ותווית שמבטיחה מילוי אוטומטי
                // ליד שדה ריק היא שקר קטן בממשק.
                '<p class="gd-lbl">הפרטים שלך</p>' +
                '<div class="gd-row2">' +
                  '<div class="gd-inp is-ro">' +
                    esc(((user.firstName || "") + " " + (user.family || "")).trim() || "—") +
                    (user.house ? " · בית " + esc(user.house) : "") + '</div>' +
                  '<input class="gd-inp" id="gd-phone" inputmode="tel" placeholder="טלפון לחזרה (לא חובה)" ' +
                    'value="' + esc(user.phone || "") + '">' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">איפה זה? <s>*</s> <em>לחצו על המפה</em></p>' +
                '<div class="gd-map" id="gd-map"></div>' +
                '<p class="gd-hint" id="gd-loc">לא צריך דיוק — מספיק לסמן ליד איזה בית זה.</p>' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">מיקום במילים <em>לא חובה</em></p>' +
                '<input class="gd-inp" id="gd-place" placeholder="למשל: על השביל בין 341 ל-343">' +
              '</div>' +
              '<button type="button" class="gd-cta" id="gd-send">' + ico("send") + ' שליחת דיווח</button>' +
            '</div>' +
          '</div>' +
        '</div>';

        container.querySelector("#gd-back").addEventListener("click", function () {
          CBA.navigate("resGarden");
        });

        // ---- קטגוריה ----
        var titleInput = container.querySelector("#gd-title");
        var tpicksEl = container.querySelector("#gd-tpicks");
        function renderTitlePicks() {
          var picks = TITLE_PICKS[state.cat] || [];
          tpicksEl.innerHTML = picks.length
            ? picks.map(function (p) {
                /* 23.9 — בקטגוריה המאוחדת כל הצעה מראה אם היא דשא או השקיה. */
                var lw = (catOf(state.cat).key === "lawn" && CBA.gardenLang && CBA.gardenLang.lawnOrWater)
                  ? CBA.gardenLang.lawnOrWater(p) : null;
                return '<button type="button" class="gd-tpick' + (lw ? " k-" + lw.key : "") + '" data-t="' + esc(p) + '">' +
                  (lw ? ico(lw.ico) : "") + esc(p) + '</button>';
              }).join("")
            : '<span class="gd-tpicks__hint">אפשר גם פשוט להקליד למטה</span>';
        }
        container.querySelector("#gd-cats").addEventListener("click", function (e) {
          var b = e.target.closest(".gd-cat");
          if (!b) return;
          Array.prototype.forEach.call(container.querySelectorAll(".gd-cat"), function (x) {
            x.classList.toggle("on", x === b);
          });
          state.cat = b.dataset.c;
          renderTitlePicks();
        });
        tpicksEl.addEventListener("click", function (e) {
          var b = e.target.closest(".gd-tpick");
          if (!b) return;
          titleInput.value = b.dataset.t;
          Array.prototype.forEach.call(tpicksEl.querySelectorAll(".gd-tpick"), function (x) {
            x.classList.toggle("on", x === b);
          });
        });
        titleInput.addEventListener("input", function () {
          Array.prototype.forEach.call(tpicksEl.querySelectorAll(".gd-tpick"), function (x) {
            x.classList.toggle("on", x.dataset.t === titleInput.value);
          });
        });

        // ---- מונה מילים ----
        var descEl = container.querySelector("#gd-desc");
        var wcEl = container.querySelector("#gd-wc");
        var meterEl = container.querySelector("#gd-meter");
        function words(t) { return String(t).trim().split(/\s+/).filter(Boolean); }
        descEl.addEventListener("input", function () {
          var w = words(descEl.value);
          if (w.length > WORD_MAX) {           // חיתוך רך: לא חוסמים הקלדה באמצע מילה
            descEl.value = w.slice(0, WORD_MAX).join(" ");
            w = words(descEl.value);
          }
          wcEl.textContent = w.length + " / " + WORD_MAX + " מילים";
          meterEl.style.width = Math.min(100, (w.length / WORD_MAX) * 100) + "%";
        });

        // ---- תמונות ----
        var fileEl = container.querySelector("#gd-file");
        var thumbsEl = container.querySelector("#gd-thumbs");
        var addBtn = container.querySelector("#gd-add");
        addBtn.addEventListener("click", function () { fileEl.click(); });
        fileEl.addEventListener("change", function () {
          var files = Array.prototype.slice.call(fileEl.files || []);
          files.forEach(function (f) {
            if (state.photos.length >= photoMax) return;
            /* הכיווץ אסינכרוני, וכמה קבצים שנבחרו יחד מסיימים בסדר לא צפוי —
               ולכן המכסה נבדקת *שוב* בתוך ה-callback. (בגרסה הקודמת היא נבדקה
               רק לפני הקריאה, כך שבחירה של 10 קבצים בבת אחת יכלה לעקוף אותה.) */
            compressImage(f, function (dataUrl) {
              if (!dataUrl) return;
              if (state.photos.length >= photoMax) return;
              var comma = dataUrl.indexOf(",");
              if (comma < 0) return;
              var mime = (dataUrl.substring(0, comma).match(/data:([^;]+)/) || [])[1] || f.type || "image/jpeg";
              var name = String(f.name || "photo");
              if (/jpeg/.test(mime)) name = name.replace(/\.[^.]+$/, "") + ".jpg";
              state.photos.push({ name: name, mime: mime, data: dataUrl.substring(comma + 1) });
              drawThumbs(dataUrl);
            });
          });
          fileEl.value = "";
        });
        function drawThumbs(lastUrl) {
          if (lastUrl) {
            var el = document.createElement("span");
            el.className = "gd-th";
            el.style.backgroundImage = "url(" + lastUrl + ")";
            el.innerHTML = '<button type="button" class="th-x" aria-label="הסרת התמונה">✕</button>';
            el.dataset.i = String(state.photos.length - 1);
            el.querySelector(".th-x").addEventListener("click", function () {
              var i = parseInt(el.dataset.i, 10);
              state.photos.splice(i, 1);
              el.remove();
              Array.prototype.forEach.call(thumbsEl.querySelectorAll(".gd-th:not(.add)"), function (t, k) {
                t.dataset.i = String(k);
              });
              sync();
            });
            thumbsEl.insertBefore(el, addBtn);
          }
          sync();
        }
        function sync() {
          container.querySelector("#gd-pc").textContent = state.photos.length;
          addBtn.style.display = state.photos.length >= photoMax ? "none" : "grid";
        }

        // ---- מפה במצב נעיצה ----
        var locEl = container.querySelector("#gd-loc");
        var formMapApi = CBA.map.render(container.querySelector("#gd-map"), {
          head: false, search: false, legend: false, popup: false, pin: true,
          /* הפרמטר השני הוא אזור הגינון שהנעיצה נפלה בו. הוא נשלח עם הדיווח
             כדי שהתקלה תיפתח עם אזור במקום שמישהו יבחר אותו אחר כך — ואם אין
             מצולעים או שהנעיצה נפלה מחוץ לכולם הוא "" והכל ממשיך כרגיל. */
          onPin: function (n, area) {
            state.x = n.x; state.y = n.y; state.area = area || "";
            locEl.textContent = state.area
              ? ("המיקום סומן · " + state.area + ". אפשר ללחוץ שוב כדי להזיז.")
              : "המיקום סומן. אפשר ללחוץ שוב כדי להזיז.";
            locEl.classList.add("is-ok");
          }
        });

        /* ---- שחזור דיווח שנכשל (restore-pending) ----
           התושב בחר "לא עכשיו" אחרי כישלון, וחזר לטופס. משחזרים כאן את מה
           שהקליד במקום לתת לו להתחיל מאפס.
           ⚠️ הקטגוריה משוחזרת ע"י click על הכפתור הקיים ולא ע"י קביעת
              state.cat ידנית — כך גם המצב הוויזואלי (is-on) נשאר נכון, ואם
              הלוגיקה של הבחירה תשתנה מתישהו השחזור ילך אחריה מעצמו.
           ⚠️ הנעיצה על המפה **אינה** מצוירת מחדש (ל-CBA.map אין היום API
              לנעיצה התחלתית), אבל הקואורדינטות עצמן משוחזרות ל-state ויישלחו
              כרגיל. הטקסט אומר את זה במדויק במקום להבטיח סימון שלא רואים. */
        if (pendingReport) {
          var pr = pendingReport;
          /* ⚠️ אותו מזהה שליחה, אחרת השרת יראה בזה דיווח חדש וייווצר כפל. */
          if (pr.clientRef) state.clientRef = pr.clientRef;
          var catBtn = container.querySelector('.gd-cat[data-c="' + esc(pr.category || "") + '"]');
          if (catBtn) catBtn.click();
          if (pr.title) {
            titleInput.value = pr.title;
            titleInput.dispatchEvent(new Event("input"));
          }
          descEl.value = pr.desc || "";
          descEl.dispatchEvent(new Event("input"));
          container.querySelector("#gd-place").value = pr.place || "";
          container.querySelector("#gd-phone").value = pr.phone || "";
          if (pr.x !== null && pr.x !== undefined && pr.x !== "") {
            state.x = pr.x; state.y = pr.y; state.area = pr.area || "";
            locEl.textContent = "המיקום שסימנת נשמר. אפשר ללחוץ על המפה כדי לסמן מחדש.";
            locEl.classList.add("is-ok");
            /* המפה כעת יודעת לצייר נעיצה התחלתית ולמרכז עליה (2026-09-15) — קודם נשארה תמיד בתצוגה קבועה, בדיווח משוחזר.
               יועד: "כרגע היא סתם מתעוררת בתצוגה קבועה". */
            if (formMapApi && formMapApi.setPin) formMapApi.setPin({ x: pr.x, y: pr.y });
            if (formMapApi && formMapApi.centerOnPin) formMapApi.centerOnPin();
          }
          (pr.photos || []).forEach(function (ph) {
            if (state.photos.length >= photoMax) return;
            state.photos.push(ph);
            drawThumbs("data:" + (ph.mime || "image/jpeg") + ";base64," + ph.data);
          });
          CBA.ui.toast("שחזרנו את הדיווח שלא נשלח");
        }

        // ---- שליחה ----
        var sendBtn = container.querySelector("#gd-send");
        sendBtn.addEventListener("click", function () {
          if (!state.cat) return CBA.ui.alert("צריך לבחור קטגוריה");
          var titleVal = titleInput.value.trim();
          if (!titleVal) return CBA.ui.alert("צריך לבחור או לכתוב כותרת קצרה");
          var place = container.querySelector("#gd-place").value.trim();
          if (state.x === null && !place) {
            return CBA.ui.alert("צריך לסמן מיקום על המפה או לכתוב אותו במילים");
          }
          sendReport({
            category: state.cat,
            title: titleVal,
            desc: descEl.value.trim(),
            place: place,
            phone: container.querySelector("#gd-phone").value.trim(),
            x: state.x, y: state.y, area: state.area || "",
            photos: state.photos.slice(),
            clientRef: state.clientRef
          }, sendBtn);
        });
      });
    }
  };
})();
