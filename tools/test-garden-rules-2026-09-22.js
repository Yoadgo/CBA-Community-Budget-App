/* מארז ל-gardenRules.js — כללי החזרתיות ומנוע האופק (22.9.2026)
 * הרצה:  node tools/test-garden-rules-2026-09-22.js
 *
 * 🔴 מה נבדק כאן:
 *   1. **זהות שני העותקים** — js/data/gardenRules.js ≡ apps-script/GardenRules.gs.
 *   2. **נאמנות למנוע הישן** — אותן הגדרות, אותם שבועות, אותה תשובה כמו
 *      gardenPlanForWeek_ האמיתי מ-Code.gs. סטייה כאן אינה שגיאה שנראית;
 *      היא משימה שנוצרת בשבוע הלא נכון.
 *   3. **המנוע**: אופק מלא, אידמפוטנטיות, effectiveFrom, מחיקה/כיבוי
 *      של הגדרה, ומופע שנגעו בו שלעולם אינו נמחק.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

/* ---------- 1. זהות ---------- */
section('1. שני העותקים זהים');
const SRC = R('js/data/gardenRules.js');
eq('js/data/gardenRules.js ≡ apps-script/GardenRules.gs', SRC, R('apps-script/GardenRules.gs'));

/* ---------- טעינה ---------- */
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(SRC, ctx);
const G = ctx.GardenRules;
ok('GardenRules נטען', !!G && typeof G.horizon === 'function');

/* ---------- 2. נאמנות למנוע הישן ---------- */
section('2. נאמנות ל-gardenPlanForWeek_ האמיתי');
{
  /* חותכים מ-Code.gs את חמש הפונקציות הטהורות של המנוע הישן. */
  const CODE = R('apps-script/Code.gs');
  function cut(name) {
    const i = CODE.indexOf('function ' + name + '(');
    if (i < 0) throw new Error('לא נמצא ' + name);
    let depth = 0, j = CODE.indexOf('{', i);
    for (; j < CODE.length; j++) { if (CODE[j] === '{') depth++; if (CODE[j] === '}') { depth--; if (!depth) break; } }
    return CODE.slice(i, j + 1);
  }
  const old = {
    Utilities: { formatDate: (d) => { const p = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); } },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    gardenLists_: () => ({ areas: [] }), gardenPlanRows_: () => []
  };
  vm.createContext(old);
  ['gardenWeekKey_', 'gardenWeekMeta_', 'gardenParseMonths_', 'gardenOccIndex_', 'gardenPlanApplies_', 'gardenPlanAreas_', 'gardenPlanForWeek_']
    .forEach(n => vm.runInContext(cut(n), old));

  const defs = [
    { id: 'T1', title: 'כיסוח', category: 'מדשאות', areas: ['צפון', 'דרום'], freq: 'שבועי', firstWeek: '', weekOfMonth: 1, months: '', rotate: false, active: true },
    { id: 'T2', title: 'גיזום דקלים', category: 'עצים', areas: ['צפון', 'מרכז', 'דרום'], freq: 'שבועי', firstWeek: '', weekOfMonth: 1, months: '3-11', rotate: true, active: true },
    { id: 'T3', title: 'השקיה', category: 'השקיה', areas: [], freq: 'דו-שבועי', firstWeek: '2026-09-06', weekOfMonth: 1, months: '', rotate: false, active: true },
    { id: 'T4', title: 'חודשי', category: 'ניקיון', areas: ['מרכז'], freq: 'חודשי', firstWeek: '', weekOfMonth: 3, months: '', rotate: false, active: true },
    { id: 'T5', title: 'שנתי — הכנה לחורף', category: 'השקיה', areas: [], freq: 'שנתי', firstWeek: '', weekOfMonth: 2, months: '10', rotate: false, active: true },
    { id: 'T6', title: 'כבויה', category: 'x', areas: [], freq: 'שבועי', firstWeek: '', weekOfMonth: 1, months: '', rotate: false, active: false },
    { id: 'T7', title: 'עוגן עתידי', category: 'x', areas: [], freq: 'שבועי', firstWeek: '2026-11-01', weekOfMonth: 1, months: '', rotate: false, active: true }
  ];
  const weeks = [];
  for (let i = 0; i < 20; i++) weeks.push(G.weekShift('2026-09-06', i));
  let mismatches = [];
  weeks.forEach(wk => {
    const a = old.gardenPlanForWeek_(null, wk, defs, []).map(o => o.def.id + '|' + o.area).sort();
    const b = G.forWeek(defs, wk).map(o => o.def.id + '|' + o.area).sort();
    if (JSON.stringify(a) !== JSON.stringify(b)) mismatches.push(wk + ': ישן=' + a + ' חדש=' + b);
  });
  ok('20 שבועות · 7 הגדרות · אותה תשובה בדיוק', mismatches.length === 0, mismatches.slice(0, 2).join(' ; '));
  eq('מפתח שבוע זהה', G.weekKey(new Date(2026, 8, 22)), old.gardenWeekKey_(new Date(2026, 8, 22)));
  eq('meta זהה', G.weekMeta('2026-09-27').n, old.gardenWeekMeta_('2026-09-27').n);
  eq('שבוע 5 — אין שגרה', G.forWeek(defs, '2026-11-29').length, 0);
}

/* ---------- 3. המנוע ---------- */
section('3. מנוע האופק');
const defs = [
  { id: 'T1', title: 'כיסוח', category: 'מדשאות', areas: ['צפון', 'דרום'], freq: 'שבועי', firstWeek: '', weekOfMonth: 1, months: '', rotate: false, active: true },
  { id: 'T4', title: 'חודשי', category: 'ניקיון', areas: ['מרכז'], freq: 'חודשי', firstWeek: '', weekOfMonth: 3, months: '', rotate: false, active: true }
];
const FROM = '2026-09-20';
{
  const r = G.horizon(defs, [], FROM, { now: new Date(2026, 8, 22), year: 'תשפ"ז' });
  eq('אופק של 8 שבועות', r.weeks.length, 8);
  eq('בחלון 20.9→8.11 אין שבוע 5 (29.11 מחוץ לחלון)', r.weeks.filter(w => G.weekMeta(w).n === 5).length, 0);
  eq('ובחלון שכן מכיל שבוע 5 — הוא מדולג', G.horizon(defs, [], '2026-11-08', { now: new Date(2026, 10, 10) }).create.filter(d => d.week === '2026-11-29').length, 0);
  const t1 = r.create.filter(d => d.templateId === 'T1');
  eq('שבועי × 2 אזורים × 8 שבועות = 16', t1.length, 16);
  const t4 = r.create.filter(d => d.templateId === 'T4');
  eq('חודשי בשבוע 3 — פעמיים ב-8 שבועות (אוקטובר, נובמבר)', t4.length, 2);
  ok('מזהה דטרמיניסטי', t1[0].id === G.occId('T1', t1[0].week, t1[0].area));
  ok('צורת מסמך: kind שגרה, שלב מתוכנן, firstWeek=week', t1.every(d => d.kind === 'שגרה' && d.stage === 'מתוכנן' && d.firstWeek === d.week));
  eq('אין הסרות על מסד ריק', r.remove.length, 0);

  /* אידמפוטנטיות: מריצים שוב על מה שנוצר — אפס עבודה */
  const r2 = G.horizon(defs, r.create, FROM, { now: new Date(2026, 8, 22) });
  eq('ריצה שנייה — אפס יצירות', r2.create.length, 0);
  eq('ריצה שנייה — אפס הסרות', r2.remove.length, 0);
  eq('והכול נספר כ-kept', r2.kept, r.create.length);
}

section('4. שינוי הגדרה — "מהשבוע הבא"');
{
  const seed = G.horizon(defs, [], FROM, { now: new Date(2026, 8, 22) }).create;
  /* T1 עובר מ-2 אזורים לאזור אחד, בתוקף מהשבוע הבא */
  const changed = [Object.assign({}, defs[0], { areas: ['צפון'], effectiveFrom: G.weekShift(FROM, 1) }), defs[1]];
  const r = G.horizon(changed, seed, FROM, { now: new Date(2026, 8, 22) });
  const removedSouthThisWeek = r.remove.some(id => id === G.occId('T1', FROM, 'דרום'));
  ok('השבוע הנוכחי קפוא — "דרום" של השבוע לא הוסר', !removedSouthThisWeek);
  const removedSouthNext = r.remove.some(id => id === G.occId('T1', G.weekShift(FROM, 1), 'דרום'));
  ok('מהשבוע הבא — "דרום" הוסר', removedSouthNext);
  eq('7 הסרות (דרום × 7 שבועות עתידיים)', r.remove.length, 7);
  eq('אפס יצירות (צפון כבר קיים)', r.create.length, 0);
}

section('5. שינוי הגדרה — "מהשבוע הנוכחי"');
{
  const seed = G.horizon(defs, [], FROM, { now: new Date(2026, 8, 22) }).create;
  const changed = [Object.assign({}, defs[0], { areas: ['צפון'], effectiveFrom: FROM }), defs[1]];
  const r = G.horizon(changed, seed, FROM, { now: new Date(2026, 8, 22) });
  eq('8 הסרות — כולל השבוע הנוכחי', r.remove.length, 8);
}

section('6. מופע שנגעו בו לעולם אינו נמחק');
{
  const seed = G.horizon(defs, [], FROM, { now: new Date(2026, 8, 22) }).create;
  const touchedId = G.occId('T1', G.weekShift(FROM, 2), 'דרום');
  seed.forEach(d => { if (d.id === touchedId) { d.stage = 'בטיפול'; } });
  const noteId = G.occId('T1', G.weekShift(FROM, 3), 'דרום');
  seed.forEach(d => { if (d.id === noteId) { d.note = 'הגנן כתב משהו'; } });
  const draggedId = G.occId('T1', G.weekShift(FROM, 4), 'דרום');
  seed.forEach(d => { if (d.id === draggedId) { d.drags = 1; d.week = G.weekShift(FROM, 5); } });
  /* מוחקים את T1 לגמרי */
  const r = G.horizon([defs[1]], seed, FROM, { now: new Date(2026, 8, 22) });
  ok('המופע בטיפול נשאר', r.remove.indexOf(touchedId) < 0);
  ok('המופע עם הערה נשאר', r.remove.indexOf(noteId) < 0);
  ok('המופע שנגרר נשאר', r.remove.indexOf(draggedId) < 0);
  eq('שלושה קפואים', r.frozen, 3);
  eq('שאר מופעי T1 הוסרו (16 − 3)', r.remove.length, 13);
}

section('7. כיבוי הגדרה = כמו מחיקה, מיידי');
{
  const seed = G.horizon(defs, [], FROM, { now: new Date(2026, 8, 22) }).create;
  const off = [Object.assign({}, defs[0], { active: false }), defs[1]];
  const r = G.horizon(off, seed, FROM, { now: new Date(2026, 8, 22) });
  eq('כל 16 מופעי T1 הוסרו', r.remove.length, 16);
  eq('T4 לא נגע', r.remove.filter(id => id.indexOf('R_T4_') === 0).length, 0);
}

section('8. גלגול האופק — שבוע עבר, שבוע חדש נכנס');
{
  const seed = G.horizon(defs, [], FROM, { now: new Date(2026, 8, 22) }).create;
  const r = G.horizon(defs, seed, G.weekShift(FROM, 1), { now: new Date(2026, 8, 29) });
  ok('נוצרו מופעים לשבוע ה-9', r.create.every(d => d.week === G.weekShift(FROM, 8)));
  eq('לא נמחק כלום מהעבר (מחוץ לחלון)', r.remove.length, 0);
}

section('9. affectsOccurrences');
{
  const a = defs[0];
  ok('שינוי הערה — לא משפיע', !G.affectsOccurrences(a, Object.assign({}, a, { note: 'x', clause: 'y' })));
  ok('שינוי תדירות — משפיע', G.affectsOccurrences(a, Object.assign({}, a, { freq: 'חודשי' })));
  ok('שינוי אזורים — משפיע', G.affectsOccurrences(a, Object.assign({}, a, { areas: ['צפון'] })));
  ok('הגדרה חדשה — משפיע', G.affectsOccurrences(null, a));
}

console.log('\n════════════════════════════════');
console.log(pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
