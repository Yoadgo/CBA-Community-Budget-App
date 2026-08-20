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
                 (m["בתוקף עד"] ? " · בתוקף עד " + CBA.esc(fmtDate(m["בתוקף עד"])) : "") +
               "</div>" +
               (flags ? '<div class="gym-row__flags">סומן "כן": ' + CBA.esc(flags) + "</div>" : "") +
             "</div>" +
             '<div class="gym-row__side">' +
               '<span class="gym-pill gym-pill--' + tone + '">' + CBA.esc(status) + "</span>" +
               // אם כבר יש הצהרה חתומה — הפעולה הטבעית היא לצפות בה, לא לבקש
               // אותה שוב (יועד העיר על זה בצדק, 2026-08-20). "בקשת הצהרה"
               // נשארת רק למי שאין לו הצהרה, או שההצהרה שלו כבר לא בתוקף.
               (m["תאריך חתימה"]
                 ? '<button type="button" class="btn-ghost" data-ga-view="' + CBA.esc(m["מזהה"] || "") +
                   '">צפייה בהצהרה</button>'
                 : "") +
               (status === "ממתין להצהרה" || m["תאריך חתימה"]
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
               '<button type="button" class="btn-ghost" data-ga-edit="' +
                 CBA.esc(m["מזהה"] || "") + '">עריכה</button>' +
               (m["מצב סנכרון"] && m["מצב סנכרון"] !== "מסונכרן"
                 ? '<span class="gym-pill gym-pill--warn">' + CBA.esc(m["מצב סנכרון"]) + "</span>"
                 : "") +
             "</div>" +
           "</div>";
  }

  function memberById(id) {
    var members = (gaLast && gaLast.members) || [];
    for (var i = 0; i < members.length; i++) {
      if (String(members[i]["מזהה"] || "").trim() === String(id).trim()) return members[i];
    }
    return null;
  }
  function memberName(m) {
    if (!m) return "";
    return ((m["שם פרטי"] || "") + " " + (m["שם משפחה"] || "")).trim() || m["אימייל"] || "";
  }
  /* תאריכים מהגיליון מגיעים כאובייקטי Date של Apps Script, כלומר כמחרוזת ISO
     ב-UTC אחרי JSON ("2027-02-27T22:00:00.000Z" = 28.2.2027 בשעון ישראל).
     חיתוך המחרוזת היה נותן יום מוקדם ביום; לכן כל המרה שיש בה "T" עוברת דרך
     Date ומשתמשת בגטרים המקומיים. */
  function asDate(v) {
    var t = String(v == null ? "" : v).trim();
    if (!t) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) t += "T00:00:00";
    var d = new Date(t);
    return isNaN(d.getTime()) ? null : d;
  }
  function toMonthInput(v) {
    var d = asDate(v);
    return d ? (d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")) : "";
  }
  function toDateInput(v) {
    var d = asDate(v);
    return d ? (d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
                "-" + String(d.getDate()).padStart(2, "0")) : "";
  }
  // לתצוגה — בפורמט הישראלי, לא ISO גולמי
  function fmtDate(v) {
    var d = asDate(v);
    if (!d) return String(v == null ? "" : v).trim();
    return String(d.getDate()).padStart(2, "0") + "." +
           String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  }

  /* ---------- מגירת טופס גנרית (2026-08-20) ----------
     יועד: "השיטה של התיעוד כפופ אפ של הדפדפן - לא נוחה". הארכת מנוי ורישום
     תשלום ידני נעשו עד עכשיו בשרשרת של שניים-שלושה window.prompt אפורים,
     בלי ולידציה, בלי הקשר, ובלי דרך לחזור אחורה. במקום זה — מגירה אחת עם כל
     השדות ביחד, בדיוק כמו מגירת ההקמה הידנית שכבר קיימת במסך.

     שדה: {key, label, type, value, options, hint, required, min, max}
     onSave(values, ui) — ui.busy(txt)/ui.done()/ui.error(txt)/ui.close(). */
  var GYM_STATUSES = ["ממתין להצהרה", "ממתין לאישור רופא", "ממתין לאישור",
    "ממתין לתשלום", "ממתין לאימות", "פעיל", "פג תוקף", "מוקפא", "נדחה", "בוטל"];

  function fieldHTML(f) {
    var val = f.value == null ? "" : String(f.value);
    var body;
    if (f.type === "select") {
      body = '<select data-gf="' + CBA.esc(f.key) + '">' +
        (f.options || []).map(function (o) {
          var v = (o && o.value !== undefined) ? o.value : o;
          var t = (o && o.text !== undefined) ? o.text : o;
          return '<option value="' + CBA.esc(String(v)) + '"' +
                 (String(v) === val ? " selected" : "") + ">" + CBA.esc(String(t)) + "</option>";
        }).join("") + "</select>";
    } else if (f.type === "textarea") {
      body = '<textarea data-gf="' + CBA.esc(f.key) + '" rows="3">' + CBA.esc(val) + "</textarea>";
    } else {
      body = '<input type="' + CBA.esc(f.type || "text") + '" data-gf="' + CBA.esc(f.key) + '"' +
             ' value="' + CBA.esc(val) + '"' +
             (f.placeholder ? ' placeholder="' + CBA.esc(f.placeholder) + '"' : "") +
             (f.min !== undefined ? ' min="' + CBA.esc(String(f.min)) + '"' : "") + ">";
    }
    return '<div class="gym-field"><label>' + CBA.esc(f.label) + "</label>" + body +
           (f.hint ? '<div class="gym-hint gym-hint--sm">' + CBA.esc(f.hint) + "</div>" : "") +
           "</div>";
  }

  function openFormDrawer(opts) {
    var el = document.createElement("div");
    el.className = "gym-wiz";
    el.innerHTML =
      '<div class="gym-wiz__backdrop" data-gf-close></div>' +
      '<aside class="gym-wiz__panel" role="dialog" aria-label="' + CBA.esc(opts.title) + '">' +
        '<div class="gym-wiz__head">' +
          '<div class="gym-wiz__title">' + CBA.esc(opts.title) + "</div>" +
          '<button type="button" class="gym-wiz__x" data-gf-close aria-label="סגירה">×</button>' +
        "</div>" +
        '<div class="gym-wiz__body">' +
          (opts.subtitle ? '<div class="gym-hint">' + CBA.esc(opts.subtitle) + "</div>" : "") +
          (opts.fields || []).map(fieldHTML).join("") +
          (opts.extraHTML || "") +
          '<div class="gym-form__err" data-gf-err hidden></div>' +
        "</div>" +
        '<div class="gym-wiz__foot">' +
          '<button type="button" class="btn-ghost" data-gf-close>ביטול</button>' +
          '<button type="button" class="btn-primary' + (opts.danger ? " is-danger" : "") +
            '" data-gf-save>' + CBA.esc(opts.okText || "שמירה") + "</button>" +
        "</div>" +
      "</aside>";
    document.body.appendChild(el);

    var dirtyKey = "gymForm:" + Math.random().toString(36).slice(2);
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty(dirtyKey, false);
    function close() {
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty(dirtyKey);
      document.removeEventListener("keydown", onKey, true);
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    function onKey(e) { if (e.key === "Escape") { e.preventDefault(); close(); } }
    document.addEventListener("keydown", onKey, true);
    el.querySelectorAll("[data-gf-close]").forEach(function (n) { n.addEventListener("click", close); });

    var errEl = el.querySelector("[data-gf-err]");
    var saveBtn = el.querySelector("[data-gf-save]");
    var release = null;
    var ui = {
      close: close,
      el: el,
      error: function (msg) {
        errEl.textContent = msg || "";
        errEl.hidden = !msg;
        if (msg) errEl.scrollIntoView({ block: "nearest" });
      },
      busy: function (txt) { release = CBA.ui.busy(saveBtn, txt || "שומר…"); },
      done: function () { if (release) { release(); release = null; } }
    };

    function values() {
      var out = {};
      el.querySelectorAll("[data-gf]").forEach(function (n) { out[n.dataset.gf] = n.value; });
      return out;
    }
    saveBtn.addEventListener("click", function () {
      ui.error("");
      opts.onSave(values(), ui);
    });
    // מיקוד לשדה הראשון, כמו במודלים של CBA.ui
    setTimeout(function () {
      var first = el.querySelector("[data-gf]");
      if (first) first.focus();
    }, 60);
    return ui;
  }

  /* התראת סנכרון אחרי פעולה — אף פעם לא *במקום* הפעולה. יועד היה מפורש:
     המערכת מודדת ומתריעה, לא חוסמת. */
  function afterActivate(res, verb) {
    var sync = res.sync || {};
    var msg = verb + ", בתוקף עד " + (res.validUntil || "");
    if (sync.label && sync.label !== "מסונכרן") {
      CBA.ui.alert(msg + ".\n\nשימי לב: " + sync.label + " מול מה ששולם.", "בוצע");
    } else {
      CBA.ui.toast(msg);
    }
  }

  /* ---------- עריכת מנוי ----------
     יועד: "צריך אפשרות לדחות את המנוי ולהרחיב את אפשרויות העריכה".
     עד עכשיו היו רק שתי פעולות נקודתיות (הארכה, רישום תשלום) ושום דרך לתקן
     טעות: מסלול שנבחר לא נכון, מחיר מוסכם חריג, תאריך התחלה שגוי, או מנוי
     שצריך פשוט להידחות. הכל יושב עכשיו במגירה אחת מול פעולת שרת אחת
     (updateGymMembership), שרושמת ביומן בדיוק מה השתנה ומי שינה.

     דחייה וביטול הם לא כפתור נפרד אלא בחירת סטטוס — עם שדה סיבה שהופך
     לחובה כשעוברים לאחד מהם, כי זה בדיוק מה שהתושב יקבל במייל. */
  function openEdit(id, reload) {
    var m = memberById(id);
    if (!m) { CBA.ui.alert("לא נמצאה הרשומה."); return; }
    var plans = (gaLast && gaLast.plans) || [];
    var curStatus = String(m["סטטוס"] || "").trim();
    var curPlanId = "";
    for (var i = 0; i < plans.length; i++) if (plans[i].name === m["מסלול"]) curPlanId = plans[i].id;

    var ui = openFormDrawer({
      title: "עריכת מנוי — " + memberName(m),
      subtitle: "מזהה " + (m["מזהה"] || "") + " · " + (m["אימייל"] || "") +
                (m["מצב סנכרון"] ? " · " + m["מצב סנכרון"] : ""),
      okText: "שמירת השינויים",
      fields: [
        { key: "planId", label: "מסלול", type: "select", value: curPlanId,
          options: [{ value: "", text: "— בלי שינוי —" }].concat(plans.map(function (p) {
            return { value: p.id, text: p.name + " — " + p.total + " ₪" };
          })),
          hint: "החלפת מסלול מעדכנת גם את המחיר המוסכם, אלא אם תזיני מחיר משלך" },
        { key: "price", label: "מחיר מוסכם (₪)", type: "number", value: m["מחיר מוסכם"] || "", min: 0 },
        { key: "startDate", label: "תאריך התחלה", type: "date", value: toDateInput(m["תאריך התחלה"]) },
        { key: "validUntil", label: "בתוקף עד חודש", type: "month", value: toMonthInput(m["בתוקף עד"]) },
        { key: "status", label: "סטטוס", type: "select", value: curStatus, options: GYM_STATUSES,
          hint: 'מעבר ל"נדחה" או ל"בוטל" שולח מייל לתושב עם הסיבה שתכתבי' },
        { key: "note", label: "הערות מנהל (פנימי)", type: "textarea", value: m["הערות מנהל"] || "" },
        { key: "reason", label: "סיבת השינוי", type: "text",
          placeholder: "נרשמת ביומן; בדחייה/ביטול גם נשלחת לתושב" }
      ],
      onSave: function (v, dlg) {
        var newStatus = String(v.status || "").trim();
        var isKill = (newStatus === "נדחה" || newStatus === "בוטל") && newStatus !== curStatus;
        if (isKill && !String(v.reason || "").trim()) {
          dlg.error("כשדוחים או מבטלים מנוי חייבים לכתוב סיבה — היא נשלחת לתושב במייל.");
          return;
        }
        var payload = { id: id, reason: v.reason || "" };
        if (v.planId && v.planId !== curPlanId) payload.planId = v.planId;
        if (String(v.price) !== String(m["מחיר מוסכם"] || "")) payload.price = v.price;
        if (v.startDate && v.startDate !== toDateInput(m["תאריך התחלה"])) payload.startDate = v.startDate;
        if (v.validUntil && v.validUntil !== toMonthInput(m["בתוקף עד"])) payload.validUntil = v.validUntil;
        if (newStatus && newStatus !== curStatus) payload.status = newStatus;
        if (String(v.note || "") !== String(m["הערות מנהל"] || "")) payload.note = v.note || "";

        var touched = Object.keys(payload).filter(function (k) { return k !== "id" && k !== "reason"; });
        if (!touched.length) { dlg.error("לא שינית שום שדה."); return; }

        function send() {
          dlg.busy("שומר…");
          CBA.data.updateGymMembership(payload, function (res) {
            dlg.done();
            if (!res || !res.ok) { dlg.error((res && res.error) || "השמירה נכשלה."); return; }
            dlg.close();
            var sync = res.sync || {};
            if (sync.label && sync.label !== "מסונכרן") {
              CBA.ui.alert("השינויים נשמרו.\n\nשימי לב: " + sync.label + " מול מה ששולם.", "נשמר");
            } else {
              CBA.ui.toast("השינויים נשמרו");
            }
            reload();
          });
        }

        if (isKill) {
          CBA.ui.confirm("לשנות את הסטטוס ל\"" + newStatus + "\"?\n\n" +
                         memberName(m) + " יקבל/תקבל על כך מייל עם הסיבה שכתבת.",
                         { title: newStatus === "נדחה" ? "דחיית מנוי" : "ביטול מנוי",
                           okText: newStatus, danger: true })
            .then(function (ok) { if (ok) send(); });
        } else {
          send();
        }
      }
    });
    return ui;
  }

  /* ---------- צפייה בהצהרת הבריאות ----------
     כל מה שצריך כבר נמצא בתשובת gymList: השאלות (עם ה"כותרת" הקצרה שהיא גם
     שם העמודה) והשורה של המנוי. אין קריאת שרת נוספת. */
  function openDeclaration(id) {
    var members = (gaLast && gaLast.members) || [];
    var questions = (gaLast && gaLast.questions) || [];
    var m = null;
    for (var i = 0; i < members.length; i++) {
      if (String(members[i]["מזהה"] || "").trim() === String(id).trim()) { m = members[i]; break; }
    }
    if (!m) { CBA.ui.alert("לא נמצאה הרשומה."); return; }

    var name = ((m["שם פרטי"] || "") + " " + (m["שם משפחה"] || "")).trim();
    var flagged = String(m["שאלות שנענו בכן"] || "").trim();
    var sig = m["קישור חתימה"] || "";

    var rows = questions.map(function (q) {
      var ans = String(m[q.label] == null ? "" : m[q.label]).trim();
      var isYes = ans === "כן";
      return '<div class="gym-decl__q' + (isYes ? " is-yes" : "") + '">' +
               '<div class="gym-decl__qtext">' + CBA.esc(q.text || q.label) + "</div>" +
               '<div class="gym-decl__ans">' + CBA.esc(ans || "—") + "</div>" +
             "</div>";
    }).join("");

    var el = document.createElement("div");
    el.id = "gym-decl";
    el.className = "gym-wiz";
    el.innerHTML =
      '<div class="gym-wiz__backdrop" data-gd-close></div>' +
      '<aside class="gym-wiz__panel" role="dialog" aria-label="הצהרת בריאות">' +
        '<div class="gym-wiz__head">' +
          '<div class="gym-wiz__title">הצהרת בריאות — ' + CBA.esc(name) + "</div>" +
          '<button type="button" class="gym-wiz__x" data-gd-close aria-label="סגירה">×</button>' +
        "</div>" +
        '<div class="gym-wiz__body">' +
          '<div class="gym-kv"><span>נחתמה בתאריך</span><span>' +
            CBA.esc(fmtDate(m["תאריך חתימה"]) || "—") + "</span></div>" +
          '<div class="gym-kv"><span>ת.ז.</span><span>' + CBA.esc(m["ת.ז."] || "—") + "</span></div>" +
          '<div class="gym-kv"><span>תאריך לידה</span><span>' + CBA.esc(fmtDate(m["תאריך לידה"]) || "—") + "</span></div>" +
          '<div class="gym-kv"><span>אישור תקנון</span><span>' + CBA.esc(m["אישור תקנון"] || "—") + "</span></div>" +
          (flagged
            ? '<div class="gym-decl__flag">סומן "כן" ב: ' + CBA.esc(flagged) +
              ' — נדרשת תעודה רפואית לפי התקנון.</div>'
            : '<div class="gym-decl__ok">כל התשובות "לא" — אין דגל בריאות.</div>') +
          '<div class="gym-decl__title">תשובות השאלון</div>' +
          (rows || '<div class="gym-note">אין תשובות שמורות לרשומה הזו.</div>') +
          '<div class="gym-decl__title">חתימה</div>' +
          (sig && sig.indexOf("http") === 0
            ? '<a class="btn-ghost" href="' + CBA.esc(sig) + '" target="_blank" rel="noopener">פתיחת החתימה</a>'
            : '<div class="gym-note">' + CBA.esc(sig || "לא נשמרה חתימה דיגיטלית") + "</div>") +
        "</div>" +
        '<div class="gym-wiz__foot">' +
          '<button type="button" class="btn-ghost" data-gd-close>סגירה</button>' +
          '<button type="button" class="btn-ghost" data-gd-request="' + CBA.esc(id) + '">בקשת הצהרה חדשה</button>' +
        "</div>" +
      "</aside>";
    document.body.appendChild(el);
    function close() { if (el.parentNode) el.parentNode.removeChild(el); }
    el.querySelectorAll("[data-gd-close]").forEach(function (n) { n.addEventListener("click", close); });
    el.querySelector("[data-gd-request]").addEventListener("click", function () {
      close();
      requestDeclaration(id, function () { if (gaReload) gaReload(); });
    });
  }

  // מוחזק כדי שהמציג יוכל לרענן אחרי "בקשת הצהרה חדשה"
  var gaReload = null;

  function requestDeclaration(id, done, btn) {
    CBA.ui.confirm('לשלוח לתושב מייל עם בקשה למלא הצהרת בריאות?\n' +
                   'המנוי יעבור לסטטוס "ממתין להצהרה" עד שימלא אותה.',
                   { title: "בקשת הצהרת בריאות", okText: "שליחה" })
      .then(function (ok) {
        if (!ok) return;
        var release = CBA.ui.busy(btn, "שולח מייל…");
        CBA.data.requestGymDeclaration(id, function (res) {
          release();
          if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "השליחה נכשלה."); return; }
          CBA.ui.toast("המייל נשלח לתושב");
          if (done) done();
        });
      });
  }

  function bindMemberActions(root, reload) {
    gaReload = reload;
    root.querySelectorAll("[data-ga-view]").forEach(function (btn) {
      btn.addEventListener("click", function () { openDeclaration(btn.dataset.gaView); });
    });
    // הארכה — זמינה תמיד, גם בלי תשלום חדש. אם היא יוצרת פער מול מה ששולם,
    // מוצגת התראה **אחרי** הפעולה. אף פעם לא חוסמים, זו דרישה מפורשת.
    root.querySelectorAll("[data-ga-extend]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaExtend;
        var m = memberById(id) || {};
        openFormDrawer({
          title: "הארכת מנוי — " + memberName(m),
          subtitle: "ההארכה תמיד אפשרית, גם בלי תשלום חדש. אם ייווצר פער מול מה ששולם — נציג התראה, לא נחסום.",
          okText: "הארכה",
          fields: [
            { key: "validUntil", label: "בתוקף עד חודש", type: "month",
              value: defaultValidUntil(planMonthsFor(btn.dataset.gaMonths)),
              hint: "התוקף הקיים: " + (fmtDate(m["בתוקף עד"]) || "—") },
            { key: "reason", label: "סיבת ההארכה (נרשמת ביומן)", type: "text",
              placeholder: "למשל: פיצוי על שבוע סגירה" }
          ],
          onSave: function (v, ui) {
            if (!v.validUntil) { ui.error("צריך לבחור עד איזה חודש להאריך."); return; }
            ui.busy("מאריך…");
            CBA.data.extendGymMembership({ id: id, validUntil: v.validUntil, reason: v.reason || "" },
              function (res) {
                ui.done();
                if (!res || !res.ok) { ui.error((res && res.error) || "ההארכה נכשלה."); return; }
                ui.close();
                afterActivate(res, "המנוי הוארך");
                reload();
              });
          }
        });
      });
    });

    // רישום תשלום ידני — למי ששילם במזומן או מחוץ לאפליקציה. מפעיל את המנוי
    // באותו מסלול בדיוק כמו אימות רגיל (gymActivate_ בשרת).
    root.querySelectorAll("[data-ga-cash]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaCash;
        var m = memberById(id) || {};
        openFormDrawer({
          title: "רישום תשלום ידני — " + memberName(m),
          subtitle: "למי ששילם במזומן או מחוץ לאפליקציה. המנוי יופעל באותו מסלול בדיוק כמו באימות רגיל.",
          okText: "רישום והפעלה",
          fields: [
            { key: "amount", label: "סכום שהתקבל (₪)", type: "number",
              value: btn.dataset.gaPrice || "", min: 0,
              hint: "מחיר מוסכם: " + (m["מחיר מוסכם"] || "—") + " ₪" },
            { key: "validUntil", label: "בתוקף עד חודש", type: "month",
              value: defaultValidUntil(planMonthsFor(m["מסלול"])) },
            { key: "method", label: "אמצעי תשלום", type: "select", value: "מזומן",
              options: ["מזומן", "העברה בנקאית", "צ׳ק", "ביט", "פייבוקס", "אחר"] }
          ],
          onSave: function (v, ui) {
            if (!Number(v.amount)) { ui.error("צריך להזין את הסכום שהתקבל."); return; }
            if (!v.validUntil) { ui.error("צריך לבחור עד איזה חודש המנוי בתוקף."); return; }
            ui.busy("מפעיל מנוי…");
            CBA.data.recordGymPayment(
              { id: id, amount: Number(v.amount), validUntil: v.validUntil, method: v.method || "מזומן" },
              function (res) {
                ui.done();
                if (!res || !res.ok) { ui.error((res && res.error) || "הרישום נכשל."); return; }
                ui.close();
                afterActivate(res, "המנוי הופעל");
                reload();
              });
          }
        });
      });
    });

    root.querySelectorAll("[data-ga-declare]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaDeclare;
        if (id) requestDeclaration(id, reload, btn);
      });
    });

    // עריכה מלאה — מסלול, מחיר, תאריכים, סטטוס והערה במקום אחד
    root.querySelectorAll("[data-ga-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () { openEdit(btn.dataset.gaEdit, reload); });
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
                 (m["דווח בתאריך"] ? " · דווח " + CBA.esc(fmtDate(m["דווח בתאריך"])) : "") +
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
        var btn = box.querySelector("[data-gv-confirm]");
        if (!amount) { CBA.ui.alert("צריך להזין את הסכום שהתקבל."); return; }
        if (!validUntil) { CBA.ui.alert("צריך לבחור עד איזה חודש המנוי בתוקף."); return; }
        var release = CBA.ui.busy(btn, "מפעיל מנוי…");
        CBA.data.confirmGymPayment({ id: id, amount: amount, validUntil: validUntil }, function (res) {
          release();
          if (!res || !res.ok) {
            CBA.ui.alert((res && res.error) || "האימות נכשל.");
            return;
          }
          // ההתראה על פער מוצגת **אחרי** הפעולה ולא במקומה — לא חוסמים.
          afterActivate(res, "המנוי הופעל");
          reload();
        });
      });

      box.querySelector("[data-gv-reject]").addEventListener("click", function () {
        var btn = box.querySelector("[data-gv-reject]");
        openFormDrawer({
          title: "לא נמצא תשלום",
          subtitle: "המנוי יחזור ל\"ממתין לתשלום\" והתושב יקבל מייל שיבקש ממנו לבדוק שוב. זה לא דוחה את המנוי.",
          okText: "החזרה לממתין לתשלום",
          fields: [
            { key: "note", label: "מה לכתוב לתושב (לא חובה)", type: "textarea",
              placeholder: "למשל: לא מצאנו העברה בסכום הזה בפייבוקס" }
          ],
          onSave: function (v, ui) {
            ui.busy("שולח…");
            CBA.data.rejectGymPayment({ id: id, note: v.note || "" }, function (res) {
              ui.done();
              if (!res || !res.ok) { ui.error((res && res.error) || "הפעולה נכשלה."); return; }
              ui.close();
              CBA.ui.toast("הדיווח הוחזר לתושב");
              reload();
            });
          }
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
          '<div class="gym-form__err" data-gc-err hidden></div>' +
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
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymCreate", false);

    el.querySelector("[data-gc-save]").addEventListener("click", function () {
      var errBox = el.querySelector("[data-gc-err]");
      function showErr(msg) { errBox.textContent = msg || ""; errBox.hidden = !msg; }
      showErr("");
      if (!String(data.email || "").trim()) { showErr("צריך למלא אימייל."); return; }
      if (data.declarationMode === "received" && !data.declarationDate) {
        showErr("צריך למלא את תאריך ההצהרה שהתקבלה."); return;
      }
      var btn = el.querySelector("[data-gc-save]");
      var release = CBA.ui.busy(btn, "מקים מנוי…");
      CBA.data.createGymMembership(data, function (res) {
        release();
        if (!res || !res.ok) {
          showErr((res && res.error) || "ההקמה נכשלה.");
          return;
        }
        close();
        CBA.ui.alert(res.status === "ממתין להצהרה"
          ? "המנוי הוקם. נשלח לתושב מייל עם בקשה למלא הצהרת בריאות."
          : "המנוי הוקם וממתין לתשלום. נשלח לתושב מייל עם הסכום.", "המנוי הוקם");
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
