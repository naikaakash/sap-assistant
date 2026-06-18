const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath, query);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes(query)) {
        console.log(`Found "${query}" in ${fullPath}`);
      }
    }
  }
}

const srcDir = path.join(__dirname, '..', 'src');
console.log('Searching src for "confidence_score":');
searchDir(srcDir, 'confidence_score');

console.log('\nSearching src for "recommended_action":');
searchDir(srcDir, 'recommended_action');
