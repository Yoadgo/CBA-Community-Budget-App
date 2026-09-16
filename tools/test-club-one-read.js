
/* בדיקות ל"קריאת יומן אחת במקום שתיים" (2026-09-16, פעולה 1).
   הרצה:  node tools/test-club-one-read.js

   מריץ את clubClipEvents_ / clubPendingCount_ / handleMyClubReservations_
   **האמיתיים** מ-apps-script/Code.gs מול יומן מדומה שסופר כמה פעמים
   נקרא.

   🔴🔴 מה המארז שומר עליו:

     1. **קריאה אחת, לא שתיים.** זה כל העניין: homeExtras קראה את
        יומן Google פעמיים באותה בקשה (~1.5 שניות כל אחת), ושתיהן
        מחזירות את אותם אירועים.

     2. **המשמעות לא השתנתה.** clubClipEvents_ חייבת להחזיר בדיוק
        את מה ש-getEvents היה מחזיר לחלון הקצר — כלומר לפי **חפיפה**
        (אירוע שמסתיים בתוך החלון נכלל גם אם התחיל לפניו), ולא לפי
        "מתי התחיל". אחרת שריון שנמשך יומיים היה נעלם מהמסך של
        התושב בלי שום שגיאה.

     3. **הנפילה לאחור עובדת.** בלי הפרמטר, כל פונקציה קוראת את
        היומן בעצמה בדיוק כמו קודם — ולכן doGet ישיר לא נשבר ואין
        תלות בסדר הדיפלוי.

     4. **החלונות עצמם לא זזו** — 7 ימים אחורה לספירה, יום אחד
        אחורה לתושב, 180 קדימה. צמצום חלון הוא שינוי משמעות, לא
        אופטימיזציה. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');

const grab = re => { const m = GS.match(re); if (!m) throw new Error('לא נמצא: ' + re); return m[0]; };

const DAY = 24 * 3600 * 1000;
const NOW = Date.now();

/* אירוע מדומה — מחזיר רק את מה שהקוד באמת קורא ממנו */
function ev(startDays, endDays, tags) {
  tags = tags || {};
  return {
    getId: () => 'ev' + startDays,
    getStartTime: () => new Date(NOW + startDays * DAY),
    getEndTime:   () => new Date(NOW + endDays * DAY),
    getTag: k => (tags[k] === undefined ? null : tags[k])
  };
}

/* יומן מדומה שסופר קריאות ומכבד את גבולות החלון, כמו getEvents האמיתי:
   אירוע מוחזר אם הוא **חופף** לטווח המבוקש. */
function makeCal(all) {
  const calls = [];
  return {
    calls,
    cal: {
      getEvents: (from, to) => {
        calls.push({ from: from.getTime(), to: to.getTime() });
        return all.filter(e => e.getEndTime().getTime() > from.getTime() &&
                               e.getStartTime().getTime() < to.getTime());
      }
    }
  };
}

function sandbox(all) {
  const m = makeCal(all);
  const box = {
    String, Date, JSON, Math,
    CLUB_CALENDAR_ID: 'cal-id',
    CalendarApp: { getCalendarById: id => (id === 'cal-id' ? m.cal : null) },
    json_: o => o,
    /* זהות מדומה: "שלי" = אירוע שהתגית family שלו היא 'mine' */
    clubIdentity_: () => ({
      email: 'me@x', keys: ['mine'],
      matches: (email, family) => family === 'mine'
    })
  };
  vm.createContext(box);
  vm.runInContext([
    grab(/var CLUB_BACK_DAYS_ALL[\s\S]*?var CLUB_FWD_DAYS\s*=\s*180;/),
    grab(/function clubWindowEvents_\(backDays\) \{[\s\S]*?\n\}/),
    grab(/function clubClipEvents_\(evs, backDays\) \{[\s\S]*?\n\}/),
    grab(/function clubStatusOf_\(ev\) \{[\s\S]*?\n\}/),
    grab(/function clubPendingCount_\(evs\) \{[\s\S]*?\n\}/),
    grab(/function handleMyClubReservations_\(p, evs\) \{[\s\S]*?\n\}/)
  ].join('\n\n'), box);
  return { box, calls: m.calls };
}

/* ---------- אוסף אירועים אחד לכל הבדיקות ---------- */
const ALL = [
  ev(-6, -6 + 0.1, { family: 'mine',  status: 'approved' }), // לפני 6 ימים — בחלון הרחב בלבד
  ev(-5, -5 + 0.1, { family: 'other', status: 'pending'  }), // ממתין ישן — נספר
  ev(-2, 0.2,      { family: 'mine',  status: 'approved' }), // התחיל לפני יומיים ונמשך עד מחר
  ev(1, 1.2,       { family: 'mine',  status: 'pending'  }),
  ev(3, 3.2,       { family: 'other' }),                      // בלי תגית סטטוס = מאושר
  ev(10, 10.2,     { family: 'other', status: 'pending'  })
];

section('1. 🔴 קריאה אחת, לא שתיים');
{
  const s = sandbox(ALL);
  const evs = s.box.clubWindowEvents_(s.box.CLUB_BACK_DAYS_ALL);
  const before = s.calls.length;
  s.box.clubPendingCount_(evs);
  s.box.handleMyClubReservations_({ session: 'x' }, evs);
  ok('🔴🔴 שני הצרכנים לא נוגעים ביומן כשהאירועים כבר בידם',
     s.calls.length === before, 'נוספו ' + (s.calls.length - before) + ' קריאות');
  ok('ובסך הכול קריאה אחת לבקשה', s.calls.length === 1, String(s.calls.length));
}

section('2. 🔴 והמשמעות לא השתנתה — צמצום לפי חפיפה');
{
  const s = sandbox(ALL);
  const wide = s.box.clubWindowEvents_(s.box.CLUB_BACK_DAYS_ALL);
  const clipped = s.box.clubClipEvents_(wide, s.box.CLUB_BACK_DAYS_MINE);
  /* מה ש-getEvents היה מחזיר לחלון הקצר, אמת המידה */
  const s2 = sandbox(ALL);
  const direct = s2.box.clubWindowEvents_(s2.box.CLUB_BACK_DAYS_MINE);
  ok('🔴🔴 הצמצום זהה לקריאה ישירה בחלון הקצר',
     JSON.stringify(clipped.map(e => e.getId())) === JSON.stringify(direct.map(e => e.getId())),
     clipped.map(e => e.getId()).join(',') + ' מול ' + direct.map(e => e.getId()).join(','));
  ok('🔴 אירוע שהתחיל לפני יומיים ונמשך עד מחר — **נשאר**',
     clipped.some(e => e.getId() === 'ev-2'));
  ok('ואירוע שנגמר לפני חמישה ימים — יוצא', !clipped.some(e => e.getId() === 'ev-5'));
  ok('⚠️ והחלון הרחב עדיין מכיל אותו — ולכן הספירה רואה אותו',
     wide.some(e => e.getId() === 'ev-5'));
}

section('3. הספירה והרשימה מסכימות עם עצמן');
{
  const s = sandbox(ALL);
  const evs = s.box.clubWindowEvents_(s.box.CLUB_BACK_DAYS_ALL);
  ok('שלושה ממתינים בחלון הרחב', s.box.clubPendingCount_(evs) === 3,
     String(s.box.clubPendingCount_(evs)));
  const mine = s.box.handleMyClubReservations_({ session: 'x' }, evs);
  ok('הרשימה של התושב מסננת לפי הזהות שלו', mine.ok === true &&
     mine.reservations.length === 2, JSON.stringify(mine.reservations && mine.reservations.length));
  ok('⚠️ ומסודרת לפי זמן', mine.reservations[0].start < mine.reservations[1].start);
  ok('⚠️ אירוע בלי תגית סטטוס נחשב מאושר',
     s.box.clubStatusOf_(ev(3, 3.2, {})) === 'approved');
}

section('4. 🔴 נפילה לאחור — בלי הפרמטר, כמו קודם בדיוק');
{
  const s = sandbox(ALL);
  ok('clubPendingCount_ בלי פרמטר קוראת את היומן בעצמה',
     s.box.clubPendingCount_() === 3 && s.calls.length === 1, String(s.calls.length));
  const s2 = sandbox(ALL);
  const r = s2.box.handleMyClubReservations_({ session: 'x' });
  ok('handleMyClubReservations_ בלי פרמטר קוראת בעצמה — ובחלון הקצר',
     r.ok === true && s2.calls.length === 1 &&
     Math.round((NOW - s2.calls[0].from) / DAY) === 1,
     JSON.stringify(s2.calls));
}

section('5. יומן חסר לא מפיל את עמוד הבית');
{
  const box = { String, Date, JSON, Math, CLUB_CALENDAR_ID: 'cal-id',
    CalendarApp: { getCalendarById: () => null },
    json_: o => o, clubIdentity_: () => ({ email: 'me@x', keys: [], matches: () => false }) };
  vm.createContext(box);
  vm.runInContext([
    grab(/var CLUB_BACK_DAYS_ALL[\s\S]*?var CLUB_FWD_DAYS\s*=\s*180;/),
    grab(/function clubWindowEvents_\(backDays\) \{[\s\S]*?\n\}/),
    grab(/function clubClipEvents_\(evs, backDays\) \{[\s\S]*?\n\}/),
    grab(/function clubStatusOf_\(ev\) \{[\s\S]*?\n\}/),
    grab(/function clubPendingCount_\(evs\) \{[\s\S]*?\n\}/)
  ].join('\n\n'), box);
  ok('🔴 אין יומן ⇒ 0, לא חריגה', box.clubPendingCount_() === 0);
  ok('ו-clubWindowEvents_ מחזירה null', box.clubWindowEvents_(7) === null);
}

section('6. homeExtras — קריאה אחת שמוזנת לשניהם');
{
  const he = GS.match(/function handleHomeExtras_\(p\) \{[\s\S]*?\n\}\n/)[0];
  ok('🔴🔴 קוראת את היומן פעם אחת בלבד',
     (he.match(/clubWindowEvents_\(/g) || []).length === 1,
     String((he.match(/clubWindowEvents_\(/g) || []).length));
  ok('ומעבירה את אותם אירועים לרשימה של התושב',
     /handleMyClubReservations_\(pp, clubEvents\)/.test(he));
  ok('ולספירת הממתינים', /clubPendingCount_\(clubEvents\)/.test(he));
  ok('⚠️ ואף אחד מהם לא קורא ל-CalendarApp ישירות מתוך homeExtras',
     !/CalendarApp\./.test(he));
  ok('⚠️ וכישלון בקריאה לא מפיל את הבקשה', /catch \(e\) \{ clubEvents = null; \}/.test(he));
}

section('7. ⚠️ החלונות עצמם לא זזו');
ok('7 ימים אחורה לספירה', /var CLUB_BACK_DAYS_ALL\s*=\s*7;/.test(GS));
ok('יום אחד אחורה לתושב', /var CLUB_BACK_DAYS_MINE\s*=\s*1;/.test(GS));
ok('180 יום קדימה', /var CLUB_FWD_DAYS\s*=\s*180;/.test(GS));
ok('🔴 והגדרה אחת לכולם — גם רשימת הניהול עברה אליה',
   /function handleClubList_[\s\S]{0,400}clubWindowEvents_\(CLUB_BACK_DAYS_ALL\)/.test(GS));

console.log('\n' + (fail ? '❌' : '✅') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
