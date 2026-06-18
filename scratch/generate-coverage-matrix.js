const fs = require('fs');
const path = require('path');

const mockPoDataPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\data\\mock-po-data.json';
const targetDocPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\docs\\po-test-data-coverage-matrix.md';

const mockPos = JSON.parse(fs.readFileSync(mockPoDataPath, 'utf8'));

const scenarioDescriptions = {
  '4500002001': 'Fully Open Material PO, On-Time, Domestic',
  '4500002002': 'Partially Received Material PO',
  '4500002003': 'Fully Received PO (Historical Closed)',
  '4500002004': 'Overdue Open PO Line, High Value',
  '4500002005': 'Future Delivery Date PO',
  '4500002006': 'Missing Acknowledgement',
  '4500002007': 'Late Acknowledgement (Historical)',
  '4500002008': 'Overdue, Reminder Already Sent (Rate-limited)',
  '4500002009': 'Overdue, Reminder Eligible',
  '4500002010': 'High Value Missing Acknowledgement',
  '4500002011': 'Low Value Fully Open PO',
  '4500002012': 'Invoice Blocked (Price Variance)',
  '4500002013': 'GR Done but Invoice Missing',
  '4500002014': 'Invoice Received Before GR',
  '4500002015': 'Deleted / Cancelled PO Line',
  '4500002016': 'Closed PO (Fully Received/Paid)',
  '4500002017': 'Duplicate-Looking PO Line',
  '4500002018': 'Data Quality: Invalid Delivery Date Value',
  '4500002019': 'Service PO (EUR Currency)',
  '4500002020': 'Overdue Service PO (EUR)',
  '4500002021': 'Multi-Line PO (Clean open check)',
  '4500002022': 'Overdue + High Value',
  '4500002023': 'Overdue + Missing Acknowledgement',
  '4500002024': 'Overdue + No Goods Receipt',
  '4500002025': 'Invoice Blocked + High Value',
  '4500002026': 'Repeated Supplier Delay',
  '4500002027': 'Cancelled PO with Open Quantity',
  '4500002028': 'Over-Received PO Line',
  '4500002029': 'Invalid / Negative Qty PO',
  '4500002030': 'Data Quality: Missing Supplier ID',
  '4500002031': 'Fully open service PO',
  '4500002032': 'Partially received service PO',
  '4500002033': 'Open quantity exactly 1',
  '4500002034': 'Very large open quantity',
  '4500002035': 'Overdue 1-7 days (5 days overdue)',
  '4500002036': 'Overdue 8-15 days (11 days overdue)',
  '4500002037': 'Overdue 16-30 days (21 days overdue)',
  '4500002038': 'Overdue 30+ days (40 days overdue)',
  '4500002039': 'Data Quality: Missing delivery date',
  '4500002040': 'GR before delivery date (Clean)',
  '4500002041': 'GR after delivery date',
  '4500002042': 'Data Quality: Received quantity missing/null',
  '4500002043': 'Data Quality: Ordered quantity zero',
  '4500002044': 'GR done but invoice missing (Clean)',
  '4500002045': 'Invoice value greater than PO value (Price variance)',
  '4500002046': 'Invoice quantity greater than received quantity',
  '4500002047': 'Data Quality: Invoice currency mismatch',
  '4500002048': 'Clean invoice with no exception',
  '4500002049': 'Acknowledgement required and received on time',
  '4500002050': 'Acknowledgement received after reminder',
  '4500002051': 'Data Quality: Missing supplier contact email',
  '4500002052': 'Data Quality: Invalid supplier email',
  '4500002053': 'Reminder not eligible: PO is deleted',
  '4500002054': 'Reminder not eligible: PO is completed',
  '4500002055': 'Reminder eligible: last reminder older than rate limit (sent 10 days ago)',
  '4500002056': 'Multi-line PO with different statuses',
  '4500002057': 'Data Quality: Missing buyer ID',
  '4500002058': 'Data Quality: Missing plant code',
  '4500002059': 'Data Quality: Missing unit price',
  '4500002060': 'Data Quality: Currency missing'
};

const uniquePos = new Set();

const rows = mockPos.map(i => {
  const poNo = i.po_number;
  const isFirstLine = !uniquePos.has(poNo);
  uniquePos.add(poNo);

  const openQty = i.open_quantity !== undefined && i.open_quantity !== null ? i.open_quantity : Math.max(0, i.ordered_quantity - (i.received_quantity || 0));
  const activeOpen = i.deletion_completion_indicator === 'ACTIVE_OPEN';
  const isDeleted = i.deletion_completion_indicator === 'DELETED';
  const isCompleted = i.deletion_completion_indicator === 'COMPLETED';

  // 1. Dashboard Impact
  const impacts = [];
  if (isFirstLine) impacts.push('Total POs');
  impacts.push('Total Lines');
  if (activeOpen && openQty > 0) {
    impacts.push('Open PO Lines', 'Open PO Value');
  }
  
  const todayDate = new Date('2026-06-10');
  const delDate = new Date(i.delivery_date);
  const isOverdue = !isNaN(delDate.getTime()) && delDate < todayDate;

  if (isOverdue && openQty > 0 && activeOpen) {
    impacts.push('Overdue POs', 'Overdue PO Value', 'Pending GR');
  }
  if (i.acknowledgement_required === 'Y' && !i.acknowledgement_date && activeOpen) {
    impacts.push('Pending ACK');
  }
  if (i.gr_status === 'PENDING' && isOverdue && activeOpen) {
    if (!impacts.includes('Pending GR')) impacts.push('Pending GR');
  }
  if (i.invoice_blocked_flag === 'Y') {
    impacts.push('Invoice Blocked');
  }
  if ((i.risk_category === 'HIGH' || i.risk_category === 'CRITICAL') && activeOpen) {
    impacts.push('High Risk');
  }

  // 2. Exception
  let exception = 'None';
  if (i.exception_reason && i.exception_reason.toLowerCase() !== 'none') {
    exception = i.exception_reason;
  }
  if (isDeleted) {
    exception = 'ERP Deleted Flag';
  } else if (isCompleted) {
    exception = 'None (Closed)';
  }

  // 3. Reminder Eligible & Reason
  let isRateLimited = false;
  if (i.last_reminder_date) {
    const lastReminder = new Date(i.last_reminder_date);
    const diffDays = (todayDate - lastReminder) / (1000 * 60 * 60 * 24);
    if (diffDays <= 7) {
      isRateLimited = true;
    }
  }

  const hasException = i.exception_reason && i.exception_reason.toLowerCase() !== 'none';
  const isOverduePO = i.po_status === 'OVERDUE' || i.po_status === 'REMINDER_SENT' || i.po_status === 'REMINDER_ELIGIBLE' || i.po_status === 'OVERDUE_MISSING_ACK' || i.po_status === 'OVERDUE_NO_GR';
  const isEligible = hasException && !isDeleted && !isCompleted && isOverduePO && !isRateLimited;

  let reason = 'On track / no action required.';
  if (isDeleted) {
    reason = 'Line is deleted in SAP.';
  } else if (isCompleted) {
    reason = 'Fully received/completed; no open quantity remains.';
  } else if (isRateLimited) {
    reason = `Rate-limited; reminder sent on ${i.last_reminder_date}.`;
  } else if (isEligible) {
    reason = i.last_reminder_date ? `Overdue; previous reminder older than rate limit.` : 'Overdue open quantity; no reminder sent yet.';
  } else if (isOverduePO && !hasException) {
    reason = 'Overdue but no exception flagged.';
  } else if (!isOverduePO && hasException) {
    reason = 'Exception flagged but not overdue reminder eligible (e.g. data quality / invoice block).';
  } else if (i.po_status === 'FUTURE_DELIVERY') {
    reason = 'Delivery date is in the future.';
  }

  const cellPo = isFirstLine ? `**${poNo}**` : poNo;

  return `| ${cellPo} | ${i.item_number} | ${scenarioDescriptions[poNo] || 'Custom Scenario'} | ${impacts.join(', ')} | ${exception} | **${isEligible ? 'Yes' : 'No'}** | ${reason} |`;
});

const fileContent = `# 📊 PO Test Data Coverage Matrix

This matrix maps each Purchase Order (PO) and Line Item in our mock database ([/data/mock-po-data.json](file:///c:/Users/Aalok/Desktop/AI%20Projects/Procurement%203%20Agent%20project/buyer-planner-action-workbench/data/mock-po-data.json)) to the specific test scenario it covers, its expected dashboard impact, exception flags, and email reminder eligibility.

| PO Number | Line No | Scenario Covered | Expected Dashboard Cards Impacted | Expected Exception Flags | Reminder Eligible? | Reason |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
${rows.join('\n')}
`;

fs.writeFileSync(targetDocPath, fileContent, 'utf-8');
console.log(`Successfully generated coverage matrix at ${targetDocPath}`);
