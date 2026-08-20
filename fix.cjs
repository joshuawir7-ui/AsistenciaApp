const fs = require('fs'); 
const files = ['src/style.css', 'src/main.js', 'index.html']; 
files.forEach(f => { 
  let content = fs.readFileSync(f, 'utf8'); 
  // Replace background: white
  content = content.replace(/background(-color)?:\s*(white|#f8fafc|#f1f5f9|#fafafa|#f4f4f5)\b/gi, 'background$1: var(--surface)'); 
  // Replace colors that are dark for text inside these white buttons (like the AL DIA tag which has black text)
  // Let's not touch text color automatically to avoid making things invisible, but backgrounds for sure.
  fs.writeFileSync(f, content); 
});
