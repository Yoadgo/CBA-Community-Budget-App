/* סגירת גל 3 — חלון צד, סיווג תקלת מנהל, ממצא 20(2), ושומרי 07·08·09·14
   הרצה:  node tools/test-wave3-close-2026-09-22.js

   🔑 **החלק החשוב כאן הוא הסעיף האחרון.** ארבעה ממצאים שהדוח החזיק
     כ"פתוחים" התבררו כמתוקנים מ-17.9 ומעולם לא סומנו. ממצא שתוקן ואיש
     לא שמר עליו הוא ממצא שייפתח בחזרה בשקט בריפקטור הבא — ולכן לכל
     אחד מהם יש כאן שומר שנצמד ל**מנגנון** ולא לניסוח.
   ⚠️ ובאותה נשימה: ממצא 20(2) **לא** מומש כפי שהדוח הציע. הדוח ביקש
      לפתוח את המשימה מחדש אוטומטית; §18.3 באפיון קובע שההחלטה נשארת
      אנושית. מה שתוקן הוא המדידה, וזו הכרעה שהבדיקות כאן מקבעות. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 220) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const CSS = R('css/garden.css');
const GT = R('js/screens/gardenTasks.js');
const GS = R('apps-script/Code.gs');
const EXP = R('js/screens/expenses.js');
const RES = R('js/screens/resident.js');
const RSD = R('js/screens/residents.js');
const DS = R('js/data/dataService.js');

section('1. חלון צד במחשב — שינוי ברכיב, לא בתשעה מסכים');
const media = (CSS.match(/@media \(min-width: 860px\) \{[\s\S]*?\n\}/) || [''])[0];
ok('יש בלוק @media ל-860px', media.length > 100);
ok('🔴 הגיליון הופך לחלון צד מלא-גובה',
   /\.gt-sheet \{[\s\S]*?inset-block: 0;[\s\S]*?height: 100%;/.test(media));
ok('ורחב משמעותית', /width: min\(680px, 58vw\)/.test(media));
/* 🔴🔴 **הבדיקה שהייתה חסרה, וזה מה שעלה לנו סיבוב שלם.**
   בגרסה הראשונה הוספתי בלוק media חדש ל-860px — ולא שמתי לב שכבר
   היה בקובץ בלוק ל-901px שהופך את הגיליון לכרטיס צף וממורכז.
   אותה ספציפיות, מוגדר **אחרי** שלי, ולכן ניצח: בין 860 ל-900
   נפתח חלון צד, ומ-901 ומעלה חזר הכרטיס הממורכז — כלומר בפועל
   שום דבר לא השתנה אצל המשתמש. יועד תפס את זה במסך.
   מהיום: **בדיוק בלוק media אחד שולט בגיאומטריה של .gt-sheet**. */
/* נקודות השבירה שבהן `.gt-sheet` מקבל גיאומטריה. הסריקה היא לפי
   בלוק, כדי ששכן תמים (prefers-reduced-motion) לא ייספר. */
const brk = [];
{
  const re = /@media \(min-width: (\d+)px\)\s*\{/g;
  let m;
  while ((m = re.exec(CSS))) {
    let i = CSS.indexOf('{', m.index), d = 0, k = i;
    for (; k < CSS.length; k++) {
      if (CSS[k] === '{') d++;
      else if (CSS[k] === '}' && --d === 0) break;
    }
    const body = CSS.slice(i, k);
    if (/\.gt-sheet\s*\{[^}]*(width|inset|bottom|left|margin-inline)/.test(body)) brk.push(+m[1]);
  }
}
ok('🔴 בדיוק שתי נקודות שבירה שולטות בגיליון — 860 ו-1400',
   brk.length === 2 && brk[0] === 860 && brk[1] === 1400, brk.join(','));
ok('⚠️ ובלוק הכרטיס הממורכז הישן הוסר לגמרי',
   !/inset-inline: 0; margin-inline: auto; width: min\(460px/.test(CSS));
ok('ההנפשה עוברת מלמטה לצד',
   /transform: translateX\(-100%\)/.test(media) &&
   /\.gt-sheet-wrap\.is-open \.gt-sheet \{ transform: translateX\(0\); \}/.test(media));
ok('⚠️ הגרר יורד — אין מה לגרור בחלון צד', /\.gt-grip \{ display: none; \}/.test(media));
ok('⚠️ בנייד לא נגענו — הגיליון התחתון נשאר מחוץ ל-media',
   /\.gt-sheet \{ position: absolute; inset-inline: 0; bottom: 0;/.test(CSS) &&
   /transform: translateY\(100%\)/.test(CSS));
ok('🔑 ואף מסך לא השתנה — אין mountSheet חדש ואין מחלקה חדשה בקריאות',
   !/is-side|is-drawer/.test(GT));
ok('הכפתור הראשי נצמד לתחתית כמו .drawer__actions--sticky',
   /\.gt-sheet \.gd-cta \{[\s\S]*?position: sticky;/.test(media));

section('2. תקלת מנהל — פינה כחולה ותווית, בלי שדה חדש');
ok('🔑 ההבחנה נגזרת מ-repId ולא משדה חדש',
   /function isTeamFault\(t\) \{ return !!t && t\.kind === GK_REPORT && !t\.repId; \}/.test(GT));
/* 22.9 — תקלה שהגנן פתח מקבלת is-gard (ירוק) לפני is-team. */
ok('הכרטיס הפתוח מקבל is-team', /\(isGardenerFault\(t\) \? " is-gard" : isTeamFault\(t\) \? " is-team" : ""\)/.test(GT));
ok('וגם הכרטיס הסגור', (GT.match(/isTeamFault\(t\) \? " is-team"/g) || []).length === 2);
ok('התווית אומרת "מנהל" ולא מספר דיווח',
   /class="gt-res is-team">' \+ ico\("team"\) \+ 'מנהל/.test(GT));
ok('ולתקלת דייר נשאר מספר הדיווח', /esc\(GL\.reportRef\(t\.repId\)\)/.test(GT));
ok('יש סמליל team נפרד מ-person', /team:\s+'<circle/.test(GT) && /person: '<circle/.test(GT));
ok('🔵 הפינה כחולה ולא אדומה',
   /\.gt-row\.is-team::after \{ border-top-color: var\(--gt-team, #1D4ED8\); \}/.test(CSS));
ok('⚠️ הפס המקוטע נשאר משותף — הוא אומר "תקלה", לא "תושב"',
   !/\.gt-row\.is-team::before/.test(CSS));
ok('כרטיס הפירוט מציג "תקלה · מנהל"',
   /isTeamFault\(t\) \? "תקלה · מנהל" : GL\.T\.report/.test(GT));
ok('🔑 והסימן נכנס למקרא באותה נשימה',
   /<b>פינה כחולה<\/b>/.test(GT) && /\.gt-lgf\.is-team::after/.test(CSS));

section('3. 🔴 ממצא 20(2) — המדידה תוקנה, הסטטוס לא');
ok('יש גוזר אחד ל"סגורה אבל לא גמורה"',
   /function gardenUnsettled_\(t\) \{\s*return !!t\.closure && t\.flag === 'דורש בדיקה חוזרת';\s*\}/.test(GS));
ok('🔴 והיא נספרת בתשומת לב ולא בסגורות',
   /if \(gardenUnsettled_\(t\)\) \{ now\.attention\+\+; return; \}/.test(GS));
ok('אותה הבחנה גם בספירת האזורים',
   /if \(gardenUnsettled_\(t\)\) \{ a\.attention\+\+; return; \}/.test(GS));
ok('⚠️ הסטטוס עצמו **לא** נפתח מחדש — §18.3, ההחלטה אנושית',
   /משוב שלילי \*\*לא\*\* פותח את התקלה מחדש אוטומטית/.test(GS));
/* ⚠️ נבדק **בתוך פונקציית המשוב בלבד**: `closure: ""` מופיע גם
   במסלול האיחוד, שם הוא נכון לגמרי — ובדיקה על כל הקובץ הייתה
   נכשלת על קוד תקין. */
const FB = DS.slice(DS.indexOf('function gardenFsFeedback'),
                    DS.indexOf('function gardenReportFsWrite'));
ok('והלקוח עדיין מרים רק דגל, בלי לגעת בסגירה',
   /flag: "דורש בדיקה חוזרת", updatedAt: now/.test(FB) &&
   !/closure/.test(FB) && !/stage/.test(FB));
ok('⚠️ ולכן גם לא נדרש שינוי בכללי האבטחה — התושב לא מקבל כוח חדש',
   /hasOnly\(\['flag', 'updatedAt'\]\)/.test(R('firestore.rules')));

section('4. 🔑 שומרים לארבעה ממצאים שתוקנו ב-17.9 ולא סומנו');
ok('ממצא 07 — "שליחת הבקשה" היא ה-CTA, והתשלום משני',
   /class="btn-primary" id="rc-pay-continue">שליחת הבקשה/.test(RES) &&
   /club-pay__btn--ghost/.test(RES));
ok('ממצא 07 — והכותרת כבר לא מציגה תשלום כתנאי מעבר',
   !/לפני שממשיכים — תשלום/.test(RES.replace(/\/\*[\s\S]*?\*\//g, '')));
ok('ממצא 08 — אישור פותח חלון סיווג ולא מגירת עריכה מלאה',
   /if \(t\.status === "submitted" \|\| t\.status === "review"\) \{\s*txOpenClassifyModal/.test(EXP));
ok('ממצא 08 — והסטטוס מתקדם תמיד', /txOpenClassifyModal/.test(EXP));
ok('ממצא 09 — מחיקת תנועה שולחת את הקבלה לסל המיחזור',
   /if \(link\) trashDriveFile_\(link\);/.test(GS));
ok('ממצא 09 — ⚠️ סל מיחזור ולא מחיקה סופית',
   /trashDriveFile_` הוא \*\*סל מיחזור ולא מחיקה סופית\*\*/.test(GS));
ok('ממצא 09 — והקישור נקרא לפני מחיקת השורה',
   GS.indexOf("var cLink = headers.indexOf('קישור קבלה')") <
   GS.indexOf('if (link) trashDriveFile_(link);'));
ok('ממצא 14 — יש פעולת מחיקת משק בית בשרת',
   /function deleteResidentRow_\(ss, body\)/.test(GS));
ok('ממצא 14 — עם הרשאה ייעודית', /deleteResidentRow: PERM_RESIDENTS/.test(GS));
ok('ממצא 14 — והיא מחוברת למסך התושבים', /CBA\.data\.deleteResidentRow\(rowIndex/.test(RSD));

section('5. 🔴 `repId` תמיד קיים — שדה חסר אינו "ריק"');
/* נצפה בייצור: משימות 60 ו-64, שדין ארגיל פתח בעצמו, יצאו מהסנכרון
   **בלי השדה בכלל**. הדפדפן כותב `repId: ""`, והשרת השמיט — שתי
   צורות לאותה משמעות. בכללי האבטחה `resource.data.repId is string`
   על שדה חסר הוא **שגיאה**, לא `false`; וכל קוד שנוגע בשדה היה צריך
   להכיר את שני המקרים. מהיום צורה אחת. */
ok('🔴 gardenTaskDoc_ ממלא repId ריק כשאין דיווח',
   /if \(d\.repId === undefined \|\| d\.repId === null\) d\.repId = '';/.test(GS));
ok('🔴 ושתי נקודות הסנכרון כותבות אותו תמיד',
   (GS.match(/doc\.repId = refs\.repOf\[o\.id\] \|\| '';/g) || []).length === 2);
ok('⚠️ ולא נשארה השמה מותנית שמשמיטה את השדה',
   !/if \(refs\.repOf\[o\.id\]\) doc\.repId/.test(GS));
ok('⚠️ הדפדפן כבר כתב אותו תמיד — שתי הצורות התלכדו',
   /repId: ""/.test(R('js/data/dataService.js')));
ok('🔑 והמסך גוזר "תקלת צוות" מהיעדר ערך, כך שגם ריק וגם חסר נקראים נכון',
   /!t\.repId/.test(GT));

console.log('\n' + (fail ? '✗' : '✓') + '  עברו ' + pass + ' · נכשלו ' + fail);
process.exit(fail ? 1 : 0);
