import { getExceptionDetail, getOverdueWorklist } from '../src/services/data/csvDataService';

async function main() {
  console.log("Running local calculation test...");
  
  // 1. Test getOverdueWorklist
  const { data: worklist } = await getOverdueWorklist({});
  const matchedGrid = worklist.find(item => item.po_number === '4500000437' && item.item_number === '00040' && item.schedule_line === '0001');
  
  console.log("\n--- Workbench Grid Row Value ---");
  if (matchedGrid) {
    console.log(`PO: ${matchedGrid.po_number}, Item: ${matchedGrid.item_number}, Line: ${matchedGrid.schedule_line}`);
    console.log(`Ordered Qty: ${matchedGrid.ordered_quantity}`);
    console.log(`Received Qty: ${matchedGrid.received_quantity}`);
    console.log(`Open Qty: ${matchedGrid.open_quantity}`);
    console.log(`Open Value: ${matchedGrid.open_value}`);
    console.log(`Status: ${matchedGrid.status}`);
  } else {
    console.log("Could not find PO 4500000437 item 00040 line 0001 in worklist!");
  }
  
  // 2. Test getExceptionDetail
  const detail = await getExceptionDetail('4500000437', '00040', '0001');
  console.log("\n--- Detail Drawer Values ---");
  if (detail) {
    console.log(`PO: ${detail.po_number}, Item: ${detail.item_number}, Line: ${detail.schedule_line}`);
    console.log(`Ordered Qty: ${detail.ordered_quantity}`);
    console.log(`Received Qty: ${detail.received_quantity}`);
    console.log(`Open Qty: ${detail.open_quantity}`);
    console.log(`Open Value: ${detail.open_value}`);
    console.log(`Status: ${detail.status}`);
  } else {
    console.log("Could not fetch detail for PO 4500000437 item 00040 line 0001!");
  }
}

main().catch(console.error);
