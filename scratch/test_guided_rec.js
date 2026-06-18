const BASE = 'http://localhost:3000/api';

async function run() {
  const url = `${BASE}/recommendations?exception_id=EX_001&po_number=4500000437&item_number=00030&agent_name=PO_OVERDUE_AGENT`;
  console.log('Fetching:', url);
  try {
    const res = await fetch(url);
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response body:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
