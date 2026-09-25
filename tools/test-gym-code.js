
/* בדיקות לקוד הכניסה למכון כמסמך נפרד (צעד 10ב-3, 2026-09-16).
   הרצה:  node tools/test-gym-code.js

   מריץ את הפונקציות **האמיתיות** מ-apps-script/Code.gs ומ-dataService.js,
   ובודק את firestore.rules ואת resGym.js כטקסט.

   🔴🔴 מה המארז הזה שומר עליו. הקוד הזה פותח דלת פיזית, והתקנון
   אוסר במפורש להעביר אותו. כל כשל כאן הוא "מישהו נכנס למכון
   עם מנוי שפג", בלי שאיש יראה:

     1. **הפער בין השעה לשנייה.** השרת בודק תוקף בכל קריאה;
        הסנכרון רץ פעם בשעה. בלי `validUntil` בכלל האבטחה,
        מנוי שפג בחצות היה שומר גישה עד שעה — כלל **רחב
        מהשרת**, וזה בדיוק מה שאסור. סעיפים 2 ו-4.

     2. **שתי שורות לאותו אדם.** בגיליון יושבות שורת מנוי שפג
        ושורת מנוי חדש. אם הסטטוס נגזר משורה אחת והקוד מהשנייה,
        קיבלנו "פג תוקף" **עם קוד**. סעיף 3.

     3. **מידע אישי שנוסע בטעות.** מסמך חדש = רשימת שדות חדשה
        שצריך לשמור עליה סגורה. סעיף 1.

     4. **שני הכרטיסים חייבים להיראות זהים.** הציור המוקדם
        והציור המלא — אחרת הכרטיס קופץ מתחת לאצבע של מי
        שכבר הושיט יד לדלת. סעיף 6. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS    = R('apps-script/Code.gs');
const RULES = R('firestore.rules');
const DS    = R('js/data/dataService.js');
const GYM   = R('js/screens/resGym.js');

/* ---------- הרצת הפונקציות האמיתיות מהשרת ---------- */
function grab(re) { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; }
const box = { Logger: { log() {} }, Date: Date, String: String, Number: Number, JSON: JSON, isNaN: isNaN };
vm.createContext(box);
vm.runInContext(
  "var GYM_ST_ACTIVE = 'פעיל';\n" +
  grab(/function gymToDate_\(v\) \{[\s\S]*?\n\}/) + '\n' +
  grab(/function gymCodeExpiry_\(until\) \{[\s\S]*?\n\}/) + '\n' +
  grab(/function gymCodeDoc_\(uid, code, until\) \{[\s\S]*?\n\}/) + '\n' +
  grab(/function gymRowEntitled_\(row\) \{[\s\S]*?\n\}/) + '\n' +
  "var GYM_OPEN_STATUSES = ['ממתין להצהרה','ממתין לאישור רופא','ממתין לאישור'," +
  "'ממתין לתשלום','ממתין לאימות','פעיל','מוקפא'];\n" +
  grab(/function gymPickRow_\(chosen, row\) \{[\s\S]*?\n\}/), box);

const iso = d => d.getFullYear() + '-' +
  String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dayOffset = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + n); return d; };
const row = (status, untilOffset) => {
  const r = {};
  r['סטטוס'] = status;
  r['בתוקף עד'] = untilOffset === null ? '' : iso(dayOffset(untilOffset));
  return r;
};

/* ================================================================= */
section('1. המסמך — מה בו, ומה בכוונה לא');
ok('האוסף הוא gymCode', /var FS_GYM_CODE = 'gymCode';/.test(GS));
const doc = box.gymCodeDoc_('u1', '0606', dayOffset(3));
ok('🔴 חמישה שדות בלבד',
   JSON.stringify(Object.keys(doc).sort()) ===
   JSON.stringify(['code', 'schema', 'uid', 'updatedAt', 'validUntil']),
   JSON.stringify(Object.keys(doc)));
ok('⚠️ ואין בו שום שדה מזהה — לא אימייל, לא שם, לא ת.ז.',
   !/אימייל|שם פרטי|שם משפחה|ת\.ז|טלפון/.test(JSON.stringify(Object.keys(doc))));
ok('🔴 והקוד **אינו** נוסע במסמך הסטטוס',
   !/GYM_FS_FIELDS[\s\S]{0,700}קוד כניסה/.test(GS) &&
   !/GYM_FS_FIELDS = \[[\s\S]*?\];/.test(GS.replace(/\\u05e7\\u05d5\\u05d3/g, '')) === false);
ok('⚠️ validUntil הוא Date אמיתי — כלומר timestampValue ב-Firestore',
   doc.validUntil instanceof Date && !isNaN(doc.validUntil.getTime()));

/* ================================================================= */
section('2. 🔴🔴 התוקף — מדויק לשנייה, לא לשעה');
/* היום האחרון נחשב במלואו: 'בתוקף עד' = היום ⇒ תקף עד חצות הלילה. */
const today = dayOffset(0);
const exp = box.gymCodeExpiry_(today);
ok('🔴 הפקיעה היא תחילת היום **שאחרי** "בתוקף עד"',
   exp.getTime() === dayOffset(1).getTime(),
   exp.toISOString() + ' ≠ ' + dayOffset(1).toISOString());
ok('🔴 ולכן מי שהמנוי שלו מסתיים היום עדיין מקבל קוד היום',
   exp.getTime() > Date.now());
ok('⚠️ ומי שהסתיים אתמול — לא', box.gymCodeExpiry_(dayOffset(-1)).getTime() <= Date.now());
ok('⚠️ והשעה מאופסת (לא "עוד 24 שעות מרגע הסנכרון")',
   exp.getHours() === 0 && exp.getMinutes() === 0 && exp.getSeconds() === 0);

section('   וההחלטה מי זכאי — אותה בדיקה בדיוק כמו handleGymMy_');
ok('פעיל + בתוקף עד עתידי ⇒ זכאי', !!box.gymRowEntitled_(row('פעיל', 30)));
ok('פעיל + בתוקף עד היום ⇒ זכאי', !!box.gymRowEntitled_(row('פעיל', 0)));
ok('🔴 פעיל + פג אתמול ⇒ **לא** זכאי', !box.gymRowEntitled_(row('פעיל', -1)));
ok('🔴 "פג תוקף" ⇒ לא זכאי', !box.gymRowEntitled_(row('פג תוקף', 30)));
ok('🔴 "ממתין לתשלום" ⇒ לא זכאי', !box.gymRowEntitled_(row('ממתין לתשלום', 30)));
ok('⚠️ בלי תאריך תוקף ⇒ לא זכאי (נכשל-סגור)', !box.gymRowEntitled_(row('פעיל', null)));
ok('⚠️ שורה ריקה ⇒ לא זכאי', !box.gymRowEntitled_({}));
/* 🔴 הצלבה מול השרת: אותם שני תנאים, מילה במילה. */
ok('🔴 והשרת ב-handleGymMy_ בודק בדיוק את אותם שניים',
   /isActive = String\(membership\['סטטוס'\]\)\.trim\(\) === GYM_ST_ACTIVE/.test(GS.replace(/ \|\| ''/g, '')) ||
   /=== GYM_ST_ACTIVE;[\s\S]{0,300}until\.getTime\(\) >= new Date\(\)\.setHours\(0, 0, 0, 0\)/.test(GS));

/* ================================================================= */
section('3. 🔴🔴 שורה אחת לאדם — הסטטוס והקוד לא יכולים להיגזר משורות שונות');
ok('ההכרעה עברה למפה לפי uid', /var byUid = \{\}, order = \[\];/.test(GS));
/* 🔴🔴 והבחירה עצמה חייבת להיות זהה ל-`gymFindRow_`, שדרכה
   `handleGymMy_` מוצא את המנוי. סנכרון שבוחר שורה אחרת מציג
   ב-Firestore מנוי אחר ממה שהשרת מציג — הגרוע מכול, כי הם
   מסכימים כמעט תמיד. */
(function () {
  const active  = row('פעיל', 30);
  const expired = row('פג תוקף', -100);
  const pick = rows => rows.reduce((c, r) => box.gymPickRow_(c, r), null);
  ok('🔴 שורה פתוחה מנצחת גם כשהיא ראשונה', pick([active, expired]) === active);
  ok('🔴 וגם כשהיא אחרונה', pick([expired, active]) === active);
  ok('⚠️ שתי סגורות ⇒ האחרונה, כמו ה-fallback של gymFindRow_',
     pick([row('נדחה', -200), expired]) === expired);
  ok('⚠️ שתי פתוחות ⇒ הראשונה, כמו gymFindRow_',
     pick([active, row('ממתין לתשלום', 5)]) === active);
  ok('🔴 ולכן "פג תוקף + מנוי חדש פעיל" נותן סטטוס פעיל **וגם** קוד',
     pick([expired, active])['סטטוס'] === 'פעיל' && !!box.gymRowEntitled_(pick([expired, active])));
})();
ok('⚠️ והבחירה היא נקודה אחת שקוראת ל-gymPickRow_',
   /byUid\[uid\] = gymPickRow_\(byUid\[uid\], row\);/.test(GS) &&
   (GS.match(/gymPickRow_\(/g) || []).length === 2,
   String((GS.match(/gymPickRow_\(/g) || []).length));
ok('🔴 והכתיבה נגזרת ממנה, לא מהמעבר על השורות',
   /order\.forEach\(function \(uid\) \{\s*\n\s*var row = byUid\[uid\];[\s\S]{0,400}gymStatusDoc_\(row, uid\)[\s\S]{0,400}gymRowEntitled_\(row\)/.test(GS));
ok('⚠️ ולכן יש כתיבה אחת לאדם, לא שתיים', /if \(!byUid\[uid\]\) order\.push\(uid\);/.test(GS));

section('   והסחיפה — מי שכבר אינו זכאי נמחק');
ok('הקודים נכתבים לאוסף שלהם', /fsWriteAll_\(FS_GYM_CODE, codeItems, cOut, codeLive\);/.test(GS));
ok('🔴 ויש סחיפת יתומים — אחרת קוד של מי שעזב היה נשאר לנצח',
   /fsSweepOrphans_\(FS_GYM_CODE, codeLive, cOut\);/.test(GS));
ok('🔴 אין קוד בהגדרות ⇒ אין כתיבה בכלל (והסחיפה מנקה)',
   /if \(!code\) return;/.test(GS));
ok('⚠️ ומוני הקודים נפרדים מהסטטוס בלוג', /קודי כניסה: נכתבו/.test(GS));

/* ================================================================= */
section('4. 🔴🔴 הכלל — הוא מה שמפריד, לא הסנכרון');
const block = (RULES.match(/match \/gymCode\/\{uid\} \{[\s\S]*?\n    \}/) || [''])[0];
/* 🔴 התנאי יושב בפונקציה בעלת שם — כלל הקובץ מ-15.9. */
const fnGym = (RULES.match(/function canSeeGymCode\(uid\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('יש בלוק gymCode', !!block);
ok('⚠️ והוא מאציל לפונקציה בעלת שם ולא לתנאי פרוש',
   /allow read: if canSeeGymCode\(uid\);/.test(block) && !!fnGym);
const fnSt = (RULES.match(/function canSeeGymStatus\(uid\) \{[\s\S]*?\n    \}/) || [''])[0];
ok('🔴 והיא דורשת שהמסמך יהיה שלך', /canSeeGymStatus\(uid\)/.test(fnGym) &&
   /request\.auth\.uid == uid/.test(fnSt));
/* 🔴🔴 **מתג הכיבוי.** תושב שעזב מקבל active:false מיד, ו-authorize_
   דוחה אותו באותו רגע. אבל gymUidByEmail_ בונה את מפת האימיילים
   מטאב התושבים בלי להסתכל בסטטוס — ולכן הסנכרון השעתי היה ממשיך
   לכתוב לו קוד עד תום המנוי. בלי הבדיקה הזאת, מי שעזב את השיכון
   שומר את קוד הדלת לחודשים. */
ok('🔴🔴 ו**חברות פעילה** — אחרת מי שעזב שומר את קוד הדלת',
   /isMember\(\)/.test(fnSt));
ok('🔴 ומשתמש חיצוני חסום, בדיוק כמו ב-authorize_',
   /m\(\)\.isExternal == false/.test(fnSt));
ok('🔴🔴 **וגם שהתוקף לא עבר** — זה מה שסוגר את פער השעה',
   /request\.time < resource\.data\.validUntil/.test(fnGym));
ok('⚠️ ו-is timestamp — שדה חסר נכשל-סגור במפורש',
   /resource\.data\.validUntil is timestamp/.test(fnGym));
ok('⚠️ ושלושת התנאים ב-AND ולא ב-OR', /&&/.test(fnGym) && !/\|\|/.test(fnGym));
ok('🔴 והדפדפן לעולם אינו כותב', /allow write: if false;/.test(block));
ok('⚠️ ואין allow גורף שנשאר בטעות', !/allow read, write/.test(block));
/* 🔴 הכלל של gymStatus נשאר צר כשהיה, ובלי קוד. */
ok('⚠️ מסמך הסטטוס נשאר בלי תנאי זמן — אין בו מה שפוקע',
   /match \/gymStatus\/\{uid\} \{\s*\n\s*allow read: if canSeeGymStatus\(uid\);/.test(RULES) &&
   !/validUntil/.test(fnSt));
ok('🔴 וברירת המחדל "הכול אסור" עדיין אחרונה',
   RULES.lastIndexOf('match /{document=**}') > RULES.indexOf('match /gymCode/'));

/* ================================================================= */
section('5. הלקוח — קריאה שכישלון בה הוא "אין קוד", לא שגיאה');
ok('getGymCodeFast קיים ומיוצא',
   /function getGymCodeFast\(cb\)/.test(DS) && /getGymCodeFast: getGymCodeFast,/.test(DS));
ok('⚠️ ואין בו שום בדיקת תוקף בלקוח — השער היחיד הוא הכלל',
   !/validUntil/.test((DS.match(/function getGymCodeFast\(cb\) \{[\s\S]*?\n  \}/) || [''])[0]));

(function () {
  const src = (DS.match(/function getGymCodeFast\(cb\) \{[\s\S]*?\n  \}/) || [''])[0];
  function run(fb, uidFn) {
    const sb = { CBA: { fb: fb }, console: { log() {} } };
    sb.window = sb;
    if (fb) fb.uid = uidFn;
    vm.createContext(sb);
    vm.runInContext(src + '\nvar __r = "NOT-CALLED"; getGymCodeFast(function (c) { __r = c; });', sb);
    return sb.__r;
  }
  const base = over => Object.assign({
    ensureDb: cb => cb(null),
    authReady: cb => cb({ uid: 'u1' }),
    readDoc: (c, id, cb) => cb(null, { code: '0606' })
  }, over || {});
  ok('מסמך תקין ⇒ הקוד חוזר', run(base(), () => 'u1') === '0606');
  ok('🔴 דחיית הרשאה (המנוי פג) ⇒ מחרוזת ריקה, לא שגיאה',
     run(base({ readDoc: (c, i, cb) => cb(new Error('permission-denied')) }), () => 'u1') === '');
  ok('⚠️ אין מסמך ⇒ ריק', run(base({ readDoc: (c, i, cb) => cb(null, null) }), () => 'u1') === '');
  ok('⚠️ אין משתמש ⇒ ריק', run(base({ authReady: cb => cb(null) }), () => 'u1') === '');
  ok('⚠️ אין DB ⇒ ריק', run(base({ ensureDb: cb => cb(new Error('x')) }), () => 'u1') === '');
  ok('⚠️ אין uid ⇒ ריק', run(base(), () => '') === '');
  ok('⚠️ אין SDK כלל ⇒ ריק', run(null) === '');
  ok('🔴 והאוסף הנקרא הוא gymCode',
     /CBA\.fb\.readDoc\("gymCode", uid,/.test(src));
})();

/* ================================================================= */
section('6. המסך — כרטיס אחד, שני מסלולים');
ok('🔴 נקודת הרכבה אחת לכרטיס הקוד', /function codeCardHTML\(code\) \{/.test(GYM));
ok('🔴 ושני המסלולים קוראים לה',
   (GYM.match(/codeCardHTML\(/g) || []).length === 3,
   String((GYM.match(/codeCardHTML\(/g) || []).length));
ok('⚠️ ואין HTML כפול של הכרטיס', (GYM.match(/gym-code__value/g) || []).length === 1,
   String((GYM.match(/gym-code__value/g) || []).length));
/* 25.9 — הבלוק החלקי מציג גם מד תוקף וכפתור דלת לפני הקוד; הקוד עדיין בתוכו. */
ok('הציור המוקדם מציג את הקוד', /if \(partial\) \{[\s\S]{0,2000}if \(st\.fastCode\) html \+= codeCardHTML\(st\.fastCode\);[\s\S]{0,800}return html;/.test(GYM));
/* 🔴 היעדר קוד בציור המוקדם פירושו "עוד לא יודעים" — לא "אין קוד".
   הענף "הכניסה באמצעות מפתח" שייך לתשובה המלאה בלבד. */
ok('🔴 ואינו מציג "עדיין באמצעות מפתח" לפני שהתשובה המלאה הגיעה',
   !/if \(partial\)[\s\S]{0,400}באמצעות מפתח/.test(GYM));
ok('🔴 וכפתור ההעתקה מחווט בשני המסלולים',
   /function wireCopy\(container\)/.test(GYM) &&
   (GYM.match(/wireCopy\(container\);/g) || []).length === 2,
   String((GYM.match(/wireCopy\(container\);/g) || []).length));
/* 🔴 שני בלוקים אחים ב-`load`, לא אחד בתוך השני: הקוד אינו
   ממתין לסטטוס, כי הכלל לא יימסור אותו למי שאינו זכאי —
   ולכן אין מה "לאמת" לפניו. שרשור היה מכפיל את ההמתנה. */
ok('⚠️ הקריאה מקבילה ואינה ממתינה לסטטוס',
   /\n    \}\n\n    if \(CBA\.data\.getGymCodeFast\) \{\n      CBA\.data\.getGymCodeFast\(function \(code\) \{/.test(GYM));
ok('⚠️ ותשובה מאוחרת אינה דורסת את התשובה המלאה',
   /if \(!code \|\| !st\.loading \|\| st\.my\) return;/.test(GYM));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
