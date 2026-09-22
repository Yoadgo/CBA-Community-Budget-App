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
const GF = R('js/ui/gardenForm.js');
const GP = R('js/screens/gardenPlan.js');
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
ok('הטופס אינו אוסף תיאור', !/gf-desc/.test(GF));
/* ⚠️ מאז 22.9 הטופס אינו ב-gardenTasks.js אלא במודול המשותף. */
const NEW_TASK = GF;
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
ok('המסך אינו קורא ל-CBA.fb.flag בעצמו',
   !/CBA\.fb\.flag\(/.test(GT) && !/CBA\.fb\.flag\(/.test(GF));

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
   (NEW_TASK.match(/st\.photos\.length >= PHOTO_MAX/g) || []).length >= 3);
ok('אין beforeunload בטופס — סגירת הדף אינה נחסמת', !/beforeunload/.test(NEW_TASK));
ok('כשל בהעלאה נרשם ואינו מבטל את המשימה',
   /gardenPhotoWarn\("אף תמונה לא עלתה למשימה"/.test(create) &&
   /gardenPhotoWarn\("מסמך המשימה לא עודכן בתמונות"/.test(create));
ok('photos מותר ב-gtTeamUpdateOk (המיזוג שאחרי ההעלאה)',
   /gtTeamUpdateOk[\s\S]{0,600}'photos'/.test(RULES));

section('7. ⚠️ המתג מנתב — הוא אינו מנגנון חזרתיות חדש');
ok('המתג קיים כ-role="switch" עם aria-checked',
   NEW_TASK.indexOf('role="switch" ') >= 0 && NEW_TASK.indexOf('aria-checked="') >= 0);
ok('aria-checked מתעדכן בלחיצה',
   /this\.setAttribute\("aria-checked", st\.repeat \? "true" : "false"\)/.test(NEW_TASK));
ok('דלוק → gardenPlanSave הקיים', /CBA\.data\.gardenPlanSave\(\{/.test(NEW_TASK));
ok('🔴 והוא משרת גם את תוכנית העבודה — mode:"plan"', /mode: "plan"/.test(GP));
ok('🔴 ואת מסך המשימות — mode:"task"', /mode: "task"/.test(GT));
ok('⚠️ בעריכה המתג נעול', /swRow\("gf-rep"[\s\S]{0,120}isEdit\)/.test(GF));
ok('כבוי → gardenCreateTask עם asReport', /asReport: true/.test(NEW_TASK));
ok('אין אוסף חדש ואין כתיבה ישירה לאוסף אחר מהטופס',
   !/createDoc\(/.test(NEW_TASK));
ok('מתג דלוק מסתיר את המפה ואת התמונות (אין להן מקום ב-gardenPlan)',
   /q\("#gf-once"\)\.hidden = st\.repeat;/.test(NEW_TASK) &&
   /q\("#gf-every"\)\.hidden = !st\.repeat;/.test(NEW_TASK));
const gpFields = (RULES.match(/function gpFields\(\)[\s\S]*?\}/) || [''])[0];
ok('gardenPlan באמת אינו מחזיק x/y/photos — ההסתרה נכונה ולא שרירותית',
   !/'x'/.test(gpFields) && !/'y'/.test(gpFields) && !/'photos'/.test(gpFields));

section('8. בדיקת דו-שבועי — אותה בדיקה בלקוח, בשרת ובכללים');
ok('הטופס חוסם דו-שבועי בלי שבוע ראשון', /freq === "דו-שבועי" && !first/.test(NEW_TASK));
ok('אותה בדיקה בשכבת הכתיבה',
   /freq === "דו-שבועי" && !\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(String\(payload\.firstWeek/.test(DS));
ok('ואותה בדיקה בכללי האבטחה',
   /freq != 'דו-שבועי' \|\|[\s\S]{0,120}firstWeek/.test(RULES));
ok('שדות התדירות מוסתרים ולא מוסרים מה-DOM',
   /q\("#gf-anchor"\)\.hidden/.test(NEW_TASK) && !/#gf-anchor"\)\.remove\(\)/.test(NEW_TASK));

section('9. נגישות, עיצוב וניסוח');
ok('כפתור הסרת תמונה הוא button עם aria-label (ממצא 29 לא נסוג)',
   /<button type="button" class="th-x" aria-label="הסרת התמונה">/.test(NEW_TASK));
ok('המתג משתמש ב-.gp-sw הקיים ולא במתג שני', /'<i class="gp-sw'/.test(NEW_TASK));
ok('אין הגדרת מתג חדשה ב-CSS', !/\.nt-rep__sw/.test(CSS));
ok('הכפתורים הם צ\'יפים ולא רשימות נגללות — אין select בטופס',
   !/<select/.test(GF) && !/<select/.test(GT) && !/<select/.test(GP));
ok('המפה בגיליון נמוכה מ-.gd-map הרגילה', /\.nt-map \{ height: 240px/.test(CSS));
ok('הכפתור הראשי הוא .gd-cta — CTA שחור לפי האפיון', /class="gd-cta" id="gf-go"/.test(NEW_TASK));
/* 🔴🔴 **שלוש הבדיקות שנולדו מסימולציה חיה** (22.9) — אף אחת מהן לא
   הייתה עולה בניתוח סטטי, וכולן היו באגים אמיתיים במסך:
   1. הטופס sticky (Escape חסום בכוונה, יש בו טקסט שהוקלד) ו**בלי
      כפתור סגירה** — היציאה היחידה הייתה לחיצה על רצועת רקע שקופה.
   2. `ico("trash")` נקרא בלי גודל, ובתוכנית העבודה `ico` מקבל רוחב
      כפרמטר — ה-SVG נמתח לכל רוחב המגירה וכפתור המחיקה נראה כפח ענק.
   3. לטבלת הסמלילים של תוכנית העבודה לא היה `x` בכלל, ולכן כפתור
      הסגירה היה יוצא שם ריק. */
ok('🔴 לטופס יש כפתור סגירה מפורש', /class="gd-sheet-close" id="gf-x"/.test(GF));
ok('והוא מחובר ל-close', /wrap\.querySelector\("#gf-x"\)\.addEventListener\("click", close\)/.test(GF));
ok('⚠️ סמליל המחיקה מוגבל בגודל ב-CSS, לכל קורא',
   /\.gp-del svg \{ width: 14px; height: 14px;/.test(CSS));
ok('⚠️ ולשני המסכים יש סמליל x', /\bx:\s+'<path d="M6 6l12 12/.test(GT) && /\bx:\s+'<path d="M6 6l12 12/.test(GP));

ok('הגיליון עובר ב-mountSheet (Esc, מלכודת מיקוד, שומר כפילות)',
   /CBA\.ui\.mountSheet\(wrap, \{ key: "gf-form", sticky: true \}\)/.test(NEW_TASK));
ok('תווית המסנן כבר לא משקרת — תקלה יכולה להיפתח משני הצדדים',
   /seg\("faults", "תקלות", c\.faults\)/.test(GT) && !/"תקלות דיירים", c\.faults/.test(GT));
ok('הנעיצה ממלאת אזור רק כשהמנהל לא בחר אחד',
   /if \(st\.pinArea && !st\.area\)/.test(NEW_TASK));

section('10. גרסה ומטמון');
const VER = (SW.match(/var VERSION = "(\d+\w?)"/) || [])[1];
ok('index.html ו-service-worker על אותה גרסה', !!VER && HTML.indexOf('?v=' + VER) > 0, VER);
ok('לא נשארה גרסה ישנה ב-index.html',
   (HTML.match(/\?v=\d+[a-z]?/g) || []).every(v => v === '?v=' + VER));
ok('המודול המשותף רשום ב-index.html', HTML.indexOf('js/ui/gardenForm.js') > 0);


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

  let created = null, planned = null, mounted = null, deleted = null;
  w.CBA = {
    ui: {
      mountSheet: (wrap) => { mounted = wrap; w.document.body.appendChild(wrap); return () => wrap.remove(); },
      alert: (m) => { w.CBA._alert = m; },
      toast: (m) => { w.CBA._toast = m; }
    },
    data: {
      gardenDirectWrites: () => true,
      gardenCreateTask: (p, cb) => { created = p; cb({ ok: true, id: 77, photosPending: 0 }); },
      gardenPlanSave: (p, cb) => { planned = p; cb({ ok: true, id: 'T9' }); }
    },
    photos: { toUpload: () => {} },
    map: { render: () => ({}) }
  };
  /* המודול האמיתי, לא שכפול שלו. */
  w.eval(GF);
  const common = {
    cats: ['דשא', 'עצים'], areas: ['צפון', 'דרום'],
    ico: () => '<svg></svg>',
    catOf: (c) => ({ key: c === 'דשא' ? 'lawn' : 'tree', ico: 'lawn' }),
    esc: (x) => String(x == null ? '' : x)
  };
  const WEEKS = [{ v: '2026-09-27', label: 'השבוע' }, { v: '2026-10-04', label: 'שבוע הבא' },
                 { v: '', label: 'בלי שבוע' }];

  /* ---------- פריסט "משימה" ---------- */
  w.CBA.gardenForm.open(Object.assign({ mode: 'task', weeks: WEEKS }, common));
  let q = (sel) => mounted.querySelector(sel);
  ok('הטופס נבנה ונכנס ל-DOM', !!mounted && !!q('#gf-title'));
  ok('🔴 פריסט "משימה" — המתג כבוי', q('#gf-rep').getAttribute('aria-checked') === 'false');
  ok('ולכן המסלול החד-פעמי גלוי והחוזר מוסתר',
     q('#gf-once').hidden === false && q('#gf-every').hidden === true);
  ok('הקטגוריות הן צ\'יפים עם סמליל, לא רשימה נגללת',
     q('#gf-cats').querySelectorAll('.gd-cat[data-c]').length === 2 && !mounted.querySelector('select'));
  ok('"מתי" הוא צ\'יפים', q('#gf-weeks').querySelectorAll('[data-w]').length === 3);
  ok('המפה והתמונות מוצגות במסלול הישיר', !!q('#gf-map') && !!q('#gf-thumbs'));

  q('#gf-title').value = 'ראש ממטרה שבור';
  q('#gf-go').click();
  ok('🔴 בלי קטגוריה אין כתיבה, ויש הסבר',
     created === null && /קטגוריה/.test(w.CBA._alert || ''));

  q('#gf-cats').querySelector('[data-c="דשא"]').click();
  ok('בחירת צ\'יפ מסמנת aria-pressed',
     q('#gf-cats').querySelector('[data-c="דשא"]').getAttribute('aria-pressed') === 'true');
  q('#gf-weeks').querySelector('[data-w="2026-10-04"]').click();
  q('#gf-area').querySelector('[data-a1="צפון"]').click();
  q('#gf-go').click();
  ok('נשלח asReport:true', !!created && created.asReport === true);
  ok('הכותרת, הקטגוריה, האזור והשבוע עברו',
     created.title === 'ראש ממטרה שבור' && created.category === 'דשא' &&
     created.area === 'צפון' && created.week === '2026-10-04');
  ok('בלי נעיצה נשלח null ולא ערך חלקי', created.x === null && created.y === null);
  ok('הטוסט נוקב במספר התקלה', /נפתחה תקלה #77/.test(w.CBA._toast || ''));

  /* ---------- המתג ---------- */
  w.CBA.gardenForm.open(Object.assign({ mode: 'task', weeks: WEEKS }, common));
  q = (sel) => mounted.querySelector(sel);
  q('#gf-rep').click();
  ok('🔴 המתג מחליף את שני המסלולים',
     q('#gf-once').hidden === true && q('#gf-every').hidden === false);
  ok('aria-checked עקבי', q('#gf-rep').getAttribute('aria-checked') === 'true');
  ok('המתג הוויזואלי איבד את off', !q('#gf-rep .gp-sw').classList.contains('off'));
  ok('הכפתור הראשי שינה ניסוח', q('#gf-go-t').textContent === 'הוספה לתוכנית');
  ok('⚠️ והטקסט מסביר למה אין מפה ותמונות', /לא תקלה בנקודה אחת/.test(q('#gf-sub').textContent));

  q('#gf-title').value = 'גיזום שיחים';
  q('#gf-freq').querySelector('[data-f="דו-שבועי"]').click();
  ok('שדה השבוע הראשון נחשף בדו-שבועי', q('#gf-anchor').hidden === false);
  w.CBA._alert = '';
  q('#gf-go').click();
  ok('🔴 דו-שבועי בלי שבוע ראשון נחסם', planned === null && /שבוע הראשון/.test(w.CBA._alert));
  q('#gf-first').value = '2026-10-04';
  q('#gf-areas').querySelector('[data-a="צפון"]').click();
  q('#gf-areas').querySelector('[data-a="דרום"]').click();
  q('#gf-go').click();
  ok('עם עוגן — נשמר לתוכנית העבודה', !!planned && planned.freq === 'דו-שבועי');
  ok('אזורים מרובים עוברים כמערך',
     Array.isArray(planned.areas) && planned.areas.length === 2);
  ok('🔴 שום מפה ושום תמונה לא נשלחו במסלול החוזר',
     planned.x === undefined && planned.photos === undefined);
  ok('ההגדרה נוצרת פעילה, ובלי מזהה (חדשה)', planned.active === true && planned.id === '');

  q('#gf-freq').querySelector('[data-f="חודשי"]').click();
  ok('חודשי חושף "שבוע בחודש" ומסתיר את העוגן',
     q('#gf-wom').hidden === false && q('#gf-anchor').hidden === true);
  ok('⚠️ והשדה המוסתר שומר את ערכו', q('#gf-first').value === '2026-10-04');

  /* ---------- פריסט "תוכנית", ועריכה ---------- */
  w.CBA.gardenForm.open(Object.assign({ mode: 'plan', weeks: WEEKS }, common));
  q = (sel) => mounted.querySelector(sel);
  ok('🔴 פריסט "תוכנית" — המתג מתעורר דלוק',
     q('#gf-rep').getAttribute('aria-checked') === 'true' && q('#gf-every').hidden === false);

  planned = null;
  w.CBA.gardenForm.open(Object.assign({
    mode: 'plan', weeks: WEEKS,
    data: { id: 'T3', title: 'כיסוח', category: 'דשא', freq: 'חודשי',
            weekOfMonth: 3, areas: ['דרום'], months: '3-11', rotate: true,
            clause: 'ס-4', active: true },
    onDelete: () => { deleted = true; }
  }, common));
  q = (sel) => mounted.querySelector(sel);
  ok('עריכה — הערכים נטענים לטופס',
     q('#gf-title').value === 'כיסוח' &&
     q('#gf-cats').querySelector('[data-c="דשא"]').classList.contains('on') &&
     q('#gf-freq').querySelector('[data-f="חודשי"]').classList.contains('on') &&
     q('#gf-womc').querySelector('[data-wom="3"]').classList.contains('on') &&
     q('#gf-areas').querySelector('[data-a="דרום"]').classList.contains('on') &&
     q('#gf-months').value === '3-11' && q('#gf-clause').value === 'ס-4');
  ok('⚠️ בעריכה המתג נעול דלוק', q('#gf-rep').disabled === true);
  ok('סבב האזורים נטען כמתג דלוק', q('#gf-rot').getAttribute('aria-checked') === 'true');
  ok('הכפתור אומר "שמירה"', q('#gf-go-t').textContent === 'שמירה');
  q('#gf-go').click();
  ok('שמירה מעבירה את המזהה — עדכון ולא יצירה', !!planned && planned.id === 'T3');
  ok('ושומרת את הסבב ואת הסעיף', planned.rotate === true && planned.clause === 'ס-4');
  ok('כפתור המחיקה קיים בעריכה בלבד', !!q('#gf-del'));
  q('#gf-del').click();
  ok('והוא מפעיל את onDelete של המסך', deleted === true);
} catch (e) {
  ok('jsdom רץ', false, (e && e.message) + ' | ' + (e && e.stack || '').split('\n')[1]);
}

console.log('\n' + (fail ? '✗' : '✓') + '  סה"כ עברו ' + pass + ' · נכשלו ' + fail);
process.exit(fail ? 1 : 0);
