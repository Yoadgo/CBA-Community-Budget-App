
/* בדיקות ל"למה tour עולה 3.4 שניות" (2026-09-16, פעולה 2).
   הרצה:  node tools/test-tour-cost.js

   מריץ את tourSeenFor_ ו-tourRowsCached_ **האמיתיים** מ-apps-script/Code.gs
   מול גיליון מדומה שסופר נסיעות.

   🔴🔴 מה המארז שומר עליו:

     1. **לא קוראים את טאב התושבים פעמיים באותה בקשה.** authorize_
        כבר קרא אותו בתחילת הבקשה, ומספר השורה נוסע מאז יחד עם
        ההרשאות. זו הייתה הנסיעה היקרה מבין הארבע.

     2. **צעדי הסיור מגיעים מ-cached_**, כלומר מאותו מנגנון כמו
        התקציב — 90 שניות. עריכה בגיליון מופיעה מעצמה, בלי שום
        פעולה ידנית ובלי דיפלוי.

     3. **הסינון לפי קהל נשאר בשרת.** מה שמתמטמן הוא הטבלה
        הגולמית. צעד שמיועד למנהלים לא יוצא מהשרת למי שאינו מנהל —
        אם זה יישבר, נתוני ניהול ידלפו לתושב רגיל.

     4. ⚠️ **ומספר העמודה במכוון לא ממוטמן.** עמודה שנוספת לטאב
        שכבר בייצור מזיזה את המספר, והקוד היה קורא תא אחר לגמרי —
        בלי שום שגיאה, רק מספר לא נכון. זו מלכודת מוכרת בפרויקט
        הזה, ולכן היא נבדקת כאן במפורש. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const grab = re => { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };

/* ---------- ארגז חול ל-tourSeenFor_ ---------- */
function sandbox(opts) {
  opts = opts || {};
  const log = { lookups: 0, headerReads: 0, cellReads: 0 };
  const sheet = {
    getRange: (r, c) => ({ getValue: () => { log.cellReads++; return r === 5 && c === 12 ? '3' : ''; } })
  };
  const box = {
    String, parseInt, isNaN, JSON,
    TOUR_SHEET: 'סיור היכרות',
    ensureTourSeenCol_: () => { log.headerReads++; return opts.noCol ? -1 : 12; },
    lookupResident_: () => { log.lookups++; return opts.missing ? { found: false } : { found: true, rowIndex: 5 }; },
    readTable_: () => { log.tableReads = (log.tableReads || 0) + 1; return [{ 'מזהה': 'welcome' }]; },
    cached_: (key, build) => { log.cacheKeys = (log.cacheKeys || []).concat(key); return build(); }
  };
  vm.createContext(box);
  vm.runInContext([
    grab(/function tourRowsCached_\(ss\) \{[\s\S]*?\n\}/),
    grab(/function tourSeenFor_\(ss, email, rowIndex\) \{[\s\S]*?\n\}/)
  ].join('\n\n'), box);
  return { box, log, ss: { getSheetByName: () => sheet } };
}

section('1. 🔴 טאב התושבים לא נקרא פעם שנייה');
{
  const s = sandbox();
  const seen = s.box.tourSeenFor_(s.ss, 'me@x', 5);
  ok('מחזירה את המספר מהתא הנכון', seen === 3, String(seen));
  ok('🔴🔴 ולא קראה את כל טאב התושבים שוב', s.log.lookups === 0, String(s.log.lookups));
  ok('נסיעה אחת לתא, לא יותר', s.log.cellReads === 1, String(s.log.cellReads));
}

section('2. 🔴 נפילה לאחור — בלי מספר שורה, כמו קודם בדיוק');
{
  const s = sandbox();
  ok('קוראת ל-lookupResident_ רק כשאין מספר שורה',
     s.box.tourSeenFor_(s.ss, 'me@x') === 3 && s.log.lookups === 1, String(s.log.lookups));
  const s2 = sandbox();
  ok('⚠️ ומספר שורה לא תקין נחשב כאילו אין', s2.box.tourSeenFor_(s2.ss, 'me@x', 'לא-מספר') === 3 &&
     s2.log.lookups === 1);
  const s3 = sandbox({ missing: true });
  ok('משתמש שאינו ברשימה ⇒ 0', s3.box.tourSeenFor_(s3.ss, 'x@x') === 0);
  const s4 = sandbox({ noCol: true });
  ok('אין עמודה ⇒ 0, ובלי לגעת בתא', s4.box.tourSeenFor_(s4.ss, 'x@x', 5) === 0 && s4.log.cellReads === 0);
}

section('3. ⚠️ ומספר העמודה במכוון לא ממוטמן');
{
  const s = sandbox();
  s.box.tourSeenFor_(s.ss, 'me@x', 5);
  ok('🔴 נקרא חי בכל בקשה', s.log.headerReads === 1, String(s.log.headerReads));
  ok('🔴🔴 ואין מפתח מטמון למספר העמודה', !/cba_tour_seen_col/.test(GS));
}

section('4. צעדי הסיור — מ-cached_, לא מהגיליון בכל קריאה');
{
  const s = sandbox();
  s.box.tourRowsCached_(s.ss);
  ok('עוברת דרך cached_', (s.log.cacheKeys || []).indexOf('cba_tour_rows') !== -1,
     JSON.stringify(s.log.cacheKeys));
  ok('⚠️ ומטמון הפרויקט הוא 90 שניות — עריכה בגיליון מתעדכנת מעצמה',
     /var CACHE_TTL_SEC = 90;/.test(GS));
}

section('5. handleTour_ — מה באמת השתנה שם');
{
  const ht = grab(/function handleTour_\(p\) \{[\s\S]*?\n\}\n/);
  ok('🔴 קוראת את הטבלה הממוטמנת', /tourRowsCached_\(ss\)/.test(ht));
  ok('ולא readTable_ ישירות', !/readTable_\(ss, TOUR_SHEET\)/.test(ht));
  ok('🔴🔴 והסינון לפי קהל רץ **אחרי** המטמון, בשרת',
     /tourRowsCached_\(ss\)\.filter\(function \(r\) \{/.test(ht));
  ok('⚠️ וצעד "מנהלים" עדיין לא יוצא לתושב רגיל',
     /aud === 'מנהלים' && !isAdmin\) return false/.test(ht));
  ok('⚠️ וקהל שהוא שם הרשאה עדיין נבדק מול ההרשאות של הקורא',
     /ALL_PERMS\.indexOf\(aud\)/.test(ht));
  ok('🔴 ומספר השורה מועבר מההרשאות', /tourSeenFor_\(ss, gate\.email, gate\.perm && gate\.perm\.rowIndex\)/.test(ht));
}

section('6. permissionsFor_ נושא את מספר השורה');
{
  const pf = grab(/function permissionsFor_\(email\) \{[\s\S]*?\n\}/);
  ok('🔴 מחזירה rowIndex', /rowIndex: r\.rowIndex/.test(pf));
  ok('⚠️ ועדיין ממוטמנת לכל הבקשה (PERMS_MEMO_)', /PERMS_MEMO_\[memoKey\] = out/.test(pf));
  ok('⚠️ ו-lookupResident_ עצמה **לא** ממוטמנה — כתיבה באותה בקשה חייבת להיקרא טרייה',
     !/RESIDENT_MEMO_/.test(GS));
}

section('7. ⚠️ הכתיבה של "סיור נצפה" לא נגעה במטמון');
ok('markTourSeen קורא את מספר העמודה חי', /var col = ensureTourSeenCol_\(ss\);\n  if \(col === -1\) return \{ ok: false/.test(GS));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
