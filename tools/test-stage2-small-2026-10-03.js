/* ============================================================================
   test-stage2-small-2026-10-03.js — שלב 2, החלקים הקטנים (3.10.2026 ערב)
   החלטות יועד: (1) "השלמת פרטים" — שמות השדות החסרים ברשומת החבר, "פעם ביום
   מספיק"; (2) מונה שריוני המועדון — רק כשהמגש פתוח.
   מה יכול להישבר בשקט:
     1. החישוב בשרת (profileGapsFor_) סוטה מהחישוב בלקוח (profileGaps ב-home.js)
        ⇒ הכרטיס מציג "חסר טלפון" למי שמילא, או לא מציג למי שלא.
     2. ערך אישי (טלפון/תאריך) דולף לרשומת החבר במקום שם השדה.
     3. שמירה ב"הפרטים שלי" לא מעדכנת את הרשומה ⇒ הכרטיס נשאר עד הסנכרון.
     4. מונה המועדון ממשיך לשאול את Apps Script כל 45 שניות / בכל עלייה.
   הרצה: node tools/test-stage2-small-2026-10-03.js
   ============================================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const HOME = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'home.js'), 'utf8');
const APP = fs.readFileSync(path.join(ROOT, 'js', 'app.js'), 'utf8');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (d ? '  — ' + d : '')));
const section = t => console.log('\n' + t);
const fnSrc = (src, name, ind) => { const m = src.match(new RegExp((ind || '') + 'function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n' + (ind || '') + '\\}\\n')); return m ? m[0] : ''; };

/* ---------- שרת: profileGapsFor_ על שורה מזויפת ---------- */
const HEAD = ['מזהה קבוע', 'שם משפחה', 'מספר בית', 'שם פרטי 1', 'אימייל 1', 'טלפון 1', 'תאריך לידה 1', 'שם פרטי 2', 'אימייל 2', 'טלפון 2', 'תאריך לידה 2', 'ילדים'];
function serverGaps(row, slot, extra) {
  const sb = { JSON, String, Array, Object, parseInt, RES_VALUES_MEMO_: [HEAD, row], SpreadsheetApp: {} };
  vm.createContext(sb);
  const pieces = [
    CODE.match(/var MY_PROFILE_FIELDS = \[[\s\S]*?\n\];/)[0],
    CODE.match(/var MY_PROFILE_REQUEST_FIELDS = \[[\s\S]*?\n\];/)[0],
    fnSrc(CODE, 'profileFieldDef_'), fnSrc(CODE, 'profileColsByFrag_'), fnSrc(CODE, 'profileColFor_'),
    'function permRowIndex_(p) { return p.rowIndex; }',
    fnSrc(CODE, 'profileGapsFor_')
  ];
  vm.runInContext(pieces.join('\n'), sb);
  return sb.profileGapsFor_(Object.assign({ found: true, slot: slot, rowIndex: 2 }, extra || {}));
}
/* ---------- לקוח: profileGaps על תשובת myProfile מזויפת ---------- */
function clientGaps(values) {
  const box = {};
  vm.createContext(box);
  vm.runInContext(fnSrc(HOME, 'profileGaps', '  ') + '\nthis.g = profileGaps;', box);
  return box.g({ ok: true, mySlot: 1, slots: { 1: { values: values } } });
}

section('1. 🔴 השרת והלקוח מחשבים בדיוק אותו דבר');
{
  const cases = [
    { name: 'הכול מלא', phone: '050', dob: '1990-01-01', kids: '[{"name":"א","dob":"2020-01-01"}]' },
    { name: 'חסר טלפון', phone: '', dob: '1990-01-01', kids: '' },
    { name: 'חסרים טלפון ותאריך', phone: ' ', dob: '', kids: '' },
    { name: 'ילד אחד בלי תאריך', phone: '1', dob: '1', kids: '[{"name":"א","dob":""}]' },
    { name: 'שני ילדים בלי תאריך', phone: '1', dob: '1', kids: '[{"name":"א"},{"name":"ב","dob":" "}]' },
    { name: 'ילדים בפורמט ישן (טקסט)', phone: '1', dob: '1', kids: 'דני 5, רוני 3' },
  ];
  cases.forEach(c => {
    const row = ['7', 'כהן', '9', 'דנה', 'd@x.c', c.phone, c.dob, 'רון', 'r@x.c', '', '', c.kids];
    const s = serverGaps(row, 1);
    const cl = clientGaps({ phone: c.phone, birthDate: c.dob, kids: c.kids });
    ok(c.name + ': ' + JSON.stringify(s), JSON.stringify(s) === JSON.stringify(cl), 'שרת ' + JSON.stringify(s) + ' מול לקוח ' + JSON.stringify(cl));
  });
  const row2 = ['7', 'כהן', '9', 'דנה', 'd@x.c', '050', '1990', 'רון', 'r@x.c', '', '', ''];
  ok('משבצת 2 נבדקת בעמודות של 2 (בן/בת הזוג שלא מילא)', JSON.stringify(serverGaps(row2, 2)) === '["טלפון","תאריך לידה"]');
  ok('משתמש חיצוני ⇒ רשימה ריקה', JSON.stringify(serverGaps(row2, 1, { isExternal: true })) === '[]');
  ok('לא ברשימה ⇒ ריק', JSON.stringify((function () { const sb = { RES_VALUES_MEMO_: null }; vm.createContext(sb); vm.runInContext(fnSrc(CODE, 'profileGapsFor_'), sb); return sb.profileGapsFor_({ found: false }); })()) === '[]');
  const leaked = JSON.stringify(serverGaps(['7', 'כהן', '9', 'דנה', 'd@x.c', '', '1990-02-02', 'רון', 'r@x.c', '', '', ''], 1));
  ok('🔴 רק שמות שדות — אף ערך מהשורה לא יוצא (אין 1990, אין מייל)', leaked.indexOf('1990') === -1 && leaked.indexOf('@') === -1, leaked);
}

section('2. רשומת החבר נושאת את הרשימה, ומתעדכנת בשמירה');
{
  ok('memberDocFor_ כותב profileGaps (שלילה ⇒ ריק)',
     /profileGaps: \(opt\.gaps !== undefined\) \? opt\.gaps : profileGapsFor_\(pr\),/.test(CODE) && /house: '', profileGaps: \[\], updatedAt/.test(CODE));
  ok('טביעת האצבע של הסנכרון כוללת אותה (שינוי ⇒ נכתב)', /doc\.house, doc\.profileGaps, doc\.schema\]/.test(CODE));
  const sm = fnSrc(CODE, 'saveMyProfile_');
  ok('🔴 שמירה ב"הפרטים שלי" מרעננת מיד את רשומות השורה (fbSyncRow_)', /try \{ fbSyncRow_\(ss, r\.rowIndex\); \} catch \(eSync\) \{\}\s*\n\s*return \{ ok: true, written: written, slot: targetSlot \};/.test(sm));
}

section('3. הבית — Firestore קודם, Apps Script רק כנפילה לאחור');
{
  ok('מטמון במכשיר: 24 שעות ("פעם ביום מספיק")', /var PROF_TTL_MS = 24 \* 3600 \* 1000;/.test(HOME) && /\(Date\.now\(\) - o\.ts\) < PROF_TTL_MS\) return o;/.test(HOME));
  const lp = fnSrc(HOME, 'loadProfile', '  ');
  ok('loadProfile: קודם fsProfileGaps, ורק אז getMyProfile', lp.indexOf('fsProfileGaps(') > -1 && lp.indexOf('fsProfileGaps(') < lp.indexOf('CBA.data.getMyProfile('));
  ok('🔴 נקרא רק המסמך של המחובר, ורק כשהמייל במסמך הוא שלו', /CBA\.fb\.readDoc\("members", p\.uid,/.test(HOME) && /String\(d\.email \|\| ""\)\.toLowerCase\(\) === me/.test(HOME));
  ok('שמירה מאפסת גם את הזיכרון של הבית', /window\.dispatchEvent\(new Event\("cba:profile-saved"\)\)/.test(DS) && /addEventListener\("cba:profile-saved", function \(\) \{ profCache = \{ ts: 0, val: null \}; \}\)/.test(HOME));

  /* התנהגות: Firestore מחזיר רשימה ⇒ אין קריאה ל-Apps Script */
  const fn = HOME.slice(HOME.indexOf('  var profCache = { ts: 0, val: null };'), HOME.indexOf('  /* ---- "דברים לעשות" ---- */'));
  function run(doc) {
    const store = {};
    let asked = 0, todo = null;
    const box = {
      JSON, Date, String, Array, Object, Event: function (n) { this.type = n; },
      window: { addEventListener() {}, CBA: null },
      localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } },
      u: () => ({ email: 'd@x.c' }), W: {}, syncTodo: () => { todo = box.W.prof; },
    };
    box.CBA = box.window.CBA = {
      data: { getMyProfile: cb => { asked++; cb({ ok: true, mySlot: 1, slots: { 1: { values: { phone: '', birthDate: '1', kids: '' } } } }); } },
      fb: { authReady: (cb) => cb({}), profile: () => ({ uid: 'U', email: 'D@x.c' }), readDoc: (c, id, cb) => cb(null, doc) }
    };
    vm.createContext(box);
    vm.runInContext(fn + '\nthis.lp = loadProfile;', box);
    box.lp({});
    return { asked, todo };
  }
  let r = run({ email: 'd@x.c', profileGaps: ['תאריך לידה'] });
  ok('מסמך עם רשימה ⇒ הכרטיס ממנה, אפס קריאות Apps Script', r.asked === 0 && JSON.stringify(r.todo) === '["תאריך לידה"]', JSON.stringify(r));
  r = run({ email: 'other@x.c', profileGaps: [] });
  ok('🔴 מסמך של מייל אחר ⇒ לא משתמשים בו (Apps Script)', r.asked === 1 && JSON.stringify(r.todo) === '["טלפון"]', JSON.stringify(r));
  r = run({ email: 'd@x.c' });
  ok('מסמך ישן בלי profileGaps ⇒ Apps Script כמו קודם', r.asked === 1);
  r = run(null);
  ok('אין מסמך ⇒ Apps Script כמו קודם', r.asked === 1);
}

section('4. מונה שריוני המועדון — רק כשהמגש פתוח');
{
  const f = fnSrc(APP, 'refreshAlertsClub', '  ');
  ok('השער קיים, אחרי הנתיב המהיר של "אין הרשאת מועדון"', f.indexOf('if (!can(PERM.CLUB))') > -1 && f.indexOf('if (!clubTrayOpen()) return;') > f.indexOf('if (!can(PERM.CLUB))') && f.indexOf('if (!clubTrayOpen()) return;') < f.indexOf('CBA.data.getClubList('));
  ok('clubTrayOpen = המגש גלוי', /function clubTrayOpen\(\) \{\s*\n\s*var p = document\.getElementById\("user-panel"\);\s*\n\s*return !!\(p && !p\.hidden\);/.test(APP));
  ok('פתיחת המגש עדיין שואלת (אחרי שהוא כבר גלוי)', /openUserPanel\(panel, btn\);\s*\n\s*renderGoogleButton\(\); refreshAlertsClub\(\);/.test(APP));
  ok('מסך ניהול המועדון עדיין מעדכן את המונה בעצמו', /window\.CBA\.setClubPendingCount = function/.test(APP));
}

console.log('\n====================================================');
console.log('עברו: ' + pass + ' | נכשלו: ' + fail);
process.exit(fail ? 1 : 0);
