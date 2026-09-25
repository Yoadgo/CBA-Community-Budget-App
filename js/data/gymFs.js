/* ============================================================================
 *  gymFs.js — מכון הכושר מ-Firestore קודם, Apps Script ברקע   (25.9.2026)
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

  function fbOk() { return !!(CBA.fb && CBA.fb.readDoc && CBA.fb.readCollection && CBA.fb.ensureDb); }

  /* שם לפי משפחה + משבצת (1/2), מספריית השמות המצומצמת (בלי מייל וטלפון). */
  function nameFor(rows, fid, slot) {
    for (var i = 0; i < (rows || []).length; i++) {
      var r = rows[i];
      if (String(r["מזהה קבוע"] || "").trim() !== String(fid)) continue;
      var first = String(r["שם פרטי " + (slot || 1)] || r["שם פרטי 1"] || "").trim();
      return { first: first, last: String(r["משפחה"] || "").trim() };
    }
    return { first: "", last: fid ? "משפחה " + fid : "" };
  }

  function partialGymList(dirRows, cb) {
    if (!fbOk()) return cb(null);
    var got = 0, members = null, admin = null, failed = false;
    function one() {
      if (++got < 2) return;
      if (failed || !members) return cb(null);
      var a = admin || {};
      var rows = members.map(function (d) {
        var n = nameFor(dirRows, d.familyId, d.slot);
        var r = {};
        Object.keys(d).forEach(function (k) { r[k] = d[k]; });
        r["שם פרטי"] = n.first; r["שם משפחה"] = n.last; r["אימייל"] = "";
        return r;
      });
      cb({ ok: true, partial: true, members: rows, log: [], settings: a.settings || {},
           plans: a.plans || [], questions: a.questions || [], rules: a.rules || [],
           hasEntryCode: !!a.hasEntryCode });
    }
    CBA.fb.readCollection("gymMembers", function (err, rows) { if (err) failed = true; else members = rows || []; one(); });
    CBA.fb.readDoc("gymConfig", "admin", function (err, d) { if (err) failed = true; else admin = d; one(); });
  }

  var origList = CBA.data.getGymList;
  if (origList) {
    CBA.data.getGymList = function (cb) {
      cb = cb || function () {};
      var full = false;
      origList(function (res) { full = true; cb(res); });
      var dir = null;
      function emit() {
        partialGymList(dir, function (part) {
          /* ריק ב-Firestore = עוד לא סונכרן ⇒ לא מציגים "אין מנויים" בטעות. */
          if (!full && part && part.members.length) cb(part);
        });
      }
      emit();
      /* השמות מגיעים מספרייה שנטענת פעם אחת בסשן. אם היא עוד לא כאן —
         מציירים מיד בלי שמות, ושוב כשהיא מגיעה (אם המלא עוד לא חזר). */
      if (CBA.data.getResidentDirectory) {
        CBA.data.getResidentDirectory(function (res) {
          if (full || !(res && res.ok)) return;
          dir = res.rows || [];
          emit();
        });
      }
    };
  }

  /* הגדרות המכון לתושב (מסלולים, פייבוקס, ימי תזכורת) — לציור המוקדם. */
  CBA.data.getGymPublicFast = function (cb) {
    cb = cb || function () {};
    if (!fbOk()) return cb(null);
    CBA.fb.readDoc("gymConfig", "public", function (err, d) { cb(err ? null : (d || null)); });
  };
})();
