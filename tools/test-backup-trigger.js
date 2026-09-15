/* בדיקות לעבודה השעתית ולגיבוי הלילי (2026-09-15, צעד 07ד).
   הרצה:  node tools/test-backup-trigger.js

   🔴 טריגר הוא הקוד היחיד שרץ **כשאף אחד לא מסתכל**. לכן שתי תכונות
   חשובות ממנו יותר מהצלחה: (1) כשל באחת המשימות לא מפיל את השאר ולא
   מפיל את הטריגר; (2) ההתקנה מוחקת טריגרים קודמים, אחרת הרצה שנייה של
   ההתקנה יוצרת שני טריגרים שרצים במקביל על אותו גיליון.

   ⚠️ הגיבוי המלא נתלה על dailyEmailJobs_ הקיים ולא על טריגר שני — ר'
   אותו שיקול שנרשם ליד yearRolloverJob_. הבדיקה מקבעת את זה. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');

let logs, triggers, created, deleted, calls, boom;
function fakeTrigger(fn) { return { getHandlerFunction: () => fn }; }
const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString().substring(0, 19), getUuid: () => 'x',
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log: m => logs.push(String(m)) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {}, getKeys: () => [] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null, insertSheet: () => ({}) }), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  ScriptApp: {
    getProjectTriggers: () => triggers,
    deleteTrigger: t => { deleted.push(t.getHandlerFunction()); },
    newTrigger: fn => {
      const spec = { fn: fn, kind: null, every: null, hour: null };
      const api = {
        timeBased: () => ({
          everyHours: n => { spec.kind = 'hours'; spec.every = n; return { create: () => created.push(spec) }; },
          everyDays: n => { spec.kind = 'days'; spec.every = n;
                            return { atHour: h => { spec.hour = h; return { create: () => created.push(spec) }; },
                                     create: () => created.push(spec) }; }
        })
      };
      return api;
    }
  }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
function reset() {
  logs = []; triggers = []; created = []; deleted = []; calls = []; boom = {};
  ['clubReminderJob_', 'staleNudgeJob_', 'gymDailyJob_', 'weeklyDigestJob_',
   'monthlyDigestJob_', 'yearRolloverJob_'].forEach(fn => {
     sandbox[fn] = () => { calls.push(fn); if (boom[fn]) throw new Error(fn + ' נפל'); };
   });
  sandbox.fsBackupAll_ = () => { calls.push('fsBackupAll_'); if (boom.full) throw new Error('גיבוי מלא נפל'); return { ok: true }; };
  sandbox.fsBackupIncremental_ = () => { calls.push('fsBackupIncremental_');
    if (boom.inc) throw new Error('מצטבר נפל');
    return { ok: true, read: 3, errors: [] }; };
}
reset();

section('1. השעתי — מה הוא עושה');
{
  reset();
  sandbox.hourlyJobs();
  ok('קורא לגיבוי המצטבר', calls.indexOf('fsBackupIncremental_') > -1, calls.join(','));
  ok('🔴 ואינו קורא לגיבוי המלא', calls.indexOf('fsBackupAll_') === -1, calls.join(','));
  ok('מתעד כמה נקרא (למעקב מכסה)', logs.some(l => /נקראו 3/.test(l)), logs.join(' | '));
}
{
  reset();
  sandbox.fsBackupIncremental_ = () => ({ ok: false, read: 1, errors: ['services: נפל'] });
  sandbox.hourlyJobs();
  ok('🔴 שגיאות מהאוספים מגיעות ליומן ולא נבלעות', logs.some(l => /services/.test(l)), logs.join(' | '));
}
{
  reset(); boom.inc = true;
  let threw = null;
  try { sandbox.hourlyJobs(); } catch (e) { threw = String(e); }
  ok('🔴 כשל מלא לא זורק החוצה (הטריגר לא נופל)', threw === null, String(threw));
  ok('והוא מתועד', logs.some(l => /fsBackupIncremental_ נכשל/.test(l)), logs.join(' | '));
}

section('2. 🔴 הגיבוי המלא — נתלה על היומי הקיים');
{
  reset();
  sandbox.dailyEmailJobs_();
  ok('כל שש משימות המייל רצו', calls.filter(c => /Job_$/.test(c)).length === 6, calls.join(','));
  ok('🔴 והגיבוי המלא רץ איתן', calls.indexOf('fsBackupAll_') > -1, calls.join(','));
  ok('🔴 הוא אחרון — לא מעכב את המיילים',
     calls.indexOf('fsBackupAll_') === calls.length - 1, calls.join(','));
  ok('🔴 והמצטבר לא רץ שם', calls.indexOf('fsBackupIncremental_') === -1);
}
{
  reset(); boom.full = true;
  let threw = null;
  try { sandbox.dailyEmailJobs_(); } catch (e) { threw = String(e); }
  ok('🔴 כשל בגיבוי המלא לא מפיל את משימות המייל', threw === null && calls.length === 7, String(threw));
  ok('והוא מתועד', logs.some(l => /fsBackupAll_ נכשל/.test(l)));
}
{
  reset(); boom.clubReminderJob_ = true;
  sandbox.dailyEmailJobs_();
  ok('🔴 כשל במשימת מייל לא מונע את הגיבוי המלא', calls.indexOf('fsBackupAll_') > -1, calls.join(','));
}
ok('🔴 אין טריגר שני לגיבוי המלא',
   !/newTrigger\('fsBackupAll_'|newTrigger\('nightlyBackup/.test(CODE));

section('3. ההתקנה');
{
  reset();
  sandbox.installHourlyTrigger();
  ok('נוצר טריגר אחד', created.length === 1, JSON.stringify(created));
  ok('על hourlyJobs', created[0].fn === 'hourlyJobs', created[0].fn);
  ok('🔴 כל שעה (ולא 30 דקות — הכרעת יועד)', created[0].kind === 'hours' && created[0].every === 1,
     JSON.stringify(created[0]));
}
{
  reset();
  triggers = [fakeTrigger('hourlyJobs'), fakeTrigger('dailyEmailJobs_')];
  sandbox.installHourlyTrigger();
  ok('🔴 טריגר קודם של אותה פונקציה נמחק (אין כפילות)',
     deleted.join(',') === 'hourlyJobs', deleted.join(','));
  ok('🔴 והטריגר היומי לא נגע', deleted.indexOf('dailyEmailJobs_') === -1);
  ok('ונוצר אחד חדש', created.length === 1);
}
{
  reset();
  triggers = [fakeTrigger('hourlyJobs'), fakeTrigger('hourlyJobs')];
  sandbox.installHourlyTrigger();
  ok('שני כפילים קודמים נמחקים שניהם', deleted.length === 2, deleted.join(','));
}
{
  reset();
  triggers = [fakeTrigger('hourlyJobs')];
  sandbox.installDailyEmailTrigger();
  ok('🔴 התקנת היומי לא מוחקת את השעתי', deleted.indexOf('hourlyJobs') === -1, deleted.join(','));
  ok('היומי נוצר כיומי ב-8', created[0].kind === 'days' && created[0].hour === 8, JSON.stringify(created[0]));
}

section('4. שמות ונגישות מהממשק');
ok('🔴 hourlyJobs בלי קו תחתון (מופיעה במסך "מפעילים")', /function hourlyJobs\(\)/.test(CODE));
ok('🔴 installHourlyTrigger בלי קו תחתון', /function installHourlyTrigger\(\)/.test(CODE));
ok('אינה חשופה כפעולת doGet', !/action === 'hourlyJobs'/.test(CODE));
ok('אינה ב-GET_ACTION_PERMS', sandbox.GET_ACTION_PERMS.hourlyJobs === undefined);

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
