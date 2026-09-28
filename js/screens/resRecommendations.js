/* מסך "המלצות השיכון" באזור התושב (27.9.26, resRecommendations).
   דירקטורי המלצות תושבים לפי קטגוריה → קבוצה: מדריך שכונתי מודפס (יובא
   בעתיד, source:"guide2024") + המלצות תושבים (חדשות, ומיגרציה של הישנות
   שהיו עד היום בתוך מסך "שירותים", ר' cba-services-ai-multiimage-and-
   promote-spec / migrateResidentExtrasToRecommendations ב-dataService.js).

   כל פריט הוא document רגיל לגמרי באוסף residentServiceCards הקיים —
   בדיוק אותם כרטיסים ש-services.js כבר מציג, רק כאן הם מאורגנים
   בקטגוריה/קבוצה במקום ברשימה שטוחה, ולייק/דיסלייק/תגובות משתמשים
   *באותן* פונקציות גלובליות מ-services.js (svcReactionsHtml/
   svcBindReactionZone/svcThumbIcon וכו') — לא נבנה מנגנון תגובות מקביל.

   ⚠️ קטגוריות/קבוצות הן קונפיגורציה קבועה בקוד (RR_CATEGORIES/RR_GROUPS),
   לא אוסף בגיליון/Firestore — בדיוק כמו תוויות הצבע (RR_LABELS) למטה,
   לבקשת יועד (26.9): "אין מסך ניהול לתוויות/קבוצות, הן קבועות בקוד".
   רשימת הקבוצות כאן היא זרע-להתחלה בלבד: הייבוא האמיתי (244 שורות
   מהמדריך המודפס) הוא משימה נפרדת שעדיין לא התחילה, וכל group שיגיע
   ממנו ושלא מופיע כאן פשוט ייפול לקטגוריית "קבוצות נוספות" למטה —
   אף נתון לא נעלם בשקט, ר' rrOverflowGroups(). */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

/* ============================================================================
 *  קונפיגורציה קבועה — קטגוריות, קבוצות-זרע, תוויות, צבעי קופות חולים
 * ========================================================================== */
var RR_CATEGORIES = [
  { id: "medicine", name: "רפואה",                       emoji: "⚕️" },
  { id: "beauty",   name: "יופי וטיפוח",                  emoji: "💇" },
  { id: "home",     name: "בית ומשפחה",                    emoji: "🏠" },
  { id: "car",      name: "רכב",                          emoji: "🚗" },
  { id: "shopping", name: "קניות ומשלוחים",                emoji: "🛒" },
  { id: "food",     name: "אוכל ובילוי",                   emoji: "🍽️" },
  { id: "biz",      name: "עסקים מתושבי השיכון",           emoji: "🏘️" }
];

/* קבוצות-זרע — דוגמה מייצגת לכל קטגוריה, לא רשימה סופית. שם הקבוצה הוא
   מחרוזת חופשית על השדה `group` בכרטיס (לא מזהה), ולכן כל group אחר
   שיגיע מהייבוא פשוט יצטרף כאן כשהוא הופך שכיח מספיק כדי להוסיף אותו,
   או ייפול לתוך "קבוצות נוספות" (rrOverflowGroups) בינתיים. */
var RR_GROUPS = [
  { name: "רופאי ילדים",      emoji: "🩺", categoryId: "medicine" },
  { name: "רופאי משפחה",      emoji: "🩺", categoryId: "medicine" },
  { name: "פיזיותרפיה",       emoji: "🤕", categoryId: "medicine" },
  { name: "מספרות ומעצבי שיער", emoji: "💇", categoryId: "beauty" },
  { name: "קוסמטיקה וציפורניים", emoji: "💅", categoryId: "beauty" },
  { name: "מורים פרטיים",     emoji: "📚", categoryId: "home" },
  { name: "עוזרות בית וניקיון", emoji: "🧹", categoryId: "home" },
  { name: "שיפוצניקים ואינסטלטורים", emoji: "🔧", categoryId: "home" },
  { name: "גינון ותחזוקת חצר", emoji: "🌳", categoryId: "home" },
  { name: "מוסכים ותיקוני רכב", emoji: "🚗", categoryId: "car" },
  { name: "שטיפת רכב",        emoji: "🧼", categoryId: "car" },
  { name: "משלוחי אוכל מוכן לבסיס", emoji: "🍔", categoryId: "shopping" },
  { name: "סופרים ומשלוחי מזון", emoji: "🛒", categoryId: "shopping" },
  { name: "מסעדות מומלצות",   emoji: "🍽️", categoryId: "food" },
  { name: "בייביסיטרים",      emoji: "🍼", categoryId: "food" },
  /* 27.9.26 — הורחב לקראת ייבוא 244 השורות מהמדריך השכונתי המודפס
     (task: resident-recs-import). כל השורות הבאות תואמות group אמיתי
     שמגיע מהייבוא, כדי שלא ייפלו ל"קבוצות נוספות" (rrOverflowGroups). */
  { name: "רפואת נשים",              emoji: "🩺", categoryId: "medicine" },
  { name: "טיפת חלב",                emoji: "🍼", categoryId: "medicine" },
  { name: "רופאי שיניים לילדים",      emoji: "🦷", categoryId: "medicine" },
  { name: "רופאי שיניים מבוגרים",     emoji: "🦷", categoryId: "medicine" },
  { name: "תופרות",                  emoji: "🧵", categoryId: "home" },
  { name: "וטרינר",                  emoji: "🐾", categoryId: "home" },
  { name: "משתלות (גינה ופרחים)",     emoji: "🌱", categoryId: "home" },
  { name: "מדבירים",                 emoji: "🐜", categoryId: "home" },
  { name: "טכנאי מוצרי חשמל",         emoji: "🔌", categoryId: "home" },
  { name: "טכנאי מזגנים",            emoji: "❄️", categoryId: "home" },
  { name: "ניקוי ספות",              emoji: "🛋️", categoryId: "home" },
  { name: "עסקים בתוך השיכון",        emoji: "🏘️", categoryId: "biz" },
  { name: "משלוחים שונים לבסיס",      emoji: "🚚", categoryId: "shopping" },
  { name: "חנויות משקאות",           emoji: "🍷", categoryId: "shopping" },
  { name: "מרכזי קניות",             emoji: "🏬", categoryId: "shopping" },
  { name: "חנויות סטייל והנחות",      emoji: "🏷️", categoryId: "shopping" },
  { name: "מעדניות ואוכל מוכן",       emoji: "🧀", categoryId: "shopping" },
  { name: "מאפיות",                  emoji: "🥐", categoryId: "shopping" },
  { name: "טבע אורגני וללא גלוטן",    emoji: "🌿", categoryId: "shopping" },
  { name: "קצביות ובשר",             emoji: "🥩", categoryId: "shopping" },
  { name: "בתי קפה ומסעדות",         emoji: "☕", categoryId: "food" }
];

/* תוויות-צבע קבועות (סעיף 4 באפיון) — לא כולל "כשר", שהוא שדה בוליאני
   נפרד (kosher) ומצויר בנפרד: פילה חיובית או שום דבר, לעולם לא "לא כשר"
   (הוכרע אחרי שתי סבבי משוב, ר' rrKosherPillHtml למטה). */
var RR_LABELS = {
  blue_card:   { emoji: "🔵", text: "כרטיס כחול (חבר)",                bg: "#DBEAFE", fg: "#1E40AF" },
  delivers_n:  { text: "משלוחים לבסיס · שער צפון",                    bg: "#FEF3C7", fg: "#92400E" },
  delivers_s:  { text: "משלוחים לבסיס · שער דרום",                    bg: "#FEF3C7", fg: "#92400E" },
  delivers_ns: { text: "משלוחים לבסיס · שער צפון ודרום",              bg: "#FEF3C7", fg: "#92400E" },
  delivers:    { text: "משלוחים לבסיס",                               bg: "#FEF3C7", fg: "#92400E" },
  gluten_free: { text: "ללא גלוטן",                                   bg: "#EDE9FE", fg: "#5B21B6" },
  wa_group:    { text: "קבוצת וואטסאפ",                               bg: "#CCFBF1", fg: "#0F766E" },
  private:     { text: "פרטי",                                        bg: "#F3F4F6", fg: "#4B5563" }
};
var RR_LABEL_ORDER = ["blue_card", "delivers_n", "delivers_s", "delivers_ns", "delivers", "gluten_free", "wa_group", "private"];

/* צבעי קופות חולים — אומתו מול המותג האמיתי של כל קופה, חוץ מכללית
   (ר' ההערה למטה). קופה שלא ברשימה מקבלת פילה אפורה עם שם הקופה,
   ולא קורסת/זורקת שגיאה. */
var RR_KUPAH_COLORS = {
  "מכבי":   { bg: "#E3EAFB", fg: "#0D47A1" },
  /* יועד ביקש ירוק במפורש אחרי שהוסבר לו שהמיתוג הרשמי של כללית הוא כחול
     (#285AE6) ולא ירוק — ההחלטה מודעת ולא טעות מחקר צבע. */
  "כללית":  { bg: "#DCF3E4", fg: "#166534" },
  "מאוחדת": { bg: "#FDE4D2", fg: "#B84E12" }
};
var RR_KUPAH_LIST = ["מכבי", "כללית", "מאוחדת", "לאומית"];

function rrEsc(s) { return CBA.esc ? CBA.esc(s) : String(s == null ? "" : s); }
/* 28.9.26 — קישורים חיצוניים (אתר/מפות): רק http(s), אחרת לא מציגים בכלל. */
function rrSafeUrl(u) { u = String(u || "").trim(); return /^https?:\/\//i.test(u) ? u : ""; }
/* "פתח במפות": קישור ששמור בכרטיס, ואם אין — חיפוש לפי שם + כתובת + עיר. */
function rrMapsHref(c) {
  var saved = rrSafeUrl(c.mapsUrl);
  if (saved) return saved;
  if (!c.address) return "";
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent([c.title, c.address, c.city].filter(Boolean).join(" "));
}

/* ============================================================================
 *  מצב המסך
 * ========================================================================== */
var rrState = {
  cards: [], loaded: false,
  view: "home",              // "home" | "group"
  homeQuery: "", homeCategory: null,
  groupName: "", groupCategoryId: "",
  groupQuery: "", kupahFilter: "", sort: "name",
  staleByCard: {}            // cardId -> latest open staleReport
};
var rrRepaint = null;

/* ---------- קיבוץ נתונים בפועל לפי קבוצה/קטגוריה ---------- */

function rrGroupOf(card) { return String(card.group || "").trim() || "ללא קבוצה"; }

function rrKnownGroupNames() {
  var s = {};
  RR_GROUPS.forEach(function (g) { s[g.name] = g; });
  return s;
}

/* מחזירה, לכל קטגוריה קבועה, את קבוצות-הזרע שלה + ספירת פריטים בפועל
   (0 אם עוד אין נתונים — הקטגוריה עדיין מוצגת, ר' סעיף 9 באפיון). */
function rrGroupsForCategory(catId) {
  var byGroup = {};
  rrState.cards.forEach(function (c) {
    var g = rrGroupOf(c);
    var meta = rrKnownGroupNames()[g];
    if (meta && meta.categoryId === catId) (byGroup[g] = byGroup[g] || []).push(c);
  });
  return RR_GROUPS.filter(function (g) { return g.categoryId === catId; }).map(function (g) {
    return { name: g.name, emoji: g.emoji, items: byGroup[g.name] || [] };
  });
}

/* "קבוצות נוספות" — כל group בפועל שאינו מוכר באף קטגוריה קבועה (כולל
   "ללא קבוצה" מהמיגרציה, וכל group חדש שיגיע מהייבוא לפני שנוסיף אותו
   כאן) — כדי שאף פריט לא ייעלם בשקט, בדיוק כמו "ללא קטגוריה" ב-services.js. */
function rrOverflowGroups() {
  var known = rrKnownGroupNames();
  var byGroup = {};
  rrState.cards.forEach(function (c) {
    var g = rrGroupOf(c);
    if (known[g]) return;
    (byGroup[g] = byGroup[g] || []).push(c);
  });
  return Object.keys(byGroup).sort(function (a, b) { return a.localeCompare(b, "he"); }).map(function (g) {
    return { name: g, emoji: "📌", items: byGroup[g] };
  });
}

function rrMatchesQuery(card, q) {
  if (!q) return true;
  var hay = [card.title, card.body, card.city, card.phone, card.address].join(" ").toLowerCase();
  return hay.indexOf(q.toLowerCase()) !== -1;
}

/* ============================================================================
 *  פילות — תוויות / קופת חולים / כשר
 * ========================================================================== */
function rrPillHtml(text, bg, fg, emoji) {
  return '<span class="rr-pill" style="background:' + bg + ';color:' + fg + '">' +
    (emoji ? emoji + " " : "") + rrEsc(text) + "</span>";
}

function rrLabelsHtml(card) {
  var out = "";
  (card.labels || []).forEach(function (id) {
    var l = RR_LABELS[id];
    if (!l) return;
    out += rrPillHtml(l.text, l.bg, l.fg, l.emoji);
  });
  return out;
}

function rrKupahPillHtml(card) {
  if (!card.kupah) return "";
  var c = RR_KUPAH_COLORS[card.kupah];
  if (!c) return rrPillHtml(card.kupah, "#F3F4F6", "#4B5563");
  return rrPillHtml(card.kupah, c.bg, c.fg);
}

/* "כשר" — פילה חיובית בלבד, או שום דבר. אין "לא כשר" ואין אייקון —
   הוחלט אחרי שני סבבי משוב (עיגול-עם-אות ואז וי, שניהם נדחו). */
function rrKosherPillHtml(card) {
  return card.kosher === true ? rrPillHtml("כשר", "#ECFDF5", "#047857") : "";
}

function rrAllPillsHtml(card) {
  return rrLabelsHtml(card) + rrKupahPillHtml(card) + rrKosherPillHtml(card);
}

/* 27.9.26 — שלושה סמלילי יצירת קשר, נגזרים משדות אופציונליים על הכרטיס.
   מוצגים רק כשהשדה מולא. אותם אייקונים בדיוק (svcPhoneIcon/svcWaIcon) כבר
   בשימוש בפירוט הכרטיס בשירותים.js לאותה פעולה בדיוק — לא ממציאים חדשים;
   svcWaGroupIcon (חדש, שם) הוא הווריאנט היחיד שלא היה קיים. */
function rrContactIconsHtml(c) {
  if (!c.hotlinePhone && !c.whatsappHotline && !c.whatsappGroupLink) return "";
  var out = '<div class="rr-contact">';
  if (c.hotlinePhone) {
    out += '<button type="button" class="rr-cbtn rr-cbtn--phone" data-call="' + rrEsc(c.hotlinePhone) +
      '" title="מוקד טלפוני: ' + rrEsc(c.hotlinePhone) + '">' + svcPhoneIcon() + "</button>";
  }
  if (c.whatsappHotline) {
    out += '<a class="rr-cbtn rr-cbtn--wa" href="https://wa.me/' + rrEsc(CBA.serviceUtils.waDigits(c.whatsappHotline)) +
      '" target="_blank" rel="noopener" title="מוקד וואטסאפ">' + svcWaIcon() + "</a>";
  }
  if (c.whatsappGroupLink) {
    out += '<a class="rr-cbtn rr-cbtn--wag" href="' + rrEsc(c.whatsappGroupLink) +
      '" target="_blank" rel="noopener" title="קבוצת וואטסאפ שיכון">' + svcWaGroupIcon() + "</a>";
  }
  out += "</div>";
  return out;
}

function rrOwnerIcon() {
  return '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" ' +
    'stroke-linecap="round" stroke-linejoin="round"><path d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"/></svg>';
}

/* "אחראי מטעם הוועד" — 27.9.26, סבב 2: לא שדה טקסט, אלא קישור חי לפריט
   קיים בעץ הוועד (committeeItemId). יועד: "שהעדכונים יהיו עצמיים ולא
   שאם הועד משתנה אני צריך לעדכן אחראי ב-3 מקומות" — אז השם *לעולם* לא
   נשמר על הכרטיס, רק מזהה הפריט; השם נגזר מחדש מעץ הוועד בכל ציור
   (CBA.committeeTree.itemsForYear, דורש load() קודם — ר' loadAndPaint
   למעלה). אם הפריט נמחק מהעץ בינתיים — פשוט לא מוצג (לא נתקע על מזהה מת).
   אם הפריט קיים אבל התפקיד עדיין לא מאויש — מוצג "טרם שובץ" ולא שם ריק. */
function rrCommitteeItems() {
  return (window.CBA && CBA.committeeTree && CBA.committeeTree.itemsForYear) ? CBA.committeeTree.itemsForYear() : [];
}
function rrOwnerHtml(c) {
  if (!c.committeeItemId) return "";
  var it = rrCommitteeItems().filter(function (x) { return x.id === c.committeeItemId; })[0];
  if (!it) return "";
  var names = it.ownerNames.length ? it.ownerNames.join(", ") : "טרם שובץ";
  return '<div class="rr-owner">' + rrOwnerIcon() + "אחראי מטעם הוועד (" + rrEsc(it.title) + "): <b>" + rrEsc(names) + "</b></div>";
}

/* ============================================================================
 *  המסך
 * ========================================================================== */
CBA.screens.resRecommendations = {
  title: "המלצות השיכון",

  render: function (container) {
    container.innerHTML =
      '<div class="screen-head screen-head--row">' +
        '<div><div class="screen-head__title">המלצות השיכון</div>' +
        '<div class="screen-head__sub">המלצות תושבים, לפי קטגוריה וקבוצה</div></div>' +
      "</div>" +
      '<div id="rr-body"></div>';
    var body = container.querySelector("#rr-body");
    body.innerHTML = CBA.skel.tiles(6);

    function loadAndPaint() {
      CBA.data.ensureFamilyNames(function () {
        CBA.data.getResidentServiceCards(true, function (res) {
          if (!res || !res.ok) {
            body.innerHTML = '<div class="card club-card"><div class="club-empty">לא ניתן לטעון כרגע. ' +
              rrEsc((res && res.error) || "") + "</div></div>";
            return;
          }
          rrState.cards = res.cards || [];
          CBA.data.getServiceEngagementSummary(function (eng) {
            rrState.reactionCounts = (eng && eng.ok && eng.reactions) || {};
            rrState.mineReactions = (eng && eng.ok && eng.mine) || {};
            rrState.commentCounts = (eng && eng.ok && eng.comments) || {};
            CBA.data.getStaleReports(function (sr) {
              rrState.staleByCard = {};
              ((sr && sr.ok && sr.reports) || []).forEach(function (r) {
                if (r.status !== "open") return;
                if (!rrState.staleByCard[r.cardId]) rrState.staleByCard[r.cardId] = r;
              });
              /* 27.9.26 — עץ הוועד, בשביל rrOwnerHtml/rrCommitteeItemOptionsHtml
                 (קישור "אחראי מטעם הוועד" חי, ר' committeeTree.js). best-effort:
                 כשל טעינה לא חוסם את המסך — פשוט לא יוצג "אחראי" באף כרטיס. */
              function finish() { rrState.loaded = true; rrPaint(body); }
              if (window.CBA && CBA.committeeTree && CBA.committeeTree.load) {
                try { CBA.committeeTree.load(finish); } catch (e) { finish(); }
              } else finish();
            });
          });
        });
      });
    }
    rrRepaint = function () { loadAndPaint(); };
    loadAndPaint();
  }
};

function rrPaint(body) {
  if (rrState.view === "group") rrPaintGroup(body);
  else rrPaintHome(body);
}

/* ---------- מסך הבית — חיפוש + צ'יפים + קבוצות לפי קטגוריה ---------- */
function rrPaintHome(body) {
  var overflow = rrOverflowGroups();
  var cats = RR_CATEGORIES.slice();
  var catList = rrState.homeCategory ? cats.filter(function (c) { return c.id === rrState.homeCategory; }) : cats;

  body.innerHTML =
    '<div class="rr-toolbar">' +
      '<div class="svc-search">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<input id="rr-q" class="field-input" placeholder="חיפוש המלצה, שם או תחום…" value="' + rrEsc(rrState.homeQuery) + '">' +
      "</div>" +
      '<div class="rr-chips" id="rr-chips">' +
        '<button type="button" class="rr-chip' + (!rrState.homeCategory ? " is-on" : "") + '" data-cat="">הכול</button>' +
        cats.map(function (c) {
          return '<button type="button" class="rr-chip' + (rrState.homeCategory === c.id ? " is-on" : "") + '" data-cat="' + c.id + '">' +
            c.emoji + " " + rrEsc(c.name) + "</button>";
        }).join("") +
      "</div>" +
    "</div>" +
    '<div id="rr-home"></div>';

  var q = String(rrState.homeQuery || "").trim();
  var home = body.querySelector("#rr-home");
  var sections = catList.map(function (cat) {
    var groups = rrGroupsForCategory(cat.id);
    if (q) groups = groups.filter(function (g) { return g.items.some(function (it) { return rrMatchesQuery(it, q); }); });
    if (!groups.length) {
      if (q) return "";
      return '<h2 class="rr-cat-head">' + cat.emoji + " " + rrEsc(cat.name) + "</h2>" +
        '<div class="rr-empty-cat">עדיין אין קבוצות בקטגוריה זו — יתווספו עם המדריך השכונתי.</div>';
    }
    return '<h2 class="rr-cat-head">' + cat.emoji + " " + rrEsc(cat.name) + "</h2>" +
      '<div class="rr-tiles">' + groups.map(function (g) { return rrTileHtml(g, cat.id); }).join("") + "</div>";
  });

  if (!rrState.homeCategory) {
    var ov = overflow.slice();
    if (q) ov = ov.filter(function (g) { return g.items.some(function (it) { return rrMatchesQuery(it, q); }); });
    if (ov.length) {
      sections.push('<h2 class="rr-cat-head">📌 קבוצות נוספות</h2><div class="rr-tiles">' +
        ov.map(function (g) { return rrTileHtml(g, "_more"); }).join("") + "</div>");
    }
  }

  var shown = sections.filter(Boolean).join("");
  home.innerHTML = shown || '<div class="card club-card svc-empty">לא נמצאה קבוצה שמתאימה לחיפוש.</div>';

  home.querySelectorAll("[data-tile]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      rrState.view = "group";
      rrState.groupName = btn.dataset.tile;
      rrState.groupCategoryId = btn.dataset.tileCat;
      rrState.groupQuery = ""; rrState.kupahFilter = "";
      rrPaint(body);
    });
  });

  var qEl = body.querySelector("#rr-q");
  qEl.addEventListener("input", function () { rrState.homeQuery = qEl.value; rrPaintHome(body); });
  body.querySelectorAll("#rr-chips [data-cat]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      rrState.homeCategory = btn.dataset.cat || null;
      rrPaintHome(body);
    });
  });
}

function rrTileHtml(g, catId) {
  return '<button type="button" class="rr-tile" data-tile="' + rrEsc(g.name) + '" data-tile-cat="' + rrEsc(catId) + '">' +
    '<span class="rr-tile__ico">' + g.emoji + "</span>" +
    '<span class="rr-tile__name">' + rrEsc(g.name) + "</span>" +
    '<span class="rr-tile__count">' + g.items.length + " פריטים</span>" +
  "</button>";
}

/* ---------- מסך קבוצה — רשימת/טבלת פריטים ---------- */
function rrPaintGroup(body) {
  var items = rrState.cards.filter(function (c) { return rrGroupOf(c) === rrState.groupName; });
  var isDoctorsGroup = items.some(function (c) { return !!c.kupah; });
  var meta = RR_GROUPS.filter(function (g) { return g.name === rrState.groupName; })[0];
  var emoji = meta ? meta.emoji : "📌";

  var canRecommend = !!(window.CBA && CBA.user && CBA.user.familyId);

  body.innerHTML =
    '<div class="rr-group-head">' +
      '<button type="button" class="btn-ghost btn-sm" id="rr-back">→ חזרה</button>' +
      '<div class="rr-group-title">' + emoji + " " + rrEsc(rrState.groupName) + "</div>" +
    "</div>" +
    '<div class="rr-toolbar">' +
      '<div class="svc-search">' +
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
        '<input id="rr-gq" class="field-input" placeholder="חיפוש בקבוצה הזו…" value="' + rrEsc(rrState.groupQuery) + '">' +
      "</div>" +
      (isDoctorsGroup
        ? '<select id="rr-kupah-filter" class="field-input" style="max-width:160px">' +
            '<option value="">כל הקופות</option>' +
            RR_KUPAH_LIST.map(function (k) { return '<option value="' + rrEsc(k) + '"' + (rrState.kupahFilter === k ? " selected" : "") + ">" + rrEsc(k) + "</option>"; }).join("") +
          "</select>"
        : "") +
      '<select id="rr-sort" class="field-input" style="max-width:160px">' +
        '<option value="name"' + (rrState.sort === "name" ? " selected" : "") + '>מיון: לפי שם</option>' +
        '<option value="likes"' + (rrState.sort === "likes" ? " selected" : "") + '>מיון: הכי מומלץ</option>' +
        '<option value="recent"' + (rrState.sort === "recent" ? " selected" : "") + '>מיון: עודכן לאחרונה</option>' +
      "</select>" +
      (canRecommend ? '<button type="button" class="btn-primary btn-sm" id="rr-add">+ הוספת המלצה</button>' : "") +
    "</div>" +
    '<div id="rr-list"></div>';

  body.querySelector("#rr-back").addEventListener("click", function () {
    rrState.view = "home"; rrPaint(body);
  });
  var gq = body.querySelector("#rr-gq");
  gq.addEventListener("input", function () { rrState.groupQuery = gq.value; rrPaintList(body, items); });
  var kf = body.querySelector("#rr-kupah-filter");
  if (kf) kf.addEventListener("change", function () { rrState.kupahFilter = kf.value; rrPaintList(body, items); });
  var sortEl = body.querySelector("#rr-sort");
  sortEl.addEventListener("change", function () { rrState.sort = sortEl.value; rrPaintList(body, items); });
  var addBtn = body.querySelector("#rr-add");
  if (addBtn) addBtn.addEventListener("click", function () { rrOpenForm(null, rrState.groupName); });

  rrPaintList(body, items);
}

function rrSortItems(list) {
  var out = list.slice();
  if (rrState.sort === "likes") {
    out.sort(function (a, b) {
      var la = (rrState.reactionCounts[a.id] || {}).like || 0;
      var lb = (rrState.reactionCounts[b.id] || {}).like || 0;
      return lb - la;
    });
  } else if (rrState.sort === "recent") {
    out.sort(function (a, b) { return String(b.updatedAt || "") < String(a.updatedAt || "") ? -1 : 1; });
  } else {
    out.sort(function (a, b) { return String(a.title || "").localeCompare(String(b.title || ""), "he"); });
  }
  return out;
}

function rrPaintList(body, items) {
  var list = document.getElementById("rr-list") || body.querySelector("#rr-list");
  var q = String(rrState.groupQuery || "").trim();
  var filtered = items.filter(function (c) {
    if (!rrMatchesQuery(c, q)) return false;
    if (rrState.kupahFilter && c.kupah !== rrState.kupahFilter) return false;
    return true;
  });
  filtered = rrSortItems(filtered);

  if (!filtered.length) {
    list.innerHTML = '<div class="card club-card svc-empty">' +
      (q || rrState.kupahFilter ? "לא נמצאה המלצה שמתאימה." : "עדיין אין המלצות בקבוצה הזו — אפשר להיות הראשונים.") +
      "</div>";
    return;
  }

  list.innerHTML = '<div class="rr-rows">' + filtered.map(rrRowHtml).join("") + "</div>";

  list.querySelectorAll("[data-open-item]").forEach(function (el) {
    el.addEventListener("click", function () { rrOpenDrawer(el.dataset.openItem); });
  });
  list.querySelectorAll("[data-flag]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var it = filtered.filter(function (c) { return c.id === btn.dataset.flag; })[0];
      if (it) rrOpenStaleForm(it);
    });
  });
  filtered.forEach(function (it) {
    var row = list.querySelector('.rr-row[data-id="' + it.id.replace(/"/g, '\\"') + '"]');
    var reactsEl = row && row.querySelector(".svc-card__reacts");
    if (reactsEl) svcBindCardReacts(reactsEl, it.id, "resident");
  });
  /* 27.9.26 — סמלילי יצירת קשר: עוצרים את התפשטות הקליק כדי שלחיצה על
     "התקשר"/וואטסאפ לא תפתח בטעות גם את מגירת הפרטים של השורה שמתחתם
     (אותו דפוס בדיוק כמו כפתור "לא מעודכן" למעלה). */
  list.querySelectorAll(".rr-cbtn").forEach(function (el) {
    el.addEventListener("click", function (e) { e.stopPropagation(); });
  });
  svcBindCallButtons(list);
}

function rrRowHtml(c) {
  var stale = rrState.staleByCard[c.id];
  return '<div class="rr-row" data-id="' + rrEsc(c.id) + '" data-open-item="' + rrEsc(c.id) + '">' +
      '<div class="rr-row__main">' +
        '<div class="rr-row__name">' + rrEsc(c.title) + "</div>" +
        '<div class="rr-row__meta">' +
          (c.phone ? '<span>' + rrEsc(c.phone) + "</span>" : "") +
          (c.address ? '<span>' + rrEsc(c.address) + "</span>" : "") +
          (c.city ? '<span>' + rrEsc(c.city) + "</span>" : "") +
        "</div>" +
        '<div class="rr-row__pills">' + rrAllPillsHtml(c) + "</div>" +
        rrContactIconsHtml(c) + rrOwnerHtml(c) +
        (stale ? '<div class="rr-row__stale">⚑ דווח כלא מעודכן · ממתין לטיפול</div>' : "") +
      "</div>" +
      '<div class="rr-row__side">' +
        svcCardReactsHtml(c.id) +
        '<button type="button" class="btn-ghost btn-sm rr-flag-btn" data-flag="' + rrEsc(c.id) + '">⚑ לא מעודכן</button>' +
      "</div>" +
    "</div>";
}

/* ============================================================================
 *  מגירת פרטים — פותחת עם כל המידע + לייק/דיסלייק/תגובות (בדיוק כמו
 *  services.js) + עריכה/מחיקה ליוצר או למנהל-על/"שירותים".
 * ========================================================================== */
/* אותו אידיום בדיוק כמו home.js/events.js/door.js — CBA.perms מתמלא
   ב-app.js אחרי ההתחברות; המידור האמיתי יושב בכללי Firestore
   (hasPerm('שירותים')), וזו רק הצגה/הסתרה של כפתורים בלקוח. */
function rrCanAdminEdit() {
  return !!(window.CBA && (CBA.isSuper || ((CBA.perms || []).indexOf("שירותים") !== -1)));
}

function rrCloseDrawer() {
  var el = document.getElementById("rr-drawer");
  if (el) el.remove();
  document.removeEventListener("keydown", rrDrawerKey);
}
function rrDrawerKey(e) { if (e.key === "Escape") rrCloseDrawer(); }

function rrOpenDrawer(id) {
  rrCloseDrawer();
  var c = rrState.cards.filter(function (x) { return x.id === id; })[0];
  if (!c) return;

  var myFid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
  var isOwner = myFid && c.familyId === myFid;
  var isAdmin = rrCanAdminEdit();
  var famName = CBA.data.familyDisplayName(c.familyId) || "תושב";

  var overlay = document.createElement("div");
  overlay.id = "rr-drawer";
  overlay.innerHTML =
    '<div class="drawer-backdrop" data-rclose></div>' +
    '<aside class="drawer" role="dialog" aria-label="פרטי המלצה">' +
      '<div class="drawer__head">' +
        '<div class="svc-drawer__head"><div>' +
          '<div class="svc-badge">המלצת תושב' + (c.source === "guide2024" ? " · מהמדריך השכונתי" : "") + "</div>" +
          '<div class="drawer__title">' + rrEsc(c.title) + "</div>" +
          '<div class="drawer__sub">' + rrEsc(famName) + (c.group ? " · " + rrEsc(c.group) : "") + "</div>" +
        "</div></div>" +
        '<button class="drawer__close" data-rclose aria-label="סגור">×</button>' +
      "</div>" +
      '<div class="drawer__body svc-drawer__body">' +
        '<div class="rr-drawer-pills">' + rrAllPillsHtml(c) + "</div>" +
        rrContactIconsHtml(c) + rrOwnerHtml(c) +
        (c.body ? '<p class="svc-p">' + rrEsc(c.body).replace(/\n/g, "<br>") + "</p>" : "") +
        (c.phone ? '<div class="svc-contact"><div class="svc-contact__t"><div class="svc-contact__n">טלפון</div></div>' +
          '<span class="svc-contact__p">' + rrEsc(c.phone) + '</span><div class="svc-contact__acts">' +
          '<button type="button" class="svc-icb" data-call="' + rrEsc(c.phone) + '" title="חיוג">' + svcPhoneIcon() + "</button>" +
          '<a class="svc-icb svc-icb--wa" href="https://wa.me/' + rrEsc(CBA.serviceUtils.waDigits(c.phone)) + '" target="_blank" rel="noopener" title="וואטסאפ">' + svcWaIcon() + "</a>" +
          "</div></div>" : "") +
        (c.address ? '<div class="svc-updated">כתובת: ' + rrEsc(c.address) + (c.city ? ", " + rrEsc(c.city) : "") + "</div>"
                   : (c.city ? '<div class="svc-updated">עיר/אזור: ' + rrEsc(c.city) + "</div>" : "")) +
        (rrSafeUrl(c.website) ? '<div style="margin-top:8px"><a class="btn-ghost btn-sm" href="' + rrEsc(rrSafeUrl(c.website)) +
          '" target="_blank" rel="noopener">לאתר / לעמוד העסק ↗</a></div>' : "") +
        (isAdmin && c.note ? '<div class="svc-hilite"><span class="svc-hilite__ico">!</span><div>הערת מנהל: ' + rrEsc(c.note) + "</div></div>" : "") +
        (isAdmin && c.originalText
          ? '<div class="svc-acc"><button type="button" class="svc-acc__btn" aria-expanded="false"><span>טקסט מקורי מהמדריך (מנהל בלבד)</span>' +
              '<svg class="svc-acc__chev" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>' +
              '<div class="svc-acc__body"><p class="svc-p">' + rrEsc(c.originalText).replace(/\n/g, "<br>") + "</p></div></div>"
          : "") +
        (rrState.staleByCard[c.id] ? '<div class="rr-row__stale" style="margin-top:10px">⚑ דווח כלא מעודכן · ממתין לטיפול</div>' : "") +
        '<div class="hairline-sep" style="height:1px;background:var(--hairline);margin:16px 0"></div>' +
        '<div id="rr-react-zone" data-cardid="' + rrEsc(c.id) + '">' + svcSkeletonReactions() + "</div>" +
        (isOwner || isAdmin
          ? '<div class="svc-admin-zone">' +
              '<div class="svc-admin-zone__label">' + (isOwner ? "הכרטיס שלך" : "פעולות ניהול") + "</div>" +
              '<button type="button" class="btn-ghost btn-sm" id="rr-edit">עריכת הפרטים</button>' +
              (isOwner || isAdmin ? '<button type="button" class="btn-ghost btn-sm" id="rr-del" style="color:#F43F5E">מחיקת הכרטיס</button>' : "") +
            "</div>"
          : "") +
      "</div>" +
      '<div class="drawer__actions drawer__actions--sticky">' +
        '<div class="drawer__actions-main">' +
          (rrMapsHref(c) ? '<a class="btn-ghost" href="' + rrEsc(rrMapsHref(c)) + '" target="_blank" rel="noopener">פתח במפות</a>' : "") +
          '<button type="button" class="btn-ghost" id="rr-flag-drawer">⚑ לא מעודכן</button>' +
          '<button type="button" class="btn-ghost" data-rclose>סגירה</button>' +
        "</div>" +
      "</div>" +
    "</aside>";
  document.body.appendChild(overlay);

  overlay.querySelectorAll("[data-rclose]").forEach(function (el) { el.addEventListener("click", rrCloseDrawer); });
  overlay.querySelectorAll(".svc-acc__btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var acc = btn.parentNode;
      var open = acc.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
  svcBindCallButtons(overlay);

  var editBtn = overlay.querySelector("#rr-edit");
  if (editBtn) editBtn.addEventListener("click", function () { rrOpenForm(c, c.group, !isOwner && isAdmin); });
  var delBtn = overlay.querySelector("#rr-del");
  if (delBtn) delBtn.addEventListener("click", function () { rrDeleteItem(c); });
  var flagBtn = overlay.querySelector("#rr-flag-drawer");
  if (flagBtn) flagBtn.addEventListener("click", function () { rrOpenStaleForm(c); });

  rrPaintReactions(c.id);
  document.addEventListener("keydown", rrDrawerKey);
}

function rrPaintReactions(cardId) {
  CBA.data.getServiceReactions(cardId, function (rres) {
    CBA.data.getServiceComments(cardId, function (cres) {
      var reacts = (rres && rres.ok) ? rres : { like: 0, dislike: 0, mine: null };
      var comments = (cres && cres.ok && cres.comments) || [];
      rrState.reactionCounts[cardId] = { like: reacts.like || 0, dislike: reacts.dislike || 0 };
      rrState.commentCounts[cardId] = comments.length;
      rrState.mineReactions[cardId] = reacts.mine || null;

      var row = document.querySelector('.rr-row[data-id="' + cardId.replace(/"/g, '\\"') + '"] .svc-card__reacts');
      if (row) {
        var wrap = document.createElement("div");
        wrap.innerHTML = svcCardReactsHtml(cardId);
        var fresh = wrap.firstElementChild;
        row.replaceWith(fresh);
        svcBindCardReacts(fresh, cardId, "resident");
      }

      var zone = document.querySelector('#rr-react-zone[data-cardid]');
      if (!zone || zone.dataset.cardid !== cardId) return;
      zone.innerHTML = svcReactionsHtml(cardId, "resident", reacts, comments);
      svcBindReactionZone(zone, cardId, "resident");
    });
  });
}

function rrDeleteItem(c) {
  var myFid = String(((window.CBA && CBA.user) || {}).familyId || "").trim();
  var isOwner = myFid && c.familyId === myFid;
  CBA.ui.confirm("למחוק את ההמלצה לצמיתות? הפעולה לא הפיכה.",
    { title: "מחיקת המלצה", okText: "מחיקה", danger: true }).then(function (ok) {
    if (!ok) return;
    CBA.data.deleteResidentServiceCard(c.id, function (res) {
      if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "מחיקה נכשלה"); return; }
      rrCloseDrawer();
      CBA.ui.toast("ההמלצה נמחקה");
      if (typeof rrRepaint === "function") rrRepaint();
    });
  });
}

/* ============================================================================
 *  טופס הוספה/עריכה — כולל בורר קבוצה (סעיף 2 באפיון: "תושב שמוסיף המלצה
 *  חדשה חייב לבחור לאיזו קבוצה היא שייכת"). isAdminEdit=true חושף גם
 *  את שדה "הערה" (עריכה/מנהל בלבד — לא מוצג לתושב שעורך את שלו).
 * ========================================================================== */
/* 27.9.26 — רשימת הפריטים הקיימים בעץ הוועד לבחירה בטופס (לא טקסט חופשי,
   לבקשת יועד: קישור בלבד למה שכבר קיים בעץ, לא שדה מקביל). אם עדיין לא
   נטען העץ (load נכשל/עוד רץ) — הרשימה ריקה, לא שגיאה: השדה פשוט מציג
   רק "— ללא —" ואפשר לשמור בלעדיו. */
function rrCommitteeItemOptionsHtml(selected) {
  /* 27.9.26 — הבורר המשותף עבר ל-committeeTree.js (itemOptionsHtml) כדי
     שלא ייכתב פעמיים באותה תבנית — גם עורך השירות הרשמי (servicesAdmin.js)
     משתמש בו עכשיו לאותו שדה בדיוק. */
  return (window.CBA && CBA.committeeTree && CBA.committeeTree.itemOptionsHtml)
    ? CBA.committeeTree.itemOptionsHtml(selected)
    : '<option value="">— ללא —</option>';
}

function rrGroupOptionsHtml(selected) {
  var html = '<option value="">— בחרו קבוצה —</option>';
  RR_CATEGORIES.forEach(function (cat) {
    var opts = RR_GROUPS.filter(function (g) { return g.categoryId === cat.id; });
    if (!opts.length) return;
    html += '<optgroup label="' + rrEsc(cat.emoji + " " + cat.name) + '">' +
      opts.map(function (g) {
        return '<option value="' + rrEsc(g.name) + '"' + (selected === g.name ? " selected" : "") + ">" + rrEsc(g.name) + "</option>";
      }).join("") + "</optgroup>";
  });
  html += '<option value="__other__">קבוצה אחרת…</option>';
  return html;
}

function rrOpenForm(existing, presetGroup, isAdminEdit) {
  var isEdit = !!existing;
  var known = rrKnownGroupNames();
  var curGroup = isEdit ? (existing.group || "") : (presetGroup || "");
  var isKnownGroup = !curGroup || !!known[curGroup];

  var html =
    '<div class="form-field form-field--wide"><label>כותרת ההמלצה</label>' +
      '<input class="field-input" id="rr-f-title" maxlength="80" value="' + rrEsc(isEdit ? existing.title : "") +
      '" placeholder="למשל: ד״ר כהן — רופא ילדים"></div>' +
    '<div class="form-field"><label>קבוצה</label>' +
      '<select class="field-input" id="rr-f-group">' + rrGroupOptionsHtml(isKnownGroup ? curGroup : "__other__") + "</select>" +
      '<input class="field-input" id="rr-f-group-other" placeholder="שם הקבוצה" style="margin-top:6px;' +
      (isKnownGroup ? "display:none" : "") + '" value="' + rrEsc(isKnownGroup ? "" : curGroup) + '"></div>' +
    '<div class="form-field form-field--wide"><label>על ההמלצה</label>' +
      '<textarea class="field-input" id="rr-f-body" rows="4" maxlength="1500" placeholder="למה כדאי, מה חשוב לדעת">' +
      rrEsc(isEdit ? existing.body : "") + '</textarea></div>' +
    '<div class="form-field"><label>טלפון (לא חובה)</label>' +
      '<input class="field-input" id="rr-f-phone" dir="ltr" value="' + rrEsc(isEdit ? (existing.phone || "") : "") + '"></div>' +
    '<div class="form-field"><label>עיר/אזור (לא חובה)</label>' +
      '<input class="field-input" id="rr-f-city" value="' + rrEsc(isEdit ? (existing.city || "") : "") + '"></div>' +
    '<div class="form-field"><label>כתובת (לא חובה)</label>' +
      '<input class="field-input" id="rr-f-address" maxlength="150" placeholder="רחוב ומספר, או שם המרכז המסחרי" value="' + rrEsc(isEdit ? (existing.address || "") : "") + '"></div>' +
    '<div class="form-field"><label>אתר או עמוד העסק (לא חובה)</label>' +
      '<input class="field-input" id="rr-f-website" dir="ltr" maxlength="300" placeholder="https://" value="' + rrEsc(isEdit ? (existing.website || "") : "") + '"></div>' +
    '<div class="form-field"><label>קופת חולים (רלוונטי לרופאים בלבד)</label>' +
      '<select class="field-input" id="rr-f-kupah">' +
        '<option value="">—</option>' +
        RR_KUPAH_LIST.map(function (k) { return '<option value="' + rrEsc(k) + '"' + (isEdit && existing.kupah === k ? " selected" : "") + ">" + rrEsc(k) + "</option>"; }).join("") +
      "</select></div>" +
    '<div class="form-field form-field--wide"><label>קישור ב-Google Maps (לא חובה)</label>' +
      '<input class="field-input" id="rr-f-maps" dir="ltr" value="' + rrEsc(isEdit ? (existing.mapsUrl || "") : "") + '"></div>' +
    '<div class="form-field"><label>אחראי מטעם הוועד (לא חובה)</label>' +
      '<select class="field-input" id="rr-f-owner">' + rrCommitteeItemOptionsHtml(isEdit ? existing.committeeItemId : "") + '</select>' +
      '<div class="form-hint">מוצג רק כשקיים פריט מתאים בעץ הוועד. אם חסר — אפשר להוסיף אותו שם קודם (מסך "ועד השיכון").</div></div>' +
    '<div class="form-field form-field--wide"><label>יצירת קשר (לא חובה — כל שדה מציג סמליל בכרטיס רק כשמולא)</label>' +
      '<input class="field-input" id="rr-f-hotline" dir="ltr" placeholder="מוקד טלפוני — מספר" style="margin-bottom:6px" value="' + rrEsc(isEdit ? (existing.hotlinePhone || "") : "") + '">' +
      '<input class="field-input" id="rr-f-wahotline" dir="ltr" placeholder="מוקד וואטסאפ — מספר" style="margin-bottom:6px" value="' + rrEsc(isEdit ? (existing.whatsappHotline || "") : "") + '">' +
      '<input class="field-input" id="rr-f-wagroup" dir="ltr" placeholder="קבוצת וואטסאפ שיכון — קישור הצטרפות" value="' + rrEsc(isEdit ? (existing.whatsappGroupLink || "") : "") + '"></div>' +
    '<div class="form-field form-field--wide"><label>תוויות</label><div class="rr-label-picker">' +
      RR_LABEL_ORDER.map(function (id) {
        var l = RR_LABELS[id];
        var on = isEdit && (existing.labels || []).indexOf(id) !== -1;
        return '<label class="rr-label-opt"><input type="checkbox" data-label="' + id + '"' + (on ? " checked" : "") + ">" +
          rrPillHtml(l.text, l.bg, l.fg, l.emoji) + "</label>";
      }).join("") +
      '<label class="rr-label-opt"><input type="checkbox" id="rr-f-kosher"' + (isEdit && existing.kosher === true ? " checked" : "") + ">כשר</label>" +
    "</div></div>" +
    (isAdminEdit
      ? '<div class="form-field form-field--wide"><label>הערת מנהל (לא מוצגת לתושב)</label>' +
          '<input class="field-input" id="rr-f-note" maxlength="300" value="' + rrEsc((existing && existing.note) || "") + '"></div>'
      : "");

  CBA.ui.dialog({
    title: isEdit ? "עריכת ההמלצה" : "המלצה חדשה",
    html: html, wide: true, sticky: true,
    okText: isEdit ? "שמירה" : "פרסום", cancelText: "ביטול",
    onMount: function (wrap) {
      var sel = wrap.querySelector("#rr-f-group");
      var other = wrap.querySelector("#rr-f-group-other");
      sel.addEventListener("change", function () {
        other.style.display = sel.value === "__other__" ? "" : "none";
      });
    },
    onOk: function (wrap, close) {
      var title = wrap.querySelector("#rr-f-title").value;
      if (!String(title || "").trim()) { CBA.ui.toast("צריך כותרת"); return; }
      var sel = wrap.querySelector("#rr-f-group");
      var group = sel.value === "__other__" ? wrap.querySelector("#rr-f-group-other").value : sel.value;
      var labels = [];
      wrap.querySelectorAll("[data-label]").forEach(function (cb) { if (cb.checked) labels.push(cb.dataset.label); });
      var fields = {
        title: title,
        body: wrap.querySelector("#rr-f-body").value,
        phone: wrap.querySelector("#rr-f-phone").value,
        city: wrap.querySelector("#rr-f-city").value,
        address: wrap.querySelector("#rr-f-address").value,
        website: wrap.querySelector("#rr-f-website").value,
        kupah: wrap.querySelector("#rr-f-kupah").value,
        mapsUrl: wrap.querySelector("#rr-f-maps").value,
        group: group, labels: labels,
        kosher: wrap.querySelector("#rr-f-kosher").checked,
        committeeItemId: wrap.querySelector("#rr-f-owner").value,
        hotlinePhone: wrap.querySelector("#rr-f-hotline").value,
        whatsappHotline: wrap.querySelector("#rr-f-wahotline").value,
        whatsappGroupLink: wrap.querySelector("#rr-f-wagroup").value
      };
      if (isAdminEdit) {
        var noteEl = wrap.querySelector("#rr-f-note");
        if (noteEl) fields.note = noteEl.value;
      }
      var okBtn = wrap.querySelector('[data-dlg="ok"]');
      var done = CBA.ui.busy(okBtn, isEdit ? "שומר…" : "מפרסם…");
      var after = function (res) {
        done();
        if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "השמירה נכשלה"); return; }
        close(true);
        rrCloseDrawer();
        CBA.ui.toast(isEdit ? "ההמלצה עודכנה" : "ההמלצה פורסמה");
        if (typeof rrRepaint === "function") rrRepaint();
      };
      if (!isEdit) CBA.data.createResidentServiceCard(fields, after);
      else if (isAdminEdit) CBA.data.adminUpdateResidentServiceCard(existing.id, fields, after);
      else CBA.data.updateResidentServiceCard(existing.id, fields, after);
    }
  });
}

/* ============================================================================
 *  "לא מעודכן" — טופס דיווח (סעיף 5 באפיון)
 * ========================================================================== */
function rrOpenStaleForm(card) {
  var html =
    '<div class="form-field form-field--wide"><label>מה לא מעודכן?</label>' +
      '<input class="field-input" id="rr-sr-why" maxlength="200" placeholder="למשל: המספר לא עונה, המסעדה נסגרה…"></div>' +
    '<div class="form-field form-field--wide"><label>מידע נוסף שאתה יודע (לא חובה)</label>' +
      '<textarea class="field-input" id="rr-sr-note" rows="3" maxlength="1000" placeholder="פרטים שיעזרו למנהל לתקן"></textarea></div>';

  CBA.ui.dialog({
    title: 'דיווח "לא מעודכן" — ' + card.title,
    html: html, okText: "שליחה", cancelText: "ביטול",
    onOk: function (wrap, close) {
      var why = wrap.querySelector("#rr-sr-why").value;
      if (!String(why || "").trim()) { CBA.ui.toast("צריך לכתוב מה לא מעודכן"); return; }
      var note = wrap.querySelector("#rr-sr-note").value;
      var okBtn = wrap.querySelector('[data-dlg="ok"]');
      var done = CBA.ui.busy(okBtn, "שולח…");
      CBA.data.createStaleReport({ cardId: card.id, cardName: card.title, group: card.group || "", why: why, note: note }, function (res) {
        done();
        if (!res || !res.ok) { CBA.ui.toast((res && res.error) || "השליחה נכשלה"); return; }
        close(true);
        CBA.ui.toast('הדיווח נשלח — תודה!');
        if (typeof rrRepaint === "function") rrRepaint();
      });
    }
  });
}
