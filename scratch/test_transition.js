const BASE = 'http://localhost:3000/api';

async function run() {
  const recommendationId = 'demo-rec-006';
  console.log(`Sending transition request to close ${recommendationId}...`);
  try {
    const res = await fetch(`${BASE}/recommendations/${recommendationId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nextStatus: 'CLOSED_NO_ACTION',
        closureReason: 'Testing closure from script',
        expectedVersion: 1,
        updatedBy: 'tester'
      })
    });
    console.log('Transition Status:', res.status);
    const data = await res.json();
    console.log('Transition Response body:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error during fetch:', err);
  }
}

run();
