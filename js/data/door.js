/* ============================================================================
 *  door.js — שכבת הנתונים של הדלת (Nuki) ושל WeWork   (25.9.2026)
 * ----------------------------------------------------------------------------
 *  קריאה: ישירות מ-Firestore (CBA.fb) — מהיר, בלי Apps Script.
 *  כתיבה: **רק** דרך Apps Script (Door.gs). הכללים חוסמים כל כתיבה מהדפדפן.
 *
 *  ⚠️ כל עטיפות CBA.fb הן callback עם (err, data) — לא Promise.
 *  ⚠️ CBA.sheets.postRead מחזיר cb(res) עם res.ok.
 *  ר' apps-script/Door.gs לתיאור המלא של האוספים וההרשאות.
 * ========================================================================== */
window.CBA = window.CBA || {};
CBA.door = (function () {
  "use strict";

  var WW_DEFAULTS = {
    viewFrom: 8, viewTo: 21, regularFrom: 7, regularTo: 22,
    desks: 3, lounge: 1, maxHours: 6, advanceDays: 14, perFamily: 2
  };
  var SEAT_LABEL = { desk: "עמדת מחשב", lounge: "עמדת כורסאות" };
  var SEAT_SHORT = { desk: "מחשב", lounge: "כורסה" };
  var DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

  function fbReady() { return !!(CBA.fb && CBA.fb.readDoc && CBA.fb.ensureDb); }
  function noFb(cb) { cb("firestore-unavailable"); }

  function myFamilyId() {
    var u = (window.CBA && CBA.user) || {};
    return String(u.familyId || u.house || "").trim();
  }
  function perms() { return Array.isArray(CBA.perms) ? CBA.perms : []; }
  function can(p) { return !!CBA.isSuper || perms().indexOf(p) !== -1; }

  /* ---------------------------------------------------------------- זמן --- */
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dateStr(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function today() { return dateStr(new Date()); }
  function addDays(ds, n) {
    var p = ds.split("-"), d = new Date(+p[0], +p[1] - 1, +p[2], 12);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }
  function parse(ds) { var p = ds.split("-"); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function hh(h) { return pad(h) + ":00"; }
  /* ⚠️ טווח שעות בתוך משפט עברי מתהפך ("24:00–21:00"). בידוד LTR
     (U+2066…U+2069) שומר על הסדר גם בתוך טקסט RTL, בלי תגית. */
  function range(from, to) { return "\u2066" + hh(from) + "–" + hh(to) + "\u2069"; }
  function dayLabel(ds) {
    var t = today();
    if (ds === t) return "היום";
    if (ds === addDays(t, 1)) return "מחר";
    return "יום " + DAYS[parse(ds).getDay()];
  }
  function shortDate(ds) { var d = parse(ds); return d.getDate() + "." + (d.getMonth() + 1); }
  function whenLabel(b) { return dayLabel(b.date) + ", " + shortDate(b.date) + " · " + range(b.from, b.to); }
  function nowMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); }

  /** מצב שריון ביחס לרגע הזה: before / now / ended. */
  function phase(b) {
    var t = today();
    if (b.date < t) return "ended";
    if (b.date > t) return "before";
    var m = nowMin();
    if (m < b.from * 60) return "before";
    if (m < b.to * 60) return "now";
    return "ended";
  }

  /* ------------------------------------------------------------ קריאות --- */
  function readPublic(cb) {
    if (!fbReady()) return cb(null, { mode: "off", gymOn: false });
    CBA.fb.readDoc("doorConfig", "public", function (err, d) {
      if (err) return cb(err, { mode: "off", gymOn: false });
      cb(null, { mode: (d && d.mode) || "off", gymOn: !!(d && d.gymOn) });
    });
  }

  function readConfig(cb) {
    if (!fbReady()) return noFb(cb);
    CBA.fb.readDoc("weworkConfig", "main", function (err, d) {
      if (err) return cb(err);
      var out = {};
      Object.keys(WW_DEFAULTS).forEach(function (k) {
        out[k] = d && typeof d[k] === "number" ? d[k] : WW_DEFAULTS[k];
      });
      cb(null, out);
    });
  }

  /** האזנה חיה לתפוסה של יום. מחזיר פונקציית ניתוק. */
  function watchDay(date, cb) {
    if (!fbReady() || !CBA.fb.watchDoc) { cb("firestore-unavailable"); return function () {}; }
    return CBA.fb.watchDoc("weworkDays", date, function (err, d) {
      if (err) return cb(err);
      cb(null, (d && d.slots) || {});
    });
  }
  function readDay(date, cb) {
    if (!fbReady()) return noFb(cb);
    CBA.fb.readDoc("weworkDays", date, function (err, d) { cb(err, (d && d.slots) || {}); });
  }

  /** השריונים של המשפחה שלי שעוד לא הסתיימו, לפי סדר. */
  function myBookings(cb) {
    if (!fbReady()) return noFb(cb);
    var fid = myFamilyId();
    if (!fid) return cb(null, []);
    CBA.fb.queryCollection("weworkBookings", [["familyId", fid]], function (err, rows) {
      if (err) return cb(err);
      var list = (rows || []).filter(function (b) { return b.status === "active" && phase(b) !== "ended"; });
      list.sort(function (a, b) { return a.date === b.date ? a.from - b.from : (a.date < b.date ? -1 : 1); });
      cb(null, list);
    });
  }

  /** מנהל WeWork: כל השריונים של יום. */
  function dayBookings(date, cb) {
    if (!fbReady()) return noFb(cb);
    CBA.fb.queryCollection("weworkBookings", [["date", date]], function (err, rows) {
      if (err) return cb(err);
      (rows || []).sort(function (a, b) { return a.from - b.from || (a.createdAtMs || 0) - (b.createdAtMs || 0); });
      cb(null, rows || []);
    });
  }

  /** יומן הדלת ליום. kind='wework' למנהל WeWork (הכלל מחייב את הסינון). */
  function dayLog(date, kind, cb) {
    if (!fbReady()) return noFb(cb);
    var conds = [["day", date]];
    if (kind) conds.push(["kind", kind]);
    CBA.fb.queryCollection("doorLog", conds, function (err, rows) {
      if (err) return cb(err);
      (rows || []).sort(function (a, b) { return (b.atMs || 0) - (a.atMs || 0); });
      cb(null, rows || []);
    });
  }

  function readState(cb) {
    if (!fbReady()) return noFb(cb);
    CBA.fb.readDoc("doorState", "main", cb);
  }

  function readGymNuki(cb) {
    if (!fbReady()) return noFb(cb);
    CBA.fb.authReady(function (user) {
      var uid = user && CBA.fb.uid && CBA.fb.uid();
      if (!uid) return cb(null, null);
      CBA.fb.readDoc("gymNuki", uid, function (err, d) { cb(err, d || null); });
    });
  }

  /* ------------------------------------------------------------ פעולות --- */
  function post(action, payload, cb) {
    cb = cb || function () {};
    if (!(CBA.sheets && CBA.sheets.postRead)) return cb({ ok: false, error: "אין חיבור לשרת" });
    CBA.sheets.postRead(action, payload || {}, function (res) { cb(res || { ok: false, error: "אין תשובה מהשרת" }); });
  }

  /* ⚡ פתיחת הדלת — המסלול המהיר (25.9). שולחים את טוקן Firebase כדי
     שהשרת יזהה אותנו בלי לקרוא את הגיליון (ר' doorOpenFast_ ב-Door.gs).
     uid/familyId נשלחים רק כדי שהשרת ישאל במקביל — הוא לא סומך עליהם.
     אין טוקן (Firebase לא עלה) ⇒ אותה בקשה בלי טוקן = המסלול הרגיל. */
  function openDoor(reason, bookingId, cb) {
    var payload = { reason: reason, bookingId: bookingId || "" };
    var uid = CBA.fb && CBA.fb.uid && CBA.fb.uid();
    if (!(uid && CBA.fb.idToken)) return post("doorOpen", payload, cb);
    var done = false;
    var guard = setTimeout(function () { if (!done) { done = true; post("doorOpen", payload, cb); } }, 1500);
    CBA.fb.idToken(function (err, tok) {
      if (done) return;
      done = true; clearTimeout(guard);
      if (!err && tok) { payload.idToken = tok; payload.uid = uid; payload.familyId = myFamilyId(); }
      post("doorOpen", payload, cb);
    });
  }

  return {
    SEAT_LABEL: SEAT_LABEL, SEAT_SHORT: SEAT_SHORT, DAYS: DAYS, DEFAULTS: WW_DEFAULTS,
    myFamilyId: myFamilyId, can: can,
    pad: pad, hh: hh, range: range, today: today, addDays: addDays, parse: parse,
    dayLabel: dayLabel, shortDate: shortDate, whenLabel: whenLabel, nowMin: nowMin, phase: phase,
    readPublic: readPublic, readConfig: readConfig, watchDay: watchDay, readDay: readDay,
    myBookings: myBookings, dayBookings: dayBookings, dayLog: dayLog,
    readState: readState, readGymNuki: readGymNuki,
    book: function (p, cb) { post("weworkBook", p, cb); },
    cancel: function (id, cb) { post("weworkCancel", { id: id }, cb); },
    open: openDoor,
    saveConfig: function (p, cb) { post("weworkSaveConfig", p, cb); },
    status: function (cb) { post("doorStatus", {}, cb); },
    configure: function (p, cb) { post("doorConfigure", p, cb); },
    testConnection: function (cb) { post("doorTestConnection", {}, cb); },
    saveContact: function (p, cb) { post("doorSaveContact", p, cb); },
    gymResend: function (cb) { post("doorGymResend", {}, cb); }
  };
})();
