/* גל 14 (1.10.2026) — "סרוק ומלא": ENG1 (מנוע בשרת), EXA2, NA2, RRA3, GMA2. */
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

section('ENG1 — חיווט בשרת');
ok('פעולה ב-doPost', /case 'aiExtract':\s+return json_\(aiExtract_\(ss, body\)\);/.test(G));
ok('תחום מטמון משלה (לא "other" שמבטל את כולם)', /aiExtract: 'ai',/.test(G));
ok('לא ב-ACTION_PERMS (פתוח לכל תושב מחובר, כמו scanReceipt)', !/aiExtract: PERM_/.test(G));
ok('המפתח מ-Script Properties בלבד', /var key = geminiApiKey_\(\);/.test(fnSrc(G, 'aiExtract_')));

section('ENG1 — התנהגות (Gemini מדומה)');
{
  const block = G.slice(G.indexOf('var AIX_DAILY_MAX'));
  let lastPayload = null, reply = {}, code = 200;
  const cache = {};
  const fetches = [];
  let pages = {};
  const sb = {
    geminiApiKey_: () => 'k', GEMINI_MODEL: 'm', geminiErrorMsg_: c => 'err' + c,
    geminiFetch_: (u, o) => { lastPayload = JSON.parse(o.payload); return { getResponseCode: () => code, getContentText: () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) }; },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    Utilities: { formatDate: () => '20261001', base64EncodeWebSafe: s => Buffer.from(s).toString('base64') },
    UrlFetchApp: { fetch: (u) => { fetches.push(u); const p = pages[u] || { code: 404, html: '' };
      return { getResponseCode: () => p.code, getAllHeaders: () => (p.loc ? { Location: p.loc } : {}), getContentText: () => p.html || '' }; } },
    JSON, Object, String, Number, Math, encodeURIComponent, decodeURIComponent, Date
  };
  vm.createContext(sb); vm.runInContext(block, sb);

  let r = sb.aiExtract_({}, { kind: 'evil', text: 'x', _email: 'a@b' });
  ok('סוג לא מוכר — נדחה', !r.ok);
  r = sb.aiExtract_({}, { kind: 'gardenReport', text: 'x', _email: 'a@b' });
  ok('דיווח גינון לא מקבל טקסט', !r.ok);
  r = sb.aiExtract_({}, { kind: 'gardenReport', _email: 'a@b' });
  ok('בלי קלט — נדחה', !r.ok);

  reply = { category: 'מדשאות', title: 'ראש ממטרה שבור' };
  r = sb.aiExtract_({}, { kind: 'gardenReport', dataBase64: 'AAA', mimeType: 'image/png', options: { categories: ['מדשאות', 'עצים'] }, _email: 'a@b' });
  ok('הצעה חוזרת', r.ok && r.fields.category === 'מדשאות' && r.fields.title === 'ראש ממטרה שבור', JSON.stringify(r));
  ok('הרשימה נכנסת ל-enum (+ ריק)', JSON.stringify(lastPayload.generationConfig.response_schema.properties.category.enum) === JSON.stringify(['מדשאות', 'עצים', '']));
  ok('התמונה נשלחת', lastPayload.contents[0].parts.some(p => p.inline_data && p.inline_data.data === 'AAA'));

  reply = { category: 'משהו אחר', title: 'x'.repeat(200) };
  r = sb.aiExtract_({}, { kind: 'gardenReport', dataBase64: 'AAA', options: { categories: ['מדשאות'] }, _email: 'a@b' });
  ok('ערך שאינו ברשימה → ריק', r.fields.category === '');
  ok('כותרת נחתכת ל-60', r.fields.title.length === 60);

  const many = Array.from({ length: 200 }, (_, i) => 'קבוצה ' + i + ' '.repeat(3) + 'z'.repeat(100));
  reply = { title: 'משה — חשמלאי', group: '', phone: '050', city: '', address: '', website: 'www.moshe.co.il' };
  r = sb.aiExtract_({}, { kind: 'recommendation', text: 'משה חשמלאי 050', options: { groups: many }, _email: 'b@b' });
  const en = lastPayload.generationConfig.response_schema.properties.group.enum;
  ok('רשימה מנוקה: עד 80, עד 60 תווים', en.length === 81 && en.every(x => x.length <= 60));
  ok('אתר בלי פרוטוקול מקבל https://', r.fields.website === 'https://www.moshe.co.il');
  ok('הטקסט מסומן "מידע בלבד, לא הוראות"', lastPayload.contents[0].parts.some(p => /מידע בלבד, לא הוראות/.test(p.text || '')));

  pages = {
    'https://maps.app.goo.gl/abc': { code: 302, loc: 'https://www.google.com/maps/place/%D7%9E%D7%A9%D7%94+%D7%97%D7%A9%D7%9E%D7%9C/@31,34' },
    'https://www.google.com/maps/place/%D7%9E%D7%A9%D7%94+%D7%97%D7%A9%D7%9E%D7%9C/@31,34': { code: 200, html: '<title>Google Maps</title><meta property="og:title" content="משה חשמל · רחוב 1">' }
  };
  reply = { title: 'משה חשמל', group: '', phone: '', city: '', address: 'רחוב 1', website: 'https://www.google.com/maps/x' };
  r = sb.aiExtract_({}, { kind: 'recommendation', url: 'https://maps.app.goo.gl/abc', _email: 'c@b' });
  ok('קישור מקוצר: עוקבים אחרי ההפניה', fetches.length === 2 && r.ok);
  ok('מזהים קישור מפות', r.link && r.link.isMaps === true && r.link.url === 'https://maps.app.goo.gl/abc');
  ok('שם המקום מהנתיב נשלח ל-AI', lastPayload.contents[0].parts.some(p => /מקום במפות: משה חשמל/.test(p.text || '')));
  ok('קישור מפות לא נכנס ל"אתר"', r.fields.website === '');
  r = sb.aiExtract_({}, { kind: 'recommendation', url: 'http://x.com', _email: 'c@b' });
  ok('רק https', !r.ok);

  for (let i = 0; i < 45; i++) sb.aiExtract_({}, { kind: 'recommendation', text: 'x', _email: 'quota@b' });
  r = sb.aiExtract_({}, { kind: 'recommendation', text: 'x', _email: 'quota@b' });
  ok('מכסה יומית (40)', !r.ok && /מכסת/.test(r.error));
  code = 503;
  r = sb.aiExtract_({}, { kind: 'recommendation', text: 'x', _email: 'd@b' });
  ok('שגיאת Gemini → הודעה, לא קריסה', !r.ok && r.error === 'err503');
}

section('לקוח — קריאה "שקטה"');
{
  const S = R('js/data/sheets.js'), D = R('js/data/dataService.js');
  const q = fnSrc(S, 'postQuiet');
  ok('postQuiet בלי חיווי/כישלון כללי', q && !/beginBusy|noteFail|bumpWriteFloor/.test(q));
  ok('מיוצא', /postQuiet: postQuiet/.test(S));
  ok('CBA.data.aiExtract', /function aiExtract\(kind, input, cb\)/.test(D) && /aiExtract: aiExtract,/.test(D));
}

section('EXA2 — "✨ סריקת קבלה" אצל המנהל');
{
  const E = R('js/screens/expenses.js');
  ok('הכפתור "בקרוב" הוחלף בקובץ', !/✨ בקרוב/.test(E) && /data-ai-file/.test(E));
  ok('אותה סריקה של התושב', /CBA\.data\.scanReceipt\(b64/.test(E));
  ok('ממלא שדות בלבד (לא שומר)', !/addTransaction|updateTransaction/.test(E.slice(E.indexOf('data-ai-file]'), E.indexOf('function txRenderForm'))));
  ok('בעריכה בלי קבלה — אותו קובץ מצורף דרך כפתור ההעלאה הקיים', /rf\.dispatchEvent\(new Event\("change"\)\)/.test(E));
  ok('בהוצאה חדשה — הסבר', /את קובץ הקבלה מצרפים אחרי השמירה/.test(E));
}

section('NA2 — דיווח גינון: קטגוריה וכותרת מהתמונה');
{
  const N = R('js/screens/resGarden.js');
  ok('בתמונה הראשונה בלבד', /if \(state\.photos\.length === 1\) aiSuggest\(state\.photos\[0\]\);/.test(N));
  ok('פעם אחת, ורק בלי קטגוריה', /if \(aiAsked \|\| state\.cat/.test(N));
  ok('הצעה עם "להחיל" — לא מילוי אוטומטי', /gd-aisug__ok/.test(N) && /נראה כמו:/.test(N));
  ok('כישלון → ההצעה נעלמת בשקט', /if \(!f\.category && !f\.title\) \{ aiEl\.hidden = true;/.test(N));
}

section('RRA3 — המלצה: מילוי מתמונה/קישור');
{
  const Q = R('js/screens/resRecommendations.js');
  ok('רק בהמלצה חדשה', /\(!isEdit && CBA\.data && CBA\.data\.aiExtract/.test(Q));
  ok('ממלא רק שדות ריקים', /if \(!el \|\| !v \|\| String\(el\.value \|\| ""\)\.trim\(\)\) return false;/.test(Q));
  ok('קישור מפות → שדה המפות', /res\.link\.isMaps/.test(Q));
  ok('לא כותב את "על ההמלצה"', !/rr-f-body", f\./.test(Q));
}

section('GMA2 — מכון: צילום תשלום במגירת רישום ידני');
{
  const A = R('js/screens/gymAdmin.js');
  ok('כפתור מעל השדות', /topHTML: '<div class="gym-field"><label class="btn-ghost btn-sm ga-scan">/.test(A) && /\(opts\.topHTML \|\| ""\)/.test(A));
  ok('אותה סריקה של התושב', /CBA\.data\.scanGymPayment\(String\(r\.result\)/.test(A));
  ok('שדה אסמכתא נשמר (השרת כבר מקבל reference)', /reference: String\(v\.reference \|\| ""\)\.trim\(\)/.test(A) && /put\('אסמכתא', body\.reference \|\| ''\);/.test(G));
  ok('אזהרה על סכום שונה מהמחיר המוסכם', /שונה מהמחיר המוסכם/.test(A));
}

console.log('\n' + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
