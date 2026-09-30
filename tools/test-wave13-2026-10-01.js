/* גל 13 (1.10.2026) — זרימות מהירות למנהל: BUA1, WWA1, SMA1, ARA1, GTA1.
   (EXA1/RSA1/RSA2 — אחרי אישור סקיצה. GXA1 — כבר קיים, ר' הבדיקה למטה.) */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const section = t => console.log('\n' + t);

section('BUA1 — "+ הוצאה לסעיף" במגירת התקציב');
{
  const B = R('js/screens/budget.js');
  ok('כפתור במגירה', /data-bud-addtx>\+ הוספת הוצאה לסעיף הזה<\/button>/.test(B));
  ok('לא במגירת "ללא סעיף"', /const canAddHere = catId !== BUDGET_NOCAT/.test(B));
  ok('אותו טופס בדיוק, עם הסעיף', /CBA\.screens\.expenses\.openAddForCategory\(id\);/.test(B));
  ok('המגירה נסגרת לפני', /closeDrawer\(\);\s*CBA\.screens\.expenses\.openAddForCategory\(id\)/.test(B));
}

section('GXA1 — אריחי נתוני הגינון (קיים)');
{
  const G = R('js/screens/gardenStats.js');
  ok('לחיצה על אריח פותחת את הרשימה המסוננת שלו', /if \(\(b = e\.target\.closest\("\[data-list\]"\)\)\) \{\s*openList\(lists\(b\.dataset\.list/.test(G));
  ok('ומכל שורה — פתיחת המשימה לפעולה', /if \(\(b = e\.target\.closest\("\[data-open\]"\)\)\) \{ hidePop\(\); openCard/.test(G));
}

section('WWA1 — "שחרור העמדה" אחרי 30 דק׳');
{
  const W = R('js/screens/weworkAdmin.js');
  ok('תנאי: פעיל, לא נכנס, עכשיו, עברו 30 דק׳', /var late = active && !b\.enteredAtMs && ph === "now" && b\.date === D\(\)\.today\(\) && D\(\)\.nowMin\(\) >= b\.from \* 60 \+ 30;/.test(W));
  ok('כפתור "שחרור העמדה" במקום "ביטול"', /data-wa-late="1">שחרור העמדה<\/button>/.test(W));
  ok('חלון אישור עם הסבר, ואדום', /לא נכנס\/ה בחצי השעה הראשונה/.test(W) && /title: late \? "שחרור עמדה"/.test(W));
  ok('אותה פעולה בשרת (ביטול ע"י מנהל + מייל)', /D\(\)\.cancel\(id, function \(res\)/.test(W));
}

section('SMA1 — תור "לא מעודכן" מעל הרשימה');
{
  const S = R('js/screens/servicesAdmin.js');
  ok('רצועה מעל הרשימה (בשני מצבי הראש)', (S.match(/<div id="sadm-staleq"><\/div><div id="sadm-body"><\/div>/g) || []).length === 2);
  ok('רק פתוחים; אין — אין רצועה', /r\.status !== "done"/.test(S) && /if \(!open\.length\) \{ host\.innerHTML = ""; return; \}/.test(S));
  ok('עד 3 כרטיסים, בלי כפילות', /!seen\[r\.cardId\] && top\.length < 3/.test(S));
  ok('קפיצה ישירה לכרטיס', /CBA\.screens\.resRecommendations\.openCard\(c\.getAttribute\("data-sq-card"\)\)/.test(S));
  const RR = R('js/screens/resRecommendations.js');
  ok('מסך ההמלצות פותח את המגירה אחרי הטעינה', /if \(rrPendingOpen\) \{ var pid = rrPendingOpen; rrPendingOpen = null; rrOpenDrawer\(pid\); \}/.test(RR));
}

section('ARA1 — תשובות מוכנות');
{
  const A = R('js/screens/appReports.js');
  ok('ארבע תשובות מוכנות', (A.match(/\{ t: "[^"]+", done: (true|false) \}/g) || []).length === 4);
  ok('לחיצה ממלאת את השדה (לעריכה), לא שולחת', /ta\.value = x\.t; ta\.focus\(\);/.test(A));
  ok('🔴 שדה ריק לא נשלח', /if \(!t\) \{ ta\.focus\(\); return; \}/.test(A));
  ok('"תוקן" מסמן גם כטופל — בקריאה אחת', /CBA\.data\.setAppReportState\(row, out\.done, out\.t,/.test(A));
}

section('GTA1 — "בוצע" בהחלקה');
{
  const T = R('js/screens/gardenTasks.js');
  ok('רק מי שהתפריט שלו מציע "בוצע"', /return !!t && tileList\(t\)\.some\(function \(x\) \{ return x\[0\] === "markdone"; \}\);/.test(T));
  ok('אותה פעולה בדיוק (markDone)', /if \(go\) markDone\(id\);/.test(T));
  ok('תנועה אנכית = גלילה', /if \(axis === "y"\) \{ row = null; return; \}/.test(T));
  ok('סף 90px', /TH = 90/.test(T));
  ok('נרשם פעם אחת', /root\.addEventListener\("click", onCardClick\); wireSwipe\(\); cardsWired = true;/.test(T));
  ok('לא מתחיל על כפתור/קוביות', /e\.target\.closest\("button, a, input, \.gt-tiles"\)/.test(T));
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
