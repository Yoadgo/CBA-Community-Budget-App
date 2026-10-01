/* tips.js — טיפ קטן בכניסה הראשונה לכל מסך   (TRA3, אושר 1.10.2026)
   ============================================================================
   שורה צפה בתחתית המסך, נסגרת ב-✕ (או לבד אחרי 15 שניות).
   מתחת לחלונות ולמגירות (z-index 45), כדי שחלון שנפתח יכסה אותה. מופיעה **פעם אחת** לכל מסך ולכל משתמש
   במכשיר הזה (נרשם ברגע שהופיעה — "בכניסה הראשונה"), כדי שלא צריך לזכור
   את כל הסיור בבת אחת.
   ⚠️ לא נוגע ב-app.js: מאזין לשינוי body[data-screen] (רענון שקט לא משנה
      אותו ולכן לא מקפיץ טיפ). לא מופיע כשהסיור או חלון פתוחים — מחכה.
   ⚠️ שמירה ב-localStorage בלבד (נוחות אישית). חסום/מצב פרטי — פשוט בלי טיפים.
   ביטול: להסיר את תגית ה-script מ-index.html.
   ========================================================================== */
window.CBA = window.CBA || {};
CBA.tips = (function () {
  "use strict";
  var TIPS = {
    resHome:            "המספר הגדול = כמה דברים מחכים לך. לחיצה על אריח פותחת את המסך שלו.",
    resRequests:        "כל בקשה עם הסטטוס שלה, ובראש המסך — מתי הכסף ייכנס. ה-+ למטה מגיש קבלה חדשה.",
    resSubmit:          "מצלמים את הקבלה — הסכום והתאריך מתמלאים לבד, ותמיד אפשר לתקן לפני השליחה.",
    resReserve:         "בוחרים יום ושעות ושולחים. השריון מאושר על ידי הוועד, והסטטוס מופיע כאן.",
    resGym:             "כאן המנוי שלך: כמה ימים נשארו, התשלומים, ואיך נכנסים למכון.",
    resWework:          "לוחצים על שעה בלוח, בוחרים כמה שעות — ו\"שריון עמדה\". בזמן השריון הדלת נפתחת מכאן.",
    resMap:             "חיפוש לפי מספר בית, משפחה או שם של ילד. לחיצה על בית מראה מי גר בו.",
    resDirectory:       "חיפוש לפי שם, בית או טלפון — וחיוג או וואטסאפ בלחיצה.",
    resCommittee:       "מי אחראי על מה בוועד. לחיצה על שם פותחת חיוג או וואטסאפ.",
    resServices:        "לייק, דיסלייק ותגובה לכל שירות — זה עוזר לשכנים לבחור.",
    resRecommendations: "בעלי מקצוע ששכנים ממליצים עליהם. ה-+ מוסיף המלצה משלך.",
    events:             "אישור הגעה, הוספה ליומן ו\"הזכירו לי\" — מתוך כל אירוע.",
    resGarden:          "מעקב אחרי הדיווחים שלך. \"על המפה\" מראה איפה כל אחד מהם.",
    resGardenNew:       "צילום ונקודה על המפה מספיקים — לא צריך דיוק.",
    resMe:              "כאן מעדכנים טלפון ותאריכי לידה — גם של בן או בת הזוג ושל הילדים.",
    expenses:           "בתצוגת \"ממתינות לאישור\" — \"מעבר לתור אישורים\" עובר עליהן אחת אחרי השנייה, עם הקבלה ליד.",
    residents:          "בקשות הרשמה עם התאמה חזקה (אותו מספר בית) אפשר לאשר יחד — \"אשר את כל המומלצים\".",
    budget:             "לחיצה על סעיף פותחת את ההוצאות שלו, ומשם \"+ הוספת הוצאה לסעיף הזה\".",
    gardenTasks:        "⋯ על משימה פותח את כל הפעולות שלה. בטלפון, לגנן: החלקה שמאלה = \"בוצע\".",
    appReports:         "בתשובה לדיווח יש תשובות מוכנות — לחיצה ממלאת את הטקסט, ואפשר לערוך לפני השליחה.",
    servicesAdmin:      "דיווחי \"לא מעודכן\" שממתינים מופיעים ברצועה למעלה, עם קפיצה ישירה לכרטיס.",
    weworkAdmin:        "שריון שאיש לא נכנס אליו 30 דקות — \"שחרור העמדה\" מפנה אותה לשכנים."
  };
  var KEY = "cba_tips_v1";
  var last = "", timer = null, hideTimer = null;
  function hide() {
    clearTimeout(hideTimer);
    var el = document.querySelector(".cba-tip");
    if (el) el.remove();
  }

  function who() { return String(((CBA.user || {}).email) || "anon").toLowerCase(); }
  function seenMap() {
    try { var m = JSON.parse(localStorage.getItem(KEY) || "{}"); return (m && typeof m === "object") ? m : {}; }
    catch (e) { return null; }
  }
  function markSeen(screen) {
    try { var m = seenMap() || {}; m[who() + "|" + screen] = 1; localStorage.setItem(KEY, JSON.stringify(m)); } catch (e) {}
  }
  function busy() {
    var b = document.body;
    return b.classList.contains("is-gated") || b.classList.contains("tr-open") ||
      b.classList.contains("has-cba-dlg") || b.classList.contains("gs-open") ||
      !!document.querySelector("#cba-drawer, .gym-wiz, .txq") ||
      (CBA.tour && CBA.tour.isOpen && CBA.tour.isOpen());
  }
  function show(screen, tries) {
    tries = tries || 0;
    if (document.body.dataset.screen !== screen) return;
    var text = TIPS[screen];
    if (!text) return;
    var m = seenMap();
    if (!m || m[who() + "|" + screen]) return;
    if (busy()) { if (tries < 40) timer = setTimeout(function () { show(screen, tries + 1); }, 1500); return; }
    if (document.querySelector(".cba-tip")) return;
    var el = document.createElement("div");
    el.className = "cba-tip";
    el.setAttribute("role", "status");
    el.innerHTML = '<span class="cba-tip__k">טיפ</span><span class="cba-tip__t"></span>' +
      '<button type="button" class="cba-tip__x" aria-label="סגירת הטיפ">✕</button>';
    el.querySelector(".cba-tip__t").textContent = text;
    el.querySelector(".cba-tip__x").addEventListener("click", function () { hide(); });
    /* צף בתחתית המסך (כמו הודעה קצרה), לא בתוך התוכן: רענון של המסך לא
       מוחק אותו, והוא לא שובר את החופה או את המפה. נעלם לבד אחרי 15 שניות
       או במעבר מסך. */
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("is-open"); });
    hideTimer = setTimeout(hide, 15000);
    markSeen(screen);
  }
  function onScreen() {
    var s = document.body.dataset.screen || "";
    if (s === last) return;
    last = s;
    clearTimeout(timer);
    hide();
    if (TIPS[s]) timer = setTimeout(function () { show(s); }, 700);
  }
  function start() {
    if (!window.MutationObserver) return;
    new MutationObserver(onScreen).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
    onScreen();
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
  return { TIPS: TIPS, _show: show };
})();
