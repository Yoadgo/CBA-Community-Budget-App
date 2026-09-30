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
  headers: [], rows: [], signups: [], changes: [],
  q: "", filter: "active",  // active | left | all
  sort: "family", dir: 1,   // ברירת מחדל: שם משפחה א-ב
  conflicts: [],
  /* RSB3 (גל 8, 1.10.26) — בחירת המשפחה בבקשות הממתינות וגלילת הרשימה נקראו מה-DOM,
     אבל showScreen כבר ריקן אותו ברענון רקע — הבחירה אבדה והאישור שויך לברירת המחדל. */
  suSel: {}, listScroll: 0,
  /* RSB6 (גל 8, 1.10.26) — כשל טעינה של בקשות הרשמה/שינוי פרטים היה שקט לגמרי */
  reqError: false,
  navRefreshing: false   // RSB2 — רענון ברקע אחרי כניסה למסך
};

// שימור מיקום גלילה בין ציורים מחדש (אותה בעיה ואותו פתרון כמו ב-expenses.js:
// כל פעולה/רענון קורא ל-render() מחדש, וה-innerHTML החדש היה מאפס את הגלילה).
var resScrollTop = 0, resWinScrollY = 0;

// חיווי "תפקיד בוועד" בטבלת "תושבים" של הניהול (2026-08-10, סעיף 8 —
// "שהתפקיד בשיכון... יופיע גם בצד של רשימת תושבים, גם למנהל וגם לתושב,
// אך מואפר ללא יכולת עריכה").
/* 28.9.26 — עבר ל-CBA.committeeTree (ועד השיכון v2), בדיוק כמו המדריך
   בצד התושב (resident.js, dirRoleFor): התאמה לפי "מזהה קבוע" של המשפחה +
   מספר הדייר (1/2) בלבד. ⛔ קודם הותאם כאן גם לפי שם פרטי — אותו באג
   שבגללו כל "בר" הוצג כיו"ר השיכון; במדריך הוא תוקן ב-25.9, כאן נשכח.
   לקריאה בלבד — עריכה רק דרך עץ הוועד. */
var resRoleLoaded = false, resRoleLoading = false, resContainerRef = null;
/* RSB1 (גל 8, 1.10.26) — container הוא #app-main הקבוע, ולכן "עדיין ב-DOM" אינו אומר
   "עדיין במסך התושבים": תשובה מאוחרת ציירה את התושבים מעל מסך אחר. כל ציור מאוחר עובר כאן. */
function resOnScreen() {
  if (window.CBA && CBA.onScreen) return CBA.onScreen("residents");
  return !!(document.body && document.body.dataset.screen === "residents");
}
function ensureResRoleIndex() {
  if (resRoleLoaded || resRoleLoading || !(window.CBA && CBA.committeeTree)) return;
  resRoleLoading = true;
  CBA.committeeTree.load(function () {
    resRoleLoading = false;
    resRoleLoaded = true;
    // כתיבה ל-container החי בלבד (לא לרפרנס יתום מ-render קודם — ר' cba-data-refresh-policy)
    /* RSB1 (גל 8, 1.10.26) — צייר רק אם המשתמש עדיין במסך התושבים */
    if (resContainerRef && document.body.contains(resContainerRef) && resOnScreen()) {
      CBA.screens.residents.render(resContainerRef);
    }
  });
}
/* "שם — תפקיד" לכל דייר עם תפקיד בבית הזה, מחוברים ב-" · "; ריק אם אין. */
function resRoleLine(r, c) {
  if (!resRoleLoaded || !CBA.committeeTree) return "";
  var rid = resVal(r, c.id);
  if (!rid) return "";
  var ppl = c.firstName.map(function (k, i) {
    return { fn: resVal(r, k), slot: CBA.committeeTree.slotOfKey(k, i) };
  }).filter(function (x) { return x.fn; });
  var parts = ppl.map(function (x) {
    var role = CBA.committeeTree.rolesFor(rid, x.slot).join(" · ");
    return role ? (ppl.length > 1 ? (x.fn + " — " + role) : role) : "";
  }).filter(Boolean);
  return parts.length ? "תפקיד / אחריות בוועד: " + parts.join(" · ") : "";
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
  { code: "מכון",   label: "ניהול מכון כושר",       hint: "מנויים, אישורי הרשמה ואימות תשלומים" },
  // גינון (2026-09-07) — מידור נפרד, בדיוק כמו מכון ומועדון. חייב להיות זהה
  // ל-PERM_GARDEN בשרת ול-PERM.GARDEN ב-app.js. שים לב: זו הרשאה *מוסיפה*
  // (פותחת את טאב הגינון באזור הניהול); ההגבלה של קבלן חיצוני היא עמודה
  // נפרדת בשם "סוג משתמש" ולא הרשאה — ר' EXTERNAL_HEADER ב-Code.gs.
  { code: "גינון",  label: "ניהול גינון",           hint: "משימות הצוות, תכנון שבועי ואישור ביצוע" },
  // תרבות (23.9.26) — לוח האירועים והסקרים. חייב להיות זהה ל-PERM_CULTURE
  // בשרת ול-PERM.CULTURE ב-app.js. לא פותחת אזור ניהול (ר' hasAnyAdmin שם).
  { code: "תרבות",  label: "ניהול אירועים וסקרים",  hint: "פתיחת מעקב הגעה לאירועים ורשימת המאשרים" },
  // WeWork (25.9.26) — מידור עצמאי. חייב להיות זהה ל-PERM_WEWORK בשרת,
  // ל-PERM.WEWORK ב-app.js ול-hasPerm('WeWork') בכללי Firestore.
  { code: "WeWork", label: "ניהול WeWork",           hint: "שריוני עמדות, ביטולים וכללי השריון" },
  // "שירותים" (27.9.26) — ניהול המלצות תושבים (כולל מיובאות) ודיווחי
  // "לא מעודכן", בלי לגעת בכרטיסי השירות הרשמיים (עדיין מנהל-על בלבד).
  // חייב להיות זהה ל-PERM_SERVICES בשרת, ל-PERM.SERVICES ב-app.js
  // ול-hasPerm('שירותים') בכללי Firestore.
  { code: "שירותים", label: "ניהול המלצות שירות",    hint: "עריכה/מחיקה של כל המלצה בהמלצות השיכון, וטיפול בדיווחי \"לא מעודכן\"" }
];
var RES_PERM_CODES = RES_PERMS.map(function (p) { return p.code; });

function resParsePerms(raw) {
  return String(raw || "").split(/[,;|\/]/).map(function (x) { return x.trim(); })
    .filter(function (x) { return RES_PERM_CODES.indexOf(x) !== -1; })
    .filter(function (x, i, a) { return a.indexOf(x) === i; });
}
/* ההרשאות בפועל של אדם בשורה — רק מה שכתוב ב"הרשאות N" שלו.
   🔴 24.9: עד היום עמודת "תפקיד" הישנה (אחת לשורה) נחשבה "מנהל על" כשהתא ריק,
   ולכן "ללא הרשאות" לבן/בת זוג של מנהל ותיק חזר מיד ל"מנהל על" גם כאן וגם
   בשרת (דיווח 24). אותו כלל כמו permissionsFor_ ב-Code.gs. */
function resPermsOf(row, c, i) {
  return resParsePerms(resVal(row, c.perm[i]));
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
    /* RSB9 (גל 8, 1.10.26) — נספרו הופעות ולא שורות: אותו מייל בשתי המשבצות של שורה אחת סומן "פעמיים" */
    if (idxs.length < 2) return;
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
  var reqFail = false;   // RSB6
  var pending = 3;   // תושבים · בקשות הרשמה · בקשות שינוי פרטים (2026-08-28)
  var done = function () {
    if (--pending === 0) {
      resState.loading = false; resState.loaded = true;
      resState.reqError = reqFail;
      // אם היו עמודות חסרות — יוצרים אותן ואז טוענים שוב, כדי שהשדות החדשים
      // (מקצוע, שמות ילדים, הערות) יופיעו מיד ולא רק ברענון הבא
      resEnsureCols(container, function (created) {
        if (created) {
          resState.loaded = false;
          CBA.data.refreshResidents(function () { resLoad(container); });
          return;
        }
        /* RSB1 (גל 8, 1.10.26) — הנתונים נשמרים תמיד, אבל מציירים רק אם עדיין במסך התושבים */
        if (resOnScreen()) CBA.screens.residents.render(container);
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
    else reqFail = true;   // RSB6
    done();
  });
  // בקשות שינוי פרטים (2026-08-28) — אותה תבנית בדיוק של בקשות ההרשמה
  CBA.data.getProfileChanges(function (res) {
    if (res && res.ok) resState.changes = res.rows || [];
    else reqFail = true;   // RSB6
    done();
  });
}

/* A0/A1 (אושר ע"י יועד 30.9.26) — סרגל הניהול הדק מעל המסך. נבנה פעם אחת
   לכל ציור מלא (ניווט/רענון שקט מרוקנים את main); ציורים פנימיים (סינון,
   חיפוש, סוף טעינה) מחליפים רק את גוף המסך, והסרגל והמאזינים שלו נשארים.
   "הוספת משפחות" עבר מהשורה שמעל הטבלה לסרגל — אותה פעולה בדיוק. */
var RES_BAR_ICO = '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20c0-2.8-1.6-4.9-4-5.7"/>';
function resShell(container) {
  if (!CBA.canopy) return container;   // בלי canopy.js — המסך כמו קודם, בלי סרגל
  var body = container.querySelector(":scope > .cnp2-body--adm");
  if (body && container.querySelector(":scope > .cnp2--bar")) return body;
  container.innerHTML = CBA.canopy({ size: "bar", dom: "ev", ico: RES_BAR_ICO, title: "תושבים",
      pills: [{ id: "res-p-su", k: "הרשמות ממתינות" }, { id: "res-p-chg", k: "שינויי פרטים" }],
      act: { id: "res-bar-add", label: "הוספת משפחות" } }) +
    '<div class="cnp2-body cnp2-body--adm"></div>';
  body = container.querySelector(".cnp2-body--adm");
  function goTo(sel) {
    var el = body.querySelector(sel);
    var card = el && el.closest(".res-signups");
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  container.querySelector("#res-p-su").addEventListener("click", function () { goTo("[data-signup]"); });
  container.querySelector("#res-p-chg").addEventListener("click", function () { goTo("[data-change]"); });
  container.querySelector("#res-bar-add").addEventListener("click", function () {
    if (!resState.loaded || resState.error) return;
    resOpenAdd(container, resCols(resState.headers));
  });
  return body;
}

CBA.screens.residents = {
  title: "תושבים",

  render: function (container) {
    var st = resState;
    resContainerRef = container; // ר' ensureResRoleIndex — כתיבה לרפרנס חי בלבד ברענון אסינכרוני
    ensureResRoleIndex(); // חיווי "תפקיד בוועד" (סעיף 8) — נטען פעם אחת, מטמון נפרד מ-resState
    /* RSB2 (גל 8, 1.10.26) — ניווט אמיתי למסך: showScreen ריקן את main ולא סימן silent.
       ציור פנימי (סינון/חיפוש/מיון/סוף טעינה) תמיד נעשה על מסך מלא. */
    var isNav = !CBA.renderSilent && !container.firstChild;
    // נשמר לפני שה-innerHTML נדרס (ר' ההערה ליד resScrollTop), ומוחזר בסוף הפונקציה
    var prevList = container.querySelector(".tx-list");
    /* RSB3 (גל 8, 1.10.26) — הגלילה נשמרת ב-resState (גם בגלילה עצמה, ר' resBind),
       כי ברענון רקע ה-DOM כבר ריק כאן. ניווט אמיתי מתחיל מלמעלה, כמו קודם. */
    if (prevList) st.listScroll = prevList.scrollTop;
    else if (isNav) st.listScroll = 0;
    resScrollTop = st.listScroll;
    resWinScrollY = window.scrollY || 0;
    // ערכי ה-<select> שנבחרו ידנית בכרטיסי "בקשות הרשמה ממתינות", לפי מזהה הבקשה —
    // בלי זה, כל render() (כולל רענון רקע שקט) היה מאפס בחירה שהמשתמש כבר עשה.
    /* RSB3 (גל 8, 1.10.26) — נקרא מ-resState.suSel (מתעדכן ב-change), לא מה-DOM שכבר ריק */
    var prevSignupSel = st.suSel;
    var body = resShell(container);   // A0 — הסרגל נבנה אחרי חישוב isNav (שבודק main ריק)

    if (!st.loaded && !st.loading) resLoad(container);
    /* RSB2 (גל 8, 1.10.26) — הנתונים נטענו פעם אחת בלבד ולא התרעננו בכניסות הבאות.
       עכשיו: בכניסה אמיתית מציירים מיד את המטמון (בלי שלד) וטוענים מחדש ברקע;
       בסיום resLoad מצייר שוב (אם עדיין כאן). ברענון רקע שקט — לא טוענים. */
    else if (isNav && st.loaded && !st.loading && !st.navRefreshing) {
      if (st.error) { st.loaded = false; resLoad(container); }   // אין מטמון להציג — טעינה רגילה עם שלד
      else {
        st.navRefreshing = true;
        CBA.data.refreshResidents(function () { st.navRefreshing = false; resLoad(container); });
      }
    }

    if (st.loading && !st.loaded) {
      body.innerHTML = CBA.skel.table(8, 6);
      return;
    }
    if (st.error) {
      body.innerHTML = '<div class="card res-msg">' + CBA.esc(st.error) +
        '<div><button class="btn-ghost btn-sm" data-res-retry>נסה שוב</button></div></div>';
      var rb = container.querySelector("[data-res-retry]");
      if (rb) rb.addEventListener("click", function () { st.loaded = false; resLoad(container); });
      return;
    }

    var c = resCols(st.headers);
    var pending = st.signups.filter(function (s) { return String(s.status).trim() === "ממתין"; });
    /* RSB7 (גל 8, 1.10.26) — החיפוש היה תלוי-רישיות ("Cohen" לא מצא "cohen@…") */
    var q = st.q.trim().toLowerCase();

    var visible = st.rows.filter(function (r) {
      if (st.filter === "active" && !resIsActive(r, c)) return false;
      if (st.filter === "left" && resIsActive(r, c)) return false;
      if (!q) return true;
      var hay = [resVal(r, c.family), resVal(r, c.house)]
        .concat(c.firstName.map(function (k) { return resVal(r, k); }))
        .concat(c.email.map(function (k) { return resVal(r, k); }))
        .concat(c.kids ? [resVal(r, c.kids)] : [])
        .join(" ").toLowerCase();
      return hay.indexOf(q) !== -1;
    });

    visible = resSortRows(visible, c);
    var conflicts = resConflicts(st.rows, c);
    resState.conflicts = conflicts;
    var activeCount = st.rows.filter(function (r) { return resIsActive(r, c); }).length;
    // מספרי השורות בגיליון של מה שמוצג כרגע — הייצוא מציע לכבד את הסינון והחיפוש
    resState.visibleRowIndexes = visible.map(function (r) { return st.rows.indexOf(r) + 2; });

    var pendingChanges = (st.changes || []).filter(function (x) {
      return String(x["סטטוס"] || "").trim() === "ממתין";
    });

    body.innerHTML =
      /* RSB6 (גל 8, 1.10.26) — שורה קטנה עם "נסה שוב" במקום היעלמות שקטה של הכרטיסים */
      (st.reqError ? '<div class="res-warn" style="margin:0 0 10px">לא נטענו הבקשות · ' +
        '<button type="button" class="btn-link" data-res-req-retry>נסה שוב</button></div>' : "") +
      (pending.length ? resSignupsHTML(pending, st.rows, c) : "") +
      (pendingChanges.length ? resChangesHTML(pendingChanges) : "") +
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
          /* A0 — "הוספת משפחות" עבר לסרגל; נשאר כאן רק אם הסרגל לא נטען */
          (CBA.canopy ? "" : '<button class="btn-primary btn-sm" data-res-add>הוספת משפחות</button>') +
          '<button class="btn-ghost btn-sm" data-res-export>ייצוא לגיליון</button>' +
          '<button class="btn-ghost btn-sm" data-res-reload>רענן</button>' +
        '</div>' +
      '</div>' +
      '<div class="card tx-card" style="--tx-cols: ' + '62px .95fr 1.05fr .95fr 1.05fr 1.15fr 68px 118px 72px'.replace(/(\d+)px/g, 'calc($1px * var(--fs, 1))') + '">' +
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
    resScrollTop = 0; resWinScrollY = 0;   // (RSB3 — הערך הקבוע נשמר ב-resState.listScroll)
    container.querySelectorAll("[data-signup]").forEach(function (box) {
      var prevVal = prevSignupSel[box.dataset.signup];
      if (prevVal == null) return;
      var sel = box.querySelector(".res-su__sel");
      if (sel && sel.querySelector('option[value="' + CSS.escape(prevVal) + '"]')) sel.value = prevVal;
    });

    resBind(container, c);
    if (CBA.canopy) {
      CBA.canopy.pill(container, "res-p-su", pending.length);
      CBA.canopy.pill(container, "res-p-chg", pendingChanges.length);
    }
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
  var roleLine = resRoleLine(r, c);
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
  /* RSB8 (גל 8, 1.10.26) — ההודעה הריקה ישבה מחוץ ל-.res-mlist והופיעה פעמיים בדסקטופ */
  if (!list.length) return '<div class="res-mlist"><div class="card res-msg">לא נמצאו תושבים בסינון הזה</div></div>';
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
    var roleLine = resRoleLine(r, c);
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

/* בקשות שינוי פרטים (2026-08-28). כרגע השדה היחיד שמגיע לכאן הוא אימייל —
   הוא הזהות שאיתה נכנסים, ולכן לא נשמר מיד אצל התושב. שאר השדות שהתושב
   רשאי לערוך נשמרים ישירות ולא עוברים כאן בכלל. */
var PROFILE_FIELD_LABELS = { email: "אימייל", phone: "טלפון", job: "מקצוע", kids: "שמות הילדים" };
function resChangesHTML(list) {
  return '<div class="card res-signups">' +
    '<div class="res-signups__t">בקשות שינוי פרטים <span class="res-n res-n--warn">' + list.length + '</span></div>' +
    list.map(function (r) {
      var id = CBA.esc(r["מזהה"] || "");
      var field = PROFILE_FIELD_LABELS[String(r["שדה"] || "").trim()] || CBA.esc(r["שדה"] || "");
      return '<div class="res-su" data-change="' + id + '">' +
        '<div class="res-su__who">' +
          '<b>' + CBA.esc(r["אימייל מבקש"] || "") + '</b>' +
          '<span class="res-dim">מבקש/ת לשנות ' + CBA.esc(field) + '</span>' +
        '</div>' +
        '<div class="res-su__match res-chg__vals">' +
          '<span class="res-dim">מ־<b>' + CBA.esc(r["ערך נוכחי"] || "(ריק)") + '</b></span>' +
          '<span class="res-chg__arrow">←</span>' +
          '<span class="res-chg__new"><b>' + CBA.esc(r["ערך מבוקש"] || "") + '</b></span>' +
        '</div>' +
        '<div class="res-su__acts">' +
          '<button type="button" class="btn-approve" data-chg-ok="' + id + '">אשר</button>' +
          '<button type="button" class="btn-reject" data-chg-no="' + id + '">דחה</button>' +
        '</div>' +
      '</div>';
    }).join("") +
  '</div>';
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
  /* RSB3 (גל 8, 1.10.26) — הבחירה והגלילה נשמרות ב-resState ברגע שהן קורות */
  container.querySelectorAll("[data-signup] .res-su__sel").forEach(function (sel) {
    sel.addEventListener("change", function () {
      var box = sel.closest("[data-signup]");
      if (box) resState.suSel[box.dataset.signup] = sel.value;
    });
  });
  var listEl = container.querySelector(".tx-list");
  if (listEl) listEl.addEventListener("scroll", function () { resState.listScroll = listEl.scrollTop; }, { passive: true });
  /* RSB6 (גל 8, 1.10.26) — "נסה שוב" לבקשות: טעינה מחדש, המטמון נשאר מוצג עד הסיום */
  var rq = container.querySelector("[data-res-req-retry]");
  if (rq) rq.addEventListener("click", function () {
    rq.disabled = true;
    resLoad(container);
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

  container.querySelectorAll("[data-chg-ok]").forEach(function (b) {
    b.addEventListener("click", function () {
      b.disabled = true; b.textContent = "מאשר…";
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsProfileChange");
      CBA.data.approveProfileChange(b.dataset.chgOk, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsProfileChange");
        if (!res || !res.ok) {
          b.disabled = false; b.textContent = "אשר";
          CBA.ui.alert("האישור נכשל: " + ((res && res.error) || "שגיאה"));
          return;
        }
        resState.loaded = false;
        CBA.data.refreshResidents(function () { resLoad(container); });
      });
    });
  });

  container.querySelectorAll("[data-chg-no]").forEach(function (b) {
    b.addEventListener("click", function () {
      CBA.ui.prompt("הסיבה תישלח לתושב במייל. אפשר להשאיר ריק.",
        { title: "דחיית בקשת השינוי", okText: "דחה", placeholder: "למשל: הכתובת כבר רשומה למשפחה אחרת" }
      ).then(function (reason) {
        if (reason === null) return;
        b.disabled = true; b.textContent = "דוחה…";
        if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsProfileChange");
        CBA.data.rejectProfileChange(b.dataset.chgNo, String(reason || ""), function (res) {
          if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsProfileChange");
          if (!res || !res.ok) {
            b.disabled = false; b.textContent = "דחה";
            CBA.ui.alert("הדחייה נכשלה: " + ((res && res.error) || "שגיאה"));
            return;
          }
          resState.loaded = false;
          CBA.data.refreshResidents(function () { resLoad(container); });
        });
      });
    });
  });

  container.querySelectorAll("[data-su-ok]").forEach(function (b) {
    b.addEventListener("click", function () {
      var box = b.closest("[data-signup]");
      var sel = box.querySelector(".res-su__sel");
      var val = sel ? sel.value : "";
      if (!val) { CBA.ui.alert("בחר משפחה לשיוך"); return; }
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
          CBA.ui.alert("האישור נכשל: " + ((res && res.error) || "שגיאה"));
          return;
        }
        resState.loaded = false;
        CBA.data.refreshResidents(function () { resLoad(container); });
      });
    });
  });
  container.querySelectorAll("[data-su-no]").forEach(function (b) {
    b.addEventListener("click", function () {
      // (2026-08-19, ממצא 2.6) אישור דחייה — מודל של האפליקציה
      CBA.ui.confirm("הבקשה תוסר מרשימת ההרשמות הממתינות והתושב יקבל הודעה.",
        { title: "לדחות את בקשת ההרשמה?", okText: "דחה בקשה", danger: true }
      ).then(function (ok) {
        if (!ok) return;
        b.disabled = true;
        if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSignup");
        CBA.data.rejectSignup(b.dataset.suNo, function (res) {
          if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSignup");
          if (!res || !res.ok) { b.disabled = false; CBA.ui.alert("הדחייה נכשלה"); return; }
          resState.loaded = false; resLoad(container);
          CBA.ui.toast("הבקשה נדחתה");
        });
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
            /* 🔴 ממצא 17 (2026-09-22) — שבעת השדות היו `input` בלי
               `placeholder`, בלי `aria-label` ובלי קישור לכותרת
               העמודה: קורא מסך הקריא שבע תיבות זהות ללא שם. הכותרת כבר קיימת
               כטקסט — כאן היא נקשרת לשדה עצמו, יחד עם מספר השורה, כי בגריד
               "שם משפחה" לבדו אינו אומר איזו משפחה. */
            return '<input class="res-grid__c" data-ra-r="' + ri + '" data-ra-c="' + ci + '" ' +
              'aria-label="' + CBA.esc(x.label + " · שורה " + (ri + 1)) + '" ' +
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
  /* RSB5 (גל 8, 1.10.26) — לחיצה על הרקע / Escape זרקו לפח שורות שמולאו בלי לשאול,
     ו-Escape פעל גם כשחלון "לאשר את היצירה?" פתוח מעל הגריד. */
  var askingClose = false;
  function softClose() {
    if (askingClose || !resAddState) return;
    var filled = resAddState.cells.some(function (row) {
      return row.some(function (v) { return String(v || "").trim(); });
    });
    if (!filled) { close(); return; }
    askingClose = true;
    CBA.ui.confirm("השורות שמילאת לא יישמרו.", { title: "לסגור בלי ליצור?", okText: "סגור", danger: true })
      .then(function (ok) { askingClose = false; if (ok && wrap.isConnected) close(); });
  }
  function esc(e) {
    if (e.key !== "Escape" || !document.getElementById("res-add")) return;
    if (document.body.classList.contains("has-cba-dlg")) return;   // RSB5 — חלון אישור פתוח מעל
    softClose();
  }
  document.addEventListener("keydown", esc);
  wrap.addEventListener("click", function (e) { if (e.target === wrap) softClose(); });

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
    CBA.ui.confirm(msg, { title: "לאשר את היצירה?", okText: "צור" }).then(function (okGo) {
      if (!okGo) return;

      var go = wrap.querySelector("#ra-go");
      go.disabled = true; go.textContent = "יוצר…";
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsCreate");
      CBA.data.createResidents(payload, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsCreate");
        if (!res || !res.ok) {
          go.disabled = false; go.textContent = "צור";
          CBA.ui.alert("היצירה נכשלה: " + ((res && res.error) || "שגיאה"));
          return;
        }
        var extra = (res.rejected && res.rejected.length)
          ? "\n\n" + res.rejected.length + " שורות נדחו בשרת:\n· " +
            res.rejected.map(function (x) { return "שורה " + (x.i + 1) + ": " + x.error; }).join("\n· ")
          : "";
        close();
        resState.loaded = false;
        CBA.data.refreshResidents(function () { resLoad(container); });
        if (extra) CBA.ui.alert("נוצרו " + res.created + " משקי בית." + extra);
        else CBA.ui.toast("נוצרו " + res.created + " משקי בית");
      });
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
          /* ⚠️ 17.9, ממצא 14 — מחיקה אמיתית, **לשורה שנוצרה בטעות בלבד**.
             עד היום אפשר היה רק לסמן "עזב", ושורה שגויה נשארה בגיליון
             לנצח (בדיוק מה שקרה לשורת הבדיקה "בית 999").
             ⚠️ היא יושבת **מתחת** ל"החלפת משפחה" ובניסוח שמפנה אליו,
                כי ברוב המקרים זו התשובה הנכונה: משפחה שעזבה אינה טעות
                הזנה, וההיסטוריה שלה צריכה להישאר. השרת חוסם מחיקה של
                משק בית שיש לו תנועות כספיות. */
          '<div class="res-replace">' +
            '<button type="button" class="btn-ghost btn-sm is-danger" data-rdelete>מחיקת משק הבית</button>' +
            '<span class="res-dim">רק לשורה שנוצרה בטעות. משק בית עם היסטוריה כספית לא יימחק — שם סמנו "עזב"</span>' +
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

  /* מחיקת משק בית — ר' ההערה ליד הכפתור. */
  var delBtn = overlay.querySelector("[data-rdelete]");
  if (delBtn) delBtn.addEventListener("click", function () {
    var famName = (resVal(r, c.family) || "משק הבית").trim();
    CBA.ui.confirm(
      'השורה של "' + famName + '" תרד מהגיליון, וכל מי שרשום בה יאבד גישה ' +
      'לאפליקציה מיד. אי אפשר לשחזר מכאן.\n\n' +
      'אם המשפחה פשוט עזבה — בטלו וסמנו "עזב" במקום, כדי שההיסטוריה שלה תישאר.',
      { title: "למחוק את משק הבית?", okText: "מחק", danger: true }
    ).then(function (yes) {
      if (!yes) return;
      var release = CBA.ui.busy ? CBA.ui.busy(delBtn, "מוחק…") : function () {};
      CBA.data.deleteResidentRow(rowIndex, function (res) {
        release();
        if (!res || !res.ok) {
          /* ⚠️ שומר הסף של ההיסטוריה מחזיר הודעה שמסבירה **למה** ומה
             לעשות במקום — ולכן מציגים אותה כמות שהיא ולא "המחיקה נכשלה". */
          return CBA.ui.alert((res && res.error) || "המחיקה נכשלה");
        }
        resCloseDrawer();
        CBA.ui.toast("משק הבית נמחק");
        /* ⚠️ טעינה מחדש מהשרת ולא רק ציור מחדש: השורה ירדה מהגיליון,
           וכל אינדקס שמור אחריה זז. בדיוק מה שכפתור "רענן" עושה. */
        resState.loaded = false;
        CBA.data.refreshResidents(function () { resLoad(container); });
      });
    });
  });

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
      // (2026-08-19, ממצא 2.6) אישור שינוי הרשאות — מודל של האפליקציה.
      // השמירה עצמה הוצאה לפונקציה בשם, כי מודל הוא א-סינכרוני.
      CBA.ui.confirm(txt, { title: "לשנות הרשאות?", okText: "שמור הרשאות" }).then(function (okPerm) {
        if (okPerm) savePermsConfirmed();
      });

      function savePermsConfirmed() {
      btn.disabled = true; btn.textContent = "שומר…";
      if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSave");
      CBA.data.savePermissions(rowIndex, slot, perms, function (res) {
        if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSave");
        btn.disabled = false; btn.textContent = "שמור הרשאות";
        if (!res || !res.ok) {
          CBA.ui.alert("שמירת ההרשאות נכשלה: " + ((res && res.error) || "שגיאה"));
          return;
        }
        resState.loaded = false;
        CBA.data.refreshResidents(function () {
          resLoad(container);
          resCloseDrawer();
        });
      });
      }
    });
  });

  overlay.querySelector("[data-rsave]").addEventListener("click", function () {
    var fields = {};
    overlay.querySelectorAll("[data-rf]").forEach(function (el) { fields[el.dataset.rf] = el.value; });
    // מעבר בתוך השיכון — אותה ישות, רק בית אחר. מאשרים במפורש כדי שלא יקרה בהיסח דעת.
    var newHouse = c.house ? String(fields[c.house] || "").trim() : origHouse;
    // (2026-08-19, ממצא 2.6) אישור שינוי מספר בית — מודל של האפליקציה.
    // כשאין שינוי בית ממשיכים ישר, בלי לשאול כלום (כמו קודם).
    if (txN && c.house && newHouse !== origHouse) {
      CBA.ui.confirm(
        'מספר הבית משתנה מ-' + origHouse + ' ל-' + newHouse + '.\n' +
        'זה מתאים למעבר של אותה משפחה בתוך השיכון — ' + txN + ' התנועות הקיימות יישארו משויכות אליה.\n' +
        'אם מדובר בדיירים חדשים, בטלו והשתמשו ב"החלפת משפחה".',
        { title: "מספר הבית משתנה", okText: "המשך ושמור" }
      ).then(function (okMove) { if (okMove) doSaveResident(); });
      return;
    }
    doSaveResident();

    function doSaveResident() {
    var btn = overlay.querySelector("[data-rsave]");
    btn.disabled = true; btn.textContent = "שומר…";
    if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSave");
    CBA.data.saveResidentRow(rowIndex, fields, function (res) {
      if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSave");
      if (!res || !res.ok) {
        btn.disabled = false; btn.textContent = "שמור";
        CBA.ui.alert("השמירה נכשלה: " + ((res && res.error) || "שגיאה"));
        return;
      }
      resCloseDrawer();
      resState.loaded = false;
      CBA.data.refreshResidents(function () { resLoad(container); });
      CBA.ui.toast("נשמר");
    });
    }
  });

  /* (2026-08-19, ממצא 2.6) "החלפת משפחה" הייתה שרשרת של שלושה חלונות דפדפן
     ברצף (שם → בית → אישור) — הפעולה הכי הרסנית במסך התושבים, דרך הממשק הכי
     גנרי שיש. עכשיו אותה שרשרת במודלים של האפליקציה, עם ולידציה בכל שלב
     ואישור אחרון אדום שמסביר בדיוק מה עומד לקרות. */
  /* RSB4 (גל 8, 1.10.26) — בלי נעילה בזמן הבקשה, לחיצה כפולה פתחה שתי שורות חדשות */
  var repBtn = overlay.querySelector("[data-replace]");
  var replaceInFlight = false;
  repBtn.addEventListener("click", function () {
    if (replaceInFlight) return;
    CBA.ui.prompt("המשפחה שתיכנס לבית הזה.", { title: "החלפת משפחה", placeholder: "שם משפחה", okText: "המשך" })
      .then(function (fam) {
        if (fam === null) return;
        fam = String(fam).trim();
        if (!fam) { CBA.ui.alert("צריך שם משפחה."); return; }
        CBA.ui.prompt("מספר הבית של המשפחה הנכנסת.",
          { title: "מספר בית", value: resVal(freshRow(), c.house) || "", okText: "המשך" }
        ).then(function (house) {
          if (house === null) return;
          CBA.ui.confirm(
            'הדיירים הנוכחיים יסומנו כ"עזבו" ו-' + txN + ' התנועות יישארו משויכות אליהם.\n' +
            'תיפתח שורה חדשה למשפחת ' + fam + ' עם מזהה קבוע משלה.',
            { title: "להחליף את המשפחה בבית?", okText: "כן, החלף", danger: true }
          ).then(function (ok) {
            if (!ok || replaceInFlight) return;
            replaceInFlight = true;   // RSB4
            var releaseRep = CBA.ui.busy ? CBA.ui.busy(repBtn, "מחליף…") : function () {};
            if (CBA.sheets.markDirty) CBA.sheets.markDirty("residentsSave");
            CBA.data.replaceFamily({ rowIndex: rowIndex, family: fam, house: String(house).trim() }, function (res) {
              replaceInFlight = false; releaseRep();   // RSB4
              if (CBA.sheets.clearDirty) CBA.sheets.clearDirty("residentsSave");
              if (!res || !res.ok) { CBA.ui.alert("הפעולה נכשלה: " + ((res && res.error) || "שגיאה")); return; }
              resCloseDrawer();
              resState.loaded = false;
              CBA.data.refreshResidents(function () { resLoad(container); });
              CBA.ui.toast("המשפחה הוחלפה");
            });
          });
        });
      });
  });
}

/* RSB10 (גל 8, 1.10.26) — נמחק כאן הבלוק הישן של CBA.screens.committeeAdmin (עריכת עץ הוועד v1): קוד מת,
   committeeTree.js נטען אחרי הקובץ הזה ודורס את הרישום, ואף פונקציה ממנו לא נקראה מבחוץ. */
