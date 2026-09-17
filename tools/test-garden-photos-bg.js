/* תמונות גינון — מקביל, ברקע, ובלי כשל שקט  (2026-09-17, החלטת יועד)
   הרצה:  node tools/test-garden-photos-bg.js

   🔴 המדידה שהובילה לשינוי: כל תמונה היא קריאה נפרדת ל-Apps Script,
   וכולן רצו בזו אחר זו. עם חציון מדוד של 3.2 שניות לקריאה, דיווח עם
   שלוש תמונות הוא ארבע קריאות סדרתיות — **וזה, ולא הכתיבה לגיליון,
   היה רוב 70 השניות שנמדדו ב-16.9.**

   🔴🔴 והחור שהשינוי הזה חייב לסגור: `photosIncomplete` נכתב עד היום
   **בסוף** ההעלאה, כלומר הוא סימן "העלאה שהסתיימה עם כשלים". דפדפן
   שנסגר באמצע לא הגיע לכתיבה ההיא בכלל, והסריקה השעתית — ששואלת
   `photosIncomplete == true` — לא ראתה את הדיווח לעולם. מרגע שההעלאה
   ברקע והתושב ממשיך לגלוש, זה המסלול הרגיל ולא מקרה קצה. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const DS = R('js/data/dataService.js');
const RG = R('js/screens/resGarden.js');
const GS = R('apps-script/Code.gs');
const RULES = R('firestore.rules');

section('1. 🔴 העלאה במקביל — ולא בזו אחר זו');
const up = (DS.match(/function gardenUploadPhotos\([\s\S]*?\n  \}/) || [''])[0];
ok('הפונקציה קיימת', !!up);
ok('🔴 כל התמונות משוגרות בלולאה אחת', /photos\.forEach\(function \(ph, idx\)/.test(up), up);
ok('🔴 ואין יותר קריאה רקורסיבית שממתינה לקודמת',
   !/i\+\+; next\(\);/.test(up) && !/function next\(\)/.test(up), up);
ok('⚠️ הסדר נשמר לפי אינדקס ולא לפי מי סיים ראשון',
   /slot\[idx\] = id/.test(up) && /for \(var k = 0; k < n; k\+\+\) if \(slot\[k\]\)/.test(up), up);
ok('⚠️ תמונה שנפלה אינה מפילה את האחרות — אין Promise.all',
   !/Promise\.all/.test(up) && /failed\+\+/.test(up), up);
ok('⚠️ ומונה הסיום יורה פעם אחת בלבד', /if \(settled\) return;/.test(up), up);
ok('רשימה ריקה חוזרת מיד', /if \(!n\) return done\(\[\], 0\);/.test(up), up);

section('2. 🔴🔴 הדגל נכתב מראש ויורד בסוף — לא נכתב בסוף');
ok('🔴 המסמך נולד עם photosIncomplete לפי מספר התמונות',
   /photosIncomplete: photos\.length > 0,/.test(DS));
ok('🔴 והכיבוי מותנה בכך שהכול נחת',
   /photosIncomplete: ids\.length < photos\.length,/.test(DS));
ok('⚠️ ולא בנוסח הישן שנכתב רק כשהיה כשל',
   !/if \(failed > 0\) patch\.photosIncomplete = true;/.test(DS));
ok('⚠️ והשדה מותר ביצירה בכללי האבטחה', /'photosIncomplete'/.test(RULES));
ok('🔴 והסריקה השעתית עדיין שואלת בדיוק את הדגל הזה',
   /fsQuery_\(FS_GARDEN_REPORTS, 'photosIncomplete', 'EQUAL', true/.test(GS));
ok('⚠️ ומתריעה פעם אחת לכל דיווח', /if \(d\.photosNudged === true\) continue;/.test(GS));

section('3. 🔴 ההגשה נסגרת לפני התמונות');
const w = (DS.match(/function gardenReportFsWrite[\s\S]*?\n  \}\n/) || [''])[0];
ok('הפונקציה קיימת', !!w);
const iCb = w.indexOf('cb({ ok: true, id: repId');
const iUp = w.indexOf('gardenUploadPhotos(');
ok('🔴 cb נקרא לפני ההעלאה', iCb > -1 && iUp > -1 && iCb < iUp, iCb + '/' + iUp);
ok('🔴 והמסמך עדיין נכתב לפני שניהם',
   w.indexOf('createDoc("gardenReports"') < iCb);
ok('⚠️ התושב מקבל כמה תמונות עוד בדרך', /photosPending: photos\.length/.test(w), w);
/* ⚠️ נבדק דרך `postReadProgress`, שהוא מי שרושם את המאזין בפועל —
   חיפוש המילה `beforeunload` עצמה נכשל על ההערה שמסבירה את הכלל. */
ok('⚠️ ההעלאה אינה עוברת ב-postReadProgress — הוא מי שרושם beforeunload',
   !/postReadProgress/.test(w), w);
ok('⚠️ והעלאת תמונה בודדת היא postRead רגיל',
   /CBA\.sheets\.postRead\("gardenPhotoOne"/.test(DS));

section('4. 🔴 כשל בכתיבה חוזרת אינו שקט');
ok('gardenPhotoWarn קיימת', /function gardenPhotoWarn\(what, id, err\)/.test(DS));
ok('🔴 היא עוברת ב-CBA.diag הקיים ולא במנגנון חדש',
   /CBA\.diag\.error\(line, "dataService\.js"\)/.test(DS));
ok('🔴 כשל בעדכון מסמך הדיווח נרשם',
   /if \(eM\) gardenPhotoWarn\("מסמך הדיווח לא עודכן בתמונות"/.test(DS));
ok('🔴 וכשל בעדכון מסמך המשימה נרשם — הוא נדחה לתושב רגיל לפי gtTeamUpdateOk',
   /if \(eT\) gardenPhotoWarn\("מסמך המשימה לא עודכן בתמונות"/.test(DS));
ok('⚠️ ואכן הכלל דורש הרשאת גינון לעדכון משימה',
   /function gtTeamUpdateOk\(\) \{\s*\n\s*return hasPerm\('גינון'\)/.test(RULES));
ok('⚠️ הדגל נשאר דלוק כשהכתיבה החוזרת נכשלה — אין ניקוי בענף השגיאה',
   !/if \(eM\)[\s\S]{0,160}photosIncomplete: false/.test(DS));

section('5. המסך — בלי מד התקדמות, ועם האמת על הרקע');
ok('🔴 אין יותר "מעלה תמונה N מתוך M · אחוז" בהגשה',
   !/מעלה תמונה " \+ n \+ " מתוך "/.test(RG));
ok('🔴 והתושב נאמר לו שהתמונות ממשיכות לעלות',
   /התמונות ממשיכות לעלות ברקע/.test(RG));
ok('⚠️ בלשון יחיד כשיש אחת', /התמונה ממשיכה לעלות ברקע/.test(RG));
ok('⚠️ ורק כשבאמת יש תמונות בדרך', /var pend = res\.photosPending \|\| 0;/.test(RG));
ok('הבאנר "חסרות תמונות · להשלמה" נשאר — זו הדרך לתקן',
   /r\.photosIncomplete[\s\S]{0,200}חסרות תמונות בדיווח הזה/.test(RG));
ok('⚠️ מסלול הנפילה לאחור עדיין מקבל חיווי זמן', /function stageText\(sec\)/.test(RG));

section('6. מסך ההשלמה — התושב כן ממתין שם');
const cp = (DS.match(/function gardenCompletePhotos[\s\S]*?\n  \}\n/) || [''])[0];
ok('הפונקציה קיימת', !!cp);
ok('🔴 והיא עדיין מחזירה רק בסוף — אין שם cb מוקדם',
   cp.indexOf('cb({ ok:') > cp.indexOf('gardenUploadPhotos('), cp);
ok('⚠️ הדגל שם נגזר מ-failed ולא ממספר התמונות שנבחרו',
   /photosIncomplete: failed > 0,/.test(cp), cp);
ok('⚠️ ובמסך אין אחוזים', !/Math\.max\(pct, 1\) \+ "%"/.test(RG));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
