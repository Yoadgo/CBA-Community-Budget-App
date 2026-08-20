/* מסך התושב "מכון כושר" (שלב 2, 2026-08-19).
   ----------------------------------------------------------------------------
   מסך אחד שמשנה את פניו לפי המצב, כי לתושב יש תמיד בדיוק שאלה אחת: "מה מצבי".
   ארבעה פרצופים: אין מנוי · אשף ההרשמה · ממתין (על גווניו) · מנוי קיים.

   האשף מחליף את טופס הגוגל־פורמס שהיה בשימוש עד היום, ושומר על אותו מבנה
   בדיוק (פרטים → תקנון → 15 שאלות → הצהרה וחתימה) כדי שלא ייווצר פער בין מה
   שהתושבים הכירו לבין מה שנשמר. התוכן עצמו מגיע מהשרת (טאב "הגדרות מכון"),
   כך ששינוי נוסח הוא עריכה בגיליון ולא שינוי קוד.

   שתי נקודות שקל לפספס:
   • "ממתין להצהרה" = מנהל המכון הקים מנוי ידנית וביקש מהתושב למלא הצהרה.
     במצב הזה האשף נפתח **בלי שלב בחירת המסלול** — הוא כבר נקבע.
   • markDirty בזמן מילוי: בלי זה ריענון רקע היה יכול לדרוס טופס פתוח באמצע.
     ר' מדיניות ריענון הנתונים. clearDirty קורה גם בהצלחה וגם בביטול. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  var ST_DECLARATION = "ממתין להצהרה";
  var ST_DOCTOR      = "ממתין לאישור רופא";
  var ST_REVIEW      = "ממתין לאישור";
  var ST_PAYMENT     = "ממתין לתשלום";
  var ST_VERIFY      = "ממתין לאימות";
  var ST_ACTIVE      = "פעיל";
  var ST_EXPIRED     = "פג תוקף";

  // מצב המסך נשמר בין ציורים — render() נקרא שוב גם ברענון רקע שקט, ובלי זה
  // האשף היה נסגר באמצע מילוי (אותו לקח כמו persistent-state בשאר המסכים).
  var st = { form: null, my: null, loading: false, wizard: null };

  function esc(s) { return CBA.esc(String(s == null ? "" : s)); }

  function pill(text, tone) {
    return '<span class="gym-pill gym-pill--' + tone + '">' + esc(text) + "</span>";
  }

  function toneFor(status) {
    if (status === ST_ACTIVE) return "ok";
    if (status === ST_DOCTOR) return "danger";
    if (status === ST_EXPIRED) return "muted";
    return "warn";
  }

  /* מה הצעד הבא, במשפט אחד ובעברית פשוטה. זה הטקסט שהתושב באמת קורא. */
  function nextStepText(status) {
    if (status === ST_DECLARATION) return "נפתח עבורך מנוי — נשאר רק למלא הצהרת בריאות וחתימה.";
    if (status === ST_DOCTOR) return "סימנת “כן” באחת משאלות הבריאות, ולכן נדרשת תעודה רפואית מרופא. את האישור יש להעביר לאחראית חדר הכושר. שימו לב שהוא תקף רק 3 חודשים מיום ההנפקה.";
    if (status === ST_REVIEW) return "הבקשה התקבלה וממתינה לאישור מנהל/ת המכון. נעדכן אותך במייל.";
    if (status === ST_PAYMENT) return "ההרשמה אושרה. כדי להפעיל את המנוי יש להסדיר את התשלום מול הוועד.";
    if (status === ST_VERIFY) return "התשלום דווח וממתין לאימות הוועד.";
    if (status === ST_ACTIVE) return "המנוי שלך פעיל.";
    if (status === ST_EXPIRED) return "המנוי הסתיים. אפשר לחדש אותו.";
    return "";
  }

  /* ------------------------------------------------------------------ *
   *  טעינה
   * ------------------------------------------------------------------ */
  function load(container, cb) {
    if (!(CBA.data && CBA.data.getGymMy)) { if (cb) cb(); return; }
    st.loading = true;
    CBA.data.getGymMy(function (my) {
      st.my = my && my.ok ? my : { ok: false, error: (my && my.error) || "לא ניתן לטעון" };
      CBA.data.getGymForm(function (form) {
        st.form = form && form.ok ? form : { ok: false, error: (form && form.error) || "לא ניתן לטעון" };
        st.loading = false;
        if (cb) cb();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  תצוגות
   * ------------------------------------------------------------------ */
  function planLine(plan) {
    if (!plan) return "";
    return esc(plan.name) + " · " + plan.months + " חודשים · " +
           "<strong>" + plan.total + " ₪</strong> " +
           '<span class="gym-muted">(' + plan.monthlyPrice + " ₪ לחודש)</span>";
  }

  function viewNoMembership() {
    var plans = (st.form && st.form.plans) || [];
    var plan = plans[0];
    return '' +
      '<div class="card gym-card">' +
        '<div class="gym-hero__title">מכון הכושר של השיכון</div>' +
        '<div class="gym-hero__sub">ההרשמה נעשית כאן, באפליקציה — פרטים, תקנון, הצהרת בריאות וחתימה. ' +
          'לוקח כמה דקות, ואין יותר צורך בטפסים חיצוניים.</div>' +
        (plan ? '<div class="gym-plan">' + planLine(plan) + "</div>" :
                '<div class="gym-note">עדיין לא הוגדר מסלול מנוי. יש לפנות לאחראית חדר הכושר.</div>') +
        (plan ? '<button type="button" class="btn-primary gym-cta" data-gym-start>התחלת הרשמה</button>' : "") +
      "</div>";
  }

  function viewStatus(m) {
    var status = m["סטטוס"] || "";
    var flagged = m["שאלות שנענו בכן"] || "";
    var html = '' +
      '<div class="card gym-card">' +
        '<div class="gym-status__head">' +
          '<div class="gym-status__title">המנוי שלי</div>' + pill(status, toneFor(status)) +
        "</div>" +
        '<div class="gym-status__msg">' + esc(nextStepText(status)) + "</div>";

    if (m["מסלול"]) {
      html += '<div class="gym-kv"><span>מסלול</span><span>' + esc(m["מסלול"]) +
              (m["מחיר מוסכם"] ? " · " + esc(m["מחיר מוסכם"]) + " ₪" : "") + "</span></div>";
    }
    if (m["בתוקף עד"]) {
      html += '<div class="gym-kv"><span>בתוקף עד</span><span>' + esc(fmtDate(m["בתוקף עד"])) + "</span></div>";
    }
    if (status === ST_DOCTOR && flagged) {
      html += '<div class="gym-kv"><span>שאלות שסומנו</span><span>' + esc(flagged) + "</span></div>";
    }
    if (m["תאריך חתימה"]) {
      html += '<div class="gym-kv"><span>הצהרת בריאות</span><span>נחתמה ב-' + esc(fmtDate(m["תאריך חתימה"])) + "</span></div>";
    }

    if (status === ST_DECLARATION) {
      html += '<button type="button" class="btn-primary gym-cta" data-gym-start>מילוי הצהרת בריאות</button>';
    }
    if (status === ST_ACTIVE) html += activeCardHTML(m);

    if (status === ST_EXPIRED) {
      // חידוש בלחיצה אחת אם ההצהרה עדיין בתוקף; אחרת — טופס מלא מחדש.
      html += declStillValid()
        ? '<button type="button" class="btn-primary gym-cta" data-gym-renew>חידוש מנוי</button>' +
          '<div class="gym-hint gym-hint--tight">הצהרת הבריאות שלך בתוקף עד ' +
            esc(fmtDate(st.my.declarationValidUntil)) + ', אז אין צורך למלא אותה מחדש.</div>'
        : '<button type="button" class="btn-primary gym-cta" data-gym-start>חידוש מנוי</button>' +
          '<div class="gym-hint gym-hint--tight">עברו יותר משנתיים מאז החתימה, ולכן יש למלא הצהרת בריאות חדשה.</div>';
    }
    if (status === ST_PAYMENT) {
      var amount = m["מחיר מוסכם"] || "";
      var paybox = (st.my && st.my.payboxUrl) || "";
      html += '<div class="gym-pay">' +
                '<div class="gym-pay__amount">' + esc(amount) + " ₪</div>" +
                '<div class="gym-pay__sub">לתשלום עבור ' + esc(m["מסלול"] || "המנוי") + "</div>" +
                (paybox
                  ? '<a class="btn-primary gym-pay__btn" href="' + esc(paybox) +
                    '" target="_blank" rel="noopener">מעבר לתשלום בפייבוקס</a>'
                  : '<div class="gym-note">קישור התשלום עדיין לא הוגדר. אפשר להסדיר מול אחראית חדר הכושר.</div>') +
                '<button type="button" class="btn-ghost gym-pay__report" data-gym-pay>שילמתי — לדיווח</button>' +
              "</div>";
    }
    if (status === ST_VERIFY) {
      html += '<div class="gym-kv"><span>דווח</span><span>' +
              esc(m["אמצעי תשלום"] || "") +
              (m["אסמכתא"] ? " · אסמכתא " + esc(m["אסמכתא"]) : "") +
              (m["דווח בתאריך"] ? " · " + esc(m["דווח בתאריך"]) : "") + "</span></div>";
    }
    html += "</div>";
    return html;
  }

  /* ------------------------------------------------------------------ *
   *  כרטיס המנוי הפעיל
   *  זה המסך שהתושב יפתח הכי הרבה פעמים — בדרך למכון, כדי לראות את הקוד.
   *  לכן הקוד גדול, ברור מרחוק, ועם כפתור העתקה. כל השאר משני לו.
   * ------------------------------------------------------------------ */
  function fmtDate(iso) {
    if (!iso) return "";
    var p = String(iso).split("-");
    return p.length === 3 ? (p[2] + "." + p[1] + "." + p[0]) : String(iso);
  }

  function daysLeft(until) {
    if (!until) return null;
    var d = new Date(String(until) + "T00:00:00");
    if (isNaN(d.getTime())) return null;
    return Math.ceil((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
  }

  function declStillValid() {
    var dv = st.my && st.my.declarationValidUntil;
    if (!dv) return false;
    var d = new Date(String(dv) + "T00:00:00");
    return !isNaN(d.getTime()) && d.getTime() >= new Date().setHours(0, 0, 0, 0);
  }

  function activeCardHTML(m) {
    var code = (st.my && st.my.entryCode) || "";
    var hasCode = !!(st.my && st.my.hasEntryCode);
    var left = daysLeft(m["בתוקף עד"]);
    var renewDays = (st.my && st.my.renewDaysBefore) || 14;

    var html = "";

    // מד תוקף — עדין, בלי לצעוק. הופך לכתום כשמתקרב הסוף.
    if (left !== null) {
      var total = 180;
      var pct = Math.max(0, Math.min(100, Math.round((left / total) * 100)));
      var tone = left <= 7 ? "danger" : (left <= 30 ? "warn" : "ok");
      html += '<div class="gym-meter">' +
                '<div class="gym-meter__bar"><span class="gym-meter__fill gym-meter__fill--' + tone +
                  '" style="width:' + pct + '%"></span></div>' +
                '<div class="gym-meter__label">' +
                  (left > 0 ? "נשארו " + left + " ימים" : "המנוי מסתיים היום") + "</div>" +
              "</div>";
    }

    // קוד הכניסה
    if (code) {
      html += '<div class="gym-code">' +
                '<div class="gym-code__label">קוד הכניסה למכון</div>' +
                '<div class="gym-code__value" id="gym-code-value">' + esc(code) + "</div>" +
                '<button type="button" class="btn-ghost" data-gym-copy>העתקת הקוד</button>' +
                '<div class="gym-code__note">לפי התקנון — אין להעביר את הקוד לאחרים.</div>' +
              "</div>";
    } else if (!hasCode) {
      html += '<div class="gym-code gym-code--none">' +
                "<div>הכניסה למכון עדיין באמצעות מפתח.</div>" +
                '<div class="gym-code__note">לקבלת מפתח יש לפנות לאחראית חדר הכושר בשיכון.</div>' +
              "</div>";
    }

    if (left !== null && left <= renewDays) {
      html += '<button type="button" class="btn-primary gym-cta" data-gym-renew>חידוש המנוי</button>';
    }
    return html;
  }

  function copyCode(btn) {
    var el = document.getElementById("gym-code-value");
    if (!el) return;
    var txt = el.textContent.trim();
    function done() { btn.textContent = "הועתק ✓"; setTimeout(function () { btn.textContent = "העתקת הקוד"; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { CBA.ui.alert("קוד הכניסה: " + txt); });
    } else {
      CBA.ui.alert("קוד הכניסה: " + txt);
    }
  }

  /* חידוש — כשההצהרה עדיין בתוקף זה באמת שתי לחיצות. אם השרת מחזיר
     needsDeclaration, נופלים חזרה לאשף המלא במקום להיתקע. */
  function doRenew(container, btn) {
    var plans = (st.my && st.my.plans) || [];
    var plan = plans[0];
    if (!plan) { CBA.ui.alert("לא הוגדר מסלול מנוי."); return; }
    CBA.ui.confirm("לחדש את המנוי?\n\n" + plan.name + " · " + plan.total + " ₪\n" +
                   "אחרי החידוש נעביר אותך למסך התשלום.",
                   { title: "חידוש מנוי", okText: "חידוש" })
      .then(function (ok) {
        if (!ok) return;
        var release = CBA.ui.busy(btn, "מחדש…");
        CBA.data.renewGymMembership({ planId: plan.id }, function (res) {
          release();
          if (!res || !res.ok) {
            if (res && res.needsDeclaration) {
              CBA.ui.alert(res.error).then(function () { openWizard(container); });
              return;
            }
            CBA.ui.alert((res && res.error) || "החידוש נכשל.");
            return;
          }
          CBA.ui.toast("המנוי חודש — נשאר להסדיר את התשלום");
          load(container, function () { draw(container); });
        });
      });
  }

  /* ------------------------------------------------------------------ *
   *  האשף
   * ------------------------------------------------------------------ */
  function openWizard(container) {
    var f = st.form || {};
    if (!f.ok) { CBA.ui.alert(f.error || "לא ניתן לטעון את טופס ההרשמה כרגע."); return; }
    var m = (st.my && st.my.membership) || null;
    var isCompletion = !!(m && (m["סטטוס"] || "") === ST_DECLARATION);
    var pre = f.prefill || {};

    st.wizard = {
      step: 1,
      isCompletion: isCompletion,
      // כשמנהל כבר קבע מסלול — אין שלב בחירה, ולכן גם צעד אחד פחות באשף
      steps: isCompletion ? ["פרטים", "תקנון", "הצהרת בריאות", "חתימה"]
                          : ["פרטים", "תקנון", "הצהרת בריאות", "חתימה"],
      data: {
        planId: (f.plans && f.plans[0] && f.plans[0].id) || "",
        firstName: (m && m["שם פרטי"]) || pre.firstName || "",
        lastName: (m && m["שם משפחה"]) || pre.lastName || "",
        house: (m && m["מספר בית"]) || pre.house || "",
        phone: (m && m["טלפון"]) || "",
        idNumber: (m && m["ת.ז."]) || pre.idNumber || "",
        birthDate: (m && m["תאריך לידה"]) || "",
        answers: {},
        ruleAcks: {},
        signature: ""
      }
    };
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymWizard", false);
    renderWizard(container);
  }

  function closeWizard(container) {
    st.wizard = null;
    if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymWizard");
    var el = document.getElementById("gym-wizard");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    draw(container);
  }

  function wizardStepHTML() {
    var w = st.wizard, f = st.form, d = w.data;
    var minAge = f.minAge || 18;

    if (w.step === 1) {
      var plan = (f.plans || [])[0];
      return '' +
        (w.isCompletion
          ? '<div class="gym-note">מנהל/ת המכון כבר פתח/ה עבורך מנוי' +
            (plan ? " (" + esc(plan.name) + ")" : "") + ". נשאר רק להשלים את ההצהרה.</div>"
          : (plan ? '<div class="gym-plan gym-plan--sm">' + planLine(plan) + "</div>" : "")) +
        '<div class="gym-field"><label>שם פרטי</label>' +
          '<input type="text" data-gf="firstName" value="' + esc(d.firstName) + '"></div>' +
        '<div class="gym-field"><label>שם משפחה</label>' +
          '<input type="text" data-gf="lastName" value="' + esc(d.lastName) + '"></div>' +
        '<div class="gym-field"><label>מספר בית</label>' +
          '<input type="text" data-gf="house" value="' + esc(d.house) + '"></div>' +
        '<div class="gym-field"><label>טלפון</label>' +
          '<input type="tel" data-gf="phone" value="' + esc(d.phone) + '"></div>' +
        '<div class="gym-field"><label>תעודת זהות</label>' +
          '<input type="text" inputmode="numeric" data-gf="idNumber" value="' + esc(d.idNumber) + '"></div>' +
        '<div class="gym-field"><label>תאריך לידה</label>' +
          '<input type="date" data-gf="birthDate" value="' + esc(d.birthDate) + '"></div>' +
        '<div class="gym-hint">הכניסה למכון מגיל ' + minAge + ' ומעלה, לפי תקנון המכון.</div>';
    }

    if (w.step === 2) {
      return (f.rules || []).map(function (r) {
        var acked = !!d.ruleAcks[r.id];
        var lines = String(r.text || "").split("\n").filter(function (x) { return x.trim(); });
        return '<div class="gym-rule">' +
                 '<div class="gym-rule__title">' + esc(r.title) + "</div>" +
                 "<ul>" + lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" +
                 '<label class="gym-check-line">' +
                   '<input type="checkbox" data-gr="' + esc(r.id) + '"' + (acked ? " checked" : "") + "> קראתי" +
                 "</label>" +
               "</div>";
      }).join("");
    }

    if (w.step === 3) {
      return '<div class="gym-hint">מענה "כן" על אחת השאלות מחייב תעודה רפואית מרופא לפני הכניסה למכון — ' +
             "כך גם בטופס שהיה בשימוש עד היום.</div>" +
             (f.questions || []).map(function (q) {
               var val = d.answers[q.id] || "";
               return '<div class="gym-q">' +
                        '<div class="gym-q__text">' + esc(q.text) + "</div>" +
                        '<div class="gym-seg" data-gq="' + esc(q.id) + '">' +
                          '<button type="button" data-val="לא"' + (val === "לא" ? ' class="is-on"' : "") + ">לא</button>" +
                          '<button type="button" data-val="כן"' + (val === "כן" ? ' class="is-on"' : "") + ">כן</button>" +
                        "</div>" +
                      "</div>";
             }).join("");
    }

    // שלב 4 — הצהרה וחתימה
    return '' +
      '<div class="gym-declare">' +
        "אני, החתום/ה על טופס זה, מצהיר/ה כי קראתי והבנתי את כל השאלון הרפואי שבטופס זה ומילאתי אותו בעצמי. " +
        "אני מצהיר/ה כי מסרתי ידיעות מלאות ונכונות אודות מצבי הרפואי בעבר ובהווה לפי השאלות שנשאלתי בשאלון האמור. " +
        "ידוע לי כי לאחר שנתיים מיום חתימתי על הצהרת בריאות זו, אדרש להמציא הצהרת בריאות חדשה. " +
        "כמו כן, בכל מקרה של שינוי במצבי הרפואי, עליי להתייעץ עם רופא לגבי המשך פעילות במכון הכושר." +
      "</div>" +
      '<div class="gym-sig">' +
        '<div class="gym-sig__label">חתימה (אפשר באצבע או בעכבר)</div>' +
        '<canvas id="gym-sig-canvas" class="gym-sig__canvas"></canvas>' +
        '<button type="button" class="btn-ghost gym-sig__clear" data-gym-clear-sig>ניקוי</button>' +
      "</div>";
  }

  function renderWizard(container) {
    var w = st.wizard;
    var el = document.getElementById("gym-wizard");
    if (!el) {
      el = document.createElement("div");
      el.id = "gym-wizard";
      el.className = "gym-wiz";
      document.body.appendChild(el);
    }
    var last = w.step === 4;
    el.innerHTML =
      '<div class="gym-wiz__backdrop" data-gym-close></div>' +
      '<aside class="gym-wiz__panel" role="dialog" aria-label="הרשמה למכון כושר">' +
        '<div class="gym-wiz__head">' +
          '<div class="gym-wiz__title">' + esc(w.steps[w.step - 1]) + "</div>" +
          '<div class="gym-wiz__count">שלב ' + w.step + " מתוך 4</div>" +
          '<button type="button" class="gym-wiz__x" data-gym-close aria-label="סגירה">×</button>' +
        "</div>" +
        '<div class="gym-wiz__bar">' + [1, 2, 3, 4].map(function (i) {
          return '<span class="' + (i <= w.step ? "is-on" : "") + '"></span>';
        }).join("") + "</div>" +
        '<div class="gym-wiz__body">' + wizardStepHTML() + "</div>" +
        '<div class="gym-wiz__foot">' +
          (w.step > 1 ? '<button type="button" class="btn-ghost" data-gym-back>חזרה</button>' : "<span></span>") +
          '<button type="button" class="btn-primary" data-gym-next>' +
            (last ? "שליחת הבקשה" : "המשך") + "</button>" +
        "</div>" +
      "</aside>";

    bindWizard(container, el);
    if (w.step === 4) initSignature(el);
  }

  /* קנבס חתימה. Pointer Events מכסה עכבר ומגע באותו קוד, וזה גם מה שנותן
     קו חלק בטלפון. הרזולוציה מוכפלת ב-devicePixelRatio כדי שהחתימה לא תיראה
     מרוחה במסכי רטינה. */
  function initSignature(el) {
    var canvas = el.querySelector("#gym-sig-canvas");
    if (!canvas) return;
    var ratio = window.devicePixelRatio || 1;
    var rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    var ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";

    // שחזור חתימה קיימת אם חוזרים לשלב הזה
    if (st.wizard.data.signature) {
      var img = new Image();
      img.onload = function () { ctx.drawImage(img, 0, 0, rect.width, rect.height); };
      img.src = st.wizard.data.signature;
    }

    var drawing = false;
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    canvas.addEventListener("pointerdown", function (e) {
      drawing = true;
      canvas.setPointerCapture(e.pointerId);
      var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
      e.preventDefault();
    });
    function end() {
      if (!drawing) return;
      drawing = false;
      st.wizard.data.signature = canvas.toDataURL("image/png");
    }
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointerleave", end);
    canvas.addEventListener("pointercancel", end);
  }

  function bindWizard(container, el) {
    var w = st.wizard, d = w.data;

    el.querySelectorAll("[data-gym-close]").forEach(function (n) {
      n.addEventListener("click", function () {
        CBA.ui.confirm("לסגור את הטופס? מה שמילאת לא יישמר.",
                       { title: "סגירת הטופס", okText: "סגירה", danger: true })
          .then(function (ok) { if (ok) closeWizard(container); });
      });
    });
    el.querySelectorAll("[data-gf]").forEach(function (n) {
      n.addEventListener("input", function () { d[n.dataset.gf] = n.value; });
    });
    el.querySelectorAll("[data-gr]").forEach(function (n) {
      n.addEventListener("change", function () { d.ruleAcks[n.dataset.gr] = n.checked; });
    });
    el.querySelectorAll("[data-gq] button").forEach(function (n) {
      n.addEventListener("click", function () {
        var group = n.parentNode;
        d.answers[group.dataset.gq] = n.dataset.val;
        group.querySelectorAll("button").forEach(function (b) { b.classList.remove("is-on"); });
        n.classList.add("is-on");
      });
    });
    var clear = el.querySelector("[data-gym-clear-sig]");
    if (clear) clear.addEventListener("click", function () {
      var c = el.querySelector("#gym-sig-canvas");
      if (c) c.getContext("2d").clearRect(0, 0, c.width, c.height);
      d.signature = "";
    });
    var back = el.querySelector("[data-gym-back]");
    if (back) back.addEventListener("click", function () { w.step--; renderWizard(container); });
    el.querySelector("[data-gym-next]").addEventListener("click", function () {
      if (!validateStep()) return;
      if (w.step < 4) { w.step++; renderWizard(container); return; }
      submit(container, el);
    });
  }

  /* ולידציה בצד הלקוח היא נוחות בלבד — השרת בודק את אותם דברים שוב.
     המטרה כאן היא להגיד לתושב מה חסר *לפני* שהוא שולח, לא לאכוף. */
  function validateStep() {
    var w = st.wizard, d = w.data, f = st.form;
    if (w.step === 1) {
      if (!d.firstName.trim() || !d.lastName.trim()) { CBA.ui.alert("צריך למלא שם פרטי ושם משפחה."); return false; }
      if (!d.phone.trim()) { CBA.ui.alert("צריך למלא טלפון."); return false; }
      if (!d.idNumber.trim()) { CBA.ui.alert("צריך למלא תעודת זהות."); return false; }
      if (!d.birthDate) { CBA.ui.alert("צריך למלא תאריך לידה."); return false; }
      var age = ageFrom(d.birthDate), minAge = f.minAge || 18;
      if (age < minAge) {
        CBA.ui.alert("ההרשמה העצמאית אפשרית מגיל " + minAge +
          ". מתחת לגיל זה יש לפנות לאחראית חדר הכושר.");
        return false;
      }
      return true;
    }
    if (w.step === 2) {
      var missing = (f.rules || []).filter(function (r) { return !d.ruleAcks[r.id]; });
      if (missing.length) { CBA.ui.alert("צריך לאשר קריאה של כל מקטעי התקנון."); return false; }
      return true;
    }
    if (w.step === 3) {
      var un = (f.questions || []).filter(function (q) { return !d.answers[q.id]; });
      if (un.length) { CBA.ui.alert("צריך לענות על כל השאלות. נשארו " + un.length + "."); return false; }
      return true;
    }
    if (!d.signature) { CBA.ui.alert("צריך לחתום לפני השליחה."); return false; }
    return true;
  }

  function ageFrom(dateStr) {
    var b = new Date(dateStr + "T00:00:00");
    if (isNaN(b.getTime())) return -1;
    var n = new Date(), a = n.getFullYear() - b.getFullYear(), m = n.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && n.getDate() < b.getDate())) a--;
    return a;
  }

  /* השליחה לוקחת כמה שניות: יש כאן תמונת חתימה שנשמרת בדרייב, כתיבה לגיליון,
     ושליחת מיילים. בגרסה הראשונה הכפתור פשוט אמר "שולח…" בלי לזוז, וזה נראה
     תקוע — עד כדי כך שהמשתמש הראשון בייצור חשב שכלום לא קרה (הבקשה דווקא
     נשמרה). לכן: אחוז התקדמות אמיתי בזמן ההעלאה, ואז "מעבד…" בזמן שהשרת עובד. */
  function submit(container, el) {
    var btn = el.querySelector("[data-gym-next]");
    // (2026-08-20) קודם זה היה disabled + החלפת טקסט, ויועד דיווח שזה לא מספיק
    // בולט. עכשיו ספינר על הכפתור עצמו + טקסט שמתעדכן לפי אחוזי ההעלאה, וגם
    // חיווי "שולח בקשה…" בכותרת (מגיע אוטומטית מ-postReadProgress ב-sheets.js).
    var release = CBA.ui.busy(btn, "שולח…");
    var note = el.querySelector(".gym-wiz__foot");
    var prog = document.createElement("div");
    prog.className = "gym-progress";
    prog.textContent = "מעלה את הטופס…";
    if (note) note.insertBefore(prog, note.firstChild);

    CBA.data.submitGymApplication(st.wizard.data, function (res) {
      if (prog.parentNode) prog.parentNode.removeChild(prog);
      release();
      if (!res || !res.ok) {
        CBA.ui.alert((res && res.error) || "השליחה נכשלה, נסו שוב.");
        return;
      }
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymWizard");
      st.wizard = null;
      if (el.parentNode) el.parentNode.removeChild(el);
      CBA.ui.alert(res.flagged && res.flagged.length
        ? "הבקשה נשלחה. מכיוון שסימנת “כן” באחת השאלות, נדרשת תעודה רפואית — שלחנו לך מייל עם הפרטים."
        : "הבקשה נשלחה בהצלחה. שלחנו לך מייל אישור.");
      load(container, function () { draw(container); });
    }, function (pct) {
      // pct מגיע מ-XMLHttpRequest ומשקף העלאה אמיתית. כשהוא מגיע ל-100
      // הכדור עובר לשרת, ושם עוד נשארות כמה שניות — ולכן הטקסט משתנה.
      prog.textContent = pct < 100 ? ("מעלה את הטופס… " + pct + "%")
                                   : "הבקשה נשלחה, מעבד בשרת…";
      CBA.ui.busyText(btn, pct < 100 ? ("שולח… " + pct + "%") : "מעבד בשרת…");
    });
  }

  /* ------------------------------------------------------------------ *
   *  ציור
   * ------------------------------------------------------------------ */
  function draw(container) {
    var head =
      '<div class="screen-head">' +
        '<div class="screen-head__title">מכון כושר</div>' +
        '<div class="screen-head__sub">הרשמה, הצהרת בריאות ומצב המנוי</div>' +
      "</div>";

    if (st.loading || !st.my) {
      container.innerHTML = head +
        '<div class="card gym-card"><div class="club-loading"><div class="rs-spin"></div>טוען…</div></div>';
      return;
    }
    if (!st.my.ok) {
      container.innerHTML = head +
        '<div class="card gym-card"><div class="club-empty">' + esc(st.my.error) + "</div></div>";
      return;
    }

    var m = st.my.membership;
    container.innerHTML = head + (m ? viewStatus(m) : viewNoMembership());

    var startBtn = container.querySelector("[data-gym-start]");
    if (startBtn) startBtn.addEventListener("click", function () { openWizard(container); });
    var payBtn = container.querySelector("[data-gym-pay]");
    if (payBtn) payBtn.addEventListener("click", function () { openPayReport(container); });
    var renewBtn = container.querySelector("[data-gym-renew]");
    if (renewBtn) renewBtn.addEventListener("click", function () { doRenew(container, renewBtn); });
    var copyBtn = container.querySelector("[data-gym-copy]");
    if (copyBtn) copyBtn.addEventListener("click", function () { copyCode(copyBtn); });
  }

  /* ------------------------------------------------------------------ *
   *  דיווח תשלום
   *  התושב כבר פתח את פייבוקס ושילם; הצילום נמצא אצלו בטלפון ממילא. לכן
   *  ההעלאה שלו לא מוסיפה עבודה — ובתמורה Gemini ממלא ארבעה שדות במקומו,
   *  והמנהל/ת מקבל/ת גם מספרים מסודרים וגם את התמונה עצמה לאימות.
   *  הפלט תמיד ניתן לעריכה ולעולם לא נשמר אוטומטית.
   * ------------------------------------------------------------------ */
  function openPayReport(container) {
    var m = (st.my && st.my.membership) || {};
    var data = {
      amount: m["מחיר מוסכם"] || "", date: "", reference: "", method: "פייבוקס",
      dataBase64: "", mimeType: ""
    };
    var el = document.createElement("div");
    el.id = "gym-pay-report";
    el.className = "gym-wiz";
    el.innerHTML =
      '<div class="gym-wiz__backdrop" data-gp-close></div>' +
      '<aside class="gym-wiz__panel" role="dialog" aria-label="דיווח תשלום">' +
        '<div class="gym-wiz__head">' +
          '<div class="gym-wiz__title">דיווח על תשלום</div>' +
          '<button type="button" class="gym-wiz__x" data-gp-close aria-label="סגירה">×</button>' +
        "</div>" +
        '<div class="gym-wiz__body">' +
          '<div class="gym-hint">אפשר לצרף צילום מסך של אישור התשלום — נמלא ממנו את הפרטים ' +
            "אוטומטית, ותמיד אפשר לתקן אותם. הצילום גם עוזר לוועד לאמת מהר יותר.</div>" +
          '<div class="gym-field"><label>צילום אישור התשלום (לא חובה)</label>' +
            '<input type="file" accept="image/*" data-gp-file></div>' +
          '<div id="gp-scan" class="gym-scan" style="display:none"></div>' +
          '<div class="gym-field"><label>סכום ששולם (₪)</label>' +
            '<input type="number" inputmode="decimal" data-gp="amount" value="' + esc(data.amount) + '"></div>' +
          '<div class="gym-field"><label>תאריך התשלום</label>' +
            '<input type="date" data-gp="date"></div>' +
          '<div class="gym-field"><label>אמצעי תשלום</label>' +
            '<input type="text" data-gp="method" value="פייבוקס"></div>' +
          '<div class="gym-field"><label>אסמכתא / 4 ספרות אחרונות (לא חובה)</label>' +
            '<input type="text" data-gp="reference"></div>' +
        "</div>" +
        '<div class="gym-wiz__foot">' +
          '<button type="button" class="btn-ghost" data-gp-close>ביטול</button>' +
          '<button type="button" class="btn-primary" data-gp-send>שליחת הדיווח</button>' +
        "</div>" +
      "</aside>";
    document.body.appendChild(el);
    if (CBA.sheets && CBA.sheets.markDirty) CBA.sheets.markDirty("gymPayReport", false);

    function close() {
      if (CBA.sheets && CBA.sheets.clearDirty) CBA.sheets.clearDirty("gymPayReport");
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    el.querySelectorAll("[data-gp-close]").forEach(function (n) { n.addEventListener("click", close); });
    el.querySelectorAll("[data-gp]").forEach(function (n) {
      n.addEventListener("input", function () { data[n.dataset.gp] = n.value; });
    });

    var scanBox = el.querySelector("#gp-scan");
    el.querySelector("[data-gp-file]").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { CBA.ui.alert("הקובץ גדול מדי (מעל 8MB)."); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var b64 = String(reader.result).split(",")[1] || "";
        data.dataBase64 = b64;
        data.mimeType = file.type || "image/jpeg";
        scanBox.style.display = "";
        scanBox.innerHTML = '<div class="club-loading"><div class="rs-spin"></div>קורא את הצילום…</div>';
        CBA.data.scanGymPayment(b64, data.mimeType, function (res) {
          if (!res || !res.ok) {
            scanBox.innerHTML = '<div class="gym-scan__err">לא הצלחנו לקרוא את הצילום. אפשר למלא ידנית.</div>';
            return;
          }
          var f = res.fields || {};
          if (f.amount)    { data.amount = f.amount;       el.querySelector('[data-gp="amount"]').value = f.amount; }
          if (f.date)      { data.date = f.date;           el.querySelector('[data-gp="date"]').value = f.date; }
          if (f.reference) { data.reference = f.reference; el.querySelector('[data-gp="reference"]').value = f.reference; }
          if (f.method)    { data.method = f.method;       el.querySelector('[data-gp="method"]').value = f.method; }
          var expected = Number(m["מחיר מוסכם"] || 0);
          var got = Number(f.amount || 0);
          scanBox.innerHTML = '<div class="gym-scan__ok">מילאנו את הפרטים מהצילום — כדאי לוודא שהם נכונים.</div>' +
            (expected && got && Math.abs(expected - got) > 0.5
              ? '<div class="gym-scan__warn">הסכום שזוהה (' + got + " ₪) שונה מהמחיר המוסכם (" +
                expected + " ₪) — לבדוק?</div>"
              : "");
        });
      };
      reader.readAsDataURL(file);
    });

    el.querySelector("[data-gp-send]").addEventListener("click", function () {
      if (!Number(data.amount)) { CBA.ui.alert("צריך למלא את הסכום ששולם."); return; }
      var btn = el.querySelector("[data-gp-send]");
      var release = CBA.ui.busy(btn, "שולח דיווח…");
      CBA.data.reportGymPayment(data, function (res) {
        release();
        if (!res || !res.ok) {
          CBA.ui.alert((res && res.error) || "הדיווח נכשל, נסו שוב.");
          return;
        }
        close();
        CBA.ui.alert("הדיווח נשלח. הוועד יאמת את התשלום ונעדכן אותך במייל כשהמנוי יופעל.", "הדיווח נשלח");
        load(container, function () { draw(container); });
      }, function (pct) {
        CBA.ui.busyText(btn, pct < 100 ? ("שולח… " + pct + "%") : "מעבד בשרת…");
      });
    });
  }

  CBA.screens.resGym = {
    title: "מכון כושר",
    render: function (container) {
      // אשף פתוח? לא מציירים מחדש — זה בדיוק המצב שבו ריענון רקע היה מוחק מילוי.
      if (st.wizard) return;
      draw(container);
      load(container, function () { if (!st.wizard) draw(container); });
    }
  };
})();
