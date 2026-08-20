const fs = require('fs');
let css = fs.readFileSync('src/style.css', 'utf-8');

// Update FAB buttons
css = css.replace(/background: var\(--brand-celeste, #00d2ff\);/g, 'background: var(--active-bg);');
css = css.replace(/color: var\(--brand-celeste, #00d2ff\);/g, 'color: var(--active-bg);');

fs.writeFileSync('src/style.css', css);
