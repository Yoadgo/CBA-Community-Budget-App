/* בדיקות ל"שנת העבודה גלובלית" (2026-09-15).
   הרצה:  node tools/test-working-year-global.js

   🔴🔴 **הבאג שנתפס ושוחזר חי (15.9.26):** מנהל-על הגדיר
   תשפ"ז כשנת העבודה, אבל `restoreSavedYear` שיחזר מ-localStorage
   שנה ישנה **בלי הגבלת זמן** ודרס אותה. כל תנועה חדשה
   נכתבה אז לשנה הישנה. שתי הגנות נבדקות כאן:
     1. המסלול השמור נושא את שנת העבודה שהייתה בתוקף,
        ורשומה שלא תואמת מבוטלת.
     2. תנועה חדשה נכתבת לשנת העבודה, לא לשנה המוצגת. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  \u2713 ' + n))
                          : (fail++, console.log('  \u2717 ' + n + (x ? '  \u2192 ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const DS  = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const EXP = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'expenses.js'), 'utf8');

/* =======================================================================
   1. המסלול השמור — הרצה אמיתית של שתי הפונקציות.
   מחלצים אותן מ-app.js ומריצים — לא מעתיקים את הלוגיקה
   לתוך הבדיקה, אחרת הבדיקה בודקת את עצמה.
   ======================================================================= */
function grab(name) {
  const i = APP.indexOf('function ' + name + '(');
  if (i === -1) return null;
  let d = 0, started = false;
  for (let k = APP.indexOf('{', i); k < APP.length; k++) {
    if (APP[k] === '{') { d++; started = true; }
    else if (APP[k] === '}') { d--; if (started && !d) return APP.slice(i, k + 1); }
  }
  return null;
}
const saveSrc = grab('saveRoute');
const restoreSrc = grab('restoreSavedYear');

section('0. הפונקציות נמצאו');
ok('saveRoute חולצה', !!saveSrc);
ok('restoreSavedYear חולצה', !!restoreSrc);

function makeEnv(opts) {
  const store = {};
  const sb = {
    console: { log() {}, error() {} },
    ROUTE_KEY: 'k',
    currentArea: 'admin', currentScreen: 'budget', inited: true,
    Date: Date, String: String, JSON: JSON,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    loadRoute: function () { try { return JSON.parse(store['k'] || 'null'); } catch (e) { return null; } },
    renderYearSwitch() {}, showScreen() {}
  };
  sb.window = sb;
  sb.CBA = {
    sheets: { yearLoaded: () => true, loadYear() {} },
    data: {
      getYears: () => opts.years,
      getCurrentYear: () => sb.__cur,
      getWorkingYear: () => opts.working,
      setCurrentYear: y => { sb.__cur = y; return y; }
    }
  };
  sb.__cur = opts.current;
  vm.createContext(sb);
  vm.runInContext(saveSrc + '\n' + restoreSrc, sb);
  return { sb, store };
}

section('1. ' + '🔴' + ' מסלול שנשמר כששנת העבודה היתה אחרת');
{
  /* המשתמש היה על תשפ"ו כשזו היתה שנת העבודה... */
  const a = makeEnv({ years: ['\u05ea\u05e9\u05e4"\u05d5', '\u05ea\u05e9\u05e4"\u05d6'], current: '\u05ea\u05e9\u05e4"\u05d5', working: '\u05ea\u05e9\u05e4"\u05d5' });
  a.sb.saveRoute();
  const saved = JSON.parse(a.store['k']);
  ok('המסלול שומר גם את שנת העבודה', saved.workingYear === '\u05ea\u05e9\u05e4"\u05d5', JSON.stringify(saved));

  /* ...ועכשיו המנהל החליף לתשפ"ז. המשתמש נכנס מחדש. */
  const b = makeEnv({ years: ['\u05ea\u05e9\u05e4"\u05d5', '\u05ea\u05e9\u05e4"\u05d6'], current: '\u05ea\u05e9\u05e4"\u05d6', working: '\u05ea\u05e9\u05e4"\u05d6' });
  b.store['k'] = a.store['k'];
  const res = b.sb.restoreSavedYear();
  ok('🔴 השנה השמורה מבוטלת', res === false, String(res));
  ok('🔴 והמשתמש נשאר על ברירת המחדל מהשרת',
     b.sb.__cur === '\u05ea\u05e9\u05e4"\u05d6', b.sb.__cur);
}

section('2. רענון באמצע עבודה — ממשיך לעבוד');
{
  /* אותה שנת עבודה, אבל המשתמש בחר להסתכל על שנה קודמת. */
  const a = makeEnv({ years: ['\u05ea\u05e9\u05e4"\u05d5', '\u05ea\u05e9\u05e4"\u05d6'], current: '\u05ea\u05e9\u05e4"\u05d5', working: '\u05ea\u05e9\u05e4"\u05d6' });
  a.sb.saveRoute();
  const b = makeEnv({ years: ['\u05ea\u05e9\u05e4"\u05d5', '\u05ea\u05e9\u05e4"\u05d6'], current: '\u05ea\u05e9\u05e4"\u05d6', working: '\u05ea\u05e9\u05e4"\u05d6' });
  b.store['k'] = a.store['k'];
  ok('F5 באותה שנת עבודה — הבחירה משוחזרת', b.sb.restoreSavedYear() === true);
  ok('והשנה המוצגת חזרה', b.sb.__cur === '\u05ea\u05e9\u05e4"\u05d5', b.sb.__cur);
}

section('3. 🔴 רשומה ישנה בלי השדה');
{
  const b = makeEnv({ years: ['\u05ea\u05e9\u05e4"\u05d5', '\u05ea\u05e9\u05e4"\u05d6'], current: '\u05ea\u05e9\u05e4"\u05d6', working: '\u05ea\u05e9\u05e4"\u05d6' });
  b.store['k'] = JSON.stringify({ area: 'admin', screen: 'budget', year: '\u05ea\u05e9\u05e4"\u05d5', ts: Date.now() });
  ok('🔴 נחשבת לא-תואמת (אחרת התיקון לא מגיע למשתמשים הקיימים)',
     b.sb.restoreSavedYear() === false);
  ok('והשנה לא הוחלפה', b.sb.__cur === '\u05ea\u05e9\u05e4"\u05d6', b.sb.__cur);
}

section('4. שנה שנמחקה — ההגנה הישנה לא נשברה');
{
  const b = makeEnv({ years: ['\u05ea\u05e9\u05e4"\u05d6'], current: '\u05ea\u05e9\u05e4"\u05d6', working: '\u05ea\u05e9\u05e4"\u05d6' });
  b.store['k'] = JSON.stringify({ area: 'admin', screen: 'budget', year: '\u05ea\u05e9\u05e4"\u05d3',
                                  workingYear: '\u05ea\u05e9\u05e4"\u05d6', ts: Date.now() });
  ok('שנה שאינה ברשימה — מבוטלת', b.sb.restoreSavedYear() === false);
}

/* =======================================================================
   5. תנועה חדשה — לאן היא נכתבת בפועל
   ======================================================================= */
section('5. 🔴 תנועה חדשה נכתבת לשנת העבודה');
function dsEnv() {
  const pushed = [];
  const sb = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {}, classList:{add(){},remove(){}} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true }, addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' }, fetch: () => Promise.resolve({ json: () => Promise.resolve({}) })
  };
  sb.window = sb;
  sb.CBA = {
    esc: s => String(s),
    mock: { _source: 'sheets', transactions: [], categories: [], years: {}, yearList: [],
            currentYear: '\u05ea\u05e9\u05e4"\u05d5', _settings: { '\u05e9\u05e0\u05d4 \u05e0\u05d5\u05db\u05d7\u05d9\u05ea': '\u05ea\u05e9\u05e4"\u05d6' } },
    sheets: {
      push: (action, payload, cb) => { pushed.push({ action, payload }); if (cb) cb({ ok: true }); },
      postReadProgress: (action, payload, onP, cb) => { pushed.push({ action, payload }); if (cb) cb({ ok: true }); }
    }
  };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  return { sb, pushed };
}
{
  const e = dsEnv();
  ok('הסביבה: מוצגת תשפ"ו, שנת עבודה תשפ"ז',
     e.sb.CBA.data.getCurrentYear() === '\u05ea\u05e9\u05e4"\u05d5' && e.sb.CBA.data.getWorkingYear() === '\u05ea\u05e9\u05e4"\u05d6');
  const row = e.sb.CBA.data.addTransaction({ amount: 10 });
  ok('🔴 addTransaction → שנת העבודה', row.year === '\u05ea\u05e9\u05e4"\u05d6', row.year);
  const p = e.pushed.find(x => x.action === 'saveTransaction');
  ok('🔴 וגם המטען לשרת', !!p && p.payload.year === '\u05ea\u05e9\u05e4"\u05d6', p && p.payload.year);
}
{
  const e = dsEnv();
  e.sb.CBA.data.submitReceipt({ amount: 5, buyer: 'x' }, function () {});
  const p = e.pushed.find(x => x.action === 'submitReceipt');
  ok('🔴 submitReceipt (בקשת תושב) → שנת העבודה',
     !!p && p.payload.year === '\u05ea\u05e9\u05e4"\u05d6', p && p.payload.year);
  const opt = e.sb.CBA.mock.transactions[0];
  ok('והעותק האופטימי נושא אותה שנה', !!opt && opt.year === '\u05ea\u05e9\u05e4"\u05d6', opt && opt.year);
}
{
  /* קורא שמעביר שנה מפורשת — הוא מנצח (טופס ההוצאה). */
  const e = dsEnv();
  const row = e.sb.CBA.data.addTransaction({ amount: 10, year: '\u05ea\u05e9\u05e4"\u05d5' });
  ok('שנה מפורשת מהטופס מנצחת', row.year === '\u05ea\u05e9\u05e4"\u05d5', row.year);
}

section('6. טופס ההוצאה והסטייה הגלויה');
ok('הטופס נפתח על שנת העבודה', /year: CBA\.data\.getWorkingYear \? CBA\.data\.getWorkingYear\(\)/.test(EXP));
ok('🔴 והפער מוצג למשתמש ולא קורה בשקט',
   /drawer__year-note/.test(EXP));
ok('וההערה מופיעה רק בהוספה ורק כשיש פער',
   /!editing && _wy && _wy !== _cy/.test(EXP));
ok('🔴 והעריכה לא נגעה: תנועה קיימת שומרת את השנה שלה',
   /year: t\.year \|\| getCurrentYear\(\)/.test(DS));

console.log('\n' + (fail ? '\u2717' : '\u2713') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
