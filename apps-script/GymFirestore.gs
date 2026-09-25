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
 *  ⛔ מה **לא** עובר, בכוונה (cba-hybrid-architecture, כלל 1):
 *     שם, אימייל, טלפון, ת.ז., תאריך לידה, מספר בית, תשובות השאלון ודגלי
 *     בריאות, תאריך חתימה, קישורי חתימה/אישור רופא, הערות מנהל (טקסט חופשי).
 *     הם נשארים בגיליון ומגיעים למסך הניהול מ-Apps Script ברקע, אחרי שהרשימה
 *     כבר על המסך (ר' js/data/gymFs.js).
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

/** שורת מכון → מסמך, רשימת היתר בלבד + גשר הזהות. */
function gymMemberDoc_(row, who) {
  var doc = { familyId: (who && who.familyId) || '', uid: (who && who.uid) || '', slot: (who && who.slot) || 0,
              schema: 1, updatedAt: new Date() };
  GYM_MEMBER_FS_FIELDS.forEach(function (k) { doc[k] = gymFsDate_(row[k]); });
  return doc;
}

function gymMembersSyncAll_(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();
  var out = { wrote: 0, deleted: 0, skipped: 0 };
  var idx = gymResidentIndex_(ss);
  var items = readTable_(ss, GYM_SHEET).map(function (row) {
    return { id: String(row['מזהה'] || '').trim(),
             doc: gymMemberDoc_(row, idx[normalizeEmail_(String(row['אימייל'] || ''))]) };
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
  var n = 0;
  readTable_(ss, GYM_SHEET).forEach(function (row) {
    if (normalizeEmail_(String(row['אימייל'] || '')) !== em) return;
    var id = String(row['מזהה'] || '').trim();
    if (!fsIdOk_(id)) return;
    fsSet_(fsDocPath_(FS_GYM_MEMBERS, id), gymMemberDoc_(row, who));
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
