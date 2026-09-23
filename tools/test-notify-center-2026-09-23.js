'use strict';
/* ============================================================================
 *  מרכז ההתראות (23.9.2026) — מה יכול להישבר בשקט
 * ----------------------------------------------------------------------------
 *  Code.gs + Firestore.gs + Notify.gs האמיתיים, מול גיליון מזויף בזיכרון,
 *  MailApp ו-FCM מזויפים. בודק את ההתנהגות, לא את הטקסט:
 *   1. הטבלה נזרעת ונקראת; תא בגיליון גובר על ברירת המחדל.
 *   2. תושב: מייל + פוש עם טקסט משלו ומסך יעד; "עדכון חדש" נכתב.
 *   3. 🔴 הגנן החיצוני לא מקבל מייל מנהל (תיקון דחוף 1).
 *   4. מנהל תחום מול מנהל-על — לפי הטבלה ולפי ההגדרה הכללית.
 *   5. מתגים ראשיים, שעות שקט (תור), תושב בלי פוש.
 *   6. גינון: ממתין לאישור / חסום / הוחזר / אוחד — מי מקבל מה, ובלי
 *      הערה פנימית לתושב (תיקון דחוף 2); הגנן לא רואה שמות.
 *   7. החלפת הנוסחים — פעם אחת בלבד.
 *   8. מסך הניהול — מידור לפי הרשאה, הגנן חסום.
 *   9. עדכון שירות לכולם — פוש, ומייל בעותק מוסתר בלבד.
 *  הרצה: node tools/test-notify-center-2026-09-23.js
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
let mails, pushes, fsDocs, fsQueries, nowDate, props;
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
      getUuid: () => 'u', formatDate: (d, tz, f) => {
        const x = new Date(d.getTime() + 3 * 3600000);   // שעון ישראל (קיץ)
        const p = n => (n < 10 ? '0' : '') + n;
        if (f === 'H') return String(x.getUTCHours());
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
    UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
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
section('1. הטבלה נזרעת');
{
  const { sb, ss } = world();
  sb.notifyReadCells_(ss);
  const sh = ss.getSheetByName('הגדרות התראות');
  ok('נוצר טאב "הגדרות התראות"', !!sh);
  const n = sb.NOTIFY_DOMAINS.reduce((a, d) => a + d.rows.filter(r => r.id).reduce((b, r) => b + Object.keys(r.cells).length, 0), 0);
  ok('שורה לכל טריגר × נמען (' + n + ')', sh.data.length - 1 === n, sh.data.length - 1);
  sb.notifyReadCells_(ss);
  ok('קריאה שנייה לא מכפילה שורות', sh.data.length - 1 === n);
  const es = ss.getSheetByName('הגדרות מיילים');
  ok('תבניות חדשות נזרעו (CLUB_RECEIVED, ADMIN_GARDEN_DAILY)', ['CLUB_RECEIVED', 'ADMIN_GARDEN_DAILY', 'GARDENER_WEEKLY_PLAN'].every(k => es.data.some(r => r[0] === k)));
  ok('הגדרות כלליות נזרעו (NOTIFY_QUIET = night)', es.data.some(r => r[0] === 'NOTIFY_QUIET' && r[2] === 'night'));
  ok('🔑 שורה חדשה בטאב המיילים נזרעת עם הנוסח החדש', es.data.find(r => r[0] === 'CLUB_RECEIVED')[1] === sb.NOTIFY_MAIL_TEXTS.CLUB_RECEIVED.su);
  const keys = new Set(); sb.NOTIFY_DOMAINS.forEach(d => d.rows.forEach(r => r.cells && Object.values(r.cells).forEach(c => c.k && keys.add(c.k))));
  const missing = [...keys].filter(k => !es.data.some(r => r[0] === k));
  ok('🔴 לכל תבנית בטבלה יש שורה בטאב המיילים', missing.length === 0, missing.join(','));
  const scr = new Set(); sb.NOTIFY_DOMAINS.forEach(d => d.rows.forEach(r => r.cells && Object.values(r.cells).forEach(c => scr.add(c.link))));
  const badScr = [...scr].filter(s => !sb.NOTIFY_SCREENS[s]);
  ok('כל מסך יעד בטבלה ממופה למסך אמיתי', badScr.length === 0, badScr.join(','));
}

section('2. תושב — מייל + פוש עם טקסט משלו, מסך יעד, "עדכון חדש"');
{
  const { sb, ss } = world();
  sb.sendResidentTemplate_(ss, 'CLUB_APPROVED', ['dana@x.com'], { 'שם': 'כהן', 'תאריך': '01/10/2026', 'שעה': '18:00–20:00' });
  ok('מייל יצא לתושב', mailTo('dana@x.com').length === 1, JSON.stringify(mails.map(to)));
  ok('הנושא מהנוסח החדש', /השריון במועדון אושר — 01\/10\/2026/.test(mails[0] && mails[0].subject), mails[0] && mails[0].subject);
  ok('🔑 הכפתור במייל פותח את מסך המועדון', /\?go=resReserve/.test(mails[0] && mails[0].htmlBody));
  const p = pushTo('F1');
  ok('פוש יצא למשפחה (המשפחה נגזרה מהמייל)', p.length === 1, JSON.stringify(pushes));
  ok('🔑 טקסט הפוש משלו — לא נגזר מהמייל', p[0] && p[0].title === 'השריון במועדון אושר' && /01\/10\/2026 · 18:00/.test(p[0].body), p[0] && (p[0].title + ' | ' + p[0].body));
  ok('data.screen = resReserve', p[0] && p[0].data.screen === 'resReserve');
  ok('ערכי data הם מחרוזות (FCM)', p[0] && Object.values(p[0].data).every(v => typeof v === 'string'));
}
{
  const { sb, ss } = world();
  sb.sendResidentTemplate_(ss, 'GARDEN_PLANNED', ['dana@x.com'], { 'שם': 'דנה', 'קטגוריה': 'ממטרות', 'מיקום': 'בית 1', 'שבוע': '27.9.2026' }, { familyId: 'F1' });
  ok('שובץ: לתושב פוש בלבד (לפי הטבלה)', pushTo('F1').length === 1 && mails.length === 0, mails.length);
  const inbox = fsDocs['notifyInbox/F1'];
  ok('🔑 "עדכון חדש" נכתב למשפחה', inbox && inbox.gar && inbox.gar.text === 'שובץ לשבוע 27.9.2026' && inbox.gar.badge === true, JSON.stringify(inbox));
  ok('⚠️ בלי שם במסמך', !/דנה/.test(JSON.stringify(inbox)));
  ok('המסך בעדכון = הדיווחים שלי', inbox && inbox.gar.screen === 'resGarden');
}

section('3. 🔴 הגנן החיצוני לא מקבל מיילי מנהל (תיקון דחוף 1)');
{
  const { sb, ss } = world();
  ok('adminEmailsByPerm_ מסננת את החיצוני', sb.adminEmailsByPerm_(ss, 'גינון').indexOf('gard@x.com') === -1);
  ok('⚠️ ולא מסננת את מנהלת הגינון', sb.adminEmailsByPerm_(ss, 'גינון').indexOf('gmgr@x.com') !== -1);
  ok('⚠️ ולא את מי שלא פעיל — הוא כבר היה בחוץ', sb.adminEmailsByPerm_(ss, 'גינון').indexOf('left@x.com') === -1);
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'דנה כהן', 'כותרת': 'ממטרה', 'קטגוריה': 'השקיה', 'מיקום': 'בית 1', 'מזהה': '7' });
  ok('🔴 אין מייל לגנן', mailTo('gard@x.com').length === 0, JSON.stringify(mails.map(to)));
  ok('🔴 אין פוש לגנן (תא הגנן כבוי)', pushTo('F4').length === 0);
  ok('מנהלת הגינון — פוש (לפי הטבלה)', pushTo('F3').length === 1);
  ok('מנהלת הגינון — בלי מייל (לפי הטבלה)', mailTo('gmgr@x.com').length === 0);
  ok('מנהל-על — מייל (לפי הטבלה)', mailTo('super@x.com').length === 1);
  const qs = ss.getSheetByName('תור התראות');
  ok('"בסיכום" — שורה נכנסה לתור הסיכום (בגיליון, לא ב-Firestore)', qs && qs.data.some(r => r[0] === 'digest' && r[1] === 'gar'));
  ok('🔴 שום דבר לא נכתב ל-Firestore בתור', !Object.keys(fsDocs).some(k => /^notifyQueue/.test(k)));
}
{
  const { sb, ss } = world();
  setGlobal(ss, 'NOTIFY_EXTERNAL', 'asAdmin');
  sb.notifyResetMemo_();
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'דנה', 'כותרת': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'מזהה': '1' });
  ok('רק כשמנהל-על בחר "כמו מנהל התחום" — הגנן נכלל', pushTo('F4').length === 1);
}

section('3ב. פוש למנהל — לטלפון שלו, לא לבני הבית');
{
  const { sb, ss } = world();
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'דנה כהן', 'כותרת': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'מזהה': '1' });
  ok('🔴 בן הזוג של מנהלת הגינון לא מקבל פוש עם שם התושבת', !pushes.some(p => p.tok === 't_F3_spouse'));
}
{
  const { sb, ss } = world({ subs: { F1: 1, F2: 1, F5: 1 } });   // למנהלת הגינון אין מכשיר
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'a', 'כותרת': 'b', 'קטגוריה': 'c', 'מיקום': 'd', 'מזהה': '1' });
  ok('🔑 מנהלת בלי מכשיר — מקבלת מייל במקום הפוש', mailTo('gmgr@x.com').length === 1);
}

section('4. מנהל-על מול מנהל תחום');
{
  const { sb, ss } = world();
  sb.notifyAdmins_(ss, 'מועדון', 'ADMIN_NEW_CLUB', { 'שם': 'a', 'תאריך': 'b', 'שעה': 'c' });
  ok('🔴 תחום בלי מנהל משלו (מועדון) — מנהל-על ממלא את מקומו', pushTo('F2').length === 1);
}
{
  const { sb, ss } = world({ noGardenMgr: true });
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'a', 'כותרת': 'b', 'קטגוריה': 'c', 'מיקום': 'd', 'מזהה': '1' });
  ok('גינון בלי מנהלת — מנהל-על מקבל מייל (שלו) + פוש (של מנהל התחום)', mailTo('super@x.com').length === 1 && pushTo('F2').length === 1);
}
{
  const { sb, ss } = world();
  setGlobal(ss, 'NOTIFY_SUPER_MODE', 'fallback'); sb.notifyResetMemo_();
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'a', 'כותרת': 'b', 'קטגוריה': 'c', 'מיקום': 'd', 'מזהה': '1' });
  ok('"רק כשאין מנהל" — יש מנהלת גינון ⇒ מנהל-על לא מקבל', mailTo('super@x.com').length === 0 && pushTo('F2').length === 0);
}
{
  const { sb, ss } = world();
  setGlobal(ss, 'NOTIFY_SUPER_MODE', 'all'); sb.notifyResetMemo_();
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'a', 'כותרת': 'b', 'קטגוריה': 'c', 'מיקום': 'd', 'מזהה': '1' });
  ok('"כל מה שמנהלי התחומים מקבלים" — מנהל-על מקבל גם פוש', pushTo('F2').length === 1 && mailTo('super@x.com').length === 1);
}
{
  const { sb, ss } = world();
  setCell(ss, 'gar-new', 'a', 4, 'כן'); sb.notifyResetMemo_();   // מייל למנהל התחום
  sb.notifyAdmins_(ss, 'גינון', 'ADMIN_NEW_GARDEN_REPORT', { 'שם': 'a', 'כותרת': 'b', 'קטגוריה': 'c', 'מיקום': 'd', 'מזהה': '1' });
  const m = mails.filter(x => /דיווח גינון חדש/.test(x.subject));
  ok('🔑 מי שמופיע בשני תפקידים מקבל מייל אחד', m.length === 1 && /gmgr@x\.com/.test(m[0].to) && /super@x\.com/.test(m[0].to), JSON.stringify(m.map(to)));
  ok('🔑 תא שנערך בגיליון גובר על ברירת המחדל', mailTo('gmgr@x.com').length === 1);
}

section('5. מתגים, שעות שקט, תושב בלי פוש');
{
  const { sb, ss } = world();
  setGlobal(ss, 'MASTER_ENABLED', 'לא'); sb.notifyResetMemo_();
  sb.sendResidentTemplate_(ss, 'CLUB_APPROVED', ['dana@x.com'], { 'שם': 'x', 'תאריך': 'y', 'שעה': 'z' });
  ok('מתג מייל ראשי כבוי — אין מייל, הפוש יוצא', mails.length === 0 && pushTo('F1').length === 1);
}
{
  const { sb, ss } = world();
  setGlobal(ss, 'NOTIFY_MASTER_PUSH', 'off'); sb.notifyResetMemo_();
  sb.sendResidentTemplate_(ss, 'CLUB_APPROVED', ['dana@x.com'], { 'שם': 'x', 'תאריך': 'y', 'שעה': 'z' });
  ok('מתג פוש ראשי כבוי — אין פוש, המייל יוצא', mails.length === 1 && pushes.length === 0);
}
{
  const { sb, ss } = world({ now: new Date('2026-09-23T20:30:00Z') });   // 23:30 בישראל
  sb.sendResidentTemplate_(ss, 'GARDEN_PLANNED', ['dana@x.com'], { 'שם': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'שבוע': 'w' });
  ok('🔑 שעות שקט — הפוש לא נשלח עכשיו', pushes.length === 0);
  const qsh = ss.getSheetByName('תור התראות');
  const q = qsh ? qsh.data.filter(r => r[0] === 'push') : [];
  ok('ונכנס לתור (בגיליון)', q.length === 1, q.length);
  const r1 = sb.notifyFlushQueue_(ss);
  ok('⚠️ ריקון בתוך שעות השקט — לא שולח', r1.sent === 0 && pushes.length === 0);
  nowDate = new Date('2026-09-24T05:10:00Z');   // 08:10 בישראל
  const r2 = sb.notifyFlushQueue_(ss);
  ok('אחרי שעות השקט — נשלח ונמחק מהתור', r2.sent === 1 && pushTo('F1').length === 1 && !qsh.data.some(r => r[0] === 'push'));
  ok('ועם מסך היעד', pushes[0] && pushes[0].data.screen === 'resGarden');
}
{
  const { sb, ss } = world({ now: new Date('2026-09-26T09:00:00Z') });  // שבת 12:00
  sb.sendResidentTemplate_(ss, 'GARDEN_PLANNED', ['dana@x.com'], { 'שם': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'שבוע': 'w' });
  ok('שבת בצהריים, מצב "לילה" — יוצא מיד', pushes.length === 1);
}
{
  const { sb, ss } = world({ now: new Date('2026-09-26T09:00:00Z') });
  setGlobal(ss, 'NOTIFY_QUIET', 'nightShabbat'); sb.notifyResetMemo_();
  sb.sendResidentTemplate_(ss, 'GARDEN_PLANNED', ['dana@x.com'], { 'שם': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'שבוע': 'w' });
  ok('שבת בצהריים, מצב "לילה + שבת" — נדחה', pushes.length === 0);
}
{
  const { sb, ss } = world({ subs: {} });   // לאף אחד אין פוש
  sb.sendResidentTemplate_(ss, 'GARDEN_PLANNED', ['dana@x.com'], { 'שם': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'שבוע': 'w' }, { familyId: 'F1' });
  ok('🔑 תושב בלי פוש מקבל מייל במקום (ברירת מחדל)', mailTo('dana@x.com').length === 1);
}
{
  const { sb, ss } = world({ subs: {} });
  setGlobal(ss, 'NOTIFY_NO_PUSH', 'app'); sb.notifyResetMemo_();
  sb.sendResidentTemplate_(ss, 'GARDEN_PLANNED', ['dana@x.com'], { 'שם': 'x', 'קטגוריה': 'y', 'מיקום': 'z', 'שבוע': 'w' }, { familyId: 'F1' });
  ok('ובמצב "רק סימון באפליקציה" — בלי מייל', mails.length === 0 && !!fsDocs['notifyInbox/F1']);
}
{
  const { sb, ss } = world();
  sb.sendResidentTemplate_(ss, 'SIGNUP_RECEIVED', ['new@x.com'], { 'שם': 'חדש' });
  ok('הרשמה: לתושב מייל בלבד (אין לו אפליקציה)', mailTo('new@x.com').length === 1 && pushes.length === 0);
}

section('6. גינון — אירועי משימה');
function gardenWorld() {
  const w = world();
  fsDocs['gardenReports/R1'] = { id: 'R1', familyId: 'F1', category: 'השקיה', place: 'בית 1' };
  fsDocs['gardenReports/R2'] = { id: 'R2', familyId: 'F2', category: 'השקיה', place: 'בית 2' };
  return w;
}
const task = o => Object.assign({ id: 'T1', title: 'ממטרה שבורה', category: 'השקיה', area: 'ציר מזרחי', repId: 'R1', week: '2026-09-27' }, o);
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ notifyNote: 'החלפתי ראש ממטרה' }), 'GARDEN_FINAL_CHECK');
  ok('ממתין לאישור: לתושב פוש "בבדיקה אחרונה"', pushTo('F1').length === 1 && pushTo('F1')[0].title === 'הטיפול בבדיקה אחרונה');
  ok('ממתין לאישור: למנהלת הגינון פוש "ממתין לאישורך"', pushTo('F3').length === 1 && pushTo('F3')[0].title === 'ממתין לאישורך');
  ok('בלי מיילים (לפי הטבלה)', mails.length === 0);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ notifyNote: 'דורש מנוף, קבלן' }), 'GARDEN_PENDING_REVIEW');
  const mm = mailTo('gmgr@x.com');
  ok('חסום: מייל למנהלת עם הסיבה', mm.length === 1 && /דורש מנוף/.test(mm[0].body), JSON.stringify(mails.map(to)));
  const rp = pushTo('F1');
  ok('🔴 חסום: לתושב "ממתין לבדיקה" — בלי הסיבה', rp.length === 1 && !/מנוף/.test(rp[0].title + rp[0].body), rp[0] && rp[0].body);
  ok('🔴 ובלי מייל לגנן', mailTo('gard@x.com').length === 0);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ notifyNote: 'חסר פינוי גזם' }), 'GARDENER_TASK_RETURNED');
  ok('הוחזר: פוש לגנן עם מה שחסר', pushTo('F4').length === 1 && /חסר פינוי גזם/.test(pushTo('F4')[0].body));
  ok('🔴 הוחזר: כלום לתושב', pushTo('F1').length === 0 && mailTo('dana@x.com').length === 0 && !fsDocs['notifyInbox/F1']);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ flag: 'הוחזר להשלמה', notifyNote: 'חסר פינוי גזם' }), 'GARDEN_REOPENED');
  const rp = pushTo('F1')[0];
  ok('🔑 הוחזר על משימה סגורה: התושב שומע "נפתח מחדש"', rp && rp.title === 'הדיווח נפתח מחדש', rp && rp.title);
  const rm = mailTo('dana@x.com');
  ok('🔴 ובלי הערת המנהל (לא בפוש ולא במייל)', !/גזם/.test((rp ? rp.body : '') + rm.map(m => m.body).join('')));
  ok('והגנן מקבל את ההערה', pushTo('F4').length === 1 && /חסר פינוי גזם/.test(pushTo('F4')[0].body));
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ repId: 'R1', notifyNote: 'x' }), 'GARDENER_TASK_RETURNED');
  ok('⚠️ הוחזר (לא סגורה) — עדיין כלום לתושב', pushTo('F1').length === 0);
}
{
  const { sb, ss } = world({ subs: { F1: 1 } });   // לגנן אין מכשיר
  sb.notifyGardenTask_(ss, task({ repId: '', notifyNote: 'חסר' }), 'GARDENER_TASK_RETURNED');
  ok('🔑 גנן בלי מכשיר — מקבל מייל במקום', mailTo('gard@x.com').length === 1 && !/דנה|כהן/.test(mailTo('gard@x.com')[0].body));
}
{
  const { sb, ss } = gardenWorld();
  setCell(ss, 'gar-returned', 'g', 7, '{{שם}} {{שאלות}} {{אימייל}}'); sb.notifyResetMemo_();
  sb.notifyGardenTask_(ss, task({ notifyNote: 'x' }), 'GARDENER_TASK_RETURNED');
  const gp = pushTo('F4')[0];
  ok('🔴 רשימת היתר לגנן — גם {{שאלות}}/{{אימייל}} לא עוברים', gp && !/דנה|כהן|@/.test(gp.title + gp.body), gp && (gp.title + ' | ' + gp.body));
}
{
  const { sb, ss } = world();
  setCell(ss, 'gym-flag', 'r', 10, 'דגל: {{שאלות}} · {{שם}}'); sb.notifyResetMemo_();
  sb.sendResidentTemplate_(ss, 'GYM_DOCTOR_NOTE_REQUIRED', ['dana@x.com'], { 'שם': 'דנה', 'שאלות': 'לב' });
  const ib = JSON.stringify(fsDocs['notifyInbox/F1'] || {});
  ok('🔴 "עדכון חדש" ב-Firestore — בלי שם ובלי בריאות, גם אם נכתבו בטקסט', !/דנה|לב/.test(ib), ib);
}
{
  const { sb, ss } = gardenWorld();
  setCell(ss, 'gar-returned', 'g', 7, 'הוחזר ל{{שם}}'); sb.notifyResetMemo_();
  sb.notifyGardenTask_(ss, task({ notifyNote: 'x' }), 'GARDENER_TASK_RETURNED');
  ok('🔴 גם אם מישהו כתב {{שם}} בטקסט של הגנן — השם לא יוצא', pushTo('F4')[0] && !/דנה/.test(pushTo('F4')[0].title), pushTo('F4')[0] && pushTo('F4')[0].title);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ notifyNote: '' }), 'GARDEN_RESCHEDULED');
  const p = pushTo('F1')[0];
  ok('🔴 נדחה: בלי הערה קודמת (notifyNote ריק ⇒ אין טקסט פנימי)', p && /עבר לשבוע 27\.9\.2026/.test(p.body), p && p.body);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ repId: 'R1', mergedReps: ['R2'], notifyNote: 'בוצע' }), 'GARDEN_COMPLETED');
  ok('🔑 הושלם: גם מי שהדיווח שלו אוחד מקבל', pushTo('F1').length === 1 && pushTo('F2').length === 1);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ repId: 'R1', id: 'T9', notifyNote: "אוחד עם פנייה מס' R7" }), 'GARDEN_REPORT_MERGED');
  const m = mailTo('dana@x.com')[0];
  ok('🔴 אוחד: מספר הפנייה **הראשית** (R7), לא של התושב עצמו', m && /מס' R7/.test(m.body) && !/מס' R1\b/.test(m.body), m && m.body.slice(0, 200));
}
{
  const { sb, ss } = gardenWorld();
  const wk = sb.gardenWeekKey_();
  sb.notifyGardenTask_(ss, task({ week: wk }), 'GARDEN_PLANNED');
  ok('שובץ לשבוע הנוכחי — פוש לגנן', pushTo('F4').length === 1 && pushTo('F4')[0].title === 'משימה חדשה השבוע');
  pushes.length = 0;
  sb.notifyGardenTask_(ss, task({ week: '2027-01-03' }), 'GARDEN_PLANNED');
  ok('⚠️ שובץ לשבוע אחר — הגנן לא מקבל', pushTo('F4').length === 0);
}
{
  const { sb, ss } = gardenWorld();
  sb.notifyGardenTask_(ss, task({ repId: '', notifyNote: 'נשבר צינור' }), 'GARDEN_PENDING_REVIEW');
  ok('🔑 משימה בלי דיווח (שגרה) — המנהלת עדיין שומעת על חסימה', mailTo('gmgr@x.com').length === 1);
}
{
  const { sb, ss } = gardenWorld();
  fsDocs['gardenTasks/T1'] = task({ notify: 'GARDEN_FINAL_CHECK', notifyPending: true, notifyNote: 'בוצע' });
  const r = sb.gardenSendTaskMail_(ss, 'T1');
  ok('gardenSendTaskMail_ מעבירה למרכז ומורידה את הדגל', r.ok && fsDocs['gardenTasks/T1'].notifyPending === false && pushes.length >= 2, JSON.stringify(r));
}
{
  const { sb, ss } = gardenWorld();
  const gate = { ok: true };
  sb.authorize_ = (s, b, need) => (need === 'גינון' ? { ok: true, perm: { isExternal: true, perms: ['גינון'] } } : { ok: false, error: 'חיצוני' });
  /* ובלי Notify.gs בשרת — הדגל נשאר, כדי שהסריקה תשלח אחרי ההתקנה. */
  const saved = sb.notifyGardenTask_;
  fsDocs['gardenTasks/T2'] = task({ id: 'T2', notify: 'GARDEN_PENDING_REVIEW', notifyPending: true, notifyNote: 'x' });
  vm.runInContext('var __ngt = notifyGardenTask_; notifyGardenTask_ = undefined;', sb);
  const miss = sb.gardenSendTaskMail_(ss, 'T2');
  vm.runInContext('notifyGardenTask_ = __ngt;', sb);
  ok('🔴 Notify.gs חסר — הדגל לא יורד (המייל לא אובד)', fsDocs['gardenTasks/T2'].notifyPending === true && !miss.ok, JSON.stringify(miss));
  fsDocs['gardenTasks/T1'] = task({ notify: 'GARDEN_PENDING_REVIEW', notifyPending: true, notifyNote: 'x' });
  const r = sb.gardenNotifyTask_(ss, { id: 'T1' });
  ok('🔴 תיקון דחוף 3: הגנן עובר את השער (PERM_GARDEN)', r && r.ok, JSON.stringify(r));
  ok('ACTION_PERMS.gardenNotifyTask = גינון', sb.ACTION_PERMS.gardenNotifyTask === 'גינון');
}

{
  const { sb, ss } = gardenWorld();
  setCell(ss, 'gar-new', 'g', 5, 'כן'); setCell(ss, 'gar-new', 'g', 7, 'חדש: {{שם}} {{אימייל}} {{כותרת}}'); sb.notifyResetMemo_();
  sb.notify_(ss, 'gar-new', { vars: { 'שם': 'דנה כהן', 'אימייל': 'dana@x.com', 'כותרת': 'ממטרה', 'קטגוריה': 'c', 'מיקום': 'm', 'מזהה': '1' } }, ['g']);
  const gp = pushTo('F4')[0];
  ok('🔴 גם כשמדליקים לגנן "דיווח חדש" וכותבים {{שם}} — השם והמייל לא יוצאים', gp && /ממטרה/.test(gp.title) && !/דנה|@/.test(gp.title + gp.body), gp && gp.title);
}

section('7. סיכומי גינון');
{
  const { sb, ss } = gardenWorld();
  const old = new Date('2026-09-10T10:00:00Z');
  fsDocs['gardenTasks/A'] = { id: 'A', title: 'לא שובצה', closure: '', createdAt: old };
  fsDocs['gardenTasks/B'] = { id: 'B', title: 'ממתינה', closure: '', week: '2026-09-20', flag: 'ממתין לאישור', createdAt: new Date() };
  fsDocs['gardenTasks/C'] = { id: 'C', title: 'חסומה', closure: '', week: '2026-09-20', flag: 'דורש בדיקה בשטח', createdAt: new Date() };
  fsDocs['gardenTasks/D'] = { id: 'D', title: 'סגורה', closure: 'בוצע', approvedAt: new Date(), createdAt: new Date() };
  sb.notifyDigestAdd_('gar', 'a', 'דיווח גינון חדש · בית 7');
  const r = sb.gardenDigestJob_(ss);
  const p = pushTo('F3')[0];
  ok('סיכום יומי: פוש למנהלת הגינון עם המספרים', p && /1 לא שובצו · 1 לאישורך · 1 חסומות/.test(p.body), p && p.body);
  const m = mailTo('gmgr@x.com')[0];
  ok('ומייל, עם עדכוני "בסיכום" מאתמול', m && /דיווח גינון חדש · בית 7/.test(m.body) && /פתוחות מעל 7 ימים: 1/.test(m.body), m && m.body);
  ok('ושורות הסיכום נמחקות אחרי השליחה', !ss.getSheetByName('תור התראות').data.some(r => r[0] === 'digest'));
  ok('🔴 הגנן לא מקבל את הסיכום היומי', pushTo('F4').length === 0 && mailTo('gard@x.com').length === 0);
  ok('ביום רביעי אין סיכום שבועי', r.weekly === 0);
}
{
  const { sb, ss } = gardenWorld();
  nowDate = new Date('2026-09-27T05:00:00Z');   // ראשון 08:00
  const wk = sb.gardenWeekKey_();
  fsDocs['gardenTasks/E'] = { id: 'E', title: 'גיזום', area: 'ציר מזרחי', closure: '', week: wk, createdAt: new Date('2026-09-26T05:00:00Z') };
  const r = sb.gardenDigestJob_(ss);
  ok('ראשון: סיכום שבועי — פוש למנהלת', r.weekly > 0 && pushTo('F3').some(p => p.title === 'סיכום הגינון השבועי'));
  const gp = pushTo('F4')[0];
  ok('ראשון: "העבודה שלך השבוע" לגנן', gp && gp.title === 'העבודה שלך השבוע' && /1 משימות/.test(gp.body), gp && gp.body);
  const gm = mailTo('gard@x.com')[0];
  ok('ובמייל — לפי אזור, בלי שמות', gm && /ציר מזרחי:\n  – גיזום/.test(gm.body) && !/דנה|כהן/.test(gm.body), gm && gm.body);
}

section('8. החלפת הנוסחים — פעם אחת בלבד');
{
  const { sb, ss } = world();
  const es = ss.getSheetByName('הגדרות מיילים');
  const row = es.data.find(r => r[0] === 'WELCOME_MANUAL');
  /* גיליון ייצור: השורה נוצרה מזמן, עם הנוסח הישן שבקוד. */
  const oldDef = sb.DEFAULT_EMAIL_SETTINGS.find(r => r[0] === 'WELCOME_MANUAL');
  row[1] = oldDef[1]; row[2] = oldDef[2];
  ok('לפני: הנוסח הישן ("ניהול התקציב")', /ניהול התקציב/.test(row[2]));
  const r1 = sb.notifyApplyNewTextsOnce_(ss);
  ok('אחרי: הנוסח החדש', !/ניהול התקציב/.test(row[2]) && row[1] === sb.NOTIFY_MAIL_TEXTS.WELCOME_MANUAL.su, r1.changed);
  row[1] = 'ערכתי בעצמי';
  const r2 = sb.notifyApplyNewTextsOnce_(ss);
  ok('🔴 ריצה שנייה לא דורסת עריכה', r2.skipped === true && row[1] === 'ערכתי בעצמי');
}

section('9. מסך הניהול — מידור');
{
  const { sb, ss } = world();
  const as = (perm) => { sb.authorize_ = () => ({ ok: true, perm: perm }); return sb.handleListNotifySettings_({}); };
  const sup = as({ isSuper: true, perms: ['על'] });
  ok('מנהל-על רואה את כל 7 התחומים + הגדרות', sup.ok && sup.domains.length === 7 && !!sup.globals && !!sup.rules);
  const bud = as({ isSuper: false, perms: ['תקציב'] });
  ok('מנהל תקציב רואה רק תקציב, בלי הגדרות כלליות', bud.ok && bud.domains.map(d => d.id).join() === 'bud' && !bud.globals, JSON.stringify(bud.domains && bud.domains.map(d => d.id)));
  const gard = as({ isSuper: false, isExternal: true, perms: ['גינון'] });
  ok('🔴 הגנן החיצוני חסום', gard.ok === false);
  const cell = sup.domains[0].rows.find(r => r.id === 'gar-new').cells.a;
  ok('התא מגיע עם נושא וגוף המייל', cell.hasMail && /דיווח גינון חדש/.test(cell.su));
  const deny = sb.saveNotifyCell_(ss, { trig: 'gar-new', role: 'a', fields: { m: true }, _perm: { perms: ['תקציב'] } });
  ok('🔴 מנהל תקציב לא יכול לשמור תא של גינון', deny.ok === false);
  /* סבב 3 (יועד): עריכה — מנהל-על בלבד. מנהלת גינון רק צופה. */
  const mgr = sb.saveNotifyCell_(ss, { trig: 'gar-new', role: 'a', fields: { m: true }, _perm: { perms: ['גינון'] } });
  ok('🔴 סבב 3: גם מנהלת גינון לא שומרת — עריכה למנהל-על בלבד', mgr.ok === false, JSON.stringify(mgr));
  const allow = sb.saveNotifyCell_(ss, { trig: 'gar-new', role: 'a', fields: { m: true, pt: 'כותרת חדשה' }, _perm: { isSuper: true, perms: ['על'] } });
  ok('מנהל-על שומר תא של גינון', allow.ok === true);
  sb.notifyResetMemo_();
  const c2 = sb.notifyReadCells_(ss)['gar-new|a'];
  ok('והשמירה נקראת חזרה', c2.m === true && c2.pt === 'כותרת חדשה');
  const bad = sb.saveNotifyCell_(ss, { trig: 'gar-new', role: 'a', fields: { link: 'מסך מומצא' }, _perm: { isSuper: true } });
  ok('מסך יעד לא מוכר נדחה', bad.ok === false);
  const nop = sb.saveNotifyCell_(ss, { trig: 'signup-ok', role: 'r', fields: { p: true }, _perm: { isSuper: true } });
  sb.notifyResetMemo_();
  ok('⚠️ פוש לנרשם שאין לו אפליקציה נשאר כבוי גם אם נשמר', nop.ok && sb.notifyReadCells_(ss)['signup-ok|r'].p === false);
  const g1 = sb.saveNotifyGlobal_(ss, { id: 'quiet', value: 'nightShabbat' });
  const g2 = sb.saveNotifyGlobal_(ss, { id: 'quiet', value: 'hack' });
  const g3 = sb.saveNotifyGlobal_(ss, { id: 'RULE_STALE_DAYS', value: '5' });
  ok('הגדרה כללית נשמרת; ערך לא מוכר נדחה; כלל מספרי נשמר', g1.ok && !g2.ok && g3.ok);
  ok('ACTION_PERMS: saveNotifyGlobal ו-saveNotifyCell למנהל-על בלבד', sb.ACTION_PERMS.saveNotifyGlobal === 'על' && sb.ACTION_PERMS.saveNotifyCell === 'על');
  ok('מנהל-על: canEdit; מנהל תקציב: צפייה בלבד', sup.canEdit === true && bud.canEdit === false);
}

section('10. עדכון שירות לכל התושבים');
{
  const { sb, ss } = world();
  const r = sb.notifyServiceUpdate_(ss, { serviceName: 'מכבסה', provider: 'א', whatChanged: 'מחירון חדש' });
  ok('ברירת מחדל: פוש לכולם, בלי מייל', r.ok && r.push >= 4 && mails.length === 0, JSON.stringify(r));
  ok('🔴 הגנן החיצוני לא ב"כל התושבים"', pushTo('F4').length === 0);
}
{
  const { sb, ss } = world();
  setCell(ss, 'svc-update', 'all', 4, 'כן'); sb.notifyResetMemo_();
  sb.notifyServiceUpdate_(ss, { serviceName: 'מכבסה', provider: 'א', whatChanged: 'מחירון חדש' });
  ok('🔴 כשהמייל דלוק — בעותק מוסתר, לא בשדה "אל"', mails.length === 1 && !/dana@x\.com/.test(mails[0].to) && /dana@x\.com/.test(mails[0].bcc), JSON.stringify(mails.map(to)));
}

section('11. תבנית שאינה בטבלה — כמו קודם');
{
  const { sb, ss } = world();
  sb.sendResidentTemplate_(ss, 'GYM_APPLICATION_RECEIVED', ['dana@x.com'], { 'שם': 'דנה' });
  ok('מייל יצא במסלול הישן', mailTo('dana@x.com').length === 1 && pushes.length === 0);
  ok('GYM_APPROVED_AWAITING_PAYMENT → gym-approve כשמבקשים', sb.notifyLookupKey_('GYM_APPROVED_AWAITING_PAYMENT', ['r'], 'gym-approve').t === 'gym-approve');
}

section('11ב. התור בגיליון — לקיחה לפי סוג בלי לגעת באחרים');
{
  const { sb, ss } = world();
  sb.notifyQueueAppend_(['push', '', '', 'F1', 'א', '', '{}', new Date()]);
  sb.notifyQueueAppend_(['digest', 'gar', 'a', '', '', 'שורה', '', new Date()]);
  sb.notifyQueueAppend_(['push', '', '', 'F2', 'ב', '', '{}', new Date()]);
  const got = sb.notifyQueueTake_(ss, 'push');
  const left = ss.getSheetByName('תור התראות').data.slice(1);
  ok('נלקחו שתי שורות הפוש', got.length === 2 && got.map(r => r[3]).join() === 'F1,F2');
  ok('ושורת הסיכום נשארה', left.length === 1 && left[0][0] === 'digest');
}

section('12. סיכום שבועי של המנהלים — לפי הטבלה');
{
  const { sb, ss } = world();
  setCell(ss, 'digest', 'a', 4, 'לא'); sb.notifyResetMemo_();
  sb.sendDigestBySection_(ss, 'ADMIN_WEEKLY_DIGEST', { residents: [], budget: ['• בקשה'], club: [], gym: [] }, ['residents', 'budget', 'club', 'gym']);
  ok('תא "כל מנהל" כבוי — מנהל התקציב לא מקבל', mailTo('bud@x.com').length === 0);
  ok('מנהל-על כן', mailTo('super@x.com').length === 1);
}
{
  const { sb, ss } = world();
  sb.sendDigestBySection_(ss, 'ADMIN_MONTHLY_DIGEST', { budget: ['• בקשה'] }, ['budget']);
  ok('סיכום חודשי: מנהל התקציב מקבל; מנהל-על לא (התא שלו כבוי ויש מנהל)', mailTo('bud@x.com').length === 1 && mailTo('super@x.com').length === 0);
}

section('13. "השבוע בשיכון" — מוצאי שבת');
function seedWeek() {
  fsDocs['eventsCal/2026'] = { year: 2026, events: [
    { id: 'e1', title: 'ערב שירה', date: '2026-09-29T16:00:00Z', allDay: false, category: 'community', location: 'המועדון' },
    { id: 'e2', title: 'שמחת תורה', date: '2026-10-02T21:00:00Z', allDay: true, category: 'holidays', location: '' },
    { id: 'e3', title: 'הצגת ילדים', date: '2026-09-27T14:30:00Z', allDay: false, category: 'culture', location: '' },
    { id: 'e4', title: 'אחרי השבוע', date: '2026-10-04T15:00:00Z', allDay: false, category: 'community', location: '' },
    { id: 'e5', title: 'שבוע שעבר', date: '2026-09-24T15:00:00Z', allDay: false, category: 'community', location: '' }
  ] };
}
{
  const { sb, ss } = world({ now: new Date('2026-09-26T18:30:00Z') });   // שבת 21:30
  seedWeek();
  const r = sb.eventsWeekJob_(ss);
  const p = pushTo('F1')[0] || {};
  ok('שבת 21:30 — יצא פוש לתושבים', r.due && r.events === 3 && pushTo('F1').length === 1, JSON.stringify(r));
  ok('הכותרת: השבוע בשיכון · 27.9–3.10', p.title === 'השבוע בשיכון · 27.9–3.10', p.title);
  ok('בגוף: הקהילה והתרבות לפני החג, בלי מה שמחוץ לשבוע', /^הצגת ילדים \(א׳\) · ערב שירה \(ג׳\) · שמחת תורה \(שבת\)$/.test(p.body || ''), p.body);
  ok('מסך היעד: לוח האירועים', p.data && p.data.screen === 'events', JSON.stringify(p.data));
  ok('🔴 הגנן החיצוני לא מקבל', pushTo('F4').length === 0);
  ok('ברירת מחדל: בלי מייל', mails.length === 0, mails.length);
  const r2 = sb.eventsWeekJob_(ss);
  ok('ריצה שנייה באותו ערב — לא שולחת שוב', r2.already && pushTo('F1').length === 1, JSON.stringify(r2));
}
{
  const { sb, ss } = world({ now: new Date('2026-09-26T15:00:00Z') });   // שבת 18:00
  seedWeek();
  ok('שבת 18:00 — עוד לא', sb.eventsWeekJob_(ss).due === false && pushes.length === 0);
}
{
  const { sb, ss } = world({ now: new Date('2026-09-27T06:00:00Z') });   // ראשון 09:00
  seedWeek();
  const r = sb.eventsWeekJob_(ss);
  ok('ראשון בבוקר — השלמה אם מוצ"ש פוספס, לאותו שבוע', r.events === 3 && (pushTo('F1')[0] || {}).title === 'השבוע בשיכון · 27.9–3.10', JSON.stringify(r));
}
{
  const { sb, ss } = world({ now: new Date('2026-09-26T18:30:00Z') });
  fsDocs['eventsCal/2026'] = { events: [] };
  const r = sb.eventsWeekJob_(ss);
  ok('שבוע ריק — לא יוצא כלום', r.empty && pushes.length === 0 && mails.length === 0, JSON.stringify(r));
}
{
  const { sb, ss } = world({ now: new Date('2026-09-26T18:30:00Z'), subs: { F2: 1 } });
  seedWeek();
  setCell(ss, 'evt-week', 'all', 4, 'כן'); sb.notifyResetMemo_();
  sb.eventsWeekJob_(ss);
  const m = mails[0] || {};
  ok('מייל דלוק — בעותק מוסתר, עם הרשימה המלאה', mails.length === 1 && /dana@x\.com/.test(m.bcc || '') && /יום ג׳ 29\.9 · 19:00 — ערב שירה \(המועדון\)/.test(m.body || ''), (m.body || '').slice(0, 200));
}

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
