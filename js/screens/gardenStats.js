/* ============================================================================
 *  "נתוני גינון" — המסך הראשי של מנהל הגינון   (22.9.2026, אפיון גרסה 3)
 * ----------------------------------------------------------------------------
 *  🔴 **מחליף את המסך הקודם כולו** (הכרעת יועד). שום מדד מהמסך הישן לא
 *     נשמר כמו שהוא. האפיון המלא והמוקאפים: הארטיפקט "מסך נתוני הגינון".
 *
 *  שלוש שאלות, ואין רביעית:
 *    1. **מה תקוע עכשיו**      — הצד הימני במחשב: ממתינות לאישורך, תקלות
 *                                פתוחות, נגררות, ומתחתן הגיל ו"הכי נגררות".
 *    2. **איך עומדים לאורך זמן** — הצד השמאלי: חזרו לטיפול, משוב שלילי,
 *                                שגרה שנדחתה, ובשורה האחרונה ארבע מגמות.
 *    3. **איפה בשכונה**         — המפה, ו"תקלות לפי סוג" שמסננת אותה.
 *  כל מספר נפתח לרשימה שמאחוריו, וכל שורה פותחת את כרטיס התקלה המלא
 *  (CBA.gardenOpenCard — אותו כרטיס בדיוק של מסך המשימות).
 *
 *  🔑 **הנתונים:** Firestore בלבד, בדפדפן (dataService.gardenStatsLiveRead),
 *     והחישוב ב-CBA.gardenStatsCalc. היומן נקרא פעם אחת ל-12 שבועות +
 *     מרווח, ולכן מעבר בין 4/8/12 שבועות הוא **חישוב מקומי** — מיידי.
 *  🔑 **שלוש עמודות, שלוש שאלות** (סבב עיצוב 4, 23.9 — "זכוכית"):
 *     עכשיו · בתקופה · איפה, ביחס 0.7 · 1.3 · 1, כל אחת על לוח זכוכית משלה.
 *     בלי שורת כותרת — בורר התקופה יושב בכותרת "בתקופה". המפה לאורך
 *     בשליש השמאלי, "לפי סוג" כפס מעליה, ומקרא צף מצומצם. בטלפון העמודות
 *     נערמות באותו סדר. העיצוב כולו ב-css/gardenStats.css (קידומת gx-).
 *  ⚠️ מנהל הגינון ומנהל-על בלבד (SCREEN_PERM "MANAGER"). הגנן החיצוני אינו
 *     רשאי לקרוא את היומן, בכוונה — והמסך הוא כלי ניהול ולא כלי עבודה.
 *  ⚠️ לעולם לא נתון מומצא: יומן שלא נטען מוצג "—" עם הסבר, ומגמה בלי
 *     נתונים אומרת זאת במילים — לא אפס שנראה כמו תוצאה.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};
  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }

  var DAY = 86400000;

  /* סמלילים של המסך עצמו. סמלילי הקטגוריות מגיעים מ-CBA.gardenKit —
     **אותם ציורים** כמו בכרטיסים במסך המשימות. */
  var OWN = {
    full:  '<path d="M9 3H4v5M15 21h5v-5M20 4l-6.5 6.5M4 20l6.5-6.5"/>',
    x:     '<path d="M6 6l12 12M18 6 6 18"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    back:  '<path d="M3 8h11a5 5 0 0 1 0 10H8"/><path d="m6.5 4.5-3 3.5 3 3.5"/>',
    cloud: '<path d="M6.5 19a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.2-1.6A4.2 4.2 0 0 1 21 12.6"/><path d="m15 15 6 6M21 15l-6 6"/>',
    chev:  '<path d="m6 9 6 6 6-6"/>',
    /* 23.9 — סמלילי האריחים (Lucide: sprout · hourglass · star) */
    sprout2: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    clock2: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    star:  '<path d="M11.5 2.9a.5.5 0 0 1 .9 0l2.3 4.7a2 2 0 0 0 1.5 1.1l5.2.8a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.8l.9 5.2a.5.5 0 0 1-.7.5l-4.6-2.5a2 2 0 0 0-1.9 0l-4.6 2.5a.5.5 0 0 1-.7-.5l.9-5.2a2 2 0 0 0-.6-1.8L2.4 10.4a.5.5 0 0 1 .3-.9l5.2-.8a2 2 0 0 0 1.5-1.1z"/>'
  };
  function ico(n, w) {
    var K = CBA.gardenKit;
    var body = OWN[n] || (K && K.ICONS && K.ICONS[n]) || "";
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
      (w ? ' style="width:' + w + 'px;height:' + w + 'px"' : '') + '>' + body + '</svg>';
  }
  function GL() { return CBA.gardenLang; }
  function catOf(name) { return GL().catOf(name); }
  /* 23.9 — קטגוריה של משימה: דשא או טיפה לפי הכותרת (gardenLang.catOfTask). */
  function catT(t) { var g = GL(); return g.catOfTask ? g.catOfTask(t) : g.catOf(t && t.category); }

  /* מצב הנעץ -> שם בעברית (מקרא ותקציר). הצבעים: --s-* ב-gardenStats.css. */
  var ST_LABEL = { wait: "ממתינה להחלטה", plan: "משובצת", appr: "ממתינה לאישורך",
                   l1: "נגררה", l2: "נגררה יותר משבוע", done: "נסגרה" };

  function weekLabel(key) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return "";
    var a = new Date(+m[1], +m[2] - 1, +m[3]);
    return "שבוע " + a.getDate() + "." + (a.getMonth() + 1);
  }
  function ago(msv) {
    if (!msv || isNaN(msv)) return "";
    var d = Math.floor((Date.now() - msv) / DAY);
    if (d <= 0) return "היום";
    if (d === 1) return "אתמול";
    if (d < 7) return "לפני " + d + " ימים";
    if (d < 14) return "לפני שבוע";
    return "לפני " + Math.round(d / 7) + " שבועות";
  }
  function daysText(n) {
    return n === 0 ? "מהיום" : n === 1 ? "יום אחד" : n === 2 ? "יומיים" : n + " ימים";
  }
  /* "מצביע עדין" — מחשב עם עכבר. הריחוף פותח תקצירים רק שם. */
  var FINE = window.matchMedia ? window.matchMedia("(hover: hover) and (pointer: fine)") : { matches: false };

  CBA.screens.gardenStats = {
    render: function (container) {
      var weeks = 8;
      var raw = null;          // מה שנקרא מ-Firestore
      var M = null;            // מה שחושב
      var byId = {};
      var loadErr = null;
      var showClosed = false;
      var catFilter = "";      // שם הקטגוריה שמסננת את המפה
      var trendTab = 0;
      var mapHost = null, mapCtl = null;
      var peekTimer = null;

      container.innerHTML = '<div class="gd-screen gx gx-vars" id="gx-root"></div>';
      var root = container.querySelector("#gx-root");
      skeleton();
      load();

      function alive() { return root && root.isConnected; }

      function load() {
        /* 12 שבועות תמיד — ר' ההערה בראש הקובץ: מעבר תקופה הוא חישוב, לא קריאה. */
        CBA.data.getGardenStatsLive(12, function (res) {
          if (!alive()) return;
          if (!res || !res.ok) {
            loadErr = (res && res.error) || "לא הצלחתי לטעון את הנתונים";
            raw = null; draw(); return;
          }
          loadErr = null;
          raw = res;
          byId = {};
          (res.rows || []).forEach(function (t) { byId[String(t.id)] = t; });
          recompute();
          draw();
        });
      }
      function recompute() {
        if (!raw) return;
        M = CBA.gardenStatsCalc.compute(raw.rows, raw.log, {
          weeks: weeks, categories: raw.categories,
          requireApproval: raw.requireApproval, logOk: raw.logOk
        });
      }
      /* אחרי פעולה (אישור, החזרה, או כל פעולה בכרטיס) — טעינה מחדש שקטה. */
      function refresh() { if (alive()) load(); }

      /* ============================ שלד ============================ */
      function skeleton() {
        root.innerHTML = '<div class="gx-grid">' +
          ['', '', ''].map(function () {
            return '<div class="gx-pane"><div class="skeleton" style="height:30px;border-radius:10px;width:40%"></div>' +
              '<div class="skeleton" style="height:110px;border-radius:18px"></div>' +
              '<div class="skeleton" style="height:220px;border-radius:18px"></div></div>';
          }).join("") + '</div>';
      }

      /* 🔴 23.9 (סבב עיצוב 4) — אין שורת כותרת. בורר התקופה יושב בתוך
         הכותרת של "בתקופה", כי הוא משנה רק את העמודה הזאת. */
      function seg() {
        return '<div class="gx-seg lgx" role="radiogroup" aria-label="תקופה">' +
          [4, 8, 12].map(function (w) {
            return '<button type="button" role="radio" aria-checked="' + (w === weeks) + '"' +
              (w === weeks ? ' class="on"' : '') + ' data-weeks="' + w + '">' +
              (w === weeks ? w + ' שבועות' : w) + '</button>';
          }).join("") + '</div>';
      }
      function paneHead(title, side) {
        return '<div class="gx-ph"><h3>' + esc(title) + '</h3>' + (side || '') + '</div>';
      }

      /* ============================ ציור ============================ */
      function draw() {
        hidePeek();
        if (loadErr) {
          root.innerHTML =
            '<div class="gx-err lgx"><u>' + ico("cloud", 22) + '</u><b>לא הצלחתי לטעון</b>' +
            '<span>' + esc(loadErr) + '</span>' +
            '<button type="button" class="gd-cta" data-act="retry">נסה שוב</button></div>';
          wire();
          return;
        }
        if (!M) { skeleton(); return; }
        var mp = M.map;
        root.innerHTML =
          (M.logOk ? '' :
            '<div class="gx-warn">' + ico("cloud", 16) + '<span>יומן הפעולות לא נטען, ולכן "חזרו לטיפול", ' +
            '"משוב שלילי" וזמן השיבוץ מסומנים "—". שאר המספרים מעודכנים. ' +
            '<button type="button" data-act="retry">לנסות שוב</button></span></div>') +
          /* שלוש עמודות, שלוש שאלות: עכשיו · בתקופה · איפה. כל אחת על לוח
             זכוכית משלה — זו ההפרדה בין השלישים (בלי קווים). */
          '<div class="gx-grid">' +
            '<section class="gx-pane gx-pane--now" aria-label="עכשיו">' +
              paneHead("עכשיו", '<small class="gx-live">חי</small>') +
              approvalCard() + nowTiles() + ageBox() + topBox() +
            '</section>' +
            '<section class="gx-pane gx-pane--per" aria-label="בתקופה">' +
              paneHead("בתקופה", seg()) +
              perTiles() + trendsBox() +
            '</section>' +
            '<section class="gx-pane gx-pane--map" aria-label="איפה">' +
              paneHead("איפה", '<small>' + mp.openWithLoc + ' מתוך ' + mp.openTotal + ' עם מיקום</small>') +
              catBox() + mapBox() +
            '</section>' +
          '</div>';
        wire();
        placeMap();
        sizeCharts();
      }
      /* מודד כל קופסת מגמה ומצייר את הגרף שלה מחדש בגובה שממלא אותה. */
      function sizeCharts() {
        root.querySelectorAll(".gx-tr").forEach(function (box) {
          var svg = box.querySelector(".gx-chart");
          if (!svg || !box.offsetParent) return;
          var w = svg.clientWidth || box.clientWidth;
          var used = 0;
          Array.prototype.forEach.call(box.children, function (c) { if (c !== svg) used += c.offsetHeight; });
          var avail = box.clientHeight - used - 26;
          if (w < 50 || avail < 40) return;
          var k = TR[+box.dataset.i].k;
          svg.outerHTML = chart(k, 200 * avail / w);
        });
      }
      var rsT = null;
      function onResize() {
        if (!alive()) { window.removeEventListener("resize", onResize); return; }
        clearTimeout(rsT);
        rsT = setTimeout(function () { if (alive() && M) sizeCharts(); }, 180);
      }
      window.addEventListener("resize", onResize);

      /* ---------------------------- עכשיו ---------------------------- */
      /* 🔴 "ממתינות לאישורך" מובלטת (יועד, 23.9): כרטיס ברוחב מלא בראש
         העמודה, בזכוכית מרווה עם הילה וכפתור. כשאין מה לאשר — שקטה.
         מופיעה רק כשהמתג "אישור מנהל" דלוק (אפיון סעיף 2). */
      function approvalCard() {
        var a = M.now.approval;
        if (!a.on) return '';
        if (!a.count) {
          return '<button type="button" class="gx-ap is-calm" data-list="approval">' +
            '<span class="gx-ap__n">0</span><span class="gx-ap__l">ממתינות לאישורך</span>' +
            '<span class="gx-ap__s">אין מה לאשר</span></button>';
        }
        return '<button type="button" class="gx-ap is-hot" data-list="approval">' +
          '<span class="gx-ap__n">' + a.count + '</span><span class="gx-ap__l">ממתינות לאישורך</span>' +
          '<span class="gx-ap__s">הוותיקה מחכה ' + esc(daysText(a.oldestDays)) + '</span>' +
          '<span class="gx-ap__go">לאישור ←</span></button>';
      }
      function nowTiles() {
        var o = M.now.open, d = M.now.dragged;
        return '<div class="gx-two">' +
          '<button type="button" class="gx-tile lgx" data-list="open" style="--k:var(--k-open)">' +
            '<span class="gx-k">' + ico("sprout2") + 'פתוחות</span>' +
            '<span class="gx-n">' + o.count + '</span>' +
            '<span class="gx-s"><b>' + o.undecided + '</b> להחלטה · <b>' + o.planned + '</b> משובצות</span></button>' +
          '<button type="button" class="gx-tile lgx" data-list="dragged" style="--k:var(--k-drag)">' +
            '<span class="gx-k">' + ico("clock2") + 'נגררות</span>' +
            '<span class="gx-n">' + d.count + '</span>' +
            '<span class="gx-s"><i class="gx-dot s-l1"></i><b>' + d.l1 + '</b> שבוע · <i class="gx-dot s-l2"></i><b>' + d.l2 + '</b> יותר</span>' +
          '</button></div>';
      }

      /* ---------------------------- בתקופה ---------------------------- */
      function perTiles() {
        var r = M.period.returned, n = M.period.negative, rt = M.period.routine;
        var dash = !M.logOk;
        return '<div class="gx-tiles">' +
          '<button type="button" class="gx-tile lgx" data-list="returned" style="--k:var(--k-back)">' +
            '<span class="gx-k">' + ico("back") + 'חזרו לטיפול</span>' +
            '<span class="gx-pair"><span><span class="gx-n">' + (dash ? "—" : r.feedback.length) + '</span><em>משוב תושב</em></span>' +
            '<span><span class="gx-n">' + (dash ? "—" : r.reopen.length) + '</span><em>פתיחה מחדש</em></span></span></button>' +
          '<button type="button" class="gx-tile lgx" data-list="negative" style="--k:var(--k-neg)">' +
            '<span class="gx-k">' + ico("star") + 'משוב שלילי</span>' +
            '<span class="gx-n">' + (dash || n.pct === null ? "—" : n.pct + '<small>%</small>') + '</span>' +
            '<span class="gx-s">' + (dash ? "היומן לא נטען"
                  : n.answered ? n.negative + " מתוך " + n.answered + " תושבים שענו"
                               : "אף תושב עוד לא ענה") + '</span></button>' +
          '<button type="button" class="gx-tile lgx" data-list="routine" style="--k:var(--k-rout)">' +
            '<span class="gx-k">' + ico("repeat") + 'שגרה שנדחתה</span>' +
            '<span class="gx-n">' + rt.deferred.length + '</span>' +
            '<span class="gx-s">' + (rt.cancelled.length ? 'ועוד <b>' + rt.cancelled.length + '</b> שבוטלו'
                                                          : 'אף מופע לא בוטל') + '</span></button>' +
        '</div>';
      }

      /* ------------------------- גיל התקלות ------------------------- */
      function ageBox() {
        var total = M.now.open.count;
        return '<div class="gx-box lgx">' +
          '<h5>גיל התקלות' +
            (total ? '<button type="button" class="gx-lnk" data-list="age">הכול ←</button>' : '') + '</h5>' +
          '<div class="gx-age' + (total ? '' : ' is-empty') + '">' + (total
            ? M.now.age.map(function (b, i) {
                return b.ids.length ? '<i class="a' + (i + 1) + '" style="flex:' + b.ids.length + '"></i>' : '';
              }).join("") : '') + '</div>' +
          '<div class="gx-age-k">' + M.now.age.map(function (b, i) {
            return '<button type="button" data-list="age" data-i="' + i + '"' + (b.ids.length ? '' : ' disabled') +
              ' title="' + esc(b.label) + '"><b>' + b.ids.length + '</b><span>' + esc(b.short) + '</span></button>';
          }).join("") + '</div>' +
        '</div>';
      }

      /* ------------------------- הכי נגררות ------------------------- */
      /* "רשימה קצרה, בלי מספר בכותרת. עד חמש שורות." */
      function topBox() {
        var top = M.now.top;
        return '<div class="gx-box lgx gx-grow">' +
          '<h5>הכי נגררות' +
            (M.now.dragged.count ? '<button type="button" class="gx-lnk" data-list="dragged">הכול ←</button>' : '') +
          '</h5>' +
          (top.length
            ? '<ul class="gx-drg">' + top.map(function (d) {
                var t = byId[d.id] || {};
                var c = catT(t);
                return '<li><button type="button" data-open="' + esc(d.id) + '">' +
                  '<span class="gx-ci k-' + c.key + '">' + ico(c.ico) + '</span>' +
                  /* התג בשורה השנייה ולא בעמודה משלו — העמודה צרה, והכותרת
                     חייבת את כל הרוחב (אחרת "ראש מ..."). */
                  '<span class="gx-rt"><b>' + esc(t.title || t.category || "משימה") + '</b>' +
                  '<span class="gx-rt__m"><span class="gt-age is-l' + d.level + '">' + esc(d.text) + '</span>' +
                  '<span>' + esc([t.area, t.kind === "שגרה" ? "שגרה" : ""].filter(Boolean).join(" · ")) + '</span>' +
                  '</span></span></button></li>';
              }).join("") + '</ul>'
            : '<p class="gx-none">אין נגררות.</p>') +
        '</div>';
      }

      /* ---------------------------- המפה ---------------------------- */
      /* 🔴 המקרא צף ומצומצם (23.9): שתי שורות מצבים, ושורות סוגים עם
         סמליל ושם קצר. ✕ מקפל אותו לגלולה "מקרא" — ונזכר לפי הדפדפן. */
      var LEG_STATES = [["wait", "להחלטה"], ["plan", "משובצת"], ["appr", "לאישורך"],
                        ["l1", "נגררה"], ["l2", "נגררה 2+"], ["done", "נסגרה"]];
      var LEG_CATS = [["lawn", "דשא"], ["water", "השקיה"], ["tree", "עצים"], ["prune", "גיזום"],
                      ["weed", "עשבייה"], ["clean", "ניקיון/גזם"], ["bed", "ערוגות"]];
      function legOpen() { var def = !(window.matchMedia && window.matchMedia("(max-width: 899px)").matches); try { var v = localStorage.getItem("cba.gx.leg"); return v === null ? def : v !== "0"; } catch (e) { return def; } }
      function legSet(v) { try { localStorage.setItem("cba.gx.leg", v ? "1" : "0"); } catch (e) {} }
      function legendHtml() {
        if (!legOpen()) {
          return '<button type="button" class="gx-chip lgx gx-leg-btn" data-act="leg">מקרא</button>';
        }
        return '<div class="gx-leg lgx"><div class="gx-leg__h"><span>מקרא</span>' +
            '<button type="button" data-act="leg" aria-label="סגירת המקרא">' + ico("x", 12) + '</button></div>' +
          '<div class="gx-leg__g">' + LEG_STATES.map(function (r) {
            return '<span><i class="s-' + r[0] + '"></i>' + esc(r[1]) + '</span>';
          }).join("") + '</div><div class="gx-leg__sep"></div><div class="gx-leg__g">' +
          LEG_CATS.map(function (r) {
            return '<span style="color:var(--c-' + r[0] + ')">' + ico(r[0]) + '<em>' + esc(r[1]) + '</em></span>';
          }).join("") + '</div></div>';
      }
      function mapBox() {
        return '<div class="gx-mapbox" id="gx-mapslot">' +
          '<div class="gx-map-tools">' +
            '<button type="button" class="gx-chip lgx" data-act="closed" aria-pressed="' + showClosed + '">' +
              '<i class="gx-sw' + (showClosed ? ' on' : '') + '"></i>סגורות</button>' +
            (catFilter
              ? '<button type="button" class="gx-chip lgx is-f" data-act="clearcat">' +
                  esc(catFilter) + ' ' + ico("x", 12) + '</button>'
              : '') +
          '</div>' +
          '<div class="gx-leg-slot">' + legendHtml() + '</div>' +
          '<button type="button" class="gx-map-cover" data-act="fullmap" aria-label="פתיחת המפה במסך מלא">' +
            '<span class="gx-chip lgx">' + ico("full", 12) + 'מסך מלא</span></button>' +
          '<div class="gx-pop lgx" id="gx-pop" hidden></div>' +
        '</div>';
      }
      function visiblePins(closed, cat) {
        return M.map.pins.filter(function (p) {
          if (p.closed && !closed) return false;
          if (cat && p.category !== cat) return false;
          return true;
        });
      }
      /* המפה נבנית **פעם אחת** ועוברת בין ציורים — ציור מחדש שלה
         (בסיס SVG של כל השכונה) היה מאט כל לחיצה על תקופה או מסנן. */
      function placeMap() {
        var slot = root.querySelector("#gx-mapslot");
        if (!slot || !CBA.map) return;
        if (!mapHost) {
          mapHost = document.createElement("div");
          mapHost.className = "gd-map gx-map";
          slot.insertBefore(mapHost, slot.firstChild);
          mapCtl = mountPins(mapHost, {
            onPin: function (p, el) { showPop(p, el, true); },
            onHover: function (p, el, on) { if (FINE.matches) { if (on) showPop(p, el, false); else hidePopSoon(); } },
            onCluster: function (list) { openList(clusterList(list)); }
          });
        } else {
          slot.insertBefore(mapHost, slot.firstChild);
        }
        mapCtl.set(visiblePins(showClosed, catFilter));
      }

      /* תקציר נעץ — במחשב חלונית קטנה מעל הנעץ. */
      var popHideT = null;
      function popHtml(p, big) {
        var t = byId[p.id] || {};
        var c = catT(t);
        var d = GL().drag(t, M.cur);
        var tag = (p.state === "l1" || p.state === "l2")
          ? '<span class="gt-age is-' + p.state + '">' +
              esc(t.flag === "דורש בדיקה חוזרת" ? "תושב אמר שלא הושלמה" : (d.text || ST_LABEL[p.state])) + '</span>'
          : '<span class="gx-stt"><i class="gx-dot s-' + p.state + '"></i>' +
              esc(p.state === "done" ? "נסגרה · " + (t.closure || "") :
                  p.state === "plan" ? "משובצת · " + weekLabel(t.week) : ST_LABEL[p.state]) + '</span>';
        var opened = CBA.gardenStatsCalc.ms(t.createdAt);
        var src = String(t.repId || "").trim() ? "נפתח על ידי תושב" : (t.openedBy === "גנן" ? "נפתח על ידי הגנן" : "נפתח על ידי המנהל");
        return '<div class="gx-pop__t"><u class="s-' + p.state + '">' + ico(c.ico) + '</u>' +
            '<span>' + esc(t.title || t.category || "תקלה") + '</span></div>' +
          '<div class="gx-pop__m">' + esc([t.category, t.area, t.place].filter(Boolean).join(" · ")) + '</div>' +
          (big
            ? '<div class="gx-pop__r">' + tag + (opened ? '<span class="gx-pop__a">נפתחה ' + esc(ago(opened)) + '</span>' : '') + '</div>' +
              '<div class="gx-pop__m">' + esc((t.repId ? GL().reportRef(t.repId) + " · " : "") + src) + '</div>' +
              '<button type="button" class="gd-cta gx-pop__cta" data-open="' + esc(p.id) + '">פתיחת הכרטיס</button>'
            : '<div class="gx-pop__r">' + tag +
              '<button type="button" class="gx-pop__go" data-open="' + esc(p.id) + '">פתיחה ←</button></div>');
      }
      function showPop(p, el, pinned) {
        var pop = root.querySelector("#gx-pop");
        var box = root.querySelector("#gx-mapslot");
        if (!pop || !box || !el) return;
        clearTimeout(popHideT);
        pop.innerHTML = popHtml(p, false);
        pop.hidden = false;
        pop.dataset.pinned = pinned ? "1" : "";
        var r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var x = r.left + r.width / 2 - b.left - pw / 2;
        var y = r.top - b.top - ph - 10;
        var below = y < 8;
        if (below) y = r.bottom - b.top + 10;
        pop.classList.toggle("is-below", below);
        pop.style.left = Math.max(8, Math.min(b.width - pw - 8, x)) + "px";
        pop.style.top = y + "px";
        pop.style.setProperty("--ax", (r.left + r.width / 2 - b.left - Math.max(8, Math.min(b.width - pw - 8, x))) + "px");
      }
      function hidePopSoon() {
        clearTimeout(popHideT);
        popHideT = setTimeout(function () {
          var pop = root.querySelector("#gx-pop");
          if (pop && !pop.matches(":hover") && pop.dataset.pinned !== "1") pop.hidden = true;
        }, 260);
      }
      function hidePop() {
        var pop = root && root.querySelector("#gx-pop");
        if (pop) { pop.hidden = true; pop.dataset.pinned = ""; }
      }

      /* -------------------------- לפי סוג -------------------------- */
      /* 🔴 23.9 (יועד): פס, והסמליל והמספר **בתוך** כל מקטע. לכל מקטע רוחב
         מינימלי כדי שגם תקלה אחת תיקרא; סוג בלי תקלות לא נכנס לפס (הוא
         במקרא). לחיצה על מקטע מסננת את המפה ופותחת את הרשימה. */
      function catBox() {
        var cats = M.period.byCat.filter(function (c) { return c.ids.length; });
        var total = M.period.faultsInPeriod;
        return '<div class="gx-box lgx gx-catbox">' +
          '<h5>תקלות לפי סוג<small>' + total + ' בתקופה</small></h5>' +
          (total
            ? '<div class="gx-cbar' + (catFilter ? ' has-f' : '') + '">' + cats.map(function (c) {
                return '<button type="button" data-cat="' + esc(c.name) + '" title="' + esc(c.name) + ' · ' + c.ids.length + '"' +
                  ' aria-pressed="' + (catFilter === c.name) + '"' + (catFilter === c.name ? ' class="on"' : '') +
                  ' style="flex:' + c.ids.length + ';--cc:var(--c-' + c.key + ')">' + ico(c.ico) +
                  '<b>' + c.ids.length + '</b></button>';
              }).join("") + '</div>'
            : '<div class="gx-cbar is-empty"></div><p class="gx-none">לא נפתחו תקלות בתקופה.</p>') +
        '</div>';
      }

      /* ---------------------------- מגמות ---------------------------- */
      var TR = [
        { k: "bars",  t: "נגררו בכל שבוע",       p: "כמה משימות זזו משבוען",        tab: "נגררו" },
        { k: "lines", t: "זמן עד שיבוץ וסגירה",  p: "ימים, חציון לשבוע",            tab: "זמנים" },
        { k: "pct",   t: "עמידה בתוכנית",        p: "שגרה שבוצעה בשבוע שלה",       tab: "תוכנית" },
        { k: "src",   t: "מי פתח את התקלות",     p: "תושב · מנהל · גנן",            tab: "מי פתח" }
      ];
      /* במחשב 2×2; בטלפון לשוניות על גרף אחד (CSS לפי data-tab). */
      function trendsBox() {
        return '<div class="gx-trends" data-tab="' + trendTab + '">' +
          '<div class="gx-tabs lgx" role="tablist">' + TR.map(function (x, i) {
            return '<button type="button" role="tab" aria-selected="' + (i === trendTab) + '" data-tab="' + i + '"' +
              (i === trendTab ? ' class="on"' : '') + '>' + esc(x.tab) + '</button>';
          }).join("") + '</div>' +
          TR.map(function (x, i) {
            return '<div class="gx-box lgx gx-tr" data-i="' + i + '"><h5>' + esc(x.t) + '</h5><p>' + esc(x.p) + '</p>' +
              chart(x.k) + '</div>';
          }).join("") +
        '</div>';
      }

      /* ================== הגרפים — SVG אחד לכל מגמה ==================
         viewBox 200×72. עמודה לשבוע, השבוע הנוכחי מימין ובגוון בהיר (הוא
         עוד לא נגמר) — בדיוק כמו במוקאפ. ציר אחד לכל גרף, מהאפס. */
      var CW = 200, CH = 72, BASE = 56, TOP = 10;
      /* 23.9 — הגרף ממלא את הקופסה שלו: גובה ה-viewBox נגזר מהיחס
         רוחב/גובה של המקום הפנוי (במחשב הקופסאות גבוהות, 2×2). הטקסט
         נשאר בגודלו כי הרוחב (200) קבוע. */
      function setCH(h) { CH = Math.max(72, Math.min(190, Math.round(h))); BASE = CH - 16; }
      function xAt(i, n) {        // i=0 הישן ביותר, n-1 הנוכחי
        var slot = 188 / n;
        return 6 + (i + 0.5) * slot;
      }
      function axis(n) {
        return '<line x1="4" y1="' + BASE + '" x2="196" y2="' + BASE + '" stroke="var(--gx-line)"/>' +
          '<text x="' + xAt(n - 1, n) + '" y="' + (BASE + 11) + '" text-anchor="middle">השבוע</text>' +
          '<text x="' + xAt(0, n) + '" y="' + (BASE + 11) + '" text-anchor="middle">−' + (n - 1) + '</text>';
      }
      /* תווית קנה המידה בפינה השמאלית העליונה. ⚠️ עברית עם מספר בתוך SVG
         שהוא LTR נקראת הפוך ("ימים 9 עד") — לכן הטקסט עצמו RTL, והעוגן
         "end" (שב-RTL הוא הקצה השמאלי) מצמיד אותו ל-x=6. */
      function scaleLbl(str) {
        return '<text x="6" y="' + (TOP - 1) + '" class="gx-cv" direction="rtl" text-anchor="end" ' +
          'style="direction:rtl;unicode-bidi:embed">' + esc(str) + '</text>';
      }
      function emptyNote(msg) {
        return '<text x="100" y="30" text-anchor="middle" class="gx-cn">' + esc(msg) + '</text>';
      }
      function wkTitle(i) { return weekLabel(M.weekKeys[i]); }
      function chart(k, h) {
        if (h) setCH(h); else setCH(72);
        var n = M.weekKeys.length, T = M.trends, o = "", slot = 188 / n, bw = Math.min(16, slot * 0.62);
        if (k === "bars") {
          var v = T.dragged, mx = Math.max.apply(null, v.concat([1]));
          v.forEach(function (c, i) {
            var h = c ? Math.max(2, (BASE - TOP) * c / mx) : 0;
            o += '<rect x="' + (xAt(i, n) - bw / 2) + '" y="' + (BASE - h) + '" width="' + bw + '" height="' + h +
              '" rx="2" fill="' + (i === n - 1 ? "var(--gx-bar2)" : "var(--gx-bar)") + '"><title>' +
              esc(wkTitle(i) + ": " + c) + '</title></rect>';
          });
          if (v.some(Boolean)) o += scaleLbl("עד " + mx);
          else o += emptyNote("אף משימה לא נגררה בתקופה");
        } else if (k === "lines") {
          if (!M.logOk && !T.close.some(function (x) { return x !== null; })) {
            o += emptyNote("היומן לא נטען");
          } else {
            var all = T.sched.concat(T.close).filter(function (x) { return x !== null; });
            var mx2 = Math.max.apply(null, all.concat([1]));
            var line = function (arr, col, dash, lbl) {
              var pts = [], s = "";
              arr.forEach(function (x, i) {
                if (x === null) return;
                var y = BASE - (BASE - TOP) * x / mx2;
                pts.push(xAt(i, n).toFixed(1) + "," + y.toFixed(1));
                s += '<circle cx="' + xAt(i, n).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.2" fill="' + col + '"><title>' +
                  esc(wkTitle(i) + " · " + lbl + ": " + x + " ימים") + '</title></circle>';
              });
              return (pts.length > 1 ? '<polyline fill="none" stroke="' + col + '" stroke-width="2"' +
                (dash ? ' stroke-dasharray="4 3"' : '') + ' points="' + pts.join(" ") + '"/>' : '') + s;
            };
            o += line(T.close, "var(--gx-bar)", false, "עד סגירה") + line(T.sched, "var(--s-wait)", true, "עד שיבוץ");
            if (all.length) o += scaleLbl("עד " + mx2 + " ימים");
            else o += emptyNote("עוד אין תקלות ששובצו או נסגרו בתקופה");
          }
          o += '<g class="gx-leg"><line x1="146" y1="' + (TOP - 4) + '" x2="156" y2="' + (TOP - 4) + '" stroke="var(--gx-bar)" stroke-width="2"/>' +
            '<text x="144" y="' + (TOP - 1) + '" text-anchor="end">סגירה</text>' +
            '<line x1="186" y1="' + (TOP - 4) + '" x2="196" y2="' + (TOP - 4) + '" stroke="var(--s-wait)" stroke-width="2" stroke-dasharray="4 3"/>' +
            '<text x="184" y="' + (TOP - 1) + '" text-anchor="end">שיבוץ</text></g>';
        } else if (k === "pct") {
          var a = T.adherence, pts = [], dots = "", last = null;
          o += '<line x1="4" y1="' + TOP + '" x2="196" y2="' + TOP + '" stroke="var(--gx-line2)" stroke-dasharray="3 3"/>' +
            '<text x="6" y="' + (TOP - 2) + '" class="gx-cv">100%</text>';
          a.forEach(function (x, i) {
            if (x === null) return;
            var y = BASE - (BASE - TOP) * x / 100;
            /* השבוע הנוכחי — נקודה בהירה בלבד, בלי קו: האחוז שלו חלקי. */
            if (i < n - 1) pts.push(xAt(i, n).toFixed(1) + "," + y.toFixed(1));
            dots += '<circle cx="' + xAt(i, n).toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (i === n - 1 ? 3 : 2.2) +
              '" fill="' + (i === n - 1 ? "var(--gx-bar2)" : "var(--gx-bar)") + '"><title>' +
              esc(wkTitle(i) + ": " + x + "% (" + T.adhDen[i] + " מופעים)") + '</title></circle>';
            /* השבוע הנוכחי עוד לא נגמר — הנקודה שלו בהירה, והתווית
               היא של השבוע האחרון שנסגר, לא של אחוז חלקי. */
            if (i < n - 1) last = { x: xAt(i, n), y: y, v: x };
          });
          if (pts.length > 1) o += '<polyline fill="none" stroke="var(--gx-bar)" stroke-width="2" points="' + pts.join(" ") + '"/>';
          o += dots;
          if (last) o += '<text x="' + Math.min(188, last.x) + '" y="' + Math.max(TOP + 9, last.y - 5) +
            '" text-anchor="middle" class="gx-cb">' + last.v + '%</text>';
          else if (!a.some(function (x) { return x !== null; })) o += emptyNote("עוד אין שגרה מתוכננת בתקופה");
        } else if (k === "src") {
          var S = T.src, mx3 = 1;
          S.forEach(function (s) { mx3 = Math.max(mx3, s.res + s.mgr + s.gard); });
          S.forEach(function (s, i) {
            var y = BASE;
            [["res", "var(--gx-src1)", "תושב"], ["mgr", "var(--gx-src2)", "מנהל"], ["gard", "var(--gx-src3)", "גנן"]].forEach(function (c) {
              var h = (BASE - TOP) * s[c[0]] / mx3;
              if (!h) return;
              y -= h;
              o += '<rect x="' + (xAt(i, n) - bw / 2) + '" y="' + y + '" width="' + bw + '" height="' + h + '" fill="' + c[1] +
                '"' + (i === n - 1 ? ' opacity=".7"' : '') + '><title>' + esc(wkTitle(i) + " · " + c[2] + ": " + s[c[0]]) + '</title></rect>';
            });
          });
          o += '<g class="gx-leg">' +
            '<rect x="186" y="' + (TOP - 8) + '" width="8" height="6" fill="var(--gx-src1)"/><text x="183" y="' + (TOP - 2) + '" text-anchor="end">תושב</text>' +
            '<rect x="152" y="' + (TOP - 8) + '" width="8" height="6" fill="var(--gx-src2)"/><text x="149" y="' + (TOP - 2) + '" text-anchor="end">מנהל</text>' +
            '<rect x="120" y="' + (TOP - 8) + '" width="8" height="6" fill="var(--gx-src3)"/><text x="117" y="' + (TOP - 2) + '" text-anchor="end">גנן</text></g>';
          if (!S.some(function (s) { return s.res + s.mgr + s.gard; })) o += emptyNote("לא נפתחו תקלות בתקופה");
        }
        return '<svg class="gx-chart" viewBox="0 0 ' + CW + ' ' + CH + '" role="img" aria-label="' +
          esc((TR.filter(function (x) { return x.k === k; })[0] || {}).t) + '">' + axis(n) + o + '</svg>';
      }

      /* ============================ הרשימות ============================
         "כל מספר נפתח לרשימה שמאחוריו, וכל שורה ברשימה פותחת את כרטיס
         התקלה המלא." רשימה = {title, sub, sections:[{h, rows:[...]}]}. */
      function row(id, opt) {
        opt = opt || {};
        var t = byId[id] || {};
        var c = catT(t);
        var d = GL().drag(t, M.cur);
        var meta = [t.area, opt.meta].filter(Boolean).join(" · ");
        var tag = opt.tag !== undefined ? opt.tag
                : d.level ? '<span class="gt-age is-l' + d.level + '">' + esc(d.text) + '</span>' : '';
        return '<div class="gx-li' + (opt.cls ? " " + opt.cls : "") + '" data-row="' + esc(id) + '">' +
          '<button type="button" class="gx-li__main" data-open="' + esc(id) + '">' +
            '<span class="gx-ci k-' + c.key + '">' + ico(c.ico) + '</span>' +
            '<span class="gx-rt"><b>' + esc(t.title || t.category || "משימה") + '</b>' +
            '<span>' + esc(meta || "—") + '</span>' +
            (opt.note ? '<span class="gx-li__note">' + esc(opt.note) + '</span>' : '') + '</span>' +
            tag + '</button>' +
          (opt.actions || '') +
        '</div>';
      }
      function srcOf(t) {
        return t.kind === "שגרה" ? "שגרה" : t.kind === "דיווח תושב"
          ? (String(t.repId || "").trim() ? GL().reportRef(t.repId) : "תקלת צוות") : "יזום";
      }
      function whoOf(r) {
        return (CBA.data && CBA.data.gardenLogWho) ? CBA.data.gardenLogWho(r) : (r.who || "");
      }
      function lists(key, arg) {
        var ms = CBA.gardenStatsCalc.ms;
        if (key === "approval") {
          var A = M.now.approval.items;
          return { title: "ממתינות לאישורך", key: key,
            sub: A.length ? "הגנן סימן אותן כבוצעו. אישור סוגר, החזרה פותחת מחדש עם הערה לגנן." : "",
            empty: "אין מה לאשר.",
            sections: [{ rows: A.map(function (a) {
              return row(a.id, { meta: "מחכה " + daysText(a.days) + " · " + srcOf(byId[a.id] || {}),
                note: (byId[a.id] || {}).note || "", tag: "",
                actions: '<div class="gx-li__acts">' +
                  '<button type="button" class="gx-btn is-ok" data-approve="' + esc(a.id) + '">' + ico("check", 14) + 'אישור</button>' +
                  '<button type="button" class="gx-btn" data-return="' + esc(a.id) + '">' + ico("back", 14) + 'החזרה לגנן</button></div>' });
            }) }] };
        }
        if (key === "open") {
          return { title: "תקלות פתוחות", key: key, sub: "מהוותיקה לחדשה.", empty: "אין תקלות פתוחות.",
            big: { n: M.now.open.count, label: M.now.open.undecided + " להחלטה · " + M.now.open.planned + " משובצות" },
            sections: [{ rows: M.now.open.ids.map(function (id) {
              var t = byId[id] || {};
              return row(id, { meta: (t.week ? weekLabel(t.week) : "ממתינה להחלטה") + " · נפתחה " + ago(ms(t.createdAt)) });
            }) }] };
        }
        if (key === "age") {
          /* 🔴 23.9 — הכרטיסייה מראה את **כל** הגילים, עם בורר קבוצה בראשה:
             לחיצה על קבוצה מסננת את הרשימה בלי לסגור (סבב עיצוב 4). */
          var tot = M.now.open.count;
          return { title: "גיל התקלות הפתוחות", key: key,
            big: { n: tot, label: tot ? "תקלות פתוחות · מהוותיקה לחדשה" : "אין תקלות פתוחות" },
            chips: M.now.age.map(function (b, i) { return { i: i, n: b.ids.length, label: b.short }; }),
            pick: arg === undefined ? null : arg,
            empty: "אין תקלות פתוחות.",
            sections: M.now.age.map(function (b, i) {
              return { b: i, h: b.label + " · " + b.ids.length, rows: b.ids.map(function (id) {
                var t = byId[id] || {};
                return row(id, { meta: (t.week ? weekLabel(t.week) : "ממתינה להחלטה") + " · נפתחה " + ago(ms(t.createdAt)) });
              }) };
            }).filter(function (s) { return s.rows.length; }) };
        }
        if (key === "dragged") {
          return { title: "נגררות", key: key, sub: "מהרחוקה ביותר מהשבוע המקורי שלה.", empty: "אין נגררות.",
            big: { n: M.now.dragged.count, label: M.now.dragged.l1 + " שבוע · " + M.now.dragged.l2 + " יותר משבוע" },
            sections: [{ rows: M.now.dragged.items.map(function (d) {
              var t = byId[d.id] || {};
              return row(d.id, { meta: srcOf(t) + " · שבוע מקורי " + weekLabel(d.orig).replace("שבוע ", "") });
            }) }] };
        }
        if (key === "returned") {
          var R = M.period.returned;
          return { title: "חזרו לטיפול", key: key, sub: "ב-" + weeks + " השבועות האחרונים.",
            empty: M.logOk ? "אף תקלה לא חזרה לטיפול בתקופה." : "היומן לא נטען.",
            sections: [
              { h: "משוב תושב · " + R.feedback.length, rows: R.feedback.map(function (r) {
                return row(r.id, { meta: (whoOf(r) || "תושב") + " · " + ago(r.at), note: r.note, tag: "" });
              }) },
              { h: "פתיחה מחדש · " + R.reopen.length, rows: R.reopen.map(function (r) {
                return row(r.id, { meta: (whoOf(r) || "מנהל גינון") + " · " + ago(r.at), tag: "" });
              }) }
            ].filter(function (s) { return s.rows.length; }) };
        }
        if (key === "negative") {
          var N = M.period.negative;
          return { title: "משוב תושבים", key: key,
            sub: N.answered ? N.negative + " שליליים מתוך " + N.answered + " שענו, ב-" + weeks + " השבועות האחרונים." : "",
            empty: M.logOk ? "אף תושב עוד לא ענה בתקופה." : "היומן לא נטען.",
            sections: [{ rows: N.items.map(function (r) {
              return row(r.id, { meta: (whoOf(r) || "תושב") + " · " + ago(r.at), note: r.note,
                tag: '<span class="gx-fb' + (r.negative ? ' is-neg">לא הושלם' : '">הושלם') + '</span>' });
            }) }] };
        }
        if (key === "routine") {
          var RT = M.period.routine;
          return { title: "שגרה שנדחתה", key: key, sub: "לפי תבנית בתוכנית העבודה. כולל מה שבוצע בסוף.",
            empty: "אף מופע של שגרה לא נדחה בתקופה.",
            sections: RT.byTemplate.map(function (g) {
              return { h: g.title + " · " + g.ids.length + (g.ids.length === 1 ? " דחייה" : " דחיות"),
                rows: g.ids.map(function (id) {
                  var t = byId[id] || {};
                  return row(id, { meta: "שבוע מקורי " + weekLabel(t.firstWeek || t.week).replace("שבוע ", "") +
                    (t.closure ? " · " + t.closure : "") });
                }) };
            }).concat(RT.cancelled.length ? [{ h: "בוטלו · " + RT.cancelled.length, rows: RT.cancelled.map(function (id) {
              var t = byId[id] || {};
              return row(id, { meta: weekLabel(t.week) + " · " + (t.closure || ""), tag: "" });
            }) }] : []) };
        }
        if (key === "cat") {
          var C = M.period.byCat.filter(function (c) { return c.name === arg; })[0] || { ids: [] };
          return { title: arg, key: key, sub: "תקלות שנפתחו ב-" + weeks + " השבועות האחרונים. המפה מציגה עכשיו רק את הסוג הזה.",
            empty: "לא נפתחו תקלות מהסוג הזה בתקופה.",
            sections: [{ rows: C.ids.map(function (id) {
              var t = byId[id] || {};
              return row(id, { meta: t.closure ? "נסגרה · " + t.closure : (t.week ? weekLabel(t.week) : "ממתינה להחלטה") });
            }) }] };
        }
        return null;
      }
      function clusterList(pins) {
        return { title: pins.length + " תקלות באותה נקודה", key: "cluster",
          sections: [{ rows: pins.map(function (p) {
            return row(p.id, { meta: ST_LABEL[p.state] });
          }) }] };
      }

      function listBody(L) {
        var any = L.sections.some(function (s) { return s.rows.length; });
        return any ? L.sections.map(function (s) {
          return '<div class="gx-sec"' + (s.b !== undefined ? ' data-b="' + s.b + '"' : '') + '>' +
            (s.h ? '<div class="gx-lh">' + esc(s.h) + '</div>' : '') + s.rows.join("") + '</div>';
        }).join("") : '<p class="gx-none">' + esc(L.empty || "אין מה להציג.") + '</p>';
      }

      function openList(L) {
        if (!L) return;
        hidePeek();
        /* 🔴 23.9 — הכרטיסייה בזכוכית (סבב עיצוב 4): חלון צד במחשב, גיליון
           בטלפון — אותו רכיב (CBA.ui.sheet), רק שכבת עיצוב gx-sheet. */
        var pick = (L.pick === null || L.pick === undefined) ? "" : String(L.pick);
        var sh = CBA.ui.sheet({
          key: "gx-list", label: L.title, cls: "gx-vars gx-sheet",
          html: '<div class="gd-sheet-head"><h4>' + esc(L.title) + '</h4>' +
                  '<button type="button" class="gd-sheet-close" data-close="1">' + ico("x", 14) + 'סגירה</button></div>' +
                (L.big ? '<div class="gx-big"><b>' + L.big.n + '</b><span>' + esc(L.big.label) + '</span></div>' : '') +
                (L.chips ? '<div class="gx-fchips">' + L.chips.map(function (c) {
                  return '<button type="button" data-f="' + c.i + '"' + (String(c.i) === pick ? ' class="on"' : '') +
                    (c.n ? '' : ' disabled') + '><b>' + c.n + '</b><span>' + esc(c.label) + '</span></button>';
                }).join("") + '</div>' : '') +
                (L.sub ? '<p class="sub">' + esc(L.sub) + '</p>' : '') +
                '<div class="gx-list"' + (pick ? ' data-f="' + pick + '"' : '') + '>' + listBody(L) + '</div>',
          onPick: function (e, close) {
            if (e.target.closest("[data-close]")) return close();
            var fc = e.target.closest("[data-f]");
            if (fc && fc.tagName === "BUTTON") {
              /* סינון בתוך הכרטיסייה, בלי לסגור. לחיצה שנייה — הכול. */
              var box = sh.wrap.querySelector(".gx-list");
              var on = box.dataset.f === fc.dataset.f;
              if (on) delete box.dataset.f; else box.dataset.f = fc.dataset.f;
              sh.wrap.querySelectorAll(".gx-fchips button").forEach(function (b) {
                b.classList.toggle("on", !on && b === fc);
              });
              return;
            }
            var ap = e.target.closest("[data-approve]");
            if (ap) return approve(ap.dataset.approve, ap);
            var rt = e.target.closest("[data-return]");
            if (rt) return giveBack(rt.dataset.return, rt);
            var op = e.target.closest("[data-open]");
            if (op) { close(); openCard(op.dataset.open); }
          }
        });
        return sh;
      }

      /* ---- אישור / החזרה לגנן, ישר מהשורה ---- */
      function approve(id, btn) {
        var li = btn.closest(".gx-li");
        btn.disabled = true;
        CBA.data.gardenTask("approve", id, {}, function (res) {
          if (!res || !res.ok) {
            btn.disabled = false;
            CBA.ui.toast((res && res.error) || "האישור נכשל", "error");
            return;
          }
          CBA.ui.toast("אושר ונסגר");
          if (li) li.classList.add("is-gone");
          refresh();
        });
      }
      function giveBack(id, btn) {
        CBA.ui.prompt("מה חסר? ההערה תגיע לגנן.", { title: "החזרה לגנן", okText: "החזרה לגנן",
                                                   placeholder: "למשל: הגזם לא פונה" })
          .then(function (note) {
            note = String(note || "").trim();
            if (!note) return;
            var li = btn.closest(".gx-li");
            btn.disabled = true;
            CBA.data.gardenTask("return", id, { note: note }, function (res) {
              if (!res || !res.ok) {
                btn.disabled = false;
                CBA.ui.toast((res && res.error) || "ההחזרה נכשלה", "error");
                return;
              }
              CBA.ui.toast("הוחזר לגנן");
              if (li) li.classList.add("is-gone");
              refresh();
            });
          });
      }
      function openCard(id) {
        if (CBA.gardenOpenCard) CBA.gardenOpenCard(id, refresh);
      }

      /* ---- הצצה בריחוף (מחשב בלבד): חמש השורות הראשונות של הרשימה ---- */
      var peekEl = null;
      function showPeek(tile) {
        var key = tile.dataset.list;
        var L = lists(key, tile.dataset.i ? +tile.dataset.i : undefined);
        if (!L) return;
        var rows = [];
        L.sections.forEach(function (s) { rows = rows.concat(s.rows); });
        if (!peekEl) {
          peekEl = document.createElement("div");
          peekEl.className = "gx-peek gx-vars";
          document.body.appendChild(peekEl);
        }
        peekEl.innerHTML = '<div class="gx-peek__h">' + esc(L.title) + '</div>' +
          (rows.length ? rows.slice(0, 5).join("") : '<p class="gx-none">' + esc(L.empty || "") + '</p>') +
          (rows.length > 5 ? '<div class="gx-peek__f">ועוד ' + (rows.length - 5) + ' · לחיצה לרשימה המלאה</div>'
                           : (rows.length ? '<div class="gx-peek__f">לחיצה לרשימה המלאה</div>' : ''));
        var r = tile.getBoundingClientRect();
        peekEl.style.display = "block";
        var w = peekEl.offsetWidth, h = peekEl.offsetHeight;
        var x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        var y = r.bottom + 8;
        if (y + h > window.innerHeight - 8) y = Math.max(8, r.top - h - 8);
        peekEl.style.left = x + "px";
        peekEl.style.top = y + "px";
      }
      function hidePeek() {
        clearTimeout(peekTimer);
        if (peekEl) peekEl.style.display = "none";
      }

      /* ============================ חיווט ============================ */
      function wire() {
        root.onclick = function (e) {
          var b;
          if ((b = e.target.closest("[data-weeks]"))) {
            var w = +b.dataset.weeks;
            if (w !== weeks) { weeks = w; recompute(); draw(); }
            return;
          }
          if (e.target.closest('[data-act="retry"]')) { loadErr = null; skeleton(); load(); return; }
          if (e.target.closest('[data-act="closed"]')) {
            showClosed = !showClosed;
            var sw = root.querySelector('[data-act="closed"]');
            sw.setAttribute("aria-pressed", showClosed);
            sw.querySelector(".gx-sw").classList.toggle("on", showClosed);
            hidePop();
            if (mapCtl) mapCtl.set(visiblePins(showClosed, catFilter));
            return;
          }
          if (e.target.closest('[data-act="clearcat"]')) { catFilter = ""; hidePop(); draw(); return; }
          if (e.target.closest('[data-act="leg"]')) {
            legSet(!legOpen());
            var ls = root.querySelector(".gx-leg-slot");
            if (ls) ls.innerHTML = legendHtml();
            return;
          }
          if (e.target.closest('[data-act="fullmap"]')) { openFullMap(); return; }
          if ((b = e.target.closest("[data-cat]"))) {
            var name = b.dataset.cat;
            /* לחיצה על סוג: מסננת את המפה **ופותחת את הרשימה שלו**. לחיצה
               שנייה על אותו סוג מבטלת את הסינון. */
            if (catFilter === name) { catFilter = ""; hidePop(); draw(); return; }
            catFilter = name; hidePop(); draw();
            openList(lists("cat", name));
            return;
          }
          if ((b = e.target.closest("[data-tab]")) && b.closest(".gx-tabs")) {
            trendTab = +b.dataset.tab;
            var tr = root.querySelector(".gx-trends");
            tr.dataset.tab = trendTab;
            tr.querySelectorAll(".gx-tabs button").forEach(function (x, i) {
              x.classList.toggle("on", i === trendTab);
              x.setAttribute("aria-selected", i === trendTab);
            });
            return;
          }
          if ((b = e.target.closest("[data-open]"))) { hidePop(); openCard(b.dataset.open); return; }
          if ((b = e.target.closest("[data-list]"))) {
            openList(lists(b.dataset.list, b.dataset.i ? +b.dataset.i : undefined));
            return;
          }
          /* לחיצה במפה מחוץ לנעץ סוגרת תקציר נעוץ */
          if (!e.target.closest("#gx-pop") && !e.target.closest(".map-marker")) hidePop();
        };
        if (FINE.matches) {
          root.onmouseover = function (e) {
            var t = e.target.closest(".gx-tile[data-list], .gx-ap[data-list], .gx-age-k [data-list]");
            if (!t || t.disabled) return;
            if (t.contains(e.relatedTarget)) return;
            clearTimeout(peekTimer);
            peekTimer = setTimeout(function () { if (alive() && t.matches(":hover")) showPeek(t); }, 380);
          };
          root.onmouseout = function (e) {
            var t = e.target.closest(".gx-tile[data-list], .gx-ap[data-list], .gx-age-k [data-list]");
            if (t && !t.contains(e.relatedTarget)) hidePeek();
            var pop = e.target.closest("#gx-pop");
            if (pop && !pop.contains(e.relatedTarget)) hidePopSoon();
          };
        }
      }

      /* ======================= מפה במסך מלא (טלפון) =======================
         "במסך המלא לוחצים על נעץ, והפרטים עולים מלמטה בחלונית, במקום
         בחלונית שמסתירה את המפה." */
      function openFullMap() {
        var fClosed = showClosed, fCat = catFilter;
        var cats = M.period.byCat.map(function (c) { return c.name; });
        M.map.pins.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
        var wrap = document.createElement("div");
        wrap.className = "gt-sheet-wrap gx-full gx-vars";
        wrap.innerHTML =
          '<div class="gx-full__in" role="dialog" aria-label="מפת התקלות">' +
            '<div class="gd-map gx-full__map"></div>' +
            '<div class="gx-full__tools">' +
              '<button type="button" class="gx-chip lgx" data-close="1" aria-label="סגירה">' + ico("x", 14) + '</button>' +
              '<button type="button" class="gx-chip lgx gx-chip--sw" data-fclosed="1" aria-pressed="' + fClosed + '">' +
                '<i class="gx-sw' + (fClosed ? ' on' : '') + '"></i>סגורות</button>' +
              '<label class="gx-chip lgx gx-chip--sel"><select id="gx-fcat" aria-label="סוג תקלה">' +
                '<option value="">כל הסוגים</option>' +
                cats.map(function (c) { return '<option' + (c === fCat ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join("") +
              '</select>' + ico("chev", 12) + '</label>' +
            '</div>' +
            '<div class="gx-leg-slot gx-leg-slot--full">' + legendHtml() + '</div>' +
            '<div class="gx-full__sheet lgx" hidden><div class="gt-grip" aria-hidden="true"></div><div class="gx-full__body"></div></div>' +
          '</div>';
        var close = CBA.ui.mountSheet(wrap, { key: "gx-fullmap" });
        var host = wrap.querySelector(".gx-full__map");
        var panel = wrap.querySelector(".gx-full__sheet");
        var ctl = mountPins(host, {
          onPin: function (p) {
            panel.querySelector(".gx-full__body").innerHTML = popHtml(p, true);
            panel.hidden = false;
          },
          onCluster: function (list) {
            panel.querySelector(".gx-full__body").innerHTML =
              '<div class="gx-list">' + listBody(clusterList(list)) + '</div>';
            panel.hidden = false;
          }
        });
        function set() { ctl.set(visiblePins(fClosed, fCat)); panel.hidden = true; }
        set();
        wrap.addEventListener("click", function (e) {
          if (e.target.closest("[data-close]")) return close();
          if (e.target.closest('[data-act="leg"]')) {
            legSet(!legOpen());
            wrap.querySelector(".gx-leg-slot").innerHTML = legendHtml();
            return;
          }
          var sw = e.target.closest("[data-fclosed]");
          if (sw) {
            fClosed = !fClosed;
            sw.setAttribute("aria-pressed", fClosed);
            sw.querySelector(".gx-sw").classList.toggle("on", fClosed);
            return set();
          }
          var op = e.target.closest("[data-open]");
          if (op) { close(); openCard(op.dataset.open); return; }
          if (!e.target.closest(".gx-full__sheet") && !e.target.closest(".map-marker") &&
              !e.target.closest(".gx-full__tools")) panel.hidden = true;
        });
        wrap.querySelector("#gx-fcat").addEventListener("change", function (e) { fCat = e.target.value; set(); });
      }
    }
  };

  /* ==========================================================================
   *  שכבת הנעצים — מעל רכיב המפה המשותף (CBA.map), בלי לשנות אותו
   * --------------------------------------------------------------------------
   *  🔑 "המפה הקיימת כבר יודעת לצייר סימונים ולהגיב ללחיצה, ולכן צריך
   *     להוסיף רק שכבה." — markers + onMarker של CBA.map, ואנחנו רק
   *     ממלאים את האלמנט: נעץ בצבע המצב, והסמליל הלבן של הקטגוריה בתוכו.
   *  🔑 **אשכולות:** נעצים שנופלים ממש באותה נקודה על המסך מתאחדים לעיגול
   *     עם מספר, בצבע של החמור שבהם — ונפרדים כשמגדילים. הזום נקרא
   *     מ-`--inv` שהרכיב כותב על העולם בכל שינוי (MutationObserver), כך
   *     שאין צורך בשום ממשק חדש ב-resident.js.
   *  ⚠️ גודל הנעץ קבוע על המסך (`scale(var(--inv))`) — אחרת בזום אאוט הוא
   *     נעלם ובזום אין הוא מכסה בית שלם.
   * ======================================================================== */
  function mountPins(host, o) {
    var list = [], groups = [], lastScale = 0, raf = 0;
    var api = CBA.map.render(host, {
      head: false, search: false, legend: false, hint: false, popup: false,
      onMarker: function (id, m) {
        if (m.cluster) { if (o.onCluster) o.onCluster(m.pins); return; }
        if (o.onPin) o.onPin(m.pin, markerEl(m));
      }
    });
    var world = host.querySelector(".map-world") || host.querySelector("#map-world");
    /* קנה המידה נקרא מה-transform שהרכיב כותב על העולם בכל תזוזה.
       (`--inv` נכתב רק כשיש שבבי מבני ציבור — לא לסמוך עליו לבד.) */
    function scale() {
      var m = world && /scale\(([\d.eE+-]+)\)/.exec(world.style.transform || "");
      if (m && +m[1] > 0) return +m[1];
      var inv = parseFloat(world && world.style.getPropertyValue("--inv"));
      return inv > 0 ? 1 / inv : 1;
    }
    function worldWH() {
      return { w: parseFloat(world && world.style.width) || 1000, h: parseFloat(world && world.style.height) || 1000 };
    }
    function markerEl(m) {
      var els = world ? world.querySelectorAll(".map-marker") : [];
      return els[groups.indexOf(m)] || null;
    }
    function pinSvg(state, catIco) {
      var K = CBA.gardenKit, body = (K && K.ICONS && K.ICONS[catIco]) || "";
      /* 23.9 — צל קרקע קטן מתחת לחוד: הנעץ "עומד" על המפה ולא מודבק עליה. */
      return '<svg viewBox="0 0 24 30" aria-hidden="true">' +
        '<ellipse class="gx-pin__g" cx="12" cy="29" rx="4.2" ry="1.5"/>' +
        '<path class="gx-pin__b s-' + state + '" ' +
        'd="M12 .8C5.8.8.8 5.7.8 11.8.8 19.6 12 29.2 12 29.2s11.2-9.6 11.2-17.4C23.2 5.7 18.2.8 12 .8Z"/>' +
        '<g transform="translate(5 4.6) scale(.5833)" fill="none" stroke="#fff" stroke-width="2.6" ' +
        'stroke-linecap="round" stroke-linejoin="round">' + body + '</g></svg>';
    }
    function build() {
      var s = scale(), WH = worldWH();
      lastScale = s;
      host.style.setProperty("--gx-inv", (1 / s).toFixed(4));
      var R = 22 / s;                         // 22 פיקסלי מסך
      var sorted = list.slice().sort(function (a, b) {
        return CBA.gardenStatsCalc.SEVERITY[b.state] - CBA.gardenStatsCalc.SEVERITY[a.state];
      });
      var gs = [];
      sorted.forEach(function (p) {
        var px = p.x * WH.w, py = p.y * WH.h, hit = null;
        for (var i = 0; i < gs.length; i++) {
          if (Math.abs(gs[i].px - px) < R && Math.abs(gs[i].py - py) < R) { hit = gs[i]; break; }
        }
        if (hit) hit.pins.push(p); else gs.push({ px: px, py: py, pins: [p] });
      });
      groups = gs.map(function (g) {
        var top = g.pins[0];   // החמור ביותר — המיון למעלה
        if (g.pins.length === 1) {
          return { id: top.id, x: top.x, y: top.y, pin: top, cls: "gx-pin",
                   title: ST_LABEL[top.state] + " · " + (top.category || "") };
        }
        var sx = 0, sy = 0;
        g.pins.forEach(function (p) { sx += p.x; sy += p.y; });
        return { id: "c" + top.id, x: sx / g.pins.length, y: sy / g.pins.length, cluster: true,
                 pins: g.pins, state: top.state, cls: "gx-pin gx-pin--c",
                 title: g.pins.length + " תקלות באותה נקודה" };
      });
      api.setMarkers(groups);
      var els = world.querySelectorAll(".map-marker");
      groups.forEach(function (g, i) {
        var el = els[i];
        if (!el) return;
        if (g.cluster) {
          el.innerHTML = '<span class="gx-clu s-' + g.state + '">' + g.pins.length + '</span>';
        } else {
          el.innerHTML = pinSvg(g.pin.state, g.pin.ico || catIcoOf(g.pin.category));
          if (o.onHover) {
            el.addEventListener("mouseenter", function () { o.onHover(g.pin, el, true); });
            el.addEventListener("mouseleave", function () { o.onHover(g.pin, el, false); });
          }
        }
      });
    }
    function catIcoOf(name) { return CBA.gardenLang.catOf(name).ico; }
    if (world && window.MutationObserver) {
      new MutationObserver(function () {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = 0;
          var s = scale();
          /* על המכל ולא על העולם — כתיבה לעולם הייתה מפעילה את המשקיף הזה שוב. */
          host.style.setProperty("--gx-inv", (1 / s).toFixed(4));
          if (lastScale && Math.abs(s - lastScale) / lastScale > 0.12) build();
        });
      }).observe(world, { attributes: true, attributeFilter: ["style"] });
    }
    /* התצוגה מתאימה את עצמה לנעצים — רק כשקבוצת הנעצים השתנתה (פתיחה,
       מסנן סוג, המתג "סגורות"), כדי שמעבר תקופה לא יזרוק את הזום של המשתמש. */
    var fitKey = "";
    function fit() {
      if (!api.fitBox || !list.length) return;
      var x0 = 1, y0 = 1, x1 = 0, y1 = 0;
      list.forEach(function (p) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
      });
      /* 🔴 23.9 (יועד: "המפה נפתחת מאוד בפנים") — התיבה של הנעצים לבדה
         הייתה צמודה מדי: שני נעצים קרובים = זום עמוק, בלי הקשר של השכונה.
         עכשיו: מרווח של 10% סביב הנעצים, והתיבה לעולם לא קטנה מ-55% מרוחב
         וגובה השכונה. כך רואים איפה הנעצים ביחס לשאר השיכון. */
      var MIN = 0.55, PAD = 0.10;
      var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      var w = Math.max(MIN, (x1 - x0) + 2 * PAD), h = Math.max(MIN, (y1 - y0) + 2 * PAD);
      var bx0 = Math.max(0, Math.min(1 - w, cx - w / 2)), by0 = Math.max(0, Math.min(1 - h, cy - h / 2));
      api.fitBox(bx0, by0, Math.min(1, bx0 + w), Math.min(1, by0 + h), 24);
    }
    return {
      set: function (pins) {
        list = pins || [];
        var k = list.map(function (p) { return p.id; }).sort().join(",");
        if (k !== fitKey) { fitKey = k; fit(); }
        build();
      },
      api: api
    };
  }
})();
