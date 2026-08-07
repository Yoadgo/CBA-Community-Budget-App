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
  q: "", filter: "active"   // active | left | all
};

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
  { code: "תושבים", label: "ניהול תושבים",          hint: "מסך התושבים ובקשות ההרשמה" }
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

function resLoad(container) {
  if (resState.loading) return;
  resState.loading = true;
  resState.error = null;
  var pending = 2;
  var done = function () {
    if (--pending === 0) { resState.loading = false; resState.loaded = true; CBA.screens.residents.render(container); }
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
          '<button class="btn-ghost btn-sm" data-res-export>ייצוא לגיליון</button>' +
          '<button class="btn-ghost btn-sm" data-res-reload>רענן</button>' +
        '</div>' +
      '</div>' +
      '<div class="card tx-card" style="--tx-cols: 70px 1fr 1.2fr 1.4fr 84px 150px 84px">' +
        '<div class="tx-head">' +
          '<div>בית</div><div>משפחה</div><div>דיירים</div><div>אימייל</div>' +
          '<div>תנועות</div><div>הרשאות</div><div>סטטוס</div>' +
        '</div>' +
        (visible.length
          ? '<div class="tx-list">' + visible.map(function (r) {
              return resRowHTML(r, c, st.rows.indexOf(r));
            }).join("") + '</div>'
          : '<div class="res-msg">לא נמצאו תושבים בסינון הזה</div>') +
      '</div>';

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
  return '<div class="tx-row res-row' + (active ? "" : " is-left") + '" data-res-row="' + (idx + 2) + '" data-res-idx="' + idx + '">' +
    '<div class="tx-c">' + CBA.esc(resVal(r, c.house) || "—") + '</div>' +
    '<div class="tx-c res-fam">' + CBA.esc(resVal(r, c.family) || "—") + '</div>' +
    '<div class="tx-c">' + CBA.esc(names || "—") + '</div>' +
    '<div class="tx-c res-mail" title="' + CBA.esc(emails.join(", ")) + '">' +
      (emails.length ? CBA.esc(emails.join(", ")) : '<span class="res-dim">אין מייל</span>') + '</div>' +
    '<div class="tx-c">' + (n ? '<span class="res-n res-n--tx" title="תנועות המשויכות למשק הבית">' + n + '</span>' : '<span class="res-dim">—</span>') + '</div>' +
    '<div class="tx-c res-c-perm">' + resPermBadges(r, c) + '</div>' +
    '<div class="tx-c">' + (active ? '<span class="badge badge--paid">פעיל</span>' : '<span class="badge">עזב</span>') + '</div>' +
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
          '<span class="res-dim">' + CBA.esc(s.email) + ' · בית ' + CBA.esc(s.house || "—") + '</span>' +
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
      CBA.data.approveSignup(payload, function (res) {
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
      CBA.data.rejectSignup(b.dataset.suNo, function (res) {
        if (!res || !res.ok) { b.disabled = false; window.alert("הדחייה נכשלה"); return; }
        resState.loaded = false; resLoad(container);
      });
    });
  });
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
      var who = resVal(r, c.firstName[slot - 1]) || resVal(r, c.email[slot - 1]);
      var txt = perms.length
        ? 'לתת ל' + who + ' את ההרשאות: ' + perms.map(resPermLabel).join(", ") + '?'
        : 'להסיר מ' + who + ' את כל ההרשאות המיוחדות? הוא יישאר תושב רגיל.';
      if (perms.indexOf("על") !== -1) {
        txt += '\n\nשים לב: מנהל על רואה את כל התכנים ויכול לשנות הרשאות של כל אחד, כולל שלך.';
      }
      if (!window.confirm(txt)) return;
      btn.disabled = true; btn.textContent = "שומר…";
      CBA.data.savePermissions(rowIndex, slot, perms, function (res) {
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
    CBA.data.saveResidentRow(rowIndex, fields, function (res) {
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
    var house = window.prompt("מספר בית:", resVal(r, c.house) || "");
    if (house === null) return;
    if (!window.confirm('הדיירים הנוכחיים יסומנו כ"עזבו" ו-' + txN + ' התנועות יישארו משויכות אליהם.\n' +
      'תיפתח שורה חדשה למשפחת ' + fam + ' עם מזהה קבוע משלה. להמשיך?')) return;
    CBA.data.replaceFamily({ rowIndex: rowIndex, family: fam, house: String(house).trim() }, function (res) {
      if (!res || !res.ok) { window.alert("הפעולה נכשלה: " + ((res && res.error) || "שגיאה")); return; }
      resCloseDrawer();
      resState.loaded = false;
      CBA.data.refreshResidents(function () { resLoad(container); });
    });
  });
}
