const fs = require('fs');
let css = fs.readFileSync('src/style.css', 'utf-8');

// 1. Fix lock-menu-dropdown text color
css = css.replace(/#lock-menu-dropdown div \{[^}]*color: #334155;[^}]*\}/g, (match) => {
    return match.replace('color: #334155;', 'color: var(--text) !important;');
});

// Fallback if the above regex is too strict
css = css.replace(/color: #334155;/g, 'color: var(--text) !important;');

// 2. Replace hardcoded blue glows with dynamic glow variable
// We target rgba(59, 130, 246, ...) and rgba(0, 180, 216, ...)
css = css.replace(/rgba\(59, 130, 246, 0\.[1-9]\)/g, 'var(--glow-blue)');
css = css.replace(/rgba\(0, 180, 216, 0\.[1-9]\)/g, 'var(--glow-blue)');
css = css.replace(/rgba\(0, 210, 255, 0\.[1-9]\)/g, 'var(--glow-blue)');

fs.writeFileSync('src/style.css', css);
