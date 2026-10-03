/* ============================================================================
   test-resident-lite-2026-10-03.js — שלב 2: "תושבים בלי מטען" (3.10.2026 ערב)
   מה יכול להישבר בשקט:
     1. תושב עדיין מושך את המטען של Apps Script (כל השלב לא עשה כלום).
     2. מנהל תקציב נכנס למסלול התושב ⇒ תקציב ריק, בלי שגיאה.
     3. מסמך/כלל חסר ⇒ תושב נשאר בלי נתונים (במקום לחזור למטען).
     4. הקבלן החיצוני מקבל את סיסמת רשת המועדון.
     5. תנועות של שנים קודמות נעלמות להיסטוריית ההחזרים, או בלי שם רוכש.
     6. הרענון התקופתי של תושב עדיין שואל את Apps Script (?action=rev).
     7. הנתונים נשארים "חלקיים" ⇒ כל כתיבה של התושב חסומה.
   הרצה: node tools/test-resident-lite-2026-10-03.js
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'data', 'sheets.js'), 'utf8');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const wait = ms => new Promise(r => setTimeout(r, ms));
const CUR = 'תשפ"ז', OLD = 'תשפ"ו';
const WIFI = 'סיסמת רשת המועדון';

function env(o) {
  o = o || {};
  const log = [];
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const flags = Object.assign({ residentLite: true, budgetTxFromFirestore: true, bootFromFirestore: true }, o.flags || {});
  const sb = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }), head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true }, addEventListener() {}, removeEventListener() {}, location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {}; this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: (url) => {
      log.push('appsscript:' + (String(url).indexOf('action=rev') !== -1 ? 'rev' : 'payload'));
      const p = { ok: true, rev: 9, years: [CUR], currentYear: CUR, settings: { [WIFI]: 'FROM-SHEET' }, notes: {}, groups: [],
                  domains: { budget: 1 }, txFromFirestore: false, data: { [CUR]: { budget: [], income: [], groups: [], splits: [], items: [], transactions: [] } } };
      return Promise.resolve({ json: () => Promise.resolve(p) });
    }
  };
  sb.window = sb;
  const user = Object.assign({ familyId: '7', firstName: 'דנה', family: 'כהן', isExternal: false }, o.user || {});
  sb.CBA = {
    mock: store, authSession: 'S', esc: s => String(s),
    isSuper: !!o.isSuper, perms: o.perms || [], user: user,
    isSimulating: () => !!o.sim,
    fb: {
      ensureDb: cb => cb(null), authReady: cb => cb({ uid: 'u1' }), userReady: cb => cb({ uid: 'u1' }),
      flag: (k, d) => (k in flags ? flags[k] : d),
      readDoc: (c, id, cb) => {
        log.push('readDoc:' + c + '/' + id);
        setTimeout(() => {
          if (c === 'appConfig' && id === 'boot') return cb(null, { currentYear: CUR, years: [OLD, CUR], version: 'v207' });
          if (c === 'appConfig' && id === 'rev') return cb(null, o.noPulse ? null : { n: 41, domains: { budget: 3, other: 1 } });
          if (c === 'residentConfig') return o.cfgErr ? cb(new Error('permission-denied')) : cb(null, o.cfgMissing ? null : { clubWifi: 'WIFI-123' });
          if (c === 'budgetYears') return cb(null, { year: CUR, schema: 2, budget: [], income: [], groups: [], splits: [], items: [] });
          cb(null, null);
        }, 2);
      },
      queryCollection: (c, conds, cb) => {
        log.push('query:' + c + ':' + JSON.stringify(conds));
        setTimeout(() => cb(null, [
          { id: CUR + '__1', year: CUR, familyId: '7', 'מזהה': 1, 'מזהה משפחה': '7', 'סכום': 50, 'רוכש': '' },
          { id: OLD + '__9', year: OLD, familyId: '7', 'מזהה': 9, 'מזהה משפחה': '7', 'סכום': 20, 'רוכש': '' }
        ]), 2);
      }
    },
    data: { familyDisplayName: () => '', ensureFamilyNames: cb => cb(false),
            fsFirstRead: (key, enabled, load, sheets, cb) => load((err, res) => err ? sheets(r => cb(r)) : cb(res)) }
  };
  vm.createContext(sb);
  vm.runInContext(SRC, sb);
  return { sb, log };
}
function runLoad(e) {
  const events = [];
  return new Promise(res => {
    e.sb.CBA.sheets.load((okk, info) => { events.push((okk ? 'ok' : 'fail') + ':' + (info && info.source)); if (info && info.source === 'fresh') setTimeout(() => res(events), 20); });
    setTimeout(() => res(events), 800);
  });
}

(async () => {
  section('1. תושב — נפתח מ-Firestore בלבד');
  {
    const e = env();
    const ev = await runLoad(e);
    const m = e.sb.CBA.mock;
    ok('🔴 אפס קריאות ל-Apps Script', !e.log.some(x => x.indexOf('appsscript') === 0), JSON.stringify(e.log));
    ok('אירוע אחד: fresh (בלי טעינה קרה כפולה)', ev.join(' > ') === 'ok:fresh', ev.join(' > '));
    ok('קריאות: boot, rev, residentConfig, ושאילתת תנועות אחת לפי משפחה בלבד (כל השנים)',
       e.log.indexOf('readDoc:appConfig/boot') !== -1 && e.log.indexOf('readDoc:appConfig/rev') !== -1 &&
       e.log.indexOf('readDoc:residentConfig/settings') !== -1 &&
       e.log.filter(x => x.indexOf('query:budgetTx') === 0).length === 1 && e.log.indexOf('query:budgetTx:[["familyId","7"]]') !== -1, JSON.stringify(e.log));
    ok('לא נקרא מסמך תוכנית התקציב (תושב לא רשאי)', !e.log.some(x => x.indexOf('readDoc:budgetYears') === 0));
    ok('🔴 מחובר ולא חלקי — כתיבות התושב פתוחות', m._source === 'sheets' && !m._partial && e.sb.CBA.sheets.isConnected());
    ok('סיסמת רשת המועדון הגיעה מ-residentConfig', m._settings[WIFI] === 'WIFI-123', JSON.stringify(m._settings));
    ok('שתי השנים ברשימה, הנוכחית נבחרה', JSON.stringify(m.yearList) === JSON.stringify([OLD, CUR]) && m.currentYear === CUR);
    ok('🔴 התנועה של השנה הקודמת נמצאת (היסטוריית ההחזרים)', (m.years[OLD].transactions || []).length === 1 && (m.years[CUR].transactions || []).length === 1);
    ok('שתי השנים מסומנות כטעונות (לא נמשכות שוב)', m.years[OLD]._loaded !== false && m.years[CUR]._loaded !== false);
    ok('שם הרוכש מולא בכל השנים', m.years[OLD].transactions[0].buyer === 'דנה כהן' && m.years[CUR].transactions[0].buyer === 'דנה כהן', m.years[OLD].transactions[0].buyer);
    ok('גרסת השרת מהמסמך', m._serverVersion === 'v207');
    ok('שער כתיבת התנועות דלוק (txFsOn)', m._txFsOn === true);
    ok('אין תוכנית תקציב (כמו DATA_MIN)', (m.years[CUR].categories || []).length === 0);
    ok('perf.lite נרשם', e.sb.CBA.perf && e.sb.CBA.perf.lite && e.sb.CBA.perf.lite.ok === true);

    e.log.length = 0;
    await new Promise(res => e.sb.CBA.sheets.refreshIfChanged(() => res()));
    await wait(20);
    ok('🔴 רענון תקופתי: "מה זז?" מהפעימה ב-Firestore, לא ?action=rev', e.log.indexOf('readDoc:appConfig/rev') !== -1 && !e.log.some(x => x.indexOf('appsscript') === 0), JSON.stringify(e.log));
  }

  section('2. מי שלא במסלול — כמו אתמול');
  {
    let e = env({ perms: ['תקציב'] });
    await runLoad(e);
    ok('🔴 מנהל תקציב ⇒ המטען הרגיל', e.log.indexOf('appsscript:payload') !== -1 && !e.log.some(x => x.indexOf('residentConfig') !== -1));
    e = env({ isSuper: true });
    await runLoad(e);
    ok('מנהל-על ⇒ המטען הרגיל', e.log.indexOf('appsscript:payload') !== -1);
    e = env({ sim: true });
    await runLoad(e);
    ok('הדמיית תושב (מנהל) ⇒ המטען הרגיל', e.log.indexOf('appsscript:payload') !== -1);
    e = env({ perms: ['מועדון', 'גינון'] });
    await runLoad(e);
    ok('מנהל מועדון/גינון בלי תקציב ⇒ מסלול התושב (המטען שלו ממילא DATA_MIN)', !e.log.some(x => x.indexOf('appsscript') === 0));
  }

  section('3. 🔴 כל כשל ⇒ המטען הרגיל, לא מסך ריק');
  {
    let e = env({ cfgErr: true });
    await runLoad(e);
    ok('כלל residentConfig עוד לא פורסם (נדחה) ⇒ המטען', e.log.indexOf('appsscript:payload') !== -1 && e.sb.CBA.mock._settings[WIFI] === 'FROM-SHEET');
    e = env({ cfgMissing: true });
    await runLoad(e);
    ok('המסמך עוד לא נכתב (שרת ישן) ⇒ המטען (הסיסמה לא נעלמת בשקט)', e.log.indexOf('appsscript:payload') !== -1);
    e = env({ flags: { residentLite: false } });
    await runLoad(e);
    ok('מתג חירום residentLite=false ⇒ המטען', e.log.indexOf('appsscript:payload') !== -1);
    e = env({ flags: { budgetTxFromFirestore: false } });
    await runLoad(e);
    ok('התנועות לא ב-Firestore (דגל כבוי) ⇒ המטען', e.log.indexOf('appsscript:payload') !== -1);
    ok('perf.lite מתעד את הסיבה', e.sb.CBA.perf.lite.ok === false && e.sb.CBA.perf.lite.why === 'lite-off');
    e = env({ noPulse: true });
    await runLoad(e);
    ok('אין פעימה ⇒ עדיין מ-Firestore (רק בלי נקודת ייחוס)', !e.log.some(x => x.indexOf('appsscript') === 0));
  }

  section('4. הקבלן החיצוני');
  {
    const e = env({ user: { isExternal: true, familyId: '' } });
    await runLoad(e);
    ok('🔴 לא נקרא residentConfig בכלל, והגדרות ריקות', !e.log.some(x => x.indexOf('residentConfig') !== -1) && JSON.stringify(e.sb.CBA.mock._settings) === '{}');
    ok('בלי מזהה משפחה — אין שאילתת תנועות', !e.log.some(x => x.indexOf('query:budgetTx') === 0));
    ok('ועדיין בלי Apps Script', !e.log.some(x => x.indexOf('appsscript') === 0));
  }

  section('5. שרת וכללים');
  {
    ok('bootSync_ כותב גם את residentConfig/settings (clubWifi)', /fsSet_\(FS_RESIDENT_CFG_DOC, residentConfigDoc_\(settings\)\);/.test(CODE) && /return \{ clubWifi: String\(\(settings \|\| \{\}\)\['סיסמת רשת המועדון'\] \|\| ''\)/.test(CODE));
    ok('החלפת שנת עבודה מעדכנת מיד את appConfig/boot', /setSetting_\(ss, 'שנה נוכחית עודכנה', new Date\(\)\);[\s\S]{0,300}try \{ bootSync_\(ss\); \} catch \(eBoot\) \{\}/.test(CODE));
    ok('🔴 כלל: residentConfig — חבר פעיל ולא חיצוני, בלי כתיבה', /match \/residentConfig\/\{doc\} \{\s*\n\s*allow read: if isMember\(\) && !isExternalUser\(\);\s*\n\s*allow write: if false;/.test(RULES));
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
