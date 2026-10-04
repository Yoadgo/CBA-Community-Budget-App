/* 🌱 דשא והשקיה — גיאומטריה, נתונים, נעץ ב' ורישום המסך   (2026-10-04)
   הרצה:  node tools/test-garden-lawn-2026-10-04.js

   בודק את מה שיכול להישבר **בשקט**:
   · מטרים — שבר 0–1 אינו אחיד (העולם לא ריבועי). ריבוע של 10×10 מ' חייב לצאת 100 מ"ר.
   · נקודות נשמרות כרשימה שטוחה (Firestore לא שומר רשימה בתוך רשימה).
   · מדשאה חדשה = rev 1, עדכון = rev+1 — אחרת הכלל דוחה והגנן רואה "לא נשמר".
   · מצב הדשא נכתב ל-gardenAssets ולעולם לא לגבול (שהתושב קורא).
   · שיוך נשמר רק על המשימה; אין מחיקה בשום מקום.
   · נעץ ב': התגים מופיעים לפי הנתונים, וסגורה = חלול.
   · המסך רשום: הרשאה, ניווט, טעינה לפי דרישה, תחום רענון.
   הבדיקה החיה (מפה אמיתית, הקשות, גרירה, טלפון, מצבי כשל) רצה ב-Playwright
   מול סטאב Firestore שכל כתיבה בו עוברת דרך tools/garden-sim/rules.js. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x) : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- סביבה: window + CBA.fb מזויף שמקליט כתיבות ---------- */
const writes = [];
const sandbox = { console, Date, Math, JSON, setTimeout, structuredClone };
sandbox.window = sandbox;
sandbox.CBA = {
  mapGeo: { w: 1000, h: 2000, ppm: 2 },   // עולם לא ריבועי בכוונה: 500×1000 מ'
  fb: {
    uid: () => 'u1', serverNow: () => 'TS',
    authReady: cb => cb({ uid: 'u1' }), ensureDb: cb => cb(null),
    createDoc: (c, id, d, cb) => { writes.push({ op: 'set', c, id, d }); cb(null, true); },
    updateDoc: (c, id, d, cb) => { writes.push({ op: 'update', c, id, d }); cb(null, true); },
    deleteDoc: (c, id, cb) => { writes.push({ op: 'delete', c, id }); cb(null, true); },
    readCollection: (name, cb) => cb(null, name === 'gardenLawns'
      ? [{ id: 'L1', name: 'א', shape: 'poly', pts: [0.1, 0.1, 0.11, 0.1, 0.11, 0.105, 0.1, 0.105], rev: 2 },
         { id: 'L2', name: 'ב', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, archived: true, rev: 1 }]
      : [{ id: 'L1', kind: 'lawn', lawnId: 'L1', status: 'dry' }, { id: 's1', kind: 'spr', x: 0.2, y: 0.2 },
         { id: 's9', kind: 'spr', x: 0.3, y: 0.3, archived: true },
         { id: 'k1', kind: 'patch', name: 'כתם', shape: 'ellipse', cx: 0.105, cy: 0.102, rx: 0.002, ry: 0.001, parentId: 'L1', status: 'dead' }])
  },
  gardenLang: { catOfTask: t => /ממטר|השקי/.test(t.title) ? { key: 'water', ico: 'water' } : /דשא|מדשא/.test(t.title) ? { key: 'lawn', ico: 'lawn' } : { key: 'tree', ico: 'tree' } },
  gardenStatsCalc: { pinState: t => t.closure ? 'done' : (t.week ? 'plan' : 'wait'), ms: v => v instanceof Date ? v.getTime() : NaN },
  gardenKit: { ICONS: { water: '<path d="W"/>', lawn: '<path d="L"/>' } }
};
vm.createContext(sandbox);
['js/data/gardenAssets.js', 'js/ui/gardenPins.js'].forEach(f => vm.runInContext(R(f), sandbox, { filename: f }));
const G = sandbox.CBA.gardenGeo, A = sandbox.CBA.gardenAssets, P = sandbox.CBA.gardenPins;
const near = (a, b, tol) => Math.abs(a - b) <= (tol || 0.5);

section('1. גיאומטריה במטרים (עולם 1000×2000 יחידות, 2 יחידות למטר)');
{
  /* 10×10 מ' = 20×20 יחידות = 0.02 × 0.01 בשבר */
  const sq = { shape: 'poly', pts: [0.1, 0.1, 0.12, 0.1, 0.12, 0.11, 0.1, 0.11] };
  ok('🔴 ריבוע 10×10 מ\' = 100 מ"ר למרות שהעולם לא ריבועי', near(G.areaM2(sq), 100), G.areaM2(sq));
  const c = { shape: 'circle', cx: 0.5, cy: 0.5, r: 10 / 500 };   // רדיוס 10 מ' (r ביחידות רוחב)
  ok('עיגול ברדיוס 10 מ\' ≈ 314 מ"ר', near(G.areaM2(c), Math.PI * 100, 1), G.areaM2(c));
  ok('ומצולע העיגול עגול גם בעולם לא ריבועי', (function () {
    const p = G.polyOf(c, 4); const dx = (p[0][0] - 0.5) * 1000, dy = (p[1][1] - 0.5) * 2000; return near(dx, dy, 0.01);
  })());
  const e = { shape: 'ellipse', cx: 0.5, cy: 0.5, rx: 0.01, ry: 0.0025 };   // 5 מ' × 2.5 מ'
  ok('אליפסה 5×2.5 מ\' ≈ 39 מ"ר', near(G.areaM2(e), Math.PI * 12.5, 0.5), G.areaM2(e));
  ok('אורך קו: 0.01 ברוחב = 5 מ\'', near(G.lengthM([[0.1, 0.1], [0.11, 0.1]]), 5, 0.01));
  ok('pairs ← flat הלוך-חזור', JSON.stringify(G.pairs(G.flat([[0.123456, 0.5], [1.5, -1]]))) === JSON.stringify([[0.12346, 0.5], [1, 0]]));
  ok('inShape: בתוך/מחוץ לריבוע', G.inShape(sq, 0.11, 0.105) && !G.inShape(sq, 0.13, 0.105));
  ok('inShape: עיגול', G.inShape(c, 0.505, 0.5) && !G.inShape(c, 0.53, 0.5));
  const nl = G.nearestOnLine([0.15, 0.11], [[0.1, 0.1], [0.2, 0.1]]);
  ok('nearestOnLine: הנקודה הקרובה + מרחק 10 מ\'', near(nl.q[0], 0.15, 1e-9) && near(nl.q[1], 0.1, 1e-9) && near(nl.m, 10, 0.01), nl);
  ok('distToAsset: 0 בתוך מדשאה', G.distToAsset([0.11, 0.105], Object.assign({ kind: 'lawn' }, sq)) === 0);
  ok('thin: קו חופשי מדולל לנקודה כל ~1.5 מ\'', G.thin([[0, 0], [0.0005, 0], [0.001, 0], [0.004, 0], [0.0042, 0], [0.01, 0]], 1.5).length === 3);
}

section('2. קריאה: מצב דשא מצורף מהמסמך הנפרד, ארכיון מסונן');
let loaded = null;
A.load(r => { loaded = r; });
ok('load מצליח', loaded && loaded.ok);
ok('מדשאה L1 קיבלה status=dry ממסמך המצב', loaded.lawns.filter(l => !l.patch).length === 1 && loaded.lawns.find(l => l.id === 'L1').status === 'dry');
ok('ארכיון לא מוצג (L2, s9)', !loaded.lawns.some(l => l.id === 'L2') && !loaded.assets.some(a => a.id === 's9'));
ok('אבל נשאר ב-all (תקלה ישנה עדיין תציג שם)', !!loaded.all.L2 && !!loaded.all.s9);
ok('מסמך המצב עצמו לא נראה כנכס', !loaded.assets.some(a => a.kind === 'lawn'));
ok('🔴 כתם (מ-gardenAssets) מופיע כמקטע עם המצב שלו, ולא כנכס', loaded.lawns.some(l => l.id === 'k1' && l.patch && l.status === 'dead' && l.parentId === 'L1') && !loaded.assets.some(a => a.kind === 'patch'));
{
  const save = sandbox.CBA.fb.readCollection;
  sandbox.CBA.fb.readCollection = (n, cb) => cb(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
  let r2 = null; A.load(r => { r2 = r; });
  ok('🔴 כשל קריאה = ok:false (לא רשימה ריקה שקטה)', r2 && r2.ok === false && !!r2.err);
  sandbox.CBA.fb.readCollection = save;
}

section('3. כתיבה: rev, מצב בנפרד, שיוך, אין מחיקה');
writes.length = 0;
A.saveLawn({ id: 'L9', name: 'חדש', shape: 'poly', pts: [0.1, 0.1, 0.2, 0.1, 0.2, 0.2], rev: 0 }, () => {});
ok('מדשאה חדשה → rev 1', writes[0].c === 'gardenLawns' && writes[0].d.rev === 1);
ok('🔴 ובלי שדה status (הגבול נקרא ע"י כל תושב)', !('status' in writes[0].d));
ok('updatedAt = חותמת שרת, updatedBy = המשתמש', writes[0].d.updatedAt === 'TS' && writes[0].d.updatedBy === 'u1');
A.saveLawn({ id: 'L1', name: 'א', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.01, rev: 2, status: 'dry' }, () => {});
ok('עדכון → rev+1 (2→3), עיגול עם pts ריק', writes[1].d.rev === 3 && writes[1].d.shape === 'circle' && writes[1].d.pts.length === 0 && !('status' in writes[1].d));
ok('🔴 מדשאה עליונה נשמרת בלי parentId', !('parentId' in writes[0].d) && !('parentId' in writes[1].d));
A.setLawnStatus({ id: 'L1', shape: 'poly', pts: [] }, 'dead', () => {});
ok('מצב → gardenAssets/L1 kind lawn', writes[2].c === 'gardenAssets' && writes[2].id === 'L1' && writes[2].d.kind === 'lawn' && writes[2].d.status === 'dead');
let bad = null; A.setLawnStatus('L1', 'wet', r => { bad = r; });
ok('מצב לא מוכר נדחה עוד לפני השרת', bad && bad.ok === false && writes.length === 3);
A.saveLawn({ id: 'k2', name: 'כתם', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.002, parentId: 'L1', status: 'dry', rev: 0 }, () => {});
ok('🔴 כתם חדש → gardenAssets kind patch עם מצב, לא gardenLawns', writes[3].c === 'gardenAssets' && writes[3].d.kind === 'patch' && writes[3].d.status === 'dry' && writes[3].d.parentId === 'L1' && !('rev' in writes[3].d));
A.setLawnStatus({ id: 'k2', name: 'כתם', shape: 'circle', cx: 0.5, cy: 0.5, r: 0.002, parentId: 'L1' }, 'ok', () => {});
ok('מצב של כתם → על מסמך הכתם עצמו', writes[4].c === 'gardenAssets' && writes[4].id === 'k2' && writes[4].d.kind === 'patch' && writes[4].d.status === 'ok');
writes.splice(3, 2);
A.saveAsset({ id: 'p1', kind: 'pipe', pts: [[0.1, 0.1], [0.2, 0.2]], ctrl: 'c1', name: 'קו' }, () => {});
ok('קו: נקודות שטוחות', JSON.stringify(writes[3].d.pts) === '[0.1,0.1,0.2,0.2]');
A.saveAsset({ id: 's1', kind: 'spr', x: 0.2, y: 0.2, ctrl: 'c1', station: 2, type: 'pop', range: 5, _auto: true, foo: 1 }, () => {});
ok('🔴 שדות זרים (_auto, foo) לא נשלחים — הכלל דוחה hasOnly', !('_auto' in writes[4].d) && !('foo' in writes[4].d));
A.linkTask('41', ['a', 'b', 'c', 'd', 'e', 'f'], () => {});
ok('שיוך: update על gardenTasks עם assets בלבד, עד 5', writes[5].op === 'update' && writes[5].c === 'gardenTasks' &&
   JSON.stringify(Object.keys(writes[5].d).sort()) === '["assets","updatedAt"]' && writes[5].d.assets.length === 5);
ok('🔴 אין מחיקה בשום מסלול', !writes.some(w => w.op === 'delete') && !/deleteDoc/.test(R('js/data/gardenAssets.js') + R('js/screens/gardenLawn.js')));

section('4. נגזרות: תקלות של נכס, הצעת שיוך, סיכום');
const tasks = [{ id: '1', assets: ['s1'] }, { id: '2', assets: [] }, { id: '3', closure: 'בוצע', assets: ['s1', 'L1'] }];
ok('faultsOf נגזר מהמשימות', A.faultsOf('s1', tasks).map(t => t.id).join() === '1,3');
const items = [{ id: 's1', kind: 'spr', x: 0.2, y: 0.2 }, { id: 'L1', kind: 'lawn', shape: 'poly', pts: [0.1, 0.1, 0.11, 0.1, 0.11, 0.105, 0.1, 0.105] }];
const sg1 = A.suggest({ title: 'ראש ממטרה שבור', x: 0.2, y: 0.201 }, items, 12);
ok('הצעה: תקלת השקיה ליד ממטרה → הממטרה', sg1 && sg1.a.id === 's1' && sg1.m < 12, sg1);
const sg2 = A.suggest({ title: 'מדשאה יבשה', x: 0.105, y: 0.102 }, items, 12);
ok('הצעה: תקלת דשא בתוך מקטע → המקטע (0 מ\')', sg2 && sg2.a.id === 'L1' && sg2.m === 0, sg2);
ok('אין הצעה לעצים', A.suggest({ title: 'ענף שבור', x: 0.2, y: 0.2 }, items, 12) === null);
ok('אין הצעה כשרחוק מ-12 מ\'', A.suggest({ title: 'ממטרה', x: 0.3, y: 0.3 }, items, 12) === null);
ok('לא מציעים מה שכבר משויך', A.suggest({ title: 'ממטרה', x: 0.2, y: 0.2, assets: ['s1'] }, items, 12) === null);
{
  const lawns = [{ id: 'P', status: 'ok', shape: 'poly', pts: [0.1, 0.1, 0.12, 0.1, 0.12, 0.11, 0.1, 0.11] },          // 100 מ"ר
                 { id: 'K', status: 'dead', parentId: 'P', shape: 'poly', pts: [0.1, 0.1, 0.11, 0.1, 0.11, 0.105, 0.1, 0.105] }]; // 25 מ"ר
  const s = A.summary(lawns, [{ id: 's1', kind: 'spr' }, { id: 's2', kind: 'spr' }, { id: 'c', kind: 'ctrl' },
                             { id: 'p', kind: 'pipe', pts: [0.1, 0.1, 0.11, 0.1] }], tasks);
  ok('סיכום: כתם בתוך מדשאה מופחת מההורה (75 תקין + 25 מת = 100)', near(s.lawn.ok, 75) && near(s.lawn.dead, 25) && near(s.lawnTotal, 100), s.lawn);
  ok('סיכום: ממטרה בתקלה = רק תקלה פתוחה', s.spr === 2 && s.sprBad === 1 && s.ctrl === 1 && near(s.pipeM, 5, 0.01), s);
}

section('5. נעץ ב\'');
{
  const open = P.pinSvg({ state: 'l1', ico: 'water', res: 2, rep: true, linked: true });
  ok('תושבים מחכים: עיגול שחור עם 2', /gpin__res[\s\S]*>2<\/text>/.test(open));
  ok('חוזרת: תג חץ', /gpin__rep/.test(open));
  ok('משויכת: טיפה כחולה', /gpin__lnk/.test(open));
  ok('סמליל הקטגוריה בפנים', /d="W"/.test(open));
  const done = P.pinSvg({ state: 'done', ico: 'water', res: 2, rep: true, linked: false });
  ok('🔴 סגורה: חלולה, בלי תגי "מחכים"/"חוזרת"', /fill="#fff" stroke="var\(--s-done/.test(done) && !/gpin__res|gpin__rep/.test(done));
  ok('צבע עם ברירת מחדל (חי גם מחוץ ל-.gx-vars)', /var\(--s-l1, #D48AAB\)/.test(open));
  const cl = P.clusterSvg([{ state: 'l2' }, { state: 'plan' }, { state: 'done' }]);
  ok('אשכול: טבעת בשני צבעים פתוחים + מספר הפתוחות (2)', (cl.match(/stroke-dasharray/g) || []).length === 3 && />2<\/text>/.test(cl));
  ok('רמות זום לפי רוחב בית', P.lod(0.5) === 'far' && P.lod(1) === 'mid' && P.lod(2) === 'near');
  const t = { id: 7, x: 0.1, y: 0.2, title: 'ראש ממטרה שבור', repId: 'R1', mergedReps: ['R2', 'R3'], assets: ['s1'], createdAt: new Date(Date.now() - 5 * 86400000) };
  const p = P.fromTask(t, {});
  ok('fromTask: 3 תושבים (דיווח + 2 שאוחדו), משויכת, 5 ימים', p.res === 3 && p.linked && p.days === 5 && p.id === '7', p);
  ok('fromTask: "דורש בדיקה חוזרת" = חוזרת', P.fromTask(Object.assign({}, t, { flag: 'דורש בדיקה חוזרת' }), {}).rep === true);
  ok('fromTask: תקלת צוות (בלי repId) = 0 מחכים', P.fromTask(Object.assign({}, t, { repId: '' }), {}).res === 0);
  ok('aria: קורא מסך שומע מצב, מחכים, חוזרת, שיוך', /3 תושבים מחכים/.test(P.aria(Object.assign({}, p, { rep: true, state: 'l1' }))));
}

section('6. רישום המסך');
{
  const APP = R('js/app.js'), MAN = R('js/lazyManifest.js'), IDX = R('index.html'), CALC = R('js/data/gardenStatsCalc.js'), ST = R('js/screens/gardenStats.js');
  ok('הרשאה: gardenLawn = PERM.GARDEN (כולל הגנן החיצוני)', /gardenLawn: PERM\.GARDEN,/.test(APP));
  ok('באזור הניהול', /"gardenStats", "gardenLawn", "appReports"/.test(APP));
  ok('בניווט בקבוצת הגינון', /\["gardenLawn",\s+"דשא והשקיה", "garden"\]/.test(APP));
  ok('סמליל + צבע + תחום רענון', /gardenLawn:\s+'<svg/.test(APP) && /gardenLawn: "#047857"/.test(APP) && /gardenLawn: \["garden"\]/.test(APP));
  ok('טעינה לפי דרישה: gardenPins לפני gardenStats, gardenLawn לפני gardenTasks', (function () {
    const i = n => MAN.indexOf(n);
    return i('js/ui/gardenPins.js') > 0 && i('js/ui/gardenPins.js') < i('js/screens/gardenStats.js') &&
           i('js/screens/gardenLawn.js') > 0 && i('js/screens/gardenLawn.js') < i('js/screens/gardenTasks.js') &&
           /"gardenStats", "gardenLawn"\]/.test(MAN);
  })());
  ok('index.html: gardenAssets.js (גלובלי — טופס התושב יזדקק לו) + gardenLawn.css', /js\/data\/gardenAssets\.js\?v=/.test(IDX) && /css\/gardenLawn\.css\?v=/.test(IDX));
  ok('נתוני גינון משתמשים בנעץ המשותף', /return CBA\.gardenPins\.mount\(host, o\);/.test(ST) && !/function pinSvg\(/.test(ST));
  ok('חישוב הנעצים: res/rep/linked/days/title', /res: open && hasRep/.test(CALC) && /rep: t\.flag === "דורש בדיקה חוזרת" \|\| !!repIds/.test(CALC) && /linked: !!\(t\.assets/.test(CALC));
  ok('🔴 רענון שקט לא בונה את המסך מחדש (טיוטה לא נמחקת)', /if \(CBA\.renderSilent && S && S\.root && S\.root\.isConnected\) \{ loadAll\(true\); return; \}/.test(R('js/screens/gardenLawn.js')));
  ok('גנן חיצוני לא מקבל כפתור שיוך על תקלה סגורה', /function canRelink\(t\) \{ return !t\.closure \|\| isMgr\(\); \}/.test(R('js/screens/gardenLawn.js')));
  ok('gardenForm: מיקום התחלתי + onSaved(res)', /opts\.at && typeof opts\.at\.x === "number"/.test(R('js/ui/gardenForm.js')) && /opts\.onSaved\(res\)/.test(R('js/ui/gardenForm.js')));
}

section('7. סבב 2 (4.10): סוג תקלה, זום CSS, הזזת מפה');
{
  writes.length = 0;
  ok('ארבעה סוגים בסדר קבוע', A.FKIND_ORDER.join() === 'line,spr,ctrl,lawn' && A.FKIND.line.asset === 'pipe');
  ok('סימון → סוג: pipe→line, spr→spr, ctrl→ctrl, lawn→lawn, אחר → ""',
     A.fkindOfAsset('pipe') === 'line' && A.fkindOfAsset('spr') === 'spr' && A.fkindOfAsset('ctrl') === 'ctrl' &&
     A.fkindOfAsset('lawn') === 'lawn' && A.fkindOfAsset('patch') === '');
  A.linkTask('42', ['s1'], () => {}, { fkind: 'spr' });
  ok('שיוך + סוג באותה כתיבה', JSON.stringify(Object.keys(writes[0].d).sort()) === '["assets","fkind","updatedAt"]' && writes[0].d.fkind === 'spr');
  A.linkTask('42', ['s1'], () => {}, { fkind: 'boom' });
  ok('סוג לא מוכר לא נשלח', !('fkind' in writes[1].d));
  let r1 = null; A.setFaultKind('42', 'line', r => { r1 = r; });
  ok('setFaultKind: update עם fkind+updatedAt בלבד', writes[2].c === 'gardenTasks' && JSON.stringify(Object.keys(writes[2].d).sort()) === '["fkind","updatedAt"]' && r1.fkind === 'line');
  A.setFaultKind('42', 'nope', () => {});
  ok('setFaultKind: לא מוכר → "" (ניקוי)', writes[3].d.fkind === '');
  const its = [{ id: 's1', kind: 'spr', x: 0.2, y: 0.2 }, { id: 'p1', kind: 'pipe', pts: [0.2, 0.2005, 0.21, 0.2005] }];
  const s1 = A.suggest({ title: 'נראה שההשקייה לא עובדת', x: 0.2, y: 0.2 }, its, 12);
  const s2 = A.suggest({ title: 'נראה שההשקייה לא עובדת', x: 0.2, y: 0.2, fkind: 'line' }, its, 12);
  ok('"הקרוב ביותר" מצטמצם לסוג: בלי סוג → ממטרה, "קו מים" → הקו', s1 && s1.a.id === 's1' && s2 && s2.a.id === 'p1', [s1 && s1.a.id, s2 && s2.a.id]);
  const pin = P.pinSvg({ state: 'wait', ico: 'water', fkind: 'line' });
  ok('נעץ: סמליל קו מים במקום הטיפה', pin.indexOf(P.FK_ICO.line) !== -1 && !/d="W"/.test(pin));
  ok('נעץ בלי סוג — כמו קודם', /d="W"/.test(P.pinSvg({ state: 'wait', ico: 'water' })));
  ok('fromTask מעביר fkind', P.fromTask({ id: 1, x: 0.1, y: 0.1, title: 'x', fkind: 'ctrl' }, {}).fkind === 'ctrl');
  ok('aria אומר את הסוג', /תקלה במחשב ההשקיה/.test(P.aria({ title: 'x', state: 'wait', fkind: 'ctrl' })));

  {
    /* 🔴 חלון בין Push לפרסום הכללים: הכלל הישן דוחה fkind — השיוך עדיין נשמר. */
    const orig = sandbox.CBA.fb.updateDoc; const tries = [];
    sandbox.CBA.fb.updateDoc = (c, id, d, cb) => { tries.push(Object.keys(d).sort().join()); cb('fkind' in d ? { code: 'permission-denied' } : null); };
    let rr = null; A.linkTask('43', ['s1'], r => { rr = r; }, { fkind: 'spr' });
    sandbox.CBA.fb.updateDoc = orig;
    ok('🔴 כללים ישנים: שיוך נשמר בניסיון שני בלי fkind', rr && rr.ok && !rr.fkind && tries.length === 2 && tries[1] === 'assets,updatedAt', { rr, tries });
    const DS = R('js/data/dataService.js');
    ok('🔴 וכך גם יצירה ועריכה של תקלה (createOnce / retried)', /function createOnce\(retry\)/.test(DS) && /delete doc\.fkind; return createOnce\(false\)/.test(DS) && /retried = true; delete patch\.fkind;/.test(DS));
  }
  const LW = R('js/screens/gardenLawn.js'), RES = R('js/screens/resident.js'), LANG = R('js/data/gardenLang.js');
  ok('🔴 toNorm מחלק ב-zoom של CSS (body zoom 1.05 בדסקטופ)', /\(\(\(cx - r\.left\) \/ z - v\.tx\) \/ v\.s\)/.test(LW) && /function zoomF\(\)/.test(LW));
  ok('🔴 מנוע המפה: נעיצה, גרירה, צביטה וגלגלת מחולקים ב-zf()', /var wx = \(\(e\.clientX - rect\.left\) \/ zf\(\) - tx\) \/ scale;/.test(RES) &&
     /tx = txStart \+ \(e\.clientX - dragStartX\) \/ zf\(\)/.test(RES) && (RES.match(/- rect\.left\) \/ zf\(\)/g) || []).length >= 3);
  ok('מנוע המפה חושף panBy/zoomAt', /panBy: function \(dx, dy\)/.test(RES) && /zoomAt: function \(f, cx, cy\)/.test(RES));
  ok('🔴 הזזת מפה בכל כלי: גלגלת, רווח, שתי אצבעות בציור חופשי', /addEventListener\("wheel"[\s\S]{0,400}api\.panBy\(-e\.deltaX/.test(LW) &&
     /e\.code !== "Space"/.test(LW) && /if \(list\.length >= 2\)/.test(LW) && /!S\.space\)/.test(LW));
  ok('catOfTask: fkind גובר על הכותרת', /t\.fkind === "lawn" \? \{ key: "lawn"/.test(LANG));
  ok('טופס: סוג התקלה רק בקטגוריית דשא/השקיה, ונשמר ביצירה ובעריכה', /function fkOn\(\)/.test(R('js/ui/gardenForm.js')) &&
     /fkind: fkOn\(\) \? st\.fkind : ""/.test(R('js/ui/gardenForm.js')) && /if \(GARDEN_FKINDS\[payload\.fkind\]\) doc\.fkind/.test(R('js/data/dataService.js')));
  ok('כרטיס התקלה: סוג + מעבר למפת ההשקיה', /function lwKindHtml\(t, cat, closed\)/.test(R('js/screens/gardenTasks.js')) &&
     /CBA\.gardenAssets\.openOnMap\(id, m === "lwpick"\)/.test(R('js/screens/gardenTasks.js')) && /function applyFocus\(\)/.test(LW));
}

console.log('\n====================================================');
console.log('עברו: ' + pass + '   נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
