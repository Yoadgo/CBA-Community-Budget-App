/* בדיקות לשריון מועדון v2 (6.10.2026) — סוג שריון, לוח ציבורי ב-Firestore,
   עריכה, ביטול מנהל.
   הרצה:  node tools/test-club-v2-2026-10-06.js

   🔴 מה המארז שומר עליו (כולן תקלות שקטות):
     1. **המהות של שריון פרטי לא יוצאת מהשרת** — לא למסמך החודש ולא לתשובת
        clubBusy. ואין אימייל/בית באף אחד מהם.
     2. **אירוע שחוצה חודש** מופיע בשני מסמכי החודש — אחרת הוא "נעלם" מהלוח.
     3. **מסמך חודש חסר = לא יודעים** ⇒ נפילה ל-Apps Script, לא "פנוי כל היום".
        (ו"השריונים שלי": מסמך חסר = אין שריונים; schema 1 ⇒ Apps Script.)
     4. **עריכה רק לבעלים או למנהל מועדון**, ורק סוג+מהות — השעות לא זזות.
     5. **לקוח ישן (בלי kind) ממשיך לשריין**; לקוח חדש חייב מהות.
     6. כל תבנית חדשה רשומה בשלושת המקומות (טבלה, טקסט, NEW). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const NT = R('apps-script/Notify.gs');
const DS = R('js/data/dataService.js');
const RJ = R('js/screens/resident.js');
const CA = R('js/screens/clubAdmin.js');
const RULES = R('firestore.rules');
const grab = (src, re) => { const m = src.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };

/* ---------- ארגז שרת ---------- */
function mkEv(start, end, tags, id) {
  tags = Object.assign({}, tags || {});
  let title = '', desc = tags.__desc || '', deleted = false;
  return {
    getId: () => id || ('ev-' + start.toISOString()),
    getStartTime: () => start, getEndTime: () => end,
    getTag: k => (tags[k] === undefined ? null : tags[k]),
    setTag: (k, v) => { tags[k] = v; },
    setTitle: t => { title = t; }, getTitle: () => title,
    getDescription: () => desc, setDescription: d => { desc = d; },
    deleteEvent: () => { deleted = true; },
    _tags: tags, _deleted: () => deleted
  };
}
function serverBox(opts) {
  opts = opts || {};
  const log = { writes: [], sweeps: 0, mails: [], admins: [], bumps: [] };
  const events = opts.events || [];
  const cal = {
    getEvents: (a, b) => events.filter(e => e.getStartTime() < b && e.getEndTime() > a && !e._deleted()),
    getEventById: id => events.find(e => e.getId() === id && !e._deleted()) || null,
    createEvent: (title, s, e, o) => { const x = mkEv(s, e, { __desc: o.description }, 'new1'); x.setTitle(title); events.push(x); return x; }
  };
  const box = {
    String, Number, Date, JSON, parseInt, Math, Object, Logger: { log: () => {} },
    PERM_CLUB: 'מועדון', CBA_APP_URL: 'https://x',
    CLUB_BACK_DAYS_ALL: 7, CLUB_BACK_DAYS_MINE: 1, CLUB_FWD_DAYS: 180,
    CLUB_CALENDAR_ID: 'cal',
    CalendarApp: { getCalendarById: () => cal },
    Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
    Utilities: { formatDate: (d, tz, f) => {
      const p = n => (n < 10 ? '0' : '') + n;
      if (f === 'yyyy-MM') return d.getFullYear() + '-' + p(d.getMonth() + 1);
      if (f === 'dd/MM/yyyy') return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
      if (f === 'HH:mm') return p(d.getHours()) + ':' + p(d.getMinutes());
      return d.toISOString(); } },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
    json_: o => o,
    clubStatusOf_: e => String(e.getTag('status') || 'approved'),
    fsSet_: (p, doc) => log.writes.push({ path: p, doc }),
    fsWriteAll_: (c, items, out, live) => items.forEach(it => { live[it.id] = 1; out.wrote++; log.writes.push({ path: c + '/' + it.id, doc: it.doc }); }),
    fsSweepOrphans_: () => { log.sweeps++; },
    clubResvBumpFamily_: (ss, fid) => log.bumps.push('fam:' + fid),
    clubResvBumpEvent_: (ss, em, fam) => log.bumps.push('ev:' + em),
    clubResvActorFamily_: p => (p._perm || {}).familyId || '',
    sendResidentTemplate_: (ss, key, to, vars) => log.mails.push({ key, to, vars }),
    notifyAdmins_: (ss, perm, key, vars) => log.admins.push({ key, vars }),
    authorize_: (ss, p, need) => (opts.isClubAdmin ? { ok: true } : { ok: false, error: 'אין לך הרשאה לפעולה הזו' }),
    clubIdentity_: p => ({ email: (p._email || ''), famName: (p._perm || {}).family || '', house: '', keys: [],
      matches: (te) => !!p._email && String(te || '').toLowerCase() === p._email })
  };
  vm.createContext(box);
  vm.runInContext([
    grab(GS, /var CLUB_KINDS = [^\n]*\n/),
    grab(GS, /var CLUB_NOTE_MAX = [^\n]*\n/),
    grab(GS, /var FS_CLUB_SLOTS = [^\n]*\n/),
    grab(GS, /function clubKindOf_\(ev\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubKindParam_\(v\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubNoteParam_\(v\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubTitle_\(fam, kind, note, pending\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubDescWith_\(desc, kind, note\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubSlotItem_\(ev\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubMonthKey_\(d\) \{[^\n]*\}/),
    grab(GS, /function clubMonthStart_\(key\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubMonthNext_\(key\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubSyncMonths_\(\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubMonthsOf_\(s, e\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubSlotsDoc_\(key, evs\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubEventsForMonths_\(keys\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubSlotsSyncAll_\(ss\) \{[\s\S]*?\n\}/),
    grab(GS, /function clubSlotsBump_\(start, end\) \{[\s\S]*?\n\}/),
    grab(GS, /function handleClubBusy_\(p\) \{[\s\S]*?\n\}/),
    grab(GS, /function handleReserveClub_\(p\) \{[\s\S]*?\n\}/),
    grab(GS, /function handleCancelClubReservation_\(p\) \{[\s\S]*?\n\}/),
    grab(GS, /function handleUpdateClubReservation_\(p\) \{[\s\S]*?\n\}/),
    grab(GS, /function handleAdminCancelClubReservation_\(p\) \{[\s\S]*?\n\}/)
  ].join('\n\n'), box);
  return { box, log, events };
}
const D = (y, m, d, h, mi) => new Date(y, m - 1, d, h || 0, mi || 0);
const FUT = new Date(Date.now() + 10 * 86400000);
const fy = FUT.getFullYear(), fm = FUT.getMonth() + 1, fd = FUT.getDate();

section('1. 🔴🔴 הפריט הציבורי — מהות רק לשריון שאינו פרטי');
{
  const { box } = serverBox();
  const priv = box.clubSlotItem_(mkEv(D(fy, fm, fd, 18), D(fy, fm, fd, 21),
    { kind: 'priv', note: 'יום הולדת 40', family: 'ברק', email: 'b@x.com', status: 'approved' }));
  ok('🔴🔴 פרטי — בלי מהות', priv.note === undefined, JSON.stringify(priv));
  ok('פרטי — עם שם משפחה (החלטת יועד 6.10)', priv.fam === 'ברק');
  ok('🔴 אין אימייל בפריט', JSON.stringify(priv).indexOf('b@x.com') === -1);
  ok('רשימה סגורה: s,e,st,k,fam', JSON.stringify(Object.keys(priv).sort()) === JSON.stringify(['e', 'fam', 'k', 's', 'st']), Object.keys(priv).join());
  const com = box.clubSlotItem_(mkEv(D(fy, fm, fd, 18), D(fy, fm, fd, 21), { kind: 'com', note: 'ערב פאב', family: 'אברהם', status: 'pending' }));
  ok('שיכון — עם מהות וסטטוס', com.note === 'ערב פאב' && com.st === 'pending' && com.k === 'com');
  const old = box.clubSlotItem_(mkEv(D(fy, fm, fd, 9), D(fy, fm, fd, 10), { note: 'סוד', family: 'לוי' }));
  ok('🔴 שריון ישן בלי תג סוג = פרטי, והמהות לא יוצאת', old.k === 'priv' && old.note === undefined, JSON.stringify(old));
  const bad = box.clubSlotItem_(mkEv(D(fy, fm, fd, 9), D(fy, fm, fd, 10), { kind: '__proto__', note: 'x' }));
  ok('⚠️ ערך סוג זר = פרטי', bad.k === 'priv' && bad.note === undefined);
  ok('🔴 clubBusy (הנפילה לאחור) משתמש באותו פריט', /items: events\.map\(clubSlotItem_\)/.test(GS));
}

section('2. 🔴 מסמכי חודש — אירוע שחוצה חודש מופיע בשניהם');
{
  const { box } = serverBox();
  const e = mkEv(D(2026, 10, 31, 22), D(2026, 11, 1, 2), { kind: 'com', note: 'ליל כל הקדושים', family: 'כהן' });
  const keys = box.clubMonthsOf_(e.getStartTime(), e.getEndTime());
  ok('clubMonthsOf_ = אוקטובר + נובמבר', JSON.stringify(keys) === JSON.stringify(['2026-10', '2026-11']), JSON.stringify(keys));
  ok('🔴 במסמך אוקטובר', box.clubSlotsDoc_('2026-10', [e]).items.length === 1);
  ok('🔴 ובמסמך נובמבר', box.clubSlotsDoc_('2026-11', [e]).items.length === 1);
  ok('ולא בדצמבר', box.clubSlotsDoc_('2026-12', [e]).items.length === 0);
  const edge = mkEv(D(2026, 10, 31, 22), D(2026, 11, 1, 0), {});
  ok('⚠️ אירוע שנגמר בדיוק בחצות — רק אוקטובר', JSON.stringify(box.clubMonthsOf_(edge.getStartTime(), edge.getEndTime())) === '["2026-10"]');
  ok('מעבר שנה', box.clubMonthNext_('2026-12') === '2027-01');
  const months = box.clubSyncMonths_();
  ok('חלון הסנכרון: 7–8 חודשים רצופים', months.length >= 7 && months.length <= 8, JSON.stringify(months));
  ok('והם רצופים', months.every((k, i) => i === 0 || box.clubMonthNext_(months[i - 1]) === k));
  const d = box.clubSlotsDoc_('2026-10', [mkEv(D(2026, 10, 5, 12), D(2026, 10, 5, 13), {}), mkEv(D(2026, 10, 2, 9), D(2026, 10, 2, 10), {})]);
  ok('ממוין לפי שעה', d.items[0].s < d.items[1].s);
}

section('3. סנכרון מלא — כותב כל חודש, גם ריק, וסוחף');
{
  const s = serverBox({ events: [mkEv(FUT, new Date(FUT.getTime() + 3600000), { kind: 'com', note: 'x' })] });
  const out = s.box.clubSlotsSyncAll_({});
  ok('הצליח', out.ok === true, JSON.stringify(out));
  ok('🔴 כל חודש בחלון נכתב (גם ריק — "ריק" ≠ "לא ידוע")',
     out.wrote === s.box.clubSyncMonths_().length && s.log.writes.every(w => Array.isArray(w.doc.items)));
  ok('וסחיפה רצה', s.log.sweeps === 1);
  ok('🔴 רץ בעבודה השעתית ובזריעה', /var cs = clubSlotsSyncAll_\(ss\);/.test(GS) && /clubSlots: cs/.test(GS));
}

section('4. 🔴 שריון — סוג ומהות');
{
  const p = { date: fy + '-' + String(fm).padStart(2, '0') + '-' + String(fd).padStart(2, '0'), start: '18:00', end: '20:00',
              _email: 'g@x.com', _perm: { family: 'גולן', familyId: '7' } };
  let s = serverBox();
  let r = s.box.handleReserveClub_(Object.assign({}, p, { kind: 'com', note: '' }));
  ok('🔴 לקוח חדש בלי מהות — נדחה', r.ok === false && /מה האירוע/.test(r.error), JSON.stringify(r));
  r = s.box.handleReserveClub_(Object.assign({}, p, { kind: 'zzz', note: 'a' }));
  ok('סוג לא תקין — נדחה', r.ok === false);
  s = serverBox();
  r = s.box.handleReserveClub_(Object.assign({}, p));
  ok('🔴 לקוח ישן (בלי kind) — עובר, פרטי', r.ok === true && s.events[0]._tags.kind === 'priv', JSON.stringify(r));
  s = serverBox();
  r = s.box.handleReserveClub_(Object.assign({}, p, { kind: 'priv', note: 'יום הולדת לנועה' }));
  const ev = s.events[0];
  ok('נוצר עם תג סוג ומהות', r.ok && ev._tags.kind === 'priv' && ev._tags.note === 'יום הולדת לנועה');
  ok('🔴 כותרת ביומן של פרטי — בלי המהות', ev.getTitle().indexOf('נועה') === -1 && /ממתין לאישור/.test(ev.getTitle()), ev.getTitle());
  ok('ותיאור עם "סוג:" ו"הערה:"', /סוג: פרטי/.test(ev.getDescription()) && /הערה: יום הולדת/.test(ev.getDescription()));
  ok('🔴 מסמך החודש מתרענן לפני התשובה', s.log.writes.some(w => w.path === 'clubSlots/' + p.date.slice(0, 7)));
  ok('ומסמך המשפחה', s.log.bumps.indexOf('fam:7') !== -1);
  s = serverBox();
  s.box.handleReserveClub_(Object.assign({}, p, { kind: 'com', note: 'ערב פאב' }));
  ok('כותרת של שיכון — עם הסוג והמהות', /שיכון: ערב פאב/.test(s.events[0].getTitle()), s.events[0].getTitle());
}

section('5. 🔴 עדכון סוג + מהות');
{
  const base = () => mkEv(FUT, new Date(FUT.getTime() + 7200000), { email: 'g@x.com', family: 'גולן', kind: 'priv', note: 'א', status: 'approved', __desc: 'בית 7\ng@x.com\nסוג: פרטי\nהערה: א' }, 'E1');
  let s = serverBox({ events: [base()] });
  let r = s.box.handleUpdateClubReservation_({ id: 'E1', kind: 'com', note: 'ערב קהילה', _email: 'g@x.com', _perm: {} });
  ok('בעל השריון — מעדכן', r.ok === true && s.events[0]._tags.kind === 'com' && s.events[0]._tags.note === 'ערב קהילה', JSON.stringify(r));
  ok('התיאור: "סוג:"/"הערה:" הוחלפו, השאר נשמר',
     s.events[0].getDescription() === 'בית 7\ng@x.com\nסוג: שיכון\nהערה: ערב קהילה', JSON.stringify(s.events[0].getDescription()));
  ok('כותרת מאושר (בלי "ממתין")', !/ממתין/.test(s.events[0].getTitle()) && /שיכון: ערב קהילה/.test(s.events[0].getTitle()));
  ok('והחודש מתרענן', s.log.writes.some(w => /^clubSlots\//.test(w.path)));
  s = serverBox({ events: [base()] });
  r = s.box.handleUpdateClubReservation_({ id: 'E1', kind: 'com', note: 'x', _email: 'other@x.com', _perm: {} });
  ok('🔴🔴 תושב אחר — נדחה', r.ok === false && s.events[0]._tags.kind === 'priv', JSON.stringify(r));
  s = serverBox({ events: [base()], isClubAdmin: true });
  r = s.box.handleUpdateClubReservation_({ id: 'E1', kind: 'base', note: 'תדריך', _email: 'admin@x.com', _perm: {} });
  ok('מנהל מועדון — מעדכן', r.ok === true && s.events[0]._tags.kind === 'base');
  s = serverBox({ events: [base()] });
  r = s.box.handleUpdateClubReservation_({ id: 'E1', kind: 'com', note: '   ', _email: 'g@x.com', _perm: {} });
  ok('מהות ריקה — נדחה', r.ok === false);
  const past = mkEv(new Date(Date.now() - 7200000), new Date(Date.now() - 3600000), { email: 'g@x.com', kind: 'priv' }, 'P1');
  s = serverBox({ events: [past] });
  r = s.box.handleUpdateClubReservation_({ id: 'P1', kind: 'com', note: 'x', _email: 'g@x.com', _perm: {} });
  ok('שריון שהסתיים — לא נערך', r.ok === false);
  const fn = grab(GS, /function handleUpdateClubReservation_\(p\) \{[\s\S]*?\n\}/);
  ok('🔴 השעות לא זזות בעריכה', !/setTime|setStartTime|setEndTime/.test(fn));
}

section('6. 🔴 ביטולים והודעות');
{
  const mk = st => mkEv(FUT, new Date(FUT.getTime() + 3600000), { email: 'g@x.com', family: 'גולן', status: st }, 'C1');
  let s = serverBox({ events: [mk('approved')] });
  let r = s.box.handleCancelClubReservation_({ id: 'C1', _email: 'g@x.com', _perm: { familyId: '7' } });
  ok('תושב מבטל שריון מאושר — הוועד מקבל ADMIN_CLUB_CANCELLED', r.ok && s.log.admins.length === 1 && s.log.admins[0].key === 'ADMIN_CLUB_CANCELLED', JSON.stringify(s.log.admins));
  ok('והחודש מתרענן אחרי המחיקה', s.log.writes.some(w => /^clubSlots\//.test(w.path)) && s.events[0]._deleted());
  s = serverBox({ events: [mk('pending')] });
  s.box.handleCancelClubReservation_({ id: 'C1', _email: 'g@x.com', _perm: { familyId: '7' } });
  ok('ממתין שבוטל — בלי הודעה לוועד', s.log.admins.length === 0);
  s = serverBox({ events: [mk('approved')], isClubAdmin: true });
  r = s.box.handleAdminCancelClubReservation_({ id: 'C1', reason: 'עבודות חשמל' });
  ok('מנהל מבטל שריון מאושר — נמחק', r.ok && s.events[0]._deleted(), JSON.stringify(r));
  ok('🔴 והמשפחה מקבלת CLUB_CANCELLED עם הסיבה', s.log.mails.length === 1 && s.log.mails[0].key === 'CLUB_CANCELLED' &&
     s.log.mails[0].to[0] === 'g@x.com' && /עבודות חשמל/.test(s.log.mails[0].vars['סיבה']), JSON.stringify(s.log.mails));
  s = serverBox({ events: [mk('approved')] });
  r = s.box.handleAdminCancelClubReservation_({ id: 'C1' });
  ok('🔴🔴 בלי הרשאת מועדון — נדחה, לא נמחק', r.ok === false && !s.events[0]._deleted());
  ok('🔴 ובשער הכללי: PERM_CLUB', /adminCancelClubReservation: PERM_CLUB/.test(GS));
  ok('שתי הפעולות מעלות את מונה השינויים', /'updateClubReservation', 'adminCancelClubReservation'\]/.test(GS));
}

section('7. תבניות התראה — רשומות בשלושת המקומות');
['CLUB_CANCELLED', 'ADMIN_CLUB_CANCELLED'].forEach(k => {
  ok(k + ' בטבלה', NT.indexOf('"k":"' + k + '"') !== -1);
  ok(k + ' בטקסטים', new RegExp('\\n ' + k + ': \\{"su":').test(NT));
  ok(k + ' ב-NEW', new RegExp('NEW = \\{[^}]*' + k + ': PERM_CLUB').test(NT));
});

section('8. 🔴 כללי אבטחה');
{
  const m = RULES.match(/match \/clubSlots\/\{month\} \{([\s\S]*?)\n    \}/);
  ok('match קיים', !!m);
  ok('קריאה — אותו שער כמו לוח האירועים (חבר פעיל, לא חיצוני)', m && /allow read: if canSeeEvents\(\);/.test(m[1]));
  ok('🔴 כתיבה — אף פעם', m && /allow write: if false;/.test(m[1]));
  ok('canSeeEvents = isMember && isExternal == false', /function canSeeEvents\(\) \{\s*return isMember\(\) && m\(\)\.isExternal == false;/.test(RULES));
}

section('9. 🔴 הלקוח — נפילה לאחור');
{
  const blk = grab(DS, /  var CLUB_SLOTS_FROM_FIRESTORE = true;[\s\S]*?\n  function adminCancelClubReservation/);
  function clientBox(o) {
    const calls = { busy: 0, month: 0, mine: 0, reads: [] };
    const sb = {
      Date, Object, String, JSON,
      window: {}, CBA: { user: { familyId: o.fid === undefined ? '7' : o.fid },
        fb: { flag: (k, d) => (o.flagOff ? false : d),
              readDoc: (c, id, cb) => { calls.reads.push(c + '/' + id); const d = (o.docs || {})[c + '/' + id]; o.readErr ? cb(new Error('x')) : cb(null, d === undefined ? null : d); } } },
      fsReady: cb => cb(o.notReady ? false : true),
      pushConnected: () => true,
      getClubBusy: (d, cb) => { calls.busy++; cb({ ok: true, busy: [{ start: 'a', end: 'b' }] }); },
      getClubMonth: (m, cb) => { calls.month++; cb({ ok: true, busyDates: ['x'] }); },
      getMyClubReservations: (f, cb) => { calls.mine++; cb({ ok: true, reservations: [{ id: 'slow' }] }); }
    };
    sb.window.CBA = sb.CBA;
    vm.createContext(sb);
    vm.runInContext(blk.replace(/\n  function adminCancelClubReservation$/, '') + '\nthis.api={getClubDay,getClubMonthDays,getMyClubFast,clubSlotsDrop};', sb);
    return { api: sb.api, calls };
  }
  const items = [{ s: '2026-10-08T07:00:00.000Z', e: '2026-10-08T09:00:00.000Z', st: 'approved', k: 'com', fam: 'לוי', note: 'x' },
                 { s: '2026-10-20T15:00:00.000Z', e: '2026-10-20T17:00:00.000Z', st: 'pending', k: 'priv', fam: 'כהן' }];
  let c = clientBox({ docs: { 'clubSlots/2026-10': { items } } });
  let got = null; c.api.getClubDay('2026-10-08', r => { got = r; });
  ok('מסמך קיים ⇒ Firestore, מסונן ליום', got.ok && got.source === 'firestore' && got.items.length === 1 && c.calls.busy === 0, JSON.stringify(got));
  c.api.getClubDay('2026-10-20', r => { got = r; });
  ok('⚡ יום אחר באותו חודש — מהזיכרון, בלי קריאה נוספת', got.items.length === 1 && c.calls.reads.length === 1);
  c.api.getClubDay('2026-10-21', r => { got = r; }, true);
  ok('fresh=true — קורא שוב (אחרי כתיבה)', c.calls.reads.length === 2);
  c = clientBox({ docs: {} });
  c.api.getClubDay('2026-10-08', r => { got = r; });
  ok('🔴🔴 מסמך חסר ⇒ Apps Script, לא "פנוי"', c.calls.busy === 1 && got.source === 'appsscript', JSON.stringify(got));
  ok('ותשובה ישנה (רק busy) מתורגמת לפריט פרטי', got.items[0].k === 'priv' && got.items[0].s === 'a');
  c = clientBox({ docs: { 'clubSlots/2026-10': { items } }, flagOff: true });
  c.api.getClubDay('2026-10-08', r => { got = r; });
  ok('דגל כבוי ⇒ Apps Script', c.calls.busy === 1 && c.calls.reads.length === 0);
  c = clientBox({ readErr: true });
  c.api.getClubDay('2026-10-08', r => { got = r; });
  ok('שגיאת קריאה ⇒ Apps Script', c.calls.busy === 1);
  c = clientBox({ docs: { 'clubSlots/2026-10': { items } } });
  c.api.getClubMonthDays('2026-10', r => { got = r; });
  ok('תצוגה חודשית מהמסמך', c.calls.month === 0 && JSON.stringify(got.busyDates.sort()).indexOf('2026-10-08') !== -1, JSON.stringify(got));
  /* השריונים שלי */
  c = clientBox({ docs: {} });
  c.api.getMyClubFast({}, r => { got = r; });
  ok('🔴 "השריונים שלי": מסמך משפחה חסר = אין שריונים (בלי Apps Script)', got.ok && got.reservations.length === 0 && c.calls.mine === 0);
  c = clientBox({ docs: { 'clubReservations/7': { schema: 1, items: [{ start: '2099-01-01', end: '2099-01-02' }] } } });
  c.api.getMyClubFast({}, r => { got = r; });
  ok('🔴 מסמך schema 1 (לפני הדיפלוי, בלי id) ⇒ Apps Script', c.calls.mine === 1 && got.reservations[0].id === 'slow');
  c = clientBox({ docs: { 'clubReservations/7': { schema: 2, items: [{ id: 'a', start: '2099-01-01', end: '2099-01-02' }, { id: 'old', start: '2000-01-01', end: '2000-01-02' }] } } });
  c.api.getMyClubFast({}, r => { got = r; });
  ok('schema 2 ⇒ Firestore, בלי שריונים שעברו', got.source === 'firestore' && got.reservations.length === 1 && got.reservations[0].id === 'a');
  c = clientBox({ fid: '' });
  c.api.getMyClubFast({}, r => { got = r; });
  ok('בלי מזהה משפחה ⇒ Apps Script', c.calls.mine === 1);
}

section('10. המסך');
ok('הטופס: "מה האירוע?" בלי "(לא חובה)"', /מה האירוע\?/.test(RJ) && !/מטרת השריון \(לא חובה\)/.test(RJ));
ok('בדיקת חובה לפני חלון התקנון', /if \(!editor\.check\(\)\) return;\s*openRulesConfirm/.test(RJ));
ok('פרטי: "רק את השעות ואת" + שם המשפחה', /רק את השעות ואת " \+ famLabel/.test(RJ));
ok('תשלום ותקנון בפס העליון של מסך המועדון (6.10: "ממש בעמוד הראשי של המועדון")',
   /id="rv-quick"/.test(RJ) && /id="rv-rules-btn"/.test(RJ) && /rv-quick__btn--pay" href="' \+ PAYBOX_URL/.test(RJ));
ok('🔴 והפס ראשון במסך — לפני "השריונים שלי" והלוח', RJ.indexOf('id="rv-quick"') < RJ.indexOf('id="rv-mine"') &&
   RJ.indexOf('id="rv-quick"') < RJ.indexOf('<div id="rv-booking">'));
ok('כרטיס התקנון המתקפל הישן הוסר (כפול)', RJ.indexOf('id="rc-rules"') === -1);
ok('קובית התשלום הגדולה הוסרה', RJ.indexOf('id="rc-pay"') === -1);
ok('כפתורי עדכון וביטול בכרטיס השריון', /data-edit="/.test(RJ) && /data-cancel="/.test(RJ));
ok('🔴 "השריונים שלי" לא מאחורי כפתור שפותח חלון', RJ.indexOf('rc-mine-compact"') === -1);
ok('ניהול: עדכון + ביטול שריון מאושר', /data-ca-edit=/.test(CA) && /data-ca-cancel=/.test(CA) && /adminCancelClubReservation/.test(CA));
ok('CBA.clubUI משותף לשני המסכים', /CBA\.clubUI = \{/.test(RJ) && /CBA\.clubUI\.openKindEdit/.test(CA));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
