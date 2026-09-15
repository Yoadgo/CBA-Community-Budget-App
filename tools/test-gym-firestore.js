
/* בדיקות לסנכרון סטטוס מנוי הכושר (צעד 10ב-1, 2026-09-15).
   הרצה:  node tools/test-gym-firestore.js

   🔴🔴 **זה המארז הרגיש ביותר בפרויקט.** טאב "מכון כושר" הוא היחיד
   שמחזיק באותה שורה מספר תעודת זהות, תאריך לידה ותשובות שאלון בריאות
   — יחד עם הסטטוס. כל שדה שידלוף מכאן ל-Firestore הוא דליפה של אלה.

   הבדיקה המרכזית אינה "האם הסטטוס עבר" אלא **"האם משהו שאסור לו
   לעבור עבר"**, והיא רצה על רשימת העמודות האמיתית (GYM_HEADERS) ולא
   על רשימה שכתבתי בעצמי — כדי שעמודה חדשה שתיווסף לטאב תיתפס כאן. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

let SS, gate, written, swept;

const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               formatDate: (d) => d.toISOString().slice(0, 10) },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => SS, flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);

sandbox.json_ = o => o;
sandbox.authorize_ = () => gate;
/* רק התלויות החיצוניות מוחלפות — gymStatusSyncAll_ עצמו הוא קוד הייצור. */
sandbox.fsWriteAll_ = (col, items, out, live) => {
  items.forEach(it => { written.push({ col, id: it.id, doc: it.doc }); live[it.id] = 1; out.wrote++; });
};
sandbox.fsSweepOrphans_ = (col, live, out) => { swept.push({ col, live: Object.keys(live) }); };

/* שורת מכון "מלאה" — כל עמודה שקיימת בטאב האמיתי מקבלת ערך מזהה,
   כדי שנוכל לזהות בוודאות מה עבר ומה לא. */
function fullGymRow() {
  const row = {};
  sandbox.GYM_HEADERS.forEach(h => { row[h] = 'VAL::' + h; });
  row['אימייל'] = 'a@b.com';
  return row;
}

function reset() {
  written = []; swept = [];
  gate = { ok: true, email: 'a@b.com', perm: { isSuper: true } };
  const residents = {
    getLastRow: () => 2,
    getLastColumn: () => 4,
    getRange: (r, c, nr, nc) => ({
      getValues: () => (r === 1
        ? [['אימייל 1', 'מזהה Firebase 1', 'משפחה', 'סטטוס']]
        : [['a@b.com', 'UID-AAA', 'כהן', 'פעיל']])
    })
  };
  SS = { getSheetByName: n => (n === 'תושבים' ? residents : null) };
  sandbox.SpreadsheetApp.getActiveSpreadsheet = () => SS;
  sandbox.readTable_ = (ss, name) => (name === sandbox.GYM_SHEET ? [fullGymRow()] : []);
  sandbox.normalizeEmail_ = e => String(e || '').trim().toLowerCase();
  sandbox.residentSlotCols_ = () => ({ email: [0], uid: [1], perm: [] });
}

/* ================================================================= */
section('1. 🔴🔴 מה שאסור לעבור — לא עובר');
reset();
let r = sandbox.gymStatusSyncAll_(SS);
ok('הסנכרון הצליח', r.ok === true, JSON.stringify(r.error));
ok('נכתב מסמך אחד', written.length === 1, String(written.length));
const doc = written[0] ? written[0].doc : {};
const keys = Object.keys(doc);

/* 🔴 הרשימה נגזרת מ-GYM_HEADERS האמיתי: עמודה חדשה שתיווסף לטאב
   ואינה ברשימת ההיתר תיתפס כאן אוטומטית. */
const FORBIDDEN = ['אימייל', 'שם פרטי', 'שם משפחה', 'טלפון', 'מספר בית',
  'ת.ז.', 'תאריך לידה', 'שאלות שנענו בכן', 'דגלים', 'הערת דגל',
  'תאריך חתימה', 'קישור חתימה', 'גרסת שאלון',
  'אישור רופא', 'תאריך הנפקת האישור', 'קישור אישור',
  'טופל ע"י', 'הערות מנהל', 'מזהה קבוע', 'מצב סנכרון'];
FORBIDDEN.forEach(f => {
  ok('🔴 ' + f + ' לא עבר', keys.indexOf(f) === -1);
});

/* ⚠️ החשוב מכולם: לא רק שהמפתח לא שם — גם הערך לא דלף לשום שדה אחר. */
const values = JSON.stringify(doc);
FORBIDDEN.forEach(f => {
  ok('⚠️ וגם הערך של "' + f + '" לא דלף לשום שדה', values.indexOf('VAL::' + f) === -1);
});

section('2. ⚠️ עמודה חדשה בטאב אינה זולגת מעצמה');
const unknown = sandbox.GYM_HEADERS.filter(h => sandbox.GYM_FS_FIELDS.indexOf(h) === -1);
ok('יש עמודות שאינן ברשימת ההיתר', unknown.length > 0, String(unknown.length));
ok('🔴 ואף אחת מהן אינה במסמך',
   unknown.every(h => keys.indexOf(h) === -1),
   unknown.filter(h => keys.indexOf(h) !== -1).join(','));
/* 🔴 הדרישה המבנית: רשימת **היתר**, לא רשימת חסימה. רשימת חסימה
   הייתה מעבירה בשקט כל עמודה חדשה. */
ok('🔴 והקוד בונה לפי רשימת היתר ולא חסימה',
   /GYM_FS_FIELDS\.forEach\(function \(k\) \{/.test(CODE) &&
   !/GYM_SKIP|GYM_BLOCK/.test(CODE));

section('3. מה כן עבר');
['מסלול', 'בתוקף עד', 'סטטוס', 'סה"כ שולם'].forEach(f => {
  ok(f + ' עבר', doc[f] === 'VAL::' + f, JSON.stringify(doc[f]));
});
ok('המזהה הוא ה-uid', written[0].id === 'UID-AAA', String(written[0].id));
ok('⚠️ והמסמך נושא אותו גם בפנים', doc.uid === 'UID-AAA');
ok('יש schema ו-updatedAt', doc.schema === 1 && !!doc.updatedAt);
ok('האוסף הוא gymStatus', written[0].col === 'gymStatus', String(written[0].col));

section('4. ⚠️ מי שמעולם לא התחבר — מדולג, לא נכתב');
reset();
sandbox.residentSlotCols_ = () => ({ email: [0], uid: [1], perm: [] });
SS = { getSheetByName: n => (n === 'תושבים' ? {
  getLastRow: () => 2, getLastColumn: () => 4,
  getRange: (rr) => ({ getValues: () => (rr === 1
    ? [['אימייל 1', 'מזהה Firebase 1', 'משפחה', 'סטטוס']]
    : [['a@b.com', '', 'כהן', 'פעיל']]) })   // אין uid
} : null) };
sandbox.SpreadsheetApp.getActiveSpreadsheet = () => SS;
r = sandbox.gymStatusSyncAll_(SS);
ok('🔴 לא נכתב שום מסמך', written.length === 0, String(written.length));
ok('⚠️ והוא נספר כמדולג ולא כשגיאה', r.skipped === 1 && r.ok === true, JSON.stringify(r));

section('5. הרשאות ומבנה');
ok('gymStatusSync דורש מנהל-על', /gymStatusSync: PERM_SUPER/.test(CODE));
ok('ויש לו נתיב ב-doGet', /e\.parameter\.action === 'gymStatusSync'/.test(CODE));
ok('🔴 ההנדלר בודק הרשאה בעצמו',
   /function handleGymStatusSync_\(p\)[\s\S]{0,300}authorize_\(ss, p, PERM_SUPER\)/.test(CODE));
ok('⚠️ ויש ניקוי יתומים', /fsSweepOrphans_\(FS_GYM_STATUS/.test(CODE));
ok('🔴 וקוד הכניסה אינו נכתב לשום מקום ב-Firestore',
   !/FS_GYM_STATUS[\s\S]{0,1200}קוד כניסה/.test(CODE));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
