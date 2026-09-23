/* ============================================================================
 *  מרכז ההתראות — מנגנון שליחה אחד (23.9.2026)
 * ----------------------------------------------------------------------------
 *  עד היום היו שני ערוצים נפרדים: `sendResidentTemplate_` (לתושב) ו-
 *  `notifyAdmins_` (למנהלים), והפוש נגזר מתחילת המייל או נכתב ידנית בכמה
 *  מקומות. מהיום יש **טבלה אחת**: שורה לכל פעולה ("טריגר"), ועמודה לכל מי
 *  שיכול לקבל עליה הודעה ("נמען"). בכל תא: מייל / פוש / בסיכום, טקסט פוש
 *  משלו, מסך יעד, וטקסט שמופיע באפליקציה.
 *
 *  🔑 **שני הערוצים הישנים לא נמחקו — הם הפכו למתאמים.** כל ~70 נקודות
 *  השליחה בקוד ממשיכות לקרוא להם בדיוק כמו קודם; המתאם מוצא לפי שם
 *  התבנית לאיזה טריגר היא שייכת ומעביר ל-`notify_`. כך אין צורך לגעת
 *  בכל נקודה, ותבנית שאינה בטבלה ממשיכה להתנהג כמו קודם.
 *
 *  איפה ההגדרות יושבות:
 *   • טאב "הגדרות התראות" — שורה לכל טריגר × נמען (מתגים + טקסט פוש +
 *     מסך יעד + טקסט באפליקציה). נזרע מ-NOTIFY_DOMAINS, לעולם לא דורס.
 *   • טאב "הגדרות מיילים" — נושא וגוף המייל, לפי שם התבנית (כמו תמיד),
 *     וגם ההגדרות הכלליות (NOTIFY_*), באותו דפוס של RULE_*.
 *
 *  🔴 הקו האדום נשמר: הגנן החיצוני לעולם אינו נכלל ב"מנהל התחום"
 *  (אלא אם מנהל-על בחר אחרת בהגדרות הכלליות), כי מיילי מנהל נושאים
 *  שמות תושבים.
 * ========================================================================== */

var NOTIFY_SHEET = 'הגדרות התראות';
var NOTIFY_HEADERS = ['טריגר', 'נמען', 'פעולה', 'למי', 'מייל', 'פוש', 'בסיכום',
                      'כותרת פוש', 'טקסט פוש', 'מסך יעד', 'טקסט באפליקציה', 'סימון עדכון חדש'];
var NOTIFY_ROLE_LABEL = { r: 'מי שפנה', a: 'מנהל התחום', g: 'הגנן', s: 'מנהל-על', all: 'כל התושבים' };
/* 🔴 התור (פוש שנדחה בשעות שקט + שורות לסיכום היומי) יושב **בגיליון** ולא
   ב-Firestore: הטקסטים למנהלים נושאים שמות תושבים, ומידע אישי לא עובר
   ל-Firestore (הכלל הראשון של הארכיטקטורה). */
var NOTIFY_QUEUE_SHEET = 'תור התראות';
var NOTIFY_QUEUE_HEADERS = ['סוג', 'תחום', 'נמען', 'משפחה', 'כותרת', 'טקסט', 'נתונים', 'נוצר'];
var NOTIFY_INBOX = 'notifyInbox';      // Firestore — "עדכון חדש" לכל משפחה (ללא פרטים אישיים)
var NOTIFY_TEXTS_PROP = 'NOTIFY_TEXTS_V1_APPLIED';

/* שם המסך כפי שמנהל רואה אותו ← מזהה המסך באפליקציה. */
var NOTIFY_SCREENS = {
  'דף הבית': 'resHome', 'הדיווחים שלי (גינון)': 'resGarden', 'משימות גינון': 'gardenTasks',
  'תוכנית גינון': 'gardenPlan', 'נתוני גינון': 'gardenStats',
  'הבקשות שלי (החזרים)': 'resRequests', 'הוצאות': 'expenses', 'מועדון': 'resReserve',
  'ניהול מועדון': 'clubAdmin', 'מכון כושר': 'resGym', 'ניהול מכון': 'gymAdmin',
  'תושבים': 'residents', 'שירותים': 'resServices', 'לוח אירועים': 'events',
  'דיווחים על האפליקציה': 'appReports'
};

/* זיכרון לריצה אחת בלבד (כמו PERMS_MEMO_) — שינוי במסך נכנס לתוקף
   בבקשה הבאה. ⚠️ לעולם לא CacheService: הגדרה שכובתה חייבת לחול מיד. */
var NOTIFY_MEMO_ = null;
function notifyResetMemo_() { NOTIFY_MEMO_ = null; }

function notifyMemo_(ss) {
  if (!NOTIFY_MEMO_) NOTIFY_MEMO_ = {};
  if (!NOTIFY_MEMO_.settings) NOTIFY_MEMO_.settings = getEmailSettings_(ss);
  if (!NOTIFY_MEMO_.cells) NOTIFY_MEMO_.cells = notifyReadCells_(ss);
  return NOTIFY_MEMO_;
}

/* ---------------------------------------------------------------------------
 *  הקטלוג
 * ------------------------------------------------------------------------- */
var NOTIFY_INDEX_ = null;
function notifyIndex_() {
  if (NOTIFY_INDEX_) return NOTIFY_INDEX_;
  var byId = {}, byKey = {};
  NOTIFY_DOMAINS.forEach(function (d) {
    d.rows.forEach(function (r) {
      if (!r.id) return;
      byId[r.id] = { dom: d, row: r };
      Object.keys(r.cells || {}).forEach(function (role) {
        var k = r.cells[role].k;
        if (!k) return;
        (byKey[k] = byKey[k] || []).push({ t: r.id, role: role });
      });
    });
  });
  NOTIFY_INDEX_ = { byId: byId, byKey: byKey };
  return NOTIFY_INDEX_;
}

/** הטריגר של תבנית נתונה, לנמענים נתונים. `prefer` מכריע כשאותה תבנית
 *  משמשת שני טריגרים (למשל GYM_APPROVED_AWAITING_PAYMENT). */
function notifyLookupKey_(key, roles, prefer) {
  var hits = (notifyIndex_().byKey[key] || []).filter(function (h) { return roles.indexOf(h.role) !== -1; });
  if (!hits.length) return null;
  if (prefer) {
    var p = hits.filter(function (h) { return h.t === prefer; });
    if (p.length) return p[0];
  }
  return hits[0];
}

/* ---------------------------------------------------------------------------
 *  הגיליון
 * ------------------------------------------------------------------------- */
function notifyYes_(v) {
  var s = String(v === undefined || v === null ? '' : v).trim();
  return s === 'כן' || s === 'TRUE' || s === 'true' || s === '1' || v === true;
}

/** יוצר את "הגדרות התראות" אם חסר, ומוסיף רק שורות חסרות. לעולם לא דורס. */
function ensureNotifySheet_(ss) {
  var sh = ss.getSheetByName(NOTIFY_SHEET);
  var fresh = false;
  if (!sh) {
    sh = ss.insertSheet(NOTIFY_SHEET);
    sh.getRange(1, 1, 1, NOTIFY_HEADERS.length).setValues([NOTIFY_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
    fresh = true;
  }
  var values = sh.getDataRange().getValues();
  var have = {};
  for (var r = 1; r < values.length; r++) {
    have[String(values[r][0]).trim() + '|' + String(values[r][1]).trim()] = true;
  }
  /* 🔑 מעבר מהמנגנון הישן: תבנית שמישהו כיבה בטאב "הגדרות מיילים"
     (עמודת "פעיל" = לא) נזרעת כבויה גם כאן — לא מדליקים מחדש בשקט
     משהו שכובה בכוונה. חל רק על שורות שנוצרות עכשיו. */
  var settings = null;
  try { settings = getEmailSettings_(ss); } catch (e) { settings = {}; }
  var add = [];
  NOTIFY_DOMAINS.forEach(function (d) {
    d.rows.forEach(function (row) {
      if (!row.id) return;
      Object.keys(row.cells).forEach(function (role) {
        if (have[row.id + '|' + role]) return;
        var c = row.cells[role];
        var off = c.k && settings[c.k] && settings[c.k].active === false;
        add.push([row.id, role, row.ev, d.cols[role] || NOTIFY_ROLE_LABEL[role] || role,
                  (c.m && !off) ? 'כן' : 'לא', (c.p && !off && !c.nopush) ? 'כן' : 'לא', c.d ? 'כן' : 'לא',
                  c.pt || '', c.pb || '', c.link || 'דף הבית', c.app || '', c.badge ? 'כן' : 'לא']);
      });
    });
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, NOTIFY_HEADERS.length).setValues(add);
  if (fresh) {
    try { sh.setColumnWidth(3, 220); sh.setColumnWidth(9, 280); sh.setColumnWidth(11, 240); } catch (e) {}
  }
  return sh;
}

/** מפה "טריגר|נמען" ← התא בפועל (ברירת המחדל מהקטלוג + מה שבגיליון). */
function notifyReadCells_(ss) {
  var map = {};
  NOTIFY_DOMAINS.forEach(function (d) {
    d.rows.forEach(function (row) {
      if (!row.id) return;
      Object.keys(row.cells).forEach(function (role) {
        var c = row.cells[role];
        map[row.id + '|' + role] = {
          m: !!c.m, p: !!c.p && !c.nopush, d: !!c.d, k: c.k || '', pt: c.pt || '', pb: c.pb || '',
          link: c.link || 'דף הבית', app: c.app || '', badge: !!c.badge,
          nopush: !!c.nopush, noapp: !!c.noapp, n: c.n || '', rowIndex: 0
        };
      });
    });
  });
  var sh;
  try { sh = ensureNotifySheet_(ss); } catch (e) { return map; }
  var values = sh.getDataRange().getValues();
  for (var r = 1; r < values.length; r++) {
    var key = String(values[r][0]).trim() + '|' + String(values[r][1]).trim();
    var c2 = map[key];
    if (!c2) continue;               // שורה ידנית/ישנה שאינה בקטלוג — מתעלמים
    var v = values[r];
    c2.m = notifyYes_(v[4]);
    c2.p = notifyYes_(v[5]) && !c2.nopush;
    c2.d = notifyYes_(v[6]);
    c2.pt = String(v[7] || '');
    c2.pb = String(v[8] || '');
    c2.link = String(v[9] || '').trim() || c2.link;
    c2.app = String(v[10] || '');
    c2.badge = notifyYes_(v[11]);
    c2.rowIndex = r + 1;
  }
  return map;
}

/* ---------------------------------------------------------------------------
 *  הגדרות כלליות (NOTIFY_* בטאב "הגדרות מיילים"; המתג הראשי למייל
 *  הוא MASTER_ENABLED הוותיק)
 * ------------------------------------------------------------------------- */
var NOTIFY_GLOBAL_KEYS = {
  masterPush: 'NOTIFY_MASTER_PUSH', superAll: 'NOTIFY_SUPER_MODE', noPush: 'NOTIFY_NO_PUSH',
  badge: 'NOTIFY_BADGE', quiet: 'NOTIFY_QUIET', optOut: 'NOTIFY_OPT_OUT', external: 'NOTIFY_EXTERNAL'
};

function notifyGlobals_(settings) {
  var out = {};
  NOTIFY_GLOBALS.forEach(function (g) {
    var val = g.def;
    if (g.id === 'masterMail') {
      val = (settings['MASTER_ENABLED'] && settings['MASTER_ENABLED'].active === false) ? 'off' : 'on';
    } else {
      var row = settings[NOTIFY_GLOBAL_KEYS[g.id]];
      var v = row ? String(row.body || '').trim() : '';
      var okVals = g.o.map(function (o) { return o[0]; });
      if (v && okVals.indexOf(v) !== -1) val = v;
    }
    out[g.id] = val;
  });
  return out;
}

/* ---------------------------------------------------------------------------
 *  ספריית אנשים — סריקה אחת של טאב תושבים לריצה (במקום סריקה לכל מייל)
 * ------------------------------------------------------------------------- */
function notifyDirectory_(ss) {
  if (NOTIFY_MEMO_ && NOTIFY_MEMO_.dir) return NOTIFY_MEMO_.dir;
  var out = [];
  var rsh = ss.getSheetByName('תושבים');
  if (rsh) {
    var values = rsh.getDataRange().getValues();
    var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
    var emailCols = [], permCols = [], uidCols = [], roleCol = -1, statusCol = -1, idCol = -1, houseCol = -1, extCol = -1;
    headers.forEach(function (h, i) {
      if (h.indexOf(FB_UID_HEADER) !== -1) uidCols.push(i);
      else if (h.indexOf(PERM_HEADER) !== -1) permCols.push(i);
      else if (h.indexOf('שם פרטי') !== -1) { /* לא נדרש */ }
      else if (h.indexOf('אימייל') !== -1) emailCols.push(i);
      else if (h.indexOf('תפקיד') !== -1) roleCol = i;
      else if (h.indexOf('סטטוס') !== -1) statusCol = i;
      else if (h.indexOf(RESIDENT_ID_HEADER) !== -1) idCol = i;
      else if (h.indexOf(EXTERNAL_HEADER) !== -1) extCol = i;
      else if (h.indexOf('משפחה') !== -1) { /* לא נדרש */ }
      else if (h.indexOf('בית') !== -1 && houseCol === -1) houseCol = i;
    });
    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var active = !(statusCol > -1 && String(row[statusCol]).indexOf('פעיל') === -1);
      var role = roleCol > -1 ? String(row[roleCol]).trim() : '';
      var fam = (idCol > -1 ? String(row[idCol]).trim() : '') || (houseCol > -1 ? String(row[houseCol]).trim() : '');
      var ext = extCol > -1 && String(row[extCol]).trim().indexOf(EXTERNAL_VALUE) !== -1;
      for (var c = 0; c < emailCols.length; c++) {
        var email = String(row[emailCols[c]] || '').trim();
        if (!email) continue;
        var perms = parsePerms_(permCols[c] !== undefined ? row[permCols[c]] : '');
        if (!perms.length && role.indexOf('מנהל') !== -1) perms = [PERM_SUPER];
        out.push({ email: email, key: normalizeEmail_(email), familyId: fam, perms: perms,
                   uid: uidCols[c] !== undefined ? String(row[uidCols[c]] || '').trim() : '',
                   isSuper: perms.indexOf(PERM_SUPER) !== -1, isExternal: ext, active: active });
      }
    }
  }
  if (!NOTIFY_MEMO_) NOTIFY_MEMO_ = {};
  NOTIFY_MEMO_.dir = out;
  return out;
}

function notifyFamilyOf_(ss, email) {
  var k = normalizeEmail_(email);
  var dir = notifyDirectory_(ss);
  for (var i = 0; i < dir.length; i++) if (dir[i].key === k) return dir[i].familyId;
  return '';
}

/** מי מקבל בתפקיד נתון בתחום נתון. מחזיר [{email, familyId}]. */
function notifyPeople_(ss, dom, role, g) {
  var dir = notifyDirectory_(ss).filter(function (p) { return p.active; });
  var perm = dom.perm;
  if (role === 's') return dir.filter(function (p) { return p.isSuper && !p.isExternal; });
  if (role === 'g') {
    return dir.filter(function (p) { return p.isExternal && p.perms.indexOf(PERM_GARDEN) !== -1; });
  }
  if (role === 'a') {
    var allowExt = g && g.external === 'asAdmin';
    return dir.filter(function (p) {
      if (p.isExternal && !allowExt) return false;
      if (perm === PERM_ANY_ADMIN) return p.perms.length > 0;
      return p.perms.indexOf(perm) !== -1;
    });
  }
  if (role === 'all') return dir.filter(function (p) { return !p.isExternal; });
  return [];
}

/* ---------------------------------------------------------------------------
 *  שעות שקט
 * ------------------------------------------------------------------------- */
function notifyInQuiet_(mode, now) {
  if (!mode || mode === 'none') return false;
  now = now || new Date();
  var tz = 'Asia/Jerusalem';
  var h = Number(Utilities.formatDate(now, tz, 'H'));
  var dow = Number(Utilities.formatDate(now, tz, 'u'));   // 1=שני ... 5=שישי, 6=שבת, 7=ראשון
  if (h >= 22 || h < 7) return true;
  if (mode === 'nightShabbat') {
    if (dow === 5 && h >= 16) return true;
    if (dow === 6 && h < 20) return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------
 *  שליחה
 * ------------------------------------------------------------------------- */
function notifyRender_(t, vars) { return renderTemplate_(t, vars || {}).replace(/\s+\n/g, '\n').trim(); }

function notifyLinkUrl_(screenId) {
  return CBA_APP_URL + (screenId ? '?go=' + encodeURIComponent(screenId) : '');
}

/** פוש ליעד — 'f:<משפחה>' (תושב: כל המכשירים של הבית) או 'u:<uid>'
 *  (מנהל/גנן: רק המכשיר של האדם עצמו, לא של בני המשפחה שלו).
 *  מיידי, או לתור אם עכשיו שעות שקט. מחזיר true אם יש לאן לשלוח. */
function notifyPush_(target, title, body, data, g) {
  if (!target || !title) return false;
  if (!notifyHasDevice_(target)) return false;
  if (notifyInQuiet_(g && g.quiet)) {
    try {
      notifyQueueAppend_(['push', '', '', String(target), title, body || '', JSON.stringify(data || {}), new Date()]);
      return true;
    } catch (e) { /* התור נכשל — עדיף לשלוח עכשיו מאשר לא לשלוח */ }
  }
  notifyPushNow_(target, title, body, data);
  return true;
}

function notifyPushNow_(target, title, body, data) {
  target = String(target || '');
  if (target.indexOf('u:') === 0) return sendPushUid_(target.substring(2), title, body, data);
  var fam = target.indexOf('f:') === 0 ? target.substring(2) : target;   // שורות תור ישנות
  return sendPush_(fam, title, body, data);
}

/** השורה שעולה לסיכום היומי במקום (או בנוסף ל-) הודעה מיידית. */
function notifyDigestAdd_(domId, role, line) {
  try {
    notifyQueueAppend_(['digest', domId, role, '', '', String(line || '').substring(0, 200), '', new Date()]);
  } catch (e) { Logger.log('notifyDigestAdd_ נכשל: ' + e); }
}

function notifyQueueSheet_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(NOTIFY_QUEUE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(NOTIFY_QUEUE_SHEET);
    sh.getRange(1, 1, 1, NOTIFY_QUEUE_HEADERS.length).setValues([NOTIFY_QUEUE_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* ⚠️ appendRow — אטומי מול כתיבות מקבילות, בלי נעילה גלובלית. */
function notifyQueueAppend_(row) {
  notifyQueueSheet_().appendRow(row);
}

/** לוקח את השורות מסוג נתון (ואופציונלית תחום), ומוחק אותן.
 *  🔑 מחיקה **מלמטה למעלה** לפי תמונת המצב: שורה שנוספה בינתיים יושבת
 *  מתחת לתמונה, ולכן מחיקה של שורה מעליה רק מזיזה אותה — לא נוגעת בה. */
function notifyQueueTake_(ss, kind, domId) {
  var sh = notifyQueueSheet_(ss);
  var values = sh.getDataRange().getValues();
  var out = [], rows = [];
  for (var r = 1; r < values.length; r++) {
    var v = values[r];
    if (String(v[0]) !== kind) continue;
    if (domId && String(v[1]) !== domId) continue;
    out.push(v);
    rows.push(r + 1);
  }
  for (var i = rows.length - 1; i >= 0; i--) {
    try { sh.deleteRow(rows[i]); } catch (e) { Logger.log('notifyQueueTake_ מחיקה: ' + e); }
  }
  return out;
}

/** כותב "עדכון חדש" למשפחה. בלי פרטים אישיים — רק הטקסט שבטבלה. */
function notifyInbox_(fam, domId, text, screenId, badge, trig) {
  if (!fam) return;
  try {
    var o = {};
    o[domId] = { text: String(text || '').substring(0, 160), at: Date.now(), screen: screenId || '',
                 badge: !!badge, trig: trig || '' };
    fsMerge_(fsDocPath_(NOTIFY_INBOX, String(fam)), o);
  } catch (e) { Logger.log('notifyInbox_ נכשל: ' + e); }
}

/* 🔴 מה הגנן החיצוני רשאי לראות בטקסט — **רשימת היתר**, לא רשימת חסימה.
   גם אם מישהו יכתוב {{שם}} או {{שאלות}} בטקסט של הגנן, הערך לא יגיע. */
var NOTIFY_GARDENER_VARS = ['כותרת', 'קטגוריה', 'מיקום', 'מזהה', 'שבוע', 'מספר', 'רשימה',
  'הערה', 'סיבה', 'עדכון', 'מה נעשה', 'תוצאה', 'לא שובצו', 'לאישורך', 'חסומות',
  'מעל 7 ימים', 'בוצעו', 'נפתחו', 'נגררות'];
/* 🔴 מה לא נכנס ל"עדכון חדש" ב-Firestore — מידע אישי לא עובר לשם,
   גם אם מישהו יכתוב אותו בטקסט "באפליקציה". */
var NOTIFY_INBOX_BLOCKED_VARS = ['שם', 'אימייל', 'שם המבקש', 'שאלות', 'ערך', 'ערך נוכחי',
  'ערך מבוקש', 'אסמכתא', 'אמצעי'];

function notifyVarsFor_(vars, allow, block) {
  var out = {};
  Object.keys(vars || {}).forEach(function (k) {
    if (allow && allow.indexOf(k) === -1) return;
    if (block && block.indexOf(k) !== -1) return;
    out[k] = vars[k];
  });
  return out;
}

/** האם לאדם/משפחה יש מכשיר עם התראות. יעד: 'f:<משפחה>' או 'u:<uid>'. */
function notifyHasDevice_(target) {
  try {
    if (target.indexOf('f:') === 0) return pushSubsForFamily_(target.substring(2)).length > 0;
    if (target.indexOf('u:') === 0) return !!pushSubForUid_(target.substring(2));
  } catch (e) { return true; }   // לא יודעים — לא שולחים מייל מיותר
  return false;
}

/**
 * 🔑 הפונקציה המרכזית.
 *   trigId   — מזהה שורה בטבלה ('gar-new', 'club-ok' ...)
 *   ctx.vars — הערכים לתבנית
 *   ctx.r    — { emails:[], familyId } של "מי שפנה" (אם יש)
 *   ctx.link — קישור ידני לכפתור במייל
 *   ctx.only — { role: {familyId:true} } צמצום נמענים (למשל "רק מי שאישר")
 *   roles    — אילו עמודות להפעיל בקריאה הזו (ברירת מחדל: כולן)
 * מחזיר { mail, push, digest, inbox }. לעולם לא זורק.
 */
function notify_(ss, trigId, ctx, roles) {
  var rep = { mail: 0, push: 0, digest: 0, inbox: 0 };
  try {
    var hit = notifyIndex_().byId[trigId];
    if (!hit) return rep;
    ctx = ctx || {};
    var vars = ctx.vars || {};
    var memo = notifyMemo_(ss);
    var settings = memo.settings;
    var g = notifyGlobals_(settings);
    var dom = hit.dom, row = hit.row;
    var roleList = (roles || Object.keys(row.cells)).filter(function (x) { return row.cells[x]; });
    var cellOf = function (role) { return memo.cells[trigId + '|' + role]; };

    /* 🔑 האם לתחום יש מנהל משלו (שאינו מנהל-על). אם אין — מנהל-על
       ממלא את מקומו ומקבל גם את מה שמנהל התחום היה מקבל, בכל מצב.
       בלי זה, בתחום שמנהל-על מנהל בעצמו, הודעות "חדש" היו נעלמות. */
    var aPeople = row.cells.a ? notifyPeople_(ss, dom, 'a', g) : [];
    var hasManager = aPeople.some(function (p) { return !p.isSuper; });

    var mails = {};      // מפתח ← { k, emails, role, screen, vars }
    var pushes = {};     // יעד ('f:משפחה' / 'u:uid') ← { title, body, screen }

    roleList.forEach(function (role) {
      var cell = cellOf(role);
      if (!cell) return;
      var eff = { m: cell.m, p: cell.p, d: cell.d };
      if (role === 's' && row.cells.a) {
        var ac = cellOf('a') || {};
        var union = { m: cell.m || !!ac.m, p: cell.p || !!ac.p, d: cell.d || !!ac.d };
        if (!hasManager) eff = union;
        else if (g.superAll === 'fallback') eff = { m: false, p: false, d: false };
        else if (g.superAll === 'all') eff = union;
      }

      /* מי */
      var people = [];
      if (role === 'r') {
        var em = ((ctx.r && ctx.r.emails) || []).filter(Boolean);
        var fam = (ctx.r && ctx.r.familyId) || '';
        if (!fam && em.length) fam = notifyFamilyOf_(ss, em[0]);
        if (!em.length && fam) em = emailsForFamilyId_(ss, fam);
        if (!em.length && !fam) return;
        people = em.length ? em.map(function (e) { return { email: e, familyId: fam }; })
                           : [{ email: '', familyId: fam }];
      } else {
        people = (role === 'a') ? aPeople : notifyPeople_(ss, dom, role, g);
        if (ctx.only && ctx.only[role]) {
          var allowF = ctx.only[role];
          people = people.filter(function (p) { return allowF[p.familyId]; });
        }
      }
      if (!people.length) return;

      var screen = NOTIFY_SCREENS[cell.link] || '';
      var t = cell.k ? settings[cell.k] : null;
      var rv = (role === 'g') ? notifyVarsFor_(vars, NOTIFY_GARDENER_VARS, null) : vars;
      var famLevel = (role === 'r' || role === 'all');
      var targetOf = function (p) {
        if (famLevel) return p.familyId ? 'f:' + p.familyId : '';
        return p.uid ? 'u:' + p.uid : '';
      };

      /* סיכום — שורה לסיכום היומי */
      if (eff.d) {
        notifyDigestAdd_(dom.id, role, notifyRender_(cell.pt || (t && t.subject) || row.ev, rv) +
          (cell.pb ? ' · ' + notifyRender_(cell.pb, rv) : ''));
        rep.digest++;
      }

      /* מייל — מי שהתא שלו דלוק, ומי שאמור לקבל פוש ואין לו מכשיר
         (לפי ההגדרה הכללית "מקבל מייל במקום"). */
      var mailPeople = eff.m ? people.slice() : [];
      if (!eff.m && eff.p && !cell.nopush && g.noPush === 'mail' && t && t.subject) {
        if (famLevel) {
          var anyDev = people.some(function (p) { var tg = targetOf(p); return tg && notifyHasDevice_(tg); });
          if (!anyDev) mailPeople = people.slice();
        } else {
          mailPeople = people.filter(function (p) { var tg = targetOf(p); return !tg || !notifyHasDevice_(tg); });
        }
      }
      if (mailPeople.length && g.masterMail !== 'off' && t && t.subject) {
        var mk = cell.k + (role === 'g' ? '|g' : '');
        var slot = mails[mk] = mails[mk] || { k: cell.k, emails: {}, role: role, screen: screen, vars: rv };
        mailPeople.forEach(function (p) { if (p.email) slot.emails[normalizeEmail_(p.email)] = p.email; });
      }

      /* פוש */
      if (eff.p && !cell.nopush && g.masterPush !== 'off') {
        var title = notifyRender_(cell.pt, rv) || (t ? notifyRender_(t.subject, rv) : '');
        var body = notifyRender_(cell.pb, rv);
        if (!body && t) { body = notifyRender_(t.body, rv).replace(/\s+/g, ' '); }
        if (body.length > 140) body = body.substring(0, 139) + '…';
        if (title.length > 60) title = title.substring(0, 59) + '…';
        if (title) people.forEach(function (p) {
          var tg = targetOf(p);
          if (!tg || pushes[tg]) return;
          pushes[tg] = { title: title, body: body, screen: screen };
        });
      }

      /* באפליקציה — רק לתושב על הבקשה שלו, ובלי מידע אישי. */
      if (role === 'r' && !cell.noapp && (cell.app || cell.badge)) {
        var fam2 = people[0] && people[0].familyId;
        if (fam2) {
          var sv = notifyVarsFor_(vars, null, NOTIFY_INBOX_BLOCKED_VARS);
          notifyInbox_(fam2, dom.id, notifyRender_(cell.app, sv) || notifyRender_(cell.pt, sv),
                       screen, cell.badge && g.badge !== 'off', trigId);
          rep.inbox++;
        }
      }
    });

    /* שליחה בפועל */
    Object.keys(mails).forEach(function (mk) {
      var slot = mails[mk];
      var k = slot.k;
      var to = Object.keys(slot.emails).map(function (x) { return slot.emails[x]; });
      if (!to.length) return;
      var t = settings[k];
      var plain = renderTemplate_(t.body, slot.vars);
      var subject = renderTemplate_(t.subject, slot.vars);
      var isAdmin = slot.role !== 'r' && slot.role !== 'all';
      var accent = isAdmin ? 'neutral' : (/REJECTED|DECLINED|CANCELLED|NOT_FOUND/.test(k) ? 'rose' : 'emerald');
      /* הכפתור פותח את מסך היעד. קישור מפורש (למשל להרשמה) גובר. */
      var link = ctx.link || (slot.screen ? notifyLinkUrl_(slot.screen) : (vars['קישור'] || CBA_APP_URL));
      var html = buildEmailHtml_(plain, link, isAdmin ? 'לטיפול באפליקציה' : 'פתיחת האפליקציה', accent);
      if (slot.role === 'all') {
        /* 🔴 לכל התושבים — בעותק מוסתר. עד היום כל הכתובות הופיעו
           בשדה "אל" של אותו מייל, וכל תושב ראה את המייל של כולם. */
        sendMailBcc_(to, subject, plain + '\n\n' + link, html);
      } else {
        sendMail_(to, subject, plain + '\n\n' + link, html);
      }
      rep.mail += to.length;
    });
    Object.keys(pushes).forEach(function (tg) {
      var pp = pushes[tg];
      rep.push += notifyPush_(tg, pp.title, pp.body, { screen: pp.screen, trig: trigId }, g) ? 1 : 0;
    });
  } catch (err) {
    Logger.log('notify_ ' + trigId + ' נכשל: ' + err);
  }
  return rep;
}

/** מייל לרבים בעותק מוסתר — אף נמען לא רואה את האחרים. */
function sendMailBcc_(list, subject, plainBody, htmlBody) {
  var to = (list || []).filter(Boolean);
  if (!to.length || !subject) return;
  var self = '';
  try { self = Session.getEffectiveUser().getEmail(); } catch (e) { self = ''; }
  /* ⚠️ בלי כתובת שולח — כל נמען מקבל מייל משלו. לעולם לא "אל: תושב
     אחד" ושאר השיכון בעותק: זה בדיוק מה שחושף כתובת לכולם. */
  if (!self) { to.forEach(function (x) { sendMail_([x], subject, plainBody, htmlBody); }); return; }
  for (var i = 0; i < to.length; i += 45) {
    var chunk = to.slice(i, i + 45);
    try {
      var opts = { to: self, bcc: chunk.join(','), subject: subject, body: plainBody };
      if (htmlBody) opts.htmlBody = htmlBody;
      MailApp.sendEmail(opts);
    } catch (err) { Logger.log('שליחת מייל (עותק מוסתר) נכשלה: ' + err); }
  }
}

/* ---------------------------------------------------------------------------
 *  התור — פוש שנדחה בשעות שקט. רץ מ-hourlyJobsRun_.
 * ------------------------------------------------------------------------- */
function notifyFlushQueue_(ss) {
  var out = { sent: 0, kept: 0, errors: [] };
  var settings = getEmailSettings_(ss);
  var g = notifyGlobals_(settings);
  if (notifyInQuiet_(g.quiet)) return out;
  var items = [];
  try { items = notifyQueueTake_(ss, 'push'); } catch (e) { out.errors.push(String(e)); return out; }
  items.forEach(function (v) {
    try {
      var data = {};
      try { data = JSON.parse(v[6] || '{}'); } catch (e2) { data = {}; }
      if (g.masterPush !== 'off') notifyPushNow_(String(v[3]), String(v[4]), String(v[5]), data);
      out.sent++;
    } catch (e3) { out.errors.push(String(e3)); }
  });
  return out;
}

/** שולף ומוחק את שורות הסיכום של תחום. */
function notifyDigestTake_(domId) {
  var lines = [];
  try {
    lines = notifyQueueTake_(null, 'digest', domId).map(function (v) { return String(v[5] || ''); });
  } catch (e) { Logger.log('notifyDigestTake_: ' + e); }
  return lines.filter(function (l, i, a) { return l && a.indexOf(l) === i; });
}

/* ---------------------------------------------------------------------------
 *  החלפת הנוסחים (חד-פעמית, הכרעת יועד 23.9: "להחליף הכול")
 * ------------------------------------------------------------------------- */
/** מעתיק לטאב "הגדרות מיילים" את הנוסח החדש של כל תבנית שיש לה נוסח
 *  חדש במרכז ההתראות. רץ **פעם אחת** בלבד (דגל ב-Script Properties) —
 *  אחרת הייתה דורסת כל עריכה עתידית. */
function notifyApplyNewTextsOnce_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(NOTIFY_TEXTS_PROP)) return { ok: true, skipped: true };
  var sh = ensureEmailSettingsSheet_(ss);
  var values = sh.getDataRange().getValues();
  var changed = 0;
  for (var r = 1; r < values.length; r++) {
    var k = String(values[r][0]).trim();
    var t = NOTIFY_MAIL_TEXTS[k];
    if (!t || !t.su || !t.bo) continue;
    if (String(values[r][1]) === t.su && String(values[r][2]) === t.bo) continue;
    sh.getRange(r + 1, 2, 1, 2).setValues([[t.su, t.bo]]);
    changed++;
  }
  props.setProperty(NOTIFY_TEXTS_PROP, new Date().toISOString() + ' · ' + changed);
  notifyResetMemo_();
  return { ok: true, changed: changed };
}

/* ---------------------------------------------------------------------------
 *  המסך — קריאה ושמירה
 * ------------------------------------------------------------------------- */
/** מה המנהל רשאי לראות: מנהל-על הכול; מנהל תחום — התחומים שלו. */
function notifyCanDomain_(perm, dom) {
  if (!perm || perm.isExternal) return false;
  if (perm.isSuper) return true;
  if (dom.perm === PERM_SUPER || dom.perm === PERM_ANY_ADMIN) return false;
  return (perm.perms || []).indexOf(dom.perm) !== -1;
}

function handleListNotifySettings_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_ANY_ADMIN);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    if (gate.perm.isExternal) return json_({ ok: false, error: 'אין לך הרשאה למסך הזה' });
    try { notifyApplyNewTextsOnce_(ss); } catch (e) { Logger.log('החלפת נוסחים: ' + e); }
    notifyResetMemo_();
    var memo = notifyMemo_(ss);
    var settings = memo.settings;
    var domains = NOTIFY_DOMAINS.filter(function (d) { return notifyCanDomain_(gate.perm, d); })
      .map(function (d) {
        return {
          id: d.id, name: d.name, cols: d.cols,
          rows: d.rows.map(function (r) {
            if (!r.id) return { grp: r.grp };
            var cells = {};
            Object.keys(r.cells).forEach(function (role) {
              var c = memo.cells[r.id + '|' + role];
              var t = c.k ? settings[c.k] : null;
              cells[role] = { m: c.m, p: c.p, d: c.d, k: c.k, pt: c.pt, pb: c.pb, link: c.link,
                              app: c.app, badge: c.badge, nopush: c.nopush, noapp: c.noapp, n: c.n,
                              su: t ? t.subject : '', bo: t ? t.body : '', hasMail: !!t };
            });
            return { id: r.id, ev: r.ev, w: r.w, why: r.why || '', vars: r.vars || [], cells: cells };
          })
        };
      });
    var out = { ok: true, domains: domains, isSuper: !!gate.perm.isSuper, screens: Object.keys(NOTIFY_SCREENS) };
    if (gate.perm.isSuper) {
      out.globals = NOTIFY_GLOBALS;
      out.globalValues = notifyGlobals_(settings);
      out.rules = Object.keys(settings).filter(function (k) { return k.indexOf('RULE_') === 0; })
        .map(function (k) { return { key: k, value: settings[k].body, note: settings[k].note }; });
    }
    return json_(out);
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** שמירת תא או טקסטים. body: { trig, role, fields:{m,p,d,pt,pb,link,app,badge,su,bo} } */
function saveNotifyCell_(ss, body) {
  var trig = String(body.trig || '').trim();
  var role = String(body.role || '').trim();
  var hit = notifyIndex_().byId[trig];
  if (!hit || !hit.row.cells[role]) return { ok: false, error: 'טריגר לא מוכר' };
  if (!notifyCanDomain_(body._perm, hit.dom)) return { ok: false, error: 'אין לך הרשאה לתחום הזה' };
  var f = body.fields || {};
  var sh = ensureNotifySheet_(ss);
  var values = sh.getDataRange().getValues();
  /* ⚠️ כל השורות התואמות, לא הראשונה בלבד: אם זריעה מקבילה יצרה שורה
     כפולה, הקורא לוקח את האחרונה — ושמירה לראשונה בלבד הייתה "מצליחה"
     בלי שום השפעה. */
  var rowIdxs = [];
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === trig && String(values[r][1]).trim() === role) rowIdxs.push(r + 1);
  }
  if (!rowIdxs.length) return { ok: false, error: 'השורה לא נמצאה בגיליון' };
  var lk0 = f.link !== undefined ? String(f.link || '').trim() : null;
  if (lk0 && !NOTIFY_SCREENS[lk0]) return { ok: false, error: 'מסך יעד לא מוכר' };
  rowIdxs.forEach(function (rowIdx) { saveNotifyRow_(sh, rowIdx, f, hit.row.cells[role]); });
  var catalogCell = hit.row.cells[role];
  var clip = function (v, n) { return String(v == null ? '' : v).substring(0, n); };
  /* נושא וגוף המייל — בטאב "הגדרות מיילים", לפי שם התבנית. */
  if ((f.su !== undefined || f.bo !== undefined) && catalogCell.k) {
    var es = ensureEmailSettingsSheet_(ss);
    var ev = es.getDataRange().getValues();
    for (var e = 1; e < ev.length; e++) {
      if (String(ev[e][0]).trim() !== catalogCell.k) continue;
      if (f.su !== undefined) es.getRange(e + 1, 2).setValue(clip(f.su, 200));
      if (f.bo !== undefined) es.getRange(e + 1, 3).setValue(clip(f.bo, 5000));
    }
  }
  notifyResetMemo_();
  return { ok: true };
}

function saveNotifyRow_(sh, rowIdx, f, catalogCell) {
  var yes = function (v) { return v ? 'כן' : 'לא'; };
  var clip = function (v, n) { return String(v == null ? '' : v).substring(0, n); };
  if (f.m !== undefined) sh.getRange(rowIdx, 5).setValue(yes(f.m));
  if (f.p !== undefined) sh.getRange(rowIdx, 6).setValue(yes(f.p && !catalogCell.nopush));
  if (f.d !== undefined) sh.getRange(rowIdx, 7).setValue(yes(f.d));
  if (f.pt !== undefined) sh.getRange(rowIdx, 8).setValue(clip(f.pt, 80));
  if (f.pb !== undefined) sh.getRange(rowIdx, 9).setValue(clip(f.pb, 200));
  if (f.link !== undefined) sh.getRange(rowIdx, 10).setValue(String(f.link || '').trim() || 'דף הבית');
  if (f.app !== undefined) sh.getRange(rowIdx, 11).setValue(clip(f.app, 160));
  if (f.badge !== undefined) sh.getRange(rowIdx, 12).setValue(yes(f.badge));
}

/** שמירת הגדרה כללית או כלל מספרי — מנהל-על בלבד (ACTION_PERMS). */
function saveNotifyGlobal_(ss, body) {
  var id = String(body.id || '').trim();
  var val = String(body.value == null ? '' : body.value).trim();
  var sh = ensureEmailSettingsSheet_(ss);
  var values = sh.getDataRange().getValues();
  var key = '', col = 3;
  if (id === 'masterMail') { key = 'MASTER_ENABLED'; col = 6; val = (val === 'off') ? 'לא' : 'כן'; }
  else if (NOTIFY_GLOBAL_KEYS[id]) {
    key = NOTIFY_GLOBAL_KEYS[id];
    var g = NOTIFY_GLOBALS.filter(function (x) { return x.id === id; })[0];
    if (!g || g.o.map(function (o) { return o[0]; }).indexOf(val) === -1) return { ok: false, error: 'ערך לא מוכר' };
  } else if (/^RULE_[A-Z_]+$/.test(id)) {
    key = id;
    if (!/^\d{1,3}$/.test(val)) return { ok: false, error: 'צריך מספר' };
  } else {
    return { ok: false, error: 'הגדרה לא מוכרת' };
  }
  var found = false;
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === key) { sh.getRange(r + 1, col).setValue(val); found = true; }
  }
  notifyResetMemo_();
  return found ? { ok: true } : { ok: false, error: 'ההגדרה לא נמצאה בגיליון' };
}

/* ---------------------------------------------------------------------------
 *  אירועים — "נפתח אישור הגעה" (נקרא מהדפדפן אחרי שמנהל פתח)
 * ------------------------------------------------------------------------- */
function notifyRsvpOpened_(ss, body) {
  var id = String(body.eventId || '').trim();
  /* מזהי יומן גוגל נראים כך: abc123@google.com — בלי לוכסן, באורך סביר. */
  if (!id || id.length > 300 || /[\/\s]/.test(id)) return { ok: false, error: 'מזהה אירוע לא תקין' };
  var cfg = fsGet_(fsDocPath_('eventRSVP', id));
  if (!cfg || cfg.enabled !== true) return { ok: true, sent: 0 };
  var props = PropertiesService.getScriptProperties();
  var flag = 'RSVP_OPEN_SENT_' + id;
  if (props.getProperty(flag)) return { ok: true, sent: 0, already: true };
  props.setProperty(flag, new Date().toISOString());
  var ev = notifyFindEvent_(id);
  var rep = notify_(ss, 'rsvp-open', { vars: { 'שם האירוע': ev ? ev.title : 'אירוע קהילתי',
                                                'תאריך': ev ? ev.dateLabel : '' } }, ['all']);
  return { ok: true, sent: rep.push };
}

/** מאתר אירוע בלוח (Firestore eventsCal/{year}). */
function notifyFindEvent_(id) {
  try {
    var y = new Date().getFullYear();
    for (var yy = y - 1; yy <= y + 1; yy++) {
      var doc = fsGet_(fsDocPath_('eventsCal', String(yy)));
      var list = (doc && (doc.events || doc.items)) || [];
      for (var i = 0; i < list.length; i++) {
        var e = list[i] || {};
        if (String(e.id) === id) {
          /* ⚠️ התאריך שמור כ-ISO ב-UTC; אירוע של יום שלם מתחיל בחצות
             שעון ישראל = 21:00/22:00 של היום הקודם ב-UTC. לכן ממירים. */
          var when = new Date(String(e.date || ''));
          var ok = !isNaN(when.getTime());
          var dt = ok ? Utilities.formatDate(when, 'Asia/Jerusalem', 'yyyy-MM-dd') : '';
          var label = ok ? Utilities.formatDate(when, 'Asia/Jerusalem', 'd.M') +
                           (e.allDay ? '' : ' · ' + Utilities.formatDate(when, 'Asia/Jerusalem', 'HH:mm')) : '';
          return { title: String(e.title || 'אירוע'), date: dt, dateLabel: label,
                   place: String(e.location || '') };
        }
      }
    }
  } catch (e2) { Logger.log('notifyFindEvent_: ' + e2); }
  return null;
}

/** תזכורת יום לפני האירוע — למי שאישר הגעה. רץ מהריצה היומית. */
function rsvpReminderJob_(ss) {
  var out = { events: 0, sent: 0 };
  var tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), 'Asia/Jerusalem', 'yyyy-MM-dd');
  var open = [];
  try { open = fsQuery_('eventRSVP', 'enabled', 'EQUAL', true, 100) || []; } catch (e) { return out; }
  open.forEach(function (doc) {
    var ev = notifyFindEvent_(doc.id);
    if (!ev || ev.date !== tomorrow) return;
    out.events++;
    var resp = [];
    try { resp = fsQuery_('eventRSVPResponses', 'eventId', 'EQUAL', doc.id, 500) || []; } catch (e) { return; }
    resp.forEach(function (r) {
      var d = r.data || {};
      if (d.status !== 'attending' || !d.familyId) return;
      var rep = notify_(ss, 'rsvp-remind', {
        vars: { 'שם האירוע': ev.title, 'תאריך': ev.dateLabel, 'מיקום': ev.place || 'השיכון' },
        r: { familyId: String(d.familyId) }
      }, ['r']);
      out.sent += rep.push;
    });
  });
  return out;
}

/* ---------------------------------------------------------------------------
 *  "השבוע בשיכון" — מוצאי שבת   (23.9.2026, יועד)
 * ---------------------------------------------------------------------------
 *  פוש אחד לכל התושבים במוצאי שבת, עם האירועים של השבוע שמתחיל (ראשון–שבת)
 *  מלוח האירועים (Firestore eventsCal/{year} — אותו מקור של מסך האירועים).
 *  רץ מהעבודה השעתית: בשבת מ-21:00 (אחרי צאת השבת גם בקיץ), ואם הריצה של
 *  מוצ"ש פוספסה — ראשון בבוקר עד 12:00. דגל לשבוע ב-Script Properties
 *  מבטיח פעם אחת בלבד. שבוע בלי אירועים — לא שולחים כלום.
 *  ⚠️ מה/למי/באיזה ערוץ — לפי השורה "evt-week" בטבלה, כמו כל טריגר.
 * ------------------------------------------------------------------------- */
var EVT_WEEK_FROM_HOUR = 21;
var EVT_WEEK_CATS = { community: '', culture: '', holidays: 'חג', breaks: 'חופשת גנים' };
var EVT_WEEK_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'שבת'];

/** האם עכשיו הזמן — ואם כן, מאיזה רגע סופרים את יום ראשון. */
function eventsWeekDue_(now) {
  var tz = 'Asia/Jerusalem';
  var dow = Number(Utilities.formatDate(now, tz, 'u'));   // 6=שבת, 7=ראשון
  var h = Number(Utilities.formatDate(now, tz, 'H'));
  var sunMs = null;
  if (dow === 6 && h >= EVT_WEEK_FROM_HOUR) sunMs = now.getTime() + 86400000;
  else if (dow === 7 && h >= 7 && h < 12) sunMs = now.getTime();
  if (sunMs === null) return null;
  return { sunMs: sunMs, key: Utilities.formatDate(new Date(sunMs), tz, 'yyyy-MM-dd') };
}

/** האירועים של שבעת הימים מ-sunMs, ממוינים, והמשתנים לתבנית. */
function eventsWeekData_(sunMs) {
  var tz = 'Asia/Jerusalem';
  var days = [], dayIdx = {}, years = {};
  for (var i = 0; i < 7; i++) {
    var d = new Date(sunMs + i * 86400000);
    var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
    days.push(key); dayIdx[key] = i; years[key.substring(0, 4)] = true;
  }
  var evs = [];
  Object.keys(years).forEach(function (yy) {
    var doc = null;
    try { doc = fsGet_(fsDocPath_('eventsCal', yy)); } catch (e) { Logger.log('eventsWeekData_: ' + e); }
    ((doc && doc.events) || []).forEach(function (e) {
      if (!e || !e.title || !(e.category in EVT_WEEK_CATS)) return;
      var when = new Date(String(e.date || ''));
      if (isNaN(when.getTime())) return;
      var k = Utilities.formatDate(when, tz, 'yyyy-MM-dd');
      if (!(k in dayIdx)) return;
      evs.push({ i: dayIdx[k], t: when.getTime(), allDay: !!e.allDay, title: String(e.title).substring(0, 80),
                 place: String(e.location || '').substring(0, 60), cat: e.category,
                 dm: Utilities.formatDate(when, tz, 'd.M'),
                 hm: e.allDay ? '' : Utilities.formatDate(when, tz, 'HH:mm') });
    });
  });
  evs.sort(function (a, b) { return a.t - b.t; });
  var lines = evs.map(function (e) {
    var tag = EVT_WEEK_CATS[e.cat];
    return '• יום ' + EVT_WEEK_DAYS[e.i] + ' ' + e.dm + (e.hm ? ' · ' + e.hm : '') + ' — ' + e.title +
           (e.place ? ' (' + e.place + ')' : '') + (tag ? ' · ' + tag : '');
  });
  /* לפוש: קודם אירועי הקהילה והתרבות, אחר כך חגים וחופשות. */
  var ordered = evs.filter(function (e) { return !EVT_WEEK_CATS[e.cat]; })
                   .concat(evs.filter(function (e) { return !!EVT_WEEK_CATS[e.cat]; }));
  var short = ordered.map(function (e) { return e.title + ' (' + EVT_WEEK_DAYS[e.i] + ')'; }).join(' · ');
  var first = Utilities.formatDate(new Date(sunMs), tz, 'd.M');
  var last = Utilities.formatDate(new Date(sunMs + 6 * 86400000), tz, 'd.M');
  return { count: evs.length, key: days[0],
           vars: { 'שבוע': first + '–' + last, 'מספר': String(evs.length),
                   'רשימה': lines.join('\n'), 'רשימה קצרה': short } };
}

function eventsWeekJob_(ss, now) {
  now = now || new Date();
  var due = eventsWeekDue_(now);
  if (!due) return { due: false };
  var props = PropertiesService.getScriptProperties();
  var flag = 'EVT_WEEK_SENT_' + due.key;
  if (props.getProperty(flag)) return { due: true, already: true };
  var w = eventsWeekData_(due.sunMs);
  /* הדגל לפני השליחה: כשל באמצע עדיף על פוש כפול לכל השיכון. */
  props.setProperty(flag, new Date().toISOString());
  try {
    (props.getKeys ? props.getKeys() : []).forEach(function (k) {
      if (k.indexOf('EVT_WEEK_SENT_') === 0 && k !== flag) props.deleteProperty(k);
    });
  } catch (e) { /* ניקוי בלבד */ }
  if (!w.count) return { due: true, sent: 0, empty: true };
  var rep = notify_(ss, 'evt-week', { vars: w.vars }, ['all']);
  return { due: true, events: w.count, push: rep.push, mail: rep.mail };
}

/** המלצת תושב על שירות — נקרא מהדפדפן אחרי שההמלצה נכתבה. */
function notifyServiceRecommend_(ss, body) {
  /* ⚠️ פתוח לכל תושב — ולכן מגבלה: הודעה אחת לתושב בשתי דקות, כדי
     שלחיצות חוזרות (או סקריפט) לא יציפו את מנהל-העל. */
  try {
    var cache = CacheService.getScriptCache();
    var ck = 'svcrec_' + normalizeEmail_(body._email);
    if (cache.get(ck)) return { ok: true, throttled: true };
    cache.put(ck, '1', 120);
  } catch (e) { /* בלי מטמון — ממשיכים */ }
  var name = '';
  try { var pr = permissionsFor_(body._email); name = (pr.firstName || '') + (pr.family ? ' ' + pr.family : ''); } catch (e) {}
  notify_(ss, 'svc-recommend', { vars: { 'שם': name.trim() || 'תושב', 'שירות': String(body.service || '').substring(0, 80) } }, ['s']);
  return { ok: true };
}

/* ===========================================================================
 *  גינון — מיפוי אירוע המשימה לטריגר, וסיכומים
 * ========================================================================= */
/* ערך `notify` שהדפדפן כותב על המשימה ← שורה בטבלה.
   ⚠️ חייב להתאים ל-`gtNotifyOk` בכללי האבטחה ול-GARDEN_TASK_TEMPLATES. */
var GARDEN_NOTIFY_TRIG = {
  GARDEN_COMPLETED: 'gar-done', GARDEN_REPORT_DECLINED: 'gar-declined',
  GARDEN_PLANNED: 'gar-planned', GARDEN_REOPENED: 'gar-reopen',
  GARDEN_REPORT_MERGED: 'gar-merged', GARDEN_RESCHEDULED: 'gar-resched',
  GARDEN_STATUS_NOTE: 'gar-note',
  /* 23.9 — מרכז ההתראות */
  GARDEN_FINAL_CHECK: 'gar-awaiting', GARDEN_PENDING_REVIEW: 'gar-blocked',
  GARDENER_TASK_RETURNED: 'gar-returned', GARDEN_RECHECK_DONE: 'gar-recheck'
};

/** הודעות של אירוע משימה אחד — לתושב (אם יש דיווח), ולצוות.
 *  t = מסמך המשימה. מחזיר מספר הודעות שיצאו. */
function notifyGardenTask_(ss, t, tpl) {
  /* 🔴 "הוחזר להשלמה" על משימה **שנסגרה** (הדפדפן כותב GARDEN_REOPENED
     ודגל "הוחזר להשלמה"): התושב שכבר שמע "הושלם" שומע שהטיפול נפתח
     מחדש — **בלי** הערת המנהל. ההערה עצמה הולכת לגנן בלבד. */
  if (tpl === 'GARDEN_REOPENED' && String(t.flag || '') === 'הוחזר להשלמה') {
    var n1 = notifyGardenTask_(ss, { id: t.id, title: t.title, category: t.category, area: t.area,
                                     place: t.place, week: t.week, repId: t.repId,
                                     mergedReps: t.mergedReps, notifyNote: '' }, 'GARDEN_REOPENED_PLAIN');
    var tt = {};
    Object.keys(t).forEach(function (k) { tt[k] = t[k]; });
    tt.repId = ''; tt.mergedReps = [];              // לתושב כבר נשלח למעלה
    return n1 + notifyGardenTask_(ss, tt, 'GARDENER_TASK_RETURNED');
  }
  var plain = (tpl === 'GARDEN_REOPENED_PLAIN');
  if (plain) tpl = 'GARDEN_REOPENED';
  var trig = GARDEN_NOTIFY_TRIG[tpl];
  if (!trig) return 0;
  var hit = notifyIndex_().byId[trig];
  var note = String(t.notifyNote == null ? '' : t.notifyNote).trim();
  var place = String(t.place || t.area || '').trim() || 'השיכון';
  var base = {
    'כותרת': String(t.title || ''),
    'קטגוריה': String(t.category || ''),
    'מיקום': place,
    'מזהה': String(t.id || ''),
    'שבוע': gardenWeekLabel_(t.week),
    'מה נעשה': note ? note + '\n\n' : '',
    'עדכון': note,
    'הערה': note,
    'סיבה': (tpl === 'GARDEN_REOPENED') ? (note ? note + '\n\n' : '') : note,
    'תוצאה': note || 'הטיפול נבדק שוב'
  };
  var sent = 0;

  /* לתושב — המדווח, וגם כל מי שהדיווח שלו אוחד לתוך המשימה. */
  var reps = [];
  if (String(t.repId || '').trim()) reps.push(String(t.repId).trim());
  (t.mergedReps || []).forEach(function (x) { x = String(x || '').trim(); if (x && reps.indexOf(x) === -1) reps.push(x); });
  if (reps.length && hit.row.cells.r) {
    var names = null;
    var seenFam = {};
    reps.forEach(function (repId) {
      var rep = null;
      try { rep = fsGet_(fsDocPath_(FS_GARDEN_REPORTS, repId)); } catch (e) { rep = null; }
      if (!rep) return;
      var fam = String(rep.familyId || '').trim();
      if (!fam || seenFam[fam]) return;
      seenFam[fam] = true;
      if (!names) names = txFamilyNames_(ss);
      var vars = {};
      Object.keys(base).forEach(function (k) { vars[k] = base[k]; });
      vars['שם'] = String(names[fam] || '').trim() || 'תושב';
      vars['מזהה'] = String(rep.id || repId);
      vars['קטגוריה'] = String(rep.category || t.category || '');
      vars['מיקום'] = String(rep.place || rep.area || '').trim() || place;
      /* 🔴 "צורף לפנייה X" — המספר של הפנייה הראשית (יצא ריק עד היום).
         המשימה כאן היא ה**נבלעת**, ולכן המספר נלקח מההערה שהדפדפן כתב
         באיחוד ("אוחד עם פנייה מס' X") — לא מ-repId שלה, שהוא של התושב. */
      var pm = /מס' (\S+)/.exec(note);
      vars['מזהה אב'] = pm ? pm[1] : '';
      var r1 = notify_(ss, trig, { vars: vars, r: { familyId: fam } }, ['r']);
      sent += r1.mail + r1.push;
    });
  }

  /* לצוות — בלי שמות תושבים. */
  var team = plain ? [] : Object.keys(hit.row.cells).filter(function (x) { return x !== 'r'; });
  if (trig === 'gar-planned' || trig === 'gar-resched') {
    /* לגנן — רק כשהמשימה נכנסה לשבוע הנוכחי. */
    if (String(t.week || '') !== gardenWeekKey_()) team = team.filter(function (x) { return x !== 'g'; });
  }
  if (team.length) {
    var r2 = notify_(ss, trig, { vars: base }, team);
    sent += r2.mail + r2.push + r2.digest;
  }
  return sent;
}

/** פריטי הגינון הפתוחים, מ-Firestore. */
function gardenOpenTasksForDigest_() {
  var all = [];
  try { all = fsList_(FS_GARDEN_TASKS) || []; } catch (e) { Logger.log('gardenOpenTasksForDigest_: ' + e); return null; }
  return all.map(function (d) { var x = d.data || {}; x.id = x.id || d.id; return x; });
}

function gardenTsMs_(v) {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  var n = Date.parse(String(v));
  return isNaN(n) ? 0 : n;
}

/** סיכום יומי (כל בוקר) + שבועי ו"העבודה שלך השבוע" (ביום הסיכום השבועי). */
function gardenDigestJob_(ss) {
  var out = { daily: 0, weekly: 0, plan: 0 };
  var tasks = gardenOpenTasksForDigest_();
  if (!tasks) return out;
  var now = Date.now(), weekAgo = now - 7 * 86400000;
  var open = tasks.filter(function (t) { return !String(t.closure || '').trim() && t.pendingDelete !== true; });

  /* --- יומי --- */
  var unplanned = open.filter(function (t) { return !String(t.week || '').trim(); }).length;
  var awaiting = open.filter(function (t) { return String(t.flag || '') === 'ממתין לאישור'; }).length;
  var blocked = open.filter(function (t) { return String(t.flag || '') === 'דורש בדיקה בשטח'; }).length;
  var old = open.filter(function (t) { var c = gardenTsMs_(t.createdAt); return c && c < weekAgo; }).length;
  var lines = notifyDigestTake_('gar');
  if (unplanned || awaiting || blocked || old || lines.length) {
    var r = notify_(ss, 'gar-daily', { vars: {
      'לא שובצו': unplanned, 'לאישורך': awaiting, 'חסומות': blocked, 'מעל 7 ימים': old,
      'עדכונים': lines.length ? ('עדכונים מהיממה האחרונה:\n' + lines.map(function (l) { return '• ' + l; }).join('\n') + '\n\n') : ''
    } });
    out.daily = r.mail + r.push;
  }

  /* --- שבועי --- */
  var settings = getEmailSettings_(ss);
  var weeklyDay = emailRule_(settings, 'RULE_GARDEN_WEEKLY_DAY', 0);
  if (Number(Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'u')) % 7 !== weeklyDay) return out;
  var done = tasks.filter(function (t) {
    return String(t.closure || '') === 'בוצע' && gardenTsMs_(t.approvedAt) >= weekAgo;
  }).length;
  var opened = tasks.filter(function (t) { return gardenTsMs_(t.createdAt) >= weekAgo; }).length;
  var dragged = open.filter(function (t) { return String(t.flag || '') === 'נגררה'; }).length;
  var wk = gardenWeekKey_();
  var rw = notify_(ss, 'gar-weekly', { vars: { 'בוצעו': done, 'נפתחו': opened, 'נגררות': dragged,
                                                 'שבוע': gardenWeekLabel_(wk) } });
  out.weekly = rw.mail + rw.push;

  /* "העבודה שלך השבוע" — לגנן, לפי אזור, בלי שמות תושבים. */
  var mine = open.filter(function (t) { return String(t.week || '') === wk; });
  if (mine.length) {
    var byArea = {};
    mine.forEach(function (t) {
      var a = String(t.area || t.place || 'כללי').trim() || 'כללי';
      (byArea[a] = byArea[a] || []).push('  – ' + String(t.title || t.category || 'משימה'));
    });
    var list = Object.keys(byArea).sort().map(function (a) { return '• ' + a + ':\n' + byArea[a].join('\n'); }).join('\n');
    var rp = notify_(ss, 'gar-gardener-week', { vars: { 'מספר': mine.length, 'שבוע': gardenWeekLabel_(wk), 'רשימה': list } });
    out.plan = rp.mail + rp.push;
  }
  return out;
}

/* ===========================================================================
 *  הקטלוג — שורה לכל פעולה, עמודה לכל נמען. ברירות המחדל = ההחלטות במרכז
 *  ההתראות (ארטיפקט 23.9). k = שם תבנית המייל, pt/pb = כותרת/טקסט פוש,
 *  link = מסך יעד, app = הטקסט באפליקציה, d = בסיכום היומי.
 * ========================================================================= */
var NOTIFY_DOMAINS = [
 {"id":"gar","name":"גינון","perm":"גינון","cols":{"r":"התושב המדווח","a":"מנהל גינון","g":"הגנן","s":"מנהל-על"},"rows":[
  {"grp":"פתיחת הדיווח"},
  {"id":"gar-new","ev":"דיווח חדש","w":"מיידי","vars":["שם","כותרת","קטגוריה","מיקום","מזהה"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"GARDEN_REPORT_RECEIVED","pt":"קיבלנו את הדיווח","pb":"{{כותרת}} · {{מיקום}}","link":"הדיווחים שלי (גינון)","app":"נפתח · הדיווח הועבר לצוות הגינון","badge":1},"a":{"m":0,"p":1,"d":1,"k":"ADMIN_NEW_GARDEN_REPORT","pt":"דיווח גינון חדש","pb":"{{קטגוריה}} · {{מיקום}} · {{כותרת}}","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"דיווח גינון חדש","pb":"{{קטגוריה}} · {{מיקום}} · {{כותרת}}","link":"משימות גינון","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_NEW_GARDEN_REPORT","pt":"דיווח גינון חדש","pb":"{{קטגוריה}} · {{מיקום}} · {{כותרת}}","link":"משימות גינון","app":"","badge":0}},"why":"שם התושב נשלח רק למנהלים. הגנן לא מקבל."},
  {"id":"gar-photos","ev":"תמונות שלא עלו במלואן","w":"בדיקה שעתית","vars":["רשימה"],"cells":{"r":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"הדיווחים שלי (גינון)","app":"","badge":0},"a":{"m":1,"p":1,"d":0,"k":"ADMIN_GARDEN_PHOTOS_MISSING","pt":"חסרות תמונות בדיווחים","pb":"בחלק מהדיווחים התמונות לא עלו במלואן.","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"חסרות תמונות בדיווחים","pb":"בחלק מהדיווחים התמונות לא עלו במלואן.","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_GARDEN_PHOTOS_MISSING","pt":"חסרות תמונות בדיווחים","pb":"בחלק מהדיווחים התמונות לא עלו במלואן.","link":"משימות גינון","app":"","badge":0}},"why":"בדיקה אוטומטית פעם בשעה. בלי הגנן."},
  {"grp":"שיבוץ ודחייה"},
  {"id":"gar-planned","ev":"שובץ לשבוע","w":"מיידי","vars":["שם","קטגוריה","מיקום","שבוע","מזהה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_PLANNED","pt":"הדיווח שובץ לעבודה","pb":"{{קטגוריה}} ב{{מיקום}} · שבוע {{שבוע}}","link":"הדיווחים שלי (גינון)","app":"שובץ לשבוע {{שבוע}}","badge":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":1,"d":0,"k":"GARDENER_TASK_ADDED","pt":"משימה חדשה השבוע","pb":"{{קטגוריה}} · {{מיקום}}","link":"משימות גינון","app":"","badge":0,"n":"רק אם זה השבוע הנוכחי"},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"לתושב: השבוע עצמו כתוב. לגנן: רק אם זה השבוע הנוכחי."},
  {"id":"gar-resched","ev":"נדחה לשבוע אחר","w":"מיידי","vars":["שם","קטגוריה","מיקום","שבוע"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_RESCHEDULED","pt":"מועד הטיפול השתנה","pb":"{{קטגוריה}} ב{{מיקום}} · עבר לשבוע {{שבוע}}","link":"הדיווחים שלי (גינון)","app":"המועד עודכן לשבוע {{שבוע}}","badge":1},"a":{"m":0,"p":0,"d":1,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"בלי הערה פנימית — רק השבוע החדש."},
  {"grp":"ביצוע וסגירה"},
  {"id":"gar-awaiting","ev":"הגנן סימן \"בוצע\" — ממתין לאישור","w":"מיידי","vars":["קטגוריה","מיקום","כותרת","מה נעשה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_FINAL_CHECK","pt":"הטיפול בבדיקה אחרונה","pb":"{{קטגוריה}} ב{{מיקום}} · הצוות סיים, המנהל בודק.","link":"הדיווחים שלי (גינון)","app":"בבדיקה אחרונה · הצוות סיים, המנהל בודק","badge":1},"a":{"m":0,"p":1,"d":0,"k":"ADMIN_GARDEN_AWAITING_APPROVAL","pt":"ממתין לאישורך","pb":"{{כותרת}} · {{מיקום}} · הגנן סימן בוצע","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"ממתין לאישורך","pb":"{{כותרת}} · {{מיקום}} · הגנן סימן בוצע","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_GARDEN_AWAITING_APPROVAL","pt":"ממתין לאישורך","pb":"{{כותרת}} · {{מיקום}} · הגנן סימן בוצע","link":"משימות גינון","app":"","badge":0}}},
  {"id":"gar-done","ev":"אושר / הושלם","w":"מיידי","vars":["שם","קטגוריה","מיקום","מה נעשה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_COMPLETED","pt":"הטיפול הושלם","pb":"{{קטגוריה}} ב{{מיקום}}. משהו לא תקין? אפשר לספר לנו בתוך שבוע.","link":"הדיווחים שלי (גינון)","app":"הושלם · אפשר לתת משוב בתוך שבוע","badge":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}}},
  {"id":"gar-returned","ev":"הוחזר לגנן להשלמה","w":"מיידי","vars":["כותרת","מיקום","הערה"],"cells":{"r":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"הדיווחים שלי (גינון)","app":"","badge":0,"noapp":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":1,"d":0,"k":"GARDENER_TASK_RETURNED","pt":"הוחזר אליך להשלמה","pb":"{{כותרת}} · {{הערה}}","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"הערת המנהל — לגנן בלבד. לא מופיעה בקו הזמן של התושב."},
  {"id":"gar-blocked","ev":"הגנן חסם (\"לא ניתן לביצוע\")","w":"מיידי","vars":["כותרת","קטגוריה","מיקום","סיבה","מזהה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_PENDING_REVIEW","pt":"הדיווח ממתין לבדיקה","pb":"{{קטגוריה}} ב{{מיקום}} · נעדכן כשתתקבל החלטה.","link":"הדיווחים שלי (גינון)","app":"ממתין לבדיקה","badge":1},"a":{"m":1,"p":1,"d":0,"k":"ADMIN_GARDEN_TASK_BLOCKED","pt":"משימה שאי אפשר לבצע","pb":"{{כותרת}} · {{סיבה}}","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"משימה שאי אפשר לבצע","pb":"{{כותרת}} · {{סיבה}}","link":"משימות גינון","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_GARDEN_TASK_BLOCKED","pt":"משימה שאי אפשר לבצע","pb":"{{כותרת}} · {{סיבה}}","link":"משימות גינון","app":"","badge":0}},"why":"לתושב: \"ממתין לבדיקה\", בלי הסיבה. למנהל: עם הסיבה."},
  {"id":"gar-note","ev":"הערת צוות","w":"מיידי","vars":["קטגוריה","מיקום","עדכון"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_STATUS_NOTE","pt":"עדכון: {{קטגוריה}} ב{{מיקום}}","pb":"{{עדכון}}","link":"הדיווחים שלי (גינון)","app":"עדכון מהצוות: {{עדכון}}","badge":1,"n":"רק אם סומן \"לשלוח לתושב\""},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"לתושב רק אם סומן \"לשלוח לתושב\". עדכוני סטטוס שמיועדים לתושב — תמיד."},
  {"id":"gar-declined","ev":"נסגר עם סיבה","w":"מיידי","vars":["שם","קטגוריה","מיקום","סיבה","מזהה"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"GARDEN_REPORT_DECLINED","pt":"הדיווח נסגר","pb":"{{קטגוריה}} ב{{מיקום}} · ההסבר נשלח במייל.","link":"הדיווחים שלי (גינון)","app":"נסגר · {{סיבה}}","badge":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}}},
  {"id":"gar-merged","ev":"אוחד לפנייה אחרת","w":"מיידי","vars":["שם","קטגוריה","מיקום","מזהה אב"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"GARDEN_REPORT_MERGED","pt":"הדיווח צורף לפנייה קיימת","pb":"{{קטגוריה}} ב{{מיקום}} כבר בטיפול.","link":"הדיווחים שלי (גינון)","app":"צורף לפנייה {{מזהה אב}}","badge":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"גם לדיווחים שאוחדו, עם מספר הפנייה הראשית."},
  {"id":"gar-reopen","ev":"נפתח מחדש","w":"מיידי","vars":["שם","קטגוריה","מיקום","סיבה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_REOPENED","pt":"הדיווח נפתח מחדש","pb":"{{קטגוריה}} ב{{מיקום}} חזר לטיפול הצוות.","link":"הדיווחים שלי (גינון)","app":"נפתח מחדש וחזר לטיפול","badge":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"הסיבה החדשה בלבד, בלי הערה קודמת."},
  {"grp":"אחרי הסגירה"},
  {"id":"gar-neg","ev":"משוב שלילי מתושב","w":"מיידי","vars":["שם","מזהה","קטגוריה","מיקום","הערה"],"cells":{"r":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"הדיווחים שלי (גינון)","app":"תודה, העברנו לבדיקה חוזרת","badge":1},"a":{"m":1,"p":1,"d":0,"k":"ADMIN_GARDEN_NEGATIVE_FEEDBACK","pt":"משוב שלילי על טיפול","pb":"{{קטגוריה}} ב{{מיקום}} · ממתין להחלטתך","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"משוב שלילי על טיפול","pb":"{{קטגוריה}} ב{{מיקום}} · ממתין להחלטתך","link":"משימות גינון","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_GARDEN_NEGATIVE_FEEDBACK","pt":"משוב שלילי על טיפול","pb":"{{קטגוריה}} ב{{מיקום}} · ממתין להחלטתך","link":"משימות גינון","app":"","badge":0}},"why":"לגנן לא נשלח."},
  {"id":"gar-recheck","ev":"הבדיקה החוזרת הסתיימה","w":"מיידי","vars":["קטגוריה","מיקום","תוצאה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GARDEN_RECHECK_DONE","pt":"בדקנו שוב את הדיווח","pb":"{{קטגוריה}} ב{{מיקום}} · {{תוצאה}}","link":"הדיווחים שלי (גינון)","app":"בדקנו שוב · {{תוצאה}}","badge":1},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}}},
  {"grp":"סיכומים"},
  {"id":"gar-daily","ev":"סיכום יומי","w":"כל בוקר, 08:00","vars":["לא שובצו","לאישורך","חסומות","מעל 7 ימים"],"cells":{"r":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"הדיווחים שלי (גינון)","app":"","badge":0},"a":{"m":1,"p":1,"d":0,"k":"ADMIN_GARDEN_DAILY","pt":"סיכום גינון יומי","pb":"{{לא שובצו}} לא שובצו · {{לאישורך}} לאישורך · {{חסומות}} חסומות","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"סיכום גינון יומי","pb":"{{לא שובצו}} לא שובצו · {{לאישורך}} לאישורך · {{חסומות}} חסומות","link":"משימות גינון","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_GARDEN_DAILY","pt":"סיכום גינון יומי","pb":"{{לא שובצו}} לא שובצו · {{לאישורך}} לאישורך · {{חסומות}} חסומות","link":"משימות גינון","app":"","badge":0}},"why":"מה לא שובץ · מה ממתין לאישור · מה חסום · מה מעל 7 ימים, ועדכוני \"בסיכום\" מאתמול."},
  {"id":"gar-weekly","ev":"סיכום שבועי","w":"ראשון בבוקר","vars":["בוצעו","נפתחו","נגררות","שבוע"],"cells":{"r":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"הדיווחים שלי (גינון)","app":"","badge":0},"a":{"m":0,"p":1,"d":0,"k":"ADMIN_GARDEN_WEEKLY","pt":"סיכום הגינון השבועי","pb":"{{בוצעו}} בוצעו · {{נפתחו}} חדשות · {{נגררות}} נגררות","link":"משימות גינון","app":"","badge":0},"g":{"m":0,"p":0,"d":0,"k":"","pt":"סיכום הגינון השבועי","pb":"{{בוצעו}} בוצעו · {{נפתחו}} חדשות · {{נגררות}} נגררות","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_GARDEN_WEEKLY","pt":"סיכום הגינון השבועי","pb":"{{בוצעו}} בוצעו · {{נפתחו}} חדשות · {{נגררות}} נגררות","link":"משימות גינון","app":"","badge":0}},"why":"מה בוצע השבוע, מה נפתח ומה נגרר."},
  {"id":"gar-gardener-week","ev":"\"העבודה שלך השבוע\"","w":"ראשון בבוקר","vars":["מספר","שבוע","רשימה"],"cells":{"r":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"הדיווחים שלי (גינון)","app":"","badge":0},"a":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0},"g":{"m":1,"p":1,"d":0,"k":"GARDENER_WEEKLY_PLAN","pt":"העבודה שלך השבוע","pb":"{{מספר}} משימות לשבוע {{שבוע}}. הרשימה באפליקציה.","link":"משימות גינון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"משימות גינון","app":"","badge":0}},"why":"רשימה לפי אזור, בלי שמות תושבים."}
 ]},
 {"id":"res","name":"תושבים והרשמה","perm":"תושבים","cols":{"r":"מי שפנה","a":"מנהל תושבים","s":"מנהל-על"},"rows":[
  {"id":"signup-new","ev":"בקשת הרשמה חדשה","w":"מיידי","vars":["שם","אימייל"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"SIGNUP_RECEIVED","pt":"","pb":"","link":"דף הבית","app":"","badge":0,"nopush":1},"a":{"m":0,"p":1,"d":0,"k":"ADMIN_NEW_SIGNUP","pt":"בקשת הרשמה חדשה","pb":"{{שם}} · ממתין לאישורך","link":"תושבים","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_NEW_SIGNUP","pt":"בקשת הרשמה חדשה","pb":"{{שם}} · ממתין לאישורך","link":"תושבים","app":"","badge":0}},"why":"לתושב עוד אין אפליקציה — רק מייל."},
  {"id":"signup-ok","ev":"הרשמה אושרה","w":"מיידי","vars":["שם","קישור"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"SIGNUP_APPROVED","pt":"","pb":"","link":"דף הבית","app":"","badge":0,"nopush":1}}},
  {"id":"signup-no","ev":"הרשמה נדחתה","w":"מיידי","vars":["שם"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"SIGNUP_REJECTED","pt":"","pb":"","link":"דף הבית","app":"","badge":0,"nopush":1}}},
  {"id":"welcome","ev":"מנהל הוסיף תושב ידנית","w":"מיידי","vars":["קישור"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"WELCOME_MANUAL","pt":"","pb":"","link":"דף הבית","app":"","badge":0,"nopush":1}}},
  {"id":"signup-stale","ev":"הרשמה ממתינה X ימים","w":"בדיקה יומית","vars":["שם","אימייל","ימים"],"cells":{"a":{"m":1,"p":1,"d":0,"k":"ADMIN_STALE_SIGNUP","pt":"הרשמה ממתינה {{ימים}} ימים","pb":"{{שם}} עדיין מחכה לתשובה.","link":"תושבים","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_STALE_SIGNUP","pt":"הרשמה ממתינה {{ימים}} ימים","pb":"{{שם}} עדיין מחכה לתשובה.","link":"תושבים","app":"","badge":0}}},
  {"id":"profile-new","ev":"בקשה לשינוי פרטים","w":"מיידי","vars":["שם","שדה","ערך","ערך נוכחי","ערך מבוקש"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"PROFILE_CHANGE_RECEIVED","pt":"קיבלנו את בקשת השינוי","pb":"שינוי {{שדה}} ממתין לאישור הוועד.","link":"דף הבית","app":"","badge":0},"a":{"m":0,"p":1,"d":0,"k":"PROFILE_CHANGE_NEW","pt":"בקשת שינוי פרטים","pb":"{{שם}} · שינוי {{שדה}} · ממתין לאישורך","link":"תושבים","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"PROFILE_CHANGE_NEW","pt":"בקשת שינוי פרטים","pb":"{{שם}} · שינוי {{שדה}} · ממתין לאישורך","link":"תושבים","app":"","badge":0}}},
  {"id":"profile-other","ev":"בקשה לשנות את המייל של בן/בת הזוג","w":"מיידי","vars":["שם המבקש","ערך מבוקש"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"PROFILE_CHANGE_OTHER_SLOT_NOTICE","pt":"בקשה לשנות את כתובת הכניסה שלך","pb":"הבקשה נשלחה מהמשפחה שלך. לא מוכר? פנו לוועד לפני האישור.","link":"דף הבית","app":"","badge":0}},"why":"\"מי שפנה\" כאן = בעל הכתובת."},
  {"id":"profile-ok","ev":"שינוי פרטים אושר","w":"מיידי","vars":["שם","שדה","ערך"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"PROFILE_CHANGE_APPROVED","pt":"השינוי אושר","pb":"{{שדה}} עודכן.","link":"דף הבית","app":"","badge":0}}},
  {"id":"profile-no","ev":"שינוי פרטים נדחה","w":"מיידי","vars":["שם","שדה","סיבה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"PROFILE_CHANGE_REJECTED","pt":"בקשת השינוי לא אושרה","pb":"הפרטים והסיבה במייל ובאפליקציה.","link":"דף הבית","app":"","badge":0}}}
 ]},
 {"id":"bud","name":"תקציב","perm":"תקציב","cols":{"r":"מי שפנה","a":"מנהל תקציב","s":"מנהל-על"},"rows":[
  {"id":"reimb-new","ev":"בקשת החזר חדשה","w":"מיידי","vars":["שם","סכום","מזהה"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"REIMBURSEMENT_RECEIVED","pt":"קיבלנו את בקשת ההחזר","pb":"{{סכום}} ₪ · נעדכן כשהסטטוס ישתנה.","link":"הבקשות שלי (החזרים)","app":"","badge":0},"a":{"m":0,"p":1,"d":0,"k":"ADMIN_NEW_REIMBURSEMENT","pt":"בקשת החזר חדשה","pb":"{{שם}} · {{סכום}} ₪ · ממתין לבדיקה","link":"הוצאות","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_NEW_REIMBURSEMENT","pt":"בקשת החזר חדשה","pb":"{{שם}} · {{סכום}} ₪ · ממתין לבדיקה","link":"הוצאות","app":"","badge":0}}},
  {"id":"reimb-ready","ev":"החזר אושר ועבר להנה\"ח","w":"מיידי","vars":["שם","סכום","מזהה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"REIMBURSEMENT_READY","pt":"ההחזר אושר","pb":"{{סכום}} ₪ הועברו להנהלת חשבונות לתשלום.","link":"הבקשות שלי (החזרים)","app":"","badge":0}}},
  {"id":"reimb-paid","ev":"החזר שולם","w":"מיידי","vars":["שם","סכום","מזהה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"REIMBURSEMENT_PAID","pt":"ההחזר שולם","pb":"{{סכום}} ₪ שולמו. תודה!","link":"הבקשות שלי (החזרים)","app":"","badge":0}}},
  {"id":"reimb-no","ev":"החזר נדחה","w":"מיידי","vars":["שם","סכום","מזהה","הערה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"REIMBURSEMENT_REJECTED","pt":"בקשת ההחזר לא אושרה","pb":"{{סכום}} ₪ · הפרטים במייל ובאפליקציה.","link":"הבקשות שלי (החזרים)","app":"","badge":0}}},
  {"id":"reimb-stale","ev":"החזר ממתין X ימים","w":"בדיקה יומית","vars":["שם","סכום","מזהה","ימים"],"cells":{"a":{"m":1,"p":1,"d":0,"k":"ADMIN_STALE_REIMBURSEMENT","pt":"החזר ממתין {{ימים}} ימים","pb":"{{שם}} · {{סכום}} ₪","link":"הוצאות","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_STALE_REIMBURSEMENT","pt":"החזר ממתין {{ימים}} ימים","pb":"{{שם}} · {{סכום}} ₪","link":"הוצאות","app":"","badge":0}}},
  {"id":"reimb-17","ev":"17 לחודש — בקשות פתוחות","w":"חודשי","vars":[],"cells":{"a":{"m":1,"p":0,"d":0,"k":"ADMIN_MONTHLY_DIGEST","pt":"חלון ההחזרים נסגר ב-19","pb":"יש בקשות החזר פתוחות. הרשימה במייל.","link":"הוצאות","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_MONTHLY_DIGEST","pt":"חלון ההחזרים נסגר ב-19","pb":"יש בקשות החזר פתוחות. הרשימה במייל.","link":"הוצאות","app":"","badge":0}}},
  {"id":"rollover","ev":"צריך להחליף שנת תקציב","w":"פעם בשנה, ספטמבר","vars":["שנה נוכחית","שנה הבאה"],"cells":{"a":{"m":1,"p":1,"d":0,"k":"ADMIN_YEAR_ROLLOVER","pt":"צריך להחליף שנת תקציב","pb":"הוצאות חדשות עדיין נרשמות ל-{{שנה נוכחית}}.","link":"הוצאות","app":"","badge":0},"s":{"m":1,"p":1,"d":0,"k":"ADMIN_YEAR_ROLLOVER","pt":"צריך להחליף שנת תקציב","pb":"הוצאות חדשות עדיין נרשמות ל-{{שנה נוכחית}}.","link":"הוצאות","app":"","badge":0}}}
 ]},
 {"id":"club","name":"מועדון","perm":"מועדון","cols":{"r":"מי שפנה","a":"מנהל מועדון","s":"מנהל-על"},"rows":[
  {"id":"club-new","ev":"בקשת שריון","w":"מיידי","vars":["שם","תאריך","שעה"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"CLUB_RECEIVED","pt":"קיבלנו את בקשת השריון","pb":"{{תאריך}} · {{שעה}} · ממתין לאישור הוועד","link":"מועדון","app":"","badge":0},"a":{"m":0,"p":1,"d":0,"k":"ADMIN_NEW_CLUB","pt":"בקשת שריון חדשה","pb":"{{שם}} · {{תאריך}} · {{שעה}}","link":"ניהול מועדון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_NEW_CLUB","pt":"בקשת שריון חדשה","pb":"{{שם}} · {{תאריך}} · {{שעה}}","link":"ניהול מועדון","app":"","badge":0}},"why":"אישור קבלה לתושב על הבקשה."},
  {"id":"club-ok","ev":"שריון אושר","w":"מיידי","vars":["שם","תאריך","שעה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"CLUB_APPROVED","pt":"השריון במועדון אושר","pb":"{{תאריך}} · {{שעה}}. נשאר להסדיר תשלום מול הוועד.","link":"מועדון","app":"","badge":0}}},
  {"id":"club-no","ev":"שריון נדחה","w":"מיידי","vars":["שם","תאריך","שעה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"CLUB_REJECTED","pt":"השריון במועדון לא אושר","pb":"{{תאריך}} · {{שעה}}. אפשר לבחור מועד אחר באפליקציה.","link":"מועדון","app":"","badge":0}}},
  {"id":"club-remind","ev":"תזכורת לפני השריון","w":"בדיקה יומית","vars":["שם","תאריך","שעה"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"CLUB_REMINDER","pt":"תזכורת: שריון במועדון","pb":"{{תאריך}} · {{שעה}}. לוודא תשלום ולעבור על החוקים.","link":"מועדון","app":"","badge":0}},"why":"נשלח לפי מספר הימים שבהגדרות הכלליות."},
  {"id":"club-stale","ev":"שריון ממתין X ימים","w":"בדיקה יומית","vars":["שם","תאריך","ימים"],"cells":{"a":{"m":1,"p":1,"d":0,"k":"ADMIN_STALE_CLUB","pt":"שריון ממתין {{ימים}} ימים","pb":"{{שם}} · {{תאריך}}","link":"ניהול מועדון","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_STALE_CLUB","pt":"שריון ממתין {{ימים}} ימים","pb":"{{שם}} · {{תאריך}}","link":"ניהול מועדון","app":"","badge":0}}}
 ]},
 {"id":"gym","name":"מכון כושר","perm":"מכון","cols":{"r":"מי שפנה","a":"מנהל מכון","s":"מנהל-על"},"rows":[
  {"id":"gym-new","ev":"הרשמה (בלי דגל בריאות)","w":"מיידי","vars":["שם","סכום","מסלול"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_APPROVED_AWAITING_PAYMENT","pt":"ההרשמה למכון אושרה","pb":"נשאר לשלם {{סכום}} ₪ כדי להפעיל את המנוי.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-flag","ev":"הרשמה עם דגל בריאות","w":"מיידי","vars":["שם","אימייל","שאלות"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_DOCTOR_NOTE_REQUIRED","pt":"נדרש אישור רופא למכון","pb":"הפרטים נשלחו אליך במייל.","link":"מכון כושר","app":"","badge":0},"a":{"m":1,"p":1,"d":0,"k":"ADMIN_NEW_GYM_FLAGGED","pt":"הרשמה למכון — דרוש אישור רופא","pb":"{{שם}} · ממתין לאישור רופא ולאישורך","link":"ניהול מכון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_NEW_GYM_FLAGGED","pt":"הרשמה למכון — דרוש אישור רופא","pb":"{{שם}} · ממתין לאישור רופא ולאישורך","link":"ניהול מכון","app":"","badge":0}},"why":"בפוש — בלי שאלות הבריאות."},
  {"id":"gym-approve","ev":"בקשה אושרה ידנית","w":"מיידי","vars":["שם","סכום","מסלול"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_APPROVED_AWAITING_PAYMENT","pt":"ההרשמה למכון אושרה","pb":"נשאר לשלם {{סכום}} ₪ כדי להפעיל את המנוי.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-decl","ev":"מנהל ביקש הצהרת בריאות","w":"מיידי","vars":["שם"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_DECLARATION_REQUEST","pt":"נשאר למלא הצהרת בריאות","pb":"דקה אחת במסך מכון כושר באפליקציה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-pay","ev":"תושב דיווח על תשלום","w":"מיידי","vars":["שם","סכום","מזהה","אמצעי","אסמכתא"],"cells":{"r":{"m":1,"p":0,"d":0,"k":"GYM_PAYMENT_REPORTED","pt":"קיבלנו את דיווח התשלום","pb":"{{סכום}} ₪ · נעדכן כשהמנוי יופעל.","link":"מכון כושר","app":"","badge":0},"a":{"m":0,"p":1,"d":0,"k":"ADMIN_GYM_PAYMENT_REPORTED","pt":"דיווח תשלום למכון","pb":"{{שם}} · {{סכום}} ₪ · ממתין לאימות","link":"ניהול מכון","app":"","badge":0},"s":{"m":0,"p":0,"d":0,"k":"ADMIN_GYM_PAYMENT_REPORTED","pt":"דיווח תשלום למכון","pb":"{{שם}} · {{סכום}} ₪ · ממתין לאימות","link":"ניהול מכון","app":"","badge":0}}},
  {"id":"gym-active","ev":"התשלום אומת — מנוי פעיל","w":"מיידי","vars":["שם","תוקף"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_ACTIVE","pt":"המנוי במכון פעיל","pb":"בתוקף עד {{תוקף}}. קוד הכניסה מחכה באפליקציה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-notfound","ev":"התשלום לא נמצא","w":"מיידי","vars":["שם","הערה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_PAYMENT_NOT_FOUND","pt":"לא מצאנו את התשלום למכון","pb":"אפשר לבדוק ולדווח שוב באפליקציה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-extend","ev":"מנוי הוארך","w":"מיידי","vars":["שם","תוקף"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GYM_EXTENDED","pt":"המנוי במכון הוארך","pb":"בתוקף עד {{תוקף}}.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-cancel","ev":"מנוי בוטל","w":"מיידי","vars":["שם","הערה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_CANCELLED","pt":"המנוי במכון בוטל","pb":"הפרטים נשלחו אליך במייל.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-reject","ev":"בקשה נדחתה","w":"מיידי","vars":["שם","הערה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_REJECTED","pt":"הבקשה למכון לא אושרה","pb":"הפרטים נשלחו אליך במייל.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-expiring","ev":"המנוי מסתיים בעוד X ימים","w":"בדיקה יומית","vars":["שם","תוקף","ימים"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_EXPIRY_REMINDER","pt":"המנוי במכון מסתיים בעוד {{ימים}} ימים","pb":"אפשר לחדש כבר עכשיו באפליקציה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-expired","ev":"המנוי פג","w":"בדיקה יומית","vars":["שם","תוקף"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"GYM_EXPIRED","pt":"המנוי במכון הסתיים","pb":"קוד הכניסה כבר לא פעיל. אפשר לחדש באפליקציה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-nudge","ev":"עוד לא שולם","w":"בדיקה יומית","vars":["שם","סכום"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GYM_PAYMENT_NUDGE","pt":"נשאר לשלם על המכון","pb":"{{סכום}} ₪ · פרטי התשלום באפליקציה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-declexp","ev":"הצהרת בריאות עומדת לפוג","w":"בדיקה יומית","vars":["שם","תוקף"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"GYM_DECLARATION_EXPIRING","pt":"הצהרת הבריאות עומדת לפוג","pb":"תקפה עד {{תוקף}}. בחידוש הבא יידרש למלא חדשה.","link":"מכון כושר","app":"","badge":0}}},
  {"id":"gym-stale","ev":"בקשת מכון ממתינה X ימים","w":"בדיקה יומית","vars":["שם","ימים","סטטוס"],"cells":{"a":{"m":1,"p":1,"d":0,"k":"ADMIN_STALE_GYM","pt":"בקשת מכון ממתינה {{ימים}} ימים","pb":"{{שם}} · {{סטטוס}}","link":"ניהול מכון","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_STALE_GYM","pt":"בקשת מכון ממתינה {{ימים}} ימים","pb":"{{שם}} · {{סטטוס}}","link":"ניהול מכון","app":"","badge":0}}}
 ]},
 {"id":"evt","name":"אירועים ושירותים","perm":"על","cols":{"r":"התושב","all":"כל התושבים","s":"מנהל-על"},"rows":[
  {"id":"svc-update","ev":"עדכון תושבים על שירות","w":"ידני","vars":["שם השירות","ספק","מה השתנה"],"cells":{"all":{"m":0,"p":1,"d":0,"k":"SERVICE_UPDATED","pt":"עדכון: {{שם השירות}}","pb":"{{מה השתנה}}","link":"לוח אירועים","app":"","badge":0}},"why":"פוש לכולם במקום מייל — מייל לכולם שורף את מכסת המיילים היומית."},
  {"id":"rsvp-open","ev":"נפתח אישור הגעה לאירוע","w":"מיידי","vars":["שם האירוע","תאריך"],"cells":{"all":{"m":0,"p":1,"d":0,"k":"EVENT_RSVP_OPEN","pt":"","pb":"","link":"לוח אירועים","app":"","badge":0}},"why":"יוצא כשמנהל פותח אישור הגעה לאירוע."},
  {"id":"rsvp-remind","ev":"תזכורת יום לפני — למי שאישר","w":"בדיקה יומית","vars":["שם האירוע","תאריך","מיקום"],"cells":{"r":{"m":0,"p":1,"d":0,"k":"EVENT_REMINDER","pt":"","pb":"","link":"לוח אירועים","app":"","badge":0}},"why":"יוצא יום לפני האירוע, רק למי שאישר הגעה."},
  {"id":"evt-week","ev":"השבוע בשיכון — אירועי השבוע","w":"מוצאי שבת 21:00","vars":["שבוע","מספר","רשימה","רשימה קצרה"],"cells":{"all":{"m":0,"p":1,"d":0,"k":"EVENTS_WEEKLY","pt":"השבוע בשיכון · {{שבוע}}","pb":"{{רשימה קצרה}}","link":"לוח אירועים","app":"","badge":0}},"why":"יוצא במוצאי שבת (מ-21:00) עם האירועים של השבוע שמתחיל. שבוע בלי אירועים — לא יוצא כלום."},
  {"id":"svc-recommend","ev":"תושב הוסיף המלצה","w":"מיידי","vars":["שם","שירות"],"cells":{"s":{"m":0,"p":0,"d":0,"k":"","pt":"","pb":"","link":"שירותים","app":"","badge":0}},"why":"יוצא כשתושב מוסיף המלצה על שירות."}
 ]},
 {"id":"oth","name":"כללי","perm":"*","cols":{"r":"מי שפנה","s":"מנהל-על","a":"כל מנהל"},"rows":[
  {"id":"app-report","ev":"דיווח על תקלה באפליקציה","w":"מיידי","vars":["שם","סוג","מסך","מזהה","תוכן"],"cells":{"s":{"m":0,"p":1,"d":0,"k":"ADMIN_NEW_APP_REPORT","pt":"דיווח חדש על האפליקציה","pb":"{{שם}} · {{סוג}} · מסך {{מסך}}","link":"דיווחים על האפליקציה","app":"","badge":0}}},
  {"id":"app-reply","ev":"תשובה לדיווח על האפליקציה","w":"ידני","vars":["שם","מזהה","תגובה"],"cells":{"r":{"m":1,"p":1,"d":0,"k":"APP_REPORT_REPLY","pt":"תשובה לדיווח שלך","pb":"{{תגובה}}","link":"דף הבית","app":"","badge":0}}},
  {"id":"digest","ev":"סיכום שבועי — מה ממתין לטיפול","w":"ראשון","vars":[],"cells":{"a":{"m":1,"p":0,"d":0,"k":"ADMIN_WEEKLY_DIGEST","pt":"הסיכום השבועי","pb":"מה ממתין לטיפול שלך השבוע — במייל.","link":"דף הבית","app":"","badge":0},"s":{"m":1,"p":0,"d":0,"k":"ADMIN_WEEKLY_DIGEST","pt":"הסיכום השבועי","pb":"מה ממתין לטיפול שלך השבוע — במייל.","link":"דיווחים על האפליקציה","app":"","badge":0}},"why":"כל מנהל מקבל רק את התחומים שלו."}
 ]}
];

var NOTIFY_GLOBALS = [
 {"id":"masterMail","t":"כל המיילים","s":"מתג ראשי — מכבה את כל שליחת המיילים (לחגים ולבדיקות).","o":[["on","פעיל"],["off","כבוי"]],"def":"on"},
 {"id":"masterPush","t":"כל הפושים","s":"מתג ראשי לפושים.","o":[["on","פעיל"],["off","כבוי"]],"def":"on"},
 {"id":"superAll","t":"מנהל-על","s":"מה מקבל מנהל-על בתחומים שיש להם מנהל משלהם.","o":[["table","לפי הטבלה"],["fallback","רק כשאין מנהל לתחום"],["all","כל מה שמנהלי התחומים מקבלים"]],"def":"table"},
 {"id":"noPush","t":"תושב שלא הדליק התראות","s":"מה קורה כשמגיע לו פוש ואין לו התראות פעילות באף מכשיר.","o":[["mail","מקבל מייל במקום"],["app","רק סימון \"עדכון חדש\" באפליקציה"]],"def":"mail"},
 {"id":"badge","t":"סימון \"עדכון חדש\"","s":"נקודה על הכרטיס בעמוד הבית עד שפותחים את הבקשה.","o":[["on","להציג"],["off","לא"]],"def":"on"},
 {"id":"quiet","t":"שעות שקט לפוש","s":"פוש שנוצר בשעות השקט נשלח כשהן נגמרות. שבת = שישי 16:00 עד מוצאי שבת 20:00. מיילים לא מושפעים.","o":[["none","אין"],["night","22:00–07:00"],["nightShabbat","לילה + שבת"]],"def":"night"},
 {"id":"optOut","t":"תושב מכבה התראות לעצמו","s":"מה תושב יוכל לכבות לעצמו (כרגע: כפתור ההתראות בתפריט המשתמש מכבה פוש).","o":[["no","לא"],["push","רק פוש"],["all","פוש ומייל"]],"def":"push"},
 {"id":"external","t":"משתמש חיצוני (גנן)","s":"לעולם לא מקבל התראות מנהל עם פרטי תושבים.","o":[["strict","רק ההתראות שלו"],["asAdmin","כמו מנהל התחום"]],"def":"strict"}
];

/* נוסחי המייל ממרכז ההתראות (23.9). משמשים (1) לזריעת תבניות חסרות,
   (2) להחלפה החד-פעמית של הנוסחים בטאב — ר' notifyApplyNewTextsOnce_. */
var NOTIFY_MAIL_TEXTS = {
 SIGNUP_RECEIVED: {"su":"קיבלנו את בקשת ההרשמה שלך","bo":"שלום {{שם}},\n\nקיבלנו את בקשת ההרשמה שלך לאפליקציית הקהילה.\n\nמה עכשיו: הוועד יבדוק את הבקשה. ברגע שהיא תאושר יגיע אליך מייל עם כפתור כניסה.\n\nבברכה,\nועד הקהילה"},
 SIGNUP_APPROVED: {"su":"ההרשמה אושרה — ברוכים הבאים","bo":"שלום {{שם}},\n\nההרשמה שלך אושרה, ואפשר להיכנס לאפליקציית הקהילה.\n\nאיך נכנסים: לוחצים על הכפתור למטה ומתחברים עם חשבון הגוגל שאיתו נרשמת.\n\nטיפ: כדאי להוסיף את האפליקציה למסך הבית של הטלפון ולהדליק התראות — כך עדכונים על הבקשות שלך יגיעו ישר לטלפון.\n\nבברכה,\nועד הקהילה"},
 SIGNUP_REJECTED: {"su":"בקשת ההרשמה שלך לא אושרה","bo":"שלום {{שם}},\n\nלצערנו בקשת ההרשמה שלך לאפליקציית הקהילה לא אושרה.\n\nאם נראה לך שזו טעות, או שיש שאלות — אפשר לפנות לוועד ונשמח לבדוק.\n\nבברכה,\nועד הקהילה"},
 WELCOME_MANUAL: {"su":"נפתחה לך גישה לאפליקציית הקהילה","bo":"שלום,\n\nהוועד פתח לך גישה לאפליקציית הקהילה — תקציב, מועדון, מכון, גינון, שירותים ועוד, במקום אחד.\n\nאיך נכנסים: לוחצים על הכפתור למטה ומתחברים עם חשבון הגוגל של הכתובת הזו.\n\nטיפ: כדאי להוסיף את האפליקציה למסך הבית ולהדליק התראות.\n\nבברכה,\nועד הקהילה"},
 PROFILE_CHANGE_RECEIVED: {"su":"קיבלנו את בקשת שינוי הפרטים שלך","bo":"שלום {{שם}},\n\nקיבלנו את הבקשה שלך לשנות את {{שדה}} ל-{{ערך}}.\n\nמה עכשיו: הבקשה ממתינה לאישור הוועד, ונעדכן אותך ברגע שתטופל. עד אז אפשר להמשיך להיכנס כרגיל.\n\nבברכה,\nועד הקהילה"},
 PROFILE_CHANGE_OTHER_SLOT_NOTICE: {"su":"התראה: בקשה לשנות את כתובת הכניסה שלך","bo":"שלום,\n\n{{שם המבקש}} הגיש בקשה לשנות את כתובת הכניסה שלך לאפליקציה ל-{{ערך מבוקש}}.\n\nהבקשה עוד לא בוצעה — היא ממתינה לאישור הוועד.\n\nאם זה לא נראה לך נכון, פנו לוועד בהקדם, לפני האישור.\n\nבברכה,\nועד הקהילה"},
 PROFILE_CHANGE_NEW: {"su":"בקשת שינוי פרטים: {{שם}}","bo":"שלום,\n\n{{שם}} הגיש בקשה לשנות את {{שדה}}.\n\nמ: {{ערך נוכחי}}\nל: {{ערך מבוקש}}\n\nמה לעשות: לאשר או לדחות במסך \"תושבים\".\n\nאפליקציית הוועד"},
 PROFILE_CHANGE_APPROVED: {"su":"השינוי בפרטים שלך אושר","bo":"שלום {{שם}},\n\nהבקשה שלך אושרה, ו{{שדה}} עודכן ל-{{ערך}}.\n\nאם שינית את כתובת המייל — מעכשיו נכנסים לאפליקציה עם הכתובת החדשה.\n\nבברכה,\nועד הקהילה"},
 PROFILE_CHANGE_REJECTED: {"su":"בקשת השינוי שלך לא אושרה","bo":"שלום {{שם}},\n\nהבקשה שלך לשנות את {{שדה}} לא אושרה.\n\nהסיבה: {{סיבה}}\n\nלשאלות אפשר לפנות לוועד.\n\nבברכה,\nועד הקהילה"},
 ADMIN_NEW_SIGNUP: {"su":"בקשת הרשמה חדשה: {{שם}}","bo":"שלום,\n\n{{שם}} ({{אימייל}}) הגיש בקשה להצטרף לאפליקציית הקהילה.\n\nמה לעשות: לאשר או לדחות במסך \"תושבים\".\n\nאפליקציית הוועד"},
 ADMIN_STALE_SIGNUP: {"su":"בקשת הרשמה ממתינה {{ימים}} ימים: {{שם}}","bo":"שלום,\n\nבקשת ההרשמה של {{שם}} ({{אימייל}}) ממתינה כבר {{ימים}} ימים.\n\nמה לעשות: לאשר או לדחות במסך \"תושבים\".\n\nאפליקציית הוועד"},
 REIMBURSEMENT_RECEIVED: {"su":"קיבלנו את בקשת ההחזר שלך — {{סכום}} ₪","bo":"שלום {{שם}},\n\nקיבלנו את בקשת ההחזר שלך על סך {{סכום}} ₪.\n\nמה הלאה: הוועד בודק את הבקשה, ואחרי האישור היא עוברת להנהלת חשבונות לתשלום. נעדכן אותך בכל שלב.\n\nמספר הבקשה: {{מזהה}}\n\nבברכה,\nועד הקהילה"},
 REIMBURSEMENT_READY: {"su":"בקשת ההחזר אושרה — {{סכום}} ₪","bo":"שלום {{שם}},\n\nבקשת ההחזר שלך על סך {{סכום}} ₪ אושרה והועברה להנהלת חשבונות לתשלום.\n\nאין צורך לעשות דבר — נעדכן כשהתשלום יבוצע.\n\nמספר הבקשה: {{מזהה}}\n\nבברכה,\nועד הקהילה"},
 REIMBURSEMENT_PAID: {"su":"ההחזר שולם — {{סכום}} ₪","bo":"שלום {{שם}},\n\nבקשת ההחזר שלך על סך {{סכום}} ₪ שולמה.\n\nתודה על ההשקעה בקהילה!\n\nמספר הבקשה: {{מזהה}}\n\nבברכה,\nועד הקהילה"},
 REIMBURSEMENT_REJECTED: {"su":"בקשת ההחזר שלך לא אושרה","bo":"שלום {{שם}},\n\nלצערנו בקשת ההחזר שלך על סך {{סכום}} ₪ לא אושרה.{{הערה}}\n\nאם יש שאלות, או שאפשר להשלים משהו — אפשר לפנות לוועד.\n\nמספר הבקשה: {{מזהה}}\n\nבברכה,\nועד הקהילה"},
 ADMIN_NEW_REIMBURSEMENT: {"su":"בקשת החזר חדשה: {{שם}}, {{סכום}} ₪","bo":"שלום,\n\n{{שם}} הגיש בקשת החזר על סך {{סכום}} ₪ (מס' {{מזהה}}).\n\nמה לעשות: לבדוק את הקבלה ולאשר או לדחות במסך ההוצאות.\n\nאפליקציית הוועד"},
 ADMIN_STALE_REIMBURSEMENT: {"su":"בקשת החזר ממתינה {{ימים}} ימים: {{שם}}","bo":"שלום,\n\nבקשת ההחזר של {{שם}} על סך {{סכום}} ₪ (מס' {{מזהה}}) ממתינה כבר {{ימים}} ימים.\n\nמה לעשות: לבדוק ולאשר או לדחות במסך ההוצאות.\n\nאפליקציית הוועד"},
 ADMIN_MONTHLY_DIGEST: {"su":"בקשות החזר פתוחות — החלון נסגר ב-19 לחודש","bo":"שלום,\n\nב-19 לחודש נסגר חלון ההחזרים. אלה הבקשות שעדיין פתוחות:"},
 ADMIN_YEAR_ROLLOVER: {"su":"שנת תקציב חדשה — צריך להחליף שנה באפליקציה","bo":"שלום,\n\nספטמבר התחיל, ושנת התקציב מתחלפת.\n\nהשנה באפליקציה עכשיו: {{שנה נוכחית}}\nהשנה הבאה: {{שנה הבאה}}\n\nחשוב: עד שמחליפים, כל הוצאה חדשה נרשמת לשנה הישנה.\n\nמה לעשות: לבחור את השנה החדשה בבורר \"שנת תקציב\" בראש האפליקציה.\n\nאפליקציית הוועד"},
 CLUB_RECEIVED: {"su":"קיבלנו את בקשת השריון שלך — {{תאריך}}","bo":"שלום {{שם}},\n\nקיבלנו את בקשת השריון שלך במועדון: {{תאריך}}, בשעות {{שעה}}.\n\nמה עכשיו: הבקשה ממתינה לאישור הוועד. נעדכן אותך ברגע שתאושר.\n\nבברכה,\nועד הקהילה"},
 CLUB_APPROVED: {"su":"השריון במועדון אושר — {{תאריך}}","bo":"שלום {{שם}},\n\nהשריון שלך במועדון אושר: {{תאריך}}, בשעות {{שעה}}.\n\nלפני המועד:\n• להסדיר את דמי השימוש מול הוועד\n• לעבור על חוקי המועדון (במסך המועדון באפליקציה)\n\nנשלח לך תזכורת לפני המועד.\n\nבברכה,\nועד הקהילה"},
 CLUB_REJECTED: {"su":"השריון במועדון לא אושר — {{תאריך}}","bo":"שלום {{שם}},\n\nלצערנו השריון שלך במועדון ב-{{תאריך}}, בשעות {{שעה}}, לא אושר.\n\nאפשר לבחור מועד אחר במסך המועדון באפליקציה, או לפנות לוועד אם יש שאלות.\n\nבברכה,\nועד הקהילה"},
 CLUB_REMINDER: {"su":"תזכורת: השריון שלך במועדון ב-{{תאריך}}","bo":"שלום {{שם}},\n\nתזכורת — השריון שלך במועדון מתקרב: {{תאריך}}, בשעות {{שעה}}.\n\nלפני המועד:\n• לוודא שדמי השימוש שולמו\n• לעבור על חוקי המועדון\n\nבילוי נעים,\nועד הקהילה"},
 ADMIN_NEW_CLUB: {"su":"בקשת שריון מועדון: {{שם}}, {{תאריך}}","bo":"שלום,\n\n{{שם}} ביקש לשריין את המועדון: {{תאריך}}, בשעות {{שעה}}.\n\nמה לעשות: לאשר או לדחות במסך ניהול המועדון.\n\nאפליקציית הוועד"},
 ADMIN_STALE_CLUB: {"su":"בקשת שריון ממתינה {{ימים}} ימים: {{שם}}","bo":"שלום,\n\nבקשת השריון של {{שם}} ל-{{תאריך}} ממתינה כבר {{ימים}} ימים.\n\nמה לעשות: לאשר או לדחות במסך ניהול המועדון — לפני שהמועד מתקרב.\n\nאפליקציית הוועד"},
 GYM_APPLICATION_RECEIVED: {"su":"קיבלנו את ההרשמה שלך למכון הכושר","bo":"שלום {{שם}},\n\nקיבלנו את ההרשמה שלך למכון הכושר.\n\nמה עכשיו: נעדכן אותך בכל שלב. אפשר לעקוב גם במסך \"מכון כושר\" באפליקציה.\n\nבברכה,\nועד הקהילה"},
 GYM_DOCTOR_NOTE_REQUIRED: {"su":"נדרש אישור רופא להשלמת ההרשמה למכון","bo":"שלום {{שם}},\n\nבהצהרת הבריאות סימנת \"כן\" באחת השאלות ({{שאלות}}). לפי תקנון המכון, במקרה כזה צריך אישור רופא שאין מניעה להתאמן.\n\nמה לעשות:\n• להביא אישור רופא שהונפק ב-3 החודשים האחרונים\n• להעביר אותו לאחראית חדר הכושר בשיכון\n\nבברכה,\nועד הקהילה"},
 GYM_APPROVED_AWAITING_PAYMENT: {"su":"ההרשמה למכון אושרה — נשאר לשלם","bo":"שלום {{שם}},\n\nההרשמה שלך למכון הכושר אושרה.\n\nמה לעשות: לשלם {{סכום}} ₪ עבור {{מסלול}}, ולדווח על התשלום במסך \"מכון כושר\" באפליקציה. אחרי האימות המנוי יופעל.\n\nבברכה,\nועד הקהילה"},
 GYM_DECLARATION_REQUEST: {"su":"נשאר למלא הצהרת בריאות למכון","bo":"שלום {{שם}},\n\nנפתח לך מנוי במכון הכושר. נשאר רק למלא הצהרת בריאות ולחתום — זה לוקח דקה.\n\nאיך: נכנסים לאפליקציה ← \"מתקנים\" ← \"מכון כושר\".\n\nבברכה,\nועד הקהילה"},
 GYM_PAYMENT_REPORTED: {"su":"קיבלנו את דיווח התשלום שלך למכון","bo":"שלום {{שם}},\n\nקיבלנו את הדיווח על תשלום {{סכום}} ₪ עבור המכון.\n\nמה עכשיו: הוועד יאמת את התשלום, ונעדכן אותך ברגע שהמנוי יופעל.\n\nבברכה,\nועד הקהילה"},
 GYM_ACTIVE: {"su":"המנוי שלך במכון הכושר פעיל","bo":"שלום {{שם}},\n\nהתשלום אומת — המנוי שלך במכון הכושר פעיל, בתוקף עד {{תוקף}}.\n\nקוד הכניסה נמצא במסך \"מכון כושר\" באפליקציה. לפי התקנון, אין להעביר אותו לאחרים.\n\nאימונים נעימים,\nועד הקהילה"},
 GYM_PAYMENT_NOT_FOUND: {"su":"לא מצאנו את התשלום שדיווחת למכון","bo":"שלום {{שם}},\n\nבדקנו ולא מצאנו את התשלום שדיווחת עליו.{{הערה}}\n\nמה לעשות: לבדוק שוב ולדווח מחדש במסך \"מכון כושר\", או לפנות לאחראית חדר הכושר.\n\nבברכה,\nועד הקהילה"},
 GYM_EXTENDED: {"su":"המנוי שלך במכון הוארך עד {{תוקף}}","bo":"שלום {{שם}},\n\nהמנוי שלך במכון הכושר הוארך, ועכשיו הוא בתוקף עד {{תוקף}}.\n\nאין צורך לעשות דבר.\n\nבברכה,\nועד הקהילה"},
 GYM_CANCELLED: {"su":"המנוי שלך במכון הכושר בוטל","bo":"שלום {{שם}},\n\nהמנוי שלך במכון הכושר בוטל, וקוד הכניסה כבר לא פעיל.{{הערה}}\n\nלשאלות אפשר לפנות לאחראית חדר הכושר.\n\nבברכה,\nועד הקהילה"},
 GYM_REJECTED: {"su":"הבקשה שלך למכון הכושר לא אושרה","bo":"שלום {{שם}},\n\nלצערנו הבקשה שלך למכון הכושר לא אושרה.{{הערה}}\n\nלשאלות אפשר לפנות לאחראית חדר הכושר.\n\nבברכה,\nועד הקהילה"},
 GYM_EXPIRY_REMINDER: {"su":"המנוי שלך במכון מסתיים ב-{{תוקף}}","bo":"שלום {{שם}},\n\nהמנוי שלך במכון הכושר בתוקף עד {{תוקף}} — עוד {{ימים}} ימים.\n\nכדי להמשיך להתאמן ברצף, אפשר לחדש כבר עכשיו במסך \"מכון כושר\". אם הצהרת הבריאות שלך בתוקף, זה שתי לחיצות.\n\nבברכה,\nועד הקהילה"},
 GYM_EXPIRED: {"su":"המנוי שלך במכון הכושר הסתיים","bo":"שלום {{שם}},\n\nהמנוי שלך במכון הכושר הסתיים ב-{{תוקף}}, וקוד הכניסה כבר לא פעיל.\n\nאפשר לחדש בכל רגע במסך \"מכון כושר\" באפליקציה.\n\nבברכה,\nועד הקהילה"},
 GYM_PAYMENT_NUDGE: {"su":"תזכורת: נשאר לשלם על המכון","bo":"שלום {{שם}},\n\nההרשמה שלך למכון אושרה, ועוד לא קיבלנו תשלום. הסכום: {{סכום}} ₪.\n\nמה לעשות: לשלם ולדווח במסך \"מכון כושר\" באפליקציה.\n\nבברכה,\nועד הקהילה"},
 GYM_DECLARATION_EXPIRING: {"su":"הצהרת הבריאות שלך למכון תקפה עד {{תוקף}}","bo":"שלום {{שם}},\n\nהצהרת הבריאות שלך למכון תקפה עד {{תוקף}}. אחרי התאריך הזה, כדי לחדש מנוי צריך למלא הצהרה חדשה — כמה דקות במסך \"מכון כושר\".\n\nבברכה,\nועד הקהילה"},
 ADMIN_NEW_GYM_FLAGGED: {"su":"הרשמה למכון עם דגל בריאות: {{שם}}","bo":"שלום,\n\n{{שם}} ({{אימייל}}) נרשם למכון, וסימן \"כן\" בשאלות: {{שאלות}}.\n\nמה לעשות: לחכות לאישור רופא, ואז לאשר במסך ניהול המכון.\n\nאפליקציית הוועד"},
 ADMIN_GYM_PAYMENT_REPORTED: {"su":"דיווח תשלום למכון: {{שם}}, {{סכום}} ₪","bo":"שלום,\n\n{{שם}} דיווח על תשלום {{סכום}} ₪ עבור המכון (מס' {{מזהה}}).\n\nאמצעי: {{אמצעי}}\nאסמכתא: {{אסמכתא}}\n\nמה לעשות: לאמת את התשלום במסך ניהול המכון.\n\nאפליקציית הוועד"},
 ADMIN_STALE_GYM: {"su":"בקשת מכון ממתינה {{ימים}} ימים: {{שם}}","bo":"שלום,\n\nהבקשה של {{שם}} במכון ממתינה כבר {{ימים}} ימים (שלב: {{סטטוס}}).\n\nמה לעשות: לבדוק במסך ניהול המכון.\n\nאפליקציית הוועד"},
 GARDEN_REPORT_RECEIVED: {"su":"קיבלנו את הדיווח שלך: {{כותרת}}","bo":"שלום {{שם}},\n\nקיבלנו את הדיווח שלך על {{קטגוריה}} ב{{מיקום}}: {{כותרת}}.\n\nמה הלאה: צוות הגינון יבדוק וישבץ אותו לשבוע עבודה. אפשר לעקוב בכל רגע במסך הגינון באפליקציה.\n\nטיפ: אם תדליק התראות באפליקציה, העדכונים הבאים יגיעו ישר לטלפון.\n\nמספר הדיווח: {{מזהה}}\n\nבברכה,\nועד הקהילה"},
 GARDEN_REPORT_MERGED: {"su":"הדיווח שלך צורף לפנייה שכבר בטיפול","bo":"שלום {{שם}},\n\nעל {{קטגוריה}} ב{{מיקום}} כבר נפתחה פנייה (מס' {{מזהה אב}}), ולכן צירפנו אליה את הדיווח שלך — כדי שהטיפול יהיה במקום אחד.\n\nנעדכן אותך כשהטיפול יסתיים. אם יתברר שמדובר בשני דברים שונים, אפשר לומר לנו במשוב שיגיע עם עדכון הסיום.\n\nבברכה,\nועד הקהילה"},
 GARDEN_PLANNED: {"su":"הדיווח שלך שובץ לשבוע {{שבוע}}","bo":"שלום {{שם}},\n\nהדיווח שלך על {{קטגוריה}} ב{{מיקום}} נבדק ושובץ לשבוע העבודה של {{שבוע}}.\n\nנעדכן אותך כשהטיפול יסתיים.\n\nבברכה,\nועד הקהילה"},
 GARDEN_RESCHEDULED: {"su":"מועד הטיפול בדיווח שלך עבר לשבוע {{שבוע}}","bo":"שלום {{שם}},\n\nמועד הטיפול בדיווח שלך על {{קטגוריה}} ב{{מיקום}} עבר לשבוע של {{שבוע}}.\n\n{{מה נעשה}}אפשר לעקוב אחרי הדיווח באפליקציה בכל רגע.\n\nבברכה,\nועד הקהילה"},
 GARDEN_STATUS_NOTE: {"su":"עדכון מצוות הגינון על הדיווח שלך","bo":"שלום {{שם}},\n\nצוות הגינון כתב עדכון על הדיווח שלך על {{קטגוריה}} ב{{מיקום}}:\n\n{{עדכון}}\n\nאת כל מה שקרה עם הדיווח אפשר לראות באפליקציה.\n\nבברכה,\nועד הקהילה"},
 GARDEN_COMPLETED: {"su":"הטיפול בדיווח שלך הושלם","bo":"שלום {{שם}},\n\nהטיפול בדיווח שלך על {{קטגוריה}} ב{{מיקום}} הושלם.\n\n{{מה נעשה}}{{איחוד}}אם משהו לא נראה לך תקין — אפשר לספר לנו באפליקציה בתוך שבוע.\n\nתודה שדיווחת,\nועד הקהילה"},
 GARDEN_REPORT_DECLINED: {"su":"הדיווח שלך על {{קטגוריה}} נסגר","bo":"שלום {{שם}},\n\nבדקנו את הדיווח שלך על {{קטגוריה}} ב{{מיקום}}, ולא ייפתח עליו טיפול.\n\n{{סיבה}}\n\nאם נראה לך שזו טעות — אפשר לפנות אלינו ונבדוק שוב.\n\nמספר הדיווח: {{מזהה}}\n\nבברכה,\nועד הקהילה"},
 GARDEN_REOPENED: {"su":"הדיווח שלך נפתח מחדש","bo":"שלום {{שם}},\n\nהדיווח שלך על {{קטגוריה}} ב{{מיקום}} נפתח מחדש וחזר לטיפול צוות הגינון.\n\n{{סיבה}}נעדכן אותך כשהטיפול יסתיים.\n\nבברכה,\nועד הקהילה"},
 ADMIN_NEW_GARDEN_REPORT: {"su":"דיווח גינון חדש: {{כותרת}}","bo":"שלום,\n\nדיווח גינון חדש מ-{{שם}}: {{כותרת}}\n{{קטגוריה}}, {{מיקום}} (מס' {{מזהה}})\n\nמה לעשות: לשבץ לשבוע עבודה בתוכנית הגינון.\n\nאפליקציית הוועד"},
 ADMIN_GARDEN_NEGATIVE_FEEDBACK: {"su":"משוב שלילי: {{קטגוריה}} ב{{מיקום}}","bo":"שלום,\n\n{{שם}} סימן שהטיפול בדיווח מס' {{מזהה}} ({{קטגוריה}}, {{מיקום}}) לא הושלם כמו שצריך.\n\nמה כתב: {{הערה}}\n\nהמשימה סומנה \"דורש בדיקה חוזרת\".\n\nמה לעשות: להחליט אם לפתוח מחדש — במסך המשימות.\n\nאפליקציית הוועד"},
 ADMIN_GARDEN_TASK_BLOCKED: {"su":"הצוות לא יכול לבצע: {{כותרת}}","bo":"שלום,\n\nצוות הגינון סימן שאי אפשר לבצע את משימה מס' {{מזהה}} — {{כותרת}}.\n\nהסיבה: {{סיבה}}\n\nהמשימה נשארה פתוחה ומסומנת \"דורש בדיקה בשטח\".\n\nמה לעשות: לסגור, להעביר לבינוי או לשבץ מחדש — ההחלטה שלך.\n\nאפליקציית הוועד"},
 ADMIN_GARDEN_PHOTOS_MISSING: {"su":"דיווחי גינון שחסרות בהם תמונות","bo":"שלום,\n\nבדיווחים האלה התושב צירף תמונות שלא עלו במלואן: {{רשימה}}.\n\nהמספר בסוגריים: כמה תמונות עלו מתוך כמה נשלחו.\n\nמה לעשות: אם התמונה חשובה לטיפול — לבקש אותה מהתושב.\n\nאפליקציית הוועד"},
 ADMIN_GARDEN_WEEKLY: {"su":"סיכום שבועי — גינון, שבוע {{שבוע}}","bo":"שלום,\n\nזה סיכום שבוע העבודה של הגינון (שבוע {{שבוע}}):\n\n• בוצעו: {{בוצעו}}\n• נפתחו: {{נפתחו}}\n• נגררות לשבוע הבא: {{נגררות}}\n\nהפירוט במסך נתוני הגינון.\n\nאפליקציית הוועד"},
 GARDENER_WEEKLY_PLAN: {"su":"העבודה שלך לשבוע {{שבוע}}","bo":"שלום,\n\nאלה המשימות לשבוע {{שבוע}} ({{מספר}} משימות):\n\n{{רשימה}}\n\nאת הפרטים, המיקום במפה והתמונות אפשר לראות במסך המשימות באפליקציה.\n\nעבודה נעימה,\nועד הקהילה"},
 SERVICE_UPDATED: {"su":"עדכון בשירות {{שם השירות}}","bo":"שלום,\n\nיש עדכון בשירות {{שם השירות}} ({{ספק}}):\n\n{{מה השתנה}}\n\nאת כל הפרטים — תנאים, מחירון ואנשי קשר — אפשר לראות במסך \"שירותים\" באפליקציה.\n\nבברכה,\nועד הקהילה"},
 ADMIN_NEW_APP_REPORT: {"su":"דיווח על האפליקציה: {{סוג}} ממסך {{מסך}}","bo":"{{שם}} שלח {{סוג}} (מס' {{מזהה}}), ממסך {{מסך}}:\n\n{{תוכן}}\n\n— הקשר טכני —\n{{אבחון}}\n{{שגיאות}}"},
 APP_REPORT_REPLY: {"su":"תשובה לדיווח שלך על האפליקציה","bo":"שלום {{שם}},\n\nלגבי מה ששלחת לנו על האפליקציה (מס' {{מזהה}}):\n\n{{תגובה}}\n\nתודה שדיווחת — זה בדיוק מה שעוזר לנו לשפר.\n\nבברכה,\nועד הקהילה"},
 ADMIN_WEEKLY_DIGEST: {"su":"סיכום שבועי — מה ממתין לך באפליקציית הוועד","bo":"שלום,\n\nזה מה שממתין לטיפול שלך השבוע:"},
 GARDENER_TASK_ADDED: {"su":"משימה חדשה נוספה לשבוע הזה","bo":"שלום,\n\nנוספה משימה לשבוע הנוכחי: {{כותרת}} ({{קטגוריה}}, {{מיקום}}).\n\nהפרטים, המיקום במפה והתמונות — במסך המשימות באפליקציה.\n\nועד הקהילה"},
 GARDEN_FINAL_CHECK: {"su":"הטיפול בדיווח שלך בבדיקה אחרונה","bo":"שלום {{שם}},\n\nצוות הגינון סיים לטפל בדיווח שלך על {{קטגוריה}} ב{{מיקום}}, ומנהל הגינון בודק את העבודה.\n\nנעדכן אותך כשהטיפול יאושר.\n\nבברכה,\nועד הקהילה"},
 ADMIN_GARDEN_AWAITING_APPROVAL: {"su":"ממתין לאישורך: {{כותרת}}","bo":"שלום,\n\nהגנן סימן \"בוצע\" על משימה מס' {{מזהה}} — {{כותרת}} ({{מיקום}}).\n\nמה נעשה: {{עדכון}}\n\nמה לעשות: לאשר או להחזיר להשלמה במסך המשימות.\n\nאפליקציית הוועד"},
 GARDENER_TASK_RETURNED: {"su":"הוחזר אליך להשלמה: {{כותרת}}","bo":"שלום,\n\nמנהל הגינון החזיר אליך את המשימה {{כותרת}} ({{מיקום}}).\n\nמה חסר: {{הערה}}\n\nאפשר לראות את המשימה במסך המשימות באפליקציה.\n\nועד הקהילה"},
 GARDEN_PENDING_REVIEW: {"su":"הדיווח שלך ממתין לבדיקה","bo":"שלום {{שם}},\n\nהדיווח שלך על {{קטגוריה}} ב{{מיקום}} דורש בדיקה נוספת לפני שאפשר לטפל בו.\n\nנעדכן אותך כשתתקבל החלטה.\n\nבברכה,\nועד הקהילה"},
 GARDEN_RECHECK_DONE: {"su":"בדקנו שוב את הדיווח שלך","bo":"שלום {{שם}},\n\nבעקבות המשוב שלך בדקנו שוב את הטיפול ב{{קטגוריה}} ב{{מיקום}}.\n\n{{תוצאה}}\n\nתודה שעדכנת אותנו,\nועד הקהילה"},
 ADMIN_GARDEN_DAILY: {"su":"סיכום גינון יומי","bo":"שלום,\n\nמה מחכה היום בגינון:\n\n• לא שובצו: {{לא שובצו}}\n• ממתינות לאישורך: {{לאישורך}}\n• חסומות: {{חסומות}}\n• פתוחות מעל 7 ימים: {{מעל 7 ימים}}\n\n{{עדכונים}}הפירוט המלא במסך המשימות.\n\nאפליקציית הוועד"},
 EVENT_RSVP_OPEN: {"su":"נפתח אישור הגעה: {{שם האירוע}}","bo":"שלום,\n\nנפתח אישור הגעה לאירוע {{שם האירוע}} ({{תאריך}}).\n\nאפשר לאשר הגעה בלוח האירועים באפליקציה.\n\nבברכה,\nועד הקהילה"},
 EVENT_REMINDER: {"su":"תזכורת: {{שם האירוע}} מחר","bo":"שלום,\n\nתזכורת — מחר ({{תאריך}}) מתקיים {{שם האירוע}}, ב{{מיקום}}. אישרת הגעה.\n\nנתראה,\nועד הקהילה"},
 EVENTS_WEEKLY: {"su":"השבוע בשיכון · {{שבוע}}","bo":"שלום,\n\nמה מחכה לנו השבוע בשיכון:\n\n{{רשימה}}\n\nכל הפרטים בלוח האירועים באפליקציה.\n\nשבוע טוב,\nועד הקהילה"}
};

/* תבניות חדשות שלא היו ב-DEFAULT_EMAIL_SETTINGS — [מפתח, תחום]. */
function notifyExtraEmailRows_() {
  var out = [];
  var NEW = {CLUB_RECEIVED: PERM_CLUB, GARDENER_WEEKLY_PLAN: PERM_GARDEN, ADMIN_GARDEN_DAILY: PERM_GARDEN, GARDENER_TASK_ADDED: PERM_GARDEN, GARDEN_FINAL_CHECK: PERM_GARDEN, ADMIN_GARDEN_AWAITING_APPROVAL: PERM_GARDEN, GARDENER_TASK_RETURNED: PERM_GARDEN, GARDEN_PENDING_REVIEW: PERM_GARDEN, GARDEN_RECHECK_DONE: PERM_GARDEN, EVENT_RSVP_OPEN: PERM_SUPER, EVENT_REMINDER: PERM_SUPER, EVENTS_WEEKLY: PERM_SUPER};
  Object.keys(NEW).forEach(function (k) {
    var t = NOTIFY_MAIL_TEXTS[k] || {};
    out.push([k, t.su || '', t.bo || '', 'מרכז ההתראות (23.9) — נשלח לפי הטבלה במסך "ניהול התראות"', NEW[k], 'כן']);
  });
  var G = { NOTIFY_MASTER_PUSH: 'on', NOTIFY_SUPER_MODE: 'table', NOTIFY_NO_PUSH: 'mail', NOTIFY_BADGE: 'on',
            NOTIFY_QUIET: 'night', NOTIFY_OPT_OUT: 'push', NOTIFY_EXTERNAL: 'strict' };
  Object.keys(G).forEach(function (k) {
    out.push([k, '', G[k], 'הגדרה כללית של מרכז ההתראות — נערכת במסך "ניהול התראות" (לשונית הגדרות כלליות)', PERM_SUPER, 'כן']);
  });
  return out;
}
