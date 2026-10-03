/* בדיקות שלבים 2-3 במעבר מכון הכושר ל-Firebase (3.10.2026).  הרצה: node tools/test-gym-write-2026-10-03.js
   🔴 מה המארז שומר עליו:
     1. ההקרנה האופטימית בדפדפן (project) נותנת בדיוק את אותה תוצאה כמו gymPaymentSync_ בשרת.
     2. אף פעולה לא נבלעת: כל תנאי חסר → נפילה לנתיב הישן; כישלון כתיבת הכוונה → נתיב ישן ולא נשמר כלום.
     3. gymApplyOps_ אידמפוטנטי (קריסה באמצע לא יוצרת תשלום כפול), כישלון לא נבלע, והדלת/המסמך מסונכרנים פעם אחת למנוי.
     4. כללי האבטחה: כל שדה שהלקוח כותב מותר בכללים; צורת ה-op תואמת gymOpOk.
     5. חיווט: דגלים, נתב, הרשאות, טריגר שעתי, סנכרון שלא דורס op ממתין. */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs'), GF = R('apps-script/GymFirestore.gs'), RULES = R('firestore.rules');
const GW = R('js/data/gymWrite.js'), IDX = R('index.html'), SW = R('service-worker.js'), SYS = R('js/screens/sysStatus.js');
function grab(src, re) { const m = src.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; }

/* ---------- טעינת gymWrite.js ---------- */
function loadGW(cbaExtra) {
  const win = { CBA: Object.assign({}, cbaExtra || {}) };
  const box = { window: win, Math, Date, JSON, Object, Number, String, Array, isNaN, setTimeout, localStorage: { getItem() { return null; }, setItem() {} } };
  box.CBA = win.CBA; vm.createContext(box);
  vm.runInContext(GW, box);
  return win.CBA;
}
const PLANS = [{ id: 'p1', name: 'שנתי', monthlyPrice: 60, total: 720, months: 12 }, { id: 'p2', name: 'חודשי', monthlyPrice: 80, total: 80, months: 1 }];
const NOW = new Date(2026, 9, 3, 12, 0, 0);
const docBase = () => ({ schema: 2, 'מזהה': 'GYM-0008', 'סטטוס': 'ממתין לתשלום', 'מסלול': 'שנתי', 'תאריך התחלה': '2026-10-01', 'בתוקף עד': '', 'סה"כ שולם': '', log: [], familyId: '32', uid: 'u1', slot: 1 });

section('1. הקרנה אופטימית — רישום תשלום');
{
  const GWx = loadGW().gymWrite;
  const r = GWx.project('recordGymPayment', { id: 'GYM-0008', amount: 360, validUntil: '2027-03', method: 'מזומן', activate: true }, docBase(), PLANS, NOW, 'a@x.com');
  ok('אין שגיאה', !r.error, r.error);
  ok('סטטוס → פעיל, תוקף 31/3/2027', r.patch['סטטוס'] === 'פעיל' && r.patch['בתוקף עד'] === '2027-03-31');
  ok('סה"כ שולם 360, חודשים 6, מסונכרן (6 חודשים הוקצו)', r.patch['סה"כ שולם'] === 360 && r.patch['חודשים ששולמו'] === 6 && r.patch['מצב סנכרון'] === 'מסונכרן', JSON.stringify(r.patch));
  ok('אירוע תשלום ביומן עם eventId, ובגוף ה-op אותו eventId', r.patch.log.length === 1 && r.patch.log[0].type === 'תשלום' && r.op.body.eventId === r.patch.log[0].id && /^LOG-/.test(r.op.body.eventId));
  ok('התשובה למסך: validUntil בפורמט MM/yyyy, status, sync.label, queued', r.res.validUntil === '03/2027' && r.res.status === 'פעיל' && r.res.sync.label === 'מסונכרן' && r.res.queued === true);
  const d2 = Object.assign(docBase(), r.patch);
  const dup = GWx.project('recordGymPayment', { id: 'GYM-0008', amount: 360, validUntil: '2027-03' }, d2, PLANS, new Date(NOW.getTime() + 60000), 'a@x.com');
  ok('🔴 מגן מכפילות: אותו סכום בתוך 3 דקות נחסם (כמו בשרת)', /כבר נרשם תשלום זהה \(360 ₪\) לפני 60 שניות/.test(dup.error || ''), dup.error);
  const later = GWx.project('recordGymPayment', { id: 'GYM-0008', amount: 360, validUntil: '2027-09' }, d2, PLANS, new Date(NOW.getTime() + 200000), 'a@x.com');
  ok('אחרי 3 דקות — מותר, והסכום מצטבר', !later.error && later.patch['סה"כ שולם'] === 720);
  ok('הסכום 0 / בלי חודש — הודעות שגיאה כמו בשרת',
    GWx.project('recordGymPayment', { id: 'x', amount: 0, validUntil: '2027-03' }, docBase(), PLANS, NOW, 'a').error === 'יש להזין את הסכום שהתקבל' &&
    GWx.project('recordGymPayment', { id: 'x', amount: 5 }, docBase(), PLANS, NOW, 'a').error === 'יש לבחור עד איזה חודש המנוי בתוקף');
  const ro = GWx.project('recordGymPayment', { id: 'x', amount: 360, validUntil: '2027-03', activate: false }, docBase(), PLANS, NOW, 'a');
  ok('"רק לרשום תשלום": הסטטוס לא משתנה', !('סטטוס' in ro.patch) && ro.res.recordOnly === true && ro.res.status === 'ממתין לתשלום');
  const cf = GWx.project('confirmGymPayment', { id: 'x', amount: 360, validUntil: '2027-03' }, docBase(), PLANS, NOW, 'a');
  ok('אימות דיווח: אמצעי ברירת מחדל פייבוקס', cf.patch['אמצעי תשלום'] === 'פייבוקס' && cf.patch.log[0].method === 'פייבוקס');
}

section('2. הקרנה — עריכה וביטול (המקרה האמיתי: GYM-0008 שלוש פעמים)');
{
  const GWx = loadGW().gymWrite;
  let d = docBase(); let t = NOW.getTime();
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const r = GWx.project('recordGymPayment', { id: 'x', amount: 360, validUntil: '2027-03' }, d, PLANS, new Date(t), 'a'); t += 400000;
    d = Object.assign({}, d, r.patch); ids.push(r.op.body.eventId);
  }
  ok('שלושה תשלומים → 1080, "עודף 12 חודשים"', d['סה"כ שולם'] === 1080 && /^עודף 12 חודשים$/.test(d['מצב סנכרון']), d['מצב סנכרון']);
  let v = GWx.project('voidGymPayment', { id: 'x', eventId: ids[1] }, d, PLANS, new Date(t), 'a'); d = Object.assign({}, d, v.patch);
  v = GWx.project('voidGymPayment', { id: 'x', eventId: ids[2] }, d, PLANS, new Date(t + 1000), 'a'); d = Object.assign({}, d, v.patch);
  ok('🔴 אחרי ביטול שניים: 360 ₪ / מסונכרן', d['סה"כ שולם'] === 360 && d['מצב סנכרון'] === 'מסונכרן', JSON.stringify([d['סה"כ שולם'], d['מצב סנכרון']]));
  ok('השורות המבוטלות נשארות ביומן (לא נמחקו) + אירוע ביקורת', d.log.filter(e => e.type === 'תשלום מבוטל').length === 2 && d.log.filter(e => e.type === 'ביטול תשלום').length === 2);
  ok('ביטול כפול נחסם', GWx.project('voidGymPayment', { id: 'x', eventId: ids[1] }, d, PLANS, NOW, 'a').error === 'התשלום כבר מבוטל');
  ok('עריכת תשלום מבוטל נחסמת', GWx.project('updateGymPayment', { id: 'x', eventId: ids[1], amount: 5 }, d, PLANS, NOW, 'a').error === 'אפשר לערוך רק תשלום פעיל (לא מבוטל)');
  const u = GWx.project('updateGymPayment', { id: 'x', eventId: ids[0], amount: 300 }, d, PLANS, NOW, 'a');
  ok('עריכת סכום 360→300: הסה"כ מתעדכן לפי הדלתא', u.patch['סה"כ שולם'] === 300 && /סכום 360→300/.test(u.patch.log[u.patch.log.length - 1].note));
  const un = GWx.project('updateGymPayment', { id: 'x', eventId: ids[0], amount: 360 }, d, PLANS, NOW, 'a');
  ok('בלי שינוי → unchanged ואין op', un.res.unchanged === true && un.op === null);
  ok('אירוע שלא במסמך (נחתך) → נתיב ישן', GWx.project('voidGymPayment', { id: 'x', eventId: 'LOG-OLD' }, d, PLANS, NOW, 'a').error === '__notInDoc');
  ok('סכום אפס/תאריך שגוי נחסמים', GWx.project('updateGymPayment', { id: 'x', eventId: ids[0], amount: 0 }, d, PLANS, NOW, 'a').error === 'הסכום חייב להיות גדול מאפס' && GWx.project('updateGymPayment', { id: 'x', eventId: ids[0], date: 'abc' }, d, PLANS, NOW, 'a').error === 'תאריך לא תקין');
  // חיתוך: מסמך עם 60 אירועים — הסה"כ נשמר מהשדה ולא מהיומן החתוך
  const big = Object.assign(docBase(), { 'סה"כ שולם': 5000, log: Array.from({ length: 60 }, (_, i) => ({ id: 'L' + i, t: '2026-01-01T00:00:00.000Z', type: 'הערה', amount: '' })) });
  const rr = GWx.project('recordGymPayment', { id: 'x', amount: 100, validUntil: '2027-03' }, big, PLANS, NOW, 'a');
  ok('🔴 חיתוך יומן ל-60 לא משנה את סה"כ שולם (נשמר מהשדה)', rr.patch['סה"כ שולם'] === 5100 && rr.patch.log.length === 60);
}

section('3. הקרנה — הפעלה, הארכה, עריכה');
{
  const GWx = loadGW().gymWrite;
  const a = GWx.project('activateGymManual', { id: 'x', validUntil: '2027-09', note: 'קיבל חינם' }, docBase(), PLANS, NOW, 'a');
  ok('הפעלה ידנית: פעיל + תוקף + הערה + אירוע', a.patch['סטטוס'] === 'פעיל' && a.patch['בתוקף עד'] === '2027-09-30' && a.patch['הערות מנהל'] === 'קיבל חינם' && a.patch.log[0].type === 'הפעלה ידנית' && a.res.validUntil === '09/2027');
  const exp = Object.assign(docBase(), { 'סטטוס': 'פג תוקף', 'בתוקף עד': '2026-09-30' });
  const e = GWx.project('extendGymMembership', { id: 'x', validUntil: '2027-03', reason: 'חידוש' }, exp, PLANS, NOW, 'a');
  ok('הארכה מחזירה "פג תוקף" לפעיל', e.patch['סטטוס'] === 'פעיל' && e.patch['בתוקף עד'] === '2027-03-31');
  const act = Object.assign(docBase(), { 'סטטוס': 'פעיל' });
  ok('הארכה לא משנה סטטוס פעיל', !('סטטוס' in GWx.project('extendGymMembership', { id: 'x', validUntil: '2027-03' }, act, PLANS, NOW, 'a').patch));
  const m = GWx.project('updateGymMembership', { id: 'x', planId: 'p2', status: 'ממתין לאישור', note: 'בדיקה', reason: 'תיקון' }, docBase(), PLANS, NOW, 'a');
  ok('עריכת מנוי: מסלול+מחיר מהמסלול+סטטוס+הערה', m.patch['מסלול'] === 'חודשי' && m.patch['מחיר מוסכם'] === 80 && m.patch['סטטוס'] === 'ממתין לאישור' && m.patch['הערות מנהל'] === 'בדיקה' && /תיקון/.test(m.patch.log[0].note));
  ok('סטטוס לא מוכר / בלי שינוי — כמו בשרת', GWx.project('updateGymMembership', { id: 'x', status: 'זבל' }, docBase(), PLANS, NOW, 'a').error === 'סטטוס לא מוכר: זבל' && GWx.project('updateGymMembership', { id: 'x' }, docBase(), PLANS, NOW, 'a').error === 'לא נבחר שום שינוי');
  ok('חודש תוקף לא תקין', GWx.project('updateGymMembership', { id: 'x', validUntil: '2027/03' }, docBase(), PLANS, NOW, 'a').error === 'חודש תוקף לא תקין (נדרש YYYY-MM)');
}

section('4. 🔴 התאמה לשרת — gymPaymentSync_ אמיתי מול ההקרנה');
{
  const SHEET_HEAD = ['מזהה', 'מסלול', 'תאריך התחלה', 'בתוקף עד'];
  const LOG_HEAD = ['מזהה מנוי', 'סוג אירוע', 'סכום', 'תאריך'];
  function serverSync(planName, start, end, payments) {
    const row = { 'מזהה': 'G', 'מסלול': planName, 'תאריך התחלה': start, 'בתוקף עד': end };
    const sets = {};
    const sh = { getRange: (r, c) => ({ getValue: () => Object.values(row)[c - 1] }) };
    const logRows = payments.map(p => ['G', p.type || 'תשלום', p.amount, new Date(p.date + 'T00:00:00Z')]);
    const logSh = { getLastRow: () => logRows.length + 1, getLastColumn: () => 4, getRange: () => ({ getValues: () => logRows }) };
    const box = {
      GYM_SHEET: 'ש', GYM_LOG_SHEET: 'י', Utilities: { formatDate: d => d.toISOString().slice(0, 10) }, Session: { getScriptTimeZone: () => 'UTC' },
      gymCols_: s => { const c = {}; (s === logSh ? LOG_HEAD : SHEET_HEAD).forEach((h, i) => c[h] = i + 1); return c; },
      gymRowById_: () => 2, readGymSettings_: () => ({ plans: PLANS }),
      gymRowWriter_: () => ({ set: (k, v) => { sets[k] = v; }, flush() {} }),
    };
    vm.createContext(box);
    vm.runInContext([grab(GS, /function gymPlanByName_\(cfg, name\) \{[\s\S]*?\n\}/), grab(GS, /function gymMonthEnd_\(ym\) \{[\s\S]*?\n\}/), grab(GS, /function gymMonthsBetween_\(from, to\) \{[\s\S]*?\n\}/),
      grab(GS, /function gymToDate_\(v\) \{[\s\S]*?\n\}/), grab(GS, /function gymPaymentSync_\(ss, id\) \{[\s\S]*?\n\}\n/)].join('\n'), box);
    const ss = { getSheetByName: n => n === 'ש' ? sh : logSh };
    const r = box.gymPaymentSync_(ss, 'G');
    return { label: sets['מצב סנכרון'], paidMonths: sets['חודשים ששולמו'], total: sets['סה"כ שולם'], r };
  }
  const GWx = loadGW().gymWrite;
  const cases = [
    ['שנתי', '2026-10-01', '2027-03-31', [{ amount: 360, date: '2026-10-02' }]],
    ['שנתי', '2026-10-01', '2027-03-31', [{ amount: 360, date: '2026-10-02' }, { amount: 360, date: '2026-10-03' }, { amount: 360, date: '2026-10-04' }]],
    ['שנתי', '2026-10-01', '2027-09-30', [{ amount: 360, date: '2026-10-02' }]],
    ['חודשי', '2026-10-01', '2026-10-31', [{ amount: 80, date: '2026-10-02' }, { amount: 80, date: '2026-10-05', type: 'תשלום מבוטל' }]],
    ['שנתי', '', '', []],
  ];
  cases.forEach((c, i) => {
    const sv = serverSync(c[0], c[1], c[2], c[3]);
    const active = c[3].filter(p => !p.type);
    const total = active.reduce((s, p) => s + p.amount, 0);
    const cl = GWx.syncFields({ 'מסלול': c[0], 'תאריך התחלה': c[1], 'בתוקף עד': c[2] }, PLANS, total);
    ok('תרחיש ' + (i + 1) + ': אותו label / חודשים / סכום', cl['מצב סנכרון'] === sv.label && cl['חודשים ששולמו'] === sv.paidMonths && cl['סה"כ שולם'] === sv.total,
      JSON.stringify({ client: [cl['מצב סנכרון'], cl['חודשים ששולמו'], cl['סה"כ שולם']], server: [sv.label, sv.paidMonths, sv.total] }));
  });
  // תאריך סוף חודש כמו השרת
  const mEnd = vm.runInNewContext(grab(GS, /function gymMonthEnd_\(ym\) \{[\s\S]*?\n\}/) + '; gymMonthEnd_("2028-02")');
  ok('סוף חודש (פברואר מעוברת) זהה לשרת', GWx.monthEnd('2028-02') === '2028-02-29' && mEnd.getDate() === 29);
}

section('5. חיבור ל-Firebase — נפילה לאחור ואי-בליעה');
function harness(opts) {
  opts = opts || {};
  const calls = []; const store = {};
  const doc = opts.doc === undefined ? docBase() : opts.doc;
  const cba = {
    data: {
      getGymList: cb => cb({ ok: true }),
    },
    sheets: { postQuiet: (a, p, cb) => { calls.push(['nudge', a, p]); cb && cb({ ok: true }); } },
    ui: { alert: (m) => calls.push(['alert', m]) },
    fb: {
      readDoc: (c, id, cb) => { calls.push(['read', c, id]); cb(null, c === 'gymMembers' ? doc : { plans: PLANS }); },
      createDoc: (c, id, d, cb) => { calls.push(['create', c, id, d]); const e = opts.createErr ? Object.assign(new Error('x'), { code: opts.createErr === true ? 'permission-denied' : opts.createErr }) : null; cb(e, true); },
      mergeDoc: (c, id, f, cb) => { calls.push(['merge', c, id, f]); cb(opts.mergeErr ? new Error('x') : null, true); },
      ensureDb: cb => cb(null), authReady: cb => cb(opts.noUser ? null : { uid: 'u', email: 'Admin@X.com' }),
      flag: (k, d) => k === 'gymWriteFs' ? (opts.flag === undefined ? true : opts.flag) : d,
      serverNow: () => 'NOW', state: () => ({ user: { email: 'admin@x.com' } }), queryCollection: (c, cond, cb) => cb(null, opts.failedRows || [])
    }
  };
  ['recordGymPayment', 'confirmGymPayment', 'updateGymPayment', 'voidGymPayment', 'activateGymManual', 'extendGymMembership', 'updateGymMembership']
    .forEach(t => { cba.data[t] = (d, cb) => { calls.push(['ORIG', t]); cb({ ok: true, orig: true }); }; });
  const C = loadGW(cba);
  return { C, calls };
}
const run = (h, type, data) => new Promise(r => h.C.data[type](data, r));
(async () => {
  const REC = { id: 'GYM-0008', amount: 360, validUntil: '2027-03', method: 'מזומן', activate: true };
  { const h = harness(); const res = await run(h, 'recordGymPayment', REC);
    const kinds = h.calls.map(c => c[0]);
    ok('הצלחה: כוונה → הקרנה → הערת שרת, ובלי הנתיב הישן', kinds.indexOf('create') < kinds.indexOf('merge') && kinds.indexOf('merge') < kinds.indexOf('nudge') && !kinds.includes('ORIG') && res.ok && res.queued);
    const op = h.calls.find(c => c[0] === 'create')[3];
    ok('🔴 op: מזהה מנוי, status pending, by באותיות קטנות, body.id = memberId, eventId', op.memberId === 'GYM-0008' && op.status === 'pending' && op.by === 'admin@x.com' && op.body.id === 'GYM-0008' && op.type === 'recordGymPayment' && op.eventId === op.body.eventId && op.schema === 1);
    ok('ההערה לשרת נושאת את מזהה המנוי', JSON.stringify(h.calls.find(c => c[0] === 'nudge').slice(1)) === JSON.stringify(['gymApplyOps', { id: 'GYM-0008' }]));
    ok('ההקרנה נכתבת עם updatedAt של השרת', h.calls.find(c => c[0] === 'merge')[3].updatedAt === 'NOW');
  }
  { const h = harness({ flag: false }); const res = await run(h, 'recordGymPayment', REC);
    ok('🛑 דגל כבוי → נתיב ישן בלבד, בלי שום כתיבה', res.orig && h.calls.every(c => !['create', 'merge', 'nudge'].includes(c[0])));
  }
  { const h = harness({ noUser: true }); const res = await run(h, 'recordGymPayment', REC);
    ok('לא מחובר → נתיב ישן', res.orig && !h.calls.some(c => c[0] === 'create'));
  }
  { const h = harness({ doc: null }); const res = await run(h, 'recordGymPayment', REC);
    ok('מסמך מנוי לא קיים → נתיב ישן', res.orig && !h.calls.some(c => c[0] === 'create'));
  }
  { const d = docBase(); d.schema = 1; const h = harness({ doc: d }); const res = await run(h, 'recordGymPayment', REC);
    ok('מסמך בלי schema 2 → נתיב ישן', res.orig && !h.calls.some(c => c[0] === 'create'));
  }
  { const h = harness({ createErr: true }); const res = await run(h, 'recordGymPayment', REC);
    ok('🔴 כתיבת הכוונה נדחתה בוודאות (הרשאה) → נתיב ישן, לא נכתבה הקרנה ולא הוערה', res.orig && !h.calls.some(c => c[0] === 'merge' || c[0] === 'nudge'));
  }
  { const h = harness({ createErr: 'deadline-exceeded' }); const res = await run(h, 'recordGymPayment', REC);
    ok('🔴🔴 פסק זמן ברשת איטית → **לא** נתיב ישן (ה-SDK עלול להשלים את הכתיבה = ביצוע כפול), שגיאה ברורה', res.ok === false && /לא ברור אם הפעולה נשמרה/.test(res.error) && !h.calls.some(c => c[0] === 'ORIG' || c[0] === 'merge' || c[0] === 'nudge'));
  }
  { const h = harness({ mergeErr: true }); const res = await run(h, 'recordGymPayment', REC);
    ok('🔴 ההקרנה נכשלה אחרי שהכוונה נשמרה → עדיין הצלחה + הערה לשרת (לא נכפל בנתיב ישן)', res.ok && res.queued && h.calls.some(c => c[0] === 'nudge') && !h.calls.some(c => c[0] === 'ORIG'));
  }
  { const h = harness(); const res = await run(h, 'recordGymPayment', { id: 'GYM-0008', amount: 0, validUntil: '2027-03' });
    ok('שגיאת ולידציה → ok:false עם ההודעה, בלי שום כתיבה', res.ok === false && res.error === 'יש להזין את הסכום שהתקבל' && h.calls.every(c => !['create', 'merge', 'nudge', 'ORIG'].includes(c[0])));
  }
  { const h = harness(); const res = await run(h, 'voidGymPayment', { id: 'GYM-0008', eventId: 'LOG-OLD' });
    ok('ביטול של אירוע שנחתך מהמסמך → נתיב ישן', res.orig === true);
  }
  { const h = harness(); const res = await run(h, 'recordGymPayment', { amount: 5 });
    ok('בלי מזהה מנוי → נתיב ישן', res.orig === true);
  }

  section('6. 🔴 כללי האבטחה — כל מה שהלקוח כותב מותר');
  {
    const allowed = vm.runInNewContext(grab(RULES, /function gymMemberPatchKeys\(\) \{\s*return (\[[\s\S]*?\]);/).match(/\[[\s\S]*\]/)[0]);
    const GWx = loadGW().gymWrite;
    const samples = [
      ['recordGymPayment', { id: 'x', amount: 360, validUntil: '2027-03', note: 'n' }], ['confirmGymPayment', { id: 'x', amount: 360, validUntil: '2027-03' }],
      ['activateGymManual', { id: 'x', validUntil: '2027-03', note: 'n' }], ['extendGymMembership', { id: 'x', validUntil: '2027-03' }],
      ['updateGymMembership', { id: 'x', planId: 'p2', price: 5, startDate: '2026-10-02', validUntil: '2027-03', status: 'פעיל', note: 'n' }]];
    const bad = new Set();
    samples.forEach(s => { const r = GWx.project(s[0], s[1], docBase(), PLANS, NOW, 'a'); Object.keys(r.patch).forEach(k => { if (!allowed.includes(k)) bad.add(s[0] + ':' + k); }); });
    const dp = Object.assign(docBase(), { log: [{ id: 'LOG-1', t: NOW.toISOString(), type: 'תשלום', amount: 360 }], 'סה"כ שולם': 360 });
    ['updateGymPayment', 'voidGymPayment'].forEach(t => { const r = GWx.project(t, { id: 'x', eventId: 'LOG-1', amount: 100, reason: 'r' }, dp, PLANS, NOW, 'a'); Object.keys(r.patch).forEach(k => { if (!allowed.includes(k)) bad.add(t + ':' + k); }); });
    ok('כל שדות ההקרנה (שבע הפעולות) ברשימת gymMemberPatchKeys בכללים', bad.size === 0, [...bad].join(', '));
    ok('🔴 הרשימה בכללים לא כוללת שדות מזהים/רגישים (familyId, uid, slot, schema, חתימה, הצהרה, שאלון)',
      !allowed.some(k => /familyId|uid|slot|schema|חתימה|קישור|רופא|דגל|גרסת שאלון|שאלות/.test(k)), allowed.join('|'));
    const statuses = vm.runInNewContext(grab(RULES, /function gymStatuses\(\) \{\s*return (\[[\s\S]*?\]);/).match(/\[[\s\S]*\]/)[0]);
    const editable = vm.runInNewContext(grab(GS, /var GYM_EDITABLE_STATUSES = \[[\s\S]*?\];/).match(/\[[\s\S]*\]/)[0].replace(/GYM_ST_(\w+)/g, '"$1"'));
    ok('רשימת הסטטוסים בכללים = GYM_EDITABLE_STATUSES בשרת (10)', statuses.length === 10 && editable.length === 10);
    ok('סטטוסי ההקרנה בלקוח כולם ברשימת הכללים', ['פעיל', 'ממתין לאישור', 'פג תוקף', 'ממתין לתשלום'].every(s => statuses.includes(s)));
    const types = vm.runInNewContext(grab(RULES, /function gymOpTypes\(\) \{\s*return (\[[\s\S]*?\]);/).match(/\[[\s\S]*\]/)[0]);
    const srvTypes = Object.keys(vm.runInNewContext('(' + grab(GF, /var GYM_OP_TYPES = \{[\s\S]*?\};/).replace('var GYM_OP_TYPES = ', '').replace(/;$/, '') + ')'));
    ok('🔴 סוגי הפעולות: לקוח = כללים = שרת (שבעה)', JSON.stringify(types.slice().sort()) === JSON.stringify(GWx.TYPES.slice().sort()) && JSON.stringify(srvTypes.slice().sort()) === JSON.stringify(types.slice().sort()) && types.length === 7);
    const rule = grab(RULES, /function gymOpOk\(\) \{[\s\S]*?\n    \}\n/);
    ok('gymOpOk: by חייב להיות מייל המחובר, status pending, body.id = memberId, קיום מנוי, רשימת שדות סגורה',
      /d\.by == request\.auth\.token\.email\.lower\(\)/.test(rule) && /d\.status == 'pending'/.test(rule) && /d\.body\.id == d\.memberId/.test(rule) && /exists\(\/databases\/\$\(database\)\/documents\/gymMembers\/\$\(d\.memberId\)\)/.test(rule) && /hasOnly\(\['memberId', 'type', 'body', 'by', 'createdAt', 'status', 'schema', 'eventId'\]\)/.test(rule));
    ok('gymOps: יצירה בלבד למנהל מכון פנימי; update/delete סגורים', /match \/gymOps\/\{opId\} \{[\s\S]*?allow create: if isInternalAdmin\('מכון'\) && gymOpOk\(\);[\s\S]*?allow update, delete: if false;/.test(RULES));
    ok('gymMembers: update למנהל מכון פנימי בלבד עם affectedKeys; create/delete סגורים',
      /match \/gymMembers\/\{docId\} \{[\s\S]*?allow update: if isInternalAdmin\('מכון'\) &&[\s\S]*?affectedKeys\(\)\.hasOnly\(gymMemberPatchKeys\(\)\)[\s\S]*?allow create, delete: if false;/.test(RULES));
    ok('הקריאה ל-gymMembers נשארה למנהל מכון בלבד', /match \/gymMembers\/\{docId\} \{\s*allow read: if canSeeDoorState\(\);/.test(RULES));
    const opKeys = Object.keys(harness && (await (async () => { const h = harness(); await run(h, 'recordGymPayment', REC); return h.calls.find(c => c[0] === 'create')[3]; })()));
    ok('כל שדות ה-op שהלקוח כותב ברשימת הכללים', opKeys.every(k => ['memberId', 'type', 'body', 'by', 'createdAt', 'status', 'schema', 'eventId'].includes(k)), opKeys.join(','));
  }

  section('7. שרת — gymApplyOps_ / gymRunOp_');
  {
    function srv(opts) {
      opts = opts || {};
      const store = {}; (opts.ops || []).forEach(o => store[o.id] = JSON.parse(JSON.stringify(o.data)));
      const calls = [];
      const logEvents = new Set(opts.logEvents || []);
      const box = {
        Logger: { log() {} }, Date, JSON, Object, String, Number, Array,
        GYM_LOG_SHEET: 'י', FS_GYM_OPS: 'gymOps',
        fsDocPath_: (c, id) => c + '/' + id,
        fsQuery_: (c, f, op, v) => Object.keys(store).filter(id => store[id][f] === v).map(id => ({ id, data: store[id] })),
        fsDelete_: p => { calls.push(['del', p]); delete store[p.split('/')[1]]; },
        fsMerge_: (p, o) => { calls.push(['merge', p, o]); store[p.split('/')[1]] = Object.assign(store[p.split('/')[1]] || {}, o); },
        fsGet_: p => store[p.split('/')[1]] || null,
        LockService: { getDocumentLock: () => ({ waitLock() { calls.push(['lock']); }, releaseLock() { calls.push(['unlock']); } }) },
        ensureLogged: null,
        gymCols_: () => ({ 'מזהה אירוע': 1 }), gymLogRowByEvent_: (sh, lc, id) => logEvents.has(id) ? 5 : 0,
        doorGymAfterWrite_: (ss, b, res) => calls.push(['door', b.id, JSON.parse(res.getContent()).ok]),
      };
      const mk = name => (ss, body) => { calls.push([name, JSON.stringify(body)]); const r = opts.results && opts.results[name] ? opts.results[name](body) : { ok: true }; if (r.ok && body.eventId && !opts.noLogRow && /Payment_/.test(name)) logEvents.add(body.eventId); return r; };
      ['recordGymPayment_', 'confirmGymPayment_', 'updateGymPayment_', 'voidGymPayment_', 'activateGymManual_', 'extendGymMembership_', 'updateGymMembership_'].forEach(n => box[n] = mk(n));
      box.ensure = 0;
      vm.createContext(box);
      const ss = { getSheetByName: () => ({}) };
      vm.runInContext([grab(GF, /var GYM_OP_TYPES = \{[\s\S]*?\};/), grab(GF, /function gymRunOp_\(ss, type, body\) \{[\s\S]*?\n\}\n/), grab(GF, /function gymPendingOps_\(memberId\) \{[\s\S]*?\n\}\n/),
        grab(GF, /function gymPendingMemberIds_\(\) \{[\s\S]*?\n\}\n/), grab(GF, /function gymApplyOps_\(ss, memberId\) \{[\s\S]*?\n\}\n/), grab(GF, /function gymApplyOpsLocked_\(ss, pend, out\) \{[\s\S]*?\n\}\n/), grab(GF, /function gymPruneFailedOps_\(\) \{[\s\S]*?\n\}\n/)].join('\n'), box);
      return { box, ss, calls, store };
    }
    const op = (id, mem, type, at, body, by) => ({ id, data: { memberId: mem, type, body: Object.assign({ id: mem }, body || {}), by: by || 'm@x.com', createdAt: at, status: 'pending', eventId: (body || {}).eventId } });

    { const s = srv({ ops: [op('b', 'GYM-8', 'voidGymPayment', '2026-10-03T10:00:02Z', { eventId: 'E1' }), op('a', 'GYM-8', 'recordGymPayment', '2026-10-03T10:00:01Z', { amount: 360, eventId: 'E9' }), op('c', 'GYM-9', 'extendGymMembership', '2026-10-03T10:00:03Z', { validUntil: '2027-03' })] });
      const r = s.box.gymApplyOps_(s.ss);
      const order = s.calls.filter(c => /_$/.test(c[0])).map(c => c[0]);
      ok('מחיל לפי סדר יצירה (ישן ראשון) בפונקציות הקיימות', JSON.stringify(order) === JSON.stringify(['recordGymPayment_', 'voidGymPayment_', 'extendGymMembership_']), order.join());
      ok('כל op שהוחל נמחק', r.applied === 3 && Object.keys(s.store).length === 0 && s.calls.filter(c => c[0] === 'del').length === 3);
      ok('🔴 סנכרון דלת+מסמך פעם אחת לכל מנוי (לא לכל op)', s.calls.filter(c => c[0] === 'door').length === 2 && s.calls.filter(c => c[0] === 'door').every(c => c[2] === true));
      const first = JSON.parse(s.calls.find(c => c[0] === 'recordGymPayment_')[1]);
      ok('🔴 גוף הקריאה: _email מה-op (לא מהדפדפן), eventId, id', first._email === 'm@x.com' && first.eventId === 'E9' && first.id === 'GYM-8' && first.amount === 360);
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'recordGymPayment', '1', { amount: 360, eventId: 'E9' })], logEvents: ['E9'] });
      const r = s.box.gymApplyOps_(s.ss);
      ok('🔴 אידמפוטנטי: תשלום שכבר ביומן לא נרשם שוב (קריסה בין החלה למחיקה)', r.already === 1 && !s.calls.some(c => c[0] === 'recordGymPayment_') && Object.keys(s.store).length === 0);
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'voidGymPayment', '1', { eventId: 'E1' })], results: { voidGymPayment_: () => ({ ok: false, error: 'התשלום כבר מבוטל' }) } });
      const r = s.box.gymApplyOps_(s.ss);
      ok('ביטול חוזר ("כבר מבוטל") נחשב כהוחל', r.already === 1 && r.failed === 0 && Object.keys(s.store).length === 0);
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'recordGymPayment', '1', { amount: 360 }), op('b', 'GYM-8', 'extendGymMembership', '2', { validUntil: '2027-03' })], results: { recordGymPayment_: () => ({ ok: false, error: 'כבר נרשם תשלום זהה' }) } });
      const r = s.box.gymApplyOps_(s.ss);
      ok('🔴 כישלון לא נבלע: ה-op נשאר עם status failed + הודעה', r.failed === 1 && s.store.a && s.store.a.status === 'failed' && /כבר נרשם תשלום זהה/.test(s.store.a.error) && s.store.a.failedAt);
      ok('כישלון לא עוצר את ה-op הבא, והמנוי מסונכרן מהגיליון (המסך חוזר לאמת)', r.applied === 1 && !s.store.b && s.calls.some(c => c[0] === 'door' && c[1] === 'GYM-8'));
      ok('op שנכשל לא יוחל שוב בריצה הבאה (status אינו pending)', s.box.gymApplyOps_(s.ss).found === 0);
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'recordGymPayment', '1', { amount: 1 })], results: { recordGymPayment_: () => { throw new Error('boom'); } } });
      const r = s.box.gymApplyOps_(s.ss);
      ok('חריגה בתוך הפונקציה → failed ולא קריסה', r.failed === 1 && s.store.a.status === 'failed' && /boom/.test(s.store.a.error));
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'hackGym', '1', {})] });
      const r = s.box.gymApplyOps_(s.ss);
      ok('🔴 סוג לא מוכר נדחה (לא מריץ שום פונקציה)', r.failed === 1 && /סוג פעולה לא מוכר/.test(s.store.a.error) && !s.calls.some(c => /_$/.test(c[0])));
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'extendGymMembership', '1', { validUntil: '2027-03' }), op('b', 'GYM-9', 'extendGymMembership', '2', { validUntil: '2027-03' })] });
      const r = s.box.gymApplyOps_(s.ss, 'GYM-9');
      ok('הגבלה למנוי אחד מחילה רק אותו', r.found === 1 && !!s.store.a && !s.store.b);
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'recordGymPayment', '1', { amount: 360, eventId: 'E9' })] });
      s.box.gymApplyOps_(s.ss);
      const k = s.calls.map(c => c[0]);
      ok('🔴 ההחלה כולה תחת נעילת מסמך (נעילה לפני ההפעלה, שחרור אחריה)', k[0] === 'lock' && k.lastIndexOf('unlock') === k.length - 1 && k.indexOf('recordGymPayment_') > k.indexOf('lock'));
      const r2 = s.box.gymApplyOps_(s.ss);
      ok('🔴 מחיל שני (מקביל) רואה שה-op כבר הוחל: לא מריץ שוב', r2.found === 0 && s.calls.filter(c => c[0] === 'recordGymPayment_').length === 1);
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'recordGymPayment', '1', { amount: 360, eventId: 'E9' })], results: { recordGymPayment_: (b) => { delete s.store.a; return { ok: false, error: 'x' }; } } });
      s.box.gymApplyOps_(s.ss);
      ok('🔴 op שנמחק בינתיים לא "מוקם לתחייה" כמסמך רפאים של failed', !s.store.a && !s.calls.some(c => c[0] === 'merge'));
    }
    { const s = srv({ ops: [op('a', 'GYM-8', 'recordGymPayment', '1', { amount: 360, eventId: 'E9' })], noLogRow: true });
      const r = s.box.gymApplyOps_(s.ss);
      ok('🔴 תשלום שהשורה עודכנה אך לא נרשם ביומן (gymLog_ בולעת שגיאות) → failed, ה-op לא נמחק', r.failed === 1 && s.store.a && s.store.a.status === 'failed' && /לא נרשם ביומן/.test(s.store.a.error));
    }
    { ok('🔴 gymActivate_: עם eventId (מתור gymOps) מגן 180 השניות לא פועל — תשלום לגיטימי לא הולך לאיבוד', /var dupAgo = body\.eventId \? null : gymRecentDuplicatePayment_/.test(GS)); }
    { const s = srv({ ops: [] });
      const r = s.box.gymApplyOps_(s.ss);
      ok('אין ops → no-op מהיר, בלי סנכרון', r.found === 0 && s.calls.length === 0);
    }
    { const s = srv({ ops: [{ id: 'old', data: { memberId: 'G', type: 'x', status: 'failed', failedAt: new Date(Date.now() - 20 * 86400000).toISOString() } }, { id: 'new', data: { memberId: 'G', type: 'x', status: 'failed', failedAt: new Date().toISOString() } }] });
      const n = s.box.gymPruneFailedOps_();
      ok('ניקוי: failed ישן (14+ יום) נמחק, חדש נשאר', n === 1 && !s.store.old && !!s.store.new);
    }
  }

  section('8. חיווט');
  ok('נתב + הרשאה + מפת תחומים', /case 'gymApplyOps':\s+return json_\(gymApplyOps_\(ss, body\.id\)\);/.test(GS) && /gymApplyOps: PERM_GYM,/.test(GS) && /gymApplyOps: 'gym'/.test(GS));
  const flagKeys = grab(GS, /var FLAG_KEYS = \[[\s\S]*?'appsScriptFallback'\];/);
  ok('🔴 שני הדגלים ב-FLAG_KEYS (gymAdminFs היה חסר — כיבוי שלב 1 לא עבד ממסך מצב המערכת)', /'gymAdminFs'/.test(flagKeys) && /'gymWriteFs'/.test(flagKeys));
  ok('מסך מצב המערכת: שני הדגלים עם ברירות מחדל נכונות (true/false)', /gymAdminFs:[^\n]*, true\]/.test(SYS) && /gymWriteFs:[^\n]*, false\]/.test(SYS));
  ok('ברירת המחדל בלקוח: gymWriteFs=false, gymAdminFs=true', /flag\("gymWriteFs", false\)/.test(GW) && /flag\("gymAdminFs", true\)/.test(R('js/data/gymFs.js')));
  ok('gymLog_ מקבל eventId, ו-gymActivate_ מעביר אותו', /extra\.eventId \|\| \('LOG-' \+ Date\.now\(\)\)/.test(GS) && /eventId: body\.eventId \|\| ''/.test(GS));
  ok('🔴 הטריגר השעתי מחיל ops לפני הסנכרון המלא', /out\.ops = gymApplyOps_\(ss\);[\s\S]*out\.members = gymMembersSyncAll_\(ss\)/.test(GF));
  ok('🔴 סנכרון מלא וסנכרון-למנוי לא דורסים מנוי עם op ממתין', /pending\[id\]\) \{ held\.push\(id\)/.test(GF) && /if \(pending\[id\]\) return;/.test(GF) && /live\[id\] = 1/.test(GF));
  ok('index.html: gymWrite.js נטען אחרי gymFs.js', IDX.indexOf('js/data/gymFs.js') > 0 && IDX.indexOf('js/data/gymFs.js') < IDX.indexOf('js/data/gymWrite.js'));
  ok('gymWrite.js מוטבע ב-service worker (לא יתום)', /"js\/data\/gymWrite\.js": "[0-9a-f]{10}"/.test(SW) && !/gymWrite\.js\?v=0000000000/.test(IDX));
  ok('gymWrite.js עוטף את שבע הפעולות ולא את יצירה/מחיקה', GW.includes('"recordGymPayment", "confirmGymPayment", "updateGymPayment", "voidGymPayment"') && !/createGymMembership|deleteGymMembership/.test(GW.replace(/\/\*[\s\S]*?\*\//g, '')));
  ok('תחביר Code.gs / GymFirestore.gs', (() => { try { new Function(GS); new Function(GF); return true; } catch (e) { return false; } })());

  console.log('\n' + (fail ? '❌ ' + fail + ' נכשלו' : '✅ הכול עבר') + ' (' + pass + ' עברו)');
  process.exit(fail ? 1 : 0);
})();
