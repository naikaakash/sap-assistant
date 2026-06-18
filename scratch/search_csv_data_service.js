const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'data', 'csvDataService.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Searching csvDataService.ts for keywords:');
lines.forEach((line, idx) => {
  if (line.includes('confidence_score') || line.includes('recommended_action') || line.includes('draft_subject') || line.includes('agent_name')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
