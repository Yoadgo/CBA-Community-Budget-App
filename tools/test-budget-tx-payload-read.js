
/* בדיקות להיפוך קריאת התנועות במטען הראשי (צעד 09ב-5ג, 2026-09-15).
   הרצה:  node tools/test-budget-tx-payload-read.js

   מריץ את js/data/sheets.js **האמיתי** מול fetch ו-Firestore מדומים.

   🔴🔴 שלוש הסכנות שהמארז הזה שומר עליהן, וכולן היו שקטות:
     1. **מכסת Spark.** שאילתת התנועות עולה קריאה לכל מסמך. המטען המלא
        נמשך לפחות פעם בדקה, ולכן בלי מטמון זה כ-8,640 קריאות לשעה
        לכל לשונית — שבירה של המכסה החינמית תוך שש שעות עבודה. אין
        כרטיס אשראי. הסעיפים 4-5 הם שומר הסף של זה.
     2. **שינוי שאיש לא רואה.** כתיבה ישירה ל-Firestore אינה נוגעת
        בשרת, ולכן מונה התחום לא זז ודפדפן אחר לא יודע למשוך. סעיף 7.
     3. **כשל ב-Firestore שנראה כמו תקציב ריק.** נפילה לאחור חייבת
        להביא מטען מלא עם תנועות מהגיליון — לא שנה ריקה. סעיף 6. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'sheets.js'), 'utf8');
const DS  = fs.readFileSync(path.join(__dirname, '..', 'js', 'data', 'dataService.js'), 'utf8');
const GS  = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

const CUR = 'תשפ"ז';
const OLD = 'תשפ"ו';

/* ---------- סביבה ---------- */
let fetchLog, queryLog, fsRows, fsErr, flagOn, fsFirstLog, nowShift;
function makeEnv(opts) {
  opts = opts || {};
  fetchLog = []; queryLog = []; fsFirstLog = []; fsErr = null; nowShift = 0;
  flagOn = opts.flagOn !== false;
  fsRows = opts.rows || [];
  const store = { _source: 'mock', years: {}, yearList: [], currentYear: '' };
  const sandbox = {
    console: { log() {}, error() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {} }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {},
    location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    Date: new Proxy(Date, { apply: (t, th, a) => Reflect.apply(t, th, a),
                            get: (t, k) => (k === 'now' ? (() => Date.now() + nowShift) : t[k]) }),
    fetch: (url) => {
      const u = String(url);
      fetchLog.push(u);
      const slim = (u.match(/slim=(\d)/) || [])[1];
      return Promise.resolve({ json: () => Promise.resolve(payload(slim)) });
    }
  };
  sandbox.window = sandbox;
  sandbox.CBA = {
    mock: store, authSession: 'SESS', esc: s => String(s),
    /* 🔴 `coldBoot` מחקה את מה שקורה באמת בטעינה הראשונה:
       `CBA.isSuper`/`CBA.perms` נגזרים **מהמטען**, ולכן ברגע
       שהמטען נקרא הם עדיין ריקים. ר' סעיף 8. */
    isSuper: (opts.coldBoot || opts.resident) ? false : true,
    perms: (opts.coldBoot || opts.resident) ? [] : ['תקציב'],
    user: { familyId: opts.resident ? '401' : (opts.coldBoot ? '1' : '') },
    fb: {
      isDbReady: () => true,
      queryCollection: (name, conds, cb) => {
        queryLog.push({ name: name, conds: JSON.parse(JSON.stringify(conds)) });
        if (fsErr) return cb(fsErr);
        cb(null, fsRows.map(r => Object.assign({}, r)));
      },
      readDoc: (c, id, cb) => cb(null, {}),
      readCollection: () => {}
    },
    data: {
      familyDisplayName: id => (String(id) === '401' ? 'משפחת בדיקה' : ''),
      ensureFamilyNames: cb => cb(),
      /* חיקוי נאמן ל-fsFirstRead האמיתי: ברירת המחדל שבקוד מקצרת,
         והדגל החי נבדק אחריה. (המקור עצמו נבדק ב-test-runtime-flags.) */
      fsFirstRead: (key, enabled, load, sheets, cb) => {
        fsFirstLog.push({ key: key, enabled: enabled });
        if (!enabled) return sheets(res => cb(res));
        if (!flagOn) return sheets(res => cb(res));
        load((err, result) => { if (err) return sheets(res => cb(res)); cb(result); });
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}
const wait = ms => new Promise(r => setTimeout(r, ms));

/* מונה התחום — מה שמחליט אם המטמון עדיין תקף */
let budgetCounter = 1;
let txFromFirestore = true;
function payload(slim) {
  const sheetTx = [{ 'מזהה': 1, 'סכום': 10, 'מזהה משפחה': '401' },
                   { 'מזהה': 2, 'סכום': 20, 'מזהה משפחה': '777' }];
  const empty = (slim === '2' && txFromFirestore);
  const yr = tx => ({ budget: [], income: [], groups: [], splits: [], items: [], transactions: tx });
  return { ok: true, rev: 100 + budgetCounter, years: [OLD, CUR], currentYear: CUR,
           settings: {}, notes: {}, groups: [], updates: [], notesLog: [],
           domains: { budget: budgetCounter, other: 1 },
           txFromFirestore: (slim === '2' && txFromFirestore),
           data: { [CUR]: yr(empty ? [] : sheetTx) } };
}

/* ================================================================= */
section('1. הקוד עצמו');
ok('המטען נמשך עם slim=2', /"&slim=" \+ slim/.test(SRC) && /fetchPayload\("2",/.test(SRC));
ok('🔴 ברירת המחדל בקוד היא true (אחרת fsFirstRead מקצרת והדגל חסר משמעות)',
   /var BUDGET_TX_FROM_FIRESTORE_READ = true;/.test(SRC));
ok('⚠️ ואין קיצור על הקבוע', !/if \(!BUDGET_TX_FROM_FIRESTORE_READ\)/.test(SRC));
ok('ההזרקה קורית לפני transform',
   /payload\.data\[y\]\.transactions = res\.rows;[\s\S]{0,40}ok\(payload\)/.test(SRC));
ok('🔴 והלקוח פועל לפי הצהרת השרת, לא לפי הדגל שלו',
   /if \(!payload\.txFromFirestore\) return useIt\(payload\);/.test(SRC));
ok('🔴 נקודת קריאה אחת לתנועות (fsTxRows), ושני צרכנים',
   (SRC.match(/fsTxRows\(y, (true|seesBudget), function/g) || []).length === 2,
   String((SRC.match(/fsTxRows\(y, (true|seesBudget), function/g) || []).length));
ok('⚠️ אין שאילתת budgetTx שנייה מקבילה',
   (SRC.match(/queryCollection\("budgetTx"/g) || []).length === 1);
ok('הנפילה לאחור מושכת מטען slim=1', (SRC.match(/fetchPayload\("1",/g) || []).length === 2);
ok('🔴 והיא אינה נכנסת למטמון', /if \(res\.payload\) return ok\(res\.payload\);/.test(SRC) &&
   /fsTxCache = \{ y: y, key: key/.test(SRC));
ok('dropTxCache מיוצאת החוצה', /dropTxCache: dropTxCache/.test(SRC));
ok('⚠️ ו-clearCache זורקת גם אותה', /function clearCache\(\) \{ dropTxCache\(\);/.test(SRC));
ok('🔴 כל כתיבת תנועה עוברת ב-txWrote', (DS.match(/txWrote\("/g) || []).length === 4,
   String((DS.match(/txWrote\("/g) || []).length));
ok('ו-txWrote זורקת מטמון **וגם** דוחפת לשרת',
   /function txWrote\(op\) \{[\s\S]{0,240}dropTxCache\(\)[\s\S]{0,160}txNudgeApply\(\)/.test(DS));

/* 🔴🔴 החלק שאין לו שום סימן על המסך אם הוא נשבר: כל כתיבה
   ישירה ל-Firestore חייבת להרים דגל עריכה. עד ההיפוך הקריאה
   היתה מהגיליון ו-`push()` הרים דגל בעצמו; עכשיו רענון רקע
   שנוחת בין התצוגה האופטימית לכתיבה מוחק את השורה מהמסך
   ומחזיר אותה שנייה אחר כך — בדיוק הבהוב שתוקן בסטטוס. */
ok('🔴 ארבע הכתיבות מרימות דגל עריכה (עם הסטטוס — חמש)',
   (DS.match(/txDirtyUp\(\);/g) || []).length === 5,
   String((DS.match(/txDirtyUp\(\);/g) || []).length));
ok('⚠️ ולכל נפילה לאחור יש שחרור',
   (DS.match(/txFellBack\(\);/g) || []).length === 8,
   String((DS.match(/txFellBack\(\);/g) || []).length));
ok('⚠️ והשחרור אכן מוריד את המונה',
   /function txFellBack\(\) \{ txDirtyDown\(\); \}/.test(DS));
ok('⚠️ ו-txNudgeApply חזרה לחתימה אחת — כל הדוחפים מחזיקים',
   /function txNudgeApply\(\) \{\s*\n\s*txNudgeHeld\+\+;/.test(DS) &&
   !/txNudgeApply\(false\)/.test(DS));
/* 🔴🔴 החור שבגללו הצעד לא יכול היה לרוץ קודם:
   לתושב אין הרשאת תקציב, ו-`budgetTxApply` דורש אותה. בלי
   פיצול היתה הדחיפה נדחית בשקט, המונה לא היה זז,
   ובקשת החזר של תושב לא היתה מופיעה לגזבר על המסך. */
ok('🔴 תושב דוחף ב-txPing ובעל הרשאה ב-budgetTxApply',
   /seesBudget \? "budgetTxApply" : "txPing"/.test(DS));
ok('⚠️ ולשרת יש נתיב ל-txPing', /e\.parameter\.action === 'txPing'/.test(GS));
ok('⚠️ שעובר בשער הרגיל (מושב תקין + תושב פעיל)',
   /function handleTxPing_\(p\) \{[\s\S]{0,260}authorize_\(ss, p, null\)/.test(GS));
ok('🔴 ומרים את מונה תחום התקציב',
   /function handleTxPing_\(p\) \{[\s\S]{0,400}bumpRev_\('saveTransaction'\)/.test(GS));
ok('⚠️ ואינו נוגע בשום נתון',
   !/function handleTxPing_\(p\) \{[\s\S]{0,400}(getRange|setValue|budgetTxApplyPending_)/.test(GS));
ok('🔴 והדחיפה מהדפדפן מרימה מונה ללא תנאי',
   /function handleBudgetTxApply_\(p\) \{[\s\S]{0,2200}\n    bumpRev_\('saveTransaction'\);/.test(GS));

ok('🔴 וכתיבת סטטוס זורקת אף היא את המטמון',
   /dropTxCache\(\); \} catch \(e\) \{\}\s*\n\s*txNudgeApply\(\);/.test(DS));

(async function () {
  /* =============================================================== */
  section('2. דגל כבוי בשרת — שום דבר לא משתנה');
  txFromFirestore = false;
  let env = makeEnv(); let S = env.CBA.sheets; let st = env.CBA.mock;
  await new Promise(r => S.load(() => r())); await wait(20);
  ok('נמשך עם slim=2', /slim=2/.test(fetchLog[0]), fetchLog[0]);
  ok('🔴 ולא יצאה שום שאילתה ל-Firestore', queryLog.length === 0, String(queryLog.length));
  ok('התנועות הגיעו מהמטען', st.years[CUR].transactions.length === 2,
     String(st.years[CUR].transactions.length));

  /* =============================================================== */
  section('3. דגל דלוק — התנועות מגיעות מ-Firestore');
  txFromFirestore = true;
  env = makeEnv({ rows: [
    { 'מזהה': 5, 'סכום': 55, 'מזהה משפחה': '401', 'תאריך רכישה': { toDate: () => new Date('2026-03-04T00:00:00Z') },
      year: CUR, familyId: '401', schema: 3 },
    { 'מזהה': 6, 'סכום': 66, 'מזהה משפחה': '401', 'רוכש': 'שם שנשמר', 'תאריך רכישה': '2026-03-05' }
  ] });
  S = env.CBA.sheets; st = env.CBA.mock;
  await new Promise(r => S.load(() => r())); await wait(20);
  ok('יצאה שאילתה אחת', queryLog.length === 1, String(queryLog.length));
  ok('לאוסף budgetTx לפי שנה', queryLog[0].name === 'budgetTx' &&
     queryLog[0].conds.length === 1 && queryLog[0].conds[0][0] === 'year' &&
     queryLog[0].conds[0][1] === CUR, JSON.stringify(queryLog[0]));
  ok('🔴 שתי התנועות הגיעו למסך', st.years[CUR].transactions.length === 2,
     String(st.years[CUR].transactions.length));
  const t5 = st.years[CUR].transactions.filter(t => t.id === 5)[0];
  ok('⚠️ Timestamp הומר לתאריך תקין (ולא לזבל)', !!t5 && t5.date === '2026-03-04', t5 && t5.date);
  ok('🔴 שם הרוכש הורכב ממזהה המשפחה', !!t5 && t5.buyer === 'משפחת בדיקה', t5 && t5.buyer);
  const t6 = st.years[CUR].transactions.filter(t => t.id === 6)[0];
  ok('⚠️ ושם שכבר קיים לא נדרס', !!t6 && t6.buyer === 'שם שנשמר', t6 && t6.buyer);
  ok('⚠️ שדות תפעוליים לא דלפו לשדות מותאמים',
     !!t5 && !(t5.customFields && (t5.customFields.year || t5.customFields.schema)),
     JSON.stringify(t5 && t5.customFields));

  /* =============================================================== */
  section('4. 🔴🔴 מטמון — מונה התחום לא זז ⇒ אין שאילתה נוספת');
  await new Promise(r => S.refresh(() => r())); await wait(20);
  ok('משיכה נוספת יצאה', fetchLog.length === 2, String(fetchLog.length));
  ok('🔴 אבל **לא** יצאה שאילתה נוספת', queryLog.length === 1, String(queryLog.length));
  ok('והתנועות עדיין על המסך', st.years[CUR].transactions.length === 2,
     String(st.years[CUR].transactions.length));

  /* =============================================================== */
  section('5. מונה התחום זז ⇒ שאילתה חדשה');
  budgetCounter++;
  fsRows = [{ 'מזהה': 9, 'סכום': 99, 'מזהה משפחה': '401' }];
  await new Promise(r => S.refresh(() => r())); await wait(20);
  ok('🔴 יצאה שאילתה חדשה', queryLog.length === 2, String(queryLog.length));
  ok('והשורה החדשה הגיעה', st.years[CUR].transactions.length === 1 &&
     st.years[CUR].transactions[0].id === 9, JSON.stringify(st.years[CUR].transactions.map(t => t.id)));

  section('5ב. רשת הביטחון — אחרי 10 דקות מושכים גם בלי אות');
  nowShift = 11 * 60 * 1000;
  await new Promise(r => S.refresh(() => r())); await wait(20);
  ok('⚠️ שאילתה נוספת למרות שהמונה לא זז', queryLog.length === 3, String(queryLog.length));

  /* =============================================================== */
  section('6. 🔴 כשל ב-Firestore — נפילה לאחור למטען מלא, לא לשנה ריקה');
  env = makeEnv({ rows: [] }); S = env.CBA.sheets; st = env.CBA.mock;
  fsErr = new Error('permission-denied');
  await new Promise(r => S.load(() => r())); await wait(20);
  ok('נמשך שוב עם slim=1', fetchLog.filter(u => /slim=1/.test(u)).length === 1,
     fetchLog.join(' | '));
  ok('🔴 והתנועות מהגיליון הגיעו — לא תקציב ריק',
     st.years[CUR].transactions.length === 2, String(st.years[CUR].transactions.length));
  fsErr = null;
  const qBefore = queryLog.length;
  await new Promise(r => S.refresh(() => r())); await wait(20);
  ok('⚠️ והנפילה לא נכנסה למטמון — הניסיון הבא חוזר ל-Firestore',
     queryLog.length === qBefore + 1, String(queryLog.length - qBefore));

  /* =============================================================== */
  section('7. תושב — שאילתה מסוננת למשפחתו');
  env = makeEnv({ resident: true, rows: [] }); S = env.CBA.sheets;
  txFromFirestore = true;
  /* תושב אינו מקבל txFromFirestore מהשרת; כאן נבדק שהשאילתה עצמה
     מסוננת — המסלול שבו fsYearLoad משתמש באותה פונקציה. */
  await new Promise(r => S.loadYear(CUR, () => r())).catch(() => {});
  await wait(20);
  if (queryLog.length) {
    ok('⚠️ הסינון לפי משפחה קיים',
       queryLog[0].conds.length === 2 && queryLog[0].conds[1][0] === 'familyId' &&
       queryLog[0].conds[1][1] === '401', JSON.stringify(queryLog[0].conds));
  } else {
    ok('⚠️ הסינון לפי משפחה קיים', false, 'לא יצאה שאילתה');
  }


  /* =============================================================== */
  /*  🔴🔴 סעיף 8 — **הבאג שנתפס בייצור בהדלקה הראשונה**  */
  /*  (15.9.2026). הדגל הודלק, העמוד נטען, והמסך הראה       */
  /*  **אפס תנועות** למנהל-על, בלי שום שגיאה. `fsTxRows`       */
  /*  גזרה את ההרשאה מ-`CBA.isSuper` — שנגזר מהמטען שאותו  */
  /*  בדיוק עיבדנו, ולכן עוד לא היה מאוכלס — וצימצמה את     */
  /*  השאילתה למשפחת המשתמש. שנה ריקה שנראית אמיתית.   */
  section('8. \uD83D\uDD34 \u05D8\u05E2\u05D9\u05E0\u05D4 \u05E8\u05D0\u05E9\u05D5\u05E0\u05D4 \u2014 \u05D4\u05D4\u05E8\u05E9\u05D0\u05D4 \u05E2\u05D5\u05D3 \u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2\u05D4 \u05D1\u05DC\u05E7\u05D5\u05D7');
  txFromFirestore = true;
  budgetCounter++;
  env = makeEnv({ coldBoot: true, rows: [
    { '\u05DE\u05D6\u05D4\u05D4': 11, '\u05E1\u05DB\u05D5\u05DD': 111, '\u05DE\u05D6\u05D4\u05D4 \u05DE\u05E9\u05E4\u05D7\u05D4': '401' },
    { '\u05DE\u05D6\u05D4\u05D4': 12, '\u05E1\u05DB\u05D5\u05DD': 122, '\u05DE\u05D6\u05D4\u05D4 \u05DE\u05E9\u05E4\u05D7\u05D4': '777' }
  ] });
  S = env.CBA.sheets; st = env.CBA.mock;
  await new Promise(r => S.load(() => r())); await wait(20);
  ok('\u05D9\u05E6\u05D0\u05D4 \u05E9\u05D0\u05D9\u05DC\u05EA\u05D4', queryLog.length === 1, String(queryLog.length));
  ok('\uD83D\uDD34\uD83D\uDD34 **\u05D5\u05D4\u05D9\u05D0 \u05D0\u05D9\u05E0\u05D4 \u05DE\u05E1\u05D5\u05E0\u05E0\u05EA \u05DC\u05DE\u05E9\u05E4\u05D7\u05D4** \u2014 \u05D4\u05E9\u05E8\u05EA \u05DB\u05D1\u05E8 \u05D4\u05E2\u05D9\u05D3',
     queryLog[0].conds.length === 1 && queryLog[0].conds[0][0] === 'year',
     JSON.stringify(queryLog[0].conds));
  ok('\uD83D\uDD34 \u05D5\u05E9\u05EA\u05D9 \u05D4\u05EA\u05E0\u05D5\u05E2\u05D5\u05EA \u05D4\u05D2\u05D9\u05E2\u05D5 \u2014 \u05DC\u05D0 \u05E9\u05E0\u05D4 \u05E8\u05D9\u05E7\u05D4',
     st.years[CUR].transactions.length === 2, String(st.years[CUR].transactions.length));
  ok('\u26A0\uFE0F \u05D5\u05D4\u05E7\u05D5\u05D3 \u05D0\u05D9\u05E0\u05D5 \u05D2\u05D5\u05D6\u05E8 \u05D4\u05E8\u05E9\u05D0\u05D4 \u05D1\u05EA\u05D5\u05DA fsTxRows',
     !/function fsTxRows\(y, seesAll, done\) \{[\s\S]{0,1400}CBA\.isSuper/.test(SRC));
  ok('\u26A0\uFE0F \u05D5\u05D4\u05D9\u05D0 \u05DE\u05E7\u05D1\u05DC\u05EA \u05D0\u05D5\u05EA\u05D4 \u05DE\u05D1\u05D7\u05D5\u05E5', /function fsTxRows\(y, seesAll, done\)/.test(SRC));
  ok('\u26A0\uFE0F \u05D5\u05D4\u05DE\u05D8\u05E2\u05DF \u05DE\u05E2\u05D1\u05D9\u05E8 true (\u05D4\u05E9\u05E8\u05EA \u05D4\u05E2\u05D9\u05D3)', /fsTxRows\(y, true, function/.test(SRC));
  ok('\u26A0\uFE0F \u05D5\u05D4\u05E9\u05E0\u05D4 \u05D4\u05D1\u05D5\u05D3\u05D3\u05EA \u05DE\u05E2\u05D1\u05D9\u05E8\u05D4 \u05D0\u05EA \u05E9\u05DC\u05D4', /fsTxRows\(y, seesBudget, function/.test(SRC));

  console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
