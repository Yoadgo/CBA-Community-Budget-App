/* "עדכון חדש" בעמוד הבית — מרכז ההתראות (23.9.2026).

   כשקורה משהו בבקשה של המשפחה (החזר אושר, דיווח גינון שובץ, שריון אושר…)
   השרת כותב את "הטקסט באפליקציה" מהטבלה למסמך אחד של המשפחה:
   notifyInbox/{familyId} — שדה לכל תחום: { text, at, screen, badge }.
   בלי שם, מייל או טלפון — רק הטקסט שבטבלה.

   כאן: בעמוד הבית, בראש "אצלנו בבית", שורה לכל עדכון שעוד לא נראה, עם
   נקודה. לחיצה פותחת את המסך. **נראה** = המשתמש פתח את המסך הזה (בכל דרך),
   ונשמר בדפדפן בלבד (localStorage) — אין כתיבה ל-Firestore מהדפדפן.
   ⚠️ השורה מופיעה רק כשבטבלה סומן "סימון עדכון חדש" והמנהל-על לא כיבה את
      זה בהגדרות הכלליות (badge=false ⇒ לא מוצג). */
window.CBA = window.CBA || {};
(function () {
  var KEY = "cba_inbox_seen_v1";
  var MAX_AGE = 14 * 86400000;
  var LABEL = { gar: "מראה שיכון", bud: "החזרים", club: "מועדון", gym: "מכון כושר",
                res: "המשפחה שלי", evt: "אירועים", oth: "האפליקציה" };
  var last = null;   // המסמך האחרון שנקרא — כדי ש-seenScreen יידע איזה תחום לסמן
  var visited = {};  // מסך -> מתי נפתח בטעינה הזו (גם לפני שהמסמך נקרא, למשל כניסה מפוש)

  function seen() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  function setSeen(map) {
    try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {}
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function unseen(doc) {
    var s = seen(), out = [], now = Date.now();
    Object.keys(doc || {}).forEach(function (dom) {
      var e = doc[dom];
      if (!e || typeof e !== "object" || !e.badge || !e.text) return;
      var at = Number(e.at) || 0;
      if (!at || now - at > MAX_AGE) return;
      if ((Number(s[dom]) || 0) >= at) return;
      if ((visited[String(e.screen || "")] || 0) >= at) return;
      out.push({ dom: dom, text: String(e.text), at: at, screen: String(e.screen || "") });
    });
    out.sort(function (a, b) { return b.at - a.at; });
    return out;
  }

  /* 🔴 גל 2 (30.9.26) — בבית החדש העדכונים הם שורות בכרטיס "מה קרה" (H9/H26),
     בתוך #hm-inbox, ומספרם נכנס למספר הגיבור "מה מחכה לי" (A1) דרך onList.
     בלי #hm-inbox — ההתנהגות הישנה (ראש .hm-mine) נשמרת בדיוק. */
  var DOM_CLS = { gar: "gar", bud: "bud", club: "home", gym: "gym", res: "home", evt: "ev", oth: "home" };
  function ago(at) {
    var d0 = new Date(); d0.setHours(0, 0, 0, 0);
    var d = new Date(at); d.setHours(0, 0, 0, 0);
    var n = Math.round((d0 - d) / 86400000);
    return n <= 0 ? "היום" : n === 1 ? "אתמול" : "לפני " + n + " ימים";
  }
  function rowV2(it) {
    return '<button type="button" class="hm2-row hm2-row--new" data-goto="' + esc(it.screen || "resHome") + '">' +
      '<i class="hm2-disc hm2-disc--' + (DOM_CLS[it.dom] || "home") + '"><span class="hm2-dot"></span></i>' +
      '<span class="hm2-row__t"><b dir="auto">' + esc(it.text) + '</b><small>' + esc((LABEL[it.dom] || "") + " · " + ago(it.at)) + '</small></span>' +
      '<span class="badge badge--info">חדש</span></button>';
  }

  function mount(container, opts) {
    opts = opts || {};
    var slot = container && container.querySelector && container.querySelector("#hm-inbox");
    var host = slot || (container && container.querySelector && container.querySelector(".hm-mine"));
    if (!host || !CBA.data || !CBA.data.readNotifyInbox) { if (opts.onList) opts.onList(null); return; }
    CBA.data.readNotifyInbox(function (doc) {
      last = doc;
      if (!host.isConnected) return;
      var list = doc ? unseen(doc) : [];
      if (opts.onList) { try { opts.onList(doc ? list : null); } catch (e) { /* הבית נעלם */ } }
      if (slot) { slot.innerHTML = list.map(rowV2).join(""); return; }
      if (!doc) return;
      var old = host.querySelector("#hm-inbox");
      if (old) old.remove();
      if (!list.length) return;
      var div = document.createElement("div");
      div.id = "hm-inbox";
      div.className = "hm-inbox";
      div.innerHTML = list.map(function (it) {
        return '<button type="button" class="hm-inbox__i" data-goto="' + esc(it.screen || "resHome") + '">' +
          '<span class="hm-inbox__dot" aria-hidden="true"></span>' +
          '<span class="hm-inbox__txt"><small>עדכון חדש · ' + esc(LABEL[it.dom] || "") + '</small>' +
          '<b>' + esc(it.text) + '</b></span></button>';
      }).join("");
      host.insertBefore(div, host.firstChild);
    });
  }

  /* נקרא מ-showScreen בכל מעבר מסך. */
  function seenScreen(name) {
    /* עמוד הבית עצמו אינו "פתיחת הבקשה" — שם העדכון רק מוצג. */
    if (!name || name === "resHome") return;
    visited[name] = Date.now();
    if (!last) return;
    var s = seen(), changed = false;
    Object.keys(last).forEach(function (dom) {
      var e = last[dom];
      if (e && typeof e === "object" && e.screen === name && Number(e.at) > (Number(s[dom]) || 0)) {
        s[dom] = Number(e.at); changed = true;
      }
    });
    if (changed) setSeen(s);
  }

  CBA.inbox = { mount: mount, seenScreen: seenScreen };
})();
