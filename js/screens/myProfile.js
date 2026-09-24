/* myProfile.js — "הפרטים שלי" v2 (2026-09-21, הורחב 2026-09-22 עם תאריכי לידה)
   ============================================================================
   כמו הגרסה הקודמת (28.8.26), פלוס מתג "דייר/ת 1"/"דייר/ת 2": כל תושב יכול
   לערוך גם את הפרטים של בן/בת הזוג, לא רק את שלו/ה. הארכיטקטורה לא השתנתה —
   עדיין שורה = משק בית עם שתי משבצות בגיליון. זה נראה כמו שני דיירים נפרדים
   רק כי השרת עכשיו מקבל "slot" כפרמטר במקום לנעול תמיד למשבצת של הקורא —
   השורה עצמה (איזה משק בית) עדיין נגזרת מהמושב החתום ולא ניתנת לשינוי.

     • אישי (שם פרטי, טלפון, מקצוע, תאריך לידה) — נשמר מיד. יושב במשבצת
                                       הנבחרת בגיליון (כולל עמודות "תאריך לידה
                                       1/2" החדשות).
     • משפחתי (ילדים)              — נשמר מיד, משותף לשני הצדדים, עם חיווי
                                       "עודכן ע"י · מתי". מ-22.9.26 כל ילד/ה
                                       הוא שם + תאריך לידה (לא עוד "גיל" טקסט
                                       חופשי שמתיישן) — נשמר כ-JSON באותה
                                       עמודה "שמות ילדים" שכבר קיימת, בלי
                                       שינוי סכימה בשרת. ערך ישן שאינו JSON
                                       מוצג כהערה בלבד ("פורמט קודם"), והשמירה
                                       הבאה כותבת תמיד את הפורמט החדש.
     • אימייל                       — **לא** נשמר מיד, גם כשעורכים את המשבצת
                                       של בן/בת הזוג. נכנס כבקשה לאישור מנהל,
                                       ואם זו משבצת אחרת מזו של המבקש — נשלחת
                                       גם התראה לכתובת הנוכחית של אותו/ה צד,
                                       כדי שזה לעולם לא יקרה בלי שהוא/היא ידע/תדע.
     • שם משפחה / מספר בית          — לקריאה בלבד, עם הסבר למי לפנות.
     • משבצת ריקה (אין עדיין בן/בת זוג רשומ/ה) — כרטיס "פנו לוועד", לא טופס.
   ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  var st = { loaded: false, loading: false, data: null, error: "", activeSlot: 1,
    kidsRows: [], kidsLegacyText: "" };

  /* שדות אישיים שנשמרים מיד, לכל משבצת. label/hint נשמרים כאן ולא בשרת —
     השרת מחזיק את רשימת ההרשאה, הלקוח רק מציג. */
  var FIELDS = [
    { key: "firstName", label: "שם פרטי", type: "text", hint: "" },
    { key: "phone", label: "טלפון", type: "tel",
      hint: "הטלפון שמופיע לשכנים במדריך התושבים." },
    { key: "job", label: "מקצוע", type: "text",
      hint: "לא חובה. בהמשך זה יאפשר לשכנים למצוא עזרה בתוך השיכון." },
    { key: "birthDate", label: "תאריך לידה", type: "date", hint: "" }
  ];

  function ico(d, n) {
    return '<svg viewBox="0 0 24 24" width="' + (n || 18) + '" height="' + (n || 18) + '" fill="none" ' +
      'stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }
  var ICO = {
    lock: '<path d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"/>',
    clock: '<path d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/>',
    mail: '<path d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75"/>',
    user: '<path d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"/>'
  };

  /* --------------------------------------------------------- עזר: ילדים */
  /* מפענח את תוכן העמודה "שמות ילדים": מצפה ל-JSON של [{name,dob}]. ערך
     ישן (טקסט חופשי כמו "יונתן (9), אלה (6)") לא נעלם — מוצג כהערה, לא
     נטען לעורך. השמירה הבאה כותבת תמיד JSON, ומחליפה את הטקסט הישן. */
  function parseKidsValue_(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return { rows: [], legacyText: "" };
    try {
      var parsed = JSON.parse(s);
      if (Array.isArray(parsed)) {
        return {
          rows: parsed.map(function (k) {
            return { name: String((k && k.name) || ""), dob: String((k && k.dob) || "") };
          }),
          legacyText: ""
        };
      }
    } catch (e) { /* לא JSON תקין — מתייחסים כטקסט ישן, לא זורקים שגיאה */ }
    return { rows: [], legacyText: s };
  }

  /* גיל מחושב מתאריך לידה, לתצוגה בלבד — לא נשמר בשום מקום, כדי שלא ידרוש
     עדכון ידני עם הזמן (בדיוק העיקרון של "לא לשכפל נתון לשני מקומות"). */
  /* 🔴 תיקון 23.9.26 — "הגיל מחושב אבל התאריך לא נשמר": הוא כן נשמר. הגיליון
     ממיר "2020-05-01" לתא-תאריך אמיתי, והשרת מחזיר אותו כמחרוזת ארוכה
     ("Fri May 01 2020 00:00:00 GMT+0300 ..."). new Date() מפענח אותה (ולכן הגיל
     הופיע), אבל <input type="date"> מקבל **רק** YYYY-MM-DD ומציג שדה ריק.
     הפונקציה הזאת מנרמלת כל צורה לצורה שהשדה מבין. */
  function isoDate_(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var d = new Date(s);
    if (isNaN(d.getTime())) return "";
    var mm = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + mm + "-" + dd;
  }

  function ageFromDob_(dob) {
    var d = new Date(dob);
    if (isNaN(d.getTime())) return "";
    var now = new Date();
    var age = now.getFullYear() - d.getFullYear();
    var m = now.getMonth() - d.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
    return age >= 0 ? age : "";
  }

  /* קורא את הערכים הנוכחיים מה-DOM (לפני שמוסיפים/מסירים שורה) כדי שהקלדה
     שעדיין לא נשמרה לא תאבד כשמשנים את מבנה הרשימה. */
  function syncKidsFromDom_(container) {
    container.querySelectorAll("[data-kidrow]").forEach(function (rowEl) {
      var i = parseInt(rowEl.dataset.kidrow, 10);
      if (!st.kidsRows[i]) return;
      var nameEl = rowEl.querySelector("[data-kid-name]");
      var dobEl = rowEl.querySelector("[data-kid-dob]");
      if (nameEl) st.kidsRows[i].name = nameEl.value;
      if (dobEl) st.kidsRows[i].dob = dobEl.value;
    });
  }

  function load(container) {
    st.loading = true; st.error = "";
    CBA.data.getMyProfile(function (res) {
      st.loading = false;
      if (!res || !res.ok) { st.error = (res && res.error) || "לא הצלחנו לטעון את הפרטים."; }
      else {
        st.data = res; st.loaded = true;
        // בטעינה ראשונה (או אחרי ריענון) פותחים תמיד על המשבצת של עצמי.
        if (!st.activeSlot || (st.activeSlot !== 1 && st.activeSlot !== 2)) st.activeSlot = res.mySlot;
        // "שמות ילדים" משותף לשתי המשבצות (אותו תא) — לוקחים מהמשבצת שלי,
        // תמיד קיימת.
        var raw = (res.slots[res.mySlot] && res.slots[res.mySlot].values.kids) || "";
        var parsed = parseKidsValue_(raw);
        st.kidsRows = parsed.rows;
        st.kidsLegacyText = parsed.legacyText;
      }
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

    var d = st.data;
    var slotNum = st.activeSlot;
    var slotData = d.slots[slotNum] || d.slots[1];
    var isMe = slotNum === d.mySlot;

    container.innerHTML =
      head() +
      slotSwitch(d) +
      touchLine(d) +
      (slotData.exists ? slotBody(slotData, slotNum, isMe) : emptySlot(slotNum)) +
      kidsSection() +
      // --- לקריאה בלבד (משותף, לא תלוי במשבצת) ---
      '<section class="card pf-card pf-card--ro">' +
        '<div class="pf-card__t">' + ico(ICO.lock) + ' פרטים שהוועד מנהל</div>' +
        '<div class="pf-ro">' +
          '<div><span>שם משפחה</span><b>' + esc(d.readOnly.family || "—") + '</b></div>' +
          '<div><span>מספר בית</span><b>' + esc(d.readOnly.house || "—") + '</b></div>' +
        '</div>' +
        '<div class="pf-hint">מספר הבית ושם המשפחה מקושרים למפה, לשיוך ההוצאות ולמדריך התושבים. ' +
          'לשינוי — פנו לוועד.</div>' +
      '</section>';

    bind(container);
  }

  function slotSwitch(d) {
    return '<div class="pf-slotswitch" role="tablist">' +
      [1, 2].map(function (n) {
        var active = n === st.activeSlot;
        var label = n === d.mySlot ? ("דייר/ת " + n + " (אני)") : ("דייר/ת " + n);
        return '<button type="button" class="pf-slotbtn' + (active ? " is-active" : "") + '" ' +
          'data-slotswitch="' + n + '" role="tab" aria-selected="' + (active ? "true" : "false") + '">' +
          esc(label) + '</button>';
      }).join("") +
      '</div>';
  }

  function touchLine(d) {
    if (!d.touchedBy) return "";
    return '<div class="pf-touchline">עודכן לאחרונה ע"י ' + esc(d.touchedBy) +
      (d.touchedAt ? ' · ' + esc(dateLabel(d.touchedAt)) : "") + '</div>';
  }

  function emptySlot(slotNum) {
    return '<section class="card pf-card pf-card--empty">' +
      '<div class="pf-card__t">' + ico(ICO.user) + ' דייר/ת ' + slotNum + '</div>' +
      '<div class="pf-hint">עדיין אין דייר/ת רשומ/ה במשבצת הזו. להוספת בן/בת זוג לבית — פנו לוועד.</div>' +
    '</section>';
  }

  function slotBody(slotData, slotNum, isMe) {
    var v = slotData.values || {};
    var pendingEmail = (slotData.pending || []).filter(function (x) {
      return String(x["שדה"] || "").trim() === "email";
    })[0];

    return (
      // --- אישי ---
      '<section class="card pf-card">' +
        '<div class="pf-card__t">הפרטים של דייר/ת ' + slotNum + (isMe ? " (אני)" : "") + '</div>' +
        '<div class="pf-grid">' +
          FIELDS.map(function (f) {
            var age = (f.key === "birthDate" && v.birthDate) ? ageFromDob_(v.birthDate) : "";
            return '<label class="pf-field">' +
              '<span class="pf-label">' + esc(f.label) + '</span>' +
              '<input class="field-input" type="' + f.type + '" data-f="' + f.key + '" value="' + esc(f.type === "date" ? isoDate_(v[f.key]) : (v[f.key] || "")) + '">' +
              (f.hint ? '<span class="pf-hint">' + esc(f.hint) + '</span>' : '') +
              (age !== "" ? '<span class="pf-hint">גיל מחושב: ' + esc(age) + '</span>' : '') +
              '</label>';
          }).join("") +
        '</div>' +
        '<div class="pf-foot"><button type="button" class="btn-primary" data-save="personal">שמירה</button>' +
          '<span class="pf-saved" data-saved="personal" hidden>נשמר ✓</span></div>' +
      '</section>' +

      // --- אימייל ---
      '<section class="card pf-card">' +
        '<div class="pf-card__t">' + ico(ICO.mail) + ' האימייל של דייר/ת ' + slotNum + '</div>' +
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
        '<div class="pf-hint">' + (isMe
          ? 'זו הכתובת שאיתה נכנסים לאפליקציה, ולכן שינוי שלה מאושר ע"י הוועד ולא נשמר מיד. עד האישור אפשר להמשיך להיכנס כרגיל.'
          : 'זו כתובת ההתחברות של דייר/ת ' + slotNum + '. שינוי שלה מאושר ע"י הוועד, ונשלחת עליו התראה גם לכתובת הנוכחית שלו/ה — לעולם לא בשקט.') +
        '</div>' +
      '</section>'
    );
  }

  /* --- משפחתי (ילדים) — משותף, לא תלוי במשבצת, מוצג פעם אחת --- */
  function kidsSection() {
    var legacyNote = st.kidsLegacyText
      ? '<div class="pf-kids-legacy">פורמט קודם (מוצג לעיון בלבד): ' + esc(st.kidsLegacyText) +
        '<br>אפשר להזין מחדש כשם + תאריך לידה למטה — השמירה הבאה תחליף את הטקסט הזה.</div>'
      : '';
    var rows = st.kidsRows.map(function (k, i) {
      var age = ageFromDob_(k.dob);
      return '<div class="pf-kidrow" data-kidrow="' + i + '">' +
        '<input class="field-input" type="text" data-kid-name="' + i + '" placeholder="שם" value="' + esc(k.name) + '">' +
        '<input class="field-input" type="date" data-kid-dob="' + i + '" value="' + esc(isoDate_(k.dob)) + '">' +
        '<span class="pf-kidrow__age">' + (age !== "" ? esc(age) : "") + '</span>' +
        '<button type="button" class="pf-kidrow__remove" data-kid-remove="' + i + '" aria-label="הסרת ילד/ה">✕</button>' +
      '</div>';
    }).join("");

    return '<section class="card pf-card">' +
      '<div class="pf-card__t">הילדים שלנו</div>' +
      legacyNote +
      '<div class="pf-kidsrows">' + rows + '</div>' +
      '<button type="button" class="btn-ghost pf-kids-add" data-kid-add>+ הוספת ילד/ה</button>' +
      '<div class="pf-hint">שדה משותף לשני בני הזוג — האחרון ששומר קובע. הגיל מחושב אוטומטית מתאריך הלידה, ולא נשמר בנפרד.</div>' +
      '<div class="pf-foot"><button type="button" class="btn-primary" data-save="kids">שמירה</button>' +
        '<span class="pf-saved" data-saved="kids" hidden>נשמר ✓</span></div>' +
    '</section>';
  }

  function head() {
    return '<div class="screen-head"><div class="screen-head__title">המשפחה שלי</div>' +
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
    container.querySelectorAll("[data-slotswitch]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var n = parseInt(btn.dataset.slotswitch, 10);
        if (n !== st.activeSlot) { st.activeSlot = n; draw(container); }
      });
    });

    // סימון "יש עריכה פתוחה" — מונע מרענון הרקע לדרוס הקלדה באמצע
    container.querySelectorAll("[data-f], [data-kid-name], [data-kid-dob]").forEach(function (el) {
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

    var addBtn = container.querySelector("[data-kid-add]");
    if (addBtn) addBtn.addEventListener("click", function () {
      syncKidsFromDom_(container);
      st.kidsRows.push({ name: "", dob: "" });
      draw(container);
    });
    container.querySelectorAll("[data-kid-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        syncKidsFromDom_(container);
        var i = parseInt(btn.dataset.kidRemove, 10);
        st.kidsRows.splice(i, 1);
        draw(container);
      });
    });
  }

  function doSave(container, btn) {
    var which = btn.dataset.save;
    var fields = {};

    if (which === "kids") {
      syncKidsFromDom_(container);
      var cleaned = st.kidsRows
        .map(function (k) { return { name: String(k.name || "").trim(), dob: String(k.dob || "").trim() }; })
        .filter(function (k) { return k.name || k.dob; });
      fields.kids = JSON.stringify(cleaned);
    } else {
      FIELDS.forEach(function (f) {
        var el = container.querySelector('[data-f="' + f.key + '"]');
        if (el) fields[f.key] = el.value;
      });
    }

    btn.disabled = true;
    var prev = btn.textContent;
    btn.textContent = "שומר…";
    CBA.data.saveMyProfile(st.activeSlot, fields, function (res) {
      btn.disabled = false; btn.textContent = prev;
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("profileEdit");
      if (!res || !res.ok) { CBA.ui.alert((res && res.error) || "השמירה נכשלה. נסו שוב."); return; }
      // מרעננים את המצב מהשרת כדי שחיווי "עודכן ע"י" (וגם רשימת הילדים) יהיה
      // אמיתי ולא מנוחש
      st.loaded = false; load(container);
      var tag = container.querySelector('[data-saved="' + which + '"]');
      if (tag) { tag.hidden = false; setTimeout(function () { if (tag) tag.hidden = true; }, 2500); }
    });
  }

  function doEmailRequest(container) {
    var el = container.querySelector('[data-f="email"]');
    var val = el ? String(el.value || "").trim() : "";
    if (!val) { CBA.ui.alert("צריך להקליד כתובת אימייל חדשה."); return; }
    var slotNum = st.activeSlot;
    var isMe = st.data && slotNum === st.data.mySlot;
    var msg = isMe
      ? 'הבקשה תישלח לוועד לאישור. עד שתאושר, ההתחברות לאפליקציה נשארת עם הכתובת הנוכחית.'
      : 'הבקשה תישלח לוועד לאישור, וגם התראה לכתובת הנוכחית של דייר/ת ' + slotNum + '. עד שהיא תאושר, ' +
        'ההתחברות שלו/ה נשארת עם הכתובת הנוכחית.';
    CBA.ui.confirm(msg,
      { title: "לשלוח בקשה לשינוי האימייל?", okText: "שליחת בקשה" }
    ).then(function (ok) {
      if (!ok) return;
      CBA.data.submitProfileChange("email", val, slotNum, function (res) {
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
