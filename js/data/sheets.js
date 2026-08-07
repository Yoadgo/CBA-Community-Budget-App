/* sheets.js — חיבור ל-Google Sheets (שלב קריאה בלבד).
   מושך JSON מ-Apps Script וממיר אותו למבנה הפנימי של האפליקציה (אותו מבנה כמו mock),
   כך שכל המסכים ושכבת הנתונים ממשיכים לעבוד בלי שינוי.
   העברית שבגיליון ממופה למפתחות הפנימיים (סטטוס/סוג/מקור/מצב חלוקה). */

window.CBA = window.CBA || {};

CBA.sheets = (function () {
  "use strict";

  // כתובת ה-Web App (מ-Apps Script). אם תשתנה — לעדכן כאן בלבד.
  var API_URL = "https://script.google.com/macros/s/AKfycbw_LLAk8s6u1wK-7zY3P3emjXaDeTCla-KqgvfD-Rgt5RTfWw6ldNkb7DbrhSUknS4o/exec";

  // מיפוי ערכי הגיליון (עברית) -> מפתחות פנימיים
  var STATUS_MAP = { "הוגשה קבלה": "submitted", "בבדיקה": "review", 'הועבר להנה"ח': "ready", "שולם": "paid", "נדחה": "rejected" };

  /* פענוח הסטטוס מהגיליון (2026-08-06 — תיקון באג).
     בשלב שיוך המשפחות נכתבו לעמודת "סטטוס" ערכים ארוכים ומפורטים שמתחילים ב-
     "בדיקה - ..." (למשל: 'בדיקה - שיוך משפחה: השם "..." לא זוהה בוודאות').
     STATUS_MAP מכיר רק את הערך המדויק "בבדיקה", ולכן כל השורות האלה נפלו
     לברירת המחדל "שולם" — 75 מתוך 135 שורות הוצגו כמשולמות במקום כדורשות
     בדיקה. עכשיו כל סטטוס שמתחיל ב-"בדיקה" מזוהה כ-review, וכל הטקסט המפורט
     נשמר כהערת בדיקה כדי שלא יאבד המידע למה השורה סומנה. */
  function parseStatus(raw, existingNote) {
    var s = String(raw || "").trim();
    if (STATUS_MAP[s]) return { status: STATUS_MAP[s], note: existingNote };
    if (s.indexOf("בדיקה") === 0) {
      var detail = s.replace(/^בדיקה\s*[-–—:]\s*/, "").trim() || s;
      return { status: "review", note: existingNote ? (existingNote + " | " + detail) : detail };
    }
    return { status: STATUS_MAP[s] || "paid", note: existingNote };
  }
  var TYPE_MAP   = { "החזר לדייר": "refund", "תשלום לספק": "supplier", "הוצאה כללית": "general" };
  var SOURCE_MAP = { "מנהל": "admin", "תושב": "resident" };
  var DIST_MAP   = { "שווה": "equal", "מותאם": "custom", "שנתי": "unplanned" };
  var MONTH_KEYS = ["תכנון ספט","תכנון אוק","תכנון נוב","תכנון דצמ","תכנון ינו","תכנון פבר",
                    "תכנון מרץ","תכנון אפר","תכנון מאי","תכנון יוני","תכנון יולי","תכנון אוג"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

  // מנרמל תאריך לכל פורמט אפשרי -> "YYYY-MM-DD" (כולל תיקון אזור־זמן ל-ISO מגוגל)
  function normDate(v) {
    if (v === null || v === undefined || v === "") return "";
    v = String(v);
    var dmy = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);          // DD/MM/YYYY
    if (dmy) return dmy[3] + "-" + dmy[2] + "-" + dmy[1];
    var isoT = v.match(/^(\d{4})-(\d{2})-(\d{2})T/);          // ISO מגוגל — עם היסט אזור־זמן
    if (isoT) { var d = new Date(v); d.setTime(d.getTime() + 12 * 3600 * 1000);
                return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
    var ymd = v.match(/^(\d{4})-(\d{2})-(\d{2})/);            // YYYY-MM-DD
    if (ymd) return ymd[1] + "-" + ymd[2] + "-" + ymd[3];
    return v.slice(0, 10);
  }

  function toCategory(row) {
    var monthly = MONTH_KEYS.map(function (k) { return num(row[k]); });
    var mode = DIST_MAP[String(row["מצב חלוקה"] || "").trim()] || "equal";
    var months = monthly.filter(function (x) { return x > 0; }).length || 12;
    return {
      id: String(row["סעיף"]).trim(),
      name: String(row["סעיף"]).trim(),
      plan: num(row["תכנון שנתי"]),
      group: String(row["קבוצה"] || "").trim(),
      incomeSourceId: String(row["מקור מימון"] || "").trim(),
      dist: { mode: mode, months: months, monthly: mode === "custom" ? monthly : null }
    };
  }

  function toIncome(row) {
    var type = (String(row["סוג"] || "").trim() === "מחושב") ? "dues" : "fixed";
    var s = { id: String(row["מקור"]).trim(), name: String(row["מקור"]).trim(), type: type, amount: num(row["סכום"]) };
    if (type === "dues") {
      s.rate = num(row["תעריף"]); s.families = num(row["משפחות"]);
      s.months = num(row["חודשים"]); s.tailFamilies = num(row["חודש אחרון"]); s.tailMonths = 1;
    }
    return s;
  }

  // כותרות תנועה "מוכרות" לאפליקציה — כל עמודה אחרת בשורה (שהמנהל הוסיף דרך
  // "ניהול עמודות", סעיף 6, 2026-08-06) נאספת אוטומטית ל-customFields, כדי שגם
  // עמודות מותאמות אישית עתידיות ייקלטו בלי לגעת כאן שוב.
  var KNOWN_TX_HEADERS = ["מזהה", "חודש הגשה", "תאריך רכישה", "רוכש", "ספק/נמען", "בנק", "סכום",
    "סעיף", "סוג הוצאה", "מקור", "סטטוס", "הערת בדיקה", "תיאור", "שם קובץ קבלה", "קישור קבלה", "מזהה משפחה"];

  function toTx(row, year) {
    var bank = String(row["בנק"] || "").trim();
    var d = normDate(row["תאריך רכישה"]);
    var m = normDate(row["חודש הגשה"]).slice(0, 7);
    var customFields = {};
    Object.keys(row).forEach(function (k) {
      if (KNOWN_TX_HEADERS.indexOf(k) === -1 && row[k] !== "" && row[k] != null) customFields[k] = row[k];
    });
    var st = parseStatus(row["סטטוס"], String(row["הערת בדיקה"] || ""));
    return {
      id: num(row["מזהה"]) || row["מזהה"],
      month: m, date: d,
      buyer: String(row["רוכש"] || ""),
      supplier: String(row["ספק/נמען"] || ""),
      bankName: bank, bankBranch: "", bankAccount: "",
      amount: num(row["סכום"]),
      categoryId: String(row["סעיף"] || "").trim(),
      expenseType: TYPE_MAP[String(row["סוג הוצאה"] || "").trim()] || "supplier",
      source: SOURCE_MAP[String(row["מקור"] || "").trim()] || "admin",
      status: st.status,
      reviewNote: st.note,
      description: String(row["תיאור"] || ""),
      receiptUrl: String(row["קישור קבלה"] || ""),
      payType: (TYPE_MAP[String(row["סוג הוצאה"] || "").trim()] === "refund") ? "refund" : "supplier",
      // מזהה משפחה מקושר (2026-08-06) — מספר הבית של התושב האחראי/מטפל. עשוי
      // להיות ריק בשורות ישנות שטרם שויכו, או בכוונה בשורות שאין להן שיוך.
      familyId: String(row["מזהה משפחה"] || ""),
      // שדות מותאמים אישית (סעיף 6, 2026-08-06) — {שם עמודה: ערך}
      customFields: customFields,
      year: year
    };
  }

  function transform(payload) {
    var groups = (payload.groups || []).map(function (g) { return { id: g, name: g }; });
    var years = {};
    (payload.years || []).forEach(function (y) {
      var d = payload.data[y] || {};
      var closed = payload.settings && payload.settings["מצב תקציב " + y] === "סגור";
      var baseline = null;
      var braw = payload.settings && payload.settings["בסיס תקציב " + y];
      if (braw) { try { baseline = JSON.parse(braw); } catch (e) { baseline = null; } }
      years[y] = {
        income: (d.income || []).map(toIncome),
        categories: (d.budget || []).map(toCategory),
        transactions: (d.transactions || []).map(function (r) { return toTx(r, y); }),
        budget: { phase: closed ? "locked" : "draft", lockedAt: null, baseline: baseline }
      };
    });
    var updates = (payload.updates || []).map(function (r) {
      return {
        date: normDate(r["תאריך"]),
        year: String(r["שנה"] || "").trim(),
        section: String(r["סעיף"] || "").trim(),
        from: num(r["מ"]), to: num(r["אל"]),
        reason: String(r["סיבה"] || "")
      };
    });
    return {
      groups: groups, years: years,
      yearList: (payload.years || []).slice(),
      currentYear: payload.currentYear || (payload.years || [])[0],
      settings: payload.settings || {},
      budgetUpdates: updates
    };
  }

  // מחליף את תוכן CBA.mock בנתונים מהגיליון (תכונות הגישה נשארות תקפות)
  function apply(store) {
    CBA.mock.groups = store.groups;
    CBA.mock.years = store.years;
    CBA.mock.yearList = store.yearList;
    CBA.mock.currentYear = store.currentYear;
    CBA.mock._source = "sheets";
    CBA.mock._settings = store.settings || {};
    CBA.mock._password = (store.settings && store.settings["סיסמת מנהל"]) || "";
    CBA.mock.budgetUpdates = store.budgetUpdates || [];
  }

  // מפתח המטמון המקומי. שינוי הגרסה מבטל מטמון ישן (למשל אם מבנה הנתונים משתנה).
  var CACHE_KEY = "cba_data_v1";

  // שולפת מהגיליון, מחילה על CBA.mock ומעדכנת מטמון. משותף בין load() (רענון הרקע
  // הראשוני) ובין refresh() (רענון תקופתי מאוחר יותר, ר' למטה) — קוד אחד, לא כפול.
  function fetchAndApply(hadCache, cb) {
    fetch(API_URL, { method: "GET" })
      .then(function (r) { return r.json(); })
      .then(function (payload) {
        if (!payload || !payload.ok) throw new Error((payload && payload.error) || "bad payload");
        var store = transform(payload);
        apply(store);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), store: store })); } catch (e) { /* מכסת אחסון מלאה — לא קריטי */ }
        cb(true, { source: "fresh", hadCache: hadCache });
      })
      .catch(function (err) {
        console.error("[CBA] טעינה מהגיליון נכשלה:", err);
        if (!hadCache) cb(false, { source: "none" });
        else cb(true, { source: "cache-kept", error: String(err) });
      });
  }

  /* טעינה בשיטת stale-while-revalidate:
     1) אם יש מטמון מקומי — מציגים אותו מיידית (cb "cache"), האפליקציה נראית מיד.
     2) במקביל מרעננים ברקע מהגיליון; כשמגיע — מעדכנים מטמון וקוראים ל-cb שוב ("fresh").
     כך רענון הופך ממתנה של 2-3 שניות לתצוגה מיידית. cb עשוי להיקרא עד פעמיים. */
  function load(cb) {
    var hadCache = false;

    // 1) מטמון מקומי — הצגה מיידית
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var cached = JSON.parse(raw);
        if (cached && cached.store) {
          apply(cached.store);
          hadCache = true;
          cb(true, { source: "cache" });
        }
      }
    } catch (e) { /* מטמון פגום/לא זמין — פשוט מתעלמים וממשיכים לרשת */ }

    // 2) רענון ברקע מהגיליון
    fetchAndApply(hadCache, cb);
  }

  // רענון תקופתי (2026-08-05, לבקשת יועד — "קצב רענון קצת יותר מהיר"): אותה קריאת
  // רשת בדיוק כמו שלב 2 של load(), בלי לשחזר קודם את המטמון (כבר מוצג על המסך).
  // נקרא כל כמה שניות מ-app.js כשהטאב גלוי, ובכל חזרה לטאב אחרי שהיה ברקע.
  function refresh(cb) { fetchAndApply(true, cb); }

  // ניקוי המטמון (למשל בעת יציאה/החלפת משתמש)
  function clearCache() { try { localStorage.removeItem(CACHE_KEY); } catch (e) {} }

  // כתיבה לגיליון בשיטת "שגר ושכח" (no-cors): הבקשה נשלחת ומבוצעת בשרת,
  // אבל הדפדפן לא יכול לקרוא את התשובה — לכן מניחים הצלחה (עדכון אופטימי במסך).
  // הסיסמה נלקחת אוטומטית מההגדרות שנטענו מהגיליון.
  function push(action, payload, cb) {
    var body = Object.assign({ action: action, password: (CBA.mock && CBA.mock._password) || "" }, payload || {});
    fetch(API_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    })
      .then(function () { if (cb) cb({ ok: true }); })
      .catch(function (err) { console.error("[CBA] כתיבה נכשלה:", err); if (cb) cb({ ok: false, error: String(err) }); });
  }

  // האם מחוברים לגיליון (ולא נתוני דמו)
  function isConnected() { return CBA.mock && CBA.mock._source === "sheets"; }

  // קריאה עם תשובה קריאה (GET רגיל, לא no-cors) — בשביל פעולות שחייבות לדעת מיד
  // אם הצליחו (למשל login, ובשלב 8: תפוסת יומן + יצירת שריון). params -> querystring.
  // מצרפת סיסמה אוטומטית (כמו push) — פעולות ניהול (clubList/approve/reject) בודקות
  // אותה בשרת; לשאר הפעולות זה פרמטר עודף ולא-נבדק, לא מזיק.
  function get(params, cb) {
    var body = Object.assign({ password: (CBA.mock && CBA.mock._password) || "" }, params || {});
    var qs = Object.keys(body).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(body[k] == null ? "" : body[k]);
    }).join("&");
    fetch(API_URL + "?" + qs)
      .then(function (r) { return r.json(); })
      .then(function (data) { cb(data); })
      .catch(function (err) { cb({ ok: false, error: String(err) }); });
  }

  // כתיבה (doPost) עם תשובה קריאה — בשביל פעולות שחייבות לדעת מיד אם הצליחו ולקבל
  // ערך חזרה (סעיף 4, 2026-08-06: העלאת/מחיקת קובץ קבלה — צריך את קישור הקובץ
  // החדש בחזרה כדי לעדכן את התצוגה מיד). בניגוד ל-push, בלי mode:"no-cors" —
  // אושר ידנית (2026-08-06) ש-fetch רגיל ל-Apps Script /exec מהמקור של האתר עצמו
  // (github.io) כן מחזיר תשובה קריאה כשה-Content-Type הוא "simple" (text/plain,
  // כמו כאן) שלא מפעיל preflight. body יכול להיות גדול (קובץ Base64) — POST, לא GET.
  function postRead(action, payload, cb) {
    var body = Object.assign({ action: action, password: (CBA.mock && CBA.mock._password) || "" }, payload || {});
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    })
      .then(function (r) { return r.json(); })
      .then(function (data) { if (cb) cb(data); })
      .catch(function (err) { if (cb) cb({ ok: false, error: String(err) }); });
  }

  return { url: API_URL, load: load, push: push, get: get, postRead: postRead, isConnected: isConnected, clearCache: clearCache };
})();
