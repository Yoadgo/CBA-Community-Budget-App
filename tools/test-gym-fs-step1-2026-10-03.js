/* בדיקות שלב 1 — מכון כושר מ-Firebase בלבד + תיקון ריצוד השמות (3.10.2026).
   הרצה: node tools/test-gym-fs-step1-2026-10-03.js
   🔴 מה המארז שומר עליו:
     1. מסמך המנוי (schema 2) כולל הצהרה/בריאות/יומן — ו**לא** כולל שם, אימייל, טלפון, ת.ז., תאריך לידה.
     2. המסך מצויר פעם **אחת** בלבד, ורק אחרי שהשמות כאן (אין "משפחה X" שמוחלף אחר כך).
     3. מראה לא זרוע (מסמך בלי schema 2) / דגל כבוי / שגיאה ⇒ נפילה לגיליון, לא מסך ריק.
     4. התשובה בצורה זהה ל-getGymList של Apps Script (שדות, יומן, הגדרות). */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GFS = R('apps-script/GymFirestore.gs'), CLIENT = R('js/data/gymFs.js');
function grab(re) { const m = GFS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; }

/* ---------- שרת ---------- */
section('1. 🔴 מסמך המנוי: מה נכנס ומה לא');
{
  const box = { Utilities: { formatDate: d => d.toISOString().slice(0, 10) }, Session: { getScriptTimeZone: () => 'UTC' } };
  vm.createContext(box);
  vm.runInContext([
    grab(/var GYM_MEMBER_FS_FIELDS = \[[\s\S]*?\];/), grab(/var GYM_MEMBER_FS_EXTRA = \[[\s\S]*?\];/),
    grab(/var GYM_LOG_FS_MAX = \d+;/), grab(/function gymFsDate_\(v\) \{[\s\S]*?\n\}/),
    grab(/function gymMemberDoc_\(row, who, events, qLabels\) \{[\s\S]*?\n\}\n/),
  ].join('\n'), box);
  const CD = vm.runInContext('Date', box);   // Date של ההקשר (instanceof לא עובד בין הקשרים)
  const row = { 'מזהה': 'GYM-1', 'סטטוס': 'פעיל', 'סה"כ שולם': 360, 'תאריך חתימה': new CD('2026-10-03'), 'קישור חתימה': 'https://d/x',
    'שם פרטי': 'דנה', 'שם משפחה': 'כהן', 'אימייל': 'a@x.com', 'טלפון': '050', 'ת.ז.': '123', 'תאריך לידה': '1980-01-01', 'מספר בית': '7',
    'מחלת לב': 'לא', 'סחרחורת': 'כן', 'עמודה חדשה אישית': 'סוד' };
  const doc = box.gymMemberDoc_(row, { familyId: '32', uid: 'u1', slot: 1 }, [{ id: 'L1' }], ['מחלת לב', 'סחרחורת']);
  ok('schema 2', doc.schema === 2);
  ok('סטטוס וסכום', doc['סטטוס'] === 'פעיל' && doc['סה"כ שולם'] === 360);
  ok('🔴 הצהרה: תאריך חתימה (כמחרוזת), קישור חתימה', doc['תאריך חתימה'] === '2026-10-03' && doc['קישור חתימה'] === 'https://d/x');
  ok('🔴 תשובות בריאות נכנסות (לפי כותרות השאלות)', doc['מחלת לב'] === 'לא' && doc['סחרחורת'] === 'כן');
  ok('יומן במסמך', Array.isArray(doc.log) && doc.log.length === 1);
  ['שם פרטי', 'שם משפחה', 'אימייל', 'טלפון', 'ת.ז.', 'תאריך לידה', 'מספר בית'].forEach(k => ok('🔴 לא נכנס: ' + k, !(k in doc)));
  ok('🔴 רשימת היתר: עמודה לא מוכרת לא נכנסת', !('עמודה חדשה אישית' in doc));
  ok('בלי יומן — מערך ריק (לא undefined)', Array.isArray(box.gymMemberDoc_(row, null, undefined, []).log));
}
section('2. יומן לפי מנוי');
{
  const box = {};
  vm.createContext(box);
  const CD = vm.runInContext('Date', box);
  const logRows = [
    { 'מזהה אירוע': 'B', 'מזהה מנוי': 'GYM-1', 'תאריך': new CD('2026-10-02T10:00:00Z'), 'סוג אירוע': 'תשלום', 'סכום': 360 },
    { 'מזהה אירוע': 'A', 'מזהה מנוי': 'GYM-1', 'תאריך': new CD('2026-10-01T10:00:00Z'), 'סוג אירוע': 'הקמה ידנית', 'סכום': '' },
    { 'מזהה אירוע': 'C', 'מזהה מנוי': 'GYM-2', 'תאריך': new CD('2026-10-03T10:00:00Z'), 'סוג אירוע': 'תשלום', 'סכום': 90 },
  ];
  for (let i = 0; i < 70; i++) logRows.push({ 'מזהה אירוע': 'X' + i, 'מזהה מנוי': 'GYM-3', 'תאריך': new CD(2026, 0, 1 + i), 'סוג אירוע': 'עריכה ידנית', 'סכום': '' });
  box.readTable_ = () => logRows;
  vm.runInContext([grab(/var GYM_LOG_FS_MAX = \d+;/), grab(/function gymLogByMember_\(ss\) \{[\s\S]*?\n\}\n/)].join('\n'), Object.assign(box, { GYM_LOG_SHEET: 'יומן' }));
  const ss = { getSheetByName: () => ({ getLastRow: () => 99 }) };
  const g = box.gymLogByMember_(ss);
  ok('מקובץ לפי מנוי', Object.keys(g).length === 3 && g['GYM-1'].length === 2);
  ok('ממוין: הישן ראשון', g['GYM-1'][0].id === 'A' && g['GYM-1'][1].id === 'B');
  ok('סכום ריק נשאר ריק, מספר נשאר מספר', g['GYM-1'][0].amount === '' && g['GYM-1'][1].amount === 360);
  ok('🔴 נחתך ל-60 האחרונים (מסמך לא גדל לנצח)', g['GYM-3'].length === 60 && g['GYM-3'][59].id === 'X69');
}

/* ---------- לקוח ---------- */
function clientEnv(opts) {
  opts = opts || {};
  const calls = []; const painted = [];
  const members = opts.members || [
    { id: 'GYM-5', 'מזהה': 'GYM-5', familyId: '32', slot: 1, schema: 2, 'סטטוס': 'פעיל', 'סה"כ שולם': 360,
      log: [{ id: 'L2', t: '2026-10-03T10:00:00Z', type: 'תשלום', amount: 360, method: 'מזומן', ref: '', until: '', by: 'm@x', note: 'n' },
            { id: 'L1', t: '2026-10-01T10:00:00Z', type: 'הקמה ידנית', amount: '', method: '', ref: '', until: '', by: 'm@x', note: '' }] }];
  const dirRows = [{ 'מזהה קבוע': '32', 'שם פרטי 1': 'דין', 'שם פרטי 2': 'רות', 'משפחה': 'ארגיל', 'מספר בית': '14' }];
  let dirCb = null;
  const sandbox = { window: {}, setTimeout, clearTimeout };
  sandbox.window = sandbox;
  sandbox.CBA = {
    fb: {
      ensureDb() {}, flag: (k, d) => (opts.flag === undefined ? d : opts.flag),
      readCollection: (c, cb) => { calls.push('col:' + c); cb(opts.fsErr ? new Error('x') : null, members); },
      readDoc: (c, id, cb) => { calls.push('doc:' + c + '/' + id); cb(null, c === 'gymConfig' && id === 'admin' ? (opts.noAdmin ? null : { settings: { a: 1 }, plans: [{ name: 'p' }], questions: [{ label: 'q' }], rules: [], hasEntryCode: true }) : null); }
    },
    data: {
      getGymList: cb => { calls.push('SHEETS'); cb({ ok: true, members: [], log: [], src: 'sheets' }); },
      getResidentDirectory: cb => { calls.push('dir'); if (opts.dirLate) dirCb = () => cb({ ok: true, rows: dirRows }); else cb({ ok: true, rows: dirRows }); }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(CLIENT, sandbox);
  return { CBA: sandbox.CBA, calls, painted, flushDir: () => dirCb && dirCb() };
}
section('3. 🔴 ציור אחד, אחרי שהשמות כאן');
{
  const e = clientEnv({ dirLate: true });
  e.CBA.data.getGymList(r => e.painted.push(r));
  ok('🔴 לפני שהספרייה הגיעה — אין ציור בכלל (אין "משפחה 32")', e.painted.length === 0);
  e.flushDir();
  ok('🔴 בדיוק ציור אחד', e.painted.length === 1);
  const r = e.painted[0];
  ok('שם מהספרייה, לא "משפחה 32"', r.members[0]['שם פרטי'] === 'דין' && r.members[0]['שם משפחה'] === 'ארגיל');
  ok('מספר בית מהספרייה', r.members[0]['מספר בית'] === '14');
  ok('🔴 לא נקרא הגיליון בכלל', e.calls.indexOf('SHEETS') === -1);
  ok('לא partial', !r.partial);
}
section('4. הצורה זהה ל-getGymList');
{
  const e = clientEnv(); let r; e.CBA.data.getGymList(x => r = x);
  ok('ok + הגדרות/מסלולים/שאלות/חוקים/hasEntryCode', r.ok && r.settings.a === 1 && r.plans.length === 1 && r.questions.length === 1 && Array.isArray(r.rules) && r.hasEntryCode === true);
  ok('יומן שטוח עם עמודות הגיליון', r.log.length === 2 && r.log[0]['מזהה אירוע'] === 'L1' && r.log[1]['סוג אירוע'] === 'תשלום' && r.log[1]['מזהה מנוי'] === 'GYM-5' && r.log[1]['סכום'] === 360);
  ok('שדות המנוי נשמרים (סטטוס, סכום)', r.members[0]['סטטוס'] === 'פעיל' && r.members[0]['סה"כ שולם'] === 360 && r.members[0]['מזהה'] === 'GYM-5');
  ok('log לא דולף כשדה בשורה', !('log' in r.members[0]));
  ok('getGymListSheets זמין (ת.ז./תאריך לידה בצפייה בהצהרה)', typeof e.CBA.data.getGymListSheets === 'function');
}
section('5. 🔴 נפילה לגיליון (לא מסך ריק)');
{
  const old = clientEnv({ members: [{ id: 'GYM-5', 'מזהה': 'GYM-5', familyId: '32', schema: 1 }] });
  let r1; old.CBA.data.getGymList(x => r1 = x);
  ok('מסמך schema 1 ⇒ גיליון', old.calls.indexOf('SHEETS') !== -1 && r1.src === 'sheets');
  const off = clientEnv({ flag: false }); let r2; off.CBA.data.getGymList(x => r2 = x);
  ok('דגל gymAdminFs:false ⇒ גיליון, בלי לקרוא Firestore', off.calls.join() === 'SHEETS' && r2.src === 'sheets');
  const err = clientEnv({ fsErr: true }); let r3; err.CBA.data.getGymList(x => r3 = x);
  ok('שגיאת Firestore ⇒ גיליון', r3.src === 'sheets');
  const noAdm = clientEnv({ noAdmin: true }); let r4; noAdm.CBA.data.getGymList(x => r4 = x);
  ok('אין מסמך הגדרות ⇒ גיליון', r4.src === 'sheets');
  const empty = clientEnv({ members: [] }); let r5; empty.CBA.data.getGymList(x => r5 = x);
  ok('אוסף ריק (לא זרוע) ⇒ גיליון', r5.src === 'sheets');
}
section('6. חיווט');
const GA = R('js/screens/gymAdmin.js'), DOOR = R('apps-script/Door.gs'), GS = R('apps-script/Code.gs');
ok('הצהרה: ת.ז. ותאריך לידה נמשכים מהגיליון רק בצפייה', /data-gd-pid/.test(GA) && /getGymListSheets/.test(GA));
ok('🔴 סנכרון אחרי עריכת/ביטול תשלום מזהה את המנוי לפי id מהתשובה', /var mid = body\.id \|\| \(parsed && parsed\.id\)/.test(DOOR));
ok('פעולת זריעה seedGymFirestore (הרשאה + נתב)', /seedGymFirestore: PERM_GYM/.test(GS) && /case 'seedGymFirestore'/.test(GS));
ok('🔴 לקוח שולח id של המנוי בעריכה/ביטול תשלום', (GA.match(/id: id, eventId/g) || []).length === 2);
ok('🔴 getResidentDirectory מיוצא מ-dataService (אחרת המסך נופל לגיליון)', /getResidentDirectory: getResidentDirectory,/.test(require('fs').readFileSync('js/data/dataService.js','utf8')));

console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו' : '✅ הכול עבר') + ' (' + pass + ' עברו)');
process.exit(fail ? 1 : 0);
