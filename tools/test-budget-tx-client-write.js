/* בדיקות לכתיבת תנועות מהדפדפן (2026-09-15, צעד 09ב-3).
   הרצה:  node tools/test-budget-tx-client-write.js

   🔴 **שלושה כשלים שהמארז הזה קיים בשבילם, וכולם שקטים:**
     1. **מזהה מ-max+1 מקומי** — נכון רק כשיש כותב אחד. שניים שמזינים
        במקביל מקבלים אותו מספר, והשני דורס את הראשון.
     2. **`update` עם שם שדה שיש בו לוכסן** — "ספק/נמען" נכשל
        ב-`invalid-argument`, כי ה-SDK מפרש מפתח כנתיב שדה.
     3. **מסמך שלא תואם למה שהשרת כותב** — שני מסלולי כתיבה שיוצרים
        מסמכים שונים נפרדים בשקט בשינוי הפורמט הראשון. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const FB = fs.readFileSync(path.join(ROOT, 'js', 'data', 'firebase.js'), 'utf8');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');

/* ---------- סביבה ---------- */
function env(opts) {
  opts = opts || {};
  const log = [];
  const sb = { console: { log() {}, error() {}, warn() {} } };
  sb.window = sb;
  sb.setTimeout = setTimeout; sb.clearTimeout = clearTimeout;
  sb.setInterval = () => 0; sb.clearInterval = () => {};
  sb.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  sb.document = { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                  createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                  head: { appendChild() {} }, body: { appendChild() {} }, hidden: false };
  sb.navigator = { onLine: true }; sb.addEventListener = () => {}; sb.location = { href: 'https://x/' };
  sb.CBA = {
    esc: s => String(s), isSuper: true, perms: ['תקציב'], user: { familyId: '1' },
    mock: { transactions: (opts.rows || []).slice(), categories: [], years: {}, yearList: ['תשפ"ז'],
            currentYear: 'תשפ"ז', _settings: { 'שנה נוכחית': 'תשפ"ז' }, _source: 'sheets' },
    sheets: { markDirty() {}, clearDirty() {}, get: (p, cb) => { log.push('get:' + p.action); cb && cb({ ok: true }); },
              push: (a, p, cb) => { log.push('push:' + a); if (cb) cb(opts.pushFail ? { ok: false } : { ok: true }); },
              isConnected: () => true },
    ui: { toast() {} },
    fb: {
      authReady: cb => cb(opts.noUser ? null : { uid: 'u' }),
      ensureDb: cb => cb(opts.dbErr || null),
      flag: (k, d) => (opts.flags && k in opts.flags) ? opts.flags[k] : d,
      serverNow: () => 'SERVER_TS',
      nextId: (key, cb) => { log.push('nextId:' + key); cb(opts.idErr || null, opts.nextId || 99); },
      createDoc: (c, id, data, cb) => { log.push('create:' + id); sb.__doc = data; cb(opts.writeErr || null); },
      mergeDoc: (c, id, f, cb) => { log.push('merge:' + id); sb.__patch = f; cb(opts.writeErr || null); },
      deleteDoc: (c, id, cb) => { log.push('delete:' + id); cb(opts.writeErr || null); },
      updateDoc: (c, id, f, cb) => { log.push('update:' + id); cb(null); }
    }
  };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  return { sb, log, D: sb.CBA.data };
}
const wait = () => new Promise(r => setTimeout(r, 30));

(async () => {

section('1. 🔴 ברירת המחדל — הקוד עולה לייצור בלי לשנות התנהגות');
ok('🔴 הדגל כבוי בקוד', /var BUDGET_TX_FROM_FIRESTORE = false;/.test(DS));
/* 🔴🔴 והבדיקה שמונעת את החזרת המלכודת: הקבוע חייב להיות **ברירת מחדל
   שמועברת ל-flag()**, ולא קיצור שחוסם. עם קיצור, `flagSet` לעולם לא
   ידליק — וזו אותה מלכודת של `fsFirstRead`, הפוכה. */
ok('🔴🔴 ואין קיצור על הקבוע — אחרת flagSet לא יוכל להדליק',
   !/if \(!BUDGET_TX_FROM_FIRESTORE\) return/.test(DS));
ok('🔴 והקבוע מועבר כברירת מחדל ל-flag',
   /flag\("budgetTxFromFirestore", BUDGET_TX_FROM_FIRESTORE\)/.test(DS));
ok('והוא ברשימת הדגלים הסגורה בשרת',
   /'budgetTxFromFirestore'\]/.test(CODE) || CODE.indexOf("'budgetTxFromFirestore'") !== -1);
{
  const e = env({ flags: {} });
  e.D.addTransaction({ amount: 5, supplier: 'א' });
  await wait();
  ok('🔴 בלי הדגל — הכל עובר ב-Apps Script כמו קודם',
     e.log.indexOf('push:saveTransaction') !== -1 && !e.log.some(x => x.indexOf('create:') === 0),
     JSON.stringify(e.log));
}

section('2. הוספת תנועה דרך Firestore');
{
  const e = env({ flags: { budgetTxFromFirestore: true }, nextId: 42 });
  const row = e.D.addTransaction({ amount: 120, supplier: 'ספק', familyId: '3', month: '2026-09' });
  await wait();
  ok('🔴 המזהה מגיע מהמונה ולא מ-max+1', row.id === 42, String(row.id));
  ok('והמונה נשאל לפי השנה', e.log.indexOf('nextId:tx_תשפ"ז') !== -1, JSON.stringify(e.log));
  ok('המסמך נוצר תחת שנה__מזהה', e.log.indexOf('create:תשפ"ז__42') !== -1, JSON.stringify(e.log));
  ok('🔴 ולא עבר ב-Apps Script', !e.log.some(x => x.indexOf('push:') === 0), JSON.stringify(e.log));
  const d = e.sb.__doc;
  ok('הסכום נשמר כמספר', d['סכום'] === 120);
  ok('הסטטוס בעברית', d['סטטוס'] === 'הוגשה קבלה', d['סטטוס']);
  ok('המקור בעברית', d['מקור'] === 'מנהל', d['מקור']);
  ok('🔴 שני שדות המשפחה מסכימים', d.familyId === '3' && d['מזהה משפחה'] === '3');
  ok('🔴 והמסמך נולד בלי דגל ממתין', d.statusPending === false);
  ok('schema ו-updatedAt קיימים', d.schema === 2 && d.updatedAt === 'SERVER_TS');
  ok('🔴🔴 ואין בו "רוכש"', !('רוכש' in d), JSON.stringify(Object.keys(d)));
  ok('🔴 ושדה ריק אינו נכתב כלל — בדיוק כמו btxRow_ בשרת',
     !('בנק' in d) && !('תיאור' in d), JSON.stringify(Object.keys(d)));
}

section('3. 🔴 נפילה לאחור בכל נקודת כשל');
for (const [name, opt] of [['אין משתמש', { noUser: true }], ['כשל SDK', { dbErr: new Error('x') }],
                           ['כשל מונה', { idErr: new Error('no-counter') }], ['כשל כתיבה', { writeErr: new Error('denied') }]]) {
  const e = env(Object.assign({ flags: { budgetTxFromFirestore: true } }, opt));
  e.D.addTransaction({ amount: 5 });
  await wait();
  ok(name + ' → Apps Script', e.log.indexOf('push:saveTransaction') !== -1, JSON.stringify(e.log));
}

section('4. עריכת פרטים');
{
  const e = env({ flags: { budgetTxFromFirestore: true },
                  rows: [{ id: 7, year: 'תשפ"ז', status: 'submitted', amount: 10, familyId: '3', supplier: 'ישן' }] });
  e.D.updateTransaction(7, { supplier: 'חדש', amount: 20 });
  await wait();
  ok('🔴 השתמשנו ב-merge ולא ב-update', e.log.indexOf('merge:תשפ"ז__7') !== -1, JSON.stringify(e.log));
  const p = e.sb.__patch;
  ok('הפרטים עודכנו', p['ספק/נמען'] === 'חדש' && p['סכום'] === 20, JSON.stringify(p));
  ok('🔴🔴 והמסלול הזה אינו נוגע בסטטוס', !('סטטוס' in p), JSON.stringify(Object.keys(p)));
  ok('🔴 ולא במשפחה, בשנה או במזהה',
     !('מזהה משפחה' in p) && !('familyId' in p) && !('year' in p) && !('מזהה' in p),
     JSON.stringify(Object.keys(p)));
  ok('🔴 ולא ב-statusPending', !('statusPending' in p));
}
{
  /* שינוי סטטוס ממשיך במסלול תיבת הדואר של 09א, לא במסלול הפרטים. */
  const e = env({ flags: { budgetTxFromFirestore: true, budgetTxStatusToFirestore: true },
                  rows: [{ id: 7, year: 'תשפ"ז', status: 'submitted', amount: 10, familyId: '3' }] });
  e.D.updateTransaction(7, { status: 'ready' });
  await wait();
  ok('🔴 סטטוס → updateDoc (תיבת הדואר), לא merge',
     e.log.indexOf('update:תשפ"ז__7') !== -1 && !e.log.some(x => x.indexOf('merge:') === 0),
     JSON.stringify(e.log));
}

section('5. מחיקה');
{
  const e = env({ flags: { budgetTxFromFirestore: true },
                  rows: [{ id: 7, year: 'תשפ"ז', status: 'submitted', amount: 10, familyId: '3' }] });
  e.D.deleteTransaction(7);
  await wait();
  ok('נמחק מ-Firestore', e.log.indexOf('delete:תשפ"ז__7') !== -1, JSON.stringify(e.log));
  ok('🔴 ולא עבר ב-Apps Script', !e.log.some(x => x.indexOf('push:') === 0));
  ok('והוסר מהמסך', !e.sb.CBA.mock.transactions.some(t => t.id === 7));
}
{
  const e = env({ flags: { budgetTxFromFirestore: true }, writeErr: new Error('x'),
                  rows: [{ id: 7, year: 'תשפ"ז', status: 'submitted', amount: 10, familyId: '3' }] });
  e.D.deleteTransaction(7);
  await wait();
  ok('🔴 כשל מחיקה → נפילה לאחור ל-Apps Script',
     e.log.indexOf('push:deleteTransaction') !== -1, JSON.stringify(e.log));
}

section('6. 🔴 המסמך תואם לשרת ולכלל');
{
  const e = env({ flags: { budgetTxFromFirestore: true }, nextId: 1 });
  e.D.addTransaction({ amount: 1, supplier: 's', bankName: 'b', month: '2026-09', date: '2026-09-01',
                       categoryId: 'c', subItemId: 'si', expenseType: 'refund', description: 'd',
                       receiptUrl: 'u', reviewNote: 'r', familyId: '3' });
  await wait();
  const keys = Object.keys(e.sb.__doc);
  /* רשימת ההיתר של השרת */
  const sbx = { console, SUBMIT_DATE_HEADER: 'הוגש בתאריך' };
  vm.createContext(sbx);
  const a = CODE.indexOf('var BTX_ALLOWED_COLS');
  vm.runInContext(CODE.slice(a, CODE.indexOf('];', a) + 2), sbx);
  const META = ['year', 'familyId', 'statusPending', 'schema', 'updatedAt'];
  const bad = keys.filter(k => sbx.BTX_ALLOWED_COLS.indexOf(k) === -1 && META.indexOf(k) === -1);
  ok('🔴 כל שדה במסמך מותר גם בשרת', bad.length === 0, bad.join(', '));
  /* ורשימת ההיתר של הכלל */
  const i = RULES.indexOf('function txAllowedFields(');
  const rf = RULES.slice(i, RULES.indexOf('\n    }', i));
  const bad2 = keys.filter(k => rf.indexOf("'" + k + "'") === -1);
  ok('🔴 וכל שדה מותר גם בכלל האבטחה', bad2.length === 0, bad2.join(', '));
  /* ושדות החובה כולם שם */
  const j = RULES.indexOf('function txRequiredFields(');
  const req = (RULES.slice(j, RULES.indexOf('\n    }', j)).match(/'[^']+'/g) || []).map(x => x.slice(1, -1));
  const missing = req.filter(k => keys.indexOf(k) === -1);
  ok('🔴 וכל שדה חובה נכתב', missing.length === 0, missing.join(', '));
}
{
  /* שדות העריכה בלקוח מול הכלל */
  const i = RULES.indexOf('function txDetailsUpdateOk(');
  const rf = RULES.slice(i, RULES.indexOf('\n    }', i));
  const m = DS.match(/var TX_DETAIL_FIELDS = \[([\s\S]*?)\];/);
  const cl = (m ? m[1].match(/"[^"]+"/g) || [] : []).map(x => x.slice(1, -1));
  ok('רשימת שדות העריכה נקראה', cl.length > 5, String(cl.length));
  const bad = cl.filter(k => rf.indexOf("'" + k + "'") === -1);
  ok('🔴 כל שדה עריכה בלקוח מותר בכלל', bad.length === 0, bad.join(', '));
}

section('7. הגשר');
ok('createDoc / mergeDoc / deleteDoc נחשפים',
   /createDoc: createDoc,/.test(FB) && /mergeDoc: mergeDoc,/.test(FB) && /deleteDoc: deleteDoc,/.test(FB));
ok('🔴 mergeDoc באמת משתמש ב-set עם merge', /\.set\(fields \|\| \{\}, \{ merge: true \}\)/.test(FB));
ok('🔴 ולא ב-update — לוכסן בשם שדה שובר אותו',
   !/function mergeDoc[\s\S]{0,400}\.update\(/.test(FB));
ok('createDoc כותב מסמך מלא', /\.set\(data \|\| \{\}\)\s*\n/.test(FB));

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
})();
