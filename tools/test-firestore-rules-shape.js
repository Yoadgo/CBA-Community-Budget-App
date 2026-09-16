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
const ALLOW_TERM = /^([a-zA-Z][A-Za-z0-9_]*\(([a-z][A-Za-z0-9_]*)?\)|false|canSeeFamilyTx\(resource\.data\.familyId\)|signedIn\(\) && request\.auth\.uid == uid)$/;
ok('🔴 כל תנאי ב-allow הוא קריאה לפונקציה בעלת שם',
   (CODE.match(/allow [^\n]*/g) || []).every(function (t) {
     const m = t.trim().match(/^allow [a-z, ]+: if (.+);$/);
     if (!m) return false;
     return m[1].split('||').every(function (term) { return ALLOW_TERM.test(term.trim()); });
   }), (CODE.match(/allow [^\n]*/g) || []).join(' | '));

section('3. תוכנית הגינון — מה שנפתח');
const gp = blockOf('/gardenPlan/{id}');
const gm = blockOf('/gardenMeta/{doc}');
ok('gardenPlan נפתח', !!gp);
ok('gardenMeta נפתח', !!gm);
ok('gardenPlan — קריאה לפי canSeePlan', /allow read: if canSeePlan\(\);/.test(gp || ''));
ok('gardenMeta — קריאה לפי canSeePlan', /allow read: if canSeePlan\(\);/.test(gm || ''));
ok('🔴 gardenPlan — כתיבה אסורה לכולם', /allow write: if false;/.test(gp || ''));
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
                     'txDetailsUpdateOk', 'counterBumpOk', 'canSeeBudget', 'false'];
{
  const used = [];
  (CODE.match(/allow (create|update|delete)[^\n]*/g) || []).forEach(function (t) {
    const m = t.trim().match(/^allow [a-z, ]+: if (.+);$/);
    if (!m) { used.push('PARSE-FAIL:' + t.trim()); return; }
    m[1].split('||').forEach(function (term) {
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
['gardenTasks', 'residents', 'budget', 'families', 'gardenReports', 'emails',
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
ok('🔴 אחד-עשר בלוקים פתוחים בלבד (ועוד ברירת המחדל)',
   (CODE.match(/^\s*match \//gm) || []).length === 12,
   String((CODE.match(/^\s*match \//gm) || []).length));

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

section('6. members — לא נשבר');
const mb = blockOf('/members/{uid}');
ok('קריאה: רק את שלי', /allow read: if signedIn\(\) && request\.auth\.uid == uid;/.test(mb || ''));
ok('🔴 כתיבה אסורה לחלוטין', /allow write: if false;/.test(mb || ''));

section('7. פונקציות העזר קיימות');
['signedIn', 'memberExists', 'm', 'isMember', 'isSuper', 'hasPerm', 'canSeePlan'].forEach(function (f) {
  ok('function ' + f, new RegExp('function ' + f + '\\(').test(CODE));
});
ok('isMember דורש active == true', /function isMember\(\)[\s\S]{0,120}active == true/.test(CODE));
/* ⚠️ פונקציה בכללי Firestore אינה מחזירה נתיב — הנתיב נבנה בתוך get()/exists(). */
ok('⚠️ אין פונקציה שמחזירה נתיב',
   !/function \w+\(\)\s*\{\s*return \/databases/.test(CODE));

console.log('\n' + '='.repeat(52));
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
