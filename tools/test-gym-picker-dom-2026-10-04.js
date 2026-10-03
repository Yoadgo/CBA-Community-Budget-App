/* בדיקת DOM לבורר התושבים בהקמת מנוי (4.10.2026).  הרצה: node tools/test-gym-picker-dom-2026-10-04.js
   🔴 מדמה את התקלה האמיתית: המנהל מקליד *לפני* שהרשימה חזרה מהשרת (1-3 שניות) — צריך לראות "טוען",
   ובהגיע הרשימה — הצעות. וגם: בחירה ממלאת שדות; אימייל לא-רשום נחסם; שרת כושל — השדה נשאר חופשי. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const GA = fs.readFileSync(path.join(__dirname, '..', 'js/screens/gymAdmin.js'), 'utf8');
const ROWS = [
  { email: 'dana@x.com', first: 'דנה', family: 'כהן', house: '5', rid: 'F1', phone: '050-1' },
  { email: 'ron@x.com', first: 'רון', family: 'לוי', house: '6', rid: 'F2', phone: '' },
];
function boot(pickerBehavior) {
  const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; const calls = { create: [], picker: 0 };
  let pending = [];
  w.CBA = {
    esc: s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
    skel: { stats: () => '', table: () => '', form: () => '' },
    ui: { busy: () => () => {}, alert() {}, toast() {}, confirm: () => Promise.resolve(true) },
    sheets: { markDirty() {}, clearDirty() {} },
    onScreen: () => true, holdRefresh() {},
    data: {
      getGymList: () => {},   // לא חוזר — לא מעניין כאן
      getGymResidentPicker: cb => { calls.picker++; pending.push(cb); },
      createGymMembership: (d, cb) => { calls.create.push(d); cb({ ok: true, status: 'ממתין לתשלום' }); },
    },
  };
  w.eval(GA);
  w.CBA.screens.gymAdmin.render(w.document.getElementById('c'));
  const btn = w.document.querySelector('#ga-new');
  return { w, calls, btn, resolve: res => { pending.forEach(f => f(res)); pending = []; } };
}
const type = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const items = w => Array.from(w.document.querySelectorAll('#gym-create [data-gc-list] .ac-item'));

console.log('\n1. הקלדה לפני שהרשימה חזרה (התקלה שיועד ראה)');
{
  const t = boot();
  ok('כפתור "מנוי חדש" קיים', !!t.btn);
  t.btn.click();
  const em = t.w.document.querySelector('[data-gc="email"]');
  ok('הטופס נפתח', !!em);
  type(t.w, em, 'דנה');
  ok('🔴 לפני שחזרה הרשימה — מוצג "טוען", לא ריק', items(t.w).length === 1 && /טוען/.test(items(t.w)[0].textContent), items(t.w).map(x => x.textContent).join('|'));
  t.resolve({ ok: true, rows: ROWS });
  ok('🔴 ברגע שהרשימה חזרה — ההצעות מצוירות מחדש לבד', items(t.w).length === 1 && /דנה כהן/.test(items(t.w)[0].textContent) && /dana@x.com/.test(items(t.w)[0].textContent), items(t.w).map(x => x.textContent).join('|'));
  const list = t.w.document.querySelector('[data-gc-list]');
  const ev = new t.w.MouseEvent('mousedown', { bubbles: true, cancelable: true });
  items(t.w)[0].dispatchEvent(ev);
  const v = k => t.w.document.querySelector('[data-gc="' + k + '"]').value;
  ok('בחירה ממלאת אימייל + שם + משפחה + טלפון', v('email') === 'dana@x.com' && v('firstName') === 'דנה' && v('lastName') === 'כהן' && v('phone') === '050-1');
  ok('מוצג "נבחר: …"', /נבחר: דנה כהן · בית 5/.test(t.w.document.querySelector('[data-gc-picked]').textContent));
  t.w.document.querySelector('[data-gc-save]').click();
  ok('ההקמה נשלחת עם האימייל שנבחר', t.calls.create.length === 1 && t.calls.create[0].email === 'dana@x.com', JSON.stringify(t.calls.create));
}
console.log('\n2. חיפוש לפי אימייל / אימייל לא רשום');
{
  const t = boot(); t.btn.click(); t.resolve({ ok: true, rows: ROWS });
  const em = t.w.document.querySelector('[data-gc="email"]');
  type(t.w, em, 'ron@');
  ok('חיפוש לפי חלק מאימייל', items(t.w).length === 1 && /רון לוי/.test(items(t.w)[0].textContent));
  type(t.w, em, 'nobody@x.com');
  ok('אין התאמה → הודעה ברורה', items(t.w).length === 1 && /לא נמצא תושב/.test(items(t.w)[0].textContent));
  t.w.document.querySelector('[data-gc-save]').click();
  ok('🔴 אימייל לא רשום נחסם, לא נשלח לשרת', t.calls.create.length === 0 && /לא רשום בטאב/.test(t.w.document.querySelector('[data-gc-err]').textContent));
}
console.log('\n3. שרת כושל — השדה נשאר חופשי');
{
  const t = boot(); t.btn.click(); t.resolve({ ok: false, error: 'x' });
  const em = t.w.document.querySelector('[data-gc="email"]');
  type(t.w, em, 'abc');
  ok('מוצגת הודעה שהרשימה לא נטענה', items(t.w).length === 1 && /לא נטענה/.test(items(t.w)[0].textContent));
  type(t.w, em, 'free@x.com');
  t.w.document.querySelector('[data-gc-save]').click();
  ok('ועדיין אפשר לשלוח (השרת מאמת)', t.calls.create.length === 1 && t.calls.create[0].email === 'free@x.com');
}
console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו' : '✅ הכול עבר') + ' (' + pass + ' עברו)');
process.exit(fail ? 1 : 0);
