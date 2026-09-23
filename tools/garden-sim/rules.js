/* פורט 1:1 של כללי האבטחה של הגינון (firestore.rules, 22.9 ערב) ל-JS,
 * כדי שהסימולציה תיכשל בדיוק היכן ש-Firestore האמיתי היה נכשל.
 * ctx = { uid, members, store, now, before, after, coll, id, query }
 */
'use strict';

const GP_FIELDS = ['id','title','category','areas','freq','firstWeek','weekOfMonth','months','rotate','clause','active','note','effectiveFrom','order','schema','updatedAt'];
const GT_FIELDS = ['id','kind','templateId','title','category','area','x','y','stage','flag','closure','week','due','note','drags','firstWeek','createdAt','updatedAt','approvedBy','approvedAt','repId','photos','order','year','schema','syncedAt','pendingDelete','familyId','mergedReps','openedBy','openedUid','desc','place','reporter','workPhotos'];
const GT_TEAM_ONLY = ['flag','closure','week','due','note','drags','approvedBy','approvedAt','openedBy','openedUid','workPhotos'];
const GT_TEAM_UPDATE = ['stage','flag','closure','week','due','note','drags','firstWeek','title','category','area','x','y','approvedBy','approvedAt','repId','photos','order','updatedAt','syncedAt','notify','notifyPending','notifyNote','mergedReps','desc','place','workPhotos'];
const GR_CREATE_FIELDS = ['id','familyId','date','category','area','title','desc','place','x','y','photos','taskId','clientRef','mailPending','photosExpected','photosIncomplete','year','schema','updatedAt'];
const GR_TEAM_FIELDS = ['stage','flag','closure','closeWhy','mergedInto','feedback','feedbackUntil','canFeedback','workPhotos'];
const GR_TEAM_UPDATE = ['stage','flag','closure','closeWhy','mergedInto','taskId','canFeedback','feedbackUntil','photos','photosIncomplete','updatedAt','workPhotos'];
const GL_FIELDS = ['taskId','kind','field','from','to','actorUid','note','at','schema','familyId','who','role'];
/* 23.9 — סוג ההחזרה ירד (מרכז ההתראות, תיקון דחוף 2). */
const GL_RESIDENT_KINDS = ['נפתח','שיבוץ','גרירה','הערה','ביטול ביצוע','ביצוע','סגירה','משוב'];
const CLOSURES = ['בוצע','הועבר לבינוי','בוטל','לא רלוונטי','אוחד'];
const NOTIFY = ['GARDEN_COMPLETED','GARDEN_REPORT_DECLINED','GARDEN_PLANNED','GARDEN_REOPENED','GARDEN_REPORT_MERGED','GARDEN_RESCHEDULED','GARDEN_STATUS_NOTE',
  /* 23.9 — מרכז ההתראות */ 'GARDEN_FINAL_CHECK','GARDEN_PENDING_REVIEW','GARDENER_TASK_RETURNED','GARDEN_RECHECK_DONE'];

const isInt = v => typeof v === 'number' && Number.isInteger(v);
const isStr = v => typeof v === 'string';
const isNum = v => typeof v === 'number' && isFinite(v);
const isTs  = v => v instanceof Date;
const hasOnly = (keys, allowed) => keys.every(k => allowed.includes(k));
const hasAll  = (keys, need) => need.every(k => keys.includes(k));
const hasAny  = (keys, some) => some.some(k => keys.includes(k));
const get = (d, f, dflt) => (d && Object.prototype.hasOwnProperty.call(d, f)) ? d[f] : dflt;

function affectedKeys(before, after) {
  const ks = new Set();
  Object.keys(after || {}).forEach(k => { if (!(k in before) || JSON.stringify(before[k]) !== JSON.stringify(after[k])) ks.add(k); });
  Object.keys(before || {}).forEach(k => { if (!(k in after)) ks.add(k); });
  return [...ks];
}

function make(ctx) {
  const m = () => ctx.members[ctx.uid];
  const signedIn = () => !!ctx.uid;
  const memberExists = () => signedIn() && !!m();
  const isMember = () => memberExists() && m().active === true;
  const isSuper = () => isMember() && (m().perms || []).includes('על');
  const hasPerm = p => isMember() && (isSuper() || (m().perms || []).includes(p));
  const myFamilyId = () => isMember() ? m().familyId : '';
  const notExt = () => isMember() && m().isExternal === false;
  const exists = (coll, id) => !!(ctx.store[coll] && ctx.store[coll][id]);
  const getDoc = (coll, id) => { const d = ctx.store[coll] && ctx.store[coll][id]; if (!d) throw new Error('get(): missing ' + coll + '/' + id); return d; };
  const B = ctx.before || {}, A = ctx.after || {};
  const keysA = Object.keys(A);
  const aff = () => affectedKeys(B, A);
  const nx = f => get(A, f, ''), cu = f => get(B, f, '');

  const rules = {
    /* ---- תוכנית ---- */
    canSeePlan: () => hasPerm('גינון') && m().isExternal === false,
    gpShapeOk: () => hasOnly(keysA, GP_FIELDS) && hasAll(keysA, ['id','title','freq','schema']) &&
      isStr(A.title) && A.title.length > 0 && A.title.length <= 80 &&
      ['שבועי','דו-שבועי','חודשי','שנתי'].includes(A.freq) &&
      (A.freq !== 'דו-שבועי' || get(A, 'firstWeek', '') !== '') && isInt(A.schema),
    gpWriteOk: () => hasPerm('גינון') && m().isExternal === false,

    /* ---- משימות ---- */
    canSeeGardenTasks: () => hasPerm('גינון'),
    /* 📷 23.9 — gtWorkPhotosOk: רשימה, עד 40. */
    gtWorkPhotosOk: () => Array.isArray(get(A, 'workPhotos', [])) && get(A, 'workPhotos', []).length <= 40,
    gtShapeOk: () => hasOnly(keysA, GT_FIELDS) && hasAll(keysA, ['id','title','stage','schema']) && isStr(A.title) && A.title.length > 0 && isInt(A.schema) && rules.gtWorkPhotosOk(),
    gtFromReportOk: () => notExt() && rules.gtShapeOk() && A.stage === 'התקבל' && !hasAny(keysA, GT_TEAM_ONLY),
    gtOpenedOk: () => (get(A, 'openedUid', '') === '' || get(A, 'openedUid', '') === ctx.uid) && ['', 'מנהל', 'גנן'].includes(get(A, 'openedBy', '')),
    gtTeamCreateOk: () => hasPerm('גינון') && rules.gtShapeOk() && rules.gtOpenedOk(),
    gtTeamUpdateOk: () => hasPerm('גינון') && hasOnly(aff(), GT_TEAM_UPDATE) && rules.gtWorkPhotosOk(),
    gtMgr: () => hasPerm('גינון') && m().isExternal === false,
    gtClosureValueOk: () => nx('closure') === '' || CLOSURES.includes(nx('closure')),
    gtClosureAuthOk: () => nx('closure') === cu('closure') || nx('closure') === '' || nx('closure') === 'בוצע' || nx('closure') === 'אוחד' || rules.gtMgr(),
    gtCloseNoteOk: () => nx('closure') === '' || nx('closure') === cu('closure') || cu('repId') === '' || nx('note') !== '',
    gtWithinDispute: () => !isTs(get(B, 'approvedAt', null)) || ctx.now < new Date(B.approvedAt.getTime() + 14 * 86400000),
    gtClosedOk: () => cu('closure') === '' || rules.gtMgr() || hasOnly(aff(), ['flag','updatedAt']) || hasOnly(aff(), ['workPhotos','updatedAt']) || (cu('closure') === 'בוצע' && nx('closure') === '' && rules.gtWithinDispute()),
    gtNotifyOk: () => nx('notify') === '' || NOTIFY.includes(nx('notify')),
    /* 23.9 — gtNotifyMgrOnlyOk: שתי הודעות שהן החלטת מנהל. */
    gtNotifyMgrOnlyOk: () => rules.gtMgr() || !['GARDEN_RECHECK_DONE', 'GARDENER_TASK_RETURNED'].includes(nx('notify')),
    gtUpdateOk: () => rules.gtTeamUpdateOk() && rules.gtClosureValueOk() && rules.gtClosureAuthOk() && rules.gtCloseNoteOk() && rules.gtClosedOk() && rules.gtNotifyOk() && rules.gtNotifyMgrOnlyOk(),
    gtPendingDeleteOk: () => rules.gtMgr() && hasOnly(aff(), ['pendingDelete','updatedAt']) && A.pendingDelete === true,
    gtReportPhotosOk: () => notExt() && isStr(B.repId) && B.repId !== '' && hasOnly(aff(), ['photos','updatedAt']) && getDoc('gardenReports', B.repId).familyId === myFamilyId(),
    gtDeleteOk: () => hasPerm('גינון') && m().isExternal === false,
    gtOrphanCleanupOk: () => notExt() && B.stage === 'התקבל' && get(B, 'repId', '') !== '' && !exists('gardenReports', B.repId),
    gtReportFlagOk: () => notExt() && get(B, 'repId', '') !== '' && hasOnly(aff(), ['flag','updatedAt']) && A.flag === 'דורש בדיקה חוזרת' && getDoc('gardenReports', B.repId).familyId === myFamilyId(),

    /* ---- דיווחים ---- */
    canSeeGardenReport: fid => notExt() && isStr(fid) && fid !== '' && fid === myFamilyId(),
    grShapeOk: () => hasOnly(keysA, GR_CREATE_FIELDS) && hasAll(keysA, ['id','familyId','title','category','schema']) && !hasAny(keysA, GR_TEAM_FIELDS) &&
      isStr(A.familyId) && A.familyId !== '' && isStr(A.title) && A.title.length > 0 && A.title.length <= 60 && isStr(A.category) && A.category !== '' && isInt(A.schema) &&
      (!keysA.includes('mailPending') || typeof A.mailPending === 'boolean'),
    grPlaceOk: () => (get(A,'x',null) == null && get(A,'y',null) == null && get(A,'place','') !== '') || (isNum(get(A,'x',null)) && isNum(get(A,'y',null)) && A.x >= 0 && A.x <= 1 && A.y >= 0 && A.y <= 1),
    grCreateOk: () => notExt() && A.familyId === myFamilyId() && rules.grShapeOk() && rules.grPlaceOk(),
    grFeedbackOk: () => notExt() && B.familyId === myFamilyId() && hasOnly(aff(), ['feedback','feedbackNote','feedbackAt','updatedAt']) && B.canFeedback === true && (get(B,'feedbackUntil',0) === 0 || ctx.now.getTime() <= get(B,'feedbackUntil',0)),
    grPhotosOk: () => notExt() && B.familyId === myFamilyId() && hasOnly(aff(), ['photos','photosIncomplete','updatedAt']),
    grTeamUpdateOk: () => hasPerm('גינון') && hasOnly(aff(), GR_TEAM_UPDATE) && rules.gtWorkPhotosOk(),

    /* ---- יומן ---- */
    /* 22.9 — חותם שורת יומן: role נאכף מול מסמך החבר. */
    glRoleOk: () => isStr(get(A,'who','')) && get(A,'who','').length <= 60 &&
      (nx('role') === '' || nx('role') === 'תושב' ||
       (nx('role') === 'גנן' && m().isExternal === true) ||
       (nx('role') === 'מנהל' && m().isExternal === false && hasPerm('גינון'))),
    glCreateOk: () => hasPerm('גינון') && rules.glRoleOk() && hasOnly(keysA, GL_FIELDS) && hasAll(keysA, ['taskId','actorUid','at']) && A.actorUid === ctx.uid,
    glResidentCreateOk: () => notExt() && rules.glRoleOk() && hasOnly(keysA, GL_FIELDS) && hasAll(keysA, ['taskId','actorUid','at']) && A.actorUid === ctx.uid && (nx('familyId') === '' || nx('familyId') === myFamilyId()) && (A.kind === 'נפתח' || A.kind === 'משוב'),
    glResidentReadOk: d => isMember() && myFamilyId() !== '' && get(d,'familyId','') === myFamilyId() && GL_RESIDENT_KINDS.includes(get(d,'kind','')),

    counterBumpOk: () => isMember() && hasOnly(aff(), ['n','updatedAt']) && isInt(A.n) && A.n === B.n + 1,
    isMember, hasPerm, myFamilyId
  };
  return rules;
}

/* op: 'get' | 'list' | 'create' | 'update' | 'delete'. מחזיר {ok, why}. */
function check(ctx) {
  const r = make(ctx);
  const c = ctx.coll, op = ctx.op, B = ctx.before || {};
  const T = (cond, why) => ({ ok: !!cond, why });
  try {
    if (c === 'gardenPlan') {
      if (op === 'get' || op === 'list') return T(r.canSeePlan(), 'canSeePlan');
      if (op === 'create' || op === 'update') return T(r.gpWriteOk() && r.gpShapeOk(), 'gpWriteOk&&gpShapeOk');
      if (op === 'delete') return T(r.gpWriteOk(), 'gpWriteOk');
    }
    if (c === 'gardenTasks') {
      if (op === 'get' || op === 'list') return T(r.canSeeGardenTasks(), 'canSeeGardenTasks');
      if (op === 'create') return T(r.gtTeamCreateOk() || r.gtFromReportOk(), 'gtTeamCreateOk||gtFromReportOk');
      if (op === 'update') {
        const parts = { gtUpdateOk: r.gtUpdateOk(), gtReportPhotosOk: safe(r.gtReportPhotosOk), gtReportFlagOk: safe(r.gtReportFlagOk), gtPendingDeleteOk: r.gtPendingDeleteOk() };
        const ok = Object.values(parts).some(Boolean);
        const why = ok ? Object.keys(parts).find(k => parts[k]) : 'update denied: ' + JSON.stringify({ team: r.gtTeamUpdateOk(), closureValue: r.gtClosureValueOk(), closureAuth: r.gtClosureAuthOk(), closeNote: r.gtCloseNoteOk(), closed: r.gtClosedOk(), notify: r.gtNotifyOk(), aff: affectedKeys(B, ctx.after) });
        return { ok, why };
      }
      if (op === 'delete') return T(r.gtDeleteOk() || r.gtOrphanCleanupOk(), 'gtDeleteOk||gtOrphanCleanupOk');
    }
    if (c === 'gardenReports') {
      if (op === 'get') return T(r.canSeeGardenReport(B.familyId), 'canSeeGardenReport');
      if (op === 'list') {
        /* שאילתה חייבת להיות מוכחת מהמסנן: familyId == שלי. */
        const q = ctx.query || [];
        const f = q.find(([k]) => k === 'familyId');
        return T(f && r.canSeeGardenReport(f[1]), 'query must filter familyId==mine');
      }
      if (op === 'create') return T(r.grCreateOk(), 'grCreateOk');
      if (op === 'update') return T(r.grFeedbackOk() || r.grPhotosOk() || r.grTeamUpdateOk(), 'grFeedbackOk||grPhotosOk||grTeamUpdateOk aff=' + JSON.stringify(affectedKeys(B, ctx.after)));
      if (op === 'delete') return T(false, 'delete:false');
    }
    if (c === 'gardenLog') {
      if (op === 'get') return T(r.gtMgr() || r.glResidentReadOk(B), 'gtMgr||glResidentReadOk');
      if (op === 'list') {
        if (r.gtMgr()) return T(true, 'gtMgr');
        const q = ctx.query || [];
        const f = q.find(([k]) => k === 'familyId');
        /* תושב: המסנן מוכיח familyId; אבל kind אינו במסנן — Firestore דוחה שאילתה
           שהכלל שלה תלוי בשדה שאינו מסונן. מדגמנים: מותר רק אם כל התוצאות עוברות. */
        if (!(f && f[1] === r.myFamilyId() && r.myFamilyId() !== '')) return T(false, 'query must filter familyId==mine');
        const rows = ctx.rows || [];
        return T(rows.every(d => r.glResidentReadOk(d)), 'row with non-resident kind in result');
      }
      if (op === 'create') return T(r.glCreateOk() || r.glResidentCreateOk(), 'glCreateOk||glResidentCreateOk');
      return T(false, 'update/delete:false');
    }
    if (c === 'counters') {
      if (op === 'get' || op === 'list') return T(r.isMember(), 'isMember');
      if (op === 'update') return T(r.counterBumpOk(), 'counterBumpOk');
      return T(false, 'create/delete:false');
    }
    if (c === 'gardenMeta' || c === 'appConfig') {
      if (op === 'get' || op === 'list') return T(r.isMember(), 'isMember');
      if (c === 'gardenMeta' && ctx.id === 'settings') {
        const keys = Object.keys(ctx.after || {});
        return T(r.canSeePlan() && hasOnly(keys, ['requireApproval','updatedAt','updatedBy']) && typeof (ctx.after || {}).requireApproval === 'boolean', 'gsSettingsWriteOk');
      }
      return T(false, 'write:false');
    }
    if (c === 'members') {
      if (op === 'get') return T(ctx.uid === ctx.id, 'own doc');
      return T(false, 'write:false');
    }
    return T(false, 'default deny');
  } catch (e) { return { ok: false, why: 'rule error: ' + e.message }; }
  function safe(fn) { try { return fn(); } catch (e) { return false; } }
}

module.exports = { check, affectedKeys, GL_RESIDENT_KINDS };
