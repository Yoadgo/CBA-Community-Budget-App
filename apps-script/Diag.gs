/* ============================================================================
 *  Diag.gs — גל 4: כלי תחקור + דיווחים ב-Firestore   (24.9.2026)
 * ----------------------------------------------------------------------------
 *  שלושה חלקים, קובץ אחד כדי לא לגעת ב-Code.gs יותר ממה שחייבים:
 *
 *  1. **יומן הדופק** (כלי 2) — כמה זמן לקח כל שלב בעבודה השעתית.
 *     נשמר ב-Script Properties (לא ב-Firestore): אפס כללי אבטחה, אפס
 *     אוסף חדש, אפס סחיפת יתומים. 24 ריצות אחרונות + פירוק מלא לאחרונה.
 *     🔴 **אף פונקציה אינה מקבלת החלטה על סמך הנתון הזה.** מסמך חסר =
 *        טבלה ריקה במסך, ותו לא.
 *
 *  2. **השוואת פריט** (כלי 1) — מסמך Firestore מול שורת הגיליון, לפי מזהה.
 *     קריאה בלבד, מנהל-על בלבד, רק בלחיצה.
 *
 *  3. **דיווחים על האפליקציה ב-Firestore** — הדפדפן כותב את הדיווח ישירות
 *     (appReports/{id}); כאן: מייל למנהלים, מראה לגיליון, תשובה לתושב,
 *     וזריעה חד-פעמית של הדיווחים הישנים מהגיליון.
 *     🔒 הקו האדום: אין שם/מייל במסמך. הם נשלפים כאן, מהגיליון, לפי uid.
 *     ⚠️ שלושת המסלולים אידמפוטנטיים (דגל שיורד בסוף) — הקריאה מהדפדפן
 *        והסריקה השעתית יכולות לרוץ על אותו דיווח בלי כפילות.
 * ========================================================================== */

var DIAG_PULSE_KEY      = 'DIAG_PULSE';
var DIAG_PULSE_LAST_KEY = 'DIAG_PULSE_LAST';
var DIAG_PULSE_MAX      = 24;
var DIAG_PULSE_TOP_MS   = 1500;     // שלב קצר מזה לא נשמר ברשימת 24 הריצות (רק בפירוק האחרון)
var DIAG_PROP_MAX       = 8500;     // מתחת ל-9KB של ערך בודד ב-Script Properties

var FS_APP_REPORTS      = 'appReports';
var APP_REPORT_COUNTER  = 'appReport';

/* ========================= 1. יומן הדופק ========================= */

function hjStart_() {
  var now = Date.now();
  return { t0: now, last: now, cur: 'פתיחה', st: [], fail: [] };
}

/** "השלב הבא מתחיל עכשיו". משך השלב הקודם = ההפרש מהסימון הקודם. */
function hjMark_(H, name) {
  if (!H) return;
  try {
    var now = Date.now();
    if (H.cur) H.st.push([H.cur, now - H.last]);
    H.cur = name; H.last = now;
  } catch (e) {}
}

function hjFail_(H, err) {
  if (!H) return;
  try { H.fail.push([H.cur, String(err).substring(0, 160)]); } catch (e) {}
}

function diagPulseRead_() {
  var props = PropertiesService.getScriptProperties();
  var runs = [], last = null;
  try { runs = JSON.parse(props.getProperty(DIAG_PULSE_KEY) || '[]') || []; } catch (e) { runs = []; }
  try { last = JSON.parse(props.getProperty(DIAG_PULSE_LAST_KEY) || 'null'); } catch (e) { last = null; }
  return { runs: runs, last: last };
}

function diagPulseWriteRuns_(runs) {
  var props = PropertiesService.getScriptProperties();
  while (runs.length > DIAG_PULSE_MAX) runs.shift();
  var txt = JSON.stringify(runs);
  /* ⚠️ ערך מעל 9KB נזרק. קודם מקצרים את הפירוט של הריצות הישנות, ורק
     אחר כך — אם עדיין גדול — מוותרים על ריצות. לעולם לא נכשלים. */
  var i = 0;
  while (txt.length > DIAG_PROP_MAX && i < runs.length) {
    if (runs[i].top) delete runs[i].top;
    i++; txt = JSON.stringify(runs);
  }
  while (txt.length > DIAG_PROP_MAX && runs.length > 1) { runs.shift(); txt = JSON.stringify(runs); }
  props.setProperty(DIAG_PULSE_KEY, txt);
}

/** סוף הריצה. `sum` — מונים שהשלבים כבר החזירו (מיילים, פוש). */
function hjSave_(H, sum) {
  if (!H) return;
  try {
    hjMark_(H, '');
    var total = Date.now() - H.t0;
    var quota = -1;
    try { quota = MailApp.getRemainingDailyQuota(); } catch (e) {}
    var top = {};
    H.st.forEach(function (s) { if (s[1] >= DIAG_PULSE_TOP_MS) top[s[0]] = Math.round(s[1] / 100) / 10; });
    var run = { t: new Date(H.t0).toISOString(), d: Math.round(total / 100) / 10,
                f: H.fail.length, top: top };
    if (sum) { run.m = sum.mail || 0; run.p = sum.push || 0; }
    var cur = diagPulseRead_();
    cur.runs.push(run);
    diagPulseWriteRuns_(cur.runs);

    var lastTxt = JSON.stringify({
      t: run.t, d: run.d, q: quota, sum: sum || {},
      st: H.st.map(function (s) { return [s[0], Math.round(s[1] / 100) / 10]; }),
      fail: H.fail
    });
    if (lastTxt.length > DIAG_PROP_MAX) {
      lastTxt = JSON.stringify({ t: run.t, d: run.d, q: quota, sum: sum || {}, st: [], fail: H.fail.slice(0, 5) });
    }
    PropertiesService.getScriptProperties().setProperty(DIAG_PULSE_LAST_KEY, lastTxt);
  } catch (e) { Logger.log('hjSave_ נכשל: ' + e); }
}

/** ריצה שדולגה כי הנעילה הייתה תפוסה — גם זה מידע. */
function hjSkipped_(reason) {
  try {
    var cur = diagPulseRead_();
    cur.runs.push({ t: new Date().toISOString(), skip: 1, why: String(reason || '').substring(0, 80) });
    diagPulseWriteRuns_(cur.runs);
  } catch (e) {}
}

/** שורה אחת לצירוף לדיווח ולמייל. */
function diagPulseLine_() {
  try {
    var p = diagPulseRead_();
    var runs = p.runs.filter(function (r) { return !r.skip; });
    if (!runs.length) return 'אין עדיין נתוני ריצה שעתית';
    var r = runs[runs.length - 1];
    var tz = Session.getScriptTimeZone();
    var when = Utilities.formatDate(new Date(r.t), tz, 'dd.MM HH:mm');
    var mx = 0; runs.forEach(function (x) { if (x.d > mx) mx = x.d; });
    var skips = p.runs.filter(function (x) { return x.skip; }).length;
    return 'ריצה שעתית אחרונה ' + when + ' · ' + r.d + " ש'" +
           ' · כשלים ' + (r.f || 0) +
           ' · השיא ב-' + runs.length + ' ריצות: ' + mx + " ש'" +
           (skips ? ' · דולגו ' + skips : '') +
           (p.last && p.last.q >= 0 ? ' · מכסת מייל שנותרה ' + p.last.q : '');
  } catch (e) { return ''; }
}

/** GET diagPulse — מנהל-על. */
function handleDiagPulse_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_SUPER);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var d = diagPulseRead_();
    return json_({ ok: true, runs: d.runs, last: d.last, ceiling: 360, line: diagPulseLine_() });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* ========================= 2. השוואת פריט ========================= */

function diagCellText_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) {
    try { return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }
    catch (e) { return v.toISOString(); }
  }
  if (Object.prototype.toString.call(v) === '[object Array]') return v.join(',');
  return String(v).substring(0, 300);
}

function diagFindRow_(sh, idCol, id) {
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var c = headers.indexOf(idCol);
  if (c === -1 || sh.getLastRow() < 2) return { headers: headers, row: null };
  var ids = sh.getRange(2, c + 1, sh.getLastRow() - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === String(id)) {
      return { headers: headers, row: sh.getRange(i + 2, 1, 1, lastCol).getValues()[0], rowNum: i + 2 };
    }
  }
  return { headers: headers, row: null };
}

/** השוואה לפי מפת עמודה→שדה (גינון). */
function diagCompareMap_(sh, map, doc, id) {
  var f = diagFindRow_(sh, 'מזהה', id);
  var out = [];
  Object.keys(map).forEach(function (col) {
    var field = map[col];
    var ci = f.headers.indexOf(col);
    var dv = doc ? gardenMirrorCell_(doc[field]) : '';
    var rv = (f.row && ci !== -1) ? f.row[ci] : '';
    var same = (!doc || !f.row || ci === -1) ? (!doc && !f.row) : gardenMirrorSame_(rv, dv);
    out.push({ col: col, doc: diagCellText_(dv), row: ci === -1 ? '(אין עמודה)' : diagCellText_(rv), same: same });
  });
  return { rowExists: !!f.row, rowNum: f.rowNum || 0, fields: out };
}

/** GET diagCompare — מנהל-על, קריאה בלבד. kind: task | greport | tx | app */
function handleDiagCompare_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_SUPER);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    var kind = String(p.kind || '').trim();
    var id = String(p.id || '').trim();
    if (!id) return json_({ ok: false, error: 'חסר מזהה' });

    var res = { ok: true, kind: kind, id: id, docExists: false, rowExists: false, fields: [], owner: '' };
    var doc, r, sh;

    if (kind === 'task' || kind === 'greport') {
      var isTask = kind === 'task';
      doc = fsGet_(fsDocPath_(isTask ? FS_GARDEN_TASKS : FS_GARDEN_REPORTS, id));
      sh = ss.getSheetByName(isTask ? GARDEN_TASKS_SHEET : GARDEN_REPORTS_SHEET);
      if (!sh) return json_({ ok: false, error: 'הטאב לא נמצא' });
      r = diagCompareMap_(sh, isTask ? GARDEN_TASK_MIRROR_COLS : GARDEN_REPORT_MIRROR_COLS, doc, id);
      res.owner = gardenFsOwns_() ? 'Firestore (הגיליון מראה)' : 'הגיליון';
    } else if (kind === 'tx') {
      var settings = readSettings_(ss);
      var year = String(p.year || settings['שנה נוכחית'] || '').trim();
      if (!year) return json_({ ok: false, error: 'חסרה שנה' });
      res.year = year;
      doc = fsGet_(fsDocPath_(FS_BUDGET_TX, btxDocId_(year, id)));
      sh = ss.getSheetByName('תנועות ' + year);
      if (!sh) return json_({ ok: false, error: 'אין טאב תנועות ' + year });
      var f = diagFindRow_(sh, 'מזהה', id);
      var want = doc ? btxMirrorRow_(f.headers, doc, {}) : [];
      var fields = [];
      f.headers.forEach(function (h, i) {
        if (BTX_ALLOWED_COLS.indexOf(h) === -1 || h === 'רוכש') return;
        var dv = doc ? want[i] : '', rv = f.row ? f.row[i] : '';
        var same = (!doc || !f.row) ? (!doc && !f.row)
                   : String(rv == null ? '' : rv) === String(dv == null ? '' : dv);
        fields.push({ col: h, doc: diagCellText_(dv), row: diagCellText_(rv), same: same });
      });
      r = { rowExists: !!f.row, rowNum: f.rowNum || 0, fields: fields };
      res.owner = txJobsUseFirestore_() ? 'Firestore (הגיליון מראה)' : 'הגיליון';
    } else if (kind === 'app') {
      doc = fsGet_(fsDocPath_(FS_APP_REPORTS, id));
      sh = ss.getSheetByName(APP_REPORTS_SHEET);
      if (!sh) return json_({ ok: false, error: 'אין טאב דיווחים' });
      var fa = diagFindRow_(sh, 'מזהה', id);
      var pick = function (col) { var i = fa.headers.indexOf(col); return (fa.row && i !== -1) ? fa.row[i] : ''; };
      var pairs = [
        ['סוג', doc && doc.kind, pick('סוג')],
        ['סעיפים', doc && (doc.items || []).join('\n'), pick('סעיפים')],
        ['מסך', doc && doc.screen, pick('מסך')],
        ['טופל', doc ? (doc.done ? 'כן' : '') : '', pick('טופל')],
        ['תגובה', doc && doc.reply, pick('תגובה')],
        ['תמונות', doc && (doc.photos || []).join(','), pick('תמונות')]
      ];
      r = { rowExists: !!fa.row, rowNum: fa.rowNum || 0, fields: pairs.map(function (x) {
        var dv = x[1] == null ? '' : x[1], rv = x[2] == null ? '' : x[2];
        return { col: x[0], doc: diagCellText_(dv), row: diagCellText_(rv),
                 same: (!doc || !fa.row) ? (!doc && !fa.row) : String(dv).trim() === String(rv).trim() };
      }) };
      res.owner = 'Firestore (הגיליון מראה)';
      if (doc) res.pending = { mail: doc.mailPending === true, mirror: doc.mirrorPending === true,
                               reply: doc.replyPending === true };
    } else {
      return json_({ ok: false, error: 'סוג לא מוכר' });
    }

    res.docExists = !!doc;
    res.rowExists = r.rowExists;
    res.rowNum = r.rowNum;
    res.fields = r.fields;
    res.diffs = r.fields.filter(function (x) { return !x.same; }).length;
    res.pulse = diagPulseLine_();
    return json_(res);
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/* =================== 3. דיווחים על האפליקציה — Firestore =================== */

/** uid → {email, name}. הקו האדום: השם והמייל נשארים בגיליון ונשלפים כאן. */
function appReportIdentity_(ss, uid) {
  var out = { email: '', name: '' };
  uid = String(uid || '').trim();
  if (!uid) return out;
  try {
    var byEmail = gymUidByEmail_(ss);
    for (var em in byEmail) {
      if (Object.prototype.hasOwnProperty.call(byEmail, em) && byEmail[em] === uid) { out.email = em; break; }
    }
    if (out.email) {
      var pr = permissionsFor_(out.email) || {};
      out.name = ((pr.firstName || '') + ' ' + (pr.family || '')).trim();
    }
  } catch (e) {}
  return out;
}

function appReportDate_(v) {
  if (v instanceof Date) return v;
  var d = new Date(v);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * מראה של מסמך אחד לשורה בטאב. שורה חסרה — נוספת (עם שם ומייל מהגיליון);
 * שורה קיימת — מתעדכנים רק מה שהמנהל או השרת משנים (טופל/תגובה/תמונות/דופק).
 * ⚠️ חייב לרוץ בתוך נעילת הסקריפט (הקורא אחראי) — שתי הוספות במקביל
 *    היו יוצרות שתי שורות לאותו מזהה.
 */
function appReportMirrorOne_(ss, id, d, who) {
  var sh = ensureAppReportsSheet_(ss);
  var c = gardenCols_(sh);
  var f = diagFindRow_(sh, 'מזהה', id);
  var set = function (row, col, val, max) {
    if (c[col] === undefined) return;
    var s = (val instanceof Date) ? val : String(val == null ? '' : val);
    row[c[col]] = (max && typeof s === 'string') ? s.substring(0, max) : s;
  };
  if (!f.row) {
    who = who || appReportIdentity_(ss, d.uid);
    var row = new Array(sh.getLastColumn()).fill('');
    set(row, 'מזהה', id);
    row[c['תאריך']] = appReportDate_(d.createdAt);
    set(row, 'מייל', who.email);
    set(row, 'שם', who.name || who.email);
    set(row, 'סוג', d.kind);
    set(row, 'סעיפים', (d.items || []).join('\n'), 2000);
    set(row, 'מסך', d.screen, 120);
    set(row, 'גרסת לקוח', d.ver, 40);
    set(row, 'דפדפן', d.ua, 200);
    set(row, 'חלון פתוח', d.dialog, 160);
    set(row, 'הרשאות', d.perms, 120);
    set(row, 'שנת עבודה', d.year, 40);
    set(row, 'גרסת שרת', d.srvVer, 40);
    set(row, 'רשת', d.net, 60);
    set(row, 'שגיאות', d.errors, 2000);
    set(row, 'שובל פעולות', d.trail, 2000);
    set(row, 'מידע נוסף', d.extra, 400);
    set(row, 'תמונות', (d.photos || []).join(','));
    set(row, 'דופק שרת', d.pulse, 400);
    set(row, 'טופל', d.done ? 'כן' : '');
    if (d.done && d.doneAt && c['תאריך טיפול'] !== undefined) row[c['תאריך טיפול']] = appReportDate_(d.doneAt);
    set(row, 'תגובה', d.reply, 4000);
    sh.appendRow(row);
    return { added: 1, email: who.email, name: who.name };
  }
  var rn = f.rowNum;
  var upd = function (col, val) {
    if (c[col] === undefined) return;
    var cur = f.row[c[col]];
    if (String(cur == null ? '' : cur) === String(val == null ? '' : val)) return;
    sh.getRange(rn, c[col] + 1).setValue(val == null ? '' : val);
  };
  upd('טופל', d.done ? 'כן' : '');
  if (c['תאריך טיפול'] !== undefined) {
    var had = f.row[c['תאריך טיפול']];
    if (d.done && !had) sh.getRange(rn, c['תאריך טיפול'] + 1).setValue(appReportDate_(d.doneAt));
    if (!d.done && had) sh.getRange(rn, c['תאריך טיפול'] + 1).setValue('');
  }
  if (d.reply != null) upd('תגובה', String(d.reply).substring(0, 4000));
  if ((d.photos || []).length) upd('תמונות', (d.photos || []).join(','));
  if (d.pulse) upd('דופק שרת', String(d.pulse).substring(0, 400));
  var ie = f.headers.indexOf('מייל'), iname = f.headers.indexOf('שם');
  return { added: 0, email: ie !== -1 ? String(f.row[ie] || '') : '', name: iname !== -1 ? String(f.row[iname] || '') : '' };
}

function appReportLocked_(fn) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { ok: false, error: 'תפוס — נסה שוב' }; }
  try { return fn(); } finally { lock.releaseLock(); }
}

/** מייל למנהלים + מראה + צירוף הדופק. אידמפוטנטי לפי mailPending. */
function appReportSendNew_(ss, id) {
  return appReportLocked_(function () {
    var d = fsGet_(fsDocPath_(FS_APP_REPORTS, id));
    if (!d) return { ok: false, error: 'הדיווח לא נמצא' };
    if (d.mailPending !== true) return { ok: true, already: true };
    d.pulse = diagPulseLine_();
    var m = appReportMirrorOne_(ss, id, d);
    try {
      var isBug = d.kind === 'תקלה';
      notifyAdmins_(ss, PERM_SUPER, 'ADMIN_NEW_APP_REPORT', {
        'שם': m.name || m.email || 'משתמש', 'סוג': isBug ? 'דיווח על תקלה' : 'הצעת ייעול',
        'מזהה': id, 'תוכן': (d.items || []).join('\n'), 'מסך': String(d.screen || ''),
        'אבחון': [String(d.dialog || ''), String(d.ver || ''), String(d.ua || ''),
                  String(d.net || ''), String(d.pulse || '')]
                 .filter(function (t) { return t; }).join(' · '),
        'שגיאות': String(d.errors || '')
      });
    } catch (e) { /* כשל מייל לא מבטל דיווח שכבר נשמר */ }
    /* ⚠️ הדגל יורד גם כשהמייל נכשל — ניסיון חוזר כל שעה על תבנית שבורה
       היה הופך לנודניק. אותו כלל כמו gardenSendReportMail_. */
    fsMerge_(fsDocPath_(FS_APP_REPORTS, id),
             { mailPending: false, mirrorPending: false, mailedAt: new Date(), pulse: d.pulse });
    return { ok: true, sent: 1 };
  });
}

/** תשובה לתושב. אידמפוטנטי לפי replyPending. */
function appReportSendReply_(ss, id) {
  return appReportLocked_(function () {
    var d = fsGet_(fsDocPath_(FS_APP_REPORTS, id));
    if (!d) return { ok: false, error: 'הדיווח לא נמצא' };
    if (d.replyPending !== true) return { ok: true, already: true };
    var m = appReportMirrorOne_(ss, id, d);
    var txt = String(d.replyLast || '').trim();
    if (txt && m.email) {
      try {
        sendResidentTemplate_(ss, 'APP_REPORT_REPLY', [m.email], {
          'שם': String(m.name || '').split(' ')[0] || '', 'מזהה': id, 'תגובה': txt
        });
      } catch (e) {}
    }
    fsMerge_(fsDocPath_(FS_APP_REPORTS, id), { replyPending: false, mirrorPending: false, repliedAt: new Date() });
    return { ok: true, sent: (txt && m.email) ? 1 : 0 };
  });
}

function appReportMirrorPending_(ss, id) {
  return appReportLocked_(function () {
    var d = fsGet_(fsDocPath_(FS_APP_REPORTS, id));
    if (!d || d.mirrorPending !== true) return { ok: true, already: true };
    if (d.mailPending === true || d.replyPending === true) return { ok: true, later: true };
    appReportMirrorOne_(ss, id, d);
    fsMerge_(fsDocPath_(FS_APP_REPORTS, id), { mirrorPending: false });
    return { ok: true };
  });
}

/** doPost appReportNotify — כל חבר מחובר (כמו gardenNotifyReport_). שגר ושכח. */
function appReportNotify_(ss, body) {
  var gate = authorize_(ss, body, null);
  if (!gate.ok) return { ok: false, error: gate.error };
  var id = String((body && body.id) || '').trim();
  if (!/^\d{1,9}$/.test(id)) return { ok: false, error: 'מזהה לא תקין' };
  return appReportSendNew_(ss, id);
}

/** doPost appReportReplyNotify — מנהל-על (ACTION_PERMS). */
function appReportReplyNotify_(ss, body) {
  var id = String((body && body.id) || '').trim();
  if (!/^\d{1,9}$/.test(id)) return { ok: false, error: 'מזהה לא תקין' };
  var r1 = appReportSendReply_(ss, id);
  /* סימון "טופל" בלבד (בלי תשובה) מגיע לכאן גם הוא — מראה מיידית. */
  try { appReportMirrorPending_(ss, id); } catch (e) {}
  return r1;
}

/** doPost appReportPhotoOne — כל חבר מחובר שאינו חיצוני. תמונה אחת לתיקיית הדיווחים. */
function appReportPhotoOne_(ss, body) {
  var gate = authorize_(ss, body, null);
  if (!gate.ok) return { ok: false, error: gate.error };
  var p = body.photo;
  if (!p || !p.data) return { ok: false, error: 'לא נשלחה תמונה' };
  try {
    var blob = Utilities.newBlob(Utilities.base64Decode(p.data), p.mime || 'image/jpeg',
                                 p.name || ('app-report-' + Date.now() + '.jpg'));
    return { ok: true, id: getAppReportPhotosFolder_().createFile(blob).getId() };
  } catch (e) {
    return { ok: false, error: 'העלאת התמונה נכשלה: ' + String(e) };
  }
}

/** מזהה לדיווח שנכתב במסלול הישן (Apps Script) — מסונכרן עם המונה של Firestore,
 *  כדי שהדגל יוכל להיכבות ולהידלק בלי ששני מסלולים יקצו אותו מספר. */
function appReportNextIdShared_(sh) {
  var id = nextGardenId_(sh);
  try {
    var cur = fsGet_(fsDocPath_(FS_COUNTERS, APP_REPORT_COUNTER));
    var n = cur ? parseInt(cur.n, 10) : 0;
    if (!isNaN(n) && n >= id) id = n + 1;
    fsSet_(fsDocPath_(FS_COUNTERS, APP_REPORT_COUNTER), { n: id, schema: 1, updatedAt: new Date() });
  } catch (e) {}
  return id;
}

/** המסמך של דיווח שנכתב במסלול הישן — כדי שמסך הניהול (שקורא מ-Firestore) יראה אותו. */
function appReportDocFromLegacy_(id, fields) {
  try {
    var doc = {
      id: String(id), uid: '', familyId: String(fields.familyId || ''),
      kind: fields.kind, items: fields.items || [],
      screen: String(fields.screen || ''), ver: String(fields.ver || ''),
      srvVer: String(fields.srvVer || ''), ua: String(fields.ua || ''),
      perms: String(fields.perms || ''), year: String(fields.year || ''),
      net: String(fields.net || ''), dialog: String(fields.dialog || ''),
      errors: String(fields.errors || '').substring(0, 2500),
      trail: String(fields.trail || '').substring(0, 2500),
      extra: String(fields.extra || '').substring(0, 500),
      photos: fields.photos || [], done: !!fields.done,
      reply: String(fields.reply || ''), pulse: String(fields.pulse || ''),
      createdAt: fields.date || new Date(),
      mailPending: false, mirrorPending: false, legacy: true, schema: 1
    };
    if (fields.doneAt) doc.doneAt = fields.doneAt;
    fsSet_(fsDocPath_(FS_APP_REPORTS, id), doc);
    return true;
  } catch (e) { Logger.log('appReportDocFromLegacy_ ' + id + ': ' + e); return false; }
}

/**
 * זריעה חד-פעמית: כל שורה בטאב שאין לה מסמך → מסמך. ומונה = המזהה הגבוה.
 * GET appReportsSeed (מנהל-על). אידמפוטנטי — מסמך קיים אינו נדרס.
 */
function appReportsSeed_(ss) {
  var out = { ok: true, created: 0, kept: 0, counter: 0, errors: [] };
  var sh = ss.getSheetByName(APP_REPORTS_SHEET);
  var have = {};
  fsList_(FS_APP_REPORTS).forEach(function (x) { have[String(x.id)] = 1; });
  var max = 0;
  if (sh && sh.getLastRow() > 1) {
    var c = gardenCols_(sh);
    var v = sh.getDataRange().getValues();
    var famOf = {};
    for (var r = 1; r < v.length; r++) {
      var id = String(v[r][c['מזהה']] || '').trim();
      if (!id) continue;
      var n = parseInt(id.replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
      if (have[id]) { out.kept++; continue; }
      var em = normalizeEmail_(String(v[r][c['מייל']] || ''));
      if (em && famOf[em] === undefined) {
        try { famOf[em] = String((permissionsFor_(em) || {}).familyId || ''); } catch (e) { famOf[em] = ''; }
      }
      var cell = function (h) { return c[h] === undefined ? '' : v[r][c[h]]; };
      var ok = appReportDocFromLegacy_(id, {
        familyId: em ? famOf[em] : '', kind: String(cell('סוג') || ''),
        items: String(cell('סעיפים') || '').split('\n').filter(function (t) { return t.trim(); }).slice(0, 5),
        screen: cell('מסך'), ver: cell('גרסת לקוח'), srvVer: cell('גרסת שרת'), ua: cell('דפדפן'),
        perms: cell('הרשאות'), year: cell('שנת עבודה'), net: cell('רשת'), dialog: cell('חלון פתוח'),
        errors: cell('שגיאות'), trail: cell('שובל פעולות'), extra: cell('מידע נוסף'),
        photos: String(cell('תמונות') || '').split(',').filter(Boolean),
        done: String(cell('טופל') || '').trim() === 'כן',
        doneAt: (cell('תאריך טיפול') instanceof Date) ? cell('תאריך טיפול') : null,
        reply: cell('תגובה'), pulse: cell('דופק שרת'),
        date: (cell('תאריך') instanceof Date) ? cell('תאריך') : new Date()
      });
      if (ok) out.created++; else out.errors.push(id);
    }
  }
  try {
    var cur = fsGet_(fsDocPath_(FS_COUNTERS, APP_REPORT_COUNTER));
    var have2 = cur ? parseInt(cur.n, 10) : -1;
    if (isNaN(have2) || have2 < max) {
      fsSet_(fsDocPath_(FS_COUNTERS, APP_REPORT_COUNTER), { n: max, schema: 1, updatedAt: new Date() });
      out.counter = max;
    } else out.counter = have2;
  } catch (e) { out.ok = false; out.errors.push('מונה: ' + String(e)); }
  return out;
}

function handleAppReportsSeed_(p) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var gate = authorize_(ss, p, PERM_SUPER);
    if (!gate.ok) return json_({ ok: false, error: gate.error });
    return json_(appReportsSeed_(ss));
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

/**
 * שלב בעבודה השעתית. שלוש שאילתות שוויון — כמעט תמיד ריקות, ולכן זולות.
 * 🔴 מונה חסר = זריעה. בלי זה הדפדפן אינו יכול להקצות מספר ונופל לאחור.
 */
function appReportsHourly_(ss) {
  var out = { mailed: 0, replied: 0, mirrored: 0, seeded: false, errors: [] };
  try {
    if (!fsGet_(fsDocPath_(FS_COUNTERS, APP_REPORT_COUNTER))) {
      appReportsSeed_(ss); out.seeded = true;
    }
  } catch (e) { out.errors.push('זריעה: ' + e); }
  var run = function (field, fn, key) {
    try {
      fsQuery_(FS_APP_REPORTS, field, 'EQUAL', true, 50).forEach(function (x) {
        try { var r = fn(ss, String(x.id)); if (r && r.ok && !r.already && !r.later) out[key]++; }
        catch (e) { out.errors.push(x.id + ': ' + e); }
      });
    } catch (e) { out.errors.push(field + ': ' + e); }
  };
  run('mailPending', appReportSendNew_, 'mailed');
  run('replyPending', appReportSendReply_, 'replied');
  run('mirrorPending', appReportMirrorPending_, 'mirrored');
  return out;
}
