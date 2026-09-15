/* בדיקות לשלילת גישה ב-Firestore (2026-09-14, סוגר את חוסם צעד 03).
   הרצה:  node tools/test-member-revoke.js

   🔴 מה שנבדק כאן הוא **דליפה שקטה**, לא קריסה: תושב שסומן "עזב" מאבד גישה
   דרך Apps Script, אבל כללי האבטחה של Firestore רואים רק את `members/{uid}`.
   בלי סנכרון, מי שעזב היה ממשיך לקרוא כל תחום שייפתח — בלי שום שגיאה. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));
const section = t => console.log('\n' + t);
const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8');

/* ---------- גיליון מדומה ---------- */
const HEAD = ['מזהה קבוע','משפחה','בית','סטטוס','אימייל 1','הרשאות 1','מזהה Firebase 1',
                                                 'אימייל 2','הרשאות 2','מזהה Firebase 2'];
let rows, writes, SS;
function reset() {
  writes = [];
  rows = [HEAD.slice(),
    ['1','גולן','401','פעיל','a@x.com','תקציב','UID-A','b@x.com','גינון','UID-B'],
    ['2','כהן','402','פעיל','c@x.com','','',                 '','','']];
  const sh = {
    getLastColumn: () => HEAD.length,
    getLastRow: () => rows.length,
    getRange: (r,c,nr,nc) => ({
      getValues: () => { const o=[]; for(let i=0;i<(nr||1);i++){ const row=rows[r-1+i]||[]; const s=[];
        for(let j=0;j<(nc||1);j++) s.push(row[c-1+j]===undefined?'':row[c-1+j]); o.push(s);} return o; },
      setValue: v => { rows[r-1][c-1] = v; },
      setValues: v => { v.forEach((rr,i)=>rr.forEach((vv,j)=>{ rows[r-1+i]=rows[r-1+i]||[]; rows[r-1+i][c-1+j]=vv; })); },
      setFontWeight: () => {}
    })
  };
  SS = { getSheetByName: n => (n === 'תושבים' ? sh : null) };
  sandbox.SpreadsheetApp.getActiveSpreadsheet = () => SS;
  sandbox.PERMS_MEMO_ = {};
}

const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', computeHmacSha256Signature: () => [1], base64EncodeWebSafe: () => 'x' },
  LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put(){} }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => '', setProperty(){} }) },
  SpreadsheetApp: { getActiveSpreadsheet: () => SS, flush(){} },
  DriveApp: {}, CalendarApp: {}, MailApp: { sendEmail(){} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  ScriptApp: {}, UrlFetchApp: { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox);
sandbox.json_ = o => o;
sandbox.fsSet_ = (p, o) => { writes.push({ path: p, obj: o }); return {}; };
/* permissionsFor_ האמיתית תלויה ב-lookupResident_; מחליפים רק אותה, לפי הגיליון המדומה */
sandbox.lookupResident_ = (email) => {
  const key = String(email||'').trim().toLowerCase();
  for (let r = 1; r < rows.length; r++) {
    for (const slot of [[4,5],[7,8]]) {
      if (String(rows[r][slot[0]]||'').trim().toLowerCase() !== key || !key) continue;
      return { found:true, status: rows[r][3], permissions: rows[r][slot[1]],
               familyId: rows[r][0], family: rows[r][1], house: rows[r][2],
               firstName:'', isExternal:false };
    }
  }
  return { found:false };
};

/* ================================================================= */
section('1. הפונקציה קיימת ומחוברת לכל מסלולי הכתיבה');
ok('fbSyncRow_ מוגדרת', typeof sandbox.fbSyncRow_ === 'function');
ok('⚠️ נקראת מ-saveResidentRow_ (כל עריכת שורה)',
   /if \(!written\.length\)[\s\S]{0,600}?fbSyncRow_\(ss, rowIdx\);/.test(CODE));
ok('⚠️ נקראת בסימון "עזב" ביצירת משקי בית',
   /setValue\('עזב'\);[\s\S]{0,200}?fbSyncRow_\(ss, rn\);/.test(CODE));
ok('⚠️ ונקראת ב"משפחה עזבה, נכנסה חדשה"', /fbSyncRow_\(ss, oldRow\);/.test(CODE));
ok('מנקה את PERMS_MEMO_ לפני הקריאה',
   /delete PERMS_MEMO_\[key\];[\s\S]{0,200}?permissionsFor_\(email\)/.test(CODE));

/* ================================================================= */
section('2. תושב פעיל — מסונכרן כרגיל');
reset();
let n = sandbox.fbSyncRow_(SS, 2);
ok('שתי משבצות סונכרנו', n === 2, String(n));
ok('הנתיבים לפי ה-uid שבשורה',
   writes.map(w=>w.path).join(',') === 'members/UID-A,members/UID-B', writes.map(w=>w.path).join(','));
ok('active=true לפעיל', writes.every(w=>w.obj.active === true));
ok('הרשאות משבצת 1', JSON.stringify(writes[0].obj.perms) === '["תקציב"]', JSON.stringify(writes[0].obj.perms));
ok('⚠️ והרשאות משבצת 2 **שונות** — לא הועתקו מהראשונה',
   JSON.stringify(writes[1].obj.perms) === '["גינון"]', JSON.stringify(writes[1].obj.perms));
ok('familyId מהשורה', writes[0].obj.familyId === '1');

/* ================================================================= */
section('3. 🔴 סומן "עזב" — הגישה נשללת');
reset();
rows[1][3] = 'עזב';
writes = [];
sandbox.fbSyncRow_(SS, 2);
ok('⚠️ **active=false בשתי המשבצות**', writes.length === 2 && writes.every(w=>w.obj.active === false),
   JSON.stringify(writes.map(w=>w.obj.active)));
ok('המסמך לא נמחק — רק כובה', writes.every(w=>!!w.obj.updatedAt));
ok('⚠️ ו-isMember() בכללים דורש active==true',
   /return memberExists\(\) && m\(\)\.active == true;/.test(
     fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8')));

/* ================================================================= */
section('4. 🔴 המייל נמחק מהשורה — גם זו שלילה');
reset();
rows[1][4] = '';
writes = [];
sandbox.fbSyncRow_(SS, 2);
ok('משבצת 1 כובתה', writes[0].obj.active === false, JSON.stringify(writes[0].obj));
ok('⚠️ ובלי הרשאות', JSON.stringify(writes[0].obj.perms) === '[]', JSON.stringify(writes[0].obj.perms));
ok('משבצת 2 לא נפגעה', writes[1].obj.active === true && writes[1].obj.perms.length === 1);

/* ================================================================= */
section('5. מי שמעולם לא התחבר — אין מה לסנכרן');
reset();
writes = [];
n = sandbox.fbSyncRow_(SS, 3);   // שורה בלי uid בכלל
ok('⚠️ אפס כתיבות', n === 0 && writes.length === 0, n + '/' + writes.length);

/* ================================================================= */
section('6. עמידות');
reset(); writes = [];
ok('שורה לא קיימת — 0', sandbox.fbSyncRow_(SS, 0) === 0);
ok('שורת הכותרת — 0', sandbox.fbSyncRow_(SS, 1) === 0);
const realSet = sandbox.fsSet_;
sandbox.fsSet_ = () => { throw new Error('Firestore down'); };
ok('⚠️ כישלון Firestore לא זורק — מחזיר -1', sandbox.fbSyncRow_(SS, 2) === -1);
sandbox.fsSet_ = realSet;
ok('ואחרי שחזור — עובד שוב', sandbox.fbSyncRow_(SS, 2) === 2);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
