/* בדיקות לצירוף ספירת הגינון לקריאה המאוחדת (2026-09-15, צעד 07).
   הרצה:  node tools/test-home-garden-count.js

   🔴 מה נבדק ולמה: `gardenTasks` הייתה הקריאה השלישית והאחרונה שנשארה בתור
   העלייה אחרי צעד 06 — 3.6–5.2 שניות עבור **מספר אחד** (`rows.length`).
   היא עוברת ל-`homeExtras`, אבל כמספר ולא כשורות.

   ⚠️ שתי המלכודות שהכתיבו את העיצוב, שתיהן מתועדות כבר בקוד עצמו:
     1. **`gardenTs` היא חותמת נפרדת מ-`ts`** — היא הופרדה ב-9.9 בדיוק כי
        `primeHomeExtras` לא הביאה גינון. מי שמזריע עכשיו חייב לעדכן גם אותה,
        אחרת ההזרעה לא משנה כלום. ומנגד — התנאי של היציאה המוקדמת חייב לכלול
        `gardenFresh()`, אחרת מטמון משותף טרי ידלג על הקריאה והגינון יישלח
        בנפרד. זו אותה מלכודת משני צדדיה.
     2. **`pending: 0` היא תשובה תקפה.** בדיקה על המספר ולא על `ok` הייתה
        מזמינה קריאה נוספת בכל פעם שאין משימות ממתינות. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const HOME = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'home.js'), 'utf8');

/* ================= צד השרת ================= */
const sandbox = {
  console,
  Utilities: { formatDate: d => d.toISOString().substring(0, 10), getUuid: () => 'x',
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => null }), flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);

section('1. השרת — הרחבת handleHomeExtras_');
ok('gardenPendingParams_ קיימת', typeof sandbox.gardenPendingParams_ === 'function');
{
  const src = { session: 's1', action: 'homeExtras', week: '2026-09-14' };
  const out = sandbox.gardenPendingParams_(src);
  ok('כופה scope=pending', out.scope === 'pending', out.scope);
  ok('משמר את שאר הפרמטרים', out.session === 's1' && out.week === '2026-09-14');
  ok('🔴 אינה משנה את המקור (הדלפה למקטע הבא)', src.scope === undefined, String(src.scope));
  ok('המקור לא איבד שדות', Object.keys(src).length === 3);
}
ok('🔴 המקטע מגודר ב-PERM_GARDEN', /if \(has\(PERM_GARDEN\)\) \{/.test(CODE));
ok('🔴 מחזיר מספר ולא שורות', /out\.garden = \{ ok: true, pending: \(g\.rows \|\| \[\]\)\.length \}/.test(CODE));
ok('🔴 הספירה נגזרת מ-handleGardenTasks_ ולא מתנאי מקביל',
   /handleGardenTasks_\(gardenPendingParams_\(pp\)\)/.test(CODE));
ok('כשל של המקטע לא מוסיף garden', /if \(g && g\.ok\) out\.garden/.test(CODE));
ok('המקטע רץ אחרי gym/club ולפני ה-return',
   CODE.indexOf('if (has(PERM_GARDEN)) {') > CODE.indexOf('out.club = sub(handleClubList_)'));
{
  // handleGardenTasks_ עדיין חוסם pending למשתמש חיצוני — הבסיס שעליו נשען הגידור
  ok('🔴 pending עדיין נחסם למשתמש חיצוני ב-handleGardenTasks_',
     /if \(perm\.isExternal && scope !== 'week' && scope !== 'unplanned' && scope !== 'all'\) scope = 'week';/.test(CODE));
}

section('2. הלקוח — ההזרעה');
ok('primeHomeExtras מזריעה את הספירה', /res\.garden && res\.garden\.ok/.test(HOME));
ok('🔴 ומעדכנת גם את gardenTs', /lazyCache\.garden = Number\(res\.garden\.pending\) \|\| 0;[\s\S]{0,80}lazyCache\.gardenTs = Date\.now\(\);/.test(HOME));
ok('🔴 הבדיקה על ok ולא על המספר (pending:0 תקף)',
   !/res\.garden && res\.garden\.pending\b/.test(HOME));
ok('🔴 היציאה המוקדמת כוללת את הגינון',
   /cacheFresh\(\) && resvFresh\(\) && \(!can\("גינון"\) \|\| gardenFresh\(\)\)/.test(HOME));
ok('gardenFresh עדיין לפי החותמת הנפרדת',
   /function gardenFresh\(\) \{ return lazyCache\.gardenTs/.test(HOME));
ok('🔴 המסלול הישן נשאר — הקריאה הנפרדת לא נמחקה',
   /CBA\.data\.getGardenTasks\(\{ scope: "pending" \}/.test(HOME));

section('3. 🔴 סימולציה — מה קורה בפועל לכל סוג תשובה');
/* מריצים את שלוש השורות של ההזרעה מול תשובות שונות, כדי לוודא שהמצב
   שנוצר הוא זה שמכתיב אם הקריאה הנפרדת תצא. */
function seed(res) {
  const lazyCache = { garden: null, gardenTs: 0 };
  const now = 1000000;
  if (res && res.garden && res.garden.ok) {
    lazyCache.garden = Number(res.garden.pending) || 0;
    lazyCache.gardenTs = now;
  }
  return { count: lazyCache.garden, fresh: !!lazyCache.gardenTs };
}
{
  const r = seed({ ok: true, homeExtras: true, garden: { ok: true, pending: 4 } });
  ok('שרת חדש עם 4 ממתינות — נטען ולא ייקרא שוב', r.count === 4 && r.fresh);
}
{
  const r = seed({ ok: true, homeExtras: true, garden: { ok: true, pending: 0 } });
  ok('🔴 אפס ממתינות — עדיין "טרי", לא קריאה נוספת', r.count === 0 && r.fresh === true);
}
{
  const r = seed({ ok: true, homeExtras: true });                        // שרת ישן
  ok('🔴 שרת ישן — לא טרי, הקריאה הנפרדת תצא כרגיל', r.count === null && r.fresh === false);
}
{
  const r = seed({ ok: true, homeExtras: true, garden: { ok: false, error: 'אין הרשאה' } });
  ok('🔴 מקטע שנכשל — נופל למסלול הישן ולא מצייר אפס שקרי', r.count === null && r.fresh === false);
}
{
  const r = seed({ ok: true, homeExtras: true, garden: { ok: true } });  // pending חסר
  ok('pending חסר נספר כאפס ולא כ-NaN', r.count === 0 && r.fresh === true);
}

section('4. לא נשבר כלום ממה שכבר עבד');
ok('ההזרעה של הסיור עדיין שם', /CBA\.tour\.seed\(res\.tour\)/.test(HOME));
ok('ההזרעה של המועדון עדיין שם', /CBA\.seedClubAlerts\(res\.club\)/.test(HOME));
ok('שער ההזרעה של צעד 06 לא נגוע', /finally \{ hxSettle\(\); \}/.test(
   fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8')));
ok('homeExtras עדיין דורשת מושב חתום (authorize_ עם null)',
   /function handleHomeExtras_\(p\) \{[\s\S]{0,300}authorize_\(ss, p, null\)/.test(CODE));

console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
