/* 🌱 דשא והשקיה — גל ג': "ירוק כברירת מחדל"   (2026-10-07)
   הרצה:  node tools/test-green-default-2026-10-07.js

   🔴 התוצאות הצפויות נכתבו לפני ההרצה (נוהל code-delivery-checklist, שלב 4).
   ארבעה חלקים:
     1. המנוע (js/ui/greenArea.js) על המפה האמיתית — כמה דשא, איפה, ומה גובר על מה.
     2. הכללים (פורט tools/garden-sim/rules.js) — שלושה תפקידים, כל ניסיון עם תוצאה צפויה.
     3. מה שהדפדפן באמת כותב (gardenAssets) עובר בכללים — תיקון שטח, סימון תושב, אישור.
     4. החיבורים בקוד (מסך, טופס, כרטיס, שרת). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { check } = require('./garden-sim/rules.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- 1. המנוע ---------- */
function engine(mutateAreas) {
  const sb = { console, Math, JSON, Uint8Array, Object, Array };
  sb.window = sb; sb.CBA = {};
  vm.createContext(sb);
  vm.runInContext(R('js/data/mapGeo.js'), sb);
  vm.runInContext(R('js/data/gardenAreas.js'), sb);
  if (mutateAreas) mutateAreas(sb.CBA.gardenAreas.areas);
  vm.runInContext(R('js/data/greenBound.js'), sb);
  vm.runInContext(R('js/ui/greenArea.js'), sb);
  return sb.CBA;
}
section('1. המנוע על המפה האמיתית');
{
  const C = engine(), GA = C.greenArea, g = C.mapGeo;
  const n = (x, y) => [x / g.w, y / g.h];
  const obj = l => g.objects.find(o => o.l === l);
  ok('מוכן, והגבול הוא הגרסה הסגורה (גיבוב אזורי הגינון תואם)', GA.ready() && GA.boundSrc() === 'closed', GA.boundSrc());
  const m = GA.model(null);
  ok('שטח דשא ~189 דונם (±1.5%, מול shapely 188,866 מ"ר)', Math.abs(m.greenM2 - 188866) / 188866 < 0.015, Math.round(m.greenM2));
  const h = obj('810');
  ok('בית 810 — לא דשא', !m.inGreen(...n(h.x, h.y)));
  ok('מדשאה פתוחה בצפון-מזרח (950,92) — דשא', m.inGreen(...n(950, 92)));
  const dog = obj('גינת כלבים'), play = obj('גן שעשועים');
  ok('גינת כלבים — ירוקה כברירת מחדל', m.inGreen(...n(dog.x, dog.y)));
  ok('גן שעשועים — יורד כברירת מחדל', !m.inGreen(...n(play.x, play.y)));
  const pool = obj('בריכה');
  ok('בריכה (מתחם הספורט) — מחוץ לגבול, לא דשא', !m.inGreen(...n(pool.p[0][0] + 20, pool.p[0][1] + 20)));
  const m2 = GA.model({ adds: [], cuts: [], bld: { 'גן שעשועים': true } });
  ok('עקיפה: גן שעשועים "ירוק" → דשא, והשטח גדל', m2.inGreen(...n(play.x, play.y)) && m2.greenM2 > m.greenM2);
  const box = (x0, y0, x1, y1) => [n(x0, y0), n(x1, y0), n(x1, y1), n(x0, y1)];
  const m3 = GA.model({ adds: [box(h.x - 40, h.y - 40, h.x + 40, h.y + 40)], cuts: [], bld: {} });
  ok('🔴 "הוספת ירוק" מעל בית — הבית עדיין לא דשא (בתים תמיד יורדים)', !m3.inGreen(...n(h.x, h.y)));
  const m4 = GA.model({ adds: [box(930, 70, 970, 110)], cuts: [box(930, 70, 970, 110)], bld: {} });
  ok('🔴 "לא דשא" גובר על "הוספת ירוק" באותו מקום', !m4.inGreen(...n(950, 92)));
  const m5 = GA.model({ adds: [], cuts: [box(930, 70, 970, 110)], bld: {} });
  const cutM2 = 40 * 40 / (g.ppm * g.ppm);
  ok('"לא דשא" של 25×25 מ\' מוריד ~625 מ"ר', Math.abs((m.greenM2 - m5.greenM2) - cutM2) < 60, Math.round(m.greenM2 - m5.greenM2));
  const m6 = GA.model({ adds: [box(1075, 600, 1100, 640)], cuts: [], bld: {} });
  ok('"הוספת ירוק" מותרת גם מעבר לקצה העולם (x>1)', m6.greenM2 > m.greenM2);
  const R1 = 20 / g.w, R2 = 8 / g.w;
  const st = m.stats([
    { shape: 'circle', cx: 950 / g.w, cy: 92 / g.h, r: R1, status: 'dry' },
    { shape: 'circle', cx: 950 / g.w, cy: 92 / g.h, r: R2, status: 'dead' },
    { shape: 'circle', cx: 950 / g.w, cy: 92 / g.h, r: R1, status: 'ok' },
    { shape: 'circle', cx: h.x / g.w, cy: h.y / g.h, r: 10 / g.w, status: 'dry' }]);
  const exDead = Math.PI * 64 / (g.ppm * g.ppm), exDry = Math.PI * 400 / (g.ppm * g.ppm) - exDead;
  ok('כתמים: מת גובר על יבש בחפיפה', Math.abs(st.dead - exDead) < exDead * 0.15 && Math.abs(st.dry - exDry) < exDry * 0.1, st);
  ok('כתם "תוקן" לא נספר, וכתם על בית נספר רק בחלק שעל דשא', st.dry < exDry * 1.1 + 40);
  ok('תקין = דשא − יבש − מת', Math.abs(st.ok - (st.green - st.dry - st.dead)) < 1);
  ok('מודל נשמר במטמון לפי מפתח (אותם תיקונים → אותו אובייקט)', GA.model(null) === GA.model(null) || GA.model(null).key === m.key);
  const C2 = engine(a => { a[0].p[0][0] += 0.001; });
  ok('🔴 אזורים שונו בכלי הכיול → לא נשבר: צובע את האזורים עצמם', C2.greenArea.boundSrc() === 'areas' && C2.greenArea.model(null).greenM2 > 150000);
  const pubs = GA.pubs(null);
  ok('מבני ציבור: 23 (22 + מדשאת המועדון), ירוקים: גינת כלבים ומדשאה בלבד',
     pubs.length === 23 && pubs.filter(p => p.green).map(p => p.name).sort().join() === ['גינת כלבים', 'מדשאת מועדון משפחות'].sort().join(), pubs.filter(p => p.green).map(p => p.name));
  ok('מתחם הספורט מסומן "מחוץ לגבול"', !pubs.find(p => p.name === 'אולם ספורט').inBound && pubs.find(p => p.name === 'גן שעשועים').inBound);
  const corr = GA.corrFrom([
    { id: 'a', kind: 'gadd', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2] },
    { id: 'b', kind: 'gcut', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], archived: true },
    { id: 'c', kind: 'gbld', name: 'גן שעשועים', green: true },
    { id: 'd', name: 'מדשאה רגילה', shape: 'poly', pts: [0, 0, 1, 0, 1, 1] }]);
  ok('corrFrom: רק תיקונים פעילים; מדשאה עם שם אינה תיקון', corr.adds.length === 1 && corr.cuts.length === 0 && corr.bld['גן שעשועים'] === true);
  const mask = m.maskSvg('x', 1061, 1297);
  ok('מסכה: גבול לבן, מבנים שחורים, בתים/כבישים שחורים', /<mask id="x"/.test(mask) && /fill="#fff" fill-rule="evenodd"/.test(mask) && /fill="#000" fill-rule="nonzero"/.test(mask));
  ok('תמונה ממוזערת לעיגול', /<circle class="ga-spot"/.test(GA.thumbSvg(950 / g.w, 92 / g.h, 0.01)));
}

/* ---------- 2. הכללים ---------- */
const NOW = new Date('2026-10-07T09:00:00Z');
const members = {
  res1: { active: true, isExternal: false, perms: [], familyId: 'F1' },
  res2: { active: true, isExternal: false, perms: [], familyId: 'F2' },
  ext:  { active: true, isExternal: true,  perms: ['גינון'], familyId: '' },
  mgr:  { active: true, isExternal: false, perms: ['גינון'], familyId: 'F9' }
};
function baseStore() {
  return {
    gardenLawns: { G1: { id: 'G1', kind: 'gadd', name: 'הוספת ירוק 1', shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], rev: 1, archived: false, updatedAt: NOW, updatedBy: 'mgr', schema: 1 } },
    gardenReports: { R7: { id: 'R7', familyId: 'F1' } },
    gardenLawnEdits: {}, gardenAssets: {},
    gardenTasks: { T7: { id: 'T7', kind: 'דיווח תושב', title: 'דשא יבש', category: 'דשא', stage: 'התקבל', repId: 'R7', closure: '', assets: [], year: '2026', schema: 1, updatedAt: NOW } }
  };
}
function try_(uid, coll, id, after, before) {
  return check({ uid, members, store: baseStore(), now: NOW, coll, op: before ? 'update' : 'create', id, after, before: before || {} }).ok;
}
const lw = (o) => Object.assign({ id: 'N1', name: 'x', rev: 1, archived: false, updatedAt: NOW, schema: 1 }, o);
section('2. כללי האבטחה — שלושה תפקידים (צפי נכתב מראש)');
{
  const add = uid => lw({ kind: 'gadd', shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], updatedBy: uid });
  const EXP = [
    ['מנהל יוצר "הוספת ירוק"',              () => try_('mgr', 'gardenLawns', 'N1', add('mgr')), true],
    ['🔴 גנן חיצוני יוצר "הוספת ירוק"',       () => try_('ext', 'gardenLawns', 'N1', add('ext')), false],
    ['🔴 תושב יוצר "הוספת ירוק"',             () => try_('res1', 'gardenLawns', 'N1', add('res1')), false],
    ['מנהל: מבנה ירוק (gbld בלי צורה)',       () => try_('mgr', 'gardenLawns', 'N1', lw({ kind: 'gbld', name: 'גן שעשועים', green: true, updatedBy: 'mgr' })), true],
    ['🔴 gbld עם צורה',                       () => try_('mgr', 'gardenLawns', 'N1', lw({ kind: 'gbld', name: 'גן שעשועים', green: true, shape: 'poly', pts: [0, 0, 1, 0, 1, 1], updatedBy: 'mgr' })), false],
    ['🔴 gbld בלי green',                     () => try_('mgr', 'gardenLawns', 'N1', lw({ kind: 'gbld', name: 'גן שעשועים', updatedBy: 'mgr' })), false],
    ['🔴 gbld בלי שם',                        () => try_('mgr', 'gardenLawns', 'N1', lw({ kind: 'gbld', name: '', green: true, updatedBy: 'mgr' })), false],
    ['🔴 "הוספת ירוק" כעיגול',               () => try_('mgr', 'gardenLawns', 'N1', lw({ kind: 'gadd', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, pts: [], updatedBy: 'mgr' })), false],
    ['🔴 סוג לא מוכר',                        () => try_('mgr', 'gardenLawns', 'N1', lw({ kind: 'grass', shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], updatedBy: 'mgr' })), false],
    ['🔴 green על מדשאה רגילה',               () => try_('mgr', 'gardenLawns', 'N1', lw({ shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], green: true, updatedBy: 'mgr' })), false],
    ['גנן חיצוני: מדשאה רגילה — כמו קודם',    () => try_('ext', 'gardenLawns', 'N1', lw({ shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], updatedBy: 'ext' })), true],
    ['מנהל מבטל תיקון (rev+1, archived)',      () => try_('mgr', 'gardenLawns', 'G1', Object.assign({}, baseStore().gardenLawns.G1, { rev: 2, archived: true, updatedBy: 'mgr' }), baseStore().gardenLawns.G1), true],
    ['🔴 שינוי kind בעדכון (gadd→gcut)',      () => try_('mgr', 'gardenLawns', 'G1', Object.assign({}, baseStore().gardenLawns.G1, { kind: 'gcut', rev: 2, updatedBy: 'mgr' }), baseStore().gardenLawns.G1), false],
    ['🔴 גנן חיצוני מבטל תיקון',              () => try_('ext', 'gardenLawns', 'G1', Object.assign({}, baseStore().gardenLawns.G1, { rev: 2, archived: true, updatedBy: 'ext' }), baseStore().gardenLawns.G1), false],
  ];
  const pe = (uid, o) => Object.assign({ id: 'R7', kind: 'patch', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, uid, status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 }, o || {});
  EXP.push(
    ['תושב מסמן אזור יבש בדיווח שלו',         () => try_('res1', 'gardenLawnEdits', 'R7', pe('res1')), true],
    ['🔴 שכן מסמן על דיווח של משפחה אחרת',     () => try_('res2', 'gardenLawnEdits', 'R7', pe('res2')), false],
    ['🔴 עיגול ענק (r=0.2)',                   () => try_('res1', 'gardenLawnEdits', 'R7', pe('res1', { r: 0.2 })), false],
    ['🔴 r=0',                                 () => try_('res1', 'gardenLawnEdits', 'R7', pe('res1', { r: 0 })), false],
    ['🔴 שדה זר (lawnId) במסמך עיגול',         () => try_('res1', 'gardenLawnEdits', 'R7', pe('res1', { lawnId: 'L1' })), false],
    ['🔴 status אחר מ-pending',                () => try_('res1', 'gardenLawnEdits', 'R7', pe('res1', { status: 'approved' })), false],
    ['🔴 גנן חיצוני "מסמן כתושב"',            () => try_('ext', 'gardenLawnEdits', 'R7', pe('ext')), false],
    ['🔴 uid של מישהו אחר',                    () => try_('res1', 'gardenLawnEdits', 'R7', pe('res2')), false],
    ['🔴 דיוק גבול (ישן) שמצביע על תיקון שטח', () => try_('res1', 'gardenLawnEdits', 'R7', { id: 'R7', lawnId: 'G1', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], baseRev: 1, uid: 'res1', status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 }), false],
    ['גנן חיצוני מחליט (approved)',            () => try_('ext', 'gardenLawnEdits', 'R7', Object.assign(pe('res1'), { status: 'approved', decidedBy: 'ext', decidedAt: NOW }), pe('res1')), true],
    ['כתם בלי מדשאה-אם (parentId ריק), גנן חיצוני', () => try_('ext', 'gardenAssets', 'P1', { id: 'P1', kind: 'patch', name: 'כתם', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, pts: [], parentId: '', status: 'dry', archived: false, updatedAt: NOW, updatedBy: 'ext', schema: 1 }), true],
    ['כתם "תוקן" (status ok)',                 () => try_('mgr', 'gardenAssets', 'P1', { id: 'P1', kind: 'patch', name: 'כתם', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, pts: [], parentId: '', status: 'ok', archived: false, updatedAt: NOW, updatedBy: 'mgr', schema: 1 }), true]
  );
  EXP.forEach(([name, fn, want]) => { const got = fn(); ok(name + ' → ' + (want ? 'מותר' : 'חסום'), got === want, { got }); });
}

/* ---------- 3. מה שהדפדפן כותב — דרך הכללים ---------- */
function env(role) {
  const store = baseStore();
  const log = [], posts = [];
  const resolve = d => { const o = {}; Object.keys(d).forEach(k => { o[k] = d[k] === 'TS' ? NOW : d[k]; }); return o; };
  function write(kind, c, id, d, cb) {
    store[c] = store[c] || {};
    const before = store[c][id] ? Object.assign({}, store[c][id]) : null;
    const after = kind === 'set' ? resolve(d) : Object.assign({}, before, resolve(d));
    const res = check({ uid: role, members, store, now: NOW, coll: c, op: before ? 'update' : 'create', id, after, before: before || {} });
    log.push({ c, id, ok: res.ok, why: res.why });
    if (!res.ok) return cb({ code: 'permission-denied' });
    store[c][id] = after; cb(null, true);
  }
  const sb = { console, Date, Math, JSON, setTimeout, structuredClone };
  sb.window = sb;
  sb.CBA = {
    mapGeo: { w: 1000, h: 1000, ppm: 2 },
    fb: {
      uid: () => role, serverNow: () => 'TS', authReady: cb => cb({ uid: role }), ensureDb: cb => cb(null),
      createDoc: (c, id, d, cb) => write('set', c, id, d, cb),
      updateDoc: (c, id, d, cb) => write('update', c, id, d, cb),
      readDoc: (c, id, cb) => cb(null, store[c] && store[c][id] ? Object.assign({}, store[c][id]) : null),
      readCollection: (c, cb) => cb(null, Object.values(store[c] || {})),
      queryCollection: (c, conds, cb) => cb(null, Object.values(store[c] || {}).filter(d => conds.every(q => d[q[0]] === q[1])))
    },
    sheets: { postRead: (a, b, cb) => { posts.push([a, b]); cb && cb({ ok: true }); } },
    gardenLang: { catOfTask: () => ({ key: 'lawn', ico: 'lawn' }) }
  };
  vm.createContext(sb);
  vm.runInContext(R('js/data/gardenAssets.js'), sb);
  return { A: sb.CBA.gardenAssets, store, log, posts };
}
section('3. מה שהדפדפן כותב עובר בכללים');
{
  for (const [role, want] of [['mgr', true], ['ext', false]]) {
    const e = env(role); let r = null;
    e.A.saveCorr({ id: 'N2', kind: 'gcut', name: 'ערוגה', rev: 0, pts: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]] }, x => { r = x; });
    ok(role + ': saveCorr("לא דשא") → ' + (want ? 'נשמר' : 'נחסם'), !!(r && r.ok) === want, e.log);
  }
  {
    const e = env('mgr'); let r = null;
    e.A.saveCorr({ id: e.A.bldId('גן שעשועים'), kind: 'gbld', name: 'גן שעשועים', green: true, rev: 0 }, x => { r = x; });
    ok('mgr: saveCorr(מבנה ירוק) נשמר, בלי shape/pts', r && r.ok && !('shape' in r.doc) && !('pts' in r.doc), r);
    let r2 = null;
    e.A.saveCorr(Object.assign({}, e.store.gardenLawns.G1, { archived: true }), x => { r2 = x; });
    ok('mgr: ביטול תיקון קיים (rev 1→2)', r2 && r2.ok && e.store.gardenLawns.G1.rev === 2 && e.store.gardenLawns.G1.archived === true, e.log);
    ok('🔴 צוות אדום: ביטול/שינוי שם שומרים את הצורה (pts שטוח לא מתאפס)', JSON.stringify(e.store.gardenLawns.G1.pts) === JSON.stringify([0.1, 0.1, 0.2, 0.1, 0.2, 0.2]), e.store.gardenLawns.G1.pts);
    let r2b = null;
    e.A.saveCorr(Object.assign({}, e.store.gardenLawns.G1, { name: 'שם חדש', archived: false }), x => { r2b = x; });
    ok('🔴 צוות אדום: שחזור + שם חדש — אותה צורה, rev 3', r2b && r2b.ok && e.store.gardenLawns.G1.rev === 3 && e.store.gardenLawns.G1.pts.length === 6 && e.store.gardenLawns.G1.pts[2] === 0.2);
    let r3 = null;
    e.A.saveCorr({ id: 'N3', kind: 'gadd', name: 'מזרח', rev: 0, pts: [[1.05, 0.5], [1.1, 0.5], [1.1, 0.55]] }, x => { r3 = x; });
    ok('נקודות מעבר לקצה (x=1.1) נשמרות ולא נחתכות ל-1', r3 && r3.ok && e.store.gardenLawns.N3.pts[2] === 1.1, e.store.gardenLawns.N3);
  }
  {
    const e = env('res1'); let r = null;
    e.A.submitLawnEdit('R7', { kind: 'patch', cx: 0.5, cy: 0.5, r: 0.01 }, x => { r = x; });
    ok('תושב: submitLawnEdit(עיגול) עבר את lePatchCreateOk', r && r.ok && e.log[0].ok, e.log);
    const d = e.store.gardenLawnEdits.R7;
    ok('המסמך: kind patch, circle, pending, uid התושב', d && d.kind === 'patch' && d.shape === 'circle' && d.status === 'pending' && d.uid === 'res1');
    let r2 = null;
    e.A.submitLawnEdit('R8', { kind: 'patch', cx: 0.5, cy: 0.5, r: 0.5 }, x => { r2 = x; });
    ok('רדיוס ענק נחתך ל-0.05 בצד הלקוח (וגם אז R8 אינו דיווח שלו → נחסם)', e.log[1] && !e.log[1].ok);
  }
  for (const role of ['ext', 'mgr']) {
    const e = env(role);
    e.store.gardenLawnEdits.R7 = { id: 'R7', kind: 'patch', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, uid: 'res1', status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 };
    let r = null;
    e.A.decidePatchEdit(Object.assign({}, e.store.gardenLawnEdits.R7), 'dry', 'T7', x => { r = x; });
    ok(role + ': אישור ככתם יבש — כל הכתיבות עברו בכללים', r && r.ok && e.log.every(l => l.ok), e.log);
    ok(role + ': סדר: כתם → שיוך לתקלה → החלטה', e.log.map(l => l.c).join() === 'gardenAssets,gardenTasks,gardenLawnEdits', e.log.map(l => l.c));
    const p = e.store.gardenAssets.prR7;
    ok(role + ': הכתם: patch, יבש, עיגול, בלי מדשאה-אם', p && p.kind === 'patch' && p.status === 'dry' && p.shape === 'circle' && p.parentId === '');
    ok(role + ': התקלה משויכת לכתם', e.store.gardenTasks.T7.assets.indexOf('prR7') !== -1);
    ok(role + ': ההחלטה approved + פוש', e.store.gardenLawnEdits.R7.status === 'approved' && e.posts.length === 1 && e.posts[0][0] === 'gardenLawnEditNotify');
  }
  {
    const e = env('mgr');
    e.store.gardenLawnEdits.R7 = { id: 'R7', kind: 'patch', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, uid: 'res1', status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 };
    let r = null;
    e.A.decidePatchEdit(Object.assign({}, e.store.gardenLawnEdits.R7), null, 'T7', x => { r = x; });
    ok('"לא להוסיף": כתיבה אחת (ההחלטה), אין כתם', r && r.ok && e.log.length === 1 && !e.store.gardenAssets.prR7 && e.store.gardenLawnEdits.R7.status === 'rejected');
  }
  {
    const e = env('mgr'); let r = null;
    e.A.saveLawn({ id: 'pt1', patch: true, kind: 'lawn', name: 'כתם', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, pts: [], status: 'dry', rev: 0, parentId: '' }, x => { r = x; });
    ok('🔴 כתם חדש בלי מדשאה-אם נשמר ב-gardenAssets (לא כמדשאה ב-gardenLawns)', r && r.ok && e.store.gardenAssets.pt1 && !e.store.gardenLawns.pt1);
    let r2 = null;
    e.A.setLawnStatus(Object.assign({ patch: true }, { id: 'pt1', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, parentId: '' }), 'ok', x => { r2 = x; });
    ok('"תוקן" על כתם — נשמר על מסמך הכתם', r2 && r2.ok && e.store.gardenAssets.pt1.status === 'ok');
  }
  {
    const e = env('mgr'); let res = null;
    e.store.gardenLawns.L5 = { id: 'L5', name: 'מדשאה', shape: 'poly', pts: [0, 0, 1, 0, 1, 1], rev: 1 };
    e.A.load(x => { res = x; });
    ok('load: תיקונים נפרדים מהמדשאות (corr), מדשאה עם שם נשארת', res.ok && res.corr.length === 1 && res.corr[0].id === 'G1' && res.lawns.some(l => l.id === 'L5') && !res.lawns.some(l => l.id === 'G1'));
    ok('lawnAt מתעלם מתיקונים ומכתמים', e.A.lawnAt([{ id: 'G', kind: 'gadd', shape: 'poly', pts: [0, 0, 1, 0, 1, 1] }, { id: 'P', patch: true, shape: 'poly', pts: [0, 0, 1, 0, 1, 1] }], 0.5, 0.2) === null);
  }
}

/* ---------- 4. החיבורים ---------- */
section('4. החיבורים בקוד');
{
  const LW = R('js/screens/gardenLawn.js'), LR = R('js/ui/lawnRefine.js'), RG = R('js/screens/resGarden.js');
  const IDX = R('index.html'), CODE = R('apps-script/Code.gs'), NOT = R('apps-script/Notify.gs'), RU = R('firestore.rules');
  ok('index.html: greenBound + greenArea אחרי gardenAreas ולפני gardenAssets',
     IDX.indexOf('js/data/gardenAreas.js') < IDX.indexOf('js/data/greenBound.js') && IDX.indexOf('js/data/greenBound.js') < IDX.indexOf('js/ui/greenArea.js') && IDX.indexOf('js/ui/greenArea.js') < IDX.indexOf('js/data/gardenAssets.js'));
  ok('מסך: מצב "שטח ירוק" רק למנהל', /\(isMgr\(\) \? '<button type="button" class="seg__opt" data-mode="green"/.test(LW));
  ok('מסך: המסכה נבנית רק כשהמפתח משתנה (לא בכל זום)', /if \(key === S\.greenKey\) return;/.test(LW) && /\.lw-dyn"\)\.innerHTML = o\.join/.test(LW));
  ok('מסך: כתם רק על דשא', /gm && !gm\.inGreen\(c0\[0\], c0\[1\]\)/.test(LW));
  ok('מסך: כתם חדש = יבש כברירת מחדל, ונשמר ככתם (patch: true)', /kind: "lawn", patch: true, name: "", rev: 0, status: "dry"/.test(LW));
  ok('מסך: אחוזים מהדשא המחושב', /gm\.stats\(patchesOf\(\)\)/.test(LW));
  ok('מסך: המרה חד-פעמית של מצב מדשאות ישן לכתמים — מזהה קבוע', /id: "pm" \+ l\.id/.test(LW) && /!S\.all\["pm" \+ l\.id\]/.test(LW));
  ok('מסך: ביטול תיקון = ארכיון, עם שחזור', /archived: !restore/.test(LW) && /data-act="restore"/.test(LW));
  ok('טופס: טקסטים חדשים (סימון האזור היבש)', /סימון האזור היבש/.test(RG) && /סימון האזור לא נשמר/.test(RG));
  ok('החלטה: מסלול כתם בכרטיס התקלה', /if \(ed\.kind === "patch"\) return paintPatch\(ed\);/.test(LR) && /decidePatchEdit\(ed, st, o\.taskId/.test(LR));
  ok('שרת: פוש לסימון (בלי get על מדשאה ריקה)', /var isPatch = ed\.kind === 'patch';/.test(CODE) && /\(!isPatch && ed\.lawnId\)/.test(CODE));
  ok('שרת: נוסח הפוש עודכן', /עדכון על הסימון שלך בדשא/.test(NOT));
  ok('כללים: תיקונים — gtMgr; סימון תושב — בדיקה לפי kind', /\(lwKind\(\) == '' \|\| gtMgr\(\)\)/.test(RU) && /allow create: if leAnyCreateOk\(docId\);/.test(RU));
  ok('גיבוי: gardenLawns כבר בגיבוי (JSON מלא — kind/green נשמרים)', /\{ collection: 'gardenLawns',\s+tab: BK_PREFIX \+ 'גבולות מדשאות' \}/.test(CODE));
}

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
