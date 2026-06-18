const fs = require('fs');
const path = require('path');

const projectDir = path.resolve(__dirname, '..');
const mockPoDataPath = path.join(projectDir, 'data', 'mock-po-data.json');
const csvDir = path.join(projectDir, 'procurement_data_sample');
const dataDir = path.join(projectDir, 'data');

if (!fs.existsSync(mockPoDataPath)) {
  console.error(`❌ ERROR: mock-po-data.json not found at ${mockPoDataPath}`);
  process.exit(1);
}

const mockPos = JSON.parse(fs.readFileSync(mockPoDataPath, 'utf8'));
console.log(`Loaded ${mockPos.length} items from mock-po-data.json`);

// Ensure directories exist
if (!fs.existsSync(csvDir)) fs.mkdirSync(csvDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

// Helper to write CSV files with warning message
function writeCsvFile(filename, headers, rows) {
  const filePath = path.join(csvDir, filename);
  if (fs.existsSync(filePath)) {
    console.log(`[OVERWRITE WARNING] Overwriting CSV file: procurement_data_sample/${filename} (${rows.length} rows)`);
  } else {
    console.log(`[CREATE] Creating CSV file: procurement_data_sample/${filename} (${rows.length} rows)`);
  }
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      if (cell === null || cell === undefined) return '';
      const cellStr = String(cell);
      if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(','))
  ].join('\n') + '\n';

  fs.writeFileSync(filePath, csvContent, 'utf-8');
}

// Helper to write JSON files with warning message
function writeJsonFile(filename, data) {
  const filePath = path.join(dataDir, filename);
  if (fs.existsSync(filePath)) {
    console.log(`[OVERWRITE WARNING] Overwriting JSON database: data/${filename} (${data.length} records)`);
  } else {
    console.log(`[CREATE] Creating JSON database: data/${filename} (${data.length} records)`);
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// 1. MASTER DATA GENERATION
// ---------------------------------------------------------------------------

// company_codes.csv
writeCsvFile('company_codes.csv', 
  ['company_code', 'company_name', 'currency'],
  [
    ['US01', 'Acme Electronics US', 'USD'],
    ['EU01', 'Acme Electronics EU', 'EUR'],
    ['CA01', 'Acme Electronics CA', 'CAD']
  ]
);

// plants.csv
writeCsvFile('plants.csv',
  ['plant', 'plant_name', 'city', 'region', 'country', 'timezone'],
  [
    ['PL01', 'Austin Tech Plant', 'Austin', 'TX', 'US', 'CST'],
    ['PL02', 'Berlin Tech Plant', 'Berlin', '', 'DE', 'CET'],
    ['PL03', 'Munich Plant', 'Munich', '', 'DE', 'CET'],
    ['PL04', 'Hamburg Plant', 'Hamburg', '', 'DE', 'CET']
  ]
);

// purchasing_orgs.csv
writeCsvFile('purchasing_orgs.csv',
  ['purchasing_org', 'purchasing_org_name'],
  [
    ['PO01', 'US Purchasing Org'],
    ['PO02', 'EU Purchasing Org'],
    ['PO03', 'CA Purchasing Org']
  ]
);

// purchasing_groups.csv
writeCsvFile('purchasing_groups.csv',
  ['purchasing_group', 'purchasing_group_name', 'buyer_email'],
  [
    ['PG1', 'Alex Buyer Group', 'alex.buyer@example.com'],
    ['PG2', 'Sarah Planner Group', 'sarah.planner@example.com'],
    ['PG3', 'John Senior Group', 'john.senior@example.com'],
    ['PG4', 'Michael Lead Group', 'michael.lead@example.com']
  ]
);

// materials.csv
writeCsvFile('materials.csv',
  ['material_id', 'material_description', 'material_group', 'base_uom', 'division', 'product_hierarchy', 'abc_indicator', 'critical_part_flag', 'serial_managed_flag', 'batch_managed_flag', 'standard_price', 'currency'],
  [
    ['M100001', 'Microprocessor Core v1', 'SEMICONDUCTOR', 'PC', '01', '0101', 'A', 'Y', 'N', 'N', '15.00', 'USD'],
    ['M100002', 'Resistor Pack 10k', 'COMPONENTS', 'PC', '01', '0102', 'B', 'N', 'N', 'N', '0.15', 'USD'],
    ['M100003', 'ASIC Transceiver Chip', 'SEMICONDUCTOR', 'PC', '01', '0101', 'A', 'Y', 'N', 'N', '25.00', 'USD'],
    ['M100004', 'PCB Board Double Sided', 'COMPONENTS', 'PC', '01', '0102', 'B', 'N', 'N', 'N', '2.50', 'USD'],
    ['S200001', 'ERP Implementation Consulting Services', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '75000.00', 'EUR'],
    ['S200002', 'System Upgrade Integration Test Services', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '45000.00', 'EUR'],
    ['S200003', 'Cloud Migration System Analysis', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '60000.00', 'EUR'],
    ['S200004', 'ERP implementation Support Services', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '1500.00', 'EUR'],
    ['S200005', 'ERP implementation Training Services', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '800.00', 'EUR'],
    ['S200006', 'ERP implementation Post-Go-Live Services', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '1000.00', 'EUR']
  ]
);

// material_plant.csv
writeCsvFile('material_plant.csv',
  ['material_id', 'plant', 'mrp_type', 'mrp_controller', 'procurement_type', 'planned_delivery_time_days', 'gr_processing_time_days', 'safety_stock', 'reorder_point', 'lot_size', 'min_lot_size', 'rounding_value', 'source_list_required'],
  [
    ['M100001', 'PL01', 'PD', 'MC1', 'F', '15', '2', '200', '150', 'EX', '10', '10', 'Y'],
    ['M100002', 'PL01', 'PD', 'MC1', 'F', '10', '1', '500', '400', 'EX', '50', '50', 'N'],
    ['M100003', 'PL02', 'PD', 'MC2', 'F', '20', '2', '100', '80', 'EX', '5', '5', 'Y'],
    ['M100004', 'PL01', 'PD', 'MC1', 'F', '10', '1', '500', '400', 'EX', '50', '50', 'N'],
    ['S200001', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N'],
    ['S200002', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N'],
    ['S200003', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N'],
    ['S200004', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N'],
    ['S200005', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N'],
    ['S200006', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N']
  ]
);

// suppliers.csv
writeCsvFile('suppliers.csv',
  ['supplier_id', 'business_partner_id', 'supplier_name', 'country', 'region', 'payment_terms', 'incoterms', 'supplier_tier', 'risk_score', 'avg_response_days', 'on_time_delivery_pct', 'quality_ppm', 'created_on', 'blocked_flag'],
  [
    ['VEND-001', 'BP200001', 'Sterling Electronics', 'US', 'TX', 'NET30', 'FCA', 'STRATEGIC', '38', '4.4', '80', '658', '2023-05-29', 'N'],
    ['VEND-002', 'BP200002', 'Global Foundry', 'US', 'CA', 'NET60', 'FOB', 'STRATEGIC', '61', '7.4', '98', '1934', '2024-11-24', 'N'],
    ['VEND-003', 'BP200003', 'Consulting Group', 'DE', 'Berlin', 'NET30', 'FCA', 'STRATEGIC', '15', '2.0', '95', '0', '2025-01-01', 'N'],
    ['VEND-004', 'BP200004', 'Apex Components', 'US', 'CA', 'NET30', 'FCA', 'PREFERRED', '45', '3.5', '92', '200', '2024-01-15', 'N'],
    ['VEND-005', 'BP200005', 'Nova Systems', 'US', 'TX', 'NET30', 'FCA', 'PREFERRED', '50', '4.0', '88', '400', '2024-02-15', 'N'],
    ['VEND-006', 'BP200006', 'Vector Logistics', 'DE', 'Berlin', 'NET30', 'FCA', 'PREFERRED', '55', '4.5', '85', '500', '2024-03-15', 'N']
  ]
);

// supplier_contacts.csv
writeCsvFile('supplier_contacts.csv',
  ['contact_id', 'supplier_id', 'contact_name', 'email', 'role', 'primary_flag'],
  [
    ['CON01', 'VEND-001', 'Alice Sterling', 'alice@sterlingelectronics.com', 'Sales Manager', 'Y'],
    ['CON02', 'VEND-002', 'Bob Foundry', 'bob@globalfoundry.com', 'Account Director', 'Y'],
    ['CON03', 'VEND-003', 'Clara Consulting', 'clara@consultinggroup.com', 'Sales Manager', 'Y'],
    ['CON04', 'VEND-004', 'David Apex', 'david@apexcomponents.com', 'Sales Manager', 'Y'],
    ['CON05', 'VEND-005', 'Nova Representative', '', 'Inside Sales', 'Y'], // Missing email test case
    ['CON06', 'VEND-006', 'Vector Agent', 'vector_logistics_email_at_invalid', 'Logistics Lead', 'Y'] // Invalid email test case
  ]
);

// inventory_stock.csv
writeCsvFile('inventory_stock.csv',
  ['material_id', 'plant', 'storage_location', 'unrestricted_stock', 'quality_stock', 'blocked_stock', 'in_transit_stock', 'last_count_date', 'cycle_count_indicator', 'rfid_detected_qty'],
  [
    ['M100001', 'PL01', 'SL01', '120', '0', '0', '50', '2026-05-20', 'A', '120'],
    ['M100002', 'PL01', 'SL01', '450', '0', '0', '100', '2026-05-22', 'B', '450'],
    ['M100003', 'PL02', 'SL02', '90', '0', '0', '20', '2026-05-24', 'A', '90'],
    ['M100004', 'PL01', 'SL01', '300', '0', '0', '80', '2026-05-25', 'B', '300']
  ]
);

// ---------------------------------------------------------------------------
// 2. TRANSACTIONAL ERP DATA MOCKS (100 PO lines)
// ---------------------------------------------------------------------------

const poHeaders = [];
const poItems = [];
const poScheduleLines = [];
const exceptionWorklist = [];
const supplierAcks = [];
const goodsReceipts = [];

// Helper mappings
const matMapping = {
  "Microprocessor Core v1": "M100001",
  "Resistor Pack 10k": "M100002",
  "ASIC Transceiver Chip": "M100003",
  "PCB Board Double Sided": "M100004",
  "ERP Implementation Consulting Services": "S200001",
  "System Upgrade Integration Test Services": "S200002",
  "Cloud Migration System Analysis": "S200003",
  "ERP implementation Support Services": "S200004",
  "ERP implementation Training Services": "S200005",
  "ERP implementation Post-Go-Live Services": "S200006"
};

const supplierMapping = {
  "Sterling Electronics (VEND-001)": "VEND-001",
  "Global Foundry (VEND-002)": "VEND-002",
  "Consulting Group (VEND-003)": "VEND-003",
  "Apex Components (VEND-004)": "VEND-004",
  "Nova Systems (VEND-005)": "VEND-005",
  "Vector Logistics (VEND-006)": "VEND-006"
};

const buyerMapping = {
  "Alex Buyer (BUY-01)": "BUY-01",
  "Sarah Planner (BUY-02)": "BUY-02",
  "John Senior (BUY-03)": "BUY-03",
  "Michael Lead (BUY-04)": "BUY-04"
};

const recommendations = [];
const reminders = [];
const responses = [];
const actions = [];

// Helper for exceptions and recommendations/reminders (App-owned store)
function processExceptionsAndAppStores(poNo, itemNo, item, slNo, deliveryDate, orderedQty, receivedQty, openQty, openVal, supplierId, supplierName, buyerName, matId, lastReminderDate) {
  // Skip deleted/completed/closed/cancelled PO items from creating active exceptions or recommendations
  const isDeleted = item.deletion_completion_indicator === 'DELETED';
  const isCompleted = item.deletion_completion_indicator === 'COMPLETED';
  const isClosed = item.po_status === 'CLOSED';
  
  if (isDeleted || isCompleted || isClosed) {
    return;
  }

  if (item.exception_reason && item.exception_reason !== 'None') {
    const excId = `EX_${poNo}_${itemNo}`;
    let excType = 'PO_OVERDUE';
    if (item.po_status.includes('ACK') || item.po_status === 'MISSING_ACKNOWLEDGEMENT' || item.po_status === 'HIGH_VALUE_MISSING_ACK') {
      excType = 'ACK_MISSING';
    } else if (item.po_status === 'DATA_QUALITY_ISSUE' || item.po_status === 'INVALID_QUANTITY' || item.po_status === 'MISSING_SUPPLIER_MASTER' || item.data_quality_flag === 'Y') {
      excType = 'INVENTORY_MISMATCH'; 
    } else if (item.po_status.includes('INVOICE') || item.invoice_blocked_flag === 'Y') {
      excType = 'PRICE_DISPUTE'; 
    }

    const todayDate = new Date('2026-06-10');
    const delDate = new Date(deliveryDate);
    const daysPastDue = isNaN(delDate.getTime()) ? 0 : Math.max(0, Math.round((todayDate - delDate) / (1000 * 60 * 60 * 24)));

    // Insert to Exception Worklist if not already added for this item
    if (!exceptionWorklist.some(e => e[4] === poNo && e[5] === itemNo)) {
      exceptionWorklist.push([
        excId, excType, item.risk_category || 'LOW', 'NEW', poNo, itemNo,
        matId, item.plant, supplierId, '2026-05-10', deliveryDate, daysPastDue,
        item.exception_reason, openVal.toFixed(0), buyerName
      ]);
    }

    // App recommendations creation (Workflow state, separate from raw ERP CSVs)
    const recId = `rec-${poNo}-${itemNo}`;
    let recType = 'SEND_SUPPLIER_REMINDER';
    let sourceModule = 'OVERDUE_PO';
    if (excType === 'ACK_MISSING') {
      sourceModule = 'PO_ACKNOWLEDGEMENT';
      recType = 'REQUEST_ACKNOWLEDGEMENT';
    }

    let lifecycleStatus = 'RECOMMENDED';
    let currentOwner = 'BUYER';
    let reminderId = null;

    if (item.po_status === 'REMINDER_SENT') {
      lifecycleStatus = 'PENDING_SUPPLIER_RESPONSE';
      currentOwner = 'SUPPLIER';
      reminderId = `rem-${poNo}-${itemNo}`;

      // Insert reminder
      if (!reminders.some(r => r.reminderId === reminderId)) {
        reminders.push({
          reminderId: reminderId,
          recommendationId: recId,
          purchaseOrderNumber: poNo,
          purchaseOrderItem: itemNo,
          supplierId: supplierId,
          supplierName: supplierName,
          supplierEmail: supplierId === 'VEND-001' ? 'alice@sterlingelectronics.com' : 'sales@supplier.com',
          channel: 'EMAIL',
          reminderStatus: 'SENT',
          subject: `Overdue PO ${poNo} Item ${itemNo} Query`,
          bodyText: 'Please verify delivery recovery schedule.',
          sentAt: lastReminderDate ? `${lastReminderDate}T10:00:00.000Z` : '2026-06-04T10:05:00.000Z',
          createdBy: 'demo.seed',
          createdAt: '2026-06-04T10:00:00.000Z',
          updatedBy: 'demo.seed',
          updatedAt: '2026-06-04T10:05:00.000Z',
          version: 1
        });
      }
    } else if (excType === 'INVENTORY_MISMATCH') {
      lifecycleStatus = 'BLOCKED';
    }

    let recText = 'Send supplier reminder requesting recovery confirmation.';
    if (recType === 'REQUEST_ACKNOWLEDGEMENT') {
      recText = 'Request supplier acknowledgement confirmation.';
    } else if (lifecycleStatus === 'BLOCKED') {
      recText = `Resolve master data / data quality flag issue in ERP: ${item.exception_reason}`;
    } else if (item.risk_category === 'CRITICAL' || item.risk_category === 'HIGH') {
      recText = 'Send urgent reminder to supplier.';
    }

    if (!recommendations.some(r => r.recommendationId === recId)) {
      recommendations.push({
        recommendationId: recId,
        sourceModule: sourceModule,
        purchaseOrderNumber: poNo,
        purchaseOrderItem: itemNo,
        supplierId: supplierId,
        supplierName: supplierName || 'Unknown Supplier',
        recommendationType: recType,
        lifecycleStatus: lifecycleStatus,
        currentOwner: currentOwner,
        issueDetectedAt: '2026-06-08T10:00:00.000Z',
        issueReason: item.exception_reason,
        recommendedActionText: recText,
        verificationStatus: 'NOT_READY',
        createdBy: 'demo.seed',
        createdAt: '2026-06-08T10:00:00.000Z',
        updatedBy: 'demo.seed',
        updatedAt: '2026-06-08T10:00:00.000Z',
        version: 1,
        linkedActionIds: [],
        supplierReminderId: reminderId,
        supplierResponseId: null
      });
    }
  }
}

mockPos.forEach(poOrItem => {
  // Check if this is the hierarchical PO structure (it has an items array)
  if (poOrItem.items && Array.isArray(poOrItem.items)) {
    const po = poOrItem;
    const poNo = po.po_number;
    const supplierId = supplierMapping[po.supplier] || po.supplier || '';
    const supplierName = po.supplier ? po.supplier.split(' (')[0] : '';
    const buyerId = buyerMapping[po.buyer] || po.buyer || 'BUY-01';
    const buyerName = po.buyer ? po.buyer.split(' (')[0] : '';
    const purchasingGroup = buyerId === 'BUY-02' ? 'PG2' : buyerId === 'BUY-03' ? 'PG3' : buyerId === 'BUY-04' ? 'PG4' : 'PG1';
    
    // Determine header status: check if any item is active/open or if all are closed
    let isHeaderClosed = po.items.length > 0 && po.items.every(i => i.po_status === 'CLOSED');
    let headerStatus = isHeaderClosed ? 'CLOSED' : 'OPEN';

    // 1. Header (distinct only)
    if (!poHeaders.some(h => h[0] === poNo)) {
      poHeaders.push([
        poNo, 'NB', po.company_code || 'US01', po.purchasing_organization || 'PO01', purchasingGroup, 
        supplierId, po.po_creation_date || '2026-05-10', po.currency || 'USD', buyerName, 'RELEASED', 
        headerStatus, 'NET30', 
        supplierId === 'VEND-002' ? 'FOB' : 'FCA', po.po_creation_date || '2026-05-10'
      ]);
    }

    po.items.forEach(item => {
      const itemNo = item.item_number;
      const matId = matMapping[item.material_service_description] || 'M100001';
      const isService = matId.startsWith('S');
      const deletionFlag = item.deletion_completion_indicator === 'DELETED' ? 'Y' : 'N';
      const deliveryCompletedFlag = item.deletion_completion_indicator === 'COMPLETED' ? 'Y' : 'N';
      
      // Compute total ordered quantity and delivery date for this item from schedule lines (if present)
      const scheduleLines = item.schedule_lines || [];
      
      let itemOrderedQty = 0;
      let itemDeliveryDate = '';
      
      if (scheduleLines.length > 0) {
        itemOrderedQty = scheduleLines.reduce((sum, sl) => sum + (sl.scheduled_qty || 0), 0);
        itemDeliveryDate = scheduleLines[0].delivery_date; // use first schedule line's delivery date as main item delivery date
      } else {
        itemOrderedQty = item.ordered_quantity || 0;
        itemDeliveryDate = item.delivery_date || '';
      }
      
      const poLineVal = itemOrderedQty * (item.unit_price || 0);

      const itemRequiresAck = scheduleLines.some(sl => sl.acknowledgement_required === 'Y') || item.acknowledgement_required === 'Y';

      // 2. Item
      poItems.push([
        poNo, itemNo, matId, item.material_service_description, item.plant, 'SL01',
        itemOrderedQty, isService ? 'HR' : 'PC', (item.unit_price !== null && item.unit_price !== undefined) ? item.unit_price.toFixed(2) : '', '1', 
        poLineVal.toFixed(2), itemDeliveryDate, isService ? 'SERVICE' : 'STANDARD',
        isService ? 'K' : '', deletionFlag, deliveryCompletedFlag, 'Y', 'Y',
        itemRequiresAck ? 'ZACK' : ''
      ]);

      // Loop schedule lines
      if (scheduleLines.length === 0) {
        // Fallback for item with no schedule lines: create a default schedule line 0001
        const receivedQty = item.received_quantity || 0;
        const openQty = (item.open_quantity !== undefined && item.open_quantity !== null) ? item.open_quantity : Math.max(0, itemOrderedQty - receivedQty);
        const openVal = (item.open_value !== undefined && item.open_value !== null) ? item.open_value : openQty * (item.unit_price || 0);

        poScheduleLines.push([
          poNo, itemNo, '0001', itemDeliveryDate, itemOrderedQty, receivedQty, 
          openQty, itemDeliveryDate, item.acknowledgement_date || ''
        ]);

        // Acknowledgement
        if (item.acknowledgement_required === 'Y') {
          const ackStatus = item.acknowledgement_date ? 'ACKNOWLEDGED' : 'MISSING';
          supplierAcks.push([
            poNo, itemNo, ackStatus, item.acknowledgement_date ? itemOrderedQty : 0, 
            item.acknowledgement_date || itemDeliveryDate,
            item.acknowledgement_date ? `CONF_${poNo}` : '', 
            item.acknowledgement_date || '', 
            item.acknowledgement_date ? 'EMAIL' : '', 
            item.reminder_count || 0
          ]);
        }

        // Goods Receipt
        if (receivedQty > 0) {
          goodsReceipts.push([
            `5000${poNo.substring(4)}`, '2026', poNo, itemNo,
            '101', itemDeliveryDate, receivedQty, item.plant || 'PL01', 'SL01', '', 'GR_MOCK', ''
          ]);
        }

        // Exception Worklist and App-Owned state
        processExceptionsAndAppStores(poNo, itemNo, item, '0001', itemDeliveryDate, itemOrderedQty, receivedQty, openQty, openVal, supplierId, supplierName, buyerName, matId);
      } else {
        scheduleLines.forEach(sl => {
          const slNo = sl.schedule_line;
          const slDeliveryDate = sl.delivery_date;
          const slScheduledQty = sl.scheduled_qty || 0;
          
          // Calculate received quantity for this schedule line
          let slReceivedQty = 0;
          if (sl.goods_receipts && sl.goods_receipts.length > 0) {
            slReceivedQty = sl.goods_receipts.reduce((sum, gr) => sum + gr.qty, 0);
          } else {
            slReceivedQty = sl.received_quantity || 0;
          }

          // Calculate open quantity and open value
          let slOpenQty = 0;
          if (item.data_quality_flag === 'Y' && sl.open_quantity !== undefined) {
            slOpenQty = sl.open_quantity;
          } else {
            slOpenQty = Math.max(0, slScheduledQty - slReceivedQty);
            if (item.po_status === 'OVER_RECEIVED') {
              slOpenQty = slScheduledQty - slReceivedQty; // keep negative
            }
          }
          const slOpenVal = slOpenQty * (item.unit_price || 0);

          // Get confirmed details
          let ackDate = sl.acknowledgement_date || null;
          let ackQty = 0;
          if (sl.acknowledgements && sl.acknowledgements.length > 0) {
            const ack = sl.acknowledgements[0];
            ackDate = ack.confirmed_date || null;
            ackQty = ack.confirmed_qty || 0;
          } else if (sl.acknowledgement_required === 'Y' && item.acknowledgement_date) {
            ackDate = item.acknowledgement_date;
            ackQty = slScheduledQty;
          }

          poScheduleLines.push([
            poNo, itemNo, slNo, slDeliveryDate, slScheduledQty, slReceivedQty, 
            slOpenQty, slDeliveryDate, ackDate || ''
          ]);

          // Loop acknowledgements
          if (sl.acknowledgement_required === 'Y') {
            const ackStatus = ackDate ? 'ACKNOWLEDGED' : 'MISSING';
            supplierAcks.push([
              poNo, itemNo, ackStatus, ackQty, 
              ackDate || slDeliveryDate,
              ackDate ? `CONF_${poNo}` : '', 
              ackDate || '', 
              ackDate ? 'EMAIL' : '', 
              sl.reminder_count || 0
            ]);
          }

          // Loop goods receipts
          if (sl.goods_receipts && sl.goods_receipts.length > 0) {
            sl.goods_receipts.forEach((gr, grIdx) => {
              goodsReceipts.push([
                gr.material_doc || `500${grIdx}${poNo.substring(4)}`, 
                gr.material_doc_year || '2026', 
                poNo, itemNo,
                gr.movement_type || '101', 
                gr.posting_date || slDeliveryDate, 
                gr.qty, 
                gr.plant || item.plant || 'PL01', 
                gr.storage_location || 'SL01', 
                gr.batch_number || '', 
                gr.created_by || 'GR_MOCK', 
                gr.reference_doc || ''
              ]);
            });
          } else if (slReceivedQty > 0) {
            goodsReceipts.push([
              `5000${poNo.substring(4)}`, '2026', poNo, itemNo,
              '101', slDeliveryDate, slReceivedQty, item.plant || 'PL01', 'SL01', '', 'GR_MOCK', ''
            ]);
          }

          // Exception Worklist and App-Owned state
          processExceptionsAndAppStores(poNo, itemNo, item, slNo, slDeliveryDate, slScheduledQty, slReceivedQty, slOpenQty, slOpenVal, supplierId, supplierName, buyerName, matId, sl.last_reminder_date);
        });
      }
    });
  } else {
    // Fallback: Handle flat item for backward compatibility
    const item = poOrItem;
    const poNo = item.po_number;
    const itemNo = item.item_number || '00010';
    const supplierId = supplierMapping[item.supplier] || item.supplier || '';
    const supplierName = item.supplier ? item.supplier.split(' (')[0] : '';
    const buyerId = buyerMapping[item.buyer] || item.buyer || 'BUY-01';
    const buyerName = item.buyer ? item.buyer.split(' (')[0] : '';
    const matId = matMapping[item.material_service_description] || 'M100001';

    const openQty = (item.open_quantity !== undefined && item.open_quantity !== null) ? item.open_quantity : Math.max(0, item.ordered_quantity - (item.received_quantity || 0));
    const openVal = (item.open_value !== undefined && item.open_value !== null) ? item.open_value : openQty * (item.unit_price || 0);
    const poLineVal = (item.po_line_value !== undefined && item.po_line_value !== null) ? item.po_line_value : item.ordered_quantity * (item.unit_price || 0);

    // 1. Header (distinct only)
    if (!poHeaders.some(h => h[0] === poNo)) {
      const purchasingGroup = buyerId === 'BUY-02' ? 'PG2' : buyerId === 'BUY-03' ? 'PG3' : buyerId === 'BUY-04' ? 'PG4' : 'PG1';
      poHeaders.push([
        poNo, 'NB', item.company_code || 'US01', item.purchasing_organization || 'PO01', purchasingGroup, 
        supplierId, item.po_creation_date || '2026-05-10', item.currency || 'USD', buyerName, 'RELEASED', 
        item.po_status === 'CLOSED' ? 'CLOSED' : 'OPEN', 'NET30', 
        supplierId === 'VEND-002' ? 'FOB' : 'FCA', item.po_creation_date || '2026-05-10'
      ]);
    }

    // 2. Item
    const deletionFlag = item.deletion_completion_indicator === 'DELETED' ? 'Y' : 'N';
    const deliveryCompletedFlag = item.deletion_completion_indicator === 'COMPLETED' ? 'Y' : 'N';
    const isService = matId.startsWith('S');

    poItems.push([
      poNo, itemNo, matId, item.material_service_description, item.plant, 'SL01',
      item.ordered_quantity, isService ? 'HR' : 'PC', (item.unit_price !== null && item.unit_price !== undefined) ? item.unit_price.toFixed(2) : '', '1', 
      poLineVal.toFixed(2), item.delivery_date, isService ? 'SERVICE' : 'STANDARD',
      isService ? 'K' : '', deletionFlag, deliveryCompletedFlag, 'Y', 'Y',
      item.acknowledgement_required === 'Y' ? 'ZACK' : ''
    ]);

    // 3. Schedule Line
    poScheduleLines.push([
      poNo, itemNo, '0001', item.delivery_date, item.ordered_quantity, item.received_quantity, 
      openQty, item.delivery_date, item.acknowledgement_date || ''
    ]);

    // 4. Acknowledgement
    if (item.acknowledgement_required === 'Y') {
      const ackStatus = item.acknowledgement_date ? 'ACKNOWLEDGED' : 'MISSING';
      supplierAcks.push([
        poNo, itemNo, ackStatus, item.acknowledgement_date ? item.ordered_quantity : 0, 
        item.acknowledgement_date || item.delivery_date,
        item.acknowledgement_date ? `CONF_${poNo}` : '', 
        item.acknowledgement_date || '', 
        item.acknowledgement_date ? 'EMAIL' : '', 
        item.reminder_count || 0
      ]);
    }

    // 5. Goods Receipt
    if (item.received_quantity > 0) {
      goodsReceipts.push([
        `5000${poNo.substring(4)}`, '2026', poNo, itemNo,
        '101', item.delivery_date, item.received_quantity, item.plant || 'PL01', 'SL01', '', 'GR_MOCK', ''
      ]);
    }

    // 6. Exceptions & App state
    processExceptionsAndAppStores(poNo, itemNo, item, '0001', item.delivery_date, item.ordered_quantity, item.received_quantity, openQty, openVal, supplierId, supplierName, buyerName, matId, item.last_reminder_date);
  }
});

// Write transactional CSVs
writeCsvFile('purchase_order_headers.csv', 
  ['po_number', 'document_type', 'company_code', 'purchasing_org', 'purchasing_group', 'supplier_id', 'po_date', 'currency', 'created_by', 'release_status', 'header_status', 'payment_terms', 'incoterms', 'last_change_date'],
  poHeaders
);

writeCsvFile('purchase_order_items.csv',
  ['po_number', 'item_number', 'material_id', 'material_description', 'plant', 'storage_location', 'order_qty', 'uom', 'net_price', 'price_unit', 'item_value', 'delivery_date', 'item_category', 'account_assignment_category', 'deletion_flag', 'delivery_completed_flag', 'invoice_receipt_flag', 'goods_receipt_flag', 'confirmation_control_key'],
  poItems
);

writeCsvFile('po_schedule_lines.csv',
  ['po_number', 'item_number', 'schedule_line', 'delivery_date', 'scheduled_qty', 'received_qty', 'open_qty', 'statistical_delivery_date', 'confirmed_date'],
  poScheduleLines
);

writeCsvFile('exception_worklist.csv',
  ['exception_id', 'exception_type', 'severity', 'status', 'po_number', 'item_number', 'material_id', 'plant', 'supplier_id', 'detected_on', 'due_date', 'days_past_due', 'root_cause', 'financial_impact_estimate', 'assigned_buyer'],
  exceptionWorklist
);

writeCsvFile('supplier_acknowledgements.csv',
  ['po_number', 'item_number', 'acknowledgement_status', 'acknowledged_qty', 'committed_delivery_date', 'supplier_confirm_number', 'last_supplier_response_date', 'response_source', 'buyer_followup_count'],
  supplierAcks
);

writeCsvFile('goods_receipts.csv',
  ['material_doc', 'material_doc_year', 'po_number', 'item_number', 'movement_type', 'posting_date', 'received_qty', 'plant', 'storage_location', 'batch_number', 'created_by', 'reference_doc'],
  goodsReceipts
);

writeCsvFile('quality_inspections.csv',
  ['inspection_lot', 'material_id', 'plant', 'po_number', 'item_number', 'lot_qty', 'usage_decision', 'quality_stock_qty', 'created_date', 'decision_date'],
  []
);

writeCsvFile('asn_shipments.csv',
  ['asn_number', 'po_number', 'item_number', 'schedule_line', 'supplier_id', 'shipped_qty', 'ship_date', 'expected_delivery_date', 'carrier', 'tracking_number', 'status', 'last_status_update'],
  []
);

writeCsvFile('inventory_movements.csv',
  ['movement_id', 'material_id', 'plant', 'storage_location', 'movement_type', 'posting_date', 'quantity', 'reference_doc'],
  []
);

writeCsvFile('production_orders.csv',
  ['production_order', 'plant', 'material_id', 'order_qty', 'basic_start_date', 'basic_finish_date', 'status', 'mrp_controller'],
  []
);

writeCsvFile('reservations.csv',
  ['reservation_id', 'production_order', 'component_material_id', 'plant', 'required_qty', 'withdrawn_qty', 'requirement_date', 'final_issue_flag'],
  []
);

writeCsvFile('source_list.csv',
  ['material_id', 'plant', 'supplier_id', 'valid_from', 'valid_to', 'fixed_vendor_flag', 'quota_percent', 'source_status'],
  []
);

writeCsvFile('purchasing_info_records.csv',
  ['info_record_id', 'material_id', 'supplier_id', 'plant', 'purchasing_org', 'price', 'currency', 'price_unit', 'lead_time_days', 'min_order_qty', 'valid_from', 'valid_to'],
  []
);

writeCsvFile('agent_recommendations.csv',
  ['recommendation_id', 'exception_id', 'agent_name', 'confidence_score', 'recommended_action', 'draft_subject', 'draft_message', 'approval_status', 'created_on'],
  []
);

writeCsvFile('communication_logs.csv',
  ['message_id', 'po_number', 'item_number', 'supplier_id', 'direction', 'subject', 'body', 'sent_date', 'received_date', 'sentiment', 'extracted_commit_date', 'extracted_qty', 'source_system'],
  []
);

// CTB Snapshots
writeCsvFile('ctb_snapshots.csv',
  ['snapshot_id', 'snapshot_date', 'material_id', 'plant', 'demand_qty', 'available_stock_qty', 'open_po_qty', 'shortage_qty', 'ctb_pct', 'risk_bucket', 'time_horizon_days'],
  [
    ['SNP_001', '2026-05-28', 'M100001', 'PL01', '100', '120', '50', '0', '100.0', 'YELLOW', '30'],
    ['SNP_002', '2026-05-28', 'M100002', 'PL01', '500', '450', '100', '0', '100.0', 'YELLOW', '30'],
    ['SNP_003', '2026-05-28', 'M100003', 'PL02', '120', '90', '20', '10', '91.6', 'RED', '15']
  ]
);

// MRP elements
writeCsvFile('mrp_elements.csv',
  ['mrp_element_id', 'material_id', 'plant', 'mrp_element_type', 'mrp_element_ref', 'requirement_date', 'receipt_qty', 'requirement_qty', 'available_qty_after'],
  [
    ['MRP01', 'M100001', 'PL01', 'STOCK', '', '2026-05-28', '120', '0', '120'],
    ['MRP02', 'M100001', 'PL01', 'POITEM', '4500002001', '2026-06-25', '100', '0', '220']
  ]
);

// Write app-owned JSON files
writeJsonFile('app-recommendations.json', recommendations);
writeJsonFile('app-supplier-reminders.json', reminders);
writeJsonFile('app-supplier-responses.json', responses);
writeJsonFile('app-actions.json', actions);

console.log('\n✅ Successfully converted and seeded 60 PO / 100 line dataset to CSV and JSON workbench databases!\n');
