/* 2.10.2026 — בקשות יועד: כרטיס סיור "המלצות השיכון", "עסקים מתושבי השיכון" בולט,
   ולחיצה על "האירוע הבא" בבית פותחת את הכרטיס עם ההזמנה. */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const section = t => console.log('\n' + t);
const fnSrc = (src, name) => {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0, j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
};
const G = R('apps-script/Code.gs');

section('כרטיס סיור "המלצות השיכון" — תיקון חד-פעמי ב-Firestore');
{
  const start = G.indexOf('var TOUR_FS_PATCHES');
  const patches = G.slice(start, G.indexOf('];', start) + 2);
  const sb = { props: {}, docs: {}, sheetCalls: 0, log: [] };
  const ctx = {
    FS_TOUR: 'tourSteps',
    fsDocPath_: (c, id) => c + '/' + id,
    fsGet_: p => sb.docs[p] ? JSON.parse(JSON.stringify(sb.docs[p])) : null,
    fsSet_: (p, o) => { sb.docs[p] = JSON.parse(JSON.stringify(o)); },
    tourStepCompare_: (a, b) => ((a['גרסה'] || 1) - (b['גרסה'] || 1)) || ((a['סדר'] || 0) - (b['סדר'] || 0)),
    tourSheetMirrorPatch_: () => { sb.sheetCalls++; },
    CacheService: { getScriptCache: () => ({ remove: () => {} }) },
    Logger: { log: m => sb.log.push(m) }, JSON, Object, String, Date
  };
  vm.createContext(ctx);
  vm.runInContext(patches + '\n' + fnSrc(G, 'tourFsPatchesRun_'), ctx);
  const props = { getProperty: k => sb.props[k] || null, setProperty: (k, v) => { sb.props[k] = v; } };
  sb.docs['tourSteps/all'] = { steps: [
    { 'מזהה': 'services', 'גרסה': 5, 'סדר': 4, 'כותרת': 'שירותים לתושב והמלצות השיכון' },
    { 'מזהה': 'wework', 'גרסה': 6, 'סדר': 15 }], schema: 1 };
  let r = ctx.tourFsPatchesRun_(null, props);
  const steps = sb.docs['tourSteps/all'].steps;
  const rec = steps.find(s => s['מזהה'] === 'recommendations');
  ok('נוסף כרטיס recommendations', !!rec && r.applied === 1);
  ok('גרסה 7 (מופיע כ"חדש" למי שכבר עבר את הסיור)', rec && rec['גרסה'] === 7);
  ok('מוביל למסך ההמלצות', rec && rec['מסך יעד'] === 'resRecommendations' && rec['כפתור'] === 'להמלצות');
  ok('מזכיר צילום כרטיס ביקור (RRA3)', rec && /לצלם כרטיס ביקור/.test(rec['טקסט']));
  ok('כרטיס "שירותים" לא השתנה (הכרעת יועד)', steps.find(s => s['מזהה'] === 'services')['כותרת'] === 'שירותים לתושב והמלצות השיכון');
  ok('גם טאב הגיבוי מתעדכן', sb.sheetCalls === 1);
  r = ctx.tourFsPatchesRun_(null, props);
  ok('פעם אחת בלבד (דגל)', r.applied === 0 && sb.docs['tourSteps/all'].steps.length === 3);
  ok('רץ מהשעתי אחרי המעבר ל-Firebase', /var pr = tourFsPatchesRun_\(ss, props\);/.test(fnSrc(G, 'tourSyncAll_')));
}

section('"עסקים מתושבי השיכון" — ראשון ובולט');
{
  const Q = R('js/screens/resRecommendations.js'), C = R('css/style.css');
  const cats = Q.slice(Q.indexOf('var RR_CATEGORIES'), Q.indexOf('];', Q.indexOf('var RR_CATEGORIES')));
  ok('ראשון ברשימת הקטגוריות', /\[\s*(\/\*[\s\S]*?\*\/\s*)?\{ id: "biz"/.test(cats.replace(/^var RR_CATEGORIES = /, '')));
  ok('מופיע פעם אחת', (cats.match(/id: "biz"/g) || []).length === 1);
  ok('טלפון: אריח רחב (שתי משבצות)', /rr2-catb--hero/.test(Q) && /\.rr2-catb--hero \{ grid-column: span 2;/.test(C));
  ok('"המלצה חדשה" בשורה מלאה', /\.rr2-catgrid \.rr2-catb--add \{ grid-column: 1 \/ -1;/.test(C));
  ok('מחשב: תיבה צבעונית בראש רשימת הצד', /rr2-side__hero/.test(Q) && /\.rr2-side__hero \{/.test(C));
}

section('"האירוע הבא" בבית → הכרטיס פתוח עם ההזמנה');
{
  const H = R('js/screens/home.js'), S = R('js/screens/homeSchedule.js');
  ok('המיני נושא את מזהה האירוע', /el\.setAttribute\("data-evid", e\.id \|\| ""\)/.test(H));
  ok('הלחיצה מעבירה אותו לגיליון', /openNextSheet\(nxs\.getAttribute\("data-evid"\) \|\| ""\)/.test(H));
  const o = fnSrc(S, 'openNextSheet');
  ok('הכרטיס של האירוע נפתח מראש', /nx\.open\[nx\.focus\] = true/.test(o));
  ok('ההזמנה בתוך הכרטיס הפתוח (לא רק כפתור)', /class="hm-nx__inv"/.test(S) && /inlineInv/.test(S));
  ok('לחיצה על ההזמנה = מסך מלא', /data-nx-inv="' \+ esc\(e\.id\) \+ '" data-nx-invimg/.test(S));
  ok('התמונה נטענת פעם אחת לאירוע', /if \(invImg\[id\] !== undefined\) return;/.test(fnSrc(S, 'fillInvites')));
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
