/* מסך "ניהול שירותים" באזור הניהול (2026-08-18) — מנהל-על בלבד.
   הצד העורך של אותם נתונים שמסך resServices מציג לתושבים (js/screens/services.js).
   אותה תבנית בדיוק כמו committeeAdmin מול resCommittee: תצוגה פתוחה לכולם
   באזור התושב, עריכה במסך נפרד באזור הניהול, ואכיפה אמיתית בשרת
   (saveServices: PERM_SUPER ב-ACTION_PERMS) ולא רק הסתרה כאן.

   שני מסכים בקובץ אחד? לא — הקובץ הזה הוא רק הניהול. הלוגיקה המשותפת
   (פענוח הפורמט, ציור סעיף) יושבת ב-CBA.serviceUtils שב-services.js, וזו
   הסיבה ש-services.js חייב להיטען לפניו ב-index.html.

   מדיניות רענון/שמירה (ר' זיכרון הפרויקט — cba-data-refresh-policy):
   - כל שינוי בעורך מסמן markDirty("servicesAdmin") כדי שרענון רקע לא ידרוס
     עריכה פתוחה, ו-clearDirty רק אחרי שמירה מוצלחת בפועל.
   - העבודה כולה על עותק (draft) ולא על המצב החי, כך ש"ביטול" באמת מבטל.
   - סגירת drawer עם שינויים לא-שמורים מבקשת אישור. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

var sadmState = {
  list: [],        // מצב שמור (מה שנמצא בשרת נכון לטעינה האחרונה)
  loaded: false,
  draft: null,     // הכרטיס שנערך כרגע (עותק עמוק)
  editIndex: null, // -1 = שירות חדש
  dirty: false
};

function sadmEsc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
function sadmClone(o) { return JSON.parse(JSON.stringify(o)); }

/* מזהה חדש — קצר, יציב, ובלי תלות בשם (שם יכול להשתנות; המזהה לא, כי
   הסעיפים מצביעים אליו). התאריך בתוכו רק כדי שיהיה קריא בגיליון. */
function sadmNewId() {
  return "svc_" + Date.now().toString(36) + Math.floor(Math.random() * 1000).toString(36);
}

CBA.screens.servicesAdmin = {
  title: "ניהול שירותים",

  render: function (container) {
    container.innerHTML =
      '<div class="screen-head screen-head--row">' +
        '<div><div class="screen-head__title">ניהול שירותים</div>' +
        '<div class="screen-head__sub">הכרטיסים שהתושבים רואים במסך "שירותים" — הוספה, עריכה, סידור והסתרה</div></div>' +
        '<button type="button" class="btn-primary" id="sadm-new">שירות חדש +</button>' +
      "</div>" +
      '<div id="sadm-body"></div>';

    var body = container.querySelector("#sadm-body");
    container.querySelector("#sadm-new").addEventListener("click", function () { sadmOpenEditor(-1); });

    body.innerHTML = '<div class="card club-card"><div class="club-loading"><div class="rs-spin"></div>טוען…</div></div>';

    CBA.data.getServices(function (res) {
      if (!res || !res.ok) {
        body.innerHTML = '<div class="card club-card"><div class="club-empty">לא ניתן לטעון כרגע. ' +
          sadmEsc((res && res.error) || "") + "</div></div>";
        return;
      }
      sadmState.list = CBA.serviceUtils.build(res.services, res.sections);
      sadmState.loaded = true;
      sadmPaintList();
    });
  }
};

function sadmPaintList() {
  var body = document.getElementById("sadm-body");
  if (!body) return;

  if (!sadmState.list.length) {
    body.innerHTML = '<div class="card club-card"><div class="club-empty">' +
      'עדיין אין שירותים. לחצו על "שירות חדש +" כדי להוסיף את הראשון.</div></div>';
    return;
  }

  body.innerHTML = '<div class="card club-card sadm-list">' +
    sadmState.list.map(function (s, i) {
      var secCount = (s.sections || []).length;
      return '<div class="sadm-row' + (s.active ? "" : " sadm-row--off") + '" data-i="' + i + '">' +
          '<div class="sadm-row__move">' +
            '<button type="button" class="sadm-arrow" data-up="' + i + '" title="העברה למעלה"' +
              (i === 0 ? " disabled" : "") + '>▲</button>' +
            '<button type="button" class="sadm-arrow" data-down="' + i + '" title="העברה למטה"' +
              (i === sadmState.list.length - 1 ? " disabled" : "") + '>▼</button>' +
          "</div>" +
          '<span class="sadm-row__ico">' + (s.icon ? sadmEsc(s.icon) : "•") + "</span>" +
          '<div class="sadm-row__t">' +
            '<div class="sadm-row__n">' + sadmEsc(s.name) + "</div>" +
            '<div class="sadm-row__m">' +
              (s.provider ? sadmEsc(s.provider) + " · " : "") +
              secCount + " סעיפים" +
              (s.updated ? " · עודכן " + sadmEsc(s.updated) : "") +
            "</div>" +
          "</div>" +
          '<span class="badge ' + (s.active ? "badge--ok" : "badge--info") + '">' +
            (s.active ? "פעיל" : "מוסתר") + "</span>" +
          '<label class="ems-toggle" title="' + (s.active ? "מוצג לתושבים — לחיצה תסתיר" : "מוסתר מהתושבים — לחיצה תציג") + '">' +
            '<input type="checkbox" data-toggle="' + i + '"' + (s.active ? " checked" : "") + ">" +
            '<span class="ems-toggle__slider"></span>' +
          "</label>" +
          '<button type="button" class="btn-ghost btn-sm" data-edit="' + i + '">עריכה</button>' +
        "</div>";
    }).join("") + "</div>";

  body.querySelectorAll("[data-edit]").forEach(function (b) {
    b.addEventListener("click", function () { sadmOpenEditor(Number(b.dataset.edit)); });
  });
  body.querySelectorAll("[data-up]").forEach(function (b) {
    b.addEventListener("click", function () { sadmMove(Number(b.dataset.up), -1); });
  });
  body.querySelectorAll("[data-down]").forEach(function (b) {
    b.addEventListener("click", function () { sadmMove(Number(b.dataset.down), 1); });
  });
  // מתג פעיל/מוסתר — שמירה מיידית, בלי להיכנס לעורך. זה הכפתור שיועד ישתמש
  // בו הכי הרבה (להוריד כרטיס מהאוויר לרגע), ולכן הוא צריך להיות בלחיצה אחת.
  body.querySelectorAll("[data-toggle]").forEach(function (input) {
    input.addEventListener("change", function () {
      var i = Number(input.dataset.toggle);
      var next = input.checked;
      sadmState.list[i].active = next;
      input.disabled = true;
      sadmPersist(function (ok) {
        input.disabled = false;
        if (!ok) sadmState.list[i].active = !next;   // החזרה למצב הקודם בכישלון
        sadmPaintList();
      });
    });
  });
}

function sadmMove(i, dir) {
  var j = i + dir;
  if (j < 0 || j >= sadmState.list.length) return;
  var tmp = sadmState.list[i];
  sadmState.list[i] = sadmState.list[j];
  sadmState.list[j] = tmp;
  sadmPaintList();
  sadmPersist(function (ok) { if (!ok) sadmPaintList(); });
}

/* שמירה של כל המצב לשרת. משמשת גם את המתג/הסידור (בלי drawer) וגם את
   העורך. markDirty/clearDirty עוטפים אותה כדי שרענון הרקע לא ידרוס כתיבה
   בתעופה (ר' cba-data-refresh-policy) — sheets.js כבר מציג את חיווי
   "שומר…/נשמר ✓" בכותרת על סמך זה, בלי שהמסך הזה צריך לצייר משהו. */
function sadmPersist(cb) {
  var flat = CBA.serviceUtils.flatten(sadmState.list);
  if (CBA.sheets.markDirty) CBA.sheets.markDirty("servicesAdmin");
  CBA.data.saveServices(flat.services, flat.sections, function (res) {
    if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("servicesAdmin");
    var ok = !!(res && res.ok);
    if (!ok) CBA.ui.alert((res && res.error) || "השמירה נכשלה, נסו שוב.");
    if (cb) cb(ok);
  });
}

/* ============================================================================
 *  עורך הכרטיס (drawer)
 * ========================================================================== */
function sadmCloseEditor(force) {
  // (2026-08-20) עבר מ-window.confirm ל-CBA.ui.confirm — אותו שינוי מבני
  // שנעשה במסכי המכון: המודל א-סינכרוני, ולכן הסגירה עצמה נדחית לתשובה.
  if (!force && sadmState.dirty) {
    CBA.ui.confirm("יש שינויים שלא נשמרו. לצאת בלי לשמור?",
                   { title: "יציאה מהעורך", okText: "יציאה בלי לשמור", danger: true })
      .then(function (ok) { if (ok) sadmCloseEditor(true); });
    return;
  }
  var el = document.getElementById("sadm-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", sadmEditorKey);
  sadmState.draft = null;
  sadmState.editIndex = null;
  sadmState.dirty = false;
  if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("servicesAdmin:edit");
}
function sadmEditorKey(e) { if (e.key === "Escape") sadmCloseEditor(); }

function sadmTouch() {
  sadmState.dirty = true;
  if (CBA.sheets.markDirty) CBA.sheets.markDirty("servicesAdmin:edit", false);
}

function sadmOpenEditor(index) {
  sadmCloseEditor(true);
  sadmState.editIndex = index;
  sadmState.draft = index === -1
    ? { id: sadmNewId(), name: "", desc: "", icon: "", provider: "", phone: "", doc: "",
        active: true, updated: "", updatedBy: "", sections: [] }
    : sadmClone(sadmState.list[index]);

  var overlay = document.createElement("div");
  overlay.id = "sadm-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-aclose></div>' +
    '<aside class="drawer drawer--wide" role="dialog" aria-label="עריכת שירות">' +
      '<div class="drawer__head">' +
        '<div><div class="drawer__title" id="sadm-title"></div>' +
        '<div class="drawer__sub">מנהל-על בלבד · שינויים נשמרים רק בלחיצה על "שמירה"</div></div>' +
        '<button class="drawer__close" data-aclose aria-label="סגור">×</button>' +
      "</div>" +
      '<div class="drawer__body" id="sadm-edit-body"></div>' +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          '<button type="button" class="btn-primary" id="sadm-save">שמירה</button>' +
          '<button type="button" class="btn-ghost" data-aclose>ביטול</button>' +
        "</div>" +
        '<div class="sadm-foot-extra">' +
          '<button type="button" class="btn-ghost btn-sm" id="sadm-mail">עדכון תושבים במייל</button>' +
          (index === -1 ? "" : '<button type="button" class="btn-ghost btn-sm btn-danger" id="sadm-del">מחיקה</button>') +
        "</div>" +
      "</div>" +
    "</aside>";
  document.body.appendChild(overlay);

  document.getElementById("sadm-title").textContent =
    index === -1 ? "שירות חדש" : "עריכת שירות — " + sadmState.draft.name;

  overlay.querySelectorAll("[data-aclose]").forEach(function (el) {
    el.addEventListener("click", function () { sadmCloseEditor(); });
  });
  document.addEventListener("keydown", sadmEditorKey);
  document.getElementById("sadm-save").addEventListener("click", sadmSaveEditor);
  document.getElementById("sadm-mail").addEventListener("click", sadmOpenMail);
  var delBtn = document.getElementById("sadm-del");
  if (delBtn) delBtn.addEventListener("click", sadmDelete);

  sadmPaintEditor();
}

function sadmPaintEditor() {
  var d = sadmState.draft;
  var body = document.getElementById("sadm-edit-body");
  if (!d || !body) return;

  // שמירת מיקום הגלילה — הציור מחדש קורה בכל הוספת/מחיקת שורה, ובלי זה
  // המנהל "נזרק" לראש העורך אחרי כל לחיצה על "+ שורה" (ר' מדיניות שימור
  // מצב-DOM ב-cba-data-refresh-policy).
  var scroll = body.scrollTop;

  body.innerHTML =
    '<div class="form-block form-block--first">' +
      '<div class="form-grid">' +
        '<div class="form-field"><label>שם השירות</label>' +
          '<input class="field-input" data-f="name" value="' + sadmEsc(d.name) + '"></div>' +
        '<div class="form-field"><label>ספק</label>' +
          '<input class="field-input" data-f="provider" value="' + sadmEsc(d.provider) + '"></div>' +
      "</div>" +
      '<div class="form-field form-field--wide"><label>תיאור קצר (שורה אחת בכרטיס)</label>' +
        '<input class="field-input" data-f="desc" value="' + sadmEsc(d.desc) + '"></div>' +
      '<div class="form-grid">' +
        '<div class="form-field"><label>אייקון (אמוג׳י בודד)</label>' +
          '<input class="field-input sadm-ico-input" data-f="icon" maxlength="4" value="' + sadmEsc(d.icon) + '"></div>' +
        '<div class="form-field"><label>טלפון ראשי</label>' +
          '<input class="field-input" data-f="phone" dir="ltr" value="' + sadmEsc(d.phone) + '"></div>' +
      "</div>" +
      '<div class="form-field form-field--wide"><label>קישור למסמך המקורי (לא חובה)</label>' +
        '<input class="field-input" data-f="doc" dir="ltr" placeholder="https://…" value="' + sadmEsc(d.doc) + '"></div>' +
    "</div>" +

    '<div class="sadm-sec-head">' +
      "<strong>סעיפי הכרטיס</strong>" +
      '<span class="sadm-sec-count">' + d.sections.length + " סעיפים</span>" +
      '<button type="button" class="btn-ai" id="sadm-ai">מילוי אוטומטי ממסמך</button>' +
    "</div>" +
    '<div id="sadm-sections">' + d.sections.map(sadmSectionBoxHTML).join("") + "</div>" +
    '<div class="sadm-addbar">' +
      CBA.serviceUtils.TYPES.map(function (t) {
        return '<button type="button" class="sadm-add" data-add="' + sadmEsc(t) + '">+ ' + sadmEsc(t) + "</button>";
      }).join("") +
    "</div>";

  body.scrollTop = scroll;
  sadmBindEditor(body);
}

function sadmSectionBoxHTML(sec, k) {
  return '<div class="sadm-sec" data-k="' + k + '">' +
      '<div class="sadm-sec__head">' +
        '<span class="sadm-sec__type">' + sadmEsc(sec.type) + "</span>" +
        '<input class="sadm-sec__title" data-sec-title="' + k + '" value="' + sadmEsc(sec.title) + '" placeholder="כותרת הסעיף">' +
        '<div class="sadm-row__move">' +
          '<button type="button" class="sadm-arrow" data-sec-up="' + k + '" title="למעלה">▲</button>' +
          '<button type="button" class="sadm-arrow" data-sec-down="' + k + '" title="למטה">▼</button>' +
        "</div>" +
        '<button type="button" class="sadm-x" data-sec-del="' + k + '" title="מחיקת סעיף">×</button>' +
      "</div>" +
      '<div class="sadm-sec__body">' + sadmSectionEditorHTML(sec, k) + "</div>" +
    "</div>";
}

/* עורך ייעודי לכל סוג — ולא תיבת טקסט אחת לכולם. זו ההחלטה שמכריעה אם
   המסך הזה נעים לעבוד איתו: אף אחד לא אמור להקליד "|" ביד. */
function sadmSectionEditorHTML(sec, k) {
  var t = sec.type;

  if (t === "טקסט" || t === "הדגשה") {
    return '<textarea class="field-input sadm-ta' + (t === "הדגשה" ? " sadm-ta--warn" : "") +
      '" data-sec-content="' + k + '" rows="4">' + sadmEsc(sec.content) + "</textarea>" +
      '<div class="sadm-hint">שורה ריקה בין פסקאות תיצור פסקה חדשה בתצוגה.</div>';
  }

  if (t === "רשימה") {
    var lines = String(sec.content || "").split("\n");
    if (!lines.length) lines = [""];
    return lines.map(function (l, j) {
      return '<div class="sadm-line">' +
          '<span class="sadm-line__b">•</span>' +
          '<input class="field-input" data-line="' + k + '_' + j + '" value="' + sadmEsc(l) + '">' +
          '<button type="button" class="sadm-x" data-line-del="' + k + '_' + j + '" title="מחיקת שורה">×</button>' +
        "</div>";
    }).join("") +
    '<button type="button" class="sadm-add sadm-add--sm" data-line-add="' + k + '">+ שורה</button>';
  }

  if (t === "טבלה") {
    var grid = CBA.serviceUtils.toGrid(sec.content);
    if (!grid.length) grid = [["", ""]];
    var cols = grid[0].length;
    return '<div class="sadm-table-wrap"><table class="sadm-table">' +
        grid.map(function (row, ri) {
          var cells = "";
          for (var ci = 0; ci < cols; ci++) {
            cells += '<td><input data-cell="' + k + "_" + ri + "_" + ci + '" value="' + sadmEsc(row[ci] || "") + '"></td>';
          }
          return '<tr' + (ri === 0 ? ' class="sadm-table__head"' : "") + ">" + cells +
            '<td class="sadm-table__x"><button type="button" class="sadm-x" data-trow-del="' + k + "_" + ri +
            '" title="מחיקת שורה"' + (ri === 0 ? " disabled" : "") + ">×</button></td></tr>";
        }).join("") +
      "</table></div>" +
      '<div class="sadm-table-acts">' +
        '<button type="button" class="sadm-add sadm-add--sm" data-trow-add="' + k + '">+ שורה</button>' +
        '<button type="button" class="sadm-add sadm-add--sm" data-tcol-add="' + k + '">+ עמודה</button>' +
        '<button type="button" class="sadm-add sadm-add--sm" data-tcol-del="' + k + '"' +
          (cols <= 1 ? " disabled" : "") + ">− עמודה</button>" +
      "</div>" +
      '<div class="sadm-hint">השורה הראשונה היא הכותרות של הטבלה.</div>';
  }

  if (t === "אנשי קשר") {
    var people = CBA.serviceUtils.toContacts(sec.content);
    if (!people.length) people = [{ name: "", role: "", phone: "" }];
    return '<div class="sadm-contact sadm-contact--head"><span>שם</span><span>תפקיד</span><span>טלפון</span><span></span></div>' +
      people.map(function (p, j) {
        return '<div class="sadm-contact">' +
            // placeholder על כל שדה, לא רק שורת כותרות למעלה — בנייד שורת
            // הכותרות מוסתרת (אין לה מקום), ובלי זה אי אפשר לדעת מה כל שדה.
            '<input data-c="' + k + "_" + j + '_0" placeholder="שם" value="' + sadmEsc(p.name) + '">' +
            '<input data-c="' + k + "_" + j + '_1" placeholder="תפקיד" value="' + sadmEsc(p.role) + '">' +
            '<input data-c="' + k + "_" + j + '_2" placeholder="טלפון" dir="ltr" value="' + sadmEsc(p.phone) + '">' +
            '<button type="button" class="sadm-x" data-c-del="' + k + "_" + j + '" title="מחיקה">×</button>' +
          "</div>";
      }).join("") +
      '<button type="button" class="sadm-add sadm-add--sm" data-c-add="' + k + '">+ איש קשר</button>';
  }

  return "";
}

/* --- קריאה/כתיבה של תוכן סעיף בפורמט האחסון -------------------------------
   כל הפונקציות האלה עובדות על draft.sections[k].content ישירות, כדי שיהיה
   מקור אמת אחד (ולא "מצב עריכה" מקביל שצריך לסנכרן). */
function sadmSetLines(k, arr) { sadmState.draft.sections[k].content = arr.join("\n"); }
function sadmGetLines(k) { return String(sadmState.draft.sections[k].content || "").split("\n"); }
function sadmGetGrid(k) {
  var g = CBA.serviceUtils.toGrid(sadmState.draft.sections[k].content);
  return g.length ? g : [["", ""]];
}
function sadmSetGrid(k, g) {
  sadmState.draft.sections[k].content = g.map(function (r) { return r.join("|"); }).join("\n");
}
function sadmGetContacts(k) {
  var p = CBA.serviceUtils.toContacts(sadmState.draft.sections[k].content);
  return p.length ? p : [{ name: "", role: "", phone: "" }];
}
function sadmSetContacts(k, arr) {
  sadmState.draft.sections[k].content = arr.map(function (p) {
    return [p.name || "", p.role || "", p.phone || ""].join("|");
  }).join("\n");
}

function sadmBindEditor(body) {
  var d = sadmState.draft;

  // שדות ראשיים — הקלדה מעדכנת את ה-draft בלבד; אין ציור מחדש, אחרת הפוקוס
  // היה קופץ מהשדה בכל תו.
  body.querySelectorAll("[data-f]").forEach(function (inp) {
    inp.addEventListener("input", function () { d[inp.dataset.f] = inp.value; sadmTouch(); });
  });

  body.querySelectorAll("[data-sec-title]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      d.sections[Number(inp.dataset.secTitle)].title = inp.value; sadmTouch();
    });
  });
  body.querySelectorAll("[data-sec-content]").forEach(function (ta) {
    ta.addEventListener("input", function () {
      d.sections[Number(ta.dataset.secContent)].content = ta.value; sadmTouch();
    });
  });

  body.querySelectorAll("[data-sec-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = Number(b.dataset.secDel);
      CBA.ui.confirm('למחוק את הסעיף "' + (d.sections[k].title || "") + '"?',
                     { title: "מחיקת סעיף", okText: "מחיקה", danger: true })
        .then(function (ok) {
          if (!ok) return;
          d.sections.splice(k, 1); sadmTouch(); sadmPaintEditor();
        });
    });
  });
  body.querySelectorAll("[data-sec-up]").forEach(function (b) {
    b.addEventListener("click", function () { sadmMoveSection(Number(b.dataset.secUp), -1); });
  });
  body.querySelectorAll("[data-sec-down]").forEach(function (b) {
    b.addEventListener("click", function () { sadmMoveSection(Number(b.dataset.secDown), 1); });
  });

  // רשימה
  body.querySelectorAll("[data-line]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var p = inp.dataset.line.split("_"), k = Number(p[0]), j = Number(p[1]);
      var arr = sadmGetLines(k); arr[j] = inp.value; sadmSetLines(k, arr); sadmTouch();
    });
  });
  body.querySelectorAll("[data-line-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = b.dataset.lineDel.split("_"), k = Number(p[0]), j = Number(p[1]);
      var arr = sadmGetLines(k); arr.splice(j, 1); sadmSetLines(k, arr); sadmTouch(); sadmPaintEditor();
    });
  });
  body.querySelectorAll("[data-line-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = Number(b.dataset.lineAdd);
      var arr = sadmGetLines(k); arr.push(""); sadmSetLines(k, arr); sadmTouch(); sadmPaintEditor();
    });
  });

  // טבלה
  body.querySelectorAll("[data-cell]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var p = inp.dataset.cell.split("_"), k = Number(p[0]), ri = Number(p[1]), ci = Number(p[2]);
      var g = sadmGetGrid(k);
      while (g[ri].length <= ci) g[ri].push("");
      g[ri][ci] = inp.value; sadmSetGrid(k, g); sadmTouch();
    });
  });
  body.querySelectorAll("[data-trow-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = Number(b.dataset.trowAdd), g = sadmGetGrid(k);
      var row = []; for (var i = 0; i < g[0].length; i++) row.push("");
      g.push(row); sadmSetGrid(k, g); sadmTouch(); sadmPaintEditor();
    });
  });
  body.querySelectorAll("[data-trow-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = b.dataset.trowDel.split("_"), k = Number(p[0]), ri = Number(p[1]);
      var g = sadmGetGrid(k); g.splice(ri, 1);
      if (!g.length) g = [["", ""]];
      sadmSetGrid(k, g); sadmTouch(); sadmPaintEditor();
    });
  });
  body.querySelectorAll("[data-tcol-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = Number(b.dataset.tcolAdd), g = sadmGetGrid(k);
      g.forEach(function (r) { r.push(""); }); sadmSetGrid(k, g); sadmTouch(); sadmPaintEditor();
    });
  });
  body.querySelectorAll("[data-tcol-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = Number(b.dataset.tcolDel), g = sadmGetGrid(k);
      if (g[0].length <= 1) return;
      g.forEach(function (r) { r.pop(); }); sadmSetGrid(k, g); sadmTouch(); sadmPaintEditor();
    });
  });

  // אנשי קשר
  body.querySelectorAll("[data-c]").forEach(function (inp) {
    inp.addEventListener("input", function () {
      var p = inp.dataset.c.split("_"), k = Number(p[0]), j = Number(p[1]), f = Number(p[2]);
      var arr = sadmGetContacts(k);
      arr[j][["name", "role", "phone"][f]] = inp.value;
      sadmSetContacts(k, arr); sadmTouch();
    });
  });
  body.querySelectorAll("[data-c-del]").forEach(function (b) {
    b.addEventListener("click", function () {
      var p = b.dataset.cDel.split("_"), k = Number(p[0]), j = Number(p[1]);
      var arr = sadmGetContacts(k); arr.splice(j, 1); sadmSetContacts(k, arr); sadmTouch(); sadmPaintEditor();
    });
  });
  body.querySelectorAll("[data-c-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var k = Number(b.dataset.cAdd), arr = sadmGetContacts(k);
      arr.push({ name: "", role: "", phone: "" }); sadmSetContacts(k, arr); sadmTouch(); sadmPaintEditor();
    });
  });

  // הוספת סעיף חדש
  body.querySelectorAll("[data-add]").forEach(function (b) {
    b.addEventListener("click", function () {
      var type = b.dataset.add;
      d.sections.push({
        secId: d.id + "_s" + (d.sections.length + 1),
        order: d.sections.length + 1,
        type: type,
        title: "",
        content: type === "טבלה" ? "עמודה א|עמודה ב" : (type === "אנשי קשר" ? "||" : "")
      });
      sadmTouch(); sadmPaintEditor();
      // גלילה לסעיף החדש — אחרת בכרטיס ארוך הוא נוסף מחוץ למסך והלחיצה
      // נראית כאילו לא עשתה כלום.
      var boxes = body.querySelectorAll(".sadm-sec");
      if (boxes.length) boxes[boxes.length - 1].scrollIntoView({ block: "center" });
    });
  });

  var ai = document.getElementById("sadm-ai");
  if (ai) ai.addEventListener("click", sadmOpenAI);
}

function sadmMoveSection(k, dir) {
  var d = sadmState.draft, j = k + dir;
  if (j < 0 || j >= d.sections.length) return;
  var tmp = d.sections[k]; d.sections[k] = d.sections[j]; d.sections[j] = tmp;
  sadmTouch(); sadmPaintEditor();
}

/* האם הסעיף ריק *באמת* — כלומר המנהל הוסיף אותו ולא מילא כלום. הבדיקה
   חייבת להיות פר-סוג ולא "יש טקסט כלשהו בתא": סעיף טבלה חדש נולד עם שורת
   כותרות ברירת-מחדל ("עמודה א|עמודה ב"), וסעיף אנשי קשר נולד עם "||" —
   בדיקה נאיבית הייתה סופרת את שורת הכותרות כתוכן ומשאירה בכרטיס של התושב
   טבלה ריקה בלי כותרת. (נמצא בבדיקה אוטומטית לפני המסירה, 2026-08-18.) */
function sadmSectionIsEmpty(sec) {
  var type = sec.type, content = String(sec.content || "");
  if (type === "טבלה") {
    // רק שורות הנתונים נחשבות — שורה 0 היא הכותרות.
    var grid = CBA.serviceUtils.toGrid(content);
    for (var r = 1; r < grid.length; r++) {
      for (var c = 0; c < grid[r].length; c++) if (String(grid[r][c] || "").trim() !== "") return false;
    }
    return true;
  }
  if (type === "אנשי קשר") {
    var people = CBA.serviceUtils.toContacts(content);
    for (var i = 0; i < people.length; i++) {
      if ((people[i].name + people[i].role + people[i].phone).trim() !== "") return false;
    }
    return true;
  }
  return content.trim() === "";
}

function sadmSaveEditor() {
  var d = sadmState.draft;
  if (!String(d.name || "").trim()) { CBA.ui.alert("צריך למלא שם לשירות."); return; }

  // ניקוי לפני שמירה: סעיף בלי כותרת ובלי תוכן אמיתי הוא סעיף שנפתח ולא מולא —
  // אין טעם לשמור אותו ולהציג לתושב כותרת ריקה (ר' sadmSectionIsEmpty).
  d.sections = d.sections.filter(function (s) {
    return String(s.title || "").trim() !== "" || !sadmSectionIsEmpty(s);
  });

  var release = CBA.ui.busy(document.getElementById("sadm-save"), "שומר…");

  if (sadmState.editIndex === -1) sadmState.list.push(d);
  else sadmState.list[sadmState.editIndex] = d;

  sadmPersist(function (ok) {
    release();
    if (!ok) {
      // החזרת המצב: שירות חדש שנכשל לא צריך להישאר ברשימה המקומית
      if (sadmState.editIndex === -1) sadmState.list.pop();
      return;
    }
    sadmState.dirty = false;
    sadmCloseEditor(true);
    // טעינה מחדש מהשרת — כדי לקבל את "עודכן"/"עודכן ע"י" שהשרת כתב,
    // במקום לנחש אותם בלקוח.
    CBA.data.getServices(function (res) {
      if (res && res.ok) sadmState.list = CBA.serviceUtils.build(res.services, res.sections);
      sadmPaintList();
    });
  });
}

function sadmDelete() {
  var d = sadmState.draft;
  CBA.ui.confirm('למחוק את השירות "' + (d.name || "") + '" וכל הסעיפים שלו? הפעולה אינה הפיכה.',
                 { title: "מחיקת שירות", okText: "מחיקה", danger: true })
    .then(function (ok) {
      if (!ok) return;
      var idx = sadmState.editIndex;
      var removed = sadmState.list.splice(idx, 1)[0];
      var release = CBA.ui.busy(document.getElementById("sadm-del"), "מוחק…");
      sadmPersist(function (saved) {
        release();
        if (!saved) { sadmState.list.splice(idx, 0, removed); return; }
        sadmState.dirty = false;
        sadmCloseEditor(true);
        sadmPaintList();
      });
    });
}

/* ============================================================================
 *  עדכון תושבים במייל — ידני בלבד
 * ----------------------------------------------------------------------------
 *  לא נשלח אוטומטית בשמירה, בכוונה (הוחלט 2026-08-18): תיקון פסיק לא צריך
 *  להגיע לתיבת הדואר של כל השיכון. הנוסח עצמו נערך במסך "ניהול מיילים"
 *  (תבנית SERVICE_UPDATED) — כאן רק בוחרים מתי לשלוח ומה להגיד ב"מה השתנה".
 * ========================================================================== */
function sadmOpenMail() {
  var d = sadmState.draft;
  if (!String(d.name || "").trim()) { CBA.ui.alert("צריך למלא שם לשירות לפני שליחת עדכון."); return; }
  if (sadmState.dirty && !sadmState.mailWarned) {
    CBA.ui.confirm("יש שינויים שעדיין לא נשמרו — המייל יתאר שינוי שהתושבים לא יראו עדיין. להמשיך?",
                   { title: "שינויים שלא נשמרו", okText: "להמשיך בכל זאת" })
      .then(function (ok) {
        if (!ok) return;
        sadmState.mailWarned = true;
        try { sadmOpenMail(); } finally { sadmState.mailWarned = false; }
      });
    return;
  }

  var wrap = document.createElement("div");
  wrap.id = "sadm-mail";
  wrap.className = "sadm-modal";
  wrap.innerHTML =
    '<div class="sadm-modal__bg" data-mclose></div>' +
    '<div class="sadm-modal__box">' +
      "<h3>עדכון תושבים במייל</h3>" +
      '<p class="sadm-modal__sub">נשלח לכל תושבי השיכון הפעילים — רק עכשיו, בלחיצה שלך. ' +
        'שמירה רגילה של השירות לא שולחת כלום.</p>' +
      '<div class="form-field form-field--wide"><label>מה השתנה?</label>' +
        '<input class="field-input" id="sadm-mail-what" placeholder="למשל: עודכן המחירון והתווספו טלפונים של טכנאים"></div>' +
      '<div class="sadm-modal__acts">' +
        '<button type="button" class="btn-primary" id="sadm-mail-send">שליחה לתושבים</button>' +
        '<button type="button" class="btn-ghost" data-mclose>ביטול</button>' +
      "</div>" +
    "</div>";
  document.body.appendChild(wrap);

  function close() { if (wrap.parentNode) wrap.remove(); }
  wrap.querySelectorAll("[data-mclose]").forEach(function (el) { el.addEventListener("click", close); });

  document.getElementById("sadm-mail-send").addEventListener("click", function () {
    var what = String(document.getElementById("sadm-mail-what").value || "").trim();
    if (!what) { CBA.ui.alert('צריך לכתוב מה השתנה — זה מה שהתושבים יראו במייל.'); return; }
    var btn = this;
    var release = CBA.ui.busy(btn, "שולח מיילים…");
    CBA.data.notifyServiceUpdate(
      { serviceName: d.name, provider: d.provider, whatChanged: what },
      function (res) {
        release();
        if (res && res.ok) {
          close();
          CBA.ui.alert("נשלח ל-" + res.sent + " כתובות מייל.", "העדכון נשלח");
        } else {
          CBA.ui.alert((res && res.error) || "השליחה נכשלה, נסו שוב.");
        }
      }
    );
  });
}

/* ============================================================================
 *  מילוי אוטומטי ממסמך (Gemini)
 * ----------------------------------------------------------------------------
 *  אותו חוזה בדיוק כמו סריקת קבלות: התוצאה נכנסת לעורך הפתוח לעריכה,
 *  ולעולם לא נשמרת מעצמה. המנהל רואה, מתקן, ורק אז לוחץ "שמירה".
 * ========================================================================== */
function sadmOpenAI() {
  var wrap = document.createElement("div");
  wrap.id = "sadm-ai-modal";
  wrap.className = "sadm-modal";
  wrap.innerHTML =
    '<div class="sadm-modal__bg" data-aiclose></div>' +
    '<div class="sadm-modal__box">' +
      "<h3>מילוי אוטומטי ממסמך</h3>" +
      '<p class="sadm-modal__sub">בחרו PDF או תמונה של החוזה/הנוהל. הסעיפים שיוצעו ייכנסו לעורך ' +
        "<strong>לעריכה בלבד</strong> — שום דבר לא נשמר לבד, בדיוק כמו בסריקת קבלות.</p>" +
      '<input type="file" id="sadm-ai-file" accept="application/pdf,image/*" class="field-input">' +
      '<div class="sadm-modal__acts">' +
        '<button type="button" class="btn-primary" id="sadm-ai-go">ניתוח המסמך</button>' +
        '<button type="button" class="btn-ghost" data-aiclose>ביטול</button>' +
      "</div>" +
      '<div class="sadm-ai-status" id="sadm-ai-status"></div>' +
    "</div>";
  document.body.appendChild(wrap);

  function close() { if (wrap.parentNode) wrap.remove(); }
  wrap.querySelectorAll("[data-aiclose]").forEach(function (el) { el.addEventListener("click", close); });

  document.getElementById("sadm-ai-go").addEventListener("click", function () {
    var input = document.getElementById("sadm-ai-file");
    var file = input.files && input.files[0];
    if (!file) { CBA.ui.alert("צריך לבחור קובץ."); return; }
    // Apps Script מוגבל בגודל בקשה; מסמך שירות סביר הוא כמה מאות KB.
    if (file.size > 8 * 1024 * 1024) { CBA.ui.alert("הקובץ גדול מדי (מעל 8MB)."); return; }

    var btn = this, status = document.getElementById("sadm-ai-status");
    btn.disabled = true; btn.textContent = "מנתח…";
    status.textContent = "קורא את הקובץ…";

    var reader = new FileReader();
    reader.onload = function () {
      var b64 = String(reader.result || "").split(",")[1] || "";
      status.textContent = "שולח לניתוח — זה יכול לקחת עד חצי דקה…";
      CBA.data.scanServiceDoc(b64, file.type || "application/pdf", function (res) {
        btn.disabled = false; btn.textContent = "ניתוח המסמך";
        if (!res || !res.ok) {
          status.textContent = "";
          CBA.ui.alert((res && res.error) || "הניתוח נכשל, נסו שוב.");
          return;
        }
        sadmApplyAI(res.fields || {});
        close();
      });
    };
    reader.onerror = function () {
      btn.disabled = false; btn.textContent = "ניתוח המסמך";
      status.textContent = "";
      CBA.ui.alert("קריאת הקובץ נכשלה.");
    };
    reader.readAsDataURL(file);
  });
}

/* מזריק את התוצאה ל-draft. שדות ראשיים ממולאים רק אם הם ריקים — כדי לא
   לדרוס שם/ספק שהמנהל כבר הקליד ידנית. הסעיפים *מתווספים* לסוף ולא
   מחליפים, מאותה סיבה. */
function sadmApplyAI(f) {
  var d = sadmState.draft;
  if (!d) return;
  ["name", "provider", "desc", "phone"].forEach(function (key) {
    if (!String(d[key] || "").trim() && f[key]) d[key] = String(f[key]);
  });
  var added = 0;
  (f.sections || []).forEach(function (s) {
    if (CBA.serviceUtils.TYPES.indexOf(String(s.type || "").trim()) === -1) return;
    d.sections.push({
      secId: d.id + "_s" + (d.sections.length + 1),
      order: d.sections.length + 1,
      type: String(s.type).trim(),
      title: String(s.title || ""),
      content: String(s.content || "")
    });
    added++;
  });
  sadmTouch();
  sadmPaintEditor();
  CBA.ui.alert(added
    ? "נוספו " + added + " סעיפים מוצעים. עברו עליהם, תקנו מה שצריך — ורק אז לחצו שמירה."
    : "לא זוהו סעיפים מתאימים במסמך.");
}
