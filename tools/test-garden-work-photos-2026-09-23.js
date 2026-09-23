'use strict';
/* ============================================================================
 *  📷 23.9 — תמונות מהצוות בסגירה ובהערה/דיווח + הגנן צופה בתמונות
 * ----------------------------------------------------------------------------
 *  בקשת יועד:
 *   1. הגנן (חיצוני) יכול לראות את התמונות שצורפו לתקלות/דיווחים.
 *   2. צילום בסגירת תקלה — בכל סוגי הסגירה — ובהערה/דיווח. לא חובה, עד 2.
 *      אותו מנגנון כמו בדיווח (כיווץ בדפדפן, העלאה ברקע) — כדי לשמור על מהירות.
 *   הכרעות: שגרה/יזומה — בלי חלון ובלי תמונה. התושב רואה את תמונות ה"אחרי".
 *  הבדיקה מריצה את dataService.js האמיתי מול פורט הכללים (garden-sim),
 *  ואת authorize_/handleGardenPhoto_/gardenPhotoAllowed_ האמיתיים מ-Code.gs.
 *  התוצאות הצפויות נכתבו לפני ההרצה.
 * ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./garden-sim/harness');
const REPO = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + String(extra).slice(0, 300) : '')); } };
const section = s => console.log('\n' + s);
const tick = () => new Promise(r => setTimeout(r, 30));
const PH = n => Array.from({ length: n }, (_, i) => ({ name: 'p' + i + '.jpg', mime: 'image/jpeg', data: 'x' }));

(async () => {
  const store = H.newStore();
  const now = new Date(2026, 8, 23, 10, 0, 0);
  const clock = { now: () => now };
  const Bs = {};
  const B = uid => (Bs[uid] = Bs[uid] || H.browser(store, uid, clock));
  const ups = uid => B(uid).__sheets.filter(c => c.action === 'gardenPhotoOne').length;

  section('1. גנן: "בוצע" על תקלת תושב עם תמונה');
  const r1 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'ממטרה שבורה', category: 'השקיה / ממטרות', area: 'ציר מזרחי', x: 0.4, y: 0.5, photos: [] }, cb));
  ok('התושב דיווח', r1 && r1.ok, JSON.stringify(r1));
  const tid = String(r1.taskId), rid = String(r1.id);
  const d1 = await H.call(cb => B('gard').CBA.data.gardenTask('done', tid, { note: 'הממטרה הוחלפה', photos: PH(1) }, cb));
  await tick();
  ok('הפעולה הצליחה (עלתה לאישור)', d1 && d1.ok && d1.awaiting, JSON.stringify(d1));
  ok('🔑 התשובה אומרת שתמונה בדרך', d1.photosPending === 1, d1.photosPending);
  ok('העלאה אחת ל-Drive', ups('gard') === 1, ups('gard'));
  ok('🔴 workPhotos על המשימה', (store.gardenTasks[tid].workPhotos || []).length === 1, JSON.stringify(store.gardenTasks[tid].workPhotos));
  ok('🔴 ועל הדיווח של התושב (תמונת "אחרי")', (store.gardenReports[rid].workPhotos || []).length === 1, JSON.stringify(store.gardenReports[rid].workPhotos));
  ok('⚠️ photos של התושב לא נגעו', (store.gardenTasks[tid].photos || []).length === 0);

  section('2. מנהל מאשר עם 2 תמונות נוספות — מצטבר, לא דורס');
  const a1 = await H.call(cb => B('mgr').CBA.data.gardenTask('approve', tid, { note: 'הממטרה הוחלפה', photos: PH(2) }, cb));
  await tick();
  ok('אושר ונסגר', a1 && a1.ok && store.gardenTasks[tid].closure === 'בוצע', JSON.stringify(a1));
  ok('🔴 3 תמונות צוות על המשימה (arrayUnion)', (store.gardenTasks[tid].workPhotos || []).length === 3, JSON.stringify(store.gardenTasks[tid].workPhotos));
  ok('🔴 3 גם על הדיווח', (store.gardenReports[rid].workPhotos || []).length === 3);
  ok('הדיווח סגור "בוצע" — התושב יראה את הבלוק', store.gardenReports[rid].closure === 'בוצע');

  section('3. 🔒 משימה סגורה — הגנן מוסיף תמונה בלבד');
  const fbG = B('gard').CBA.fb;
  const union = x => B('gard').firebase.firestore.FieldValue.arrayUnion(x);
  const c1 = await H.call(cb => fbG.mergeDoc('gardenTasks', tid, { workPhotos: union('late1') }, cb));
  ok('✅ גנן מוסיף workPhotos למשימה סגורה', c1 === null /* cb(err) — null = הצליח */, JSON.stringify(c1));
  const c2 = await H.call(cb => fbG.mergeDoc('gardenTasks', tid, { workPhotos: union('late2'), note: 'שינוי' }, cb));
  ok('⛔ אבל לא יחד עם שדה אחר', c2 && c2.code === 'permission-denied', JSON.stringify(c2));
  const c3 = await H.call(cb => fbG.mergeDoc('gardenTasks', tid, { note: 'שינוי' }, cb));
  ok('⛔ והערה על סגורה — עדיין חסום (כמו קודם)', c3 && c3.code === 'permission-denied');

  section('4. ⛔ תושב — אינו כותב workPhotos');
  const fbR = B('res1').CBA.fb;
  const union1 = x => B('res1').firebase.firestore.FieldValue.arrayUnion(x);
  const x1 = await H.call(cb => fbR.mergeDoc('gardenReports', rid, { workPhotos: union1('fake') }, cb));
  ok('⛔ על הדיווח שלו', x1 && x1.code === 'permission-denied', JSON.stringify(x1));
  const x2 = await H.call(cb => fbR.mergeDoc('gardenTasks', tid, { workPhotos: union1('fake') }, cb));
  ok('⛔ על המשימה שלו', x2 && x2.code === 'permission-denied');
  const x3 = await H.call(cb => fbR.createDoc('gardenTasks', '9100', { id: '9100', kind: 'דיווח תושב', title: 'x', stage: 'התקבל', schema: 1, repId: rid, workPhotos: ['z'] }, cb));
  ok('⛔ ביצירת משימה נלווית', x3 && x3.code === 'permission-denied');
  const x4 = await H.call(cb => fbG.mergeDoc('gardenTasks', tid, { workPhotos: Array.from({ length: 41 }, (_, i) => 'q' + i) }, cb));
  ok('⛔ יותר מ-40 תמונות', x4 && x4.code === 'permission-denied');

  section('5. סגירה עם סיבה + תמונה, ומכסה של 2');
  const r2 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'עץ נוטה', category: 'עצים', area: 'ציר מערבי', x: 0.2, y: 0.2, photos: [] }, cb));
  const t2 = String(r2.taskId);
  const before = ups('mgr');
  const cl = await H.call(cb => B('mgr').CBA.data.gardenTask('close', t2, { closure: 'לא רלוונטי', note: 'בדקנו, העץ יציב', photos: PH(3) }, cb));
  await tick();
  ok('נסגר "לא רלוונטי"', cl && cl.ok && store.gardenTasks[t2].closure === 'לא רלוונטי', JSON.stringify(cl));
  ok('🔑 מכסה: 3 נשלחו → 2 עלו', ups('mgr') - before === 2 && (store.gardenTasks[t2].workPhotos || []).length === 2, (ups('mgr') - before) + '/' + JSON.stringify(store.gardenTasks[t2].workPhotos));

  section('6. הערה/דיווח עם תמונה');
  const r3 = await H.call(cb => B('res2').CBA.data.submitGardenReport({ title: 'דשא יבש', category: 'מדשאות', area: 'ציר מזרחי', x: 0.3, y: 0.3, photos: [] }, cb));
  const t3 = String(r3.taskId);
  const n1 = await H.call(cb => B('gard').CBA.data.gardenTask('note', t3, { note: 'הממטרה נסתמה, ניקינו', photos: PH(1) }, cb));
  await tick();
  ok('נשמר', n1 && n1.ok, JSON.stringify(n1));
  ok('workPhotos על המשימה ועל הדיווח', (store.gardenTasks[t3].workPhotos || []).length === 1 && (store.gardenReports[String(r3.id)].workPhotos || []).length === 1);

  section('7. בלי תמונות — בדיוק כמו קודם');
  const before7 = ups('gard');
  const n2 = await H.call(cb => B('gard').CBA.data.gardenTask('note', t3, { note: 'עוד הערה' }, cb));
  ok('הערה בלי תמונה עוברת, בלי העלאה', n2 && n2.ok && n2.photosPending === 0 && ups('gard') === before7);

  section('8. השרת — מי רואה תמונה (authorize_ + gardenPhotoAllowed_ + handleGardenPhoto_ האמיתיים)');
  const CODE = R('apps-script/Code.gs');
  const fn = name => { const i = CODE.lastIndexOf('\nfunction ' + name + '('); const j = CODE.indexOf('\n}\n', i); return CODE.slice(i, j + 3); };
  const PERMS = {
    'g@x': { found: true, active: true, isExternal: true, isSuper: false, perms: ['גינון'], familyId: '' },
    'x@x': { found: true, active: true, isExternal: true, isSuper: false, perms: [], familyId: '' },
    'r1@x': { found: true, active: true, isExternal: false, isSuper: false, perms: [], familyId: 'F1' },
    'r2@x': { found: true, active: true, isExternal: false, isSuper: false, perms: [], familyId: 'F2' }
  };
  const sb = {
    PERM_GARDEN: 'גינון', PERM_ANY_ADMIN: '__any', RECEIPT_MAX_BYTES: 5e6, GARDEN_REPORTS_SHEET: 'y', FS_GARDEN_REPORTS: 'gardenReports',
    Logger: { log() {} }, String, Array, Object,
    verifySession_: s => s ? { email: s } : null,
    permissionsFor_: e => PERMS[e] || { found: false },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }) },
    fsQuery_: (c, f, op, v) => Object.keys(store[c] || {}).map(id => ({ id, data: H.deep(store[c][id]) })).filter(d => String(d.data[f]) === String(v)),
    GARDEN_PHOTOS_FOLDER_NAME: 'תמונות גינון',
    DriveApp: { getFileById: id => {
      /* קבלה יושבת בשורש הקבלות; תמונת גינון — בתת-תיקיית חודש של תיקיית הגינון. */
      const it = arr => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
      const folder = (name, parents) => ({ getName: () => name, getParents: () => it(parents || []) });
      const root = folder('קבלות');
      const parents = /^receipt/.test(id) ? [root] : [folder('2026-09', [folder('תמונות גינון', [root])])];
      return { getSize: () => 10, getName: () => id, getParents: () => it(parents),
               getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => [1] }) };
    } },
    Utilities: { base64Encode: () => 'AA==' },
    json_: o => o
  };
  vm.createContext(sb);
  ['authorize_', 'gardenPhotoAllowed_', 'gardenPhotoInFolder_', 'handleGardenPhoto_'].forEach(n => vm.runInContext(fn(n), sb));
  const tp = store.gardenTasks[tid].workPhotos[0];
  const see = (who, id) => sb.handleGardenPhoto_({ session: who, id: id });
  const IDLEN = s => s.length >= 10 ? s : (s + '__________').slice(0, 12);
  /* מזהי הרתמה קצרים; השרת דורש 10+ תווים — מרפדים גם במסמך. */
  store.gardenReports[rid].workPhotos = store.gardenReports[rid].workPhotos.map(IDLEN);
  store.gardenReports[rid].photos = ['resphoto_0001'];
  const wid = IDLEN(tp);
  ok('🔴 הגנן החיצוני רואה תמונת תושב', see('g@x', 'resphoto_0001').ok === true, JSON.stringify(see('g@x', 'resphoto_0001')));
  ok('🔴 והגנן רואה תמונת צוות', see('g@x', wid).ok === true);
  ok('⛔ חיצוני בלי הרשאת גינון — לא', see('x@x', 'resphoto_0001').ok === false);
  ok('🔴 התושב רואה את תמונת ה"אחרי" של הדיווח שלו (מ-Firestore)', see('r1@x', wid).ok === true, JSON.stringify(see('r1@x', wid)));
  ok('🔑 ואת התמונה שהוא עצמו צירף (דיווח חדש, שאין לו שורה בגיליון)', see('r1@x', 'resphoto_0001').ok === true);
  ok('⛔ תושב אחר — לא', see('r2@x', wid).ok === false);
  ok('⛔ מזהה שלא שייך לאף דיווח שלו — לא', see('r1@x', 'somebodyelse_01').ok === false);
  ok('🔴⛔ גנן אינו שולף קבלה מאותו שורש Drive לפי מזהה', see('g@x', 'receipt_000001').ok === false, JSON.stringify(see('g@x', 'receipt_000001')));
  ok('⛔ גם מנהל גינון פנימי — לא (רק מנהל-על פטור)', (PERMS['m@x'] = { found: true, active: true, isExternal: false, isSuper: false, perms: ['גינון'], familyId: 'F9' }, see('m@x', 'receipt_000001').ok === false));
  ok('🔴 שער doGet: ניסיון שני עם PERM_GARDEN רק ל-gardenPhoto',
     /if \(!topGate\.ok && getAction === 'gardenPhoto'\) \{\s*topGate = authorize_\(ssGate, e && e\.parameter, PERM_GARDEN\);/.test(CODE));

  section('9. המסך — מקור');
  const GT = R('js/screens/gardenTasks.js'), RG = R('js/screens/resGarden.js'), PHJ = R('js/ui/photos.js'), DL = R('js/ui/dialog.js'), RU = R('firestore.rules');
  ok('🔑 שגרה/יזומה: "בוצע" בלחיצה אחת', /if \(!isFault\(t\)\) return run\("done", id, \{\}\);/.test(GT));
  ok('🔑 תקלה = kind תושב או repId', /function isFault\(t\) \{ return !!t && \(t\.kind === GK_REPORT \|\| !!t\.repId\); \}/.test(GT));
  ok('חלון אחד עם בורר של 2 תמונות', /function askWithPhotos\(o\)[\s\S]{0,1200}CBA\.photos\.picker\(host, 2\)/.test(GT));
  ok('סגירה עם סיבה — בורר בחלון הסגירה', /whyPk = CBA\.photos\.picker\(whyPh, 2\)/.test(GT) && /photos: whyPk \? whyPk\.items\(\) : \[\]/.test(GT));
  ok('אישור מנהל עובר בחלון', (GT.match(/approveDone\(/g) || []).length >= 4);
  ok('הערה/דיווח על תקלה — בחלון, ותמונה מחייבת משפט', /m === "note" && isFault\(t\)[\s\S]{0,700}textWithPhotos: true/.test(GT));
  ok('photos.js מייצא picker', /picker: picker \};/.test(PHJ));
  ok('🔴 Enter ב-textarea אינו סוגר את החלון', /document\.activeElement\.tagName === "TEXTAREA"/.test(DL));
  ok('🔴 Enter בטופס עובר דרך onOk', /if \(opts\.onOk\) \{ opts\.onOk\(wrap, close\); return; \}\s*close\(opts\.input/.test(DL));
  ok('התושב: כפתור "תמונות מהצוות" רק על "בוצע"', /r\.closure === "בוצע" && \(r\.closeWhy \|\| \(r\.workPhotos/.test(RG) && /data-wphotos/.test(RG));
  ok('כללים: gtClosedOk מתיר workPhotos+updatedAt בלבד', /hasOnly\(\['workPhotos', 'updatedAt'\]\)/.test(RU));
  ok('כללים: workPhotos ב-gtTeamOnly וב-grTeamFields', /'openedBy', 'openedUid', 'workPhotos'\]/.test(RU) && /'canFeedback',[\s\S]{0,120}'workPhotos'\];/.test(RU));

  console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
