/* בדיקות "יומן תשלומים" במכון כושר (3.10.2026).  הרצה: node tools/test-gym-pay-log-2026-10-03.js
   🔴 מה המארז שומר עליו:
     1. עריכת תשלום משנה רק את השורה הנכונה, רושמת אירוע ביקורת, ומסנכרנת מחדש.
     2. ביטול תשלום = סוג האירוע הופך ל"תשלום מבוטל" (לא נמחק), ולא ניתן לבטל פעמיים או לערוך מבוטל.
     3. מגן מכפילות: אותו סכום לאותו מנוי בתוך 3 דקות נדחה; סכום אחר / מנוי אחר / אחרי 3 דקות — לא.
     4. חיווט: הרשאות, נתב, מפת תחומים, סנכרון דלת, לקוח. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs'), DOOR = R('apps-script/Door.gs'), GA = R('js/screens/gymAdmin.js'), DS = R('js/data/dataService.js');
function grab(re) { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; }

const HEAD = ['מזהה אירוע', 'מזהה מנוי', 'תאריך', 'סוג אירוע', 'סכום', 'אמצעי תשלום', 'אסמכתא', 'בתוקף עד (אחרי)', 'בוצע ע"י', 'הערה'];
function env(rows) {
  const data = [HEAD.slice()].concat(rows.map(r => r.slice()));
  const logs = []; let syncs = [];
  const sh = {
    getLastRow: () => data.length, getLastColumn: () => HEAD.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) { const row = []; for (let j = 0; j < (nc || 1); j++) row.push(data[r - 1 + i][c - 1 + j]); out.push(row); } return out; },
      getValue: () => data[r - 1][c - 1], setValue: v => { data[r - 1][c - 1] = v; }
    })
  };
  const box = {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) }, Session: { getScriptTimeZone: () => 'UTC' },
    SpreadsheetApp: { flush() {} }, Logger: { log() {} }, GYM_LOG_SHEET: 'יומן',
    ensureGymSheets_() {}, gymCols_: () => { const c = {}; HEAD.forEach((h, i) => c[h] = i + 1); return c; },
    gymLog_: (ss, id, type, extra) => logs.push({ id, type, extra }),
    gymPaymentSync_: (ss, id) => { syncs.push(id); return { ok: true, label: 'מסונכרן' }; },
  };
  vm.createContext(box);
  vm.runInContext([
    grab(/function gymToDate_\(v\) \{[\s\S]*?\n\}/),
    grab(/function gymRecentDuplicatePayment_\(ss, id, amount\) \{[\s\S]*?\n\}\n/),
    grab(/function gymLogRowByEvent_\(logSh, lc, eventId\) \{[\s\S]*?\n\}\n/),
    grab(/function updateGymPayment_\(ss, body\) \{[\s\S]*?\n\}\n/),
    grab(/function voidGymPayment_\(ss, body\) \{[\s\S]*?\n\}\n/),
  ].join('\n'), box);
  return { box, ss: { getSheetByName: () => sh }, data, logs, syncs: () => syncs };
}
const ev = (id, mid, amt, type, ago) => [id, mid, new Date(Date.now() - (ago || 0)), type || 'תשלום', amt, 'מזומן', '', '08/2027', 'a@x', ''];

section('1. עריכת תשלום');
{
  const e = env([ev('E1', 'GYM-8', 360), ev('E2', 'GYM-8', 360), ev('E3', 'GYM-9', 360)]);
  const r = e.box.updateGymPayment_(e.ss, { eventId: 'E2', amount: 180, method: 'ביט', note: 'טעות הקלדה', _email: 'm@x' });
  ok('ok + סנכרון מחדש למנוי הנכון', r.ok && e.syncs().length === 1 && e.syncs()[0] === 'GYM-8', JSON.stringify(r));
  ok('🔴 רק E2 השתנה', e.data[1][4] === 360 && e.data[2][4] === 180 && e.data[3][4] === 360 && e.data[2][5] === 'ביט');
  ok('אירוע ביקורת נרשם עם הערך הישן והחדש והסיבה', e.logs.length === 1 && e.logs[0].type === 'עריכת תשלום' && /360→180/.test(e.logs[0].extra.note) && /טעות הקלדה/.test(e.logs[0].extra.note));
  ok('תאריך חדש נשמר (חצות לא קופץ יום)', e.box.updateGymPayment_(e.ss, { eventId: 'E1', date: '2026-09-15' }).ok && e.data[1][2].getUTCDate() === 15);
  ok('סכום אפס נחסם', e.box.updateGymPayment_(e.ss, { eventId: 'E1', amount: 0 }).ok === false);
  ok('אירוע לא קיים', e.box.updateGymPayment_(e.ss, { eventId: 'NOPE', amount: 5 }).ok === false);
  const same = e.box.updateGymPayment_(e.ss, { eventId: 'E3', amount: 360 });
  ok('בלי שינוי — לא נרשם אירוע ביקורת', same.ok && same.unchanged === true);
}

section('2. ביטול תשלום');
{
  const e = env([ev('E1', 'GYM-8', 360), ev('E2', 'GYM-8', 360), ev('E3', 'GYM-8', 360)]);
  const r = e.box.voidGymPayment_(e.ss, { eventId: 'E2', reason: 'כפילות' });
  ok('הסוג הפך ל"תשלום מבוטל" (השורה לא נמחקה)', r.ok && e.data.length === 4 && e.data[2][3] === 'תשלום מבוטל');
  ok('🔴 שאר השורות נשארו תשלום', e.data[1][3] === 'תשלום' && e.data[3][3] === 'תשלום');
  ok('נרשם אירוע ביקורת + סנכרון', e.logs[0].type === 'ביטול תשלום' && /כפילות/.test(e.logs[0].extra.note) && e.syncs().length === 1);
  ok('לא ניתן לבטל פעמיים', e.box.voidGymPayment_(e.ss, { eventId: 'E2' }).ok === false);
  ok('לא ניתן לערוך תשלום מבוטל', e.box.updateGymPayment_(e.ss, { eventId: 'E2', amount: 5 }).ok === false);
}

section('3. מגן מכפילות');
{
  const e = env([ev('E1', 'GYM-8', 360, 'תשלום', 30000), ev('E2', 'GYM-7', 360, 'תשלום', 10000), ev('E3', 'GYM-6', 360, 'תשלום', 600000), ev('E4', 'GYM-5', 360, 'תשלום מבוטל', 5000)]);
  const f = e.box.gymRecentDuplicatePayment_;
  ok('🔴 אותו מנוי+סכום לפני 30 שניות → נתפס', f(e.ss, 'GYM-8', 360) >= 29);
  ok('סכום אחר → לא נתפס', f(e.ss, 'GYM-8', 100) === null);
  ok('מנוי אחר → לא נתפס', f(e.ss, 'GYM-1', 360) === null);
  ok('לפני 10 דקות → לא נתפס', f(e.ss, 'GYM-6', 360) === null);
  ok('תשלום מבוטל לא נחשב כפילות', f(e.ss, 'GYM-5', 360) === null);
  ok('🔴 gymActivate_ קורא למגן לפני כתיבה', /var dupAgo = gymRecentDuplicatePayment_\(ss, id, amount\);\s+if \(dupAgo !== null\)/.test(GS));
}

section('4. חיווט');
ok('ACTION_PERMS (שני הפעולות)', /updateGymPayment: PERM_GYM,/.test(GS) && /voidGymPayment: PERM_GYM,/.test(GS));
ok('נתב', /case 'updateGymPayment':\s+return json_\(updateGymPayment_\(ss, body\)\);/.test(GS) && /case 'voidGymPayment':\s+return json_\(voidGymPayment_\(ss, body\)\);/.test(GS));
ok('מפת תחומים', /updateGymPayment: 'gym', voidGymPayment: 'gym'/.test(GS));
ok('🔴 סנכרון אחרי עריכה/ביטול (מראה Firestore)', /GYM_SYNC_ACTIONS = \{[\s\S]*updateGymPayment: 1, voidGymPayment: 1/.test(DOOR));
ok('לקוח: כפתור "יומן תשלומים" בכרטיס', /data-ga-paylog/.test(GA) && />יומן תשלומים</.test(GA));
ok('לקוח: ביטול דורש אישור אדום', /ביטול תשלום[\s\S]{0,400}danger: true/.test(GA));
ok('לקוח: לא נפתח על תשובה חלקית (log ריק)', /gaLast && gaLast\.partial\) \{ CBA\.ui\.alert/.test(GA));
ok('dataService מיוצא', /updateGymPayment: updateGymPayment,/.test(DS) && /voidGymPayment: voidGymPayment,/.test(DS));

console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו' : '✅ הכול עבר') + ' (' + pass + ' עברו)');
process.exit(fail ? 1 : 0);
