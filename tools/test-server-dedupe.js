/* בדיקות שרת למניעת דיווח כפול (2026-09-14).
   מריץ את submitGardenReport_ ואת gardenFindByRef_ **האמיתיים** מ-Code.gs
   מול גיליון מדומה. הרצה: cd tools && node test-server-dedupe.js */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

/* ---------- גיליון מדומה ---------- */
function Sheet(headers, rows) {
  this.rows = [headers.slice()].concat((rows || []).map(r => r.slice()));
}
Sheet.prototype.getLastRow = function () { return this.rows.length; };
Sheet.prototype.getLastColumn = function () { return this.rows[0].length; };
Sheet.prototype.getRange = function (r, c, nr, nc) {
  const self = this; nr = nr || 1; nc = nc || 1;
  return {
    getValues: function () {
      const out = [];
      for (let i = 0; i < nr; i++) {
        const row = self.rows[r - 1 + i] || [];
        const s = [];
        for (let j = 0; j < nc; j++) s.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
        out.push(s);
      }
      return out;
    },
    setValues: function (v) {
      for (let i = 0; i < v.length; i++) {
        if (!self.rows[r - 1 + i]) self.rows[r - 1 + i] = [];
        for (let j = 0; j < v[i].length; j++) self.rows[r - 1 + i][c - 1 + j] = v[i][j];
      }
      return this;
    },
    setFontWeight: function () { return this; }
  };
};
Sheet.prototype.getDataRange = function () {
  return this.getRange(1, 1, this.rows.length, this.rows[0].length);
};
Sheet.prototype.appendRow = function (row) { this.rows.push(row.slice()); };
Sheet.prototype.setFrozenRows = function () {}; Sheet.prototype.setColumnWidth = function () {};

/* ---------- סביבת Apps Script מדומה ---------- */
const sandbox = {
  console,
  Utilities: {
    newBlob: (b, m, n) => ({ b, m, n }),
    base64Decode: s => s,
    formatDate: () => '',
    computeHmacSha256Signature: () => [1, 2, 3],
    base64EncodeWebSafe: () => 'x'
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => '1', put() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => SS, flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), sandbox);

/* ---------- הגיליונות + החלפת התלויות החיצוניות בלבד ---------- */
let SS, reports, tasks;
const driveFiles = [];
const emails = [];

function reset() {
  reports = new Sheet(sandbox.GARDEN_REPORT_HEADERS, []);
  tasks = new Sheet(sandbox.GARDEN_TASK_HEADERS, []);
  const log = new Sheet(sandbox.GARDEN_LOG_HEADERS, []);
  driveFiles.length = 0; emails.length = 0;
  SS = {
    getSheetByName: n => n === sandbox.GARDEN_REPORTS_SHEET ? reports
                       : n === sandbox.GARDEN_TASKS_SHEET ? tasks
                       : n === sandbox.GARDEN_LOG_SHEET ? log : null
  };
  sandbox.SpreadsheetApp.getActiveSpreadsheet = () => SS;
}

/* רק מה שיוצא החוצה מוחלף. gardenCols_, nextGardenId_, gardenFindByRef_
   ו-submitGardenReport_ עצמה הם קוד הייצור האמיתי. */
let nextId = 100;
sandbox.ensureGardenSheetsCached_ = () => {};
sandbox.gardenLists_ = () => ({ categories: ['מדשאות', 'עצים'], areas: ['אזור 1'] });
sandbox.getEmailSettings_ = () => ({});
sandbox.emailRule_ = (s, k, d) => d;
sandbox.readSettings_ = () => ({ 'שנה נוכחית': 'תשפ״ו' });
sandbox.getGardenPhotosFolder_ = () => ({ createFile: b => { driveFiles.push(b); return { getId: () => 'drive-' + driveFiles.length }; } });
sandbox.gardenLog_ = () => {};
sandbox.emailsForFamilyId_ = () => ['a@b.c'];
sandbox.sendResidentTemplate_ = (ss, t) => emails.push(t);
sandbox.notifyAdmins_ = (ss, p, t) => emails.push(t);

const PERM = { familyId: '1', firstName: 'יועד', family: 'גולן' };
const baseBody = () => ({
  _perm: PERM, _email: 'y@x.com', category: 'מדשאות', desc: 'בדיקה בדיקה',
  place: 'ליד הכניסה', phone: '050', x: 0.5, y: 0.5, area: 'אזור 1',
  photos: [{ name: 'a.jpg', mime: 'image/jpeg', data: 'AAAA' }]
});
const submit = body => sandbox.submitGardenReport_(SS, body);
const refCol = () => sandbox.GARDEN_REPORT_HEADERS.indexOf('מזהה שליחה');

/* ================================================================= */
section('1. הסכמה — העמודה קיימת ומספר הגרסה הועלה');
ok('נוספה עמודת "מזהה שליחה"', refCol() !== -1);
ok('היא בסוף ולא באמצע (לא מזיזה עמודות קיימות)',
   refCol() === sandbox.GARDEN_REPORT_HEADERS.length - 1, String(refCol()));
ok('GARDEN_SCHEMA_REV הועלה ל-3', sandbox.GARDEN_SCHEMA_REV === 3, String(sandbox.GARDEN_SCHEMA_REV));

/* ================================================================= */
section('2. דיווח ראשון — נכתב, והמזהה נשמר בעמודה');
reset();
const r1 = submit(Object.assign(baseBody(), { clientRef: 'ref-AAA' }));
ok('הצליח', r1 && r1.ok === true, JSON.stringify(r1));
ok('אינו מסומן ככפילות', !r1.duplicate);
ok('נכתבה שורה אחת', reports.getLastRow() === 2, String(reports.getLastRow()));
ok('המזהה נשמר בעמודה', String(reports.rows[1][refCol()]) === 'ref-AAA',
   String(reports.rows[1][refCol()]));
ok('התמונה הועלתה לדרייב', driveFiles.length === 1);
ok('שני מיילים יצאו', emails.length === 2, JSON.stringify(emails));

/* ================================================================= */
section('3. אותה שליחה בדיוק שוב — לא נוצר דיווח שני');
const idBefore = r1.id;
emails.length = 0; driveFiles.length = 0;
const r2 = submit(Object.assign(baseBody(), { clientRef: 'ref-AAA' }));
ok('חזרה תשובת הצלחה', r2 && r2.ok === true, JSON.stringify(r2));
ok('⚠️ מסומנת כ-duplicate', r2.duplicate === true);
ok('⚠️ אותו מזהה דיווח כמו בפעם הראשונה', r2.id === idBefore,
   r2.id + ' vs ' + idBefore);
ok('⚠️ הגיליון עדיין עם שורה אחת בלבד', reports.getLastRow() === 2,
   String(reports.getLastRow()));
ok('מזהה המשימה הוחזר', r2.taskId === r1.taskId, r2.taskId + ' vs ' + r1.taskId);
ok('רשימת התמונות הוחזרה', Array.isArray(r2.photos) && r2.photos.length === 1,
   JSON.stringify(r2.photos));
ok('⚠️ לא הועלתה תמונה נוספת לדרייב', driveFiles.length === 0, String(driveFiles.length));
ok('⚠️ לא נשלחו מיילים כפולים', emails.length === 0, JSON.stringify(emails));

/* ================================================================= */
section('4. מזהה אחר — כן נוצר דיווח חדש');
const r3 = submit(Object.assign(baseBody(), { clientRef: 'ref-BBB' }));
ok('הצליח', r3 && r3.ok === true);
ok('אינו כפילות', !r3.duplicate);
ok('מזהה דיווח חדש', r3.id !== idBefore, r3.id + ' vs ' + idBefore);
ok('שתי שורות בגיליון', reports.getLastRow() === 3, String(reports.getLastRow()));

/* ================================================================= */
section('5. בלי מזהה שליחה — התנהגות ישנה נשמרת (תאימות לאחור)');
reset();
const a = submit(baseBody());
const b = submit(baseBody());
ok('שתי השליחות הצליחו', a.ok && b.ok);
ok('נוצרו שני דיווחים (אין על מה להשוות)', reports.getLastRow() === 3,
   String(reports.getLastRow()));
ok('אף אחת לא סומנה ככפילות', !a.duplicate && !b.duplicate);

/* ================================================================= */
section('6. מקרי קצה');
reset();
submit(Object.assign(baseBody(), { clientRef: 'ref-CCC' }));
const empty1 = submit(Object.assign(baseBody(), { clientRef: '' }));
ok('מזהה ריק אינו מתאים לשורה עם מזהה ריק בעבר', !empty1.duplicate);
const spaced = submit(Object.assign(baseBody(), { clientRef: '  ref-CCC  ' }));
ok('רווחים מסביב למזהה מתנקים ומזוהים ככפילות', spaced.duplicate === true,
   JSON.stringify(spaced));
const long = 'x'.repeat(200);
reset();
const L1 = submit(Object.assign(baseBody(), { clientRef: long }));
const L2 = submit(Object.assign(baseBody(), { clientRef: long }));
ok('מזהה ארוך נחתך ל-64 ועדיין מזוהה', L2.duplicate === true, JSON.stringify(L2));
ok('לא נוצרה שורה שלישית', reports.getLastRow() === 2, String(reports.getLastRow()));

/* ================================================================= */
section('7. הבדיקה לא מייקרת את המסלול הרגיל');
reset();
let reads = 0;
const origGetRange = Sheet.prototype.getRange;
Sheet.prototype.getRange = function () { reads++; return origGetRange.apply(this, arguments); };
submit(Object.assign(baseBody(), { clientRef: 'ref-ZZZ' }));
const firstReads = reads;
Sheet.prototype.getRange = origGetRange;
ok('דיווח ראשון בגיליון ריק — בלי קריאת עמודה מיותרת', firstReads <= 6,
   'range-calls=' + firstReads);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
