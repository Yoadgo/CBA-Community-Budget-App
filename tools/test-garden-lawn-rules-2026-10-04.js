/* 🌱 דשא והשקיה — כללי האבטחה, שלושה תפקידים ועוד   (2026-10-04)
   הרצה:  node tools/test-garden-lawn-rules-2026-10-04.js

   🔴 **התוצאה הצפויה של כל שורה נכתבה לפני ההרצה** (שורת EXPECT ליד כל מקרה).
   בדיקה שנכתבת אחרי שרואים את התוצאה אינה בדיקה.

   רץ מול הפורט 1:1 של הכללים (tools/garden-sim/rules.js). הפורט עצמו נבדק
   כאן גם מול הקובץ האמיתי: כל שם פונקציה ורשימת שדות שהפורט מניח חייבים
   להופיע ב-firestore.rules — אחרת הסימולציה "עוברת" על כללים שלא קיימים.

   ⚠️ מה **לא** נבדק כאן: הכללים החיים בקונסולה. אחרי פרסום — ר' שורות
   lawn-* ב-tools/firestore-rules-expectations.md, מול משתמש אמיתי בכל תפקיד. */
'use strict';
const fs = require('fs');
const path = require('path');
const { check } = require('./garden-sim/rules.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

const NOW = new Date('2026-10-04T09:00:00Z');
const members = {
  res1: { active: true, isExternal: false, perms: [], familyId: 'F1' },
  res2: { active: true, isExternal: false, perms: [], familyId: 'F2' },
  ext:  { active: true, isExternal: true,  perms: ['גינון'], familyId: '' },
  mgr:  { active: true, isExternal: false, perms: ['גינון'], familyId: 'F9' },
  left: { active: false, isExternal: false, perms: [], familyId: 'F3' }
};
function store() {
  return {
    gardenLawns: { L1: lawn() },
    gardenReports: { R7: { id: 'R7', familyId: 'F1' }, R8: { id: 'R8', familyId: 'F2' } },
    gardenAssets: { s1: spr('ext') },
    gardenLawnEdits: { R7: edit('res1') },
    gardenTasks: {}
  };
}
function lawn(by, over) {
  return Object.assign({ id: 'L1', name: 'מדשאת מועדון משפחות', shape: 'poly',
    pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], rev: 1, archived: false,
    updatedAt: NOW, updatedBy: by || 'mgr', schema: 1 }, over || {});
}
function spr(by, over) {
  return Object.assign({ id: 's1', kind: 'spr', name: 'ממטרה 1.1.1', x: 0.3, y: 0.4, ctrl: 'c1',
    station: 1, type: 'pop', range: 5, status: '', note: '', archived: false,
    updatedAt: NOW, updatedBy: by || 'ext', schema: 1 }, over || {});
}
function edit(uid, over) {
  return Object.assign({ id: 'R7', lawnId: 'L1', pts: [0.1, 0.1, 0.25, 0.1, 0.2, 0.2],
    baseRev: 1, uid: uid, status: 'pending', createdAt: NOW, updatedAt: NOW, schema: 1 }, over || {});
}
/* 🔴 צוות אדום 4.10 — לכתיבה, הפעולה **נגזרת** מקיום המסמך, בדיוק כמו ב-Firestore:
   set() על מזהה קיים הוא update. (קודם הבדיקה בחרה op בעצמה, והחמיצה דריסה.) */
function run(uid, coll, op, id, after, before, query) {
  const s = store();
  if (op === 'create' || op === 'update') op = (before || (s[coll] && s[coll][id])) ? 'update' : 'create';
  return check({ uid, members, store: s, now: NOW, coll, op, id,
                 after: after, before: before || (s[coll] && s[coll][id]) || {}, query });
}
function expect(name, want, res) {
  ok(name + '  [צפוי: ' + (want ? 'מותר' : 'נדחה') + ']', res.ok === want, res.why);
}

section('0. הפורט מול הקובץ האמיתי');
{
  const R = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  ['lwShapeOk', 'lwCreateOk', 'lwUpdateOk', 'gaShapeOk', 'gaCreateOk', 'gaUpdateOk',
   'leCreateOk', 'leReadOk', 'leDecideOk', 'leMyReport', 'gtAssetsOk'].forEach(function (f) {
    ok('function ' + f + ' קיימת בכללים', new RegExp('function ' + f + '\\(').test(R));
  });
  ok('match /gardenLawns — קריאה לכל חבר', /match \/gardenLawns\/\{docId\} \{\s*allow read: if isMember\(\);/.test(R));
  ok('match /gardenAssets — קריאה לגינון בלבד', /match \/gardenAssets\/\{docId\} \{\s*allow read: if canSeeGardenAssets\(\);/.test(R) &&
     /function canSeeGardenAssets\(\) \{\s*return hasPerm\('גינון'\);/.test(R));
  ok('🔴 אין מחיקה באף אחד משלושת האוספים',
     ['gardenLawns', 'gardenAssets', 'gardenLawnEdits'].every(function (c) {
       const i = R.indexOf('match /' + c + '/{docId}');
       /* ⚠️ הסוגר הראשון אחרי הכותרת הוא של `{docId}` — סופרים מהשורה הבאה. */
       return i > 0 && /allow delete: if false;/.test(R.slice(i, R.indexOf('\n    }', i)));
     }));
  ok("🔴 'assets' ב-gtFields וב-gtTeamUpdateOk",
     /* 4.10 — 'fkind' נוסף אחרי 'assets' בשתי הרשימות (סעיף 5). */
     /'workPhotos',[\s\S]{0,400}'assets',/.test(R) && /'desc', 'place', 'workPhotos', 'assets'[,\]]/.test(R));
  ok('🔴 מצב הדשא **אינו** שדה של gardenLawns (שם הקריאה פתוחה לכל תושב)',
     !/function lwFields\(\) \{[\s\S]{0,300}'status'/.test(R));
  ok('🔴 וגם לא parentId — כתמים יושבים ב-gardenAssets', !/function lwFields\(\) \{[\s\S]{0,300}'parentId'/.test(R));
  /* 🔴 צוות אדום 4.10 — רשימות השדות של הפורט חייבות להיות הרשימות של הקובץ. */
  const sim = fs.readFileSync(path.join(__dirname, 'garden-sim', 'rules.js'), 'utf8');
  const listOf = (src, re) => { const m = re.exec(src); return m ? (m[1].match(/'([^']+)'/g) || []).map(s => s.slice(1, -1)).join(',') : null; };
  const C = R.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('lwFields בכללים == LW_FIELDS בפורט',
     listOf(C, /function lwFields\(\) \{\s*return \[([^\]]+)\]/) === listOf(sim, /const LW_FIELDS = \[([^\]]+)\]/));
  ok('gaFields בכללים == GA_FIELDS בפורט',
     listOf(C, /function gaFields\(\) \{\s*return \[([^\]]+)\]/) === listOf(sim, /const GA_FIELDS = \[([^\]]+)\]/));
  ok('שדות יצירת דיוק בכללים == LE_CREATE בפורט',
     listOf(C, /function leCreateOk[\s\S]*?keys\(\)\.hasOnly\(\[([^\]]+)\]/) === listOf(sim, /const LE_CREATE = \[([^\]]+)\]/));
}

section('1. gardenLawns — גבולות (כל חבר קורא, הגינון כותב)');
expect('תושב קורא גבול', true, run('res1', 'gardenLawns', 'get', 'L1'));
expect('🔴 מי שעזב לא קורא', false, run('left', 'gardenLawns', 'get', 'L1'));
expect('לא-חבר לא קורא', false, run('nobody', 'gardenLawns', 'get', 'L1'));
expect('🔴 תושב לא יוצר מדשאה', false, run('res1', 'gardenLawns', 'create', 'L2', lawn('res1', { id: 'L2' })));
expect('גנן חיצוני יוצר מדשאה (rev 1)', true, run('ext', 'gardenLawns', 'create', 'L2', lawn('ext', { id: 'L2' })));
expect('מנהל יוצר עיגול', true, run('mgr', 'gardenLawns', 'create', 'L3', lawn('mgr', { id: 'L3', shape: 'circle', pts: [], cx: 0.5, cy: 0.5, r: 0.01 })));
expect('יצירה עם rev 2 נדחית', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', rev: 2 })));
expect('מזהה במסמך ≠ מזהה הנתיב', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L9' })));
expect('מצולע עם 2 נקודות נדחה', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', pts: [0.1, 0.1, 0.2, 0.2] })));
expect('מספר אי-זוגי של ערכים נדחה', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', pts: [0.1, 0.1, 0.2, 0.2, 0.3] })));
expect('שם ארוך מ-60 נדחה', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', name: 'א'.repeat(61) })));
expect('🔴 מצב דשא בתוך גבול (שדה status) נדחה', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', status: 'dry' })));
expect('🔴 כתם (parentId) לא נכנס לגבולות שהתושב קורא', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', parentId: 'L1' })));
expect('עיגול בלי מרכז — נדחה', false, run('mgr', 'gardenLawns', 'create', 'L3', lawn('mgr', { id: 'L3', shape: 'circle', pts: [], r: 0.01 })));
expect('רדיוס שאינו מספר — נדחה', false, run('mgr', 'gardenLawns', 'create', 'L3', lawn('mgr', { id: 'L3', shape: 'circle', pts: [], cx: 0.5, cy: 0.5, r: 'big' })));
expect('🔴 "יצירה" על מדשאה קיימת עם rev 1 = עדכון בלי העלאה — נדחה', false, run('mgr', 'gardenLawns', 'create', 'L1', lawn('mgr')));
expect('updatedBy של מישהו אחר נדחה', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('ext', { id: 'L2' })));
expect('updatedAt שאינו שעת הבקשה נדחה', false, run('mgr', 'gardenLawns', 'create', 'L2', lawn('mgr', { id: 'L2', updatedAt: new Date(0) })));
expect('עדכון גבול rev+1', true, run('mgr', 'gardenLawns', 'update', 'L1', lawn('mgr', { rev: 2, pts: [0.1, 0.1, 0.3, 0.1, 0.2, 0.2] })));
expect('🔴 עדכון בלי העלאת rev נדחה', false, run('mgr', 'gardenLawns', 'update', 'L1', lawn('mgr', { rev: 1 })));
expect('עדכון שמדלג rev נדחה', false, run('mgr', 'gardenLawns', 'update', 'L1', lawn('mgr', { rev: 3 })));
expect('🔴 תושב לא מעדכן גבול ישירות', false, run('res1', 'gardenLawns', 'update', 'L1', lawn('res1', { rev: 2 })));
expect('הסרה = archived (עדכון)', true, run('ext', 'gardenLawns', 'update', 'L1', lawn('ext', { rev: 2, archived: true })));
expect('🔴 מחיקה נדחית גם למנהל', false, run('mgr', 'gardenLawns', 'delete', 'L1'));

section('2. gardenAssets — ממטרות, מחשבים, צנרת, מצב דשא (הגינון בלבד)');
expect('🔴 תושב לא קורא', false, run('res1', 'gardenAssets', 'get', 's1'));
expect('גנן חיצוני קורא', true, run('ext', 'gardenAssets', 'get', 's1'));
expect('מנהל קורא', true, run('mgr', 'gardenAssets', 'get', 's1'));
expect('גנן יוצר ממטרה', true, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2' })));
expect('גנן יוצר מצב דשא', true, run('ext', 'gardenAssets', 'create', 'L1',
  { id: 'L1', kind: 'lawn', lawnId: 'L1', status: 'dry', updatedAt: NOW, updatedBy: 'ext', schema: 1 }));
expect('🔴 מסמך מצב שלא קשור למדשאה שלו (lawnId ≠ מזהה)', false, run('ext', 'gardenAssets', 'create', 'X1',
  { id: 'X1', kind: 'lawn', lawnId: 'L1', status: 'dry', updatedAt: NOW, updatedBy: 'ext', schema: 1 }));
expect('🔴 מצב על ממטרה (רק מדשאה/כתם נושאים מצב)', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', status: 'dry' })));
expect('כתם (patch) נשמר כאן עם צורה ומצב', true, run('ext', 'gardenAssets', 'create', 'k1',
  { id: 'k1', kind: 'patch', name: 'כתם', shape: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.01, pts: [], parentId: 'L1', status: 'dead', updatedAt: NOW, updatedBy: 'ext', schema: 1 }));
expect('כתם בלי מצב — נדחה', false, run('ext', 'gardenAssets', 'create', 'k1',
  { id: 'k1', kind: 'patch', name: 'כתם', shape: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.01, pts: [], parentId: 'L1', updatedAt: NOW, updatedBy: 'ext', schema: 1 }));
expect('קואורדינטה מחוץ ל-0–1 — נדחית', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', x: 7 })));
expect('טווח התזה 500 מ\' — נדחה', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', range: 500 })));
expect('מזהה מחשב ארוך מ-40 — נדחה', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', ctrl: 'c'.repeat(41) })));
expect('🔴 תושב "יוצר" על מזהה קיים = דריסה — נדחה', false, run('res1', 'gardenAssets', 'create', 's1', spr('res1')));
expect('🔴 תושב לא יוצר', false, run('res1', 'gardenAssets', 'create', 's2', spr('res1', { id: 's2' })));
expect('סוג לא מוכר נדחה', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', kind: 'house' })));
expect('מצב לא מוכר נדחה', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', status: 'wet' })));
expect('🔴 שדה זר (familyId) נדחה', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', familyId: 'F1' })));
expect('הערה ארוכה מ-300 נדחית', false, run('ext', 'gardenAssets', 'create', 's2', spr('ext', { id: 's2', note: 'x'.repeat(301) })));
expect('עדכון קו/סוג ממטרה', true, run('mgr', 'gardenAssets', 'update', 's1', spr('mgr', { station: 2, type: 'rot' })));
expect('🔴 שינוי kind נדחה', false, run('mgr', 'gardenAssets', 'update', 's1', spr('mgr', { kind: 'pipe' })));
expect('🔴 מחיקה נדחית', false, run('mgr', 'gardenAssets', 'delete', 's1'));

section('3. gardenLawnEdits — דיוק גבול מתוך דיווח');
const fresh = (uid, over) => edit(uid, Object.assign({ id: 'R7' }, over || {}));
function runCreateEdit(uid, id, doc) {
  const s = store(); delete s.gardenLawnEdits.R7;
  return check({ uid, members, store: s, now: NOW, coll: 'gardenLawnEdits', op: 'create', id, after: doc, before: {} });
}
expect('תושב מצרף דיוק לדיווח של המשפחה שלו', true, runCreateEdit('res1', 'R7', fresh('res1')));
expect('🔴 לדיווח של שכן — נדחה', false, runCreateEdit('res1', 'R8', fresh('res1', { id: 'R8' })));
expect('לדיווח שלא קיים — נדחה', false, runCreateEdit('res1', 'R99', fresh('res1', { id: 'R99' })));
expect('למדשאה שלא קיימת — נדחה', false, runCreateEdit('res1', 'R7', fresh('res1', { lawnId: 'L404' })));
expect('🔴 נוצר כ"אושר" — נדחה', false, runCreateEdit('res1', 'R7', fresh('res1', { status: 'approved' })));
expect('🔴 בשם uid אחר — נדחה', false, runCreateEdit('res1', 'R7', fresh('res2')));
expect('🔴 גנן חיצוני לא מגיש דיוק', false, runCreateEdit('ext', 'R7', fresh('ext')));
expect('פחות משלוש נקודות — נדחה', false, runCreateEdit('res1', 'R7', fresh('res1', { pts: [0.1, 0.1, 0.2, 0.2] })));
expect('🔴 שדה החלטה ביצירה — נדחה', false, runCreateEdit('res1', 'R7', fresh('res1', { decidedBy: 'res1' })));
expect('🔴 baseRev עתידי (המדשאה ב-rev 1) — נדחה', false, runCreateEdit('res1', 'R7', fresh('res1', { baseRev: 2 })));
expect('baseRev 0 — נדחה', false, runCreateEdit('res1', 'R7', fresh('res1', { baseRev: 0 })));
expect('🔴 תושב שולח שוב על דיוק קיים (set = update) — נדחה', false, run('res1', 'gardenLawnEdits', 'create', 'R7', fresh('res1')));
expect('תושב קורא את שלו', true, run('res1', 'gardenLawnEdits', 'get', 'R7'));
expect('🔴 תושב אחר לא קורא', false, run('res2', 'gardenLawnEdits', 'get', 'R7'));
expect('שאילתת תושב עם uid==שלי', true, run('res1', 'gardenLawnEdits', 'list', null, null, null, [['uid', 'res1']]));
expect('🔴 שאילתת תושב בלי מסנן — נדחית', false, run('res1', 'gardenLawnEdits', 'list', null, null, null, []));
expect('גנן קורא הכול', true, run('ext', 'gardenLawnEdits', 'list', null, null, null, []));
const decide = (uid, over) => Object.assign(edit('res1'), { status: 'approved', decidedBy: uid, decidedAt: NOW, updatedAt: NOW }, over || {});
expect('גנן מאשר', true, run('ext', 'gardenLawnEdits', 'update', 'R7', decide('ext')));
expect('מנהל משאיר כמו שהוא (rejected)', true, run('mgr', 'gardenLawnEdits', 'update', 'R7', decide('mgr', { status: 'rejected' })));
expect('🔴 תושב לא מאשר את עצמו', false, run('res1', 'gardenLawnEdits', 'update', 'R7', decide('res1')));
expect('🔴 החלטה שנייה — נדחית', false, run('mgr', 'gardenLawnEdits', 'update', 'R7', decide('mgr', { status: 'rejected' }),
  Object.assign(edit('res1'), { status: 'approved', decidedBy: 'ext', decidedAt: NOW })));
expect('🔴 החלטה שמשנה גם את הנקודות — נדחית', false, run('ext', 'gardenLawnEdits', 'update', 'R7', decide('ext', { pts: [0, 0, 1, 0, 1, 1] })));
expect('decidedBy של מישהו אחר — נדחה', false, run('ext', 'gardenLawnEdits', 'update', 'R7', decide('mgr')));
expect('🔴 מחיקה נדחית', false, run('mgr', 'gardenLawnEdits', 'delete', 'R7'));

section('4. assets על משימה');
const task = (over) => Object.assign({ id: '40', kind: 'דיווח תושב', title: 'ממטרה שבורה', stage: 'התקבל', schema: 1,
  repId: 'R7', familyId: 'F1', x: 0.3, y: 0.4 }, over || {});
function runTask(uid, op, after, before) {
  const s = store(); s.gardenTasks['40'] = before || task();
  return check({ uid, members, store: s, now: NOW, coll: 'gardenTasks', op, id: '40', after, before: before || (op === 'create' ? {} : task()) });
}
expect('מנהל משייך לממטרה', true, runTask('mgr', 'update', task({ assets: ['s1'], updatedAt: NOW })));
expect('גנן משייך לממטרה', true, runTask('ext', 'update', task({ assets: ['s1'], updatedAt: NOW })));
expect('🔴 שישה שיוכים — נדחה', false, runTask('mgr', 'update', task({ assets: ['a', 'b', 'c', 'd', 'e', 'f'], updatedAt: NOW })));
expect('🔴 שיוך שאינו מזהה (אובייקט) — נדחה', false, runTask('res1', 'create', task({ assets: [{ big: 'x'.repeat(100) }] })));
expect('מזהה שיוך ארוך מ-40 — נדחה', false, runTask('mgr', 'update', task({ assets: ['s'.repeat(41)], updatedAt: NOW })));
expect('תושב פותח תקלה עם שיוך אוטומטי למדשאה', true, runTask('res1', 'create', task({ assets: ['L1'] })));
const closed = task({ closure: 'בוצע', note: 'הוחלף ראש', approvedAt: NOW });
expect('🔴 גנן לא משנה שיוך על משימה סגורה', false, runTask('ext', 'update', Object.assign({}, closed, { assets: ['s1'], updatedAt: NOW }), closed));
expect('מנהל כן', true, runTask('mgr', 'update', Object.assign({}, closed, { assets: ['s1'], updatedAt: NOW }), closed));

section('5. fkind — סוג תקלה (4.10, צוות בלבד)');
{
  const R = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
  ok("'fkind' ב-gtFields, ב-gtTeamOnly וב-gtTeamUpdateOk",
     /'assets',[\s\S]{0,300}'fkind'\];/.test(R) &&
     /'openedBy', 'openedUid', 'workPhotos', 'fkind'\];/.test(R) &&
     /'desc', 'place', 'workPhotos', 'assets', 'fkind'\]\)/.test(R));
  ok('function gtFkindOk — רשימה סגורה של 4 + ריק',
     /function gtFkindOk\(\) \{\s*return \['', 'line', 'spr', 'ctrl', 'lawn'\]\.hasAny/.test(R));
  ok('gtFkindOk נקרא ב-gtShapeOk וב-gtTeamUpdateOk', (R.match(/gtAssetsOk\(\) && gtFkindOk\(\)/g) || []).length === 2);
}
/* EXPECT: מנהל/גנן — מותר; ערך מחוץ לרשימה — נדחה; תושב ביצירה — נדחה (teamOnly);
   גנן על סגורה — נדחה; מנהל על סגורה — מותר; שיוך+סוג באותה כתיבה — מותר. */
expect('מנהל מסמן "קו מים"', true, runTask('mgr', 'update', task({ fkind: 'line', updatedAt: NOW })));
expect('גנן מסמן "ממטרה"', true, runTask('ext', 'update', task({ fkind: 'spr', updatedAt: NOW })));
expect('ניקוי הסוג ("")', true, runTask('mgr', 'update', task({ fkind: '', updatedAt: NOW }), task({ fkind: 'spr' })));
expect('🔴 ערך מחוץ לרשימה — נדחה', false, runTask('mgr', 'update', task({ fkind: 'boom', updatedAt: NOW })));
expect('🔴 סוג שאינו מחרוזת — נדחה', false, runTask('mgr', 'update', task({ fkind: 3, updatedAt: NOW })));
expect('🔴 תושב לא קובע סוג ביצירה', false, runTask('res1', 'create', task({ fkind: 'line' })));
expect('🔴 תושב לא משנה סוג', false, runTask('res1', 'update', task({ fkind: 'line', updatedAt: NOW })));
expect('שיוך + סוג באותה כתיבה', true, runTask('ext', 'update', task({ assets: ['s1'], fkind: 'spr', updatedAt: NOW })));
expect('🔴 גנן לא משנה סוג בסגורה', false, runTask('ext', 'update', Object.assign({}, closed, { fkind: 'line', updatedAt: NOW }), closed));
expect('מנהל כן', true, runTask('mgr', 'update', Object.assign({}, closed, { fkind: 'line', updatedAt: NOW }), closed));

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
