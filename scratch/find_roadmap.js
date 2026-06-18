const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    if (item === 'node_modules' || item === '.next' || item === '.git' || item === 'graphify-out') continue;
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      searchDir(fullPath);
    } else if (stat.isFile() && (item.endsWith('.md') || item.endsWith('.txt') || item.endsWith('.json'))) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('phase 5') || content.toLowerCase().includes('phase 4d') || content.toLowerCase().includes('milestone')) {
        console.log(`Match in: ${fullPath}`);
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('phase 5') || line.toLowerCase().includes('phase 4d') || line.toLowerCase().includes('milestone') || line.toLowerCase().includes('next phase')) {
            console.log(`  Line ${idx + 1}: ${line.trim().substring(0, 100)}`);
          }
        });
      }
    }
  }
}

searchDir(path.join(__dirname, '..'));
