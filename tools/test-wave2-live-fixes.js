/* ארבעת הממצאים מהסימולציה החיה  (2026-09-18)
   הרצה:  node tools/test-wave2-live-fixes.js

   כל ארבעת הממצאים נמצאו **בייצור**, לא בקריאת קוד:
     א' — `gardenTask('done', 57)` החזירה "המשימה לא נמצאה", ומיד
          אחרי הרצת המראה אותה קריאה החזירה ok.
     ב' — שלוש הרצות רצופות של המראה: `updated: 40` בכל אחת.
     ג' — משימה #55 קיימת ומצביעה לדיווח 11 שאינו קיים.
     ד' — "שלום ," בשני מיילים שהתקבלו בפועל בתיבה. */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (n, c, x) => c ? (pass++, console.log('  ✓ ' + n))
                          : (fail++, console.log('  ✗ ' + n + (x ? '  → ' + String(x).slice(0, 320) : '')));
const section = t => console.log('\n' + t);
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const GS = R('apps-script/Code.gs');
const DS = R('js/data/dataService.js');
const RU = R('firestore.rules');

section("1. \🔴 ממצא א' — פעולת מנהל על משימה שנולדה בדפדפן");
const ens = (GS.match(/function gardenMirrorEnsureOne_[\s\S]*?\n\}/) || [''])[0];
ok('gardenMirrorEnsureOne_ קיימת', !!ens);
ok('מחפשת קודם שורה קיימת ויוצאת אם מצאה',
   /\.trim\(\) === String\(id\)\.trim\(\)\) return false;/.test(ens), ens);
ok('⚠️ אין מסמך — אין מה להשלים', /if \(!d\) return false;/.test(ens), ens);
ok('\🔴\🔴 **הוספה בלבד** — אין כאן עדכון של שורה קיימת',
   !/setValue\(/.test(ens) && /setValues\(\[row\]\)/.test(ens), ens);
ok('נרשם ללוג עם תחילית חיפוש קבועה', /CBA-ENSURE-ROW/.test(ens), ens);

const wrap = (GS.match(/function gardenEnsureRows_[\s\S]*?\n\}\n/) || [''])[0];
ok('gardenEnsureRows_ קיימת', !!wrap);
ok('\🔴 לא עושה כלום כשהדגל כבוי', /if \(!gardenFsOwns_\(\)\) return;/.test(wrap), wrap);
ok('אוספת id / into / ids[]',
   /push\(body && body\.id\)/.test(wrap) && /push\(body && body\.into\)/.test(wrap) &&
   /body\.ids\.forEach\(push\)/.test(wrap), wrap);
ok('משלימה גם שורת משימה וגם שורת דיווח',
   /GARDEN_TASKS_SHEET, FS_GARDEN_TASKS/.test(wrap) && /GARDEN_REPORTS_SHEET, FS_GARDEN_REPORTS/.test(wrap), wrap);
ok('\🔑 וגם את הדיווח שמאחורי המשימה (repId) — בלעדיו אין מייל',
   /t\.repId/.test(wrap), wrap);
ok('⚠️ שגר ושכח — כשל אינו חוסם את הפעולה',
   /catch \(e\) \{ Logger\.log\('gardenEnsureRows_/.test(wrap), wrap);
ok('חסומה ב-50 מזהים — אישור מרוכז אינו הופך לסריקה אינסופית',
   /i < 50/.test(wrap), wrap);

const gw = (GS.match(/function gardenWrite_[\s\S]*?\n\}/) || [''])[0];
ok('\🔴\🔴 ההשלמה רצה **לפני** המטפל',
   gw.indexOf('gardenEnsureRows_') !== -1 &&
   gw.indexOf('gardenEnsureRows_') < gw.indexOf('var res = fn(ss, body);'), gw);
ok('וגם gardenCoverByPlan — שאינה עוברת ב-gardenWrite_ — מקבלת אותה',
   /case 'gardenCoverByPlan':\s+gardenEnsureRows_\(ss, body\.action, body\);/.test(GS));

section("2. \🔴 ממצא ב' — המראה חייבת להתכנס");
const same = (GS.match(/function gardenMirrorSame_[\s\S]*?\n\}/) || [''])[0];
ok('gardenMirrorSame_ קיימת', !!same);
ok('\🔑 שני תאריכים מושווים לפי getTime ולא לפי מחרוזת',
   /Math\.abs\(cur\.getTime\(\) - nxt\.getTime\(\)\) < 1000/.test(same), same);
ok('⚠️ סבילות של שנייה — המספר הסידורי בגיליון מעגל',
   (same.match(/< 1000/g) || []).length >= 2, same);
ok('צד אחד תאריך והשני ריק = שינוי אמיתי',
   /if \(!s\) return false;/.test(same), same);
/* 🔴🔴 18.9 — מה שהמדידה החיה חשפה אחרי הניסיון הראשון.
   הערכים במסמכים הם **מחרוזות** `"2026-09-13"`, הגיליון ממיר אותן
   ל-Date בכתיבה, ו-`new Date("2026-09-13")` הוא חצות UTC מול חצות מקומי
   — שלוש שעות הפרש. השוואה של רגעים לא יכולה להתכנס כאן. */
ok('🔴🔴 תאריך-בלבד מושווה כיום קלנדרי, לא כרגע',
   /\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/.test(same) &&
   /Utilities\.formatDate\(d, tz, 'yyyy-MM-dd'\) === s/.test(same), same);
ok('🔑 ובאזור הזמן של הגיליון, לא של השרת',
   /getSpreadsheetTimeZone\(\)/.test((GS.match(/function gardenMirrorTz_[\s\S]*?\n\}/)||[''])[0]));
ok('⚠️ והוא נשמר במטמון — לא קריאת API לכל תא',
   /if \(!GARDEN_MIRROR_TZ_\)/.test(GS));
ok('מחרוזת תאריך-ושעה עדיין מושווה כרגע',
   /var p = new Date\(s\);/.test(same) && /Math\.abs\(d\.getTime\(\) - p\.getTime\(\)\) < 1000/.test(same), same);
ok('לא-תאריך — ההתנהגות הישנה נשמרת',
   /return String\(cur == null \? '' : cur\) === String\(nxt == null \? '' : nxt\);/.test(same), same);
ok('⚠️ תאריך לא תקין אינו נחשב תאריך',
   /!isNaN\(v\.getTime\(\)\)/.test((GS.match(/function gardenMirrorIsDate_[\s\S]*?\n\}/)||[''])[0]));

const mir = (GS.match(/function gardenMirrorOne_[\s\S]*?\n\}/) || [''])[0];
ok('\🔴 המראה משתמשת בה ולא בהשוואת מחרוזות',
   /if \(gardenMirrorSame_\(cur, nxt\)\) continue;/.test(mir) &&
   !/if \(String\(cur == null \? '' : cur\) === String\(nxt\)\) continue;/.test(mir), mir);
ok('\🔎 ומדווחת איזו עמודה זזה — החיווי שחסר כדי לתפוס את הממצא',
   /out\.diffCols\[headers\[c\]\] = \(out\.diffCols\[headers\[c\]\] \|\| 0\) \+ 1;/.test(mir), mir);
ok('diffCols מאותחל גם במראה המלאה וגם בקריאה בודדת',
   /diffCols: \{\}/.test(GS) && /if \(!out\.diffCols\) out\.diffCols = \{\};/.test(GS));

section("3. \🟠 ממצא ג' — משימה יתומה כשהדיווח נדחה");
const fw = (DS.match(/function gardenReportFsWrite[\s\S]*?\n  \}/) || [''])[0];
ok('\🔴 התנאי נבדק **לפני** הקצאת מזהה',
   fw.indexOf('hasPin') !== -1 &&
   fw.indexOf('hasPin') < fw.indexOf('CBA.fb.nextId("gardenReport"'), fw);
ok('והוא העתק של grPlaceOk — נעיצה 0–1 או מיקום מילולי',
   /payload\.x >= 0 && payload\.x <= 1 && payload\.y >= 0 && payload\.y <= 1/.test(fw) &&
   /var hasPlace = String\(payload\.place \|\| ""\)\.trim\(\) !== "";/.test(fw), fw);
ok('גם מזהה משפחה ריק עוצר לפני ההקצאה',
   fw.indexOf('if (!fid) {') !== -1 &&
   fw.indexOf('if (!fid) {') < fw.indexOf('CBA.fb.nextId("gardenReport"'), fw);
ok('\🔴\🔴 וכשהדיווח בכל זאת נדחה — משימה נמחקת',
   /CBA\.fb\.deleteDoc\("gardenTasks", String\(taskId\)/.test(fw), fw);
ok('⚠️ והכשל שלה נרשם ולא נבלע', /gardenPhotoWarn\("משימה יתומה/.test(fw), fw);
ok('הסדר לא התהפך — המשימה עדיין נכתבת ראשונה',
   fw.indexOf('createDoc("gardenTasks"') < fw.indexOf('createDoc("gardenReports"'), fw);

const orph = (RU.match(/function gtOrphanCleanupOk[\s\S]*?\n    \}/) || [''])[0];
ok('כלל gtOrphanCleanupOk קיים', !!orph);
ok('\🔴 השומר המרכזי — מותר רק כשאין מסמך דיווח',
   /!exists\(\/databases\/\$\(database\)\/documents\/gardenReports\/\$\(resource\.data\.repId\)\)/.test(orph), orph);
ok("⚠️ ורק שלב 'התקבל' — משימה שהצוות נגע בה אינה נמחקת",
   /resource\.data\.stage == 'התקבל'/.test(orph), orph);
ok('⚠️ ורק עם repId — משימת שגרה לא נכנסת לכאן כלל',
   /resource\.data\.get\('repId', ''\) != ''/.test(orph), orph);
ok('והוא מחווט ל-allow delete לצד gtDeleteOk',
   /allow delete: if gtDeleteOk\(\) \|\| gtOrphanCleanupOk\(\);/.test(RU));
ok('\🔑 והוא דורש חברות — לא פתוח לכל דכפדף',
   /isMember\(\) && m\(\)\.isExternal == false/.test(orph), orph);

section('4. ממצא ד\' — שם ריק במיילים');
const rft = (GS.match(/function gardenReportsForTask_[\s\S]*?\n\}/) || [''])[0];
ok('\🔴 נפילה לאחור לשם לפי מזהה משפחה',
   /if \(!nm && fam\) \{/.test(rft) && /names = txFamilyNames_\(ss\);/.test(rft), rft);
ok('⚠️ והמפה נטענת עצלנית — לא בכל שורה',
   /var names = null;/.test(rft), rft);
ok('\🔑 וזה הצוואר היחיד — חמשת המיילים עוברים דרכו',
   (GS.match(/gardenReportsForTask_\(ss, taskId\)/g) || []).length >= 4);
ok("והמראה ממלאת 'שם מדווח' בשורה חדשה",
   /nm && nm\[fam\]/.test((GS.match(/function gardenMirrorRow_[\s\S]*?\n\}/)||[''])[0]));
/* 🔴 18.9 — נמדד חי: "בוצע" לקחה 28.9 שניות כש-`txFamilyNames_`
   (קריאת כל טאב התושבים) רצה בכל פעולת גינון גם כשלא היה מה למלא. */
ok('🔴🔴 ומפת השמות נפתרת **עצלנית** — רק כשנכתבת שורה',
   /typeof opts\.names === 'function'/.test(GS) &&
   !/names: txFamilyNames_\(ss\)/.test(GS));
ok('⚠️ והיא נפתרת פעם אחת לכל בקשה, לא לכל שורה',
   /if \(!names\) names = txFamilyNames_\(ss\); return names;/.test(GS));
ok('\🔴\🔴 אבל **לעולם לא דורסת שם קיים**',
   /!String\(row\[cName\] \|\| ''\)\.trim\(\)/.test((GS.match(/function gardenMirrorRow_[\s\S]*?\n\}/)||[''])[0]));
ok("⚠️ ו'שם מדווח' עדיין אינו במפת העדכון — שורה קיימת אינה נגעת",
   !/'שם מדווח':/.test(GS));
ok('המראה המלאה מעבירה את המפה לטאב הדיווחים בלבד',
   /\{ skipBlank: true,\s*\n\s*names: function \(\)/.test(GS) &&
   /GARDEN_TASK_MIRROR_COLS, \{\}, out\)/.test(GS));

section('5. מה שאסור היה להישבר בדרך');
ok('\🔴 המראה עדיין אינה מוחקת שורות', !/deleteRow/.test(mir), mir);
ok('\🔴 ושאילתה שנכשלה עדיין לא נוגעת בכלום',
   /out\.ok = false;[\s\S]{0,140}return;/.test(mir), mir);
ok('\🔴 שלושת המנעולים מול הסחיפה במקומם',
   (GS.match(/out\.skipped = 'fs-owns'/g) || []).length === 2 &&
   /if \(!gardenFsOwns_\(\)\) fsSweepOrphans_\(FS_GARDEN_TASKS, live, out\);/.test(GS));
ok('ההשלמה אינה מריצה מראה מלאה (6 שניות) לפני כל לחיצה',
   !/gardenMirrorToSheet_/.test(wrap), wrap);
ok('והיא אינה נוגעת ב-Firestore בכתיבה — רק קוראת',
   !/fsSet_|fsMerge_|fsDelete_/.test(wrap) && /fsGet_/.test(wrap), wrap);

console.log('\n' + (fail ? '❌ ' : '✅ ') + pass + ' עברו, ' + fail + ' נכשלו');
process.exit(fail ? 1 : 0);
