/* כשל שקט הופך לרועש  (2026-09-17, גל 2 · ממצאים 15 + 13)
   הרצה:  node tools/test-quiet-nav.js

   🔴 הכלל שנבדק כאן הוא כלל פשטות ולא רק תיקון: **אין מנגנון שני היכן
      שיש אחד.** `CBA.diag` כבר אוסף שגיאות ושובל פעולות, וכבר מצורף לכל
      דיווח תקלה של תושב. ולכן הבדיקה מוודאת גם שלא נולד יומן חדש במקביל
      וגם שאין הודעה למשתמש על ניווט שנחסם בצדק — הודעה כזו הייתה רעש.

   ⚠️ ממצא 13 אינו באג במסלול. המסלול תוקן ב-16.9 בשלושה מקומות, והבדיקה
      כאן נועלת את שלושתם כדי שלא ייסוגו — ומוסיפה את מה שבאמת היה חסר:
      עקבה כשמסמך לא נקרא. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const APP = R('js/app.js');
const DS = R('js/data/dataService.js');
const DIAG = R('js/ui/diag.js');
const GS = R('apps-script/Code.gs');
const RULES = R('firestore.rules');

section('1. 🔴 ארבע נקודות הכשל ב-showScreen — אף אחת לא שקטה');
const fn = (APP.match(/function showScreen\(name, opts\) \{[\s\S]*?const silent =/) || [''])[0];
ok('showScreen נמצא', !!fn);
ok('🔴 אין בענפים האלה יותר return ריק',
   !/^\s*if \([^)]*\) return;\s*$/m.test(fn), fn);
['navigate-early', 'navigate-missing', 'navigate-no-area', 'navigate-area-bounced']
  .forEach(k => ok('נרשם: ' + k, fn.indexOf('"' + k + '"') > -1, fn));

section('2. ההפרדה בין "צפוי" ל"שבור"');
ok('⚠️ ניווט לפני סיום הטעינה נרשם בשובל בלבד',
   /quietFail\("navigate-early", name,[\s\S]{0,120}true\)/.test(APP), 'לא נמצא');
ok('🔴 מסך לא קיים נרשם כשגיאה, לא כשובל',
   /quietFail\("navigate-missing", name,\s*\n\s*"אין מסך רשום בשם הזה"\)/.test(APP));
const qf = (APP.match(/function quietFail\([\s\S]*?\n  \}/) || [''])[0];
ok('quietFail קיימת', !!qf);
ok('trailOnly פונה ל-CBA.diag.log', /trailOnly[\s\S]{0,400}CBA\.diag\.log/.test(qf), qf);
ok('והשאר ל-CBA.diag.error', /CBA\.diag\.error\(line, "app\.js"\)/.test(qf), qf);
ok('וגם console.warn, למי שפתח את הקונסולה', /console\.warn/.test(qf), qf);
ok('⚠️ הכול עטוף ב-try — רישום לא יפיל ניווט', /try \{[\s\S]*catch \(e\) \{\}/.test(qf), qf);

section('3. 🔴 בלי מנגנון שני, ובלי רעש למשתמש');
ok('אין יומן חדש משלו', !/CBA\.(quietLog|navLog|sessionLog)\b/.test(APP));
ok('🔴 ואין טוסט/alert על ניווט שנחסם',
   !/quietFail[\s\S]{0,200}CBA\.ui\.(toast|alert)/.test(APP), 'נמצאה הודעה למשתמש');
ok('CBA.diag חושפת את שתי הדלתות שנעשה בהן שימוש',
   /log: log,/.test(DIAG) && /error: addError,/.test(DIAG));

section('4. ממצא 13 — שלושת מקומות המסלול נעולים');
ok('השרת ממפה קהל "תושבים" למסמך residents',
   /if \(a === '\\u05ea\\u05d5\\u05e9\\u05d1\\u05d9\\u05dd'\) return 'residents';/.test(GS));
ok('הלקוח מבקש residents למי שאינו מנהל',
   /ids\.push\(isAdmin \? "admins" : "residents"\);/.test(DS));
ok("🔴 וכלל האבטחה מתיר — בשלילה, היחיד כזה בקובץ",
   /id == 'residents'\s*&& !isAdminUser\(\)/.test(RULES));

section('5. 🔴 מסמך סיור שלא נקרא משאיר עקבה');
const tour = (DS.match(/function tourDocIdsForMe[\s\S]*?getClubResvFast/) || [''])[0];
ok('הקטע נמצא', !!tour);
ok('🔴 מסמך שלא נקרא נאסף ל-missed',
   /else missed\.push\(id \+ \(e \? " \(שגיאה\)" : " \(אין מסמך\)"\)\)/.test(tour), tour);
ok('⚠️ והרישום יושב ב-done ולא בלולאה — גם tourSeen מפחית את left',
   tour.indexOf('צעדי סיור שלא נטענו') > -1 &&
   tour.indexOf('צעדי סיור שלא נטענו') < tour.indexOf('ids.forEach'), tour);
ok('missed מוצהר לפני done', tour.indexOf('var missed = []') < tour.indexOf('function done()'));
ok('⚠️ "אין מסמך" ו"שגיאה" נבדלים — הם שתי תקלות שונות לגמרי',
   /\(שגיאה\)/.test(tour) && /\(אין מסמך\)/.test(tour));
ok('🔴 והנפילה לאחור לא השתנתה: אף מסמך לא נקרא ⇒ null',
   /if \(!got\) return cb\(null\);/.test(tour), tour);

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
