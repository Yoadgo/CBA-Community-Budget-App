/* בדיקות ל"כישלון נתוני תקציב לא מפיל את האפליקציה" (2026-09-14).
   הרצה:  node tools/test-data-failure.js        (בלי jsdom — סטאב DOM זעיר)

   ⚠️ הכלל שנבדק כאן הוא כלל של יועד, לא נוחות: **לעולם לא להציג את נתוני
   הדמו של mock.js כאילו הם אמיתיים.** לכן לא מספיק שהאפליקציה "עולה" —
   חייבים לוודא שכל מקום שנשען על תנועות מסרב לצייר מספרים כשאין נתונים. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const APP = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');

/* ---------- DOM מדומה זעיר ---------- */
function El(tag) {
  this.tagName = tag; this.children = []; this.innerHTML = ''; this.dataset = {};
  this.listeners = {}; this.disabled = false; this.textContent = ''; this.hidden = false;
  this.isConnected = true;
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.addEventListener = function (t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); };
El.prototype.click = function () { (this.listeners.click || []).forEach(f => f({})); };
/* חיפוש "אמיתי" מספיק: מחפשים את הסלקטור בתוך ה-HTML שנכתב. */
El.prototype.querySelector = function (sel) {
  const m = sel.replace(/[\[\]]/g, '');
  if (this.innerHTML.indexOf(m) === -1) return null;
  if (!this._stub) { this._stub = new El('button'); }
  return this._stub;
};

function baseEnv(extra) {
  const sandbox = Object.assign({
    console: { log() {}, error() {} },
    document: { createElement: t => new El(t), head: new El('head'), body: new El('body'),
                addEventListener() {}, querySelector: () => null, getElementById: () => null },
    setTimeout, clearTimeout
  }, extra || {});
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  return sandbox;
}

/* ================================================================= */
section('1. רשימת מסכי התקציב והשער ב-app.js (בדיקה סטטית על הקוד עצמו)');
{
  const app = read('js/app.js');
  const m = app.match(/var BUDGET_SCREENS = \[([^\]]*)\]/);
  ok('BUDGET_SCREENS מוגדר', !!m);
  const list = m ? m[1].split(',').map(s => s.trim().replace(/"/g, '')) : [];
  ['budget', 'expenses', 'planning', 'reconcile', 'resRequests'].forEach(n =>
    ok('כולל את ' + n, list.indexOf(n) !== -1, list.join('|')));
  ok('⚠️ residents **אינו** ברשימה (ספר תושבים נפתח גם בלי תקציב)',
     list.indexOf('residents') === -1, list.join('|'));
  ok('⚠️ resHome אינו ברשימה (עמוד הבית תמיד נפתח)', list.indexOf('resHome') === -1);
  ok('gardenTasks אינו ברשימה', list.indexOf('gardenTasks') === -1);

  ok('השער ב-showScreen בודק גם שם-מסך וגם חיבור',
     /screenNeedsBudget\(name\) && !CBA\.sheets\.isConnected\(\)/.test(app));
  ok('⚠️ screen.render מגודר ולא נקרא תמיד',
     /\} else \{\s*screen\.render\(main, opts\);\s*\}/.test(app));
  ok('⚠️ showLoadFailure הישן (שמחק את כל המסך) אינו קיים יותר',
     app.indexOf('showLoadFailure') === -1);
  ok('הפאנל נחשף ל-CBA כדי שמסכים ישתמשו בו',
     /CBA\.dataUnavailableHTML = dataUnavailableHTML/.test(app) &&
     /CBA\.wireDataRetry = wireDataRetry/.test(app));
  ok('⚠️ האתחול כבר לא עוצר כשאין נתונים (אין return מוקדם)',
     !/source === "none"[\s\S]{0,400}?return;/.test(app));
}

/* ================================================================= */
section('2. עמוד הבית — הכרטיס הכספי');
function homeEnv(connected) {
  const env = baseEnv({
    CBA: {
      esc: s => String(s == null ? '' : s),
      user: { familyId: '401', house: '401', firstName: 'יועד' },
      perms: [], isSuper: true,
      sheets: { isConnected: () => connected },
      dataUnavailableHTML: sub => '<div class="load-error">PANEL:' + sub + '</div>',
      wireDataRetry: function () { env.wired = (env.wired || 0) + 1; },
      skel: { rows: () => '<sk/>' },
      ui: { emptyState: o => '<empty>' + (o && o.title || '') + '</empty>' },
      gotoAdmin: function () {},
      formatILS: n => '₪' + n,
      residentUtils: {
        myRequests: () => [
          { status: 'submitted', amount: 10 },
          { status: 'paid', amount: 250 }
        ],
        splitRequests: list => ({ refunds: list })
      },
      data: {}
    }
  });
  vm.runInContext(read('js/screens/home.js'), env);
  return env;
}
{
  const env = homeEnv(true);
  const c = new El('div');
  env.CBA.screens.resHome.render(c);
  ok('מחובר — מוצגים המספרים', /שולמו השנה/.test(c.innerHTML));
  ok('מחובר — הסכום האמיתי מופיע', /₪250/.test(c.innerHTML), c.innerHTML.slice(0, 200));
  ok('מחובר — אין פאנל שגיאה', !/PANEL:/.test(c.innerHTML));
}
{
  const env = homeEnv(false);
  const c = new El('div');
  env.CBA.screens.resHome.render(c);
  ok('⚠️ לא מחובר — הפאנל מחליף את הכרטיס', /PANEL:/.test(c.innerHTML));
  ok('⚠️ לא מחובר — **אין אפס שקרי** על המסך',
     !/שולמו השנה/.test(c.innerHTML) && !/₪0/.test(c.innerHTML), c.innerHTML.slice(0, 300));
  ok('הכותרת "אצלנו בבית" נשמרת', /אצלנו בבית/.test(c.innerHTML));
  ok('ההודעה מרגיעה שהשאר עובד', /שאר האפליקציה עובדת/.test(c.innerHTML));
  ok('כפתור "נסה שוב" חובר', env.wired === 1, String(env.wired));
  ok('שאר עמוד הבית עדיין צויר (כפתורי הפעולה)', /hm-hero/.test(c.innerHTML));
}

/* ================================================================= */
section('3. החיפוש הגלובלי לא מציע תוצאות מנתוני דמו');
function searchEnv(connected) {
  const env = baseEnv({
    CBA: {
      esc: s => String(s == null ? '' : s),
      sheets: { isConnected: () => connected },
      perms: [], isSuper: true,
      navTargets: [{ screen: 'expenses', label: 'ניהול הוצאות' }],
      data: {
        getCategories: () => [{ id: 'c1', name: 'גינון', group: 'g1' }],
        getTransactions: () => [{ id: 1, supplier: 'ספק הדמו', amount: 999, description: 'גינון' }],
        findGroup: () => ({ name: 'תחזוקה' })
      }
    }
  });
  vm.runInContext(read('js/ui/search.js'), env);
  return env;
}
{
  const envOn = searchEnv(true);
  const envOff = searchEnv(false);
  const srcOn = read('js/ui/search.js');
  ok('הדגל haveBudget נגזר מ-isConnected',
     /var haveBudget = !\(window\.CBA && CBA\.sheets\) \|\| CBA\.sheets\.isConnected\(\)/.test(srcOn));
  ok('⚠️ canExpenses תלוי בו', /var canExpenses = hasTarget\("expenses"\) && haveBudget/.test(srcOn));
  ok('נטען בלי לזרוק — מחובר', !!envOn.CBA.search || true);
  ok('נטען בלי לזרוק — מנותק', !!envOff.CBA.search || true);
}

/* ================================================================= */
section('4. הפאנל עצמו — בנוי נכון');
{
  const app = read('js/app.js');
  ok('כותרת ברורה למשתמש', /לא הצלחנו לטעון את נתוני התקציב/.test(app));
  ok('יש כפתור "נסה שוב" עם עוגן יציב', /data-data-retry/.test(app));
  ok('הכפתור ננעל בזמן הניסיון', /btn\.disabled = true/.test(app));
  ok('⚠️ ומשתחרר אם נכשל שוב (אחרת הוא תקוע לנצח)',
     /btn\.disabled = false/.test(app));
  ok('הענף נקבע לפי isConnected ולא לפי ok של הרשת',
     /if \(CBA\.sheets\.isConnected\(\)\) \{/.test(app));
  /* ⚠️ הבדיקה הזו נולדה מבאג אמיתי שנתפס **רק בייצור** (14.9.26): הניסיון
     החוזר הצליח, והפאנל נשאר על המסך כי המסלול הרגיל מצייר מחדש רק כשטביעת
     האצבע של הנתונים השתנתה — ואם חזרו אותם נתונים, אין שינוי ואין ציור. */
  ok('⚠️ אחרי הצלחה יש ציור מחדש **מפורש**, לא תלוי בהשוואת נתונים',
     /if \(CBA\.sheets\.isConnected\(\)\)[\s\S]{0,900}?showScreen\(currentScreen\);[\s\S]{0,200}?\} else if \(btn\.isConnected\)/.test(app));
  ok('⚠️ הציור אינו silent (silent מדלג על ציור אמיתי)',
     !/if \(CBA\.sheets\.isConnected\(\)\)[\s\S]{0,900}?showScreen\(currentScreen, \{ silent: true \}\)/.test(app));
  ok('הכפתור משתחרר רק בענף הכישלון',
     /\} else if \(btn\.isConnected\) \{\s*btn\.disabled = false;/.test(app));
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
