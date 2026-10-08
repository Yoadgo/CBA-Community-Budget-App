/* חלון משלו לכל מסך (8.10.2026) — "נגיעה במסך מקפיצה ללוח האירועים".
   הרצה:  node tools/test-screen-root-2026-10-08.js

   עד היום כל המסכים קיבלו את אותו #app-main, ולכן ציור מאוחר (נתונים שחזרו
   אחרי 2-10 שניות) צויר מעל המסך שהמשתמש עבר אליו. עכשיו כל מסך מקבל
   <div class="scr"> קבוע משלו (mountScreenRoot ב-app.js).

   🔴 מה המארז שומר עליו:
     1. render מקבל את חלון המסך — לא את #app-main.
     2. החלון קבוע לכל שם מסך (רענון/חזרה מחברים את אותו חלון).
     3. אף מסך לא מצייר ישירות ל-getElementById("app-main") (עוקף את החלון).
     4. CSS שנשען על "ילד ישיר של #app-main" עודכן לשכבה החדשה.
     5. התנהגות: ציור מאוחר לחלון של מסך שעזבנו אינו נראה. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const APP = R('js/app.js');
const LCSS = R('css/loading.css');

console.log('\n1. app.js');
ok('render מקבל את חלון המסך', /screen\.render\(root, opts\)/.test(APP) && !/screen\.render\(main, opts\)/.test(APP));
ok('שתי הקריאות ל-renderScreenFlagged מעבירות את שם המסך',
   (APP.match(/[^n] renderScreenFlagged\(screen, opts, \w+, (name|want)\);/g) || []).length === 2);
ok('החלון קבוע לכל שם מסך (מטמון screenRoots)', /var screenRoots = Object\.create\(null\)/.test(APP) && /screenRoots\[name\] = r;/.test(APP));
ok('CBA.screenRoot קיים לקוד שצריך את חלון המסך הנוכחי', /CBA\.screenRoot = function/.test(APP));

console.log('\n2. מסכים');
const dir = path.join(__dirname, '..', 'js', 'screens');
const offenders = fs.readdirSync(dir).filter(f => f.endsWith('.js')).filter(f => {
  const s = fs.readFileSync(path.join(dir, f), 'utf8');
  /* getElementById("app-main") מותר רק לבדיקת contains (planning) או כגיבוי ל-screenRoot */
  return (s.match(/getElementById\("app-main"\)/g) || []).length >
         (s.match(/main\.contains\(|CBA\.screenRoot\(\)\) \|\| document\.getElementById\("app-main"\)/g) || []).length;
});
ok('אף מסך לא מצייר ישירות ל-#app-main', offenders.length === 0, offenders.join(', '));

console.log('\n3. CSS');
ok('boot-reveal עודכן לשכבה החדשה', /#app-main > \.scr > \* > \*/.test(LCSS) && !/#app-main > \* > \*/.test(LCSS));

console.log('\n4. התנהגות (מודל מוקטן של showScreen)');
{
  /* DOM מינימלי — מספיק ל-appendChild/innerHTML/parentNode/isConnected */
  function El(tag) { this.tag = tag; this.children = []; this.parentNode = null; this.attrs = {}; this.dataset = {}; this._html = ''; }
  Object.defineProperty(El.prototype, 'isConnected', { get() { let n = this; while (n.parentNode) n = n.parentNode; return n === docRoot; } });
  Object.defineProperty(El.prototype, 'childNodes', { get() { return this.children; } });
  Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html + this.children.map(c => c.innerHTML).join(''); },
    set(v) { this.children.forEach(c => c.parentNode = null); this.children = []; this._html = v; }
  });
  El.prototype.appendChild = function (c) { c.parentNode = this; this.children.push(c); return c; };
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = v; };
  const docRoot = new El('html');
  const main = docRoot.appendChild(new El('main'));
  const document = { createElement: t => new El(t) };
  const src = APP.slice(APP.indexOf('var screenRoots = Object.create(null);'), APP.indexOf('CBA.screenRoot = function'));
  const mount = new Function('main', 'document', src + '; return mountScreenRoot;')(main, document);

  const a1 = mount('events'); a1._html = 'EVENTS';
  main.innerHTML = '';                      // showScreen: יציאה מהמסך
  const b = mount('resMe'); b._html = 'PROFILE';
  a1._html = 'LATE EVENTS';                 // ציור מאוחר של הלוח
  ok('ציור מאוחר לחלון של מסך שעזבנו אינו נראה', main.innerHTML === 'PROFILE' && !a1.isConnected);
  ok('isConnected אומר עכשיו "המשתמש עדיין כאן"', b.isConnected && !a1.isConnected);
  main.innerHTML = '';
  const a2 = mount('events');
  ok('חזרה למסך מחברת את אותו חלון (טעינה מביקור קודם נוחתת נכון)', a2 === a1 && a2.isConnected);
  ok('...ומנקה אותו לפני הציור', main.innerHTML === '');
  const a3 = mount('events');
  ok('רענון שקט של אותו מסך — אותו חלון', a3 === a1 && main.children.length === 1);
}

console.log('\n' + (fail ? '✗' : '✓') + ' ' + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
