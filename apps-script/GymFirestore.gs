/* ============================================================================
 *  GymFirestore.gs — מכון הכושר ב-Firestore, מקסימום בלי פרטים אישיים (25.9.2026)
 * ----------------------------------------------------------------------------
 *  בקשת יועד: "תעביר מקסימום תכולות ל-Firebase עם שימוש במזהה משפחה, uid".
 *
 *  🔑 מה עובר (מראה, מתעדכן **מיד** בכל פעולת מכון + רשת ביטחון שעתית):
 *     gymMembers/{מזהה מנוי}   כל מנוי — סטטוס, מסלול, תאריכים, תשלומים,
 *                               familyId, uid, slot. קריאה: מנהל מכון בלבד.
 *     gymConfig/public          מסלולים, תקנון, נוסח שאלות השאלון (בלי תשובות),
 *                               קישור פייבוקס, ימי תזכורת. קריאה: כל חבר.
 *     gymConfig/admin           הגדרות המכון (בלי קוד הכניסה). קריאה: מנהל מכון.
 *     (gymStatus/{uid}, gymCode/{uid} — כבר קיימים, Code.gs.)
 *
 *  ✅ 3.10.26 (schema 2, החלטת יועד: "תשובות בריאות וחתימה יכולים לשבת בפיירבייס"):
 *     גם תשובות השאלון, דגלים, חתימה, אישור רופא, הערות מנהל ויומן האירועים (מערך `log`
 *     בתוך המסמך) עוברים. הקריאה נשארת למנהל מכון בלבד.
 *  ⛔ מה **לא** עובר, בכוונה: שם, אימייל, טלפון, ת.ז., תאריך לידה, מספר בית —
 *     נתוני גיליון "תושבים". שם ומספר בית נגזרים בלקוח מספריית השמות
 *     (js/data/gymFs.js); ת.ז./תאריך לידה נמשכים מהגיליון רק בצפייה בהצהרה.
 *     רשימת **היתר**, לא חסימה — עמודה חדשה בגיליון לא זולגת לכאן מעצמה.
 *
 *  🔑 הגיליון נשאר מקור האמת לכתיבה: כל פעולה עדיין עוברת ב-Apps Script
 *     (מיילים, סריקת Gemini, קבצים בדרייב), ומיד אחריה המנוי הזה נכתב כאן
 *     (doorGymAfterWrite_ ב-Door.gs). לכן אין סכנת "שני מקורות".
 * ========================================================================== */

var FS_GYM_MEMBERS = 'gymMembers';
var FS_GYM_CONFIG  = 'gymConfig';

var GYM_MEMBER_FS_FIELDS = ['מזהה', 'מסלול', 'מחיר מוסכם', 'תאריך התחלה', 'בתוקף עד', 'סטטוס',
  'סה"כ שולם', 'תשלום אחרון', 'חודשים ששולמו', 'מצב סנכרון', 'אישור תקנון',
  'הוגש בתאריך', 'טופל בתאריך', 'מנוי קודם', 'דווח בתאריך', 'אמצעי תשלום', 'אסמכתא',
  'דגלי תזכורת'];

/* 3.10.26 (שלב 1 למעבר מלא ל-Firebase, החלטת יועד: "תשובות בריאות וחתימה יכולים לשבת בפיירבייס"):
   גם נתוני ההצהרה והטיפול עוברים. עדיין רשימת היתר. נשארים בגיליון "תושבים" בלבד:
   שם, אימייל, טלפון, ת.ז., תאריך לידה — המסך מושך שם ומספר בית מספריית השמות.
   הקריאה למסמך הזה: מנהל מכון בלבד (isInternalAdmin('מכון') בכללים). */
var GYM_MEMBER_FS_EXTRA = ['תאריך חתימה', 'קישור חתימה', 'גרסת שאלון', 'אישור רופא', 'תאריך הנפקת האישור',
  'קישור אישור', 'טופל ע"י', 'הערות מנהל', 'שאלות שנענו בכן', 'דגלים', 'הערת דגל', 'סטטוס תשלום',
  'אומת בתאריך', 'אומת ע"י'];
var GYM_LOG_FS_MAX = 60;   // אירועים לכל מנוי במסמך (הישנים נחתכים; הגיליון שומר הכול)

/* הגדרות שמותר לתושב לראות (gymConfig/public). כל השאר — רק למנהל. */
var GYM_PUBLIC_SETTINGS = { 'קישור פייבוקס': 'payboxUrl', 'ימים לתזכורת חידוש': 'renewDaysBefore',
  'תוקף הצהרה בחודשים': 'declarationMonths', 'גיל מינימום': 'minAge' };

/** אינדקס אחד של טאב התושבים: אימייל → { uid, familyId, slot }. קריאה אחת. */
function gymResidentIndex_(ss) {
  var out = {};
  var sh = ss.getSheetByName('תושבים');
  if (!sh) return out;
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return out;
  var headers = values[0].map(function (h) { return String(h).trim(); });
  var cols = residentSlotCols_(sh);
  var idCol = headers.indexOf(RESIDENT_ID_HEADER), houseCol = -1;
  headers.forEach(function (h, i) { if (houseCol === -1 && h.indexOf('בית') !== -1) houseCol = i; });
  for (var r = 1; r < values.length; r++) {
    var fid = idCol > -1 ? String(values[r][idCol] || '').trim() : '';
    if (!fid && houseCol > -1) fid = String(values[r][houseCol] || '').trim();
    for (var s = 0; s < cols.email.length; s++) {
      var em = normalizeEmail_(String(values[r][cols.email[s]] || ''));
      if (!em) continue;
      out[em] = { uid: cols.uid[s] != null ? String(values[r][cols.uid[s]] || '').trim() : '', familyId: fid, slot: s + 1 };
    }
  }
  return out;
}

function gymFsDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v == null ? '' : v;
}

/** שמות העמודות של שאלות הבריאות (הכותרת הקצרה בטאב ההגדרות) — כולל שאלות כבויות. */
function gymQuestionLabels_(ss) {
  var out = [];
  var cfg = ss.getSheetByName(GYM_SETTINGS_SHEET);
  if (!cfg) return out;
  var rows = cfg.getDataRange().getValues();
  for (var r = 1; r < rows.length; r++) {
    if (String(rows[r][0]).trim() !== 'שאלה') continue;
    var label = String(rows[r][3]).trim();
    if (label && out.indexOf(label) === -1) out.push(label);
  }
  return out;
}

/** יומן האירועים מקובץ לפי מזהה מנוי: { 'GYM-0001': [ {id,t,type,amount,...}, ... ] } — הישן ראשון. */
function gymLogByMember_(ss) {
  var out = {};
  var sh = ss.getSheetByName(GYM_LOG_SHEET);
  if (!sh || sh.getLastRow() < 2) return out;
  readTable_(ss, GYM_LOG_SHEET).forEach(function (e) {
    var id = String(e['מזהה מנוי'] || '').trim();
    if (!id) return;
    var d = e['תאריך'];
    var rec = {
      id: String(e['מזהה אירוע'] || ''), t: (d instanceof Date) ? d.toISOString() : String(d || ''),
      type: String(e['סוג אירוע'] || ''), amount: (e['סכום'] === '' || e['סכום'] == null) ? '' : Number(e['סכום']),
      method: String(e['אמצעי תשלום'] || ''), ref: String(e['אסמכתא'] || ''),
      until: String(e['בתוקף עד (אחרי)'] instanceof Date ? e['בתוקף עד (אחרי)'].toISOString() : (e['בתוקף עד (אחרי)'] || '')),
      by: String(e['בוצע ע"י'] || ''), note: String(e['הערה'] || '')
    };
    (out[id] = out[id] || []).push(rec);
  });
  Object.keys(out).forEach(function (id) {
    out[id].sort(function (a, b) { return a.t < b.t ? -1 : (a.t > b.t ? 1 : 0); });
    if (out[id].length > GYM_LOG_FS_MAX) out[id] = out[id].slice(out[id].length - GYM_LOG_FS_MAX);
  });
  return out;
}

/** שורת מכון → מסמך, רשימת היתר בלבד + גשר הזהות. schema 2 = כולל הצהרה ויומן. */
function gymMemberDoc_(row, who, events, qLabels) {
  var doc = { familyId: (who && who.familyId) || '', uid: (who && who.uid) || '', slot: (who && who.slot) || 0,
              schema: 2, updatedAt: new Date() };
  GYM_MEMBER_FS_FIELDS.forEach(function (k) { doc[k] = gymFsDate_(row[k]); });
  GYM_MEMBER_FS_EXTRA.forEach(function (k) { doc[k] = gymFsDate_(row[k]); });
  (qLabels || []).forEach(function (k) { if (GYM_MEMBER_FS_FIELDS.indexOf(k) === -1) doc[k] = gymFsDate_(row[k]); });
  doc.log = events || [];
  return doc;
}

function gymMembersSyncAll_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var out = { wrote: 0, deleted: 0, skipped: 0 };
  var idx = gymResidentIndex_(ss);
  var logs = gymLogByMember_(ss), ql = gymQuestionLabels_(ss);
  var items = readTable_(ss, GYM_SHEET).map(function (row) {
    var id = String(row['מזהה'] || '').trim();
    return { id: id,
             doc: gymMemberDoc_(row, idx[normalizeEmail_(String(row['אימייל'] || ''))], logs[id], ql) };
  });
  var live = {};
  fsWriteAll_(FS_GYM_MEMBERS, items, out, live);
  fsSweepOrphans_(FS_GYM_MEMBERS, live, out);
  return out;
}

/** מסלולים/תקנון/שאלות + הגדרות. ⚠️ קוד הכניסה לא נכתב לשום מסמך כאן. */
function gymConfigSync_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var cfg = readGymSettings_(ss);
  var pub = {
    plans: cfg.plans.filter(function (p) { return p.active; }),
    rules: cfg.rules.filter(function (r) { return r.active; }),
    questions: cfg.questions.filter(function (q) { return q.active; }),
    hasEntryCode: !!String(cfg.settings['קוד כניסה'] || '').trim(),
    schema: 1, updatedAt: new Date()
  };
  Object.keys(GYM_PUBLIC_SETTINGS).forEach(function (k) {
    var v = cfg.settings[k];
    pub[GYM_PUBLIC_SETTINGS[k]] = (k === 'קישור פייבוקס') ? String(v || '').trim() : (Number(v) || 0);
  });
  if (!pub.renewDaysBefore) pub.renewDaysBefore = 30;
  if (!pub.declarationMonths) pub.declarationMonths = 24;
  if (!pub.minAge) pub.minAge = 18;
  var settings = {};
  Object.keys(cfg.settings).forEach(function (k) { if (k !== 'קוד כניסה') settings[k] = cfg.settings[k]; });
  fsSet_(fsDocPath_(FS_GYM_CONFIG, 'public'), pub);
  fsSet_(fsDocPath_(FS_GYM_CONFIG, 'admin'), {
    settings: settings, plans: cfg.plans, questions: cfg.questions, rules: cfg.rules,
    hasEntryCode: pub.hasEntryCode, schema: 1, updatedAt: new Date()
  });
  return { ok: true };
}

/** המנויים של אימייל אחד → gymMembers (מיד אחרי פעולה). */
function gymMembersSyncEmail_(ss, email) {
  var em = normalizeEmail_(email);
  if (!em) return 0;
  var who = gymResidentIndex_(ss)[em] || null;
  var logs = gymLogByMember_(ss), ql = gymQuestionLabels_(ss);
  var n = 0;
  readTable_(ss, GYM_SHEET).forEach(function (row) {
    if (normalizeEmail_(String(row['אימייל'] || '')) !== em) return;
    var id = String(row['מזהה'] || '').trim();
    if (!fsIdOk_(id)) return;
    fsSet_(fsDocPath_(FS_GYM_MEMBERS, id), gymMemberDoc_(row, who, logs[id], ql));
    n++;
  });
  return n;
}

/** שלב שעתי — רשת הביטחון לעריכה ידנית בגיליון. */
function gymFsHourly_(ss) {
  var out = {};
  try { out.members = gymMembersSyncAll_(ss); } catch (e) { out.membersError = String(e); }
  try { gymConfigSync_(ss); out.config = true; } catch (e) { out.configError = String(e); }
  return out;
}
