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

   🔴 גל 2 (30.9.26) — הבית נבנה מחדש (ספר האבנים, פרק 1) ו"תפקיד ועד" עבר
   למסך "לוח ניהול" (CBA.screens.adminBoard). ארבעת הדברים למעלה נשמרים —
   רק בכתובת החדשה: המזהים (#hm-tasks…) בלוח הניהול, #hm-next במיני-כרטיס.
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
const CSS  = R('css/home2.css');   /* גל 2 (30.9.26) — הבית החדש */
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
    wireDataRetry: () => {},
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
  window.CBA.screens[o.screen || 'resHome'].render(c);
  return c;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

(async function () {

  section('1. 🔴🔴 המזהים ששאר המנגנון בוחר לפיהם — שרדו (בלוח הניהול)');
  {
    const c = setup({ screen: 'adminBoard', isSuper: true, alerts: { pendingExpenses: 4 } });
    ['#hm-tasks', '#hm-clear', '#hm-signups', '#hm-profile', '#hm-gym', '#hm-garden']
      .forEach(id => ok('קיים ' + id, !!c.querySelector(id)));
    ok('🔴 והשלדים עדיין נושאים hm-lazy (התנאי של syncClearState)',
       c.querySelectorAll('#hm-tasks .hm-lazy').length === 4,
       String(c.querySelectorAll('#hm-tasks .hm-lazy').length));
    ok('ושורת ההוצאות נולדה כ-hm-task כמו קודם',
       !!c.querySelector('#hm-tasks .hm-task[data-admin-goto="expenses-pending"]'));
    ok('🔴 "לוח ניהול" רשום כמסך ניהול וכטאב ראשון',
       /\["adminBoard", "לוח ניהול"\],\s*\{ group: "taktziv"/.test(APP) && /adminBoard: "ANY"/.test(APP));
  }

  section('2. הבית — חופה, בנטו, שתי רשימות; בלי "תפקיד ועד"');
  {
    const c = setup({ isSuper: true });
    const html = c.innerHTML;
    ok('החופה לפני הבנטו', html.indexOf('id="hm-cnp"') !== -1 && html.indexOf('id="hm-cnp"') < html.indexOf('id="hm-bento"'));
    ok('והבנטו לפני הרשימות', html.indexOf('id="hm-bento"') < html.indexOf('id="hm-happened"'));
    ok('"מה קרה" ו"דברים לעשות"', !!c.querySelector('#hm-happened') && !!c.querySelector('#hm-todo'));
    ok('🔴 אין יותר משטח ועד בבית', !c.querySelector('#hm-tasks') && !c.querySelector('.hm-vaad'));
    ok('🔴 ובמקומו מיני-כרטיס אחד שמוביל ללוח הניהול (A9)',
       !!c.querySelector('#hm-mini-adm[data-admin-goto="adminBoard"]'));
    ok('#hm-next (השריון הקרוב) שרד — כמיני-כרטיס', !!c.querySelector('#hm-next.hm2-mini'));
    ok('המספר הגדול "מה מחכה לי" (A1)', !!c.querySelector('#hm-n') && !!c.querySelector('#hm-s'));
  }

  section('3. תושב בלי הרשאות — בלי שום רמז לניהול');
  {
    const c = setup({});
    ok('אין מיני "ממתין לטיפולך"', !c.querySelector('#hm-mini-adm'));
    ok('וגם אין #hm-tasks', !c.querySelector('#hm-tasks'));
    ok('הבנטו קיים', !!c.querySelector('#hm-bento'));
  }

  section('4. הגלולות ירדו — "+" במקומן (H8)');
  {
    const c = setup({});
    ok('אין .hm-act בבית', !c.querySelector('.hm-act'));
    const PLUS = R('js/ui/plus.js');
    ok('ושלוש פעולות היצירה ב-"+"', ['resSubmit', 'resGardenNew', 'resReserve'].every(g => PLUS.indexOf('"' + g + '"') !== -1));
  }

  section('5. אריח ההחזרים — רק כשיש (H10), ו🔴 לעולם לא "₪0"');
  {
    let c = setup({ refunds: [
      { status: 'submitted', amount: 100 }, { status: 'ready', amount: 70 }, { status: 'paid', amount: 1240 }] });
    let t = c.querySelector('#hm-refunds');
    ok('ממתין + מאושר → אריח', !!t);
    ok('המספר הגדול = הסכום שאושר', /70/.test(t.querySelector('.hm2-tile__n').textContent), t.textContent);
    ok('ו"1 בבדיקה" בשורה', /1 בבדיקה/.test(t.textContent));
    ok('⚠️ "שולמו השנה" לא כאן (עבר למסך הבקשות)', !/1,240/.test(t.textContent));
    ok('והלחיצה מובילה לבקשות', t.dataset.goto === 'resRequests');
    c = setup({ refunds: [{ status: 'paid', amount: 5 }] });
    ok('אין ממתין/מאושר → אין אריח בכלל', !c.querySelector('#hm-refunds'));
    c = setup({ connected: false, refunds: [] });
    t = c.querySelector('#hm-refunds');
    ok('🔴 גיליון לא מחובר → אריח שגיאה עם "נסה שוב" (H16)', !!t && !!t.querySelector('[data-data-retry]') && !/₪0/.test(t.textContent));
  }

  section('6. אריח הדיווחים — שלושה מצבים, ו🔴 כשל אינו "אין"');
  {
    let c = setup({ gardenRes: { ok: true, rows: [
      { id: 7, title: 'גיזום' }, { id: 6, title: 'תאורה' }, { id: 5, title: 'ישן', closure: 'בוצע' }] } });
    await wait(20);
    let t = c.querySelector('#hm-mygarden');
    ok('שני פתוחים נספרים, הסגור לא', /2/.test(t.querySelector('.hm2-tile__n').textContent) && /בטיפול/.test(t.textContent), t.textContent);
    ok('והכותרות שלהם בשורה', /גיזום/.test(t.textContent) && /תאורה/.test(t.textContent));
    ok('וירוק מלא כשיש בטיפול', t.classList.contains('hm2-tile--gar'));
    c = setup({ gardenRes: { ok: true, rows: [] } });
    await wait(20);
    ok('אין דיווחים → הזמנה לדווח', c.querySelector('#hm-mygarden').dataset.goto === 'resGardenNew');
    c = setup({ gardenRes: { ok: true, rows: [{ id: 3, closure: 'בוצע' }] } });
    await wait(20);
    ok('הכול טופל', /טופלו/.test(c.querySelector('#hm-mygarden').textContent));
    c = setup({ gardenRes: { ok: false, error: 'נפל' } });
    await wait(20);
    ok('🔴🔴 כשל → לא מכריז "עוד לא דיווחת"', !/עוד לא דיווחת/.test(c.querySelector('#hm-mygarden').textContent) &&
       c.querySelector('#hm-mygarden').dataset.goto !== 'resGardenNew');
  }

  section('7. אריח המכון — רק למי שבאמת מנוי (H13)');
  {
    let c = setup({ gymDoc: null });
    await wait(20);
    ok('אין מסמך → אין אריח', c.querySelector('#hm-mygym').hidden === true);
    c = setup({ gymDoc: { 'סטטוס': 'פעיל', 'בתוקף עד': '2099-12-31' } });
    await wait(20);
    const t = c.querySelector('#hm-mygym');
    ok('מנוי פעיל → אריח עם ימים', !t.hidden && /ימים/.test(t.textContent), t.textContent);
    ok('ותאריך התפוגה', /2099/.test(t.textContent));
    c = setup({ gymDoc: { 'סטטוס': 'פג תוקף' } });
    await wait(20);
    ok('פג תוקף → אריח + שורה ב"דברים לעשות"', /פג/.test(c.querySelector('#hm-mygym').textContent) &&
       !!c.querySelector('#hm-todo [data-goto="resGym"]'));
  }

  section('8. 🔴🔴 האריחים החדשים אינם עולים קריאת Apps Script');
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

  section('9. כל מחלקה שה-JS מייצר מעוצבת ב-home2.css');
  {
    ['hm2-cnp', 'hm2-hero', 'hm2-n', 'hm2-s', 'hm2-mini', 'hm2-mini--go', 'hm2-mini--adm', 'hm2-bento', 'hm2-tile',
     'hm2-tile__h', 'hm2-tile__n', 'hm2-tile__s', 'hm2-tile--gar', 'hm2-tile--err', 'hm2-strip', 'hm2-sd',
     'hm2-grid2', 'hm2-card', 'hm2-row', 'hm2-todo', 'hm2-btn', 'hm2-done', 'hm2-disc', 'hm2-face', 'hm2-faces',
     'hm2-board', 'hm2-bgrid'].forEach(cls => ok('.' + cls, CSS.indexOf('.' + cls) !== -1));
    ok('⚠️ והמחלקות הישנות אינן נוצרות עוד', HOME.indexOf('hm-actions') === -1 && HOME.indexOf('hm-quiet') === -1);
    ok('🔴 והתגיות משתמשות ברכיב הכלל-מערכתי badge',
       /class="badge badge--/.test(HOME) && R('css/style.css').indexOf('.badge--info') !== -1);
  }

  section('10. 🔴 שער הגרסה — שכחה שלו מגישה JS ישן');
  {
    /* (3.10.2026) גרסה לכל קובץ: אין יותר "מספר אחד לכולם". השער עכשיו הוא
       tools/stamp-versions.js --check — כל ?v= ב-index.html חייב להיות
       טביעת האצבע של הקובץ, ו-service-worker.js חייב לשאת את אותה רשימה. */
    const stamp = require('./stamp-versions.js');
    const problems = stamp.check();
    ok('🔴🔴 כל ה-?v= ב-index.html ו-service-worker.js מעודכנים (node tools/stamp-versions.js)',
       problems.length === 0, problems.slice(0, 3).join(' | '));
    const c = stamp.compute();
    const idx = R('index.html');
    ok('ו-home2.css ו-home.js נטענים עם טביעת האצבע שלהם',
       idx.indexOf('css/home2.css?v=' + c.versions['css/home2.css']) !== -1 &&
       idx.indexOf('js/screens/home.js?v=' + c.versions['js/screens/home.js']) !== -1);
  }

  console.log('\n====================================================');
  console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
  process.exit(fail ? 1 : 0);
})();
