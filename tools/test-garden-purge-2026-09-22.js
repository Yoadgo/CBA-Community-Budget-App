/* מארז בדיקות ל-GardenPurge.gs — 22.9.2026
 *
 * מה נבדק כאן הוא מה שיכול להישבר **בשקט**:
 *   1. מחיקת שורות מלמטה למעלה — הבאג הקלאסי שבו כל מחיקה מזיזה
 *      את האינדקסים ומדלגים על שורה.
 *   2. שער הזהות — שהפעולה באמת נעצרת כשהנתונים השתנו.
 *   3. שער Firestore — שכישלון קריאה לא משאיר גיליון מחוק בלי מסמכים.
 *   4. שלמות: אחרי הניקוי לא נשאר אף רפאים באף אחד מארבעת המחסנים.
 *
 * מריצים: node tools/test-garden-purge-2026-09-22.js
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; console.log('  ✘ ' + name + (extra ? '  → ' + extra : '')); }
}
function eq(name, a, b) { ok(name, JSON.stringify(a) === JSON.stringify(b), 'קיבלתי ' + JSON.stringify(a) + ' במקום ' + JSON.stringify(b)); }

/* ---------- גיליון מדומה שבאמת מזיז אינדקסים ---------- */
function makeSheet(headers, rows) {
  const data = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    _data: data,
    getLastRow() { return this._data.length; },
    getLastColumn() { return headers.length; },
    getDataRange() { const self = this; return { getValues() { return self._data.map(r => r.slice()); } }; },
    getRange() { return { getValues: () => [], setValues: () => {} }; },
    deleteRow(n) {
      if (n < 1 || n > this._data.length) throw new Error('deleteRow מחוץ לטווח: ' + n);
      this._data.splice(n - 1, 1);
    },
    setName(n) { this.name = n; return this; },
    hideSheet() { return this; },
    copyTo() { return makeSheet(headers, this._data.slice(1)); },
    ids(col) { return this._data.slice(1).map(r => String(r[col])); }
  };
}

/* ---------- העולם המדומה ---------- */
function buildWorld(opts) {
  opts = opts || {};
  const TASK_H = ['מזהה', 'סוג', 'כותרת', 'שלב', 'דגל', 'סגירה', 'שבוע'];
  const REP_H  = ['מזהה', 'מזהה משימה', 'תמונות', 'כותרת'];
  const LOG_H  = ['חותמת זמן', 'מזהה משימה', 'סוג רשומה'];

  const KEEP = ['60','61','62','63','64','65','66','67','68','69','70'];
  const KILL = ['4','5','6','7','8','9','12','15','16','17','18','19','20',
                '21','22','24','25','26','27','28','29','33','34','38','39',
                '40','41','43','44','45','53','55','59','73','74'];

  let taskIds = KILL.concat(KEEP);
  if (opts.extraTaskId) taskIds = taskIds.concat([opts.extraTaskId]);
  if (opts.dropKeepId) taskIds = taskIds.filter(x => x !== opts.dropKeepId);
  taskIds.sort((a, b) => Number(a) - Number(b));

  const tasks = taskIds.map(id => [id, 'שגרה', 'כותרת ' + id, 'מתוכנן', '', '', '2026-09-13']);

  /* דיווחים: 15-20 על משימות 60-65 (לשימור), 4/21/22 על 4/73/74 (למחיקה) */
  const reps = [
    ['4',  '4',  'PHOTO-A,PHOTO-B', 'בדיקה'],
    ['15', '60', '', 'השקייה'],
    ['16', '61', '', 'השקייה'],
    ['17', '62', '', 'השקייה'],
    ['18', '63', '', 'דשא'],
    ['19', '64', '', 'שיח'],
    ['20', '65', '', 'מדשאה'],
    ['21', '73', '', 'בדיקה'],
    ['22', '74', 'PHOTO-C', 'בדיקה']
  ];

  /* יומן: 3 שורות לכל משימה קיימת + 131 שורות יתומות על מזהים מתים */
  const logRows = [];
  taskIds.forEach(id => { for (let i = 0; i < 3; i++) logRows.push(['t', id, 'שיבוץ']); });
  const deadIds = ['1','2','3','10','11','13','14','23','30','31','32','35','36','37','42',
                   '46','47','48','49','50','51','52','54','56','57','58','71','72','75'];
  deadIds.forEach(id => { for (let i = 0; i < 4; i++) logRows.push(['t', id, 'מחיקה']); });
  logRows.push(['t', '', 'שורה בלי מזהה']);

  const sheets = {
    'גינון — משימות': makeSheet(TASK_H, tasks),
    'גינון — דיווחים': makeSheet(REP_H, reps),
    'גינון — יומן': makeSheet(LOG_H, logRows)
  };

  /* Firestore מדומה — כולל שני מסמכי רפאים שאין להם שורה */
  const fsDocs = {
    gardenTasks: {},
    gardenReports: {},
    gardenLog: {}
  };
  taskIds.forEach(id => { fsDocs.gardenTasks[id] = { id: id }; });
  fsDocs.gardenTasks['999'] = { id: '999' };              /* רפאים */
  reps.forEach(r => { fsDocs.gardenReports[r[0]] = { id: r[0] }; });
  fsDocs.gardenReports['888'] = { id: '888' };            /* רפאים */
  let n = 0;
  taskIds.concat(deadIds).forEach(id => {
    fsDocs.gardenLog[id + '_' + (n++)] = { taskId: id };
  });

  const trashed = [];
  const counters = { gardenTask: { n: 75 }, gardenReport: { n: 22 } };

  const ctx = {
    console,
    JSON, Math, String, Number, Array, Object, Date, parseInt, isNaN,
    Logger: { log() {} },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    Utilities: { formatDate: () => '09-22 12:00' },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => opts.lockBusy !== true,
        releaseLock: () => {}
      })
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({
        getSheetByName: (nm) => sheets[nm] || null,
        insertSheet: () => makeSheet([], [])
      })
    },
    GARDEN_TASKS_SHEET: 'גינון — משימות',
    GARDEN_REPORTS_SHEET: 'גינון — דיווחים',
    GARDEN_LOG_SHEET: 'גינון — יומן',
    GARDEN_KIND_LEGACY: {},
    GARDEN_KIND_ROUTINE: 'שגרה',
    GARDEN_KIND_REPORT: 'דיווח תושב',
    FS_GARDEN_TASKS: 'gardenTasks',
    FS_GARDEN_REPORTS: 'gardenReports',
    FS_COUNTERS: 'counters',
    FS_FLAGS_DOC: 'appConfig/flags',
    GARDEN_TASK_COUNTER: 'gardenTask',
    GARDEN_REPORT_COUNTER: 'gardenReport',
    BK_COLLECTIONS: [],
    gardenCell_: (v) => (v === null || v === undefined) ? '' : String(v).trim(),
    gardenCols_: (sh) => {
      const m = {};
      sh._data[0].forEach((h, i) => { m[String(h).trim()] = i; });
      return m;
    },
    gardenWeekKey_: () => '2026-09-20',
    gardenDeletePhotos_: (csv) => {
      String(csv || '').split(',').forEach(x => { if (x.trim()) trashed.push(x.trim()); });
    },
    fsDocPath_: (col, id) => col + '/' + id,
    fsGet_: (p) => {
      if (opts.fsDown) throw new Error('Firestore לא זמין (בדיקה)');
      const [col, id] = p.split('/');
      if (col === 'counters') return counters[id] || null;
      return (fsDocs[col] && fsDocs[col][id]) || null;
    },
    fsList_: (col) => {
      if (opts.fsDown) throw new Error('Firestore לא זמין (בדיקה)');
      return Object.keys(fsDocs[col] || {}).map(id => ({ id, data: fsDocs[col][id] }));
    },
    fsDelete_: (p) => {
      const i = p.indexOf('/');
      const col = p.slice(0, i), id = p.slice(i + 1);
      if (fsDocs[col]) delete fsDocs[col][id];
      return true;
    },
    fsBackupAll_: () => ({ read: 0, tabs: [], errors: [] })
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'GardenPurge.gs'), 'utf8');
  vm.runInContext(src, ctx);
  return { ctx, sheets, fsDocs, trashed, counters, KEEP, KILL, deadIds };
}

/* ======================= הבדיקות ======================= */

console.log('\n── 1. ריצה תקינה מקצה לקצה ──');
{
  const w = buildWorld();
  const out = w.ctx.gardenPurgeExecute();

  const left = w.sheets['גינון — משימות'].ids(0);
  eq('נשארו בדיוק 11 משימות', left.length, 11);
  eq('ואלה בדיוק מזהי השימור', left.slice().sort(), w.KEEP.slice().sort());

  const repsLeft = w.sheets['גינון — דיווחים'].ids(0);
  eq('נשארו 6 דיווחים', repsLeft.slice().sort(), ['15','16','17','18','19','20']);

  const logLeft = w.sheets['גינון — יומן']._data.slice(1).map(r => String(r[1]));
  ok('ביומן נשארו רק מזהי שימור',
     logLeft.every(id => w.KEEP.indexOf(id) >= 0), 'נמצא ' + JSON.stringify(logLeft.filter(id => w.KEEP.indexOf(id) < 0).slice(0, 5)));
  eq('ובדיוק 3 שורות לכל אחת מ-11', logLeft.length, 33);

  eq('Firestore — 11 מסמכי משימה', Object.keys(w.fsDocs.gardenTasks).sort(), w.KEEP.slice().sort());
  eq('Firestore — 6 מסמכי דיווח', Object.keys(w.fsDocs.gardenReports).sort(), ['15','16','17','18','19','20']);
  ok('Firestore — מסמך הרפאים 999 נמחק', !w.fsDocs.gardenTasks['999']);
  ok('Firestore — מסמך הרפאים 888 נמחק', !w.fsDocs.gardenReports['888']);
  const logTaskIds = Object.keys(w.fsDocs.gardenLog).map(k => w.fsDocs.gardenLog[k].taskId);
  ok('Firestore — יומן רק למזהי שימור',
     logTaskIds.every(id => w.KEEP.indexOf(id) >= 0), JSON.stringify(logTaskIds.slice(0, 5)));

  eq('שלוש תמונות הועברו לסל', w.trashed.slice().sort(), ['PHOTO-A','PHOTO-B','PHOTO-C']);
  eq('המונים לא זזו', [w.counters.gardenTask.n, w.counters.gardenReport.n], [75, 22]);
  ok('הדוח מדווח שהמונים לא ירדו', out.indexOf('המונים לא זזו אחורה') >= 0);
  ok('המזהה הבא הוא 76', out.indexOf('תקבל 76') >= 0);
}

console.log('\n── 2. שער הזהות: מזהה חדש שלא היה באישור ──');
{
  const w = buildWorld({ extraTaskId: '80' });
  const out = w.ctx.gardenPurgeExecute();
  ok('נעצר', out.indexOf('עצירה') >= 0);
  ok('ומצביע על המזהה', out.indexOf('80') >= 0);
  eq('לא נמחקה אף שורה', w.sheets['גינון — משימות'].getLastRow() - 1, 47);
  eq('ולא אף מסמך', Object.keys(w.fsDocs.gardenTasks).length, 48);
  eq('ולא אף תמונה', w.trashed.length, 0);
}

console.log('\n── 3. שער הזהות: משימת שימור נעלמה ──');
{
  const w = buildWorld({ dropKeepId: '66' });
  const out = w.ctx.gardenPurgeExecute();
  ok('נעצר', out.indexOf('עצירה') >= 0);
  ok('ומצביע על 66', out.indexOf('66') >= 0);
  eq('לא נמחקה אף שורה', w.sheets['גינון — משימות'].getLastRow() - 1, 45);
  eq('ולא אף תמונה', w.trashed.length, 0);
}

console.log('\n── 4. שער Firestore: לא זמין ──');
{
  const w = buildWorld({ fsDown: true });
  const out = w.ctx.gardenPurgeExecute();
  ok('נעצר', out.indexOf('עצירה') >= 0);
  ok('ומסביר למה', out.indexOf('רפאים') >= 0);
  eq('הגיליון שלם', w.sheets['גינון — משימות'].getLastRow() - 1, 46);
  eq('היומן שלם', w.sheets['גינון — יומן'].getLastRow() - 1, 46 * 3 + 29 * 4 + 1);
  eq('ולא נגענו בתמונות', w.trashed.length, 0);
}

console.log('\n── 5. נעילה תפוסה ──');
{
  const w = buildWorld({ lockBusy: true });
  const out = w.ctx.gardenPurgeExecute();
  ok('נעצר', out.indexOf('תפוסה') >= 0);
  eq('לא נמחק כלום', w.sheets['גינון — משימות'].getLastRow() - 1, 46);
}

console.log('\n── 6. הרצה שנייה על מצב נקי (אידמפוטנטיות) ──');
{
  const w = buildWorld();
  w.ctx.gardenPurgeExecute();
  const out2 = w.ctx.gardenPurgeExecute();
  ok('ההרצה השנייה אינה נעצרת אלא פשוט לא מוחקת כלום', out2.indexOf('עצירה') < 0);
  ok('ולא נגעה בתמונות נוספות', w.trashed.length === 3, 'סל: ' + w.trashed.length);
  ok('ולא נמחק מסמך נוסף', Object.keys(w.fsDocs.gardenTasks).length === 11);
  eq('ועדיין 11 משימות', w.sheets['גינון — משימות'].ids(0).length, 11);
  eq('ועדיין 6 דיווחים', w.sheets['גינון — דיווחים'].ids(0).length, 6);
}

console.log('\n── 7. רשימות הקוד תואמות את מה שאושר ──');
{
  const w = buildWorld();
  eq('11 מזהי שימור', w.ctx.GP_KEEP.length, 11);
  eq('35 מזהי מחיקה', w.ctx.GP_KILL.length, 35);
  const both = w.ctx.GP_KEEP.filter(x => w.ctx.GP_KILL.indexOf(x) >= 0);
  eq('אין חפיפה בין הרשימות', both, []);
  eq('סך הכול 46', w.ctx.GP_KEEP.length + w.ctx.GP_KILL.length, 46);
}

console.log('\n════════════════════════════════');
console.log(pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
