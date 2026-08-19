/* מסך אדמין "שריון מועדון — ניהול" (המשך שלב 8).
   שני מקטעים: "ממתינות לאישור" (בקשות שהוגשו ע"י תושבים, טרם אושרו) עם כפתורי
   אשר/דחה, ו"כל השריונים הקרובים" — תצוגה מלאה לצפייה (כולל כאלה שכבר אושרו).
   שואב מ-CBA.data.getClubList (Code.gs handleClubList_, מוגן בסיסמת מנהל). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

// שימור מיקום גלילה בין ציורים מחדש (אותו פתרון כמו ב-expenses.js/residents.js:
// render() נקרא מחדש גם ברענון רקע שקט, וה-innerHTML החדש היה מאפס גלילה).
var caScrollP = 0, caScrollA = 0, caWinScrollY = 0;

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

    var pendingList = container.querySelector("#ca-pending-list");
    var allList = container.querySelector("#ca-all-list");

    function load() {
      pendingList.innerHTML = clubLoadingHTML();
      allList.innerHTML = clubLoadingHTML();
      CBA.data.getClubList(function (res) {
        if (!res || !res.ok) {
          pendingList.innerHTML = '<div class="club-empty">לא ניתן לטעון כרגע. ' + CBA.esc((res && res.error) || "") + '</div>';
          allList.innerHTML = "";
          return;
        }
        var all = res.reservations || [];
        var pending = all.filter(function (r) { return r.status === "pending"; });
        // מעדכן ישירות את הספירה הגלובלית (פעמון + תגית על הטאב) — בלי קריאת רשת
        // נוספת, כי הרשימה כבר בידינו מהקריאה הזו.
        if (window.CBA.setClubPendingCount) window.CBA.setClubPendingCount(pending.length);

        pendingList.innerHTML = pending.length
          ? pending.map(pendingRowHTML).join("")
          : '<div class="club-empty">אין בקשות ממתינות לאישור כרגע.</div>';

        allList.innerHTML = all.length
          ? all.map(allRowHTML).join("")
          : '<div class="club-empty">אין שריונים קרובים.</div>';

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
      var badge = r.status === "pending"
        ? '<span class="badge badge--warn">ממתין</span>'
        : '<span class="badge badge--ok">מאושר</span>';
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

    function bindActions() {
      container.querySelectorAll("[data-approve]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          btn.disabled = true; btn.textContent = "מאשר…";
          // approveClubReservation עובר דרך CBA.sheets.get (לא push), ולכן לא
          // נספר אוטומטית ב-inFlightWrites — מסמנים dirty ידנית כדי שרענון רקע
          // לא "יעקוף" את הבקשה הזו באמצע (ר' מדיניות רענון נתונים בזיכרון הפרויקט).
          if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubAdminAction");
          CBA.data.approveClubReservation(btn.dataset.approve, function (res) {
            if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubAdminAction");
            if (res && res.ok) { load(); CBA.ui.toast("השריון אושר"); }
            else { btn.disabled = false; btn.textContent = "אשר"; CBA.ui.alert((res && res.error) || "האישור נכשל, נסו שוב."); }
          });
        });
      });
      container.querySelectorAll("[data-reject]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          // (2026-08-19, ממצא 2.6) אישור דחייה — מודל של האפליקציה במקום חלון דפדפן
          CBA.ui.confirm("הפעולה תמחק את האירוע מהיומן ותשחרר את המשבצת בחזרה לפנויה.",
            { title: "לדחות את בקשת השריון?", okText: "דחה בקשה", danger: true }
          ).then(function (ok) {
            if (!ok) return;
            btn.disabled = true; btn.textContent = "דוחה…";
            if (CBA.sheets.markDirty) CBA.sheets.markDirty("clubAdminAction");
            CBA.data.rejectClubReservation(btn.dataset.reject, function (res) {
              if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("clubAdminAction");
              if (res && res.ok) { load(); CBA.ui.toast("הבקשה נדחתה"); }
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
  return '<div class="club-loading"><div class="rs-spin"></div>טוען…</div>';
}
