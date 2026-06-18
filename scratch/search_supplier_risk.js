const fs = require('fs');
const path = require('path');

const mockErpPath = path.join(__dirname, '..', 'src', 'services', 'mockErpService.ts');
const csvDataPath = path.join(__dirname, '..', 'src', 'services', 'data', 'csvDataService.ts');

function searchFile(filePath, query) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  console.log(`\nSearching for "${query}" in ${path.basename(filePath)}:`);
  lines.forEach((line, idx) => {
    if (line.includes(query)) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  });
}

searchFile(mockErpPath, 'risk');
searchFile(csvDataPath, 'S100009');
searchFile(csvDataPath, 'risk');
