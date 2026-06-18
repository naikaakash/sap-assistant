const fs = require('fs');
const path = require('path');

const devServerLog = 'C:/Users/Aalok/.gemini/antigravity/brain/101d0c59-51c9-4655-b28d-aeff74c6fd6d/.system_generated/tasks/task-2430.log';
let port = 3000;

if (fs.existsSync(devServerLog)) {
  const logContent = fs.readFileSync(devServerLog, 'utf-8');
  const match = logContent.match(/http:\/\/localhost:(\d+)/);
  if (match) {
    port = parseInt(match[1], 10);
    console.log(`Detected dev server running on port ${port}`);
  } else {
    console.log(`Could not detect port in logs, trying default 3000`);
  }
}

async function runTests() {
  console.log('\n--- 🧪 Supplier Reminder Email Send Foundation Tests ---');

  // Test Case 1: Valid Mock Send
  console.log('\nTest Case 1: Valid Mock Send');
  const sendUrl = `http://localhost:${port}/api/supplier-communications/reminders/send`;
  
  const payload1 = {
    recommendationId: 'demo-rec-1002', // Overdue PO (4500001002) in RECOMMENDED status
    recipientEmail: 'alice@sterlingelectronics.com',
    ccEmails: ['buyer.cc@aalok.com'],
    subject: 'Action Required: Overdue PO 4500001002',
    body: 'Dear supplier, please verify your schedule.',
    sentBy: 'test-runner'
  };

  const res1 = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload1)
  });

  if (!res1.ok) {
    throw new Error(`Test 1 Failed: Status ${res1.status} - ${await res1.text()}`);
  }

  const data1 = await res1.json();
  console.log('Response status:', res1.status);
  console.log('Send Mode:', data1.sendMode);
  console.log('Delivery Status:', data1.deliveryStatus);
  console.log('Message:', data1.message);

  if (data1.sendMode !== 'MOCK' || data1.deliveryStatus !== 'MOCK_SENT') {
    throw new Error(`Test 1 Failed: Expected MOCK / MOCK_SENT, got ${data1.sendMode} / ${data1.deliveryStatus}`);
  }
  console.log('✅ Test Case 1 Passed');

  // Test Case 2: Verify Recommendation Transitioned to PENDING_SUPPLIER_RESPONSE
  console.log('\nTest Case 2: Verify Recommendation Transition');
  const recUrl = `http://localhost:${port}/api/recommendations/demo-rec-1002`;
  const res2 = await fetch(recUrl);
  if (!res2.ok) {
    throw new Error(`Test 2 Failed: Status ${res2.status}`);
  }
  const data2 = await res2.json();
  const rec = data2.recommendation || data2;
  console.log('Recommendation lifecycleStatus:', rec.lifecycleStatus);
  console.log('Recommendation currentOwner:', rec.currentOwner);

  if (rec.lifecycleStatus !== 'PENDING_SUPPLIER_RESPONSE' || rec.currentOwner !== 'SUPPLIER') {
    throw new Error(`Test 2 Failed: Expected PENDING_SUPPLIER_RESPONSE / SUPPLIER, got ${rec.lifecycleStatus} / ${rec.currentOwner}`);
  }
  console.log('✅ Test Case 2 Passed');

  // Test Case 3: Missing Recipient Email Fails Safely
  console.log('\nTest Case 3: Missing Recipient Email Fails Safely');
  const payload3 = {
    recommendationId: 'demo-rec-1003',
    recipientEmail: '', // Empty
    subject: 'Action Required',
    body: 'Details...',
    sentBy: 'test-runner'
  };

  const res3 = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload3)
  });

  const data3 = await res3.json();
  console.log('Response status:', res3.status);
  console.log('Error Message:', data3.error);

  if (res3.status !== 400 || !data3.error.includes('missing')) {
    throw new Error(`Test 3 Failed: Expected status 400 with missing email error, got ${res3.status} - ${JSON.stringify(data3)}`);
  }
  console.log('✅ Test Case 3 Passed');

  // Test Case 4: Closed Recommendation Cannot Send Reminders
  console.log('\nTest Case 4: Closed Recommendation Reject');
  const payload4 = {
    recommendationId: 'demo-rec-1020', // Closed PO in CLOSED_NO_ACTION status
    recipientEmail: 'alice@sterlingelectronics.com',
    subject: 'Action Required',
    body: 'Details...',
    sentBy: 'test-runner'
  };

  const res4 = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload4)
  });

  const data4 = await res4.json();
  console.log('Response status:', res4.status);
  console.log('Error Message:', data4.error);

  if (res4.status !== 400 || !data4.error.includes('closed')) {
    throw new Error(`Test 4 Failed: Expected status 400 with closed error, got ${res4.status} - ${JSON.stringify(data4)}`);
  }
  console.log('✅ Test Case 4 Passed');

  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! Phase 9A Email send foundation is verified.');
}

runTests().catch(err => {
  console.error('❌ Test execution failed:', err);
  process.exit(1);
});
