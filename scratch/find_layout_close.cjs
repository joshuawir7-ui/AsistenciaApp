const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Find `<div class="app-layout">` position
const layoutStart = html.indexOf('<div class="app-layout">');
if (layoutStart === -1) {
  console.log("Could not find app-layout start");
  process.exit(1);
}

// Find matching closing div
let pos = layoutStart;
const stack = [];
let foundClose = -1;

while (pos < html.length) {
  if (html.slice(pos, pos + 4) === '<!--') {
    const endComment = html.indexOf('-->', pos + 4);
    if (endComment === -1) break;
    pos = endComment + 3;
    continue;
  }
  if (html[pos] === '<') {
    if (html[pos + 1] === '/') {
      const endTag = html.indexOf('>', pos + 2);
      if (endTag === -1) break;
      const tagName = html.slice(pos + 2, endTag).trim().split(/\s+/)[0].toLowerCase();
      
      if (tagName === 'div') {
        const popped = stack.pop();
        if (stack.length === 0) {
          foundClose = pos;
          break;
        }
      }
      pos = endTag + 1;
    } else if (html[pos + 1] === '!' || html[pos + 1] === '?') {
      const endTag = html.indexOf('>', pos + 2);
      if (endTag === -1) break;
      pos = endTag + 1;
    } else {
      const endTag = html.indexOf('>', pos + 1);
      if (endTag === -1) break;
      const tagContent = html.slice(pos + 1, endTag);
      const isSelfClosing = tagContent.endsWith('/') || ['meta', 'link', 'br', 'hr', 'img', 'input'].includes(tagContent.trim().split(/\s+/)[0].toLowerCase());
      const tagName = tagContent.trim().split(/\s+/)[0].toLowerCase();

      if (tagName === 'div' && !isSelfClosing) {
        stack.push(pos);
      }
      pos = endTag + 1;
    }
  } else {
    pos++;
  }
}

function getLine(pos) {
  return html.slice(0, pos).split('\n').length;
}

if (foundClose !== -1) {
  console.log(`app-layout starts at line ${getLine(layoutStart)} (char ${layoutStart}) and closes at line ${getLine(foundClose)} (char ${foundClose})`);
} else {
  console.log("Could not find matching close tag for app-layout");
}
