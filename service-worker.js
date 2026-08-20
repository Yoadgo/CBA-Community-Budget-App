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

   ⚠️ בכל דיפלוי שמשנה JS/CSS: לעדכן את VERSION כאן *ואת* כל ה-?v=
      ב-index.html לאותו ערך בדיוק. שני המספרים חייבים להיות זהים.  */

var VERSION = "20260820c";
var CACHE   = "cba-app";

/* הערה על השיטה: בכוונה *אין* כאן רשימת קבצים לשמירה מראש (precache).
   כל 27 קבצי ה-JS/CSS נטענים ממילא בכל פתיחה של האפליקציה, ולכן אחרי
   ביקור מוצלח אחד הם כבר במטמון. רשימה ידנית הייתה עוד מקום לשכוח
   לעדכן — ומקום כזה תמיד נשכח. */

self.addEventListener("install", function () {
  self.skipWaiting();   // גרסה חדשה לא מחכה בתור; ר' pwa.js לתזמון הרענון
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    // ניקוי: מוחקים מהמטמון רק מה ששייך לגרסה ישנה. ערכים בלי ?v=
    // (כמו index.html והאייקונים) נשארים — הם לא נושאים גרסה.
    try {
      var cache = await caches.open(CACHE);
      var keys  = await cache.keys();
      await Promise.all(keys.map(function (req) {
        var v = new URL(req.url).searchParams.get("v");
        return (v && v !== VERSION) ? cache.delete(req) : null;
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
        var fresh = await fetch(req);
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
