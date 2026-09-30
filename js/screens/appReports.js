/* ============================================================================
 *  appReports.js — דיווחי התושבים על האפליקציה (מנהל-על בלבד)
 * ----------------------------------------------------------------------------
 *  הצד השני של הכפתור הצף (js/ui/report.js).
 *
 *  גל 4 (24.9.2026, הכרעת יועד) — עיצוב מחדש:
 *  · **דיווח לא נעלם אחרי "טופל".** שלוש לשוניות: פתוחים · טופלו · הכול.
 *    דיווח שסומן נשאר על המסך עד היציאה (st.keep), ואז עובר ל"טופלו"
 *    עם שורה ירוקה: מתי טופל ומה נענה.
 *  · פס צבע לפי סוג (אדום תקלה, ורוד הצעה), תגית מצב, קיבוץ לפי זמן,
 *    ארבעה מדדים בראש — בלי ספים ובלי צבעי אזהרה (הוכרע: לא מערכת התראות).
 *  · "פרטים טכניים" ו"העתקה לתחקור" על כל כרטיס.
 *
 *  ⚠️ עדיין **פשוט בכוונה** (9.9.26): טופל/לא טופל ותשובה אופציונלית. אין
 *     סטטוסים, אין הקצאות.
 *  ⚠️ הנתונים: מ-Firestore כשהדגל appReportsFromFirestore דלוק (ברירת מחדל),
 *     אחרת מהגיליון. כל שורה נושאת `src`, והכתיבה הולכת לאותו מקום.
 *  ⚠️ התמונות נשלפות דרך פעולת 'receipt' הקיימת (מנהל-על עובר בה).
 *  ⚠️ נקרא גם מתוך מרכז "ניהול מערכת" (sysHub.js) עם opts.embedded —
 *     אז בלי כותרת מסך.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

CBA.screens.appReports = (function () {
  "use strict";

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  var VIEW_KEY = "cba_rr_view";
  var st = { rows: [], view: "open", kind: "all", keep: {}, openDiag: {}, embedded: false, loaded: false };
  try { var v0 = localStorage.getItem(VIEW_KEY); if (v0 === "open" || v0 === "done" || v0 === "all") st.view = v0; } catch (e) {}

  var DAY = 86400000;

  function p2(n) { return n < 10 ? "0" + n : String(n); }
  function dOf(v) { var d = new Date(v); return isNaN(d.getTime()) ? null : d; }
  function fmtTime(v) { var d = dOf(v); return d ? p2(d.getHours()) + ":" + p2(d.getMinutes()) : ""; }
  function fmtDay(v) { var d = dOf(v); return d ? d.getDate() + "." + (d.getMonth() + 1) : ""; }
  function fmtFull(v) { var d = dOf(v); return d ? fmtDay(v) + " · " + fmtTime(v) : ""; }

  function startOfDay(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function groupOf(v) {
    var d = dOf(v); if (!d) return "ללא תאריך";
    var today = startOfDay(Date.now()), t = d.getTime();
    if (t >= today) return "היום";
    if (t >= today - DAY) return "אתמול";
    if (t >= today - 6 * DAY) return "השבוע";
    if (t >= today - 30 * DAY) return "החודש";
    return "קודם";
  }

  function errCount(r) { return String(r.errors || "").split("\n").filter(Boolean).length; }
  function isBug(r) { return r.kind === "תקלה"; }

  /* ---------- מדדים ---------- */
  function kpis() {
    var open = st.rows.filter(function (r) { return !r.done; });
    var weekAgo = Date.now() - 7 * DAY, monthAgo = Date.now() - 30 * DAY;
    var doneWeek = st.rows.filter(function (r) { var d = dOf(r.doneAt); return r.done && d && d.getTime() >= weekAgo; }).length;
    var spans = st.rows.map(function (r) {
      var a = dOf(r.date), b = dOf(r.doneAt);
      return (r.done && a && b && b.getTime() >= monthAgo) ? (b.getTime() - a.getTime()) / DAY : null;
    }).filter(function (x) { return x !== null && x >= 0; });
    var avg = spans.length ? spans.reduce(function (s, x) { return s + x; }, 0) / spans.length : null;
    var avgTxt = avg === null ? "—" : (avg < 1 ? Math.max(1, Math.round(avg * 24)) + " שע'" : (Math.round(avg * 10) / 10) + " ימים");
    return '<div class="rr-kpis">' +
      kpi(open.length, "פתוחים") +
      kpi(open.filter(isBug).length, "תקלות פתוחות") +
      kpi(doneWeek, "טופלו השבוע") +
      kpi(avgTxt, "זמן טיפול ממוצע") +
    "</div>";
  }
  function kpi(v, label) {
    return '<div class="rr-kpi"><div class="rr-kpi__v">' + esc(v) + '</div><div class="rr-kpi__l">' + esc(label) + "</div></div>";
  }

  /* ---------- כרטיס ---------- */
  function techHTML(r) {
    var meta = [r.screen, r.dialog, r.perms, r.year, r.ver && ("לקוח " + r.ver), r.srvVer && ("שרת " + r.srvVer), r.ua, r.net]
      .filter(Boolean).join(" · ");
    function block(title, text) {
      return text ? '<div class="rr-tech__b"><div class="rr-tech__t">' + esc(title) + '</div><pre>' + esc(text) + "</pre></div>" : "";
    }
    return '<div class="rr-tech">' +
      (meta ? '<div class="rr-tech__meta">' + esc(meta) + "</div>" : "") +
      block("שגיאות שנרשמו (" + errCount(r) + ")", r.errors) +
      block("מה המשתמש עשה לפני כן", r.trail) +
      block("מה השרת עשה לאחרונה", r.pulse) +
      block("מידע נוסף", r.extra) +
    "</div>";
  }

  function cardHTML(r) {
    var bug = isBug(r);
    var items = (r.items || []).filter(Boolean);
    var ec = errCount(r), pc = (r.photos || []).length;
    var extras = (ec ? '<span class="rr-chip rr-chip--err">' + ec + " שגיאות</span>" : "") +
                 (pc ? '<span class="rr-chip">' + pc + " תמונות</span>" : "") +
                 (r.photosIncomplete ? '<span class="rr-chip">תמונות עדיין עולות</span>' : "");
    var doneLine = r.done
      ? '<div class="rr-done">✓ טופל' + (r.doneAt ? " " + esc(fmtFull(r.doneAt)) : "") +
        (r.reply ? ' · תשובה לתושב: "' + esc(String(r.reply).split("\n---\n").pop()) + '"' : "") + "</div>"
      : (r.reply ? '<div class="rr-done rr-done--muted">תשובה שנשלחה: "' + esc(String(r.reply).split("\n---\n").pop()) + '"</div>' : "");
    return '<div class="rr-card' + (bug ? " rr-card--bug" : " rr-card--idea") + (r.done ? " is-done" : "") +
             '" data-id="' + esc(r.id) + '">' +
      '<div class="rr-card__head">' +
        '<span class="rr-pill ' + (bug ? "rr-pill--bug" : "rr-pill--idea") + '">' + (bug ? "תקלה" : "הצעה") + "</span>" +
        '<span class="rr-pill ' + (r.done ? "rr-pill--done" : "rr-pill--open") + '">' + (r.done ? "טופל" : "פתוח") + "</span>" +
        '<span class="rr-meta">#' + esc(r.id) + "</span>" +
        '<span class="rr-meta rr-meta--who">' + esc(r.name || r.email || "") + "</span>" +
        '<span class="rr-meta">' + esc(groupOf(r.date) === "היום" || groupOf(r.date) === "אתמול" ? fmtTime(r.date) : fmtFull(r.date)) + "</span>" +
        (r.screen ? '<span class="rr-meta">· ' + esc(String(r.screen).replace(/\s*\([^)]*\)\s*$/, "")) + "</span>" : "") +
        extras +
      "</div>" +
      (items.length === 1
        ? '<div class="rr-text">' + esc(items[0]) + "</div>"
        : '<ol class="rr-items">' + items.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>") +
      doneLine +
      '<div class="rr-acts">' +
        (r.done
          ? '<button type="button" data-act="reopen">פתיחה מחדש</button>'
          : '<button type="button" class="rr-btn-main" data-act="done">✓ סימון כטופל</button>') +
        '<button type="button" data-act="reply">' + (r.reply ? "תשובה נוספת" : "תשובה לתושב") + "</button>" +
        '<button type="button" data-act="tech" aria-expanded="' + (st.openDiag[r.id] ? "true" : "false") + '">פרטים טכניים</button>' +
        '<button type="button" data-act="copy">העתקה לתחקור</button>' +
        (pc ? '<button type="button" data-act="photos">תמונות (' + pc + ")</button>" : "") +
      "</div>" +
      (st.openDiag[r.id] ? techHTML(r) : "") +
      '<div class="rr-imgs" hidden></div>' +
    "</div>";
  }

  /* ---------- רשימה ---------- */
  function visible() {
    return st.rows.filter(function (r) {
      var kindOk = st.kind === "all" || (st.kind === "bug" ? isBug(r) : !isBug(r));
      var viewOk = st.view === "all" || (st.view === "open" ? (!r.done || st.keep[r.id]) : (r.done || st.keep[r.id]));
      return kindOk && viewOk;
    });
  }

  function controlsHTML() {
    var openN = st.rows.filter(function (r) { return !r.done; }).length;
    var doneN = st.rows.length - openN;
    function seg(v, label) {
      return '<button type="button" class="seg__opt' + (st.view === v ? " is-active" : "") + '" data-view="' + v + '">' + label + "</button>";
    }
    function chip(k, label) {
      return '<button type="button" class="rr-filter' + (st.kind === k ? " is-on" : "") + '" data-kind="' + k + '">' + label + "</button>";
    }
    return '<div class="rr-controls">' +
      '<div class="seg rr-seg">' + seg("open", "פתוחים (" + openN + ")") + seg("done", "טופלו (" + doneN + ")") + seg("all", "הכול") + "</div>" +
      '<div class="rr-filters">' + chip("all", "הכול") + chip("bug", "תקלות") + chip("idea", "הצעות") + "</div>" +
    "</div>";
  }

  function listHTML() {
    var rows = visible();
    if (!rows.length) {
      return CBA.ui.emptyState({
        icon: "inbox",
        title: st.rows.length ? (st.view === "open" ? "אין דיווחים פתוחים" : "אין כאן דיווחים") : "עדיין אין דיווחים",
        sub: st.rows.length ? "אפשר לעבור ללשונית אחרת או לשנות את הסינון"
                            : "הכפתור הוורוד פתוח לכל משתמש מחובר, בכל מסך"
      });
    }
    var h = "", g = "";
    rows.forEach(function (r) {
      var gg = groupOf(r.date);
      if (gg !== g) { g = gg; h += '<div class="rr-group">' + esc(g) + "</div>"; }
      h += cardHTML(r);
    });
    return h;
  }

  function headHTML() {
    if (st.embedded) return "";
    /* A0 — עם סרגל הניהול הכותרת עוברת לסרגל; שורת ההסבר נשארת */
    return '<div class="screen-head">' + (CBA.canopy ? "" : '<div class="screen-head__title">דיווחים על האפליקציה</div>') +
           '<div class="screen-head__sub">מה שמשתמשים שולחים דרך הכפתור הוורוד</div></div>';
  }

  /* ---------- סרגל הניהול (A0, ספר האבנים — אושר) ----------
     רק כשהמסך נפתח לבד (למשל מקישור בפוש: NOTIFY_SCREENS → appReports).
     משובץ ב"ניהול מערכת" — בלי סרגל (לסרגל של המרכז יש "דיווחים פתוחים").
     "פתוחים" ו"תקלות" = אותם מספרים של המדדים "פתוחים" / "תקלות פתוחות". */
  var RR_ICO = '<path d="M4 4h16v12H8l-4 4z"/><path d="M9 9h6M9 12h4"/>';
  function openRows() { return st.rows.filter(function (r) { return !r.done; }); }
  function setFilter(view, kind) {
    st.view = view; st.keep = {};   // כמו לחיצה על "פתוחים" בבורר
    try { localStorage.setItem(VIEW_KEY, st.view); } catch (x) {}
    if (kind) st.kind = kind;       // כמו לחיצה על שבב הסינון
  }
  function surface(container) {
    if (st.embedded || !CBA.canopy) return container;
    var sh = CBA.canopy.shell(container, { key: "appReports", dom: "home", ico: RR_ICO, title: "דיווחים",
      pills: [{ id: "rr-p-open", k: "פתוחים" }, { id: "rr-p-bug", k: "תקלות" }] });
    if (sh.fresh) {
      sh.bar.querySelector("#rr-p-open").addEventListener("click", function () {
        setFilter("open", "all");
        if (st.loaded) paint(container);
        try { sh.body.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
      });
      sh.bar.querySelector("#rr-p-bug").addEventListener("click", function () {
        setFilter("open", "bug");
        if (st.loaded) paint(container);
        try { sh.body.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
      });
    }
    return sh.body;
  }
  function syncBars(container) {
    if (st.embedded) {
      if (CBA.screens.sysHub && CBA.screens.sysHub.syncBar) CBA.screens.sysHub.syncBar();
      return;
    }
    if (!CBA.canopy) return;
    var open = st.loaded ? openRows() : null;
    CBA.canopy.pill(container, "rr-p-open", open ? open.length : null);
    CBA.canopy.pill(container, "rr-p-bug", open ? open.filter(isBug).length : null);
  }

  function paint(container) {
    surface(container).innerHTML = '<div class="rr-root">' + headHTML() + kpis() + controlsHTML() +
                          '<div class="rr-list">' + listHTML() + "</div></div>";
    wire(container, container.querySelector(".rr-root"));
    syncBars(container);
  }

  /* ARB2 (גל 9, 1.10.26) — "המסך עדיין פתוח?" לפני ציור מאוחר: עצמאי — לפי CBA.onScreen; משובץ ב-sysHub — לפי חיבור החלונית ל-DOM. */
  function stillHere(container, embedded) {
    if (!container || container.isConnected === false) return false;
    if (!embedded && CBA.onScreen && !CBA.onScreen("appReports")) return false;
    return true;
  }

  function findRow(id) { return st.rows.filter(function (r) { return String(r.id) === String(id); })[0]; }

  function packReport(r) {
    var lines = ["=== CBA · דיווח #" + r.id + " (" + (isBug(r) ? "תקלה" : "הצעה") + ") ===",
      "מתי: " + fmtFull(r.date) + " · מי: " + (r.name || r.email || "?") + " · מצב: " + (r.done ? "טופל " + fmtFull(r.doneAt) : "פתוח"),
      "מסך: " + (r.screen || "?") + (r.dialog ? " · " + r.dialog : ""),
      "גרסה: לקוח " + (r.ver || "?") + " · שרת " + (r.srvVer || "?"),
      "משתמש: " + (r.perms || "?") + (r.year ? " · שנת עבודה " + r.year : ""),
      "מכשיר: " + (r.ua || "?") + " · " + (r.net || "?"),
      "מה נכתב:"];
    (r.items || []).forEach(function (t, i) { lines.push("  " + (i + 1) + ". " + t); });
    if (r.errors) { lines.push("שגיאות:"); String(r.errors).split("\n").forEach(function (x) { lines.push("  " + x); }); }
    if (r.trail) { lines.push("שובל פעולות:"); String(r.trail).split("\n").forEach(function (x) { lines.push("  " + x); }); }
    if (r.pulse) lines.push("שרת: " + r.pulse);
    if (r.extra) lines.push("מידע נוסף: " + r.extra);
    var txt = lines.join("\n");
    return (CBA.diag && CBA.diag.clean) ? CBA.diag.clean(txt) : txt;
  }

  function copy(text) {
    var fn = (CBA.report && CBA.report.copyText) || function (t, cb) { cb(false); };
    fn(text, function (ok) { CBA.ui.toast(ok ? "הועתק — אפשר להדביק בשיחה" : "ההעתקה נכשלה", ok ? "ok" : "error"); });
  }

  /* ⚠️ כל המאזינים נתלים על .rr-root — אלמנט שנוצר מחדש בכל ציור — ולא על
     container, שחי לאורך כל האפליקציה (מאזין עליו היה נערם בכל ציור). */
  function wire(container, root) {
    root.addEventListener("click", function (e) {
      var sv = e.target.closest("[data-view]");
      if (sv) {
        st.view = sv.dataset.view; st.keep = {};
        try { localStorage.setItem(VIEW_KEY, st.view); } catch (x) {}
        return paint(container);
      }
      var sk = e.target.closest("[data-kind]");
      if (sk) { st.kind = sk.dataset.kind; return paint(container); }

      var b = e.target.closest("[data-act]");
      if (!b) return;
      var card = b.closest(".rr-card");
      var row = card && findRow(card.dataset.id);
      if (!row) return;
      var act = b.dataset.act;

      if (act === "done" || act === "reopen") {
        var want = act === "done";
        var release = CBA.ui.busy ? CBA.ui.busy(b, "שומר…") : function () {};
        CBA.data.setAppReportState(row, want, "", function (res) {
          release();
          if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "לא הצלחנו לעדכן");
          row.done = want;
          row.doneAt = want ? new Date().toISOString() : "";
          /* נשאר על המסך עד היציאה — לא קופץ מתחת לאצבע. */
          st.keep[row.id] = true;
          if (!stillHere(container, st.embedded)) return;   /* ARB2 (גל 9, 1.10.26) — לא מציירים מעל מסך אחר */
          paint(container);
          if (want) CBA.ui.toast("סומן כטופל · נמצא גם בלשונית \"טופלו\"", "ok");
        });
        return;
      }

      if (act === "reply") {
        /* ARA1 (גל 13, אושר 1.10.26) — תשובות מוכנות: לחיצה ממלאת את השדה (ונשאר
           לערוך), ו"תוקן" מסמן גם "לסמן כטופל". שום דבר לא נשלח בלי "שליחה". */
        var READY = [
          { t: "תוקן, תודה על הדיווח!", done: true },
          { t: "בבדיקה — נעדכן כשיהיה תיקון.", done: false },
          { t: "תודה על הרעיון! רשמנו אותו לתכנון.", done: false },
          { t: "לא הצלחנו לשחזר את התקלה. אפשר לפרט מה בדיוק קרה?", done: false }
        ];
        CBA.ui.dialog({
          title: "תשובה לדיווח #" + row.id, okText: "שליחה", cancelText: "ביטול", sticky: true,
          html: '<p class="ar-rep__lead">מה לכתוב למדווח? הטקסט יישלח אליו במייל.</p>' +
            '<div class="ar-rep__chips">' + READY.map(function (x, i) {
              return '<button type="button" class="ar-rep__chip" data-ready="' + i + '">' + esc(x.t) + "</button>";
            }).join("") + "</div>" +
            '<textarea class="field-input ar-rep__txt" rows="3" aria-label="התשובה"></textarea>' +
            (row.done ? "" : '<label class="ar-rep__done"><input type="checkbox" data-rep-done> לסמן גם כטופל</label>'),
          onMount: function (wrap) {
            wrap.addEventListener("click", function (e) {
              var c = e.target.closest("[data-ready]");
              if (!c) return;
              var x = READY[+c.getAttribute("data-ready")], ta = wrap.querySelector(".ar-rep__txt");
              ta.value = x.t; ta.focus();
              var cb = wrap.querySelector("[data-rep-done]");
              if (cb) cb.checked = !!x.done;
            });
          },
          onOk: function (wrap, close) {
            var ta = wrap.querySelector(".ar-rep__txt"), cb = wrap.querySelector("[data-rep-done]");
            var t = String(ta.value || "").trim();
            if (!t) { ta.focus(); return; }
            close({ t: t, done: !!row.done || !!(cb && cb.checked) });
          }
        }).then(function (out) {
          if (!out || !out.t) return;
          CBA.data.setAppReportState(row, out.done, out.t, function (res) {
            if (!res || !res.ok) return CBA.ui.alert((res && res.error) || "לא הצלחנו לשלוח");
            var t = out.t;
            row.reply = res.reply || (row.reply ? row.reply + "\n---\n" + t : t);
            if (out.done && !row.done) { row.done = true; row.doneAt = new Date().toISOString(); st.keep[row.id] = true; }
            CBA.ui.toast(out.done ? "התשובה נשלחה וסומן כטופל" : "התשובה נשלחה", "ok");
            if (!stillHere(container, st.embedded)) return;   /* ARB2 (גל 9, 1.10.26) — לא מציירים מעל מסך אחר */
            paint(container);
          });
        });
        return;
      }

      if (act === "tech") {
        st.openDiag[row.id] = !st.openDiag[row.id];
        return paint(container);
      }

      if (act === "copy") return copy(packReport(row));

      if (act === "photos") {
        var box = card.querySelector(".rr-imgs");
        if (!box.hidden) { box.hidden = true; return; }
        box.hidden = false;
        /* ARB3 (גל 9, 1.10.26) — "נטען" מסומן רק אחרי שכל התמונות הצליחו; כשל אחד ⇒ סגירה ופתיחה מחדש מנסה שוב. */
        if (box.dataset.loaded === "1" || box.dataset.loaded === "busy") return;
        box.dataset.loaded = "busy";
        box.innerHTML = "";
        var photos = row.photos || [], left = photos.length, failed = 0;
        photos.forEach(function (fid) {
          CBA.data.getReceipt(fid, function (res) {
            var d = document.createElement("div");
            if (res && res.ok && res.url) {
              d.innerHTML = '<img class="rr-img" src="' + res.url + '" alt="צילום מהדיווח">';
            } else {
              failed++;
              d.className = "rr-meta";
              d.textContent = ((res && res.error) || "לא הצלחנו לטעון תמונה") + " · לניסיון חוזר: סגירה ופתיחה של \"תמונות\"";
            }
            box.appendChild(d);
            if (--left === 0) {
              if (failed) delete box.dataset.loaded; else box.dataset.loaded = "1";
            }
          });
        });
      }
    });
  }

  return {
    title: "דיווחים על האפליקציה",
    /* לשימוש מסך התחקור — אותם נתונים בלי קריאה נוספת כשכבר נטענו. */
    rows: function () { return st.rows.slice(); },
    /* A0 — לסרגל של "ניהול מערכת": מספר הפתוחים מהזיכרון (null = עוד לא נטען). */
    openCount: function () { return st.loaded ? openRows().length : null; },
    /* A0 — מונה "דיווחים פתוחים" בסרגל המרכז: אותו מעבר של "פתוחים" + "הכול". */
    filter: function (view, kind, container) {
      setFilter(view, kind);
      if (container && st.loaded && container.isConnected !== false) paint(container);
    },
    load: function (cb) {
      CBA.data.getAppReports(function (res) {
        if (res && res.ok) { st.rows = res.rows || []; st.loaded = true; }
        if (cb) cb(res);
      });
    },

    render: function render(container, opts) {
      var embedded = !!(opts && opts.embedded);
      st.embedded = embedded;
      /* ARB1 (גל 9, 1.10.26) — רענון רקע שקט (כל done/reply מעלה את התחום): לא מאפסים keep ולא מציירים שלד — מציירים מהזיכרון וטוענים בשקט. */
      var quiet = !!CBA.renderSilent && st.loaded;
      if (quiet) {
        paint(container);
      } else {
        st.keep = {};
        surface(container).innerHTML = headHTML() + (CBA.skel && CBA.skel.cards ? CBA.skel.cards(3) :
          '<div class="card"><div class="club-empty">טוען…</div></div>');
        syncBars(container);
      }
      CBA.data.getAppReports(function (res) {
        if (!stillHere(container, embedded)) return;   /* ARB2 (גל 9, 1.10.26) — המשתמש כבר עבר מסך/לשונית */
        if (!res || !res.ok) {
          if (quiet) return;   /* ARB1 — ברענון שקט נשארים עם מה שמצויר */
          /* ARB3 (גל 9, 1.10.26) — כפתור "נסה שוב" בכשל טעינה */
          surface(container).innerHTML = headHTML() + '<div class="card"><div class="club-empty">לא ניתן לטעון כרגע. ' +
            esc((res && res.error) || "") +
            ' <button type="button" class="btn-ghost btn-sm" data-rr-retry>נסה שוב</button></div></div>';
          var rb = container.querySelector("[data-rr-retry]");
          if (rb) rb.addEventListener("click", function () { render(container, opts); });
          return;
        }
        st.rows = res.rows || [];
        st.loaded = true;
        paint(container);
      });
    }
  };
})();
