const fs = require('fs');
const content = fs.readFileSync('app/page.tsx', 'utf-8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('antigravity')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
