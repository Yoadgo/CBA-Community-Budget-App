/* ============================================================================
 *  gardenLawn.js — מסך "דשא והשקיה"   (2026-10-04)
 * ----------------------------------------------------------------------------
 *  בקשת יועד: "המטרה היא לא לבנות ממשק חדש אלא ממש תצוגה על המפה הקיימת" —
 *  לסמן ממטרות, מחשבי השקיה וקווי צנרת; לסמן מקטעי דשא (חופשי/עיגול/אליפסה)
 *  ולרמזר אותם (תקין/יבש/מת); לשייך כל סימון לתקלה ולהפך; ושתיצבר מפת השקיה.
 *  אפיון + החלטות: project doc claude/lawn-irrigation-2026-10.md.
 *  סקיצה מאושרת: https://claude.ai/artifact/Y6rJXUWsEYP7CVJD1M5ZAi
 *
 *  🔑 **שכבה מעל CBA.map, בלי לגעת במנוע** (resident.js):
 *     · הנעצים — CBA.gardenPins (אותו נעץ כמו בנתוני הגינון).
 *     · מדשאות/צנרת/טווחים — SVG אחד בתוך `.map-world`, ביחידות עולם.
 *     · ממטרות/מחשבים/ידיות — שכבת HTML בגודל קבוע על המסך (--gpin-inv).
 *     · הקשות — מאזינים משלנו על ה-viewport (כמו מצב הנעיצה), לא click:
 *       המנוע לוכד את המצביע, ולכן הקשה נבדקת ב-elementFromPoint.
 *     · ידית נגררת עוצרת את האירוע לפני המנוע — כך גרירת נקודה לא מזיזה
 *       את המפה, וגרירה בכל מקום אחר כן.
 *     · ציור חופשי — שכבת לכידה שקופה, רק כשהכלי פעיל.
 *
 *  🔑 **Firestore בלבד** (CBA.gardenAssets). אין מסלול ישן ואין "ריק שקט":
 *     כשל קריאה = המפה בלי השכבה + "לנסות שוב". מפה ריקה בטעות הייתה
 *     גורמת לגנן לסמן הכול מחדש.
 *  🔑 **שיוך נשמר רק על המשימה** (`assets`); הצד של הנכס נגזר.
 *  ⚠️ על משימה סגורה רק מנהל הגינון משנה שיוך (gtClosedOk) — המסך לא מציע
 *     לגנן החיצוני כפתור שייכשל.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};
(function () {
  "use strict";

  var LAYERS_KEY = "cba.lw.layers";
  var STATUS_L = { ok: "תקין", dry: "יבש", dead: "מת" };
  var KIND_L = { spr: "ממטרה", ctrl: "מחשב השקיה", pipe: "קו צנרת", lawn: "מקטע דשא" };
  var TOOL_HINT = {
    spr: "הקישו במפה במקום הממטרה. היא משויכת אוטומטית למחשב הקרוב — אפשר לשנות.",
    ctrl: "הקישו במפה במקום מחשב ההשקיה.",
    pipe: "הקישו נקודה אחרי נקודה לאורך הקו, ואז \"סיום\".",
    "lawn:poly": "הקישו את פינות המקטע, ואז \"סיום\".",
    "lawn:free": "ציירו באצבע את גבול המקטע. להזזת המפה בזמן ציור: שתי אצבעות, או רווח + גרירה במחשב.",
    "lawn:circle": "הקישו במרכז, ואז גררו את הידית לגודל הנכון.",
    "lawn:ellipse": "הקישו במרכז, ואז גררו את שתי הידיות."
  };
  var ICO = {
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    ctrl: '<rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="6" width="10" height="5" rx="1"/><path d="M8 15h.01M12 15h.01M16 15h.01M8 18h8"/>',
    spr: '<circle cx="12" cy="15" r="3"/><path d="M12 12V7"/><path d="M5 9a9 9 0 0 1 3-4M19 9a9 9 0 0 0-3-4M3 13a10 10 0 0 1 1-5M21 13a10 10 0 0 0-1-5"/>',
    pipe: '<path d="M3 7h6a3 3 0 0 1 3 3v4a3 3 0 0 0 3 3h6"/><path d="M3 4v6M21 14v6"/>',
    free: '<path d="M4 17c3-6 6 2 9-4s4-6 7-3"/><circle cx="4" cy="17" r="1.5"/>',
    circle: '<circle cx="12" cy="12" r="8"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="5.5"/>',
    poly: '<path d="M5 18 4 8l8-4 8 6-3 9Z"/><circle cx="5" cy="18" r="1.4"/><circle cx="4" cy="8" r="1.4"/><circle cx="12" cy="4" r="1.4"/><circle cx="20" cy="10" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
    lawn: '<path d="M3 20h18"/><path d="M6 20c0-4 1-6 2-8M11 20c0-5 1-8 1-11M16 20c0-4 1-6 2-8"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    card: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'
  };
  function ico(n, size) {
    var s = size || 18;
    var body = ICO[n] || (CBA.gardenKit && CBA.gardenKit.ICONS && CBA.gardenKit.ICONS[n]) || "";
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmt(n) { return Math.round(n || 0).toLocaleString("he-IL"); }
  function toast(m, kind) { if (CBA.ui && CBA.ui.toast) CBA.ui.toast(m, kind); }
  function isMgr() { var u = (window.CBA && CBA.user) || {}; return !u.isExternal; }
  /* אותה הגדרה כמו isFault ב-gardenStatsCalc.js — תקלה (של תושב או של הצוות), לא שגרה. */
  function isFault(t) { return !!t && t.kind === "דיווח תושב"; }
  function hasLoc(t) {
    return t && t.x !== null && t.x !== undefined && t.x !== "" && !isNaN(+t.x) &&
           t.y !== null && t.y !== undefined && t.y !== "" && !isNaN(+t.y);
  }
  function loadLayers() {
    var d = { lawn: true, water: true, faults: true, spray: false };
    try { var v = JSON.parse(localStorage.getItem(LAYERS_KEY) || "null"); if (v) Object.keys(d).forEach(function (k) { if (typeof v[k] === "boolean") d[k] = v[k]; }); } catch (e) {}
    return d;
  }
  function saveLayers() { try { localStorage.setItem(LAYERS_KEY, JSON.stringify(S.layers)); } catch (e) {} }
  function errText(e) {
    var c = (e && (e.code || e.message)) || "";
    if (/permission/i.test(c)) return "אין הרשאה לפעולה הזו";
    if (/unavailable|network|timeout/i.test(c)) return "אין חיבור כרגע — נסו שוב בעוד רגע";
    return "הפעולה לא נשמרה — נסו שוב";
  }

  var S = null;
  function fresh() {
    return { mode: "view", tool: "hand", layers: loadLayers(), sel: null, pick: null, draft: null,
             edit: null, vtx: -1, linkFor: null, lawns: [], assets: [], all: {}, tasks: [], edits: {},
             meta: { categories: [], areas: [] }, loading: true, err: null, tasksErr: null,
             root: null, pins: null, saving: false };
  }

  /* ========================================================================
   *  render
   * ====================================================================== */
  CBA.screens.gardenLawn = {
    render: function (container) {
      /* רענון תחום שקט (SCREEN_DOMAINS) בזמן ציור — לא בונים מחדש: טיוטה
         באמצע הייתה נמחקת מול העיניים. רק מושכים את הנתונים מחדש. */
      if (CBA.renderSilent && S && S.root && S.root.isConnected) { loadAll(true); return; }
      S = fresh();
      if (!CBA.gardenAssets || !CBA.gardenPins || !CBA.map) {
        container.innerHTML = '<div class="lw"><div class="screen-head"><div class="screen-head__title">דשא והשקיה</div></div>' +
          '<p class="lw-err">המסך לא נטען במלואו. רעננו את העמוד ונסו שוב.</p></div>';
        return;
      }
      container.innerHTML =
        '<div class="lw" id="lw-root">' +
          '<div class="lw-h">' +
            '<div class="lw-h__t"><div class="screen-head__title">דשא והשקיה</div>' +
              '<div class="screen-head__sub" id="lw-sub">מפת התשתית של הגינון</div></div>' +
            '<div class="seg seg--view lw-mode" role="group" aria-label="מצב">' +
              '<button type="button" class="seg__opt is-active" data-mode="view" aria-pressed="true">צפייה</button>' +
              '<button type="button" class="seg__opt" data-mode="edit" aria-pressed="false">סימון ועריכה</button>' +
            '</div>' +
          '</div>' +
          '<div class="lw-sum" id="lw-sum" aria-live="polite"></div>' +
          '<div class="lw-body">' +
            '<div class="lw-mapwrap" id="lw-mapwrap">' +
              '<div class="gd-map lw-map" id="lw-map"></div>' +
              '<div class="lw-layers" id="lw-layers" role="group" aria-label="שכבות"></div>' +
              '<div class="lw-state" id="lw-state" hidden></div>' +
              '<div class="lw-bar" id="lw-bar" hidden></div>' +
              '<div class="lw-tools" id="lw-tools" role="toolbar" aria-label="כלי סימון" hidden></div>' +
              '<div class="lw-capture" id="lw-capture" hidden></div>' +
              '<div class="lw-hint" id="lw-hint" role="status" aria-live="polite"></div>' +
            '</div>' +
            '<aside class="lw-panel is-empty" id="lw-panel" aria-live="polite"></aside>' +
          '</div>' +
        '</div>';
      S.root = container.querySelector("#lw-root");
      mountMap();
      bindChrome();
      renderLayers(); renderTools(); renderPanel(); renderSum(); renderState();
      loadAll(false);
    }
  };

  /* ========================================================================
   *  נתונים
   * ====================================================================== */
  function loadAll(silent) {
    var left = 3;
    /* 🌱 גל ב' — דיוקי גבול שממתינים (שאילתת שוויון אחת). כשל = אין מונה, לא חוסם. */
    CBA.gardenAssets.loadPendingEdits(function (r) {
      S.edits = {};
      (r.edits || []).forEach(function (e) { S.edits[String(e.id)] = e; });
      if (r.ok && CBA.setLawnEditsCount) CBA.setLawnEditsCount((r.edits || []).length);
      step();
    });
    if (!silent) { S.loading = true; renderState(); }
    CBA.gardenAssets.load(function (res) {
      if (res.ok) { S.lawns = res.lawns; S.assets = res.assets; S.all = res.all; S.err = null; }
      else S.err = res.err || new Error("load");
      step();
    });
    CBA.data.getGardenTasks({ scope: "all" }, function (res) {
      if (res && res.ok) {
        S.tasks = (res.rows || []).filter(isFault);
        S.meta = { categories: res.categories || [], areas: res.areas || [] };
        S.tasksErr = null;
      } else S.tasksErr = (res && res.error) || "tasks";
      step();
    });
    function step() {
      if (--left) return;
      S.loading = false;
      if (S.sel && !selected()) S.sel = null;
      renderState(); renderSum(); setPins(silent); drawOverlay(); renderPanel();
      if (!silent && !S.fitted) fitAll();
      applyFocus();
    }
  }
  /* 4.10 — הגעה מכרטיס התקלה ("הצגה במפת ההשקיה" / "שיוך לממטרה / מקטע"):
     התקלה נבחרת, המפה מתמקדת בה, ובשיוך — מצב בחירה מיד. */
  function applyFocus() {
    var f = CBA._lwFocus; if (!f || S.loading) return;
    delete CBA._lwFocus;   /* תיבת דואר של הליבה (gardenAssets.openOnMap) — כאן רק קוראים ומנקים */
    var t = taskById(f.id);
    if (!t) return toast("התקלה לא נמצאה במפה — רק תקלות (לא שגרות) מופיעות כאן", "error");
    select({ type: "task", id: t.id });
    if (hasLoc(t)) zoomTo(+t.x, +t.y, 1.6);
    if (f.pick && canRelink(t)) startPick(t.id);
  }
  /** פתיחה: התצוגה מתאימה את עצמה לכל מה שסומן (ולתקלות), עם מרווח —
      לא לכל השכונה, שבה הסימונים קטנים מכדי לראות. אין סימונים = כל השכונה. */
  function fitAll() {
    var api = S.pins && S.pins.api, G = CBA.gardenGeo;
    if (!api || !api.fitBox) return;
    var pts = [];
    S.lawns.forEach(function (l) { pts = pts.concat(G.polyOf(l)); });
    S.assets.forEach(function (a) { if (a.kind === "pipe") pts = pts.concat(G.pairs(a.pts)); else pts.push([a.x, a.y]); });
    if (!pts.length) return;
    S.fitted = true;
    var x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var pad = 0.06, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    var w = Math.max(0.3, x1 - x0 + 2 * pad), h = Math.max(0.3, y1 - y0 + 2 * pad);
    api.fitBox(Math.max(0, cx - w / 2), Math.max(0, cy - h / 2), Math.min(1, cx + w / 2), Math.min(1, cy + h / 2), 24);
  }
  function items() { return S.lawns.concat(S.assets); }
  function byId(id) { return S.all[id] || null; }
  function taskById(id) { for (var i = 0; i < S.tasks.length; i++) if (String(S.tasks[i].id) === String(id)) return S.tasks[i]; return null; }
  function selected() {
    if (!S.sel) return null;
    return S.sel.type === "task" ? taskById(S.sel.id) : byId(S.sel.id);
  }
  function ctrlNo(c) { var m = /(\d+)/.exec((c && c.name) || ""); return m ? m[1] : "•"; }
  function sprLabel(a) {
    var c = byId(a.ctrl);
    return a.name || ("ממטרה" + (c ? " · " + c.name : "") + (a.station ? " · קו " + a.station : ""));
  }
  function displayName(a) {
    if (!a) return "";
    if (a.kind === "spr") return sprLabel(a);
    if (a.kind === "pipe" && !a.name) { var c = byId(a.ctrl); return "קו צנרת" + (c ? " · " + c.name : ""); }
    return a.name || KIND_L[a.kind] || "";
  }

  /* ========================================================================
   *  מפה, נעצים ושכבת הציור
   * ====================================================================== */
  var svgEl = null, symEl = null, viewport = null, world = null;
  function mountMap() {
    var host = S.root.querySelector("#lw-map");
    S.pins = CBA.gardenPins.mount(host, {
      onPin: function (p) { if (S.pick || S.draft || S.edit) return; select({ type: "task", id: p.id }); },
      onCluster: function (pins) {
        var x = 0, y = 0; pins.forEach(function (p) { x += p.x; y += p.y; });
        zoomTo(x / pins.length, y / pins.length, 2.2);
      },
      onZoom: function () { drawOverlay(); }
    });
    world = S.pins.world;
    viewport = host.querySelector(".map-viewport");
    var W = worldWH();
    svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgEl.setAttribute("class", "lw-svg");
    svgEl.setAttribute("width", W.w); svgEl.setAttribute("height", W.h);
    svgEl.setAttribute("viewBox", "0 0 " + W.w + " " + W.h);
    svgEl.setAttribute("aria-hidden", "true");
    symEl = document.createElement("div");
    symEl.className = "lw-sym";
    symEl.style.width = W.w + "px"; symEl.style.height = W.h + "px";
    if (world) { world.appendChild(svgEl); world.appendChild(symEl); }
    bindMapInput();
  }
  /* ⚠️ ppm (יחידות עולם למטר) מגיע מ-mapGeo — בלעדיו כל מידה במטרים (רדיוס עיגול
     חדש, טווח התזה) הופכת ל-NaN בשקט. */
  function worldWH() {
    return { w: parseFloat(world && world.style.width) || 1061, h: parseFloat(world && world.style.height) || 1297,
             ppm: CBA.gardenGeo.world().ppm };
  }
  function view() {
    var m = world && /translate\(([-\d.eE]+)px,\s*([-\d.eE]+)px\)\s*scale\(([\d.eE+-]+)\)/.exec(world.style.transform || "");
    return m ? { tx: +m[1], ty: +m[2], s: +m[3] } : { tx: 0, ty: 0, s: 1 };
  }
  /** נקודת מסך → שבר 0–1 של העולם.
      🔴 4.10 (יועד: "סימנתי ממטרה והיא לא יוצאת על נקודת העכבר") — בדסקטופ
      body מקבל zoom:1.05, ולכן פיקסל מסך ≠ פיקסל CSS של העולם. z = היחס בפועל
      (1 בטלפון). בלעדיו הסטייה גדלה ככל שמתרחקים מפינת המפה. */
  function zoomF() {
    var w = viewport.offsetWidth;
    return w ? (viewport.getBoundingClientRect().width / w) || 1 : 1;
  }
  function toNorm(cx, cy) {
    var r = viewport.getBoundingClientRect(), v = view(), W = worldWH(), z = zoomF();
    return [(((cx - r.left) / z - v.tx) / v.s) / W.w, (((cy - r.top) / z - v.ty) / v.s) / W.h];
  }
  function zoomTo(x, y, mult) {
    var api = S.pins && S.pins.api;
    if (!api || !api.fitBox) return;
    var span = 0.18 / (mult || 1);
    api.fitBox(Math.max(0, x - span / 2), Math.max(0, y - span / 2), Math.min(1, x + span / 2), Math.min(1, y + span / 2), 24);
  }
  function setPins(keepView) {
    if (!S.pins) return;
    var cur = CBA.gardenLang && CBA.gardenLang.weekOf ? CBA.gardenLang.weekOf() : "";
    var list = S.layers.faults
      ? S.tasks.filter(function (t) { return hasLoc(t) && (!t.closure || t.flag === "דורש בדיקה חוזרת"); })
               .map(function (t) { return CBA.gardenPins.fromTask(t, { cur: cur }); })
      : [];
    /* לא מתאימים את התצוגה לנעצים — במסך הזה המפה כולה היא התוכן. */
    S.pins.set(list, true, true);
    if (S.sel && S.sel.type === "task") S.pins.select(S.sel.id);
  }

  /* ---- ציור השכבה: SVG בעולם + סמלים בגודל קבוע ---- */
  function P(x, y) { var W = worldWH(); return (x * W.w).toFixed(1) + "," + (y * W.h).toFixed(1); }
  function shapeSvg(s, cls, attrs) {
    var W = worldWH(), a = attrs || "";
    if (s.shape === "circle") return '<circle class="' + cls + '" cx="' + (s.cx * W.w).toFixed(1) + '" cy="' + (s.cy * W.h).toFixed(1) + '" r="' + (s.r * W.w).toFixed(1) + '"' + a + '/>';
    if (s.shape === "ellipse") return '<ellipse class="' + cls + '" cx="' + (s.cx * W.w).toFixed(1) + '" cy="' + (s.cy * W.h).toFixed(1) + '" rx="' + (s.rx * W.w).toFixed(1) + '" ry="' + (s.ry * W.h).toFixed(1) + '"' + a + '/>';
    var pts = CBA.gardenGeo.pairs(s.pts).map(function (p) { return P(p[0], p[1]); }).join(" ");
    return '<polygon class="' + cls + '" points="' + pts + '"' + a + '/>';
  }
  function drawOverlay() {
    if (!svgEl) return;
    var G = CBA.gardenGeo, W = worldWH(), level = S.pins ? S.pins.level() : "mid";
    var sel = selected(), selId = S.sel ? S.sel.id : null, o = [], sym = [];
    S.root.classList.toggle("is-pick", !!S.pick);
    o.push('<defs>' +
      '<pattern id="lwp-ok" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="rgba(95,163,111,.30)"/></pattern>' +
      '<pattern id="lwp-dry" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="rgba(210,169,62,.30)"/><circle cx="2" cy="2" r="1.1" fill="rgba(160,120,20,.55)"/><circle cx="5.5" cy="5.5" r="1.1" fill="rgba(160,120,20,.55)"/></pattern>' +
      '<pattern id="lwp-dead" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="rgba(148,102,74,.32)"/><line x1="0" y1="0" x2="0" y2="6" stroke="rgba(110,70,45,.6)" stroke-width="2"/></pattern>' +
      '</defs>');
    var editing = S.edit ? S.edit.id : null;
    if (S.layers.lawn) {
      S.lawns.slice().sort(function (a, b) { return (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0); }).forEach(function (l) {
        if (l.id === editing) return;
        o.push(shapeSvg(l, "lw-lawn s-" + l.status + (selId === l.id ? " is-sel" : ""),
          ' fill="url(#lwp-' + l.status + ')" data-lw="' + esc(l.id) + '"'));
      });
    }
    if (S.layers.water) {
      if (S.layers.spray) S.assets.forEach(function (a) {
        if (a.kind !== "spr") return;
        o.push('<circle class="lw-spray" cx="' + (a.x * W.w).toFixed(1) + '" cy="' + (a.y * W.h).toFixed(1) + '" r="' + ((+a.range || 5) * W.ppm).toFixed(1) + '"/>');
      });
      S.assets.forEach(function (a) {
        if (a.kind !== "pipe" || a.id === editing) return;
        var pts = G.pairs(a.pts).map(function (p) { return P(p[0], p[1]); }).join(" ");
        o.push('<polyline class="lw-pipe-c" points="' + pts + '"/>');
        o.push('<polyline class="lw-pipe' + (selId === a.id ? " is-sel" : "") + '" points="' + pts + '"/>');
        o.push('<polyline class="lw-hit" points="' + pts + '" data-lw="' + esc(a.id) + '"/>');
      });
    }
    /* קווי שיוך — לתקלה הנבחרת, או מהנכס הנבחר לכל התקלות שלו. בזום קרוב — כולם. */
    if (S.layers.faults) {
      S.tasks.forEach(function (t) {
        if (!hasLoc(t) || !(t.assets && t.assets.length)) return;
        var show = (sel && S.sel.type === "task" && String(t.id) === String(S.sel.id)) ||
                   (sel && S.sel.type !== "task" && t.assets.indexOf(S.sel.id) !== -1) ||
                   (level === "near" && !t.closure);
        if (!show) return;
        t.assets.forEach(function (id) {
          var a = byId(id); if (!a) return;
          var an = G.anchorOf(a, [+t.x, +t.y]); if (!an) return;
          o.push('<line class="lw-teth" x1="' + (+t.x * W.w).toFixed(1) + '" y1="' + (+t.y * W.h).toFixed(1) +
                 '" x2="' + (an[0] * W.w).toFixed(1) + '" y2="' + (an[1] * W.h).toFixed(1) + '"/>');
        });
      });
    }
    /* 🌱 גל ב' — תקלה נבחרה ויש לה דיוק ממתין: מה שהתושב הציע, בכתום. */
    var selT = S.sel && S.sel.type === "task" ? taskById(S.sel.id) : null;
    var pe = selT && selT.repId && S.edits[String(selT.repId)];
    if (pe && pe.pts && pe.pts.length >= 6) {
      o.push('<polygon class="lw-proposal" points="' + G.pairs(pe.pts).map(function (p) { return P(p[0], p[1]); }).join(" ") + '"/>');
    }
    /* טיוטה / עריכת צורה */
    var D = S.edit || S.draft;
    if (D && !D.point) {
      if (D.kind === "pipe") o.push('<polyline class="lw-draft-line" points="' + D.pts.map(function (p) { return P(p[0], p[1]); }).join(" ") + '"/>');
      else if (D.shape === "circle" || D.shape === "ellipse") o.push(shapeSvg(D, "lw-draft"));
      else if (D.pts && D.pts.length) o.push('<polygon class="lw-draft" points="' + D.pts.map(function (p) { return P(p[0], p[1]); }).join(" ") + '"/>');
      if (S.edit && S.edit.orig) o.push(shapeSvg(S.edit.orig, "lw-orig"));
    }
    svgEl.innerHTML = o.join("");

    /* סמלים: ממטרות, מחשבים, תוויות, ידיות */
    var bad = {};
    S.tasks.forEach(function (t) {
      if (t.closure) return;
      (t.assets || []).forEach(function (id) {
        var st = CBA.gardenStatsCalc && CBA.gardenStatsCalc.pinState ? CBA.gardenStatsCalc.pinState(t, CBA.gardenLang.weekOf()) : "wait";
        if (!bad[id] || CBA.gardenPins.SEV[st] > CBA.gardenPins.SEV[bad[id]]) bad[id] = st;
      });
    });
    if (S.layers.water) {
      S.assets.forEach(function (a) {
        if (a.kind === "spr") {
          /* ממטרות תמיד גלויות — בזום רחוק הן קטנות יותר (CSS לפי data-lod), לא נעלמות:
             מסך שנפתח בלי ממטרות נראה כמו "לא סומן כלום". */
          var ring = bad[a.id] ? "var(--s-" + bad[a.id] + ", " + CBA.gardenPins.COL[bad[a.id]] + ")" : "";
          sym.push('<div class="lw-spr' + (bad[a.id] ? " has-fault" : "") + (selId === a.id || S.justAdded === a.id ? " is-sel" : "") + '" role="button" tabindex="0" ' +
            'data-lw="' + esc(a.id) + '" aria-label="' + esc(sprLabel(a) + (bad[a.id] ? " · יש תקלה פתוחה" : "")) + '" ' +
            'style="left:' + (a.x * W.w).toFixed(1) + 'px;top:' + (a.y * W.h).toFixed(1) + 'px' + (ring ? ';--ring:' + ring : '') + '">' +
            '<i></i>' + (level === "near" && a.station ? '<span class="lw-tag">קו ' + esc(a.station) + '</span>' : '') + '</div>');
        } else if (a.kind === "ctrl") {
          sym.push('<div class="lw-ctrl' + (selId === a.id || S.justAdded === a.id ? " is-sel" : "") + '" role="button" tabindex="0" data-lw="' + esc(a.id) + '" ' +
            'aria-label="' + esc(a.name || "מחשב השקיה") + '" style="left:' + (a.x * W.w).toFixed(1) + 'px;top:' + (a.y * W.h).toFixed(1) + 'px">' +
            '<b>' + ico("ctrl", 13) + '<em>' + esc(ctrlNo(a)) + '</em></b>' +
            (level !== "far" ? '<span class="lw-tag">' + esc(a.name || "") + '</span>' : '') + '</div>');
        }
      });
    }
    if (S.layers.lawn && level === "near") {
      S.lawns.forEach(function (l) {
        if (l.id === editing || l.parentId) return;
        var c = G.centroid(l);
        sym.push('<div class="lw-name" style="left:' + (c[0] * W.w).toFixed(1) + 'px;top:' + (c[1] * W.h).toFixed(1) + 'px">' + esc(l.name) + '</div>');
      });
    }
    if (D) handles(D, W).forEach(function (h) { sym.push(h); });
    symEl.innerHTML = sym.join("");
  }
  /** ידיות עריכה: פינות (גרירה), אמצעי צלעות "+" (הוספת פינה), ידיות עיגול/אליפסה. */
  function handles(D, W) {
    var out = [];
    function h(i, x, y, cls, label) {
      out.push('<div class="lw-h-pt' + (cls ? " " + cls : "") + '" data-h="' + i + '" role="button" tabindex="0" aria-label="' + label + '" ' +
        'style="left:' + (x * W.w).toFixed(1) + 'px;top:' + (y * W.h).toFixed(1) + 'px"><i></i></div>');
    }
    if (D.shape === "circle") { h("r", D.cx + D.r, D.cy, "is-size", "גודל העיגול"); return out; }
    if (D.shape === "ellipse") {
      h("rx", D.cx + D.rx, D.cy, "is-size", "רוחב האליפסה");
      h("ry", D.cx, D.cy - D.ry, "is-size", "גובה האליפסה");
      return out;
    }
    if (!D.pts) return out;
    D.pts.forEach(function (p, i) { h(i, p[0], p[1], i === S.vtx ? "is-on" : "", "נקודה " + (i + 1)); });
    /* פינה חדשה באמצע כל צלע — רק בעריכת צורה (לא בהוספה בהקשה, ולא בהזזת ממטרה). */
    if (S.edit && !D.point && D.pts.length > 1) {
      var n = D.pts.length, closed = D.kind !== "pipe";
      for (var i = 0; i < (closed ? n : n - 1); i++) {
        var a = D.pts[i], b = D.pts[(i + 1) % n];
        out.push('<div class="lw-h-mid" data-mid="' + i + '" role="button" tabindex="0" aria-label="הוספת נקודה" ' +
          'style="left:' + (((a[0] + b[0]) / 2) * W.w).toFixed(1) + 'px;top:' + (((a[1] + b[1]) / 2) * W.h).toFixed(1) + 'px"><i>+</i></div>');
      }
    }
    return out;
  }

  /* ---- קלט על המפה ---- */
  function bindMapInput() {
    if (!viewport) return;
    var down = null, drag = null;
    /* ידיות — לפני המנוע (capture על המכל), כדי שגרירת נקודה לא תזיז את המפה. */
    S.root.querySelector("#lw-mapwrap").addEventListener("pointerdown", function (e) {
      var hEl = e.target.closest && e.target.closest("[data-h],[data-mid]");
      if (!hEl || !(S.edit || S.draft)) return;
      e.stopPropagation(); e.preventDefault();
      if (hEl.dataset.mid !== undefined) {
        var D = S.edit; var i = +hEl.dataset.mid, n = D.pts.length;
        var a = D.pts[i], b = D.pts[(i + 1) % n];
        D.pts.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
        S.vtx = i + 1; drawOverlay(); renderBar();
        drag = { key: String(i + 1), id: e.pointerId, moved: false };
      } else {
        drag = { key: hEl.dataset.h, id: e.pointerId, moved: false, x: e.clientX, y: e.clientY };
      }
      try { hEl.setPointerCapture(e.pointerId); } catch (x) {}
      S.root.classList.add("is-dragging");
    }, true);
    document.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.x !== undefined && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3 && !drag.moved) return;
      drag.moved = true;
      moveHandle(drag.key, toNorm(e.clientX, e.clientY));
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var k = drag.key, moved = drag.moved;
      drag = null; S.root.classList.remove("is-dragging");
      if (!moved && /^\d+$/.test(k)) { S.vtx = S.vtx === +k ? -1 : +k; drawOverlay(); renderBar(); return; }
      drawOverlay(); renderBar();
    }
    document.addEventListener("pointerup", endDrag);
    document.addEventListener("pointercancel", endDrag);

    /* הקשה — כמו מצב הנעיצה במנוע: מבדילים הקשה מגרירה לפי מרחק. */
    viewport.addEventListener("pointerdown", function (e) {
      down = { x: e.clientX, y: e.clientY, n: (down && down.n) ? down.n + 1 : 1 };
    });
    viewport.addEventListener("pointerup", function (e) {
      var d = down; down = null;
      if (S.space) return;   // רווח לחוץ = יד זמנית: גרירה מזיזה, הקשה לא מסמנת
      if (!d || d.n > 1 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
      var target = document.elementFromPoint(e.clientX, e.clientY);
      if (target && (target.closest(".map-marker") || target.closest(".map-toolbar") || target.closest(".map-topbar"))) return;
      onTap(toNorm(e.clientX, e.clientY), target);
    });
    viewport.addEventListener("pointercancel", function () { down = null; });

    /* מקלדת על סמלים (ממטרה/מחשב) */
    symEl.addEventListener("keydown", function (e) {
      if (e.key !== "Enter" && e.key !== " ") return;
      var t = e.target.closest("[data-lw]");
      if (t) { e.preventDefault(); onTap(null, t); }
    });

    /* 🔴 4.10 (יועד: "אחרי כניסה למצב עריכה לא ניתן לחזור ולהזיז את המפה") —
       **המפה זזה תמיד, בכל כלי:**
       · גלגלת / שתי אצבעות על משטח המגע = הזזה (Ctrl/⌘ + גלגלת = זום, כמו קודם).
         מסך עבודה על מפה — אין כאן עמוד שצריך לגלול מעל המפה.
       · רווח לחוץ = יד זמנית (גרירה מזיזה, הקשה לא מסמנת, שכבת הציור יורדת).
       · בציור חופשי (שכבת לכידה): שתי אצבעות מזיזות וצובטות במקום לצייר. */
    var wrapEl = S.root.querySelector("#lw-mapwrap");
    wrapEl.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.metaKey) return;          // זום — של המנוע
      var api = S.pins && S.pins.api; if (!api || !api.panBy) return;
      if (e.target.closest && e.target.closest(".lw-bar, .lw-tools, .lw-layers, .lw-state")) return;
      e.preventDefault(); e.stopPropagation();
      var k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
      api.panBy(-e.deltaX * k, -e.deltaY * k);
      drawOverlay();
    }, { capture: true, passive: false });
    function typing(t) { return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)); }
    document.addEventListener("keydown", function sp(e) {
      if (!S || !S.root || !S.root.isConnected) { document.removeEventListener("keydown", sp); return; }
      if (e.code !== "Space" || typing(e.target) || S.mode !== "edit") return;
      e.preventDefault();
      if (!S.space) { S.space = true; S.root.classList.add("is-space"); renderTools(); }
    });
    document.addEventListener("keyup", function spu(e) {
      if (!S || !S.root || !S.root.isConnected) { document.removeEventListener("keyup", spu); return; }
      if (e.code !== "Space" || !S.space) return;
      S.space = false; S.root.classList.remove("is-space"); renderTools();
    });

    /* ציור חופשי — שכבת לכידה, רק כשהכלי פעיל */
    var cap = S.root.querySelector("#lw-capture"), stroke = null, fingers = {}, gest = null;
    function fingerList() { return Object.keys(fingers).map(function (k) { return fingers[k]; }); }
    function gestFrom(list) {
      var a = list[0], b = list[1];
      return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    }
    cap.addEventListener("pointerdown", function (e) {
      fingers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { cap.setPointerCapture(e.pointerId); } catch (x) {}
      var list = fingerList();
      if (list.length >= 2) {
        /* אצבע שנייה: מה שהתחיל כקו מבוטל — זו תנועת מפה, לא ציור. */
        if (stroke) { stroke = null; S.draft = null; drawOverlay(); }
        gest = gestFrom(list);
        return;
      }
      stroke = { id: e.pointerId };
      S.draft = { kind: "lawn", shape: "poly", pts: [toNorm(e.clientX, e.clientY)], free: true };
      drawOverlay();
    });
    cap.addEventListener("pointermove", function (e) {
      if (fingers[e.pointerId]) fingers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (gest) {
        var list = fingerList(); if (list.length < 2) return;
        var g = gestFrom(list), api = S.pins && S.pins.api;
        if (api && api.panBy) api.panBy(g.mx - gest.mx, g.my - gest.my);
        if (api && api.zoomAt && Math.abs(g.d / gest.d - 1) > 0.01) api.zoomAt(g.d / gest.d, g.mx, g.my);
        gest = g; drawOverlay();
        return;
      }
      if (!stroke || e.pointerId !== stroke.id) return;
      S.draft.pts.push(toNorm(e.clientX, e.clientY));
      drawOverlay();
    });
    function liftFinger(e) {
      delete fingers[e.pointerId];
      if (gest && fingerList().length < 2) { gest = null; if (!fingerList().length) fingers = {}; return true; }
      return !!gest;
    }
    function endStroke(e) {
      if (liftFinger(e)) return;
      if (!stroke || e.pointerId !== stroke.id) return;
      stroke = null;
      var pts = CBA.gardenGeo.thin(S.draft.pts, 1.5);
      if (pts.length < 3) { S.draft = null; drawOverlay(); showHint("הקו קצר מדי — ציירו את כל הגבול"); return; }
      /* אחרי הציור: מצב דיוק עם ידיות, והכלי חוזר להזזה — כך אפשר להזיז את המפה ולדייק. */
      S.draft = null;
      S.edit = { id: null, kind: "lawn", shape: "poly", pts: pts, isNew: true };
      setTool("hand", true);
      drawOverlay(); renderBar();
    }
    cap.addEventListener("pointerup", endStroke);
    cap.addEventListener("pointercancel", function (e) { liftFinger(e); stroke = null; S.draft = null; drawOverlay(); });
  }
  function moveHandle(k, n) {
    var D = S.edit || S.draft; if (!D) return;
    var W = worldWH();
    n = [Math.max(0, Math.min(1, n[0])), Math.max(0, Math.min(1, n[1]))];
    if (k === "r") D.r = Math.max(1.5 * W.ppm / W.w, Math.hypot((n[0] - D.cx) * W.w, (n[1] - D.cy) * W.h) / W.w);
    else if (k === "rx") D.rx = Math.max(1.5 * W.ppm / W.w, Math.abs(n[0] - D.cx));
    else if (k === "ry") D.ry = Math.max(1.5 * W.ppm / W.h, Math.abs(n[1] - D.cy));
    else if (D.pts && D.pts[+k]) D.pts[+k] = n;
    drawOverlay(); renderBar();
  }

  function onTap(n, target) {
    var hit = target && target.closest && target.closest("[data-lw]");
    var hitId = hit ? hit.getAttribute("data-lw") : null;
    /* שיוך תקלה → נכס */
    if (S.pick) {
      if (hitId) linkTaskTo(S.pick, hitId, true);
      else if (n) { var l = lawnAt(n); if (l) linkTaskTo(S.pick, l.id, true); }
      return;
    }
    /* כלי הוספה */
    if (S.mode === "edit" && S.tool !== "hand" && n && !S.edit) {
      /* 4.10 — הקשה על סמל קיים (ממטרה/מחשב) עם כלי הוספת נקודה פותחת אותו,
         ולא מניחה ממטרה שנייה בדיוק עליו. בכלי קו/מקטע — הנקודה ננעלת על הסמל. */
      var symHit = hit && hit.closest(".lw-sym > *") && byId(hitId);
      if (symHit && (S.tool === "spr" || S.tool === "ctrl")) return select({ type: "asset", id: hitId });
      if (symHit && (S.tool === "pipe" || S.tool === "lawn:poly")) n = [symHit.x, symHit.y];
      if (S.tool === "spr") return addPoint("spr", n);
      if (S.tool === "ctrl") return addPoint("ctrl", n);
      if (S.tool === "pipe" || S.tool === "lawn:poly") {
        if (!S.draft) {
          var p = n;
          if (S.tool === "pipe") { var c = nearestCtrl(n); if (c && CBA.gardenGeo.distM(n, [c.x, c.y]) < 4) p = [c.x, c.y]; }
          S.draft = S.tool === "pipe" ? { kind: "pipe", pts: [p], ctrl: (c && p !== n) ? c.id : "" }
                                       : { kind: "lawn", shape: "poly", pts: [p] };
        } else S.draft.pts.push(n);
        drawOverlay(); renderBar(); return;
      }
      if (S.tool === "lawn:circle" && !S.draft) {
        var W = worldWH();
        S.edit = { id: null, kind: "lawn", shape: "circle", cx: n[0], cy: n[1], r: 6 * W.ppm / W.w, isNew: true };
        drawOverlay(); renderBar(); return;
      }
      if (S.tool === "lawn:ellipse" && !S.draft) {
        var W2 = worldWH();
        S.edit = { id: null, kind: "lawn", shape: "ellipse", cx: n[0], cy: n[1], rx: 9 * W2.ppm / W2.w, ry: 5 * W2.ppm / W2.h, isNew: true };
        drawOverlay(); renderBar(); return;
      }
    }
    if (S.edit || S.draft) return;
    if (hitId) return select({ type: "asset", id: hitId });
    if (n && S.layers.lawn) { var lw = lawnAt(n); if (lw) return select({ type: "asset", id: lw.id }); }
    select(null);
  }
  function lawnAt(n) {
    var hits = S.lawns.filter(function (l) { return CBA.gardenGeo.inShape(l, n[0], n[1]); });
    hits.sort(function (a, b) { return CBA.gardenGeo.areaM2(a) - CBA.gardenGeo.areaM2(b); });
    return hits[0] || null;
  }
  function nearestCtrl(n) {
    var best = null, bd = Infinity;
    S.assets.forEach(function (a) {
      if (a.kind !== "ctrl") return;
      var d = CBA.gardenGeo.distM(n, [a.x, a.y]);
      if (d < bd) { bd = d; best = a; }
    });
    return best;
  }

  /* ========================================================================
   *  שמירות
   * ====================================================================== */
  function addPoint(kind, n) {
    var a = { id: CBA.gardenAssets.newId(kind === "spr" ? "s" : "c"), kind: kind, x: n[0], y: n[1], note: "" };
    if (kind === "spr") {
      var c = nearestCtrl(n);
      a.ctrl = c ? c.id : ""; a.station = 1; a.type = "pop"; a.range = 5; a.name = "";
      a._auto = !!c;
    } else {
      var cnt = S.assets.filter(function (x) { return x.kind === "ctrl"; }).length;
      a.name = "מחשב " + (cnt + 1);
    }
    /* 4.10 (בדיקת מובייל) — בטלפון הגיליון התחתון מכסה את סרגל הכלים, ולכן כל
       ממטרה חיבה "סגירה" לפני הבאה. שם: הכלי נשאר פעיל, הסמל החדש מודגש לרגע,
       ורמז קצר אומר מה קרה. הקשה על הסמל פותחת את הפרטים כרגיל. במחשב — כמו קודם. */
    saveAsset(a, function () {
      if (!narrow()) return select({ type: "asset", id: a.id });
      S.justAdded = a.id; drawOverlay();
      var c2 = a.ctrl && byId(a.ctrl);
      showHint((kind === "spr" ? "ממטרה נוספה" + (c2 ? " · שויכה ל" + c2.name : " · בלי מחשב") : a.name + " נוסף") +
        ". ממשיכים להקיש, או הקשה על הסמל לפרטים.");
      setTimeout(function () { if (S.justAdded === a.id) { S.justAdded = null; drawOverlay(); } }, 2200);
    });
  }
  function narrow() { return !!(S.root && S.root.getBoundingClientRect().width <= 760); }
  function saveAsset(a, after) {
    CBA.gardenAssets.saveAsset(a, function (res) {
      if (!res.ok) return toast(errText(res.err), "error");
      upsert(a);
      if (after) after();
      drawOverlay(); renderSum(); renderPanel();
    });
  }
  function upsert(a) {
    if (a.kind === "lawn") {
      var i = S.lawns.findIndex(function (x) { return x.id === a.id; });
      if (a.archived) { if (i >= 0) S.lawns.splice(i, 1); }
      else if (i >= 0) S.lawns[i] = a; else S.lawns.push(a);
    } else {
      var j = S.assets.findIndex(function (x) { return x.id === a.id; });
      if (a.archived) { if (j >= 0) S.assets.splice(j, 1); }
      else if (j >= 0) S.assets[j] = a; else S.assets.push(a);
    }
    S.all[a.id] = a;
  }
  /** שמירת טיוטה/עריכה (סיום). */
  function finish() {
    var D = S.edit || S.draft, G = CBA.gardenGeo;
    if (!D || S.saving) return;
    /* הזזת נקודה בודדת (ממטרה/מחשב) */
    if (D.point) {
      var mv = Object.assign({}, byId(D.id), { x: D.pts[0][0], y: D.pts[0][1] }); delete mv._auto;
      S.saving = true; renderBar();
      return CBA.gardenAssets.saveAsset(mv, function (res) {
        S.saving = false;
        if (!res.ok) { renderBar(); return toast(errText(res.err), "error"); }
        upsert(mv); S.edit = null; S.vtx = -1; drawOverlay(); renderBar(); renderPanel(); toast("המיקום עודכן");
      });
    }
    if (D.kind === "pipe") {
      if (D.pts.length < 2) return toast("קו צריך לפחות שתי נקודות");
      var p = S.edit && S.edit.id ? Object.assign({}, byId(S.edit.id)) : { id: CBA.gardenAssets.newId("p"), kind: "pipe", name: "", note: "" };
      p.pts = D.pts.map(function (q) { return q.slice(); });
      if (!p.ctrl) { var c = D.ctrl ? byId(D.ctrl) : nearestCtrl(D.pts[0]); p.ctrl = c ? c.id : ""; }
      var wasNew = !(S.edit && S.edit.id);
      S.saving = true; renderBar();
      return CBA.gardenAssets.saveAsset(Object.assign({}, p, { pts: p.pts }), function (res) {
        S.saving = false;
        if (!res.ok) { renderBar(); return toast(errText(res.err), "error"); }
        p.pts = G.flat(p.pts); upsert(p);
        S.draft = null; S.edit = null; S.vtx = -1;
        if (wasNew) setTool("hand", true);
        select({ type: "asset", id: p.id });
        toast(wasNew ? "הקו נשמר · " + fmt(G.lengthM(G.pairs(p.pts))) + " מ'" : "הקו עודכן");
      });
    }
    /* מדשאה */
    var poly = D.shape === "poly";
    if (poly && D.pts.length < 3) return toast("מקטע צריך לפחות שלוש נקודות");
    var base = S.edit && S.edit.id ? byId(S.edit.id) : null;
    var l = base ? Object.assign({}, base) : { id: CBA.gardenAssets.newId("lw"), kind: "lawn", name: "", rev: 0, status: "ok", parentId: "" };
    l.shape = D.shape;
    delete l.cx; delete l.cy; delete l.r; delete l.rx; delete l.ry;
    if (poly) l.pts = G.flat(D.pts);
    else { l.pts = []; l.cx = D.cx; l.cy = D.cy; if (D.shape === "circle") l.r = D.r; else { l.rx = D.rx; l.ry = D.ry; } }
    if (!base) {
      var c0 = G.centroid(l);
      var par = S.lawns.filter(function (x) { return !x.parentId && G.inShape(x, c0[0], c0[1]); })[0];
      l.parentId = par ? par.id : "";
      l.name = par ? "כתם בתוך " + par.name : "מקטע " + (S.lawns.filter(function (x) { return !x.parentId; }).length + 1);
      if (par) l.name = l.name.slice(0, 60);
    }
    S.saving = true; renderBar();
    CBA.gardenAssets.saveLawn(l, function (res) {
      S.saving = false;
      if (!res.ok) { renderBar(); return toast(errText(res.err), "error"); }
      l.rev = res.rev; upsert(l);
      S.draft = null; S.edit = null; S.vtx = -1;
      if (!base) setTool("hand", true);
      select({ type: "asset", id: l.id, rename: !base });
      toast(base ? "הצורה עודכנה" : "המקטע נשמר · " + fmt(G.areaM2(l)) + " מ\"ר");
    });
  }
  function cancelDraft() {
    S.draft = null; S.edit = null; S.vtx = -1;
    drawOverlay(); renderBar(); renderPanel();
  }
  function startShapeEdit(a) {
    var G = CBA.gardenGeo;
    if (a.kind === "pipe") S.edit = { id: a.id, kind: "pipe", pts: G.pairs(a.pts), orig: null };
    else if (a.shape === "poly") S.edit = { id: a.id, kind: "lawn", shape: "poly", pts: G.pairs(a.pts), orig: a };
    else S.edit = { id: a.id, kind: "lawn", shape: a.shape, cx: a.cx, cy: a.cy, r: a.r, rx: a.rx, ry: a.ry, orig: a };
    S.vtx = -1;
    drawOverlay(); renderBar(); renderPanel();
  }
  function setLawnStatus(l, st) {
    if (l.status === st) return;
    var prev = l.status;
    l.status = st; drawOverlay(); renderSum(); renderPanel();
    CBA.gardenAssets.setLawnStatus(l, st, function (res) {
      if (!res.ok) { l.status = prev; drawOverlay(); renderSum(); renderPanel(); return toast(errText(res.err), "error"); }
      l.statusAt = new Date(); l.statusBy = (CBA.fb && CBA.fb.uid && CBA.fb.uid()) || "";
      toast("המקטע סומן " + STATUS_L[st]);
    });
  }
  function rename(a, name) {
    name = String(name || "").trim().slice(0, 60);
    if (!name || name === a.name) return;
    var copy = Object.assign({}, a, { name: name });
    if (a.kind === "lawn") {
      CBA.gardenAssets.saveLawn(copy, function (res) {
        if (!res.ok) return toast(errText(res.err), "error");
        copy.rev = res.rev; upsert(copy); drawOverlay(); renderPanel();
      });
    } else saveAsset(copy);
  }
  function archive(a) {
    var faults = CBA.gardenAssets.faultsOf(a.id, S.tasks).filter(function (t) { return !t.closure; });
    var msg = "להסיר את \"" + displayName(a) + "\" מהמפה?" +
      (faults.length ? "\n\n" + faults.length + " תקלות פתוחות משויכות אליו — הן נשארות, רק השיוך יוצג כ\"הוסר\"." : "");
    CBA.ui.confirm(msg, { title: "הסרה מהמפה", okText: "הסרה" }).then(function (yes) {
      if (!yes) return;
      var copy = Object.assign({}, a, { archived: true });
      var done = function (res) {
        if (!res.ok) return toast(errText(res.err), "error");
        upsert(copy); S.all[a.id] = copy; select(null); renderSum();
        toast("הוסר מהמפה");
      };
      if (a.kind === "lawn") CBA.gardenAssets.saveLawn(copy, function (r) { if (r.ok) copy.rev = r.rev; done(r); });
      else CBA.gardenAssets.saveAsset(copy, done);
    });
  }

  /* ---- שיוך ---- */
  function canRelink(t) { return !t.closure || isMgr(); }
  /* סוג תקלה (fkind) — רק בתקלות דשא/השקיה. */
  function isLawnWater(t) {
    var k = CBA.gardenLang && CBA.gardenLang.catOf ? CBA.gardenLang.catOf(t && t.category).key : "";
    return k === "lawn" || k === "water";
  }
  /** הסוג שהשיוך ממלא — רק כשעוד לא נבחר סוג, ורק בקטגוריה המתאימה. */
  function autoKind(t, a) {
    if (!t || !a || t.fkind || !isLawnWater(t)) return "";
    return CBA.gardenAssets.fkindOfAsset(a.kind);
  }
  function setKind(t, k) {
    if (!canRelink(t)) return toast("התקלה סגורה — רק מנהל הגינון משנה", "error");
    var next = t.fkind === k ? "" : k;
    CBA.gardenAssets.setFaultKind(t.id, next, function (res) {
      if (!res.ok) return toast(errText(res.err), "error");
      t.fkind = res.fkind;
      setPins(true); renderPanel(); renderBar();
    });
  }
  function linkTaskTo(taskId, assetId, fromPick) {
    var t = taskById(taskId), a = byId(assetId);
    if (!t || !a) return;
    if (!canRelink(t)) return toast("התקלה סגורה — רק מנהל הגינון משנה שיוך", "error");
    var next = (t.assets || []).filter(function (x) { return x !== assetId; }).concat([assetId]);
    if (next.length > 5) return toast("אפשר לשייך תקלה לעד 5 סימונים", "error");
    var fk = autoKind(t, a);
    CBA.gardenAssets.linkTask(t.id, next, function (res) {
      if (!res.ok) return toast(errText(res.err), "error");
      t.assets = res.assets;
      if (res.fkind) t.fkind = res.fkind;
      if (fromPick) S.pick = null;
      toast("שויך: " + (t.title || "תקלה") + " ← " + displayName(a) +
        (res.fkind ? " · סוג: " + CBA.gardenAssets.FKIND[res.fkind].label : ""));
      renderBar(); setPins(true); drawOverlay(); renderPanel(); renderSum();
    }, fk ? { fkind: fk } : null);
  }
  function unlink(taskId, assetId) {
    var t = taskById(taskId); if (!t) return;
    if (!canRelink(t)) return toast("התקלה סגורה — רק מנהל הגינון משנה שיוך", "error");
    var next = (t.assets || []).filter(function (x) { return x !== assetId; });
    CBA.gardenAssets.linkTask(t.id, next, function (res) {
      if (!res.ok) return toast(errText(res.err), "error");
      t.assets = res.assets; setPins(true); drawOverlay(); renderPanel(); renderSum();
    });
  }
  function startPick(taskId) {
    S.pick = taskId;
    if (!S.layers.water || !S.layers.lawn) { S.layers.water = true; S.layers.lawn = true; renderLayers(); }
    renderBar(); drawOverlay(); renderPanel();
  }

  /* ---- פתיחת תקלה מנכס ---- */
  function openFaultAt(a) {
    if (!CBA.gardenForm) return toast("הטופס לא נטען — רעננו את העמוד", "error");
    if (!S.meta.categories.length) return toast("רשימת הקטגוריות לא נטענה — נסו שוב בעוד רגע", "error");
    var at = CBA.gardenGeo.anchorOf(a, a.kind === "pipe" ? CBA.gardenGeo.pairs(a.pts)[0] : [a.x, a.y]) || [a.x, a.y];
    var want = a.kind === "lawn" ? /דשא|מדשא/ : /השקי|ממטר/;
    var cat = S.meta.categories.filter(function (c) { return want.test(c); })[0] || "";
    var L = CBA.gardenLang, cur = L.weekOf();
    var nx = new Date(cur + "T12:00:00"); nx.setDate(nx.getDate() + 7);
    var next = nx.getFullYear() + "-" + String(nx.getMonth() + 1).padStart(2, "0") + "-" + String(nx.getDate()).padStart(2, "0");
    var K = CBA.gardenKit || {};
    CBA.gardenForm.open({
      mode: "task", noRepeat: !isMgr(),
      cats: S.meta.categories, areas: S.meta.areas,
      ico: K.ico, catOf: K.catOf, esc: esc,
      weeks: [{ v: cur, label: "השבוע" }, { v: next, label: "שבוע הבא" }, { v: "", label: "בלי שבוע — לשיבוץ" }],
      at: { x: at[0], y: at[1] }, cat: cat,
      /* הסוג נגזר מהסימון (ממטרה → "תקלה בממטרה"), ונבחר מראש בטופס — אפשר לשנות שם. */
      fkind: CBA.gardenAssets.fkindOfAsset(a.kind),
      onSaved: function (res) {
        var ids = (res && res.ids && res.ids.length) ? res.ids : (res && res.id ? [res.id] : []);
        var left = ids.length;
        if (!left) return loadAll(true);
        ids.forEach(function (id) {
          CBA.gardenAssets.linkTask(id, [a.id], function (r) {
            if (!r.ok) toast("התקלה נפתחה, אבל השיוך ל" + displayName(a) + " לא נשמר — שייכו מהכרטיס", "error");
            if (!--left) loadAll(true);
          });
        });
      }
    });
  }

  /* ========================================================================
   *  כרום: מצב, שכבות, כלים, סרגל פעולה
   * ====================================================================== */
  function bindChrome() {
    var R = S.root;
    R.querySelector(".lw-mode").addEventListener("click", function (e) {
      var b = e.target.closest("[data-mode]"); if (!b) return;
      if (S.draft || S.edit) cancelDraft();
      S.mode = b.dataset.mode; S.tool = "hand";
      R.querySelectorAll(".lw-mode [data-mode]").forEach(function (x) {
        var on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", on);
      });
      renderTools(); renderPanel();
    });
    R.querySelector("#lw-layers").addEventListener("click", function (e) {
      var b = e.target.closest("[data-layer]"); if (!b) return;
      var k = b.dataset.layer;
      S.layers[k] = !S.layers[k];
      if (k === "spray" && S.layers.spray) S.layers.water = true;
      saveLayers(); renderLayers(); setPins(true); drawOverlay();
    });
    R.querySelector("#lw-tools").addEventListener("click", function (e) {
      var b = e.target.closest("[data-tool]"); if (b) setTool(b.dataset.tool);
    });
    R.querySelector("#lw-bar").addEventListener("click", function (e) {
      var b = e.target.closest("[data-bar]"); if (!b) return;
      var k = b.dataset.bar;
      if (k === "done") finish();
      else if (k === "cancel") cancelDraft();
      else if (k === "undo") { var D = S.draft || S.edit; if (D && D.pts) { D.pts.pop(); if (!D.pts.length) S.draft = null; } drawOverlay(); renderBar(); }
      else if (k === "delpt") { var E = S.edit; if (E && E.pts && E.pts.length > (E.kind === "pipe" ? 2 : 3) && S.vtx >= 0) { E.pts.splice(S.vtx, 1); S.vtx = -1; } drawOverlay(); renderBar(); }
      else if (k === "unpick") { S.pick = null; renderBar(); drawOverlay(); renderPanel(); }
      else if (k === "sugg") linkTaskTo(S.pick, b.dataset.id, true);
      else if (k === "retry") { S.err = null; loadAll(false); }
    });
    /* 🌱 גל ב' — "N דיוקי גבול ממתינים" → התקלה הראשונה, ממוקדת במפה. */
    R.querySelector("#lw-sum").addEventListener("click", function (e) {
      if (!e.target.closest('[data-act="edits"]')) return;
      var list = pendingEditTasks(); if (!list.length) return;
      var cur = S.sel && S.sel.type === "task" ? list.findIndex(function (t) { return String(t.id) === String(S.sel.id); }) : -1;
      var t = list[(cur + 1) % list.length];
      select({ type: "task", id: t.id });
      var pe = S.edits[String(t.repId)];
      var pp = pe && pe.pts ? CBA.gardenGeo.pairs(pe.pts) : (hasLoc(t) ? [[+t.x, +t.y]] : []);
      if (pp.length) {
        var x0 = 1, y0 = 1, x1 = 0, y1 = 0;
        pp.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
        var api = S.pins && S.pins.api;
        if (api && api.fitBox) api.fitBox(Math.max(0, x0 - 0.01), Math.max(0, y0 - 0.01), Math.min(1, x1 + 0.01), Math.min(1, y1 + 0.01), 40);
      }
    });
    R.querySelector("#lw-state").addEventListener("click", function (e) {
      if (e.target.closest("[data-retry]")) loadAll(false);
    });
    R.querySelector("#lw-panel").addEventListener("click", onPanelClick);
    R.querySelector("#lw-panel").addEventListener("change", onPanelChange);
    R.querySelector("#lw-panel").addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.matches("[data-rename]")) { e.preventDefault(); e.target.blur(); }
    });
    document.addEventListener("keydown", function esc_(e) {
      if (!S || !S.root || !S.root.isConnected) { document.removeEventListener("keydown", esc_); return; }
      if (e.key !== "Escape") return;
      if (S.pick) { S.pick = null; renderBar(); drawOverlay(); renderPanel(); }
      else if (S.draft || S.edit) cancelDraft();
    });
  }
  var hinted = {};
  function setTool(t, quiet) {
    if (S.draft && t !== S.tool) { S.draft = null; }
    S.tool = t;
    renderTools(); renderBar(); drawOverlay();
    /* הסבר הכלי — פעם אחת לכל כלי בכל כניסה, לא בכל לחיצה. */
    if (!quiet && TOOL_HINT[t] && !hinted[t]) { hinted[t] = 1; showHint(TOOL_HINT[t]); }
  }
  /* 4.10 — רמז בתוך המפה (לא טוסט): בטלפון הטוסט כיסה את הגיליון התחתון. */
  var hintT = null;
  function showHint(msg) {
    var el = S.root && S.root.querySelector("#lw-hint"); if (!el) return toast(msg);
    el.textContent = msg; el.classList.add("is-on");
    clearTimeout(hintT);
    hintT = setTimeout(function () { el.classList.remove("is-on"); }, Math.max(3500, msg.length * 70));
    el.onclick = function () { clearTimeout(hintT); el.classList.remove("is-on"); };
  }
  function renderLayers() {
    var L = [["lawn", "דשא", "#5FA36F"], ["water", "השקיה", "#3E8DBA"], ["faults", "תקלות", "#C0655C"], ["spray", "טווח התזה", "rgba(62,141,186,.45)"]];
    S.root.querySelector("#lw-layers").innerHTML = L.map(function (l) {
      return '<button type="button" class="lw-chip' + (S.layers[l[0]] ? " is-on" : "") + '" data-layer="' + l[0] + '" aria-pressed="' + !!S.layers[l[0]] + '">' +
        '<i style="background:' + l[2] + '"></i>' + l[1] + '</button>';
    }).join("");
  }
  function renderTools() {
    var el = S.root.querySelector("#lw-tools");
    el.hidden = S.mode !== "edit";
    S.root.classList.toggle("is-edit", S.mode === "edit");
    var T = [["hand", "הזזה", "hand"], ["spr", "ממטרה", "spr"], ["ctrl", "מחשב", "ctrl"], ["pipe", "צנרת", "pipe"]];
    var LT = [["lawn:poly", "דשא בנקודות", "poly"], ["lawn:free", "דשא חופשי", "free"], ["lawn:circle", "עיגול", "circle"], ["lawn:ellipse", "אליפסה", "ellipse"]];
    el.innerHTML = T.map(btn).join("") + '<span class="lw-tool-sep" aria-hidden="true"></span>' + LT.map(btn).join("");
    function btn(x) {
      return '<button type="button" class="lw-tool' + (S.tool === x[0] ? " is-on" : "") + '" data-tool="' + x[0] + '" aria-pressed="' + (S.tool === x[0]) + '">' +
        ico(x[2]) + '<span>' + x[1] + '</span></button>';
    }
    var cap = S.root.querySelector("#lw-capture");
    cap.hidden = !(S.mode === "edit" && S.tool === "lawn:free" && !S.edit && !S.space);
    S.root.classList.toggle("is-drawing", S.mode === "edit" && S.tool !== "hand" && !S.space);
  }
  function renderBar() {
    var el = S.root.querySelector("#lw-bar"), G = CBA.gardenGeo;
    var D = S.edit || S.draft;
    renderTools();
    if (S.pick) {
      var t = taskById(S.pick);
      var sg = t ? CBA.gardenAssets.suggest(t, items(), 12) : null;
      el.hidden = false;
      el.innerHTML = '<span>' + ico("link", 16) + 'הקישו על ממטרה, מחשב, קו או מקטע דשא</span>' +
        (sg ? '<button type="button" class="lw-bw" data-bar="sugg" data-id="' + esc(sg.a.id) + '">' + esc(displayName(sg.a)) + ' · ' + (sg.m < 1 ? "כאן" : fmt(sg.m) + " מ'") + '</button>' : '') +
        '<button type="button" class="lw-bg" data-bar="unpick">ביטול</button>';
      return;
    }
    if (!D) { el.hidden = true; el.innerHTML = ""; return; }
    var info = "";
    if (D.point) info = "גררו את " + (D.kind === "ctrl" ? "המחשב" : "הממטרה") + " למקום החדש";
    else if (D.kind === "pipe") info = "קו צנרת · " + D.pts.length + " נקודות · " + fmt(G.lengthM(D.pts)) + " מ'";
    else if (D.shape === "poly") info = (S.edit && S.edit.id ? "עריכת צורה" : "מקטע דשא") + " · " + D.pts.length + " נקודות" +
      (D.pts.length > 2 ? " · " + fmt(G.areaM2({ shape: "poly", pts: G.flat(D.pts) })) + " מ\"ר" : "");
    else info = (D.shape === "circle" ? "עיגול" : "אליפסה") + " · " + fmt(G.areaM2(D)) + " מ\"ר";
    var min = D.kind === "pipe" ? 2 : D.shape === "poly" ? 3 : 0;
    var canDone = !D.pts || D.pts.length >= min;
    el.hidden = false;
    el.innerHTML = '<span>' + esc(info) + '</span>' +
      (S.draft && D.pts && D.pts.length ? '<button type="button" class="lw-bg" data-bar="undo">בטל נקודה</button>' : '') +
      (S.edit && !D.point && S.vtx >= 0 && D.pts && D.pts.length > min ? '<button type="button" class="lw-bg" data-bar="delpt">מחיקת הנקודה</button>' : '') +
      '<button type="button" class="lw-bg" data-bar="cancel">ביטול</button>' +
      '<button type="button" class="lw-bw" data-bar="done"' + (canDone && !S.saving ? '' : ' disabled') + '>' + (S.saving ? "שומר…" : "סיום") + '</button>';
  }
  function renderState() {
    var el = S.root && S.root.querySelector("#lw-state"); if (!el) return;
    if (S.loading) { el.hidden = false; el.className = "lw-state"; el.innerHTML = '<span class="lw-spin" aria-hidden="true"></span>טוען את שכבת ההשקיה…'; return; }
    if (S.err) {
      el.hidden = false; el.className = "lw-state is-err";
      el.innerHTML = 'שכבת ההשקיה לא נטענה<button type="button" data-retry>' + ico("refresh", 14) + 'לנסות שוב</button>';
      return;
    }
    if (S.tasksErr) {
      el.hidden = false; el.className = "lw-state is-warn";
      el.innerHTML = 'התקלות לא נטענו — הסימונים כן<button type="button" data-retry>' + ico("refresh", 14) + 'לנסות שוב</button>';
      return;
    }
    el.hidden = true;
  }
  function renderSum() {
    var el = S.root && S.root.querySelector("#lw-sum"); if (!el) return;
    if (S.loading || S.err) { el.innerHTML = ""; return; }
    var s = CBA.gardenAssets.summary(S.lawns, S.assets, S.tasks), tot = s.lawnTotal || 0;
    var sub = S.root.querySelector("#lw-sub");
    if (sub) sub.textContent = s.ctrl + " מחשבי השקיה · " + s.spr + " ממטרות · " + fmt(tot) + " מ\"ר דשא";
    var pct = function (k) { return tot ? Math.round(s.lawn[k] / tot * 100) : 0; };
    el.innerHTML =
      '<span class="lw-stat"><i class="lw-sw-ctrl"></i><b>' + s.ctrl + '</b> מחשבים</span>' +
      '<span class="lw-stat"><i class="lw-sw-spr"></i><b>' + s.spr + '</b> ממטרות' +
        (s.sprBad ? ' · <b class="lw-bad">' + s.sprBad + ' בתקלה</b>' : '') + '</span>' +
      '<span class="lw-stat"><i class="lw-sw-pipe"></i><b>' + fmt(s.pipeM) + '</b> מ\' צנרת</span>' +
      '<span class="lw-stat lw-stat--lawn">דשא <b>' + fmt(tot) + '</b> מ"ר' +
        (tot ? '<span class="lw-meter" role="img" aria-label="' + pct("ok") + '% תקין, ' + pct("dry") + '% יבש, ' + pct("dead") + '% מת">' +
          '<u class="s-ok" style="width:' + pct("ok") + '%"></u><u class="s-dry" style="width:' + pct("dry") + '%"></u><u class="s-dead" style="width:' + pct("dead") + '%"></u></span>' +
          '<em>' + pct("ok") + '% תקין · ' + pct("dry") + '% יבש · ' + pct("dead") + '% מת</em>' : '') + '</span>' +
      (pendingEditTasks().length ? '<button type="button" class="lw-stat lw-stat--edits" data-act="edits">' +
        '<b>' + pendingEditTasks().length + '</b> ' + (pendingEditTasks().length === 1 ? "דיוק גבול ממתין" : "דיוקי גבול ממתינים") + '</button>' : '');
  }
  /** תקלות שיש להן דיוק גבול ממתין (לפי מזהה הדיווח). */
  function pendingEditTasks() {
    return S.tasks.filter(function (t) { return t.repId && S.edits[String(t.repId)]; });
  }

  /* ========================================================================
   *  הפאנל (צד במחשב · גיליון תחתון בטלפון)
   * ====================================================================== */
  function select(sel) {
    S.sel = sel; S.linkFor = null;
    if (S.pins) S.pins.select(sel && sel.type === "task" ? sel.id : null);
    drawOverlay(); renderPanel();
    if (sel && sel.rename) setTimeout(function () {
      var inp = S.root.querySelector("[data-rename]"); if (inp) { inp.focus(); inp.select(); }
    }, 60);
  }
  function renderPanel() {
    var el = S.root && S.root.querySelector("#lw-panel"); if (!el) return;
    var x = selected();
    S.root.classList.toggle("has-sheet", !!x);
    el.classList.toggle("is-empty", !x);
    if (!x) { el.innerHTML = emptyPanel(); return; }
    el.innerHTML = '<div class="lw-grip" aria-hidden="true"></div>' + (S.sel.type === "task" ? faultPanel(x) : assetPanel(x));
    var lr = el.querySelector("#lw-lr");
    if (lr && CBA.lawnRefine && CBA.lawnRefine.decision) {
      CBA.lawnRefine.decision(lr, { repId: x.repId, taskId: x.id, familyId: x.familyId || "",
        onDecided: function () { loadAll(true); } });
    }
  }
  function emptyPanel() {
    if (S.loading) return '<div class="lw-empty"><div class="sk-line" style="width:60%"></div><div class="sk-line"></div><div class="sk-line" style="width:80%"></div></div>';
    var none = !S.err && !S.lawns.length && !S.assets.length;
    return '<div class="lw-empty">' +
      (none
        ? '<h3>עוד לא סומן כלום</h3><p>הדרך הכי מהירה להתחיל: לסמן את מחשבי ההשקיה, ואז את הממטרות של כל אחד מהם. מקטעי דשא אפשר לסמן בכל שלב.</p>' +
          '<button type="button" class="lw-btn lw-btn--pri lw-cta" data-act="start">' + ico("ctrl") + 'להתחיל לסמן</button>'
        : '<h3>מה רואים כאן</h3><p>מפת התשתית של הגינון. הקישו על ממטרה, מחשב, קו, מקטע דשא או תקלה כדי לראות פרטים ושיוכים.</p>') +
      '<div class="lw-leg">' +
        '<div><span class="lw-lg lw-lg--ok"></span>דשא תקין</div>' +
        '<div><span class="lw-lg lw-lg--dry"></span>דשא יבש — נקודות</div>' +
        '<div><span class="lw-lg lw-lg--dead"></span>דשא מת — פסים</div>' +
        '<div><span class="lw-spr lw-spr--leg"><i></i></span>ממטרה · טבעת צבעונית = יש תקלה פתוחה</div>' +
        '<div><span class="lw-ctrl lw-ctrl--leg"><b>' + ico("ctrl", 13) + '<em>2</em></b></span>מחשב השקיה</div>' +
        '<div><span class="lw-lg lw-lg--pipe"></span>קו צנרת</div>' +
        '<div><span class="lw-lg lw-lg--teth"></span>שיוך תקלה לסימון</div>' +
      '</div>' +
      (S.mode === "view" && !none ? '<p class="lw-note"><b>לסימון חדש:</b> "סימון ועריכה" למעלה.</p>' : '') +
    '</div>';
  }
  function head(color, icon, title, sub, editable) {
    return '<div class="lw-ph"><span class="lw-ph__ic" style="background:' + color + '">' + (String(icon).charAt(0) === "<" ? icon : ico(icon, 22)) + '</span>' +
      '<div class="lw-ph__t">' +
        (editable ? '<input class="lw-rename" data-rename value="' + esc(title) + '" maxlength="60" aria-label="שם">' : '<b>' + esc(title) + '</b>') +
        '<span>' + esc(sub) + '</span></div>' +
      '<button type="button" class="lw-x" data-act="close" aria-label="סגירה">' + ico("x", 16) + '</button></div>';
  }
  function ago(ts) {
    var d = ts && ts.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d || isNaN(d)) return "";
    var days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days <= 0 ? "היום" : days === 1 ? "אתמול" : "לפני " + days + " ימים";
  }
  function assetPanel(a) {
    var G = CBA.gardenGeo, h = '<div class="lw-p">';
    var editMode = S.mode === "edit";
    if (a.kind === "lawn") {
      h += head("var(--lw-" + a.status + ")", "lawn", a.name || "מקטע דשא", "מקטע דשא" + (a.parentId && byId(a.parentId) ? " · בתוך " + byId(a.parentId).name : ""), true);
      h += '<div class="lw-sec"><div class="lw-sec__t">מצב הדשא</div><div class="lw-st3" role="group" aria-label="מצב הדשא">' +
        ["ok", "dry", "dead"].map(function (s) {
          return '<button type="button" data-status="' + s + '" class="' + (a.status === s ? "is-on" : "") + '" aria-pressed="' + (a.status === s) + '"><i class="s-' + s + '"></i>' + STATUS_L[s] + '</button>';
        }).join("") + '</div></div>';
      var inside = S.assets.filter(function (s) { return s.kind === "spr" && G.inShape(a, s.x, s.y); }).length;
      h += '<dl class="lw-kv"><dt>שטח</dt><dd>' + fmt(G.areaM2(a)) + ' מ"ר</dd><dt>ממטרות בתוכו</dt><dd>' + inside + '</dd>' +
        (a.statusAt ? '<dt>מצב עודכן</dt><dd>' + esc(ago(a.statusAt)) + '</dd>' : '') + '</dl>';
      var openOn = CBA.gardenAssets.faultsOf(a.id, S.tasks).some(function (t) { return !t.closure; });
      if (a.status !== "ok" && !openOn) h += '<div class="lw-sugg"><span>המקטע ' + STATUS_L[a.status] + ' ואין עליו תקלה פתוחה.</span><button type="button" class="lw-btn lw-btn--pri" data-act="newfault">פתיחת תקלה</button></div>';
    } else if (a.kind === "spr") {
      var c = byId(a.ctrl);
      h += head("var(--lw-water)", "spr", sprLabel(a), "ממטרה", true);
      if (a._auto && c) h += '<p class="lw-note">שויכה אוטומטית ל<b>' + esc(c.name) + '</b> — הקרוב ביותר. אם היא על מחשב אחר, משנים כאן.</p>';
      var ctrls = S.assets.filter(function (x) { return x.kind === "ctrl"; });
      h += '<div class="lw-sec"><div class="lw-sec__t">מחשב השקיה</div><div class="lw-chips">' +
        (ctrls.length ? ctrls.map(function (x) { return '<button type="button" class="lw-c' + (a.ctrl === x.id ? " is-on" : "") + '" data-set="ctrl" data-v="' + esc(x.id) + '">' + esc(x.name) + '</button>'; }).join("")
                      : '<span class="lw-muted">עוד אין מחשבים — סמנו מחשב, והממטרה תשויך אליו.</span>') + '</div></div>';
      h += '<div class="lw-row"><div class="lw-sec"><div class="lw-sec__t">קו</div>' + stepper("station", a.station || 1, 1, 24) + '</div>' +
        '<div class="lw-sec"><div class="lw-sec__t">טווח התזה</div>' + stepper("range", a.range || 5, 1, 25, " מ'") + '</div></div>';
      h += '<div class="lw-sec"><div class="lw-sec__t">סוג</div><div class="lw-chips">' +
        Object.keys(CBA.gardenAssets.SPR_TYPES).map(function (k) { return '<button type="button" class="lw-c' + (a.type === k ? " is-on" : "") + '" data-set="type" data-v="' + k + '">' + CBA.gardenAssets.SPR_TYPES[k] + '</button>'; }).join("") + '</div></div>';
    } else if (a.kind === "ctrl") {
      var sp = S.assets.filter(function (s) { return s.kind === "spr" && s.ctrl === a.id; }), st = {};
      sp.forEach(function (s) { st[s.station || 1] = (st[s.station || 1] || 0) + 1; });
      var pm = S.assets.filter(function (p) { return p.kind === "pipe" && p.ctrl === a.id; }).reduce(function (s, p) { return s + G.lengthM(G.pairs(p.pts)); }, 0);
      h += head("var(--lw-water-2)", "ctrl", a.name || "מחשב השקיה", "מחשב השקיה", true);
      h += '<dl class="lw-kv"><dt>ממטרות</dt><dd>' + sp.length + (sp.length ? ' (' + Object.keys(st).sort(function (x, y) { return x - y; }).map(function (k) { return 'קו ' + k + ': ' + st[k]; }).join(" · ") + ')' : '') + '</dd>' +
        '<dt>צנרת</dt><dd>' + fmt(pm) + ' מ\'</dd></dl>';
    } else if (a.kind === "pipe") {
      var pc = byId(a.ctrl), ctrls2 = S.assets.filter(function (x) { return x.kind === "ctrl"; });
      h += head("var(--lw-water)", "pipe", displayName(a), "קו צנרת · " + fmt(G.lengthM(G.pairs(a.pts))) + " מ'", true);
      h += '<div class="lw-sec"><div class="lw-sec__t">מחשב השקיה</div><div class="lw-chips">' +
        ctrls2.map(function (x) { return '<button type="button" class="lw-c' + (a.ctrl === x.id ? " is-on" : "") + '" data-set="ctrl" data-v="' + esc(x.id) + '">' + esc(x.name) + '</button>'; }).join("") +
        (pc ? '' : '<span class="lw-muted">לא משויך למחשב</span>') + '</div></div>';
    }
    if (a.kind !== "lawn") {
      h += '<div class="lw-sec"><label class="lw-sec__t" for="lw-note">הערה ' + (a.kind === "ctrl" ? "(תוכנית, שעות, קוד)" : "") + '</label>' +
        '<textarea class="lw-inp" id="lw-note" data-note maxlength="300" rows="2" placeholder="' + (a.kind === "ctrl" ? "למשל: קו 1 ב-05:00 ל-20 דק׳" : "לא חובה") + '">' + esc(a.note || "") + '</textarea></div>';
    }
    /* תקלות משויכות */
    var lf = CBA.gardenAssets.faultsOf(a.id, S.tasks).sort(function (x, y) { return (x.closure ? 1 : 0) - (y.closure ? 1 : 0); });
    h += '<div class="lw-sec"><div class="lw-sec__t">תקלות משויכות (' + lf.length + ')</div><div class="lw-list">' +
      (lf.length ? lf.map(function (t) { return faultRow(t, { linked: true, unlink: canRelink(t) ? a.id : "" }); }).join("") : '<p class="lw-muted">אין תקלות משויכות.</p>') + '</div></div>';
    if (S.linkFor === a.id) {
      var cands = S.tasks.filter(function (t) { return !t.closure && hasLoc(t) && (t.assets || []).indexOf(a.id) === -1; })
        .map(function (t) { return { t: t, m: G.distToAsset([+t.x, +t.y], a) }; })
        .sort(function (x, y) { return x.m - y.m; }).slice(0, 6);
      h += '<div class="lw-sec"><div class="lw-sec__t">שיוך תקלה קיימת · הקרובות קודם</div><div class="lw-list">' +
        (cands.length ? cands.map(function (c) { return faultRow(c.t, { dist: c.m, act: "link" }); }).join("") : '<p class="lw-muted">אין תקלות פתוחות עם מיקום.</p>') + '</div></div>';
    }
    h += '<div class="lw-acts">' +
      '<button type="button" class="lw-btn lw-btn--pri" data-act="newfault">' + ico("plus") + 'פתיחת תקלה כאן</button>' +
      '<button type="button" class="lw-btn" data-act="linkmode" aria-expanded="' + (S.linkFor === a.id) + '">' + ico("link") + (S.linkFor === a.id ? "סגירת הרשימה" : "שיוך תקלה קיימת") + '</button>' +
      (editMode && (a.kind === "lawn" || a.kind === "pipe") ? '<button type="button" class="lw-btn" data-act="shape">' + ico("edit") + 'עריכת צורה</button>' : '') +
      (editMode && (a.kind === "spr" || a.kind === "ctrl") ? '<button type="button" class="lw-btn" data-act="move">' + ico("hand") + 'הזזה</button>' : '') +
      (editMode ? '<button type="button" class="lw-btn lw-btn--danger" data-act="archive">' + ico("trash") + 'הסרה</button>' : '') +
    '</div></div>';
    return h;
  }
  function stepper(key, v, min, max, unit) {
    return '<div class="lw-step" role="group"><button type="button" data-step="' + key + '" data-d="-1" aria-label="פחות"' + (v <= min ? " disabled" : "") + '>−</button>' +
      '<b>' + esc(v) + (unit || "") + '</b><button type="button" data-step="' + key + '" data-d="1" aria-label="יותר"' + (v >= max ? " disabled" : "") + '>+</button></div>';
  }
  function stateOf(t) {
    return CBA.gardenStatsCalc && CBA.gardenStatsCalc.pinState ? CBA.gardenStatsCalc.pinState(t, CBA.gardenLang.weekOf()) : (t.closure ? "done" : "wait");
  }
  function faultRow(t, o) {
    var st = stateOf(t), ct = CBA.gardenLang.catOfTask(t), p = CBA.gardenPins.fromTask(t, { cur: CBA.gardenLang.weekOf() });
    var meta = [CBA.gardenPins.LABEL[st]];
    if (CBA.gardenAssets.FKIND[t.fkind]) meta.unshift(CBA.gardenAssets.FKIND[t.fkind].label);
    if (p.days) meta.push(p.days + " ימים");
    if (p.res) meta.push(p.res + " תושבים מחכים");
    if (o && o.dist !== undefined) meta.push(o.dist < 1 ? "בתוך הסימון" : fmt(o.dist) + " מ' מכאן");
    return '<div class="lw-fi' + (o && o.linked ? " is-linked" : "") + (t.closure ? " is-closed" : "") + '">' +
      '<button type="button" class="lw-fi__main" data-task="' + esc(t.id) + '"' + (o && o.act ? ' data-act="' + o.act + '"' : '') + '>' +
        '<span class="lw-fi__dot" style="background:var(--s-' + st + ', ' + CBA.gardenPins.COL[st] + ')">' + ico(ct.ico, 15) + '</span>' +
        '<span class="lw-fi__tx"><b>' + esc(t.title || "תקלה") + '</b><span>' + esc(meta.join(" · ")) + '</span></span>' +
        (o && o.act === "link" ? '<span class="lw-fi__go">שיוך</span>' : '') +
      '</button>' +
      (o && o.unlink ? '<button type="button" class="lw-fi__x" data-unlink="' + esc(o.unlink) + '" data-task="' + esc(t.id) + '" aria-label="הסרת השיוך">' + ico("x", 14) + '</button>' : '') +
    '</div>';
  }
  function faultPanel(t) {
    var st = stateOf(t), ct = CBA.gardenLang.catOfTask(t), p = CBA.gardenPins.fromTask(t, { cur: CBA.gardenLang.weekOf() });
    var fkI = CBA.gardenAssets.FKIND[t.fkind] ? fkIco(t.fkind, 22) : ct.ico;
    var h = '<div class="lw-p">' + head("var(--s-" + st + ", " + CBA.gardenPins.COL[st] + ")", fkI, t.title || "תקלה",
      "תקלה · " + [CBA.gardenAssets.FKIND[t.fkind] ? CBA.gardenAssets.FKIND[t.fkind].long : t.category, t.area].filter(Boolean).join(" · "), false);
    h += '<div class="lw-pills"><span class="lw-pill" style="background:var(--s-' + st + ', ' + CBA.gardenPins.COL[st] + ')">' + CBA.gardenPins.LABEL[st] + '</span>' +
      (p.days ? '<span class="lw-pill lw-pill--soft">פתוחה ' + p.days + ' ימים</span>' : '') +
      (p.res ? '<span class="lw-pill lw-pill--ink">' + ico("user", 12) + p.res + ' תושבים מחכים</span>' : '') +
      (p.rep ? '<span class="lw-pill" style="background:#C0655C">' + ico("repeat", 12) + 'חוזרת</span>' : '') + '</div>';
    h += kindSec(t);
    if (t.repId && S.edits[String(t.repId)]) h += '<div id="lw-lr"></div>';
    var la = (t.assets || []).map(function (id) { return byId(id) || { id: id, kind: "", name: "סימון שהוסר", archived: true }; });
    h += '<div class="lw-sec"><div class="lw-sec__t">משויכת ל</div><div class="lw-list">' +
      (la.length ? la.map(function (a) {
        var color = a.kind === "lawn" ? "var(--lw-" + a.status + ")" : a.kind === "ctrl" ? "var(--lw-water-2)" : "var(--lw-water)";
        return '<div class="lw-fi is-linked' + (a.archived ? " is-closed" : "") + '"><button type="button" class="lw-fi__main" data-asset="' + esc(a.id) + '"' + (a.archived ? " disabled" : "") + '>' +
          '<span class="lw-fi__dot" style="background:' + color + '">' + ico(a.kind === "lawn" ? "lawn" : a.kind || "spr", 15) + '</span>' +
          '<span class="lw-fi__tx"><b>' + esc(a.archived && !a.name ? "סימון שהוסר" : displayName(a)) + '</b><span>' + esc(a.archived ? "הוסר מהמפה" : (KIND_L[a.kind] || "") + (a.kind === "lawn" ? " · " + STATUS_L[a.status] : "")) + '</span></span></button>' +
          (canRelink(t) ? '<button type="button" class="lw-fi__x" data-unlink="' + esc(a.id) + '" data-task="' + esc(t.id) + '" aria-label="הסרת השיוך">' + ico("x", 14) + '</button>' : '') + '</div>';
      }).join("") : '<p class="lw-muted">לא משויכת לשום ממטרה או מקטע.</p>') + '</div></div>';
    if (!t.closure) {
      var sg = CBA.gardenAssets.suggest(t, items(), 12);
      if (sg) h += '<div class="lw-sugg"><span>הקרוב ביותר: <b>' + esc(displayName(sg.a)) + '</b> · ' + (sg.m < 1 ? "בתוך הסימון" : fmt(sg.m) + " מ'") + '</span>' +
        '<button type="button" class="lw-btn lw-btn--pri" data-act="quick" data-asset-id="' + esc(sg.a.id) + '">שיוך</button></div>';
    }
    h += '<div class="lw-acts">' +
      (canRelink(t) ? '<button type="button" class="lw-btn lw-btn--pri" data-act="pick">' + ico("link") + 'שיוך לממטרה / מקטע</button>' : '') +
      '<button type="button" class="lw-btn" data-act="card">' + ico("card") + 'כרטיס התקלה</button></div>';
    if (!canRelink(t)) h += '<p class="lw-note">התקלה סגורה — רק מנהל הגינון משנה שיוך.</p>';
    return h + '</div>';
  }

  /** סמליל סוג התקלה — אותו סמליל כמו על הנעץ ובכרטיס (gardenPins.FK_ICO). */
  function fkIco(k, size) {
    var P = CBA.gardenPins && CBA.gardenPins.FK_ICO;
    if (!P || !P[k]) return ico(k === "lawn" ? "lawn" : "spr", size);
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[k] + '</svg>';
  }
  /** "סוג התקלה" — 4 צ'יפים, לצוות בלבד (המסך כולו של הצוות). */
  function kindSec(t) {
    if (!isLawnWater(t)) return "";
    var F = CBA.gardenAssets.FKIND, can = canRelink(t);
    return '<div class="lw-sec"><div class="lw-sec__t">סוג התקלה <em class="lw-muted">· לצוות בלבד</em></div>' +
      '<div class="lw-chips lw-fk" role="group" aria-label="סוג התקלה">' +
      CBA.gardenAssets.FKIND_ORDER.map(function (k) {
        return '<button type="button" class="lw-c' + (t.fkind === k ? " is-on" : "") + '" data-fk="' + k + '" aria-pressed="' + (t.fkind === k) + '"' +
          (can ? "" : " disabled") + ' title="' + esc(F[k].long) + '">' + fkIco(k, 14) + esc(F[k].label) + '</button>';
      }).join("") + '</div>' +
      (t.fkind ? '' : '<p class="lw-note">נבחר לבד כשמשייכים לסימון. אפשר גם לבחור עכשיו — זה מצמצם את ההצעה "הקרוב ביותר".</p>') +
    '</div>';
  }
  function onPanelClick(e) {
    var x = selected();
    var fkb = e.target.closest("[data-fk]");
    if (fkb && x && S.sel.type === "task") return setKind(x, fkb.dataset.fk);
    var st = e.target.closest("[data-status]");
    if (st && x && x.kind === "lawn") return setLawnStatus(x, st.dataset.status);
    var un = e.target.closest("[data-unlink]");
    if (un) return unlink(un.dataset.task, un.dataset.unlink);
    var set = e.target.closest("[data-set]");
    if (set && x) { var c = Object.assign({}, x); c[set.dataset.set] = set.dataset.v; delete c._auto; return saveAsset(c); }
    var stp = e.target.closest("[data-step]");
    if (stp && x) {
      var k = stp.dataset.step, v = (+x[k] || (k === "range" ? 5 : 1)) + (+stp.dataset.d);
      var c2 = Object.assign({}, x); c2[k] = Math.max(1, Math.min(k === "range" ? 25 : 24, v)); delete c2._auto;
      return saveAsset(c2);
    }
    var b = e.target.closest("[data-act],[data-task],[data-asset]");
    if (!b) return;
    var act = b.dataset.act;
    if (act === "close") return select(null);
    if (act === "start") { S.root.querySelector('[data-mode="edit"]').click(); return setTool("ctrl"); }
    if (act === "link" && b.dataset.task && x) return linkTaskTo(b.dataset.task, x.id, false);
    if (act === "linkmode" && x) { S.linkFor = S.linkFor === x.id ? null : x.id; return renderPanel(); }
    if (act === "newfault" && x) return openFaultAt(x);
    if (act === "shape" && x) return startShapeEdit(x);
    if (act === "move" && x) { showHint("גררו את הנקודה למקום החדש, ואז \"סיום\". אפשר להזיז את המפה בגרירה מחוץ לנקודה."); S.edit = { id: x.id, kind: x.kind, pts: [[x.x, x.y]], point: true }; drawOverlay(); renderBar(); return; }
    if (act === "archive" && x) return archive(x);
    if (act === "pick" && x) return startPick(x.id);
    if (act === "quick" && x) return linkTaskTo(x.id, b.dataset.assetId, false);
    if (act === "card" && x) {
      if (CBA.gardenOpenCard) return CBA.gardenOpenCard(x.id, function () { loadAll(true); });
      return toast("כרטיס התקלה נפתח ממסך המשימות");
    }
    if (b.dataset.task && !act) return select({ type: "task", id: b.dataset.task });
    if (b.dataset.asset && !act) {
      var a = byId(b.dataset.asset); if (!a || a.archived) return;
      select({ type: "asset", id: a.id });
      var c3 = a.kind === "lawn" ? CBA.gardenGeo.centroid(a) : a.kind === "pipe" ? CBA.gardenGeo.pairs(a.pts)[0] : [a.x, a.y];
      zoomTo(c3[0], c3[1], 1.4);
    }
  }
  function onPanelChange(e) {
    var x = selected(); if (!x) return;
    if (e.target.matches("[data-rename]")) return rename(x, e.target.value);
    if (e.target.matches("[data-note]")) {
      var v = String(e.target.value || "").slice(0, 300);
      if (v === (x.note || "")) return;
      var c = Object.assign({}, x, { note: v }); delete c._auto;
      saveAsset(c);
    }
  }

  /* לבדיקות: פונקציות טהורות בלבד. */
  CBA.screens.gardenLawn._test = { esc: esc, errText: errText, isFault: isFault, hasLoc: hasLoc };
})();
