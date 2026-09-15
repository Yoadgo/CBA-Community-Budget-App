/* בדיקות לקריאת שנה מ-Firestore (2026-09-15, צעד 08ב-3).
   הרצה:  node tools/test-budget-year-firestore.js

   מריץ את `dataService.js` ו-`sheets.js` האמיתיים באותה סביבה,
   כדי ש-`fsFirstRead` האמיתי (הדגל + הנפילה לאחור) ירוץ באמת.

   🔴 **שלושה דברים שאסור לשבור כאן:**
     1. תושב קורא **מסמך בודד לפי מזהה** — לעולם לא את האוסף.
        קריאת האוסף היא גם דליפה (הכלל ידחה) וגם דורשת אינדקס.
     2. **מסמך שנה חסר = נפילה לאחור**, לא תקציב ריק.
     3. **שם הרוכש מורכב בלקוח** — הוא אינו ולא יהיה ב-Firestore. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  \u2713 ' + n))
                          : (fail++, console.log('  \u2717 ' + n + (x ? '  \u2192 ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const DS = fs.readFileSync(path.join(ROOT, 'js', 'data', 'dataService.js'), 'utf8');
const SH = fs.readFileSync(path.join(ROOT, 'js', 'data', 'sheets.js'), 'utf8');

const Y = 'תשפ"ז';

function env(opts) {
  opts = opts || {};
  const log = [];
  const sb = {
    console: { log() {}, error() {}, warn() {} },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { addEventListener() {}, querySelector: () => null, getElementById: () => null,
                createElement: () => ({ style: {}, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {} } }),
                head: { appendChild() {} }, body: { appendChild() {} }, hidden: false },
    navigator: { onLine: true, sendBeacon: () => true },
    addEventListener() {}, removeEventListener() {}, location: { href: 'https://x/' },
    XMLHttpRequest: function () { this.open = function () {}; this.send = function () {};
                                 this.setRequestHeader = function () {}; this.upload = {}; },
    fetch: (url) => {
      log.push('appsscript');
      return Promise.resolve({ json: () => Promise.resolve(opts.sheetsRes || { ok: true, rev: 9, data: { budget: [], income: [], groups: [], splits: [], items: [], transactions: [{ 'מזהה': 99 }] } }) });
    }
  };
  sb.window = sb;
  sb.CBA = {
    esc: s => String(s),
    authSession: 'S',
    isSuper: !!opts.isSuper,
    perms: opts.perms || [],
    user: { familyId: opts.familyId || '' },
    mock: { _source: 'sheets', transactions: [], categories: [], years: {}, yearList: [Y],
            currentYear: Y, _settings: {} },
    fb: {
      authReady: cb => cb(opts.noUser ? null : { uid: 'u1' }),
      ensureDb: cb => { log.push('ensureDb'); setTimeout(() => cb(opts.dbErr || null), 0); },
      flag: (k, d) => (opts.flags && k in opts.flags) ? opts.flags[k] : d,
      /* כל קריאה רושמת גם את ההפעלה וגם את הסיום ('!'),
         כדי שאפשר יהיה להבחין בין "במקביל" לבין "בטור". */
      readDoc: (col, id, cb) => {
        log.push('readDoc:' + col + '/' + id);
        setTimeout(() => { log.push('readDoc!' ); cb(opts.docErr && opts.docErr[col] ? new Error('boom') : null,
                            (opts.docs && opts.docs[col + '/' + id]) || null); }, 0);
      },
      readCollection: (col, cb) => {
        log.push('readCollection:' + col);
        setTimeout(() => { log.push('readCollection!'); cb(opts.colErr ? new Error('boom') : null, (opts.cols && opts.cols[col]) || []); }, 0);
      },
      /* 🔴 **מצעד 09: מסמך לכל תנועה, ולכן שאילתה.**
         המדמה מסננת באמת לפי התנאים — אחרת בדיקה של
         "התושב קיבל רק את שלו" היתה עוברת גם אם הקוד
         לא היה מעביר את תנאי המשפחה בכלל. */
      queryCollection: (col, conds, cb) => {
        log.push('query:' + col + ':' + JSON.stringify(conds));
        setTimeout(() => {
          log.push('query!');
          if (opts.colErr) return cb(new Error('boom'));
          var all = (opts.cols && opts.cols[col]) || [];
          var out = all.filter(d => (conds || []).every(c => String(d[c[0]]) === String(c[1])));
          cb(null, out);
        }, 0);
      }
    }
  };
  vm.createContext(sb);
  vm.runInContext(DS, sb);
  vm.runInContext(SH, sb);
  /* הספרייה — מחליפים את הטעינה האמיתית (Apps Script) במפה מוכנה */
  sb.CBA.data.ensureFamilyNames = function (cb) { log.push('names'); setTimeout(() => cb(true), 0); };
  sb.CBA.data.familyDisplayName = function (f) { return (opts.names || {})[String(f || '').trim()] || ''; };
  return { sb, log };
}

function loadYear(e) {
  return new Promise(res => e.sb.CBA.sheets.loadYear(Y, (okk, err) => res({ ok: okk, err })));
}

section('1. הדגל כבוי — המסלול הישן');
(async () => {
  {
    const e = env({ flags: { budgetYearFromFirestore: false }, isSuper: true });
    const r = await loadYear(e);
    ok('נטען בהצלחה', r.ok === true, JSON.stringify(r));
    ok('🔴 דרך Apps Script', e.log.indexOf('appsscript') !== -1);
    ok('🔴 ו-Firestore לא נוגע כלל', !e.log.some(x => /readDoc|readCollection|query/.test(x)), JSON.stringify(e.log));
  }

  section('2. 🔴 בעל הרשאת תקציב — כל השנה');
  {
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: true,
      docs: { ['budgetYears/' + Y]: { year: Y, budget: [{ 'סעיף': 'גינון' }], income: [], groups: [], splits: [], items: [] } },
      cols: { budgetTx: [
        { id: Y + '__1', year: Y, familyId: '3', 'מזהה': 1, 'מזהה משפחה': '3' },
        { id: Y + '__2', year: Y, familyId: '7', 'מזהה': 2, 'מזהה משפחה': '7' },
        { id: 'תשפ"ו__3', year: 'תשפ"ו', familyId: '3', 'מזהה': 3 }
      ] },
      names: { '3': 'משפחת כהן', '7': 'משפחת לוי' }
    });
    const r = await loadYear(e);
    const yr = e.sb.CBA.mock.years[Y];
    ok('נטען בהצלחה', r.ok === true, JSON.stringify(r));
    ok('🔴 בלי Apps Script', e.log.indexOf('appsscript') === -1, JSON.stringify(e.log));
    ok('קרא את מסמך השנה', e.log.indexOf('readDoc:budgetYears/' + Y) !== -1);
    ok('ושאל את התנועות לפי שנה',
       e.log.some(x => x.indexOf('query:budgetTx') === 0 && x.indexOf('"year"') !== -1), JSON.stringify(e.log));
    ok('🔴 ולא קרא את האוסף השלם',
       e.log.indexOf('readCollection:budgetTx') === -1, JSON.stringify(e.log));
    /* 🔴 שאילתה של בעל תקציב — תנאי אחד בלבד (שנה),
       בלי מיון ובלי אי-שוויון — אחרת נדרש אינדקס מורכב. */
    ok('🔴 תנאי אחד בלבד לבעל תקציב',
       e.log.indexOf('query:budgetTx:' + JSON.stringify([['year', Y]])) !== -1, JSON.stringify(e.log));
    ok('🔴 שתי תנועות בלבד — שנה אחרת סוננה',
       yr.transactions.length === 2, String(yr.transactions.length));
    /* 🔴 שדות התשתית של המסמך אינם נתוני תנועה — אסור
       להם לזלוג לשורה ש-`toTx` מקבל. */
    ok('🔴 שדות התשתית נוקו מהשורה',
       /var BTX_META/.test(SH) && /function btxStrip/.test(SH));
    ok('השנה נבנתה עם הסעיף', yr.categories.length === 1);
    ok('_loaded=true', yr._loaded === true);
    ok('🔴 שם הרוכש הורכב ממזהה המשפחה',
       yr.transactions.some(t => t.buyer === 'משפחת כהן'),
       JSON.stringify(yr.transactions.map(t => t.buyer)));
    /* 🔴 "במקביל" = טעינת השמות הופעלה **לפני שאף קריאה
       הסתיימה**. אחרת היינו משלמים את סבב Apps Script אחרי Firestore. */
    const firstDone = e.log.findIndex(x => x.slice(-1) === '!');
    ok('🔴 וטעינת השמות הופעלה לפני שאף קריאה הסתיימה',
       e.log.indexOf('names') !== -1 && firstDone !== -1 && e.log.indexOf('names') < firstDone,
       JSON.stringify(e.log));
  }

  section('3. 🔴 תושב — שאילתה מסוננת למשפחתו בלבד');
  {
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: false, perms: [], familyId: '7',
      docs: { ['budgetYears/' + Y]: { year: Y, budget: [], income: [], groups: [], splits: [], items: [] } },
      cols: { budgetTx: [
        { id: Y + '__5', year: Y, familyId: '7', 'מזהה': 5, 'מזהה משפחה': '7' },
        /* השכן. אסור שיגיע — וב-Firestore הכלל באמת ידחה אותו. */
        { id: Y + '__6', year: Y, familyId: '3', 'מזהה': 6, 'מזהה משפחה': '3' }
      ] },
      names: { '7': 'משפחת לוי' }
    });
    const r = await loadYear(e);
    ok('נטען בהצלחה', r.ok === true, JSON.stringify(r));
    ok('🔴 השאילתה נושאת גם את תנאי המשפחה',
       e.log.indexOf('query:budgetTx:' + JSON.stringify([['year', Y], ['familyId', '7']])) !== -1, JSON.stringify(e.log));
    ok('🔴 ולא קרא את האוסף (דליפה + אינדקס)',
       e.log.indexOf('readCollection:budgetTx') === -1, JSON.stringify(e.log));
    ok('וקיבל את התנועה שלו בלבד',
       e.sb.CBA.mock.years[Y].transactions.length === 1, String(e.sb.CBA.mock.years[Y].transactions.length));
  }
  {
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: false, familyId: '55',
      docs: { ['budgetYears/' + Y]: { year: Y, budget: [], income: [], groups: [], splits: [], items: [] } }
    });
    const r = await loadYear(e);
    ok('🔴 תושב בלי תנועות — שנה ריקה לגיטימית ולא שגיאה',
       r.ok === true && e.sb.CBA.mock.years[Y].transactions.length === 0, JSON.stringify(r));
    ok('ולא נפל ל-Apps Script', e.log.indexOf('appsscript') === -1, JSON.stringify(e.log));
  }
  {
    /* 🔴 מי שאין לו מזהה משפחה ואין לו הרשאת תקציב — **לא
       שולחים שאילתה בכלל.** שאילתה עם `familyId == ''` היתה
       נדחית ע"י הכלל, וכל השנה היתה נופלת לאחור על לא דבר. */
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: false, perms: [], familyId: '',
      docs: { ['budgetYears/' + Y]: { year: Y, budget: [], income: [], groups: [], splits: [], items: [] } },
      cols: { budgetTx: [{ id: Y + '__5', year: Y, familyId: '7', 'מזהה': 5 }] }
    });
    const r = await loadYear(e);
    ok('🔴 בלי משפחה ובלי תקציב — אף שאילתה לא יוצאת',
       !e.log.some(x => x.indexOf('query:') === 0), JSON.stringify(e.log));
    ok('ולא נפל ל-Apps Script', r.ok === true && e.log.indexOf('appsscript') === -1, JSON.stringify(e.log));
  }

  section('3ב. 🔴🔴 תושב אינו קורא את תוכנית התקציב כלל');
  {
    /* 🔴 הכלל פותח את `budgetYears` רק לבעלי הרשאת תקציב.
       לו היינו קוראים אותו בכל מקרה, קריאת תושב היתה נדחית
       וכל השנה היתה נופלת לאחור — כלומר הצעד לא נותן
       לתושבים כלום, ועוד משלם קריאה שנדחתה. */
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: false, perms: [], familyId: '7',
      cols: { budgetTx: [{ id: Y + '__5', year: Y, familyId: '7', 'מזהה': 5 }] }
      /* שים לב: אין כאן budgetYears בכלל — וזה לא אמור להפריע. */
    });
    const r = await loadYear(e);
    ok('🔴 לא נקרא מסמך התוכנית',
       !e.log.some(x => x.indexOf('readDoc:budgetYears') === 0), JSON.stringify(e.log));
    ok('🔴 ולא נפל ל-Apps Script', r.ok === true && e.log.indexOf('appsscript') === -1, JSON.stringify(e.log));
    const yr = e.sb.CBA.mock.years[Y];
    ok('התוכנית ריקה — בדיוק כמו DATA_MIN', (yr.categories || []).length === 0);
    ok('והתנועות שלו הגיעו', (yr.transactions || []).length === 1);
  }

  section('4. 🔴 נפילה לאחור');
  {
    const e = env({ flags: { budgetYearFromFirestore: true }, isSuper: true, docs: {} });
    const r = await loadYear(e);
    ok('🔴 מסמך שנה חסר → Apps Script, לא תקציב ריק',
       r.ok === true && e.log.indexOf('appsscript') !== -1, JSON.stringify(e.log));
    ok('והנתונים הגיעו מהמסלול הישן',
       e.sb.CBA.mock.years[Y].transactions.length === 1);
  }
  {
    const e = env({ flags: { budgetYearFromFirestore: true }, isSuper: true, colErr: true,
                    docs: { ['budgetYears/' + Y]: { year: Y, budget: [], income: [], groups: [], splits: [], items: [] } } });
    const r = await loadYear(e);
    ok('🔴 כשל בקריאת התנועות → נפילה לאחור',
       r.ok === true && e.log.indexOf('appsscript') !== -1, JSON.stringify(e.log));
  }
  {
    const e = env({ flags: { budgetYearFromFirestore: true }, noUser: true, isSuper: true });
    const r = await loadYear(e);
    ok('אין משתמש מחובר → נפילה לאחור',
       r.ok === true && e.log.indexOf('appsscript') !== -1, JSON.stringify(e.log));
  }

  section('5. שם רוכש שכבר קיים');
  {
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: true,
      docs: { ['budgetYears/' + Y]: { year: Y, budget: [], income: [], groups: [], splits: [], items: [] } },
      cols: { budgetTx: [{ id: Y + '__1', year: Y, familyId: '3',
                           'מזהה': 1, 'מזהה משפחה': '3', 'רוכש': 'שם מפורש' }] },
      names: { '3': 'משפחת כהן' }
    });
    await loadYear(e);
    ok('לא נדרס ע"י השם המורכב',
       e.sb.CBA.mock.years[Y].transactions[0].buyer === 'שם מפורש',
       e.sb.CBA.mock.years[Y].transactions[0].buyer);
  }

  section('5ב. 🔴🔴 Timestamp מ-Firestore מומר למחרוזת ISO');
  {
    /* 🔴 ה-SDK מחזיר Timestamp; Apps Script מחזיר מחרוזת ISO.
       `normDate` ב-`toTx` מצפה למחרוזת — אובייקט שובר את כל
       התאריכים **בשקט**, ואיתם הקיבוץ לחודשים. */
    const ISO = '2025-10-20T07:00:00.000Z';
    const stamp = { toDate: () => new Date(ISO) };
    const e = env({
      flags: { budgetYearFromFirestore: true }, isSuper: true,
      docs: { ['budgetYears/' + Y]: { year: Y, budget: [], income: [], groups: [], splits: [], items: [] } },
      cols: { budgetTx: [{ id: Y + '__1', year: Y, familyId: '3',
                 'מזהה': 1, 'מזהה משפחה': '3',
                 'תאריך רכישה': stamp, 'חודש הגשה': stamp }] }
    });
    await loadYear(e);
    const t0 = e.sb.CBA.mock.years[Y].transactions[0];
    ok('🔴 התאריך נורמל כמו במסלול הישן', t0.date === '2025-10-20', t0.date);
    ok('🔴 וחודש ההגשה גם הוא', t0.month === '2025-10', t0.month);
  }

  section('6. המבנה');
  /* 🔴 הברירה חייבת להיות true — אחרת `fsFirstRead` מקצרת
     לפני שהיא קוראת את הדגל החי, והדגל הופך לחסר-משמעות. */
  ok('🔴 הברירה בקוד true, והכיבוי דרך הדגל החי',
     /var BUDGET_YEAR_FROM_FIRESTORE = true;/.test(SH));
  ok('משתמש ב-fsFirstRead המשותף ולא במנגנון משלו',
     /CBA\.data\.fsFirstRead\("budgetYear"/.test(SH));
  /* 🔴 מ-15.9 הקריאה לתנועות חולצה ל-`fsTxRows`, כדי
     שגם המטען הראשי (צעד 09ב-5ג) ישתמש באותה אחת.
     הדרישה לא השתנתה: **כל ערך עובר דרך הנירוול.** */
  ok('🔴 וכל ערך מ-Firestore עובר דרך הנירוול',
     /budget: fsPlainRows\(doc\.budget\)/.test(SH) &&
     /function deliver\(raw\) \{ if \(!failed\) done\(null, fsPlainRows\(raw\)\); \}/.test(SH) &&
     /transactions: txWithNames\(rows\)/.test(SH));
  ok('⚠️ והשנה הבודדת צורכת את אותה פונקציה',
     /fsTxRows\(y, seesBudget, function \(err, rr\)/.test(SH));

  console.log('\n' + (fail ? '\u2717' : '\u2713') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
