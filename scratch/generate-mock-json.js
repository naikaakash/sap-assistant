const fs = require('fs');
const path = require('path');

const targetPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\data\\mock-po-data.json';

const items = [];

// Helper to push PO line item
function addItem(data) {
  // Enforce mathematical calculations unless data quality flag is Y
  let openQty = data.open_quantity;
  let openVal = data.open_value;
  if (data.data_quality_flag !== 'Y') {
    openQty = Math.max(0, data.ordered_quantity - data.received_quantity);
    if (data.po_status === 'OVER_RECEIVED') {
      openQty = data.ordered_quantity - data.received_quantity; // keep negative
    }
    openVal = openQty * (data.unit_price || 0);
  }

  items.push({
    po_number: data.po_number,
    item_number: data.item_number || '00010',
    supplier: data.supplier,
    buyer: data.buyer,
    plant: data.plant,
    company_code: data.company_code || 'US01',
    purchasing_organization: data.purchasing_organization || 'PO01',
    material_service_description: data.material_service_description,
    po_creation_date: data.po_creation_date || '2026-05-10',
    delivery_date: data.delivery_date,
    ordered_quantity: data.ordered_quantity,
    received_quantity: data.received_quantity,
    invoiced_quantity: data.invoiced_quantity || 0,
    unit_price: data.unit_price,
    currency: data.currency || 'USD',
    po_line_value: data.ordered_quantity * (data.unit_price || 0),
    open_quantity: openQty,
    open_value: openVal,
    po_status: data.po_status || 'OPEN',
    deletion_completion_indicator: data.deletion_completion_indicator || 'ACTIVE_OPEN',
    acknowledgement_required: data.acknowledgement_required || 'N',
    acknowledgement_date: data.acknowledgement_date || null,
    last_reminder_date: data.last_reminder_date || null,
    reminder_count: data.reminder_count || 0,
    gr_status: data.gr_status || 'PENDING',
    invoice_status: data.invoice_status || 'PENDING',
    invoice_blocked_flag: data.invoice_blocked_flag || 'N',
    price_variance: data.price_variance || 0.00,
    quantity_variance: data.quantity_variance || 0.00,
    risk_category: data.risk_category || 'LOW',
    exception_reason: data.exception_reason || 'None',
    data_quality_flag: data.data_quality_flag || 'N',
    test_scenarios: data.test_scenarios || []
  });
}

// ---------------------------------------------------------------------------
// SEEDING THE 100 LINES ACROSS 60 DISTINCT POS
// ---------------------------------------------------------------------------

// PO 4500002001 (5 lines) - Fully Open Material PO, On-Time, Domestic
addItem({
  po_number: '4500002001', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN', test_scenarios: ['TC-OP-01', 'TC-OP-08', 'TC-GR-01', 'TC-IV-01']
});
addItem({
  po_number: '4500002001', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-25', ordered_quantity: 200, received_quantity: 0,
  unit_price: 2.50, po_status: 'OPEN', test_scenarios: ['TC-OP-08']
});
addItem({
  po_number: '4500002001', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 500, received_quantity: 0,
  unit_price: 0.15, po_status: 'OPEN', test_scenarios: ['TC-OP-08']
});


// PO 4500002002 (4 lines) - Partially Received Material PO
addItem({
  po_number: '4500002002', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 200, received_quantity: 80, invoiced_quantity: 80,
  unit_price: 15.00, po_status: 'PARTIALLY_RECEIVED', gr_status: 'PARTIAL', invoice_status: 'PARTIAL',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-05-12',
  test_scenarios: ['TC-OP-02', 'TC-GR-02', 'TC-IV-02', 'TC-AK-02']
});
addItem({
  po_number: '4500002002', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-25', ordered_quantity: 400, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 2.50, po_status: 'PARTIALLY_RECEIVED', gr_status: 'PARTIAL', invoice_status: 'PARTIAL',
  test_scenarios: ['TC-OP-02']
});
addItem({
  po_number: '4500002002', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 1000, received_quantity: 200, invoiced_quantity: 200,
  unit_price: 0.15, po_status: 'PARTIALLY_RECEIVED', gr_status: 'PARTIAL', invoice_status: 'PARTIAL'
});
addItem({
  po_number: '4500002002', item_number: '00040',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 500, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 0.15, po_status: 'PARTIALLY_RECEIVED', gr_status: 'PARTIAL', invoice_status: 'PARTIAL'
});

// PO 4500002003 (1 line) - Fully Received PO (Historical Closed)
addItem({
  po_number: '4500002003',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-15', ordered_quantity: 150, received_quantity: 150, invoiced_quantity: 150,
  unit_price: 15.00, po_status: 'FULLY_RECEIVED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED', acknowledgement_required: 'Y', acknowledgement_date: '2026-04-17',
  test_scenarios: ['TC-OP-03', 'TC-OV-04', 'TC-OV-07', 'TC-GR-03', 'TC-IV-03']
});

// PO 4500002004 (5 lines) - Overdue Open PO Line, High Value
addItem({
  po_number: '4500002004', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-20', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 15.00, po_status: 'OVERDUE', risk_category: 'HIGH',
  exception_reason: 'Overdue open quantity with high line value',
  test_scenarios: ['TC-OV-01', 'TC-OV-10', 'TC-EM-05']
});
addItem({
  po_number: '4500002004', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-05-20', ordered_quantity: 500, received_quantity: 0,
  unit_price: 2.50, po_status: 'OVERDUE', risk_category: 'MEDIUM',
  exception_reason: 'Overdue open quantity',
  test_scenarios: ['TC-OV-01']
});
addItem({
  po_number: '4500002004', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-05-20', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 0.15, po_status: 'OVERDUE', risk_category: 'LOW',
  exception_reason: 'Overdue open quantity',
  test_scenarios: ['TC-OV-01']
});


// PO 4500002005 (3 lines) - Future Delivery Date PO
addItem({
  po_number: '4500002005', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-07-15', ordered_quantity: 300, received_quantity: 0,
  unit_price: 15.00, po_status: 'FUTURE_DELIVERY',
  test_scenarios: ['TC-OV-03']
});
addItem({
  po_number: '4500002005', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-07-15', ordered_quantity: 600, received_quantity: 0,
  unit_price: 2.50, po_status: 'FUTURE_DELIVERY',
  test_scenarios: ['TC-OV-03']
});
addItem({
  po_number: '4500002005', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-07-15', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 0.15, po_status: 'FUTURE_DELIVERY'
});

// PO 4500002006 (3 lines) - Missing Acknowledgement
addItem({
  po_number: '4500002006', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'MISSING_ACKNOWLEDGEMENT', risk_category: 'MEDIUM',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'Acknowledgement required but missing after 14 days',
  test_scenarios: ['TC-AK-01', 'TC-EM-04']
});
addItem({
  po_number: '4500002006', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-25', ordered_quantity: 200, received_quantity: 0,
  unit_price: 2.50, po_status: 'MISSING_ACKNOWLEDGEMENT', risk_category: 'LOW',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'Acknowledgement required but missing after 14 days',
  test_scenarios: ['TC-AK-01']
});
addItem({
  po_number: '4500002006', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 0.15, po_status: 'MISSING_ACKNOWLEDGEMENT', risk_category: 'LOW',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'Acknowledgement required but missing after 14 days',
  test_scenarios: ['TC-AK-01']
});

// PO 4500002007 (1 line) - Late Acknowledgement (Historical)
addItem({
  po_number: '4500002007',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-12', ordered_quantity: 200, received_quantity: 0,
  unit_price: 15.00, po_status: 'LATE_ACKNOWLEDGEMENT',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-05-20',
  test_scenarios: ['TC-AK-04']
});

// PO 4500002008 (2 lines) - Overdue, Reminder Already Sent (Rate-limited)
addItem({
  po_number: '4500002008', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-02', ordered_quantity: 400, received_quantity: 0,
  unit_price: 15.00, po_status: 'REMINDER_SENT', risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  last_reminder_date: '2026-06-04', reminder_count: 1,
  exception_reason: 'Overdue and reminder already sent once',
  test_scenarios: ['TC-OV-10', 'TC-EM-03']
});
addItem({
  po_number: '4500002008', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-02', ordered_quantity: 800, received_quantity: 0,
  unit_price: 2.50, po_status: 'REMINDER_SENT', risk_category: 'MEDIUM',
  last_reminder_date: '2026-06-04', reminder_count: 1,
  exception_reason: 'Overdue and reminder already sent once',
  test_scenarios: ['TC-EM-03']
});

// PO 4500002009 (1 line) - Overdue, Reminder Eligible
addItem({
  po_number: '4500002009',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-08', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'REMINDER_ELIGIBLE', risk_category: 'MEDIUM',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'Overdue PO line eligible for supplier email reminder',
  test_scenarios: ['TC-OV-10', 'TC-EM-01']
});

// PO 4500002010 (5 lines) - High Value Missing Acknowledgement
addItem({
  po_number: '4500002010', item_number: '00010',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 5000, received_quantity: 0,
  unit_price: 25.00, po_status: 'HIGH_VALUE_MISSING_ACK', risk_category: 'CRITICAL',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'High-value open order (>50K USD) missing acknowledgement',
  test_scenarios: ['TC-AK-05', 'TC-EM-07', 'TC-EM-08', 'TC-EM-09', 'TC-EM-10', 'TC-EM-11']
});
addItem({
  po_number: '4500002010', item_number: '00020',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 2000, received_quantity: 0,
  unit_price: 25.00, po_status: 'HIGH_VALUE_MISSING_ACK', risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'High-value open order missing acknowledgement',
  test_scenarios: ['TC-AK-05']
});
addItem({
  po_number: '4500002010', item_number: '00030',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 25.00, po_status: 'HIGH_VALUE_MISSING_ACK', risk_category: 'MEDIUM',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'High-value open order missing acknowledgement',
  test_scenarios: ['TC-AK-05']
});


// PO 4500002011 (3 lines) - Low Value Fully Open PO
addItem({
  po_number: '4500002011', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 0.15, po_status: 'OPEN', acknowledgement_required: 'N',
  test_scenarios: ['TC-AK-03']
});
addItem({
  po_number: '4500002011', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 500, received_quantity: 0,
  unit_price: 0.15, po_status: 'OPEN', acknowledgement_required: 'N',
  test_scenarios: ['TC-AK-03']
});
addItem({
  po_number: '4500002011', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 200, received_quantity: 0,
  unit_price: 0.15, po_status: 'OPEN', acknowledgement_required: 'N'
});

// PO 4500002012 (3 lines) - Invoice Blocked (Price Variance)
addItem({
  po_number: '4500002012', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-10', ordered_quantity: 500, received_quantity: 500, invoiced_quantity: 500,
  unit_price: 15.00, po_status: 'INVOICE_BLOCKED', gr_status: 'COMPLETED', invoice_status: 'INVOICED_BLOCKED',
  invoice_blocked_flag: 'Y', price_variance: 1250.00, risk_category: 'MEDIUM',
  exception_reason: 'Invoice price variance detected; blocked in AP',
  test_scenarios: ['TC-OP-09', 'TC-OV-07', 'TC-IV-04', 'TC-IV-07']
});
addItem({
  po_number: '4500002012', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-05-10', ordered_quantity: 1000, received_quantity: 1000, invoiced_quantity: 1000,
  unit_price: 2.50, po_status: 'INVOICE_BLOCKED', gr_status: 'COMPLETED', invoice_status: 'INVOICED_BLOCKED',
  invoice_blocked_flag: 'Y', price_variance: 250.00, risk_category: 'MEDIUM',
  exception_reason: 'Invoice price variance detected; blocked in AP',
  test_scenarios: ['TC-IV-04']
});
addItem({
  po_number: '4500002012', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-05-10', ordered_quantity: 500, received_quantity: 500, invoiced_quantity: 500,
  unit_price: 0.15, po_status: 'INVOICE_BLOCKED', gr_status: 'COMPLETED', invoice_status: 'INVOICED_BLOCKED',
  invoice_blocked_flag: 'Y', price_variance: 15.00, risk_category: 'LOW',
  exception_reason: 'Invoice price variance detected; blocked in AP'
});

// PO 4500002013 (1 line) - GR Done but Invoice Missing
addItem({
  po_number: '4500002013',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-01', ordered_quantity: 250, received_quantity: 250, invoiced_quantity: 0,
  unit_price: 15.00, po_status: 'GR_DONE_INVOICE_MISSING', gr_status: 'COMPLETED', invoice_status: 'PENDING',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-05-03',
  exception_reason: 'Goods received fully but invoice is missing',
  test_scenarios: ['TC-IV-05']
});

// PO 4500002014 (1 line) - Invoice Received Before GR
addItem({
  po_number: '4500002014',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-06-30', ordered_quantity: 1000, received_quantity: 0, invoiced_quantity: 1000,
  unit_price: 25.00, po_status: 'INVOICE_BEFORE_GR', invoice_status: 'INVOICED',
  invoice_blocked_flag: 'Y', quantity_variance: 1000.00, risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-05-18',
  exception_reason: 'Invoice received before Goods Receipt (GR/IR mismatch)',
  test_scenarios: ['TC-IV-06', 'TC-IV-08']
});

// PO 4500002015 (1 line) - Deleted / Cancelled PO Line
addItem({
  po_number: '4500002015',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DELETED', deletion_completion_indicator: 'DELETED',
  gr_status: 'CANCELLED', invoice_status: 'CANCELLED', risk_category: 'NONE',
  acknowledgement_required: 'Y',
  exception_reason: 'Line item deleted/cancelled in ERP',
  test_scenarios: ['TC-OP-04', 'TC-OV-05', 'TC-EM-02']
});

// PO 4500002016 (1 line) - Closed PO (Fully Received/Paid)
addItem({
  po_number: '4500002016',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-10', ordered_quantity: 500, received_quantity: 500, invoiced_quantity: 500,
  unit_price: 15.00, po_status: 'CLOSED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED', risk_category: 'NONE',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-04-12',
  exception_reason: 'Closed / Fully received and invoiced',
  test_scenarios: ['TC-OP-05', 'TC-EM-02']
});

// PO 4500002017 (1 line) - Duplicate-Looking PO Line
addItem({
  po_number: '4500002017',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN', acknowledgement_required: 'Y',
  exception_reason: 'Potential duplicate order of PO 4500002001',
  test_scenarios: ['TC-DQ-10']
});

// PO 4500002018 (1 line) - Data Quality: Invalid Delivery Date Value
addItem({
  po_number: '4500002018',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: 'INVALID_DATE', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'HIGH',
  acknowledgement_required: 'Y', exception_reason: 'Invalid delivery date value \'INVALID_DATE\'',
  data_quality_flag: 'Y',
  test_scenarios: ['TC-OV-10', 'TC-DQ-01', 'TC-DQ-07']
});

// PO 4500002019 (4 lines) - Service PO (EUR Currency)
addItem({
  po_number: '4500002019', item_number: '00010',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP Implementation Consulting Services',
  delivery_date: '2026-06-30', ordered_quantity: 1, received_quantity: 0,
  unit_price: 75000.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N',
  test_scenarios: ['TC-OP-07', 'TC-IV-09']
});
addItem({
  po_number: '4500002019', item_number: '00020',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP implementation Support Services',
  delivery_date: '2026-06-30', ordered_quantity: 10, received_quantity: 0,
  unit_price: 1500.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N',
  test_scenarios: ['TC-OP-07']
});
addItem({
  po_number: '4500002019', item_number: '00030',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP implementation Training Services',
  delivery_date: '2026-06-30', ordered_quantity: 5, received_quantity: 0,
  unit_price: 800.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N'
});
addItem({
  po_number: '4500002019', item_number: '00040',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP implementation Post-Go-Live Services',
  delivery_date: '2026-06-30', ordered_quantity: 10, received_quantity: 0,
  unit_price: 1000.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N'
});

// PO 4500002020 (1 line) - Overdue Service PO (EUR)
addItem({
  po_number: '4500002020',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'System Upgrade Integration Test Services',
  delivery_date: '2026-05-15', ordered_quantity: 1, received_quantity: 0,
  unit_price: 45000.00, currency: 'EUR', po_status: 'OVERDUE_SERVICE', risk_category: 'HIGH',
  acknowledgement_required: 'N', last_reminder_date: '2026-05-18', reminder_count: 1,
  exception_reason: 'Overdue service line (>45k EUR)',
  test_scenarios: ['TC-OV-10', 'TC-IV-09']
});

// PO 4500002021 (5 lines) - Multi-Line PO (Clean open check)
addItem({
  po_number: '4500002021', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 150, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN', acknowledgement_required: 'Y',
  exception_reason: 'Multi-line PO - Line 10',
  test_scenarios: ['TC-OP-01']
});
addItem({
  po_number: '4500002021', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL02', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 5000, received_quantity: 0,
  unit_price: 0.15, po_status: 'OPEN', acknowledgement_required: 'N',
  exception_reason: 'Multi-line PO - Line 20',
  test_scenarios: ['TC-OP-01']
});
addItem({
  po_number: '4500002021', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-25', ordered_quantity: 300, received_quantity: 0,
  unit_price: 2.50, po_status: 'OPEN', acknowledgement_required: 'N',
  test_scenarios: ['TC-OP-01']
});
addItem({
  po_number: '4500002021', item_number: '00040',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-06-25', ordered_quantity: 2000, received_quantity: 0,
  unit_price: 0.15, po_status: 'OPEN', acknowledgement_required: 'N',
  test_scenarios: ['TC-OP-01']
});


// PO 4500002022 (4 lines) - Overdue + High Value
addItem({
  po_number: '4500002022', item_number: '00010',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-05-15', ordered_quantity: 3000, received_quantity: 0,
  unit_price: 25.00, po_status: 'OVERDUE', risk_category: 'CRITICAL',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-04-12',
  exception_reason: 'Overdue open quantity and high line value (>50k USD)',
  test_scenarios: ['TC-OV-10']
});
addItem({
  po_number: '4500002022', item_number: '00020',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-05-15', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 25.00, po_status: 'OVERDUE', risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-05-20',
  exception_reason: 'Overdue open quantity',
  test_scenarios: ['TC-OV-10']
});
addItem({
  po_number: '4500002022', item_number: '00030',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-05-15', ordered_quantity: 500, received_quantity: 0,
  unit_price: 25.00, po_status: 'OVERDUE', risk_category: 'MEDIUM',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-04-12',
  exception_reason: 'Overdue open quantity'
});
addItem({
  po_number: '4500002022', item_number: '00040',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-05-15', ordered_quantity: 200, received_quantity: 0,
  unit_price: 25.00, po_status: 'OVERDUE', risk_category: 'LOW',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-04-12',
  exception_reason: 'Overdue open quantity'
});

// PO 4500002023 (1 line) - Overdue + Missing Acknowledgement
addItem({
  po_number: '4500002023',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-20', ordered_quantity: 200, received_quantity: 0,
  unit_price: 15.00, po_status: 'OVERDUE_MISSING_ACK', risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: null,
  exception_reason: 'Overdue PO line with missing supplier acknowledgement',
  test_scenarios: ['TC-OV-10', 'TC-AK-06']
});

// PO 4500002024 (1 line) - Overdue + No Goods Receipt
addItem({
  po_number: '4500002024',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-01', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OVERDUE_NO_GR', risk_category: 'MEDIUM',
  exception_reason: 'Delivery date passed and no Goods Receipt (GR) entered',
  test_scenarios: ['TC-OV-10', 'TC-GR-06']
});

// PO 4500002025 (1 line) - Invoice Blocked + High Value
addItem({
  po_number: '4500002025',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'Cloud Migration System Analysis',
  delivery_date: '2026-04-30', ordered_quantity: 1, received_quantity: 1, invoiced_quantity: 1,
  unit_price: 60000.00, currency: 'EUR', po_status: 'INVOICE_BLOCKED_HIGH_VALUE',
  gr_status: 'COMPLETED', invoice_status: 'INVOICED_BLOCKED', invoice_blocked_flag: 'Y',
  price_variance: 5000.00, risk_category: 'HIGH',
  exception_reason: 'High-value invoice blocked (>50k EUR) due to price discrepancy',
  test_scenarios: ['TC-IV-10']
});

// PO 4500002026 (3 lines) - Repeated Supplier Delay
addItem({
  po_number: '4500002026', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-15', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OVERDUE', risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-04-18',
  last_reminder_date: '2026-05-20', reminder_count: 3,
  exception_reason: 'Repeated supplier delay (>25 days overdue and 3 reminders sent)',
  test_scenarios: ['TC-OV-10']
});
addItem({
  po_number: '4500002026', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-05-15', ordered_quantity: 200, received_quantity: 0,
  unit_price: 2.50, po_status: 'OVERDUE', risk_category: 'MEDIUM',
  last_reminder_date: '2026-05-20', reminder_count: 3,
  exception_reason: 'Repeated supplier delay',
  test_scenarios: ['TC-OV-10']
});
addItem({
  po_number: '4500002026', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Resistor Pack 10k',
  delivery_date: '2026-05-15', ordered_quantity: 1000, received_quantity: 0,
  unit_price: 0.15, po_status: 'OVERDUE', risk_category: 'LOW',
  last_reminder_date: '2026-05-20', reminder_count: 3,
  exception_reason: 'Repeated supplier delay'
});

// PO 4500002027 (1 line) - Cancelled PO with Open Quantity
addItem({
  po_number: '4500002027',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-01', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DELETED', deletion_completion_indicator: 'DELETED',
  gr_status: 'CANCELLED', invoice_status: 'CANCELLED', risk_category: 'NONE',
  acknowledgement_required: 'Y', exception_reason: 'Cancelled line item should be excluded from active risk tracking',
  test_scenarios: ['TC-OP-06', 'TC-OV-05', 'TC-DQ-14']
});

// PO 4500002028 (1 line) - Over-Received PO Line
addItem({
  po_number: '4500002028',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-30', ordered_quantity: 100, received_quantity: 120, invoiced_quantity: 120,
  unit_price: 15.00, po_status: 'OVER_RECEIVED', gr_status: 'COMPLETED', invoice_status: 'COMPLETED',
  invoice_blocked_flag: 'Y', quantity_variance: -20.00, risk_category: 'HIGH',
  acknowledgement_required: 'Y', acknowledgement_date: '2026-05-03',
  exception_reason: 'Received quantity (120) is greater than ordered quantity (100)',
  test_scenarios: ['TC-GR-04', 'TC-GR-07', 'TC-DQ-09', 'TC-DQ-15']
});

// PO 4500002029 (1 line) - Invalid / Negative Qty PO
addItem({
  po_number: '4500002029',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-10', ordered_quantity: -50, received_quantity: 0,
  unit_price: 15.00, po_status: 'INVALID_QUANTITY', risk_category: 'HIGH',
  acknowledgement_required: 'Y', exception_reason: 'Ordered quantity has negative value (-50)',
  data_quality_flag: 'Y',
  test_scenarios: ['TC-OP-10', 'TC-DQ-08']
});

// PO 4500002030 (1 line) - Data Quality: Missing Supplier ID
addItem({
  po_number: '4500002030',
  supplier: null, buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-10', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'MISSING_SUPPLIER_MASTER', risk_category: 'CRITICAL',
  acknowledgement_required: 'Y', exception_reason: 'Supplier vendor ID is missing / null in purchase order item',
  data_quality_flag: 'Y',
  test_scenarios: ['TC-DQ-02']
});

// PO 4500002031 (3 lines) - Fully open service PO
addItem({
  po_number: '4500002031', item_number: '00010',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP Implementation Consulting Services',
  delivery_date: '2026-06-25', ordered_quantity: 1, received_quantity: 0,
  unit_price: 60000.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N'
});
addItem({
  po_number: '4500002031', item_number: '00020',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP implementation Support Services',
  delivery_date: '2026-06-25', ordered_quantity: 5, received_quantity: 0,
  unit_price: 1200.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N'
});
addItem({
  po_number: '4500002031', item_number: '00030',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'ERP implementation Training Services',
  delivery_date: '2026-06-25', ordered_quantity: 5, received_quantity: 0,
  unit_price: 800.00, currency: 'EUR', po_status: 'SERVICE_PO_OPEN',
  acknowledgement_required: 'N'
});

// PO 4500002032 (1 line) - Partially received service PO
addItem({
  po_number: '4500002032',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'EU01', purchasing_organization: 'PO02',
  material_service_description: 'Cloud Migration System Analysis',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 40, invoiced_quantity: 40,
  unit_price: 500.00, currency: 'EUR', po_status: 'PARTIALLY_RECEIVED',
  gr_status: 'PARTIAL', invoice_status: 'PARTIAL', acknowledgement_required: 'N'
});

// PO 4500002033 (1 line) - Open quantity exactly 1
addItem({
  po_number: '4500002033',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-15', ordered_quantity: 1, received_quantity: 0,
  unit_price: 1500.00, po_status: 'OPEN'
});

// PO 4500002034 (4 lines) - Very large open quantity
addItem({
  po_number: '4500002034', item_number: '00010',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 100000, received_quantity: 0,
  unit_price: 5.00, po_status: 'OPEN'
});
addItem({
  po_number: '4500002034', item_number: '00020',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 50000, received_quantity: 0,
  unit_price: 5.00, po_status: 'OPEN'
});
addItem({
  po_number: '4500002034', item_number: '00030',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 20000, received_quantity: 0,
  unit_price: 5.00, po_status: 'OPEN'
});
addItem({
  po_number: '4500002034', item_number: '00040',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-07-20', ordered_quantity: 10000, received_quantity: 0,
  unit_price: 5.00, po_status: 'OPEN'
});

// PO 4500002035 (1 line) - Overdue 1-7 days (5 days overdue)
addItem({
  po_number: '4500002035',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-05', ordered_quantity: 100, received_quantity: 0,
  unit_price: 10.00, po_status: 'OVERDUE', risk_category: 'MEDIUM',
  exception_reason: 'Overdue open quantity by 5 days',
  test_scenarios: ['TC-OV-10']
});

// PO 4500002036 (1 line) - Overdue 8-15 days (11 days overdue)
addItem({
  po_number: '4500002036',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-30', ordered_quantity: 150, received_quantity: 0,
  unit_price: 12.00, po_status: 'OVERDUE', risk_category: 'HIGH',
  exception_reason: 'Overdue open quantity by 11 days',
  test_scenarios: ['TC-OV-10']
});

// PO 4500002037 (1 line) - Overdue 16-30 days (21 days overdue)
addItem({
  po_number: '4500002037',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Michael Lead (BUY-04)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-05-20', ordered_quantity: 200, received_quantity: 0,
  unit_price: 20.00, po_status: 'OVERDUE', risk_category: 'HIGH',
  exception_reason: 'Overdue open quantity by 21 days',
  test_scenarios: ['TC-OV-10']
});

// PO 4500002038 (1 line) - Overdue 30+ days (40 days overdue)
addItem({
  po_number: '4500002038',
  supplier: 'Global Foundry (VEND-002)', buyer: 'Michael Lead (BUY-04)',
  plant: 'PL02', material_service_description: 'ASIC Transceiver Chip',
  delivery_date: '2026-05-01', ordered_quantity: 300, received_quantity: 0,
  unit_price: 22.00, po_status: 'OVERDUE', risk_category: 'CRITICAL',
  exception_reason: 'Overdue open quantity by 40 days',
  acknowledgement_required: 'Y',
  test_scenarios: ['TC-OV-10']
});

// PO 4500002039 (1 line) - Data Quality: Missing delivery date
addItem({
  po_number: '4500002039',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: null, ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Missing delivery date value',
  data_quality_flag: 'Y',
  test_scenarios: ['TC-DQ-04']
});

// PO 4500002040 (3 lines) - GR before delivery date (Clean)
addItem({
  po_number: '4500002040', item_number: '00010',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-15', ordered_quantity: 500, received_quantity: 500, invoiced_quantity: 500,
  unit_price: 8.00, po_status: 'FULLY_RECEIVED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED',
  test_scenarios: ['TC-GR-05']
});
addItem({
  po_number: '4500002040', item_number: '00020',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-15', ordered_quantity: 200, received_quantity: 200, invoiced_quantity: 200,
  unit_price: 8.00, po_status: 'FULLY_RECEIVED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED'
});
addItem({
  po_number: '4500002040', item_number: '00030',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-15', ordered_quantity: 100, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 8.00, po_status: 'FULLY_RECEIVED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED'
});

// PO 4500002041 (1 line) - GR after delivery date
addItem({
  po_number: '4500002041',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-05-25', ordered_quantity: 500, received_quantity: 500, invoiced_quantity: 500,
  unit_price: 8.00, po_status: 'FULLY_RECEIVED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED',
  test_scenarios: ['TC-GR-05']
});

// PO 4500002042 (1 line) - Data Quality: Received quantity missing/null
addItem({
  po_number: '4500002042',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-25', ordered_quantity: 200, received_quantity: null,
  unit_price: 10.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Received quantity is missing/null',
  data_quality_flag: 'Y',
  test_scenarios: ['TC-DQ-06']
});

// PO 4500002043 (1 line) - Data Quality: Ordered quantity zero
addItem({
  po_number: '4500002043',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-25', ordered_quantity: 0, received_quantity: 0,
  unit_price: 10.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'LOW',
  exception_reason: 'Ordered quantity is zero',
  data_quality_flag: 'Y'
});

// PO 4500002044 (2 lines) - GR done but invoice missing (Clean)
addItem({
  po_number: '4500002044', item_number: '00010',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-01', ordered_quantity: 100, received_quantity: 100, invoiced_quantity: 0,
  unit_price: 10.00, po_status: 'GR_DONE_INVOICE_MISSING', gr_status: 'COMPLETED', invoice_status: 'PENDING',
  exception_reason: 'Goods received fully but invoice is missing',
  test_scenarios: ['TC-IV-05']
});
addItem({
  po_number: '4500002044', item_number: '00020',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-01', ordered_quantity: 200, received_quantity: 200, invoiced_quantity: 0,
  unit_price: 10.00, po_status: 'GR_DONE_INVOICE_MISSING', gr_status: 'COMPLETED', invoice_status: 'PENDING',
  exception_reason: 'Goods received fully but invoice is missing'
});

// PO 4500002045 (1 line) - Invoice value greater than PO value (Price variance)
addItem({
  po_number: '4500002045',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-01', ordered_quantity: 100, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 10.00, po_status: 'INVOICE_BLOCKED', gr_status: 'COMPLETED', invoice_status: 'INVOICED_BLOCKED',
  invoice_blocked_flag: 'Y', price_variance: 500.00,
  exception_reason: 'Invoice value exceeds PO value',
  test_scenarios: ['TC-IV-10']
});

// PO 4500002046 (1 line) - Invoice quantity greater than received quantity
addItem({
  po_number: '4500002046',
  supplier: 'Apex Components (VEND-004)', buyer: 'John Senior (BUY-03)',
  plant: 'PL01', material_service_description: 'PCB Board Double Sided',
  delivery_date: '2026-06-01', ordered_quantity: 100, received_quantity: 50, invoiced_quantity: 100,
  unit_price: 10.00, po_status: 'INVOICE_BLOCKED', gr_status: 'PARTIAL', invoice_status: 'INVOICED_BLOCKED',
  invoice_blocked_flag: 'Y', quantity_variance: -50.00,
  exception_reason: 'Invoiced quantity (100) exceeds received quantity (50)',
  test_scenarios: ['TC-IV-08']
});

// PO 4500002047 (1 line) - Data Quality: Invoice currency mismatch
addItem({
  po_number: '4500002047',
  supplier: 'Consulting Group (VEND-003)', buyer: 'Sarah Planner (BUY-02)',
  plant: 'PL03', company_code: 'US01', purchasing_organization: 'PO01',
  material_service_description: 'Cloud Migration System Analysis',
  delivery_date: '2026-06-25', ordered_quantity: 10, received_quantity: 0,
  unit_price: 1000.00, currency: 'EUR', po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'PO currency (EUR) differs from company code currency (USD)',
  data_quality_flag: 'Y',
  test_scenarios: ['TC-IV-09']
});

// PO 4500002048 (1 line) - Clean invoice with no exception
addItem({
  po_number: '4500002048',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-10', ordered_quantity: 100, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 15.00, po_status: 'CLOSED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED',
  test_scenarios: ['TC-IV-08']
});

// PO 4500002049 (1 line) - Acknowledgement required and received on time
addItem({
  po_number: '4500002049',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN', acknowledgement_required: 'Y', acknowledgement_date: '2026-05-12',
  test_scenarios: ['TC-AK-02']
});

// PO 4500002050 (1 line) - Acknowledgement received after reminder
addItem({
  po_number: '4500002050',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN', acknowledgement_required: 'Y', acknowledgement_date: '2026-06-06',
  last_reminder_date: '2026-06-04', reminder_count: 1
});

// PO 4500002051 (1 line) - Data Quality: Missing supplier contact email
addItem({
  po_number: '4500002051',
  supplier: 'Nova Systems (VEND-005)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Supplier email address is missing',
  data_quality_flag: 'Y'
});

// PO 4500002052 (1 line) - Data Quality: Invalid supplier email
addItem({
  po_number: '4500002052',
  supplier: 'Vector Logistics (VEND-006)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Supplier email address has invalid format',
  data_quality_flag: 'Y'
});

// PO 4500002053 (1 line) - Reminder not eligible: PO is deleted
addItem({
  po_number: '4500002053',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DELETED', deletion_completion_indicator: 'DELETED',
  gr_status: 'CANCELLED', invoice_status: 'CANCELLED',
  test_scenarios: ['TC-EM-02']
});

// PO 4500002054 (1 line) - Reminder not eligible: PO is completed
addItem({
  po_number: '4500002054',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-10', ordered_quantity: 100, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 15.00, po_status: 'CLOSED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED',
  test_scenarios: ['TC-EM-02']
});

// PO 4500002055 (1 line) - Reminder eligible: last reminder older than rate limit (sent 10 days ago)
addItem({
  po_number: '4500002055',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-02', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'REMINDER_SENT', risk_category: 'MEDIUM',
  last_reminder_date: '2026-05-30', reminder_count: 1,
  exception_reason: 'Overdue open quantity'
});

// PO 4500002056 (4 lines) - Multi-line PO with different statuses
addItem({
  po_number: '4500002056', item_number: '00010',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN'
});
addItem({
  po_number: '4500002056', item_number: '00020',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-05-10', ordered_quantity: 100, received_quantity: 100, invoiced_quantity: 100,
  unit_price: 15.00, po_status: 'CLOSED', deletion_completion_indicator: 'COMPLETED',
  gr_status: 'COMPLETED', invoice_status: 'COMPLETED'
});
addItem({
  po_number: '4500002056', item_number: '00030',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DELETED', deletion_completion_indicator: 'DELETED'
});
addItem({
  po_number: '4500002056', item_number: '00040',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 50, received_quantity: 0,
  unit_price: 15.00, po_status: 'OPEN'
});

// PO 4500002057 (1 line) - Data Quality: Missing buyer ID
addItem({
  po_number: '4500002057',
  supplier: 'Sterling Electronics (VEND-001)', buyer: null,
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Buyer ID is missing',
  data_quality_flag: 'Y'
});

// PO 4500002058 (1 line) - Data Quality: Missing plant code
addItem({
  po_number: '4500002058',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: null, material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Plant code is missing',
  data_quality_flag: 'Y'
});

// PO 4500002059 (1 line) - Data Quality: Missing unit price
addItem({
  po_number: '4500002059',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: null, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Unit price is missing/null',
  data_quality_flag: 'Y'
});

// PO 4500002060 (1 line) - Data Quality: Currency missing
addItem({
  po_number: '4500002060',
  supplier: 'Sterling Electronics (VEND-001)', buyer: 'Alex Buyer (BUY-01)',
  plant: 'PL01', material_service_description: 'Microprocessor Core v1',
  delivery_date: '2026-06-25', ordered_quantity: 100, received_quantity: 0,
  unit_price: 15.00, currency: null, po_status: 'DATA_QUALITY_ISSUE', risk_category: 'MEDIUM',
  exception_reason: 'Currency is missing/null',
  data_quality_flag: 'Y'
});


// Convert flat items list into hierarchical PO structure
const posMap = new Map();

items.forEach(item => {
  if (!posMap.has(item.po_number)) {
    posMap.set(item.po_number, {
      po_number: item.po_number,
      supplier: item.supplier,
      buyer: item.buyer,
      company_code: item.company_code,
      purchasing_organization: item.purchasing_organization,
      po_creation_date: item.po_creation_date,
      currency: item.currency,
      items: []
    });
  }
  
  const po = posMap.get(item.po_number);
  
  // Custom scenario handling for explicit test cases
  
  // 1. PO 4500002002 item 00030 (Multi schedule lines)
  if (item.po_number === '4500002002' && item.item_number === '00030') {
    // We will merge item 00040 into this item
    const flatItem00040 = items.find(i => i.po_number === '4500002002' && i.item_number === '00040');
    
    po.items.push({
      item_number: item.item_number,
      material_service_description: item.material_service_description,
      plant: item.plant,
      unit_price: item.unit_price,
      po_status: item.po_status,
      invoiced_quantity: item.invoiced_quantity,
      deletion_completion_indicator: item.deletion_completion_indicator,
      gr_status: item.gr_status,
      invoice_status: item.invoice_status,
      invoice_blocked_flag: item.invoice_blocked_flag,
      price_variance: item.price_variance,
      quantity_variance: item.quantity_variance,
      risk_category: item.risk_category,
      exception_reason: item.exception_reason,
      data_quality_flag: item.data_quality_flag,
      test_scenarios: [...item.test_scenarios, ...(flatItem00040 ? flatItem00040.test_scenarios : [])],
      schedule_lines: [
        {
          schedule_line: '0001',
          delivery_date: item.delivery_date,
          scheduled_qty: item.ordered_quantity,
          acknowledgement_required: item.acknowledgement_required,
          last_reminder_date: item.last_reminder_date,
          reminder_count: item.reminder_count,
          acknowledgements: [],
          goods_receipts: [
            {
              posting_date: item.delivery_date,
              qty: item.received_quantity
            }
          ]
        },
        {
          schedule_line: '0002',
          delivery_date: flatItem00040 ? flatItem00040.delivery_date : item.delivery_date,
          scheduled_qty: flatItem00040 ? flatItem00040.ordered_quantity : 500,
          acknowledgement_required: flatItem00040 ? flatItem00040.acknowledgement_required : 'N',
          last_reminder_date: flatItem00040 ? flatItem00040.last_reminder_date : null,
          reminder_count: flatItem00040 ? flatItem00040.reminder_count : 0,
          acknowledgements: [],
          goods_receipts: flatItem00040 && flatItem00040.received_quantity > 0 ? [
            {
              posting_date: flatItem00040.delivery_date,
              qty: flatItem00040.received_quantity
            }
          ] : []
        }
      ]
    });
    return;
  }
  
  // Skip item 00040 since it's merged into 00030
  if (item.po_number === '4500002002' && item.item_number === '00040') {
    return;
  }
  
  // 2. PO 4500002002 item 00010 (Multi-GR and Partial Acknowledgement / Quantity Dispute)
  if (item.po_number === '4500002002' && item.item_number === '00010') {
    po.items.push({
      item_number: item.item_number,
      material_service_description: item.material_service_description,
      plant: item.plant,
      unit_price: item.unit_price,
      po_status: item.po_status,
      invoiced_quantity: item.invoiced_quantity,
      deletion_completion_indicator: item.deletion_completion_indicator,
      gr_status: item.gr_status,
      invoice_status: item.invoice_status,
      invoice_blocked_flag: item.invoice_blocked_flag,
      price_variance: item.price_variance,
      quantity_variance: item.quantity_variance,
      risk_category: item.risk_category,
      exception_reason: item.exception_reason,
      data_quality_flag: item.data_quality_flag,
      test_scenarios: item.test_scenarios,
      schedule_lines: [
        {
          schedule_line: '0001',
          delivery_date: item.delivery_date,
          scheduled_qty: item.ordered_quantity,
          acknowledgement_required: item.acknowledgement_required,
          last_reminder_date: item.last_reminder_date,
          reminder_count: item.reminder_count,
          acknowledgements: [
            {
              confirmed_qty: 150, // Partial acknowledgement (150 vs 200 scheduled) -> Quantity dispute
              confirmed_date: item.acknowledgement_date || '2026-05-12',
              response_source: 'EMAIL'
            }
          ],
          goods_receipts: [
            {
              posting_date: '2026-06-10',
              qty: 50,
              material_doc: `5000${item.po_number.substring(4)}`
            },
            {
              posting_date: '2026-06-20',
              qty: 30,
              material_doc: `5001${item.po_number.substring(4)}`
            }
          ]
        }
      ]
    });
    return;
  }
  
  // 3. PO 4500002007 item 00010 (Date Dispute)
  if (item.po_number === '4500002007' && item.item_number === '00010') {
    po.items.push({
      item_number: item.item_number,
      material_service_description: item.material_service_description,
      plant: item.plant,
      unit_price: item.unit_price,
      po_status: item.po_status,
      invoiced_quantity: item.invoiced_quantity,
      deletion_completion_indicator: item.deletion_completion_indicator,
      gr_status: item.gr_status,
      invoice_status: item.invoice_status,
      invoice_blocked_flag: item.invoice_blocked_flag,
      price_variance: item.price_variance,
      quantity_variance: item.quantity_variance,
      risk_category: item.risk_category,
      exception_reason: item.exception_reason,
      data_quality_flag: item.data_quality_flag,
      test_scenarios: item.test_scenarios,
      schedule_lines: [
        {
          schedule_line: '0001',
          delivery_date: item.delivery_date, // '2026-06-12'
          scheduled_qty: item.ordered_quantity,
          acknowledgement_required: item.acknowledgement_required,
          last_reminder_date: item.last_reminder_date,
          reminder_count: item.reminder_count,
          acknowledgements: [
            {
              confirmed_qty: item.ordered_quantity,
              confirmed_date: '2026-06-15', // Confirmed date after delivery date -> Date dispute
              response_source: 'EMAIL'
            }
          ],
          goods_receipts: []
        }
      ]
    });
    return;
  }
  
  // General fallback for all other items
  po.items.push({
    item_number: item.item_number,
    material_service_description: item.material_service_description,
    plant: item.plant,
    unit_price: item.unit_price,
    po_status: item.po_status,
    invoiced_quantity: item.invoiced_quantity,
    deletion_completion_indicator: item.deletion_completion_indicator,
    gr_status: item.gr_status,
    invoice_status: item.invoice_status,
    invoice_blocked_flag: item.invoice_blocked_flag,
    price_variance: item.price_variance,
    quantity_variance: item.quantity_variance,
    risk_category: item.risk_category,
    exception_reason: item.exception_reason,
    data_quality_flag: item.data_quality_flag,
    test_scenarios: item.test_scenarios,
    schedule_lines: [
      {
        schedule_line: '0001',
        delivery_date: item.delivery_date,
        scheduled_qty: item.ordered_quantity,
        acknowledgement_required: item.acknowledgement_required,
        last_reminder_date: item.last_reminder_date,
        reminder_count: item.reminder_count,
        acknowledgements: item.acknowledgement_required === 'Y' && item.acknowledgement_date ? [
          {
            confirmed_qty: item.ordered_quantity,
            confirmed_date: item.acknowledgement_date,
            response_source: 'EMAIL'
          }
        ] : [],
        goods_receipts: item.received_quantity > 0 ? [
          {
            posting_date: item.delivery_date,
            qty: item.received_quantity
          }
        ] : []
      }
    ]
  });
});

// Let's verify counts:
const distinctPos = new Set(items.map(i => i.po_number));
console.log(`Distinct PO count: ${distinctPos.size}`);
console.log(`Line count: ${items.length}`);

if (distinctPos.size === 60 && items.length === 100) {
  console.log('✅ Matches exactly 60 distinct POs and 100 lines!');
} else {
  console.error(`❌ Mismatch: ${distinctPos.size} POs, ${items.length} lines`);
}

const posArray = Array.from(posMap.values());
fs.writeFileSync(targetPath, JSON.stringify(posArray, null, 2), 'utf8');
console.log(`Wrote hierarchical mock PO data (${posArray.length} POs) to ${targetPath}`);

