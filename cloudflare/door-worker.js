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
 *  ⚠️ פתיחת הדלת: אין כתיבה ל-Firestore — רק קריאות בשם המשתמש.
 *  ⚠️ לוגיקת הזכאות חייבת להישאר זהה ל-Door.gs. שינוי שם ⇒ שינוי כאן.
 *
 *  🆕 26.9 — שריון וביטול WeWork (op = 'wwBook' / 'wwCancel'):
 *     FIREBASE_SA (Secret) — חשבון השירות של Firebase (אותו JSON כמו
 *     FIREBASE_SA_JSON ב-Apps Script). משמש **רק** לשריון/ביטול.
 *     השריון נכתב בעסקה (transaction) של Firestore: קוראים את מסמך היום
 *     ואת שריוני היום, בודקים מקום, וכותבים שריון + מסמך יום יחד. שני
 *     תושבים על אותה עמדה באותו רגע ⇒ Firestore דוחה אחד, והוא מנסה שוב.
 *     מייל האישור/הביטול — ברקע ב-Apps Script (weworkAfterExternal). אין יומן גוגל.
 *     ⚠️ הכללים זהים ל-wwValidate_ / wwFits_ / weworkCancel_ ב-Door.gs.
 * ========================================================================== */

const PROJECT = 'atmosync03030';
const TZ = 'Asia/Jerusalem';
const ORIGINS = ['https://yoadgo.github.io'];
const FS = 'https://firestore.googleapis.com/v1/projects/' + PROJECT + '/databases/(default)/documents';
const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const ADMIN_PERMS = ['על', 'מכון', 'WeWork'];

let jwks = null, jwksExp = 0, lockIdMemo = '';
let saTok = '', saExp = 0, saKey = null;
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


/* ============================================ WeWork — שריון וביטול (26.9) === */
const WW_DEFAULTS = { viewFrom: 8, viewTo: 21, regularFrom: 7, regularTo: 22, desks: 3, lounge: 1, maxHours: 6, advanceDays: 14, perFamily: 2 };
const WW_SEATS = ['desk', 'lounge'];
const SUPER = 'על', PERM_WW = 'WeWork';

function b64uEnc(bytes) {
  let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
/** טוקן גישה של חשבון השירות (נשמר ~55 דק' בזיכרון המופע). */
async function saToken(env) {
  if (saTok && Date.now() < saExp) return saTok;
  if (!env.FIREBASE_SA) throw new Error('no FIREBASE_SA');
  const sa = JSON.parse(env.FIREBASE_SA);
  if (!saKey) {
    const pem = String(sa.private_key || '').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
    saKey = await crypto.subtle.importKey('pkcs8', b64u(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  }
  const now = Math.floor(Date.now() / 1000);
  const enc = o => b64uEnc(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({ iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 });
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', saKey, new TextEncoder().encode(unsigned)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + b64uEnc(sig) });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) throw new Error('sa token ' + r.status);
  saTok = j.access_token; saExp = Date.now() + (Number(j.expires_in || 3600) - 300) * 1000;
  return saTok;
}

function tv(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(tv) } };
  if (typeof v === 'object') return { mapValue: { fields: tf(v) } };
  return { stringValue: String(v) };
}
function tf(o) { const f = {}; Object.keys(o).forEach(k => { f[k] = tv(o[k]); }); return f; }
const DOC = p => 'projects/' + PROJECT + '/databases/(default)/documents/' + p;

async function fsx(tok, method, url, body) {
  const r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch (e) { }
  return { status: r.status, j };
}
async function saGet(tok, path, tx) {
  const r = await fsx(tok, 'GET', FS + '/' + path + (tx ? '?transaction=' + encodeURIComponent(tx) : ''));
  if (r.status === 404) return null;
  if (r.status !== 200) { const e = new Error('get ' + r.status); e.status = r.status; throw e; }
  return fields(r.j.fields);
}
async function saDayBookings(tok, date, tx) {
  const q = { structuredQuery: { from: [{ collectionId: 'weworkBookings' }],
    where: { fieldFilter: { field: { fieldPath: 'date' }, op: 'EQUAL', value: { stringValue: date } } } } };
  if (tx) q.transaction = tx;
  const r = await fsx(tok, 'POST', FS + ':runQuery', q);
  if (r.status !== 200) { const e = new Error('query ' + r.status); e.status = r.status; throw e; }
  return (r.j || []).filter(x => x && x.document).map(x => fields(x.document.fields));
}

function addDays(ds, n) {
  const p = ds.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2], 12));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const HH = h => ('0' + h).slice(-2) + ':00';

/** זהה ל-wwValidate_ ב-Door.gs. */
export function wwValidate(body, cfg, now) {
  const date = String(body.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'תאריך לא תקין' };
  const from = parseInt(body.from, 10), hours = parseInt(body.hours, 10);
  if (isNaN(from) || from < 0 || from > 23) return { ok: false, error: 'שעת התחלה לא תקינה' };
  if (isNaN(hours) || hours < 1) return { ok: false, error: 'משך לא תקין' };
  if (hours > cfg.maxHours) return { ok: false, error: 'אפשר לשריין עד ' + cfg.maxHours + ' שעות ברצף' };
  const to = from + hours;
  if (to > 24) return { ok: false, error: 'השריון חייב להסתיים עד חצות' };
  const seat = String(body.seat || 'desk');
  if (WW_SEATS.indexOf(seat) === -1) return { ok: false, error: 'סוג עמדה לא מוכר' };
  if ((seat === 'desk' ? cfg.desks : cfg.lounge) < 1) return { ok: false, error: 'אין עמדות מהסוג הזה' };
  if (date < now.day) return { ok: false, error: 'אי אפשר לשריין לתאריך שעבר' };
  if (date > addDays(now.day, cfg.advanceDays)) return { ok: false, error: 'אפשר לשריין עד ' + cfg.advanceDays + ' ימים קדימה' };
  if (date === now.day && to * 60 <= now.min) return { ok: false, error: 'החלון הזה כבר עבר' };
  return { ok: true, b: { date, from, to, hours, seat } };
}
/** זהה ל-wwFits_ ב-Door.gs. list = שריונים פעילים של אותו יום. */
export function wwFits(b, list, cfg, fid) {
  const cap = b.seat === 'lounge' ? cfg.lounge : cfg.desks;
  for (let h = b.from; h < b.to; h++) {
    let n = 0;
    list.forEach(x => { if (x.seat === b.seat && x.from <= h && h < x.to) n++; });
    if (n >= cap) return { ok: false, error: 'ב-' + HH(h) + ' כל ה' + (b.seat === 'lounge' ? 'כורסאות' : 'עמדות') + ' תפוסות', hour: h };
  }
  const mine = list.filter(x => String(x.familyId) === String(fid) && x.from < b.to && b.from < x.to).length;
  if (mine >= cfg.perFamily) return { ok: false, error: 'למשפחה שלך כבר יש ' + mine + ' שריונים באותן שעות' };
  return { ok: true };
}
export function wwSlots(list) {
  const slots = {};
  list.forEach(b => {
    for (let h = b.from; h < b.to; h++) {
      const k = String(h);
      if (!slots[k]) slots[k] = { desk: 0, lounge: 0 };
      slots[k][b.seat === 'lounge' ? 'lounge' : 'desk']++;
    }
  });
  return slots;
}
function dayWrite(date, active) {
  return { update: { name: DOC('weworkDays/' + date),
    fields: tf({ date, slots: wwSlots(active), count: active.length, schema: 1, updatedAt: new Date() }) } };
}
const pub = b => ({ id: b.id, date: b.date, from: b.from, to: b.to, hours: b.hours, seat: b.seat,
                    familyId: b.familyId, status: b.status, enteredAtMs: b.enteredAtMs || 0 });

/** עסקה עם עד 4 ניסיונות. work(tx) מחזיר {writes, result} או {result} בלי כתיבה. */
async function inTx(tok, work) {
  for (let i = 0; i < 4; i++) {
    const bt = await fsx(tok, 'POST', FS + ':beginTransaction', { options: { readWrite: {} } });
    if (bt.status !== 200 || !bt.j || !bt.j.transaction) throw new Error('begin ' + bt.status);
    const tx = bt.j.transaction;
    let out;
    try { out = await work(tx); }
    catch (e) {
      fsx(tok, 'POST', FS + ':rollback', { transaction: tx }).catch(() => {});
      if (e.status === 409 || e.status === 503) continue;
      throw e;
    }
    if (!out.writes) { fsx(tok, 'POST', FS + ':rollback', { transaction: tx }).catch(() => {}); return out.result; }
    const c = await fsx(tok, 'POST', FS + ':commit', { writes: out.writes, transaction: tx });
    if (c.status === 200) return out.result;
    if (c.status === 409 || c.status === 503) { await new Promise(r => setTimeout(r, 60 + Math.random() * 140)); continue; }
    throw new Error('commit ' + c.status);
  }
  return { ok: false, error: 'המערכת עמוסה רגע — נסה/י שוב' };
}

async function memberFor(tok, uid) {
  const mem = await saGet(tok, 'members/' + encodeURIComponent(uid));
  if (!mem) return { error: 'המשתמש אינו רשום' };
  if (mem.active !== true) return { error: 'המשתמש מסומן כלא פעיל' };
  if (mem.isExternal === true) return { error: 'הפעולה אינה זמינה למשתמש חיצוני' };
  return { mem, fid: String(mem.familyId || ''), perms: mem.perms || [] };
}

function afterJob(env, ctx, b, who, op, id) {
  if (!env.APPS_SCRIPT_URL) return;
  ctx.waitUntil(fetch(env.APPS_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'weworkAfterExternal', session: b.session || '', idToken: String(b.idToken), uid: who.uid, op, bookingId: id }) })
    .catch(() => {}));
}

async function wwBook(req, env, ctx, b, who) {
  const tok = await saToken(env);
  const [m, cfgDoc] = await Promise.all([memberFor(tok, who.uid), saGet(tok, 'weworkConfig/main')]);
  if (m.error) return reply(req, { ok: false, error: m.error });
  if (!m.fid) return reply(req, { ok: false, error: 'לא נמצא מזהה משפחה למשתמש' });
  const cfg = {}; Object.keys(WW_DEFAULTS).forEach(k => { cfg[k] = cfgDoc && typeof cfgDoc[k] === 'number' ? cfgDoc[k] : WW_DEFAULTS[k]; });
  const v = wwValidate(b, cfg, israelNow());
  if (!v.ok) return reply(req, v);
  const nb = v.b;
  const res = await inTx(tok, async tx => {
    const [, list] = await Promise.all([saGet(tok, 'weworkDays/' + nb.date, tx), saDayBookings(tok, nb.date, tx)]);
    const active = list.filter(x => x && x.status === 'active');
    const fit = wwFits(nb, active, cfg, m.fid);
    if (!fit.ok) return { result: { ok: false, error: fit.error, conflict: true } };
    const bk = Object.assign({}, nb, {
      id: 'WW-' + nb.date.replace(/-/g, '') + '-' + crypto.randomUUID().replace(/-/g, '').slice(0, 8),
      familyId: m.fid, uid: who.uid, slot: 0, status: 'active', calEventId: '',
      createdAtMs: Date.now(), enteredAtMs: 0, schema: 1, updatedAt: new Date() });
    active.push(bk);
    return { writes: [
      { update: { name: DOC('weworkBookings/' + bk.id), fields: tf(bk) }, currentDocument: { exists: false } },
      dayWrite(nb.date, active)
    ], result: { ok: true, booking: pub(bk) } };
  });
  if (res.ok) afterJob(env, ctx, b, who, 'book', res.booking.id);
  return reply(req, Object.assign(res, { via: 'worker' }));
}

async function wwCancel(req, env, ctx, b, who) {
  const id = String(b.id || '');
  if (!/^WW-[\w-]{1,60}$/.test(id)) return reply(req, { ok: false, error: 'מזהה שריון לא תקין' });
  const tok = await saToken(env);
  const m = await memberFor(tok, who.uid);
  if (m.error) return reply(req, { ok: false, error: m.error });
  const isAdmin = m.perms.indexOf(SUPER) !== -1 || m.perms.indexOf(PERM_WW) !== -1;
  const now = israelNow();
  let by = '';
  const res = await inTx(tok, async tx => {
    const bk = await saGet(tok, 'weworkBookings/' + id, tx);
    if (!bk) return { result: { ok: false, error: 'השריון לא נמצא' } };
    const mine = m.fid !== '' && String(bk.familyId) === m.fid;
    if (!mine && !isAdmin) return { result: { ok: false, error: 'אין הרשאה לבטל שריון זה' } };
    if (bk.status !== 'active') return { result: { ok: false, error: 'השריון כבר בוטל' } };
    if (bk.date < now.day || (bk.date === now.day && bk.to * 60 <= now.min)) return { result: { ok: false, error: 'השריון כבר הסתיים' } };
    if (mine && !isAdmin && (bk.enteredAtMs || (bk.date === now.day && bk.from * 60 <= now.min))) {
      return { result: { ok: false, error: 'השריון כבר התחיל — אי אפשר לבטל אותו' } };
    }
    by = mine ? 'self' : 'admin';
    const list = await saDayBookings(tok, bk.date, tx);
    const active = list.filter(x => x && x.status === 'active' && x.id !== id);
    return { writes: [
      { update: { name: DOC('weworkBookings/' + id), fields: tf({ status: 'canceled', canceledBy: by, canceledAtMs: Date.now(), updatedAt: new Date() }) },
        updateMask: { fieldPaths: ['status', 'canceledBy', 'canceledAtMs', 'updatedAt'] }, currentDocument: { exists: true } },
      dayWrite(bk.date, active)
    ], result: { ok: true, id, canceledBy: by } };
  });
  if (res.ok) afterJob(env, ctx, b, who, 'cancel', id);
  return reply(req, Object.assign(res, { via: 'worker' }));
}

/* ------------------------------------------------------------------ ראשי --- */
export default {
  async fetch(req, env, ctx) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    if (req.method !== 'POST') return reply(req, { ok: false, error: 'POST בלבד' }, 405);
    const t0 = Date.now();
    let b; try { b = await req.json(); } catch (e) { return reply(req, { ok: false, error: 'בקשה לא תקינה' }, 400); }
    const op = String(b.op || 'open');
    const reason = String(b.reason || '');
    if (op === 'open' && ['wework', 'gym', 'admin'].indexOf(reason) === -1) return reply(req, { ok: false, error: 'סיבת כניסה לא מוכרת' });

    let who;
    try { who = await verifyIdToken(b.idToken); } catch (e) { return reply(req, { ok: false, code: 'NEED_SLOW', error: 'אימות הזהות נכשל — התחבר/י מחדש' }); }

    /* 26.9 — שריון / ביטול WeWork. כשל פנימי (בלי מפתח, Firestore לא עונה)
       ⇒ NEED_SLOW, והלקוח שולח את אותה בקשה ל-Apps Script. */
    if (op === 'wwBook' || op === 'wwCancel') {
      try { return await (op === 'wwBook' ? wwBook : wwCancel)(req, env, ctx, b, who); }
      catch (e) { return reply(req, { ok: false, code: 'NEED_SLOW', error: 'השרת המהיר לא זמין', detail: String(e.message || e).slice(0, 80) }); }
    }
    if (op !== 'open') return reply(req, { ok: false, error: 'פעולה לא מוכרת' });
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
