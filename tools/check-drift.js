#!/usr/bin/env node
/* check-drift.js — סחיפה גלויה (גל 0, 29.9.2026)
   ----------------------------------------------------------------------------
   סופר בכל קובץ CSS ערכים גולמיים שאמורים להגיע מ-tokens.css:
   צבעי hex, border-radius בפיקסלים, box-shadow, font-size בפיקסלים.
   מדפיס טבלה לפי קובץ, ואת הסך הכולל. מספר גדול מאפס = יש מה לנקות;
   המספר של היום הוא קו הבסיס, וכל גל אמור להוריד אותו.

   הרצה:  node tools/check-drift.js            (מהשורש של הריפו)
          node tools/check-drift.js --baseline (שומר את המספרים ל-tools/drift-baseline.json)
          node tools/check-drift.js --fail     (יוצא עם קוד 1 אם קובץ עלה מעל קו הבסיס שלו)
   בלי תלויות. tokens.css עצמו לא נספר — הוא המקור. */
"use strict";
var fs = require("fs"), path = require("path");
var root = path.resolve(__dirname, "..");
var dir = path.join(root, "css");
var files = fs.readdirSync(dir).filter(function (f) { return /\.css$/.test(f) && f !== "tokens.css"; }).sort();
var RX = {
  hex:    /#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi,
  radius: /border-radius\s*:\s*[^;{}]*\d+(?:\.\d+)?(?:px|rem|%)/gi,
  shadow: /box-shadow\s*:\s*(?!none|var\()[^;{}]+/gi,
  fsize:  /font-size\s*:\s*\d+(?:\.\d+)?(?:px|rem)/gi
};
function strip(css) {  /* בלי הערות — הערה שמזכירה #111827 אינה חריגה */
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
var args = process.argv.slice(2);
var basePath = path.join(__dirname, "drift-baseline.json");
var base = fs.existsSync(basePath) ? JSON.parse(fs.readFileSync(basePath, "utf8")) : {};
var out = {}, tot = { hex: 0, radius: 0, shadow: 0, fsize: 0, all: 0 }, worse = [];
files.forEach(function (f) {
  var css = strip(fs.readFileSync(path.join(dir, f), "utf8"));
  var r = { hex: 0, radius: 0, shadow: 0, fsize: 0, all: 0 };
  Object.keys(RX).forEach(function (k) {
    var m = css.match(RX[k]); r[k] = m ? m.length : 0; r.all += r[k]; tot[k] += r[k];
  });
  tot.all += r.all; out[f] = r;
  if (base[f] && r.all > base[f].all) worse.push(f + " (" + base[f].all + " → " + r.all + ")");
});
function pad(s, n) { s = String(s); return s.length >= n ? s : s + " ".repeat(n - s.length); }
console.log(pad("file", 24) + pad("hex", 6) + pad("radius", 8) + pad("shadow", 8) + pad("font", 6) + pad("all", 6) + "baseline");
Object.keys(out).forEach(function (f) {
  var r = out[f], b = base[f] ? base[f].all : "";
  console.log(pad(f, 24) + pad(r.hex, 6) + pad(r.radius, 8) + pad(r.shadow, 8) + pad(r.fsize, 6) + pad(r.all, 6) + b);
});
console.log(pad("TOTAL", 24) + pad(tot.hex, 6) + pad(tot.radius, 8) + pad(tot.shadow, 8) + pad(tot.fsize, 6) + pad(tot.all, 6));
if (args.indexOf("--baseline") !== -1) {
  fs.writeFileSync(basePath, JSON.stringify(out, null, 1));
  console.log("\nקו הבסיס נשמר: " + basePath);
}
if (worse.length) {
  console.log("\n⚠️ קבצים שעלו מעל קו הבסיס שלהם:\n  " + worse.join("\n  "));
  if (args.indexOf("--fail") !== -1) process.exit(1);
}
