const fs = require('fs');
const path = require('path');

function walkDir(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        results = results.concat(walkDir(filePath));
      }
    } else {
      if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.css') || file.endsWith('.md')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const files = walkDir('.');
files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  if (content.toLowerCase().includes('antigravity')) {
    console.log(`Found in ${file}`);
  }
});
