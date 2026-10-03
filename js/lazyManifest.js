/* js/lazyManifest.js — אילו קבצים נטענים רק לפי דרישה (3.10.2026, אושר ע"י יועד)
   ================================================================
   מה זה, בשפה פשוטה: עד היום כל 66 קבצי ה-JS (3.4MB) נטענו לכל מי שפתח את
   האפליקציה — גם תושב שלעולם לא יראה "ניהול הוצאות", וגם מנהל שנכנס לתקציב
   פעם בשבוע. הקבצים שכאן (כ-1.1MB) נטענים רק כשמנווטים למסך שצריך אותם.

   כל קבוצה נטענת **כיחידה אחת ובסדר הזה** (הסדר הוא בדיוק הסדר שהיה
   ב-index.html — יש תלויות בין הקבצים בתוך קבוצה). קבוצות שונות אינן
   תלויות זו בזו, חוץ מהקריאות השמורות שמסומנות ב-js/lazy.js.

   screens — שמות המסכים (CBA.screens.<שם>) שהקבוצה מגדירה. app.js (showScreen)
   רואה מסך חסר, מוצא כאן את הקבוצה שלו, טוען, ומצייר.

   ⚠️ ה-?v= כאן הוא טביעת אצבע של כל קובץ — **לא לערוך ידנית**:
      `node tools/stamp-versions.js` מעדכן אותו יחד עם index.html ו-service-worker.js.
   ⚠️ קובץ שמוסיפים לכאן חייב לרדת מ-index.html (ולהפך). test-lazy-groups בודק.
   ⚠️ מי שמשתמש בייצוא של קובץ מתוך קבוצה (CBA.screens.expenses.showPending,
      CBA.gardenOpenCard, CBA.screens.servicesAdmin) חייב לעבור דרך
      CBA.lazy.load(...) או לבדוק קיום — ר' הערות במקומות עצמם. */
window.CBA = window.CBA || {};
CBA.lazyManifest = {
  budget: {
    label: "תקציב",
    perms: ["תקציב"],
    screens: ["budget", "expenses", "planning", "reconcile"],
    files: [
      "js/screens/budget.js?v=5fbc7244f5",
      "js/screens/expenses.js?v=1d93311741",
      "js/screens/notes.js?v=04bc8dece4",
      "js/screens/planning.js?v=22607620df",
      "js/screens/reconcile.js?v=8a59cd1261"
    ]
  },
  facilities: {
    label: "מתקנים ושירותים",
    perms: ["מועדון", "מכון", "WeWork", "שירותים"],
    screens: ["clubAdmin", "gymAdmin", "weworkAdmin", "servicesAdmin"],
    files: [
      "js/screens/clubAdmin.js?v=2762c48dbf",
      "js/screens/gymAdmin.js?v=3516f2131a",
      "js/screens/doorAdmin.js?v=9c1b798a5b",
      "js/screens/weworkAdmin.js?v=794ed62ea8",
      "js/screens/servicesAdmin.js?v=4c6fe01239",
      "js/screens/servicesCategoriesAdmin.js?v=23bff879f4"
    ]
  },
  people: {
    label: "תושבים ומערכת",
    perms: ["תושבים"],
    screens: ["residents", "emailSettings", "appReports", "sysStatus", "sysHub"],
    files: [
      "js/screens/residents.js?v=9ebc66c05d",
      "js/screens/emailSettings.js?v=a0cb23db5a",
      "js/screens/appReports.js?v=a47450bd91",
      "js/screens/sysStatus.js?v=af5674e9b1",
      "js/screens/sysHub.js?v=b8e3ea99b4"
    ]
  },
  gardenAdmin: {
    label: "ניהול הגינון",
    perms: ["גינון"],
    screens: ["gardenTasks", "gardenInbox", "gardenPlan", "gardenStats"],
    files: [
      "js/data/gardenSlots.js?v=1b715264ff",
      "js/screens/gardenPlan.js?v=ea51dc59c9",
      "js/screens/gardenStats.js?v=9409f96dca",
      "js/screens/gardenSchedule.js?v=861d4bba6f",
      "js/screens/gardenScheduleAi.js?v=4a2f2ab9f6",
      "js/screens/gardenTasks.js?v=43f85ceec7"
    ]
  }
};
