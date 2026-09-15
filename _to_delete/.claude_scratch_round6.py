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

def span_replace(s, start_marker, end_marker, new_text, label):
    i = s.find(start_marker)
    if i == -1:
        print("FAIL(%s): start_marker not found" % label); sys.exit(1)
    j = s.find(end_marker, i)
    if j == -1:
        print("FAIL(%s): end_marker not found after start" % label); sys.exit(1)
    j_end = j + len(end_marker)
    return s[:i] + new_text + s[j_end:]

# ===================================================================
# apps-script/Code.gs
# ===================================================================
cg = load("apps-script/Code.gs")

# --- 1) GARDEN_REPORT_HEADERS: add title column before description -----
old1 = """var GARDEN_REPORT_HEADERS = [
  'מזהה', 'תאריך דיווח', 'מזהה משפחה', 'שם מדווח', 'טלפון',
  'קטגוריה', 'אזור', 'מיקום X', 'מיקום Y', 'מיקום מילולי', 'תיאור', 'תמונות',
  'מזהה משימה', 'אוחד לדיווח', 'שנת תקציב',
  'משוב', 'תאריך משוב', 'הערת משוב',
  /* מזהה שהדפדפן מייצר פעם אחת לכל טופס (ולא לכל ניסיון שליחה), כדי שאותו
     דיווח לא ייכתב פעמיים. ר' ההערה ב-submitGardenReport_. */
  'מזהה שליחה'
];"""
n1 = cg.count(old1)
if n1 != 1:
    print("FAIL(report-headers): found %d, expected 1" % n1); sys.exit(1)
new1 = """var GARDEN_REPORT_HEADERS = [
  'מזהה', 'תאריך דיווח', 'מזהה משפחה', 'שם מדווח', 'טלפון',
  'קטגוריה', 'אזור', 'מיקום X', 'מיקום Y', 'מיקום מילולי',
  /* כותרת קצרה (2026-09-15) — נפרדת מהתיאור המלא: התושב בוחר מתוך 3-4
     קפסולות שמותאמות לקטגוריה שנבחרה, או מקליד חופשי. ברשימות (כרטיס,
     "הדיווחים שלי") מוצגת רק הכותרת — לא התיאור. */
  'כותרת', 'תיאור', 'תמונות',
  'מזהה משימה', 'אוחד לדיווח', 'שנת תקציב',
  'משוב', 'תאריך משוב', 'הערת משוב',
  /* מזהה שהדפדפן מייצר פעם אחת לכל טופס (ולא לכל ניסיון שליחה), כדי שאותו
     דיווח לא ייכתב פעמיים. ר' ההערה ב-submitGardenReport_. */
  'מזהה שליחה'
];"""
cg = cg.replace(old1, new1, 1)
print("OK: 1 report headers")

# --- 2) GARDEN_SCHEMA_REV 3 -> 4 -----------------------------------------
old2 = """/* 3 (2026-09-14): נוספה 'מזהה שליחה' ל-GARDEN_REPORT_HEADERS. */
var GARDEN_SCHEMA_REV = 3;"""
n2 = cg.count(old2)
if n2 != 1:
    print("FAIL(schema-rev): found %d, expected 1" % n2); sys.exit(1)
new2 = """/* 3 (2026-09-14): נוספה 'מזהה שליחה' ל-GARDEN_REPORT_HEADERS.
 * 4 (2026-09-15): נוספה 'כותרת' ל-GARDEN_REPORT_HEADERS (כותרת קצרה,
 *   נפרדת מהתיאור המלא — ר' submitGardenReport_). */
var GARDEN_SCHEMA_REV = 4;"""
cg = cg.replace(old2, new2, 1)
print("OK: 2 schema rev")

# --- 3) submitGardenReport_: require + use a real short title -----------
old3 = "  var desc = String(body.desc || '').trim();\n  if (!cat) return { ok: false, error: 'לא נבחרה קטגוריה' };"
n3 = cg.count(old3)
if n3 != 1:
    print("FAIL(desc-line): found %d, expected 1" % n3); sys.exit(1)
new3 = ("  var desc = String(body.desc || '').trim();\n"
        "  if (!cat) return { ok: false, error: 'לא נבחרה קטגוריה' };\n"
        "  /* כותרת קצרה (2026-09-15) — חובה, בדיוק כמו הקטגוריה: כרטיס בלי\n"
        "     כותרת קצרה ברשימה חוזר להיות תיאור מלא שנחתך, בדיוק הבעיה שהיא\n"
        "     נועדה לפתור. */\n"
        "  var reportTitle = String(body.title || '').trim().substring(0, 60);\n"
        "  if (!reportTitle) return { ok: false, error: 'צריך לבחור או לכתוב כותרת קצרה' };"
)
cg = cg.replace(old3, new3, 1)
print("OK: 3 title validation")

old4 = "    var title = cat + (body.place ? ' — ' + String(body.place).trim() : '');"
n4 = cg.count(old4)
if n4 != 1:
    print("FAIL(old-title-var): found %d, expected 1" % n4); sys.exit(1)
cg = cg.replace(old4, "", 1)
print("OK: 4 removed old auto-title fallback")

old5 = "    trow[tc['כותרת']] = desc ? desc.substring(0, 120) : title;"
n5 = cg.count(old5)
if n5 != 1:
    print("FAIL(trow-title): found %d, expected 1" % n5); sys.exit(1)
cg = cg.replace(old5, "    trow[tc['כותרת']] = reportTitle;", 1)
print("OK: 5 task title uses real title")

old6 = "    rrow[rc['מיקום מילולי']] = String(body.place || '');\n    rrow[rc['תיאור']] = desc;"
n6 = cg.count(old6)
if n6 != 1:
    print("FAIL(rrow-title): found %d, expected 1" % n6); sys.exit(1)
new6 = ("    rrow[rc['מיקום מילולי']] = String(body.place || '');\n"
        "    rrow[rc['כותרת']] = reportTitle;\n"
        "    rrow[rc['תיאור']] = desc;")
cg = cg.replace(old6, new6, 1)
print("OK: 6 report row title")

# --- 7) handleMyGardenReports_: return title to the client ---------------
old7 = "        area: String(rows[r][rc['אזור']] || ''),\n        x: parseFloat(rows[r][rc['מיקום X']]) || null,"
n7 = cg.count(old7)
if n7 != 1:
    print("FAIL(myreports-title): found %d, expected 1" % n7); sys.exit(1)
new7 = ("        area: String(rows[r][rc['אזור']] || ''),\n"
        "        title: String(rows[r][rc['כותרת']] || ''),\n"
        "        x: parseFloat(rows[r][rc['מיקום X']]) || null,")
cg = cg.replace(old7, new7, 1)
print("OK: 7 myGardenReports returns title")

save("apps-script/Code.gs", cg)

# ===================================================================
# js/screens/resGarden.js
# ===================================================================
rg = load("js/screens/resGarden.js")

# --- 8) title-capsule presets, keyed by the exact category strings -------
old8 = "  function newRef() {"
n8 = rg.count(old8)
if n8 < 1:
    print("FAIL(newref-anchor): not found"); sys.exit(1)
new8 = ("""  /* קפסולות כותרת-מהירה לפי קטגוריה (2026-09-15) — יועד אישר את הרשימה.
     המפתחות הם בדיוק המחרוזות מ-GARDEN_DEFAULT_SETTINGS ב-Code.gs; קטגוריה
     שלא ברשימה (לא אמור לקרות, הרשימה סגורה) פשוט לא מציגה קפסולות ומשאירה
     מילוי חופשי בלבד. */
  var TITLE_PICKS = {
    "מדשאות": ["מדשאה יבשה", "עשב גבוה מדי"],
    "השקיה / ממטרות": ["ראש ממטרה שבור", "דליפת מים", "נראה שההשקייה לא עובדת"],
    "עצים": ["ענף שבור/מסוכן", "עץ נוטה/מתנדנד", "עץ יבש"],
    "שיחים / גיזום": ["שיח חוסם מעבר", "צריך גיזום", "ענפים פרוצים"],
    "עשבייה / קרקע": ["עשביה שוטה", "קוצים"],
    "ניקיון גינון / גזם": ["גזם לא פונה", "אשפה/לכלוך", "עלים נערמים"],
    "ערוגות / שתילות": ["שתיל פגוע/יבש", "ערוגה מוזנחת", "חסר שתילים"]
  };

  function newRef() {""")
rg = replace_once(rg, old8, new8, "title-picks-map")

# --- 9) form markup: title card right after the category card ------------
old9 = """              '<div class="gd-card">' +
                '<p class="gd-lbl">תיאור <em id="gd-wc">0 / ' + WORD_MAX + ' מילים</em></p>' +"""
n9 = rg.count(old9)
if n9 != 1:
    print("FAIL(title-card-markup): found %d, expected 1" % n9); sys.exit(1)
new9 = ("""              '<div class="gd-card">' +
                '<p class="gd-lbl">כותרת קצרה <s>*</s></p>' +
                '<div class="gd-tpicks" id="gd-tpicks"><span class="gd-tpicks__hint">בחרו קטגוריה כדי לראות הצעות</span></div>' +
                '<input class="gd-inp" id="gd-title" maxlength="60" placeholder="למשל: ראש ממטרה שבור">' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">תיאור <em id="gd-wc">0 / ' + WORD_MAX + ' מילים</em></p>' +""")
rg = replace_once(rg, old9, new9, "title-card-markup")

# --- 10) wire category clicks to (re)render the picks + wire the picks ---
old10 = """        // ---- קטגוריה ----
        container.querySelector("#gd-cats").addEventListener("click", function (e) {
          var b = e.target.closest(".gd-cat");
          if (!b) return;
          Array.prototype.forEach.call(container.querySelectorAll(".gd-cat"), function (x) {
            x.classList.toggle("on", x === b);
          });
          state.cat = b.dataset.c;
        });"""
n10 = rg.count(old10)
if n10 != 1:
    print("FAIL(cat-click): found %d, expected 1" % n10); sys.exit(1)
new10 = ("""        // ---- קטגוריה ----
        var titleInput = container.querySelector("#gd-title");
        var tpicksEl = container.querySelector("#gd-tpicks");
        function renderTitlePicks() {
          var picks = TITLE_PICKS[state.cat] || [];
          tpicksEl.innerHTML = picks.length
            ? picks.map(function (p) {
                return '<button type="button" class="gd-tpick" data-t="' + esc(p) + '">' + esc(p) + '</button>';
              }).join("")
            : '<span class="gd-tpicks__hint">אפשר גם פשוט להקליד למטה</span>';
        }
        container.querySelector("#gd-cats").addEventListener("click", function (e) {
          var b = e.target.closest(".gd-cat");
          if (!b) return;
          Array.prototype.forEach.call(container.querySelectorAll(".gd-cat"), function (x) {
            x.classList.toggle("on", x === b);
          });
          state.cat = b.dataset.c;
          renderTitlePicks();
        });
        tpicksEl.addEventListener("click", function (e) {
          var b = e.target.closest(".gd-tpick");
          if (!b) return;
          titleInput.value = b.dataset.t;
          Array.prototype.forEach.call(tpicksEl.querySelectorAll(".gd-tpick"), function (x) {
            x.classList.toggle("on", x === b);
          });
        });
        titleInput.addEventListener("input", function () {
          Array.prototype.forEach.call(tpicksEl.querySelectorAll(".gd-tpick"), function (x) {
            x.classList.toggle("on", x.dataset.t === titleInput.value);
          });
        });""")
rg = replace_once(rg, old10, new10, "cat-click-and-title-picks")

# --- 11) restore pending draft: category click already re-runs picks via
#     .click(); just also restore the title text + selection highlight. ---
old11 = """          var catBtn = container.querySelector('.gd-cat[data-c="' + esc(pr.category || "") + '"]');
          if (catBtn) catBtn.click();
          descEl.value = pr.desc || "";"""
n11 = rg.count(old11)
if n11 != 1:
    print("FAIL(restore-title): found %d, expected 1" % n11); sys.exit(1)
new11 = ("""          var catBtn = container.querySelector('.gd-cat[data-c="' + esc(pr.category || "") + '"]');
          if (catBtn) catBtn.click();
          if (pr.title) {
            titleInput.value = pr.title;
            titleInput.dispatchEvent(new Event("input"));
          }
          descEl.value = pr.desc || "";""")
rg = replace_once(rg, old11, new11, "restore-title")

# --- 12) send: require + include the title -------------------------------
old12 = """        sendBtn.addEventListener("click", function () {
          if (!state.cat) return CBA.ui.alert("צריך לבחור קטגוריה");
          var place = container.querySelector("#gd-place").value.trim();
          if (state.x === null && !place) {
            return CBA.ui.alert("צריך לסמן מיקום על המפה או לכתוב אותו במילים");
          }
          sendReport({
            category: state.cat,
            desc: descEl.value.trim(),"""
n12 = rg.count(old12)
if n12 != 1:
    print("FAIL(send-title): found %d, expected 1" % n12); sys.exit(1)
new12 = ("""        sendBtn.addEventListener("click", function () {
          if (!state.cat) return CBA.ui.alert("צריך לבחור קטגוריה");
          var titleVal = titleInput.value.trim();
          if (!titleVal) return CBA.ui.alert("צריך לבחור או לכתוב כותרת קצרה");
          var place = container.querySelector("#gd-place").value.trim();
          if (state.x === null && !place) {
            return CBA.ui.alert("צריך לסמן מיקום על המפה או לכתוב אותו במילים");
          }
          sendReport({
            category: state.cat,
            title: titleVal,
            desc: descEl.value.trim(),""")
rg = replace_once(rg, old12, new12, "send-title")

# --- 13) "my reports" card: show the title, not the full description -----
old13 = '''            '<div class="gd-rep__t">' +
              esc(r.desc || r.place || r.area || ("דיווח #" + r.id)) + '</div>' +'''
n13 = rg.count(old13)
if n13 != 1:
    print("FAIL(card-title-line): found %d, expected 1" % n13); sys.exit(1)
new13 = '''            '<div class="gd-rep__t">' +
              esc(r.title || r.desc || r.place || r.area || ("דיווח #" + r.id)) + '</div>' +'''
rg = replace_once(rg, old13, new13, "card-title-line")

save("js/screens/resGarden.js", rg)

# ===================================================================
# css/garden.css — title-pick pills (reuses the .gd-cat compact-pill
# look for visual consistency, distinct class so the two never collide)
# ===================================================================
gc = load("css/garden.css")

old14 = ".gd-cat.k-bed.on   { background: var(--c-bed); }"
n14 = gc.count(old14)
if n14 != 1:
    print("FAIL(css-anchor): found %d, expected 1" % n14); sys.exit(1)
new14 = (old14 + "\n\n"
    "/* קפסולות \"כותרת קצרה\" (2026-09-15) — אותה שפה חזותית כמו קפסולות\n"
    "   הקטגוריה (קומפקטיות, אופקיות), בלי אייקון; השבב הפעיל מציין מה נבחר. */\n"
    ".gd-tpicks { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; min-height: 30px; align-items: center; }\n"
    ".gd-tpicks__hint { font-size: 11.5px; color: var(--text-soft, #6B7280); }\n"
    ".gd-tpick { font-family: inherit; cursor: pointer; border: 1px solid rgba(255,255,255,.8);\n"
    "  background: rgba(255,255,255,.62); backdrop-filter: blur(10px) saturate(1.2);\n"
    "  -webkit-backdrop-filter: blur(10px) saturate(1.2);\n"
    "  box-shadow: inset 0 1px 0 rgba(255,255,255,.85), 0 0 0 1px rgba(17,24,39,.04);\n"
    "  border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 500;\n"
    "  color: var(--text, #374151); transition: transform .14s ease, box-shadow .14s ease; }\n"
    ".gd-tpick:hover { transform: translateY(-1px); }\n"
    ".gd-tpick.on { border-color: transparent; background: var(--action, #111827); color: #fff; font-weight: 600; }"
)
gc = gc.replace(old14, new14, 1)

save("css/garden.css", gc)
print("OK: css title picks")
print("ALL OK")
