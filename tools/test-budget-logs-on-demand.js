
/* בדיקות ל"עדכוני תקציב ויומן הערות לפי דרישה" (2026-09-16, פעולה 4).
   הרצה:  node tools/test-budget-logs-on-demand.js

   מריץ את js/data/sheets.js **האמיתי** מול fetch מדומה, ובודק את הצד
   השרתי בקוד עצמו.

   🔴🔴 מה המארז שומר עליו:

     1. **רענון ברקע לא מוחק יומן שנמשך לפי דרישה.** apply() רץ שוב
        ושוב; אם הוא היה כותב מערך ריק על מה שנמשך, מסך התכנון היה
        מאבד את קווי הבסיס ואת תגיות "עודכן" באמצע העבודה — בלי שום
        שגיאה. בשביל זה קיים הדגל hasLogs.

     2. **לקוח חדש מול שרת ישן ממשיך לעבוד.** שרת ישן שולח את
        היומנים במטען; אז הם מקור האמת ואין קריאה נוספת.

     3. **מיפוי אחד לשני המסלולים.** אותן שתי פונקציות ממירות גם את
        המטען וגם את התשובה לפי דרישה — שני מיפויים מקבילים לאותן
        עמודות עבריות היו נפרדים בשקט בשינוי הראשון.

     4. **ההרשאה לא ירדה.** היומנים נושאים שם של עורך וטקסט חופשי,
        ולכן הפעולה דורשת PERM_BUDGET — בדיוק כמו seesBudget שסינן
        אותם במטען הראשי. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const SRC  = R('js/data/sheets.js');
const GS   = R('apps-script/Code.gs');
const DS   = R('js/data/dataService.js');
const PLAN = R('js/screens/planning.js');
const NOTES = R('js/screens/notes.js');

/* ---------- סביבה (אותה תבנית כמו test-year-on-demand) ---------- */
let fetchLog, nextRes;
function makeEnv() {
  fetchLog = []; nextRes = null;
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const sandbox = {
    console: { log() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: (url) => { fetchLog.push(String(url));
                      return Promise.resolve({ json: () => Promise.resolve(nextRes) }); }
  };
  sandbox.window = sandbox;
  sandbox.CBA = { mock: store, authSession: 'SESS', esc: s => String(s) };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const YEAR = 'תשפ"ז';
function payload(withLogs) {
  const p = { ok: true, rev: 100, years: [YEAR], currentYear: YEAR, settings: {},
              notes: {}, groups: [],
              data: { [YEAR]: { budget: [], income: [], groups: [], splits: [], items: [],
                                transactions: [] } } };
  if (withLogs) {
    p.updates = [{ 'תאריך': '2026-09-01', 'שנה': YEAR, 'סעיף': 'גינון', 'מ': 100, 'אל': 150, 'סיבה': 'תוספת' }];
    p.notesLog = [{ 'תאריך': '2026-09-02', 'שעה': '10:00', 'שנה': YEAR, 'נערך ע"י': 'יועד' }];
  }
  return p;
}

(async function () {

section('1. השרת — שני היומנים ירדו מהמטען הראשי');
{
  const out = GS.match(/var out = \{\n      \/\/ מספר הגרסה[\s\S]*?settings: publicSettings, data: \{\}\n    \};/);
  ok('נמצא בלוק המטען', !!out);
  const body = out ? out[0] : '';
  ok('🔴 אין יותר updates במטען', !/updates:/.test(body));
  ok('🔴 אין יותר notesLog במטען', !/notesLog:/.test(body));
  ok('⚠️ ותוכן פנקס ההערות **כן** נשאר — buildYear בונה ממנו את year.notes',
     /notes: seesBudget \? cached_\('cba_notes_/.test(body));
}

section('2. השרת — הפעולה החדשה, ההרשאה והמטמון');
{
  ok('יש handleBudgetLogs_', /function handleBudgetLogs_\(p\) \{/.test(GS));
  ok('🔴🔴 והיא דורשת PERM_BUDGET', /function handleBudgetLogs_[\s\S]{0,300}authorize_\(ss, p, PERM_BUDGET\)/.test(GS));
  ok('🔴 וגם בשער העליון של doGet', /budgetLogs: PERM_BUDGET/.test(GS));
  ok('ומנותבת ב-doGet', /action === 'budgetLogs'\) \{\n      return handleBudgetLogs_\(e\.parameter\);/.test(GS));
  ok('⚠️ ואותן מפתחות מטמון בדיוק כמו קודם',
     /cached_\('cba_updates_' \+ stamp/.test(GS) && /cached_\('cba_noteslog_' \+ stamp/.test(GS));
  ok('⚠️ ומפתח אחד לשניהם (budgetStamp_ נקרא פעם אחת)',
     /function handleBudgetLogs_[\s\S]{0,400}var stamp = budgetStamp_\(\);/.test(GS));
  ok('🔴 וכישלון מחזיר ok:false ולא זורק',
     /function handleBudgetLogs_[\s\S]{0,700}catch \(err\) \{\n    return json_\(\{ ok: false, error: String\(err\) \}\);/.test(GS));
}

section('3. הלקוח — מיפוי אחד לשני המסלולים');
{
  ok('mapUpdates חולצה', /function mapUpdates\(rows\) \{/.test(SRC));
  ok('mapNotesLog חולצה', /function mapNotesLog\(rows\) \{/.test(SRC));
  ok('🔴 transform קורא להן', /var updates = mapUpdates\(payload\.updates\);/.test(SRC) &&
     /var notesLog = mapNotesLog\(payload\.notesLog\);/.test(SRC));
  ok('🔴 וגם loadBudgetLogs', /CBA\.mock\.budgetUpdates = mapUpdates\(res\.updates\);/.test(SRC) &&
     /CBA\.mock\.notesLog = mapNotesLog\(res\.notesLog\);/.test(SRC));
  ok('🔴🔴 ואין מיפוי שלישי מקביל',
     (SRC.match(/mapUpdates\(/g) || []).length === 3 && (SRC.match(/mapNotesLog\(/g) || []).length === 3,
     'mapUpdates=' + (SRC.match(/mapUpdates\(/g) || []).length);
}

section('4. מטען חדש (בלי יומנים) — לא דורס, ולא מסמן כטעון');
{
  const env = makeEnv(); const S = env.CBA.sheets; const st = env.CBA.mock;
  nextRes = payload(false);
  await new Promise(r => S.load(() => r()));
  await wait(5);
  ok('המטען נקלט', st.currentYear === YEAR, String(st.currentYear));
  ok('🔴🔴 והיומן **לא** סומן כטעון', !st._logsLoaded);
  /* עכשיו נמשך לפי דרישה, ואז רענון ברקע — היומן חייב לשרוד */
  nextRes = { ok: true,
    updates: [{ 'תאריך': '2026-09-01', 'שנה': YEAR, 'סעיף': 'גינון', 'מ': 100, 'אל': 150, 'סיבה': 'תוספת' }],
    notesLog: [{ 'תאריך': '2026-09-02', 'שעה': '10:00', 'שנה': YEAR, 'נערך ע"י': 'יועד' }] };
  let got = null;
  S.loadBudgetLogs(function (o) { got = o; });
  await wait(10);
  ok('loadBudgetLogs הצליחה', got === true, String(got));
  ok('הכתובת היא action=budgetLogs', fetchLog.some(u => /action=budgetLogs/.test(u)),
     fetchLog.join(' | '));
  ok('העדכון הומר', st.budgetUpdates.length === 1 && st.budgetUpdates[0].from === 100 &&
     st.budgetUpdates[0].to === 150 && st.budgetUpdates[0].section === 'גינון',
     JSON.stringify(st.budgetUpdates));
  ok('ויומן ההערות הומר, כולל שם העורך',
     st.notesLog.length === 1 && st.notesLog[0].editedBy === 'יועד' && st.notesLog[0].time === '10:00',
     JSON.stringify(st.notesLog));
  ok('והדגל נדלק', st._logsLoaded === true);

  nextRes = payload(false);
  await new Promise(r => S.load(() => r()));
  await wait(5);
  ok('🔴🔴 רענון ברקע **לא מחק** את מה שנמשך', st.budgetUpdates.length === 1 && st.notesLog.length === 1,
     JSON.stringify([st.budgetUpdates.length, st.notesLog.length]));
}

section('5. שרת ישן — המטען הוא מקור האמת, בלי קריאה נוספת');
{
  const env = makeEnv(); const S = env.CBA.sheets; const st = env.CBA.mock;
  nextRes = payload(true);
  await new Promise(r => S.load(() => r()));
  await wait(5);
  ok('🔴 היומנים הגיעו מהמטען', st.budgetUpdates.length === 1 && st.notesLog.length === 1);
  ok('🔴🔴 והדגל נדלק — ensure לא תצא לרשת', st._logsLoaded === true);
  ok('⚠️ ושם העורך עבר גם במסלול הזה', st.notesLog[0].editedBy === 'יועד');
}

section('6. מטען עם יומן ריק — עדיין נחשב "נשלח"');
{
  const env = makeEnv(); const S = env.CBA.sheets; const st = env.CBA.mock;
  const p = payload(false); p.updates = []; p.notesLog = [];
  nextRes = p;
  await new Promise(r => S.load(() => r()));
  await wait(5);
  ok('🔴 מערך ריק ≠ "לא נשלח"', st._logsLoaded === true);
  ok('והיומנים ריקים', st.budgetUpdates.length === 0 && st.notesLog.length === 0);
}

section('7. ensureBudgetLogs — שער אחד, בלי לולאות');
{
  ok('קיימת ומיוצאת', /function ensureBudgetLogs\(cb\)/.test(DS) && /ensureBudgetLogs: ensureBudgetLogs/.test(DS));
  ok('🔴 מחזירה false כשכבר טעון', /if \(CBA\.mock\._logsLoaded\) return cb\(false\);/.test(DS));
  ok('🔴 ושומרת מפני שתי קריאות במקביל', /if \(logsInFlight\) return cb\(false\);/.test(DS));
  ok('⚠️ ולא יוצאת לרשת כשאין חיבור לגיליון', /CBA\.sheets\.isConnected\(\)\)\) return cb\(false\);/.test(DS));
  ok('⚠️ וכישלון לא נועל — אין דגל "כבר ניסינו"', !/_logsTried/.test(DS));
}

section('8. המסכים שצורכים');
{
  ok('🔴 מסך התכנון מוודא טעינה', /CBA\.data\.ensureBudgetLogs\(function \(changed\)/.test(PLAN));
  ok('🔴🔴 ומצייר מחדש **רק** כשהגיעו נתונים — אחרת לולאה אין-סופית',
     /if \(changed && container && container\.isConnected\) CBA\.screens\.planning\.render\(container\);/.test(PLAN));
  ok('🔴 ומסך ההערות פותח מיד ומחליף שורות כשהיומן מגיע',
     /function logRowsHTML\(\)/.test(NOTES) && /tbl\.innerHTML = logRowsHTML\(\)/.test(NOTES));
  ok('⚠️ ושמירת פנקס מסמנת את היומן כלא-טעון', /if \(res && res\.ok === true\) CBA\.mock\._logsLoaded = false;/.test(DS));
}

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
})();
