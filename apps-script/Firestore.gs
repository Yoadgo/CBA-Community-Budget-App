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
/* מפתח ה-API הציבורי של אפליקציית הווב (צעד 02ג).
   ⚠️ **אינו סוד.** apiKey של Firebase הוא מזהה ציבורי שיושב ממילא בקוד
   הלקוח (js/data/firebase.js) וגלוי לכל מי שפותח את האתר. הוא אינו מעניק
   שום הרשאה בפני עצמו — כאן הוא משמש רק כדי לבקש מגוגל לאמת טוקן זהות.
   **לא לבלבל עם מפתח חשבון השירות**, שהוא כן סוד ויושב רק ב-Script Properties. */
var FS_WEB_API_KEY = 'AIzaSyC548H-lJj3p7ppYfD_ekcMwJ-g7qOoyPw';
var FS_SCOPE = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging';
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

/* נתיב מסמך בטוח ל-URL.
 *  🔴 **למה זה קיים (2026-09-15, צעד 08א):** מזהה מסמך נגזר
 *  מהגיליון ויכול להכיל כל תו — למשל גרשיים בשם שנה
 *  (תשפ"ו). גרשיים ב-URL הם תו לא חוקי, ו-UrlFetchApp זורק
 *  "ארגומנט לא חוקי" לפני שהבקשה יוצאת.
 *
 *  ⚠️ **הקידוד הוא של ה-URL בלבד, לא של המזהה.** Firestore
 *  מפענח את הנתיב, ולכן המסמך נשמר תחת המזהה המקורי.
 *  משמעות הדבר: `fsList_` מחזיר את המזהה המקורי, וכל
 *  השוואה (מפת החיים של סחיפת היתומים בראשם) חייבת
 *  להיעשות על המזהה המקורי — לעולם לא על המקודד.
 *  בדיוק הפער הזה גרם לסחיפה לנסות למחוק את שתי
 *  שנות התקציב שזה רגע נכתבו. */
function fsDocPath_(collection, id) {
  return collection + '/' + encodeURIComponent(String(id == null ? '' : id));
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

/** רשימת המסמכים באוסף. מחזיר [{ id, data }].
 *  מרפרף דפים עד הסוף — אוסף של עשרות מסמכים יושב בדף אחד,
 *  אבל על דף אחד אי-אפשר לבנות פונקציית ניקוי שמוחקת יתומים:
 *  דף חלקי היה נראה כמו "השאר כבר לא קיים". */
function fsList_(collection) {
  var out = [], token = '', guard = 0;
  do {
    var path = collection + '?pageSize=300' + (token ? '&pageToken=' + encodeURIComponent(token) : '');
    var r = fsFetch_(path, 'get');
    if (r.code !== 200) {
      throw new Error('רשימה נכשלה (' + r.code + '): ' + r.text.substring(0, 300));
    }
    var body = JSON.parse(r.text);
    (body.documents || []).forEach(function (doc) {
      var name = String(doc.name || '');
      out.push({ id: name.substring(name.lastIndexOf('/') + 1), data: fsUnfields_(doc.fields || {}) });
    });
    token = body.nextPageToken || '';
  } while (token && ++guard < 20);
  return out;
}

/* ============================================================================
 *  fsQuery_ — שאילתה על אוסף   (צעד 07ג, 2026-09-15)
 * ----------------------------------------------------------------------------
 *  🔴 **למה זה נדרש ולמה `fsList_` לא מספיק:** גיבוי מצטבר
 *  צריך לשלם **קריאה רק על מה שהשתנה**. `fsList_` קורא את כל
 *  האוסף, ולכן "מצטבר" שבנוי עליו עולה בדיוק כמו מלא — ומבטל
 *  את כל הטעם. מול מכסת Spark של 50,000 קריאות/יום, זה ההבדל בין
 *  לרוץ כל חצי שעה לבין לרוץ פעם ביום.
 *
 *  ⚠️ **אי-שוויון על שדה בודד משתמש באינדקס האוטומטי** ש-Firestore
 *     מתחזק לכל שדה, ולכן **אינו דורש אינדקס מורכב**. זה קריטי
 *     כאן: קונסולת Google Cloud חסומה לחשבון הגזבר (2SV), ולא נוכל
 *     ליצור אינדקס אם נזדקק לו. לכן הפונקציה הזאת במכוון **לא**
 *     בונה שאילתות מורכבות — תנאי אחד על שדה אחד, וזהו.
 *  ⚠️ `runQuery` מחזיר זרם של איברים; איבר בלי `document` הוא איבר
 *     סנכרון תקין (`readTime` בלבד) ולא שגיאה — מדלגים עליו.
 *  ⚠️ הנתיב ל-runQuery הוא של **האב** (השורש), ושם האוסף עובר
 *     בתוך `from` — לא כחלק מה-URL.
 * ========================================================================== */
function fsQuery_(collection, field, op, value, limit) {
  var body = {
    structuredQuery: {
      from: [{ collectionId: collection }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: op,                                  /* GREATER_THAN, EQUAL, ... */
          value: fsVal_(value)
        }
      }
    }
  };
  if (limit) body.structuredQuery.limit = limit;

  var opt = {
    method: 'post',
    headers: { Authorization: 'Bearer ' + fsToken_() },
    contentType: 'application/json',
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  };
  var url = 'https://firestore.googleapis.com/v1/projects/' + fsProjectId_() +
            '/databases/(default)/documents:runQuery';
  var res = UrlFetchApp.fetch(url, opt);
  var code = res.getResponseCode(), text = res.getContentText();
  if (code !== 200) {
    throw new Error('שאילתה נכשלה (' + code + '): ' + text.substring(0, 300));
  }
  var rows = JSON.parse(text);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var doc = rows[i] && rows[i].document;
    if (!doc) continue;                            /* איבר סנכרון — לא תוצאה */
    var name = String(doc.name || '');
    out.push({ id: name.substring(name.lastIndexOf('/') + 1), data: fsUnfields_(doc.fields || {}) });
  }
  return out;
}

/* ============================================================================
 *  fsVerifyIdToken_ — מי באמת שלח את הבקשה   (צעד 02ג, 2026-09-14)
 * ----------------------------------------------------------------------------
 *  🔴 **למה לא לקבל את ה-uid מהלקוח:** ה-uid הוא סתם מחרוזת. לקוח שישלח
 *  את ה-uid של מישהו אחר היה גורם לנו לכתוב `members/<uid זר>` עם ההרשאות
 *  *שלו* — כלומר להעניק לעצמו את ההרשאות של אדם אחר. לכן הלקוח שולח את
 *  **טוקן הזהות** של Firebase, וגוגל היא שמאמתת אותו ומחזירה את ה-uid.
 *
 *  ⚠️ accounts:lookup מאמת חתימה, תוקף ושייכות לפרויקט — כלומר טוקן שהומצא,
 *     פג, או שייך לפרויקט אחר פשוט לא יחזיר משתמש.
 *
 *  מחזיר { ok, uid, email } או { ok:false, error }.
 * ========================================================================== */
function fsVerifyIdToken_(idToken) {
  if (!idToken) return { ok: false, error: 'חסר טוקן זהות' };
  var res = UrlFetchApp.fetch(
    'https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FS_WEB_API_KEY, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ idToken: String(idToken) }),
      muteHttpExceptions: true
    });
  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code !== 200) {
    return { ok: false, error: 'אימות הטוקן נכשל (' + code + ')' };
  }
  var users;
  try { users = JSON.parse(body).users; } catch (e) { return { ok: false, error: 'תשובת אימות לא תקינה' }; }
  if (!users || !users.length) return { ok: false, error: 'הטוקן אינו מזוהה' };
  var u = users[0];
  if (!u.localId) return { ok: false, error: 'לא התקבל מזהה משתמש' };
  return { ok: true, uid: String(u.localId), email: String(u.email || '') };
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
/** שולח Push דרך FCM HTTP v1, עם אותו טוקן OAuth של חשבון השירות
 *  (דורש את ה-scope שהורחב למעלה + הרשאת IAM על הפרויקט — ניתנה בפועל
 *  16.9.26: "Firebase Cloud Messaging API Admin" לחשבון השירות).
 *  מחזיר true/false; אף פעם לא זורק — קריאה ל-Push לא אמורה להפיל
 *  את הפעולה שממנה היא נקראת (בדיוק כמו מיילים). */
function fcmSendToToken_(token, title, body, data) {
  try {
    var url = 'https://fcm.googleapis.com/v1/projects/' + fsProjectId_() + '/messages:send';
    var payload = {
      message: {
        token: token,
        notification: { title: title, body: body },
        data: data || {},
        webpush: { fcm_options: { link: CBA_APP_URL } }
      }
    };
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + fsToken_() },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return res.getResponseCode() === 200;
  } catch (e) { return false; }
}
