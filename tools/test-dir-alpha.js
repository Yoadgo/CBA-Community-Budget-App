/* בדיקת jsdom למדריך "שכנים" אחרי המעבר לקיבוץ א'-ב' + סרגל אותיות (2026-09-16).
   רץ נגד js/screens/resident.js האמיתי, בלי שרת ובלי דפדפן.
   הרצה: cd tools && node test-dir-alpha.js */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = require('path').join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

const dom = new JSDOM('<!doctype html><html dir="rtl"><body data-screen="resDirectory"></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
const { window } = dom;
global.window = window; global.document = window.document;
global.navigator = window.navigator;
window.matchMedia = window.matchMedia || (() => ({ matches: false }));
window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView || function () {};

window.CBA = {
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  screens: {},
  user: { email: 'test@test.local', name: 'בודק' },
  ui: {
    emptyState: (o) => '<div class="rs-empty"><p>' + (o && o.title || '') + '</p></div>'
  },
  skel: { rows: (n) => '<div class="skel-rows"></div>' }
};

// נתוני דוגמה — כמו בגיליון האמיתי: כותרות עם "שם פרטי 1/2", "משפחה", "בית" וכו'
const rows = [
  { "בית": "112", "משפחה": "אברמוביץ", "שם פרטי 1": "דני", "שם פרטי 2": "מיכל", "טלפון 1": "050-1112233", "סטטוס": "פעיל" },
  { "בית": "204", "משפחה": "אזולאי", "שם פרטי 1": "רונית", "סטטוס": "פעיל" },
  { "בית": "301", "משפחה": "בן-דוד", "שם פרטי 1": "שרה", "סטטוס": "פעיל" },
  { "בית": "104", "משפחה": "גרין", "שם פרטי 1": "דבורה", "סטטוס": "פעיל" },
  { "בית": "999", "משפחה": "", "שם פרטי 1": "אלמוני", "סטטוס": "פעיל" },       // בלי שם משפחה -> קבוצת "#"
  { "בית": "888", "משפחה": "עזב לא רלוונטי", "שם פרטי 1": "יצא", "סטטוס": "עבר דירה" } // לא פעיל -> לא אמור להופיע כלל
];

window.CBA.data = {
  getCommunityDirectory: (cb) => setTimeout(() => cb({ ok: true, rows: rows }), 0),
  getCommitteeTree: (cb) => setTimeout(() => cb({ ok: true, rows: [] }), 0)
};

function run(file) { window.eval(fs.readFileSync(APP + '/' + file, 'utf8')); }
run('js/screens/resident.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

(async function () {
  const container = document.createElement('div');
  document.body.appendChild(container);

  section('1. רינדור ראשוני');
  window.CBA.screens.resDirectory.render(container, {});
  await wait(20);
  ok('כותרת המסך "שכנים"', $('.screen-head__title').textContent === 'שכנים');
  ok('הסרגל נוצר', !!$('#dir-rail'));
  ok('הסרגל מכיל 23 תאים (22 אותיות + קבוצת #)', $$('.dir-rail__letter').length === 23,
    $$('.dir-rail__letter').length);

  section('2. סדר וקיבוץ נכונים');
  const groupIds = $$('.dir-group').map(g => g.id.replace('dir-g-', ''));
  ok('קבוצות אותיות + קבוצת # בסוף, בסדר א-ב נכון',
    JSON.stringify(groupIds) === JSON.stringify(['א', 'ב', 'ג', '#']),
    JSON.stringify(groupIds));

  const letterA = $('#dir-g-א');
  ok('קבוצת א׳ מכילה שתי משפחות (אברמוביץ, אזולאי) שתיהן מתחילות ב-א', letterA && letterA.querySelectorAll('.dir-card').length === 2,
    letterA && letterA.querySelectorAll('.dir-card').length);
  ok('כותרת קבוצת א׳ מציגה את האות בגופן-כותרת', letterA.querySelector('.dir-group__letter').textContent === 'א');
  ok('סדר בתוך הקבוצה לפי א-ב: אברמוביץ לפני אזולאי',
    letterA.textContent.indexOf('אברמוביץ') < letterA.textContent.indexOf('אזולאי'));

  const hashGroup = $('#dir-g-\\#');
  ok('קבוצת "#" קיימת לשם משפחה ריק', !!hashGroup);
  ok('משפחה שעברה דירה (לא פעיל) לא מופיעה בכלל',
    document.body.textContent.indexOf('עזב לא רלוונטי') === -1);

  section('3. תאי הסרגל תואמים למה שבאמת קיים');
  const railLetters = $$('.dir-rail__letter').map(el => ({
    text: el.textContent, empty: el.classList.contains('is-empty'), jump: el.dataset.dirRail || null
  }));
  const aCell = railLetters.find(x => x.text === 'א');
  const zCell = railLetters.find(x => x.text === 'ת'); // תי"ו - בטח ריקה בדוגמה שלנו
  ok('לאות א׳ (יש נתונים) יש data-dir-rail ואינה מסומנת ריקה', aCell && !aCell.empty && aCell.jump === 'א');
  ok('לאות ת׳ (אין נתונים) אין data-dir-rail והיא מסומנת ריקה', zCell && zCell.empty && zCell.jump === null);
  const hashCell = railLetters.find(x => x.text === '#');
  ok('תא ה-# מופיע בסוף הסרגל ותמיד ניתן ללחיצה', !!hashCell && !hashCell.empty && hashCell.jump === '#');

  section('4. לחיצה על אות בסרגל מבצעת קפיצה (scrollIntoView)');
  let scrolledEl = null;
  const gEl = document.getElementById('dir-g-ג');
  gEl.scrollIntoView = function () { scrolledEl = this; };
  $('.dir-rail__letter[data-dir-rail="ג"]').dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  document.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
  ok('pointerdown על אות ג׳ קרא scrollIntoView על קבוצת ג׳', scrolledEl === gEl);
  ok('בועת האות מציגה את האות שנלחצה', $('#dir-rail-bubble').textContent === 'ג' && $('#dir-rail-bubble').style.display === 'flex');

  section('5. חיפוש מבטל את הקיבוץ ואת הסרגל');
  const qEl = document.getElementById('dir-q');
  qEl.value = 'אברמוביץ';
  qEl.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('בזמן חיפוש אין סרגל', !$('#dir-rail'));
  ok('בזמן חיפוש אין קיבוץ (dir-group)', $$('.dir-group').length === 0);
  ok('התוצאה הרלוונטית מוצגת', document.body.textContent.indexOf('אברמוביץ') !== -1);

  qEl.value = '';
  qEl.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok('ניקוי החיפוש מחזיר את הסרגל', !!$('#dir-rail'));

  section('6. הסרגל מתרווח רק כשנוגעים בו ומתכווץ במנוחה (2026-09-16)');
  ok('בברירת מחדל הסרגל אינו במצב מורחב', !$('#dir-rail').classList.contains('is-touching'));
  $('#dir-rail').dispatchEvent(new window.PointerEvent('pointerenter', { bubbles: true }));
  ok('ריחוף/נגיעה בסרגל מוסיף is-touching (מתרווח)', $('#dir-rail').classList.contains('is-touching'));
  $('#dir-rail').dispatchEvent(new window.PointerEvent('pointerleave', { bubbles: true }));
  await wait(400);
  ok('אחרי שעוזבים את הסרגל הוא חוזר להתכווץ (לאחר השהיה קצרה)',
    !$('#dir-rail').classList.contains('is-touching'));
  $('.dir-rail__letter[data-dir-rail="ב"]').dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true }));
  ok('pointerdown על אות מרחיב את הסרגל גם בלי pointerenter קודם (מגע ישיר)',
    $('#dir-rail').classList.contains('is-touching'));
  document.dispatchEvent(new window.PointerEvent('pointerup', { bubbles: true }));
  await wait(400);
  ok('אחרי שחרור האצבע הסרגל חוזר להתכווץ', !$('#dir-rail').classList.contains('is-touching'));

  console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
