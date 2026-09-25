/* "לכל דייר, לא לכל משק בית" — שלושת התיקונים מהערב של דר (24.9.26),
   ועוד שני תיקוני מהירות מאותו ערב.
   הרצה:  node tools/test-per-resident-2026-09-24.js

   1. הרשאות — אין נפילה לעמודת "תפקיד" (אחת לשורה) באף אחד מחמשת המקומות.
   2. מייל לתושב — בשם הנמען, מייל נפרד לכל כתובת (notify_ וגם המסלול הישן).
   3. התראות — נדחות עד אחרי ה-handler (אחרי שחרור הנעילה).
   4. migrateResidentsPerSlot — על גיליון מדומה בגודל אמיתי.
   5. tour.js — מפתח מקומי לכל משתמש, והמתנה לטעינה שבדרך.
   6. events.js — שלוש הטעינות במקביל.
   הקוד נחלץ מהקבצים עצמם ומורץ — לא העתקה ידנית. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs'), NT = R('apps-script/Notify.gs'), MT = R('apps-script/Maintenance.gs');
const APP = R('js/app.js'), RES = R('js/screens/residents.js'), TOUR = R('js/ui/tour.js'), EV = R('js/screens/events.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const grab = (src, re) => { const m = src.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };

/* ================================================================= */
section('1. הרשאות — "תפקיד" לא נותן כלום, בשום מקום');
{
  const pf = grab(GS, /function permissionsFor_\(email\) \{[\s\S]*?\n\}/);
  ok('permissionsFor_ — אין נפילה ל-r.role', !/r\.role/.test(pf));
  ok('permissionsFor_ — מחזירה slot', /slot: r\.slot/.test(pf));
  const ae = grab(GS, /function adminEmailsByPerm_\(ss, permKey\) \{[\s\S]*?\n\}/);
  ok('adminEmailsByPerm_ — אין נפילה', !/indexOf\('מנהל'\)/.test(ae));
  const nd = grab(NT, /function notifyDirectory_\(ss\) \{[\s\S]*?\n\}/);
  ok('notifyDirectory_ — אין נפילה', !/indexOf\('מנהל'\)/.test(nd));
  const mp = grab(APP, /function myPerms\(\) \{[\s\S]*?\n  \}/);
  ok('app.js myPerms — אין נפילה', !/indexOf\("מנהל"\)/.test(mp));
  const rp = grab(RES, /function resPermsOf\(row, c, i\) \{[\s\S]*?\n\}/);
  ok('residents.js resPermsOf — אין נפילה', !/מנהל/.test(rp));
  ok('🔴 בכל הקוד לא נשארה שורת נפילה ל"מנהל" עבור הרשאות',
     !/perms\.length && [\w.]*role[\w.]* ?(&& [\w.]+)?\.indexOf\('מנהל'\)/.test(GS + NT) &&
     !/indexOf\("מנהל"\) !== -1\) \? \[PERM\.SUPER\]/.test(APP));

  /* הרצה של permissionsFor_: Dar עם "הרשאות 2" ריק ו"תפקיד = מנהל על" ⇒ אין הרשאות */
  const box = { PERMS_MEMO_: {}, PERM_SUPER: 'על', String, parseInt,
    normalizeEmail_: e => String(e || '').trim().toLowerCase(),
    parsePerms_: raw => String(raw || '').split(/[,;|\/]/).map(x => x.trim()).filter(Boolean),
    lookupResident_: email => email === 'dar@x'
      ? { found: true, role: 'מנהל על', status: 'פעיל', permissions: '', slot: 2, rowIndex: 7, familyId: '1' }
      : { found: true, role: 'מנהל על', status: 'פעיל', permissions: 'על', slot: 1, rowIndex: 7, familyId: '1' } };
  vm.createContext(box); vm.runInContext(pf, box);
  const d = box.permissionsFor_('dar@x'), y = box.permissionsFor_('yoad@x');
  ok('🔴🔴 דר (הרשאות 2 ריק, תפקיד "מנהל על") ⇒ לא מנהלת', d.perms.length === 0 && !d.isSuper, JSON.stringify(d.perms));
  ok('יועד (הרשאות 1 = על) ⇒ מנהל-על', y.isSuper);
  ok('slot עובר הלאה', d.slot === 2 && y.slot === 1);
}

/* ================================================================= */
section('2. מייל לתושב — בשם הנמען');
{
  const dir = [
    { email: 'yoad@x', key: 'yoad@x', firstName: 'יועד', family: 'גולן' },
    { email: 'dar@x', key: 'dar@x', firstName: 'דר', family: 'גולן' },
    { email: 'noname@x', key: 'noname@x', firstName: '', family: 'כהן' }
  ];
  const box = { NOTIFY_MEMO_: null, Object, String,
    normalizeEmail_: e => String(e || '').trim().toLowerCase(),
    notifyDirectory_: () => dir };
  vm.createContext(box);
  vm.runInContext(grab(NT, /function notifyPersonByEmail_\(ss, email\) \{[\s\S]*?\n\}/) + '\n' +
                  grab(GS, /function residentVarsFor_\(ss, email, vars\) \{[\s\S]*?\n\}/), box);
  const base = { 'שם': 'יועד גולן', 'סכום': '50' };
  const vd = box.residentVarsFor_(null, 'DAR@x', base);
  ok('🔴🔴 לדר: {{שם}} = "דר גולן"', vd['שם'] === 'דר גולן', vd['שם']);
  ok('{{שם פרטי}} ו-{{משפחה}} נוספו', vd['שם פרטי'] === 'דר' && vd['משפחה'] === 'גולן');
  ok('שאר המשתנים נשמרו', vd['סכום'] === '50');
  ok('⚠️ המקור לא שונה (עותק)', base['שם'] === 'יועד גולן');
  ok('בלי שם פרטי בגיליון ⇒ המשתנים כמו שהם', box.residentVarsFor_(null, 'noname@x', base) === base);
  ok('כתובת לא מוכרת ⇒ כמו שהם', box.residentVarsFor_(null, 'zz@x', base) === base);

  const nt = grab(NT, /function notify_\(ss, trigId, ctx, roles\) \{[\s\S]*?\n\}/);
  ok('notify_: לתושב (r) — לולאה על כל נמען עם residentVarsFor_',
     /slot\.role === 'r'\) \{[\s\S]{0,300}to\.forEach\(function \(em\) \{[\s\S]{0,120}residentVarsFor_\(ss, em, slot\.vars\)/.test(nt));
  ok('notify_: לכל התושבים (all) — עדיין עותק מוסתר', /slot\.role === 'all'\) \{[\s\S]{0,300}sendMailBcc_/.test(nt));
  const srt = grab(GS, /function sendResidentTemplate_\(ss, key, emails, vars, opt\) \{[\s\S]*?\n\}/);
  ok('המסלול הישן (בלי שורה במרכז ההתראות) — גם הוא מייל לכל נמען בשמו',
     /\.forEach\(function \(em\) \{[\s\S]{0,120}residentVarsFor_\(ss, em, vars\)[\s\S]{0,300}sendMail_\(\[em\]/.test(srt));
}

/* ================================================================= */
section('3. התראות נדחות עד אחרי ה-handler (והנעילה)');
{
  ok('doGet עוטף: start → inner → flush ב-finally',
     /function doGet\(e\) \{\s*notifyDeferStart_\(\);\s*try \{ return doGetInner_\(e\); \}\s*finally \{ notifyDeferFlush_\(\); \}/.test(GS));
  ok('doPost עוטף באותה צורה',
     /function doPost\(e\) \{\s*notifyDeferStart_\(\);\s*try \{ return doPostInner_\(e\); \}\s*finally \{ notifyDeferFlush_\(\); \}/.test(GS));
  ok('יש doGetInner_ ו-doPostInner_ יחידים', (GS.match(/function doGetInner_\(e\)/g) || []).length === 1 &&
     (GS.match(/function doPostInner_\(e\)/g) || []).length === 1);
  ok('⚠️ אין עוד doGet/doPost כפולים', (GS.match(/^function doGet\(/mg) || []).length === 1 && (GS.match(/^function doPost\(/mg) || []).length === 1);

  /* הרצה: handler שלוקח נעילה, שולח התראה, ומשחרר — ההתראה יוצאת אחרי השחרור */
  const events = [];
  const box = { Logger: { log: () => {} }, events };
  vm.createContext(box);
  vm.runInContext([
    grab(GS, /var NOTIFY_DEFER_ = null;/),
    grab(GS, /function notifyDeferStart_\(\) \{[^\n]*\}/),
    grab(GS, /function notifyDeferFlush_\(\) \{[\s\S]*?\n\}/),
    `function notifyLookupKey_() { return null; }
     function getEmailSettings_() { return {}; }
     function emailEnabled_() { events.push('send'); return false; }`,
    grab(GS, /function sendResidentTemplate_\(ss, key, emails, vars, opt\) \{[\s\S]*?\n\}/),
    `function handler() { var l = { release: function () { events.push('release'); } };
       try { events.push('lock'); sendResidentTemplate_(null, 'K', ['a@x'], {}); events.push('work'); }
       finally { l.release(); } return 'resp'; }
     function doGetInner_(e) { return handler(); }
     function doGet(e) { notifyDeferStart_(); try { return doGetInner_(e); } finally { notifyDeferFlush_(); } }`
  ].join('\n'), box);
  const r = box.doGet({});
  ok('התשובה חוזרת כרגיל', r === 'resp');
  ok('🔴🔴 ההתראה יצאה **אחרי** שחרור הנעילה', events.join(',') === 'lock,work,release,send', events.join(','));
  events.length = 0;
  box.sendResidentTemplate_(null, 'K', ['a@x'], {});
  ok('מחוץ לבקשה (טריגר/עורך) — שליחה מיידית', events.join(',') === 'send', events.join(','));
  ok('notifyAdmins_ נדחה באותה צורה',
     /function notifyAdmins_\(ss, permKey, key, vars, opt\) \{\s*if \(NOTIFY_DEFER_\) \{/.test(GS));
}

/* ================================================================= */
section('4. migrateResidentsPerSlot — על גיליון מדומה');
function fakeSheet(headers, rows) {
  const grid = [headers.slice()].concat(rows.map(r => r.slice()));
  const log = { inserts: 0, writes: [] };
  const W = () => grid[0].length;
  const cell = (r, c) => (grid[r - 1] || [])[c - 1];
  const range = (r, c, nr, nc) => ({
    getValues: () => { const o = []; for (let i = 0; i < (nr || 1); i++) { const row = []; for (let j = 0; j < (nc || 1); j++) row.push(cell(r + i, c + j) === undefined ? '' : cell(r + i, c + j)); o.push(row); } return o; },
    setValues: v => { v.forEach((row, i) => row.forEach((x, j) => { grid[r - 1 + i][c - 1 + j] = x; })); log.writes.push([r, c]); return range(r, c, nr, nc); },
    setValue: x => { grid[r - 1][c - 1] = x; log.writes.push([r, c, x]); return range(r, c); },
    setFontWeight: () => range(r, c, nr, nc)
  });
  const sh = {
    getLastColumn: W, getLastRow: () => grid.length,
    getRange: range,
    insertColumnAfter: c => { log.inserts++; grid.forEach(row => row.splice(c, 0, '')); },
    copyTo: () => ({ setName: () => {}, hideSheet: () => {} })
  };
  return { sh, grid, log };
}
function migBox(sheet) {
  const synced = [], tourSync = [];
  const box = {
    String, parseInt, isNaN, JSON, Object,
    PERM_SUPER: 'על', TOUR_SEEN_HEADER: 'סיור נצפה', PERMS_MEMO_: {},
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => n === 'תושבים' ? sheet.sh : null }), flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Logger: { log() {} }, Utilities: { formatDate: () => '24.09.2026' },
    fbSyncRow_: (ss, row) => { synced.push(row); return 2; },
    tourSeenSyncAll_: () => { tourSync.push(1); return { ok: true }; },
    residentSlotCols_: sh => {
      const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      const o = { email: [], perm: [], uid: [] };
      h.forEach((x, i) => { if (x.indexOf('מזהה Firebase') !== -1) o.uid.push(i); else if (x.indexOf('הרשאות') !== -1) o.perm.push(i); else if (x.indexOf('אימייל') !== -1) o.email.push(i); });
      return o;
    }
  };
  vm.createContext(box);
  vm.runInContext([
    grab(GS, /var TOUR_SEEN_SLOT_RE = [^\n]*\n/),
    grab(GS, /function tourSeenCols_\(sh\) \{[\s\S]*?\n\}/),
    MT
  ].join('\n'), box);
  return { box, synced, tourSync };
}
{
  /* הסדר האמיתי אחרי tidyResidentsSheet (24.9), עם 4 שורות מייצגות */
  const H = ['מזהה קבוע', 'משפחה', 'מספר בית', 'סטטוס (פעיל/עזב)', 'סוג משתמש',
    'שם פרטי 1', 'כתובת אימייל 1', 'מספר טלפון 1', 'מקצוע 1', 'תאריך לידה 1', 'ת.ז. 1', 'הרשאות 1',
    'שם פרטי 2', 'כתובת אימייל 2', 'מספר טלפון 2', 'מקצוע 2', 'תאריך לידה 2', 'ת.ז. 2', 'הרשאות 2',
    'שמות ילדים', 'הערות', 'תפקיד (תושב/מנהל)', 'סיור נצפה', 'מזהה Firebase 1', 'מזהה Firebase 2', 'עודכן ע"י', 'עודכן בתאריך'];
  const row = o => H.map(h => (o[h] !== undefined ? o[h] : ''));
  const rows = [
    row({ 'מזהה קבוע': '1', 'משפחה': 'גולן', 'מספר בית': '401', 'כתובת אימייל 1': 'yoad@x', 'כתובת אימייל 2': 'dar@x',
          'תפקיד (תושב/מנהל)': 'מנהל על', 'סיור נצפה': 5, 'מזהה Firebase 1': 'uY', 'מזהה Firebase 2': 'uD' }),
    row({ 'מזהה קבוע': '2', 'משפחה': 'ארגיל', 'מספר בית': '607', 'כתובת אימייל 1': 'dean@x', 'הרשאות 1': 'על, גינון',
          'סיור נצפה': 3, 'מזהה Firebase 1': 'uDe' }),
    row({ 'מזהה קבוע': '3', 'משפחה': 'לוי', 'מספר בית': '12', 'כתובת אימייל 1': 'a@x', 'כתובת אימייל 2': 'b@x',
          'תפקיד (תושב/מנהל)': 'תושב', 'סיור נצפה': 2, 'מזהה Firebase 2': 'uB' }),
    row({ 'מזהה קבוע': '4', 'משפחה': 'כהן', 'מספר בית': '13', 'כתובת אימייל 1': 'c@x' })
  ];
  const col = (g, h) => g[0].indexOf(h);

  const dry = fakeSheet(H, rows);
  const m0 = migBox(dry);
  const rep0 = m0.box.migrateResidentsPerSlotDryRun();
  ok('הרצה יבשה — אפס כתיבות ואפס הוספות עמודה', dry.log.writes.length === 0 && dry.log.inserts === 0);
  ok('הרצה יבשה — מזהה שורה אחת להרשאות (401)', rep0.perms.length === 1 && rep0.perms[0].house === '401', JSON.stringify(rep0.perms));
  ok('הרצה יבשה — תוכנית הסיור: 2 לדייר 1, 1 לדייר 2', rep0.tour.toSlot1 === 2 && rep0.tour.toSlot2 === 1, JSON.stringify(rep0.tour));

  const s = fakeSheet(H, rows);
  const m = migBox(s);
  const rep = m.box.migrateResidentsPerSlot();
  const g = s.grid;
  ok('🔴 401: הרשאות 1 = על', g[1][col(g, 'הרשאות 1')] === 'על', g[1][col(g, 'הרשאות 1')]);
  ok('🔴🔴 401: הרשאות 2 נשאר ריק (דר — תושבת)', g[1][col(g, 'הרשאות 2')] === '');
  ok('401: "תפקיד" רוקן', g[1][col(g, 'תפקיד (תושב/מנהל)')] === '');
  ok('607 (הרשאות קיימות, בלי "מנהל") — לא נגעו', g[2][col(g, 'הרשאות 1')] === 'על, גינון');
  ok('12 ("תפקיד = תושב") — לא נגעו בתפקיד', g[3][col(g, 'תפקיד (תושב/מנהל)')] === 'תושב');
  ok('הכותרת הישנה נעלמה', col(g, 'סיור נצפה') === -1);
  ok('🔴 "סיור נצפה 1" במקום הישן, "סיור נצפה 2" מיד אחריו',
     col(g, 'סיור נצפה 1') === H.indexOf('סיור נצפה') && col(g, 'סיור נצפה 2') === H.indexOf('סיור נצפה') + 1);
  ok('העמודות אחריה זזו אחת ימינה בלי לאבד נתון', g[1][col(g, 'מזהה Firebase 1')] === 'uY' && g[1][col(g, 'מזהה Firebase 2')] === 'uD');
  ok('🔴🔴 401: יועד 5, דר 0 ⇒ דר תקבל סיור', g[1][col(g, 'סיור נצפה 1')] === 5 && g[1][col(g, 'סיור נצפה 2')] === '');
  ok('607 (רק דייר 1) — 3 נשאר אצלו', g[2][col(g, 'סיור נצפה 1')] === 3);
  ok('12 (רק לדייר 2 יש Firebase) — הערך עבר לדייר 2', g[3][col(g, 'סיור נצפה 1')] === '' && g[3][col(g, 'סיור נצפה 2')] === 2);
  ok('13 (ריק) — ריק בשתיהן', g[4][col(g, 'סיור נצפה 1')] === '' && g[4][col(g, 'סיור נצפה 2')] === '');
  ok('Firestore: members לשורה 401 סונכרן', m.synced.join(',') === '2', m.synced.join(','));
  ok('Firestore: tourSeen סונכרן לכולם', m.tourSync.length === 1);
  ok('נוצר גיבוי', rep.backup === 'תושבים — לפני מעבר 24.09.2026');

  const writesBefore = s.log.writes.length, insBefore = s.log.inserts;
  const rep2 = m.box.migrateResidentsPerSlot();
  ok('🔴 אידמפוטנטית: הרצה שנייה לא כותבת ולא מוסיפה', s.log.writes.length === writesBefore && s.log.inserts === insBefore &&
     rep2.perms.length === 0 && rep2.tour === 'כבר לכל דייר', JSON.stringify({ p: rep2.perms, t: rep2.tour }));

  /* tidy מקבל את שני המצבים */
  const before = migBox(fakeSheet(H, rows)).box.tidyResidentsSheetDryRun();
  ok('tidyResidentsSheet לפני המעבר — מכיר את "סיור נצפה" הישן (0 הזזות)', before.moves === 0, JSON.stringify(before.plan));
  const after = m.box.tidyResidentsSheetDryRun();
  ok('tidyResidentsSheet אחרי המעבר — 0 הזזות (הסדר כבר נכון)', after.moves === 0, JSON.stringify(after.plan));
}

/* ================================================================= */
section('5. tour.js — לכל משתמש, והמתנה לטעינה שבדרך');
{
  const store = {};
  let pending = null;
  const box = {
    window: {}, document: { getElementById: () => null, activeElement: null,
      createElement: () => { box.opened = (box.opened || 0) + 1; throw new Error('stop-after-open'); } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    setTimeout, clearTimeout, console
  };
  box.window.CBA = box.CBA = {
    user: { email: 'Dar@x' },
    data: { getTour: cb => { pending = cb; }, markTourSeen: () => {} },
    esc: s => s
  };
  box.CBA.ui = {};
  vm.createContext(box);
  vm.runInContext(TOUR, box);
  const T = box.CBA.tour;
  ok('המודול נטען', !!T && typeof T.maybeAutoStart === 'function');
  store['cba_tour_auto_v1'] = '5';               // הדפדפן "זוכר" את הסיור של יועד (המפתח הישן)
  let opened = 0;
  T.newCount(() => {});                          // עמוד הבית התחיל טעינה
  T.maybeAutoStart();                            // ואז פתיחה אוטומטית — בזמן שהטעינה בדרך
  const origOpen = T.start;
  ok('🔴 maybeAutoStart לא הופל כשטעינה כבר בדרך (ממתין לה)', typeof pending === 'function');
  // נצפה בפתיחה דרך ה-DOM: open() יוצר אלמנט — נבדוק במקום זאת שהקריאה עברה בלי חריגה
  let threw = false;
  try { pending({ ok: true, steps: [{ 'מזהה': 'welcome', 'גרסה': 1 }], seen: 0 }); } catch (e) { threw = true; }
  ok('הטעינה הסתיימה בלי חריגה (שני הממתינים קיבלו תשובה)', !threw);
  ok('🔴🔴 הסיור נפתח לדר — למרות שהדפדפן "זוכר" 5 במפתח הישן של יועד', box.opened >= 1, String(box.opened));
  ok('🔴🔴 המפתח המקומי הוא לכל משתמש', /function autoKey\(\) \{[\s\S]{0,300}AUTO_KEY \+ ":" \+ who/.test(TOUR));
  ok('localSeen ו-markSeen משתמשים ב-autoKey', /localStorage\.getItem\(autoKey\(\)\)/.test(TOUR) && /localStorage\.setItem\(autoKey\(\)/.test(TOUR));
  ok('⚠️ כשל טעינה מחזיר את autoDone ל-false', /if \(!ok\) \{ autoDone = false; return; \}/.test(TOUR));
  ok('seed() משחרר ממתינים', /loaded = true;\s*flushLoad\(true\);/.test(TOUR));
}

/* ================================================================= */
section('6. events.js — שלוש הטעינות במקביל');
{
  const le = grab(EV, /function loadEvents\(year, callback\) \{[\s\S]*?\n  \}/);
  ok('אין יותר שרשור בתוך callbacks', !/loadCommunityEvents\(year, function/.test(le));
  const calls = [];
  const box = { state: {}, calls };
  vm.createContext(box);
  vm.runInContext(`
    var pend = [];
    function loadCommunityEvents(y, cb) { calls.push('c'); pend.push(cb); }
    function loadPrivateEvents(cb) { calls.push('p'); pend.push(cb); }
    function loadRsvpEnabledIds(cb) { calls.push('r'); pend.push(cb); }
    ${le}
    var done = 0; loadEvents(2026, function () { done++; });`, box);
  ok('🔴 שלושתן יוצאות מיד, בלי לחכות זו לזו', calls.join('') === 'cpr', calls.join(''));
  vm.runInContext('pend[1](); pend[0]();', box);
  ok('ה-callback לא נקרא לפני שכולן חזרו', box.done === 0 && box.state.loading === true);
  vm.runInContext('pend[2]();', box);
  ok('ונקרא פעם אחת כשהאחרונה חזרה', box.done === 1 && box.state.loading === false);
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
