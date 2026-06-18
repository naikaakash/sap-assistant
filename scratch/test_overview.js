const csv = require('csvtojson');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'procurement_data_sample');

async function readCsv(filename) {
  const filePath = path.join(DATA_ROOT, filename);
  try {
    return await csv().fromFile(filePath);
  } catch (e) {
    console.error(`Failed to read CSV ${filename}:`, e);
    return [];
  }
}

async function test() {
  const [
    headersRaw,
    itemsRaw,
    schedulesRaw,
    suppliersRaw,
    plantsRaw
  ] = await Promise.all([
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('po_schedule_lines.csv'),
    readCsv('suppliers.csv'),
    readCsv('plants.csv')
  ]);

  console.log('Headers count:', headersRaw.length);
  console.log('Items count:', itemsRaw.length);

  const suppliersMap = new Map();
  for (const s of suppliersRaw) {
    suppliersMap.set(s.supplier_id, s.supplier_name);
  }

  const activeHeaders = headersRaw.filter(h => h.header_status !== 'CANCELLED');
  console.log('Active headers count:', activeHeaders.length);
  const activeHeaderMap = new Map();
  for (const h of activeHeaders) {
    activeHeaderMap.set(h.po_number, h);
  }

  const activeItems = itemsRaw.filter(i => i.deletion_flag !== 'Y');
  console.log('Active items count:', activeItems.length);

  const spendBySupplierGroup = new Map();
  let matches = 0;
  let skips = 0;

  for (const item of activeItems) {
    const header = activeHeaderMap.get(item.po_number);
    if (!header) {
      skips++;
      continue;
    }
    matches++;

    const supplierId = header.supplier_id || '';
    const itemVal = parseFloat(item.item_value || '0') || (parseFloat(item.order_qty || '0') * parseFloat(item.net_price || '0'));

    if (supplierId) {
      spendBySupplierGroup.set(supplierId, (spendBySupplierGroup.get(supplierId) || 0) + itemVal);
    }
  }

  console.log('Matches:', matches, 'Skips:', skips);

  const spendBySupplier = Array.from(spendBySupplierGroup.entries()).map(([id, val]) => ({
    id,
    name: suppliersMap.get(id) || id,
    value: Math.round(val * 100) / 100
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  console.log('Top 10 Suppliers spend:', spendBySupplier);
}

test();
