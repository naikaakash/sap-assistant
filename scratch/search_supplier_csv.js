const fs = require('fs');
const path = require('path');

const csvDir = path.join(__dirname, '..', 'procurement_data_sample');
const files = fs.readdirSync(csvDir);

console.log('Searching for S100009 in CSV files:');
for (const file of files) {
  if (file.endsWith('.csv')) {
    const filePath = path.join(csvDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('S100009')) {
        console.log(`${file} Line ${idx + 1}: ${line.trim()}`);
      }
    });
  }
}
