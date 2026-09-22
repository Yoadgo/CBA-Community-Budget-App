/* גיליון תחתון אחד משותף — ממצאים 23 · 24 · 27 · 29   (2026-09-22, גל 3)
   הרצה:  node tools/test-sheet-component.js

   🔴 מה שהתברר, וזה שינה את התיקון:
     · **23 ו-27 הם אותו באג.** הדיאלוג מתחיל ב-`opacity:0` ונחשף רק
       כשנוספת `is-open`. בלשונית שאינה גלויה `requestAnimationFrame`
       אינו רץ, ולכן הוא נשאר **בלתי נראה אבל חוסם** — המשתמש לא רואה
       שנפתח משהו, לוחץ שוב, ונפתח עותק שני. "שני המודאלים הכפולים"
       שנמדדו הם התסמין; ה-rAF הוא המחלה.
     · **שמונה גיליונות מגולפים ביד** חלקו אותן שש שורות בדיוק, ובאף
       אחד מהם לא היו Esc, מלכודת מיקוד, נעילת גלילה או שומר כפילות —
       בזמן ש-`CBA.ui.dialog` מחזיק את כולם מאז 19.8.
   🔑 **הבדיקה שהכי שווה כאן היא ייחודיות המפתחות**: שני גיליונות עם
      אותו מפתח = השני פשוט לא נפתח, בשקט ובלי שגיאה. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const DLG = R('js/ui/dialog.js');
const GT = R('js/screens/gardenTasks.js');
const GP = R('js/screens/gardenPlan.js');
const RG = R('js/screens/resGarden.js');
const REP = R('js/ui/report.js');
const APP = R('js/app.js');
const PWA = R('js/pwa.js');
const CSS_G = R('css/garden.css');
const GF = R('js/ui/gardenForm.js');
const CSS_R = R('css/report.css');
const HTML = R('index.html');
const SW = R('service-worker.js');

section('1. 🔴🔴 ממצא 27 — אף מצב פתיחה אינו תלוי בפריים אנימציה');
const allJs = ['js/ui/dialog.js','js/screens/gardenTasks.js','js/screens/gardenPlan.js',
               'js/app.js','js/pwa.js'].map(R).join('\n');
ok('אין יותר rAF שמוסיף is-open בשום קובץ',
   !/requestAnimationFrame\(function \(\) \{ wrap\.classList\.add\("is-open"\)/.test(allJs));
ok('openNow קיים ומאלץ חישוב סגנון', /function openNow\(el\) \{\s*void el\.offsetWidth;\s*el\.classList\.add\("is-open"\);/.test(DLG), 'לא נמצא');
ok('הדיאלוג עצמו משתמש בו', /openNow\(wrap\);/.test(DLG));
ok('תפריט הניווט תוקן', /void wrap\.offsetWidth;\n    wrap\.classList\.add\("is-open"\);/.test(APP));
ok('גיליון ההתקנה תוקן', /void wrap\.offsetWidth;\n    wrap\.classList\.add\("is-open"\);/.test(PWA));

section('2. 🔴 הרכיב המשותף — מה שהיה חסר בכל שמונת הגיליונות');
const ms = (DLG.match(/function mountSheet\(wrap, opts\)[\s\S]*?\n  \}/) || [''])[0];
ok('mountSheet קיים', !!ms);
ok('🔴 ממצא 24 — Escape סוגר', /e\.key === "Escape"/.test(ms), ms.slice(0, 200));
ok('🔴 ממצא 23 — שומר כפילות לפי מפתח', /if \(key && openSheets\[key\]\)/.test(ms), ms);
ok('⚠️ והעוטף הכפול מוסר במקום להישאר יתום ב-DOM',
   /if \(wrap\.parentNode\) wrap\.parentNode\.removeChild\(wrap\);\n      return openSheets\[key\];/.test(ms), ms);
ok('מלכודת מיקוד', /e\.key === "Tab"/.test(ms) && /shiftKey/.test(ms), ms);
ok('נעילת גלילה של הרקע', /classList\.add\("has-cba-dlg"\)/.test(ms), ms);
ok('המיקוד מוחזר בסגירה', /prevFocus && prevFocus\.focus/.test(ms), ms);
ok('aria-modal נוסף', /setAttribute\("aria-modal", "true"\)/.test(ms), ms);
ok('סגירה כפולה אינה עושה נזק', /var done = false;/.test(ms) && /if \(done\) return;/.test(ms), ms);
ok('⚠️ sticky מגן מפני Escape בלבד — הרקע ממשיך לסגור כמו תמיד',
   /if \(opts\.sticky\) return;/.test(ms) && /if \(bd\) bd\.addEventListener\("click", close\);/.test(ms), ms);
ok('mountSheet ו-sheet מיוצאים', /sheet: sheet, mountSheet: mountSheet,/.test(DLG));

section('3. 🔴 שמונת האתרים — כולם עברו, ואף אחד לא נשאר מאחור');
const sites = [...GT.matchAll(/CBA\.ui\.mountSheet\(wrap, \{ key: ([^}]+)\}\)/g)].map(m => m[1].trim());
const sitesGP = [...GP.matchAll(/CBA\.ui\.mountSheet\(wrap, \{ key: ([^}]+)\}\)/g)].map(m => m[1].trim());
const sitesGF = [...GF.matchAll(/CBA\.ui\.mountSheet\(wrap, \{ key: ([^}]+)\}\)/g)].map(m => m[1].trim());
/* ⚠️ **המספר ירד מ-7 ל-6 ב-22.9, ולא בטעות.** "משימה חדשה" ו"הוספה
   לתוכנית" היו שני טפסים לאותו דבר והתאחדו ל-js/ui/gardenForm.js —
   ולכן `gt-new` ו-`gp-form` נעלמו, ובמקומם `gf-form` אחד במודול
   המשותף. פחות אתרי mountSheet זה בדיוק הכיוון הנכון. */
ok('שישה גיליונות ב-gardenTasks', sites.length === 6, sites.join(' | '));
ok('ותוכנית העבודה כבר לא בונה טופס משלה', sitesGP.length === 0, sitesGP.join(' | '));
ok('🔴 הטופס המאוחד הוא אתר mountSheet אחד', sitesGF.length === 1, sitesGF.join(' | '));
ok('⚠️ ושני המסכים קוראים לאותו רכיב',
   /CBA\.gardenForm\.open\(\{/.test(GT) && /CBA\.gardenForm\.open\(\{/.test(GP));
ok('לא נשאר אף בונה ידני (gt-sheet-bd עם מאזין מחוץ לרכיב)',
   !/gt-sheet-bd"\)\.addEventListener/.test(GT) && !/gt-sheet-bd"\)\.addEventListener/.test(GP));
/* 🔑 הבדיקה החשובה — מפתח כפול = גיליון שלא נפתח, בשקט. */
const keys = sites.concat(sitesGP, sitesGF).map(x => (x.match(/"([^"]+)"/) || [, x])[1]);
ok('🔴🔴 כל המפתחות ייחודיים', new Set(keys).size === keys.length, keys.join(', '));
ok('⚠️ ושני הגיליונות של אותה משימה אינם חולקים מפתח',
   keys.indexOf('gt-menu') !== -1 && keys.indexOf('gt-details') !== -1, keys.join(', '));
ok('ה-helper גוזר מפתח מהתווית שלו', /key: "gt-sheet:" \+ label/.test(GT));

section('4. sticky — רק היכן שיש טקסט שהוקלד');
ok('sticky על gt-closure', /key: "gt-closure", sticky: true/.test(GT), 'חסר');
ok('sticky על הטופס המאוחד — יש בו טקסט שהוקלד', /key: "gf-form", sticky: true/.test(GF));
ok('⚠️ ו**לא** על גיליונות שאין בהם קלט', !/key: "gt-menu", sticky/.test(GT) &&
   !/key: "gt-map", sticky/.test(GT) && !/key: "gt-week", sticky/.test(GT));

section('5. 🔴 ממצא 29 — ה-✕ הוא כפתור אמיתי');
ok('אין יותר תגית <x> בשום קובץ', !/<x aria-hidden/.test(RG + REP));
ok('ובמקומה button עם aria-label',
   (RG + REP).split('class="th-x" aria-label="הסרת התמונה"').length - 1 === 3, 'צפויות 3 הופעות');
ok('type="button" — אחרת הוא שולח את הטופס',
   !/<button class="th-x"/.test(RG + REP) && /<button type="button" class="th-x"/.test(RG));
ok('הסלקטורים עודכנו יחד איתו', !/querySelector\("x"\)/.test(RG + REP));
ok('CSS של הגינון מכוון למחלקה', /\.gd-th \.th-x \{/.test(CSS_G) && !/\.gd-th x \{/.test(CSS_G));
ok('CSS של הדיווח מכוון למחלקה', /\.rep-th \.th-x \{/.test(CSS_R) && !/\.rep-th x \{/.test(CSS_R));
ok('⚠️ ואיפוס הכפתור נוסף — אחרת המראה משתנה',
   /\.gd-th \.th-x \{[\s\S]*?border: 0; padding: 0; font: inherit;/.test(CSS_G), 'חסר');

section('6. 🔴 ממצא 23 — גם הדיאלוג עצמו אינו נפתח פעמיים');
ok('שומר חתימה בדיאלוג', /if \(openDlgs\[sig\]\) return openDlgs\[sig\];/.test(DLG));
ok('והחתימה משתחררת בסגירה', /delete openDlgs\[sig\];/.test(DLG));
ok('⚠️ והיא כוללת גם טופס — שני טפסים שונים אינם נחסמים זה בגלל זה',
   /opts\.html \? "h" : ""/.test(DLG));

section('7. התנהגות אמיתית ב-DOM (jsdom) — לא רק regex');
try {
  const { JSDOM } = require('jsdom');
  /* ⚠️ runScripts: "outside-only" — בלעדיו window.eval אינו ה-eval של
     הדף, ו-dialog.js נופל מיד על `window is not defined`. אותה הגדרה
     בדיוק כמו בשאר מארזי ה-jsdom כאן. */
  const dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.eval(DLG);
  const mk = () => {
    const el = w.document.createElement('div');
    el.className = 'gt-sheet-wrap';
    el.innerHTML = '<div class="gt-sheet-bd"></div>' +
      '<div class="gt-sheet" role="dialog" aria-label="בדיקה"><button>כפתור</button></div>';
    return el;
  };
  const esc = () => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  const w1 = mk();
  const c1 = w.CBA.ui.mountSheet(w1, { key: 'k1' });
  ok('🔴🔴 is-open נוסף **מיד**, בלי להמתין לפריים', w1.classList.contains('is-open'));
  ok('העוטף נכנס ל-DOM', !!w1.parentNode);
  ok('גלילת הרקע ננעלה', w.document.body.classList.contains('has-cba-dlg'));
  ok('aria-modal הוגדר', w1.querySelector('[role="dialog"]').getAttribute('aria-modal') === 'true');

  const w2 = mk();
  const c2 = w.CBA.ui.mountSheet(w2, { key: 'k1' });
  ok('🔴 מפתח זהה — הגיליון השני אינו נפתח', !w2.parentNode);
  ok('והקורא מקבל את הסגירה של הראשון', c2 === c1);

  esc();
  ok('🔴 Escape סוגר', !w1.classList.contains('is-open'));

  const w3 = mk();
  w.CBA.ui.mountSheet(w3, { key: 'k2', sticky: true });
  esc();
  ok('⚠️ ו-sticky שורד את Escape', w3.classList.contains('is-open'));

  const built = w.CBA.ui.sheet({ label: 'בנוי', key: 'k3', html: '<h4>שלום</h4>' });
  ok('sheet() בונה עוטף תקין',
     built.wrap.classList.contains('gt-sheet-wrap') &&
     !!built.wrap.querySelector('.gt-sheet-bd') && !!built.wrap.querySelector('.gt-grip'));
  ok('ומסמן aria-label', built.wrap.querySelector('[role="dialog"]').getAttribute('aria-label') === 'בנוי');
  built.close();
} catch (e) {
  ok('jsdom רץ', false, e && e.message);
}

section('8. גרסה');
const swV = (SW.match(/var VERSION = "([^"]+)"/) || [, ''])[1];
const htmlV = [...new Set((HTML.match(/\?v=[0-9a-z]+/g) || []).map(x => x.slice(3)))];
ok('index.html מחזיק ערך אחד', htmlV.length === 1, htmlV.join(','));
ok('🔴 והוא זהה ל-service-worker', htmlV[0] === swV, htmlV[0] + ' מול ' + swV);

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
