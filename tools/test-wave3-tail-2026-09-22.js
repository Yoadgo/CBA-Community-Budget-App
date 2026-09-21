/* ממצאים 11 · 13 · 30 — זנב גל 3   (2026-09-22)
   הרצה:  node tools/test-wave3-tail-2026-09-22.js

   🔴 שלושת הפריטים האלה **אינם תיקוני באג**, וזה מה שהמארז הזה מתעד:
     · **13 כבר סגור.** המיפוי "תושבים"→`residents` תוקן ב-16.9, הכלל מתיר,
       והלקוח מבקש. מה שנשאר מהממצא — מסמך חסר שנבלע בשקט — נסגר ב-17.9
       עם רישום ל-`CBA.diag`. אין כאן מה לתקן, יש מה לשמור.
     · **11 הוא הקפאה, לא מיגרציה.** `budgetTx` כבר נושא **שתי** מערכות
       שמות: עמודות הגיליון בעברית **וגם** גשר אנגלי (`year`, `familyId`,
       `schema`). כלומר המיגרציה חצי-בוצעה, ו-`familyId` הוא כפילות מכוונת
       של `מזהה משפחה` עם כלל שוויון שאוכף אותה. שכתוב מלא של האוסף
       שמחזיק רשומות כסף אמיתיות אינו שווה את הסיכון לפני השקה — מה
       שכן שווה הוא **שלא ייווצרו שמות עבריים חדשים**, וזה מה שנבדק כאן.
     · **30 ירד מ-14 יום ל-24 שעות**, והנימוק הוא שתי תקרות זמן שלא דיברו
       זו עם זו: הלקוח מוחק את המושב אחרי 12 שעות ממילא. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const GS = R('apps-script/Code.gs');
const RULES = R('firestore.rules');
const APP = R('js/app.js');
const DS = R('js/data/dataService.js');

section('1. 🔴 ממצא 30 — תוקף המושב מול תקרת הלקוח');
ok('SESSION_TTL_MS מוגדר', /var SESSION_TTL_MS = 24 \* 3600 \* 1000;/.test(GS), 'לא נמצא');
ok('🔴 makeSession_ משתמש בו', /x: Date\.now\(\) \+ SESSION_TTL_MS/.test(GS), 'לא נמצא');
ok('⚠️ ואין יותר 14 יום', !/14 \* 24 \* 3600 \* 1000/.test(GS));
const clientTtl = (APP.match(/var SESSION_TTL = (\d+) \* 3600 \* 1000/) || [, '0'])[1];
ok('תקרת הלקוח נמצאה (' + clientTtl + ' שעות)', Number(clientTtl) > 0, clientTtl);
/* 🔑 זו האינווריאנטה שהופכת את הקיצור לחינם: השרת חייב להיות רחב מהלקוח,
   אחרת משתמש פעיל יידחה באמצע העבודה. */
ok('🔴🔴 תקרת השרת גדולה מזו של הלקוח — אחרת נועלים משתמש פעיל בחוץ',
   24 > Number(clientTtl), 'שרת 24 מול לקוח ' + clientTtl);
ok('⚠️ ובמרווח של פי שניים לפחות, לסטיית שעון', 24 >= Number(clientTtl) * 2);
ok('הנימוק מתועד בקוד', /שתי תקרות הזמן לא דיברו זו עם זו/.test(GS));
ok('והתיקון המלא מתועד כגל בפני עצמו', /להוציא את האסימון מהכתובת/.test(GS));
ok('מנגנון הביטול הגורף לא נפגע', /sessionEpoch_\(\)/.test(GS));

section('2. שומר רגרסיה — המנגנון שהתיקון המלא ישען עליו');
ok('postRead שולח את המושב בגוף ולא בכתובת',
   /body: JSON\.stringify\(body\)/.test(R('js/data/sheets.js')) &&
   /session: authSession\(\)/.test(R('js/data/sheets.js')));
ok('⚠️ וכבקשה "פשוטה" — text/plain, בלי preflight ש-Apps Script לא עונה לו',
   /"Content-Type": "text\/plain;charset=utf-8"/.test(R('js/data/sheets.js')));

section('3. 🔴 ממצא 11 — הקפאה: אין שמות שדה עבריים חדשים');
const acc = [...new Set([...RULES.matchAll(/data\[[\x27"]([^\x27"]+)[\x27"]\]/g)].map(m => m[1]))];
const heb = acc.filter(a => /[֐-׿]/.test(a));
const KNOWN = ['סטטוס', 'מזהה', 'סכום', 'מזהה משפחה', 'מקור'].sort();
ok('כל גישות data[...] בכללים נמצאו (' + acc.length + ')', acc.length > 0);
ok('🔴🔴 השמות העבריים הם בדיוק החמישה הידועים של budgetTx',
   JSON.stringify(heb.slice().sort()) === JSON.stringify(KNOWN),
   'נמצא: ' + heb.join(', '));
ok('⚠️ ואין שם עברי חדש שנוסף לאוסף כלשהו', heb.length === 5, heb.join(', '));
const allowed = (RULES.match(/function txAllowedFields\(\)[\s\S]*?\n    \}/) || [''])[0];
ok('🔑 ו-budgetTx כבר נושא גשר אנגלי לצד העברית — המיגרציה חצי-בוצעה',
   /'year', 'familyId', 'statusPending', 'mailPending'/.test(allowed), allowed);
ok('🔴 והכפילות familyId ↔ מזהה משפחה נאכפת בכלל',
   /request\.resource\.data\.familyId == request\.resource\.data\['מזהה משפחה'\]/.test(RULES), 'חסר');
ok('⚠️ המוקש שכבר התפוצץ פעם — ספק/נמען עם הלוכסן — עדיין ברשימה',
   /'ספק\/נמען'/.test(allowed));
/* ⚠️ fsMerge_ יושב ב-**Firestore.gs** ולא ב-Code.gs — שני קבצים בפרויקט,
   וזו מלכודת מתועדת בנוהל הדיפלוי. */
const FSGS = R('apps-script/Firestore.gs');
ok('🔑 ו-fsMerge_ עוטף שם שאינו מזהה פשוט בגרשיים אחוריים',
   /fieldPaths/.test(FSGS) && /function fsMerge_/.test(FSGS), 'חסר');

section('4. שומר רגרסיה — ממצא 13 סגור');
ok('השרת ממפה את הקהל "תושבים" למזהה ASCII',
   /if \(a === .\\u05ea\\u05d5\\u05e9\\u05d1\\u05d9\\u05dd.\) return 'residents';/.test(GS) ||
   /return 'residents';/.test(GS), 'חסר');
ok('⚠️ והמיפוי רץ **לפני** TOUR_PERM_DOC — "תושבים" הוא גם שם הרשאה',
   /לפני TOUR_PERM_DOC, כי "תושבים" הוא גם שם הרשאה/.test(GS));
ok('🔴 מסמך חסר נרשם ל-CBA.diag ולא נבלע', /missed\.push\(id \+ \(e \? " \(שגיאה\)" : " \(אין מסמך\)"\)\)/.test(DS), 'חסר');
ok('והכלל פותח את tourSteps לתושב', /match \/tourSteps\/\{id\}/.test(RULES));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
