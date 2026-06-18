import fs from 'fs';
import path from 'path';

const searchDir = path.resolve('src');

function getFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFiles(filePath, fileList);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const patterns = [
  { name: 'Inline Open Qty Subtraction', regex: /[^a-zA-Z0-9_\u00a0]([a-zA-Z0-9_]+)\s*-\s*([a-zA-Z0-9_]*received_[a-zA-Z0-9_]*)/gi },
  { name: 'Inline Open Value Multiplication', regex: /([a-zA-Z0-9_]*open_[a-zA-Z0-9_]*)\s*\*\s*([a-zA-Z0-9_]*price[a-zA-Z0-9_]*|net_price)/gi },
  { name: 'Date/Overdue Diff', regex: /(diff|days|overdue|past).*=.*-\s*(due_date|delivery_date|reqDate)/gi },
  { name: 'Priority Assignment', regex: /priorityLevel\s*=/gi }
];

console.log("Starting code analysis for duplicates...");
const files = getFiles(searchDir);

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const relativePath = path.relative(process.cwd(), file);
  
  patterns.forEach(pat => {
    let match;
    pat.regex.lastIndex = 0; // reset
    while ((match = pat.regex.exec(content)) !== null) {
      // Find line number
      const before = content.substring(0, match.index);
      const lineNum = before.split('\n').length;
      const lines = content.split('\n');
      const matchedLine = lines[lineNum - 1].trim();
      
      // Filter out comments and test/mocks if necessary, but list them for risk analysis
      console.log(`[RISK - ${pat.name}] in ${relativePath}:${lineNum}`);
      console.log(`  Line: ${matchedLine}`);
    }
  });
}
