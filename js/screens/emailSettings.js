/* מסך אדמין "ניהול מיילים" (שלב 1, 2026-08-18).
   עורך את אותו גיליון "הגדרות מיילים" שהמייל-אנג'ין ב-Code.gs קורא ממנו ישירות
   (getEmailSettings_) — אין קאש, כל שינוי כאן נכנס לתוקף באותה שנייה.

   מידור (ר' handleListEmailSettings_/saveEmailSetting_ ב-Code.gs): השרת כבר
   מחזיר רק את השורות שהמבקש רשאי לראות — מנהל-על רואה הכול, מנהל תחום (תקציב/
   מועדון/תושבים) רואה רק את השורות של התחום שלו. המסך הזה לא עושה סינון הרשאות
   משלו — הוא פשוט מציג את מה שחזר מהשרת, מקובץ לפי "domain".

   שלושה סוגי שורות, לפי המפתח:
   - MASTER_ENABLED — מתג ראשי, מוצג בבאנר נפרד למעלה (רק אם חזר מהשרת, כלומר
     רק למנהל-על). כאן ה"פעיל" של השורה *הוא* המתג עצמו — אין subject/body.
   - RULE_* — ערך הגדרה (סף ימים/יום בשבוע/בחודש), לא תבנית מייל. מוצג כשדה
     מספרי בודד עם שמירה מיידית, בלי drawer.
   - כל השאר — תבנית מייל אמיתית (נושא+גוף): toggle פעיל/כבוי + כפתור עריכה
     שפותח drawer עם נושא/גוף/placeholders (מהערת ה"הערה" שנשמרה בשרת). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

var emsState = { rows: [], loaded: false, loading: false, error: null };
var emsScrollY = 0;

// תוויות קצרות לכללי RULE_* — הטקסט המלא נמצא ב"הערה" שחוזרת מהשרת ומוצג כרמז.
var EMS_RULE_LABEL = {
  RULE_STALE_DAYS: "אחרי כמה ימים לשלוח למנהל תזכורת על בקשה תקועה",
  RULE_WEEKLY_DAY: "יום הסיכום השבועי (0=ראשון … 6=שבת)",
  RULE_MONTHLY_DAY: "יום הסיכום החודשי (1–31)",
  RULE_CLUB_REMINDER_DAYS_BEFORE: "כמה ימים לפני מועד שריון לשלוח תזכורת לתושב"
};
var EMS_DOMAIN_LABEL = {
  "תושבים": "תושבים והרשמה", "תקציב": "תקציב והחזרים", "מועדון": "מועדון",
  "על": "הגדרות כלליות ומנהל-על"
};
var EMS_DOMAIN_ORDER = ["תושבים", "תקציב", "מועדון", "על"];

function emsEsc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

CBA.screens.emailSettings = {
  title: "ניהול מיילים",

  render(container) {
    emsScrollY = window.scrollY || 0;
    container.innerHTML =
      '<div class="screen-head"><div class="screen-head__title">ניהול מיילים</div>' +
      '<div class="screen-head__sub">עריכת נוסח, כללי תזמון, והדלקה/כיבוי של המיילים האוטומטיים שהאפליקציה שולחת</div></div>' +
      '<div id="ems-body">' + emsLoadingHTML() + "</div>";

    var body = container.querySelector("#ems-body");

    function load() {
      body.innerHTML = emsLoadingHTML();
      CBA.data.listEmailSettings(function (res) {
        if (!res || !res.ok) {
          body.innerHTML = '<div class="card club-card"><div class="club-empty">לא ניתן לטעון כרגע. ' +
            emsEsc((res && res.error) || "") + "</div></div>";
          return;
        }
        emsState.rows = res.rows || [];
        emsState.loaded = true;
        body.innerHTML = emsRenderAll();
        if (emsScrollY) { window.scrollTo(0, emsScrollY); emsScrollY = 0; }
        emsBindActions(body, load);
      });
    }

    load();
  }
};

function emsLoadingHTML() {
  return '<div class="card club-card"><div class="club-loading"><div class="rs-spin"></div>טוען…</div></div>';
}

function emsRenderAll() {
  var rows = emsState.rows;
  var master = rows.filter(function (r) { return r.key === "MASTER_ENABLED"; })[0];
  var rules = rows.filter(function (r) { return r.key.indexOf("RULE_") === 0; });
  var templates = rows.filter(function (r) { return r.key !== "MASTER_ENABLED" && r.key.indexOf("RULE_") !== 0; });

  var html = "";
  if (master) html += emsMasterHTML(master);

  // מקבצים תבניות + כללים יחד לפי "תחום", בסדר קבוע — כללי RULE_* (שכולם תחום
  // "על") מוצגים בראש הכרטיס של "הגדרות כלליות", לפני התבניות שבאותו תחום
  // (כרגע רק ADMIN_WEEKLY_DIGEST).
  EMS_DOMAIN_ORDER.forEach(function (domain) {
    var domRules = domain === "על" ? rules : [];
    var domTemplates = templates.filter(function (r) { return r.domain === domain; });
    if (!domRules.length && !domTemplates.length) return;
    html += emsDomainCardHTML(domain, domRules, domTemplates);
  });

  if (!master && !rules.length && !templates.length) {
    html = '<div class="card club-card"><div class="club-empty">אין לך גישה לאף הגדרת מייל כרגע.</div></div>';
  }
  return html;
}

function emsMasterHTML(row) {
  var off = !row.active;
  return (
    '<div class="card club-card">' +
      '<div class="ems-master' + (off ? " ems-master--off" : "") + '">' +
        '<div>' +
          '<div class="ems-master__title">' + (off ? "שליחת המיילים כבויה כרגע" : "שליחת מיילים אוטומטית פעילה") + "</div>" +
          '<div class="ems-master__sub">' + emsEsc(row.note) + "</div>" +
        "</div>" +
        emsToggleHTML("MASTER_ENABLED", row.active) +
      "</div>" +
    "</div>"
  );
}

function emsDomainCardHTML(domain, rules, templates) {
  var titleCls = domain === "על" ? "ems-domain-title ems-domain-title--super" : "ems-domain-title";
  var html = '<div class="card club-card"><div class="' + titleCls + '">' + emsEsc(EMS_DOMAIN_LABEL[domain] || domain) + "</div>";

  rules.forEach(function (r) {
    html +=
      '<div class="ems-rule-row" data-rule="' + emsEsc(r.key) + '">' +
        '<div class="ems-rule-row__label">' + emsEsc(EMS_RULE_LABEL[r.key] || r.key) + "</div>" +
        '<div class="ems-rule-row__input">' +
          '<input class="field-input" type="number" min="0" data-rule-value value="' + emsEsc(r.body) + '">' +
          '<button type="button" class="btn-ghost btn-sm" data-rule-save="' + emsEsc(r.key) + '">שמור</button>' +
        "</div>" +
      "</div>";
  });

  templates.forEach(function (r) {
    var off = !r.active;
    html +=
      '<div class="ems-row" data-tpl="' + emsEsc(r.key) + '">' +
        '<div class="ems-row__main">' +
          '<div class="ems-row__title' + (off ? " ems-row__title--off" : "") + '">' + emsEsc(r.subject || r.key) + "</div>" +
          '<div class="ems-row__meta">' + emsEsc(r.note) + "</div>" +
        "</div>" +
        '<div class="ems-row__actions">' +
          emsToggleHTML(r.key, r.active) +
          '<button type="button" class="btn-ghost btn-sm" data-edit="' + emsEsc(r.key) + '">עריכה</button>' +
        "</div>" +
      "</div>";
  });

  html += "</div>";
  return html;
}

function emsToggleHTML(key, active) {
  return (
    '<label class="ems-toggle" title="' + (active ? "פעיל — לחיצה תכבה" : "כבוי — לחיצה תדליק") + '">' +
      '<input type="checkbox" data-toggle="' + emsEsc(key) + '"' + (active ? " checked" : "") + ">" +
      '<span class="ems-toggle__slider"></span>' +
    "</label>"
  );
}

function emsRowByKey(key) {
  for (var i = 0; i < emsState.rows.length; i++) if (emsState.rows[i].key === key) return emsState.rows[i];
  return null;
}

function emsBindActions(body, reload) {
  // מתג פעיל/כבוי — כולל MASTER_ENABLED (שם "פעיל" הוא בדיוק המתג הראשי עצמו).
  body.querySelectorAll("[data-toggle]").forEach(function (input) {
    input.addEventListener("change", function () {
      var key = input.dataset.toggle;
      var next = input.checked;
      input.disabled = true;
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("emailSettings:" + key);
      CBA.data.saveEmailSetting(key, { active: next }, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("emailSettings:" + key);
        input.disabled = false;
        if (res && res.ok) {
          var row = emsRowByKey(key);
          if (row) row.active = next;
          reload();
        } else {
          input.checked = !next;
          CBA.ui.alert((res && res.error) || "השמירה נכשלה, נסו שוב.");
        }
      });
    });
  });

  // שמירת ערך כלל (RULE_*)
  body.querySelectorAll("[data-rule-save]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.dataset.ruleSave;
      var wrap = body.querySelector('[data-rule="' + key + '"]');
      var input = wrap.querySelector("[data-rule-value]");
      var val = String(input.value || "").trim();
      if (val === "" || isNaN(Number(val))) { CBA.ui.alert("יש להזין מספר."); return; }
      var release = CBA.ui.busy(btn, "שומר…");
      CBA.data.saveEmailSetting(key, { body: val }, function (res) {
        release();
        if (!res || !res.ok) CBA.ui.alert((res && res.error) || "השמירה נכשלה, נסו שוב.");
        else CBA.ui.toast("נשמר");
      });
    });
  });

  // עריכת תבנית — פותח drawer
  body.querySelectorAll("[data-edit]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      emsOpenDrawer(btn.dataset.edit, reload);
    });
  });
}

/* ---------- drawer עריכת תבנית ---------- */
function emsCloseDrawer() {
  var el = document.getElementById("ems-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", emsEsc_);
}
function emsEsc_(e) { if (e.key === "Escape") emsCloseDrawer(); }

function emsOpenDrawer(key, reload) {
  emsCloseDrawer();
  var row = emsRowByKey(key);
  if (!row) return;

  var overlay = document.createElement("div");
  overlay.id = "ems-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-eclose></div>' +
    '<aside class="drawer" role="dialog" aria-label="עריכת תבנית מייל">' +
      '<div class="drawer__head">' +
        '<div class="drawer__title">עריכת מייל</div>' +
        '<button class="drawer__close" data-eclose aria-label="סגור">×</button>' +
      "</div>" +
      '<div class="drawer__body">' +
        '<div class="form-block form-block--first">' +
          '<div class="form-field form-field--wide"><label>נושא המייל</label>' +
            '<input class="field-input" data-ef="subject" value="' + emsEsc(row.subject) + '"></div>' +
        "</div>" +
        '<div class="form-block">' +
          '<div class="form-field form-field--wide"><label>תוכן המייל (טקסט פשוט)</label>' +
            '<textarea class="field-input ems-textarea" data-ef="body">' + emsEsc(row.body) + "</textarea></div>" +
          (row.note ? '<div class="ems-ph"><b>לתשומת לב:</b> ' + emsEsc(row.note) + "</div>" : "") +
        "</div>" +
      "</div>" +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          '<button class="btn-primary" data-esave>שמור</button>' +
          '<button class="btn-ghost" data-eclose>ביטול</button>' +
        "</div>" +
      "</div>" +
    "</aside>";
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-eclose]").forEach(function (el) { el.addEventListener("click", emsCloseDrawer); });
  document.addEventListener("keydown", emsEsc_);

  overlay.querySelector("[data-esave]").addEventListener("click", function () {
    var subject = overlay.querySelector('[data-ef="subject"]').value;
    var bodyText = overlay.querySelector('[data-ef="body"]').value;
    var btn = overlay.querySelector("[data-esave]");
    var release = CBA.ui.busy(btn, "שומר…");
    CBA.data.saveEmailSetting(key, { subject: subject, body: bodyText }, function (res) {
      release();
      if (res && res.ok) {
        row.subject = subject; row.body = bodyText;
        emsCloseDrawer();
        reload();
      } else {
        CBA.ui.alert((res && res.error) || "השמירה נכשלה, נסו שוב.");
      }
    });
  });
}
