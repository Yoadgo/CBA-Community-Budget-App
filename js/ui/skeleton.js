/* skeleton.js — שלדי טעינה תואמי-צורה (2026-08-25)
   ============================================================================
   הרעיון: במקום גלגל אפור שמסתובב במרכז מסך ריק, מציירים מיד את *הצורה* של
   התוכן שעומד להופיע — כרטיס, טבלה, שורות רשימה — באפור, עם בוהק שעובר
   עליהן. כשהנתונים חוזרים, התוכן האמיתי "מתמלא" לתוך אותו מקום בדיוק במקום
   לקפוץ. זה מרגיש מהיר יותר גם כשזה לא באמת מהיר יותר, וזה מונע את הקפיצה
   שבה כל המסך זז אחרי שנייה.

   כלל לכל שימוש עתידי: בוחרים את הצורה שהכי דומה למה שבאמת יופיע שם.
   שלד שלא דומה לתוצאה גרוע יותר מגלגל, כי הוא מבטיח דבר אחד ומביא אחר.

   כל הפונקציות מחזירות מחרוזת HTML — לא נוגעות ב-DOM בעצמן, בדיוק כמו שאר
   הבנאים באפליקציה. המחלקות עצמן מוגדרות ב-css/loading.css (תחילית sk-).
   ========================================================================== */
window.CBA = window.CBA || {};

CBA.skel = (function () {
  "use strict";

  /* רוחבי שורות משתנים — שורה שכל השורות בה באותו אורך נראית כמו טבלה ריקה,
     לא כמו טקסט שנטען. המחזוריות קבועה (ולא אקראית) כדי ששני ציורים של אותו
     מסך ייראו זהים ולא "ירצדו" בין רענון לרענון. */
  var W = ["86%", "62%", "74%", "55%", "80%", "68%"];
  function w(i) { return W[i % W.length]; }

  function wrap(inner) {
    return '<div class="sk sk-stagger" role="status" aria-live="polite" aria-label="טוען">' + inner + '</div>';
  }
  function line(width, extra) {
    return '<div class="skeleton sk-line' + (extra ? " " + extra : "") + '" style="width:' + width + '"></div>';
  }
  function rep(n, fn) {
    var out = "", i;
    for (i = 0; i < n; i++) out += fn(i);
    return out;
  }

  /* שורות רשימה: עיגול + שתי שורות טקסט, ואופציונלית שני כפתורים בקצה.
     בשימוש במדריך התושבים, בשריונים הממתינים ובכל רשימה של פריטים. */
  function rows(n, opts) {
    opts = opts || {};
    var avatar = opts.avatar !== false;
    return wrap(rep(n || 4, function (i) {
      return '<div class="sk-box sk-flex">' +
        (avatar ? '<div class="skeleton sk-av"></div>' : "") +
        '<div class="sk-stack">' + line(w(i)) + line(w(i + 3), "sk-sm") + '</div>' +
        (opts.actions ? '<div class="skeleton sk-btn"></div><div class="skeleton sk-btn"></div>' : "") +
        '</div>';
    }));
  }

  /* כרטיסים מלאים — כותרת, שתי שורות, ותג סטטוס בפינה. */
  function cards(n) {
    return wrap(rep(n || 2, function (i) {
      return '<div class="sk-box">' +
        '<div class="sk-flex" style="margin-bottom:14px">' +
          '<div class="sk-stack">' + line("45%", "sk-title") + '</div>' +
          '<div class="skeleton sk-pill" style="width:88px"></div>' +
        '</div>' +
        line(w(i)) + '<div style="height:9px"></div>' + line(w(i + 1)) +
        '</div>';
    }));
  }

  /* רשת אריחים — מסך השירותים ומסך ניהול השירותים. */
  function tiles(n) {
    return '<div class="sk sk-grid sk-stagger" role="status" aria-live="polite" aria-label="טוען">' +
      rep(n || 6, function (i) {
        return '<div class="sk-box">' +
          '<div class="skeleton sk-ico"></div>' +
          '<div style="height:12px"></div>' +
          line("70%", "sk-title") + '<div style="height:9px"></div>' + line(w(i), "sk-sm") +
          '</div>';
      }) + '</div>';
  }

  /* טבלה — שורת כותרות ואז שורות. cols קובע כמה עמודות מדומות בכל שורה. */
  function table(n, cols) {
    var c = cols || 5;
    function cells(cls, iBase) {
      return '<div class="sk-tr">' + rep(c, function (j) {
        return '<div class="skeleton ' + cls + '" style="width:' + w(iBase + j) + '"></div>';
      }) + '</div>';
    }
    return wrap('<div class="sk-box sk-table">' +
      cells("sk-th", 0) +
      rep(n || 6, function (i) { return cells("sk-line sk-sm", i + 1); }) +
      '</div>');
  }

  /* אריחי סיכום עליונים (KPI) — ר' .sk-summary/.sk-stat ב-loading.css. */
  function stats(n) {
    return '<div class="sk-summary sk-stagger">' +
      rep(n || 4, function () { return '<div class="skeleton sk-stat"></div>'; }) + '</div>';
  }

  /* סעיפים בתוך כרטיס — מסך ניהול המיילים, פרטי שירות. */
  function sections(n) {
    return wrap(rep(n || 3, function (i) {
      return '<div class="sk-box">' +
        line("38%", "sk-title") + '<div style="height:14px"></div>' +
        line(w(i)) + '<div style="height:9px"></div>' + line(w(i + 2), "sk-sm") +
        '</div>';
    }));
  }

  /* שבבים — לוח הזמינות של שריון המועדון (שעות פנויות). */
  function chips(n) {
    return '<div class="sk-chipwrap sk-stagger" role="status" aria-live="polite" aria-label="טוען">' +
      rep(n || 10, function () { return '<div class="skeleton sk-chip"></div>'; }) + '</div>';
  }

  /* טופס בתוך מגירה — זוגות תווית+שדה. */
  function form(n) {
    return wrap('<div class="sk-formgrid">' + rep(n || 6, function (i) {
      return '<div class="sk-field">' + line("42%", "sk-sm") + '<div class="skeleton sk-input"></div>' + '</div>';
    }) + '</div>');
  }

  /* תצוגת קבלה/תמונה. */
  function img() {
    return '<div class="sk sk-stagger" role="status" aria-live="polite" aria-label="טוען"><div class="skeleton sk-img"></div></div>';
  }

  /* עץ הוועד — שורש, שתי רמות מתפצלות. הצורה מזוהה מיד גם באפור. */
  function tree() {
    function row(k) {
      return '<div class="sk-tree__row">' + rep(k, function () {
        return '<div class="skeleton sk-tree__node"></div>';
      }) + '</div>';
    }
    return '<div class="sk-tree sk-stagger" role="status" aria-live="polite" aria-label="טוען">' +
      row(1) + row(3) + row(4) + '</div>';
  }

  return {
    rows: rows, cards: cards, tiles: tiles, table: table, stats: stats,
    sections: sections, chips: chips, form: form, img: img, tree: tree
  };
})();
