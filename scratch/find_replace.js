const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'page.tsx');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Searching for .replace in app/page.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('.replace')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
