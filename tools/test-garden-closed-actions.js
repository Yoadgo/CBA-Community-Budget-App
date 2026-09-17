/* משימה סגורה — פתיחה מחדש ומחיקה  (2026-09-17, גל 2 · ממצאים 22 + 20)
   הרצה:  node tools/test-garden-closed-actions.js

   🔴 מה שהממצא באמת היה, ולמה זה חשוב לבדיקה:
     · **מחיקה מעולם לא נחסמה בשרת.** `gardenTaskDelete_` היא פעולה נפרדת
       שאינה בודקת סגירה כלל. מה שחסם אותה היה הלקוח — כרטיס סגור קיבל
       תפריט ⋯ רק כשהיה בחלון הערעור. ולכן בדיקה שתבדוק "השרת מתיר
       מחיקה" תעבור גם לפני התיקון ולא תוכיח דבר; מה שצריך להיבדק הוא
       שער הכרטיס.
     · **פתיחה מחדש כן נחסמה בשרת**, ורק שם: `reopenable` דרש סגירה
       'בוצע' וגם חלון ערעור פתוח. סגירה בסיבה שגויה ודיווח תושב סגור
       היו בלתי הפיכים.
     · **התג לא צויר.** כרטיס סגור לא צייר שום דגל, ולכן "דורש בדיקה
       חוזרת" — הסיבה שבגללה הכרטיס יושב בתור "דורש החלטה" — לא הופיעה
       עליו בשום מקום.
     · **העדכון האופטימי.** `OPTIMISTIC.undo` ניקה סגירה רק כשהיא 'בוצע',
       ולכן פתיחה מחדש של "בוטל" הייתה נשמרת בשרת ונשארת סגורה על המסך. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const GT = R('js/screens/gardenTasks.js');

section('1. 🔴 השרת — מנהל פותח מחדש כל סגירה, בלי הגבלת זמן');
const guard = (GS.match(/if \(cur\.closure\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('המשמר קיים', !!guard);
ok('🔴 מנהל (לא חיצוני) הוא תנאי מספיק לפתיחה מחדש',
   /isMgr\s*=\s*!perm\.isExternal/.test(guard) && /reopenable\s*=\s*reopenAct\s*&&\s*\(isMgr/.test(guard), guard);
ok('⚠️ הגנן החיצוני נשאר עם חלון הערעור על "בוצע" בלבד',
   /cur\.closure === 'בוצע' && gardenWithinDispute_\(cur\)/.test(guard), guard);
ok('undo ו-return הן הפעולות הפותחות — ולא כל פעולה',
   /reopenAct\s*=\s*\(act === 'undo' \|\| act === 'return'\)/.test(guard), guard);
ok('clearflag עדיין חריג בפני עצמו', /act !== 'clearflag'/.test(guard), guard);
ok('🔴 וכל השאר עדיין נדחה', /המשימה כבר נסגרה/.test(guard), guard);

section('2. היומן רושם את הסגירה האמיתית, לא "בוצע" קבוע');
ok("🔴 gardenLog_ מקבל cur.closure ולא מחרוזת קבועה",
   /gardenLog_\(ss, id, 'ביטול ביצוע', 'סגירה', cur\.closure/.test(GS), 'לא נמצא');
ok('ואינו משאיר את הגרסה הישנה',
   !/gardenLog_\(ss, id, 'ביטול ביצוע', 'סגירה', 'בוצע'/.test(GS));

section('3. 🔴 מחיקה — הוכחה שהחסם היה בלקוח ולא בשרת');
const del = (GS.match(/function gardenTaskDelete_[\s\S]*?\n\}/) || [''])[0];
ok('gardenTaskDelete_ קיימת', !!del);
ok('⚠️ והיא אינה בודקת סגירה כלל — לכן התיקון הוא בכרטיס',
   !!del && !/closure/.test(del), del);
ok('היא כן דורשת סיבה שנשמרת ביומן', /צריך לכתוב למה מוחקים/.test(del));

section('4. 🔴 הכרטיס הסגור — תפריט ⋯ למנהל, תמיד');
const card = (GT.match(/if \(t\.closure\) \{[\s\S]*?'<\/article>';/) || [''])[0];
ok('הענף של הכרטיס הסגור קיים', !!card);
ok('🔴 התנאי הוא canDispute **או** מנהל', /canDispute\(t\) \|\| isManager/.test(card), card);
ok('מי שאינו מנהל ומחוץ לחלון עדיין מקבל קיצור להיסטוריה',
   /data-act="hist"/.test(card), card);
ok('🔴 והדגל מצויר על הכרטיס הסגור', /t\.flag && t\.flag !== "ממתין לאישור"/.test(card), card);

section('5. תפריט ⋯ — פתיחה מחדש והחזרה לצוות');
ok('כפתור "פתיחה מחדש" קיים', /data-m="reopen"/.test(GT));
ok('⚠️ והוא מוצג רק כשאין כבר "ביטול סימון" — לא שתי דרכים לאותו דבר',
   /isManager && t\.closure && !canDispute\(t\)/.test(GT), 'התנאי לא נמצא');
ok('🔴 "לא בוצע כמו שצריך" נפתח גם על סגורה מחוץ לחלון הערעור',
   /isManager && \(t\.flag === "ממתין לאישור" \|\| canDispute\(t\) \|\| t\.closure\)/.test(GT));
ok('מחיקה נשארת ללא תנאי סגירה', /data-m="del"/.test(GT));

section('6. כרטיס הפרטים — בדיוק הכרטיס שיושב בתור "דורש החלטה"');
ok('🔴 מנהל על דיווח סגור מקבל את שתי ההחלטות',
   /if \(isManager && closed\) \{[\s\S]*?data-m="return"[\s\S]*?data-m="reopen"/.test(GT));
ok('"טופל" למשוב חוזר נשאר', /t\.flag === "דורש בדיקה חוזרת"[\s\S]{0,200}data-m="clearflag"/.test(GT));

section('7. 🔴 העדכון האופטימי — כל סגירה, לא רק "בוצע"');
const opt = (GT.match(/undo:\s*function \(t\) \{[\s\S]*?\},/) || [''])[0];
ok('הענף קיים', !!opt);
ok('🔴 התנאי הוא if (t.closure) ולא השוואה ל"בוצע"',
   /if \(t\.closure\) \{/.test(opt) && !/t\.closure === "בוצע"/.test(opt), opt);
ok('⚠️ גם "אושר על ידי" מתנקה — אחרת הכרטיס מציג מאשר למשימה פתוחה',
   /approvedBy = ""/.test(opt), opt);

section('8. הטוסט מספר מה קרה באמת');
ok('🔴 נוסח שונה לפתיחה מחדש של סגירה שאינה "בוצע"',
   /wasClosure && wasClosure !== "בוצע"/.test(GT));
ok('⚠️ ו-wasClosure נלקח לפני העדכון האופטימי',
   GT.indexOf('var wasClosure') < GT.indexOf('if (t && OPTIMISTIC[op])'));

section('9. פתיחה מחדש מבקשת סיבה שנשמרת ביומן');
ok('הדיאלוג קיים', /m === "reopen"/.test(GT));
ok('🔴 והסיבה נשלחת כ-note ל-undo', /run\("undo", t\.id, \{ note: why \}\)/.test(GT));
ok('⚠️ והשרת באמת שומר אותה', /String\(body\.note \|\| ''\)\.trim\(\)\.substring\(0, 500\)\);/.test(GS));

section('10. 🔴 מייל לתושב כשדיווח נפתח מחדש');
ok('התבנית GARDEN_REOPENED קיימת בברירות המחדל', /'GARDEN_REOPENED',/.test(GS));
ok('⚠️ והיא נכנסת לגיליון לבד — ensureEmailSettingsSheet_ מוסיף רק מפתחות חסרים',
   /var toAdd = DEFAULT_EMAIL_SETTINGS\.filter/.test(GS));
ok('היא בתחום הגינון ופעילה', /'GARDEN_REOPENED',[\s\S]{0,900}PERM_GARDEN, 'כן'\]/.test(GS));
const nf = (GS.match(/function gardenNotifyReopened_[\s\S]*?\n\}/) || [''])[0];
ok('gardenNotifyReopened_ קיימת', !!nf);
ok('🔴 היא עוברת דרך sendResidentTemplate_ הקיים ולא דרך מנגנון חדש',
   /sendResidentTemplate_\(ss, 'GARDEN_REOPENED'/.test(nf), nf);
ok('⚠️ ומשימה בלי דיווח היא no-op טבעי — אין תנאי kind',
   /gardenReportsForTask_\(ss, taskId\)/.test(nf) && !/kind/.test(nf), nf);
ok('כשל מייל אינו מבטל את הפעולה', /catch \(e\)/.test(nf), nf);
ok('⚠️ סיבה ריקה לא משאירה שורה כפולה', /\+ '\\n\\n' : ''/.test(nf), nf);

section('11. השליחה — רק כשבאמת בוטלה סגירה');
ok('🔴 ב-undo היא אחרי הכתיבה לגיליון, לא לפניה',
   /'תאריך אישור', ''\);[\s\S]{0,260}gardenNotifyReopened_/.test(GS));
ok('🔴 ב-return היא מותנית ב-wasClosed', /if \(wasClosed\) gardenNotifyReopened_\(ss, id, wasClosed, why\);/.test(GS));
ok('⚠️ wasClosed נלקח לפני ניקוי הסגירה', GS.indexOf('var wasClosed = cur.closure;') < GS.indexOf("if (wasClosed) gardenNotifyReopened_"));
ok('⚠️ "החזרה להשלמה" על משימה פתוחה אינה שולחת כלום',
   !/gardenSet_\(sh, row, c, 'דגל', 'הוחזר להשלמה'\);[\s\S]{0,120}gardenNotifyReopened_\(ss, id, cur/.test(GS));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
