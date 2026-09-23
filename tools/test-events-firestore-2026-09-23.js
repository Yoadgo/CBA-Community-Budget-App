/* לוח האירועים ב-Firestore (2026-09-23).
   הרצה:  node tools/test-events-firestore-2026-09-23.js

   מודל א': היומן הוא המקור, `eventsCal/{year}` הוא מראה לקריאה.
   🔴 מה שהמארז שומר עליו:
     1. ימי הולדת (שמות תושבים) לעולם לא נכתבים ל-Firestore.
     2. רשימת היתר של שדות — אובייקט אירוע לא עובר כמו שהוא.
     3. הלקוח נופל ל-Apps Script **בשקט** בכל כשל, כולל מסמך ישן —
        וכאן זה נכון (בניגוד ל-fsFirstRead): הנפילה קוראת את היומן עצמו.
     4. "פעם בשעה" אינו התכנון: טריגר יומן, והשעתי הוא רק רשת ביטחון.
     5. הכלל אינו רחב מהשרת. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DS = R('js/data/dataService.js');
const HS = R('js/screens/homeSchedule.js');
const EV = R('js/screens/events.js');
const SS = R('js/screens/sysStatus.js');
const RULES = R('firestore.rules');

/* ---------------- שרת ---------------- */
let written, triggers, created, logs, calEvents, authorizeNeed;
function fakeEv(o) {
  return { getId: () => o.id, getTitle: () => o.title, getStartTime: () => new Date(o.date),
           isAllDayEvent: () => !!o.allDay, getDescription: () => o.description || '',
           getLocation: () => o.location || '' };
}
const sb = {
  console,
  Utilities: { formatDate: d => d.toISOString(), getUuid: () => 'x' },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
  Logger: { log: m => logs.push(String(m)) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {}, getKeys: () => [] }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }), flush() {} },
  DriveApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) },
  CalendarApp: {
    getCalendarById: id => ({ getEvents: () => (calEvents[id] || []).map(fakeEv) })
  },
  ScriptApp: {
    getProjectTriggers: () => triggers,
    newTrigger: fn => ({ forUserCalendar: id => ({ onEventUpdated: () => ({
      create: () => { if (id === 'BOOM') throw new Error('no access'); created.push({ fn, id });
                      triggers.push({ getHandlerFunction: () => fn, getTriggerSourceId: () => id }); } }) }) })
  }
};
vm.createContext(sb);
vm.runInContext(GS, sb);
sb.fsSet_ = (p, o) => { if (sb.__fsBoom) throw new Error('fs down'); written.push({ p, o }); };
sb.json_ = o => o;
sb.authorize_ = (ss, p, need) => { authorizeNeed = need; return p && p.deny ? { ok: false, error: 'אין הרשאה' } : { ok: true }; };
function reset() { written = []; triggers = []; created = []; logs = []; calEvents = {}; authorizeNeed = 'unset'; sb.__fsBoom = false; }
reset();

const CAL = vm.runInContext('EVENTS_CALENDARS', sb);
section('1. שרת — קריאת היומנים ורשימת ההיתר');
calEvents[CAL.community.id] = [{ id: 'c1', title: 'ערב קהילה', date: '2026-10-01T17:00:00Z', location: 'מועדון', description: 'd' }];
calEvents[CAL.holidays.id]  = [{ id: 'h1', title: 'סוכות', date: '2026-10-07T00:00:00Z', allDay: true }];
const evs = sb.eventsForYear_(2026);
ok('eventsForYear_ מאחד את היומנים', evs.length === 2 && evs.some(e => e.category === 'community') && evs.some(e => e.category === 'holidays'));
ok('שדות: id/title/date/allDay/category/description/location',
   Object.keys(evs[0]).sort().join(',') === 'allDay,category,date,description,id,location,title', Object.keys(evs[0]).join(','));

reset();
const n = sb.eventsWriteFs_(2026, [
  { id: 'a', title: 'x'.repeat(500), date: '2026-01-01T00:00:00Z', allDay: 1, category: 'culture',
    location: 'L'.repeat(400), description: 'D'.repeat(3000), creatorEmail: 'someone@x.com', guests: ['a@b.c'] },
  { id: 'b', title: 'יום הולדת לדנה', date: '2026-02-02T00:00:00Z', category: 'birthdays' },
  null
]);
const doc = written[0] && written[0].o;
ok('נכתב לנתיב eventsCal/2026', written.length === 1 && written[0].p === 'eventsCal/2026', written[0] && written[0].p);
ok('🔴 ימי הולדת לא נכתבו', n === 1 && doc.events.length === 1 && !doc.events.some(e => e.category === 'birthdays'));
ok('🔴 שדה שאינו ברשימת ההיתר לא עבר (אימייל/אורחים)',
   !('creatorEmail' in doc.events[0]) && !('guests' in doc.events[0]));
ok('אורכים מוגבלים (200/200/1000)', doc.events[0].title.length === 200 &&
   doc.events[0].location.length === 200 && doc.events[0].description.length === 1000);
ok('allDay בוליאני', doc.events[0].allDay === true);
ok('מטא: year/count/schema/updatedAt(Date)', doc.year === 2026 && doc.count === 1 && doc.schema === 1 &&
   Object.prototype.toString.call(doc.updatedAt) === '[object Date]');

section('2. שרת — eventsList זורע את המראה, וכשל בזריעה לא מפיל');
reset();
calEvents[CAL.culture.id] = [{ id: 'k1', title: 'הופעה', date: '2026-11-11T18:00:00Z' }];
let res = sb.handleGetEventsList_({ year: '2026' });
ok('מחזיר את האירועים', res.ok === true && res.events.length === 1);
ok('וזרע את המסמך', written.length === 1 && written[0].p === 'eventsCal/2026');
reset();
calEvents[CAL.culture.id] = [{ id: 'k1', title: 'הופעה', date: '2026-11-11T18:00:00Z' }];
sb.__fsBoom = true;
res = sb.handleGetEventsList_({ year: '2026' });
ok('🔴 Firestore נפל — המשתמש עדיין מקבל את הלוח', res.ok === true && res.events.length === 1);
ok('והכשל נרשם ביומן', logs.some(l => /eventsWriteFs_/.test(l)));

section('3. שרת — אילו שנים מסונכרנות');
const yrs = d => JSON.stringify(sb.eventsSyncYears_(new Date(d)));
ok('ספטמבר → השנה בלבד', yrs('2026-09-23T12:00:00') === '[2026]', yrs('2026-09-23T12:00:00'));
ok('אוקטובר → גם הבאה (90 יום קדימה בבית)', yrs('2026-10-02T12:00:00') === '[2026,2027]');
ok('ינואר → גם הקודמת (שבוע שמתחיל בדצמבר)', yrs('2027-01-03T12:00:00') === '[2026,2027]');
ok('⚠️ אותו חישוב כמו neededYears בלקוח (90 יום)', /addDays\(today, 90\)/.test(HS));

section('4. 🔑 טריגר יומן — לא "פעם בשעה"');
reset();
let t = sb.ensureEventsTriggers_();
ok('הותקנו שלושה טריגרים (קהילה/תרבות/גנים)', t.made === 3 && created.length === 3, JSON.stringify(t));
ok('⚠️ לא על יומן החגים (ציבורי של Google)', !created.some(c => c.id === CAL.holidays.id));
ok('המטפל הוא eventsCalendarChanged', created.every(c => c.fn === 'eventsCalendarChanged'));
t = sb.ensureEventsTriggers_();
ok('🔴 אידמפוטנטי — הרצה שנייה לא מכפילה', t.made === 0 && created.length === 3);
ok('eventsCalendarChanged פונקציה ציבורית (בלי קו תחתון — טריגר חייב לראות אותה)',
   /\nfunction eventsCalendarChanged\(e\)/.test(GS));
const hourly = (GS.match(/function hourlyJobsRun_\(\) \{[\s\S]*?\n\}/) || [''])[0];
ok('השעתי מריץ סנכרון + התקנה, בתוך try', /try \{\s*var evs = eventsSyncAll_\(\);[\s\S]{0,200}ensureEventsTriggers_\(\)/.test(hourly));

section('5. 🔴 eventsSync — מנהל-על בלבד');
ok('GET_ACTION_PERMS.eventsSync = PERM_SUPER', vm.runInContext('GET_ACTION_PERMS.eventsSync === PERM_SUPER', sb));
reset();
res = sb.handleEventsSync_({});
ok('וההנדלר עצמו בודק PERM_SUPER (הגנה כפולה)', authorizeNeed === vm.runInContext('PERM_SUPER', sb));
ok('ומחזיר שנים/כתיבות/טריגרים', res.ok === true && Array.isArray(res.years) && 'triggersMade' in res, JSON.stringify(res));
reset();
res = sb.handleEventsSync_({ deny: 1 });
ok('בלי הרשאה — נדחה ולא נכתב דבר', res.ok === false && written.length === 0);
ok('⚠️ eventsList עצמו אינו ב-GET_ACTION_PERMS (כל תושב פעיל)', vm.runInContext('!("eventsList" in GET_ACTION_PERMS)', sb));

/* ---------------- לקוח ---------------- */
section('6. לקוח — getEventsFast');
const start = DS.indexOf('var EVENTS_FROM_FIRESTORE = true;');
const endFn = DS.indexOf('\n  }\n', DS.indexOf('function getEventsFast(year, cb)')) + 4;
ok('הבלוק נמצא', start > 0 && endFn > start);
const BLOCK = DS.slice(start, endFn);
ok('מיוצא ב-CBA.data', /getEventsFast: getEventsFast,/.test(DS));

function run(opts, cb) {
  const timers = [];
  const ctx = {
    Date, Array, isFinite, String, JSON,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    clearTimeout: id => { if (timers[id - 1]) timers[id - 1].f = null; },
    CBA: { perf: null, fb: opts.noSdk ? null : {
      readDoc: (c, id, k) => { ctx.__read = c + '/' + id; if (opts.hang) return; opts.readErr ? k(opts.readErr) : k(null, opts.doc); },
      ensureDb: k => k(opts.dbErr || null),
      userReady: k => k(opts.noUser ? null : { uid: 'u' }),
      flag: (key, d) => (opts.flags && key in opts.flags) ? opts.flags[key] : d
    } },
    getEventsList: (y, k) => { ctx.__sheets = y; k({ ok: true, events: [{ id: 'fromSheets' }] }); }
  };
  vm.createContext(ctx);
  vm.runInContext(BLOCK + '\n;this.getEventsFast = getEventsFast;', ctx);
  let got = null, calls = 0;
  ctx.getEventsFast(2026, r => { got = r; calls++; });
  if (opts.fireTimers) timers.forEach(x => x.f && x.f());
  cb(got, ctx, calls);
}
const fresh = { toMillis: () => Date.now() - 60 * 1000 };
run({ doc: { events: [{ id: 'e1' }], updatedAt: fresh } }, (r, c, k) => {
  ok('מסמך טרי → Firestore', r && r.source === 'firestore' && r.events[0].id === 'e1' && !c.__sheets);
  ok('קורא את eventsCal/<שנה>', c.__read === 'eventsCal/2026', c.__read);
  ok('📊 CBA.perf.events.source = firestore', c.CBA.perf && c.CBA.perf.events.source === 'firestore');
  ok('קולבק אחד בלבד', k === 1);
});
run({ doc: { events: [], updatedAt: fresh } }, r => {
  ok('⚠️ events: [] במסמך טרי — תשובה תקינה, לא נפילה', r && r.source === 'firestore' && r.events.length === 0);
});
run({ doc: null }, (r, c) => ok('מסמך חסר → Apps Script (שגם זורע)', r.events[0].id === 'fromSheets' && c.CBA.perf.events.why === 'missing'));
run({ doc: { events: [{ id: 'x' }], updatedAt: { toMillis: () => Date.now() - 7 * 3600e3 } } }, (r, c) =>
  ok('🔴 מסמך ישן מ-6 שעות → Apps Script', r.events[0].id === 'fromSheets' && c.CBA.perf.events.why === 'stale'));
run({ doc: { events: [{ id: 'x' }] } }, (r, c) =>
  ok('🔴 מסמך בלי updatedAt → נחשב ישן', r.events[0].id === 'fromSheets' && c.CBA.perf.events.why === 'stale'));
run({ doc: { events: [{ id: 'x' }], updatedAt: { seconds: Math.floor(Date.now() / 1000) - 30 } } }, r =>
  ok('updatedAt בצורת {seconds} מתקבל', r.source === 'firestore'));
run({ readErr: { code: 'permission-denied' } }, (r, c) =>
  ok('כלל דחה → Apps Script', r.events[0].id === 'fromSheets' && /permission-denied/.test(c.CBA.perf.events.why)));
run({ noUser: true, doc: { events: [] } }, (r, c) => ok('אין משתמש → Apps Script', r.events[0].id === 'fromSheets' && c.CBA.perf.events.why === 'no-user'));
run({ dbErr: new Error('x'), doc: { events: [] } }, r => ok('ensureDb נכשל → Apps Script', r.events[0].id === 'fromSheets'));
run({ noSdk: true }, r => ok('אין SDK → Apps Script', r.events[0].id === 'fromSheets'));
run({ flags: { eventsFromFirestore: false }, doc: { events: [], updatedAt: fresh } }, (r, c) =>
  ok('🔴 מתג כיבוי eventsFromFirestore=false → Apps Script', r.events[0].id === 'fromSheets' && c.CBA.perf.events.why === 'flag-off' && !c.__read));
run({ hang: true, fireTimers: true }, (r, c, k) => {
  ok('🔴 Firestore תקוע → פסק זמן → Apps Script', r && r.events[0].id === 'fromSheets' && c.CBA.perf.events.why === 'timeout');
  ok('ועדיין קולבק אחד', k === 1);
});
ok('פסק הזמן הכולל 8 שניות', /EVENTS_FS_TIMEOUT_MS = 8000/.test(BLOCK));
ok('הדגל נבדק אחרי ensureDb', /ensureDb\(function \(dbErr\)[\s\S]{0,300}flag\("eventsFromFirestore"/.test(BLOCK));

section('7. המסכים משתמשים במסלול המהיר');
ok('עמוד הבית (homeSchedule)', /CBA\.data\.getEventsFast \|\| CBA\.data\.getEventsList/.test(HS));
ok('מסך האירועים (events)', /CBA\.data\.getEventsFast \|\| CBA\.data\.getEventsList/.test(EV));
ok('🔴 ובמטמון המקומי של הבית — עדיין בלי ימי הולדת', /e\.category !== "birthdays"/.test(HS));
ok('מסך מצב המערכת: דגל eventsFromFirestore עם ברירת מחדל true',
   /eventsFromFirestore:\s*\["לוח האירועים"[^\]]*true\]/.test(SS));
ok('ובדיקת קריאה חיה של eventsCal', /c: "eventsCal"/.test(SS));
ok('🔴 רשום ב-FLAG_KEYS בשרת — אחרת מתג הכיבוי במסך יידחה',
   /var FLAG_KEYS = \[[\s\S]*?'eventsFromFirestore'[\s\S]*?\];/.test(GS));

section('8. 🔴 הכלל אינו רחב מהשרת');
const fnE = (RULES.replace(/\/\*[\s\S]*?\*\//g, '').match(/function canSeeEvents\(\) \{[\s\S]*?\}/) || [''])[0];
ok('isMember() && m().isExternal == false', /return isMember\(\) && m\(\)\.isExternal == false;/.test(fnE), fnE);
ok('קריאה בלבד', /match \/eventsCal\/\{year\} \{\s*allow read: if canSeeEvents\(\);[\s\S]{0,120}allow write: if false;/.test(RULES));

section('9. מסך האירועים — גודל קבוע, כמו בעמוד הבית');
const EVCSS = R('css/events.css');
ok('אותו מקסימום אירועים ליום כמו בבית (MAX_CHIPS)', /CBA\.homeSchedule\.MAX_CHIPS\) \|\| 2/.test(EV));
ok('slice(0, MAX_DAY) ו"+N נוספים"', /dayEvents\.slice\(0, MAX_DAY\)/.test(EV) && /"\+1 נוסף" : "\+" \+ extra \+ " נוספים"/.test(EV));
ok('תא בגובה קבוע (height ולא min-height)', /\.day \{[^}]*height: var\(--ev-day-h, 122px\)/.test(EVCSS));
ok('ובמובייל גובה משלו', /--ev-day-h: 64px/.test(EVCSS));

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
