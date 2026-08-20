const fs = require('fs');

function fixFile(filePath) {
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // 1. Dropdown text color fix (already did, but making sure)
    content = content.replace(/color:\s*#334155/g, 'color: var(--text) !important');
    
    // 2. Replace any blue-ish RGBA shadows/glows with purple
    // rgba(59, 130, 246, ...) -> var(--glow-blue)
    content = content.replace(/rgba\(59, 130, 246, 0\.[1-9]\d*\)/g, 'var(--glow-blue)');
    // rgba(0, 180, 216, ...) -> var(--glow-blue)
    content = content.replace(/rgba\(0, 180, 216, 0\.[1-9]\d*\)/g, 'var(--glow-blue)');
    // rgba(0, 210, 255, ...) -> var(--glow-blue)
    content = content.replace(/rgba\(0, 210, 255, 0\.[1-9]\d*\)/g, 'var(--glow-blue)');
    
    // 3. Fix specific blue gradients
    content = content.replace(/rgba\(59, 130, 246, 0\.05\)/g, 'rgba(192, 38, 211, 0.05)');
    
    fs.writeFileSync(filePath, content);
}

fixFile('src/style.css');
fixFile('index.html');
