/* ============================================================================
   test-boot-decoupled-2026-10-03.js — שלב ד': הציור הראשון לא מחכה למטען
   (3.10.2026, אושר ע"י יועד)
   מה יכול להישבר בשקט:
     1. יש מטמון ⇒ הטעינה הקרה מ-Firestore לא רצה ⇒ הציור הראשון מחכה 4-9ש' למטען.
     2. הטעינה הקרה שואלת את budgetTx, ומיד אחריה המטען שואל שוב ⇒ פי 2 קריאות
        Firestore בכל פתיחה (מכסת Spark).
     3. המטען הטרי הקדים את הטעינה הקרה ⇒ הקרה דורסת נתונים מלאים בחלקיים.
     4. אימוץ שורות ישנות: הטעינה הקרה מלפני דקות לא אמורה להחליף שאילתה טרייה.
   הרצה: node tools/test-boot-decoupled-2026-10-03.js
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'data', 'sheets.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const wait = ms => new Promise(r => setTimeout(r, ms));
const CUR = 'תשפ"ז';

function payload() {
  const yr = tx => ({ budget: [], income: [], groups: [], splits: [], items: [], transactions: tx });
  return { ok: true, rev: 500, years: [CUR], currentYear: CUR, settings: { 'סיסמת מועדון': '1234' }, notes: {}, groups: [], updates: [], notesLog: [],
           domains: { budget: 7, other: 1 }, txFromFirestore: true, txFsOn: true, txFsScope: 'all', data: { [CUR]: yr([]) } };
}

function env(opts) {
  opts = opts || {};
  const log = [];
  let nowShift = 0;
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const cachedStore = { years: { [CUR]: { year: CUR, categories: [], transactions: [{ 'מזהה': 1 }], _loaded: true } }, yearList: [CUR], currentYear: CUR, settings: { 'סיסמת מועדון': 'old' }, version: 'v-old', budgetUpdates: [], notesLog: [] };
  const sb = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: k => (opts.cache && k === 'cba_data_v2') ? JSON.stringify({ t: Date.now(), store: cachedStore }) : null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true }, addEventListener() {}, removeEventListener() {}, location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {}; this.setRequestHeader = function () {}; this.upload = {}; },
    Date: new Proxy(Date, { apply: (t, th, a) => Reflect.apply(t, th, a), get: (t, k) => (k === 'now' ? (() => Date.now() + nowShift) : t[k]) }),
    fetch: (url) => { log.push('appsscript'); return new Promise(res => setTimeout(() => res({ json: () => Promise.resolve(payload()) }), opts.payloadDelay || 60)); }
  };
  sb.window = sb;
  sb.CBA = {
    mock: store, authSession: 'SESS', esc: s => String(s), isSuper: true, perms: ['תקציב'], user: { familyId: '' },
    fb: {
      isDbReady: () => true, ensureDb: cb => cb(null),
      authReady: cb => cb({ uid: 'u1' }), userReady: cb => cb({ uid: 'u1' }),
      flag: (k, d) => (opts.flags && k in opts.flags) ? opts.flags[k] : d,
      readDoc: (c, id, cb) => { log.push('readDoc:' + c + '/' + id); setTimeout(() => cb(null, c === 'appConfig' ? { currentYear: CUR, years: [CUR], version: 'fs' } : { year: CUR, schema: 2, budget: [], income: [], groups: [], splits: [], items: [], closed: false }), opts.fsDelay || 5); },
      queryCollection: (c, conds, cb) => { log.push('query:' + c); setTimeout(() => cb(null, [{ id: CUR + '__1', year: CUR, familyId: '3', 'מזהה': 1, 'מזהה משפחה': '3' }]), opts.fsDelay || 5); },
      readCollection: () => {}
    },
    data: {
      familyDisplayName: () => 'משפחת כהן', ensureFamilyNames: cb => cb(true),
      fsFirstRead: (key, enabled, load, sheets, cb) => { load((err, result) => { if (err) return sheets(res => cb(res)); cb(result); }); }
    }
  };
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return { sb, log, shift: ms => { nowShift += ms; } };
}

function runLoad(e) {
  const events = [];
  return new Promise(res => {
    e.sb.CBA.sheets.load((okk, info) => { events.push((okk ? 'ok' : 'fail') + ':' + (info && info.source)); if (info && info.source === 'fresh') setTimeout(() => res(events), 20); });
    setTimeout(() => res(events), 1500);
  });
}

(async () => {
  section('1. יש מטמון — הטעינה הקרה רצה בכל זאת, והציור הראשון לא מחכה למטען');
  {
    const e = env({ cache: true, flags: { bootFromFirestore: true }, payloadDelay: 150 });
    const ev = await runLoad(e);
    ok('סדר האירועים: cache → firestore-boot → fresh', ev.join(' > ') === 'ok:cache > ok:firestore-boot > ok:fresh', ev.join(' > '));
    ok('🔴 הטעינה הקרה קראה את מסמך הפתיחה ואת השנה גם כשיש מטמון', e.log.indexOf('readDoc:appConfig/boot') !== -1 && e.log.indexOf('readDoc:budgetYears/' + CUR) !== -1, JSON.stringify(e.log));
    ok('🔴 budgetTx נשאל פעם אחת בלבד (המטען אימץ את שורות הטעינה הקרה)', e.log.filter(x => x === 'query:budgetTx').length === 1, JSON.stringify(e.log));
    const m = e.sb.CBA.mock;
    ok('אחרי המטען: לא חלקי, ההגדרות מהמטען הטרי (לא מהמטמון)', !m._partial && m._settings['סיסמת מועדון'] === '1234');
    ok('ושורת התנועה מ-Firestore נמצאת בשנה', (m.years[CUR].transactions || []).length === 1);
  }

  section('2. אין מטמון — כמו קודם');
  {
    const e = env({ cache: false, flags: { bootFromFirestore: true }, payloadDelay: 150 });
    const ev = await runLoad(e);
    ok('סדר: firestore-boot → fresh', ev.join(' > ') === 'ok:firestore-boot > ok:fresh', ev.join(' > '));
    ok('budgetTx פעם אחת', e.log.filter(x => x === 'query:budgetTx').length === 1);
  }

  section('3. הדגל כבוי — אין טעינה קרה, המטמון לא מצייר, מחכים למטען');
  {
    const e = env({ cache: true, flags: { bootFromFirestore: false }, payloadDelay: 60 });
    const ev = await runLoad(e);
    ok('סדר: cache → fresh בלבד', ev.join(' > ') === 'ok:cache > ok:fresh', ev.join(' > '));
    ok('אפס קריאות Firestore לפתיחה', !e.log.some(x => x.indexOf('readDoc:appConfig') === 0));
  }

  section('4. המטען הטרי הקדים — הטעינה הקרה מוותרת (לא דורסת מלא בחלקי)');
  {
    const e = env({ cache: true, flags: { bootFromFirestore: true }, payloadDelay: 5, fsDelay: 120 });
    const ev = await runLoad(e);
    await wait(400);
    ok('firestore-boot לא דיווח אחרי fresh', ev.indexOf('ok:fresh') !== -1 && ev.indexOf('ok:firestore-boot') === -1, ev.join(' > '));
    ok('הנתונים נשארו מלאים', !e.sb.CBA.mock._partial && e.sb.CBA.mock._settings['סיסמת מועדון'] === '1234');
  }

  section('5. חלון האימוץ — שורות קרות מלפני 15 שניות אינן מאומצות');
  {
    ok('BOOT_TX_ADOPT_MS = 15 שניות', /var BOOT_TX_ADOPT_MS = 15000;/.test(SRC));
    ok('האימוץ מותנה בגיל ובמפתח "boot"', /fsTxCache\.key === "boot" && \(Date\.now\(\) - fsTxCache\.at\) < BOOT_TX_ADOPT_MS/.test(SRC));
    ok('הטעינה הקרה זורעת את המטמון רק אחרי שער lastAppliedSeq', /if \(lastAppliedSeq\) return done\(false\);\n[\s\S]{0,300}fsTxCache = \{ y: y, key: "boot"/.test(SRC));
  }

  section('6. app.js — הציור הראשון מגיע מ-firestore-boot, ומטמון עדיין לא מצייר');
  {
    const fn = APP.slice(APP.indexOf('function sheetsLoadHandler(ok, info) {'), APP.indexOf('function sheetsLoadHandler(ok, info) {') + 6000);
    ok('מטמון: רק כותרת, בלי תוכן (כלל 6.8 נשמר)', /info\.source === "cache"\) \{[\s\S]{0,1200}?ensureHeaderShell\(\);\s*return;/.test(fn));
    ok('firestore-boot/fresh: הציור הראשון (inited) באותו מסלול', /if \(!inited\) \{[\s\S]*?inited = true;/.test(fn));
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
