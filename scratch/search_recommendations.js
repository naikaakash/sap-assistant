const fs = require('fs');
const content = fs.readFileSync('data/app-recommendations.json', 'utf-8');
const recs = JSON.parse(content);
const targetPos = ['4500002038', '4500002022', '4500002008', '4500002027'];
recs.forEach(r => {
  if (targetPos.includes(r.purchaseOrderNumber)) {
    console.log(JSON.stringify(r, null, 2));
  }
});
