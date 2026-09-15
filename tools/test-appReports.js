/* הרצה:  cd tools && npm i jsdom && node test-appReports.js
   מארז בדיקות ל"דיווח על האפליקציה" (2026-09-09). רץ ב-jsdom בלי דפדפן ובלי שרת:
   טוען את dialog.js / report.js / appReports.js האמיתיים מול CBA מדומה. */
/* מארז בדיקות ל"דיווח על האפליקציה" — רץ ב-jsdom, בלי שרת ובלי דפדפן אמיתי. */
const fs = require('fs');
const { JSDOM } = require('jsdom');
const APP = require('path').join(__dirname, '..');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

const dom = new JSDOM('<!doctype html><html dir="rtl"><body data-screen="budget"></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
global.navigator = window.navigator; global.FileReader = window.FileReader;
global.Image = window.Image; global.URL = window.URL;

// --- CBA מינימלי ---
window.CBA = {
  esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
  screens: {},
  screenLabel: k => ({ budget: 'תכנון מול ביצוע' }[k] || k),
  mock: { _serverVersion: 'v42-app-reports' }
};
window.matchMedia = window.matchMedia || (() => ({ matches: false }));

let lastSubmit = null, submitReply = { ok: true, id: 7 };
let lastDone = null, doneReply = { ok: true };
window.CBA.data = {
  submitAppReport: (payload, cb) => { lastSubmit = payload; setTimeout(() => cb(submitReply), 0); },
  getAppReports: cb => setTimeout(() => cb(window.__reports), 0),
  setAppReportDone: (id, done, reply, cb) => { lastDone = { id, done, reply }; setTimeout(() => cb(doneReply), 0); },
  getReceipt: (id, cb) => setTimeout(() => cb({ ok: true, url: 'data:image/png;base64,AA' }), 0)
};

function run(file) { window.eval(fs.readFileSync(APP + '/' + file, 'utf8')); }
/* diag.js נטען **ראשון**, כמו ב-index.html — הוא מקור ההקשר של report.js. */
run('js/ui/diag.js');
run('js/ui/dialog.js');
run('js/ui/report.js');
run('js/screens/appReports.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

(async function () {
  section('1. הכפתור הצף');
  window.CBA.report.mount(true);
  ok('הכפתור נוצר', !!$('.rep-fab'));
  ok('התפריט סגור בהתחלה', $('.rep-menu').hidden === true);
  $('.rep-fab').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('לחיצה פותחת את התפריט', $('.rep-menu').hidden === false);
  ok('שני כפתורים בדיוק', $$('.rep-menu__btn').length === 2);
  ok('הכפתורים הם ייעול ותקלה',
    $$('.rep-menu__btn').map(b => b.dataset.rep).join(',') === 'ייעול,תקלה',
    $$('.rep-menu__btn').map(b => b.dataset.rep).join(','));
  document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('לחיצה מחוץ סוגרת', $('.rep-menu').hidden === true);
  window.CBA.report.mount(false);
  ok('אורח לא רואה את הכפתור', $('.rep-fab-wrap').hidden === true);
  window.CBA.report.mount(true);

  section('1ב. נקודת הכניסה מתפריט המשתמש');
  window.CBA.report.openMenu();
  ok('openMenu פותח את אותו תפריט', $('.rep-menu').hidden === false);
  ok('הכפתור נראה גם אם הוסתר', $('.rep-fab-wrap').hidden === false);
  document.body.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  section('2. החלונית — סעיפים מרובים');
  $('.rep-fab').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  $$('.rep-menu__btn').find(b => b.dataset.rep === 'תקלה')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok('החלונית נפתחה', !!$('.cba-dlg-backdrop'));
  ok('הכותרת לפי הסוג', $('.cba-dlg__title').textContent.indexOf('תקלה') !== -1,
     $('.cba-dlg__title') && $('.cba-dlg__title').textContent);
  ok('סעיף אחד בהתחלה', $$('.rep-item').length === 1);
  ok('כפתור ההסרה מוסתר בסעיף יחיד', $('.rep-item__x').hidden === true);
  ok('ההקשר מוצג למשתמש', $('.rep-hint').textContent.indexOf('תכנון מול ביצוע') !== -1,
     $('.rep-hint').textContent.slice(0, 90));

  const add = $('.rep-add');
  for (let i = 0; i < 6; i++) add.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('תקרה של 5 סעיפים', $$('.rep-item').length === 5, String($$('.rep-item').length));
  ok('כפתור ההוספה ננעל בתקרה', add.disabled === true);
  ok('מספור רץ', $$('.rep-item__n').map(e => e.textContent).join('') === '12345');

  $$('.rep-item')[2].querySelector('.rep-item__x')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('הסרת סעיף', $$('.rep-item').length === 4);
  ok('מספור מתוקן אחרי הסרה', $$('.rep-item__n').map(e => e.textContent).join('') === '1234');
  ok('כפתור ההוספה נפתח שוב', add.disabled === false);

  /* --- הקשר שנצבר *לפני* הדיווח, בדיוק כמו אצל תושב אמיתי --- */
  window.CBA.perms = ['תקציב', 'מועדון'];
  window.CBA.mock.currentYear = 'תשפ"ו';
  window.CBA.diag.error('שגיאה מזויפת לבדיקה', 'planning.js:412');
  const probe = document.createElement('button');
  probe.setAttribute('aria-label', 'כפתור בדיקה');
  document.body.appendChild(probe);
  probe.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  probe.remove();

  section('3. ולידציה ושליחה');
  const okBtn = $('[data-dlg="ok"]');
  okBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(30);
  ok('דיווח ריק נחסם', !!$('.cba-dlg-backdrop') && $('.rep-err').hidden === false);
  ok('לא נשלח כלום לשרת', lastSubmit === null);

  $$('.rep-item textarea')[0].value = '  הכפתור לא נשמר  ';
  $$('.rep-item textarea')[1].value = 'ובמובייל הוא נחתך';
  $$('.rep-item textarea')[3].value = '   ';   // רווחים בלבד — לא אמור להישלח
  okBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(60);
  ok('נשלח לשרת', !!lastSubmit);
  ok('סוג נכון', lastSubmit && lastSubmit.kind === 'תקלה');
  ok('סעיפים נוקו ורווחים נזרקו',
     JSON.stringify(lastSubmit.items) === JSON.stringify(['הכפתור לא נשמר', 'ובמובייל הוא נחתך']),
     JSON.stringify(lastSubmit && lastSubmit.items));
  ok('הקשר נשלח', lastSubmit && lastSubmit.screen.indexOf('budget') !== -1, lastSubmit && lastSubmit.screen);
  ok('גרסת שרת נשלחת', lastSubmit && lastSubmit.srvVer === 'v42-app-reports', lastSubmit && lastSubmit.srvVer);
  ok('הרשאות נשלחות', lastSubmit && lastSubmit.perms === 'תקציב, מועדון', lastSubmit && lastSubmit.perms);
  ok('שנת עבודה נשלחת', lastSubmit && lastSubmit.year === 'תשפ"ו', lastSubmit && lastSubmit.year);
  ok('מצב רשת נשלח', lastSubmit && /מקוון/.test(lastSubmit.net || ''), lastSubmit && lastSubmit.net);
  ok('⚠️ שגיאת JS שקרתה לפני הדיווח נשלחת',
     lastSubmit && /שגיאה מזויפת לבדיקה/.test(lastSubmit.errors || ''), lastSubmit && lastSubmit.errors);
  ok('⚠️ השובל כולל את הלחיצה שקדמה לדיווח',
     lastSubmit && /לחיצה: כפתור בדיקה/.test(lastSubmit.trail || ''), lastSubmit && lastSubmit.trail);
  ok('⚠️ הדיווח אינו מדווח על עצמו (החלונית שלו אינה "חלון פתוח")',
     lastSubmit && !/דיווח על תקלה/.test(lastSubmit.dialog || ''), lastSubmit && lastSubmit.dialog);
  ok('מידע נוסף נשלח', lastSubmit && /בסשן:/.test(lastSubmit.extra || ''), lastSubmit && lastSubmit.extra);
  await wait(260);
  ok('החלונית נסגרה אחרי הצלחה', !$('.cba-dlg-backdrop'));

  section('4. כישלון שרת לא מאבד את מה שהוקלד');
  lastSubmit = null; submitReply = { ok: false, error: 'אין הרשאה' };
  window.CBA.report.open('ייעול');
  await wait(60);
  $('.rep-item textarea').value = 'כדאי כפתור חזרה';
  $('[data-dlg="ok"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(80);
  ok('החלונית נשארה פתוחה', !!$('.cba-dlg-backdrop'));
  ok('הטקסט לא אבד', $('.rep-item textarea').value === 'כדאי כפתור חזרה');
  ok('השגיאה מהשרת מוצגת', $('.rep-err').textContent.indexOf('אין הרשאה') !== -1, $('.rep-err').textContent);
  ok('כפתור השליחה שוחרר', $('[data-dlg="ok"]').disabled === false);

  section('5. sticky — Escape ולחיצה ברקע לא זורקים טקסט');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(30);
  ok('Escape לא סוגר טופס', !!$('.cba-dlg-backdrop'));
  $('.cba-dlg-backdrop').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(30);
  ok('לחיצה ברקע לא סוגרת טופס', !!$('.cba-dlg-backdrop'));
  $('[data-dlg="cancel"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(260);
  ok('ביטול כן סוגר', !$('.cba-dlg-backdrop'));

  section('6. confirm רגיל לא נשבר מהשינוי');
  let confirmed = null;
  window.CBA.ui.confirm('למחוק?', { danger: true }).then(v => { confirmed = v; });
  await wait(60);
  ok('confirm נפתח', !!$('.cba-dlg-backdrop'));
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await wait(260);
  ok('Escape סוגר confirm רגיל', confirmed === false, String(confirmed));

  section('7. מסך הניהול');
  window.__reports = { ok: true, rows: [
    { id: 1, date: '2026-09-09T08:00:00.000Z', email: 'a@b.c', name: 'דנה', kind: 'תקלה',
      items: ['לא נשמר'], screen: 'תכנון מול ביצוע (budget)', ver: '20260909q', ua: 'Safari · iOS',
      photos: ['abcdefghij12'], done: false, reply: '' },
    { id: 2, date: '2026-09-08T08:00:00.000Z', email: 'd@e.f', name: 'רון', kind: 'ייעול',
      items: ['כדאי חיפוש', 'וגם מיון'], screen: '', ver: '', ua: '', photos: [], done: true, reply: 'תודה' }
  ] };
  const main = document.createElement('div');
  document.body.appendChild(main);
  window.CBA.screens.appReports.render(main);
  await wait(60);
  ok('רק הפתוחים מוצגים כברירת מחדל', main.querySelectorAll('.rr-row').length === 1,
     String(main.querySelectorAll('.rr-row').length));
  ok('כותרת מונה נכון', main.querySelector('.screen-head__sub').textContent.indexOf('1 פתוחים') !== -1,
     main.querySelector('.screen-head__sub').textContent);
  main.querySelector('#rr-toggle').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  ok('הצגת מה שטופל', main.querySelectorAll('.rr-row').length === 2);
  ok('שני סעיפים מוצגים כרשימה', main.querySelectorAll('.rr-row')[1].querySelectorAll('.rr-items li').length === 2);
  ok('תגובה קודמת מוצגת', main.innerHTML.indexOf('תגובה שנשלחה') !== -1);

  const chk = main.querySelector('.rr-row .rr-chk');
  chk.checked = true;
  chk.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(40);
  ok('סימון טופל נשלח לשרת', lastDone && String(lastDone.id) === '1' && lastDone.done === true,
     JSON.stringify(lastDone));
  ok('השורה סומנה חזותית', main.querySelector('.rr-row').classList.contains('is-done'));

  lastDone = null; doneReply = { ok: false, error: 'נכשל' };
  const chk2 = main.querySelectorAll('.rr-row .rr-chk')[1];
  chk2.checked = false;
  chk2.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(40);
  ok('כישלון מחזיר את התיבה למצבה', chk2.checked === true);

  section('8. אין הצטברות מאזינים בציור חוזר');
  doneReply = { ok: true };
  main.querySelector('#rr-toggle').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  main.querySelector('#rr-toggle') && main.querySelector('#rr-toggle')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  let calls = 0;
  const realSet = window.CBA.data.setAppReportDone;
  window.CBA.data.setAppReportDone = (id, d, r, cb) => { calls++; realSet(id, d, r, cb); };
  const c3 = main.querySelector('.rr-row .rr-chk');
  c3.checked = !c3.checked;
  c3.dispatchEvent(new window.Event('change', { bubbles: true }));
  await wait(40);
  ok('סימון אחד = קריאה אחת לשרת', calls === 1, String(calls));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
