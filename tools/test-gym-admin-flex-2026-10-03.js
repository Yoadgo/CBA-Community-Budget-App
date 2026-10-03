/* בדיקות "גמישות מנהל" במכון כושר (3.10.2026).
   הרצה:  node tools/test-gym-admin-flex-2026-10-03.js

   🔴 מה המארז שומר עליו:
     1. gymActivate_ במצב activate:false רושם תשלום ותוקף, אבל הסטטוס לא משתנה ואין מייל.
     2. gymActivate_ בלי הדגל מתנהג כמו תמיד (מפעיל + מייל) — לא שברנו אף קורא קיים.
     3. activateGymManual_ מפעיל מכל סטטוס, בלי חובה בסכום, ומכבד sendMail:false.
     4. gymIsPrepaid_ + חיווט "שולם מראש" ב-submitGymApplication_.
     5. הלקוח: הכפתורים בכל סטטוס, ואזהרה כשחסרה הצהרה/תשלום. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const GS = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
const DOOR = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Door.gs'), 'utf8');
const GA = fs.readFileSync(path.join(__dirname, '..', 'js', 'screens', 'gymAdmin.js'), 'utf8');
const DS = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'dataService.js'), 'utf8');
function grab(re) { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; }

function env(initial) {
  const row = Object.assign({ 'מזהה': 'GYM-1', 'אימייל': 'a@x.com', 'שם פרטי': 'דנה', 'סטטוס': 'ממתין להצהרה' }, initial || {});
  const logs = [], mails = [];
  const box = {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: () => '08/2027' }, Session: { getScriptTimeZone: () => 'UTC' }, Logger: { log() {} },
    GYM_SHEET: 'מכון כושר', GYM_ST_ACTIVE: 'פעיל',
    ensureGymSheets_() {},
    gymCols_: () => { const c = {}; Object.keys(row).forEach((k, i) => c[k] = i + 1); ['תאריך התחלה','בתוקף עד','סטטוס','אימייל','שם פרטי','סטטוס תשלום'].forEach((k, i) => { if (!c[k]) c[k] = 50 + i; }); return c; },
    gymRowById_: () => 2,
    gymMonthEnd_: v => /^\d{4}-\d{2}$/.test(String(v)) ? new Date(Number(String(v).slice(0, 4)), Number(String(v).slice(5)), 0) : null,
    gymRowWriter_: () => ({ cols: {}, get: k => row[k] == null ? '' : row[k], set: (k, v) => { row[k] = v; }, flush() {} }),
    gymLog_: (ss, id, type, extra) => logs.push({ type, extra }),
    gymPaymentSync_: () => ({ ok: true, label: 'מסונכרן' }),
    sendResidentTemplate_: (ss, key) => mails.push(key),
  };
  box.sh = { getRange: (r, c) => ({ getValue: () => { const k = Object.keys(box.gymCols_()).find(x => box.gymCols_()[x] === c); return row[k] == null ? '' : row[k]; } }) };
  const ss = { getSheetByName: () => box.sh };
  vm.createContext(box);
  vm.runInContext([
    grab(/function gymToDate_\(v\) \{[\s\S]*?\n\}/),
    grab(/function gymActivate_\(ss, body, isManual\) \{[\s\S]*?\n\}\n/),
    grab(/function activateGymManual_\(ss, body\) \{[\s\S]*?\n\}\n/),
    grab(/function gymIsPrepaid_\(paid, planTotal, validUntil\) \{[\s\S]*?\n\}/),
  ].join('\n'), box);
  return { box, ss, row, logs, mails };
}

section('1. 🔴 gymActivate_ במצב "רק לרשום תשלום"');
{
  const e = env();
  const r = e.box.gymActivate_(e.ss, { id: 'GYM-1', amount: 360, validUntil: '2027-08', method: 'ייבוא אקסל', activate: false, startDate: '2026-09-01', _email: 'adm@x.com' }, true);
  ok('ok + recordOnly', r.ok === true && r.recordOnly === true, JSON.stringify(r));
  ok('🔴 הסטטוס לא השתנה', e.row['סטטוס'] === 'ממתין להצהרה' && r.status === 'ממתין להצהרה');
  ok('🔴 אפס מיילים', e.mails.length === 0);
  ok('התוקף נרשם (31/08/2027)', e.row['בתוקף עד'] instanceof Date && e.row['בתוקף עד'].getMonth() === 7 && e.row['בתוקף עד'].getFullYear() === 2027);
  ok('תאריך ההתחלה 01/09/2026', e.row['תאריך התחלה'].getFullYear() === 2026 && e.row['תאריך התחלה'].getMonth() === 8 && e.row['תאריך התחלה'].getDate() === 1);
  ok('התשלום ביומן עם ההערה "בלי הפעלה"', e.logs.length === 1 && e.logs[0].type === 'תשלום' && /בלי הפעלה/.test(e.logs[0].extra.note));
  ok('סכום 0 עדיין נחסם', e.box.gymActivate_(e.ss, { id: 'GYM-1', amount: 0, validUntil: '2027-08', activate: false }, true).ok === false);
}

section('2. 🔴 בלי הדגל — התנהגות קיימת');
{
  const e = env({ 'סטטוס': 'ממתין לתשלום' });
  const r = e.box.gymActivate_(e.ss, { id: 'GYM-1', amount: 360, validUntil: '2027-08' }, true);
  ok('מופעל', r.ok && r.status === 'פעיל' && e.row['סטטוס'] === 'פעיל');
  ok('נשלח GYM_ACTIVE', e.mails.length === 1 && e.mails[0] === 'GYM_ACTIVE');
}

section('3. activateGymManual_');
{
  const e = env({ 'סטטוס': 'ממתין להצהרה' });
  const r = e.box.activateGymManual_(e.ss, { id: 'GYM-1', validUntil: '2027-08', note: 'אישור בעל פה' });
  ok('מופעל מ"ממתין להצהרה" בלי סכום', r.ok && e.row['סטטוס'] === 'פעיל');
  ok('נשלח מייל הפעלה', e.mails.length === 1);
  ok('ביומן: "הפעלה ידנית" עם הסטטוס הקודם', e.logs[0].type === 'הפעלה ידנית' && /ממתין להצהרה/.test(e.logs[0].extra.note));
  const e2 = env({ 'סטטוס': 'נדחה' });
  const r2 = e2.box.activateGymManual_(e2.ss, { id: 'GYM-1', validUntil: '2027-08', sendMail: false });
  ok('🔴 sendMail:false = הפעלה שקטה', r2.ok && e2.mails.length === 0);
  ok('חודש תוקף חסר נחסם', env().box.activateGymManual_(env().ss, { id: 'GYM-1' }).ok === false);
}

section('4. שולם מראש');
{
  const f = env().box.gymIsPrepaid_, fut = new Date(Date.now() + 864e5 * 200);
  ok('360/360 ותוקף עתידי', f(360, 360, fut) === true);
  ok('שילם פחות', f(300, 360, fut) === false);
  ok('תוקף שעבר', f(360, 360, new Date(Date.now() - 864e5)) === false);
  ok('חיווט בהצהרה: רק בהשלמה ורק כשהיה "ממתין לתשלום"', /if \(isCompletion && status === GYM_ST_PAYMENT\) \{[\s\S]{0,500}gymIsPrepaid_\(/.test(GS));
  ok('🔴 לא נשלחת בקשת תשלום למי ששולם מראש', /status !== GYM_ST_PAYMENT && !prepaid\)/.test(GS) && /else if \(prepaid\) \{\s*sendResidentTemplate_\(ss, 'GYM_ACTIVE'/.test(GS));
  ok('🔴 דגל חוסם נשאר בכוחו', /if \(flags\.blocking\)\s+status = GYM_ST_DOCTOR;/.test(GS));
}

section('5. חיווט: הרשאות, נתב, סנכרון דלת');
ok('ACTION_PERMS', /activateGymManual: PERM_GYM,/.test(GS));
ok('נתב', /case 'activateGymManual':\s+return json_\(activateGymManual_\(ss, body\)\);/.test(GS));
ok('מפת תחומים', /activateGymManual: 'gym'/.test(GS));
ok('🔴 סנכרון Nuki/Firestore אחרי הפעלה ידנית', /GYM_SYNC_ACTIONS = \{[\s\S]*activateGymManual: 1/.test(DOOR));

section('6. לקוח');
ok('🔴 רישום תשלום בכל סטטוס (אין תנאי סטטוס על הכפתור)', !/status !== "ממתין לתשלום" && status !== "פעיל" \? "" : '<button type="button" data-ga-cash/.test(GA) && /data-ga-cash="' \+ id/.test(GA));
ok('כפתור הפעלה ידנית בכל סטטוס חוץ מפעיל', /status === "פעיל" \? "" : '<button type="button" data-ga-activate/.test(GA));
ok('מצב "רק לרשום" שולח activate:false', /activate: activate/.test(GA) && /"record"/.test(GA));
ok('🔴 אזהרה אדומה כשחסרה הצהרה או תשלום', /function activationGaps\(m\)/.test(GA) && /danger: gaps\.length > 0/.test(GA));
ok('הפעלה/עריכה ל"פעיל" עוברות באישור', (GA.match(/activationConfirm\(m,/g) || []).length >= 3);
ok('dataService: activateGymManual מיוצא', /function activateGymManual\(/.test(DS) && /activateGymManual: activateGymManual,/.test(DS));

console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו' : '✅ הכול עבר') + ' (' + pass + ' עברו)');
process.exit(fail ? 1 : 0);
