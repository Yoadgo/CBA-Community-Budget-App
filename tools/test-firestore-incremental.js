/* בדיקות לגיבוי המצטבר (2026-09-15, צעד 07ג).
   הרצה:  node tools/test-firestore-incremental.js

   🔴 **הסכנה כאן היא "חור שקט בגיבוי"** — לא כישלון רועש. שלוש דרכים
   להיווצר, וכל אחת מהן נבדקת:
     1. **סימן מים שמתקדם מוקדם מדי.** אם נקבע `now` בסוף הריצה, כל מסמך
        שנכתב *במהלך* הריצה נופל בין הכיסאות ולא יגובה לעולם.
     2. **סימן מים שמתקדם אחרי כישלון.** ריצה שנכשלה באמצע חייבת להשאיר
        את הסימן הישן, אחרת אותם מסמכים לא ייבדקו שוב.
     3. **ריצה ראשונה בלי סימן.** "אפס שינויים" היה משאיר גיבוי ריק
        שנראה תקין. חייב ליפול לגיבוי מלא.

   ⚠️ מצטבר לעולם לא רואה מחיקות — זו התנהגות רצויה לגיבוי, ולכן היא
   נבדקת כדי שתישאר מכוונת ולא תיחשב באג. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FSGS = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');

let sheets, props, fetches, fetchReply;
function fakeSheet(name, values) {
  const sh = { name, values: values || null, cleared: 0,
    clear() { sh.cleared++; sh.values = null; }, setFrozenRows() {},
    getRange() { return { setValues(v) { sh.values = v; } }; },
    getDataRange() { return { getValues: () => sh.values || [] }; } };
  return sh;
}
function fakeSS() {
  return { getSheetByName: n => sheets[n] || null,
           insertSheet(n) { sheets[n] = fakeSheet(n); return sheets[n]; } };
}
const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString().replace('T', ' ').substring(0, 19),
               getUuid: () => 'x', computeHmacSha256Signature: () => [1],
               base64EncodeWebSafe: () => 'x', base64Encode: () => 'x',
               computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({
      getProperty: k => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = v; },
      getKeys: () => Object.keys(props) }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => fakeSS(), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: { getOAuthToken: () => 'tok' },
  UrlFetchApp: { fetch: (url, opt) => {
      fetches.push({ url, body: opt && opt.payload ? JSON.parse(opt.payload) : null });
      return { getResponseCode: () => fetchReply.code,
               getContentText: () => fetchReply.text };
    } }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FSGS, sandbox);
sandbox.json_ = o => o;
function reset() {
  sheets = {}; props = {}; fetches = []; fetchReply = { code: 200, text: '[]' };
  sandbox.fsProjectId_ = () => 'proj';
  sandbox.fsToken_ = () => 'tok';
}
reset();
const HDR = ['id', 'עודכן', 'schema', 'json'];
const C0 = sandbox.BK_COLLECTIONS[0];              // gardenPlan

section('1. fsQuery_ — הבקשה עצמה');
{
  reset();
  /* ⚠️ **ה-Date נוצר בתוך ה-vm ולא ב-Node.** `fsVal_` מזהה תאריך עם
     `instanceof Date`, ו-`instanceof` נכשל חוצה לתחום (realm): Date של Node
     אינו ה-Date של ה-vm, והערך היה נשלח כ-mapValue ריק.
     בייצור יש תחום אחד בלבד, ולכן **זו נאמנות הסימולציה ולא באג** —
     אבל הבדיקה חייבת ליצור את התאריך באותו תחום כמו הקוד. */
  const when = vm.runInContext('new Date(Date.UTC(2026, 8, 15, 10, 0, 0))', sandbox);
  ok('הבדיקה מריצה באותו תחום כמו הקוד (realm)', when instanceof vm.runInContext('Date', sandbox));
  fetchReply = { code: 200, text: JSON.stringify([
    { readTime: '2026-09-15T10:00:00Z' },                       // איבר סנכרון, בלי document
    { document: { name: 'projects/p/databases/(default)/documents/gardenPlan/T1',
                  fields: { name: { stringValue: 'א' } } } }
  ]) };
  const rows = sandbox.fsQuery_('gardenPlan', 'updatedAt', 'GREATER_THAN', when);
  ok('🔴 איבר בלי document מדולג ואינו שגיאה', rows.length === 1, String(rows.length));
  ok('המזהה נחלץ מהנתיב המלא', rows[0].id === 'T1', rows[0].id);
  ok('השדות מפוענחים', rows[0].data.name === 'א');
  const b = fetches[0].body.structuredQuery;
  ok('הנתיב הוא runQuery על השורש', /documents:runQuery$/.test(fetches[0].url), fetches[0].url);
  ok('שם האוסף בתוך from ולא ב-URL', b.from[0].collectionId === 'gardenPlan');
  ok('🔴 תנאי יחיד על שדה יחיד (בלי אינדקס מורכב)', !!b.where.fieldFilter && !b.where.compositeFilter);
  ok('השדה הוא updatedAt', b.where.fieldFilter.field.fieldPath === 'updatedAt');
  ok('האופרטור GREATER_THAN', b.where.fieldFilter.op === 'GREATER_THAN');
  ok('🔴 הערך נשלח כ-timestampValue ולא כמחרוזת',
     b.where.fieldFilter.value.timestampValue === when.toISOString(),
     JSON.stringify(b.where.fieldFilter.value));
}
{
  reset();
  fetchReply = { code: 400, text: '{"error":"bad"}' };
  let threw = null;
  try { sandbox.fsQuery_('gardenPlan', 'updatedAt', 'GREATER_THAN', new Date()); }
  catch (e) { threw = String(e); }
  ok('שגיאת HTTP נזרקת ולא נבלעת', threw !== null && /400/.test(threw), String(threw));
}

section('2. סימן המים');
{
  reset();
  ok('אין סימן בהתחלה', sandbox.bkMarkGet_('gardenPlan') === null);
  const d = new Date(Date.UTC(2026, 8, 15, 12, 0, 0));
  sandbox.bkMarkSet_('gardenPlan', d);
  ok('נשמר ונקרא בחזרה כתאריך', sandbox.bkMarkGet_('gardenPlan').getTime() === d.getTime());
  ok('נשמר כ-ISO במאפיין', props['bkMark_gardenPlan'] === d.toISOString(), props['bkMark_gardenPlan']);
  ok('🔴 סימן פגום אינו מפיל — נחשב כאין סימן',
     (props['bkMark_services'] = 'זבל') && sandbox.bkMarkGet_('services') === null);
  ok('סימן נפרד לכל אוסף', sandbox.bkMarkGet_('gardenPlan') !== null);
}

section('3. 🔴 ריצה ראשונה — חייבת ליפול לגיבוי מלא');
{
  reset();
  sandbox.fsList_ = () => [{ id: 'T1', data: { a: 1 } }, { id: 'T2', data: { a: 2 } }];
  sandbox.fsQuery_ = () => { throw new Error('לא אמור להישאל'); };
  const r = sandbox.fsBackupIncremental_(fakeSS());
  const g = r.collections.find(c => c.collection === 'gardenPlan');
  ok('🔴 מצב full ולא "אפס שינויים"', g.mode === 'full', JSON.stringify(g));
  ok('כל המסמכים נכתבו', g.total === 2 && sheets[C0.tab].values.length === 3);
  ok('🔴 והסימן נקבע אחרי הריצה', sandbox.bkMarkGet_('gardenPlan') !== null);
}
{
  reset();
  sandbox.bkMarkSet_('gardenPlan', new Date(Date.UTC(2026, 8, 15)));  // יש סימן
  sandbox.fsList_ = () => [{ id: 'T1', data: { a: 1 } }];
  sandbox.fsQuery_ = () => { throw new Error('לא אמור להישאל'); };
  const r = sandbox.fsBackupIncremental_(fakeSS());                    // אבל אין טאב
  const g = r.collections.find(c => c.collection === 'gardenPlan');
  ok('🔴 סימן קיים אך טאב חסר — גם זה נופל למלא', g.mode === 'full', JSON.stringify(g));
}

section('4. המיזוג — עדכון במקום, הוספה בסוף');
{
  reset();
  sheets[C0.tab] = fakeSheet(C0.tab, [HDR,
    ['T1', '', 1, '{"a":1}'], ['T2', '', 1, '{"a":2}'], ['T3', '', 1, '{"a":3}']]);
  const m = sandbox.bkMergeRows_(fakeSS(), C0.tab,
    [{ id: 'T2', data: { a: 22 } }, { id: 'T9', data: { a: 9 } }]);
  ok('אחד עודכן ואחד נוסף', m.updated === 1 && m.added === 1, JSON.stringify(m));
  ok('סך הכול 4', m.total === 4);
  const v = sheets[C0.tab].values;
  ok('הכותרת נשמרה', v[0].join('|') === HDR.join('|'));
  const byId = {}; v.slice(1).forEach(r => { byId[r[0]] = r[3]; });
  ok('🔴 T2 עודכן ולא הוכפל', byId['T2'] === '{"a":22}', byId['T2']);
  ok('🔴 T1 ו-T3 לא נגעו', byId['T1'] === '{"a":1}' && byId['T3'] === '{"a":3}');
  ok('T9 נוסף', byId['T9'] === '{"a":9}');
  ok('כל מזהה מופיע פעם אחת', Object.keys(byId).length === 4 && v.length === 5);
}
{
  reset();
  sheets[C0.tab] = fakeSheet(C0.tab, [HDR, ['T1', '', 1, '{"a":1}']]);
  const m = sandbox.bkMergeRows_(fakeSS(), C0.tab, []);
  ok('אפס שינויים — הטאב נשאר כמות שהוא', m.total === 1 && m.updated === 0 && m.added === 0);
  ok('והשורה עדיין שם', sheets[C0.tab].values.length === 2);
}
{
  reset();
  let threw = null;
  try { sandbox.bkMergeRows_(fakeSS(), 'תנועות', [{ id: 'X', data: {} }]); }
  catch (e) { threw = String(e); }
  ok('🔴 מיזוג לטאב מקור נחסם גם הוא', threw !== null && /_נתוני_/.test(threw), String(threw));
}

section('5. 🔴 סימן המים נקבע לפני השאילתה');
{
  reset();
  sheets[C0.tab] = fakeSheet(C0.tab, [HDR, ['T1', '', 1, '{"a":1}']]);
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => { sheets[c.tab] = fakeSheet(c.tab, [HDR]); });
  sandbox.bkMarkSet_('gardenPlan', new Date(Date.UTC(2026, 8, 15, 10, 0, 0)));
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => sandbox.bkMarkSet_(c.collection, new Date(Date.UTC(2026, 8, 15, 10, 0, 0))));
  let queryTime = null;
  sandbox.fsQuery_ = () => { queryTime = Date.now(); return []; };
  const before = Date.now();
  const r = sandbox.fsBackupIncremental_(fakeSS());
  const g = r.collections.find(c => c.collection === 'gardenPlan');
  const markMs = new Date(g.markAt).getTime();
  ok('🔴 הסימן קודם לשאילתה (ולא אחריה)', markMs <= queryTime, markMs + ' vs ' + queryTime);
  ok('הסימן לא מוקדם מתחילת הריצה', markMs >= before - 5);
  ok('מצב incremental', g.mode === 'incremental');
}

section('6. 🔴 כישלון — הסימן לא זז');
{
  reset();
  sheets[C0.tab] = fakeSheet(C0.tab, [HDR, ['T1', '', 1, '{"a":1}']]);
  sandbox.BK_COLLECTIONS.forEach(c => { if (!sheets[c.tab]) sheets[c.tab] = fakeSheet(c.tab, [HDR]); });
  const old = new Date(Date.UTC(2026, 8, 15, 10, 0, 0));
  sandbox.BK_COLLECTIONS.forEach(c => sandbox.bkMarkSet_(c.collection, old));
  sandbox.fsQuery_ = c => { if (c === 'gardenPlan') throw new Error('שאילתה נכשלה (503)'); return []; };
  const r = sandbox.fsBackupIncremental_(fakeSS());
  ok('🔴 הסימן של האוסף שנכשל לא זז',
     sandbox.bkMarkGet_('gardenPlan').getTime() === old.getTime(),
     String(sandbox.bkMarkGet_('gardenPlan')));
  ok('🔴 והוא מדווח ולא נבלע', r.ok === false && /gardenPlan/.test(r.errors[0]), JSON.stringify(r.errors));
  ok('🔴 שאר האוספים המשיכו', r.collections.length === 5, String(r.collections.length));
  ok('והסימן שלהם כן התקדם', sandbox.bkMarkGet_('services').getTime() > old.getTime());
}

section('7. 🔴 מחיקות — מכוון, לא באג');
{
  reset();
  sheets[C0.tab] = fakeSheet(C0.tab, [HDR, ['T1', '', 1, '{"a":1}'], ['T2', '', 1, '{"a":2}']]);
  sandbox.BK_COLLECTIONS.forEach(c => { if (!sheets[c.tab]) sheets[c.tab] = fakeSheet(c.tab, [HDR]); });
  sandbox.BK_COLLECTIONS.forEach(c => sandbox.bkMarkSet_(c.collection, new Date(Date.UTC(2026, 8, 15))));
  sandbox.fsQuery_ = () => [];                       // T2 נמחק מפיירסטור — שאילתה לא רואה מחיקות
  sandbox.fsBackupIncremental_(fakeSS());
  const ids = sheets[C0.tab].values.slice(1).map(r => r[0]);
  ok('🔴 מסמך שנמחק נשאר בגיבוי (מכוון)', ids.indexOf('T2') > -1, ids.join(','));
  ok('ולכן הגיבוי המלא הלילי הוא מה שמתאם', /המלא הלילי חייב להמשיך לרוץ/.test(CODE));
}

section('8. חיסכון הקריאות — הטעם כולו');
{
  reset();
  sheets[C0.tab] = fakeSheet(C0.tab, [HDR].concat(
    Array.from({ length: 19 }, (_, i) => ['T' + i, '', 1, '{"a":' + i + '}'])));
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => { sheets[c.tab] = fakeSheet(c.tab, [HDR, ['X', '', 1, '{}']]); });
  sandbox.BK_COLLECTIONS.forEach(c => sandbox.bkMarkSet_(c.collection, new Date(Date.UTC(2026, 8, 15))));
  sandbox.fsQuery_ = c => (c === 'gardenPlan' ? [{ id: 'T3', data: { a: 99 } }] : []);
  sandbox.fsList_ = () => { throw new Error('מצטבר לא אמור לקרוא את כל האוסף'); };
  const r = sandbox.fsBackupIncremental_(fakeSS());
  ok('🔴 read = מספר המשתנים בלבד (1), לא 24', r.read === 1, String(r.read));
  ok('🔴 fsList_ לא נקרא כלל במסלול המצטבר', r.ok === true, JSON.stringify(r.errors));
  ok('והשורה אכן התעדכנה',
     sheets[C0.tab].values.slice(1).find(x => x[0] === 'T3')[3] === '{"a":99}');
  ok('שאר 18 השורות נשארו', sheets[C0.tab].values.length === 20);
}

section('9. הרשאות וניתוב');
ok('🔴 backupIncremental דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS.backupIncremental === sandbox.PERM_SUPER);
ok('אינה פתוחה', sandbox.GET_PUBLIC_ACTIONS.indexOf('backupIncremental') === -1);
ok('מנותבת', /action === 'backupIncremental'/.test(CODE));
{
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה לפעולה הזו' });
  ok('בלי הרשאה נדחית', sandbox.handleBackupIncremental_({}).ok === false);
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
