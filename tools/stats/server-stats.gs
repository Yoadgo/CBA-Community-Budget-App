/* ============================================================================
 *  מסך הנתונים — החישוב (2026-09-08)
 * ----------------------------------------------------------------------------
 *  ארבע החלטות שנסגרו באודיט ומכתיבות את כל מה שכאן:
 *
 *  1. **"מצב כללי" = אחוז מתוכנית העבודה שבוצע בשבוע שלו.** לא ציון מומצא.
 *     המונה: משימת שגרה שנסגרה "בוצע", בשבוע שאליו שובצה, בלי גרירות.
 *     המכנה: מה שהתוכנית ביקשה לאותו שבוע — מחושב מההגדרות, ולכן זמין גם
 *     לשבוע שאיש לא פתח (ר' gardenPlanForWeek_). שבוע שאיש לא עבד לפיו
 *     נותן 0% וזו האמת, לא חור בנתונים.
 *  2. **חציון, לא ממוצע.** ב-12 משימות בשבוע משימה אחת תקועה 40 יום מזיזה
 *     ממוצע לגמרי. החציון אומר אם המערכת בריאה; "שלוש הכי תקועות" אומרות
 *     במה לטפל. שניהם יחד, אף אחד לבד.
 *  3. **זמן הטיפול מפורק לשלושה מקטעים** ולא מספר אחד: מהדיווח עד השיבוץ,
 *     מהשיבוץ עד סימון הביצוע, ומהביצוע עד האישור. מספר אחד מסתיר את הדבר
 *     היחיד שמעניין — **מי מעכב**. הנתונים כבר ביומן מהיום הראשון.
 *  4. ⚠️ **אחראי הגינון אינו רואה ציון.** F-13 הוריד את הציון 0–100 בכוונה,
 *     ומסך שאומר לאביתר "58%" מחזיר אותו בדלת האחורית. הוא רואה מה עשה;
 *     החתך מול התוכנית והמשוב הם למנהל בלבד. הסינון כאן בשרת, לא בתצוגה.
 * ========================================================================== */

/** כמה שבועות אחורה. 8 הוא איזון: מספיק למגמה, קצר מספיק שהחישוב יישאר זול. */
var GARDEN_STATS_WEEKS = 8;

function handleGardenStats_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_GARDEN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var perm = gate.perm || {};
    var isMgr = !perm.isExternal;

    var weeks = Math.min(Math.max(parseInt(p.weeks, 10) || GARDEN_STATS_WEEKS, 2), 26);
    var thisWeek = gardenWeekKey_();
    var keys = [];
    for (var i = weeks - 1; i >= 0; i--) keys.push(gardenShiftWeek_(thisWeek, -i));
    var inWindow = {};
    keys.forEach(function (k) { inWindow[k] = true; });

    // ---------- קריאה אחת לכל טאב ----------
    var tsh = ss.getSheetByName(GARDEN_TASKS_SHEET);
    var tasks = [];
    if (tsh && tsh.getLastRow() > 1) {
      var tc = gardenCols_(tsh), tv = tsh.getDataRange().getValues();
      for (var r = 1; r < tv.length; r++) {
        if (!gardenCell_(tv[r][tc['מזהה']])) continue;
        tasks.push(gardenTaskObj_(tv[r], tc));
      }
    }

    var lists = gardenLists_(ss);
    var defs = gardenPlanRows_(ss);

    // ---------- 1. עמידה בתוכנית, שבוע-שבוע ----------
    /* נחשב תמיד (גם לאביתר) כי הוא המקור גם למספרים שכן מותר לו — אבל
       מוחזר ללקוח רק למנהל. ר' ההחלטה 4 בראש הקובץ. */
    /* perDef — אותה ספירה בדיוק, אבל לפי **סעיף בתוכנית** ולא לפי שבוע.
       האחוז השבועי אומר "כמה מהתוכנית קרה"; הוא לא אומר *מה* לא קרה, וזו
       השאלה היחידה שאפשר לעשות איתה משהו: סעיף שנופל שוב ושוב הוא או
       תוכנית לא ריאלית או חסם בשטח, ובשני המקרים המנהל צריך לגעת בסעיף.
       ⚠️ השבוע הנוכחי לא נספר כאן, בדיוק כמו ב-overall — הוא עדיין רץ. */
    var perDef = {};
    var byWeek = keys.map(function (k) {
      var want = gardenPlanForWeek_(ss, k, defs, lists.areas);
      var planned = want.length;
      var counts = (k !== thisWeek);
      if (counts) want.forEach(function (w) {
        var e = perDef[w.def.id];
        if (!e) e = perDef[w.def.id] = { id: w.def.id, title: w.def.title,
                                         clause: w.def.clause || '', want: 0, got: 0 };
        e.want++;
      });
      var onTime = 0, done = 0;
      tasks.forEach(function (t) {
        if (t.kind !== GARDEN_KIND_ROUTINE) return;
        if ((t.firstWeek || t.week) !== k) return;
        if (t.closure !== 'בוצע') return;
        done++;
        if (!t.drags && t.week === k) onTime++;
        if (counts && t.templateId && perDef[t.templateId]) perDef[t.templateId].got++;
      });
      return { week: k, planned: planned, done: done, onTime: onTime,
               pct: planned ? Math.round((onTime / planned) * 100) : null };
    });
    /* סף של 2 מופעים: סעיף שהיה אמור לקרות פעם אחת ולא קרה הוא אירוע, לא
       דפוס, ולהציג אותו כ"הכי נופל" זה לייצר אזעקה מרעש. */
    var falling = Object.keys(perDef).map(function (x) { return perDef[x]; })
      .filter(function (e) { return e.want >= 2 && e.got < e.want; })
      .sort(function (a, b) {
        return (b.want - b.got) - (a.want - a.got) ||
               (a.got / a.want) - (b.got / b.want);
      })[0] || null;
    /* "מצב כללי" מחושב על החלון כולו ולא כממוצע-של-אחוזים: שבוע עם משימה
       אחת ושבוע עם עשרים אינם שווי משקל, וממוצע אחוזים היה נותן להם משקל זהה.
       ⚠️ **והשבוע הנוכחי אינו נספר.** הוא עדיין רץ, ולכן הוא תמיד חלקי —
       הכללתו הייתה גוררת את המספר למטה כל שבוע מחדש בלי שקרה שום דבר,
       והמנהל היה לומד להתעלם ממנו. הוא כן מצויר בגרף, מסומן כחלקי. */
    var totPlanned = 0, totOnTime = 0, closedWeeks = 0;
    byWeek.forEach(function (w) {
      if (w.week === thisWeek) return;
      totPlanned += w.planned; totOnTime += w.onTime;
      if (w.planned) closedWeeks++;
    });
    var overall = totPlanned ? Math.round((totOnTime / totPlanned) * 100) : null;

    // ---------- 2. קו הזמן של כל משימה, מהיומן ----------
    var stamps = {};   // מזהה -> { נפתח, שיבוץ, ביצוע, סגירה }
    var lsh = ss.getSheetByName(GARDEN_LOG_SHEET);
    if (lsh && lsh.getLastRow() > 1) {
      var lc = gardenCols_(lsh), lv = lsh.getDataRange().getValues();
      for (var q = 1; q < lv.length; q++) {
        var id = String(lv[q][lc['מזהה משימה']]).trim();
        if (!id) continue;
        var kind = String(lv[q][lc['סוג רשומה']]).trim();
        var ts = lv[q][lc['חותמת זמן']];
        if (!(ts instanceof Date)) continue;
        if (!stamps[id]) stamps[id] = {};
        /* **הראשון מנצח.** משימה שהוחזרה להשלמה מקבלת "ביצוע" שני, ולקחת
           את האחרון היה מודד את הסבב האחרון במקום את זמן הטיפול האמיתי. */
        if (!stamps[id][kind]) stamps[id][kind] = ts.getTime();
      }
    }

    var segs = { toPlan: [], toDo: [], toApprove: [], total: [] };
    var stuck = [];
    tasks.forEach(function (t) {
      var s = stamps[t.id];
      if (!s) return;
      var born = s['נפתח'] || (t.createdAt instanceof Date ? t.createdAt.getTime() : 0);
      var pushDays = function (arr, from, to) {
        if (!from || !to || to < from) return;
        arr.push((to - from) / 86400000);
      };
      pushDays(segs.toPlan,    born,          s['שיבוץ']);
      pushDays(segs.toDo,      s['שיבוץ'] || born, s['ביצוע']);
      pushDays(segs.toApprove, s['ביצוע'],    s['סגירה']);
      if (born && s['סגירה']) {
        var d = (s['סגירה'] - born) / 86400000;
        segs.total.push(d);
        stuck.push({ id: t.id, title: t.title, category: t.category, area: t.area,
                     kind: t.kind, days: Math.round(d) });
      } else if (born && !t.closure) {
        /* עדיין פתוחה — הוותק שלה הוא זמן הטיפול *עד עכשיו*, וזו בדיוק
           המשימה שמעניין לראות ברשימת התקועות. */
        stuck.push({ id: t.id, title: t.title, category: t.category, area: t.area,
                     kind: t.kind, open: true,
                     days: Math.round((Date.now() - born) / 86400000) });
      }
    });
    stuck.sort(function (a, b) { return b.days - a.days; });

    /* ---------- 2ב. קצב: נפתחו מול נסגרו, שבוע-שבוע ----------
       ⚠️ הנתון החשוב ביותר שלא היה כאן. מספר המשימות הפתוחות לבדו לא אומר
       אם מנצחים — הוא אותו מספר גם כשהכול תחת שליטה וגם כשהערימה גדלה
       בשתיים בשבוע. ההפרש הוא שאומר, והוא מתגלה חודשיים לפני שמרגישים.
       הפתיחה נלקחת מ'נפתח' ביומן ולא מ'נוצר בתאריך': משימות שנוצרו לפני
       שהעמודה הזאת נולדה (7.9) אין להן ערך, וליומן כן יש. */
    var flow = keys.map(function (k) { return { week: k, opened: 0, closed: 0 }; });
    var flowIx = {};
    keys.forEach(function (k, i) { flowIx[k] = i; });
    Object.keys(stamps).forEach(function (id) {
      var o = stamps[id]['נפתח'];
      if (o) {
        var wo = flowIx[gardenWeekKey_(new Date(o))];
        if (wo !== undefined) flow[wo].opened++;
      }
      var c2 = stamps[id]['סגירה'];
      if (c2) {
        var wc = flowIx[gardenWeekKey_(new Date(c2))];
        if (wc !== undefined) flow[wc].closed++;
      }
    });
    flow.forEach(function (f) { f.net = f.opened - f.closed; });

    /* ---------- 2ג. תמהיל: כמה מהעבודה מתוכננת וכמה תגובה ----------
       אם רוב העבודה היא דיווחי תושבים, התוכנית לא מכסה את מה שקורה בשטח —
       וזו מסקנה שמשנה את התוכנית, לא את קצב העבודה. */
    var mix = { routine: 0, report: 0, manual: 0 };
    tasks.forEach(function (t) {
      if (!inWindow[t.week] && !inWindow[t.firstWeek]) return;
      if (t.kind === GARDEN_KIND_ROUTINE) mix.routine++;
      else if (t.kind === GARDEN_KIND_REPORT) mix.report++;
      else mix.manual++;
    });

    // ---------- 3. מצב עכשיו ----------
    var now = { open: 0, waiting: 0, dragged: 0, attention: 0, blocked: 0, closedThisWeek: 0 };
    tasks.forEach(function (t) {
      if (t.closure) {
        if (t.week === thisWeek && t.closure === 'בוצע') now.closedThisWeek++;
        return;
      }
      now.open++;
      if (t.flag === 'ממתין לאישור') now.waiting++;
      if (t.drags) now.dragged++;
      if (t.flag === 'דורש בדיקה חוזרת' || t.flag === 'דורש בדיקה בשטח' ||
          t.flag === 'הוחזר להשלמה') now.attention++;
      /* חסימה נספרת לחוד. זה הדגל היחיד שבו **הצוות אומר לך משהו** ומחכה
         להחלטה שלך — הוא לא סוגר משימות, הוא מרים יד. אם הוא נבלע בתוך
         "דורש תשומת לב" הוא מגיע אליך רק כשמישהו מתלונן. */
      if (t.flag === 'דורש בדיקה בשטח') now.blocked++;
    });

    // ---------- 4. אזורים ----------
    /* מצב אזור נגזר משני דברים בלבד, ושניהם מדידים: כמה פתוח בו, וכמה מתוכו
       מסומן בדגל. אחוז עמידה פר-אזור היה נראה מדויק יותר ומטעה יותר — מספר
       המשימות באזור אחד בשבוע הוא לרוב חד-ספרתי, ואחוז על מדגם כזה קופץ
       בין 0 ל-100 בלי שקרה שום דבר אמיתי. */
    var areaMap = {};
    lists.areas.forEach(function (a) {
      areaMap[a] = { area: a, open: 0, attention: 0, dragged: 0, reports: 0, closed: 0 };
    });
    tasks.forEach(function (t) {
      var a = areaMap[t.area];
      if (!a) return;
      if (t.closure) { if (inWindow[t.week]) a.closed++; return; }
      a.open++;
      if (t.kind === GARDEN_KIND_REPORT) a.reports++;
      if (t.drags) a.dragged++;
      if (t.flag && t.flag !== 'ממתין לאישור') a.attention++;
    });
    var areas = lists.areas.map(function (a) {
      var x = areaMap[a];
      /* סולם מצב ולא גוון שרירותי לכל אזור: תקין / במעקב / בעיה. שלושה
         מצבים הם מה שאפשר לפעול לפיו — עשרה גוונים הם קישוט. */
      x.state = x.attention >= 2 ? 'בעיה'
              : (x.attention === 1 || x.dragged >= 2) ? 'במעקב' : 'תקין';
      return x;
    });

    // ---------- 5. איפה הכאב חוזר ----------
    var pain = {};
    tasks.forEach(function (t) {
      if (t.kind !== GARDEN_KIND_REPORT || !t.area || !t.category) return;
      var k = t.area + ' · ' + t.category;
      if (!pain[k]) pain[k] = { key: k, area: t.area, category: t.category, n: 0, merged: 0 };
      pain[k].n++;
      if (t.closure === GARDEN_CLOSURE_MERGED) pain[k].merged++;
    });
    var repeats = Object.keys(pain).map(function (k) { return pain[k]; })
      .filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);

    // ---------- 6. משוב תושבים ----------
    var fb = { yes: 0, no: 0 };
    var rsh = ss.getSheetByName(GARDEN_REPORTS_SHEET);
    if (rsh && rsh.getLastRow() > 1) {
      var rc2 = gardenCols_(rsh), rv2 = rsh.getDataRange().getValues();
      for (var z = 1; z < rv2.length; z++) {
        var v = String(rv2[z][rc2['משוב']] || '').trim();
        if (v === 'חיובי' || v === 'כן') fb.yes++;
        else if (v === 'שלילי' || v === 'לא') fb.no++;
      }
    }

    var out = {
      ok: true, isManager: isMgr, weeks: weeks, thisWeek: thisWeek,
      now: now,
      timing: {
        toPlan: gardenStat_(segs.toPlan),
        toDo: gardenStat_(segs.toDo),
        toApprove: gardenStat_(segs.toApprove),
        total: gardenStat_(segs.total)
      },
      stuck: stuck.slice(0, 3)
    };
    /* ⚠️ הגבול של אביתר. הוא רואה מה עשה ומה פתוח אצלו — לא איך הוא נמדד
       מול התוכנית, לא את משוב התושבים, ולא את מפת "איפה הכאב חוזר". */
    if (isMgr) {
      out.overall = overall;
      out.overallWeeks = closedWeeks;   // כמה שבועות *שהסתיימו* עומדים מאחורי המספר
      out.byWeek = byWeek;
      out.falling = falling;
      out.flow = flow;
      out.mix = mix;
      out.areas = areas;
      out.repeats = repeats;
      out.feedback = fb;
      out.planSize = defs.filter(function (d) { return d.active; }).length;
    }
    return json_(out);
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/** חציון + הקצה העליון. מחזיר null כשאין מספיק נתונים — עדיף "אין עדיין"
 *  מאשר מספר שנשען על מדידה אחת. */
function gardenStat_(arr) {
  if (!arr || arr.length < 2) return { n: arr ? arr.length : 0, median: null, p90: null };
  var s = arr.slice().sort(function (a, b) { return a - b; });
  var mid = Math.floor(s.length / 2);
  var med = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return {
    n: s.length,
    median: Math.round(med * 10) / 10,
    p90: Math.round(s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] * 10) / 10
  };
}
