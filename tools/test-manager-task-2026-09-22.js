/* משימת מנהל "כמו דיווח דייר" + מתג משימה חוזרת   (2026-09-22)
   הרצה:  node tools/test-manager-task-2026-09-22.js

   🔑 **הטענה המרכזית שהמארז הזה שומר עליה: `repId` ולא `kind`.**
     המערכת מבחינה בין "איך המשימה נראית ומטופלת" (`kind`) לבין "האם יש
     תושב שמחכה לתשובה" (`repId`). מרגע שהמנהל יכול לפתוח תקלה בעצמו,
     משימה יכולה להיות `GK_REPORT` **בלי** תושב — וכל מקום שעדיין שואל
     `kind` כדי להחליט אם לפנות לתושב הוא באג שממתין לקרות: דיאלוג
     שמבקש לכתוב משפט לאיש, או מייל שמנסה לצאת לדיווח שאינו קיים.
   ⚠️ ובדיקה שנייה בחשיבותה: **אין שדה תיאור.** כרטיס הפירוט של המנהל
      אינו מצייר `desc` בשום מקום, והוספתו הייתה השינוי היחיד שדורש
      פרסום כללי אבטחה. מי שיוסיף אותו בעתיד — שיעשה זאת ביודעין.
   ⚠️ ובדיקה שלישית: **אין מנגנון חזרתיות חדש.** המתג מנתב ל-
      `gardenPlanSave` הקיים, ולא בונה לולאה משלו. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const DS = R('js/data/dataService.js');
const GT = R('js/screens/gardenTasks.js');
const RG = R('js/screens/resGarden.js');
const PH = R('js/ui/photos.js');
const RULES = R('firestore.rules');
const CSS = R('css/garden.css');
const HTML = R('index.html');
const SW = R('service-worker.js');

section('1. 🔴🔴 התפר — repId ולא kind');
ok('סגירה מבקשת "מה נעשה?" לפי repId, לא לפי kind',
   /if \(!t\.repId\) return run\("done", id, \{\}\);/.test(GT));
ok('לא נשאר התנאי הישן kind !== GK_REPORT בסגירה',
   !/if \(t\.kind !== GK_REPORT\) return run\("done"/.test(GT));
ok('הטוסט שאחרי פעולה נגזר מ-repId',
   /var wasReport = !!\(t && t\.repId\);/.test(GT));
ok('שכבת הכתיבה כבר גוזרת isReport מ-repId (התפר לא הומצא כאן)',
   /var isReport = String\(cur\.repId \|\| ""\)\.trim\(\) !== "";/.test(DS));
ok('כללי האבטחה מתעדים את אותה הבחנה',
   /repId.{0,12}ולא.{0,12}kind/.test(RULES) || /`repId` ולא `kind`/.test(RULES));

section('2. משימת מנהל נפתחת כתקלה — עם repId ריק');
const create = DS.slice(DS.indexOf('function gardenFsCreateTask'),
                        DS.indexOf('function gardenPlanNewId'));
ok('gardenFsCreateTask מקבל asReport', /var asReport = !!payload\.asReport;/.test(create));
ok('asReport קובע את kind בלבד',
   /kind: asReport \? GARDEN_KIND_REPORT : "יזום"/.test(create));
ok('repId נשאר ריק תמיד — אין תושב מאחורי משימת מנהל',
   /repId: ""/.test(create) && !/repId: String\(/.test(create));
ok('נעיצה נבדקת בטווח 0–1 לפני שהיא נכתבת',
   /payload\.x >= 0 && payload\.x <= 1 && payload\.y >= 0 && payload\.y <= 1/.test(create));
ok('בלי נעיצה תקינה נכתב null ולא ערך חלקי',
   /x: hasPin \? Number\(payload\.x\) : null/.test(create) &&
   /y: hasPin \? Number\(payload\.y\) : null/.test(create));
ok('שורת היומן מבחינה בין תקלה שפתח הצוות למשימה יזומה',
   /asReport \? "תקלה שפתח הצוות" : "משימה יזומה"/.test(create));

section('3. ⚠️ אין שדה תיאור — ולכן אין שינוי בכללי האבטחה');
const gtFields = (RULES.match(/function gtFields\(\)[\s\S]*?\}/) || [''])[0];
ok('gtFields אינו מכיל desc', !/['"]desc['"]/.test(gtFields));
/* ⚠️ המילה desc מופיעה בהערה שמסבירה **למה** אין שדה כזה — ולכן
   הבדיקה מסתכלת על המסמך שנכתב, לא על טקסט הקובץ. */
const docLiteral = create.slice(create.indexOf('var doc = {'), create.indexOf('CBA.fb.createDoc'));
ok('המסמך שנכתב אינו כולל desc', !/(^|[^\w])desc\s*:/.test(docLiteral));
ok('הטופס אינו אוסף תיאור', !/nt-desc/.test(GT));
const NEW_TASK = GT.slice(GT.indexOf('function openNewTask'), GT.indexOf('function openMenu'));
/* כל שם שדה במסמך, לא רק אלה שבהזחה מסוימת — אחרת שדה שנוסף בעתיד
   בשורה משותפת היה חומק מהבדיקה בשקט. */
const written = [...new Set((docLiteral.match(/(?:^|[{,])\s*([a-zA-Z]\w*)\s*:/gm) || [])
  .map(m => m.replace(/[^a-zA-Z]/g, ''))
  /* המילה שאחרי `?` בתנאי משולש אינה שם שדה — ולכן רק שמות שמתחילים
     באות קטנה, כפי שכל שדות האוסף כתובים. */
  .filter(f => /^[a-z]/.test(f)))];
const allowed = (gtFields.match(/'([a-zA-Z]+)'/g) || []).map(s => s.replace(/'/g, ''));
ok('נסרקו כל שדות המסמך (לפחות 15)', written.length >= 15, 'נמצאו ' + written.length);
written.forEach(f => ok('השדה ' + f + ' מותר ב-gtFields', allowed.indexOf(f) >= 0, f));

section('4. כל שדה שהטופס שולח מגיע ממסלול הכתיבה הישירה');
ok('המפה והתמונות מוצגות רק כשהדפדפן כותב ישירות',
   /var direct = !!\(CBA\.data\.gardenDirectWrites && CBA\.data\.gardenDirectWrites\(\)\);/.test(NEW_TASK));
ok('gardenDirectWrites מיוצא — המסך אינו גוזר את הדגל מחדש',
   /gardenDirectWrites: function \(\) \{ return gardenWritesOn\(\); \}/.test(DS));
ok('המסך אינו קורא ל-CBA.fb.flag בעצמו', !/CBA\.fb\.flag\(/.test(GT));

section('5. התמונות — מנגנון אחד, לא שניים');
ok('הכיווץ עבר ל-js/ui/photos.js', /function compress\(file, cb\)/.test(PH));
ok('photos.js מייצא compress ו-toUpload',
   /return \{ open: open, compress: compress, toUpload: toUpload \};/.test(PH));
ok('resGarden כבר אינו מממש כיווץ בעצמו',
   !/var MAX_EDGE/.test(RG) && !/cv\.toDataURL\("image\/jpeg"/.test(RG));
ok('resGarden מאציל ל-CBA.photos.compress',
   /function compressImage\(file, cb\) \{ CBA\.photos\.compress\(file, cb\); \}/.test(RG));
ok('מסך המשימות משתמש באותו מנגנון', /CBA\.photos\.toUpload\(f, function/.test(NEW_TASK));
ok('photos.js נטען לפני gardenTasks.js ב-index.html',
   HTML.indexOf('js/ui/photos.js') < HTML.indexOf('js/screens/gardenTasks.js'));

section('6. התמונות עולות ברקע — התשובה חוזרת לפני ההעלאה');
ok('cb נקרא לפני gardenUploadPhotos',
   create.indexOf('cb({ ok: true, id: taskId') < create.indexOf('gardenUploadPhotos('));
ok('המכסה נבדקת שוב בתוך ה-callback של הכיווץ',
   (NEW_TASK.match(/state\.photos\.length >= NT_PHOTO_MAX/g) || []).length >= 3);
ok('אין beforeunload בטופס — סגירת הדף אינה נחסמת', !/beforeunload/.test(NEW_TASK));
ok('כשל בהעלאה נרשם ואינו מבטל את המשימה',
   /gardenPhotoWarn\("אף תמונה לא עלתה למשימה"/.test(create) &&
   /gardenPhotoWarn\("מסמך המשימה לא עודכן בתמונות"/.test(create));
ok('photos מותר ב-gtTeamUpdateOk (המיזוג שאחרי ההעלאה)',
   /gtTeamUpdateOk[\s\S]{0,600}'photos'/.test(RULES));

section('7. ⚠️ המתג מנתב — הוא אינו מנגנון חזרתיות חדש');
ok('המתג קיים כ-role="switch" עם aria-checked', /role="switch" aria-checked="false"/.test(NEW_TASK));
ok('aria-checked מתעדכן בלחיצה',
   /repBtn\.setAttribute\("aria-checked", state\.repeat \? "true" : "false"\)/.test(NEW_TASK));
ok('דלוק → gardenPlanSave הקיים', /CBA\.data\.gardenPlanSave\(\{/.test(NEW_TASK));
ok('כבוי → gardenCreateTask עם asReport', /asReport: true/.test(NEW_TASK));
ok('אין אוסף חדש ואין כתיבה ישירה לאוסף אחר מהטופס',
   !/createDoc\(/.test(NEW_TASK));
ok('מתג דלוק מסתיר את המפה ואת התמונות (אין להן מקום ב-gardenPlan)',
   /onceEl\.hidden {2}= state\.repeat;/.test(NEW_TASK));
const gpFields = (RULES.match(/function gpFields\(\)[\s\S]*?\}/) || [''])[0];
ok('gardenPlan באמת אינו מחזיק x/y/photos — ההסתרה נכונה ולא שרירותית',
   !/'x'/.test(gpFields) && !/'y'/.test(gpFields) && !/'photos'/.test(gpFields));

section('8. בדיקת דו-שבועי — אותה בדיקה בלקוח, בשרת ובכללים');
ok('הטופס חוסם דו-שבועי בלי שבוע ראשון',
   /freq === "דו-שבועי" && !first/.test(NEW_TASK));
ok('אותה בדיקה בשכבת הכתיבה',
   /freq === "דו-שבועי" && !\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(payload\.firstWeek/.test(DS));
ok('ואותה בדיקה בכללי האבטחה',
   /freq != 'דו-שבועי' \|\|[\s\S]{0,120}firstWeek/.test(RULES));
ok('שדות התדירות מוסתרים ולא מוסרים מה-DOM',
   /wrap\.querySelector\("#nt-anchor"\)\.hidden/.test(NEW_TASK) &&
   !/#nt-anchor"\)\.remove\(\)/.test(NEW_TASK));

section('9. נגישות, עיצוב וניסוח');
ok('כפתור הסרת תמונה הוא button עם aria-label (ממצא 29 לא נסוג)',
   /<button type="button" class="th-x" aria-label="הסרת התמונה">/.test(NEW_TASK));
ok('המתג משתמש ב-.gp-sw הקיים ולא במתג שני', /class="gp-sw off"/.test(NEW_TASK));
ok('אין הגדרת מתג חדשה ב-CSS', !/\.nt-rep__sw/.test(CSS));
ok('המפה בגיליון נמוכה מ-.gd-map הרגילה', /\.nt-map \{ height: 240px/.test(CSS));
ok('הכפתור הראשי הוא .gd-cta — CTA שחור לפי האפיון', /class="gd-cta" id="nt-go"/.test(NEW_TASK));
ok('הגיליון עובר ב-mountSheet (Esc, מלכודת מיקוד, שומר כפילות)',
   /CBA\.ui\.mountSheet\(wrap, \{ key: "gt-new", sticky: true \}\)/.test(NEW_TASK));
ok('תווית המסנן כבר לא משקרת — תקלה יכולה להיפתח משני הצדדים',
   /seg\("faults", "תקלות", c\.faults\)/.test(GT) && !/"תקלות דיירים", c\.faults/.test(GT));
ok('הנעיצה ממלאת אזור רק כשהמנהל לא בחר אחד',
   /if \(state\.pinArea && sel && !sel\.value\)/.test(NEW_TASK));

section('10. גרסה ומטמון');
ok('index.html ו-service-worker על אותה גרסה',
   (SW.match(/var VERSION = "(\d+\w?)"/) || [])[1] === '20260922e' &&
   HTML.indexOf('?v=20260922e') > 0);
ok('לא נשארה גרסה ישנה ב-index.html', !/20260922d/.test(HTML));


/* ==========================================================================
 *  11. התנהגות אמיתית ב-DOM — לא רק regex
 * --------------------------------------------------------------------------
 *  `openNewTask` היא פונקציה פנימית במסך, ולכן היא נשלפת מהמקור ומורצת
 *  עם המשתנים החופשיים שלה כסטאבים. זה לא "כמעט הקוד" — זו בדיוק אותה
 *  מחרוזת שרצה בייצור.
 *  🔑 מה שבאמת נבדק כאן ואי אפשר לבדוק ב-regex: שהמתג **באמת** מחליף
 *     את שני המסלולים, ושכל מסלול שולח את המטען הנכון לפונקציה הנכונה.
 * ======================================================================== */
section('11. התנהגות אמיתית ב-DOM (jsdom)');
try {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  global.FileReader = w.FileReader; global.Image = w.Image;

  const src = GT.slice(GT.indexOf('var NT_FREQS'), GT.indexOf('function openMenu'));
  let created = null, planned = null, mounted = null;
  const CBA = {
    ui: {
      mountSheet: (wrap) => { mounted = wrap; w.document.body.appendChild(wrap); return () => wrap.remove(); },
      alert: (m) => { CBA._alert = m; },
      toast: (m) => { CBA._toast = m; }
    },
    data: {
      gardenDirectWrites: () => true,
      gardenCreateTask: (p, cb) => { created = p; cb({ ok: true, id: 77, photosPending: 0 }); },
      gardenPlanSave: (p, cb) => { planned = p; cb({ ok: true, id: 'T9' }); }
    },
    photos: { toUpload: () => {} },
    map: { render: () => ({}) }
  };
  const fn = new w.Function(
    'CBA', 'esc', 'ico', 'order', 'shiftKey', 'todayKey', 'weekLabel',
    'busy', 'filter', 'load', 'document', 'setTimeout', 'Array',
    src + '; return openNewTask;'
  )(CBA,
    (s) => String(s == null ? '' : s),
    () => '<svg></svg>',
    { type: ['עצים', 'דשא'], area: ['צפון', 'דרום'] },
    (k, n) => '2026-09-2' + (7 + n),
    () => '2026-09-27',
    (k) => 'שבוע ' + k,
    false, 'open', () => {},
    w.document, (f) => f(), w.Array);

  fn();
  const q = (s) => mounted.querySelector(s);
  ok('הגיליון נבנה ונכנס ל-DOM', !!mounted && !!q('#nt-title'));
  ok('ברירת המחדל היא תקלה חד-פעמית — לא חוזרת',
     q('#nt-rep').getAttribute('aria-checked') === 'false' &&
     q('#nt-once').hidden === false && q('#nt-every').hidden === true);
  ok('המפה והתמונות מוצגות במסלול הישיר', !!q('#nt-map') && !!q('#nt-thumbs'));
  ok('הכפתור הראשי אומר מה הוא עושה', q('#nt-go-t').textContent === 'פתיחת התקלה');

  /* --- כותרת ריקה לא פותחת כלום --- */
  q('#nt-go').click();
  ok('בלי כותרת אין כתיבה, ויש הסבר', created === null && /צריך לכתוב/.test(CBA._alert || ''));

  /* --- מסלול חד-פעמי --- */
  q('#nt-title').value = 'ראש ממטרה שבור';
  q('#nt-cat').value = 'דשא';
  q('#nt-go').click();
  ok('נשלח asReport:true — המשימה תטופל כתקלה', !!created && created.asReport === true);
  ok('הכותרת והקטגוריה עברו', created.title === 'ראש ממטרה שבור' && created.category === 'דשא');
  ok('בלי נעיצה נשלח null ולא ערך חלקי', created.x === null && created.y === null);
  ok('הטוסט נוקב במספר התקלה', /נפתחה תקלה #77/.test(CBA._toast || ''));

  /* --- המתג --- */
  fn();
  const q2 = (s) => mounted.querySelector(s);
  q2('#nt-rep').click();
  ok('🔴 המתג מחליף את שני המסלולים',
     q2('#nt-once').hidden === true && q2('#nt-every').hidden === false);
  ok('aria-checked עקבי עם המצב', q2('#nt-rep').getAttribute('aria-checked') === 'true');
  ok('המתג הוויזואלי (.gp-sw) איבד את off', !q2('.gp-sw').classList.contains('off'));
  ok('הכפתור הראשי שינה ניסוח', q2('#nt-go-t').textContent === 'הוספה לתוכנית');
  ok('⚠️ והטקסט מסביר למה אין מפה ותמונות', /לא תקלה בנקודה אחת/.test(q2('#nt-sub').textContent));

  /* --- דו-שבועי בלי עוגן נחסם --- */
  q2('#nt-title').value = 'גיזום שיחים';
  q2('#nt-freq').value = 'דו-שבועי';
  q2('#nt-freq').dispatchEvent(new w.Event('change'));
  ok('שדה השבוע הראשון נחשף בדו-שבועי', q2('#nt-anchor').hidden === false);
  CBA._alert = '';
  q2('#nt-go').click();
  ok('🔴 דו-שבועי בלי שבוע ראשון נחסם', planned === null && /שבוע הראשון/.test(CBA._alert));

  q2('#nt-first').value = '2026-10-04';
  q2('#nt-go').click();
  ok('עם עוגן — נשמר לתוכנית העבודה', !!planned && planned.freq === 'דו-שבועי');
  ok('ונשלח ל-gardenPlan ולא נפתחה משימה', planned.firstWeek === '2026-10-04' && planned.id === '');
  ok('האזור עובר כמערך, כמו ש-gardenPlan מצפה', Array.isArray(planned.areas));
  ok('ההגדרה נוצרת פעילה', planned.active === true);
  ok('🔴 שום מפה ושום תמונה לא נשלחו במסלול החוזר',
     planned.x === undefined && planned.photos === undefined);

  /* --- חודשי חושף "שבוע בחודש" --- */
  q2('#nt-freq').value = 'חודשי';
  q2('#nt-freq').dispatchEvent(new w.Event('change'));
  ok('חודשי חושף "שבוע בחודש" ומסתיר את העוגן',
     q2('#nt-wom').hidden === false && q2('#nt-anchor').hidden === true);
  ok('⚠️ והשדה המוסתר עדיין קיים — ערך שהוקלד לא נעלם',
     q2('#nt-first').value === '2026-10-04');
} catch (e) {
  ok('jsdom רץ', false, e && e.message);
}

console.log('\n' + (fail ? '✗' : '✓') + '  סה"כ עברו ' + pass + ' · נכשלו ' + fail);
process.exit(fail ? 1 : 0);
