/* מראת הגינון — Firestore ⇐ הגיליון  (2026-09-17, ממצא 05)
   הרצה:  node tools/test-garden-mirror.js

   🔴🔴 מה שהבדיקה הזאת שומרת עליו, במילים של מה שכבר קרה:
   ב-16.9 הודלק `gardenWriteToFirestore`. הדפדפן כתב דיווח ישירות
   ל-Firestore בלי שורה בגיליון, `gardenDataSyncAll_` השעתי בנה את
   המפה **מהגיליון**, ו-`fsSweepOrphans_` מחק כל מסמך שאין לו שורה.
   כל דיווח שנכתב מהדפדפן נמחק תוך שעה. הדגל כובה באותו ערב.
   🔑 הכלל שנולד שם: **סחיפת יתומים מניחה כותב אחד ויחיד.**

   ולכן הבדיקה בודקת שלושה מנעולים ולא אחד, ובנוסף את החורים שנפתחים
   בצד השני — כתיבות של Apps Script שכבר לא מגיעות ל-Firestore לבד. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 320) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');

section('1. 🔴🔴 שלושה מנעולים מול הסחיפה');
ok('gardenFsOwns_ קיימת וקוראת את הדגל', /function gardenFsOwns_\(\)[\s\S]{0,200}gardenWriteToFirestore === true/.test(GS));
ok('⚠️ ובספק — הגיליון', /catch \(e\) \{ return false; \}/.test((GS.match(/function gardenFsOwns_[\s\S]*?\n\}/)||[''])[0]));
ok('🔴 מנעול 1א — gardenTasksSyncAll_ מסרבת לרוץ',
   /function gardenTasksSyncAll_[\s\S]{0,900}if \(gardenFsOwns_\(\)\) \{ out\.ok = true; out\.skipped = 'fs-owns'; return out; \}/.test(GS));
ok('🔴 מנעול 1ב — gardenReportsSyncAll_ מסרבת לרוץ',
   /function gardenReportsSyncAll_[\s\S]{0,600}if \(gardenFsOwns_\(\)\) \{ out\.ok = true; out\.skipped = 'fs-owns'; return out; \}/.test(GS));
ok('⚠️ והיציאה היא ok:true — הקוראים סופרים על זה ולא צריכים לקרוס',
   (GS.match(/out\.ok = true; out\.skipped = 'fs-owns'/g) || []).length === 2);
ok('🔴 מנעול 2 — סחיפת היתומים של הדיווחים מותנית',
   /if \(!gardenFsOwns_\(\)\) fsSweepOrphans_\(FS_GARDEN_REPORTS, live, out\);/.test(GS));
ok('🔴 מנעול 2 — וגם של המשימות',
   /if \(!gardenFsOwns_\(\)\) fsSweepOrphans_\(FS_GARDEN_TASKS, live, out\);/.test(GS));
ok('🔴 ולא נשארה אף קריאת סחיפה לא-מותנית בגינון',
   !/\n\s+fsSweepOrphans_\(FS_GARDEN_(TASKS|REPORTS)/.test(GS));

section('2. המראה עצמה — מה היא כן עושה');
const mir = (GS.match(/function gardenMirrorOne_[\s\S]*?\n\}/) || [''])[0];
ok('gardenMirrorOne_ קיימת', !!mir);
ok('🔴 שאילתה שנכשלה = לא נוגעים בכלום',
   /catch \(e\) \{[\s\S]{0,200}out\.ok = false;[\s\S]{0,140}return;/.test(mir), mir);
ok('🔴 אוסף ריק מול טאב מלא = דילוג, לא ניקוי',
   /if \(!docs\.length && n\) \{[\s\S]{0,200}return;/.test(mir), mir);
ok('🔴🔴 והמראה **אינה מוחקת שורות** — רק סופרת',
   /if \(rid2 && !seen\[rid2\]\) out\.orphanRows\+\+;/.test(mir) &&
   !/deleteRow/.test(mir), mir);
ok('⚠️ מזהה כפול בגיליון נרשם ולא נבלע — ההתאמה הראשונה קובעת',
   /if \(rowOf\[rid\] === undefined\) rowOf\[rid\] = i;/.test(mir) &&
   /CBA-DUP-ROW/.test(mir), mir);
ok('⚠️ עמודה מחוץ לרשימת ההיתר אינה נגעת',
   /if \(fld === undefined\) continue;/.test(mir), mir);
ok('נעילה על כל הריצה', /LockService\.getScriptLock\(\)/.test((GS.match(/function gardenMirrorToSheet_[\s\S]*?\n\}/)||[''])[0]));
ok('⚠️ ותפוס = דילוג, לא כתיבה חלקית', /out\.skipped = 'busy'/.test(GS));

section('3. 🔴 רשימות ההיתר — מה שאסור שיידרס');
ok("'שם מדווח' אינו במפה — הוא כלל לא במסמך", !/'שם מדווח':/.test(GS));
ok("'טלפון' אינו במפה", !/'טלפון': '/.test(GS));
ok("'משוב' אינו במפה — הגיליון הוא מקורו", !/'משוב': '/.test(GS));
ok("'עודכן על ידי' אינו במפה — הוא הוחרג מהמסמך בכוונה",
   !/'עודכן על ידי': '/.test(GS) && /GARDEN_TASK_SKIP_FIELDS = \{ updatedBy: 1 \}/.test(GS));
/* ⚠️ נבדק על **אופן הקריאה** ולא על היעדר המילה: שתי הקריאות
   יושבות זו ליד זו, ולכן חיפוש "אין skipBlank ליד" נופל על השכנה. */
ok('🔴 במשימות ערך ריק **כן** נכתב — אחרת פתיחה מחדש לא הייתה מנקה סגירה',
   /GARDEN_TASK_MIRROR_COLS, \{\}, out\)/.test(GS));
ok('🔴 ובדיווחים ריק **אינו** נכתב — אין מסלול שבו תיאור הופך לריק',
   /GARDEN_REPORT_MIRROR_COLS, \{ skipBlank: true \}, out\)/.test(GS) &&
   /if \(opts\.skipBlank && String\(nxt\) === ''\) continue;/.test(GS));
ok("'סגירה' כן במפת המשימות", /'סגירה': 'closure'/.test(GS));
ok('מערך (תמונות) מפורק למחרוזת מופרדת בפסיקים',
   /\[object Array\]'\) return v\.join\(','\)/.test(GS));

section('4. הסדר בעבודה השעתית');
/* ⚠️ חיתוך לפי מיקום ולא ב-regex: `fsBackupIncremental_` מופיע גם
   בהמשך הקובץ, ו-`[\s\S]*?` בלע פונקציות שלמות אחרי הפעולה השעתית —
   כך שסדר הקריאות שנמדד היה של אזור אחר לגמרי. */
const hjStart = GS.indexOf('function hourlyJobsRun_() {');
const hj = GS.slice(hjStart, GS.indexOf('fsBackupIncremental_(ss)', hjStart));
/* ⚠️ משווים **קריאות** ולא אזכורים: שמות הפונקציות מופיעים גם
   בהערות שמעליהן, ולכן `indexOf('gardenDataSyncAll_')` מצא את ההערה
   ודיווח סדר הפוך לגמרי מהסדר האמיתי בקוד. */
const iMir = hj.indexOf('gardenMirrorToSheet_(ss)');
const iMat = hj.indexOf('gardenMaterializeWeek_(ss, gardenWeekKey_())');
const iSyn = hj.indexOf('gardenDataSyncAll_(ss)');
ok('שלוש הקריאות נמצאו בפעולה השעתית', iMir > -1 && iMat > -1 && iSyn > -1,
   iMir + '/' + iMat + '/' + iSyn);
ok('🔴 המראה רצה לפני gardenMaterializeWeek_', iMir < iMat, iMir + '/' + iMat);
ok('🔴 ולפני gardenDataSyncAll_', iMir < iSyn, iMir + '/' + iSyn);
ok('⚠️ והיא כותבת ללוג רק כשקרה משהו', /if \(gmr\.added \|\| gmr\.updated \|\| gmr\.orphanRows \|\| gmr\.errors\.length\)/.test(GS));
ok('⚠️ כשל שלה אינו מפיל את שאר העבודה השעתית',
   /gardenMirrorToSheet_ נכשל/.test(GS));

section('5. 🔴 חור הנפילה-לאחור שנפתח עם הדגל');
const mat = (GS.match(/function gardenMaterializeWeek_[\s\S]*?\n\}/) || [''])[0];
ok('משימות השגרה החדשות נדחפות ל-Firestore בעצמן',
   /if \(newIds\.length\) gardenTaskSyncSome_\(ss, newIds\);/.test(mat), mat);
ok('⚠️ ורק המזהים החדשים, לא סנכרון מלא', /var newIds = add\.map/.test(mat), mat);
ok('⚠️ וכשל בדחיפה נרשם ואינו מבטל את היצירה',
   /דחיפה ל-Firestore נכשלה/.test(mat), mat);
ok('🔴 שאר הכתיבות כבר מכוסות ב-gardenAfterWrite_',
   /function gardenAfterWrite_/.test(GS) && /gardenTaskSyncSome_/.test(GS));

section('6. הדגל עדיין כבוי — השינוי רדום');
ok('🔴 ברירת המחדל בלקוח היא false',
   /var GARDEN_WRITE_TO_FIRESTORE = false;/.test(R('js/data/dataService.js')));
ok('פעולת הרצה יזומה קיימת לאימות', /action === 'gardenMirror'/.test(GS));
ok('⚠️ והיא מנהל-על בלבד',
   /function handleGardenMirror_[\s\S]{0,260}authorize_\(ss, p, PERM_SUPER\)/.test(GS));
ok('⚠️ ובדגל כבוי המראה יוצאת מיד', /if \(!gardenFsOwns_\(\)\) \{ out\.skipped = 'flag-off'; return out; \}/.test(GS));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
