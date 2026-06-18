const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'page.tsx');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

const keywords = ['action history', 'action list', 'actions', 'actionList', 'history', 'buyerAction'];

console.log('Searching for actions/drawers in app/page.tsx:');
lines.forEach((line, idx) => {
  const lineLower = line.toLowerCase();
  if (keywords.some(kw => lineLower.includes(kw)) && (line.includes('===') || line.includes('tab') || line.includes('render') || line.includes('style') || line.includes('onClick'))) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
