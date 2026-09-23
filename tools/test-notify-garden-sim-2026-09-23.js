'use strict';
/* ============================================================================
 *  מרכז ההתראות (23.9) — הגינון מול הדפדפן האמיתי + פורט הכללים
 * ----------------------------------------------------------------------------
 *  dataService.js האמיתי, tools/garden-sim. בודק את מה שצוות אדום מצא:
 *   1. 🔴 הערה פנימית לא דולפת לתושב כשמנהל מאשר בלי הערה חדשה.
 *   2. 🔴 סיבת חסימה לא דולפת באישור.
 *   3. ערכי notify חדשים: ממתין לאישור / חסום / הוחזר / בדיקה חוזרת.
 *   4. 🔴 הגנן החיצוני לא יכול לשלוח "בדיקה חוזרת" / "הוחזר" (כללים).
 *  הרצה: node tools/test-notify-garden-sim-2026-09-23.js
 * ========================================================================== */
const H = require('./garden-sim/harness');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const T0 = new Date(2026, 8, 22, 10, 0, 0);

async function world() {
  const store = H.newStore();
  let now = new Date(T0.getTime());
  const clock = { now: () => now, add: ms => { now = new Date(now.getTime() + ms); } };
  const Bs = {};
  const B = uid => (Bs[uid] = Bs[uid] || H.browser(store, uid, clock));
  const r1 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'ההשקיה לא עובדת', category: 'השקיה / ממטרות', area: 'ציר מזרחי', x: 0.4, y: 0.5, photos: [] }, cb));
  return { store, B, rep: String(r1.id), task: String(r1.taskId) };
}
const T = (W) => W.store.gardenTasks[W.task];
const residentKinds = (W) => Object.values(W.store.gardenLog).filter(l => l.taskId === W.task && l.familyId).map(l => l.kind);

(async () => {
  section('1. 🔴 הערה פנימית ואז אישור');
  {
    const W = await world();
    await H.call(cb => W.B('gard').CBA.data.gardenTask('done', W.task, { note: 'תוקן' }, cb));
    ok('ממתין לאישור, notify = GARDEN_FINAL_CHECK', T(W).flag === 'ממתין לאישור' && T(W).notify === 'GARDEN_FINAL_CHECK', T(W).notify);
    const n = await H.call(cb => W.B('mgr').CBA.data.gardenTask('note', W.task, { note: 'פנימי: לבדוק חשבונית' }, cb));
    ok('הערה פנימית נשמרה', n.ok, JSON.stringify(n));
    ok('🔴 היא לא נכתבה לשדה note של המשימה', T(W).note === 'תוקן', T(W).note);
    ok('🔴 והיא לא בקו הזמן של התושב', residentKinds(W).indexOf('הערה') === -1 && Object.values(W.store.gardenLog).some(l => l.kind === 'הערה פנימית' && !l.familyId));
    const a = await H.call(cb => W.B('mgr').CBA.data.gardenTask('approve', W.task, {}, cb));
    ok('אישור בלי הערה חדשה עבר', a.ok, JSON.stringify(a));
    ok('🔴 לתושב יצא "מה שהגנן כתב" — לא ההערה הפנימית', T(W).notifyNote === 'תוקן' && W.store.gardenReports[W.rep].closeWhy === 'תוקן', T(W).notifyNote + ' / ' + W.store.gardenReports[W.rep].closeWhy);
  }
  {
    const W = await world();
    await H.call(cb => W.B('gard').CBA.data.gardenTask('note', W.task, { note: 'הגעתי, מחר נסיים', toResident: true }, cb));
    ok('הערה עם "לשלוח לתושב" — GARDEN_STATUS_NOTE, ובקו הזמן', T(W).notify === 'GARDEN_STATUS_NOTE' && residentKinds(W).indexOf('הערה') !== -1);
  }

  section('2. 🔴 חסימה ואז אישור');
  {
    const W = await world();
    const b = await H.call(cb => W.B('gard').CBA.data.gardenTask('block', W.task, { note: 'צריך מנוף, דני מהבניין' }, cb));
    ok('חסימה נשמרה, notify = GARDEN_PENDING_REVIEW', b.ok && T(W).notify === 'GARDEN_PENDING_REVIEW', JSON.stringify(b));
    ok('ה-notifyNote הוא הסיבה (לשרת: למנהל בלבד)', T(W).notifyNote === 'צריך מנוף, דני מהבניין');
    const a = await H.call(cb => W.B('mgr').CBA.data.gardenTask('approve', W.task, {}, cb));
    ok('🔴 אישור בלי הערה על משימה חסומה נדחה — הסיבה לא יוצאת לתושב', a.ok === false, JSON.stringify(a));
    const a2 = await H.call(cb => W.B('mgr').CBA.data.gardenTask('approve', W.task, { note: 'הוזמן מנוף, תוקן' }, cb));
    ok('עם הערה — עובר, והתושב מקבל רק אותה', a2.ok && T(W).notifyNote === 'הוזמן מנוף, תוקן');
  }

  section('3. הוחזר להשלמה');
  {
    const W = await world();
    await H.call(cb => W.B('gard').CBA.data.gardenTask('done', W.task, { note: 'תוקן' }, cb));
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenTask('return', W.task, { note: 'חסר פינוי' }, cb));
    ok('משימה פתוחה — GARDENER_TASK_RETURNED', r.ok && T(W).notify === 'GARDENER_TASK_RETURNED', JSON.stringify(r) + ' ' + T(W).notify);
    ok('🔴 "החזרה" לא בקו הזמן של התושב', residentKinds(W).indexOf('החזרה') === -1);
  }
  {
    const W = await world();
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('done', W.task, { note: 'תוקן' }, cb));
    ok('נסגרה', T(W).closure === 'בוצע');
    const r = await H.call(cb => W.B('mgr').CBA.data.gardenTask('return', W.task, { note: 'לא פונה הגזם' }, cb));
    ok('משימה סגורה — GARDEN_REOPENED עם הדגל (השרת מפריד: לתושב בלי ההערה)', r.ok && T(W).notify === 'GARDEN_REOPENED' && T(W).flag === 'הוחזר להשלמה', T(W).notify);
  }

  section('4. בדיקה חוזרת — ורק מנהל');
  {
    const W = await world();
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('done', W.task, { note: 'תוקן' }, cb));
    W.store.gardenTasks[W.task].flag = 'דורש בדיקה חוזרת';
    const c = await H.call(cb => W.B('mgr').CBA.data.gardenTask('clearflag', W.task, { note: 'הממטרה הוחלפה' }, cb));
    ok('מנהל: "טופל" אחרי משוב שלילי — GARDEN_RECHECK_DONE עם התוצאה', c.ok && T(W).notify === 'GARDEN_RECHECK_DONE' && T(W).notifyNote === 'הממטרה הוחלפה', JSON.stringify(c) + ' ' + T(W).notify);
  }
  {
    const W = await world();
    await H.call(cb => W.B('mgr').CBA.data.gardenTask('done', W.task, { note: 'תוקן' }, cb));
    W.store.gardenTasks[W.task].flag = 'דורש בדיקה חוזרת';
    const c = await H.call(cb => W.B('gard').CBA.data.gardenTask('clearflag', W.task, {}, cb));
    ok('⚠️ הגנן מנקה דגל על משימה סגורה — עובר, בלי הודעה', c.ok && !T(W).flag && T(W).notify !== 'GARDEN_RECHECK_DONE', JSON.stringify(c));
  }
  {
    const W = await world();
    /* הגנן מנסה לכתוב ישירות, עוקף את הדפדפן */
    const x = await H.call(cb => W.B('gard').CBA.fb.updateDoc('gardenTasks', W.task, { notify: 'GARDEN_RECHECK_DONE', notifyPending: true, notifyNote: 'טקסט חופשי', updatedAt: new Date() }, cb));
    ok('🔴 כללים: הגנן לא שולח GARDEN_RECHECK_DONE', !!x, JSON.stringify(x));
    const y = await H.call(cb => W.B('gard').CBA.fb.updateDoc('gardenTasks', W.task, { notify: 'GARDENER_TASK_RETURNED', notifyPending: true, notifyNote: 'x', updatedAt: new Date() }, cb));
    ok('🔴 כללים: וגם לא GARDENER_TASK_RETURNED', !!y, JSON.stringify(y));
    const z = await H.call(cb => W.B('gard').CBA.fb.updateDoc('gardenTasks', W.task, { notify: 'GARDEN_PENDING_REVIEW', notifyPending: true, notifyNote: 'x', updatedAt: new Date() }, cb));
    ok('אבל חסימה (GARDEN_PENDING_REVIEW) — כן', !z, JSON.stringify(z));
  }

  console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
