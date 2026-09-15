/* בדיקות לשחזור ולאימות הלוך-חזור (2026-09-15, צעד 07ב).
   הרצה:  node tools/test-firestore-restore.js

   🔴 **הבאג שצעד 07א היה מפרסם בלי הצעד הזה:** `JSON.stringify` הופך כל
   `Date` למחרוזת. שחזור היה כותב אותה בחזרה כ-stringValue ולא כ-timestamp
   (ר' fsVal_) — כלומר הלוך-חזור לא זהה, ו-`updatedAt` מפסיק להיות בר-השוואה.
   הגיבוי המצטבר, שכולו נשען על `where updatedAt > X`, היה נשבר בשקט.
   הבדיקות כאן הן קודם כול על זה.

   🔴 **וההנחה המסוכנת שנדחתה:** לא מנחשים תאריך לפי צורת המחרוזת בשחזור.
   שדה טקסט שנראה כמו תאריך (וזה קורה — "2026-09-15" בהערה) היה הופך לתאריך.
   הסוג נרשם בזמן הגיבוי, מפורשות.

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
const FSGS = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');

let sheets, written, deleted;
function fakeSheet(name, values) {
  const sh = { name, values: values || null,
    clear() { sh.values = null; }, setFrozenRows() {},
    getRange(r, c, nr, nc) { return { setValues(v) { sh.values = v; } }; },
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
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => fakeSS(), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FSGS, sandbox);          // fsVal_ האמיתי — זה מה שמכריע על הטיפוס
sandbox.json_ = o => o;
function reset() {
  sheets = {}; written = []; deleted = [];
  sandbox.fsSet_ = (p, o) => { written.push({ path: p, doc: o }); return {}; };
  sandbox.fsDelete_ = p => { deleted.push(p); };
}
reset();

section('1. 🔴 תאריך — הבאג המרכזי');
{
  const d = new Date(Date.UTC(2026, 8, 15, 10, 30, 0));
  const enc = sandbox.bkEncode_({ updatedAt: d, name: 'השקיה' });
  ok('תאריך מקודד עם סימן טיפוס', enc.updatedAt && enc.updatedAt.__t === 'date', JSON.stringify(enc.updatedAt));
  ok('הערך הוא ISO', enc.updatedAt.v === d.toISOString());
  ok('שדה רגיל לא נגוע', enc.name === 'השקיה');
  const back = sandbox.bkDecode_(JSON.parse(JSON.stringify(enc)));
  ok('🔴 אחרי הלוך-חזור זה שוב Date', typeof back.updatedAt.getTime === 'function');
  ok('🔴 ואותו רגע בדיוק', back.updatedAt.getTime() === d.getTime());
  /* הבדיקה שמכריעה: מה fsVal_ האמיתי יכתוב ל-Firestore */
  ok('🔴 fsVal_ יכתוב timestampValue ולא stringValue',
     'timestampValue' in sandbox.fsVal_(back.updatedAt), JSON.stringify(sandbox.fsVal_(back.updatedAt)));
}
{
  /* מה היה קורה בלי הקידוד — התיעוד החי של הבאג */
  const naive = JSON.parse(JSON.stringify({ updatedAt: new Date() }));
  ok('🔴 בלי הקידוד fsVal_ היה כותב stringValue (הבאג)',
     'stringValue' in sandbox.fsVal_(naive.updatedAt));
}
{
  const enc = sandbox.bkEncode_({ note: '2026-09-15', due: '2026-09-15T10:30:00.000Z' });
  const back = sandbox.bkDecode_(JSON.parse(JSON.stringify(enc)));
  ok('🔴 מחרוזת שנראית כמו תאריך נשארת מחרוזת', typeof back.note === 'string' && back.note === '2026-09-15');
  ok('🔴 וגם ISO מלא כטקסט נשאר טקסט', typeof back.due === 'string');
}
{
  const back = sandbox.bkDecode_({ __t: 'date', v: 'לא-תאריך' });
  ok('🔴 תאריך פגום בגיבוי לא הופך ל-Invalid Date', back === 'לא-תאריך', String(back));
}
{
  const v = { __t: 'date', v: '2026-09-15T00:00:00.000Z', other: 1 };
  const back = sandbox.bkDecode_(v);
  ok('🔴 אובייקט אמיתי עם __t ושדה נוסף אינו מפוענח כתאריך',
     typeof back === 'object' && back.other === 1 && typeof back.getTime !== 'function');
}

section('2. קידוד עמוק');
{
  const d1 = new Date(Date.UTC(2026, 0, 1)), d2 = new Date(Date.UTC(2025, 5, 6));
  const src = { a: [d1, { b: d2 }], c: { d: { e: [1, 'x', null, true] } }, f: null };
  const back = sandbox.bkDecode_(JSON.parse(JSON.stringify(sandbox.bkEncode_(src))));
  ok('תאריך בתוך מערך', back.a[0].getTime() === d1.getTime());
  ok('תאריך בתוך אובייקט בתוך מערך', back.a[1].b.getTime() === d2.getTime());
  ok('קינון עמוק נשמר', back.c.d.e.join(',') === '1,x,,true');
  ok('null נשמר', back.f === null);
}

section('3. קריאת טאב גיבוי');
{
  reset();
  sheets['_נתוני_בדיקה'] = fakeSheet('_נתוני_בדיקה', [
    ['id', 'עודכן', 'schema', 'json'],
    ['A', '2026-09-15', 1, '{"n":1}'],
    ['B', '2026-09-15', 1, '{"n":2,"t":{"__t":"date","v":"2026-09-15T00:00:00.000Z"}}'],
    ['', '', '', ''],                                   // שורה ריקה
    ['C', '2026-09-15', 1, '{שבור'],                     // JSON שבור
    ['', '2026-09-15', 1, '{"n":9}']                     // בלי id
  ]);
  const r = sandbox.bkReadTab_(fakeSS(), '_נתוני_בדיקה');
  ok('שני מסמכים תקינים', r.docs.length === 2, String(r.docs.length));
  ok('🔴 שורה ריקה (שורה 4) אינה תקלה', !r.bad.some(b => b.row === 4), JSON.stringify(r.bad));
  ok('ושתי הפגומות האמיתיות הן 5 ו-6', r.bad.map(b => b.row).sort().join(',') === '5,6', JSON.stringify(r.bad));
  ok('🔴 JSON שבור מדווח ולא נבלע', r.bad.some(b => b.why === 'JSON שבור'), JSON.stringify(r.bad));
  ok('🔴 שורה בלי id מדווחת', r.bad.some(b => b.why === 'id ריק'));
  ok('התאריך פוענח בקריאה', typeof r.docs[1].data.t.getTime === 'function');
  ok('טאב שלא קיים מחזיר ריק ולא זורק', sandbox.bkReadTab_(fakeSS(), '_נתוני_אין').docs.length === 0);
}

section('4. 🔴 השחזור — כותב בלבד, לעולם לא מוחק');
{
  reset();
  const tab = sandbox.BK_COLLECTIONS[0].tab;
  sheets[tab] = fakeSheet(tab, [
    ['id', 'עודכן', 'schema', 'json'],
    ['T1', '', 1, '{"name":"א","updatedAt":{"__t":"date","v":"2026-09-15T00:00:00.000Z"}}'],
    ['T2', '', 1, '{"name":"ב"}']
  ]);
  sandbox.fsList_ = () => [{ id: 'T1', data: {} }, { id: 'T9', data: {} }];   // T9 קיים רק בפיירסטור
  const r = sandbox.fsRestoreCollection_(fakeSS(), 'gardenPlan');
  ok('נכתבו שני מסמכים', r.wrote === 2, String(r.wrote));
  ok('הנתיבים נכונים', written.map(w => w.path).join(',') === 'gardenPlan/T1,gardenPlan/T2',
     written.map(w => w.path).join(','));
  ok('🔴 התאריך נכתב כאובייקט Date', typeof written[0].doc.updatedAt.getTime === 'function');
  ok('🔴 לא נמחק כלום', deleted.length === 0);
  ok('🔴 מסמך שקיים רק בפיירסטור מדווח ולא נמחק',
     r.onlyInFirestore.join(',') === 'T9', r.onlyInFirestore.join(','));
  ok('ok', r.ok === true);
}
{
  reset();
  const tab = sandbox.BK_COLLECTIONS[0].tab;
  sheets[tab] = fakeSheet(tab, [['id', 'עודכן', 'schema', 'json']]);   // כותרת בלבד
  sandbox.fsList_ = () => [{ id: 'T1', data: {} }];
  let threw = null;
  try { sandbox.fsRestoreCollection_(fakeSS(), 'gardenPlan'); } catch (e) { threw = String(e); }
  ok('🔴 גיבוי ריק — מסרב לשחזר', threw !== null && /ריק/.test(threw), String(threw));
  ok('🔴 ולא נכתב כלום', written.length === 0);
}
{
  reset();
  let threw = null;
  try { sandbox.fsRestoreCollection_(fakeSS(), 'תנועות'); } catch (e) { threw = String(e); }
  ok('🔴 אוסף שאינו ברישום נדחה', threw !== null && /לא מוכר/.test(threw), String(threw));
}
{
  reset();
  const tab = sandbox.BK_COLLECTIONS[2].tab;
  sheets[tab] = fakeSheet(tab, [
    ['id', 'עודכן', 'schema', 'json'],
    ['../../evil', '', 1, '{"n":1}'],
    ['S1', '', 1, '{"n":2}']
  ]);
  sandbox.fsList_ = () => [];
  const r = sandbox.fsRestoreCollection_(fakeSS(), 'services');
  ok('🔴 מזהה לא חוקי בגיבוי נחסם', written.every(w => w.path.indexOf('evil') === -1),
     written.map(w => w.path).join(','));
  ok('והוא מדווח', r.badRows.some(b => b.why === 'מזהה לא חוקי'), JSON.stringify(r.badRows));
  ok('השורה התקינה כן שוחזרה', r.wrote === 1, String(r.wrote));
  ok('🔴 ולכן ok=false — שחזור חלקי אינו הצלחה', r.ok === false);
}

section('5. 🔴 האימות — ההשוואה שמחליפה שחזור־לבדיקה');
{
  reset();
  const d = new Date(Date.UTC(2026, 8, 15));
  const doc = { name: 'א', updatedAt: d, schema: 1 };
  sandbox.fsList_ = c => (c === 'gardenPlan' ? [{ id: 'T1', data: doc }] : []);
  // הגיבוי נבנה בדיוק כמו בייצור
  const tab = sandbox.BK_COLLECTIONS[0].tab;
  sheets[tab] = fakeSheet(tab, [['id', 'עודכן', 'schema', 'json'], sandbox.bkRow_('T1', doc)]);
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => { sheets[c.tab] = fakeSheet(c.tab, [['id', 'עודכן', 'schema', 'json']]); });
  const r = sandbox.fsBackupVerify_(fakeSS());
  const g = r.collections.find(c => c.collection === 'gardenPlan');
  ok('🔴 מסמך עם תאריך מדווח כזהה', g.same === 1 && g.differ.length === 0, JSON.stringify(g));
  ok('אין חסרים ואין עודפים', g.missingFromBackup.length === 0 && g.onlyInBackup.length === 0);
  ok('ok לאוסף', g.ok === true);
  ok('🔴 האימות לא כותב כלום', written.length === 0 && deleted.length === 0);
  ok('read סופר קריאות למכסה', typeof r.read === 'number');
}
{
  reset();
  sandbox.fsList_ = c => (c === 'gardenPlan' ? [{ id: 'T1', data: { name: 'חדש' } }] : []);
  const tab = sandbox.BK_COLLECTIONS[0].tab;
  sheets[tab] = fakeSheet(tab, [['id', 'עודכן', 'schema', 'json'], ['T1', '', '', '{"name":"ישן"}']]);
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => { sheets[c.tab] = fakeSheet(c.tab, [['id', 'עודכן', 'schema', 'json']]); });
  const r = sandbox.fsBackupVerify_(fakeSS());
  const g = r.collections.find(c => c.collection === 'gardenPlan');
  ok('🔴 גיבוי מיושן מזוהה כהפרש', g.differ.join(',') === 'T1', JSON.stringify(g));
  ok('וה-ok הכללי נופל', r.ok === false);
}
{
  reset();
  sandbox.fsList_ = c => (c === 'gardenPlan' ? [{ id: 'T1', data: { a: 1 } }, { id: 'T2', data: { a: 2 } }] : []);
  const tab = sandbox.BK_COLLECTIONS[0].tab;
  sheets[tab] = fakeSheet(tab, [['id', 'עודכן', 'schema', 'json'], ['T1', '', '', '{"a":1}'], ['T3', '', '', '{"a":3}']]);
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => { sheets[c.tab] = fakeSheet(c.tab, [['id', 'עודכן', 'schema', 'json']]); });
  const r = sandbox.fsBackupVerify_(fakeSS());
  const g = r.collections.find(c => c.collection === 'gardenPlan');
  ok('🔴 מסמך שאינו מגובה מזוהה', g.missingFromBackup.join(',') === 'T2', JSON.stringify(g));
  ok('🔴 מסמך שנמחק מפיירסטור אך קיים בגיבוי מזוהה', g.onlyInBackup.join(',') === 'T3');
}
{
  // סדר שדות שונה אינו הפרש
  reset();
  sandbox.fsList_ = c => (c === 'gardenPlan' ? [{ id: 'T1', data: { b: 2, a: 1 } }] : []);
  const tab = sandbox.BK_COLLECTIONS[0].tab;
  sheets[tab] = fakeSheet(tab, [['id', 'עודכן', 'schema', 'json'], ['T1', '', '', '{"a":1,"b":2}']]);
  sandbox.BK_COLLECTIONS.slice(1).forEach(c => { sheets[c.tab] = fakeSheet(c.tab, [['id', 'עודכן', 'schema', 'json']]); });
  const g = sandbox.fsBackupVerify_(fakeSS()).collections.find(c => c.collection === 'gardenPlan');
  ok('🔴 סדר שדות שונה אינו הפרש שקרי', g.same === 1 && g.differ.length === 0, JSON.stringify(g));
}

section('6. הרשאות וניתוב');
['backupRun', 'backupVerify', 'backupRestore'].forEach(a => {
  ok(a + ' דורשת PERM_SUPER', sandbox.GET_ACTION_PERMS[a] === sandbox.PERM_SUPER);
  ok(a + ' אינה פתוחה', sandbox.GET_PUBLIC_ACTIONS.indexOf(a) === -1);
  ok(a + ' מנותבת', new RegExp("action === '" + a + "'").test(CODE));
});
{
  sandbox.authorize_ = () => ({ ok: true, perm: {} });
  const r = sandbox.handleBackupRestore_({ session: 'x' });
  ok('🔴 שחזור בלי שם אוסף נדחה', r.ok === false && /אוסף/.test(r.error), JSON.stringify(r));
}
{
  sandbox.authorize_ = () => ({ ok: false, error: 'אין לך הרשאה לפעולה הזו' });
  ok('אימות בלי הרשאה נדחה', sandbox.handleBackupVerify_({}).ok === false);
  ok('שחזור בלי הרשאה נדחה', sandbox.handleBackupRestore_({ collection: 'gardenPlan' }).ok === false);
}

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
