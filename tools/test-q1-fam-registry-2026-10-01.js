/* Q1 (1.10.2026) — רשימת המשפחות לכלל `txOwnerOk`.
   🔴 הבדיקה המרכזית: המזהה ש-`famRegistryIds_` מפרסם זהה בדיוק למזהה
   ש-`lookupResident_` מחזיר לכל שורה — אחרת הכלל ידחה בשקט. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8');
const RULES = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const fn = n => { const i = CODE.indexOf('function ' + n + '('); let d = 0, j = CODE.indexOf('{', i);
  for (let k = j; k < CODE.length; k++) { if (CODE[k] === '{') d++; else if (CODE[k] === '}' && --d === 0) return CODE.slice(i, k + 1); } };
const cst = n => (CODE.match(new RegExp('^var ' + n + ' += .*$', 'm')) || [''])[0];

function sheet(rows) {
  return { getSheetByName: n => n === 'תושבים' ? { getDataRange: () => ({ getValues: () => rows }) } : null };
}
const HEAD = ['בית', 'שם משפחה', 'שם פרטי 1', 'אימייל 1', 'הרשאות 1', 'שם פרטי 2', 'אימייל 2', 'תפקיד', 'סטטוס', 'מזהה קבוע', 'סוג משתמש'];
const ROWS = [HEAD,
  ['12', 'כהן', 'דנה', 'a@x.com', '', 'רון', 'b@x.com', '', 'פעיל', '7', ''],
  ['14', 'לוי', 'מיה', 'c@x.com', '', '', '', '', 'עזב', '', ''],      // בלי מזהה קבוע → בית
  ['16', 'גנן', 'יוסי', 'd@x.com', '', '', '', '', 'פעיל', '9', 'חיצוני'],
  ['18', 'דוד', 'אלי', 'e@x.com', '', '', '', '', 'פעיל', '7', '']];   // כפול — פעם אחת ברשימה
const sb = { SpreadsheetApp: { getActiveSpreadsheet: () => sheet(ROWS) }, normalizeEmail_: e => String(e || '').trim().toLowerCase(),
  fsSet_: (p, o) => { sb.written = [p, o]; } };
vm.createContext(sb);
vm.runInContext([cst('RESIDENT_ID_HEADER'), cst('PERM_HEADER'), cst('EXTERNAL_HEADER'), cst('EXTERNAL_VALUE'), cst('FS_FAM_REGISTRY'),
  fn('lookupResident_'), fn('famRegistryIds_'), fn('famRegistryWrite_')].join('\n'), sb);

console.log('\n1. אותו מזהה כמו lookupResident_');
const ids = sb.famRegistryIds_(sheet(ROWS));
['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com', 'e@x.com'].forEach(m => {
  const r = sb.lookupResident_(m);
  ok('🔴 ' + m + ' → ' + r.familyId + ' ברשימה', r.found && ids.indexOf(r.familyId) !== -1, JSON.stringify(ids));
});
ok('בלי כפילויות', ids.length === new Set(ids).size && ids.join(',') === '7,14,9', ids.join(','));
ok('⚠️ גם מי שעזב ברשימה (הוצאה ישנה עדיין ניתנת לעריכה)', ids.indexOf('14') !== -1);
ok('מחרוזות בלבד (הכלל משווה ל-string)', ids.every(x => typeof x === 'string'));

console.log('\n2. הכתיבה');
const w = sb.famRegistryWrite_();
ok('נכתב ל-famRegistry/ids', w.ok && sb.written[0] === 'famRegistry/ids', JSON.stringify(w));
ok('🔒 רק מזהים — בלי שמות ובתים', Object.keys(sb.written[1]).sort().join(',') === 'ids,n,schema,updatedAt');
ok('בלי טאב — לא זורק', sb.famRegistryWrite_({ getSheetByName: () => null }).ok === false);
ok('שגיאת כתיבה — לא זורקת', (() => { const o = sb.fsSet_; sb.fsSet_ = () => { throw new Error('x'); };
  const r = sb.famRegistryWrite_(); sb.fsSet_ = o; return r.ok === false; })());

console.log('\n3. החיבורים');
ok('🔴 מתעדכן בכל שינוי בתחום תושבים (bumpRev_)',
   /if \(doms\.indexOf\('residents'\) !== -1\) famRegistryWrite_\(\);/.test(fn('bumpRev_')));
ok('🔴 ובכל שעה (רשת ביטחון)', /hjM\('famRegistryWrite_'\);\s*var fr = famRegistryWrite_\(ss\);/.test(CODE));
ok('🔴 הכלל קורא את אותו נתיב', /documents\/famRegistry\/ids\)\.data\.ids/.test(RULES) && /FS_FAM_REGISTRY = 'famRegistry\/ids'/.test(CODE));

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
