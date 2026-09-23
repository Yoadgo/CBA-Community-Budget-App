'use strict';
/* ============================================================================
 *  מרכז ההתראות — סבב 3 (23.9.2026): טריגרים וסיכומים מותאמים, הרשאות, AI
 * ----------------------------------------------------------------------------
 *  Code.gs + Firestore.gs + Notify.gs האמיתיים, גיליון מזויף, Gemini מזויף.
 *   1. הרשאות: מנהל-על יוצר (מושהה/פעיל); מנהל תחום מציע (ממתין לאישור)
 *      רק בתחום שלו; הגנן והתושב חסומים (ACTION_PERMS).
 *   2. וולידציה: משתנים שלא קיימים, תאריך שעבר, בלי ערוץ.
 *   3. תזמון: שבועי/יומי/חודשי/פעם אחת/יחסית ליומן — פעם אחת לכל מופע.
 *   4. ממתין לאישור לא יוצא; אישור → יוצא; מי שהציע מקבל הודעה.
 *   5. סיכום: מדדים, "רק כשיש מה לדווח", לא לכל התושבים.
 *   6. AI: שמירת משתנים (ניסיון שני), מגבלת שימוש, בלי שמירה אוטומטית.
 *  הרצה: node tools/test-notify-custom-2026-09-23.js
 * ========================================================================== */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x !== undefined ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const APP = path.join(__dirname, '..', 'apps-script');
const SRC = ['Code.gs', 'Firestore.gs', 'Notify.gs'].map(f => fs.readFileSync(path.join(APP, f), 'utf8'));
/* ---------- גיליון מזויף ---------- */
function makeSheet(name, rows) {
  const data = rows.map(r => r.slice());
  const sh = {
    name, data,
    getLastRow: () => data.length,
    getLastColumn: () => data.reduce((m, r) => Math.max(m, r.length), 0),
    getDataRange: () => ({ getValues: () => { const w = sh.getLastColumn(); return data.map(r => { const x = r.slice(); while (x.length < w) x.push(''); return x; }); } }),
    getRange: (r, c, nr, nc) => {
      nr = nr || 1; nc = nc || 1;
      const rng = {
        setValues: vals => { vals.forEach((row, i) => { const rr = r - 1 + i; while (data.length <= rr) data.push([]); row.forEach((v, j) => { while (data[rr].length < c - 1 + j) data[rr].push(''); data[rr][c - 1 + j] = v; }); }); return rng; },
        setValue: v => rng.setValues([[v]]),
        getValues: () => { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push(((data[r - 1 + i] || [])[c - 1 + j]) ?? ''); out.push(row); } return out; },
        getValue: () => rng.getValues()[0][0],
        setFontWeight: () => rng
      };
      return rng;
    },
    appendRow: row => { data.push(row.slice()); },
    deleteRow: r => { data.splice(r - 1, 1); },
    setFrozenRows() {}, setColumnWidth() {}
  };
  return sh;
}
function makeSS(sheets) {
  const map = {};
  sheets.forEach(s => { map[s.name] = s; });
  return { getSheetByName: n => map[n] || null, insertSheet: n => (map[n] = makeSheet(n, [])), _map: map };
}

/* ---------- סביבה ---------- */
let mails, pushes, fsDocs, fsQueries, nowDate, props, fetches = [], uuidN = 0, geminiReply = () => ({});
function world(opts) {
  opts = opts || {};
  mails = []; pushes = []; fsDocs = {}; fsQueries = 0; props = {};
  const residents = makeSheet('תושבים', [
    ['מזהה קבוע', 'שם משפחה', 'בית', 'שם פרטי 1', 'אימייל 1', 'הרשאות 1', 'מזהה Firebase 1', 'שם פרטי 2', 'אימייל 2', 'הרשאות 2', 'מזהה Firebase 2', 'סטטוס', 'סוג משתמש'],
    ['F1', 'כהן', '1', 'דנה', 'dana@x.com', '', 'U1', 'רון', 'ron@x.com', '', 'U1b', 'פעיל', ''],
    ['F2', 'לוי', '2', 'יועד', 'super@x.com', 'על', 'U2', '', '', '', '', 'פעיל', ''],
    ['F3', 'מזרחי', '3', 'מיכל', 'gmgr@x.com', opts.noGardenMgr ? '' : 'גינון', 'U3', 'בעל', 'spouse3@x.com', '', 'U3b', 'פעיל', ''],
    ['F4', 'גנן', '', 'אביתר', 'gard@x.com', 'גינון', 'U4', '', '', '', '', 'פעיל', 'חיצוני'],
    ['F5', 'בר', '5', 'אבי', 'bud@x.com', 'תקציב', 'U5', '', '', '', '', 'פעיל', ''],
    ['F6', 'ישן', '6', 'עזב', 'left@x.com', 'גינון', 'U6', '', '', '', '', 'עזב', '']
  ]);
  const ss = makeSS([residents, makeSheet('הגדרות מיילים', [])]);
  const subsByFam = opts.subs || { F1: 1, F2: 1, F3: 1, F4: 1, F5: 1 };
  const sb = {
    console, JSON, Math, Date, Object, Array, String, Number, RegExp, Error, isNaN, parseInt, encodeURIComponent, decodeURIComponent,
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => 'abcd' + (++uuidN) + 'ef-0000', formatDate: (d, tz, f) => {
        const x = new Date(d.getTime() + 3 * 3600000);   // שעון ישראל (קיץ)
        const p = n => (n < 10 ? '0' : '') + n;
        if (f === 'H') return String(x.getUTCHours());
        if (f === 'yyyy') return String(x.getUTCFullYear());
        if (f === 'u') { const g = x.getUTCDay(); return String(g === 0 ? 7 : g); }
        if (f === 'yyyy-MM-dd') return x.getUTCFullYear() + '-' + p(x.getUTCMonth() + 1) + '-' + p(x.getUTCDate());
        if (f === 'd.M') return x.getUTCDate() + '.' + (x.getUTCMonth() + 1);
        if (f === 'HH:mm') return p(x.getUTCHours()) + ':' + p(x.getUTCMinutes());
        return x.toISOString();
      }
    },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'gizbar@x.com' }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; }, getKeys: () => Object.keys(props) }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    MailApp: { sendEmail: o => mails.push(o) },
    DriveApp: {}, CalendarApp: {}, ScriptApp: {},
    ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, body: JSON.parse(o.payload) }); const r = geminiReply(JSON.parse(o.payload)); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] } }] }) }; } }
  };
  vm.createContext(sb);
  SRC.forEach(s => vm.runInContext(s, sb));
  sb.json_ = o => o;
  sb.fsSet_ = (p, o) => { fsDocs[p] = JSON.parse(JSON.stringify(o)); return {}; };
  sb.fsMerge_ = (p, o) => { fsDocs[p] = Object.assign(fsDocs[p] || {}, JSON.parse(JSON.stringify(o))); return {}; };
  /* מנוי לפי uid: U3 ↔ F3 וכו'. הטוקן נקרא על שם המשפחה, כך ש-pushTo(F3)
     תופס גם פוש אישי למנהלת. U3b (בן הזוג) — טוקן משלו. */
  sb.fsGet_ = p => {
    const m = /^pushSubscriptions\/(U\d)(b?)$/.exec(p);
    if (m) { const fam = 'F' + m[1].slice(1); return subsByFam[fam] ? { token: 't_' + fam + (m[2] ? '_spouse' : ''), familyId: fam } : null; }
    return fsDocs[p] ? JSON.parse(JSON.stringify(fsDocs[p])) : null;
  };
  sb.fsDelete_ = p => { delete fsDocs[p]; return true; };
  sb.fsDocPath_ = (c, id) => c + '/' + id;
  sb.fsQuery_ = (coll, field, op, val) => {
    fsQueries++;
    if (coll === 'pushSubscriptions') return subsByFam[val] ? [{ id: 'uid_' + val, data: { token: 't_' + val, familyId: val } }] : [];
    return Object.keys(fsDocs).filter(k => k.indexOf(coll + '/') === 0 && fsDocs[k][field] === val)
      .map(k => ({ id: k.slice(coll.length + 1), data: fsDocs[k] }));
  };
  sb.fsList_ = coll => Object.keys(fsDocs).filter(k => k.indexOf(coll + '/') === 0).map(k => ({ id: k.slice(coll.length + 1), data: fsDocs[k] }));
  sb.fcmSendToToken_ = (tok, title, body, data) => { pushes.push({ tok, title, body, data }); return true; };
  sb.txFamilyNames_ = () => ({ F1: 'דנה כהן', F2: 'יועד לוי' });
  nowDate = opts.now || new Date('2026-09-23T09:00:00Z');   // 12:00 בישראל, רביעי
  sb.Date = class extends Date { constructor(...a) { if (!a.length) super(nowDate.getTime()); else super(...a); } static now() { return nowDate.getTime(); } };
  sb.getEmailSettings_(ss);   // זריעה
  sb.ensureNotifySheet_(ss);
  return { sb, ss };
}
const to = m => String(m.to || '') + (m.bcc ? '|bcc:' + m.bcc : '');
const mailTo = addr => mails.filter(m => to(m).indexOf(addr) !== -1);
const pushTo = fam => pushes.filter(p => p.tok === 't_' + fam);
function setCell(ss, trig, role, col, val) {
  const sh = ss.getSheetByName('הגדרות התראות');
  const r = sh.data.findIndex(x => x[0] === trig && x[1] === role);
  if (r < 0) throw new Error('no row ' + trig + '|' + role);
  sh.data[r][col] = val;
}
function setGlobal(ss, key, val) {
  const sh = ss.getSheetByName('הגדרות מיילים');
  const r = sh.data.findIndex(x => x[0] === key);
  if (key === 'MASTER_ENABLED') sh.data[r][5] = val; else sh.data[r][2] = val;
}


/* ========================================================================== */
const SUP = { isSuper: true, perms: ['על'], firstName: 'יועד', family: 'לוי' };
const GMGR = { isSuper: false, perms: ['גינון'], firstName: 'מיכל', family: 'מזרחי' };
const BUD = { isSuper: false, perms: ['תקציב'], firstName: 'אבי', family: 'בר' };
const W = (o) => { const w = world(o); props.GEMINI_API_KEY = 'k'; return w; };
const draftWeekly = (x) => Object.assign({ name: 'פח כתום', dom: 'evt', roles: ['all'],
  sched: { type: 'weekly', dow: 4, hour: 18 }, channels: { p: true, m: false },
  pt: 'מחר איסוף אריזות', pb: 'זה הזמן להוציא את הפח הכתום · {{יום}} {{תאריך}}' }, x || {});
const cxRows = ss => (ss.getSheetByName('טריגרים מותאמים') || { data: [[]] }).data.slice(1);
const setNow = iso => { nowDate = new Date(iso); };
const as = (sb, perm, email) => { sb.authorize_ = () => ({ ok: true, perm: perm, email: email }); return sb.handleListNotifySettings_({}); };

section('1. הרשאות — מי יוצר, מי מאשר');
{
  const { sb, ss } = W();
  const a = sb.saveCustomTrigger_(ss, { draft: draftWeekly(), _perm: SUP, _email: 'super@x.com' });
  ok('מנהל-על: נכנס מושהה', a.ok && a.status === 'מושהה', JSON.stringify(a));
  const b = sb.saveCustomTrigger_(ss, { draft: draftWeekly({ name: 'שני' }), activate: true, _perm: SUP, _email: 'super@x.com' });
  ok('מנהל-על עם "הוספה והפעלה": פעיל', b.ok && b.status === 'פעיל');
  mails = []; pushes = [];
  const c = sb.saveCustomTrigger_(ss, { draft: draftWeekly({ name: 'השקיה', dom: 'gar', roles: ['a', 'g'] }), _perm: GMGR, _email: 'gmgr@x.com' });
  ok('מנהלת גינון: נכנס "ממתין לאישור"', c.ok && c.status === 'ממתין לאישור', JSON.stringify(c));
  ok('ומנהל-על מקבל הודעה על ההצעה', mailTo('super@x.com').some(m => /ממתין לאישורך: השקיה/.test(m.subject)) && pushTo('F2').length === 1,
     JSON.stringify(mails.map(m => m.subject)));
  const d = sb.saveCustomTrigger_(ss, { draft: draftWeekly({ dom: 'bud', roles: ['a'] }), _perm: GMGR, _email: 'gmgr@x.com' });
  ok('🔴 מנהלת גינון לא יוצרת בתחום התקציב', d.ok === false, JSON.stringify(d));
  const e = sb.saveCustomTrigger_(ss, { draft: draftWeekly({ dom: 'evt' }), _perm: GMGR, _email: 'gmgr@x.com' });
  ok('🔴 ולא ב"אירועים" (תחום של מנהל-על)', e.ok === false);
  ['saveCustomTrigger', 'customTriggerAction', 'notifyAiRewrite', 'notifyAiBuild', 'notifyAiSummary', 'notifyTestSend'].forEach(k => {
    ok('ACTION_PERMS.' + k + ' = כל מנהל (לא תושב, לא הגנן)', sb.ACTION_PERMS[k] === '*');
  });
  ok('ACTION_PERMS.saveNotifyCell = מנהל-על', sb.ACTION_PERMS.saveNotifyCell === 'על');

  const lm = as(sb, GMGR, 'gmgr@x.com');
  const gar = lm.domains.find(x => x.id === 'gar');
  const row = gar && gar.rows.find(r => r.cx);
  ok('מנהלת גינון רואה את ההצעה שלה בלשונית גינון, "שלי", צפייה בלבד',
     lm.ok && lm.canEdit === false && row && row.cx.mine && row.cx.status === 'ממתין לאישור', JSON.stringify(row && row.cx));
  ok('הבונה שלה: רק גינון, עם "הגנן"', lm.builder.domains.map(x => x.id).join() === 'gar' && !!lm.builder.domains[0].roles.g);
  ok('עמודות הלשונית כוללות את הנמענים של הטריגר', !!gar.cols.g && !!gar.cols.a);
  const ls = as(sb, SUP, 'super@x.com');
  ok('מנהל-על: הבונה כולל את כל התחומים, ובאירועים אין "מנהל התחום"', ls.builder.domains.length === 7 && !ls.builder.domains.find(x => x.id === 'evt').roles.a);

  const id = c.id;
  const ed = sb.saveCustomTrigger_(ss, { id, draft: draftWeekly({ name: 'השקיה 2', dom: 'gar', roles: ['a'] }), _perm: GMGR, _email: 'gmgr@x.com' });
  ok('עד האישור — מי שהציעה עורכת', ed.ok && cxRows(ss).find(r => r[0] === id)[3] === 'השקיה 2');
  const ap0 = sb.customTriggerAction_(ss, { id, op: 'approve', _perm: GMGR, _email: 'gmgr@x.com' });
  ok('🔴 מנהלת גינון לא מאשרת בעצמה', ap0.ok === false);
  mails = []; pushes = [];
  const ap = sb.customTriggerAction_(ss, { id, op: 'approve', note: 'מעולה', _perm: SUP, _email: 'super@x.com' });
  ok('מנהל-על מאשר → פעיל', ap.ok && ap.status === 'פעיל');
  ok('ומי שהציעה מקבלת "אושר"', mailTo('gmgr@x.com').some(m => /אושר ופעיל/.test(m.subject)), JSON.stringify(mails.map(m => to(m) + ' ' + m.subject)));
  const ed2 = sb.saveCustomTrigger_(ss, { id, draft: draftWeekly({ name: 'x', dom: 'gar', roles: ['a'] }), _perm: GMGR, _email: 'gmgr@x.com' });
  ok('🔴 אחרי אישור — היא כבר לא עורכת', ed2.ok === false);
  const del = sb.customTriggerAction_(ss, { id, op: 'delete', _perm: GMGR, _email: 'gmgr@x.com' });
  ok('🔴 ולא מוחקת', del.ok === false);
  const p = sb.customTriggerAction_(ss, { id, op: 'pause', _perm: SUP, _email: 'super@x.com' });
  ok('מנהל-על משהה', p.ok && p.status === 'מושהה');
  const dl = sb.customTriggerAction_(ss, { id, op: 'delete', _perm: SUP, _email: 'super@x.com' });
  sb.notifyResetMemo_();
  ok('ומוחק — גם השורות בטבלה נעלמות', dl.ok && !cxRows(ss).some(r => r[0] === id) &&
     !ss.getSheetByName('הגדרות התראות').data.some(r => r[0] === id));
}

section('2. וולידציה');
{
  const { sb, ss } = W();
  const t = (x, perm) => sb.saveCustomTrigger_(ss, { draft: draftWeekly(x), _perm: perm || SUP, _email: 'super@x.com' });
  ok('משתנה שלא קיים בטריגר מתוזמן ({{שם}}) נדחה', t({ pb: 'שלום {{שם}}' }).ok === false);
  ok('תאריך שעבר נדחה', t({ sched: { type: 'once', date: '2026-01-01', hour: 10 } }).ok === false);
  ok('בלי ערוץ נדחה', t({ channels: { m: false, p: false } }).ok === false);
  ok('מייל בלי גוף נדחה', t({ channels: { m: true, p: false }, su: 'נושא', bo: '' }).ok === false);
  ok('לפי היומן — {{שם האירוע}} מותר', t({ sched: { type: 'cal', cat: 'community', offset: 2, hour: 9 }, pb: '{{שם האירוע}} בעוד {{ימים}} ימים' }).ok === true);
  ok('שעה מחוץ לטווח נחתכת ל-7–21', (() => { const r = t({ name: 'לילה', sched: { type: 'daily', hour: 3 } }); sb.notifyResetMemo_();
    return r.ok && JSON.parse(cxRows(ss).find(x => x[0] === r.id)[4]).hour === 7; })());
}

section('3. תזמון — פעם אחת לכל מופע');
{
  const { sb, ss } = W();
  const a = sb.saveCustomTrigger_(ss, { draft: draftWeekly(), activate: true, _perm: SUP, _email: 'super@x.com' });
  setNow('2026-09-24T14:30:00Z');  // חמישי 17:30
  let r = sb.customTriggersJob_(ss);
  ok('חמישי 17:30 — עוד לא', r.fired === 0 && pushes.length === 0, JSON.stringify(r));
  setNow('2026-09-24T15:20:00Z');  // 18:20
  r = sb.customTriggersJob_(ss);
  const p = pushTo('F1')[0] || {};
  ok('חמישי 18:20 — יצא פוש לתושבים', r.fired === 1 && p.title === 'מחר איסוף אריזות', JSON.stringify(r) + ' ' + p.title);
  ok('המשתנים הוחלפו ({{יום}} {{תאריך}})', /חמישי 24\.9$/.test(p.body || ''), p.body);
  ok('🔴 הגנן החיצוני לא ב"כל התושבים"', pushTo('F4').length === 0);
  setNow('2026-09-24T17:10:00Z');  // 20:10 — עדיין בחלון
  r = sb.customTriggersJob_(ss);
  ok('ריצה נוספת באותו ערב — לא שולחת שוב', r.fired === 0 && pushTo('F1').length === 1);
  setNow('2026-10-01T15:20:00Z');
  r = sb.customTriggersJob_(ss);
  ok('חמישי הבא — שוב', r.fired === 1 && pushTo('F1').length === 2);
  sb.customTriggerAction_(ss, { id: a.id, op: 'pause', _perm: SUP, _email: 'super@x.com' });
  setNow('2026-10-08T15:20:00Z');
  r = sb.customTriggersJob_(ss);
  ok('מושהה — לא יוצא', r.fired === 0 && pushTo('F1').length === 2);
}
{
  const { sb, ss } = W();
  fsDocs['eventsCal/2026'] = { events: [
    { id: 'e1', title: 'ערב שירה', date: '2026-09-27T16:00:00Z', allDay: false, category: 'community', location: 'המועדון' },
    { id: 'e2', title: 'חופשת סוכות', date: '2026-09-26T21:00:00Z', allDay: true, category: 'breaks', location: '' }
  ] };
  sb.saveCustomTrigger_(ss, { draft: draftWeekly({ name: 'לפני אירוע', sched: { type: 'cal', cat: 'community', offset: 3, hour: 9 },
    pt: 'בעוד {{ימים}} ימים: {{שם האירוע}}', pb: '{{תאריך}} · {{מיקום}}' }), activate: true, _perm: SUP, _email: 'super@x.com' });
  setNow('2026-09-24T06:30:00Z');   // חמישי 09:30 — שלושה ימים לפני ראשון 27.9
  const r = sb.customTriggersJob_(ss);
  const p = pushTo('F1')[0] || {};
  ok('לפי היומן: 3 ימים לפני ערב השירה — יצא, רק לקטגוריה שנבחרה', r.fired === 1 && p.title === 'בעוד 3 ימים: ערב שירה' && /19:00 · המועדון/.test(p.body), JSON.stringify(r) + ' ' + p.title + ' | ' + p.body);
  const r2 = sb.customTriggersJob_(ss);
  ok('ולא פעמיים', r2.fired === 0);
}
{
  const { sb, ss } = W();
  sb.saveCustomTrigger_(ss, { draft: draftWeekly({ name: 'פעם', sched: { type: 'once', date: '2026-09-28', hour: 10 } }), activate: true, _perm: SUP, _email: 'super@x.com' });
  sb.saveCustomTrigger_(ss, { draft: draftWeekly({ name: 'חודשי', sched: { type: 'monthly', mday: 28, hour: 10 }, channels: { m: true, p: false }, su: 'חודשי', bo: 'גוף {{תאריך}}' }), activate: true, _perm: SUP, _email: 'super@x.com' });
  setNow('2026-09-28T07:30:00Z');
  const r = sb.customTriggersJob_(ss);
  ok('פעם אחת + חודשי באותו יום — שניהם יצאו', r.fired === 2, JSON.stringify(r));
  ok('🔴 המייל לכל התושבים — בעותק מוסתר', mails.length === 1 && !/dana/.test(mails[0].to || '') && /dana@x\.com/.test(mails[0].bcc || ''), JSON.stringify(mails.map(to)));
  setNow('2026-10-28T07:30:00Z');
  const r2 = sb.customTriggersJob_(ss);
  ok('חודש אחר כך: רק החודשי', r2.fired === 1, JSON.stringify(r2));
}

section('4. ממתין לאישור — לא יוצא');
{
  const { sb, ss } = W();
  const c = sb.saveCustomTrigger_(ss, { draft: draftWeekly({ dom: 'gar', roles: ['a'] }), _perm: GMGR, _email: 'gmgr@x.com' });
  pushes = []; mails = [];
  setNow('2026-09-24T15:20:00Z');
  ok('ממתין לאישור — לא נשלח', sb.customTriggersJob_(ss).fired === 0 && pushes.length === 0);
  sb.customTriggerAction_(ss, { id: c.id, op: 'approve', _perm: SUP, _email: 'super@x.com' });
  pushes = [];
  const r = sb.customTriggersJob_(ss);
  ok('אחרי אישור — יוצא, למנהלת הגינון בטלפון שלה', r.fired === 1 && pushTo('F3').length === 1, JSON.stringify(r));
}

section('5. סיכום חדש');
{
  const { sb, ss } = W();
  const sum = (x) => Object.assign({ kind: 'סיכום', name: 'גינון השבוע', dom: 'gar', roles: ['a', 'g'],
    sched: { type: 'daily', hour: 9 }, channels: { p: true, m: false }, metrics: { ids: ['unplanned', 'awaiting'], only: true },
    pt: 'גינון היום', pb: '{{לא שובצו}} לא שובצו · {{ממתינות לאישור}} ממתינות' }, x || {});
  const bad = sb.saveCustomTrigger_(ss, { draft: sum({ roles: ['all'] }), _perm: SUP, _email: 'super@x.com' });
  ok('🔴 סיכום לא נשלח לכל התושבים', bad.ok === false, JSON.stringify(bad));
  const nom = sb.saveCustomTrigger_(ss, { draft: sum({ metrics: { ids: [] } }), _perm: SUP, _email: 'super@x.com' });
  ok('סיכום בלי מדדים נדחה', nom.ok === false);
  const bv = sb.saveCustomTrigger_(ss, { draft: sum({ pb: '{{בוצעו ב-7 ימים}}' }), _perm: SUP, _email: 'super@x.com' });
  ok('משתנה של מדד שלא נבחר נדחה', bv.ok === false);
  const s = sb.saveCustomTrigger_(ss, { draft: sum(), activate: true, _perm: SUP, _email: 'super@x.com' });
  ok('סיכום נשמר', s.ok, JSON.stringify(s));
  setNow('2026-09-24T06:30:00Z');
  let r = sb.customTriggersJob_(ss);
  ok('אין משימות — "רק כשיש מה לדווח" → לא יוצא', r.fired === 0 && pushes.length === 0, JSON.stringify(r));
  fsDocs['gardenTasks/t1'] = { closure: '', week: '', flag: '', createdAt: new Date('2026-09-23T08:00:00Z').toISOString() };
  fsDocs['gardenTasks/t2'] = { closure: '', week: '2026-W39', flag: 'ממתין לאישור', createdAt: new Date('2026-09-20T08:00:00Z').toISOString() };
  fsDocs['gardenTasks/t3'] = { closure: 'בוצע', week: '', flag: '', createdAt: new Date('2026-09-20T08:00:00Z').toISOString() };
  setNow('2026-09-25T06:30:00Z');
  r = sb.customTriggersJob_(ss);
  const p = pushTo('F3')[0] || {};
  ok('עם משימות — יוצא עם המספרים', r.fired === 1 && p.body === '1 לא שובצו · 1 ממתינות', JSON.stringify(r) + ' ' + p.body);
  ok('הגנן מקבל גם (אין שמות בגינון)', pushTo('F4').length === 1);
  ok('🔴 תושב רגיל לא', pushTo('F1').length === 0);
  const lst = as(sb, SUP, 'super@x.com');
  const row = lst.domains.find(d => d.id === 'gar').rows.find(x => x.cx && x.cx.kind === 'סיכום');
  ok('בטבלה: שורה עם המשתנים של המדדים', row && row.vars.indexOf('לא שובצו') !== -1 && row.vars.indexOf('ממתינות לאישור') !== -1);
}

section('6. AI');
{
  const { sb, ss } = W();
  let n = 0;
  geminiReply = () => (++n === 1 ? { title: 'דיווח טופל', text: 'טיפלנו בזה, תודה!' } : { title: 'הדיווח טופל', text: 'טיפלנו ב{{קטגוריה}} — תודה!' });
  const r = sb.notifyAiRewrite_(ss, { sec: 'push', title: 'הדיווח שלך טופל', text: '{{קטגוריה}} סומן כבוצע', dir: 'warm', vars: ['קטגוריה', 'מיקום'], _email: 'super@x.com' });
  ok('משתנה שנשמט → ניסיון שני, והתוצאה שומרת אותו', r.ok && n === 2 && r.missing.length === 0 && /\{\{קטגוריה\}\}/.test(r.text), JSON.stringify(r));
  ok('ההנחיה כוללת את המשתנים שחובה לשמור', /\{\{קטגוריה\}\}/.test(JSON.stringify(fetches[0].body)));
  geminiReply = () => ({ title: 'x', text: 'בלי משתנים {{שם מומצא}}' });
  const r2 = sb.notifyAiRewrite_(ss, { sec: 'push', title: 'a', text: '{{קטגוריה}}', vars: ['קטגוריה'], _email: 'super@x.com' });
  ok('שתי הצעות גרועות → חוזר עם סימון (הדפדפן לא נותן להכניס)', r2.ok && r2.missing[0] === 'קטגוריה' && r2.unknown[0] === 'שם מומצא');
  ok('🔴 שום דבר לא נשמר בגיליון', !ss.getSheetByName('טריגרים מותאמים'));
  geminiReply = () => ({ feasible: false, reason: 'תלוי בשריון', name: 'שריון ארוך', dom: 'bud', roles: ['s'], type: 'daily', hour: 3, mail: false, push: true, pt: 'x', pb: 'y' });
  const b = sb.notifyAiBuild_(ss, { prompt: 'כשמישהו משריין ליותר מ-5 שעות', _perm: GMGR, _email: 'gmgr@x.com' });
  ok('AI: "דורש קוד" חוזר כ-feasible=false עם הסבר', b.ok && b.feasible === false && b.reason === 'תלוי בשריון');
  ok('🔴 תחום שהמנהלת לא רשאית בו מוחלף בשלה; שעה נחתכת', b.draft.dom === 'gar' && b.draft.sched.hour === 7, JSON.stringify(b.draft));
  const dev = sb.saveCustomTrigger_(ss, { dev: true, draft: { prompt: b.draft.prompt, name: b.draft.name, dom: b.draft.dom }, _perm: GMGR, _email: 'gmgr@x.com' });
  sb.notifyResetMemo_();
  ok('בקשת פיתוח נשמרת — ולא נכנסת לטבלה', dev.ok && dev.status === 'בקשת פיתוח' && !sb.notifyIndex_().byId[dev.id]);
  const ls = as(sb, SUP, 'super@x.com');
  ok('ומופיעה אצל מנהל-על ברשימת בקשות הפיתוח', (ls.devRequests || []).some(x => x.id === dev.id));
  /* מגבלת שימוש */
  const store = {};
  sb.CacheService = { getScriptCache: () => ({ get: k => store[k] || null, put: (k, v) => { store[k] = v; } }) };
  geminiReply = () => ({ title: 'a', text: 'b' });
  let last;
  for (let i = 0; i < 41; i++) last = sb.notifyAiRewrite_(ss, { sec: 'push', title: 'a', text: 'b', vars: [], _email: 'bud@x.com' });
  ok('מגבלה: 40 בקשות לשעה למנהל', last.ok === false && /הרבה בקשות/.test(last.error));
}
{
  const { sb, ss } = W();
  const t = sb.notifyTestSend_(ss, { draft: { pt: 'מחר {{יום}}', pb: '{{תאריך}}', su: 'נושא', bo: 'גוף {{שם האירוע}}', channels: { p: true, m: true } },
                                     vars: ['יום', 'תאריך', 'שם האירוע'], _perm: SUP, _email: 'super@x.com' });
  ok('שליחת בדיקה: פוש לטלפון שלי + מייל אליי בלבד', t.ok && t.push && t.mail && pushes.length === 1 && pushTo('F2')[0].title.indexOf('[בדיקה]') === 0 &&
     mails.length === 1 && /super@x\.com/.test(mails[0].to) && /אירוע לדוגמה/.test(mails[0].body), JSON.stringify(t));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
