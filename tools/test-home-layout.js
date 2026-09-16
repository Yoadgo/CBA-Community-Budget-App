/* הרצה:  cd tools && node test-home-layout.js
   ============================================================================
   מארז בדיקות לעיצוב מחדש של עמוד הבית (2026-09-16). רץ ב-jsdom, בלי שרת
   ובלי דפדפן: מצייר את `CBA.screens.resHome` האמיתי ובודק מה יצא ממנו.

   🔴🔴 ארבעה דברים שהמארז שומר עליהם, וכולם יכולים להישבר **בשקט**:

     1. **המזהים ששאר המנגנון בוחר לפיהם.** `fastPaint`, `loadLazyCounts`
        ו-`syncClearState` מוצאות את השלדים לפי `#hm-signups`, `#hm-gym`,
        `#hm-garden`, `#hm-profile`, `#hm-tasks`, `#hm-clear`, `#hm-next`.
        שינוי עיצובי שמחליף מזהה לא מפיל שום בדיקה קיימת — הוא פשוט
        משאיר את התגית תקועה בשלד לנצח.

     2. **אפס קריאות Apps Script מהשורות החדשות.** שורת הגינון ושורת
        המכון נכנסו לעמוד **רק** משום ששתיהן ב-Firestore (30ms ו-6–59ms).
        מי שיחליף אותן ביום מן הימים ב-`sheets.get` יחזיר לעמוד את
        ~2,000 האלפיות שדיאטת הפתיחה מחקה — ואף בדיקה אחרת לא תרגיש.

     3. **כשל אינו "אין".** שורת גינון שנכשלה חייבת להישאר ריקה ולא
        להכריז "לא דיווחת על כלום" — בדיוק התקלה שתוקנה ב-9.9 במסך
        הגינון עצמו, ואסור להחזיר אותה מכאן.

     4. **תושב בלי הרשאות ניהול לא רואה את כרטיס הוועד בכלל** — לא כרטיס
        ריק ולא כותרת בלי תוכן.
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

const dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
global.window = window; global.document = window.document; global.navigator = window.navigator;

const HOME = R('js/screens/home.js');
const CSS  = R('css/home.css');
const DS   = R('js/data/dataService.js');
const APP  = R('js/app.js');

const calls = [];
function setup(o) {
  o = o || {};
  calls.length = 0;
  window.CBA = {
    esc: s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    screens: {},
    user: { familyId: '12', house: '12', firstName: 'יועד' },
    perms: o.perms || [],
    isSuper: !!o.isSuper,
    navigate: () => {}, gotoAdmin: () => {},
    formatILS: n => '₪' + Number(n || 0).toLocaleString('en-US'),
    alerts: () => o.alerts || {},
    sheets: { isConnected: () => o.connected !== false },
    skel: { rows: () => '<div class="skeleton sk-line"></div>' },
    ui: { emptyState: x => '<div class="empty"><div class="empty__title">' + x.title + '</div></div>' },
    residentUtils: { fullName: u => u.firstName, myRequests: () => [],
                     splitRequests: () => ({ refunds: o.refunds || [] }) },
    tour: { newCount: cb => setTimeout(() => cb(o.newCount || 0), 0) }
  };
  window.CBA.data = {
    getHomeCountsFast: (d, cb) => { calls.push('fs:homeCounts'); setTimeout(() => cb(null), 0); },
    getTourFast: cb => { calls.push('fs:tour'); setTimeout(() => cb(null), 0); },
    getClubResvFast: cb => { calls.push('fs:clubResv'); setTimeout(() => cb(null), 0); },
    getHomeExtras: cb => { calls.push('as:homeExtras'); setTimeout(() => cb(null), 5); },
    getMyClubReservations: (x, cb) => { calls.push('as:myClubResv'); setTimeout(() => cb(null), 0); },
    getMyGardenReports: cb => { calls.push('fs:myGardenReports'); setTimeout(() => cb(o.gardenRes), 0); },
    getGymStatusFast: cb => { calls.push('fs:gymStatus'); setTimeout(() => cb(o.gymDoc), 0); },
    listSignups: cb => { calls.push('as:signups'); setTimeout(() => cb(null), 0); },
    getGymList: cb => { calls.push('as:gymList'); setTimeout(() => cb(null), 0); },
    getProfileChanges: cb => { calls.push('as:profile'); setTimeout(() => cb(null), 0); },
    getGardenTasks: (x, cb) => { calls.push('as:gardenTasks'); setTimeout(() => cb(null), 0); }
  };
  window.eval(HOME);
  const c = window.document.createElement('div');
  window.document.body.innerHTML = '';
  window.document.body.appendChild(c);
  window.CBA.screens.resHome.render(c);
  return c;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async function () {

  section('1. 🔴🔴 המזהים ששאר המנגנון בוחר לפיהם — שרדו');
  {
    const c = setup({ isSuper: true, alerts: { pendingExpenses: 4 } });
    ['#hm-tasks', '#hm-clear', '#hm-signups', '#hm-profile', '#hm-gym', '#hm-garden', '#hm-next']
      .forEach(id => ok('קיים ' + id, !!c.querySelector(id)));
    ok('🔴 והשלדים עדיין נושאים hm-lazy (התנאי של syncClearState)',
       c.querySelectorAll('#hm-tasks .hm-lazy').length === 4,
       String(c.querySelectorAll('#hm-tasks .hm-lazy').length));
    ok('ושורת ההוצאות נולדה כ-hm-task כמו קודם',
       !!c.querySelector('#hm-tasks .hm-task[data-admin-goto="expenses-pending"]'));
  }

  section('2. סדר העמוד — פעולות, משפחה, ועד');
  {
    const c = setup({ isSuper: true });
    const html = c.innerHTML;
    ok('הפעולות לפני הכרטיסים', html.indexOf('hm-actions') < html.indexOf('hm-cols'));
    const main = c.querySelector('.hm-main').innerHTML;
    ok('🔴 "אצלנו בבית" לפני "תפקיד ועד"', main.indexOf('hm-mine') < main.indexOf('hm-vaad'));
    ok('הכרטיס נושא את השם החדש', /תפקיד ועד/.test(c.querySelector('.hm-vaad__t').textContent));
    ok('⚠️ והעמודה השנייה נולדת כבויה',
       !c.querySelector('#hm-cols').classList.contains('hm-cols--two'));
  }

  section('3. תושב בלי הרשאות — אין כרטיס ועד בכלל');
  {
    const c = setup({});
    ok('אין .hm-vaad ב-DOM', !c.querySelector('.hm-vaad'));
    ok('וגם אין #hm-tasks', !c.querySelector('#hm-tasks'));
    ok('הכרטיס המשפחתי כן קיים', !!c.querySelector('.hm-mine'));
  }

  section('4. פעולות מהירות');
  {
    const c = setup({});
    const acts = Array.from(c.querySelectorAll('.hm-act'));
    ok('שבע גלולות', acts.length === 7, String(acts.length));
    ok('🔴 ה-CTA השחור הוא הראשון והיחיד',
       acts[0].classList.contains('hm-act--cta') && c.querySelectorAll('.hm-act--cta').length === 1);
    ok('והוא "הגשת קבלה"', acts[0].dataset.goto === 'resSubmit');
    const gotos = acts.map(a => a.dataset.goto);
    ok('שתי הפונקציות החדשות נכנסו',
       gotos.indexOf('resGardenNew') !== -1 && gotos.indexOf('resGym') !== -1, gotos.join(','));
    ok('⚠️ וכל יעד רשום כמסך תושב ב-app.js',
       gotos.every(g => APP.indexOf('"' + g + '"') !== -1), gotos.join(','));
    ok('⚠️ ורמז הגלילה כבוי כששורה אינה נגללת',
       !c.querySelector('#hm-acts-edge').classList.contains('is-more') &&
       c.querySelector('#hm-acts-dots').hidden === true);
  }

  section('5. שורת ההחזרים — אפס קריאות, שלוש צורות');
  {
    const c = setup({ refunds: [
      { status: 'submitted', amount: 100 }, { status: 'submitted', amount: 50 },
      { status: 'ready', amount: 70 }, { status: 'paid', amount: 1240 }] });
    const row = c.querySelector('.hm-mine .hm-row');
    ok('שתי ממתינות → כותרת ברבים',
       /2 בקשות החזר ממתינות/.test(row.textContent), row.textContent);
    ok('ותגית "בבדיקה" כתומה', !!row.querySelector('.badge--warn'));
    ok('והסכום ששולם בשורת הפירוט', /1,240/.test(row.textContent));
    ok('והלחיצה מובילה לבקשות', row.dataset.goto === 'resRequests');

    const one = setup({ refunds: [{ status: 'submitted', amount: 10 }] });
    ok('⚠️ אחת → לשון יחיד',
       /בקשת החזר אחת ממתינה/.test(one.querySelector('.hm-row').textContent));

    const none = setup({ refunds: [] });
    const r0 = none.querySelector('.hm-mine .hm-row');
    ok('אפס → "אין בקשות החזר פתוחות"', /אין בקשות החזר פתוחות/.test(r0.textContent));
    ok('⚠️ ובלי תגית סטטוס על כלום', !r0.querySelector('.badge'));
  }

  section('6. שורת הגינון — ו🔴 כשל אינו "אין"');
  {
    let c = setup({ gardenRes: { ok: true, rows: [
      { id: 7, title: 'גיזום' }, { id: 6, title: 'תאורה' },
      { id: 5, title: 'ישן', closure: 'בוצע' }] } });
    await wait(20);
    let row = c.querySelector('#hm-mygarden .hm-row');
    ok('שני פתוחים נספרים, הסגור לא',
       !!row && /2 דיווחים שלי בטיפול/.test(row.textContent), row ? row.textContent : 'אין שורה');
    ok('והכותרות שלהם בשורת הפירוט',
       /גיזום/.test(row.textContent) && /תאורה/.test(row.textContent));

    c = setup({ gardenRes: { ok: true, rows: [] } });
    await wait(20);
    row = c.querySelector('#hm-mygarden .hm-row');
    ok('אין דיווחים → הזמנה לדווח', !!row && row.dataset.goto === 'resGardenNew');

    c = setup({ gardenRes: { ok: true, rows: [{ id: 3, closure: 'בוצע' }] } });
    await wait(20);
    ok('הכול טופל → תגית "הושלם" ירוקה', !!c.querySelector('#hm-mygarden .badge--ok'));

    c = setup({ gardenRes: { ok: false, error: 'נפל' } });
    await wait(20);
    ok('🔴🔴 כשל → השורה נשארת ריקה, ולא מכריזה "לא דיווחת"',
       c.querySelector('#hm-mygarden').innerHTML === '',
       c.querySelector('#hm-mygarden').innerHTML.slice(0, 60));
  }

  section('7. שורת המכון — רק למי שבאמת מנוי');
  {
    let c = setup({ gymDoc: null });
    await wait(20);
    ok('אין מסמך → אין שורה', c.querySelector('#hm-mygym').innerHTML === '');

    c = setup({ gymDoc: { 'סטטוס': 'פעיל', 'בתוקף עד': '2026-12-31' } });
    await wait(20);
    const row = c.querySelector('#hm-mygym .hm-row');
    ok('מנוי פעיל → תגית ירוקה', !!row && !!row.querySelector('.badge--ok'));
    ok('ותאריך התפוגה בשורת הפירוט', /2026/.test(row.textContent), row.textContent);

    c = setup({ gymDoc: { 'סטטוס': 'פג תוקף' } });
    await wait(20);
    ok('פג תוקף → תגית danger', !!c.querySelector('#hm-mygym .badge--danger'));
  }

  section('8. 🔴🔴 שתי השורות החדשות אינן עולות קריאת Apps Script');
  {
    ok('הקוד שלהן קורא רק ל-getMyGardenReports / getGymStatusFast',
       /loadMyGarden[\s\S]*?CBA\.data\.getMyGardenReports/.test(HOME) &&
       /loadMyGym[\s\S]*?CBA\.data\.getGymStatusFast/.test(HOME));
    ok('⚠️ ו-home.js אינו קורא ל-sheets.get בכלל', HOME.indexOf('sheets.get') === -1);
    ok('🔴 ו-getMyGardenReports עובר ב-fsFirstRead("gardenReports")',
       /function myGardenReportsRead[\s\S]{0,300}fsFirstRead\("gardenReports"/.test(DS));
    ok('🔴 ו-getGymStatusFast קורא מסמך gymStatus',
       /function getGymStatusFast[\s\S]{0,700}readDoc\("gymStatus"/.test(DS));
    const c = setup({});
    await wait(30);
    ok('⚠️ ושתיהן יוצאות מיד, בלי לחכות לקריאה הקובעת',
       calls.indexOf('fs:myGardenReports') !== -1 &&
       (calls.indexOf('as:homeExtras') === -1 ||
        calls.indexOf('fs:myGardenReports') < calls.indexOf('as:homeExtras')), calls.join(','));
  }

  section('9. כל מחלקה שה-JS מייצר מעוצבת ב-home.css');
  {
    ['hm-cols', 'hm-cols--two', 'hm-main', 'hm-side', 'hm-mine', 'hm-slot',
     'hm-row', 'hm-row__ico', 'hm-row__txt', 'hm-row__c',
     'hm-vaad', 'hm-vaad__head', 'hm-vaad__ico', 'hm-vaad__t', 'hm-vaad__sub',
     'hm-actions', 'hm-actions__edge', 'hm-actions__row', 'hm-actions__dots',
     'hm-act', 'hm-act--cta'].forEach(cls => ok('.' + cls, CSS.indexOf('.' + cls) !== -1));
    ok('⚠️ והמחלקות שהוסרו אינן מוזכרות עוד ב-JS',
       HOME.indexOf('hm-stat') === -1 && HOME.indexOf('hm-next__') === -1);
    ok('🔴 והתגיות משתמשות ברכיב הכלל-מערכתי badge',
       /class="badge badge--/.test(HOME) && R('css/style.css').indexOf('.badge--warn') !== -1);
  }

  section('10. 🔴 שער הגרסה — שכחה שלו מגישה JS ישן');
  {
    const idx = R('index.html'), sw = R('service-worker.js');
    const vs = Array.from(new Set(idx.match(/\?v=[0-9a-z]+/g) || []));
    ok('מספר גרסה אחד בלבד ב-index.html', vs.length === 1, vs.join(','));
    const v = (vs[0] || '').replace('?v=', '');
    const m = sw.match(/VERSION = "([0-9a-z]+)"/);
    ok('🔴🔴 ו-service-worker.js על אותו ערך בדיוק', !!m && m[1] === v,
       (m ? m[1] : '?') + ' ≠ ' + v);
    ok('ו-home.css ו-home.js נטענים עם הגרסה',
       idx.indexOf('css/home.css?v=' + v) !== -1 && idx.indexOf('js/screens/home.js?v=' + v) !== -1);
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
