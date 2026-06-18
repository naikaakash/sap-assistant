const fs = require('fs');

const guidePath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\docs\\manual-business-testing-guide.md';
const checklistPath = 'c:\\Users\\Aalok\\Desktop\\AI Projects\\Procurement 3 Agent project\\buyer-planner-action-workbench\\docs\\manual-testing-checklist.md';

let guide = fs.readFileSync(guidePath, 'utf8');
let checklist = fs.readFileSync(checklistPath, 'utf8');

// Guide replacements
guide = guide.replace(/Displays exactly `30`\./g, "Displays exactly `60`.");
guide = guide.replace(/Displayed count is exactly 30\./g, "Displayed count is exactly 60.");
guide = guide.replace(/Displayed count is anything other than 30\./g, "Displayed count is anything other than 60.");

guide = guide.replace(/Displays exactly `31`\./g, "Displays exactly `100`.");
guide = guide.replace(/Count is exactly 31\./g, "Count is exactly 100.");
guide = guide.replace(/Count is not 31\./g, "Count is not 100.");

guide = guide.replace(/Displays exactly `22`\./g, "Displays exactly `76`.");
guide = guide.replace(/Metric matches 22\./g, "Metric matches 76.");
guide = guide.replace(/Sum `open_value` of the 22 active open PO lines\./g, "Sum `open_value` of the 76 active open PO lines.");
guide = guide.replace(/Displays `\$399,050` \(assuming USD\/EUR conversion\)\./g, "Displays `$1,592,110.00`.");

// TC-KPI-05 (Overdue PO Count) - displays 8
// Find "Displays exactly `8`." in TC-KPI-05 (around line 92)
guide = guide.replace(/### TC-KPI-05: Overdue PO Count[\s\S]*?Displays exactly `8`\./g, (m) => m.replace("Displays exactly `8`.", "Displays exactly `23`."));
guide = guide.replace(/### TC-KPI-05: Overdue PO Count[\s\S]*?Count is 8\./g, (m) => m.replace("Count is 8.", "Count is 23."));
guide = guide.replace(/### TC-KPI-05: Overdue PO Count[\s\S]*?delivery_date < `2026-06-10`\./g, (m) => m.replace("delivery_date < `2026-06-10`.", "delivery_date < `2026-06-10` (reconciles to 23 overdue lines)."));

// TC-KPI-06 (Overdue Value)
guide = guide.replace(/Sum `open_value` of the 8 overdue lines\./g, "Sum `open_value` of the 23 overdue lines.");
guide = guide.replace(/Displays `\$152,100`\./g, "Displays `$211,950.00`.");

// TC-KPI-07 (Pending ACK Count)
guide = guide.replace(/### TC-KPI-07: Pending Acknowledgement Count[\s\S]*?Displays exactly `8`\./g, (m) => m.replace("Displays exactly `8`.", "Displays exactly `14`."));
guide = guide.replace(/### TC-KPI-07: Pending Acknowledgement Count[\s\S]*?Count is 8\./g, (m) => m.replace("Count is 8.", "Count is 14."));

// TC-KPI-08 (Pending Goods Receipt Count)
guide = guide.replace(/### TC-KPI-08: Pending Goods Receipt Count[\s\S]*?Displays exactly `8`\./g, (m) => m.replace("Displays exactly `8`.", "Displays exactly `22`."));
guide = guide.replace(/### TC-KPI-08: Pending Goods Receipt Count[\s\S]*?Count is 8\./g, (m) => m.replace("Count is 8.", "Count is 22."));
guide = guide.replace(/### TC-KPI-08: Pending Goods Receipt Count[\s\S]*?Count is not 8\./g, (m) => m.replace("Count is not 8.", "Count is not 22."));

// TC-KPI-09 (Invoice Blocked Count)
guide = guide.replace(/### TC-KPI-09: Invoice Blocked Count[\s\S]*?Displays exactly `4`\./g, (m) => m.replace("Displays exactly `4`.", "Displays exactly `8`."));
guide = guide.replace(/### TC-KPI-09: Invoice Blocked Count[\s\S]*?Count is 4\./g, (m) => m.replace("Count is 4.", "Count is 8."));
guide = guide.replace(/### TC-KPI-09: Invoice Blocked Count[\s\S]*?Count is not 4\./g, (m) => m.replace("Count is not 4.", "Count is not 8."));

// TC-KPI-10 (High Risk PO Count)
guide = guide.replace(/Displays exactly `12`\./g, "Displays exactly `18`.");
guide = guide.replace(/Count is 12\./g, "Count is 18.");

// TC-OV-08 (Verify Alex has 5 overdue lines)
guide = guide.replace(/Shows exactly 5 overdue lines\./g, "Shows exactly 10 overdue lines.");

// TC-DD-01 Drill-down row matches
guide = guide.replace(/Navigates to worklist view containing exactly 22 rows\./g, "Navigates to worklist view containing exactly 76 rows.");
guide = guide.replace(/Count matches 22\./g, "Count matches 76.");
guide = guide.replace(/Verify count returns to maximum value \(e.g\. 22 open PO lines\)\./g, "Verify count returns to maximum value (e.g. 76 open PO lines).");

// Checklist replacements
checklist = checklist.replace(/Verify value matches 30 unique POs/g, "Verify value matches 60 unique POs");
checklist = checklist.replace(/Verify value matches 31 lines/g, "Verify value matches 100 lines");
checklist = checklist.replace(/Verify value matches 22 open lines/g, "Verify value matches 76 open lines");
checklist = checklist.replace(/Verify sum is \$399,050 \/ \$389,450/g, "Verify sum is $1,592,110.00");
checklist = checklist.replace(/Verify count matches 8 past-due open lines/g, "Verify count matches 23 past-due open lines");
checklist = checklist.replace(/Verify sum is \$152,100 \/ \$148,500/g, "Verify sum is $211,950.00");
checklist = checklist.replace(/Verify value matches 8 missing-ack lines/g, "Verify value matches 14 missing-ack lines");
checklist = checklist.replace(/Verify value matches 8 lines/g, "Verify value matches 22 lines");
checklist = checklist.replace(/Verify count matches 4 lines/g, "Verify count matches 8 lines");
checklist = checklist.replace(/Verify count matches 12 active high-risk lines/g, "Verify count matches 18 active high-risk lines");
checklist = checklist.replace(/Verify Alex has 5 overdue lines/g, "Verify Alex has 10 overdue lines");
checklist = checklist.replace(/Verify Plant PL01 has its respective overdue lines/g, "Verify Plant PL01 has 15 overdue lines");

checklist = checklist.replace(/Open PO Lines Card Drill-down count matches table rows \(22 lines\)/g, "Open PO Lines Card Drill-down count matches table rows (76 lines)");
checklist = checklist.replace(/Overdue PO Card Drill-down count matches table rows \(8 lines\)/g, "Overdue PO Card Drill-down count matches table rows (23 lines)");
checklist = checklist.replace(/Pending ACK Card Drill-down count matches table rows \(8 lines\)/g, "Pending ACK Card Drill-down count matches table rows (14 lines)");
checklist = checklist.replace(/Pending GR Card Drill-down count matches table rows \(8 lines\)/g, "Pending GR Card Drill-down count matches table rows (22 lines)");
checklist = checklist.replace(/Invoice Blocked Card Drill-down count matches table rows \(4 lines\)/g, "Invoice Blocked Card Drill-down count matches table rows (8 lines)");
checklist = checklist.replace(/High Risk Card Drill-down count matches table rows \(12 lines\)/g, "High Risk Card Drill-down count matches table rows (18 lines)");

fs.writeFileSync(guidePath, guide, 'utf-8');
fs.writeFileSync(checklistPath, checklist, 'utf-8');

console.log("Documents updated successfully!");
