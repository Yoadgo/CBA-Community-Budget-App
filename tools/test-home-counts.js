
/* בדיקות לספירה בעמודה אחת בעמוד הבית (2026-09-16).
   הרצה:  node tools/test-home-counts.js

   מריץ את countStatus_ **האמיתי** מ-apps-script/Code.gs מול גיליון מדומה,
   ואת primeHomeExtras האמיתי מ-js/screens/home.js.

   🔴🔴 מה המארז שומר עליו:

     1. **שתי צורות, בלי תלות בסדר הדיפלוי.** לקוח חדש מול שרת ישן
        (ולהפך) חייב להמשיך להציג את אותו מספר. הכלל הזה קיים
        בפרויקט מהיום הראשון, והוא מה שמאפשר לדחוף ולפרסם בנפרד.

     2. **`pending: 0` הוא תשובה תקפה.** `res.pending || count(rows)`
        היה מפיל אפס אמיתי בחזרה לספירת שורות — ואז "אין ממתינות"
        היה מציג את המספר הישן מהמטמון.

     3. **הספירה זהה למה שהמסך סופר.** אם השרת יספור לפי הגדרה
        אחת והמסך לפי אחרת, נקבל "המספר בתגית לא מסכים עם המסך" —
        וזו בדיוק התקלה שהערת הקוד של צעד 07 מזהירה ממנה.

     4. **ולמה זה בכלל נעשה:** נמדד בייצור ב-16.9, אחרי הדלקת כל
        הדגלים — רצפת Apps Script ~1,970 אלפיות, ו-homeExtras 8,100.
        `gymList` לבדה ~1,850, ו-7.4KB של שורות מכון (כולל ת.ז.
        ותשובות שאלון בריאות) שנשלחו כדי לספור מהן מספר אחד. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS   = R('apps-script/Code.gs');
const HOME = R('js/screens/home.js');

/* ---------- gs: countStatus_ על גיליון מדומה ---------- */
function sheet(headers, rows) {
  return {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        if (r === 1) return [headers.slice(c - 1, c - 1 + nc)];
        return rows.slice(r - 2, r - 2 + nr).map(row => row.slice(c - 1, c - 1 + nc));
      }
    })
  };
}
const box = { String: String };
vm.createContext(box);
vm.runInContext(GS.match(/function countStatus_\(ss, sheetName, statusHeader, wanted\) \{[\s\S]*?\n\}/)[0], box);
const ssWith = sh => ({ getSheetByName: n => (n === 'S' ? sh : null) });

section('1. הספירה עצמה');
const H = ['מזהה', 'אימייל', 'סטטוס', 'טלפון'];
const rows = [
  ['1', 'a@x', 'ממתין', '05'],
  ['2', 'b@x', 'אושר', '05'],
  ['3', 'c@x', 'ממתין', '05'],
  ['4', 'd@x', ' ממתין ', '05'],   /* רווחים — trim */
  ['5', 'e@x', 'נדחה', '05']
];
ok('סופרת נכון', box.countStatus_(ssWith(sheet(H, rows)), 'S', 'סטטוס', 'ממתין') === 3,
   String(box.countStatus_(ssWith(sheet(H, rows)), 'S', 'סטטוס', 'ממתין')));
ok('⚠️ ורווחים מסביב לא מפילים ספירה', box.countStatus_(ssWith(sheet(H, [['4','d','  ממתין  ','']])), 'S', 'סטטוס', 'ממתין') === 1);
ok('סטטוס אחר ⇒ 0', box.countStatus_(ssWith(sheet(H, rows)), 'סטטוס', 'סטטוס', 'לא קיים') === 0);
ok('🔴 גיליון חסר ⇒ 0 ולא חריגה', box.countStatus_({ getSheetByName: () => null }, 'S', 'סטטוס', 'ממתין') === 0);
ok('🔴 עמודה חסרה ⇒ 0', box.countStatus_(ssWith(sheet(['מזהה','אימייל'], [['1','a']])), 'S', 'סטטוס', 'ממתין') === 0);
ok('⚠️ גיליון ריק (כותרות בלבד) ⇒ 0', box.countStatus_(ssWith(sheet(H, [])), 'S', 'סטטוס', 'ממתין') === 0);
/* 🔴 העיקר: קוראת עמודה אחת, לא getDataRange */
(function () {
  const reads = [];
  const sh = sheet(H, rows);
  const orig = sh.getRange;
  sh.getRange = (r, c, nr, nc) => { reads.push({ r, c, nr, nc }); return orig(r, c, nr, nc); };
  sh.getDataRange = () => { reads.push({ dataRange: true }); return { getValues: () => [H].concat(rows) }; };
  box.countStatus_(ssWith(sh), 'S', 'סטטוס', 'ממתין');
  ok('🔴🔴 קוראת **עמודה אחת** ולא את כל הגיליון',
     !reads.some(x => x.dataRange) && reads.filter(x => x.nc === 1).length === 1,
     JSON.stringify(reads));
})();

section('2. השרת — homeExtras מחזיר מספרים');
ok('🔴 signups/profile/gym מחזירים pending', /out\.signups = \{ ok: true, pending: countStatus_/.test(GS) &&
   /out\.profile = \{ ok: true, pending: countStatus_/.test(GS) &&
   /out\.gym = \{ ok: true, pending: countStatus_/.test(GS));
ok('🔴 ואינם מחזירים עוד את השורות המלאות',
   !/out\.signups = sub\(handleListSignups_\)/.test(GS) &&
   !/out\.gym  = sub\(handleGymList_\)/.test(GS));
/* 🔴 הסטטוס המבוקש חייב להיות אותו קבוע שהמסך משתמש בו. */
ok('🔴🔴 והמכון נספר לפי GYM_ST_VERIFY, לא לפי מחרוזת מקבילה',
   /countStatus_\(ss, GYM_SHEET, '[^']*', GYM_ST_VERIFY\)/.test(GS));
ok('⚠️ ו-GYM_ST_VERIFY הוא בדיוק מה שהמסך סופר',
   (GS.match(/var GYM_ST_VERIFY\s*=\s*'([^']*)'/) || [])[1] === 'ממתין לאימות',
   (GS.match(/var GYM_ST_VERIFY\s*=\s*'([^']*)'/) || [])[1]);
ok('⚠️ והמסכים המלאים ממשיכים להחזיר שורות כרגיל',
   /function handleGymList_/.test(GS) && /function handleListSignups_/.test(GS));

section('3. 🔴🔴 הלקוח — שתי הצורות, ואפס הוא אפס');
const src = HOME.match(/function primeHomeExtras\(done\) \{[\s\S]*?\n  \}/)[0];
function run(res) {
  const sb = { console: { log() {} }, lazyCache: { ts: 0, gardenTs: 0 }, resvCache: { ts: 0 },
               cacheFresh: () => false, resvFresh: () => false, gardenFresh: () => false,
               can: () => false, countPending: rows => (rows||[]).filter(r => String(r.status||r['סטטוס']||'').trim()==='ממתין').length,
               countGymPending: r => ((r&&(r.members||r.rows))||[]).filter(x=>String(x['סטטוס']||'').trim()==='ממתין לאימות').length,
               Date, CBA: { data: { getHomeExtras: cb => cb(res) } } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(src + '\nprimeHomeExtras(function(){});', sb);
  return sb.lazyCache;
}
const newShape = { ok: true, homeExtras: true,
  signups: { ok: true, pending: 3 }, profile: { ok: true, pending: 0 }, gym: { ok: true, pending: 2 } };
let c = run(newShape);
ok('הצורה החדשה נקראת', c.signups === 3 && c.gym === 2, JSON.stringify(c));
ok('🔴🔴 ו-pending: 0 נשמר כאפס ולא נופל חזרה לספירת שורות',
   c.profile === 0, String(c.profile));

const oldShape = { ok: true, homeExtras: true,
  signups: { ok: true, rows: [{ status: 'ממתין' }, { status: 'אושר' }] },
  profile: { ok: true, rows: [] },
  gym: { ok: true, members: [{ 'סטטוס': 'ממתין לאימות' }, { 'סטטוס': 'פעיל' }] } };
c = run(oldShape);
ok('🔴 והצורה הישנה עדיין עובדת — אין תלות בסדר הדיפלוי',
   c.signups === 1 && c.gym === 1 && c.profile === 0, JSON.stringify(c));
ok('⚠️ ושתי הצורות מגיעות לאותו מספר על אותם נתונים',
   run({ ok:true, homeExtras:true, signups:{ ok:true, pending:1 } }).signups ===
   run({ ok:true, homeExtras:true, signups:{ ok:true, rows:[{status:'ממתין'},{status:'אושר'}] } }).signups);

section('4. 🔴 שריון המועדון — 187 ימים של יומן בשביל מספר אחד');
const APP = R('js/app.js');
ok('יש מונה ייעודי', /function clubPendingCount_\(\)/.test(GS));
ok('🔴 ו-homeExtras מחזיר ממנו מספר, לא רשימה',
   /out\.club = \{ ok: true, pending: clubPendingCount_\(\) \}/.test(GS) &&
   !/out\.club = sub\(handleClubList_\)/.test(GS));
/* 🔴🔴 נקודת גזירה אחת: אירוע בלי תגית = מאושר. שתי הגדרות מקבילות
   הן בדיוק "המספר בתגית לא מסכים עם המסך". */
ok('🔴🔴 והסטטוס נגזר בנקודה אחת', /function clubStatusOf_\(ev\)/.test(GS) &&
   (GS.match(/clubStatusOf_\(/g) || []).length === 3,
   String((GS.match(/clubStatusOf_\(/g) || []).length));
ok('⚠️ והרשימה המלאה משתמשת באותה פונקציה', /status: clubStatusOf_\(ev\)/.test(GS));
ok("⚠️ ואירוע בלי תגית נחשב מאושר, כמו קודם", /ev\.getTag\('status'\) \|\| 'approved'/.test(GS));
ok('⚠️ ואותו חלון זמן כמו ברשימה המלאה — ממתין מלפני יומיים עדיין נספר',
   /clubPendingCount_[\s\S]{0,400}7 \* 24 \* 3600 \* 1000[\s\S]{0,120}180 \* 24 \* 3600 \* 1000/.test(GS));
ok('🔴 והרשימה המלאה נשארת למסך הניהול שבאמת מציג אותה',
   /function handleClubList_\(p\)/.test(GS) && /reservations: list/.test(GS));

/* הלקוח — seedClubAlerts קורא את שתי הצורות */
(function () {
  const src = APP.match(/window\.CBA\.seedClubAlerts = function \(res\) \{[\s\S]*?\n  \};/)[0];
  function run(res) {
    const sb = { notif: {}, inited: false, renderNav(){}, renderControls(){}, console:{log(){}} };
    sb.window = sb; sb.CBA = {};
    vm.createContext(sb);
    vm.runInContext(src + '\nwindow.CBA.seedClubAlerts(' + JSON.stringify(res) + ');', sb);
    return sb.notif.pendingClub;
  }
  ok('הצורה החדשה נקראת', run({ ok:true, pending:4 }) === 4, String(run({ ok:true, pending:4 })));
  ok('🔴🔴 ואפס ממתינים נשמר כאפס', run({ ok:true, pending:0 }) === 0, String(run({ ok:true, pending:0 })));
  ok('🔴 והצורה הישנה עדיין עובדת',
     run({ ok:true, reservations:[{status:'pending'},{status:'approved'},{status:'pending'}] }) === 2);
})();

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
