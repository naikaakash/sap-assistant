const fs = require('fs');
const path = require('path');

const mockPoDataPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\data\\mock-po-data.json';
const mockPosRaw = JSON.parse(fs.readFileSync(mockPoDataPath, 'utf8'));

let mockPos = [];
let multiSchedLineItemsCount = 0;
let multiGrSchedLinesCount = 0;
let partialAckSchedLinesCount = 0;
let qtyDisputeCount = 0;
let dateDisputeCount = 0;

let deletedItemCount = 0;
let completedItemCount = 0;
let invoiceBlockedItemCount = 0;
let activeOverdueItemCount = 0;

let overdueDeletedOrCompletedCount = 0;
let recommendationsDeletedOrCompletedCount = 0;
let remindersDeletedOrCompletedCount = 0;

if (Array.isArray(mockPosRaw) && mockPosRaw.length > 0 && mockPosRaw[0].items) {
  // Nested structure detected!
  mockPosRaw.forEach(po => {
    po.items.forEach(item => {
      const scheduleLines = item.schedule_lines || [];
      if (scheduleLines.length > 1) {
        multiSchedLineItemsCount++;
      }
      
      const isDeleted = item.deletion_completion_indicator === 'DELETED';
      const isCompleted = item.deletion_completion_indicator === 'COMPLETED';
      const isBlocked = item.invoice_blocked_flag === 'Y';
      
      if (isDeleted) deletedItemCount++;
      if (isCompleted) completedItemCount++;
      if (isBlocked) invoiceBlockedItemCount++;

      if (scheduleLines.length === 0) {
        // Flat fallback inside nested
        mockPos.push({
          po_number: po.po_number,
          item_number: item.item_number,
          supplier: po.supplier,
          buyer: po.buyer,
          plant: item.plant,
          company_code: po.company_code,
          purchasing_organization: po.purchasing_organization,
          material_service_description: item.material_service_description,
          po_creation_date: po.po_creation_date,
          delivery_date: item.delivery_date,
          ordered_quantity: item.ordered_quantity,
          received_quantity: item.received_quantity || 0,
          invoiced_quantity: item.invoiced_quantity || 0,
          unit_price: item.unit_price,
          currency: po.currency,
          po_line_value: item.ordered_quantity * (item.unit_price || 0),
          open_quantity: item.open_quantity,
          open_value: item.open_value,
          po_status: item.po_status,
          deletion_completion_indicator: item.deletion_completion_indicator,
          acknowledgement_required: item.acknowledgement_required,
          acknowledgement_date: item.acknowledgement_date,
          last_reminder_date: item.last_reminder_date,
          reminder_count: item.reminder_count,
          gr_status: item.gr_status,
          invoice_status: item.invoice_status,
          invoice_blocked_flag: item.invoice_blocked_flag,
          price_variance: item.price_variance,
          quantity_variance: item.quantity_variance,
          risk_category: item.risk_category,
          exception_reason: item.exception_reason,
          data_quality_flag: item.data_quality_flag,
          test_scenarios: item.test_scenarios || []
        });
      } else {
        scheduleLines.forEach((sl, idx) => {
          const receivedQty = sl.goods_receipts ? sl.goods_receipts.reduce((sum, gr) => sum + gr.qty, 0) : (sl.received_quantity || 0);
          
          if (sl.goods_receipts && sl.goods_receipts.length > 1) {
            multiGrSchedLinesCount++;
          }
          
          let ackDate = sl.acknowledgement_date || null;
          if (sl.acknowledgements && sl.acknowledgements.length > 0) {
            const ack = sl.acknowledgements[0];
            ackDate = ack.confirmed_date || null;
            
            // Partial ack: confirmed qty < scheduled qty
            if (ack.confirmed_qty > 0 && ack.confirmed_qty < sl.scheduled_qty) {
              partialAckSchedLinesCount++;
            }
            
            // Qty dispute: confirmed qty != scheduled qty
            if (ack.confirmed_qty !== sl.scheduled_qty) {
              qtyDisputeCount++;
            }
            
            // Date dispute: confirmed date is after delivery date (late commitment)
            if (ack.confirmed_date && new Date(ack.confirmed_date) > new Date(sl.delivery_date)) {
              dateDisputeCount++;
            }
          }

          const openQty = sl.open_quantity !== undefined ? sl.open_quantity : Math.max(0, sl.scheduled_qty - receivedQty);
          
          const todayDate = new Date('2026-06-10');
          const delDate = new Date(sl.delivery_date);
          const isOverdue = !isNaN(delDate.getTime()) && delDate < todayDate;
          
          if (isOverdue && openQty > 0) {
            if (!isDeleted && !isCompleted && item.po_status !== 'CLOSED') {
              if (item.po_status === 'OVERDUE' || item.po_status === 'OVERDUE_MISSING_ACK' || item.po_status === 'OVERDUE_NO_GR') {
                activeOverdueItemCount++;
              }
            }
          }

          mockPos.push({
            po_number: po.po_number,
            item_number: item.item_number + (idx > 0 ? `_${sl.schedule_line}` : ''),
            supplier: po.supplier,
            buyer: po.buyer,
            plant: item.plant,
            company_code: po.company_code,
            purchasing_organization: po.purchasing_organization,
            material_service_description: item.material_service_description,
            po_creation_date: po.po_creation_date,
            delivery_date: sl.delivery_date,
            ordered_quantity: sl.scheduled_qty,
            received_quantity: receivedQty,
            invoiced_quantity: sl.invoiced_quantity || 0,
            unit_price: item.unit_price,
            currency: po.currency,
            po_line_value: sl.scheduled_qty * (item.unit_price || 0),
            open_quantity: openQty,
            open_value: sl.open_value !== undefined ? sl.open_value : openQty * (item.unit_price || 0),
            po_status: item.po_status,
            deletion_completion_indicator: item.deletion_completion_indicator,
            acknowledgement_required: sl.acknowledgement_required || 'N',
            acknowledgement_date: ackDate,
            last_reminder_date: sl.last_reminder_date || null,
            reminder_count: sl.reminder_count || 0,
            gr_status: item.gr_status,
            invoice_status: item.invoice_status,
            invoice_blocked_flag: item.invoice_blocked_flag,
            price_variance: item.price_variance,
            quantity_variance: item.quantity_variance,
            risk_category: item.risk_category,
            exception_reason: item.exception_reason,
            data_quality_flag: item.data_quality_flag,
            test_scenarios: item.test_scenarios || []
          });
        });
      }
    });
  });
} else {
  // Flat fallback
  mockPos = mockPosRaw;
}

// Check for deleted/completed/closed items leaking into active tables
const exceptionCsvPath = path.join(path.dirname(mockPoDataPath), '../procurement_data_sample/exception_worklist.csv');
if (fs.existsSync(exceptionCsvPath)) {
  const exceptionLines = fs.readFileSync(exceptionCsvPath, 'utf8').split('\n').slice(1);
  exceptionLines.forEach(line => {
    if (!line.trim()) return;
    const parts = line.split(',');
    const poNo = parts[4];
    const itemNo = parts[5];
    
    // Find item in flattened mockPos
    const item = mockPos.find(i => i.po_number === poNo && i.item_number.startsWith(itemNo));
    if (item) {
      const isDeleted = item.deletion_completion_indicator === 'DELETED';
      const isCompleted = item.deletion_completion_indicator === 'COMPLETED';
      const isClosed = item.po_status === 'CLOSED';
      if (isDeleted || isCompleted || isClosed) {
        overdueDeletedOrCompletedCount++;
      }
    }
  });
}

const recJsonPath = path.join(path.dirname(mockPoDataPath), 'app-recommendations.json');
if (fs.existsSync(recJsonPath)) {
  const recs = JSON.parse(fs.readFileSync(recJsonPath, 'utf8'));
  recs.forEach(r => {
    const item = mockPos.find(i => i.po_number === r.purchaseOrderNumber && i.item_number.startsWith(r.purchaseOrderItem));
    if (item) {
      const isDeleted = item.deletion_completion_indicator === 'DELETED';
      const isCompleted = item.deletion_completion_indicator === 'COMPLETED';
      const isClosed = item.po_status === 'CLOSED';
      if (isDeleted || isCompleted || isClosed) {
        recommendationsDeletedOrCompletedCount++;
      }
    }
  });
}

const remJsonPath = path.join(path.dirname(mockPoDataPath), 'app-supplier-reminders.json');
if (fs.existsSync(remJsonPath)) {
  const rems = JSON.parse(fs.readFileSync(remJsonPath, 'utf8'));
  rems.forEach(r => {
    const item = mockPos.find(i => i.po_number === r.purchaseOrderNumber && i.item_number.startsWith(r.purchaseOrderItem));
    if (item) {
      const isDeleted = item.deletion_completion_indicator === 'DELETED';
      const isCompleted = item.deletion_completion_indicator === 'COMPLETED';
      const isClosed = item.po_status === 'CLOSED';
      if (isDeleted || isCompleted || isClosed) {
        remindersDeletedOrCompletedCount++;
      }
    }
  });
}

console.log(`Loaded ${mockPos.length} items from mock-po-data.json`);

// 1. Distinct PO count
const distinctPos = new Set(mockPos.map(i => i.po_number));
console.log(`Distinct PO count: ${distinctPos.size}`);
console.log(`PO line count: ${mockPos.length}`);

// 2. Count by supplier
const supplierCounts = {};
mockPos.forEach(i => {
  const s = i.supplier || 'NULL';
  supplierCounts[s] = (supplierCounts[s] || 0) + 1;
});
console.log('\nCount by supplier:', supplierCounts);

// 3. Count by buyer
const buyerCounts = {};
mockPos.forEach(i => {
  const b = i.buyer || 'NULL';
  buyerCounts[b] = (buyerCounts[b] || 0) + 1;
});
console.log('\nCount by buyer:', buyerCounts);

// 4. Count by plant
const plantCounts = {};
mockPos.forEach(i => {
  const p = i.plant || 'NULL';
  plantCounts[p] = (plantCounts[p] || 0) + 1;
});
console.log('\nCount by plant:', plantCounts);

// 5. Count by currency
const currencyCounts = {};
mockPos.forEach(i => {
  const c = i.currency || 'NULL';
  currencyCounts[c] = (currencyCounts[c] || 0) + 1;
});
console.log('\nCount by currency:', currencyCounts);

// 6. Count by PO type / item category
const categoryCounts = {};
mockPos.forEach(i => {
  const isService = i.material_service_description.toLowerCase().includes('service');
  const cat = isService ? 'SERVICE' : 'STANDARD';
  categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
});
console.log('\nCount by item category (type):', categoryCounts);

// 7. Count by exception type
const exceptionCounts = {};
mockPos.forEach(i => {
  if (i.deletion_completion_indicator === 'DELETED') return;
  if (!i.exception_reason || i.exception_reason.toLowerCase() === 'none') return;
  
  let excType = 'PO_OVERDUE';
  if (i.po_status.includes('ACK') || i.po_status === 'MISSING_ACKNOWLEDGEMENT' || i.po_status === 'HIGH_VALUE_MISSING_ACK') {
    excType = 'ACK_MISSING';
  } else if (i.po_status === 'DATA_QUALITY_ISSUE' || i.po_status === 'INVALID_QUANTITY' || i.po_status === 'MISSING_SUPPLIER_MASTER' || i.data_quality_flag === 'Y') {
    excType = 'INVENTORY_MISMATCH'; 
  } else if (i.po_status.includes('INVOICE') || i.invoice_blocked_flag === 'Y') {
    excType = 'PRICE_DISPUTE'; 
  }
  
  exceptionCounts[excType] = (exceptionCounts[excType] || 0) + 1;
});
console.log('\nCount by exception type:', exceptionCounts);

// 8. Count by recommendation status
const recStatusCounts = {};
mockPos.forEach(i => {
  if (i.deletion_completion_indicator === 'DELETED') return;
  if (!i.exception_reason || i.exception_reason.toLowerCase() === 'none') return;

  let excType = 'PO_OVERDUE';
  if (i.po_status.includes('ACK') || i.po_status === 'MISSING_ACKNOWLEDGEMENT' || i.po_status === 'HIGH_VALUE_MISSING_ACK') {
    excType = 'ACK_MISSING';
  } else if (i.po_status === 'DATA_QUALITY_ISSUE' || i.po_status === 'INVALID_QUANTITY' || i.po_status === 'MISSING_SUPPLIER_MASTER' || i.data_quality_flag === 'Y') {
    excType = 'INVENTORY_MISMATCH'; 
  } else if (i.po_status.includes('INVOICE') || i.invoice_blocked_flag === 'Y') {
    excType = 'PRICE_DISPUTE'; 
  }

  let lifecycleStatus = 'RECOMMENDED';
  if (i.po_status === 'REMINDER_SENT') {
    lifecycleStatus = 'PENDING_SUPPLIER_RESPONSE';
  } else if (excType === 'INVENTORY_MISMATCH') {
    lifecycleStatus = 'BLOCKED';
  }
  
  recStatusCounts[lifecycleStatus] = (recStatusCounts[lifecycleStatus] || 0) + 1;
});
console.log('\nCount by recommendation status:', recStatusCounts);

// 9. Count by reminder eligibility
let reminderEligibleCount = 0;
let reminderIneligibleCount = 0;
mockPos.forEach(i => {
  const isOverdue = i.po_status === 'OVERDUE' || i.po_status === 'REMINDER_SENT' || i.po_status === 'REMINDER_ELIGIBLE' || i.po_status === 'OVERDUE_MISSING_ACK' || i.po_status === 'OVERDUE_NO_GR';
  const hasException = i.exception_reason && i.exception_reason.toLowerCase() !== 'none';
  const isDeleted = i.deletion_completion_indicator === 'DELETED';
  const isCompleted = i.deletion_completion_indicator === 'COMPLETED';

  // Rate-limiting check
  let isRateLimited = false;
  if (i.last_reminder_date) {
    const today = new Date('2026-06-10');
    const lastReminder = new Date(i.last_reminder_date);
    const diffDays = (today - lastReminder) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      isRateLimited = true;
    }
  }

  const isEligible = hasException && !isDeleted && !isCompleted && isOverdue && !isRateLimited;
  if (isEligible) reminderEligibleCount++;
  else reminderIneligibleCount++;
});
console.log(`\nReminder eligibility counts:\n  Eligible: ${reminderEligibleCount}\n  Ineligible: ${reminderIneligibleCount}`);

// 10. Count by data quality flag
const dqCounts = {};
mockPos.forEach(i => {
  const f = i.data_quality_flag || 'N';
  dqCounts[f] = (dqCounts[f] || 0) + 1;
});
console.log('\nCount by data quality flag:', dqCounts);

// 11. Reconcile Dashboard Cards
let totalPOs = distinctPos.size;
let totalLines = mockPos.length;
let openLinesCount = 0;
let openPOValue = 0;
let overduePOCount = 0;
let overduePOValue = 0;
let pendingAckCount = 0;
let pendingGRCount = 0;
let invoiceBlockedCount = 0;
let highRiskCount = 0;

mockPos.forEach(i => {
  const openQty = i.open_quantity !== undefined && i.open_quantity !== null ? i.open_quantity : Math.max(0, i.ordered_quantity - (i.received_quantity || 0));
  const openVal = i.open_value !== undefined && i.open_value !== null ? i.open_value : openQty * (i.unit_price || 0);
  const activeOpen = i.deletion_completion_indicator === 'ACTIVE_OPEN';
  const poLineVal = i.po_line_value !== undefined && i.po_line_value !== null ? i.po_line_value : i.ordered_quantity * (i.unit_price || 0);
  
  if (activeOpen && openQty > 0) {
    openLinesCount++;
    openPOValue += openVal;
  }
  
  const todayDate = new Date('2026-06-10');
  const delDate = new Date(i.delivery_date);
  const isOverdue = !isNaN(delDate.getTime()) && delDate < todayDate;
  
  if (isOverdue && openQty > 0 && activeOpen) {
    overduePOCount++;
    overduePOValue += openVal;
  }
  
  if (i.acknowledgement_required === 'Y' && !i.acknowledgement_date && activeOpen) {
    pendingAckCount++;
  }
  
  if (i.gr_status === 'PENDING' && isOverdue && activeOpen) {
    pendingGRCount++;
  }
  
  if (i.invoice_blocked_flag === 'Y') {
    invoiceBlockedCount++;
  }
  
  if ((i.risk_category === 'HIGH' || i.risk_category === 'CRITICAL') && activeOpen) {
    highRiskCount++;
  }
});

console.log('\n--- Reconciled Dashboard Card Metrics ---');
console.log(`Total POs: ${totalPOs}`);
console.log(`Total Lines: ${totalLines}`);
console.log(`Open PO Lines Count: ${openLinesCount}`);
console.log(`Open PO Value (direct sum): ${openPOValue.toFixed(2)}`);
console.log(`Overdue PO Lines Count: ${overduePOCount}`);
console.log(`Overdue PO Value (direct sum): ${overduePOValue.toFixed(2)}`);
console.log(`Pending Acknowledgement Count: ${pendingAckCount}`);
console.log(`Pending Goods Receipt Count: ${pendingGRCount}`);
console.log(`Invoice Blocked Count: ${invoiceBlockedCount}`);
console.log(`High Risk PO Count: ${highRiskCount}`);

console.log('\n--- Structural Validation Metrics ---');
console.log(`PO items with >1 schedule line: ${multiSchedLineItemsCount}`);
console.log(`Schedule lines with >1 goods receipt: ${multiGrSchedLinesCount}`);
console.log(`Schedule lines with partial acknowledgements: ${partialAckSchedLinesCount}`);
console.log(`Quantity disputes (confirmed != scheduled): ${qtyDisputeCount}`);
console.log(`Date disputes (confirmed_date != delivery_date): ${dateDisputeCount}`);

console.log('\n--- Status-Based Validation Metrics ---');
console.log(`Deleted item count: ${deletedItemCount}`);
console.log(`Completed / fully received item count: ${completedItemCount}`);
console.log(`Invoice-blocked item count: ${invoiceBlockedItemCount}`);
console.log(`Active overdue item count: ${activeOverdueItemCount}`);
console.log(`Overdue deleted/completed items (must be 0 in active worklist): ${overdueDeletedOrCompletedCount}`);
console.log(`Deleted/completed items in recommendations (must be 0): ${recommendationsDeletedOrCompletedCount}`);
console.log(`Deleted/completed items in reminders (must be 0): ${remindersDeletedOrCompletedCount}`);
