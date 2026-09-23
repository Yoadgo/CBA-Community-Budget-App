/* הרצה:  cd tools && node test-home-dashboard-2026-09-23.js
   ============================================================================
   מארז בדיקות לעמוד הבית אחרי לוח האירועים (23.9.2026): הלו"ז
   (js/screens/homeSchedule.js), מקטע הגינון (js/screens/homeGarden.js)
   והחיבור שלהם ב-home.js. רץ ב-jsdom, בלי שרת ובלי דפדפן.

   🔴🔴 מה המארז שומר עליו — כל אחד מהם נשבר **בשקט**:
     1. **גודל קבוע.** תא-יום מציג לכל היותר MAX_CHIPS אירועים ואחריהם
        "+N נוספים" — לא גדל עם התוכן (בקשת יועד, 23.9).
     2. **כשל אינו "אין".** לוח שלא נטען מציג שגיאה ו"לנסות שוב" — לא גריד
        ריק שנראה כמו "אין אירועים". אותו דבר בשורת "מחכה להחלטה".
     3. **ימי הולדת לא נכתבים ל-localStorage** — שמות תושבים לא נשארים
        על מכשיר (מדיניות צמצום הנתונים).
     4. **המטמון עובד.** ציור חוזר של הבית (רענון רקע) לא יוצא שוב ל-Apps
        Script — eventsList עולה ~5 שניות.
     5. **הגנן החיצוני לא רואה את מקטע הגינון** — אותו תנאי של "MANAGER".
     6. **מספרי הגינון = המנוע של מסך הנתונים**, ו"בוצעו השבוע" = ההגדרה של
        מסך המשימות.
     7. **ההאזנה לא נרשמת על #app-main** — הוא אותו אלמנט לנצח, ומאזין לכל
        ציור היה מצטבר (באג שתוקן כאן).
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const wait = ms => new Promise(r => setTimeout(r, ms));

const HOME = R('js/screens/home.js');
const SCHED = R('js/screens/homeSchedule.js');
const GARDEN = R('js/screens/homeGarden.js');
const LANG = R('js/data/gardenLang.js');
const CALC = R('js/data/gardenStatsCalc.js');
const EVENTS = R('js/screens/events.js');
const CSS_S = R('css/homeSchedule.css');
const CSS_G = R('css/homeGarden.css');
const CSS_H = R('css/home.css');
const CSS_R = R('css/resident.css');

const DAY = 86400000;
function sod(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function at(daysFromToday, h, m) {
  const d = sod(new Date()); d.setDate(d.getDate() + daysFromToday); d.setHours(h || 9, m || 0, 0, 0);
  return d.toISOString();
}
function key(d) { const p = n => (n < 10 ? '0' : '') + n; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
function dayKey(n) { const d = sod(new Date()); d.setDate(d.getDate() + n); return key(d); }

let dom, window, calls, stubs;
function boot(o) {
  o = o || {};
  dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.test/' });
  window = dom.window;
  global.window = window; global.document = window.document;
  calls = [];
  stubs = o;
  window.CBA = {
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    screens: {},
    user: Object.assign({ familyId: '12', house: '12', firstName: 'יועד' }, o.user || {}),
    perms: o.perms || [], isSuper: !!o.isSuper,
    navigate: s => calls.push('nav:' + s), gotoAdmin: s => calls.push('admin:' + s),
    formatILS: n => '₪' + n, alerts: () => ({}),
    sheets: { isConnected: () => true },
    skel: { rows: () => '<div class="skeleton sk-line"></div>' },
    ui: { emptyState: x => '<div class="empty"><div class="empty__title">' + x.title + '</div></div>' },
    residentUtils: { fullName: u => u.firstName, myRequests: () => [], splitRequests: () => ({ refunds: [] }) },
    tour: { newCount: cb => setTimeout(() => cb(0), 0) },
    fb: { queryCollection: (c, w, cb) => { calls.push('fs:' + c); setTimeout(() => cb(null, (o.rsvp || []).map(id => ({ id }))), 0); } }
  };
  window.CBA.data = {
    getHomeCountsFast: (d, cb) => setTimeout(() => cb(null), 0),
    getTourFast: cb => setTimeout(() => cb(null), 0),
    getClubResvFast: cb => setTimeout(() => cb(o.resv ? { ok: true, reservations: o.resv } : null), 0),
    getHomeExtras: cb => setTimeout(() => cb(null), 0),
    getMyClubReservations: (x, cb) => setTimeout(() => cb(null), 0),
    getMyGardenReports: cb => setTimeout(() => cb(null), 0),
    getGymStatusFast: cb => setTimeout(() => cb(null), 0),
    listSignups: cb => setTimeout(() => cb(null), 0),
    getGymList: cb => setTimeout(() => cb(null), 0),
    getProfileChanges: cb => setTimeout(() => cb(null), 0),
    getGardenTasks: (x, cb) => setTimeout(() => cb({ ok: true, rows: [] }), 0),
    getEventsList: (y, cb) => {
      calls.push('as:eventsList:' + y);
      setTimeout(() => cb(o.eventsFail ? { ok: false, error: 'נפל' }
        : { ok: true, events: (o.events || []).filter(e => new Date(e.date).getFullYear() === y) }), 0);
    },
    getGardenStatsLive: (w, cb) => {
      calls.push('fs:gardenStats');
      setTimeout(() => cb(o.gardenFail ? { ok: false, error: 'נפל' }
        : { ok: true, rows: o.gardenRows || [], log: [], categories: [], requireApproval: true, logOk: true }), 0);
    }
  };
  if (o.focusSpy !== false) {
    window.CBA.screens.events = { focus: d => calls.push('focus:' + key(d)), openRsvp: ev => calls.push('rsvp:' + ev.id + ':' + ev.category),
                                  calendarLinks: { google: () => 'https://calendar.google.com/x', apple: () => 'data:text/calendar,x' } };
  }
  if (o.withLang !== false) { window.eval(LANG); window.eval(CALC); }
  if (o.withSched !== false) window.eval(SCHED);
  if (o.withGarden) window.eval(GARDEN);
  window.eval(HOME);
}
function render(container) {
  const c = container || window.document.createElement('div');
  if (!container) { window.document.body.innerHTML = ''; window.document.body.appendChild(c); }
  window.CBA.screens.resHome.render(c);
  return c;
}

(async function () {

  section('1. פריסה לפי תפקיד');
  {
    boot({});
    let c = render();
    ok('תושב → hm-cols--res', !!c.querySelector('#hm-cols.hm-cols--res'));
    ok('תושב → כרטיס לו"ז בגריד', !!c.querySelector('#hm-sch.hm-sch--grid'));
    ok('תושב → מקום ל"הבא בקהילה"', !!c.querySelector('#hm-feat'));
    ok('תושב → אין מקטע גינון', !c.querySelector('#hm-gardensec'));
    ok('🔴 הפעולות יושבות בתוך שורת הברכה', !!c.querySelector('.hm-hero .hm-actions'));

    boot({ perms: ['תקציב'] });
    c = render();
    ok('בעל תפקיד → hm-cols--adm', !!c.querySelector('#hm-cols.hm-cols--adm'));
    ok('בעל תפקיד → לו"ז כרשימה', !!c.querySelector('#hm-sch.hm-sch--list'));
    ok('בעל תפקיד → אין "הבא בקהילה" בעמודה', !c.querySelector('#hm-feat'));
    ok('🔴 "אצלנו בבית" עדיין לפני "תפקיד ועד" ב-DOM',
       c.innerHTML.indexOf('hm-mine') < c.innerHTML.indexOf('hm-vaad'));
    /* 23.9 (ערב) — עולם התושב ראשון לגמרי: הוועד יצא מהשורה של הלו"ז. */
    ok('🔴 הלו"ז לפני משטח הוועד — לא ביניהם', c.innerHTML.indexOf('id="hm-sch"') < c.innerHTML.indexOf('hm-vzone'));
    ok('תפקיד ועד אינו בתוך #hm-cols', !c.querySelector('#hm-cols .hm-vaad'));
    ok('בלי גינון → משטח בלי hm-vzone--g', !!c.querySelector('.hm-vzone') && !c.querySelector('.hm-vzone--g'));
    ok('מנהל תקציב בלי גינון → אין מקטע גינון', !c.querySelector('#hm-gardensec'));

    boot({ withSched: false });
    c = render();
    ok('⚠️ בלי homeSchedule.js — אין כרטיס לו"ז ריק', !c.querySelector('#hm-sch'));
  }

  section('2. 🔴 גודל קבוע — שני אירועים ביום, ומעבר לזה "+N"');
  {
    const four = [1, 2, 3, 4].map(i => ({ id: 'e' + i, title: 'אירוע ' + i, date: at(1, 10 + i), allDay: false, category: 'community' }));
    const three = [5, 6, 7].map(i => ({ id: 'e' + i, title: 'אירוע ' + i, date: at(2, 10), allDay: true, category: 'breaks' }));
    boot({ events: four.concat(three) });
    const c = render();
    await wait(30);
    const d1 = c.querySelector('.hm-day[data-hm-date="' + dayKey(1) + '"]');
    ok('התא קיים', !!d1);
    ok('🔴 ארבעה אירועים → שני שבבים בלבד', d1 && d1.querySelectorAll('.hm-ev').length === 2,
       d1 ? String(d1.querySelectorAll('.hm-ev').length) : '');
    ok('ו-"+2 נוספים"', d1 && /\+2 נוספים/.test(d1.textContent));
    const d2 = c.querySelector('.hm-day[data-hm-date="' + dayKey(2) + '"]');
    ok('שלושה → "+1 נוסף" (לשון יחיד)', d2 && /\+1 נוסף/.test(d2.textContent) && !/נוספים/.test(d2.textContent));
    ok('MAX_CHIPS הוא 2', window.CBA.homeSchedule.MAX_CHIPS === 2);
    ok('⚠️ ה-CSS נותן לתא גובה קבוע (height, לא min-height)',
       /\.hm-day \{[^}]*\bheight: var\(--hm-day-h\)/.test(CSS_S) && !/\.hm-day \{[^}]*min-height/.test(CSS_S));
    ok('ו--hm-day-h מוגדר', /--hm-day-h:\s*\d+px/.test(CSS_S));
    ok('14 תאים בגריד', c.querySelectorAll('.hm-sch__grid .hm-day').length === 14);
    ok('היום מסומן', !!c.querySelector('.hm-day.is-today'));
    ok('ושעה מוצגת רק לאירוע עם שעה', /\d\d:\d\d/.test(d1.textContent) && !/\d\d:\d\d/.test(d2.textContent));
  }

  section('3. 🔴 כשל אינו "אין"');
  {
    boot({ eventsFail: true });
    const c = render();
    await wait(30);
    const sch = c.querySelector('#hm-sch');
    ok('הודעת שגיאה', /לא הצלחנו|נפל/.test(sch.textContent), sch.textContent.slice(0, 80));
    ok('וכפתור "לנסות שוב"', !!sch.querySelector('[data-hm-retry]'));
    ok('⚠️ ואין גריד ריק שנראה כמו "אין אירועים"', !sch.querySelector('.hm-day:not(.is-skel)'));
  }

  section('4. המטמון — ציור חוזר לא יוצא שוב ל-Apps Script');
  {
    boot({ events: [{ id: 'a', title: 'פיקניק', date: at(3, 17), category: 'community' }] });
    const c = render();
    await wait(30);
    const n1 = calls.filter(x => x.indexOf('as:eventsList') === 0).length;
    render(c);
    await wait(30);
    const n2 = calls.filter(x => x.indexOf('as:eventsList') === 0).length;
    ok('קריאה ראשונה יצאה', n1 >= 1, String(n1));
    ok('🔴 ציור שני — אפס קריאות חדשות', n2 === n1, n1 + '→' + n2);
    ok('והאירוע מצויר מיד בציור השני', /פיקניק/.test(c.querySelector('#hm-sch').textContent));
  }

  section('5. 🔴 ימי הולדת לא נכתבים ל-localStorage');
  {
    boot({ events: [
      { id: 'b1', title: 'יום הולדת לנועה', date: at(4), allDay: true, category: 'birthdays' },
      { id: 'k1', title: 'חופש בגנים', date: at(5), allDay: true, category: 'breaks' }] });
    render();
    await wait(30);
    const raw = window.localStorage.getItem('cba_home_events_v1') || '';
    ok('המטמון נכתב', raw.length > 0);
    ok('🔴 בלי יום ההולדת', raw.indexOf('נועה') === -1 && raw.indexOf('birthdays') === -1);
    ok('ועם חופש הגנים', raw.indexOf('חופש בגנים') !== -1);
    ok('⚠️ ובלי תיאור (טקסט חופשי) — רק מה שהכרטיס צריך', raw.indexOf('"description"') === -1);
  }

  section('6. השריונים של המשפחה נכנסים ללו"ז');
  {
    boot({ events: [], resv: [
      { id: 'r1', start: at(2, 17), end: at(2, 20), status: 'approved' },
      { id: 'r2', start: at(3, 17), end: at(3, 20), status: 'declined' }] });
    const c = render();
    await wait(1400);
    const d2 = c.querySelector('.hm-day[data-hm-date="' + dayKey(2) + '"]');
    ok('שריון מאושר → שבב "שריון מועדון"', d2 && /שריון מועדון/.test(d2.textContent), d2 ? d2.textContent : '');
    const d3 = c.querySelector('.hm-day[data-hm-date="' + dayKey(3) + '"]');
    ok('⚠️ שריון שנדחה — לא', d3 && !/שריון מועדון/.test(d3.textContent));
    ok('🔴 והשורה "אין שריון קרוב" לא מופיעה כשיש שריון',
       !/אין שריון קרוב/.test(c.querySelector('#hm-quiet').textContent));
  }

  section('7. "אין שריון קרוב" עובר לשורה השקטה');
  {
    boot({ resv: [] });
    const c = render();
    await wait(1400);
    const q = c.querySelector('#hm-quiet');
    ok('השורה השקטה מופיעה', !q.hidden);
    ok('עם "אין בקשות החזר פתוחות" ו"אין שריון קרוב"',
       /אין בקשות החזר פתוחות/.test(q.textContent) && /אין שריון קרוב/.test(q.textContent), q.textContent);
    ok('ואין שורה מלאה ל"אין שריון"', c.querySelector('#hm-next').innerHTML === '');
    ok('"אין שריון קרוב" מוביל לשריון', !!q.querySelector('[data-goto="resReserve"]'));
  }

  section('8. רשימה (בעל תפקיד) — גובה קבוע');
  {
    const evs = [];
    for (let i = 1; i <= 9; i++) evs.push({ id: 'l' + i, title: 'אירוע ' + i, date: at(i, 12), allDay: true, category: 'holidays' });
    boot({ perms: ['תקציב'], events: evs });
    const c = render();
    await wait(30);
    const rows = c.querySelectorAll('#hm-sch .hm-ag__d');
    ok("🔴 לכל היותר 5 שורות-יום", rows.length <= 5, String(rows.length));
    ok('השורה הראשונה היא היום', rows[0] && rows[0].classList.contains('is-today'));
    ok('היום ריק → מסומן is-empty-today (מוסתר במובייל)', rows[0].classList.contains('is-empty-today'));
    ok('השלישית ואילך מסומנות is-extra (מוסתרות במובייל)',
       rows[3] && rows[3].classList.contains('is-extra') && !rows[2].classList.contains('is-extra'));
    ok('⚠️ וה-CSS באמת מסתיר אותן במובייל',
       /\.hm-sch--list \.hm-ag__d\.is-empty-today,\s*\.hm-sch--list \.hm-ag__d\.is-extra/.test(CSS_S));
  }

  section('9. "הבא בקהילה" ואישור הגעה');
  {
    const ev = { id: 'c1', title: 'פתיחת שנה מבוגרים', date: at(15, 20, 30), allDay: false, category: 'culture', location: 'מועדון משפחות' };
    boot({ events: [ev], rsvp: ['c1'] });
    let c = render();
    await wait(40);
    const f = c.querySelector('#hm-feat .hm-feat');
    ok('הכרטיס מופיע', !!f);
    ok('עם הכותרת והמקום', f && /פתיחת שנה מבוגרים/.test(f.textContent) && /מועדון משפחות/.test(f.textContent));
    ok('🔴 RSVP פתוח → כפתור "אישור הגעה"', !!(f && f.querySelector('[data-hm-rsvp="c1"]')));
    f.querySelector('[data-hm-rsvp]').click();
    ok('והלחיצה פותחת את הדיאלוג של מסך האירועים, עם category', calls.indexOf('rsvp:c1:culture') !== -1, calls.join(','));

    boot({ events: [ev], rsvp: [] });
    c = render();
    await wait(40);
    ok('⚠️ RSVP סגור → אין כפתור', !c.querySelector('#hm-feat [data-hm-rsvp]'));
    ok('אבל "הוספה ליומן" כן', !!c.querySelector('#hm-feat [data-hm-addcal]'));
    c.querySelector('[data-hm-addcal]').click();
    ok('והלחיצה חושפת Google ו-Apple', c.querySelector('.hm-feat__cals').hidden === false &&
       /Google/.test(c.querySelector('.hm-feat__cals').textContent));

    boot({ events: [{ id: 'far', title: 'רחוק', date: at(80, 20), category: 'community' }] });
    c = render();
    await wait(40);
    ok('⚠️ אירוע בעוד 80 יום → אין כרטיס', c.querySelector('#hm-feat').innerHTML === '');
  }

  section('10. לחיצה על יום → לוח האירועים על אותו יום');
  {
    boot({ events: [] });
    const c = render();
    await wait(30);
    c.querySelector('.hm-day[data-hm-date="' + dayKey(0) + '"]').click();
    ok('focus נקרא עם התאריך', calls.indexOf('focus:' + dayKey(0)) !== -1, calls.join(','));
    ok('וניווט ל-events', calls.indexOf('nav:events') !== -1);
    ok('⚠️ events.js מייצא focus / openRsvp / calendarLinks',
       /focus: function \(d\)/.test(EVENTS) && /openRsvp: function \(ev\)/.test(EVENTS) && /calendarLinks: \{ google: googleAddUrl, apple: appleIcsDataUri \}/.test(EVENTS));
    ok('🔴 ו-render של events משתמש בתאריך ומאפס אותו',
       /var focusDate = pendingFocus;\s*pendingFocus = null;/.test(EVENTS));
  }

  section('11. 🔴 ההאזנה לא נרשמת על המכל (#app-main)');
  {
    boot({ perms: ['תקציב'] });
    const c = window.document.createElement('div');
    window.document.body.appendChild(c);
    let adds = 0;
    const orig = c.addEventListener.bind(c);
    c.addEventListener = function (t, f, o) { if (t === 'click') adds++; return orig(t, f, o); };
    render(c); render(c); render(c);
    ok('שלושה ציורים → אפס מאזיני click על המכל', adds === 0, String(adds));
    c.querySelector('.hm-act').click();
    ok('ולחיצה עדיין עובדת — ניווט אחד בלבד', calls.filter(x => x === 'nav:resSubmit').length === 1,
       calls.filter(x => x.indexOf('nav:') === 0).join(','));
  }

  section('12. מקטע הגינון — מי רואה');
  {
    boot({ perms: ['גינון'], withGarden: true, gardenRows: [] });
    let c = render();
    ok('מנהל גינון → יש מקטע', !!c.querySelector('#hm-gardensec'));
    ok('🔴 הגינון יושב בתוך משטח הוועד', !!c.querySelector('.hm-vzone.hm-vzone--g #hm-gardensec'));
    ok('ועם תווית לעמודת המשימות', !!c.querySelector('.hm-vzone__lbl'));
    ok('ושלד "מחכה להחלטה" בכרטיס הוועד', !!c.querySelector('#hm-gdecide.hm-lazy'));

    boot({ perms: ['גינון'], user: { isExternal: true }, withGarden: true });
    c = render();
    ok('🔴 גנן חיצוני → אין מקטע', !c.querySelector('#hm-gardensec'));
    ok('🔴 ואין שלד שלעולם לא ייסגר', !c.querySelector('#hm-gdecide'));

    boot({ perms: ['גינון'], withGarden: false });
    c = render();
    ok('⚠️ בלי homeGarden.js → אין שלד תקוע', !c.querySelector('#hm-gdecide'));
  }

  section('13. מקטע הגינון — המספרים');
  {
    boot({ isSuper: true, withGarden: false });
    const L = window.CBA.gardenLang;
    const cur = L.weekOf();
    const w = n => { const d = new Date(); d.setDate(d.getDate() + 7 * n); return L.weekOf(d); };
    const rows = [
      { id: '1', kind: 'שגרה', title: 'כיסוח', week: cur, closure: 'בוצע' },
      { id: '2', kind: 'שגרה', title: 'השקיה', week: cur },
      { id: '3', kind: 'דיווח תושב', title: 'ענפים פרוצים', createdAt: new Date(Date.now() - 2 * DAY).toISOString() },
      { id: '4', kind: 'דיווח תושב', title: 'ממטרה שבורה', week: cur, createdAt: new Date(Date.now() - DAY).toISOString() },
      { id: '5', kind: 'דיווח תושב', title: 'גיזום שיחים', week: w(-2), firstWeek: w(-2), area: 'ציר מערבי',
        createdAt: new Date(Date.now() - 16 * DAY).toISOString() },
      { id: '6', kind: 'שגרה', title: 'נמחק', week: cur, pendingDelete: true }
    ];
    boot({ isSuper: true, withGarden: true, gardenRows: rows, perms: ['על'] });
    const c = render();
    await wait(60);
    const sec = c.querySelector('#hm-gardensec');
    const kpis = sec.querySelectorAll('.hmg-kpi');
    ok('ארבעה אריחים', kpis.length === 4, String(kpis.length));
    ok('🔴 בוצעו השבוע: 1 / 3 (בלי המחוקה)', /1\s*\/\s*3/.test(kpis[0].textContent), kpis[0].textContent);
    ok('תקלות פתוחות: 3', /^\s*תקלות פתוחות\s*3/.test(kpis[1].textContent.replace(/\s+/g, ' ')) || /3/.test(kpis[1].querySelector('.hmg-kpi__v').textContent),
       kpis[1].textContent);
    ok('ו"אחת מחכה להחלטה"', /אחת מחכה להחלטה/.test(kpis[1].textContent));
    ok('נגררות: 1, בשבועיים+', kpis[2].querySelector('.hmg-kpi__v').textContent === '1' && /שבועיים\+ · 1/.test(kpis[2].textContent),
       kpis[2].textContent);
    ok('הכי נגררות → "גיזום שיחים" עם האזור', /גיזום שיחים/.test(sec.textContent) && /ציר מערבי/.test(sec.textContent));
    const dec = c.querySelector('#hm-tasks .hm-task[data-admin-goto="gardenTasks"]');
    ok('🔴 שורת הוועד: "דיווח גינון מחכה להחלטה"', !!dec && /דיווח גינון מחכה להחלטה/.test(dec.textContent),
       c.querySelector('#hm-tasks').textContent.slice(0, 120));
    ok('עם כותרת הדיווח ומתי', dec && /ענפים פרוצים/.test(dec.textContent) && /לפני 2 ימים/.test(dec.textContent));
    ok('⚠️ ו"הכול מטופל" מוסתר', c.querySelector('#hm-clear').hidden === true);
    ok('האריחים מובילים למסכי הגינון', kpis[0].dataset.adminGoto === 'gardenTasks' && kpis[1].dataset.adminGoto === 'gardenStats');
  }

  section('14. מקטע הגינון — אין החלטות / כשל');
  {
    boot({ isSuper: true, withGarden: true, perms: ['על'],
           gardenRows: [{ id: '1', kind: 'שגרה', title: 'כיסוח', week: '' }] });
    let c = render();
    await wait(1500);
    ok('אפס החלטות → השלד נעלם', !c.querySelector('#hm-gdecide'));
    ok('ו"הכול מטופל" חוזר (אין שורות אחרות)', c.querySelector('#hm-clear').hidden === false);

    boot({ isSuper: true, withGarden: true, perms: ['על'], gardenFail: true });
    c = render();
    await wait(1500);
    ok('🔴 כשל → השלד נעלם בשקט, לא "0"', !c.querySelector('#hm-gdecide') && !/0 דיווחי/.test(c.textContent));
    ok('ובמקטע — הודעה ו"לנסות שוב"', /לא הצלחנו לטעון את נתוני הגינון/.test(c.querySelector('#hm-gardensec').textContent) &&
       !!c.querySelector('[data-hmg-retry]'));
  }

  section('15. קבצים וגרסה');
  {
    const idx = R('index.html'), sw = R('service-worker.js');
    const v = ((idx.match(/\?v=([0-9a-z]+)/) || [])[1]) || '';
    ['css/homeSchedule.css', 'css/homeGarden.css', 'js/screens/homeSchedule.js', 'js/screens/homeGarden.js']
      .forEach(f => ok(f + ' נטען עם הגרסה', idx.indexOf(f + '?v=' + v) !== -1));
    ok('🔴 homeSchedule/homeGarden נטענים לפני home.js',
       idx.indexOf('js/screens/homeGarden.js') < idx.indexOf('js/screens/home.js') &&
       idx.indexOf('js/screens/homeSchedule.js') < idx.indexOf('js/screens/home.js'));
    ok('service-worker על אותה גרסה', sw.indexOf('VERSION = "' + v + '"') !== -1);
    ok('🔴 עמוד הבית רחב במחשב (resident.css)', /data-screen="resHome"\] \.app-main \{ max-width: min\(2000px, 97vw\)/.test(CSS_R));
    ['hm-quiet', 'hm-cols--res', 'hm-cols--adm', 'hm-hero__txt',
     'hm-vzone', 'hm-vzone--g', 'hm-vzone__grid', 'hm-vzone__tasks', 'hm-vzone__lbl'].forEach(k => ok('.' + k + ' ב-home.css', CSS_H.indexOf('.' + k) !== -1));
    /* 🔴 השלד/מצב-ריק ההפוכים (לבן-שקוף) רק בעמודת המשימות — אחרת שלד הגינון
       בכרטיס לבן בלתי נראה. */
    ok('🔴 שלד לבן-שקוף מוגבל ל-.hm-tasks', /\.hm-vaad \.hm-tasks \.skeleton/.test(CSS_H) && !/\.hm-vaad \.skeleton/.test(CSS_H));
    ok('🔴 כרטיסי הגינון על הצפחה — טקסט כהה (לא יורשים לבן)', /\.hm-vzone \.hmg \.card \{[^}]*color: var\(--text\)/.test(CSS_H));
    ['hmg-kpi', 'hmg-cards', 'hmg-tr', 'hmg-more'].forEach(k => ok('.' + k + ' ב-homeGarden.css', CSS_G.indexOf('.' + k) !== -1));
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
