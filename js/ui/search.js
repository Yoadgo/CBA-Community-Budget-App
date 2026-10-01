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
  /* SRB1 (גל 9, 1.10.26) — המדריך שייך לסשן שטען אותו. התנתקות/משתמש אחר במכשיר משותף ⇒ נזרק ולא מוצג. */
  var dirOwner = "";
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

  /* SRB3 (גל 9, 1.10.26) — אותו נירמול בדיוק כמו norm(), אבל עם מפה מכל תו מנורמל לאינדקס שלו במקור,
     כדי שההדגשה תיפול במקום הנכון גם כשהתווית מכילה גרשיים/רווחים כפולים (תשפ"ז). */
  function normMap(s) {
    s = String(s == null ? "" : s);
    var t = "", map = [], prevSpace = true;   // true בהתחלה = trim משמאל
    for (var i = 0; i < s.length; i++) {
      var lc = s.charAt(i).toLowerCase();
      for (var j = 0; j < lc.length; j++) {
        var c = lc.charAt(j);
        if (/["'`״׳]/.test(c)) continue;
        if (/\s/.test(c)) { if (prevSpace) continue; c = " "; prevSpace = true; }
        else prevSpace = false;
        t += c; map.push(i);
      }
    }
    if (t.charAt(t.length - 1) === " ") { t = t.slice(0, -1); map.pop(); }   // trim מימין
    return { t: t, map: map };
  }

  /* הדגשת החלק התואם בתוך התווית */
  function mark(text, q) {
    var s = String(text == null ? "" : text);
    var n = normMap(s);   // SRB3 (גל 9, 1.10.26) — אינדקסים של המקור, לא של הטקסט המנורמל
    var i = q ? n.t.indexOf(q) : -1;
    if (i < 0) return esc(s);
    var a = n.map[i], b = n.map[i + q.length - 1] + 1;
    return esc(s.slice(0, a)) + '<mark>' + esc(s.slice(a, b)) + '</mark>' + esc(s.slice(b));
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
    person: '<circle cx="12" cy="8.5" r="3.4"/><path d="M5 20a7 7 0 0 1 14 0"/>',
    ask:    '<path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'
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

    /* ⚠️ בלי הבדיקה הזו, כשנתוני התקציב לא נטענו החיפוש היה מציע סעיפים
       והוצאות מתוך נתוני הדמו של mock.js — תוצאות שנראות אמיתיות לגמרי
       ומובילות למסך ריק (2026-09-14). */
    var haveBudget = !(window.CBA && CBA.sheets) || CBA.sheets.isConnected();
    var canExpenses = hasTarget("expenses") && haveBudget;

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
    /* SRB2 (גל 9, 1.10.26) — רק למי שיש לו מסך תושבים (לא לגנן חיצוני וכד'); SRB1 — ורק מהמדריך של הסשן הנוכחי. */
    var dirOk = !!directoryScreen() && dirFresh();
    (dirOk ? dirRows || [] : []).forEach(function (r) {
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
        /* SRA1 (גל 12, אושר 1.10.26) — המדריך נפתח כבר מסונן למשפחה הזו */
        run: function () { openDirectory(family || house || firsts); } });
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

  function openDirectory(q) {
    var s = directoryScreen();
    if (!s) return;
    var scr = CBA.screens && CBA.screens[s];
    if (scr && scr.focusSearch) scr.focusSearch(q);
    else go(s);
  }

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
          '<div class="gs-hint__l">שם של מסך · סעיף תקציב · ספק או הוצאה · שם משפחה או מספר בית — או שאלה, כמו "כמה הוצאנו על גינון ביוני?"</div>' +
        '</div>';
      return;
    }
    results = collect(q);
    /* SRA2 (גל 15) — שאלה חופשית: שורה ראשונה "✨ לשאול" (גם כשאין תוצאות) */
    var raw = String(inputEl.value || "").trim();
    if (canAsk() && (isQuestion(raw) || (!results.length && raw.split(/\s+/).length >= 2))) {
      results.unshift({ g: "שאלה", sc: -1, icon: ICO.ask, label: "לשאול: " + raw,
        sub: "תשובה מהנתונים שבאפליקציה, או לאיזה מסך ללכת", ask: raw });
    }
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
    if (r.ask) { ask(r.ask); return; }   /* SRA2 — נשארים בחלון ומציגים תשובה */
    close();
    r.run();
  }

  /* ------------------------------------------------- SRA2 — שאלה חופשית (גל 15)
     ה-AI רק מפענח את השאלה (כוונה · סעיף · חודשים · מסך) — ר' searchQuestion
     ב-Code.gs. **הסכום מחושב כאן** מההוצאות שכבר טעונות, כך שהמספר מדויק ואף
     נתון כספי לא נשלח החוצה. */
  var QWORDS = /^(כמה|מתי|איך|איפה|מה|מי|למה|האם|באיזה|לאן|על כמה|כמה כסף)\s/;
  function isQuestion(raw) {
    return raw.split(/\s+/).length >= 2 && (/[?？]/.test(raw) || QWORDS.test(raw));
  }
  function canAsk() { return !!(CBA.data && CBA.data.aiExtract) && !gated(); }
  function money(n) { return "₪" + Math.round(n).toLocaleString("he-IL"); }
  function monthLabel(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym || "");
    if (!m) return "";
    var names = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
    return names[+m[2] - 1] + " " + m[1];
  }
  function spendAnswer(f) {
    var cats = CBA.data.getCategories() || [];
    var cat = f.category ? cats.filter(function (c) { return c.name === f.category; })[0] : null;
    var from = f.monthFrom || "", to = f.monthTo || f.monthFrom || "";
    if (from && to && from > to) { var x = from; from = to; to = x; }
    /* כמו מסך התקציב: "הוצאנו" = אושר (הועבר להנה"ח / שולם). ממתינות — בנפרד. */
    var tot = 0, pend = 0, n = 0;
    (CBA.data.getTransactions() || []).forEach(function (t) {
      if (cat && t.categoryId !== cat.id) return;
      var ym = String(t.date || t.month || "").slice(0, 7);
      if (from && (!ym || ym < from || ym > to)) return;
      var a = Number(t.amount) || 0;
      if (t.status === "ready" || t.status === "paid") { tot += a; n++; }
      else if (t.status === "submitted" || t.status === "review") pend += a;
    });
    var fm = (CBA.data.getFiscalMonths ? CBA.data.getFiscalMonths() : []) || [];
    if (from && fm.length === 12 && (to < fm[0].key || from > fm[11].key)) {
      return { head: "החודשים האלה לא בשנת " + (CBA.data.getCurrentYear ? CBA.data.getCurrentYear() : "") + " שמוצגת עכשיו.",
        sub: "אפשר לבחור את השנה במסך ההוצאות ולשאול שוב.", btn: "לפתוח בהוצאות",
        run: function () { openExpenses(cat ? { category: cat.id } : {}); } };
    }
    var when = !from ? "" : (from === to ? " ב" + monthLabel(from) : " מ" + monthLabel(from) + " עד " + monthLabel(to));
    var yr = CBA.data.getCurrentYear ? CBA.data.getCurrentYear() : "";
    var head = (cat ? "על " + cat.name : "בסך הכול") + when + ": " + money(tot) + " (" + n + " הוצאות)";
    var sub = (pend ? "ועוד " + money(pend) + " בבקשות שממתינות לאישור. " : "") +
      "לפי תאריך הרכישה, בנתוני שנת " + yr + " שטעונים עכשיו (הוצאות שאושרו, כמו במסך התקציב).";
    return { head: head, sub: sub, btn: "לפתוח בהוצאות", run: function () { openExpenses(cat ? { category: cat.id } : {}); } };
  }
  function ask(q) {
    var canExp = hasTarget("expenses") && (!(window.CBA && CBA.sheets) || CBA.sheets.isConnected());
    var targets = navTargets();
    listEl.innerHTML = '<div class="gs-ans"><div class="gs-ans__k">✨ חושב…</div></div>';
    results = []; sel = 0;
    CBA.data.aiExtract("searchQuestion", { text: q, options: {
      categories: canExp ? (CBA.data.getCategories() || []).map(function (c) { return c.name; }) : [],
      screens: targets.map(function (t) { return t.label; }) } }, function (res) {
      if (!listEl || !inputEl || String(inputEl.value || "").trim() !== q) return;   // החלון נסגר / השאלה השתנתה
      var f = (res && res.ok && res.fields) || {}, a = null;
      if (f.intent === "spend" && canExp) a = spendAnswer(f);
      else if (f.intent === "screen" && f.screen) {
        var tg = targets.filter(function (t) { return t.label === f.screen; })[0];
        if (tg) a = { head: f.answer || ("זה במסך " + tg.label), sub: "", btn: "למסך " + tg.label, run: function () { go(tg.key); } };
      }
      if (!a) {
        listEl.innerHTML = '<div class="gs-ans"><div class="gs-ans__h">' +
          esc(res && !res.ok && res.error ? res.error : "לא בטוח מה לענות על זה.") + '</div>' +
          '<div class="gs-ans__s">נסו לנסח אחרת, או לחפש מילה אחת.</div></div>';
        return;
      }
      listEl.innerHTML = '<div class="gs-ans"><div class="gs-ans__k">✨ תשובה</div>' +
        '<div class="gs-ans__h">' + esc(a.head) + '</div>' +
        (a.sub ? '<div class="gs-ans__s">' + esc(a.sub) + '</div>' : '') +
        '<button type="button" class="btn-primary btn-sm gs-ans__go">' + esc(a.btn) + '</button></div>';
      listEl.querySelector(".gs-ans__go").addEventListener("click", function () { close(); a.run(); });
    });
  }

  /* ------------------------------------------------------------ פתיחה/סגירה */
  function open() {
    /* SRB1 (גל 9, 1.10.26) — אין חיפוש מעל שער הכניסה / בלי סשן. */
    if (gated()) { close(); return; }
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
    dirFresh();   // SRB1 (גל 9, 1.10.26) — מדריך של סשן קודם נזרק לפני כל דבר
    if (dirAsked || dirRows) return;
    if (!window.CBA.authSession) return;
    if (!directoryScreen()) return;   // SRB2 (גל 9, 1.10.26) — בלי מסך תושבים אין סיבה למשוך את המדריך
    if (!(CBA.data && CBA.data.getCommunityDirectory)) return;
    dirAsked = true;
    var askedFor = window.CBA.authSession;   // SRB1 (גל 9, 1.10.26)
    dirOwner = askedFor;
    CBA.data.getCommunityDirectory(function (res) {
      /* SRB1 (גל 9, 1.10.26) — תשובה שהגיעה אחרי התנתקות/החלפת משתמש לא נשמרת */
      if (window.CBA.authSession !== askedFor || dirOwner !== askedFor) return;
      if (res && res.ok) dirRows = res.rows || [];
      if (el) render();
    });
  }

  /* SRB1 (גל 9, 1.10.26) — "מחובר?" = יש סשן ושער הכניסה לא מוצג. */
  function gated() {
    return !window.CBA.authSession || !!(document.body && document.body.classList.contains("is-gated"));
  }
  /* SRB1 (גל 9, 1.10.26) — המדריך שבזיכרון שייך לסשן הנוכחי? אם לא (התנתקות/משתמש אחר) — נזרק. */
  function dirFresh() {
    var sess = window.CBA.authSession || "";
    if (!sess || dirOwner !== sess) { dirRows = null; dirAsked = false; dirOwner = ""; return false; }
    return true;
  }

  /* קיצור מקלדת גלובלי — Ctrl+K או ⌘K, כמו בכל כלי אחר שיועד מכיר */
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
      if (gated()) { close(); return; }   // SRB1 (גל 9, 1.10.26) — לא על שער הכניסה
      e.preventDefault();
      if (el) close(); else open();
    }
  });

  /* SRB1 (גל 9, 1.10.26) — כששער הכניסה עולה (התנתקות/פג סשן): סוגרים חיפוש פתוח וזורקים את המדריך. */
  function watchGate() {
    if (!document.body || !window.MutationObserver) return;
    new MutationObserver(function () {
      if (!document.body.classList.contains("is-gated")) return;
      close();
      dirRows = null; dirAsked = false; dirOwner = "";
    }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.body) watchGate();
  else document.addEventListener("DOMContentLoaded", watchGate);

  return { open: open, close: close, isOpen: function () { return !!el; } };
})();
