/* ============================================================================
 *  gymWrite.js — פעולות מנהל במכון הכושר נכתבות מיד ל-Firebase   (שלבים 2-3, 3.10.2026)
 * ----------------------------------------------------------------------------
 *  בקשת יועד: "זה איטי לשמור נתונים" + "שמירה מיידית, מיילים ודלת ברקע".
 *
 *  🔑 איך זה עובד (שבע פעולות: רישום/אימות תשלום, עריכת/ביטול תשלום, הפעלה ידנית,
 *     הארכה, עריכת מנוי):
 *     1. כותבים מסמך כוונה gymOps/{opId} — **הכוונה** עם אותו גוף שהיה נשלח לשרת.
 *     2. מעדכנים את gymMembers/{id} אופטימית (סטטוס, תאריכים, סכומים, יומן) — המסך מציג
 *        את התוצאה מיד, בלי לחכות ל-Apps Script.
 *     3. מעירים את השרת (gymApplyOps, שקט, ברקע). הוא מחיל את הכוונה על הגיליון בדיוק
 *        בפונקציות הקיימות (אותה לוגיקה, אותם מיילים), מסנכרן את הדלת, ומשכתב את מסמך
 *        המנוי מהגיליון — כלומר האמת גוברת על ההקרנה האופטימית.
 *     4. נכשל? ה-op נשאר status:'failed', המסך חוזר לאמת, והמנהל רואה הודעה
 *        ("הפעולה לא הוחלה: …") בפתיחת המסך הבאה.
 *
 *  🛑 דגל כיבוי: appConfig/flags → gymWriteFs (ברירת מחדל false). כבוי = כל פעולה
 *     עוברת ב-Apps Script כמו קודם. כל תנאי חסר (לא מחובר, אין הרשאה, מסמך בלי schema 2,
 *     שגיאת כתיבה של הכוונה) → נפילה שקטה לנתיב הישן. **אף פעולה לא נבלעת:** או שהכוונה
 *     נשמרה (והשרת יחיל אותה, גם אם הדפדפן נסגר — הטריגר השעתי), או שהנתיב הישן רץ.
 *
 *  ⚠️ מה לא כאן: יצירת מנוי חדש (מונה GYM-xxxx), מחיקה, דחיית תשלום, בקשת הצהרה.
 *  ⚠️ ההקרנה האופטימית משכפלת את gymPaymentSync_ ו-GymFirestore.gs. אם הלוגיקה בשרת
 *     משתנה — לעדכן גם כאן (tools/test-gym-write-*.js בודק את ההתאמה).
 * ========================================================================== */
window.CBA = window.CBA || {};
(function () {
  "use strict";

  var DUP_SECONDS = 180;
  var LOG_MAX = 60;
  var ST = { ACTIVE: "פעיל", EXPIRED: "פג תוקף" };
  var EDITABLE = ["ממתין להצהרה", "ממתין לאישור רופא", "ממתין לאישור", "ממתין לתשלום",
    "ממתין לאימות", "פעיל", "פג תוקף", "מוקפא", "נדחה", "בוטל"];
  var TYPES = ["recordGymPayment", "confirmGymPayment", "updateGymPayment", "voidGymPayment",
    "activateGymManual", "extendGymMembership", "updateGymMembership"];

  /* ---------- תאריכים ---------- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseDay(v) {
    if (!v) return null;
    var m = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  /* "YYYY-MM" → היום האחרון באותו חודש כ-"YYYY-MM-DD" (כמו gymMonthEnd_). */
  function monthEnd(ym) {
    var m = String(ym || "").match(/^(\d{4})-(\d{1,2})$/);
    if (!m) return null;
    return ymd(new Date(Number(m[1]), Number(m[2]), 0));
  }
  function monthLabel(endYmd) { var d = parseDay(endYmd); return d ? pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; }
  function monthsBetween(from, to) {
    var a = parseDay(from), b = parseDay(to);
    if (!a || !b) return 0;
    return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
  }

  /* ---------- מצב סנכרון (כמו gymPaymentSync_) ---------- */
  function monthlyOf(plans, name) {
    var t = String(name || "").trim(), first = null;
    for (var i = 0; i < (plans || []).length; i++) {
      if (first === null) first = plans[i];
      if (plans[i].name === t) return Number(plans[i].monthlyPrice) || 0;
    }
    return first ? (Number(first.monthlyPrice) || 0) : 0;
  }
  function syncFields(doc, plans, totalPaid) {
    var monthly = monthlyOf(plans, doc["מסלול"]);
    var allocated = (doc["תאריך התחלה"] && doc["בתוקף עד"]) ? monthsBetween(doc["תאריך התחלה"], doc["בתוקף עד"]) : 0;
    var paidMonths = monthly ? (totalPaid / monthly) : 0;
    var diff = Math.round((paidMonths - allocated) * 10) / 10;
    var label;
    if (!allocated && !totalPaid) label = "";
    else if (Math.abs(diff) < 0.5) label = "מסונכרן";
    else if (diff < 0) label = "חוסר " + Math.round(Math.abs(diff)) + " חודשים";
    else label = "עודף " + Math.round(diff) + " חודשים";
    return {
      "סה\"כ שולם": totalPaid || "",
      "חודשים ששולמו": monthly ? Math.round(paidMonths * 10) / 10 : "",
      "מצב סנכרון": label,
      _label: label, _diff: diff, _allocated: allocated, _monthly: monthly
    };
  }

  function evId(now, n) { return "LOG-" + now.getTime() + (n ? "-" + n : "") + "-" + Math.floor(Math.random() * 1296).toString(36); }
  function newEvent(now, type, extra, n) {
    extra = extra || {};
    return { id: extra.id || evId(now, n), t: now.toISOString(), type: type,
      amount: extra.amount == null || extra.amount === "" ? "" : Number(extra.amount),
      method: extra.method || "", ref: extra.ref || "", until: extra.until || "", by: extra.by || "", note: extra.note || "" };
  }
  function activePayments(log) {
    return (log || []).filter(function (e) { return e.type === "תשלום"; });
  }
  function lastPaidOf(log, fallback) {
    var best = "";
    activePayments(log).forEach(function (e) { var t = new Date(e.t); var d = isNaN(t.getTime()) ? "" : ymd(t); if (d > best) best = d; });
    return best || fallback || "";
  }
  function trimLog(log) { return log.length > LOG_MAX ? log.slice(log.length - LOG_MAX) : log; }

  /**
   * הקרנה אופטימית: מה יהיה במסמך המנוי אחרי הפעולה.
   * @returns {{error:string}|{patch:Object, res:Object, op:Object}}
   *   patch = שדות למיזוג במסמך; op = {type, body} לשרת; res = מה שהמסך מקבל כאילו חזר מהשרת.
   */
  function project(type, data, doc, plans, now, by) {
    data = data || {};
    if (TYPES.indexOf(type) === -1) return { error: "סוג פעולה לא נתמך" };
    var id = String(data.id || "").trim();
    var today = ymd(now);
    var log = (doc.log || []).slice();
    var total = Number(doc["סה\"כ שולם"]) || 0;
    var patch = {}, res = { ok: true, id: id, queued: true };
    var body = {};
    Object.keys(data).forEach(function (k) { body[k] = data[k]; });
    body.id = id;

    function done(extraRes) {
      var sync = syncFields(merged(doc, patch), plans, total);
      patch["סה\"כ שולם"] = sync["סה\"כ שולם"];
      patch["חודשים ששולמו"] = sync["חודשים ששולמו"];
      patch["מצב סנכרון"] = sync["מצב סנכרון"];
      patch["תשלום אחרון"] = lastPaidOf(log, doc["תשלום אחרון"]);
      patch.log = trimLog(log);
      res.sync = { ok: true, totalPaid: total, monthly: sync._monthly, allocatedMonths: sync._allocated,
        diff: sync._diff, label: sync._label };
      Object.keys(extraRes || {}).forEach(function (k) { res[k] = extraRes[k]; });
      return { patch: patch, res: res, op: { type: type, body: body } };
    }

    if (type === "recordGymPayment" || type === "confirmGymPayment") {
      var end = monthEnd(data.validUntil);
      if (!end) return { error: "יש לבחור עד איזה חודש המנוי בתוקף" };
      var amount = Number(data.amount || 0);
      if (!(amount > 0)) return { error: "יש להזין את הסכום שהתקבל" };
      /* מגן מכפילות — אותו כלל כמו gymRecentDuplicatePayment_ */
      var dups = activePayments(log).filter(function (e) {
        var t = Date.parse(e.t); return Number(e.amount) === amount && !isNaN(t) && now.getTime() - t >= 0 && now.getTime() - t < DUP_SECONDS * 1000;
      });
      if (dups.length) {
        var ago = Math.round((now.getTime() - Date.parse(dups[dups.length - 1].t)) / 1000);
        return { error: "כבר נרשם תשלום זהה (" + amount + " ₪) לפני " + ago + " שניות. " +
          "אם זה תשלום נוסף ולא כפילות — המתן כמה דקות או הוסף אותו דרך \"יומן תשלומים\"." };
      }
      var isManual = type === "recordGymPayment";
      var recordOnly = data.activate === false;
      var method = data.method || (isManual ? "מזומן" : "פייבוקס");
      patch["תאריך התחלה"] = (parseDay(data.startDate) ? ymd(parseDay(data.startDate)) : "") || doc["תאריך התחלה"] || today;
      patch["בתוקף עד"] = end;
      if (!recordOnly) { patch["סטטוס"] = ST.ACTIVE; patch["סטטוס תשלום"] = "אומת"; }
      patch["אמצעי תשלום"] = method;
      patch["אסמכתא"] = data.reference || "";
      patch["אומת בתאריך"] = today;
      patch["אומת ע\"י"] = by;
      if (data.note) patch["הערות מנהל"] = data.note;
      body.eventId = evId(now);
      log.push(newEvent(now, "תשלום", { id: body.eventId, amount: amount, method: method, ref: data.reference || "",
        until: monthLabel(end), by: by,
        note: recordOnly ? ("נרשם ידנית ע\"י מנהל, בלי הפעלה (סטטוס נשאר: " + (doc["סטטוס"] || "") + ")")
                         : (isManual ? "נרשם ידנית ע\"י מנהל" : "אומת מול דיווח התושב") }));
      total += amount;
      return done({ status: recordOnly ? (doc["סטטוס"] || "") : ST.ACTIVE, validUntil: monthLabel(end), recordOnly: recordOnly || undefined });
    }

    if (type === "updateGymPayment" || type === "voidGymPayment") {
      var idx = -1;
      for (var i = 0; i < log.length; i++) if (log[i].id === data.eventId) idx = i;
      if (idx === -1) return { error: "__notInDoc" };       /* אירוע ישן שנחתך מהמסמך — נתיב ישן */
      var ev = Object.assign({}, log[idx]);
      if (ev.type !== "תשלום") return { error: type === "voidGymPayment" ? "התשלום כבר מבוטל" : "אפשר לערוך רק תשלום פעיל (לא מבוטל)" };
      var changes = [];
      if (type === "voidGymPayment") {
        total -= Number(ev.amount) || 0;
        ev.type = "תשלום מבוטל";
        log[idx] = ev;
        log.push(newEvent(now, "ביטול תשלום", { amount: ev.amount, by: by,
          note: "אירוע " + data.eventId + " בוטל" + (data.reason ? " | סיבה: " + data.reason : "") }, 1));
      } else {
        if (data.amount != null && data.amount !== "") {
          var amt = Number(data.amount);
          if (!(amt > 0)) return { error: "הסכום חייב להיות גדול מאפס" };
          if (amt !== Number(ev.amount)) { changes.push("סכום " + ev.amount + "→" + amt); total += amt - Number(ev.amount); ev.amount = amt; }
        }
        if (data.date) {
          var dd = parseDay(data.date);
          if (!dd) return { error: "תאריך לא תקין" };
          dd.setHours(12, 0, 0, 0);
          if (String(ev.t).slice(0, 10) !== ymd(dd)) { changes.push("תאריך " + String(ev.t).slice(0, 10) + "→" + ymd(dd)); ev.t = dd.toISOString(); }
        }
        if (data.method != null && String(data.method) !== String(ev.method)) { changes.push("אמצעי " + ev.method + "→" + data.method); ev.method = data.method; }
        if (data.reference != null && String(data.reference) !== String(ev.ref)) { changes.push("אסמכתא עודכנה"); ev.ref = data.reference; }
        if (!changes.length) return { patch: {}, res: { ok: true, id: id, unchanged: true }, op: null };
        log[idx] = ev;
        log.push(newEvent(now, "עריכת תשלום", { by: by,
          note: "אירוע " + data.eventId + ": " + changes.join(" · ") + (data.note ? " | סיבה: " + data.note : "") }, 1));
      }
      return done({});
    }

    if (type === "activateGymManual") {
      var end2 = monthEnd(data.validUntil);
      if (!end2) return { error: "יש לבחור עד איזה חודש המנוי בתוקף" };
      patch["תאריך התחלה"] = (parseDay(data.startDate) ? ymd(parseDay(data.startDate)) : "") || doc["תאריך התחלה"] || today;
      patch["בתוקף עד"] = end2;
      patch["סטטוס"] = ST.ACTIVE;
      patch["טופל בתאריך"] = today;
      patch["טופל ע\"י"] = by;
      if (data.note) patch["הערות מנהל"] = String(data.note);
      log.push(newEvent(now, "הפעלה ידנית", { by: by, until: monthLabel(end2),
        note: "מסטטוס \"" + (doc["סטטוס"] || "") + "\"" + (data.note ? (" · " + data.note) : "") }));
      return done({ status: ST.ACTIVE, validUntil: monthLabel(end2) });
    }

    if (type === "extendGymMembership") {
      var end3 = monthEnd(data.validUntil);
      if (!end3) return { error: "יש לבחור עד איזה חודש להאריך" };
      if (!doc["תאריך התחלה"]) patch["תאריך התחלה"] = today;
      patch["בתוקף עד"] = end3;
      if (String(doc["סטטוס"] || "").trim() === ST.EXPIRED) patch["סטטוס"] = ST.ACTIVE;
      log.push(newEvent(now, "הארכת תוקף", { by: by, until: monthLabel(end3), note: data.reason || "" }));
      return done({ validUntil: monthLabel(end3) });
    }

    /* updateGymMembership */
    var prevStatus = String(doc["סטטוס"] || "").trim();
    var chg = [];
    if (data.planId) {
      var plan = null;
      (plans || []).forEach(function (p) { if (p.id === data.planId) plan = p; });
      if (plan) {
        if (String(doc["מסלול"] || "").trim() !== plan.name) chg.push("מסלול → " + plan.name);
        patch["מסלול"] = plan.name;
        if (data.price === undefined || data.price === "") patch["מחיר מוסכם"] = plan.total;
      }
    }
    if (data.price !== undefined && data.price !== "") {
      var pr = Number(data.price);
      if (!isNaN(pr)) { chg.push("מחיר → " + pr); patch["מחיר מוסכם"] = pr; }
    }
    if (data.startDate) {
      var sd = parseDay(data.startDate);
      if (sd) { chg.push("תאריך התחלה → " + data.startDate); patch["תאריך התחלה"] = ymd(sd); }
    }
    if (data.validUntil) {
      var e4 = monthEnd(data.validUntil);
      if (!e4) return { error: "חודש תוקף לא תקין (נדרש YYYY-MM)" };
      chg.push("בתוקף עד → " + data.validUntil);
      patch["בתוקף עד"] = e4;
    }
    if (data.status) {
      var st = String(data.status).trim();
      if (EDITABLE.indexOf(st) === -1) return { error: "סטטוס לא מוכר: " + st };
      if (st !== prevStatus) chg.push("סטטוס: " + prevStatus + " → " + st);
      patch["סטטוס"] = st;
    }
    if (data.note !== undefined) patch["הערות מנהל"] = data.note;
    if (!chg.length && data.note === undefined) return { error: "לא נבחר שום שינוי" };
    patch["טופל בתאריך"] = today;
    patch["טופל ע\"י"] = by;
    log.push(newEvent(now, "עריכה ידנית", { by: by, note: chg.join(" · ") + (data.reason ? (" | סיבה: " + data.reason) : "") }));
    return done({ status: String(data.status || prevStatus).trim(), changes: chg });
  }
  function merged(doc, patch) {
    var o = {};
    Object.keys(doc).forEach(function (k) { o[k] = doc[k]; });
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    return o;
  }

  CBA.gymWrite = { project: project, monthEnd: monthEnd, syncFields: syncFields, TYPES: TYPES };

  if (!CBA.data || !CBA.fb || !CBA.sheets) return;

  /* ========================== חיבור ל-Firebase ========================== */
  var orig = {};
  var plansCache = null, plansAt = 0;

  function fbReady(cb) {
    if (!(CBA.fb.readDoc && CBA.fb.mergeDoc && CBA.fb.createDoc && CBA.fb.ensureDb && CBA.fb.authReady)) return cb(false);
    CBA.fb.authReady(function (user) {
      if (!user) return cb(false);
      CBA.fb.ensureDb(function (err) {
        if (err) return cb(false);
        /* הדגל נקרא ב-ensureDb — בדיקה לפניו מקבלת את ברירת המחדל */
        cb(!!(CBA.fb.flag && CBA.fb.flag("gymWriteFs", false) === true), user);
      });
    });
  }

  function loadPlans(cb) {
    if (plansCache && Date.now() - plansAt < 60000) return cb(plansCache);
    CBA.fb.readDoc("gymConfig", "admin", function (err, d) {
      plansCache = (!err && d && d.plans) ? d.plans : [];
      plansAt = Date.now();
      cb(plansCache);
    });
  }

  function viaFs(type, data, cb) {
    var fallback = function () { orig[type](data, cb); };
    var id = String((data && data.id) || "").trim();
    if (!id) return fallback();
    fbReady(function (on, user) {
      if (!on) return fallback();
      CBA.fb.readDoc("gymMembers", id, function (err, doc) {
        if (err || !doc || !(Number(doc.schema) >= 2)) return fallback();
        loadPlans(function (plans) {
          var by = String((user && user.email) || (CBA.fb.state && CBA.fb.state().user && CBA.fb.state().user.email) || "").toLowerCase();
          var now = new Date();
          var p = project(type, data, doc, plans, now, by);
          if (p.error === "__notInDoc") return fallback();
          if (p.error) return cb({ ok: false, error: p.error });
          if (!p.op) return cb(p.res);                       /* "לא היה שינוי" */
          var opId = "op-" + now.getTime() + "-" + Math.floor(Math.random() * 46656).toString(36);
          var opDoc = { memberId: id, type: p.op.type, body: p.op.body, by: by, createdAt: now.toISOString(),
            status: "pending", schema: 1 };
          if (p.op.body.eventId) opDoc.eventId = p.op.body.eventId;
          /* 1. הכוונה (העיקר). נכשלה → הנתיב הישן, כלום לא נשמר. */
          CBA.fb.createDoc("gymOps", opId, opDoc, function (e1) {
            if (e1) {
              /* 🔴 נפילה לנתיב הישן **רק** כשהכתיבה נדחתה בוודאות (הרשאה/אימות). בכל כשל אחר —
                 למשל פסק זמן ברשת איטית — ה-SDK עלול עדיין להשלים את הכתיבה אחר כך, והנתיב
                 הישן היה מבצע את הפעולה פעם שנייה. לכן מחזירים שגיאה ברורה ולא מנחשים. */
              var code = String((e1 && e1.code) || "");
              if (/permission-denied|unauthenticated|invalid-argument|failed-precondition/.test(code)) return fallback();
              return cb({ ok: false, error: "החיבור איטי ולא ברור אם הפעולה נשמרה. בדוק ביומן התשלומים/בכרטיס המנוי לפני שמנסים שוב." });
            }
            /* 2. הקרנה אופטימית — כישלון כאן לא מבטל: השרת יחיל והמסך יתעדכן בסנכרון. */
            p.patch.updatedAt = CBA.fb.serverNow ? CBA.fb.serverNow() : new Date();
            CBA.fb.mergeDoc("gymMembers", id, p.patch, function () {
              /* 3. מעירים את השרת — שקט, ברקע. הטריגר השעתי הוא רשת הביטחון. */
              try { CBA.sheets.postQuiet("gymApplyOps", { id: id }, function () {}); } catch (e) { }
              cb(p.res);
            });
          });
        });
      });
    });
  }

  TYPES.forEach(function (t) {
    orig[t] = CBA.data[t];
    if (!orig[t]) return;
    CBA.data[t] = function (data, cb) { cb = cb || function () {}; viaFs(t, data, cb); };
  });

  /* ---------- הודעה על פעולה שלא הוחלה ---------- */
  var alerted = {};
  try { alerted = JSON.parse(localStorage.getItem("cba.gymOpsSeen") || "{}") || {}; } catch (e) { alerted = {}; }
  function rememberSeen() { try { localStorage.setItem("cba.gymOpsSeen", JSON.stringify(alerted)); } catch (e) { } }
  CBA.data.gymOpsCheckFailed = function () {
    fbReady(function (on) {
      if (!on || !CBA.fb.queryCollection) return;
      CBA.fb.queryCollection("gymOps", [["status", "failed"]], function (err, rows) {
        if (err || !rows || !rows.length) return;
        var fresh = rows.filter(function (r) { return !alerted[r.id || r._id]; });
        if (!fresh.length) return;
        fresh.forEach(function (r) { alerted[r.id || r._id] = 1; });
        rememberSeen();
        var lines = fresh.slice(0, 5).map(function (r) {
          return "• " + (r.memberId || "") + " — " + (r.type || "") + ": " + (r.error || "נכשל");
        });
        if (CBA.ui && CBA.ui.alert) {
          CBA.ui.alert("פעולות שנשמרו מהר אבל לא הוחלו בגיליון:\n\n" + lines.join("\n") +
            "\n\nהמסך הציג את האמת מהגיליון. אם צריך — בצעי את הפעולה שוב.", "פעולה לא הוחלה");
        }
      });
    });
  };

  /* בודק פעם אחת בכל טעינה, בפתיחה הראשונה של רשימת המנויים (מסך הניהול). */
  var checked = false, listFn = CBA.data.getGymList;
  if (listFn) {
    CBA.data.getGymList = function (cb) {
      if (!checked) { checked = true; setTimeout(function () { try { CBA.data.gymOpsCheckFailed(); } catch (e) { } }, 1500); }
      return listFn.apply(this, arguments);
    };
  }
})();
