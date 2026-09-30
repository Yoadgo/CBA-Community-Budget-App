/* גל 12 (1.10.2026) — נוחות לתושב + Q2/Q3.
   בדיקות לוגיקה (jsdom) לכל פריט: RA3, GA1, WA1/WA2/WA3, KA1, SRA1, A6, Q2, Q3. */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const ROOT = path.join(__dirname, '..');
const R = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (d ? '  → ' + d : '')); } };
const section = t => console.log('\n' + t);

function dom(scripts, pre) {
  const d = new JSDOM('<!doctype html><html dir="rtl"><body></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/' });
  const w = d.window;
  w.eval('window.CBA = window.CBA || {}; CBA.esc = function(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c];});};');
  if (pre) w.eval(pre);
  scripts.forEach(f => w.eval(R(f)));
  return w;
}

(async () => {
  section('Q2 — חלון אדום: "ביטול" ממוקד');
  {
    const w = dom(['js/ui/dialog.js']);
    w.CBA.ui.confirm('למחוק?', { danger: true, okText: 'מחיקה' });
    await new Promise(r => setTimeout(r, 90));
    const ae = w.document.activeElement;
    ok('🔴 במחיקה המיקוד על "ביטול"', ae && ae.getAttribute('data-dlg') === 'cancel', ae && ae.outerHTML.slice(0, 80));
    const w2 = dom(['js/ui/dialog.js']);
    w2.CBA.ui.confirm('לשמור?', { okText: 'שמירה' });
    await new Promise(r => setTimeout(r, 90));
    ok('ובחלון רגיל — על האישור, כמו קודם', w2.document.activeElement.getAttribute('data-dlg') === 'ok');
    const w3 = dom(['js/ui/dialog.js']);
    w3.CBA.ui.prompt('סיבה?', { danger: true });
    await new Promise(r => setTimeout(r, 90));
    ok('ובחלון אדום עם שדה — המיקוד בשדה', w3.document.activeElement.classList.contains('cba-dlg__input'));
  }

  section('Q3 — הסיור מחכה עד ששום חלון לא פתוח');
  {
    const T = R('js/ui/tour.js');
    ok('maybeAutoStart עובר דרך whenClear', /whenClear\(function \(\) \{ if \(!el\) open\(steps\.slice\(\)\); \}\)/.test(T));
    const w = dom(['js/ui/tour.js']);
    const oo = w.CBA.tour._overlayOpen;
    ok('בלי כלום פתוח — פנוי', oo() === false);
    w.document.body.classList.add('has-cba-dlg');
    ok('חלון כללי פתוח — תפוס', oo() === true);
    w.document.body.classList.remove('has-cba-dlg');
    const d = w.document.createElement('div'); d.setAttribute('role', 'dialog');
    d.getBoundingClientRect = () => ({ width: 300, height: 400, left: 10, right: 310, top: 10, bottom: 410 });
    w.document.body.appendChild(d);
    ok('מגירה גלויה (role=dialog) — תפוס', oo() === true);
    d.getBoundingClientRect = () => ({ width: 300, height: 400, left: 2000, right: 2300, top: 10, bottom: 410 });
    ok('מגירה סגורה מחוץ למסך — לא נספרת', oo() === false);
    d.hidden = true;
    d.getBoundingClientRect = () => ({ width: 300, height: 400, left: 10, right: 310, top: 10, bottom: 410 });
    ok('[hidden] — לא נספר', oo() === false);
    ok('תקרה: 400 ניסיונות × 1.5ש׳ = 10 דקות', /tries >= 400/.test(T) && /1500\)/.test(T));
  }

  section('RA3 — "מתי יגיע הכסף?"');
  {
    const pre = 'CBA.screens={}; CBA.data={ expectedRefundDate:function(t){var p=String(t.month).split("-"),y=+p[0],m=+p[1]+1;if(m>12){m=1;y++;}return y+"-"+String(m).padStart(2,"0")+"-01";}, hebrewDate:function(iso){var M=["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];var p=iso.split("-");return (+p[2])+" ב"+M[+p[1]-1]+" "+p[0];} }; CBA.formatILSWhole=function(n){return "₪"+Math.round(n).toLocaleString("en-US");};';
    const w = dom(['js/screens/resident.js'], pre);
    const f = w.CBA.screens._nextCreditLine;
    const now = new Date(2026, 9, 1);
    ok('אין החזר מאושר — ריק (הכותרת הרגילה)', f([{ payType: 'refund', status: 'submitted', amount: 100, month: '2026-10' }], now) === '');
    ok('החזר מאושר ב-10 → "ייכנסו ב־1 בנובמבר"', f([{ payType: 'refund', status: 'ready', amount: 1240, month: '2026-10' }], now) === '₪1,240 ייכנסו ב־1 בנובמבר', f([{ payType: 'refund', status: 'ready', amount: 1240, month: '2026-10' }], now));
    ok('רק החודש הקרוב נספר', f([{ payType: 'refund', status: 'ready', amount: 100, month: '2026-10' }, { payType: 'refund', status: 'ready', amount: 50, month: '2026-11' }], now).indexOf('₪100 ') === 0);
    ok('🔴 שולם / בבדיקה / תשלום לספק — לא נספרים', f([{ payType: 'refund', status: 'paid', amount: 9, month: '2026-10' }, { payType: 'supplier', status: 'ready', amount: 9, month: '2026-10' }], now) === '');
    ok('חודש שעבר ולא שולם — "בהעברה הקרובה" (בלי תאריך שחלף)', f([{ payType: 'refund', status: 'ready', amount: 300, month: '2026-08' }], now) === '₪300 אושרו ויגיעו בהעברה הקרובה');
    ok('ב-1 לחודש עצמו — עדיין "ייכנסו ב־1"', /ייכנסו ב־1 באוקטובר$/.test(f([{ payType: 'refund', status: 'ready', amount: 7, month: '2026-09' }], now)));
    ok('🔴 ב-2 לחודש, תאריך ה-1 כבר עבר — "בהעברה הקרובה"', f([{ payType: 'refund', status: 'ready', amount: 7, month: '2026-09' }], new Date(2026, 9, 2)) === '₪7 אושרו ויגיעו בהעברה הקרובה');
    ok('שנה אחרת — עם השנה', /ב־1 בינואר 2027$/.test(f([{ payType: 'refund', status: 'ready', amount: 5, month: '2026-12' }], now)));
    ok('החופה משתמשת בה (עם נפילה לכותרת הרגילה)', /sub: nextCreditLine\(allYears\) \|\| /.test(R('js/screens/resident.js')));
  }

  section('GA1 — אריח המכון כתום מתחת ל-14 יום');
  {
    const H = R('js/screens/home.js');
    ok('הסף 14 והמחלקה', /g\.days < 14;/.test(H) && /classList\.toggle\("hm2-tile--warn", soon\)/.test(H));
    ok('הטקסט "המנוי נגמר בעוד"', /"המנוי נגמר בעוד " \+/.test(H));
    ok('CSS קיים', /\.hm2-tile--warn \{/.test(R('css/home2.css')));
  }

  section('WA1/WA2/WA3 — WeWork');
  {
    const W = R('js/screens/resWework.js');
    ok('WA1 סופר כמו השרת: אותו יום, חפיפת שעות', /b\.date === st\.day && b\.from < to && from < b\.to/.test(W));
    ok('WA1 חוסם כשהגיעו למקסימום', /if \(n >= lim\) return \{ block: true/.test(W) && /var can = full === -1 && !lim\.block;/.test(W));
    ok('WA2 פס דביק בטלפון בלבד', /\.ww-sendbar \{ display: none; \}/.test(R('css/wework.css')) && /position: sticky/.test(R('css/wework.css').split('WA2 (גל 12)')[1] || ''));
    ok('WA2 שליחה אחת בלבד (שני כפתורים)', /if \(st\.booking\) return;/.test(W));
    ok('WA3 "איך נכנסים?" בכרטיס השריון', /data-ww-guide>איך נכנסים\?<\/button>/.test(W) && /CBA\.doorGuide\.open\("wework"\)/.test(W));
    const w = dom(['js/ui/doorButton.js'], 'CBA.door={};');
    ok('WA3 חפיסת WeWork בלי מנוי/Nuki', w.CBA.doorGuide.STEPS_WW.length === 3 && !JSON.stringify(w.CBA.doorGuide.STEPS_WW).match(/Nuki|מנוי|מכון/));
    w.localStorage.clear();
    w.CBA.doorGuide.open('wework'); w.CBA.doorGuide.close();
    ok('🔴 WA3 לא מסמן את הסבר המכון כ"נראה"', w.localStorage.getItem('cba_door_guide_seen_v2') === null);
    w.CBA.doorGuide.open(); w.CBA.doorGuide.close();
    ok('הסבר המכון עדיין מסמן את עצמו', w.localStorage.getItem('cba_door_guide_seen_v2') === '1');
  }

  section('KA1 — חיוג / וואטסאפ');
  {
    const w = dom(['js/ui/dialog.js']);
    const n = w.CBA.waNumber;
    ok('0521234567 → 972521234567', n('052-123-4567') === '972521234567');
    ok('+972 נשמר', n('+972 52 123 4567') === '972521234567');
    ok('קווי 03 → 9723…', n('03-1234567') === '97231234567');
    ok('מספר לא תקין — בלי וואטסאפ', n('123') === '' && n('') === '');
    const sh = w.CBA.contactSheet('דנה כהן', '052-1234567', 'בית 12');
    const html = w.document.body.innerHTML;
    ok('גיליון עם חיוג ווואטסאפ', /href="tel:0521234567"/.test(html) && /href="https:\/\/wa\.me\/972521234567"/.test(html));
    ok('במחשב — חלון (role=dialog, הסיור יחכה לו)', !!w.document.querySelector('[role="dialog"] .cs') && w.document.body.classList.contains('has-cba-dlg'));
    const wm = dom(['js/ui/dialog.js'], 'window.matchMedia=function(q){return {matches:/max-width/.test(q)};};');
    wm.CBA.contactSheet('דנה כהן', '052-1234567', '');
    ok('בטלפון — גיליון תחתון עם "סגירה"', !!wm.document.querySelector('.gt-sheet[role="dialog"] .cs [data-cs-close]'));
    const C = R('js/screens/committeeTree.js');
    ok('עץ הוועד: שם עם טלפון = כפתור, רק בתצוגת תושבים', /if \(!edit && w\.kind === "res" && w\.phone\)/.test(C));
    ok('🔒 עותק השמות במכשיר עדיין בלי טלפונים', /names\[p\.key\] = \{ n: p\.full, h: p\.house \};/.test(C));
    ok('"לא נמצא" כשהחיפוש לא מצא', /class="ct-nohit"/.test(C));
    ok('מדריך: וואטסאפ ליד כל טלפון', /class="dir-wa" href="https:\/\/wa\.me\/'/.test(R('js/screens/resident.js')));
  }

  section('SRA1 — "שכנים" בחיפוש פותח מדריך מסונן');
  {
    const S = R('js/ui/search.js');
    ok('התוצאה פותחת openDirectory עם שם המשפחה', /run: function \(\) \{ openDirectory\(family \|\| house \|\| firsts\); \}/.test(S));
    ok('שני המסכים יודעים לקבל חיפוש', /focusSearch: function \(q\)/.test(R('js/screens/resident.js')) && /CBA\.screens\.residents\.focusSearch = function \(q\)/.test(R('js/screens/residents.js')));
  }

  section('A6 — שבת שלום / חג שמח');
  {
    const w = dom(['js/screens/home.js'], 'CBA.screens={}; CBA.data={};');
    const f = w.CBA._shabbatInfo;
    const items = [
      { category: 'holiday', title: 'x', date: '2026-10-02', hebrew: 'סוכות ז׳ (הושענא רבה)' },
      { category: 'candles', date: '2026-10-02T18:05:00+03:00' },
      { category: 'holiday', date: '2026-10-03', hebrew: 'שמיני עצרת', yomtov: true },
      { category: 'havdalah', date: '2026-10-03T19:00:00+03:00' }
    ];
    ok('חמישי — מחוץ לחלון', f(items, new Date('2026-10-01T15:00:00+03:00')) === null);
    ok('שישי בבוקר — עוד לא', f(items, new Date('2026-10-02T10:00:00+03:00')) === null);
    const a = f(items, new Date('2026-10-02T14:00:00+03:00'));
    ok('שישי אחה"צ, חג בשבת — "שבת שלום וחג שמח" + ערב החג + הדלקה', a && a.greet === 'שבת שלום וחג שמח' && a.line === 'ערב שמיני עצרת · הדלקת נרות 18:05', JSON.stringify(a));
    const b = f(items, new Date('2026-10-03T11:00:00+03:00'));
    ok('בשבת — צאת השבת', b && /צאת השבת 19:00$/.test(b.line), JSON.stringify(b));
    ok('אחרי ההבדלה — כלום', f(items, new Date('2026-10-03T19:30:00+03:00')) === null);
    const plain = [{ category: 'candles', date: '2026-10-09T17:57:00+03:00' }, { category: 'havdalah', date: '2026-10-10T18:52:00+03:00' }];
    const c = f(plain, new Date('2026-10-09T13:00:00+03:00'));
    ok('שבת רגילה — "שבת שלום · הדלקת נרות"', c && c.greet === 'שבת שלום' && c.line === 'הדלקת נרות 17:57', JSON.stringify(c));
    const H = R('js/screens/home.js');
    ok('נכשל בשקט (catch) ונשמר 12 שעות', /\.catch\(function \(\) \{ cb\(null\); \}\)/.test(H) && /12 \* 3600 \* 1000/.test(H));
  }

  console.log('\n' + (fail ? '✗' : '✓') + '  ' + pass + ' עברו, ' + fail + ' נכשלו');
  process.exit(fail ? 1 : 0);
})();
