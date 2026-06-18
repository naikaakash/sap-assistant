const fs = require('fs');
const path = require('path');

const mockPoDataPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\data\\mock-po-data.json';
const targetDocPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\docs\\dashboard-reconciliation-guide.md';

const mockPos = JSON.parse(fs.readFileSync(mockPoDataPath, 'utf8'));

// Reconciled Metrics
const distinctPos = new Set(mockPos.map(i => i.po_number));
const totalPOs = distinctPos.size;
const totalLines = mockPos.length;

let openLinesCount = 0;
let openPOValue = 0;
const openPOItemsList = [];
const openPOExclusions = [];

let overduePOCount = 0;
let overduePOValue = 0;
const overduePOItemsList = [];

let pendingAckCount = 0;
const pendingAckItemsList = [];

let pendingGRCount = 0;
const pendingGRItemsList = [];

let invoiceBlockedCount = 0;
const invoiceBlockedItemsList = [];

let highRiskCount = 0;
const highRiskItemsList = [];

// Segments
const buyerExceptions = {};
const plantExceptions = {};
const supplierExceptions = {};

mockPos.forEach(i => {
  const poNo = i.po_number;
  const itemNo = i.item_number;
  const poKey = `${poNo}-${itemNo}`;
  const openQty = i.open_quantity !== undefined && i.open_quantity !== null ? i.open_quantity : Math.max(0, i.ordered_quantity - (i.received_quantity || 0));
  const openVal = i.open_value !== undefined && i.open_value !== null ? i.open_value : openQty * (i.unit_price || 0);
  const activeOpen = i.deletion_completion_indicator === 'ACTIVE_OPEN';
  const isDeleted = i.deletion_completion_indicator === 'DELETED';
  const isCompleted = i.deletion_completion_indicator === 'COMPLETED';

  // Open Lines
  if (activeOpen && openQty > 0) {
    openLinesCount++;
    openPOValue += openVal;
    openPOItemsList.push(poKey);
  } else {
    openPOExclusions.push(`${poKey} (${isDeleted ? 'Deleted' : isCompleted ? 'Completed' : 'Qty=' + openQty})`);
  }

  // Overdue
  const todayDate = new Date('2026-06-10');
  const delDate = new Date(i.delivery_date);
  const isOverdue = !isNaN(delDate.getTime()) && delDate < todayDate;

  if (isOverdue && openQty > 0 && activeOpen) {
    overduePOCount++;
    overduePOValue += openVal;
    overduePOItemsList.push(poKey);
  }

  // Pending ACK
  if (i.acknowledgement_required === 'Y' && !i.acknowledgement_date && activeOpen) {
    pendingAckCount++;
    pendingAckItemsList.push(poKey);
  }

  // Pending GR
  if (i.gr_status === 'PENDING' && isOverdue && activeOpen) {
    pendingGRCount++;
    pendingGRItemsList.push(poKey);
  }

  // Invoice Blocked
  if (i.invoice_blocked_flag === 'Y') {
    invoiceBlockedCount++;
    invoiceBlockedItemsList.push(poKey);
  }

  // High Risk
  if ((i.risk_category === 'HIGH' || i.risk_category === 'CRITICAL') && activeOpen) {
    highRiskCount++;
    highRiskItemsList.push(poKey);
  }

  // Exceptions count (assigned only for non-clean active items)
  if (i.exception_reason && i.exception_reason.toLowerCase() !== 'none' && activeOpen) {
    const b = i.buyer || 'Unknown Buyer';
    const p = i.plant || 'Unknown Plant';
    const s = i.supplier || 'Unknown Supplier';

    buyerExceptions[b] = (buyerExceptions[b] || 0) + 1;
    plantExceptions[p] = (plantExceptions[p] || 0) + 1;
    supplierExceptions[s] = (supplierExceptions[s] || 0) + 1;
  }
});

const content = `# 📊 Dashboard Reconciliation Guide

This guide describes how to reconcile the core metrics shown on the **Executive Overview Dashboard** against the expanded 60-PO source dataset (\`data/mock-po-data.json\`). It provides formulas, exact filter criteria, and row-by-row lists of inclusions and exclusions.

---

## 📌 Dataset Summary Reference
Our dataset contains **${totalPOs} unique purchase orders** and **${totalLines} individual PO lines**.

*   **Total PO lines in database:** ${totalLines}
*   **Total unique POs in database:** ${totalPOs}

---

## 🧮 KPI Reconciliations

### 1. Total POs Count
*   **Definition:** Count of unique purchase order numbers in the system.
*   **Formula:** \`Count(Distinct(po_number))\` across all rows.
*   **Inclusions:** All rows.
*   **Exclusions:** Duplicate rows with the same \`po_number\` (e.g., multi-line POs count as 1 PO).
*   **Manual Reconciliation:** Distinct count of POs is exactly **${totalPOs}**.
*   **Reconciled Value:** **${totalPOs}**

### 2. Total PO Lines
*   **Definition:** Total count of physical line items in the ERP system.
*   **Formula:** \`Count(po_number + item_number)\`.
*   **Inclusions:** All rows.
*   **Exclusions:** None.
*   **Manual Reconciliation:** Count every item record in the JSON array.
*   **Reconciled Value:** **${totalLines}**

### 3. Open PO Lines Count
*   **Definition:** Count of line items currently active and awaiting full delivery.
*   **Formula:** Count where \`deletion_completion_indicator\` == \`ACTIVE_OPEN\` AND \`open_quantity\` > 0.
*   **Reconciled Value:** **${openLinesCount}**
*   **Inclusions:** ${openPOItemsList.join(', ')}
*   **Exclusions:** ${openPOExclusions.join(', ')}

### 4. Open PO Value (USD Equivalent)
*   **Definition:** Sum of open value for all active open PO lines.
*   **Formula:** \`Sum(open_value)\` where \`deletion_completion_indicator\` == \`ACTIVE_OPEN\` and \`open_quantity\` > 0.
*   **Reconciled Total:** **$${openPOValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }**
*   **Note:** Multi-currency items (e.g., EUR) are converted to USD in frontend queries. For direct JSON field summation, the value is $${openPOValue.toFixed(2)}.

### 5. Overdue PO Count
*   **Definition:** Count of active open PO lines with a delivery date before today (2026-06-10).
*   **Formula:** Count where \`delivery_date\` < \`2026-06-10\` AND \`open_quantity\` > 0 AND \`deletion_completion_indicator\` == \`ACTIVE_OPEN\`.
*   **Reconciled Value:** **${overduePOCount}**
*   **Inclusions:** ${overduePOItemsList.join(', ')}

### 6. Overdue PO Value
*   **Definition:** Financial value of all overdue materials.
*   **Formula:** \`Sum(open_value)\` of all overdue lines identified above.
*   **Reconciled Total:** **$${overduePOValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }**

### 7. Pending Acknowledgement Count
*   **Definition:** Count of open PO lines where supplier confirmation is required but missing.
*   **Formula:** Count where \`acknowledgement_required\` == \`Y\` AND \`acknowledgement_date\` == \`null\` AND \`deletion_completion_indicator\` == \`ACTIVE_OPEN\`.
*   **Reconciled Value:** **${pendingAckCount}**
*   **Inclusions:** ${pendingAckItemsList.join(', ')}

### 8. Pending Goods Receipt Count
*   **Definition:** Count of open PO lines whose delivery date has passed or is today, but no goods receipt has been posted.
*   **Formula:** Count where \`gr_status\` == \`PENDING\` AND \`delivery_date\` <= \`2026-06-10\` AND \`deletion_completion_indicator\` == \`ACTIVE_OPEN\`.
*   **Reconciled Value:** **${pendingGRCount}**
*   **Inclusions:** ${pendingGRItemsList.join(', ')}

### 9. Invoice Blocked Count
*   **Definition:** Count of lines blocked in Accounts Payable due to variances.
*   **Formula:** Count where \`invoice_blocked_flag\` == \`Y\`.
*   **Reconciled Value:** **${invoiceBlockedCount}**
*   **Inclusions:** ${invoiceBlockedItemsList.join(', ')}

### 10. High-Risk PO Count
*   **Definition:** Count of active PO lines identified as \`HIGH\` or \`CRITICAL\` risk.
*   **Formula:** Count where \`risk_category\` IN (\`HIGH\`, \`CRITICAL\`) AND \`deletion_completion_indicator\` == \`ACTIVE_OPEN\`.
*   **Reconciled Value:** **${highRiskCount}**
*   **Inclusions:** ${highRiskItemsList.join(', ')}

### 11. Exception Counts by Segment (Supplier / Plant / Buyer)
*   **Definition:** Number of active exception lines assigned to each segment.
*   **Formula:** Count of active lines where \`exception_reason\` != \`"None"\`.

#### Active Exceptions by Buyer:
${Object.entries(buyerExceptions).map(([b, count]) => `*   **${b}**: ${count} exceptions`).join('\n')}

#### Active Exceptions by Plant:
${Object.entries(plantExceptions).map(([p, count]) => `*   **${p}**: ${count} exceptions`).join('\n')}

#### Active Exceptions by Supplier:
${Object.entries(supplierExceptions).map(([s, count]) => `*   **${s}**: ${count} exceptions`).join('\n')}
`;

fs.writeFileSync(targetDocPath, content, 'utf-8');
console.log(`Successfully generated reconciliation guide at ${targetDocPath}`);
