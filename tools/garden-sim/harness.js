'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const rules = require('./rules');
const REPO = path.join(__dirname, '..', '..');
const R = f => fs.readFileSync(path.join(REPO, f), 'utf8');
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o), (k, v) => (typeof v === 'string' && /^__DATE__/.test(v)) ? new Date(v.slice(8)) : v);
const ser = o => JSON.stringify(o, (k, v) => (v instanceof Date) ? '__DATE__' + v.toISOString() : (this && this[k] instanceof Date ? '__DATE__' + this[k].toISOString() : v));
function deep(o) { // clone that keeps Dates
  if (o instanceof Date) return new Date(o.getTime());
  if (Array.isArray(o)) return o.map(deep);
  if (o && typeof o === 'object') { const r = {}; for (const k of Object.keys(o)) r[k] = deep(o[k]); return r; }
  return o;
}

const MEMBERS = {
  res1: { active: true, perms: [], familyId: 'F1', isExternal: false, name: 'דין ארגיל' },
  res2: { active: true, perms: [], familyId: 'F2', isExternal: false, name: 'אורטל כהן' },
  mgr:  { active: true, perms: ['גינון'], familyId: 'F9', isExternal: false, name: 'מנהל גינון' },
  gard: { active: true, perms: ['גינון'], familyId: '', isExternal: true, name: 'גנן' },
  sup:  { active: true, perms: ['על'], familyId: 'F8', isExternal: false, name: 'מנהל על' },
  off:  { active: false, perms: [], familyId: 'F3', isExternal: false, name: 'עזב' },
  other:{ active: true, perms: ['תקציב'], familyId: 'F4', isExternal: false, name: 'מנהל תקציב' },
  nofam:{ active: true, perms: [], familyId: '', isExternal: false, name: 'בלי משפחה' }
};

function newStore() {
  return {
    gardenPlan: {}, gardenTasks: {}, gardenReports: {}, gardenLog: {},
    gardenMeta: { lists: { areas: ['שכונה צפונית', 'שכונה מרכזית צפונית', 'שכונה מרכזית דרומית', 'שכונה דרומית', 'פארק משחקים', 'ציר מזרחי', 'ציר מערבי', 'גני ילדים', 'מועדון ילדים', 'גינת כלבים', 'מועדון משפחות'], categories: ['מדשאות', 'השקיה / ממטרות', 'שיחים / גיזום', 'עשבייה / קרקע', 'ניקיון גינון / גזם', 'ערוגות / שתילות', 'עצים'], freqs: [] } },
    counters: { gardenTask: { n: 0 }, gardenReport: { n: 0 } },
    appConfig: { flags: { gardenTasksFromFirestore: true, gardenReportsFromFirestore: true, gardenWriteToFirestore: true, gardenWritesFromBrowser: true } },
    members: MEMBERS
  };
}

/* ---------- Firestore מדומה עם אכיפת כללים ---------- */
function makeFb(store, uid, clock, audit) {
  const denied = (why) => ({ code: 'permission-denied', message: why });
  function ctx(op, coll, id, before, after, extra) {
    return Object.assign({ uid, members: store.members, store, now: clock.now(), op, coll, id, before, after }, extra || {});
  }
  function log(kind, coll, id, res, why) { audit.push({ uid, kind, coll, id, ok: res, why }); }
  const fb = {
    isDbReady: () => true, userReady: cb => cb(uid ? { uid } : null), authReady: cb => cb(uid ? { uid } : null), ensureDb: cb => cb(null),
    flag: (k, d) => (k in store.appConfig.flags ? store.appConfig.flags[k] : (k === 'appsScriptFallback' ? false : d)),
    uid: () => uid, serverNow: () => { clock.__t = (clock.__t || 0) + 1; return new Date(clock.now().getTime() + clock.__t); },
    readCollection: (c, cb) => {
      const r = rules.check(ctx('list', c, null, {}, null));
      log('list', c, '*', r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      cb(null, Object.keys(store[c] || {}).map(id => Object.assign({ id }, deep(store[c][id]))));
    },
    queryCollection: (c, q, cb) => {
      const rows = Object.keys(store[c] || {}).map(id => Object.assign({ id }, deep(store[c][id]))).filter(d => q.every(([f, v]) => String(d[f]) === String(v)));
      const r = rules.check(ctx('list', c, null, {}, null, { query: q, rows }));
      log('query', c, JSON.stringify(q), r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      cb(null, rows);
    },
    readDoc: (c, id, cb) => {
      const before = store[c] && store[c][id];
      const r = rules.check(ctx('get', c, id, before || {}, null));
      log('get', c, id, r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      cb(null, before ? deep(before) : null);
    },
    createDoc: (c, id, data, cb) => { /* set() — יצירה או דריסה מלאה */
      const before = store[c] && store[c][id];
      const after = deep(data || {});
      const r = rules.check(ctx(before ? 'update' : 'create', c, id, before || {}, after));
      log(before ? 'set-over' : 'create', c, id, r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      store[c] = store[c] || {}; store[c][id] = after; cb(null, true);
    },
    createIfAbsent: (c, id, data, cb) => {
      if (store[c] && store[c][id]) return cb({ code: 'already-exists', message: 'already-exists' });
      fb.createDoc(c, id, data, cb);
    },
    mergeDoc: (c, id, fields, cb) => { /* set(merge) */
      const before = store[c] && store[c][id];
      const after = Object.assign(deep(before || {}), deep(fields || {}));
      const r = rules.check(ctx(before ? 'update' : 'create', c, id, before || {}, after));
      log(before ? 'merge' : 'merge-create', c, id, r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      store[c] = store[c] || {}; store[c][id] = after; cb(null, true);
    },
    updateDoc: (c, id, fields, cb) => {
      const before = store[c] && store[c][id];
      if (!before) { log('update', c, id, false, 'not-found'); return cb({ code: 'not-found', message: 'not-found' }); }
      const after = Object.assign(deep(before), deep(fields || {}));
      const r = rules.check(ctx('update', c, id, before, after));
      log('update', c, id, r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      store[c][id] = after; cb(null, true);
    },
    deleteDoc: (c, id, cb) => {
      const before = store[c] && store[c][id];
      const r = rules.check(ctx('delete', c, id, before || {}, null));
      log('delete', c, id, r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      if (store[c]) delete store[c][id]; cb(null, true);
    },
    nextId: (k, cb) => {
      const before = store.counters[k];
      if (!before) return cb(new Error('no-counter'));
      const r0 = rules.check(ctx('get', 'counters', k, before, null));
      if (!r0.ok) return cb(denied(r0.why));
      const after = Object.assign(deep(before), { n: before.n + 1, updatedAt: clock.now() });
      const r = rules.check(ctx('update', 'counters', k, before, after));
      log('counter', 'counters', k, r.ok, r.why);
      if (!r.ok) return cb(denied(r.why));
      store.counters[k] = after; cb(null, after.n);
    }
  };
  return fb;
}

/* ---------- דפדפן של תפקיד ---------- */
function browser(store, uid, clock, opts) {
  opts = opts || {};
  const audit = [], sheetsCalls = [];
  const mem = store.members[uid] || {};
  const sb = {
    console: { log() {}, error() {}, warn() {} }, setTimeout, clearTimeout, Date, JSON, Math, String, Number, Array, Object, parseInt, parseFloat, isNaN, isFinite, RegExp, Error,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null, createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true }, addEventListener() {}, removeEventListener() {}, location: { href: 'https://x/' }
  };
  sb.window = sb;
  const fb = makeFb(store, uid, clock, audit);
  sb.CBA = {
    esc: s => String(s), authSession: 'S', mock: { currentYear: 'תשפ"ז' },
    user: { firstName: mem.name || '', family: '', email: uid + '@x', familyId: mem.familyId || '', isExternal: !!mem.isExternal },
    diag: { error() {} },
    sheets: {
      get: (p, cb) => { sheetsCalls.push({ kind: 'get', action: p.action }); cb({ ok: false, error: 'APPS_SCRIPT:' + p.action }); },
      postRead: (a, b, cb) => {
        sheetsCalls.push({ kind: 'post', action: a, payload: b });
        if (a === 'gardenPhotoOne') return cb({ ok: true, id: 'ph_' + Math.random().toString(36).slice(2, 6) });
        if (/^gardenNotify|gardenFeedbackNotify/.test(a)) return cb({ ok: true });
        if (opts.appsScript && opts.appsScript[a]) return cb(opts.appsScript[a](b, store));
        cb({ ok: false, error: 'APPS_SCRIPT:' + a });
      },
      postReadProgress: (a, b, prog, cb) => sb.CBA.sheets.postRead(a, b, cb)
    },
    fb
  };
  vm.createContext(sb);
  vm.runInContext(R('js/data/gardenRules.js'), sb);
  vm.runInContext(R('js/data/dataService.js'), sb);
  sb.__audit = audit; sb.__sheets = sheetsCalls; sb.__uid = uid;
  return sb;
}

/* ---------- השרת (Apps Script, חשבון שירות — בלי כללים) ---------- */
function server(store, clock, trashed) {
  const sheetRows = { tasks: [] };
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
    fsList_: c => Object.keys(store[c] || {}).map(id => ({ id, data: deep(store[c][id]) })),
    fsGet_: p => { const [c, id] = p.split('/'); return store[c] && store[c][id] ? deep(store[c][id]) : null; },
    fsSet_: (p, d) => { const [c, id] = p.split('/'); store[c][id] = deep(d); },
    fsDelete_: p => { const [c, id] = p.split('/'); delete store[c][id]; },
    fsQuery_: (c, f, op, v) => Object.keys(store[c] || {}).map(id => ({ id, data: deep(store[c][id]) })).filter(d => op === 'EQUAL' ? String(d.data[f]) === String(v) : op === 'LESS_THAN' ? new Date(d.data[f]) < v : false),
    gardenDeletePhotos_: csv => { trashed.push(...String(csv).split(',').filter(Boolean)); }
  };
  /* השרת משתמש ב-new Date() — מחליפים לשעון הסימולציה */
  sb.Date = new Proxy(Date, { construct(T, args) { return args.length ? new T(...args) : new T(clock.now().getTime()); }, get(T, k) { return k === 'now' ? () => clock.now().getTime() : T[k]; } });
  vm.createContext(sb);
  vm.runInContext(R('apps-script/GardenRules.gs'), sb);
  vm.runInContext(R('apps-script/GardenHorizon.gs'), sb);
  return sb;
}

const call = (fn, ms) => new Promise(res => { let done = false; fn(r => { if (!done) { done = true; res(r); } }); setTimeout(() => { if (!done) { done = true; res({ ok: false, TIMEOUT: true }); } }, ms || 1500); });

module.exports = { newStore, browser, server, call, MEMBERS, deep, R };
