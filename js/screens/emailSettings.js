/* מסך "מרכז התראות" (23.9.2026).
   מחליף את "ניהול מיילים" (אותו מזהה מסך, emailSettings, כדי שכל קישור
   ואריח קיים ימשיכו לעבוד).

   מה רואים:
   - לשונית לכל תחום שהמנהל אחראי עליו (מנהל-על — כולם + "הגדרות כלליות").
   - בכל תחום טבלה: שורה = פעולה, עמודה = מי מקבל. בכל תא הכפתורים מייל /
     פוש (ובגינון גם "בסיכום").
   - 🔑 במצב הרגיל התא מציג **רק מה שדלוק**. מעבר עכבר על התא (או מקלדת,
     או לחיצה בטלפון) פותח את כל הכפתורים, ואז מדליקים/מכבים.
   - לחיצה על שם הפעולה פותחת חלונית: טקסט הפוש (עם תצוגה מקדימה),
     מה מופיע באפליקציה, והמייל.

   סבב 3 (23.9, יועד):
   - 🔑 הרשאות: עריכה — מנהל-על בלבד. מנהל תחום רואה את התחום שלו לקריאה
     בלבד, ויכול **להציע** טריגר או סיכום חדש בתחום שלו (ממתין לאישור).
     שורת הסבר בראש המסך אומרת לכל אחד מה מותר לו.
   - "ניסוח עם AI" בחלונית: הצעה → "להכניס לשדות" → רק "שמירה" כותבת.
   - "טריגר חדש" (מתיאור חופשי, עם AI) ו"סיכום חדש" (מדדים לתחום + AI
     לנוסח). נשמרים כשורות רגילות בלשונית התחום.

   מקור האמת: טאבים "הגדרות התראות", "הגדרות מיילים" ו"טריגרים מותאמים"
   בגיליון, דרך Notify.gs. המידור נעשה בשרת — המסך מציג רק מה שחזר. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  var S = { data: null, tab: null, open: null, draft: null, dRole: null, lastField: null,
            mode: null, b: null, ai: null, confirmDel: false };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var TOUCH = window.matchMedia && window.matchMedia("(hover: none)").matches;
  var SPARK = '<svg class="nt-ai-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.81 15.9 9 18.75l-.81-2.85a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.85-.81a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.81 2.85a4.5 4.5 0 0 0 3.09 3.09l2.85.81-2.85.81a4.5 4.5 0 0 0-3.09 3.09ZM18.26 8.72 18 9.75l-.26-1.03a3.38 3.38 0 0 0-2.46-2.46L14.25 6l1.03-.26a3.38 3.38 0 0 0 2.46-2.46L18 2.25l.26 1.03a3.38 3.38 0 0 0 2.46 2.46l1.03.26-1.03.26a3.38 3.38 0 0 0-2.46 2.46Z"/></svg>';

  function canEdit() { return !!(S.data && S.data.canEdit); }
  function builder() { return (S.data && S.data.builder) || { domains: [] }; }

  function dom(id) {
    var ds = (S.data && S.data.domains) || [];
    for (var i = 0; i < ds.length; i++) if (ds[i].id === id) return ds[i];
    return null;
  }
  function findRow(id) {
    var ds = (S.data && S.data.domains) || [];
    for (var i = 0; i < ds.length; i++) {
      for (var j = 0; j < ds[i].rows.length; j++) if (ds[i].rows[j].id === id) return { d: ds[i], r: ds[i].rows[j] };
    }
    return null;
  }

  /* ---------- תא ---------- */
  var LBL = { m: "מייל", p: "פוש", d: "בסיכום" };
  function tg(kind, on, row, role, dis) {
    return '<button type="button" class="nt-tg nt-tg--' + kind + (on ? " on" : "") + '" data-row="' + esc(row) +
      '" data-role="' + role + '" data-kind="' + kind + '" aria-pressed="' + !!on + '"' +
      (dis ? ' disabled title="' + esc(dis) + '"' : "") + ">" + LBL[kind] + "</button>";
  }
  function cellHTML(d, row, role) {
    var c = row.cells[role];
    if (!c) return '<span class="nt-na" aria-label="לא רלוונטי">·</span>';
    var kinds = ["m", "p"];
    if (c.d || (d.id === "gar" && (role === "a" || role === "s"))) kinds.push("d");
    var anyOn = kinds.some(function (k) { return c[k]; });
    /* צפייה בלבד — רק מה שדלוק, בלי כפתורים ובלי פתיחה במעבר עכבר. */
    if (!canEdit()) {
      var on = kinds.filter(function (k) { return c[k]; });
      return '<div class="nt-cell nt-cell--ro">' + (on.length
        ? on.map(function (k) { return '<span class="nt-tg nt-tg--' + k + ' on">' + LBL[k] + "</span>"; }).join("")
        : '<span class="nt-off nt-off--ro">—</span>') + "</div>" + (c.n ? '<span class="nt-cnote">' + esc(c.n) + "</span>" : "");
    }
    var h = '<div class="nt-cell' + (anyOn ? "" : " is-empty") + '" tabindex="0" aria-label="' +
      esc(d.cols[role] + " — " + row.ev) + '">';
    kinds.forEach(function (k) {
      var dis = "";
      if (k === "m" && !c.hasMail) dis = "אין תבנית מייל לשורה הזו";
      if (k === "p" && c.nopush) dis = "אין לו עדיין אפליקציה";
      h += tg(k, c[k], row.id, role, dis);
    });
    h += '<span class="nt-off">—</span></div>';
    if (c.n) h += '<span class="nt-cnote">' + esc(c.n) + "</span>";
    return h;
  }

  var ST_CLS = { "פעיל": "ok", "מושהה": "mute", "ממתין לאישור": "wait", "נדחה": "bad", "בקשת פיתוח": "mute" };
  function stPill(st) { return '<span class="nt-st nt-st--' + (ST_CLS[st] || "mute") + '">' + esc(st) + "</span>"; }

  /* ---------- מסך ---------- */
  function tabsHTML() {
    var ds = S.data.domains;
    var h = ds.map(function (d) {
      var pend = d.rows.filter(function (r) { return r.cx && r.cx.status === "ממתין לאישור"; }).length;
      return '<button type="button" role="tab" class="nt-tab" data-tab="' + d.id + '" aria-selected="' + (S.tab === d.id) + '">' +
        esc(d.name) + (pend && canEdit() ? ' <span class="nt-badge" aria-label="' + pend + ' ממתינים לאישור">' + pend + "</span>" : "") + "</button>";
    }).join("");
    if (S.data.isSuper) h += '<button type="button" role="tab" class="nt-tab" data-tab="set" aria-selected="' + (S.tab === "set") + '">הגדרות כלליות</button>';
    return h;
  }

  function tableHTML(d) {
    var roles = Object.keys(d.cols);
    var head = '<tr><th>פעולה</th>' + roles.map(function (r) { return '<th class="nt-rc">' + esc(d.cols[r]) + "</th>"; }).join("") + "</tr>";
    var body = d.rows.map(function (row) {
      if (row.grp) return '<tr class="nt-grp"><td colspan="' + (roles.length + 1) + '"><span class="nt-grp-t">' + esc(row.grp) + "</span></td></tr>";
      var w = row.cx ? row.cx.schedLabel : row.w;
      return '<tr class="nt-row' + (row.cx ? " nt-row--cx" : "") + '"><td class="nt-ev"><button type="button" class="nt-evbtn" data-open="' + esc(row.id) + '"><b>' + esc(row.ev) + "</b>" +
        '<span class="nt-meta">' + (row.cx ? stPill(row.cx.status) + (row.cx.kind === "סיכום" ? '<span class="nt-kind">סיכום</span>' : "") : "") +
        "<span>" + esc(w) + "</span>" + (row.why && !row.cx ? "<span>" + esc(row.why) + "</span>" : "") + "</span></button></td>" +
        roles.map(function (r) { return '<td class="nt-rc">' + cellHTML(d, row, r) + "</td>"; }).join("") + "</tr>";
    }).join("");
    return '<div class="nt-tbl"><table><thead>' + head + "</thead><tbody>" + body + "</tbody></table></div>";
  }

  var RULE_LBL = {
    RULE_STALE_DAYS: "אחרי כמה ימים בקשה תקועה מקבלת תזכורת למנהל",
    RULE_WEEKLY_DAY: "יום הסיכום השבועי (0=ראשון … 6=שבת)",
    RULE_MONTHLY_DAY: "יום בחודש לסיכום בקשות ההחזר הפתוחות",
    RULE_CLUB_REMINDER_DAYS_BEFORE: "כמה ימים לפני שריון יוצאת תזכורת",
    RULE_GYM_RENEW_DAYS_BEFORE: "כמה ימים לפני סוף מנוי המכון יוצאת תזכורת חידוש",
    RULE_GYM_PAYMENT_NUDGE_DAYS: "אחרי כמה ימים בלי תשלום למכון יוצאת תזכורת",
    RULE_GYM_DECL_WARN_DAYS: "כמה ימים לפני שהצהרת הבריאות פגה יוצאת התרעה",
    RULE_GARDEN_WEEKLY_DAY: "יום הסיכום השבועי של הגינון (0=ראשון … 6=שבת)",
    RULE_GARDEN_FEEDBACK_DAYS: "כמה ימים אחרי סגירה תושב יכול לתת משוב",
    RULE_GARDEN_MERGE_DAYS: "בתוך כמה ימים דיווח חדש נחשב כפילות אפשרית",
    RULE_GARDEN_PHOTO_MAX: "כמה תמונות לכל היותר לדיווח גינון"
  };

  function settingsHTML() {
    var g = S.data.globals || [], vals = S.data.globalValues || {};
    var h = '<h2 class="nt-h2">הגדרות כלליות</h2><p class="nt-sub">חלות על כל התחומים. רק מנהל-על רואה את הלשונית הזו.</p><div class="nt-glist">';
    g.forEach(function (x) {
      var sel = vals[x.id] || x.def;
      h += '<div class="nt-g"><div class="nt-gt"><b>' + esc(x.t) + "</b><span>" + esc(x.s) + '</span></div><div class="nt-opts" role="group" aria-label="' + esc(x.t) + '">' +
        x.o.map(function (o) {
          return '<button type="button" class="nt-opt" data-g="' + x.id + '" data-v="' + o[0] + '" aria-pressed="' + (sel === o[0]) + '">' + esc(o[1]) + "</button>";
        }).join("") + "</div></div>";
    });
    h += "</div>";
    var rules = S.data.rules || [];
    if (rules.length) {
      h += '<h3 class="nt-h3">מספרים ומועדים</h3><div class="nt-glist">';
      rules.forEach(function (r) {
        h += '<div class="nt-g"><div class="nt-gt"><b>' + esc(RULE_LBL[r.key] || r.key) + "</b>" +
          (r.note && !RULE_LBL[r.key] ? "<span>" + esc(r.note) + "</span>" : "") + "</div>" +
          '<div class="nt-rule"><input type="number" min="0" max="999" class="field-input nt-num" data-rule="' + esc(r.key) + '" value="' + esc(r.value) + '"></div></div>';
      });
      h += "</div>";
    }
    var dev = S.data.devRequests || [];
    h += '<h3 class="nt-h3">בקשות פיתוח</h3><p class="nt-sub">טריגרים שתוארו במרכז ההתראות ודורשים חיבור בקוד (למשל "כשמישהו עושה…").</p>';
    h += dev.length ? '<div class="nt-glist">' + dev.map(function (x) {
      return '<div class="nt-g"><div class="nt-gt"><b>' + esc(x.name) + "</b><span>" + esc(x.prompt) + (x.byName ? " · " + esc(x.byName) : "") + "</span></div>" +
        '<button type="button" class="btn-ghost nt-sm" data-cxop="delete" data-cxid="' + esc(x.id) + '">טופל — להסיר</button></div>';
    }).join("") + "</div>" : '<p class="nt-hint">אין בקשות פתוחות.</p>';
    return h;
  }

  function panelHTML() {
    if (S.tab === "set") return settingsHTML();
    var d = dom(S.tab);
    return d ? tableHTML(d) : "";
  }

  /* 🔑 מי יכול מה — שורה ברורה, מותאמת למי שנכנס (בקשת יועד). */
  function permHTML() {
    var names = S.data.domains.map(function (d) { return d.name; }).join(", ");
    var pend = 0;
    S.data.domains.forEach(function (d) { d.rows.forEach(function (r) { if (r.cx && r.cx.status === "ממתין לאישור") pend++; }); });
    var main = canEdit()
      ? "<b>מנהל-על — עריכה מלאה.</b> כל שינוי כאן חל על כל הקהילה." +
        (pend ? ' <span class="nt-perm-hot">' + pend + " טריגרים ממתינים לאישורך (מסומנים בלשוניות).</span>" : "")
      : "<b>צפייה בלבד</b> · " + esc(names) + ". שינויים בטבלה ובנוסחים — מנהל-על בלבד. " +
        "אפשר להציע טריגר או סיכום חדש בתחום שלך; הוא יוצא רק אחרי אישור מנהל-על.";
    return '<div class="nt-perm"><div>' + main + "</div>" +
      '<details class="nt-perm-more"><summary>מי יכול מה?</summary><ul>' +
      "<li><b>מנהל-על</b> — רואה ועורך הכול, יוצר טריגרים וסיכומים בכל תחום, ומאשר את מה שמנהלי תחום הציעו.</li>" +
      "<li><b>מנהל תחום</b> — רואה את התחום שלו לקריאה בלבד, ויכול להציע בו טריגר או סיכום חדש (כולל AI). עד האישור — יכול לערוך או למחוק את ההצעה.</li>" +
      "<li><b>הגנן החיצוני</b> — אין גישה למסך. מקבל רק מה שהטבלה שולחת לו.</li>" +
      "<li><b>תושב</b> — אין גישה. שולט רק ב\"התראות לטלפון\" במכשיר שלו.</li></ul></details></div>";
  }

  function render(root) {
    var body = root;   // root הוא #nt-body עצמו
    if (!S.data) return;
    if (!S.data.domains.length && !S.data.isSuper) {
      body.innerHTML = '<div class="card">' + (CBA.ui && CBA.ui.emptyState ? CBA.ui.emptyState({ title: "אין תחומים לניהול", sub: "ההרשאות שלך לא כוללות תחום עם התראות." }) : "אין תחומים לניהול") + "</div>";
      return;
    }
    if (!S.tab) S.tab = S.data.domains.length ? S.data.domains[0].id : "set";
    var canBuild = builder().domains.length > 0;
    var anySum = builder().domains.some(function (d) { return (builder().metrics || {})[d.id]; });
    body.innerHTML = permHTML() +
      '<div class="nt-top"><div class="nt-seg" role="tablist" aria-label="תחום">' + tabsHTML() + "</div>" +
      (canBuild ? '<div class="nt-new">' +
        '<button type="button" class="btn-primary nt-newbtn" data-build="תזכורת">+ טריגר חדש</button>' +
        (anySum ? '<button type="button" class="btn-ghost nt-newbtn" data-build="סיכום">+ סיכום חדש</button>' : "") + "</div>" : "") +
      "</div>" +
      '<div class="nt-legend"><span class="nt-tg nt-tg--m on">מייל</span><span class="nt-tg nt-tg--p on">פוש</span><span class="nt-tg nt-tg--d on">בסיכום</span><span>= דלוק</span>' +
      (canEdit() ? '<span class="nt-legend-hint">' + (TOUCH ? "לחיצה על תא פותחת את כל האפשרויות" : "מעבר עם העכבר על תא מציג את כל האפשרויות") + "</span>" : "") +
      '<span class="nt-save" id="nt-save" aria-live="polite"></span></div>' +
      '<section class="card nt-panel" id="nt-panel">' + panelHTML() + "</section>";
  }

  function redrawAll() {
    var root = document.getElementById("nt-body");
    if (root) render(root);
  }
  function redrawPanel() {
    var p = document.getElementById("nt-panel");
    if (p) p.innerHTML = panelHTML();
  }

  function flash(msg, bad) {
    var el = document.getElementById("nt-save");
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle("is-bad", !!bad);
    clearTimeout(flash._t);
    if (!bad) flash._t = setTimeout(function () { el.textContent = ""; }, 2200);
  }
  function toast(msg, kind) { if (CBA.ui && CBA.ui.toast) CBA.ui.toast(msg, kind); else flash(msg, kind === "error"); }

  function reload(cb) {
    CBA.data.listNotifySettings(function (res) {
      if (res && res.ok) {
        S.data = res;
        if (S.tab && S.tab !== "set" && !dom(S.tab)) S.tab = null;
        redrawAll();
      }
      if (cb) cb(res);
    });
  }

  /* ---------- חלונית (שורה קיימת) ---------- */
  function closeDrawer() {
    var el = document.getElementById("nt-drawer");
    if (el) el.remove();
    S.open = null; S.draft = null; S.mode = null; S.b = null; S.ai = null; S.confirmDel = false;
    document.removeEventListener("keydown", onEsc);
  }
  function onEsc(e) { if (e.key === "Escape") closeDrawer(); }

  function cnt(v, max) {
    var n = String(v || "").length;
    return '<span class="' + (n > max ? "nt-over" : "") + '">' + n + "/" + max + "</span>";
  }
  function prev(t) {
    return esc(t).replace(/\{\{([^}]+)\}\}/g, '<span class="nt-var-prev">‹$1›</span>');
  }

  function openDrawer(id) {
    var f = findRow(id);
    if (!f) return;
    closeDrawer();
    var roles = Object.keys(f.d.cols).filter(function (r) { return f.r.cells[r]; });
    var on = roles.filter(function (r) { var c = f.r.cells[r]; return c.m || c.p || c.d; });
    S.mode = "row";
    S.open = f;
    S.dRole = on[0] || roles[0];
    S.draft = {};
    roles.forEach(function (r) { S.draft[r] = JSON.parse(JSON.stringify(f.r.cells[r])); S.draft[r]._dirty = {}; });
    mountDrawer();
    drawDrawer();
  }
  function mountDrawer() {
    var wrap = document.createElement("div");
    wrap.id = "nt-drawer";
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onEsc);
  }

  /* בלוק "טריגר שנוסף" — סטטוס, תזמון, מי הציע, ופעולות לפי הרשאה. */
  function cxBlockHTML(cx) {
    var acts = [];
    if (canEdit()) {
      if (cx.status === "ממתין לאישור") {
        acts.push('<button type="button" class="btn-primary nt-sm" data-cxop="approve">אישור והפעלה</button>');
        acts.push('<button type="button" class="btn-ghost nt-sm" data-cxop="reject">דחייה</button>');
      }
      if (cx.status === "פעיל") acts.push('<button type="button" class="btn-ghost nt-sm" data-cxop="pause">השהיה</button>');
      if (cx.status === "מושהה") acts.push('<button type="button" class="btn-primary nt-sm" data-cxop="activate">הפעלה</button>');
    }
    var mayEdit = canEdit() || (cx.mine && cx.status === "ממתין לאישור");
    if (mayEdit) {
      acts.push('<button type="button" class="btn-ghost nt-sm" data-cxedit>עריכת ההגדרות</button>');
      acts.push('<button type="button" class="btn-ghost nt-sm nt-danger" data-cxop="delete">' + (S.confirmDel ? "בטוח? למחוק" : "מחיקה") + "</button>");
    }
    return '<div class="nt-cxbox"><div class="nt-cxrow">' + stPill(cx.status) +
      (cx.kind === "סיכום" ? '<span class="nt-kind">סיכום</span>' : "") + "<span>" + esc(cx.schedLabel) + "</span></div>" +
      '<div class="nt-hint">' + (cx.byName ? "נוסף ע\"י " + esc(cx.byName) + ". " : "") +
      (cx.status === "ממתין לאישור" ? "לא יוצא לאף אחד עד שמנהל-על מאשר." : cx.status === "מושהה" ? "מושהה — לא יוצא עד שמפעילים." : "") + "</div>" +
      (cx.status === "ממתין לאישור" && canEdit() ? '<input type="text" class="field-input" id="nt-cx-note" maxlength="300" placeholder="הערה למי שהציע (לא חובה)">' : "") +
      (acts.length ? '<div class="nt-acts">' + acts.join("") + "</div>" : "") + '<span class="nt-save" id="nt-cxmsg" aria-live="polite"></span></div>';
  }

  function drawDrawer() {
    var wrap = document.getElementById("nt-drawer");
    if (!wrap || !S.open) return;
    var f = S.open, r = f.r, d = f.d, c = S.draft[S.dRole];
    var roles = Object.keys(S.draft);
    var screens = S.data.screens || [];
    var ro = !canEdit();
    var dis = ro ? " disabled" : "";
    var h = '<div class="drawer-backdrop" data-nclose></div>' +
      '<aside class="drawer nt-drawer" role="dialog" aria-modal="true" aria-labelledby="nt-dtitle">' +
      '<div class="drawer__head"><div><div class="drawer__title" id="nt-dtitle">' + esc(r.ev) + "</div>" +
      '<div class="drawer__sub">' + esc(d.name) + " · " + esc(r.cx ? r.cx.schedLabel : r.w) + "</div></div>" +
      '<button type="button" class="drawer__close" data-nclose aria-label="סגירה">×</button></div>' +
      '<div class="drawer__body nt-dbody">';
    if (ro) h += '<div class="nt-info"><b>צפייה בלבד.</b> שינויים בנוסחים ובנמענים — מנהל-על.</div>';
    if (r.cx) h += cxBlockHTML(r.cx);
    if (r.why && !r.cx) h += '<div class="nt-info">' + esc(r.why) + "</div>";
    h += '<div class="nt-seg nt-seg--roles" role="tablist" aria-label="נמען">' + roles.map(function (x) {
      var cc = S.draft[x];
      return '<button type="button" role="tab" class="nt-tab" data-drole="' + x + '" aria-selected="' + (x === S.dRole) + '">' +
        esc(d.cols[x]) + ((cc.m || cc.p || cc.d) ? ' <span class="nt-dot" aria-label="דלוק">●</span>' : "") + "</button>";
    }).join("") + "</div>";
    if (c.n) h += '<div class="nt-info"><b>תנאי:</b> ' + esc(c.n) + "</div>";
    if ((r.vars || []).length && !ro) {
      h += '<div><div class="nt-lbl">פרטים שאפשר לשלב — לחיצה מוסיפה לשדה האחרון שנבחר</div><div class="nt-vars">' +
        r.vars.map(function (v) { return '<button type="button" class="nt-var" data-var="' + esc(v) + '">{{' + esc(v) + "}}</button>"; }).join("") + "</div></div>";
    }
    /* פוש */
    h += '<div class="nt-sec' + (c.p ? "" : " is-off") + '"><h3>פוש ' + (ro ? (c.p ? '<span class="nt-tg nt-tg--p on">פוש</span>' : "") : tg("p", c.p, "_d", S.dRole, c.nopush ? "אין לו עדיין אפליקציה" : "")) + "</h3><div class=\"nt-sec-body\">" +
      '<div class="nt-notif" aria-hidden="true"><div class="nt-notif-ico">CBA</div><div><div class="nt-notif-a">קהילה · עכשיו</div>' +
      '<div class="nt-notif-t" id="nt-pv-t">' + prev(c.pt || "כותרת") + '</div><div class="nt-notif-b" id="nt-pv-b">' + prev(c.pb || "טקסט") + "</div></div></div>" +
      '<div><div class="nt-lbl"><label for="nt-f-pt">כותרת</label><span id="nt-c-pt">' + cnt(c.pt, 35) + "</span></div>" +
      '<input type="text" class="field-input" id="nt-f-pt" data-t="pt" maxlength="80" value="' + esc(c.pt) + '"' + dis + "></div>" +
      '<div><div class="nt-lbl"><label for="nt-f-pb">טקסט</label><span id="nt-c-pb">' + cnt(c.pb, 90) + "</span></div>" +
      '<input type="text" class="field-input" id="nt-f-pb" data-t="pb" maxlength="200" value="' + esc(c.pb) + '"' + dis + "></div>" +
      aiHTML("push") +
      '<div><div class="nt-lbl"><label for="nt-f-link">לחיצה על הפוש (והכפתור במייל) פותחת</label></div>' +
      '<select class="field-input" id="nt-f-link" data-t="link"' + dis + ">" + screens.map(function (s) {
        return "<option" + (s === c.link ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") + "</select></div></div></div>";
    /* באפליקציה */
    if (S.dRole === "r" && !r.cx) {
      h += '<div class="nt-sec"><h3>באפליקציה</h3><div class="nt-sec-body">' +
        (c.noapp ? '<div class="nt-info">לא מופיע אצל הנמען הזה באפליקציה.</div>' : "") +
        '<div><div class="nt-lbl"><label for="nt-f-app">השורה שמופיעה בעמוד הבית</label></div>' +
        '<input type="text" class="field-input" id="nt-f-app" data-t="app" maxlength="160" value="' + esc(c.app) + '" placeholder="למשל: שובץ לשבוע {{שבוע}}"' + dis + "></div>" +
        '<label class="nt-chk"><input type="checkbox" data-t="badge"' + (c.badge ? " checked" : "") + dis + '> סימון "עדכון חדש" בעמוד הבית עד שפותחים את המסך</label></div></div>';
    }
    /* מייל */
    h += '<div class="nt-sec' + (c.m ? "" : " is-off") + '"><h3>מייל ' + (ro ? (c.m ? '<span class="nt-tg nt-tg--m on">מייל</span>' : "") : tg("m", c.m, "_d", S.dRole, c.hasMail ? "" : "אין תבנית מייל לשורה הזו")) + "</h3><div class=\"nt-sec-body\">";
    if (c.hasMail) {
      h += '<div><div class="nt-lbl"><label for="nt-f-su">נושא</label></div><input type="text" class="field-input" id="nt-f-su" data-t="su" maxlength="200" value="' + esc(c.su) + '"' + dis + "></div>" +
        '<div><div class="nt-lbl"><label for="nt-f-bo">גוף המייל</label></div><textarea class="field-input nt-ta" id="nt-f-bo" data-t="bo" rows="9"' + dis + ">" + esc(c.bo) + "</textarea></div>" +
        aiHTML("mail") +
        ((S.dRole === "a" || S.dRole === "s") && r.cells.a && r.cells.s && r.cells.a.k === r.cells.s.k
          ? '<div class="nt-hint">מנהל התחום ומנהל-על מקבלים את אותו נוסח מייל.</div>' : "");
    } else {
      h += '<div class="nt-hint">לנמען הזה אין מייל בשורה הזו — רק פוש.</div>';
    }
    h += "</div></div>";
    h += "</div>";
    if (!ro) {
      h += '<div class="drawer__actions drawer__actions--sticky"><div class="drawer__actions-main">' +
        '<button type="button" class="btn-primary" data-nsave>שמירה</button><button type="button" class="btn-ghost" data-nclose>ביטול</button>' +
        '<span class="nt-save" id="nt-dmsg" aria-live="polite"></span></div></div>';
    }
    h += "</aside>";
    wrap.innerHTML = h;
  }

  /* ---------- ניסוח עם AI (בחלונית ובבונה) ---------- */
  var AI_DIRS = [["warm", "חם יותר"], ["short", "קצר יותר"], ["formal", "רשמי יותר"], ["fix", "תיקון עברית"]];
  function aiAllowed() {
    if (!S.data || !S.data.aiReady) return false;
    return S.mode === "build" || canEdit();
  }
  function aiHTML(sec) {
    if (!aiAllowed()) return "";
    var a = S.ai && S.ai.sec === sec ? S.ai : null;
    if (!a) return '<div><button type="button" class="nt-aibtn" data-aiopen="' + sec + '">' + SPARK + "ניסוח עם AI</button></div>";
    var h = '<div class="nt-aibox"><div class="nt-aitag">הצעה של AI — לא נשמרת עד שמכניסים ולוחצים "שמירה"</div>' +
      '<div class="nt-opts" role="group" aria-label="כיוון">' + AI_DIRS.map(function (x) {
        return '<button type="button" class="nt-opt" data-aidir="' + x[0] + '" aria-pressed="' + (a.dir === x[0]) + '">' + x[1] + "</button>";
      }).join("") + "</div>" +
      '<input type="text" class="field-input" id="nt-ai-free" maxlength="300" placeholder="או במילים שלך: &quot;תזכיר שאפשר לצרף תמונה&quot;" value="' + esc(a.free || "") + '">' +
      '<div class="nt-acts"><button type="button" class="btn-ghost nt-sm" data-aigo>' + (a.busy ? "חושב…" : (a.res ? "הצעה אחרת" : "להציע ניסוח")) + "</button>" +
      '<button type="button" class="btn-ghost nt-sm" data-aiclose>סגירה</button></div>';
    if (a.err) h += '<div class="nt-over">' + esc(a.err) + "</div>";
    if (a.res) {
      var cur = aiGet(sec);
      var bad = (a.res.missing || []).length || (a.res.unknown || []).length;
      h += '<div class="nt-diff"><div class="nt-was"><small>עכשיו</small><b>' + prev(cur.title) + "</b><div>" + prev(cur.text).replace(/\n/g, "<br>") + "</div></div>" +
        '<div class="nt-now"><small>הצעה</small><b>' + prev(a.res.title) + "</b><div>" + prev(a.res.text).replace(/\n/g, "<br>") + "</div></div></div>";
      if (bad) {
        h += '<div class="nt-over">ההצעה ' + ((a.res.missing || []).length ? "השמיטה את " + a.res.missing.map(function (v) { return "{{" + v + "}}"; }).join(", ") : "") +
          ((a.res.unknown || []).length ? " הוסיפה פרטים שלא קיימים: " + a.res.unknown.join(", ") : "") + " — אי אפשר להכניס אותה. נסה הצעה אחרת.</div>";
      } else {
        h += '<div class="nt-acts"><button type="button" class="btn-primary nt-sm" data-aiuse>להכניס לשדות</button></div>';
      }
    }
    return h + "</div>";
  }
  /* השדות הנוכחיים של הסעיף — מהחלונית או מהבונה. */
  function aiGet(sec) {
    var src = S.mode === "build" ? S.b.draft : S.draft[S.dRole];
    return sec === "mail" ? { title: src.su || "", text: src.bo || "" } : { title: src.pt || "", text: src.pb || "" };
  }
  function aiSet(sec, title, text) {
    if (S.mode === "build") {
      if (sec === "mail") { S.b.draft.su = title; S.b.draft.bo = text; } else { S.b.draft.pt = title; S.b.draft.pb = text; }
      return;
    }
    var dr = S.draft[S.dRole];
    var kt = sec === "mail" ? "su" : "pt", kb = sec === "mail" ? "bo" : "pb";
    dr[kt] = title; dr[kb] = text; dr._dirty[kt] = true; dr._dirty[kb] = true;
  }
  function aiVars() {
    if (S.mode === "build") return buildVars();
    return (S.open && S.open.r.vars) || [];
  }
  function redrawCurrent() { if (S.mode === "build") drawBuilder(); else drawDrawer(); }
  function aiRun() {
    var a = S.ai;
    if (!a || a.busy) return;
    var fr = document.getElementById("nt-ai-free");
    if (fr) a.free = fr.value;
    var cur = aiGet(a.sec);
    if (!cur.title && !cur.text) { a.err = "אין עדיין נוסח — כתבו משהו קצר, וה-AI ישפר."; redrawCurrent(); return; }
    a.busy = true; a.err = "";
    redrawCurrent();
    var ctx = S.mode === "build"
      ? { ev: S.b.draft.name, role: "", dom: (bDom() || {}).name }
      : { ev: S.open.r.ev, role: S.open.d.cols[S.dRole], dom: S.open.d.name };
    CBA.data.notifyAiRewrite({ sec: a.sec, title: cur.title, text: cur.text, dir: a.dir || "", free: a.free || "",
                               vars: aiVars(), ctx: ctx }, function (res) {
      if (S.ai !== a) return;
      a.busy = false;
      if (!res || !res.ok) { a.err = (res && res.error) || "ה-AI לא ענה. נסו שוב."; a.res = null; }
      else a.res = res;
      redrawCurrent();
    });
  }

  function saveDrawer(btn) {
    var f = S.open;
    if (!f) return;
    var jobs = [];
    Object.keys(S.draft).forEach(function (role) {
      var dr = S.draft[role], dirty = dr._dirty || {}, fields = {};
      Object.keys(dirty).forEach(function (k) { fields[k] = dr[k]; });
      if (Object.keys(fields).length) jobs.push({ role: role, fields: fields });
    });
    if (!jobs.length) { closeDrawer(); return; }
    var release = CBA.ui && CBA.ui.busy ? CBA.ui.busy(btn, "שומר…") : function () {};
    var i = 0;
    (function next() {
      if (i >= jobs.length) {
        release();
        jobs.forEach(function (j) {
          var cell = f.r.cells[j.role];
          Object.keys(j.fields).forEach(function (k) { cell[k] = j.fields[k]; });
          /* אותו נוסח מייל לשני תאי המנהל — מעדכנים גם את השכן. */
          Object.keys(f.r.cells).forEach(function (x) {
            var o = f.r.cells[x];
            if (o && o !== cell && o.k && o.k === cell.k) {
              if (j.fields.su !== undefined) o.su = j.fields.su;
              if (j.fields.bo !== undefined) o.bo = j.fields.bo;
            }
          });
        });
        closeDrawer();
        redrawPanel();
        flash("נשמר");
        return;
      }
      var j = jobs[i++];
      CBA.data.saveNotifyCell(f.r.id, j.role, j.fields, function (res) {
        if (!res || !res.ok) {
          release();
          var m = document.getElementById("nt-dmsg");
          if (m) m.textContent = (res && res.error) || "השמירה נכשלה";
          return;
        }
        next();
      });
    })();
  }

  function toggleCell(btn) {
    var kind = btn.dataset.kind, role = btn.dataset.role;
    if (btn.dataset.row === "_d") {
      var dr = S.draft[role];
      dr[kind] = !dr[kind];
      dr._dirty[kind] = true;
      drawDrawer();
      return;
    }
    var f = findRow(btn.dataset.row);
    if (!f) return;
    var cell = f.r.cells[role];
    var nv = !cell[kind];
    cell[kind] = nv;
    btn.classList.toggle("on", nv);
    btn.setAttribute("aria-pressed", String(nv));
    var holder = btn.closest(".nt-cell");
    if (holder) holder.classList.toggle("is-empty", !holder.querySelector(".nt-tg.on"));
    flash("שומר…");
    var fields = {};
    fields[kind] = nv;
    CBA.data.saveNotifyCell(f.r.id, role, fields, function (res) {
      if (res && res.ok) return flash("נשמר");
      cell[kind] = !nv;
      btn.classList.toggle("on", !nv);
      btn.setAttribute("aria-pressed", String(!nv));
      if (holder) holder.classList.toggle("is-empty", !holder.querySelector(".nt-tg.on"));
      flash((res && res.error) || "השמירה נכשלה", true);
    });
  }

  function saveGlobal(btn) {
    var id = btn.dataset.g, v = btn.dataset.v;
    var prevV = (S.data.globalValues || {})[id];
    btn.parentNode.querySelectorAll(".nt-opt").forEach(function (x) { x.setAttribute("aria-pressed", String(x === btn)); });
    S.data.globalValues[id] = v;
    flash("שומר…");
    CBA.data.saveNotifyGlobal(id, v, function (res) {
      if (res && res.ok) return flash("נשמר");
      S.data.globalValues[id] = prevV;
      redrawPanel();
      flash((res && res.error) || "השמירה נכשלה", true);
    });
  }

  /* ---------- פעולות על טריגר מותאם ---------- */
  function cxOp(op, id, btn) {
    if (op === "delete" && !S.confirmDel && S.mode === "row") { S.confirmDel = true; drawDrawer(); return; }
    var noteEl = document.getElementById("nt-cx-note");
    var release = btn && CBA.ui && CBA.ui.busy ? CBA.ui.busy(btn, "…") : function () {};
    CBA.data.customTriggerAction(id, op, noteEl ? noteEl.value : "", function (res) {
      release();
      if (!res || !res.ok) {
        var m = document.getElementById("nt-cxmsg");
        if (m) m.textContent = (res && res.error) || "הפעולה נכשלה";
        else toast((res && res.error) || "הפעולה נכשלה", "error");
        return;
      }
      closeDrawer();
      toast({ approve: "אושר — הטריגר פעיל", reject: "נדחה", pause: "הושהה", activate: "הופעל", "delete": "נמחק" }[op] || "בוצע", "success");
      reload();
    });
  }

  /* ======================================================================
   *  הבונה — "טריגר חדש" / "סיכום חדש"
   * ==================================================================== */
  var TYPES = [["daily", "כל יום"], ["weekly", "כל שבוע"], ["monthly", "כל חודש"], ["once", "פעם אחת"], ["cal", "לפי היומן"]];
  var EXAMPLES = [
    "כל יום חמישי ב-18:00 תזכורת לכל התושבים להוציא את הפח הכתום",
    "שלושה ימים לפני כל חופשת גנים — פוש לכל התושבים",
    "ב-1 לכל חודש ב-9:00 מייל למנהלי התקציב לסגור קבלות"
  ];

  function bDom() {
    var ds = builder().domains;
    for (var i = 0; i < ds.length; i++) if (ds[i].id === S.b.draft.dom) return ds[i];
    return null;
  }
  function bMetrics() { return ((builder().metrics || {})[S.b.draft.dom]) || []; }
  function bRoles() {
    var d = bDom();
    if (!d) return {};
    var out = {};
    Object.keys(d.roles).forEach(function (r) { if (S.b.kind !== "סיכום" || r !== "all") out[r] = d.roles[r]; });
    return out;
  }
  function buildVars() {
    var v = builder().vars || { base: ["תאריך", "יום"], cal: ["שם האירוע", "תאריך", "מיקום", "ימים"] };
    if (S.b.kind === "סיכום") {
      var ids = S.b.draft.metrics.ids;
      return v.base.concat(bMetrics().filter(function (m) { return ids.indexOf(m[0]) !== -1; }).map(function (m) { return m[1]; }));
    }
    return S.b.draft.sched.type === "cal" ? v.cal : v.base;
  }

  function newDraft(kind) {
    var ds = builder().domains;
    var d0 = ds[0];
    if (kind === "סיכום") {
      var withM = ds.filter(function (d) { return (builder().metrics || {})[d.id]; });
      d0 = withM.filter(function (d) { return d.id === S.tab; })[0] || withM[0];
    } else {
      d0 = ds.filter(function (d) { return d.id === S.tab; })[0] || ds[0];
    }
    var roles = kind === "סיכום" ? [d0.roles.a ? "a" : "s"] : [d0.roles.all ? "all" : Object.keys(d0.roles)[0]];
    var mets = ((builder().metrics || {})[d0.id] || []).filter(function (m) { return !m[2]; }).slice(0, 3).map(function (m) { return m[0]; });
    return { name: "", dom: d0.id, roles: roles, sched: { type: "weekly", hour: 9, dow: 0, mday: 1, date: "", cat: "any", offset: 3 },
             channels: { m: false, p: true }, pt: "", pb: "", su: "", bo: "", prompt: "", metrics: { ids: mets, only: true } };
  }

  function openBuilder(kind, cx) {
    closeDrawer();
    S.mode = "build";
    if (cx) {
      /* עריכה — הנוסחים מהתא הראשון של הטריגר. */
      var f = findRow(cx.id), c0 = f && f.r.cells[cx.roles[0]] || {};
      S.b = { kind: cx.kind === "סיכום" ? "סיכום" : "תזכורת", id: cx.id, step: "form",
              draft: { name: cx.name, dom: cx.dom, roles: cx.roles.slice(), prompt: cx.prompt || "",
                       sched: Object.assign({ hour: 9, dow: 0, mday: 1, date: "", cat: "any", offset: 3 }, cx.sched),
                       channels: { m: !!c0.m, p: !!c0.p }, pt: c0.pt || "", pb: c0.pb || "", su: c0.su || "", bo: c0.bo || "",
                       metrics: { ids: (cx.metrics && cx.metrics.ids) || [], only: !(cx.metrics && cx.metrics.only === false) } } };
    } else {
      S.b = { kind: kind, step: kind === "סיכום" || !S.data.aiReady ? "form" : "ask", draft: newDraft(kind) };
    }
    mountDrawer();
    drawBuilder();
  }

  function opt(val, label, sel) { return '<option value="' + esc(val) + '"' + (String(val) === String(sel) ? " selected" : "") + ">" + esc(label) + "</option>"; }

  function drawBuilder() {
    var wrap = document.getElementById("nt-drawer");
    if (!wrap || !S.b) return;
    var b = S.b, d = b.draft, isSum = b.kind === "סיכום";
    var title = b.id ? (isSum ? "עריכת סיכום" : "עריכת טריגר") : (isSum ? "סיכום חדש" : "טריגר חדש");
    var h = '<div class="drawer-backdrop" data-nclose></div>' +
      '<aside class="drawer nt-drawer nt-builder" role="dialog" aria-modal="true" aria-labelledby="nt-btitle">' +
      '<div class="drawer__head"><div><div class="drawer__title" id="nt-btitle">' + title + "</div>" +
      '<div class="drawer__sub">' + (builder().isSuper ? "נכנס לטבלה כמושהה — או מופעל מיד, לבחירתך."
        : "ההצעה תחכה לאישור מנהל-על, ורק אז תצא.") + "</div></div>" +
      '<button type="button" class="drawer__close" data-nclose aria-label="סגירה">×</button></div>' +
      '<div class="drawer__body nt-dbody">';

    if (b.step === "ask") {
      h += '<div><div class="nt-lbl"><label for="nt-b-prompt">מה ההתראה? במשפט אחד — למי, מתי ומה כתוב</label></div>' +
        '<textarea class="field-input nt-ta nt-ta--s" id="nt-b-prompt" data-b="prompt" maxlength="500" rows="3">' + esc(d.prompt) + "</textarea></div>" +
        '<div class="nt-vars">' + EXAMPLES.map(function (e, i) { return '<button type="button" class="nt-var" data-bex="' + i + '">' + esc(e) + "</button>"; }).join("") + "</div>" +
        '<div class="nt-acts"><button type="button" class="btn-primary" data-bgo>' + (b.busy ? "בונה…" : SPARK + "לבנות עם AI") + "</button>" +
        '<button type="button" class="btn-ghost" data-bmanual>למלא ידנית</button></div>' +
        (b.err ? '<div class="nt-over">' + esc(b.err) + "</div>" : "") +
        '<div class="nt-hint">ה-AI בונה לבד כל מה שתלוי בזמן או ביומן האירועים. "כשמישהו עושה…" דורש חיבור בקוד — ישמר כבקשת פיתוח.</div>';
    } else {
      if (b.feasible === false) {
        h += '<div class="nt-codebox"><b>זה דורש חיבור בקוד</b><div>' + esc(b.reason || "הבקשה תלויה בפעולה שמישהו עושה באפליקציה, ולא בזמן.") + "</div>" +
          '<div class="nt-acts"><button type="button" class="btn-ghost nt-sm" data-bdev>שמירה כבקשת פיתוח</button>' +
          '<button type="button" class="btn-ghost nt-sm" data-bask>לנסח אחרת</button></div></div>';
      }
      h += builderForm();
    }
    h += "</div>";
    if (b.step === "form") {
      var main = b.id ? '<button type="button" class="btn-primary" data-bsave>שמירה</button>'
        : builder().isSuper
          ? '<button type="button" class="btn-primary" data-bsave="live">הוספה והפעלה</button><button type="button" class="btn-ghost" data-bsave>הוספה (מושהה)</button>'
          : '<button type="button" class="btn-primary" data-bsave>שליחה לאישור מנהל-על</button>';
      h += '<div class="drawer__actions drawer__actions--sticky"><div class="drawer__actions-main">' + main +
        '<button type="button" class="btn-ghost" data-btest>שליחת בדיקה אליי</button>' +
        '<span class="nt-save" id="nt-bmsg" aria-live="polite">' + esc(b.msg || "") + "</span></div></div>";
    }
    h += "</aside>";
    wrap.innerHTML = h;
  }

  function builderForm() {
    var b = S.b, d = b.draft, isSum = b.kind === "סיכום", s = d.sched;
    var ds = builder().domains.filter(function (x) { return !isSum || (builder().metrics || {})[x.id]; });
    var roles = bRoles();
    var hrs = builder().hours || [7, 21];
    var h = '<div class="nt-bgrid">' +
      '<label class="nt-lbl" for="nt-b-name">שם</label><input type="text" class="field-input" id="nt-b-name" data-b="name" maxlength="60" value="' + esc(d.name) + '" placeholder="' + (isSum ? "למשל: מה ממתין במועדון" : "למשל: תזכורת פח כתום") + '">' +
      '<label class="nt-lbl" for="nt-b-dom">תחום</label><select class="field-input" id="nt-b-dom" data-bsel="dom">' +
        ds.map(function (x) { return opt(x.id, x.name, d.dom); }).join("") + "</select>" +
      '<span class="nt-lbl">למי</span><div class="nt-opts" role="group" aria-label="למי">' + Object.keys(roles).map(function (r) {
        return '<button type="button" class="nt-opt" data-brole="' + r + '" aria-pressed="' + (d.roles.indexOf(r) !== -1) + '">' + esc(roles[r]) + "</button>";
      }).join("") + "</div>" +
      '<span class="nt-lbl">מתי</span><div><div class="nt-opts" role="group" aria-label="מתי">' +
        TYPES.filter(function (t) { return !isSum || ["daily", "weekly", "monthly"].indexOf(t[0]) !== -1; }).map(function (t) {
          return '<button type="button" class="nt-opt" data-btype="' + t[0] + '" aria-pressed="' + (s.type === t[0]) + '">' + t[1] + "</button>";
        }).join("") + '</div><div class="nt-when">';
    if (s.type === "weekly") h += '<label>ביום <select class="field-input nt-inl" data-bsel="sched.dow">' + (builder().days || []).map(function (x, i) { return opt(i, x, s.dow); }).join("") + "</select></label>";
    if (s.type === "monthly") { var md = ""; for (var i = 1; i <= 28; i++) md += opt(i, String(i), s.mday); h += '<label>ב-<select class="field-input nt-inl" data-bsel="sched.mday">' + md + "</select> לחודש</label>"; }
    if (s.type === "once") h += '<label>בתאריך <input type="date" class="field-input nt-inl" data-bsel="sched.date" value="' + esc(s.date || "") + '"></label>';
    if (s.type === "cal") {
      var cats = builder().cats || {};
      h += '<label><input type="number" class="field-input nt-inl nt-num" min="0" max="30" data-bsel="sched.offsetAbs" value="' + Math.abs(s.offset || 0) + '"> ימים</label>' +
        '<select class="field-input nt-inl" data-bsel="sched.dir">' + opt("before", "לפני", (s.offset || 0) >= 0 ? "before" : "after") + opt("after", "אחרי", (s.offset || 0) >= 0 ? "before" : "after") + "</select>" +
        '<label>כל אירוע ב<select class="field-input nt-inl" data-bsel="sched.cat">' + Object.keys(cats).map(function (k) { return opt(k, cats[k], s.cat); }).join("") + "</select></label>";
    }
    var hs = ""; for (var hh = hrs[0]; hh <= hrs[1]; hh++) hs += opt(hh, (hh < 10 ? "0" : "") + hh + ":00", s.hour);
    h += '<label>בשעה <select class="field-input nt-inl" data-bsel="sched.hour">' + hs + "</select></label></div></div>" +
      '<span class="nt-lbl">איך</span><div class="nt-opts">' +
        '<button type="button" class="nt-tg nt-tg--m' + (d.channels.m ? " on" : "") + '" data-bch="m" aria-pressed="' + d.channels.m + '">מייל</button>' +
        '<button type="button" class="nt-tg nt-tg--p' + (d.channels.p ? " on" : "") + '" data-bch="p" aria-pressed="' + d.channels.p + '">פוש</button></div>' +
      "</div>";
    if (isSum) {
      h += '<div class="nt-sec"><h3>מה נספר בסיכום</h3><div class="nt-sec-body"><div class="nt-mets">' +
        bMetrics().map(function (m) {
          return '<label class="nt-met"><input type="checkbox" data-bmet="' + m[0] + '"' + (d.metrics.ids.indexOf(m[0]) !== -1 ? " checked" : "") + "> " +
            esc(m[1]) + (m[2] ? ' <span class="nt-hint">(רשימה — רק במייל)</span>' : "") + "</label>";
        }).join("") + "</div>" +
        '<label class="nt-chk"><input type="checkbox" data-bonly' + (d.metrics.only ? " checked" : "") + "> לשלוח רק כשיש מה לדווח (לא \"0 · 0 · 0\")</label>" +
        '<div class="nt-acts"><button type="button" class="nt-aibtn" data-bsumai>' + SPARK + (b.sumBusy ? "כותב…" : "כתיבת הנוסח עם AI") + "</button></div>" +
        (b.sumErr ? '<div class="nt-over">' + esc(b.sumErr) + "</div>" : "") + "</div></div>";
    }
    var vars = buildVars();
    h += '<div><div class="nt-lbl">פרטים שאפשר לשלב — לחיצה מוסיפה לשדה האחרון שנבחר</div><div class="nt-vars">' +
      vars.map(function (v) { return '<button type="button" class="nt-var" data-var="' + esc(v) + '">{{' + esc(v) + "}}</button>"; }).join("") + "</div></div>";
    h += '<div class="nt-sec' + (d.channels.p ? "" : " is-off") + '"><h3>פוש</h3><div class="nt-sec-body">' +
      '<div class="nt-notif" aria-hidden="true"><div class="nt-notif-ico">CBA</div><div><div class="nt-notif-a">קהילה · עכשיו</div>' +
      '<div class="nt-notif-t" id="nt-pv-t">' + prev(d.pt || "כותרת") + '</div><div class="nt-notif-b" id="nt-pv-b">' + prev(d.pb || "טקסט") + "</div></div></div>" +
      '<div><div class="nt-lbl"><label for="nt-b-pt">כותרת</label><span id="nt-c-pt">' + cnt(d.pt, 35) + "</span></div>" +
      '<input type="text" class="field-input" id="nt-b-pt" data-b="pt" maxlength="80" value="' + esc(d.pt) + '"></div>' +
      '<div><div class="nt-lbl"><label for="nt-b-pb">טקסט</label><span id="nt-c-pb">' + cnt(d.pb, 90) + "</span></div>" +
      '<input type="text" class="field-input" id="nt-b-pb" data-b="pb" maxlength="200" value="' + esc(d.pb) + '"></div>' +
      aiHTML("push") + "</div></div>";
    h += '<div class="nt-sec' + (d.channels.m ? "" : " is-off") + '"><h3>מייל</h3><div class="nt-sec-body">' +
      '<div><div class="nt-lbl"><label for="nt-b-su">נושא</label></div><input type="text" class="field-input" id="nt-b-su" data-b="su" maxlength="200" value="' + esc(d.su) + '"></div>' +
      '<div><div class="nt-lbl"><label for="nt-b-bo">גוף המייל</label></div><textarea class="field-input nt-ta" id="nt-b-bo" data-b="bo" rows="8">' + esc(d.bo) + "</textarea></div>" +
      aiHTML("mail") + (d.channels.m ? "" : '<div class="nt-hint">המייל כבוי — אפשר להשאיר ריק.</div>') + "</div></div>";
    return h;
  }

  function payloadDraft() {
    var d = S.b.draft;
    var s = JSON.parse(JSON.stringify(d.sched));
    return { name: d.name, dom: d.dom, roles: d.roles, sched: s, channels: d.channels, pt: d.pt, pb: d.pb, su: d.su, bo: d.bo,
             prompt: d.prompt, kind: S.b.kind, metrics: d.metrics };
  }
  function bMsg(t) { S.b.msg = t; var el = document.getElementById("nt-bmsg"); if (el) el.textContent = t; }

  function builderClick(e) {
    var b = S.b, d = b.draft, t;
    if ((t = e.target.closest("[data-bex]"))) { d.prompt = EXAMPLES[+t.dataset.bex]; drawBuilder(); return true; }
    if (e.target.closest("[data-bmanual]")) { b.step = "form"; drawBuilder(); return true; }
    if (e.target.closest("[data-bask]")) { b.step = "ask"; b.feasible = undefined; drawBuilder(); return true; }
    if (e.target.closest("[data-bgo]")) {
      if (b.busy) return true;
      var p = String(d.prompt || "").trim();
      if (p.length < 6) { b.err = "צריך לתאר במשפט מה ההתראה."; drawBuilder(); return true; }
      b.busy = true; b.err = ""; drawBuilder();
      CBA.data.notifyAiBuild(p, function (res) {
        if (S.b !== b) return;
        b.busy = false;
        if (!res || !res.ok) { b.err = (res && res.error) || "ה-AI לא ענה. נסו שוב או מלאו ידנית."; drawBuilder(); return; }
        var nd = res.draft, sc = {};
        /* ה-AI משאיר שדות שלא רלוונטיים ריקים (null) — לא לדרוס בהם את ברירות המחדל. */
        Object.keys(nd.sched || {}).forEach(function (k) { if (nd.sched[k] !== null && nd.sched[k] !== undefined && nd.sched[k] !== "") sc[k] = nd.sched[k]; });
        nd.sched = Object.assign({ hour: 9, dow: 0, mday: 1, date: "", cat: "any", offset: 3 }, sc);
        nd.metrics = { ids: [], only: true };
        b.draft = nd; b.feasible = res.feasible; b.reason = res.reason; b.step = "form";
        drawBuilder();
      });
      return true;
    }
    if ((t = e.target.closest("[data-brole]"))) {
      var r = t.dataset.brole, i = d.roles.indexOf(r);
      if (i === -1) d.roles.push(r); else d.roles.splice(i, 1);
      drawBuilder(); return true;
    }
    if ((t = e.target.closest("[data-btype]"))) { d.sched.type = t.dataset.btype; drawBuilder(); return true; }
    if ((t = e.target.closest("[data-bch]"))) { d.channels[t.dataset.bch] = !d.channels[t.dataset.bch]; drawBuilder(); return true; }
    if (e.target.closest("[data-bsumai]")) {
      if (b.sumBusy) return true;
      b.sumBusy = true; b.sumErr = ""; drawBuilder();
      CBA.data.notifyAiSummary(payloadDraft(), function (res) {
        if (S.b !== b) return;
        b.sumBusy = false;
        if (!res || !res.ok) b.sumErr = (res && res.error) || "ה-AI לא ענה. נסו שוב.";
        else if ((res.unknown || []).length) b.sumErr = "ה-AI הוסיף פרטים שלא קיימים (" + res.unknown.join(", ") + ") — נסו שוב.";
        else {
          d.pt = res.pt; d.pb = res.pb; d.su = res.su; d.bo = res.bo;
          if (!d.name) d.name = res.pt;
          b.sumErr = (res.missing || []).length ? "שימו לב: לא כל המספרים נכנסו לנוסח (" + res.missing.join(", ") + ")." : "";
        }
        drawBuilder();
      });
      return true;
    }
    if (e.target.closest("[data-bdev]")) {
      CBA.data.saveCustomTrigger({ dev: true, draft: { prompt: d.prompt, name: d.name, dom: d.dom } }, function (res) {
        if (!res || !res.ok) { bMsg((res && res.error) || "השמירה נכשלה"); return; }
        closeDrawer();
        toast("נשמר כבקשת פיתוח", "success");
        reload();
      });
      return true;
    }
    if (e.target.closest("[data-btest]")) {
      bMsg("שולח בדיקה…");
      CBA.data.notifyTestSend(payloadDraft(), buildVars(), function (res) {
        if (!res || !res.ok) { bMsg((res && res.error) || "הבדיקה נכשלה"); return; }
        var parts = [];
        if (res.push) parts.push("פוש נשלח לטלפון שלך");
        if (res.mail) parts.push("מייל נשלח אליך");
        if (res.noDevice) parts.push("אין לך התראות לטלפון במכשיר — אפשר להדליק בתפריט האישי");
        bMsg(parts.join(" · ") || "לא נשלח — בחרו מייל או פוש ומלאו כותרת");
      });
      return true;
    }
    if ((t = e.target.closest("[data-bsave]"))) {
      var release = CBA.ui && CBA.ui.busy ? CBA.ui.busy(t, "שומר…") : function () {};
      CBA.data.saveCustomTrigger({ id: b.id || "", draft: payloadDraft(), activate: t.dataset.bsave === "live" }, function (res) {
        release();
        if (!res || !res.ok) { bMsg((res && res.error) || "השמירה נכשלה"); return; }
        var dom0 = d.dom;
        closeDrawer();
        toast(res.status === "ממתין לאישור" ? "נשלח לאישור מנהל-על" : res.status === "פעיל" ? "נוסף ופעיל" : "נשמר", "success");
        S.tab = dom0;
        reload();
      });
      return true;
    }
    return false;
  }

  function builderChange(el) {
    var d = S.b.draft;
    var k = el.dataset.bsel;
    if (k === "dom") {
      d.dom = el.value;
      var avail = bRoles();
      d.roles = d.roles.filter(function (r) { return avail[r]; });
      if (!d.roles.length) d.roles = [Object.keys(avail)[0]];
      if (S.b.kind === "סיכום") d.metrics.ids = bMetrics().filter(function (m) { return !m[2]; }).slice(0, 3).map(function (m) { return m[0]; });
    } else if (k === "sched.offsetAbs") {
      var n = Math.max(0, Math.min(30, parseInt(el.value, 10) || 0));
      d.sched.offset = (d.sched.offset || 0) < 0 ? -n : n;
    } else if (k === "sched.dir") {
      var a = Math.abs(d.sched.offset || 0);
      d.sched.offset = el.value === "after" ? -a : a;
    } else if (k && k.indexOf("sched.") === 0) {
      var f = k.slice(6);
      d.sched[f] = (f === "date" || f === "cat") ? el.value : parseInt(el.value, 10);
    }
    if (el.dataset.bmet) {
      var ids = d.metrics.ids, id = el.dataset.bmet, i = ids.indexOf(id);
      if (el.checked && i === -1) ids.push(id);
      if (!el.checked && i !== -1) ids.splice(i, 1);
    }
    if (el.hasAttribute("data-bonly")) d.metrics.only = el.checked;
    drawBuilder();
  }

  function bind(root) {
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (t) { S.tab = t.dataset.tab; render(root); return; }
      var nb = e.target.closest("[data-build]");
      if (nb) { openBuilder(nb.dataset.build); return; }
      var dx = e.target.closest("[data-cxop]");
      if (dx) { cxOp(dx.dataset.cxop, dx.dataset.cxid, dx); return; }
      var o = e.target.closest(".nt-opt[data-g]");
      if (o) { saveGlobal(o); return; }
      var ob = e.target.closest("[data-open]");
      if (ob) { openDrawer(ob.dataset.open); return; }
      if (!canEdit()) return;
      var cell = e.target.closest(".nt-cell");
      /* בטלפון אין "מעבר עכבר": הלחיצה הראשונה על תא פותחת אותו, והבאות
         מדליקות/מכבות. תא אחד פתוח בכל פעם. */
      if (cell && TOUCH && !cell.classList.contains("is-open")) {
        root.querySelectorAll(".nt-cell.is-open").forEach(function (x) { x.classList.remove("is-open"); });
        cell.classList.add("is-open");
        e.preventDefault();
        return;
      }
      var g = e.target.closest(".nt-tg[data-kind]");
      if (g && !g.disabled && g.dataset.row) { toggleCell(g); return; }
      if (!cell) root.querySelectorAll(".nt-cell.is-open").forEach(function (x) { x.classList.remove("is-open"); });
    });
    root.addEventListener("change", function (e) {
      var inp = e.target.closest("[data-rule]");
      if (!inp) return;
      var v = String(inp.value || "").trim();
      flash("שומר…");
      CBA.data.saveNotifyGlobal(inp.dataset.rule, v, function (res) {
        if (res && res.ok) return flash("נשמר");
        flash((res && res.error) || "השמירה נכשלה", true);
      });
    });
  }

  /* החלונית יושבת מחוץ למסך (על body) — מאזינים משלה. */
  document.addEventListener("click", function (e) {
    if (!document.getElementById("nt-drawer")) return;
    if (!e.target.closest("#nt-drawer")) return;
    if (e.target.closest("[data-nclose]")) { closeDrawer(); return; }
    /* AI — משותף לחלונית ולבונה */
    var ao = e.target.closest("[data-aiopen]");
    if (ao) { S.ai = { sec: ao.dataset.aiopen, dir: "warm", free: "" }; redrawCurrent(); return; }
    var ad = e.target.closest("[data-aidir]");
    if (ad && S.ai) { var fr0 = document.getElementById("nt-ai-free"); if (fr0) S.ai.free = fr0.value; S.ai.dir = ad.dataset.aidir; redrawCurrent(); return; }
    if (e.target.closest("[data-aigo]")) { aiRun(); return; }
    if (e.target.closest("[data-aiclose]")) { S.ai = null; redrawCurrent(); return; }
    if (e.target.closest("[data-aiuse]") && S.ai && S.ai.res) {
      aiSet(S.ai.sec, S.ai.res.title, S.ai.res.text);
      S.ai = null; redrawCurrent(); return;
    }
    var v = e.target.closest("[data-var]");
    if (v) {
      var fld = S.lastField && document.body.contains(S.lastField) ? S.lastField
        : document.getElementById(S.mode === "build" ? "nt-b-pb" : "nt-f-pb");
      if (fld && !fld.disabled) {
        var st = fld.selectionStart != null ? fld.selectionStart : fld.value.length;
        var en = fld.selectionEnd != null ? fld.selectionEnd : st;
        fld.value = fld.value.slice(0, st) + "{{" + v.dataset.var + "}}" + fld.value.slice(en);
        fld.dispatchEvent(new Event("input", { bubbles: true }));
        fld.focus();
      }
      return;
    }
    if (S.mode === "build") { builderClick(e); return; }
    var cxe = e.target.closest("[data-cxedit]");
    if (cxe && S.open && S.open.r.cx) { openBuilder(null, S.open.r.cx); return; }
    var cxo = e.target.closest("[data-cxop]");
    if (cxo && S.open && S.open.r.cx) { cxOp(cxo.dataset.cxop, S.open.r.cx.id, cxo); return; }
    var dr = e.target.closest("[data-drole]");
    if (dr) { S.dRole = dr.dataset.drole; S.ai = null; drawDrawer(); return; }
    var g = e.target.closest(".nt-tg[data-kind]");
    if (g && !g.disabled && g.dataset.row === "_d") { toggleCell(g); return; }
    var sv = e.target.closest("[data-nsave]");
    if (sv) saveDrawer(sv);
  });
  document.addEventListener("focusin", function (e) {
    if (e.target.matches && e.target.matches("#nt-drawer input[type=text][data-t], #nt-drawer textarea[data-t], #nt-drawer input[type=text][data-b], #nt-drawer textarea[data-b]")) S.lastField = e.target;
  });
  function onField(e) {
    if (!e.target.closest || !e.target.closest("#nt-drawer")) return;
    if (S.mode === "build" && S.b) {
      var bk = e.target.dataset && e.target.dataset.b;
      if (bk) {
        S.b.draft[bk] = e.target.value;
        if (bk === "pt") { document.getElementById("nt-pv-t").innerHTML = prev(e.target.value || "כותרת"); document.getElementById("nt-c-pt").innerHTML = cnt(e.target.value, 35); }
        if (bk === "pb") { document.getElementById("nt-pv-b").innerHTML = prev(e.target.value || "טקסט"); document.getElementById("nt-c-pb").innerHTML = cnt(e.target.value, 90); }
        return;
      }
      if (e.type === "change" && (e.target.dataset.bsel || e.target.dataset.bmet || e.target.hasAttribute("data-bonly"))) builderChange(e.target);
      return;
    }
    if (!S.draft) return;
    var k = e.target.dataset && e.target.dataset.t;
    if (!k) return;
    var dr = S.draft[S.dRole];
    dr[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    dr._dirty[k] = true;
    if (k === "pt") { document.getElementById("nt-pv-t").innerHTML = prev(e.target.value || "כותרת"); document.getElementById("nt-c-pt").innerHTML = cnt(e.target.value, 35); }
    if (k === "pb") { document.getElementById("nt-pv-b").innerHTML = prev(e.target.value || "טקסט"); document.getElementById("nt-c-pb").innerHTML = cnt(e.target.value, 90); }
  }
  document.addEventListener("input", onField);
  document.addEventListener("change", onField);

  CBA.screens.emailSettings = {
    title: "מרכז התראות",
    render: function (container) {
      closeDrawer();
      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">מרכז התראות</div>' +
        '<div class="screen-head__sub">מה כל הקהילה מקבלת — מייל או פוש — על כל פעולה. לחיצה על שם הפעולה פותחת את הנוסחים. ' +
        '(להפעלת התראות בטלפון <b>שלך</b>: התפריט האישי ← "התראות לטלפון".)</div></div>' +
        '<div id="nt-body" class="nt-screen">' + (CBA.skel && CBA.skel.sections ? CBA.skel.sections(3) : "טוען…") + "</div>";
      var root = container.querySelector("#nt-body");
      bind(root);
      CBA.data.listNotifySettings(function (res) {
        if (!res || !res.ok) {
          root.innerHTML = '<div class="card">לא ניתן לטעון כרגע. ' + esc((res && res.error) || "") + "</div>";
          return;
        }
        S.data = res;
        if (S.tab && S.tab !== "set" && !dom(S.tab)) S.tab = null;
        render(root);
      });
    }
  };
})();
