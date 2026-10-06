/* פאצ' גינון אוקטובר (6.10.26) — GP-6.10
   הרצה:  node tools/test-garden-patch-2026-10-06.js

   מה נבדק (ומה יכול להישבר בשקט):
   1. המנוע — "פתוחות עכשיו" לשגרה לא סופרת את כל 8 שבועות האופק; "טופלו"
      לפי שבוע הסגירה; "נסגרו" לא סופר "אוחד"; פיצול האישורים; מזהים לכל שבוע.
   2. מסך המשימות (DOM אמיתי) — "תקלות" רק פתוחות, כולל תקלת צוות;
      "סגורות" לפי שבוע הסגירה עם מספר, ולא לפי שבוע התכנון.
   3. מפות הגינון — רק מתחמי גזם (binKinds) בכל קריאות המפה.
   4. מסך נתוני הגינון (DOM אמיתי) — שלוש השורות, 4 לשוניות, בחירת שבוע,
      מעבר מאריח לגרף, ומצב טלפון. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const APP = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(APP, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')));
const section = t => console.log('\n' + t);

/* ===================================================================== 1 */
section('1. המנוע — gardenStatsCalc');
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(R('js/data/gardenLang.js'), ctx);
vm.runInContext(R('js/data/gardenStatsCalc.js'), ctx);
const C = ctx.window.CBA.gardenStatsCalc;
const NOW = new Date(2026, 9, 6, 10, 0, 0);            // שלישי 6.10.26
const CUR = '2026-10-04', PREV = '2026-09-27', NEXT = '2026-10-11';
const d = (m, dd, h) => new Date(2026, m - 1, dd, h || 9, 0, 0);
const REP = 'דיווח תושב', ROU = 'שגרה';
const T = [
  { id: 'R1', kind: ROU, week: CUR, firstWeek: CUR },                                  // פתוחה השבוע
  { id: 'R2', kind: ROU, week: PREV, firstWeek: PREV },                                // פתוחה, מאחרת
  { id: 'R3', kind: ROU, week: NEXT, firstWeek: NEXT },                                // אופק — לא נספרת
  { id: 'R4', kind: ROU, week: PREV, firstWeek: PREV, closure: 'בוצע', approvedAt: d(9, 29) },
  { id: 'R5', kind: ROU, week: PREV, firstWeek: PREV, closure: 'בוצע', approvedAt: d(10, 5) }, // נסגרה השבוע
  { id: 'R6', kind: ROU, week: PREV, firstWeek: PREV, closure: 'בוטל', approvedAt: d(9, 30) },
  { id: 'I1', kind: 'יזום', week: CUR },                                               // יזומה = שגרה בפיצול
  { id: 'R7', kind: ROU, week: CUR, flag: 'ממתין לאישור', updatedAt: d(10, 5) },        // שגרה לאישור
  { id: 'F1', kind: REP, repId: '1', week: '', createdAt: d(10, 4) },
  { id: 'F2', kind: REP, repId: '', openedBy: 'גנן', week: CUR, createdAt: d(10, 1) },
  { id: 'F3', kind: REP, repId: '3', week: PREV, closure: 'בוצע', approvedAt: d(9, 30), createdAt: d(9, 28) },
  { id: 'F4', kind: REP, repId: '4', week: PREV, closure: 'אוחד', approvedAt: d(9, 30), createdAt: d(9, 28) },
  { id: 'F5', kind: REP, repId: '5', week: PREV, closure: 'לא רלוונטי', approvedAt: d(10, 5), createdAt: d(9, 28) },
  { id: 'F6', kind: REP, repId: '6', week: CUR, flag: 'ממתין לאישור', updatedAt: d(10, 5), createdAt: d(10, 2) }
];
const M = C.compute(T, [], { weeks: 8, now: NOW, categories: [], requireApproval: true });
const OR = M.now.openRoutine;
ok('🔴 שגרה פתוחה = רק השבוע ושבועות שעברו (לא האופק)', OR.count === 4 && OR.ids.indexOf('R3') === -1, OR);
ok('השבוע 3 (R1, I1, R7) · מאחרות 1 (R2)', OR.thisWeek === 3 && OR.late === 1, OR);
ok('תקלות פתוחות = 3 (F1, F2, F6)', M.now.open.count === 3, M.now.open);
const last = M.trends.doneR.length - 1;
ok('🔴 "טופלו" לפי שבוע הסגירה: R5 תוכנן לשבוע שעבר ונסגר השבוע → השבוע', M.trends.doneR[last] === 1, M.trends.doneR);
ok('והשבוע שעבר: R4 בלבד (בוטל לא נספר)', M.trends.doneR[last - 1] === 1, M.trends.doneR);
ok('תקלות שבוצעו בשבוע שעבר: F3', M.trends.doneF[last - 1] === 1, M.trends.doneF);
ok('🔴 "נסגרו" (תקלות) לא סופר "אוחד", כן סופר סגירה בסיבה', M.trends.closedF[last - 1] === 1 && M.trends.closedF[last] === 1, M.trends.closedF);
ok('מזהים לשבוע — לכפתור "לרשימה"', M.trends.ids.done[last].join() === 'R5' && M.trends.ids.closedF[last].join() === 'F5', M.trends.ids);
ok('פיצול האישורים: 1 שגרה · 1 תקלה', M.now.approval.routine === 1 && M.now.approval.faults === 1, M.now.approval);
ok('שני מתגים כבויים → אין אריח', C.compute(T, [], { now: NOW, requireApproval: false, requireApprovalRoutine: false }).now.approval.on === false);
ok('מתג השגרה דלוק כברירת מחדל', C.compute(T, [], { now: NOW, requireApproval: false }).now.approval.on === true);
ok('מי פתח: F1 תושב השבוע · F2 גנן בשבוע שעבר', M.trends.src[last].res === 1 && M.trends.src[last - 1].gard === 1, M.trends.src);

/* ===================================================================== 2 */
section('2. מסך המשימות — "תקלות" ו"סגורות"');
function sunday(shift) {
  const x = new Date(); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() - x.getDay() + (shift || 0) * 7);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}
const W0 = sunday(0), W1 = sunday(-1), W3 = sunday(-3);
const at = (wShift, day) => { const x = new Date(); x.setHours(10, 0, 0, 0); x.setDate(x.getDate() - x.getDay() + wShift * 7 + day); return x.toISOString(); };
const ROWS = [
  { id: '1', kind: REP, repId: '21', title: 'רטיבות', category: 'השקיה', week: '' },
  { id: '2', kind: REP, repId: '', openedBy: 'גנן', title: 'ענף (צוות)', category: 'עצים', week: W0, area: 'צפון' },
  { id: '3', kind: ROU, title: 'כיסוח', category: 'מדשאות', week: W0, area: 'צפון' },
  { id: '4', kind: REP, repId: '19', title: 'ממטרה', category: 'השקיה', week: W3, closure: 'בוצע', approvedAt: at(0, 0) },
  { id: '5', kind: ROU, title: 'גיזום', category: 'שיחים', week: W1, closure: 'בוצע', approvedAt: at(-1, 2) },
  { id: '6', kind: ROU, title: 'ניקיון', category: 'ניקיון', week: W1, closure: 'בוצע', approvedAt: at(-1, 3) },
  { id: '7', kind: ROU, title: 'מופע שבוטל', category: 'ניקיון', week: W1, closure: 'בוטל', approvedAt: at(-1, 3) },
  { id: '8', kind: ROU, title: 'ישנה', category: 'ניקיון', week: W3, closure: 'בוצע', approvedAt: at(-3, 1) },
  { id: '9', kind: ROU, title: 'עתיקה', category: 'ניקיון', week: sunday(-5), closure: 'בוצע', approvedAt: at(-5, 1) }
];
const dom = new JSDOM('<!doctype html><html dir="rtl"><body><div id="app"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.CBA = { esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) };
window.CBA.ui = { emptyState: o => '<div class="gd-none">' + o.title + '</div>', toast() {} };
window.CBA.data = { getGardenTasks: (q, cb) => cb({ ok: true, rows: ROWS, isManager: true, week: W0, areas: ['צפון'], categories: ['השקיה', 'עצים'] }) };
window.CBA.user = { isExternal: false };
window.eval(R('js/data/gardenLang.js'));
window.eval(R('js/screens/gardenTasks.js'));
const host = window.document.getElementById('app');
window.CBA.screens.gardenTasks.render(host, 'open');
const chip = k => host.querySelector('[data-f="' + k + '"]');
ok('מונה "תקלות" = 2 (כולל תקלת צוות, בלי סגורה)', /2/.test(chip('faults').querySelector('b').textContent), chip('faults').textContent);
chip('faults').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
let ids = [].map.call(host.querySelectorAll('.gt-row'), r => r.dataset.id);
ok('🔴 דיווח 40: "תקלות" מציג רק 1, 2 — לא את הסגורה #4', ids.slice().sort().join() === '1,2', ids.join());
ok('הסבר שהסגורות ב"סגורות"', /תקלות שנסגרו נמצאות ב"סגורות"/.test(host.textContent));
chip('closed').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const folds = host.querySelectorAll('details.gt-wkfold');
ok('🔴 "סגורות" מקובצת לפי שבוע הסגירה: 4 שבועות', folds.length === 4, folds.length);
const f0 = folds[0] && folds[0].querySelector('summary').textContent;
ok('הראשון = השבוע, ובו #4 — תוכנן לפני 3 שבועות, נסגר השבוע', /השבוע/.test(f0) && !!folds[0].querySelector('[data-id="4"]'), f0);
ok('הכותרת: "1 נסגרו" + "0 שגרה · תקלה אחת"', /1 נסגרו/.test(f0) && /0 שגרה · תקלה אחת/.test(f0), f0);
const f1 = folds[1] && folds[1].querySelector('summary').textContent;
ok('השבוע שעבר: "2 נסגרו · 2 שגרה · 0 תקלות" (המופע שבוטל לא נספר)', /2 נסגרו/.test(f1) && /2 שגרה · 0 תקלות/.test(f1), f1);
ok('שני השבועות האחרונים פתוחים, הישנים מקופלים', folds[0].open && folds[1].open && !folds[2].open && !folds[3].open);
ok('מופע שבוטל — במגירה בתחתית', !!host.querySelector('details.gt-drawer [data-id="7"]'));
ok('בתוך שבוע — החדשה למעלה', [].map.call(folds[1].querySelectorAll('.gt-row'), r => r.dataset.id).join() === '6,5');

/* ===================================================================== 3 */
section('3. מפות הגינון — רק מתחמי גזם');
const RJ = R('js/screens/resident.js');
ok('CBA.map.render מקבל binKinds ומסנן גם את הציור וגם את התוויות',
   /var binKinds = Array\.isArray\(opts\.binKinds\)/.test(RJ) && (RJ.match(/if \(binHidden\(o\)\) return;/g) || []).length === 2);
ok('⚠️ בלי האפשרות — כל הפחים (מפת השיכון)', /binKinds && o\.t === 'bin'/.test(RJ));
[['js/ui/gardenPins.js', 1], ['js/ui/gardenForm.js', 1], ['js/screens/gardenTasks.js', 2], ['js/screens/resGarden.js', 2]].forEach(([f, n]) => {
  const c = (R(f).match(/binKinds: \["garden"\]/g) || []).length;
  ok(f + ' — ' + n + ' מפות עם binKinds', c === n, c);
});
const calls = [];
['js/ui/gardenForm.js', 'js/screens/gardenTasks.js', 'js/screens/resGarden.js'].forEach(f => {
  const s = R(f), re = /CBA\.map\.render\(/g; let m;
  while ((m = re.exec(s))) calls.push(f + ':' + (/binKinds/.test(s.slice(m.index, m.index + 260)) ? 'ok' : 'MISSING'));
});
ok('🔴 אין קריאת מפה בגינון בלי binKinds', calls.every(c => /ok$/.test(c)), calls.join(' '));

/* ===================================================================== 4 */
section('4. מסך נתוני גינון — DOM אמיתי');
const dom2 = new JSDOM('<!doctype html><html dir="rtl"><body><div id="app"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true });
const w2 = dom2.window;
w2.CBA = { esc: window.CBA.esc };
w2.CBA.ui = { toast() {}, sheet: o => { w2.__sheet = o; return { wrap: w2.document.createElement('div') }; } };
w2.CBA.gardenPins = { mount: () => ({ set() {} }) };
w2.CBA.map = {};
w2.CBA.data = { getGardenStatsLive: (n, cb) => cb({ ok: true, rows: T, log: [], logOk: true, categories: [], requireApproval: true }) };
w2.eval(R('js/data/gardenLang.js'));
w2.eval(R('js/data/gardenStatsCalc.js'));
w2.eval(R('js/screens/gardenStats.js'));
const h2 = w2.document.getElementById('app');
w2.CBA.screens.gardenStats.render(h2);
const q = s => h2.querySelector(s), qa = s => h2.querySelectorAll(s);
ok('שלוש השורות: אריחים · גרף+מפה · פירוט', !!q('.gx2-kpis') && !!q('.gx2-main .gx2-trend') && !!q('.gx2-main .gx2-where') && !!q('.gx2-detail'));
ok('4 אריחים, הראשון "ממתינות לאישורך" כהה', qa('.gx2-kpis > *').length === 4 && q('.gx2-kpis > :first-child').classList.contains('is-dark'));
ok('"פתוחות עכשיו": תקלות 3 · שגרה 4', /3/.test(q('[data-list="open"] .gx2-n').textContent) && /4/.test(q('[data-list="openR"] .gx2-n').textContent));
ok('4 לשוניות, "עבודה שבוצעה" פעילה', qa('[data-ctab]').length === 4 && q('[data-ctab].on').dataset.ctab === 'work');
ok('גם 4 גרפים ברצף (לטלפון)', qa('.gx2-all .gx2-chart').length === 4);
ok('סרגל "עכשיו · מגמות · מפה"', qa('.gx2-mnav [data-mv]').length === 3);
const click = el => el.dispatchEvent(new w2.MouseEvent('click', { bubbles: true }));
click(q('[data-ctab="faults"]'));
ok('לחיצה על לשונית מחליפה את הגרף', q('.gx2-one .gx2-chart').dataset.k === 'faults' && q('[data-ctab].on').dataset.ctab === 'faults');
click(q('[data-go="drag"]'));
ok('🔑 "לגרף ←" באריח נגררות פותח את לשונית הגרירות', q('.gx2-one .gx2-chart').dataset.k === 'drag');
click(q('.gx2-mnav [data-mv="map"]'));
ok('מעבר לחלק "מפה" (מצב טלפון)', q('.gx2').dataset.mv === 'map');
click(q('[data-list="openR"]'));
ok('"שגרה" באריח פותחת את רשימת השגרה הפתוחה', w2.__sheet && /שגרה פתוחה/.test(w2.__sheet.label || ''), w2.__sheet && w2.__sheet.label);
const CSS = R('css/gardenStats.css');
ok('🔴 container query (לא media) — טלפון ב-760', /@container gx \(max-width: 760px\)/.test(CSS) && /\.gx\.gx-vars \{ container-type: inline-size;/.test(CSS));
ok('בטלפון: לשוניות מוסתרות, כל הגרפים מוצגים', /\.gx2-tabs, \.gx2-one \{ display: none; \}/.test(CSS) && /\.gx2-all \{ display: block;/.test(CSS));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
