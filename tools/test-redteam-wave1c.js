/* בדיקות למנה ג' — סגירת גל 1 בצוות האדום (2026-09-17).
   הרצה:  node tools/test-redteam-wave1c.js

   ממצא 04 — מסלול ההרשמה. 🔑 **הממצא נוסח בדוח כ"אין מסלול הצטרפות",
   והבדיקה בקוד הראתה שהמנגנון בנוי במלואו מ-7.8.2026 ותקין.** מה שחסר
   היה **גילוי**: הכפתור מופיע רק אחרי שמישהו התחבר עם Google ונדחה,
   ותושב חדש שרואה "התחברות לחברי הקהילה" לא מנחש שהכפתור הזה גם שלו.
   לכן הבדיקות כאן שומרות על שני דברים: שהמנגנון לא נשבר, ושהרמז קיים.

   ממצא 19 — נסגר כ"לא ייתוקן" בהחלטת יועד (תשפ"ו לתיעוד בלבד).
   אין לו בדיקה, ובכוונה: אין קוד שמשתנה. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const APP = R('js/app.js');
const CSS = R('css/style.css');
const GS  = R('apps-script/Code.gs');

section('1. המנגנון — היה בנוי, ולא נשבר');
ok('הפעולה submitSignup חיה בשרת', /case 'submitSignup'|action === 'submitSignup'|submitSignup/.test(GS));
ok('הלקוח שולח טוקן גוגל מאומת ולא מייל חופשי',
   /action=submitSignup&token=" \+ encodeURIComponent\(signupToken\)/.test(APP));
ok('הטופס דורש את ארבעת השדות', /צריך למלא שם פרטי, שם משפחה, מספר בית וטלפון/.test(APP));
ok('וכפילות מדווחת ולא נשלחת פעמיים', /d\.duplicate \? "בקשה שלך כבר ממתינה לאישור\."/.test(APP));

section('2. 🔴 הגילוי — כפתור אמיתי במצב הפתיחה');
/* 🔑 הכרעת יועד (17.9): לא רק שורת טקסט — **כפתור**, כבר במסך הראשון. */
ok('🔴 כפתור ההרשמה מצויר תמיד, לא רק אחרי דחייה',
   /'<button type="button" class="login-signup" id="gate-signup">בקשת הרשמה לקהילה<\/button>' \+/.test(APP));
ok('⚠️ ואינו תלוי יותר ב-signupToken',
   !/signupToken\s*\n?\s*\? '<button type="button" class="login-signup"/.test(APP));
ok('הרמז מתחת מסביר למה מתחילים ב-Google',
   /ההרשמה מתחילה בהתחברות עם Google/.test(APP));
ok('⚠️ והרמז נעלם ברגע שכבר יש טוקן', /signupToken \? '' :\s*\n?\s*'<p class="login-hint">/.test(APP));

section('2ב. 🔴 לחיצה בלי טוקן — הסבר, לא טופס שבור');
ok('🔴 openSignupForm מנתב להסבר כשאין טוקן',
   /if \(!signupToken\) return openSignupIntro\(\);/.test(APP));
ok('כרטיס ההסבר קיים ומסביר את שלושת הצעדים',
   /function openSignupIntro/.test(APP) && /class="signup-steps"/.test(APP));
ok('⚠️ ואינו מתחזה ללחוץ על כפתור Google (GIS ב-iframe — קליק מסונתז לא עובד)',
   !/gate-signin[^]{0,200}\.click\(\)/.test(APP));
ok('סגירת ההסבר מדגישה את כפתור Google',
   /btn\.classList\.add\("is-pulse"\)/.test(APP) && /#gate-signin\.is-pulse/.test(CSS));
ok('⚠️ וההדגשה מכבדת prefers-reduced-motion',
   /@media \(prefers-reduced-motion: reduce\)[^]{0,120}is-pulse/.test(CSS));
ok('שלושת הצעדים מעוצבים', /\.signup-steps \{/.test(CSS));

section('3. הניסוח — צעד הבא במקום קיר');
ok('🔴 "לא נמצא ברשימת התושבים" הוחלף בניסוח שמוביל הלאה',
   /האימייל שלך עדיין לא ברשימת התושבים\. אפשר לשלוח בקשת הרשמה לוועד:/.test(APP) &&
   !/"האימייל שלך לא נמצא ברשימת התושבים\."/.test(APP));
ok('🔴 וההודעה אינה אדומה כשיש המשך',
   /signupToken \? 'login-note' : 'up-err'/.test(APP));
ok('⚠️ אבל חסימה אמיתית ("עזב") נשארת שגיאה',
   /המשתמש מסומן כ'עזב' — הגישה חסומה\./.test(APP) &&
   APP.indexOf("reason === \"inactive\"") !== -1);
ok('שתי המחלקות החדשות מוגדרות ב-CSS',
   /\.login-hint \{/.test(CSS) && /\.login-note \{/.test(CSS));
ok('⚠️ ושתיהן משניות — כפתור Google נשאר הפעולה הראשית',
   /\.login-hint \{[^}]*var\(--text-soft\)/.test(CSS));

section('4. גרסה');
const IDX = R('index.html'), SW = R('service-worker.js');
const vers = [...new Set((IDX.match(/\?v=([0-9a-z]+)/g) || []))];
ok('כל התגים ב-index.html באותה גרסה', vers.length === 1, vers.join(','));
ok('🔴 ו-VERSION ב-service-worker זהה לה',
   SW.indexOf('var VERSION = "' + vers[0].slice(3) + '";') !== -1);
ok('והגרסה עלתה מ-20260917b', vers[0] !== '?v=20260917b', vers[0]);

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
