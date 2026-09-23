/* ממצא 32 — חיווי לתושב + יומן מצטבר   (2026-09-22, ראש גל 3)
   הרצה:  node tools/test-finding32-timeline.js

   🔴 מה שהממצא באמת היה, ולמה הבדיקות כאן ולא במקום אחר:
     · **היומן המצטבר כבר היה קיים.** `gardenLog` ב-Firestore, מסמך
       לכל אירוע, `create` בלבד, `actorUid` נאכף. מה שחסר היה
       (א) שהתושב יוכל לקרוא אותו, ו-(ב) ששלוש פעולות ישברו את השתיקה.
     · **הגבול הוא שדה על המסמך.** כלל אבטחה פועל על מסמך שלם ואינו
       יודע להצטלב לאוסף אחר; `get()` על מסמך הדיווח היה עובד על
       מסמך בודד ו**נשבר בשאילתה** (מכסת עשר קריאות כלל). לכן שורת
       היומן נושאת `familyId` בעצמה — ובדיקה 2 שומרת על זה.
     · **מה ששובר בשקט:** שתי רשימות התבניות — בכללים ובשרת. שם
       שקיים רק בצד אחד = כתיבה שנדחית, או דגל שיורד בלי שיצא מייל.
       אף אחד מהשניים אינו מייצר שגיאה שמישהו רואה. זו בדיקה 1. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 300) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const GS = R('apps-script/Code.gs');
const RULES = R('firestore.rules');
const DS = R('js/data/dataService.js');
const RG = R('js/screens/resGarden.js');
const HTML = R('index.html');
const SW = R('service-worker.js');

section('1. 🔴 שתי רשימות התבניות מסכימות — הכשל השקט הקלאסי');
const srvList = (GS.match(/var GARDEN_TASK_TEMPLATES = \[([\s\S]*?)\];/) || [, ''])[1];
const ruleList = (RULES.match(/function gtNotifyOk\(\)[\s\S]*?\[([\s\S]*?)\]\.hasAny/) || [, ''])[1];
const names = s => (s.match(/'([A-Z_]+)'/g) || []).map(x => x.replace(/'/g, '')).sort();
const srv = names(srvList), rul = names(ruleList);
ok('רשימת השרת נמצאה', srv.length > 0, srvList);
ok('רשימת הכללים נמצאה', rul.length > 0, ruleList);
ok('🔴 והן זהות בדיוק', JSON.stringify(srv) === JSON.stringify(rul),
   'שרת: ' + srv.join(',') + '  |  כללים: ' + rul.join(','));
ok('GARDEN_RESCHEDULED בשתיהן', srv.includes('GARDEN_RESCHEDULED') && rul.includes('GARDEN_RESCHEDULED'));
ok('GARDEN_STATUS_NOTE בשתיהן', srv.includes('GARDEN_STATUS_NOTE') && rul.includes('GARDEN_STATUS_NOTE'));
ok('והוותיקות לא נמחקו בדרך',
   ['GARDEN_COMPLETED', 'GARDEN_REPORT_DECLINED', 'GARDEN_PLANNED',
    'GARDEN_REOPENED', 'GARDEN_REPORT_MERGED'].every(k => srv.includes(k) && rul.includes(k)));

section('2. 🔴 כללי האבטחה — familyId הוא הגבול');
const glCreate = (RULES.match(/function glCreateOk\(\)[\s\S]*?\n    \}/) || [''])[0];
const glRes = (RULES.match(/function glResidentCreateOk\(\)[\s\S]*?\n    \}/) || [''])[0];
const glRead = (RULES.match(/function glResidentReadOk\(\)[\s\S]*?\n    \}/) || [''])[0];
const glMatch = (RULES.match(/match \/gardenLog\/\{id\} \{[\s\S]*?\n    \}/) || [''])[0];
ok('familyId ברשימת השדות של הצוות', /'familyId',\s*'who',\s*'role'\]/.test(glCreate), glCreate);
ok('familyId ברשימת השדות של התושב', /'familyId',\s*'who',\s*'role'\]/.test(glRes), glRes);
ok('🔴 התושב יכול לחתום רק על המשפחה שלו',
   /glNext\('familyId'\) == myFamilyId\(\)/.test(glRes), glRes);
ok('⚠️ וריק עדיין מותר — שורה בלי משפחה אינה מגיעה לאיש',
   /glNext\('familyId'\) == '' \|\|/.test(glRes), glRes);
ok('התושב עדיין מוגבל ל"נפתח" ו"משוב" בלבד',
   /kind == 'נפתח'/.test(glRes) && /kind == 'משוב'/.test(glRes), glRes);
/* 22.9 — `gtMgr()` ולא `canSeeGardenTasks()`: הקבלן החיצוני אינו קורא יומן של
   משפחות (9eedb71). ההיסטוריה שלו מגיעה דרך Apps Script — ר' gardenTaskLogRead. */
ok('🔴 הקריאה נפתחה לתושב', /allow read: if gtMgr\(\) \|\| glResidentReadOk\(\)/.test(glMatch), glMatch);
ok('🔴🔴 ועם המשמר של המשפחה הריקה — המלכודת של canSeeFamilyTx',
   /myFamilyId\(\) != ''/.test(glRead), glRead);
ok('ההתאמה היא על השדה שעל המסמך עצמו, לא get() לאוסף אחר',
   /resource\.data\.get\('familyId', ''\) == myFamilyId\(\)/.test(glRead) && !/get\(\/databases/.test(glRead), glRead);
ok('🔴🔴 והיסטוריה עדיין אינה משתכתבת', /allow update, delete: if false/.test(glMatch), glMatch);

section('3. שורת היומן — מאיפה מגיע מזהה המשפחה');
const append = (DS.match(/function gardenLogAppend\(taskId, kind, note, opts\)[\s\S]*?\n  \}/) || [''])[0];
ok('gardenLogAppend מקבלת opts', !!append);
ok('🔴 שדה ריק אינו נכתב בכלל — ולא סוג פנימי',
   /if \(familyId && GARDEN_LOG_RESIDENT_KINDS\[String\(kind \|\| ""\)\]\)/.test(append), append);
ok('actorUid נשאר ה-uid של הכותב', /actorUid: uid/.test(append), append);
ok('opts.repId נפתר מול מסמך הדיווח', /readDoc\("gardenReports", repId/.test(append), append);
ok('⚠️ וזה קורה בתוך השגר-ושכח, לא במסלול הפעולה',
   append.indexOf('readDoc("gardenReports"') > append.indexOf('function write('), append);
ok('עשר פעולות המנהל מעבירות repId',
   /gardenLogAppend\(String\(id\), log\.kind, log\.note, \{ repId: cur\.repId, familyId: cur\.familyId \}\)/.test(DS));
ok('הגשת דיווח מעבירה את המשפחה של המגיש',
   /gardenLogAppend\(String\(taskId\), "נפתח", "דיווח תושב #" \+ repId, \{ familyId: fid, asResident: true \}\)/.test(DS));
ok('משוב מעביר את המשפחה של המגיב', /\{ familyId: \(\(\(window\.CBA && CBA\.user\) \|\| \{\}\)\.familyId \|\| ""\), asResident: true \}/.test(DS));
ok('⚠️ ואיחוד **לא** מעביר משפחה — בכוונה, הטקסט שלו נושא מזהים פנימיים',
   /gardenLogAppend\(childId, "איחוד", "אוחדה לתוך משימה #" \+ parentId\);/.test(DS));

section('4. 🔴 שלוש הפעולות ששתקו');
const task = (DS.match(/function gardenFsTask\(op, id, extra, cb\)[\s\S]*?\n  \}/) ||
              DS.match(/if \(op === "done"\)[\s\S]*?patch\.notifyNote/) || [''])[0];
ok('גרירה שולחת GARDEN_RESCHEDULED', /if \(isReport\) notify = "GARDEN_RESCHEDULED";/.test(DS), 'לא נמצא');
ok('🔴 שיבוץ ראשון נשאר GARDEN_PLANNED', /if \(!cur\.week\) notify = "GARDEN_PLANNED";/.test(DS));
ok('🔴 שיבוץ מחדש לשבוע אחר שולח שינוי מועד',
   /else if \(String\(cur\.week\) !== wk\) notify = "GARDEN_RESCHEDULED";/.test(DS));
ok('⚠️ ושיבוץ מחדש לאותו שבוע אינו שולח כלום',
   /String\(cur\.week\) !== wk/.test(DS));
/* 23.9 — מרכז ההתראות: הערה מגיעה לתושב רק כשסומן "לשלוח לתושב". */
ok('הערת סטטוס שולחת GARDEN_STATUS_NOTE — רק בסימון לתושב',
   /var toResident = isReport && note && extra\.toResident === true;/.test(DS) && /if \(toResident\) notify = "GARDEN_STATUS_NOTE";/.test(DS));
ok('⚠️ והערה ריקה אינה עדכון', /isReport && note && extra\.toResident/.test(DS));
ok('🔴 הערה בלי הסימון נרשמת כ"הערה פנימית" — מחוץ לקו הזמן של התושב',
   /kind: toResident \? "הערה" : "הערה פנימית"/.test(DS));
ok('🔴 כל השלוש מותנות בדיווח תושב ולא במשימת שגרה',
   (DS.match(/if \(isReport\) notify = "GARDEN_RESCHEDULED";/g) || []).length === 1 &&
   /if \(isReport\) \{\n          if \(!cur\.week\)/.test(DS));
ok('הדגל והתבנית עדיין נכתבים יחד', /patch\.notify = notify;\n        patch\.notifyPending = true;/.test(DS));

section('5. הקריאה של התושב — ובלי המלכודת של ממצא 02');
const read = (DS.match(/function gardenMyLogRead\(cb\)[\s\S]*?\n  \}/) || [''])[0];
ok('gardenMyLogRead קיימת', !!read);
ok('🔴 ממתינה ל-userReady לפני השאילתה', /CBA\.fb\.userReady \|\| CBA\.fb\.authReady/.test(read), read);
ok('🔴 וגם ל-ensureDb', /ensureDb\(function \(dbErr\)/.test(read), read);
ok('שואלת לפי familyId — הכלל דוחה שאילתה בלי המסנן',
   /queryCollection\("gardenLog", \[\["familyId", fid\]\]/.test(read), read);
ok('⚠️ ואין נפילה לאחור ל-Apps Script — אין שם פעולה כזאת לתושב',
   !/CBA\.sheets/.test(read), read);
ok('בלי משפחה — רשימה ריקה ולא שגיאה', /if \(!fid\) return cb\(\{ ok: true, rows: \[\] \}\)/.test(read), read);
ok('המיון בלקוח, בלי orderBy (אין אינדקס מורכב)',
   /gardenDateOf\(a\.at\) - gardenDateOf\(b\.at\)/.test(read) && !/orderBy/.test(read), read);
ok('חשופה כ-getMyGardenLog', /getMyGardenLog: gardenMyLogRead,/.test(DS));

section('6. 🔴 מה התושב רואה — והכרעת יועד על מה שלא');
const kinds = (RG.match(/var TL_KINDS = \{[\s\S]*?\n  \};/) || [''])[0];
ok('המילון קיים', !!kinds);
['נפתח', 'שיבוץ', 'גרירה', 'הערה', 'ביטול ביצוע', 'סגירה', 'משוב']
  .forEach(k => ok('גלוי: ' + k, kinds.includes('"' + k + '"'), kinds));
ok('🔴 חסימה אינה מוצגת — הכרעת יועד 22.9', !kinds.includes('"חסימה"'), kinds);
ok('🔴 דגל אינו מוצג — הכרעת יועד 22.9', !kinds.includes('"דגל"'), kinds);
ok('⚠️ איחוד אינו מוצג — הטקסט שלו נושא מזהי משימות פנימיים',
   !kinds.includes('"איחוד"'), kinds);
const tl = (RG.match(/function timeline\(r\)[\s\S]*?\n      \}/) || [''])[0];
ok('הבלוק מסנן גם לפי המילון וגם לפי המשימה',
   /TL_KINDS\[String\(x\.kind \|\| ""\)\]/.test(tl) && /String\(x\.taskId \|\| ""\) === tid/.test(tl), tl);
ok('⚠️ מתחת לשתי שורות לא מציג כלום', /if \(rows\.length < 2\) return "";/.test(tl), tl);
ok('כשל טעינה אומר "לא הצלחנו" ולא מציג כרטיס ריק',
   /gd-tl--err/.test(tl) && /לא הצלחנו לטעון את העדכונים/.test(tl), tl);
ok('🔑 והשורה המקופלת מראה את האירוע האחרון — כדי שגם מי שלא פותח יראה',
   /rows\[rows\.length - 1\]/.test(tl), tl);
ok('ההערה הגולמית אינה מוצגת כמות שהיא — השבוע מחולץ',
   /function tlText/.test(RG) && /function tlWeek/.test(RG));
ok('⚠️ וגם תאריך של Firestore Timestamp מוצג נכון',
   /typeof v\.toDate === "function"/.test(RG));

section('7. הטעינה אינה מאטה את המסך');
const load = (RG.match(/function load\(\) \{[\s\S]*?\n      \}/) || [''])[0];
ok('שתי הקריאות יוצאות יחד', /var gotReports = false, gotLog = false;/.test(load), load);
ok('והציור קורה פעם אחת, אחרי שתיהן', /function maybeDraw\(\) \{ if \(gotReports && gotLog\) draw\(\); \}/.test(load), load);
ok('🔴 כשל ביומן אינו מוחק את הדיווחים מהמסך',
   /logErr = !\(res && res\.ok\);/.test(load) && /loadErr = !\(res && res\.ok\);/.test(load), load);
ok('⚠️ לקוח ישן במטמון פשוט לא מצייר קו זמן',
   /if \(CBA\.data\.getMyGardenLog\)/.test(load), load);

section('8. השרת — התבנית מקבלת את מה שהיא צריכה');
/* 23.9 — הבנייה עברה ל-notifyGardenTask_ ב-Notify.gs (מרכז ההתראות). */
const NG = R('apps-script/Notify.gs');
const mail = (NG.match(/function notifyGardenTask_[\s\S]*?\n\}/) || [''])[0];
ok("{{עדכון}} קיים לתבנית הסטטוס", /'עדכון': note,/.test(mail), mail);
ok('{{שבוע}} עובר דרך מעצב התאריך', /'שבוע': gardenWeekLabel_\(t\.week\)/.test(mail), mail);
ok('gardenWeekLabel_ הופכת ISO לתאריך עברי', /function gardenWeekLabel_/.test(GS));
ok('⚠️ וערך שאינו ISO עובר כמו שהוא', /if \(!m\) return String\(w \|\| ''\);/.test(GS));
ok('🔑 השם והמיילים עדיין נשלפים בשרת לפי familyId — הקו האדום',
   /txFamilyNames_\(ss\)/.test(mail) && /r: \{ familyId: fam \}/.test(mail) && /emailsForFamilyId_\(ss, fam\)/.test(NG));

section('9. גרסה — אי-התאמה = דפדפנים מגישים JS ישן');
const swV = (SW.match(/var VERSION = "([^"]+)"/) || [, ''])[1];
const htmlV = [...new Set((HTML.match(/\?v=[0-9a-z]+/g) || []).map(x => x.slice(3)))];
ok('service-worker על ' + swV, !!swV);
ok('index.html מחזיק ערך אחד בלבד', htmlV.length === 1, htmlV.join(','));
ok('🔴 והם זהים', htmlV[0] === swV, htmlV[0] + ' מול ' + swV);
ok('והגרסה עלתה מעבר ל-20260921d', swV > '20260921d', swV);

section('10. התבניות עצמן — נכתבות לגיליון מעצמן');
const defs = (GS.match(/var DEFAULT_EMAIL_SETTINGS = \[[\s\S]*?\n\];/) || [''])[0];
ok('DEFAULT_EMAIL_SETTINGS נמצא', !!defs);
ok('🔴 GARDEN_RESCHEDULED מוגדרת', /\['GARDEN_RESCHEDULED',/.test(defs), 'חסר');
ok('🔴 GARDEN_STATUS_NOTE מוגדרת', /\['GARDEN_STATUS_NOTE',/.test(defs), 'חסר');
ok('⚠️ ולכן אין עבודה ידנית בגיליון — ensureEmailSettingsSheet_ מוסיפה מפתח חסר',
   /* 23.9 — מרכז ההתראות: עוד שורות (allDefaults), אותו עיקרון — רק מה שחסר. */
   /var toAdd = allDefaults\.filter\(function \(row\) \{\s*if \(existing\[row\[0\]\]\) return false;/.test(GS));
ok('שתיהן בתחום הגינון ופעילות', /\['GARDEN_RESCHEDULED',[\s\S]*?PERM_GARDEN, 'כן'\]/.test(defs) &&
   /\['GARDEN_STATUS_NOTE',[\s\S]*?PERM_GARDEN, 'כן'\]/.test(defs), defs.slice(0, 200));
ok('GARDEN_RESCHEDULED משתמשת ב-{{שבוע}}', /\['GARDEN_RESCHEDULED'[\s\S]*?\{\{שבוע\}\}/.test(defs));
ok('GARDEN_STATUS_NOTE משתמשת ב-{{עדכון}}', /\['GARDEN_STATUS_NOTE'[\s\S]*?\{\{עדכון\}\}/.test(defs));
ok('🔑 ושלוש הרשימות מכילות את שני השמות — גיליון, שרת, כללים',
   srv.includes('GARDEN_RESCHEDULED') && rul.includes('GARDEN_RESCHEDULED') &&
   /\['GARDEN_RESCHEDULED',/.test(defs) &&
   srv.includes('GARDEN_STATUS_NOTE') && rul.includes('GARDEN_STATUS_NOTE') &&
   /\['GARDEN_STATUS_NOTE',/.test(defs));

section('11. 🔴🔴 באג הייצור של המילים הדבוקות (חי מאז 21.9)');
ok('{{מה נעשה}} נושא את שורת הרווח שאחריו',
   /'מה נעשה': note \? note \+ '\\n\\n' : '',/.test(NG), 'לא תוקן');   // 23.9 — עבר ל-Notify.gs
ok('⚠️ והסמן בתבנית אכן צמוד לטקסט — זה מה שהפך את זה לבאג',
   /\{\{מה נעשה\}\}\{\{איחוד\}\}אם משהו/.test(GS));
ok('המסלול הישן בשרת עדיין עושה את אותו דבר — שני המסלולים מסכימים',
   /'מה נעשה': String\(note \|\| ''\)\.trim\(\) \? String\(note\)\.trim\(\) \+ '\\n\\n' : ''/.test(GS));

section('12. 🔴🔴 שלוש הרשימות של הסוגים הגלויים מסכימות');
/* הכלל אוכף · הלקוח נמנע מלכתחילה · המסך מצייר. שלושתם צריכים
   לומר את אותו דבר, ובדיקה אחת היא מה שהופך סטייה ביניהם לגלויה. */
const hebList = t => (t.match(/'([^']+)'/g) || []).map(x => x.replace(/'/g, '')).sort();
const ruleKinds = hebList((RULES.match(/function glResidentKinds\(\)[\s\S]*?\n    \}/) || [''])[0]);
const dsKindsBlk = (DS.match(/var GARDEN_LOG_RESIDENT_KINDS = \{[\s\S]*?\n  \};/) || [''])[0];
const dsKinds = (dsKindsBlk.match(/"([^"]+)":/g) || []).map(x => x.slice(1, -2)).sort();
const tlKindsArr = (kinds.match(/"([^"]+)":\s*\{/g) || []).map(x => x.slice(1, x.indexOf('"', 1))).sort();
ok('רשימת הכללים נמצאה', ruleKinds.length > 0, ruleKinds.join(','));
ok('רשימת הלקוח נמצאה', dsKinds.length > 0, dsKinds.join(','));
ok('🔴 הכלל והלקוח זהים בדיוק', JSON.stringify(ruleKinds) === JSON.stringify(dsKinds),
   'כללים: ' + ruleKinds.join(',') + '  |  לקוח: ' + dsKinds.join(','));
ok('🔴 ומה שהמסך מצייר הוא תת-קבוצה — לעולם לא רחב מהכלל',
   tlKindsArr.every(k => ruleKinds.includes(k)),
   'מסך: ' + tlKindsArr.join(',') + '  |  כללים: ' + ruleKinds.join(','));
['חסימה', 'דגל', 'איחוד'].forEach(k => ok('⚠️ "' + k + '" באף אחת מהשלוש',
   !ruleKinds.includes(k) && !dsKinds.includes(k) && !tlKindsArr.includes(k)));
ok('🔴 הלקוח אינו חותם משפחה על סוג פנימי',
   /if \(familyId && GARDEN_LOG_RESIDENT_KINDS\[String\(kind \|\| ""\)\]\) \{/.test(DS), 'לא נמצא');
ok('🔴🔴 והכלל מסרב גם אם מישהו בכל זאת יחתום — שתי הגנות בלתי תלויות',
   /glResidentKinds\(\)\.hasAny\(\[resource\.data\.get\('kind', ''\)\]\)/.test(RULES), 'לא נמצא');
ok('⚠️ ואין הפניה קדימה בכללים — glNext מוגדר לפני שמשתמשים בו',
   RULES.indexOf('function glNext(f)') < RULES.indexOf('glNext(\'familyId\')'),
   'glNext: ' + RULES.indexOf('function glNext(f)'));

console.log('\n' + (fail ? '✗ ' : '✓ ') + pass + ' עברו · ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
