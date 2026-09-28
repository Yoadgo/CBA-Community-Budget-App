/* ניווט מובייל v2 (27.9.26) — ר' claude/mobile-nav-spec-2026-09-27.md בפרויקט.
   בודק את מה שיכול להישבר בשקט: מבנה היעדים, מקטעים, שתי רמות בלבד,
   התמזגות לתווית מקטע, בליעת הקליק הכפול בגרירה, וסנכרון הגרסה. */
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const APP = R('js/app.js'), MCSS = R('css/mobile.css'), MJS = R('js/ui/mobile.js'), MOT = R('js/ui/motion.js');
const IDX = R('index.html'), SW = R('service-worker.js');
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); } }

const lit = APP.slice(APP.indexOf('const AREAS_ALL = {') + 'const AREAS_ALL = '.length, APP.indexOf('  // מוצא את מפתח-המסך הראשון'));
const AREAS_ALL = eval('(' + lit.trim().replace(/;\s*$/, '') + ')');
const top = t => Array.isArray(t) ? t[0] : t.group;

ok('תושב: בית · שירותים · מדריך · השיכון · אירועים (28.9)', JSON.stringify(AREAS_ALL.resident.tabs.map(top)) === JSON.stringify(['resHome', 'services', 'guide', 'shikun', 'events']));
ok('מנהל: תקציב · שירותים · מדריך · השיכון', JSON.stringify(AREAS_ALL.admin.tabs.map(top)) === JSON.stringify(['taktziv', 'services', 'guide', 'shikun']));
ok('מדריך (תושב) = ספקים ושירותים + המלצות', JSON.stringify(AREAS_ALL.resident.tabs[2].items.map(i => i[0])) === JSON.stringify(['resServices', 'resRecommendations']));
ok('טאב שהתקפל מקבל סמליל מקטע (מדריך אצל המנהל = ספר)', /return \[items\[0\]\[0\], label, \(oneSec && SECTION_ICON\[oneSec\]\) \|\| ""\];/.test(APP) && /guide: "guide"/.test(APP) && /var ikey = \(t\[2\] && NAV_ICONS\[t\[2\]\]\) \? t\[2\] : t\[0\];/.test(APP));
const groups = AREAS_ALL.resident.tabs.concat(AREAS_ALL.admin.tabs).filter(t => !Array.isArray(t));
ok('שתי רמות בלבד — אין קבוצה בתוך קבוצה', groups.every(g => g.items.every(Array.isArray)));
const svcR = AREAS_ALL.resident.tabs[1].items;
ok('שירותים (תושב) — 6 פריטים בסדר המאושר', JSON.stringify(svcR.map(i => i[0])) === JSON.stringify(['resSubmit', 'resRequests', 'resReserve', 'resGym', 'resWework', 'resGarden']));
ok('מראה שיכון — מקטע משלו, אחרון', svcR[5][2] === 'garden' && svcR.filter(i => i[2] === 'garden').length === 1);
ok('"מועדון משפחות" בשני הצדדים', svcR[2][1] === 'מועדון משפחות' && AREAS_ALL.admin.tabs[1].items[0][1] === 'מועדון משפחות');
ok('כל פריט בקבוצת שירותים מסומן במקטע', groups.filter(g => g.group === 'services').every(g => g.items.every(i => typeof i[2] === 'string' && i[2])));
const allScreens = AREAS_ALL.resident.screens.concat(AREAS_ALL.admin.screens);
ok('כל יעד בניווט רשום כמסך', groups.every(g => g.items.every(i => allScreens.indexOf(i[0]) !== -1)));
ok('גינון במקטע אחד, "נתונים" ראשון', JSON.stringify(AREAS_ALL.admin.tabs[1].items.filter(i => i[2] === 'garden').map(i => i[0])) === JSON.stringify(['gardenStats', 'gardenPlan', 'gardenTasks']));
ok('התמזגות למקטע יחיד → תווית המקטע (גנן חיצוני = "גינון")', /var label = \(oneSec && SECTION_LABELS\[oneSec\]\) \|\| t\.label;/.test(APP) && /if \(items\.length === 1\) return \[items\[0\]\[0\], label,/.test(APP) && /garden: "גינון"/.test(APP));
ok('סמליל קבוצה לפי מקטע', /var gkey = t\.icon \|\| t\.group;/.test(APP));
ok('בועה: מרווח בין מקטעים', /nav-sheet__gap/.test(APP) && /\.nav-sheet__gap \{ height: 18px;/.test(MCSS));
ok('בועה: צבע לכל סמליל', /var NAV_TINT = \{/.test(APP) && /color: var\(--tint/.test(MCSS));
ok('כיווץ בגלילה', /body\.nav-mini \.app-nav\.app-nav--bottom/.test(MCSS) && /setMini\(true\)/.test(MJS));
ok('🔴 גרירה: הקליק הטבעי נבלע (אין ניווט כפול)', /if \(!ownClick && swallowUntil && Date\.now\(\) < swallowUntil\)/.test(MJS) && /\}, true\);/.test(MJS));
ok('המחוון עוקב אחרי is-hot', /querySelector\("\.app-nav__tab\.is-hot"\)/.test(MOT));
ok('חיפוש: כפתור צף, והכותרת מוסתרת רק כשיש בר', /nav-search-fab/.test(MJS) && /body:not\(\[data-nav-single="1"\]\) \.app-controls \.search-btn \{ display: none; \}/.test(MCSS));
ok('🔴 בלי בר (יעד יחיד) — גם בלי כפתור חיפוש צף', /body\[data-nav-single="1"\] \.nav-search-fab \{ display: none; \}/.test(MCSS));
ok('🔴 דיווח 32: שחרור מחוץ לבר לא בוחר, ותנועה אנכית מבטלת גרירה', /if \(e\.clientY < br\.top - 12 \|\| e\.clientY > br\.bottom \+ 12\) commit = false;/.test(MJS) && /if \(dy > 18 && dy > dx\) \{ endPress\(false\); return; \}/.test(MJS) && /touch-action: pan-y;/.test(MCSS));
ok('המחוון עובר לקבוצה שנפתחה (is-menu) וחוזר בסגירה', /gbtn\.classList\.add\("is-menu"\)/.test(APP) && /classList\.remove\("is-menu"\)/.test(APP) && /\.app-nav__tab\.is-menu/.test(MOT));
ok('הבועה נסגרת בגלילה', /bd\.addEventListener\("touchmove", closeNavSheet/.test(APP) && /CBA\.closeNavSheet\(\)/.test(MJS));
ok('28.9: מתכווץ בתחילת גלילה ונפתח רק בראש העמוד (לא בגלילה למעלה)', /if \(mq\.matches && y > lastY \+ 2 && y > 24\) setMini\(true\);\s*else if \(y <= 4\) setMini\(false\);/.test(MJS));
ok('28.9: נגיעה סביב הבר המכווץ (18px) פותחת; נגיעה בסמליל גם מנווטת', /var r = nav\.getBoundingClientRect\(\), H = 18;/.test(MJS) && /if \(commit && p\.fromMini\) \{/.test(MJS));
const vs = (IDX.match(/\?v=([0-9a-z]+)/g) || []).map(x => x.slice(3));
const swv = (SW.match(/var VERSION = "([^"]+)"/) || [])[1];
ok('גרסה אחידה ב-index.html וב-service-worker', vs.length > 50 && vs.every(v => v === swv), swv);
console.log((fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
