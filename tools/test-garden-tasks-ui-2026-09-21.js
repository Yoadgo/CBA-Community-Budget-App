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

section('2. 🔴 "ממתין להחלטה" — כרטיס אחד בראש העמוד');
const ob = (GT.match(/function openBody[\s\S]*?\n      \}/) || [''])[0];
/* ⚠️ כותרת השבוע היא תנאי מ-21.9 — מחפשים את נקודת הקריאה. */
const wkLane = ob.indexOf('lane(weekIsNow ?');
ok('🔴 שתי הלהקות הישנות אוחדו — אין יותר "תקלות שדווחו" ואין "לשיבוץ"',
   ob.indexOf('lane("תקלות שדווחו"') === -1 && ob.indexOf('lane("לשיבוץ"') === -1, ob);
ok('🔴 ובמקומן להקה אחת, לפני עבודת השבוע',
   ob.indexOf('lane("ממתין להחלטה"') !== -1 && wkLane !== -1 &&
   ob.indexOf('lane("ממתין להחלטה"') < wkLane, ob);
ok('⚠️ ולא נשארה להקה כפולה',
   (ob.match(/lane\("ממתין להחלטה"/g) || []).length === 1, ob);
ok('🔑 היא יושבת בכרטיס רקע נפרד', /<section class="gt-decide">/.test(ob) &&
   /\.gt-decide \{/.test(CSS), ob);
ok('⚠️ והכרטיס מוצג גם כשהוא ריק — מסלול שנעלם מלמד לא להסתכל',
   /gt-decide[\s\S]{0,400}decide\.length[\s\S]{0,400}gt-none/.test(ob), ob);
ok('🔴 "בהמשך" הוסר (22.9, הכרעת יועד) — רק השבוע שצופים בו', ob.indexOf('lane("בהמשך"') === -1, ob);

section('2ב. 🔴🔴 השיבוץ מזיז את הכרטיס — הסתירה שיועד זיהה');
/* "תקלות דיירים — אין שום סיבה לשבץ? כי זה תמיד מופיע". נכון היה:
   הדיווח נשלף לפי kind בלי קשר לשבוע, ולכן נשאר בראש המסך לנצח. */
ok('🔴 החלוקה היא לפי שבוע ולא לפי kind',
   /if \(!t\.week\) return decide\.push\(t\);/.test(ob) &&
   !/if \(t\.kind === GK_REPORT\) return reports\.push\(t\);/.test(ob), ob);
ok('⚠️ ודיווח תושב ששובץ נכנס לעבודת השבוע ככל משימה',
   /weekIsNow \? \(t\.week <= week\) : \(t\.week === week\)\) return thisWeek\.push\(t\);/.test(ob), ob);
ok('🔑 בתוך הכרטיס — דיווחי תושבים ראשונים',
   /var ra = a\.kind === GK_REPORT \? 0 : 1, rb = b\.kind === GK_REPORT \? 0 : 1;/.test(ob), ob);
ok('🔑 ואחריהם לפי סדר הקטגוריות שבהגדרות, לא א"ב',
   /catRank\(ca\) - catRank\(cb\)/.test(ob) && /function catRank/.test(GT), ob);
ok('⚠️ וגם בתוך אזור בעבודת השבוע — דיווח קודם',
   /rx = x\.kind === GK_REPORT \? 0 : 1/.test(ob), ob);

section('2ג. 🔴 הדגל: פינה בורדו, בלי כיתוב, שמאל למעלה');
ok('🔴 משולש על ::after של כרטיס דיווח', /\.gt-row\.is-report::after \{/.test(CSS));
ok('⚠️ פינה שמאלית **פיזית** — left ולא inset-inline-start (המסך RTL)',
   /\.gt-row\.is-report::after \{[\s\S]{0,260}left: 0;/.test(CSS));
ok('🔑 ובלי טקסט — content ריק בלבד',
   /\.gt-row\.is-report::after \{[\s\S]{0,120}content: "";/.test(CSS));
ok('⚠️ הפס המקוטע לא נדרס — הוא עדיין ::before עם mask',
   /\.gt-row\.is-report::before \{[\s\S]{0,200}mask-image/.test(CSS));
ok('🔑 והדגל נכנס למקרא באותה נשימה', /פינה בורדו/.test(GT) && /\.gt-lgf \{/.test(CSS));

section('2ד. 🔴 מסנן רביעי — כל תקלות הדיירים, מכל השבועות');
/* ⚠️ **התווית השתנתה ל"תקלות" ב-22.9** ולא בטעות: מאז שהמנהל יכול
   לפתוח תקלה בעצמו (asReport), המסנן מחזיק תקלות משני הצדדים —
   ו"תקלות דיירים" הפך לתווית שמשקרת על חצי מהתוכן. המנגנון עצמו
   לא נגע: אותו `filter`, אותו `kind === GK_REPORT`. */
ok('🔴 שבב התקלות קיים', /seg\("faults", "תקלות", c\.faults\)/.test(GT));
ok('⚠️ והתווית כבר אינה מייחסת אותן לדיירים בלבד',
   !/"תקלות דיירים", c\.faults/.test(GT));
ok('⚠️ והוא משתמש באותו מנגנון מסנן — לא מסך חדש',
   /if \(filter === "faults"\) return t\.kind === GK_REPORT;/.test(GT));
ok('🔑 המונה סופר הכל — כולל סגורות', /if \(t\.kind === GK_REPORT\) c\.faults\+\+;/.test(GT));
const fb = (GT.match(/function faultsBody[\s\S]*?\n      \}/) || [''])[0];
ok('🔑 והתצוגה מקובצת לפי מצב: ממתינות · משובצות · טופלו',
   fb.indexOf('lane("ממתינות לשיבוץ"') !== -1 &&
   fb.indexOf('lane("ממתינות לשיבוץ"') < fb.indexOf('lane("משובצות"') &&
   fb.indexOf('lane("משובצות"') < fb.indexOf('lane("טופלו"'), fb);
ok('⚠️ המשובצות בכרונולוגיה ולא בדחיפות — השאלה כאן היא "מתי"',
   /String\(a\.week\)\.localeCompare\(String\(b\.week\)\)/.test(fb), fb);
ok('⚠️ ויש מצב ריק משלו, לא "אין משימות פתוחות"', /אין תקלות מתושבים/.test(GT));

section('2ה. 🧹 מה שירד — בורר הסידור המת');
ok('🔴 sortBy נעלם כליל', !/sortBy/.test(GT));
ok('🔴 וגם SORTS/sortDef', !/SORTS\[|function sortDef/.test(GT));
ok('⚠️ אבל groupRank ו-WEEK_ORDER נשארו — הארכיון עדיין מקובץ לפי שבוע',
   /function groupRank/.test(GT) && /WEEK_ORDER\.indexOf/.test(GT) &&
   /var grp = weekGroup;/.test(GT));
ok('⚠️ ו-order עדיין חי — הוא מדרג אזורים וקטגוריות',
   /order\.area = res\.areas/.test(GT) && /order\.type \|\| \[\]/.test(GT));

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
ok('⚠️ ומשימה של שבוע מאוחר יותר אינה מוצגת בתצוגת העבודה',
   !/later\.push/.test(GT));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
