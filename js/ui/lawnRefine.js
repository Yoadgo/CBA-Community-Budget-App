/* ============================================================================
 *  lawnRefine.js — דיוק גבול מדשאה מתוך טופס הדיווח של התושב   (6.10.2026, גל ב')
 * ----------------------------------------------------------------------------
 *  הכרעות יועד (3.10): "זה אפשרות לתושב בפתיחת התקלה, לא מעבר" ·
 *  התושב רואה **רק את הגבול** (לא מצב דשא, לא ממטרות) · **רק הזזת נקודות
 *  קיימות** (לא מוסיף ולא מוחק) · הדיוק הוא הצעה שהגנן/מנהל מאשר.
 *
 *  שכבה מעל המפה של הטופס (CBA.map במצב נעיצה) — בלי לגעת במנוע:
 *    · SVG בתוך .map-world (יחידות עולם): הגבול המקורי מקווקו, והמדויק מלא.
 *    · ידיות HTML באותו עולם, בגודל קבוע על המסך (קנה מידה נגדי, נצפה
 *      ב-MutationObserver על ה-transform — כמו gardenPins).
 *    · גרירת ידית נתפסת ב-capture על המכל ועוצרת שם — כך המפה לא זזה
 *      ולא נועצת סיכה. בזמן דיוק, הקשה על המפה מזיזה אותה בלבד; את הנעיצה
 *      עצמה מחזיר הטופס (onPin) למקום.
 *
 *  ⚠️ zoom של CSS על body (1.05 בדסקטופ) — ר' zf ב-resident.js.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.lawnRefine = (function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";

  function attach(o) {
    var host = o.host, api = o.api;
    var world = host && host.querySelector(".map-world");
    var viewport = host && host.querySelector(".map-viewport");
    var G = CBA.gardenGeo;
    if (!world || !viewport || !G) return null;
    var S = { lawns: [], lawn: null, orig: null, pts: null, refining: false, show: false };
    var W = { w: parseFloat(world.style.width) || 1061.2, h: parseFloat(world.style.height) || 1297.2 };

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "lr-svg");
    svg.setAttribute("width", W.w); svg.setAttribute("height", W.h);
    svg.setAttribute("viewBox", "0 0 " + W.w + " " + W.h);
    svg.setAttribute("aria-hidden", "true");
    var hl = document.createElement("div");
    hl.className = "lr-handles";
    hl.style.width = W.w + "px"; hl.style.height = W.h + "px";
    world.appendChild(svg); world.appendChild(hl);

    function scale() {
      var m = /scale\(([\d.eE+-]+)\)/.exec(world.style.transform || "");
      return m ? +m[1] : 1;
    }
    function setInv() { host.style.setProperty("--lr-inv", (1 / scale()).toFixed(4)); }
    setInv();
    if (window.MutationObserver) new MutationObserver(setInv).observe(world, { attributes: true, attributeFilter: ["style"] });

    function P(p) { return (p[0] * W.w).toFixed(1) + "," + (p[1] * W.h).toFixed(1); }
    function draw() {
      if (!S.lawn || !S.show) { svg.innerHTML = ""; hl.innerHTML = ""; return; }
      var o1 = G.pairs(S.orig).map(P).join(" ");
      var html = '<polygon class="lr-orig' + (S.pts && CBA.gardenAssets.ptsMoved(S.orig, S.pts) ? " is-moved" : "") + '" points="' + o1 + '"/>';
      if (S.pts && (S.refining || CBA.gardenAssets.ptsMoved(S.orig, S.pts))) {
        html += '<polygon class="lr-new" points="' + G.pairs(S.pts).map(P).join(" ") + '"/>';
      }
      svg.innerHTML = html;
      hl.innerHTML = S.refining ? G.pairs(S.pts).map(function (p, i) {
        return '<button type="button" class="lr-h" data-i="' + i + '" aria-label="נקודה ' + (i + 1) + ' בגבול — גררו למקום הנכון" ' +
          'style="left:' + (p[0] * W.w).toFixed(1) + 'px;top:' + (p[1] * W.h).toFixed(1) + 'px"><i></i></button>';
      }).join("") : "";
    }

    function zf() { var w = viewport.offsetWidth; return w ? (viewport.getBoundingClientRect().width / w) || 1 : 1; }
    function toNorm(cx, cy) {
      var r = viewport.getBoundingClientRect(), z = zf();
      var m = /translate\(([-\d.eE]+)px,\s*([-\d.eE]+)px\)\s*scale\(([\d.eE+-]+)\)/.exec(world.style.transform || "");
      var tx = m ? +m[1] : 0, ty = m ? +m[2] : 0, s = m ? +m[3] : 1;
      return [Math.max(0, Math.min(1, (((cx - r.left) / z - tx) / s) / W.w)),
              Math.max(0, Math.min(1, (((cy - r.top) / z - ty) / s) / W.h))];
    }

    var drag = null;
    host.addEventListener("pointerdown", function (e) {
      var h = e.target.closest && e.target.closest(".lr-h");
      if (!h || !S.refining) return;
      e.stopPropagation(); e.preventDefault();
      drag = { i: +h.dataset.i, id: e.pointerId };
      try { h.setPointerCapture(e.pointerId); } catch (x) {}
      host.classList.add("lr-dragging");
    }, true);
    document.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var n = toNorm(e.clientX, e.clientY);
      S.pts[drag.i * 2] = Math.round(n[0] * 1e5) / 1e5; S.pts[drag.i * 2 + 1] = Math.round(n[1] * 1e5) / 1e5;
      draw();
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null; host.classList.remove("lr-dragging");
      if (o.onChange) o.onChange(ctrl.info());
    }
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    /* גרירת ידית מסתיימת ב-pointerup שמגיע גם למנוע — ננעצר אותו לפני שהוא
       נועץ סיכה במקום שבו הסתיימה הגרירה. */
    host.addEventListener("pointerup", function (e) { if (e.target.closest && e.target.closest(".lr-h")) e.stopPropagation(); }, true);

    var ctrl = {
      setLawns: function (l) { S.lawns = (l || []).filter(function (x) { return x.shape === "poly" && !x.parentId; }); },
      /** הנעיצה זזה. active = הקטגוריה היא דשא/השקיה. מחזיר את המדשאה או null. */
      setPin: function (x, y, active) {
        var l = active ? CBA.gardenAssets.lawnAt(S.lawns, x, y) : null;
        if (!l || !S.lawn || l.id !== S.lawn.id) {
          S.lawn = l; S.orig = l ? l.pts.slice() : null; S.pts = l ? l.pts.slice() : null; S.refining = false;
        }
        S.show = !!l;
        draw();
        return l;
      },
      start: function () {
        if (!S.lawn) return;
        S.refining = true; host.classList.add("lr-on");
        if (api && api.fitBox) {
          var pp = G.pairs(S.pts), x0 = 1, y0 = 1, x1 = 0, y1 = 0;
          pp.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
          var px = (x1 - x0) * 0.35 + 0.004, py = (y1 - y0) * 0.35 + 0.004;
          api.fitBox(Math.max(0, x0 - px), Math.max(0, y0 - py), Math.min(1, x1 + px), Math.min(1, y1 + py), 18);
        }
        draw();
      },
      done: function () { S.refining = false; host.classList.remove("lr-on"); draw(); },
      cancel: function () { if (S.orig) S.pts = S.orig.slice(); S.refining = false; host.classList.remove("lr-on"); draw(); },
      reset: function () { if (S.orig) S.pts = S.orig.slice(); draw(); },
      isRefining: function () { return S.refining; },
      info: function () {
        var moved = !!(S.lawn && S.pts && CBA.gardenAssets.ptsMoved(S.orig, S.pts));
        return { lawn: S.lawn, refining: S.refining, moved: moved };
      },
      /** מה שנשלח עם הדיווח — רק אם באמת זז משהו. */
      edit: function () {
        if (!S.lawn || !S.pts || !CBA.gardenAssets.ptsMoved(S.orig, S.pts)) return null;
        return { lawnId: S.lawn.id, baseRev: S.lawn.rev || 1, pts: G.pairs(S.pts) };
      }
    };
    return ctrl;
  }

  /* ==========================================================================
   *  צד הצוות — "התושב הציע לדייק את הגבול"   (כרטיס התקלה + מסך דשא והשקיה)
   * --------------------------------------------------------------------------
   *  o: { repId, taskId, familyId, onDecided(status), onMap() }
   *  שומר: קודם הגבול (rev+1), אחר כך ההחלטה על מסמך הדיוק (leDecideOk), ואז
   *  שורת "הערה" בקו הזמן של התושב + פוש מהשרת (gar-lawn-edit, בלי מייל).
   *  אין דיוק לדיווח הזה → לא מצויר כלום.
   * ========================================================================== */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function thumb(oldPts, newPts) {
    var G = CBA.gardenGeo, Wd = G.world(), A = G.pairs(oldPts), B = G.pairs(newPts), all = A.concat(B);
    var x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    all.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    var px = (x1 - x0) * 0.12 + 0.002, py = (y1 - y0) * 0.12 + 0.002;
    var vx = (x0 - px) * Wd.w, vy = (y0 - py) * Wd.h, vw = (x1 - x0 + 2 * px) * Wd.w, vh = (y1 - y0 + 2 * py) * Wd.h;
    function pp(L) { return L.map(function (p) { return (p[0] * Wd.w).toFixed(1) + "," + (p[1] * Wd.h).toFixed(1); }).join(" "); }
    return '<svg class="lr-thumb" viewBox="' + [vx, vy, vw, vh].map(function (v) { return v.toFixed(1); }).join(" ") +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="הגבול הנוכחי מול הדיוק שהוצע">' +
      '<polygon class="t-old" points="' + pp(A) + '"/><polygon class="t-new" points="' + pp(B) + '"/></svg>';
  }
  function decision(el, o) {
    var A = CBA.gardenAssets, f = CBA.fb;
    if (!el || !o || !o.repId || !A || !A.readLawnEdit || !f) return;
    A.readLawnEdit(o.repId, function (r) {
      if (!r.ok || !r.edit || !el.isConnected) return;
      var ed = r.edit;
      f.readDoc("gardenLawns", String(ed.lawnId), function (e2, lawn) {
        if (!el.isConnected) return;
        if (e2 || !lawn) lawn = null;
        paint(ed, lawn);
      });
    });
    function paint(ed, lawn) {
      var nm = esc((lawn && lawn.name) || "המדשאה");
      if (ed.status !== "pending") {
        el.innerHTML = '<div class="lr-dec is-decided"><p>' + (ed.status === "approved"
          ? "✓ הדיוק שהתושב הציע לגבול של <b>" + nm + "</b> אושר והמפה עודכנה."
          : "הדיוק שהתושב הציע לגבול של <b>" + nm + "</b> לא אושר.") + '</p></div>';
        return;
      }
      var stale = lawn && (lawn.rev || 1) > (ed.baseRev || 1);
      el.innerHTML = '<div class="lr-dec">' +
        '<div class="lr-dec__h">התושב הציע לדייק את הגבול של ' + nm + '</div>' +
        (lawn ? thumb(lawn.pts || [], ed.pts || []) : '<p>המדשאה כבר לא קיימת במפה — אפשר רק להשאיר.</p>') +
        '<div class="lr-dec__lg"><span><i></i>הגבול היום</span><span><i class="n"></i>מה שהתושב הציע</span></div>' +
        (stale ? '<p>⚠️ הגבול השתנה במפה אחרי שהתושב שלח. עדכון ידרוס את השינוי ההוא.</p>' : '') +
        '<div class="lr-acts">' +
          (lawn && lawn.shape === "poly" ? '<button type="button" class="lr-btn lr-btn--pri" data-dec="yes">לעדכן את הגבול</button>' : '') +
          '<button type="button" class="lr-btn" data-dec="no">להשאיר כמו שהוא</button>' +
          (o.onMap ? '<button type="button" class="lr-btn" data-dec="map">במפה</button>' : '') +
        '</div></div>';
      el.onclick = function (e) {
        var b = e.target.closest("[data-dec]"); if (!b) return;
        e.stopPropagation();
        if (b.dataset.dec === "map") return o.onMap && o.onMap();
        var yes = b.dataset.dec === "yes";
        Array.prototype.forEach.call(el.querySelectorAll("[data-dec]"), function (x) { x.disabled = true; });
        A.decideLawnEdit(ed, lawn, yes, function (res) {
          if (!res.ok) {
            Array.prototype.forEach.call(el.querySelectorAll("[data-dec]"), function (x) { x.disabled = false; });
            return CBA.ui && CBA.ui.toast && CBA.ui.toast(res.lawnSaved ? "הגבול עודכן, אבל ההחלטה לא נרשמה — נסו שוב" : "לא נשמר — נסו שוב", "error");
          }
          if (o.taskId && CBA.data && CBA.data.gardenLogNote) {
            CBA.data.gardenLogNote(o.taskId, yes ? "דיוק הגבול שהצעת אושר — המפה עודכנה. תודה!"
                                                 : "תודה על הדיוק לגבול. הפעם השארנו את הגבול כמו שהוא.", o.familyId || "");
          }
          ed.status = res.status;
          paint(ed, lawn);
          if (CBA.ui && CBA.ui.toast) CBA.ui.toast(yes ? "הגבול עודכן · התושב יקבל הודעה" : "נשאר כמו שהוא · התושב יקבל הודעה");
          if (CBA.setLawnEditsCount && CBA.lawnEditsCount) CBA.setLawnEditsCount(Math.max(0, CBA.lawnEditsCount() - 1));
          if (o.onDecided) o.onDecided(res.status);
        });
      };
    }
  }

  return { attach: attach, decision: decision, thumb: thumb };
})();
