/* ============================================================================
 *  "מראה שיכון" — מסך הנתונים (2026-09-08)
 * ----------------------------------------------------------------------------
 *  נגזר מהאודיט שסגרנו ב-8.9. ארבע הכרעות עיצוב שכדאי להכיר לפני שנוגעים:
 *
 *  1. **המספר הראשי אינו גרף.** "מצב כללי" הוא ערך אחד עם מד — עמודה בודדת
 *     הייתה גרף של נתון אחד. ארבעת המספרים שמתחתיו הם שורת אריחים, לא גרף
 *     עמודות מקובץ.
 *  2. **מסע המשימה הוא רמפה סדרתית, לא שלושה צבעים.** שלושת המקטעים הם
 *     שלבים של אותו דבר, וסדרתי (בהיר->כהה) אומר "רצף" בדיוק כמו שהם.
 *     שלושה גוונים קטגוריים היו ממציאים שלוש זהויות שלא קיימות. מי מחזיק
 *     בכל שלב נאמר **בתווית**, לא בצבע.
 *  3. **צבעי המצב שמורים.** תקין/במעקב/בעיה הם בדיוק הירוק, הענבר והאדום
 *     שכבר מסמנים דגלים בכרטיסי המשימות — אותה משמעות, אותו צבע, בכל המודול.
 *     ⚠️ הם **תמיד עם סמליל ומילה**, לעולם לא צבע לבד: הענבר והאדום קרובים
 *     זה לזה בעיני חלק מהאנשים (נמדד: ΔE 11 בראייה מלאה, 5.5 בפרוטן).
 *  4. **חציון ולא ממוצע.** ר' ההנמקה ב-handleGardenStats_ בשרת.
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
    person:'<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20a6.5 6.5 0 0 1 13 0"/>',
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

  /* סולם המצב. סמליל + מילה תמיד — ר' הכרעה 3 בראש הקובץ. */
  var STATE = {
    "תקין":  { cls: "ok",    ico: "ok" },
    "במעקב": { cls: "watch", ico: "watch" },
    "בעיה":  { cls: "bad",   ico: "bad" }
  };
  /* אותו סולם על המספר הראשי. הגבולות נבחרו כדי שהמעבר יקרה במקום שבו
     המנהל באמת צריך לעשות משהו, ולא בעיגול יפה: מתחת ל-70% פירושו שכרבע
     מהתוכנית לא קורה, וזה כבר לא "כמעט". */
  function pctState(p) { return p >= 85 ? "תקין" : p >= 70 ? "במעקב" : "בעיה"; }

  /* גובה רצועת ה"קצב", חייב להיות זהה ל-.gs-flow ב-CSS.
     ⚠️ יושב כאן ולא בתוך render(): flowCard() מורמת (hoisted) ויכולה
     להיקרא לפני שהשורה הזו הספיקה לרוץ, אם getGardenStats מחזירה
     תשובה מיידית (מטמון / בדיקה). אז FLOW_H היה undefined והגובה
     יצא NaN — כלומר עמודות בגובה 0, גרף ריק בלי שום הודעת שגיאה. */
  var FLOW_H = 56;

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

      /* ---------- מד המספר הראשי ----------
         מד ולא גרף: יחס בודד מול תקרה. המסלול הוא אותו גוון בשקיפות נמוכה,
         כך שהמלא והריק הם אותו דבר בשתי עוצמות ולא שני צבעים שמתחרים. */
      function hero() {
        if (d.overall === null || d.overall === undefined) {
          return '<div class="gs-hero is-empty">' +
            '<b>אין עדיין מספיק נתונים</b>' +
            '<span>המספר הזה מודד כמה מתוכנית העבודה בוצע בשבוע שלו. ' +
            'הוא יופיע ברגע שהתוכנית תתחיל לייצר משימות.</span></div>';
        }
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

      /* המספרים יושבים **בתוך** כרטיס המספר הראשי ולא ברצועה נפרדת מתחתיו.
         ארבעה אריחים עצמאיים עלו 74px ואמרו את מה שהכרטיס כבר מסגר. */
      function tiles() {
        var n = d.now;
        var items = [
          ["פתוחות", n.open, ""],
          ["נסגרו השבוע", n.closedThisWeek, ""],
          ["נגררו", n.dragged, n.dragged ? "watch" : ""],
          ["חסומות", n.blocked || 0, (n.blocked ? "bad" : "")]
        ];
        return '<div class="gs-tiles">' + items.map(function (it) {
          return '<div class="gs-tile' + (it[2] ? " is-" + it[2] : "") + '">' +
            '<b>' + it[1] + '</b><span>' + esc(it[0]) + '</span></div>';
        }).join("") + '</div>';
      }

      /* ---------- קצב: נפתחו מול נסגרו ----------
         מסתעף מקו אפס ולכן זה גרף **מתפצל**, לא עמודות: הכיוון הוא המסר.
         מעל הקו = הערימה גדלה. שני הקטבים נושאים את אותה משמעות שהם נושאים
         בכל שאר המודול, ולכן אותם צבעים — עם מילה לידם ולא צבע לבד. */
      function flowCard() {
        var f = d.flow || [];
        if (!f.length) return "";
        var mx = Math.max(1, Math.max.apply(null, f.map(function (x) { return Math.abs(x.net); })));
        var net = f.reduce(function (a, x) { return a + x.net; }, 0);
        var verdict = net > 0 ? { t: "גדלה ב-" + net, cls: "bad" }
                    : net < 0 ? { t: "קטנה ב-" + (-net), cls: "ok" }
                    : { t: "יציבה", cls: "ok" };
        return '<div class="gs-card">' +
          '<div class="gs-ct">קצב<em>' + weeks + ' שבועות</em></div>' +
          '<div class="gs-flow" role="img" aria-label="נפתחו מול נסגרו לפי שבוע">' +
            '<i class="gs-zero"></i>' +
            f.map(function (x) {
              /* ⚠️ חצי הגובה, לא הגובה. הגרף מתפצל משני צידי קו האפס, ולכן
                 עמודה יכולה לגדול רק עד מחצית הגובה הפנוי — קודם היה כאן 46
                 בתוך מיכל של 52, והעמודות הגבוהות פשוט יצאו החוצה ודרסו את
                 שורת המסקנה שמתחתן. */
              var h = Math.round((Math.abs(x.net) / mx) * (FLOW_H / 2 - 3));
              return '<span class="gs-fb2" title="' + esc(shortDate(x.week)) + ' · נפתחו ' +
                x.opened + ' · נסגרו ' + x.closed + '">' +
                '<u class="' + (x.net > 0 ? "up" : x.net < 0 ? "dn" : "eq") +
                  '" style="height:' + Math.max(h, x.net ? 3 : 2) + 'px"></u></span>';
            }).join("") +
          '</div>' +
          '<div class="gs-cf is-' + verdict.cls + '">' +
            ico(verdict.cls === "ok" ? "ok" : "bad", 12) + 'הערימה ' + esc(verdict.t) + '</div>' +
        '</div>';
      }

      /* ---------- תמהיל ----------
         חלק-מהשלם של שלוש קטגוריות -> עמודה מוערמת אחת. השאלה שהוא עונה
         עליה: כמה מהעבודה מתוכננת וכמה תגובה. אם התגובה גדולה — התוכנית
         היא זו שצריכה להשתנות, לא קצב העבודה. */
      function mixCard() {
        var m = d.mix;
        if (!m) return "";
        var tot = m.routine + m.report + m.manual;
        if (!tot) return "";
        var pr = Math.round((m.routine / tot) * 100);
        return '<div class="gs-card">' +
          '<div class="gs-ct">תמהיל<em>' + tot + ' משימות</em></div>' +
          '<div class="gs-mix" role="img" aria-label="תמהיל העבודה">' +
            (m.routine ? '<i class="r" style="flex:' + m.routine + '"></i>' : '') +
            (m.report ? '<i class="p" style="flex:' + m.report + '"></i>' : '') +
            (m.manual ? '<i class="m" style="flex:' + m.manual + '"></i>' : '') +
          '</div>' +
          '<div class="gs-ml">' +
            '<span><i class="r"></i>שגרה ' + pr + '%</span>' +
            (m.report ? '<span><i class="p"></i>תושבים ' +
              Math.round((m.report / tot) * 100) + '%</span>' : '') +
          '</div>' +
        '</div>';
      }

      /* ---------- עמידה בתוכנית, שבוע-שבוע ----------
         סדרה אחת ולכן גוון אחד ובלי מקרא — הכותרת היא שם הסדרה. תוויות
         ישירות רק על הקצוות ועל השבוע הנוכחי; מספר מעל כל עמודה הופך גרף
         לטבלה צרה. שבוע בלי תוכנית מצויר כעמודה ריקה מקווקוות, כי "לא היה
         מה לעשות" ו"לא נעשה" הם שני דברים שונים לגמרי. */
      function adherence() {
        var w = d.byWeek || [];
        if (!w.length) return "";
        var last = w.length - 1;
        var f = d.falling;
        return '<div class="gs-sec">עמידה בתוכנית</div>' +
          '<div class="gs-chart" role="img" aria-label="עמידה בתוכנית לפי שבוע">' +
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
          '</div>' +
          /* האחוז אומר "כמה מהתוכנית קרה". השורה הזו אומרת **מה** לא קרה —
             וזה החלק היחיד שאפשר לפעול לפיו: סעיף שנופל שוב ושוב הוא או
             תוכנית לא ריאלית או חסם בשטח, ובשני המקרים נוגעים בסעיף. */
          (f ? '<div class="gs-fall">' + ico("repeat", 12) +
                 '<b>' + esc(f.title) + '</b> לא בוצע ' + (f.want - f.got) +
                 ' מתוך ' + f.want + ' פעמים' +
                 (f.clause ? ' <em>· ' + esc(f.clause) + '</em>' : '') +
               '</div>' : '');
      }

      /* ---------- מסע המשימה ----------
         זה הלב של המסך. מספר אחד ("5.2 ימים בממוצע") מסתיר את הדבר היחיד
         שאפשר לעשות איתו משהו — מי מעכב. שלושת המקטעים הם חלק-מהשלם של
         אותו זמן, ולכן עמודה מוערמת אחת ולא שלושה גרפים. */
      function journey() {
        var t = d.timing;
        var segs = [
          { k: "toPlan",    label: "עד שיבוץ",    who: d.isManager ? "אצלך" : "אצל הוועד" },
          { k: "toDo",      label: "עד ביצוע",    who: "אצל הצוות" },
          { k: "toApprove", label: "עד אישור",    who: d.isManager ? "אצלך" : "אצל הוועד" }
        ];
        var vals = segs.map(function (s) { return (t[s.k] && t[s.k].median) || 0; });
        var sum = vals.reduce(function (a, b) { return a + b; }, 0);
        if (!sum) {
          return '<div class="gs-sec">זמן טיפול</div>' +
            '<div class="gd-rep gs-empty">עוד לא נסגרו מספיק משימות כדי לחשב. ' +
            'הנתון הזה מגיע מיומן המשימות ומתמלא מעצמו.</div>';
        }
        /* המספר הכולל עלה לשורת הכותרת. קודם הוא ישב בשורה משלו מתחת
           למקרא, ואיתו פסקת הסבר — 62px של טקסט סביב עמודה של 22px. */
        var tot = t.total || {};
        return '<div class="gs-sec">זמן טיפול' +
            '<em>· חציון ' + esc(days(tot.median)) + ' מקצה לקצה' +
            (tot.p90 !== null && tot.p90 !== undefined
              ? ' · העשירון האיטי ' + esc(days(tot.p90)) : '') + '</em></div>' +
          '<div class="gs-bar" role="img" aria-label="פירוק זמן הטיפול">' +
            segs.map(function (s, i) {
              var v = vals[i];
              if (!v) return "";
              return '<span class="gs-seg s' + (i + 1) + '" style="flex:' + v + '" ' +
                'title="' + esc(s.label) + ' · ' + esc(days(v)) + '"></span>';
            }).join("") +
          '</div>' +
          /* מקרא **ותוויות ישירות** גם יחד: שלושה מקטעים באותו גוון נבדלים
             בבהירות בלבד, והתווית היא מה שהופך את זה לקריא בלי לסמוך על צבע. */
          '<div class="gs-legend">' + segs.map(function (s, i) {
            var st = t[s.k] || {};
            return '<div class="gs-lg"><i class="s' + (i + 1) + '"></i>' +
              '<div><b>' + esc(s.label) + '</b>' +
              '<span>' + esc(days(st.median)) + ' · ' + esc(s.who) + '</span></div></div>';
          }).join("") + '</div>';
      }

      /* שלוש התקועות. הן הצד השני של החציון: הוא אומר אם המערכת בריאה, והן
         אומרות במה לטפל היום. בלעדיהן החציון הוא מספר שאי אפשר לפעול לפיו. */
      function stuck() {
        var s = d.stuck || [];
        if (!s.length) return "";
        return '<div class="gs-sec">הכי הרבה זמן פתוחות <em>· ' + s.length + '</em></div>' +
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

      /* ---------- מפת הכאב: אזור + מה חוזר בו ----------
         היו כאן שני מקטעים נפרדים, "אזורים" ו"איפה חוזר", ושלושה מתוך
         חמשת השמות בהם היו אותם שמות עצמם — המנהל קרא "ציר מזרחי" פעמיים
         עם שני מספרים שונים והיה צריך להרכיב אותם בראש. עכשיו זו שורה אחת
         לכל אזור: **המצב** שלו, **הנפח** שלו, ומה **חוזר** בו.
         נכנס אזור שאינו תקין, או אזור שיש בו חזרה — אזור תקין שדבר מה חוזר
         בו הוא בדיוק המקרה שהמקטע הישן היה מפספס בשקט. */
      function painMap() {
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
        var okN = all.length - rows.length;
        return '<div class="gs-sec">אזורים' +
            (okN ? ' <em>· ' + okN + ' בלי ממצא</em>' : '') +
            '<button type="button" class="gs-map" id="gs-map">' + ico("pin", 12) +
              'על המפה</button></div>' +
          (rows.length ? '' : '<div class="gd-rep gs-empty">אין ממצא באף אזור.</div>') +
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

      function feedback() {
        var f = d.feedback;
        if (!f || (!f.yes && !f.no)) return "";
        var tot = f.yes + f.no;
        /* שורה אחת ולא מקטע. שני מספרים לא צריכים כותרת-מקטע, פסקה ומקרא —
           הם צריכים להיאמר. */
        return '<div class="gd-rep gs-fb">' +
            '<b>משוב תושבים</b>' +
            '<div class="gs-fb__bar">' +
              '<i class="y" style="flex:' + f.yes + '"></i>' +
              (f.no ? '<i class="n" style="flex:' + f.no + '"></i>' : '') +
            '</div>' +
            '<span>' + ico("ok", 12) + f.yes + '</span>' +
            (f.no ? '<span class="n">' + ico("bad", 12) + f.no + '</span>' : '') +
            '<em>מתוך ' + tot + '</em>' +
          '</div>';
      }

      function draw(skeleton) {
        if (skeleton) {
          root.innerHTML = '<div class="skeleton" style="height:120px;border-radius:16px"></div>' +
            '<div class="skeleton" style="height:64px;border-radius:14px;margin-top:10px"></div>' +
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

        root.innerHTML =
          '<div class="gt-ctl"><div class="gt-ctl__f">' +
            [4, 8, 13].map(function (n) {
              return '<button type="button" data-w="' + n + '"' +
                (weeks === n ? ' class="on"' : '') + '>' + n + ' שבועות</button>';
            }).join("") +
          '</div></div>' +
          (d.isManager ? hero() : '') +
          tiles() +
          /* שני חצאים בשורה אחת. שניהם גרפים קטנים שנקראים במבט, ואין סיבה
             שכל אחד ייקח רוחב מלא ועוד כותרת מקטע משלו. */
          (d.isManager ? '<div class="gs-half">' + flowCard() + mixCard() + '</div>' : '') +
          (d.isManager ? adherence() : '') +
          journey() +
          stuck() +
          (d.isManager ? painMap() : '') +
          (d.isManager ? feedback() : '');

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
