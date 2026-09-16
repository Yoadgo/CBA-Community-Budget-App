
/* בדיקות לנעילת הסנכרונים (2026-09-16).
   הרצה:  node tools/test-sync-lock.js

   מריץ את הפונקציות **האמיתיות** מ-apps-script/Code.gs מול
   LockService ו-PropertiesService מדומים.

   🔴🔴 מה המארז הזה שומר עליו — וזו סכנה שהייתה קיימת מהיום הראשון:
   כל סנכרון תשתית כותב ואז **מוחק מ-Firestore כל מה שלא נכתב
   בריצה שלו** (fsSweepOrphans_). שתי ריצות חופפות הורסות זו את זו:
   הסחיפה של הראשונה רצה אחרי שהשנייה כבר כתבה, רואה מסמכים שלא
   היו ברשימה *שלה*, ומוחקת אותם. אין שגיאה — יש מסמכים שנעלמו,
   והקורא מקבל "אין נתונים" בלי שום סימן.

   🔴 והדרישה השנייה, שקל לשבור בתיקון "פשוט": הנעילה **לא** יכולה
   להיות LockService לבדה. זו נעילה גלובלית שדרכה עוברת כל שמירת
   תנועה — עבודה שעתית שמחזיקה אותה דקה הייתה מחזירה לתושב
   "המערכת עסוקה" באמצע שליחת קבלה. סעיף 3. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const GS = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

function grab(re) { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; }

let store, lockHeld, lockWaits, now;
function makeBox() {
  store = {}; lockHeld = 0; lockWaits = []; now = 1000000;
  const box = {
    Logger: { log() {} }, String: String, Number: Number, Date: class extends Date {
      getTime() { return now; }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in store ? store[k] : null),
        setProperty: (k, v) => { store[k] = String(v); },
        deleteProperty: k => { delete store[k]; }
      })
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: ms => { lockWaits.push(ms); lockHeld++; },
        releaseLock: () => { lockHeld--; }
      })
    }
  };
  vm.createContext(box);
  vm.runInContext(
    grab(/var SYNC_LOCK_KEY = '[^']*';/) + '\n' +
    grab(/var SYNC_LOCK_MS  = [^;]*;/) + '\n' +
    grab(/function syncLockTake_\(name\) \{[\s\S]*?\n\}/) + '\n' +
    grab(/function syncLockFree_\(\) \{[\s\S]*?\n\}/) + '\n' +
    grab(/function withSyncLock_\(name, fn\) \{[\s\S]*?\n\}/), box);
  return box;
}

/* ================================================================= */
section('1. 🔴 ריצה שנייה נדחית, לא רצה במקביל');
let box = makeBox();
let ran = [];
let r1 = box.withSyncLock_('a', () => { ran.push('a'); return { ok: true, wrote: 3 }; });
ok('ריצה בודדת עוברת', r1.ok === true && r1.wrote === 3, JSON.stringify(r1));
ok('⚠️ והנעילה שוחררה אחריה', Object.keys(store).length === 0, JSON.stringify(store));

/* שנייה שמנסה **בזמן** שהראשונה רצה */
box = makeBox();
let inner = null;
box.withSyncLock_('hourlyJobs', function () {
  inner = box.withSyncLock_('gymStatusSync', () => { ran.push('nested'); return { ok: true }; });
  return { ok: true };
});
ok('🔴 ריצה שנייה בתוך הראשונה נדחית', inner && inner.busy === true, JSON.stringify(inner));
ok('🔴 והיא **לא רצה** — זה כל העניין', ran.indexOf('nested') === -1);
ok('⚠️ וההודעה אומרת מי מחזיק', /hourlyJobs/.test(inner.error), inner.error);
ok('⚠️ ו-ok:false, כדי שהקורא לא יחשוב שהצליח', inner.ok === false);
ok('⚠️ והנעילה שוחררה בסוף בכל זאת', Object.keys(store).length === 0);

section('   וגם כשהפונקציה זורקת');
box = makeBox();
let threw = false;
try { box.withSyncLock_('a', () => { throw new Error('בום'); }); } catch (e) { threw = true; }
ok('🔴 חריגה אינה משאירה נעילה תקועה', threw && Object.keys(store).length === 0,
   JSON.stringify(store));

/* ================================================================= */
section('2. ⚠️ נעילה נטושה נדרסת — אחרת ריצה שנפלה נועלת לנצח');
box = makeBox();
store['cba_sync_lock'] = 'hourlyJobs|' + (now - 11 * 60 * 1000);
let r2 = box.withSyncLock_('bootSync', () => ({ ok: true, seized: true }));
ok('🔴 נעילה בת 11 דקות נחשבת נטושה', r2.seized === true, JSON.stringify(r2));
box = makeBox();
store['cba_sync_lock'] = 'hourlyJobs|' + (now - 9 * 60 * 1000);
let r3 = box.withSyncLock_('bootSync', () => ({ ok: true, seized: true }));
ok('⚠️ אבל בת 9 דקות — עדיין חיה', r3.busy === true, JSON.stringify(r3));
/* 🔴 החסם חייב להיות מעל תקרת הריצה של Apps Script (6 דקות), אחרת
   ריצה ארוכה וחוקית הייתה נדרסת באמצע ע"י ריצה שנייה. */
ok('🔴 והחסם גדול מתקרת הריצה של Apps Script',
   box.SYNC_LOCK_MS > 6 * 60 * 1000, String(box.SYNC_LOCK_MS));

/* ================================================================= */
section('3. 🔴🔴 LockService משמשת לרגע התפיסה בלבד');
box = makeBox();
box.withSyncLock_('a', () => ({ ok: true }));
ok('נלקחה נעילת סקריפט לתפיסה', lockWaits.length === 1, JSON.stringify(lockWaits));
ok('🔴 והיא שוחררה מיד — לא מוחזקת לאורך הריצה', lockHeld === 0, String(lockHeld));
ok('⚠️ וההמתנה עליה קצרה (התפיסה היא שתי פעולות על Properties)',
   lockWaits[0] <= 5000, String(lockWaits[0]));
/* 🔴 הבדיקה הטקסטואלית: אין שום סנכרון שלוקח את נעילת הסקריפט
   ומחזיק אותה סביב כל הריצה. */
ok('🔴 ואף מטפל סנכרון אינו לוקח LockService בעצמו',
   !/function handle(GymStatus|Services|Boot|Budget|BudgetTx|Backup|GardenPlan)[A-Za-z]*_\(p\) \{[\s\S]{0,400}LockService/.test(GS));

/* ================================================================= */
section('4. כל הסנכרונים עטופים — כולל העבודה השעתית');
['gymStatusSync', 'servicesSync', 'bootSync', 'budgetSync', 'budgetTxSync',
 'backupRun', 'gardenPlanSync', 'hourlyJobs'].forEach(function (n) {
  ok("🔴 " + n + " עטוף", new RegExp("withSyncLock_\\('" + n + "'").test(GS));
});
/* ================================================================= */
section('4ב. 🔴🔴 גם מי שסוחף בלי להיות "סנכרון"');
/* `saveServices_` אינה "עוד כתיבה": היא מריצה servicesSyncAll_, כלומר
   כתיבה מלאה **ואז סחיפת יתומים** — אותו דפוס הרסני בדיוק. היא נשארה
   מחוץ לנעילה בגל הראשון ונתפסה בסקירה. */
ok('🔴 שמירת שירותים לוקחת את הנעילה',
   /withSyncLock_\('saveServices', function \(\) \{ return saveServicesRun_\(ss, body\); \}\)/.test(GS));
/* 🔴🔴 ומחוץ לנעילת הסקריפט שהגוף לוקח בעצמו: תפיסה מקוננת של אותה
   נעילה באותה ריצה היא הדרך להיתקע. */
ok('🔴🔴 ו**מחוץ** ל-LockService שהגוף לוקח — לא מקונן',
   GS.indexOf("withSyncLock_('saveServices'") < GS.indexOf('function saveServicesRun_') &&
   !/function saveServices_\(ss, body\) \{[\s\S]{0,300}LockService/.test(GS));
ok('⚠️ והגוף עצמו עדיין לוקח אותה כרגיל',
   /function saveServicesRun_\(ss, body\) \{[\s\S]{0,2000}var lock = LockService\.getScriptLock\(\);/.test(GS));
ok('🔴 והגיבוי היומי גם הוא — 08:00 של שתי העבודות חופף',
   /withSyncLock_\('dailyBackup'/.test(GS));
ok('⚠️ והוא מדלג ומתעד כשתפוס, במקום לייצר צילום קרוע',
   /if \(bk && bk\.busy\) Logger\.log\('\u05d2\u05d9\u05d1\u05d5\u05d9 \u05d9\u05d5\u05de\u05d9 \u05d3\u05d9\u05dc\u05d2/.test(GS));

/* 🔴 העבודה השעתית **מדלגת** כשתפוס ולא מנסה שוב — יש עוד אחת בעוד שעה. */
ok('🔴 והעבודה השעתית מדלגת ומתעדת במקום לנסות שוב',
   /if \(r && r\.busy\) Logger\.log\('hourlyJobs דילגה/.test(GS));
ok('⚠️ וגוף העבודה עבר לפונקציה נפרדת', /function hourlyJobsRun_\(\) \{/.test(GS));
ok('⚠️ והטריגר עדיין מצביע על hourlyJobs', /'hourlyJobs'/.test(GS));
/* 🔴 מטפל שמחזיר busy חייב להחזיר אותו ללקוח ולא "להצליח" בשקט. */
ok('🔴 וכל מטפל מחזיר את ה-busy ללקוח',
   (GS.match(/if \(r\.busy\) return json_\(r\);/g) || []).length === 6,
   String((GS.match(/if \(r\.busy\) return json_\(r\);/g) || []).length));
/* bootSync מחזיר את r כמו שהוא, ולכן busy עובר ממילא. */
ok('⚠️ ו-bootSync מחזיר את התוצאה כמו שהיא, כך ש-busy עובר גם שם',
   /withSyncLock_\('bootSync'[\s\S]{0,80}return json_\(r\);/.test(GS));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
