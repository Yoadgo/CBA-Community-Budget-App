/* tour.js — סיור היכרות (2026-08-28)
   ============================================================================
   חפיסת מסכים בסגנון הפעלה של מכשיר חדש: מסך מלא, רעיון אחד לכרטיס, "הבא",
   ו"דלג" שתמיד זמין.

   למה חפיסה ולא חיצים על הממשק האמיתי: חיצים מעוגנים לאלמנטים, וכל שינוי
   בשורת הניווט או במיקום כפתור הופך אותם לחיצים שמצביעים על אוויר — בשקט,
   בלי שגיאה, עד שתושב מתלונן. באפליקציה הזאת שורת הניווט זזה שלוש פעמים
   בחודש. חפיסה לא יודעת כלום על המבנה ולכן לא נשברת.

   שלושה מצבים:
     • כניסה ראשונה (seen = 0)      → הסיור המלא נפתח מעצמו, פעם אחת.
     • יש צעדים חדשים (גרסה > seen) → **לא** משתלט על המסך. כרטיס קטן בעמוד
                                       הקבלה, והמשתמש מחליט.
     • מתפריט המשתמש               → הסיור המלא, מתי שרוצים.

   התוכן כולו מהגיליון (טאב "סיור היכרות", ר' Code.gs). הקובץ הזה לא מכיר אף
   טקסט חוץ מכפתורי הניווט — הוספת פיצ'ר חדש לסיור היא שורה בגיליון, לא קוד.

   המחשות (2026-09-23, גרסה 4 של הסיור): עמודה "המחשה" בגיליון. כשיש בה
   מפתח מוכר (ר' VIS למטה) — במקום האייקון מופיע "חלק מסך": העתק קטן של
   הכפתורים והכרטיסים מהאפליקציה, עם נתוני דוגמה. תא ריק = אייקון, כמו תמיד.
   ========================================================================== */
window.CBA = window.CBA || {};

CBA.tour = (function () {
  "use strict";

  var steps = [];          // כל הצעדים שמתאימים לי (השרת כבר סינן לפי קהל)
  var seen = 0;            // הגרסה הגבוהה ביותר שכבר ראיתי
  var loaded = false, loading = false;
  var el = null, idx = 0, deck = [], lastFocus = null;
  var dir = 0;             // כיוון המעבר האחרון: 1 קדימה, -1 אחורה, 0 פתיחה — לאנימציית הכניסה
  var AUTO_KEY = "cba_tour_auto_v1";   // רשת ביטחון מקומית, ר' maybeAutoStart

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
  function num(v, d) { var n = parseInt(v, 10); return isNaN(n) ? (d || 0) : n; }
  function val(row, key) { return String(row[key] == null ? "" : row[key]).trim(); }

  var ICONS = {
    wave:    '<path d="M7 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M10 10.5V4a1.5 1.5 0 0 1 3 0v6.5"/><path d="M13 10.5V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2a1.5 1.5 0 0 1 3 0"/>',
    receipt: '<path d="M6 2h8l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M14 2v5h5"/><path d="M8.5 12.5h7M8.5 16h4.5"/>',
    key:     '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    map:     '<path d="m9 4-6 2.5v13L9 17l6 3 6-2.5v-13L15 7z"/><path d="M9 4v13M15 7v13"/>',
    shield:  '<path d="M12 2.8 4.8 5.6v5.9c0 4.3 2.9 8.3 7.2 9.7 4.3-1.4 7.2-5.4 7.2-9.7V5.6z"/><path d="m9 12 2.1 2.1L15.2 10"/>',
    phone:   '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M12 7.5v7M9 11.5l3 3 3-3"/>',
    star:    '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
    // עלה — מודול "מראה שיכון" (2026-09-07). אותו סמליל בדיוק כמו הטאב עצמו,
    // כדי שכרטיס הסיור והיעד שהוא מפנה אליו ייראו כמו אותו דבר.
    leaf:    '<path d="M11 20a10 10 0 0010-10 25.9 25.9 0 00-1.04-7.281 1 1 0 00-1.755-.325C15.833 5.5 13 5.5 9.8 6.1A7 7 0 0011 20"/><path d="M2 21a5 5 0 012.911-4.544C7.613 15.212 8.351 15.24 11 13"/>',
    // 2026-09-23 — שלושה סמלילים לצעדי גרסה 4 (התראות, שכנים, לוח אירועים).
    // "key" הוא בעצם לוח שנה (שם היסטורי) — calendar הוא אותו ציור בשם נכון.
    bell:     '<path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5c0 5.5-2.5 7.5-2.5 7.5h16s-2.5-2-2.5-7.5A5.5 5.5 0 0 0 12 3.5z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
    people:   '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.8-4 3.2-6 6-6s5.2 2 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14c2.3.2 4 1.9 4.5 5"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'
  };
  function svg(name, size) {
    var d = ICONS[name] || ICONS.star, n = size || 44;
    return '<svg viewBox="0 0 24 24" width="' + n + '" height="' + n + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>';
  }

  /* ------------------------------------------------- המחשות (2026-09-23) ---
     "חלק מסך": העתק קטן וחי של כפתור או כרטיס מתוך האפליקציה, עם נתוני דוגמה.
     מופיע במקום האייקון כשבעמודה "המחשה" בגיליון רשום אחד המפתחות כאן:
       map · directory · services · events · garden · receipts · profile ·
       report · push
     מפתח לא מוכר או תא ריק ⇒ האייקון הרגיל, בדיוק כמו קודם. כלומר צעד חדש
     עדיין לא דורש קוד — רק צעד שרוצים לו המחשה חדשה.

     כל המחשה היא { html, play, tap }:
       html()          — הציור.
       play(root)      — "הדגמה" שרצה פעם אחת כשהכרטיס נפתח (לייק שנלחץ, לוח
                         שמסתנן, התראה שיורדת). כל ההשהיות עוברות דרך later(),
                         ולכן מעבר כרטיס או סגירה מבטלים אותן בבת אחת.
       tap(t, root)    — אותו דבר, כשהתושב עצמו לוחץ. t = האלמנט שנלחץ.
     ⚠️ הכול משחק בתוך הכרטיס בלבד — שום לחיצה כאן לא שומרת, לא שולחת ולא
        מנווטת. זה "לנסות את הכפתור" ולא הכפתור האמיתי.
     ⚠️ מחלקות משלו (trv-*) ולא המחלקות של המסכים האמיתיים — שינוי עיצוב
        במסך לא ישבור את הסיור בשקט (אותה סיבה שהסיור הוא חפיסה ולא חיצים).
        המחיר: כשמסך משנה שפת עיצוב מהותית, לעדכן גם את ההמחשה שלו כאן.
     ⚠️ כל השמות והמספרים כאן בדויים וקבועים — לעולם לא נתוני תושבים.
     ⚠️ prefers-reduced-motion: ההדגמות לא רצות, ומוצג ישר המצב הסופי. */
  var REDUCED = false;
  try { REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var timers = [];
  function later(ms, fn) { timers.push(setTimeout(fn, REDUCED ? 0 : ms)); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function q(root, sel) { return root.querySelector(sel); }
  function qa(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  /* מפעיל מחדש אנימציית CSS של מחלקה (הסרה → reflow → הוספה). */
  function replay(node, cls) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
  }
  /* "לחיצה" מדומה — אותו אפקט לחיצה שרואים כשהתושב לוחץ בעצמו. */
  function press(node) { replay(node, "is-press"); }
  function floatTxt(node, txt, cls) {
    if (!node || REDUCED) return;
    var f = document.createElement("span");
    f.className = "trv-float " + (cls || "");
    f.textContent = txt;
    node.appendChild(f);
    setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 900);
  }

  var VI = {
    like: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v11M2 10h5v11H2zM7 10l4.5-7a1.5 1.5 0 0 1 2.6.9v4.6H19a2 2 0 0 1 2 2.4l-1.4 6a2 2 0 0 1-2 1.6H7"/></svg>',
    dis:  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14V3M22 14h-5V3h5zM17 14l-4.5 7a1.5 1.5 0 0 1-2.6-.9v-4.6H5a2 2 0 0 1-2-2.4l1.4-6a2 2 0 0 1 2-1.6H17"/></svg>',
    com:  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z"/></svg>',
    bellOff: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a4 4 0 0 0-4 4c0 4.2-1.8 5.6-1.8 6.8h11.6c0-1.2-1.8-2.6-1.8-6.8a4 4 0 0 0-4-4z"/><path d="M10 17.5a2 2 0 0 0 4 0"/><line x1="3.5" y1="3.5" x2="20.5" y2="20.5"/></svg>',
    bellOn: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5a4 4 0 0 0-4 4c0 4.2-1.8 5.6-1.8 6.8h11.6c0-1.2-1.8-2.6-1.8-6.8a4 4 0 0 0-4-4z"/><path d="M10 17.5a2 2 0 0 0 4 0"/></svg>',
    logo: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M7 16v-4M12 16V8M17 16v-6"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    kids: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="7" r="2.5"/><circle cx="16" cy="8.5" r="2"/><path d="M3.5 19c.6-3.3 2.4-5 4.5-5s3.9 1.7 4.5 5M12.8 19c.4-2.4 1.6-3.8 3.2-3.8s2.8 1.4 3.2 3.8"/></svg>',
    role: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="2.5"/><circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="18" r="2.5"/><path d="M12 8.5V12M5.5 15.5V13h13v2.5"/></svg>'
  };

  /* ---------------------------------------------------------- מפה --- */
  var MAP_FAM = { 101: ["לוי", "דנה ואורי"], 103: ["מזרחי", "רותם"], 105: ["אברהם", "שני ויואב"],
    201: ["פרץ", "מיכל ורן"], 203: ["גולן", "נטע"], 102: ["ביטון", "הדס ואלון"], 104: ["שפירא", "ליאת"],
    106: ["דהן", "עדי ותומר"], 307: ["קפלן", "נועם"], 108: ["סויסה", "אורית"], 110: ["בר", "גל ושחר"],
    305: ["כהן", "יעל ועומר"] };
  var MAP_HOUSES = [[40, 12, 101], [82, 12, 103], [124, 12, 105], [236, 12, 201], [278, 12, 203],
    [40, 62, 102], [82, 62, 104], [124, 62, 106], [278, 62, 307], [40, 104, 108], [82, 104, 110]];
  function mapPop(root, n) {
    var pop = q(root, ".trv-pop"), f = MAP_FAM[n];
    if (!pop || !f) return;
    pop.innerHTML = '<span class="trv-pill">בית ' + n + (n === 305 ? ' · הבית שלי' : '') + '</span>' +
      '<b>משפחת ' + f[0] + ' <small>(' + f[1] + ')</small></b>' +
      '<span class="trv-phone">' + VI.phone + '05X-000-0000</span>';
    replay(pop, "is-in");
    qa(root, ".trv-h").forEach(function (g) { g.classList.toggle("is-sel", +g.getAttribute("data-h") === n); });
  }
  function mapFocus(root, g) {
    var map = q(root, ".trv-map"), cur = map.getAttribute("data-f");
    var next = cur === g ? "" : g;
    map.setAttribute("data-f", next);
    qa(root, "[data-v-chip]").forEach(function (c) { c.classList.toggle("is-on", c.getAttribute("data-v-chip") === next); });
  }
  function mapHouse(x, y, n, i) {
    var mine = n === 305;
    return '<g class="trv-h' + (mine ? ' is-mine' : '') + '" data-h="' + n + '" style="--i:' + i + '">' +
      (mine ? '<rect x="' + (x - 4) + '" y="' + (y - 4) + '" width="42" height="30" rx="6" class="trv-ring"/>' : '') +
      '<rect x="' + x + '" y="' + y + '" width="34" height="22" rx="3" class="trv-mh"/>' +
      '<text x="' + (x + 17) + '" y="' + (y + 14.5) + '" class="trv-mn">' + n + '</text></g>';
  }

  /* ---------------------------------------------------- שירותים --- */
  function svcCount(btn, d) {
    var c = btn.querySelector("b"); c.textContent = String((parseInt(c.textContent, 10) || 0) + d);
  }
  function svcVote(btn) {
    var card = btn.closest(".trv-card"), kind = btn.getAttribute("data-v-react");
    var other = card.querySelector('[data-v-react="' + (kind === "like" ? "dis" : "like") + '"]');
    press(btn);
    if (btn.classList.contains("is-on")) { btn.classList.remove("is-on"); svcCount(btn, -1); return; }
    if (other.classList.contains("is-on")) { other.classList.remove("is-on"); svcCount(other, -1); }
    btn.classList.add("is-on"); svcCount(btn, 1);
    floatTxt(btn, "+1", kind === "like" ? "is-ok" : "is-bad");
  }
  function svcReacts(l, d, c, on) {
    return '<div class="trv-reacts">' +
      '<button type="button" tabindex="-1" class="trv-react trv-react--like' + (on ? ' is-on' : '') + '" data-v-react="like">' + VI.like + '<b>' + l + '</b></button>' +
      '<button type="button" tabindex="-1" class="trv-react trv-react--dis" data-v-react="dis">' + VI.dis + '<b>' + d + '</b></button>' +
      '<span class="trv-react trv-react--com">' + VI.com + c + '</span></div>';
  }

  /* --------------------------------------------------- הפרטים שלי --- */
  var SLOTS = [
    { phone: "052-000-0000", dob: "03.02.1988" },
    { phone: "054-000-0000", dob: "14.05.1986" }
  ];
  function profileSlot(root, i) {
    var seg = q(root, ".trv-seg");
    if (!seg || seg.getAttribute("data-slot") === String(i)) return;
    seg.setAttribute("data-slot", String(i));
    qa(root, "[data-v-slot]").forEach(function (s) { s.classList.toggle("is-on", s.getAttribute("data-v-slot") === String(i)); });
    q(root, "[data-v-phone]").textContent = SLOTS[i].phone;
    q(root, "[data-v-dob]").textContent = SLOTS[i].dob;
    qa(root, ".trv-field").forEach(function (f) { replay(f, "is-swap"); });
  }

  /* ------------------------------------------------------ התראות --- */
  var PUSH_MSGS = [["השריון אושר", "שריון המועדון שלך ל-2.10 אושר"],
                   ["ההחזר שלך אושר", "₪240 בדרך אליך — קבלה #1042"]];
  function pushSet(root, on) {
    var tile = q(root, ".trv-tile"), ban = q(root, ".trv-banner");
    tile.classList.toggle("is-on", on);
    q(root, ".trv-tile__d").innerHTML = on ? VI.bellOn : VI.bellOff;
    q(root, ".trv-tile__l").textContent = on ? "התראות Push פעילות" : "הפעלת התראות Push";
    if (on) { replay(q(root, ".trv-tile__d"), "is-ring"); ban.classList.add("is-in"); pushCycle(root, 0); }
    else ban.classList.remove("is-in");
  }
  function pushCycle(root, i) {
    var t = q(root, ".trv-banner__t"), m = PUSH_MSGS[i % PUSH_MSGS.length];
    t.innerHTML = '<small><span>ניהול קהילה</span><span>עכשיו</span></small><b>' + m[0] + '</b>' + m[1];
    replay(q(root, ".trv-banner"), "is-bump");
    later(2800, function () { if (q(root, ".trv-tile.is-on")) pushCycle(root, i + 1); });
  }

  /* ------------------------------------------------------- גינון --- */
  function typeInto(root, sel, text, start, step) {
    var out = q(root, sel), box = out.closest(".trv-search, .trv-rep__item");
    out.textContent = ""; box.classList.remove("has-q");
    later(start, function () { box.classList.add("is-typing"); });
    text.split("").forEach(function (ch, i) {
      later(start + 120 + i * step, function () { out.textContent += ch; box.classList.add("has-q"); });
    });
    later(start + 120 + text.length * step + 200, function () { box.classList.remove("is-typing"); });
    return start + 120 + text.length * step + 200;
  }
  function gardenCat(root, c) {
    qa(root, "[data-v-gcat]").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-v-gcat") === c); });
  }
  function gardenPin(root, x, y) {
    var pin = q(root, ".trv-pin");
    pin.setAttribute("transform", "translate(" + Math.round(x) + " " + Math.round(y) + ")");
    pin.classList.add("is-on");
    replay(q(root, ".trv-pin__b"), "is-drop");
    q(root, ".trv-gmap").classList.add("has-pin");
  }
  function gardenPhoto(root, on) {
    q(root, ".trv-gph").classList.toggle("is-on", on);
    q(root, "[data-v-photo]").textContent = on ? "✕" : "+";
  }
  function gardenSend(root) {
    var btn = q(root, "[data-v-gsend]"), steps = qa(root, ".trv-gtrail .trv-step"), dashes = qa(root, ".trv-gtrail .trv-dash");
    press(btn);
    btn.classList.add("is-done"); btn.textContent = "✓ נשלח";
    steps.forEach(function (s) { s.classList.remove("is-done", "is-now"); });
    dashes.forEach(function (d) { d.classList.remove("is-full"); });
    later(350,  function () { steps[0].classList.add("is-done"); });
    later(650,  function () { dashes[0].classList.add("is-full"); });
    later(1000, function () { steps[1].classList.add("is-done"); });
    later(1300, function () { dashes[1].classList.add("is-full"); });
    later(1650, function () { steps[2].classList.add("is-done"); floatTxt(steps[2], "🌱", "is-emoji"); });
  }
  function gardenReset(root) {
    gardenCat(root, ""); gardenPhoto(root, false);
    q(root, ".trv-pin").classList.remove("is-on"); q(root, ".trv-gmap").classList.remove("has-pin");
    var btn = q(root, "[data-v-gsend]"); btn.classList.remove("is-done"); btn.textContent = "שליחה";
    qa(root, ".trv-gtrail .trv-step").forEach(function (s) { s.classList.remove("is-done", "is-now"); });
    qa(root, ".trv-gtrail .trv-dash").forEach(function (d) { d.classList.remove("is-full"); });
  }

  /* ------------------------------------------------- כפתור הדיווח --- */
  var REP_TXT = { bug: "הכפתור בלוח האירועים לא נלחץ באייפון", idea: "כדאי תזכורת יום לפני כל אירוע" };
  var REP_FAB = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"/></svg>';
  function repState(root, st) {
    var r = q(root, ".trv-rep");
    ["is-menu", "is-form", "is-shot", "is-sent"].forEach(function (c) { r.classList.remove(c); });
    (st || []).forEach(function (c) { r.classList.add(c); });
  }
  function repOpenForm(root, kind, t0) {
    q(root, ".trv-rep__title").textContent = kind === "idea" ? "הצעת ייעול לאפליקציה" : "דיווח על תקלה";
    var b = q(root, "[data-v-rsend]"); b.textContent = "שליחה"; b.classList.remove("is-done");
    repState(root, ["is-form"]);
    var end = typeInto(root, "[data-v-rtext]", REP_TXT[kind === "idea" ? "idea" : "bug"], t0 || 250, 55);
    later(end + 250, function () { repState(root, ["is-form", "is-shot"]); });
    return end + 250;
  }
  function repSend(root) {
    var b = q(root, "[data-v-rsend]");
    press(b); b.classList.add("is-done"); b.textContent = "✓ נשלח";
    later(300, function () { repState(root, ["is-form", "is-shot", "is-sent"]); });
  }

  var VIS = {
    map: {
      html: function () {
        var h = "";
        MAP_HOUSES.forEach(function (a, i) { h += mapHouse(a[0], a[1], a[2], i); });
        return '<div class="trv-search">' + VI.search + '<span>חיפוש לפי מספר בית, שם משפחה או ילד…</span></div>' +
          '<div class="trv-map" data-f="">' +
            '<svg viewBox="0 0 400 136" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">' +
              '<rect width="400" height="136" class="trv-ground"/>' +
              '<g data-g="green"><rect x="150" y="96" width="36" height="34" rx="6" class="trv-lawn"/>' +
                '<circle cx="160" cy="106" r="6" class="trv-tree"/><circle cx="175" cy="118" r="7" class="trv-tree"/><circle cx="164" cy="124" r="5" class="trv-tree"/>' +
                '<circle cx="232" cy="118" r="7" class="trv-tree"/><circle cx="250" cy="110" r="5" class="trv-tree"/></g>' +
              '<g data-g="traffic"><g class="trv-road"><path d="M0 48H400M0 91H400M204 0V136"/></g>' +
                '<g class="trv-road-top"><path d="M0 48H400M0 91H400M204 0V136"/></g>' +
                '<rect x="330" y="100" width="52" height="28" rx="3" class="trv-park"/><text x="356" y="118" class="trv-pl">P</text></g>' +
              '<g data-g="homes">' + h + '</g>' +
              '<g data-g="public"><rect x="322" y="10" width="62" height="26" rx="4" class="trv-pub"/><text x="353" y="27" class="trv-pl">גן ילדים</text>' +
                '<rect x="322" y="58" width="62" height="28" rx="8" class="trv-pool"/><text x="353" y="76" class="trv-pl">בריכה</text></g>' +
              '<g data-g="shelter"><rect x="284" y="104" width="22" height="16" rx="3" class="trv-shelter"/><text x="295" y="115.5" class="trv-pl trv-pl--s">מיגונית</text></g>' +
              '<g data-g="homes">' + mapHouse(236, 62, 305, 11) +
                '<rect x="228" y="87" width="50" height="12" rx="6" class="trv-mine-bg"/><text x="253" y="95.6" class="trv-mine-t">הבית שלי</text></g>' +
            '</svg>' +
            '<div class="trv-pop"></div>' +
          '</div>' +
          '<div class="trv-chips">' +
            '<button type="button" tabindex="-1" class="trv-chip" data-v-chip="public">מבני ציבור</button>' +
            '<button type="button" tabindex="-1" class="trv-chip" data-v-chip="shelter">מיגוניות</button>' +
            '<button type="button" tabindex="-1" class="trv-chip" data-v-chip="traffic">תנועה וחנייה</button>' +
            '<button type="button" tabindex="-1" class="trv-chip" data-v-chip="green">ירק ועצים</button>' +
            '<span class="trv-hint">נסו ללחוץ על בית</span></div>';
      },
      play: function (root) {
        later(900, function () { mapPop(root, 305); });
        later(2300, function () { var c = q(root, '[data-v-chip="shelter"]'); press(c); mapFocus(root, "shelter"); });
        later(4200, function () { if (q(root, ".trv-map").getAttribute("data-f") === "shelter") mapFocus(root, "shelter"); });
      },
      tap: function (t, root) {
        var h = t.closest("[data-h]"), c = t.closest("[data-v-chip]");
        if (h) mapPop(root, +h.getAttribute("data-h"));
        else if (c) { press(c); mapFocus(root, c.getAttribute("data-v-chip")); }
      }
    },

    directory: {
      html: function () {
        function card(house, fam, names, role, kids, phone, i) {
          return '<div class="trv-dir" data-fam="' + fam + '" style="--i:' + i + '">' +
            '<span class="trv-pill">בית ' + house + '</span>' +
            '<b class="trv-dir__fam">משפחת ' + fam + ' <small>(' + names + ')</small></b>' +
            (role ? '<span class="trv-dir__line">' + VI.role + role + '</span>' : '') +
            '<span class="trv-dir__line">' + VI.kids + kids + '</span>' +
            '<button type="button" tabindex="-1" class="trv-phone" data-v-call>' + VI.phone + phone + '</button></div>';
        }
        return '<div class="trv-search" data-v-search>' + VI.search +
            '<span class="trv-typed" data-v-typed></span><span class="trv-caret"></span>' +
            '<span class="trv-ph">חיפוש לפי שם, בית או טלפון</span></div>' +
          '<div class="trv-two">' +
            card('214', 'לוי', 'דנה ואורי', 'דנה — ועד · תרבות', 'נועה (7), איתי (4)', '052-000-0000', 0) +
            card('305', 'כהן', 'יעל ועומר', '', 'אלה (9)', '054-000-0000', 1) +
          '</div>';
      },
      play: function (root) {
        var word = "כהן", box = q(root, "[data-v-search]"), out = q(root, "[data-v-typed]");
        out.textContent = ""; box.classList.remove("has-q");
        qa(root, ".trv-dir").forEach(function (d) { d.classList.remove("is-dim", "is-match"); });
        later(700, function () { box.classList.add("is-typing"); });
        word.split("").forEach(function (ch, i) {
          later(900 + i * 190, function () { out.textContent += ch; box.classList.add("has-q"); });
        });
        later(900 + word.length * 190 + 250, function () {
          box.classList.remove("is-typing");
          qa(root, ".trv-dir").forEach(function (d) {
            var hit = d.getAttribute("data-fam") === "כהן";
            d.classList.toggle("is-dim", !hit); d.classList.toggle("is-match", hit);
          });
        });
      },
      tap: function (t, root) {
        var call = t.closest("[data-v-call]");
        if (call) { press(call); floatTxt(call, "מחייג…", "is-ink"); return; }
        if (t.closest("[data-v-search]")) { clearTimers(); VIS.directory.play(root); }
      }
    },

    services: {
      html: function () {
        return '<div class="trv-row"><div class="trv-search">' + VI.search + '<span>חיפוש שירות, ספק או תוכן…</span></div>' +
            '<span class="trv-cta is-glow">+ הוספת המלצה</span></div>' +
          '<div class="trv-two">' +
            '<div class="trv-card" style="--i:0"><div class="trv-card__head"><span>🔥</span><b>גז דורגז</b></div><span class="trv-meta">ספקים ושירותים</span>' + svcReacts(12, 1, 4, true) + '</div>' +
            '<div class="trv-card" style="--i:1"><span class="trv-badge">המלצות תושבים</span><div class="trv-card__head"><span>🥬</span><b>הירקן של אבי</b></div><span class="trv-meta">ממליצים: משפחת כהן</span>' + svcReacts(9, 0, 3, false) + '</div>' +
          '</div>';
      },
      play: function (root) {
        later(1300, function () { var b = qa(root, '[data-v-react="like"]')[1]; if (b && !b.classList.contains("is-on")) svcVote(b); });
      },
      tap: function (t) {
        var b = t.closest("[data-v-react]");
        if (b) svcVote(b);
      }
    },

    events: {
      html: function () {
        var days = [["13", ""], ["14", "bd", "🎂 דנה"], ["15", ""], ["16", "com", "אסיפה כללית"],
                    ["17", ""], ["18", "kg", "חופש בגנים"], ["19", ""],
                    ["20", "kg", "חופש בגנים"], ["21", "hol", "ערב סוכות"], ["22", "com", "פיקניק קהילתי"],
                    ["23", ""], ["24", "bd", "🎂 איתי"], ["25", ""], ["26", ""]];
        var h = "";
        ["א", "ב", "ג", "ד", "ה", "ו", "ש"].forEach(function (d) { h += '<span class="trv-dow">' + d + '</span>'; });
        days.forEach(function (d, i) {
          h += '<span class="trv-day' + (d[0] === "23" ? " is-today" : "") + '" style="--i:' + i + '"><b>' + d[0] + '</b>' +
            (d[1] ? '<i class="trv-ev trv-ev--' + d[1] + '" data-c="' + d[1] + '">' + d[2] + '</i>' : '') + '</span>';
        });
        function chip(c, color, label) {
          return '<button type="button" tabindex="-1" class="trv-chip" data-v-cat="' + c + '"><i style="background:' + color + '"></i>' + label + '</button>';
        }
        return '<div class="trv-chips">' + chip("com", "#6366F1", "קהילה") + chip("hol", "#C2760A", "חגי ישראל") +
            chip("kg", "#7C5CC4", "חופשות גנים") + chip("bd", "#DB2777", "ימי הולדת") + '</div>' +
          '<div class="trv-cal" data-f="">' + h + '</div>' +
          '<div class="trv-row trv-row--start">' +
            '<button type="button" tabindex="-1" class="trv-cta" data-v-rsvp>אישור הגעה</button>' +
            '<span class="trv-menu-wrap"><button type="button" tabindex="-1" class="trv-line-btn" data-v-cal>הוספה ליומן ▾</button>' +
              '<span class="trv-menu"><span>Google Calendar</span><span>Apple Calendar</span></span></span>' +
          '</div>';
      },
      play: function (root) {
        later(1500, function () { var c = q(root, '[data-v-cat="bd"]'); press(c); VIS.events.filter(root, "bd"); });
        later(3700, function () { if (q(root, ".trv-cal").getAttribute("data-f") === "bd") VIS.events.filter(root, "bd"); });
      },
      filter: function (root, c) {
        var cal = q(root, ".trv-cal"), next = cal.getAttribute("data-f") === c ? "" : c;
        cal.setAttribute("data-f", next);
        qa(root, "[data-v-cat]").forEach(function (b) { b.classList.toggle("is-on", b.getAttribute("data-v-cat") === next); });
        qa(root, ".trv-ev").forEach(function (e) { if (e.getAttribute("data-c") === next) replay(e, "is-hop"); });
      },
      tap: function (t, root) {
        var c = t.closest("[data-v-cat]"), r = t.closest("[data-v-rsvp]"), k = t.closest("[data-v-cal]");
        if (c) { press(c); VIS.events.filter(root, c.getAttribute("data-v-cat")); }
        else if (r) {
          press(r);
          var on = !r.classList.contains("is-done");
          r.classList.toggle("is-done", on);
          r.textContent = on ? "✓ מגיעים" : "אישור הגעה";
          if (on) floatTxt(r, "🎉", "is-emoji");
        } else if (k) { press(k); k.parentNode.classList.toggle("is-open"); }
      }
    },

    receipts: {
      html: function () {
        return '<div class="trv-rc"><span class="trv-rc__ico">' + svg("receipt", 16) + '</span>' +
            '<span class="trv-rc__t"><b>קבלה · פעילות גננות</b><small>הוגשה ב-14.9 · סעיף גנים</small></span>' +
            '<span class="trv-rc__sum">₪<b data-v-sum>0</b></span></div>' +
          '<div class="trv-trail" data-v-trail>' +
            '<span class="trv-step" data-s="1">✓ הוגשה</span><span class="trv-dash"><i></i></span>' +
            '<span class="trv-step" data-s="2">✓ אושרה</span><span class="trv-dash"><i></i></span>' +
            '<span class="trv-step" data-s="3">● ממתינה לתשלום</span></div>' +
          '<span class="trv-hint">לחצו כדי לראות שוב</span>';
      },
      play: function (root) {
        var sum = q(root, "[data-v-sum]"), steps = qa(root, ".trv-step"), dashes = qa(root, ".trv-dash");
        steps.forEach(function (s) { s.classList.remove("is-done", "is-now"); });
        dashes.forEach(function (d) { d.classList.remove("is-full"); });
        sum.textContent = "0";
        for (var k = 1; k <= 12; k++) (function (k) {
          later(250 + k * 45, function () { sum.textContent = String(Math.round(240 * k / 12)); });
        })(k);
        later(700,  function () { steps[0].classList.add("is-done"); });
        later(1000, function () { dashes[0].classList.add("is-full"); });
        later(1400, function () { steps[1].classList.add("is-done"); });
        later(1700, function () { dashes[1].classList.add("is-full"); });
        later(2100, function () { steps[2].classList.add("is-now"); });
      },
      tap: function (t, root) { clearTimers(); VIS.receipts.play(root); }
    },

    profile: {
      html: function () {
        return '<div class="trv-seg" data-slot="0"><span class="trv-seg__thumb"></span>' +
            '<button type="button" tabindex="-1" class="is-on" data-v-slot="0">דייר/ת 1 · יעל</button>' +
            '<button type="button" tabindex="-1" data-v-slot="1">דייר/ת 2 · עומר</button></div>' +
          '<div class="trv-field"><label>טלפון</label><span data-v-phone>' + SLOTS[0].phone + '</span></div>' +
          '<div class="trv-field is-hl"><label>תאריך לידה</label><span data-v-dob>' + SLOTS[0].dob + '</span></div>' +
          '<div class="trv-kids">' +
            '<div class="trv-kid"><b>נועה</b><small>12.03.2019</small><em>בת 7</em></div>' +
            '<div class="trv-kid"><b>איתי</b><small>02.11.2021</small><em>בן 4</em></div>' +
          '</div>' +
          '<button type="button" tabindex="-1" class="trv-add" data-v-kid>+ הוספת ילד/ה</button>';
      },
      play: function (root) {
        later(1500, function () { press(q(root, '[data-v-slot="1"]')); profileSlot(root, 1); });
      },
      tap: function (t, root) {
        var s = t.closest("[data-v-slot]"), k = t.closest("[data-v-kid]");
        if (s) { press(s); profileSlot(root, +s.getAttribute("data-v-slot")); }
        else if (k) {
          press(k);
          var box = q(root, ".trv-kids"), extra = q(root, ".trv-kid.is-new");
          if (extra) { box.removeChild(extra); k.textContent = "+ הוספת ילד/ה"; return; }
          var row = document.createElement("div");
          row.className = "trv-kid is-new";
          row.innerHTML = '<b>תמר</b><small>01.06.2024</small><em>בת 2</em>';
          box.appendChild(row);
          k.textContent = "− הסרה";
        }
      }
    },

    garden: {
      html: function () {
        function cat(k, ico, label) {
          return '<button type="button" tabindex="-1" class="trv-chip" data-v-gcat="' + k + '">' + ico + ' ' + label + '</button>';
        }
        return '<div class="trv-chips">' + cat("water", "💧", "השקיה וממטרות") + cat("lawn", "🌿", "דשא") +
            cat("tree", "🌳", "עצים") + cat("clean", "🧹", "ניקיון") + '</div>' +
          '<div class="trv-row">' +
            '<div class="trv-search"><span class="trv-typed" data-v-typed></span><span class="trv-caret"></span>' +
              '<span class="trv-ph">כותרת קצרה — מה הבעיה?</span></div>' +
            '<span class="trv-gph" aria-hidden="true"></span>' +
            '<button type="button" tabindex="-1" class="trv-gadd" data-v-photo>+</button>' +
          '</div>' +
          '<div class="trv-gmap" data-v-gmap>' +
            '<svg viewBox="0 0 400 74" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">' +
              '<rect width="400" height="74" class="trv-ground"/>' +
              '<path d="M0 40H400" class="trv-gpath"/>' +
              '<rect x="14" y="48" width="120" height="22" rx="8" class="trv-lawn"/>' +
              '<rect x="160" y="6" width="90" height="26" rx="8" class="trv-lawn"/>' +
              '<rect x="270" y="48" width="116" height="22" rx="8" class="trv-lawn"/>' +
              '<circle cx="40" cy="58" r="6" class="trv-tree"/><circle cx="300" cy="58" r="7" class="trv-tree"/><circle cx="232" cy="18" r="6" class="trv-tree"/>' +
              '<rect x="30" y="6" width="34" height="22" rx="3" class="trv-mh"/><text x="47" y="20.5" class="trv-mn">341</text>' +
              '<rect x="80" y="6" width="34" height="22" rx="3" class="trv-mh"/><text x="97" y="20.5" class="trv-mn">343</text>' +
              '<rect x="300" y="6" width="34" height="22" rx="3" class="trv-mh"/><text x="317" y="20.5" class="trv-mn">345</text>' +
              '<g class="trv-pin"><g class="trv-pin__b"><path d="M0 0C-5-7-8-10-8-14a8 8 0 1 1 16 0c0 4-3 7-8 14z" fill="#E11D48"/>' +
                '<circle cy="-14" r="3" fill="#fff"/></g></g>' +
            '</svg>' +
            '<span class="trv-gmap__hint">איפה זה? לחצו על המפה</span>' +
          '</div>' +
          '<div class="trv-row">' +
            '<div class="trv-trail trv-gtrail">' +
              '<span class="trv-step">התקבל</span><span class="trv-dash"><i></i></span>' +
              '<span class="trv-step">תוכנן</span><span class="trv-dash"><i></i></span>' +
              '<span class="trv-step">טופל</span></div>' +
            '<button type="button" tabindex="-1" class="trv-cta" data-v-gsend>שליחה</button>' +
          '</div>';
      },
      play: function (root) {
        gardenReset(root);
        later(500, function () { var c = q(root, '[data-v-gcat="water"]'); press(c); gardenCat(root, "water"); });
        var end = typeInto(root, "[data-v-typed]", "ראש ממטרה שבור", 800, 60);
        later(end + 150, function () { gardenPin(root, 150, 42); });
        later(end + 750, function () { press(q(root, "[data-v-photo]")); gardenPhoto(root, true); });
        later(end + 1450, function () { gardenSend(root); });
      },
      tap: function (t, root, e) {
        var c = t.closest("[data-v-gcat]"), ph = t.closest("[data-v-photo]"), s = t.closest("[data-v-gsend]"), m = t.closest("[data-v-gmap]");
        if (c) { press(c); gardenCat(root, c.getAttribute("data-v-gcat")); }
        else if (ph) { press(ph); gardenPhoto(root, !q(root, ".trv-gph").classList.contains("is-on")); }
        else if (s) { clearTimers(); gardenSend(root); }
        else if (m && e) {
          var svgEl = m.querySelector("svg"), pt = svgEl.createSVGPoint();
          pt.x = e.clientX; pt.y = e.clientY;
          var ctm = svgEl.getScreenCTM();
          if (ctm) { var p = pt.matrixTransform(ctm.inverse()); gardenPin(root, p.x, p.y + 6); }
        }
      }
    },

    report: {
      html: function () {
        return '<div class="trv-rep">' +
            '<div class="trv-rep__screen" aria-hidden="true">' +
              '<span class="trv-rep__bar"></span><span class="trv-rep__ln" style="width:62%"></span>' +
              '<span class="trv-rep__ln" style="width:84%"></span><span class="trv-rep__ln" style="width:48%"></span>' +
              '<span class="trv-rep__tag">מסך: לוח אירועים</span></div>' +
            '<div class="trv-rep__menu">' +
              '<button type="button" tabindex="-1" data-v-kind="idea">' + REP_FAB.replace('width="20" height="20"', 'width="14" height="14"') + ' הצעת ייעול לאפליקציה</button>' +
              '<button type="button" tabindex="-1" data-v-kind="bug">🐞 דיווח על תקלה</button></div>' +
            '<button type="button" tabindex="-1" class="trv-rep__fab" data-v-fab>' + REP_FAB + '</button>' +
            '<div class="trv-rep__sheet">' +
              '<b class="trv-rep__title">דיווח על תקלה</b>' +
              '<div class="trv-rep__item"><span class="trv-rep__n">1</span><span class="trv-typed" data-v-rtext></span><span class="trv-caret"></span></div>' +
              '<div class="trv-rep__att"><span class="trv-rep__shot" aria-hidden="true"><i></i><i></i><i></i></span>' +
                '<span class="trv-rep__ctx">📷 צילום מסך צורף<br>נשלח לבד: המסך, המכשיר והגרסה</span></div>' +
              '<button type="button" tabindex="-1" class="trv-cta" data-v-rsend>שליחה</button>' +
              '<span class="trv-rep__ok">✓ הדיווח התקבל — תודה!</span>' +
            '</div>' +
          '</div>' +
          '<span class="trv-hint">לחצו על הנורה</span>';
      },
      play: function (root) {
        repState(root, []);
        later(900,  function () { press(q(root, "[data-v-fab]")); repState(root, ["is-menu"]); });
        later(1900, function () {
          press(q(root, '[data-v-kind="bug"]'));
          var end = repOpenForm(root, "bug", 250);
          later(end + 700, function () { repSend(root); });
        });
      },
      tap: function (t, root) {
        var fab = t.closest("[data-v-fab]"), k = t.closest("[data-v-kind]"), s = t.closest("[data-v-rsend]");
        var r = q(root, ".trv-rep");
        if (fab) { clearTimers(); press(fab); repState(root, r.classList.contains("is-menu") ? [] : ["is-menu"]); }
        else if (k) { clearTimers(); press(k); repOpenForm(root, k.getAttribute("data-v-kind"), 150); }
        else if (s && !r.classList.contains("is-sent")) { clearTimers(); repSend(root); }
        else if (r.classList.contains("is-sent") && t.closest(".trv-rep__sheet")) { clearTimers(); repState(root, []); }
      }
    },

    push: {
      html: function () {
        return '<div class="trv-phone-top"><div class="trv-banner">' +
            '<span class="trv-banner__app">' + VI.logo + '</span><span class="trv-banner__t"></span></div></div>' +
          '<div class="trv-nt">' +
            '<button type="button" tabindex="-1" class="trv-tile"><span class="trv-tile__d">' + VI.bellOff + '</span>' +
              '<span class="trv-tile__l">הפעלת התראות Push</span></button>' +
            '<div class="trv-two">' +
              '<div class="trv-lane"><b>📱 Push לטלפון</b><span>ההחזר שלך התקדם</span><span>שריון מועדון אושר או נדחה</span></div>' +
              '<div class="trv-lane"><b>✉️ למייל</b><span>קבלות והחזרים</span><span>מועדון ומכון כושר</span><span>דיווחי גינון · עדכון פרטים</span></div>' +
            '</div></div>';
      },
      play: function (root) {
        later(1100, function () { press(q(root, ".trv-tile")); pushSet(root, true); });
      },
      tap: function (t, root) {
        var tile = t.closest(".trv-tile");
        if (!tile) return;
        press(tile);
        clearTimers();
        pushSet(root, !tile.classList.contains("is-on"));
      }
    }
  };
  function visHtml(key) {
    var v = key && VIS[key];
    if (!v) return "";
    return '<div class="tr-vis" data-vis="' + key + '">' + v.html() +
      '<span class="tr-vis__cap">כך זה נראה באפליקציה · אפשר ללחוץ · נתוני דוגמה</span></div>';
  }

  /* קונפטי קטן על "סיימנו" — רק כשבאמת סיימו, לא בדילוג. */
  function burst(from) {
    if (REDUCED || !from || !from.getBoundingClientRect) return;
    var r = from.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var colors = ["#6366F1", "#DB2777", "#0D9488", "#C2760A", "#7C5CC4", "#111827"];
    var layer = document.createElement("div");
    layer.className = "tr-burst";
    for (var i = 0; i < 26; i++) {
      var p = document.createElement("i"), a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
      p.style.left = cx + "px"; p.style.top = cy + "px";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
      p.style.setProperty("--dy", Math.round(Math.sin(a) * d - 60) + "px");
      p.style.setProperty("--r", Math.round(Math.random() * 540 - 270) + "deg");
      p.style.animationDelay = Math.round(Math.random() * 90) + "ms";
      layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(function () { if (layer.parentNode) layer.parentNode.removeChild(layer); }, 1400);
  }

  function maxVersion(list) {
    return (list || []).reduce(function (m, s) { return Math.max(m, num(s["גרסה"], 1)); }, 0);
  }
  function newSteps() {
    return steps.filter(function (s) { return num(s["גרסה"], 1) > seen; });
  }

  /* ------------------------------------------------------------- טעינה --- */
  function load(cb) {
    if (loaded) { if (cb) cb(true); return; }
    if (loading) { if (cb) cb(false); return; }
    if (!(CBA.data && CBA.data.getTour)) { if (cb) cb(false); return; }
    loading = true;
    CBA.data.getTour(function (res) {
      loading = false;
      if (!res || !res.ok) { if (cb) cb(false); return; }
      steps = res.steps || [];
      seen = num(res.seen, 0);
      loaded = true;
      if (cb) cb(true);
    });
  }

  /* שמירת "ראיתי עד כאן". שומרים גם מקומית מיד — כדי שכישלון רשת רגעי לא
     יגרום לסיור להיפתח שוב בפעם הבאה ולהרגיש כמו תקלה. */
  function markSeen(v) {
    if (v <= seen) return;
    seen = v;
    try { localStorage.setItem(AUTO_KEY, String(v)); } catch (e) {}
    if (CBA.data && CBA.data.markTourSeen) CBA.data.markTourSeen(v, function () {});
  }
  function localSeen() {
    try { return num(localStorage.getItem(AUTO_KEY), 0); } catch (e) { return 0; }
  }

  /* -------------------------------------------------------------- ציור --- */
  function render() {
    clearTimers();
    var s = deck[idx];
    if (!s) { close(); return; }
    var total = deck.length;
    var isLast = idx === total - 1;
    var target = val(s, "מסך יעד");
    var btnLabel = val(s, "כפתור");
    var vis = visHtml(val(s, "המחשה"));
    var dots = "";
    for (var i = 0; i < total; i++) {
      dots += '<span class="tr-dot' + (i === idx ? " is-on" : "") + '"></span>';
    }
    el.querySelector(".tr-card").innerHTML =
      '<button type="button" class="tr-skip" data-tr-skip>' + (isLast ? "סגירה" : "דילוג") + '</button>' +
      '<div class="tr-body">' +
        (vis || '<div class="tr-ico" data-ico="' + esc(val(s, "אייקון")) + '">' + svg(val(s, "אייקון")) + '</div>') +
        '<h2 class="tr-title">' + esc(val(s, "כותרת")) + '</h2>' +
        '<p class="tr-text">' + esc(val(s, "טקסט")) + '</p>' +
        (target && btnLabel
          ? '<button type="button" class="tr-jump" data-tr-jump="' + esc(target) + '">' + esc(btnLabel) + '</button>'
          : "") +
      '</div>' +
      '<div class="tr-foot">' +
        '<button type="button" class="tr-back" data-tr-back' + (idx === 0 ? " hidden" : "") + '>הקודם</button>' +
        '<div class="tr-dots">' + dots + '</div>' +
        '<button type="button" class="tr-next" data-tr-next>' + (isLast ? "סיימנו" : "הבא") + '</button>' +
      '</div>';
    el.querySelector(".tr-card").classList.toggle("has-vis", !!vis);
    /* כניסה מדורגת: ההמחשה, הכותרת, הטקסט והכפתור נכנסים בזה אחר זה, מהכיוון
       שאליו דפדפו (RTL: קדימה מגיע משמאל). ר' .tr-body.is-fwd ב-tour.css. */
    var body = el.querySelector(".tr-body");
    body.classList.add(dir > 0 ? "is-fwd" : dir < 0 ? "is-back" : "is-open");
    Array.prototype.forEach.call(body.children, function (c, i) { c.style.setProperty("--d", i); });
    var visEl = body.querySelector(".tr-vis"), v = visEl && VIS[visEl.getAttribute("data-vis")];
    if (v && v.play) v.play(visEl);
    var next = el.querySelector("[data-tr-next]");
    if (next) next.focus();
  }

  function go(d) {
    var n = idx + d;
    if (n < 0) return;
    if (n >= deck.length) { burst(el && el.querySelector("[data-tr-next]")); finish(); return; }
    idx = n; dir = d;
    render();
  }

  /* סיום רגיל וגם דילוג מסמנים "ראיתי" — מי שדילג בחר לא לראות, ואין שום
     תועלת בלהקפיץ לו את זה שוב מחר. הוא תמיד יכול לפתוח מהתפריט. */
  function finish() {
    markSeen(maxVersion(deck) || maxVersion(steps));
    close();
    if (CBA.screens && CBA.screens.resHome && document.body.dataset.screen === "resHome") {
      if (CBA.navigate) CBA.navigate("resHome");   // מרענן כדי שכרטיס "יש חדש" ייעלם
    }
  }

  function jump(target) {
    var v = maxVersion(deck) || maxVersion(steps);
    markSeen(v);
    close();
    if (target === "security") { if (CBA.security) CBA.security.open(); return; }
    if (target === "install")  { if (CBA.pwa) CBA.pwa.promptInstall(); return; }
    if (target === "push")     { enablePush(); return; }
    /* "report" (2026-09-23) — פותח את תפריט כפתור הדיווח האמיתי. setTimeout: אותה
       לחיצה ממשיכה לבעבע ל-document, ושם report.js סוגר תפריט פתוח בלחיצה מבחוץ. */
    if (target === "report")   { setTimeout(function () { if (CBA.report && CBA.report.openMenu) CBA.report.openMenu(); }, 60); return; }
    if (CBA.navigate) CBA.navigate(target);
  }

  /* "להפעלת התראות" (2026-09-23) — אותה פעולה בדיוק כמו האריח בתפריט
     המשתמש (app.js, data-panel-push), רק בלי לחפש אותו.
     ⚠️ באייפון שלא הותקן — הדפדפן לא מסוגל לבקש התראות בכלל (מגבלת אפל),
        ולכן במקום הודעת שגיאה פותחים את ההוספה למסך הבית, שהיא הצעד
        שחסר באמת. */
  function enablePush() {
    var P = CBA.push, toast = (CBA.ui && CBA.ui.toast) || CBA.toast || function () {};
    if (!P || !P.canOffer) return;
    var gate = P.canOffer();
    if (!gate.ok) {
      if (CBA.pwa && CBA.pwa.isIOS && CBA.pwa.isIOS() && !CBA.pwa.isStandalone()) { CBA.pwa.promptInstall(); return; }
      toast(gate.reason, "error");
      return;
    }
    if (P.isSubscribed()) { toast("ההתראות כבר פעילות במכשיר הזה"); return; }
    P.subscribe().then(function () {
      toast("ההתראות הופעלו");
      if (CBA.refreshHeaderYear) CBA.refreshHeaderYear();   // מרענן את אריח ההתראות בתפריט
    }).catch(function (err) { toast(String((err && err.message) || err), "error"); });
  }

  /* ------------------------------------------------------ פתיחה/סגירה --- */
  function open(list) {
    if (!list || !list.length) return;
    if (el) close();
    deck = list; idx = 0; dir = 0;
    lastFocus = document.activeElement;

    el = document.createElement("div");
    el.className = "tr";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-label", "סיור היכרות");
    el.innerHTML = '<div class="tr-card"></div>';
    document.body.appendChild(el);
    document.body.classList.add("tr-open");

    el.addEventListener("click", function (e) {
      // לחיצה בתוך ההמחשה = "לנסות את הכפתור". משחק מקומי בלבד, ר' VIS.
      var vr = e.target.closest(".tr-vis");
      if (vr) { var vv = VIS[vr.getAttribute("data-vis")]; if (vv && vv.tap) vv.tap(e.target, vr, e); return; }
      if (e.target.closest("[data-tr-skip]")) { finish(); return; }
      if (e.target.closest("[data-tr-next]")) { go(1); return; }
      if (e.target.closest("[data-tr-back]")) { go(-1); return; }
      var j = e.target.closest("[data-tr-jump]");
      if (j) jump(j.dataset.trJump);
    });
    el.addEventListener("keydown", function (e) {
      if (e.key === "Escape")     { e.preventDefault(); finish(); }
      else if (e.key === "ArrowLeft")  { e.preventDefault(); go(1); }   // RTL: שמאלה = קדימה
      else if (e.key === "ArrowRight") { e.preventDefault(); go(-1); }
    });
    // החלקה בנייד — אותו כיוון כמו החצים
    // (2026-09-23) התוכן נגרר אחרי האצבע — מרגישים שהכרטיס "זז" — ורק מעבר
    // לסף מדפדפים. תנועה אנכית (גלילה בגוף הכרטיס) לא נחשבת גרירה.
    var x0 = null, y0 = 0, dragging = false;
    function dragBody(dx) {
      var b = el && el.querySelector(".tr-body");
      if (!b) return;
      if (dx == null) { b.style.transform = ""; b.style.opacity = ""; b.classList.remove("is-drag"); return; }
      b.classList.add("is-drag");
      b.style.transform = "translateX(" + Math.round(dx * 0.35) + "px)";
      b.style.opacity = String(Math.max(0.45, 1 - Math.abs(dx) / 520));
    }
    el.addEventListener("touchstart", function (e) {
      if (e.touches.length !== 1) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dragging = false;
    }, { passive: true });
    el.addEventListener("touchmove", function (e) {
      if (x0 == null || REDUCED) return;
      var dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (!dragging && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) dragging = true;
      if (dragging) dragBody(dx);
    }, { passive: true });
    el.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      var was = dragging;
      if (dragging) dragBody(null);
      dragging = false;
      if (was && Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
    }, { passive: true });

    render();
  }

  function close() {
    clearTimers();
    if (!el) return;
    el.remove(); el = null; deck = []; idx = 0;
    document.body.classList.remove("tr-open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  /* ------------------------------------------------------- API חיצוני --- */
  /* הסיור המלא — מתפריט המשתמש ומהכניסה הראשונה. */
  function start() { load(function (ok) { if (ok) open(steps.slice()); }); }
  /* רק מה שחדש מאז הפעם הקודמת — מהכרטיס בעמוד הקבלה. */
  function startNew() { load(function (ok) { if (ok) open(newSteps()); }); }

  /* פתיחה אוטומטית: **רק** בכניסה ראשונה אמיתית (seen = 0 גם בשרת וגם
     מקומית). כשיש צעדים חדשים לתושב ותיק — לא נוגעים במסך שלו; עמוד הקבלה
     יציג כרטיס והוא יחליט. נקרא פעם אחת אחרי שהאפליקציה מוכנה. */
  var autoDone = false;
  function maybeAutoStart() {
    if (autoDone) return;
    autoDone = true;
    load(function (ok) {
      if (!ok || !steps.length) return;
      if (seen > 0 || localSeen() > 0) return;
      if (document.getElementById("login-gate") &&
          !document.getElementById("login-gate").hidden) return;
      open(steps.slice());
    });
  }

  /* לעמוד הקבלה: כמה צעדים חדשים מחכים. מחזיר 0 כל עוד לא נטען — עמוד
     הקבלה מבקש טעינה וייקרא שוב כשהיא תחזור. */
  function newCount(cb) {
    if (loaded) { var n = seen > 0 ? newSteps().length : 0; if (cb) cb(n); return n; }
    load(function (ok) { if (cb) cb(ok && seen > 0 ? newSteps().length : 0); });
    return 0;
  }

  /* הזרעה מבחוץ (2026-09-09). עמוד הבית מושך היום את כל מה שהוא צריך
     בקריאה אחת (`homeExtras`), והסיור הוא אחד המקטעים שם. במקום שהוא ישלח
     קריאת רשת שנייה לאותו מידע בדיוק — הוא מקבל אותו ישירות.
     ⚠️ אותה תשובה בדיוק שמגיעה מ-`action=tour`, ולכן אין כאן פענוח שני של
        הפורמט. אם ההזרעה לא קרתה, `load()` ימשיך לעבוד כרגיל. */
  function seed(res) {
    if (loaded || !res || !res.ok) return false;
    steps = res.steps || [];
    seen = num(res.seen, 0);
    loaded = true;
    return true;
  }

  return {
    start: start, startNew: startNew, close: close,
    maybeAutoStart: maybeAutoStart, newCount: newCount, seed: seed,
    isOpen: function () { return !!el; }
  };
})();
