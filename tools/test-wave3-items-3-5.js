/* סעיפים 3–5 — תוכנית העבודה, איחוד ומשוב  (2026-09-21)
   הרצה:  node tools/test-wave3-items-3-5.js

   🔴 שלושתם היו חסומים ע"י החלטה שהייתה נכונה כשהגיליון היה מקור האמת.
   מה שנבדק כאן הוא שההיפוך נעשה **בלי לוותר על השומרים** שהיו בשרת. */
const fs = require('fs');
const path = require('path');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DS = R('js/data/dataService.js');
const RU = R('firestore.rules');

section('1. 🔴 הרגרסיה שנתפסה בקריאה חוזרת — איחוד לגנן החיצוני');
const ca = (RU.match(/function gtClosureAuthOk[\s\S]*?\n    \}/) || [''])[0];
ok("'אוחד' פתוח לכל בעל הרשאת גינון, לא רק למנהל",
   /gtNext\('closure'\) == 'אוחד'/.test(ca), ca);
ok('🔑 וזה תואם לשרת, שכותב במפורש שאיחוד אינו חסום לגנן',
   /איחוד \*\*אינו\*\* חסום לגנן/.test(GS));

section('2. סעיף 3 — תוכנית העבודה');
const gp = (RU.match(/match \/gardenPlan\/\{id\}[\s\S]*?\n    \}/) || [''])[0];
ok('הכתיבה נפתחה למנהל', /allow create, update: if gpWriteOk\(\) && gpShapeOk\(\);/.test(gp), gp);
ok('🔴 ולא לגנן החיצוני',
   /hasPerm\('גינון'\) && m\(\)\.isExternal == false/.test((RU.match(/function gpWriteOk[\s\S]*?\n    \}/) || [''])[0]));
const gsh = (RU.match(/function gpShapeOk[\s\S]*?\n    \}/) || [''])[0];
ok('רשימת שדות סגורה', /hasOnly\(gpFields\(\)\)/.test(gsh), gsh);
ok('תדירות מהרשימה הסגורה', /'שבועי', 'דו-שבועי', 'חודשי', 'שנתי'/.test(gsh), gsh);
ok('🔴 ומחזור דו-שבועי חייב עוגן — אותה בדיקה שבשרת',
   /freq != 'דו-שבועי' \|\|[\s\S]{0,80}firstWeek', ''\) != ''/.test(gsh), gsh);
ok('⚠️ והקריאה נשארה canSeePlan — חסומה לחיצוני', /allow read: if canSeePlan\(\);/.test(gp), gp);
const ps = (DS.match(/function gardenPlanFsSave[\s\S]*?\n  \}/) || [''])[0];
ok('הלקוח בודק את אותם תנאים לפני הכתיבה',
   /דו-שבועי/.test(ps) && /תדירות לא מוכרת/.test(ps), ps);
ok('🔴 מזהה חדש נבדק שהוא פנוי לפני כתיבה — createDoc דורס',
   /if \(!e2 && existing\) return tryId\(attempt \+ 1\);/.test(ps), ps);
ok('⚠️ ועדכון משתמש ב-mergeDoc כדי לא לאפס את order',
   /delete patch\.order;/.test(ps), ps);

section('3. סעיף 4 — איחוד כפילויות');
const mg = (DS.match(/function gardenFsMerge[\s\S]*?\n  \}/) || [''])[0];
ok('שתי המשימות נקראות לפני כל כתיבה', (mg.match(/readDoc\("gardenTasks"/g) || []).length === 2, mg);
ok('🔴 אי אפשר לאחד משימה סגורה, ולא לתוך סגורה',
   /המשימה כבר סגורה/.test(mg) && /לאחד לתוך משימה סגורה/.test(mg), mg);
ok('הדיווחים של הנבלעת מופנים אל הבולעת',
   /taskId: parentId, mergedInto: parentRep/.test(mg), mg);
ok('⚠️ והמשימה נסגרת רק אחרי שכל הדיווחים טופלו',
   /if \(--left <= 0\) closeChild\(\);/.test(mg), mg);
ok('המייל יוצא דרך אותו מנגנון דגל', /notify: "GARDEN_REPORT_MERGED", notifyPending: true/.test(mg), mg);

section('4. סעיף 5 — משוב התושב');
const fb = (DS.match(/function gardenFsFeedback[\s\S]*?\n  \}/) || [''])[0];
ok('משוב כפול נחסם', /כבר נתת משוב על הדיווח הזה/.test(fb), fb);
ok('🔴 משוב שלילי מרים דגל ואינו פותח מחדש',
   /flag: "דורש בדיקה חוזרת"/.test(fb) && !/closure: ""/.test(fb), fb);
const rf = (RU.match(/function gtReportFlagOk[\s\S]*?\n    \}/) || [''])[0];
ok('gtReportFlagOk קיים', !!rf);
ok('🔴 שני שדות בלבד', /hasOnly\(\['flag', 'updatedAt'\]\)/.test(rf), rf);
ok('🔴 וערך יחיד אפשרי — לא כל דגל', /flag == 'דורש בדיקה חוזרת'/.test(rf), rf);
ok('🔴🔴 וההצלבה repId→familyId — בלעדיה כל תושב מרים דגל על כל משימה',
   /gardenReports\/\$\(resource\.data\.repId\)\)\s*\n\s*\.data\.familyId == myFamilyId\(\)/.test(rf), rf);
ok('והוא מחווט ל-allow update', /allow update: if gtUpdateOk\(\) \|\| gtReportPhotosOk\(\) \|\| gtReportFlagOk\(\);/.test(RU));
ok('המייל למנהלים עבר לשרת כקריאת מייל בלבד',
   /function gardenFeedbackNotify_/.test(GS) && /notifyAdmins_\(ss, PERM_GARDEN, 'ADMIN_GARDEN_NEGATIVE_FEEDBACK'/.test(GS));
ok('🔑 והשם נשלף בשרת מטאב התושבים',
   /txFamilyNames_\(ss\)/.test((GS.match(/function gardenFeedbackNotify_[\s\S]*?\n\}/) || [''])[0]));
ok('⚠️ ועל משוב חיובי לא נשלח כלום',
   /!== 'שלילי'\) return \{ ok: true, sent: 0 \};/.test(GS));

section('5. הכול מאחורי אותו דגל');
['gardenPlanFsSave','gardenPlanFsDelete','gardenPlanFsActive','gardenFsMerge','gardenFsFeedback']
  .forEach(function (fn) {
    ok('עובר דרך gardenWritesOn — ' + fn,
       new RegExp('if \\(gardenWritesOn\\(\\)\\) return ' + fn).test(DS), null);
  });
ok('🔴 והמסלול הישן לא נמחק — כיבוי הדגל מחזיר הכול',
   /CBA\.sheets\.postRead\("gardenPlanSave", payload, cb\);/.test(DS) &&
   /CBA\.sheets\.postRead\("gardenMerge", \{ id: id, into: into \}, cb\);/.test(DS) &&
   /CBA\.sheets\.postRead\("gardenFeedback", \{ id: id, positive: positive, note: note \}, cb\);/.test(DS));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
