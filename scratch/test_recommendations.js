// scratch/test_recommendations.js — Programmatic verification of Phase 8B Recommendation API endpoints
const assert = require('assert').strict;

const BASE_URL = 'http://localhost:3000/api/recommendations';

async function runTests() {
  console.log('--- Phase 8B Recommendation API Verification Run ---');

  // 1. Preconditions check
  console.log('Checking server availability...');
  try {
    const check = await fetch(`${BASE_URL}`);
    assert.equal(check.status, 200);
    console.log('Next.js server is online on port 3000.');
  } catch (e) {
    console.error('Server is not online on port 3000! Start development server first.');
    process.exit(1);
  }

  const results = [];

  // TC-1: List seed recommendations
  console.log('\n[TC-1] Querying all recommendations...');
  try {
    const res = await fetch(BASE_URL);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.recommendations));
    assert(data.total >= 3, 'Must have at least 3 seed recommendations');
    console.log(`TC-1 PASS. Found ${data.total} recommendations.`);
    results.push({ name: 'TC-1: List Seed Recommendations', status: 'PASS' });
  } catch (err) {
    console.error('TC-1 FAIL:', err);
    results.push({ name: 'TC-1: List Seed Recommendations', status: 'FAIL', error: err.message });
  }

  // TC-2: Fetch single seed recommendation by ID
  console.log('\n[TC-2] Fetching detail for seed rec-seed-001...');
  try {
    const res = await fetch(`${BASE_URL}/rec-seed-001`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.recommendationId, 'rec-seed-001');
    assert.equal(data.lifecycleStatus, 'PENDING_BUYER_ACTION');
    console.log('TC-2 PASS. Detail for rec-seed-001 matches seed data.');
    results.push({ name: 'TC-2: Fetch Recommendation by ID', status: 'PASS' });
  } catch (err) {
    console.error('TC-2 FAIL:', err);
    results.push({ name: 'TC-2: Fetch Recommendation by ID', status: 'FAIL', error: err.message });
  }

  // TC-3: Create new recommendation
  console.log('\n[TC-3] Creating new recommendation...');
  let newRecId;
  let newRecVersion;
  try {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceModule: 'OVERDUE_PO',
        purchaseOrderNumber: '4500000437',
        purchaseOrderItem: '00040',
        supplierId: 'VEND-001',
        supplierName: 'Test Supplier',
        recommendationType: 'SEND_SUPPLIER_REMINDER',
        issueReason: 'Test run check.',
        recommendedActionText: 'Run validation tests.'
      })
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    newRecId = data.recommendationId;
    newRecVersion = data.version;
    assert.equal(data.lifecycleStatus, 'RECOMMENDED');
    assert.equal(data.version, 1);
    assert.equal(data.verificationStatus, 'NOT_READY');
    console.log(`TC-3 PASS. Created recommendation ID: ${newRecId}`);
    results.push({ name: 'TC-3: Create Recommendation', status: 'PASS' });
  } catch (err) {
    console.error('TC-3 FAIL:', err);
    results.push({ name: 'TC-3: Create Recommendation', status: 'FAIL', error: err.message });
  }

  // TC-4: Update recommendation and verify version increment
  console.log('\n[TC-4] Updating recommendation fields...');
  try {
    assert(newRecId, 'Requires newRecId');
    const res = await fetch(`${BASE_URL}/${newRecId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: newRecVersion,
        recommendedActionText: 'Updated test execution path.'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.recommendedActionText, 'Updated test execution path.');
    assert.equal(data.version, newRecVersion + 1);
    newRecVersion = data.version;
    console.log(`TC-4 PASS. Update succeeded. New version: ${newRecVersion}`);
    results.push({ name: 'TC-4: Update Recommendation (Successful)', status: 'PASS' });
  } catch (err) {
    console.error('TC-4 FAIL:', err);
    results.push({ name: 'TC-4: Update Recommendation (Successful)', status: 'FAIL', error: err.message });
  }

  // TC-5: Verify optimistic concurrency lock (409 Conflict)
  console.log('\n[TC-5] Testing optimistic concurrency (stale update)...');
  try {
    assert(newRecId, 'Requires newRecId');
    const res = await fetch(`${BASE_URL}/${newRecId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        expectedVersion: newRecVersion - 1, // Stale expectedVersion!
        recommendedActionText: 'Stale update content.'
      })
    });
    assert.equal(res.status, 409);
    const data = await res.json();
    assert(data.error.includes('conflict'));
    console.log('TC-5 PASS. Stale update correctly blocked with 409 Conflict:', data.error);
    results.push({ name: 'TC-5: Optimistic Concurrency Conflict (409)', status: 'PASS' });
  } catch (err) {
    console.error('TC-5 FAIL:', err);
    results.push({ name: 'TC-5: Optimistic Concurrency Conflict (409)', status: 'FAIL', error: err.message });
  }

  // TC-6: Transition lifecycle status
  console.log('\n[TC-6] Testing status transition to PENDING_BUYER_ACTION...');
  try {
    assert(newRecId, 'Requires newRecId');
    const res = await fetch(`${BASE_URL}/${newRecId}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nextStatus: 'PENDING_BUYER_ACTION',
        expectedVersion: newRecVersion,
        updatedBy: 'tester.run'
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.lifecycleStatus, 'PENDING_BUYER_ACTION');
    assert.equal(data.currentOwner, 'BUYER');
    assert.equal(data.version, newRecVersion + 1);
    newRecVersion = data.version;
    console.log(`TC-6 PASS. Status transitioned to PENDING_BUYER_ACTION. New version: ${newRecVersion}`);
    results.push({ name: 'TC-6: Status Transition', status: 'PASS' });
  } catch (err) {
    console.error('TC-6 FAIL:', err);
    results.push({ name: 'TC-6: Status Transition', status: 'FAIL', error: err.message });
  }

  // TC-7: Link manual action
  console.log('\n[TC-7] Testing action linking...');
  try {
    assert(newRecId, 'Requires newRecId');
    const res = await fetch(`${BASE_URL}/${newRecId}/link-action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actionId: '92960f3a-5005-473d-a8c6-a98b13d8424e',
        expectedVersion: newRecVersion
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(data.linkedActionIds.includes('92960f3a-5005-473d-a8c6-a98b13d8424e'));
    assert.equal(data.version, newRecVersion + 1);
    newRecVersion = data.version;
    console.log(`TC-7 PASS. Action linked. Linked IDs: ${JSON.stringify(data.linkedActionIds)}`);
    results.push({ name: 'TC-7: Action Linking', status: 'PASS' });
  } catch (err) {
    console.error('TC-7 FAIL:', err);
    results.push({ name: 'TC-7: Action Linking', status: 'FAIL', error: err.message });
  }

  // TC-8: Lookup by PO line
  console.log('\n[TC-8] Querying by PO schedule line...');
  try {
    const res = await fetch(`${BASE_URL}/po-line?purchaseOrderNumber=4500000437&purchaseOrderItem=00040`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.recommendations));
    assert(data.total >= 1);
    console.log(`TC-8 PASS. Found ${data.total} recommendations matching PO Line.`);
    results.push({ name: 'TC-8: Query by PO Line', status: 'PASS' });
  } catch (err) {
    console.error('TC-8 FAIL:', err);
    results.push({ name: 'TC-8: Query by PO Line', status: 'FAIL', error: err.message });
  }

  // TC-9: Lookup by Supplier
  console.log('\n[TC-9] Querying by supplierId...');
  try {
    const res = await fetch(`${BASE_URL}/supplier?supplierId=VEND-001`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert(Array.isArray(data.recommendations));
    assert(data.total >= 2);
    console.log(`TC-9 PASS. Found ${data.total} recommendations matching supplierId.`);
    results.push({ name: 'TC-9: Query by Supplier', status: 'PASS' });
  } catch (err) {
    console.error('TC-9 FAIL:', err);
    results.push({ name: 'TC-9: Query by Supplier', status: 'FAIL', error: err.message });
  }

  console.log('\n--- Verification Run Summary ---');
  let hasFailures = false;
  results.forEach(r => {
    console.log(`${r.status === 'PASS' ? '✅' : '❌'} ${r.name} - ${r.status}`);
    if (r.status === 'FAIL') hasFailures = true;
  });

  if (hasFailures) {
    process.exit(1);
  } else {
    console.log('\nAll API endpoints are fully verified!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test run failed to execute:', err);
  process.exit(1);
});
