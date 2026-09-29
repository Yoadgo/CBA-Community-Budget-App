/* reconcile.js — מנוע בדיקת ההחזרים מול קובץ התשלומים של העמותה.
   ------------------------------------------------------------------
   ⚠️ מודל הנתונים (יועד, 7.9.26): **שורה בקובץ אינה בקשה בודדת.**
   שורה = הסכום המצטבר של כל הבקשות הפתוחות של נמען אחד.
   ולכן: המפתח הוא הנמען, והסכום הוא מה שמאמתים — לא להפך.

   כל הפונקציות כאן טהורות (אין DOM, אין רשת) כדי שאפשר יהיה לבדוק אותן
   בלי שרת ובלי גיליון. */
(function () {
  "use strict";
  window.CBA = window.CBA || {};

  /* ---------- כסף ----------
     כל החישוב באגורות (מספרים שלמים). 161.8 + 350.9 בנקודה צפה נותן
     512.6999999999999, והשוואה ל-512.7 הייתה נכשלת ומדווחת "פער" מדומה. */
  function agorot(n) { return Math.round((Number(n) || 0) * 100); }

  /* 🔴 29.9.26 — סכום מהקובץ. השרת קורא את הגיליון ב-getDisplayValues, ולכן
     כל סכום מ-1,000 ומעלה מגיע כטקסט עם פסיק אלפים ("1,667.80").
     Number("1,667.80") = NaN, ו-agorot הפך אותו בשקט ל-0 — כך ₪36,000 הוצג
     כ"₪0 בקובץ" ו-₪6,171.50 כ"שולם ₪0". מנקים כל מה שאינו ספרה/נקודה/מינוס
     (פסיקים, ₪, רווחים, סימן RTL). */
  function parseAmount(v) {
    if (typeof v === "number") return v;
    var s = String(v == null ? "" : v).replace(/[^0-9.\-]/g, "");
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  function shekels(a) { return a / 100; }

  /* ---------- נרמול שמות ----------
     אומת מול הקובץ האמיתי: 26 שמות, אפס התנגשויות שווא. */
  var PREFIXES = ["חוז"];   // "חוז" = החזר, קידומת של העמותה ולא חלק מהשם
  function normalizeName(raw) {
    var s = String(raw == null ? "" : raw);
    s = s.replace(/_x000D_/g, " ");        // שאריות מהאקסל
    s = s.replace(/["'`״׳]/g, "");          // כל סוגי הגרשיים -> כלום (בע"מ / בע``מ)
    s = s.replace(/[־–—-]/g, " ");          // מקפים -> רווח (חיון-קדוש)
    s = s.replace(/[|\/,&+()]/g, " ");      // מפרידים ("אבינתן אור | מבעד לאדמה")
    s = s.replace(/\s+/g, " ").trim();
    var parts = s.split(" ");
    if (parts.length > 1 && PREFIXES.indexOf(parts[0]) !== -1) parts.shift();
    s = parts.join(" ").replace(/\s*בע\s*מ\s*$/, "").trim();
    return s;
  }
  /* מפתח חסין־סדר: קבוצת המילים ממוינת, כך ש"לוי סוזי" = "סוזי לוי". */
  function nameKey(raw) {
    return normalizeName(raw).split(" ").filter(Boolean).sort().join(" ");
  }

  /* ---------- התאמה גמישה של שמות (29.9.26) ----------
     המפתח המדויק נכשל על הקובץ האמיתי הראשון בכל משקי הבית:
       בקובץ  "חוז גולן מנדלבוים יועד"   אצלנו "יועד ודר גולן"
       בקובץ  "חוז ממן שלומי ומורן"      אצלנו "מורן ושלומי ממן"
     העמותה רושמת את בעל החשבון בבנק; אנחנו רושמים את משק הבית.
     לכן: סופרים מילים משותפות. "ו" החיבור בתחילת מילה נחשבת גם בלעדיה
     (ודר = דר), ושתי מילים משותפות לפחות (שם פרטי + משפחה) נחשבות התאמה.
     ⚠️ אם שני נמענים שונים מקבלים את אותו ציון — לא מנחשים. */
  function nameTokens(raw) {
    var out = {};
    normalizeName(raw).split(" ").forEach(function (w) {
      if (!w) return;
      out[w] = true;
      if (w.length >= 3 && w.charAt(0) === "ו") out[w.substring(1)] = true;
    });
    return out;
  }
  function overlap(rowTok, groupTok) {
    var n = 0;
    Object.keys(rowTok).forEach(function (w) { if (groupTok[w]) n++; });
    return n;
  }
  var FUZZY_MIN = 2;
  /* מחזיר { group, how:"exact"|"fuzzy" } או { group:null, candidates:[...] } */
  function findRecipient(row, groups, byName) {
    if (byName[row.nameKey]) return { group: byName[row.nameKey], how: "exact" };
    // מילים "מקוריות" בלבד בצד הקובץ, כדי ש"ומורן" לא ייספר פעמיים
    var rowTok = {};
    normalizeName(row.name).split(" ").forEach(function (w) {
      if (!w) return;
      rowTok[(w.length >= 3 && w.charAt(0) === "ו") ? w.substring(1) : w] = true;
    });
    var best = 0, hits = [];
    groups.forEach(function (g) {
      var gt = g._tok || (g._tok = (function () {
        var t = {};
        Object.keys(g.nameKeys).forEach(function (k) {
          var x = nameTokens(k); Object.keys(x).forEach(function (w) { t[w] = true; });
        });
        return t;
      })());
      // בצד שלנו נשמרות שתי הצורות (ויגדר + יגדר), ולכן שם שבאמת מתחיל ב-ו עדיין נמצא
      var sc = overlap(rowTok, gt);
      if (sc > best) { best = sc; hits = [g]; }
      else if (sc === best && sc > 0) hits.push(g);
    });
    if (best >= FUZZY_MIN && hits.length === 1) return { group: hits[0], how: "fuzzy" };
    /* 29.9.26 (יועד): התאמה בינונית — לא מחברים, אבל אומרים. מילה משותפת
       אחת בלבד (למשל רק שם משפחה), או כמה נמענים עם אותו ציון. */
    if (best >= 1 && hits.length <= 3) {
      return { group: null, level: best >= FUZZY_MIN ? "ambiguous" : "medium",
               candidates: hits.map(function (g) {
                 return { group: g, shared: Object.keys(rowTok).filter(function (w) { return g._tok[w]; }) };
               }) };
    }
    return { group: null, candidates: [] };
  }

  /* ---------- קריאת הקובץ ----------
     grid = מערך של מערכים כפי שהשרת קרא מהגיליון (שורה 1 = כותרות).
     ⚠️ עמודת "גנים/שיכון" **חסרת כותרת** בקובץ המקורי, ולכן היא מזוהה
     לפי מיקום (העמודה האחרונה) ולא לפי שם. */
  var SECTOR_MINE = "שיכון";
  function parseChargeGrid(grid, sector) {
    sector = sector || SECTOR_MINE;
    if (!grid || !grid.length) return { rows: [], skipped: 0, sectors: {} };
    var head = grid[0].map(function (h) { return String(h == null ? "" : h).replace(/_x000D_/g, "").trim(); });
    var idx = {};
    head.forEach(function (h, i) { if (h) idx[h] = i; });
    var cName = idx["שם הספק"], cNum = idx["מס.ספק"], cAmt = idx["לתשלום"],
        cGross = idx["סכום"], cDate = idx["ת. תשלום"];
    var cSector = head.length - 1;      // העמודה חסרת הכותרת
    var rows = [], skipped = 0, sectors = {};
    for (var r = 1; r < grid.length; r++) {
      var g = grid[r]; if (!g) continue;
      var num = g[cNum], nm = g[cName];
      // שורת סה"כ בתחתית הקובץ ושורות הפרדה ריקות — מדלגים
      if (!num || !String(nm || "").trim()) { skipped++; continue; }
      var sec = String(g[cSector] == null ? "" : g[cSector]).trim();
      sectors[sec] = (sectors[sec] || 0) + 1;
      if (sec !== sector) continue;
      var amt = (cAmt != null && g[cAmt] != null && g[cAmt] !== "") ? g[cAmt] : g[cGross];
      rows.push({
        supplierNum: String(num).trim(),
        name: String(nm).trim(),
        nameKey: nameKey(nm),
        amountAg: agorot(parseAmount(amt)),
        payDate: g[cDate] || "",
        sector: sec
      });
    }
    return { rows: rows, skipped: skipped, sectors: sectors };
  }

  /* תאריך הזיכוי: ה-1 בחודש **שאחרי** תאריך הרשימה (יועד אישר 7.9.26).
     מקבל "23/08/2026" או Date, מחזיר ISO. */
  function creditDateFor(payDate) {
    var y, m;
    if (payDate instanceof Date) { y = payDate.getFullYear(); m = payDate.getMonth() + 1; }
    else {
      var p = String(payDate || "").trim().split(/[\/.\-]/);
      if (p.length < 3) return "";
      if (p[0].length === 4) { y = +p[0]; m = +p[1]; } else { y = +p[2]; m = +p[1]; }
    }
    if (!y || !m) return "";
    m += 1; if (m > 12) { m = 1; y += 1; }
    return y + "-" + String(m).padStart(2, "0") + "-01";
  }

  /* ---------- קיבוץ הבקשות שלנו לנמענים ----------
     החזר לדייר -> הנמען הוא **משק הבית** (מזהה משפחה). יועד אישר שזה תמיד
     שם אחד למשק בית, ולכן קיבוץ לפי משפחה נכון ולא מפצל בטעות.
     תשלום לספק -> הנמען הוא הספק, לפי שם מנורמל. */
  function buildRecipients(txs) {
    var map = {};
    (txs || []).forEach(function (t) {
      var isRefund = (t.expenseType || t.payType) === "refund";
      var key, label;
      if (isRefund) {
        var fam = String(t.familyId || "").trim();
        if (!fam) return;                  // בלי שיוך משפחה אין למי לייחס
        key = "fam:" + fam;
        label = t.buyer || ("משפחה " + fam);
      } else {
        var sk = nameKey(t.supplier || t.buyer || "");
        if (!sk) return;
        key = "sup:" + sk;
        label = t.supplier || t.buyer;
      }
      var g = map[key] || (map[key] = {
        key: key, kind: isRefund ? "refund" : "supplier", label: label,
        nameKeys: {}, txs: []
      });
      g.txs.push(t);
      // כל שם שהופיע אי־פעם בקבוצה משמש להתאמה — כך גם אם בקובץ מופיע
      // שם בן/בת הזוג, השורה עדיין תיקשר למשק הבית הנכון.
      [t.buyer, t.supplier].forEach(function (n) {
        var k = nameKey(n || ""); if (k) g.nameKeys[k] = true;
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  /* ---------- ניתוח פער: איזו תת-קבוצה מסתכמת בדיוק לסכום ששולם ----------
     "יש פער של ₪50" מעביר את העבודה למשתמש. "שולם ₪200 — זה מכסה את שלוש
     הבקשות האלה, והבקשה על ₪50 לא נכללה" הוא ממצא.
     כוח גס על 2^n. n גדול -> מוותרים במקום להיתקע. */
  var SUBSET_MAX = 18;
  function explainGap(txs, targetAg) {
    var n = txs.length;
    if (n > SUBSET_MAX) return { mode: "too-many", n: n };
    var hits = [];
    var total = 1 << n;
    for (var mask = 1; mask < total; mask++) {
      var sum = 0;
      for (var i = 0; i < n; i++) if (mask & (1 << i)) sum += agorot(txs[i].amount);
      if (sum === targetAg) { hits.push(mask); if (hits.length > 8) break; }
    }
    if (!hits.length) return { mode: "none" };
    if (hits.length > 1) return { mode: "many", count: hits.length };
    var m = hits[0], inc = [], exc = [];
    for (var j = 0; j < n; j++) (m & (1 << j) ? inc : exc).push(txs[j]);
    return { mode: "one", included: inc, excluded: exc };
  }

  /* ---------- ההשוואה ----------
     open = בקשות בסטטוס ready ("הועבר להנה"ח") — מה שהעברת לתשלום.
     pend = submitted/review — עדיין לא אישרת. לא נספרות בבסיס, אבל
            נבדקות בנפרד: אם הפער נסגר איתן, העמותה שילמה על משהו
            שטרם אושר — וזה ממצא בפני עצמו. */
  function compare(chargeRows, txs, savedSupplierMap) {
    savedSupplierMap = savedSupplierMap || {};
    var open = [], pend = [];
    (txs || []).forEach(function (t) {
      if (t.status === "ready") open.push(t);
      else if (t.status === "submitted" || t.status === "review") pend.push(t);
    });
    var recips = buildRecipients(open);
    var pendRecips = buildRecipients(pend);
    var byKey = {}, byName = {};
    recips.forEach(function (g) {
      byKey[g.key] = g;
      Object.keys(g.nameKeys).forEach(function (nk) { byName[nk] = byName[nk] || g; });
    });
    var pendByName = {};
    pendRecips.forEach(function (g) {
      Object.keys(g.nameKeys).forEach(function (nk) { pendByName[nk] = pendByName[nk] || g; });
    });

    var out = { ok: [], gap: [], noRequests: [], notInFile: [], seen: {} };

    chargeRows.forEach(function (row) {
      var saved = savedSupplierMap[row.supplierNum] && byKey[savedSupplierMap[row.supplierNum]];
      var found = saved ? { group: saved, how: "saved" } : findRecipient(row, recips, byName);
      var g = found.group;
      var pf = findRecipient(row, pendRecips, pendByName);
      if (!g) {
        // אולי יש לו בקשות שעדיין בבדיקה — זה משנה את נוסח ההתרעה
        out.noRequests.push({ row: row, pendingOnly: pf.group || null, candidates: found.candidates || [], level: found.level || "" });
        return;
      }
      out.seen[g.key] = true;
      var sum = g.txs.reduce(function (s, t) { return s + agorot(t.amount); }, 0);
      if (sum === row.amountAg) { out.ok.push({ row: row, group: g, sumAg: sum, how: found.how }); return; }
      var item = {
        row: row, group: g, sumAg: sum, deltaAg: row.amountAg - sum, how: found.how,
        explain: explainGap(g.txs, row.amountAg), withPending: null
      };
      // האם הפער נסגר אם מצרפים בקשות שעדיין בבדיקה?
      var p2 = pf.group;
      if (p2) {
        var combined = g.txs.concat(p2.txs);
        var e2 = explainGap(combined, row.amountAg);
        if (e2.mode === "one") item.withPending = e2;
      }
      out.gap.push(item);
    });

    recips.forEach(function (g) {
      if (!out.seen[g.key]) {
        out.notInFile.push({
          group: g,
          sumAg: g.txs.reduce(function (s, t) { return s + agorot(t.amount); }, 0)
        });
      }
    });
    return out;
  }

  CBA.reconcile = {
    agorot: agorot, shekels: shekels,
    normalizeName: normalizeName, nameKey: nameKey,
    parseChargeGrid: parseChargeGrid, creditDateFor: creditDateFor,
    parseAmount: parseAmount, nameTokens: nameTokens, findRecipient: findRecipient,
    buildRecipients: buildRecipients, explainGap: explainGap, compare: compare,
    SECTOR_MINE: SECTOR_MINE, SUBSET_MAX: SUBSET_MAX
  };
})();
