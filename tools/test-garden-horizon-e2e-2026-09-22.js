/* מקצה לקצה: תוכנית → מנוע → משימות, בדפדפן ובשרת   (22.9.2026)
 * הרצה:  node tools/test-garden-horizon-e2e-2026-09-22.js
 *
 * מריץ את **הקוד האמיתי** — dataService.js, gardenRules.js, GardenHorizon.gs —
 * מול Firestore מדומה אחד שמשותף לדפדפן ולשרת. מה שנבדק:
 *   1. שמירת הגדרה מהאפליקציה מייצרת 8 שבועות של מופעים, מיד.
 *   2. "מהשבוע הבא" מקפיא את השבוע הנוכחי; "מהשבוע הנוכחי" לא.
 *   3. מחיקה/כיבוי מהתוכנית מורידים מופעים עתידיים שלא נגעו בהם.
 *   4. השרת (הטריגר) על אותם נתונים — אפס עבודה. שני הצדדים מסכימים.
 *   5. מחיקת משימה = דגל בדפדפן, הכרטיס נעלם מהקריאה, השרת מסיים.
 *   6. היומן נקרא מ-Firestore.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- Firestore מדומה, משותף ---------- */
const store = { gardenPlan: {}, gardenTasks: {}, gardenReports: {}, gardenLog: {}, gardenMeta: { lists: { areas: ['צפון', 'דרום'], categories: ['מדשאות'], freqs: [] } }, counters: { gardenTask: { n: 0 }, gardenReport: { n: 0 } } };
const clone = o => JSON.parse(JSON.stringify(o));
const NOW = new Date(2026, 8, 22, 10, 0, 0);

/* ---------- הדפדפן ---------- */
function browser() {
  const sb = {
    console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Date, JSON, Math, String, Number, Array, Object, parseInt, isNaN,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true }, addEventListener() {}, removeEventListener() {}, location: { href: 'https://x/' }
  };
  sb.window = sb;
  sb.CBA = {
    esc: s => String(s), authSession: 'S', mock: { currentYear: 'תשפ"ז' },
    sheets: { get: (p, cb) => cb({ ok: false, error: 'לא אמור להגיע ל-Apps Script' }), postRead: (a, b, cb) => cb({ ok: false, error: 'לא אמור' }) },
    fb: {
      isDbReady: () => true, userReady: cb => cb({ uid: 'mgr' }), ensureDb: cb => cb(null),
      flag: (k, d) => (k === 'appsScriptFallback' ? false : true),
      uid: () => 'mgr', serverNow: () => NOW,
      readCollection: (c, cb) => cb(null, Object.keys(store[c] || {}).map(id => Object.assign({ id }, clone(store[c][id])))),
      queryCollection: (c, q, cb) => cb(null, Object.keys(store[c] || {}).map(id => Object.assign({ id }, clone(store[c][id]))).filter(d => q.every(([f, v]) => String(d[f]) === String(v)))),
      readDoc: (c, id, cb) => cb(null, store[c] && store[c][id] ? clone(store[c][id]) : null),
      createDoc: (c, id, data, cb) => { if (store[c][id]) return cb({ code: 'permission-denied' }); store[c][id] = clone(data); cb(null); },
      mergeDoc: (c, id, f, cb) => { store[c] = store[c] || {}; store[c][id] = Object.assign(store[c][id] || {}, clone(f)); cb(null); },
      updateDoc: (c, id, f, cb) => { if (!store[c][id]) return cb({ code: 'not-found' }); Object.assign(store[c][id], clone(f)); cb(null); },
      deleteDoc: (c, id, cb) => { delete store[c][id]; cb(null); },
      nextId: (k, cb) => { store.counters[k].n++; cb(null, store.counters[k].n); }
    }
  };
  vm.createContext(sb);
  vm.runInContext(R('js/data/gardenRules.js'), sb);
  vm.runInContext(R('js/data/dataService.js'), sb);
  return sb;
}
const call = (fn) => new Promise(res => { fn(res); setTimeout(() => res({ ok: false, TIMEOUT: true }), 2000); });

/* ---------- השרת ---------- */
function server() {
  const sb = {
    console: { log() {} }, Date, JSON, Math, String, Number, Array, Object, parseInt, isNaN,
    Logger: { log() {} },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => ({ getRange: () => ({ setValues() {} }), setFrozenRows() {}, hideSheet() {}, getLastRow: () => 1 }) }) },
    FS_GARDEN_PLAN: 'gardenPlan', FS_GARDEN_TASKS: 'gardenTasks', FS_GARDEN_REPORTS: 'gardenReports',
    GARDEN_TASKS_SHEET: 'x', GARDEN_REPORTS_SHEET: 'y',
    readSettings_: () => ({ 'שנה נוכחית': 'תשפ"ז' }),
    gardenCols_: () => ({}),
    fsDocPath_: (c, id) => c + '/' + id,
    fsList_: c => Object.keys(store[c] || {}).map(id => ({ id, data: clone(store[c][id]) })),
    fsGet_: p => { const [c, id] = p.split('/'); return store[c] && store[c][id] ? clone(store[c][id]) : null; },
    fsSet_: (p, d) => { const [c, id] = p.split('/'); store[c][id] = clone(d); },
    fsDelete_: p => { const [c, id] = p.split('/'); delete store[c][id]; },
    fsQuery_: (c, f, op, v) => Object.keys(store[c] || {}).map(id => ({ id, data: clone(store[c][id]) })).filter(d => op === 'EQUAL' ? String(d.data[f]) === String(v) : op === 'LESS_THAN' ? new Date(d.data[f]) < v : false),
    gardenDeletePhotos_: csv => { trashed.push(...String(csv).split(',').filter(Boolean)); }
  };
  vm.createContext(sb);
  vm.runInContext(R('apps-script/GardenRules.gs'), sb);
  vm.runInContext(R('apps-script/GardenHorizon.gs'), sb);
  return sb;
}
const trashed = [];
const routine = () => Object.values(store.gardenTasks).filter(t => t.kind === 'שגרה');

(async () => {
  const B = browser();
  const G = B.GardenRules;
  const THIS = G.weekKey(NOW), NEXT = G.weekShift(THIS, 1);

  section('1. שמירת הגדרה חדשה מהאפליקציה');
  {
    const r = await call(cb => B.CBA.data.gardenPlanSave({ title: 'כיסוח', category: 'מדשאות', freq: 'שבועי', areas: ['צפון', 'דרום'], effectiveFrom: THIS }, cb));
    ok('נשמרה', r.ok === true, JSON.stringify(r).slice(0, 100));
    ok('המנוע רץ', !!r.horizon && r.horizon.ok, JSON.stringify(r.horizon));
    eq('16 מופעים נוצרו מיד (2 אזורים × 8 שבועות)', r.horizon.created, 16);
    eq('ובאמת קיימים ב-Firestore', routine().length, 16);
    ok('כולם מהשבוע הנוכחי והלאה', routine().every(t => t.week >= THIS));
    ok('effectiveFrom נשמר בהגדרה', Object.values(store.gardenPlan)[0].effectiveFrom === THIS);
  }

  section('2. הרצה חוזרת — אפס עבודה');
  {
    const r = await call(cb => B.CBA.data.gardenHorizonApply(cb));
    eq('אפס יצירות', r.created, 0);
    eq('אפס הסרות', r.removed, 0);
  }

  section('3. עריכה "מהשבוע הבא" — השבוע הנוכחי קפוא');
  {
    const id = Object.keys(store.gardenPlan)[0];
    /* מסמנים שמישהו נגע במופע אחד עתידי */
    const touchedId = G.occId(id, G.weekShift(THIS, 3), 'דרום');
    store.gardenTasks[touchedId].stage = 'בטיפול';
    const r = await call(cb => B.CBA.data.gardenPlanSave({ id, title: 'כיסוח', category: 'מדשאות', freq: 'שבועי', areas: ['צפון'], effectiveFrom: NEXT }, cb));
    ok('נשמר', r.ok === true);
    ok('"דרום" של השבוע הנוכחי נשאר', !!store.gardenTasks[G.occId(id, THIS, 'דרום')]);
    ok('"דרום" של השבוע הבא ירד', !store.gardenTasks[G.occId(id, NEXT, 'דרום')]);
    ok('המופע שנגעו בו נשאר', !!store.gardenTasks[touchedId]);
    eq('הוסרו 6 (7 עתידיים פחות הנגוע)', r.horizon.removed, 6);
    eq('קפואים 3 — כל השבוע הנוכחי (צפון+דרום) + הנגוע', r.horizon.frozen, 3);
  }

  section('4. השרת על אותם נתונים — מסכים עם הדפדפן');
  {
    const S = server();
    const r = S.gardenHorizonRun_(null);
    ok('רץ', r.ok === true, JSON.stringify(r));
    eq('אפס יצירות', r.created, 0);
    eq('אפס הסרות', r.removed, 0);
  }

  section('5. כיבוי מהתוכנית');
  {
    const id = Object.keys(store.gardenPlan)[0];
    const before = routine().length;
    const r = await call(cb => B.CBA.data.gardenPlanActive(id, false, cb));
    ok('כובתה', r.ok === true);
    ok('מופעים עתידיים שלא נגעו בהם ירדו', routine().length < before);
    ok('הנגוע נשאר', routine().some(t => t.stage === 'בטיפול'));
    const r2 = await call(cb => B.CBA.data.gardenPlanActive(id, true, cb));
    ok('הפעלה מחזירה', r2.horizon.created > 0);
  }

  section('6. מחיקה מהתוכנית');
  {
    const id = Object.keys(store.gardenPlan)[0];
    const r = await call(cb => B.CBA.data.gardenPlanDelete(id, cb));
    ok('נמחקה', r.ok === true);
    ok('ההגדרה ירדה', !store.gardenPlan[id]);
    eq('נשאר רק המופע שנגעו בו', routine().length, 1);
    eq('והמסך יגיד כמה נשארו', r.made, 1);
  }

  section('7. מחיקה — שגרה מבוטלת, דיווח תושב נסגר ונשאר, יזום נמחק (הכרעות 22.9 ערב)');
  {
    /* שגרה: "מחיקה" = סגירה ב'בוטל'. המנוע לא יוצר מחדש (סלוט תפוס). */
    const t = routine()[0];
    const r = await call(cb => B.CBA.data.gardenTaskDelete(t.id, 'הגשם עשה את העבודה', cb));
    ok('שגרה: בוטלה ולא נמחקה', r.ok === true && r.cancelled === true, JSON.stringify(r));
    ok('המסמך נשאר, סגור בוטל', !!store.gardenTasks[t.id] && store.gardenTasks[t.id].closure === 'בוטל');
    ok('ואין דגל מחיקה', !store.gardenTasks[t.id].pendingDelete);
    const h = server().gardenHorizonRun_(null);
    eq('המנוע לא יוצר את המופע מחדש', h.created, 0);
    const r2 = await call(cb => B.CBA.data.gardenTaskDelete(t.id, '', cb));
    ok('בלי סיבה — נדחה', r2.ok === false);

    /* דיווח תושב: נסגר ב'בוטל' עם הסיבה (המראה + מייל), ואז המשימה יורדת — הדיווח נשאר. */
    store.gardenTasks['77'] = { id: '77', kind: 'דיווח תושב', title: 'ממטרה', category: 'השקיה', stage: 'התקבל', repId: '5', familyId: 'F1', photos: ['PHOTO-X'], schema: 1 };
    store.gardenReports['5'] = { id: '5', taskId: '77', familyId: 'F1', photos: ['PHOTO-X'] };
    const r3 = await call(cb => B.CBA.data.gardenTaskDelete('77', 'שורת בדיקה', cb));
    ok('דיווח: הדגל הורם', r3.ok === true && r3.pending === true, JSON.stringify(r3));
    ok('המשימה נסגרה בוטל לפני המחיקה', store.gardenTasks['77'].closure === 'בוטל' && store.gardenTasks['77'].pendingDelete === true);
    ok('הדיווח של התושב מציג "נסגר"', store.gardenReports['5'].closure === 'בוטל' && store.gardenReports['5'].closeWhy === 'שורת בדיקה');
    ok('שורת היומן נושאת את המשפחה — התושב יראה אותה', Object.values(store.gardenLog).some(l => l.taskId === '77' && l.kind === 'סגירה' && l.familyId === 'F1'));
    const list = await call(cb => B.CBA.data.getGardenTasks({ scope: 'all' }, cb));
    ok('הכרטיס כבר לא בקריאה', list.ok && !list.rows.some(x => x.id === '77'));
    const d = server().gardenPendingDeleteRun_(null);
    eq('השרת מצא אחת', d.found, 1);
    ok('המשימה נמחקה', !store.gardenTasks['77']);
    ok('🔴 הדיווח נשאר', !!store.gardenReports['5']);
    eq('ותמונות הדיווח לא נזרקו', trashed.slice(), []);
    ok('היומן נשאר', Object.values(store.gardenLog).some(l => l.taskId === '77'));

    /* יזום (בלי דיווח): נמחק עם התמונות. */
    store.gardenTasks['78'] = { id: '78', kind: 'יזום', title: 'x', category: 'עצים', stage: 'מתוכנן', photos: ['PHOTO-T'], schema: 1 };
    const r4 = await call(cb => B.CBA.data.gardenTaskDelete('78', 'טעות', cb));
    ok('יזום: דגל', r4.ok === true && r4.pending === true);
    const d2 = server().gardenPendingDeleteRun_(null);
    ok('נמחק', !store.gardenTasks['78'] && d2.deleted === 1);
    eq('התמונה שלו לסל', trashed.slice(), ['PHOTO-T']);
  }

  section('8. היומן נקרא מ-Firestore');
  {
    store.gardenLog['L1'] = { taskId: 'Z', kind: 'נפתח', at: new Date(2026, 8, 1) };
    store.gardenLog['L2'] = { taskId: 'Z', kind: 'סגירה', at: new Date(2026, 8, 3) };
    const r = await call(cb => B.CBA.data.getGardenTaskLog('Z', cb));
    ok('ok', r.ok === true, JSON.stringify(r).slice(0, 100));
    eq('שתי רשומות, בסדר זמן', r.rows.map(x => x.kind), ['נפתח', 'סגירה']);
  }

  section('9. ריטנשן יומן');
  {
    store.gardenLog['OLD'] = { taskId: 'Q', kind: 'נפתח', at: new Date(2024, 0, 1) };
    const S = server();
    const r = S.gardenLogRetention_(null);
    ok('רץ', r.ok === true, JSON.stringify(r));
    eq('רשומה אחת הועברה', r.moved, 1);
    ok('הישנה ירדה, החדשות נשארו', !store.gardenLog['OLD'] && !!store.gardenLog['L1']);
  }

  console.log('\n════════════════════════════════');
  console.log(pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
