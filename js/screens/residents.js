/* residents.js — מסך "תושבים" באזור הניהול (2026-08-07).

   שפת העיצוב זהה למסך ההוצאות בכוונה: אותו כרטיס טבלה (.tx-card / .tx-head /
   .tx-row / .tx-c), אותו פס בקרות (.tx-bar), אותם seg לסינון, ואותו drawer
   לעריכה — כדי שלא ייווצר "אי" עיצובי נפרד באפליקציה.

   מודל הזהות (חשוב): שורה בטאב "תושבים" היא **ישות קבועה** שמחזיקה את
   "מזהה קבוע", וכל התנועות בגיליון ההוצאות מצביעות למזהה הזה — לא לשם. לכן:
   - מעבר בתוך השיכון (אותה משפחה, בית אחר) = עריכת מספר הבית באותה שורה.
     אותה ישות, ההיסטוריה נשארת נכונה.
   - משפחה עזבה ואחרת נכנסה = פעולה נפרדת שמסמנת "עזב" ופותחת שורה חדשה עם
     מזהה חדש. עריכה ידנית במקרה הזה הייתה מעבירה את ההיסטוריה הפיננסית של
     הדיירים הקודמים לחדשים. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

var resState = {
  loaded: false, loading: false, error: null,
  headers: [], rows: [], signups: [],
  q: "", filter: "active",  // active | left | all
  sort: "family", dir: 1,   // ברירת מחדל: שם משפחה א-ב
  conflicts: []
};

// שימור מיקום גלילה בין ציורים מחדש (אותה בעיה ואותו פתרון כמו ב-expenses.js:
// כל פעולה/רענון קורא ל-render() מחדש, וה-innerHTML החדש היה מאפס את הגלילה).
var resScrollTop = 0, resWinScrollY = 0;

// חיווי "תפקיד בוועד" בטבלת "תושבים" של הניהול (2026-08-10, לבקשת יועד —
// סעיף 8: "שהתפקיד בשיכון... יופיע גם בצד של רשימת תושבים, גם למנהל וגם
// לתושב, אך מואפר ללא יכולת עריכה"). בצד התושב זה כבר קיים ליד כל תושב
// ב-resDirectory (resident.js, dir-card__role) — כאן זה אותו רעיון בדיוק
// בטבלת הניהול, לכל שם בעמודת "דיירים". מטמון נפרד, נבנה פעם אחת מ-
// CBA.data.getCommitteeTree ישירות (לא buildBoxes — כאן צריך שורה-לפי-אדם).
// התאמה best-effort: קודם "שם פרטי משפחה" מדויק, אחר-כך שם פרטי בלבד,
// ולבסוף מזהה קבוע (rid) רק אם יש אדם יחיד עם אותו rid. לקריאה בלבד —
// עריכה רק דרך עץ הוועד (committeeAdmin).
var resRoleIndex = null, resRoleLoading = false, resContainerRef = null;
function buildResRoleIndex(rows) {
  var byLabel = {}, byFirst = {}, byRid = {};
  (rows || []).forEach(function (r) {
    var role = String(r["תפקיד"] || "").trim();
    var name = String(r["שם"] || "").trim();
    var rid = String(r["מזהה תושב"] || "").trim();
    if (!role || !name) return;
    (byLabel[name] = byLabel[name] || []).push(role);
    var first = name.split(" ")[0];
    if (first) (byFirst[first] = byFirst[first] || []).push(role);
    if (rid) (byRid[rid] = byRid[rid] || []).push({ name: name, role: role });
  });
  return { byLabel: byLabel, byFirst: byFirst, byRid: byRid };
}
function resRoleFor(fn, fam, rid) {
  if (!resRoleIndex || !fn) return "";
  var label = fn + " " + fam;
  if (resRoleIndex.byLabel[label]) return resRoleIndex.byLabel[label][0];
  if (resRoleIndex.byFirst[fn]) return resRoleIndex.byFirst[fn][0];
  if (rid && resRoleIndex.byRid[rid] && resRoleIndex.byRid[rid].length === 1) return resRoleIndex.byRid[rid][0].role;
  return "";
}
function ensureResRoleIndex() {
  if (resRoleIndex || resRoleLoading) return;
  resRoleLoading = true;
  CBA.data.getCommitteeTree(function (res) {
    resRoleLoading = false;
    resRoleIndex = buildResRoleIndex(res && res.ok ? res.rows : []);
    // כתיבה ל-container החי בלבד (לא לרפרנס יתום מ-render קודם — ר' cba-data-refresh-policy)
    if (resContainerRef && document.body.contains(resContainerRef)) {
      CBA.screens.residents.render(resContainerRef);
    }
  });
}
/* "שם — תפקיד" לכל דייר עם תפקיד בבית הזה, מחוברים ב-" · "; ריק אם אין. */
function resRoleLine(names, family, rid) {
  if (!resRoleIndex) return "";
  var parts = names.map(function (fn) {
    var role = resRoleFor(fn, family, rid);
    return role ? (names.length > 1 ? (fn + " — " + role) : role) : "";
  }).filter(Boolean);
  return parts.join(" · ");
}

/* מיון: שם משפחה ודיירים לפי א-ב עברי (localeCompare), בית ותנועות כמספרים.
   ברירת המחדל היא שם משפחה עולה — זה הסדר שבו מחפשים אדם ברשימה. */
function resSortRows(rows, c) {
  var key = resState.sort, dir = resState.dir;
  var txt = function (r) {
    if (key === "family") return resVal(r, c.family);
    if (key === "people") return c.firstName.map(function (k) { return resVal(r, k); }).filter(Boolean).join(" ");
    if (key === "status") return resIsActive(r, c) ? "0" : "1";
    return "";
  };
  var numOf = function (r) {
    if (key === "house") { var n = parseFloat(String(resVal(r, c.house)).replace(/[^\d.]/g, "")); return isNaN(n) ? Infinity : n; }
    if (key === "tx") return resTxCount(r, c);
    return 0;
  };
  var isNum = (key === "house" || key === "tx");
  return rows.slice().sort(function (a, b) {
    var d = isNum ? (numOf(a) - numOf(b)) : txt(a).localeCompare(txt(b), "he");
    if (d === 0 && key !== "family") d = resVal(a, c.family).localeCompare(resVal(b, c.family), "he");
    return d * dir;
  });
}
function resSortArrow(key) {
  if (resState.sort !== key) return "";
  return '<span class="res-sort">' + (resState.dir === 1 ? "▲" : "▼") + "</span>";
}
function resHeadCell(key, label) {
  return '<div class="res-th" data-res-sort="' + key + '">' + CBA.esc(label) + resSortArrow(key) + '</div>';
}

/* איתור עמודות לפי כותרת — עמיד לשינוי סדר, בדיוק כמו בשרת.
   "שם פרטי"/"מקצוע" נבדקים לפני "משפחה"/"בית" כדי שלא ייתפסו בטעות. */
function resCols(headers) {
  var c = { email: [], firstName: [], phone: [], profession: [], perm: [],
            role: null, status: null, family: null, house: null,
            kids: null, notes: null, id: null };
  headers.forEach(function (h) {
    var t = String(h).trim();
    if (!t) return;
    if (t.indexOf("הרשאות") !== -1) c.perm.push(t);
    else if (t.indexOf("שם פרטי") !== -1) c.firstName.push(t);
    else if (t.indexOf("מקצוע") !== -1) c.profession.push(t);
    else if (t.indexOf("אימייל") !== -1) c.email.push(t);
    else if (t.indexOf("טלפון") !== -1) c.phone.push(t);
    else if (t.indexOf("ילדים") !== -1) c.kids = t;
    else if (t.indexOf("הערות") !== -1) c.notes = t;
    else if (t.indexOf("תפקיד") !== -1) c.role = t;
    else if (t.indexOf("סטטוס") !== -1) c.status = t;
    else if (t.indexOf("מזהה קבוע") !== -1) c.id = t;
    else if (t.indexOf("משפחה") !== -1) c.family = t;
    else if (t.indexOf("בית") !== -1) c.house = t;
  });
  return c;
}

function resVal(row, col) { return col ? String(row[col] == null ? "" : row[col]).trim() : ""; }

/* ---------- הרשאות (2026-08-07) ----------
   ההרשאות הן **פר אדם**: עמודת "הרשאות 1" שייכת ל"אימייל 1", וכן הלאה — בדיוק
   כמו "שם פרטי N". כך אפשר שאחד מבני הזוג ינהל את המועדון והשני יהיה תושב רגיל.
   אותה לוגיקה בדיוק רצה גם בשרת (permissionsFor_ ב-Code.gs); כאן זה רק לתצוגה. */
var RES_PERMS = [
  { code: "על",     label: "מנהל על",              hint: "גישה לכל התכנים, והיחיד שמנהל הרשאות" },
  { code: "תקציב",  label: "ניהול תקציב ותשלומים", hint: "תכנון מול ביצוע, ניהול הוצאות, בניית תקציב" },
  { code: "מועדון", label: "ניהול מועדון",          hint: "אישור ודחייה של שריוני מועדון" },
  { code: "תושבים", label: "ניהול תושבים",          hint: "מסך התושבים ובקשות ההרשמה" },
  // מכון כושר (2026-08-18) — מידור נפרד ממועדון בכוונה: שני המתקנים
  // מנוהלים ע"י אנשים שונים. חייב להיות זהה ל-PERM_GYM בשרת ול-PERM.GYM ב-app.js.
  { code: "מכון",   label: "ניהול מכון כושר",       hint: "מנויים, אישורי הרשמה ואימות תשלומים" }
];
var RES_PERM_CODES = RES_PERMS.map(function (p) { return p.code; });

function resParsePerms(raw) {
  return String(raw || "").split(/[,;|\/]/).map(function (x) { return x.trim(); })
    .filter(function (x) { return RES_PERM_CODES.indexOf(x) !== -1; })
    .filter(function (x, i, a) { return a.indexOf(x) === i; });
}
/* ההרשאות בפועל של אדם בשורה. תאימות לאחור: אם עמודת ההרשאות ריקה אבל עמודת
   "תפקיד" הישנה אומרת "מנהל" — הוא נחשב מנהל על, בדיוק כמו בשרת. */
function resPermsOf(row, c, i) {
  var p = resParsePerms(resVal(row, c.perm[i]));
  if (!p.length && (resVal(row, c.role) || "").indexOf("מנהל") !== -1) return ["על"];
  return p;
}
/* כל ההרשאות בשורה, לתצוגה מרוכזת בטבלה */
function resRowPerms(row, c) {
  var out = [];
  var n = Math.max(c.email.length, c.perm.length, 1);
  for (var i = 0; i < n; i++) {
    resPermsOf(row, c, i).forEach(function (p) { if (out.indexOf(p) === -1) out.push(p); });
  }
  return out;
}
function resPermLabel(code) {
  for (var i = 0; i < RES_PERMS.length; i++) if (RES_PERMS[i].code === code) return RES_PERMS[i].label;
  return code;
}
/* האם המשתמש המחובר הוא מנהל על — רק הוא רואה ומשנה הרשאות */
function resIAmSuper() { return !!(window.CBA && CBA.isSuper); }
function resIsActive(row, c) {
  var s = resVal(row, c.status);
  return !s || s.indexOf("פעיל") !== -1;
}
/* כמה תנועות משויכות למשק הבית הזה — מוצג בשורה כדי שיהיה ברור מיד
   שהשורה "מחזיקה" היסטוריה, ושהחלפת דיירים אינה עריכה תמימה. */
function resTxCount(row, c) {
  var id = resVal(row, c.id);
  if (!id || !(CBA.data && CBA.data.getTransactions)) return 0;
  return CBA.data.getTransactions().filter(function (t) {
    return String(t.familyId || "").trim() === id;
  }).length;
}

/* ==========================================================================
   התנגשויות בטבלה (2026-08-07)
   --------------------------------------------------------------------------
   דברים שהגיליון מרשה אבל האפליקציה לא באמת יכולה לחיות איתם. נבדקים על **כל**
   השורות ולא רק על המסוננות, כי התנגשות שמסתתרת מאחורי סינון היא בדיוק זו
   שתפתיע אותך. אם אין התנגשויות — לא מוצג כלום, בלי "הכל תקין" מיותר.
   ========================================================================== */
function resConflicts(rows, c) {
  var out = [];
  var actives = [];
  rows.forEach(function (r, i) { if (resIsActive(r, c)) actives.push({ r: r, i: i }); });

  // 1. שני משקי בית פעילים באותו מספר בית
  if (c.house) {
    var byHouse = {};
    actives.forEach(function (x) {
      var h = resVal(x.r, c.house);
      if (!h) return;
      (byHouse[h] = byHouse[h] || []).push(x);
    });
    Object.keys(byHouse).forEach(function (h) {
      if (byHouse[h].length < 2) return;
      out.push({
        kind: "house", severity: "warn",
        title: "בית " + h + " — " + byHouse[h].length + " משפחות פעילות",
        detail: byHouse[h].map(function (x) { return resVal(x.r, c.family) || "ללא שם"; }).join(" · "),
        targets: byHouse[h].map(function (x) { return x.i; })
      });
    });
  }

  // 2. אותו מייל בשתי שורות — חמור, כי המייל הוא מפתח ההתחברות
  var byMail = {};
  rows.forEach(function (r, i) {
    c.email.forEach(function (k) {
      var m = resVal(r, k).toLowerCase();
      if (!m) return;
      (byMail[m] = byMail[m] || []).push(i);
    });
  });
  Object.keys(byMail).forEach(function (m) {
    var idxs = byMail[m].filter(function (v, i, a) { return a.indexOf(v) === i; });
    if (byMail[m].length < 2) return;
    out.push({
      kind: "email", severity: "err",
      title: "המייל " + m + " מופיע פעמיים",
      detail: idxs.map(function (i) {
        return (resVal(rows[i], c.family) || "ללא שם") + (resIsActive(rows[i], c) ? "" : " (עזב)");
      }).join(" · ") + " — ההתחברות תיפול על השורה הראשונה",
      targets: idxs
    });
  });

  // 3. שורה פעילה בלי מזהה קבוע — תנועות לא יוכלו להשתייך אליה
  if (c.id) {
    actives.forEach(function (x) {
      if (resVal(x.r, c.id)) return;
      out.push({
        kind: "noid", severity: "err",
        title: "אין מזהה קבוע ל" + (resVal(x.r, c.family) || "שורה " + (x.i + 2)),
        detail: "בלי מזהה קבוע אי אפשר לשייך לה תנועות. שמירה של השורה תיצור מזהה.",
        targets: [x.i]
      });
    });
  }

  // 4. שורה פעילה בלי שם משפחה
  if (c.family) {
    actives.forEach(function (x) {
      if (resVal(x.r, c.family)) return;
      out.push({
        kind: "noname", severity: "warn",
        title: "שורה " + (x.i + 2) + " בלי שם משפחה",
        detail: "בית " + (resVal(x.r, c.house) || "—"),
        targets: [x.i]
      });
    });
  }

  return out;
}

/* הצ'יפ תמיד צהוב — הוא סימן "יש כאן משהו לבדוק", לא אזעקה. כשיש בתוכו פריטים
   חוסמים (מייל כפול, שורה בלי מזהה) מצורף מונה אדום קטן, כך שדרגת החומרה לא
   הולכת לאיבוד בלי שהפס כולו יתחיל לצרוח. */
function resConflictChip(list) {
  if (!list.length) return "";
  var errs = list.filter(function (x) { return x.severity === "err"; }).length;
  return '<button type="button" class="res-conf-chip" data-res-conf>' +
    '<span class="res-conf-chip__ico">⚠</span>' +
    (list.length === 1 ? "התנגשות אחת" : list.length + " התנגשויות") +
    (errs ? '<span class="res-conf-chip__err">' + errs + ' חוסמות</span>' : "") +
  '</button>';
}

function resOpenConflicts(container, list, c) {
  var old = document.getElementById("res-conf");
  if (old) old.remove();
  var wrap = document.createElement("div");
  wrap.id = "res-conf";
  wrap.className = "peek-backdrop";
  wrap.innerHTML =
    '<div class="peek res-conf" role="dialog" aria-label="התנגשויות בטבלה">' +
      '<div class="peek__head"><span class="peek__title">התנגשויות בטבלת התושבים</span>' +
        '<button class="peek__x" aria-label="סגור">×</button></div>' +
      '<div class="res-conf__body">' +
        '<p class="res-conf__lead">נבדק על כל השורות, גם אלה שמוסתרות כרגע בסינון. ' +
          'לחיצה על שורה פותחת את משק הבית לעריכה.</p>' +
        list.map(function (x, i) {
          return '<button type="button" class="res-conf__item res-conf__item--' + x.severity + '" data-conf="' + i + '">' +
            '<span class="res-conf__t">' + CBA.esc(x.title) + '</span>' +
            '<span class="res-conf__d">' + CBA.esc(x.detail) + '</span>' +
          '</button>';
        }).join("") +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap);
  var close = function () { wrap.remove(); };
  wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
  wrap.querySelector(".peek__x").addEventListener("click", close);
  wrap.querySelectorAll("[data-conf]").forEach(function (b) {
    b.addEventListener("click", function () {
      var x = list[+b.dataset.conf];
      var idx = x.targets[0];
      close();
      resOpenDrawer(container, idx, idx + 2, c);
    });
  });
}

/* המלצת שיוך לבקשת הרשמה: מספר בית זהה הוא האות החזק ביותר, אחריו שם משפחה. */
function resSuggest(signup, rows, c) {
  var house = String(signup.house || "").trim();
  var last = String(signup.lastName || "").trim();
  var out = [];
  rows.forEach(function (r, i) {
    if (!resIsActive(r, c)) return;   // לא מציעים לשייך למשפחה שעזבה
    var score = 0, why = [];
    var rh = resVal(r, c.house), rf = resVal(r, c.family);
    if (house && rh && rh === house) { score += 100; why.push("מספר בית זהה"); }
    if (last && rf) {
      if (rf === last) { score += 60; why.push("שם משפחה זהה"); }
      else if (rf.indexOf(last) !== -1 || last.indexOf(rf) !== -1) { score += 30; why.push("שם משפחה דומה"); }
    }
    var free = c.email.some(function (col) { return !resVal(r, col); });
    if (score > 0 && free) score += 5;
    if (score > 0) out.push({ i: i, row: r, score: score, why: why.join(" · "), free: free });
  });
  out.sort(function (a, b) { return b.score - a.score; });
  return out.slice(0, 5);
}

/* עמודות שהמסך הזה צריך כדי לעבוד במלואו. אם הן חסרות בגיליון — השדות פשוט
   לא מצוירים, כי כל שדה מותנה בקיום העמודה שלו. זה מה שקרה עם "מקצוע" ו"שמות
   ילדים": הפונקציה שיוצרת אותן קיימת בשרת מאז ההתחלה, אבל אף אחד לא קרא לה,
   ולכן הן לא נוצרו והשדות לא הופיעו. עכשיו המסך מוודא אותן בטעינה הראשונה. */
var RES_NEEDED_COLS = ["מקצוע 1", "מקצוע 2", "שמות ילדים", "הערות"];
var resColsChecked = false;

function resMissingCols(headers) {
  var have = headers.map(function (h) { return String(h).trim(); });
  return RES_NEEDED_COLS.filter(function (c) { return have.indexOf(c) === -1; });
}

/* יצירה חד-פעמית ואידמפוטנטית. רצה רק אם באמת חסר משהו, ורק פעם אחת בכל
   טעינת דף, כדי שלא ייווצר לולאה של יצירה-רענון-יצירה. */
function resEnsureCols(container, cb) {
  if (resColsChecked) { cb(); return; }
  resColsChecked = true;
  var missing = resMissingCols(resState.headers);
  var needPerm = resState.headers.every(function (h) { return String(h).indexOf("הרשאות") === -1; });
  if (!missing.length && !(needPerm && resIAmSuper())) { cb(); return; }

  var jobs = 0;
  var fin = function () { if (--jobs === 0) { if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsEnsureCols"); cb(true); } };
  if (missing.length) jobs++;
  if (needPerm && resIAmSuper()) jobs++;
  if (!jobs) { cb(); return; }
  if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsEnsureCols");
  if (missing.length) CBA.data.ensureResidentCols(fin);
  if (needPerm && resIAmSuper()) CBA.data.ensurePermissionCols(fin);
}

function resLoad(container) {
  if (resState.loading) return;
  resState.loading = true;
  resState.error = null;
  var pending = 2;
  var done = function () {
    if (--pending === 0) {
      resState.loading = false; resState.loaded = true;
      // אם היו עמודות חסרות — יוצרים אותן ואז טוענים שוב, כדי שהשדות החדשים
      // (מקצוע, שמות ילדים, הערות) יופיעו מיד ולא רק ברענון הבא
      resEnsureCols(container, function (created) {
        if (created) {
          resState.loaded = false;
          CBA.data.refreshResidents(function () { resLoad(container); });
          return;
        }
        CBA.screens.residents.render(container);
      });
    }
  };
  CBA.data.getResidents(function (res) {
    if (res && res.ok) {
      resState.rows = res.rows || [];
      resState.headers = res.headers || (resState.rows[0] ? Object.keys(resState.rows[0]) : []);
    } else {
      resState.error = (res && res.error) || "לא הצלחנו לטעון את רשימת התושבים";
    }
    done();
  });
  CBA.data.listSignups(function (res) {
    if (res && res.ok) resState.signups = res.rows || [];
    done();
  });
}

CBA.screens.residents = {
  title: "תושבים",

  render: function (container) {
    var st = resState;
    resContainerRef = container; // ר' ensureResRoleIndex — כתיבה לרפרנס חי בלבד ברענון אסינכרוני
    ensureResRoleIndex(); // חיווי "תפקיד בוועד" (סעיף 8) — נטען פעם אחת, מטמון נפרד מ-resState
    // נשמר לפני שה-innerHTML נדרס (ר' ההערה ליד resScrollTop), ומוחזר בסוף הפונקציה
    var prevList = container.querySelector(".tx-list");
    if (prevList) resScrollTop = prevList.scrollTop;
    resWinScrollY = window.scrollY || 0;
    // ערכי ה-<select> שנבחרו ידנית בכרטיסי "בקשות הרשמה ממתינות", לפי מזהה הבקשה —
    // בלי זה, כל render() (כולל רענון רקע שקט) היה מאפס בחירה שהמשתמש כבר עשה.
    var prevSignupSel = {};
    container.querySelectorAll("[data-signup]").forEach(function (box) {
      var sel = box.querySelector(".res-su__sel");
      if (sel) prevSignupSel[box.dataset.signup] = sel.value;
    });

    if (!st.loaded && !st.loading) resLoad(container);

    if (st.loading && !st.loaded) {
      container.innerHTML = '<div class="card res-msg">טוען רשימת תושבים…</div>';
      return;
    }
    if (st.error) {
      container.innerHTML = '<div class="card res-msg">' + CBA.esc(st.error) +
        '<div><button class="btn-ghost btn-sm" data-res-retry>נסה שוב</button></div></div>';
      var rb = container.querySelector("[data-res-retry]");
      if (rb) rb.addEventListener("click", function () { st.loaded = false; resLoad(container); });
      return;
    }

    var c = resCols(st.headers);
    var pending = st.signups.filter(function (s) { return String(s.status).trim() === "ממתין"; });
    var q = st.q.trim();

    var visible = st.rows.filter(function (r) {
      if (st.filter === "active" && !resIsActive(r, c)) return false;
      if (st.filter === "left" && resIsActive(r, c)) return false;
      if (!q) return true;
      var hay = [resVal(r, c.family), resVal(r, c.house)]
        .concat(c.firstName.map(function (k) { return resVal(r, k); }))
        .concat(c.email.map(function (k) { return resVal(r, k); }))
        .concat(c.kids ? [resVal(r, c.kids)] : [])
        .join(" ");
      return hay.indexOf(q) !== -1;
    });

    visible = resSortRows(visible, c);
    var conflicts = resConflicts(st.rows, c);
    resState.conflicts = conflicts;
    var activeCount = st.rows.filter(function (r) { return resIsActive(r, c); }).length;
    // מספרי השורות בגיליון של מה שמוצג כרגע — הייצוא מציע לכבד את הסינון והחיפוש
    resState.visibleRowIndexes = visible.map(function (r) { return st.rows.indexOf(r) + 2; });

    container.innerHTML =
      (pending.length ? resSignupsHTML(pending, st.rows, c) : "") +
      '<div class="tx-bar">' +
        '<div class="tx-filters">' +
          '<div class="seg seg--view">' +
            resTab("active", "פעילים", activeCount) +
            resTab("left", "עזבו", st.rows.length - activeCount) +
            resTab("all", "הכל", st.rows.length) +
          '</div>' +
          '<input class="tx-search" id="res-q" placeholder="חיפוש שם, משפחה, בית, מייל או ילדים" value="' + CBA.esc(st.q) + '">' +
        '</div>' +
        '<div class="tx-actions">' +
          '<div class="tx-summary"><span>מוצגים</span> <b>' + visible.length + '</b> <span class="tx-summary__count">· מתוך ' + st.rows.length + ' משקי בית</span></div>' +
          resConflictChip(conflicts) +
          '<button class="btn-primary btn-sm" data-res-add>הוספת משפחות</button>' +
          '<button class="btn-ghost btn-sm" data-res-export>ייצוא לגיליון</button>' +
          '<button class="btn-ghost btn-sm" data-res-reload>רענן</button>' +
        '</div>' +
      '</div>' +
      '<div class="card tx-card" style="--tx-cols: 62px .95fr 1.05fr .95fr 1.05fr 1.15fr 68px 118px 72px">' +
        '<div class="tx-head">' +
          resHeadCell("house", "בית") + resHeadCell("family", "משפחה") +
          resHeadCell("people", "דיירים") + '<div>מקצוע</div>' + '<div>ילדים</div>' +
          '<div>אימייל</div>' +
          resHeadCell("tx", "תנועות") + '<div>הרשאות</div>' + resHeadCell("status", "סטטוס") +
        '</div>' +
        (visible.length
          ? '<div class="tx-list">' + visible.map(function (r) {
              return resRowHTML(r, c, st.rows.indexOf(r));
            }).join("") + '</div>'
          : '<div class="res-msg">לא נמצאו תושבים בסינון הזה</div>') +
      '</div>' +
      resMobileHTML(visible, c);

    // שחזור מיקום הגלילה + הבחירות בבקשות ההרשמה הממתינות (ר' ההערות למעלה)
    var listEl = container.querySelector(".tx-list");
    if (listEl && resScrollTop) listEl.scrollTop = resScrollTop;
    if (resWinScrollY) window.scrollTo(0, resWinScrollY);
    resScrollTop = 0; resWinScrollY = 0;
    container.querySelectorAll("[data-signup]").forEach(function (box) {
      var prevVal = prevSignupSel[box.dataset.signup];
      if (prevVal == null) return;
      var sel = box.querySelector(".res-su__sel");
      if (sel && sel.querySelector('option[value="' + CSS.escape(prevVal) + '"]')) sel.value = prevVal;
    });

    resBind(container, c);
  }
};

/* תגיות ההרשאה בשורת הטבלה. "תושב" מוצג עמום כי הוא ברירת המחדל של כולם. */
function resPermBadges(row, c) {
  var ps = resRowPerms(row, c);
  if (!ps.length) return '<span class="res-dim">תושב</span>';
  if (ps.indexOf("על") !== -1) return '<span class="badge badge--ready">מנהל על</span>';
  return ps.map(function (p) {
    return '<span class="badge res-perm-badge" title="' + CBA.esc(resPermLabel(p)) + '">' + CBA.esc(p) + '</span>';
  }).join("");
}

function resTab(key, label, n) {
  return '<button type="button" class="seg__opt' + (resState.filter === key ? " is-active" : "") +
    '" data-res-filter="' + key + '">' + label + ' <span class="res-n">' + n + '</span></button>';
}

function resRowHTML(r, c, idx) {
  var names = c.firstName.map(function (k) { return resVal(r, k); }).filter(Boolean).join(" · ");
  var emails = c.email.map(function (k) { return resVal(r, k); }).filter(Boolean);
  var active = resIsActive(r, c);
  var n = resTxCount(r, c);
  // rowIndex בגיליון: שורת כותרת = 1, ולכן פריט i במערך = שורה i+2
  // מקצועות ושמות ילדים (2026-08-07) — שתי עמודות משלהן, כי זו בדיוק הסיבה
  // שממלאים אותן: לדעת מי גר איפה, במה הוא עוסק ומי הילדים.
  var prof = c.profession.map(function (k) { return resVal(r, k); }).filter(Boolean).join(" · ");
  var kids = resVal(r, c.kids);
  // חיווי "תפקיד בוועד" (סעיף 8) — מואפר, לקריאה בלבד; ר' resRoleLine למעלה.
  var roleLine = resRoleLine(c.firstName.map(function (k) { return resVal(r, k); }).filter(Boolean), resVal(r, c.family), resVal(r, c.id));
  return '<div class="tx-row res-row' + (active ? "" : " is-left") + '" data-res-row="' + (idx + 2) + '" data-res-idx="' + idx + '">' +
    '<div class="tx-c">' + CBA.esc(resVal(r, c.house) || "—") + '</div>' +
    '<div class="tx-c res-fam">' + CBA.esc(resVal(r, c.family) || "—") + '</div>' +
    '<div class="tx-c" title="' + CBA.esc(names) + '">' + CBA.esc(names || "—") +
      (roleLine ? '<div class="res-role-hint" title="תפקיד בוועד השיכון — עריכה רק דרך עץ הוועד">' + CBA.esc(roleLine) + '</div>' : "") +
    '</div>' +
    '<div class="tx-c res-soft" title="' + CBA.esc(prof) + '">' + (prof ? CBA.esc(prof) : '<span class="res-dim">—</span>') + '</div>' +
    '<div class="tx-c res-soft" title="' + CBA.esc(kids) + '">' + (kids ? CBA.esc(kids) : '<span class="res-dim">—</span>') + '</div>' +
    '<div class="tx-c res-mail" title="' + CBA.esc(emails.join(", ")) + '">' +
      (emails.length ? CBA.esc(emails.join(", ")) : '<span class="res-dim">אין מייל</span>') + '</div>' +
    '<div class="tx-c">' + (n ? '<span class="res-n res-n--tx" title="תנועות המשויכות למשק הבית">' + n + '</span>' : '<span class="res-dim">—</span>') + '</div>' +
    '<div class="tx-c res-c-perm">' + resPermBadges(r, c) + '</div>' +
    '<div class="tx-c">' + (active ? '<span class="badge badge--paid">פעיל</span>' : '<span class="badge">עזב</span>') + '</div>' +
  '</div>';
}

/* ---------- רשימת כרטיסים למובייל (2026-08-07) ----------
   טבלת 7 עמודות לא קריאה ב-390px, ובנוסף mobile.css מסתיר את .tx-card לגמרי
   (הוא נכתב עבור מסך ההוצאות, שמחליף את הטבלה ברשימה). לכן מסך התושבים מצייר
   גם רשימת כרטיסים משלו — אותה שפה של .tx-mrow בהוצאות — וה-CSS בוחר מי מהם
   מוצג. שתי התצוגות נשענות על אותו מערך מסונן וממוין, כך שאין הבדל בתוכן. */
function resMobileHTML(list, c) {
  if (!list.length) return '<div class="card res-msg">לא נמצאו תושבים בסינון הזה</div>';
  return '<div class="res-mlist">' + list.map(function (r) {
    var idx = resState.rows.indexOf(r);
    var names = c.firstName.map(function (k) { return resVal(r, k); }).filter(Boolean).join(" · ");
    var active = resIsActive(r, c);
    var n = resTxCount(r, c);
    var perms = resRowPerms(r, c);
    // מקצוע וילדים בשורה שלישית — במובייל אין עמודות, אבל המידע לא צריך להיעלם
    var prof = c.profession.map(function (k) { return resVal(r, k); }).filter(Boolean).join(" · ");
    var kids = resVal(r, c.kids);
    var extra = [prof, kids ? "ילדים: " + kids : ""].filter(Boolean).join("  ·  ");
    var roleLine = resRoleLine(c.firstName.map(function (k) { return resVal(r, k); }).filter(Boolean), resVal(r, c.family), resVal(r, c.id));
    return '<button type="button" class="res-mcard' + (active ? "" : " is-left") + '" ' +
        'data-res-row="' + (idx + 2) + '" data-res-idx="' + idx + '">' +
      '<span class="res-mcard__house">' + CBA.esc(resVal(r, c.house) || "—") + '</span>' +
      '<span class="res-mcard__main">' +
        '<span class="res-mcard__fam">' + CBA.esc(resVal(r, c.family) || "ללא שם") + '</span>' +
        '<span class="res-mcard__ppl">' + CBA.esc(names || "אין דיירים רשומים") + '</span>' +
        (roleLine ? '<span class="res-role-hint" title="תפקיד בוועד השיכון — עריכה רק דרך עץ הוועד">' + CBA.esc(roleLine) + '</span>' : "") +
        (extra ? '<span class="res-mcard__extra">' + CBA.esc(extra) + '</span>' : "") +
      '</span>' +
      '<span class="res-mcard__side">' +
        (active ? "" : '<span class="badge">עזב</span>') +
        (perms.length
          ? '<span class="badge badge--ready">' + CBA.esc(perms.indexOf("על") !== -1 ? "מנהל על" : perms.join(" · ")) + '</span>'
          : "") +
        (n ? '<span class="res-n res-n--tx">' + n + '</span>' : "") +
      '</span>' +
    '</button>';
  }).join("") + '</div>';
}

function resSignupsHTML(list, rows, c) {
  return '<div class="card res-signups">' +
    '<div class="res-signups__t">בקשות הרשמה ממתינות <span class="res-n res-n--warn">' + list.length + '</span></div>' +
    list.map(function (s) {
      var sug = resSuggest(s, rows, c);
      var best = sug[0];
      var opts = sug.map(function (x) {
        return '<option value="' + (x.i + 2) + '">' +
          CBA.esc((resVal(x.row, c.family) || "ללא שם") + " · בית " + (resVal(x.row, c.house) || "—")) +
          (x.free ? "" : " (אין משבצת מייל פנויה)") + '</option>';
      }).join("");
      return '<div class="res-su" data-signup="' + CBA.esc(s.id) + '">' +
        '<div class="res-su__who">' +
          '<b>' + CBA.esc(s.firstName + " " + s.lastName) + '</b>' +
          '<span class="res-dim">' + CBA.esc(s.email) + ' · בית ' + CBA.esc(s.house || "—") +
            (s.phone ? ' · ' + CBA.esc(s.phone) : "") + '</span>' +
        '</div>' +
        '<div class="res-su__match">' +
          (best
            ? '<span class="res-dim">מומלץ: <b>' + CBA.esc(resVal(best.row, c.family) || "—") + '</b> — ' + CBA.esc(best.why) + '</span>'
            : '<span class="res-warn">לא נמצאה משפחה מתאימה</span>') +
          '<select class="field-input res-su__sel">' + opts +
            '<option value="new">— פתח משק בית חדש —</option></select>' +
        '</div>' +
        '<div class="res-su__acts">' +
          '<button class="btn-approve" data-su-ok="' + CBA.esc(s.id) + '">אשר</button>' +
          '<button class="btn-reject" data-su-no="' + CBA.esc(s.id) + '">דחה</button>' +
        '</div>' +
      '</div>';
    }).join("") +
  '</div>';
}

function resBind(container, c) {
  container.querySelectorAll("[data-res-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      resState.filter = b.dataset.resFilter;
      CBA.screens.residents.render(container);
    });
  });
  var qEl = container.querySelector("#res-q");
  if (qEl) qEl.addEventListener("input", function () {
    resState.q = qEl.value;
    var pos = qEl.selectionStart;
    CBA.screens.residents.render(container);
    var again = container.querySelector("#res-q");
    if (again) { again.focus(); again.setSelectionRange(pos, pos); }
  });
  var rl = container.querySelector("[data-res-reload]");
  if (rl) rl.addEventListener("click", function () {
    resState.loaded = false;
    CBA.data.refreshResidents(function () { resLoad(container); });
  });
  var ex = container.querySelector("[data-res-export]");
  if (ex) ex.addEventListener("click", function () { resOpenExport(c); });
  var ad = container.querySelector("[data-res-add]");
  if (ad) ad.addEventListener("click", function () { resOpenAdd(container, c); });
  var cf = container.querySelector("[data-res-conf]");
  if (cf) cf.addEventListener("click", function () {
    resOpenConflicts(container, resState.conflicts || [], c);
  });

  container.querySelectorAll("[data-res-sort]").forEach(function (h) {
    h.addEventListener("click", function () {
      var k = h.dataset.resSort;
      // לחיצה חוזרת על אותה עמודה הופכת את הכיוון; עמודה חדשה מתחילה מעולה
      if (resState.sort === k) resState.dir = -resState.dir;
      else { resState.sort = k; resState.dir = 1; }
      CBA.screens.residents.render(container);
    });
  });

  container.querySelectorAll("[data-res-row]").forEach(function (row) {
    row.addEventListener("click", function () {
      resOpenDrawer(container, parseInt(row.dataset.resIdx, 10), parseInt(row.dataset.resRow, 10), c);
    });
  });

  container.querySelectorAll("[data-su-ok]").forEach(function (b) {
    b.addEventListener("click", function () {
      var box = b.closest("[data-signup]");
      var sel = box.querySelector(".res-su__sel");
      var val = sel ? sel.value : "";
      if (!val) { window.alert("בחר משפחה לשיוך"); return; }
      var payload = val === "new" ? { id: b.dataset.suOk, newFamily: true }
                                  : { id: b.dataset.suOk, residentRowIndex: parseInt(val, 10) };
      b.disabled = true; b.textContent = "מאשר…";
      // approveSignup/rejectSignup עוברים ב-postRead (לא push) — לא נספרים
      // אוטומטית ב-inFlightWrites, אז מסמנים ידנית (ר' מדיניות רענון נתונים).
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSignup");
      CBA.data.approveSignup(payload, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSignup");
        if (!res || !res.ok) {
          b.disabled = false; b.textContent = "אשר";
          window.alert("האישור נכשל: " + ((res && res.error) || "שגיאה"));
          return;
        }
        resState.loaded = false;
        CBA.data.refreshResidents(function () { resLoad(container); });
      });
    });
  });
  container.querySelectorAll("[data-su-no]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (!window.confirm("לדחות את בקשת ההרשמה?")) return;
      b.disabled = true;
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSignup");
      CBA.data.rejectSignup(b.dataset.suNo, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSignup");
        if (!res || !res.ok) { b.disabled = false; window.alert("הדחייה נכשלה"); return; }
        resState.loaded = false; resLoad(container);
      });
    });
  });
}

/* ==========================================================================
   הוספת משקי בית — גריד בסגנון אקסל (2026-08-07)
   --------------------------------------------------------------------------
   כפתור אחד לשתי המשימות: משפחה אחת ממולאת בשורה הריקה שנפתחת מאליה, וחמישים
   מודבקות מאקסל ב-Ctrl+V. אין "צור משפחה" נפרד — זה אותו דבר בגודל אחר.

   הכל כאן הוא **יצירה בלבד**. שורה קיימת אף פעם לא נכתבת מחדש, חוץ ממקרה אחד
   מוצהר: כשמספר הבית כבר תפוס ואתה מאשר שהדיירים הקודמים עזבו — אז הם מסומנים
   "עזב" והמשפחה החדשה מקבלת שורה ומזהה קבוע משלה, וההיסטוריה הכספית נשארת
   אצל מי שבאמת הוציא אותה.
   ========================================================================== */

/* העמודות הקבועות של הגריד — בדיוק הפריסט של הייצוא. resKey הוא איך למצוא את
   שם העמודה האמיתי בגיליון, שעשוי להשתנות בין "משפחה" ל"שם משפחה" וכו'. */
function resAddColumns(c) {
  var base = [
    { col: c.family,       label: "שם משפחה", w: "1.2fr", required: true },
    { col: c.house,        label: "בית",      w: "70px" },
    { col: c.firstName[0], label: "שם פרטי 1", w: "1fr" },
    { col: c.phone[0],     label: "טלפון 1",   w: "1fr" },
    { col: c.firstName[1], label: "שם פרטי 2", w: "1fr" },
    { col: c.phone[1],     label: "טלפון 2",   w: "1fr" },
    { col: c.kids,         label: "שמות ילדים", w: "1.2fr" }
  ].filter(function (x) { return x.col; });
  var extra = [
    { col: c.email[0],      label: "אימייל 1", w: "1.3fr", email: true },
    { col: c.email[1],      label: "אימייל 2", w: "1.3fr", email: true },
    { col: c.profession[0], label: "מקצוע 1",  w: "1fr" },
    { col: c.profession[1], label: "מקצוע 2",  w: "1fr" },
    { col: c.notes,         label: "הערות",    w: "1.2fr" }
  ].filter(function (x) { return x.col; });
  return { base: base, extra: extra };
}

var resAddState = null;   // { cells: [[...]], expanded: bool, cols: [...] }

/* בדיקה חיה של שורה אחת. מחזיר { level, text, houseRowIndex } —
   level: "" תקין · "warn" אזהרה שאפשר להמשיך איתה · "err" חוסם. */
function resAddCheck(rowVals, cols, rowIdx, c) {
  var get = function (label) {
    for (var i = 0; i < cols.length; i++) if (cols[i].label === label) return String(rowVals[i] || "").trim();
    return "";
  };
  var empty = rowVals.every(function (v) { return !String(v || "").trim(); });
  if (empty) return { level: "empty", text: "" };

  if (!get("שם משפחה")) return { level: "err", text: "חסר שם משפחה" };

  // מייל תפוס אצל תושב אחר — חוסם, כי המייל הוא מפתח ההתחברות
  var mails = ["אימייל 1", "אימייל 2"].map(get).filter(Boolean);
  for (var m = 0; m < mails.length; m++) {
    var mail = mails[m].toLowerCase();
    if (mail.indexOf("@") === -1) return { level: "err", text: "כתובת מייל לא תקינה: " + mails[m] };
    var clash = null;
    resState.rows.forEach(function (r) {
      c.email.forEach(function (k) { if (String(resVal(r, k)).toLowerCase() === mail) clash = resVal(r, c.family); });
    });
    if (clash) return { level: "err", text: "המייל " + mails[m] + " כבר משויך למשפחת " + clash };
  }

  // מייל שחוזר פעמיים בתוך ההדבקה עצמה
  var seen = {};
  for (var i2 = 0; i2 < resAddState.cells.length; i2++) {
    if (i2 === rowIdx) continue;
    cols.forEach(function (cc, ci) {
      if (!cc.email) return;
      var v = String(resAddState.cells[i2][ci] || "").trim().toLowerCase();
      if (v) seen[v] = i2 + 1;
    });
  }
  for (var m2 = 0; m2 < mails.length; m2++) {
    if (seen[mails[m2].toLowerCase()]) {
      return { level: "err", text: "המייל " + mails[m2] + " מופיע גם בשורה " + seen[mails[m2].toLowerCase()] };
    }
  }

  // מספר בית תפוס — אזהרה עם החלטה: האם הדיירים הקודמים עזבו
  var house = get("בית");
  if (house) {
    var occ = null, occIdx = -1;
    resState.rows.forEach(function (r, i) {
      if (occ) return;
      if (resIsActive(r, c) && String(resVal(r, c.house)) === house) { occ = r; occIdx = i; }
    });
    if (occ) {
      return {
        level: "warn", houseRowIndex: occIdx + 2,
        text: "בבית " + house + " רשומה כרגע משפחת " + (resVal(occ, c.family) || "—") +
              " (" + resTxCount(occ, c) + " תנועות)"
      };
    }
  }
  return { level: "ok", text: "" };
}

function resOpenAdd(container, c) {
  var old = document.getElementById("res-add");
  if (old) old.remove();

  var sets = resAddColumns(c);
  resAddState = { expanded: false, cells: [], cols: sets.base.slice(), decisions: {} };
  var BLANK_ROWS = 1;

  function activeCols() { return resAddState.expanded ? sets.base.concat(sets.extra) : sets.base; }
  function blankRow() { return activeCols().map(function () { return ""; }); }
  function ensureTrailingBlank() {
    var cells = resAddState.cells;
    var last = cells[cells.length - 1];
    if (!last || last.some(function (v) { return String(v || "").trim(); })) cells.push(blankRow());
  }
  for (var i = 0; i < BLANK_ROWS; i++) resAddState.cells.push(blankRow());

  var wrap = document.createElement("div");
  wrap.id = "res-add";
  wrap.className = "peek-backdrop";
  document.body.appendChild(wrap);

  function gridHTML() {
    var cols = activeCols();
    var tmpl = "44px " + cols.map(function (x) { return x.w; }).join(" ") + " 22px";
    return '<div class="peek res-add" role="dialog" aria-label="הוספת משקי בית">' +
      '<div class="peek__head"><span class="peek__title">הוספת משקי בית</span>' +
        '<button class="peek__x" aria-label="סגור">×</button></div>' +

      '<div class="res-add__hint">' +
        // הסבר ההדבקה רלוונטי רק במחשב — במובייל אין Ctrl+V ואין אקסל פתוח לצידך
        '<span class="res-add__paste">אפשר למלא ידנית, או להעתיק טווח מאקסל וללחוץ <b>Ctrl+V</b> ' +
          'על התא שממנו מתחילים — השורות והעמודות ייפרסו לבד.</span>' +
        '<span class="res-add__mob">מוסיפים משפחה אחת בכל שורה. להדבקה של רשימה שלמה מאקסל — עדיף ממחשב.</span>' +
        '<button type="button" class="btn-link" data-ra-expand>' +
          (resAddState.expanded ? "פחות עמודות" : "עוד עמודות") + '</button>' +
      '</div>' +

      '<div class="res-add__scroll">' +
        '<div class="res-grid" style="--ra-cols: ' + tmpl + '">' +
          '<div class="res-grid__head">' +
            '<div class="res-grid__n">#</div>' +
            cols.map(function (x) {
              return '<div class="res-grid__h' + (x.required ? " is-req" : "") + '">' + CBA.esc(x.label) + '</div>';
            }).join("") +
            '<div></div>' +
          '</div>' +
          '<div class="res-grid__body" id="ra-body"></div>' +
        '</div>' +
      '</div>' +

      '<div class="res-add__foot">' +
        '<div class="res-add__stats" id="ra-stats"></div>' +
        '<div class="res-add__acts">' +
          '<button type="button" class="btn-ghost" data-ra-close>ביטול</button>' +
          '<button type="button" class="btn-primary" id="ra-go">צור</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function rowsHTML() {
    var cols = activeCols();
    return resAddState.cells.map(function (row, ri) {
      var chk = resAddCheck(row, cols, ri, c);
      var cls = chk.level === "err" ? " is-err" : (chk.level === "warn" ? " is-warn" : "");
      var note = "";
      if (chk.level === "err") {
        note = '<div class="res-grid__note res-grid__note--err">' + CBA.esc(chk.text) + '</div>';
      } else if (chk.level === "warn") {
        var dec = resAddState.decisions[ri] || "left";
        note = '<div class="res-grid__note res-grid__note--warn">' + CBA.esc(chk.text) +
          '<select class="res-grid__dec" data-ra-dec="' + ri + '">' +
            '<option value="left"' + (dec === "left" ? " selected" : "") + '>הקודמים עזבו — סמן אותם "עזב"</option>' +
            '<option value="keep"' + (dec === "keep" ? " selected" : "") + '>להשאיר את שניהם פעילים</option>' +
          '</select></div>';
      }
      return '<div class="res-grid__row' + cls + '" data-ra-row="' + ri + '">' +
          '<div class="res-grid__n">' + (ri + 1) + '</div>' +
          cols.map(function (x, ci) {
            return '<input class="res-grid__c" data-ra-r="' + ri + '" data-ra-c="' + ci + '" ' +
              'value="' + CBA.esc(row[ci] || "") + '" autocomplete="off">';
          }).join("") +
          '<button type="button" class="res-grid__del" data-ra-del="' + ri + '" aria-label="מחק שורה">×</button>' +
        '</div>' + note;
    }).join("");
  }

  function stats() {
    var cols = activeCols(), ok = 0, warn = 0, err = 0;
    resAddState.cells.forEach(function (row, ri) {
      var l = resAddCheck(row, cols, ri, c).level;
      if (l === "ok") ok++; else if (l === "warn") { ok++; warn++; } else if (l === "err") err++;
    });
    return { ok: ok, warn: warn, err: err };
  }

  function paint(focus) {
    ensureTrailingBlank();
    wrap.querySelector("#ra-body").innerHTML = rowsHTML();
    var s = stats();
    var st = wrap.querySelector("#ra-stats");
    st.innerHTML =
      '<b>' + s.ok + '</b> שורות מוכנות' +
      (s.warn ? ' <span class="res-warnx">· ' + s.warn + ' עם בית תפוס</span>' : "") +
      (s.err ? ' <span class="res-errx">· ' + s.err + ' עם שגיאה</span>' : "");
    wrap.querySelector("#ra-go").disabled = !s.ok;
    wrap.querySelector("#ra-go").textContent = s.ok > 1 ? ("צור " + s.ok + " משקי בית") : "צור";
    if (focus) {
      var el = wrap.querySelector('[data-ra-r="' + focus[0] + '"][data-ra-c="' + focus[1] + '"]');
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  }

  function draw(focus) {
    wrap.innerHTML = gridHTML();
    bind();
    paint(focus);
  }

  function close() { wrap.remove(); document.removeEventListener("keydown", esc); resAddState = null; }
  function esc(e) { if (e.key === "Escape" && document.getElementById("res-add")) close(); }
  document.addEventListener("keydown", esc);
  wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });

  function bind() {
    wrap.querySelector(".peek__x").addEventListener("click", close);
    wrap.querySelector("[data-ra-close]").addEventListener("click", close);
    wrap.querySelector("[data-ra-expand]").addEventListener("click", function () {
      // שומרים את מה שכבר הוקלד ומרחיבים/מצמצמים את מספר העמודות
      var oldCols = activeCols();
      var keep = resAddState.cells.map(function (row) {
        var o = {}; oldCols.forEach(function (x, i) { o[x.label] = row[i]; }); return o;
      });
      resAddState.expanded = !resAddState.expanded;
      var newCols = activeCols();
      resAddState.cells = keep.map(function (o) {
        return newCols.map(function (x) { return o[x.label] || ""; });
      });
      draw();
    });

    var body = wrap.querySelector("#ra-body");

    body.addEventListener("input", function (e) {
      var el = e.target.closest("[data-ra-r]"); if (!el) return;
      resAddState.cells[+el.dataset.raR][+el.dataset.raC] = el.value;
      paint([+el.dataset.raR, +el.dataset.raC]);
    });

    body.addEventListener("change", function (e) {
      var d = e.target.closest("[data-ra-dec]"); if (!d) return;
      resAddState.decisions[+d.dataset.raDec] = d.value;
    });

    body.addEventListener("click", function (e) {
      var del = e.target.closest("[data-ra-del]"); if (!del) return;
      var i = +del.dataset.raDel;
      resAddState.cells.splice(i, 1);
      delete resAddState.decisions[i];
      if (!resAddState.cells.length) resAddState.cells.push(blankRow());
      paint();
    });

    /* הדבקה מאקסל — הלב של המסך. הלוח מגיע כ-TSV: טאב בין עמודות, שורה חדשה
       בין שורות. פורסים אותו החל מהתא שבו עומדים, ומרחיבים את מספר השורות
       לפי הצורך. ההדבקה גם מנקה מרכאות עוטפות שאקסל מוסיף לתאים עם פסיקים. */
    body.addEventListener("paste", function (e) {
      var el = e.target.closest("[data-ra-r]"); if (!el) return;
      var text = (e.clipboardData || window.clipboardData).getData("text");
      if (!text) return;
      if (text.indexOf("\t") === -1 && text.indexOf("\n") === -1) return;   // ערך בודד — התנהגות רגילה
      e.preventDefault();
      var r0 = +el.dataset.raR, c0 = +el.dataset.raC;
      var cols = activeCols();
      var lines = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n");
      lines.forEach(function (line, li) {
        var parts = line.split("\t");
        var ri = r0 + li;
        while (resAddState.cells.length <= ri) resAddState.cells.push(blankRow());
        parts.forEach(function (v, pi) {
          var ci = c0 + pi;
          if (ci >= cols.length) return;   // גלישה מעבר לעמודה האחרונה — מתעלמים
          resAddState.cells[ri][ci] = String(v).trim().replace(/^"(.*)"$/, "$1");
        });
      });
      paint([r0, c0]);
    });

    /* ניווט מקלדת כמו בגיליון: Enter יורד שורה, חצים למעלה/למטה מדלגים בין
       שורות באותה עמודה. Tab עובד לבד. */
    body.addEventListener("keydown", function (e) {
      var el = e.target.closest("[data-ra-r]"); if (!el) return;
      var r = +el.dataset.raR, ci = +el.dataset.raC, nr = null;
      if (e.key === "Enter" || e.key === "ArrowDown") nr = r + 1;
      else if (e.key === "ArrowUp") nr = r - 1;
      else return;
      e.preventDefault();
      if (nr < 0) return;
      while (resAddState.cells.length <= nr) resAddState.cells.push(blankRow());
      paint([nr, ci]);
    });

    wrap.querySelector("#ra-go").addEventListener("click", submit);
  }

  function submit() {
    var cols = activeCols();
    var payload = [], willMark = [];
    resAddState.cells.forEach(function (row, ri) {
      var chk = resAddCheck(row, cols, ri, c);
      if (chk.level !== "ok" && chk.level !== "warn") return;
      var values = {};
      cols.forEach(function (x, ci) {
        var v = String(row[ci] || "").trim();
        if (v) values[x.col] = v;
      });
      var mark = null;
      if (chk.level === "warn" && (resAddState.decisions[ri] || "left") === "left") {
        mark = chk.houseRowIndex;
        willMark.push(chk.text);
      }
      payload.push({ values: values, markLeftRowIndex: mark });
    });
    if (!payload.length) return;

    var msg = payload.length + " משקי בית חדשים ייווצרו, כל אחד עם מזהה קבוע משלו.";
    if (willMark.length) {
      msg += "\n\nבנוסף, " + willMark.length + ' משקי בית קיימים יסומנו כ"עזבו" ' +
        "(ההיסטוריה הכספית שלהם נשארת אצלם):\n· " + willMark.join("\n· ");
    }
    if (!window.confirm(msg + "\n\nלהמשיך?")) return;

    var go = wrap.querySelector("#ra-go");
    go.disabled = true; go.textContent = "יוצר…";
    if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsCreate");
    CBA.data.createResidents(payload, function (res) {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsCreate");
      if (!res || !res.ok) {
        go.disabled = false; go.textContent = "צור";
        window.alert("היצירה נכשלה: " + ((res && res.error) || "שגיאה"));
        return;
      }
      var extra = (res.rejected && res.rejected.length)
        ? "\n\n" + res.rejected.length + " שורות נדחו בשרת:\n· " +
          res.rejected.map(function (x) { return "שורה " + (x.i + 1) + ": " + x.error; }).join("\n· ")
        : "";
      close();
      resState.loaded = false;
      CBA.data.refreshResidents(function () { resLoad(container); });
      if (extra) window.alert("נוצרו " + res.created + " משקי בית." + extra);
    });
  }

  draw([0, 0]);
}

/* ==========================================================================
   ייצוא לגיליון (2026-08-07)
   --------------------------------------------------------------------------
   בוחרים עמודות בצ'קבוקסים, בוחרים אילו שורות, והשרת יוצר גיליון Google חדש
   מעוצב ומחזיר קישור. הפריסט הוא מה שבאמת שימושי ברוב הפעמים: משפחה, בית,
   שני התושבים, טלפונים ושמות ילדים.
   ========================================================================== */

/* ברירת המחדל של הסימון. מוחזר כמערך שמות עמודות בסדר הנכון לייצוא. */
function resExportPreset(c) {
  var out = [];
  if (c.family) out.push(c.family);
  if (c.house) out.push(c.house);
  c.firstName.forEach(function (k) { out.push(k); });
  c.phone.forEach(function (k) { out.push(k); });
  if (c.kids) out.push(c.kids);
  return out;
}

/* קיבוץ העמודות בחלון, כדי שלא תהיה רשימה שטוחה של 17 תיבות סימון */
function resExportGroups(c, headers) {
  var used = {};
  function take(list) { (list || []).forEach(function (k) { if (k) used[k] = true; }); return (list || []).filter(Boolean); }
  var groups = [
    { t: "משק הבית", cols: take([c.family, c.house, c.id]) },
    { t: "דיירים",   cols: take(c.firstName) },
    { t: "יצירת קשר", cols: take(c.phone.concat(c.email)) },
    { t: "פרטים נוספים", cols: take(c.profession.concat([c.kids, c.notes])) },
    { t: "ניהול",    cols: take(c.perm.concat([c.role, c.status])) }
  ].filter(function (g) { return g.cols.length; });
  // כל מה שלא נכנס לאף קבוצה — שלא ייעלם מהבחירה
  var rest = headers.filter(function (h) { return h && !used[h]; });
  if (rest.length) groups.push({ t: "שאר העמודות", cols: rest });
  return groups;
}

function resOpenExport(c) {
  var old = document.getElementById("res-export");
  if (old) old.remove();

  var st = resState;
  var headers = st.headers.map(function (h) { return String(h).trim(); }).filter(Boolean);
  var preset = resExportPreset(c);
  var groups = resExportGroups(c, headers);
  var shownN = (st.visibleRowIndexes || []).length;
  var filterLabel = st.filter === "active" ? "פעילים" : (st.filter === "left" ? "עזבו" : "הכל");
  var today = new Date();
  var stamp = ("0" + today.getDate()).slice(-2) + "." + ("0" + (today.getMonth() + 1)).slice(-2) + "." + today.getFullYear();

  var wrap = document.createElement("div");
  wrap.id = "res-export";
  wrap.className = "peek-backdrop";
  wrap.innerHTML =
    '<div class="peek res-exp" role="dialog" aria-label="ייצוא לגיליון">' +
      '<div class="peek__head"><span class="peek__title">ייצוא לגיליון</span>' +
        '<button class="peek__x" aria-label="סגור">×</button></div>' +

      '<div class="res-exp__body">' +
        '<div class="form-field"><label>שם הגיליון</label>' +
          '<input class="field-input" id="rx-name" value="' + CBA.esc("תושבים — ייצוא " + stamp) + '"></div>' +

        '<div class="res-exp__scope">' +
          '<label class="res-exp__radio"><input type="radio" name="rx-scope" value="visible" checked>' +
            '<span>רק המוצגים כרגע <b>(' + shownN + ')</b> <span class="res-dim">— סינון "' + CBA.esc(filterLabel) + '"' +
              (st.q.trim() ? ' וחיפוש "' + CBA.esc(st.q.trim()) + '"' : "") + '</span></span></label>' +
          '<label class="res-exp__radio"><input type="radio" name="rx-scope" value="all">' +
            '<span>כל משקי הבית <b>(' + st.rows.length + ')</b></span></label>' +
        '</div>' +

        '<div class="res-exp__cols-h">' +
          '<span>עמודות לייצוא</span>' +
          '<span class="res-exp__quick">' +
            '<button type="button" class="btn-link" data-rx-preset>ברירת מחדל</button>' +
            '<button type="button" class="btn-link" data-rx-all>הכל</button>' +
            '<button type="button" class="btn-link" data-rx-none>נקה</button>' +
          '</span>' +
        '</div>' +

        '<div class="res-exp__cols">' +
          groups.map(function (g) {
            return '<div class="res-exp__grp">' +
              '<div class="res-exp__grp-t">' + CBA.esc(g.t) + '</div>' +
              g.cols.map(function (col) {
                return '<label class="res-exp__opt">' +
                  '<input type="checkbox" data-rx-col="' + CBA.esc(col) + '"' +
                    (preset.indexOf(col) !== -1 ? " checked" : "") + '>' +
                  '<span>' + CBA.esc(col) + '</span></label>';
              }).join("") +
            '</div>';
          }).join("") +
        '</div>' +

        '<div class="res-exp__msg" id="rx-msg" hidden></div>' +
      '</div>' +

      '<div class="res-exp__foot">' +
        '<span class="res-dim" id="rx-count"></span>' +
        '<div class="res-exp__acts">' +
          '<button type="button" class="btn-ghost" data-rx-close>ביטול</button>' +
          '<button type="button" class="btn-primary" id="rx-go">צור גיליון</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(wrap);
  var close = function () { wrap.remove(); document.removeEventListener("keydown", esc); };
  var esc = function (e) { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", esc);
  wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
  wrap.querySelector(".peek__x").addEventListener("click", close);
  wrap.querySelector("[data-rx-close]").addEventListener("click", close);

  var boxes = function () { return [].slice.call(wrap.querySelectorAll("[data-rx-col]")); };
  var chosen = function () {
    // הסדר נקבע לפי סדר העמודות במסך, לא לפי סדר הלחיצות — כדי שהתוצאה צפויה
    return boxes().filter(function (b) { return b.checked; }).map(function (b) { return b.dataset.rxCol; });
  };
  var count = wrap.querySelector("#rx-count");
  var go = wrap.querySelector("#rx-go");
  function sync() {
    var n = chosen().length;
    count.textContent = n ? (n + " עמודות נבחרו") : "לא נבחרה אף עמודה";
    go.disabled = !n;
  }
  wrap.addEventListener("change", sync);
  wrap.querySelector("[data-rx-preset]").addEventListener("click", function () {
    boxes().forEach(function (b) { b.checked = preset.indexOf(b.dataset.rxCol) !== -1; }); sync();
  });
  wrap.querySelector("[data-rx-all]").addEventListener("click", function () {
    boxes().forEach(function (b) { b.checked = true; }); sync();
  });
  wrap.querySelector("[data-rx-none]").addEventListener("click", function () {
    boxes().forEach(function (b) { b.checked = false; }); sync();
  });
  sync();

  var msg = wrap.querySelector("#rx-msg");
  go.addEventListener("click", function () {
    var cols = chosen();
    if (!cols.length) return;
    var scope = wrap.querySelector('[name="rx-scope"]:checked').value;
    var rowIndexes = scope === "visible" ? (st.visibleRowIndexes || []) : [];
    if (scope === "visible" && !rowIndexes.length) {
      msg.hidden = false; msg.className = "res-exp__msg res-exp__msg--err";
      msg.textContent = "אין שורות מוצגות לייצוא."; return;
    }
    go.disabled = true; go.textContent = "יוצר…";
    msg.hidden = false; msg.className = "res-exp__msg";
    msg.textContent = "בונה את הגיליון — זה לוקח כמה שניות.";

    CBA.data.exportResidents({
      columns: cols,
      rowIndexes: rowIndexes,
      name: (wrap.querySelector("#rx-name").value || "").trim(),
      subtitle: (scope === "visible" ? filterLabel : "כל משקי הבית") + " · " + stamp
    }, function (res) {
      go.disabled = false; go.textContent = "צור גיליון";
      if (!res || !res.ok || !res.url) {
        msg.className = "res-exp__msg res-exp__msg--err";
        msg.textContent = "הייצוא נכשל: " + ((res && res.error) || "שגיאה");
        return;
      }
      msg.className = "res-exp__msg res-exp__msg--ok";
      msg.innerHTML = 'הגיליון מוכן — ' + res.rows + ' שורות, ' + res.columns + ' עמודות. ' +
        '<a href="' + CBA.esc(res.url) + '" target="_blank" rel="noopener">פתח את הגיליון</a>';
      window.open(res.url, "_blank", "noopener");
    });
  });
}

/* ---------- חלון עריכת משק בית — אותו drawer כמו במסך ההוצאות ---------- */
function resCloseDrawer() {
  var el = document.getElementById("res-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", resEsc);
}
function resEsc(e) { if (e.key === "Escape") resCloseDrawer(); }

function resOpenDrawer(container, idx, rowIndex, c) {
  resCloseDrawer();
  var r = resState.rows[idx];
  if (!r) return;
  var txN = resTxCount(r, c);
  var origHouse = resVal(r, c.house);
  var rowStableId = c.id ? resVal(r, c.id) : null;
  // איתור מחדש של השורה החיה לפי מזהה קבוע (מדיניות רענון נתונים — ר' תיעוד
  // בזיכרון הפרויקט): אם רענון רקע מחליף את resState.rows בזמן שהמגירה פתוחה
  // (מקרה קצה נדיר), הודעות/ברירות-מחדל בטופס ישתמשו בשורה המעודכנת ולא
  // ברפרנס "יתום" מרגע הפתיחה. rowIndex עצמו יציב (מספר שורה בגיליון) ולא
  // תלוי ברפרנס האובייקט, כך שהשמירה עצמה תמיד תקינה גם בלי זה.
  function freshRow() {
    if (rowStableId) {
      for (var i = 0; i < resState.rows.length; i++) {
        if (resVal(resState.rows[i], c.id) === rowStableId) return resState.rows[i];
      }
    }
    return resState.rows[idx] || r;
  }

  function field(label, col, type) {
    if (!col) return "";
    return '<div class="form-field"><label>' + CBA.esc(label) + '</label>' +
      '<input class="field-input" type="' + (type || "text") + '" data-rf="' + CBA.esc(col) + '" value="' + CBA.esc(resVal(r, col)) + '"></div>';
  }
  function personBlock(i) {
    var parts = [];
    if (c.firstName[i]) parts.push(field("שם פרטי", c.firstName[i]));
    if (c.email[i]) parts.push(field("אימייל", c.email[i], "email"));
    if (c.phone[i]) parts.push(field("טלפון", c.phone[i], "tel"));
    if (c.profession[i]) parts.push(field("מקצוע", c.profession[i]));
    if (!parts.length) return "";
    return '<div class="form-grid">' + parts.join("") + '</div>' + permBlock(i);
  }

  /* בלוק ההרשאות של אדם אחד. גלוי למנהל על בלבד — לשאר המנהלים (למשל מי שמנהל
     תושבים) הוא פשוט לא קיים, כי ניהול הרשאות הוא סמכות של מנהל על. */
  function permBlock(i) {
    var mine = resPermsOf(r, c, i);
    var email = resVal(r, c.email[i]);
    if (!resIAmSuper()) {
      if (!mine.length) return "";
      return '<div class="res-perm-read">הרשאות: ' +
        mine.map(function (p) { return CBA.esc(resPermLabel(p)); }).join(" · ") + '</div>';
    }
    if (!email) {
      return '<div class="res-perm-none">אין אימייל למשבצת הזו — אי אפשר לתת הרשאות עד שיוזן אימייל.</div>';
    }
    // מקופל, בדיוק כמו בלוק "אפשרויות נוספות" בטופס ההוצאה — כדי שהחלון יישאר
    // קומפקטי. הכותרת מספרת את המצב הנוכחי בלי צורך לפתוח.
    var summary = mine.length
      ? (mine.indexOf("על") !== -1 ? "מנהל על" : mine.map(resPermLabel).join(" · "))
      : "תושב רגיל";
    return '<details class="tx-adv res-perm" data-perm-slot="' + (i + 1) + '">' +
      '<summary class="tx-adv__sum">הרשאות של ' +
        CBA.esc(resVal(r, c.firstName[i]) || email) + ' — ' + CBA.esc(summary) + '</summary>' +
      '<div class="tx-adv__body">' +
        RES_PERMS.map(function (pp) {
          return '<label class="res-perm__opt' + (pp.code === "על" ? " res-perm__opt--super" : "") + '">' +
            '<input type="checkbox" data-perm="' + CBA.esc(pp.code) + '"' +
              (mine.indexOf(pp.code) !== -1 ? " checked" : "") + '>' +
            '<span class="res-perm__lbl">' + CBA.esc(pp.label) + '</span>' +
            '<span class="res-perm__hint">' + CBA.esc(pp.hint) + '</span>' +
          '</label>';
        }).join("") +
        '<div class="res-perm__foot">' +
          '<span class="res-dim">בלי סימון כלל — תושב רגיל, רואה רק את סביבת התושב.</span>' +
          '<button type="button" class="btn-ghost btn-sm" data-perm-save="' + (i + 1) + '">שמור הרשאות</button>' +
        '</div>' +
      '</div>' +
    '</details>';
  }

  var overlay = document.createElement("div");
  overlay.id = "res-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-rclose></div>' +
    '<aside class="drawer" role="dialog" aria-label="עריכת משק בית">' +
      '<div class="drawer__head">' +
        '<div class="drawer__title">' + CBA.esc(resVal(r, c.family) || "משק בית") +
          (resVal(r, c.house) ? ' · בית ' + CBA.esc(resVal(r, c.house)) : "") + '</div>' +
        '<button class="drawer__close" data-rclose aria-label="סגור">×</button>' +
      '</div>' +
      '<div class="drawer__body">' +

        '<div class="form-block form-block--first">' +
          '<div class="form-grid">' +
            field("מספר בית", c.house) +
            field("שם משפחה", c.family) +
          '</div>' +
          (txN
            ? '<div class="form-hint res-hint">למשק הבית הזה משויכות <b>' + txN + '</b> תנועות. ' +
              'שינוי מספר הבית מתאים ל<b>מעבר בתוך השיכון</b> — ההיסטוריה נשארת של אותה משפחה. ' +
              'אם נכנסו דיירים אחרים, השתמש ב"החלפת משפחה" למטה במקום לערוך כאן.</div>'
            : '') +
        '</div>' +

        '<div class="form-block">' + personBlock(0) + '</div>' +
        (c.firstName[1] || c.email[1] || c.phone[1] || c.profession[1]
          ? '<div class="form-block">' + personBlock(1) + '</div>' : "") +

        '<div class="form-block">' +
          '<div class="form-grid">' +
            (c.kids ? '<div class="form-field form-field--wide"><label>שמות ילדים</label>' +
              '<input class="field-input" data-rf="' + CBA.esc(c.kids) + '" placeholder="מופרדים בפסיק" value="' + CBA.esc(resVal(r, c.kids)) + '"></div>' : "") +
            (c.notes ? '<div class="form-field form-field--wide"><label>הערות</label>' +
              '<input class="field-input" data-rf="' + CBA.esc(c.notes) + '" value="' + CBA.esc(resVal(r, c.notes)) + '"></div>' : "") +
          '</div>' +
        '</div>' +

        '<div class="form-block">' +
          '<div class="form-grid">' +
            (c.status ? '<div class="form-field"><label>סטטוס</label>' +
              '<select class="field-input" data-rf="' + CBA.esc(c.status) + '">' +
                ["פעיל", "עזב"].map(function (o) {
                  return '<option value="' + o + '"' + ((resVal(r, c.status) || "פעיל").indexOf(o) !== -1 ? " selected" : "") + '>' + o + '</option>';
                }).join("") + '</select></div>' : "") +
          '</div>' +
          '<div class="res-replace">' +
            '<button type="button" class="btn-ghost btn-sm" data-replace>החלפת משפחה — דיירים חדשים נכנסו</button>' +
            '<span class="res-dim">מסמן את הנוכחיים כ"עזבו" ופותח משק בית חדש עם מזהה משלו, כך שההיסטוריה לא עוברת</span>' +
          '</div>' +
        '</div>' +

      '</div>' +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          '<button class="btn-primary" data-rsave>שמור</button>' +
          '<button class="btn-ghost" data-rclose>ביטול</button>' +
        '</div>' +
      '</div>' +
    '</aside>';
  document.body.appendChild(overlay);
  overlay.querySelectorAll("[data-rclose]").forEach(function (el) { el.addEventListener("click", resCloseDrawer); });
  document.addEventListener("keydown", resEsc);

  /* שמירת הרשאות היא פעולה נפרדת מ"שמור" של פרטי משק הבית — בכוונה. שינוי הרשאה
     הוא מעשה בעל משמעות (הוא פותח למישהו גישה לכסף או לפרטי כל התושבים), ולא נכון
     שייבלע בתוך שמירה של תיקון טלפון. */
  overlay.querySelectorAll("[data-perm-save]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var box = btn.closest("[data-perm-slot]");
      var slot = parseInt(box.dataset.permSlot, 10);
      var perms = [];
      box.querySelectorAll("[data-perm]").forEach(function (cbx) {
        if (cbx.checked) perms.push(cbx.dataset.perm);
      });
      var rNow = freshRow();
      var who = resVal(rNow, c.firstName[slot - 1]) || resVal(rNow, c.email[slot - 1]);
      var txt = perms.length
        ? 'לתת ל' + who + ' את ההרשאות: ' + perms.map(resPermLabel).join(", ") + '?'
        : 'להסיר מ' + who + ' את כל ההרשאות המיוחדות? הוא יישאר תושב רגיל.';
      if (perms.indexOf("על") !== -1) {
        txt += '\n\nשים לב: מנהל על רואה את כל התכנים ויכול לשנות הרשאות של כל אחד, כולל שלך.';
      }
      if (!window.confirm(txt)) return;
      btn.disabled = true; btn.textContent = "שומר…";
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSave");
      CBA.data.savePermissions(rowIndex, slot, perms, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSave");
        btn.disabled = false; btn.textContent = "שמור הרשאות";
        if (!res || !res.ok) {
          window.alert("שמירת ההרשאות נכשלה: " + ((res && res.error) || "שגיאה"));
          return;
        }
        resState.loaded = false;
        CBA.data.refreshResidents(function () {
          resLoad(container);
          resCloseDrawer();
        });
      });
    });
  });

  overlay.querySelector("[data-rsave]").addEventListener("click", function () {
    var fields = {};
    overlay.querySelectorAll("[data-rf]").forEach(function (el) { fields[el.dataset.rf] = el.value; });
    // מעבר בתוך השיכון — אותה ישות, רק בית אחר. מאשרים במפורש כדי שלא יקרה בהיסח דעת.
    var newHouse = c.house ? String(fields[c.house] || "").trim() : origHouse;
    if (txN && c.house && newHouse !== origHouse) {
      if (!window.confirm('מספר הבית משתנה מ-' + origHouse + ' ל-' + newHouse + '.\n' +
        'זה מתאים למעבר של אותה משפחה בתוך השיכון — ' + txN + ' התנועות הקיימות יישארו משויכות אליה.\n' +
        'אם מדובר בדיירים חדשים, בטל והשתמש ב"החלפת משפחה".')) return;
    }
    var btn = overlay.querySelector("[data-rsave]");
    btn.disabled = true; btn.textContent = "שומר…";
    if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSave");
    CBA.data.saveResidentRow(rowIndex, fields, function (res) {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSave");
      if (!res || !res.ok) {
        btn.disabled = false; btn.textContent = "שמור";
        window.alert("השמירה נכשלה: " + ((res && res.error) || "שגיאה"));
        return;
      }
      resCloseDrawer();
      resState.loaded = false;
      CBA.data.refreshResidents(function () { resLoad(container); });
    });
  });

  overlay.querySelector("[data-replace]").addEventListener("click", function () {
    var fam = window.prompt("שם המשפחה הנכנסת:", "");
    if (fam === null) return;
    fam = fam.trim();
    if (!fam) { window.alert("צריך שם משפחה"); return; }
    var house = window.prompt("מספר בית:", resVal(freshRow(), c.house) || "");
    if (house === null) return;
    if (!window.confirm('הדיירים הנוכחיים יסומנו כ"עזבו" ו-' + txN + ' התנועות יישארו משויכות אליהם.\n' +
      'תיפתח שורה חדשה למשפחת ' + fam + ' עם מזהה קבוע משלה. להמשיך?')) return;
    if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSave");
    CBA.data.replaceFamily({ rowIndex: rowIndex, family: fam, house: String(house).trim() }, function (res) {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSave");
      if (!res || !res.ok) { window.alert("הפעולה נכשלה: " + ((res && res.error) || "שגיאה")); return; }
      resCloseDrawer();
      resState.loaded = false;
      CBA.data.refreshResidents(function () { resLoad(container); });
    });
  });
}

/* ==========================================================================
   "ועד השיכון" — ניהול/עריכת העץ הארגוני (2026-08-10)
   מסך ניהול נפרד, מוצג רק למנהל-על (ר' SCREEN_PERM.committeeAdmin ב-app.js) —
   לבקשת יועד: "הניהול עץ צריך להיות רק באזור ניהול למי שיש הרשאות מנהל על".
   התצוגה-לקריאה-בלבד המקבילה, לכל תושב, יושבת ב-resident.js
   (CBA.screens.resCommittee) — בלי שום כפתור עריכה, גם אם הצופה הוא מנהל-על.
   שני הצדדים משתמשים באותה לוגיקת בניית-עץ מהשורות השטוחות — ר' CBA.committee
   ב-dataService.js — כדי שלא ייסחפו זה מזה עם הזמן.
   עטוף ב-IIFE משלו (בניגוד לשאר הקובץ, שהוא סקריפט גלובלי, ר' הערת הקובץ
   למעלה) כדי לא להתנגש בשמות עם שאר הקוד כאן — אותה תבנית בדיוק כמו ה-IIFE
   שהיה משמש קודם לעריכה הזו כשהיא ישבה ב-resident.js.
   ========================================================================== */
(function () {
  "use strict";

  function svg(inner) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
  }
  var plusIcon  = svg('<path d="M12 5v14M5 12h14"/>');
  var xIcon     = svg('<path d="M18 6L6 18M6 6l12 12"/>');
  var editIcon  = svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>');
  var chevIcon  = svg('<polyline points="6 9 12 15 18 9"/>');
  // חצי הזזה בין אחים (2026-08-10, לבקשת יועד: "חצים שמאפשרים להזיז טור
  // למיקום אחר"). אותה פעולה בדיוק בשני הכיוונים (moveSibling, ר' למטה) —
  // רק האייקון/תווית מותאמים לכיוון התצוגה: בעץ האופקי (דסקטופ) ימין/שמאל,
  // ברשימה האנכית (מובייל) למעלה/למטה.
  var rightIcon = svg('<path d="M5 12h14M13 6l6 6-6 6"/>');
  var leftIcon  = svg('<path d="M19 12H5M11 6l-6 6 6 6"/>');
  var upIcon    = svg('<path d="M12 19V5M5 12l7-7 7 7"/>');
  var downIcon  = svg('<path d="M12 5v14M5 12l7 7 7-7"/>');

  function closeOrgModal() {
    var el = document.getElementById("cba-modal");
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.removeEventListener("keydown", escOrgModal);
  }
  function escOrgModal(e) { if (e.key === "Escape") closeOrgModal(); }

  // autocomplete לשדה "שם" בתוך שורת-אדם אחת במודל העריכה — אותה תבנית בדיוק
  // כמו txWireAutocomplete בטופס ההוצאה (expenses.js), מותאם לרשימה חוזרת
  // (כמה שורות-אנשים באותו מודל, כל אחת עם data-ac="opN" משלה).
  function orgWireAutocomplete(peopleEl, i, residentOptions, state) {
    var input = peopleEl.querySelector('[data-ac="op' + i + '"]');
    var list = peopleEl.querySelector('[data-ac-list="op' + i + '"]');
    if (!input || !list) return;
    function render(q) {
      var query = (q || "").trim();
      if (!query) { list.hidden = true; list.innerHTML = ""; return; }
      var matches = residentOptions
        .map(function (o, idx) { return { o: o, idx: idx }; })
        .filter(function (x) { return x.o.label.indexOf(query) !== -1; })
        .slice(0, 8);
      if (!matches.length) { list.hidden = true; list.innerHTML = ""; return; }
      list.innerHTML = matches.map(function (x) {
        return '<div class="ac-item" data-ac-idx="' + x.idx + '">' + CBA.esc(x.o.label) + '</div>';
      }).join("");
      list.hidden = false;
    }
    input.addEventListener("input", function () { render(input.value); });
    input.addEventListener("focus", function () { if (input.value) render(input.value); });
    input.addEventListener("blur", function () { setTimeout(function () { list.hidden = true; }, 150); });
    list.addEventListener("mousedown", function (e) {
      var item = e.target.closest("[data-ac-idx]");
      if (!item) return;
      e.preventDefault();
      var opt = residentOptions[parseInt(item.dataset.acIdx, 10)];
      if (opt && state.people[i]) {
        input.value = opt.label;
        state.people[i].name = opt.label;
        state.people[i].rid = opt.rid;
      }
      list.hidden = true;
    });
  }

  CBA.screens.committeeAdmin = {
    title: "ועד השיכון",

    render: function (container) {
      var isMobile = window.matchMedia("(max-width: 720px)").matches;
      container.innerHTML =
        '<div class="org-toolbar">' +
          '<div class="org-hint">' + (isMobile
            ? 'לחצו על תפקיד כדי לפתוח את מי שכפוף לו. העיפרון עורך, "+" מוסיף תפקיד־בן, החצים מזיזים בין אחים.'
            : 'העץ רחב — גררו/גללו אופקית כדי לראות את כולו. לחצו על העיפרון על גבי תפקיד לעריכה, או על "+" להוספת תפקיד־בן.') + '</div>' +
          '<button type="button" class="rs-ghost" id="org-add-root">' + plusIcon + 'הוספת תפקיד חדש</button>' +
        '</div>' +
        '<div id="org-body"><div class="rs-empty"><p>טוען…</p></div></div>';

      var bodyEl = container.querySelector("#org-body");
      var rowsCache = [];
      var expanded = null; // {boxId:true/false} ברשימה המתקפלת (מובייל) — ר' resCommittee/resident.js

      // שומר rowsCache ומצייר — נקודת-כניסה אחת לכל שינוי שנשמר לשרת (גם
      // מהמודל וגם מחצי ההזזה), כדי לא לשכפל את לוגיקת ה"שמור והצג" פעמיים.
      // עדכון אופטימי (2026-08-10, לבקשת יועד: "התזוזה של החיצים לוקחת כמה
      // שניות, עדיף שיהיה מיידי ומקסימום לאחר מכן כמה שניות כדי להישמר, באותו
      // מנגנון שמירה") — מציירים עם הסדר החדש *מיד*, לפני שהשרת אישר, ורק אם
      // השמירה בפועל נכשלת חוזרים למצב הקודם ומציירים שוב. saveCommitteeTree
      // עובר דרך CBA.sheets.postRead ולא push() — postRead לא נספר אוטומטית
      // ב-inFlightWrites (ר' cba-data-refresh-policy.md), אז בלי markDirty/
      // clearDirty ידניים כאן רענון רקע שקט היה יכול לדרוס את rowsCache
      // האופטימי באמצע השמירה. זה "אותו מנגנון שמירה" שיועד התכוון אליו —
      // אותו markDirty/clearDirty-לפי-סיבה שמפעיל את חיווי "שומר…/נשמר" הגלובלי
      // בכותרת (ר' resident.js's receiptUpload/clubReserveSelect לדוגמאות דומות).
      function commitRows(newRows, cb) {
        var prevRows = rowsCache;
        rowsCache = newRows;
        draw();
        if (CBA.sheets.markDirty) CBA.sheets.markDirty("committeeTreeSave");
        CBA.data.saveCommitteeTree(newRows, function (res) {
          if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("committeeTreeSave");
          if (!res || !res.ok) { rowsCache = prevRows; draw(); }
          if (cb) cb(res);
        });
      }

      // הזזת תא בין האחים שלו (מיקום i -> i+dir בתוך אותה רשימת-אחים) —
      // מזיזה את *כל* השורות של שני התאים המעורבים (כולל תאים עם כמה אנשים,
      // כמו "הסעים") כבלוק אחד, בלי לגעת בשורות של תאים אחרים. dir=-1 קודם
      // (ימינה בעץ / למעלה ברשימה), dir=+1 אחרי (שמאלה בעץ / למטה ברשימה).
      function moveSibling(boxId, dir) {
        var boxes = CBA.committee.buildBoxes(rowsCache);
        var idSet = {}; boxes.forEach(function (b) { idSet[b.id] = true; });
        var target = boxes.filter(function (b) { return b.id === boxId; })[0];
        if (!target) return;
        var parentKey = idSet[target.parent] ? target.parent : "";
        var siblings = boxes.filter(function (b) { return (idSet[b.parent] ? b.parent : "") === parentKey; });
        var ids = siblings.map(function (b) { return b.id; });
        var pos = ids.indexOf(boxId);
        var swapPos = pos + dir;
        if (pos === -1 || swapPos < 0 || swapPos >= siblings.length) return;
        var otherId = ids[swapPos];

        var rowsA = rowsCache.filter(function (r) { return String(r["מזהה תא"] || "").trim() === boxId; });
        var rowsB = rowsCache.filter(function (r) { return String(r["מזהה תא"] || "").trim() === otherId; });
        var block = (dir < 0) ? rowsA.concat(rowsB) : rowsB.concat(rowsA);

        var inserted = false, newRows = [];
        rowsCache.forEach(function (r) {
          var id = String(r["מזהה תא"] || "").trim();
          if (id === boxId || id === otherId) {
            if (!inserted) { newRows = newRows.concat(block); inserted = true; }
            return;
          }
          newRows.push(r);
        });
        commitRows(newRows, function (res) {
          if (!res || !res.ok) window.alert("ההזזה נכשלה: " + ((res && res.error) || "שגיאה"));
        });
      }

      // כרטיס בודד (2026-08-10, מנוע ציור מדויק) — כבר לא <li> מקונן; div שטוח
      // עם data-node-id, ש-layoutOrgTree ממקם אחר כך ב-left/top מוחלטים.
      // התוכן הפנימי (org-box + כפתורי פעולה) זהה לגמרי לגרסה הקודמת.
      function orgNodeBoxHTML(box, siblingPos, siblingCount) {
        var cat = CBA.committee.catInfo(box.category);
        var peopleHTML = box.people.length
          ? box.people.map(function (p) { return '<div class="org-box__person">' + CBA.esc(p.name) + '</div>'; }).join("")
          : "";
        var actionsHTML = '<div class="org-box__actions">' +
              (siblingPos > 0 ? '<button type="button" class="org-box__act" data-org-move="' + CBA.esc(box.id) + '" data-dir="-1" title="הזז ימינה" aria-label="הזז ימינה">' + rightIcon + '</button>' : '') +
              (siblingPos < siblingCount - 1 ? '<button type="button" class="org-box__act" data-org-move="' + CBA.esc(box.id) + '" data-dir="1" title="הזז שמאלה" aria-label="הזז שמאלה">' + leftIcon + '</button>' : '') +
              '<button type="button" class="org-box__act" data-org-edit="' + CBA.esc(box.id) + '" title="עריכה" aria-label="עריכה">' + editIcon + '</button>' +
              '<button type="button" class="org-box__act" data-org-add-child="' + CBA.esc(box.id) + '" title="הוספת תפקיד־בן" aria-label="הוספת תפקיד־בן">' + plusIcon + '</button>' +
            '</div>';
        return '<div class="org-tree-node" data-node-id="' + CBA.esc(box.id) + '">' +
          '<div class="org-box" style="border-top-color:' + CBA.esc(cat.color) + '" title="' + CBA.esc(cat.name) + '">' +
            '<div class="org-box__role">' + CBA.esc(box.role || "(ללא שם תפקיד)") + '</div>' +
            (peopleHTML ? '<div class="org-box__people">' + peopleHTML + '</div>' : "") +
            actionsHTML +
          '</div>' +
        '</div>';
      }

      // מנוע הפריסה (2026-08-10) — ר' ההסבר המלא בהערת ה-CSS מעל .org-tree-wrap
      // ב-resident.css. אותו אלגוריתם בדיוק קיים גם ב-resCommittee (resident.js,
      // התצוגה הציבורית לתושב) — לא מרוכז בקובץ משותף כי כל שאר לוגיקת ה-DOM/
      // ציור של עץ הוועד כאן כבר כפולה כך בין שני המסכים (orgListHTML,
      // defaultExpanded וכו'), אז זו הרחבה עקבית לדפוס הקיים ולא סטייה ממנו.
      // שני שלבים: (1) מדידה — כל הקוביות כבר בדף (ב-innerHTML), מודדים גובה
      // טבעי של כל אחת (תלוי תוכן: אורך שם התפקיד, כמה אנשים). (2) מיקום —
      // X לפי "משבצת" קבועה-רוחב לכל עלה (הורה ממורכז בדיוק מעל טווח הילדים
      // שלו, לא לפי כמה יש להם מתחת), Y לפי "דור" (כל הקוביות באותו מרחק
      // מהשורש מיושרות לאותה שורה). קווי חיבור מצוירים ב-SVG לפי המיקומים
      // המדויקים שהתקבלו — לא תלויים בטריק CSS כלשהו.
      function layoutOrgTree(canvas, svg, nodesFlat, byParent) {
        // סבב 3 (2026-08-10, לבקשת יועד: "להקטין את המרווח בין קוביות בשליש" +
        // "להקטין את הגובה בין קוביות בחצי") — GAP_X (מרווח אופקי בין אחים)
        // 20→13 (כ-2/3 מהערך הקודם), ROW_GAP (מרווח אנכי בין הורה לילדים) 40→20.
        // סבב 4 (2026-08-10, לבקשת יועד: "תקטין את רוחב הקוביות בעוד 15%") —
        // NODE_W 140→119 (עוד 15% פחות), חייב להישאר זהה לרוחב .org-box/
        // .org-tree-node ב-resident.css כדי שהפריסה תואמת בפועל לגודל האמיתי.
        var NODE_W = 119, GAP_X = 13, ROW_GAP = 20, PAD_X = 20, PAD_TOP = 6, PAD_BOTTOM = 10;

        var heightOf = {}, elOf = {};
        nodesFlat.forEach(function (n) {
          var el = canvas.querySelector('.org-tree-node[data-node-id="' + CBA.esc(n.box.id) + '"]');
          elOf[n.box.id] = el;
          heightOf[n.box.id] = el ? el.offsetHeight : 70;
        });

        var slotOf = {}, leafCounter = 0;
        function assignSlot(id) {
          var kids = byParent[id] || [];
          if (!kids.length) { var s = leafCounter++; slotOf[id] = s; return s; }
          var centers = kids.map(function (k) { return assignSlot(k.id); });
          var c = (centers[0] + centers[centers.length - 1]) / 2;
          slotOf[id] = c;
          return c;
        }
        var roots = nodesFlat.filter(function (n) { return n.depth === 0; }).map(function (n) { return n.box; });
        roots.forEach(function (r) { assignSlot(r.id); });
        var totalSlots = Math.max(leafCounter, 1);
        var SLOT_W = NODE_W + GAP_X;
        var totalWidth = PAD_X * 2 + totalSlots * NODE_W + (totalSlots - 1) * GAP_X;

        // הופכים (mirror) את סדר המשבצות: אח 0 תמיד יושב הכי ימני, בדיוק כמו
        // בעץ ה-flex/RTL הקודם — כדי לא לשבש את המשמעות של "הזז ימינה/שמאלה".
        function leftOf(id) {
          var abstractLeft = PAD_X + slotOf[id] * SLOT_W;
          return totalWidth - NODE_W - abstractLeft;
        }

        // Y — מיקום מקומי לפי-הורה, לא לפי "שורת-דור" גלובלית (סבב 2, 2026-08-10,
        // לבקשת יועד: "המרחקים בין הקוביות בציר הגובה... יש מקומות שפתאום ההפרש
        // בגובה גדול ופתאום קטן"). בגרסה הקודמת כל הקוביות באותו עומק (דור) יושרו
        // לאותה שורה לפי rowMaxH[depth] = הגובה המקסימלי בכל העץ באותו עומק —
        // כך שילדים של קוביה קצרה התחילו רק אחרי המרחק עד תחתית הקוביה *הכי
        // גבוהה* באותו דור, גם אם היא בענף אחר לגמרי. זה בדיוק יצר את התופעה
        // שיועד תיאר: לפעמים המרווח לפני הילדים גדול (קוביה קצרה בדור עם קוביה
        // גבוהה בענף אחר) ולפעמים קטן (כל הדור אחיד). עכשיו: הילדים של כל קוביה
        // מתחילים תמיד מיד אחרי התחתית *של אותה קוביה עצמה* + ROW_GAP קבוע —
        // בלי תלות בגובה קוביות אחרות בעץ. מעבר יחיד מלמעלה-למטה מספיק כי
        // nodesFlat הוא preorder (ההורה תמיד מופיע לפני הילדים שלו, ר'
        // collectNode למטה) — עד שמגיעים לקוביה בלולאה, topOf שלה כבר נקבע.
        var topOf = {};
        roots.forEach(function (r) { topOf[r.id] = PAD_TOP; });
        nodesFlat.forEach(function (n) {
          var kids = byParent[n.box.id] || [];
          if (!kids.length) return;
          var childTop = topOf[n.box.id] + heightOf[n.box.id] + ROW_GAP;
          kids.forEach(function (k) { topOf[k.id] = childTop; });
        });
        var totalHeight = PAD_TOP;
        nodesFlat.forEach(function (n) {
          var bottom = topOf[n.box.id] + heightOf[n.box.id];
          if (bottom > totalHeight) totalHeight = bottom;
        });
        totalHeight += PAD_BOTTOM;

        nodesFlat.forEach(function (n) {
          var el = elOf[n.box.id];
          if (!el) return;
          el.style.left = leftOf(n.box.id) + "px";
          el.style.top = topOf[n.box.id] + "px";
        });
        canvas.style.width = totalWidth + "px";
        canvas.style.height = totalHeight + "px";
        svg.setAttribute("width", totalWidth);
        svg.setAttribute("height", totalHeight);
        svg.setAttribute("viewBox", "0 0 " + totalWidth + " " + totalHeight);

        function centerX(id) { return leftOf(id) + NODE_W / 2; }
        var lines = [];
        nodesFlat.forEach(function (n) {
          var kids = byParent[n.box.id] || [];
          if (!kids.length) return;
          var parentBottom = topOf[n.box.id] + heightOf[n.box.id];
          var midY = parentBottom + ROW_GAP / 2;
          var childTop = topOf[kids[0].id];
          var childXs = kids.map(function (k) { return centerX(k.id); });
          var minX = Math.min.apply(null, childXs), maxX = Math.max.apply(null, childXs);
          var px = centerX(n.box.id);
          lines.push('<line x1="' + px + '" y1="' + parentBottom + '" x2="' + px + '" y2="' + midY + '"></line>');
          if (kids.length > 1) {
            lines.push('<line x1="' + minX + '" y1="' + midY + '" x2="' + maxX + '" y2="' + midY + '"></line>');
          }
          kids.forEach(function (k) {
            var cx = centerX(k.id);
            lines.push('<line x1="' + cx + '" y1="' + midY + '" x2="' + cx + '" y2="' + childTop + '"></line>');
          });
        });
        svg.innerHTML = lines.join("");
      }

      function defaultExpanded(boxes, byParent) {
        var out = {};
        boxes.forEach(function (b) { out[b.id] = (byParent[b.id] || []).length === 1; });
        return out;
      }

      function orgListHTML(box, byParent, siblingPos, siblingCount) {
        var cat = CBA.committee.catInfo(box.category);
        var kids = byParent[box.id] || [];
        var isOpen = !!expanded[box.id];
        var peopleText = box.people.length ? box.people.map(function (p) { return CBA.esc(p.name); }).join(", ") : "";
        return '<li class="org-list__item">' +
          '<div class="org-list__row"' + (kids.length ? ' data-org-toggle="' + CBA.esc(box.id) + '"' : "") + '>' +
            (kids.length
              ? '<span class="org-list__chev' + (isOpen ? " is-open" : "") + '">' + chevIcon + '</span>'
              : '<span class="org-list__chev org-list__chev--spacer"></span>') +
            '<span class="org-list__dot" style="background:' + CBA.esc(cat.color) + '" title="' + CBA.esc(cat.name) + '"></span>' +
            '<div class="org-list__text">' +
              '<div class="org-list__role">' + CBA.esc(box.role || "(ללא שם תפקיד)") + '</div>' +
              (peopleText ? '<div class="org-list__people">' + peopleText + '</div>' : "") +
            '</div>' +
            '<div class="org-list__actions">' +
              (siblingPos > 0 ? '<button type="button" class="org-list__act" data-org-move="' + CBA.esc(box.id) + '" data-dir="-1" title="הזז למעלה" aria-label="הזז למעלה">' + upIcon + '</button>' : '') +
              (siblingPos < siblingCount - 1 ? '<button type="button" class="org-list__act" data-org-move="' + CBA.esc(box.id) + '" data-dir="1" title="הזז למטה" aria-label="הזז למטה">' + downIcon + '</button>' : '') +
              '<button type="button" class="org-list__act" data-org-edit="' + CBA.esc(box.id) + '" title="עריכה" aria-label="עריכה">' + editIcon + '</button>' +
              '<button type="button" class="org-list__act" data-org-add-child="' + CBA.esc(box.id) + '" title="הוספת תפקיד־בן" aria-label="הוספת תפקיד־בן">' + plusIcon + '</button>' +
            '</div>' +
          '</div>' +
          (kids.length
            ? '<ul class="org-list__children"' + (isOpen ? "" : " hidden") + '>' +
                kids.map(function (k, i) { return orgListHTML(k, byParent, i, kids.length); }).join("") +
              '</ul>'
            : "") +
        '</li>';
      }

      function wireActions() {
        bodyEl.querySelectorAll("[data-org-toggle]").forEach(function (row) {
          row.addEventListener("click", function (e) {
            if (e.target.closest("[data-org-move],[data-org-edit],[data-org-add-child]")) return;
            var id = row.dataset.orgToggle;
            expanded[id] = !expanded[id];
            draw();
          });
        });
      }

      function draw() {
        var boxes = CBA.committee.buildBoxes(rowsCache);
        if (!boxes.length) {
          bodyEl.innerHTML = '<div class="rs-empty"><p>עדיין לא הוגדר עץ ועד. לחצו למעלה על "הוספת תפקיד חדש" כדי להתחיל.</p></div>';
          return;
        }
        var ids = {}; boxes.forEach(function (b) { ids[b.id] = true; });
        var byParent = {};
        boxes.forEach(function (b) {
          var p = ids[b.parent] ? b.parent : "";
          (byParent[p] = byParent[p] || []).push(b);
        });
        var roots = byParent[""] || [];

        if (isMobile) {
          if (!expanded) expanded = defaultExpanded(boxes, byParent);
          bodyEl.innerHTML = '<ul class="org-list">' +
            roots.map(function (b, i) { return orgListHTML(b, byParent, i, roots.length); }).join("") +
            '</ul>';
          wireActions();
          return;
        }

        var nodesFlat = [];
        function collectNode(node, depth, siblingPos, siblingCount) {
          nodesFlat.push({ box: node, depth: depth, siblingPos: siblingPos, siblingCount: siblingCount });
          var kids = byParent[node.id] || [];
          kids.forEach(function (k, i) { collectNode(k, depth + 1, i, kids.length); });
        }
        roots.forEach(function (r, i) { collectNode(r, 0, i, roots.length); });

        bodyEl.innerHTML = '<div class="org-tree-wrap"><div class="org-tree-canvas" id="org-tree-canvas">' +
          '<svg class="org-tree-svg" id="org-tree-svg"></svg>' +
          nodesFlat.map(function (n) { return orgNodeBoxHTML(n.box, n.siblingPos, n.siblingCount); }).join("") +
          '</div></div>';
        layoutOrgTree(bodyEl.querySelector("#org-tree-canvas"), bodyEl.querySelector("#org-tree-svg"), nodesFlat, byParent);
        // עוגן גלילה התחלתי (2026-08-10) — ר' אותה הערה ב-resCommittee/resident.js.
        // חשוב באותה מידה כאן: אחרי כל שמירה draw() רץ מחדש, וגם אחרי עריכה
        // רוצים שהמנהל ימשיך לראות את ראש העץ, לא ייזרק לתוך "האמצע" שלו.
        var firstBox = roots[0] && bodyEl.querySelector('.org-tree-node[data-node-id="' + CBA.esc(roots[0].id) + '"]');
        if (firstBox && firstBox.scrollIntoView) {
          firstBox.scrollIntoView({ inline: "center", block: "nearest" });
        }
      }

      function load() {
        CBA.data.getCommitteeTree(function (res) {
          if (!res || !res.ok) {
            bodyEl.innerHTML = '<div class="rs-empty"><p>' + CBA.esc((res && res.error) || "שגיאה בטעינת עץ הוועד. נסו שוב מאוחר יותר.") + '</p></div>';
            return;
          }
          rowsCache = res.rows || [];
          draw();
        });
      }

      // boxId=מזהה תא קיים לעריכה, defaultParent=ה"הורה" בעת הוספת תא חדש
      // (מהכפתור "+" על תא ספציפי — ריק=שורש, מהכפתור הכללי למעלה).
      function openOrgEdit(boxId, defaultParent) {
        var boxes = CBA.committee.buildBoxes(rowsCache);
        var editing = boxId ? boxes.filter(function (b) { return b.id === boxId; })[0] : null;
        var blocked = editing ? CBA.committee.descendantIds(boxes, editing.id) : {};
        var parentOptions = boxes.filter(function (b) { return (!editing || b.id !== editing.id) && !blocked[b.id]; });

        var state = {
          people: editing ? editing.people.map(function (p) { return { name: p.name, rid: p.rid }; }) : []
        };

        closeOrgModal();
        var overlay = document.createElement("div");
        overlay.id = "cba-modal";

        function peopleRowsHTML() {
          return state.people.map(function (p, i) {
            return '<div class="org-person-row" data-i="' + i + '">' +
              '<div class="ac-wrap">' +
                '<input class="field-input" type="text" data-op-name="' + i + '" data-ac="op' + i + '" autocomplete="off" ' +
                  'value="' + CBA.esc(p.name) + '" placeholder="שם — הקלידו או בחרו מרשימת תושבים">' +
                '<div class="ac-list" data-ac-list="op' + i + '" hidden></div>' +
              '</div>' +
              '<button type="button" class="org-person-row__x" data-op-remove="' + i + '" aria-label="הסרת אדם">' + xIcon + '</button>' +
            '</div>';
          }).join("");
        }

        // קטגוריות (2026-08-10): רשימה דינמית מהשרת (CBA.committee.catsList) —
        // לא עוד 4 קבועות בקוד. כל אפשרות מקבלת גם style=color שלה (עובד
        // בדפדפנים מודרניים על <option>) כדי לתת רמז ויזואלי לצבע גם בתוך
        // הרשימה הנפתחת, בלי לבנות ווידג'ט בחירה מותאם אישית משלנו.
        // "+ קטגוריה חדשה…" תמיד אחרונה — בוחרים אותה כדי לחשוף מיני-טופס
        // עם שם + בורר צבע native, ר' wiring למטה.
        // סבב נוסף (2026-08-10, לבקשת יועד: "רשימת קטגוריות - צריך להצמיד לה
        // את הצבעים") — style על <option> בתוך <select> סגור לא מוצג באופן
        // אמין בכל דפדפן/מערכת הפעלה (בטלפון בפרט ה-OS מצייר את התפריט הנפתח
        // בעצמו ולא תמיד מכבד style על option). מוסיפים נקודת-צבע קבועה
        // (#og-cat-swatch) לצד הבורר עצמו, ומעדכנים אותה ב-JS בכל שינוי —
        // רואים תמיד את צבע הקטגוריה הנבחרת, לא תלויים בעיצוב הפנימי
        // של ה-<select>. גם צבע הטקסט של הבורר עצמו (כשסגור) מתעדכן לצבע
        // הקטגוריה, שבדפדפנים רבים כן מכבד.
        var cats = CBA.committee.catsList();
        function catColorOf(name) {
          var c = cats.filter(function (x) { return x.name === name; })[0];
          return c ? c.color : "#9CA3AF";
        }
        function catOptionsHTML(selectedName) {
          return cats.map(function (c) {
            return '<option value="' + CBA.esc(c.name) + '" style="color:' + CBA.esc(c.color) + '"' +
              (c.name === selectedName ? " selected" : "") + '>' + CBA.esc(c.name) + '</option>';
          }).join("") + '<option value="__new__">+ קטגוריה חדשה…</option>';
        }

        overlay.innerHTML =
          '<div class="modal-backdrop" data-modal-close>' +
            '<div class="modal" role="dialog">' +
              '<div class="modal__head">' +
                '<div><div class="modal__title">' + (editing ? "עריכת תפקיד" : "תפקיד חדש") + '</div>' +
                  '<div class="modal__sub">גלוי לכל תושבי השיכון — עריכה למנהל-על בלבד</div></div>' +
                '<button class="drawer__close" data-modal-close aria-label="סגור">×</button>' +
              '</div>' +
              '<div class="modal__body">' +
                '<div class="form-grid">' +
                  '<div class="form-field form-field--wide"><label>שם התפקיד</label>' +
                    '<input class="field-input" id="og-role" type="text" value="' + CBA.esc(editing ? editing.role : "") + '" placeholder="לדוגמה: גזבר, ועדת תרבות"></div>' +
                  '<div class="form-field form-field--wide"><label>קטגוריה</label>' +
                    '<div class="org-cat-select-wrap">' +
                      '<span class="org-cat-swatch" id="og-cat-swatch" style="background:' + CBA.esc(catColorOf(editing ? editing.category : (cats[0] && cats[0].name))) + '"></span>' +
                      '<select class="field-input" id="og-cat">' + catOptionsHTML(editing ? editing.category : (cats[0] && cats[0].name)) + '</select>' +
                    '</div>' +
                    '<div id="og-newcat" class="org-newcat" hidden>' +
                      '<input class="field-input" id="og-newcat-name" type="text" placeholder="שם הקטגוריה החדשה">' +
                      '<input type="color" id="og-newcat-color" class="org-newcat__color" value="#111827">' +
                      '<button type="button" class="rs-ghost org-newcat__add" id="og-newcat-add">הוספה</button>' +
                    '</div>' +
                  '</div>' +
                  '<div class="form-field"><label>כפוף ל־</label>' +
                    '<select class="field-input" id="og-parent">' +
                      '<option value=""' + (!editing && !defaultParent ? " selected" : (editing && !editing.parent ? " selected" : "")) + '>— בראש העץ —</option>' +
                      parentOptions.map(function (b) {
                        var sel = editing ? (b.id === editing.parent) : (b.id === defaultParent);
                        return '<option value="' + CBA.esc(b.id) + '"' + (sel ? " selected" : "") + '>' + CBA.esc(b.role || b.id) + '</option>';
                      }).join("") +
                    '</select></div>' +
                '</div>' +
                '<div class="form-block">' +
                  '<div class="org-people-head"><label>אנשים בתפקיד הזה</label>' +
                    '<span class="res-dim">אפשר להשאיר ריק</span></div>' +
                  '<div id="og-people">' + peopleRowsHTML() + '</div>' +
                  '<button type="button" class="rs-ghost" id="og-add-person">' + plusIcon + 'הוספת אדם</button>' +
                '</div>' +
              '</div>' +
              '<div class="drawer__actions drawer__actions--sticky">' +
                '<div class="drawer__actions-main">' +
                  '<button class="btn-primary" id="og-save">שמירה</button>' +
                  '<button class="rs-ghost" data-modal-close>ביטול</button>' +
                '</div>' +
                (editing ? '<button type="button" class="btn-reject" id="og-delete">מחיקת תפקיד</button>' : "") +
              '</div>' +
            '</div>' +
          '</div>';
        document.body.appendChild(overlay);
        overlay.querySelector(".modal").addEventListener("click", function (e) { e.stopPropagation(); });
        overlay.querySelectorAll("[data-modal-close]").forEach(function (el) { el.addEventListener("click", closeOrgModal); });
        document.addEventListener("keydown", escOrgModal);

        var catSel = overlay.querySelector("#og-cat");
        var catSwatch = overlay.querySelector("#og-cat-swatch");
        var newCatBox = overlay.querySelector("#og-newcat");
        // מעדכן את נקודת-הצבע + צבע הטקסט של הבורר עצמו לפי הקטגוריה הנבחרת
        // כרגע — נקרא גם בשינוי וגם מיד אחרי הוספת קטגוריה חדשה (למטה).
        function syncCatSwatch() {
          var color = catSel.value === "__new__" ? "#9CA3AF" : catColorOf(catSel.value);
          if (catSwatch) catSwatch.style.background = color;
          catSel.style.color = catSel.value === "__new__" ? "" : color;
        }
        catSel.addEventListener("change", function () {
          newCatBox.hidden = catSel.value !== "__new__";
          syncCatSwatch();
        });
        syncCatSwatch();
        overlay.querySelector("#og-newcat-add").addEventListener("click", function () {
          var nameInp = overlay.querySelector("#og-newcat-name");
          var colorInp = overlay.querySelector("#og-newcat-color");
          var name = nameInp.value.trim();
          if (!name) { window.alert("צריך להזין שם לקטגוריה החדשה."); return; }
          var addBtn = overlay.querySelector("#og-newcat-add");
          addBtn.disabled = true;
          CBA.committee.addCategory(name, colorInp.value, function (res) {
            addBtn.disabled = false;
            if (!res || !res.ok) { window.alert("הוספת הקטגוריה נכשלה: " + ((res && res.error) || "שגיאה")); return; }
            var opt = document.createElement("option");
            opt.value = name; opt.textContent = name; opt.style.color = colorInp.value;
            catSel.insertBefore(opt, catSel.lastChild);
            catSel.value = name;
            cats.push({ name: name, color: colorInp.value }); // כדי ש-catColorOf/syncCatSwatch יכירו אותה מיד
            newCatBox.hidden = true;
            nameInp.value = "";
            syncCatSwatch();
          });
        });

        var peopleEl = overlay.querySelector("#og-people");
        var residentOptions = [];
        function wirePeopleAutocomplete() {
          state.people.forEach(function (p, i) { orgWireAutocomplete(peopleEl, i, residentOptions, state); });
        }
        CBA.data.residentPickerOptions(function (opts) { residentOptions = opts || []; wirePeopleAutocomplete(); });

        function redrawPeople() {
          peopleEl.innerHTML = peopleRowsHTML();
          wirePeopleAutocomplete();
        }

        overlay.querySelector("#og-add-person").addEventListener("click", function () {
          state.people.push({ name: "", rid: "" });
          redrawPeople();
        });
        peopleEl.addEventListener("click", function (e) {
          var rm = e.target.closest("[data-op-remove]");
          if (!rm) return;
          state.people.splice(parseInt(rm.dataset.opRemove, 10), 1);
          redrawPeople();
        });
        peopleEl.addEventListener("input", function (e) {
          var inp = e.target.closest("[data-op-name]");
          if (!inp) return;
          var i = parseInt(inp.dataset.opName, 10);
          if (state.people[i]) { state.people[i].name = inp.value; state.people[i].rid = ""; }
        });

        function orgSave(newRows) {
          var saveBtn = overlay.querySelector("#og-save");
          if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "שומר…"; }
          commitRows(newRows, function (res) {
            if (!res || !res.ok) {
              window.alert("השמירה נכשלה: " + ((res && res.error) || "שגיאה"));
              if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "שמירה"; }
              return;
            }
            closeOrgModal();
          });
        }

        if (editing) {
          overlay.querySelector("#og-delete").addEventListener("click", function () {
            var hasKids = boxes.some(function (b) { return b.parent === editing.id; });
            if (hasKids) {
              window.alert('אי אפשר למחוק את "' + editing.role + '" — יש לו תפקידי־בן בעץ. קודם צריך למחוק אותם או להעביר אותם להורה אחר.');
              return;
            }
            if (!window.confirm('למחוק את התפקיד "' + editing.role + '"?')) return;
            orgSave(rowsCache.filter(function (r) { return String(r["מזהה תא"] || "").trim() !== editing.id; }));
          });
        }

        overlay.querySelector("#og-save").addEventListener("click", function () {
          var role = overlay.querySelector("#og-role").value.trim();
          if (!role) { window.alert("צריך להזין שם תפקיד."); return; }
          var category = overlay.querySelector("#og-cat").value;
          if (category === "__new__") { window.alert('סיימו קודם להוסיף את הקטגוריה החדשה (כפתור "הוספה"), או בחרו קטגוריה קיימת.'); return; }
          var parent = overlay.querySelector("#og-parent").value;
          var people = state.people.filter(function (p) { return p.name.trim(); });

          var id = editing ? editing.id : ("c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
          var newBoxRows = (people.length ? people : [{ name: "", rid: "" }]).map(function (p) {
            var o = {};
            o["מזהה תא"] = id; o["הורה"] = parent; o["תפקיד"] = role; o["קטגוריה"] = category;
            o["שם"] = p.name.trim(); o["מזהה תושב"] = p.rid || "";
            return o;
          });
          var rest = rowsCache.filter(function (r) { return String(r["מזהה תא"] || "").trim() !== id; });
          orgSave(rest.concat(newBoxRows));
        });
      }

      container.querySelector("#org-add-root").addEventListener("click", function () { openOrgEdit(null, ""); });
      bodyEl.addEventListener("click", function (e) {
        var moveBtn = e.target.closest("[data-org-move]");
        if (moveBtn) { moveSibling(moveBtn.dataset.orgMove, parseInt(moveBtn.dataset.dir, 10)); return; }
        var editBtn = e.target.closest("[data-org-edit]");
        if (editBtn) { openOrgEdit(editBtn.dataset.orgEdit, null); return; }
        var addBtn = e.target.closest("[data-org-add-child]");
        if (addBtn) { openOrgEdit(null, addBtn.dataset.orgAddChild); return; }
      });

      CBA.committee.loadCategories(function () { load(); });
    }
  };
})();
