/* ============================================================================
 *  gymFs.js — מכון הכושר מ-Firestore בלבד, בלי ריצוד   (25.9.2026, שוכתב 3.10.2026)
 * ----------------------------------------------------------------------------
 *  בקשת יועד: "תעביר מקסימום תכולות ל-Firebase עם מזהה משפחה, uid".
 *
 *  🔑 המסך נפתח מ-Firestore **מיד** (עשרות אלפיות שנייה), ובמקביל רצה
 *     הקריאה הרגילה ל-Apps Script (2–10 שניות). כשהיא חוזרת — המסך מתרענן
 *     עם השדות האישיים שלא עוברים ל-Firestore (שם, טלפון, ת.ז., הצהרה).
 *     זו בדיוק ההתנהגות של "סטייל-וויל-ריוואלידייט": קודם מה שיש, אחר כך הכול.
 *
 *  ⚠️ עוטף את CBA.data.getGymList הקיים — לא מחליף אותו. אם Firestore לא
 *     זמין או ריק, המסך פשוט מחכה לתשובה הרגילה כמו היום.
 *  ⚠️ ה-callback של getGymList עלול להיקרא **פעמיים** (חלקי ואז מלא).
 *     gymAdmin מצייר מחדש בכל קריאה — זה בטוח. התשובה החלקית מסומנת partial:true.
 * ========================================================================== */
window.CBA = window.CBA || {};
(function () {
  "use strict";
  if (!CBA.data) return;

  /* 3.10.26 — שלב 1 של המעבר המלא ל-Firebase (בקשת יועד), וגם תיקון "ריצוד השמות".
     ❌ מה היה: המסך צויר שלוש פעמים — מ-Firestore בלי שמות ("משפחה 32"), שוב כשספריית
        השמות הגיעה, ושוב מהגיליון. כל ציור החליף את מה שהמנהל ראה.
     ✅ מה עכשיו: ציור **אחד**. מחכים לשלושה מקורות קצרים במקביל (מנויים, הגדרות מכון,
        ספריית שמות — השלישית שמורה במכשיר) ורק אז מציירים. אין תשובה "חלקית" יותר.
     🔑 גם הצהרות הבריאות והיומן יושבים עכשיו במסמך המנוי (schema 2), לכן אין עוד קריאה
        לאפסקריפט כדי להציג את הרשימה. שם פרטי/משפחה ומספר בית מגיעים מספריית השמות;
        ת.ז./תאריך לידה/טלפון נשארים בגיליון "תושבים" ונמשכים רק בעת צפייה בהצהרה.
     🛑 דגל כיבוי: appConfig/flags → gymAdminFs:false מחזיר את המסך לקריאה מהגיליון.
        אם המראה לא זרוע במלואו (מסמך בלי schema 2) — נופלים אוטומטית לגיליון. */

  function fbOk() { return !!(CBA.fb && CBA.fb.readDoc && CBA.fb.readCollection && CBA.fb.ensureDb); }
  function flagOn() { return !(CBA.fb && CBA.fb.flag) || CBA.fb.flag("gymAdminFs", true) !== false; }

  function findFamily(rows, fid) {
    for (var i = 0; i < (rows || []).length; i++) {
      if (String(rows[i]["מזהה קבוע"] || "").trim() === String(fid)) return rows[i];
    }
    return null;
  }
  function houseOf(r) {
    if (!r) return "";
    if (r["מספר בית"] != null && r["מספר בית"] !== "") return String(r["מספר בית"]);
    var ks = Object.keys(r);
    for (var i = 0; i < ks.length; i++) {
      if (ks[i].indexOf("בית") !== -1 && ks[i].indexOf("שם") === -1 && r[ks[i]] !== "") return String(r[ks[i]]);
    }
    return "";
  }

  /* מסמכי Firestore → תשובה בצורת getGymList של Apps Script. מחזיר null אם המראה לא מוכן. */
  function assemble(members, admin, dirRows) {
    if (!members || !members.length || !admin) return null;
    for (var i = 0; i < members.length; i++) if (!(Number(members[i].schema) >= 2)) return null;
    var rows = [], log = [];
    members.forEach(function (d) {
      var fam = findFamily(dirRows, d.familyId);
      var slot = d.slot || 1;
      var first = fam ? String(fam["שם פרטי " + slot] || fam["שם פרטי 1"] || "").trim() : "";
      var last = fam ? String(fam["משפחה"] || "").trim() : "";
      var r = {};
      Object.keys(d).forEach(function (k) { if (k !== "log") r[k] = d[k]; });
      r["שם פרטי"] = first;
      r["שם משפחה"] = last || (d.familyId ? "משפחה " + d.familyId : "");
      r["אימייל"] = "";
      r["מספר בית"] = houseOf(fam);
      rows.push(r);
      (d.log || []).forEach(function (e) {
        log.push({
          "מזהה אירוע": e.id, "מזהה מנוי": String(d["מזהה"] || d.id || ""), "תאריך": e.t, "סוג אירוע": e.type,
          "סכום": e.amount, "אמצעי תשלום": e.method, "אסמכתא": e.ref, "בתוקף עד (אחרי)": e.until,
          "בוצע ע\"י": e.by, "הערה": e.note
        });
      });
    });
    log.sort(function (a, b) { return String(a["תאריך"]).localeCompare(String(b["תאריך"])); });
    return { ok: true, members: rows, log: log, settings: admin.settings || {}, plans: admin.plans || [],
             questions: admin.questions || [], rules: admin.rules || [], hasEntryCode: !!admin.hasEntryCode, src: "fs" };
  }

  function fsGymList(cb) {
    if (!fbOk()) return cb(null);
    var got = 0, members = null, admin = null, dir = null, failed = false;
    function one() {
      if (++got < 3) return;
      if (failed) return cb(null);
      cb(assemble(members, admin, dir));
    }
    CBA.fb.readCollection("gymMembers", function (err, rows) { if (err) failed = true; else members = rows || []; one(); });
    CBA.fb.readDoc("gymConfig", "admin", function (err, d) { if (err) failed = true; else admin = d; one(); });
    if (CBA.data.getResidentDirectory) {
      CBA.data.getResidentDirectory(function (res) { if (res && res.ok) dir = res.rows || []; else failed = true; one(); });
    } else { failed = true; one(); }
  }

  var origList = CBA.data.getGymList;
  if (origList) {
    /* גרסת הגיליון נשארת זמינה: לגיבוי, ולשליפת ת.ז./תאריך לידה בצפייה בהצהרה. */
    CBA.data.getGymListSheets = origList;
    CBA.data.getGymList = function (cb) {
      cb = cb || function () {};
      if (!flagOn()) return origList(cb);
      fsGymList(function (res) { if (res) cb(res); else origList(cb); });
    };
  }

  /* הגדרות המכון לתושב (מסלולים, פייבוקס, ימי תזכורת) — לציור המוקדם. */
  CBA.data.getGymPublicFast = function (cb) {
    cb = cb || function () {};
    if (!fbOk()) return cb(null);
    CBA.fb.readDoc("gymConfig", "public", function (err, d) { cb(err ? null : (d || null)); });
  };
})();
