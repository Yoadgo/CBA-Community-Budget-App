/* js/data/firebase.js — הגשר של הדפדפן ל-Firebase   (צעד 02א, 2026-09-14)
   =======================================================================
   מה הקובץ הזה עושה, בשפה פשוטה: הוא נותן לאפליקציה *זהות* מול Firebase.
   אחרי שהשרת שלנו (Apps Script) כבר אישר את המשתמש, אנחנו לוקחים את אותו
   טוקן של גוגל ומציגים אותו גם ל-Firebase, וכך נוצר לו uid קבוע.
   ה-uid הזה הוא הגשר: בהמשך הוא יהיה המפתח ל-members/{uid} ב-Firestore,
   ודרכו חוקי האבטחה של Firestore יידעו מה מותר לו לקרוא.

   ⚠️ שלושה כללים שהקובץ הזה מחויב להם, ואסור לשבור אותם בעתיד:

   1. **הוא לעולם לא שובר כלום.** אם gstatic חסום, אם ה-SDK לא נטען, אם
      ההתחברות נכשלת — האפליקציה ממשיכה לעבוד *בדיוק* כמו היום, על
      המושב החתום של Apps Script. אין טוסט, אין דיאלוג, אין חסימה.
      כל כישלון נרשם ל-console וזהו. בשלב הזה Firebase הוא תוספת בלבד.

   2. **הוא לא נטען בעליית העמוד.** שני קבצי ה-SDK (~300KB) מוזרקים
      דינמית רק כשבאמת צריך אותם — כלומר אחרי התחברות מוצלחת, כשהמסך
      כבר מצויר. מהירות הפתיחה היא הסיבה שבגללה התחלנו את כל המעבר הזה;
      לא נשלם עליה במטבע של 300KB חוסמים.

   3. **הקונפיגורציה כאן אינה סוד.** apiKey של Firebase הוא מזהה ציבורי,
      לא סיסמה — הוא מופיע בכל אפליקציית ווב של Firebase בעולם. מה ששומר
      על הנתונים הוא חוקי האבטחה של Firestore, לא הסתרת המפתח. (המפתח
      *הפרטי* של חשבון השירות, לעומת זאת, יושב רק ב-Script Properties
      ולעולם לא בריפו הזה.)

   בדיקה ידנית מה-console:  CBA.fb.selfTest()
   ========================================================================= */

window.CBA = window.CBA || {};

CBA.fb = (function () {
  "use strict";

  var SDK_VERSION = "11.10.0";
  var SDK = [
    "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/firebase-auth-compat.js"
  ];
  /* ⚠️ **קובץ שלישי, ובכוונה לא ברשימה למעלה.** הוא מוזרק רק כשמסך
     באמת צריך לקרוא מ-Firestore (צעד 03ג), כדי שהתחברות לבדה לא תשלם
     עליו. ר' כלל 2 בראש הקובץ. */
  var SDK_DB = "https://www.gstatic.com/firebasejs/" + SDK_VERSION + "/firebase-firestore-compat.js";

  /* מזהים ציבוריים של פרויקט AtmoSync — ר' הערה 3 למעלה. */
  var CONFIG = {
    apiKey:            "AIzaSyC548H-lJj3p7ppYfD_ekcMwJ-g7qOoyPw",
    authDomain:        "atmosync03030.firebaseapp.com",
    projectId:         "atmosync03030",
    storageBucket:     "atmosync03030.firebasestorage.app",
    messagingSenderId: "835121923502",
    appId:             "1:835121923502:web:d08b64d35eb5a5ad8e343f"
  };

  var LOAD_TIMEOUT_MS = 15000;

  var state = {
    loading: false,
    loaded: false,
    initErr: null,
    lastError: null,
    user: null,         // { uid, email } אחרי התחברות מוצלחת
    authKnown: false,   // האם onAuthStateChanged כבר דיווח פעם אחת
    dbLoading: false,
    dbLoaded: false,
    dbErr: null,
    flags: null        // appConfig/flags — null = עדיין לא נקרא/לא ניתן לקרוא
  };
  var waiters = [];     // מי שביקש את ה-SDK בזמן שהוא עוד בדרך
  var dbWaiters = [];
  var authWaiters = [];

  function log(msg, extra) {
    try { console.log("[CBA.fb] " + msg, extra === undefined ? "" : extra); } catch (e) {}
  }

  /* ---------- טעינת ה-SDK ---------- */

  function injectScript(src, cb) {
    var s = document.createElement("script");
    var done = false;
    function finish(err) { if (!done) { done = true; cb(err); } }
    s.src = src;
    s.async = true;
    s.onload  = function () { finish(null); };
    s.onerror = function () { finish(new Error("טעינת " + src + " נכשלה")); };
    document.head.appendChild(s);
  }

  function injectAll(list, i, cb) {
    if (i >= list.length) return cb(null);
    injectScript(list[i], function (err) {
      if (err) return cb(err);
      injectAll(list, i + 1, cb);
    });
  }

  function settle(err) {
    state.loading = false;
    state.loaded = !err;
    state.initErr = err || null;
    var list = waiters; waiters = [];
    list.forEach(function (fn) { try { fn(err); } catch (e) {} });
  }

  /** מוודא ש-SDK טעון ומאותחל. cb(err). בטוח לקריאה חוזרת. */
  function ensure(cb) {
    cb = cb || function () {};
    if (state.loaded) return cb(null);
    if (state.initErr) return cb(state.initErr);   // נכשל כבר — לא מנסים שוב ושוב
    waiters.push(cb);
    if (state.loading) return;
    state.loading = true;

    /* שעון עצר: אם gstatic פשוט לא עונה, אנחנו לא רוצים משתמש שממתין
       לנצח לקולבק שלא יגיע. אחרי 15 שניות מדווחים כישלון ומשחררים. */
    var timer = setTimeout(function () {
      timer = null;
      settle(new Error("פסק זמן בטעינת Firebase SDK"));
    }, LOAD_TIMEOUT_MS);

    injectAll(SDK, 0, function (err) {
      if (!timer) return;                 // כבר הוכרז פסק זמן
      clearTimeout(timer); timer = null;
      if (err) { log("SDK לא נטען: " + err.message); return settle(err); }
      try {
        if (!window.firebase.apps.length) window.firebase.initializeApp(CONFIG);
        /* ⚠️ מאזין מצב, ולא רק signIn: ל-Firebase יש persistence מקומי, ולכן
           אחרי רענון עמוד המשתמש כבר מחובר — אבל state.user שלנו היה ריק,
           כי הוא מתמלא רק במסלול signIn. בלי השורות האלה CBA.fb.uid() היה
           מחזיר null למשתמש מחובר לגמרי, וזה היה נראה כמו באג בצעד הבא. */
        window.firebase.auth().onAuthStateChanged(function (u) {
          state.user = u ? { uid: u.uid, email: u.email || "" } : null;
          /* 🔑 **הדיווח הראשון הוא הרגע שבו מותר להסיק "אין משתמש".**
             לפניו `uid()` מחזיר null גם למשתמש מחובר לגמרי, כי Firebase
             עדיין משחזר את המושב מהאחסון המקומי. מי שיחליט לפי זה
             על "נפילה לאחור" ייפול לאחור בכל רענון עמוד, בלי שישום דבר שבור. */
          state.authKnown = true;
          var list = authWaiters; authWaiters = [];
          list.forEach(function (fn) { try { fn(state.user); } catch (e) {} });
        });
        log("SDK מוכן, גרסה " + SDK_VERSION);
        settle(null);
      } catch (e) {
        log("אתחול נכשל: " + e.message);
        settle(e);
      }
    });
  }

  /* ---------- התחברות ---------- */

  /** מתחבר ל-Firebase עם טוקן הזהות של גוגל (אותו טוקן שהשרת כבר אימת).
      cb(err, { uid, email }). כישלון אינו שובר דבר — ר' כלל 1. */
  function signIn(googleIdToken, cb) {
    cb = cb || function () {};
    if (!googleIdToken) return cb(new Error("אין טוקן גוגל"));
    ensure(function (err) {
      if (err) { state.lastError = err; return cb(err); }
      try {
        var auth = window.firebase.auth();
        var cred = window.firebase.auth.GoogleAuthProvider.credential(googleIdToken);
        auth.signInWithCredential(cred).then(function (res) {
          state.user = { uid: res.user.uid, email: res.user.email || "" };
          state.lastError = null;
          log("מחובר ל-Firebase", state.user);
          cb(null, state.user);
        })["catch"](function (e) {
          state.lastError = e;
          /* השגיאה הצפויה אם משהו בקונסולה לא הוגדר היא
             auth/invalid-credential או audience mismatch. רושמים ומשחררים. */
          log("התחברות נכשלה: " + (e && (e.code || e.message)));
          cb(e);
        });
      } catch (e) { state.lastError = e; log("חריגה: " + e.message); cb(e); }
    });
  }

  function signOut() {
    state.user = null;
    try {
      if (state.loaded && window.firebase && window.firebase.apps.length) {
        window.firebase.auth().signOut()["catch"](function () {});
      }
    } catch (e) {}
  }

  /** טוקן הזהות של Firebase עצמו — יידרש בצעד 02ג לאימות מול השרת. */
  function idToken(cb) {
    cb = cb || function () {};
    if (!state.loaded || !window.firebase) return cb(new Error("Firebase לא טעון"));
    var u = window.firebase.auth().currentUser;
    if (!u) return cb(new Error("אין משתמש מחובר"));
    u.getIdToken().then(function (t) { cb(null, t); })["catch"](function (e) { cb(e); });
  }

  /* ---------- קריאה ישירה מ-Firestore   (צעד 03ג) ---------- */

  /** מחכה עד שידוע **בוודאות** אם יש משתמש מחובר. cb(user|null).
   *  ⚠️ בלי זה כל רענון עמוד היה נראה כמו "לא מחובר". */
  function authReady(cb, timeoutMs) {
    cb = cb || function () {};
    ensure(function (err) {
      if (err) return cb(null);
      if (state.authKnown) return cb(state.user);
      var done = false;
      var t = setTimeout(function () {
        if (done) return;
        done = true;
        cb(state.user);           // מה שידוע עד כה, ולא המתנה לנצח
      }, timeoutMs || 4000);
      authWaiters.push(function (u) {
        if (done) return;
        done = true; clearTimeout(t);
        cb(u);
      });
    });
  }

  /** מוודא שמודול Firestore טעון. cb(err). */
  function ensureDb(cb) {
    cb = cb || function () {};
    if (state.dbLoaded) return cb(null);
    if (state.dbErr) return cb(state.dbErr);
    dbWaiters.push(cb);
    if (state.dbLoading) return;
    state.dbLoading = true;

    ensure(function (err) {
      if (err) return settleDb(err);
      var timer = setTimeout(function () {
        timer = null;
        settleDb(new Error("פסק זמן בטעינת Firestore"));
      }, LOAD_TIMEOUT_MS);
      injectScript(SDK_DB, function (e2) {
        if (!timer) return;
        clearTimeout(timer); timer = null;
        if (e2) { log("Firestore לא נטען: " + e2.message); return settleDb(e2); }
        try {
          window.firebase.firestore();
          log("Firestore מוכן");
          /* 🔑 **דגלי זמן ריצה נקראים כאן, לפני הקריאה הראשונה.**
             אחרת מתג כיבוי לא היה תופס את הקריאה הראשונה של כל טעינת עמוד —
             ובדיוק הקריאה הזו היא שמגיעה למשתמש.
             🔴 **כישלון כאן אינו מפיל את ensureDb.** דגל שאי-אפשר לקרוא
             אסור שיהפוך לנקודת כשל חדשה; נופלים לברירות המחדל שבקוד. */
          loadFlags(function () { settleDb(null); });
        } catch (e3) { log("אתחול Firestore נכשל: " + e3.message); settleDb(e3); }
      });
    });
  }

  /** קריאה חד-פעמית של מסמך הדגלים. לעולם אינה מעבירה שגיאה הלאה. */
  function loadFlags(done) {
    var fired = false;
    function finish() { if (fired) return; fired = true; done(); }
    var t = setTimeout(finish, 4000);
    try {
      window.firebase.firestore().collection("appConfig").doc("flags").get()
        .then(function (d) {
          state.flags = d.exists ? (d.data() || {}) : {};
          log("דגלי זמן ריצה", state.flags);
          clearTimeout(t); finish();
        })["catch"](function (e) {
          log("קריאת דגלים נכשלה: " + (e && (e.code || e.message)));
          clearTimeout(t); finish();
        });
    } catch (e) { clearTimeout(t); finish(); }
  }

  /** ערך הדגל, או ברירת המחדל שבקוד אם אינו ידוע. */
  function flag(key, dflt) {
    if (!state.flags || !(key in state.flags)) return !!dflt;
    return state.flags[key] === true;
  }

  function settleDb(err) {
    state.dbLoading = false;
    state.dbLoaded = !err;
    state.dbErr = err || null;
    var list = dbWaiters; dbWaiters = [];
    list.forEach(function (fn) { try { fn(err); } catch (e) {} });
  }

  /* 🔴 **כל קריאה עוברת דרך שעון עצר.** רשת איטית או כלל אבטחה שתוקע
     אינם רשאיים להשאיר מסך תלוי — אחרי הפסק נופלים חזרה ל-Apps Script. */
  var READ_TIMEOUT_MS = 6000;

  function withTimeout(cb, ms) {
    var done = false;
    var t = setTimeout(function () {
      if (done) return;
      done = true;
      cb(new Error("פסק זמן בקריאה מ-Firestore"));
    }, ms || READ_TIMEOUT_MS);
    return function (err, data) {
      if (done) return;
      done = true; clearTimeout(t);
      cb(err, data);
    };
  }

  /** קורא אוסף שלם. cb(err, [{ id, ...data }]). */
  function readCollection(name, cb) {
    cb = withTimeout(cb || function () {});
    ensureDb(function (err) {
      if (err) return cb(err);
      try {
        window.firebase.firestore().collection(name).get().then(function (snap) {
          var out = [];
          snap.forEach(function (d) {
            var o = d.data() || {};
            o.id = o.id || d.id;
            out.push(o);
          });
          cb(null, out);
        })["catch"](function (e) { state.lastError = e; cb(e); });
      } catch (e) { state.lastError = e; cb(e); }
    });
  }

  /** קורא מסמך בודד. cb(err, data|null). */
  function readDoc(collection, id, cb) {
    cb = withTimeout(cb || function () {});
    ensureDb(function (err) {
      if (err) return cb(err);
      try {
        window.firebase.firestore().collection(collection).doc(id).get().then(function (d) {
          cb(null, d.exists ? (d.data() || {}) : null);
        })["catch"](function (e) { state.lastError = e; cb(e); });
      } catch (e) { state.lastError = e; cb(e); }
    });
  }

  /* ---------- בדיקה עצמית ---------- */

  function selfTest() {
    var out = [];
    function say(s) { out.push(s); log(s); }
    say("— בדיקת CBA.fb —");
    say("SDK טעון: " + (state.loaded ? "כן" : "לא"));
    if (state.initErr) say("שגיאת טעינה: " + state.initErr.message);
    say("פרויקט: " + CONFIG.projectId);
    say("משתמש: " + (state.user ? state.user.uid + " / " + state.user.email : "לא מחובר"));
    if (state.lastError) say("שגיאה אחרונה: " + (state.lastError.code || state.lastError.message));
    return out.join("\n");
  }

  return {
    config:   CONFIG,
    version:  SDK_VERSION,
    ensure:   ensure,
    ensureDb: ensureDb,
    authReady: authReady,
    readCollection: readCollection,
    readDoc:  readDoc,
    signIn:   signIn,
    signOut:  signOut,
    idToken:  idToken,
    uid:      function () { return state.user ? state.user.uid : null; },
    isReady:  function () { return state.loaded; },
    isDbReady: function () { return state.dbLoaded; },
    flag:     flag,
    flags:    function () { return state.flags; },
    state:    function () { return { loaded: state.loaded, user: state.user,
                                     initErr: state.initErr && state.initErr.message,
                                     lastError: state.lastError && (state.lastError.code || state.lastError.message) }; },
    selfTest: selfTest
  };
})();
