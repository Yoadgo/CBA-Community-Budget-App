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
    chev:  '<path d="m6 9 6 6 6-6"/>',
    /* 23.9 — סמלילי האריחים (Lucide: sprout · hourglass · star) */
    sprout2: '<path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/>',
    clock2: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
    star:  '<path d="M11.5 2.9a.5.5 0 0 1 .9 0l2.3 4.7a2 2 0 0 0 1.5 1.1l5.2.8a.5.5 0 0 1 .3.9l-3.8 3.7a2 2 0 0 0-.6 1.8l.9 5.2a.5.5 0 0 1-.7.5l-4.6-2.5a2 2 0 0 0-1.9 0l-4.6 2.5a.5.5 0 0 1-.7-.5l.9-5.2a2 2 0 0 0-.6-1.8L2.4 10.4a.5.5 0 0 1 .3-.9l5.2-.8a2 2 0 0 0 1.5-1.1z"/>'
  };
  function ico(n, w) {
    var K = CBA.gardenKit;
    /* 23.9 — יישור קו: x/check/cloud/מסך מלא/החזרה מגיעים מהערכה (Lucide). */
    var A = { full: "expand", back: "undo" };
    var body = OWN[n] || (K && K.ICONS && K.ICONS[A[n] || n]) || "";
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

  /* GXB1 (גל 9, 1.10.26) — מצב התצוגה ברמת המודול: שורד ציור מחדש שקט (שינוי גינון ברקע), מתאפס רק בניווט אמיתי. */
  function freshState() {
    return { weeks: 8, showClosed: false, catFilter: "", chartTab: "work", mv: "now", selWk: null,
             raw: null, mapHost: null, mapCtl: null, pinCb: null };
  }
  /* 🌱 GP-6.10:S2 — ⚠️ ברמת המודול ולא בתוך render(): load() יכול לענות
     **מיד** (מטמון), ואז draw() רץ לפני ששורות ה-var שבתוך render הספיקו
     לרוץ — CTABS היה undefined והמסך נפל. אותו באג בדיוק כמו FLOW_H/TR. */
  var CTABS = [
    { k: "work",   t: "עבודה שבוצעה" },
    { k: "faults", t: "תקלות נפתחו/נסגרו" },
    { k: "time",   t: "זמני טיפול" },
    { k: "drag",   t: "גרירות" }
  ];
  var SVGNS = "http://www.w3.org/2000/svg";
  var LEG_STATES = [["wait", "להחלטה"], ["plan", "משובצת"], ["appr", "לאישורך"],
                    ["l1", "נגררה"], ["l2", "נגררה 2+"], ["done", "נסגרה"]];
  var LEG_CATS = [["lawn", "דשא"], ["water", "השקיה"], ["tree", "עצים"], ["prune", "גיזום"],
                  ["weed", "עשבייה"], ["clean", "ניקיון/גזם"], ["bed", "ערוגות"]];
  var S = freshState();
  /* GXB2 (גל 9, 1.10.26) — חלונית הצצה אחת למודול (לא אחת לכל ציור), כדי שציור מחדש לא ישאיר אותה תקועה על המסך. */
  var peekEl = null, peekTimer = null;
  /* GXB3 (גל 9, 1.10.26) — מאזין resize יחיד למודול, שמפנה לציור הנוכחי בלבד (במקום מאזין חדש בכל ציור). */
  var curResize = null;
  window.addEventListener("resize", function () { if (curResize) curResize(); });

  CBA.screens.gardenStats = {
    render: function (container) {
      /* GXB1 (גל 9, 1.10.26) — ניווט אמיתי מאפס; ציור שקט ממשיך מאותו מצב (תקופה, סינון, מגמה, מפה). */
      var silentRedraw = !!CBA.renderSilent;
      if (!silentRedraw) S = freshState();
      var weeks = S.weeks;
      var raw = null;          // מה שנקרא מ-Firestore
      var M = null;            // מה שחושב
      var byId = {};
      var loadErr = null;
      var showClosed = S.showClosed;
      var catFilter = S.catFilter;      // שם הקטגוריה שמסננת את המפה
      var chartTab = S.chartTab, mv = S.mv, selWk = S.selWk;   // GP-6.10:S2
      /* GXB1 (גל 9, 1.10.26) — המפה (והזום שלה) עוברת בין ציורים רק אם נצייר אותה מיד, באותה קריאה סינכרונית —
         אחרת ה-ResizeObserver של המפה רואה אותה מנותקת ומתנתק לתמיד. */
      var reuseMap = !!(silentRedraw && S.raw && S.mapHost && S.mapCtl);
      var mapHost = reuseMap ? S.mapHost : null, mapCtl = reuseMap ? S.mapCtl : null;
      if (!reuseMap) { S.mapHost = null; S.mapCtl = null; }
      function keepState() { S.weeks = weeks; S.showClosed = showClosed; S.catFilter = catFilter;
        S.chartTab = chartTab; S.mv = mv; S.selWk = selWk; }

      hidePeek();   // GXB2 (גל 9, 1.10.26) — הצצה פתוחה מהציור הקודם נסגרת
      /* A0/A1 (אושר ע"י יועד 30.9.26, ספר האבנים) — סרגל ניהול דק מעל המסך:
         "נתוני גינון" · מונים "ממתינות לאישורך" ו"נגררות" (אותם מספרים של
         M.now — הכרטיס והאריח) · "לאישור ←" = אותה רשימת אישור שהקישור בכרטיס
         פותח. לא כפתור "+" — ולכן act עם plus:false (בלי data-plus) וחץ במקום
         "+" בטלפון. אין כאן שורת כותרת להסיר (סבב עיצוב 4, 23.9); שלוש
         העמודות נשארות בגוף. בלי canopy.js — המסך בדיוק כמו קודם. */
      var barEl = null;
      if (CBA.canopy && CBA.canopy.shell) {
        var sh = CBA.canopy.shell(container, { key: "gardenStats", dom: "gar", title: "נתוני גינון",
          ico: '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
          pills: [{ id: "gx-p-appr", k: "ממתינות לאישורך", hidden: true }, { id: "gx-p-drag", k: "נגררות" }],
          act: { id: "gx-bar-appr", label: "לאישור ←", aria: "לאישור", plus: false, short: "←", hidden: true } });
        barEl = sh.bar;
        sh.body.innerHTML = '<div class="gd-screen gx gx-vars" id="gx-root"></div>';
        /* onclick (השמה) — מחליף את מאזין הציור הקודם ומפנה תמיד לציור הנוכחי. */
        barEl.querySelector("#gx-bar-appr").onclick = function () {
          if (M) openList(lists("approval"));
        };
        barEl.querySelector("#gx-p-appr").onclick = function () { jumpTo(".gx-ap"); };
        barEl.querySelector("#gx-p-drag").onclick = function () { jumpTo('.gx-tile[data-list="dragged"]'); };
      } else {
        container.innerHTML = '<div class="gd-screen gx gx-vars" id="gx-root"></div>';
      }
      var root = container.querySelector("#gx-root");
      if (!reuseMap) skeleton();   // GXB1 (גל 9, 1.10.26) — בציור שקט עם מפה: ציור מיידי בסוף render (ר' שם)
      load();

      function alive() { return root && root.isConnected; }

      /* A0 — מוני הסרגל אחרי כל ציור. "ממתינות לאישורך" ו"לאישור ←" גלויים
         באותם תנאים של הכרטיס והקישור שבו: המונה כשהמתג "אישור מנהל" דלוק,
         הכפתור רק כשיש מה לאשר. בזמן טעינה/כשל — "—". */
      function updateBar(sk) {
        if (!barEl) return;
        var ok = !sk && !loadErr && M;
        var a = ok ? M.now.approval : null;
        barEl.querySelector("#gx-p-appr").hidden = !!(ok && !a.on);
        CBA.canopy.pill(barEl, "gx-p-appr", ok ? a.count : null);
        CBA.canopy.pill(barEl, "gx-p-drag", ok ? M.now.dragged.count : null);
        barEl.querySelector("#gx-bar-appr").hidden = !(ok && a.on && a.count);
      }
      function jumpTo(sel) {
        var el = root.querySelector(sel);
        if (!el) return;
        try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
      }

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
          S.raw = res;   // GXB1 (גל 9, 1.10.26) — לציור השקט הבא
          byId = {};
          (res.rows || []).forEach(function (t) { byId[String(t.id)] = t; });
          recompute();
          draw(true);    // GXB1 (גל 9, 1.10.26) — רענון נתונים: לא מזיזים את הזום של המשתמש
        });
      }
      function recompute() {
        if (!raw) return;
        M = CBA.gardenStatsCalc.compute(raw.rows, raw.log, {
          weeks: weeks, categories: raw.categories,
          requireApproval: raw.requireApproval, requireApprovalRoutine: raw.requireApprovalRoutine,
          logOk: raw.logOk
        });
      }
      /* אחרי פעולה (אישור, החזרה, או כל פעולה בכרטיס) — טעינה מחדש שקטה. */
      function refresh() { if (alive()) load(); }

      /* ============================ שלד ============================ */
      function skeleton() {
        /* SKB1 (גל 9, 1.10.26) — שורש השלד: אזור חי אחד "טוען…" */
        /* GP-6.10:S2 — אותו שלד של הסידור החדש: אריחים, גרף + מפה, פירוט. */
        root.innerHTML = '<div class="gx2 gx2-skel" role="status" aria-busy="true" aria-label="טוען…">' +
          '<div class="gx2-kpis">' + '<div class="skeleton" style="height:118px;border-radius:20px"></div>'.repeat(4) + '</div>' +
          '<div class="gx2-main"><div class="skeleton" style="height:420px;border-radius:22px"></div>' +
            '<div class="skeleton gx2-skmap" style="height:420px;border-radius:22px"></div></div>' +
          '<div class="gx2-detail">' + '<div class="skeleton" style="height:130px;border-radius:20px"></div>'.repeat(3) + '</div></div>';
        updateBar(true);
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
      /* ==========================================================================
       *  🌱 GP-6.10:S2 — סידור חדש (סקיצה "פאצ' גינון" גרסה 3, אישור יועד 6.10.26)
       * --------------------------------------------------------------------------
       *  שלוש שורות במקום שלוש עמודות:
       *    1. "עכשיו" — 4 אריחים: ממתינות לאישורך · פתוחות עכשיו (תקלות/שגרה)
       *       · נגררות · טופלו השבוע.
       *    2. גרף גדול אחד עם 4 לשוניות + המפה לידו.
       *    3. פירוט — גיל התקלות · הכי נגררות · איכות בתקופה.
       *  🔑 הכול לפי רוחב **המכל** (container query על #gx-root), לא המסך —
       *     במכל צר (טלפון): סרגל דביק "עכשיו · מגמות · מפה", חלק אחד בכל
       *     פעם, וב"מגמות" ארבעת הגרפים אחד אחרי השני (בקשת יועד 6.10).
       *  🔑 הגרפים בפיקסלים אמיתיים (נמדדים אחרי הציור), לא viewBox שנמתח.
       * ======================================================================== */
      function draw(dataOnly) {
        hidePeek();
        keepState();   // GXB1 (גל 9, 1.10.26)
        if (loadErr) {
          /* GXB1 (גל 9, 1.10.26) — המפה יוצאת מה-DOM כאן, ולכן לא עוברת הלאה (ה-ResizeObserver שלה מתנתק). */
          mapHost = mapCtl = null; S.mapHost = S.mapCtl = null;
          root.innerHTML =
            '<div class="gx-err lgx"><u>' + ico("cloud", 22) + '</u><b>לא הצלחתי לטעון</b>' +
            '<span>' + esc(loadErr) + '</span>' +
            '<button type="button" class="gd-cta" data-act="retry">נסה שוב</button></div>';
          wire();
          updateBar();
          return;
        }
        if (!M) { skeleton(); return; }
        var a = M.now.approval;
        root.innerHTML =
          (M.logOk ? '' :
            '<div class="gx-warn">' + ico("cloud", 16) + '<span>יומן הפעולות לא נטען, ולכן "חזרו לטיפול", ' +
            '"משוב שלילי" וזמני הטיפול מסומנים "—". שאר המספרים מעודכנים. ' +
            '<button type="button" data-act="retry">לנסות שוב</button></span></div>') +
          '<div class="gx2" data-mv="' + mv + '">' +
            '<nav class="gx2-mnav" aria-label="חלקי המסך">' +
              [["now", "עכשיו"], ["trend", "מגמות"], ["map", "מפה"]].map(function (x) {
                return '<button type="button" data-mv="' + x[0] + '"' + (mv === x[0] ? ' class="on" aria-current="true"' : '') + '>' +
                  x[1] + (x[0] === "now" && a.on && a.count ? '<em>' + a.count + '</em>' : '') + '</button>';
              }).join("") +
            '</nav>' +
            '<div class="gx2-kpis' + (a.on ? '' : ' n3') + '" data-sec="now">' +
              approvalTile() + openTile() + dragTile() + doneTile() + '</div>' +
            '<div class="gx2-main">' + trendCard() + whereCard() + '</div>' +
            '<div class="gx2-detail">' +
              '<div data-sec="now">' + ageBox() + '</div>' +
              '<div data-sec="now">' + topBox() + '</div>' +
              '<div data-sec="trend">' + qualityBox() + '</div>' +
            '</div>' +
          '</div>';
        wire();
        updateBar();
        placeMap(dataOnly);
        drawCharts();
      }
      /* מצייר כל גרף **גלוי** ברוחב שלו בפועל. גרף מוסתר (לשונית אחרת,
         או "הכול" במחשב) לא נמדד — ייצוייר כשיוצג. */
      function drawCharts() {
        if (!M || !root) return;
        root.querySelectorAll(".gx2-chart").forEach(function (host) {
          if (!host.offsetParent) return;
          paintChart(host, host.dataset.k);
        });
      }
      var rsT = null, lastW = 0;
      function onResize() {
        if (!alive()) { if (curResize === onResize) curResize = null; return; }   // GXB3 (גל 9, 1.10.26)
        clearTimeout(rsT);
        rsT = setTimeout(function () {
          if (!alive() || !M) return;
          var w = root.clientWidth;
          if (w === lastW) return;
          lastW = w; drawCharts();
        }, 160);
      }
      curResize = onResize;   // GXB3 (גל 9, 1.10.26) — המאזין היחיד ברמת המודול מפנה לכאן

      /* ---------------------------- עכשיו ---------------------------- */
      /* GP-6.10:S2 — "ממתינות לאישורך" = האריח הכהה, הפעולה הראשית. מופיע רק
         כשאחד משני מתגי האישור דלוק (תקלות / שגרה). */
      function approvalTile() {
        var a = M.now.approval;
        if (!a.on) return '';
        return '<button type="button" class="gx-tile gx2-t is-dark' + (a.count ? '' : ' is-calm') + '" data-list="approval">' +
          '<span class="gx2-n">' + a.count + '</span>' +
          '<span class="gx2-b"><span class="gx2-k">ממתינות לאישורך</span>' +
            '<span class="gx2-s">' + (a.count
              ? '<b>' + a.routine + '</b> שגרה · <b>' + a.faults + '</b> ' + (a.faults === 1 ? 'תקלה' : 'תקלות') +
                ' · הוותיקה מחכה ' + esc(daysText(a.oldestDays))
              : 'אין מה לאשר') + '</span></span>' +
          (a.count ? '<span class="gx2-go">לאישור ←</span>' : '') + '</button>';
      }
      /* GP-6.10:S1 — "פתוחות עכשיו" מפוצל: תקלות | שגרה. כל חצי פותח רשימה משלו. */
      function openTile() {
        var o = M.now.open, r = M.now.openRoutine;
        return '<div class="gx2-t gx2-open">' +
          '<span class="gx2-k">פתוחות עכשיו</span>' +
          '<div class="gx2-split">' +
            '<button type="button" data-list="open"><span class="gx2-s"><i class="gx2-sw is-f"></i>תקלות</span>' +
              '<span class="gx2-n">' + o.count + '</span>' +
              '<span class="gx2-s"><b>' + o.undecided + '</b> לשיבוץ · <b>' + o.planned + '</b> משובצות</span></button>' +
            '<button type="button" data-list="openR"><span class="gx2-s"><i class="gx2-sw is-r"></i>שגרה</span>' +
              '<span class="gx2-n">' + r.count + '</span>' +
              '<span class="gx2-s"><b>' + r.thisWeek + '</b> השבוע · <b>' + r.late + '</b> מאחרות</span></button>' +
          '</div></div>';
      }
      function dragTile() {
        var d = M.now.dragged;
        return '<button type="button" class="gx-tile gx2-t" data-list="dragged">' +
          '<span class="gx2-k">נגררות</span><span class="gx2-n">' + d.count + '</span>' +
          '<span class="gx2-s"><b>' + d.l1 + '</b> שבוע · <b>' + d.l2 + '</b> יותר</span>' +
          '<span class="gx2-go" data-go="drag">לגרף ←</span></button>';
      }
      /* "טופלו השבוע" — עד עכשיו, מול הממוצע של השבועות שכבר נגמרו בתקופה.
         ⚠️ השבוע עוד לא נגמר, ולכן "מתחת לממוצע" בתחילת שבוע אינו כישלון —
         הפער מוצג בצבע ניטרלי, לא באדום. */
      function doneTile() {
        var T = M.trends, n = T.doneR.length, last = n - 1;
        var tot = T.doneR.map(function (r, i) { return r + T.doneF[i]; });
        var done = tot.slice(0, last), avg = done.length ? Math.round(sum(done) / done.length) : null;
        var cur = tot[last], dl = avg === null ? null : cur - avg;
        var mx = Math.max.apply(null, tot.concat([1]));
        var pts = tot.map(function (v, i) {
          return (4 + i * (112 / Math.max(1, n - 1))).toFixed(1) + "," + (27 - 22 * v / mx).toFixed(1);
        }).join(" ");
        return '<button type="button" class="gx-tile gx2-t" data-go="work">' +
          '<span class="gx2-k">טופלו השבוע</span>' +
          '<span class="gx2-n">' + cur + (dl === null ? '' :
            '<span class="gx2-delta' + (dl > 0 ? '' : ' is-flat') + '">' +
              (dl > 0 ? '↑ ' + dl + ' מהממוצע' : dl < 0 ? '↓ ' + (-dl) + ' מהממוצע' : 'כמו הממוצע') + '</span>') + '</span>' +
          '<svg class="gx2-spark" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">' +
            '<polyline points="' + pts + '" fill="none" stroke="var(--c-rout2)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>' +
          '<span class="gx2-go">לגרף ←</span></button>';
      }

      /* ---------------------------- בתקופה ---------------------------- */
      function qualityBox() {
        var r = M.period.returned, n = M.period.negative, rt = M.period.routine, dash = !M.logOk;
        return '<div class="gx-box gx2-box"><h5>איכות בתקופה<small>' + weeks + ' שבועות</small></h5>' +
          '<div class="gx2-q3">' +
            '<button type="button" data-list="returned"><span class="gx2-n">' + (dash ? "—" : (r.feedback.length + r.reopen.length)) + '</span>' +
              '<span>חזרו לטיפול<br>' + (dash ? 'היומן לא נטען' : r.feedback.length + ' משוב · ' + r.reopen.length + ' פתיחה') + '</span></button>' +
            '<button type="button" data-list="negative"><span class="gx2-n">' + (dash || n.pct === null ? "—" : n.pct + '%') + '</span>' +
              '<span>משוב שלילי<br>' + (dash ? 'היומן לא נטען' : n.answered ? n.negative + ' מתוך ' + n.answered : 'אף תושב לא ענה') + '</span></button>' +
            '<button type="button" data-list="routine"><span class="gx2-n">' + rt.deferred.length + '</span>' +
              '<span>שגרה שנדחתה<br>' + (rt.cancelled.length ? 'ועוד ' + rt.cancelled.length + ' בוטלו' : 'אף מופע לא בוטל') + '</span></button>' +
          '</div></div>';
      }
      function sum(a) { return a.reduce(function (s, x) { return s + (x || 0); }, 0); }

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
      /* LEG_STATES / LEG_CATS — ברמת המודול (GP-6.10, אותו hoisting כמו CTABS). */
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
          }).join("") + '</div>' +
          /* 🌱 4.10 — שלושת התגים של נעץ ב' (js/ui/gardenPins.js). */
          '<div class="gx-leg__sep"></div><div class="gx-leg__g gx-leg__g--tags">' +
            '<span title="כמה תושבים מחכים לתשובה"><b class="gx-lt gx-lt--res">2</b><em>מחכים</em></span>' +
            '<span><b class="gx-lt gx-lt--rep">' + ico("undo", 9) + '</b><em>חוזרת</em></span>' +
            '<span title="משויכת לממטרה או למקטע דשא"><b class="gx-lt gx-lt--lnk"></b><em>משויכת</em></span>' +
          '</div></div>';
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
      function placeMap(dataOnly) {
        var slot = root.querySelector("#gx-mapslot");
        if (!slot || !CBA.map) return;
        /* GXB1 (גל 9, 1.10.26) — המפה עשויה לעבור לציור הבא, ולכן הנעצים פונים לציור הנוכחי דרך S.pinCb. */
        S.pinCb = {
          onPin: function (p, el) { showPop(p, el, true); },
          onHover: function (p, el, on) { if (FINE.matches) { if (on) showPop(p, el, false); else hidePopSoon(); } },
          onCluster: function (list) { openList(clusterList(list)); }
        };
        if (!mapHost) {
          mapHost = document.createElement("div");
          mapHost.className = "gd-map gx-map";
          slot.insertBefore(mapHost, slot.firstChild);
          mapCtl = mountPins(mapHost, {
            onPin: function (p, el) { if (S.pinCb) S.pinCb.onPin(p, el); },
            onHover: function (p, el, on) { if (S.pinCb) S.pinCb.onHover(p, el, on); },
            onCluster: function (list) { if (S.pinCb) S.pinCb.onCluster(list); }
          });
          S.mapHost = mapHost; S.mapCtl = mapCtl;   // GXB1 (גל 9, 1.10.26)
        } else {
          slot.insertBefore(mapHost, slot.firstChild);
        }
        /* GXB1 (גל 9, 1.10.26) — רענון נתונים לא מתאים מחדש את התצוגה; רק מסנן/מתג/פתיחה ראשונה. */
        mapCtl.set(visiblePins(showClosed, catFilter), !!dataOnly);
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

      /* -------------------------- איפה -------------------------- */
      /* 🔴 23.9 (יועד): פס, והסמליל והמספר **בתוך** כל מקטע. סוג בלי תקלות לא
         נכנס לפס. לחיצה על מקטע מסננת את המפה ופותחת את הרשימה.
         GP-6.10:S2 — הפס יושב ישר בכרטיס "איפה", מעל המפה. */
      function whereCard() {
        var mp = M.map, cats = M.period.byCat.filter(function (c) { return c.ids.length; });
        var total = M.period.faultsInPeriod;
        return '<section class="gx2-card gx2-where" data-sec="map" aria-label="איפה">' +
          '<div class="gx2-ch"><h4>איפה</h4><small>' + mp.openWithLoc + ' מתוך ' + mp.openTotal + ' תקלות פתוחות עם מיקום</small></div>' +
          (total
            ? '<div class="gx-cbar gx2-cbar' + (catFilter ? ' has-f' : '') + '" aria-label="תקלות לפי סוג">' + cats.map(function (c) {
                return '<button type="button" data-cat="' + esc(c.name) + '" title="' + esc(c.name) + ' · ' + c.ids.length + '"' +
                  ' aria-pressed="' + (catFilter === c.name) + '"' + (catFilter === c.name ? ' class="on"' : '') +
                  ' style="flex:' + c.ids.length + ';--cc:var(--c-' + c.key + ')">' + ico(c.ico) +
                  '<b>' + c.ids.length + '</b></button>';
              }).join("") + '</div>'
            : '<p class="gx-none">לא נפתחו תקלות בתקופה.</p>') +
          mapBox() +
        '</section>';
      }

      /* ==================== מגמות — גרף אחד, ארבע לשוניות ====================
         GP-6.10:S2. שתי לשוניות משלבות זוגות שהיו גרפים נפרדים:
           עבודה שבוצעה = "טופלו" + "עמידה בתוכנית" (מסגרת מקווקוות = שגרה
             שתוכננה לשבוע, מילוי = מה שנסגר כ"בוצע" באותו שבוע).
           תקלות נפתחו/נסגרו = "מי פתח" + כמה נסגרו (קו על אותו ציר).
         ⚠️ אין ציר כפול באף לשונית. השבוע הנוכחי מימין ושקוף-למחצה. */
      /* CTABS ו-SVGNS ברמת המודול (למעלה) — ר' ההערה שם על hoisting. */
      function trendCard() {
        return '<section class="gx2-card gx2-trend" data-sec="trend" aria-label="לאורך זמן">' +
          '<div class="gx2-ch"><h4>לאורך זמן</h4>' + seg() + '</div>' +
          '<div class="gx2-tabs" role="tablist">' + CTABS.map(function (c) {
            return '<button type="button" role="tab" data-ctab="' + c.k + '" aria-selected="' + (c.k === chartTab) + '"' +
              (c.k === chartTab ? ' class="on"' : '') + '>' + esc(c.t) + '</button>';
          }).join("") + '</div>' +
          '<div class="gx2-one">' + chartBlock(chartTab) + '</div>' +
          '<div class="gx2-all">' + CTABS.map(function (c) {
            return '<div class="gx2-mc"><h5>' + esc(c.t) + '</h5>' + chartBlock(c.k) + '</div>';
          }).join("") + '</div>' +
        '</section>';
      }
      function chartBlock(k) {
        return '<div class="gx2-sum">' + chartSum(k) + '</div>' +
          '<div class="gx2-chart" data-k="' + k + '" role="img" aria-label="' + esc(tabTitle(k)) + '"></div>' +
          '<div class="gx2-leg">' + chartLeg(k) + '</div>' +
          '<div class="gx2-wk' + (selWk === null ? ' is-hint' : '') + '" data-wkfor="' + k + '">' + wkLine(k) + '</div>';
      }
      function tabTitle(k) { return (CTABS.filter(function (c) { return c.k === k; })[0] || {}).t || ""; }
      function T() { return M.trends; }
      function nW() { return M.weekKeys.length; }
      function opened(i) { var s = T().src[i]; return s.res + s.mgr + s.gard; }
      function avgOf(a) { var b = a.filter(function (x) { return x !== null && x !== undefined; }); return b.length ? Math.round(10 * sum(b) / b.length) / 10 : null; }
      function chartSum(k) {
        var t = T(), n = nW(), i;
        if (k === "work") {
          var tot = t.doneR.map(function (r, j) { return r + t.doneF[j]; });
          var past = tot.slice(0, n - 1);
          var den = sum(t.adhDen.slice(0, n - 1)), num = sum(t.adhNum.slice(0, n - 1));
          return '<span><b>' + sum(tot) + '</b>טופלו ב-' + n + ' שבועות</span>' +
            '<span><b>' + (past.length ? Math.round(sum(past) / past.length) : 0) + '</b>בממוצע לשבוע</span>' +
            '<span><b>' + (den ? Math.round(100 * num / den) + '%' : '—') + '</b>עמידה בתוכנית</span>';
        }
        if (k === "faults") {
          var o = 0; for (i = 0; i < n; i++) o += opened(i);
          var c = sum(t.closedF), d = o - c;
          return '<span><b>' + o + '</b>נפתחו</span><span><b>' + c + '</b>נסגרו</span>' +
            '<span><b>' + (d > 0 ? '↑ ' + d : d < 0 ? '↓ ' + (-d) : '0') + '</b>' +
            (d > 0 ? 'התקלות הפתוחות התרבו' : d < 0 ? 'התקלות הפתוחות פחתו' : 'מאוזן') + '</span>';
        }
        if (k === "time") {
          if (!M.logOk) return '<span>היומן לא נטען — אין זמני טיפול</span>';
          var as = avgOf(t.sched), ac = avgOf(t.close);
          return '<span><b>' + (as === null ? '—' : as) + '</b>ימים עד שיבוץ</span>' +
            '<span><b>' + (ac === null ? '—' : ac) + '</b>ימים עד סגירה</span><span>חציון שבועי, תקלות בלבד</span>';
        }
        return '<span><b>' + sum(t.dragged) + '</b>גרירות בתקופה</span><span><b>' + M.now.dragged.count + '</b>נגררות עכשיו</span>';
      }
      function chartLeg(k) {
        function sq(c, l, cls) { return '<span><i class="' + (cls || '') + '" style="background:' + c + '"></i>' + l + '</span>'; }
        if (k === "work") return sq("var(--c-rout2)", "שגרה") + sq("var(--c-fault2)", "תקלות") + sq("transparent", "שגרה שתוכננה", "is-ghost");
        if (k === "faults") return sq("var(--c-res2)", "נפתחה ע״י תושב") + sq("var(--c-mgr2)", "מנהל") + sq("var(--c-gar2)", "גנן") + sq("#1F2A25", "נסגרו", "is-ln");
        if (k === "time") return sq("var(--c-fault2)", "עד סגירה", "is-ln") + sq("var(--c-mgr2)", "עד שיבוץ", "is-ln is-dash");
        return '';
      }
      function wkName(i) {
        var key = M.weekKeys[i];
        return i === nW() - 1 ? "השבוע · " + weekLabel(key).replace(/^שבוע \d+ · /, "") : weekLabel(key).replace(/^שבוע \d+ · /, "");
      }
      function wkLine(k) {
        if (selWk === null || selWk >= nW()) return 'לחצו על שבוע בגרף כדי לראות מה היה בו';
        var t = T(), i = selWk, h = '<span class="gx2-wt">' + esc(wkName(i)) + '</span>', ids;
        if (k === "work") {
          var pl = t.adhDen[i];
          h += '<span>טופלו <b>' + (t.doneR[i] + t.doneF[i]) + '</b></span>' +
            '<span>שגרה <b>' + t.doneR[i] + '</b>' + (pl ? ' מתוך ' + pl + ' מתוכננות' : '') + '</span>' +
            '<span>תקלות <b>' + t.doneF[i] + '</b></span>';
          ids = t.ids.done[i];
        } else if (k === "faults") {
          var s = t.src[i];
          h += '<span>נפתחו <b>' + opened(i) + '</b> (' + s.res + ' תושב · ' + s.mgr + ' מנהל · ' + s.gard + ' גנן)</span>' +
            '<span>נסגרו <b>' + t.closedF[i] + '</b></span>';
          ids = t.ids.opened[i].concat(t.ids.closedF[i].filter(function (x) { return t.ids.opened[i].indexOf(x) < 0; }));
        } else if (k === "time") {
          h += (t.close[i] === null && t.sched[i] === null) ? '<span>אין נתונים לשבוע הזה</span>' :
            '<span>עד שיבוץ <b>' + (t.sched[i] === null ? '—' : t.sched[i]) + '</b> ימים</span>' +
            '<span>עד סגירה <b>' + (t.close[i] === null ? '—' : t.close[i]) + '</b> ימים</span>';
          ids = t.ids.closedF[i];
        } else {
          h += '<span>נגררו <b>' + t.dragged[i] + '</b> משימות מהשבוע הזה</span>';
          ids = t.ids.drag[i];
        }
        return h + (ids && ids.length ? '<button type="button" data-wklist="' + k + '">לרשימה ←</button>' : '');
      }
      function weekList(k) {
        var t = T(), i = selWk, ids, title;
        if (k === "work") { ids = t.ids.done[i]; title = "טופלו"; }
        else if (k === "faults") { ids = t.ids.opened[i].concat(t.ids.closedF[i].filter(function (x) { return t.ids.opened[i].indexOf(x) < 0; })); title = "תקלות שנפתחו או נסגרו"; }
        else if (k === "time") { ids = t.ids.closedF[i]; title = "תקלות שנסגרו"; }
        else { ids = t.ids.drag[i]; title = "נגררו"; }
        return { title: title + " · " + wkName(i), key: "week", empty: "אין משימות.",
          sections: [{ rows: (ids || []).map(function (id) {
            var x = byId[id] || {};
            return row(id, { meta: srcOf(x) + (x.closure ? " · " + x.closure : x.week ? " · " + weekLabel(x.week) : "") });
          }) }] };
      }

      /* ---- מנוע הגרף: SVG בפיקסלים אמיתיים ---- */
      function sv(n, a, txt) {
        var e = document.createElementNS(SVGNS, n);
        for (var k in a) if (a[k] !== undefined) e.setAttribute(k, a[k]);
        if (txt !== undefined) e.textContent = txt;
        return e;
      }
      function niceMax(v) {
        /* עד 10 — מספר זוגי, כדי שקו האמצע יהיה מספר שלם (לא "2.5"). */
        if (v <= 10) return Math.max(2, Math.ceil(v / 2) * 2);
        var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
        return (m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
      }
      function roundTop(x, y, w, h, r) {
        if (h <= 0) return "";
        r = Math.min(r, h, w / 2);
        return "M" + x + "," + (y + h) + "V" + (y + r) + "Q" + x + "," + y + " " + (x + r) + "," + y +
          "H" + (x + w - r) + "Q" + (x + w) + "," + y + " " + (x + w) + "," + (y + r) + "V" + (y + h) + "Z";
      }
      function shortDate(key) {
        var p = String(key || "").split("-");
        return p.length === 3 ? (+p[2]) + "." + (+p[1]) : "";
      }
      function frame(host, max, unit) {
        var n = nW(), w = host.clientWidth || 300;
        var h = host.closest(".gx2-all") ? 200 : (w < 420 ? 210 : 250);
        var padT = 18, padB = 24, padL = 30, padR = 4;
        var svg = sv("svg", { width: w, height: h, viewBox: "0 0 " + w + " " + h, "aria-hidden": "true" });
        var slot = (w - padL - padR) / n, base = h - padB, top = padT;
        function xAt(i) { return padL + (i + 0.5) * slot; }
        if (selWk !== null && selWk < n) {
          svg.appendChild(sv("rect", { x: xAt(selWk) - slot / 2 + 2, y: top - 12, width: Math.max(4, slot - 4),
            height: base - top + 30, rx: 10, "class": "gx2-selband" }));
        }
        [0, max / 2, max].forEach(function (v) {
          var y = base - (base - top) * v / max;
          svg.appendChild(sv("line", { x1: padL - 4, x2: w - padR, y1: y, y2: y, "class": v ? "gx2-grid" : "gx2-base" }));
          svg.appendChild(sv("text", { x: 2, y: y + 4, "text-anchor": "start" }, (v % 1 ? v.toFixed(1) : v) + (unit || "")));
        });
        var every = slot < 26 ? 3 : slot < 38 ? 2 : 1;
        M.weekKeys.forEach(function (key, i) {
          if (i !== n - 1 && (n - 1 - i) % every) return;
          svg.appendChild(sv("text", { x: xAt(i), y: h - 6, "text-anchor": "middle",
            "class": (i === n - 1 || i === selWk) ? "is-cur" : undefined }, i === n - 1 ? "השבוע" : shortDate(key)));
        });
        host.innerHTML = "";
        host.appendChild(svg);
        return { svg: svg, h: h, base: base, top: top, slot: slot, xAt: xAt,
                 y: function (v) { return base - (base - top) * v / max; },
                 hy: function (v) { return (base - top) * v / max; } };
      }
      function stack(f, i, series, bw) {
        var x = f.xAt(i) - bw / 2, yAcc = f.base, cur = i === nW() - 1;
        var vis = series.filter(function (s) { return s.v[i]; });
        vis.forEach(function (s, si) {
          var h = f.hy(s.v[i]), gap = si ? 2 : 0, y = yAcc - h;
          var el = (si === vis.length - 1)
            ? sv("path", { d: roundTop(x, y, bw, h - gap, 4) })
            : sv("rect", { x: x, y: y, width: bw, height: Math.max(0, h - gap) });
          el.setAttribute("fill", s.c);
          if (cur) el.setAttribute("opacity", ".5");
          f.svg.appendChild(el);
          yAcc = y;
        });
        return yAcc;
      }
      function line(f, v, c, dash) {
        var pts = [];
        v.forEach(function (x, i) { if (x !== null && x !== undefined) pts.push(f.xAt(i) + "," + f.y(x)); });
        if (pts.length > 1) f.svg.appendChild(sv("polyline", { points: pts.join(" "), fill: "none", stroke: c, "stroke-width": 2,
          "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": dash ? "5 4" : undefined }));
        v.forEach(function (x, i) {
          if (x === null || x === undefined) return;
          f.svg.appendChild(sv("circle", { cx: f.xAt(i), cy: f.y(x), r: 4, fill: c, stroke: "#fff", "stroke-width": 2 }));
        });
      }
      function valLabel(f, i, y, txt) {
        f.svg.appendChild(sv("text", { x: f.xAt(i), y: y - 6, "text-anchor": "middle", "class": "is-val" }, String(txt)));
      }
      function empty(f, msg) {
        f.svg.appendChild(sv("text", { x: "50%", y: (f.top + f.base) / 2, "text-anchor": "middle", "class": "is-empty" }, msg));
      }
      function hits(f, tipOf) {
        M.weekKeys.forEach(function (key, i) {
          var r = sv("rect", { x: f.xAt(i) - f.slot / 2, y: 0, width: f.slot, height: f.h, fill: "transparent",
            "class": "gx2-hit", "data-wk": i });
          r.appendChild(sv("title", {}, wkName(i) + (tipOf ? " · " + tipOf(i) : "")));
          f.svg.appendChild(r);
        });
      }
      function paintChart(host, k) {
        var t = T(), n = nW(), f, bw, mx;
        if (k === "work") {
          var tot = t.doneR.map(function (r, i) { return r + t.doneF[i]; });
          mx = niceMax(Math.max.apply(null, tot.map(function (v, i) { return Math.max(v, t.adhDen[i] + t.doneF[i]); }).concat([1])) * 1.12);
          f = frame(host, mx); bw = Math.min(26, f.slot * 0.56);
          for (var i = 0; i < n; i++) {
            var gh = f.hy(t.adhDen[i]);
            if (gh > 0) f.svg.appendChild(sv("rect", { x: f.xAt(i) - bw / 2 - 3, y: f.base - gh, width: bw + 6, height: gh,
              rx: 5, "class": "gx2-ghost" }));
            var topY = stack(f, i, [{ v: t.doneR, c: "var(--c-rout2)" }, { v: t.doneF, c: "var(--c-fault2)" }], bw);
            if (tot[i]) valLabel(f, i, Math.min(topY, f.base - gh), tot[i]);
          }
          if (!sum(tot) && !sum(t.adhDen)) empty(f, "עוד לא נסגרו משימות בתקופה");
          hits(f, function (i) { return "שגרה " + t.doneR[i] + " · תקלות " + t.doneF[i]; });
        } else if (k === "faults") {
          var op = M.weekKeys.map(function (x, i) { return opened(i); });
          mx = niceMax(Math.max.apply(null, op.concat(t.closedF).concat([1])) * 1.15);
          f = frame(host, mx); bw = Math.min(24, f.slot * 0.5);
          for (var j = 0; j < n; j++) {
            stack(f, j, [{ v: t.src.map(function (s) { return s.res; }), c: "var(--c-res2)" },
                         { v: t.src.map(function (s) { return s.mgr; }), c: "var(--c-mgr2)" },
                         { v: t.src.map(function (s) { return s.gard; }), c: "var(--c-gar2)" }], bw);
          }
          line(f, t.closedF, "#1F2A25");
          if (!sum(op) && !sum(t.closedF)) empty(f, "לא נפתחו ולא נסגרו תקלות בתקופה");
          hits(f, function (i) { return "נפתחו " + op[i] + " · נסגרו " + t.closedF[i]; });
        } else if (k === "time") {
          var all = t.close.concat(t.sched).filter(function (x) { return x !== null; });
          f = frame(host, niceMax(Math.max.apply(null, all.concat([1])) * 1.1));
          if (!M.logOk && !all.length) empty(f, "היומן לא נטען");
          else if (!all.length) empty(f, "עוד אין תקלות ששובצו או נסגרו בתקופה");
          line(f, t.close, "var(--c-fault2)");
          line(f, t.sched, "var(--c-mgr2)", true);
          hits(f, function (i) { return "שיבוץ " + (t.sched[i] === null ? "—" : t.sched[i]) + " · סגירה " + (t.close[i] === null ? "—" : t.close[i]) + " ימים"; });
        } else {
          f = frame(host, niceMax(Math.max.apply(null, t.dragged.concat([1])) * 1.2));
          bw = Math.min(26, f.slot * 0.56);
          for (var q = 0; q < n; q++) {
            var ty = stack(f, q, [{ v: t.dragged, c: "var(--c-one2)" }], bw);
            if (t.dragged[q]) valLabel(f, q, ty, t.dragged[q]);
          }
          if (!sum(t.dragged)) empty(f, "אף משימה לא נגררה בתקופה");
          hits(f, function (i) { return "נגררו " + t.dragged[i]; });
        }
      }
      /* בחירת שבוע: מסמנת אותו **בכל הגרפים** ומעדכנת את שורות הפירוט, בלי ציור מלא. */
      function pickWeek(i) {
        selWk = (selWk === i) ? null : i;
        keepState();
        root.querySelectorAll(".gx2-wk").forEach(function (el) {
          el.classList.toggle("is-hint", selWk === null);
          el.innerHTML = wkLine(el.dataset.wkfor);
        });
        drawCharts();
      }
      function setTab(k) {
        chartTab = k; keepState();
        root.querySelectorAll("[data-ctab]").forEach(function (b) {
          var on = b.dataset.ctab === k;
          b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
        });
        var one = root.querySelector(".gx2-one");
        if (one) one.innerHTML = chartBlock(k);
        drawCharts();
      }
      function setMv(v) {
        mv = v; keepState();
        var g = root.querySelector(".gx2");
        if (!g) return;
        g.dataset.mv = v;
        g.querySelectorAll(".gx2-mnav button").forEach(function (b) {
          var on = b.dataset.mv === v;
          b.classList.toggle("on", on);
          if (on) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current");
        });
        hidePop();
        drawCharts();
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
        if (key === "openR") {
          /* GP-6.10:S1 — שגרה פתוחה: השבוע + מה שנשאר משבועות קודמים. */
          var OR = M.now.openRoutine;
          return { title: "שגרה פתוחה", key: key, sub: "משובצת לשבוע הזה או לשבוע שכבר עבר, ועוד לא נסגרה.",
            empty: "אין שגרה פתוחה.",
            big: { n: OR.count, label: OR.thisWeek + " השבוע · " + OR.late + " מאחרות" },
            sections: [{ rows: OR.ids.map(function (id) {
              var t = byId[id] || {};
              return row(id, { meta: srcOf(t) + " · " + weekLabel(t.week) });
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
      /* GXB2 (גל 9, 1.10.26) — peekEl/peekTimer עברו לרמת המודול (למעלה). */
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
        } else if (!peekEl.isConnected) {
          document.body.appendChild(peekEl);   // GXB2 (גל 9, 1.10.26) — אותו אלמנט, לא חדש
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
            if (w !== weeks) { weeks = w; recompute(); draw(); }   // draw שומר את weeks ב-S (GXB1)
            return;
          }
          if (e.target.closest('[data-act="retry"]')) { loadErr = null; skeleton(); load(); return; }
          if (e.target.closest('[data-act="closed"]')) {
            showClosed = !showClosed;
            keepState();   // GXB1 (גל 9, 1.10.26)
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
          /* GP-6.10:S2 — מעברים: לשונית גרף, חלק במובייל, אריח→גרף, שבוע→רשימה. */
          if ((b = e.target.closest("[data-ctab]"))) { setTab(b.dataset.ctab); return; }
          if ((b = e.target.closest(".gx2-mnav [data-mv]"))) { setMv(b.dataset.mv); return; }
          if ((b = e.target.closest("[data-go]"))) {
            hidePeek();
            if (mv !== "trend") setMv("trend");
            setTab(b.dataset.go);
            var tc = root.querySelector(".gx2-trend");
            try { if (tc) tc.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (x) {}
            return;
          }
          if ((b = e.target.closest(".gx2-hit"))) { pickWeek(+b.getAttribute("data-wk")); return; }
          if ((b = e.target.closest("[data-wklist]"))) { if (selWk !== null) openList(weekList(b.dataset.wklist)); return; }
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

      /* GXB1 (גל 9, 1.10.26) — ציור שקט: הנתונים האחרונים מיד (בלי שלד ובלי הבהוב) והמפה עם הזום שלה, והטעינה
         שכבר יצאה מרעננת אחריה. ⚠️ כאן בסוף ולא למעלה — אחרי שכל ה-var של render (TR, CW/CH, LEG_*) כבר אותחלו. */
      if (reuseMap) {
        raw = S.raw;
        (raw.rows || []).forEach(function (t) { byId[String(t.id)] = t; });
        recompute();
        draw(true);
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
    /* 🌱 4.10 — הנעץ עבר לרכיב משותף (js/ui/gardenPins.js, סגנון ב' — הכרעת
       יועד 3.10), כדי שאותו נעץ בדיוק יופיע גם במסך "דשא והשקיה".
       אותו ממשק בדיוק: set(pins, keepView) · api. */
    return CBA.gardenPins.mount(host, o);
  }
})();
