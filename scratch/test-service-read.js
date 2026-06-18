const { getExecutiveOverview } = require('../src/services/mockErpService');
const { clearCache } = require('../src/services/data/csvDataService');

async function test() {
  try {
    clearCache();
    console.log('Testing Mock ERP getExecutiveOverview...');
    const result = await getExecutiveOverview();
    console.log('Result overview summary:');
    console.log('totalPoLines:', result.totalPoLines);
    console.log('openPoLines:', result.openPoLines);
    console.log('overduePoLines:', result.overduePoLines);
    console.log('missingAcknowledgements:', result.missingAcknowledgements);
    console.log('openPoValue:', result.openPoValue);
    console.log('spendBySupplier count:', result.spendBySupplier ? result.spendBySupplier.length : 0);
  } catch (err) {
    console.error('Error querying service layer:', err);
  }
}

test();
