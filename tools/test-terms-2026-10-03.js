/* test-terms-2026-10-03.js — מסך "תנאי שימוש וזכויות": נפתח, נסגר, הכפתור במקומו בתפריט. */
const fs = require("fs"), path = require("path");
const { JSDOM } = require(path.join(__dirname, "node_modules", "jsdom"));
const root = path.join(__dirname, "..");
let ok = 0, bad = 0;
function t(name, cond) { if (cond) ok++; else { bad++; console.log("✗ " + name); } }

const dom = new JSDOM("<!doctype html><body></body>", { runScripts: "outside-only" });
const w = dom.window;
w.eval(fs.readFileSync(path.join(root, "js/ui/terms.js"), "utf8"));
t("CBA.terms קיים", w.CBA && w.CBA.terms && typeof w.CBA.terms.open === "function");
w.CBA.terms.open();
const bd = w.document.getElementById("terms-backdrop");
t("נפתח", !!bd);
t("6 כרטיסיות", bd.querySelectorAll(".sec-card").length === 6);
t("11 סעיפים", bd.querySelectorAll(".cl").length === 11);
t("הנוסח המלא סגור כברירת מחדל", !bd.querySelector(".sec-tech").open);
t("השם מופיע", bd.textContent.includes("יועד גולן"));
t("שורת ©", bd.querySelector(".terms-foot").textContent.includes("©"));
t("אין < לא מקודד בטקסט", !/&lt;|undefined|NaN/.test(bd.innerHTML));
w.document.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Escape" }));
t("Esc סוגר", !w.document.getElementById("terms-backdrop"));
w.CBA.terms.open({ full: true });
t("full פותח את הנוסח", w.document.querySelector("#terms-backdrop .sec-tech").open);
w.document.querySelector("#terms-backdrop .sec-x").click();
t("X סוגר", !w.document.getElementById("terms-backdrop"));

const app = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
const iSec = app.indexOf("help += li('data-panel-security'"), iTerms = app.indexOf("help += li('data-panel-terms'"),
      iRep = app.indexOf("help += li('data-panel-report'");
t("הכפתור מתחת לאבטחה ומעל דיווח", iSec > 0 && iTerms > iSec && iRep > iTerms);
t("יש handler", app.includes('querySelector("[data-panel-terms]")') && app.includes("CBA.terms.open()"));
const idx = fs.readFileSync(path.join(root, "index.html"), "utf8");
t("נטען ב-index.html", /js\/ui\/terms\.js\?v=/.test(idx));
console.log((bad ? "✗" : "✓") + " terms: " + ok + " עברו, " + bad + " נכשלו");
process.exit(bad ? 1 : 0);
