/* ============================================================================
 *  ועד השיכון v2 — עץ היררכי + עורך   (2026-09-25)
 * ----------------------------------------------------------------------------
 *  מחליף את שני המסכים הישנים (resCommittee ב-resident.js, committeeAdmin
 *  ב-residents.js). הקובץ נטען אחריהם ודורס את הרישום שלהם ב-CBA.screens.
 *  ⏪ ביטול: להסיר את שתי השורות של committeeTree.js/.css מ-index.html —
 *     המסכים הישנים חוזרים כמו שהיו, בלי שום שינוי אחר.
 *
 *  🔑 שלוש החלטות שמעצבות את הקובץ:
 *
 *  1. **הקווים לא מחושבים.** כל כרטיס מצייר את הקו של עצמו ב-CSS
 *     (::before/::after). JS רק מחליט כמה כרטיסים בשורה (2/4/6 — תמיד
 *     זוגי, כדי שהגזע יעבור ברווח שבין שני כרטיסים). אין מדידת מיקום
 *     של אף אלמנט, ולכן אין מה שיסטה כשכרטיס גבוה יותר או כשהגופן נטען
 *     באיחור. זה בדיוק מה שנשבר בעץ הישן (layoutOrgTree + SVG).
 *
 *  2. **אדם בעץ מזוהה לפי המשפחה + מספר הדייר (1/2), לא לפי שם.**
 *     הבאג הישן: תפקיד הוצמד לכל מי ששמו הפרטי זהה. כאן אין התאמה לפי שם
 *     בשום מקום, חוץ מההעברה החד-פעמית מהגיליון — ושם רק שם מלא, ורק
 *     כשיש בדיוק תושב אחד כזה. כל השאר מסומן "לבדיקה" לבחירה ידנית.
 *     אדם מחוץ לשיכון (מב"ס, קבלן) נשמר כשם חופשי ומסומן "חיצוני".
 *
 *  3. **Firestore הוא המסד החי** (מודל ב'): מסמך יחיד committee/tree
 *     שמחזיק את כל התפקידים והקטגוריות. עץ של עשרות תפקידים הוא מסמך
 *     קטן, קריאה אחת, ושמירה אטומית אחת. `rev` רץ מונע דריסה בין שני
 *     מנהלים שעורכים יחד (טרנזקציה + כלל ב-firestore.rules).
 *     שמות תושבים **לא** נשמרים במסמך — רק familyId+slot. השם נשלף
 *     מרשימת התושבים (communityDirectory) בזמן הציור.
 *     כל עוד המסמך לא קיים, התצוגה קוראת את הגיליון הישן ("עץ ועד השיכון")
 *     וממירה אותו בזיכרון. השמירה הראשונה של מנהל-על יוצרת את המסמך.
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};

  var COLL = "committee", DOC = "tree", SCHEMA = 1;
  var FLAG = "committeeFromFirestore";
  var DEFAULT_CATS = [
    { id: "c1", name: "הנהלה",        color: "#111827" },
    { id: "c2", name: "ילדים וקהילה", color: "#7C3AED" },
    { id: "c3", name: "תפעול ושירות", color: "#0891B2" },
    { id: "c4", name: "ועדת מתנדבים", color: "#6B7280" }
  ];
  var PALETTE = ["#111827", "#7C3AED", "#0891B2", "#6B7280", "#059669",
                 "#D97706", "#DB2777", "#2563EB", "#65A30D", "#B45309"];

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function uid() { return (CBA.fb && CBA.fb.uid && CBA.fb.uid()) || ""; }
  function isSuper() { return !!CBA.isSuper; }
  function newId(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  /* ==========================================================================
   *  מצב
   * ======================================================================== */
  var S = {
    loaded: false, loading: false, waiters: [],
    source: "",        // "fs" | "sheet"  — מאיפה הגיע העץ הנוכחי
    error: "",         // כשל טעינה (לא "אין מסמך" — זה מצב לגיטימי)
    flagOff: false,    // מתג החירום כבוי ⇒ קריאה מהגיליון, עריכה חסומה
    rev: 0, roles: [], cats: [],
    people: null, dirOk: false,
    saving: false
  };
  /* מצב תצוגה — נשמר בין ציורים (רענון רקע מצייר מחדש את המסך). */
  var V = { q: "", cat: "", open: {}, sel: null, draft: null };

  /* ==========================================================================
   *  רשימת התושבים — המקור לשמות. אותה זיהוי עמודות כמו dirCols ב-resident.js
   * ======================================================================== */
  /* מספר הדייר מתוך שם העמודה ("שם פרטי 2" ⇒ 2). נחשף גם ל-resident.js. */
  function slotOfKey(key, idx) {
    var m = String(key || "").match(/(\d)/);
    return m ? parseInt(m[1], 10) : (idx + 1);
  }
  function buildPeople(rows) {
    var keys = {};
    (rows || []).forEach(function (r) { Object.keys(r).forEach(function (k) { keys[k] = true; }); });
    var c = { first: [], family: null, house: null, status: null, rid: null };
    Object.keys(keys).forEach(function (k) {
      var t = k.trim();
      if (t.indexOf("שם פרטי") !== -1) c.first.push(k);
      else if (t.indexOf("מזהה קבוע") !== -1) c.rid = k;
      else if (t.indexOf("משפחה") !== -1) c.family = k;
      else if (t.indexOf("בית") !== -1) c.house = k;
      else if (t.indexOf("סטטוס") !== -1) c.status = k;
    });
    c.first.sort();
    function v(r, k) { return k ? String(r[k] == null ? "" : r[k]).trim() : ""; }
    var list = [], byKey = {}, byFull = {};
    (rows || []).forEach(function (r) {
      var fid = v(r, c.rid);
      if (!fid) return;
      var st = v(r, c.status);
      var active = !st || st.indexOf("פעיל") !== -1;
      var fam = v(r, c.family), house = v(r, c.house);
      c.first.forEach(function (k, i) {
        var fn = v(r, k);
        if (!fn) return;
        var p = { key: fid + "#" + slotOfKey(k, i), fid: fid, slot: slotOfKey(k, i),
                  first: fn, family: fam, house: house, active: active,
                  full: fam ? fn + " " + fam : fn };
        byKey[p.key] = p;
        if (active) {
          list.push(p);
          (byFull[p.full] = byFull[p.full] || []).push(p);
        }
      });
    });
    list.sort(function (a, b) { return a.full.localeCompare(b.full, "he"); });
    return { list: list, byKey: byKey, byFull: byFull };
  }

  /* מי מחזיק בתפקיד, לתצוגה. */
  function who(h) {
    if (!h) return null;
    if (h.fid) {
      var p = S.people && S.people.byKey[h.fid + "#" + h.slot];
      if (p && p.active) return { name: p.full, house: p.house, init: initials(p.first, p.family), kind: "res" };
      if (!S.dirOk) return { name: "שם לא זמין", house: "", init: "?", kind: "res" };
      return { name: "תושב/ת שעזב/ה", house: "", init: "?", kind: "gone" };
    }
    return { name: String(h.ext || ""), house: "", init: initials.apply(null, String(h.ext || "").split(" ")),
             kind: "ext", review: !!h.review };
  }
  function initials(a, b) {
    var x = String(a || "").trim().charAt(0), y = String(b || "").trim().charAt(0);
    return (x + y) || "?";
  }

  /* ==========================================================================
   *  טעינה
   * ======================================================================== */
  function load(cb, force) {
    if (S.loaded && !force) { if (cb) cb(); return; }
    if (cb) S.waiters.push(cb);
    if (S.loading) return;
    S.loading = true;
    var pending = 2, fsDoc = null, fsErr = null, viaSheet = false;

    readFs(function (err, doc, sheetWhy) {
      fsErr = err; fsDoc = doc; viaSheet = !!sheetWhy;
      S.flagOff = sheetWhy === "flag-off";
      done();
    });
    if (S.people && !force) { done(); }
    else {
      CBA.data.getCommunityDirectory(function (res) {
        S.dirOk = !!(res && res.ok);
        S.people = buildPeople(S.dirOk ? res.rows : []);
        done();
      });
    }

    function done() {
      if (--pending) return;
      if (fsErr) {
        S.error = "לא הצלחנו לטעון את עץ הוועד (" + fsErr + ").";
        return finish();
      }
      if (fsDoc && !viaSheet) { applyDoc(fsDoc); S.source = "fs"; S.error = ""; return finish(); }
      loadFromSheet(finish);
    }
  }
  function finish() {
    S.loading = false; S.loaded = true;
    var w = S.waiters; S.waiters = [];
    w.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
  }

  /* 🔴 כשל Firestore אינו נפילה שקטה לגיליון (ר' fsFirstRead ב-dataService):
     הגיליון הישן לא מתעדכן יותר מרגע המעבר, ומי שנופל אליו רואה עץ ישן בלי
     לדעת. נפילה לגיליון רק בשני מצבים שהם החלטה ולא כשל: המסמך עוד לא
     נוצר (לפני ההעברה), או שמנהל-על כיבה את הדגל. */
  function readFs(cb) {
    if (!CBA.fb || !CBA.fb.readDoc) return cb(null, null, "no-sdk");
    var ready = CBA.fb.userReady || CBA.fb.authReady;
    ready.call(CBA.fb, function (user) {
      if (!user) return cb("no-user");
      CBA.fb.ensureDb(function (dbErr) {
        if (dbErr) return cb("db:" + (dbErr.code || dbErr.message || "?"));
        if (CBA.fb.flag && !CBA.fb.flag(FLAG, true)) return cb(null, null, "flag-off");
        CBA.fb.readDoc(COLL, DOC, function (err, d) {
          if (err) return cb(String(err.code || err.message || err));
          if (!d) return cb(null, null, "no-doc");
          cb(null, d);
        });
      });
    });
  }

  function applyDoc(d) {
    S.rev = parseInt(d.rev, 10) || 0;
    S.cats = (Array.isArray(d.cats) && d.cats.length) ? d.cats.map(function (c) {
      return { id: String(c.id), name: String(c.name || ""), color: String(c.color || "#111827") };
    }) : clone(DEFAULT_CATS);
    S.roles = (Array.isArray(d.roles) ? d.roles : []).map(normRole);
  }
  function normRole(r, i) {
    return {
      id: String(r.id), parent: String(r.parent || ""), title: String(r.title || ""),
      cat: String(r.cat || ""), order: (typeof r.order === "number") ? r.order : i,
      holders: (Array.isArray(r.holders) ? r.holders : []).map(function (h) {
        if (h && h.fid) return { fid: String(h.fid), slot: parseInt(h.slot, 10) || 1 };
        var o = { ext: String((h && h.ext) || "") };
        if (h && h.review) o.review = true;
        return o;
      }).filter(function (h) { return h.fid || h.ext; })
    };
  }

  /* העברה מהגיליון הישן — בזיכרון בלבד, עד השמירה הראשונה. */
  function loadFromSheet(cb) {
    var catsDone = function () {
      CBA.data.getCommitteeTree(function (res) {
        if (!res || !res.ok) {
          S.error = (res && res.error) || "לא הצלחנו לטעון את עץ הוועד.";
          return cb();
        }
        convertSheet(res.rows || []);
        S.source = "sheet"; S.rev = 0; S.error = "";
        cb();
      });
    };
    if (CBA.committee && CBA.committee.loadCategories) CBA.committee.loadCategories(catsDone);
    else catsDone();
  }
  function convertSheet(rows) {
    /* 🔴 26.9 — נתפס בהעברה החיה: בטאב "קטגוריות ועד השיכון" נשארה שורה אחת,
       וכל 29 התפקידים קיבלו אותה קטגוריה. לכן הרשימה = מה שבטאב **ועוד** כל
       שם קטגוריה שמופיע בשורות העץ עצמן (צבע מוכר אם השם מוכר, אחרת מהפלטה). */
    var sheetCats = (CBA.committee && CBA.committee.catsList) ? CBA.committee.catsList() : [];
    var byName = {};
    S.cats = [];
    function addCat(name, color) {
      name = String(name || "").trim();
      if (!name || byName[name]) return;
      var def = DEFAULT_CATS.filter(function (d) { return d.name === name; })[0];
      var c = { id: "c" + (S.cats.length + 1), name: name,
                color: color || (def ? def.color : PALETTE[S.cats.length % PALETTE.length]) };
      byName[name] = c; S.cats.push(c);
    }
    sheetCats.forEach(function (c) { addCat(c.name, c.color); });
    rows.forEach(function (r) { addCat(r["קטגוריה"]); });
    if (!S.cats.length) S.cats = clone(DEFAULT_CATS);
    function catId(name) {
      for (var i = 0; i < S.cats.length; i++) if (S.cats[i].name === name) return S.cats[i].id;
      return S.cats[0] ? S.cats[0].id : "";
    }
    var byId = {}, order = [];
    rows.forEach(function (r) {
      var id = String(r["מזהה תא"] || "").trim();
      if (!id) return;
      if (!byId[id]) {
        byId[id] = { id: id, parent: String(r["הורה"] || "").trim(), title: String(r["תפקיד"] || "").trim(),
                     cat: catId(String(r["קטגוריה"] || "").trim()), order: order.length, holders: [] };
        order.push(byId[id]);
      }
      var name = String(r["שם"] || "").trim();
      if (name) byId[id].holders.push(matchName(name));
    });
    S.roles = order;
  }
  /* שם מלא מדויק, ותושב/ת אחד/ת בלבד. אחרת "לבדיקה". בלי שם פרטי בלבד. */
  function matchName(name) {
    var hits = S.people && S.people.byFull[name];
    if (hits && hits.length === 1) return { fid: hits[0].fid, slot: hits[0].slot };
    return { ext: name, review: true };
  }

  /* ==========================================================================
   *  שמירה — טרנזקציה עם rev (שני מנהלים לא דורסים זה את זה)
   * ======================================================================== */
  function save(nextRoles, nextCats, cb) {
    if (S.saving) return cb({ ok: false, error: "שמירה קודמת עוד רצה." });
    if (S.flagOff) return cb({ ok: false, error: "העריכה כבויה כרגע (מתג ועד השיכון במצב המערכת)." });
    if (!CBA.fb || !CBA.fb.ensureDb) return cb({ ok: false, error: "אין חיבור ל-Firebase." });
    var me = uid();
    if (!me) return cb({ ok: false, error: "לא מחובר ל-Firebase. נסו לרענן את העמוד." });
    var baseRev = S.rev;
    var payload = {
      schema: SCHEMA, rev: baseRev + 1,
      roles: nextRoles.map(function (r, i) {
        return { id: r.id, parent: r.parent || "", title: r.title, cat: r.cat || "",
                 order: (typeof r.order === "number") ? r.order : i,
                 holders: r.holders.map(function (h) {
                   if (h.fid) return { fid: h.fid, slot: h.slot };
                   return h.review ? { ext: h.ext, review: true } : { ext: h.ext };
                 }) };
      }),
      cats: nextCats.map(function (c) { return { id: c.id, name: c.name, color: c.color }; }),
      updatedBy: me,
      updatedAt: CBA.fb.serverNow()
    };
    S.saving = true;
    CBA.fb.ensureDb(function (dbErr) {
      if (dbErr) { S.saving = false; return cb({ ok: false, error: "אין חיבור ל-Firebase." }); }
      try {
        var db = window.firebase.firestore();
        var ref = db.collection(COLL).doc(DOC);
        db.runTransaction(function (tr) {
          return tr.get(ref).then(function (d) {
            var cur = d.exists ? (parseInt((d.data() || {}).rev, 10) || 0) : 0;
            if (cur !== baseRev) { var e = new Error("conflict"); e.code = "cba-conflict"; throw e; }
            tr.set(ref, payload);
          });
        }).then(function () {
          S.saving = false;
          S.rev = payload.rev; S.source = "fs";
          S.roles = payload.roles.map(normRole);
          S.cats = clone(payload.cats);
          cb({ ok: true });
        })["catch"](function (e) {
          S.saving = false;
          var code = e && (e.code || e.message);
          if (code === "cba-conflict") return cb({ ok: false, conflict: true,
            error: "מישהו אחר שמר שינוי בעץ בזמן שערכת. העץ רוענן — בצעו את השינוי שוב." });
          if (code === "permission-denied") return cb({ ok: false,
            error: "אין הרשאה לשמור. ייתכן שכללי האבטחה של Firebase עוד לא עודכנו." });
          cb({ ok: false, error: "השמירה נכשלה (" + code + ")." });
        });
      } catch (e) { S.saving = false; cb({ ok: false, error: "השמירה נכשלה." }); }
    });
  }

  /* ==========================================================================
   *  מבנה העץ
   * ======================================================================== */
  function index(roles) {
    var byId = {}, kids = {};
    roles.forEach(function (r) { byId[r.id] = r; });
    roles.forEach(function (r) {
      var p = (r.parent && byId[r.parent] && r.parent !== r.id) ? r.parent : "";
      (kids[p] = kids[p] || []).push(r);
    });
    Object.keys(kids).forEach(function (k) {
      kids[k].sort(function (a, b) { return (a.order - b.order) || a.title.localeCompare(b.title, "he"); });
    });
    /* הגנה ממעגל (א' הורה של ב' וב' של א'): מי שלא נגיש מהשורש — נהיה שורש. */
    var seen = {}, stack = (kids[""] || []).slice();
    while (stack.length) { var n = stack.pop(); if (seen[n.id]) continue; seen[n.id] = 1; (kids[n.id] || []).forEach(function (k) { stack.push(k); }); }
    roles.forEach(function (r) {
      if (!seen[r.id]) {
        Object.keys(kids).forEach(function (k) { kids[k] = kids[k].filter(function (x) { return x.id !== r.id; }); });
        (kids[""] = kids[""] || []).push(r); seen[r.id] = 1;
        var st = [r];
        while (st.length) { var q = st.pop(); (kids[q.id] || []).forEach(function (k) { seen[k.id] = 1; st.push(k); }); }
      }
    });
    return { byId: byId, kids: function (id) { return kids[id || ""] || []; } };
  }
  function descendants(ix, id) {
    var out = {}, st = [id];
    while (st.length) { ix.kids(st.pop()).forEach(function (k) { if (!out[k.id]) { out[k.id] = 1; st.push(k.id); } }); }
    return out;
  }
  function catOf(id) {
    for (var i = 0; i < S.cats.length; i++) if (S.cats[i].id === id) return S.cats[i];
    return S.cats[0] || { id: "", name: "", color: "#111827" };
  }

  /* התאמה לחיפוש/סינון. תפקיד "חי" אם הוא או צאצא שלו מתאים. */
  function matcher(ix) {
    var q = V.q.trim(), cat = V.cat;
    if (!q && !cat) return null;
    var self = {}, live = {};
    function selfHit(r) {
      if (cat && r.cat !== cat) return false;
      if (!q) return true;
      if (r.title.indexOf(q) !== -1) return true;
      return r.holders.some(function (h) { var w = who(h); return w && w.name.indexOf(q) !== -1; });
    }
    function walk(r) {
      var any = self[r.id] = selfHit(r);
      ix.kids(r.id).forEach(function (k) { if (walk(k)) any = true; });
      live[r.id] = any;
      return any;
    }
    ix.kids("").forEach(walk);
    return { self: self, live: live };
  }

  /* ==========================================================================
   *  ציור
   * ======================================================================== */
  var ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  /* תגיות "לבדיקה"/"עזב/ה" הן כלי עבודה של מנהל — תושב לא רואה אותן. */
  function personHTML(h, edit) {
    var w = who(h);
    if (!w) return "";
    var tag = w.kind === "ext" ? ((w.review && edit) ? '<span class="ct-tag ct-tag--warn">לבדיקה</span>' : (edit ? '<span class="ct-tag">חיצוני</span>' : ""))
            : (w.kind === "gone" && edit) ? '<span class="ct-tag ct-tag--warn">עזב/ה</span>' : "";
    /* KISS (26.9, יועד): בעץ — שם בלבד. מספר בית רק בעורך, שם הוא עוזר לזהות. */
    return '<span class="ct-person">' +
      '<span class="ct-person__name">' + esc(w.name) + '</span>' +
      ((edit === "form" && w.house) ? '<span class="ct-house">בית ' + esc(w.house) + '</span>' : "") + tag +
    '</span>';
  }
  function peopleHTML(r, edit) {
    var hs = edit ? r.holders : r.holders.filter(function (h) { return who(h).kind !== "gone"; });
    if (!hs.length) return '<span class="ct-vacant">פנוי</span>';
    return '<div class="ct-people">' + hs.map(function (h) { return personHTML(h, edit); }).join("") + '</div>';
  }
  function whoShort(r, edit) {
    var hs = edit ? r.holders : r.holders.filter(function (h) { return who(h).kind !== "gone"; });
    if (!hs.length) return '<span class="ct-vacant">פנוי</span>';
    var names = hs.map(function (h) {
      var w = who(h);
      var warn = edit && (w.kind === "gone" || w.review);
      return '<span class="ct-sub__name' + (warn ? " is-warn" : "") + '">' + esc(w.name) + '</span>';
    });
    return '<span class="ct-sub__who">' + names.join('<span class="ct-sep">, </span>') + '</span>';
  }
  function hitCls(m, id) {
    if (!m) return "";
    return m.self[id] ? " is-hit" : (m.live[id] ? "" : " is-dim");
  }

  /* תתי-תפקידים בתוך כרטיס — עץ קבצים, בכל עומק. */
  function subsHTML(ix, id, m, edit) {
    var kids = ix.kids(id);
    if (!kids.length) return "";
    return '<div class="ct-subs">' + kids.map(function (k) {
      var c = catOf(k.cat);
      return '<div class="ct-sub' + hitCls(m, k.id) + '" style="--cat:' + esc(c.color) + '">' +
        '<div class="ct-sub__row"' + (edit ? ' data-edit="' + esc(k.id) + '" role="button" tabindex="0"' : "") + '>' +
          '<span class="ct-sub__title">' + esc(k.title || "(ללא שם)") + '</span>' + whoShort(k, edit) +
        '</div>' + subsHTML(ix, k.id, m, edit) +
      '</div>';
    }).join("") + '</div>';
  }

  function cardHTML(ix, r, m, edit, style) {
    var c = catOf(r.cat);
    return '<div class="ct-card' + (edit ? " is-edit" : "") + (V.sel === r.id ? " is-sel" : "") + hitCls(m, r.id) + '"' +
        ' style="--cat:' + esc(c.color) + ';' + (style || "") + '" data-id="' + esc(r.id) + '">' +
      '<div class="ct-card__head"' + (edit ? ' data-edit="' + esc(r.id) + '" role="button" tabindex="0" aria-label="עריכת ' + esc(r.title) + '"' : "") + '>' +
        '<span class="ct-card__title">' + esc(r.title || "(ללא שם)") + '</span>' +
      '</div>' +
      peopleHTML(r, edit) +
      subsHTML(ix, r.id, m, edit) +
    '</div>';
  }

  function leadHTML(r, isHub, m, edit) {
    var c = catOf(r.cat);
    return '<div class="ct-lead' + (isHub ? " is-hub" : "") + (V.sel === r.id ? " is-sel" : "") + hitCls(m, r.id) + '" style="--cat:' + esc(c.color) + '"' +
      (edit ? ' data-edit="' + esc(r.id) + '" role="button" tabindex="0"' : "") + ' data-id="' + esc(r.id) + '">' +
      '<span class="ct-lead__title">' + esc(r.title || "(ללא שם)") + '</span>' +
      peopleHTML(r, edit) +
    '</div>';
  }

  /* שרשרת: משורש יורדים כל עוד לתפקיד יש בדיוק ילד אחד. האחרון הוא
     ה"מרכז" (יו"ר השיכון), והילדים שלו הם כרטיסי התחומים. */
  function chainOf(ix, root) {
    var chain = [root], cur = root, guard = 0;
    while (ix.kids(cur.id).length === 1 && guard++ < 12) { cur = ix.kids(cur.id)[0]; chain.push(cur); }
    return chain;
  }

  function colsFor(w) {
    if (w < 600) return 0;            // טלפון — עץ אנכי
    if (w < 880) return 2;
    if (w < 1480) return 4;
    return 6;
  }

  function desktopHTML(ix, m, edit, N) {
    return ix.kids("").map(function (root) {
      var chain = chainOf(ix, root), hub = chain[chain.length - 1];
      var depts = ix.kids(hub.id).slice();
      var items = depts.map(function (d) { return { html: function (st) { return cardHTML(ix, d, m, edit, st); } }; });
      if (edit) items.push({ html: function (st) {
        return '<button type="button" class="ct-card ct-card--add" data-add="' + esc(hub.id) + '" style="' + st + '">+ תחום חדש</button>';
      } });
      var rows = [];
      for (var i = 0; i < items.length; i += N) rows.push(items.slice(i, i + N));
      return '<section class="ct-tree">' +
        '<div class="ct-chain' + (rows.length ? " has-rows" : "") + '">' +
          chain.map(function (r, i) { return leadHTML(r, i === chain.length - 1 && rows.length > 0, m, edit); }).join("") +
        '</div>' +
        (rows.length ? '<div class="ct-rows" style="--n:' + N + '">' + rows.map(function (row, ri) {
          var last = ri === rows.length - 1;
          var k = row.length;
          /* 2N חצאי-עמודות, כל כרטיס תופס שניים. שורה קצרה מתחילה באמצע
             כך שהיא ממורכזת בדיוק מתחת לגזע — גם כשיש בה מספר אי-זוגי. */
          return '<div class="ct-row' + (last ? " is-last" : "") + (k === 1 ? " is-single" : "") + '"' +
            ' style="grid-template-columns:repeat(' + (2 * N) + ',minmax(0,1fr))">' +
            row.map(function (it, ci) {
              var st = (ci === 0 && k < N) ? "grid-column:" + (N - k + 1) + " / span 2;" : "";
              return it.html(st);
            }).join("") + '</div>';
        }).join("") + '</div>' : "") +
      '</section>';
    }).join("");
  }

  function phoneHTML(ix, m, edit) {
    return ix.kids("").map(function (root) {
      var chain = chainOf(ix, root), hub = chain[chain.length - 1];
      var depts = ix.kids(hub.id);
      var auto = !!m;   // בחיפוש — פותחים את מה שמתאים
      return '<section class="ct-tree ct-tree--phone">' +
        '<div class="ct-chain ct-chain--phone' + (depts.length || edit ? " has-rows" : "") + '">' +
          chain.map(function (r, i) { return leadHTML(r, i === chain.length - 1 && depts.length > 0, m, edit); }).join("") +
        '</div>' +
        '<div class="ct-ptree">' + depts.map(function (d) {
          var c = catOf(d.cat);
          var open = auto ? !!(m && m.live[d.id]) : !!V.open[d.id];
          var first = d.holders[0] ? who(d.holders[0]).name + (d.holders.length > 1 ? " +" + (d.holders.length - 1) : "") : "פנוי";
          return '<div class="ct-pitem' + hitCls(m, d.id) + '" style="--cat:' + esc(c.color) + '">' +
            '<div class="ct-acc' + (open ? " is-open" : "") + '">' +
              '<div class="ct-acc__h">' +
                '<button type="button" class="ct-acc__toggle" data-toggle="' + esc(d.id) + '" aria-expanded="' + (open ? "true" : "false") + '">' +
                  '<span class="ct-acc__text"><span class="ct-acc__title">' + esc(d.title || "(ללא שם)") + '</span>' +
                  '<span class="ct-acc__who">' + esc(first) + '</span></span>' +
                  '<span class="ct-chev" aria-hidden="true">' + (open ? "▴" : "▾") + '</span>' +
                '</button>' +
                (edit ? '<button type="button" class="ct-iconbtn" data-edit="' + esc(d.id) + '" aria-label="עריכת ' + esc(d.title) + '">' + ICON_EDIT + '</button>' : "") +
              '</div>' +
              (open ? '<div class="ct-acc__b">' + peopleHTML(d, edit) + subsHTML(ix, d.id, m, edit) +
                '</div>' : "") +
            '</div>' +
          '</div>';
        }).join("") +
        (edit ? '<div class="ct-pitem ct-pitem--add"><button type="button" class="ct-acc ct-acc--add" data-add="' + esc(hub.id) + '">+ תחום חדש</button></div>' : "") +
        '</div>' +
      '</section>';
    }).join("");
  }

  /* ==========================================================================
   *  המסך
   * ======================================================================== */
  function mount(container, edit) {
    container.innerHTML = '<div class="ct' + (edit ? " ct--edit" : "") + '">' +
      '<div class="ct-tools">' +
        '<label class="ct-search">' + ICON_SEARCH +
          '<input type="search" id="ct-q" placeholder="חיפוש שם או תפקיד" aria-label="חיפוש בעץ הוועד" value="' + esc(V.q) + '"></label>' +
        (edit ? '<button type="button" class="ct-btn ct-btn--ghost" id="ct-cats">צבעים</button>' : "") +
      '</div>' +
      (edit ? '<p class="ct-hint">לחצו על תפקיד כדי לערוך אותו.</p>' : "") +
      '<div id="ct-banner"></div>' +
      '<div class="ct-main">' +
        '<div class="ct-canvas" id="ct-canvas">' + (CBA.skel && CBA.skel.tree ? CBA.skel.tree() : "") + '</div>' +
        '<aside class="ct-panel" id="ct-panel" hidden></aside>' +
      '</div>' +
    '</div>';

    var root = container.querySelector(".ct");
    var canvas = container.querySelector("#ct-canvas");
    var lastN = -1, ro = null;

    function draw() {
      if (!root.isConnected) { if (ro) ro.disconnect(); return; }
      if (S.error) {
        canvas.innerHTML = CBA.ui && CBA.ui.emptyState
          ? CBA.ui.emptyState({ icon: "inbox", title: "לא הצלחנו לטעון", sub: S.error, ctaLabel: "נסו שוב", ctaAttr: "data-retry" })
          : '<p>' + esc(S.error) + '</p>';
        return;
      }
      var ix = index(S.roles);
      if (!ix.kids("").length && !edit) {
        canvas.innerHTML = CBA.ui.emptyState({ icon: "inbox", title: "עוד אין תפקידים בעץ", sub: "מנהל-על יכול להוסיף תפקידים באזור הניהול." });
        return;
      }
      var N = colsFor(canvas.clientWidth || container.clientWidth || 1000);
      lastN = N;
      var m = matcher(ix);
      var html = N ? desktopHTML(ix, m, edit, N) : phoneHTML(ix, m, edit);
      if (!ix.kids("").length && edit) {
        html = '<div class="ct-emptyedit"><p>העץ ריק.</p><button type="button" class="ct-btn" data-add="">+ תפקיד ראשון</button></div>';
      }
      canvas.innerHTML = html;
      canvas.classList.toggle("is-phone", !N);
      drawBanner();
    }

    function drawBanner() {
      var el = container.querySelector("#ct-banner");
      if (!edit) { el.innerHTML = ""; return; }
      var review = 0, gone = 0;
      S.roles.forEach(function (r) { r.holders.forEach(function (h) { var w = who(h); if (w.review) review++; if (w.kind === "gone") gone++; }); });
      var parts = [];
      if (S.flagOff) parts.push('<div class="ct-banner ct-banner--warn">העריכה כבויה: ועד השיכון נקרא כרגע מהגיליון (המתג במסך "מצב המערכת").</div>');
      else if (S.source === "sheet") parts.push('<div class="ct-banner"><span>העץ עדיין נקרא מהגיליון הישן. השמירה הראשונה תעביר אותו ל-Firebase.</span>' +
        '<button type="button" class="ct-btn" id="ct-migrate">העברה עכשיו</button></div>');
      if (review) parts.push('<div class="ct-banner ct-banner--warn"><span class="ct-pill">' + review + ' לבדיקה</span>' +
        '<span>שמות שלא זוהו אוטומטית. לחצו על התפקיד ובחרו את התושב הנכון, או סמנו שזה אדם מבחוץ.</span></div>');
      if (gone) parts.push('<div class="ct-banner ct-banner--warn"><span class="ct-pill">' + gone + '</span><span>בעלי תפקיד שכבר לא מופיעים ברשימת התושבים הפעילים.</span></div>');
      if (!S.dirOk) parts.push('<div class="ct-banner ct-banner--warn">רשימת התושבים לא נטענה, ולכן חלק מהשמות לא מוצגים.</div>');
      el.innerHTML = parts.join("");
      var mig = el.querySelector("#ct-migrate");
      if (mig) mig.addEventListener("click", function () {
        busy(mig, true);
        save(S.roles, S.cats, function (res) {
          busy(mig, false);
          afterSave(res, "העץ הועבר ל-Firebase");
        });
      });
    }

    function afterSave(res, okMsg) {
      if (res && res.ok) {
        if (CBA.ui && CBA.ui.toast) CBA.ui.toast(okMsg || "נשמר");
        draw();
        return true;
      }
      if (res && res.conflict) {
        load(function () { closePanel(); draw(); }, true);
      }
      if (CBA.ui && CBA.ui.alert) CBA.ui.alert((res && res.error) || "השמירה נכשלה.", "לא נשמר");
      return false;
    }

    /* ---------- אירועים ---------- */
    var qEl = container.querySelector("#ct-q");
    qEl.addEventListener("input", function () { V.q = qEl.value; draw(); });

    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-cat],[data-toggle],[data-edit],[data-add],[data-retry],#ct-cats");
      if (!t || !root.contains(t)) return;
      if (t.hasAttribute("data-retry")) { S.error = ""; canvas.innerHTML = CBA.skel ? CBA.skel.tree() : ""; load(draw, true); return; }
      if (t.id === "ct-cats") { openCats(); return; }
      if (t.hasAttribute("data-cat")) { V.cat = t.getAttribute("data-cat"); draw(); return; }
      if (t.hasAttribute("data-toggle")) { var id = t.getAttribute("data-toggle"); V.open[id] = !V.open[id]; draw(); return; }
      if (!edit) return;
      if (t.hasAttribute("data-edit")) { openPanel(t.getAttribute("data-edit"), null); return; }
      if (t.hasAttribute("data-add")) { openPanel(null, t.getAttribute("data-add")); return; }
    });
    root.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-edit][role=button]")) {
        e.preventDefault(); e.target.click();
      }
    });

    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        if (!root.isConnected) { ro.disconnect(); return; }
        if (!S.loaded || S.error) return;
        var N = colsFor(canvas.clientWidth);
        if (N !== lastN) draw();
      });
      ro.observe(canvas);
    }

    /* ==========================================================================
     *  עורך תפקיד — חלונית צד במחשב, גיליון תחתון בטלפון
     * ======================================================================== */
    var sheetClose = null;
    function wide() { return container.clientWidth >= 900; }

    function closePanel() {
      V.sel = null; V.draft = null;
      var p = container.querySelector("#ct-panel");
      if (p) { p.hidden = true; p.innerHTML = ""; }
      root.classList.remove("has-panel");
      if (sheetClose) { var c = sheetClose; sheetClose = null; c(); }
    }

    function openPanel(id, parentForNew) {
      if (!S.loaded || S.error) return;
      var ix = index(S.roles);
      var r = id ? ix.byId[id] : null;
      if (id && !r) return;
      var parent = r ? r.parent : (parentForNew || "");
      var pr = ix.byId[parent];
      V.sel = id || null;
      V.draft = {
        id: id || null,
        title: r ? r.title : "",
        parent: parent,
        cat: r ? r.cat : (pr ? pr.cat : (S.cats[0] ? S.cats[0].id : "")),
        holders: r ? clone(r.holders) : [],
        pq: ""
      };
      var html = '<div class="ct-form" id="ct-form"></div>';
      if (wide()) {
        if (sheetClose) { var c0 = sheetClose; sheetClose = null; c0(); }
        var p = container.querySelector("#ct-panel");
        p.hidden = false; p.innerHTML = html;
        root.classList.add("has-panel");
        renderForm(p.querySelector("#ct-form"));
        draw();
        var ti = p.querySelector("#ct-f-title"); if (ti && !id) ti.focus();
      } else {
        var sh = CBA.ui.sheet({ label: "עריכת תפקיד בוועד", key: "ct-role", sheetCls: "ct-sheet", html: html,
          onMount: function (wrap) { renderForm(wrap.querySelector("#ct-form")); } });
        sheetClose = function () { sh.close(); };
        /* סגירה בהחלקה/רקע — לנקות את הבחירה */
        var obs = new MutationObserver(function () {
          if (!sh.wrap.isConnected) { obs.disconnect(); if (sheetClose) { sheetClose = null; V.sel = null; V.draft = null; } }
        });
        obs.observe(document.body, { childList: true });
      }
    }

    function parentOptions(ix, selfId) {
      var block = selfId ? descendants(ix, selfId) : {};
      if (selfId) block[selfId] = 1;
      var out = [{ id: "", label: "— ראש העץ (בלי תפקיד מעליו)" }];
      function walk(pid, depth) {
        ix.kids(pid).forEach(function (k) {
          if (!block[k.id]) out.push({ id: k.id, label: new Array(depth + 1).join("\u00A0\u00A0\u00A0") + (depth ? "└ " : "") + (k.title || "(ללא שם)") });
          if (!block[k.id]) walk(k.id, depth + 1);
        });
      }
      walk("", 0);
      return out;
    }

    function renderForm(host) {
      if (!host) return;
      var d = V.draft, ix = index(S.roles);
      var isNew = !d.id;
      var siblings = ix.kids(d.parent);
      var pos = d.id ? siblings.map(function (s) { return s.id; }).indexOf(d.id) : -1;
      var kidsCount = d.id ? ix.kids(d.id).length : 0;
      host.innerHTML =
        '<div class="ct-form__head"><h3>' + (isNew ? "תפקיד חדש" : "עריכת תפקיד") + '</h3>' +
          '<button type="button" class="ct-x" data-f="close" aria-label="סגירה">×</button></div>' +
        '<div class="ct-field"><label for="ct-f-title">שם התפקיד</label>' +
          '<input class="ct-input" id="ct-f-title" maxlength="80" value="' + esc(d.title) + '" placeholder="למשל: יו&quot;ר תרבות"></div>' +
        '<div class="ct-field"><label for="ct-f-parent">כפוף ל</label>' +
          '<select class="ct-input" id="ct-f-parent">' + parentOptions(ix, d.id).map(function (o) {
            return '<option value="' + esc(o.id) + '"' + (o.id === d.parent ? " selected" : "") + '>' + esc(o.label) + '</option>';
          }).join("") + '</select></div>' +
        (d.id && siblings.length > 1 ? '<div class="ct-field"><label>מיקום בין התפקידים באותה רמה</label>' +
          '<div class="ct-row2"><button type="button" class="ct-btn ct-btn--ghost" data-f="up"' + (pos <= 0 ? " disabled" : "") + '>→ מקום קודם</button>' +
          '<span class="ct-muted">' + (pos + 1) + ' מתוך ' + siblings.length + '</span>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-f="down"' + (pos >= siblings.length - 1 ? " disabled" : "") + '>מקום הבא ←</button></div></div>' : "") +
        '<div class="ct-field"><label>קטגוריה (הצבע של הכרטיס)</label><div class="ct-chips ct-chips--wrap">' +
          S.cats.map(function (c) {
            return '<button type="button" class="ct-chip' + (c.id === d.cat ? " is-on" : "") + '" data-fcat="' + esc(c.id) + '" style="--cat:' + esc(c.color) + '" aria-pressed="' + (c.id === d.cat) + '">' +
              '<span class="ct-dot" aria-hidden="true"></span>' + esc(c.name) + '</button>';
          }).join("") +
          '<button type="button" class="ct-chip ct-chip--ghost" data-f="cats">עריכת צבעים</button></div></div>' +
        '<div class="ct-field"><label>מי ממלא את התפקיד</label>' +
          '<div class="ct-holders">' + (d.holders.length ? d.holders.map(function (h, i) {
            var w = who(h);
            return '<div class="ct-holder' + (w.review || w.kind === "gone" ? " is-warn" : "") + '">' + personHTML(h, "form") +
              (w.review ? '<button type="button" class="ct-link" data-f="okext" data-i="' + i + '">זה אדם מבחוץ</button>' : "") +
              '<button type="button" class="ct-x" data-f="rm" data-i="' + i + '" aria-label="הסרה">×</button></div>';
          }).join("") : '<div class="ct-muted">אין אף אחד — התפקיד יוצג כ"פנוי".</div>') + '</div>' +
          '<div class="ct-picker"><label class="ct-search ct-search--in">' + ICON_SEARCH +
            '<input type="search" id="ct-f-q" placeholder="הוספת אדם — הקלידו שם" autocomplete="off" value="' + esc(d.pq) + '"></label>' +
            '<div class="ct-opts" id="ct-f-opts"></div></div>' +
        '</div>' +
        '<div class="ct-form__foot">' +
          '<button type="button" class="ct-btn" data-f="save">שמירה</button>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-f="close">ביטול</button>' +
          (d.id ? '<button type="button" class="ct-btn ct-btn--ghost" data-f="addkid">+ תפקיד מתחת</button>' : "") +
          (d.id ? '<button type="button" class="ct-btn ct-btn--danger" data-f="del">מחיקה</button>' : "") +
        '</div>' +
        (kidsCount ? '<p class="ct-muted ct-note">מחיקה תעביר את ' + kidsCount + ' התפקידים שמתחתיו רמה אחת למעלה.</p>' : "");

      var ti = host.querySelector("#ct-f-title");
      ti.addEventListener("input", function () { d.title = ti.value; });
      host.querySelector("#ct-f-parent").addEventListener("change", function (e) { d.parent = e.target.value; });
      var qi = host.querySelector("#ct-f-q");
      qi.addEventListener("input", function () { d.pq = qi.value; drawOpts(host); });
      qi.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); var f = host.querySelector("[data-pick]"); if (f) f.click(); }
      });
      drawOpts(host);

      host.onclick = function (e) {
        var b = e.target.closest("[data-f],[data-fcat],[data-pick]");
        if (!b) return;
        if (b.hasAttribute("data-fcat")) { d.cat = b.getAttribute("data-fcat"); renderForm(host); return; }
        if (b.hasAttribute("data-pick")) {
          var v = b.getAttribute("data-pick");
          if (v.indexOf("ext:") === 0) d.holders.push({ ext: v.slice(4) });
          else { var p = S.people.byKey[v]; if (p) d.holders.push({ fid: p.fid, slot: p.slot }); }
          d.pq = ""; renderForm(host);
          var q2 = host.querySelector("#ct-f-q"); if (q2) q2.focus();
          return;
        }
        var f = b.getAttribute("data-f"), i = parseInt(b.getAttribute("data-i"), 10);
        if (f === "close") { closePanel(); draw(); }
        else if (f === "rm") { d.holders.splice(i, 1); renderForm(host); }
        else if (f === "okext") { delete d.holders[i].review; renderForm(host); }
        else if (f === "cats") openCats();
        else if (f === "addkid") { var pid = d.id; closePanel(); openPanel(null, pid); }
        else if (f === "up" || f === "down") moveRole(d.id, f === "up" ? -1 : 1, b);
        else if (f === "save") submit(b);
        else if (f === "del") removeRole(d.id, b);
      };
    }

    function drawOpts(host) {
      var d = V.draft, el = host.querySelector("#ct-f-opts");
      var q = d.pq.trim();
      if (!q) { el.innerHTML = ""; return; }
      var taken = {};
      d.holders.forEach(function (h) { if (h.fid) taken[h.fid + "#" + h.slot] = 1; });
      var hits = (S.people ? S.people.list : []).filter(function (p) {
        return !taken[p.key] && (p.full.indexOf(q) !== -1 || String(p.house) === q);
      }).slice(0, 8);
      el.innerHTML = hits.map(function (p) {
        return '<button type="button" class="ct-opt" data-pick="' + esc(p.key) + '">' +
          '<span class="ct-opt__name">' + esc(p.full) + '</span>' +
          '<span class="ct-house">' + (p.house ? "בית " + esc(p.house) : "") + '</span></button>';
      }).join("") +
        (hits.length ? "" : '<div class="ct-muted ct-opt--none">לא נמצא תושב בשם הזה.</div>') +
        '<button type="button" class="ct-opt ct-opt--ext" data-pick="ext:' + esc(q) + '">+ אדם מחוץ לשיכון: <b>' + esc(q) + '</b></button>';
    }

    /* ---------- פעולות ---------- */
    function submit(btn) {
      var d = V.draft;
      var title = String(d.title || "").trim();
      if (!title) { CBA.ui.alert("צריך שם לתפקיד."); return; }
      if (title.length > 80) { CBA.ui.alert("שם התפקיד ארוך מדי."); return; }
      var next = clone(S.roles), ix = index(next);
      if (d.id && d.parent && descendants(ix, d.id)[d.parent]) { CBA.ui.alert("אי אפשר להכפיף תפקיד לתפקיד שנמצא מתחתיו."); return; }
      var holders = d.holders.map(function (h) { return h.fid ? { fid: h.fid, slot: h.slot } : (h.review ? { ext: h.ext, review: true } : { ext: h.ext }); });
      if (d.id) {
        var r = next.filter(function (x) { return x.id === d.id; })[0];
        if (!r) return;
        if (r.parent !== d.parent) r.order = nextOrder(ix, d.parent);
        r.title = title; r.parent = d.parent; r.cat = d.cat; r.holders = holders;
      } else {
        next.push({ id: newId("r"), parent: d.parent, title: title, cat: d.cat, order: nextOrder(ix, d.parent), holders: holders });
      }
      busy(btn, true);
      save(next, S.cats, function (res) {
        busy(btn, false);
        if (afterSave(res, d.id ? "התפקיד עודכן" : "התפקיד נוסף")) { closePanel(); draw(); }
      });
    }
    function nextOrder(ix, pid) {
      var k = ix.kids(pid);
      return k.length ? Math.max.apply(null, k.map(function (x) { return x.order; })) + 1 : 0;
    }
    function moveRole(id, dir, btn) {
      var next = clone(S.roles), ix = index(next);
      var r = ix.byId[id]; if (!r) return;
      var sib = ix.kids(r.parent === "" || ix.byId[r.parent] ? r.parent : "");
      var i = sib.indexOf(r), j = i + dir;
      if (i < 0 || j < 0 || j >= sib.length) return;
      sib.splice(i, 1); sib.splice(j, 0, r);
      sib.forEach(function (s, n) { s.order = n; });
      busy(btn, true);
      save(next, S.cats, function (res) {
        busy(btn, false);
        if (afterSave(res, "הסדר עודכן")) {
          var host = container.querySelector("#ct-form") || document.querySelector(".ct-sheet #ct-form");
          if (host) renderForm(host);
        }
      });
    }
    function removeRole(id, btn) {
      var ix = index(S.roles), r = ix.byId[id];
      if (!r) return;
      var kids = ix.kids(id), pr = ix.byId[r.parent];
      var msg = 'למחוק את "' + (r.title || "(ללא שם)") + '"?' +
        (kids.length ? " " + kids.length + " התפקידים שמתחתיו יעברו אל " + (pr ? '"' + pr.title + '"' : "ראש העץ") + "." : "");
      CBA.ui.confirm(msg, { danger: true, okText: "מחיקה" }).then(function (ok) {
        if (!ok) return;
        var next = clone(S.roles).filter(function (x) { return x.id !== id; });
        var ix2 = index(next);
        var base = nextOrder(ix2, r.parent);
        next.forEach(function (x) { if (x.parent === id) { x.parent = r.parent; x.order = base++; } });
        busy(btn, true);
        save(next, S.cats, function (res) {
          busy(btn, false);
          if (afterSave(res, "התפקיד נמחק")) { closePanel(); draw(); }
        });
      });
    }

    /* ==========================================================================
     *  קטגוריות וצבעים
     * ======================================================================== */
    function openCats() {
      var cats = clone(S.cats);
      var usage = {};
      S.roles.forEach(function (r) { usage[r.cat] = (usage[r.cat] || 0) + 1; });
      var sh = CBA.ui.sheet({ label: "צבעים וקטגוריות", key: "ct-cats", sheetCls: "ct-sheet ct-sheet--cats",
        html: '<div class="ct-form" id="ct-cats-form"></div>',
        onMount: function (wrap) { paint(wrap.querySelector("#ct-cats-form")); } });

      function paint(host) {
        host.innerHTML =
          '<div class="ct-form__head"><h3>צבעים וקטגוריות</h3><button type="button" class="ct-x" data-c="close" aria-label="סגירה">×</button></div>' +
          '<p class="ct-muted">הקטגוריה קובעת את צבע הכרטיס בעץ. היא לא משנה הרשאות.</p>' +
          '<div class="ct-catlist">' + cats.map(function (c, i) {
            return '<div class="ct-cat" style="--cat:' + esc(c.color) + '">' +
              '<div class="ct-cat__top">' +
                '<span class="ct-swatch" aria-hidden="true"></span>' +
                '<input class="ct-input" data-name="' + i + '" value="' + esc(c.name) + '" maxlength="30" aria-label="שם הקטגוריה">' +
                '<button type="button" class="ct-x" data-c="del" data-i="' + i + '" aria-label="מחיקת קטגוריה"' +
                  (usage[c.id] || cats.length <= 1 ? ' disabled title="' + (usage[c.id] ? "בשימוש ב-" + usage[c.id] + " תפקידים" : "חייבת להישאר קטגוריה אחת") + '"' : "") + '>×</button>' +
              '</div>' +
              '<div class="ct-palette">' + PALETTE.map(function (p) {
                return '<button type="button" class="ct-pal' + (p.toLowerCase() === String(c.color).toLowerCase() ? " is-on" : "") + '" data-c="color" data-i="' + i + '" data-color="' + p + '" style="--p:' + p + '" aria-label="צבע ' + p + '"></button>';
              }).join("") +
                '<label class="ct-pal ct-pal--custom" title="צבע אחר"><input type="color" data-custom="' + i + '" value="' + esc(c.color) + '" aria-label="צבע אחר"></label>' +
              '</div>' +
              (usage[c.id] ? '<span class="ct-muted">' + usage[c.id] + ' תפקידים</span>' : "") +
            '</div>';
          }).join("") + '</div>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-c="add">+ קטגוריה חדשה</button>' +
          '<div class="ct-form__foot"><button type="button" class="ct-btn" data-c="save">שמירה</button>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-c="close">ביטול</button></div>';

        Array.prototype.forEach.call(host.querySelectorAll("[data-name]"), function (inp) {
          inp.addEventListener("input", function () { cats[+inp.getAttribute("data-name")].name = inp.value; });
        });
        Array.prototype.forEach.call(host.querySelectorAll("[data-custom]"), function (inp) {
          inp.addEventListener("input", function () { cats[+inp.getAttribute("data-custom")].color = inp.value; paint(host); });
        });
        host.onclick = function (e) {
          var b = e.target.closest("[data-c]");
          if (!b || b.disabled) return;
          var c = b.getAttribute("data-c"), i = parseInt(b.getAttribute("data-i"), 10);
          if (c === "close") sh.close();
          else if (c === "color") { cats[i].color = b.getAttribute("data-color"); paint(host); }
          else if (c === "del") { cats.splice(i, 1); paint(host); }
          else if (c === "add") {
            cats.push({ id: newId("c"), name: "", color: PALETTE[cats.length % PALETTE.length] });
            paint(host);
            var all = host.querySelectorAll("[data-name]"); if (all.length) all[all.length - 1].focus();
          }
          else if (c === "save") {
            var names = {};
            for (var k = 0; k < cats.length; k++) {
              cats[k].name = String(cats[k].name || "").trim();
              if (!cats[k].name) { CBA.ui.alert("לכל קטגוריה צריך שם."); return; }
              if (names[cats[k].name]) { CBA.ui.alert('יש שתי קטגוריות בשם "' + cats[k].name + '".'); return; }
              names[cats[k].name] = 1;
            }
            busy(b, true);
            save(S.roles, cats, function (res) {
              busy(b, false);
              if (afterSave(res, "הצבעים נשמרו")) {
                sh.close();
                var host2 = container.querySelector("#ct-form") || document.querySelector(".ct-sheet #ct-form");
                if (host2 && V.draft) renderForm(host2);
              }
            });
          }
        };
      }
    }

    function busy(btn, on) {
      if (!btn) return;
      if (CBA.ui && CBA.ui.busy) {
        if (on) btn._ctDone = CBA.ui.busy(btn, "שומר…");
        else if (typeof btn._ctDone === "function") { btn._ctDone(); btn._ctDone = null; }
        else btn.disabled = false;
      } else btn.disabled = !!on;
    }

    /* ---------- התחלה ---------- */
    load(function () {
      /* ⚠️ מסך שנסגר בזמן הטעינה — לא מציירים לתוך DOM יתום. */
      if (!root.isConnected) return;
      if (edit && V.sel) { var s = V.sel; V.sel = null; draw(); openPanel(s, null); return; }
      draw();
    });
  }

  /* ==========================================================================
   *  רישום המסכים + ממשק ל-resident.js (חיווי "תפקיד בוועד" במדריך)
   * ======================================================================== */
  CBA.screens.resCommittee = { render: function (container) { mount(container, false); } };
  CBA.screens.committeeAdmin = {
    render: function (container) {
      if (!isSuper()) { container.innerHTML = ""; return; }
      mount(container, true);
    }
  };

  /* תפקידים של אדם מסוים — רק לפי משפחה+מספר דייר. בלי התאמה לפי שם. */
  function rolesFor(fid, slot) {
    if (!S.loaded || !fid) return [];
    var out = [];
    S.roles.forEach(function (r) {
      r.holders.forEach(function (h) {
        if (h.fid && String(h.fid) === String(fid) && h.slot === slot) out.push(r.title);
      });
    });
    return out;
  }

  CBA.committeeTree = {
    load: load,
    rolesFor: rolesFor,
    slotOfKey: slotOfKey,
    /* לבדיקות */
    _state: S, _view: V, _index: index, _chainOf: chainOf, _colsFor: colsFor,
    _buildPeople: buildPeople, _convertSheet: convertSheet
  };
})();
