#!/usr/bin/env node
/* tools/stamp-versions.js — גרסה לכל קובץ (3.10.2026)
   ================================================================
   מה הקובץ הזה עושה, בשפה פשוטה:

   עד היום היה מספר גרסה *אחד* (?v=20261002e) על כל ~100 הקבצים של
   האפליקציה. נגעת בקובץ אחד — וכל טלפון הוריד מחדש את כולם (כ-1.2MB
   דחוס) ומחק את כל המטמון. היו ~60 דיפלויים בשבועיים.

   מעכשיו לכל קובץ יש "טביעת אצבע" משלו, שמחושבת מהתוכן שלו (10 תווים
   של md5). קובץ שלא השתנה שומר על אותה טביעת אצבע, ולכן הדפדפן לא
   מוריד אותו שוב. הסקריפט:

     1. עובר על index.html ומחליף את ה-?v= של כל קובץ מקומי בטביעת
        האצבע של אותו קובץ.
     2. כותב את הרשימה המלאה (קובץ → גרסה) לתוך service-worker.js,
        בין הסמנים @@ASSET_VERSIONS_START@@ / @@ASSET_VERSIONS_END@@,
        כדי שה-service worker ימחק מהמטמון רק מה שבאמת התחלף.
     3. קובע את VERSION ב-service-worker.js לטביעת אצבע של הרשימה
        כולה — כך ה-service worker משתנה בכל דיפלוי שבו משהו השתנה,
        והדפדפן יודע שיש עדכון.

   איך משתמשים:
     node tools/stamp-versions.js          ← לפני כל קומיט
     node tools/stamp-versions.js --resolve← אחרי מיזוג עם התנגשות בקבצי הגרסאות
     node tools/stamp-versions.js --check  ← רק בודק, לא כותב. יוצא
                                              עם שגיאה אם משהו לא
                                              מעודכן (הבדיקות מריצות)

   ⚠️ מה *לא* משתנה: pwa.js ממשיך לגזור את כתובת ה-service worker
   מה-?v= של התג שלו-עצמו (ר' currentClientVersion_ שם). הכתובת הזאת
   משתנה רק כש-pwa.js עצמו משתנה — וזה בסדר: הדפדפן בודק את *תוכן*
   ה-service worker בכל פתיחה, ו-VERSION שבפנים זז בכל דיפלוי.

   ⚠️ קבצים חיצוניים (Google Fonts, GSI) לא נוגעים בהם — אין להם ?v=.  */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SW = path.join(ROOT, 'service-worker.js');
const START = '/* @@ASSET_VERSIONS_START@@ */';
const END = '/* @@ASSET_VERSIONS_END@@ */';
const HASH_LEN = 10;
/* (3.10.2026) גם קבצי הטעינה-לפי-דרישה: js/lazyManifest.js מחזיק "נתיב?v=" לכל
   קובץ בקבוצות. הם מוטבעים כאן בדיוק כמו index.html, ונכנסים ל-ASSET_VERSIONS
   כדי שה-service worker לא יחשוב שהם יתומים. המניפסט עצמו נטען מ-index.html,
   ולכן טביעת האצבע שלו מחושבת מהטקסט *אחרי* ההטבעה. */
const MANIFEST = 'js/lazyManifest.js';
const MAN_RE = /"((?:js|css)\/[^"?]+)\?v=([^"]*)"/g;

function fileHash(abs) {
  return crypto.createHash('md5').update(fs.readFileSync(abs)).digest('hex').slice(0, HASH_LEN);
}

/* כל (src|href)="<נתיב מקומי>?v=<משהו>" ב-index.html. נתיב מקומי = לא
   מתחיל ב-http/https/‎//. מחזיר רשימה מסודרת לפי מיקום בקובץ. */
const TAG_RE = /\b(src|href)="([^"?#]+)\?v=([^"&#]*)"/g;

function collect(indexHtml) {
  const out = [];
  let m;
  while ((m = TAG_RE.exec(indexHtml)) !== null) {
    const p = m[2];
    if (/^(https?:)?\/\//i.test(p)) continue;
    out.push({ attr: m[1], path: p, v: m[3], index: m.index, raw: m[0] });
  }
  return out;
}

/* מחשב את המצב הרצוי: לכל נתיב — טביעת אצבע; ואת ה-VERSION הכולל. */
function collectManifest(txt) {
  const out = [];
  let m;
  const re = new RegExp(MAN_RE.source, 'g');
  while ((m = re.exec(txt)) !== null) out.push({ path: m[1], v: m[2], index: m.index, raw: m[0] });
  return out;
}
function renderManifest(txt, versions) {
  return txt.replace(new RegExp(MAN_RE.source, 'g'), function (whole, p) {
    return versions[p] === undefined ? whole : '"' + p + '?v=' + versions[p] + '"';
  });
}
function strHash(txt) {
  return crypto.createHash('md5').update(txt, 'utf8').digest('hex').slice(0, HASH_LEN);
}

function compute(root) {
  root = root || ROOT;
  const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const refs = collect(indexHtml);
  const versions = {};
  const missing = [];
  // 1) המניפסט: טביעות האצבע של הקבצים שבתוכו, והטקסט שלו אחרי ההטבעה
  const manPath = path.join(root, MANIFEST);
  const manifestTxt = fs.existsSync(manPath) ? fs.readFileSync(manPath, 'utf8') : '';
  const manRefs = manifestTxt ? collectManifest(manifestTxt) : [];
  manRefs.forEach(function (r) {
    if (versions[r.path] !== undefined) return;
    const abs = path.join(root, r.path);
    if (!fs.existsSync(abs)) { missing.push(r.path); return; }
    versions[r.path] = fileHash(abs);
  });
  const manifestOut = manifestTxt ? renderManifest(manifestTxt, versions) : '';
  // 2) index.html — המניפסט עצמו לפי הטקסט המוטבע, השאר מהדיסק
  refs.forEach(function (r) {
    if (versions[r.path] !== undefined) return;
    if (r.path === MANIFEST) { if (manifestTxt) versions[r.path] = strHash(manifestOut); else missing.push(r.path); return; }
    const abs = path.join(root, r.path);
    if (!fs.existsSync(abs)) { missing.push(r.path); return; }
    versions[r.path] = fileHash(abs);
  });
  const keys = Object.keys(versions).sort();
  const manifest = keys.map(function (k) { return k + '=' + versions[k]; }).join('\n');
  const overall = crypto.createHash('md5').update(manifest).digest('hex').slice(0, HASH_LEN);
  return { refs: refs, versions: versions, keys: keys, overall: overall, missing: missing, indexHtml: indexHtml,
           manRefs: manRefs, manifestTxt: manifestTxt, manifestOut: manifestOut };
}

function renderIndex(indexHtml, versions) {
  return indexHtml.replace(TAG_RE, function (whole, attr, p, v) {
    if (/^(https?:)?\/\//i.test(p)) return whole;
    if (versions[p] === undefined) return whole;
    return attr + '="' + p + '?v=' + versions[p] + '"';
  });
}

function renderSwBlock(versions, keys) {
  const lines = keys.map(function (k) { return '  ' + JSON.stringify(k) + ': ' + JSON.stringify(versions[k]); });
  return START + '\n' +
    '/* נוצר אוטומטית ע"י tools/stamp-versions.js — לא לערוך ידנית. */\n' +
    'var ASSET_VERSIONS = {\n' + lines.join(',\n') + '\n};\n' +
    END;
}

function renderSw(sw, versions, keys, overall) {
  const s = sw.indexOf(START), e = sw.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    throw new Error('service-worker.js: חסרים הסמנים ' + START + ' / ' + END);
  }
  let out = sw.slice(0, s) + renderSwBlock(versions, keys) + sw.slice(e + END.length);
  if (!/var VERSION = "[0-9a-z]+";/.test(out)) throw new Error('service-worker.js: לא נמצא var VERSION = "..."');
  /* (3.10.2026) אחרי מיזוג "union" (ר' .gitattributes) ייתכנו שתי שורות VERSION —
     משאירים אחת בלבד עם הערך הנכון. */
  let seen = false;
  out = out.replace(/^[ \t]*var VERSION = "[0-9a-z]+";[ \t]*\r?\n?/gm, function () {
    if (seen) return '';
    seen = true;
    return 'var VERSION = "' + overall + '";\n';
  });
  return out;
}

/* מחזיר רשימת בעיות (ריקה = הכול מעודכן). */
function check(root) {
  root = root || ROOT;
  const c = compute(root);
  const problems = [];
  c.missing.forEach(function (p) { problems.push('קובץ שמופיע ב-index.html לא קיים: ' + p); });
  c.refs.forEach(function (r) {
    const want = c.versions[r.path];
    if (want !== undefined && r.v !== want) problems.push('index.html: ' + r.path + ' נושא ?v=' + r.v + ' אבל התוכן הוא ' + want);
  });
  c.manRefs.forEach(function (r) {
    const want = c.versions[r.path];
    if (want !== undefined && r.v !== want) problems.push(MANIFEST + ': ' + r.path + ' נושא ?v=' + r.v + ' אבל התוכן הוא ' + want);
  });
  const sw = fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  let expectedSw;
  try { expectedSw = renderSw(sw, c.versions, c.keys, c.overall); }
  catch (err) { problems.push(err.message); return problems; }
  if (expectedSw !== sw) {
    const mv = sw.match(/var VERSION = "([0-9a-z]+)";/);
    if (!mv || mv[1] !== c.overall) problems.push('service-worker.js: VERSION הוא ' + (mv ? mv[1] : '?') + ' אבל צריך להיות ' + c.overall);
    else problems.push('service-worker.js: רשימת ASSET_VERSIONS לא תואמת ל-index.html');
  }
  return problems;
}

function stamp(root) {
  root = root || ROOT;
  const c = compute(root);
  if (c.missing.length) {
    throw new Error('קבצים שמופיעים ב-index.html ולא קיימים בדיסק:\n  ' + c.missing.join('\n  '));
  }
  if (c.manifestTxt && c.manifestOut !== c.manifestTxt) fs.writeFileSync(path.join(root, MANIFEST), c.manifestOut);
  const newIndex = renderIndex(c.indexHtml, c.versions);
  const swPath = path.join(root, 'service-worker.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  const newSw = renderSw(sw, c.versions, c.keys, c.overall);
  const changed = [];
  c.refs.concat(c.manRefs).forEach(function (r) {
    if (c.versions[r.path] !== undefined && r.v !== c.versions[r.path] && changed.indexOf(r.path) === -1) changed.push(r.path);
  });
  if (newIndex !== c.indexHtml) fs.writeFileSync(path.join(root, 'index.html'), newIndex);
  if (newSw !== sw) fs.writeFileSync(swPath, newSw);
  return { changed: changed, overall: c.overall, total: c.keys.length, wroteIndex: newIndex !== c.indexHtml, wroteSw: newSw !== sw };
}

module.exports = { compute: compute, check: check, stamp: stamp, collect: collect, collectManifest: collectManifest, renderIndex: renderIndex, renderSw: renderSw, START: START, END: END, MANIFEST: MANIFEST };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.indexOf('--check') !== -1) {
    const problems = check();
    if (problems.length) {
      console.error('✗ הגרסאות לא מעודכנות. הרץ: node tools/stamp-versions.js');
      problems.forEach(function (p) { console.error('  - ' + p); });
      process.exit(1);
    }
    console.log('✓ כל ה-?v= ב-index.html ו-service-worker.js מעודכנים (' + compute().keys.length + ' קבצים, VERSION ' + compute().overall + ')');
    process.exit(0);
  }
  /* --resolve: אחרי מיזוג שנעצר עם התנגשות רק בקבצי הגרסאות — לוקח את הצד
     המקומי (HEAD) בקבצים האלה וחותם מחדש. מותר רק לקבצים שנוצרים אוטומטית. */
  if (args.indexOf('--resolve') !== -1) {
    ['index.html', 'service-worker.js', MANIFEST].forEach(function (f) {
      const abs = path.join(ROOT, f);
      if (!fs.existsSync(abs)) return;
      const t = fs.readFileSync(abs, 'utf8');
      const r = t.replace(/^<<<<<<< [^\n]*\n([\s\S]*?)^=======\n[\s\S]*?^>>>>>>> [^\n]*\n/gm, '$1');
      if (r !== t) { fs.writeFileSync(abs, r); console.log('• נפתרה התנגשות ב-' + f); }
    });
  }
  try {
    const r = stamp();
    if (!r.changed.length && !r.wroteSw) {
      console.log('✓ אין שינוי — ' + r.total + ' קבצים כבר מעודכנים (VERSION ' + r.overall + ')');
    } else {
      console.log('✓ עודכנו ' + r.changed.length + ' מתוך ' + r.total + ' קבצים. VERSION חדש: ' + r.overall);
      r.changed.forEach(function (p) { console.log('  • ' + p); });
      console.log('עכשיו: קומיט של index.html + service-worker.js יחד עם הקבצים ששינית.');
    }
  } catch (err) {
    console.error('✗ ' + err.message);
    process.exit(1);
  }
}
