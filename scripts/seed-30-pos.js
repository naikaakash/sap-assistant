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

// Helper to write CSV files
function writeCsvFile(filename, headers, rows) {
  const filePath = path.join(csvDir, filename);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      if (cell === null || cell === undefined) return '';
      const cellStr = String(cell);
      if (cellStr.includes(',')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(','))
  ].join('\n') + '\n';

  fs.writeFileSync(filePath, csvContent, 'utf-8');
  console.log(`  Seeded CSV: ${filename} (${rows.length} rows)`);
}

// Helper to write JSON files
function writeJsonFile(filename, data) {
  const filePath = path.join(dataDir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  Seeded JSON: ${filename} (${data.length} records)`);
}

// ---------------------------------------------------------------------------
// 1. MASTER DATA GENERATION
// ---------------------------------------------------------------------------

// company_codes.csv
writeCsvFile('company_codes.csv', 
  ['company_code', 'company_name', 'currency'],
  [
    ['US01', 'Acme Electronics US', 'USD'],
    ['EU01', 'Acme Electronics EU', 'EUR']
  ]
);

// plants.csv
writeCsvFile('plants.csv',
  ['plant', 'plant_name', 'city', 'region', 'country', 'timezone'],
  [
    ['PL01', 'Austin Tech Plant', 'Austin', 'TX', 'US', 'CST'],
    ['PL02', 'Berlin Tech Plant', 'Berlin', '', 'DE', 'CET'],
    ['PL03', 'Munich Plant', 'Munich', '', 'DE', 'CET']
  ]
);

// purchasing_orgs.csv
writeCsvFile('purchasing_orgs.csv',
  ['purchasing_org', 'purchasing_org_name'],
  [
    ['PO01', 'US Purchasing Org'],
    ['PO02', 'EU Purchasing Org']
  ]
);

// purchasing_groups.csv
writeCsvFile('purchasing_groups.csv',
  ['purchasing_group', 'purchasing_group_name', 'buyer_email'],
  [
    ['PG1', 'Alex Buyer Group', 'alex.buyer@example.com'],
    ['PG2', 'Sarah Planner Group', 'sarah.planner@example.com']
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
    ['S200003', 'Cloud Migration System Analysis', 'SERVICES', 'HR', '02', '0201', 'C', 'N', 'N', 'N', '60000.00', 'EUR']
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
    ['S200003', 'PL03', 'ND', 'MC3', 'F', '30', '0', '0', '0', 'EX', '1', '1', 'N']
  ]
);

// suppliers.csv
writeCsvFile('suppliers.csv',
  ['supplier_id', 'business_partner_id', 'supplier_name', 'country', 'region', 'payment_terms', 'incoterms', 'supplier_tier', 'risk_score', 'avg_response_days', 'on_time_delivery_pct', 'quality_ppm', 'created_on', 'blocked_flag'],
  [
    ['VEND-001', 'BP200001', 'Sterling Electronics', 'US', 'TX', 'NET30', 'FCA', 'STRATEGIC', '38', '4.4', '80', '658', '2023-05-29', 'N'],
    ['VEND-002', 'BP200002', 'Global Foundry', 'US', 'CA', 'NET60', 'FOB', 'STRATEGIC', '61', '7.4', '98', '1934', '2024-11-24', 'N'],
    ['VEND-003', 'BP200003', 'Consulting Group', 'DE', 'Berlin', 'NET30', 'FCA', 'STRATEGIC', '15', '2.0', '95', '0', '2025-01-01', 'N']
  ]
);

// supplier_contacts.csv
writeCsvFile('supplier_contacts.csv',
  ['contact_id', 'supplier_id', 'contact_name', 'email', 'role', 'primary_flag'],
  [
    ['CON01', 'VEND-001', 'Alice Sterling', 'alice@sterlingelectronics.com', 'Sales Manager', 'Y'],
    ['CON02', 'VEND-002', 'Bob Foundry', 'bob@globalfoundry.com', 'Account Director', 'Y'],
    ['CON03', 'VEND-003', 'Clara Consulting', 'clara@consultinggroup.com', 'Sales Manager', 'Y']
  ]
);

// inventory_stock.csv
writeCsvFile('inventory_stock.csv',
  ['material_id', 'plant', 'storage_location', 'unrestricted_stock', 'quality_stock', 'blocked_stock', 'in_transit_stock', 'last_count_date', 'cycle_count_indicator', 'rfid_detected_qty'],
  [
    ['M100001', 'PL01', 'SL01', '120', '0', '0', '50', '2026-05-20', 'A', '120'],
    ['M100002', 'PL01', 'SL01', '450', '0', '0', '100', '2026-05-22', 'B', '450'],
    ['M100003', 'PL02', 'SL02', '90', '0', '0', '20', '2026-05-24', 'A', '90']
  ]
);

// ---------------------------------------------------------------------------
// 2. TRANSACTIONAL ERP DATA MOCKS (30 POs)
// ---------------------------------------------------------------------------

const poHeaders = [];
const poItems = [];
const poScheduleLines = [];
const exceptionWorklist = [];
const supplierAcks = [];
const goodsReceipts = [];
const qualityInspections = [];
const communicationLogs = [];
const asnShipments = [];

// Helper mappings
const matMapping = {
  "Microprocessor Core v1": "M100001",
  "Resistor Pack 10k": "M100002",
  "ASIC Transceiver Chip": "M100003",
  "PCB Board Double Sided": "M100004",
  "ERP Implementation Consulting Services": "S200001",
  "System Upgrade Integration Test Services": "S200002",
  "Cloud Migration System Analysis": "S200003"
};

const supplierMapping = {
  "Sterling Electronics (VEND-001)": "VEND-001",
  "Global Foundry (VEND-002)": "VEND-002",
  "Consulting Group (VEND-003)": "VEND-003"
};

const buyerMapping = {
  "Alex Buyer (BUY-01)": "BUY-01",
  "Sarah Planner (BUY-02)": "BUY-02"
};

mockPos.forEach(item => {
  const poNo = item.po_number;
  const itemNo = item.item_number;
  const supplierId = supplierMapping[item.supplier] || item.supplier || '';
  const supplierName = item.supplier ? item.supplier.split(' (')[0] : '';
  const buyerId = buyerMapping[item.buyer] || item.buyer || 'BUY-01';
  const buyerName = item.buyer ? item.buyer.split(' (')[0] : '';
  const matId = matMapping[item.material_service_description] || 'M100001';

  // 1. Header (distinct only)
  if (!poHeaders.some(h => h[0] === poNo)) {
    poHeaders.push([
      poNo, 'NB', item.company_code, item.purchasing_organization, buyerId === 'BUY-02' ? 'PG2' : 'PG1', 
      supplierId, item.po_creation_date, item.currency, buyerName, 'RELEASED', 
      item.po_status === 'CLOSED' ? 'CLOSED' : 'OPEN', 'NET30', 'FCA', item.po_creation_date
    ]);
  }

  // 2. Item
  const deletionFlag = item.deletion_completion_indicator === 'DELETED' ? 'Y' : 'N';
  const deliveryCompletedFlag = item.deletion_completion_indicator === 'COMPLETED' ? 'Y' : 'N';
  const isService = matId.startsWith('S');

  poItems.push([
    poNo, itemNo, matId, item.material_service_description, item.plant, 'SL01',
    item.ordered_quantity, isService ? 'HR' : 'PC', item.unit_price.toFixed(2), '1', 
    item.po_line_value.toFixed(2), item.delivery_date, isService ? 'SERVICE' : 'STANDARD',
    isService ? 'K' : '', deletionFlag, deliveryCompletedFlag, 'Y', 'Y',
    item.acknowledgement_required === 'Y' ? 'ZACK' : ''
  ]);

  // 3. Schedule Line
  poScheduleLines.push([
    poNo, itemNo, '0001', item.delivery_date, item.ordered_quantity, item.received_quantity, 
    item.open_quantity, item.delivery_date, item.acknowledgement_date || '', 
    item.acknowledgement_required === 'Y' ? 'ZACK' : ''
  ]);

  // 4. Exception (if any)
  if (item.exception_reason && item.exception_reason !== 'None' && item.deletion_completion_indicator !== 'DELETED') {
    const excId = `EX_${poNo}_${itemNo}`;
    let excType = 'PO_OVERDUE';
    if (item.po_status.includes('ACK') || item.po_status === 'MISSING_ACKNOWLEDGEMENT' || item.po_status === 'HIGH_VALUE_MISSING_ACK') {
      excType = 'ACK_MISSING';
    } else if (item.po_status === 'DATA_QUALITY_ISSUE' || item.po_status === 'INVALID_QUANTITY' || item.po_status === 'MISSING_SUPPLIER_MASTER') {
      excType = 'INVENTORY_MISMATCH'; // DQ / Admin issue
    } else if (item.po_status.includes('INVOICE') || item.invoice_blocked_flag === 'Y') {
      excType = 'PRICE_DISPUTE'; // AP Discrepancy
    }

    const todayDate = new Date('2026-06-10');
    const delDate = new Date(item.delivery_date);
    const daysPastDue = isNaN(delDate.getTime()) ? 0 : Math.max(0, Math.round((todayDate - delDate) / (1000 * 60 * 60 * 24)));

    exceptionWorklist.push([
      excId, excType, item.risk_category, 'NEW', poNo, itemNo,
      matId, item.plant, supplierId, item.po_creation_date, item.delivery_date, daysPastDue,
      item.exception_reason, item.open_value.toFixed(0), buyerName
    ]);
  }

  // 5. Acknowledgement (if any)
  if (item.acknowledgement_required === 'Y') {
    const ackStatus = item.acknowledgement_date ? 'ACKNOWLEDGED' : 'MISSING';
    supplierAcks.push([
      poNo, itemNo, ackStatus, item.acknowledgement_date ? item.ordered_quantity : 0, 
      item.acknowledgement_date || item.delivery_date,
      item.acknowledgement_date ? `CONF_${poNo}` : '', 
      item.acknowledgement_date || '', 
      item.acknowledgement_date ? 'EMAIL' : '', 
      item.reminder_count
    ]);
  }

  // 6. Goods Receipt (if any)
  if (item.received_quantity > 0) {
    goodsReceipts.push([
      `5000${poNo.substring(4)}`, '2026', poNo, itemNo,
      '101', item.delivery_date, item.received_quantity, item.plant, 'SL01', '', 'GR_MOCK', ''
    ]);
  }

  // 7. ASN Shipments (for specific cases)
  if (item.po_status === 'INVOICE_BEFORE_GR') {
    // Awaiting GR but has invoice
  } else if (item.po_status === 'REMINDER_SENT' || item.po_status === 'REMINDER_ELIGIBLE') {
    // Overdue open line
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
  ['po_number', 'item_number', 'schedule_line', 'delivery_date', 'scheduled_qty', 'received_qty', 'open_qty', 'statistical_delivery_date', 'confirmed_date', 'confirmation_control_key'],
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

// ---------------------------------------------------------------------------
// 3. APP-OWNED JSON DATABASES SEEDING (30 POs recommendations)
// ---------------------------------------------------------------------------

const recommendations = [];
const reminders = [];
const responses = [];
const actions = [];

function seedRec(data) {
  recommendations.push({
    recommendationId: data.recommendationId,
    sourceModule: data.sourceModule || 'OVERDUE_PO',
    purchaseOrderNumber: data.purchaseOrderNumber,
    purchaseOrderItem: data.purchaseOrderItem || '00010',
    supplierId: data.supplierId || 'VEND-001',
    supplierName: data.supplierName || 'Sterling Electronics',
    recommendationType: data.recommendationType || 'SEND_SUPPLIER_REMINDER',
    lifecycleStatus: data.lifecycleStatus,
    currentOwner: data.currentOwner || 'BUYER',
    issueDetectedAt: '2026-06-08T10:00:00.000Z',
    issueReason: data.issueReason,
    recommendedActionText: data.recommendedActionText,
    verificationStatus: data.verificationStatus || 'NOT_READY',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:00:00.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:00:00.000Z',
    version: 1,
    linkedActionIds: [],
    supplierReminderId: data.supplierReminderId,
    supplierResponseId: data.supplierResponseId
  });
}

// Seed key overdue items
seedRec({
  recommendationId: 'rec-2004',
  purchaseOrderNumber: '4500002004',
  issueReason: 'PO line is overdue by 21 days.',
  recommendedActionText: 'Send supplier reminder requesting recovery confirmation.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2006',
  sourceModule: 'PO_ACKNOWLEDGEMENT',
  purchaseOrderNumber: '4500002006',
  recommendationType: 'REQUEST_ACKNOWLEDGEMENT',
  issueReason: 'PO is missing acknowledgement.',
  recommendedActionText: 'Request supplier acknowledgement confirmation.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2008',
  purchaseOrderNumber: '4500002008',
  issueReason: 'PO line is overdue by 8 days.',
  recommendedActionText: 'Send supplier reminder requesting recovery confirmation.',
  lifecycleStatus: 'PENDING_SUPPLIER_RESPONSE',
  currentOwner: 'SUPPLIER',
  supplierReminderId: 'rem-2008'
});
reminders.push({
  reminderId: 'rem-2008',
  recommendationId: 'rec-2008',
  purchaseOrderNumber: '4500002008',
  purchaseOrderItem: '00010',
  supplierId: 'VEND-001',
  supplierName: 'Sterling Electronics',
  supplierEmail: 'alice@sterlingelectronics.com',
  channel: 'EMAIL',
  reminderStatus: 'SENT',
  subject: 'Overdue PO 4500002008 Item 00010 Query',
  bodyText: 'Please verify delivery recovery schedule.',
  sentAt: '2026-06-04T10:05:00.000Z',
  createdBy: 'demo.seed',
  createdAt: '2026-06-04T10:00:00.000Z',
  updatedBy: 'demo.seed',
  updatedAt: '2026-06-04T10:05:00.000Z',
  version: 1
});

seedRec({
  recommendationId: 'rec-2009',
  purchaseOrderNumber: '4500002009',
  issueReason: 'PO line is overdue by 2 days and missing confirmation.',
  recommendedActionText: 'Send supplier reminder requesting recovery confirmation.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2010',
  sourceModule: 'PO_ACKNOWLEDGEMENT',
  purchaseOrderNumber: '4500002010',
  supplierId: 'VEND-002',
  supplierName: 'Global Foundry',
  recommendationType: 'REQUEST_ACKNOWLEDGEMENT',
  issueReason: 'High-value open order (>50K USD) missing acknowledgement.',
  recommendedActionText: 'Request supplier acknowledgement confirmation.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2020',
  purchaseOrderNumber: '4500002020',
  supplierId: 'VEND-003',
  supplierName: 'Consulting Group',
  issueReason: 'Overdue service line (>45k EUR).',
  recommendedActionText: 'Send supplier reminder requesting status confirmation.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2022',
  purchaseOrderNumber: '4500002022',
  supplierId: 'VEND-002',
  supplierName: 'Global Foundry',
  issueReason: 'Overdue open quantity and high line value (>50k USD).',
  recommendedActionText: 'Send urgent reminder to supplier.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2023',
  purchaseOrderNumber: '4500002023',
  issueReason: 'Overdue PO line with missing supplier acknowledgement.',
  recommendedActionText: 'Request supplier confirmation immediately.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2024',
  purchaseOrderNumber: '4500002024',
  issueReason: 'Overdue PO line; no goods receipt posted.',
  recommendedActionText: 'Send expedite reminder.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2026',
  purchaseOrderNumber: '4500002026',
  issueReason: 'Repeated supplier delay (>25 days overdue and 3 reminders sent).',
  recommendedActionText: 'Flag for manager review and contact supplier directly.',
  lifecycleStatus: 'RECOMMENDED',
  currentOwner: 'BUYER'
});

seedRec({
  recommendationId: 'rec-2030',
  purchaseOrderNumber: '4500002030',
  supplierId: '',
  supplierName: 'Unknown Supplier',
  issueReason: 'Supplier vendor ID is missing / null in purchase order item.',
  recommendedActionText: 'Identify and resolve supplier master data issue in ERP.',
  lifecycleStatus: 'BLOCKED',
  currentOwner: 'BUYER'
});

writeJsonFile('app-recommendations.json', recommendations);
writeJsonFile('app-supplier-reminders.json', reminders);
writeJsonFile('app-supplier-responses.json', responses);
writeJsonFile('app-actions.json', actions);

console.log('\n✅ Successfully converted 30 POs mock data to CSV and loaded into workbench data samples!\n');
