const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'services', 'mockErpService.ts');
const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');

console.log('Searching mockErpService.ts for keywords:');
lines.forEach((line, idx) => {
  if (line.includes('Recommendation') || line.includes('Agent')) {
    console.log(`Line ${idx + 1}: ${line.trim()}`);
  }
});
