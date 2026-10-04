/* ============================================================================
 *  gardenAssets.js — דשא והשקיה: נתונים וגיאומטריה   (2026-10-04)
 * ----------------------------------------------------------------------------
 *  אפיון: project doc claude/lawn-irrigation-2026-10.md · כללים: firestore.rules
 *  (gardenLawns / gardenAssets / gardenLawnEdits, ו-`assets` על gardenTasks).
 *
 *  🔑 **Firestore הוא המסד היחיד של התחום** (מודל ב' ב-docs/ARCHITECTURE.md).
 *     אין גיליון שהוא המקור ואין מסלול Apps Script ישן — ולכן אין "נפילה
 *     לאחור". כשל קריאה מוחזר כשגיאה, והמסך מציג את המפה בלי השכבה +
 *     "לנסות שוב". ⚠️ אל תוסיף כאן נפילה שקטה לרשימה ריקה: מפה ריקה
 *     נראית בדיוק כמו "עוד לא סומן כלום", והגנן יתחיל לסמן מחדש.
 *
 *  🔑 **קואורדינטות 0–1 של עולם המפה** — אותן יחידות בדיוק כמו נעיצת תקלה
 *     (getPin ב-resident.js). נשמרות כרשימה שטוחה [x0,y0,x1,y1,…] כי
 *     Firestore אינו שומר רשימה בתוך רשימה. `flat`/`pairs` ממירים.
 *
 *  🔑 **שיוך תקלה↔נכס נשמר רק על המשימה** (`assets`). הצד של הממטרה נגזר
 *     ב-`faultsOf`. מקום אחד — אין מה לסנכרן ואין מה לשכוח.
 *
 *  🔴 **כתם (מקטע בתוך מדשאה) נשמר ב-gardenAssets ולא ב-gardenLawns** (צוות אדום
 *     4.10): כתם קיים רק איפה שהמצב שונה מהמדשאה סביבו, ולכן הגבול שלו *הוא*
 *     מידע על מצב — ואת gardenLawns כל תושב קורא. למסך הוא נראה כמו כל מקטע
 *     (kind 'lawn', patch: true); ההבדל רק כאן, בשמירה ובקריאה.
 *
 *  מטרים: עולם המפה הוא CBA.mapGeo.w × h יחידות, ו-ppm יחידות הן מטר אחד
 *  (1.6, נמדד מול Google Earth — ר' cba-map-v2-module). שבר 0–1 אינו אחיד
 *  (הרוחב ≠ הגובה), ולכן כל מדידה עוברת קודם ליחידות עולם.
 * ========================================================================== */
window.CBA = window.CBA || {};

CBA.gardenGeo = (function () {
  "use strict";

  function world() {
    var g = (window.CBA && CBA.mapGeo) || {};
    return { w: +g.w || 1061.2, h: +g.h || 1297.2, ppm: +g.ppm || 1.6 };
  }
  /** [x0,y0,x1,y1,…] → [[x,y],…] */
  function pairs(flat) {
    var out = [];
    flat = flat || [];
    for (var i = 0; i + 1 < flat.length; i += 2) out.push([+flat[i], +flat[i + 1]]);
    return out;
  }
  /** [[x,y],…] → [x0,y0,…], מעוגל ל-5 ספרות (סנטימטרים — מספיק, וחוסך בתים). */
  function flat(pts) {
    var out = [];
    (pts || []).forEach(function (p) {
      out.push(Math.round(clamp01(p[0]) * 1e5) / 1e5, Math.round(clamp01(p[1]) * 1e5) / 1e5);
    });
    return out;
  }
  function clamp01(v) { v = +v; return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

  /** מצולע של צורה כלשהי (עיגול/אליפסה → n נקודות), בשבר 0–1. */
  function polyOf(s, n) {
    if (!s) return [];
    if (s.shape === "poly") return pairs(s.pts);
    var W = world(), k = n || 14, out = [];
    for (var i = 0; i < k; i++) {
      var t = i / k * 2 * Math.PI;
      if (s.shape === "circle") {
        /* רדיוס נשמר ביחידות רוחב (r × W) — כך העיגול עגול גם כשהעולם לא ריבועי. */
        out.push([s.cx + s.r * Math.cos(t), s.cy + s.r * W.w / W.h * Math.sin(t)]);
      } else {
        out.push([s.cx + s.rx * Math.cos(t), s.cy + s.ry * Math.sin(t)]);
      }
    }
    return out;
  }
  function polyAreaW(pts) {   // יחידות עולם²
    var W = world(), s = 0;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      s += (pts[j][0] * W.w + pts[i][0] * W.w) * (pts[j][1] * W.h - pts[i][1] * W.h);
    }
    return Math.abs(s / 2);
  }
  /** שטח במ"ר. */
  function areaM2(s) {
    var W = world();
    var u;
    if (!s) return 0;
    if (s.shape === "circle") u = Math.PI * Math.pow(s.r * W.w, 2);
    else if (s.shape === "ellipse") u = Math.PI * (s.rx * W.w) * (s.ry * W.h);
    else u = polyAreaW(pairs(s.pts));
    return u / (W.ppm * W.ppm);
  }
  /** אורך קו במטרים. */
  function lengthM(pts) {
    var W = world(), s = 0;
    for (var i = 1; i < pts.length; i++) {
      s += Math.hypot((pts[i][0] - pts[i - 1][0]) * W.w, (pts[i][1] - pts[i - 1][1]) * W.h);
    }
    return s / W.ppm;
  }
  /** מרחק במטרים בין שתי נקודות 0–1. */
  function distM(a, b) {
    var W = world();
    return Math.hypot((a[0] - b[0]) * W.w, (a[1] - b[1]) * W.h) / W.ppm;
  }
  function inPoly(x, y, pts) {
    var ins = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-9) + xi)) ins = !ins;
    }
    return ins;
  }
  function inShape(s, x, y) {
    if (!s) return false;
    if (s.shape === "poly") return inPoly(x, y, pairs(s.pts));
    var W = world();
    if (s.shape === "circle") return distM([x, y], [s.cx, s.cy]) * W.ppm <= s.r * W.w;
    return Math.pow((x - s.cx) / s.rx, 2) + Math.pow((y - s.cy) / s.ry, 2) <= 1;
  }
  function centroid(s) {
    if (!s) return [0, 0];
    if (s.shape !== "poly") return [s.cx, s.cy];
    var p = pairs(s.pts), x = 0, y = 0;
    p.forEach(function (q) { x += q[0]; y += q[1]; });
    return p.length ? [x / p.length, y / p.length] : [0, 0];
  }
  /** הנקודה הקרובה על קו, והמרחק אליה במטרים. */
  function nearestOnLine(p, pts) {
    var W = world(), best = pts[0] || p, bd = Infinity;
    for (var i = 1; i < pts.length; i++) {
      var ax = pts[i - 1][0] * W.w, ay = pts[i - 1][1] * W.h, bx = pts[i][0] * W.w, by = pts[i][1] * W.h;
      var px = p[0] * W.w, py = p[1] * W.h, dx = bx - ax, dy = by - ay;
      var t = ((px - ax) * dx + (py - ay) * dy) / ((dx * dx + dy * dy) || 1);
      t = Math.max(0, Math.min(1, t));
      var qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(qx - px, qy - py);
      if (d < bd) { bd = d; best = [qx / W.w, qy / W.h]; }
    }
    return { q: best, m: bd === Infinity ? Infinity : bd / W.ppm };
  }
  /** מרחק (מטרים) מנקודה לנכס — 0 בתוך מדשאה. */
  function distToAsset(p, a) {
    if (!a) return Infinity;
    if (a.kind === "spr" || a.kind === "ctrl") return distM(p, [a.x, a.y]);
    if (a.kind === "pipe") return nearestOnLine(p, pairs(a.pts)).m;
    if (a.kind === "lawn" || a.shape) {
      if (inShape(a, p[0], p[1])) return 0;
      return distM(p, centroid(a));
    }
    return Infinity;
  }
  /** נקודת העיגון של קו שיוך (מתקלה לנכס). */
  function anchorOf(a, from) {
    if (!a) return null;
    if (a.kind === "spr" || a.kind === "ctrl") return [a.x, a.y];
    if (a.kind === "pipe") return nearestOnLine(from, pairs(a.pts)).q;
    return centroid(a);
  }
  /** פישוט קו חופשי — נקודה כל ~minM מטרים (ציור באצבע מייצר מאות). */
  function thin(pts, minM) {
    if (!pts.length) return [];
    var out = [pts[0]];
    pts.forEach(function (p) { if (distM(p, out[out.length - 1]) >= (minM || 1.2)) out.push(p); });
    return out;
  }
  return { world: world, pairs: pairs, flat: flat, polyOf: polyOf, areaM2: areaM2,
           lengthM: lengthM, distM: distM, inPoly: inPoly, inShape: inShape,
           centroid: centroid, nearestOnLine: nearestOnLine, distToAsset: distToAsset,
           anchorOf: anchorOf, thin: thin };
})();

CBA.gardenAssets = (function () {
  "use strict";
  var G = CBA.gardenGeo;
  var SCHEMA = 1;
  var LAWN_STATUS = { ok: "תקין", dry: "יבש", dead: "מת" };
  var SPR_TYPES = { pop: "ראש מתרומם", rot: "ראש מסתובב", drip: "טפטוף" };

  function fb() { return (window.CBA && CBA.fb) || null; }
  function uid() { var f = fb(); return (f && f.uid && f.uid()) || ""; }
  function now() { var f = fb(); return f && f.serverNow ? f.serverNow() : new Date(); }
  function newId(prefix) {
    return (prefix || "a") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  function ready(cb) {
    var f = fb();
    if (!(f && f.ensureDb && f.authReady)) return cb(new Error("firebase-missing"));
    f.authReady(function (user) {
      if (!user) return cb(new Error("no-user"));
      f.ensureDb(function (err) { cb(err || null); });
    });
  }

  /* ---------------- קריאה ---------------- */

  /**
   * load(cb) — כל מה שמסך "דשא והשקיה" צריך, בשתי קריאות במקביל.
   * cb({ ok, lawns:[…], assets:[…], err })
   * מדשאה מוחזרת עם `status` ממסמך המצב שלה ב-gardenAssets (kind 'lawn').
   * ⚠️ ארכיון (`archived`) מסונן החוצה — אבל נשמר ב-`all` כדי שתקלה ישנה
   *    שמשויכת לממטרה שהוסרה עדיין תציג את שמה.
   */
  function load(cb) {
    ready(function (err) {
      if (err) return cb({ ok: false, err: err, lawns: [], assets: [] });
      var left = 2, lawns = null, assets = null, firstErr = null;
      function done() {
        if (--left) return;
        if (firstErr) return cb({ ok: false, err: firstErr, lawns: [], assets: [] });
        var state = {}, all = {}, patches = [];
        assets.forEach(function (a) {
          all[a.id] = a;
          if (a.kind === "lawn") state[a.lawnId || a.id] = a;
          if (a.kind === "patch") {
            var pt = { id: a.id, kind: "lawn", patch: true, name: a.name || "", shape: a.shape, pts: a.pts || [],
                       cx: a.cx, cy: a.cy, r: a.r, rx: a.rx, ry: a.ry, parentId: a.parentId || "",
                       status: LAWN_STATUS[a.status] ? a.status : "ok", statusAt: a.updatedAt, statusBy: a.updatedBy,
                       archived: !!a.archived, rev: 1 };
            all[a.id] = pt;
            patches.push(pt);
          }
        });
        lawns.forEach(function (l) {
          l.kind = "lawn";
          var s = state[l.id];
          l.status = (s && LAWN_STATUS[s.status]) ? s.status : "ok";
          l.statusAt = s ? s.updatedAt : null;
          l.statusBy = s ? s.updatedBy : "";
          all[l.id] = l;
        });
        cb({
          ok: true,
          lawns: lawns.concat(patches).filter(function (l) { return !l.archived; }),
          assets: assets.filter(function (a) { return a.kind !== "lawn" && a.kind !== "patch" && !a.archived; }),
          all: all
        });
      }
      fb().readCollection("gardenLawns", function (e, rows) {
        if (e) firstErr = firstErr || e; else lawns = rows || [];
        done();
      });
      fb().readCollection("gardenAssets", function (e, rows) {
        if (e) firstErr = firstErr || e; else assets = rows || [];
        done();
      });
    });
  }

  /** גבולות בלבד — לטופס הדיווח של התושב (אין לו הרשאה ל-gardenAssets). */
  function loadLawns(cb) {
    ready(function (err) {
      if (err) return cb({ ok: false, err: err, lawns: [] });
      fb().readCollection("gardenLawns", function (e, rows) {
        if (e) return cb({ ok: false, err: e, lawns: [] });
        cb({ ok: true, lawns: (rows || []).filter(function (l) { return !l.archived; }) });
      });
    });
  }

  /* ---------------- כתיבה ---------------- */

  /** כתם — מסמך אחד ב-gardenAssets: צורה + מצב + המדשאה שהוא בתוכה. */
  function patchDoc(l, status) {
    var doc = { id: l.id, kind: "patch", name: String(l.name || "").slice(0, 60), shape: l.shape,
                parentId: l.parentId, status: LAWN_STATUS[status] ? status : "ok", archived: !!l.archived,
                updatedAt: now(), updatedBy: uid(), schema: SCHEMA };
    geom(doc, l);
    return doc;
  }
  function geom(doc, l) {
    if (l.shape === "poly") doc.pts = G.flat(G.pairs(l.pts));
    else if (l.shape === "circle") { doc.cx = l.cx; doc.cy = l.cy; doc.r = l.r; doc.pts = []; }
    else { doc.cx = l.cx; doc.cy = l.cy; doc.rx = l.rx; doc.ry = l.ry; doc.pts = []; }
  }

  /** מדשאה: יצירה (rev 1) או עדכון (rev+1). `lawn.rev` הוא הגרסה הנוכחית (0 = חדשה).
      כתם (parentId) — הולך ל-gardenAssets (ר' ההערה בראש הקובץ). */
  function saveLawn(lawn, cb) {
    var isNew = !lawn.rev;
    if (lawn.parentId) {
      var pd = patchDoc(lawn, lawn.status);
      return fb().createDoc("gardenAssets", pd.id, pd, function (e) {
        if (e) return cb({ ok: false, err: e });
        cb({ ok: true, rev: (lawn.rev || 0) + 1 });
      });
    }
    var doc = {
      id: lawn.id, name: String(lawn.name || "").slice(0, 60), shape: lawn.shape,
      rev: isNew ? 1 : (lawn.rev + 1),
      archived: !!lawn.archived, updatedAt: now(), updatedBy: uid(), schema: SCHEMA
    };
    geom(doc, lawn);
    fb().createDoc("gardenLawns", doc.id, doc, function (e) {
      if (e) return cb({ ok: false, err: e });
      cb({ ok: true, rev: doc.rev });
    });
  }

  /** מצב דשא — מסמך נפרד ב-gardenAssets (התושב לא קורא אותו). כתם — המצב על מסמך הכתם.
      `lawn` = אובייקט המקטע (או מזהה, לתאימות). */
  function setLawnStatus(lawn, status, cb) {
    if (!LAWN_STATUS[status]) return cb({ ok: false, err: new Error("bad-status") });
    if (lawn && typeof lawn === "object" && lawn.parentId) {
      var pd = patchDoc(lawn, status);
      return fb().createDoc("gardenAssets", pd.id, pd, function (e) { cb(e ? { ok: false, err: e } : { ok: true }); });
    }
    var lawnId = (lawn && typeof lawn === "object") ? lawn.id : lawn;
    var doc = { id: lawnId, kind: "lawn", lawnId: lawnId, status: status,
                updatedAt: now(), updatedBy: uid(), schema: SCHEMA };
    fb().createDoc("gardenAssets", lawnId, doc, function (e) { cb(e ? { ok: false, err: e } : { ok: true }); });
  }

  var ASSET_KEYS = ["name", "x", "y", "ctrl", "station", "type", "range", "note", "archived"];
  /** ממטרה / מחשב / קו. `a.pts` בצורת [[x,y],…] לקו. */
  function saveAsset(a, cb) {
    var doc = { id: a.id, kind: a.kind, updatedAt: now(), updatedBy: uid(), schema: SCHEMA };
    ASSET_KEYS.forEach(function (k) {
      if (a[k] === undefined || a[k] === null) return;
      doc[k] = k === "name" ? String(a[k]).slice(0, 60) : k === "note" ? String(a[k]).slice(0, 300) : a[k];
    });
    if (a.kind === "pipe") doc.pts = G.flat(a.pts || []);
    fb().createDoc("gardenAssets", doc.id, doc, function (e) { cb(e ? { ok: false, err: e } : { ok: true }); });
  }

  /** שיוך משימה לנכסים. ⚠️ על משימה סגורה רק מנהל רשאי (gtClosedOk). */
  function linkTask(taskId, assetIds, cb) {
    var ids = (assetIds || []).filter(Boolean).slice(0, 5);
    fb().updateDoc("gardenTasks", String(taskId), { assets: ids, updatedAt: now() }, function (e) {
      cb(e ? { ok: false, err: e } : { ok: true, assets: ids });
    });
  }

  /* ---------------- נגזרות ---------------- */

  /** התקלות שמשויכות לנכס — נגזר מהמשימות, לא נשמר על הנכס. */
  function faultsOf(id, tasks) {
    return (tasks || []).filter(function (t) { return (t.assets || []).indexOf(id) !== -1; });
  }

  /** "הקרוב ביותר" — הצעת שיוך גיאומטרית (בלי AI). רק נכסים מהסוג שמתאים לקטגוריה. */
  function suggest(task, items, maxM) {
    if (!task || task.x === null || task.x === undefined || task.x === "") return null;
    var p = [+task.x, +task.y];
    var key = (CBA.gardenLang && CBA.gardenLang.catOfTask) ? CBA.gardenLang.catOfTask(task).key : "";
    var kinds = key === "water" ? ["spr", "pipe", "ctrl"] : key === "lawn" ? ["lawn"] : null;
    if (!kinds) return null;
    var best = null;
    items.forEach(function (a) {
      if (kinds.indexOf(a.kind) === -1 || (task.assets || []).indexOf(a.id) !== -1) return;
      var d = G.distToAsset(p, a);
      if (d <= (maxM || 12) && (!best || d < best.m)) best = { a: a, m: d };
    });
    return best;
  }

  /** סיכום המפה המצטברת: מחשבים, ממטרות, צנרת (מ'), דשא לפי מצב (מ"ר).
      כתם בתוך מדשאה (parentId) נספר במצב שלו ומופחת ממצב ההורה. */
  function summary(lawns, assets, tasks) {
    var st = { ok: 0, dry: 0, dead: 0 }, byId = {};
    lawns.forEach(function (l) { byId[l.id] = l; });
    lawns.forEach(function (l) {
      var a = G.areaM2(l);
      st[l.status] = (st[l.status] || 0) + a;
      var p = l.parentId && byId[l.parentId];
      if (p) st[p.status] = Math.max(0, (st[p.status] || 0) - a);
    });
    var spr = assets.filter(function (a) { return a.kind === "spr"; });
    var openIds = {};
    (tasks || []).forEach(function (t) {
      if (t.closure) return;
      (t.assets || []).forEach(function (id) { openIds[id] = true; });
    });
    return {
      ctrl: assets.filter(function (a) { return a.kind === "ctrl"; }).length,
      spr: spr.length,
      sprBad: spr.filter(function (a) { return openIds[a.id]; }).length,
      pipeM: assets.filter(function (a) { return a.kind === "pipe"; })
               .reduce(function (s, a) { return s + G.lengthM(G.pairs(a.pts)); }, 0),
      lawn: st, lawnTotal: st.ok + st.dry + st.dead
    };
  }

  return {
    LAWN_STATUS: LAWN_STATUS, SPR_TYPES: SPR_TYPES, newId: newId,
    load: load, loadLawns: loadLawns, saveLawn: saveLawn, setLawnStatus: setLawnStatus,
    saveAsset: saveAsset, linkTask: linkTask, faultsOf: faultsOf, suggest: suggest,
    summary: summary
  };
})();
