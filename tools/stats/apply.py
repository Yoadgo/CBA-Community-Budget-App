# -*- coding: utf-8 -*-
"""מחיל את מסך הנתונים על הריפו. נכשל בקול על כל עוגן שלא נמצא בדיוק פעם
   אחת — עדיף להיעצר מאשר להחיל חצי."""
import io, os, sys, re

REPO = os.path.expanduser("~/mnt/CBA-Community-Budget-App")
SRC  = os.path.dirname(os.path.abspath(__file__))
os.chdir(REPO)

def read(p):  return io.open(p, encoding="utf-8").read()
def write(p, s): io.open(p, "w", encoding="utf-8").write(s)
def rep(s, old, new, label):
    if s.count(old) != 1:
        sys.exit("❌ עוגן '%s' נמצא %d פעמים (צריך 1)" % (label, s.count(old)))
    return s.replace(old, new)

steps = []

# ---------- 1. Code.gs: הפונקציה + הניתוב ----------
gs = read("apps-script/Code.gs")
if "handleGardenStats_" in gs:
    steps.append("⏭  Code.gs — כבר מוחל")
else:
    block = read(os.path.join(SRC, "server-stats.gs"))
    gs = rep(gs, "/* ---------- יומן המשימה (doGet) — \"תיעוד אחורה\" ----------",
             block + "\n/* ---------- יומן המשימה (doGet) — \"תיעוד אחורה\" ----------",
             "מיקום הפונקציה")
    gs = rep(gs,
        "    if (e && e.parameter && e.parameter.action === 'gardenTaskLog') {",
        "    if (e && e.parameter && e.parameter.action === 'gardenStats') {\n"
        "      return handleGardenStats_(e.parameter);\n"
        "    }\n"
        "    if (e && e.parameter && e.parameter.action === 'gardenTaskLog') {",
        "ניתוב doGet")
    write("apps-script/Code.gs", gs)
    steps.append("✅ Code.gs — handleGardenStats_ + ניתוב")

# ---------- 2. המסך ----------
if os.path.exists("js/screens/gardenStats.js"):
    steps.append("⏭  gardenStats.js — כבר קיים")
else:
    write("js/screens/gardenStats.js", read(os.path.join(SRC, "gardenStats.js")))
    steps.append("✅ js/screens/gardenStats.js")

# ---------- 3. CSS ----------
css = read("css/garden.css")
if "gs-hero" in css:
    steps.append("⏭  garden.css — כבר מוחל")
else:
    write("css/garden.css", css.rstrip() + "\n\n" + read(os.path.join(SRC, "stats.css")))
    steps.append("✅ css/garden.css")

# ---------- 4. dataService ----------
ds = read("js/data/dataService.js")
if "getGardenStats" in ds:
    steps.append("⏭  dataService — כבר מוחל")
else:
    ds = rep(ds, "    /* יומן המשימה — קו הזמן המלא שלה (2026-09-08).",
        "    /* מסך הנתונים. weeks הוא חלון הזמן; השרת חוסם אותו ל-2..26.\n"
        "       ⚠️ מה שמוחזר תלוי בתפקיד — אחראי הגינון לא מקבל את החתך מול\n"
        "       התוכנית ולא את המשוב. הסינון בשרת ולא בתצוגה (F-13). */\n"
        "    getGardenStats: function (weeks, cb) {\n"
        "      CBA.sheets.get({ action: \"gardenStats\", weeks: weeks || 8 }, cb);\n"
        "    },\n"
        "    /* יומן המשימה — קו הזמן המלא שלה (2026-09-08).", "dataService")
    write("js/data/dataService.js", ds)
    steps.append("✅ dataService.getGardenStats")

# ---------- 5. app.js: הרשאה, מסך, טאב, אייקון ----------
app = read("js/app.js")
if "gardenStats" in app:
    steps.append("⏭  app.js — כבר מוחל")
else:
    app = rep(app, '    gardenInbox: PERM.GARDEN\n  };',
        '    gardenInbox: PERM.GARDEN,\n'
        '    /* מסך הנתונים פתוח גם לגנן — אבל הוא רואה בו מסך אחר לגמרי:\n'
        '       מה עשה ומה פתוח אצלו, בלי ציון ובלי חתך מול התוכנית. השרת\n'
        '       פשוט לא שולח לו את השדות האלה. ר\' F-13 ו-handleGardenStats_. */\n'
        '    gardenStats: PERM.GARDEN\n  };', "SCREEN_PERM")
    app = rep(app, '"gardenTasks", "gardenPlan", "gardenInbox"],',
                   '"gardenTasks", "gardenPlan", "gardenInbox", "gardenStats"],', "screens")
    app = rep(app, '            ["gardenTasks", "מעקב"]',
                   '            ["gardenTasks", "מעקב"],\n'
                   '            ["gardenStats", "נתונים"]', "tabs")
    app = rep(app, "    gardenPlan:  '<svg viewBox=\"0 0 24 24\"",
        "    gardenStats: '<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" "
        "stroke-width=\"1.8\" stroke-linecap=\"round\" stroke-linejoin=\"round\">"
        "<path d=\"M3 21h18\"/><path d=\"M6 21v-7M11 21V6M16 21v-4M21 21V10\"/></svg>',\n"
        "    gardenPlan:  '<svg viewBox=\"0 0 24 24\"", "nav icon")
    write("js/app.js", app)
    steps.append("✅ app.js — הרשאה, מסך, טאב, אייקון")

# ---------- 6. index.html + גרסה ----------
ix = read("index.html")
sw = read("service-worker.js")
V = re.search(r'var VERSION = "([^"]+)"', sw).group(1)
NEW = V[:-1] + chr(ord(V[-1]) + 1)
if "gardenStats.js" not in ix:
    line = '  <script src="js/screens/gardenPlan.js?v=%s"></script>' % V
    if ix.count(line) != 1: sys.exit("❌ לא מצאתי את שורת gardenPlan ב-index.html")
    ix = ix.replace(line, line + '\n  <script src="js/screens/gardenStats.js?v=%s"></script>' % V)
    steps.append("✅ index.html — gardenStats.js נרשם")
n = ix.count("?v=" + V)
ix = ix.replace("?v=" + V, "?v=" + NEW)
write("index.html", ix)
write("service-worker.js", sw.replace('var VERSION = "%s"' % V, 'var VERSION = "%s"' % NEW))
steps.append("✅ גרסה %s ← %s (%d מופעים)" % (V, NEW, n))

print("\n".join(steps))
