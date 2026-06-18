const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, '..', 'app', 'page.tsx');
const lines = fs.readFileSync(pagePath, 'utf8').split('\n');

lines.forEach((line, idx) => {
  if (line.includes('editingReminder')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
