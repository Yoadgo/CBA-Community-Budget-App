/* ============================================================================
   test-community-directory-privacy.js — 1.10.2026 (ספר האבנים פרק 13)
   handleCommunityDirectory_ (מדריך התושבים הציבורי) שולח לכל תושב:
     • רק שורות פעילות (סטטוס ריק / "פעיל"), בלי שורות ריקות;
     • ילדים כ"שם (גיל)" — בלי תאריכי לידה;
     • בלי אימייל ובלי עמודות שלא ברשימת keep_.
   הרצה: node tools/test-community-directory-privacy.js
   ============================================================================ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const CODE = fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.log('  ✗ ' + name); } }

const HEAD = ['מזהה קבוע', 'שם משפחה', 'מספר בית', 'שם פרטי 1', 'שם פרטי 2', 'טלפון 1', 'אימייל 1', 'ילדים', 'סטטוס'];
const ROWS = [
  HEAD,
  ['401', 'גולן', '401', 'יועד', 'נועה', '052-1234567', 'a@b.c', '[{"name":"איתי","dob":"2019-05-02"},{"name":"מאיה","dob":"2021-11-10"}]', 'פעיל'],
  ['402', 'לוי', '402', 'דנה', '', '054-7654321', 'd@b.c', '[]', ''],
  ['403', 'כהן', '403', 'אבי', '', '050-1112233', 'x@b.c', 'שירה, יונתן', 'פעיל'],
  ['405', 'ברק', '405', 'עומר', '', '058-4443322', 'o@b.c', '[{"name":"גיא","dob":"2018-01-01"}]', 'עזב'],
  ['', '', '', '', '', '', '', '', '']
];
const FAKE_SS = { getSheetByName: n => n === 'תושבים' ? { getDataRange: () => ({ getValues: () => ROWS }) } : null };
const sandbox = {
  console,
  Utilities: { getUuid: () => 'x', formatDate: d => d.toISOString().substring(0, 10) },
  Session: { getScriptTimeZone: () => 'Asia/Jerusalem' },
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
sandbox.authorize_ = () => ({ ok: true, email: 'a@b.c', perm: { perms: [] } });

console.log('\nמדריך התושבים — מה השרת שולח');
const res = JSON.parse(sandbox.handleCommunityDirectory_({}));
ok('ok: true', res.ok === true);
const ids = res.rows.map(r => String(r['מזהה קבוע']));
ok('3 שורות פעילות בלבד (401, 402, 403)', ids.join(',') === '401,402,403');
ok('מי שעזב (405) לא נשלח בכלל — גם לא הטלפון שלו', ids.indexOf('405') === -1 && JSON.stringify(res).indexOf('058-4443322') === -1);
ok('שורה ריקה לא נשלחת', res.rows.every(r => String(r['שם משפחה'] || r['מספר בית'] || '').trim()));
const all = JSON.stringify(res);
ok('אין תאריכי לידה בתשובה', !/\d{4}-\d{2}-\d{2}/.test(all) && all.indexOf('dob') === -1);
const k401 = res.rows[0]['ילדים'];
ok('ילדים כ"שם (גיל)": ' + k401, /^איתי \(\d+\), מאיה \(\d+\)$/.test(k401));
ok('"[]" (כל הילדים הוסרו) → ריק', res.rows[1]['ילדים'] === '');
ok('טקסט ישן נשאר כמו שהוא', res.rows[2]['ילדים'] === 'שירה, יונתן');
ok('אין אימייל', all.indexOf('@b.c') === -1);
ok('טלפון של פעיל כן נשלח (זה המדריך)', res.rows[0]['טלפון 1'] === '052-1234567');

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
