/* מסך המשימות — חיצי שבוע, סדר הלהקות, ולחיצה לפרטים  (2026-09-21)
   הרצה:  node tools/test-garden-tasks-ui-2026-09-21.js

   שלושת הדיווחים של יועד: "אין אפשרות להציג שבועות נוספים", "משימה
   שממתינה לשיבוץ צריכה להיות למעלה", ו"בדסקטופ אי אפשר ללחוץ עליה
   לראות את הנתונים שלה". */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GT = R('js/screens/gardenTasks.js');
const CSS = R('css/garden.css');

section('1. חיצי השבוע חזרו');
ok('🔴 הכותרת אינה is-static יותר', !/gt-week is-static/.test(GT));
ok('חץ אחורה וחץ קדימה', /data-wk="-1"/.test(GT) && /data-wk="1"/.test(GT));
ok('⚠️ ומשתמשים באייקונים הקיימים, שכבר מכווננים ל-RTL',
   /data-wk="-1"[\s\S]{0,120}ico\("prev"\)/.test(GT) &&
   /data-wk="1"[\s\S]{0,120}ico\("next"\)/.test(GT));
ok('🔑 "היום" מופיע רק כשהחלון זז', /week !== todayKey\(\)/.test(GT) && /data-wk="0"/.test(GT));
ok('ויש לו עיצוב משלו — הוא אינו בן ישיר של gt-week', /\.gt-wnow \{/.test(CSS));
const h = (GT.match(/b\.addEventListener\("click", function \(\) \{[\s\S]{0,700}?\n          \}\);/) || [''])[0];
ok('🔴🔴 המעבר הוא ציור בלבד — בלי קריאת רשת',
   /draw\(\);/.test(h) && !/load\(\);/.test(h), h);
ok('⚠️ ו-0 מחזיר לשבוע הנוכחי ולא מזיז באפס',
   /week = d \? shiftKey\(week, d\) : todayKey\(\);/.test(h), h);

section('2. "לשיבוץ" עלה לראש');
const ob = (GT.match(/function openBody[\s\S]*?\n      \}/) || [''])[0];
/* ⚠️ כותרת השבוע היא תנאי מ-21.9 — מחפשים את נקודת הקריאה. */
const wkLane = ob.indexOf('lane(weekIsNow ?');
ok('🔴 "לשיבוץ" מופיע לפני עבודת השבוע',
   ob.indexOf('lane("לשיבוץ"') !== -1 && wkLane !== -1 &&
   ob.indexOf('lane("לשיבוץ"') < wkLane, ob);
ok('⚠️ ו"תקלות שדווחו" נשאר ראשון — יש שם תושב שמחכה',
   ob.indexOf('lane("תקלות שדווחו"') < ob.indexOf('lane("לשיבוץ"'), ob);
ok('⚠️ ולא נשארה להקה כפולה', (ob.match(/lane\("לשיבוץ"/g) || []).length === 1, ob);
ok('"בהמשך" נשאר אחרון', ob.indexOf('lane("בהמשך"') > wkLane, ob);

section('3. לחיצה על כרטיס פותחת פרטים — לכל משימה');
ok('🔴 התנאי kind === GK_REPORT הוסר ממסלול הלחיצה',
   !/if \(detT && detT\.kind === GK_REPORT\) openDetails/.test(GT));
ok('וכל משימה שנמצאה נפתחת', /if \(detT\) openDetails\(detRow\.dataset\.id\);/.test(GT));
ok('⚠️ ולחיצה על כפתור עדיין לא נחשבת לחיצה על הכרטיס',
   /var btn = e\.target\.closest\("\[data-act\]"\);\s*\n\s*if \(!btn\) \{/.test(GT));
/* 🔑 openDetails כבר גנרי — זה מה שהפך את התיקון לשורה אחת ולא למסך חדש. */
ok('🔑 openDetails גוזר את הפעולה ממצב המשימה', /var planning = !closed && !t\.week;/.test(GT));
ok('🔑 ומגן על repId', /t\.repId \? esc\(GL\.reportRef\(t\.repId\)\) : ""/.test(GT));

section('4. 🔴🔴 מה שהחצים חשפו — פיגור שדלף לשבוע עתידי');
/* עד החצים התנאי `t.week <= week` היה לא מזיק — השבוע המוצג
   היה תמיד הנוכחי. עם דפדוף קדימה הוא גורר את כל הפיגור
   מהעבר תחת כותרת "עבודת השבוע" — כותרת שמשקרת. */
ok('🔴 בשבוע עתידי מוצג בדיוק מה שמשובץ אליו',
   /weekIsNow \? \(t\.week <= week\) : \(t\.week === week\)/.test(GT));
ok('⚠️ ובשבוע הנוכחי הפיגור עדיין נכנס — ההחלטה מ-9.9 לא התהפכה',
   /weekIsNow = week === todayKey\(\)/.test(GT));
ok('🔑 והכותרת אומרת את האמת בשבוע אחר',
   /lane\(weekIsNow \? "עבודת השבוע" : \("עבודת " \+ weekLabel\(week\)\)/.test(GT));
ok('⚠️ ומשימה מוקדמת יותר אינה נופלת ל"בהמשך" בטעות',
   /if \(t\.week > week\) later\.push\(t\);/.test(GT));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
