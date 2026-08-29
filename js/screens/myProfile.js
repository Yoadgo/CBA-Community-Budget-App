/* myProfile.js — "הפרטים שלי" (2026-08-28)
   ============================================================================
   התושב מעדכן את הפרטים של עצמו. שלוש רמות, ובכוונה נראות שונה על המסך:

     • אישי (טלפון, מקצוע)      — נשמר מיד. יושב במשבצת שלי בגיליון, ולכן
                                   בן/בת הזוג לא יכולים לדרוס אותי.
     • משפחתי (ילדים)            — נשמר מיד, אבל עם חיווי "עודכן ע"י · מתי",
                                   כי כאן שנינו כותבים לאותו תא.
     • אימייל                    — **לא** נשמר מיד. נכנס כבקשה לאישור מנהל,
                                   כי זו הזהות שאיתה נכנסים: תושב שיקליד
                                   אותו לא נכון פשוט ננעל בחוץ.
     • שם משפחה / מספר בית       — לקריאה בלבד, עם הסבר למי לפנות.

   הכל נשען על השרת: הוא זה שיודע באיזו שורה ובאיזו משבצת אני יושב, לפי
   המושב החתום. המסך הזה לא שולח מזהה שורה ולא יכול לגעת בשורה של אף אחד אחר.
   ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  var st = { loaded: false, loading: false, data: null, error: "" };

  /* שדות שנשמרים מיד. label/hint נשמרים כאן ולא בשרת — השרת מחזיק את
     רשימת ההרשאה, הלקוח רק מציג. */
  var FIELDS = [
    { key: "phone", label: "טלפון", type: "tel",
      hint: "הטלפון שמופיע לשכנים במדריך התושבים." },
    { key: "job", label: "מקצוע", type: "text",
      hint: "לא חובה. בהמשך זה יאפשר לשכנים למצוא עזרה בתוך השיכון." }
  ];

  function ico(d, n) {
    return '<svg viewBox="0 0 24 24" width="' + (n || 18) + '" height="' + (n || 18) + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  var ICO = {
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M4 7l8 6 8-6"/>'
  };

  function load(container) {
    st.loading = true; st.error = "";
    CBA.data.getMyProfile(function (res) {
      st.loading = false;
      if (!res || !res.ok) { st.error = (res && res.error) || "לא הצלחנו לטעון את הפרטים."; }
      else { st.data = res; st.loaded = true; }
      if (container.isConnected) draw(container);
    });
  }

  /* ---------------------------------------------------------------- ציור */
  function draw(container) {
    if (st.loading && !st.loaded) { container.innerHTML = head() + CBA.skel.sections(3); return; }
    if (st.error) {
      container.innerHTML = head() + CBA.ui.emptyState({ icon: "inbox", title: "לא הצלחנו לטעון",
        sub: st.error, ctaLabel: "נסו שוב", ctaAttr: "data-retry" });
      var rt = container.querySelector("[data-retry]");
      if (rt) rt.addEventListener("click", function () { load(container); });
      return;
    }

    var d = st.data, v = d.values || {}, ro = d.readOnly || {};
    var pendingEmail = (d.pending || []).filter(function (x) {
      return String(x["שדה"] || "").trim() === "email";
    })[0];

    container.innerHTML =
      head() +
      // --- אישי ---
      '<section class="card pf-card">' +
        '<div class="pf-card__t">הפרטים שלכם</div>' +
        '<div class="pf-grid">' +
          FIELDS.map(function (f) {
            return '<label class="pf-field">' +
              '<span class="pf-label">' + esc(f.label) + '</span>' +
              '<input class="field-input" type="' + f.type + '" data-f="' + f.key + '" value="' + esc(v[f.key] || "") + '">' +
              '<span class="pf-hint">' + esc(f.hint) + '</span>' +
              '</label>';
          }).join("") +
        '</div>' +
        '<div class="pf-foot"><button type="button" class="btn-primary" data-save="personal">שמירה</button>' +
          '<span class="pf-saved" data-saved="personal" hidden>נשמר ✓</span></div>' +
      '</section>' +

      // --- משפחתי ---
      '<section class="card pf-card">' +
        '<div class="pf-card__t">הילדים שלנו</div>' +
        '<label class="pf-field">' +
          '<span class="pf-label">שמות וגילאים</span>' +
          '<textarea class="field-input pf-area" rows="3" data-f="kids" ' +
            'placeholder="למשל: יונתן (9), אלה (6)">' + esc(v.kids || "") + '</textarea>' +
          '<span class="pf-hint">שדה משותף לשני בני הזוג — האחרון ששומר קובע.' +
            (d.touchedBy ? ' עודכן לאחרונה ע"י ' + esc(d.touchedBy) +
              (d.touchedAt ? ' · ' + esc(dateLabel(d.touchedAt)) : "") + '.' : "") + '</span>' +
        '</label>' +
        '<div class="pf-foot"><button type="button" class="btn-primary" data-save="kids">שמירה</button>' +
          '<span class="pf-saved" data-saved="kids" hidden>נשמר ✓</span></div>' +
      '</section>' +

      // --- אימייל ---
      '<section class="card pf-card">' +
        '<div class="pf-card__t">' + ico(ICO.mail) + ' האימייל שלכם</div>' +
        '<div class="pf-current">' + esc(v.email || "—") + '</div>' +
        (pendingEmail
          ? '<div class="pf-pending">' + ico(ICO.clock, 16) +
              '<span>ממתין לאישור הוועד: <b>' + esc(pendingEmail["ערך מבוקש"] || "") + '</b></span>' +
              '<button type="button" class="rs-ghost" data-cancel-req="' + esc(pendingEmail["מזהה"] || "") + '">ביטול הבקשה</button>' +
            '</div>'
          : '<div class="pf-emailform">' +
              '<input class="field-input" type="email" data-f="email" placeholder="כתובת אימייל חדשה">' +
              '<button type="button" class="btn-ghost" data-req-email>בקשת שינוי</button>' +
            '</div>') +
        '<div class="pf-hint">זו הכתובת שאיתה נכנסים לאפליקציה, ולכן שינוי שלה מאושר ע"י הוועד ' +
          'ולא נשמר מיד. עד האישור אפשר להמשיך להיכנס כרגיל.</div>' +
      '</section>' +

      // --- לקריאה בלבד ---
      '<section class="card pf-card pf-card--ro">' +
        '<div class="pf-card__t">' + ico(ICO.lock) + ' פרטים שהוועד מנהל</div>' +
        '<div class="pf-ro">' +
          '<div><span>שם משפחה</span><b>' + esc(ro.family || "—") + '</b></div>' +
          '<div><span>מספר בית</span><b>' + esc(ro.house || "—") + '</b></div>' +
        '</div>' +
        '<div class="pf-hint">מספר הבית ושם המשפחה מקושרים למפה, לשיוך ההוצאות ולמדריך התושבים. ' +
          'לשינוי — פנו לוועד.</div>' +
      '</section>';

    bind(container);
  }

  function head() {
    return '<div class="screen-head"><div class="screen-head__title">הפרטים שלי</div>' +
      '<div class="screen-head__sub">מה שמופיע עליכם במדריך התושבים ובמערכת</div></div>';
  }
  function dateLabel(v) {
    try {
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
    } catch (e) { return String(v); }
  }

  /* -------------------------------------------------------------- חיווט */
  function bind(container) {
    // סימון "יש עריכה פתוחה" — מונע מרענון הרקע לדרוס הקלדה באמצע
    container.querySelectorAll("[data-f]").forEach(function (el) {
      el.addEventListener("input", function () {
        if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("profileEdit");
      });
    });

    container.querySelectorAll("[data-save]").forEach(function (btn) {
      btn.addEventListener("click", function () { doSave(container, btn); });
    });

    var reqBtn = container.querySelector("[data-req-email]");
    if (reqBtn) reqBtn.addEventListener("click", function () { doEmailRequest(container); });

    var cancelBtn = container.querySelector("[data-cancel-req]");
    if (cancelBtn) cancelBtn.addEventListener("click", function () {
      CBA.ui.confirm("הבקשה תבוטל והאימייל יישאר כפי שהוא.",
        { title: "לבטל את הבקשה?", okText: "ביטול הבקשה", danger: true }
      ).then(function (ok) {
        if (!ok) return;
        cancelBtn.disabled = true;
        CBA.data.cancelProfileChange(cancelBtn.dataset.cancelReq, function (res) {
          if (!res || !res.ok) {
            cancelBtn.disabled = false;
            CBA.ui.alert((res && res.error) || "לא הצלחנו לבטל את הבקשה.");
            return;
          }
          st.loaded = false; load(container);
        });
      });
    });
  }

  function doSave(container, btn) {
    var which = btn.dataset.save;
    var keys = which === "kids" ? ["kids"] : FIELDS.map(function (f) { return f.key; });
    var fields = {};
    keys.forEach(function (k) {
      var el = container.querySelector('[data-f="' + k + '"]');
      if (el) fields[k] = el.value;
    });
    btn.disabled = true;
    var prev = btn.textContent;
    btn.textContent = "שומר…";
    CBA.data.saveMyProfile(fields, function (res) {
      btn.disabled = false; btn.textContent = prev;
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("profileEdit");
      if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "השמירה נכשלה. נסו שוב."); return; }
      // מרעננים את המצב מהשרת כדי שחיווי "עודכן ע"י" יהיה אמיתי ולא מנוחש
      st.loaded = false; load(container);
      var tag = container.querySelector('[data-saved="' + which + '"]');
      if (tag) { tag.hidden = false; setTimeout(function () { if (tag) tag.hidden = true; }, 2500); }
    });
  }

  function doEmailRequest(container) {
    var el = container.querySelector('[data-f="email"]');
    var val = el ? String(el.value || "").trim() : "";
    if (!val) { CBA.ui.alert("צריך להקליד כתובת אימייל חדשה."); return; }
    CBA.ui.confirm('הבקשה תישלח לוועד לאישור. עד שתאושר, ההתחברות לאפליקציה נשארת עם הכתובת הנוכחית.',
      { title: "לשלוח בקשה לשינוי האימייל?", okText: "שליחת בקשה" }
    ).then(function (ok) {
      if (!ok) return;
      CBA.data.submitProfileChange("email", val, function (res) {
        if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "לא הצלחנו לשלוח את הבקשה."); return; }
        if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("profileEdit");
        st.loaded = false; load(container);
      });
    });
  }

  CBA.screens.resMe = {
    render: function (container) {
      if (st.loaded) { draw(container); return; }
      container.innerHTML = head() + CBA.skel.sections(3);
      load(container);
    }
  };
})();
