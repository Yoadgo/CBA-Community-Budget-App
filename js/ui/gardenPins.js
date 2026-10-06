/* ============================================================================
 *  gardenPins.js — נעץ תקלה אחד לכל מפות הגינון   (2026-10-04, סגנון ב')
 * ----------------------------------------------------------------------------
 *  הכרעת יועד (3.10): סגנון ב'. עד היום הנעץ נבנה בתוך gardenStats.js
 *  (mountPins/pinSvg); הוא עובר לכאן כדי שאותו נעץ בדיוק יופיע גם במסך
 *  "דשא והשקיה" — עותק שני היה סוטה, כמו שכל עותק שני בגינון סטה.
 *
 *  מה לומדים מנעץ, בלי לפתוח כרטיס:
 *    צבע הגוף        = מצב (להחלטה/משובצת/לאישורך/נגררה/נגררה 2+/נסגרה)
 *    סמליל לבן       = סוג העבודה
 *    עיגול שחור+מספר = כמה תושבים מחכים לתשובה (דיווח + דיווחים שאוחדו)
 *    חץ מעגלי אדום   = תקלה חוזרת (משוב שלילי / נפתחה שוב / "לא הושלם")
 *    טיפה כחולה      = משויכת לממטרה/מדשאה ("דשא והשקיה")
 *    חלול וקטן       = נסגרה — לא מתחרה בפתוחות
 *    אשכול           = טבעת מחולקת לפי מצבים + מספר הפתוחות
 *  רמות זום (לפי רוחב בית על המסך, כמו תוויות המפה): רחוק = אותו נעץ, קטן
 *  ב-18% ועם אשכולות רחבים יותר · בינוני = נעץ מלא · קרוב = נעץ + שם התקלה
 *  + כמה ימים פתוחה. ⚠️ לא נקודות: מסך הנתונים חי ברוב הזמן בזום רחוק,
 *  ושם בדיוק צריך לראות מי מחכה ומה חוזר (נבדק חי 4.10).
 *
 *  🔑 שכבה מעל CBA.map (markers/onMarker) — בלי לגעת ב-resident.js.
 *  ⚠️ גודל קבוע על המסך (`--gpin-inv` על המכל). קנה המידה נקרא מה-transform
 *     שהמפה כותבת על העולם (`--inv` נכתב רק כשיש שבבי מבני ציבור).
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.gardenPins = (function () {
  "use strict";

  var TEAR = "M12 .8C5.8.8.8 5.7.8 11.8.8 19.6 12 29.2 12 29.2s11.2-9.6 11.2-17.4C23.2 5.7 18.2.8 12 .8Z";
  /* הצבעים של מסך הנתונים (--s-*), עם ברירת מחדל — הנעץ חי גם מחוץ ל-.gx-vars. */
  var COL = { wait: "#D6A05A", plan: "#6E93CF", appr: "#9585C7", l1: "#D48AAB", l2: "#C0655C", done: "#AAB3AE" };
  var SEV = { l2: 5, l1: 4, appr: 3, wait: 2, plan: 1, done: 0 };
  var LABEL = { wait: "להחלטה", plan: "משובצת", appr: "לאישורך", l1: "נגררה", l2: "נגררה 2+", done: "נסגרה" };
  var REPEAT = '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>';
  var LINK = '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>';
  /* 4.10 — סמליל לפי סוג התקלה שהצוות בחר (fkind): קו מים שהתפוצץ, ממטרה,
     מחשב. "דשא" נשאר סמליל הדשא הרגיל. */
  var FK_ICO = {
    line: '<path d="M2 9h6.5l1.5 3-1.5 3H2"/><path d="M22 9h-6.5L14 12l1.5 3H22"/><path d="M12 3v3M8.8 4.4l1.2 2M15.2 4.4l-1.2 2"/>',
    spr:  '<circle cx="12" cy="15" r="3"/><path d="M12 12V7"/><path d="M5 9a9 9 0 0 1 3-4M19 9a9 9 0 0 0-3-4M3 13a10 10 0 0 1 1-5M21 13a10 10 0 0 0-1-5"/>',
    ctrl: '<rect x="4" y="3" width="16" height="18" rx="2"/><rect x="7" y="6" width="10" height="5" rx="1"/><path d="M8 15h.01M12 15h.01M16 15h.01M8 18h8"/>'
  };
  var HOUSE_W = 34;   // רוחב בית חציוני ביחידות עולם (mapGeo) — ר' MED_TILE ב-resident.js

  function col(s) { return "var(--s-" + s + ", " + (COL[s] || COL.wait) + ")"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function icon(name) {
    var K = window.CBA && CBA.gardenKit;
    return (K && K.ICONS && K.ICONS[name]) || "";
  }

  /** רמת פירוט לפי קנה המידה (פיקסלי מסך ליחידת עולם). */
  function lod(scale) {
    var px = HOUSE_W * (scale || 1);
    return px < 26 ? "far" : px < 62 ? "mid" : "near";
  }

  /** ה-SVG של נעץ בודד. p: {state, ico, res, rep, linked, closed}. */
  function pinSvg(p) {
    var done = p.state === "done";
    var c = col(p.state);
    var body = done
      ? '<path d="' + TEAR + '" fill="#fff" stroke="' + c + '" stroke-width="1.9"/>'
      : '<path d="' + TEAR + '" fill="' + c + '" stroke="#fff" stroke-width="2.1"/>';
    var gl = '<g transform="translate(5 4.6) scale(.5833)" fill="none" stroke="' + (done ? c : "#fff") +
      '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">' + (FK_ICO[p.fkind] || icon(p.ico)) + '</g>';
    var b = "";
    if (!done) {
      if (p.res > 0) b += '<g class="gpin__res" transform="translate(1.4 1.6)"><circle r="5.8" fill="#111827" stroke="#fff" stroke-width="1.4"/>' +
        '<text y=".3" text-anchor="middle" dominant-baseline="central" font-size="7.6" font-weight="800" fill="#fff">' +
        (p.res > 9 ? "9+" : p.res) + '</text></g>';
      if (p.rep) b += '<g class="gpin__rep" transform="translate(22.6 1.6)"><circle r="5.8" fill="#fff" stroke="' + col("l2") + '" stroke-width="1.6"/>' +
        '<g transform="translate(-3.6 -3.6) scale(.3)" fill="none" stroke="' + col("l2") + '" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">' + REPEAT + '</g></g>';
    }
    if (p.linked) b += '<g class="gpin__lnk" transform="translate(22.6 20.4)"><circle r="5.2" fill="#3E8DBA" stroke="#fff" stroke-width="1.4"/>' +
      '<g transform="translate(-3.3 -3.5) scale(.28)" fill="#fff">' + LINK + '</g></g>';
    return '<svg viewBox="0 0 24 30" aria-hidden="true">' +
      '<ellipse cx="12" cy="29.2" rx="4.2" ry="1.5" fill="rgba(16,24,20,.3)"/>' + body + gl + b + '</svg>';
  }

  /** נקודת צבע (זום רחוק). תושב שמחכה = נקודה שחורה קטנה. */
  function dotSvg(p) {
    var done = p.state === "done";
    return '<svg viewBox="-8 -8 16 16" aria-hidden="true">' +
      (done ? '<circle r="3.8" fill="#fff" stroke="' + col("done") + '" stroke-width="1.8"/>'
            : '<circle r="5.6" fill="' + col(p.state) + '" stroke="#fff" stroke-width="1.8"/>' +
              (p.res > 0 ? '<circle cx="4.6" cy="-4.6" r="2.5" fill="#111827" stroke="#fff" stroke-width="1"/>' : '')) +
      '</svg>';
  }

  /** אשכול: טבעת מחולקת לפי מצבים, ובמרכז מספר הפתוחות. */
  function clusterSvg(pins) {
    var n = pins.length, r = 13.5, C = 2 * Math.PI * r, cnt = {}, off = 0, segs = "";
    pins.forEach(function (p) { cnt[p.state] = (cnt[p.state] || 0) + 1; });
    Object.keys(SEV).forEach(function (s) {
      if (!cnt[s]) return;
      var len = C * cnt[s] / n, gap = n > 1 ? 1.2 : 0;
      segs += '<circle r="' + r + '" fill="none" stroke="' + col(s) + '" stroke-width="5.5" stroke-dasharray="' +
        Math.max(0.5, len - gap).toFixed(2) + ' ' + (C - len + gap).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) +
        '" transform="rotate(-90)"/>';
      off += len;
    });
    var open = pins.filter(function (p) { return p.state !== "done"; }).length;
    var waits = pins.some(function (p) { return p.res > 0 && p.state !== "done"; });
    return '<svg viewBox="-19 -19 38 38" aria-hidden="true"><circle r="17.5" fill="#fff"/>' + segs +
      '<text y=".5" text-anchor="middle" dominant-baseline="central" font-size="12.5" font-weight="800" fill="#111827">' +
      (open || n) + '</text>' +
      (waits ? '<circle cx="12.6" cy="-12.6" r="4.6" fill="#111827" stroke="#fff" stroke-width="1.4"/>' : '') + '</svg>';
  }

  function capHtml(p) {
    var meta = p.state === "done" ? "נסגרה" : LABEL[p.state] + (p.days > 0 ? " · " + p.days + " ימים" : "");
    return '<span class="gpin__cap"><b>' + esc(p.title || "") + '</b><i>' + esc(meta) + '</i></span>';
  }

  /** כותרת נגישה — מה שקורא מסך אומר על הנעץ. */
  function aria(p) {
    var fk = p.fkind && CBA.gardenAssets && CBA.gardenAssets.FKIND && CBA.gardenAssets.FKIND[p.fkind];
    return [p.title, fk ? fk.long : "", LABEL[p.state], p.res ? p.res + " תושבים מחכים" : "", p.rep ? "תקלה חוזרת" : "",
            p.linked ? "משויכת לממטרה או מדשאה" : ""].filter(Boolean).join(" · ");
  }

  /* ==========================================================================
   *  mount — מפה + נעצים. o: { onPin(p, el), onCluster(pins), onHover(p, el, on),
   *            mapOpts: {...} (נוסף ל-CBA.map.render), captions: bool (ברירת מחדל true),
   *            onZoom(scale, level) }
   *  מחזיר: { set(pins, keepView), api, world, scale(), level(), host }
   * ======================================================================== */
  function mount(host, o) {
    o = o || {};
    var list = [], groups = [], lastScale = 0, lastLevel = "", raf = 0, selId = null;
    var opts = { head: false, search: false, legend: false, hint: false, popup: false,
      binKinds: ["garden"],                                   // GP-6.10:M1 — רק מתחמי גזם
      onMarker: function (id, m) {
        if (m.cluster) { if (o.onCluster) o.onCluster(m.pins); return; }
        if (o.onPin) o.onPin(m.pin, elOf(m));
      } };
    if (o.mapOpts) Object.keys(o.mapOpts).forEach(function (k) { opts[k] = o.mapOpts[k]; });
    var api = CBA.map.render(host, opts);
    var world = host.querySelector(".map-world") || host.querySelector("#map-world");

    function scale() {
      var m = world && /scale\(([\d.eE+-]+)\)/.exec(world.style.transform || "");
      if (m && +m[1] > 0) return +m[1];
      var inv = parseFloat(world && world.style.getPropertyValue("--inv"));
      return inv > 0 ? 1 / inv : 1;
    }
    function worldWH() {
      return { w: parseFloat(world && world.style.width) || 1000, h: parseFloat(world && world.style.height) || 1000 };
    }
    function elOf(m) {
      var els = world ? world.querySelectorAll(".map-marker") : [];
      return els[groups.indexOf(m)] || null;
    }
    function build() {
      var s = scale(), WH = worldWH(), level = lod(s);
      lastScale = s; lastLevel = level;
      host.style.setProperty("--gpin-inv", (1 / s).toFixed(4));
      host.dataset.lod = level;
      var R = (level === "far" ? 15 : 24) / s;   // פיקסלי מסך
      var sorted = list.slice().sort(function (a, b) { return SEV[b.state] - SEV[a.state]; });
      var gs = [];
      sorted.forEach(function (p) {
        var px = p.x * WH.w, py = p.y * WH.h, hit = null;
        for (var i = 0; i < gs.length; i++) {
          if (Math.abs(gs[i].px - px) < R && Math.abs(gs[i].py - py) < R) { hit = gs[i]; break; }
        }
        if (hit) hit.pins.push(p); else gs.push({ px: px, py: py, pins: [p] });
      });
      groups = gs.map(function (g) {
        var top = g.pins[0];
        if (g.pins.length === 1) {
          var cls = "gpin" + (level === "far" ? " gpin--far" : "") + (top.state === "done" ? " is-done" : "") +
                    (top.id === selId ? " is-sel" : "");
          return { id: top.id, x: top.x, y: top.y, pin: top, cls: cls, title: aria(top) };
        }
        var sx = 0, sy = 0;
        g.pins.forEach(function (p) { sx += p.x; sy += p.y; });
        return { id: "c" + top.id, x: sx / g.pins.length, y: sy / g.pins.length, cluster: true,
                 pins: g.pins, state: top.state, cls: "gpin gpin--c",
                 title: g.pins.length + " תקלות קרובות — הקשה מגדילה" };
      });
      api.setMarkers(groups);
      var els = world.querySelectorAll(".map-marker");
      groups.forEach(function (g, i) {
        var el = els[i];
        if (!el) return;
        if (g.cluster) { el.innerHTML = clusterSvg(g.pins); return; }
        el.innerHTML = pinSvg(g.pin) +
          (level === "near" && o.captions !== false && g.pin.title ? capHtml(g.pin) : "");
        if (o.onHover) {
          el.addEventListener("mouseenter", function () { o.onHover(g.pin, el, true); });
          el.addEventListener("mouseleave", function () { o.onHover(g.pin, el, false); });
        }
      });
    }
    if (world && window.MutationObserver) {
      new MutationObserver(function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var s = scale();
          host.style.setProperty("--gpin-inv", (1 / s).toFixed(4));
          var lv = lod(s);
          if (lv !== lastLevel || (lastScale && Math.abs(s - lastScale) / lastScale > 0.12)) build();
          if (o.onZoom) o.onZoom(s, lv);
        });
      }).observe(world, { attributes: true, attributeFilter: ["style"] });
    }
    var fitKey = "", fitted = false;
    function fit() {
      if (!api.fitBox || !list.length) return;
      fitted = true;
      var x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      list.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      /* 23.9 — לא צמוד מדי: מרווח 10%, והתיבה לעולם לא קטנה מ-55% מהשכונה. */
      var MIN = 0.55, PAD = 0.10;
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      var w = Math.max(MIN, (x1 - x0) + 2 * PAD), h = Math.max(MIN, (y1 - y0) + 2 * PAD);
      var bx0 = Math.max(0, Math.min(1 - w, cx - w / 2)), by0 = Math.max(0, Math.min(1 - h, cy - h / 2));
      api.fitBox(bx0, by0, Math.min(1, bx0 + w), Math.min(1, by0 + h), 24);
    }
    return {
      /* keepView: רענון נתונים — לא מתאימים את התצוגה מחדש (אלא אם עוד לא הותאמה). */
      set: function (pins, keepView, noFit) {
        list = (pins || []).filter(function (p) { return p && isFinite(p.x) && isFinite(p.y); });
        var k = list.map(function (p) { return p.id; }).sort().join(",");
        if (k !== fitKey) { fitKey = k; if (!noFit && (!keepView || !fitted)) fit(); }
        build();
      },
      select: function (id) { selId = id || null; build(); },
      refresh: build,
      api: api, world: world, host: host,
      scale: scale, level: function () { return lod(scale()); }
    };
  }

  /** ממיר משימה לנעץ. `cur` = השבוע הנוכחי (ל"נגררה"); `rep` מהיומן אם יש. */
  function fromTask(t, opts) {
    opts = opts || {};
    var calc = CBA.gardenStatsCalc, L = CBA.gardenLang;
    var ct = L && L.catOfTask ? L.catOfTask(t) : { key: "lawn", ico: "lawn" };
    var open = !t.closure || t.flag === "דורש בדיקה חוזרת";
    var state = calc && calc.pinState ? calc.pinState(t, opts.cur) : (t.closure ? "done" : "wait");
    var opened = calc && calc.ms ? calc.ms(t.createdAt) : NaN;
    var hasRep = String(t.repId || "").trim() !== "";
    return {
      id: String(t.id), x: +t.x, y: +t.y, state: state, cat: ct.key, ico: ct.ico,
      title: t.title || t.category || "תקלה", category: t.category || "", closed: !open,
      res: open && hasRep ? 1 + ((t.mergedReps || []).length) : 0,
      rep: t.flag === "דורש בדיקה חוזרת" || !!(opts.repIds && opts.repIds[String(t.id)]),
      linked: !!(t.assets && t.assets.length), fkind: String(t.fkind || ""),
      days: open && !isNaN(opened) ? Math.max(0, Math.floor((Date.now() - opened) / 86400000)) : 0
    };
  }

  return { mount: mount, pinSvg: pinSvg, dotSvg: dotSvg, clusterSvg: clusterSvg, lod: lod,
           fromTask: fromTask, aria: aria, LABEL: LABEL, SEV: SEV, COL: COL, FK_ICO: FK_ICO };
})();
