import os, sys
REPO = os.environ.get("REPO_DIR", ".")

def load(p):
    with open(os.path.join(REPO, p), "r", encoding="utf-8") as f:
        return f.read()

def save(p, s):
    with open(os.path.join(REPO, p), "w", encoding="utf-8") as f:
        f.write(s)

def replace_once(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("FAIL(%s): found %d occurrences, expected 1" % (label, n))
        sys.exit(1)
    return s.replace(old, new, 1)

# ===================================================================
# js/screens/gardenTasks.js
# ===================================================================
gt = load("js/screens/gardenTasks.js")

# --- 1) primaryHtml/secHtml -> slotHtml/quickHtml/secHtml -------------
old1 = '''        var planning = !closed && !t.week;
        var done = t.flag === "ממתין לאישור";
        var approving = done && isManager;

        /* הפעולה הראשית — בדיוק אותה נגזרת שקובעת את תיבת הסימון בשורה
           עצמה (ר' card()), רק כפתור מלא ולא אייקון. */
        var primaryHtml = "";
        if (!closed) {
          if (planning) {
            primaryHtml = '<button type="button" class="gd-det-cta" data-m="plan">' +
              ico("cal") + 'שיבוץ לשבוע</button>';
          } else if (approving) {
            primaryHtml = '<button type="button" class="gd-det-cta" data-m="approve">' +
              ico("check") + 'אישור</button>';
          } else if (done) {
            primaryHtml = '<button type="button" class="gd-det-cta is-ghost" data-m="undo">' +
              ico("undo") + 'ביטול סימון</button>';
          } else {
            primaryHtml = '<button type="button" class="gd-det-cta" data-m="markdone">' +
              ico("check") + 'סימון כבוצע</button>';
          }
        }

        /* פעולות משניות — אותן תנאים בדיוק כמו ב-openMenu (ללא "map", שכבר
           לא קיים גם שם, וללא "hist", שעברה לשורת היומן למעלה), רק שהתגית
           data-m עוברת ל-menuAction() המשותפת. שני שינויי ניסוח לפי יועד:
           "הערת ביצוע"→"דווח סטטוס", "סגירה עם סיבה"→"סגירה" (הדרישה
           לנמק בפועל נשארת זהה — ר' askClosure — רק המילים על הכפתור שינו). */
        var secHtml = "";
        if (!closed) {
          secHtml +=
            '<button type="button" class="gd-det-b" data-m="note">' + ico("note") + 'דווח סטטוס</button>' +
            '<button type="button" class="gd-det-b" data-m="defer">' + ico("cal") + 'דחייה לשבוע הבא</button>' +
            (!isManager
              ? '<button type="button" class="gd-det-b" data-m="block">' + ico("clock") + 'לא ניתן לביצוע</button>'
              : '');
        }
        if (isManager && t.flag === "ממתין לאישור") {
          secHtml += '<button type="button" class="gd-det-b" data-m="return">' +
            ico("undo") + 'החזרה להשלמה</button>';
        }
        if (isManager && !closed) {
          secHtml += '<button type="button" class="gd-det-b is-positive" data-m="close">' +
            ico("check") + 'סגירה</button>';
        }
        if (isManager && t.flag === "דורש בדיקה חוזרת") {
          secHtml += '<button type="button" class="gd-det-b" data-m="clearflag">' +
            ico("check") + 'טופל</button>';
        }
        if (isManager) {
          secHtml += '<button type="button" class="gd-det-b is-danger" data-m="del">' +
            ico("trash") + 'מחיקה</button>';
        }'''

n1 = gt.count(old1)
if n1 != 1:
    print("FAIL(buttons-block): found %d, expected 1" % n1)
    sys.exit(1)

new1 = '''        var planning = !closed && !t.week;
        var done = t.flag === "ממתין לאישור";

        /* שורת פעולה מהירה (2026-09-15, סבב ד') — שלושה כפתורים באותה שורה:
           יועד: "שיבוץ (שהופך לסימון כבוצע, שגם הוא כפתור שלא צריך אם יש
           כפתור סגירה)... אפשר לצמצם (לשיבוץ / סגירה, דווח סטטוס, דחייה)".
           למנהל, שיש לו סגירה ישירה בכל שלב, הסלוט הראשי הוא רק "שיבוץ" (כשאין שבוע)
           או "סגירה" (בכל מצב אחר) — בלי מצבי הביניים אישור/סימון-כבוצע/ביטול-סימון,
           שהופכים למיותרים כשיש סגירה ישירה. לגנן, שאין לו סגירה, נשאר הזרם הקודם:
           שיבוץ→סימון כבוצע→ביטול. */
        var slotHtml = "";
        if (!closed) {
          if (planning) {
            slotHtml = '<button type="button" class="gd-det-cta" data-m="plan">' +
              ico("cal") + 'שיבוץ</button>';
          } else if (isManager) {
            slotHtml = '<button type="button" class="gd-det-cta is-positive" data-m="close">' +
              ico("check") + 'סגירה</button>';
          } else if (done) {
            slotHtml = '<button type="button" class="gd-det-cta is-ghost" data-m="undo">' +
              ico("undo") + 'ביטול סימון</button>';
          } else {
            slotHtml = '<button type="button" class="gd-det-cta" data-m="markdone">' +
              ico("check") + 'סימון כבוצע</button>';
          }
        }
        var quickHtml = !closed
          ? '<div class="gd-det-quickrow">' + slotHtml +
              '<button type="button" class="gd-det-b" data-m="note">' + ico("note") + 'דווח סטטוס</button>' +
              '<button type="button" class="gd-det-b" data-m="defer">' + ico("cal") + 'דחייה</button>' +
            '</div>'
          : "";

        /* פעולות משניות — נדירות יותר, שורה נפרדת מתחת לשורה המהירה. "סגירה"
           למנהל עברה לשורה המהירה (למעלה) ואינה חוזרת כאן. */
        var secHtml = "";
        if (!closed && !isManager) {
          secHtml += '<button type="button" class="gd-det-b" data-m="block">' + ico("clock") + 'לא ניתן לביצוע</button>';
        }
        if (isManager && t.flag === "ממתין לאישור") {
          secHtml += '<button type="button" class="gd-det-b" data-m="return">' +
            ico("undo") + 'החזרה להשלמה</button>';
        }
        if (isManager && t.flag === "דורש בדיקה חוזרת") {
          secHtml += '<button type="button" class="gd-det-b" data-m="clearflag">' +
            ico("check") + 'טופל</button>';
        }
        if (isManager) {
          secHtml += '<button type="button" class="gd-det-b is-danger" data-m="del">' +
            ico("trash") + 'מחיקה</button>';
        }'''

gt = gt.replace(old1, new1, 1)
print("OK: step1 buttons block")

def span_replace(s, start_marker, end_marker, new_text, label):
    i = s.find(start_marker)
    if i == -1:
        print("FAIL(%s): start_marker not found" % label); sys.exit(1)
    j = s.find(end_marker, i)
    if j == -1:
        print("FAIL(%s): end_marker not found after start" % label); sys.exit(1)
    j_end = j + len(end_marker)
    return s[:i] + new_text + s[j_end:]

# --- 2) header: drop the old separate close-button row entirely -------
#     (kicker div right after it is left untouched, still in its original
#     place, ahead of the new title+close row built in step 3)
start2 = '            \'<div class="gd-det-topbar">'
end2 = '</button></div>\' +\n'
new2 = (
    "            /* כותרת+סגירה מוזגו לשורה אחת (2026-09-15, סבב ד') — יועד: \"כפתור\n"
    "               סגירה שתופס מרווח אפשר לשים באותה שורה של הכותרת\". השורה\n"
    "               נבנית מתחת ל-.gd-det-kicker (למטה) כדי שהקטגוריה תישאר מעל לכותרת, לא\n"
    "               בתוך השורה עצמה. */\n"
)
gt = span_replace(gt, start2, end2, new2, "header-remove-topbar")

# --- 3) title/sub: h4 + close button in a new gd-sheet-head row -------
start3 = '            \'<h4 class="gd-det-title">'
end3 = '</h4>\' +\n'
new3 = (
    "            '<div class=\"gd-sheet-head gd-det-head\">' +\n"
    "              '<h4 class=\"gd-det-title\" data-title-toggle=\"1\">' + esc(t.title || t.category || \"משימה\") + '</h4>' +\n"
    "              '<button type=\"button\" class=\"gd-sheet-close\" data-close=\"1\">' + ico(\"x\") + 'סגירה</button>' +\n"
    "            '</div>' +\n"
)
gt = span_replace(gt, start3, end3, new3, "title-close-merge")

save("js/screens/gardenTasks.js", gt)
print("OK: step2-3 header/title merge")

# --- 4) state pill + week merged into one small row --------------------
start4 = '            \'<div class="gd-det-state is-\' + esc(st.tone || "plan") + \'">\' + esc(st.text) + \'</div>\' +'
end4 = "'</div>' +\n            (hasMap"
new4 = (
    "            /* מצב+שבוע מוזגו לשורה קטנה אחת (2026-09-15, סבב ד'). */\n"
    "            '<div class=\"gd-det-staterow\">' +\n"
    "              '<span class=\"gd-det-chip is-' + esc(st.tone || \"plan\") + '\">' + esc(st.text) + '</span>' +\n"
    "              '<span class=\"gd-det-week\">' + (t.week ? esc(weekLabel(t.week)) : 'לשיבוץ') + '</span>' +\n"
    "            '</div>' +\n"
    "            (t.area\n"
    "              ? '<div class=\"gd-det-fields\"><div class=\"gd-det-f\"><span class=\"l\">אזור</span><span class=\"v\">' + esc(t.area) + '</span></div></div>'\n"
    "              : '') +\n"
    "            (hasMap"
)
gt = span_replace(gt, start4, end4, new4, "state-week-merge")
save("js/screens/gardenTasks.js", gt)
print("OK: step4 state/week merge")

# --- 5) mapbox: add small recenter button -------------------------------
start5 = '<div class="gd-det-mapbox" data-m="fullmap"><div class="gd-map" id="gd-det-map"></div>\' +'
end5 = start5
new5 = (
    '<div class="gd-det-mapbox" data-m="fullmap"><div class="gd-map" id="gd-det-map"></div>\' +\n'
    '                  /* כפתור "מרכז לנעיצה" גם במפה הקטנה (2026-09-15, סבב ד') — אותה\n'
    '                     CBA.map.centerOnPin() כמו במפה המלאה; stopPropagation משלו\n'
    '                     כדי שהקליק לא יבעבע ל-data-m="fullmap" של ההורה. */\n'
    '                  \'<button type="button" class="gd-map-recenter gd-map-recenter--sm" id="gd-det-map-recenter" title="מרכז לנעיצה">\' + ico("pin") + \'</button>\' +'
)
n5 = gt.count(start5)
if n5 != 1:
    print("FAIL(mapbox-recenter): found %d, expected 1" % n5); sys.exit(1)
gt = gt.replace(start5, new5, 1)
save("js/screens/gardenTasks.js", gt)
print("OK: step5 mapbox recenter button")

# --- 6) actions row: quickHtml + secondary row --------------------------
old6 = "'<div class=\"gd-det-actions\">' + primaryHtml + secHtml + '</div>' +"
n6 = gt.count(old6)
if n6 != 1:
    print("FAIL(actions-row): found %d, expected 1" % n6); sys.exit(1)
new6 = (
    "'<div class=\"gd-det-actions\">' + quickHtml +\n"
    "              (secHtml ? '<div class=\"gd-det-secrow\">' + secHtml + '</div>' : '') +\n"
    "            '</div>' +"
)
gt = gt.replace(old6, new6, 1)
save("js/screens/gardenTasks.js", gt)
print("OK: step6 actions row")

# --- 7) map init: wire the small recenter button + title expand toggle -
old7 = '''        if (hasMap && CBA.map) {
          var mapApi = CBA.map.render(wrap.querySelector("#gd-det-map"), {
            head: false, search: false, legend: false, hint: false, popup: false,
            pinAt: { x: t.x, y: t.y }
          });
          if (mapApi && mapApi.fit) setTimeout(function () { mapApi.fit(); }, 60);
        }'''
n7 = gt.count(old7)
if n7 != 1:
    print("FAIL(map-init): found %d, expected 1" % n7); sys.exit(1)
new7 = (
    old7[:-1].rstrip() + "\n"
    + "          var recenterSmBtn = wrap.querySelector(\"#gd-det-map-recenter\");\n"
    + "          if (recenterSmBtn) recenterSmBtn.addEventListener(\"click\", function (e) {\n"
    + "            e.stopPropagation();\n"
    + "            if (mapApi && mapApi.centerOnPin) mapApi.centerOnPin();\n"
    + "          });\n"
    + "        }\n"
    + "        /* כותרת ארוכה נחתכת (ellipsis) בשורה עם כפתור הסגירה — לחיצה\n"
    + "           עליה פותחת אותה במלואה, שוב תחתכו בלחיצה נוספת (יועד, סבב ד'). */\n"
    + "        var titleEl = wrap.querySelector(\"[data-title-toggle]\");\n"
    + "        if (titleEl) titleEl.addEventListener(\"click\", function (e) {\n"
    + "          e.stopPropagation();\n"
    + "          titleEl.classList.toggle(\"is-expanded\");\n"
    + "        });"
)
gt = gt.replace(old7, new7, 1)
save("js/screens/gardenTasks.js", gt)
print("OK: step7 map recenter wiring + title toggle")

# ===================================================================
# css/garden.css
# ===================================================================
gc = load("css/garden.css")

# --- A) drop .gd-det-topbar (no longer referenced); add gd-det-head ----
startA = ".gd-sheet-close:hover { background: rgba(17,24,39,.09); }"
endA = ".gd-det-topbar { display: flex; justify-content: flex-end; margin-bottom: 4px; }"
newA = (
    startA + "\n"
    "/* כותרת+סגירה בכרטיס הפרטים משתמשות ב-.gd-sheet-head הכללי\n"
    "   (למעלה); כאן רק תוספת קטנה: מרווח נדיב יותר מתחת לשורה,\n"
    "   ותמיכה בהרחבת כותרת ארוכה בלחיצה עליה (2026-09-15, סבב ד'). */\n"
    ".gd-det-head { margin-bottom: 4px; }\n"
    ".gd-det-head h4.gd-det-title { cursor: pointer; }\n"
    ".gd-det-head h4.gd-det-title.is-expanded { white-space: normal; overflow: visible; text-overflow: clip; }"
)
n_a = gc.count(startA + "\n\n/* בכרטיס")  # noop check placeholder, real check below
i = gc.find(startA)
if i == -1:
    print("FAIL(cssA): start not found"); sys.exit(1)
j = gc.find(endA, i)
if j == -1:
    print("FAIL(cssA): end not found"); sys.exit(1)
gc = gc[:i] + newA + gc[j+len(endA):]
print("OK: cssA topbar removed")

# --- B) small recenter-button variant -----------------------------------
oldB = ".gd-map-recenter:active { transform: scale(.94); }"
nB = gc.count(oldB)
if nB != 1:
    print("FAIL(cssB): found %d, expected 1" % nB); sys.exit(1)
newB = (
    oldB + "\n"
    ".gd-map-recenter--sm { bottom: 8px; inset-inline-end: auto; inset-inline-start: 8px;\n"
    "  width: 32px; height: 32px; box-shadow: 0 2px 8px rgba(16,24,40,.16); }\n"
    ".gd-map-recenter--sm svg { width: 15px; height: 15px; }"
)
gc = gc.replace(oldB, newB, 1)
print("OK: cssB recenter-sm")

# --- C) state pill + week merged; fields simplified ---------------------
oldC = '''.gd-det-state { display: block; border-radius: 12px; padding: 9px 12px; font-size: 13px;
  font-weight: 700; margin-bottom: 14px; background: rgba(17,24,39,.05); color: var(--text, #374151); }
.gd-det-state.is-done { background: rgba(15,107,69,.10); color: #0F6B45; }
.gd-det-state.is-wait { background: rgba(202,138,4,.12); color: #96560A; }
.gd-det-state.is-warn { background: rgba(220,38,38,.10); color: #B42318; }
.gd-det-state.is-plan { background: rgba(14,165,233,.10); color: #0369A1; }
.gd-det-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; margin-bottom: 14px; }
.gd-det-f { display: flex; flex-direction: column; gap: 2px; }
.gd-det-f .l { font-size: 10.5px; color: var(--text-soft, #6B7280); }
.gd-det-f .v { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px; }
.gd-det-f .v svg { width: 13px; height: 13px; opacity: .7; }'''
nC = gc.count(oldC)
if nC != 1:
    print("FAIL(cssC): found %d, expected 1" % nC); sys.exit(1)
newC = (
    "/* מצב+שבוע כשבב קטן באותה שורה (2026-09-15, סבב ד') — במקום בלוק מלא-רוחב. */\n"
    ".gd-det-staterow { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }\n"
    ".gd-det-chip { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 10px;\n"
    "  font-size: 11.5px; font-weight: 700; flex: none; background: rgba(17,24,39,.05); color: var(--text, #374151); }\n"
    ".gd-det-chip.is-done { background: rgba(15,107,69,.10); color: #0F6B45; }\n"
    ".gd-det-chip.is-wait { background: rgba(202,138,4,.12); color: #96560A; }\n"
    ".gd-det-chip.is-warn { background: rgba(220,38,38,.10); color: #B42318; }\n"
    ".gd-det-chip.is-plan { background: rgba(14,165,233,.10); color: #0369A1; }\n"
    ".gd-det-week { font-size: 12.5px; font-weight: 600; color: var(--text-soft, #6B7280); }\n"
    ".gd-det-fields { margin-bottom: 12px; }\n"
    ".gd-det-f { display: flex; flex-direction: column; gap: 2px; }\n"
    ".gd-det-f .l { font-size: 10.5px; color: var(--text-soft, #6B7280); }\n"
    ".gd-det-f .v { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 4px; }\n"
    ".gd-det-f .v svg { width: 13px; height: 13px; opacity: .7; }"
)
gc = gc.replace(oldC, newC, 1)
print("OK: cssC staterow")

# --- D) shrink photo/map heights back down -------------------------------
oldD1 = ".gd-det-photo { height: 170px; margin: 0 0 14px; border-radius: 14px;"
nD1 = gc.count(oldD1)
if nD1 != 1:
    print("FAIL(cssD1): found %d, expected 1" % nD1); sys.exit(1)
gc = gc.replace(oldD1, ".gd-det-photo { height: 140px; margin: 0 0 12px; border-radius: 14px;", 1)

oldD2 = ".gd-det .gd-map { height: 164px; margin-bottom: 14px; }"
nD2 = gc.count(oldD2)
if nD2 != 1:
    print("FAIL(cssD2): found %d, expected 1" % nD2); sys.exit(1)
gc = gc.replace(oldD2, ".gd-det .gd-map { height: 140px; margin-bottom: 12px; }", 1)

oldD3 = '''.gd-det-mapbox { position: relative; cursor: pointer; border-radius: 14px; overflow: hidden;
  margin-bottom: 14px; }'''
nD3 = gc.count(oldD3)
if nD3 != 1:
    print("FAIL(cssD3): found %d, expected 1" % nD3); sys.exit(1)
gc = gc.replace(oldD3, '''.gd-det-mapbox { position: relative; cursor: pointer; border-radius: 14px; overflow: hidden;
  margin-bottom: 12px; }''', 1)
print("OK: cssD photo/map shrink")

# --- E) actions -> quickrow (3-col) + secrow (2-col) ---------------------
oldE = '''.gd-det-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 2px; }
.gd-det-cta { grid-column: 1 / -1; background: var(--action, #111827); color: #fff; border: 0;
  border-radius: 12px; padding: 12px; font-size: 13.5px; font-weight: 700; font-family: inherit;
  display: flex; align-items: center; justify-content: center; gap: 6px; }
.gd-det-cta.is-ghost { background: transparent; color: var(--text, #374151);
  box-shadow: inset 0 0 0 1px rgba(17,24,39,.16); }
.gd-det-cta svg { width: 15px; height: 15px; }'''
nE = gc.count(oldE)
if nE != 1:
    print("FAIL(cssE): found %d, expected 1" % nE); sys.exit(1)
newE = (
    "/* שורת פעולה מהירה (3 עמודות שווים) + שורה משנית (2) — 2026-09-15, סבב ד'. */\n"
    ".gd-det-actions { display: flex; flex-direction: column; gap: 8px; margin-top: 2px; }\n"
    ".gd-det-quickrow { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }\n"
    ".gd-det-secrow { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }\n"
    ".gd-det-cta { background: var(--action, #111827); color: #fff; border: 0;\n"
    "  border-radius: 12px; padding: 10px 6px; font-size: 12.5px; font-weight: 700; font-family: inherit;\n"
    "  display: flex; align-items: center; justify-content: center; gap: 5px; }\n"
    ".gd-det-cta.is-ghost { background: transparent; color: var(--text, #374151);\n"
    "  box-shadow: inset 0 0 0 1px rgba(17,24,39,.16); }\n"
    ".gd-det-cta.is-positive { background: var(--ok, #059669); }\n"
    ".gd-det-cta.is-positive:hover { background: #04795A; }\n"
    ".gd-det-cta svg { width: 14px; height: 14px; }"
)
gc = gc.replace(oldE, newE, 1)
print("OK: cssE quickrow/secrow")

# --- F) sheet max-height: general bump, not just desktop -----------------
oldF = "@media (min-width: 901px) { .gt-sheet-wrap.is-detail .gt-sheet { max-height: 88vh; } }"
nF = gc.count(oldF)
if nF != 1:
    print("FAIL(cssF): found %d, expected 1" % nF); sys.exit(1)
gc = gc.replace(oldF, ".gt-sheet-wrap.is-detail .gt-sheet { max-height: 92vh; }", 1)
print("OK: cssF max-height")

save("css/garden.css", gc)

# ===================================================================
# js/app.js — stopPropagation on the year-chip click (fixes the panel
# disappearing right after a year switch: the click event kept bubbling
# to the document-level outside-click listener, which re-read e.target
# against the freshly-rebuilt panel/controls and, finding the *old*
# detached chip contained in neither, closed the brand-new panel).
# ===================================================================
app = load("js/app.js")
oldG = '''    panel.querySelectorAll("[data-year]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        switchViewYear(chip.dataset.year, panel, btn);
      });
    });'''
nG = app.count(oldG)
if nG != 1:
    print("FAIL(app-stopprop): found %d, expected 1" % nG); sys.exit(1)
newG = '''    panel.querySelectorAll("[data-year]").forEach(function (chip) {
      chip.addEventListener("click", function (e) {
        // stopPropagation קריטי כאן: renderControls בתוך switchViewYear בונה
        // מחדש את #user-panel/#user-btn עוד לפני שהקליק מסיים לבעבע ל-
        // document; בלעדיו, מאזין הסגירה-מחוץ-לתפריט (document click) קורא
        // e.target שכבר מנותק מה-DOM (השבב הישן) מול הפאנל *החדש* — ותמיד
        // "לא מוכל", כאילו לחצו מחוץ לתפריט — וסוגר אותו מיד אחרי שנפתח
        // מחדש. זה בדיוק ה"תפריט נעלם אחרי לחיצה על שנה" (יועד, סבב ד').
        e.stopPropagation();
        switchViewYear(chip.dataset.year, panel, btn);
      });
    });'''
app = app.replace(oldG, newG, 1)
save("js/app.js", app)
print("OK: app.js year-chip stopPropagation fix")

print("ALL OK")
