const fs = require('fs');

const code = fs.readFileSync('C:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\app\\page.tsx', 'utf8');

// Parse lines and trace opened/closed tags
const lines = code.split('\n');
let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  
  // Find all <div or </div> in the line
  const matches = line.match(/<div(\s|>)|<\/div>/g) || [];
  for (const match of matches) {
    if (match.startsWith('<div')) {
      stack.push({ tag: 'div', line: i + 1 });
    } else {
      if (stack.length > 0 && stack[stack.length - 1].tag === 'div') {
        stack.pop();
      } else {
        console.log(`Unmatched closing </div> on line ${i + 1}`);
      }
    }
  }
}

console.log('\nRemaining unclosed div tags in stack:');
for (const item of stack) {
  console.log(`Unclosed <div on line ${item.line}`);
}
