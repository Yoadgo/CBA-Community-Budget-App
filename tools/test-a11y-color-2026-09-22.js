/* ממצאים 10 · 16 · 17 — צבע ונגישות   (2026-09-22, גל 3)
   הרצה:  node tools/test-a11y-color-2026-09-22.js

   🔴 שני פריטים ברשימה כבר היו סגורים, וזה מתועד כאן כשומר רגרסיה:
     · **ממצא 15** (ניווט שנכשל בשקט) — `showScreen` מדווחת היום כל חסימה
       ל-`CBA.diag` עם קוד סיבה נפרד, ולא "פשוט לא עושה כלום".
     · **החצי של PayBox בממצא 10** — נסגר ב-17.9 עם ממצא 07: הכפתור במודאל
       הפך לגרסת ghost, והסגול המלא נשאר רק על כרטיס התשלום האמיתי.
   🔑 **והכיוון בממצא 10 אינו "לצבוע שחור"** — שחור מלא הוא CTA ראשי באפיון,
      וזה היה מחליף תקלה אחת באחרת. כפתור משוב הוא משטח ניטרלי. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const REP = R('css/report.css');
const RESC = R('css/resident.css');
const APP = R('js/app.js');
const RES = R('js/screens/residents.js');
const HTML = R('index.html');
const SW = R('service-worker.js');

section('1. 🔴 ממצא 10 — הכפתור הצף חזר לשפה העיצובית');
/* 🔑 **הבדיקה מכוונת לכפתור עצמו ולא לקובץ.** `--report` הוורוד נשאר
   בשימוש בתוך פאנל הדיווח — וזו החלטה מתועדת בראש הקובץ: הפאנל מדבר על
   *האפליקציה*, ולכן אסור שייקרא בפלטת הסטטוסים (ok/warn/danger) שמדברת
   על *הנתונים*. תלונת ממצא 10 היא על **דומיננטיות**, לא על הגוון: עיגול
   זוהר שגבר על "הגשת קבלה". זה מה שתוקן. */
const FAB = (REP.match(/\.rep-fab \{[\s\S]*?\n\}/) || [''])[0];
ok('🔴 אין גרדיאנט ורוד על הכפתור עצמו', !/#F472B6|#DB2777/i.test(FAB), FAB);
ok('ואין עליו צללית ורודה', !/rgba\(219,39,119/.test(FAB), FAB);
ok('⚠️ והגוון של המודול **כן** נשאר בפנים — החלטה מתועדת, לא שריד',
   /--report:\s*#DB2777/.test(REP) && /אסור שייקרא כהתראה/.test(REP));
ok('גם הריחוף כבר אינו ורוד', !/rgba\(219,39,119,\.42\)/.test(REP));
ok('הרקע ניטרלי מהטוקן', /background: var\(--surface, #fff\);/.test(REP));
ok('והסמליל כהה', /color: var\(--text, #374151\);/.test(REP));
ok('⚠️ ו**לא** שחור מלא — זה היה הופך אותו לפעולה ראשית',
   !/background:\s*#111827/.test(REP.match(/\.rep-fab \{[\s\S]*?\}/)[0]));
ok('נשארה מסגרת דקה שמפרידה אותו מהרקע', /border: 1px solid rgba\(17,24,39,\.10\);/.test(REP));

section('2. שומר רגרסיה — החצי של PayBox שכבר נסגר');
ok('גרסת ה-ghost למודאל קיימת', /\.club-pay__btn--ghost/.test(RESC));
ok('והסגול המלא נשאר על כרטיס התשלום עצמו',
   /\.club-pay__btn \{[\s\S]*?linear-gradient\(135deg, #7C3AED, #5B21B6\)/.test(RESC));

section('3. 🔴 ממצא 16 — תפריט הניהול לא נגיש מאחורי שער הכניסה');
ok('shellInert קיימת', /function shellInert\(on\)/.test(APP));
ok('🔴 היא מחילה inert על header ו-main', /\["header", "main"\]\.forEach/.test(APP), 'לא נמצא');
ok('⚠️ inert ולא tabindex — מוציא גם מעץ הנגישות',
   /el\.setAttribute\("inert", ""\)/.test(APP) && /el\.removeAttribute\("inert"\)/.test(APP));
const shows = (APP.match(/gate\.hidden = false;\n    shellInert\(true\);/g) || []).length;
ok('🔴 נקראת בכל מקום שבו השער עולה (2)', shows === 2, 'נמצאו ' + shows);
ok('🔴 ומשוחררת כשהשער יורד',
   /if \(gate\) gate\.hidden = true;\n    shellInert\(false\);/.test(APP), 'לא נמצא');
ok('⚠️ שחרור אחד בלבד — אחרת השחרור עלול לקרות כשהשער עוד עלה',
   (APP.match(/shellInert\(false\)/g) || []).length === 1);
ok('שלושת הכפתורים אכן יושבים ב-header ב-index.html',
   /<header class="app-header">[\s\S]*?data-screen="budget"[\s\S]*?data-screen="expenses"/.test(HTML));

section('4. 🔴 ממצא 17 — תוויות ומצב פעיל');
ok('🔴 aria-current על הלשונית הפעילה', /aria-current="page"/.test(APP), 'חסר');
ok('⚠️ ורק עליה', /t\[0\] === currentScreen \? \x27 aria-current="page"\x27 : \x27\x27/.test(APP));
ok('is-active נשארה — היא הוויזואל, לא ההצהרה', /" is-active" : ""/.test(APP));
ok('🔴 לכל שדה בגריד יש aria-label', /aria-label="\x27 \+ CBA\.esc\(x\.label \+ " · שורה " \+ \(ri \+ 1\)\)/.test(RES), 'חסר');
ok('⚠️ והיא כוללת מספר שורה — "שם משפחה" לבדו אינו אומר איזו',
   /" · שורה " \+ \(ri \+ 1\)/.test(RES));
ok('הכותרת עדיין מצוירת כטקסט — התווית לא באה במקומה',
   /res-grid__h[\s\S]{0,120}CBA\.esc\(x\.label\)/.test(RES));
ok('כפתור מחיקת השורה שמר על התווית שלו', /aria-label="מחק שורה"/.test(RES));

section('5. שומר רגרסיה — ממצא 15 כבר סגור');
ok('quietFail קיימת', /function quietFail\(kind, name, why, trailOnly\)/.test(APP));
['navigate-early', 'navigate-missing', 'navigate-no-area', 'navigate-area-bounced']
  .forEach(k => ok('קוד סיבה: ' + k, APP.indexOf('"' + k + '"') !== -1));
ok('🔴 כשל אמיתי נרשם ב-CBA.diag ולא רק בקונסולה',
   /CBA\.diag\.error\(line, "app\.js"\)/.test(APP));
ok('⚠️ ומצב צפוי נרשם בשובל בלבד — כדי לא לזהם את רשימת השגיאות',
   /if \(trailOnly\)/.test(APP) && /CBA\.diag\.log\(line\)/.test(APP));

section('6. גרסה');
const swV = (SW.match(/var VERSION = "([^"]+)"/) || [, ''])[1];
const htmlV = [...new Set((HTML.match(/\?v=[0-9a-z]+/g) || []).map(x => x.slice(3)))];
ok('index.html מחזיק ערך אחד', htmlV.length === 1, htmlV.join(','));
ok('🔴 והוא זהה ל-service-worker', htmlV[0] === swV, htmlV[0] + ' מול ' + swV);

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
