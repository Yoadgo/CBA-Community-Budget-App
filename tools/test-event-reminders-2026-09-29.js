/* "הזכירו לי" (29.9.26) — eventRemindersJob_ ב-Notify.gs מול Firestore מדומה.
   בודק: מתי יוצא, למי, בלי כפילות, תזכורת 'day' לא יוצאת למי שכבר אישר הגעה
   (יקבל rsvp-remind), מזהה מזויף / אירוע שעבר → expired. */
const path = require('path');
const src = require('fs').readFileSync(path.join(__dirname, '../apps-script/Notify.gs'), 'utf8');
const code = src.slice(src.indexOf('var EVT_REM_COL'), src.indexOf('/** "שליחה עכשיו" מהדפדפן'));
let docs = {}, sent = [];
const NOW = new Date('2026-10-05T16:05:00Z').getTime();
const g = {
  Utilities: { formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) },
  Logger: { log() {} },
  EVT_MSG_STALE_MS: 6 * 3600 * 1000,
  evtDetails_: ev => ev ? ev.dateLabel : '',
  notify_: (ss, trig, ctx, roles) => { sent.push([trig, ctx.r.familyId, ctx.vars['מתי'], roles.join()]); return { push: 1, mail: 0 }; },
  notifyFindEvent_: id => id === 'past' ? { title: 'ישן', date: '2026-09-01', dateLabel: '1.9' }
                        : id === 'gone' ? null : { title: 'סוכה', date: '2026-10-06', dateLabel: '6.10 · 17:00', place: 'מועדון' },
  fsDocPath_: (c, id) => c + '/' + id,
  fsGet_: p => docs[p] || null,
  fsMerge_: (p, o) => { docs[p] = Object.assign(docs[p] || {}, o); },
  fsQuery_: (col, f, op, v) => Object.keys(docs).filter(k => k.startsWith(col + '/') && docs[k][f] === v)
                                .map(k => ({ id: encodeURIComponent(k.slice(col.length + 1)), data: docs[k] }))
};
const realNow = Date.now; Date.now = () => NOW;
const f = new Function(...Object.keys(g), code + '; return eventRemindersJob_;');
const job = f(...Object.values(g));
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✓', n); } else { fail++; console.log('  ✗', n, x === undefined ? '' : '→ ' + x); } };
const R = (id, o) => { docs['eventReminders/' + id] = Object.assign({ status: 'pending' }, o); };

R('c3@google.com_401', { eventId: 'c3@google.com', familyId: '401', offset: 'day', remindAtMs: NOW - 5 * 60000 });
R('c3@google.com_402', { eventId: 'c3@google.com', familyId: '402', offset: 'day', remindAtMs: NOW - 5 * 60000 });
R('c3@google.com_403', { eventId: 'c3@google.com', familyId: '403', offset: '2h', remindAtMs: NOW + 3 * 3600000 });
R('c3@google.com_404', { eventId: 'c3@google.com', familyId: '999', offset: 'day', remindAtMs: NOW });      // מזהה לא תואם
R('past_405', { eventId: 'past', familyId: '405', offset: 'day', remindAtMs: NOW });
R('gone_406', { eventId: 'gone', familyId: '406', offset: '2h', remindAtMs: NOW });
docs['eventRSVP/c3@google.com'] = { enabled: true };
docs['eventRSVPResponses/c3@google.com_402'] = { status: 'attending', familyId: '402' };

let r = job({});
ok('יוצאת תזכורת אחת בלבד (401)', sent.length === 1 && sent[0][1] === '401', JSON.stringify(sent));
ok('טריגר evt-remind, תפקיד r, "מחר"', sent[0] && sent[0][0] === 'evt-remind' && sent[0][3] === 'r' && sent[0][2] === 'מחר');
ok('402 אישר הגעה → לא שוב (rsvp-remind כבר יוצא)', docs['eventReminders/c3@google.com_402'].status === 'sent' && docs['eventReminders/c3@google.com_402'].dup === true);
ok('403 — עוד לא הגיע הזמן', docs['eventReminders/c3@google.com_403'].status === 'pending');
ok('🔴 מזהה שלא תואם למשפחה → expired, בלי שליחה', docs['eventReminders/c3@google.com_404'].status === 'expired');
ok('אירוע שעבר → expired', docs['eventReminders/past_405'].status === 'expired');
ok('אירוע שנמחק → expired', docs['eventReminders/gone_406'].status === 'expired');
sent = []; job({});
ok('🔴 ריצה שנייה — אפס כפילויות', sent.length === 0, JSON.stringify(sent));
docs['eventReminders/c3@google.com_403'].remindAtMs = NOW - 60000;
sent = []; job({});
ok('2h בזמן → "בעוד שעתיים"', sent.length === 1 && sent[0][2] === 'בעוד שעתיים', JSON.stringify(sent));
docs['eventReminders/late_407'] = { status: 'pending', eventId: 'late', familyId: '407', offset: '2h', remindAtMs: NOW - 7 * 3600000 };
sent = []; job({});
ok('פוספס ביותר מ-6 שעות → expired', docs['eventReminders/late_407'].status === 'expired' && sent.length === 0);
Date.now = realNow;
console.log((fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
