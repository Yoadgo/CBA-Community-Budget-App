/* דגלים שלא נקראו ≠ דגלים כבויים (4.10.26 — דין לא הצליח לסגור תקלות).
   מריץ את js/data/firebase.js האמיתי מול Firebase מדומה.
   הרצה:  node tools/test-flags-fallback-2026-10-04.js */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/data/firebase.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function boot(opts) {
  const store = Object.assign({}, opts.store || {});
  const marks = [];
  let calls = 0;
  const ctx = {
    console: { log() {} }, setTimeout, clearTimeout, Date, JSON, Object, Error,
    localStorage: opts.blockStorage
      ? { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } }
      : { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    document: { head: { appendChild(s) { setTimeout(() => s.onload(), 0); } }, createElement: () => ({}) },
    firebase: {
      apps: [1],
      auth() { return { onAuthStateChanged() {}, currentUser: null }; },
      firestore() {
        return { collection: () => ({ doc: () => ({ get: () => { calls++; return opts.get(calls); } }) }) };
      }
    }
  };
  ctx.window = ctx;
  ctx.CBA = { diag: { mark: m => marks.push(m) } };
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  return { fb: ctx.CBA.fb, store, marks, calls: () => calls };
}
const okDoc = data => Promise.resolve({ exists: true, data: () => data });
const denied = () => Promise.reject({ code: 'permission-denied' });
const ensureDb = fb => new Promise(r => fb.ensureDb(r));
const LIVE = { gardenWritesFromBrowser: true, gymWriteFs: true, someCount: 3 };

(async () => {
  console.log('\n1. קריאה מוצלחת — כמו קודם, ונשמר העתק (בוליאנים בלבד)');
  {
    const t = boot({ get: () => okDoc(LIVE) });
    await ensureDb(t.fb);
    ok('הדגל החי נקרא', t.fb.flag('gardenWritesFromBrowser', false) === true);
    const saved = JSON.parse(t.store.cba_flags_last_v1 || '{}').f || {};
    ok('העתק נשמר', saved.gardenWritesFromBrowser === true && saved.gymWriteFs === true);
    ok('ערך שאינו בוליאני לא נשמר', !('someCount' in saved));
  }

  console.log('\n2. 🔴 הקריאה נכשלת, יש העתק — לא נופלים לברירת המחדל שבקוד (המקרה של דין)');
  {
    const t = boot({ get: denied, store: { cba_flags_last_v1: JSON.stringify({ t: 1, f: { gardenWritesFromBrowser: true } }) } });
    await ensureDb(t.fb);
    ok('gardenWritesFromBrowser = true מההעתק', t.fb.flag('gardenWritesFromBrowser', false) === true);
    ok('נרשם סימון אבחון', t.marks.some(m => /דגלים לא נקראו/.test(m) && /העתק/.test(m)), t.marks.join(' | '));
  }

  console.log('\n3. נכשל בלי העתק — ברירת המחדל (כמו קודם), ואז ניסיון חוזר מצליח');
  {
    const t = boot({ get: n => (n === 1 ? denied() : okDoc(LIVE)) });
    await ensureDb(t.fb);
    ok('בלי העתק — ברירת המחדל', t.fb.flag('gardenWritesFromBrowser', false) === false);
    ok('לא מנסים שוב מיד (פחות מ-20 שניות)', t.calls() === 1, 'calls=' + t.calls());
    /* מזיזים את השעון 21 שניות קדימה */
    const realNow = Date.now; const base = realNow();
    Date.now = () => base + 21000;
    t.fb.flag('gardenWritesFromBrowser', false);   // מפעיל ניסיון חוזר ברקע
    await sleep(5);
    ok('ניסיון חוזר יצא', t.calls() === 2, 'calls=' + t.calls());
    ok('אחרי הניסיון החוזר — הערך החי', t.fb.flag('gardenWritesFromBrowser', false) === true);
    t.fb.flag('x', false); await sleep(5);
    ok('אחרי הצלחה — אין עוד ניסיונות', t.calls() === 2, 'calls=' + t.calls());
    Date.now = realNow;
  }

  console.log('\n4. מתג כיבוי חי גובר על העתק ישן');
  {
    const t = boot({ get: () => okDoc({ gardenWritesFromBrowser: false }),
                     store: { cba_flags_last_v1: JSON.stringify({ t: 1, f: { gardenWritesFromBrowser: true } }) } });
    await ensureDb(t.fb);
    ok('הערך החי (false) הוא הקובע', t.fb.flag('gardenWritesFromBrowser', true) === false);
  }

  console.log('\n5. localStorage חסום (גלישה פרטית) — לא נשבר כלום');
  {
    const t2 = boot({ get: denied, blockStorage: true });
    await ensureDb(t2.fb);
    ok('קריאה שנכשלה — ברירת מחדל, בלי חריגה', t2.fb.flag('gardenWritesFromBrowser', false) === false);
    const t3 = boot({ get: () => okDoc(LIVE), blockStorage: true });
    await ensureDb(t3.fb);
    ok('קריאה שהצליחה — הערך החי למרות שאי-אפשר לשמור', t3.fb.flag('gardenWritesFromBrowser', false) === true);
  }

  console.log('\n' + (fail ? '✗ ' + fail + ' נכשלו, ' : '') + pass + ' עברו');
  process.exit(fail ? 1 : 0);
})();
