/* גל 11 (30.9.26) — הוצאות: מקור/משפחה במגירה, "?" על "הועבר להנה"ח",
   ויישור דוחות ההשוואה לשנה קודמת ל-BUB1/BUB2.
   הרצה:  node tools/test-budget-tx-wave11-2026-09-30.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const EX = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'expenses.js'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

function env(opts) {
  opts = opts || {};
  const log = [], toasts = [];
  const sb = { console: { log() {}, error() {}, warn() {} } };
  sb.window = sb;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb.document = { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                  createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                  head: { appendChild() {} }, body: { appendChild() {} }, hidden: false };
  sb.navigator = { onLine: true }; sb.addEventListener = () => {}; sb.location = { href: 'https://x/' };
  const years = opts.years || { 'תשפ"ז': { categories: [], transactions: (opts.rows || []).slice(), income: [] } };
  const mock = { years: years, yearList: Object.keys(years), currentYear: opts.currentYear || 'תשפ"ז',
                 _settings: { 'שנה נוכחית': opts.currentYear || 'תשפ"ז' }, _source: 'sheets' };
  ['categories', 'transactions', 'income'].forEach(k => Object.defineProperty(mock, k, {
    get() { return mock.years[mock.currentYear][k]; },
    set(v) { mock.years[mock.currentYear][k] = v; }, configurable: true }));
  sb.CBA = {
    esc: s => String(s), isSuper: true, perms: ['תקציב'], user: { familyId: '1' },
    mock: mock,
    sheets: { markDirty() {}, clearDirty() {}, dropTxCache() {},
              get: (p, cb) => { log.push('get:' + p.action); cb && cb({ ok: true }); },
              push: (a, p, cb) => { log.push('push:' + a); sb.__push = p; if (cb) cb({ ok: true }); },
              isConnected: () => true },
    ui: { toast: (m) => toasts.push(m) },
    fb: {
      authReady: cb => cb({ uid: 'u' }),
      userReady: cb => cb({ uid: 'u' }),
      ensureDb: cb => cb(null),
      flag: (k, d) => (opts.flags && k in opts.flags) ? opts.flags[k] : d,
      serverNow: () => 'SERVER_TS',
      nextId: (key, cb) => cb(null, 99),
      createDoc: (c, id, data, cb) => { log.push('create:' + id); cb(null); },
      mergeDoc: (c, id, f, cb) => { log.push('merge:' + id); sb.__patch = f; cb(opts.writeErr || null); },
      deleteDoc: (c, id, cb) => { log.push('delete:' + id); cb(null); },
      updateDoc: (c, id, f, cb) => { log.push('update:' + id); sb.__upd = f; cb(null); }
    }
  };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  return { sb, log, toasts, D: sb.CBA.data };
}
const wait = () => new Promise(r => setTimeout(r, 30));
const FS_ON = { budgetTxFromFirestore: true, budgetTxStatusToFirestore: true };
const row = (o) => Object.assign({ id: 7, year: 'תשפ"ז', status: 'submitted', amount: 10, familyId: '3',
                                   source: 'admin', supplier: 'ס' }, o || {});

(async () => {

section('1. EXB2 — מקור ומשפחה נשמרים במסלול Firestore');
{
  const e = env({ flags: FS_ON, rows: [row()] });
  e.D.updateTransaction(7, { supplier: 'חדש', source: 'admin', familyId: '3' });   // בלי שינוי
  await wait();
  const p = e.sb.__patch || {};
  ok('בלי שינוי במקור/משפחה — merge כמו קודם', e.log.indexOf('merge:תשפ"ז__7') !== -1, JSON.stringify(e.log));
  ok('🔴 והמסמך הנשלח זהה לקודם (בלי שדות בעלות)',
     !('מקור' in p) && !('מזהה משפחה' in p) && !('familyId' in p), JSON.stringify(Object.keys(p)));
}
{
  const e = env({ flags: FS_ON, rows: [row()] });
  e.D.updateTransaction(7, { source: 'resident', familyId: '3' });
  await wait();
  const p = e.sb.__patch || {};
  ok('🔴 שינוי מקור → "מקור" במסמך', p['מקור'] === 'תושב', JSON.stringify(p));
  ok('ושני שדות המשפחה נוסעים יחד', p['מזהה משפחה'] === '3' && p.familyId === '3', JSON.stringify(p));
  ok('🔴 ולא סטטוס', !('סטטוס' in p) && !('statusPending' in p));
}
{
  const e = env({ flags: FS_ON, rows: [row()] });
  e.D.updateTransaction(7, { familyId: '12', buyer: 'משפחה 12' });
  await wait();
  const p = e.sb.__patch || {};
  ok('🔴 שינוי משפחה 3→12 → במסמך', p['מזהה משפחה'] === '12' && p.familyId === '12', JSON.stringify(p));
}
{
  /* הכללים הנוכחיים דוחים שדה בעלות שהשתנה — הכתיבה כולה נדחית → Apps Script */
  const e = env({ flags: FS_ON, writeErr: { code: 'permission-denied' }, rows: [row()] });
  e.D.updateTransaction(7, { familyId: '12', source: 'resident', amount: 55 });
  await wait();
  ok('🔴 דחיית הכלל → נפילה ל-saveTransaction', e.log.indexOf('push:saveTransaction') !== -1, JSON.stringify(e.log));
  const tx = (e.sb.__push || {}).tx || {};
  ok('והשורה המלאה נשלחת עם המשפחה, המקור והסכום', tx.familyId === '12' && tx.source === 'resident' && tx.amount === 55,
     JSON.stringify(tx));
  ok('והמסך לא הוחזר (השרת אישר)', e.sb.CBA.mock.transactions[0].familyId === '12');
}
{
  const e = env({ flags: FS_ON, rows: [row({ familyId: '' , buyer: 'שם ישן' })] });
  e.D.updateTransaction(7, { familyId: '12', buyer: 'משפחה 12' });
  await wait();
  ok('🔴 "בלי משפחה" → משפחה: ישר ל-Apps Script (השרת מוריד את שם הרוכש השמור)',
     e.log.indexOf('push:saveTransaction') !== -1 && !e.log.some(x => x.indexOf('merge:') === 0), JSON.stringify(e.log));
}
{
  const e = env({ flags: FS_ON, rows: [row({ familyId: '12' })] });
  e.D.updateTransaction(7, { familyId: '', buyer: 'הוקלד ידנית' });
  await wait();
  ok('ומשפחה → "בלי משפחה": גם ישר ל-Apps Script',
     e.log.indexOf('push:saveTransaction') !== -1 && !e.log.some(x => x.indexOf('merge:') === 0), JSON.stringify(e.log));
}
{
  const i = RULES.indexOf('function txDetailsUpdateOk(');
  const rf = RULES.slice(i, RULES.indexOf('\n    }', i));
  const has = ['מקור', 'מזהה משפחה', 'familyId'].map(k => rf.indexOf("'" + k + "'") !== -1);
  ok('🔴 בכלל — שלושת שדות הבעלות כולם או אף אחד (אחרת familyId ו"מזהה משפחה" נפרדים)',
     has.every(Boolean) || !has.some(Boolean), JSON.stringify(has));
  const m = DS.match(/var TX_OWNER_FIELDS = \[([\s\S]*?)\];/);
  const cl = (m ? m[1].match(/"[^"]+"/g) || [] : []).map(x => x.slice(1, -1));
  ok('ורשימת הבעלות בלקוח היא בדיוק שלושת השדות', cl.join('|') === 'מקור|מזהה משפחה|familyId', cl.join('|'));
  ok('🔴 וכולם מותרים ב-txAllowedFields (המסמך עצמו חוקי)', cl.every(k => {
    const a = RULES.indexOf('function txAllowedFields(');
    return RULES.slice(a, RULES.indexOf('\n    }', a)).indexOf("'" + k + "'") !== -1;
  }));
}

section('2. "?" — בדיקה על "הועבר להנה"ח" לא מתהפכת בשקט');
{
  const e = env({ flags: FS_ON, rows: [row({ status: 'ready' })] });
  e.D.updateTransaction(7, { status: 'review', reviewNote: 'חסר' });
  await wait();
  const t = e.sb.CBA.mock.transactions[0];
  ok('🔴 אין כתיבת סטטוס לא-חוקית ל-Firestore', !e.log.some(x => x.indexOf('update:') === 0), JSON.stringify(e.log));
  ok('🔴 הסטטוס חזר מיד ל"הועבר להנה"ח" (לא בשקט ברענון)', t.status === 'ready' && !t.reviewNote, t.status);
  ok('🔴 והמשתמש קיבל הודעה', e.toasts.length === 1 && /לא נשמר/.test(e.toasts[0]), JSON.stringify(e.toasts));
}
{
  const e = env({ flags: FS_ON, rows: [row({ status: 'submitted' })] });
  e.D.updateTransaction(7, { status: 'review', reviewNote: 'חסר' });
  await wait();
  ok('הוגשה → בבדיקה עדיין בתיבת הדואר (updateDoc)', e.log.indexOf('update:תשפ"ז__7') !== -1 && !e.toasts.length,
     JSON.stringify(e.log));
}
{
  const e = env({ flags: { budgetTxFromFirestore: false }, rows: [row({ status: 'ready' })] });
  e.sb.CBA.mock._txFsOn = false;
  e.D.updateTransaction(7, { status: 'review', reviewNote: 'חסר' });
  await wait();
  ok('כתיבה ל-Firestore כבויה → השורה כולה ל-Apps Script, כמו קודם',
     e.log.indexOf('push:saveTransaction') !== -1 && e.sb.CBA.mock.transactions[0].status === 'review', JSON.stringify(e.log));
}
{
  const e = env({ flags: FS_ON, rows: [row({ status: 'review', reviewNote: 'ישן' })] });
  e.D.updateTransaction(7, { supplier: 'ס', reviewNote: 'חדש' });
  await wait();
  ok('עריכת הערת בדיקה בלבד → Apps Script (אף ענף בכלל לא מתיר אותה)',
     e.log.indexOf('push:saveTransaction') !== -1 && !e.log.some(x => x.indexOf('merge:') === 0), JSON.stringify(e.log));
}
{
  /* txCanReview מתוך expenses.js */
  const a = EX.indexOf('function txCanReview(');
  const src = EX.slice(a, EX.indexOf('\n}', a) + 2);
  const sb = { CBA: { mock: {} } }; vm.createContext(sb); vm.runInContext(src, sb);
  ok('"?" על הוגשה', sb.txCanReview({ status: 'submitted' }) === true);
  ok('🔴 אין "?" על "הועבר להנה"ח" כשהכתיבה ל-Firestore', sb.txCanReview({ status: 'ready' }) === false);
  sb.CBA.mock._txFsOn = false;
  ok('ויש, כשהכתיבה ל-Firestore כבויה (השרת שומר כל מעבר)', sb.txCanReview({ status: 'ready' }) === true);
  ok('אין על בבדיקה/שולם/נדחה', ['review', 'paid', 'rejected'].every(s => !sb.txCanReview({ status: s })));
  ok('שני המקומות (שורה + מובייל) משתמשים בפונקציה',
     (EX.match(/const canReview = txCanReview\(t\);/g) || []).length === 2);
}

section('3. דוחות — סך הביצוע זהה במסך התקציב, ב-getYearRows ובגרף ההשוואה');
function yearsFixture() {
  const cats = [{ id: 'a', name: 'א', plan: 1000, group: 'g' }, { id: 'b', name: 'ב', plan: 500, group: 'g' }];
  return {
    'תשפ"ו': {
      categories: cats.map(c => Object.assign({}, c)), income: [],
      transactions: [
        { id: 1, status: 'paid', amount: 100, categoryId: 'a', month: '2025-10' },
        { id: 2, status: 'ready', amount: 40, categoryId: '', month: '2025-12' },      // ללא סעיף
        { id: 3, status: 'paid', amount: 25, categoryId: 'deleted', month: '2026-03' }, // סעיף שנמחק
        { id: 4, status: 'ready', amount: 70, categoryId: 'b', month: '2026-09' },      // אחרי סוף השנה (BUB2)
        { id: 5, status: 'paid', amount: 9, categoryId: '', month: '2025-08' },         // לפני תחילתה
        { id: 6, status: 'submitted', amount: 999, categoryId: '', month: '2026-01' },  // לא נספר
        { id: 7, status: 'rejected', amount: 888, categoryId: 'a', month: '2026-01' }   // לא נספר
      ]
    },
    'תשפ"ז': {
      categories: cats.map(c => Object.assign({}, c)), income: [],
      transactions: [
        { id: 1, status: 'paid', amount: 300, categoryId: 'a', month: '2026-09' },
        { id: 2, status: 'ready', amount: 11, categoryId: '', month: '2026-11' }
      ]
    }
  };
}
for (const Y of ['תשפ"ו', 'תשפ"ז']) {
  const e = env({ years: yearsFixture(), currentYear: Y });
  const D = e.D;
  const screen = D.getSummary().totalActual;
  const rows = D.getYearRows(Y);
  const rowsTotal = rows.reduce((s, r) => s + r.actual, 0) + (rows.uncategorized ? rows.uncategorized.amount : NaN);
  const series = D.cumulativeSeriesFor(Y);
  const expected = Y === 'תשפ"ו' ? 100 + 40 + 25 + 70 + 9 : 311;
  ok(Y + ': מסך התקציב = ' + expected, screen === expected, String(screen));
  ok('🔴 ' + Y + ': getYearRows (סעיפים + ללא סעיף) = מסך התקציב', rowsTotal === screen, rowsTotal + ' ≠ ' + screen);
  ok('🔴 ' + Y + ': סוף cumulativeSeriesFor = מסך התקציב', series.actual[11] === screen, series.actual[11] + ' ≠ ' + screen);
  ok(Y + ': ו-cumulativeSeries של השנה הפעילה זהה', D.cumulativeSeries().actual[11] === screen);
  ok(Y + ': ללא סעיף בשורות = getUncategorizedSpent', rows.uncategorized.amount === D.getUncategorizedSpent().amount);
  ok(Y + ': שורות הסעיפים עצמן כמו getBudgetRows',
     JSON.stringify(rows.map(r => [r.id, r.actual, r.remaining, r.band])) ===
     JSON.stringify(D.getBudgetRows().map(r => [r.id, r.actual, r.remaining, r.band])));
}
{
  /* השנה הקודמת נקראת כשהפעילה היא אחרת — זה בדיוק מקרה "ההשוואה לשנה קודמת" */
  const e = env({ years: yearsFixture(), currentYear: 'תשפ"ז' });
  const s = e.D.cumulativeSeriesFor('תשפ"ו');
  ok('🔴 שנה קודמת (לא פעילה): סוף הקו כולל ללא-סעיף ואת החודשים שמחוץ לשנה', s.actual[11] === 244, String(s.actual[11]));
  ok('BUB2: הוצאה מ-2026-09 נכנסת לאוגוסט (החודש האחרון) ולא לפני', s.actual[10] === 174 && s.actual[11] === 244,
     JSON.stringify(s.actual));
  ok('BUB2: הוצאה מ-2025-08 נכנסת לספטמבר (החודש הראשון)', s.actual[0] === 9, JSON.stringify(s.actual));
  const r = e.D.getYearRows('תשפ"ו');
  ok('getYearRows לשנה קודמת: ללא סעיף = 74 (40+25+9)', r.uncategorized.amount === 74, String(r.uncategorized.amount));
  ok('getUncategorizedSpentFor לשנה שאינה קיימת → 0', e.D.getUncategorizedSpentFor('תש"ך').amount === 0);
  ok('getYearRows לשנה שאינה קיימת — עדיין מערך ריק', Array.isArray(e.D.getYearRows('תש"ך')) && !e.D.getYearRows('תש"ך').length);
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
})();
