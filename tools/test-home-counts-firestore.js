
/* בדיקות למוני עמוד הבית כמסמכי Firestore (2026-09-16, פעולה 3).
   הרצה:  node tools/test-home-counts-firestore.js

   מריץ את homeCountsDoc_ / homeCountsWrite_ / homeCountsBump_ /
   gardenPendingCount_ **האמיתיים** מ-apps-script/Code.gs, ואת
   getHomeCountsFast האמיתית מ-js/data/dataService.js.

   🔴🔴 מה המארז שומר עליו:

     1. **מסמך לכל הרשאה.** כלל Firestore פועל על מסמך שלם ולא על
        שדה. מסמך אחד עם חמש הספירות היה נותן למנהל המכון גם את
        מספר בקשות ההרשמה הממתינות — הרחבה שקטה מעבר למה שהשרת
        נותן לו היום. איחוד המסמכים הוא באג אבטחה, לא שיפור.

     2. **חישוב מחדש, לא ±1.** מונה שסופר את עצמו סוטה — מכתיבה
        שנכשלה, ממריצה כפולה, ומעריכה ידנית בגיליון — והסטייה
        שקטה. הספירה כבר קוראת עמודה אחת בלבד, ולכן אין מה לחסוך.

     3. **רענון תגית לעולם לא מפיל שמירה.** homeCountsBump_ רצה
        בתוך נתיב כתיבה שכבר הצליח. חריגה שלה הייתה הופכת שמירה
        מוצלחת לשגיאה על המסך.

     4. **המסלול המהיר לא מבטל את homeExtras.** הוא נדרש בכל מקרה
        לכרטיס "יש משהו חדש" ולשריון הקרוב, והתשובה שלו היא
        הקובעת. אילו המסלול המהיר היה מסמן את המטמון כטרי,
        homeExtras לא היה יוצא כלל — ושני הדברים האלה היו נעלמים.

     5. **הדגל נבדק אחרי ensureDb.** לפני כן flag() מחזיר את ברירת
        המחדל שבקוד ולא את הדגל החי — נתפס חי ב-15.9. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DS = R('js/data/dataService.js');
const HOME = R('js/screens/home.js');
const APP = R('js/app.js');
const grab = re => { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };

/* ---------- ארגז חול לצד השרת ---------- */
function serverBox(opts) {
  opts = opts || {};
  const log = { writes: [], counted: [] };
  const box = {
    String, Number, Date, JSON, parseInt, isNaN,
    SIGNUPS_SHEET: 'בקשות הרשמה', PROFILE_SHEET: 'בקשות שינוי',
    GYM_SHEET: 'מכון כושר', GYM_ST_VERIFY: 'ממתין לאימות',
    GARDEN_TASKS_SHEET: 'משימות גינון',
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ _fake: true }) },
    countStatus_: (ss, sheet, header, wanted) => {
      log.counted.push(sheet + '/' + wanted);
      return ({ 'בקשות הרשמה': 3, 'בקשות שינוי': 1, 'מכון כושר': 2 })[sheet] || 0;
    },
    clubPendingCount_: () => { log.counted.push('יומן'); return 4; },
    gardenCols_: () => ({ 'מזהה': 0, 'דגל': 1, 'סגירה': 2 }),
    gardenCell_: v => String(v == null ? '' : v).trim(),
    gardenTaskObj_: (row) => ({ flag: row[1], closure: row[2] }),
    fsSet_: (p, doc) => {
      if (opts.failOn && p.indexOf(opts.failOn) !== -1) throw new Error('כתיבה נכשלה');
      log.writes.push({ path: p, doc: doc });
    }
  };
  vm.createContext(box);
  vm.runInContext([
    grab(/var FS_HOME_COUNTS = 'homeCounts';/),
    grab(/function gardenTaskIsPending_\(o\) \{[\s\S]*?\n\}/),
    grab(/function gardenPendingCount_\(ss\) \{[\s\S]*?\n\}/),
    grab(/function homeCountsDoc_\(ss, domain\) \{[\s\S]*?\n\}/),
    grab(/var HOME_COUNT_LIVE_DOMAINS[\s\S]*?var HOME_COUNT_ALL_DOMAINS\s*=\s*\[[^\]]*\];/),
    grab(/function homeCountsWrite_\(ss, domains\) \{[\s\S]*?\n\}/),
    grab(/function homeCountsSyncAll_\(ss\) \{[\s\S]*?\n\}/),
    grab(/function homeCountsBump_\(domains\) \{[\s\S]*?\n\}/)
  ].join('\n\n'), box);
  return { box, log };
}

section('1. 🔴🔴 מסמך לכל הרשאה — לא מסמך אחד');
{
  const s = serverBox();
  const ss = { _fake: true };
  const res = s.box.homeCountsDoc_(ss, 'residents');
  ok('residents נושא את שתי הספירות של אותה הרשאה',
     res.signups === 3 && res.profile === 1, JSON.stringify(res));
  ok('gym נושא רק את שלו', JSON.stringify(Object.keys(s.box.homeCountsDoc_(ss, 'gym')).sort()) ===
     JSON.stringify(['pending', 'schema', 'updatedAt'].sort()));
  ok('🔴🔴 ובמסמך של המכון אין שום ספירה אחרת',
     s.box.homeCountsDoc_(ss, 'gym').signups === undefined &&
     s.box.homeCountsDoc_(ss, 'gym').profile === undefined);
  ok('club נקרא מהיומן', s.box.homeCountsDoc_(ss, 'club').pending === 4);
  ok('⚠️ ותחום לא מוכר מחזיר null ולא מסמך ריק', s.box.homeCountsDoc_(ss, 'אחר') === null);
  ok('⚠️ ולכל מסמך יש schema ו-updatedAt (דרישת שיטת העבודה)',
     s.box.homeCountsDoc_(ss, 'garden').schema === 1 &&
     s.box.homeCountsDoc_(ss, 'garden').updatedAt instanceof Date);
}

section('2. 🔴 ספירת הגינון — נקודת גזירה אחת עם המסך');
{
  const s = serverBox();
  const rows = [
    ['כותרת', '', ''],
    ['1', 'ממתין לאישור', ''],
    ['2', 'ממתין לאישור', 'אושר'],        /* סגורה — לא נספרת */
    ['3', 'דורש בדיקה בשטח', ''],
    ['', 'ממתין לאישור', ''],             /* בלי מזהה — לא שורה */
    ['5', 'ממתין לאישור', '']
  ];
  const ss = { getSheetByName: () => ({ getLastRow: () => rows.length,
                                        getDataRange: () => ({ getValues: () => rows }) }) };
  ok('סופרת רק את הממתינות והפתוחות', s.box.gardenPendingCount_(ss) === 2,
     String(s.box.gardenPendingCount_(ss)));
  ok('🔴 והתנאי עצמו יושב בפונקציה אחת', /function gardenTaskIsPending_\(o\) \{/.test(GS));
  ok('🔴🔴 והמסך קורא ממנה גם הוא — לא מתנאי מקביל',
     /scope === 'pending'\) \{ if \(gardenTaskIsPending_\(o\)\) rows\.push\(o\); \}/.test(GS) &&
     (GS.match(/o\.flag === 'ממתין לאישור'/g) || []).length === 1,
     String((GS.match(/o\.flag === 'ממתין לאישור'/g) || []).length));
  const empty = { getSheetByName: () => null };
  ok('⚠️ טאב חסר ⇒ 0, לא חריגה', s.box.gardenPendingCount_(empty) === 0);
}

section('3. הכתיבה — נתיב לכל תחום, וכשל אחד לא מפיל את השאר');
{
  const s = serverBox();
  const out = s.box.homeCountsSyncAll_({ getSheetByName: () => null });
  ok('ארבעה מסמכים נכתבו', out.wrote === 4, String(out.wrote));
  ok('🔴 והנתיבים הם homeCounts/<תחום>',
     JSON.stringify(s.log.writes.map(w => w.path)) ===
     JSON.stringify(['homeCounts/residents', 'homeCounts/gym', 'homeCounts/garden', 'homeCounts/club']),
     JSON.stringify(s.log.writes.map(w => w.path)));
  const s2 = serverBox({ failOn: 'gym' });
  const out2 = s2.box.homeCountsSyncAll_({ getSheetByName: () => null });
  ok('🔴 כשל בתחום אחד לא מפיל את השאר', out2.wrote === 3 && out2.errors.length === 1,
     JSON.stringify(out2));
}

section('4. 🔴 הרענון בכתיבה — והמוועדון שבמכוון מחוץ לו');
{
  const s = serverBox();
  s.box.homeCountsBump_(['residents']);
  ok('תחום שזז נכתב', s.log.writes.length === 1 && s.log.writes[0].path === 'homeCounts/residents',
     JSON.stringify(s.log.writes.map(w => w.path)));
  const s2 = serverBox();
  s2.box.homeCountsBump_(['club']);
  ok('🔴 המועדון **אינו** נכתב בכתיבה — 187 ימי יומן על נתיב של משתמש',
     s2.log.writes.length === 0, JSON.stringify(s2.log.writes.map(w => w.path)));
  ok('⚠️ אבל הוא כן ברשימת החישוב המלא', s2.box.HOME_COUNT_ALL_DOMAINS.indexOf('club') !== -1);
  const s3 = serverBox();
  s3.box.homeCountsBump_(['budget', 'other']);
  ok('⚠️ תחום בלי מונה לא מייצר כתיבה', s3.log.writes.length === 0);
  /* 🔴 הדרישה שבלעדיה שמירה מוצלחת הופכת לשגיאה על המסך */
  const s4 = serverBox({ failOn: 'residents' });
  let threw = false;
  try { s4.box.homeCountsBump_(['residents']); } catch (e) { threw = true; }
  ok('🔴🔴 וכשל בכתיבה **לעולם אינו זורק** אל נתיב השמירה', !threw);
}

section('5. החיווט בשרת');
ok('🔴 bumpRev_ מרענן את התחום שזז', /function bumpRev_[\s\S]{0,2000}homeCountsBump_\(doms\);/.test(GS));
ok('⚠️ והוא נקרא אחרי שמפת התחומים כבר נכתבה',
   GS.indexOf('props.setProperty(REV_DOMAINS_KEY') < GS.indexOf('homeCountsBump_(doms)'));
ok('🔴 והעבודה השעתית מחשבת הכול מחדש',
   /function hourlyJobsRun_[\s\S]{0,6000}homeCountsSyncAll_\(ss\)/.test(GS));
ok('⚠️ ולפני הגיבוי המצטבר — מה שנכתב נכנס לגיבוי באותה ריצה',
   GS.indexOf('homeCountsSyncAll_(ss)') < GS.indexOf('fsBackupIncremental_(ss)'));
ok('פעולת זריעה ידנית קיימת ומוגנת במנהל-על',
   /function handleHomeCountsSync_[\s\S]{0,300}authorize_\(ss, p, PERM_SUPER\)/.test(GS) &&
   /homeCountsSync: PERM_SUPER/.test(GS));
ok('ומנותבת ב-doGet', /action === 'homeCountsSync'\) \{\n      return handleHomeCountsSync_\(e\.parameter\);/.test(GS));
ok('🔴 הדגל ברשימה הסגורה', /'homeCountsFromFirestore'\];/.test(GS));
/* ⚠️ אין גיבוי לאוסף הזה — כמו gymStatus, הכול נגזר מהגיליון. */
ok('⚠️ ובמכוון אינו ברשימת הגיבוי (נגזר, לא מקור)',
   !/{ collection: 'homeCounts'/.test(GS));

section('6. הלקוח — הקריאה המהירה');
{
  const src = DS.match(/function getHomeCountsFast\(domains, cb\) \{[\s\S]*?\n  \}/)[0];
  const constSrc = DS.match(/var HOME_COUNTS_FROM_FIRESTORE = (true|false);/)[0];
  function run(opts, cb) {
    const reads = [];
    const box = { String, Number, Date, Object, JSON, console: { log() {} },
      CBA: { fb: {
        readDoc: (c, id, f) => { reads.push(c + '/' + id);
          f(opts.deny && opts.deny.indexOf(id) !== -1 ? { code: 'denied' } : null,
            opts.deny && opts.deny.indexOf(id) !== -1 ? null : { pending: 7, signups: 3, profile: 1 }); },
        ensureDb: f => f(opts.dbErr || null),
        authReady: f => f(opts.noUser ? null : { uid: 'u1' }),
        flag: (k, d) => (opts.flag === undefined ? d : opts.flag)
      } } };
      box.window = box;
      vm.createContext(box);
      vm.runInContext(constSrc + '\n' + src + '\nvar __r = null; getHomeCountsFast(' +
                      JSON.stringify(opts.want || ['residents', 'gym']) +
                      ', function (r) { __r = r; });', box);
      cb(box.__r, reads, box);
  }
  run({ flag: true }, (r, reads) => {
    ok('מחזירה מפה לפי תחום', r && r.residents && r.gym, JSON.stringify(r));
    ok('🔴 וקוראת **רק** את המסמכים שהתבקשו',
       JSON.stringify(reads) === JSON.stringify(['homeCounts/residents', 'homeCounts/gym']),
       JSON.stringify(reads));
  });
  run({ flag: false }, (r, reads) => {
    ok('🔴🔴 דגל כבוי ⇒ null ואפס קריאות', r === null && reads.length === 0, JSON.stringify(reads));
  });
  run({ flag: true, deny: ['gym'] }, (r) => {
    ok('🔴 מסמך שנדחה פשוט חסר — ולא שגיאה',
       r && r.residents && r.gym === undefined, JSON.stringify(r));
  });
  run({ noUser: true }, (r, reads) => {
    ok('אין משתמש ⇒ null', r === null && reads.length === 0);
  });
  run({ dbErr: new Error('x'), flag: true }, (r, reads) => {
    ok('אין חיבור ⇒ null', r === null && reads.length === 0);
  });
  run({ flag: true, want: [] }, (r, reads) => {
    ok('⚠️ רשימה ריקה ⇒ null בלי לגעת ב-SDK', r === null && reads.length === 0);
  });
  ok('🔴🔴 והדגל נבדק **אחרי** ensureDb',
     src.indexOf('ensureDb') < src.indexOf('homeCountsFromFirestore'));
  ok('⚠️ ברירת המחדל בקוד היא false — מדליקים ממסך "מצב המערכת"',
     /var HOME_COUNTS_FROM_FIRESTORE = false;/.test(DS));
}

section('7. 🔴 עמוד הבית — הציור המהיר לא מבטל את הקריאה הקובעת');
ok('seedCountsFast רצה לפני primeHomeExtras',
   HOME.indexOf('seedCountsFast(container);') < HOME.indexOf('primeHomeExtras(function ()'));
ok('🔴🔴 והיא **אינה** נוגעת ב-lazyCache.ts — אחרת homeExtras לא היה יוצא כלל',
   !/function seedCountsFast[\s\S]{0,1400}lazyCache\./.test(HOME));
ok('🔴 והציור המהיר מחליף תוכן ולא את המכל (המזהה חייב לשרוד)',
   /function fastPaint[\s\S]{0,260}slot\.innerHTML = html \|\| "";/.test(HOME) &&
   !/function fastPaint[\s\S]{0,260}outerHTML/.test(HOME));
ok('⚠️ ואינה מציירת למסך שכבר הוחלף', /if \(!slot \|\| !slot\.isConnected\) return;/.test(HOME));
ok('🔴 מבקשת רק את התחומים שיש לה הרשאה אליהם',
   /if \(can\("תושבים"\)\) want\.push\("residents"\);/.test(HOME) &&
   /if \(!want\.length\) return;/.test(HOME));
ok('⚠️ ובוני השורות משותפים למסלול המהיר ולקובע — לא שתי תוויות',
   (HOME.match(/function signupRow\(n\)/g) || []).length === 1 &&
   /fastPaint\(container, "#hm-signups", signupRow\(/.test(HOME) &&
   /done\(slotS, signupRow\(/.test(HOME));
ok('🔴 ותגית המועדון עוברת באותה נקודת כניסה', /CBA\.seedClubAlerts\(\{ ok: true, pending:/.test(HOME));
ok('⚠️ ועמוד הבית נרשם גם על תחום "תושבים" ברישום המסכים',
   /resHome: \["garden", "club", "services", "gym", "budget", "residents"\]/.test(APP));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
