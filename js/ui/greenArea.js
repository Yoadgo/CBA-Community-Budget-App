/* ============================================================================
 *  greenArea.js — "ירוק כברירת מחדל": איפה יש דשא בשיכון   (7.10.2026, גל ג׳)
 * ----------------------------------------------------------------------------
 *  בקשת יועד (6.10): "כל אזור שאינו חלק דשא בסטטוס יבש/צהוב ייחשב ירוק. וכמובן
 *  כל מה שלא בתים/ישויות אחרות". אפיון + החלטות: project doc
 *  claude/lawn-green-default-2026-10.md · סקיצה: claude.ai/artifact/HTz1UNzHkcMEACPFvHk1dQ
 *
 *  🔑 **הדשא לא נשמר — הוא מחושב.**
 *       שטח ירוק = גבול השיכון − ישויות המפה ± תיקוני שטח של המנהל.
 *     סדר הצביעה (זהה במסכה שעל המפה ובחישוב השטחים — אותם מצולעים בדיוק):
 *       1. גבול השיכון (greenBound.js — איחוד 13 אזורי הגינון + סגירת תפרים)  → ירוק
 *       2. מבני ציבור שיורדים (כל מבנה, חוץ ממה שנחשב ירוק)                     → לא
 *       3. "הוספת ירוק" (gadd)                                                   → ירוק
 *       4. בתים, כבישים, שבילים, כיכר, חניונים, רחבות, מיגוניות — **תמיד**       → לא
 *       5. "לא דשא" (gcut) — גובר על הכל                                         → לא
 *     הכרעות יועד (6.10): חצרות ירוקות עד קיר הבית · מבני ציבור יורדים חוץ
 *     מגינת הכלבים ומדשאת המועדון · מתחם הספורט מחוץ לגבול · "הוספת ירוק"
 *     מותרת גם מחוץ לגבול · בתים/כבישים/חניונים תמיד יורדים.
 *
 *  🔑 **רסטר משלנו, בלי canvas.** מילוי סריקה (scanline) של מצולעים לתוך מערך
 *     בתים — אותו קוד בדפדפן ובבדיקות (jsdom אינו יודע לצייר). פיקסל = 2
 *     יחידות עולם = 1.25 מ'. מספיק לאחוזים ולשאלה "הנעיצה על דשא?".
 *
 *  🔑 **קווים (כבישים/שבילים) הופכים למצולעים**: מרובע לכל קטע + מצולע עגול
 *     בכל נקודה (חיבור/קצה עגול). כך המסכה והחישוב רואים אותו דבר.
 *
 *  ⚠️ יחידות: mapGeo (w×h, ppm=1.6 יחידות למטר). קלט/פלט חיצוני — שבר 0–1,
 *     כמו כל נעיצה ונכס בגינון. הכפלה ב-w/h בכניסה, חלוקה ביציאה.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.greenArea = (function () {
  "use strict";

  var KINDS = { gadd: 1, gcut: 1, gbld: 1 };
  /* מבנים שנחשבים ירוקים כברירת מחדל (הכרעת יועד 6.10). אובייקט מסוג 'green'
     במפה (מדשאת מועדון משפחות) ירוק תמיד כברירת מחדל. */
  var PUB_GREEN = { "גינת כלבים": 1 };
  var ALWAYS = { house: 1, road: 1, path: 1, roundabout: 1, parking: 1, plaza: 1, shelter: 1 };
  var RS = 0.5;          // פיקסלים ליחידת עולם
  var XMAX = 1.12;       // הרסטר מכסה עד 112% מרוחב העולם — אזור "ציר מזרחי" חורג מזרחה

  function geo() {
    var g = (window.CBA && CBA.mapGeo) || null;
    return g && g.objects ? g : null;
  }
  function ready() { return !!(geo() && window.CBA && CBA.gardenAreas && CBA.gardenAreas.areas); }

  /* ---------------- גיאומטריה בסיסית (יחידות עולם) ---------------- */
  function rectPoly(o) {
    var a = (+o.r || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = o.w / 2, hh = o.h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(function (p) {
      return [o.x + p[0] * c - p[1] * s, o.y + p[0] * s + p[1] * c];
    });
  }
  function ngon(cx, cy, rx, ry, n) {
    var out = [];
    for (var i = 0; i < n; i++) { var t = i / n * 2 * Math.PI; out.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
    return out;
  }
  /* אותה עקומה כמו smooth() במנוע המפה (resident.js) — קטמול-רום → בזייה. */
  function smoothPts(p) {
    if (p.length < 3) return p.slice();
    var out = [p[0]];
    for (var i = 0; i < p.length - 1; i++) {
      var p0 = p[i ? i - 1 : 0], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      for (var k = 1; k <= 6; k++) {
        var t = k / 6, u = 1 - t;
        out.push([u * u * u * p1[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p2[0],
                  u * u * u * p1[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p2[1]]);
      }
    }
    return out;
  }
  /** קו ברוחב w → מצולעים (מרובע לכל קטע + עיגול בכל נקודה). */
  function linePolys(p, w, curve) {
    var pts = curve ? smoothPts(p) : p, r = w / 2, out = [];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      if (L < 1e-6) continue;
      var nx = -dy / L * r, ny = dx / L * r;
      out.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
    }
    pts.forEach(function (q) { out.push(ngon(q[0], q[1], r, r, 10)); });
    return out;
  }
  function objPolys(o) {
    if (o.s === "rect") return [rectPoly(o)];
    if (o.s === "poly") return o.p && o.p.length > 2 ? [o.p] : [];
    if (o.s === "circle") return [ngon(o.x, o.y, o.rad, o.rad, 24)];
    if (o.s === "line") return o.p && o.p.length > 1 ? linePolys(o.p, +o.w || 2, !!o.c) : [];
    return [];
  }
  /** כיוון אחיד (כדי שכמה מצולעים במסלול אחד עם nonzero לא יבטלו זה את זה). */
  function orient(poly) {
    var s = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
    return s < 0 ? poly.slice().reverse() : poly;
  }
  function pathOf(polys) {
    return polys.map(function (p) {
      return "M" + p.map(function (q) { return q[0].toFixed(1) + " " + q[1].toFixed(1); }).join("L") + "Z";
    }).join("");
  }

  /* ---------------- הנתונים הקבועים (מחושבים פעם אחת) ---------------- */
  var BASE = null;
  function hashAreas() {
    var s = JSON.stringify(CBA.gardenAreas.areas), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function base() {
    if (BASE) return BASE;
    var g = geo(); if (!ready()) return null;
    /* גבול: הגרסה המחושבת מראש — רק אם נחתמה על אותם אזורים בדיוק. אחרת צובעים
       את האזורים עצמם (בלי סגירת תפרים) — נכון, רק עם סדקים צרים בין אזורים. */
    var gb = window.CBA && CBA.greenBound, bound, boundSrc;
    if (gb && gb.rings && gb.areasHash === hashAreas()) { bound = gb.rings; boundSrc = "closed"; }
    else {
      bound = CBA.gardenAreas.areas.map(function (a) { return (a.p || []).map(function (q) { return [q[0] * g.w, q[1] * g.h]; }); });
      boundSrc = "areas";
    }
    var always = [], pubs = [];
    (g.objects || []).forEach(function (o) {
      if (ALWAYS[o.t]) { objPolys(o).forEach(function (p) { always.push(orient(p)); }); return; }
      if (o.t === "public" || o.t === "green") {
        var name = String(o.l || "").trim(); if (!name) return;
        var polys = objPolys(o); if (!polys.length) return;
        var c = centroidW(polys[0]);
        pubs.push({ name: name, polys: polys, d: pathOf(polys), def: o.t === "green" || !!PUB_GREEN[name],
                    c: [c[0] / g.w, c[1] / g.h], inBound: false });
      }
    });
    BASE = { g: g, bound: bound, boundSrc: boundSrc, boundD: pathOf(bound),
             always: always, alwaysD: pathOf(always), pubs: pubs };
    /* האם המבנה בתוך הגבול (מבנה בחוץ — אין טעם להחליף לו "ירוק"; מוסיפים ירוק סביבו). */
    var R0 = rasterBase();
    pubs.forEach(function (p) {
      var i = (Math.floor(p.c[1] * g.h * RS) * R0.cw + Math.floor(p.c[0] * g.w * RS));
      p.inBound = R0.bound[i] === 1;
    });
    return BASE;
  }
  function centroidW(poly) {
    var x = 0, y = 0; poly.forEach(function (q) { x += q[0]; y += q[1]; });
    return [x / poly.length, y / poly.length];
  }

  /* ---------------- רסטר: מילוי סריקה ---------------- */
  function fillPoly(buf, cw, ch, polys, val, evenodd) {
    /* polys: רשימת טבעות; evenodd=true → כולן יחד (חורים); אחרת כל אחת לבד. */
    var groups = evenodd ? [polys] : polys.map(function (p) { return [p]; });
    groups.forEach(function (rings) {
      var y0 = Infinity, y1 = -Infinity, edges = [];
      rings.forEach(function (p) {
        for (var i = 0, j = p.length - 1; i < p.length; j = i++) {
          var ax = p[j][0] * RS, ay = p[j][1] * RS, bx = p[i][0] * RS, by = p[i][1] * RS;
          if (ay === by) continue;
          edges.push(ay < by ? [ax, ay, bx, by] : [bx, by, ax, ay]);
          y0 = Math.min(y0, ay, by); y1 = Math.max(y1, ay, by);
        }
      });
      var r0 = Math.max(0, Math.floor(y0)), r1 = Math.min(ch - 1, Math.ceil(y1));
      for (var r = r0; r <= r1; r++) {
        var yc = r + 0.5, xs = [];
        for (var e = 0; e < edges.length; e++) {
          var E = edges[e];
          if (yc >= E[1] && yc < E[3]) xs.push(E[0] + (yc - E[1]) * (E[2] - E[0]) / (E[3] - E[1]));
        }
        if (xs.length < 2) continue;
        xs.sort(function (a, b) { return a - b; });
        for (var k = 0; k + 1 < xs.length; k += 2) {
          var c0 = Math.max(0, Math.ceil(xs[k] - 0.5)), c1 = Math.min(cw - 1, Math.floor(xs[k + 1] - 0.5));
          for (var c = c0; c <= c1; c++) buf[r * cw + c] = val;
        }
      }
    });
  }
  var RB = null;
  function rasterBase() {
    if (RB) return RB;
    var g = BASE.g, cw = Math.ceil(g.w * XMAX * RS), ch = Math.ceil(g.h * RS);
    var b = new Uint8Array(cw * ch);
    fillPoly(b, cw, ch, BASE.bound, 1, true);
    var a = new Uint8Array(cw * ch);
    fillPoly(a, cw, ch, BASE.always, 1, false);
    RB = { cw: cw, ch: ch, bound: b, always: a };
    return RB;
  }

  /* ---------------- תיקוני השטח (gardenLawns עם kind) ---------------- */
  function pairs(flat) {
    var out = []; flat = flat || [];
    for (var i = 0; i + 1 < flat.length; i += 2) out.push([+flat[i], +flat[i + 1]]);
    return out;
  }
  /** rows = מסמכי gardenLawns (כל הסוגים). מחזיר רק תיקונים פעילים. */
  function corrFrom(rows) {
    var c = { adds: [], cuts: [], bld: {} };
    (rows || []).forEach(function (r) {
      if (!r || r.archived || !KINDS[r.kind]) return;
      if (r.kind === "gbld") { if (typeof r.green === "boolean") c.bld[String(r.name || "").trim()] = r.green; return; }
      var p = pairs(r.pts); if (p.length < 3) return;
      (r.kind === "gadd" ? c.adds : c.cuts).push(p);
    });
    return c;
  }
  function pubGreen(p, corr) {
    return (corr && Object.prototype.hasOwnProperty.call(corr.bld, p.name)) ? !!corr.bld[p.name] : p.def;
  }
  function toW(polysN) {
    var g = BASE.g;
    return polysN.map(function (p) { return p.map(function (q) { return [q[0] * g.w, q[1] * g.h]; }); });
  }

  /* ---------------- המודל ---------------- */
  /* מטמון של שני מודלים: המסך (עם התיקונים) + תמונה ממוזערת (בלי) לא דוחקים זה את זה. */
  var CACHE = [];
  /**
   * model(corr) — corr מ-corrFrom (או null = בלי תיקונים).
   * מחזיר { maskSvg(id, W, H), inGreen(nx, ny), stats(patches), greenM2, key }
   */
  function model(corr) {
    if (!base()) return null;
    corr = corr || { adds: [], cuts: [], bld: {} };
    var key = JSON.stringify(corr);
    for (var ci = 0; ci < CACHE.length; ci++) if (CACHE[ci].key === key) return CACHE[ci].m;
    var R0 = rasterBase(), cw = R0.cw, ch = R0.ch, n = cw * ch;
    var buf = new Uint8Array(n), i;
    for (i = 0; i < n; i++) buf[i] = R0.bound[i];
    var drop = BASE.pubs.filter(function (p) { return !pubGreen(p, corr); });
    drop.forEach(function (p) { fillPoly(buf, cw, ch, p.polys, 0, false); });
    var adds = toW(corr.adds), cuts = toW(corr.cuts);
    adds.forEach(function (p) { fillPoly(buf, cw, ch, [p], 1, false); });
    for (i = 0; i < n; i++) if (R0.always[i]) buf[i] = 0;
    cuts.forEach(function (p) { fillPoly(buf, cw, ch, [p], 0, false); });
    var cnt = 0; for (i = 0; i < n; i++) cnt += buf[i];
    var pxM2 = 1 / (RS * RS) / (BASE.g.ppm * BASE.g.ppm);
    var m = {
      key: key, greenM2: cnt * pxM2,
      /** המסכה למפה: id ייחודי; W,H = גודל העולם שעליו מציירים (יחידות CSS). */
      maskSvg: function (id, W, H) {
        var g = BASE.g, sx = (W || g.w) / g.w, sy = (H || g.h) / g.h;
        return '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="' + (-0.1 * g.w * sx).toFixed(0) + '" y="' + (-0.1 * g.h * sy).toFixed(0) +
          '" width="' + (1.3 * g.w * sx).toFixed(0) + '" height="' + (1.2 * g.h * sy).toFixed(0) + '">' +
          '<g transform="scale(' + sx.toFixed(6) + ' ' + sy.toFixed(6) + ')">' +
          '<path d="' + BASE.boundD + '" fill="#fff" fill-rule="evenodd"/>' +
          (drop.length ? '<path d="' + drop.map(function (p) { return p.d; }).join("") + '" fill="#000"/>' : '') +
          (adds.length ? '<path d="' + pathOf(adds.map(orient)) + '" fill="#fff"/>' : '') +
          '<path d="' + BASE.alwaysD + '" fill="#000" fill-rule="nonzero"/>' +
          (cuts.length ? '<path d="' + pathOf(cuts.map(orient)) + '" fill="#000"/>' : '') +
          '</g></mask>';
      },
      inGreen: function (nx, ny) {
        var g = BASE.g, c = Math.floor(nx * g.w * RS), r = Math.floor(ny * g.h * RS);
        return c >= 0 && r >= 0 && c < cw && r < ch && buf[r * cw + c] === 1;
      },
      /** patches: צורות 0–1 (poly/circle/ellipse) עם status. כתם 'ok' (תוקן) לא נספר. */
      stats: function (patches) {
        var pb = new Uint8Array(n), g = BASE.g;
        (patches || []).forEach(function (p) {
          if (!p || p.archived || (p.status !== "dry" && p.status !== "dead")) return;
          var poly = shapePolyW(p); if (!poly) return;
          var v = p.status === "dead" ? 2 : 1;
          /* מת גובר על יבש בחפיפה */
          if (v === 1) fillPolyMax(pb, cw, ch, poly, 1); else fillPoly(pb, cw, ch, [poly], 2, false);
        });
        var dry = 0, dead = 0;
        for (var k = 0; k < n; k++) if (buf[k]) { if (pb[k] === 2) dead++; else if (pb[k] === 1) dry++; }
        var green = cnt * pxM2;
        return { green: green, dry: dry * pxM2, dead: dead * pxM2, ok: Math.max(0, green - (dry + dead) * pxM2) };
      }
    };
    CACHE.unshift({ key: key, m: m }); CACHE.length = Math.min(CACHE.length, 2);
    return m;
  }
  /** מילוי "לא פחות מ" — יבש לא דורס מת שכבר צויר. */
  function fillPolyMax(buf, cw, ch, poly, val) {
    var tmp = new Uint8Array(buf.length);
    fillPoly(tmp, cw, ch, [poly], 1, false);
    for (var i = 0; i < buf.length; i++) if (tmp[i] && buf[i] < val) buf[i] = val;
  }
  /** צורת גינון (0–1, כמו gardenGeo) → מצולע ביחידות עולם. */
  function shapePolyW(s) {
    var g = (BASE && BASE.g) || geo(); if (!s || !g) return null;
    if (s.shape === "circle") return ngon(s.cx * g.w, s.cy * g.h, s.r * g.w, s.r * g.w, 28);
    if (s.shape === "ellipse") return ngon(s.cx * g.w, s.cy * g.h, s.rx * g.w, s.ry * g.h, 28);
    var p = pairs(s.pts); if (p.length < 3) return null;
    return p.map(function (q) { return [q[0] * g.w, q[1] * g.h]; });
  }

  /* ---------------- לתצוגה ---------------- */
  /** מבני הציבור — לבחירה במסך (מסלול ביחידות עולם + מרכז 0–1 + ברירת מחדל). */
  function pubs(corr) {
    if (!base()) return [];
    return BASE.pubs.map(function (p) {
      return { name: p.name, d: p.d, c: p.c, def: p.def, inBound: p.inBound, green: pubGreen(p, corr) };
    });
  }
  function boundD() { return base() ? BASE.boundD : ""; }
  function boundSrc() { return base() ? BASE.boundSrc : ""; }
  function areasD() {
    var g = geo(); if (!ready()) return [];
    return CBA.gardenAreas.areas.map(function (a) {
      return { name: a.n, d: pathOf([(a.p || []).map(function (q) { return [q[0] * g.w, q[1] * g.h]; })]) };
    });
  }
  /** תמונה ממוזערת: דשא + בתים/כבישים סביב עיגול (כתם שתושב הציע). */
  var thumbSeq = 0;
  function thumbSvg(cx, cy, r, corr) {
    var m = model(corr); if (!m) return "";
    var g = BASE.g, X = cx * g.w, Y = cy * g.h, R = r * g.w, half = Math.max(R * 4, 70);
    var id = "gat" + (++thumbSeq);
    return '<svg class="ga-thumb" viewBox="' + [X - half * 1.5, Y - half, half * 3, half * 2].map(function (v) { return v.toFixed(1); }).join(" ") +
      '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="האזור שסומן, על מפת הדשא">' +
      '<defs>' + m.maskSvg(id, g.w, g.h) + '</defs>' +
      '<rect x="' + (X - half * 2) + '" y="' + (Y - half * 2) + '" width="' + half * 4 + '" height="' + half * 4 + '" class="ga-ground"/>' +
      '<rect x="' + (X - half * 2) + '" y="' + (Y - half * 2) + '" width="' + half * 4 + '" height="' + half * 4 + '" class="ga-green" mask="url(#' + id + ')"/>' +
      '<path class="ga-built" d="' + BASE.alwaysD + '"/>' +
      '<path class="ga-pub" d="' + BASE.pubs.map(function (p) { return p.d; }).join("") + '"/>' +
      '<circle class="ga-spot" cx="' + X.toFixed(1) + '" cy="' + Y.toFixed(1) + '" r="' + R.toFixed(1) + '"/></svg>';
  }

  /** לבדיקות בלבד. */
  function _reset() { BASE = null; RB = null; CACHE = []; }

  return { KINDS: KINDS, PUB_GREEN: PUB_GREEN, ready: ready, model: model, corrFrom: corrFrom,
           pubs: pubs, boundD: boundD, boundSrc: boundSrc, areasD: areasD, thumbSvg: thumbSvg,
           shapePolyW: shapePolyW, _reset: _reset };
})();
