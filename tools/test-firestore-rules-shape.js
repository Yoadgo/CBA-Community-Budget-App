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
ok('\ud83d\udd34 כל allow בקובץ הוא מהצורות המוכרות בלבד',
   (CODE.match(/allow [^\n]*/g) || []).every(function (t) { t = t.trim();
     return /^allow read: if (canSeePlan\(\)|canSeeServices\(\)|canSeeBudget\(\)|canSeeFamilyTx\(resource\.data\.familyId\)|isMember\(\)|signedIn\(\) && request\.auth\.uid == uid);$/.test(t) ||
            /^allow write: if false;$/.test(t) || /^allow read, write: if false;$/.test(t) ||
            /* \u05e6\u05e2\u05d3 09\u05d0 \u2014 \u05d4\u05db\u05ea\u05d9\u05d1\u05d4 \u05d4\u05d9\u05d7\u05d9\u05d3\u05d4 \u05d1\u05e7\u05d5\u05d1\u05e5, \u05d5\u05d4\u05d9\u05d0 \u05d3\u05e8\u05da \u05e4\u05d5\u05e0\u05e7\u05e6\u05d9\u05d4 \u05d1\u05e2\u05dc\u05ea \u05e9\u05dd. */
            /^allow update: if (txStatusUpdateOk|counterBumpOk)\(\);$/.test(t) ||
            /^allow create, delete: if false;$/.test(t);
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
ok('🔴 כל כתיבה היא אחת מהשתיים המוכרות',
   (CODE.match(/allow (create|update|delete)[^\n]*/g) || [])
     .every(function (t) { t = t.trim();
       return t === 'allow update: if txStatusUpdateOk();' ||
              t === 'allow update: if counterBumpOk();' ||
              t === 'allow create, delete: if false;'; }),
   (CODE.match(/allow (create|update|delete)[^\n]*/g) || []).join(' | '));
/* 🔴 **המספר הזה הוא הבדיקה.** כתיבה שלישית תפיל את השורה הזאת
   ותחייב הכרעה מודעת — בדיוק כמו שהכתיבה השנייה (מונה המזהים,
   צעד 09ב-1) חייבה לעדכן את השורה הזאת ביודעין. */
ok('🔴 ויש בדיוק שתי כתיבות בכל הקובץ',
   (CODE.match(/allow update:/g) || []).length === 2,
   String((CODE.match(/allow update:/g) || []).length));


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
ok('🔴 שמונה בלוקים פתוחים בלבד (ועוד ברירת המחדל)',
   (CODE.match(/^\s*match \//gm) || []).length === 10,
   String((CODE.match(/^\s*match \//gm) || []).length));

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
