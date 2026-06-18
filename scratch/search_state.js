const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'app', 'page.tsx');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Searching for activeRecommendation in app/page.tsx:');
lines.forEach((line, idx) => {
  if (line.includes('activeRecommendation') || line.includes('setActiveRecommendation')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
