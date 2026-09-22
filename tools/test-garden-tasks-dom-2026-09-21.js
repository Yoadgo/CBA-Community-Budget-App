/* מסך המשימות — ציור אמיתי מול DOM (2026-09-21).
   הבדיקות האחרות קוראות את הקוד כטקסט; זו מריצה אותו. היא נוצרה כי כל
   השינוי כאן הוא **מבנה של HTML**, וטקסט אינו יכול להעיד שהמבנה נבנה. */
const fs = require('fs'); const path = require('path');
const { JSDOM } = require('jsdom');
const APP = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0,400) : '')));
const section = t => console.log('\n' + t);
const dom = new JSDOM('<!doctype html><html dir="rtl"><body><div id="app"></div></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document; global.navigator = window.navigator;

function monday(shift) {
  const d = new Date(); d.setHours(12,0,0,0); d.setDate(d.getDate() - d.getDay() + (shift||0)*7);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
const NOW = monday(0), NEXT = monday(1), PREV = monday(-1);

const ROWS = [
  { id:'1', kind:'דיווח תושב', repId:'21', title:'רטיבות ליד השביל', category:'השקיה', week:'' },
  { id:'2', kind:'שגרה', title:'כיסוח מדשאות', category:'מדשאות', week:'' },
  { id:'3', kind:'דיווח תושב', repId:'22', title:'ענף שבור', category:'עצים', week:NOW, area:'צפון' },
  { id:'4', kind:'שגרה', title:'גיזום שיחים', category:'שיחים', week:NOW, area:'צפון' },
  { id:'5', kind:'שגרה', title:'ניקיון גזם', category:'ניקיון', week:NEXT, area:'דרום' },
  { id:'6', kind:'דיווח תושב', repId:'19', title:'ממטרה דולפת', category:'השקיה', week:PREV,
    area:'דרום', closure:'בוצע', approvedAt:new Date().toISOString(), approvedBy:'דין' }
];

window.CBA = { esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) };
window.CBA.ui = { emptyState: o => '<div class="gd-none">'+o.title+'</div>', toast(){} };
window.CBA.data = {
  getGardenTasks: (q, cb) => cb({ ok:true, rows:ROWS, isManager:true, week:NOW,
    areas:['צפון','דרום'], categories:['השקיה','עצים','מדשאות','שיחים','ניקיון'] })
};
window.CBA.user = { isExternal:false };
const run = f => window.eval(fs.readFileSync(path.join(APP, f), 'utf8'));
run('js/data/gardenLang.js');
run('js/screens/gardenTasks.js');

const host = document.getElementById('app');
window.CBA.screens.gardenTasks.render(host, 'open');
const H = () => host.innerHTML;

section('1. הכרטיס "ממתין להחלטה" בראש העמוד');
const sec = host.querySelector('section.gt-decide');
ok('הוא נבנה בפועל', !!sec, H().slice(0,300));
ok('🔴 והוא האלמנט הראשון אחרי שורת הבקרה',
   !!sec && sec.previousElementSibling && sec.previousElementSibling.classList.contains('gt-ctl'));
ok('כותרתו "ממתין להחלטה"', !!sec && /ממתין להחלטה/.test(sec.textContent));
const inDecide = sec ? [].map.call(sec.querySelectorAll('.gt-row'), r => r.dataset.id) : [];
ok('🔑 בתוכו בדיוק שתי המשימות שאין להן שבוע', inDecide.join(',') === '1,2', inDecide.join(','));
ok('🔴 ודיווח התושב ראשון', inDecide[0] === '1', inDecide.join(','));

section('2. דיווח ששובץ ירד לעבודת השבוע');
const all = [].map.call(host.querySelectorAll('.gt-row'), r => r.dataset.id);
ok('⚠️ #3 (דיווח תושב, שובץ לשבוע) אינו בכרטיס ההחלטות', inDecide.indexOf('3') === -1);
const r3 = host.querySelector('.gt-row[data-id="3"]');
ok('והוא מצויר במסך', !!r3);
ok('🔴 הוא יושב מתחת לכותרת האזור "צפון"',
   !!r3 && /צפון/.test(r3.closest('.gd-reps').previousElementSibling.textContent));
ok('⚠️ ועדיין מסומן כדיווח תושב', !!r3 && r3.classList.contains('is-report'));
ok('⚠️ ומשימת שגרה באותו אזור אינה מסומנת',
   !host.querySelector('.gt-row[data-id="4"]').classList.contains('is-report'));
ok('🔑 והדיווח מופיע לפני השגרה באותו אזור',
   all.indexOf('3') < all.indexOf('4'), all.join(','));

section('3. 🔴 רק השבוע שצופים בו (22.9 — "בהמשך" הוסר)');
ok('#5 (שבוע הבא) אינו מוצג בשבוע הנוכחי', all.indexOf('5') === -1, all.join(','));
ok('⚠️ ואין להקת "בהמשך"', !/בהמשך/.test(host.textContent));
ok('⚠️ והסגורה (#6) אינה מוצגת במסנן "פתוחות"', all.indexOf('6') === -1, all.join(','));

section('4. מסנן "תקלות דיירים"');
const chip = host.querySelector('[data-f="faults"]');
ok('🔴 השבב קיים', !!chip);
ok('🔑 והמונה סופר את כל שלושת הדיווחים — כולל הסגור',
   !!chip && /3/.test(chip.querySelector('b').textContent), chip && chip.textContent);
chip.dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
const f = [].map.call(host.querySelectorAll('.gt-row'), r => r.dataset.id);
ok('🔴 מציג את שלושת הדיווחים ורק אותם', f.slice().sort().join(',') === '1,3,6', f.join(','));
ok('⚠️ ואף משימת שגרה אינה נכנסת', f.indexOf('2') === -1 && f.indexOf('4') === -1, f.join(','));
ok('🔑 בסדר: ממתינה · משובצת · טופלה', f.join(',') === '1,3,6', f.join(','));
const txt = host.textContent;
ok('ושלוש הכותרות נכתבות', /ממתינות לשיבוץ/.test(txt) && /משובצות/.test(txt) && /טופלו/.test(txt));

section('5. חזרה ל"פתוחות" — אין מצב תקוע');
host.querySelector('[data-f="open"]').dispatchEvent(new window.MouseEvent('click', { bubbles:true }));
ok('הכרטיס חוזר', !!host.querySelector('section.gt-decide'));
ok('⚠️ ובלי כפילות', host.querySelectorAll('section.gt-decide').length === 1);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
