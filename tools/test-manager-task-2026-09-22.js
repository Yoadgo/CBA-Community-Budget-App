/* משימת מנהל "כמו דיווח דייר" + מתג משימה חוזרת   (2026-09-22)
   הרצה:  node tools/test-manager-task-2026-09-22.js

   🔑 **הטענה המרכזית שהמארז הזה שומר עליה: `repId` ולא `kind`.**
     המערכת מבחינה בין "איך המשימה נראית ומטופלת" (`kind`) לבין "האם יש
     תושב שמחכה לתשובה" (`repId`). מרגע שהמנהל יכול לפתוח תקלה בעצמו,
     משימה יכולה להיות `GK_REPORT` **בלי** תושב — וכל מקום שעדיין שואל
     `kind` כדי להחליט אם לפנות לתושב הוא באג שממתין לקרות: דיאלוג
     שמבקש לכתוב משפט לאיש, או מייל שמנסה לצאת לדיווח שאינו קיים.
   ⚠️ ובדיקה שנייה בחשיבותה: **אין שדה תיאור.** כרטיס הפירוט של המנהל
      אינו מצייר `desc` בשום מקום, והוספתו הייתה השינוי היחיד שדורש
      פרסום כללי אבטחה. מי שיוסיף אותו בעתיד — שיעשה זאת ביודעין.
   ⚠️ ובדיקה שלישית: **אין מנגנון חזרתיות חדש.** המתג מנתב ל-
      `gardenPlanSave` הקיים, ולא בונה לולאה משלו. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const DS = R('js/data/dataService.js');
const GT = R('js/screens/gardenTasks.js');
const RG = R('js/screens/resGarden.js');
const PH = R('js/ui/photos.js');
const RULES = R('firestore.rules');
const CSS = R('css/garden.css');
const HTML = R('index.html');
const SW = R('service-worker.js');

section('1. 🔴🔴 התפר — repId ולא kind');
ok('סגירה מבקשת "מה נעשה?" לפי repId, לא לפי kind',
   /if \(!t\.repId\) return run\("done", id, \{\}\);/.test(GT));
ok('לא נשאר התנאי הישן kind !== GK_REPORT בסגירה',
   !/if \(t\.kind !== GK_REPORT\) return run\("done"/.test(GT));
ok('הטוסט שאחרי פעולה נגזר מ-repId',
   /var wasReport = !!\(t && t\.repId\);/.test(GT));
ok('שכבת הכתיבה כבר גוזרת isReport מ-repId (התפר לא הומצא כאן)',
   /var isReport = String\(cur\.repId \|\| ""\)\.trim\(\) !== "";/.test(DS));
ok('כללי האבטחה מתעדים את אותה הבחנה',
   /repId.{0,12}ולא.{0,12}kind/.test(RULES) || /`repId` ולא `kind`/.test(RULES));

section('2. משימת מנהל נפתחת כתקלה — עם repId ריק');
const create = DS.slice(DS.indexOf('function gardenFsCreateTask'),
                        DS.indexOf('function gardenPlanNewId'));
ok('gardenFsCreateTask מקבל asReport', /var asReport = !!payload\.asReport;/.test(create));
ok('asReport קובע את kind בלבד',
   /kind: asReport \? GARDEN_KIND_REPORT : "יזום"/.test(create));
ok('repId נשאר ריק תמיד — אין תושב מאחורי משימת מנהל',
   /repId: ""/.test(create) && !/repId: String\(/.test(create));
ok('נעיצה נבדקת בטווח 0–1 לפני שהיא נכתבת',
   /payload\.x >= 0 && payload\.x <= 1 && payload\.y >= 0 && payload\.y <= 1/.test(create));
ok('בלי נעיצה תקינה נכתב null ולא ערך חלקי',
   /x: hasPin \? Number\(payload\.x\) : null/.test(create) &&
   /y: hasPin \? Number\(payload\.y\) : null/.test(create));
ok('שורת היומן מבחינה בין תקלה שפתח הצוות למשימה יזומה',
   /asReport \? "תקלה שפתח הצוות" : "משימה יזומה"/.test(create));

section('3. ⚠️ אין שדה תיאור — ולכן אין שינוי בכללי האבטחה');
const gtFields = (RULES.match(/function gtFields\(\)[\s\S]*?\}/) || [''])[0];
ok('gtFields אינו מכיל desc', !/['"]desc['"]/.test(gtFields));
/* ⚠️ המילה desc מופיעה בהערה שמסבירה **למה** אין שדה כזה — ולכן
   הבדיקה מסתכלת על המסמך שנכתב, לא על טקסט הקובץ. */
const docLiteral = create.slice(create.indexOf('var doc = {'), create.indexOf('CBA.fb.createDoc'));
ok('המסמך שנכתב אינו כולל desc', !/(^|[^\w])desc\s*:/.test(docLiteral));
ok('הטופס אינו אוסף תיאור', !/nt-desc/.test(GT));
const NEW_TASK = GT.slice(GT.indexOf('function openNewTask'), GT.indexOf('function openMenu'));
/* כל שם שדה במסמך, לא רק אלה שבהזחה מסוימת — אחרת שדה שנוסף בעתיד
   בשורה משותפת היה חומק מהבדיקה בשקט. */
const written = [...new Set((docLiteral.match(/(?:^|[{,])\s*([a-zA-Z]\w*)\s*:/gm) || [])
  .map(m => m.replace(/[^a-zA-Z]/g, ''))
  /* המילה שאחרי `?` בתנאי משולש אינה שם שדה — ולכן רק שמות שמתחילים
     באות קטנה, כפי שכל שדות האוסף כתובים. */
  .filter(f => /^[a-z]/.test(f)))];
const allowed = (gtFields.match(/'([a-zA-Z]+)'/g) || []).map(s => s.replace(/'/g, ''));
ok('נסרקו כל שדות המסמך (לפחות 15)', written.length >= 15, 'נמצאו ' + written.length);
written.forEach(f => ok('השדה ' + f + ' מותר ב-gtFields', allowed.indexOf(f) >= 0, f));

section('4. כל שדה שהטופס שולח מגיע ממסלול הכתיבה הישירה');
ok('המפה והתמונות מוצגות רק כשהדפדפן כותב ישירות',
   /var direct = !!\(CBA\.data\.gardenDirectWrites && CBA\.data\.gardenDirectWrites\(\)\);/.test(NEW_TASK));
ok('gardenDirectWrites מיוצא — המסך אינו גוזר את הדגל מחדש',
   /gardenDirectWrites: function \(\) \{ return gardenWritesOn\(\); \}/.test(DS));
ok('המסך אינו קורא ל-CBA.fb.flag בעצמו', !/CBA\.fb\.flag\(/.test(GT));

section('5. התמונות — מנגנון אחד, לא שניים');
ok('הכיווץ עבר ל-js/ui/photos.js', /function compress\(file, cb\)/.test(PH));
ok('photos.js מייצא compress ו-toUpload',
   /return \{ open: open, compress: compress, toUpload: toUpload \};/.test(PH));
ok('resGarden כבר אינו מממש כיווץ בעצמו',
   !/var MAX_EDGE/.test(RG) && !/cv\.toDataURL\("image\/jpeg"/.test(RG));
ok('resGarden מאציל ל-CBA.photos.compress',
   /function compressImage\(file, cb\) \{ CBA\.photos\.compress\(file, cb\); \}/.test(RG));
ok('מסך המשימות משתמש באותו מנגנון', /CBA\.photos\.toUpload\(f, function/.test(NEW_TASK));
ok('photos.js נטען לפני gardenTasks.js ב-index.html',
   HTML.indexOf('js/ui/photos.js') < HTML.indexOf('js/screens/gardenTasks.js'));

section('6. התמונות עולות ברקע — התשובה חוזרת לפני ההעלאה');
ok('cb נקרא לפני gardenUploadPhotos',
   create.indexOf('cb({ ok: true, id: taskId') < create.indexOf('gardenUploadPhotos('));
ok('המכסה נבדקת שוב בתוך ה-callback של הכיווץ',
   (NEW_TASK.match(/state\.photos\.length >= NT_PHOTO_MAX/g) || []).length >= 3);
ok('אין beforeunload בטופס — סגירת הדף אינה נחסמת', !/beforeunload/.test(NEW_TASK));
ok('כשל בהעלאה נרשם ואינו מבטל את המשימה',
   /gardenPhotoWarn\("אף תמונה לא עלתה למשימה"/.test(create) &&
   /gardenPhotoWarn\("מסמך המשימה לא עודכן בתמונות"/.test(create));
ok('photos מותר ב-gtTeamUpdateOk (המיזוג שאחרי ההעלאה)',
   /gtTeamUpdateOk[\s\S]{0,600}'photos'/.test(RULES));

section('7. ⚠️ המתג מנתב — הוא אינו מנגנון חזרתיות חדש');
ok('המתג קיים כ-role="switch" עם aria-checked', /role="switch" aria-checked="false"/.test(NEW_TASK));
ok('aria-checked מתעדכן בלחיצה',
   /repBtn\.setAttribute\("aria-checked", state\.repeat \? "true" : "false"\)/.test(NEW_TASK));
ok('דלוק → gardenPlanSave הקיים', /CBA\.data\.gardenPlanSave\(\{/.test(NEW_TASK));
ok('כבוי → gardenCreateTask עם asReport', /asReport: true/.test(NEW_TASK));
ok('אין אוסף חדש ואין כתיבה ישירה לאוסף אחר מהטופס',
   !/createDoc\(/.test(NEW_TASK));
ok('מתג דלוק מסתיר את המפה ואת התמונות (אין להן מקום ב-gardenPlan)',
   /onceEl\.hidden {2}= state\.repeat;/.test(NEW_TASK));
const gpFields = (RULES.match(/function gpFields\(\)[\s\S]*?\}/) || [''])[0];
ok('gardenPlan באמת אינו מחזיק x/y/photos — ההסתרה נכונה ולא שרירותית',
   !/'x'/.test(gpFields) && !/'y'/.test(gpFields) && !/'photos'/.test(gpFields));

section('8. בדיקת דו-שבועי — אותה בדיקה בלקוח, בשרת ובכללים');
ok('הטופס חוסם דו-שבועי בלי שבוע ראשון',
   /freq === "דו-שבועי" && !first/.test(NEW_TASK));
ok('אותה בדיקה בשכבת הכתיבה',
   /freq === "דו-שבועי" && !\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(payload\.firstWeek/.test(DS));
ok('ואותה בדיקה בכללי האבטחה',
   /freq != 'דו-שבועי' \|\|[\s\S]{0,120}firstWeek/.test(RULES));
ok('שדות התדירות מוסתרים ולא מוסרים מה-DOM',
   /wrap\.querySelector\("#nt-anchor"\)\.hidden/.test(NEW_TASK) &&
   !/#nt-anchor"\)\.remove\(\)/.test(NEW_TASK));

section('9. נגישות, עיצוב וניסוח');
ok('כפתור הסרת תמונה הוא button עם aria-label (ממצא 29 לא נסוג)',
   /<button type="button" class="th-x" aria-label="הסרת התמונה">/.test(NEW_TASK));
ok('המתג משתמש ב-.gp-sw הקיים ולא במתג שני', /class="gp-sw off"/.test(NEW_TASK));
ok('אין הגדרת מתג חדשה ב-CSS', !/\.nt-rep__sw/.test(CSS));
ok('המפה בגיליון נמוכה מ-.gd-map הרגילה', /\.nt-map \{ height: 240px/.test(CSS));
ok('הכפתור הראשי הוא .gd-cta — CTA שחור לפי האפיון', /class="gd-cta" id="nt-go"/.test(NEW_TASK));
ok('הגיליון עובר ב-mountSheet (Esc, מלכודת מיקוד, שומר כפילות)',
   /CBA\.ui\.mountSheet\(wrap, \{ key: "gt-new", sticky: true \}\)/.test(NEW_TASK));
ok('תווית המסנן כבר לא משקרת — תקלה יכולה להיפתח משני הצדדים',
   /seg\("faults", "תקלות", c\.faults\)/.test(GT) && !/"תקלות דיירים", c\.faults/.test(GT));
ok('הנעיצה ממלאת אזור רק כשהמנהל לא בחר אחד',
   /if \(state\.pinArea && sel && !sel\.value\)/.test(NEW_TASK));

section('10. גרסה ומטמון');
ok('index.html ו-service-worker על אותה גרסה',
   (SW.match(/var VERSION = "(\d+\w?)"/) || [])[1] === '20260922e' &&
   HTML.indexOf('?v=20260922e') > 0);
ok('לא נשארה גרסה ישנה ב-index.html', !/20260922d/.test(HTML));

console.log('\n' + (fail ? '✗' : '✓') + '  עברו ' + pass + ' · נכשלו ' + fail);
process.exit(fail ? 1 : 0);
