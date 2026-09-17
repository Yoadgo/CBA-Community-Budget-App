/* גל 2 · מנה ג' — ממצאים 12, 09, 14, 07, 08  (2026-09-17)
   הרצה:  node tools/test-wave2-batch-c.js

   חמישה תיקונים בלתי קשורים בחבילה אחת, לפי בקשת יועד ("אני רוצה הכול
   בתיקון אחד"). כל סעיף כאן נועל את **ההכרעה** ולא את הניסוח. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const RES = R('js/screens/resident.js');
const EXP = R('js/screens/expenses.js');
const RSD = R('js/screens/residents.js');
const DS  = R('js/data/dataService.js');
const CSS = R('css/style.css') + R('css/resident.css');

section('1. ממצא 12 — החוצץ אומר איזה חודש זה');
ok('🔴 הכותרת נושאת מילת הבהרה', /var monthWord = \(nSettled && allPaid\) \? "שולם ב" : "צפוי ב";/.test(RES));
ok('והיא נכנסת לכותרת החודש', /monthWord \+\s*\n?\s*CBA\.esc\(CBA\.data\.hebrewMonth\(monthIso\)\)/.test(RES));
ok('⚠️ הניסוח נגזר מהסטטוס ולא מהתאריך — כמו השורה שמתחתיו',
   /nSettled && allPaid/.test(RES));

section('2. 🔴 ממצא 09 — קובץ הקבלה יורד עם התנועה');
const del = (GS.match(/function deleteTransactionRow_[\s\S]*?\n\}/) || [''])[0];
ok('הפונקציה נמצאה', !!del);
ok('🔴🔴 הקישור נקרא **לפני** מחיקת השורה', 
   del.indexOf("var link =") > -1 && del.indexOf("var link =") < del.indexOf('sh.deleteRow'), del);
ok('🔴 והקובץ נשלח לסל המיחזור', /if \(link\) trashDriveFile_\(link\);/.test(del), del);
ok('⚠️ סל מיחזור ולא מחיקה סופית — מחיקה בטעות ניתנת לשחזור',
   /setTrashed\(true\)/.test(GS));
ok('⚠️ והמסמך ב-Firestore עדיין יורד, אחרת המראה תחזיר את השורה',
   /btxDropDoc_\(body\.year, body\.id\);/.test(del), del);
ok('טאב בלי עמודת "קישור קבלה" לא מפיל את המחיקה', /cLink === -1/.test(del), del);

section('3. 🔴 ממצא 14 — מחיקת משק בית, ושלושת השומרים');
const dr = (GS.match(/function deleteResidentRow_[\s\S]*?\n\}\n/) || [''])[0];
ok('deleteResidentRow_ קיימת', !!dr);
ok('🔴 שומר 1 — היסטוריה כספית חוסמת', /blocked: 'history'/.test(dr), dr);
ok('⚠️ וההודעה מפנה ל"עזב" במקום', /סמנו "עזב" במקום/.test(dr), dr);
ok('🔴🔴 שומר 2 — הגישה נשללת לפני מחיקת השורה',
   dr.indexOf("active: false") > -1 && dr.indexOf("active: false") < dr.indexOf('rsh.deleteRow'), dr);
ok('🔴 ושלילה שנכשלה עוצרת את המחיקה',
   /if \(revokeErrors\.length\) \{[\s\S]{0,140}return \{ ok: false/.test(dr), dr);
ok('⚠️ שומר 3 — מחיקת המסמך היא מאמץ-מיטבי, אחרי הכול',
   dr.indexOf('fsDelete_') > dr.indexOf('rsh.deleteRow'), dr);
ok('⚠️ ומטמון ההרשאות לפי מייל מתנקה', /PERMS_MEMO_\[key\]/.test(dr), dr);
ok('נעילה על כל הפעולה', /LockService\.getScriptLock\(\)/.test(dr), dr);
const tf = (GS.match(/function txRowsForFamily_[\s\S]*?\n\}/) || [''])[0];
ok('txRowsForFamily_ סורקת את כל השנים', /ss\.getSheets\(\)\.forEach/.test(tf), tf);
ok('⚠️ והארכיון מוחרג — הוא אינו היסטוריה חיה', /name === BTX_ARCHIVE_TAB/.test(tf), tf);
ok('הפעולה מנותבת ב-doPost', /case 'deleteResidentRow': return json_\(deleteResidentRow_\(ss, body\)\);/.test(GS));
ok('🔴 ומוגנת באותה הרשאה כמו עריכת שורה', /deleteResidentRow: PERM_RESIDENTS/.test(GS));
ok('וגם ברשימת התחומים', /deleteResidentRow: 'residents'/.test(GS));

section('4. ממצא 14 — צד הלקוח');
ok('הכפתור קיים במגירה', /data-rdelete/.test(RSD));
ok('⚠️ והוא מנוסח כ"רק לשורה שנוצרה בטעות"', /רק לשורה שנוצרה בטעות/.test(RSD));
ok('🔴 דיאלוג אישור הרסני שאומר שהגישה תישלל',
   /יאבד גישה[\s\S]{0,80}לאפליקציה מיד/.test(RSD) && /danger: true/.test(RSD));
ok('⚠️ ומפנה ל"עזב" כשהמשפחה פשוט עזבה', /בטלו וסמנו "עזב" במקום/.test(RSD));
ok('🔴 שגיאת השרת מוצגת כמות שהיא — היא מסבירה למה', /res && res\.error\) \|\| "המחיקה נכשלה"/.test(RSD));
ok('⚠️ ואחרי מחיקה נטענים מחדש מהשרת — האינדקסים זזו',
   /resState\.loaded = false;\s*\n\s*CBA\.data\.refreshResidents/.test(RSD));
ok('deleteResidentRow קיימת ב-dataService', /deleteResidentRow: function \(rowIndex, cb\)/.test(DS));
ok('סגנון לכפתור ההרסני', /\.btn-ghost\.is-danger/.test(CSS));

section('5. ממצא 07 — היררכיית מודאל התשלום');
const pay = (RES.match(/function openPaymentReminder[\s\S]*?\n  \}/) || [''])[0];
ok('הפונקציה נמצאה', !!pay);
ok('🔴 שליחת הבקשה היא ה-CTA הראשי',
   /<button type="button" class="btn-primary" id="rc-pay-continue">שליחת הבקשה<\/button>/.test(pay), pay);
ok('🔴 והיא מופיעה **לפני** כפתור התשלום',
   pay.indexOf('rc-pay-continue') < pay.indexOf('club-pay__btn'), pay);
ok('🔴 PayBox נשאר מזוהה לגמרי — שם, סמליל וסכום',
   /payboxIcon \+ '<span>תשלום ב-PayBox · 200₪<\/span>'/.test(pay), pay);
ok('⚠️ אבל כפעולה משנית', /club-pay__btn--ghost/.test(pay), pay);
/* ⚠️ נבדק על **הכותרת המצוירת** ולא על הימצאות המחרוזת: ההערה שמעל
   הפונקציה מצטטת את הנוסח הישן כדי להסביר למה הוא הוחלף. */
ok('⚠️ והכותרת כבר לא מציגה תשלום כתנאי מעבר',
   /modal__title">הבקשה מוכנה לשליחה</.test(pay) &&
   !/modal__title">לפני שממשיכים/.test(pay), pay);
ok('הסגנון המשני קיים ושומר על הסגול של PayBox',
   /\.club-pay__btn--ghost \{[^}]*#5B21B6/.test(CSS));

section('6. 🔴 ממצא 08 — אישור = סיווג בתקציב בלבד');
ok('🔴 הענף הישן שפתח מגירה מלאה נעלם',
   !/נפתח טופס עריכה להשלמה/.test(EXP), 'עדיין שם');
ok('🔴 ובמקומו חלון הסיווג', /txOpenClassifyModal\(container, t\);/.test(EXP));
const cm = (EXP.match(/function txOpenClassifyModal[\s\S]*?\n\}\n/) || [''])[0];
ok('הפונקציה קיימת', !!cm);
ok('🔴🔴 הסטטוס מתקדם **בכל מקרה** — אין תנאי על שדות חסרים',
   /status: "ready"/.test(cm) && !/missingApprovalFields\(t\)[\s\S]{0,200}return;/.test(cm), cm);
ok('⚠️ שדות חסרים מוצגים כהערה ולא כשער', /חסר עדיין: /.test(cm), cm);
ok("⚠️ ו'סעיף תקציבי' מוחרג מההערה — הוא מה שהחלון ממלא",
   /m !== "סעיף תקציבי"/.test(cm), cm);
ok('🔴 בלי סעיף אין אישור', /if \(!cat\) return;/.test(cm), cm);
ok('⚠️ הערת הבדיקה מתנקה, כמו במסלול הרגיל', /reviewNote: ""/.test(cm), cm);
ok('⚠️ תת-סעיף תלוי בסעיף', /cat\.addEventListener\("change"/.test(cm), cm);
ok('🔴 ובלי "+ צור תת-סעיף חדש" — זו זרימה אחרת',
   cm.indexOf('__new__') === -1, cm);
ok('משתמש בדיאלוג הקיים ולא במודל חדש', /CBA\.ui\.dialog\(\{/.test(cm), cm);
ok('⚠️ sticky — Escape לא זורק לפח בחירה שנעשתה', /sticky: true/.test(cm), cm);
ok('⚠️ האישור המרוכז לא נגע — הוא נשאר דורש פרטים מלאים',
   /אושרו להנה"ח/.test(EXP));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
