const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// We want to count open vs close divs from start of index.html to the start of "#custom-date-picker-modal"
const targetIndex = html.indexOf('id="custom-date-picker-modal"');
const htmlBefore = html.slice(0, targetIndex);

let pos = 0;
const stack = [];

while (pos < htmlBefore.length) {
  if (htmlBefore.slice(pos, pos + 4) === '<!--') {
    const endComment = htmlBefore.indexOf('-->', pos + 4);
    if (endComment === -1) break;
    pos = endComment + 3;
    continue;
  }
  if (htmlBefore[pos] === '<') {
    if (htmlBefore[pos + 1] === '/') {
      const endTag = htmlBefore.indexOf('>', pos + 2);
      if (endTag === -1) break;
      const tagName = htmlBefore.slice(pos + 2, endTag).trim().split(/\s+/)[0].toLowerCase();
      
      if (tagName === 'div') {
        if (stack.length === 0) {
          console.log(`Warning: Found closing </div> at pos ${pos} but stack is empty!`);
        } else {
          stack.pop();
        }
      }
      pos = endTag + 1;
    } else if (htmlBefore[pos + 1] === '!' || htmlBefore[pos + 1] === '?') {
      const endTag = htmlBefore.indexOf('>', pos + 2);
      if (endTag === -1) break;
      pos = endTag + 1;
    } else {
      const endTag = htmlBefore.indexOf('>', pos + 1);
      if (endTag === -1) break;
      const tagContent = htmlBefore.slice(pos + 1, endTag);
      const isSelfClosing = tagContent.endsWith('/') || ['meta', 'link', 'br', 'hr', 'img', 'input'].includes(tagContent.trim().split(/\s+/)[0].toLowerCase());
      const tagName = tagContent.trim().split(/\s+/)[0].toLowerCase();

      if (tagName === 'div' && !isSelfClosing) {
        const idMatch = tagContent.match(/id=["']([^"']+)["']/);
        const classMatch = tagContent.match(/class=["']([^"']+)["']/);
        stack.push({ pos, id: idMatch ? idMatch[1] : null, class: classMatch ? classMatch[1] : null });
      }
      pos = endTag + 1;
    }
  } else {
    pos++;
  }
}

console.log(`Unclosed <div> tags before target: ${stack.length}`);
stack.forEach((item, idx) => {
  console.log(`${idx}: <div id="${item.id || ''}" class="${item.class || ''}"> at char ${item.pos}`);
});
