async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/agents/ack-followup/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendationIds: ["AR00000290"] })
    });
    console.log('Status:', res.status);
    const json = await res.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
