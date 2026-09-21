/* גל 3 — פעולות המנהל נכתבות מהדפדפן ל-Firestore  (2026-09-18)
   הרצה:  node tools/test-wave3-garden-writes.js

   🔴🔴 מה שהבדיקה הזאת שומרת עליו:
   עד היום עשר הפעולות עברו דרך Apps Script, ושם ישבו ההחלטות — מי רשאי
   לסגור, מה מותר על משימה סגורה, ומתי חובה לכתוב לתושב. מרגע שהדפדפן
   כותב ישירות, **שומר שיושב רק בדפדפן הוא לא שומר.**
   לכן רוב הבדיקות כאן הן על `firestore.rules`, לא על הלקוח. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 320) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DS = R('js/data/dataService.js');
const RU = R('firestore.rules');
const SY = R('js/screens/sysStatus.js');

section('1. 🔴🔴 השומרים — בכללי האבטחה, לא בדפדפן');
const upd = (RU.match(/function gtTeamUpdateOk[\s\S]*?\n    \}/) || [''])[0];
ok('gtTeamUpdateOk מתיר את שדות הדואר', /'notify', 'notifyPending', 'notifyNote'/.test(upd), upd);
ok("🔴 ושדות הדואר **אינם** ב-gtFields — תושב לא יכול לשלוח מייל בשם הוועד",
   !/'notify'/.test((RU.match(/function gtFields[\s\S]*?\n    \}/) || [''])[0]));

const mgr = (RU.match(/function gtMgr[\s\S]*?\n    \}/) || [''])[0];
ok('gtMgr = הרשאת גינון **ולא** חיצוני', /hasPerm\('גינון'\) && m\(\)\.isExternal == false/.test(mgr), mgr);

const cv = (RU.match(/function gtClosureValueOk[\s\S]*?\n    \}/) || [''])[0];
ok('סיבת סגירה מהרשימה הסגורה בלבד',
   /'בוצע', 'הועבר לבינוי', 'בוטל', 'לא רלוונטי', 'אוחד'/.test(cv), cv);

const ca = (RU.match(/function gtClosureAuthOk[\s\S]*?\n    \}/) || [''])[0];
ok("🔴 'בוצע' פתוח לגנן החיצוני — הכרעת יועד מ-9.9 (\"הסימון סוגר\")",
   /gtNext\('closure'\) == 'בוצע'/.test(ca), ca);
ok('🔴 וכל סיבה אחרת — מנהל בלבד', /gtMgr\(\)/.test(ca), ca);

const cn = (RU.match(/function gtCloseNoteOk[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 סגירת פנייה של תושב מחייבת טקסט', /gtNext\('note'\) != ''/.test(cn), cn);
ok("🔑 וההבחנה היא repId ולא kind — הלקוח כותב 'תקלה' והשרת מכיר 'דיווח תושב'",
   /gtCur\('repId'\) == ''/.test(cn) && !/kind/.test(cn), cn);

const cl = (RU.match(/function gtClosedOk[\s\S]*?\n    \}/) || [''])[0];
ok('🔴🔴 משימה סגורה — מנהל פותח הכול', /gtMgr\(\)/.test(cl), cl);
ok('⚠️ גנן חיצוני — ניקוי דגל בלבד', /hasOnly\(\['flag', 'updatedAt'\]\)/.test(cl), cl);
ok('⚠️ או פתיחה מחדש של "בוצע" בתוך חלון הערעור',
   /gtCur\('closure'\) == 'בוצע' && gtNext\('closure'\) == '' &&\s*\n\s*gtWithinDispute\(\)/.test(cl), cl);

const wd = (RU.match(/function gtWithinDispute[\s\S]*?\n    \}/) || [''])[0];
ok('חלון הערעור = 14 יום, כמו GARDEN_DISPUTE_DAYS', /duration\.value\(14, 'd'\)/.test(wd), wd);
ok('⚠️ ובלי חותמת זמן החלון פתוח — כמו gardenWithinDispute_ שמחזיר true',
   /!\(resource\.data\.get\('approvedAt', null\) is timestamp\)/.test(wd), wd);
ok('🔴 ו-GARDEN_DISPUTE_DAYS בשרת באמת 14 — שני הצדדים לא סטו',
   /var GARDEN_DISPUTE_DAYS = 14;/.test(GS));

const nt = (RU.match(/function gtNotifyOk[\s\S]*?\n    \}/) || [''])[0];
ok('שם התבנית מרשימה סגורה', /GARDEN_COMPLETED', 'GARDEN_REPORT_DECLINED'/.test(nt), nt);
ok('🔴 וכל השומרים מחוברים לשער אחד',
   /function gtUpdateOk\(\) \{[\s\S]*?gtTeamUpdateOk\(\) && gtClosureValueOk\(\) && gtClosureAuthOk\(\) &&[\s\S]*?gtCloseNoteOk\(\) && gtClosedOk\(\) && gtNotifyOk\(\)/.test(RU));
ok('והשער הוא מה שמחווט ל-allow update',
   /allow update: if gtUpdateOk\(\) \|\| gtReportPhotosOk\(\) \|\| gtReportFlagOk\(\);/.test(RU));
ok('⚠️ ומסלול התמונות של התושב נשאר עצמאי — לא נבלע בשער הצוות',
   /gtReportPhotosOk\(\)/.test(RU));

section('2. הדפדפן — המנוע');
const eng = (DS.match(/function gardenFsTask\([\s\S]*?\n  \}/) || [''])[0];
ok('gardenFsTask קיימת', !!eng);
['done','undo','note','defer','approve','close','return','plan','clearflag','block'].forEach(function (op) {
  ok('עשר הפעולות — ' + op, new RegExp('op === "' + op + '"').test(eng), null);
});
ok('🔴 סגירה כותבת חותמת זמן ולא מחרוזת — בלעדיה חלון הערעור לא ניתן לאכיפה',
   /patch\.approvedAt = CBA\.fb\.serverNow/.test(eng), eng);
ok('⚠️ "שבוע מקורי" נכתב פעם אחת בלבד', /if \(!cur\.firstWeek\) patch\.firstWeek = cur\.week;/.test(eng), eng);
ok('⚠️ ושיבוץ ראשון בלבד שולח מייל', /if \(!cur\.week && isReport\) notify = "GARDEN_PLANNED";/.test(eng), eng);
ok('🔴 permission-denied מתורגם למשפט בעברית ולא נזרק כמו שהוא',
   /permission-denied/.test((DS.match(/function gardenFsErr[\s\S]*?\n  \}/) || [''])[0]));
ok('היומן נרשם אחרי שהכתיבה הצליחה, לא לפניה',
   eng.indexOf('CBA.fb.updateDoc') < eng.indexOf('gardenLogAppend'), eng);

section('3. 🔑 המיילים — הרחבה של mailPending, בלי מנגנון חדש');
ok('הדפדפן מרים דגל ולא שולח', /patch\.notifyPending = true;/.test(eng), eng);
ok('🔴 והקריאה היא שגר-ושכח — אין callback שממתינים לו',
   /CBA\.sheets\.postRead\("gardenNotifyTask", \{ id: String\(taskId\) \}, function \(\) \{\}\);/.test(DS));
const snd = (GS.match(/function gardenSendTaskMail_[\s\S]*?\n\}/) || [''])[0];
ok('gardenSendTaskMail_ קיימת', !!snd);
ok('⚠️ אידמפוטנטית — דגל כבוי = יוצאים', /if \(t\.notifyPending !== true\) \{ out\.ok = true; return out; \}/.test(snd), snd);
ok('🔑 הנמענים נשלפים בשרת מטאב התושבים לפי familyId — הקו האדום',
   /emailsForFamilyId_\(ss, famId\)/.test(snd) && /txFamilyNames_\(ss\)/.test(snd), snd);
ok('🔴 ותבנית שאינה ברשימה מורידה את הדגל במקום לחזור עליה כל שעה',
   /GARDEN_TASK_TEMPLATES\.indexOf\(tpl\) === -1/.test(snd), snd);
ok("⚠️ ו-GARDEN_REOPENED שומר על צורת שורת הרווח של הסיבה",
   /tpl === 'GARDEN_REOPENED'/.test(snd), snd);
ok('הרשת השעתית קיימת ושואלת שוויון על שדה בודד',
   /fsQuery_\(FS_GARDEN_TASKS, 'notifyPending', 'EQUAL', true, 200\)/.test(GS));
ok('והיא מחוברת לעבודה השעתית', /var gtn = gardenTaskNotifyPending_\(ss\);/.test(GS));
ok('הפעולה מנותבת ב-doPost', /case 'gardenNotifyTask':\s+return json_\(gardenNotifyTask_\(ss, body\)\);/.test(GS));

section('4. הדגל — התנאי להעברה בסבב אחד');
ok('gardenWritesFromBrowser רשום בשרת', /'gardenWritesFromBrowser'/.test(GS));
ok('ומופיע במסך "מצב המערכת"', /gardenWritesFromBrowser: \[/.test(SY));
ok('🔴 וברירת המחדל שלו כבויה', /gardenWritesFromBrowser: \[[^\]]*, false\]/.test(SY));
const on = (DS.match(/function gardenWritesOn[\s\S]*?\n  \}/) || [''])[0];
ok('⚠️ ונבדק יחד עם קריאת המשימות — לעולם לא לבדו',
   /gardenTasksFromFirestore/.test(on), on);
ok('🔴 וכל מסלול כתיבה עובר דרכו',
   (DS.match(/if \(gardenWritesOn\(\)\) return garden/g) || []).length >= 3, DS);

section('5. רשימות הגינון — מ-Firestore (סעיף 2)');
const meta = (RU.match(/match \/gardenMeta\/\{doc\}[\s\S]*?\n    \}/) || [''])[0];
ok('\U0001f534 הקריאה נפתחה לכל חבר פעיל', /allow read: if isMember\(\);/.test(meta), meta);
/* ⚠️ זה היה החסם האמיתי: `canSeeGardenTasks` דורש הרשאת גינון,
   ולכן **מסך הדיווח של התושב** לא יכול לקרוא את הרשימות
   מ-Firestore ונאלץ ללכת ל-Apps Script. */
ok('\U0001f511 והכתיבה נשארה סגורה', /allow write: if false;/.test(meta), meta);
ok('והלקוח קורא אותן מ-Firestore עם נפילה לאחור',
   /fsFirstRead\("gardenMeta", true,/.test(DS) &&
   /CBA\.fb\.readDoc\("gardenMeta", "lists"/.test(DS));
ok('⚠️ והנפילה לאחור עדיין קיימת — לא מחקנו את המסלול הישן',
   /CBA\.sheets\.get\(\{ action: "gardenMeta" \}, done\);/.test(DS));

section('6. מה שאסור היה להישבר');
ok('🔴 מחיקת דיווח עדיין אסורה לכל דפדפן — החלטה מכוונת',
   /allow delete: if false;/.test((RU.match(/match \/gardenReports\/\{id\}[\s\S]*?\n    \}/) || [''])[0]));
ok('🔴 והמחיקות נשארו ב-Apps Script',
   /case 'gardenTaskDelete':\s+return json_\(gardenWrite_/.test(GS) &&
   !/gardenWritesOn\(\)\) return gardenFsTaskDelete/.test(DS));
ok('מסלול הדיווח של התושב לא נגע', /function gardenReportFsWrite/.test(DS));
ok('והמראה עדיין אינה מוחקת שורות',
   !/deleteRow/.test((GS.match(/function gardenMirrorOne_[\s\S]*?\n\}/) || [''])[0]));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
