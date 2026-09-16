/* בדיקות לשליחת דיווח גינון ברקע (2026-09-14).
   מריץ את dialog.js / dataService.js / resGarden.js האמיתיים מול שרת מדומה,
   באותו דפוס כמו tools/test-phase42.js.  הרצה: node test-garden-send.js */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const APP = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

const dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document;
global.navigator = window.navigator;

const jsErrors = [];
window.addEventListener('error', e => jsErrors.push(String(e.message)));

window.CBA = { esc: s => String(s == null ? '' : s) };

/* ---- שרת מדומה: שולט בתזמון ובתוצאה, ומדווח התקדמות ---- */
let nextResult = { ok: true, id: 101 };
let serverDelay = 40;
let progressTicks = [];      // האחוזים שהשרת ה"מדומה" ידווח
let tickGap = 5;             // המרווח בין דיווחי התקדמות
const posted = [];
let dirtyKeys = [];

window.CBA.sheets = {
  isConnected: () => true,
  markDirty: k => dirtyKeys.push('+' + k),
  clearDirty: k => dirtyKeys.push('-' + k),
  postRead: (a, p, cb) => setTimeout(() => cb({ ok: true }), 0),
  /* ⚠️ נאמן לייצור אחרי תיקון ה-CORS (14.9.26): postReadProgress **אינו**
     מדווח התקדמות באמצע — מאזין על xhr.upload היה מכריח preflight
     ש-Apps Script לא עונה לו, והבקשה הייתה נופלת. onProgress נקרא רק
     עם 100, רגע לפני שהתשובה חוזרת. */
  postReadProgress: (action, payload, onProgress, cb) => {
    posted.push({ action, payload });
    setTimeout(() => { onProgress(100); cb(nextResult); }, serverDelay);
  }
};

window.CBA.mock = { _source: 'sheets', transactions: [], years: {}, settings: {} };
window.CBA.user = { firstName: 'דנה', family: 'כהן' };
window.CBA.skel = { cards: () => '<div class="skel"></div>' };
window.CBA.gardenLang = { flagText: f => f, state: s => s };
window.CBA.photos = { open() {} };

const navigations = [];
window.CBA.navigate = n => { navigations.push(n); };

/* CBA.map — רק מה ש-resGarden קורא לו */
let pinHandler = null;
window.CBA.map = { render: (el, opts) => { pinHandler = opts && opts.onPin; } };

const run = f => window.eval(fs.readFileSync(path.join(APP, f), 'utf8'));
run('js/ui/dialog.js');

/* ריגול על הטוסט **אחרי** dialog.js — הקובץ מחליף את CBA.ui כולו
   (המלכודת שמתועדת ב-test-phase42.js). */
let toasts = [];
const realUi = window.CBA.ui;
window.CBA.ui = Object.assign({}, realUi, { toast: m => { toasts.push(m); } });

run('js/data/dataService.js');

/* getGardenMeta — הטופס לא מצייר כלום עד שהוא חוזר */
window.CBA.data.getGardenMeta = cb => setTimeout(() => cb({
  ok: true, categories: ['דשא', 'עצים'], areas: ['אזור 1'], photoMax: 8
}), 0);
window.CBA.data.getMyGardenReports = cb => setTimeout(() => cb({ ok: true, reports: [] }), 0);

run('js/screens/resGarden.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const mkContainer = () => {
  const c = window.document.createElement('div');
  window.document.body.appendChild(c);
  return c;
};
const q = (c, s) => c.querySelector(s);
const px = (n) => ({ name: 'p' + n + '.jpg', mime: 'image/jpeg', data: window.btoa('img' + n) });

/* ממלא את הטופס ולוחץ שליחה */
async function fillAndSend(c, opts) {
  opts = opts || {};
  q(c, '.gd-cat[data-c="דשא"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  /* ⚠️ **כותרת קצרה היא שדה חובה מאז 15.9** (resGarden.js:817 — וגם
     בשרת, submitGardenReport_). בלעדיה הלחיצה על "שלח" נעצרת
     ב-alert ו-sendReport כלל אינו רץ — ואז אין שורת חיווי ואין
     markDirty, כלומר המארז נצבע אדום על פיצ'ר תקין לגמרי.
     זה מה שקרה כאן: הבדיקה התיישנה, המוצר לא נשבר. */
  q(c, '#gd-title').value = opts.title || 'ראש ממטרה שבור';
  q(c, '#gd-desc').value = opts.desc || 'הדשא יבש';
  q(c, '#gd-place').value = opts.place || 'ליד הכניסה';
  q(c, '#gd-phone').value = '050-1234567';
  if (opts.photos) {
    // דרך ה-state האמיתי: מדמים תמונות שכבר כווצו ונוספו
    opts.photos.forEach(p => {
      const el = window.document.createElement('span');
      el.className = 'gd-th';
      q(c, '#gd-thumbs').insertBefore(el, q(c, '#gd-add'));
    });
  }
  q(c, '#gd-send').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}

(async function () {
  /* ================================================================= */
  section('1. שכבת הנתונים — עברה ל-postReadProgress');
  posted.length = 0;
  let gotPct = [];
  window.CBA.data.submitGardenReport({ category: 'דשא' }, () => {}, p => gotPct.push(p));
  await wait(60);
  ok('נשלח דרך postReadProgress', posted.length === 1 && posted[0].action === 'submitGardenReport',
     JSON.stringify(posted[0] || null));
  ok('onProgress אופציונלי — קריאה בלי פרמטר שלישי לא נופלת', (() => {
    try { window.CBA.data.submitGardenReport({ category: 'x' }, () => {}); return true; }
    catch (e) { return false; }
  })());
  await wait(60);

  /* ================================================================= */
  section('2. חיווי התקדמות על הכפתור ומתחתיו');
  const c1 = mkContainer();
  window.CBA.screens.resGardenNew.render(c1);
  await wait(30);
  ok('הטופס צויר', !!q(c1, '#gd-send'), 'אין כפתור שליחה');

  progressTicks = [25, 60, 100];
  tickGap = 60;                 // מרווח גדול, כדי שנספיק לצלם כל שלב
  serverDelay = 120;
  nextResult = { ok: true, id: 101 };
  toasts = []; navigations.length = 0; dirtyKeys = [];
  await fillAndSend(c1);

  await wait(20);
  const prog = q(c1, '.gd-progress');
  ok('נוספה שורת חיווי מתחת לכפתור', !!prog);
  ok('סומן dirty לחסימת רענון רקע', dirtyKeys.indexOf('+gardenReport') !== -1,
     JSON.stringify(dirtyKeys));

  ok('החיווי אומר מה קורה', /מעלה את הדיווח/.test(prog.textContent), prog.textContent);
  /* ⚠️ הבדיקה שמגנה מפני חזרת התקלה: אחוזים דורשים מאזין על xhr.upload,
     והוא מה ששבר את הבקשה מול Apps Script. אסור שיחזרו. */
  ok('⚠️ אין אחוזים מומצאים בחיווי', prog.textContent.indexOf('%') === -1, prog.textContent);
  ok('⚠️ אין אחוזים על הכפתור', q(c1, '#gd-send').textContent.indexOf('%') === -1,
     q(c1, '#gd-send').textContent);

  await wait(360);
  ok('אחרי הצלחה — טוסט עם מספר הדיווח', toasts.some(t => /101/.test(t)), JSON.stringify(toasts));
  ok('נוקה ה-dirty', dirtyKeys.indexOf('-gardenReport') !== -1, JSON.stringify(dirtyKeys));
  ok('שורת החיווי הוסרה', !q(c1, '.gd-progress'));
  ok('נווטנו חזרה לרשימה (התושב נשאר בטופס)', navigations.indexOf('resGarden') !== -1,
     JSON.stringify(navigations));

  /* ================================================================= */
  section('3. התושב עובר מסך באמצע — הבקשה ממשיכה, בלי לגרור אותו חזרה');
  const c2 = mkContainer();
  window.CBA.screens.resGardenNew.render(c2);
  await wait(30);
  progressTicks = [40]; tickGap = 5;
  serverDelay = 120;
  nextResult = { ok: true, id: 202 };
  toasts = []; navigations.length = 0;
  await fillAndSend(c2);
  await wait(15);
  // מדמים מעבר מסך: ה-container נכתב מחדש, הכפתור מתנתק מה-DOM
  c2.innerHTML = '<div>מסך אחר</div>';
  await wait(200);
  ok('הבקשה הסתיימה למרות מעבר המסך', toasts.some(t => /202/.test(t)), JSON.stringify(toasts));
  ok('⚠️ לא נגררנו חזרה לרשימת הדיווחים', navigations.indexOf('resGarden') === -1,
     JSON.stringify(navigations));

  /* ================================================================= */
  section('4. כישלון בזמן שהתושב במסך — הטופס נשאר, הודעה רגילה');
  const c3 = mkContainer();
  window.CBA.screens.resGardenNew.render(c3);
  await wait(30);
  progressTicks = [50]; tickGap = 5;
  serverDelay = 40;
  nextResult = { ok: false, error: 'תפוס — נסה שוב' };
  toasts = []; navigations.length = 0;
  await fillAndSend(c3, { desc: 'בדיקת כישלון' });
  await wait(150);
  ok('הוצגה הודעת שגיאה', !!window.document.querySelector('.cba-dlg-backdrop'));
  const dlgTxt = (window.document.querySelector('.cba-dlg-backdrop') || {}).textContent || '';
  ok('ההודעה כוללת את סיבת השרת', /תפוס/.test(dlgTxt), dlgTxt.slice(0, 80));
  ok('לא נווטנו לשום מקום', navigations.length === 0, JSON.stringify(navigations));
  ok('הכפתור שוחרר וחזר להיות לחיץ', q(c3, '#gd-send') && !q(c3, '#gd-send').disabled);
  ok('שורת החיווי הוסרה', !q(c3, '.gd-progress'));
  // סוגרים את הדיאלוג
  const okBtn = window.document.querySelector('[data-dlg="ok"]');
  if (okBtn) okBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);

  /* ================================================================= */
  section('5. כישלון בזמן שהתושב במקום אחר — הצעת ניסיון חוזר');
  const c4 = mkContainer();
  window.CBA.screens.resGardenNew.render(c4);
  await wait(30);
  progressTicks = [30]; tickGap = 5;
  serverDelay = 100;
  nextResult = { ok: false, error: 'שגיאת רשת' };
  toasts = []; navigations.length = 0; posted.length = 0;
  await fillAndSend(c4, { desc: 'דיווח שנכשל', place: 'מגרש המשחקים' });
  const refOnFirstTry = posted.length ? posted[0].payload.clientRef : null;
  ok('נשלח מזהה שליחה', !!refOnFirstTry, String(refOnFirstTry));
  await wait(15);
  c4.innerHTML = '<div>מסך אחר</div>';       // עבר מסך
  await wait(200);
  const back = window.document.querySelector('.cba-dlg-backdrop');
  ok('נפתחה חלונית ניסיון חוזר', !!back);
  const backTxt = back ? back.textContent : '';
  ok('החלונית מבטיחה שהתוכן נשמר', /נשמר/.test(backTxt), backTxt.slice(0, 90));
  ok('יש כפתור "נסה שוב"', /נסה שוב/.test(backTxt), backTxt.slice(0, 90));
  ok('לא נגררנו למסך אחר', navigations.length === 0, JSON.stringify(navigations));

  // לוחצים "לא עכשיו" — הדיווח נשאר שמור
  const cancelBtn = window.document.querySelector('[data-dlg="cancel"]');
  ok('קיים כפתור ביטול', !!cancelBtn);
  if (cancelBtn) cancelBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(300);

  /* ================================================================= */
  section('6. חזרה לטופס — הדיווח משוחזר');
  const c5 = mkContainer();
  toasts = [];
  window.CBA.screens.resGardenNew.render(c5);
  await wait(40);
  ok('התיאור שוחזר', q(c5, '#gd-desc').value === 'דיווח שנכשל', q(c5, '#gd-desc').value);
  ok('המיקום המילולי שוחזר', q(c5, '#gd-place').value === 'מגרש המשחקים', q(c5, '#gd-place').value);
  ok('הטלפון שוחזר', q(c5, '#gd-phone').value === '050-1234567', q(c5, '#gd-phone').value);
  /* מחלקת הסימון בקוד הייצור היא "on" (לא "is-on") — נבדק מול ה-DOM האמיתי */
  ok('הקטגוריה סומנה חזרה',
     q(c5, '.gd-cat[data-c="דשא"]').classList.contains('on'),
     q(c5, '.gd-cat[data-c="דשא"]').className);
  ok('רק קטגוריה אחת מסומנת', q(c5, '.gd-cat.on') &&
     c5.querySelectorAll('.gd-cat.on').length === 1,
     String(c5.querySelectorAll('.gd-cat.on').length));
  ok('התושב קיבל הודעה שהדיווח שוחזר', toasts.some(t => /שחזרנו/.test(t)), JSON.stringify(toasts));

  // עכשיו שולחים שוב, והפעם מצליח
  progressTicks = [100];
  serverDelay = 40;
  nextResult = { ok: true, id: 303 };
  toasts = []; posted.length = 0; navigations.length = 0;
  q(c5, '#gd-send').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(200);
  ok('השליחה החוזרת הצליחה', toasts.some(t => /303/.test(t)), JSON.stringify(toasts));
  ok('נשלח התיאור המשוחזר ולא ריק',
     posted.length === 1 && posted[0].payload.desc === 'דיווח שנכשל',
     JSON.stringify(posted[0] && posted[0].payload.desc));
  /* ⚠️ הבדיקה שמונעת את הכפילות: אותו מזהה שליחה בדיוק, אחרת השרת
     יראה בשליחה החוזרת דיווח חדש לגמרי. */
  ok('⚠️ השליחה החוזרת נושאת את אותו מזהה שליחה',
     posted[0].payload.clientRef === refOnFirstTry,
     posted[0].payload.clientRef + ' vs ' + refOnFirstTry);

  /* ================================================================= */
  section('6ב. השרת עונה "כבר נשמר" — התושב מקבל את האמת');
  const c5b = mkContainer();
  window.CBA.screens.resGardenNew.render(c5b);
  await wait(40);
  progressTicks = [100]; tickGap = 5;
  serverDelay = 30;
  nextResult = { ok: true, duplicate: true, id: 5 };
  toasts = []; navigations.length = 0;
  await fillAndSend(c5b, { desc: 'שליחה שכבר נשמרה' });
  await wait(200);
  ok('ההודעה אומרת "כבר נשמר" ולא "נשלח"',
     toasts.some(t => /כבר נשמר/.test(t)) && !toasts.some(t => /הדיווח נשלח/.test(t)),
     JSON.stringify(toasts));
  ok('המספר של הדיווח הקיים מוצג', toasts.some(t => /5/.test(t)), JSON.stringify(toasts));
  ok('התושב הוחזר לרשימת הדיווחים', navigations.indexOf('resGarden') !== -1,
     JSON.stringify(navigations));

  /* ================================================================= */
  section('6ג. טופס חדש מקבל מזהה שליחה חדש');
  const c5c = mkContainer();
  window.CBA.screens.resGardenNew.render(c5c);
  await wait(40);
  progressTicks = [100]; serverDelay = 30;
  nextResult = { ok: true, id: 900 };
  posted.length = 0; toasts = [];
  await fillAndSend(c5c, { desc: 'דיווח אחר לגמרי' });
  await wait(200);
  ok('⚠️ מזהה שונה מזה של הדיווח הקודם',
     posted.length === 1 && posted[0].payload.clientRef !== refOnFirstTry,
     posted[0] && posted[0].payload.clientRef);

  /* ================================================================= */
  section('7. אחרי הצלחה — הטופס הבא נקי');
  const c6 = mkContainer();
  toasts = [];
  window.CBA.screens.resGardenNew.render(c6);
  await wait(40);
  ok('התיאור ריק', q(c6, '#gd-desc').value === '', q(c6, '#gd-desc').value);
  ok('המיקום ריק', q(c6, '#gd-place').value === '', q(c6, '#gd-place').value);
  ok('בלי הודעת שחזור', !toasts.some(t => /שחזרנו/.test(t)), JSON.stringify(toasts));

  /* ================================================================= */
  section('8. רגרסיה — המאזין שהפיל את הבקשה לא חזר');
  /* ⚠️ הבדיקה הכי חשובה בקובץ הזה. מאזין על xhr.upload מוציא את הבקשה
     מהגדרת "בקשה פשוטה", הדפדפן שולח preflight מסוג OPTIONS,
     Apps Script לא יודע לענות לו, והבקשה נופלת עם onerror. נמדד ממקור
     חיצוני 14.9.26: 3/3 נכשלו עם מאזין, 3/3 הצליחו בלעדיו.
     ⚠️ בדיקה מתוך script.google.com **לא** תתפוס את זה (same-origin). */
  const sheetsSrc = fs.readFileSync(path.join(APP, 'js/data/sheets.js'), 'utf8');
  const codeOnly = sheetsSrc
    .replace(/\/\*[\s\S]*?\*\//g, '')      // בלוקי הערות
    .replace(/^\s*\/\/.*$/gm, '');         // הערות שורה
  ok('⚠️ אין רישום מאזין על xhr.upload בקוד עצמו',
     !/xhr\s*\.\s*upload\s*\.\s*on\w+\s*=/.test(codeOnly) &&
     !/addEventListener/.test(codeOnly.split('xhr.upload')[1] || ''),
     (codeOnly.match(/.*xhr\s*\.\s*upload.*/g) || []).join(' | ') || 'clean');
  ok('postReadProgress עדיין קיים (ההגנה מ-beforeunload לא הוסרה)',
     /function postReadProgress/.test(codeOnly));
  ok('הגנת beforeunload עדיין שם', /addEventListener\("beforeunload"/.test(codeOnly));
  ok('תם-הזמן של 90 שניות עדיין שם', /xhr\.timeout\s*=\s*90000/.test(codeOnly));

  section('9. תקינות כללית');
  ok('אפס שגיאות JS לאורך כל הריצה', jsErrors.length === 0, JSON.stringify(jsErrors));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
