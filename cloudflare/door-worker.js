/* ============================================================================
 *  door-worker.js — פתיחת הדלת המהירה (Cloudflare Worker "cba-door")  26.9.2026
 * ----------------------------------------------------------------------------
 *  למה זה קיים: Apps Script לקח ~6 שניות לפתיחה. Nuki חוסמת קריאות ישירות
 *  מהדפדפן (CORS), ו-Firebase בלי Blaze לא מריץ קוד שרת — לכן שרת קטן
 *  וחינמי כאן. הוא עושה **רק** את הפתיחה; כל השאר נשאר ב-Apps Script.
 *
 *  🔐 הגדרות ב-Cloudflare (Settings → Variables and Secrets):
 *     NUKI_TOKEN      (Secret)  המפתח מ-web.nuki.io. יועד מדביק בעצמו.
 *     NUKI_LOCK_ID    (Text)    מזהה המנעול ב-Nuki Web. ריק ⇒ המנעול הראשון בחשבון.
 *     NUKI_ACTION     (Text)    גיבוי בלבד — הפעולה נקבעת במסך ההגדרות (doorConfig/public.action).
 *     APPS_SCRIPT_URL (Text)    כתובת ה-/exec — לרישום ביומן ברקע.
 *
 *  זרימה (סבב רשת אחד לפני Nuki):
 *   1. אימות טוקן Firebase מקומית (חתימה של גוגל, בלי רשת אחרי הפעם הראשונה).
 *   2. במקביל, **בשם המשתמש עצמו** (כללי Firestore חלים עליו):
 *      members/{uid} · doorConfig/public · (gymStatus/{uid} | שריוני היום של המשפחה).
 *   3. אותן בדיקות זכאות כמו doorOpenFastInner_ ב-Door.gs.
 *   4. פקודה ל-Nuki → תשובה לטלפון מיד.
 *   5. ברקע (waitUntil): Apps Script רושם ביומן, מסמן "הגיע", ומתריע על כשל.
 *
 *  ⚠️ אין כאן שום כתיבה ל-Firestore ושום מפתח של גוגל — רק קריאות בשם המשתמש.
 *  ⚠️ לוגיקת הזכאות חייבת להישאר זהה ל-Door.gs. שינוי שם ⇒ שינוי כאן.
 * ========================================================================== */

const PROJECT = 'atmosync03030';
const TZ = 'Asia/Jerusalem';
const ORIGINS = ['https://yoadgo.github.io'];
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ADMIN_PERMS = ['על', 'מכון', 'WeWork'];

let jwks = null, jwksExp = 0, lockIdMemo = '';
const recent = new Map();   /* uid → זמן לחיצה אחרונה (הגנה מלחיצה כפולה, לכל מופע) */

function cors(req) {
  const o = req.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ORIGINS.indexOf(o) !== -1 ? o : ORIGINS[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400', 'Vary': 'Origin'
  };
}
function reply(req, obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors(req)) });
}

/* ------------------------------------------------ אימות טוקן Firebase --- */
function b64u(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}
async function verifyIdToken(tok) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3) throw new Error('bad token');
  const head = JSON.parse(new TextDecoder().decode(b64u(parts[0])));
  const body = JSON.parse(new TextDecoder().decode(b64u(parts[1])));
  if (!jwks || Date.now() > jwksExp) {
    const r = await fetch(JWK_URL);
    jwks = (await r.json()).keys || [];
    jwksExp = Date.now() + 3600 * 1000;
  }
  const jwk = jwks.find(k => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') throw new Error('unknown key');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(parts[2]),
    new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Math.floor(Date.now() / 1000);
  if (!ok || body.aud !== PROJECT || body.iss !== 'https://securetoken.google.com/' + PROJECT ||
      !(body.exp > now) || !(body.iat <= now + 60) || !body.sub) throw new Error('invalid token');
  return { uid: String(body.sub), email: String(body.email || '').toLowerCase() };
}

/* ------------------------------------------------------ Firestore REST --- */
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return fields(v.mapValue.fields || {});
  return null;
}
function fields(f) { const o = {}; Object.keys(f || {}).forEach(k => { o[k] = val(f[k]); }); return o; }
async function getDoc(path, tok) {
  const r = await fetch(FS + '/' + path, { headers: { Authorization: 'Bearer ' + tok } });
  if (r.status !== 200) return null;
  return fields((await r.json()).fields);
}
async function todaysBookings(fid, day, tok) {
  const q = { structuredQuery: { from: [{ collectionId: 'weworkBookings' }], where: { compositeFilter: { op: 'AND', filters: [
    { fieldFilter: { field: { fieldPath: 'familyId' }, op: 'EQUAL', value: { stringValue: fid } } },
    { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: day } } }
  ] } } } };
  const r = await fetch(FS + ':runQuery', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
  if (r.status !== 200) return [];
  return (await r.json()).filter(x => x && x.document).map(x => fields(x.document.fields));
}

function israelNow() {
  const p = {};
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).forEach(x => { p[x.type] = x.value; });
  return { day: p.year + '-' + p.month + '-' + p.day, min: Number(p.hour) * 60 + Number(p.minute) };
}

/* ------------------------------------------------------------------ Nuki --- */
async function nukiOpen(env, want) {
  let id = String(env.NUKI_LOCK_ID || lockIdMemo || '').trim();
  const h = { Authorization: 'Bearer ' + env.NUKI_TOKEN, Accept: 'application/json' };
  if (!id) {
    const l = await fetch('https://api.nuki.io/smartlock', { headers: h });
    if (l.status !== 200) return { ok: false, code: l.status };
    const arr = await l.json();
    if (!arr.length) return { ok: false, code: 404 };
    id = lockIdMemo = String(arr[0].smartlockId);
  }
  /* 26.9 — הפעולה נבחרת במסך ההגדרות (doorConfig/public.action); env רק כגיבוי. */
  const action = Number(want || env.NUKI_ACTION || 3) === 1 ? 1 : 3;
  const r = await fetch('https://api.nuki.io/smartlock/' + encodeURIComponent(id) + '/action', {
    method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, h), body: JSON.stringify({ action })
  });
  return { ok: r.status >= 200 && r.status < 300, code: r.status };
}

/* ------------------------------------------------------------------ ראשי --- */
export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return reply(req, { ok: false, error: 'POST בלבד' }, 405);
    const t0 = Date.now();
    let b; try { b = await req.json(); } catch (e) { return reply(req, { ok: false, error: 'בקשה לא תקינה' }, 400); }
    const reason = String(b.reason || '');
    if (['wework', 'gym', 'admin'].indexOf(reason) === -1) return reply(req, { ok: false, error: 'סיבת כניסה לא מוכרת' });

    let who;
    try { who = await verifyIdToken(b.idToken); } catch (e) { return reply(req, { ok: false, code: 'NEED_SLOW', error: 'אימות הזהות נכשל — התחבר/י מחדש' }); }
    const last = recent.get(who.uid) || 0;
    if (Date.now() - last < 5000) return reply(req, { ok: false, code: 'BUSY', error: 'הפקודה כבר נשלחה — רגע אחד' });
    recent.set(who.uid, Date.now());

    const now = israelNow(), tok = String(b.idToken), claimFid = String(b.familyId || '');
    const jobs = [getDoc('members/' + encodeURIComponent(who.uid), tok), getDoc('doorConfig/public', tok)];
    if (reason === 'gym') jobs.push(getDoc('gymStatus/' + encodeURIComponent(who.uid), tok));
    if (reason === 'wework' && claimFid) jobs.push(todaysBookings(claimFid, now.day, tok));
    const [mem, cfg, extra] = await Promise.all(jobs);

    const fail = (error, code) => { recent.delete(who.uid); return reply(req, { ok: false, code: code || '', error }); };
    if (!mem) return fail('המשתמש אינו רשום');
    if (mem.active !== true) return fail('המשתמש מסומן כלא פעיל');
    if (mem.isExternal === true) return fail('הפעולה אינה זמינה למשתמש חיצוני');
    const fid = String(mem.familyId || '');
    if (claimFid && claimFid !== fid) return fail('הזהות אינה תואמת');
    const mode = (cfg && cfg.mode) || 'off';
    if (mode === 'off') return fail('הדלת עדיין לא מחוברת לאפליקציה', 'DOOR_OFF');
    if (mode === 'live' && !env.NUKI_TOKEN) return fail('הדלת עדיין לא מחוברת לאפליקציה', 'DOOR_OFF');

    let booking = null;
    if (reason === 'wework') {
      (extra || []).forEach(x => {
        if (x.status === 'active' && String(x.familyId) === fid && x.from * 60 <= now.min && now.min < x.to * 60) {
          if (!booking || x.id === b.bookingId) booking = x;
        }
      });
      if (!booking) return fail('אין לך שריון פעיל כרגע', 'NOT_NOW');
    } else if (reason === 'gym') {
      if (!(cfg && cfg.gymOn)) return fail('הכניסה למכון עדיין בקוד — הוא מופיע בכרטיס המנוי', 'GYM_CODE');
      const until = String((extra && extra['בתוקף עד']) || '');
      if (!extra || String(extra['סטטוס'] || '').trim() !== 'פעיל' || !until || until < now.day) return fail('המנוי אינו בתוקף', 'NOT_NOW');
    } else {
      const perms = mem.perms || [];
      if (!ADMIN_PERMS.some(p => perms.indexOf(p) !== -1)) return fail('אין לך הרשאה לפעולה הזו');
    }

    let result = 'sim', error = '';
    if (mode === 'live') {
      const n = await nukiOpen(env, cfg && cfg.action);
      result = n.ok ? 'ok' : 'fail';
      if (!n.ok) error = 'Nuki ' + n.code;
    }
    const ms = Date.now() - t0;

    /* ברקע — היומן, "הגיע" והתראה. התושב כבר קיבל תשובה. */
    if (env.APPS_SCRIPT_URL) {
      ctx.waitUntil(fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'doorLogExternal', session: b.session || '', idToken: tok, uid: who.uid,
          familyId: fid, reason, bookingId: booking ? booking.id : '', result, error, ms }) }).catch(() => {}));
    }

    if (result === 'fail') { recent.delete(who.uid); return reply(req, { ok: false, code: 'NUKI_FAIL', error: 'הדלת לא נפתחה. ייתכן שהמנעול לא מחובר לרשת.' }); }
    return reply(req, { ok: true, simulated: result === 'sim', ms, via: 'worker' });
  }
};
