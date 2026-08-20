const fs = require('fs');
const path = 'src/style.css';
let content = fs.readFileSync(path, 'utf8');

// 1. Fix variables for OLED and Sidebar
// Light theme sidebar is already #14b8d6. 
// For Dark theme, user wants "azul o celeste". 
// Let's use a deep but clearly blue color for dark sidebar to satisfy "azul" while keeping it dark.
content = content.replace(/--sidebar-bg: #121212;/g, '--sidebar-bg: #0c4a6e;'); // Deep ocean blue

// 2. Fix attendance header - user wants "azul marino mas fuerte"
// Already handled in some places, but let's ensure all table headers use it.
content = content.replace(/background: #00b4d8;/g, 'background: #172554;'); 

// 3. Fix hardcoded dark blue text colors to variables
content = content.replace(/color: #1e293b;/g, 'color: var(--text);');
content = content.replace(/color: #0f172a;/g, 'color: var(--text);'); // Careful with this, but usually #0f172a is used as "black" in light mode

// 4. Fix hardcoded backgrounds that should be surface or bg
content = content.replace(/background: #1e293b;/g, 'background: var(--surface);');
content = content.replace(/background: #0f172a;/g, 'background: var(--bg);');
content = content.replace(/background-color: #1e293b;/g, 'background-color: var(--surface);');

// 5. Calendar widget adaptation
// Ensure it uses variables correctly
content = content.replace(/\.calendar-widget \{[^}]*background: var\(--surface\) !important;[^}]*\}/g, (match) => {
    return match.replace(/background: var\(--surface\) !important;/, 'background: var(--surface);');
});

// 6. Fix specific instances of #00b4d8 that should be navy
content = content.replace(/color: #00b4d8;/g, 'color: var(--accent-teal);'); // Use variable instead of hardcoded

// 7. Ensure .header-logo .title is white/gray in dark mode
// Already handled in multi_replace, but let's be sure.

fs.writeFileSync(path, content);
console.log('Style.css repaired for OLED and Sidebar color.');
