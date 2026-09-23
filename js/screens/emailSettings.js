/* מסך "ניהול התראות" — מרכז ההתראות (23.9.2026).
   מחליף את "ניהול מיילים" (אותו מזהה מסך, emailSettings, כדי שכל קישור
   ואריח קיים ימשיכו לעבוד).

   מה רואים:
   - לשונית לכל תחום שהמנהל אחראי עליו (מנהל-על — כולם + "הגדרות כלליות").
   - בכל תחום טבלה: שורה = פעולה, עמודה = מי מקבל. בכל תא הכפתורים מייל /
     פוש (ובגינון גם "בסיכום").
   - 🔑 במצב הרגיל התא מציג **רק מה שדלוק**. מעבר עכבר על התא (או מקלדת,
     או לחיצה בטלפון) פותח את כל הכפתורים, ואז מדליקים/מכבים. כך הטבלה
     נקראת במבט אחד — "מי מקבל מה" — ולא מוצפת בכפתורים כבויים.
   - לחיצה על שם הפעולה פותחת חלונית: טקסט הפוש (עם תצוגה מקדימה),
     מה מופיע באפליקציה, והמייל.

   מקור האמת: טאב "הגדרות התראות" + "הגדרות מיילים" בגיליון, דרך Notify.gs.
   המידור נעשה בשרת (handleListNotifySettings_/saveNotifyCell_) — המסך
   מציג רק מה שחזר. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

(function () {
  var S = { data: null, tab: null, open: null, draft: null, dRole: null, lastField: null };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  var TOUCH = window.matchMedia && window.matchMedia("(hover: none)").matches;

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

  /* ---------- מסך ---------- */
  function tabsHTML() {
    var ds = S.data.domains;
    var h = ds.map(function (d) {
      return '<button type="button" role="tab" class="nt-tab" data-tab="' + d.id + '" aria-selected="' + (S.tab === d.id) + '">' + esc(d.name) + "</button>";
    }).join("");
    if (S.data.isSuper) h += '<button type="button" role="tab" class="nt-tab" data-tab="set" aria-selected="' + (S.tab === "set") + '">הגדרות כלליות</button>';
    return h;
  }

  function tableHTML(d) {
    var roles = Object.keys(d.cols);
    var head = '<tr><th>פעולה</th>' + roles.map(function (r) { return '<th class="nt-rc">' + esc(d.cols[r]) + "</th>"; }).join("") + "</tr>";
    var body = d.rows.map(function (row) {
      if (row.grp) return '<tr class="nt-grp"><td colspan="' + (roles.length + 1) + '"><span class="nt-grp-t">' + esc(row.grp) + "</span></td></tr>";
      return '<tr class="nt-row"><td class="nt-ev"><button type="button" class="nt-evbtn" data-open="' + esc(row.id) + '"><b>' + esc(row.ev) + "</b>" +
        '<span class="nt-meta"><span>' + esc(row.w) + "</span>" + (row.why ? "<span>" + esc(row.why) + "</span>" : "") + "</span></button></td>" +
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
    return h;
  }

  function panelHTML() {
    if (S.tab === "set") return settingsHTML();
    var d = dom(S.tab);
    return d ? tableHTML(d) : "";
  }

  function render(root) {
    var body = root;   // root הוא #nt-body עצמו
    if (!S.data) return;
    if (!S.data.domains.length && !S.data.isSuper) {
      body.innerHTML = '<div class="card">' + (CBA.ui && CBA.ui.emptyState ? CBA.ui.emptyState({ title: "אין תחומים לניהול", sub: "ההרשאות שלך לא כוללות תחום עם התראות." }) : "אין תחומים לניהול") + "</div>";
      return;
    }
    if (!S.tab) S.tab = S.data.domains.length ? S.data.domains[0].id : "set";
    body.innerHTML =
      '<div class="nt-top"><div class="nt-seg" role="tablist" aria-label="תחום">' + tabsHTML() + "</div>" +
      '<div class="nt-legend"><span class="nt-tg nt-tg--m on">מייל</span><span class="nt-tg nt-tg--p on">פוש</span><span class="nt-tg nt-tg--d on">בסיכום</span><span>= דלוק</span>' +
      '<span class="nt-legend-hint">' + (TOUCH ? "לחיצה על תא פותחת את כל האפשרויות" : "מעבר עם העכבר על תא מציג את כל האפשרויות") + "</span>" +
      '<span class="nt-save" id="nt-save" aria-live="polite"></span></div></div>' +
      '<section class="card nt-panel" id="nt-panel">' + panelHTML() + "</section>";
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

  /* ---------- חלונית ---------- */
  function closeDrawer() {
    var el = document.getElementById("nt-drawer");
    if (el) el.remove();
    S.open = null; S.draft = null;
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
    S.open = f;
    S.dRole = on[0] || roles[0];
    S.draft = {};
    roles.forEach(function (r) { S.draft[r] = JSON.parse(JSON.stringify(f.r.cells[r])); S.draft[r]._dirty = {}; });
    var wrap = document.createElement("div");
    wrap.id = "nt-drawer";
    document.body.appendChild(wrap);
    drawDrawer();
    document.addEventListener("keydown", onEsc);
  }

  function drawDrawer() {
    var wrap = document.getElementById("nt-drawer");
    if (!wrap || !S.open) return;
    var f = S.open, r = f.r, d = f.d, c = S.draft[S.dRole];
    var roles = Object.keys(S.draft);
    var screens = S.data.screens || [];
    var h = '<div class="drawer-backdrop" data-nclose></div>' +
      '<aside class="drawer nt-drawer" role="dialog" aria-modal="true" aria-labelledby="nt-dtitle">' +
      '<div class="drawer__head"><div><div class="drawer__title" id="nt-dtitle">' + esc(r.ev) + "</div>" +
      '<div class="drawer__sub">' + esc(d.name) + " · " + esc(r.w) + "</div></div>" +
      '<button type="button" class="drawer__close" data-nclose aria-label="סגירה">×</button></div>' +
      '<div class="drawer__body nt-dbody">';
    if (r.why) h += '<div class="nt-info">' + esc(r.why) + "</div>";
    h += '<div class="nt-seg nt-seg--roles" role="tablist" aria-label="נמען">' + roles.map(function (x) {
      var cc = S.draft[x];
      return '<button type="button" role="tab" class="nt-tab" data-drole="' + x + '" aria-selected="' + (x === S.dRole) + '">' +
        esc(d.cols[x]) + ((cc.m || cc.p || cc.d) ? ' <span class="nt-dot" aria-label="דלוק">●</span>' : "") + "</button>";
    }).join("") + "</div>";
    if (c.n) h += '<div class="nt-info"><b>תנאי:</b> ' + esc(c.n) + "</div>";
    if ((r.vars || []).length) {
      h += '<div><div class="nt-lbl">פרטים שאפשר לשלב — לחיצה מוסיפה לשדה האחרון שנבחר</div><div class="nt-vars">' +
        r.vars.map(function (v) { return '<button type="button" class="nt-var" data-var="' + esc(v) + '">{{' + esc(v) + "}}</button>"; }).join("") + "</div></div>";
    }
    /* פוש */
    h += '<div class="nt-sec' + (c.p ? "" : " is-off") + '"><h3>פוש ' + tg("p", c.p, "_d", S.dRole, c.nopush ? "אין לו עדיין אפליקציה" : "") + "</h3><div class=\"nt-sec-body\">" +
      '<div class="nt-notif" aria-hidden="true"><div class="nt-notif-ico">CBA</div><div><div class="nt-notif-a">קהילה · עכשיו</div>' +
      '<div class="nt-notif-t" id="nt-pv-t">' + prev(c.pt || "כותרת") + '</div><div class="nt-notif-b" id="nt-pv-b">' + prev(c.pb || "טקסט") + "</div></div></div>" +
      '<div><div class="nt-lbl"><label for="nt-f-pt">כותרת</label><span id="nt-c-pt">' + cnt(c.pt, 35) + "</span></div>" +
      '<input type="text" class="field-input" id="nt-f-pt" data-t="pt" maxlength="80" value="' + esc(c.pt) + '"></div>' +
      '<div><div class="nt-lbl"><label for="nt-f-pb">טקסט</label><span id="nt-c-pb">' + cnt(c.pb, 90) + "</span></div>" +
      '<input type="text" class="field-input" id="nt-f-pb" data-t="pb" maxlength="200" value="' + esc(c.pb) + '"></div>' +
      '<div><div class="nt-lbl"><label for="nt-f-link">לחיצה על הפוש (והכפתור במייל) פותחת</label></div>' +
      '<select class="field-input" id="nt-f-link" data-t="link">' + screens.map(function (s) {
        return "<option" + (s === c.link ? " selected" : "") + ">" + esc(s) + "</option>";
      }).join("") + "</select></div></div></div>";
    /* באפליקציה */
    if (S.dRole === "r") {
      h += '<div class="nt-sec"><h3>באפליקציה</h3><div class="nt-sec-body">' +
        (c.noapp ? '<div class="nt-info">לא מופיע אצל הנמען הזה באפליקציה.</div>' : "") +
        '<div><div class="nt-lbl"><label for="nt-f-app">השורה שמופיעה בעמוד הבית</label></div>' +
        '<input type="text" class="field-input" id="nt-f-app" data-t="app" maxlength="160" value="' + esc(c.app) + '" placeholder="למשל: שובץ לשבוע {{שבוע}}"></div>' +
        '<label class="nt-chk"><input type="checkbox" data-t="badge"' + (c.badge ? " checked" : "") + '> סימון "עדכון חדש" בעמוד הבית עד שפותחים את המסך</label></div></div>';
    }
    /* מייל */
    h += '<div class="nt-sec' + (c.m ? "" : " is-off") + '"><h3>מייל ' + tg("m", c.m, "_d", S.dRole, c.hasMail ? "" : "אין תבנית מייל לשורה הזו") + "</h3><div class=\"nt-sec-body\">";
    if (c.hasMail) {
      h += '<div><div class="nt-lbl"><label for="nt-f-su">נושא</label></div><input type="text" class="field-input" id="nt-f-su" data-t="su" maxlength="200" value="' + esc(c.su) + '"></div>' +
        '<div><div class="nt-lbl"><label for="nt-f-bo">גוף המייל</label></div><textarea class="field-input nt-ta" id="nt-f-bo" data-t="bo" rows="9">' + esc(c.bo) + "</textarea></div>" +
        ((S.dRole === "a" || S.dRole === "s") && r.cells.a && r.cells.s && r.cells.a.k === r.cells.s.k
          ? '<div class="nt-hint">מנהל התחום ומנהל-על מקבלים את אותו נוסח מייל.</div>' : "");
    } else {
      h += '<div class="nt-hint">לנמען הזה אין מייל בשורה הזו — רק פוש.</div>';
    }
    h += "</div></div>";
    h += "</div>" +
      '<div class="drawer__actions drawer__actions--sticky"><div class="drawer__actions-main">' +
      '<button type="button" class="btn-primary" data-nsave>שמירה</button><button type="button" class="btn-ghost" data-nclose>ביטול</button>' +
      '<span class="nt-save" id="nt-dmsg" aria-live="polite"></span></div></div></aside>';
    wrap.innerHTML = h;
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
          ["a", "s"].forEach(function (x) {
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

  function bind(root) {
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-tab]");
      if (t) { S.tab = t.dataset.tab; render(root); return; }
      var o = e.target.closest(".nt-opt");
      if (o) { saveGlobal(o); return; }
      var ob = e.target.closest("[data-open]");
      if (ob) { openDrawer(ob.dataset.open); return; }
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
    var dr = e.target.closest("[data-drole]");
    if (dr) { S.dRole = dr.dataset.drole; drawDrawer(); return; }
    var v = e.target.closest("[data-var]");
    if (v) {
      var fld = S.lastField && document.body.contains(S.lastField) ? S.lastField : document.getElementById("nt-f-pb");
      if (fld) {
        var st = fld.selectionStart != null ? fld.selectionStart : fld.value.length;
        var en = fld.selectionEnd != null ? fld.selectionEnd : st;
        fld.value = fld.value.slice(0, st) + "{{" + v.dataset.var + "}}" + fld.value.slice(en);
        fld.dispatchEvent(new Event("input", { bubbles: true }));
        fld.focus();
      }
      return;
    }
    var g = e.target.closest(".nt-tg[data-kind]");
    if (g && !g.disabled && g.dataset.row === "_d") { toggleCell(g); return; }
    var sv = e.target.closest("[data-nsave]");
    if (sv) saveDrawer(sv);
  });
  document.addEventListener("focusin", function (e) {
    if (e.target.matches && e.target.matches("#nt-drawer input[type=text], #nt-drawer textarea")) S.lastField = e.target;
  });
  function onField(e) {
    if (!S.draft || !e.target.closest || !e.target.closest("#nt-drawer")) return;
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
    title: "ניהול התראות",
    render: function (container) {
      closeDrawer();
      container.innerHTML =
        '<div class="screen-head"><div class="screen-head__title">ניהול התראות</div>' +
        '<div class="screen-head__sub">מי מקבל מייל או פוש על כל פעולה. לחיצה על שם הפעולה פותחת את הנוסחים.</div></div>' +
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
