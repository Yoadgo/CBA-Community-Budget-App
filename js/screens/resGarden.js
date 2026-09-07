/* ============================================================================
 *  "מראה שיכון" — אזור התושב (2026-09-07, צעד 3 של מודול הגינון)
 * ----------------------------------------------------------------------------
 *  שני מסכים:
 *    resGarden     — "הדיווחים שלי". זה מה שהטאב פותח.
 *    resGardenNew  — טופס דיווח חדש. לא טאב; מגיעים אליו מכפתור בתוך המסך.
 *
 *  שלוש החלטות שמעצבות את הקוד כאן:
 *  1. **התושב רואה חמישה שלבים בלבד.** הדגל ("ממתין לאישור" וכו') מוצג
 *     כתג נפרד ובניסוח אנושי — לא כשלב שישי. ר' stageIdx/FLAG_TEXT למטה.
 *  2. **המפה היא הרכיב המשותף** (CBA.map ב-resident.js) במצב pin, והנעיצה
 *     מוחזרת מנורמלת 0–1. לא לשנות ליחידות אחרות — ר' ההערה שם.
 *  3. **סינון הדיווחים נעשה בשרת** לפי המושב החתום. המסך הזה לא מקבל בכלל
 *     דיווחים של אחרים, ולכן אין כאן שום בדיקת בעלות.
 * ========================================================================== */
(function () {
  var CBA = window.CBA = window.CBA || {};
  CBA.screens = CBA.screens || {};
  var esc = CBA.esc;

  var STAGES = ["התקבל", "נבדק", "מתוכנן", "בטיפול", "הושלם"];
  function stageIdx(s) { var i = STAGES.indexOf(String(s || "").trim()); return i < 0 ? 0 : i; }

  /* ניסוח הדגל לתושב. השם הפנימי ("ממתין לאישור") הוא שפה של הצוות —
     התושב מקבל משפט שמסביר לו מה קורה ולמה עוד לא סגור. */
  var FLAG_TEXT = {
    "ממתין לאישור":      "בוצע, ממתין לאישור הוועד",
    "הוחזר להשלמה":      "הוחזר לצוות להשלמה",
    "דורש בדיקה בשטח":   "ממתין לבדיקה בשטח",
    "דורש בדיקה חוזרת":  "נבדק שוב בעקבות המשוב שלך",
    "נגררה":             "נדחה לשבוע הבא"
  };

  /* קטגוריה -> סמליל וצבע. ההתאמה לפי מילת מפתח ולא לפי מחרוזת מדויקת,
     כדי שעריכה קלה של השם בטאב ההגדרות לא תשבור את התצוגה. */
  var CATS = [
    { key: "lawn",  match: /דשא|מדשא/,        ico: "lawn"  },
    { key: "water", match: /השקי|ממטר/,        ico: "water" },
    { key: "tree",  match: /^עצים|עץ/,          ico: "tree"  },
    { key: "prune", match: /גיזום|שיח/,        ico: "prune" },
    { key: "weed",  match: /עשבי|קרקע/,        ico: "weed"  },
    { key: "clean", match: /ניקיון|גזם/,       ico: "clean" },
    { key: "bed",   match: /ערוג|שתיל/,        ico: "bed"   }
  ];
  function catOf(name) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].match.test(name)) return CATS[i];
    return { key: "clean", ico: "clean" };
  }

  var ICONS = {
    leaf:  '<path d="M4 20c0-8 5-14 16-15 1 11-5 16-13 16"/><path d="M4 20c3-5 6-8 11-10"/>',
    lawn:  '<path d="M3 20h18"/><path d="M6 20c0-4 1-6 2-8M11 20c0-5 1-8 1-11M16 20c0-4 1-6 2-8"/>',
    water: '<path d="M12 3c3.5 4.5 5.5 7.4 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10.4 8.5 7.5 12 3Z"/>',
    tree:  '<path d="M12 21v-5"/><path d="M12 16a5.5 5.5 0 0 0 1.6-10.8A4.4 4.4 0 0 0 7 5.6 4.2 4.2 0 0 0 8.6 14 5.4 5.4 0 0 0 12 16Z"/>',
    prune: '<circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M7.7 16.3 18 4M16.3 16.3 6 4"/>',
    weed:  '<path d="M12 21v-8"/><path d="M12 13c0-3-2.2-5-5-5 0 3 2.2 5 5 5Z"/><path d="M12 13c0-3.4 2.5-5.6 5.6-5.6 0 3.4-2.5 5.6-5.6 5.6Z"/>',
    clean: '<path d="M5 7h14"/><path d="M10 7V4.6h4V7"/><path d="M6.6 7 8 20h8l1.4-13"/>',
    bed:   '<circle cx="12" cy="8.4" r="2.4"/><path d="M12 6c0-2.2-3.6-2.2-3.6 0S12 10.6 12 8.4ZM12 6c0-2.2 3.6-2.2 3.6 0S12 10.6 12 8.4ZM12 21v-8"/>',
    plus:  '<path d="M12 5v14M5 12h14"/>',
    send:  '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5Z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    list:  '<path d="M11 6h9M11 12h9M11 18h9"/><path d="m4 6 1.3 1.3L7 4.7M4 12l1.3 1.3L7 10.7M4 18l1.3 1.3L7 16.7"/>',
    back:  '<path d="M15 18l-6-6 6-6"/>'
  };
  function ico(n, cls) {
    return '<svg class="' + (cls || "") + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || "") + '</svg>';
  }

  function moduleHead(title, sub, rightHTML) {
    return '<div class="gd-head">' +
      '<span class="gd-head__em">' + ico("leaf") + '</span>' +
      '<div class="gd-head__t"><h3>' + esc(title) + '</h3><p>' + esc(sub) + '</p></div>' +
      (rightHTML || "") + '</div>';
  }

  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.getDate() + "." + (d.getMonth() + 1);
  }

  /* מטא (קטגוריות/אזורים) נטען פעם אחת ונשמר — הוא כמעט לא משתנה, ואין
     סיבה לבקש אותו מהשרת בכל מעבר בין שני המסכים. */
  var META = null;
  function withMeta(cb) {
    if (META) return cb(META);
    CBA.data.getGardenMeta(function (res) {
      META = (res && res.ok) ? res : { categories: [], areas: [], photoMax: 8 };
      cb(META);
    });
  }

  /* ==========================================================================
   *  מסך 1 — הדיווחים שלי
   * ======================================================================== */
  CBA.screens.resGarden = {
    render: function (container) {
      // .gd-screen עוטף כדי שהרקע האמביינטי (::before) יהיה מתחת לתוכן —
      // בלעדיו הזכוכית על הכרטיסים לא מראה כלום. ר' css/garden.css.
      container.innerHTML = '<div class="gd-screen">' +
        moduleHead("מראה שיכון", "הדיווחים שלך על הגינון, ומה קרה איתם",
          '<button type="button" class="gd-newbtn" id="gd-new">' + ico("plus") + ' דיווח חדש</button>') +
        '<div id="gd-list">' + (CBA.skel ? CBA.skel.cards(4) : "") + '</div>' +
      '</div>';

      container.querySelector("#gd-new").addEventListener("click", function () {
        CBA.navigate("resGardenNew");
      });

      var listEl = container.querySelector("#gd-list");
      var all = [], filter = "all";

      function counts() {
        var open = 0, wait = 0, done = 0;
        all.forEach(function (r) {
          if (r.stage === "הושלם") done++;
          else { open++; if (r.flag === "ממתין לאישור") wait++; }
        });
        return { open: open, wait: wait, done: done };
      }

      function draw() {
        if (!all.length) {
          listEl.innerHTML = CBA.ui.emptyState({
            title: "עדיין לא דיווחת על כלום",
            sub: "אם משהו בגינון לא נראה תקין — צילום, נקודה על המפה, וזהו.",
            ctaLabel: "לדיווח הראשון", ctaAttr: 'id="gd-empty-cta"'
          });
          var c = listEl.querySelector("#gd-empty-cta");
          if (c) c.addEventListener("click", function () { CBA.navigate("resGardenNew"); });
          return;
        }
        var n = counts();
        var shown = all.filter(function (r) {
          if (filter === "open") return r.stage !== "הושלם";
          if (filter === "done") return r.stage === "הושלם";
          return true;
        });

        listEl.innerHTML =
          '<div class="gd-stats">' +
            statTile("open", "clock", n.open, "בטיפול") +
            statTile("wait", "list", n.wait, "ממתין לאישור") +
            statTile("done", "check", n.done, "הושלמו") +
          '</div>' +
          '<div class="gd-seg" role="tablist">' +
            segBtn("all", "הכול", all.length) +
            segBtn("open", "פתוחים", n.open) +
            segBtn("done", "הושלמו", n.done) +
          '</div>' +
          '<div class="gd-reps">' + shown.map(card).join("") + '</div>';

        Array.prototype.forEach.call(listEl.querySelectorAll(".gd-seg button"), function (b) {
          b.addEventListener("click", function () { filter = b.dataset.f; draw(); });
        });
        Array.prototype.forEach.call(listEl.querySelectorAll("[data-fb]"), function (b) {
          b.addEventListener("click", function () { sendFeedback(b.dataset.id, b.dataset.fb === "y"); });
        });
      }

      function statTile(kind, iconName, num, label) {
        return '<div class="gd-stat is-' + kind + '"><u>' + ico(iconName) + '</u>' +
          '<div><b>' + num + '</b><span>' + esc(label) + '</span></div></div>';
      }
      function segBtn(k, label, n) {
        return '<button type="button" data-f="' + k + '"' +
          (filter === k ? ' class="on"' : '') + '>' + esc(label) + ' · ' + n + '</button>';
      }

      function card(r) {
        var c = catOf(r.category);
        var idx = stageIdx(r.stage);
        var done = r.stage === "הושלם";
        var dots = "";
        for (var i = 0; i < 5; i++) {
          dots += '<i class="' + (i < idx ? "on" : (i === 4 && done ? "done" : (i === idx && done ? "done" : ""))) + '"></i>';
        }
        var flagTxt = r.flag ? (FLAG_TEXT[r.flag] || r.flag) : "";
        var crit = r.flag === "דורש בדיקה חוזרת";
        return '<article class="gd-rep k-' + c.key + '">' +
          '<span class="gd-rep__th"' +
            (r.photos && r.photos.length ? ' data-photo="' + esc(r.photos[0]) + '"' : '') + '></span>' +
          '<div class="gd-rep__b">' +
            '<div class="gd-rep__top">' +
              '<span class="gd-rep__id">#' + esc(r.id) + '</span>' +
              '<span class="gd-kchip">' + ico(c.ico) + esc(r.category) + '</span>' +
            '</div>' +
            '<div class="gd-rep__t">' + esc(r.desc || r.place || r.category) + '</div>' +
            '<div class="gd-rep__m">' +
              (r.place ? esc(r.place) + " · " : (r.area ? esc(r.area) + " · " : "")) +
              'דווח ב-' + fmtDate(r.date) + '</div>' +
            '<div class="gd-axis' + (done ? " is-done" : "") + '">' +
              '<span class="gd-track">' + dots + '</span>' +
              '<b>' + esc(r.stage) + '</b>' +
              (flagTxt ? '<span class="gd-flag' + (crit ? " is-crit" : "") + '">' + esc(flagTxt) + '</span>' : '') +
            '</div>' +
            (r.mergedInto
              ? '<div class="gd-rep__merged">אוחד עם פנייה #' + esc(r.mergedInto) +
                (r.closure ? ' · נסגר: ' + esc(r.closure) : '') + '</div>'
              : (done && r.closure && r.closure !== "בוצע"
                  ? '<div class="gd-rep__merged">נסגר: ' + esc(r.closure) + '</div>' : '')) +
            (r.canFeedback
              ? '<div class="gd-fb"><span>הטיפול היה בסדר?</span>' +
                '<button type="button" class="y" data-fb="y" data-id="' + esc(r.id) + '">כן, תודה</button>' +
                '<button type="button" class="n" data-fb="n" data-id="' + esc(r.id) + '">לא הושלם</button></div>'
              : (r.feedback ? '<div class="gd-rep__merged">המשוב שלך: ' + esc(r.feedback) + '</div>' : '')) +
          '</div></article>';
      }

      function sendFeedback(id, positive) {
        function done(note) {
          CBA.data.gardenFeedback(id, positive, note || "", function (res) {
            if (!res || !res.ok) {
              CBA.ui.alert((res && res.error) || "לא הצלחנו לשמור את המשוב");
              return;
            }
            CBA.ui.toast(positive ? "תודה!" : "המשוב נשלח לוועד");
            load();
          });
        }
        if (positive) return done("");
        // CBA.ui.prompt מחזירה Promise (null בביטול), לא מקבלת callback
        CBA.ui.prompt("המשוב עובר למנהל הגינון, והתקלה תיבדק שוב.", {
          title: "מה לא הושלם?",
          placeholder: "למשל: הענף הוסר אבל הגזם נשאר על השביל",
          okText: "שליחת משוב"
        }).then(function (txt) { if (txt !== null) done(txt); });
      }

      function load() {
        CBA.data.getMyGardenReports(function (res) {
          all = (res && res.ok) ? (res.rows || []) : [];
          draw();
        });
      }
      withMeta(function () { load(); });
    }
  };

  /* ==========================================================================
   *  מסך 2 — דיווח חדש
   * ======================================================================== */
  CBA.screens.resGardenNew = {
    render: function (container) {
      var WORD_MAX = 75;
      var state = { cat: "", x: null, y: null, photos: [] };
      var user = (window.CBA && CBA.user) || {};

      withMeta(function (meta) {
        var cats = (meta.categories || []);
        var photoMax = meta.photoMax || 8;

        container.innerHTML = '<div class="gd-screen">' +
          moduleHead("דיווח חדש", "מגיע ישירות לצוות הגינון · שיכון פלמחים",
            '<button type="button" class="gd-backbtn" id="gd-back">' + ico("back") + ' לדיווחים שלי</button>') +
          '<div class="gd-cols">' +
            '<div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">מה הבעיה? <s>*</s></p>' +
                '<div class="gd-cats" id="gd-cats">' +
                  cats.map(function (c) {
                    var k = catOf(c);
                    return '<button type="button" class="gd-cat k-' + k.key + '" data-c="' + esc(c) + '">' +
                      '<u>' + ico(k.ico) + '</u>' + esc(c) + '</button>';
                  }).join("") +
                '</div>' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">תיאור <em id="gd-wc">0 / ' + WORD_MAX + ' מילים</em></p>' +
                '<textarea class="gd-inp gd-ta" id="gd-desc" rows="3" ' +
                  'placeholder="מה קרה ואיפה בדיוק? כמה משפטים מספיקים."></textarea>' +
                '<div class="gd-meter"><i id="gd-meter"></i></div>' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">תמונות <em><span id="gd-pc">0</span> / ' + photoMax + '</em></p>' +
                '<div class="gd-thumbs" id="gd-thumbs">' +
                  '<button type="button" class="gd-th add" id="gd-add">+</button>' +
                '</div>' +
                '<input type="file" id="gd-file" accept="image/*" multiple hidden>' +
              '</div>' +
              '<div class="gd-card">' +
                // בלי "מולא אוטומטית": השם והבית אכן מגיעים מהמושב, אבל הטלפון
                // **אינו** חלק מתשובת ההתחברות — ותווית שמבטיחה מילוי אוטומטי
                // ליד שדה ריק היא שקר קטן בממשק.
                '<p class="gd-lbl">הפרטים שלך</p>' +
                '<div class="gd-row2">' +
                  '<div class="gd-inp is-ro">' +
                    esc(((user.firstName || "") + " " + (user.family || "")).trim() || "—") +
                    (user.house ? " · בית " + esc(user.house) : "") + '</div>' +
                  '<input class="gd-inp" id="gd-phone" inputmode="tel" placeholder="טלפון לחזרה (לא חובה)" ' +
                    'value="' + esc(user.phone || "") + '">' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">איפה זה? <s>*</s> <em>לחצו על המפה</em></p>' +
                '<div class="gd-map" id="gd-map"></div>' +
                '<p class="gd-hint" id="gd-loc">לא צריך דיוק — מספיק לסמן ליד איזה בית זה.</p>' +
              '</div>' +
              '<div class="gd-card">' +
                '<p class="gd-lbl">מיקום במילים <em>לא חובה</em></p>' +
                '<input class="gd-inp" id="gd-place" placeholder="למשל: על השביל בין 341 ל-343">' +
              '</div>' +
              '<button type="button" class="gd-cta" id="gd-send">' + ico("send") + ' שליחת דיווח</button>' +
            '</div>' +
          '</div>' +
        '</div>';

        container.querySelector("#gd-back").addEventListener("click", function () {
          CBA.navigate("resGarden");
        });

        // ---- קטגוריה ----
        container.querySelector("#gd-cats").addEventListener("click", function (e) {
          var b = e.target.closest(".gd-cat");
          if (!b) return;
          Array.prototype.forEach.call(container.querySelectorAll(".gd-cat"), function (x) {
            x.classList.toggle("on", x === b);
          });
          state.cat = b.dataset.c;
        });

        // ---- מונה מילים ----
        var descEl = container.querySelector("#gd-desc");
        var wcEl = container.querySelector("#gd-wc");
        var meterEl = container.querySelector("#gd-meter");
        function words(t) { return String(t).trim().split(/\s+/).filter(Boolean); }
        descEl.addEventListener("input", function () {
          var w = words(descEl.value);
          if (w.length > WORD_MAX) {           // חיתוך רך: לא חוסמים הקלדה באמצע מילה
            descEl.value = w.slice(0, WORD_MAX).join(" ");
            w = words(descEl.value);
          }
          wcEl.textContent = w.length + " / " + WORD_MAX + " מילים";
          meterEl.style.width = Math.min(100, (w.length / WORD_MAX) * 100) + "%";
        });

        // ---- תמונות ----
        var fileEl = container.querySelector("#gd-file");
        var thumbsEl = container.querySelector("#gd-thumbs");
        var addBtn = container.querySelector("#gd-add");
        addBtn.addEventListener("click", function () { fileEl.click(); });
        fileEl.addEventListener("change", function () {
          var files = Array.prototype.slice.call(fileEl.files || []);
          files.forEach(function (f) {
            if (state.photos.length >= photoMax) return;
            var rd = new FileReader();
            rd.onload = function () {
              var b64 = String(rd.result).split(",")[1];
              state.photos.push({ name: f.name, mime: f.type || "image/jpeg", data: b64 });
              drawThumbs(String(rd.result));
            };
            rd.readAsDataURL(f);
          });
          fileEl.value = "";
        });
        function drawThumbs(lastUrl) {
          if (lastUrl) {
            var el = document.createElement("span");
            el.className = "gd-th";
            el.style.backgroundImage = "url(" + lastUrl + ")";
            el.innerHTML = '<x aria-hidden="true">✕</x>';
            el.dataset.i = String(state.photos.length - 1);
            el.querySelector("x").addEventListener("click", function () {
              var i = parseInt(el.dataset.i, 10);
              state.photos.splice(i, 1);
              el.remove();
              Array.prototype.forEach.call(thumbsEl.querySelectorAll(".gd-th:not(.add)"), function (t, k) {
                t.dataset.i = String(k);
              });
              sync();
            });
            thumbsEl.insertBefore(el, addBtn);
          }
          sync();
        }
        function sync() {
          container.querySelector("#gd-pc").textContent = state.photos.length;
          addBtn.style.display = state.photos.length >= photoMax ? "none" : "grid";
        }

        // ---- מפה במצב נעיצה ----
        var locEl = container.querySelector("#gd-loc");
        CBA.map.render(container.querySelector("#gd-map"), {
          head: false, search: false, legend: false, popup: false, pin: true,
          onPin: function (n) {
            state.x = n.x; state.y = n.y;
            locEl.textContent = "המיקום סומן. אפשר ללחוץ שוב כדי להזיז.";
            locEl.classList.add("is-ok");
          }
        });

        // ---- שליחה ----
        var sendBtn = container.querySelector("#gd-send");
        sendBtn.addEventListener("click", function () {
          if (!state.cat) return CBA.ui.alert("צריך לבחור קטגוריה");
          var place = container.querySelector("#gd-place").value.trim();
          if (state.x === null && !place) {
            return CBA.ui.alert("צריך לסמן מיקום על המפה או לכתוב אותו במילים");
          }
          sendBtn.disabled = true;
          sendBtn.innerHTML = "שולח…";
          CBA.data.submitGardenReport({
            category: state.cat,
            desc: descEl.value.trim(),
            place: place,
            phone: container.querySelector("#gd-phone").value.trim(),
            x: state.x, y: state.y,
            photos: state.photos
          }, function (res) {
            if (!res || !res.ok) {
              sendBtn.disabled = false;
              sendBtn.innerHTML = ico("send") + " שליחת דיווח";
              return CBA.ui.alert((res && res.error) || "לא הצלחנו לשלוח את הדיווח");
            }
            CBA.ui.toast("הדיווח נשלח · מספר " + res.id);
            CBA.navigate("resGarden");
          });
        });
      });
    }
  };
})();
