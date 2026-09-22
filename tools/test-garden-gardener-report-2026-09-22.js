'use strict';
/* ============================================================================
 *  22.9 — דיווח גנן, עריכה ע"י הפותח, ספירת "פתוחות", פריסטים, איחוד קטגוריות
 * ----------------------------------------------------------------------------
 *  בקשת יועד (8 סעיפים). הבדיקה מריצה את dataService.js האמיתי מול פורט של
 *  הכללים (tools/garden-sim), ואת פונקציית המיגרציה האמיתית מ-Code.gs מול
 *  גיליון ו-Firestore מדומים.
 * ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
const H = require('./garden-sim/harness');
const REPO = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(REPO, f), 'utf8');
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); } };
const section = s => console.log('\n' + s);

(async () => {
  const store = H.newStore();
  let now = new Date(2026, 8, 22, 10, 0, 0);
  const clock = { now: () => now };
  const Bs = {};
  const B = uid => (Bs[uid] = Bs[uid] || H.browser(store, uid, clock));
  const THIS = B('mgr').GardenRules.weekKey(now);

  section('1. הגנן פותח תקלה (סעיף 1)');
  const g1 = await H.call(cb => B('gard').CBA.data.gardenCreateTask({ title: 'ממטרה שבורה ליד 341', category: 'השקיה / ממטרות', area: 'ציר מזרחי', week: THIS, asReport: true, x: 0.3, y: 0.4, photos: [] }, cb));
  ok('נפתחה', g1 && g1.ok, JSON.stringify(g1));
  const gd = store.gardenTasks[String(g1.id)] || {};
  ok('🔴 openedBy = גנן', gd.openedBy === 'גנן', gd.openedBy);
  ok('🔑 openedUid = ה-uid של הגנן', gd.openedUid === 'gard', gd.openedUid);
  ok('⚠️ בלי repId — תקלת צוות, לא תושב', gd.repId === '');
  ok('ושבוע שהגנן בחר', gd.week === THIS && gd.stage === 'מתוכנן');

  const m1 = await H.call(cb => B('mgr').CBA.data.gardenCreateTask({ title: 'עץ נוטה', category: 'עצים', week: '', asReport: true, photos: [] }, cb));
  const md = store.gardenTasks[String(m1.id)] || {};
  ok('מנהל → openedBy = מנהל', m1.ok && md.openedBy === 'מנהל' && md.openedUid === 'mgr', JSON.stringify(md.openedBy));

  section('2. הכללים — הפותח הוא הכותב');
  const fbG = B('gard').CBA.fb;
  const forge = await H.call(cb => fbG.createDoc('gardenTasks', '9001', { id: '9001', kind: 'דיווח תושב', title: 'x', stage: 'התקבל', schema: 1, repId: '', openedBy: 'גנן', openedUid: 'mgr' }, cb));
  ok('⛔ גנן שמזייף openedUid של המנהל — נדחה', forge && forge.code === 'permission-denied', JSON.stringify(forge));
  const badRole = await H.call(cb => fbG.createDoc('gardenTasks', '9002', { id: '9002', kind: 'דיווח תושב', title: 'x', stage: 'התקבל', schema: 1, repId: '', openedBy: 'בוס' }, cb));
  ok('⛔ openedBy מחוץ לרשימה — נדחה', badRole && badRole.code === 'permission-denied');
  const fbR = B('res1').CBA.fb;
  const resForge = await H.call(cb => fbR.createDoc('gardenTasks', '9003', { id: '9003', kind: 'דיווח תושב', title: 'x', stage: 'התקבל', schema: 1, repId: '7', openedBy: 'מנהל' }, cb));
  ok('⛔ תושב אינו שולח openedBy (gtTeamOnly)', resForge && resForge.code === 'permission-denied');
  const upd = await H.call(cb => fbG.updateDoc('gardenTasks', String(g1.id), { openedUid: 'gard2' }, cb));
  ok('⛔ openedUid אינו משתנה אחרי היצירה', upd && upd.code === 'permission-denied');

  section('3. מי רשאי לערוך (סעיף 4)');
  const can = (uid, id) => B(uid).CBA.data.gardenCanEditTask(store.gardenTasks[String(id)]);
  ok('הגנן עורך את מה שהוא פתח', can('gard', g1.id));
  ok('⛔ הגנן אינו עורך תקלה של המנהל', !can('gard', m1.id));
  ok('🔑 המנהל עורך גם את של הגנן', can('mgr', g1.id));
  const r1 = await H.call(cb => B('res1').CBA.data.submitGardenReport({ title: 'דשא יבש', category: 'מדשאות', area: 'ציר מזרחי', x: 0.4, y: 0.5, photos: [] }, cb));
  ok('⛔ דיווח של תושב אינו נערך — גם לא למנהל', r1.ok && !can('mgr', r1.taskId));
  const routineish = { kind: 'שגרה', repId: '', title: 'x' };
  ok('⛔ שגרה אינה נערכת כאן', !B('mgr').CBA.data.gardenCanEditTask(routineish));
  ok('⛔ תקלה סגורה אינה נערכת', !B('mgr').CBA.data.gardenCanEditTask(Object.assign({}, gd, { closure: 'בוצע' })));

  section('4. עריכה בפועל');
  const e1 = await H.call(cb => B('gard').CBA.data.gardenEditTask(String(g1.id), { title: 'ממטרה שבורה — מול 341', category: 'מדשאות, השקיה וממטרות', area: 'ציר מערבי', week: '', x: 0.31, y: 0.41 }, cb));
  const gd2 = store.gardenTasks[String(g1.id)];
  ok('הגנן ערך', e1 && e1.ok, JSON.stringify(e1));
  ok('כותרת/קטגוריה/אזור עודכנו', gd2.title === 'ממטרה שבורה — מול 341' && gd2.category === 'מדשאות, השקיה וממטרות' && gd2.area === 'ציר מערבי');
  ok('🔑 ביטול השבוע מחזיר את השלב ל"התקבל"', gd2.week === '' && gd2.stage === 'התקבל', gd2.stage);
  ok('והמיקום זז', gd2.x === 0.31 && gd2.y === 0.41);
  ok('⚠️ openedBy/openedUid לא נגעו', gd2.openedBy === 'גנן' && gd2.openedUid === 'gard');
  const lg = Object.values(store.gardenLog).filter(l => l.taskId === String(g1.id) && l.kind === 'עריכה');
  ok('🔑 שורת "עריכה" ביומן עם מה שהשתנה', lg.length === 1 && /כותרת/.test(lg[0].note) && /שבוע/.test(lg[0].note), JSON.stringify(lg));
  const e2 = await H.call(cb => B('gard').CBA.data.gardenEditTask(String(m1.id), { title: 'x', category: 'עצים' }, cb));
  ok('⛔ הגנן נחסם בעריכת תקלה של המנהל', e2 && !e2.ok, JSON.stringify(e2));
  const e3 = await H.call(cb => B('mgr').CBA.data.gardenEditTask(String(g1.id), { title: 'מנהל תיקן', category: 'עצים', week: THIS }, cb));
  ok('המנהל ערך את של הגנן', e3 && e3.ok && store.gardenTasks[String(g1.id)].title === 'מנהל תיקן' && store.gardenTasks[String(g1.id)].stage === 'מתוכנן');

  section('5. המסך — מקור');
  const GT = R('js/screens/gardenTasks.js'), GF = R('js/ui/gardenForm.js'), CSS = R('css/garden.css');
  const GLANG = R('js/data/gardenLang.js'), RG = R('js/screens/resGarden.js');
  ok('🔴 "פתוחות" סופר רק את מה שמוצג (inOpenView)', /else if \(inOpenView\(t\)\) c\.open\+\+/.test(GT));
  ok('ו-inOpenView זהה לתנאי של openBody', /return \(week === todayKey\(\)\) \? \(t\.week <= week\) : \(t\.week === week\);/.test(GT) && /weekIsNow \? \(t\.week <= week\) : \(t\.week === week\)/.test(GT));
  ok('כפתור "משימה חדשה" גם לגנן במסלול הישיר', /isManager \|\| \(CBA\.data\.gardenDirectWrites && CBA\.data\.gardenDirectWrites\(\)\)/.test(GT));
  ok('⚠️ והגנן לא רואה את המתג "משימה חוזרת"', /noRepeat: !isManager/.test(GT) && /hideRep \? '' : swRow\("gf-rep"/.test(GF));
  ok('פינה ירוקה לגנן', /\.gt-row\.is-gard::after \{ border-top-color: var\(--gt-gard, #15803D\)/.test(CSS) && /" is-gard" : isTeamFault/.test(GT));
  ok('🔴 הדגל פי שניים — 26px', /border-top: 26px solid var\(--gt-res/.test(CSS) && /border-right: 26px solid transparent/.test(CSS));
  ok('פעולת "עריכה" בתפריט, לפי gardenCanEditTask', /gardenCanEditTask\(t\)[\s\S]{0,120}data-m="edit"/.test(GT) && /if \(m === "edit"\) return openEditTask\(t\);/.test(GT));
  ok('🔑 פריסטים בטופס הצוות מאותו מילון', /id="gf-tpicks"/.test(GF) && /CBA\.gardenLang\.TITLE_PICKS/.test(GF));
  ok('ו-resGarden קורא מאותו מקום (אין עותק)', /CBA\.gardenLang\.TITLE_PICKS/.test(RG) && !/"מדשאות": \["מדשאה יבשה"/.test(RG));

  section('6. איחוד הקטגוריות (סעיף 7)');
  const sb = { window: {} }; sb.window = sb; vm.createContext(sb); vm.runInContext(GLANG, sb);
  const L = sb.CBA.gardenLang;
  const merged = L.TITLE_PICKS['מדשאות, השקיה וממטרות'] || [];
  ok('🔴 השם החדש', L.CAT_LAWN_WATER === 'מדשאות, השקיה וממטרות');
  ok('🔑 כל ההצעות אוחדו (2 + 3)', merged.length === 5 && merged.includes('ראש ממטרה שבור') && merged.includes('עשב גבוה מדי'), merged.join('|'));
  ok('⚠️ השמות הישנים עדיין מציעים (עד שהמיגרציה תרוץ)', (L.TITLE_PICKS['מדשאות'] || []).length === 5 && (L.TITLE_PICKS['השקיה / ממטרות'] || []).length === 5);
  const CATS = /var CATS = \[([\s\S]*?)\];/.exec(GT)[1];
  const lawnRe = /key: "lawn",\s*match: (\/[^/]+\/)/.exec(CATS)[1];
  ok('🔴 ירוק: catOf מזהה את השם החדש כ-lawn (הראשון בטבלה)', new RegExp(lawnRe.slice(1, -1)).test('מדשאות, השקיה וממטרות') && CATS.indexOf('"lawn"') < CATS.indexOf('"water"'));

  /* המיגרציה האמיתית מ-Code.gs מול גיליון ו-Firestore מדומים */
  const CODE = R('apps-script/Code.gs');
  const fnSrc = (name) => { const i = CODE.indexOf('function ' + name + '('); let d = 0, j = CODE.indexOf('{', i); for (let k = j; k < CODE.length; k++) { if (CODE[k] === '{') d++; else if (CODE[k] === '}') { d--; if (!d) return CODE.slice(i, k + 1); } } };
  const settings = [['סוג', 'מזהה', 'סדר', 'ערך', 'פעיל', ''], ['אזור', 'A1', '1', 'ציר מזרחי', 'כן', ''], ['קטגוריה', 'C1', '1', 'מדשאות', 'כן', ''], ['קטגוריה', 'C2', '2', 'השקיה / ממטרות', 'כן', ''], ['קטגוריה', 'C3', '3', 'עצים', 'כן', '']];
  const tabs = { 'גינון — הגדרות': settings, 'גינון — משימות': [['מזהה', 'כותרת', 'קטגוריה'], ['1', 'מדשאות', 'מדשאות'], ['2', 'x', 'השקיה / ממטרות'], ['3', 'y', 'עצים']], 'גינון — דיווחים': [['מזהה', 'קטגוריה'], ['1', 'השקיה / ממטרות']], 'גינון — שגרה': [['מזהה', 'שם משימה', 'קטגוריה'], ['T1', 'כיסוח', 'מדשאות']] };
  const fsDocs = { gardenPlan: { T1: { category: 'מדשאות' } }, gardenTasks: { 1: { category: 'מדשאות' }, 2: { category: 'השקיה / ממטרות' }, 3: { category: 'עצים' } }, gardenReports: { 1: { category: 'השקיה / ממטרות' } } };
  let metaWritten = null;
  function sheetOf(name) {
    const v = tabs[name]; if (!v) return null;
    const range = (r, c, nr, nc) => ({
      getValues: () => v.slice(r - 1, r - 1 + (nr || 1)).map(row => row.slice(c - 1, c - 1 + (nc || 1))),
      setValue: x => { v[r - 1][c - 1] = x; },
      createTextFinder: (needle) => ({ matchEntireCell: () => ({ replaceAllWith: (rep) => { let n = 0; for (let i = r - 1; i < r - 1 + nr; i++) for (let j = c - 1; j < c - 1 + (nc || 1); j++) if (v[i][j] === needle) { v[i][j] = rep; n++; } return n; } }) })
    });
    return { getLastRow: () => v.length, getLastColumn: () => v[0].length, getDataRange: () => ({ getValues: () => v.map(r => r.slice()) }), getRange: range };
  }
  const srv = {
    GARDEN_SETTINGS_SHEET: 'גינון — הגדרות', GARDEN_ROUTINE_SHEET: 'גינון — שגרה', GARDEN_TASKS_SHEET: 'גינון — משימות', GARDEN_REPORTS_SHEET: 'גינון — דיווחים',
    FS_GARDEN_PLAN: 'gardenPlan', FS_GARDEN_TASKS: 'gardenTasks', FS_GARDEN_REPORTS: 'gardenReports', FS_GARDEN_META: 'gardenMeta/lists', GARDEN_FREQS: [],
    fsQuery_: (c, f, op, val) => Object.keys(fsDocs[c]).filter(id => fsDocs[c][id][f] === val).map(id => ({ id, data: fsDocs[c][id] })),
    fsMerge_: (p, o) => { const [c, id] = p.split('/'); Object.assign(fsDocs[c][decodeURIComponent(id)], o); },
    fsDocPath_: (c, id) => c + '/' + encodeURIComponent(id),
    fsSet_: (p, o) => { metaWritten = o; },
    SpreadsheetApp: { getActiveSpreadsheet: () => null }, Date, String, Object
  };
  vm.createContext(srv);
  vm.runInContext(['GARDEN_CAT_MERGED', 'GARDEN_CAT_MERGED_FROM'].map(n => (new RegExp('var ' + n + ' = [^;]+;')).exec(CODE)[0]).join('\n') + '\n' + fnSrc('gardenLists_') + '\n' + fnSrc('gardenMergeLawnWater_'), srv);
  const ss = { getSheetByName: sheetOf };
  const out = vm.runInContext('gardenMergeLawnWater_', srv)(ss);
  ok('המיגרציה הצליחה', out.ok, JSON.stringify(out.errors));
  ok('🔴 טאב ההגדרות: "מדשאות" → השם החדש, "השקיה" כבוי', settings[2][3] === 'מדשאות, השקיה וממטרות' && settings[3][4] === 'לא' && settings[3][3] === 'השקיה / ממטרות');
  ok('🔑 הרשימה החדשה נכתבה ל-gardenMeta/lists', metaWritten && JSON.stringify(metaWritten.categories) === JSON.stringify(['מדשאות, השקיה וממטרות', 'עצים']), JSON.stringify(metaWritten && metaWritten.categories));
  ok('עמודת הקטגוריה בטאבים עודכנה', tabs['גינון — משימות'][1][2] === 'מדשאות, השקיה וממטרות' && tabs['גינון — משימות'][2][2] === 'מדשאות, השקיה וממטרות' && tabs['גינון — דיווחים'][1][1] === 'מדשאות, השקיה וממטרות' && tabs['גינון — שגרה'][1][2] === 'מדשאות, השקיה וממטרות');
  ok('⚠️ כותרת שהיא במקרה "מדשאות" — לא נגעה (עמודה בלבד)', tabs['גינון — משימות'][1][1] === 'מדשאות');
  ok('🔴 Firestore — תוכנית, משימות ודיווחים, כולל היסטוריה', fsDocs.gardenPlan.T1.category === 'מדשאות, השקיה וממטרות' && fsDocs.gardenTasks[1].category === 'מדשאות, השקיה וממטרות' && fsDocs.gardenTasks[2].category === 'מדשאות, השקיה וממטרות' && fsDocs.gardenReports[1].category === 'מדשאות, השקיה וממטרות' && fsDocs.gardenTasks[3].category === 'עצים');
  const out2 = vm.runInContext('gardenMergeLawnWater_', srv)(ss);
  ok('🔑 אידמפוטנטית — ריצה שנייה לא מוצאת כלום', out2.ok && out2.settings === 0 && Object.values(out2.fs).every(n => n === 0) && Object.values(out2.sheet).every(n => n === 0), JSON.stringify(out2));
  ok('הפעולה רשומה: מסלול + מנהל-על', /action === 'gardenMergeCats'\) \{\s*return handleGardenMergeCats_/.test(CODE) && /gardenMergeCats: PERM_SUPER/.test(CODE) && /authorize_\(ss, p, PERM_SUPER\);[\s\S]{0,200}gardenMergeLawnWater_/.test(CODE));
  ok('ברירות המחדל בקוד — בלי "השקיה / ממטרות" פעילה', !/\['קטגוריה', 'C2', '2', 'השקיה \/ ממטרות'/.test(CODE) && /\['קטגוריה', 'C1', '1', 'מדשאות, השקיה וממטרות'/.test(CODE));
  ok('🔴 הגנן מעלה תמונות (שער שני עם PERM_GARDEN)', /if \(!gate\.ok\) gate = authorize_\(ss, body, PERM_GARDEN\);/.test(fnSrc('gardenPhotoOne_')));

  section('7. טופס הצוות = טופס התושב (22.9, סבב 2)');
  ok('🔴 "מה הבעיה?" ראשון, "כותרת קצרה" אחריו', GF.indexOf("'מה הבעיה? <s>*</s>'") !== -1 && GF.indexOf("'כותרת קצרה'") > GF.indexOf("'מה הבעיה? <s>*</s>'") && GF.indexOf('id="gf-cats"') < GF.indexOf('id="gf-title"'));
  ok('🔑 הקפסולות מעל שדה ההקלדה, כמו אצל התושב', GF.indexOf('id="gf-tpicks"') < GF.indexOf('id="gf-title"'));
  ok('ואותן הנחיות', /בחרו קטגוריה כדי לראות הצעות/.test(GF) && /אפשר גם פשוט להקליד למטה/.test(GF));
  ok('⚠️ 60 תווים בתקלה (כמו השרת), 80 בתוכנית', /maxlength="' \+ \(isPlan \? 80 : 60\)/.test(GF) && /ti\.maxLength = st\.repeat \? 80 : 60/.test(GF));

  section('8. תיאור ומיקום במילים — גלויים לכולם');
  const r9 = await H.call(cb => B('res2').CBA.data.submitGardenReport({ title: 'עץ נוטה', category: 'עצים', desc: 'העץ השלישי משמאל נוטה על הגדר', place: 'מאחורי 608', photos: [] }, cb));
  const t9 = store.gardenTasks[String(r9.taskId)] || {};
  ok('🔴 התיאור של התושב מגיע למשימה', r9.ok && t9.desc === 'העץ השלישי משמאל נוטה על הגדר', JSON.stringify(r9));
  ok('וגם המיקום במילים', t9.place === 'מאחורי 608');
  const m9 = await H.call(cb => B('mgr').CBA.data.gardenCreateTask({ title: 'גזם', category: 'עצים', desc: 'ערימה ליד המחסן', place: 'ליד המחסן', asReport: true, photos: [] }, cb));
  const mt9 = store.gardenTasks[String(m9.id)] || {};
  ok('🔑 גם בתקלה שהצוות פותח', m9.ok && mt9.desc === 'ערימה ליד המחסן' && mt9.place === 'ליד המחסן');
  const e9 = await H.call(cb => B('mgr').CBA.data.gardenEditTask(String(m9.id), { title: 'גזם', category: 'עצים', desc: 'פונה חלקית', place: '' }, cb));
  ok('ונערך', e9.ok && store.gardenTasks[String(m9.id)].desc === 'פונה חלקית' && store.gardenTasks[String(m9.id)].place === '');
  const RULES = R('firestore.rules');
  ok('🔴 כללים: desc/place ב-gtFields וב-gtTeamUpdateOk, עם גבול אורך', /'desc', 'place'\];/.test(RULES) && /'mergedReps',\s*'desc', 'place'\]\) &&\s*gtTextOk\(\);/.test(RULES) && /function gtTextOk\(\)[\s\S]{0,300}size\(\) <= 1000/.test(RULES));
  ok('כרטיס הפרטים מציג תיאור ו"איפה"', /t\.desc \? '<p class="gd-det-desc">'/.test(GT) && /<span class="l">איפה<\/span>/.test(GT));
  ok('🔑 טופס הצוות: תיאור עם מונה 75 מילים, כמו אצל התושב', /id="gf-desc"/.test(GF) && /var WORD_MAX = 75;/.test(GF) && /id="gf-place"/.test(GF));
  ok('השלמה לאחור בשרת: פעולה למנהל-על', /action === 'gardenBackfillText'/.test(CODE) && /gardenBackfillText: PERM_SUPER/.test(CODE) && /fsList_\(FS_GARDEN_REPORTS\)/.test(fnSrc('gardenBackfillText_')));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
