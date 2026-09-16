/* js/data/push.js — Push notifications (FCM) ל-"ניהול קהילה"
   ================================================================
   אפיון: [[cba-push-notifications-spec]] בזיכרון הפרויקט.
   קובץ עצמאי וחדש — לא נוגע בשום קובץ קיים. נטען רק אחרי שמוסיפים
   את תג ה-<script> ב-index.html (עוד לא נעשה, ר' חבילת ההכנה).

   מה הקובץ הזה עושה, בשפה פשוטה:
   1. שואל את הדפדפן הרשאת התראות (רק בלחיצה יזומה של התושב — אף פעם לא
      בפתיחת האפליקציה, כדי לא "לשרוף" את הבקשה היחידה שיש לנו ב-iOS).
   2. אם אושר — מבקש מ-Firebase "טוקן מכשיר" (FCM token) דרך ה-SDK
      שכבר טעון (firebase.js).
   3. שולח את הטוקן ל-Apps Script (doPost, action=savePushSubscription)
      עם idToken של Firebase — בדיוק כמו firebaseLink הקיים — כדי
      שהשרת יוכל לאמת מי זה *בלי לסמוך על מה שהלקוח טוען שהוא*.
   4. יודע גם לבטל מנוי (action=removePushSubscription).

   מה הקובץ הזה *לא* עושה: לא מחליט מתי לשלוח Push לתושב — זה בצד
   השרת בלבד (Code.gs / sendPush_), בדיוק כמו מיילים.
   ================================================================ */
window.CBA = window.CBA || {};

(function () {
  "use strict";

  /* firebase.js (CBA.fb) טוען app-compat + auth-compat בהתחברות, ו-
     firestore-compat רק כשמסך צריך אותו — messaging-compat *לא* ברשימה
     שלו בכלל (ר' firebase.js, "קובץ שלישי, ובכוונה לא ברשימה"). לכן
     טוענים אותו כאן, עצמאית, ורק כשבאמת מבקשים להירשם — לא בעליית העמוד.
     ⚠️ לשמור SDK_VERSION זהה ל-firebase.js בכל עדכון גרסת SDK. */
  var SDK_VERSION = "11.10.0";
  var MSG_SDK = "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/firebase-messaging-compat.js";
  var msgSdkPromise = null;
  function loadMessagingSdk() {
    if (window.firebase && firebase.messaging) return Promise.resolve();
    if (msgSdkPromise) return msgSdkPromise;
    msgSdkPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = MSG_SDK;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("טעינת ספריית ההתראות נכשלה")); };
      document.head.appendChild(s);
    });
    return msgSdkPromise;
  }

  var SUPPORTED = !!(window.Notification && navigator.serviceWorker && window.firebase);

  function isIOS() {
    return window.CBA.pwa && CBA.pwa.isIOS ? CBA.pwa.isIOS() : /iP(hone|od|ad)/.test(navigator.userAgent);
  }
  function isStandalone() {
    return window.CBA.pwa && CBA.pwa.isStandalone ? CBA.pwa.isStandalone() : false;
  }

  /* ב-iOS, Push עובד רק באפליקציה מותקנת (Home Screen), ורק מ-iOS 16.4+.
     בכל מקרה אחר (טאב ספארי רגיל) הבקשה תיכשל בשקט ותיראה כמו תקלה —
     לכן בודקים כאן ומחזירים סיבה ברורה, לפני שנוגעים ב-Notification API. */
  function canOffer() {
    if (!SUPPORTED) return { ok: false, reason: "הדפדפן הזה לא תומך בהתראות" };
    if (isIOS() && !isStandalone()) return { ok: false, reason: "באייפון צריך קודם להתקין את האפליקציה (תפריט המשתמש ← התקנת האפליקציה)" };
    if (Notification.permission === "denied") return { ok: false, reason: "ההתראות חסומות בהגדרות הדפדפן/המכשיר — אי אפשר לבקש שוב מכאן" };
    return { ok: true };
  }

  function isSubscribed() {
    try { return localStorage.getItem("cba_push_subscribed_v1") === "1"; } catch (e) { return false; }
  }
  function markSubscribed(v) {
    try { localStorage.setItem("cba_push_subscribed_v1", v ? "1" : "0"); } catch (e) { /* לא קריטי */ }
  }

  /* מפתח VAPID הציבורי — נוצר בקונסולת Firebase 16.9.26 (Project settings ←
     Cloud Messaging ← Web configuration ← Web Push certificates). לא סוד:
     מפתח ציבורי בלבד, מותר בקוד לקוח. */
  var VAPID_PUBLIC_KEY = "BA94fkcRLt7L3TiKLb9elO7GMIZJTZRoANVsRbfYyaT2m2RzOIdBJ-MdZYNm_ZguwjPwa8mn7mHUD-iqGr-TgK8";

  function subscribe() {
    var gate = canOffer();
    if (!gate.ok) return Promise.reject(new Error(gate.reason));
    if (!VAPID_PUBLIC_KEY) return Promise.reject(new Error("חסר מפתח VAPID — שלב הכנה שטרם הושלם"));

    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("ההרשאה לא ניתנה");
      return loadMessagingSdk();
    }).then(function () {
      return navigator.serviceWorker.ready;
    }).then(function (reg) {
      // ⚠️ בכוונה *לא* firebase-messaging-sw.js נפרד — משתמשים ב-service-worker.js
      // הקיים (רישום יחיד, אותו scope). האזנה לאירוע push עצמו נוספת שם,
      // לא כאן — ר' חבילת ההכנה, תוספת ל-service-worker.js.
      var messaging = firebase.messaging();
      return messaging.getToken({ vapidKey: VAPID_PUBLIC_KEY, serviceWorkerRegistration: reg });
    }).then(function (token) {
      if (!token) throw new Error("לא התקבל טוקן מכשיר");
      var user = firebase.auth().currentUser;
      if (!user) throw new Error("צריך להיות מחובר כדי להפעיל התראות");
      return user.getIdToken().then(function (idToken) {
        return new Promise(function (resolve, reject) {
          // action=savePushSubscription — עוד לא קיים בשרת, ר' חבילת ההכנה.
          // idToken: כמו firebaseLink הקיים, השרת מאמת אותו מול גוגל ולא
          // סומך על מה שהלקוח טוען שה-uid שלו.
          CBA.sheets.postRead("savePushSubscription", { idToken: idToken, token: token }, function (res) {
            if (!res || res.ok !== true) reject(new Error((res && res.error) || "השמירה נכשלה"));
            else resolve(res);
          });
        });
      });
    }).then(function () {
      markSubscribed(true);
      return true;
    });
  }

  function unsubscribe() {
    var user = firebase.auth && firebase.auth().currentUser;
    if (!user) { markSubscribed(false); return Promise.resolve(true); }
    return user.getIdToken().then(function (idToken) {
      return new Promise(function (resolve) {
        CBA.sheets.postRead("removePushSubscription", { idToken: idToken }, function () { resolve(); });
      });
    }).then(function () { markSubscribed(false); return true; });
  }

  window.CBA.push = {
    canOffer: canOffer,
    isSubscribed: isSubscribed,
    subscribe: subscribe,
    unsubscribe: unsubscribe
  };
})();
