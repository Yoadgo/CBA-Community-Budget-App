/* מסך אדמין "שריון מועדון — ניהול" (המשך שלב 8).
   שני מקטעים: "ממתינות לאישור" (בקשות שהוגשו ע"י תושבים, טרם אושרו) עם כפתורי
   אשר/דחה, ו"כל השריונים הקרובים" — תצוגה מלאה לצפייה (כולל כאלה שכבר אושרו).
   שואב מ-CBA.data.getClubList (Code.gs handleClubList_, מוגן בסיסמת מנהל). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

// שימור מיקום גלילה בין ציורים מחדש (אותו פתרון כמו ב-expenses.js/residents.js:
// render() נקרא מחדש גם ברענון רקע שקט, וה-innerHTML החדש היה מאפס גלילה).
var caScrollP = 0, caScrollA = 0, caWinScrollY = 0;

/* CLB2 (גל 8, 1.10.26) — הבחירות המסומנות נשמרות כאן (מזהה→true) ומסומנות מחדש אחרי כל ציור; רענון רקע מושהה כל עוד יש לפחות אחת */
var caPicks = {};
var caLeaveWatch = false;
function caSyncPickHold() {
  if (CBA.holdRefresh) CBA.holdRefresh("clubPicks", Object.keys(caPicks).length > 0);
}
/* CLB2 (גל 8, 1.10.26) — יציאה מהמסך: מנקים בחירות ומשחררים את ההשהיות, כדי לא לעצור רענון של מסך אחר */
function caWatchLeave() {
  if (caLeaveWatch || typeof MutationObserver === "undefined" || !document.body) return;
  caLeaveWatch = true;
  new MutationObserver(function () {
    if (CBA.onScreen && CBA.onScreen("clubAdmin")) return;
    caPicks = {};
    if (CBA.holdRefresh) { CBA.holdRefresh("clubPicks", false); CBA.holdRefresh("clubAction", false); }
  }).observe(document.body, { attributes: true, attributeFilter: ["data-screen"] });
}

var CLUB_WD_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
function clubPad2(n) { return (n < 10 ? "0" : "") + n; }
/* (2026-08-18, ממצא 2.5 בדו"ח הבדיקה) קודם לא הייתה כאן שום בדיקת תקינות:
   שריון שמגיע מהיומן בלי תאריך התחלה/סיום תקין (אירוע "כל היום", או שורה
   שנוצרה ידנית ביומן) הציג למנהל "יום undefined NaN.NaN.NaN · NaN:NaN–NaN:NaN"
   — וכפתור "אשר" נשאר פעיל עליו. עכשיו התאריך נבדק, מוצג טקסט מובן, והשורה
   מסומנת כפגומה (ר' clubRowBroken למטה) כך שאי-אפשר לאשר אותה בטעות. */
function clubValidDate(v) {
  if (!v) return null;
  var d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}
function clubRowBroken(r) { return !clubValidDate(r && r.start) || !clubValidDate(r && r.end); }
function clubDateLabel(iso) {
  var d = clubValidDate(iso);
  if (!d) return "תאריך חסר או לא תקין";
  return "יום " + CLUB_WD_HE[d.getDay()] + " " + clubPad2(d.getDate()) + "." + clubPad2(d.getMonth() + 1) + "." + d.getFullYear();
}
function clubTimeRange(startIso, endIso) {
  var s = clubValidDate(startIso), e = clubValidDate(endIso);
  if (!s || !e) return "שעה חסרה";
  return clubPad2(s.getHours()) + ":" + clubPad2(s.getMinutes()) + "–" + clubPad2(e.getHours()) + ":" + clubPad2(e.getMinutes());
}

CBA.screens.clubAdmin = {
  title: "שריון מועדון",

  render(container) {
    // נשמר לפני שה-innerHTML נדרס, ומוחזר אחרי ש-load() מסיים למלא את הרשימות
    var prevPending = container.querySelector("#ca-pending-list");
    if (prevPending) caScrollP = prevPending.scrollTop;
    var prevAll = container.querySelector("#ca-all-list");
    if (prevAll) caScrollA = prevAll.scrollTop;
    caWinScrollY = window.scrollY || 0;

    container.innerHTML = `
      <div class="screen-head"><div class="screen-head__title">שריון מועדון — ניהול</div>
        <div class="screen-head__sub">אישור בקשות שריון מתושבים, וצפייה בכל השריונים הקרובים</div></div>
      <div class="card club-card" id="ca-pending">
        <div class="club-sec__title">ממתינות לאישור</div>
        <div id="ca-pending-list" class="club-list">${clubLoadingHTML()}</div>
      </div>
      <div class="card club-card" id="ca-all">
        <div class="club-sec__title">כל השריונים הקרובים</div>
        <div id="ca-all-list" class="club-list">${clubLoadingHTML()}</div>
      </div>
    `;

    // סרגל האישור המרובה נבנה פעם אחת ויושב מעל הרשימה; רק ה-hidden שלו משתנה
    var pendingHost = container.querySelector("#ca-pending-list");
    if (pendingHost && !container.querySelector("#ca-bulk")) {
      var bar = document.createElement("div");
      bar.className = "club-bulk"; bar.id = "ca-bulk"; bar.hidden = true;
      bar.innerHTML = '<span class="club-bulk__count" id="ca-bulk-count">בחרו שריונים לאישור</span>' +
        '<button type="button" class="btn-approve" id="ca-bulk-ok" disabled>אשר את הנבחרים</button>';
      pendingHost.parentNode.insertBefore(bar, pendingHost);
      bar.querySelector("#ca-bulk-ok").addEventListener("click", function () { caBulkApprove(); });
    }
    var caBulkBar = container.querySelector("#ca-bulk");
    var pendingList = container.querySelector("#ca-pending-list");
    var allList = container.querySelector("#ca-all-list");
    caWatchLeave();

    function load() {
      pendingList.innerHTML = clubLoadingHTML();
      allList.innerHTML = clubLoadingHTML();
      CBA.data.getClubList(function (res) {
        /* CLB3 (גל 8, 1.10.26) — תשובה מאוחרת: המסך עזב או צויר מחדש — לא מציירים (ולא קושרים כפתורים כפולים) */
        if ((CBA.onScreen && !CBA.onScreen("clubAdmin")) || !container.contains(pendingList)) return;
        if (!res || !res.ok) {
          /* CLB1 (גל 8, 1.10.26) — שגיאת טעינה עם כפתור "נסה שוב" במקום טקסט בלבד */
          pendingList.innerHTML = CBA.ui.emptyState({ icon: "calendar", title: "לא הצלחנו לטעון את השריונים",
            sub: "בדקו את החיבור ונסו שוב.", ctaLabel: "נסה שוב", ctaAttr: "data-club-retry" });
          allList.innerHTML = "";
          var retry = pendingList.querySelector("[data-club-retry]");
          if (retry) retry.addEventListener("click", function () { load(); });
          return;
        }
        var all = res.reservations || [];
        var pending = all.filter(function (r) { return r.status === "pending"; });
        // מעדכן ישירות את הספירה הגלובלית (פעמון + תגית על הטאב) — בלי קריאת רשת
        // נוספת, כי הרשימה כבר בידינו מהקריאה הזו.
        if (window.CBA.setClubPendingCount) window.CBA.setClubPendingCount(pending.length);

        // סרגל אישור מרובה — מוצג רק כשיש יותר מבקשה אחת. על בקשה בודדת
        // הוא רעש: כפתור "אשר" של השורה עושה בדיוק את אותו דבר.
        var okPending = pending.filter(function (r) { return !clubRowBroken(r); });
        caBulkBar.hidden = okPending.length < 2;
        /* CLB2 (גל 8, 1.10.26) — מזהים שכבר לא ממתינים (אושרו/נדחו/בוטלו) יוצאים מהבחירה */
        var livePick = {};
        okPending.forEach(function (r) { if (caPicks[r.id]) livePick[r.id] = true; });
        caPicks = livePick;
        caSyncPickHold();

        pendingList.innerHTML = pending.length
          ? pending.map(pendingRowHTML).join("")
          : CBA.ui.emptyState({ icon: "check", title: "אין בקשות ממתינות",
              sub: "כל בקשות השריון טופלו. בקשה חדשה תופיע כאן ותשלח לך התראה." });

        allList.innerHTML = all.length
          ? all.map(allRowHTML).join("")
          : CBA.ui.emptyState({ icon: "calendar", title: "אין שריונים קרובים",
              sub: "המועדון פנוי בתקופה הקרובה. שריונים מאושרים יופיעו כאן לפי תאריך." });

        /* CLB2 (גל 8, 1.10.26) — סימון מחדש של הבחירות אחרי הציור */
        container.querySelectorAll("[data-ca-pick]").forEach(function (cb) {
          if (caPicks[cb.dataset.caPick]) cb.checked = true;
        });
        caUpdateBulk();

        // שחזור מיקום הגלילה (ר' ההערה למעלה ליד caScrollP)
        if (caScrollP) pendingList.scrollTop = caScrollP;
        if (caScrollA) allList.scrollTop = caScrollA;
        if (caWinScrollY) window.scrollTo(0, caWinScrollY);
        caScrollP = 0; caScrollA = 0; caWinScrollY = 0;

        bindActions();
      });
    }

    function pendingRowHTML(r) {
      var broken = clubRowBroken(r);
      return (
        '<div class="club-row' + (broken ? " club-row--broken" : "") + '">' +
          (broken ? '<span class="club-row__cbspace"></span>'
                  : '<input type="checkbox" class="club-row__cb" data-ca-pick="' + CBA.esc(r.id) + '" aria-label="בחירה לאישור מרובה">') +
          '<div class="club-row__main">' +
            '<div class="club-row__title">' + CBA.esc(r.family || "תושב") +
              (r.email ? ' <span class="club-row__email">· ' + CBA.esc(r.email) + '</span>' : "") + '</div>' +
            '<div class="club-row__meta">' + CBA.esc(clubDateLabel(r.start)) + ' · ' + clubTimeRange(r.start, r.end) +
              (r.note ? " · " + CBA.esc(r.note) : "") + '</div>' +
          '</div>' +
          '<div class="club-row__actions">' +
            (broken
              ? '<span class="club-row__warn" title="לשריון הזה אין תאריך/שעה תקינים ביומן — אי אפשר לאשר אותו מכאן. צריך לתקן את האירוע ביומן גוגל.">שריון פגום</span>'
              : '<button type="button" class="btn-approve" data-approve="' + CBA.esc(r.id) + '">אשר</button>') +
            '<button type="button" class="btn-reject" data-reject="' + CBA.esc(r.id) + '">דחה</button>' +
          '</div>' +
        '</div>'
      );
    }

    function allRowHTML(r) {
      /* CLB4 (גל 8, 1.10.26) — "מאושר" רק לסטטוס approved; סטטוס אחר מוצג כפי שהוא בתגית ניטרלית */
      var badge = r.status === "pending"
        ? '<span class="badge badge--warn">ממתין</span>'
        : (!r.status || r.status === "approved")
          ? '<span class="badge badge--ok">מאושר</span>'
          : '<span class="badge badge--info">' + CBA.esc(r.status) + '</span>';
      return (
        '<div class="club-row">' +
          '<div class="club-row__main">' +
            '<div class="club-row__title">' + CBA.esc(r.family || "תושב") + '</div>' +
            '<div class="club-row__meta">' + CBA.esc(clubDateLabel(r.start)) + ' · ' + clubTimeRange(r.start, r.end) +
              (r.note ? " · " + CBA.esc(r.note) : "") + '</div>' +
          '</div>' +
          '<div class="club-row__actions">' + badge + '</div>' +
        '</div>'
      );
    }

    /* מצב הבחירה חי ב-DOM עצמו (checked) ולא במשתנה נפרד — הרשימה נבנית
       מחדש בכל טעינה, ומשתנה מקביל היה נשאר עם מזהים שכבר לא קיימים.
       CLB2 (גל 8, 1.10.26) — caPicks הוא רק הגיבוי לסימון-מחדש אחרי ציור, ונגזם בכל טעינה. */
    function caPicked() {
      return Array.prototype.slice.call(container.querySelectorAll("[data-ca-pick]:checked"))
        .map(function (el) { return el.dataset.caPick; });
    }
    function caUpdateBulk() {
      var n = caPicked().length;
      var lbl = container.querySelector("#ca-bulk-count");
      var btn = container.querySelector("#ca-bulk-ok");
      if (lbl) lbl.textContent = n ? n + " נבחרו" : "בחרו שריונים לאישור";
      if (btn) btn.disabled = !n;
    }
    function caBulkApprove() {
      var ids = caPicked();
      if (!ids.length) return;
      /* CLB3 (גל 8, 1.10.26) — רענון רקע מושהה מהאישור ועד שהבקשה חוזרת (כולל הרגע שבין סגירת החלון לשליחה) */
      if (CBA.holdRefresh) CBA.holdRefresh("clubAction", true);
      CBA.ui.confirm(ids.length + " שריונים יאושרו, וכל תושב יקבל מייל אישור.",
        { title: "לאשר " + ids.length + " שריונים?", okText: "אשר הכול" }
      ).then(function (ok) {
        if (!ok) { if (CBA.holdRefresh) CBA.holdRefresh("clubAction", false); return; }
        var btn = container.querySelector("#ca-bulk-ok");
        if (btn) { btn.disabled = true; btn.textContent = "מאשר…"; }
        CBA.data.approveClubReservations(ids, function (res) {
          if (CBA.holdRefresh) CBA.holdRefresh("clubAction", false);
          if (btn) btn.textContent = "אשר את הנבחרים";
          if (!res || !res.ok) {
            if (btn) btn.disabled = false;
            CBA.ui.alert((res && res.error) || "האישור נכשל, נסו שוב.");
            return;
          }
          /* CLB2 (גל 8, 1.10.26) — אחרי אישור מרובה מוצלח: הבחירה מתאפסת וההשהיה משתחררת */
          caPicks = {}; caSyncPickHold();
          if (!CBA.onScreen || CBA.onScreen("clubAdmin")) load();
          if (res.failed && res.failed.length) {
            CBA.ui.alert(res.approved + " שריונים אושרו. " + res.failed.length +
              " לא אושרו — ייתכן שבוטלו ביומן בינתיים.");
          } else {
            CBA.ui.toast(res.approved + " שריונים אושרו");
          }
        });
      });
    }

    function bindActions() {
      container.querySelectorAll("[data-ca-pick]").forEach(function (cb) {
        /* CLB2 (גל 8, 1.10.26) — כל סימון/ביטול נרשם ב-caPicks ומעדכן את השהיית הרענון */
        cb.addEventListener("change", function () {
          if (cb.checked) caPicks[cb.dataset.caPick] = true; else delete caPicks[cb.dataset.caPick];
          caSyncPickHold();
          caUpdateBulk();
        });
      });
      container.querySelectorAll("[data-approve]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          btn.disabled = true; btn.textContent = "מאשר…";
          // approveClubReservation עובר דרך CBA.sheets.get (לא push), ולכן לא
          // נספר אוטומטית ב-inFlightWrites — מסמנים dirty ידנית כדי שרענון רקע
          // לא "יעקוף" את הבקשה הזו באמצע (ר' מדיניות רענון נתונים בזיכרון הפרויקט).
          if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubAdminAction");
          /* CLB3 (גל 8, 1.10.26) — השהיית ציור-מחדש ברקע עד שהבקשה חוזרת; ציור מאוחר רק אם עדיין במסך */
          if (CBA.holdRefresh) CBA.holdRefresh("clubAction", true);
          CBA.data.approveClubReservation(btn.dataset.approve, function (res) {
            if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubAdminAction");
            if (CBA.holdRefresh) CBA.holdRefresh("clubAction", false);
            if (res && res.ok) { if (!CBA.onScreen || CBA.onScreen("clubAdmin")) load(); CBA.ui.toast("השריון אושר"); }
            else { btn.disabled = false; btn.textContent = "אשר"; CBA.ui.alert((res && res.error) || "האישור נכשל, נסו שוב."); }
          });
        });
      });
      container.querySelectorAll("[data-reject]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          /* CLB3 (גל 8, 1.10.26) — השהיה מהלחיצה ועד חזרת הבקשה (גם בין סגירת חלון האישור לשליחה) */
          if (CBA.holdRefresh) CBA.holdRefresh("clubAction", true);
          // (2026-08-19, ממצא 2.6) אישור דחייה — מודל של האפליקציה במקום חלון דפדפן
          CBA.ui.confirm("הפעולה תמחק את האירוע מהיומן ותשחרר את המשבצת בחזרה לפנויה.",
            { title: "לדחות את בקשת השריון?", okText: "דחה בקשה", danger: true }
          ).then(function (ok) {
            if (!ok) { if (CBA.holdRefresh) CBA.holdRefresh("clubAction", false); return; }
            btn.disabled = true; btn.textContent = "דוחה…";
            if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubAdminAction");
            CBA.data.rejectClubReservation(btn.dataset.reject, function (res) {
              if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubAdminAction");
              if (CBA.holdRefresh) CBA.holdRefresh("clubAction", false);
              if (res && res.ok) { if (!CBA.onScreen || CBA.onScreen("clubAdmin")) load(); CBA.ui.toast("הבקשה נדחתה"); }
              else { btn.disabled = false; btn.textContent = "דחה"; CBA.ui.alert((res && res.error) || "הדחייה נכשלה, נסו שוב."); }
            });
          });
        });
      });
    }

    load();
  }
};

function clubLoadingHTML() {
  return CBA.skel.rows(3, { actions: true });
}
