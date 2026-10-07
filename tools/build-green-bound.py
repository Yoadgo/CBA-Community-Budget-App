#!/usr/bin/env python3
"""build-green-bound.py — מייצר את js/data/greenBound.js מתוך js/data/gardenAreas.js.

גבול השיכון לחישוב "ירוק כברירת מחדל" (גל ג׳, 7.10.2026) = איחוד 13 אזורי
הגינון, עם סגירה אוטומטית של רווחים צרים מ-10 מטר ביניהם (הרחבה ב-5 מ' ואז
כיווץ ב-5 מ'). כך 13 האזורים הופכים לחתיכה אחת בלי חורים. הדפדפן לא יודע לאחד מצולעים בלי ספרייה, ולכן החישוב נעשה כאן
פעם אחת, והתוצאה נחתמת בגיבוב של gardenAreas.

🔑 אם gardenAreas.js מיוצא מחדש מכלי הכיול והגיבוב לא תואם — האפליקציה לא
   נשברת: היא צובעת את האזורים עצמם (בלי סגירת התפרים) עד שמריצים את זה שוב.

הרצה (דורש python3 + shapely, node):
    python3 tools/build-green-bound.py
"""
import json, os, subprocess, sys
from shapely.geometry import Polygon
from shapely.ops import unary_union

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
CLOSE_M = 10.0   # רוחב הרווח הגדול ביותר שנסגר (רדיוס הסגירה = חצי)

js = r"""
const fs=require('fs');const w={CBA:{}};
new Function('window','CBA',fs.readFileSync(process.argv[1]+'/js/data/mapGeo.js','utf8'))(w,w.CBA);
new Function('window','CBA',fs.readFileSync(process.argv[1]+'/js/data/gardenAreas.js','utf8'))(w,w.CBA);
const s=JSON.stringify(w.CBA.gardenAreas.areas);let h=0;for(let i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))>>>0;
console.log(JSON.stringify({w:w.CBA.mapGeo.w,h:w.CBA.mapGeo.h,ppm:w.CBA.mapGeo.ppm,areas:w.CBA.gardenAreas.areas,hash:h}));
"""
out = subprocess.run(['node', '-e', js, ROOT], capture_output=True, text=True, check=True).stdout
d = json.loads(out)
W, H, ppm = d['w'], d['h'], d['ppm']
r = CLOSE_M / 2 * ppm
u = unary_union([Polygon([(x * W, y * H) for x, y in a['p']]).buffer(0) for a in d['areas']])
u = u.buffer(r, join_style=2).buffer(-r, join_style=2).simplify(0.3)
polys = [u] if u.geom_type == 'Polygon' else list(u.geoms)
rings = []
for p in polys:
    if p.interiors:
        print('אזהרה: יש חורים בגבול — הם נשמרים כטבעות נפרדות', file=sys.stderr)
    for ring in [p.exterior] + list(p.interiors):
        rings.append([[round(x, 1), round(y, 1)] for x, y in list(ring.coords)[:-1]])
body = {'v': 1, 'areasHash': d['hash'], 'closeM': CLOSE_M, 'rings': rings}
path = os.path.join(ROOT, 'js', 'data', 'greenBound.js')
with open(path, 'w', encoding='utf-8') as f:
    f.write('/* נוצר אוטומטית ע"י tools/build-green-bound.py · אל תערוך ידנית\n'
            '   גבול השיכון לדשא "ירוק כברירת מחדל": איחוד אזורי הגינון + סגירת רווחים עד '
            + str(CLOSE_M) + ' מ\'.\n'
            '   יחידות עולם של mapGeo (לא 0–1). טבעות נצבעות ב-evenodd. */\n')
    f.write('window.CBA=window.CBA||{};CBA.greenBound=' + json.dumps(body, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('wrote', path, 'rings', len(rings), 'points', sum(len(r) for r in rings), 'area m2', round(u.area / ppm / ppm))
