/* בדיקות לכללי הכתיבה של תנועות (2026-09-15, צעד 09ב-2).
   הרצה:  node tools/test-budget-tx-write.js

   🔴 **מה אפשר לבדוק כאן ומה לא.** כלל אבטחה רץ אצל גוגל, ולכן
   ההתנהגות שלו נבדקת **חי** מול Firestore אמיתי (ר' צעד 09א —
   תשע בדיקות דחייה). מה שכן נבדק כאן הוא הדבר שבדיקה חיה מפספסת:
   **סחיפה בין הקבצים.** רשימת השדות בכלל ורשימת השדות בשרת הן
   שני מקורות לאותה אמת, והיום שבו הן ייפרדו הוא היום שבו שדה
   חדש יזלוג פנימה או כתיבה תקינה תידחה — בשקט, בשני המקרים. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

/* חילוץ גוף פונקציה בלי רגקס — הסוגריים בשמות השדות העבריים
   הופכים כל רגקס כאן לשביר, וזה בדיוק הסוג של בדיקה ש"עוברת" בטעות. */
const fnBody = n => {
  const i = RULES.indexOf('function ' + n + '(');
  if (i === -1) return '';
  const j = RULES.indexOf('\n    }', i);
  return j === -1 ? '' : RULES.slice(RULES.indexOf('{', i) + 1, j);
};
const listIn = n => {
  const b = fnBody(n);
  return (b.match(/'[^']+'/g) || []).map(s => s.slice(1, -1));
};

section('1. 🔴 רשימת ההיתר מול השרת');
{
  /* BTX_ALLOWED_COLS הוא מה שהשרת כותב; txAllowedFields הוא מה שהכלל מתיר. */
  const sb = { console };
  vm.createContext(sb);
  const a = CODE.indexOf('var BTX_ALLOWED_COLS');
  vm.runInContext(CODE.slice(a, CODE.indexOf('];', a) + 2), sb);
  const server = sb.BTX_ALLOWED_COLS;
  const rules = listIn('txAllowedFields');
  ok('שתי הרשימות נקראו', server.length > 10 && rules.length > 10,
     server.length + ' / ' + rules.length);
  const missing = server.filter(f => rules.indexOf(f) === -1);
  ok('🔴 כל עמודה שהשרת כותב מותרת גם בכלל', missing.length === 0, missing.join(', '));
  /* 🔴 ההפך אינו סימטרי: לכלל מותרים גם שדות תשתית. */
  const META = ['year', 'familyId', 'statusPending', 'mailPending', 'schema', 'updatedAt'];
  const extra = rules.filter(f => server.indexOf(f) === -1 && META.indexOf(f) === -1);
  ok('🔴 ואין בכלל שדה שאינו בשרת ואינו שדה תשתית', extra.length === 0, extra.join(', '));
  ok('🔴🔴 "רוכש" אינו ברשימת הכלל — הדפדפן לעולם לא כותב שם אדם',
     rules.indexOf('רוכש') === -1, JSON.stringify(rules));
  ok('וגם לא בשרת', server.indexOf('רוכש') === -1);
}

section('2. צורת המסמך');
{
  const b = fnBody('txShapeOk');
  ok('🔴 רשימת היתר סגורה (hasOnly)', /keys\(\)\.hasOnly\(txAllowedFields\(\)\)/.test(b), b);
  ok('🔴 ושדות חובה (hasAll)', /keys\(\)\.hasAll\(txRequiredFields\(\)\)/.test(b), b);
  ok('🔴 מזהה המסמך נגזר מהתוכן', /txIdMatches\(docId\)/.test(b), b);
  ok('🔴 משפחה חובה ואינה ריקה', /familyId != ''/.test(b), b);
  ok('🔴 ושני שדות המשפחה חייבים להסכים',
     /familyId == request\.resource\.data\['מזהה משפחה'\]/.test(b), b);
  ok('🔴 מסמך חדש נולד בלי דגל ממתין', /statusPending == false/.test(b), b);
  ok('טיפוסים נבדקים', /'מזהה'\] is int/.test(b) && /'סכום'\] is number/.test(b), b);
  const id = fnBody('txIdMatches');
  ok('🔴 והמזהה מורכב משנה + מזהה, בדיוק כמו btxDocId_ בשרת',
     /year \+ '__' \+/.test(id), id);
  ok('וזה תואם את השרת',
     /return String\(year\) \+ '__' \+ String\(txId == null \? '' : txId\)\.trim\(\);/.test(CODE));
}

section('3. 🔴 תושב — רק את שלו, רק בפתיחה');
{
  const b = fnBody('txResidentCreateOk');
  ok('רק על שם משפחתו', /familyId == myFamilyId\(\)/.test(b), b);
  ok('🔴 רק בסטטוס הפתיחה', /'סטטוס'\] == 'הוגשה קבלה'/.test(b), b);
  ok('🔴 והמקור נעול ל"תושב" — אי-אפשר להתחזות להזנת מנהל',
     /'מקור'\] == 'תושב'/.test(b), b);
  ok('🔴 ואינו יכול לכתוב לעצמו הערת בדיקה', /hasAny\(\['הערת בדיקה'\]\)/.test(b), b);
  ok('סכום חיובי בלבד', /'סכום'\] > 0/.test(b), b);
  ok('ועובר את בדיקת הצורה המלאה', /txShapeOk\(docId\)/.test(b), b);
}

section('4. 🔴 ההפרדה בין סטטוס לפרטים');
{
  const d = fnBody('txDetailsUpdateOk');
  ok('עריכת פרטים פתוחה לבעל תקציב בלבד', /canSeeBudget\(\)/.test(d), d);
  ok('🔴🔴 ו**אינה** יכולה לגעת בסטטוס — זו כל הנקודה',
     d.indexOf("'סטטוס'") === -1, d);
  ok('🔴 ואינה יכולה לשנות משפחה — כלומר להעביר כסף למשפחה אחרת',
     d.indexOf("'מזהה משפחה'") === -1 && d.indexOf('familyId') === -1, d);
  ok('🔴 ואינה יכולה לשנות שנה או מזהה — הם מגדירים את המסמך',
     d.indexOf("'year'") === -1 && d.indexOf("'מזהה'") === -1, d);
  ok('🔴 ואינה יכולה להרים statusPending', d.indexOf('statusPending') === -1, d);
  ok('סכום נשאר חיובי גם בעריכה', /'סכום'\] > 0/.test(d), d);
  const st = fnBody('txStatusUpdateOk');
  ok('🔴 ומנגד — כלל הסטטוס אינו יכול לגעת בסכום',
     st.indexOf("'סכום'") === -1, st);
  /* שתי הפונקציות יחד הן כל מה ש-update מתיר. */
  const blk = (RULES.match(/match \/budgetTx\/\{[^}]+\}\s*\{([\s\S]*?)\n    \}/) || [])[1] || '';
  ok('🔴 update = סטטוס או פרטים, ולא שום דבר שלישי',
     /allow update: if txStatusUpdateOk\(\) \|\| txDetailsUpdateOk\(\);/.test(blk), blk);
  ok('🔴 create = תושב או בעל תקציב',
     /allow create: if txResidentCreateOk\(docId\) \|\| txAdminCreateOk\(docId\);/.test(blk), blk);
  ok('מחיקה לבעל תקציב בלבד', /allow delete: if canSeeBudget\(\);/.test(blk), blk);
  ok('🔴 והקריאה לא נגעה — עדיין לפי משפחה',
     /allow read: if canSeeFamilyTx\(resource\.data\.familyId\);/.test(blk), blk);
}

section('5. מנהל שמזין הוצאה');
{
  const b = fnBody('txAdminCreateOk');
  ok('רק בעל הרשאת תקציב', /canSeeBudget\(\)/.test(b), b);
  ok('עובר את בדיקת הצורה', /txShapeOk\(docId\)/.test(b), b);
  ok('🔴 ואינו יכול להזין ישר כ"שולם" — חייב לעבור במסלול',
     b.indexOf("'שולם'") === -1, b);
  ok('🔴 ולא כ"נדחה"', b.indexOf("'נדחה'") === -1, b);
  ok('🔴 משפחה חובה גם למנהל (הכרעת יועד: "משפחה זו דרישה")',
     /txShapeOk\(docId\)/.test(b) && /familyId != ''/.test(fnBody('txShapeOk')));
}

section('6. שדות החובה');
{
  const req = listIn('txRequiredFields');
  ['מזהה', 'סכום', 'סטטוס', 'מקור', 'מזהה משפחה', 'year', 'familyId', 'schema', 'updatedAt']
    .forEach(f => ok('חובה: ' + f, req.indexOf(f) !== -1, JSON.stringify(req)));
  ok('🔴 updatedAt חובה — הגיבוי המצטבר נשען עליו',
     req.indexOf('updatedAt') !== -1);
  ok('🔴 schema חובה — בלעדיו אי-אפשר לשנות מבנה בעתיד',
     req.indexOf('schema') !== -1);
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
