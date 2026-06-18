const fs = require('fs');
const path = require('path');

const projectDir = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.next' || file === '.git' || file === 'graphify-out') {
      return;
    }
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(fullPath));
    } else {
      results.push(fullPath);
    }
  });
  return results;
}

const files = walk(projectDir);
console.log(`Scanning ${files.length} files...`);

files.forEach(file => {
  if (file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.js') || file.endsWith('.json')) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('mock-po-data.json')) {
        console.log(`Found mock-po-data.json reference in: ${file}`);
      }
      if (content.includes('4500002001')) {
        console.log(`Found 4500002001 reference in: ${file}`);
      }
    } catch (e) {
      // ignore
    }
  }
});
console.log('Scan complete.');
