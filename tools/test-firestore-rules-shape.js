/* בדיקות מבנה לכללי האבטחה (2026-09-15, צעד 03ב).
   הרצה:  node tools/test-firestore-rules-shape.js

   🔴 אלה **לא** בדיקות התנהגות — התנהגות נבדקת מול הכללים החיים, ר'
   tools/firestore-rules-expectations.md. אלה בדיקות של הדברים שקל לשבור
   בעריכה ושאף אחד לא ישים לב אליהם: ברירת מחדל שהפסיקה להיות אחרונה,
   `allow write` שנפתח בהיסח הדעת, אוסף שנפתח בלי שהתכוונו.

   ⚠️ כלל אבטחה שגוי אינו קוד שנשבר אלא נתונים שנחשפים בשקט. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');

/* מחלץ את גוף כל בלוק match ברמה העליונה */
function blockOf(name) {
  const head = 'match ' + name + ' {';
  const i = R.indexOf(head);
  if (i === -1) return null;
  /* ⚠️ הספירה מתחילה מהסוגר שפותח את הבלוק ולא מהראשון שנמצא:
     בנתיב עצמו יש סוגריים (`/{id}`) והם הפילו את הספירה. */
  let d = 0;
  for (let k = i + head.length - 1; k < R.length; k++) {
    if (R[k] === '{') d++;
    else if (R[k] === '}') { d--; if (!d) return R.slice(i, k + 1); }
  }
  return null;
}
/* מסיר הערות, כדי שבדיקה לא "תעבור" בזכות טקסט בתוך הערה */
const CODE = R.replace(/\/\*[\s\S]*?\*\//g, '');

section('1. שלד');
ok('rules_version 2', /^rules_version = '2';/m.test(R));
ok('מבנה service/match תקין', /service cloud\.firestore \{/.test(CODE) &&
   /match \/databases\/\{database\}\/documents \{/.test(CODE));
ok('סוגריים מאוזנים',
   (CODE.match(/\{/g) || []).length === (CODE.match(/\}/g) || []).length,
   (CODE.match(/\{/g) || []).length + ' vs ' + (CODE.match(/\}/g) || []).length);

section('2. ברירת המחדל — חייבת להיות אחרונה');
const deny = blockOf('/{document=**}');
ok('בלוק ברירת המחדל קיים', !!deny);
ok('🔴 והוא סוגר הכול', /allow read, write: if false;/.test(deny || ''));
const idxDeny = CODE.indexOf('match /{document=**}');
['/gardenPlan/{id}', '/gardenMeta/{doc}', '/members/{uid}'].forEach(function (nm) {
  ok('🔴 ' + nm + ' יושב מעל ברירת המחדל',
     CODE.indexOf('match ' + nm) !== -1 && CODE.indexOf('match ' + nm) < idxDeny);
});
/* 🔴 **הכלל שהחליף את "אין כתיבה, נקודה" (15.9.2026).**
   הקובץ גדל, וספירת כתיבות כבר לא אומרת דבר. מה שכן אומר:
   **כל תנאי ב-allow חייב להיות קריאה לפונקציה בעלת שם** — לעולם
   לא תנאי פרוש בתוך הבלוק. פונקציה בעלת שם נקראת, נבדקת ומתועדת;
   תנאי שנדחף בשורה אחת בתוך `match` הוא בדיוק מה שמחליק פנימה
   בלי שאיש יראה אותו. */
/* ⚠️ הארגומנט המותר הוא **משתנה ה-`match`** (`docId`, `uid`) — לא ביטוי.
   `f(uid)` הוא בדיוק מה שהכלל דורש: פונקציה בעלת שם. `f(a && b)` אינו. */
/* ⚠️ הצורה `f(resource.data.<שדה>)` מותרת גם היא — פונקציה בעלת שם
   שמקבלת שדה של המסמך עצמו. היתה כאן חריגה קשיחה ל-`canSeeFamilyTx`
   בלבד; היא הוכללה ב-16.9 כשנוספה `canSeeGardenReport` באותה צורה
   בדיוק. חריגה קשיחה לשם אחד מתיישנת בשימוש השני. */
const ALLOW_TERM = /^([a-zA-Z][A-Za-z0-9_]*\(([a-z][A-Za-z0-9_]*)?\)|false|[a-zA-Z][A-Za-z0-9_]*\(resource\.data\.[A-Za-z0-9_]+\)|request\.auth\.uid == uid)$/;
ok('🔴 כל תנאי ב-allow הוא קריאה לפונקציה בעלת שם',
   (CODE.match(/allow [^\n]*/g) || []).every(function (t) {
     const m = t.trim().match(/^allow [a-z, ]+: if (.+);$/);
     if (!m) return false;
     /* \u26a0\ufe0f 21.9 \u2014 \u05e4\u05d9\u05e6\u05d5\u05dc \u05d2\u05dd \u05e2\u05dc && : \u05de\u05e9\u05e2\u05d1\u05e8 \u05e9\u05e2\u05e8 \u05de\u05d5\u05e8\u05db\u05d1 \u05de\u05e9\u05e0\u05d9 \u05ea\u05e0\u05d0\u05d9\u05dd
        (`gpWriteOk() && gpShapeOk()`) \u05d4\u05e4\u05d9\u05e6\u05d5\u05dc \u05dc\u05e4\u05d9 || \u05d1\u05dc\u05d1\u05d3 \u05d4\u05d7\u05d6\u05d9\u05e8 \u05de\u05d7\u05e8\u05d5\u05d6\u05ea \u05d0\u05d7\u05ea. */
     return m[1].split(/\|\||&&/).every(function (term) { return ALLOW_TERM.test(term.trim()); });
   }), (CODE.match(/allow [^\n]*/g) || []).join(' | '));

section('3. תוכנית הגינון — מה שנפתח');
const gp = blockOf('/gardenPlan/{id}');
const gm = blockOf('/gardenMeta/{doc}');
ok('gardenPlan נפתח', !!gp);
ok('gardenMeta נפתח', !!gm);
ok('gardenPlan — קריאה לפי canSeePlan', /allow read: if canSeePlan\(\);/.test(gp || ''));
/* 🔑 **נפתח לגנן החיצוני ב-16.9**, וב-18.9 (גל 3) **לכל חבר פעיל** —
   כי מסך הדיווח של התושב צריך את אותן רשימות, והן שמות
   קטגוריות ואזורים ולא נתון על אף אדם.
   תוכנית העבודה עצמה נשארת חסומה לחיצוני, וזה ההבדל. */
ok('gardenMeta — קריאה לכל חבר פעיל',
   /match \/gardenMeta\/\{doc\} \{[\s\S]{0,120}allow read: if isMember\(\);/.test(CODE));
ok('⚠️ והכתיבה עדיין סגורה לאיש',
   /match \/gardenMeta\/\{doc\} \{[\s\S]{0,160}allow write: if false;/.test(CODE));
ok('🔴 ותוכנית העבודה עדיין חסומה לחיצוני',
   /match \/gardenPlan\/\{id\} \{[\s\S]{0,120}allow read: if canSeePlan\(\);/.test(CODE));
/* 🔴 21.9, סעיף 3 — **ההיפוך.** עד היום הדפדפן לא כתב לתוכנית
   כלל, כי הגיליון היה מקור האמת. מרגע ש-Firestore הוא המקור,
   הכתיבה מהדפדפן היא המקור היחיד — והגיליון הוא מראה. */
ok('🔴 gardenPlan — כתיבה למנהל בלבד, ועם בדיקת צורה',
   /allow create, update: if gpWriteOk\(\) && gpShapeOk\(\);/.test(gp || ''), gp);
ok('⚠️ והמחיקה גם היא למנהל בלבד',
   /allow delete: if gpWriteOk\(\);/.test(gp || ''), gp);
ok('🔴 gardenMeta — כתיבה אסורה לכולם', /allow write: if false;/.test(gm || ''));
/* 🔴 **הגובה הזה נפתח במכוון בצעד 09א (15.9.2026)** — עד אז
   הדפדפן לא כתב ל-Firestore כלל, והבדיקה היתה "אין כתיבה,
   נקודה". עכשיו יש בדיוק אחת, ולכן הבדיקה מהדקת אותה
   במקום לוותר עליה: כל `allow update` חייב להיות זה של budgetTx,
   ו-`allow create`/`allow delete` חייבים להישאר סגורים. כל כתיבה
   עתידית תפיל את הבדיקה הזאת, וזו המטרה. */
/* 🔴 **הרשימה הזאת היא הבדיקה.** כל שער כתיבה חדש שייפתח בעתיד
   יפיל את השורה הזאת, ויחייב מישהו להוסיף אותו לכאן **ביודעין**.
   זו ההגנה שנשארה אחרי שספירת הכתיבות איבדה משמעות. */
const WRITE_GATES = ['txResidentCreateOk', 'txAdminCreateOk', 'txStatusUpdateOk',
                     'txDetailsUpdateOk', 'counterBumpOk', 'canSeeBudget', 'false',
                     /* 🔴 ההיפוך של הגינון (16.9): Firestore הוא המסד החי
                        והדפדפן כותב. שלושה שערים, ושלושתם מפורטים
                        בקובץ הכללים ובמסמך התוצאות הצפויות. */
                     'grCreateOk', 'grFeedbackOk', 'grPhotosOk', 'grTeamUpdateOk',
                     'gtTeamCreateOk', 'gtFromReportOk', 'gtDeleteOk',
                     /* 🔴 נוסף ביודעין 17.9 — התושב כותב את מזהי התמונות
                        גם למסמך המשימה של הדיווח שלו. צר לשני שדות,
                        ומאומת מול `repId`→`familyId`. ר' סעיף 8 למטה
                        ושורות 40–49 ב-firestore-rules-expectations.md. */
                     'gtReportPhotosOk',
                     /* 🔴 נוסף 18.9 — גלגול אחורה של משימה יתומה.
                        השער נפתח רק כל עוד אין מסמך דיווח שמצביע
                        על המשימה — ר' סעיף 3 ב-test-wave2-live-fixes.js. */
                     'gtOrphanCleanupOk',
                     /* 21.9 — סעיפים 3 ו-5: כתיבה לתוכנית העבודה, והדגל
                        שתושב מרים על המשימה שלו אחרי משוב שלילי. */
                     'gpWriteOk', 'gpShapeOk', 'gtReportFlagOk', 'gtPendingDeleteOk',
                     /* 🔴 גל 3 (18.9) — `gtTeamUpdateOk` אינו מחווט עוד ישירות:
                        הוא עבר להיות רכיב בתוך `gtUpdateOk`, שמאחד את כל
                        השומרים שעברו מ-Apps Script. ר' test-wave3-garden-writes.js. */
                     'gtUpdateOk',
                     'glCreateOk', 'glResidentCreateOk'];
{
  const used = [];
  (CODE.match(/allow (create|update|delete)[^\n]*/g) || []).forEach(function (t) {
    const m = t.trim().match(/^allow [a-z, ]+: if (.+);$/);
    if (!m) { used.push('PARSE-FAIL:' + t.trim()); return; }
    m[1].split(/\|\||&&/).forEach(function (term) {
      used.push(term.trim().replace(/\((docId)?\)$/, ''));
    });
  });
  ok('🔴 כל שער כתיבה נמצא ברשימה המאושרת',
     used.every(function (u) { return WRITE_GATES.indexOf(u) !== -1; }),
     used.filter(function (u) { return WRITE_GATES.indexOf(u) === -1; }).join(' | '));
  ok('🔴 ואין שער מאושר שכבר אינו בשימוש (רשימה שמתיישנת)',
     WRITE_GATES.every(function (g) { return used.indexOf(g) !== -1; }),
     WRITE_GATES.filter(function (g) { return used.indexOf(g) === -1; }).join(' | '));
}


section('3ב. שירותים לתושב (צעד 04ב)');
const sv = blockOf('/services/{id}');
ok('services נפתח', !!sv);
ok('קריאה לפי canSeeServices', /allow read: if canSeeServices\(\);/.test(sv || ''));
ok('🔴 כתיבה אסורה', /allow write: if false;/.test(sv || ''));
const fnS = (CODE.match(/function canSeeServices\(\) \{[\s\S]*?\}/) || [''])[0];
ok('canSeeServices קיימת', !!fnS);
/* ⚠️ handleServices_ קורא authorize_(ss,p,null) — כל תושב פעיל, אבל השער
   החיצוני שם חוסם משתמש חיצוני. כלל שמסתפק ב-isMember() היה
   **רחב יותר מהשרת** — וזו הסטייה השקטה שהמעבר עלול לייצר. */
ok('🔴 דורשת isExternal == false (כמו השער ב-authorize_)',
   /isExternal == false/.test(fnS) && !/isExternal != true/.test(fnS), fnS.trim());
ok('ואינה דורשת hasPerm (כמו need=null בשרת)',
   !/hasPerm/.test(fnS), fnS.trim());

section('4. canSeePlan — שתי הדרישות');
const fn = (CODE.match(/function canSeePlan\(\) \{[\s\S]*?\}/) || [''])[0];
ok('הפונקציה קיימת', !!fn);
ok("דורשת hasPerm('גינון')", /hasPerm\('גינון'\)/.test(fn), fn.trim());
ok('🔴 דורשת גם isExternal', /isExternal/.test(fn), fn.trim());
/* ⚠️ `!= true` היה עובר על מסמך שבו השדה חסר ומעניק גישה. */
ok('🔴 בצורת == false (נכשל-סגור) ולא != true',
   /isExternal == false/.test(fn) && !/isExternal != true/.test(fn), fn.trim());
ok('⚠️ שתי הדרישות ב-AND ולא ב-OR', /&&/.test(fn) && !/\|\|/.test(fn), fn.trim());

section('5. מה שלא נפתח');
/* ⚠️ **הבדיקה הזאת היתה רפופה עד 15.9** והשוותה קידומת:
   `match /budget` התאים גם ל-`match /budgetYears` שנפתח במכוון
   בצעד 08א, ולכן דיווח על "התקציב נפתח" שלא היה נכון.
   עכשיו ההתאמה היא על שם האוסף המלא (`match /<שם>/`). */
/* ⚠️ `gardenTasks` ו-`gardenReports` ירדו מהרשימה ב-16.9 — הם נפתחו
   **במכוון** במיגרציה המלאה של הגינון, ונבדקים בסעיף נפרד למטה. */
['residents', 'budget', 'families', 'emails',
 'transactions', 'tx'].forEach(function (c) {
  ok('🔴 ' + c + ' לא נפתח', CODE.indexOf('match /' + c + '/') === -1);
});
/* 🔴 הגבול של צעד 08א: מטא-תקציב כן, תנועות לא. */
ok('🔴 budgetYears כן נפתח (ובמכוון)', CODE.indexOf('match /budgetYears/') !== -1);
/* 🔴 הגבול של צעד 08ב: התנועות נפתחו — אבל לעולם לא לכל חבר. */
ok('🔴 budgetTx נפתח רק דרך canSeeFamilyTx',
   /match \/budgetTx\/\{[^}]+\}\s*\{\s*allow read: if canSeeFamilyTx\(resource\.data\.familyId\);/.test(CODE));
ok('🔴 ו-canSeeFamilyTx חוסם את המחרוזת הריקה',
   /function canSeeFamilyTx\(fid\)[\s\S]*?fid is string && fid != '' && fid == myFamilyId\(\)/.test(CODE));
ok('🔴 והוא לא נפתח לכל חבר אלא לבעלי הרשאת תקציב',
   /function canSeeBudget\(\)\s*\{\s*return hasPerm\('\u05ea\u05e7\u05e6\u05d9\u05d1'\)/.test(CODE));
/* 🔴🔴 **היתה כאן ספירה** ("שנים-עשר בלוקים בלבד"), והיא החזיקה עד
   שני סשנים מקבילים פתחו אוספים באותו יום: המספר התנגש, ומי
   שעדכן אותו עשה זאת בלי לדעת מה הצד השני הוסיף. ספירה גם
   אינה אומרת **מה** נפתח.
   מ-16.9 זו **רשימת היתר מפורשת**. היא עדיין מכריחה החלטה
   אנושית לכל אוסף חדש — אבל היא גם מתעדת אותה, ושני סשנים
   שמוסיפים שורות שונות אינם דורסים זה את זה. */
const OPENED = ['gardenPlan', 'gardenMeta', 'gardenReports', 'gardenTasks', 'gardenLog',
                'services', 'budgetYears', 'budgetTx', 'counters', 'appConfig',
                'gymStatus', 'gymCode', 'homeCounts', 'clubReservations',
                'tourSteps', 'tourSeen', 'members',
                /* 🔴 21.9, דיווח #6 — מצב ההתראות נקרא מהשרת
                   ולא מ-localStorage. קריאה בלבד, ורק של עצמך. */
                'pushSubscriptions',
                /* 22.9 — מסמך מטא לקטגוריות השירותים, אותו דפוס בדיוק
                   כמו gardenMeta/lists. קריאה בלבד, אותו שער כמו services. */
                'servicesMeta'];
const found = (CODE.match(/^\s*match \/([A-Za-z0-9_]+)\//gm) || [])
                .map(function (x) { return x.trim().replace(/^match \//, '').replace(/\/$/, ''); })
                .filter(function (x) { return x !== 'databases'; });
const unexpected = found.filter(function (c) { return OPENED.indexOf(c) === -1; });
ok('🔴 אף אוסף לא נפתח מחוץ לרשימת ההיתר', unexpected.length === 0, unexpected.join(','));
const missing = OPENED.filter(function (c) { return found.indexOf(c) === -1; });
ok('⚠️ וכל מה שברשימה אכן קיים (רשימה שהתיישנה = שקר)', missing.length === 0, missing.join(','));

/* ======================================================================
   🔴🔴 פעולה 3 (16.9) — מוני עמוד הבית.
   הסכנה היחידה כאן היא **הרחבה שקטה**: מסמך אחד
   שהיה נותן לכל מנהל את כל חמש הספירות, בעוד
   ש-`handleHomeExtras_` בודק כל מקטע בנפרד.
   ====================================================================== */
section('5ג. 🔴 מוני עמוד הבית — מסמך לכל הרשאה');
ok('הבלוק קיים ועובר דרך פונקציה בעלת שם',
   /match \/homeCounts\/\{id\}\s*\{\s*allow read: if canSeeHomeCount\(id\);/.test(CODE));
ok('🔴 וכתיבה אסורה לחלוטין',
   /match \/homeCounts\/\{id\}[\s\S]{0,160}allow write: if false;/.test(CODE));
ok('🔴🔴 וכל מזהה נבדק מול ההרשאה שלו בלבד',
   /id == 'residents' && hasPerm\('תושבים'\)/.test(CODE) &&
   /id == 'gym'\s*&& hasPerm\('מכון'\)/.test(CODE) &&
   /id == 'club'\s*&& hasPerm\('מועדון'\)/.test(CODE) &&
   /id == 'garden'\s*&& hasPerm\('גינון'\)/.test(CODE));
ok('🔴 ו-isMember ולא signedIn — מי שעזב מאבד את הגישה',
   /function canSeeHomeCount\(id\)\s*\{\s*return isMember\(\)/.test(CODE));
ok('🔴 ו-isExternal == false (נכשל-סגור)',
   /function canSeeHomeCount\(id\)[\s\S]{0,120}m\(\)\.isExternal == false/.test(CODE));
ok('⚠️ ומזהה המסמך הוא ASCII (נתיב, לא ערך)',
   !/id == '[\u0590-\u05ff]/.test(CODE));

/* ======================================================================
   🔴🔴 צעד 10ב-1 — מנוי כושר. הבדיקות הרגישות במארז הזה:
   הטאב הזה מחזיק ת.ז., תאריך לידה ותשובות שאלון בריאות
   באותה שורה עם הסטטוס. כל דליפה כאן היא דליפה של אלה.
   ====================================================================== */
section('5ב. 🔴 מנוי כושר — כל אחד את שלו בלבד');
ok('gymStatus נפתח', CODE.indexOf('match /gymStatus/') !== -1);
/* 🔴 **לא "בלבד" יותר** (16.9): התנאי עבר ל-`canSeeGymStatus`, שמוסיף
   את מתג הכיבוי (`isMember()` דורש `active == true`) ואת חסימת
   המשתמש החיצוני. הכלל המקורי היה **רחב מהשרת**: מי שסומן "עזב"
   נדחה ב-`authorize_` באותו רגע, והמשיך לקרוא כאן. */
ok('🔴 והקריאה היא מזהה המסמך מול ה-uid — **וגם חברות פעילה**',
   /match \/gymStatus\/\{uid\}[\s\S]{0,200}allow read: if canSeeGymStatus\(uid\);/.test(CODE) &&
   /function canSeeGymStatus\(uid\) \{[\s\S]{0,200}isMember\(\) && m\(\)\.isExternal == false && request\.auth\.uid == uid;/.test(CODE));
ok('🔴🔴 ואין שום מסלול לפי משפחה (בן/בת זוג חולקים familyId)',
   !/match \/gymStatus\/\{uid\}[\s\S]{0,400}myFamilyId\(\)/.test(CODE));
ok('🔴 ואין מסלול למנהל — מסך הניהול נשאר ב-Apps Script',
   !/match \/gymStatus\/\{uid\}[\s\S]{0,400}(hasPerm|isSuper)/.test(CODE));
ok('⚠️ והדפדפן לעולם אינו כותב',
   /match \/gymStatus\/\{uid\}[\s\S]{0,400}allow write: if false;/.test(CODE));

/* ======================================================================
   🔴🔴 מיגרציית הגינון המלאה (16.9) — שני אוספים, שני סיכונים שונים.

   ב-gardenReports הסיכון הוא **דליפה בין שכנים** — התקלה שיועד
   דיווח עליה במפורש. ב-gardenTasks הסיכון הפוך: כלל **צר מדי**
   ישבור לאחראי החיצוני את המסך במסלול Firestore בלבד, וזו תקלה
   שתתגלה רק אצלו ורק אחרי שהדגל נדלק.
   ====================================================================== */
section('5ג. גינון — דיווחים');
const gr = blockOf('/gardenReports/{id}');
ok('הבלוק קיים', !!gr);
ok('🔴 הקריאה עוברת דרך familyId של המסמך',
   /allow read: if canSeeGardenReport\(resource\.data\.familyId\);/.test(gr || ''), gr);
const grFn = (CODE.match(/function canSeeGardenReport\(fid\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 is string — שדה חסר מפיל סגור', /fid is string/.test(grFn), grFn.trim());
/* 🔴 המלכודת שכבר נתפסה פעם: myFamilyId() מחזירה '' למי שאין לו משפחה. */
ok("🔴🔴 != '' — אחרת '' == '' פותח כל מסמך חסר-משפחה",
   /fid != ''/.test(grFn), grFn.trim());
ok('🔴 וההשוואה היא למשפחה שלו', /fid == myFamilyId\(\)/.test(grFn), grFn.trim());
/* ⚠️ לא uid — הכרעת יועד: שני בני המשפחה רואים את אותם דיווחים. */
ok('⚠️ ולא לפי uid — שני בני המשפחה רואים את אותם דיווחים',
   !/request\.auth\.uid/.test(grFn), grFn.trim());
/* 🔴🔴 **הממצא של הצוות האדום, 16.9.** הכלל נכתב בלי בדיקת חיצוניות,
   ובשרת יושבת שורה שחוסמת משתמש חיצוני מכל `need` שאינו PERM_GARDEN —
   ו-handleMyGardenReports_ קורא עם null. כלומר הכלל היה **רחב
   מהשרת**, וזה הדבר האחד שאסור. ר' ההערה המלאה בקובץ הכללים. */
ok('🔴🔴 חוסם משתמש חיצוני — אחרת הכלל רחב מהשרת',
   /isExternal == false/.test(grFn), grFn.trim());
ok('🔴 ובצורת == false (נכשל-סגור) ולא != true',
   !/isExternal != true/.test(grFn), grFn.trim());
ok('⚠️ ודורש חברות פעילה', /isMember\(\)/.test(grFn), grFn.trim());
/* 🔴 מסך הניהול עדיין ב-Apps Script; פתיחה למנהל עכשיו = גישה שאיש
   אינו משתמש בה, כלומר בדיוק החשיפה השקטה שהצוות האדום תפס. */
ok('🔴 ואין מסלול למנהל בקריאה — מסך הניהול נשאר ב-Apps Script',
   !/(hasPerm|isSuper|canSeeBudget)/.test(grFn), grFn.trim());
/* 🔴🔴 **מ-16.9 הדפדפן כן כותב כאן** — Firestore הוא המסד החי.
   הבדיקות הבאות הן מה שהחליף את "לעולם אינו כותב". */
ok('🔴 יצירה היא create ולא write — מסמך קיים נכשל מעצמו',
   /allow create: if grCreateOk\(\);/.test(gr || ''), gr);
ok('🔴🔴 ואין מחיקה, לאיש', /allow delete: if false;/.test(gr || ''), gr);
const grC = (CODE.match(/function grCreateOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 יצירה רק למשפחה שלו', /familyId == myFamilyId\(\)/.test(grC), grC.trim());
ok('🔴 ורק לתושב פעיל שאינו חיצוני',
   /isMember\(\) && m\(\)\.isExternal == false/.test(grC), grC.trim());
const grShape = (CODE.match(/function grShapeOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
/* 🔴🔴 ההפרדה שמחזיקה הכול: תושב אינו שולח שדות של הצוות. */
ok('🔴🔴 תושב אינו יכול לשלוח stage/closure/canFeedback ביצירה',
   /!request\.resource\.data\.keys\(\)\.hasAny\(grTeamFields\(\)\)/.test(grShape), grShape.trim());
ok('🔴 ורשימת השדות סגורה (hasOnly)',
   /keys\(\)\.hasOnly\(grCreateFields\(\)\)/.test(grShape), grShape.trim());
const grF = (CODE.match(/function grFeedbackOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴🔴 משוב נוגע בשדות המשוב בלבד',
   /affectedKeys\(\)\s*\n?\s*\.hasOnly\(\['feedback'/.test(grF), grF.trim());
ok('🔴 ורק על מסמך של המשפחה שלו',
   /resource\.data\.familyId == myFamilyId\(\)/.test(grF), grF.trim());
/* 🔴 השלמת תמונות — הפתח היחיד שנפתח לתושב אחרי ההגשה. */
const grP = (CODE.match(/function grPhotosOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 השלמת תמונות נוגעת ב-photos בלבד',
   /hasOnly\(\['photos', 'photosIncomplete', 'updatedAt'\]\)/.test(grP), grP.trim());
ok('🔴🔴 ואינה פתח לערוך תיאור/כותרת/מיקום אחרי ההגשה',
   !/'desc'|'title'|'place'|'category'/.test(grP), grP.trim());
ok('🔴 ורק על דיווח של המשפחה שלו',
   /resource\.data\.familyId == myFamilyId\(\)/.test(grP), grP.trim());
const grT = (CODE.match(/function grTeamUpdateOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
/* 🔴🔴 גם מנהל אינו מעביר בעלות על דיווח. */
ok('🔴🔴 familyId אינו ברשימת השדות שהצוות רשאי לשנות',
   !/'familyId'/.test(grT), grT.trim());
ok('⚠️ והצוות אינו נוגע בתיאור או בכותרת של התושב',
   !/'desc'|'title'/.test(grT), grT.trim());

section('5ד. גינון — משימות');
const gt = blockOf('/gardenTasks/{id}');
ok('הבלוק קיים', !!gt);
ok('הקריאה דרך שער בעל שם', /allow read: if canSeeGardenTasks\(\);/.test(gt || ''), gt);
const gtFn = (CODE.match(/function canSeeGardenTasks\(\) \{[\s\S]*?\n    \}/) || [''])[0];
ok("דורש hasPerm('גינון')", /hasPerm\('\u05d2\u05d9\u05e0\u05d5\u05df'\)/.test(gtFn), gtFn.trim());
/* 🔴🔴 **הבדיקה שנראית הפוכה, ואינה.** ב-gardenPlan החיצוני חסום
   במפורש; כאן הוא **חייב** להיכלל, כי handleGardenTasks_ עם
   scope='all' מחזיר לו הכול מאז 9.9. כלל צר יותר כאן הוא
   סטייה מהשרת — לא הידוק. אימת מול הקוד, לא הונח. */
ok('🔴🔴 ובמכוון **בלי** isExternal — השרת אינו חוסם אותו במשימות',
   !/isExternal/.test(gtFn), gtFn.trim());
/* ...וההפך: בתוכנית העבודה הוא כן חסום. שני הכללים חייבים להישאר שונים. */
ok('🔴 בעוד canSeePlan **כן** חוסם אותו — שני הכללים שונים בכוונה',
   /function canSeePlan\(\)[\s\S]{0,160}isExternal == false/.test(CODE));
/* 🔴🔴 מ-16.9 הדפדפן כותב גם כאן. */
ok('🔴 שני שערי יצירה — הצוות, והתושב שמגיש דיווח',
   /allow create: if gtTeamCreateOk\(\) \|\| gtFromReportOk\(\);/.test(gt || ''), gt);
const gtR = (CODE.match(/function gtFromReportOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
/* 🔴🔴 החריג המסוכן: תושב יוצר מסמך באוסף של הצוות. שני תנאים
   מחזיקים אותו סגור — נקודת פתיחה קבועה, ובלי שדות של הצוות. */
ok('🔴🔴 תושב יוצר משימה בשלב "התקבל" בלבד',
   /stage == 'התקבל'/.test(gtR), gtR.trim());
ok('🔴🔴 ואינו יכול לשלוח דגל/סגירה/שבוע/אישור',
   /!request\.resource\.data\.keys\(\)\.hasAny\(gtTeamOnly\(\)\)/.test(gtR), gtR.trim());
const gtU = (CODE.match(/function gtTeamUpdateOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 מזהה המשימה אינו ניתן לשינוי אחרי היצירה',
   !/'id'/.test(gtU), gtU.trim());
ok('🔴 מחיקה למנהל בלבד — לא לקבלן החיצוני',
   /function gtDeleteOk\(\) \{[\s\S]{0,120}isExternal == false/.test(CODE));

section('5ה. 🔴 יומן הגינון — הוספה בלבד');
const gl = blockOf('/gardenLog/{id}');
ok('הבלוק קיים', !!gl);
ok('🔴🔴 אין עדכון ואין מחיקה — היסטוריה אינה משתכתבת',
   /allow update, delete: if false;/.test(gl || ''), gl);
const glC = (CODE.match(/function glCreateOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
/* 🔴🔴 בלי זה כל אחד רושם פעולה בשם מישהו אחר — וזה ההבדל
   בין יומן לבין רשימת טענות. */
ok('🔴🔴 actorUid נאכף להיות הכותב עצמו',
   /actorUid == request\.auth\.uid/.test(glC), glC.trim());
const glR = (CODE.match(/function glResidentCreateOk\(\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 וגם לתושב — ורק לשני סוגי רשומה',
   /actorUid == request\.auth\.uid/.test(glR) &&
   /kind == 'נפתח'/.test(glR) && /kind == 'משוב'/.test(glR), glR.trim());
ok('⚠️ ושם של אדם אינו נשמר ביומן — uid בלבד',
   !/'actor'|'name'|'מבצע'/.test(glC), glC.trim());

section('6. members — לא נשבר');
const mb = blockOf('/members/{uid}');
ok('קריאה: רק את שלי', /allow read: if signedIn\(\) && request\.auth\.uid == uid;/.test(mb || ''));
ok('🔴 כתיבה אסורה לחלוטין', /allow write: if false;/.test(mb || ''));

section('7. פונקציות העזר קיימות');
['signedIn', 'memberExists', 'm', 'isMember', 'isSuper', 'hasPerm', 'canSeePlan',
 'canSeeGardenReport', 'canSeeGardenTasks'].forEach(function (f) {
  ok('function ' + f, new RegExp('function ' + f + '\\(').test(CODE));
});
ok('isMember דורש active == true', /function isMember\(\)[\s\S]{0,120}active == true/.test(CODE));
/* ⚠️ פונקציה בכללי Firestore אינה מחזירה נתיב — הנתיב נבנה בתוך get()/exists(). */
ok('⚠️ אין פונקציה שמחזירה נתיב',
   !/function \w+\(\)\s*\{\s*return \/databases/.test(CODE));

section('8. 🔴 תמונות התושב אל מסמך המשימה (17.9)');
const gtp = (CODE.match(/function gtReportPhotosOk\(\)[\s\S]*?\n    \}/) || [''])[0];
ok('gtReportPhotosOk קיימת', !!gtp);
ok('🔴 רק photos ו-updatedAt — לא שלב, לא סגירה',
   /hasOnly\(\['photos', 'updatedAt'\]\)/.test(gtp), gtp);
ok('🔴🔴 והמשימה חייבת להצביע על דיווח של המשפחה שלו',
   /get\(\/databases\/\$\(database\)\/documents\/gardenReports\/\$\(resource\.data\.repId\)\)[\s\S]{0,60}\.data\.familyId == myFamilyId\(\)/.test(gtp), gtp);
ok('⚠️ repId חייב להתקיים ולהיות מחרוזת — אחרת הנתיב נבנה מריק',
   /resource\.data\.repId is string && resource\.data\.repId != ''/.test(gtp), gtp);
ok('⚠️ ולא למשתמש חיצוני', /isMember\(\) && m\(\)\.isExternal == false/.test(gtp), gtp);
/* 🔴 18.9, גל 3 — השער הוחלף ב-`gtUpdateOk`, שמוסיף על `gtTeamUpdateOk`
   את השומרים שעברו מ-Apps Script. מסלול התמונות של התושב נשאר עצמאי. */
ok('הכלל צורף ל-update של gardenTasks',
   /allow update: if gtUpdateOk\(\) \|\| gtReportPhotosOk\(\) \|\| gtReportFlagOk\(\) \|\| gtPendingDeleteOk\(\);/.test(CODE));
ok('⚠️ ו-gtTeamUpdateOk עדיין בפנים, כרכיב ולא כשער',
   /gtUpdateOk\(\) \{[\s\S]{0,200}gtTeamUpdateOk\(\)/.test(CODE));
ok('🔴 והמחיקה **לא** נפתחה לתושב',
   /function gtDeleteOk\(\)[\s\S]{0,120}hasPerm\('גינון'\)/.test(CODE));
ok('🔴 וגם gtTeamUpdateOk לא נגעה', /function gtTeamUpdateOk\(\)\s*\{\s*\n\s*return hasPerm\('גינון'\)/.test(CODE));

console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
