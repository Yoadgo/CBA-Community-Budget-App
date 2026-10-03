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

   🔴 גל 2 (30.9.26) — הבית נבנה מחדש (ספר האבנים, פרק 1): הלו"ז הוא אריח
   "השבוע", "הבא בקהילה" הם גיליון מהמיני-כרטיס, והגינון + "תפקיד ועד" עברו
   ללוח הניהול (adminBoard). הגריד (host) נשאר ב-homeSchedule ונבדק ישירות.
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
const CSS_H = R('css/home2.css');   /* גל 2 (30.9.26) */
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
    ui: { emptyState: x => '<div class="empty"><div class="empty__title">' + x.title + '</div></div>',
          sheet: o => { const w = window.document.createElement('div'); w.className = 'gt-sheet-wrap';
            w.innerHTML = '<div class="gt-sheet ' + (o.sheetCls || '') + '">' + o.html + '</div>';
            window.document.body.appendChild(w); return { wrap: w, close: () => w.remove() }; } },
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
function render(container, screen) {
  const c = container || window.document.createElement('div');
  if (!container) { window.document.body.innerHTML = ''; window.document.body.appendChild(c); }
  window.CBA.screens[screen || 'resHome'].render(c);
  return c;
}
/* הגריד/הרשימה של homeSchedule — לא בבית יותר, נבדק ישירות דרך mount({host}) */
function mountSched(mode) {
  window.document.body.innerHTML = '';
  const root = window.document.createElement('div'), host = window.document.createElement('section');
  root.appendChild(host); window.document.body.appendChild(root);
  window.CBA.homeSchedule.mount({ root: root, host: host, mode: mode || 'grid' });
  return host;
}

(async function () {

  section('1. הבית לפי תפקיד');
  {
    boot({});
    let c = render();
    ok('תושב → אריח "השבוע"', !!c.querySelector('#hm-week'));
    ok('תושב → מיני "האירוע הבא"', !!c.querySelector('#hm-mini-ev[data-hm-nextsheet]'));
    ok('🔴 אין גריד שבועיים ואין רשימת 10 ימים בבית (H20/H24)', !c.querySelector('#hm-sch') && !c.querySelector('.hm-day'));
    ok('תושב → אין מקטע גינון', !c.querySelector('#hm-gardensec'));
    ok('תושב → אין מיני ניהול', !c.querySelector('#hm-mini-adm'));

    boot({ perms: ['תקציב'] });
    c = render();
    ok('🔴 בעל תפקיד → אותו בית בדיוק (A9) + מיני "ממתין לטיפולך"', !!c.querySelector('#hm-week') && !!c.querySelector('#hm-mini-adm'));
    ok('ובלי משטח ועד בבית', !c.querySelector('.hm-vzone') && !c.querySelector('#hm-tasks'));

    boot({ withSched: false });
    c = render();
    ok('⚠️ בלי homeSchedule.js — אין אריח "השבוע" ריק', !c.querySelector('#hm-week'));
  }

  section('2. 🔴 גודל קבוע (הגריד שעבר ללוח) — שני אירועים ביום, ומעבר לזה "+N"');
  {
    const four = [1, 2, 3, 4].map(i => ({ id: 'e' + i, title: 'אירוע ' + i, date: at(1, 10 + i), allDay: false, category: 'community' }));
    const three = [5, 6, 7].map(i => ({ id: 'e' + i, title: 'אירוע ' + i, date: at(2, 10), allDay: true, category: 'breaks' }));
    boot({ events: four.concat(three) });
    const c = mountSched('grid');
    await wait(30);
    const d1 = c.querySelector('.hm-day[data-hm-date="' + dayKey(1) + '"]');
    ok('התא קיים', !!d1);
    ok('🔴 ארבעה אירועים → שני שבבים בלבד', d1 && d1.querySelectorAll('.hm-ev').length === 2);
    ok('ו-"+2 נוספים"', d1 && /\+2 נוספים/.test(d1.textContent));
    const d2 = c.querySelector('.hm-day[data-hm-date="' + dayKey(2) + '"]');
    ok('שלושה → "+1 נוסף" (לשון יחיד)', d2 && /\+1 נוסף/.test(d2.textContent) && !/נוספים/.test(d2.textContent));
    ok('MAX_CHIPS הוא 2', window.CBA.homeSchedule.MAX_CHIPS === 2);
    ok('14 תאים בגריד', c.querySelectorAll('.hm-sch__grid .hm-day').length === 14);
  }

  section('3. 🔴 כשל אינו "אין" — גם באריח "השבוע"');
  {
    boot({ eventsFail: true });
    const c = render();
    await wait(30);
    const w = c.querySelector('#hm-week');
    ok('הודעת שגיאה באריח', /לא הצלחנו|נפל/.test(w.textContent), w.textContent.slice(0, 80));
    ok('וכפתור "לנסות שוב"', !!w.querySelector('[data-hm-retry]'));
    ok('⚠️ ואין פס ימים ריק שנראה כמו "אין אירועים"', !w.querySelector('.hm2-sd'));
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
    ok('והאירוע מצויר מיד בציור השני ("מה קרה")', /פיקניק/.test(c.querySelector('#hm-feed').textContent));
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

  section('6. השריון הקרוב — מיני-כרטיס, ונכנס לנקודות של "השבוע"');
  {
    boot({ events: [], resv: [
      { id: 'r1', start: at(2, 17), end: at(2, 20), status: 'approved' }] });
    const c = render();
    await wait(1400);
    const m = c.querySelector('#hm-next');
    ok('מיני "השריון הקרוב" מוצג', !m.hidden && /השריון הקרוב/.test(m.textContent), m.textContent);
    ok('ומוביל למסך השריון', m.dataset.goto === 'resReserve');
    const d2 = c.querySelector('.hm2-sd[data-hm-date="' + dayKey(2) + '"]');
    ok('🔴 והיום של השריון מקבל נקודה ב"השבוע"', !!d2 && !!d2.querySelector('.hm-dot--per'));
  }

  section('7. אין שריון ואין מנוי → בלי מיני-כרטיס (לא "אין")');
  {
    boot({ resv: [] });
    const c = render();
    await wait(1400);
    ok('#hm-next מוסתר', c.querySelector('#hm-next').hidden === true);
    ok('⚠️ ואין שום "אין שריון קרוב" בעמוד (H14)', !/אין שריון קרוב/.test(c.textContent));
  }

  section('8. רשימה (host=list) — גובה קבוע, עדיין עובדת');
  {
    const evs = [];
    for (let i = 1; i <= 9; i++) evs.push({ id: 'l' + i, title: 'אירוע ' + i, date: at(i, 12), allDay: true, category: 'holidays' });
    boot({ perms: ['תקציב'], events: evs });
    const c = mountSched('list');
    await wait(30);
    const rows = c.querySelectorAll('.hm-ag__d');
    ok('🔴 לכל היותר 5 שורות-יום', rows.length <= 5, String(rows.length));
    ok('השורה הראשונה היא היום', rows[0] && rows[0].classList.contains('is-today'));
  }

  section('9. גיליון "האירועים הבאים" (החלטת יועד 30.9) ואישור הגעה');
  {
    const ev = { id: 'c1', title: 'פתיחת שנה מבוגרים', date: at(15, 20, 30), allDay: false, category: 'culture', location: 'מועדון משפחות' };
    boot({ events: [ev], rsvp: ['c1'] });
    let c = render();
    await wait(40);
    const mini = c.querySelector('#hm-mini-ev');
    ok('המיני מציג את האירוע הבא', !mini.hidden && /פתיחת שנה מבוגרים/.test(mini.textContent), mini.textContent);
    mini.click();
    await wait(20);
    const sh = window.document.querySelector('.hm2-nxsheet');
    ok('🔴 לחיצה פותחת את הגיליון', !!sh);
    const f = sh && sh.querySelector('.hm-nx--cul');
    ok('עם כרטיס התרבות, הכותרת והמקום', f && /פתיחת שנה מבוגרים/.test(f.textContent) && /מועדון משפחות/.test(f.textContent));
    ok('🔴 RSVP פתוח → כפתור "אישור הגעה"', !!(f && f.querySelector('[data-hm-rsvp="c1"]')));
    ok('🔴 בלי "תזכורת" לתושב (החלטת יועד 30.9)', !sh.querySelector('[data-nx-remind]') && !/תזכורת/.test(sh.textContent));
    f.querySelector('[data-hm-rsvp]').click();
    ok('והלחיצה פותחת את הדיאלוג של מסך האירועים, עם category', calls.indexOf('rsvp:c1:culture') !== -1, calls.join(','));

    boot({ events: [ev], rsvp: [] });
    c = render();
    await wait(40);
    c.querySelector('#hm-mini-ev').click();
    await wait(20);
    const sh2 = window.document.querySelector('.hm2-nxsheet');
    ok('⚠️ RSVP סגור → אין כפתור', !sh2.querySelector('[data-hm-rsvp]'));
    ok('אבל "פרטים" כן', !!sh2.querySelector('[data-nx-more="c1"]'));
    sh2.querySelector('[data-nx-more="c1"]').click();
    const more = window.document.querySelector('.hm2-nxsheet .hm-nx__more');
    ok('והלחיצה חושפת Google ו-Apple', !!more && /Google/.test(more.textContent) && /Apple/.test(more.textContent));

    boot({ events: [{ id: 'far', title: 'רחוק', date: at(80, 20), category: 'community' }] });
    c = render();
    await wait(40);
    ok('אירוע בעוד 80 יום → במיני (בלי מגבלת זמן)', /רחוק/.test(c.querySelector('#hm-mini-ev').textContent));
  }

  section('10. לחיצה על יום ב"השבוע" → לוח האירועים על אותו יום');
  {
    boot({ events: [] });
    const c = render();
    await wait(30);
    c.querySelector('.hm2-sd[data-hm-date="' + dayKey(0) + '"]').click();
    ok('focus נקרא עם התאריך', calls.indexOf('focus:' + dayKey(0)) !== -1, calls.join(','));
    ok('וניווט ל-events', calls.indexOf('nav:events') !== -1);
    ok('⚠️ events.js מייצא focus / openRsvp / calendarLinks',
       /focus: function \(d\)/.test(EVENTS) && /openRsvp: function \(ev\)/.test(EVENTS) && /calendarLinks: \{ google: googleAddUrl, apple: appleIcsDataUri/.test(EVENTS) && /openApple: openApple/.test(EVENTS));
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
    c.querySelector('#hm-mygarden').click();
    ok('ולחיצה עדיין עובדת — ניווט אחד בלבד', calls.filter(x => x === 'nav:resGarden').length === 1,
       calls.filter(x => x.indexOf('nav:') === 0).join(','));
  }

  section('12. מקטע הגינון — בלוח הניהול, ומי רואה');
  {
    boot({ perms: ['גינון'], withGarden: true, gardenRows: [] });
    let c = render(null, 'adminBoard');
    ok('מנהל גינון → יש מקטע', !!c.querySelector('#hm-gardensec'));
    ok('ושלד "מחכה להחלטה" בכרטיס', !!c.querySelector('#hm-gdecide.hm-lazy'));
    c = render(null, 'resHome');
    ok('🔴 ובבית — אין מקטע גינון', !c.querySelector('#hm-gardensec'));

    boot({ perms: ['גינון'], user: { isExternal: true }, withGarden: true });
    c = render(null, 'adminBoard');
    ok('🔴 גנן חיצוני → אין מקטע', !c.querySelector('#hm-gardensec'));
    ok('🔴 ואין שלד שלעולם לא ייסגר', !c.querySelector('#hm-gdecide'));

    boot({ perms: ['גינון'], withGarden: false });
    c = render(null, 'adminBoard');
    ok('⚠️ בלי homeGarden.js → אין שלד תקוע', !c.querySelector('#hm-gdecide'));
  }

  section('13. מקטע הגינון — המספרים (לוח הניהול)');
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
    const c = render(null, 'adminBoard');
    await wait(60);
    const sec = c.querySelector('#hm-gardensec');
    const kpis = sec.querySelectorAll('.hmg-kpi');
    ok('ארבעה אריחים', kpis.length === 4, String(kpis.length));
    ok('🔴 בוצעו השבוע: 1 / 3 (בלי המחוקה)', /1\s*\/\s*3/.test(kpis[0].textContent), kpis[0].textContent);
    ok('ו"אחת מחכה להחלטה"', /אחת מחכה להחלטה/.test(kpis[1].textContent));
    ok('נגררות: 1, בשבועיים+', kpis[2].querySelector('.hmg-kpi__v').textContent === '1' && /שבועיים\+ · 1/.test(kpis[2].textContent));
    ok('הכי נגררות → "גיזום שיחים" עם האזור', /גיזום שיחים/.test(sec.textContent) && /ציר מערבי/.test(sec.textContent));
    ok('🔴 בלי שני הגרפים (H33) — קישור לנתוני הגינון במקומם',
       !sec.querySelector('.hmg-tr') && !sec.querySelector('.hmg-bars') && !!sec.querySelector('[data-admin-goto="gardenStats"].hmg-link'));
    const dec = c.querySelector('#hm-tasks .hm-task[data-admin-goto="gardenTasks"]');
    ok('🔴 שורת "דיווח גינון מחכה להחלטה"', !!dec && /דיווח גינון מחכה להחלטה/.test(dec.textContent));
    ok('עם כותרת הדיווח ומתי', dec && /ענפים פרוצים/.test(dec.textContent) && /לפני 2 ימים/.test(dec.textContent));
    ok('⚠️ ו"הכול מטופל" מוסתר', c.querySelector('#hm-clear').hidden === true);
  }

  section('14. מקטע הגינון — אין החלטות / כשל');
  {
    boot({ isSuper: true, withGarden: true, perms: ['על'],
           gardenRows: [{ id: '1', kind: 'שגרה', title: 'כיסוח', week: '' }] });
    let c = render(null, 'adminBoard');
    await wait(1500);
    ok('אפס החלטות → השלד נעלם', !c.querySelector('#hm-gdecide'));
    ok('ו"הכול מטופל" חוזר (אין שורות אחרות)', c.querySelector('#hm-clear').hidden === false);

    boot({ isSuper: true, withGarden: true, perms: ['על'], gardenFail: true });
    c = render(null, 'adminBoard');
    await wait(1500);
    ok('🔴 כשל → השלד נעלם בשקט, לא "0"', !c.querySelector('#hm-gdecide') && !/0 דיווחי/.test(c.textContent));
    ok('ובמקטע — הודעה ו"לנסות שוב"', /לא הצלחנו לטעון את נתוני הגינון/.test(c.querySelector('#hm-gardensec').textContent) &&
       !!c.querySelector('[data-hmg-retry]'));
  }

  section('15. קבצים וגרסה');
  {
    const idx = R('index.html'), sw = R('service-worker.js');
    /* (3.10.2026) גרסה לכל קובץ — אין יותר ערך אחד לכולם; השער הוא stamp-versions --check */
    const stampV = require('./stamp-versions.js').compute().versions;
    ['css/homeSchedule.css', 'css/homeGarden.css', 'css/home2.css', 'js/screens/homeSchedule.js', 'js/screens/homeGarden.js']
      .forEach(f => ok(f + ' נטען עם הגרסה', idx.indexOf(f + '?v=' + stampV[f]) !== -1));
    ok('🔴 homeSchedule/homeGarden נטענים לפני home.js',
       idx.indexOf('js/screens/homeGarden.js') < idx.indexOf('js/screens/home.js') &&
       idx.indexOf('js/screens/homeSchedule.js') < idx.indexOf('js/screens/home.js'));
    ok('service-worker על אותה גרסה', require('./stamp-versions.js').check().length === 0);
    ['hm2-strip', 'hm2-sd', 'hm2-sd__dots', 'hm2-nxsheet', 'hm2-faces', 'hm2-bgrid--g', 'hmg-cards--board', 'hmg-link']
      .forEach(k => ok('.' + k + ' ב-home2.css', CSS_H.indexOf('.' + k) !== -1));
    ['hmg-kpi', 'hmg-cards', 'hmg-tr', 'hmg-more'].forEach(k => ok('.' + k + ' ב-homeGarden.css', CSS_G.indexOf('.' + k) !== -1));
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
