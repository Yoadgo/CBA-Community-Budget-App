/* search.js — חיפוש אחד לכל האפליקציה (2026-08-25)
   ============================================================================
   כפתור זכוכית מגדלת בכותרת (מימין לכפתור המשתמש) פותח שדה חיפוש אחד שמחפש
   בכל מה שכבר נטען לזיכרון — בלי אף קריאת רשת חדשה, חוץ ממדריך התושבים
   שנטען פעם אחת בפתיחה הראשונה ואז נשמר במטמון.

   מה מחפשים:
     • מסכים    — כל מסך שמותר למשתמש הנוכחי לפי ההרשאות שלו (CBA.navTargets)
     • סעיפי תקציב — קופצים לניהול ההוצאות מסונן לאותו סעיף
     • הוצאות   — ספק, רוכש, תיאור, סכום
     • שכנים    — מהמדריך הקהילתי (משפחה, בית, טלפון) — בדיוק אותו מידע
                  שכבר גלוי לכל תושב מחובר במסך "שכנים", לא יותר

   שני כללים לכל הרחבה עתידית:
   1. אין כאן שום בדיקת הרשאה חדשה. מה שמותר לראות נגזר ממה שכבר הותר —
      רשימת המסכים מגיעה מ-CBA.navTargets (שכבר מסונן), ומדריך התושבים מגיע
      מנקודת הקצה הקהילתית שהשרת עצמו כבר מסנן. אסור להוסיף כאן מקור מידע
      שלא עבר את אותה דרך.
   2. החיפוש לעולם לא כותב כלום. הוא רק מנווט.
   ========================================================================== */
window.CBA = window.CBA || {};

CBA.search = (function () {
  "use strict";

  var el = null, inputEl = null, listEl = null;
  var results = [], sel = 0;
  var dirRows = null, dirAsked = false;
  var lastFocus = null;

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  /* נירמול לחיפוש: אותיות קטנות, בלי גרשיים/מרכאות (תשפ"ז מול תשפז), רווח אחד */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase()
      .replace(/["'`״׳]/g, "").replace(/\s+/g, " ").trim();
  }

  /* ציון התאמה: 0 = מתחיל בדיוק בשאילתה, 1 = תחילת מילה, 2 = באמצע, -1 = לא נמצא.
     נמוך יותר = טוב יותר, כדי שמיון עולה יעלה את ההתאמות החזקות למעלה. */
  function score(hay, q) {
    var h = norm(hay);
    if (!h) return -1;
    var i = h.indexOf(q);
    if (i < 0) return -1;
    if (i === 0) return 0;
    return h.charAt(i - 1) === " " ? 1 : 2;
  }

  /* הדגשת החלק התואם בתוך התווית */
  function mark(text, q) {
    var s = String(text == null ? "" : text);
    var i = norm(s).indexOf(q);
    if (i < 0 || !q) return esc(s);
    return esc(s.slice(0, i)) + '<mark>' + esc(s.slice(i, i + q.length)) + '</mark>' + esc(s.slice(i + q.length));
  }

  /* --- קריאת שדות ממדריך התושבים ---
     הכותרות בגיליון אינן קבועות ("שם משפחה" מול "משפחה", "מספר בית" מול
     "בית"), ולכן קוראים לפי הכלה ולא לפי שוויון — בדיוק כמו בשרת. */
  function flds(row, frag) {
    var out = [], k;
    for (k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (k.indexOf(frag) !== -1) {
        var v = String(row[k] == null ? "" : row[k]).trim();
        if (v) out.push(v);
      }
    }
    return out;
  }
  function fld(row, frag) { var a = flds(row, frag); return a.length ? a[0] : ""; }

  function navTargets() {
    return (window.CBA.navTargets ? CBA.navTargets() : []) || [];
  }
  function hasTarget(key) {
    return navTargets().some(function (t) { return t.key === key; });
  }
  function go(key) { if (window.CBA.navigate) CBA.navigate(key); }

  /* מסך התושבים שהמשתמש הנוכחי רשאי לראות — הניהולי אם יש לו, אחרת הקהילתי */
  function directoryScreen() {
    if (hasTarget("residents")) return "residents";
    if (hasTarget("resDirectory")) return "resDirectory";
    return null;
  }

  var ICO = {
    screen: '<path d="M4 5h16v11H4z"/><path d="M9 20h6M12 16v4"/>',
    cat:    '<path d="M4 7h16M4 12h16M4 17h10"/>',
    money:  '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/>',
    person: '<circle cx="12" cy="8.5" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>'
  };
  function ico(d) {
    return '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }

  /* ------------------------------------------------------------------ איסוף */
  function collect(q) {
    var out = [];

    /* 1. מסכים */
    navTargets().forEach(function (t) {
      var sc = score(t.label, q);
      if (sc < 0) return;
      out.push({ g: "מסכים", sc: sc, icon: ICO.screen, label: t.label,
        sub: t.group || "", run: function () { go(t.key); } });
    });

    var canExpenses = hasTarget("expenses");

    /* 2. סעיפי תקציב — רק למי שרואה בכלל את מסך ההוצאות */
    if (canExpenses && CBA.data && CBA.data.getCategories) {
      CBA.data.getCategories().forEach(function (c) {
        var sc = score(c.name, q);
        if (sc < 0) return;
        var g = CBA.data.findGroup ? CBA.data.findGroup(c.group) : null;
        out.push({ g: "סעיפי תקציב", sc: sc, icon: ICO.cat, label: c.name,
          sub: (g && g.name) ? g.name : "סעיף תקציב",
          run: function () { openExpenses({ category: c.id }); } });
      });
    }

    /* 3. הוצאות */
    if (canExpenses && CBA.data && CBA.data.getTransactions) {
      CBA.data.getTransactions().forEach(function (t) {
        var name = t.supplier || t.buyer || t.description || "";
        var sc = Math.min(
          pos(score(name, q)),
          pos(score(t.description, q)),
          pos(score(String(t.amount || ""), q))
        );
        if (sc > 2) return;
        var cat = CBA.data.findCategory ? CBA.data.findCategory(t.categoryId) : null;
        var amount = t.amount ? "₪" + Number(t.amount).toLocaleString("he-IL") : "";
        out.push({ g: "הוצאות", sc: sc, icon: ICO.money,
          label: name || ("הוצאה #" + t.id),
          sub: [cat && cat.name, amount].filter(Boolean).join(" · "),
          run: function () { openExpenses({ text: name }); } });
      });
    }

    /* 4. שכנים */
    (dirRows || []).forEach(function (r) {
      if (String(fld(r, "סטטוס")).indexOf("עזב") !== -1) return;
      var family = fld(r, "משפחה");
      var firsts = flds(r, "שם פרטי").join(" ו");
      var house  = fld(r, "בית");
      var phones = flds(r, "טלפון");
      var title  = ["משפחת " + family, firsts].filter(function (x) { return x && x !== "משפחת "; }).join(" · ");
      var sc = Math.min(pos(score(family, q)), pos(score(firsts, q)), pos(score(house, q)),
                        pos(score(phones.join(" "), q)));
      if (sc > 2) return;
      out.push({ g: "שכנים", sc: sc, icon: ICO.person,
        label: title || family || firsts,
        sub: [house ? "בית " + house : "", phones[0] || ""].filter(Boolean).join(" · "),
        run: function () { var s = directoryScreen(); if (s) go(s); } });
    });

    /* מיון: קודם חוזק ההתאמה, ואז אלפביתי — כדי שאותה שאילתה תמיד תיתן
       בדיוק את אותה רשימה ובאותו סדר. */
    out.sort(function (a, b) {
      if (a.sc !== b.sc) return a.sc - b.sc;
      return a.label.localeCompare(b.label, "he");
    });

    /* עד 5 מכל קבוצה, ועד 14 בסך הכול — רשימה ארוכה יותר כבר לא נסרקת בעין */
    var per = {}, capped = [];
    out.forEach(function (r) {
      per[r.g] = (per[r.g] || 0) + 1;
      if (per[r.g] <= 5 && capped.length < 14) capped.push(r);
    });
    return capped;
  }
  function pos(n) { return n < 0 ? 99 : n; }

  function openExpenses(opts) {
    if (CBA.screens && CBA.screens.expenses && CBA.screens.expenses.focusSearch) {
      CBA.screens.expenses.focusSearch(opts);
    } else {
      go("expenses");
    }
  }

  /* ------------------------------------------------------------------ ציור */
  function render() {
    var q = norm(inputEl.value);
    if (!q) {
      results = []; sel = 0;
      listEl.innerHTML =
        '<div class="gs-hint">' +
          '<div class="gs-hint__t">מה מחפשים?</div>' +
          '<div class="gs-hint__l">שם של מסך · סעיף תקציב · ספק או הוצאה · שם משפחה או מספר בית</div>' +
        '</div>';
      return;
    }
    results = collect(q);
    if (!results.length) {
      listEl.innerHTML = '<div class="gs-hint"><div class="gs-hint__t">לא נמצא כלום</div>' +
        '<div class="gs-hint__l">נסו מילה אחת בלבד, או חלק מהשם</div></div>';
      return;
    }
    if (sel >= results.length) sel = results.length - 1;

    var html = "", lastG = "";
    results.forEach(function (r, i) {
      if (r.g !== lastG) { html += '<div class="gs-group">' + esc(r.g) + '</div>'; lastG = r.g; }
      html += '<button type="button" class="gs-item' + (i === sel ? " is-sel" : "") + '" data-i="' + i + '">' +
        '<span class="gs-item__ico">' + ico(r.icon) + '</span>' +
        '<span class="gs-item__txt"><b>' + mark(r.label, q) + '</b>' +
          (r.sub ? '<small>' + esc(r.sub) + '</small>' : "") + '</span>' +
        '</button>';
    });
    listEl.innerHTML = html;
  }

  function move(d) {
    if (!results.length) return;
    sel = (sel + d + results.length) % results.length;
    render();
    var cur = listEl.querySelector(".gs-item.is-sel");
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest" });
  }

  function activate(i) {
    var r = results[i];
    if (!r) return;
    close();
    r.run();
  }

  /* ------------------------------------------------------------ פתיחה/סגירה */
  function open() {
    if (el) { inputEl.focus(); inputEl.select(); return; }
    lastFocus = document.activeElement;

    el = document.createElement("div");
    el.className = "gs";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "חיפוש");
    el.innerHTML =
      '<div class="gs-card">' +
        '<div class="gs-top">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>' +
          '<input class="gs-input" id="gs-input" type="search" autocomplete="off" placeholder="חיפוש בכל האפליקציה" aria-label="חיפוש">' +
          '<button type="button" class="gs-esc" data-gs-close>סגור</button>' +
        '</div>' +
        '<div class="gs-list" id="gs-list"></div>' +
      '</div>';
    document.body.appendChild(el);
    document.body.classList.add("gs-open");

    inputEl = el.querySelector("#gs-input");
    listEl = el.querySelector("#gs-list");

    el.addEventListener("click", function (e) {
      if (e.target === el || e.target.closest("[data-gs-close]")) { close(); return; }
      var it = e.target.closest(".gs-item");
      if (it) activate(parseInt(it.dataset.i, 10));
    });
    el.addEventListener("mousemove", function (e) {
      var it = e.target.closest(".gs-item");
      if (!it) return;
      var i = parseInt(it.dataset.i, 10);
      if (i !== sel) { sel = i; render(); }
    });
    inputEl.addEventListener("input", function () { sel = 0; render(); });
    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      else if (e.key === "Enter") { e.preventDefault(); activate(sel); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });

    render();
    inputEl.focus();
    loadDirectoryOnce();
  }

  function close() {
    if (!el) return;
    el.remove();
    el = null; inputEl = null; listEl = null; results = []; sel = 0;
    document.body.classList.remove("gs-open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* מדריך התושבים נטען פעם אחת בפתיחה הראשונה. אם המשתמש לא מחובר או שאין
     חיבור — פשוט אין קבוצת "שכנים", בלי הודעת שגיאה שתפריע לחיפוש עצמו. */
  function loadDirectoryOnce() {
    if (dirAsked || dirRows) return;
    if (!window.CBA.authSession) return;
    if (!(CBA.data && CBA.data.getCommunityDirectory)) return;
    dirAsked = true;
    CBA.data.getCommunityDirectory(function (res) {
      if (res && res.ok) dirRows = res.rows || [];
      if (el) render();
    });
  }

  /* קיצור מקלדת גלובלי — Ctrl+K או ⌘K, כמו בכל כלי אחר שיועד מכיר */
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      if (el) close(); else open();
    }
  });

  return { open: open, close: close, isOpen: function () { return !!el; } };
})();
