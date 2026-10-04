/* בורר תושבים להקמת מנוי מכון (3.10.26).  הרצה: node tools/test-gym-picker-2026-10-03.js
   🔴 שומר על: (1) האימייל יוצא רק למנהל מכון; (2) רק פעילים עם אימייל, בלי חיצוניים;
   (3) בלי ת.ז./תאריך לידה; (4) הלקוח: בחירה ממלאת שדות, ואימייל שלא ברשימה נחסם. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs'), GA = R('js/screens/gymAdmin.js'), DS = R('js/data/dataService.js');
const grab = re => { const m = GS.match(re); if (!m) throw new Error('לא נמצא ' + re); return m[0]; };

const H = ['מזהה קבוע', 'בית', 'משפחה', 'שם פרטי 1', 'אימייל 1', 'טלפון 1', 'שם פרטי 2', 'אימייל 2', 'טלפון 2', 'סטטוס', 'סוג משתמש', 'ת.ז.', 'תאריך לידה'];
const ROWS = [
  ['F1', '5', 'כהן', 'דנה', 'Dana@x.com', '050', 'רון', 'ron@x.com', '052', 'פעיל', '', '123', '1990'],
  ['F2', '6', 'לוי', 'מיה', 'mia@x.com', '051', '', '', '', 'עזב', '', '', ''],
  ['F3', '7', 'ספק', 'קובי', 'k@x.com', '', '', '', '', 'פעיל', 'חיצוני', '', ''],
  ['F4', '8', 'בר', 'נועה', '', '', '', '', '', '', '', '', ''],
];
function run(authOk) {
  const sh = { getDataRange: () => ({ getValues: () => [H].concat(ROWS) }) };
  const box = {
    PERM_GYM: 'מכון', PERM_HEADER: 'הרשאות', RESIDENT_ID_HEADER: 'מזהה קבוע', EXTERNAL_HEADER: 'סוג משתמש', EXTERNAL_VALUE: 'חיצוני',
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sh }) },
    authorize_: (ss, p, need) => { box.needSeen = need; return authOk ? { ok: true } : { ok: false, error: 'אין הרשאה' }; },
    json_: o => o, normalizeEmail_: e => String(e || '').trim().toLowerCase(),
  };
  vm.createContext(box);
  vm.runInContext(grab(/function handleGymResidentPicker_\(p\) \{[\s\S]*?\n\}\n/), box);
  return { res: box.handleGymResidentPicker_({}), box };
}
console.log('\n1. שרת');
{
  const { res, box } = run(true);
  ok('דורש PERM_GYM', box.needSeen === 'מכון');
  ok('2 עם אימייל + נועה בלי אימייל (noEmail) ; בלי עזב ובלי חיצוני', res.ok && res.rows.length === 3 && res.rows.filter(r => r.noEmail).length === 1 && res.rows.filter(r => !r.noEmail).length === 2, JSON.stringify(res));
  ok('🔴 בלי אימייל = email ריק ו-noEmail:true', res.rows.some(r => r.noEmail && r.email === '' && r.first === 'נועה'));
  ok('אימייל מנורמל + שם + בית + rid + טלפון לפי משבצת', res.rows[0].email === 'dana@x.com' && res.rows[0].first === 'דנה' && res.rows[0].house === '5' && res.rows[0].rid === 'F1' && res.rows[0].phone === '050');
  ok('בן/בת הזוג (משבצת 2) מקבל את הטלפון שלו', res.rows[1].email === 'ron@x.com' && res.rows[1].phone === '052');
  ok('🔴 אין ת.ז./תאריך לידה בתשובה', !/123|1990|ת\.ז|לידה/.test(JSON.stringify(res)));
  const d = run(false).res;
  ok('🔴 בלי הרשאה — שגיאה ואין שורות', d.ok === false && !d.rows);
}
console.log('\n2. חיווט');
ok('GET_ACTION_PERMS: gymResidentPicker = PERM_GYM', /gymResidentPicker: PERM_GYM,/.test(GS));
ok('נתב doGet', /action === 'gymResidentPicker'\) \{\s+return handleGymResidentPicker_\(e\.parameter\);/.test(GS));
ok('dataService מיוצא, בלי localStorage', /getGymResidentPicker: getGymResidentPicker,/.test(DS) && !/gymPickerCache[^\n]*localStorage/.test(DS));
ok('🔴 אין שימוש ב-residentDirectory להוספת אימייל (נשאר בלי אימייל)', !/\["אימייל|email/.test(GS.match(/function handleResidentDirectory_[\s\S]*?\n\}\n/)[0].replace(/אימייל\/טלפון/g, '')));
ok('🔴 שרת ישן (תשובה בלי rows) לא נחשב רשימה ריקה', /Array\.isArray\(res\.rows\)/.test(DS.match(/function getGymResidentPicker[\s\S]*?\n  \}\n/)[0]));
console.log('\n3. לקוח');
ok('שדה האימייל הוא שדה החיפוש (ac-list + בחירה)', /data-gc-list/.test(GA) && /data-gc-idx/.test(GA));
ok('בחירה ממלאת שם פרטי, משפחה וטלפון', /setField\("firstName", r\.first\); setField\("lastName", r\.family\)/.test(GA) && /setField\("phone", r\.phone\)/.test(GA));
ok('🔴 אימייל שלא ברשימה נחסם לפני שליחה', /האימייל לא רשום בטאב "תושבים"/.test(GA));
ok('אם הבורר לא נטען — השדה חופשי (השרת מאמת)', /if \(pickRows && !picked\)/.test(GA));
console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו' : '✅ הכול עבר') + ' (' + pass + ' עברו)');
process.exit(fail ? 1 : 0);
