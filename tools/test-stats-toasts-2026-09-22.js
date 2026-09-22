/* ממצאים 25 ו-26 — מה המסך אומר אחרי שעשית משהו   (2026-09-22, גל 3)
   הרצה:  node tools/test-stats-toasts-2026-09-22.js

   🔴 שני הממצאים האלה היו כבר **חצי סגורים**, וזה הלקח:
     · ממצא 26 טען ששיבוץ, סימון כבוצע והפעלת שגרה אינם מציגים טוסט.
       בפועל כולם מציגים — זה נסגר בבנייה מחדש של מסך המשימות בגל 2.
       מה שנשאר פתוח היה החצי השני: **הכותרת** של תוכנית העבודה, שנבנית
       רק ב-draw() ולכן נשארה מאחור אחרי כיבוי/הפעלה נקודתיים.
     · ממצא 25 טען שבורר הטווח אינו משנה אף מדד. בפועל הוא מצויר היום
       רק כשיש גרף שהוא משנה. מה שנשאר היה המונה עצמו והעברית.
   🔑 **ולכן רוב הבדיקות כאן הן שומרות-רגרסיה על מה שכבר תקין** — זה
      מה שמונע מהתיקון הבא לפתוח מחדש את מה שנסגר. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const GS = R('apps-script/Code.gs');
const GP = R('js/screens/gardenPlan.js');
const GT = R('js/screens/gardenTasks.js');
const ST = R('js/screens/gardenStats.js');
const RG = R('js/screens/resGarden.js');

section('1. 🔴 ממצא 25 — "נסגרו" מודד סגירה, לא ביצוע');
const blk = (GS.match(/var now = \{ open: 0[\s\S]*?\n    \}\);/) || [''])[0];
ok('הבלוק נמצא', !!blk);
ok('🔴 כל סגירה נספרת', /if \(t\.week === thisWeek\) now\.closedThisWeek\+\+;/.test(blk), blk.slice(0, 300));
ok('⚠️ ולא רק "בוצע"', !/t\.closure === 'בוצע'\) now\.closedThisWeek/.test(blk), blk.slice(0, 300));
ok('הבסיס מתועד במפורש — השבוע של המשימה ולא תאריך הסגירה',
   /הבסיס הוא \*\*השבוע של המשימה\*\*/.test(GS));
ok('שאר המונים לא נפגעו',
   /now\.open\+\+;/.test(blk) && /now\.waiting\+\+/.test(blk) && /now\.blocked\+\+/.test(blk), blk.slice(0, 200));

section('2. ממצא 25 — העברית');
ok('🔴 שבוע אחד ביחיד', /=== 1 \? 'שבוע אחד שהסתיים'/.test(ST), 'לא נמצא');
ok('ורבים נשאר רבים', /' שבועות שהסתיימו'/.test(ST));
ok('⚠️ "1 שבועות" לא יכול לחזור', !/\(d\.overallWeeks \|\| 0\) \+\n? *' שבועות שהסתיימו \(הנוכחי/.test(ST));

section('3. 🔴 ממצא 26 — שני מסלולי העדכון מסכימים');
const tg = (GP.match(/function toggle\(d, btn\)[\s\S]*?\n      \}/) || [''])[0];
ok('toggle נמצא', !!tg);
ok('🔴 הכותרת מתעדכנת עם השורה', /syncSummary\(\);/.test(tg), tg);
ok('🔴 ותווית קורא המסך מתהפכת איתה',
   /btn\.setAttribute\("aria-label", next \? "כיבוי" : "הפעלה"\);/.test(tg), tg);
ok('syncSummary קיימת ומחשבת מחדש מתוך defs',
   /function syncSummary\(\)[\s\S]*?defs\.filter\(function \(x\) \{ return x\.active; \}\)\.length/.test(GP));
ok('⚠️ ו**אינה** קוראת ל-draw — אחרת הנפשת המתג נבלעת',
   !/function syncSummary\(\)[\s\S]*?draw\(\)[\s\S]*?\n      \}/.test(GP.match(/function syncSummary[\s\S]*?\n      \}/)[0]));
ok('כשל עדיין מגלגל אחורה ומצייר מחדש', /d\.active = !next;\n          draw\(\);/.test(tg), tg);

section('4. שומרי רגרסיה — מה שכבר תקין ואסור שייפתח מחדש');
const run = (GT.match(/if \(op === "done"\) CBA\.ui\.toast[\s\S]*?scheduleReload\(\);/) || [''])[0];
['done', 'undo', 'defer', 'note', 'block', 'approve', 'close', 'return', 'plan']
  .forEach(op => ok('טוסט לפעולה ' + op, new RegExp('op === "' + op + '"').test(run), 'חסר'));
ok('כיבוי **והפעלה** של שגרה — שניהם מודיעים',
   /CBA\.ui\.toast\(\(?next \? "הופעלה" : "כובתה/.test(GP), 'חסר');
ok('משוב התושב מודיע', /CBA\.ui\.toast\(positive \? "תודה!" : "המשוב נשלח לוועד"\)/.test(RG));
ok('🔴 בורר הטווח מצויר רק כשהוא משנה משהו',
   /d\.isManager && weeksWithData\(\) > 1/.test(ST), 'חסר');
ok('⚠️ ומתועד במפורש שהוא נוגע לגרף בלבד', /הוא משפיע \*\*רק\*\* על גרף/.test(ST));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
