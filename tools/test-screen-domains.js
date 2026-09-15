
/* בדיקות לרישום "איזה מסך צריך איזה תחום" (16.9.2026).
   הרצה:  node tools/test-screen-domains.js

   🔴 הבאג שזה מתקן, כפי שיועד דיווח אותו: **מחק משימות גינון בנייד,
   ובמחשב הן נשארו עד רענון ידני.** הסקר (וכעת הפעימה) מרעננים את
   המטען הראשי בלבד, וכל מסך שטוען לעצמו החזיק נתונים ישנים בלי
   שאף אחד יאמר לו שהתיישנו.

   ⚠️ הבדיקה החשובה כאן היא סעיף 1: **הצלבה מול ACTION_DOMAIN בשרת.**
   שם תחום שגוי ברישום אינו זורק שגיאה — המסך פשוט לא יתרענן, וזה
   בדיוק הכשל השקט שתיקנּו. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const SH  = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'sheets.js'), 'utf8');
const GS  = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

/* ---- שולפים את הרישום מתוך app.js האמיתי ---- */
const m = APP.match(/var SCREEN_DOMAINS = \{[\s\S]*?\n  \};/);
const SCREEN_DOMAINS = m ? vm.runInNewContext('(' + m[0].replace('var SCREEN_DOMAINS = ', '').replace(/;$/, '') + ')') : null;

/* ---- ושל השרת: כל הערכים ב-ACTION_DOMAIN ---- */
const dm = GS.match(/var ACTION_DOMAIN = \{[\s\S]*?\n\};/);
const serverDomains = new Set();
(dm ? dm[0].match(/: *'([a-zA-Z]+)'/g) || [] : []).forEach(s => serverDomains.add(s.replace(/: *'/, '').replace(/'/, '')));
(dm ? dm[0].match(/\['([a-zA-Z]+)', *'([a-zA-Z]+)'\]/g) || [] : []).forEach(s => {
  (s.match(/'([a-zA-Z]+)'/g) || []).forEach(q => serverDomains.add(q.replace(/'/g, '')));
});

section('1. 🔴 הצלבה מול השרת — שם תחום שגוי נכשל בשקט');
ok('הרישום נמצא ב-app.js', !!SCREEN_DOMAINS && Object.keys(SCREEN_DOMAINS).length > 10,
   SCREEN_DOMAINS ? String(Object.keys(SCREEN_DOMAINS).length) : 'לא נמצא');
ok('רשימת התחומים של השרת נשלפה', serverDomains.size >= 8, String(serverDomains.size));
const bad = [];
Object.keys(SCREEN_DOMAINS || {}).forEach(scr => {
  SCREEN_DOMAINS[scr].forEach(d => { if (!serverDomains.has(d)) bad.push(scr + '→' + d); });
});
ok('🔴🔴 כל תחום ברישום קיים ב-ACTION_DOMAIN', bad.length === 0, bad.join(', '));

section('2. המסכים שבהם הבאג התגלה');
['gardenTasks', 'gardenInbox', 'gardenPlan', 'resGarden'].forEach(s => {
  ok(s + ' רשום על garden',
     (SCREEN_DOMAINS[s] || []).indexOf('garden') !== -1, JSON.stringify(SCREEN_DOMAINS[s]));
});

section('3. שאר המסכים שטוענים לעצמם');
const expect = { clubAdmin: 'club', resReserve: 'club', residents: 'residents',
  servicesAdmin: 'services', resServices: 'services', gymAdmin: 'gym', resGym: 'gym',
  committeeAdmin: 'committee', appReports: 'appReports' };
Object.keys(expect).forEach(s => {
  ok(s + ' → ' + expect[s], (SCREEN_DOMAINS[s] || []).indexOf(expect[s]) !== -1,
     JSON.stringify(SCREEN_DOMAINS[s]));
});

section('4. 🔴 הצד של sheets.js — מדווח אילו תחומים זזו');
ok('יש domainsMovedList', /function domainsMovedList\(now\)/.test(SH));
/* 🔴 ההבחנה שמונעת מסך שלעולם לא מתרענן: null = "אין מידע", [] = "לא זז כלום". */
ok('🔴 null כשאין נקודת ייחוס (ולא מערך ריק)',
   /if \(!now \|\| typeof now !== "object" \|\| !lastDomains\) return null;/.test(SH));
ok('applyRev מדווח moved גם כשהמטען לא השתנה',
   (SH.match(/source: "unchanged", moved: moved/g) || []).length === 2,
   String((SH.match(/source: "unchanged", moved: moved/g) || []).length));
/* ⚠️ נגזר לפני שנקודת הייחוס נדרסת — אחרת הרשימה תמיד ריקה. */
ok('⚠️ ונגזר לפני שהוא נדרס במשיכה מלאה',
   /var movedNow = domainsMovedList\(payload\.domains\);[\s\S]{0,4000}lastDomains = \(payload\.domains/.test(SH));
ok('והמשיכה המלאה מדווחת אותו', /source: "fresh", hadCache: hadCache, moved: movedNow/.test(SH));

section('5. 🔴 הצד של app.js — מצייר מחדש כשהתחום זז');
ok('יש screenNeedsMovedDomain', /function screenNeedsMovedDomain\(screen, moved\)/.test(APP));
ok('🔴 ובמסלול "לא השתנה" הוא מצייר מחדש',
   /if \(screenNeedsMovedDomain\(currentScreen, moved\)\) \{[\s\S]{0,200}showScreen\(currentScreen, \{ silent: true \}\)/.test(APP));
/* ⚠️ גם כשהמטען נמשך אבל טביעת האצבע זהה — התחום עדיין יכול לזוז. */
ok('⚠️ וגם כשטביעת האצבע זהה', /\} else if \(screenNeedsMovedDomain\(currentScreen, moved\)\) \{/.test(APP));
ok('🔴 ולא מצייר בזמן הקלדה', (APP.match(/if \(userIsEditingMain\(\)\) pendingSilentRefresh = true;/g) || []).length === 2,
   String((APP.match(/if \(userIsEditingMain\(\)\) pendingSilentRefresh = true;/g) || []).length));

section('6. ⚠️ התנהגות הפונקציה');
const env = { SCREEN_DOMAINS };
const fnSrc = (APP.match(/function screenNeedsMovedDomain\(screen, moved\) \{[\s\S]*?\n  \}/) || [])[0];
vm.runInNewContext(fnSrc + ';this.f = screenNeedsMovedDomain;', env);
ok('gardenTasks + garden זז → כן', env.f('gardenTasks', ['garden']) === true);
ok('gardenTasks + רק budget זז → לא', env.f('gardenTasks', ['budget']) === false);
ok('⚠️ moved=null (אין מידע) → לא מצייר', env.f('gardenTasks', null) === false);
ok('⚠️ moved=[] → לא מצייר', env.f('gardenTasks', []) === false);
ok('⚠️ מסך שאינו ברישום → לא מצייר (בלי רגרסיה)', env.f('someNewScreen', ['garden']) === false);
ok('resHome ניזון מכמה תחומים', env.f('resHome', ['club']) === true && env.f('resHome', ['garden']) === true);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
