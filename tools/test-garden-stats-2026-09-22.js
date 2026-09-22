/* מסך "נתוני גינון" — המנוע, "נגררה" בשתי רמות, והחיווט   (22.9.2026)
   הרצה:  node tools/test-garden-stats-2026-09-22.js

   🔑 כל הגדרה מהאפיון (סעיף 2 + 3 + 4) נבדקת כאן מול נתונים שנבנו
      במיוחד כדי **להיכשל** אם ההגדרה שגויה — למשל תקלה שנפתחה מחדש על ידי
      הגנן (אסור שתיספר), או שגרה שנדחתה ובוצעה אחר כך (חייבת להיספר).
   ⚠️ הבדיקות רצות על gardenLang.js ו-gardenStatsCalc.js האמיתיים (vm), לא
      על העתק. השעון קבוע: יום ג' 22.9.2026, 10:00. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(R('js/data/gardenLang.js'), ctx);
vm.runInContext(R('js/data/gardenStatsCalc.js'), ctx);
const L = ctx.window.CBA.gardenLang;
const C = ctx.window.CBA.gardenStatsCalc;

const NOW = new Date(2026, 8, 22, 10, 0, 0);          // שלישי
const CUR = '2026-09-20';                               // יום ראשון של השבוע
const d = (y, m, dd, h) => new Date(y, m - 1, dd, h || 9, 0, 0);
const REP = 'דיווח תושב', ROU = 'שגרה';

section('1. "נגררה" בשתי רמות — gardenLang.drag');
ok('השבוע הנוכחי — בלי תג', L.drag({ week: CUR }, CUR).level === 0);
ok('🔴 השבוע עבר ולא סומנה — ורוד (גם בלי דחייה ידנית)', L.drag({ week: '2026-09-13' }, CUR).level === 1);
ok('🔴 דחייה ידנית לשבוע הבא — ורוד מיד (הכרעה, סעיף 8)',
   L.drag({ week: '2026-09-27', firstWeek: CUR, flag: 'נגררה' }, CUR).level === 1);
ok('שבועיים — אדום, "נגררה שבועיים"', (x => x.level === 2 && x.text === 'נגררה שבועיים')(L.drag({ week: '2026-09-06' }, CUR)));
ok('שובץ ל-31.8 ועדיין פתוח — "נגררה 3 שבועות" (הדוגמה מהאפיון)',
   L.drag({ week: '2026-08-30' }, CUR).text === 'נגררה 3 שבועות', L.drag({ week: '2026-08-30' }, CUR));
ok('נמדד בשבועות ולא בפעמים — drags:5 בשבוע הנוכחי אינו נגרר', L.drag({ week: CUR, firstWeek: CUR, drags: 5 }, CUR).level === 0);
ok('סגורה — בלי תג', L.drag({ week: '2026-08-30', closure: 'בוצע' }, CUR).level === 0);
ok('בלי שבוע — בלי תג (נמדדת בגיל)', L.drag({ week: '' }, CUR).level === 0);
ok('ממתינה לאישור — בלי תג (העבודה נעשתה)', L.drag({ week: '2026-08-30', flag: 'ממתין לאישור' }, CUR).level === 0);
ok('weekOf — יום ראשון', L.weekOf(NOW) === CUR, L.weekOf(NOW));

/* ------------------------------------------------------------------ נתונים */
const T = [
  // תקלות פתוחות
  { id: '1', kind: REP, repId: '41', category: 'מדשאות, השקיה וממטרות', title: 'ראש ממטרה שבור', area: 'ציר מזרחי',
    week: '2026-08-30', createdAt: d(2026, 8, 28), x: .7, y: .6 },                                 // 25 ימים, נגררה 3
  { id: '2', kind: REP, repId: '', openedBy: '', category: 'עצים', title: 'ענף שבור', week: '',
    createdAt: d(2026, 9, 21), x: .3, y: .2 },                                                        // 1 יום, להחלטה, צוות-מנהל
  { id: '3', kind: REP, repId: '', openedBy: 'גנן', category: 'עצים', title: 'עץ נוטה', week: CUR,
    createdAt: d(2026, 9, 16) },                                                                      // 6 ימים, בלי מיקום
  { id: '4', kind: REP, repId: '44', category: 'שיחים / גיזום', title: 'שיח חוסם', week: '2026-09-13',
    createdAt: d(2026, 9, 10), x: .5, y: .5 },                                                        // 12 ימים, ורוד
  { id: '5', kind: REP, repId: '45', category: 'ערוגות / שתילות', title: 'שתיל יבש', week: CUR,
    flag: 'ממתין לאישור', createdAt: d(2026, 9, 14), updatedAt: d(2026, 9, 19), x: .9, y: .9 },        // ממתינה לאישור
  // תקלות סגורות
  { id: '6', kind: REP, repId: '46', category: 'עצים', title: 'עץ יבש', week: '2026-09-13', closure: 'בוצע',
    createdAt: d(2026, 9, 8), approvedAt: d(2026, 9, 15), x: .1, y: .1 },                            // סגורה בתקופה
  { id: '7', kind: REP, repId: '47', category: 'מדשאות, השקיה וממטרות', title: 'דליפה', week: '2026-09-06',
    closure: 'בוצע', flag: 'דורש בדיקה חוזרת', createdAt: d(2026, 9, 1), approvedAt: d(2026, 9, 9), x: .2, y: .8 },
  { id: '8', kind: REP, repId: '48', category: 'מדשאות, השקיה וממטרות', title: 'ישנה', week: '2026-06-07',
    closure: 'בוצע', createdAt: d(2026, 6, 1), approvedAt: d(2026, 6, 9), x: .4, y: .4 },           // מחוץ לתקופה
  // שגרה
  { id: 'R1', kind: ROU, templateId: 'P1', title: 'כיסוח דשא', week: '2026-09-13', firstWeek: '2026-09-06',
    closure: 'בוצע', approvedAt: d(2026, 9, 16), createdAt: d(2026, 9, 1) },                        // נדחתה ובוצעה
  { id: 'R2', kind: ROU, templateId: 'P1', title: 'כיסוח דשא', week: '2026-09-13', firstWeek: '2026-09-13',
    createdAt: d(2026, 9, 1) },                                                                       // השבוע עבר, פתוחה
  { id: 'R3', kind: ROU, templateId: 'P2', title: 'גיזום', week: '2026-09-13', firstWeek: '2026-09-13',
    closure: 'בוצע', approvedAt: d(2026, 9, 15), createdAt: d(2026, 9, 1) },                        // בזמן
  { id: 'R4', kind: ROU, templateId: 'P2', title: 'גיזום', week: '2026-09-06', firstWeek: '2026-09-06',
    closure: 'בוטל', approvedAt: d(2026, 9, 7), createdAt: d(2026, 9, 1) },                         // בוטלה
  { id: 'R5', kind: ROU, templateId: 'P1', title: 'כיסוח דשא', week: CUR, firstWeek: CUR, createdAt: d(2026, 9, 1) },
  { id: 'X', kind: REP, repId: '99', category: 'עצים', title: 'נמחקה', week: '', pendingDelete: true, createdAt: d(2026, 9, 20) }
];
const LOG = [
  { taskId: '5', kind: 'ביצוע', at: d(2026, 9, 18), role: 'גנן', who: 'דני' },                     // 4 ימים
  { taskId: '6', kind: 'שיבוץ', at: d(2026, 9, 10), role: 'מנהל' },
  { taskId: '6', kind: 'סגירה', at: d(2026, 9, 15), role: 'מנהל', note: 'בוצע' },
  { taskId: '7', kind: 'סגירה', at: d(2026, 9, 9), role: 'גנן', note: 'בוצע' },
  { taskId: '7', kind: 'משוב', at: d(2026, 9, 11), role: 'תושב', who: 'דין', note: 'שלילי — עדיין דולף' },
  { taskId: '6', kind: 'משוב', at: d(2026, 9, 16), role: 'תושב', note: 'חיובי' },
  { taskId: '4', kind: 'משוב', at: d(2026, 9, 17), role: 'תושב', note: 'חיובי' },
  { taskId: '1', kind: 'משוב', at: d(2026, 9, 18), role: 'תושב', note: 'חיובי' },
  // פתיחה מחדש: "ביטול ביצוע" עם הערה על ידי מנהל = נספרת
  { taskId: '4', kind: 'סגירה', at: d(2026, 9, 12), role: 'מנהל', note: 'בוצע' },
  { taskId: '4', kind: 'ביטול ביצוע', at: d(2026, 9, 13), role: 'מנהל', note: 'בוצע' },
  // הגנן ביטל סימון של עצמו — **לא** "המנהל פתח שוב"
  { taskId: '3', kind: 'סגירה', at: d(2026, 9, 17), role: 'גנן', note: 'בוצע' },
  { taskId: '3', kind: 'ביטול ביצוע', at: d(2026, 9, 17, 11), role: 'גנן', note: 'בוצע' },
  // החזרה בלי סגירה לפניה — לא פתיחה מחדש
  { taskId: '1', kind: 'החזרה', at: d(2026, 9, 19), role: 'מנהל', note: 'חסר' },
  // החזרה אחרי סגירה — כן
  { taskId: '2', kind: 'סגירה', at: d(2026, 9, 21, 8), role: 'מנהל', note: 'בוטל' },
  { taskId: '2', kind: 'החזרה', at: d(2026, 9, 21, 12), role: 'מנהל', note: 'טעות' }
];
const CATS = ['מדשאות, השקיה וממטרות', 'עצים', 'שיחים / גיזום', 'עשבייה / קרקע', 'ניקיון גינון / גזם', 'ערוגות / שתילות'];
const M = C.compute(T, LOG, { weeks: 8, now: NOW, categories: CATS, requireApproval: true });

section('2. עכשיו — ממתינות לאישורך, תקלות פתוחות, נגררות');
ok('ממתינות לאישורך = 1', M.now.approval.count === 1, M.now.approval);
ok('🔴 הוותיקה נמדדת מסימון הגנן ביומן (4 ימים), לא מעדכון אחר', M.now.approval.oldestDays === 4, M.now.approval.oldestDays);
ok('המתג כבוי מסתיר את האריח', C.compute(T, LOG, { now: NOW, requireApproval: false }).now.approval.on === false);
ok('תקלות פתוחות = 5 (בלי שגרה, בלי נמחקת)', M.now.open.count === 5, M.now.open);
ok('להחלטה 1 · משובצות 4', M.now.open.undecided === 1 && M.now.open.planned === 4, M.now.open);
ok('מהוותיקה לחדשה', M.now.open.ids[0] === '1' && M.now.open.ids[4] === '2', M.now.open.ids);
ok('נגררות: 1 (3 שבועות) + 4 (שבוע) + R2 (שבוע) = 3', M.now.dragged.count === 3, M.now.dragged);
ok('ורוד 2 · אדום 1', M.now.dragged.l1 === 2 && M.now.dragged.l2 === 1, M.now.dragged);
ok('ממתינה לאישור אינה נגררת', !M.now.dragged.items.some(x => x.id === '5'));
ok('"הכי נגררות" — הרחוקה ראשונה', M.now.top[0].id === '1', M.now.top.map(x => x.id));
ok('בשוויון — הוותיקה עולה: R2 (נפתחה 1.9) לפני 4 (נפתחה 10.9)',
   M.now.top[1].id === 'R2' && M.now.top[2].id === '4', M.now.top.map(x => x.id));
ok('עד חמש שורות', C.compute(T.concat([1, 2, 3, 4, 5, 6].map(i => ({ id: 'D' + i, kind: ROU, week: '2026-09-06' }))),
   [], { now: NOW }).now.top.length === 5);

section('3. גיל התקלות הפתוחות (0–3, 4–7, 8–14, 15+)');
const ages = M.now.age.map(b => b.ids.length);
ok('2 → 0–3 · 3 → 4–7 · 4,5 → 8–14 · 1 → 15+', JSON.stringify(ages) === '[1,1,2,1]', ages);
ok('🔴 נמדד מהפתיחה, לא מהשבוע — תקלה בלי שבוע נכנסת', M.now.age[0].ids.indexOf('2') >= 0);
ok('סכום הקבוצות = תקלות פתוחות', ages.reduce((a, b) => a + b, 0) === M.now.open.count);

section('4. בתקופה — חזרו לטיפול, משוב שלילי, שגרה שנדחתה');
const RR = M.period.returned;
ok('משוב תושב: 1 (תקלה 7)', RR.feedback.length === 1 && RR.feedback[0].id === '7', RR.feedback);
ok('ושורה נושאת מי ומתי', RR.feedback[0].who === 'דין' && RR.feedback[0].at > 0);
ok('פתיחה מחדש: 4 (ביטול עם הערה) + 2 (החזרה אחרי סגירה) = 2', RR.reopen.length === 2, RR.reopen);
ok('🔴 ביטול של הגנן עצמו אינו "המנהל פתח שוב"', !RR.reopen.some(x => x.id === '3'));
ok('🔴 החזרה בלי סגירה לפניה אינה פתיחה מחדש', !RR.reopen.some(x => x.id === '1'));
const N = M.period.negative;
ok('משוב שלילי 25% — 1 מתוך 4 שענו', N.pct === 25 && N.negative === 1 && N.answered === 4, N);
ok('ברשימה — השלילית ראשונה', N.items[0].negative === true);
ok('בלי תשובות — null ולא 0%', C.compute(T, [], { now: NOW }).period.negative.pct === null);
const RT = M.period.routine;
ok('🔴 שגרה שנדחתה: R1 (נדחתה **ובוצעה**) + R2 (השבוע עבר) = 2', RT.deferred.length === 2 &&
   RT.deferred.indexOf('R1') >= 0 && RT.deferred.indexOf('R2') >= 0, RT.deferred);
ok('R3 בוצעה בזמן — לא נספרת', RT.deferred.indexOf('R3') < 0);
ok('בוטלו: 1', RT.cancelled.length === 1 && RT.cancelled[0] === 'R4', RT.cancelled);
ok('לפי תבנית — "כיסוח דשא · 2"', RT.byTemplate[0].title === 'כיסוח דשא' && RT.byTemplate[0].ids.length === 2, RT.byTemplate);

section('5. תקלות לפי סוג');
const bc = M.period.byCat;
ok('הסדר קבוע — לפי ההגדרות, גם קטגוריה ריקה', bc.map(c => c.name).join('|') === CATS.join('|'), bc.map(c => c.name));
ok('מדשאות 2 (1,7 — 8 מחוץ לתקופה) · עצים 3 · שיחים 1 · ערוגות 1',
   bc[0].ids.length === 2 && bc[1].ids.length === 3 && bc[2].ids.length === 1 && bc[5].ids.length === 1,
   bc.map(c => c.ids.length));
ok('פתוחות וסגורות יחד', bc[1].ids.indexOf('6') >= 0);
ok('סמליל וצבע מהטבלה המשותפת', bc[0].key === 'lawn' && bc[1].key === 'tree' && bc[5].key === 'bed');
ok('קטגוריה שאינה בהגדרות — בסוף, לא נעלמת',
   (x => x[x.length - 1].name === 'חדשה')(C.compute([{ id: 'z', kind: REP, category: 'חדשה', createdAt: d(2026, 9, 20) }], [], { now: NOW, categories: CATS }).period.byCat));
ok('סך בתקופה = 7', M.period.faultsInPeriod === 7, M.period.faultsInPeriod);

section('6. המפה');
const P = id => M.map.pins.filter(p => p.id === id)[0];
ok('פתוחות עם מיקום: 4 מתוך 5', M.map.openWithLoc === 4 && M.map.openTotal === 5, M.map);
ok('נגררה 3 שבועות — אדום', P('1').state === 'l2');
ok('ורוד', P('4').state === 'l1');
ok('ממתינה להחלטה', P('2').state === 'wait');
ok('ממתינה לאישור — סגול', P('5').state === 'appr');
ok('🔴 נסגרה ותושב אמר שלא הושלמה — אדום, ונשארת גם בלי המתג', P('7').state === 'l2' && P('7').closed === false);
ok('נסגרה בתקופה — אפורה, רק כשהמתג דלוק (closed:true)', P('6').state === 'done' && P('6').closed === true);
ok('נסגרה מחוץ לתקופה — לא על המפה', !P('8'));
ok('בלי מיקום — לא על המפה', !P('3'));
ok('הסמליל שבנעץ = הקטגוריה', P('1').cat === 'lawn' && P('4').cat === 'prune');

section('7. מגמות — עמודה לשבוע');
const W = M.weekKeys, idx = k => W.indexOf(k);
ok('8 שבועות, הנוכחי אחרון', W.length === 8 && W[7] === CUR, W);
ok('נגררו בשבוע 6.9: רק R1 (תקלה 7 נסגרה באותו שבוע)', M.trends.dragged[idx('2026-09-06')] === 1, M.trends.dragged);
ok('נגררו בשבוע 13.9: 4 + R2 = 2', M.trends.dragged[idx('2026-09-13')] === 2, M.trends.dragged);
ok('עמידה בתוכנית 13.9: R3 בזמן מתוך R2,R3 = 50%', M.trends.adherence[idx('2026-09-13')] === 50, M.trends.adherence);
ok('🔴 6.9: R1 נדחתה (0%) — R4 שבוטלה אינה נספרת לשום צד', M.trends.adherence[idx('2026-09-06')] === 0 &&
   M.trends.adhDen[idx('2026-09-06')] === 1, [M.trends.adherence, M.trends.adhDen]);
ok('שבוע בלי שגרה — null, לא 0%', M.trends.adherence[0] === null);
ok('זמן עד שיבוץ: תקלה 6 — 2 ימים (8.9 → 10.9)', M.trends.sched[idx('2026-09-06')] === 2, M.trends.sched);
ok('זמן עד סגירה: תקלה 7 — 8 ימים (שבוע 6.9), תקלה 6 — 7 ימים (שבוע 13.9)',
   M.trends.close[idx('2026-09-06')] === 8 && M.trends.close[idx('2026-09-13')] === 7, M.trends.close);
const src = M.trends.src[idx(CUR)];
ok('מי פתח השבוע: מנהל 1 (תקלה 2)', src.mgr === 1 && src.res === 0, src);
ok('שבוע 13.9: גנן 1 (תקלה 3), תושב 1 (תקלה 5)', M.trends.src[idx('2026-09-13')].gard === 1 &&
   M.trends.src[idx('2026-09-13')].res === 1, M.trends.src[idx('2026-09-13')]);

section('8. תקופה ויומן');
const M4 = C.compute(T, LOG, { weeks: 4, now: NOW, categories: CATS });
ok('4 שבועות — 4 עמודות', M4.weekKeys.length === 4);
ok('תקופה קצרה יותר — פחות תקלות לפי סוג (1 נפתחה 28.8 ויוצאת)', M4.period.faultsInPeriod === 6, M4.period.faultsInPeriod);
ok('"עכשיו" אינו תלוי בתקופה', M4.now.open.count === M.now.open.count && M4.now.dragged.count === M.now.dragged.count);
ok('ערך תקופה לא חוקי → 8', C.compute(T, LOG, { weeks: 5, now: NOW }).weeks === 8);
ok('logOk:false עובר למסך', C.compute(T, [], { now: NOW, logOk: false }).logOk === false);
ok('Timestamp של Firestore (toDate) נקרא', C.ms({ toDate: () => new Date(5) }) === 5 && C.ms({ seconds: 2 }) === 2000);
ok('מחרוזת ריקה — NaN, לא 0', isNaN(C.ms('')));

section('9. חיווט — הקוד האמיתי');
const GT = R('js/screens/gardenTasks.js'), ST = R('js/screens/gardenStats.js'), APP = R('js/app.js'),
      IDX = R('index.html'), DS = R('js/data/dataService.js'), FB = R('js/data/firebase.js'), CSS = R('css/garden.css');
ok('🔴 "נגררה N פעמים" לא קיים יותר במסך המשימות', !/" פעמים"/.test(GT.match(/var tags = [^\n]*/)[0]) && !/נגררה " \+ t\.drags/.test(GT));
ok('התג בכרטיס נגזר מ-gardenLang.drag', /function dragOf\(t\)[\s\S]*?GLx\.drag\(t, todayKey\(\)\)/.test(GT));
ok('ורוד/אדום בכרטיס', /is-l' \+ d\.level/.test(GT) && /\.gt-age\.is-l1/.test(CSS) && /\.gt-age\.is-l2/.test(CSS));
ok('דגל חם גובר על גרירה — תג אחד', /if \(FLAG_HOT\[f\]\) return/.test(GT));
ok('הסדר ברשימה לפי שבועות', /Math\.min\(d\.weeks, 20\) \* 40/.test(GT) && !/Math\.min\(t\.drags/.test(GT));
ok('בכרטיס הפרטים — אותו תג', /\(closed \? '' : tagHtml\(t\)\)/.test(GT));
ok('המקרא מתאר את שתי הרמות', /gt-age is-l1">נגררה</.test(GT) && /gt-age is-l2">נגררה 3 שבועות</.test(GT));
ok('כרטיס התקלה נפתח מבחוץ — CBA.gardenOpenCard', /CBA\.gardenOpenCard = function/.test(GT) && /CBA\.gardenOpenCard\(id, refresh\)/.test(ST));
ok('🔴 מנהל ומנהל-על בלבד — "MANAGER"', /gardenStats: "MANAGER"/.test(APP));
ok('"נתונים" ראשון בקבוצת הגינון, ו-landing', /group: "ginun", label: "גינון", landing: "gardenStats", items: \[\s*\["gardenStats"/.test(APP));
ok('landing עובר את rebuildAreas', /landing: t\.landing \|\| ""/.test(APP));
ok('לחיצה על הקבוצה מנווטת ל-landing כשלא בתוכה', /showScreen\(grp\.landing\)/.test(APP));
ok('המנוע נטען לפני המסך', IDX.indexOf('js/data/gardenStatsCalc.js') > 0 &&
   IDX.indexOf('js/data/gardenStatsCalc.js') < IDX.indexOf('js/screens/gardenStats.js'));
ok('ואחרי המילון', IDX.indexOf('js/data/gardenLang.js') < IDX.indexOf('js/data/gardenStatsCalc.js'));
ok('🔴 אין קריאה ל-Apps Script במסך החדש', !/getGardenStats\(/.test(ST) && /getGardenStatsLive\(12/.test(ST));
ok('היומן — שאילתת טווח אחת על at', /queryCollection\("gardenLog", \[\["at", ">=", since\]\]/.test(DS));
ok('firebase.js — טווח בשלושה איברים, שוויון נשאר', /c\.length === 3\) \? q\.where\(c\[0\], c\[1\], c\[2\]\) : q\.where\(c\[0\], '==', c\[1\]\)/.test(FB));
ok('יומן שנכשל → "—" ולא אפס', /\(dash \? "—" : r\.feedback\.length\)/.test(ST));
ok('אישור והחזרה לגנן ישר מהשורה', /gardenTask\("approve", id/.test(ST) && /gardenTask\("return", id, \{ note: note \}/.test(ST));
ok('ריחוף רק במחשב', /\(hover: hover\) and \(pointer: fine\)/.test(ST));
ok('טלפון: בלוקים בעמודה אחת לפי order', /\.gn-grid, \.gn-now, \.gn-per, \.gn-stack \{ display: contents; \}/.test(CSS));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
