/* הרצה:  cd tools && node test-phase42.js   (דורש jsdom: npm i jsdom)
   מארז בדיקות ל-PHASE 4.2 — החזרה לאחור בתנועות, וצפייה בתמונות הדיווח.
   טוען את dataService.js / dialog.js / photos.js האמיתיים מול שרת מדומה. */
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
/* ⚠️ **לא** לדרוס את atob/btoa/Blob הגלובליים של Node במימושים של jsdom:
   המימוש של jsdom נשען עליהם בעצמו, והדריסה שברה את atob לגמרי ("invalid
   characters" על base64 תקין) — כלומר הבדיקה נכשלה על קוד ייצור תקין. */
/* jsdom אינו מממש createObjectURL/revokeObjectURL. זו מגבלת הסביבה ולא פער
   בקוד (אותו מסלול בדיוק כבר חי בייצור עבור הקבלות) — אז משלימים אותן, כדי
   שהבדיקה תבדוק את הלוגיקה שלנו ולא את jsdom. */
let blobSeq = 0;
const revoked = [];
if (!window.URL.createObjectURL) {
  window.URL.createObjectURL = () => 'blob:test/' + (++blobSeq);
  window.URL.revokeObjectURL = u => revoked.push(u);
}

window.CBA = { esc: s => String(s == null ? '' : s) };

// --- שרת מדומה: מתעד כל push ומאפשר לקבוע את התשובה ---
const sent = [];
let nextPush = { ok: true };
const gets = [];
let nextGet = null;
window.CBA.sheets = {
  isConnected: () => true,
  push: (action, payload, cb) => { sent.push({ action, payload }); setTimeout(() => cb && cb(nextPush), 0); },
  get: (q, cb) => { gets.push(q); setTimeout(() => cb(nextGet), 0); },
  postRead: (a, p, cb) => setTimeout(() => cb({ ok: true }), 0),
  markDirty() {}, clearDirty() {}, registerFlush() {}
};
let toasts = [], redraws = 0;
window.CBA.redraw = () => { redraws++; };

window.CBA.mock = {
  _source: 'sheets',
  transactions: [],
  years: {}, categories: [], groups: [], income: [], settings: {}, notesLog: []
};

const run = f => window.eval(fs.readFileSync(path.join(APP, f), 'utf8'));
run('js/ui/dialog.js');
run('js/ui/photos.js');
/* ⚠️ הריגול על הטוסט חייב לקרות **אחרי** dialog.js: הקובץ הזה מחליף את
   CBA.ui כולו, וסטאב שנקבע לפניו נמחק בשקט (וזה בדיוק מה שקרה בהרצה
   הראשונה — הבדיקה נכשלה על קוד תקין). */
const realToast = window.CBA.ui.toast;
window.CBA.ui.toast = (m, k) => { toasts.push({ m, k }); };
run('js/data/dataService.js');

const wait = ms => new Promise(r => setTimeout(r, ms));
const D = () => window.CBA.data;
const txIds = () => window.CBA.mock.transactions.map(t => t.id).join(',');

(async function () {
  section('1. מחיקה שנדחתה — השורה חוזרת למקומה');
  window.CBA.mock.transactions = [
    { id: 1, year: '2026', amount: 10, supplier: 'א' },
    { id: 2, year: '2026', amount: 20, supplier: 'ב' },
    { id: 3, year: '2026', amount: 30, supplier: 'ג' }
  ];
  toasts = []; redraws = 0; sent.length = 0;
  nextPush = { ok: false, error: 'אין הרשאה' };
  D().deleteTransaction(2);
  ok('נעלמה מיד מהמסך (אופטימי)', txIds() === '1,3', txIds());
  await wait(30);
  ok('הוחזרה אחרי דחייה', txIds() === '1,2,3', txIds());
  ok('חזרה למקום המקורי ולא לסוף', window.CBA.mock.transactions[1].id === 2);
  ok('המשתמש קיבל הודעה', toasts.length === 1 && /לא בוצעה/.test(toasts[0].m), JSON.stringify(toasts));
  ok('ההודעה כוללת את סיבת השרת', /אין הרשאה/.test(toasts[0].m));
  ok('המסך צויר מחדש', redraws === 1);

  section('2. מחיקה שהצליחה — לא נוגעים בכלום');
  toasts = []; redraws = 0;
  nextPush = { ok: true };
  D().deleteTransaction(2);
  await wait(30);
  ok('נשארה מחוקה', txIds() === '1,3', txIds());
  ok('בלי הודעת שגיאה', toasts.length === 0);
  ok('בלי ציור מיותר', redraws === 0);

  section('3. עדכון שנדחה — רק השדות ששונו חוזרים');
  window.CBA.mock.transactions = [{ id: 5, year: '2026', amount: 100, supplier: 'ספק', status: 'submitted', buyer: 'דנה' }];
  toasts = []; nextPush = { ok: false, error: 'שנה נעולה' };
  D().updateTransaction(5, { status: 'paid', amount: 250 });
  const mid = window.CBA.mock.transactions[0];
  ok('השינוי מוצג מיד', mid.status === 'paid' && mid.amount === 250);
  await wait(30);
  const after = window.CBA.mock.transactions[0];
  ok('הסטטוס הוחזר', after.status === 'submitted', after.status);
  ok('הסכום הוחזר', after.amount === 100, String(after.amount));
  ok('שדה שלא נגענו בו לא נפגע', after.buyer === 'דנה' && after.supplier === 'ספק');
  ok('נשלחה הודעה', toasts.length === 1 && /לא נשמר/.test(toasts[0].m), JSON.stringify(toasts));

  section('4. עדכון שנדחה אחרי שהשורה נמחקה — לא מחייה אותה');
  window.CBA.mock.transactions = [{ id: 7, year: '2026', amount: 1, status: 'submitted' }];
  toasts = []; nextPush = { ok: false, error: 'x' };
  D().updateTransaction(7, { status: 'paid' });
  window.CBA.mock.transactions = [];          // נמחקה בינתיים
  await wait(30);
  ok('לא הוחזרה לרשימה', window.CBA.mock.transactions.length === 0);
  ok('בלי הודעה מבלבלת', toasts.length === 0, JSON.stringify(toasts));

  section('5. הוספה שנדחתה — השורה יורדת מהמסך');
  window.CBA.mock.transactions = [{ id: 1, year: '2026', amount: 5 }];
  toasts = []; sent.length = 0; nextPush = { ok: false, error: 'נדחה' };
  const added = D().addTransaction({ supplier: 'חדש', amount: 90, month: 'ספטמבר', categoryId: 'x' });
  ok('מופיעה מיד', window.CBA.mock.transactions.length === 2);
  ok('נשלחה כ-saveTransaction', sent.length === 1 && sent[0].action === 'saveTransaction', JSON.stringify(sent[0]));
  await wait(30);
  ok('הוסרה אחרי דחייה', window.CBA.mock.transactions.length === 1, txIds());
  ok('הודעה למשתמש', toasts.length === 1 && /לא נשמרה/.test(toasts[0].m), JSON.stringify(toasts));

  section('6. לא מחוברים לגיליון — בלי שליחה ובלי החזרה');
  window.CBA.mock._source = 'mock';
  window.CBA.mock.transactions = [{ id: 9, amount: 1 }];
  toasts = []; sent.length = 0;
  D().deleteTransaction(9);
  await wait(30);
  ok('נמחקה מקומית', window.CBA.mock.transactions.length === 0);
  ok('שום דבר לא נשלח', sent.length === 0);
  ok('בלי הודעת שגיאה', toasts.length === 0);
  window.CBA.mock._source = 'sheets';

  section('7. תמונות הדיווח — שליפה דרך הפעולה הנכונה');
  gets.length = 0;
  nextGet = { ok: true, dataBase64: window.btoa('xx'), mimeType: 'image/jpeg', name: 'a.jpg' };
  let got = null;
  D().getGardenPhoto('abcdefghij12', r => { got = r; });
  await wait(30);
  ok('נקראה action=gardenPhoto', gets.length === 1 && gets[0].action === 'gardenPhoto', JSON.stringify(gets[0]));
  ok('הוחזרה כתובת להצגה', got && got.ok && /^blob:/.test(got.url), JSON.stringify(got));
  gets.length = 0;
  D().getGardenPhoto('abcdefghij12', r => { got = r; });
  await wait(30);
  ok('קריאה שנייה מגיעה מהמטמון', gets.length === 0);

  section('8. מזהה ריק ותשובת שגיאה');
  let bad = null;
  D().getGardenPhoto('', r => { bad = r; });
  ok('מזהה ריק נדחה מיד', bad && bad.ok === false);
  gets.length = 0; nextGet = { ok: false, error: 'אין לך הרשאה לצפות בתמונה הזו' };
  let denied = null;
  D().getGardenPhoto('zzzzzzzzzz99', r => { denied = r; });
  await wait(30);
  ok('שגיאת הרשאה עוברת למשתמש', denied && denied.ok === false && /הרשאה/.test(denied.error));
  gets.length = 0;
  D().getGardenPhoto('zzzzzzzzzz99', r => { denied = r; });
  await wait(30);
  ok('כישלון לא נכנס למטמון', gets.length === 1);

  section('9. החלונית של התמונות');
  nextGet = { ok: true, dataBase64: window.btoa('yy'), mimeType: 'image/jpeg', name: 'b.jpg' };
  window.CBA.photos.open(['aaaaaaaaaa11', 'bbbbbbbbbb22'], 'תמונות הדיווח');
  await wait(40);
  ok('נפתחה חלונית', !!document.querySelector('.cba-dlg-backdrop'));
  ok('שתי משבצות', document.querySelectorAll('.ph-slot').length === 2);
  await wait(60);
  ok('שתי התמונות נטענו', document.querySelectorAll('.ph-img').length === 2,
     String(document.querySelectorAll('.ph-img').length));
  document.querySelector('[data-dlg="ok"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  await wait(260);
  ok('נסגרה', !document.querySelector('.cba-dlg-backdrop'));
  window.CBA.photos.open([], 'ריק');
  await wait(30);
  ok('רשימה ריקה לא פותחת כלום', !document.querySelector('.cba-dlg-backdrop'));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
