/* מזהי גינון — מונה אחד לשני הצדדים  (2026-09-17, גל 2 · ממצא 21)
   הרצה:  node tools/test-garden-ids.js

   🔴 למה זה תנאי סף לממצא 05 ולא פריט לצידו:
   `nextGardenId_` היא max+1 מהגיליון, והיא **יורדת אחורה אחרי מחיקת שורה**.
   כל עוד הגיליון הוא הבעלים, המחיר הוא יומן שמייחס למשימה אחת אירועים של
   אחרת. ברגע שהדפדפן כותב `createDoc(id)` ישירות — מזהה ממוחזר הוא
   **כתיבה לתוך מסמך קיים**, כלומר איבוד נתונים.

   ⚠️ שלוש נקודות הקצאה בלבד נוגעות למרחב המזהים של הגינון. שלוש נוספות
      (`'T' + …` בהגדרות התוכנית, זריעת התוכנית, ודיווחי האפליקציה) הן טאבים
      אחרים ומרחבים אחרים — הבדיקה מוודאת שלא נגענו בהן בטעות. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');

section('1. 🔴 הפונקציה — מונה, עם הגיליון כרצפה בלבד');
const fn = (GS.match(/function gardenAllocId_[\s\S]*?\n\}/) || [''])[0];
ok('gardenAllocId_ קיימת', !!fn);
ok('🔴 Math.max(מונה, גיליון) + 1 — ולא מונה+1 ולא גיליון+1',
   /Math\.max\(have, sheetMax\) \+ 1/.test(fn), fn);
ok('היא קוראת מהמונה הקיים ולא בונה מנגנון שני',
   /fsDocPath_\(FS_COUNTERS, counterId\)/.test(fn), fn);
ok('⚠️ אימות חוזר אחרי הכתיבה — אין עסקאות ב-REST',
   /var back = fsGet_\(path\);[\s\S]{0,120}parseInt\(back\.n, 10\) === last/.test(fn), fn);
ok('🔴 שלושה ניסיונות, לא אחד', /attempt < 3/.test(fn), fn);
ok('מונה חסר נקרא כ--1 ולכן לא מוריד כלום', /: -1;/.test(fn), fn);

section('2. 🔴 הנפילה לאחור רועשת — כי היא מחזירה את סכנת המיחזור');
ok('שתי נקודות נפילה מתועדות', (fn.match(/CBA-ID-FALLBACK/g) || []).length === 2, fn);
ok('🔴 והנפילה היא לגיליון, במפורש', /var fb = sh \? nextGardenId_\(sh\) : 1;/.test(fn), fn);
ok('⚠️ ולא return שקט', !/return nextGardenId_\(sh\);\s*\n\}/.test(fn), fn);

section('3. שלוש נקודות ההקצאה של מרחב הגינון עברו');
ok('🔴 דיווח תושב — משימה ודיווח, שניהם מהמונה',
   /var taskId = gardenAllocId_\(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_COUNTER\);[\s\S]{0,80}var repId  = gardenAllocId_\(ss, GARDEN_REPORTS_SHEET, GARDEN_REPORT_COUNTER\);/.test(GS));
ok('🔴 משימת שגרה (gardenMaterializeWeek_) — מהמונה, ובבלוק',
   /var nextId = gardenAllocId_\(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_COUNTER, todo\.length\);/.test(GS));
ok('🔴 משימה שמנהל פותח ידנית — מהמונה',
   /var id = gardenAllocId_\(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_COUNTER\);/.test(GS));

section('4. ⚠️ מה שבמכוון לא נגענו בו');
ok('הגדרת תוכנית עבודה נשארה על T+גיליון (מרחב אחר)',
   /var newId = 'T' \+ nextGardenId_\(sh, 'מזהה'\);/.test(GS));
ok('זריעת תוכנית העבודה נשארה', /var next = nextGardenId_\(sh, 'מזהה'\);/.test(GS));
ok('דיווחי האפליקציה נשארו על הגיליון — טאב אחר לגמרי',
   /var id = nextGardenId_\(sh\);/.test(GS));
ok('🔴 ובמרחב הגינון עצמו לא נשארה אף הקצאה ישירה מהגיליון',
   !/var (taskId|repId) = nextGardenId_/.test(GS));

section('5. התשתית שהייתה שם מראש — נעולה מפני נסיגה');
ok('seedGardenCounters_ רצה בעבודה השעתית', /seedGardenCounters_\(ss\)/.test(GS));
ok('🔴 והזריעה לעולם אינה מורידה את המונה',
   /if \(have >= max\) \{[\s\S]{0,140}continue;/.test(GS));
ok('שני שמות המונים מוגדרים במקום אחד',
   /var GARDEN_REPORT_COUNTER = 'gardenReport';/.test(GS) &&
   /var GARDEN_TASK_COUNTER   = 'gardenTask';/.test(GS));
ok('⚠️ gardenMaterializeWeek_ לוקחת נעילה — שתי ריצות חופפות כבר הקצו אותו מזהה',
   /tryLock\(10000\)/.test(GS));

section('6. 🔴 בלוק, לא מזהה בודד — שתי התקלות שנתפסו באימות החי של 149');
ok('gardenAllocId_ מקבלת גודל בלוק', /function gardenAllocId_\(ss, sheetName, counterId, count\)/.test(GS));
ok('🔴 והיא מקדמת את המונה בגודל הבלוק, לא באחד',
   /var last = first \+ k - 1;[\s\S]{0,120}fsSet_\(path, \{ n: last,/.test(fn), fn);
ok('🔴 ומחזירה את הראשון בבלוק', /return first;/.test(fn), fn);
ok('⚠️ גודל לא תקין נופל ל-1', /Math\.max\(1, parseInt\(count, 10\) \|\| 1\)/.test(fn), fn);
const mat = (GS.match(/var todo = want\.filter[\s\S]*?var add = \[\];/) || [''])[0];
ok('🔴 תוכנית העבודה מסננת לפני שהיא מקצה', !!mat && /if \(!todo\.length\) return 0;/.test(mat), mat);
ok('🔴 ההקצאה היא בגודל todo.length',
   /gardenAllocId_\(ss, GARDEN_TASKS_SHEET, GARDEN_TASK_COUNTER, todo\.length\)/.test(GS));
ok('⚠️ הסינון קרה פעם אחת — הלולאה כבר לא בודקת seen',
   /todo\.forEach\(function \(w\) \{\s*\n\s*var row = new Array/.test(GS));
ok('⚠️ ושריפת מזהה על ריצה ריקה אינה אפשרית יותר',
   GS.indexOf('if (!todo.length) return 0;') < GS.indexOf('var nextId = gardenAllocId_'));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
