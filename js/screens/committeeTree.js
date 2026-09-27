/* ============================================================================
 *  ועד השיכון v3 — עץ לפי שנה, ארבעה סוגים, גרירה   (2026-09-27)
 * ----------------------------------------------------------------------------
 *  מחליף את המסכים הישנים (resCommittee ב-resident.js, committeeAdmin
 *  ב-residents.js) — נטען אחריהם ודורס את הרישום שלהם ב-CBA.screens.
 *
 *  🔑 המודל (יועד, 27.9):
 *   · לכל פריט "סוג" (קטגוריה) עם צבע ו-kind:
 *       kind "role" — תפקיד בוועד. רק הם בונים את העץ ומחוברים בקווים.
 *       kind "item" — תחום אחריות / ועדת מתנדבים / תפעול ושירות וכו'.
 *                     שורה צבעונית בכרטיס של התפקיד שאחראי עליו, **בלי**
 *                     היררכיה ביניהם. פריט לא יכול להיות הורה.
 *                     פריט בלי הורה ⇒ "לא משויכים לתפקיד".
 *   · עץ לכל שנה: לכל פריט `year` ('תשפ"ז'). השנה = השנה המוצגת באפליקציה
 *     (אותו כפתור של התקציב, CBA.data.getCurrentYear). שנה ריקה ⇒ "העתקה
 *     מהשנה הקודמת".
 *
 *  🔑 נתונים — Firebase בלבד (יועד: "כתיבה וקריאה מלאה ל-Firebase"):
 *   · מסמך יחיד committee/tree: {schema, rev, roles[], cats[], updatedAt,
 *     updatedBy}. אין נפילה לגיליון. כשל = הודעה + "נסו שוב".
 *   · אדם מזוהה לפי מזהה המשפחה + מספר הדייר (fid+slot). שם לא נשמר
 *     במסמך — נשלף מרשימת התושבים בזמן הציור. אדם מבחוץ = שם חופשי.
 *   · `rev` עולה באחד בכל שמירה (טרנזקציה + כלל) — שני מנהלים לא דורסים.
 *
 *  🔑 הקווים לא מחושבים: כל כרטיס מצייר את הקו שלו ב-CSS. JS רק מחליט כמה
 *     כרטיסים בשורה — כמה שיותר, לרוחב המסך. יותר משורה אחת ⇒ מספר זוגי,
 *     כדי שהגזע יעבור ברווח בין שני כרטיסים.
 *
 *  ⏪ ביטול: להסיר את שתי השורות של committeeTree מ-index.html.
 * ========================================================================== */
(function () {
  "use strict";
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};

  var COLL = "committee", DOC = "tree", SCHEMA = 1;
  var MINW = 115, GAP = 12, PHONE = 600, ROW_SHARE = 0.85;   /* 27.9 יועד: משבצת צרה ב-15% */

  var DEFAULT_CATS = [
    { id: "k-role", name: "תפקיד בוועד",  color: "#16A34A", kind: "role" },
    { id: "k-area", name: "תחום אחריות",  color: "#8B5CF6", kind: "item" },
    { id: "k-comm", name: "ועדת מתנדבים", color: "#64748B", kind: "item" },
    { id: "k-svc",  name: "תפעול ושירות", color: "#EA7A1E", kind: "item" }
  ];
  var PALETTE = ["#16A34A", "#0E9F6E", "#2563EB", "#0891B2", "#8B5CF6",
                 "#DB2777", "#EA7A1E", "#D97706", "#64748B", "#111827"];

  function esc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function uid() { return (CBA.fb && CBA.fb.uid && CBA.fb.uid()) || ""; }
  function isSuper() { return !!CBA.isSuper; }
  function newId(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function curYear() {
    try { return String((CBA.data && CBA.data.getCurrentYear && CBA.data.getCurrentYear()) || ""); } catch (e) { return ""; }
  }

  /* ==========================================================================
   *  מצב
   * ======================================================================== */
  var S = { loaded: false, loading: false, waiters: [], error: "",
            exists: false, rev: 0, roles: [], cats: [], upgraded: false,
            people: null, dirOk: false, dirDone: false, dirLoading: false, saving: false };
  var V = { q: "", open: {}, sel: null, draft: null };

  /* ==========================================================================
   *  תושבים — מקור השמות
   * ======================================================================== */
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
    var list = [], byKey = {};
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
        if (active) list.push(p);
      });
    });
    list.sort(function (a, b) { return a.full.localeCompare(b.full, "he"); });
    return { list: list, byKey: byKey };
  }
  function who(h) {
    if (h.fid) {
      var p = S.people && S.people.byKey[h.fid + "#" + h.slot];
      if (p && p.active) return { name: p.full, house: p.house, kind: "res" };
      if (!S.dirDone) return { name: "…", house: "", kind: "loading" };
      if (!S.dirOk) return { name: "שם לא זמין", house: "", kind: "res" };
      return { name: "תושב/ת שעזב/ה", house: "", kind: "gone" };
    }
    return { name: String(h.ext || ""), house: "", kind: "ext", review: !!h.review };
  }

  /* ==========================================================================
   *  טעינה — Firebase בלבד
   * ======================================================================== */
  /* ==========================================================================
   *  🔑 מהירות (27.9): העץ מ-Firestore עולה ב-~50ms, אבל רשימת התושבים
   *  (השמות) עוברת דרך Apps Script — נמדד 6.2 שניות. לכן:
   *   1. המסך מצויר מיד כש-Firestore עונה, בלי לחכות לשמות.
   *   2. שמות בעלי התפקידים נשמרים בעותק קטן במכשיר (NAMES_KEY) — בכניסה
   *      הבאה הם מוצגים מיד. רק בעלי תפקידים, רק שם ומספר בית: המידע שהמסך
   *      הזה ממילא מציג לכל תושב. בלי טלפונים, בלי ילדים.
   *   3. הרשימה המלאה מגיעה ברקע, מחליפה את העותק, והמסך מצויר שוב.
   *  ⚠️ העותק שייך למשתמש (uid) — משתמש אחר באותו דפדפן לא רואה אותו.
   * ======================================================================== */
  var NAMES_KEY = "cba_ct_names_v1";
  var redrawers = [];
  function onPeople(fn) { redrawers.push(fn); }
  function notifyPeople() {
    redrawers = redrawers.filter(function (f) { try { return f() !== false; } catch (e) { return false; } });
  }
  function readNamesCache() {
    try {
      var c = JSON.parse(localStorage.getItem(NAMES_KEY) || "null");
      if (!c || !c.names || c.uid !== uid()) return null;
      var byKey = {};
      Object.keys(c.names).forEach(function (k) { byKey[k] = { key: k, full: c.names[k].n, house: c.names[k].h || "", active: true }; });
      return { list: [], byKey: byKey, partial: true };
    } catch (e) { return null; }
  }
  function writeNamesCache() {
    try {
      if (!S.people || S.people.partial || !uid()) return;
      var names = {};
      S.roles.forEach(function (r) {
        r.holders.forEach(function (h) {
          if (!h.fid) return;
          var p = S.people.byKey[h.fid + "#" + h.slot];
          if (p && p.active) names[p.key] = { n: p.full, h: p.house };
        });
      });
      localStorage.setItem(NAMES_KEY, JSON.stringify({ uid: uid(), at: Date.now(), names: names }));
    } catch (e) {}
  }
  function loadPeople(force) {
    if (S.dirLoading || (S.dirDone && !force)) return;
    S.dirLoading = true;
    CBA.data.getCommunityDirectory(function (res) {
      S.dirLoading = false; S.dirDone = true;
      S.dirOk = !!(res && res.ok);
      if (S.dirOk) S.people = buildPeople(res.rows);
      else if (!S.people) S.people = buildPeople([]);
      if (S.loaded) writeNamesCache();
      notifyPeople();
    });
  }

  function load(cb, force) {
    if (S.loaded && !force) { if (cb) cb(); return; }
    if (cb) S.waiters.push(cb);
    if (S.loading) return;
    S.loading = true;
    if (!S.dirDone) loadPeople(false);
    readFs(function (err, doc) {
      if (err) S.error = "לא הצלחנו לטעון את עץ הוועד (" + err + ").";
      else { S.error = ""; applyDoc(doc); }
      /* השמות מהעותק במכשיר — רק אם הרשימה המלאה עוד לא הגיעה */
      if (!S.dirDone && !S.people) S.people = readNamesCache();
      if (S.dirDone && S.dirOk) writeNamesCache();
      S.loading = false; S.loaded = true;
      var w = S.waiters; S.waiters = [];
      w.forEach(function (f) { try { f(); } catch (e) { console.error(e); } });
    });
  }
  function readFs(cb) {
    if (!CBA.fb || !CBA.fb.readDoc) return cb("אין חיבור ל-Firebase");
    (CBA.fb.userReady || CBA.fb.authReady).call(CBA.fb, function (user) {
      if (!user) return cb("לא מחובר");
      CBA.fb.ensureDb(function (dbErr) {
        if (dbErr) return cb(String(dbErr.code || dbErr.message || "db"));
        CBA.fb.readDoc(COLL, DOC, function (e, d) {
          if (e) return cb(String(e.code || e.message || e));
          cb(null, d || null);
        });
      });
    });
  }
  function normRole(r, i) {
    return {
      id: String(r.id), parent: String(r.parent || ""), title: String(r.title || ""),
      cat: String(r.cat || ""), order: (typeof r.order === "number") ? r.order : i,
      year: String(r.year || ""),
      holders: (Array.isArray(r.holders) ? r.holders : []).map(function (h) {
        if (h && h.fid) return { fid: String(h.fid), slot: parseInt(h.slot, 10) || 1 };
        var o = { ext: String((h && h.ext) || "") };
        if (h && h.review) o.review = true;
        return o;
      }).filter(function (h) { return h.fid || h.ext; })
    };
  }
  function applyDoc(d) {
    S.exists = !!d;
    S.rev = d ? (parseInt(d.rev, 10) || 0) : 0;
    var cats = (d && Array.isArray(d.cats)) ? d.cats : [];
    var roles = (d && Array.isArray(d.roles)) ? d.roles.map(normRole) : [];
    S.upgraded = false;
    /* מסמך מהגרסה הקודמת (בלי kind לקטגוריות / בלי שנה לפריטים) —
       שדרוג בזיכרון. נשמר רק כשמנהל לוחץ "שמירה". */
    var old = roles.length && (!cats.some(function (c) { return c.kind; }) || roles.some(function (r) { return !r.year; }));
    if (old) { upgrade(roles); S.upgraded = true; return; }
    S.cats = cats.length ? cats.map(function (c) {
      return { id: String(c.id), name: String(c.name || ""), color: String(c.color || "#16A34A"),
               kind: c.kind === "item" ? "item" : "role" };
    }) : clone(DEFAULT_CATS);
    S.roles = roles;
  }

  /* 🔑 שדרוג חד-פעמי של העץ שהועבר ב-26.9 למבנה החדש (27.9).
     הסוג נקבע לפי העץ המקורי שיועד צירף (ירוק/סגול/אפור/כתום), ולפי
     שלוש הנחיות שלו: א. חוגים, הסעים ומועדון נוער — תפקידים שמקבילים
     לקהילה (ישירות תחת יו"ר השיכון); מועדון משפחות — לא משויך.
     פריט שהורה שלו הוא פריט אחר עולה לתפקיד הקרוב ביותר מעליו. */
  var KIND_BY_TITLE = {
    "מועדון משפחות": "k-area", 'חד"כ': "k-area", "מכולת היופי": "k-area", "מועדון ילדים": "k-area",
    "ועדת קהילה": "k-comm", "ועדת תרבות": "k-comm", "ועדת פרט וחוסן": "k-comm",
    "מנהלת חינוך": "k-svc", "מדריכי חוגים": "k-svc", "מפעיל מועדון וצהרון": "k-svc", "קבלן גינון ונקיון": "k-svc"
  };
  var TO_HUB = { "א. חוגים": 1, "הסעים": 1, "מועדון נוער": 1 };
  var UNASSIGNED = { "מועדון משפחות": 1 };
  function upgrade(roles) {
    var y = curYear();
    S.cats = clone(DEFAULT_CATS);
    var byId = {};
    roles.forEach(function (r) { byId[r.id] = r; r.cat = KIND_BY_TITLE[r.title] || "k-role"; if (!r.year) r.year = y; });
    var hub = roles.filter(function (r) { return r.title.indexOf('יו"ר שיכון') !== -1; })[0];
    roles.forEach(function (r) {
      if (hub && TO_HUB[r.title]) r.parent = hub.id;
      if (UNASSIGNED[r.title]) r.parent = "";
    });
    normalizeParents(roles);
    S.roles = roles;
  }
  function kindOf(r) { var c = catOf(r.cat); return c.kind || "role"; }
  function normalizeParents(roles) {
    var byId = {};
    roles.forEach(function (r) { byId[r.id] = r; });
    /* הורה חייב להיות תפקיד. הורה שהוא שורה ⇒ עולים לתפקיד הקרוב מעליו. */
    roles.forEach(function (r) {
      if (!r.parent) return;
      var p = byId[r.parent], guard = 0;
      while (p && kindOf(p) !== "role" && guard++ < 20) p = byId[p.parent];
      r.parent = p ? p.id : "";
    });
  }

  /* ==========================================================================
   *  שמירה
   * ======================================================================== */
  function save(nextRoles, nextCats, cb) {
    if (S.saving) return cb({ ok: false, error: "שמירה קודמת עוד רצה." });
    if (!CBA.fb || !CBA.fb.ensureDb) return cb({ ok: false, error: "אין חיבור ל-Firebase." });
    var me = uid();
    if (!me) return cb({ ok: false, error: "לא מחובר ל-Firebase. נסו לרענן את העמוד." });
    var baseRev = S.rev;
    var catsSnap = S.cats; S.cats = nextCats;   // kindOf בזמן הנרמול
    normalizeParents(nextRoles);
    S.cats = catsSnap;
    var payload = {
      schema: SCHEMA, rev: baseRev + 1,
      roles: nextRoles.map(function (r, i) {
        return { id: r.id, parent: r.parent || "", title: r.title, cat: r.cat || "",
                 order: (typeof r.order === "number") ? r.order : i, year: r.year || curYear(),
                 holders: r.holders.map(function (h) {
                   if (h.fid) return { fid: h.fid, slot: h.slot };
                   return h.review ? { ext: h.ext, review: true } : { ext: h.ext };
                 }) };
      }),
      cats: nextCats.map(function (c) { return { id: c.id, name: c.name, color: c.color, kind: c.kind === "item" ? "item" : "role" }; }),
      updatedBy: me,
      updatedAt: CBA.fb.serverNow()
    };
    S.saving = true;
    CBA.fb.ensureDb(function (dbErr) {
      if (dbErr) { S.saving = false; return cb({ ok: false, error: "אין חיבור ל-Firebase." }); }
      try {
        var db = window.firebase.firestore(), ref = db.collection(COLL).doc(DOC);
        db.runTransaction(function (tr) {
          return tr.get(ref).then(function (d) {
            var cur = d.exists ? (parseInt((d.data() || {}).rev, 10) || 0) : 0;
            if (cur !== baseRev) { var e = new Error("conflict"); e.code = "cba-conflict"; throw e; }
            tr.set(ref, payload);
          });
        }).then(function () {
          S.saving = false; S.exists = true; S.upgraded = false;
          S.rev = payload.rev;
          S.roles = payload.roles.map(normRole);
          S.cats = clone(payload.cats);
          cb({ ok: true });
        })["catch"](function (e) {
          S.saving = false;
          var code = e && (e.code || e.message);
          if (code === "cba-conflict") return cb({ ok: false, conflict: true,
            error: "מישהו אחר שמר שינוי בעץ בזמן שערכת. העץ רוענן — בצעו את השינוי שוב." });
          if (code === "permission-denied") return cb({ ok: false, error: "אין הרשאה לשמור." });
          cb({ ok: false, error: "השמירה נכשלה (" + code + ")." });
        });
      } catch (e) { S.saving = false; cb({ ok: false, error: "השמירה נכשלה." }); }
    });
  }

  /* ==========================================================================
   *  מבנה
   * ======================================================================== */
  function catOf(id) {
    for (var i = 0; i < S.cats.length; i++) if (S.cats[i].id === id) return S.cats[i];
    return S.cats[0] || DEFAULT_CATS[0];
  }
  function yearRoles(y) { return S.roles.filter(function (r) { return r.year === y; }); }
  function index(roles) {
    var byId = {}, kids = {};
    roles.forEach(function (r) { byId[r.id] = r; });
    roles.forEach(function (r) {
      var p = (r.parent && byId[r.parent] && r.parent !== r.id) ? r.parent : "";
      (kids[p] = kids[p] || []).push(r);
    });
    Object.keys(kids).forEach(function (k) { kids[k].sort(function (a, b) { return (a.order - b.order) || a.title.localeCompare(b.title, "he"); }); });
    var seen = {}, st = (kids[""] || []).slice();
    while (st.length) { var n = st.pop(); if (seen[n.id]) continue; seen[n.id] = 1; (kids[n.id] || []).forEach(function (k) { st.push(k); }); }
    roles.forEach(function (r) {
      if (seen[r.id]) return;
      Object.keys(kids).forEach(function (k) { kids[k] = kids[k].filter(function (x) { return x.id !== r.id; }); });
      (kids[""] = kids[""] || []).push(r); seen[r.id] = 1;
      var s2 = [r]; while (s2.length) { var q = s2.pop(); (kids[q.id] || []).forEach(function (k) { seen[k.id] = 1; s2.push(k); }); }
    });
    function k(id) { return kids[id || ""] || []; }
    return {
      byId: byId, kids: k,
      roleKids: function (id) { return k(id).filter(function (x) { return kindOf(x) === "role"; }); },
      itemKids: function (id) { return k(id).filter(function (x) { return kindOf(x) !== "role"; }); }
    };
  }
  function descendants(ix, id) {
    var out = {}, st = [id];
    while (st.length) { ix.kids(st.pop()).forEach(function (k) { if (!out[k.id]) { out[k.id] = 1; st.push(k.id); } }); }
    return out;
  }
  function chainOf(ix, root) {
    var chain = [root], cur = root, g = 0;
    while (ix.roleKids(cur.id).length === 1 && !ix.itemKids(cur.id).length && g++ < 12) { cur = ix.roleKids(cur.id)[0]; chain.push(cur); }
    return chain;
  }
  function matcher(ix, roots) {
    var q = V.q.trim();
    if (!q) return null;
    var self = {}, live = {};
    function hit(r) {
      if (r.title.indexOf(q) !== -1) return true;
      return r.holders.some(function (h) { return who(h).name.indexOf(q) !== -1; });
    }
    function walk(r) {
      var any = self[r.id] = hit(r);
      ix.kids(r.id).forEach(function (k) { if (walk(k)) any = true; });
      live[r.id] = any; return any;
    }
    roots.forEach(walk);
    return { self: self, live: live };
  }

  /* ==========================================================================
   *  ציור
   * ======================================================================== */
  var ICON_EDIT = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
  var ICON_SEARCH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';

  function namesHTML(r, edit, cls) {
    var hs = edit ? r.holders : r.holders.filter(function (h) { return who(h).kind !== "gone"; });
    if (!hs.length) return '<span class="' + cls + ' is-vacant">פנוי</span>';
    return '<span class="' + cls + '">' + hs.map(function (h) {
      var w = who(h);
      var warn = edit && (w.review || w.kind === "gone");
      if (w.kind === "loading") return '<span class="ct-nm is-loading" aria-label="טוען שם"></span>';
      return '<span class="ct-nm' + (warn ? " is-warn" : "") + '">' + esc(w.name) + '</span>';
    }).join('<span class="ct-sep">, </span>') + '</span>';
  }
  function hitCls(m, id) { return !m ? "" : (m.self[id] ? " is-hit" : (m.live[id] ? "" : " is-dim")); }
  function dragAttrs(edit, id) { return edit ? ' draggable="true" data-drag="' + esc(id) + '"' : ""; }

  function itemHTML(r, m, edit) {
    var c = catOf(r.cat);
    return '<div class="ct-item' + (r.holders.length ? "" : " is-solo") + hitCls(m, r.id) + (V.sel === r.id ? " is-sel" : "") + '" style="--c:' + esc(c.color) + '"' +
      (edit ? ' data-edit="' + esc(r.id) + '" data-drop="' + esc(r.id) + '" role="button" tabindex="0"' : "") + dragAttrs(edit, r.id) + '>' +
      '<span class="ct-item__t">' + esc(r.title || "(ללא שם)") + '</span>' +
      (r.holders.length ? namesHTML(r, edit, "ct-item__w") : "") +
    '</div>';
  }
  /* תוכן של תפקיד: קודם הפריטים שלו (שורות צבעוניות), אחר כך תתי-תפקידים
     (עם קו עץ — זו היררכיה אמיתית), כל אחד עם הפריטים שלו. */
  function bodyHTML(ix, id, m, edit) {
    var items = ix.itemKids(id), subs = ix.roleKids(id);
    if (!items.length && !subs.length) return "";
    return items.map(function (x) { return itemHTML(x, m, edit); }).join("") +
      subs.map(function (s) {
        var c = catOf(s.cat);
        return '<div class="ct-sub' + hitCls(m, s.id) + '" style="--c:' + esc(c.color) + '"' + dragAttrs(edit, s.id) + '>' +
          '<div class="ct-sub__row' + (V.sel === s.id ? " is-sel" : "") + '"' +
            (edit ? ' data-edit="' + esc(s.id) + '" data-drop="' + esc(s.id) + '" role="button" tabindex="0"' : "") + '>' +
            '<b class="ct-sub__t">' + esc(s.title || "(ללא שם)") + '</b>' + namesHTML(s, edit, "ct-sub__w") +
          '</div>' +
          '<div class="ct-sub__in">' + bodyHTML(ix, s.id, m, edit) + '</div>' +
        '</div>';
      }).join("");
  }
  function cardHTML(ix, r, m, edit, style) {
    var c = catOf(r.cat);
    var body = bodyHTML(ix, r.id, m, edit);
    return '<div class="ct-card' + hitCls(m, r.id) + (V.sel === r.id ? " is-sel" : "") + '" style="--c:' + esc(c.color) + ';' + (style || "") + '"' +
        ' data-id="' + esc(r.id) + '"' + (edit ? ' data-drop="' + esc(r.id) + '"' : "") + dragAttrs(edit, r.id) + '>' +
      '<div class="ct-card__head"' + (edit ? ' data-edit="' + esc(r.id) + '" role="button" tabindex="0"' : "") + '>' +
        '<span class="ct-card__t">' + esc(r.title || "(ללא שם)") + '</span>' + namesHTML(r, edit, "ct-card__w") +
      '</div>' +
      (body ? '<div class="ct-card__body">' + body + '</div>' : "") +
    '</div>';
  }
  /* תחום שלא תחת תפקיד — כרטיס בגודל כרטיס תפקיד, בצבע הסוג שלו. */
  function looseCardHTML(r, m, edit) {
    var c = catOf(r.cat);
    return '<div class="ct-card ct-card--loose' + hitCls(m, r.id) + (V.sel === r.id ? " is-sel" : "") + '" style="--c:' + esc(c.color) + '"' +
        (edit ? ' data-drop="' + esc(r.id) + '"' : "") + dragAttrs(edit, r.id) + '>' +
      '<div class="ct-card__head"' + (edit ? ' data-edit="' + esc(r.id) + '" role="button" tabindex="0"' : "") + '>' +
        '<span class="ct-card__t">' + esc(r.title || "(ללא שם)") + '</span>' +
        (r.holders.length ? namesHTML(r, edit, "ct-card__w") : "") +
      '</div></div>';
  }
  function leadHTML(r, isHub, m, edit) {
    var c = catOf(r.cat);
    return '<div class="ct-lead' + (isHub ? " is-hub" : "") + (V.sel === r.id ? " is-sel" : "") + hitCls(m, r.id) + '" style="--c:' + esc(c.color) + '"' +
      (edit ? ' data-edit="' + esc(r.id) + '" data-drop="' + esc(r.id) + '" role="button" tabindex="0"' : "") + '>' +
      '<span class="ct-lead__t">' + esc(r.title || "(ללא שם)") + '</span>' + namesHTML(r, edit, "ct-lead__w") +
    '</div>';
  }

  /* כמה כרטיסים בשורה: כמה שיותר. יותר משורה אחת ⇒ זוגי (הגזע ברווח). */
  function layoutFor(w, count) {
    if (w < PHONE) return 0;
    var fit = Math.max(1, Math.floor((w + GAP) / (MINW + GAP)));
    if (count <= fit) return count;
    /* כמה שפחות שורות, ושורות מאוזנות. יותר משורה ⇒ זוגי (הגזע ברווח). */
    var rows = Math.ceil(count / fit), n = Math.ceil(count / rows);
    if (n % 2) n = (n + 1 <= fit) ? n + 1 : n - 1;
    return Math.max(2, n);
  }

  function treeHTML(ix, root, m, edit, w) {
    var chain = chainOf(ix, root), hub = chain[chain.length - 1];
    var depts = ix.roleKids(hub.id), hubItems = ix.itemKids(hub.id);
    var addTile = edit ? 1 : 0;
    var N = layoutFor(w, depts.length + addTile);
    var chainHTML = '<div class="ct-chain' + (depts.length || addTile ? " has-rows" : "") + (N ? "" : " ct-chain--phone") + '">' +
      chain.map(function (r, i) { return leadHTML(r, i === chain.length - 1 && (depts.length || addTile), m, edit); }).join("") +
      (hubItems.length ? '<div class="ct-hubitems">' + hubItems.map(function (x) { return itemHTML(x, m, edit); }).join("") + '</div>' : "") +
    '</div>';
    if (!N) return '<section class="ct-tree ct-tree--phone">' + chainHTML + phoneList(ix, depts, hub, m, edit) + '</section>';

    var tiles = depts.map(function (d) { return function (st) { return cardHTML(ix, d, m, edit, st); }; });
    if (addTile) tiles.push(function (st) { return '<button type="button" class="ct-card ct-card--add" data-add="' + esc(hub.id) + '" data-drop="' + esc(hub.id) + '" style="' + st + '">+ תפקיד חדש</button>'; });
    var rows = [];
    for (var i = 0; i < tiles.length; i += N) rows.push(tiles.slice(i, i + N));
    var single = rows.length === 1;
    return '<section class="ct-tree">' + chainHTML +
      (rows.length ? '<div class="ct-rows">' + rows.map(function (row, ri) {
        var k = row.length, last = ri === rows.length - 1;
        var cols = single ? k : N;
        return '<div class="ct-row' + (last ? " is-last" : "") + (k === 1 ? " is-single" : "") + '" style="grid-template-columns:repeat(' + (2 * cols) + ',minmax(0,1fr))">' +
          row.map(function (fn, ci) { return fn((ci === 0 && k < cols) ? "grid-column:" + (cols - k + 1) + " / span 2;" : ""); }).join("") +
        '</div>';
      }).join("") + '</div>' : "") +
    '</section>';
  }

  function phoneList(ix, depts, hub, m, edit) {
    return '<div class="ct-ptree">' + depts.map(function (d) {
      var c = catOf(d.cat);
      var open = m ? !!m.live[d.id] : !!V.open[d.id];
      var inner = bodyHTML(ix, d.id, m, edit);
      var n = ix.kids(d.id).length;
      return '<div class="ct-pitem' + hitCls(m, d.id) + '" style="--c:' + esc(c.color) + '">' +
        '<div class="ct-acc' + (open ? " is-open" : "") + '">' +
          '<div class="ct-acc__h">' +
            '<button type="button" class="ct-acc__toggle" data-toggle="' + esc(d.id) + '" aria-expanded="' + open + '"' + (inner ? "" : " disabled") + '>' +
              '<span class="ct-acc__txt"><b>' + esc(d.title || "(ללא שם)") + '</b>' + namesHTML(d, edit, "ct-acc__w") + '</span>' +
              (inner ? '<span class="ct-acc__n">' + n + ' ' + (open ? "▴" : "▾") + '</span>' : "") +
            '</button>' +
            (edit ? '<button type="button" class="ct-iconbtn" data-edit="' + esc(d.id) + '" aria-label="עריכת ' + esc(d.title) + '">' + ICON_EDIT + '</button>' : "") +
          '</div>' +
          (open && inner ? '<div class="ct-acc__b">' + inner + '</div>' : "") +
        '</div></div>';
    }).join("") +
    (edit ? '<div class="ct-pitem ct-pitem--add"><button type="button" class="ct-acc ct-acc--add" data-add="' + esc(hub.id) + '">+ תפקיד חדש</button></div>' : "") +
    '</div>';
  }

  /* ==========================================================================
   *  המסך
   * ======================================================================== */
  function mount(container, edit) {
    var year = curYear();
    container.innerHTML = '<div class="ct' + (edit ? " ct--edit" : "") + '">' +
      '<div class="ct-tools">' +
        '<label class="ct-search">' + ICON_SEARCH + '<input type="search" id="ct-q" placeholder="חיפוש שם או תפקיד" aria-label="חיפוש בעץ הוועד" value="' + esc(V.q) + '"></label>' +
        '<div class="ct-legend" id="ct-legend"></div>' +
        (edit ? '<button type="button" class="ct-btn ct-btn--ghost" data-add="">+ חדש</button><button type="button" class="ct-btn ct-btn--ghost" id="ct-cats">סוגים וצבעים</button>' : "") +
      '</div>' +
      (edit ? '<p class="ct-hint">לחצו על פריט כדי לערוך. אפשר לגרור כרטיס או שורה ולשחרר על תפקיד אחר.</p>' : "") +
      '<div id="ct-banner"></div>' +
      '<div class="ct-main"><div class="ct-canvas" id="ct-canvas">' + (CBA.skel && CBA.skel.tree ? CBA.skel.tree() : "") + '</div>' +
      '<aside class="ct-panel" id="ct-panel" hidden></aside></div>' +
    '</div>';
    var root = container.querySelector(".ct"), canvas = container.querySelector("#ct-canvas");
    var lastW = -1, ro = null;

    function draw() {
      if (!root.isConnected) { if (ro) ro.disconnect(); return; }
      if (S.error) {
        canvas.innerHTML = CBA.ui.emptyState({ icon: "inbox", title: "לא הצלחנו לטעון", sub: S.error, ctaLabel: "נסו שוב", ctaAttr: "data-retry" });
        return;
      }
      var roles = yearRoles(year), ix = index(roles);
      var roots = ix.kids("").filter(function (r) { return kindOf(r) === "role"; });
      var loose = ix.kids("").filter(function (r) { return kindOf(r) !== "role"; });
      var w = canvas.clientWidth || container.clientWidth || 1000;
      lastW = w;
      var m = matcher(ix, ix.kids(""));
      if (!roles.length) {
        canvas.innerHTML = emptyYearHTML();
      } else {
        /* 27.9 יועד: משבצות צרות ב-15% ⇒ השורות תופסות 85% מהרוחב, ממורכזות. */
        var rowW = w >= PHONE ? w * ROW_SHARE : w;
        /* 27.9 יועד: תחום בלי תפקיד מעליו = כרטיס מלא בגודל של כרטיס תפקיד
           (לא שורה), בתוך כרטיס רקע "תחומי אחריות". תחום שתחת תפקיד נשאר שורה. */
        var cw = 0;
        if (w >= PHONE && roots.length) {
          var hub0 = chainOf(ix, roots[0]).slice(-1)[0];
          var n0 = layoutFor(rowW, ix.roleKids(hub0.id).length + (edit ? 1 : 0)) || 1;
          cw = Math.floor((rowW - (n0 - 1) * GAP) / n0);
        }
        canvas.innerHTML = roots.map(function (r) { return treeHTML(ix, r, m, edit, rowW); }).join("") +
          ((loose.length || edit) ? '<section class="ct-loose"' + (edit ? ' data-drop=""' : "") + '><h3>תחומי אחריות</h3>' +
            (loose.length ? '<div class="ct-loose__grid"' + (cw ? ' style="--ct-cw:' + cw + 'px"' : "") + '>' + loose.map(function (x) { return looseCardHTML(x, m, edit); }).join("") + '</div>'
                          : '<p class="ct-muted">גררו לכאן שורה כדי לנתק אותה מתפקיד.</p>') + '</section>' : "");
      }
      canvas.classList.toggle("is-phone", w < PHONE);
      drawLegend(roles); drawBanner();
    }
    function emptyYearHTML() {
      var years = {}; S.roles.forEach(function (r) { years[r.year] = 1; });
      var prev = Object.keys(years).filter(function (y) { return y && y !== year; }).sort().pop();
      if (!edit) return CBA.ui.emptyState({ icon: "inbox", title: "העץ של " + (year || "השנה") + " עוד לא הוגדר", sub: "מנהל-על יכול לבנות אותו באזור הניהול." });
      return '<div class="ct-emptyedit"><p>אין עדיין עץ ל-' + esc(year) + '.</p>' +
        (prev ? '<button type="button" class="ct-btn" id="ct-copy" data-from="' + esc(prev) + '">העתקה מ-' + esc(prev) + '</button>' : "") +
        '<button type="button" class="ct-btn ct-btn--ghost" data-add="">+ תפקיד ראשון</button></div>';
    }
    function drawLegend(roles) {
      var used = {}; roles.forEach(function (r) { used[r.cat] = 1; });
      container.querySelector("#ct-legend").innerHTML = S.cats.filter(function (c) { return used[c.id]; }).map(function (c) {
        return '<span class="ct-lg" style="--c:' + esc(c.color) + '"><i></i>' + esc(c.name) + '</span>';
      }).join("");
    }
    function drawBanner() {
      var el = container.querySelector("#ct-banner");
      if (!edit) { el.innerHTML = ""; return; }
      var parts = [], review = 0, gone = 0;
      yearRoles(year).forEach(function (r) { r.holders.forEach(function (h) { var w = who(h); if (w.review) review++; if (w.kind === "gone") gone++; }); });
      if (S.upgraded) parts.push('<div class="ct-banner"><span>העץ הוצג במבנה החדש (סוגים וצבעים, שנת ' + esc(year) + '). בדקו ולחצו שמירה.</span><button type="button" class="ct-btn" id="ct-commit">שמירה</button></div>');
      if (review) parts.push('<div class="ct-banner ct-banner--warn"><span class="ct-pill">' + review + ' לבדיקה</span><span>שמות שלא זוהו אוטומטית. לחצו על הפריט ובחרו תושב, או סמנו שזה אדם מבחוץ.</span></div>');
      if (gone) parts.push('<div class="ct-banner ct-banner--warn"><span class="ct-pill">' + gone + '</span><span>בעלי תפקיד שכבר לא ברשימת התושבים הפעילים.</span></div>');
      el.innerHTML = parts.join("");
      var c = el.querySelector("#ct-commit");
      if (c) c.addEventListener("click", function () {
        busy(c, true);
        save(clone(S.roles), clone(S.cats), function (res) { busy(c, false); afterSave(res, "העץ נשמר"); });
      });
    }
    function afterSave(res, okMsg) {
      if (res && res.ok) { CBA.ui.toast(okMsg || "נשמר"); draw(); return true; }
      if (res && res.conflict) load(function () { closePanel(); draw(); }, true);
      CBA.ui.alert((res && res.error) || "השמירה נכשלה.", "לא נשמר");
      return false;
    }

    /* ---------- אירועים ---------- */
    var qEl = container.querySelector("#ct-q");
    qEl.addEventListener("input", function () { V.q = qEl.value; draw(); });
    root.addEventListener("click", function (e) {
      var t = e.target.closest("[data-toggle],[data-edit],[data-add],[data-retry],#ct-cats,#ct-copy");
      if (!t || !root.contains(t)) return;
      if (t.hasAttribute("data-retry")) { S.error = ""; load(draw, true); return; }
      if (t.hasAttribute("data-toggle")) { var id = t.getAttribute("data-toggle"); V.open[id] = !V.open[id]; draw(); return; }
      if (!edit) return;
      e.stopPropagation();
      if (t.id === "ct-cats") return openCats();
      if (t.id === "ct-copy") return copyYear(t.getAttribute("data-from"), t);
      if (t.hasAttribute("data-edit")) return openPanel(t.getAttribute("data-edit"), null);
      if (t.hasAttribute("data-add")) return openPanel(null, t.getAttribute("data-add"));
    });
    root.addEventListener("keydown", function (e) {
      if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-edit][role=button]")) { e.preventDefault(); e.target.click(); }
    });
    if (window.ResizeObserver) {
      ro = new ResizeObserver(function () {
        if (!root.isConnected) { ro.disconnect(); return; }
        if (!S.loaded || S.error) return;
        if (Math.abs(canvas.clientWidth - lastW) > 40) draw();
      });
      ro.observe(canvas);
    }

    /* ==========================================================================
     *  גרירה (מחשב, מצב עריכה)
     *   · על תפקיד אחר ⇒ נכנס תחתיו (תפקיד = תת-תפקיד, שורה = פריט שלו).
     *   · על כרטיס "אח" (אותו הורה) ⇒ שינוי סדר — לפני/אחרי לפי חצי הכרטיס.
     *   · על שורה ⇒ לפני/אחריה, אצל אותו תפקיד.
     *   · על "לא משויכים" ⇒ שורה מתנתקת מתפקיד. תפקיד לא יכול להתנתק.
     * ======================================================================== */
    var dragId = null;
    if (edit) {
      root.addEventListener("dragstart", function (e) {
        var el = e.target.closest("[data-drag]");
        if (!el) return;
        dragId = el.getAttribute("data-drag");
        try { e.dataTransfer.setData("text/plain", dragId); e.dataTransfer.effectAllowed = "move"; } catch (x) {}
        root.classList.add("is-dragging");
        e.stopPropagation();
      });
      root.addEventListener("dragend", function () { dragId = null; root.classList.remove("is-dragging"); clearDrop(); });
      root.addEventListener("dragover", function (e) {
        if (!dragId) return;
        var t = dropTarget(e);
        clearDrop();
        if (!t) return;
        e.preventDefault();
        t.el.classList.add(t.mode === "into" ? "is-drop" : (t.mode === "before" ? "is-drop-before" : "is-drop-after"));
      });
      root.addEventListener("drop", function (e) {
        if (!dragId) return;
        var t = dropTarget(e);
        clearDrop();
        if (!t) return;
        e.preventDefault();
        applyDrop(dragId, t);
        dragId = null;
      });
    }
    function clearDrop() {
      Array.prototype.forEach.call(root.querySelectorAll(".is-drop,.is-drop-before,.is-drop-after"), function (x) {
        x.classList.remove("is-drop", "is-drop-before", "is-drop-after");
      });
    }
    function dropTarget(e) {
      var el = e.target.closest("[data-drop]");
      if (!el || !root.contains(el)) return null;
      var tid = el.getAttribute("data-drop");
      if (tid === dragId) return null;
      var ix = index(yearRoles(year)), drag = ix.byId[dragId];
      if (!drag) return null;
      if (tid === "") return kindOf(drag) === "role" ? null : { el: el, mode: "into", id: "" };
      var tgt = ix.byId[tid];
      if (!tgt || descendants(ix, dragId)[tid]) return null;
      var r = el.getBoundingClientRect();
      if (kindOf(tgt) !== "role") {
        /* שורה: לפני/אחרי אצל אותו הורה */
        return { el: el, mode: (e.clientY < r.top + r.height / 2) ? "before" : "after", id: tid };
      }
      var isCard = el.classList.contains("ct-card") && !el.classList.contains("ct-card--add");
      if (isCard && kindOf(drag) === "role" && drag.parent === tgt.parent) {
        /* RTL: חצי ימני = לפני */
        return { el: el, mode: (e.clientX > r.left + r.width / 2) ? "before" : "after", id: tid };
      }
      return { el: el, mode: "into", id: tid };
    }
    function applyDrop(id, t) {
      var next = clone(S.roles), ix = index(next.filter(function (r) { return r.year === year; }));
      var d = ix.byId[id];
      if (!d) return;
      if (t.mode === "into") {
        if (d.parent === t.id) return;
        d.parent = t.id;
        d.order = t.id ? nextOrder(ix, t.id) + 1 : nextOrder(ix, "") + 1;
      } else {
        var tgt = ix.byId[t.id];
        d.parent = tgt.parent;
        var sib = ix.kids(tgt.parent).filter(function (x) { return x.id !== id; });
        var pos = sib.indexOf(tgt) + (t.mode === "after" ? 1 : 0);
        sib.splice(pos, 0, d);
        sib.forEach(function (s, n) { s.order = n; });
      }
      save(next, S.cats, function (res) { afterSave(res, "הוזז"); });
    }

    /* ==========================================================================
     *  עורך
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
      var ix = index(yearRoles(year)), r = id ? ix.byId[id] : null;
      if (id && !r) return;
      var parent = r ? r.parent : (parentForNew || "");
      var defaultCat = S.cats.filter(function (c) { return c.kind === "role"; })[0] || S.cats[0];
      V.sel = id || null;
      V.draft = { id: id || null, title: r ? r.title : "", parent: parent,
                  cat: r ? r.cat : defaultCat.id, holders: r ? clone(r.holders) : [], pq: "" };
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
        var sh = CBA.ui.sheet({ label: "עריכה בוועד השיכון", key: "ct-role", sheetCls: "ct-sheet", html: html,
          onMount: function (wrap) { renderForm(wrap.querySelector("#ct-form")); } });
        sheetClose = function () { sh.close(); };
      }
    }
    function parentOptions(ix, selfId, isItem) {
      var block = selfId ? descendants(ix, selfId) : {};
      if (selfId) block[selfId] = 1;
      var out = [{ id: "", label: isItem ? "— לא משויך לתפקיד" : "— ראש העץ" }];
      function walk(pid, depth) {
        ix.roleKids(pid).forEach(function (k) {
          if (block[k.id]) return;
          out.push({ id: k.id, label: new Array(depth + 1).join("   ") + (depth ? "└ " : "") + (k.title || "(ללא שם)") });
          walk(k.id, depth + 1);
        });
      }
      walk("", 0);
      return out;
    }
    function renderForm(host) {
      if (!host) return;
      var d = V.draft, ix = index(yearRoles(year));
      var isItem = catOf(d.cat).kind === "item";
      var sib = ix.kids(d.parent);
      var pos = d.id ? sib.map(function (s) { return s.id; }).indexOf(d.id) : -1;
      var roleKidCount = d.id ? ix.roleKids(d.id).length : 0;
      host.innerHTML =
        '<div class="ct-form__head"><h3>' + (d.id ? "עריכה" : "חדש") + '</h3><button type="button" class="ct-x" data-f="close" aria-label="סגירה">×</button></div>' +
        '<div class="ct-field"><label>סוג</label><div class="ct-types">' +
          S.cats.map(function (c) {
            return '<button type="button" class="ct-type' + (c.id === d.cat ? " is-on" : "") + '" data-fcat="' + esc(c.id) + '" style="--c:' + esc(c.color) + '" aria-pressed="' + (c.id === d.cat) + '"><i></i>' + esc(c.name) + '</button>';
          }).join("") + '</div></div>' +
        '<div class="ct-field"><label for="ct-f-title">שם</label><input class="ct-input" id="ct-f-title" maxlength="80" value="' + esc(d.title) + '"></div>' +
        '<div class="ct-field"><label for="ct-f-parent">' + (isItem ? "באחריות" : "כפוף ל") + '</label><select class="ct-input" id="ct-f-parent">' +
          parentOptions(ix, d.id, isItem).map(function (o) { return '<option value="' + esc(o.id) + '"' + (o.id === d.parent ? " selected" : "") + '>' + esc(o.label) + '</option>'; }).join("") +
        '</select></div>' +
        (d.id && sib.length > 1 ? '<div class="ct-field"><label>מיקום</label><div class="ct-row2">' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-f="up"' + (pos <= 0 ? " disabled" : "") + '>→ קודם</button>' +
          '<span class="ct-muted">' + (pos + 1) + ' מתוך ' + sib.length + '</span>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-f="down"' + (pos >= sib.length - 1 ? " disabled" : "") + '>הבא ←</button></div></div>' : "") +
        '<div class="ct-field"><label>מי' + (isItem ? " (לא חובה)" : "") + '</label><div class="ct-holders">' +
          d.holders.map(function (h, i) {
            var w = who(h);
            return '<div class="ct-holder' + (w.review || w.kind === "gone" ? " is-warn" : "") + '"><span class="ct-holder__n">' + esc(w.name) +
              (w.house ? ' <small>בית ' + esc(w.house) + '</small>' : "") + (w.kind === "ext" && !w.review ? ' <small>מבחוץ</small>' : "") + '</span>' +
              (w.review ? '<button type="button" class="ct-link" data-f="okext" data-i="' + i + '">זה אדם מבחוץ</button>' : "") +
              '<button type="button" class="ct-x" data-f="rm" data-i="' + i + '" aria-label="הסרה">×</button></div>';
          }).join("") + '</div>' +
          '<label class="ct-search ct-search--in">' + ICON_SEARCH + '<input type="search" id="ct-f-q" placeholder="הוספת אדם — הקלידו שם" autocomplete="off" value="' + esc(d.pq) + '"></label>' +
          '<div class="ct-opts" id="ct-f-opts"></div></div>' +
        '<div class="ct-form__foot">' +
          '<button type="button" class="ct-btn" data-f="save">שמירה</button>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-f="close">ביטול</button>' +
          (d.id && !isItem ? '<button type="button" class="ct-btn ct-btn--ghost" data-f="addkid">+ מתחת</button>' : "") +
          (d.id ? '<button type="button" class="ct-btn ct-btn--danger" data-f="del">מחיקה</button>' : "") +
        '</div>' +
        (roleKidCount && isItem ? '<p class="ct-note">⚠️ יש תחתיו ' + roleKidCount + ' תפקידים. שורה לא יכולה להחזיק תפקידים — הם יעלו רמה אחת.</p>' : "");

      host.querySelector("#ct-f-title").addEventListener("input", function (e) { d.title = e.target.value; });
      host.querySelector("#ct-f-parent").addEventListener("change", function (e) { d.parent = e.target.value; });
      var qi = host.querySelector("#ct-f-q");
      qi.addEventListener("input", function () { d.pq = qi.value; drawOpts(host); });
      qi.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var f = host.querySelector("[data-pick]"); if (f) f.click(); } });
      drawOpts(host);
      host.onclick = function (e) {
        var b = e.target.closest("[data-f],[data-fcat],[data-pick]");
        if (!b) return;
        if (b.hasAttribute("data-fcat")) {
          d.cat = b.getAttribute("data-fcat");
          if (catOf(d.cat).kind === "item" && d.parent && ix.byId[d.parent] && kindOf(ix.byId[d.parent]) !== "role") d.parent = "";
          renderForm(host); return;
        }
        if (b.hasAttribute("data-pick")) {
          var v = b.getAttribute("data-pick");
          if (v.indexOf("ext:") === 0) d.holders.push({ ext: v.slice(4) });
          else { var p = S.people.byKey[v]; if (p) d.holders.push({ fid: p.fid, slot: p.slot }); }
          d.pq = ""; renderForm(host); var q2 = host.querySelector("#ct-f-q"); if (q2) q2.focus();
          return;
        }
        var f = b.getAttribute("data-f"), i = parseInt(b.getAttribute("data-i"), 10);
        if (f === "close") { closePanel(); draw(); }
        else if (f === "rm") { d.holders.splice(i, 1); renderForm(host); }
        else if (f === "okext") { delete d.holders[i].review; renderForm(host); }
        else if (f === "addkid") { var pid = d.id; closePanel(); openPanel(null, pid); }
        else if (f === "up" || f === "down") moveRole(d.id, f === "up" ? -1 : 1, b);
        else if (f === "save") submit(b);
        else if (f === "del") removeRole(d.id, b);
      };
    }
    function drawOpts(host) {
      var d = V.draft, el = host.querySelector("#ct-f-opts"), q = d.pq.trim();
      if (!q) { el.innerHTML = ""; return; }
      var taken = {}; d.holders.forEach(function (h) { if (h.fid) taken[h.fid + "#" + h.slot] = 1; });
      if (!S.dirDone) { el.innerHTML = '<div class="ct-muted ct-opt--none">רשימת התושבים עוד נטענת…</div>'; setTimeout(function () { if (el.isConnected) drawOpts(host); }, 800); return; }
      var hits = (S.people ? S.people.list : []).filter(function (p) { return !taken[p.key] && (p.full.indexOf(q) !== -1 || String(p.house) === q); }).slice(0, 8);
      el.innerHTML = hits.map(function (p) {
        return '<button type="button" class="ct-opt" data-pick="' + esc(p.key) + '"><span class="ct-opt__n">' + esc(p.full) + '</span><small>' + (p.house ? "בית " + esc(p.house) : "") + '</small></button>';
      }).join("") + (hits.length ? "" : '<div class="ct-muted ct-opt--none">לא נמצא תושב בשם הזה.</div>') +
        '<button type="button" class="ct-opt ct-opt--ext" data-pick="ext:' + esc(q) + '">+ אדם מחוץ לשיכון: <b>' + esc(q) + '</b></button>';
    }
    function nextOrder(ix, pid) {
      var k = ix.kids(pid);
      return k.length ? Math.max.apply(null, k.map(function (x) { return x.order; })) : -1;
    }
    function submit(btn) {
      var d = V.draft, title = String(d.title || "").trim();
      if (!title) return CBA.ui.alert("צריך שם.");
      var next = clone(S.roles), ix = index(next.filter(function (r) { return r.year === year; }));
      if (d.id && d.parent && descendants(ix, d.id)[d.parent]) return CBA.ui.alert("אי אפשר לשייך פריט למשהו שנמצא מתחתיו.");
      var holders = d.holders.map(function (h) { return h.fid ? { fid: h.fid, slot: h.slot } : (h.review ? { ext: h.ext, review: true } : { ext: h.ext }); });
      if (d.id) {
        var r = ix.byId[d.id]; if (!r) return;
        if (r.parent !== d.parent) r.order = nextOrder(ix, d.parent) + 1;
        r.title = title; r.parent = d.parent; r.cat = d.cat; r.holders = holders;
      } else {
        next.push({ id: newId("r"), parent: d.parent, title: title, cat: d.cat, order: nextOrder(ix, d.parent) + 1, year: year, holders: holders });
      }
      busy(btn, true);
      save(next, S.cats, function (res) { busy(btn, false); if (afterSave(res, d.id ? "עודכן" : "נוסף")) { closePanel(); draw(); } });
    }
    function moveRole(id, dir, btn) {
      var next = clone(S.roles), ix = index(next.filter(function (r) { return r.year === year; }));
      var r = ix.byId[id]; if (!r) return;
      var sib = ix.kids(r.parent), i = sib.indexOf(r), j = i + dir;
      if (i < 0 || j < 0 || j >= sib.length) return;
      sib.splice(i, 1); sib.splice(j, 0, r); sib.forEach(function (s, n) { s.order = n; });
      busy(btn, true);
      save(next, S.cats, function (res) {
        busy(btn, false);
        if (afterSave(res, "הסדר עודכן")) { var h = container.querySelector("#ct-form") || document.querySelector(".ct-sheet #ct-form"); if (h && V.draft) renderForm(h); }
      });
    }
    function removeRole(id, btn) {
      var ix = index(yearRoles(year)), r = ix.byId[id]; if (!r) return;
      var kids = ix.kids(id), pr = ix.byId[r.parent];
      var msg = 'למחוק את "' + (r.title || "(ללא שם)") + '"?' + (kids.length ? " " + kids.length + " הפריטים שמתחתיו יעברו אל " + (pr ? '"' + pr.title + '"' : "ראש העץ") + "." : "");
      CBA.ui.confirm(msg, { danger: true, okText: "מחיקה" }).then(function (ok) {
        if (!ok) return;
        var next = clone(S.roles).filter(function (x) { return x.id !== id; });
        next.forEach(function (x) { if (x.parent === id) x.parent = r.parent; });
        busy(btn, true);
        save(next, S.cats, function (res) { busy(btn, false); if (afterSave(res, "נמחק")) { closePanel(); draw(); } });
      });
    }
    function copyYear(from, btn) {
      var src = S.roles.filter(function (r) { return r.year === from; });
      var map = {}; src.forEach(function (r) { map[r.id] = newId("r"); });
      var copies = src.map(function (r) { var c = clone(r); c.id = map[r.id]; c.parent = r.parent ? (map[r.parent] || "") : ""; c.year = year; return c; });
      busy(btn, true);
      save(clone(S.roles).concat(copies), S.cats, function (res) { busy(btn, false); afterSave(res, "העץ הועתק מ-" + from); });
    }

    /* ==========================================================================
     *  סוגים וצבעים
     * ======================================================================== */
    function openCats() {
      var cats = clone(S.cats), usage = {};
      S.roles.forEach(function (r) { usage[r.cat] = (usage[r.cat] || 0) + 1; });
      var sh = CBA.ui.sheet({ label: "סוגים וצבעים", key: "ct-cats", sheetCls: "ct-sheet", html: '<div class="ct-form" id="ct-cats-form"></div>',
        onMount: function (wrap) { paint(wrap.querySelector("#ct-cats-form")); } });
      function paint(host) {
        host.innerHTML =
          '<div class="ct-form__head"><h3>סוגים וצבעים</h3><button type="button" class="ct-x" data-c="close" aria-label="סגירה">×</button></div>' +
          '<p class="ct-muted">"תפקיד" נכנס לעץ עם קווים. "שורה" מופיעה בכרטיס של מי שאחראי עליה.</p>' +
          '<div class="ct-catlist">' + cats.map(function (c, i) {
            return '<div class="ct-cat" style="--c:' + esc(c.color) + '">' +
              '<div class="ct-cat__top"><i class="ct-sw"></i><input class="ct-input" data-name="' + i + '" value="' + esc(c.name) + '" maxlength="30" aria-label="שם הסוג">' +
                '<button type="button" class="ct-x" data-c="del" data-i="' + i + '" aria-label="מחיקה"' + (usage[c.id] || cats.length <= 1 ? " disabled" : "") + '>×</button></div>' +
              '<div class="ct-seg"><button type="button" data-c="kind" data-i="' + i + '" data-k="role" class="' + (c.kind !== "item" ? "is-on" : "") + '">תפקיד (בעץ)</button>' +
                '<button type="button" data-c="kind" data-i="' + i + '" data-k="item" class="' + (c.kind === "item" ? "is-on" : "") + '">שורה בכרטיס</button></div>' +
              '<div class="ct-palette">' + PALETTE.map(function (p) {
                return '<button type="button" class="ct-pal' + (p.toLowerCase() === String(c.color).toLowerCase() ? " is-on" : "") + '" data-c="color" data-i="' + i + '" data-color="' + p + '" style="--p:' + p + '" aria-label="צבע"></button>';
              }).join("") + '<label class="ct-pal ct-pal--custom"><input type="color" data-custom="' + i + '" value="' + esc(c.color) + '" aria-label="צבע אחר"></label></div>' +
              (usage[c.id] ? '<span class="ct-muted">' + usage[c.id] + ' פריטים</span>' : "") +
            '</div>';
          }).join("") + '</div>' +
          '<button type="button" class="ct-btn ct-btn--ghost" data-c="add">+ סוג חדש</button>' +
          '<div class="ct-form__foot"><button type="button" class="ct-btn" data-c="save">שמירה</button><button type="button" class="ct-btn ct-btn--ghost" data-c="close">ביטול</button></div>';
        Array.prototype.forEach.call(host.querySelectorAll("[data-name]"), function (inp) { inp.addEventListener("input", function () { cats[+inp.getAttribute("data-name")].name = inp.value; }); });
        Array.prototype.forEach.call(host.querySelectorAll("[data-custom]"), function (inp) { inp.addEventListener("change", function () { cats[+inp.getAttribute("data-custom")].color = inp.value; paint(host); }); });
        host.onclick = function (e) {
          var b = e.target.closest("[data-c]"); if (!b || b.disabled) return;
          var c = b.getAttribute("data-c"), i = parseInt(b.getAttribute("data-i"), 10);
          if (c === "close") sh.close();
          else if (c === "color") { cats[i].color = b.getAttribute("data-color"); paint(host); }
          else if (c === "kind") { cats[i].kind = b.getAttribute("data-k"); paint(host); }
          else if (c === "del") { cats.splice(i, 1); paint(host); }
          else if (c === "add") { cats.push({ id: newId("k"), name: "", color: PALETTE[cats.length % PALETTE.length], kind: "item" }); paint(host); var a = host.querySelectorAll("[data-name]"); if (a.length) a[a.length - 1].focus(); }
          else if (c === "save") {
            var names = {};
            for (var k = 0; k < cats.length; k++) {
              cats[k].name = String(cats[k].name || "").trim();
              if (!cats[k].name) return CBA.ui.alert("לכל סוג צריך שם.");
              if (names[cats[k].name]) return CBA.ui.alert('יש שני סוגים בשם "' + cats[k].name + '".');
              names[cats[k].name] = 1;
            }
            if (!cats.some(function (x) { return x.kind !== "item"; })) return CBA.ui.alert("צריך לפחות סוג אחד של תפקיד.");
            busy(b, true);
            save(clone(S.roles), cats, function (res) {
              busy(b, false);
              if (afterSave(res, "נשמר")) { sh.close(); var h = container.querySelector("#ct-form") || document.querySelector(".ct-sheet #ct-form"); if (h && V.draft) renderForm(h); }
            });
          }
        };
      }
    }

    function busy(btn, on) {
      if (!btn) return;
      if (on) btn._ctDone = CBA.ui.busy(btn, "שומר…");
      else if (typeof btn._ctDone === "function") { btn._ctDone(); btn._ctDone = null; }
    }

    /* כשהשמות מגיעים ברקע — מציירים שוב (אם המסך עדיין פתוח). */
    onPeople(function () {
      if (!root.isConnected) return false;
      if (S.loaded) { draw(); var h = container.querySelector("#ct-form") || document.querySelector(".ct-sheet #ct-form"); if (h && V.draft) renderForm(h); }
    });
    load(function () {
      if (!root.isConnected) return;
      if (edit && V.sel) { var s = V.sel; V.sel = null; draw(); openPanel(s, null); return; }
      draw();
    });
  }

  /* ==========================================================================
   *  רישום + ממשק למדריך התושבים (resident.js)
   * ======================================================================== */
  CBA.screens.resCommittee = { render: function (container) { mount(container, false); } };
  CBA.screens.committeeAdmin = { render: function (container) { if (!isSuper()) { container.innerHTML = ""; return; } mount(container, true); } };

  /* תפקידים של אדם בשנה המוצגת — לפי משפחה + מספר דייר בלבד. */
  function rolesFor(fid, slot) {
    if (!S.loaded || !fid) return [];
    var y = curYear(), out = [];
    S.roles.forEach(function (r) {
      if (r.year !== y) return;
      r.holders.forEach(function (h) { if (h.fid && String(h.fid) === String(fid) && h.slot === slot) out.push(r.title); });
    });
    return out;
  }
  /* 27.9.26 — API ציבורי ל"קישוריות שירותים-ועד" (resRecommendations.js,
     יועד: "שהעדכונים יהיו עצמיים ולא שאם הועד משתנה אני צריך לעדכן ב-3
     מקומות"). רק פריטים (kind:"item", למשל "מועדון ילדים") — לא תפקידים
     עצמם — כי אלה מה שכרטיס שירות/המלצה מקשר אליו. אחרי normalizeParents
     (רץ בכל load/save) parent של פריט מצביע תמיד ישירות על תפקיד, אז אין
     צורך לטפס בעץ כאן. הקריאה חיה — נגזרת מ-S בזמן הקריאה, לעולם לא
     מועתקת; קורא אחר (resRecommendations) שומר רק את מזהה הפריט. חובה
     לקרוא load() לפני שקוראים לפונקציות האלה (כמו rolesFor למעלה). */
  function itemsForYear(year) {
    if (!S.loaded) return [];
    year = year || curYear();
    var byId = {}; S.roles.forEach(function (r) { byId[r.id] = r; });
    return S.roles.filter(function (r) { return r.year === year && kindOf(r) === "item"; })
      .map(function (r) {
        var role = r.parent && byId[r.parent];
        var names = role ? role.holders.map(who).filter(function (w) { return w.kind !== "gone"; }).map(function (w) { return w.name; }) : [];
        return { id: r.id, title: r.title, roleTitle: role ? role.title : "", ownerNames: names };
      });
  }
  function itemOwnerText(itemId, year) {
    if (!itemId) return "";
    var it = itemsForYear(year).filter(function (x) { return x.id === itemId; })[0];
    return it && it.ownerNames.length ? it.ownerNames.join(", ") : "";
  }

  /* בורר <option> משותף לכל מסך שרוצה לקשר משהו לפריט בעץ הוועד (טופס
     כרטיס המלצה, עורך שירות רשמי) — כדי שלא ייכתב פעמיים באותה תבנית
     בדיוק. ריק אם עדיין לא נטען העץ (itemsForYear כבר מטפלת בזה). */
  function itemOptionsHtml(selectedId, emptyLabel) {
    var items = itemsForYear();
    var html = '<option value="">' + esc(emptyLabel || "— ללא —") + '</option>';
    items.forEach(function (it) {
      var label = it.title + (it.ownerNames.length ? " — " + it.ownerNames.join(", ") : " — טרם שובץ");
      html += '<option value="' + esc(it.id) + '"' + (selectedId === it.id ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    return html;
  }

  CBA.committeeTree = { load: load, rolesFor: rolesFor, slotOfKey: slotOfKey,
                        itemsForYear: itemsForYear, itemOwnerText: itemOwnerText,
                        itemOptionsHtml: itemOptionsHtml,
                        _state: S, _view: V, _index: index, _layoutFor: layoutFor, _applyDoc: applyDoc };
})();
