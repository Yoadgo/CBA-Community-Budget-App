/* "הדיווחים שלי" — קריאה ישירה מ-Firestore (2026-09-16).
   הרצה:  node tools/test-garden-reports-client.js

   🔴 שלוש סכנות שהמארז הזה שומר עליהן, וכולן שקטות:

     1. **שאילתה בלי מסנן משפחה.** כלל האבטחה ידחה אותה — כלומר
        המסך ייפול לאחור ל-Apps Script *תמיד*, וייראה פשוט "איטי"
        במקום שבור. באג שמתחפש לביצועים הוא הגרוע מכולם.
     2. **נפילה לאחור על אוסף ריק.** זו ההתנהגות הנכונה בשירותים
        ובתוכנית העבודה — וכאן היא **הפוכה**: תושב שלא דיווח
        מעולם הוא המקרה השכיח, ונפילה לאחור היתה מענישה בדיוק
        אותו ב-9.5 שניות כדי לגלות שאין מה להציג.
     3. **חלון המשוב שנתקע פתוח.** המסמך מחושב בסנכרון ויכול
        לשבת שעה; בלי קיפול מול השעון המקומי יוצג "אפשר להגיב"
        אחרי שהחלון נסגר. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DS = R('js/data/dataService.js');
const GS = R('apps-script/Code.gs');
const SS = R('js/screens/sysStatus.js');
const RG = R('js/screens/resGarden.js');
const IDX = R('index.html');
const SW = R('service-worker.js');
const RULES = R('firestore.rules');

section('1. 🔴 השאילתה — לפי מזהה משפחה, לא קריאת אוסף');
const fn = (DS.match(/function myGardenReportsRead\(cb\) \{[\s\S]*?\n  \}/) || [''])[0];
ok('הפונקציה קיימת', !!fn);
ok('🔴 queryCollection ולא readCollection',
   /queryCollection\("gardenReports", \[\["familyId", fid\]\]/.test(fn), fn);
ok('🔴 ואין קריאת אוסף שלם — הכלל היה דוחה אותה',
   !/readCollection\("gardenReports"/.test(DS));
/* ⚠️ אותו מקור בדיוק שממנו getClubResvFast ו-sheets.js גוזרים את המשפחה. */
ok('⚠️ מזהה המשפחה מ-CBA.user — מקור אחד לכל הלקוח',
   /CBA\.user\) \|\| \{\}\)\.familyId/.test(fn), fn);
ok('🔴 בלי מזהה משפחה — נופל לאחור ולא שולח שאילתה פסולה',
   /if \(!fid\) return done\(new Error\("no-family"\)\);/.test(fn), fn);
ok('עובר דרך fsFirstRead עם המפתח gardenReports',
   /fsFirstRead\("gardenReports", GARDEN_REPORTS_FROM_FIRESTORE/.test(fn), fn);

section('2. 🔴🔴 אוסף ריק הוא תשובה תקינה — ולא נפילה לאחור');
/* זו ההבחנה מול services/gardenPlan, ששם "ריק" הוא כן כשל.
   ר' ההערה הארוכה מעל הפונקציה. */
ok('🔴 אין כאן בדיקת "empty" שמפילה לאחור',
   !/rows\.length\) return done\(new Error\("empty"\)\)/.test(fn), fn);
/* ...ובשירותים היא **כן** קיימת — כדי שההבדל יהיה מכוון ולא שכחה. */
ok('⚠️ ובשירותים הבדיקה כן קיימת — ההבדל מכוון',
   /function servicesRead[\s\S]{0,700}rows\.length\) return done\(new Error\("empty"\)\)/.test(DS));
ok('⚠️ וההבדל מתועד בקוד',
   /אוסף ריק הוא תשובה תקינה כאן/.test(DS));

section('3. 🔴 חלון המשוב מקופל מול השעון של הלקוח');
ok('gardenFoldFeedback קיימת', /function gardenFoldFeedback\(r\)/.test(DS));
const fold = (DS.match(/function gardenFoldFeedback\(r\) \{[\s\S]*?\n  \}/) || [''])[0];
ok('🔴 מכבה canFeedback כשהחלון נסגר',
   /r\.canFeedback && r\.feedbackUntil && Date\.now\(\) > r\.feedbackUntil/.test(fold), fold);
ok('⚠️ ולעולם אינו מדליק מה שכבוי', !/canFeedback = true/.test(fold), fold);
/* 🔴 הקיפול חייב לחול על **שני** המסלולים. במסלול הישן הוא no-op,
   וזו בדיוק הסיבה שאפשר להחיל אותו על שניהם בלי ענף. */
ok('🔴 מוחל על מסלול Firestore', /\.map\(gardenFoldFeedback\)\.sort\(/.test(fn), fn);
ok('🔴🔴 ומוחל גם על הנפילה לאחור — אחרת שני המסלולים שונים',
   /action: "myGardenReports"[\s\S]{0,200}res\.rows\.map\(gardenFoldFeedback\)/.test(fn), fn);

section('4. מיון — בלקוח, בלי orderBy');
ok('gardenReportNewestFirst קיימת', /function gardenReportNewestFirst\(a, b\)/.test(DS));
/* ⚠️ orderBy היה דורש אינדקס, וקונסולת Google Cloud חסומה ב-2SV.
   ⚠️ מחפשים **קריאה** (`.orderBy(`) ולא את המילה: הניסוח הראשון
      נכשל על ההערה שמסבירה למה אין orderBy. בדיקה שנכשלת על
      התיעוד של עצמה מלמדת לכתוב פחות תיעוד. */
ok('🔴 ואין קריאת orderBy בשכבת הנתונים', !/\.orderBy\(/.test(DS));
ok('⚠️ וגם לא ב-firebase.js', !/\.orderBy\(/.test(R('js/data/firebase.js')));
const srt = (DS.match(/function gardenReportNewestFirst\(a, b\) \{[\s\S]*?\n  \}/) || [''])[0];
ok('יורד לפי מזהה — החדש למעלה, כמו reverse() בשרת',
   /return nb - na;/.test(srt), srt);
ok('⚠️ ונופל למחרוזת כשהמזהה אינו מספרי', /localeCompare/.test(srt), srt);

section('5. הדגל — רשום, מוצג, וברירת המחדל נכונה');
/* ⚠️ בלי תלות במיקום ברשימה — הדגל הבא שייווסף היה מפיל את זה. */
ok('🔴 רשום ב-FLAG_KEYS בשרת — אחרת flagSet ידחה אותו',
   /var FLAG_KEYS = \[[\s\S]*?'gardenReportsFromFirestore'[\s\S]*?\];/.test(GS));
ok('🔴 וגם דגל הכתיבה רשום',
   /var FLAG_KEYS = \[[\s\S]*?'gardenWriteToFirestore'[\s\S]*?\];/.test(GS));
ok('מוצג במסך "מצב המערכת"', /gardenReportsFromFirestore: \[/.test(SS));
/* 🔴🔴 המלכודת: fsFirstRead מקצרת על ברירת המחדל שבקוד **לפני**
   שהיא קוראת את הדגל החי. ברירת מחדל false = מתג שלא עושה כלום. */
ok('🔴🔴 ברירת המחדל בלקוח היא true — אחרת המתג חסר השפעה',
   /var GARDEN_REPORTS_FROM_FIRESTORE = true;/.test(DS));
ok('🔴 וגם ב-FLAG_INFO ברירת המחדל true — המסך חייב לומר את האמת',
   /gardenReportsFromFirestore: \[[^\]]*, true\]/.test(SS));
/* ומכאן נובע סדר ההעלאה, והוא אינו שרירותי. */
ok('⚠️ וסדר ההעלאה מתועד בשרת (זריעה לפני דחיפת הלקוח)',
   /זריעה, ורק אחריה דחיפת/.test(GS));

section('6. 🔴 המסך עצמו לא נגע — הגבול הוא שכבת הנתונים');
ok('resGarden עדיין קורא ל-CBA.data.getMyGardenReports',
   /CBA\.data\.getMyGardenReports\(function \(res\)/.test(RG));
/* 🔴🔴 **השתנה ב-16.9 ובמכוון.** המסך קורא מסמך אחד ישירות —
   מסך השלמת התמונות מציג את פרטי הדיווח שכבר הוגש, והמקור
   היחיד להם הוא המסמך עצמו. כל שאר הנתונים עדיין דרך CBA.data. */
ok('⚠️ הקריאה הישירה היחידה היא מסמך הדיווח להשלמת תמונות',
   (RG.match(/CBA\.fb\.[a-zA-Z]+\(/g) || []).join(',') === 'CBA.fb.readDoc(',
   (RG.match(/CBA\.fb\.[a-zA-Z]+\(/g) || []).join(','));
ok('🔴 והכתיבה עוברת תמיד דרך שכבת הנתונים', !/CBA\.fb\.(createDoc|mergeDoc|nextId)/.test(RG));
ok('⚠️ וכשל עדיין אינו "אין דיווחים"', /loadErr = !\(res && res\.ok\);/.test(RG));

section('7. ⚠️ שער הגרסה — קוד לקוח שלא מגיע לדפדפן');
/* ⚠️ נדחף היום פעמיים קוד לקוח בלי העלאת גרסה. ה-Service Worker
   הוא cache-first: בלי ?v= חדש הדפדפן מגיש את הישן, והשינוי
   פשוט לא קיים אצל המשתמש — בשקט מוחלט. */
/* ⚠️ רק תגים אמיתיים (src=/href=), לא כל מופע של "?v=" בקובץ:
   בשורה 116 יושבת הערה עם `?v=YYYYMMDD` שמסבירה את המנגנון,
   והיא נספרה כגרסה שנייה. בדיקה שנכשלת על התיעוד של עצמה
   מאמנת אנשים להתעלם ממנה. */
const tags = (IDX.match(/(?:src|href)="[^"]*\?v=[0-9a-zA-Z]+"/g) || [])
               .map(t => (t.match(/\?v=([0-9a-zA-Z]+)/) || [])[1]);
ok('נמצאו תגים עם גרסה ב-index.html', tags.length > 0, String(tags.length));
const v = tags[0];
const uniq = Array.from(new Set(tags));
ok('🔴 כל התגים באותה גרסה בדיוק', uniq.length === 1, uniq.join(','));
ok('🔴🔴 ו-service-worker.js על אותו ערך בדיוק',
   new RegExp('var VERSION = "' + v + '";').test(SW),
   (SW.match(/var VERSION = "[^"]*"/) || [''])[0]);

section('8. כלל האבטחה תואם לשאילתה');
/* השאילתה מסננת על familyId; הכלל חייב להתנות עליו — אחרת
   Firestore דוחה את השאילתה כולה לפני שנקרא מסמך. */
ok('🔴 הכלל מתנה על familyId של המסמך',
   /allow read: if canSeeGardenReport\(resource\.data\.familyId\);/.test(RULES));
ok('🔴 והשאילתה מסננת על אותו שדה בדיוק',
   /\[\["familyId", fid\]\]/.test(fn));

console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
