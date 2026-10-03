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

  // שלד תואם-צורה (2026-08-25) — אריחי הסיכום העליונים ואז הטבלה, בדיוק
  // המבנה שיופיע כשהנתונים יחזרו. ר' js/ui/skeleton.js.
  function gaLoadingHTML() {
    return CBA.skel.stats(4) + CBA.skel.table(6, 5);
  }

  /* "מצב המודול" (2026-09-16) — יועד: היה רשימת-קריאה עם מלא פריטים שלא עוזרים בשוטף (כמה טאבים נוצרו, כמה מקטעי תקנון…). הוחלף בכרטיס פעולה: רק הגדרות שמנהל/ת המכון באמת עורך/ת שוטף — כל שורה נותנת ללחוץ "עדכון" שפותח מגירה עם שדה אחד (openFormDrawer, אותו דפוס שכבר משמש להארכה/לרישום תשלום). קוד הכניסה לעולם אף פעם לא מוצג כאן — השרת מסתיר אותו מהמסך הזה בכוונה (ראו handleGymList_), אז השדה נשאר ריק. */
  function settingRowHTML(o) {
    return '<div class="gym-check__row">' +
             '<span class="gym-check__mark gym-check__mark--' + (o.hasValue ? 'on' : 'off') + '">' +
               (o.hasValue ? '✓' : '!') + '</span>' +
             '<span class="gym-check__label">' + CBA.esc(o.label) + '</span>' +
             '<span class="gym-check__val">' + CBA.esc(o.valueText) + '</span>' +
             '<button type="button" class="btn-ghost" data-ga-setting="' + CBA.esc(o.key) +
               '" data-ga-setting-value="' + CBA.esc(o.rawValue || "") + '">עדכון</button>' +
           '</div>';
  }

  /* סופר מנויים לפי סטטוס. הסטטוסים נכתבים בעברית בגיליון (ר' האפיון), ולכן
     ההשוואה היא על המחרוזת עצמה — בדיוק כמו שאר המסכים שקוראים מהגיליון. */
  function countBy(members, status) {
    return members.filter(function (m) {
      return String(m['סטטוס'] || '').trim() === status;
    }).length;
  }

  /* ---------- שורת מנוי ברשימה ----------
     26.9 (בקשת יועד: "מסך אחד, שני כרטיסים, קומפקטי") — שורה אחת לכל מנוי:
     שם · מד תוקף · סטטוס · פעולה ראשית אחת (רק כשיש מה לעשות) · תפריט ⋯ לכל
     השאר. תפריט ⋯ הוא <details> מקורי — הכפתורים שבו נושאים את אותם
     data-ga-* כמו קודם, ולכן bindMemberActions לא השתנה. */
  var GA_TONE = {
    "פעיל": "ok", "פג תוקף": "muted", "מוקפא": "muted",
    "ממתין לאישור רופא": "danger", "נדחה": "danger", "בוטל": "danger"
  };
  /* מה דורש ממך פעולה — מופיע ראשון ומסומן. */
  /* GMB1 (גל 8, 1.10.26) — "ממתין לאישור" (GYM_ST_REVIEW בשרת) נספר כממתין לך וממוין עם שאר הממתינים למנהל */
  var GA_ATTN = { "ממתין לאימות": 1, "ממתין לאישור רופא": 1, "ממתין לאישור": 1 };
  var GA_ORDER = { "ממתין לאימות": 0, "ממתין לאישור רופא": 1, "ממתין לאישור": 2, "ממתין לתשלום": 3, "ממתין להצהרה": 4, "פעיל": 5, "פג תוקף": 6 };
  var gaFilter = "all";
  var gaNuki = { on: false, byId: {}, state: {} };   /* גישת Nuki לפי מזהה מנוי (רק כשהמכון בדלת) */

  function daysLeft(v) {
    var d = asDate(v); if (!d) return null;
    var t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - t.getTime()) / 86400000);
  }
  function meterHTML(m) {
    var left = daysLeft(m["בתוקף עד"]);
    if (left === null) return '<div class="ga-meter ga-meter--none"></div>';
    var total = (planMonthsFor(m["מסלול"]) || 12) * 30.4;
    var pct = Math.max(0, Math.min(100, Math.round(left / total * 100)));
    var tone = left < 0 ? "d" : left <= 30 ? "w" : "ok";
    return '<div class="ga-meter"><i class="ga-meter--' + tone + '" style="width:' + (left < 0 ? 100 : Math.max(4, pct)) + '%"></i></div>' +
      '<div class="ga-meter__t">עד ' + CBA.esc(fmtDate(m["בתוקף עד"])) +
        (left < 0 ? " · פג" : left <= 60 ? " · עוד " + left + " ימים" : "") + "</div>";
  }
  function nukiPillHTML(m) {
    if (!gaNuki.on) return "";
    var uid = gaNuki.byId[String(m["מזהה"] || "")];
    var st = uid ? (gaNuki.state[uid] || {}).state : "";
    if (st === "active") return '<span class="gym-pill gym-pill--ok">Nuki פעיל</span>';
    if (st === "sent") return '<span class="gym-pill gym-pill--muted">הזמנה נשלחה</span>';
    if (st === "error") return '<span class="gym-pill gym-pill--warn">Nuki: תקלה</span>';
    return "";
  }
  function memberRowHTML(m) {
    var id = CBA.esc(m["מזהה"] || "");
    var status = String(m["סטטוס"] || "").trim();
    var tone = GA_TONE[status] || "warn";
    var name = ((m["שם פרטי"] || "") + " " + (m["שם משפחה"] || "")).trim() || m["אימייל"] || "";
    var flags = String(m["שאלות שנענו בכן"] || "").trim();
    var gap = m["מצב סנכרון"] && m["מצב סנכרון"] !== "מסונכרן" ? String(m["מצב סנכרון"]) : "";
    var primary =
      status === "ממתין לאימות" ? '<button type="button" class="btn-primary btn-sm" data-ga-verify-open="' + id + '">אימות תשלום</button>' :
      status === "ממתין לתשלום" ? '<button type="button" class="btn-ghost btn-sm" data-ga-cash="' + id + '" data-ga-price="' + CBA.esc(String(m["מחיר מוסכם"] || "")) + '">רישום תשלום</button>' :
      status === "ממתין לאישור רופא" && m["תאריך חתימה"] ? '<button type="button" class="btn-primary btn-sm" data-ga-view="' + id + '">בדיקת הצהרה</button>' :
      /* GMB1 (גל 8, 1.10.26) — פעולה ראשית ל"ממתין לאישור": פותחת את "עריכת מנוי" עם סטטוס "ממתין לתשלום" (המעבר שהשרת עושה באישור אוטומטי) */
      status === "ממתין לאישור" ? '<button type="button" class="btn-primary btn-sm" data-ga-approve="' + id + '">אישור</button>' : "";
    /* 3.10.26 (בקשת יועד: "הכול באותו כרטיס, בלי שלוש נקודות — מבלבל") — כל הפעולות
       מוצגות בשורת כפתורים קבועה בתחתית הכרטיס. הכפתור הראשי של הסטטוס נשאר מודגש
       למעלה ולא חוזר בשורה. */
    var menu =
      (m["תאריך חתימה"] ? '<button type="button" data-ga-view="' + id + '">צפייה בהצהרה</button>' : "") +
      (status === "ממתין להצהרה" || m["תאריך חתימה"] ? "" : '<button type="button" data-ga-declare="' + id + '">בקשת הצהרה</button>') +
      (status === "פעיל" || status === "פג תוקף" ? '<button type="button" data-ga-extend="' + id + '" data-ga-months="' + CBA.esc(String(m["מסלול"] || "")) + '">הארכה</button>' : "") +
      /* 3.10.26 (בקשת יועד: "גמישות רחבה למנהל") — רישום תשלום והפעלה ידנית פתוחים בכל סטטוס.
         ההגנה מטעויות היא חלון אישור עם סיכום, ואזהרה אדומה כשחסרה הצהרה או תשלום. */
      '<button type="button" data-ga-cash="' + id + '" data-ga-price="' + CBA.esc(String(m["מחיר מוסכם"] || "")) + '">רישום תשלום ידני</button>' +
      (status === "פעיל" ? "" : '<button type="button" data-ga-activate="' + id + '">הפעלה ידנית</button>') +
      '<button type="button" data-ga-paylog="' + id + '">יומן תשלומים</button>' +
      '<button type="button" data-ga-edit="' + id + '">עריכה</button>' +
      '<button type="button" class="ga-menu__danger" data-ga-delete="' + id + '">מחיקה</button>';
    if (primary.indexOf("data-ga-cash") !== -1) {
      menu = menu.replace(/<button type="button" data-ga-cash="[^>]*>[^<]*<\/button>/, "");
    }
    if (primary.indexOf("data-ga-view") !== -1) {
      menu = menu.replace(/<button type="button" data-ga-view="[^>]*>[^<]*<\/button>/, "");
    }
    return '<div class="ga-row' + (GA_ATTN[status] ? " is-attn" : "") + '" data-ga-row="' + id + '">' +
             '<div class="ga-row__who"><b>' + CBA.esc(name) + (flags ? ' <span class="gym-pill gym-pill--danger">דגל</span>' : "") + "</b>" +
               "<small>" + (m["מספר בית"] ? "בית " + CBA.esc(m["מספר בית"]) + " · " : "") + CBA.esc(m["מסלול"] || "") + "</small>" +
               (flags ? '<small class="ga-row__flags">סומן "כן": ' + CBA.esc(flags) + "</small>" : "") + "</div>" +
             '<div class="ga-row__valid">' + (status === "פעיל" || status === "פג תוקף" ? meterHTML(m) : "") + "</div>" +
             '<div class="ga-row__pills"><span class="gym-pill gym-pill--' + tone + '">' + CBA.esc(status) + "</span>" +
               nukiPillHTML(m) + (gap ? '<span class="gym-pill gym-pill--warn">' + CBA.esc(gap) + "</span>" : "") + "</div>" +
             '<div class="ga-row__acts">' + primary +
               "</div>" +
             '<div class="ga-row__btns">' + menu + "</div>" +
             (status === "ממתין לאימות" ? '<div class="ga-row__verify" hidden>' + verifyRowHTML(m) + "</div>" : "") +
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

  /* GMA2 — חיווט "📷 מילוי מצילום" במגירת רישום תשלום ידני */
  function gaWireScan(ui, m) {
    var el = ui && ui.el, inp = el && el.querySelector("[data-ga-scan]"), msg = el && el.querySelector("[data-ga-scanmsg]");
    if (!inp) return;
    function say(t) { msg.hidden = !t; msg.textContent = t || ""; }
    function set(key, v) { var f = el.querySelector('[data-gf="' + key + '"]'); if (f && v !== "" && v != null) { f.value = v; return true; } return false; }
    inp.addEventListener("change", function () {
      var file = inp.files && inp.files[0];
      inp.value = "";
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { say("הקובץ גדול מדי (מעל 8MB)."); return; }
      say("קורא את הצילום…");
      var r = new FileReader();
      r.onload = function () {
        CBA.data.scanGymPayment(String(r.result).split(",")[1] || "", file.type || "image/jpeg", function (res) {
          if (!el.isConnected) return;
          if (!res || !res.ok) { say("לא הצלחנו לקרוא את הצילום. אפשר למלא ידנית."); return; }
          var f = res.fields || {}, got = [];
          if (Number(f.amount) && set("amount", f.amount)) got.push("סכום");
          if (f.reference && set("reference", f.reference)) got.push("אסמכתא");
          var methods = ["מזומן", "העברה בנקאית", "צ׳ק", "ביט", "פייבוקס", "אחר"];
          var mth = String(f.method || "").trim();
          var hit = methods.filter(function (x) { return mth && (mth.indexOf(x) !== -1 || x.indexOf(mth) !== -1); })[0];
          if (hit && set("method", hit)) got.push("אמצעי");
          var exp = Number(m["מחיר מוסכם"] || 0), amt = Number(f.amount || 0);
          say(got.length
            ? "מולא מהצילום: " + got.join(", ") + " — לבדוק לפני הרישום." +
              (exp && amt && Math.abs(exp - amt) > 0.5 ? " ⚠️ הסכום (" + amt + " ₪) שונה מהמחיר המוסכם (" + exp + " ₪)." : "")
            : "לא זוהו פרטים ברורים בצילום — אפשר למלא ידנית.");
        });
      };
      r.readAsDataURL(file);
    });
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
          (opts.topHTML || "") +   /* GMA2 — תוכן לפני השדות */
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

  /* 3.10.26 — מה חסר למנוי לפני שמפעילים אותו. ריק = הכול תקין.
     משמש את הפעלה ידנית, רישום ידני במצב "הפעלה" ושינוי סטטוס ל"פעיל" בעריכה. */
  function activationGaps(m) {
    var gaps = [];
    if (!String(m["תאריך חתימה"] || "").trim()) gaps.push("לא חתם/ה על הצהרת בריאות");
    var paid = Number(m["סה\"כ שולם"] || 0), price = Number(m["מחיר מוסכם"] || 0);
    if (!(paid > 0)) gaps.push("לא נרשם תשלום");
    else if (price > 0 && paid < price) gaps.push("שולם " + paid + " ₪ מתוך " + price + " ₪");
    return gaps;
  }
  function activationConfirm(m, lines) {
    var gaps = activationGaps(m);
    var msg = memberName(m) + "\n\n" + lines.join("\n");
    if (gaps.length) {
      msg += "\n\n⚠️ שימי לב: " + gaps.join(" · ") + ".\nהתושב יקבל גישה למכון למרות זאת.";
    }
    return CBA.ui.confirm(msg, {
      title: gaps.length ? "הפעלה עם חוסרים" : "אישור הפעולה",
      okText: gaps.length ? "אני מבין/ה, להפעיל" : "אישור",
      danger: gaps.length > 0
    });
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
  function openEdit(id, reload, preset) {
    var m = memberById(id);
    if (!m) { CBA.ui.alert("לא נמצאה הרשומה."); return; }
    var plans = (gaLast && gaLast.plans) || [];
    var curStatus = String(m["סטטוס"] || "").trim();
    var curPlanId = "";
    for (var i = 0; i < plans.length; i++) if (plans[i].name === m["מסלול"]) curPlanId = plans[i].id;

    var ui = openFormDrawer({
      title: "עריכת מנוי — " + memberName(m),
      subtitle: "מזהה " + (m["מזהה"] || "") + " · " + (m["אימייל"] || "") +
                (m["מצב סנכרון"] ? " · " + m["מצב סנכרון"] : "") +
                /* GMB1 (גל 8, 1.10.26) — כשנפתח מכפתור "אישור" מסבירים מה השמירה תעשה */
                (preset && preset.status ? ' · אישור הבקשה: הסטטוס יעבור ל"' + preset.status + '". בודקים ולוחצים שמירה.' : ""),
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
        { key: "status", label: "סטטוס", type: "select", value: (preset && preset.status) || curStatus, options: GYM_STATUSES,
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
        } else if (newStatus === "פעיל" && curStatus !== "פעיל") {
          activationConfirm(m, ["שינוי סטטוס: " + curStatus + " ← פעיל"]).then(function (ok) { if (ok) send(); });
        } else {
          send();
        }
      }
    });
    return ui;
  }

  /* ---------- עדכון הגדרה מ"מצב המודול" (2026-09-16) ----------
     שדה אחד, בלי צידוד, בדיוק openFormDrawer. עבור "קוד כניסה"
     השדה נשאר ריק בכוונה (הערך הנוכחי לא מגיע למסך הזה מלכתחילה,
     ראו handleGymList_) — הזנה מחליפה את הקיים, לא מעדכנת אותו. עבור "קישור פייבוקס"
     אין בעיה כזו, אז השדה מוצג מלא לעריכה. */
  var GA_SETTING_FIELD = {
    "קוד כניסה": { title: "עדכון קוד כניסה",
      hint: "הקוד הנוכחי לא מוצג כאן מטעמי אבטחה — הוא מוצג רק למנוי פעיל באפליקציה. מילוי כאן מחליף אותו מיד.",
      label: "קוד כניסה חדש", placeholder: "למשל 0606", prefill: false },
    "קישור פייבוקס": { title: "עדכון קישור פייבוקס",
      hint: "הקישור שאליו נשלח תושב שצריך לשלם את דמי המנוי.",
      label: "קישור לתשלום", placeholder: "https://payboxapp.com/...", prefill: true }
  };

  function openSettingEdit(key, currentValue, reload) {
    var conf = GA_SETTING_FIELD[key];
    if (!conf) return;
    var ui = openFormDrawer({
      title: conf.title,
      subtitle: conf.hint,
      okText: "שמירה",
      fields: [
        { key: "value", label: conf.label, type: "text",
          value: conf.prefill ? (currentValue || "") : "", placeholder: conf.placeholder }
      ],
      onSave: function (v, dlg) {
        var value = String(v.value || "").trim();
        if (!value) { dlg.error("צריך למלא ערך."); return; }
        dlg.busy("שומר…");
        CBA.data.updateGymSetting({ key: key, value: value }, function (res) {
          dlg.done();
          if (!res || !res.ok) { dlg.error((res && res.error) || "השמירה נכשלה."); return; }
          dlg.close();
          CBA.ui.toast("עודכן");
          reload();
        });
      }
    });
    return ui;
  }

  function bindSettingActions(root, reload) {
    root.querySelectorAll("[data-ga-setting]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openSettingEdit(btn.dataset.gaSetting, btn.dataset.gaSettingValue || "", reload);
      });
    });
  }

  /* ---------- ניהול שאלון בריאות (2026-09-16) ----------
     רשימה שנפתחת מעל "הגדרות מכון", עם הוספה/עריכה/מחיקה של שאלה. אין
     כאן מיגרציה לתשובות קיימות בכוונה — יועד מוחק את המנויים הקיימים
     ומתחיל מחדש (ר' saveGymQuestion_/deleteGymQuestion_ ב-Code.gs).
     reload הוא load() ממסך הניהול, שעכשיו מקבל cb ומעדכן את gaLast —
     כך שהרשימה כאן תמיד מציגה את הנתון האחרון בלי בקשת רשת כפולה. */
  function openQuestionsManager(reload) {
    var el = document.createElement("div");
    el.id = "gym-questions";
    el.className = "gym-wiz";
    document.body.appendChild(el);

    function questionRowHTML(q) {
      var isOff = q.active === false;
      return '<div class="gym-row">' +
               '<div class="gym-row__main">' +
                 '<div class="gym-row__name">' + CBA.esc(q.order) + '. ' + CBA.esc(q.label) + '</div>' +
                 '<div class="gym-row__meta">' + CBA.esc(q.text) + '</div>' +
               '</div>' +
               '<div class="gym-row__side">' +
                 '<span class="gym-pill gym-pill--' + (q.flag === "התראה" ? "warn" : "danger") + '">' +
                   CBA.esc(q.flag || "חוסם") + '</span>' +
                 (isOff ? '<span class="gym-pill gym-pill--muted">כבויה</span>' : "") +
                 '<button type="button" class="btn-ghost" data-gq-edit="' + CBA.esc(q.id) + '">עריכה</button>' +
                 '<button type="button" class="btn-ghost btn-danger" data-gq-del="' + CBA.esc(q.id) + '">מחיקה</button>' +
               '</div>' +
             '</div>';
    }

    function renderList() {
      var qs = ((gaLast && gaLast.questions) || []).slice().sort(function (a, b) { return a.order - b.order; });
      el.innerHTML =
        '<div class="gym-wiz__backdrop" data-gq-close></div>' +
        '<aside class="gym-wiz__panel" role="dialog" aria-label="ניהול שאלון בריאות">' +
          '<div class="gym-wiz__head">' +
            '<div class="gym-wiz__title">שאלון בריאות</div>' +
            '<button type="button" class="gym-wiz__x" data-gq-close aria-label="סגירה">×</button>' +
          '</div>' +
          '<div class="gym-wiz__body">' +
            '<div class="gym-hint">"חוסם" = תשובת "כן" עוצרת הרשמה אוטומטית ומחייבת תעודה רפואית. ' +
              '"התראה" רק מסמנת לתשומת לב מנהל/ת המכון. שינוי כאן משפיע רק על הרשמות חדשות.</div>' +
            (qs.length ? qs.map(questionRowHTML).join("") :
              '<div class="gym-note">אין עדיין שאלות בשאלון.</div>') +
          '</div>' +
          '<div class="gym-wiz__foot">' +
            '<button type="button" class="btn-ghost" data-gq-close>סגירה</button>' +
            '<button type="button" class="btn-primary" data-gq-add>הוספת שאלה</button>' +
          '</div>' +
        '</aside>';
      bindList();
    }

    function refreshAndRender() {
      reload(function () { renderList(); });
    }

    function openQuestionForm(existing) {
      var qs = (gaLast && gaLast.questions) || [];
      openFormDrawer({
        title: existing ? "עריכת שאלה" : "הוספת שאלה",
        subtitle: "הכותרת הקצרה משמשת כשם עמודה פנימי בטאב \"מכון כושר\" — כדאי קצרה, בלי תווים מיוחדים, ושונה מכל שאלה אחרת.",
        okText: "שמירה",
        fields: [
          { key: "label", label: "כותרת קצרה", type: "text", value: existing ? existing.label : "" },
          { key: "text", label: "נוסח השאלה המלא", type: "textarea",
            value: existing ? existing.text : "" },
          { key: "flag", label: "סוג דגל", type: "select",
            value: existing ? (existing.flag || "חוסם") : "חוסם", options: ["חוסם", "התראה"],
            hint: '"חוסם" עוצר הרשמה אוטומטית ומחייב תעודה רפואית. "התראה" רק מסמנת.' },
          { key: "active", label: "פעילה", type: "select",
            value: existing && existing.active === false ? "לא" : "כן", options: ["כן", "לא"] },
          { key: "order", label: "מיקום בסדר", type: "number",
            value: existing ? existing.order : (qs.length + 1) }
        ],
        onSave: function (v, dlg) {
          if (!String(v.label || "").trim()) { dlg.error("צריך למלא כותרת קצרה."); return; }
          if (!String(v.text || "").trim()) { dlg.error("צריך למלא את נוסח השאלה."); return; }
          dlg.busy("שומר…");
          CBA.data.saveGymQuestion({
            id: existing ? existing.id : "",
            label: v.label, text: v.text, flag: v.flag, active: v.active, order: v.order
          }, function (res) {
            dlg.done();
            if (!res || !res.ok) { dlg.error((res && res.error) || "השמירה נכשלה."); return; }
            dlg.close();
            CBA.ui.toast("נשמר");
            refreshAndRender();
          });
        }
      });
    }

    function questionById(id) {
      var qs = (gaLast && gaLast.questions) || [];
      for (var i = 0; i < qs.length; i++) if (qs[i].id === id) return qs[i];
      return null;
    }

    function bindList() {
      el.querySelectorAll("[data-gq-close]").forEach(function (n) { n.addEventListener("click", close); });
      el.querySelector("[data-gq-add]").addEventListener("click", function () { openQuestionForm(null); });
      el.querySelectorAll("[data-gq-edit]").forEach(function (btn) {
        btn.addEventListener("click", function () { openQuestionForm(questionById(btn.dataset.gqEdit)); });
      });
      el.querySelectorAll("[data-gq-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var q = questionById(btn.dataset.gqDel);
          CBA.ui.confirm(
            'למחוק את השאלה "' + ((q && q.label) || "") + '"?\n\n' +
            "הרשמות חדשות לא יראו אותה יותר. זו פעולה בלתי הפיכה.",
            { title: "מחיקת שאלה", okText: "מחיקה", danger: true }
          ).then(function (ok) {
            if (!ok) return;
            CBA.data.deleteGymQuestion({ id: btn.dataset.gqDel }, function (res) {
              if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "המחיקה נכשלה."); return; }
              CBA.ui.toast("השאלה נמחקה");
              refreshAndRender();
            });
          });
        });
      });
    }

    function close() { if (el.parentNode) el.parentNode.removeChild(el); }

    renderList();
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
          '<div class="gym-kv"><span>ת.ז.</span><span data-gd-pid>' + CBA.esc(m["ת.ז."] || "—") + "</span></div>" +
          '<div class="gym-kv"><span>תאריך לידה</span><span data-gd-pdob>' + CBA.esc(fmtDate(m["תאריך לידה"]) || "—") + "</span></div>" +
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
    /* 3.10.26 — ת.ז. ותאריך לידה נשארים בגיליון "תושבים" (לא ב-Firebase): נמשכים מכאן רק בצפייה בהצהרה. */
    if (m["ת.ז."] === undefined && CBA.data.getGymListSheets) {
      var pidEl = el.querySelector("[data-gd-pid]"), pdobEl = el.querySelector("[data-gd-pdob]");
      if (pidEl) pidEl.textContent = "טוען…";
      if (pdobEl) pdobEl.textContent = "טוען…";
      CBA.data.getGymListSheets(function (res) {
        var f = null;
        ((res && res.ok && res.members) || []).forEach(function (x) { if (String(x["מזהה"] || "").trim() === String(id).trim()) f = x; });
        if (pidEl) pidEl.textContent = (f && f["ת.ז."]) || "—";
        if (pdobEl) pdobEl.textContent = (f && fmtDate(f["תאריך לידה"])) || "—";
      });
    }
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
        var payUi = openFormDrawer({
          title: "רישום תשלום ידני — " + memberName(m),
          subtitle: "סטטוס נוכחי: " + (m["סטטוס"] || "") + ". אפשר לרשום את התשלום בלי להפעיל את המנוי.",
          okText: "המשך",
          /* GMA2 (גל 14, 1.10.26) — צילום אישור העברה/ביט/פייבוקס ממלא סכום,
             אמצעי ואסמכתא (אותה סריקה של התושב). רק ממלא — נשמר ב"רישום". */
          topHTML: '<div class="gym-field"><label class="btn-ghost btn-sm ga-scan">📷 מילוי מצילום אישור התשלום' +
            '<input type="file" accept="image/*" data-ga-scan hidden></label>' +
            '<div class="gym-hint gym-hint--sm" data-ga-scanmsg hidden></div></div>',
          fields: [
            { key: "amount", label: "סכום שהתקבל (₪)", type: "number",
              value: btn.dataset.gaPrice || "", min: 0,
              hint: "מחיר מוסכם: " + (m["מחיר מוסכם"] || "—") + " ₪" },
            { key: "validUntil", label: "בתוקף עד חודש", type: "month",
              value: defaultValidUntil(planMonthsFor(m["מסלול"])) },
            { key: "mode", label: "מה לעשות", type: "select",
              value: (["ממתין לתשלום", "ממתין לאימות", "פעיל", "פג תוקף"].indexOf(String(m["סטטוס"] || "").trim()) !== -1) ? "activate" : "record",
              options: [{ value: "record", text: "רק לרשום את התשלום (הסטטוס לא ישתנה, בלי מייל)" },
                        { value: "activate", text: "לרשום ולהפעיל את המנוי (נשלח מייל הפעלה)" }] },
            { key: "method", label: "אמצעי תשלום", type: "select", value: "מזומן",
              options: ["מזומן", "העברה בנקאית", "צ׳ק", "ביט", "פייבוקס", "אחר"] },
            { key: "reference", label: "אסמכתא (לא חובה)", type: "text", value: "" }
          ],
          onSave: function (v, ui) {
            if (!Number(v.amount)) { ui.error("צריך להזין את הסכום שהתקבל."); return; }
            if (!v.validUntil) { ui.error("צריך לבחור עד איזה חודש המנוי בתוקף."); return; }
            var activate = v.mode !== "record";
            function go() {
              ui.busy(activate ? "מפעיל מנוי…" : "רושם תשלום…");
              CBA.data.recordGymPayment(
                { id: id, amount: Number(v.amount), validUntil: v.validUntil, method: v.method || "מזומן",
                  reference: String(v.reference || "").trim(), activate: activate },
                function (res) {
                  ui.done();
                  if (!res || !res.ok) { ui.error((res && res.error) || "הרישום נכשל."); return; }
                  ui.close();
                  afterActivate(res, activate ? "המנוי הופעל" : "התשלום נרשם (הסטטוס לא השתנה)");
                  reload();
                });
            }
            var lines = ["תשלום: " + v.amount + " ₪ · " + (v.method || "מזומן"),
                         "בתוקף עד: " + v.validUntil,
                         activate ? "המנוי יופעל ותישלח לתושב הודעת הפעלה." : "הסטטוס יישאר: " + (m["סטטוס"] || "") + ". לא יישלח מייל."];
            if (activate) { activationConfirm(m, lines).then(function (ok) { if (ok) go(); }); }
            else { CBA.ui.confirm(memberName(m) + "\n\n" + lines.join("\n"), { title: "רישום תשלום", okText: "רישום" })
                     .then(function (ok) { if (ok) go(); }); }
          }
        });
        gaWireScan(payUi, m);
      });
    });

    /* 3.10.26 — הפעלה ידנית בכל סטטוס (activateGymManual בשרת) */
    root.querySelectorAll("[data-ga-activate]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaActivate;
        var m = memberById(id) || {};
        var ui = openFormDrawer({
          title: "הפעלה ידנית — " + memberName(m),
          subtitle: "סטטוס נוכחי: " + (m["סטטוס"] || "") + ". המנוי יהפוך ל\"פעיל\" והתושב יקבל גישה למכון.",
          okText: "המשך",
          fields: [
            { key: "validUntil", label: "בתוקף עד חודש", type: "month",
              value: toMonthInput(m["בתוקף עד"]) || defaultValidUntil(planMonthsFor(m["מסלול"])) },
            { key: "sendMail", label: "הודעת הפעלה לתושב", type: "select", value: "yes",
              options: [{ value: "yes", text: "לשלוח מייל הפעלה" }, { value: "no", text: "לא לשלוח (הפעלה שקטה)" }] },
            { key: "note", label: "הערה (נרשמת ביומן)", type: "text", value: "" }
          ],
          onSave: function (v, dlg) {
            if (!v.validUntil) { dlg.error("צריך לבחור עד איזה חודש המנוי בתוקף."); return; }
            activationConfirm(m, ["בתוקף עד: " + v.validUntil,
              v.sendMail === "no" ? "לא יישלח מייל." : "יישלח מייל הפעלה."]).then(function (ok) {
              if (!ok) return;
              dlg.busy("מפעיל מנוי…");
              CBA.data.activateGymManual({ id: id, validUntil: v.validUntil, sendMail: v.sendMail !== "no",
                note: String(v.note || "").trim() }, function (res) {
                dlg.done();
                if (!res || !res.ok) { dlg.error((res && res.error) || "ההפעלה נכשלה."); return; }
                dlg.close();
                afterActivate(res, "המנוי הופעל");
                reload();
              });
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
    /* GMB1 (גל 8, 1.10.26) — "אישור" = אותה מגירת עריכה (updateGymMembership), עם סטטוס מוצע "ממתין לתשלום" */
    root.querySelectorAll("[data-ga-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () { openEdit(btn.dataset.gaApprove, reload, { status: "ממתין לתשלום" }); });
    });

    // מחיקה לצמיתות (2026-09-16, בקשת יועד: "כפתור אדום... אם צריך
    // למחוק אז למחוק באופן מלא") — שונה מ"עריכה" → סטטוס "בוטל", שרק
    // מסמן את המנוי כלא-פעיל ומשאיר את ההיסטוריה. אזהרה מפורשת בדיאלוג
    // כי הפעולה בלתי הפיכה.
    /* 3.10.26 (בקשת יועד: "לראות את יומן התשלומים ולערוך אותו") — רשימת כל התשלומים של
       המנוי, עם עריכה וביטול. ביטול אינו מחיקה: השורה נשארת ביומן כ"תשלום מבוטל". */
    function fmtDay(v) {
      var t = String(v || "").slice(0, 10).split("-");
      return t.length === 3 ? t[2] + "/" + t[1] + "/" + t[0] : String(v || "");
    }
    function payEvents(id) {
      var log = (gaLast && gaLast.log) || [];
      return log.filter(function (e) {
        var t = String(e["סוג אירוע"] || "").trim();
        return String(e["מזהה מנוי"] || "").trim() === id && (t === "תשלום" || t === "תשלום מבוטל");
      }).sort(function (a, b) { return String(b["תאריך"]).localeCompare(String(a["תאריך"])); });
    }
    function openPayLog(id) {
      var m = memberById(id) || {};
      if (gaLast && gaLast.partial) { CBA.ui.alert("הפרטים עדיין נטענים. נסה שוב בעוד רגע."); return; }
      var evs = payEvents(id);
      var total = evs.reduce(function (a, e) { return String(e["סוג אירוע"]).trim() === "תשלום" ? a + (Number(e["סכום"]) || 0) : a; }, 0);
      var rows = evs.length ? evs.map(function (e) {
        var voided = String(e["סוג אירוע"]).trim() === "תשלום מבוטל";
        var eid = CBA.esc(e["מזהה אירוע"] || "");
        return '<div class="ga-pay' + (voided ? " is-void" : "") + '">' +
          '<div class="ga-pay__main"><b>' + CBA.esc(String(e["סכום"] || "")) + ' ₪</b> · ' + CBA.esc(fmtDay(e["תאריך"])) +
            ' · ' + CBA.esc(e["אמצעי תשלום"] || "—") + (e["אסמכתא"] ? ' · אסמכתא ' + CBA.esc(e["אסמכתא"]) : "") +
            (voided ? ' <span class="gym-pill gym-pill--warn">מבוטל</span>' : "") + "</div>" +
          '<small>' + CBA.esc(String(e["הערה"] || "").slice(0, 120)) + "</small>" +
          (voided ? "" : '<div class="ga-pay__btns"><button type="button" data-ga-payedit="' + eid + '">עריכה</button>' +
            '<button type="button" class="ga-menu__danger" data-ga-payvoid="' + eid + '">ביטול תשלום</button></div>') +
          "</div>";
      }).join("") : '<div class="gym-hint">אין תשלומים ביומן.</div>';
      var ui = openFormDrawer({
        title: "יומן תשלומים — " + memberName(m),
        subtitle: "סה\"כ ששולם (בלי מבוטלים): " + total + " ₪. ביטול משאיר את השורה ביומן ומסומן כמבוטל.",
        okText: "סגירה",
        topHTML: '<div class="ga-paylist">' + rows + "</div>",
        onSave: function (v, u) { u.close(); }
      });
      function evById(eid) { return evs.filter(function (e) { return String(e["מזהה אירוע"]) === eid; })[0]; }
      function refresh() { ui.close(); reload(function () { if (gaLast && !gaLast.partial) openPayLog(id); }); }
      ui.el.querySelectorAll("[data-ga-payedit]").forEach(function (b) {
        b.addEventListener("click", function () {
          var e = evById(b.dataset.gaPayedit); if (!e) return;
          var eui = openFormDrawer({
            title: "עריכת תשלום", subtitle: memberName(m) + " · תשלום מתאריך " + fmtDay(e["תאריך"]), okText: "שמירה",
            fields: [
              { key: "amount", label: "סכום (₪)", type: "number", value: e["סכום"], min: 0 },
              { key: "date", label: "תאריך התשלום", type: "date", value: String(e["תאריך"] || "").slice(0, 10) },
              { key: "method", label: "אמצעי תשלום", type: "select", value: e["אמצעי תשלום"] || "מזומן",
                options: ["מזומן", "העברה בנקאית", "צ׳ק", "ביט", "פייבוקס", "אחר"] },
              { key: "reference", label: "אסמכתא (לא חובה)", type: "text", value: e["אסמכתא"] || "" },
              { key: "note", label: "סיבת התיקון (נרשמת ביומן)", type: "text", value: "" }
            ],
            onSave: function (v, u) {
              if (!(Number(v.amount) > 0)) { u.error("הסכום חייב להיות גדול מאפס."); return; }
              u.busy("שומר…");
              CBA.data.updateGymPayment({ id: id, eventId: e["מזהה אירוע"], amount: Number(v.amount), date: v.date,
                method: v.method, reference: String(v.reference || "").trim(), note: String(v.note || "").trim() },
                function (res) {
                  u.done();
                  if (!res || !res.ok) { u.error((res && res.error) || "השמירה נכשלה."); return; }
                  u.close(); CBA.ui.toast(res.unchanged ? "לא היה שינוי" : "התשלום עודכן"); refresh();
                });
            }
          });
        });
      });
      ui.el.querySelectorAll("[data-ga-payvoid]").forEach(function (b) {
        b.addEventListener("click", function () {
          var e = evById(b.dataset.gaPayvoid); if (!e) return;
          CBA.ui.confirm("לבטל את התשלום של " + e["סכום"] + " ₪ מתאריך " + fmtDay(e["תאריך"]) + "?\n\n" +
            "התשלום לא ייספר יותר בסה\"כ ששולם. השורה נשארת ביומן כ\"מבוטל\". הסטטוס והתוקף של המנוי לא משתנים.",
            { title: "ביטול תשלום", okText: "ביטול התשלום", danger: true }).then(function (ok) {
            if (!ok) return;
            var release = CBA.ui.busy(b, "מבטל…");
            CBA.data.voidGymPayment({ id: id, eventId: e["מזהה אירוע"] }, function (res) {
              release();
              if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "הביטול נכשל."); return; }
              CBA.ui.toast("התשלום בוטל"); refresh();
            });
          });
        });
      });
    }
    root.querySelectorAll("[data-ga-paylog]").forEach(function (btn) {
      btn.addEventListener("click", function () { openPayLog(String(btn.dataset.gaPaylog).trim()); });
    });

    root.querySelectorAll("[data-ga-delete]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.gaDelete;
        var m = memberById(id) || {};
        CBA.ui.confirm(
          "למחוק את " + memberName(m) + " לצמיתות ממכון הכושר?\n\n" +
          "זו מחיקה מלאה — כל ההיסטוריה של המנוי הזה (תשלומים, הצהרת בריאות, קוד כניסה) " +
          "תימחק ולא ניתן לשחזר אותה. אם רק רוצים לסמן שהמנוי לא פעיל, עדיף \"עריכה\" → סטטוס \"בוטל\".",
          { title: "מחיקת מנוי לצמיתות", okText: "מחיקה לצמיתות", danger: true }
        ).then(function (ok) {
          if (!ok) return;
          var release = CBA.ui.busy(btn, "מוחק…");
          CBA.data.deleteGymMembership({ id: id }, function (res) {
            release();
            if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "המחיקה נכשלה."); return; }
            CBA.ui.toast("המנוי נמחק");
            reload();
          });
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
    d.setMonth(d.getMonth() + (Number(months) || 12) - 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }

  function planMonthsFor(planName) {
    var plans = (gaLast && gaLast.plans) || [];
    for (var i = 0; i < plans.length; i++) if (plans[i].name === planName) return plans[i].months;
    return (plans[0] && plans[0].months) || 12;
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
                 /* GMB5 (גל 8, 1.10.26) — בלי מחיר מוסכם לא מציגים "מחיר מוסכם  ₪" ריק */
                 CBA.esc(m["מסלול"] || "") + (String(expected).trim() !== "" ? " · מחיר מוסכם " + CBA.esc(expected) + " ₪" : "") +
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
          '<div class="gym-field ac-wrap"><label>אימייל התושב — התחילו להקליד שם או אימייל ובחרו מהרשימה</label>' +
            '<input type="email" data-gc="email" placeholder="שם או name@example.com" autocomplete="off">' +
            '<div class="ac-list" data-gc-list hidden></div>' +
            '<div class="gym-hint" data-gc-picked hidden></div></div>' +
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
    /* בורר תושבים (3.10.26): שדה האימייל הוא גם שדה החיפוש. בחירה ממלאת אימייל + שם + טלפון.
       לא נטען/נכשל — השדה נשאר חופשי והשרת מאמת (נפילה בטוחה). */
    var pickRows = null, picked = false, pickFailed = false;
    var emailIn = el.querySelector('[data-gc="email"]');
    var pickList = el.querySelector("[data-gc-list]");
    var pickedNote = el.querySelector("[data-gc-picked]");
    function setField(k, v) {
      var n = el.querySelector('[data-gc="' + k + '"]');
      if (n) n.value = v || "";
      data[k] = v || "";
    }
    function pickLabel(r) {
      return ((r.first ? r.first + " " : "") + (r.family || "")).trim() + (r.house ? " · בית " + r.house : "");
    }
    function renderPick(q) {
      var query = String(q || "").trim().toLowerCase();
      if (!query) { pickList.hidden = true; pickList.innerHTML = ""; return; }
      /* הרשימה מגיעה מ-Apps Script (1-3 שניות) — לפני שהגיעה מראים "טוען", ובהגיעה מציירים מחדש
         (תיקון 4.10: מי שהקליד מיד אחרי הפתיחה לא ראה כלום ולא קיבל סימן חיים). */
      if (!pickRows) {
        pickList.innerHTML = '<div class="ac-item" style="cursor:default;color:var(--text-soft)">' +
          (pickFailed ? "הרשימה לא נטענה — אפשר להקליד אימייל מלא, והשרת יבדוק אותו" : "טוען רשימת תושבים…") + "</div>";
        pickList.hidden = false; return;
      }
      var m = [];
      pickRows.forEach(function (r, i) {
        var hay = (pickLabel(r) + " " + r.email).toLowerCase();
        if (hay.indexOf(query) !== -1 && m.length < 8) m.push({ r: r, i: i });
      });
      if (!m.length) { pickList.innerHTML = '<div class="ac-item" style="cursor:default;color:var(--text-soft)">לא נמצא תושב — האימייל חייב להיות רשום בטאב "תושבים"</div>'; pickList.hidden = false; return; }
      pickList.innerHTML = m.map(function (x) {
        return '<div class="ac-item" data-gc-idx="' + x.i + '">' + CBA.esc(pickLabel(x.r)) +
               ' <span style="color:var(--text-soft);direction:ltr;unicode-bidi:embed">' + CBA.esc(x.r.email) + "</span></div>";
      }).join("");
      pickList.hidden = false;
    }
    emailIn.addEventListener("input", function () { picked = false; pickedNote.hidden = true; renderPick(emailIn.value); });
    emailIn.addEventListener("focus", function () { if (emailIn.value) renderPick(emailIn.value); });
    emailIn.addEventListener("blur", function () { setTimeout(function () { pickList.hidden = true; }, 150); });
    pickList.addEventListener("mousedown", function (e) {
      var it = e.target.closest("[data-gc-idx]"); if (!it || !pickRows) return;
      e.preventDefault();
      var r = pickRows[parseInt(it.dataset.gcIdx, 10)]; if (!r) return;
      emailIn.value = r.email; data.email = r.email; picked = true;
      setField("firstName", r.first); setField("lastName", r.family);
      if (r.phone && !data.phone) setField("phone", r.phone);
      pickedNote.textContent = "נבחר: " + pickLabel(r);
      pickedNote.hidden = false; pickList.hidden = true;
    });
    if (CBA.data.getGymResidentPicker) {
      CBA.data.getGymResidentPicker(function (res) {
        if (res && res.ok && Array.isArray(res.rows)) pickRows = res.rows; else pickFailed = true;
        if (document.activeElement === emailIn || emailIn.value) { if (!picked) renderPick(emailIn.value); }
      });
    }
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
      if (!String(data.email || "").trim()) { showErr("צריך לבחור תושב."); return; }
      if (pickRows && !picked) {
        var typed = String(data.email).trim().toLowerCase();
        var hit = pickRows.filter(function (r) { return r.email === typed; })[0];
        if (!hit) { showErr('האימייל לא רשום בטאב "תושבים" — בחרו תושב מהרשימה.'); return; }
      }
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

  /* ---------- ⚙ הגדרות — גיליון אחד, שתי לשוניות (26.9) ----------
     "הגדרות מכון" (קוד, פייבוקס, שאלון) ו"בקרת כניסה" (Nuki, מצב הדלת, איש קשר).
     שני התוכנים נבנים ע"י הקוד שכבר היה — כאן רק המסגרת. */
  function settingsHTML(res) {
    var settings = res.settings || {}, questions = res.questions || [];
    var paybox = String(settings["קישור פייבוקס"] || "").trim();
    return '<div class="gym-check">' +
      settingRowHTML({ key: "קוד כניסה", label: "קוד כניסה למכון", hasValue: !!res.hasEntryCode, valueText: res.hasEntryCode ? "מוגדר" : "לא הוגדר" }) +
      settingRowHTML({ key: "קישור פייבוקס", label: "קישור לתשלום בפייבוקס", hasValue: !!paybox, valueText: paybox || "לא הוגדר", rawValue: paybox }) +
      '<div class="gym-check__row"><span class="gym-check__mark gym-check__mark--' + (questions.length ? "on" : "off") + '">' + (questions.length ? "✓" : "!") + "</span>" +
        '<span class="gym-check__label">שאלון בריאות</span>' +
        '<span class="gym-check__val">' + questions.length + " שאלות (" + questions.filter(function (q) { return q.active !== false; }).length + " פעילות)</span>" +
        '<button type="button" class="btn-ghost" data-ga-questions>ניהול שאלות</button></div>' +
    "</div>";
  }
  function openSettings(tab, reload, doorEl) {
    /* GMB4 (גל 8, 1.10.26) — בזמן טעינה/אחרי שגיאה: הודעה במקום לחיצה שלא עושה כלום */
    if (!gaLast) { if (CBA.ui && CBA.ui.toast) CBA.ui.toast("ההגדרות ייפתחו אחרי שהנתונים ייטענו"); return; }
    var sh = CBA.ui.sheet({ label: "הגדרות מכון הכושר", sheetCls: "ga-sheet", html:
      '<div class="ga-sheet__h"><h2>הגדרות</h2><button type="button" class="btn-ghost btn-sm" data-ga-close>סגירה</button></div>' +
      '<div class="gym-seg ga-tabs" role="tablist"><button type="button" data-ga-tab="gym">הגדרות מכון</button><button type="button" data-ga-tab="door">בקרת כניסה</button></div>' +
      '<div data-ga-pane="gym"></div><div data-ga-pane="door" hidden></div>',
      onMount: function (wrap, close) {
        var gymPane = wrap.querySelector('[data-ga-pane="gym"]'), doorPane = wrap.querySelector('[data-ga-pane="door"]');
        function paintGym() {
          gymPane.innerHTML = settingsHTML(gaLast);
          bindSettingActions(gymPane, function () { reload(function () { paintGym(); }); });
          var q = gymPane.querySelector("[data-ga-questions]");
          if (q) q.addEventListener("click", function () { openQuestionsManager(reload); });
        }
        paintGym();
        if (CBA.doorAdmin && CBA.doorAdmin.mountSetup) CBA.doorAdmin.mountSetup(doorPane, doorEl);
        function show(t) {
          wrap.querySelectorAll("[data-ga-tab]").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-ga-tab") === t); });
          gymPane.hidden = t !== "gym"; doorPane.hidden = t !== "door";
        }
        show(tab || "gym");
        wrap.addEventListener("click", function (e) {
          var t = e.target.closest("[data-ga-tab]"); if (t) show(t.getAttribute("data-ga-tab"));
          if (e.target.closest("[data-ga-close]")) close();
        });
      } });
    return sh;
  }

  /* GMB2 (גל 8, 1.10.26) — תיבת אימות פתוחה (או תפריט ⋯ פתוח) יושבת בתוך main, ורענון שקט היה סוגר אותה
     ומוחק סכום/חודש שהוקלדו. כל עוד אחת פתוחה — מבקשים מ-app.js לעצור רענון; בדיקה חוזרת כל 1.5ש'
     משחררת לבד כשהיא נסגרת או כשעוזבים את המסך (ניווט לא עובר דרך הקוד הזה). */
  var gaHoldTimer = null;
  function gaSyncHold(membersEl) {
    var on = !!(membersEl && document.body.contains(membersEl) &&
      (!CBA.onScreen || CBA.onScreen("gymAdmin")) &&
      membersEl.querySelector(".ga-row__verify:not([hidden]), details.ga-more[open]"));
    if (CBA.holdRefresh) CBA.holdRefresh("gymVerify", on);
    clearInterval(gaHoldTimer); gaHoldTimer = null;
    if (on) gaHoldTimer = setInterval(function () { gaSyncHold(membersEl); }, 1500);
  }
  var gaLiveLoad = null;   /* GMB6 (גל 8, 1.10.26) — load() של הציור החי האחרון */
  /* A0 — כפתורי סרגל הניהול נקשרים פעם אחת וקוראים לציור החי האחרון */
  var gaBarLive = null;
  var GA_BAR_ICO = '<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>';

  function chip(n, label, tone) {
    return '<span class="ga-chip' + (tone && n ? " ga-chip--" + tone : "") + '">' + CBA.esc(label) + "<b>" + CBA.esc(String(n)) + "</b></span>";
  }

  CBA.screens.gymAdmin = {
    title: "מכון כושר",

    render: function (container) {
      gaWinScrollY = window.scrollY || 0;
      /* GMB2 (גל 8, 1.10.26) — ציור חדש = אין תיבה פתוחה; משחררים את העצירה */
      if (CBA.holdRefresh) CBA.holdRefresh("gymVerify", false);
      clearInterval(gaHoldTimer); gaHoldTimer = null;

      /* A0/A1 (אושר ע"י יועד 30.9.26) — סרגל הניהול הדק: "מכון כושר", שני מונים
         ("ממתינים לך", "פערי תשלום" — אותם מספרים של השבבים), "+ מנוי חדש",
         ⚙ הגדרות (אייקון) ונקודת מצב המנעול. שאר השבבים נשארים בשורה בגוף.
         בלי canopy.js — המסך כמו קודם. */
      var host = container, gaBar = null;
      if (CBA.canopy) {
        var sh = CBA.canopy.shell(container, { key: "gymAdmin", dom: "gym", ico: GA_BAR_ICO, title: "מכון כושר",
          pills: [{ id: "ga-p-mine", k: "ממתינים לך" }, { id: "ga-p-gaps", k: "פערי תשלום", hidden: true }],
          act: { id: "ga-bar-new", label: "מנוי חדש" },
          extra: '<span class="da-dot" id="ga-bar-door" role="img" hidden></span>' +
            '<button type="button" class="cnp2-ico" id="ga-bar-settings" aria-label="הגדרות" title="הגדרות">⚙</button>' });
        host = sh.body; gaBar = sh.bar;
        if (sh.fresh) {
          /* נקשר פעם אחת; קורא לציור החי (gaBarLive) — לא לסגירה של ציור ישן */
          gaBar.querySelector("#ga-bar-new").addEventListener("click", function () { if (gaBarLive) gaBarLive.create(); });
          gaBar.querySelector("#ga-bar-settings").addEventListener("click", function () { if (gaBarLive) gaBarLive.settings(); });
          gaBar.querySelector("#ga-p-mine").addEventListener("click", function () { if (gaBarLive) gaBarLive.attn(); });
          gaBar.querySelector("#ga-p-gaps").addEventListener("click", function () { if (gaBarLive) gaBarLive.gaps(); });
        }
      }
      host.innerHTML =
        '<div class="ga-head">' +
          (gaBar ? "" : '<div class="ga-head__t">מכון כושר</div>') +
          '<div id="ga-kpis" class="ga-chips"></div>' +
          (gaBar ? "" : '<button type="button" class="btn-ghost" id="ga-settings">⚙ הגדרות</button>' +
          '<button type="button" class="btn-primary" id="ga-new">+ מנוי חדש</button>') +
        "</div>" +
        '<div class="ga-grid">' +
          '<section class="card club-card ga-card">' +
            '<div class="ga-card__h"><div class="club-sec__title">מנויים</div>' +
              '<div class="gym-seg" id="ga-filter"></div></div>' +
            '<div id="ga-members">' + gaLoadingHTML() + "</div>" +
          "</section>" +
          /* בקרת כניסה — מצב המנעול, פתיחה מרחוק, כניסות היום. ר' doorAdmin.js */
          '<section class="card club-card ga-card ga-door" id="ga-door"></section>' +
        "</div>";

      var doorEl = container.querySelector("#ga-door");
      var newBtn = container.querySelector("#ga-new");
      if (newBtn) newBtn.addEventListener("click", function () { openCreate(container, load); });
      var setBtn = container.querySelector("#ga-settings");
      if (setBtn) setBtn.addEventListener("click", function () { openSettings("gym", load, doorEl); });
      gaBarLive = {
        create: function () { openCreate(container, load); },
        settings: function () { openSettings("gym", load, doorEl); },
        attn: function () {   // = לחיצה על המסנן "ממתינים לך" של רשימת המנויים
          gaFilter = "attn"; if (gaLast) paintMembers();
          var card = membersEl.closest(".ga-card");
          try { (card || membersEl).scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
        },
        gaps: function () {   // אין מסנן לפערים — מציגים הכול וגוללים לשורה הראשונה שמסומן בה פער
          if (gaFilter !== "all") { gaFilter = "all"; if (gaLast) paintMembers(); }
          var first = null;
          ((gaLast && gaLast.members) || []).some(function (m) {
            var sv = String(m["מצב סנכרון"] || "").trim();
            if (sv && sv !== "מסונכרן") { first = membersEl.querySelector('[data-ga-row="' + String(m["מזהה"] || "").replace(/"/g, "") + '"]'); return !!first; }
            return false;
          });
          try { (first || membersEl).scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
        }
      };
      /* נקודת המנעול בסרגל — רק ממצב שכרטיס בקרת הכניסה כבר טוען (בלי קריאה נוספת) */
      function paintDoorDot() {
        var dot = gaBar && gaBar.querySelector("#ga-bar-door");
        if (!dot) return;
        var tone = CBA.doorAdmin && CBA.doorAdmin.tone ? CBA.doorAdmin.tone() : null;
        var TXT = { ok: "הדלת מחוברת", warn: "הדלת: סוללה חלשה", danger: "הדלת: המנעול לא עונה" };
        var COL = { ok: "var(--ok)", warn: "var(--warn)", danger: "var(--danger)" };
        dot.hidden = !TXT[tone];
        if (TXT[tone]) { dot.style.background = COL[tone]; dot.title = TXT[tone]; dot.setAttribute("aria-label", TXT[tone]); }
      }
      if (CBA.doorAdmin) {
        CBA.doorAdmin.onSettings = function () { openSettings("door", load, doorEl); };
        CBA.doorAdmin.onState = paintDoorDot;
        CBA.doorAdmin.render(doorEl);
      }
      paintDoorDot();

      var kpisEl    = container.querySelector("#ga-kpis");
      var membersEl = container.querySelector("#ga-members");
      var filterEl  = container.querySelector("#ga-filter");

      /* סגירת תפריט ⋯ פתוח בלחיצה בחוץ / אחרי בחירה. */
      membersEl.addEventListener("click", function (e) {
        var inMenu = e.target.closest(".ga-menu button");
        membersEl.querySelectorAll("details.ga-more[open]").forEach(function (d) {
          if (inMenu || !d.contains(e.target)) d.removeAttribute("open");
        });
        var v = e.target.closest("[data-ga-verify-open]");
        if (v) {
          var row = v.closest(".ga-row"), box = row && row.querySelector(".ga-row__verify");
          if (box) { box.hidden = !box.hidden; v.textContent = box.hidden ? "אימות תשלום" : "סגירה"; }
        }
        gaSyncHold(membersEl);   /* GMB2 (גל 8, 1.10.26) */
      });
      /* GMB2 (גל 8, 1.10.26) — פתיחה/סגירה של ⋯ (אירוע toggle לא מבעבע — לכן capture) */
      membersEl.addEventListener("toggle", function () { gaSyncHold(membersEl); }, true);

      function paintMembers() {
        var members = ((gaLast && gaLast.members) || []).slice();
        members.sort(function (x, y) {
          var a = GA_ORDER[String(x["סטטוס"] || "").trim()], b = GA_ORDER[String(y["סטטוס"] || "").trim()];
          return (a == null ? 9 : a) - (b == null ? 9 : b);
        });
        var attn = members.filter(function (m) { return GA_ATTN[String(m["סטטוס"] || "").trim()]; });
        var gone = members.filter(function (m) { return ["פג תוקף", "בוטל", "נדחה"].indexOf(String(m["סטטוס"] || "").trim()) !== -1; });
        filterEl.innerHTML =
          '<button type="button" data-ga-f="all" class="' + (gaFilter === "all" ? "is-on" : "") + '">הכול</button>' +
          '<button type="button" data-ga-f="attn" class="' + (gaFilter === "attn" ? "is-on" : "") + '">ממתינים לך' + (attn.length ? " (" + attn.length + ")" : "") + "</button>" +
          '<button type="button" data-ga-f="gone" class="' + (gaFilter === "gone" ? "is-on" : "") + '">לא פעילים</button>';
        var list = gaFilter === "attn" ? attn : gaFilter === "gone" ? gone : members;
        membersEl.innerHTML = list.length ? list.map(memberRowHTML).join("") :
          gaFilter === "all"
            ? '<div class="gym-note">עדיין אין מנויים. תושבים נרשמים לבד ב"מתקנים ← מכון כושר", ואפשר להקים מנוי ידנית מ"+ מנוי חדש".</div>'
            : '<div class="gym-note">' + (gaFilter === "attn" ? "אין כרגע מה לאשר." : "אין מנויים לא פעילים.") + "</div>";
        bindMemberActions(membersEl, load);
        bindVerifyActions(membersEl, load);
        gaSyncHold(membersEl);   /* GMB2 (גל 8, 1.10.26) — ציור הרשימה סגר את התיבות */
      }
      filterEl.addEventListener("click", function (e) {
        var b = e.target.closest("[data-ga-f]"); if (!b) return;
        gaFilter = b.getAttribute("data-ga-f"); paintMembers();
      });

      /* גישת Nuki לכל מנוי — רק כשהמכון עבר לדלת. קריאה ישירה מ-Firestore. */
      function loadNuki() {
        if (!(CBA.door && CBA.fb && CBA.fb.readCollection)) return;
        CBA.door.readPublic(function (err, pub) {
          gaNuki.on = !!(pub && pub.gymOn);
          if (!gaNuki.on) return;
          CBA.fb.readCollection("gymMembers", function (e1, rows) {
            (rows || []).forEach(function (d) { if (d.uid) gaNuki.byId[String(d["מזהה"] || d.id || "")] = d.uid; });
            CBA.fb.readCollection("gymNuki", function (e2, n) {
              (n || []).forEach(function (d) { if (d.uid || d.id) gaNuki.state[d.uid || d.id] = d; });
              if (gaLast && !stale() && !gaHoldTimer) paintMembers();   /* GMB6+GMB2 (גל 8, 1.10.26) — לא לתוך DOM מנותק ולא מעל תיבת אימות פתוחה */
            });
          });
        });
      }

      // cb אופציונלי — נקרא אחרי שה-DOM עודכן (ניהול השאלון והגדרות נשענים עליו).
      /* GMB6 (גל 8, 1.10.26) — אחרי רענון שקט, load() ישן (שמור במגירה/שאלון/הגדרות) צייר לתוך DOM מנותק.
         עכשיו: אם הרשימה שלנו כבר לא על המסך — מעבירים לציור החי (רק כשעדיין במסך המכון). */
      function stale() { return !document.body.contains(membersEl); }
      function handOff(cb) {
        if (gaLiveLoad && gaLiveLoad !== load && CBA.onScreen && CBA.onScreen("gymAdmin")) { gaLiveLoad(cb); return true; }
        return false;
      }
      function load(cb) {
        if (stale() && handOff(cb)) return;   /* GMB6 (גל 8, 1.10.26) */
        if (!(CBA.data && CBA.data.getGymList)) {
          membersEl.innerHTML = '<div class="club-empty">המודול עדיין לא מחובר לגיליון.</div>';
          if (cb) cb();
          return;
        }
        /* חימום מראש (4.10): רשימת התושבים להקמת מנוי נטענת עכשיו, כך שהבורר מוכן כשפותחים את הטופס */
        if (CBA.data.getGymResidentPicker) CBA.data.getGymResidentPicker(function () {});
        CBA.data.getGymList(function (res) {
          /* GMB6 (גל 8, 1.10.26) — התשובה חזרה אחרי שהמסך צויר מחדש: לא מציירים לתוך DOM מנותק */
          if (stale()) {
            if (handOff(cb)) return;
            if (res && res.ok) gaLast = res;
            if (cb) cb();
            return;
          }
          if (!res || !res.ok) {
            /* GMB3 (גל 8, 1.10.26) — שגיאת טעינה עם "נסה שוב" במקום מבוי סתום */
            membersEl.innerHTML = CBA.ui && CBA.ui.emptyState
              ? CBA.ui.emptyState({ icon: "inbox", title: "לא הצלחנו לטעון את המנויים",
                  sub: (res && res.error) || "לא ניתן לטעון כרגע.", ctaLabel: "נסה שוב", ctaAttr: "data-ga-retry" })
              : '<div class="club-empty">' + CBA.esc((res && res.error) || "לא ניתן לטעון כרגע.") +
                ' <button type="button" class="btn-ghost btn-sm" data-ga-retry>נסה שוב</button></div>';
            var retry = membersEl.querySelector("[data-ga-retry]");
            if (retry) retry.addEventListener("click", function () { membersEl.innerHTML = gaLoadingHTML(); load(); });
            kpisEl.innerHTML = "";
            if (gaBar) { CBA.canopy.pill(gaBar, "ga-p-mine", null); gaBar.querySelector("#ga-p-gaps").hidden = true; }
            if (cb) cb();
            return;
          }
          gaLast = res;
          /* 25.9 — תשובה חלקית מ-Firestore (js/data/gymFs.js): הרשימה כבר על
             המסך, הפרטים האישיים בדרך. עד אז כפתורי הפעולה נעולים. */
          container.classList.toggle("ga-partial", !!res.partial);
          var gaNote = container.querySelector("#ga-partial-note");
          if (!gaNote) {
            gaNote = document.createElement("div");
            gaNote.id = "ga-partial-note"; gaNote.className = "gym-hint gym-hint--tight";
            gaNote.textContent = "טוען פרטים אישיים… הפעולות ייפתחו בעוד רגע.";
            container.querySelector(".ga-grid").parentNode.insertBefore(gaNote, container.querySelector(".ga-grid"));
          }
          gaNote.hidden = !res.partial;
          var members = res.members || [];
          var active  = countBy(members, "פעיל");
          /* GMB1 (גל 8, 1.10.26) — גם "ממתין לאישור" ממתין לך */
          var mine    = countBy(members, "ממתין לאישור רופא") + countBy(members, "ממתין לאימות") + countBy(members, "ממתין לאישור");
          var waitPay = countBy(members, "ממתין לתשלום");
          var expired = countBy(members, "פג תוקף");
          var gaps = members.filter(function (x) { var sv = String(x["מצב סנכרון"] || "").trim(); return sv && sv !== "מסונכרן"; }).length;
          /* A0 — "ממתינים לך" ו"פערי תשלום" עברו לסרגל (אותם מספרים); השאר נשארים כאן */
          kpisEl.innerHTML = chip(active, "פעילים", "ok") + (gaBar ? "" : chip(mine, "ממתינים לך", "warn")) +
            (waitPay ? chip(waitPay, "ממתינים לתשלום", "") : "") + (expired ? chip(expired, "פג תוקף", "") : "") +
            (gaps && !gaBar ? chip(gaps, "פערי תשלום", "warn") : "");
          if (gaBar) {
            CBA.canopy.pill(gaBar, "ga-p-mine", mine);
            CBA.canopy.pill(gaBar, "ga-p-gaps", gaps);
            gaBar.querySelector("#ga-p-gaps").hidden = !gaps;   // כמו השבב: מוצג רק כשיש פערים
          }
          paintMembers();
          if (gaWinScrollY) window.scrollTo(0, gaWinScrollY);
          gaWinScrollY = 0;
          if (cb) cb();
        });
      }

      gaLiveLoad = load;   /* GMB6 (גל 8, 1.10.26) */
      load();
      loadNuki();
    }
  };
})();
