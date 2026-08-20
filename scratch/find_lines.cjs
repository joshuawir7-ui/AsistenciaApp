const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

function findLine(pos) {
  const sub = html.slice(0, pos);
  return sub.split('\n').length;
}

console.log("Pos 124495 is line: " + findLine(124495));
console.log("Pos 124504 is line: " + findLine(124504));
