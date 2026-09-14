/* ============================================================================
 *  Firestore.gs — הגשר בין Apps Script ל-Firestore   (צעד 01, 2026-09-14)
 * ----------------------------------------------------------------------------
 *  קובץ נפרד ולא בתוך Code.gs בכוונה: Code.gs הוא כבר מעל 10,000 שורות,
 *  וכל מה שקשור ל-Firestore צריך להיות אפשרי להסיר בקובץ אחד אם נסוג.
 *
 *  ⚠️ הקובץ הזה **אינו נקרא מ-doGet/doPost**. הוא ספרייה בלבד, ולכן
 *     הוספתו אינה משנה שום דבר בייצור ואינה מחייבת Deploy. את
 *     firebaseSelfTest() מריצים ידנית מהעורך.
 *
 *  למה מפתח חשבון שירות ולא חיבור הסקריפט לפרויקט Cloud:
 *  החיבור הוא **בלתי הפיך** (Apps Script מוחק את פרויקט ברירת המחדל)
 *  ומחייב את כל מי שאישר את הסקריפט לאשר מחדש. יועד בחר (14.9.26)
 *  במפתח, שהוא הפיך לחלוטין — מוחקים את המאפיין וזהו.
 *
 *  ⚠️ המפתח יושב ב-Script Properties בלבד, לעולם לא בריפו (הוא ציבורי).
 *     שם המאפיין: FIREBASE_SA_JSON — כל תוכן קובץ ה-JSON כמו שהוא.
 * ========================================================================== */

var FS_PROP = 'FIREBASE_SA_JSON';
var FS_SCOPE = 'https://www.googleapis.com/auth/datastore';
var FS_TOKEN_CACHE_KEY = 'fs_access_token_v1';

/** קורא את פרטי חשבון השירות. זורק שגיאה ברורה אם המאפיין חסר. */
function fsAccount_() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(FS_PROP);
  /* ⚠️ שמות מאפיינים ב-Script Properties רגישים לאותיות גדולות/קטנות, וזו
     טעות קלה מאוד בהקלדה ידנית (קרה ב-14.9.26: הוקלד Firebase_SA_JSON).
     לכן אם השם המדויק לא נמצא — מחפשים התאמה בלי תלות ברישיות, במקום
     לשלוח את יועד לגעת שוב במפתח פרטי רק בגלל אות אחת. */
  if (!raw) {
    var keys = props.getKeys();
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).toLowerCase() === FS_PROP.toLowerCase()) {
        raw = props.getProperty(keys[i]);
        break;
      }
    }
  }
  if (!raw) throw new Error('חסר המאפיין ' + FS_PROP + ' ב-Script Properties');
  var sa;
  try { sa = JSON.parse(raw); }
  catch (e) { throw new Error(FS_PROP + ' אינו JSON תקין'); }
  if (!sa.client_email || !sa.private_key || !sa.project_id) {
    throw new Error(FS_PROP + ' חסר client_email / private_key / project_id');
  }
  return sa;
}

function fsProjectId_() { return fsAccount_().project_id; }

function fsB64_(s) {
  return Utilities.base64EncodeWebSafe(s).replace(/=+$/, '');
}

/* אסימון גישה. ⚠️ ממוטמן ל-50 דקות (תוקפו שעה) — בלי מטמון כל כתיבה
   הייתה מוסיפה קריאת רשת שלמה ל-oauth2.googleapis.com. */
function fsToken_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(FS_TOKEN_CACHE_KEY);
  if (hit) return hit;

  var sa = fsAccount_();
  var now = Math.floor(Date.now() / 1000);
  var head = fsB64_(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  var claim = fsB64_(JSON.stringify({
    iss: sa.client_email, scope: FS_SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600
  }));
  var unsigned = head + '.' + claim;
  var sig = Utilities.computeRsaSha256Signature(unsigned, sa.private_key);
  var jwt = unsigned + '.' + Utilities.base64EncodeWebSafe(sig).replace(/=+$/, '');

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true
  });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    throw new Error('קבלת אסימון נכשלה (' + res.getResponseCode() + '): ' + body.substring(0, 300));
  }
  var tok = JSON.parse(body).access_token;
  if (!tok) throw new Error('התשובה לא הכילה access_token');
  cache.put(FS_TOKEN_CACHE_KEY, tok, 3000);   // 50 דקות
  return tok;
}

/* ---------- קידוד ופענוח ערכים ----------
   Firestore ב-REST עוטף כל ערך בתג טיפוס. שתי הפונקציות האלה הן
   התרגום בין אובייקט JavaScript רגיל לפורמט הזה ובחזרה. */
function fsVal_(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return (v === Math.floor(v) && Math.abs(v) < 9007199254740991)
      ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (Object.prototype.toString.call(v) === '[object Array]') {
    return { arrayValue: { values: v.map(fsVal_) } };
  }
  if (typeof v === 'object') return { mapValue: { fields: fsFields_(v) } };
  return { stringValue: String(v) };
}

function fsFields_(obj) {
  var out = {};
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = fsVal_(obj[k]);
  return out;
}

function fsUnval_(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('timestampValue' in v) return new Date(v.timestampValue);
  if ('stringValue' in v) return v.stringValue;
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(fsUnval_);
  if ('mapValue' in v) return fsUnfields_((v.mapValue && v.mapValue.fields) || {});
  return null;
}

function fsUnfields_(fields) {
  var out = {};
  for (var k in fields) if (Object.prototype.hasOwnProperty.call(fields, k)) out[k] = fsUnval_(fields[k]);
  return out;
}

function fsUrl_(path) {
  return 'https://firestore.googleapis.com/v1/projects/' + fsProjectId_() +
         '/databases/(default)/documents/' + path;
}

function fsFetch_(path, method, payload) {
  var opt = {
    method: method,
    headers: { Authorization: 'Bearer ' + fsToken_() },
    contentType: 'application/json',
    muteHttpExceptions: true
  };
  if (payload) opt.payload = JSON.stringify(payload);
  var res = UrlFetchApp.fetch(fsUrl_(path), opt);
  return { code: res.getResponseCode(), text: res.getContentText() };
}

/** כותב (יוצר או דורס) מסמך. path לדוגמה: 'members/abc123'. */
function fsSet_(path, obj) {
  var r = fsFetch_(path, 'patch', { fields: fsFields_(obj) });
  if (r.code !== 200) throw new Error('כתיבה נכשלה (' + r.code + '): ' + r.text.substring(0, 300));
  return JSON.parse(r.text);
}

/** קורא מסמך. מחזיר null אם אינו קיים. */
function fsGet_(path) {
  var r = fsFetch_(path, 'get');
  if (r.code === 404) return null;
  if (r.code !== 200) throw new Error('קריאה נכשלה (' + r.code + '): ' + r.text.substring(0, 300));
  var doc = JSON.parse(r.text);
  return fsUnfields_(doc.fields || {});
}

/** מוחק מסמך. */
function fsDelete_(path) {
  var r = fsFetch_(path, 'delete');
  if (r.code !== 200) throw new Error('מחיקה נכשלה (' + r.code + '): ' + r.text.substring(0, 300));
  return true;
}

/* ============================================================================
 *  בדיקה עצמית — מריצים ידנית מהעורך (בורר הפונקציות → firebaseSelfTest → הפעלה)
 *  כותבת מסמך בדיקה, קוראת אותו בחזרה, ומוחקת. לא נוגעת בשום נתון אמיתי.
 * ========================================================================== */
function firebaseSelfTest() {
  var log = [];
  function say(s) { log.push(s); Logger.log(s); }

  try {
    var sa = fsAccount_();
    say('✓ נמצא מפתח חשבון שירות');
    say('  פרויקט: ' + sa.project_id);
    say('  חשבון:  ' + sa.client_email);
  } catch (e) {
    say('✗ ' + e.message);
    /* שמות המאפיינים בלבד — לעולם לא הערכים. עוזר לתפוס שם שנכתב אחרת. */
    try {
      var keys = PropertiesService.getScriptProperties().getKeys();
      say('  מאפיינים שקיימים כרגע: ' + (keys.length ? keys.join(', ') : '(אין)'));
    } catch (e2) { say('  לא הצלחנו לקרוא את רשימת המאפיינים'); }
    return log.join('\n');
  }

  try {
    fsToken_();
    say('✓ התקבל אסימון גישה');
  } catch (e) { say('✗ אסימון: ' + e.message); return log.join('\n'); }

  var path = '_selftest/ping';
  var stamp = new Date();
  try {
    fsSet_(path, { hello: 'CBA', at: stamp, n: 42, ok: true });
    say('✓ נכתב מסמך בדיקה: ' + path);
  } catch (e) { say('✗ כתיבה: ' + e.message); return log.join('\n'); }

  try {
    var back = fsGet_(path);
    var good = back && back.hello === 'CBA' && back.n === 42 && back.ok === true;
    say((good ? '✓' : '✗') + ' נקרא בחזרה: ' + JSON.stringify({
      hello: back && back.hello, n: back && back.n, ok: back && back.ok
    }));
  } catch (e) { say('✗ קריאה: ' + e.message); }

  try {
    fsDelete_(path);
    say('✓ מסמך הבדיקה נמחק — Firestore נשאר ריק');
  } catch (e) { say('✗ מחיקה: ' + e.message); }

  say('');
  say('אם כל השורות מסומנות ✓ — צעד 01 הושלם.');
  return log.join('\n');
}
