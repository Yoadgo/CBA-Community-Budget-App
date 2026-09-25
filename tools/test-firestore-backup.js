/* בדיקות לגיבוי Firestore ← גיליון (2026-09-15, צעד 07א).
   הרצה:  node tools/test-firestore-backup.js

   🔴 **הסכנה כאן אינה "גיבוי חסר" אלא "גיבוי שדורס".** הגיבוי כותב טאבים
   מאפס. אם שם טאב יהיה שגוי — הוא ימחק את מקור האמת עצמו, בשקט ובאמצע
   הלילה. לכן רוב הבדיקות כאן הן על **השער** (`bkTabOk_`), מול שמות הטאבים
   האמיתיים של הגיליון, ולא על נתיב ההצלחה.

   🔴 והסכנה השנייה: **גיבוי שנראה תקין עד שצריך אותו.** גיבוי עם עמודות
   מפורשות משמיט בשקט כל שדה חדש. לכן נשמר ה-JSON המלא, ויש כאן בדיקה
   שמוודאת שזה באמת מה שקורה — כולל שדה שהקוד מעולם לא ראה.

   ⚠️ אין jsdom. Code.gs רץ ב-vm עם Google Apps מזויף. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');

/* ---------- גיליון מזויף ---------- */
let sheets, inserted, cleared;
function fakeSheet(name) {
  const sh = { name, values: null, frozen: 0,
    clear() { cleared.push(name); sh.values = null; },
    setFrozenRows(n) { sh.frozen = n; },
    getRange(r, c, nr, nc) {
      return { setValues(v) { sh.values = v; sh.range = [r, c, nr, nc]; } };
    },
    getDataRange() { return { getValues: () => sh.values || [] }; } };
  return sh;
}
function fakeSS() {
  return {
    getSheetByName: n => sheets[n] || null,
    insertSheet(n) { inserted.push(n); sheets[n] = fakeSheet(n); return sheets[n]; }
  };
}

const sandbox = {
  console,
  Utilities: { formatDate: (d, tz, f) => d.toISOString().replace('T', ' ').substring(0, 19),
               getUuid: () => 'x', computeHmacSha256Signature: () => [1],
               base64EncodeWebSafe: () => 'x', base64Encode: () => 'x',
               computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => fakeSS(), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
sandbox.json_ = o => o;
function reset() { sheets = {}; inserted = []; cleared = []; }

section('1. 🔴 השער — מה מותר לדרוס');
/* שמות טאבים אמיתיים מהגיליון החי. אף אחד מהם לא אמור לעבור. */
const REAL_TABS = ['תנועות', 'תקציב', 'תושבים', 'הגדרות', 'קבוצות', 'עדכוני תקציב',
                   'הערות', 'יומן הערות', 'שירותים לתושב', 'סעיפי שירותים',
                   'תוכנית עבודה', 'משימות גינון', 'דיווחי גינון', 'שאלון בריאות',
                   'בקשות הרשמה', 'סיור', 'מכון כושר'];
let blocked = 0;
REAL_TABS.forEach(t => { if (!sandbox.bkTabOk_(t)) blocked++; });
ok('🔴 כל ' + REAL_TABS.length + ' טאבי המקור האמיתיים נחסמים', blocked === REAL_TABS.length,
   REAL_TABS.filter(t => sandbox.bkTabOk_(t)).join(','));
ok('טאב גיבוי תקין עובר', sandbox.bkTabOk_('_נתוני_שירותים'));
ok('🔴 הקידומת לבדה אינה שם תקין', sandbox.bkTabOk_('_נתוני_') === false);
ok('🔴 קידומת באמצע השם לא עוזרת', sandbox.bkTabOk_('תנועות_נתוני_') === false);
ok('ריק נחסם', sandbox.bkTabOk_('') === false);
ok('null נחסם', sandbox.bkTabOk_(null) === false);
ok('undefined נחסם', sandbox.bkTabOk_(undefined) === false);
ok('🔴 קו תחתון בלבד נחסם', sandbox.bkTabOk_('_') === false);
ok('🔴 שם דומה־אך־לא־זהה נחסם', sandbox.bkTabOk_('נתוני_שירותים') === false);

section('2. 🔴 השער נאכף בכתיבה עצמה, לא רק ברישום');
{
  reset();
  let threw = null;
  try { sandbox.bkWriteTab_(fakeSS(), 'תנועות', [['a', 'b', 1, '{}']]); }
  catch (e) { threw = String(e); }
  ok('🔴 כתיבה לטאב מקור זורקת', threw !== null, String(threw));
  ok('והשגיאה אומרת מה הכלל', /_נתוני_/.test(threw || ''), threw);
  ok('🔴 ולא נוצר ולא נמחק שום טאב', inserted.length === 0 && cleared.length === 0);
}

section('3. הרישום');
ok('כל האוספים ברישום מצביעים לטאב חוקי',
   sandbox.BK_COLLECTIONS.every(c => sandbox.bkTabOk_(c.tab)),
   sandbox.BK_COLLECTIONS.filter(c => !sandbox.bkTabOk_(c.tab)).map(c => c.tab).join(','));
ok('אין כפילות בשמות הטאבים',
   new Set(sandbox.BK_COLLECTIONS.map(c => c.tab)).size === sandbox.BK_COLLECTIONS.length);
ok('אין כפילות באוספים',
   new Set(sandbox.BK_COLLECTIONS.map(c => c.collection)).size === sandbox.BK_COLLECTIONS.length);
/* ⚠️ 6 → 9 ב-16.9: הגינון עבר ל-Firestore, ולכן שלושת האוספים שלו
   נכנסו לגיבוי השעתי — הגיליון הוא הגיבוי שלהם. */
/* 25.9 — 9→13: +weworkBookings, weworkConfig, doorLog, gymNuki (Door.gs) */
ok('13 האוספים שיש בהם מידע', sandbox.BK_COLLECTIONS.length === 13,
   String(sandbox.BK_COLLECTIONS.length));
['gardenPlan', 'gardenMeta', 'services', 'appConfig', 'budgetYears', 'budgetTx'].forEach(c => {
  ok('  ' + c + ' ברישום', sandbox.BK_COLLECTIONS.some(x => x.collection === c));
});
ok('🔴 members אינו ברישום (נגזר מהגיליון, ואין בו מה לשחזר)',
   !sandbox.BK_COLLECTIONS.some(x => x.collection === 'members'));

section('4. 🔴 שורת הגיבוי — לא משמיטה כלום');
{
  const doc = { name: 'א', freq: 'שבועי', order: 3, schema: 1,
                updatedAt: new Date(Date.UTC(2026, 8, 15, 10, 30, 0)),
                שדהחדשלגמרי: { עמוק: [1, 2, 3] } };
  const row = sandbox.bkRow_('T7', doc);
  ok('4 עמודות', row.length === 4, String(row.length));
  ok('id בעמודה הראשונה', row[0] === 'T7');
  ok('עודכן מפורמט כתאריך קריא', /^2026-09-15/.test(row[1]), row[1]);
  ok('schema נשמר', row[2] === 1);
  const back = JSON.parse(row[3]);
  ok('🔴 שדה שהקוד מעולם לא ראה שרד את הגיבוי',
     back['שדהחדשלגמרי'] && back['שדהחדשלגמרי']['עמוק'].length === 3);
  ok('🔴 כל השדות שרדו', Object.keys(back).length === Object.keys(doc).length,
     Object.keys(back).join(','));
  ok('עברית נשמרת ולא מקודדת לתווי בריחה', row[3].indexOf('שבועי') > -1);
}
{
  const row = sandbox.bkRow_('X', { updatedAt: '2026-09-15' });     // מחרוזת ולא Date
  ok('updatedAt כמחרוזת לא מפיל', row[1] === '2026-09-15', row[1]);
}
{
  const row = sandbox.bkRow_('X', {});
  ok('מסמך בלי updatedAt/schema לא מפיל', row[1] === '' && row[2] === '');
}
{
  const row = sandbox.bkRow_('X', null);
  ok('🔴 מסמך null לא מפיל את כל הגיבוי', row[3] === '{}');
}

section('5. כתיבה מלאה');
{
  reset();
  const ss = fakeSS();
  const rows = [['a', '2026-09-15', 1, '{"x":1}'], ['b', '2026-09-15', 1, '{"x":2}']];
  const n = sandbox.bkWriteTab_(ss, '_נתוני_בדיקה', rows);
  ok('מחזיר את מספר השורות', n === 2, String(n));
  ok('הטאב נוצר כי לא היה קיים', inserted.indexOf('_נתוני_בדיקה') > -1);
  ok('🔴 נוקה לפני הכתיבה (אין שאריות מגיבוי קודם)', cleared.indexOf('_נתוני_בדיקה') > -1);
  const v = sheets['_נתוני_בדיקה'].values;
  ok('כותרת + שתי שורות', v.length === 3, String(v.length));
  ok('הכותרת נכונה', v[0].join('|') === 'id|עודכן|schema|json', v[0].join('|'));
  ok('🔴 נכתב בפעולה אחת ולא שורה-שורה', sheets['_נתוני_בדיקה'].range.join(',') === '1,1,3,4');
  ok('שורת כותרת מוקפאת', sheets['_נתוני_בדיקה'].frozen === 1);
}
{
  reset();
  const ss = fakeSS();
  sandbox.bkWriteTab_(ss, '_נתוני_ריק', []);
  ok('🔴 אוסף ריק כותב כותרת בלבד ולא נופל', sheets['_נתוני_ריק'].values.length === 1);
}

section('6. הגיבוי המלא — ריצה מקצה לקצה');
{
  reset();
  const ss = fakeSS();
  const store = {
    gardenPlan: [{ id: 'T1', data: { name: 'השקיה', schema: 1 } },
                 { id: 'T2', data: { name: 'גיזום', schema: 1 } }],
    gardenMeta: [{ id: 'lists', data: { areas: ['א', 'ב'] } }],
    services:   [{ id: 'S1', data: { name: 'חשמלאי' } }],
    appConfig:  [{ id: 'flags', data: { servicesFromFirestore: true } }]
  };
  sandbox.fsList_ = c => store[c] || [];
  const r = sandbox.fsBackupAll_(ss);
  ok('ok', r.ok === true, JSON.stringify(r.errors));
  ok('🔴 read = סך המסמכים (המספר שנמדד מול המכסה)', r.read === 5, String(r.read));
  ok('13 טאבים', r.tabs.length === 13, String(r.tabs.length));
  ok('כל טאב מדווח כמה מסמכים', r.tabs.every(t => typeof t.docs === 'number'));
  ok('tabs כולל גם את שם האוסף (לאבחון)', r.tabs.every(t => t.collection && t.tab));
  ok('🔴 נכתבו רק טאבי _נתוני_', Object.keys(sheets).every(n => sandbox.bkTabOk_(n)),
     Object.keys(sheets).join(','));
  ok('תוכנית הגינון נכתבה עם 2 שורות',
     sheets[sandbox.BK_COLLECTIONS[0].tab].values.length === 3);
}
{
  reset();
  const ss = fakeSS();
  sandbox.fsList_ = c => {
    if (c === 'services') throw new Error('רשימה נכשלה (503)');
    return [{ id: 'A', data: { schema: 1 } }];
  };
  const r = sandbox.fsBackupAll_(ss);
  ok('🔴 כישלון באוסף אחד לא מפיל את השאר', r.tabs.length === 12, String(r.tabs.length));
  ok('🔴 והוא מדווח ולא נבלע', r.ok === false && r.errors.length === 1, JSON.stringify(r.errors));
  ok('השגיאה מזהה את האוסף', /services/.test(r.errors[0]), r.errors[0]);
  ok('read סופר רק מה שנקרא בפועל', r.read === 12, String(r.read));
}

section('7. הרשאות וניתוב');
ok('🔴 backupRun דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS.backupRun === sandbox.PERM_SUPER);
ok('🔴 אינה ברשימת הפעולות הפתוחות', sandbox.GET_PUBLIC_ACTIONS.indexOf('backupRun') === -1);
ok('מנותבת ב-doGet', /e\.parameter\.action === 'backupRun'/.test(CODE));
ok('handleBackupRun_ קיימת', typeof sandbox.handleBackupRun_ === 'function');
{
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה לפעולה הזו' });
  const r = sandbox.handleBackupRun_({ session: 'x' });
  ok('🔴 בלי הרשאה — לא רץ ולא כותב', r.ok === false && /הרשאה/.test(r.error));
}
{
  reset();
  sandbox.authorize_ = () => ({ ok: true, email: 'a@b.c', perm: {} });
  sandbox.fsList_ = () => [{ id: 'A', data: { schema: 1 } }];
  const r = sandbox.handleBackupRun_({ session: 'x' });
  ok('עם הרשאה — רץ', r.ok === true, JSON.stringify(r));
  ok('מחזיר זמן ריצה (למעקב אחרי המכסה)', typeof r.ms === 'number');
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
