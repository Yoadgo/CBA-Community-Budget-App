/* ============================================================================
 *  "מראה שיכון" — מסך הנתונים
 * ----------------------------------------------------------------------------
 *  נכתב 8.9.26, **צומצם 9.9.26** אחרי מדידה חיה בייצור.
 *
 *  🔴 למה צומצם — המדידה, לא תחושה:
 *  המסך החזיק תשעה מקטעים, ומתוכם **שבעה ציירו ריק או מנוון**:
 *  `overall:null` (מד ראשי ריק) · `byWeek` שבעה nulls מתוך שמונה (שבע עמודות
 *  רפאים מקווקוות) · `flow` אפסים לכל השבועות (גרף מתפצל שטוח לגמרי, מסקנה
 *  "יציבה") · `mix` 29 שגרה מול 1 דיווח (עמודה אחת, 97%) · `repeats:[]`
 *  ("אין ממצא באף אזור" מתוך 12) · `falling:null` · `feedback:{0,0}` (הוסתר).
 *  רק ארבעת האריחים ושלוש התקועות החזיקו נתון אמיתי.
 *  זה לא מסך עמוס — זה מסך **ריק שנראה עמוס**, וזה גרוע יותר: הוא מלמד את
 *  המנהל שאין כאן מה לחפש.
 *
 *  ⚠️ ובנוסף — פירוק "זמן טיפול" מדד **שלב שכבר לא קיים**. מגל 3 הגנן סוגר
 *  דיווח תושב לבד, ולכן המקטע "עד אישור" קפוא: `toApprove` לא יקבל יותר
 *  נתונים חדשים. שלוש עמודות מוערמות ומקרא בשביל אחת מהן שמתה = הטעיה.
 *  במקומו נשאר **מספר אחד** בכותרת: חציון מקצה לקצה.
 *
 *  שלוש השאלות שהמסך עונה עליהן עכשיו, ואין רביעית:
 *  1. **מה פתוח עכשיו** — שורת האריחים.
 *  2. **האם התוכנית קורית** — המד, העמידה שבוע-שבוע, ומה נופל שוב ושוב.
 *  3. **מה דורש טיפול** — התקועות, האזורים שיש בהם ממצא, ומחלוקות תושבים.
 *
 *  מה שנמחק במכוון: "קצב" (נפתחו מול נסגרו) — האריחים כבר אומרים 28 פתוחות
 *  ו-5 נסגרו השבוע, וזו אותה שאלה בצורה ישירה יותר ועם נתון אמיתי;
 *  "תמהיל" — "97% שגרה" הוא מספר שאי אפשר לעשות איתו כלום.
 *
 *  ההכרעות העיצוביות ששרדו:
 *  1. **המספר הראשי אינו גרף.** ערך אחד עם מד.
 *  2. **צבעי המצב שמורים** — תקין/במעקב/בעיה הם אותו ירוק/ענבר/אדום של
 *     הדגלים בכרטיסי המשימות. ⚠️ **תמיד עם סמליל ומילה**, לעולם לא צבע לבד
 *     (נמדד: ΔE 11 בראייה מלאה, 5.5 בפרוטן).
 *  3. **חציון ולא ממוצע.** ר' ההנמקה ב-handleGardenStats_ בשרת.
 *  4. **ריק אחד ולא שלושה.** אם התוכנית עוד לא ייצרה שבוע שהסתיים, זו
 *     שורה אחת שמסבירה מה יופיע כאן — ולא מד ריק ועוד שבע עמודות רפאים.
 *
 *  ⚠️ אחראי הגינון רואה מסך מצומצם: מה עשה ומה פתוח אצלו. השרת פשוט לא
 *  שולח לו את החתך מול התוכנית, את המשוב ואת מפת הכאב — ר' F-13.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};
  var esc = CBA.esc;

  var ICONS = {
    ok:    '<path d="m5 12.5 4.5 4.5L19 7"/>',
    watch: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    bad:   '<path d="M12 3.5 21 19H3Z"/><path d="M12 10v4M12 16.6h.01"/>',
    pin:   '<path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    cloud: '<path d="M6.5 19a4.5 4.5 0 0 1-.6-8.96 6 6 0 0 1 11.2-1.6A4.2 4.2 0 0 1 21 12.6"/>' +
           '<path d="m15 15 6 6M21 15l-6 6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    repeat:'<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9a3 3 0 0 1 3-3h14"/>' +
           '<path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v2a3 3 0 0 1-3 3h-14"/>'
  };
  function ico(n, w) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" ' +
      'stroke-linecap="round" stroke-linejoin="round" style="width:' + (w || 14) + 'px;height:' +
      (w || 14) + 'px;flex:none">' + (ICONS[n] || "") + '</svg>';
  }

  /* סולם המצב. סמליל + מילה תמיד — ר' הכרעה 2 בראש הקובץ. */
  var STATE = {
    "תקין":  { cls: "ok",    ico: "ok" },
    "במעקב": { cls: "watch", ico: "watch" },
    "בעיה":  { cls: "bad",   ico: "bad" }
  };
  /* אותו סולם על המספר הראשי. הגבולות נבחרו כדי שהמעבר יקרה במקום שבו
     המנהל באמת צריך לעשות משהו, ולא בעיגול יפה: מתחת ל-70% פירושו שכרבע
     מהתוכנית לא קורה, וזה כבר לא "כמעט". */
  function pctState(p) { return p >= 85 ? "תקין" : p >= 70 ? "במעקב" : "בעיה"; }

  var MONTHS = ["ינו","פבר","מרץ","אפר","מאי","יונ","יול","אוג","ספט","אוק","נוב","דצמ"];
  function shortDate(k) {
    var p = String(k || "").split("-");
    var d = new Date(+p[0], (+p[1]) - 1, +p[2]);
    return isNaN(d.getTime()) ? k : d.getDate() + " " + MONTHS[d.getMonth()];
  }
  function days(v) {
    if (v === null || v === undefined) return "—";
    return v < 1 ? "פחות מיום" : (Math.round(v * 10) / 10) + " ימים";
  }
  function has(v) { return v !== null && v !== undefined; }

  CBA.screens.gardenStats = {
    render: function (container) {
      var d = null, loadErr = null, weeks = 8;

      container.innerHTML = '<div class="gd-screen" id="gs-root"></div>';
      var root = container.querySelector("#gs-root");
      draw(true);
      load();

      function load() {
        CBA.data.getGardenStats(weeks, function (res) {
          if (!res || !res.ok) {
            loadErr = (res && res.error) || "לא הצלחתי לטעון את הנתונים";
            d = null; draw(); return;
          }
          loadErr = null; d = res; draw();
        });
      }

      /* ======================= 1. מה פתוח עכשיו ======================= */

      /* ארבעה מספרים, בלי כותרת מקטע. הם גם התשובה לשאלה "האם הערימה
         גדלה" — 28 פתוחות מול 5 שנסגרו השבוע אומר את זה ישירות, ובלי
         גרף שמצייר שבעה שבועות של אפסים. */
      function tiles() {
        var n = d.now || {};
        var items = [
          ["פתוחות", n.open || 0, ""],
          ["נסגרו השבוע", n.closedThisWeek || 0, ""],
          ["נגררו", n.dragged || 0, n.dragged ? "watch" : ""],
          ["חסומות", n.blocked || 0, (n.blocked ? "bad" : "")]
        ];
        return '<div class="gs-tiles">' + items.map(function (it) {
          return '<div class="gs-tile' + (it[2] ? " is-" + it[2] : "") + '">' +
            '<b>' + it[1] + '</b><span>' + esc(it[0]) + '</span></div>';
        }).join("") + '</div>';
      }

      /* ==================== 2. האם התוכנית קורית ==================== */

      /* כמה שבועות בטווח מחזיקים נתון אמיתי. נקרא גם מ-draw(), כי בורר
         הטווח קיים רק בשביל הגרף. */
      function weeksWithData() {
        return (d.byWeek || []).filter(function (x) { return x.pct !== null; }).length;
      }

      /* מד ולא גרף: יחס בודד מול תקרה. המסלול הוא אותו גוון בשקיפות נמוכה,
         כך שהמלא והריק הם אותו דבר בשתי עוצמות ולא שני צבעים שמתחרים. */
      function hero() {
        var st = pctState(d.overall);
        var s = STATE[st];
        return '<div class="gs-hero is-' + s.cls + '">' +
          '<div class="gs-hero__n">' +
            '<b>' + d.overall + '<i>%</i></b>' +
            '<span class="gs-state">' + ico(s.ico, 13) + esc(st) + '</span>' +
          '</div>' +
          '<div class="gs-meter" role="img" aria-label="' + d.overall + ' אחוז">' +
            '<i style="width:' + Math.min(d.overall, 100) + '%"></i></div>' +
          '<p>מתוכנית העבודה בוצע בשבוע שלו · ' + (d.overallWeeks || 0) +
            ' שבועות שהסתיימו (הנוכחי עדיין רץ)</p>' +
        '</div>';
      }

      /* סדרה אחת ולכן גוון אחד ובלי מקרא — הכותרת היא שם הסדרה. תוויות
         ישירות רק על הקצוות ועל השבוע הנוכחי; מספר מעל כל עמודה הופך גרף
         לטבלה צרה. שבוע בלי תוכנית מצויר כעמודה ריקה מקווקוות, כי "לא היה
         מה לעשות" ו"לא נעשה" הם שני דברים שונים לגמרי. */
      function chart() {
        var w = d.byWeek || [];
        var last = w.length - 1;
        return '<div class="gs-chart" role="img" aria-label="עמידה בתוכנית לפי שבוע">' +
            '<div class="gs-grid"><i></i><i></i><i></i></div>' +
            '<div class="gs-cols">' +
            w.map(function (x, i) {
              var lbl = (i === 0 || i === last || x.week === d.thisWeek);
              if (x.pct === null) {
                return '<div class="gs-col is-none" tabindex="0" ' +
                  'title="' + esc(shortDate(x.week)) + ' · אין משימות בתוכנית">' +
                  '<u></u><em>' + (lbl ? esc(shortDate(x.week)) : '') + '</em></div>';
              }
              return '<div class="gs-col' + (x.week === d.thisWeek ? " is-now" : "") +
                '" tabindex="0" title="' + esc(shortDate(x.week)) + ' · ' +
                x.onTime + ' מתוך ' + x.planned + ' בזמן' +
                (x.week === d.thisWeek ? ' · השבוע עדיין רץ' : '') + '">' +
                '<span>' + (x.week === d.thisWeek ? 'בתהליך' : (lbl ? x.pct + '%' : '')) +
                  '</span>' +
                '<u style="height:' + Math.max(Math.min(x.pct, 100), 2) + '%"></u>' +
                '<em>' + (lbl ? esc(shortDate(x.week)) : '') + '</em></div>';
            }).join("") +
            '</div>' +
          '</div>';
      }

      /* האחוז אומר "כמה מהתוכנית קרה". השורה הזו אומרת **מה** לא קרה —
         וזה החלק היחיד שאפשר לפעול לפיו: סעיף שנופל שוב ושוב הוא או
         תוכנית לא ריאלית או חסם בשטח, ובשני המקרים נוגעים בסעיף. */
      function fallLine() {
        var f = d.falling;
        if (!f) return "";
        return '<div class="gs-fall">' + ico("repeat", 12) +
          '<b>' + esc(f.title) + '</b> לא בוצע ' + (f.want - f.got) +
          ' מתוך ' + f.want + ' פעמים' +
          (f.clause ? ' <em>· ' + esc(f.clause) + '</em>' : '') + '</div>';
      }

      /* ⚠️ **ריק אחד ולא שלושה.** קודם, כשהתוכנית עוד לא ייצרה שבוע שהסתיים,
         המנהל קיבל מד ריק + שבע עמודות רפאים + היעדר שורת "מה נופל" — שלוש
         הודעות ריקות נפרדות שאומרות בדיוק את אותו דבר. עכשיו זו שורה אחת
         שגם מסבירה מה **כן** קיים כרגע (כמה סעיפים יש בתוכנית), כדי שלא
         ייראה כאילו התוכנית עצמה חסרה. */
      function planSection() {
        if (!d.isManager) return "";
        /* ⚠️ **שניים ומעלה, לא אחד.** גרף מגמה עם עמודה אחת ועוד שבע
           משבצות ריקות הוא בדיוק ה"ריק שנראה מלא" שבגללו המסך צומצם —
           הוא לוקח 130px ואומר פחות מהמשפט שמעליו. עם השבוע השני הוא
           מופיע מעצמו. */
        var withData = weeksWithData();
        var ready = withData > 0;
        var head = '<div class="gs-sec">עמידה בתוכנית</div>';
        if (!has(d.overall) && !ready) {
          return head + '<div class="gd-rep gs-empty">' +
            'עוד לא הסתיים שבוע שהתוכנית ייצרה בו משימות' +
            (d.planSize ? ' (יש ' + d.planSize + ' סעיפים בתוכנית)' : '') + '. ' +
            'ברגע שיסתיים — כאן יופיע כמה מהתוכנית בוצע בזמן, ומה נופל שוב ושוב.' +
            '</div>';
        }
        /* יש שבוע עם נתונים אבל אין עדיין אחוז לתקופה — כלומר השבוע היחיד
           שהתוכנית ייצרה בו משימות הוא זה שעדיין רץ. בלי המשפט הזה המנהל
           רואה כותרת "עמידה בתוכנית" מעל גרף שרובו עמודות ריקות, ואין לו
           דרך לדעת אם זו תקלה או פשוט התחלה. */
        return head +
          (has(d.overall) ? hero() : '<div class="gd-rep gs-empty">' +
            'השבוע הנוכחי עדיין רץ, ולכן אין עדיין אחוז לתקופה. ' +
            'הוא יופיע בסיום השבוע הראשון שהתוכנית ייצרה בו משימות.</div>') +
          (withData > 1 ? chart() : "") + fallLine();
      }

      /* ===================== 3. מה דורש טיפול ===================== */

      /* מספר אחד בכותרת במקום פירוק לשלושה מקטעים. ⚠️ הפירוק הישן מדד גם
         את "עד אישור", ומגל 3 אין שלב אישור לדיווח תושב — המקטע היה נשאר
         תקוע על נתוני העבר ומצייר תמונה שלא קיימת. */
      function speed() {
        var t = (d.timing && d.timing.total) || {};
        if (!has(t.median)) return "";
        return '<em>· חציון ' + esc(days(t.median)) + ' מפתיחה ועד סגירה' +
          (has(t.p90) ? ' · העשירון האיטי ' + esc(days(t.p90)) : '') + '</em>';
      }

      /* התקועות הן הצד השני של החציון: הוא אומר אם המערכת בריאה, והן
         אומרות במה לטפל היום. בלעדיהן החציון הוא מספר שאי אפשר לפעול לפיו. */
      function stuck(withSub) {
        var s = d.stuck || [];
        if (!s.length) return "";
        return (withSub ? '<div class="gs-sub-h">הכי הרבה זמן פתוחות</div>' : '') +
          '<div class="gd-reps">' + s.map(function (x) {
            return '<article class="gd-rep gs-stuck">' +
              '<u>' + ico("clock", 15) + '</u>' +
              '<div><b>' + esc(x.title || x.category || "משימה") + '</b>' +
              '<span>' + esc(x.area || "") + (x.area && x.category ? " · " : "") +
                esc(x.category || "") + '</span></div>' +
              '<em>' + x.days + ' ימים' + (x.open ? '' : ' <i>עד הסגירה</i>') + '</em>' +
            '</article>';
          }).join("") + '</div>';
      }

      /* מפת הכאב: אזור + מה חוזר בו.
         היו כאן שני מקטעים נפרדים, "אזורים" ו"איפה חוזר", ושלושה מתוך
         חמשת השמות בהם היו אותם שמות עצמם — המנהל קרא "ציר מזרחי" פעמיים
         עם שני מספרים שונים והיה צריך להרכיב אותם בראש. עכשיו זו שורה אחת
         לכל אזור: **המצב** שלו, **הנפח** שלו, ומה **חוזר** בו.
         ⚠️ נכנס רק אזור שיש בו ממצא. אם אין באף אזור — המקטע כולו לא
         מצויר, במקום לצייר כותרת ואחריה "אין ממצא באף אזור" (שורה שאומרת
         "הכול בסדר" בנפח של תקלה). */
      function painMap(withSub) {
        if (!d.isManager) return "";
        var all = (d.areas || []).filter(function (x) { return x.open || x.closed; });
        if (!all.length) return "";
        var reps = {};
        var maxN = 1;
        (d.repeats || []).forEach(function (r) {
          (reps[r.area] || (reps[r.area] = [])).push(r);
          if (r.n > maxN) maxN = r.n;
        });
        var rank = { "בעיה": 0, "במעקב": 1, "תקין": 2 };
        var rows = all.filter(function (x) {
          return x.state !== "תקין" || (reps[x.area] && reps[x.area].length);
        }).sort(function (a, b) {
          return (rank[a.state] - rank[b.state]) ||
                 ((reps[b.area] ? reps[b.area][0].n : 0) -
                  (reps[a.area] ? reps[a.area][0].n : 0));
        });
        if (!rows.length) return "";
        return '<div class="gs-sub-h">' + (withSub ? 'אזורים עם ממצא <em>· ' + rows.length +
            ' מתוך ' + all.length + '</em>' : '') +
            '<button type="button" class="gs-map" id="gs-map">' + ico("pin", 12) +
              'על המפה</button></div>' +
          '<div class="gd-reps">' + rows.map(function (x) {
            var st = STATE[x.state] || STATE["תקין"];
            var rs = reps[x.area] || [];
            var top = rs[0];
            return '<article class="gd-rep gs-area is-' + st.cls + '">' +
              '<u>' + ico(st.ico, 15) + '</u>' +
              '<div><b>' + esc(x.area) + '</b>' +
              '<span class="gs-state">' + esc(x.state) + '</span>' +
              '<span class="gs-sub">' + x.open + ' פתוחות' +
                (x.reports ? ' · ' + x.reports + ' מתושבים' : '') +
                (x.dragged ? ' · ' + x.dragged + ' נגררו' : '') + '</span>' +
              (top ? '<span class="gs-rec" title="דווח יותר מפעם אחת באותו אזור">' +
                       ico("repeat", 11) +
                       '<b>' + esc(top.category) + '</b>' +
                       '<i class="gs-rect"><s style="width:' +
                         Math.round((top.n / maxN) * 100) + '%"></s></i>' +
                       '<em>' + top.n +
                         (top.merged ? ' · ' + top.merged + ' אוחדו' : '') + '</em>' +
                       (rs.length > 1 ? '<em class="gs-more">+' + (rs.length - 1) +
                         '</em>' : '') +
                     '</span>' : '') +
              '</div>' +
            '</article>';
          }).join("") +
          '</div>' +
          ((d.repeats || []).length
            ? '<p class="gs-note">' + ico("repeat", 11) +
              ' חוזר יותר מפעם אחת — מצדיק שינוי בתוכנית, לא עוד תיקון נקודתי.</p>'
            : '');
      }

      /* ⚠️ **רשת הביטחון, ולכן מוצגת גם כשהיא ריקה.** עד גל 3 סגירה של
         דיווח תושב עברה דרך אישור מנהל. מגל 3 היא לא — מה שמחליף את
         האישור הוא חלון של שבוע שבו התושב יכול לומר "לא הושלם". לכן
         "0 אמרו שלא הושלם" הוא **מידע**, ולא היעדר מידע: הוא האישור
         היחיד שהוויתור על האישור עובד. קודם השורה הוסתרה כששניהם אפס. */
      function disputes() {
        var f = d.feedback;
        if (!f) return "";
        var tot = f.yes + f.no;
        if (!tot) {
          return '<div class="gd-rep gs-fb is-quiet">' +
            '<b>תגובות תושבים</b>' +
            '<em>אף תושב עוד לא הגיב על סגירה</em></div>';
        }
        return '<div class="gd-rep gs-fb' + (f.no ? ' is-bad' : '') + '">' +
            '<b>תגובות תושבים</b>' +
            '<div class="gs-fb__bar">' +
              '<i class="y" style="flex:' + f.yes + '"></i>' +
              (f.no ? '<i class="n" style="flex:' + f.no + '"></i>' : '') +
            '</div>' +
            '<span>' + ico("ok", 12) + f.yes + '</span>' +
            (f.no ? '<span class="n">' + ico("bad", 12) + f.no + '</span>' : '') +
            '<em>מתוך ' + tot + '</em>' +
          '</div>';
      }

      /* ⚠️ כותרת-משנה רק כשיש יותר מחלק אחד. אצל הגנן המקטע הזה מכיל רק
         את התקועות, ואז "מה דורש טיפול" ומיד מתחתיו "הכי הרבה זמן פתוחות"
         הן שתי כותרות מעל רשימה אחת. */
      function attention() {
        var parts = [stuck(false), painMap(false), (d.isManager ? disputes() : "")]
          .filter(function (x) { return !!x; });
        if (!parts.length) return "";
        var many = parts.length > 1;
        var body = stuck(many) + painMap(many) + (d.isManager ? disputes() : "");
        return '<div class="gs-sec">מה דורש טיפול' + speed() + '</div>' + body;
      }

      /* =========================== ציור =========================== */

      function draw(skeleton) {
        if (skeleton) {
          root.innerHTML = '<div class="skeleton" style="height:64px;border-radius:14px"></div>' +
            '<div class="skeleton" style="height:120px;border-radius:16px;margin-top:16px"></div>' +
            '<div class="skeleton" style="height:150px;border-radius:16px;margin-top:16px"></div>';
          return;
        }
        if (loadErr) {
          root.innerHTML = '<div class="gd-reps"><div class="gd-rep gt-err">' +
            '<u>' + ico("cloud", 30) + '</u><b>לא הצלחתי לטעון</b>' +
            '<span>' + esc(loadErr) + '</span>' +
            '<button type="button" class="gd-cta" id="gs-retry">נסה שוב</button>' +
            '</div></div>';
          root.querySelector("#gs-retry").addEventListener("click", function () {
            loadErr = null; draw(true); load();
          });
          return;
        }
        if (!d) return;

        /* בורר הטווח מצויר רק כשיש גרף שהוא משנה: הוא משפיע **רק** על גרף
           העמידה בתוכנית. הגנן לא רואה אותו כלל, ומנהל שהתוכנית שלו עוד לא
           ייצרה שני שבועות עם נתונים לא רואה אותו גם — שלושה כפתורים שלא
           עושים כלום הם בדיוק סוג הרעש שהמסך הזה נועד להוריד. */
        root.innerHTML =
          (d.isManager && weeksWithData() > 1
            ? '<div class="gt-ctl"><div class="gt-ctl__f">' +
                [4, 8, 13].map(function (n) {
                  return '<button type="button" data-w="' + n + '"' +
                    (weeks === n ? ' class="on"' : '') + '>' + n + ' שבועות</button>';
                }).join("") +
              '</div></div>'
            : '') +
          tiles() +
          planSection() +
          attention();

        Array.prototype.forEach.call(root.querySelectorAll("[data-w]"), function (b) {
          b.addEventListener("click", function () {
            weeks = parseInt(b.dataset.w, 10);
            draw(true); load();
          });
        });
        var mp = root.querySelector("#gs-map");
        if (mp) mp.addEventListener("click", function () { CBA.navigate("gardenTasks"); });
      }
    }
  };
})();
