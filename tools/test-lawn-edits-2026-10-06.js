/* 🌱 דשא והשקיה — גל ב': דיוק גבול מהתושב, החלטת הצוות, פוש, גיבוי   (2026-10-06)
   הרצה:  node tools/test-lawn-edits-2026-10-06.js

   🔴 התוצאות הצפויות נכתבו לפני ההרצה. כל כתיבה שהקוד מייצר עוברת כאן דרך
   הפורט של הכללים (tools/garden-sim/rules.js) — כלומר בודקים שמה שהדפדפן
   באמת שולח נכנס בכללים, ולא רק שהכללים נכונים בפני עצמם. */
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

const NOW = new Date('2026-10-06T09:00:00Z');
const members = {
  res1: { active: true, isExternal: false, perms: [], familyId: 'F1' },
  res2: { active: true, isExternal: false, perms: [], familyId: 'F2' },
  ext:  { active: true, isExternal: true,  perms: ['גינון'], familyId: '' },
  mgr:  { active: true, isExternal: false, perms: ['גינון'], familyId: 'F9' }
};
const LAWN = { id: 'L1', name: 'מדשאת המועדון', shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2],
               rev: 2, archived: false, updatedAt: NOW, updatedBy: 'mgr', schema: 1 };

/* ---------- סביבה: CBA.fb שכל כתיבה בו נבדקת בכללים, בתפקיד נתון ---------- */
function env(role) {
  const store = {
    gardenLawns: { L1: Object.assign({}, LAWN) },
    gardenReports: { R7: { id: 'R7', familyId: 'F1' } },
    gardenLawnEdits: {}, gardenTasks: {}, gardenAssets: {}
  };
  const log = [];
  const resolve = d => { const o = {}; Object.keys(d).forEach(k => { o[k] = d[k] === 'TS' ? NOW : d[k]; }); return o; };
  function write(kind, c, id, d, cb) {
    const before = store[c][id] ? Object.assign({}, store[c][id]) : null;
    const after = kind === 'set' ? resolve(d) : Object.assign({}, before, resolve(d));
    const res = check({ uid: role, members, store, now: NOW, coll: c, op: before ? 'update' : 'create', id, after, before: before || {} });
    log.push({ c, id, op: before ? 'update' : 'create', ok: res.ok, why: res.why, keys: Object.keys(d).sort().join() });
    if (!res.ok) return cb({ code: 'permission-denied' });
    store[c][id] = after; cb(null, true);
  }
  const posts = [];
  const sb = { console, Date, Math, JSON, setTimeout, structuredClone };
  sb.window = sb;
  sb.CBA = {
    mapGeo: { w: 1000, h: 1000, ppm: 2 },
    fb: {
      uid: () => role, serverNow: () => 'TS', authReady: cb => cb({ uid: role }), ensureDb: cb => cb(null),
      createDoc: (c, id, d, cb) => write('set', c, id, d, cb),
      updateDoc: (c, id, d, cb) => write('update', c, id, d, cb),
      readDoc: (c, id, cb) => cb(null, store[c][id] ? Object.assign({}, store[c][id]) : null),
      readCollection: (c, cb) => cb(null, Object.values(store[c] || {})),
      queryCollection: (c, conds, cb) => cb(null, Object.values(store[c] || {}).filter(d => conds.every(q => d[q[0]] === q[1])))
    },
    sheets: { postRead: (a, b, cb) => { posts.push([a, b]); cb && cb({ ok: true }); } },
    gardenLang: { catOfTask: () => ({ key: 'lawn', ico: 'lawn' }) }
  };
  vm.createContext(sb);
  vm.runInContext(R('js/data/gardenAssets.js'), sb, { filename: 'gardenAssets.js' });
  return { A: sb.CBA.gardenAssets, G: sb.CBA.gardenGeo, store, log, posts };
}

section('1. איזו מדשאה — ומה נחשב "זז"');
{
  const { A } = env('res1');
  const big = { id: 'B', shape: 'poly', pts: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5] };
  const small = { id: 'S', shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2] };
  const patch = { id: 'P', parentId: 'S', shape: 'poly', pts: [0.12, 0.12, 0.14, 0.12, 0.14, 0.14] };
  const arch = { id: 'X', archived: true, shape: 'poly', pts: [0.1, 0.1, 0.3, 0.1, 0.3, 0.3] };
  ok('נקודה בתוך שתיים → הקטנה', A.lawnAt([big, small, patch, arch], 0.15, 0.15).id === 'S');
  ok('כתם וארכיון לא נבחרים', A.lawnAt([patch, arch], 0.13, 0.13) === null);
  ok('מחוץ לכולן → null', A.lawnAt([small], 0.9, 0.9) === null);
  ok('בלי נעיצה → null', A.lawnAt([small], null, null) === null);
  ok('הזזה של פחות מחצי מטר אינה דיוק', !A.ptsMoved(small.pts, [0.1001, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2]));
  ok('הזזה של מטרים — דיוק', A.ptsMoved(small.pts, [0.09, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2]));
}

section('2. התושב שולח דיוק (אחרי הדיווח) — דרך הכללים');
{
  const e = env('res1');
  let r = null;
  e.A.submitLawnEdit('R7', { lawnId: 'L1', baseRev: 2, pts: [[0.09, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]] }, x => { r = x; });
  ok('נכתב ועבר את leCreateOk', r && r.ok && e.log[0].ok, e.log[0]);
  const d = e.store.gardenLawnEdits.R7;
  ok('המסמך: מזהה הדיווח, pending, uid של התושב, נקודות שטוחות', d && d.id === 'R7' && d.status === 'pending' && d.uid === 'res1' && d.pts.length === 8 && typeof d.pts[0] === 'number');
  const e2 = env('res2');
  let r2 = null;
  e2.A.submitLawnEdit('R7', { lawnId: 'L1', baseRev: 2, pts: [[0.09, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]] }, x => { r2 = x; });
  ok('🔴 שכן לא מצרף דיוק לדיווח של משפחה אחרת', r2 && !r2.ok && !e2.log[0].ok);
  const e3 = env('res1');
  let r3 = null;
  e3.A.submitLawnEdit('R7', { lawnId: 'L1', baseRev: 9, pts: [[0.09, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]] }, x => { r3 = x; });
  ok('🔴 גרסה מהעתיד (baseRev > rev) — נדחה', r3 && !r3.ok);
}

section('3. הצוות מחליט — קודם הגבול, אחר כך ההחלטה, ואז פוש');
for (const role of ['mgr', 'ext']) {
  const e = env(role);
  e.store.gardenLawnEdits.R7 = { id: 'R7', lawnId: 'L1', pts: [0.09, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2], baseRev: 2, uid: 'res1',
                                 status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 };
  const lawn = Object.assign({}, e.store.gardenLawns.L1, { status: 'dry' });
  let r = null;
  e.A.decideLawnEdit(Object.assign({}, e.store.gardenLawnEdits.R7), lawn, true, x => { r = x; });
  ok(role + ': אישור — שתי כתיבות, שתיהן עברו בכללים', r && r.ok && e.log.length === 2 && e.log.every(l => l.ok), e.log);
  ok(role + ': סדר: gardenLawns (rev 2→3) ואז gardenLawnEdits', e.log[0].c === 'gardenLawns' && e.store.gardenLawns.L1.rev === 3 && e.log[1].c === 'gardenLawnEdits');
  ok(role + ': הגבול החדש = הנקודות שהוצעו, בלי שדה status בגבול', e.store.gardenLawns.L1.pts[0] === 0.09 && !('status' in e.store.gardenLawns.L1));
  ok(role + ': ההחלטה: approved, decidedBy הוא המחליט', e.store.gardenLawnEdits.R7.status === 'approved' && e.store.gardenLawnEdits.R7.decidedBy === role);
  ok(role + ': פוש — gardenLawnEditNotify עם מזהה הדיווח', e.posts.length === 1 && e.posts[0][0] === 'gardenLawnEditNotify' && e.posts[0][1].id === 'R7');
}
{
  const e = env('mgr');
  e.store.gardenLawnEdits.R7 = { id: 'R7', lawnId: 'L1', pts: [0.09, 0.1, 0.2, 0.1, 0.2, 0.2, 0.1, 0.2], baseRev: 2, uid: 'res1',
                                 status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 };
  let r = null;
  e.A.decideLawnEdit(Object.assign({}, e.store.gardenLawnEdits.R7), Object.assign({}, e.store.gardenLawns.L1), false, x => { r = x; });
  ok('דחייה: כתיבה אחת (ההחלטה), הגבול לא נגע', r && r.ok && e.log.length === 1 && e.store.gardenLawns.L1.rev === 2 && e.store.gardenLawnEdits.R7.status === 'rejected');
  let r2 = null;
  e.A.decideLawnEdit(Object.assign({}, e.store.gardenLawnEdits.R7), Object.assign({}, e.store.gardenLawns.L1), true, x => { r2 = x; });
  ok('🔴 החלטה שנייה על אותו דיוק — נדחית בכללים (רק מ-pending)', r2 && !r2.ok);
  const eR = env('res1');
  eR.store.gardenLawnEdits.R7 = Object.assign({}, e.store.gardenLawnEdits.R7, { status: 'pending' });
  let r3 = null;
  eR.A.decideLawnEdit(Object.assign({}, eR.store.gardenLawnEdits.R7), Object.assign({}, eR.store.gardenLawns.L1), true, x => { r3 = x; });
  ok('🔴 תושב לא מאשר את הדיוק של עצמו', r3 && !r3.ok && eR.store.gardenLawns.L1.rev === 2);
  let q = null; e.A.loadPendingEdits(x => { q = x; });
  ok('ממתינים: שאילתת שוויון status==pending', q && q.ok && q.edits.length === 0);
}

section('4. החיבורים בקוד');
{
  const DS = R('js/data/dataService.js'), RG = R('js/screens/resGarden.js'), LR = R('js/ui/lawnRefine.js');
  const GT = R('js/screens/gardenTasks.js'), LW = R('js/screens/gardenLawn.js'), APP = R('js/app.js'), IDX = R('index.html');
  ok('דיווח: שיוך אוטומטי למדשאה על המשימה (task.assets)', /if \(autoAssets\.length\) task\.assets = autoAssets;/.test(DS));
  ok('🔴 דיווח: הדיוק נכתב אחרי מסמך הדיווח (בתוך ה-callback שלו)', DS.indexOf('CBA.fb.createDoc("gardenReports"') < DS.indexOf('CBA.gardenAssets.submitLawnEdit(String(repId)'));
  ok('דיווח: שורת "נפתח" אומרת שצורף דיוק (התושב רואה סטטוס)', /צורף דיוק לגבול המדשאה, ממתין לאישור הצוות/.test(DS));
  ok('דיווח: כשל בדיוק לא מכשיל את הדיווח — רק הודעה', /res\.lawnEdit === "failed"/.test(RG));
  ok('טופס: שולח assets + lawnEdit, רק בקטגוריית דשא/השקיה', /assets: lawnNow \? \[lawnNow\.id\] : \[\]/.test(RG) && /lawnEdit: lawnNow \? refine\.edit\(\) : null/.test(RG) && /k === "lawn" \|\| k === "water"/.test(RG));
  ok('🔴 טופס: בזמן דיוק הקשה על המפה לא מזיזה את הנעיצה', /if \(refine && refine\.isRefining\(\)\) \{[\s\S]{0,200}formMapApi\.setPin\(\{ x: state\.x, y: state\.y \}\)/.test(RG));
  ok('🔴 דיוק: רק הזזת נקודות קיימות (אין הוספה/מחיקה)', !/splice\(/.test(LR) && /S\.pts\[drag\.i \* 2\] =/.test(LR));
  ok('דיוק: רק מדשאות poly עליונות', /x\.shape === "poly" && !x\.parentId/.test(LR));
  ok('דיוק: zoom של CSS', /function zf\(\)/.test(LR));
  ok('כרטיס התקלה: בלוק ההחלטה (רק דיווח תושב בקטגוריית דשא/השקיה)', /t\.repId && \(cat\.key === "lawn" \|\| cat\.key === "water"\)\) \? '<div id="gd-det-lr"><\/div>'/.test(GT) && /CBA\.lawnRefine\.decision\(lrEl/.test(GT));
  ok('מסך דשא והשקיה: ממתינים, צ\'יפ, הצעה בכתום, בלוק החלטה', /loadPendingEdits/.test(LW) && /data-act="edits"/.test(LW) && /lw-proposal/.test(LW) && /CBA\.lawnRefine\.decision\(lr,/.test(LW));
  ok('ניווט: מונה על הטאב "דשא והשקיה"', /if \(screenKey === "gardenLawn"\) return can\(PERM\.GARDEN\) \? notif\.lawnEdits : 0;/.test(APP));
  ok('החלטה: שורת "הערה" לקו הזמן של התושב (סוג שהתושב רואה — בלי שינוי כללים)', /gardenLogAppend\(String\(taskId\), "הערה"/.test(DS) && /gardenLogNote\(o\.taskId/.test(LR));
  ok('index.html: lawnRefine.js נטען גלובלית אחרי gardenAssets.js', /gardenAssets\.js\?v=[^"]+"><\/script>\n  <script defer src="js\/ui\/lawnRefine\.js\?v=/.test(IDX));
}

section('5. השרת: פוש בלבד, וגיבוי');
{
  const CODE = R('apps-script/Code.gs'), NOT = R('apps-script/Notify.gs');
  ok('פעולה: gardenLawnEditNotify — PERM_GARDEN, ניתוב, תחום מטמון', /gardenLawnEditNotify: PERM_GARDEN,/.test(CODE) &&
     /case 'gardenLawnEditNotify': return json_\(gardenLawnEditNotify_\(ss, body\)\);/.test(CODE) && /gardenLawnEditNotify: 'gardenMail'/.test(CODE));
  ok('🔴 ההחלטה נקראת מהמסמך, לא מהדפדפן; פעם אחת (notifiedAt)', /var ed = fsGet_\(path\);/.test(CODE) && /if \(ed\.notifiedAt\) return/.test(CODE) && /fsMerge_\(path, \{ notifiedAt: new Date\(\) \}\)/.test(CODE));
  const row = /\{"id":"gar-lawn-edit"[^\n]+\}/.exec(NOT);
  let cell = null; try { cell = JSON.parse(row[0].replace(/,\s*$/, '')).cells.r; } catch (e) {}
  ok('🔴 טריגר gar-lawn-edit: לתושב פוש בלבד, בלי מייל (הכרעת יועד)', cell && cell.p === 1 && cell.m === 0 && cell.link === 'הדיווחים שלי (גינון)', cell);
  ok('גיבוי: שלושת האוספים בטאבים משלהם', /collection: 'gardenLawns',\s+tab: BK_PREFIX/.test(CODE) && /collection: 'gardenAssets',\s+tab: BK_PREFIX/.test(CODE) && /collection: 'gardenLawnEdits', tab: BK_PREFIX/.test(CODE));
}

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
