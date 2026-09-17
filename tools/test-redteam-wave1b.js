/* בדיקות למנה ב' של גל 1 בצוות האדום (2026-09-17).
   הרצה:  node tools/test-redteam-wave1b.js

   ארבעה פריטים, ושלושה מהם אותה משפחה: **כתיבה שהצליחה במקום אחד
   ולא הגיעה למקום שהמסך קורא ממנו.**
     02 — נפילה לאחור שקטה ל-Apps Script, שקוראת מגיליון שמפגר עד שעה.
     28 — סגירת דיווח תושב שחוזרת אחורה אחרי רענון (מזהה כפול בטאב).
     20 — שורש: gardenFeedback לא החזירה taskId, ולכן דגל "דורש בדיקה
          חוזרת" נכתב לגיליון ולא הגיע ל-Firestore לעולם.
     מוקש — fsSet_ הוא החלפת מסמך, לא merge.

   ⚠️ כל הציפיות נכתבו לפני הרצה, והן משוקפות בשמות הבדיקות. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const GS    = R('apps-script/Code.gs');
const FSGS  = R('apps-script/Firestore.gs');
const DS    = R('js/data/dataService.js');
const FB    = R('js/data/firebase.js');
const APP   = R('js/app.js');
const HOME  = R('js/screens/home.js');
const GT    = R('js/screens/gardenTasks.js');
const SYS   = R('js/screens/sysStatus.js');

/* ============================================================================
   1. ממצא 02 — המדיניות
   ========================================================================== */
section('1. ממצא 02 — החלטה מול תקלה');

ok('🔴 תקלה אינה נופלת לאחור', /viaFailure\("no-user"\)/.test(DS) &&
   /viaFailure\("db:"/.test(DS) && /viaFailure\("firestore:"/.test(DS));
ok('🔴 ולא נשאר אף viaSheets על מסלול כשל',
   !/viaSheets\("no-user"\)/.test(DS) && !/viaSheets\("db:"/.test(DS) && !/viaSheets\("firestore:"/.test(DS));
ok('⚠️ אבל החלטה כן — disabled ו-flag-off',
   /viaSheets\("disabled"\)/.test(DS) && /viaSheets\("flag-off"\)/.test(DS));
ok('הכשל נושא סימן מכונתי', /cbaLoadFailed: true/.test(DS));
ok('🔴 וההודעה בעברית, כי 4 מסכים מציגים את res.error כמו שהוא',
   /error: "לא הצלחנו לטעון את הנתונים מהשרת\."/.test(DS));
ok('המדידה מסומנת failed ולא appsscript', /note\("failed", why\)/.test(DS));

section('1ב. מתג החירום');
ok('דגל אחד גורף, כבוי כברירת מחדל',
   /CBA\.fb\.flag\("appsScriptFallback", false\)/.test(DS));
ok('והוא ברשימה הסגורה בשרת', /'appsScriptFallback'\]/.test(GS));
ok('ומופיע במסך "מצב המערכת"', /appsScriptFallback: \["חירום/.test(SYS));
ok('⚠️ וברירת המחדל שמוצהרת במסך היא false (תואמת לקוד)',
   /appsScriptFallback: \[[^\]]*, false\]/.test(SYS));
ok('כשהוא דלוק — חוזרים ל-Apps Script והסיבה מסומנת',
   /if \(fallbackOn\(\)\) return viaSheets\("fallback:" \+ why\);/.test(DS));

section('1ג. "אין משתמש" מול "עוד לא"');
ok('🔴 pendingSignIn קיים ומפריד בין השניים', /var pendingSignIn = false;/.test(FB));
ok('userReady מיוצא', /userReady: userReady/.test(FB) && /expectUser: expectUser/.test(FB));
ok('⚠️ רק משתמש אמיתי משחרר את הממתינים',
   /if \(state\.user\) settleUser\(state\.user\);/.test(FB));
ok('🔴 והתחברות שנכשלה משחררת מיד — לא 12 שניות המתנה לשווא',
   (FB.match(/settleUser\(null\)/g) || []).length >= 3,
   'נמצאו ' + (FB.match(/settleUser\(null\)/g) || []).length);
ok('⚠️ בלי התחברות בדרך — ההתנהגות זהה לאתמול',
   /if \(!pendingSignIn\) return authReady\(cb, timeoutMs\);/.test(FB));
ok('userReady אינו תולה לנצח', /timeoutMs \|\| 12000/.test(FB));
ok('fsFirstRead משתמש בו, עם נפילה ל-authReady בלקוח ישן',
   /CBA\.fb\.userReady \|\| CBA\.fb\.authReady/.test(DS));
ok('🔴 וגם צד הכתיבה (txWriteOn) — אותו חור בכיוון ההפוך',
   (DS.match(/\(CBA\.fb\.userReady \|\| CBA\.fb\.authReady\)\.call/g) || []).length === 1 &&
   DS.indexOf('function txWriteOn') < DS.lastIndexOf('CBA.fb.userReady || CBA.fb.authReady'));
ok('🔴 expectUser נקראת ב-app.js לפני המשיכה',
   /CBA\.fb\.expectUser\(\)/.test(APP) &&
   APP.indexOf('CBA.fb.expectUser()') < APP.indexOf('CBA.sheets.load(function (ok, info)'));

section('1ד. צרכנים שהיו הופכים כשל לאפס');
ok('🔴 עמוד הבית לא מצייר "0 ממתינות" על כשל',
   /if \(!res \|\| !res\.ok\) \{ lazyCache\.gardenTs = 0; return done\(slotN, ""\); \}/.test(HOME));
ok('⚠️ וגם לא מטמין את האפס השקרי',
   HOME.indexOf('lazyCache.gardenTs = 0; return done(slotN, "")') <
   HOME.indexOf('lazyCache.garden = n;'));
ok('🔴 יומן המשימה מבחין בין "לא נטען" ל"ריק"',
   /לא הצלחנו לטעון את היומן/.test(GT) && /אין עדיין רשומות למשימה הזאת/.test(GT));

/* ============================================================================
   2. ממצא 28 + שורש 20
   ========================================================================== */
section('2. ממצא 28 — התאמה ראשונה מנצחת, בשני הצדדים');
ok('🔴 סנכרון המשימות עוצר אחרי ההתאמה הראשונה', /delete want\[o\.id\];/.test(GS));
ok('🔴 וגם סנכרון הדיווחים', /delete want\[id\];/.test(GS));
ok('⚠️ ומזהה כפול נרשם ללוג במקום להיבלע', /CBA-DUP-TASK/.test(GS));
ok('⚠️ וכשל כתיבה ל-Firestore אינו שקט יותר', /CBA-SYNC-FAIL gardenTaskSyncSome_/.test(GS) &&
   !/return n;\n  \} catch \(e\) \{ return 0; \}\n\}\n\n\/\*\* אחרי פעולת כתיבה/.test(GS));

section('2ב. שורש ממצא 20');
ok('🔴 gardenFeedback_ מחזירה taskId', /return \{ ok: true, taskId: taskId \};/.test(GS));
ok('⚠️ וההחרגה של gardenFeedback מ-addTask(body.id) נשארה (body.id הוא דיווח)',
   /action !== 'gardenFeedback' &&/.test(GS));
ok('ו-gardenAfterWrite_ קולטת res.taskId', /addTask\(res\.taskId\);/.test(GS));

/* ============================================================================
   3. המוקש
   ========================================================================== */
section('3. fsSet_ מול fsMerge_');
ok('🔴 fsMerge_ קיים ומשתמש ב-updateMask', /function fsMerge_/.test(FSGS) &&
   /updateMask\.fieldPaths=/.test(FSGS));
ok('⚠️ ושם שדה שאינו מזהה פשוט עטוף בגרשיים אחוריים',
   /\/\^\[A-Za-z_\]\[A-Za-z0-9_\]\*\$\/\.test\(k\)/.test(FSGS));
ok('🔴 שתי הכתיבות החלקיות עברו ל-fsMerge_',
   /fsMerge_\(fsDocPath_\(FS_GARDEN_REPORTS, id\),\s*\n\s*\{ mailPending: false/.test(GS) &&
   /fsMerge_\(fsDocPath_\(FS_GARDEN_REPORTS, docs\[i\]\.id\), \{ photosNudged: true \}\)/.test(GS));
ok('🔴 ולא נשארה שום fsSet_ עם אובייקט חלקי',
   !/fsSet_\([^)]*\{ mailPending/.test(GS) && !/fsSet_\([^)]*\{ photosNudged/.test(GS));

/* ההוכחה ההתנהגותית: fsMerge_ אמיתי מול fsFetch_ מדומה. */
section('3ב. fsMerge_ בפועל');
(function () {
  const box = { console, JSON, Object, String, encodeURIComponent, Error, RegExp, Date };
  vm.createContext(box);
  let seen = null;
  vm.runInContext(
    'function fsFields_(o){return o;}\n' +
    'function fsFetch_(p,m,pl){ __seen={path:p,method:m,payload:pl}; return {code:200,text:"{}"}; }\n' +
    FSGS.match(/function fsMerge_\(path, obj\) \{[\s\S]*?\n\}/)[0], box);
  box.fsMerge_('gardenReports/9', { mailPending: false, mailedAt: 'x' });
  seen = box.__seen;
  ok('נתיב נושא updateMask לכל שדה, ורק להם',
     seen && seen.path === 'gardenReports/9?updateMask.fieldPaths=mailPending&updateMask.fieldPaths=mailedAt',
     seen && seen.path);
  ok('⚠️ והשיטה נשארה patch', seen && seen.method === 'patch');
  box.fsMerge_('budgetTx/a', { 'ספק/נמען': 'x' });
  ok('🔴 שם עם לוכסן מקודד עם גרשיים אחוריים — הלוכסן כבר שבר קריאה פעם',
     box.__seen.path.indexOf('%60') !== -1, box.__seen.path);
  ok('אובייקט ריק אינו יוצא לרשת כלל',
     box.fsMerge_('x/y', {}) === null);
})();

/* ============================================================================
   4. גרסה
   ========================================================================== */
section('4. גרסה');
const IDX = R('index.html'), SW = R('service-worker.js');
const vers = [...new Set((IDX.match(/\?v=([0-9a-z]+)/g) || []))];
ok('כל התגים ב-index.html באותה גרסה', vers.length === 1, vers.join(','));
ok('🔴 ו-VERSION ב-service-worker זהה לה',
   SW.indexOf('var VERSION = "' + vers[0].slice(3) + '";') !== -1,
   (SW.match(/var VERSION = "[^"]*"/) || [''])[0]);
ok('והגרסה עלתה מ-20260917a', vers[0] !== '?v=20260917a', vers[0]);

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
