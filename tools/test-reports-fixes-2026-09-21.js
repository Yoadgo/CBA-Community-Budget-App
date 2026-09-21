/* תיקוני הדיווחים מהגיליון  (2026-09-21) — #10 ו-#8/#9
   הרצה:  node tools/test-reports-fixes-2026-09-21.js */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DS = R('js/data/dataService.js');
const EX = R('js/screens/expenses.js');
const RU = R('firestore.rules');

section('1. 🔴🔴 דיווח #10 — הסטטוס לא נשמר באישור דרך חלון הסיווג');
/* השורש: updateTransaction בוחר מסלול לפי השדות. ארבעה שדות ≠ "סטטוס בלבד",
   ולכן נפלו למסלול הפרטים — שאינו כותב סטטוס, כי הכלל אוסר זאת. */
ok('🔑 txStatusOnly מתיר status ו-reviewNote בלבד — זה מה שקבע את המסלול',
   /if \(ks\[i\] !== "status" && ks\[i\] !== "reviewNote"\) return false;/.test(DS));
ok('🔑 וכלל האבטחה באמת אינו מתיר סטטוס בעדכון פרטים',
   !/'סטטוס'/.test((RU.match(/function txDetailsUpdateOk[\s\S]*?\n    \}/) || [''])[0]));
const mo = (EX.match(/function txOpenClassifyModal[\s\S]*?\n\}/) || [''])[0];
ok('🔴 החלון כותב בשתי קריאות ולא באחת',
   /updateTransaction\(t\.id, \{ categoryId: cat, subItemId: sub \|\| "" \}\);/.test(mo) &&
   /updateTransaction\(t\.id, \{ status: "ready", reviewNote: "" \}\);/.test(mo), mo);
ok('🔴 והסיווג נכתב **לפני** הסטטוס — כישלון משאיר "ממתינה עם סעיף", לא "בהנה\"ח בלי סעיף"',
   mo.indexOf('categoryId: cat, subItemId') < mo.indexOf('status: "ready", reviewNote'), mo);
ok('⚠️ והקריאה המשולבת הישנה לא נשארה בקוד',
   !/categoryId: cat, subItemId: sub \|\| "", status: "ready"/.test(EX));
ok('⚠️ הכתיבה השנייה היא "סטטוס בלבד" ולכן תיפול למסלול הנכון',
   /\{ status: "ready", reviewNote: "" \}/.test(mo), mo);

section('2. דיווחים #8/#9 — הפעמון ספר רק את השנה שעל המסך');
const ac = (DS.match(/function getAlertCounts[\s\S]*?\n  \}/) || [''])[0];
ok('🔴 הספירה עוברת על כל השנים שנטענו', /CBA\.mock\.years/.test(ac), ac);
ok('⚠️ ולא על תכונת הגישה של השנה הנוכחית',
   !/const all = getTransactions\(\);/.test(ac), ac);
ok('⚠️ מזהה כפול בין שנים אינו נספר פעמיים', /if \(seen\[k\]\) return;/.test(ac), ac);
ok('⚠️ ויש נפילה לאחור אם המבנה משתנה', /catch \(e\) \{[\s\S]{0,200}getTransactions\(\)/.test(ac), ac);
/* 🔑 זה מה שהוכיח את השורש: transactions היא accessor לשנה הנוכחית בלבד. */
ok('🔑 התיעוד של השורש — accessor לשנה הנוכחית',
   /return CBA\.mock\.years\[CBA\.mock\.currentYear\]\[k\];/.test(R('js/data/mock.js')));

section('3. 🔴🔴 תקלות 21 ו-22 — דיווח תושב שנראה כמשימת שגרה');
/* הדפדפן כתב `kind: "תקלה"` (הערך הישן) והמסך משווה מול
   `"דיווח תושב"`. השרת ממפה ביניהם, הלקוח לא — ולכן כל
   דיווח מאז 18.9 נראה למנהל כמשימה רגילה של השבוע. */
ok('🔴 הדפדפן כותב את הערך הקנוני',
   /id: String\(taskId\), kind: GARDEN_KIND_REPORT,/.test(DS));
ok('⚠️ והערך הישן לא נשאר בכתיבה', !/kind: "תקלה"/.test(DS));
ok('🔑 והקריאה ממפה מסמכים קיימים — בלי לגעת בנתונים',
   /if \(GARDEN_KIND_LEGACY\[t\.kind\]\) t\.kind = GARDEN_KIND_LEGACY\[t\.kind\];/.test(DS));
ok('והמפה זהה לשרת',
   /GARDEN_KIND_LEGACY = \{ "תקלה": GARDEN_KIND_REPORT \}/.test(DS) &&
   /GARDEN_KIND_LEGACY = \{ 'תקלה': GARDEN_KIND_REPORT \}/.test(R('apps-script/Code.gs')));
ok('והמסך עדיין משווה מול הערך הקנוני',
   /var GK_REPORT\s*=\s*"דיווח תושב";/.test(R('js/screens/gardenTasks.js')));

section('4. דיווח #6 — מצב ההתראות מהשרת');
const PU = R('js/data/push.js');
const sy = (PU.match(/function syncFromServer[\s\S]*?\n  \}/) || [''])[0];
ok('syncFromServer קיימת ומיוצאת', !!sy && /syncFromServer: syncFromServer,/.test(PU));
ok('🔴 הרשאת הדפדפן מנצחת — בלי granted המצב כבוי',
   /Notification\.permission !== "granted"/.test(sy) && /markSubscribed\(false\)/.test(sy), sy);
ok('ואחרת נקרא המנוי של המשתמש מ-Firestore',
   /readDoc\("pushSubscriptions", uid/.test(sy), sy);
ok('⚠️ וכשל קריאה משאיר את המצב כמו שהוא',
   /if \(err\) return cb\(isSubscribed\(\)\);/.test(sy), sy);
const pr = (RU.match(/match \/pushSubscriptions\/\{uid\}[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 והכלל מתיר לכל אחד את שלו בלבד',
   /allow read: if signedIn\(\) && request\.auth\.uid == uid;/.test(pr), pr);
ok('🔑 והכתיבה נשארה בשרת', /allow write: if false;/.test(pr), pr);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
