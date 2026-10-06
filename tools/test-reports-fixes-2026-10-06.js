/* בדיקות לתיקוני הדיווחים 6.10.26 — #36 (תושבים מקישור), #25 (שמות במפה),
   #35 (מונה תקלות), #38 (חתימה), ואריח הדיווח בתפריט המשתמש.
   ⚠️ בדיקות מבנה: מה שיכול להישבר בשקט הוא **שער** שחוזר להיות שער כתיבה,
   או כתיבה שעוברת בטעות לשער הקריאה. את ההתנהגות בדפדפן בדקתי חי (ר' המסמך
   claude/reports-triage-2026-10-04.md בפרויקט). */
const fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (info ? '  → ' + info : '')); } }
function body(src, fn) {
  const i = src.indexOf('function ' + fn + '(');
  if (i < 0) return '';
  const j = src.indexOf('\n  function ', i + 10);
  return src.slice(i, j < 0 ? i + 3000 : j);
}

const DS = R('js/data/dataService.js');
console.log('1. שער קריאה מול שער כתיבה (#36, #25)');
ok('readConnected קיים ולא בודק _partial', /function readConnected\(\)[\s\S]{0,200}_source === "sheets";\s*\n\s*\}/.test(DS) &&
   !/function readConnected\(\)[^}]*_partial/.test(DS));
const READS = 'getResidents getGymResidentPicker getRsvpFamilyNames getResidentDirectory getMyClubReservations getGymMy getGymList getGymForm getFlags getEventsList getCommunityDirectory getCommitteeTree getCommitteeCategories getClubMonth getClubList getClubBusy'.split(' ');
READS.forEach(f => {
  const b = body(DS, f);
  ok(f + ' — שער קריאה', b && /readConnected\(\)/.test(b) && !/pushConnected\(\)/.test(b));
});
const WRITES = 'reserveClub cancelClubReservation approveClubReservation addTransaction updateTransaction deleteTransaction setFlag submitGymApplication saveCommitteeTree'.split(' ');
WRITES.forEach(f => {
  const b = body(DS, f);
  if (!b) return;
  ok('🔴 ' + f + ' — נשאר על שער הכתיבה', !/readConnected\(\)/.test(b));
});

console.log('2. מסך תושבים — ניסיון חוזר אוטומטי אחד (#36)');
const RS = R('js/screens/residents.js');
ok('ציור שקט אחרי כישלון → resLoad פעם אחת', /!isNav && st\.error && st\.loaded && !st\.loading && !st\.errAutoRetry/.test(RS));
ok('🔴 והדגל מונע לולאה', /st\.errAutoRetry = true;/.test(RS));
ok('הצלחה מאפסת את הדגל', /resState\.errAutoRetry = false;/.test(RS));

console.log('3. מפה — שמות בזום הרגיל (#25)');
const RJ = R('js/screens/resident.js'), RC = R('css/resident.css');
ok('המפה מנסה שוב לטעון את המדריך (עד 3)', /dirRetries < 3/.test(RJ));
ok('--fam-k נמדד לכל בית', /el\.style\.setProperty\("--fam-k", famFitK\(famEl\)/.test(RJ));
ok('--tw/--th נקבעים בבנייה', /setProperty\("--tw"/.test(RJ) && /setProperty\("--th"/.test(RJ));
ok('--sc נקבע ב-apply', /setProperty\('--sc', scale/.test(RJ));
ok('fam-s מתחת ל-tier2', /classList\.toggle\("fam-s", tier < 2\)/.test(RJ));
ok('CSS: גופן = min(תקרה, רוחב×k, גובה×0.34)', /\.map-world\.fam-s \.mh-fam[\s\S]{0,300}min\(var\(--mh-fs2/.test(RC));
ok('CSS: הילדים לא מוצגים בדרגה הקטנה', /\.map-world\.fam-s \.mh-kids \{ display: none; \}/.test(RC));

console.log('4. מונה תקלות (#35)');
const GT = R('js/screens/gardenTasks.js');
ok('סופר רק פתוחות', /if \(t\.kind === GK_REPORT && !t\.closure\) c\.faults\+\+;/.test(GT));

console.log('5. חתימה במכון (#38)');
const GY = R('js/screens/resGym.js'), GC = R('css/gym.css');
ok('מדידה מחדש בכל נגיעה', /function start\(x, y, how\) \{\s*\n\s*if \(!fit\(\)\)/.test(GY));
ok('נקודה בהקשה', /ctx\.arc\(p\.x, p\.y/.test(GY));
ok('גיבוי touch עם passive:false', /"touchstart"[\s\S]{0,300}\{ passive: false \}/.test(GY));
ok('pointercancel ממשיך במגע ולא חותך את הקו', /pointercancel[\s\S]{0,200}mode = "touch"/.test(GY));
ok('אישור "החתימה נקלטה"', /data-gym-sig-ok hidden>✓ החתימה נקלטה/.test(GY) && /\.gym-sig__ok\[hidden\]/.test(GC));
ok('ניקוי עובר דרך __sigClear', /c\.__sigClear\(\)/.test(GY));
ok('רישום לשובל הדיווח', /CBA\.diag\.log\("חתימה: "/.test(GY));

console.log('6. אריח הדיווח בתפריט המשתמש');
const RP = R('js/ui/report.js');
ok('openMenu נדחה לסוף הלחיצה', /function openMenu\(\)[\s\S]{0,900}setTimeout\(function \(\) \{ if \(wrapEl\.__openMenu\) wrapEl\.__openMenu\(\); \}, 0\)/.test(RP));

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
