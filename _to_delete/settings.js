/* מסך "הגדרות".
   כרגע רק שלד — בהמשך: הוספה/עריכה של סעיפי תקציב ועוד. */
window.CBA = window.CBA || {};
CBA.screens = CBA.screens || {};

CBA.screens.settings = {
  title: "הגדרות",
  render(container) {
    container.innerHTML = `
      <div class="placeholder">
        <div class="placeholder__emoji">⚙️</div>
        <div class="placeholder__title">הגדרות</div>
        <div>כאן תוכל להוסיף ולערוך סעיפי תקציב ולשלוט בהגדרות המערכת.</div>
      </div>
    `;
  }
};
