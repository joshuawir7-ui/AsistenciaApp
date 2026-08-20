const fs = require('fs');
let css = fs.readFileSync('src/style.css', 'utf-8');

// Update Dark Theme variables
css = css.replace(/--accent-blue: #a855f7;/, '--accent-blue: #c026d3; /* Pinkish Purple */');
css = css.replace(/--accent-teal: #7c3aed;/, '--accent-teal: #9333ea;');
css = css.replace(/--docente: #a855f7;/, '--docente: #c026d3;');
css = css.replace(/--acudiente: #7c3aed;/, '--acudiente: #9333ea;');
css = css.replace(/--glow-blue: rgba\(168, 85, 247, 0.15\);/, '--glow-blue: rgba(192, 38, 211, 0.25);');
css = css.replace(/--glow-teal: rgba\(124, 58, 237, 0.15\);/, '--glow-teal: rgba(147, 51, 234, 0.25);');

// Add --active-bg to :root (it's already at the top of the file)
if (!css.includes('--active-bg:')) {
  css = css.replace(/:root \{/, ':root {\n  --active-bg: var(--accent-blue);');
  css = css.replace(/\[data-theme=\"light\"\] \{/, '[data-theme="light"] {\n  --active-bg: var(--brand-celeste);');
}

// Update active link styles
css = css.replace(/background: var\(--brand-celeste\);/g, (match, offset) => {
    // Only replace if it's within .nav-link.active or similar
    return 'background: var(--active-bg);';
});

fs.writeFileSync('src/style.css', css);
