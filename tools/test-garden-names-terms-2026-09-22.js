'use strict';
/* ============================================================================
 *  22.9 ערב — גינון: שמות ושפה אחידה (בקשת יועד, שני סעיפים)
 * ----------------------------------------------------------------------------
 *  1. שם המדווח (פרטי + משפחה) על תקלת דייר — גלוי למנהל ולגנן.
 *     חותם על כל שורת יומן: "<שם> · גנן" / "מנהל גינון" / שם התושב.
 *  2. שפה אחידה: "בוצע" לגנן ולמנהל. המנהל יכול לסגור כבוצע (עד היום
 *     "סגירה" בכרטיס הפרטים פתח רק שלוש סיבות — בלי "בוצע").
 *  dataService.js האמיתי מול פורט הכללים (tools/garden-sim).
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const H = require('./garden-sim/harness');
const REPO = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const section = s => console.log('\n' + s);
const logsOf = (store, id) => Object.values(store.gardenLog).filter(r => String(r.taskId) === String(id));

(async () => {
  const store = H.newStore();
  let now = new Date(2026, 8, 22, 10, 0, 0);
  const clock = { now: () => now };
  const Bs = {};
  const B = uid => (Bs[uid] = Bs[uid] || H.browser(store, uid, clock));
  /* שם משפחה אמיתי — ה-harness שם את כל השם בשם הפרטי. */
  B('res1').CBA.user.firstName = 'דין'; B('res1').CBA.user.family = 'ארגיל';
  B('gard').CBA.user.firstName = 'אביתר'; B('gard').CBA.user.family = 'לוי';
  B('mgr').CBA.user.firstName = 'רונית'; B('mgr').CBA.user.family = 'כהן';
  const THIS = B('mgr').GardenRules.weekKey(now);

  section('1. שם המדווח על המשימה');
  const r1 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'דשא יבש', category: 'מדשאות', area: 'ציר מזרחי', x: 0.4, y: 0.5, photos: [] }, cb));
  ok('הדיווח נשלח', r1 && r1.ok, JSON.stringify(r1));
  const t1 = store.gardenTasks[String(r1.taskId)] || {};
  ok('🔴 reporter = שם פרטי + משפחה', t1.reporter === 'דין ארגיל', t1.reporter);
  const open1 = logsOf(store, r1.taskId).find(r => r.kind === 'נפתח') || {};
  ok('שורת "נפתח" חתומה כתושב, בשמו', open1.role === 'תושב' && open1.who === 'דין ארגיל', JSON.stringify(open1));

  const g1 = await H.call(cb => B('gard').CBA.data.gardenCreateTask({ title: 'ממטרה שבורה', category: 'השקיה / ממטרות', area: 'ציר מערבי', week: THIS, asReport: true, photos: [] }, cb));
  const gt = store.gardenTasks[String(g1.id)] || {};
  ok('תקלה שהגנן פתח — reporter = הגנן', g1.ok && gt.reporter === 'אביתר לוי' && gt.openedBy === 'גנן', JSON.stringify(gt.reporter));

  section('2. הכללים — reporter נכתב ביצירה בלבד');
  const upd = await H.call(cb => B('mgr').CBA.fb.updateDoc('gardenTasks', String(r1.taskId), { reporter: 'מישהו אחר' }, cb));
  ok('⛔ הצוות אינו משנה reporter', upd && upd.code === 'permission-denied', JSON.stringify(upd));

  section('3. חותם היומן — role נאכף');
  const fbR = B('res1').CBA.fb, fbG = B('gard').CBA.fb, fbM = B('mgr').CBA.fb;
  const base = { taskId: String(r1.taskId), kind: 'משוב', note: 'x', at: now, schema: 1 };
  const f1 = await H.call(cb => fbR.createDoc('gardenLog', 'L1', Object.assign({}, base, { actorUid: 'res1', role: 'מנהל', who: 'מנהל גינון' }), cb));
  ok('⛔ תושב שחותם "מנהל" — נדחה', f1 && f1.code === 'permission-denied', JSON.stringify(f1));
  const f2 = await H.call(cb => fbG.createDoc('gardenLog', 'L2', Object.assign({}, base, { kind: 'הערה', actorUid: 'gard', role: 'מנהל', who: 'x' }), cb));
  ok('⛔ גנן שחותם "מנהל" — נדחה', f2 && f2.code === 'permission-denied', JSON.stringify(f2));
  const f3 = await H.call(cb => fbM.createDoc('gardenLog', 'L3', Object.assign({}, base, { kind: 'הערה', actorUid: 'mgr', role: 'גנן', who: 'x' }), cb));
  ok('⛔ מנהל פנימי שחותם "גנן" — נדחה', f3 && f3.code === 'permission-denied', JSON.stringify(f3));
  const f4 = await H.call(cb => fbG.createDoc('gardenLog', 'L4', Object.assign({}, base, { kind: 'הערה', actorUid: 'gard', role: 'גנן', who: 'x'.repeat(61) }), cb));
  ok('⛔ שם ארוך מ-60 — נדחה', f4 && f4.code === 'permission-denied');
  const f5 = await H.call(cb => fbG.createDoc('gardenLog', 'L5', Object.assign({}, base, { kind: 'הערה', actorUid: 'gard' }), cb));
  ok('🔑 שורה בלי חותם (דפדפן ישן) — עוברת כמו עד היום', f5 == null || f5 === true || (f5 && !f5.code), JSON.stringify(f5));

  section('4. הגנן: "בוצע" על תקלת דייר → לאישור');
  await H.call(cb => B('mgr').CBA.data.gardenTask('plan', r1.taskId, { week: THIS }, cb));
  const d1 = await H.call(cb => B('gard').CBA.data.gardenTask('done', r1.taskId, { note: 'הושקה ונבדק' }, cb));
  ok('עבר, awaiting=true', d1 && d1.ok && d1.awaiting === true, JSON.stringify(d1));
  const t1b = store.gardenTasks[String(r1.taskId)];
  ok('ממתין לאישור, לא נסגר', t1b.flag === 'ממתין לאישור' && !t1b.closure);
  const lg = logsOf(store, r1.taskId).find(r => r.kind === 'ביצוע') || {};
  ok('🔴 שורת "ביצוע" חתומה: גנן + שמו', lg.role === 'גנן' && lg.who === 'אביתר לוי', JSON.stringify(lg));
  ok('תצוגה: "אביתר לוי · גנן"', B('mgr').CBA.data.gardenLogWho(lg) === 'אביתר לוי · גנן');

  section('5. המנהל: "אישור ביצוע" סוגר כבוצע');
  const a1 = await H.call(cb => B('mgr').CBA.data.gardenTask('approve', r1.taskId, {}, cb));
  ok('אושר', a1 && a1.ok, JSON.stringify(a1));
  ok('closure = בוצע', store.gardenTasks[String(r1.taskId)].closure === 'בוצע');
  const lc = logsOf(store, r1.taskId).filter(r => r.kind === 'סגירה').pop() || {};
  ok('🔴 שורת הסגירה חתומה "מנהל"', lc.role === 'מנהל', JSON.stringify(lc));
  ok('תצוגה: "מנהל גינון" (תואר, לא שם)', B('res1').CBA.data.gardenLogWho(lc) === 'מנהל גינון');
  ok('תושב: שמו', B('mgr').CBA.data.gardenLogWho({ role: 'תושב', who: 'דין ארגיל' }) === 'דין ארגיל');
  ok('שורה ישנה בלי חותם — ריק', B('mgr').CBA.data.gardenLogWho({ kind: 'שיבוץ' }) === '');

  section('6. המנהל: "בוצע" ישירות על משימה פתוחה');
  const r2 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'ענף שבור', category: 'עצים', area: 'ציר מזרחי', x: 0.2, y: 0.2, photos: [] }, cb));
  await H.call(cb => B('mgr').CBA.data.gardenTask('plan', r2.taskId, { week: THIS }, cb));
  const d2 = await H.call(cb => B('mgr').CBA.data.gardenTask('done', r2.taskId, { note: 'הענף פונה' }, cb));
  ok('נסגר מיד, awaiting=false', d2 && d2.ok && !d2.awaiting && store.gardenTasks[String(r2.taskId)].closure === 'בוצע', JSON.stringify(d2));

  section('7. המסך — שפה אחידה (סטטי)');
  const GT = R('js/screens/gardenTasks.js');
  const det = GT.slice(GT.indexOf('function openDetails('), GT.indexOf('function showOnMap('));
  ok('🔴 23.9 — מנהל, ממתין לאישור → "סגירה" (ובחלון "בוצע" = approve)', /isManager && done\)[\s\S]{0,900}data-m="close"[\s\S]{0,80}'סגירה<\/button>'/.test(det) && /data-cl-done[\s\S]{0,200}ממתין לאישור"\) \? run\("approve"/.test(GT));
  ok('🔴 23.9 — מנהל, פתוח → "סגירה" אחת, "בוצע" ראשון בחלון', /else if \(isManager\) \{[\s\S]{0,400}data-m="close"[\s\S]{0,80}'סגירה<\/button>'/.test(det) && /data-cl-done="1"/.test(GT));
  ok('גנן → "בוצע"', !/סימון כבוצע<\/button>/.test(GT));
  ok('23.9 — "סגירה" בשורה המשנית רק למשימה בלי שבוע', /isManager && planning\) \{[\s\S]{0,200}data-m="close"/.test(det));
  ok('הכרטיס מציג "נפתח ע"י" + שם', /t\.reporter \? 'נפתח ע"י ' \+ esc\(t\.reporter\)/.test(det));
  ok('היומן בכרטיס מציג מי', /<time>' \+ esc\(ago\(r\.at\)\) \+ \(whoOf\(r\)/.test(det));
  ok('23.9 — קוביות: "בוצע" לגנן, "סגירה" למנהל, "שיבוץ" בלי שבוע', /\["markdone", "check", "בוצע", "pri"\]/.test(GT) && /\["close", "closeok", "סגירה", "pri"\]/.test(GT) && /\["plan", "cal", "שיבוץ", "pri"\]/.test(GT));
  const RG = R('js/screens/resGarden.js');
  ok('קו הזמן של התושב מציג מי מהצוות', /tlDate\(x\.at\)\) \+ tlWho\(x\)/.test(RG) && /x\.role === "תושב"/.test(RG));

  section('8. השרת והכללים');
  const RULES = R('firestore.rules');
  ok('glRoleOk בשני שערי היומן', (RULES.match(/glRoleOk\(\) &&/g) || []).length === 2);
  ok('reporter ב-gtFields ולא ב-gtTeamUpdateOk', /'reporter'\];/.test(RULES) && !/gtTeamUpdateOk\(\)[\s\S]{0,600}'reporter'/.test(RULES));
  const CODE = R('apps-script/Code.gs');
  ok('השרת מתרגם חותם לגנן', /lgRole === 'מנהל' \? 'מנהל גינון'/.test(CODE));
  ok('השלמה חד-פעמית קיימת', /function gardenBackfillReporters\(\)/.test(CODE));

  console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
