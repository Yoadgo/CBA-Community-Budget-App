
/* בדיקות לקריאת סטטוס המנוי מ-Firestore (צעד 10ב-2, 2026-09-16).
   הרצה:  node tools/test-gym-client-read.js

   🔴 שתי סכנות שהמארז הזה שומר עליהן:
     1. **כפתור פעולה בציור המוקדם.** המסמך מ-Firestore הוא חלקי במכוון
        ואין בו payboxUrl / declarationValidUntil / קוד כניסה. כפתור
        שיילחץ בשלב הזה היה שולח בקשה עם שדות ריקים.
     2. **קריאות בטור.** getGymMy ו-getGymForm אינן תלויות זו בזו, וכל
        אחת עולה 2.4–10 שניות. טור = המתנה כפולה בחינם. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const RG = fs.readFileSync(path.join(__dirname, '..', 'js', 'screens', 'resGym.js'), 'utf8');
const DS = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'dataService.js'), 'utf8');
const GS = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

section('1. 🔴 הקריאות במקביל ולא בטור');
/* 🔴 קינון נמדד בהזחה, לא במרחק: שתיהן חייבות לשבת
   באותה רמה (ארבעה רווחים). בדיקת "כמה תווים ביניהן"
   נותנת תשובה שגויה גם כשהן מקבילות לחלוטין. */
ok('⚠️ שתיהן באותה רמת הזחה (לא מקוננות)',
   /\n    CBA\.data\.getGymMy\(function \(my\) \{/.test(RG) &&
   /\n    CBA\.data\.getGymForm\(function \(form\) \{/.test(RG));
ok('🔴 ויש מונה שמסיים רק כששתיהן חזרו',
   /var left = 2;[\s\S]{0,160}function done\(\) \{ if \(--left === 0\)/.test(RG));
ok('שתיהן נקראות ברמה אחת', /CBA\.data\.getGymMy\(function \(my\) \{[\s\S]{0,200}CBA\.data\.getGymForm\(function \(form\)/.test(RG));

section('2. 🔴 הציור המוקדם — בלי כפתורי פעולה');
ok('viewStatus מקבלת partial', /function viewStatus\(m, partial\)/.test(RG));
/* 25.9 — הבלוק החלקי גדל (מד תוקף, כפתור הדלת, קישור פייבוקס — כולם
   מ-Firestore). מה שנשמר: הוא עדיין עוצר, ואין בו אף כפתור שצריך Apps Script. */
{
  const pb = (RG.match(/if \(partial\) \{[\s\S]*?return html;\s*\}/) || [''])[0];
  ok('🔴 והיא עוצרת לפני כל כפתור', pb.length > 0 &&
     !/data-gym-start|data-gym-renew|data-gym-pay[^_]|activeCardHTML\(|declarationValidUntil/.test(pb), pb.length);
}
/* 🔴 הדרישה המהותית: כל מה שנוגע בשדות שאינם ב-Firestore חייב להיות
   **אחרי** נקודת העצירה. */
const partialIdx = RG.indexOf('if (partial) {');
['data-gym-start', 'data-gym-renew', 'data-gym-pay', 'payboxUrl',
 'declarationValidUntil', 'activeCardHTML('].forEach(t => {
  const i = RG.indexOf(t, RG.indexOf('function viewStatus'));
  ok('🔴 "' + t + '" מופיע אחרי נקודת העצירה', i === -1 || i > partialIdx,
     'idx=' + i + ' stop=' + partialIdx);
});

section('3. הציור עצמו');
ok('שלדים רק כשאין סטטוס מהיר',
   /container\.innerHTML = head \+ \(st\.fast \? viewStatus\(st\.fast, true\) : CBA\.skel\.cards\(2\)\);/.test(RG));
ok('⚠️ ולא מציירים חלקי אחרי שהתשובה המלאה הגיעה',
   /if \(!doc \|\| !st\.loading \|\| st\.my\) return;/.test(RG));
ok('⚠️ st.fast מתאפס בסיום', /st\.loading = false; st\.fast = null;/.test(RG));

section('4. שכבת הנתונים');
ok('getGymStatusFast קיימת ומיוצאת',
   /function getGymStatusFast\(cb\)/.test(DS) && /getGymStatusFast: getGymStatusFast,/.test(DS));
ok('🔴 וכל כשל מחזיר null (המסך חוזר לשלדים, בלי שגיאה)',
   (DS.match(/return cb\(null\);/g) || []).length >= 5,
   String((DS.match(/return cb\(null\);/g) || []).length));
ok('⚠️ ועוברת ב-authReady ו-ensureDb כמו כל קריאה אחרת',
   /function getGymStatusFast[\s\S]{0,700}authReady[\s\S]{0,200}ensureDb/.test(DS));
ok('קוראת את המסמך של עצמה בלבד', /readDoc\("gymStatus", uid,/.test(DS));

section('5. 🔴 הסנכרון רץ אוטומטית — אחרת הסטטוס מתיישן');
ok('gymStatusSyncAll_ בעבודות השעתיות',
   /* ⚠️ החלון הורחב מ-4000 ל-12000 ב-16.9: העבודה השעתית גדלה
      (רשתות הביטחון של הגינון), והבדיקה נכשלה על **מרחק** ולא על
      היעדר. בדיקה שתלויה בכמה תווים יש בין שתי שורות תיכשל שוב
      בכל תוספת — מה שנבדק כאן הוא שהקריאה **בתוך** העבודה. */
   /function hourlyJobsRun_\(\)[\s\S]{0,12000}gymStatusSyncAll_\(ss\)/.test(GS));
/* ⚠️ לפני הגיבוי המצטבר, כדי שמה שנכתב ייכנס לגיבוי באותה ריצה. */
ok('⚠️ ולפני הגיבוי המצטבר',
   GS.indexOf('gymStatusSyncAll_(ss)') < GS.indexOf('fsBackupIncremental_(ss)'));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
