/**
 * scripts/reset-demo-state.js — Phase 8I
 *
 * Restores the full 20-PO demo world, including:
 * 1. Overwriting procurement_data_sample/ mock ERP source CSV files.
 * 2. Overwriting data/ app-owned JSON files.
 *
 * This restores the workbench to a known, predictable starting state with exactly 20 POs.
 */

const fs = require('fs');
const path = require('path');

const CSV_DIR = path.join(__dirname, '..', 'procurement_data_sample');
const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(__dirname, '..', 'procurement_data_sample_original');

// Ensure that we have the backup folder before overwriting anything
if (!fs.existsSync(BACKUP_DIR)) {
  console.error('\n❌ ERROR: Original backup directory (procurement_data_sample_original) not found!');
  console.error('Please run scripts/backup-original-data.js first before resetting.\n');
  process.exit(1);
}

// Helper to write CSV files with EBUSY retry logic
function writeCsvFile(filename, headers, rows) {
  const filePath = path.join(CSV_DIR, filename);
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => {
      if (cell === null || cell === undefined) return '';
      // Escape commas in strings if any
      const cellStr = String(cell);
      if (cellStr.includes(',')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(','))
  ].join('\n') + '\n';

  let retries = 5;
  while (retries > 0) {
    try {
      fs.writeFileSync(filePath, csvContent, 'utf-8');
      console.log(`  Seeded CSV: ${filename} (${rows.length} rows)`);
      break;
    } catch (err) {
      if (err.code === 'EBUSY' && retries > 1) {
        retries--;
        const stop = Date.now() + 100;
        while (Date.now() < stop) {}
      } else {
        throw err;
      }
    }
  }
}

// Helper to write JSON files with EBUSY retry logic
function writeJsonFile(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const jsonContent = JSON.stringify(data, null, 2);
  let retries = 5;
  while (retries > 0) {
    try {
      fs.writeFileSync(filePath, jsonContent, 'utf-8');
      console.log(`  Seeded JSON: ${filename} (${data.length} records)`);
      break;
    } catch (err) {
      if (err.code === 'EBUSY' && retries > 1) {
        retries--;
        const stop = Date.now() + 100;
        while (Date.now() < stop) {}
      } else {
        throw err;
      }
    }
  }
}

function runReset() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  Phase 8I: Initializing Curated 20-PO Demo Workbench');
  console.log('══════════════════════════════════════════════════════════\n');

  // Ensure directories exist
  if (!fs.existsSync(CSV_DIR)) fs.mkdirSync(CSV_DIR, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  // ---------------------------------------------------------------------------
  // 1. MASTER DATA GENERATION
  // ---------------------------------------------------------------------------

  // company_codes.csv
  writeCsvFile('company_codes.csv', 
    ['company_code', 'company_name', 'currency'],
    [
      ['US01', 'Acme Electronics US', 'USD'],
      ['DE01', 'Acme Electronics DE', 'EUR']
    ]
  );

  // plants.csv
  writeCsvFile('plants.csv',
    ['plant', 'plant_name', 'city', 'region', 'country', 'timezone'],
    [
      ['PL001', 'Austin Tech Plant', 'Austin', 'TX', 'US', 'CST'],
      ['PL002', 'Berlin Tech Plant', 'Berlin', '', 'DE', 'CET']
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
      ['PG1', 'Austin Buyer', 'austin.buyer@example.com'],
      ['PG2', 'Berlin Buyer', 'berlin.buyer@example.com']
    ]
  );

  // materials.csv
  writeCsvFile('materials.csv',
    ['material_id', 'material_description', 'material_group', 'base_uom', 'division', 'product_hierarchy', 'abc_indicator', 'critical_part_flag', 'serial_managed_flag', 'batch_managed_flag', 'standard_price', 'currency'],
    [
      ['M100001', 'Microprocessor Core v1', 'SEMICONDUCTOR', 'PC', '01', '0101', 'A', 'Y', 'N', 'N', '15.00', 'USD'],
      ['M100002', 'PCB Board Double Sided', 'COMPONENTS', 'PC', '01', '0102', 'B', 'N', 'N', 'N', '2.50', 'USD'],
      ['M100003', 'Nexus Memory Controller', 'SEMICONDUCTOR', 'PC', '01', '0101', 'A', 'Y', 'N', 'N', '28.50', 'USD']
    ]
  );

  // material_plant.csv
  writeCsvFile('material_plant.csv',
    ['material_id', 'plant', 'mrp_type', 'mrp_controller', 'procurement_type', 'planned_delivery_time_days', 'gr_processing_time_days', 'safety_stock', 'reorder_point', 'lot_size', 'min_lot_size', 'rounding_value', 'source_list_required'],
    [
      ['M100001', 'PL001', 'PD', 'MC1', 'F', '15', '2', '200', '150', 'EX', '10', '10', 'Y'],
      ['M100002', 'PL001', 'PD', 'MC1', 'F', '10', '1', '500', '400', 'EX', '50', '50', 'N'],
      ['M100003', 'PL001', 'PD', 'MC2', 'F', '20', '2', '100', '80', 'EX', '5', '5', 'Y']
    ]
  );

  // inventory_stock.csv
  writeCsvFile('inventory_stock.csv',
    ['material_id', 'plant', 'storage_location', 'unrestricted_stock', 'quality_stock', 'blocked_stock', 'in_transit_stock', 'last_count_date', 'cycle_count_indicator', 'rfid_detected_qty'],
    [
      ['M100001', 'PL001', 'SL01', '120', '0', '0', '50', '2026-05-20', 'A', '120'],
      ['M100002', 'PL001', 'SL01', '450', '0', '0', '100', '2026-05-22', 'B', '450'],
      ['M100003', 'PL001', 'SL02', '90', '0', '0', '20', '2026-05-24', 'A', '90']
    ]
  );

  // suppliers.csv
  writeCsvFile('suppliers.csv',
    ['supplier_id', 'business_partner_id', 'supplier_name', 'country', 'region', 'payment_terms', 'incoterms', 'supplier_tier', 'risk_score', 'avg_response_days', 'on_time_delivery_pct', 'quality_ppm', 'created_on', 'blocked_flag'],
    [
      ['VEND-001', 'BP200001', 'Sterling Electronics', 'US', 'TX', 'NET30', 'FCA', 'STRATEGIC', '38', '4.4', '80', '658', '2023-05-29', 'N'],
      ['S100009', 'BP200009', 'Nexus Components', 'US', 'CA', 'NET60', 'FOB', 'STRATEGIC', '61', '7.4', '98', '1934', '2024-11-24', 'N']
    ]
  );

  // supplier_contacts.csv
  writeCsvFile('supplier_contacts.csv',
    ['contact_id', 'supplier_id', 'contact_name', 'email', 'role', 'primary_flag'],
    [
      ['CON01', 'VEND-001', 'Alice Sterling', 'alice@sterlingelectronics.com', 'Sales Manager', 'Y'],
      ['CON02', 'S100009', 'Bob Nexus', 'bob@nexuscomponents.com', 'Account Director', 'Y']
    ]
  );

  // ---------------------------------------------------------------------------
  // 2. TRANSACTIONAL ERP DATA MOCKS (20 CURATED POs)
  // ---------------------------------------------------------------------------

  const poHeaders = [];
  const poItems = [];
  const poScheduleLines = [];
  const exceptionWorklist = [];
  const supplierAcks = [];
  const goodsReceipts = [];
  const qualityInspections = [];

  // Helper to add a PO
  function addCuratedPo({
    poNumber,
    poDate,
    supplierId,
    supplierName,
    itemNumber = '00010',
    materialId = 'M100001',
    materialDesc = 'Microprocessor Core v1',
    plant = 'PL001',
    orderQty = 100,
    netPrice = 15.00,
    deliveryDate, // Base date (will be shifted at runtime relative to anchor)
    ackStatus = null,
    ackQty = null,
    ackDate = null,
    exceptionType = null,
    severity = 'MEDIUM',
    status = 'UNRESOLVED',
    daysPastDue = 0,
    grQty = 0,
    grDate = null,
    qiLotQty = 0,
    qiDecision = null
  }) {
    // 1. Header
    poHeaders.push([
      poNumber, 'NB', 'US01', 'PO01', 'PG1', supplierId, poDate, 'USD', 
      'buyer.demo', 'RELEASED', 'OPEN', 'NET30', 'FCA', poDate
    ]);

    // 2. Item
    const itemValue = (orderQty * netPrice).toFixed(2);
    poItems.push([
      poNumber, itemNumber, materialId, materialDesc, plant, 'SL01',
      orderQty, 'PC', netPrice.toFixed(2), '1', itemValue, deliveryDate,
      '0', '', 'N', 'N', 'Y', 'Y',
      ackStatus ? 'ZACK' : ''
    ]);

    // 3. Schedule Line
    const openQty = Math.max(0, orderQty - grQty);
    poScheduleLines.push([
      poNumber, itemNumber, '0001', deliveryDate, orderQty, grQty, openQty,
      deliveryDate, ackDate || ''
    ]);

    // 4. Exception (if any)
    if (exceptionType) {
      const excId = `EX_${poNumber}_${itemNumber}`;
      exceptionWorklist.push([
        excId, exceptionType, severity, status, poNumber, itemNumber,
        materialId, plant, supplierId, poDate, deliveryDate, daysPastDue,
        exceptionType.includes('OVERDUE') ? 'SUPPLIER_PROD_DELAY' : 'SUPPLIER_MISSED_COMM',
        (openQty * netPrice).toFixed(0), 'buyer.demo'
      ]);
    }

    // 5. Acknowledgement (if any)
    if (ackStatus) {
      supplierAcks.push([
        poNumber, itemNumber, ackStatus, ackQty || orderQty, ackDate || deliveryDate,
        `CONF_${poNumber}`, poDate, 'EMAIL', '0'
      ]);
    }

    // 6. Goods Receipt (if any)
    if (grQty > 0 && grDate) {
      goodsReceipts.push([
        `5000${poNumber.substring(5)}`, '2026', poNumber, itemNumber,
        '101', grDate, grQty, plant, 'SL01', '', 'GR_MOCK', ''
      ]);
    }

    // 7. Quality Inspection (if any)
    if (qiLotQty > 0 && qiDecision) {
      qualityInspections.push([
        `3000${poNumber.substring(5)}`, materialId, plant, poNumber, itemNumber,
        qiLotQty, qiDecision, qiLotQty, poDate, grDate || poDate
      ]);
    }
  }

  // --- SEED 20 CURATED SCENARIOS ---

  // 1. Clean / Normal PO
  addCuratedPo({
    poNumber: '4500001001', poDate: '2026-05-15', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-06-15', ackStatus: 'CONFIRMED'
  });

  // 2. Overdue PO
  addCuratedPo({
    poNumber: '4500001002', poDate: '2026-05-05', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'CRITICAL', daysPastDue: 8
  });

  // 3. Overdue >30 days
  addCuratedPo({
    poNumber: '4500001003', poDate: '2026-04-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-04-20', exceptionType: 'PO_OVERDUE', severity: 'CRITICAL', daysPastDue: 38
  });

  // 4. Missing acknowledgement
  addCuratedPo({
    poNumber: '4500001004', poDate: '2026-05-25', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-06-05', exceptionType: 'ACK_MISSING', severity: 'HIGH'
  });

  // 5. Pending supplier response
  addCuratedPo({
    poNumber: '4500001005', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 6. Supplier responded with delivery date change
  addCuratedPo({
    poNumber: '4500001006', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 7. Supplier responded with quantity change
  addCuratedPo({
    poNumber: '4500001007', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 8. Supplier price issue
  addCuratedPo({
    poNumber: '4500001008', poDate: '2026-05-15', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-06-10', ackStatus: 'PRICE_DISPUTE', exceptionType: 'ACK_MISSING', severity: 'MEDIUM'
  });

  // 9. Supplier rejected
  addCuratedPo({
    poNumber: '4500001009', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'CRITICAL', daysPastDue: 8
  });

  // 10. Partial confirmation
  addCuratedPo({
    poNumber: '4500001010', poDate: '2026-05-15', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-06-15', ackStatus: 'QTY_DISPUTE', ackQty: 50, ackDate: '2026-06-28', exceptionType: 'ACK_MISSING', severity: 'HIGH'
  });

  // 11. Wrong contact
  addCuratedPo({
    poNumber: '4500001011', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 12. Out of office
  addCuratedPo({
    poNumber: '4500001012', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'MEDIUM', daysPastDue: 8
  });

  // 13. Unclear free-text response
  addCuratedPo({
    poNumber: '4500001013', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'MEDIUM', daysPastDue: 8
  });

  // 14. Pending buyer manual SAP update
  addCuratedPo({
    poNumber: '4500001014', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 15. Verification pending
  addCuratedPo({
    poNumber: '4500001015', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 16. Verification passed / confirmed resolved
  addCuratedPo({
    poNumber: '4500001016', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-06-15' // Date is updated to match the expected value
  });

  // 17. Verification failed
  addCuratedPo({
    poNumber: '4500001017', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8 // Date is NOT updated in ERP
  });

  // 18. Blocked
  addCuratedPo({
    poNumber: '4500001018', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8
  });

  // 19. Escalated
  addCuratedPo({
    poNumber: '4500001019', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'CRITICAL', daysPastDue: 8
  });

  // 20. Closed no action
  addCuratedPo({
    poNumber: '4500001020', poDate: '2026-05-10', supplierId: 'VEND-001', supplierName: 'Sterling Electronics',
    deliveryDate: '2026-05-20', exceptionType: 'PO_OVERDUE', severity: 'HIGH', daysPastDue: 8, status: 'RESOLVED'
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
    qualityInspections
  );

  // Write empty/dummy CSVs to prevent server crashes
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
      ['SNP_001', '2026-05-28', 'M100001', 'PL001', '100', '120', '50', '0', '100.0', 'YELLOW', '30'],
      ['SNP_002', '2026-05-28', 'M100002', 'PL001', '500', '450', '100', '0', '100.0', 'YELLOW', '30'],
      ['SNP_003', '2026-05-28', 'M100003', 'PL001', '120', '90', '20', '10', '91.6', 'RED', '15']
    ]
  );

  // MRP elements
  writeCsvFile('mrp_elements.csv',
    ['mrp_element_id', 'material_id', 'plant', 'mrp_element_type', 'mrp_element_ref', 'requirement_date', 'receipt_qty', 'requirement_qty', 'available_qty_after'],
    [
      ['MRP01', 'M100001', 'PL001', 'STOCK', '', '2026-05-28', '120', '0', '120'],
      ['MRP02', 'M100001', 'PL001', 'POITEM', '4500001001', '2026-06-15', '100', '0', '220'],
      ['MRP03', 'M100003', 'PL001', 'STOCK', '', '2026-05-28', '90', '0', '90'],
      ['MRP04', 'M100003', 'PL001', 'RESERVATION', 'RES01', '2026-06-05', '0', '120', '-30']
    ]
  );

  // ---------------------------------------------------------------------------
  // 3. APP-OWNED MOCK DATABASE SEEDING (JSON)
  // ---------------------------------------------------------------------------

  const recommendations = [];
  const reminders = [];
  const responses = [];
  const actions = [];

  // Seed recommendations specifically mapped to the 20 POs
  
  // Helper to push recommendation
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
      updatedBy: data.updatedBy || 'demo.seed',
      updatedAt: data.updatedAt || '2026-06-08T10:00:00.000Z',
      version: data.version || 1,
      linkedActionIds: [],
      // Optional extra fields
      responseCategory: data.responseCategory || undefined,
      interpretedSummary: data.interpretedSummary || undefined,
      recommendedSapField: data.recommendedSapField || undefined,
      recommendedSapValue: data.recommendedSapValue || undefined,
      verificationField: data.verificationField || undefined,
      expectedValueAfterSync: data.expectedValueAfterSync || undefined,
      verificationMessage: data.verificationMessage || undefined,
      closureReason: data.closureReason || undefined,
      closedAt: data.closedAt || undefined,
      supplierReminderId: data.supplierReminderId || undefined,
      supplierResponseId: data.supplierResponseId || undefined
    });
  }

  // --- PO 4500001002 ---
  seedRec({
    recommendationId: 'demo-rec-1002',
    purchaseOrderNumber: '4500001002',
    issueReason: 'PO line is overdue by 8 days.',
    recommendedActionText: 'Send supplier reminder requesting recovery confirmation.',
    lifecycleStatus: 'RECOMMENDED',
    currentOwner: 'BUYER'
  });

  // --- PO 4500001003 ---
  seedRec({
    recommendationId: 'demo-rec-1003',
    purchaseOrderNumber: '4500001003',
    issueReason: 'PO line is critically overdue by 38 days.',
    recommendedActionText: 'Send urgent reminder to supplier and flag for manager review.',
    lifecycleStatus: 'RECOMMENDED',
    currentOwner: 'BUYER'
  });

  // --- PO 4500001004 ---
  seedRec({
    recommendationId: 'demo-rec-1004',
    sourceModule: 'PO_ACKNOWLEDGEMENT',
    purchaseOrderNumber: '4500001004',
    recommendationType: 'REQUEST_ACKNOWLEDGEMENT',
    issueReason: 'PO is missing acknowledgement.',
    recommendedActionText: 'Request supplier acknowledgement confirmation.',
    lifecycleStatus: 'RECOMMENDED',
    currentOwner: 'BUYER'
  });

  // --- PO 4500001005 ---
  seedRec({
    recommendationId: 'demo-rec-1005',
    purchaseOrderNumber: '4500001005',
    issueReason: 'PO line is overdue. Waiting for supplier response.',
    recommendedActionText: 'Verify delivery schedule once response is captured.',
    lifecycleStatus: 'PENDING_SUPPLIER_RESPONSE',
    currentOwner: 'SUPPLIER',
    supplierReminderId: 'demo-rem-1005'
  });
  reminders.push({
    reminderId: 'demo-rem-1005',
    recommendationId: 'demo-rec-1005',
    purchaseOrderNumber: '4500001005',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    supplierEmail: 'alice@sterlingelectronics.com',
    channel: 'EMAIL',
    reminderStatus: 'SENT',
    subject: 'Overdue PO 4500001005 Item 00010 Status Query',
    bodyText: 'Dear Sterling Electronics, PO 4500001005 is overdue. Please confirm your delivery recovery schedule.',
    sentAt: '2026-06-08T10:05:00.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:00:00.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:05:00.000Z',
    version: 2
  });

  // --- PO 4500001006 ---
  seedRec({
    recommendationId: 'demo-rec-1006',
    purchaseOrderNumber: '4500001006',
    recommendationType: 'UPDATE_SAP_DELIVERY_DATE_MANUALLY',
    issueReason: 'Supplier proposed rescheduling delivery to June 12.',
    recommendedActionText: 'Confirm manual SAP update: change delivery date to 2026-06-12.',
    lifecycleStatus: 'SUPPLIER_RESPONDED',
    currentOwner: 'BUYER',
    responseCategory: 'DELIVERY_DATE_CHANGED',
    interpretedSummary: 'Supplier proposed delivery date shift: 2026-06-12.',
    recommendedSapField: 'delivery_date',
    recommendedSapValue: '2026-06-12',
    verificationField: 'delivery_date',
    expectedValueAfterSync: '2026-06-12',
    supplierReminderId: 'demo-rem-1006',
    supplierResponseId: 'demo-resp-1006'
  });
  reminders.push({
    reminderId: 'demo-rem-1006',
    recommendationId: 'demo-rec-1006',
    purchaseOrderNumber: '4500001006',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    supplierEmail: 'alice@sterlingelectronics.com',
    channel: 'EMAIL',
    reminderStatus: 'SENT',
    subject: 'Overdue PO 4500001006 Query',
    bodyText: 'Please verify recovery date.',
    sentAt: '2026-06-08T10:05:00.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:00:00.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:05:00.000Z',
    version: 2
  });
  responses.push({
    responseId: 'demo-resp-1006',
    reminderId: 'demo-rem-1006',
    recommendationId: 'demo-rec-1006',
    purchaseOrderNumber: '4500001006',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    channel: 'EMAIL',
    responseStatus: 'INTERPRETED',
    responseCategory: 'DELIVERY_DATE_CHANGED',
    rawResponseText: 'Rescheduling delivery date to June 12.',
    interpretedSummary: 'Supplier proposed a new delivery date: 2026-06-12.',
    proposedNewDeliveryDate: '2026-06-12',
    respondedAt: '2026-06-08T10:08:00.000Z',
    capturedAt: '2026-06-08T10:08:30.000Z',
    capturedBy: 'system.mail',
    interpretedBy: 'heuristic-parser',
    interpretedAt: '2026-06-08T10:08:35.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:08:35.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:08:35.000Z',
    version: 1
  });

  // --- PO 4500001007 ---
  seedRec({
    recommendationId: 'demo-rec-1007',
    purchaseOrderNumber: '4500001007',
    recommendationType: 'UPDATE_SAP_QUANTITY_MANUALLY',
    issueReason: 'Supplier proposed quantity reduction to 60 units.',
    recommendedActionText: 'Confirm manual SAP update: change order quantity to 60.',
    lifecycleStatus: 'SUPPLIER_RESPONDED',
    currentOwner: 'BUYER',
    responseCategory: 'QUANTITY_CHANGED',
    interpretedSummary: 'Supplier proposed quantity change: 60 units instead of 100.',
    recommendedSapField: 'quantity',
    recommendedSapValue: '60',
    verificationField: 'quantity',
    expectedValueAfterSync: '60',
    supplierReminderId: 'demo-rem-1007',
    supplierResponseId: 'demo-resp-1007'
  });
  reminders.push({
    reminderId: 'demo-rem-1007',
    recommendationId: 'demo-rec-1007',
    purchaseOrderNumber: '4500001007',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    supplierEmail: 'alice@sterlingelectronics.com',
    channel: 'EMAIL',
    reminderStatus: 'SENT',
    subject: 'Overdue PO 4500001007 Query',
    bodyText: 'Please verify quantity.',
    sentAt: '2026-06-08T10:05:00.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:00:00.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:05:00.000Z',
    version: 2
  });
  responses.push({
    responseId: 'demo-resp-1007',
    reminderId: 'demo-rem-1007',
    recommendationId: 'demo-rec-1007',
    purchaseOrderNumber: '4500001007',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    channel: 'EMAIL',
    responseStatus: 'INTERPRETED',
    responseCategory: 'QUANTITY_CHANGED',
    rawResponseText: 'Can confirm only 60 units due to component constraints.',
    interpretedSummary: 'Supplier proposed a new quantity: 60.',
    proposedNewQuantity: 60,
    respondedAt: '2026-06-08T10:08:00.000Z',
    capturedAt: '2026-06-08T10:08:30.000Z',
    capturedBy: 'system.mail',
    interpretedBy: 'heuristic-parser',
    interpretedAt: '2026-06-08T10:08:35.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:08:35.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:08:35.000Z',
    version: 1
  });

  // --- PO 4500001008 ---
  seedRec({
    recommendationId: 'demo-rec-1008',
    sourceModule: 'PO_ACKNOWLEDGEMENT',
    purchaseOrderNumber: '4500001008',
    recommendationType: 'NO_ACTION_REQUIRED',
    issueReason: 'Supplier acknowledgement returned with a price dispute.',
    recommendedActionText: 'Review unit price difference. Contact supplier manager or align manually.',
    lifecycleStatus: 'PENDING_BUYER_ACTION',
    currentOwner: 'BUYER'
  });

  // --- PO 4500001009 ---
  seedRec({
    recommendationId: 'demo-rec-1009',
    purchaseOrderNumber: '4500001009',
    recommendationType: 'ESCALATE_SUPPLIER',
    issueReason: 'Supplier rejected the overdue PO lines.',
    recommendedActionText: 'Supplier rejected PO. Escalate internally with materials manager.',
    lifecycleStatus: 'ESCALATED',
    currentOwner: 'BUYER',
    responseCategory: 'REJECTED',
    interpretedSummary: 'Supplier email: \'We cannot meet the overdue quantity and must reject the request.\'',
    supplierResponseId: 'demo-resp-1009'
  });
  responses.push({
    responseId: 'demo-resp-1009',
    recommendationId: 'demo-rec-1009',
    purchaseOrderNumber: '4500001009',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    channel: 'EMAIL',
    responseStatus: 'INTERPRETED',
    responseCategory: 'REJECTED',
    rawResponseText: 'We cannot meet the overdue quantity and must reject the request.',
    interpretedSummary: 'Supplier rejected delivery date request.',
    respondedAt: '2026-06-08T10:08:00.000Z',
    capturedAt: '2026-06-08T10:08:30.000Z',
    capturedBy: 'system.mail',
    interpretedBy: 'heuristic-parser',
    interpretedAt: '2026-06-08T10:08:35.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:08:35.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:08:35.000Z',
    version: 1
  });

  // --- PO 4500001010 ---
  seedRec({
    recommendationId: 'demo-rec-1010',
    sourceModule: 'PO_ACKNOWLEDGEMENT',
    purchaseOrderNumber: '4500001010',
    recommendationType: 'NO_ACTION_REQUIRED',
    issueReason: 'Supplier returned partial quantity confirmation (50/100 units).',
    recommendedActionText: 'Align split schedule lines manually inside SAP.',
    lifecycleStatus: 'PENDING_BUYER_ACTION',
    currentOwner: 'BUYER'
  });

  // --- PO 4500001011 ---
  seedRec({
    recommendationId: 'demo-rec-1011',
    purchaseOrderNumber: '4500001011',
    issueReason: 'Incorrect contact. Email reminder bounced back: User unknown.',
    recommendedActionText: 'Identify correct email contact for Sterling Electronics in ERP.',
    lifecycleStatus: 'BLOCKED',
    currentOwner: 'BUYER',
    closureReason: 'Blocked: Invalid contact email address.'
  });

  // --- PO 4500001012 ---
  seedRec({
    recommendationId: 'demo-rec-1012',
    purchaseOrderNumber: '4500001012',
    issueReason: 'Supplier contact is Out of Office until June 20th.',
    recommendedActionText: 'Review auto-reply. Direct inquiries to alternate contact or wait.',
    lifecycleStatus: 'PENDING_BUYER_ACTION',
    currentOwner: 'BUYER',
    responseCategory: 'OUT_OF_OFFICE',
    interpretedSummary: 'Supplier auto-reply: \'I am out of the office until June 20th.\'',
    supplierResponseId: 'demo-resp-1012'
  });
  responses.push({
    responseId: 'demo-resp-1012',
    recommendationId: 'demo-rec-1012',
    purchaseOrderNumber: '4500001012',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    channel: 'EMAIL',
    responseStatus: 'INTERPRETED',
    responseCategory: 'OUT_OF_OFFICE',
    rawResponseText: 'I am out of the office until June 20th.',
    interpretedSummary: 'Supplier contact is out of the office.',
    respondedAt: '2026-06-08T10:08:00.000Z',
    capturedAt: '2026-06-08T10:08:30.000Z',
    capturedBy: 'system.mail',
    interpretedBy: 'heuristic-parser',
    interpretedAt: '2026-06-08T10:08:35.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:08:35.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:08:35.000Z',
    version: 1
  });

  // --- PO 4500001013 ---
  seedRec({
    recommendationId: 'demo-rec-1013',
    purchaseOrderNumber: '4500001013',
    issueReason: 'Supplier response is unclear.',
    recommendedActionText: 'Review free-text message and follow up manually with supplier.',
    lifecycleStatus: 'PENDING_BUYER_ACTION',
    currentOwner: 'BUYER',
    responseCategory: 'UNCLEAR',
    interpretedSummary: 'Supplier response: \'We will check our schedule and get back to you next week.\'',
    supplierResponseId: 'demo-resp-1013'
  });
  responses.push({
    responseId: 'demo-resp-1013',
    recommendationId: 'demo-rec-1013',
    purchaseOrderNumber: '4500001013',
    purchaseOrderItem: '00010',
    supplierId: 'VEND-001',
    supplierName: 'Sterling Electronics',
    channel: 'EMAIL',
    responseStatus: 'INTERPRETED',
    responseCategory: 'UNCLEAR',
    rawResponseText: 'We will check our schedule and get back to you next week.',
    interpretedSummary: 'Supplier response is unclear.',
    respondedAt: '2026-06-08T10:08:00.000Z',
    capturedAt: '2026-06-08T10:08:30.000Z',
    capturedBy: 'system.mail',
    interpretedBy: 'heuristic-parser',
    interpretedAt: '2026-06-08T10:08:35.000Z',
    createdBy: 'demo.seed',
    createdAt: '2026-06-08T10:08:35.000Z',
    updatedBy: 'demo.seed',
    updatedAt: '2026-06-08T10:08:35.000Z',
    version: 1
  });

  // --- PO 4500001014 ---
  seedRec({
    recommendationId: 'demo-rec-1014',
    purchaseOrderNumber: '4500001014',
    recommendationType: 'UPDATE_SAP_DELIVERY_DATE_MANUALLY',
    issueReason: 'Supplier proposed recovery date: 2026-06-15.',
    recommendedActionText: 'Change PO delivery date to 2026-06-15 in SAP. Once complete, click "Confirm manual SAP action completed".',
    lifecycleStatus: 'PENDING_BUYER_SAP_UPDATE',
    currentOwner: 'BUYER',
    responseCategory: 'DELIVERY_DATE_CHANGED',
    interpretedSummary: 'Supplier proposed delivery date shift: 2026-06-15.',
    recommendedSapField: 'delivery_date',
    recommendedSapValue: '2026-06-15',
    verificationField: 'delivery_date',
    expectedValueAfterSync: '2026-06-15'
  });

  // --- PO 4500001015 ---
  seedRec({
    recommendationId: 'demo-rec-1015',
    purchaseOrderNumber: '4500001015',
    recommendationType: 'UPDATE_SAP_DELIVERY_DATE_MANUALLY',
    issueReason: 'Manual SAP action noted. Awaiting source refresh verification.',
    recommendedActionText: 'Recommended manual SAP update to 2026-06-15 completed. Awaiting source refresh verification.',
    lifecycleStatus: 'VERIFICATION_PENDING',
    currentOwner: 'SYSTEM',
    responseCategory: 'DELIVERY_DATE_CHANGED',
    interpretedSummary: 'Supplier proposed delivery date shift: 2026-06-15.',
    recommendedSapField: 'delivery_date',
    recommendedSapValue: '2026-06-15',
    verificationField: 'delivery_date',
    expectedValueAfterSync: '2026-06-15',
    verificationStatus: 'PENDING_NEXT_SYNC'
  });

  // --- PO 4500001016 ---
  seedRec({
    recommendationId: 'demo-rec-1016',
    purchaseOrderNumber: '4500001016',
    recommendationType: 'UPDATE_SAP_DELIVERY_DATE_MANUALLY',
    issueReason: 'Delivery date discrepancy resolved.',
    recommendedActionText: 'Verified after source sync. Expected value matches refurbished source data.',
    lifecycleStatus: 'CONFIRMED_RESOLVED',
    currentOwner: 'NONE',
    responseCategory: 'DELIVERY_DATE_CHANGED',
    recommendedSapField: 'delivery_date',
    recommendedSapValue: '2026-06-15',
    verificationField: 'delivery_date',
    expectedValueAfterSync: '2026-06-15',
    verificationStatus: 'PASSED',
    verificationMessage: 'Verification passed. Expected value matches latest source data.',
    closedAt: '2026-06-09T12:00:00.000Z',
    updatedBy: 'verification-engine',
    updatedAt: '2026-06-09T12:00:00.000Z',
    version: 2
  });

  // --- PO 4500001017 ---
  seedRec({
    recommendationId: 'demo-rec-1017',
    purchaseOrderNumber: '4500001017',
    recommendationType: 'UPDATE_SAP_DELIVERY_DATE_MANUALLY',
    issueReason: 'Manual SAP action noted. Verification check failed.',
    recommendedActionText: 'Recommended manual SAP update to 2026-06-15 completed. Awaiting source refresh verification.',
    lifecycleStatus: 'VERIFICATION_PENDING',
    currentOwner: 'SYSTEM',
    responseCategory: 'DELIVERY_DATE_CHANGED',
    recommendedSapField: 'delivery_date',
    recommendedSapValue: '2026-06-15',
    verificationField: 'delivery_date',
    expectedValueAfterSync: '2026-06-15',
    verificationStatus: 'FAILED',
    verificationMessage: "Verification failed. Expected value '2026-06-15' but found '2026-05-20' on the PO."
  });

  // --- PO 4500001018 ---
  seedRec({
    recommendationId: 'demo-rec-1018',
    purchaseOrderNumber: '4500001018',
    issueReason: 'Recommendation is blocked.',
    recommendedActionText: 'Buyer blocked progress. Coordinate contact details.',
    lifecycleStatus: 'BLOCKED',
    currentOwner: 'BUYER',
    closureReason: 'Blocked: Contact person not responding after 3 attempts.'
  });

  // --- PO 4500001019 ---
  seedRec({
    recommendationId: 'demo-rec-1019',
    purchaseOrderNumber: '4500001019',
    issueReason: 'PO line is critically overdue.',
    recommendedActionText: 'Escalated exception. Resolve coordinates with manager.',
    lifecycleStatus: 'ESCALATED',
    currentOwner: 'BUYER'
  });

  // --- PO 4500001020 ---
  seedRec({
    recommendationId: 'demo-rec-1020',
    purchaseOrderNumber: '4500001020',
    issueReason: 'Recommendation was manually closed.',
    recommendedActionText: 'Closed without action. Reason: Material no longer required.',
    lifecycleStatus: 'CLOSED_NO_ACTION',
    currentOwner: 'NONE',
    closureReason: 'Closed: Material no longer required. PO will be deleted in SAP.',
    closedAt: '2026-06-09T12:00:00.000Z',
    verificationStatus: 'MANUALLY_CLOSED',
    version: 2
  });

  // Write JSON mocks
  writeJsonFile('app-recommendations.json', recommendations);
  writeJsonFile('app-supplier-reminders.json', reminders);
  writeJsonFile('app-supplier-responses.json', responses);
  writeJsonFile('app-actions.json', actions);

  console.log('\n✅ Demo states successfully initialized to curated 20-PO environment.\n');
}

runReset();
