const src = require('fs').readFileSync('' + require('path').join(__dirname, '../apps-script/Notify.gs') + '','utf8');
const a = src.indexOf('var EVT_NOTIFY_CATS'), b = src.indexOf('/* ---------------------------------------------------------------------------\n *  "השבוע בשיכון"');
const code = src.slice(src.indexOf('function evtLock_'), src.indexOf('function evtDetails_')) + src.slice(a, b);
let props = {}, sent = [], docs = {}, now = new Date('2026-09-28T09:00:00Z');
const g = {
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({}) },
  Utilities: { formatDate: (d, tz, f) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year:'numeric', month:'2-digit', day:'2-digit' }).format(d);
    return f === 'yyyy-MM-dd' ? p : p + 'T00:00:00+03:00'; } },
  Logger: { log(){} },
  notify_: (ss, trig, ctx, roles) => { sent.push([trig, ctx.vars, ctx.only && ctx.only.all ? Object.keys(ctx.only.all).sort() : 'ALL']); return { push: 1, mail: 0 }; },
  notifyFindEvent_: id => ({ title: 'ערב סוכות', date: '2026-10-06', dateLabel: '6.10 · 19:00', place: 'מועדון' }),
  fsDocPath_: (c, id) => c + '/' + id,
  fsGet_: p => docs[p] || null,
  fsMerge_: (p, o) => { docs[p] = Object.assign(docs[p] || {}, o); },
  fsQuery_: (col, f, op, v) => col === 'eventMessages'
      ? Object.keys(docs).filter(k => k.startsWith('eventMessages/') && docs[k].status === v).map(k => ({ id: k.split('/')[1], data: docs[k] }))
      : [{ data: { eventId: 'e1', familyId: 'F1', status: 'attending' } }, { data: { eventId: 'e1', familyId: 'F2', status: 'not_attending' } }],
  notifyDirectory_: () => [{ familyId: 'F1' }, { familyId: 'F2' }, { familyId: 'F3' }, { familyId: 'X', isExternal: true }],
  ScriptApp: { getProjectTriggers: () => [] , newTrigger: () => ({ timeBased: () => ({ everyMinutes: () => ({ create(){} }) }) }) }
};
const f = new Function(...Object.keys(g), code + '; return { eventsNotifyChanges_, eventMessagesJob_, eventMessageSendNow_, notifyEventInvite_ };');
const E = f(...Object.values(g));
const ev = (o) => Object.assign({ id: 'e1', title: 'ערב סוכות', date: '2026-10-06T16:00:00Z', allDay: false, category: 'community', location: 'מועדון' }, o);
const at = (min) => new Date(now.getTime() + min * 60000);
const step = (name, list, min) => { sent = []; const r = E.eventsNotifyChanges_(2026, list, at(min)); console.log(name.padEnd(46), JSON.stringify(sent.map(x => x[0] + (x[1]['מה השתנה'] ? ' → ' + x[1]['מה השתנה'] : '')))); };
step('1. ריצה ראשונה (אין תמונת מצב)', [ev()], 0);
step('2. אותו מצב', [ev()], 5);
step('3. אירוע חדש נוסף (e2)', [ev(), ev({ id: 'e2', category: 'culture' })], 10);
step('4. e2 תוקן אחרי 3 דק׳', [ev(), ev({ id: 'e2', category: 'culture', location: 'דשא' })], 13);
step('5. אחרי 9 דק׳ — עוד לא התייצב', [ev(), ev({ id: 'e2', category: 'culture', location: 'דשא' })], 22);
step('6. אחרי 11 דק׳ — יוצא "חדש" אחד', [ev(), ev({ id: 'e2', category: 'culture', location: 'דשא' })], 24);
step('7. e1 הוזז בתאריך', [ev({ date: '2026-10-07T16:00:00Z' }), ev({ id: 'e2', category: 'culture', location: 'דשא' })], 30);
step('8. +12 דק׳ — יוצא "עודכן"', [ev({ date: '2026-10-07T16:00:00Z' }), ev({ id: 'e2', category: 'culture', location: 'דשא' })], 42);
step('9. חג / אירוע עבר — כלום', [ev({ date: '2026-10-07T16:00:00Z' }), ev({ id: 'e2', category: 'culture', location: 'דשא' }), ev({ id: 'h', category: 'holidays' }), ev({ id: 'old', date: '2026-09-01T10:00:00Z' })], 50);
step('10. +20 דק׳ — עדיין כלום', [ev({ date: '2026-10-07T16:00:00Z' }), ev({ id: 'e2', category: 'culture', location: 'דשא' }), ev({ id: 'h', category: 'holidays' }), ev({ id: 'old', date: '2026-09-01T10:00:00Z' })], 70);
// messages
const N = Date.now();
docs['eventMessages/mAll1'] = { eventId: 'e1', text: 'מזכירים: מחר!', audience: 'all', sendAtMs: N - 1000, status: 'pending' };
docs['eventMessages/mAttend01'] = { eventId: 'e1', text: 'למאשרים', audience: 'attending', sendAtMs: N - 1000, status: 'pending' };
docs['eventMessages/mPen1'] = { eventId: 'e1', text: 'עוד לא עניתם', audience: 'pending', sendAtMs: N - 1000, status: 'pending' };
docs['eventMessages/mFut1'] = { eventId: 'e1', text: 'עתידי', audience: 'all', sendAtMs: N + 3600e3, status: 'pending' };
docs['eventMessages/mOld1'] = { eventId: 'e1', text: 'ישן', audience: 'all', sendAtMs: N - 8 * 3600e3, status: 'pending' };
docs['eventMessages/mCan1'] = { eventId: 'e1', text: 'בוטל', audience: 'all', sendAtMs: N - 1000, status: 'canceled' };
sent = [];
console.log('שליחה עכשיו של mAttend01 בלבד:', JSON.stringify(E.eventMessageSendNow_({}, { id: 'mAttend01' })), JSON.stringify(sent.map(x => [x[1]['הודעה'], x[2]])));
sent = []; const r = E.eventMessagesJob_({});
console.log('ריצת טריגר:', JSON.stringify(r), JSON.stringify(sent.map(x => [x[1]['הודעה'], x[2]])));
console.log('סטטוסים:', Object.keys(docs).filter(k=>k.startsWith('eventMessages/')).map(k => k.split('/')[1] + '=' + docs[k].status).join(' '));
sent = []; E.eventMessagesJob_({}); console.log('ריצה שנייה (אסור כפילות):', sent.length);
// invite
docs['eventInfo/e1'] = { hasImage: true };
sent = []; console.log('הזמנה:', JSON.stringify(E.notifyEventInvite_({}, { eventId: 'e1' })), '| שוב:', JSON.stringify(E.notifyEventInvite_({}, { eventId: 'e1' })), '| בלי תמונה:', JSON.stringify(E.notifyEventInvite_({}, { eventId: 'e9' })), '| מזהה רע:', JSON.stringify(E.notifyEventInvite_({}, { eventId: 'a/b' })));
