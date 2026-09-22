/* מארז בדיקות ל-GardenPurge.gs — ניקוי מלא + איפוס מונים (22.9.2026)
 *
 * מה נבדק כאן הוא מה שיכול להישבר בשקט:
 *   1. שהניקוי משאיר את שורת הכותרות ומוחק רק נתונים.
 *   2. שטאב ההגדרות (אזורים/קטגוריות) שורד.
 *   3. ששני השערים (Firestore, נעילה) עוצרים בלי לגעת בכלום.
 *   4. ש-gardenPurgeResetCounters **מסרב** כל עוד שרד ולו פריט אחד —
 *      כולל בטאבי הגיבוי, שזה בדיוק התנאי שיועד התנה בו את האיפוס.
 *   5. שטאב ארכיון אינו חוסם אבל כן מדווח.
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
function eq(name, a, b) {
  ok(name, JSON.stringify(a) === JSON.stringify(b),
     'קיבלתי ' + JSON.stringify(a) + ' במקום ' + JSON.stringify(b));
}

function makeSheet(name, headers, rows) {
  const data = [headers.slice()].concat(rows.map(r => r.slice()));
  return {
    name, _data: data,
    getName() { return this.name; },
    setName(n) { this.name = n; return this; },
    getLastRow() { return this._data.length; },
    getLastColumn() { return this._data[0] ? this._data[0].length : 0; },
    getDataRange() { const s = this; return { getValues: () => s._data.map(r => r.slice()) }; },
    getRange(r, c, nr, nc) {
      const s = this;
      return { getValues() {
        const out = [];
        for (let i = r - 1; i < r - 1 + nr; i++) out.push((s._data[i] || []).slice(c - 1, c - 1 + nc));
        return out;
      }, setValues() {} };
    },
    deleteRows(start, count) {
      if (start < 2) throw new Error('ניסיון למחוק את שורת הכותרות!');
      if (start + count - 1 > this._data.length) throw new Error('deleteRows מחוץ לטווח');
      this._data.splice(start - 1, count);
    },
    deleteRow(n) { this.deleteRows(n, 1); },
    hideSheet() { this.hidden = true; return this; },
    clear() { this._data = []; },
    setFrozenRows() {},
    rows() { return this._data.length - 1; }
  };
}

function buildWorld(opts) {
  opts = opts || {};
  const TASK_H = ['מזהה', 'סוג', 'כותרת', 'שלב', 'סגירה', 'שבוע'];
  const REP_H  = ['מזהה', 'מזהה משימה', 'תמונות', 'כותרת'];
  const LOG_H  = ['חותמת זמן', 'מזהה משימה', 'סוג רשומה'];
  const RUT_H  = ['מזהה', 'שם משימה', 'קטגוריה', 'אזורים', 'תדירות'];
  const SET_H  = ['סוג', 'מזהה', 'סדר', 'ערך', 'פעיל'];

  const tasks = [];
  for (let i = 1; i <= 46; i++) tasks.push([String(i), 'שגרה', 'כותרת', 'מתוכנן', '', '2026-09-13']);
  const reps = [
    ['4', '4', 'PHOTO-A,PHOTO-B', 'בדיקה'],
    ['15', '60', '', 'השקייה'],
    ['22', '74', 'PHOTO-C', 'בדיקה']
  ];
  const logRows = [];
  for (let i = 0; i < 206; i++) logRows.push(['t', String((i % 70) + 1), 'שיבוץ']);
  const rut = [['P1', 'כיסוח', 'גינון', 'צפון', 'שבועי'], ['P2', 'גיזום', 'גינון', 'דרום', 'חודשי']];
  const settings = [['אזור', 'A1', '1', 'צפון', 'כן'], ['קטגוריה', 'C1', '1', 'השקיה', 'כן']];

  const sheetList = [
    makeSheet('גינון — משימות', TASK_H, tasks),
    makeSheet('גינון — דיווחים', REP_H, reps),
    makeSheet('גינון — יומן', LOG_H, logRows),
    makeSheet('גינון — שגרה', RUT_H, rut),
    makeSheet('גינון — הגדרות', SET_H, settings),
    makeSheet('_נתוני_משימות גינון', ['id', 'עודכן', 'schema', 'json'], [['1', '', '1', '{}']]),
    makeSheet('_נתוני_דיווחי גינון', ['id', 'עודכן', 'schema', 'json'], []),
    makeSheet('_נתוני_יומן גינון', ['id', 'עודכן', 'schema', 'json'], []),
    makeSheet('_נתוני_תוכנית גינון', ['id', 'עודכן', 'schema', 'json'], []),
    makeSheet('תושבים', ['שם', 'טלפון'], [['דן', '050']])
  ];
  if (opts.archiveTab) {
    sheetList.push(makeSheet('ארכיון 22-09 15:00 — משימות', REP_H, [['9', '9', '', 'ישן']]));
    sheetList.push(makeSheet('ארכיון 22-09 15:00 — יומן', LOG_H, [['t', '9', 'שיבוץ']]));
  }
  const byName = {};
  sheetList.forEach(s => { byName[s.name] = s; });

  const fsDocs = { gardenTasks: {}, gardenReports: {}, gardenLog: {}, gardenPlan: {},
                   services: { a: {} }, budgetTx: { b: {} }, counters: {},
                   gymStatus: {}, gymCode: {}, clubReservations: {}, tourSteps: {},
                   tourSeen: {}, homeCounts: {}, budgetYears: {}, pushSubscriptions: {}, members: {} };
  for (let i = 1; i <= 46; i++) fsDocs.gardenTasks[String(i)] = {};
  reps.forEach(r => { fsDocs.gardenReports[r[0]] = {}; });
  for (let i = 0; i < 31; i++) fsDocs.gardenLog['L' + i] = { taskId: String(i + 1) };
  fsDocs.gardenPlan['P1'] = {}; fsDocs.gardenPlan['P2'] = {};
  const counters = { gardenTask: { n: 75 }, gardenReport: { n: 22 } };
  fsDocs.counters = counters;

  const trashed = [];
  const ctx = {
    console, JSON, Math, String, Number, Array, Object, Date, parseInt, isNaN,
    Logger: { log() {} },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    Utilities: { formatDate: () => '22-09 15:00' },
    LockService: { getScriptLock: () => ({ tryLock: () => opts.lockBusy !== true, releaseLock() {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => byName[n] || null,
      getSheets: () => sheetList.slice(),
      deleteSheet: (sh) => {
        const i = sheetList.indexOf(sh);
        if (i < 0) throw new Error('deleteSheet: גיליון לא קיים');
        sheetList.splice(i, 1);
        delete byName[sh.name];
      },
      insertSheet: () => makeSheet('חדש', [], [])
    }) },
    GARDEN_TASKS_SHEET: 'גינון — משימות',
    GARDEN_REPORTS_SHEET: 'גינון — דיווחים',
    GARDEN_LOG_SHEET: 'גינון — יומן',
    GARDEN_ROUTINE_SHEET: 'גינון — שגרה',
    GARDEN_KIND_LEGACY: {}, GARDEN_KIND_ROUTINE: 'שגרה', GARDEN_KIND_REPORT: 'דיווח תושב',
    FS_GARDEN_TASKS: 'gardenTasks', FS_GARDEN_REPORTS: 'gardenReports',
    FS_GARDEN_PLAN: 'gardenPlan', FS_COUNTERS: 'counters', FS_FLAGS_DOC: 'appConfig/flags',
    GARDEN_TASK_COUNTER: 'gardenTask', GARDEN_REPORT_COUNTER: 'gardenReport',
    BK_COLLECTIONS: [
      { collection: 'gardenTasks', tab: '_נתוני_משימות גינון' },
      { collection: 'gardenReports', tab: '_נתוני_דיווחי גינון' },
      { collection: 'gardenLog', tab: '_נתוני_יומן גינון' },
      { collection: 'gardenPlan', tab: '_נתוני_תוכנית גינון' },
      { collection: 'services', tab: '_נתוני_שירותים' }
    ],
    gardenCell_: (v) => (v === null || v === undefined) ? '' : String(v).trim(),
    gardenCols_: (sh) => { const m = {}; sh._data[0].forEach((h, i) => { m[String(h).trim()] = i; }); return m; },
    gardenWeekKey_: () => '2026-09-20',
    gardenDeletePhotos_: (csv) => String(csv || '').split(',').forEach(x => { if (x.trim()) trashed.push(x.trim()); }),
    fsDocPath_: (c, id) => c + '/' + id,
    fsGet_: (p) => {
      if (opts.fsDown) throw new Error('Firestore לא זמין (בדיקה)');
      const i = p.indexOf('/'); const c = p.slice(0, i), id = p.slice(i + 1);
      return (fsDocs[c] && fsDocs[c][id]) || null;
    },
    fsSet_: (p, obj) => {
      const i = p.indexOf('/'); const c = p.slice(0, i), id = p.slice(i + 1);
      fsDocs[c] = fsDocs[c] || {}; fsDocs[c][id] = obj; return true;
    },
    fsList_: (c) => {
      if (opts.fsDown) throw new Error('Firestore לא זמין (בדיקה)');
      return Object.keys(fsDocs[c] || {}).map(id => ({ id, data: fsDocs[c][id] }));
    },
    fsDelete_: (p) => {
      const i = p.indexOf('/'); const c = p.slice(0, i), id = p.slice(i + 1);
      if (fsDocs[c]) delete fsDocs[c][id];
      return true;
    },
    fsBackupAll_: (ss) => {
      /* מדמה את ההתנהגות האמיתית: כותב כל טאב גיבוי מחדש מהאוסף. */
      const tabs = [];
      ctx.BK_COLLECTIONS.forEach(c => {
        const sh = byName[c.tab];
        const docs = Object.keys(fsDocs[c.collection] || {});
        if (sh) sh._data = [sh._data[0]].concat(docs.map(id => [id, '', '1', '{}']));
        tabs.push({ collection: c.collection, tab: c.tab, docs: docs.length });
      });
      return { read: 0, tabs, errors: [] };
    }
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'GardenPurge.gs'), 'utf8'), ctx);
  return { ctx, byName, fsDocs, trashed, counters };
}

console.log('\n── 1. ניקוי מלא ──');
{
  const w = buildWorld();
  w.ctx.gardenPurgeWipe();
  eq('טאב המשימות ריק', w.byName['גינון — משימות'].rows(), 0);
  eq('טאב הדיווחים ריק', w.byName['גינון — דיווחים'].rows(), 0);
  eq('טאב היומן ריק', w.byName['גינון — יומן'].rows(), 0);
  eq('טאב השגרה ריק', w.byName['גינון — שגרה'].rows(), 0);
  ok('שורת הכותרות נשארה בכל ארבעתם',
     ['גינון — משימות','גינון — דיווחים','גינון — יומן','גינון — שגרה']
       .every(n => w.byName[n]._data.length === 1 && w.byName[n]._data[0].length > 0));
  eq('טאב ההגדרות לא נגעו בו', w.byName['גינון — הגדרות'].rows(), 2);
  eq('טאב תושבים לא נגעו בו', w.byName['תושבים'].rows(), 1);
  eq('gardenTasks ריק', Object.keys(w.fsDocs.gardenTasks).length, 0);
  eq('gardenReports ריק', Object.keys(w.fsDocs.gardenReports).length, 0);
  eq('gardenLog ריק', Object.keys(w.fsDocs.gardenLog).length, 0);
  eq('gardenPlan ריק', Object.keys(w.fsDocs.gardenPlan).length, 0);
  eq('services לא נגעו בו', Object.keys(w.fsDocs.services).length, 1);
  eq('budgetTx לא נגעו בו', Object.keys(w.fsDocs.budgetTx).length, 1);
  eq('המונים עדיין לא אופסו', [w.counters.gardenTask.n, w.counters.gardenReport.n], [75, 22]);
  eq('שלוש תמונות לסל', w.trashed.slice().sort(), ['PHOTO-A', 'PHOTO-B', 'PHOTO-C']);
}

console.log('\n── 2. שער Firestore ──');
{
  const w = buildWorld({ fsDown: true });
  const out = w.ctx.gardenPurgeWipe();
  ok('נעצר', out.indexOf('עצירה') >= 0);
  eq('הגיליון שלם', w.byName['גינון — משימות'].rows(), 46);
  eq('לא נגענו בתמונות', w.trashed.length, 0);
}

console.log('\n── 3. נעילה תפוסה ──');
{
  const w = buildWorld({ lockBusy: true });
  const out = w.ctx.gardenPurgeWipe();
  ok('נעצר', out.indexOf('תפוסה') >= 0);
  eq('הגיליון שלם', w.byName['גינון — משימות'].rows(), 46);
}

console.log('\n── 4. איפוס מונים מסרב כשיש נתונים ──');
{
  const w = buildWorld();
  const out = w.ctx.gardenPurgeResetCounters();
  ok('נעצר', out.indexOf('עצירה') >= 0);
  eq('המונים לא זזו', [w.counters.gardenTask.n, w.counters.gardenReport.n], [75, 22]);
}

console.log('\n── 5. איפוס מסרב גם כשרק טאב גיבוי שרד ──');
{
  const w = buildWorld();
  w.ctx.gardenPurgeWipe();
  /* הגיליון ו-Firestore נקיים, אבל טאב הגיבוי עדיין מחזיק שורה ישנה */
  eq('טאב הגיבוי עדיין מלא', w.byName['_נתוני_משימות גינון'].rows(), 1);
  const out = w.ctx.gardenPurgeResetCounters();
  ok('האיפוס נעצר בגלל טאב הגיבוי', out.indexOf('עצירה') >= 0);
  ok('ומצביע עליו', out.indexOf('_נתוני_משימות גינון') >= 0);
  eq('המונים לא זזו', [w.counters.gardenTask.n, w.counters.gardenReport.n], [75, 22]);
}

console.log('\n── 6. הרצף המלא: ניקוי → גיבוי → איפוס ──');
{
  const w = buildWorld();
  w.ctx.gardenPurgeWipe();
  w.ctx.gardenPurgeBackupRun();
  eq('טאב הגיבוי התרוקן', w.byName['_נתוני_משימות גינון'].rows(), 0);
  const ver = w.ctx.gardenPurgeVerify();
  ok('האימות אומר נקי', ver.indexOf('✅ נקי') >= 0);
  const out = w.ctx.gardenPurgeResetCounters();
  ok('האיפוס רץ', out.indexOf('עצירה') < 0);
  eq('המונים על 0', [w.counters.gardenTask.n, w.counters.gardenReport.n], [0, 0]);
  ok('מסמכי המונים עדיין קיימים', !!w.fsDocs.counters.gardenTask && !!w.fsDocs.counters.gardenReport);
}

console.log('\n── 7. טאב ארכיון לא חוסם אבל מדווח ──');
{
  const w = buildWorld({ archiveTab: true });
  w.ctx.gardenPurgeWipe();
  w.ctx.gardenPurgeBackupRun();
  const ver = w.ctx.gardenPurgeVerify();
  ok('האימות עדיין אומר נקי', ver.indexOf('✅ נקי') >= 0);
  ok('אבל מזכיר את הארכיון', ver.indexOf('ארכיון 22-09') >= 0);
  eq('שני טאבי ארכיון קיימים', Object.keys(w.byName).filter(n => n.indexOf('ארכיון ') === 0).length, 2);
  const out = w.ctx.gardenPurgeResetCounters();
  eq('והאיפוס עבר', [w.counters.gardenTask.n, w.counters.gardenReport.n], [0, 0]);
}

console.log('\n── 8. הרצה שנייה של הניקוי ──');
{
  const w = buildWorld();
  w.ctx.gardenPurgeWipe();
  const t1 = w.trashed.length;
  const out = w.ctx.gardenPurgeWipe();
  ok('לא נשברת', out.indexOf('🔴') < 0 || out.indexOf('עצירה') < 0);
  eq('לא נמחקו תמונות נוספות', w.trashed.length, t1);
  eq('הכותרות עדיין שם', w.byName['גינון — משימות']._data.length, 1);
}

console.log('\n── 9. מחיקת טאבי הארכיון ──');
{
  const w = buildWorld({ archiveTab: true });
  w.ctx.gardenPurgeWipe();
  w.ctx.gardenPurgeBackupRun();
  w.ctx.gardenPurgeResetCounters();
  const before = w.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheets().length;
  const out = w.ctx.gardenPurgeArchiveDrop();
  ok('דיווח על מחיקה', out.indexOf('נמחק:') >= 0);
  eq('שני טאבים ירדו', w.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheets().length, before - 2);
  eq('לא נשאר אף טאב ארכיון',
     Object.keys(w.byName).filter(n => n.indexOf('ארכיון ') === 0).length, 0);
  ok('הטאבים החיים שרדו', !!w.byName['גינון — משימות'] && !!w.byName['גינון — הגדרות']);
  ok('טאבי הגיבוי שרדו', !!w.byName['_נתוני_משימות גינון']);
  ok('טאב תושבים שרד', !!w.byName['תושבים']);
  const ver = w.ctx.gardenPurgeVerify();
  ok('האימות האחרון אומר נקי', ver.indexOf('✅ נקי') >= 0);
  ok('ולא מזכיר ארכיון', ver.indexOf('טאבי ארכיון') < 0);
}

console.log('\n── 10. מחיקת ארכיון כשאין ארכיון ──');
{
  const w = buildWorld();
  const n = w.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheets().length;
  const out = w.ctx.gardenPurgeArchiveDrop();
  ok('אומרת שאין מה למחוק', out.indexOf('אין טאבי ארכיון') >= 0);
  eq('ולא מחקה כלום', w.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheets().length, n);
}

console.log('\n════════════════════════════════');
console.log(pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
