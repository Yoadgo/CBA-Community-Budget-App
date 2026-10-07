/* ============================================================================
 *  lawnRefine.js — סימון בדשא מתוך טופס הדיווח של התושב   (6.10.2026, גל ב' · 7.10 גל ג')
 *  🌱 גל ג': התושב מסמן **אזור יבש** (עיגול) — ר' attach. ההחלטה על דיוק גבול
 *  מהגל הקודם (paint) נשארת, כדי שהצעות שכבר ממתינות ייסגרו כרגיל.
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

  /* 🌱 גל ג' (7.10) — **התושב מסמן את האזור היבש** (עיגול סביב הנעיצה), במקום
     לדייק גבול מדשאה: הדשא כבר לא מצויר, הוא מחושב (CBA.greenArea). הכרעת יועד
     (6.10): "מסמן את הכתם היבש". הסימון הוא הצעה — הגנן/מנהל מוסיף אותו למפה.
     ה-API של ctrl נשמר כמו בגל ב' (setLawns/setPin/start/done/cancel/reset/
     isRefining/info/edit), כדי שטופס הדיווח ישתנה כמה שפחות. */
  function attach(o) {
    var host = o.host, api = o.api;
    var world = host && host.querySelector(".map-world");
    var viewport = host && host.querySelector(".map-viewport");
    var G = CBA.gardenGeo;
    if (!world || !viewport || !G) return null;
    var S = { corr: null, on: false, pin: null, spot: null, refining: false };
    var W = { w: parseFloat(world.style.width) || 1061.2, h: parseFloat(world.style.height) || 1297.2 };
    var PPM = G.world().ppm, R0 = 8 * PPM / W.w, RMIN = 2 * PPM / W.w, RMAX = 0.05;

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

    function draw() {
      if (!S.spot || !S.on) { svg.innerHTML = ""; hl.innerHTML = ""; return; }
      var cx = S.spot.cx * W.w, cy = S.spot.cy * W.h, r = S.spot.r * W.w;
      svg.innerHTML = '<circle class="lr-spot' + (S.refining ? "" : " is-done") + '" cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="' + r.toFixed(1) + '"/>';
      hl.innerHTML = S.refining
        ? '<button type="button" class="lr-h" data-i="r" aria-label="גודל האזור היבש — גררו" style="left:' + (cx + r).toFixed(1) + 'px;top:' + cy.toFixed(1) + 'px"><i></i></button>'
        : "";
    }

    function zf() { var w = viewport.offsetWidth; return w ? (viewport.getBoundingClientRect().width / w) || 1 : 1; }
    function toNorm(cx, cy) {
      var r = viewport.getBoundingClientRect(), z = zf();
      var m = /translate\(([-\d.eE]+)px,\s*([-\d.eE]+)px\)\s*scale\(([\d.eE+-]+)\)/.exec(world.style.transform || "");
      var tx = m ? +m[1] : 0, ty = m ? +m[2] : 0, s = m ? +m[3] : 1;
      return [(((cx - r.left) / z - tx) / s) / W.w, (((cy - r.top) / z - ty) / s) / W.h];
    }

    var drag = null;
    host.addEventListener("pointerdown", function (e) {
      var h = e.target.closest && e.target.closest(".lr-h");
      if (!h || !S.refining) return;
      e.stopPropagation(); e.preventDefault();
      drag = { id: e.pointerId };
      try { h.setPointerCapture(e.pointerId); } catch (x) {}
      host.classList.add("lr-dragging");
    }, true);
    document.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id || !S.spot) return;
      var n = toNorm(e.clientX, e.clientY);
      var r = Math.hypot((n[0] - S.spot.cx) * W.w, (n[1] - S.spot.cy) * W.h) / W.w;
      S.spot.r = Math.round(Math.max(RMIN, Math.min(RMAX, r)) * 1e5) / 1e5;
      draw();
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null; host.classList.remove("lr-dragging");
      if (o.onChange) o.onChange(ctrl.info());
    }
    document.addEventListener("pointerup", end, true);
    document.addEventListener("pointercancel", end, true);
    /* גרירת ידית מסתיימת ב-pointerup שמגיע גם למנוע — עוצרים אותו לפני שהוא
       נועץ סיכה במקום שבו הסתיימה הגרירה. */
    host.addEventListener("pointerup", function (e) { if (e.target.closest && e.target.closest(".lr-h")) e.stopPropagation(); }, true);

    function model() {
      return (CBA.greenArea && CBA.greenArea.ready()) ? CBA.greenArea.model(S.corr) : null;
    }
    var ctrl = {
      /** מסמכי gardenLawns (כולם) — מהם רק תיקוני השטח משנים איפה יש דשא. */
      setLawns: function (rows) { S.corr = CBA.greenArea ? CBA.greenArea.corrFrom(rows) : null; },
      /** הנעיצה זזה. active = הקטגוריה היא דשא/השקיה. מחזיר {green:true} כשהנעיצה על דשא. */
      setPin: function (x, y, active) {
        if (!S.pin || S.pin[0] !== x || S.pin[1] !== y) {
          S.spot = null; S.refining = false; host.classList.remove("lr-on");
        }
        S.pin = [x, y];
        var m = active ? model() : null;
        S.on = !!(m && m.inGreen(x, y));
        if (!S.on) { S.spot = null; S.refining = false; host.classList.remove("lr-on"); }
        draw();
        return S.on ? { green: true, name: "" } : null;
      },
      start: function () {
        if (!S.on || !S.pin) return;
        if (!S.spot) S.spot = { cx: S.pin[0], cy: S.pin[1], r: R0 };
        S.refining = true; host.classList.add("lr-on");
        if (api && api.fitBox) {
          var rx = S.spot.r * 3.2, ry = S.spot.r * 3.2 * W.w / W.h;
          api.fitBox(Math.max(0, S.spot.cx - rx), Math.max(0, S.spot.cy - ry), Math.min(1, S.spot.cx + rx), Math.min(1, S.spot.cy + ry), 18);
        }
        draw();
      },
      done: function () { S.refining = false; host.classList.remove("lr-on"); draw(); },
      cancel: function () { S.spot = null; S.refining = false; host.classList.remove("lr-on"); draw(); },
      reset: function () { if (S.spot) S.spot.r = R0; draw(); },
      isRefining: function () { return S.refining; },
      info: function () {
        var a = S.spot ? Math.PI * Math.pow(S.spot.r * W.w / PPM, 2) : 0;
        return { lawn: S.on ? { name: "" } : null, refining: S.refining, moved: !!(S.on && S.spot), areaM2: a };
      },
      /** מה שנשלח עם הדיווח — רק אם סומן אזור. */
      edit: function () {
        if (!S.on || !S.spot) return null;
        return { kind: "patch", cx: S.spot.cx, cy: S.spot.cy, r: S.spot.r };
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
      if (ed.kind === "patch") return paintPatch(ed);
      f.readDoc("gardenLawns", String(ed.lawnId), function (e2, lawn) {
        if (!el.isConnected) return;
        if (e2 || !lawn) lawn = null;
        paint(ed, lawn);
      });
    });
    /* 🌱 גל ג' — אזור יבש שהתושב סימן: מוסיפים ככתם (יבש/מת) או משאירים. */
    function paintPatch(ed) {
      var area = Math.round(Math.PI * Math.pow(ed.r * CBA.gardenGeo.world().w / CBA.gardenGeo.world().ppm, 2));
      if (ed.status !== "pending") {
        el.innerHTML = '<div class="lr-dec is-decided"><p>' + (ed.status === "approved"
          ? "✓ האזור היבש שהתושב סימן נוסף למפת הדשא."
          : "האזור שהתושב סימן לא נוסף למפה.") + '</p></div>';
        return;
      }
      el.innerHTML = '<div class="lr-dec">' +
        '<div class="lr-dec__h">התושב סימן אזור יבש · כ-' + area + ' מ"ר</div>' +
        (CBA.greenArea && CBA.greenArea.ready() ? CBA.greenArea.thumbSvg(ed.cx, ed.cy, ed.r) : '') +
        '<div class="lr-acts">' +
          '<button type="button" class="lr-btn lr-btn--pri" data-pd="dry">הוספה ככתם יבש</button>' +
          '<button type="button" class="lr-btn" data-pd="dead">ככתם מת</button>' +
          '<button type="button" class="lr-btn" data-pd="no">לא להוסיף</button>' +
          (o.onMap ? '<button type="button" class="lr-btn" data-pd="map">במפה</button>' : '') +
        '</div></div>';
      el.onclick = function (e) {
        var b = e.target.closest("[data-pd]"); if (!b) return;
        e.stopPropagation();
        if (b.dataset.pd === "map") return o.onMap && o.onMap();
        var st = b.dataset.pd === "no" ? null : b.dataset.pd;
        Array.prototype.forEach.call(el.querySelectorAll("[data-pd]"), function (x) { x.disabled = true; });
        A.decidePatchEdit(ed, st, o.taskId, function (res) {
          if (!res.ok) {
            Array.prototype.forEach.call(el.querySelectorAll("[data-pd]"), function (x) { x.disabled = false; });
            return CBA.ui && CBA.ui.toast && CBA.ui.toast(res.lawnSaved ? "הכתם נשמר, אבל ההחלטה לא נרשמה — נסו שוב" : "לא נשמר — נסו שוב", "error");
          }
          if (o.taskId && CBA.data && CBA.data.gardenLogNote) {
            CBA.data.gardenLogNote(o.taskId, st ? "האזור שסימנת נוסף למפת הגינון. תודה!"
                                               : "תודה על הסימון. הפעם לא הוספנו אותו למפה.", o.familyId || "");
          }
          ed.status = res.status;
          paintPatch(ed);
          if (CBA.ui && CBA.ui.toast) CBA.ui.toast(st ? (res.linkFailed ? "הכתם נוסף · השיוך לתקלה לא נשמר — שייכו מהמפה" : "הכתם נוסף ושויך לתקלה · התושב יקבל הודעה")
                                                     : "לא נוסף · התושב יקבל הודעה");
          if (CBA.setLawnEditsCount && CBA.lawnEditsCount) CBA.setLawnEditsCount(Math.max(0, CBA.lawnEditsCount() - 1));
          if (o.onDecided) o.onDecided(res.status);
        });
      };
    }
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
          (lawn && lawn.shape === "poly" && !lawn.kind ? '<button type="button" class="lr-btn lr-btn--pri" data-dec="yes">לעדכן את הגבול</button>' : '') +
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
