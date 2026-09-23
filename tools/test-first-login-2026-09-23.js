/* הערב של דר (23.9.26) — שני התיקונים הראשונים.
   הרצה:  node tools/test-first-login-2026-09-23.js

   1. פאנל "נסה שוב" אחד ברור כשהטעינה הראשונה נכשלה (bootDataFailed),
      במקום 46 קריאות שנכשלות בשקט כל אחת בדרכה.
   2. בחירת משבצת בשריון המועדון היא **שקטה** — לא "שומר…", לא "הפעולה
      מתעכבת" אחרי 45 שניות של מילוי טופס (דיווח 21). החיווי מוצג רק סביב
      השליחה עצמה. */
const fs = require('fs');
const path = require('path');
const APP = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(APP, f), 'utf8');
const app = read('js/app.js');
const resident = read('js/screens/resident.js');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);

section('1. app.js — פאנל הטעינה הראשונה');
ok('הדגל bootDataFailed מוגדר', /var bootDataFailed = false;/.test(app));
ok('🔴 נדלק ב-sheetsLoadHandler רק כשהמטען נכשל **ואין** נתונים',
   /bootDataFailed = !ok && !CBA\.sheets\.isConnected\(\);/.test(app));
ok('⚠️ ולא בתוך ענף המטמון (source === "cache" יוצא לפני)',
   app.indexOf('info.source === "cache"') < app.indexOf('bootDataFailed = !ok'));
ok('נכבה ברגע שיש חיבור — בכל showScreen',
   /if \(CBA\.sheets\.isConnected\(\)\) bootDataFailed = false;/.test(app));
ok('🔴 השער ב-showScreen: הדגל דלוק ⇒ הפאנל, לכל מסך',
   /if \(bootDataFailed\) \{[\s\S]{0,900}?dataUnavailableHTML\([\s\S]{0,300}?wireDataRetry\(main\);/.test(app));
ok('השער הישן של מסכי התקציב נשאר אחריו',
   /\} else if \(screenNeedsBudget\(name\) && !CBA\.sheets\.isConnected\(\)\) \{/.test(app));
ok('לפאנל כותרת משלו ("הנתונים עדיין לא נטענו")', /"הנתונים עדיין לא נטענו"/.test(app));
ok('dataUnavailableHTML מקבל כותרת אופציונלית ומקודד אותה',
   /function dataUnavailableHTML\(sub, title\)[\s\S]{0,300}?CBA\.esc\(title \|\| /.test(app));
ok('⚠️ האתחול עדיין לא עוצר (אין return מוקדם על source none) — ההחלטה מ-14.9 נשמרת',
   !/source === "none"[\s\S]{0,400}?return;/.test(app));
ok('הכשל נרשם לשובל האבחון', /CBA\.diag\.log\("הטעינה הראשונה נכשלה/.test(app));

/* הרצה של הפונקציה dataUnavailableHTML כפי שהיא */
{
  const m = app.match(/function dataUnavailableHTML\(sub, title\) \{[\s\S]*?\n  \}/);
  const fn = new Function('CBA', m[0] + '; return dataUnavailableHTML;')({ esc: s => String(s).replace(/</g, '&lt;') });
  ok('בלי כותרת — כותרת התקציב הישנה', /לא הצלחנו לטעון את נתוני התקציב/.test(fn()));
  ok('עם כותרת — הכותרת החדשה מופיעה והישנה לא',
     /הנתונים עדיין לא נטענו/.test(fn('x', 'הנתונים עדיין לא נטענו')) && !/נתוני התקציב/.test(fn('x', 'הנתונים עדיין לא נטענו')));
  ok('כפתור "נסה שוב" קיים בשני המקרים', /data-data-retry/.test(fn()) && /data-data-retry/.test(fn('a', 'b')));
  ok('הכותרת עוברת esc', /&lt;b>/.test(fn('a', '<b>')));
}

section('2. resident.js — שריון מועדון בלי "הפעולה מתעכבת"');
ok('🔴 בחירת משבצת: markDirty שקט (label:false)',
   /CBA\.sheets\.markDirty\("clubReserveSelect", false\)/.test(resident));
ok('⚠️ ואין יותר קריאה רועשת לאותה סיבה',
   !/markDirty\("clubReserveSelect"\)/.test(resident));
ok('השליחה עצמה מסומנת עם תווית "שולח בקשה…"',
   /markDirty\("clubReserveSend", "שולח בקשה…"\)/.test(resident));
ok('והתווית מנוקה בתחילת ה-callback של reserveClub — בהצלחה ובכישלון',
   /CBA\.data\.reserveClub\(payload, function \(res\) \{\s*\n\s*if \(CBA\.sheets\.clearDirty\) CBA\.sheets\.clearDirty\("clubReserveSend"\);/.test(resident));
ok('hideForm עדיין מנקה את הבחירה (ההגנה מרענון רקע נשארת)',
   /function hideForm\(\)[^\n]*clearDirty\("clubReserveSelect"\)/.test(resident));

/* התנהגות: המנוע של sheets.js — סיבה שקטה חוסמת רענון אבל לא מדליקה חיווי */
{
  const sheets = read('js/data/sheets.js');
  const pick = name => { const m = sheets.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}')); return m && m[0]; };
  const src = ['isDirty', 'isBusyVisible', 'notifyDirtyChange', 'markDirty', 'clearDirty', 'currentBusyLabel'].map(pick).join('\n');
  ok('הפונקציות חולצו', /function markDirty/.test(src) && /function isBusyVisible/.test(src));
  const events = [];
  const ctx = new Function('window', 'CustomEvent',
    'var dirtyReasons = {}, dirtySince = {}, inFlightWrites = 0, lastDirtyState = false, lastWriteHadError = false, lastWriteErrorMsg = "";' +
    src + '; return { markDirty, clearDirty, isDirty, isBusyVisible };')(
    { dispatchEvent: e => events.push(e.detail) },
    function (t, o) { this.detail = o.detail; });
  ctx.markDirty('clubReserveSelect', false);
  ok('🔴 בחירה שקטה: isDirty (חוסם רענון) אבל **לא** isBusyVisible (אין חיווי)',
     ctx.isDirty() && !ctx.isBusyVisible());
  ok('ולא נשלח אירוע dirty-change (הכותרת לא מציגה "שומר…")', events.length === 0, String(events.length));
  ctx.markDirty('clubReserveSend', 'שולח בקשה…');
  ok('שליחה: החיווי נדלק עם התווית הנכונה', events.length === 1 && events[0].dirty && events[0].label === 'שולח בקשה…', JSON.stringify(events));
  ctx.clearDirty('clubReserveSend');
  ok('אחרי השליחה החיווי כבה, והבחירה עדיין מוגנת', events.length === 2 && !events[1].dirty && ctx.isDirty());
  ctx.clearDirty('clubReserveSelect');
  ok('hideForm ⇒ לא dirty בכלל', !ctx.isDirty());
}

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
