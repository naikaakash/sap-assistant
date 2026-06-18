const fs = require('fs');
const path = require('path');

const guidePath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\docs\\manual-business-testing-guide.md';
const checklistPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\docs\\manual-testing-checklist.md';

const guide = fs.readFileSync(guidePath, 'utf8');
const checklist = fs.readFileSync(checklistPath, 'utf8');

function findMatches(text, name) {
  console.log(`\n=== Matches in ${name} ===`);
  const lines = text.split('\n');
  lines.forEach((line, idx) => {
    if (
      line.includes('30') || 
      line.includes('31') || 
      line.includes('22') || 
      line.includes('399,050') || 
      line.includes('389,450') || 
      line.includes('152,100') || 
      line.includes('148,500') ||
      line.includes('5 overdue') ||
      line.includes('PL01 has its respective')
    ) {
      if (line.match(/(TC-|displays|matches|sum|count|exactly|verify|displays exactly|Alex|Plant)/i)) {
        console.log(`Line ${idx + 1}: ${line.trim()}`);
      }
    }
  });
}

findMatches(guide, 'guide');
findMatches(checklist, 'checklist');
