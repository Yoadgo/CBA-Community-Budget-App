/* אישור הרשמה בלי דריסה (6.10.26) — הבאג שדרס 9 משקי בית.
   הרצה:  node tools/test-signup-slots-2026-10-06.js
   הקוד נחלץ מהקבצים עצמם ומורץ מול גיליון מדומה עם הכותרות האמיתיות
   ועם המקרים האמיתיים (ציונית 506, ממן-פרייס 207, Keren/קרן ...). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs'), RES = R('js/screens/residents.js');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const grab = (src, re) => { const m = src.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };
const fnRe = fn => new RegExp('function ' + fn + '\\([^)]*\\) \\{[\\s\\S]*?\\n\\}');

const HEAD = ['מזהה קבוע','משפחה','מספר בית','סטטוס (פעיל/עזב)','סוג משתמש','שם פרטי 1','כתובת אימייל 1 ','מספר טלפון 1','מקצוע 1','תאריך לידה 1','ת.ז. 1','הרשאות 1','שם פרטי 2','כתובת אימייל 2','מספר טלפון 2','מקצוע 2','תאריך לידה 2','ת.ז. 2','הרשאות 2','שמות ילדים','הערות','תפקיד (תושב/מנהל)','סיור נצפה 1','סיור נצפה 2','מזהה Firebase 1','מזהה Firebase 2'];
const H = k => HEAD.findIndex(h => h.trim() === k);
function famRow(id, fam, house, n1, e1, p1, n2, e2, p2, extra) {
  const r = new Array(HEAD.length).fill('');
  r[H('מזהה קבוע')] = id; r[H('משפחה')] = fam; r[H('מספר בית')] = house; r[H('סטטוס (פעיל/עזב)')] = 'פעיל';
  r[H('שם פרטי 1')] = n1; r[H('כתובת אימייל 1')] = e1; r[H('מספר טלפון 1')] = p1;
  r[H('שם פרטי 2')] = n2; r[H('כתובת אימייל 2')] = e2; r[H('מספר טלפון 2')] = p2;
  Object.keys(extra || {}).forEach(k => r[H(k)] = extra[k]);
  return r;
}

/* ---------- גיליון מדומה ---------- */
function makeSheet(rows) {
  const data = rows.map(r => r.slice());
  return {
    data,
    getDataRange: () => ({ getValues: () => data.map(r => r.slice()) }),
    getLastRow: () => data.length,
    getLastColumn: () => data[0].length,
    appendRow: r => data.push(r.slice()),
    getRange: (row, col, nr, nc) => ({
      getValues: () => data.slice(row - 1, row - 1 + (nr || 1)).map(r => r.slice(col - 1, col - 1 + (nc || 1))),
      setValue: v => { data[row - 1][col - 1] = v; },
      setFontWeight: () => {}
    })
  };
}
const SU_HEAD = ['מזהה','תאריך בקשה','אימייל','שם פרטי','שם משפחה','מספר בית','סטטוס','שויך למשפחה','טופל בתאריך','טלפון'];
function setup(resRows, signups) {
  const res = makeSheet([HEAD].concat(resRows));
  const su = makeSheet([SU_HEAD].concat(signups.map(s => [s.id, '', s.email, s.first, s.last, s.house, 'ממתין', '', '', s.phone || ''])));
  const mails = [];
  const ss = { getSheetByName: n => n === 'תושבים' ? res : (n === 'בקשות הרשמה' ? su : null) };
  const box = {
    String, parseInt, isNaN, Array, Date, Logger: { log() {} },
    SIGNUP_HEADERS: SU_HEAD, RESIDENT_ID_HEADER: 'מזהה קבוע', CBA_APP_URL: 'x',
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    normalizeEmail_: e => String(e || '').trim().toLowerCase(),
    getSignupsSheet_: () => su,
    signupRowById_: (sh, id) => { const v = sh.data; for (let r = 1; r < v.length; r++) if (String(v[r][0]) === String(id)) return r + 1; return -1; },
    sendResidentTemplate_: (ss, t, to) => mails.push(t + ':' + to)
  };
  vm.createContext(box);
  ['signupNameKey_', 'signupNameMatch_', 'signupSlotPlan_', 'approveSignup_'].forEach(fn => vm.runInContext(grab(GS, fnRe(fn)), box));
  return { box, ss, res, su, mails, cell: (row, k) => res.data[row - 1][H(k)] };
}

section('1. 🔴 המקרה האמיתי — ציונית 506: אוהד (משבצת 2) נרשם, עומרי (משבצת 1) לא נמחקת');
{
  const t = setup([famRow('F1', 'ציונית', '506', 'עומרי', '', '052-5012663', 'אוהד', '', '054-4858559')],
                  [{ id: 'S1', email: 'ohad@x', first: 'Ohad', last: 'Tzionit', house: '506', phone: '0544858559' }]);
  let r = t.box.approveSignup_(t.ss, { id: 'S1', residentRowIndex: 2 });
  ok('Ohad (באנגלית) מול עומרי/אוהד ⇒ לא מאשר לבד (needChoice)', !r.ok && r.needChoice && r.kind === 'ambiguous', JSON.stringify(r));
  ok('🔴🔴 עומרי לא נגעו בה', t.cell(2, 'שם פרטי 1') === 'עומרי' && t.cell(2, 'מספר טלפון 1') === '052-5012663');
  ok('לא נשלח מייל אישור', t.mails.length === 0);
  ok('הבקשה עדיין ממתינה', t.su.data[1][6] === 'ממתין');
  r = t.box.approveSignup_(t.ss, { id: 'S1', residentRowIndex: 2, slot: 1, mode: 'claim' });
  ok('בחירת מנהל "זה אוהד" (משבצת 2, claim) ⇒ מאושר', r.ok && r.slot === 1 && r.mode === 'claim', JSON.stringify(r));
  ok('המייל נכנס למשבצת 2', t.cell(2, 'כתובת אימייל 2') === 'ohad@x');
  ok('השם "אוהד" נשמר (לא הוחלף ב-Ohad)', t.cell(2, 'שם פרטי 2') === 'אוהד');
  ok('🔴🔴 עומרי עדיין במשבצת 1', t.cell(2, 'שם פרטי 1') === 'עומרי' && t.cell(2, 'כתובת אימייל 1') === '');
  ok('מייל אישור נשלח פעם אחת', t.mails.length === 1);
}

section('2. שם תואם בעברית ⇒ חיבור אוטומטי למשבצת הנכונה');
{
  const t = setup([famRow('F2', 'ממן-פרייס', '207', 'עמליה', '', '052-4521902', 'מאיר', '', '054-3064399')],
                  [{ id: 'S2', email: 'meir@x', first: 'מאיר', last: 'ממן', house: '207', phone: '0543064399' }]);
  const r = t.box.approveSignup_(t.ss, { id: 'S2', residentRowIndex: 2 });
  ok('אישור בלי בחירה ⇒ משבצת 2 (שם תואם)', r.ok && r.slot === 1 && r.mode === 'claim', JSON.stringify(r));
  ok('🔴🔴 עמליה נשארה', t.cell(2, 'שם פרטי 1') === 'עמליה' && t.cell(2, 'מספר טלפון 1') === '052-4521902');
  ok('מאיר קיבל מייל', t.cell(2, 'כתובת אימייל 2') === 'meir@x');
}

section('3. שתי המשבצות רשומות ⇒ חסום, אף אחד לא נדרס');
{
  const t = setup([famRow('F3', 'פרינץ', '706', 'רז', 'raz@x', '1', 'רוני', 'roni@x', '2')],
                  [{ id: 'S3', email: 'new@x', first: 'דנה', last: 'כהן', house: '706' }]);
  let r = t.box.approveSignup_(t.ss, { id: 'S3', residentRowIndex: 2 });
  ok('אוטומטי ⇒ needChoice kind=full', !r.ok && r.needChoice && r.kind === 'full');
  r = t.box.approveSignup_(t.ss, { id: 'S3', residentRowIndex: 2, slot: 1, mode: 'replace' });
  ok('🔴🔴 גם "replace" מפורש על משבצת רשומה ⇒ נחסם', !r.ok);
  ok('רוני ורז במקומם', t.cell(2, 'כתובת אימייל 1') === 'raz@x' && t.cell(2, 'כתובת אימייל 2') === 'roni@x');
  r = t.box.approveSignup_(t.ss, { id: 'S3', newFamily: true });
  ok('"משק בית חדש" ⇒ עובד', r.ok && r.row === 3 && t.cell(3, 'כתובת אימייל 1') === 'new@x' && t.cell(3, 'משפחה') === 'כהן');
}

section('4. החלפה מפורשת (replace) — הישן נמחק כולל טלפון ופרטים');
{
  const t = setup([famRow('F4', 'גור', '306', 'רותם', '', '050-1', 'רועי', 'roei@x', '050-2', { 'מקצוע 1': 'סטודנטית' })],
                  [{ id: 'S4', email: 'gal@x', first: 'גל', last: 'גור', house: '306' }]);
  let r = t.box.approveSignup_(t.ss, { id: 'S4', residentRowIndex: 2, slot: 0 });
  ok('שם שונה בלי mode ⇒ needChoice', !r.ok && r.needChoice);
  r = t.box.approveSignup_(t.ss, { id: 'S4', residentRowIndex: 2, slot: 0, mode: 'replace' });
  ok('replace ⇒ מאושר ומחזיר את מי שהוחלף', r.ok && r.replaced === 'רותם');
  ok('שם/מייל חדשים במשבצת 1', t.cell(2, 'שם פרטי 1') === 'גל' && t.cell(2, 'כתובת אימייל 1') === 'gal@x');
  ok('הטלפון והמקצוע של רותם נמחקו (לא עוברים בירושה)', t.cell(2, 'מספר טלפון 1') === '' && t.cell(2, 'מקצוע 1') === '');
  ok('רועי (משבצת 2) לא נפגע', t.cell(2, 'כתובת אימייל 2') === 'roei@x');
}

section('5. מקרי קצה');
{
  const t = setup([famRow('F5', 'א', '1', '', '', '', '', '', ''), famRow('F6', 'ב', '2', 'קרן', '', '', '', '', '')],
                  [{ id: 'S5', email: 'a@x', first: 'יעל', last: 'א', house: '1' },
                   { id: 'S6', email: 'a@x', first: 'יעל', last: 'א', house: '1' },
                   { id: 'S7', email: 'k@x', first: 'Keren', last: 'ב', house: '2' }]);
  let r = t.box.approveSignup_(t.ss, { id: 'S5', residentRowIndex: 2 });
  ok('שורה ריקה ⇒ משבצת 1 (fill)', r.ok && r.slot === 0 && r.mode === 'fill');
  r = t.box.approveSignup_(t.ss, { id: 'S5', residentRowIndex: 2 });
  ok('אישור כפול של אותה בקשה ⇒ נחסם ("כבר טופלה")', !r.ok && /טופלה/.test(r.error));
  r = t.box.approveSignup_(t.ss, { id: 'S6', residentRowIndex: 3 });
  ok('מייל שכבר רשום במשפחה אחרת ⇒ נחסם', !r.ok && /כבר רשום/.test(r.error));
  r = t.box.approveSignup_(t.ss, { id: 'S7', residentRowIndex: 3 });
  ok('Keren מול "קרן" + משבצת ריקה ⇒ needChoice (לא מנחשים)', !r.ok && r.needChoice && r.kind === 'ambiguous');
  r = t.box.approveSignup_(t.ss, { id: 'S7', residentRowIndex: 3, slot: 0, mode: 'claim' });
  ok('"אותו אדם" ⇒ השם קרן נשמר, המייל נוסף', r.ok && t.cell(3, 'שם פרטי 1') === 'קרן' && t.cell(3, 'כתובת אימייל 1') === 'k@x');
}

section('6. הלקוח (resSlotPlan) מסכים עם השרת על כל מקרה');
{
  const cbox = { String, resVal: (row, col) => col ? String(row[col] == null ? '' : row[col]).trim() : '' };
  vm.createContext(cbox);
  ['resNameKey', 'resNameMatch', 'resSlotPlan'].forEach(fn => vm.runInContext(grab(RES, fnRe(fn)), cbox));
  const sbox = { String };
  vm.createContext(sbox);
  ['signupNameKey_', 'signupNameMatch_', 'signupSlotPlan_'].forEach(fn => vm.runInContext(grab(GS, fnRe(fn)), sbox));
  const c = { email: ['כתובת אימייל 1', 'כתובת אימייל 2'], firstName: ['שם פרטי 1', 'שם פרטי 2'] };
  const cases = [
    ['עומרי', '', 'אוהד', '', 'Ohad'], ['עומרי', '', 'אוהד', '', 'אוהד'], ['עמליה', '', 'מאיר', '', 'מאיר'],
    ['', '', '', '', 'דנה'], ['רז', 'r@x', '', '', 'רוני'], ['רז', 'r@x', 'רוני', 'n@x', 'דנה'],
    ['קרן', '', '', '', 'Keren'], ['נעה ראובני הראל', '', 'ניצן', '', 'ניצן'], ['נטע גלפרין', '', 'אור', '', 'נטע'],
    ['רז', 'r@x', 'רוני', '', 'Roni'], ['', '', 'יובל', '', 'דנה']
  ];
  let agree = 0;
  cases.forEach(([n1, e1, n2, e2, first]) => {
    const row = { 'שם פרטי 1': n1, 'כתובת אימייל 1': e1, 'שם פרטי 2': n2, 'כתובת אימייל 2': e2 };
    const a = cbox.resSlotPlan({ firstName: first }, row, c);
    const b = sbox.signupSlotPlan_([n1, e1, n2, e2], { email: [1, 3], first: [0, 2] }, first);
    if (a.auto === b.auto && a.kind === b.kind) agree++;
    else console.log('    פער:', JSON.stringify({ n1, e1, n2, e2, first, client: [a.auto, a.kind], server: [b.auto, b.kind] }));
  });
  ok('לקוח ושרת זהים ב-' + cases.length + ' מקרים', agree === cases.length, agree + '/' + cases.length);
  const p = cbox.resSlotPlan({ firstName: 'נטע' }, { 'שם פרטי 1': 'נטע גלפרין', 'כתובת אימייל 1': '', 'שם פרטי 2': 'אור', 'כתובת אימייל 2': '' }, c);
  ok('"נטע" תואם ל"נטע גלפרין" (שם פרטי ראשון)', p.kind === 'match' && p.auto === 0);
  const q = cbox.resSlotPlan({ firstName: 'דנה' }, { 'שם פרטי 1': '', 'כתובת אימייל 1': '', 'שם פרטי 2': 'יובל', 'כתובת אימייל 2': '' }, c);
  ok('משבצת ריקה + שם אחר לצידה ⇒ ambiguous (לא לנחש)', q.kind === 'ambiguous' && q.auto === -1);
}

section('7. חיווט במסך');
{
  ok('כפתור האישור שולח slot+mode', /payload\.slot = parseInt\(pick\.value/.test(RES) && /payload\.mode = pick\.value/.test(RES));
  ok('החלפה דורשת אישור אדום', /title: "להחליף דייר\/ת\?"[\s\S]{0,80}danger: true/.test(RES));
  ok('האישור המרוכז משתמש בתוכנית המשבצות', /var free = plan\.auto > -1;/.test(RES));
  ok('כשהכול תפוס — המלצות: עריכה / משק בית חדש / דחייה', /data-su-edit/.test(RES) && /data-su-new/.test(RES) && /לדחות אותה/.test(RES));
  ok('הקוד הישן ("כותב לאחרונה") נעלם מהשרת', !/if \(slot === -1\) slot = emailCols\.length - 1;/.test(GS));
}

console.log('\n' + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
