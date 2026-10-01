/* גל 13 חלק ב' + משיכות (1.10.2026) — אושרו בסקיצות ("מאושר הכול. תבצע"):
   EXA1 תור אישורים · RSA1 "אשר את כל המומלצים" · RSA2 החלפת משפחה בחלון אחד
   Q6 ניסוחי הסיור + Firebase כמקור · GA3 הדיווחים שלי על המפה · TRA3 טיפ ראשון
   GMA3 בדיקת מנעול כל 15 דק׳ + הודעת "חזר לפעול". */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const section = t => console.log('\n' + t);
const fnSrc = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
};

section('EXA1 — תור אישורים');
{
  const E = R('js/screens/expenses.js'), C = R('css/style.css');
  ok('רצועה מעל הרשימה בתצוגה', /\$\{txQueueBannerHTML\(\)\}/.test(E));
  ok('רק "הוגשה"/"לבדיקה"', /t\.status === "submitted" \|\| t\.status === "review"/.test(fnSrc(E, 'txPendingLocal')));
  ok('כפתור "מעבר לתור אישורים"', /data-open-queue>מעבר לתור אישורים</.test(E));
  const Q = fnSrc(E, 'txOpenQueue');
  ok('חלון מלא עם role=dialog', /role", "dialog"|role="dialog"/.test(Q) || /setAttribute\("role", "dialog"\)/.test(Q));
  ok('סעיף חובה לפני "אשר"', /data-q="ok"' \+ \(cat \? '' : ' disabled'\)/.test(Q));
  ok('הצעת סעיף קיימת (txSuggestCategory)', /txSuggestCategory/.test(Q));
  ok('הקבלה ליד (getReceipt + אותו גוף תצוגה)', /CBA\.data\.getReceipt\(/.test(Q) && /txReceiptBodyHTML\(res\)/.test(Q));
  ok('מקשים: Enter / חצים / Esc', /e\.key === "Enter"/.test(Q) && /ArrowLeft/.test(Q) && /ArrowRight/.test(Q) && /Escape/.test(Q));
  ok('Enter לא "בולע" לחיצה על כפתור', /tag !== "BUTTON"/.test(Q));
  ok('אישור = אותה כתיבה כמו חלון הסיווג (updateTransaction)', /updateTransaction/.test(Q));
  ok('נשמרות שורות, לא מזהים (מזהים כפולים בנתונים)', /function live\(t\)/.test(Q));
  ok('CSS .txq קיים', /\.txq\b/.test(C) && /\.txq-banner/.test(C));
}

section('RSA1 — "אשר את כל המומלצים"');
{
  const S = R('js/screens/residents.js');
  const src = fnSrc(S, 'resStrongPicks');
  ok('הפונקציה קיימת', !!src);
  const sb = {
    resVal: (row, k) => row[k],
    resSuggest: (s) => s._sug
  };
  vm.createContext(sb); vm.runInContext(src, sb);
  const rows = [{ fam: 'כהן', house: '12' }, { fam: 'לוי', house: '14' }];
  const c = { family: 'fam', house: 'house' };
  const list = [
    { id: 'a', _sug: [{ i: 0, row: rows[0], free: true, why: ['מספר בית זהה', 'שם משפחה זהה'] }] },
    { id: 'b', _sug: [{ i: 0, row: rows[0], free: true, why: ['מספר בית זהה'] }] },          // אותו בית — רק הראשון
    { id: 'c', _sug: [{ i: 1, row: rows[1], free: true, why: ['שם משפחה זהה'] }] },           // בלי בית — ידני
    { id: 'd', _sug: [{ i: 1, row: rows[1], free: false, why: ['מספר בית זהה'] }] },          // אין משבצת — ידני
    { id: 'e', _sug: [] }
  ];
  const out = sb.resStrongPicks(list, rows, c);
  ok('רק התאמה לפי מספר בית + משבצת פנויה', out.length === 1 && out[0].s.id === 'a', JSON.stringify(out.map(x => x.s.id)));
  ok('כל בית פעם אחת', !out.some(x => x.s.id === 'b'));
  ok('rowIndex = שורה בגיליון (i+2)', out[0] && out[0].rowIndex === 2);
  ok('תווית משפחה · בית', out[0] && out[0].label === 'כהן · בית 12');
  ok('כפתור רק כשיש יותר מאחת', /strong\.length > 1 \? '<button type="button" class="btn-approve res-su__all" data-su-all>/.test(S));
  ok('אישור לפני הפעולה', /CBA\.ui\.confirm\(picks\.map/.test(S));
  ok('בזה אחר זה, דרך approveSignup הקיים', /\(function step\(k\)/.test(S) && /CBA\.data\.approveSignup\(\{ id: x\.s\.id, residentRowIndex: x\.rowIndex \}/.test(S));
  ok('סינון סטטוס עם trim', /String\(s\.status\)\.trim\(\) === "ממתין"/.test(S));
}

section('RSA2 — החלפת משפחה בחלון אחד');
{
  const S = R('js/screens/residents.js');
  ok('חלון אחד עם משפחה + בית', /id="rep-fam"/.test(S) && /id="rep-house"/.test(S));
  ok('בקשת הרשמה — רשות', /id="rep-su"/.test(S) && /— בלי \(הבית ייפתח ריק\) —/.test(S));
  ok('בקשה מאותו בית נבחרת מראש', /var firstSame = pend\.filter/.test(S));
  ok('replaceFamily ואז approveSignup לשורה החדשה', /CBA\.data\.approveSignup\(\{ id: v\.su, residentRowIndex: res\.newRow \}/.test(S));
  ok('כישלון באישור — ההחלפה נשארת והודעה ברורה', /המשפחה הוחלפה, אבל אישור בקשת ההרשמה נכשל/.test(S));
  ok('השרת מחזיר newRow', /return \{ ok: true, newRow: newRow, newId: newId, oldRow: oldRow \};/.test(R('apps-script/Code.gs')));
}

section('Q6 — ניסוחי הסיור, Firebase כמקור');
{
  const G = R('apps-script/Code.gs');
  ok('מפתח המעבר ב-Script Properties', /var TOUR_FS_SOURCE_KEY = 'TOUR_FS_SOURCE';/.test(G));
  ok('כרטיס WeWork חדש', /'מזהה': 'wework'/.test(G) && /'מסך יעד': 'resWework'/.test(G));
  const sync = fnSrc(G, 'tourSyncAll_');
  ok('אחרי המעבר — השרת לא מעתיק מהגיליון', /source: 'firestore'/.test(sync));
  ok('המעבר: כתיבה מהגיליון + V6 פעם אחת', /tourWriteFromSheet_\(ss, true\)/.test(sync) && /setProperty\(TOUR_FS_SOURCE_KEY, '1'\)/.test(sync));
  ok('הגיליון מקבל הערה "גיבוי בלבד"', /setNote\(/.test(fnSrc(G, 'tourApplyV6_')));
  ok('הלקוח קורא מ-Firestore כברירת מחדל', /TOUR_FROM_FIRESTORE = true/.test(R('js/data/dataService.js')));
}

section('GA3 — הדיווחים שלי על המפה');
{
  const G = R('js/screens/resGarden.js'), C = R('css/garden2.css');
  ok('מתג רשימה/מפה (רק כשיש דיווחים עם מיקום)', /withLoc\(all\)\.length/.test(G) && /data-view="map"/.test(G));
  ok('אותה מפה (CBA.map.render) בלי כותרת/חיפוש', /CBA\.map\.render\(mh, \{ head: false, search: false/.test(G));
  ok('לחיצה על סיכה → הכרטיס ברשימה מהבהב', /data-rep-id="' \+ String\(id\)/.test(G) && /is-flash/.test(G));
  ok('CSS', /\.gd-viewsw/.test(C) && /\.gd-rep\.is-flash/.test(C));
}

section('TRA3 — טיפ בכניסה ראשונה');
{
  const T = R('js/ui/tips.js'), I = R('index.html'), C = R('css/style.css');
  ok('נטען אחרי tour.js', I.indexOf('js/ui/tips.js') > I.indexOf('js/ui/tour.js') && I.indexOf('js/ui/tour.js') > 0);
  ok('פעם אחת למסך ולמשתמש (localStorage עם try)', /cba_tips_v1/.test(T) && /who\(\) \+ "\|" \+ screen/.test(T) && /catch \(e\)/.test(T));
  ok('מחכה כשהסיור או חלון פתוחים', /tr-open/.test(T) && /has-cba-dlg/.test(T));
  ok('לא נוגע ב-app.js — מאזין ל-data-screen', /attributeFilter: \["data-screen"\]/.test(T));
  ok('נסגר ב-✕', /cba-tip__x/.test(T) && /\.cba-tip/.test(C));
  ok('יש טיפ לכל המסכים החדשים (תור/מומלצים/מפה)', /מעבר לתור אישורים/.test(T) && /אשר את כל המומלצים/.test(T) && /על המפה/.test(T));
}

section('GMA3 — מנעול: סוללה/ניתוק');
{
  const D = R('apps-script/Door.gs'), N = R('apps-script/Notify.gs');
  ok('בדיקה כל 15 דק׳ מהטריגר הקיים', /doorQuickHealth_\(null\)/.test(fnSrc(N, 'eventMessagesTick')));
  ok('רק במצב live', /if \(doorMode_\(\) !== 'live'\) return null;/.test(fnSrc(D, 'doorQuickHealth_')));
  ok('הודעת "חזר לפעול" אחרי ניתוק בלבד', /kind === 'offline' && ss/.test(fnSrc(D, 'doorAlertClear_')) && /המנעול חזר לפעול/.test(D));
  ok('הניקוי מקבל ss מבדיקת הבריאות', /doorAlertClear_\('offline', ss\)/.test(D));
  ok('עדיין "פעם אחת לכל מעבר מצב"', /if \(st\[kind\]\) return;/.test(fnSrc(D, 'doorAlert_')));
  /* התנהגות: ניתוק → התראה; עוד בדיקה → כלום; חזרה → "חזר לפעול" פעם אחת */
  const props = {}, sent = [];
  const sb = {
    doorProp_: k => props[k] || '', doorPropSet_: (k, v) => { props[k] = v; },
    notifyAdmins_: (ss, p, key, vars) => sent.push(vars['בעיה']),
    Utilities: { formatDate: () => '01/10 10:00' }, wwTz_: () => 'Asia/Jerusalem',
    PERM_GYM: 'gym', Logger: { log: () => {} }, JSON, Date
  };
  vm.createContext(sb);
  vm.runInContext(fnSrc(D, 'doorAlert_') + '\n' + fnSrc(D, 'doorAlertClear_'), sb);
  sb.doorAlert_({}, 'offline', 'המנעול התנתק מהרשת');
  sb.doorAlert_({}, 'offline', 'המנעול התנתק מהרשת');
  ok('ניתוק — התראה אחת', sent.length === 1, JSON.stringify(sent));
  sb.doorAlertClear_('offline', {});
  sb.doorAlertClear_('offline', {});
  ok('חזרה — "חזר לפעול" פעם אחת', sent.length === 2 && /חזר לפעול/.test(sent[1]), JSON.stringify(sent));
  sb.doorAlertClear_('battery', {});
  ok('בלי הודעה כשלא הייתה התראה', sent.length === 2);
  sb.doorAlert_({}, 'battery', 'סוללה'); sb.doorAlertClear_('battery', {});
  ok('סוללה — בלי הודעת "תוקן"', sent.length === 3);
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
