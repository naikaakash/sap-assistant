async function run() {
  try {
    const res = await fetch('http://localhost:3000/api/agents/ack-followup/queue?days=3');
    const json = await res.json();
    if (!json.success) {
      console.error('API failed:', json.error);
      return;
    }
    const inQueue = json.queue.find(item => item.recommendation_id === 'AR00000290');
    const inSent = json.sent.find(item => item.recommendation_id === 'AR00000290');
    console.log('In queue:', !!inQueue);
    console.log('In sent:', !!inSent);
    if (inSent) {
      console.log('Item in Sent:', JSON.stringify(inSent, null, 2));
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
