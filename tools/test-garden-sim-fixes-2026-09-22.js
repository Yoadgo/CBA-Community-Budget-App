/* הגינון — תיקוני הסימולציה (22.9.2026, ערב)
 * הרצה:  node tools/test-garden-sim-fixes-2026-09-22.js
 *
 * מריץ את **הקוד האמיתי** (dataService.js, gardenRules.js, GardenHorizon.gs) מול
 * Firestore מדומה שאוכף **פורט 1:1 של כללי האבטחה** (tools/garden-sim/rules.js)
 * לפי תפקיד — כלומר כל תרחיש כאן נכשל בדיוק היכן ש-Firestore האמיתי היה נכשל.
 * ⚠️ הפורט חייב להתעדכן עם firestore.rules; בדיקה 0 משווה את רשימות השדות.
 *
 * מה שנבדק — ממצא לממצא מתוך claude/garden-simulation-findings-2026-09-22.md:
 *   A/B  איחוד דיווח בלי הערה עובר, והדיווח של התושב מופנה ועוקב אחרי הבולעת
 *   C    פעולות הצוות על דיווח תושב נרשמות עם familyId — התושב רואה אותן
 *   D    הגנן קורא היסטוריה דרך Apps Script
 *   E    מחיקת שגרה = ביטול; המנוע לא מחזיר
 *   F    שינוי שם/קטגוריה מגיע לכרטיסים שלא נגעו בהם
 *   G    "שבוע ראשון" מוצמד ליום ראשון
 *   10   אישור מנהל לתקלות דיירים — עם מתג
 *   11   מחיקת משימת דיווח: התושב רואה "נסגר", הדיווח נשאר
 *   L/M/N כותרת ארוכה, מזהה תבנית תפוס, שינוי סיבת סגירה
 */
'use strict';
const fs = require('fs'), path = require('path');
const H = require('./garden-sim/harness');
const { GL_RESIDENT_KINDS } = require('./garden-sim/rules');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const eq = (n, a, b) => ok(n, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(a) + ' ≠ ' + JSON.stringify(b));
const section = t => console.log('\n' + t);
const T0 = new Date(2026, 8, 22, 10, 0, 0), DAY = 86400000;

async function world() {
  const store = H.newStore();
  let now = new Date(T0.getTime());
  const clock = { now: () => now, add: ms => { now = new Date(now.getTime() + ms); } };
  const trashed = [];
  const S = H.server(store, clock, trashed);
  const Bs = {};
  const B = uid => (Bs[uid] = Bs[uid] || H.browser(store, uid, clock));
  const G = B('mgr').GardenRules;
  const THIS = G.weekKey(now);
  const W = { store, clock, S, B, G, THIS, trashed, ids: {} };
  const p1 = await H.call(cb => B('mgr').CBA.data.gardenPlanSave({ title: 'בדיקת השקיה', category: 'השקיה / ממטרות', freq: 'שבועי', areas: ['ציר מזרחי'], effectiveFrom: THIS }, cb));
  W.ids.plan1 = p1.id;
  W.ids.routine = G.occId(p1.id, THIS, 'ציר מזרחי');
  const r1 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'ההשקיה לא עובדת', category: 'השקיה / ממטרות', area: 'ציר מזרחי', desc: 'ליד 608', x: 0.4, y: 0.5, photos: [] }, cb));
  const r2 = await H.call(cb => B('res2').CBA.data.submitGardenReport({ title: 'גם אצלנו', category: 'השקיה / ממטרות', place: 'מאחורי המרפסת', photos: [] }, cb));
  W.ids.rep1 = String(r1.id); W.ids.task1 = String(r1.taskId);
  W.ids.rep2 = String(r2.id); W.ids.task2 = String(r2.taskId);
  return W;
}
const residentLog = (W, taskId) => Object.values(W.store.gardenLog).filter(l => l.taskId === taskId && l.familyId && GL_RESIDENT_KINDS.includes(l.kind)).map(l => l.kind);

(async () => {
  section('0. הפורט של הכללים תואם ל-firestore.rules');
  {
    const RULES = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const PORT = fs.readFileSync(path.join(__dirname, 'garden-sim', 'rules.js'), 'utf8');
    const gt = (RULES.match(/function gtFields\(\) \{[\s\S]*?\];/) || [''])[0];
    ['familyId', 'mergedReps', 'pendingDelete'].forEach(f => ok('gtFields מכיל ' + f + ' בשני המקומות', gt.includes("'" + f + "'") && /GT_FIELDS = \[[^\]]*'familyId'/.test(PORT) === (f !== 'x') && PORT.includes("'" + f + "'")));
    ok('mergedReps ב-gtTeamUpdateOk', /gtTeamUpdateOk\(\) \{[\s\S]*?'mergedReps'\]\)/.test(RULES));
    ok('gardenMeta/settings — שער כתיבה בשם', /match \/gardenMeta\/settings \{\s*allow write: if gsSettingsWriteOk\(\);/.test(RULES));
    ok('ושמור למנהל פנימי עם שלושה שדות', /function gsSettingsWriteOk\(\) \{\s*return canSeePlan\(\) &&[\s\S]*?hasOnly\(\['requireApproval', 'updatedAt', 'updatedBy'\]\)/.test(RULES));
  }

  section('A+B. איחוד דיווח תושב בלי הערה — עובר, והדיווח עוקב אחרי הבולעת');
  {
    const W = await world();
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenMerge(W.ids.task2, W.ids.task1, cb));
    ok('האיחוד עבר בכללים (בלי הערה מוקדמת)', r.ok === true, JSON.stringify(r));
    eq('דיווח אחד הופנה', r.moved, 1);
    const child = W.store.gardenTasks[W.ids.task2], rep2 = W.store.gardenReports[W.ids.rep2], parent = W.store.gardenTasks[W.ids.task1];
    ok('הנבלעת סגורה אוחד עם הערה', child.closure === 'אוחד' && /אוחד עם פנייה/.test(child.note));
    ok('הדיווח של תושב 2 מצביע לבולעת', rep2.taskId === W.ids.task1 && rep2.mergedInto === W.ids.rep1);
    eq('הבולעת זוכרת אותו', parent.mergedReps, [W.ids.rep2]);
    /* הבולעת מתקדמת — הדיווח המאוחד עוקב */
    const d = await H.call(cb => W.B('gard').CBA.data.gardenTask('note', W.ids.task1, { note: 'בדרך' }, cb));
    ok('הערה על הבולעת', d.ok === true, JSON.stringify(d));
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('done', W.ids.task1, { note: 'תוקן' }, cb));
    ok('הדיווח המאוחד רואה "בוצע" של הבולעת', W.store.gardenReports[W.ids.rep2].closure === 'בוצע' && W.store.gardenReports[W.ids.rep2].mergedInto === W.ids.rep1);
    ok('וגם הדיווח של הבולעת', W.store.gardenReports[W.ids.rep1].closure === 'בוצע');
    /* גם הגנן מאחד (שיפוט שטח) */
    const W2 = await world();
    const g = await H.call(cb => W2.B('gard').CBA.data.gardenMerge(W2.ids.task2, W2.ids.task1, cb));
    ok('גם הגנן מאחד', g.ok === true, JSON.stringify(g));
    const W3 = await world();
    const x = await H.call(cb => W3.B('res1').CBA.data.gardenMerge(W3.ids.task2, W3.ids.task1, cb));
    ok('תושב — לא', x.ok === false);
  }

  section('C. קו הזמן של התושב — פעולות הצוות נושאות familyId');
  {
    const W = await world();
    ok('המשימה נושאת familyId מהיצירה', W.store.gardenTasks[W.ids.task1].familyId === 'F1');
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('plan', W.ids.task1, { week: W.THIS }, cb));
    await H.call(cb => W.B('gard').CBA.data.gardenTask('defer', W.ids.task1, {}, cb));
    await H.call(cb => W.B('gard').CBA.data.gardenTask('note', W.ids.task1, { note: 'הגעתי' }, cb));
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('done', W.ids.task1, { note: 'תוקן' }, cb));
    eq('התושב רואה: נפתח, שיבוץ, גרירה, הערה, סגירה', residentLog(W, W.ids.task1), ['נפתח', 'שיבוץ', 'גרירה', 'הערה', 'סגירה']);
    const my = await H.call(cb => W.B('res1').CBA.data.getMyGardenLog(cb));
    eq('ודרך הקריאה שלו — עם הכללים', my.ok && my.rows.length, 5);
    const other = await H.call(cb => W.B('res2').CBA.data.getMyGardenLog(cb));
    eq('השכן לא רואה כלום מזה', other.ok && other.rows.filter(l => l.taskId === W.ids.task1).length, 0);
    const audit = W.B('mgr').__audit.filter(a => a.coll === 'gardenReports' && a.kind === 'get');
    eq('המנהל לא ניסה לקרוא דיווח', audit.length, 0);
  }

  section('D. הגנן — היסטוריה דרך Apps Script');
  {
    const W = await world();
    const g = await H.call(cb => W.B('gard').CBA.data.getGardenTaskLog(W.ids.task1, cb));
    ok('הגנן פונה לשרת (gardenTaskLog)', W.B('gard').__sheets.some(c => c.action === 'gardenTaskLog') && /APPS_SCRIPT:gardenTaskLog/.test(g.error || ''));
    const m = await H.call(cb => W.B('mgr').CBA.data.getGardenTaskLog(W.ids.task1, cb));
    ok('המנהל — ישירות מ-Firestore', m.ok === true && m.rows.length === 1 && !W.B('mgr').__sheets.some(c => c.action === 'gardenTaskLog'));
    const GS = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');
    ok("השרת קורא את היומן מ-Firestore כשהוא הבעלים", /function handleGardenTaskLog_[\s\S]*?gardenFsOwns_\(\)\) \{\s*var docs = fsQuery_\('gardenLog', 'taskId', 'EQUAL', id, 300\)/.test(GS));
    ok('ומסנן לגנן כמו קודם', /function handleGardenTaskLog_[\s\S]*?if \(isExtLog\) \{\s*if \(k === 'משוב'\) \{ who = 'תושב'; note = ''; \}/.test(GS));
  }

  section('E. מחיקת שגרה = ביטול, והמנוע לא מחזיר');
  {
    const W = await world();
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenTaskDelete(W.ids.routine, 'הגשם', cb));
    ok('בוטל', r.ok && r.cancelled === true, JSON.stringify(r));
    ok('סגור בוטל, לא נמחק, לא מסומן למחיקה', W.store.gardenTasks[W.ids.routine].closure === 'בוטל' && !W.store.gardenTasks[W.ids.routine].pendingDelete);
    W.S.gardenPendingDeleteRun_(null);
    const h = W.S.gardenHorizonRun_(null);
    ok('המנוע לא יצר אותו מחדש', h.created === 0 && !!W.store.gardenTasks[W.ids.routine]);
    const GT = fs.readFileSync(path.join(__dirname, '..', 'js', 'screens', 'gardenTasks.js'), 'utf8');
    ok('המסך: "ביטול המופע הזה" לשגרה', /t\.kind === "שגרה" \? "ביטול המופע הזה" : "מחיקה"/.test(GT));
    ok('ומגירה סגורה ב"סגורות"', /<details class="gt-drawer">[\s\S]*?מופעי שגרה שבוטלו/.test(GT));
  }

  section('F. שינוי שם/קטגוריה מגיע לכרטיסים');
  {
    const W = await world();
    await H.call(cb => W.B('gard').CBA.data.gardenTask('done', W.ids.routine, {}, cb));
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenPlanSave({ id: W.ids.plan1, title: 'בדיקת השקיה + ממטרות', category: 'מדשאות', freq: 'שבועי', areas: ['ציר מזרחי'], effectiveFrom: W.THIS }, cb));
    ok('נשמר', r.ok === true, JSON.stringify(r));
    eq('7 עודכנו (8 פחות זה שבוצע)', r.horizon.renamed, 7);
    const titles = Object.values(W.store.gardenTasks).filter(t => t.kind === 'שגרה').map(t => t.title);
    eq('הישן נשאר רק על זה שבוצע', titles.filter(t => t === 'בדיקת השקיה').length, 1);
    eq('והקטגוריה עודכנה', Object.values(W.store.gardenTasks).filter(t => t.category === 'מדשאות').length, 7);
    ok('הטוסט אומר', /עודכנו 7/.test(W.B('mgr').CBA.data.gardenHorizonSummary(r.horizon)));
    const s2 = W.S.gardenHorizonRun_(null);
    eq('השרת מסכים — אפס עבודה', [s2.created, s2.removed, s2.renamed], [0, 0, 0]);
  }

  section('G. "שבוע ראשון" מוצמד ליום ראשון');
  {
    const W = await world();
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenPlanSave({ title: 'כיסוח', category: 'מדשאות', freq: 'דו-שבועי', firstWeek: '2026-09-23', areas: [], effectiveFrom: W.THIS }, cb));
    ok('נשמר', r.ok === true, JSON.stringify(r));
    eq('יום רביעי → יום ראשון של אותו שבוע', W.store.gardenPlan[r.id].firstWeek, '2026-09-20');
    eq('ודו-שבועי מייצר 4 מופעים באופק', r.horizon.created, 4);
  }

  section('10. אישור מנהל לתקלות דיירים — מתג');
  {
    const W = await world();
    /* ברירת מחדל: דלוק */
    const s0 = await H.call(cb => W.B('gard').CBA.data.getGardenSettings(cb));
    ok('ברירת מחדל דלוק', s0.requireApproval === true);
    const d = await H.call(cb => W.B('gard').CBA.data.gardenTask('done', W.ids.task1, { note: 'תוקן' }, cb));
    ok('גנן מסמן תקלת דייר', d.ok === true, JSON.stringify(d));
    const t = W.store.gardenTasks[W.ids.task1];
    ok('לא נסגרה — ממתינה לאישור', !t.closure && t.flag === 'ממתין לאישור' && t.note === 'תוקן');
    ok('התושב רואה "ממתין לאישור" בדיווח', W.store.gardenReports[W.ids.rep1].flag === 'ממתין לאישור' && !W.store.gardenReports[W.ids.rep1].closure);
    const tasks = await H.call(cb => W.B('mgr').CBA.data.getGardenTasks({ scope: 'pending' }, cb));
    ok('ובתור האישורים של המנהל', tasks.ok && tasks.rows.some(x => x.id === W.ids.task1));
    const g2 = await H.call(cb => W.B('gard').CBA.data.gardenTask('approve', W.ids.task1, {}, cb));
    ok('הגנן לא מאשר', g2.ok === false);
    const a = await H.call(cb => W.B('mgr').CBA.data.gardenTask('approve', W.ids.task1, {}, cb));
    ok('המנהל מאשר — בלי לכתוב הערה נוספת', a.ok === true, JSON.stringify(a));
    ok('נסגרה בוצע, לתושב "בוצע" עם ההערה של הגנן', W.store.gardenTasks[W.ids.task1].closure === 'בוצע' && W.store.gardenReports[W.ids.rep1].closure === 'בוצע' && W.store.gardenReports[W.ids.rep1].closeWhy === 'תוקן');
    /* שגרה — נסגרת מיד גם כשהמתג דלוק */
    const rr = await H.call(cb => W.B('gard').CBA.data.gardenTask('done', W.ids.routine, {}, cb));
    ok('שגרה נסגרת מיד', rr.ok && W.store.gardenTasks[W.ids.routine].closure === 'בוצע');
    /* המנהל מכבה */
    const off = await H.call(cb => W.B('mgr').CBA.data.setGardenSettings({ requireApproval: false }, cb));
    ok('המנהל כיבה', off.ok === true && off.settings.requireApproval === false, JSON.stringify(off));
    const d2 = await H.call(cb => W.B('gard').CBA.data.gardenTask('done', W.ids.task2, { note: 'תוקן' }, cb));
    ok('עכשיו הגנן סוגר תקלת דייר בעצמו', d2.ok && W.store.gardenTasks[W.ids.task2].closure === 'בוצע');
    const gx = await H.call(cb => W.B('gard').CBA.data.setGardenSettings({ requireApproval: true }, cb));
    ok('הגנן לא נוגע במתג', gx.ok === false);
    const rx = await H.call(cb => W.B('res1').CBA.data.setGardenSettings({ requireApproval: true }, cb));
    ok('וגם לא תושב', rx.ok === false);
    /* ביטול סימון של הגנן בזמן ההמתנה */
    const W2 = await world();
    await H.call(cb => W2.B('gard').CBA.data.gardenTask('done', W2.ids.task1, { note: 'תוקן' }, cb));
    const u = await H.call(cb => W2.B('gard').CBA.data.gardenTask('undo', W2.ids.task1, {}, cb));
    ok('הגנן מבטל סימון בזמן ההמתנה', u.ok && W2.store.gardenTasks[W2.ids.task1].flag === '');
    const GP = fs.readFileSync(path.join(__dirname, '..', 'js', 'screens', 'gardenPlan.js'), 'utf8');
    ok('המתג במסך תוכנית העבודה (מנהל בלבד)', /id="gp-approval" role="switch"/.test(GP) && /setGardenSettings\(\{ requireApproval: next \}/.test(GP));
  }

  section('11. מחיקת משימת דיווח — התושב רואה "נסגר", הדיווח נשאר');
  {
    const W = await world();
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenTaskDelete(W.ids.task1, 'שורת בדיקה', cb));
    ok('דגל', r.ok && r.pending === true, JSON.stringify(r));
    const rep = W.store.gardenReports[W.ids.rep1];
    ok('הדיווח: נסגר בוטל עם הסיבה', rep.closure === 'בוטל' && rep.closeWhy === 'שורת בדיקה' && rep.canFeedback === false);
    ok('המייל לתושב סומן על המשימה', W.store.gardenTasks[W.ids.task1].notify === 'GARDEN_REPORT_DECLINED');
    ok('התושב יראה את הסגירה בקו הזמן', residentLog(W, W.ids.task1).includes('סגירה'));
    W.S.gardenPendingDeleteRun_(null);
    ok('המשימה ירדה, הדיווח נשאר', !W.store.gardenTasks[W.ids.task1] && !!W.store.gardenReports[W.ids.rep1]);
    const my = await H.call(cb => W.B('res1').CBA.data.getMyGardenReports(cb));
    ok('והתושב עדיין רואה את הדיווח שלו כסגור', my.ok && my.rows.some(x => x.id === W.ids.rep1 && x.closure === 'בוטל'));
  }

  section('L/M/N. שוליים');
  {
    const W = await world();
    const long = await H.call(cb => W.B('res1').CBA.data.submitGardenReport({ title: 'א'.repeat(61), category: 'עצים', place: 'פה', photos: [] }, cb));
    ok('כותרת >60 — הודעה ברורה, בלי שריפת מזהה', long.ok === false && /60/.test(long.error) && W.store.counters.gardenTask.n === 2);
    /* M: מזהה תפוס */
    W.store.gardenPlan['T2'] = { id: 'T2', title: 'זר', freq: 'שנתי', months: '1', schema: 1, active: true };
    const p = await H.call(cb => W.B('mgr').CBA.data.gardenPlanSave({ title: 'חדש', category: 'עצים', freq: 'שנתי', months: '2', areas: [], effectiveFrom: W.THIS }, cb));
    ok('מזהה תפוס → מדלג ולא דורס', p.ok && p.id === 'T3' && W.store.gardenPlan['T2'].title === 'זר', JSON.stringify(p));
    const FB = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'firebase.js'), 'utf8');
    ok('createIfAbsent בטרנזקציה', /function createIfAbsent[\s\S]*?runTransaction[\s\S]*?already-exists/.test(FB) && /createIfAbsent: createIfAbsent,/.test(FB));
    /* N: מנהל משנה סיבת סגירה בלי לפתוח */
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('close', W.ids.task1, { closure: 'בוטל', note: 'טעות' }, cb));
    const n = await H.call(cb => W.B('mgr').CBA.data.gardenTask('close', W.ids.task1, { closure: 'לא רלוונטי', note: 'לא שלנו' }, cb));
    ok('מנהל: סיבה חדשה על משימה סגורה', n.ok === true && W.store.gardenTasks[W.ids.task1].closure === 'לא רלוונטי', JSON.stringify(n));
    ok('והדיווח עודכן', W.store.gardenReports[W.ids.rep1].closure === 'לא רלוונטי' && W.store.gardenReports[W.ids.rep1].closeWhy === 'לא שלנו');
    const gn = await H.call(cb => W.B('gard').CBA.data.gardenTask('close', W.ids.task1, { closure: 'בוטל', note: 'x' }, cb));
    ok('הגנן — לא', gn.ok === false);
  }

  section('שומרי רגרסיה — מה שהסימולציה מצאה נקי ואסור שייפתח');
  {
    const W = await world();
    for (const who of ['res1', 'other', 'off', 'nofam']) {
      const rs = await Promise.all(['done', 'note', 'plan', 'close'].map(op => H.call(cb => W.B(who).CBA.data.gardenTask(op, W.ids.task1, { note: 'x', week: W.THIS, closure: 'בוטל' }, cb))));
      ok(who + ' — אף פעולת צוות לא עוברת', rs.every(r => !r.ok));
    }
    const rd = await H.call(cb => W.B('res1').CBA.data.getGardenTasks({ week: W.THIS }, cb));
    ok('תושב לא קורא משימות', rd.ok === false);
    const gp = await H.call(cb => W.B('gard').CBA.data.getGardenPlan(cb));
    ok('גנן לא קורא תוכנית', gp.ok === false);
    const twin = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'gardenRules.js'), 'utf8') === fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'GardenRules.gs'), 'utf8');
    ok('🔴 gardenRules.js ≡ GardenRules.gs', twin);
    const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), SW = fs.readFileSync(path.join(__dirname, '..', 'service-worker.js'), 'utf8');
    const v = [...new Set((HTML.match(/\?v=[0-9a-z]+/g) || []).map(x => x.slice(3)))];
    ok('גרסה אחת ב-index.html והיא ב-service-worker', v.length === 1 && SW.includes('VERSION = "' + v[0] + '"') && v[0] > '20260922l', v.join(','));
  }

  console.log('\n════════════════════════════════');
  console.log(pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
