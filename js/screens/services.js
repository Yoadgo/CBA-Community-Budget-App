/* מסך "שירותים" באזור התושב (2026-08-18).
   מציג את כרטיסי השירות שבטאב "שירותים לתושב" בגיליון — גז, אינטרנט, תקלות
   בינוי וכו' — וכל כרטיס נפתח ל-drawer עם כל הפרטים: תנאי שירות, מחירון,
   אנשי קשר עם כפתורי חיוג. פתוח לכל תושב מחובר; העריכה נמצאת במסך נפרד
   באזור הניהול (servicesAdmin, מנהל-על בלבד) — בדיוק כמו resCommittee מול
   committeeAdmin.

   CBA.serviceUtils (למטה) הוא הלוגיקה המשותפת בין המסך הזה למסך הניהול:
   פענוח פורמט התוכן וציור הסעיפים. חי כאן ולא בכל מסך בנפרד כדי ששני
   הצדדים יציירו את אותו סעיף אותו דבר בדיוק, ולא ייסחפו זה מזה עם הזמן
   (אותו שיקול כמו CBA.committee ב-dataService.js). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

/* ============================================================================
 *  לוגיקה משותפת — פענוח מבנה הנתונים וציור סעיפים
 * ----------------------------------------------------------------------------
 *  התוכן נשמר בגיליון בפורמט קריא-לעין ולא כ-JSON בתא (החלטה מודעת: אם משהו
 *  יישבר באפליקציה, אפשר עדיין לקרוא ולערוך הכול ידנית בגוגל-שיטס). הפורמט
 *  לכל "סוג" מתועד ליד parseSection למטה.
 * ========================================================================== */
CBA.serviceUtils = (function () {
  "use strict";

  var TYPES = ["טקסט", "רשימה", "טבלה", "אנשי קשר", "הדגשה"];

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  /* ממזג את שני הטאבים לרשימת אובייקטים נוחה: כל שירות עם מערך הסעיפים שלו
     כבר בתוכו, ממוין לפי "סדר". השרת מחזיר שתי טבלאות שטוחות — כל המסכים
     עובדים על התוצאה של הפונקציה הזאת, אף אחד לא נוגע בשורות הגולמיות. */
  function build(serviceRows, sectionRows) {
    var byId = {};
    var out = (serviceRows || []).map(function (r) {
      var svc = {
        id: String(r["מזהה שירות"] || "").trim(),
        name: String(r["שם"] || "").trim(),
        desc: String(r["תיאור קצר"] || "").trim(),
        icon: String(r["אייקון"] || "").trim(),
        provider: String(r["ספק"] || "").trim(),
        phone: String(r["טלפון ראשי"] || "").trim(),
        doc: String(r["קישור למסמך"] || "").trim(),
        order: Number(r["סדר"] || 0) || 0,
        active: String(r["פעיל"] == null ? "כן" : r["פעיל"]).trim() !== "לא",
        updated: String(r["עודכן"] || "").trim(),
        updatedBy: String(r['עודכן ע"י'] || "").trim(),
        sections: []
      };
      byId[svc.id] = svc;
      return svc;
    });

    (sectionRows || []).forEach(function (r) {
      var ownerId = String(r["מזהה שירות"] || "").trim();
      var svc = byId[ownerId];
      // סעיף יתום (שירות שנמחק והסעיף נשאר) — מדלגים בשקט במקום להתרסק.
      // saveServices_ בשרת כבר דוחה מצב כזה, אז זה קורה רק אם מישהו ערך
      // את הגיליון ידנית.
      if (!svc) return;
      svc.sections.push({
        secId: String(r["מזהה סעיף"] || "").trim(),
        order: Number(r["סדר"] || 0) || 0,
        type: String(r["סוג"] || "").trim(),
        title: String(r["כותרת"] || "").trim(),
        content: String(r["תוכן"] || "")
      });
    });

    out.forEach(function (s) {
      s.sections.sort(function (a, b) { return a.order - b.order; });
    });
    out.sort(function (a, b) { return a.order - b.order; });
    return out;
  }

  /* הדרך ההפוכה — מהמבנה הנוח בחזרה לשתי טבלאות שטוחות לשמירה בשרת.
     "סדר" נכתב מחדש לפי המיקום בפועל במערך, כך שגרירה במסך הניהול היא
     מקור האמת היחיד (השרת עושה את אותו הדבר לכרטיסים, ר' saveServices_). */
  function flatten(services) {
    var svcRows = [], secRows = [];
    (services || []).forEach(function (s, i) {
      svcRows.push({
        "מזהה שירות": s.id, "שם": s.name, "תיאור קצר": s.desc,
        "אייקון": s.icon, "ספק": s.provider, "טלפון ראשי": s.phone,
        "קישור למסמך": s.doc, "סדר": i + 1, "פעיל": s.active ? "כן" : "לא",
        "עודכן": s.updated || "", 'עודכן ע"י': s.updatedBy || ""
      });
      (s.sections || []).forEach(function (sec, j) {
        secRows.push({
          "מזהה שירות": s.id,
          "מזהה סעיף": sec.secId || (s.id + "_s" + (j + 1)),
          "סדר": j + 1, "סוג": sec.type,
          "כותרת": sec.title, "תוכן": sec.content
        });
      });
    });
    return { services: svcRows, sections: secRows };
  }

  /* פענוח "תוכן" לפי סוג — פונקציות טהורות, בלי DOM, כדי שגם עורך הסעיפים
     במסך הניהול ישתמש בהן ולא יפרש את הפורמט בעצמו:
       טקסט/הדגשה — טקסט חופשי; שורה ריקה כפולה = פסקה חדשה
       רשימה      — שורה = בולט
       טבלה       — תאים מופרדים ב-"|", שורה ראשונה = כותרות
       אנשי קשר   — שורה = "שם|תפקיד|טלפון" */
  function toLines(content) {
    return String(content || "").split("\n").filter(function (l) { return l.trim() !== ""; });
  }
  function toGrid(content) {
    return String(content || "").split("\n")
      .filter(function (l) { return l.trim() !== ""; })
      .map(function (r) { return r.split("|").map(function (c) { return c.trim(); }); });
  }
  function toContacts(content) {
    return toLines(content).map(function (l) {
      var p = l.split("|");
      return { name: (p[0] || "").trim(), role: (p[1] || "").trim(), phone: (p[2] || "").trim() };
    });
  }

  /* מנקה מספר טלפון לשימוש ב-tel:/wa.me — מסיר מקפים, רווחים וסוגריים.
     wa.me דורש קידומת בינלאומית בלי "+" ובלי 0 מוביל, ולכן 0 מוביל של מספר
     ישראלי מוחלף ב-972. מספר שכבר בא עם קידומת נשאר כמו שהוא. */
  function telDigits(phone) { return String(phone || "").replace(/[^\d+]/g, ""); }
  function waDigits(phone) {
    var d = telDigits(phone).replace(/^\+/, "");
    if (d.indexOf("972") === 0) return d;
    if (d.indexOf("0") === 0) return "972" + d.substring(1);
    return d;
  }

  /* ציור סעיף בודד ל-HTML. משמש גם את מסך התושב וגם את התצוגה-המקדימה
     שבמסך הניהול, כדי שמה שהמנהל רואה בעריכה יהיה מה שהתושב יראה בפועל. */
  function renderSection(sec) {
    var c = sec.content || "";
    if (sec.type === "טקסט") {
      return c.split(/\n\s*\n/).filter(function (p) { return p.trim() !== ""; })
        .map(function (p) { return '<p class="svc-p">' + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
    }
    if (sec.type === "הדגשה") {
      return '<div class="svc-hilite"><span class="svc-hilite__ico">!</span><div>' +
        esc(c).replace(/\n/g, "<br>") + "</div></div>";
    }
    if (sec.type === "רשימה") {
      return '<ul class="svc-ul">' + toLines(c).map(function (l) {
        return "<li>" + esc(l) + "</li>";
      }).join("") + "</ul>";
    }
    if (sec.type === "טבלה") {
      var grid = toGrid(c);
      if (!grid.length) return "";
      var head = grid[0], body = grid.slice(1);
      // גלילה אופקית בעטיפה ולא על הטבלה עצמה — כדי שטבלת מחירון עם 3-4
      // עמודות לא תשבור את רוחב ה-drawer בנייד.
      return '<div class="svc-table-wrap"><table class="svc-table"><thead><tr>' +
        head.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
        "</tr></thead><tbody>" +
        body.map(function (r) {
          return "<tr>" + head.map(function (_, i) {
            return "<td>" + esc(r[i] || "") + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody></table></div>";
    }
    if (sec.type === "אנשי קשר") {
      return toContacts(c).map(function (p) {
        if (!p.name && !p.phone) return "";
        var acts = "";
        if (p.phone) {
          acts =
            '<button type="button" class="svc-icb" data-call="' + esc(p.phone) + '" title="חיוג" aria-label="חיוג ל' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>' +
            "</button>" +
            '<a class="svc-icb svc-icb--wa" href="https://wa.me/' + esc(waDigits(p.phone)) + '" target="_blank" rel="noopener" title="וואטסאפ" aria-label="וואטסאפ ל' + esc(p.name) + '">' +
              '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2zm5.6 14.2c-.2.7-1.4 1.3-2 1.4-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-3-1.3-4.9-4.3-5-4.5-.2-.2-1.2-1.6-1.2-3s.8-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5l.9 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.1.3.6 1.1 1.4 1.8 1 .9 1.8 1.1 2 1.2.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 1c.3.1.4.2.5.3v1.4z"/></svg>' +
            "</a>";
        }
        return '<div class="svc-contact">' +
            '<div class="svc-contact__t"><div class="svc-contact__n">' + esc(p.name) + "</div>" +
            (p.role ? '<div class="svc-contact__r">' + esc(p.role) + "</div>" : "") + "</div>" +
            (p.phone ? '<span class="svc-contact__p">' + esc(p.phone) + "</span>" : "") +
            '<div class="svc-contact__acts">' + acts + "</div>" +
          "</div>";
      }).join("");
    }
    return "";
  }

  /* טקסט חופשי לחיפוש — כולל תוכן הסעיפים, כדי שחיפוש "בלון" ימצא את כרטיס
     הגז גם אם המילה לא מופיעה בשם או בתיאור הקצר. */
  function searchText(svc) {
    return [svc.name, svc.provider, svc.desc, svc.phone].concat(
      (svc.sections || []).map(function (s) { return s.title + " " + s.content; })
    ).join(" ");
  }

  return {
    TYPES: TYPES, build: build, flatten: flatten,
    toLines: toLines, toGrid: toGrid, toContacts: toContacts,
    telDigits: telDigits, waDigits: waDigits,
    renderSection: renderSection, searchText: searchText
  };
})();

/* ============================================================================
 *  מסך התושב
 * ========================================================================== */
var svcState = { list: [], loaded: false, query: "" };

function svcEsc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

CBA.screens.resServices = {
  title: "שירותים",

  render: function (container) {
    container.innerHTML =
      '<div class="screen-head"><div class="screen-head__title">שירותים</div>' +
      '<div class="screen-head__sub">כל השירותים בשיכון — פרטים מלאים, מחירים ואנשי קשר</div></div>' +
      '<div id="svc-body"></div>';

    var body = container.querySelector("#svc-body");

    function paint() {
      body.innerHTML =
        '<div class="svc-toolbar">' +
          '<div class="svc-search">' +
            '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
            '<input id="svc-q" class="field-input" placeholder="חיפוש שירות, ספק או תוכן…" value="' + svcEsc(svcState.query) + '">' +
          "</div>" +
          '<span class="svc-count" id="svc-count"></span>' +
        "</div>" +
        '<div class="svc-grid" id="svc-grid"></div>';
      paintGrid();

      var q = body.querySelector("#svc-q");
      q.addEventListener("input", function () { svcState.query = q.value; paintGrid(); });
    }

    function paintGrid() {
      var q = String(svcState.query || "").trim();
      var list = svcState.list.filter(function (s) {
        if (!s.active) return false;
        return !q || CBA.serviceUtils.searchText(s).indexOf(q) !== -1;
      });
      var grid = body.querySelector("#svc-grid");
      var count = body.querySelector("#svc-count");
      if (count) count.textContent = list.length ? list.length + " שירותים" : "";

      if (!list.length) {
        grid.innerHTML = '<div class="card club-card svc-empty">' +
          (q ? "לא נמצא שירות שמתאים לחיפוש." : "עדיין לא הוגדרו שירותים. מנהל-על יכול להוסיף אותם ממסך ניהול השירותים.") +
          "</div>";
        return;
      }

      grid.innerHTML = list.map(function (s) {
        return '<article class="svc-card" data-svc="' + svcEsc(s.id) + '">' +
            (s.icon ? '<div class="svc-card__ico">' + svcEsc(s.icon) + "</div>" : "") +
            '<h3 class="svc-card__name">' + svcEsc(s.name) + "</h3>" +
            (s.provider ? '<div class="svc-card__prov">' + svcEsc(s.provider) + "</div>" : "") +
            (s.desc ? '<p class="svc-card__desc">' + svcEsc(s.desc) + "</p>" : '<p class="svc-card__desc"></p>') +
            '<div class="svc-card__acts">' +
              '<button type="button" class="btn-primary btn-sm" data-open="' + svcEsc(s.id) + '">כל הפרטים</button>' +
              (s.phone ? '<button type="button" class="btn-ghost btn-sm" data-call="' + svcEsc(s.phone) + '">חיוג</button>' : "") +
            "</div>" +
          "</article>";
      }).join("");

      grid.querySelectorAll("[data-open]").forEach(function (btn) {
        btn.addEventListener("click", function () { svcOpenDrawer(btn.dataset.open); });
      });
      svcBindCallButtons(grid);
    }

    // סקלטון עד שהנתונים חוזרים — עקבי עם שאר המסכים (ר' app.js)
    body.innerHTML = '<div class="card club-card"><div class="club-loading"><div class="rs-spin"></div>טוען…</div></div>';

    CBA.data.getServices(function (res) {
      if (!res || !res.ok) {
        body.innerHTML = '<div class="card club-card"><div class="club-empty">לא ניתן לטעון את השירותים כרגע. ' +
          svcEsc((res && res.error) || "") + "</div></div>";
        return;
      }
      svcState.list = CBA.serviceUtils.build(res.services, res.sections);
      svcState.loaded = true;
      paint();
    });
  }
};

/* חיוג: בנייד פותח את המחייגן (tel:), בדסקטופ מעתיק את המספר ומראה טוסט.
   הסיבה: בדסקטופ לחיצה על tel: לרוב לא עושה כלום ונראית כמו כפתור שבור —
   העתקה היא הפעולה שהמשתמש באמת רצה שם. */
function svcBindCallButtons(root) {
  root.querySelectorAll("[data-call]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var phone = btn.dataset.call;
      var isMobile = window.matchMedia("(max-width: 760px)").matches ||
        /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) { window.location.href = "tel:" + CBA.serviceUtils.telDigits(phone); return; }
      var done = function () { svcToast("המספר " + phone + " הועתק"); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(phone).then(done, function () { svcToast("המספר: " + phone); });
      } else {
        done();
      }
    });
  });
}

var svcToastTimer = null;
function svcToast(msg) {
  var el = document.getElementById("svc-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "svc-toast";
    el.className = "svc-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  // כפיית reflow כדי שהאנימציה תרוץ גם כשהטוסט כבר קיים מקריאה קודמת
  void el.offsetWidth;
  el.classList.add("is-show");
  clearTimeout(svcToastTimer);
  svcToastTimer = setTimeout(function () { el.classList.remove("is-show"); }, 2400);
}

function svcCloseDrawer() {
  var el = document.getElementById("svc-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", svcDrawerKey);
}
function svcDrawerKey(e) { if (e.key === "Escape") svcCloseDrawer(); }

function svcOpenDrawer(id) {
  svcCloseDrawer();
  var svc = null;
  for (var i = 0; i < svcState.list.length; i++) if (svcState.list[i].id === id) svc = svcState.list[i];
  if (!svc) return;

  // הסעיף הראשון פתוח, השאר סגורים — בנייד זה ההבדל בין מסך שאפשר לסרוק
  // לבין גלילה ארוכה של חוזה שלם.
  var sectionsHtml = svc.sections.map(function (sec, k) {
    return '<div class="svc-acc' + (k === 0 ? " is-open" : "") + '">' +
        '<button type="button" class="svc-acc__btn" aria-expanded="' + (k === 0 ? "true" : "false") + '">' +
          '<span>' + svcEsc(sec.title) + "</span>" +
          '<svg class="svc-acc__chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
        "</button>" +
        '<div class="svc-acc__body">' + CBA.serviceUtils.renderSection(sec) + "</div>" +
      "</div>";
  }).join("");

  var overlay = document.createElement("div");
  overlay.id = "svc-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-sclose></div>' +
    '<aside class="drawer" role="dialog" aria-label="פרטי שירות">' +
      '<div class="drawer__head">' +
        '<div class="svc-drawer__head">' +
          (svc.icon ? '<span class="svc-drawer__ico">' + svcEsc(svc.icon) + "</span>" : "") +
          "<div><div class=\"drawer__title\">" + svcEsc(svc.name) + "</div>" +
          (svc.provider ? '<div class="drawer__sub">' + svcEsc(svc.provider) + "</div>" : "") + "</div>" +
        "</div>" +
        '<button class="drawer__close" data-sclose aria-label="סגור">×</button>' +
      "</div>" +
      '<div class="drawer__body svc-drawer__body">' +
        (sectionsHtml || '<div class="club-empty">אין עדיין פרטים לשירות הזה.</div>') +
        (svc.updated ? '<div class="svc-updated">עודכן לאחרונה: ' + svcEsc(svc.updated) + "</div>" : "") +
      "</div>" +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          (svc.phone ? '<button type="button" class="btn-primary" data-call="' + svcEsc(svc.phone) + '">חיוג' +
            (svc.provider ? " ל" + svcEsc(svc.provider) : "") + "</button>" : "") +
          (svc.doc ? '<a class="btn-ghost" href="' + svcEsc(svc.doc) + '" target="_blank" rel="noopener">המסמך המקורי</a>' : "") +
          '<button type="button" class="btn-ghost" data-sclose>סגירה</button>' +
        "</div>" +
      "</div>" +
    "</aside>";
  document.body.appendChild(overlay);

  overlay.querySelectorAll("[data-sclose]").forEach(function (el) {
    el.addEventListener("click", svcCloseDrawer);
  });
  overlay.querySelectorAll(".svc-acc__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var acc = btn.parentNode;
      var open = acc.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  svcBindCallButtons(overlay);
  document.addEventListener("keydown", svcDrawerKey);
}
