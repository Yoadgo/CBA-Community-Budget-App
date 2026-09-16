/* בדיקות למראת התנועות — Firestore ⇐ גיליון   (16.9.2026)
   הרצה:  node tools/test-budget-tx-mirror.js

   🔴🔴 **הבאג שהמארז הזה נולד ממנו, ונמדד חי בייצור:**
   מורן ממן (משפחה 7) הגישה שתי בקשות. הדפדפן כתב אותן ישירות
   ל-Firestore — ו`budgetTxApplyPending_` יודעת רק לעדכן **עמודת
   סטטוס בשורה שכבר קיימת**. כלומר השורות לא הגיעו לגיליון לעולם,
   היא ראתה מידע ישן, ו**לא קיבלה אף מייל** על אישור הבקשות.
   נמדד: 8 מסמכים ב-Firestore מול 6 שורות בגיליון.

   🔴 והסכנה ההפוכה, שהמארז הזה שומר עליה באותה מידה: מראה
   שמוחקת יותר מדי. שאילתה שנכשלה או שנה שחזרה ריקה **אסור**
   שיגררו מחיקה בגיליון — מחיקה שם היא לתמיד. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const FIRESTORE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Firestore.gs'), 'utf8');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'data', 'sheets.js'), 'utf8');

const Y = 'תשפ"ז';
const HEAD = ['מזהה', 'חודש הגשה', 'רוכש', 'ספק/נמען', 'סכום', 'סטטוס',
              'הערת בדיקה', 'מקור', 'מזהה משפחה', 'קישור קבלה'];

let sheets, written, deleted, mails, moved, bumped, flagOn, fsDocs, fsThrows;

function makeSheet(rows, head) {
  head = head || HEAD;
  const data = [head.slice()].concat(rows.map(r => r.slice()));
  const sh = {
    _data: data,
    getLastColumn: () => data[0].length,
    getLastRow: () => data.length,
    getRange: (r, c, nr, nc) => ({
      getValues: () => {
        const out = [];
        for (let i = 0; i < (nr || 1); i++) {
          const src = data[r - 1 + i] || [];
          const line = [];
          for (let j = 0; j < (nc || 1); j++) line.push(src[c - 1 + j]);
          out.push(line);
        }
        return out;
      },
      setValue: v => { while (data.length < r) data.push([]); data[r - 1][c - 1] = v; },
      setValues: vs => {
        for (let i = 0; i < vs.length; i++) {
          while (data.length < r + i) data.push(new Array(head.length).fill(''));
          for (let j = 0; j < vs[i].length; j++) data[r - 1 + i][c - 1 + j] = vs[i][j];
        }
      }
    }),
    appendRow: line => data.push(line.slice()),
    deleteRow: r => data.splice(r - 1, 1),
    setFrozenRows() {}
  };
  return sh;
}

const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString().substring(0, 19), getUuid: () => 'x',
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1], newBlob: () => ({}) },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {}, getKeys: () => [] }) },
  SpreadsheetApp: {
    getActiveSpreadsheet: () => ({
      getSheetByName: n => (sheets[n] || null),
      insertSheet: n => (sheets[n] = makeSheet([], ['x']))
    }),
    flush() {}
  },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  encodeURIComponent, Date, JSON, String, Number, Math, Object, Array, Error
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
vm.runInContext(FIRESTORE, sandbox);
sandbox.json_ = o => o;

const S = sandbox.STATUS_HE;
const SRC_HE = sandbox.SOURCE_HE;

/* שורה: מזהה, חודש, רוכש, ספק, סכום, סטטוס, הערה, מקור, משפחה, קישור */
function row(id, status, o) {
  o = o || {};
  return [id, '2026-09', o.buyer === undefined ? 'מורן ושלומי ממן' : o.buyer,
          o.supplier || 'חנות', o.amount === undefined ? 100 : o.amount, status,
          o.note || '', o.source || SRC_HE.resident,
          o.fam === undefined ? '7' : o.fam, o.receipt || ''];
}
function doc(id, status, o) {
  o = o || {};
  const d = { 'מזהה': id, 'חודש הגשה': '2026-09', 'ספק/נמען': o.supplier || 'חנות',
              'סכום': o.amount === undefined ? 100 : o.amount, 'סטטוס': status,
              'מקור': o.source || SRC_HE.resident,
              'מזהה משפחה': o.fam === undefined ? '7' : o.fam,
              year: Y, familyId: o.fam === undefined ? '7' : o.fam,
              statusPending: false, schema: 2 };
  if (o.mailed !== undefined) d.mailedStatus = o.mailed;
  if (o.receipt) d['קישור קבלה'] = o.receipt;
  return { id: Y + '__' + id, data: d };
}

function reset(opts) {
  opts = opts || {};
  sheets = {}; written = []; deleted = []; mails = []; moved = []; bumped = [];
  flagOn = opts.flagOn !== false;
  fsDocs = opts.docs || [];
  fsThrows = !!opts.fsThrows;
  sheets['תנועות ' + Y] = makeSheet(opts.rows || []);
  sandbox.txJobsUseFirestore_ = () => flagOn;
  sandbox.readSettings_ = () => ({ 'שנים': Y });
  sandbox.txFamilyNames_ = () => ({ '7': 'מורן ושלומי ממן' });
  sandbox.fsQuery_ = () => { if (fsThrows) throw new Error('rpc'); return fsDocs; };
  /* ⚠️ stub נאמן: כתיבה מעדכנת באמת את מה שהשאילתה תחזיר —
     בלעדיו ריצה שנייה נראית כמו באג שלא קיים בייצור. */
  sandbox.fsSet_ = (p, o2) => {
    written.push({ path: p, doc: o2 });
    for (const d of fsDocs) if (p.indexOf(d.id) > -1) d.data = o2;
    return {};
  };
  sandbox.fsDelete_ = p => deleted.push(p);
  sandbox.fsDocPath_ = (c, id) => c + '/' + id;
  sandbox.fsList_ = () => [];
  sandbox.emailsForFamilyId_ = () => ['moran@x.y'];
  sandbox.sendResidentTemplate_ = (ss, key, emails, vars) => mails.push({ key, vars });
  sandbox.notifyAdmins_ = () => {};
  sandbox.moveReceiptToPermanentIfNeeded_ = url => moved.push(url);
  sandbox.bumpRev_ = a => bumped.push(a);
  return sandbox.SpreadsheetApp.getActiveSpreadsheet();
}
const data = () => sheets['תנועות ' + Y]._data;
const ids = () => data().slice(1).map(r => String(r[0]));
const cell = (id, h) => {
  const i = HEAD.indexOf(h);
  for (const r of data().slice(1)) if (String(r[0]) === String(id)) return r[i];
  return null;
};

/* ================================================================= */
section('1. 🔴🔴 הבאג של מורן — מסמך בלי שורה');
let ss = reset({
  rows: [row(5, S.ready), row(6, S.ready)],
  docs: [doc(5, S.ready, { mailed: S.ready }), doc(6, S.ready, { mailed: S.ready }),
         doc(11, S.ready, { amount: 630, supplier: 'דפוס כזה אני רוצה', receipt: 'u1' }),
         doc(12, S.ready, { amount: 400, supplier: 'מוטי שירות' })]
});
let out = sandbox.btxMirrorToSheet_(ss);
ok('שתי השורות החסרות נוספו', out.added === 2, JSON.stringify(out));
ok('🔴 והן בגיליון עם המזהים הנכונים',
   ids().join(',') === '5,6,11,12', ids().join(','));
ok('🔴 והסכום נכתב נכון', String(cell(11, 'סכום')) === '630', String(cell(11, 'סכום')));
ok('⚠️ ושם הרוכש הורכב ממזהה המשפחה (אינו יושב ב-Firestore)',
   cell(11, 'רוכש') === 'מורן ושלומי ממן', String(cell(11, 'רוכש')));
ok('🔴🔴 **ונשלחו לה שני מיילים** — זה מה שלא קרה בייצור',
   mails.length === 2 && mails.every(m => m.key === 'REIMBURSEMENT_READY'),
   JSON.stringify(mails.map(m => m.key)));
ok('⚠️ והקבלה הועברה לתיקייה הקבועה', moved.length === 1, JSON.stringify(moved));
ok('⚠️ ו-mailedStatus נרשם כדי שלא יישלח שוב',
   written.filter(w => w.doc && w.doc.mailedStatus === S.ready).length === 2,
   String(written.length));
ok('🔴 והמונה עלה — אחרת המטמון מגיש נתון ישן', bumped.length === 1);

section('2. ⚠️ הריצה הראשונה אינה מפיצה מיילים על שורות ותיקות');
ss = reset({ rows: [row(1, S.ready), row(2, S.paid)],
             docs: [doc(1, S.ready), doc(2, S.paid)] });   /* בלי mailedStatus */
out = sandbox.btxMirrorToSheet_(ss);
ok('🔴🔴 אף מייל לא יצא', mails.length === 0, JSON.stringify(mails));
ok('⚠️ אבל mailedStatus נקבע, כדי שהשינוי הבא כן יישלח',
   written.length === 2 && written.every(w => w.doc.mailedStatus));

section('3. שינוי סטטוס אמיתי אחרי שהשדה קיים');
ss = reset({ rows: [row(1, S.ready)],
             docs: [doc(1, S.paid, { mailed: S.ready })] });
out = sandbox.btxMirrorToSheet_(ss);
ok('הסטטוס בגיליון התעדכן', cell(1, 'סטטוס') === S.paid, String(cell(1, 'סטטוס')));
ok('🔴 ויצא מייל אחד בדיוק', mails.length === 1 && mails[0].key === 'REIMBURSEMENT_PAID',
   JSON.stringify(mails.map(m => m.key)));
out = sandbox.btxMirrorToSheet_(ss);   /* ריצה שנייה */
ok('⚠️ וריצה שנייה אינה שולחת שוב', mails.length === 1, String(mails.length));

section('4. מחיקה ב-Firestore ⇐ ארכיון, לא מחיקה שקטה');
ss = reset({ rows: [row(1, S.ready), row(2, S.ready)], docs: [doc(1, S.ready, { mailed: S.ready })] });
out = sandbox.btxMirrorToSheet_(ss);
ok('השורה ירדה מהטאב', ids().join(',') === '1', ids().join(','));
ok('🔴 והיא נשמרה בטאב הארכיון',
   !!sheets['תנועות שנמחקו'] && sheets['תנועות שנמחקו']._data.length === 2,
   sheets['תנועות שנמחקו'] ? String(sheets['תנועות שנמחקו']._data.length) : 'אין טאב');
ok('⚠️ ובארכיון יש את המזהה', out.archived === 1, JSON.stringify(out));

section('5. 🔴🔴 שומרי הסף של המחיקה');
ss = reset({ rows: [row(1, S.ready), row(2, S.ready)], docs: [] });
out = sandbox.btxMirrorToSheet_(ss);
ok('אפס מסמכים מול טאב מלא — לא נמחק כלום', ids().join(',') === '1,2', ids().join(','));
ok('⚠️ ונרשמה שגיאה, לא הצלחה שקטה', out.errors.length === 1, JSON.stringify(out.errors));

ss = reset({ rows: [row(1, S.ready)], fsThrows: true });
out = sandbox.btxMirrorToSheet_(ss);
ok('שאילתה שנכשלה — לא נמחק כלום', ids().join(',') === '1', ids().join(','));
ok('⚠️ והתוצאה אינה ok', out.ok === false, JSON.stringify(out));

section('6. עדכון שדות של שורה קיימת');
ss = reset({ rows: [row(1, S.ready, { amount: 100 })],
             docs: [doc(1, S.ready, { amount: 250, mailed: S.ready })] });
out = sandbox.btxMirrorToSheet_(ss);
ok('הסכום בגיליון יושר לפי Firestore', String(cell(1, 'סכום')) === '250', String(cell(1, 'סכום')));
ok('⚠️ ועמודה שאינה ברשימת ההיתר לא נדרסה',
   cell(1, 'רוכש') === 'מורן ושלומי ממן', String(cell(1, 'רוכש')));
ok('⚠️ ולא יצא מייל על שינוי סכום', mails.length === 0);

section('7. הדגל כבוי — הפונקציה שקטה לחלוטין');
ss = reset({ flagOn: false, rows: [row(1, S.ready)], docs: [doc(9, S.ready)] });
out = sandbox.btxMirrorToSheet_(ss);
ok('לא נגעה בטאב', ids().join(',') === '1', ids().join(','));
ok('ודיווחה למה', out.skipped === 'flag-off', JSON.stringify(out));

section('8. 🔴🔴 המוקש — הכיוון ההפוך חסום');
ss = reset({ rows: [row(1, S.ready)], docs: [] });
const sync = sandbox.budgetTxSyncAll_(ss);
ok('budgetTxSyncAll_ מסרבת כשהדגל דלוק', sync.refused === true && sync.ok === false,
   JSON.stringify(sync));
ok('🔴 ולא מחקה אף מסמך', deleted.length === 0, JSON.stringify(deleted));
ok('⚠️ ויש דרך מפורשת לעקוף מהעורך', /function budgetTxSyncForce\(\)/.test(CODE));
ok('🔴🔴 וגם בעקיפה — סחיפת היתומים לא רצה כשהדגל דלוק',
   /if \(out\.ok && !fsOwns\) \{/.test(CODE));

section('9. סדר הפעולות בקוד');
ok('🔴 העבודה השעתית מריצה את המראה לפני החלת הסטטוסים',
   CODE.indexOf('btxMirrorToSheet_(ss)') < CODE.indexOf('var a = budgetTxApplyPending_(ss);'));
ok('🔴 וגם הדחיפה מהדפדפן',
   /mirrored = btxMirrorToSheet_\(ss, \{ currentOnly: true \}\);[\s\S]{0,240}var r = budgetTxApplyPending_\(ss\);/.test(CODE));
ok('⚠️ והדחיפה מגבילה לשנה הנוכחית — מכסת Spark',
   /btxMirrorToSheet_\(ss, \{ currentOnly: true \}\)/.test(CODE) &&
   /if \(opts && opts\.currentOnly\)/.test(CODE));
ok('כפתור "סנכרון תנועות" עבר לכיוון הנכון',
   /txJobsUseFirestore_\(\) \? btxMirrorToSheet_\(ss\) : budgetTxSyncAll_\(ss\)/.test(CODE));

section('10. 🔴 הנפילה לאחור של הכתיבה');
ss = reset({ rows: [], docs: [] });
sandbox.saveTransactionRow_(ss, { year: Y, tx: { id: 31, amount: 55, status: S.submitted,
  source: 'resident', familyId: '7', month: '2026-09' } });
ok('שורה שנכתבה דרך Apps Script נדחפת ל-Firestore',
   written.some(w => String(w.path).indexOf(Y + '__31') > -1), JSON.stringify(written.map(w => w.path)));
ok('⚠️ ו-mailedStatus מסומן — אחרת המראה תשלח מייל כפול',
   written.some(w => w.doc && w.doc.mailedStatus !== undefined));
ss = reset({ rows: [row(1, S.ready)], docs: [] });
sandbox.deleteTransactionRow_(ss, { year: Y, id: 1 });
ok('ומחיקה דרך Apps Script מוחקת גם את המסמך',
   deleted.length === 1 && String(deleted[0]).indexOf(Y + '__1') > -1, JSON.stringify(deleted));
ok('⚠️ ופעולות גורפות עוברות בנקודה אחת', /function btxAfterWrite_\(ss, body, res\)/.test(CODE) &&
   (CODE.match(/json_\(btxAfterWrite_\(ss, body,/g) || []).length === 5);

section('11. 🔴🔴 שער הקריאה — הפיצול שנסגר');
ok('🔴 שער הקריאה אינו מותנה עוד בהרשאת תקציב',
   !/var txFs = seesBudget && slimRaw/.test(CODE) &&
   /var txFs = slimRaw === '2' && txJobsUseFirestore_\(\) && \(seesBudget \|\| !!myFamilyId\)/.test(CODE));
ok('והשרת מצהיר על ההיקף', /out\.txFsScope = seesBudget \? 'all' : 'family';/.test(CODE));
ok('⚠️ ותושב בלי מזהה משפחה אינו מרוקן', /\(seesBudget \|\| !!myFamilyId\)/.test(CODE));
ok('🔴 והלקוח קורא את ההיקף מהמטען ולא קובע בעצמו',
   /fsTxRows\(y, payload\.txFsScope !== "family", function/.test(SRC));
ok('🔴 והשנה הנוכחית מתרוקנת גם בענף התושב',
   /var txEmpty = txFs && y === currentY;/.test(CODE) &&
   /tx = \(txEmpty \|\| !myFamilyId\)/.test(CODE));
ok('⚠️ ושם הרוכש לתושב מגיע מהמטען (הספרייה חסומה לו)',
   /out\.txFsFamilyName/.test(CODE) && /payload\.txFsScope === "family"/.test(SRC));

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
