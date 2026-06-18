const fs = require('fs');

const code = fs.readFileSync('C:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\app\\page.tsx', 'utf8');

// Simple regex tag counter
const openingDivs = (code.match(/<div(\s|>)/g) || []).length;
const closingDivs = (code.match(/<\/div>/g) || []).length;

const openingSections = (code.match(/<section(\s|>)/g) || []).length;
const closingSections = (code.match(/<\/section>/g) || []).length;

const openingFragments = (code.match(/<>/g) || []).length;
const closingFragments = (code.match(/<\/>/g) || []).length;

console.log('JSX Tag Balance Analysis:');
console.log(`div tags: opened = ${openingDivs}, closed = ${closingDivs} (diff = ${openingDivs - closingDivs})`);
console.log(`section tags: opened = ${openingSections}, closed = ${closingSections} (diff = ${openingSections - closingSections})`);
console.log(`Fragment tags: opened = ${openingFragments}, closed = ${closingFragments} (diff = ${openingFragments - closingFragments})`);

// Find any specific tag mismatch
