/*
 * Print rules for the session card. Kept as one stylesheet because most of it has to reach
 * into the app shell (which this feature does not own): hide the navigation and skip link,
 * let the page use the full paper width, and force black on white whatever the theme.
 * `:has` finds the shell's grid wrapper without needing a class on it.
 */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  nav, a[href="#main"] { display: none !important; }
  div:has(> main#main) { display: block !important; min-height: 0 !important; }
  main#main { max-width: none !important; padding: 0 !important; }
  html, body { background: #fff !important; color: #000 !important; }
  .session-card, .session-card * {
    color: #000 !important;
    background: transparent !important;
    border-color: #000 !important;
    box-shadow: none !important;
  }
  .session-card { border: 0 !important; padding: 0 !important; font-size: 11pt; }
}
`;

export function PrintStyles() {
  return <style>{PRINT_CSS}</style>;
}
