/* מד היוקר של כללי Firestore — שומר מפני חזרה של תקלת 4.10.26
   (תקרת 1,000 הביטויים: Firestore דוחה בקשה יקרה מדי כאילו אין הרשאה).
   הרצה:  node tools/test-rules-cost.js
   כלל שהתייקר בכוונה: `node tools/rules-cost.js --update-baseline` ולקמט את הבסיס. */
const fs = require('fs');
const RC = require('./rules-cost.js');
let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + x : '')));

const rows = RC.measure(fs.readFileSync(RC.RULES_PATH, 'utf8'));
const base = JSON.parse(fs.readFileSync(RC.BASELINE_PATH, 'utf8'));
const ic = RC.identityCosts(fs.readFileSync(RC.RULES_PATH, 'utf8'));

console.log('\n1. פונקציות הזהות — isMember אחת לכל אחת');
['isSuper', 'hasPerm', 'myFamilyId', 'isAdminUser', 'isInternalAdmin', 'gtMgr'].forEach(f => {
  ok(f + ' מעריכה את isMember פעם אחת', ic[f] && ic[f].ids === 1, JSON.stringify(ic[f]));
});
ok('isMember עצמה לא התייקרה מעבר ל-70 (היתה 88 לפני 4.10)', ic.isMember.tokens <= 70, ic.isMember.tokens);

console.log('\n2. תקרות קשיחות לכל כלל (מקרה גרוע)');
const over = rows.filter(r => r.ids > RC.MAX_IDS || r.tokens > RC.MAX_TOKENS);
ok('אף כלל לא עובר ' + RC.MAX_IDS + ' הערכות isMember או ' + RC.MAX_TOKENS + ' ביטויים', over.length === 0,
   over.map(r => r.tokens + '/' + r.ids + ' ' + r.key).join(' | '));

console.log('\n3. אין כלל שהתייקר מעבר לבסיס (+5%) בלי עדכון בסיס מודע');
const worse = rows.filter(r => base[r.key] && (r.ids > base[r.key].ids || r.tokens > base[r.key].tokens * 1.05));
ok('אין התייקרות', worse.length === 0,
   worse.map(r => r.key + ' ' + base[r.key].tokens + '→' + r.tokens + ' / ' + base[r.key].ids + '→' + r.ids).join(' | '));
const fresh = rows.filter(r => !base[r.key]);
ok('כל כלל מופיע בבסיס (כלל חדש/ששונה → לעדכן בסיס)', fresh.length === 0, fresh.map(r => r.key).join(' | '));

console.log('\n' + (fail ? '✗ ' + fail + ' נכשלו, ' : '') + pass + ' עברו');
process.exit(fail ? 1 : 0);
