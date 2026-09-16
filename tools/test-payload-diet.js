/* בדיקות לדיאטת המטען הראשי (2026-09-14, שלב ב3).
   הרצה:  node tools/test-payload-diet.js

   ⚠️ הסעיף החשוב ביותר כאן הוא 3: **תושב בלי הרשאת תקציב חייב להמשיך לקבל
   את שורות משפחתו מכל השנים.** דיאטה גורפת לא הייתה זורקת שום שגיאה — היא
   הייתה מוחקת לתושב את היסטוריית ההחזרים שלו בשקט. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

const YEARS = ['תשפ"ו', 'תשפ"ז'];
let SS, gate, sheetReads;

const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x' },
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

/* התלויות החיצוניות בלבד מוחלפות; doGet עצמו הוא קוד הייצור. */
sandbox.json_ = o => o;
sandbox.authorize_ = () => gate;
sandbox.readSettings_ = () => ({ 'שנה נוכחית': 'תשפ"ז' });
sandbox.readColumn_ = () => ['קבוצה א'];
sandbox.readNotesMap_ = () => ({});
sandbox.readGroupsForYear_ = () => ['קבוצה א'];
sandbox.currentRev_ = () => 7;
sandbox.currentDomains_ = () => ({});
sandbox.budgetStamp_ = () => 'S1';
sandbox.cached_ = (k, build) => build();
sandbox.readTable_ = (ss, name) => {
  sheetReads.push(name);
  if (name.indexOf('תנועות') === 0) {
    const y = name.replace('תנועות ', '');
    return [{ 'מזהה': y + '-1', 'מזהה משפחה': '401' }, { 'מזהה': y + '-2', 'מזהה משפחה': '999' }];
  }
  return [{ t: name }];
};

function reset(perm) {
  sheetReads = [];
  gate = { ok: true, email: 'y@x.com', perm: perm };
  const sheets = YEARS.map(y => 'תנועות ' + y);
  SS = {
    getSheets: () => sheets.map(n => ({ getName: () => n })),
    getSheetByName: n => (sheets.indexOf(n) !== -1 ? { name: n } : null)
  };
  sandbox.SpreadsheetApp.getActiveSpreadsheet = () => SS;
}
const run = (slim) => sandbox.doGet({ parameter: Object.assign({ session: 's' }, slim === false ? {} : { slim: '1' }) });

/* ================================================================= */
section('1. בעל הרשאת תקציב — רק השנה הנוכחית');
reset({ isSuper: true, familyId: '401' });
let r = run();
ok('הצליח', r.ok === true, JSON.stringify(r.error));
ok('⚠️ רשימת השנים עדיין מלאה (הבורר צריך אותה)',
   r.years.length === 2 && r.years.indexOf('תשפ"ו') !== -1, JSON.stringify(r.years));
ok('השנה הנוכחית היא תשפ"ז', r.currentYear === 'תשפ"ז', r.currentYear);
ok('⚠️ data מכיל שנה אחת בלבד', Object.keys(r.data).length === 1, Object.keys(r.data).join(','));
ok('והיא הנוכחית', !!r.data['תשפ"ז']);
ok('⚠️ תשפ"ו **אינה** ב-data', r.data['תשפ"ו'] === undefined);
ok('⚠️ ולא נקרא הטאב שלה מהגיליון',
   sheetReads.filter(n => n.indexOf('תשפ"ו') !== -1).length === 0, sheetReads.join(','));
ok('השנה הנוכחית מלאה', r.data['תשפ"ז'].transactions.length === 2 && !!r.data['תשפ"ז'].budget);

/* ================================================================= */
section('2. אותו משתמש — הפעולה לפי דרישה משלימה את החסר');
const y1 = sandbox.handleBudgetYear_({ year: 'תשפ"ו', session: 's' });
ok('תשפ"ו נמשכת בהצלחה', y1.ok === true, JSON.stringify(y1.error));
ok('ומכילה את התנועות', y1.data.transactions.length === 2, String(y1.data.transactions.length));

/* ================================================================= */
section('3. 🔴 תושב בלי הרשאת תקציב — כל השנים, שורות משפחתו בלבד');
reset({ isSuper: false, perms: [], familyId: '401' });
r = run();
ok('הצליח', r.ok === true);
ok('⚠️ **שתי השנים ב-data**', Object.keys(r.data).length === 2, Object.keys(r.data).join(','));
ok('⚠️ תשפ"ו קיימת — היסטוריית ההחזרים שלו לא נמחקה', !!r.data['תשפ"ו']);
YEARS.forEach(y => {
  ok(y + ': רק שורת משפחתו', r.data[y].transactions.length === 1, String(r.data[y].transactions.length));
  ok(y + ': ושורת משפחה אחרת סוננה', r.data[y].transactions[0]['מזהה משפחה'] === '401');
  ok(y + ': בלי תקציב/הכנסות', r.data[y].budget.length === 0 && r.data[y].income.length === 0);
});

/* ================================================================= */
section('4. מקרי קצה — הדיאטה לא מפילה את המטען');
reset({ isSuper: true, familyId: '401' });
sandbox.readSettings_ = () => ({ 'שנה נוכחית': 'תשפ"ט' });   // שנה שאינה ברשימה
r = run();
ok('⚠️ שנה נוכחית שאינה קיימת — חוזרים לשלוח הכול (לא מסך ריק)',
   Object.keys(r.data).length === 2, Object.keys(r.data).join(','));
sandbox.readSettings_ = () => ({});                            // בלי הגדרה בכלל
reset({ isSuper: true, familyId: '401' });
r = run();
ok('⚠️ בלי הגדרת שנה נוכחית — נופלים לשנה הראשונה ושולחים אותה',
   Object.keys(r.data).length === 1 && !!r.data[r.currentYear], Object.keys(r.data).join(','));
sandbox.readSettings_ = () => ({ 'שנה נוכחית': 'תשפ"ז' });

/* ================================================================= */
section('5. 🔴 לקוח ישן (בלי slim=1) — חייב לקבל הכול');
reset({ isSuper: true, familyId: '401' });
r = run(false);
ok('⚠️ בלי הדגל — שתי השנים נשלחות', Object.keys(r.data).length === 2, Object.keys(r.data).join(','));
ok('⚠️ תשפ"ו מלאה, לא ריקה', r.data['תשפ"ו'].transactions.length === 2);
reset({ isSuper: true, familyId: '401' });
r = sandbox.doGet({ parameter: { session: 's', slim: 'true' } });
ok('ערך שאינו "1" נחשב ללא-דגל', Object.keys(r.data).length === 2, Object.keys(r.data).join(','));

section('6. הקוד עצמו');
ok('התנאי דורש הרשאת תקציב **וגם** הצהרת לקוח',
   /var slimYears = seesBudget && clientSlim && currentY/.test(CODE));
ok('הדגל נקרא מהפרמטרים ולא מהמושב', /e\.parameter\.slim\) \|\| ''\)/.test(CODE));
ok('ו-slim=2 נחשב גם הוא להצהרת "אני יודע למשוך שנה"',
   /clientSlim = slimRaw === '1' \|\| slimRaw === '2'/.test(CODE));
ok('⚠️ ודורש שהשנה הנוכחית קיימת ברשימה', /years\.indexOf\(currentY\) !== -1/.test(CODE));
ok('הדילוג הוא לפני קריאת הגיליון', /if \(slimYears && y !== currentY\) return;/.test(CODE));
ok('⚠️ out.years לא צומצם', /ok: true, version: [^\n]*years: years/.test(CODE));


/* ================================================================= */
/*  🔴 צעד 09ב-5ג — slim=2: השרת מפסיק לשלוח תנועות       */
/*  הסעיף החשוב כאן הוא האחרון: ריקון **רק** לשנה       */
/*  הנוכחית. ריקון גורף לא היה זורק שגיאה — הוא היה  */
/*  מציג שנים קודמות כשנים בלי תנועות — אפס שקרי.        */
section('7. \u05D4\u05D9\u05E4\u05D5\u05DA \u05D4\u05EA\u05E0\u05D5\u05E2\u05D5\u05EA (slim=2)');
const run2 = () => sandbox.doGet({ parameter: { session: 's', slim: '2' } });
const realFlag = sandbox.txJobsUseFirestore_;

reset({ isSuper: true, familyId: '401' });
sandbox.txJobsUseFirestore_ = () => false;
r = run2();
ok('\u05D3\u05D2\u05DC \u05DB\u05D1\u05D5\u05D9: txFromFirestore=false', r.txFromFirestore === false, String(r.txFromFirestore));
ok('\u26A0\uFE0F \u05D5\u05D4\u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF \u05E0\u05E9\u05DC\u05D7\u05D5\u05EA', r.data['\u05EA\u05E9\u05E4"\u05D6'].transactions.length === 2);

reset({ isSuper: true, familyId: '401' });
sandbox.txJobsUseFirestore_ = () => true;
r = run2();
ok('\u05D3\u05D2\u05DC \u05D3\u05DC\u05D5\u05E7: txFromFirestore=true', r.txFromFirestore === true);
ok('\uD83D\uDD34 \u05D5\u05D4\u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05E8\u05D9\u05E7\u05D5\u05EA', r.data['\u05EA\u05E9\u05E4"\u05D6'].transactions.length === 0);
ok('\u26A0\uFE0F \u05D0\u05D1\u05DC \u05D4\u05EA\u05E7\u05E6\u05D9\u05D1 \u05E2\u05E6\u05DE\u05D5 \u05DE\u05DE\u05E9\u05D9\u05DA \u05DC\u05D4\u05D2\u05D9\u05E2 \u05DE\u05D4\u05D2\u05DC\u05D9\u05D5\u05DF',
   !!r.data['\u05EA\u05E9\u05E4"\u05D6'].budget && r.data['\u05EA\u05E9\u05E4"\u05D6'].budget.length > 0);
ok('\u05D5\u05D4\u05D3\u05D9\u05D0\u05D8\u05D4 \u05E2\u05D3\u05D9\u05D9\u05DF \u05E4\u05D5\u05E2\u05DC\u05EA', Object.keys(r.data).length === 1, Object.keys(r.data).join(','));

reset({ isSuper: false, perms: [], familyId: '401' });
r = run2();
/* 🔴🔴 **השתנה ב-16.9.2026 — וזה כל התיקון.** עד אז תושב
   **כתב** ל-Firestore ו**קרא** מהגיליון — והבקשות שלו נעלמו לו
   מהמסך. מעכשיו גם השנה הנוכחית שלו מתרוקנת והוא ממלא
   אותה מ-Firestore, בדיוק כמו הגזבר — רק מסוננת למשפחה. */
ok('\uD83D\uDD34\uD83D\uDD34 \u05EA\u05D5\u05E9\u05D1 \u05E2\u05DD \u05DE\u05D6\u05D4\u05D4 \u05DE\u05E9\u05E4\u05D7\u05D4 \u05E7\u05D5\u05E8\u05D0 \u05D4\u05D5\u05D0 \u05D2\u05DD \u05DE-Firestore', r.txFromFirestore === true);
ok('\u05D5\u05D4\u05E9\u05E8\u05EA \u05DE\u05E6\u05D4\u05D9\u05E8 \u05E2\u05DC \u05D4\u05D9\u05E7\u05E3 \u05DE\u05E6\u05D5\u05DE\u05E6\u05DD', r.txFsScope === 'family', String(r.txFsScope));
YEARS.forEach(y => ok(y + ': \u05D4\u05E9\u05E0\u05D4 \u05D4\u05E0\u05D5\u05DB\u05D7\u05D9\u05EA \u05E8\u05D9\u05E7\u05D4, \u05D4\u05D0\u05D7\u05E8\u05D5\u05EA \u05E2\u05DD \u05E9\u05D5\u05E8\u05EA \u05D4\u05DE\u05E9\u05E4\u05D7\u05D4',
                      r.data[y].transactions.length === (y === r.currentYear ? 0 : 1),
                      String(r.data[y].transactions.length)));

sandbox.readSettings_ = () => ({ '\u05E9\u05E0\u05D4 \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA': '\u05EA\u05E9\u05E4"\u05D8' });
reset({ isSuper: true, familyId: '401' });
r = run2();
ok('\uD83D\uDD34\uD83D\uDD34 \u05E9\u05E0\u05D4 \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA \u05E9\u05D0\u05D9\u05E0\u05D4 \u05D1\u05E8\u05E9\u05D9\u05DE\u05D4 \u2014 \u05E9\u05E0\u05D9\u05DD \u05D0\u05D7\u05E8\u05D5\u05EA \u05E9\u05D5\u05DE\u05E8\u05D5\u05EA \u05EA\u05E0\u05D5\u05E2\u05D5\u05EA',
   YEARS.every(y => r.data[y] && r.data[y].transactions.length === 2),
   YEARS.map(y => y + '=' + (r.data[y] ? r.data[y].transactions.length : 'x')).join(','));
sandbox.readSettings_ = () => ({ '\u05E9\u05E0\u05D4 \u05E0\u05D5\u05DB\u05D7\u05D9\u05EA': '\u05EA\u05E9\u05E4"\u05D6' });
sandbox.txJobsUseFirestore_ = realFlag;

ok('\u05D4\u05EA\u05E0\u05D0\u05D9 \u05D3\u05D5\u05E8\u05E9 slim=2 + \u05D4\u05D3\u05D2\u05DC \u05D4\u05D7\u05D9 + \u05D4\u05E8\u05E9\u05D0\u05D4 \u05D0\u05D5 \u05DE\u05D6\u05D4\u05D4 \u05DE\u05E9\u05E4\u05D7\u05D4',
   /var txFs = slimRaw === '2' && txJobsUseFirestore_\(\) && \(seesBudget \|\| !!myFamilyId\)/.test(CODE));
ok('\uD83D\uDD34 \u05D4\u05E8\u05D9\u05E7\u05D5\u05DF \u05DE\u05D5\u05D2\u05D1\u05DC \u05DC\u05E9\u05E0\u05D4 \u05D4\u05E0\u05D5\u05DB\u05D7\u05D9\u05EA \u05D1\u05DC\u05D1\u05D3',
   /var txEmpty = txFs && y === currentY;/.test(CODE) && /transactions: txEmpty \? \[\] : tx,/.test(CODE));
ok('\u05D5\u05D4\u05E9\u05E8\u05EA \u05DE\u05E6\u05D4\u05D9\u05E8 \u05E2\u05DC \u05DB\u05DA \u05DC\u05DC\u05E7\u05D5\u05D7', /out\.txFromFirestore = txFs;/.test(CODE));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
