/* הרצה:  cd tools && node test-reconcile.js   (דורש jsdom)
   מסך "בדיקת החזרים" — מול המנוע האמיתי (js/data/reconcile.js) ושרת מדומה. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const APP = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

const dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document; global.navigator = window.navigator;

window.CBA = { esc: s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) };
window.CBA.screens = {};

let lastPost = null, nextPost = null;
window.CBA.sheets = { postRead: (a, p, cb) => { lastPost = { a, p }; setTimeout(() => cb(nextPost), 0); } };
let txs = [];
window.CBA.data = {
  getAllTransactions: () => txs.slice(),
  getTransactions: () => txs.slice(),
  parseChargeFile: (payload, cb) => window.CBA.sheets.postRead('parseChargeFile', payload, cb)
};
window.CBA.navigate = () => {};

const run = f => window.eval(fs.readFileSync(path.join(APP, f), 'utf8'));
run('js/ui/dialog.js');
run('js/data/reconcile.js');
run('js/screens/reconcile.js');

const HEAD = ['מס.ספק','שם הספק','ת. תשלום','קוד','פרטים','סכום','% ניכוי','סכום ניכוי במקור','לתשלום','ת.זהות','קוד בנק','מס.סניף','מס. ח-ן בנק',''];
const row = (num, name, amt, sector) =>
  [num, name, '23/08/2026', '', '', amt, '', '', amt, '', '', '', '', sector];

const wait = ms => new Promise(r => setTimeout(r, ms));
const main = document.createElement('div');
document.body.appendChild(main);

// FileReader מדומה — jsdom קורא קבצים אמיתיים בלבד, וכאן אין קובץ אמיתי
function feed(grid, sheet) {
  nextPost = { ok: true, grid, sheet: sheet || 'פלמחים', sheets: ['גנים', 'פלמחים'], rows: grid.length - 1 };
  window.FileReader = function () {
    this.readAsDataURL = () => { this.result = 'data:x;base64,QUJD'; setTimeout(() => this.onload(), 0); };
  };
  const f = { name: 'חיובים אוגוסט.xlsx', type: '' };
  const inp = main.querySelector('#rc-file');
  Object.defineProperty(inp, 'files', { value: [f], configurable: true });
  inp.dispatchEvent(new window.Event('change', { bubbles: true }));
}

(async function () {
  section('1. מסך הפתיחה');
  window.CBA.screens.reconcile.render(main);
  ok('נפתח בבורר קובץ', !!main.querySelector('#rc-file'));
  ok('בלי תוצאות לפני שהועלה משהו', !main.querySelector('.rc-block'));
  ok('נאמר במפורש ששום דבר לא נשמר', /לא נשמר/.test(main.textContent));

  section('2. תואם מלא — שלוש בקשות שמסתכמות לשורה אחת');
  txs = [
    { id: 1, buyer: 'ממן שלומי', supplier: 'ממן שלומי', familyId: '12', amount: 161.8, status: 'ready', expenseType: 'refund', month: 'יולי' },
    { id: 2, buyer: 'ממן שלומי', supplier: 'ממן שלומי', familyId: '12', amount: 350.9, status: 'ready', expenseType: 'refund', month: 'יולי' },
    { id: 3, buyer: 'ממן שלומי', supplier: 'ממן שלומי', familyId: '12', amount: 87.3, status: 'ready', expenseType: 'refund', month: 'אוגוסט' }
  ];
  feed([HEAD, row('701963', 'חוז ממן שלומי', 600, 'שיכון'), row('9', 'סה"כ', 600, '')]);
  await wait(40);
  ok('אין פער (161.8+350.9+87.3 = 600 — בלי שגיאת נקודה צפה)',
     !/פער בסכום/.test(main.textContent), main.textContent.slice(0, 120));
  ok('מוצג כתואם', /תואם/.test(main.textContent));
  ok('שם הקובץ מוצג', /חיובים אוגוסט/.test(main.textContent));
  ok('נספרה שורה אחת במגזר שיכון', /1 שורות במגזר/.test(main.textContent), main.textContent.match(/\d+ שורות[^·]*/));
  ok('תאריך זיכוי = 1 בחודש שאחרי', /2026-09-01/.test(main.textContent));

  section('3. פער שמוסבר — בקשה אחת לא נכללה');
  main.querySelector('.rc-again').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  feed([HEAD, row('701963', 'ממן שלומי', 512.7, 'שיכון')]);
  await wait(40);
  ok('זוהה פער', /פער בסכום/.test(main.textContent));
  ok('נאמר מה לא נכלל', /לא נכלל/.test(main.textContent));
  ok('הבקשה החסרה נקובה בשמה', /87\.3/.test(main.textContent), main.textContent.slice(0, 200));

  section('4. תשלום בלי שום בקשה פתוחה — הדגל האדום');
  main.querySelector('.rc-again').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  feed([HEAD, row('555', 'כהן רחל', 250, 'שיכון')]);
  await wait(40);
  ok('זוהה', /שולם בלי שום בקשה פתוחה/.test(main.textContent));
  ok('מנוסח כדגל אדום', /הדגל האדום/.test(main.textContent));

  section('5. שולם על משהו שטרם אושר');
  txs.push({ id: 4, buyer: 'לוי דנה', supplier: 'לוי דנה', familyId: '30', amount: 40, status: 'ready', expenseType: 'refund' });
  txs.push({ id: 5, buyer: 'לוי דנה', supplier: 'לוי דנה', familyId: '30', amount: 60, status: 'submitted', expenseType: 'refund' });
  main.querySelector('.rc-again').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  feed([HEAD, row('777', 'לוי דנה', 100, 'שיכון')]);
  await wait(40);
  ok('הפער זוהה', /פער בסכום/.test(main.textContent));
  ok('נאמר שייתכן ששולם לפני אישור', /טרם עבר אישור|לא אושרה/.test(main.textContent), main.textContent.slice(0, 300));

  section('6. בקשות פתוחות שאינן בקובץ');
  main.querySelector('.rc-again').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  feed([HEAD, row('1', 'ספק אחר', 10, 'שיכון')]);
  await wait(40);
  ok('מוצגות', /בקשות פתוחות שאינן בקובץ/.test(main.textContent));

  section('7. מגזר "גנים" מסונן החוצה');
  main.querySelector('.rc-again').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  feed([HEAD, row('88', 'מישהו מהגנים', 900, 'גנים')]);
  await wait(40);
  ok('לא נכנס להשוואה', !/מישהו מהגנים/.test(main.textContent));
  ok('נאמר מה כן נמצא בקובץ', /גנים/.test(main.textContent), main.textContent.slice(0, 200));
  ok('חזרנו לבורר הקובץ', !!main.querySelector('#rc-file'));

  section('8. כישלון שרת');
  nextPost = { ok: false, error: 'ההמרה נכשלה (403)' };
  window.FileReader = function () {
    this.readAsDataURL = () => { this.result = 'data:x;base64,QUJD'; setTimeout(() => this.onload(), 0); };
  };
  const inp = main.querySelector('#rc-file');
  Object.defineProperty(inp, 'files', { value: [{ name: 'x.xlsx', type: '' }], configurable: true });
  inp.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(40);
  ok('השגיאה מוצגת למשתמש', /ההמרה נכשלה \(403\)/.test(main.textContent));
  ok('אפשר לנסות קובץ אחר', !!main.querySelector('#rc-file'));

  section('9. מה נשלח לשרת');
  ok('נשלח כ-parseChargeFile', lastPost && lastPost.a === 'parseChargeFile', JSON.stringify(lastPost && lastPost.a));
  ok('נשלח בלי הקידומת data:', lastPost && lastPost.p.data === 'QUJD', JSON.stringify(lastPost && lastPost.p.data));
  ok('נשלח שם הקובץ', lastPost && /\.xlsx$/.test(lastPost.p.fileName));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
