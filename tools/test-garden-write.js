/* ההיפוך — הדפדפן כותב דיווח גינון ל-Firestore (2026-09-16).
   הרצה:  node tools/test-garden-write.js

   🔴 ארבע סכנות, וכולן שקטות:
     1. **כתיבה בלי קריאה.** אם הדפדפן יכתוב ל-Firestore בזמן
        שהמסך עדיין נבנה מהגיליון, הדיווח ייעלם ברענון הבא. בדיוק
        החור שנתפס ב-15.9 בתנועות התקציב — ולכן שני הדגלים
        נבדקים יחד, לעולם לא אחד לבד.
     2. **סדר הכתיבה.** מסמך הדיווח מצביע על המשימה. משימה
        שנכתבת אחרי הדיווח פותחת חלון שבו הדיווח מצביע לשום מקום.
     3. **תמונה שנבלעת.** זו הייתה ההתנהגות עד היום: כישלון
        העלאה נבלע ב-catch והתושב קיבל "נשלח" כרגיל.
     4. **מייל שלא יצא.** הדפדפן כותב ואז קורא לשרת; אם הקריאה
        נופלת, mailPending הוא מה שמאפשר לסריקה השעתית לתפוס. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DS = R('js/data/dataService.js');
const GS = R('apps-script/Code.gs');
const RG = R('js/screens/resGarden.js');
const RULES = R('firestore.rules');

section('1. 🔴 שני הדגלים נבדקים יחד — לעולם לא אחד לבד');
const sub = (DS.match(/submitGardenReport: function[\s\S]*?\n    \},/) || [''])[0];
ok('הכתיבה מותנית בדגל הקריאה', /gardenReportsFromFirestore/.test(sub), sub);
ok('🔴🔴 **וגם** בדגל הכתיבה — ב-AND', /&&[\s\S]{0,80}gardenWriteToFirestore/.test(sub), sub);
ok('⚠️ ובלי משתמש מחובר — נופל למסלול הישן', /CBA\.fb\.uid\(\)/.test(sub), sub);
ok('הנפילה לאחור היא המסלול הישן בדיוק',
   /postReadProgress\("submitGardenReport"/.test(sub), sub);
ok('ברירת המחדל של דגל הכתיבה היא false',
   /var GARDEN_WRITE_TO_FIRESTORE = false;/.test(DS));

section('2. 🔴 סדר הכתיבה — משימה, דיווח, ואז השאר');
const fn = (DS.match(/function gardenReportFsWrite[\s\S]*?\n  \}\n/) || [''])[0];
ok('הפונקציה קיימת', !!fn);
const iTask = fn.indexOf('createDoc("gardenTasks"');
const iRep  = fn.indexOf('createDoc("gardenReports"');
ok('🔴 המשימה נכתבת לפני הדיווח', iTask > -1 && iRep > -1 && iTask < iRep,
   iTask + '/' + iRep);
ok('🔴 והתמונות אחרי שניהם — דיווח בלי תמונה הוא דיווח',
   fn.indexOf('gardenUploadPhotos(') > iRep);
ok('שני המזהים מגיעים מהמונים', (fn.match(/CBA\.fb\.nextId\("garden/g) || []).length === 2);

section('3. 🔴 תמונות — אחת-אחת, אחוז אמיתי, וכישלון שנספר');
ok('gardenUploadPhotos קיימת', /function gardenUploadPhotos\(/.test(DS));
const up = (DS.match(/function gardenUploadPhotos[\s\S]*?\n  \}\n/) || [''])[0];
/* ⚠️ 17.9 — ההעלאה עברה **למקביל** (החלטת יועד), ולכן התוצאה נכתבת
   למקום שלה לפי אינדקס במקום להידחף לסוף. הכלל שנבדק כאן לא השתנה:
   תמונה שנפלה נספרת ואינה עוצרת את השאר. ר' test-garden-photos-bg.js. */
ok('🔴 תמונה שנפלה אינה עוצרת את השאר', /if \(err \|\| !id\) failed\+\+; else slot\[idx\] = id;/.test(up), up);
ok('🔴 והכישלונות נספרים ומוחזרים', /done\(ids, failed\)/.test(up), up);
/* 🔴🔴 המלכודת שאסור שתחזור: אחוזים אמיתיים דורשים מאזין על
   xhr.upload, וזה מה ששבר את הבקשה מול Apps Script. */
/* ⚠️ מחפשים **שימוש** (`.upload.addEventListener` / `xhr.upload.on…`)
   ולא את המילה: ההערה שמסבירה למה אסור להשתמש בו הכילה אותה,
   והבדיקה נכשלה על התיעוד של עצמה. */
ok('🔴🔴 ואין שימוש ב-xhr.upload בשכבת הנתונים',
   !/xhr\.upload\s*\.|\.upload\.addEventListener|upload\.onprogress/.test(DS));
/* 🔴🔴 17.9 — **הדגל הפוך מכפי שהיה כאן.** עד אז הוא נכתב בסוף
   ההעלאה ורק כשהיה כשל, כלומר דפדפן שנסגר באמצע לא הגיע לכתיבה
   בכלל והסריקה השעתית לא ראתה את הדיווח לעולם. מאז שההעלאה ברקע
   זה המסלול הרגיל, ולכן הדגל נכתב **מראש** ויורד רק כשהכול נחת. */
ok('🔴 הדגל נכתב מראש לפי מספר התמונות',
   /photosIncomplete: photos\.length > 0,/.test(fn), fn);
ok('🔴 ויורד רק כשכולן נחתו',
   /photosIncomplete: ids\.length < photos\.length,/.test(DS));
ok('⚠️ וכמה נשלחו נרשם מראש', /photosExpected: photos\.length/.test(fn), fn);
ok('השרת מחזיר שגיאה על תמונה ולא בולע אותה',
   /function gardenPhotoOne_[\s\S]{0,900}return \{ ok: false, error: 'העלאת התמונה נכשלה/.test(GS));

section('4. 🔴 המייל — דגל קודם, קריאה אחר כך');
ok('🔴 mailPending נכתב **במסמך**, לפני הקריאה לשרת',
   fn.indexOf('mailPending: true') > -1 &&
   fn.indexOf('mailPending: true') < fn.indexOf('gardenNotifyReport'), fn);
ok('הקריאה היא שגר-ושכח', /postRead\("gardenNotifyReport", \{ id: String\(repId\) \}, function \(\) \{\}\)/.test(fn), fn);
ok('🔴 והסריקה השעתית תופסת מה שלא יצא',
   /function gardenMailPending_[\s\S]{0,400}fsQuery_\(FS_GARDEN_REPORTS, 'mailPending', 'EQUAL', true/.test(GS));
ok('⚠️ והשליחה אידמפוטנטית — מורידה את הדגל',
   /function gardenSendReportMail_[\s\S]{0,1600}mailPending: false/.test(GS));
ok('⚠️ ולא שולחת פעמיים', /if \(doc\.mailPending !== true\) \{ out\.ok = true; return out; \}/.test(GS));

section('5. 🔒 הקו האדום — שם המדווח לא עובר בדפדפן');
ok('🔴 המסמך שהדפדפן כותב אינו נושא שם או טלפון',
   !/שם מדווח|reporterName|phone:/.test(fn), fn);
ok('🔴 והשם נשלף בשרת מתוך מזהה המשפחה',
   /function gardenSendReportMail_[\s\S]{0,800}txFamilyNames_\(ss\)/.test(GS));
ok('⚠️ ומגיליון התושבים, לא מ-Firestore',
   /function txFamilyNames_/.test(GS));

section('6. 🔴 רשת הביטחון של התמונות');
ok('סריקה שעתית לדיווחים עם תמונות חסרות',
   /function gardenPhotosIncomplete_[\s\S]{0,400}fsQuery_\(FS_GARDEN_REPORTS, 'photosIncomplete', 'EQUAL', true/.test(GS));
/* ⚠️ התראה שחוזרת כל שעה היא התראה שמפסיקים לקרוא. */
ok('🔴 מתריעה פעם אחת לכל דיווח', /if \(d\.photosNudged === true\) continue;/.test(GS));
ok('ותבנית המייל קיימת', /'ADMIN_GARDEN_PHOTOS_MISSING'/.test(GS));
ok('מחוברת לעבודה השעתית',
   /function hourlyJobsRun_\(\)[\s\S]{0,12000}gardenPhotosIncomplete_\(ss\)/.test(GS));

section('7. המסך — אומר את האמת ומפנה להשלמה');
ok('🔴 ההודעה אומרת שתמונה לא עלתה', /תמונה אחת לא עלתה/.test(RG));
ok('🔴 ומפנה לטופס ההשלמה עם התמונות שבזיכרון',
   /CBA\.navigate\("resGardenNew", \{\s*completeFor: res\.id/.test(RG), '');
ok('מסך ההשלמה קיים', /function renderCompletePhotos\(container, opts\)/.test(RG));
ok('⚠️ והפרטים בו אינם ניתנים לעריכה',
   !/id="gd-desc"|id="gd-title"/.test((RG.match(/function renderCompletePhotos[\s\S]*?\n  \}\n/) || [''])[0]));
ok('🔴 באנר ברשימה למי שסגר את האפליקציה', /data-complete="/.test(RG));
ok('הבאנר תלוי בשדה שבמסמך', /r\.photosIncomplete/.test(RG));

section('8. 🔐 הכללים תואמים למה שהלקוח כותב');
ok('photosExpected/photosIncomplete מותרים ביצירה',
   /'photosExpected', 'photosIncomplete'/.test(RULES));
ok('mailPending מותר ובוליאני',
   /request\.resource\.data\.mailPending is bool/.test(RULES));
ok('🔴 והשלמת תמונות נוגעת ב-photos בלבד',
   /hasOnly\(\['photos', 'photosIncomplete', 'updatedAt'\]\)/.test(RULES));

section('9. 🔴 מסך הניהול — קריאה מ-Firestore, כתיבה דרך Apps Script');
ok('gardenTasksRead קיימת', /function gardenTasksRead\(opts, cb\)/.test(DS));
ok('הקריאה עוברת דרך אותו שלד', /fsFirstRead\("gardenTasks", GARDEN_TASKS_FROM_FIRESTORE/.test(DS));
ok('היומן נקרא בשאילתת שוויון על taskId',
   /queryCollection\("gardenLog", \[\["taskId", String\(id\)\]\]/.test(DS));
/* ⚠️ ריק **כן** מפיל לאחור כאן — הפוך מהדיווחים, ובמכוון:
   לשיכון תמיד יש משימות, ולתושב לרוב אין דיווחים. */
ok('🔴 אוסף משימות ריק מפיל לאחור',
   /function gardenTasksRead[\s\S]{0,1200}rows\.length\) return done\(new Error\("empty"\)\)/.test(DS));
ok('⚠️ ובדיווחים ההפך, וזה מתועד', /אוסף ריק הוא תשובה תקינה כאן/.test(DS));
/* 🔴 dupOf מחושב בלקוח — הקלט כבר בזיכרון. הכללים חייבים להיות זהים. */
const dupC = (DS.match(/function gardenDupCandidate\(o, all\)[\s\S]*?\n  \}/) || [''])[0];
const dupS = (GS.match(/function gardenDupCandidate_\(o, all\)[\s\S]*?\n\}/) || [''])[0];
[['רק דיווחי תושבים', /kind !== GARDEN_KIND_REPORT/],
 ['אותה קטגוריה ואותו אזור', /category !== o\.category \|\| c\.area !== o\.area/],
 ['חלון 14 יום', /GARDEN_DUP_DAYS \* 86400000/],
 ['רק ותיקה ממני', /if \(his > mine\) continue;/],
 ['ומדלג על סגורות', /if \(c\.closure\) continue;/]].forEach(function (t) {
  ok('🔴 ' + t[0] + ' — זהה בשרת ובלקוח',
     t[1].test(dupC) && t[1].test(dupS));
});
ok('⚠️ ו-GARDEN_DUP_DAYS זהה בשני הצדדים',
   /var GARDEN_DUP_DAYS = 14;/.test(DS) && /var GARDEN_DUP_DAYS = 14;/.test(GS));
/* 🔴 משימה שהמנהל שינה חייבת להגיע ל-Firestore מיד. */
ok('🔴 כתיבה מסנכרנת גם את המשימות, לא רק את הדיווחים',
   /if \(taskIds\.length\) gardenTaskSyncSome_\(ss, taskIds\);/.test(GS));
ok('ומספר הפנייה והתמונות נכנסים למסמך',
   /function gardenTaskSyncSome_[\s\S]{0,1600}refs\.repOf\[o\.id\]/.test(GS));

section('10. 🔴 הגיליון הוא הגיבוי');
['gardenReports', 'gardenTasks', 'gardenLog'].forEach(function (c) {
  ok('🔴 ' + c + ' בגיבוי השעתי',
     new RegExp("collection: '" + c + "',\\s*tab: BK_PREFIX").test(GS));
});
/* ⚠️ כיוון אחד בלבד — טאב גיבוי נפרד, לא הטאב החי. */
ok('⚠️ ולטאב גיבוי נפרד ולא לטאב החי',
   !/collection: 'gardenReports',\s*tab: GARDEN_REPORTS_SHEET/.test(GS));

console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
