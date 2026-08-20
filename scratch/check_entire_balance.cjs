const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

let pos = 0;
const stack = [];
const errors = [];

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
      
      if (['div', 'section', 'main', 'header', 'aside', 'body', 'html'].includes(tagName)) {
        if (stack.length === 0) {
          errors.push(`Extra closing </${tagName}> at char ${pos}`);
        } else {
          const popped = stack.pop();
          if (popped.tag !== tagName) {
            errors.push(`Mismatched close tag </${tagName}> at char ${pos}, expected </${popped.tag}> (opened at char ${popped.pos})`);
            // put it back or keep searching
          }
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

      if (['div', 'section', 'main', 'header', 'aside', 'body', 'html'].includes(tagName) && !isSelfClosing) {
        const idMatch = tagContent.match(/id=["']([^"']+)["']/);
        const classMatch = tagContent.match(/class=["']([^"']+)["']/);
        stack.push({ tag: tagName, pos, id: idMatch ? idMatch[1] : null, class: classMatch ? classMatch[1] : null });
      }
      pos = endTag + 1;
    }
  } else {
    pos++;
  }
}

console.log(`Open tags left in stack: ${stack.length}`);
stack.forEach((item, idx) => {
  console.log(`${idx}: <${item.tag} id="${item.id || ''}" class="${item.class || ''}"> opened at char ${item.pos}`);
});

console.log(`\nErrors found: ${errors.length}`);
errors.forEach(err => console.log(err));
