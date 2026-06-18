const fs = require('fs');

const code = fs.readFileSync('C:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\app\\page.tsx', 'utf8');

const lines = code.split('\n');
let stack = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const matches = line.match(/<div(\s|>)|<\/div>/g) || [];
  for (const match of matches) {
    if (match.startsWith('<div')) {
      stack.push({ tag: 'div', line: i + 1 });
      console.log(`[Line ${i + 1}] PUSH div (Stack size: ${stack.length})`);
    } else {
      if (stack.length > 0) {
        const popped = stack.pop();
        console.log(`[Line ${i + 1}] POP div (closed line ${popped.line})`);
      } else {
        console.log(`[Line ${i + 1}] UNMATCHED closing </div>`);
      }
    }
  }
}
