/* מסך "מכון כושר — ניהול" (שלב 1, 2026-08-18).
   ----------------------------------------------------------------------------
   בשלב הזה המסך הוא **לקריאה בלבד**: הוא מוודא שהתשתית קמה כמו שצריך ומראה
   את מצבה. אין עדיין מנויים, כי ההרשמה עצמה נבנית בשלב 2 — ולכן במקום טבלה
   ריקה שלא אומרת כלום, יש כאן "מצב המודול": מה כבר מוגדר בגיליון ומה חסר.
   זה גם מה שמאפשר למורן להיכנס ולראות שהכול מוכן עוד לפני שנפתחת ההרשמה.

   התבנית זהה ל-clubAdmin.js במכוון (שמירת מיקום גלילה, load() אחד, אותן
   מחלקות כרטיס) — כדי שמי שקרא מסך ניהול אחד יידע לקרוא גם את זה.
   כל הכתיבה (אישור, אימות תשלום, הארכה) מגיעה בשלבים 2-3. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  // שימור מיקום גלילה בין ציורים מחדש — אותו פתרון כמו clubAdmin/residents:
  // render() נקרא שוב גם ברענון רקע שקט, וה-innerHTML החדש היה מאפס גלילה.
  var gaWinScrollY = 0;

  // אותו חיווי טעינה בדיוק כמו clubAdmin (club-loading + rs-spin) — מחלקות
  // שכבר קיימות ונבדקו, ולא מחלקת שלד חדשה שאולי לא מוגדרת ב-CSS.
  function gaLoadingHTML() {
    return '<div class="club-loading"><div class="rs-spin"></div>טוען…</div>';
  }

  function kpi(n, label, tone) {
    return '<div class="gym-kpi' + (tone ? ' gym-kpi--' + tone : '') + '">' +
             '<div class="gym-kpi__n">' + CBA.esc(String(n)) + '</div>' +
             '<div class="gym-kpi__l">' + CBA.esc(label) + '</div>' +
           '</div>';
  }

  function checkRow(isOn, label, value) {
    return '<div class="gym-check__row">' +
             '<span class="gym-check__mark gym-check__mark--' + (isOn ? 'on' : 'off') + '">' +
               (isOn ? '✓' : '!') + '</span>' +
             '<span class="gym-check__label">' + CBA.esc(label) + '</span>' +
             '<span class="gym-check__val">' + CBA.esc(value) + '</span>' +
           '</div>';
  }

  /* סופר מנויים לפי סטטוס. הסטטוסים נכתבים בעברית בגיליון (ר' האפיון), ולכן
     ההשוואה היא על המחרוזת עצמה — בדיוק כמו שאר המסכים שקוראים מהגיליון. */
  function countBy(members, status) {
    return members.filter(function (m) {
      return String(m['סטטוס'] || '').trim() === status;
    }).length;
  }

  CBA.screens.gymAdmin = {
    title: "מכון כושר",

    render: function (container) {
      gaWinScrollY = window.scrollY || 0;

      container.innerHTML =
        '<div class="screen-head">' +
          '<div class="screen-head__title">מכון כושר — ניהול</div>' +
          '<div class="screen-head__sub">מנויים, אישורי הרשמה ומעקב תשלומים</div>' +
        '</div>' +
        '<div id="ga-kpis" class="gym-kpis"></div>' +
        '<div class="card club-card">' +
          '<div class="club-sec__title">מנויים</div>' +
          '<div id="ga-members">' + gaLoadingHTML() + '</div>' +
        '</div>' +
        '<div class="card club-card">' +
          '<div class="club-sec__title">מצב המודול</div>' +
          '<div id="ga-status" class="gym-check">' + gaLoadingHTML() + '</div>' +
        '</div>';

      var kpisEl    = container.querySelector("#ga-kpis");
      var membersEl = container.querySelector("#ga-members");
      var statusEl  = container.querySelector("#ga-status");

      function load() {
        if (!(CBA.data && CBA.data.getGymList)) {
          membersEl.innerHTML = '<div class="club-empty">המודול עדיין לא מחובר לגיליון.</div>';
          statusEl.innerHTML = '';
          return;
        }
        CBA.data.getGymList(function (res) {
          if (!res || !res.ok) {
            // שגיאת הרשאה היא המקרה השכיח כאן, והיא לא באמת "תקלה" — לכן
            // מוצגת כהודעה מסבירה ולא כאדום מבהיל.
            membersEl.innerHTML = '<div class="club-empty">' +
              CBA.esc((res && res.error) || "לא ניתן לטעון כרגע.") + '</div>';
            statusEl.innerHTML = '';
            kpisEl.innerHTML = '';
            return;
          }

          var members   = res.members   || [];
          var plans     = res.plans     || [];
          var questions = res.questions || [];
          var rules     = res.rules     || [];
          var settings  = res.settings  || {};

          var active   = countBy(members, "פעיל");
          var waitDoc  = countBy(members, "ממתין לאישור רופא");
          var waitPay  = countBy(members, "ממתין לתשלום");
          var waitVer  = countBy(members, "ממתין לאימות");
          var expired  = countBy(members, "פג תוקף");

          kpisEl.innerHTML =
            kpi(active,  "מנויים פעילים", active ? "ok" : "muted") +
            kpi(waitDoc, "ממתינים לאישור רופא", waitDoc ? "warn" : "muted") +
            kpi(waitPay, "ממתינים לתשלום", waitPay ? "warn" : "muted") +
            kpi(waitVer, "ממתינים לאימות תשלום", waitVer ? "warn" : "muted") +
            kpi(expired, "פג תוקף", "muted") +
            kpi(members.length, "סה״כ רשומות", "muted");

          membersEl.innerHTML = members.length
            ? '<div class="club-empty">' + members.length + ' רשומות בגיליון. טבלת המנויים המלאה נבנית בשלב הבא.</div>'
            : '<div class="gym-note">עדיין אין מנויים — <strong>וזה הצפוי</strong>.<br>' +
              'אשף ההרשמה לתושבים נבנה בשלב הבא, ואז הבקשות יתחילו להופיע כאן.</div>';

          var plan = plans[0];
          var planTxt = plan
            ? plan.name + " · " + plan.months + " חודשים · " + plan.total + " ₪ (" + plan.monthlyPrice + " ₪ לחודש)"
            : "לא הוגדר מסלול";
          var payboxSet = !!String(settings["קישור פייבוקס"] || "").trim();

          statusEl.innerHTML =
            checkRow(true, "טאבי המכון נוצרו בגיליון", "3 טאבים") +
            checkRow(!!plan, "מסלול מנוי", planTxt) +
            checkRow(questions.length > 0, "שאלון בריאות", questions.length + " שאלות") +
            checkRow(rules.length > 0, "מקטעי תקנון", rules.length + " מקטעים") +
            checkRow(!!res.hasEntryCode, "קוד כניסה למכון", res.hasEntryCode ? "מוגדר בגיליון" : "לא הוגדר") +
            checkRow(payboxSet, "קישור פייבוקס", payboxSet ? "מוגדר" : "עדיין לא הוגדר — יידרש בשלב 3");

          if (gaWinScrollY) window.scrollTo(0, gaWinScrollY);
          gaWinScrollY = 0;
        });
      }

      load();
    }
  };
})();
