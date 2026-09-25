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
let lastCopy = null;
window.CBA.data = {
  submitAppReport: (payload, cb) => { lastSubmit = payload; setTimeout(() => cb(submitReply), 0); },
  getAppReports: cb => setTimeout(() => cb(window.__reports), 0),
  setAppReportDone: (id, done, reply, cb) => { lastDone = { id, done, reply }; setTimeout(() => cb(doneReply), 0); },
  /* גל 4 — המסך החדש שולח את השורה כולה (כדי לדעת לאן לכתוב ולצבור תשובות). */
  setAppReportState: (row, done, reply, cb) => { lastDone = { id: row.id, done, reply }; setTimeout(() => cb(doneReply), 0); },
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

  section('7. מסך הניהול — גל 4: לשוניות, היסטוריה שנשארת, סינון');
  try { window.localStorage.removeItem('cba_rr_view'); } catch (e) {}
  const now = Date.now();
  window.__reports = { ok: true, rows: [
    { id: 3, date: new Date(now - 3600e3).toISOString(), name: 'דנה', kind: 'תקלה',
      items: ['לא נשמר'], screen: 'תכנון מול ביצוע (budget)', ver: '20260909q', ua: 'Safari · iOS',
      errors: '10:00:01 השמירה לא קיבלה תשובה  @ sheets.js:1', trail: '10:00:00 לחיצה: שמירה',
      photos: ['abcdefghij12'], done: false, reply: '', src: 'fs' },
    { id: 2, date: new Date(now - 2 * 86400e3).toISOString(), name: 'רון', kind: 'ייעול',
      items: ['כדאי חיפוש', 'וגם מיון'], screen: '', photos: [], done: true,
      doneAt: new Date(now - 86400e3).toISOString(), reply: 'תודה', src: 'fs' },
    { id: 1, date: new Date(now - 40 * 86400e3).toISOString(), name: 'גל', kind: 'ייעול',
      items: ['רעיון ישן'], photos: [], done: false, reply: '', src: 'sheet' }
  ] };
  const main = document.createElement('div');
  document.body.appendChild(main);
  window.CBA.screens.appReports.render(main);
  await wait(60);
  const cards = () => main.querySelectorAll('.rr-card');
  ok('ברירת מחדל: פתוחים בלבד', cards().length === 2, String(cards().length));
  ok('ארבעה מדדים בראש', main.querySelectorAll('.rr-kpi').length === 4);
  ok('מדד "פתוחים" נכון', main.querySelector('.rr-kpi__v').textContent === '2', main.querySelector('.rr-kpi__v').textContent);
  ok('קיבוץ לפי זמן ("היום")', main.innerHTML.indexOf('rr-group">היום<') !== -1);
  ok('פס צבע לפי סוג', main.querySelector('.rr-card--bug') && main.querySelector('.rr-card--idea'));
  ok('ספירת שגיאות על הכרטיס', /1 שגיאות/.test(main.innerHTML));

  const clickSel = sel => main.querySelector(sel).dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  clickSel('[data-view="done"]');
  ok('לשונית "טופלו" מציגה את מה שטופל', cards().length === 1 && cards()[0].dataset.id === '2');
  ok('⚠️ ומה שטופל מציג מתי ומה נענה', /טופל/.test(main.querySelector('.rr-done').textContent) &&
     /תודה/.test(main.querySelector('.rr-done').textContent), main.querySelector('.rr-done') && main.querySelector('.rr-done').textContent);
  ok('שני סעיפים מוצגים כרשימה', cards()[0].querySelectorAll('.rr-items li').length === 2);
  clickSel('[data-view="all"]');
  ok('"הכול" מציג את שלושתם', cards().length === 3);
  clickSel('[data-kind="bug"]');
  ok('סינון לפי תקלות', cards().length === 1 && cards()[0].dataset.id === '3');
  clickSel('[data-kind="all"]');
  clickSel('[data-view="open"]');

  section('7ב. סימון "טופל" — נשאר על המסך');
  lastDone = null; doneReply = { ok: true };
  main.querySelector('.rr-card[data-id="3"] [data-act="done"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  ok('סימון נשלח עם השורה', lastDone && String(lastDone.id) === '3' && lastDone.done === true, JSON.stringify(lastDone));
  ok('🔴 הכרטיס לא נעלם מלשונית "פתוחים"', !!main.querySelector('.rr-card[data-id="3"]'));
  ok('והוא מסומן כטופל', main.querySelector('.rr-card[data-id="3"]').classList.contains('is-done'));
  ok('ויש לו "פתיחה מחדש"', !!main.querySelector('.rr-card[data-id="3"] [data-act="reopen"]'));

  lastDone = null; doneReply = { ok: false, error: 'נכשל' };
  main.querySelector('.rr-card[data-id="3"] [data-act="reopen"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  ok('כישלון לא משנה את המצב', main.querySelector('.rr-card[data-id="3"]').classList.contains('is-done'));
  const alertBtn = document.querySelector('[data-dlg="ok"]');
  if (alertBtn) alertBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(260);

  section('7ג. פרטים טכניים והעתקה לתחקור');
  doneReply = { ok: true };
  clickSel('.rr-card[data-id="3"] [data-act="tech"]');
  ok('פרטים טכניים נפתחים', !!main.querySelector('.rr-card[data-id="3"] .rr-tech'));
  ok('והם מראים את השובל', /לחיצה: שמירה/.test(main.querySelector('.rr-tech').textContent));
  window.CBA.report.copyText = (t, cb) => { lastCopy = t; cb(true); };
  clickSel('.rr-card[data-id="3"] [data-act="copy"]');
  ok('העתקה מייצרת גוש עם מזהה ושגיאות', lastCopy && /דיווח #3/.test(lastCopy) && /השמירה לא קיבלה תשובה/.test(lastCopy), lastCopy);

  section('8. אין הצטברות מאזינים בציור חוזר');
  clickSel('[data-view="all"]'); clickSel('[data-view="open"]'); clickSel('[data-view="all"]');
  let calls = 0;
  const realSet = window.CBA.data.setAppReportState;
  window.CBA.data.setAppReportState = (row, d, r, cb) => { calls++; realSet(row, d, r, cb); };
  main.querySelector('.rr-card[data-id="1"] [data-act="done"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(40);
  ok('לחיצה אחת = קריאה אחת', calls === 1, String(calls));

  section('9. גל 4 — ניקוי אסימונים בהקשר ובגוש התחקור');
  window.CBA.diag.error('fetch failed https://script.google.com/macros/s/X/exec?session=SECRET123&action=y', 'sheets.js:9');
  const packed = window.CBA.diag.pack('');
  ok('🔴 האסימון לא מופיע בגוש', packed.indexOf('SECRET123') === -1, packed.slice(0, 300));
  ok('והשגיאה עצמה כן מופיעה', /fetch failed/.test(packed));
  ok('וגם בדיווח עצמו', window.CBA.diag.snapshot().errors.join('\n').indexOf('SECRET123') === -1);

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
