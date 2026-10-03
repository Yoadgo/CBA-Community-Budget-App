/* service-worker.js — שכבת ה-PWA של "ניהול קהילה" (2026-08-20)
   ================================================================
   מה הקובץ הזה עושה, בשפה פשוטה: הוא "זיכרון" שיושב בין הדפדפן לאתר.
   כשהוא מותקן, קבצי האפליקציה נשמרים במכשיר — ולכן היא נפתחת מיידית,
   וגם עובדת בלי רשת.

   שלושה כללים מחייבים שנקבעו באפיון (מסמך אפיון PWA, סעיף 4):

   1. קבצי JS/CSS נטענים תמיד עם ?v=... בכתובת. מספר הגרסה הוא חלק
      מהכתובת, ולכן קובץ ששמור במטמון הוא *תמיד* הגרסה הנכונה. אפשר
      להגיש אותו מהמטמון בלי שום סיכון. -> cache-first.

   2. index.html הוא הקובץ היחיד *בלי* ?v= — הוא זה שמחזיק את מספרי
      הגרסה של כל השאר. לכן חייבים תמיד לנסות להביא אותו טרי מהרשת,
      אחרת עדכון לעולם לא יגיע. -> network-first.

   3. קריאות לשרת (Apps Script / script.google.com) לעולם, אבל לעולם,
      לא נשמרות במטמון. נתון תקציבי ישן שמוגש כאילו הוא טרי הוא בדיוק
      מה שיגרום להחלטה שגויה. כשאין רשת — הבקשה נכשלת, והקוד הקיים
      ב-sheets.js כבר יודע ליפול חזרה על המטמון שלו (cba_data_cache)
      ולסמן למשתמש שהנתונים לא טריים.

   ⚠️ (3.10.2026) גרסה לכל קובץ. עד היום היה ?v= אחד לכולם, וכל דיפלוי
      הוריד מחדש את כל האפליקציה לכל מכשיר. עכשיו לכל קובץ טביעת אצבע
      משלו, ו-VERSION כאן הוא טביעת האצבע של הרשימה כולה. **לא לערוך
      ידנית** — לפני כל קומיט מריצים `node tools/stamp-versions.js`,
      והוא מעדכן את index.html ואת הבלוק שלמטה יחד.  */

var VERSION = "a08d5f1ca3";
var VERSION = "49b8ef283b";
var CACHE   = "cba-app";

/* @@ASSET_VERSIONS_START@@ */
/* נוצר אוטומטית ע"י tools/stamp-versions.js — לא לערוך ידנית. */
var ASSET_VERSIONS = {
  "css/canopy.css": "030914c935",
  "css/committeeTree.css": "fae4abd61f",
  "css/density.css": "6613a51158",
  "css/events.css": "a48e8ef614",
  "css/events2.css": "1bffa4b24e",
  "css/frame.css": "7408e8f2b4",
  "css/garden.css": "0ae26936da",
  "css/garden2.css": "92f8f8dbd0",
  "css/gardenSchedule.css": "f0d56e7ded",
  "css/gardenStats.css": "9283136e86",
  "css/gym.css": "c480c9319b",
  "css/home.css": "bd82c05fd6",
  "css/home2.css": "9d4ca5c155",
  "css/homeGarden.css": "c1c9331310",
  "css/homeSchedule.css": "8803b15e97",
  "css/liquid-glass.css": "9252e5160b",
  "css/loading.css": "820a89ce19",
  "css/mobile.css": "7e36274ab6",
  "css/motion.css": "144675cc01",
  "css/notify.css": "3f3d99a863",
  "css/profile.css": "0a6f125973",
  "css/pwa.css": "5cebb597c3",
  "css/report.css": "a374c3446d",
  "css/resident.css": "2611ef87d3",
  "css/resident2.css": "521b8f184a",
  "css/search.css": "866322fbb8",
  "css/style.css": "69c343dffe",
  "css/sys.css": "48a9728e9a",
  "css/tokens.css": "b1f1b7d21f",
  "css/tour.css": "fbb848ba1f",
  "css/wework.css": "3cfe17107a",
  "icons/apple-touch-icon.png": "5ce56ce0dc",
  "icons/icon-192.png": "a624d0ac7a",
  "js/app.js": "58ee4ced21",
  "js/data/dataService.js": "99b4352f79",
  "js/data/door.js": "71c7a113de",
  "js/data/firebase.js": "9669c19e11",
  "js/data/gardenAreas.js": "457c00156c",
  "js/data/gardenLang.js": "0983592bf2",
  "js/data/gardenRules.js": "309560188b",
  "js/data/gardenSlots.js": "1b715264ff",
  "js/data/gardenStatsCalc.js": "177cc46e78",
  "js/data/gymFs.js": "eec375c679",
  "js/data/mapGeo.js": "446d4fdd50",
  "js/data/mock.js": "fd54e34660",
  "js/data/push.js": "198e321583",
  "js/data/reconcile.js": "899bfb8f4c",
  "js/data/sheets.js": "3fc95ad12e",
  "js/lazy.js": "011e0ffe5f",
  "js/lazyManifest.js": "4e7617e933",
  "js/pwa.js": "cc703231c6",
  "js/screens/appReports.js": "a47450bd91",
  "js/screens/budget.js": "5fbc7244f5",
  "js/screens/clubAdmin.js": "2762c48dbf",
  "js/screens/committeeTree.js": "69b56f5e38",
  "js/screens/doorAdmin.js": "9c1b798a5b",
  "js/screens/emailSettings.js": "a0cb23db5a",
  "js/screens/events.js": "00461235ca",
  "js/screens/expenses.js": "1d93311741",
  "js/screens/gardenPlan.js": "ea51dc59c9",
  "js/screens/gardenSchedule.js": "861d4bba6f",
  "js/screens/gardenScheduleAi.js": "4a2f2ab9f6",
  "js/screens/gardenStats.js": "9409f96dca",
  "js/screens/gardenTasks.js": "43f85ceec7",
  "js/screens/gymAdmin.js": "1971f77c3c",
  "js/screens/home.js": "0205f05d94",
  "js/screens/homeGarden.js": "ee331ad56c",
  "js/screens/homeSchedule.js": "a39dc89ce9",
  "js/screens/myProfile.js": "5371fc4b54",
  "js/screens/notes.js": "04bc8dece4",
  "js/screens/planning.js": "22607620df",
  "js/screens/reconcile.js": "8a59cd1261",
  "js/screens/resGarden.js": "eb386bdfbb",
  "js/screens/resGym.js": "d61998fa65",
  "js/screens/resRecommendations.js": "fe068c58c9",
  "js/screens/resWework.js": "b3eb1b2b3c",
  "js/screens/resident.js": "40d0cd16eb",
  "js/screens/residents.js": "9ebc66c05d",
  "js/screens/services.js": "bec9552396",
  "js/screens/servicesAdmin.js": "4c6fe01239",
  "js/screens/servicesCategoriesAdmin.js": "23bff879f4",
  "js/screens/sysHub.js": "b8e3ea99b4",
  "js/screens/sysStatus.js": "af5674e9b1",
  "js/screens/weworkAdmin.js": "794ed62ea8",
  "js/ui/canopy.js": "b94420b1b4",
  "js/ui/diag.js": "5131c18964",
  "js/ui/dialog.js": "0df981dda8",
  "js/ui/doorButton.js": "e274640af6",
  "js/ui/gardenForm.js": "7f70409b34",
  "js/ui/inbox.js": "502c774321",
  "js/ui/logo.js": "292fd3c7b2",
  "js/ui/mobile.js": "432817994d",
  "js/ui/motion.js": "b7b998f507",
  "js/ui/photos.js": "8cdac86c85",
  "js/ui/plus.js": "c15f8707c4",
  "js/ui/report.js": "ea44ad6eed",
  "js/ui/search.js": "4a4fd40ce0",
  "js/ui/security.js": "6238d03d0a",
  "js/ui/skeleton.js": "f4934f5355",
  "js/ui/tips.js": "d4f66f2d2a",
  "js/ui/tour.js": "56cb035d22",
  "manifest.webmanifest": "bc85a26549"
};
/* @@ASSET_VERSIONS_END@@ */

/* הנתיב של בקשה יחסית לשורש האפליקציה ("js/app.js"), בלי ?v=.
   ה-scope הוא למשל https://yoadgo.github.io/CBA-Community-Budget-App/ */
function assetPath_(url) {
  try {
    var scope = self.registration && self.registration.scope;
    var href = url.origin + url.pathname;
    if (scope && href.indexOf(scope) === 0) return href.slice(scope.length);
    return url.pathname.replace(/^\//, "");
  } catch (e) { return url.pathname; }
}

/* האם ערך שמור במטמון שייך לגרסה ישנה של קובץ? רק קבצים עם ?v=:
   • הקובץ ברשימה והגרסה שונה — ישן, למחוק.
   • הקובץ כבר לא ברשימה בכלל (נמחק מ-index.html) — יתום, למחוק.
   • הגרסה זהה — להשאיר. זה כל ההבדל מהשיטה הישנה, שמחקה הכול. */
function isStaleAsset_(url) {
  var v = url.searchParams.get("v");
  if (!v) return false;
  var want = ASSET_VERSIONS[assetPath_(url)];
  if (want === undefined) return true;
  return v !== want;
}

/* הערה על השיטה: בכוונה *אין* כאן רשימת קבצים לשמירה מראש (precache).
   כל 27 קבצי ה-JS/CSS נטענים ממילא בכל פתיחה של האפליקציה, ולכן אחרי
   ביקור מוצלח אחד הם כבר במטמון. רשימה ידנית הייתה עוד מקום לשכוח
   לעדכן — ומקום כזה תמיד נשכח. */

self.addEventListener("install", function () {
  self.skipWaiting();   // גרסה חדשה לא מחכה בתור; ר' pwa.js לתזמון הרענון
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    // ניקוי: מוחקים מהמטמון רק קבצים שגרסתם באמת התחלפה (ר' isStaleAsset_).
    // ערכים בלי ?v= (כמו index.html) נשארים — הם לא נושאים גרסה.
    try {
      var cache = await caches.open(CACHE);
      var keys  = await cache.keys();
      await Promise.all(keys.map(function (req) {
        return isStaleAsset_(new URL(req.url)) ? cache.delete(req) : null;
      }));
      // מטמונים ישנים בשמות אחרים (אם אי פעם נשנה את CACHE)
      var names = await caches.keys();
      await Promise.all(names.map(function (n) {
        return n !== CACHE ? caches.delete(n) : null;
      }));
    } catch (err) { /* ניקוי הוא נוחות, לא קריטי */ }
    await self.clients.claim();
  })());
});

self.addEventListener("message", function (e) {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isAppShellDoc(req, url) {
  return req.mode === "navigate" ||
         url.pathname.endsWith("/") ||
         url.pathname.endsWith("/index.html");
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;                 // כתיבות — לא נוגעים

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  // כלל 3: כל מה שאינו מהאתר שלנו (Apps Script, גוגל, גופנים) — ישר לרשת,
  // בלי מטמון ובלי התערבות.
  if (url.origin !== self.location.origin) return;

  // כלל 2: מסמך האפליקציה — רשת קודם, מטמון רק כגיבוי כשאין רשת.
  if (isAppShellDoc(req, url)) {
    e.respondWith((async function () {
      try {
        /* (2026-09-07) cache:"reload" — בלעדיו fetch(req) עובר קודם דרך מטמון
           ה-HTTP של הדפדפן, ש-GitHub Pages מורה לו להחזיק את index.html
           למשך 10 דקות. התוצאה: גם "רשת קודם" החזיר מסמך ישן, ומספרי ה-?v=
           החדשים לא הגיעו — כלומר עדכון שכבר עלה לאוויר לא נראה עד שהמטמון
           פג. עכשיו הבקשה מדלגת על מטמון הדפדפן וניגשת לשרת בפועל. */
        var fresh = await fetch(new Request(req.url, {
          cache: "reload", credentials: "same-origin"
        }));
        var cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        var hit = await caches.match(req);
        if (hit) return hit;
        var root = await caches.match("index.html");
        if (root) return root;
        throw err;
      }
    })());
    return;
  }

  // כלל 1: שאר הקבצים של האתר — מטמון קודם, ומילוי המטמון ברקע.
  e.respondWith((async function () {
    var hit = await caches.match(req);
    if (hit) return hit;
    var res = await fetch(req);
    // רק תשובות תקינות ומלאות נשמרות (לא שגיאות, לא תשובות חלקיות)
    if (res && res.status === 200 && res.type === "basic") {
      var cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
/* Push notifications (16.9.26) — הודעה שמגיעה כש-האפליקציה/הטאב סגורים.
   בכוונה בלי firebase-messaging-sw.js נפרד — אותו service worker קיים,
   אותו scope, מטפל גם בזה. */
self.addEventListener("push", function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  var n = data.notification || {};
  var title = n.title || "ניהול קהילה";
  var opts = {
    body: n.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    data: data.data || {}
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

/* 23.9 — מרכז ההתראות: לחיצה על פוש פותחת את המסך שנבחר בטבלה
   (data.screen). חלון פתוח — מקבל הודעה ומנווט בלי טעינה מחדש;
   אין חלון — נפתח עם ?go=<מסך>, ו-app.js מנווט אחרי הכניסה. */
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var d = (e.notification && e.notification.data) || {};
  var screen = /^[A-Za-z]{2,40}$/.test(String(d.screen || "")) ? String(d.screen) : "";
  var url = "/CBA-Community-Budget-App/" + (screen ? "?go=" + screen : "");
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ("focus" in list[i]) {
        if (screen) { try { list[i].postMessage({ type: "cba-go", screen: screen }); } catch (err) {} }
        return list[i].focus();
      }
    }
    if (clients.openWindow) return clients.openWindow(url);
  }));
});
