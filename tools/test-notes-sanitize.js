/* NTB1+NTB2 (גל 9, 1.10.26) — פנקס ההערות: XSS שמור ושם העורך.
   הרצה:  node tools/test-notes-sanitize.js

   🔴 עד היום notes.js הזריק את n.content גולמי לתוך contenteditable, והשרת
   (saveNotes_) שמר את body.content כמו שהוא. כל בעל הרשאת תקציב יכול היה
   לשתול <img onerror> שרץ אצל מנהל-העל (והמושב יושב ב-localStorage).
   המארז בודק את שני הצדדים: השרת (vm על Code.gs) והלקוח (jsdom על notes.js). */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');
const NOTES = fs.readFileSync(path.join(ROOT, 'js', 'screens', 'notes.js'), 'utf8');

/* ================= צד השרת ================= */
let FAKE_SS;
const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', formatDate: d => d.toISOString().substring(0, 10),
               computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x',
               base64Encode: () => 'x', computeRsaSha256Signature: () => [1] },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem', getEffectiveUser: () => ({ getEmail: () => 'a@b.c' }) },
  Logger: { log() {} },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty() {} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => FAKE_SS, flush() {} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail() {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);

const S = sandbox.sanitizeNotesHtml_;
section('1. שרת — sanitizeNotesHtml_');
ok('הפונקציה קיימת', typeof S === 'function');
const XSS_IMG = '<img src=x onerror=alert(1)>';
ok('🔴 <img onerror> מנוטרל לגמרי', !/<img|onerror/i.test(S('שלום ' + XSS_IMG + ' עולם')), S(XSS_IMG));
ok('🔴 <script> נמחק עם תוכנו', !/script|alert/i.test(S('א<script>alert(1)</script>ב')), S('א<script>alert(1)</script>ב'));
ok('🔴 <script> לא סגור — אין תג', !/<script/i.test(S('<script src=//evil>alert(1)')));
ok('🔴 iframe/style/object/embed נמחקים', !/<(iframe|style|object|embed)/i.test(
  S('<iframe src=x></iframe><style>*{}</style><object data=x></object><embed src=x>')));
ok('🔴 מאפיינים מוסרים גם מתגים מותרים', S('<b onclick="alert(1)" style="x">חזק</b>') === '<b>חזק</b>',
  S('<b onclick="alert(1)" style="x">חזק</b>'));
ok('🔴 הסרה אינה "מדביקה" תג חדש', !/<img/i.test(S('<<x>img src=x onerror=alert(1)>')), S('<<x>img src=x onerror=alert(1)>'));
ok('🔴 ">" בתוך ערך מאפיין לא מבריח תג', !/<img/i.test(S('<b title="><img src=x onerror=alert(1)>">x</b>')));
ok('🔴 svg/onload נמחק', !/<svg|onload/i.test(S('<svg/onload=alert(1)>')));
ok('🔴 קישור javascript: — התג נמחק, הטקסט נשאר', S('<a href="javascript:alert(1)">לחצו</a>') === 'לחצו');
const FMT = '<h3>כותרת</h3><p><b>חזק</b> <i>נטוי</i> <u>קו</u> <strong>s</strong> <em>e</em></p>' +
            '<ol><li>אחד</li></ol><ul><li>שתיים</li></ul><div><span>ט</span><br></div>';
ok('עיצוב מותר שורד כמו שהוא', S(FMT) === FMT, S(FMT));
ok('<br/> מנורמל ל-<br>', S('א<br/>ב') === 'א<br>ב');
ok('ישויות קיימות נשמרות (אידמפוטנטי על פלט הלקוח)', S('a &amp; b &lt;c&gt;&nbsp;') === 'a &amp; b &lt;c&gt;&nbsp;');
ok('ריק/חסר ⇒ מחרוזת ריקה', S('') === '' && S(null) === '' && S(undefined) === '');

section('2. שרת — saveNotes_ שומר תוכן נקי ושם מהמושב (NTB2)');
let rows = [], logRows = [];
function sheet(store) {
  return { appendRow: r => store.push(r), setFrozenRows() {},
           getDataRange: () => ({ getValues: () => [['שנה', 'תוכן', 'נערך ע"י', 'בתאריך']].concat(store) }),
           getRange: () => ({ setValues() {} }) };
}
const shNotes = sheet(rows), shLog = sheet(logRows);
FAKE_SS = { getSheetByName: n => n === 'הערות' ? shNotes : n === 'יומן הערות' ? shLog : null,
            insertSheet: () => { throw new Error('לא צפוי'); } };
const res = sandbox.saveNotes_(FAKE_SS, {
  year: '2026', content: 'x' + XSS_IMG + '<b>y</b>', editedBy: 'מתחזה',
  _email: 'real@x.com', _perm: { firstName: 'יועד', family: 'גולן' }
});
ok('השמירה הצליחה', res && res.ok === true, JSON.stringify(res));
ok('🔴 התוכן שנשמר בגיליון נקי', rows[0] && rows[0][1] === 'x<b>y</b>', rows[0] && rows[0][1]);
ok('🔴 NTB2: שם העורך מהמושב, לא מגוף הבקשה', rows[0] && rows[0][2] === 'יועד גולן', rows[0] && rows[0][2]);
ok('🔴 NTB2: וגם ביומן העריכות', logRows[0] && logRows[0][3] === 'יועד גולן', logRows[0] && logRows[0][3]);
rows.length = 0; logRows.length = 0;
sandbox.saveNotes_(FAKE_SS, { year: '2027', content: '', editedBy: 'מתחזה', _email: 'real@x.com', _perm: {} });
ok('בלי שם בגיליון ⇒ האימייל המאומת', rows[0] && rows[0][2] === 'real@x.com', rows[0] && rows[0][2]);
ok('⚠️ body.editedBy אינו נקרא יותר בשרת', !/var editedBy = body\.editedBy/.test(CODE));

/* ================= צד הלקוח ================= */
section('3. לקוח — notes.js (jsdom)');
try {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only' });
  const w = dom.window;
  let alerted = false;
  w.alert = () => { alerted = true; };
  w.eval('window.CBA = { esc: function (s) { return String(s).replace(/[&<>"]/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); } };');
  w.eval(NOTES);
  const C = w.CBA.notesPanel.sanitize;
  ok('sanitize חשוף מהלוח', typeof C === 'function');
  ok('🔴 <img onerror> מנוטרל', !/<img|onerror/i.test(C('שלום ' + XSS_IMG)), C(XSS_IMG));
  ok('🔴 <script> נמחק עם תוכנו', !/script|alert/i.test(C('א<script>alert(1)</script>ב')), C('א<script>alert(1)</script>ב'));
  ok('🔴 מאפיינים מוסרים', C('<b onclick="alert(1)" style="x">חזק</b>') === '<b>חזק</b>');
  ok('🔴 svg/onload נמחק', !/<svg|onload/i.test(C('<svg><g onload="alert(1)"></g></svg>')));
  ok('תג לא מותר ⇒ טקסט נשאר', C('<a href="javascript:alert(1)">לחצו</a>') === 'לחצו');
  ok('עיצוב מותר שורד', C(FMT) === FMT, C(FMT));
  ok('🔴 הלקוח והשרת מסכימים על פלט הלקוח', S(C(FMT + XSS_IMG)) === C(FMT + XSS_IMG));
  /* ציור אמיתי: פותחים את הלוח עם תוכן זדוני שמור. */
  w.CBA.data = { getNotes: () => ({ content: XSS_IMG + '<script>alert(2)</script><b>טקסט</b>' }),
                 getCurrentYear: () => '2026', hebrewDateTime: () => '' };
  w.CBA.notesPanel.open();
  const ed = w.document.getElementById('notes-editor');
  ok('🔴 העורך המצויר אינו מכיל img/script', ed && !ed.querySelector('img,script') && /טקסט/.test(ed.innerHTML), ed && ed.innerHTML);
  ok('🔴 ואף alert לא רץ', !alerted);
  ok('⚠️ גם השמירה עוברת ניקוי', /var content = sanitize\(editorEl\.innerHTML\)/.test(NOTES));
} catch (e) {
  ok('jsdom רץ', false, e && e.message);
}

console.log('\n' + (fail ? '❌' : '✅') + ' ' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
