// רענון רקע/עדכון גרסה לא מאפסים מצב ולא מרעננים באמצע עריכה (24.9.2026)
const fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
let fail = 0; const ok = (n, c) => { console.log((c ? '✅ ' : '❌ ') + n); if (!c) fail++; };
const APP = R('js/app.js'), PWA = R('js/pwa.js'), EV = R('js/screens/events.js'), GT = R('js/screens/gardenTasks.js');
ok('showScreen מסמן renderSilent בשני מסלולי הציור', (APP.match(/renderScreenFlagged\(/g) || []).length === 3);
ok('הדגל מנוקה ב-finally', /finally \{ CBA\.renderSilent = false; \}/.test(APP));
ok('כניסה אוטומטית כשכבר מחוברים מתעלמת', /inited && currentUser && resp && \/\^auto\//.test(APP));
ok('שער העדכון בודק מגירה', /getElementById\("cba-drawer"\)/.test(PWA));
ok('שער העדכון בודק שדה בפוקוס בכל הדף', /document\.activeElement/.test(PWA));
ok('שער העדכון בודק נגיעה אחרונה', /msSinceActivity\(\) < 30000/.test(PWA));
ok('לוח אירועים: לוכד silent סינכרונית', /var silentNow = !!CBA\.renderSilent/.test(EV));
ok('לוח אירועים: לא מאפס חודש ברענון שקט', /if \(!\(silentNow && wasShown && state\.currentMonth && !focusDate\)\)/.test(EV));
ok('גינון: שבוע ומסנן נשמרים', /gtMem = \{ mode: mode, week: week, filter: filter \}/.test(GT) && /restoredWeek = true/.test(GT));
ok('גינון: טעינה לא דורסת שבוע משוחזר', /res\.week && !restoredWeek/.test(GT));
process.exit(fail ? 1 : 0);
