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
  // התשובה האחרונה מהשרת — טופס ההקמה הידנית צריך ממנה את רשימת המסלולים
  var gaLast = null;

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

  /* ---------- שורת מנוי ברשימה ---------- */
  var GA_TONE = {
    "פעיל": "ok", "פג תוקף": "muted", "מוקפא": "muted",
    "ממתין לאישור רופא": "danger", "נדחה": "danger", "בוטל": "danger"
  };
  function memberRowHTML(m) {
    var status = String(m["סטטוס"] || "").trim();
    var tone = GA_TONE[status] || "warn";
    var name = ((m["שם פרטי"] || "") + " " + (m["שם משפחה"] || "")).trim() || m["אימייל"] || "";
    var flags = String(m["שאלות שנענו בכן"] || "").trim();
    return '<div class="gym-row">' +
             '<div class="gym-row__main">' +
               '<div class="gym-row__name">' + CBA.esc(name) +
                 (flags ? ' <span class="gym-pill gym-pill--danger">דגל</span>' : "") + "</div>" +
               '<div class="gym-row__meta">' +
                 (m["מספר בית"] ? "בית " + CBA.esc(m["מספר בית"]) + " · " : "") +
                 CBA.esc(m["מסלול"] || "") +
                 (m["בתוקף עד"] ? " · בתוקף עד " + CBA.esc(m["בתוקף עד"]) : "") +
               "</div>" +
               (flags ? '<div class="gym-row__flags">סומן "כן": ' + CBA.esc(flags) + "</div>" : "") +
             "</div>" +
             '<div class="gym-row__side">' +
               '<span class="gym-pill gym-pill--' + tone + '">' + CBA.esc(status) + "</span>" +
               (status === "ממתין להצהרה"
                 ? ""
                 : '<button type="button" class="btn-ghost" data-ga-declare="' + CBA.esc(m["מזהה"] || "") +
                   '">בקשת הצהרה</button>') +
               (status === "פעיל" || status === "פג תוקף"
                 ? '<button type="button" class="btn-ghost" data-ga-extend="' + CBA.esc(m["מזהה"] || "") +
                   '" data-ga-months="' + CBA.esc(String(m["מסלול"] || "")) + '">הארכה</button>'
                 : "") +
               (status === "ממתין לתשלום"
                 ? '<button type="button" class="btn-ghost" data-ga-cash="' + CBA.esc(m["מזהה"] || "") +
                   '" data-ga-price="' + CBA.esc(String(m["מחיר מוסכם"] || "")) + '">רישום תשלום ידני</button>'
                 : "") +
               (m["מצב סנכרון"] && m["מצב סנכרון"] !== "מסונכרן"
                 ? '<span class="gym-pill gym-pill--warn">' + CBA.esc(m["מצב סנכרון"]) + "</span>"
                 : "") +
             "</div>" +
           "</div>";
  }

  function bindMemberActions(root, reload) {
    // הארכה — זמינה תמיד, גם בלי תשלום חדש. אם היא יוצרת פער מול מה ששולם,
    // מוצגת התראה **אחרי** הפעולה. אף פעם לא חוסמים, זו דרישה מפורשת.
    root.querySelectorAll("[data-ga-extend]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaExtend;
        var until = window.prompt("עד איזה חודש להאריך? (בפורמט YYYY-MM, למשל 2027-02)", defaultValidUntil(planMonthsFor(btn.dataset.gaMonths)));
        if (!until) return;
        if (!/^\d{4}-\d{2}$/.test(until)) { window.alert("פורמט לא תקין. צריך YYYY-MM, למשל 2027-02."); return; }
        var reason = window.prompt("סיבת ההארכה (נרשמת ביומן):", "") || "";
        btn.disabled = true;
        if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymAdminAction");
        CBA.data.extendGymMembership({ id: id, validUntil: until, reason: reason }, function (res) {
          if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymAdminAction");
          if (!res || !res.ok) { btn.disabled = false; window.alert((res && res.error) || "ההארכה נכשלה."); return; }
          var sync = res.sync || {};
          if (sync.label && sync.label !== "מסונכרן") {
            window.alert("המנוי הוארך עד " + res.validUntil + ".\n\nשים לב: " + sync.label + " מול מה ששולם.");
          }
          reload();
        });
      });
    });

    // רישום תשלום ידני — למי ששילם במזומן או מחוץ לאפליקציה. מפעיל את המנוי
    // באותו מסלול בדיוק כמו אימות רגיל (gymActivate_ בשרת).
    root.querySelectorAll("[data-ga-cash]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaCash;
        var amount = window.prompt("איזה סכום התקבל? (₪)", btn.dataset.gaPrice || "");
        if (!amount) return;
        var until = window.prompt("עד איזה חודש המנוי בתוקף? (YYYY-MM)", defaultValidUntil(6));
        if (!until) return;
        if (!/^\d{4}-\d{2}$/.test(until)) { window.alert("פורמט לא תקין. צריך YYYY-MM."); return; }
        var method = window.prompt("אמצעי תשלום:", "מזומן") || "מזומן";
        btn.disabled = true;
        if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymAdminAction");
        CBA.data.recordGymPayment({ id: id, amount: Number(amount), validUntil: until, method: method },
          function (res) {
            if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymAdminAction");
            if (!res || !res.ok) { btn.disabled = false; window.alert((res && res.error) || "הרישום נכשל."); return; }
            var sync = res.sync || {};
            window.alert("המנוי הופעל, בתוקף עד " + res.validUntil +
              (sync.label && sync.label !== "מסונכרן" ? "\n\nשים לב: " + sync.label + " מול מה ששולם." : ""));
            reload();
          });
      });
    });

    root.querySelectorAll("[data-ga-declare]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaDeclare;
        if (!id) return;
        if (!window.confirm("לשלוח לתושב מייל עם בקשה למלא הצהרת בריאות?\n" +
                            "המנוי יעבור לסטטוס \"ממתין להצהרה\" עד שימלא אותה.")) return;
        btn.disabled = true;
        if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymAdminAction");
        CBA.data.requestGymDeclaration(id, function (res) {
          if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymAdminAction");
          if (!res || !res.ok) {
            btn.disabled = false;
            window.alert((res && res.error) || "השליחה נכשלה.");
            return;
          }
          reload();
        });
      });
    });
  }

  /* ---------- ממתינים לאימות תשלום ----------
     כאן נקבעים התאריכים. ברירת המחדל של "בתוקף עד" מחושבת לפי אורך המסלול,
     אבל היא **הצעה בלבד** — מנהל/ת המכון קובע/ת בפועל, וזו הייתה דרישה
     מפורשת של יועד. המערכת מודדת ומתריעה, לא חוסמת. */
  function defaultValidUntil(months) {
    var d = new Date();
    d.setMonth(d.getMonth() + (Number(months) || 6) - 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function planMonthsFor(planName) {
    var plans = (gaLast && gaLast.plans) || [];
    for (var i = 0; i < plans.length; i++) if (plans[i].name === planName) return plans[i].months;
    return (plans[0] && plans[0].months) || 6;
  }

  function verifyRowHTML(m) {
    var id = m["מזהה"] || "";
    var name = ((m["שם פרטי"] || "") + " " + (m["שם משפחה"] || "")).trim() || m["אימייל"] || "";
    var expected = m["מחיר מוסכם"] || "";
    var proof = m["קישור אישור"] || "";
    return '<div class="gym-verify" data-gv-row="' + CBA.esc(id) + '">' +
             '<div class="gym-verify__head">' +
               '<div class="gym-row__name">' + CBA.esc(name) + "</div>" +
               '<div class="gym-row__meta">' +
                 CBA.esc(m["מסלול"] || "") + " · מחיר מוסכם " + CBA.esc(expected) + " ₪" +
                 (m["דווח בתאריך"] ? " · דווח " + CBA.esc(m["דווח בתאריך"]) : "") +
               "</div>" +
               '<div class="gym-row__meta">' +
                 "אמצעי: " + CBA.esc(m["אמצעי תשלום"] || "—") +
                 " · אסמכתא: " + CBA.esc(m["אסמכתא"] || "—") +
                 (proof ? ' · <a href="' + CBA.esc(proof) + '" target="_blank" rel="noopener">צפייה בצילום</a>' : "") +
               "</div>" +
             "</div>" +
             '<div class="gym-verify__form">' +
               '<label>סכום שהתקבל<input type="number" data-gv="amount" value="' + CBA.esc(expected) + '"></label>' +
               '<label>בתוקף עד חודש<input type="month" data-gv="validUntil" value="' +
                 CBA.esc(defaultValidUntil(planMonthsFor(m["מסלול"]))) + '"></label>' +
             "</div>" +
             '<div class="gym-verify__actions">' +
               '<button type="button" class="btn-primary" data-gv-confirm>אימות והפעלה</button>' +
               '<button type="button" class="btn-ghost" data-gv-reject>לא נמצא תשלום</button>' +
             "</div>" +
           "</div>";
  }

  function bindVerifyActions(root, reload) {
    root.querySelectorAll("[data-gv-row]").forEach(function (box) {
      var id = box.dataset.gvRow;
      function val(k) { var n = box.querySelector('[data-gv="' + k + '"]'); return n ? n.value : ""; }

      box.querySelector("[data-gv-confirm]").addEventListener("click", function () {
        var amount = Number(val("amount"));
        var validUntil = val("validUntil");
        if (!amount) { window.alert("צריך להזין את הסכום שהתקבל."); return; }
        if (!validUntil) { window.alert("צריך לבחור עד איזה חודש המנוי בתוקף."); return; }
        var btn = box.querySelector("[data-gv-confirm]");
        btn.disabled = true; btn.textContent = "מפעיל…";
        if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymVerify");
        CBA.data.confirmGymPayment({ id: id, amount: amount, validUntil: validUntil }, function (res) {
          if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymVerify");
          if (!res || !res.ok) {
            btn.disabled = false; btn.textContent = "אימות והפעלה";
            window.alert((res && res.error) || "האימות נכשל.");
            return;
          }
          // ההתראה על פער מוצגת **אחרי** הפעולה ולא במקומה — לא חוסמים.
          var sync = res.sync || {};
          window.alert("המנוי הופעל, בתוקף עד " + res.validUntil +
            (sync.label && sync.label !== "מסונכרן" ? "\n\nשים לב: " + sync.label + " מול מה ששולם." : ""));
          reload();
        });
      });

      box.querySelector("[data-gv-reject]").addEventListener("click", function () {
        var note = window.prompt("מה לכתוב לתושב? (לא חובה)", "");
        if (note === null) return;
        var btn = box.querySelector("[data-gv-reject]");
        btn.disabled = true;
        if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymVerify");
        CBA.data.rejectGymPayment({ id: id, note: note }, function (res) {
          if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymVerify");
          if (!res || !res.ok) { btn.disabled = false; window.alert((res && res.error) || "הפעולה נכשלה."); return; }
          reload();
        });
      });
    });
  }

  /* ---------- הקמת מנוי ידנית ----------
     נועד למי שנרשם פיזית או שלא משתמש באפליקציה. שתי החלטות מכוונות:
     • המנוי נולד תמיד "ממתין לתשלום" (או "ממתין להצהרה") ולעולם לא "פעיל" —
       אימות התשלום נשאר ידני תמיד, גם כאן.
     • להצהרת הבריאות יש שתי דרכים: לסמן שהתקבלה בנייר (עם תאריך), או לשלוח
       לתושב מייל שיבקש ממנו למלא אותה באפליקציה. מנהל/ת המכון לא ממלא/ת את
       השאלון בשם התושב — הצהרה רפואית צריכה להיחתם ע"י מי שמצהיר. */
  function openCreate(container, reload) {
    var plans = (gaLast && gaLast.plans) || [];
    var el = document.createElement("div");
    el.id = "gym-create";
    el.className = "gym-wiz";
    el.innerHTML =
      '<div class="gym-wiz__backdrop" data-gc-close></div>' +
      '<aside class="gym-wiz__panel" role="dialog" aria-label="הקמת מנוי ידנית">' +
        '<div class="gym-wiz__head">' +
          '<div class="gym-wiz__title">הקמת מנוי ידנית</div>' +
          '<button type="button" class="gym-wiz__x" data-gc-close aria-label="סגירה">×</button>' +
        "</div>" +
        '<div class="gym-wiz__body">' +
          '<div class="gym-hint">האימייל חייב להיות רשום בטאב "תושבים" — משם נמשכים שם, בית ומזהה המשפחה.</div>' +
          '<div class="gym-field"><label>אימייל התושב</label>' +
            '<input type="email" data-gc="email" placeholder="name@example.com"></div>' +
          '<div class="gym-field"><label>שם פרטי (אפשר להשאיר ריק — יימשך מהתושבים)</label>' +
            '<input type="text" data-gc="firstName"></div>' +
          '<div class="gym-field"><label>שם משפחה</label><input type="text" data-gc="lastName"></div>' +
          '<div class="gym-field"><label>טלפון</label><input type="tel" data-gc="phone"></div>' +
          '<div class="gym-field"><label>תעודת זהות</label>' +
            '<input type="text" inputmode="numeric" data-gc="idNumber"></div>' +
          '<div class="gym-field"><label>תאריך לידה</label><input type="date" data-gc="birthDate"></div>' +
          '<div class="gym-field"><label>מסלול</label><select data-gc="planId">' +
            plans.map(function (p) {
              return '<option value="' + CBA.esc(p.id) + '">' + CBA.esc(p.name) +
                     " — " + p.total + " ₪</option>";
            }).join("") + "</select></div>" +
          '<div class="gym-field"><label>הצהרת בריאות</label>' +
            '<div class="gym-seg gym-seg--wide" data-gc-mode>' +
              '<button type="button" data-val="request" class="is-on">לשלוח בקשה במייל</button>' +
              '<button type="button" data-val="received">התקבלה בנייר</button>' +
            "</div></div>" +
          '<div class="gym-field" id="gc-decl-date" style="display:none"><label>תאריך ההצהרה שהתקבלה</label>' +
            '<input type="date" data-gc="declarationDate"></div>' +
          '<div class="gym-field"><label>הערה (לא נשלחת לתושב)</label>' +
            '<input type="text" data-gc="note"></div>' +
        "</div>" +
        '<div class="gym-wiz__foot">' +
          '<button type="button" class="btn-ghost" data-gc-close>ביטול</button>' +
          '<button type="button" class="btn-primary" data-gc-save>הקמת המנוי</button>' +
        "</div>" +
      "</aside>";
    document.body.appendChild(el);

    var data = { declarationMode: "request" };
    el.querySelectorAll("[data-gc]").forEach(function (n) {
      n.addEventListener("input", function () { data[n.dataset.gc] = n.value; });
      n.addEventListener("change", function () { data[n.dataset.gc] = n.value; });
      if (n.tagName === "SELECT") data[n.dataset.gc] = n.value;
    });
    el.querySelectorAll("[data-gc-mode] button").forEach(function (b) {
      b.addEventListener("click", function () {
        data.declarationMode = b.dataset.val;
        el.querySelectorAll("[data-gc-mode] button").forEach(function (x) { x.classList.remove("is-on"); });
        b.classList.add("is-on");
        el.querySelector("#gc-decl-date").style.display = (b.dataset.val === "received") ? "" : "none";
      });
    });
    function close() {
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymCreate");
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    el.querySelectorAll("[data-gc-close]").forEach(function (n) { n.addEventListener("click", close); });
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymCreate");

    el.querySelector("[data-gc-save]").addEventListener("click", function () {
      if (!String(data.email || "").trim()) { window.alert("צריך למלא אימייל."); return; }
      if (data.declarationMode === "received" && !data.declarationDate) {
        window.alert("צריך למלא את תאריך ההצהרה שהתקבלה."); return;
      }
      var btn = el.querySelector("[data-gc-save]");
      btn.disabled = true; btn.textContent = "מקים…";
      CBA.data.createGymMembership(data, function (res) {
        if (!res || !res.ok) {
          btn.disabled = false; btn.textContent = "הקמת המנוי";
          window.alert((res && res.error) || "ההקמה נכשלה.");
          return;
        }
        close();
        window.alert(res.status === "ממתין להצהרה"
          ? "המנוי הוקם. נשלח לתושב מייל עם בקשה למלא הצהרת בריאות."
          : "המנוי הוקם וממתין לתשלום. נשלח לתושב מייל עם הסכום.");
        reload();
      });
    });
  }

  CBA.screens.gymAdmin = {
    title: "מכון כושר",

    render: function (container) {
      gaWinScrollY = window.scrollY || 0;

      container.innerHTML =
        '<div class="screen-head screen-head--row">' +
          '<div>' +
            '<div class="screen-head__title">מכון כושר — ניהול</div>' +
            '<div class="screen-head__sub">מנויים, אישורי הרשמה ומעקב תשלומים</div>' +
          '</div>' +
          '<button type="button" class="btn-primary" id="ga-new">הקמת מנוי ידנית</button>' +
        '</div>' +
        '<div id="ga-kpis" class="gym-kpis"></div>' +
        '<div class="card club-card" id="ga-verify-card">' +
          '<div class="club-sec__title">ממתינים לאימות תשלום</div>' +
          '<div id="ga-verify">' + gaLoadingHTML() + '</div>' +
        '</div>' +
        '<div class="card club-card">' +
          '<div class="club-sec__title">מנויים</div>' +
          '<div id="ga-members">' + gaLoadingHTML() + '</div>' +
        '</div>' +
        '<div class="card club-card">' +
          '<div class="club-sec__title">מצב המודול</div>' +
          '<div id="ga-status" class="gym-check">' + gaLoadingHTML() + '</div>' +
        '</div>';

      var newBtn = container.querySelector("#ga-new");
      if (newBtn) newBtn.addEventListener("click", function () { openCreate(container, load); });

      var kpisEl    = container.querySelector("#ga-kpis");
      var membersEl = container.querySelector("#ga-members");
      var verifyEl  = container.querySelector("#ga-verify");
      var statusEl  = container.querySelector("#ga-status");

      // הצהרת פונקציה (לא ביטוי) — ולכן היא מורמת ונגישה גם לכפתור שנקשר למעלה.
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

          gaLast = res;
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
          // "פער" = כל מנוי שמצב הסנכרון שלו אינו ריק ואינו "מסונכרן".
          // מוצג ככרטיסון כי זה הדבר שהכי קל לשכוח ממנו.
          var gaps = members.filter(function (x) {
            var sv = String(x["מצב סנכרון"] || "").trim();
            return sv && sv !== "מסונכרן";
          }).length;

          kpisEl.innerHTML =
            kpi(active,  "מנויים פעילים", active ? "ok" : "muted") +
            kpi(waitDoc, "ממתינים לאישור רופא", waitDoc ? "warn" : "muted") +
            kpi(waitPay, "ממתינים לתשלום", waitPay ? "warn" : "muted") +
            kpi(waitVer, "ממתינים לאימות תשלום", waitVer ? "warn" : "muted") +
            kpi(expired, "פג תוקף", "muted") +
            kpi(gaps, "פערי תשלום", gaps ? "warn" : "muted");

          var waitingVerify = members.filter(function (x) {
            return String(x["סטטוס"] || "").trim() === "ממתין לאימות";
          });
          verifyEl.innerHTML = waitingVerify.length
            ? waitingVerify.map(verifyRowHTML).join("")
            : '<div class="club-empty">אין תשלומים שממתינים לאימות.</div>';
          bindVerifyActions(verifyEl, load);

          membersEl.innerHTML = members.length
            ? members.map(memberRowHTML).join("")
            : '<div class="gym-note">עדיין אין מנויים.<br>' +
              'תושבים יכולים להירשם לבד במסך "מתקנים ← מכון כושר", ואפשר גם להקים מנוי ידנית מהכפתור למעלה.</div>';
          bindMemberActions(membersEl, load);

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
