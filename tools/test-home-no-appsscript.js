
/* בדיקות לצעד 12 — הסיור והשריון הקרוב עוברים ל-Firestore (2026-09-16).
   הרצה:  node tools/test-home-no-appsscript.js

   🔴🔴 מה המארז שומר עליו:
     1. **אימייל והערה לא נוסעים.** מסמך שריון נושא שלושה שדות בלבד.
        ההערה היא טקסט חופשי שהתושב כתב על עצמו, ואינה ברשימת ההיתר.
     2. **שם משפחה כפול אינו מזהה.** שתי משפחות "כהן" הן שני משקי בית;
        שיוך לפי שם היה דליפה, לא אי-דיוק.
     3. **ביטול חייב לרוקן את המסמך** — אחרת "ביטלתי וזה עדיין שם".
     4. **קהל "תושבים" לא נכתב** — בשרת איש אינו רואה אותו.
     5. **הציור המהיר לא מסתיר כישלון** — אבל מסמך שריון חסר הוא
        תשובה תקפה (אין שריונים), ולא כישלון. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DS = R('js/data/dataService.js');
const HOME = R('js/screens/home.js');
const RULES = R('firestore.rules');
const grab = re => { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };

const DAY = 24 * 3600 * 1000, NOW = Date.now();
function ev(startDays, endDays, tags) {
  tags = tags || {};
  return { getId: () => 'e' + startDays,
           getStartTime: () => new Date(NOW + startDays * DAY),
           getEndTime: () => new Date(NOW + endDays * DAY),
           getTag: k => (tags[k] === undefined ? null : tags[k]) };
}

function serverBox(opts) {
  opts = opts || {};
  const log = { writes: [], deletes: [], lists: 0 };
  const box = {
    String, Number, Date, JSON, parseInt, isNaN, Object,
    RESIDENT_ID_HEADER: 'מזהה קבוע', PERM_HEADER: 'הרשאות', FB_UID_HEADER: 'מזהה Firebase',
    TOUR_SEEN_HEADER: 'סיור נצפה', TOUR_SHEET: 'סיור היכרות',
    PERM_SUPER: 'על', PERM_BUDGET: 'תקציב', PERM_CLUB: 'מועדון',
    PERM_GYM: 'מכון', PERM_GARDEN: 'גינון', PERM_RESIDENTS: 'תושבים',
    CLUB_BACK_DAYS_ALL: 7, CLUB_BACK_DAYS_MINE: 1, CLUB_FWD_DAYS: 180,
    normalizeEmail_: e => String(e || '').trim().toLowerCase(),
    residentSlotCols_: () => ({ email: [1, 2], perm: [], uid: [4, 5] }),
    clubStatusOf_: e => String(e.getTag('status') || 'approved'),
    clubClipEvents_: (evs, back) => evs.filter(e => e.getEndTime().getTime() > NOW - back * DAY),
    clubWindowEvents_: () => opts.events || [],
    ensureTourSheet_: () => ({}),
    readTable_: () => opts.tourRows || [],
    fsSet_: (p, doc) => log.writes.push({ path: p, doc }),
    fsWriteAll_: (c, items, out, live) => items.forEach(it => {
      live[it.id] = 1; out.wrote++; log.writes.push({ path: c + '/' + it.id, doc: it.doc }); }),
    fsSweepOrphans_: (c, live, out) => { log.lists++;
      (opts.existing || []).forEach(id => { if (!live[id]) { out.deleted++; log.deletes.push(c + '/' + id); } }); },
    SpreadsheetApp: { getActiveSpreadsheet: () => opts.ss || null }
  };
  vm.createContext(box);
  vm.runInContext([
    grab(/function residentIdentityIndex_\(ss\) \{[\s\S]*?\n\}/),
    grab(/var FS_CLUB_RESV = 'clubReservations';/),
    grab(/function clubResvItem_\(ev\) \{[\s\S]*?\n\}/),
    grab(/function clubResvFamilyOf_\(idx, ev\) \{[\s\S]*?\n\}/),
    grab(/function clubResvGroup_\(idx, evs, out\) \{[\s\S]*?\n\}/),
    grab(/function clubResvDoc_\(items\) \{[\s\S]*?\n\}/),
    grab(/function clubResvSyncAll_\(ss\) \{[\s\S]*?\n\}/),
    grab(/function clubResvBumpFamily_\(ss, familyId\) \{[\s\S]*?\n\}/),
    grab(/var FS_TOUR = 'tourSteps';[\s\S]*?TOUR_PERM_DOC\[PERM_GARDEN\][^\n]*\n/),
    grab(/function tourAudDocId_\(aud\) \{[\s\S]*?\n\}/),
    grab(/function tourStepCompare_\(a, b\) \{[\s\S]*?\n\}/),
    grab(/function tourSyncAll_\(ss\) \{[\s\S]*?\n\}/),
    grab(/function tourSeenSyncAll_\(ss\) \{[\s\S]*?\n\}/)
  ].join('\n\n'), box);
  return { box, log };
}

function residentsSheet(rows) {
  const headers = ['מזהה קבוע', 'אימייל 1', 'אימייל 2', 'משפחה', 'מזהה Firebase 1',
                   'מזהה Firebase 2', 'בית', 'סיור נצפה'];
  return { getSheetByName: n => (n === 'תושבים' ? {
    getLastRow: () => rows.length + 1,
    getLastColumn: () => headers.length,
    getRange: (r, c, nr, nc) => ({ getValues: () =>
      (r === 1 ? [headers] : rows.slice(r - 2, r - 2 + nr)) })
  } : null) };
}
const ROWS = [
  ['1', 'a@x.com', '', 'גולן', 'uidA', '', '10', 3],
  ['2', 'b@x.com', '', 'כהן', 'uidB', '', '11', 0],
  ['3', 'c@x.com', '', 'כהן', '', '', '12', 5],
  ['4', 'd@x.com', 'e@x.com', 'לוי', 'uidD', 'uidE', '13', 2]
];

section('1. 🔴🔴 מפת הזהות — ושם משפחה כפול שאינו מזהה');
{
  const s = serverBox();
  const idx = s.box.residentIdentityIndex_(residentsSheet(ROWS));
  ok('אימייל → מזהה משפחה', idx.byEmail['a@x.com'] === '1' && idx.byEmail['e@x.com'] === '4',
     JSON.stringify(idx.byEmail));
  ok('אימייל → uid', idx.uidByEmail['a@x.com'] === 'uidA' && idx.uidByEmail['e@x.com'] === 'uidE',
     JSON.stringify(idx.uidByEmail));
  ok('שם ייחודי → מזהה', idx.byFamName['גולן'] === '1');
  ok('🔴🔴 ושם כפול **הוסר לגמרי** ולא נבחר שרירותית',
     idx.byFamName['כהן'] === undefined, JSON.stringify(idx.byFamName));
  ok('"מה כבר ראיתי" לפי uid', idx.seenByUid['uidA'] === 3 && idx.seenByUid['uidD'] === 2,
     JSON.stringify(idx.seenByUid));
  ok('⚠️ אין טאב ⇒ מפות ריקות, לא חריגה',
     Object.keys(s.box.residentIdentityIndex_({ getSheetByName: () => null }).byEmail).length === 0);
}

section('2. 🔴 מסמך השריון — שלושה שדות, ולא יותר');
{
  const s = serverBox();
  const item = s.box.clubResvItem_(ev(2, 2.1, { email: 'a@x.com', family: 'גולן',
                                                note: 'ברית לבן', status: 'pending' }));
  ok('🔴🔴 אין אימייל במסמך', item.email === undefined, JSON.stringify(item));
  ok('🔴🔴 ואין הערה', item.note === undefined, JSON.stringify(item));
  ok('🔴 ואין מזהה משפחה בתוך הפריט (הוא מזהה המסמך)', item.family === undefined);
  ok('שלושת השדות בלבד',
     JSON.stringify(Object.keys(item).sort()) === JSON.stringify(['end', 'start', 'status']),
     Object.keys(item).join(','));
}

section('3. השיוך — אימייל קודם, שם כנפילה לאחור');
{
  const s = serverBox();
  const idx = s.box.residentIdentityIndex_(residentsSheet(ROWS));
  const evs = [
    ev(1, 1.1, { email: 'a@x.com', family: 'גולן', status: 'approved' }),
    ev(2, 2.1, { family: 'גולן' }),
    ev(3, 3.1, { family: 'כהן' }),
    ev(-5, -4.9, { email: 'a@x.com', family: 'גולן' })
  ];
  const out = { skipped: 0 };
  const byFam = s.box.clubResvGroup_(idx, evs, out);
  ok('שיוך לפי אימייל, ובחלון של התושב', (byFam['1'] || []).length === 2,
     JSON.stringify(Object.keys(byFam)));
  ok('🔴🔴 ואירוע עם שם מעורפל **מדולג ונספר**, לא משויך לניחוש',
     out.skipped === 1 && byFam['2'] === undefined && byFam['3'] === undefined,
     JSON.stringify({ skipped: out.skipped, keys: Object.keys(byFam) }));
  ok('והרשימה ממוינת לפי זמן', (byFam['1'] || [])[0].start < (byFam['1'] || [])[1].start);
}

section('4. 🔴 ביטול — המסמך מתרוקן, לא נשאר עם הישן');
{
  const evs = [ev(1, 1.1, { email: 'a@x.com', family: 'גולן' })];
  const s = serverBox({ events: evs, ss: residentsSheet(ROWS) });
  s.box.clubResvBumpFamily_(residentsSheet(ROWS), '2');
  const w = s.log.writes[0];
  ok('🔴🔴 נכתב מסמך **ריק** למשפחה שאין לה שריונים',
     w && w.path === 'clubReservations/2' && w.doc.items.length === 0, JSON.stringify(s.log.writes));
  const s2 = serverBox({ events: evs, ss: residentsSheet(ROWS) });
  s2.box.clubResvBumpFamily_(residentsSheet(ROWS), '');
  ok('⚠️ מזהה ריק ⇒ לא נכתב כלום', s2.log.writes.length === 0);
  const s3 = serverBox({ events: evs, ss: residentsSheet(ROWS) });
  s3.box.fsSet_ = () => { throw new Error('boom'); };
  let threw = false;
  try { s3.box.clubResvBumpFamily_(residentsSheet(ROWS), '1'); } catch (e) { threw = true; }
  ok('🔴🔴 וכשל כתיבה אינו זורק אל נתיב השמירה', !threw);
}

section('5. סנכרון מלא — כתיבה וסחיפה');
{
  const evs = [ev(1, 1.1, { email: 'a@x.com', family: 'גולן' }),
               ev(2, 2.1, { email: 'd@x.com', family: 'לוי' })];
  const s = serverBox({ events: evs, ss: residentsSheet(ROWS), existing: ['1', '4', '9'] });
  const out = s.box.clubResvSyncAll_(residentsSheet(ROWS));
  ok('שתי משפחות נכתבו', out.wrote === 2, JSON.stringify(out));
  ok('🔴 ומשפחה שאין לה יותר שריונים נסחפה',
     out.deleted === 1 && s.log.deletes[0] === 'clubReservations/9', JSON.stringify(s.log.deletes));
  ok('⚠️ הסנכרון המלא סוחף ולכן חייב נעילה',
     /חובה לרוץ בתוך `withSyncLock_`/.test(GS));
  ok('⚠️ והרענון הנקודתי **אינו** סוחף',
     !/function clubResvBumpFamily_[\s\S]{0,700}fsSweepOrphans_/.test(GS));
}

section('6. 🔴 הסיור — מסמך לכל קהל, ו"תושבים" שאינו נכתב');
{
  const s = serverBox();
  ok('כולם → all', s.box.tourAudDocId_('כולם') === 'all');
  ok('ריק → all (ברירת מחדל כמו בשרת)', s.box.tourAudDocId_('') === 'all');
  ok('מנהלים → admins', s.box.tourAudDocId_('מנהלים') === 'admins');
  ok('גינון → perm-garden', s.box.tourAudDocId_('גינון') === 'perm-garden');
  ok('🔴🔴 "תושבים" → אין מסמך בכלל', s.box.tourAudDocId_('תושבים') === '');
  ok('⚠️ וקהל לא מוכר → אין מסמך', s.box.tourAudDocId_('משהו') === '');
}

section('7. סנכרון הסיור — סינון, קיבוץ ומיון');
{
  const rows = [
    { 'מזהה': 'a', 'קהל': 'כולם', 'פעיל': 'כן', 'גרסה': 2, 'סדר': 1 },
    { 'מזהה': 'b', 'קהל': 'כולם', 'פעיל': 'כן', 'גרסה': 1, 'סדר': 9 },
    { 'מזהה': 'c', 'קהל': 'מנהלים', 'פעיל': 'כן', 'גרסה': 1, 'סדר': 1 },
    { 'מזהה': 'd', 'קהל': 'כולם', 'פעיל': 'לא', 'גרסה': 1, 'סדר': 2 },
    { 'מזהה': 'e', 'קהל': 'תושבים', 'פעיל': 'כן', 'גרסה': 1, 'סדר': 1 }
  ];
  const s = serverBox({ tourRows: rows, existing: ['all', 'admins', 'perm-club'] });
  const out = s.box.tourSyncAll_({});
  const all = s.log.writes.find(w => w.path === 'tourSteps/all');
  ok('שני מסמכים נכתבו', out.wrote === 2, JSON.stringify(out));
  ok('🔴 צעד לא-פעיל לא נכתב', all.doc.steps.every(x => x['מזהה'] !== 'd'));
  ok('🔴🔴 וקהל "תושבים" לא נכתב לשום מסמך',
     !s.log.writes.some(w => JSON.stringify(w.doc).indexOf('"e"') !== -1));
  ok('שניהם נספרו כמדולגים', out.skipped === 2, String(out.skipped));
  ok('🔴 והמיון הוא גרסה ואז סדר',
     all.doc.steps[0]['מזהה'] === 'b' && all.doc.steps[1]['מזהה'] === 'a',
     all.doc.steps.map(x => x['מזהה']).join(','));
  ok('⚠️ ומסמך קהל שכבר אין לו צעדים נסחף', out.deleted === 1);
}

section('8. "מה כבר ראיתי" — מסמך לכל uid');
{
  const s = serverBox();
  const out = s.box.tourSeenSyncAll_(residentsSheet(ROWS));
  const w = s.log.writes.find(x => x.path === 'tourSeen/uidA');
  ok('נכתב מסמך לכל uid שיש בגיליון', out.wrote === 4, JSON.stringify(out));
  ok('והערך הוא המספר מהגיליון', w && w.doc.v === 3, JSON.stringify(w));
  ok('🔴 ו-markTourSeen כותב מיד, לא ממתין לסנכרון השעתי',
     /sh\.getRange\(r\.rowIndex, col\)\.setValue\(n\);[\s\S]{0,300}tourSeenBump_\(ss, body\._email, n\)/.test(GS));
}

section('9. הלקוח — getTourFast');
{
  const src = DS.match(/function getTourFast\(cb\) \{[\s\S]*?\n  \}/)[0];
  const helpers = [
    DS.match(/var TOUR_FROM_FIRESTORE = (true|false);/)[0],
    DS.match(/var TOUR_PERM_DOC = \{[\s\S]*?\};/)[0],
    DS.match(/function tourDocIdsForMe\(\) \{[\s\S]*?\n  \}/)[0],
    DS.match(/function tourStepCompare\(a, b\) \{[\s\S]*?\n  \}/)[0],
    DS.match(/function fsReady\(cb\) \{[\s\S]*?\n  \}/)[0]
  ].join('\n');
  function run(opts) {
    const reads = [];
    const docs = opts.docs || {};
    const box = { String, Number, Date, JSON, parseInt, isNaN, Object, console: { log() {} },
      CBA: { perms: opts.perms || [], isSuper: !!opts.isSuper, fb: {
        uid: () => opts.uid || 'u1',
        readDoc: (c, id, f) => { reads.push(c + '/' + id);
          const d = docs[c + '/' + id];
          f(d === undefined ? { code: 'denied' } : null, d === undefined ? null : d); },
        ensureDb: f => f(null), authReady: f => f({ uid: 'u1' }),
        flag: (k, d) => (opts.flag === undefined ? d : opts.flag) } } };
    box.window = box;
    vm.createContext(box);
    vm.runInContext(helpers + '\n' + src + '\nvar __r=null; getTourFast(function(r){__r=r;});', box);
    return { r: box.__r, reads };
  }
  const plain = run({ flag: true, docs: { 'tourSteps/all': { steps: [{ 'גרסה': 1, 'סדר': 1, 'מזהה': 'x' }] },
                                          'tourSeen/u1': { v: 2 } } });
  ok('תושב רגיל מבקש רק את all (ואת "מה ראיתי")',
     JSON.stringify(plain.reads.slice().sort()) === JSON.stringify(['tourSeen/u1', 'tourSteps/all']),
     JSON.stringify(plain.reads));
  ok('והתשובה בצורת action=tour',
     plain.r && plain.r.ok === true && plain.r.seen === 2 && plain.r.steps.length === 1,
     JSON.stringify(plain.r));
  const gard = run({ flag: true, perms: ['גינון'], docs: { 'tourSteps/all': { steps: [] } } });
  ok('🔴 בעל הרשאת גינון מבקש גם admins וגם perm-garden, ולא perm-club',
     gard.reads.indexOf('tourSteps/admins') !== -1 &&
     gard.reads.indexOf('tourSteps/perm-garden') !== -1 &&
     gard.reads.indexOf('tourSteps/perm-club') === -1, JSON.stringify(gard.reads));
  const sup = run({ flag: true, isSuper: true, docs: { 'tourSteps/all': { steps: [] } } });
  ok('🔴 ומנהל-על מבקש את כל מסמכי ההרשאות — כמו hasPerm בשרת',
     sup.reads.filter(x => x.indexOf('perm-') !== -1).length === 5, JSON.stringify(sup.reads));
  const none = run({ flag: true, docs: {} });
  ok('🔴🔴 אף מסמך לא נקרא ⇒ null ⇒ נפילה לאחור ל-homeExtras', none.r === null);
  const off = run({ flag: false, docs: { 'tourSteps/all': { steps: [] } } });
  ok('דגל כבוי ⇒ null ואפס קריאות', off.r === null && off.reads.length === 0);
  const sorted = run({ flag: true, perms: ['גינון'], docs: {
    'tourSteps/all': { steps: [{ 'גרסה': 3, 'סדר': 1, 'מזהה': 'late' }] },
    'tourSteps/admins': { steps: [{ 'גרסה': 1, 'סדר': 2, 'מזהה': 'early' }] },
    'tourSteps/perm-garden': { steps: [{ 'גרסה': 1, 'סדר': 1, 'מזהה': 'first' }] } } });
  ok('🔴 המיזוג ממוין לפי גרסה ואז סדר — כמו בשרת',
     sorted.r.steps.map(x => x['מזהה']).join(',') === 'first,early,late',
     sorted.r.steps.map(x => x['מזהה']).join(','));
}

section('10. הלקוח — getClubResvFast');
{
  const src = DS.match(/function getClubResvFast\(cb\) \{[\s\S]*?\n  \}/)[0];
  const helpers = [DS.match(/var CLUB_RESV_FROM_FIRESTORE = (true|false);/)[0],
                   DS.match(/function fsReady\(cb\) \{[\s\S]*?\n  \}/)[0]].join('\n');
  function run(opts) {
    const reads = [];
    const box = { String, Number, Date, JSON, Object, console: { log() {} },
      CBA: { user: opts.user || { familyId: '7' }, fb: {
        readDoc: (c, id, f) => { reads.push(c + '/' + id); f(opts.err || null, opts.doc || null); },
        ensureDb: f => f(null), authReady: f => f({ uid: 'u1' }),
        flag: (k, d) => (opts.flag === undefined ? d : opts.flag) } } };
    box.window = box;
    vm.createContext(box);
    vm.runInContext(helpers + '\n' + src + '\nvar __r="NONE"; getClubResvFast(function(r){__r=r;});', box);
    return { r: box.__r, reads };
  }
  const got = run({ flag: true, doc: { items: [{ start: 'a', end: 'b', status: 'approved' }] } });
  ok('קורא את המסמך של המשפחה שלי', got.reads[0] === 'clubReservations/7', JSON.stringify(got.reads));
  ok('ומחזיר בצורת myClubReservations', got.r.ok === true && got.r.reservations.length === 1);
  const empty = run({ flag: true, doc: null });
  ok('🔴🔴 אין מסמך = **אין שריונים**, לא כישלון',
     empty.r && empty.r.ok === true && empty.r.reservations.length === 0, JSON.stringify(empty.r));
  const denied = run({ flag: true, err: { code: 'denied' } });
  ok('🔴 דחיית הרשאה ⇒ null ⇒ המסלול הישן', denied.r === null);
  const nofam = run({ flag: true, user: { familyId: '' } });
  ok('⚠️ בלי מזהה משפחה ⇒ null בלי לגעת ב-SDK', nofam.r === null && nofam.reads.length === 0);
  const off = run({ flag: false, doc: { items: [] } });
  ok('דגל כבוי ⇒ null', off.r === null && off.reads.length === 0);
}

section('11. 🔴🔴 עמוד הבית — הקריאה הקובעת מחכה למהירים');
ok('יש שער שממתין לשלושתם', /function seedHomeFast\(container, done\)/.test(HOME) &&
   /var left = 3, fired = false;/.test(HOME));
ok('🔴🔴 ו-primeHomeExtras נקראת **בתוך** ה-done שלו',
   /seedHomeFast\(container, function \(\) \{\s*\n\s*primeHomeExtras\(function \(\) \{/.test(HOME));
ok('🔴 ויש גג זמן — קריאה שנתקעת לא משאירה את העמוד בלי המסלול הישן',
   /var FAST_WAIT_MS = 1200;/.test(HOME) && /setTimeout\(settle, FAST_WAIT_MS\);/.test(HOME));
ok('⚠️ והגג יורה פעם אחת בלבד',
   /function settle\(\) \{ if \(fired\) return; fired = true; done\(\); \}/.test(HOME));
ok('הסיור מוזרע דרך נקודת הכניסה הקיימת', /if \(res && res\.ok\) CBA\.tour\.seed\(res\);/.test(HOME));
ok('🔴 והשריון מצויר באותה paintNext כמו המסלול הישן',
   /paintNext\(slot, resvCache\.list\);/.test(HOME) && /resvCache\.ts = Date\.now\(\);/.test(HOME));

section('12. 🔴 הכללים — שלושת האוספים החדשים');
ok('clubReservations לפי מזהה משפחה בלבד',
   /match \/clubReservations\/\{fid\}\s*\{\s*allow read: if canSeeClubResv\(fid\);/.test(RULES));
ok('🔴🔴 והמחרוזת הריקה חסומה',
   /function canSeeClubResv\(fid\)[\s\S]{0,220}fid != '' && fid == myFamilyId\(\)/.test(RULES));
ok('tourSteps לפי מזהה קהל',
   /match \/tourSteps\/\{id\}\s*\{\s*allow read: if canSeeTourDoc\(id\);/.test(RULES));
ok('🔴🔴 ואין כלל ל-perm-residents — הקהל שאיש אינו רואה',
   !/id == 'perm-residents'/.test(RULES));
ok('🔴 "מנהלים" נבדק מול הרשאה אמיתית ולא מול signedIn',
   /function isAdminUser\(\)[\s\S]{0,160}isSuper\(\) \|\| m\(\)\.perms\.size\(\) > 0/.test(RULES));
ok('tourSeen — כל אחד את שלו',
   /function canSeeTourSeen\(uid\)[\s\S]{0,160}request\.auth\.uid == uid/.test(RULES));
ok('🔴 ושלושתם אסורים בכתיבה מהדפדפן',
   (RULES.match(/allow write: if false;/g) || []).length >= 12);

section('13. החיווט בשרת');
ok('שלושת הסנכרונים בעבודה השעתית',
   /function hourlyJobsRun_[\s\S]{0,8000}tourSyncAll_\(ss\)[\s\S]{0,400}clubResvSyncAll_\(ss\)/.test(GS));
const nFam = (GS.match(/clubResvBumpFamily_\(SpreadsheetApp/g) || []).length;
const nEv  = (GS.match(/clubResvBumpEvent_\(ss,/g) || []).length;
ok('🔴 והשריון מתרענן אחרי כל אחת מארבע הכתיבות',
   nFam === 2 && nEv === 3, 'family=' + nFam + ' event=' + nEv);
/* ⚠️ nEv הוא 3 ולא 2: ההגדרה עצמה נספרת יחד עם שני אתרי הקריאה
   (אישור ודחייה). הבדיקה הבאה היא זו שמוודאת שהם האתרים הנכונים. */
ok('⚠️ ובדחייה התגיות נלקחות לפני המחיקה',
   GS.indexOf("var rejFamily = ev.getTag('family')") < GS.indexOf('clubResvBumpEvent_(ss, rejEmail, rejFamily)'));
ok('פעולת הזריעה קיימת, מוגנת, ורצה בתוך נעילה',
   /function handleHomeSync_[\s\S]{0,300}authorize_\(ss, p, PERM_SUPER\)/.test(GS) &&
   /withSyncLock_\('homeSync'/.test(GS) && /homeSync: PERM_SUPER/.test(GS));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
