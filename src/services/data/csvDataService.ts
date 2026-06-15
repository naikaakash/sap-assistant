import csv from 'csvtojson';
import path from 'path';
import fs from 'fs';
import { isSqlMode } from './sqlClient';
import { loadTableRows } from './sqlTableRows';

const DATA_ROOT = path.join(process.cwd(), 'procurement_data_sample');

// Highly optimized in-memory cache mapped by file modification timestamps
let cache: Record<string, { data: any[]; mtime: number }> = {};

// Helpers for dynamic date shifting
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function getTodayDateLocal(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export let TODAY_DATE = getTodayDateLocal();

export function updateTodayDate() {
  TODAY_DATE = getTodayDateLocal();
}

const ANCHOR_DATE = '2026-06-10';
function getDayDifference(): number {
  const today = new Date(TODAY_DATE + 'T00:00:00');
  const anchor = new Date(ANCHOR_DATE + 'T00:00:00');
  return Math.round((today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
}

function shiftDateString(val: string, days: number): string {
  if (days === 0) return val;
  const parts = val.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const dateObj = new Date(y, m, d);
  dateObj.setDate(dateObj.getDate() + days);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const date = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

export function padItemNumber(itemNum: string): string {
  const trimmed = itemNum.trim();
  if (!trimmed) return '00010';
  if (/^\d+$/.test(trimmed)) {
    return trimmed.padStart(5, '0');
  }
  return trimmed;
}

export async function readCsv(filename: string): Promise<any[]> {
  if (isSqlMode()) {
    try {
      const rawData = await loadTableRows(filename);
      updateTodayDate();
      const diff = getDayDifference();
      return rawData.map((row: any) => {
        const shiftedRow: any = {};
        for (const key in row) {
          const val = row[key];
          if (typeof val === 'string' && dateRegex.test(val)) {
            shiftedRow[key] = shiftDateString(val, diff);
          } else {
            shiftedRow[key] = val;
          }
        }
        return shiftedRow;
      });
    } catch (e) {
      console.error(`[csvDataService] SQL read failed for ${filename}, falling back to CSV:`, e);
      // Fall through to CSV path below
    }
  }
  const filePath = path.join(DATA_ROOT, filename);
  try {
    const stats = fs.statSync(filePath);
    const mtime = stats.mtimeMs;
    
    let rawData: any[];
    // If cache exists and file hasn't been modified on disk, get from cache
    if (cache[filename] && cache[filename].mtime === mtime) {
      rawData = cache[filename].data;
    } else {
      const data = await csv().fromFile(filePath);
      // Trim whitespace and remove non-breaking spaces (\xa0) from all string values
      rawData = data.map((row: any) => {
        const cleanedRow: any = {};
        for (const key in row) {
          if (typeof row[key] === 'string') {
            cleanedRow[key] = row[key].trim().replace(/\u00a0/g, '');
          } else {
            cleanedRow[key] = row[key];
          }
        }
        return cleanedRow;
      });
      
      // Store in-memory along with its modified time
      cache[filename] = { data: rawData, mtime };
    }
    
    // Dynamically update today's date and get the diff relative to anchor date '2026-05-28'
    updateTodayDate();
    const diff = getDayDifference();
    
    // Return a cloned copy with shifted dates
    return rawData.map((row: any) => {
      const shiftedRow: any = {};
      for (const key in row) {
        const val = row[key];
        if (typeof val === 'string' && dateRegex.test(val)) {
          shiftedRow[key] = shiftDateString(val, diff);
        } else {
          shiftedRow[key] = val;
        }
      }
      return shiftedRow;
    });
  } catch (e) {
    console.error(`Failed to read CSV ${filename}:`, e);
    return [];
  }
}

// Clear cache
export function clearCache() {
  cache = {};
}

/**
 * Calculates the Open Quantity according to the business definition:
 * Open Quantity = Max(0, Ordered Quantity - Received Quantity)
 */
export function calculateOpenQuantity(orderedQty: number, receivedQty: number): number {
  return Math.max(0, orderedQty - receivedQty);
}

/**
 * Calculates the Open Value according to the business definition:
 * Open Value = Open Quantity * Net Price
 */
export function calculateOpenValue(openQty: number, netPrice: number): number {
  return openQty * netPrice;
}

/**
 * Calculates the Overdue Days according to the business definition:
 * Overdue Days = Max(0, TODAY_DATE - Requested Delivery Date)
 */
export function calculateOverdueDays(reqDateStr: string, todayDateStr: string): number {
  if (!reqDateStr) return 0;
  return Math.max(0, Math.round((new Date(todayDateStr).getTime() - new Date(reqDateStr).getTime()) / (1000 * 60 * 60 * 24)));
}


export interface FifoSchedAlloc {
  schedule_line: string;
  delivery_date: string;
  scheduled_qty: number;
  received_qty: number;
  open_qty: number;
  asn_shipped_qty: number;
  asn_status: string;
}

export function allocateFifoReceivedAndOpenQty(
  scheduledLines: any[], // lines for this specific po + item
  grs: any[],            // grs for this specific po + item
  asns: any[]            // asns for this specific po + item
): Map<string, FifoSchedAlloc> {
  // Sort schedule lines chronologically by delivery_date
  const sortedLines = [...scheduledLines].sort((a, b) => {
    const da = a.delivery_date || '';
    const db = b.delivery_date || '';
    return da.localeCompare(db);
  });

  // Calculate total received qty across all goods receipts for this item
  const totalReceived = grs.reduce((sum, g) => sum + parseFloat(g.received_qty || '0'), 0);

  // Calculate total shipped qty across all active/transit ASNs for this item
  const totalTransit = asns
    .filter(a => ['IN_TRANSIT', 'DELAYED', 'PENDING_PICKUP', 'CUSTOMS_HOLD'].includes(a.status))
    .reduce((sum, a) => sum + parseFloat(a.shipped_qty || '0'), 0);

  let remainingReceived = totalReceived;
  let remainingTransit = totalTransit;

  const allocationMap = new Map<string, FifoSchedAlloc>();

  // Determine latest active ASN status if available, fallback to the status of the first active one
  const activeAsn = asns.find(a => ['IN_TRANSIT', 'DELAYED', 'PENDING_PICKUP', 'CUSTOMS_HOLD'].includes(a.status)) || asns[0];
  const itemAsnStatus = activeAsn ? activeAsn.status : 'NONE';

  for (const line of sortedLines) {
    const key = `${line.po_number}_${line.item_number}_${line.delivery_date}`;
    const scheduledQty = parseFloat(line.scheduled_qty || '0');

    // 1. Allocate GRs
    const allocatedGR = Math.min(scheduledQty, remainingReceived);
    const receivedQty = allocatedGR;
    const openQty = calculateOpenQuantity(scheduledQty, allocatedGR);
    remainingReceived = Math.max(0, remainingReceived - allocatedGR);

    // 2. Allocate In-Transit ASNs to remaining open qty
    const allocatedTransit = Math.min(openQty, remainingTransit);
    const asnShippedQty = allocatedTransit;
    remainingTransit = Math.max(0, remainingTransit - allocatedTransit);

    allocationMap.set(key, {
      schedule_line: line.schedule_line || '0001',
      delivery_date: line.delivery_date,
      scheduled_qty: scheduledQty,
      received_qty: receivedQty,
      open_qty: openQty,
      asn_shipped_qty: asnShippedQty,
      asn_status: asnShippedQty > 0 ? itemAsnStatus : 'NONE'
    });
  }

  return allocationMap;
}

export interface OverdueSummary {
  totalOpenPoLines: number;
  totalOverduePoLines: number;
  criticalOverduePoLines: number;
  totalOpenQty: number;
  totalOverdueValue: number;
  suppliersWithOverdue: number;
  plantsImpacted: number;
  averageDaysOverdue: number;
}

export interface OverdueWorklistItem {
  exception_id: string;
  exception_type: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: string;
  po_number: string;
  item_number: string;
  schedule_line: string;
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  material_description: string;
  material_group: string;
  plant: string;
  plant_name: string;
  purchasing_group: string;
  requested_delivery_date: string;
  ordered_quantity: number;
  received_quantity: number;
  open_quantity: number;
  net_price: number;
  open_value: number;
  days_overdue: number;
  asn_status: string;
  acknowledgement_status: string;
  assigned_buyer: string;
  root_cause: string;
  delay_category: string; // Dynamic business category for Phase 1B
  on_time_delivery_pct: number;
  avg_response_days: number;
  risk_score: number;
  supplier_tier: string;
  country: string;
  priorityScore: number;
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  delayLikelihoodScore?: number;
}

export interface ExceptionDetail extends OverdueWorklistItem {
  document_type: string;
  po_date: string;
  company_code: string;
  purchasing_org: string;
  currency: string;
  created_by: string;
  header_status: string;
  actual_schedule_line?: string;
  storage_location: string;
  lead_time_days: number;
  safety_stock: number;
  latest_goods_receipt_date: string;
  asn_details: Array<{
    asn_number: string;
    shipped_qty: number;
    ship_date: string;
    expected_delivery_date: string;
    carrier: string;
    tracking_number: string;
    status: string;
  }>;
  acknowledgement_details: {
    acknowledgement_status: string;
    acknowledged_qty: number;
    committed_delivery_date: string;
    last_supplier_response_date: string;
    response_source: string;
    buyer_followup_count: number;
  } | null;
  communication_logs: Array<{
    message_id: string;
    direction: string;
    subject: string;
    body: string;
    sent_date: string;
    received_date: string;
    sentiment: string;
    source_system: string;
  }>;
  erp_discrepancy?: {
    erp_received_qty: number;
    erp_open_qty: number;
    actual_received_qty: number;
    actual_open_qty: number;
    has_discrepancy: boolean;
  };
}

export interface DashboardOverviewDetails {
  spendBySupplier: Array<{ id: string; name: string; value: number }>;
  spendByPlant: Array<{ code: string; name: string; value: number }>;
  spendByMaterialGroup: Array<{ category: string; value: number }>;
  supplierRiskDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  recentActivity: Array<{
    po_number: string;
    po_date: string;
    supplier_name: string;
    items_count: number;
    open_value: number;
    release_status: string;
    header_status: string;
  }>;
}

// Helpers to join exceptions and calculate values
async function fetchJoinedWorklist(): Promise<OverdueWorklistItem[]> {
  const [
    exceptionsRaw,
    itemsRaw,
    headersRaw,
    suppliersRaw,
    plantsRaw,
    schedulesRaw,
    acksRaw,
    asnsRaw,
    mpRaw,
    grsRaw
  ] = await Promise.all([
    readCsv('exception_worklist.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('suppliers.csv'),
    readCsv('plants.csv'),
    readCsv('po_schedule_lines.csv'),
    readCsv('supplier_acknowledgements.csv'),
    readCsv('asn_shipments.csv'),
    readCsv('material_plant.csv'),
    readCsv('goods_receipts.csv')
  ]);

  // Index files for O(1) matching
  const itemsMap = new Map<string, any>();
  for (const item of itemsRaw) {
    itemsMap.set(`${item.po_number}_${item.item_number}`, item);
  }

  const headersMap = new Map<string, any>();
  for (const h of headersRaw) {
    headersMap.set(h.po_number, h);
  }

  const suppliersMap = new Map<string, any>();
  for (const s of suppliersRaw) {
    suppliersMap.set(s.supplier_id, s);
  }

  const plantsMap = new Map<string, any>();
  for (const p of plantsRaw) {
    plantsMap.set(p.plant, p);
  }

  const acksMap = new Map<string, any>();
  for (const ack of acksRaw) {
    acksMap.set(`${ack.po_number}_${ack.item_number}`, ack);
  }

  // Group schedule lines, GRs, and ASNs by itemKey for FIFO allocation
  const schedulesByItem = new Map<string, any[]>();
  for (const s of schedulesRaw) {
    const key = `${s.po_number}_${s.item_number}`;
    if (!schedulesByItem.has(key)) schedulesByItem.set(key, []);
    schedulesByItem.get(key)!.push(s);
  }

  const grsByItem = new Map<string, any[]>();
  for (const g of grsRaw) {
    const key = `${g.po_number}_${g.item_number}`;
    if (!grsByItem.has(key)) grsByItem.set(key, []);
    grsByItem.get(key)!.push(g);
  }

  const asnsByItem = new Map<string, any[]>();
  for (const a of asnsRaw) {
    const key = `${a.po_number}_${a.item_number}`;
    if (!asnsByItem.has(key)) asnsByItem.set(key, []);
    asnsByItem.get(key)!.push(a);
  }

  // Pre-calculate FIFO allocations for all active items
  const fifoAllocations = new Map<string, FifoSchedAlloc>();
  for (const key of schedulesByItem.keys()) {
    const itemSchedules = schedulesByItem.get(key) || [];
    const itemGrs = grsByItem.get(key) || [];
    const itemAsns = asnsByItem.get(key) || [];
    const allocations = allocateFifoReceivedAndOpenQty(itemSchedules, itemGrs, itemAsns);
    for (const [lineKey, alloc] of allocations.entries()) {
      fifoAllocations.set(lineKey, alloc);
    }
  }

  // Create a schedule map that matches schedule line by PO, item, and date
  const scheduleMap = new Map<string, any>();
  for (const sch of schedulesRaw) {
    scheduleMap.set(`${sch.po_number}_${sch.item_number}_${sch.delivery_date}`, sch);
  }

  // Group ASNs by PO number and Item number
  const asnsByLine = new Map<string, any[]>();
  for (const asn of asnsRaw) {
    const key = `${asn.po_number}_${asn.item_number}`;
    if (!asnsByLine.has(key)) {
      asnsByLine.set(key, []);
    }
    asnsByLine.get(key)!.push(asn);
  }

  // Create material plant parameters index
  const mpMap = new Map<string, any>();
  for (const mp of mpRaw) {
    mpMap.set(`${mp.material_id}_${mp.plant}`, mp);
  }

  const overdueExceptions = exceptionsRaw.filter(ex => ex.exception_type === 'PO_OVERDUE');

  const joinedList: OverdueWorklistItem[] = overdueExceptions.map(ex => {
    const itemKey = `${ex.po_number}_${ex.item_number}`;
    const poItem = itemsMap.get(itemKey) || {};
    const poHeader = headersMap.get(ex.po_number) || {};
    const supplier = suppliersMap.get(ex.supplier_id) || {};
    const plantInfo = plantsMap.get(ex.plant) || {};
    const ackInfo = acksMap.get(itemKey) || {};
    const matPlant = mpMap.get(`${ex.material_id}_${ex.plant}`) || {};
    
    // Find matching schedule line by PO, Item, and Due Date
    const schedule = scheduleMap.get(`${ex.po_number}_${ex.item_number}_${ex.due_date}`) || {};

    // Determine ASN Status from FIFO allocation or default active lookup
    const allocKey = `${ex.po_number}_${ex.item_number}_${ex.due_date}`;
    const allocation = fifoAllocations.get(allocKey);

    const asns = asnsByLine.get(itemKey) || [];
    const activeAsn = asns.find(a => ['IN_TRANSIT', 'DELAYED', 'PENDING_PICKUP', 'CUSTOMS_HOLD'].includes(a.status)) || asns[0];
    const asnStatus = allocation ? allocation.asn_status : (activeAsn ? activeAsn.status : 'NONE');

    // Calculate dynamic overdue days
    const reqDate = ex.due_date;
    const daysOverdue = reqDate ? Math.max(0, Math.round((new Date(TODAY_DATE).getTime() - new Date(reqDate).getTime()) / (1000 * 60 * 60 * 24))) : parseInt(ex.days_past_due || '0', 10);

    // Calculate dynamic FIFO quantities
    const orderedQty = allocation ? allocation.scheduled_qty : parseFloat(schedule.scheduled_qty || poItem.order_qty || '0');
    const receivedQty = allocation ? allocation.received_qty : parseFloat(schedule.received_qty || '0');
    const openQty = allocation ? allocation.open_qty : calculateOpenQuantity(orderedQty, receivedQty);
    const netPrice = parseFloat(poItem.net_price || '0');
    const openValue = openQty * netPrice || parseFloat(ex.financial_impact_estimate || '0');

    // Severity Logic:
    // Critical: > 7 days
    // High: 3 - 7 days
    // Medium: 1 - 2 days
    // Low: overdue but has recovery evidence (e.g. active ASN status like IN_TRANSIT or DELIVERED/expected expected delivery date in today/tomorrow)
    let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'MEDIUM';
    if (daysOverdue > 7) {
      severity = 'CRITICAL';
    } else if (daysOverdue >= 3) {
      severity = 'HIGH';
    } else if (daysOverdue >= 1) {
      severity = 'MEDIUM';
    } else {
      severity = 'LOW';
    }

    // Check recovery evidence for Low: if active ASN is 'IN_TRANSIT' or 'DELAYED' but expected delivery is very soon
    if (severity !== 'CRITICAL' && activeAsn && ['IN_TRANSIT'].includes(activeAsn.status)) {
      severity = 'LOW';
    }

    // Dynamic Root Cause Diagnosis for Phase 1B Milestone 1 Sourced
    let delayCategory = 'Pending Delay Verification';
    if (ackInfo.acknowledgement_status === 'MISSING') {
      delayCategory = 'Supplier Acknowledgement Missing';
    } else if (asnStatus === 'CUSTOMS_HOLD') {
      delayCategory = 'Customs & Compliance Hold';
    } else if (asnStatus === 'DELAYED') {
      delayCategory = 'Logistics & Transit Delay';
    } else if (asnStatus === 'IN_TRANSIT') {
      delayCategory = 'Logistics & Transit Delay';
    } else if (supplier.on_time_delivery_pct && parseFloat(supplier.on_time_delivery_pct) < 75) {
      delayCategory = 'Supplier Capacity Bottleneck';
    } else if (poHeader.po_date && ex.due_date) {
      const poTime = new Date(poHeader.po_date).getTime();
      const dueTime = new Date(ex.due_date).getTime();
      const leadTimeMs = dueTime - poTime;
      const plannedLeadDays = parseFloat(matPlant.planned_delivery_time_days || '0');
      if (leadTimeMs > 0 && leadTimeMs / (1000 * 60 * 60 * 24) < plannedLeadDays) {
        delayCategory = 'Short Lead Time Exception';
      }
    }

    // Phase 2B Priority score calculation
    let severityWeight = 0;
    if (severity === 'CRITICAL') severityWeight = 30;
    else if (severity === 'HIGH') severityWeight = 15;
    else if (severity === 'MEDIUM') severityWeight = 5;

    let valueWeight = 0;
    if (openValue > 50000) valueWeight = 20;
    else if (openValue > 10000) valueWeight = 10;
    else if (openValue > 1000) valueWeight = 5;

    const riskScoreVal = parseFloat(supplier.risk_score || '0');
    // Logarithmic Sigmoid Prioritization Scaling
    const lnDays = Math.log(daysOverdue + 1);
    const scoreVal = (15 * lnDays) + (riskScoreVal * 0.2) + severityWeight + valueWeight;
    const priorityScore = Math.min(100, Math.round(scoreVal));

    let priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (priorityScore >= 75) priorityLevel = 'CRITICAL';
    else if (priorityScore >= 50) priorityLevel = 'HIGH';
    else if (priorityScore >= 25) priorityLevel = 'MEDIUM';

    // 3D: Predictive Delay Likelihood Score (0–100, deterministic — zero tokens)
    // Weighted signals: OTD failure rate, supplier risk, missing ASN/Ack, slow response, days overdue
    const otdFailureRate = Math.max(0, 100 - parseFloat(supplier.on_time_delivery_pct || '0')); // 0–100
    const supplierRisk = parseFloat(supplier.risk_score || '0');                                 // 0–100
    const noAsn = asnStatus === 'NONE' || asnStatus === 'CUSTOMS_HOLD' ? 20 : asnStatus === 'DELAYED' ? 10 : 0;
    const noAck = (ackInfo.acknowledgement_status === 'MISSING' || !ackInfo.acknowledgement_status) ? 20 : 0;
    const slowResponse = Math.min(15, Math.max(0, (parseFloat(supplier.avg_response_days || '0') - 3) * 3));
    const overdueSignal = Math.min(15, daysOverdue * 1.5);
    const rawLikelihood = (otdFailureRate * 0.25) + (supplierRisk * 0.2) + noAsn + noAck + slowResponse + overdueSignal;
    const delayLikelihoodScore = Math.min(100, Math.round(rawLikelihood));

    return {
      exception_id: ex.exception_id,
      exception_type: ex.exception_type,
      severity,
      status: openQty === 0 ? 'RESOLVED' : ex.status,
      po_number: ex.po_number,
      item_number: ex.item_number,
      schedule_line: schedule.schedule_line || '0001',
      supplier_id: ex.supplier_id,
      supplier_name: supplier.supplier_name || ex.supplier_id,
      material_id: ex.material_id,
      material_description: poItem.material_description || 'Unknown Material',
      material_group: poItem.item_category || 'STANDARD',
      plant: ex.plant,
      plant_name: plantInfo.plant_name || ex.plant,
      purchasing_group: poHeader.purchasing_group || '',
      requested_delivery_date: ex.due_date,
      ordered_quantity: orderedQty,
      received_quantity: receivedQty,
      open_quantity: openQty,
      net_price: netPrice,
      open_value: openValue,
      days_overdue: daysOverdue,
      asn_status: asnStatus,
      acknowledgement_status: ackInfo.acknowledgement_status || 'MISSING',
      assigned_buyer: ex.assigned_buyer || poHeader.created_by || 'Unknown',
      root_cause: ex.root_cause || `PO line overdue by ${daysOverdue} days.`,
      delay_category: delayCategory,
      on_time_delivery_pct: parseFloat(supplier.on_time_delivery_pct || '0'),
      avg_response_days: parseFloat(supplier.avg_response_days || '0'),
      risk_score: parseFloat(supplier.risk_score || '0'),
      supplier_tier: supplier.supplier_tier || 'N/A',
      country: supplier.country || 'Global',
      priorityScore,
      priorityLevel,
      delayLikelihoodScore
    };
  });

  return joinedList.filter(item => {
    const itemKey = `${item.po_number}_${item.item_number}`;
    const poItem = itemsMap.get(itemKey) || {};
    const poHeader = headersMap.get(item.po_number) || {};
    const isDeleted = poItem.deletion_flag === 'Y' || poItem.deletion_completion_indicator === 'DELETED';
    const isCompleted = poItem.delivery_completed_flag === 'Y' || poItem.deletion_completion_indicator === 'COMPLETED';
    const isClosedOrCancelled = poHeader.header_status === 'CLOSED' || poHeader.header_status === 'CANCELLED' || poHeader.status === 'CLOSED' || poHeader.status === 'CANCELLED';
    return !isDeleted && !isCompleted && !isClosedOrCancelled && item.days_overdue >= 1;
  });
}

// 1. GET SUMMARY METRICS
export async function getOverdueSummary(): Promise<OverdueSummary> {
  const [schedulesRaw, itemsRaw, exceptionsRaw, grsRaw] = await Promise.all([
    readCsv('po_schedule_lines.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('exception_worklist.csv'),
    readCsv('goods_receipts.csv')
  ]);

  // Group schedule lines and GRs by itemKey for FIFO allocation
  const schedulesByItem = new Map<string, any[]>();
  for (const s of schedulesRaw) {
    const key = `${s.po_number}_${s.item_number}`;
    if (!schedulesByItem.has(key)) schedulesByItem.set(key, []);
    schedulesByItem.get(key)!.push(s);
  }

  const grsByItem = new Map<string, any[]>();
  for (const g of grsRaw) {
    const key = `${g.po_number}_${g.item_number}`;
    if (!grsByItem.has(key)) grsByItem.set(key, []);
    grsByItem.get(key)!.push(g);
  }

  // Pre-calculate FIFO allocations for all active items
  const fifoAllocations = new Map<string, FifoSchedAlloc>();
  for (const key of schedulesByItem.keys()) {
    const itemSchedules = schedulesByItem.get(key) || [];
    const itemGrs = grsByItem.get(key) || [];
    const allocations = allocateFifoReceivedAndOpenQty(itemSchedules, itemGrs, []);
    for (const [lineKey, alloc] of allocations.entries()) {
      fifoAllocations.set(lineKey, alloc);
    }
  }

  // Calculate dynamic open qty for all schedule lines
  const openPoLinesList = schedulesRaw.filter(s => {
    const key = `${s.po_number}_${s.item_number}_${s.delivery_date}`;
    const allocation = fifoAllocations.get(key);
    const openQty = allocation ? allocation.open_qty : calculateOpenQuantity(parseFloat(s.scheduled_qty || '0'), parseFloat(s.received_qty || '0'));
    return openQty > 0;
  });

  const totalOpenPoLines = openPoLinesList.length;
  
  const totalOpenQty = openPoLinesList.reduce((sum, s) => {
    const key = `${s.po_number}_${s.item_number}_${s.delivery_date}`;
    const allocation = fifoAllocations.get(key);
    const openQty = allocation ? allocation.open_qty : calculateOpenQuantity(parseFloat(s.scheduled_qty || '0'), parseFloat(s.received_qty || '0'));
    return sum + openQty;
  }, 0);

  // Get joined overdue items
  const overdueWorklist = await fetchJoinedWorklist();
  
  // Filter out any strictly RESOLVED ones if needed, but summary usually shows active overdue items
  const activeOverdue = overdueWorklist.filter(item => item.status !== 'RESOLVED');
  
  const totalOverduePoLines = activeOverdue.length;
  const criticalOverduePoLines = activeOverdue.filter(item => item.days_overdue > 7).length;
  const totalOverdueValue = activeOverdue.reduce((sum, item) => sum + item.open_value, 0);

  const suppliers = new Set(activeOverdue.map(item => item.supplier_id));
  const plants = new Set(activeOverdue.map(item => item.plant));

  const averageDaysOverdue = activeOverdue.length > 0
    ? activeOverdue.reduce((sum, item) => sum + item.days_overdue, 0) / activeOverdue.length
    : 0;

  return {
    totalOpenPoLines,
    totalOverduePoLines,
    criticalOverduePoLines,
    totalOpenQty,
    totalOverdueValue: Math.round(totalOverdueValue * 100) / 100,
    suppliersWithOverdue: suppliers.size,
    plantsImpacted: plants.size,
    averageDaysOverdue: Math.round(averageDaysOverdue * 10) / 10
  };
}

export interface FilteredSummary {
  totalLines: number;
  totalValue: number;
  totalQty: number;
  criticalLines: number;
  averageDays: number;
}

// 2. GET WORKLIST WITH FILTERS & PAGINATION
export async function getOverdueWorklist(filters: {
  plant?: string;
  supplier?: string;
  purchasingGroup?: string;
  materialGroup?: string;
  delayCategory?: string;
  overdueDaysMin?: number;
  overdueDaysMax?: number;
  dateMin?: string;
  dateMax?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
}): Promise<{ data: OverdueWorklistItem[]; total: number; filteredSummary: FilteredSummary }> {
  let list = await fetchJoinedWorklist();

  // Apply filters
  if (filters.delayCategory) {
    list = list.filter(item => item.delay_category === filters.delayCategory);
  }

  // Apply filters
  if (filters.plant) {
    list = list.filter(item => item.plant === filters.plant);
  }
  if (filters.supplier) {
    list = list.filter(item => item.supplier_id === filters.supplier || item.supplier_name.toLowerCase().includes(filters.supplier!.toLowerCase()));
  }
  if (filters.purchasingGroup) {
    list = list.filter(item => item.purchasing_group === filters.purchasingGroup);
  }
  if (filters.materialGroup) {
    list = list.filter(item => item.material_group === filters.materialGroup);
  }
  if (filters.overdueDaysMin !== undefined) {
    list = list.filter(item => item.days_overdue >= filters.overdueDaysMin!);
  }
  if (filters.overdueDaysMax !== undefined) {
    list = list.filter(item => item.days_overdue <= filters.overdueDaysMax!);
  }
  if (filters.dateMin) {
    list = list.filter(item => item.requested_delivery_date >= filters.dateMin!);
  }
  if (filters.dateMax) {
    list = list.filter(item => item.requested_delivery_date <= filters.dateMax!);
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(item => 
      item.po_number.toLowerCase().includes(s) ||
      item.material_id.toLowerCase().includes(s) ||
      item.material_description.toLowerCase().includes(s)
    );
  }

  const total = list.length;

  // Apply sorting: priority descending or overdue days descending as default
  if (filters.sortBy === 'priority') {
    list.sort((a, b) => b.priorityScore - a.priorityScore || b.days_overdue - a.days_overdue || a.po_number.localeCompare(b.po_number));
  } else {
    list.sort((a, b) => b.days_overdue - a.days_overdue || a.po_number.localeCompare(b.po_number));
  }

  // Apply pagination
  const offset = filters.offset || 0;
  const limit = filters.limit || 50;
  const paginatedData = list.slice(offset, offset + limit);

  const filteredSummary = {
    totalLines: total,
    totalValue: Math.round(list.reduce((sum, item) => sum + item.open_value, 0) * 100) / 100,
    totalQty: list.reduce((sum, item) => sum + item.open_quantity, 0),
    criticalLines: list.filter(w => w.severity === 'CRITICAL').length,
    averageDays: list.length > 0 ? Math.round(list.reduce((sum, item) => sum + item.days_overdue, 0) / list.length * 10) / 10 : 0
  };

  return {
    data: paginatedData,
    total,
    filteredSummary
  };
}

// 3. GET EXCEPTION DETAIL
export async function getExceptionDetail(
  poNumber: string,
  itemNumber: string,
  scheduleLine: string
): Promise<ExceptionDetail | null> {
  const [
    overdueList,
    headersRaw,
    itemsRaw,
    suppliersRaw,
    plantsRaw,
    acksRaw,
    asnsRaw,
    logsRaw,
    grsRaw,
    mpRaw,
    schedulesRaw
  ] = await Promise.all([
    fetchJoinedWorklist(),
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('suppliers.csv'),
    readCsv('plants.csv'),
    readCsv('supplier_acknowledgements.csv'),
    readCsv('asn_shipments.csv'),
    readCsv('communication_logs.csv'),
    readCsv('goods_receipts.csv'),
    readCsv('material_plant.csv'),
    readCsv('po_schedule_lines.csv')
  ]);

  // Find base item from joined list
  const baseItem = overdueList.find(item => 
    item.po_number === poNumber && 
    item.item_number === itemNumber && 
    item.schedule_line === scheduleLine
  ) || overdueList.find(item => 
    item.po_number === poNumber && 
    item.item_number === itemNumber
  );

  // Find schedule line from po_schedule_lines.csv matching the specific schedule line
  const targetSchedLine = scheduleLine || baseItem?.schedule_line || '0001';
  const schedMatch = schedulesRaw.find(s => s.po_number === poNumber && padItemNumber(s.item_number) === padItemNumber(itemNumber) && s.schedule_line === targetSchedLine) || schedulesRaw.find(s => s.po_number === poNumber && padItemNumber(s.item_number) === padItemNumber(itemNumber)) || {};
  
  // Calculate item-level totals for discrepancy check to avoid false alarms due to schedule line distribution mismatch
  const itemGrs = grsRaw.filter(g => g.po_number === poNumber && padItemNumber(g.item_number) === padItemNumber(itemNumber));
  const itemSchedules = schedulesRaw.filter(s => s.po_number === poNumber && padItemNumber(s.item_number) === padItemNumber(itemNumber));
  const erpItemReceived = itemSchedules.reduce((sum, s) => sum + parseFloat(s.received_qty || '0'), 0);
  const erpItemOpen = itemSchedules.reduce((sum, s) => sum + parseFloat(s.open_qty || '0'), 0);
  
  const actualItemReceived = itemGrs.reduce((sum, g) => sum + parseFloat(g.received_qty || '0'), 0);
  const totalItemScheduled = itemSchedules.reduce((sum, s) => sum + parseFloat(s.scheduled_qty || '0'), 0);
  const actualItemOpen = Math.max(0, totalItemScheduled - actualItemReceived);

  const hasDiscrepancy = erpItemReceived !== actualItemReceived;

  const erpReceivedQty = erpItemReceived;
  const erpOpenQty = erpItemOpen;
  const actualReceivedQty = actualItemReceived;
  const actualOpenQty = actualItemOpen;

  const poItem = itemsRaw.find(i => i.po_number === poNumber && padItemNumber(i.item_number) === padItemNumber(itemNumber)) || {};
  const poHeader = headersRaw.find(h => h.po_number === poNumber) || {};
  const supplier = suppliersRaw.find(s => s.supplier_id === (poHeader.supplier_id || baseItem?.supplier_id)) || {};
  const plantInfo = plantsRaw.find(p => p.plant === (poItem.plant || baseItem?.plant)) || {};
  const ack = acksRaw.find(a => a.po_number === poNumber && padItemNumber(a.item_number) === padItemNumber(itemNumber));
  
  // Sourced Lead Time and Safety Stock from material_plant.csv
  const matPlant = mpRaw.find(mp => mp.material_id === poItem.material_id && mp.plant === poItem.plant) || {};
  const safetyStock = parseInt(matPlant.safety_stock || '0', 10);
  const leadTimeDays = parseInt(matPlant.planned_delivery_time_days || '0', 10);

  // Latest Goods Receipt posting date
  const latestGr = itemGrs.length > 0 
    ? itemGrs.reduce((latest, current) => current.posting_date > latest.posting_date ? current : latest, itemGrs[0])
    : null;

  // Sourced matching ASNs
  const itemAsns = asnsRaw
    .filter(a => a.po_number === poNumber && a.item_number === itemNumber)
    .map(a => ({
      asn_number: a.asn_number,
      shipped_qty: parseFloat(a.shipped_qty || '0'),
      ship_date: a.ship_date || '',
      expected_delivery_date: a.expected_delivery_date || '',
      carrier: a.carrier || '',
      tracking_number: a.tracking_number || '',
      status: a.status
    }));

  // Sourced matching communication logs
  const logs = logsRaw
    .filter(l => l.po_number === poNumber && l.item_number === itemNumber)
    .map(l => ({
      message_id: l.message_id,
      direction: l.direction,
      subject: l.subject,
      body: l.body,
      sent_date: l.sent_date || '',
      received_date: l.received_date || '',
      sentiment: l.sentiment || 'neutral',
      source_system: l.source_system || 'EMAIL'
    }));

  let extraLogs: any[] = [];
  try {
    const remindersPath = path.join(process.cwd(), 'data', 'app-supplier-reminders.json');
    if (fs.existsSync(remindersPath)) {
      const reminders = JSON.parse(fs.readFileSync(remindersPath, 'utf8'));
      reminders.forEach((r: any) => {
        if (r.purchaseOrderNumber === poNumber && r.purchaseOrderItem === itemNumber) {
          extraLogs.push({
            message_id: r.reminderId,
            direction: 'OUTBOUND',
            subject: r.subject || 'System reminder sent',
            body: r.bodyText || '',
            sent_date: r.sentAt || r.createdAt || '',
            received_date: '',
            sentiment: 'neutral',
            source_system: 'System reminder sent'
          });
        }
      });
    }
  } catch (e) {
    console.error('Failed to read app-supplier-reminders.json:', e);
  }

  try {
    const responsesPath = path.join(process.cwd(), 'data', 'app-supplier-responses.json');
    if (fs.existsSync(responsesPath)) {
      const responses = JSON.parse(fs.readFileSync(responsesPath, 'utf8'));
      responses.forEach((r: any) => {
        if (r.purchaseOrderNumber === poNumber && r.purchaseOrderItem === itemNumber) {
          extraLogs.push({
            message_id: r.responseId,
            direction: 'INBOUND',
            subject: r.responseCategory || 'Supplier Response',
            body: r.rawResponseText || '',
            sent_date: '',
            received_date: r.respondedAt || r.capturedAt || '',
            sentiment: 'neutral',
            source_system: 'Supplier response received'
          });
        }
      });
    }
  } catch (e) {
    console.error('Failed to read app-supplier-responses.json:', e);
  }

  try {
    const actionsPath = path.join(process.cwd(), 'data', 'app-actions.json');
    if (fs.existsSync(actionsPath)) {
      const actions = JSON.parse(fs.readFileSync(actionsPath, 'utf8'));
      actions.forEach((a: any) => {
        if (a.purchaseOrderNumber === poNumber && a.purchaseOrderItem === itemNumber) {
          extraLogs.push({
            message_id: a.actionId,
            direction: 'OUTBOUND',
            subject: a.actionType || 'Buyer Action',
            body: a.note || '',
            sent_date: a.createdAt || '',
            received_date: '',
            sentiment: 'neutral',
            source_system: 'Buyer manually marked contacted'
          });
        }
      });
    }
  } catch (e) {
    console.error('Failed to read app-actions.json:', e);
  }

  try {
    const recPath = path.join(process.cwd(), 'data', 'app-recommendations.json');
    if (fs.existsSync(recPath)) {
      const recommendations = JSON.parse(fs.readFileSync(recPath, 'utf8'));
      recommendations.forEach((r: any) => {
        if (r.purchaseOrderNumber === poNumber && r.purchaseOrderItem === itemNumber) {
          if (['CLOSED', 'CLOSED_NO_ACTION', 'CONFIRMED_RESOLVED'].includes(r.lifecycleStatus)) {
            extraLogs.push({
              message_id: r.recommendationId + '_closed',
              direction: 'OUTBOUND',
              subject: `Exception Closed: ${r.closureReason || 'Resolved'}`,
              body: `The exception has been closed. Status: ${r.lifecycleStatus}`,
              sent_date: r.closedAt || r.updatedAt || '',
              received_date: '',
              sentiment: 'positive',
              source_system: 'Buyer manually marked contacted'
            });
          }
        }
      });
    }
  } catch (e) {
    console.error('Failed to read app-recommendations.json:', e);
  }

  const combinedLogs = [...logs, ...extraLogs];
  combinedLogs.sort((a, b) => {
    const dateA = a.sent_date || a.received_date || '';
    const dateB = b.sent_date || b.received_date || '';
    return dateB.localeCompare(dateA);
  });

  const requiresAck = itemSchedules.some(s => s.confirmation_control_key === 'ZACK');
  let ackDetails = null;
  if (ack) {
    ackDetails = {
      acknowledgement_status: ack.acknowledgement_status || 'MISSING',
      acknowledged_qty: parseFloat(ack.acknowledged_qty || '0'),
      committed_delivery_date: ack.committed_delivery_date || '',
      last_supplier_response_date: ack.last_supplier_response_date || '',
      response_source: ack.response_source || 'EMAIL',
      buyer_followup_count: parseInt(ack.buyer_followup_count || '0', 10)
    };
  } else if (requiresAck) {
    ackDetails = {
      acknowledgement_status: 'MISSING',
      acknowledged_qty: 0,
      committed_delivery_date: '',
      last_supplier_response_date: '',
      response_source: '',
      buyer_followup_count: 0
    };
  }

  // Fallbacks if baseItem is not found (representing schedule line parameters)
  const netPrice = parseFloat(poItem.net_price || '0');
  const fallbackOrdered = parseFloat(schedMatch.scheduled_qty || poItem.order_qty || '0');
  const fallbackReceived = parseFloat(schedMatch.received_qty || '0');
  const fallbackOpen = calculateOpenQuantity(fallbackOrdered, fallbackReceived);
  const fallbackValue = fallbackOpen * netPrice;

  // Days overdue calculation
  const reqDate = baseItem?.requested_delivery_date || poItem.delivery_date || '';
  const daysOverdue = baseItem?.days_overdue || (reqDate ? Math.max(0, Math.round((new Date(TODAY_DATE).getTime() - new Date(reqDate).getTime()) / (1000 * 60 * 60 * 24))) : 0);

  // Priority calculation
  const severity = baseItem?.severity || (daysOverdue > 7 ? 'CRITICAL' : daysOverdue >= 3 ? 'HIGH' : daysOverdue >= 1 ? 'MEDIUM' : 'LOW');
  const openValue = baseItem?.open_value !== undefined ? baseItem.open_value : fallbackValue;
  
  let severityWeight = 0;
  if (severity === 'CRITICAL') severityWeight = 30;
  else if (severity === 'HIGH') severityWeight = 15;
  else if (severity === 'MEDIUM') severityWeight = 5;

  let valueWeight = 0;
  if (openValue > 50000) valueWeight = 20;
  else if (openValue > 10000) valueWeight = 10;
  else if (openValue > 1000) valueWeight = 5;

  const riskScoreVal = parseFloat(supplier.risk_score || '0');
  const priorityScore = Math.min(100, Math.round((daysOverdue * 3) + (riskScoreVal * 0.3) + severityWeight + valueWeight));

  let priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
  if (priorityScore >= 75) priorityLevel = 'CRITICAL';
  else if (priorityScore >= 50) priorityLevel = 'HIGH';
  else if (priorityScore >= 25) priorityLevel = 'MEDIUM';

  const resultDetail: ExceptionDetail = {
    exception_id: baseItem?.exception_id || 'NONE',
    exception_type: baseItem?.exception_type || 'PO_OVERDUE',
    severity,
    status: baseItem?.status || 'NEW',
    po_number: poNumber,
    item_number: itemNumber,
    schedule_line: scheduleLine || baseItem?.schedule_line || '0001',
    supplier_id: supplier.supplier_id || poHeader.supplier_id || '',
    supplier_name: supplier.supplier_name || 'Unknown Supplier',
    material_id: poItem.material_id || baseItem?.material_id || '',
    material_description: poItem.material_description || 'Unknown Material',
    material_group: poItem.item_category || 'STANDARD',
    plant: poItem.plant || baseItem?.plant || '',
    plant_name: plantInfo.plant_name || baseItem?.plant_name || '',
    purchasing_group: poHeader.purchasing_group || '',
    requested_delivery_date: reqDate,
    ordered_quantity: baseItem !== undefined ? baseItem.ordered_quantity : fallbackOrdered,
    received_quantity: baseItem !== undefined ? baseItem.received_quantity : fallbackReceived,
    open_quantity: baseItem !== undefined ? baseItem.open_quantity : fallbackOpen,
    net_price: netPrice,
    open_value: openValue,
    days_overdue: daysOverdue,
    asn_status: baseItem?.asn_status || (itemAsns.length > 0 ? itemAsns[0].status : 'NONE'),
    acknowledgement_status: ackDetails?.acknowledgement_status || 'MISSING',
    assigned_buyer: baseItem?.assigned_buyer || poHeader.created_by || 'Unknown',
    root_cause: baseItem?.root_cause || `PO line is overdue by ${daysOverdue} days.`,
    delay_category: baseItem?.delay_category || 'Pending Delay Verification',
    on_time_delivery_pct: parseFloat(supplier.on_time_delivery_pct || '0'),
    avg_response_days: parseFloat(supplier.avg_response_days || '0'),
    risk_score: parseFloat(supplier.risk_score || '0'),
    supplier_tier: supplier.supplier_tier || 'N/A',
    country: supplier.country || 'Global',
    document_type: poHeader.document_type || 'NB',
    po_date: poHeader.po_date || '',
    company_code: poHeader.company_code || '',
    purchasing_org: poHeader.purchasing_org || '',
    currency: poHeader.currency || 'USD',
    created_by: poHeader.created_by || 'Unknown',
    header_status: poHeader.header_status || '',
    actual_schedule_line: schedMatch.schedule_line || '',
    storage_location: poItem.storage_location || '',
    lead_time_days: leadTimeDays,
    safety_stock: safetyStock,
    latest_goods_receipt_date: latestGr ? latestGr.posting_date : '',
    asn_details: itemAsns,
    acknowledgement_details: ackDetails,
    communication_logs: combinedLogs,
    priorityScore: baseItem !== undefined ? baseItem.priorityScore : priorityScore,
    priorityLevel: baseItem !== undefined ? baseItem.priorityLevel : priorityLevel,
    erp_discrepancy: {
      erp_received_qty: erpReceivedQty,
      erp_open_qty: erpOpenQty,
      actual_received_qty: actualReceivedQty,
      actual_open_qty: actualOpenQty,
      has_discrepancy: hasDiscrepancy
    }
  };

  return resultDetail;
}

// 4. HELPER TO FETCH ALL FILTERS FOR THE FILTER BAR SOURCED DYNAMICALLY
export async function getFilterOptions(): Promise<{
  plants: Array<{ code: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  purchasingGroups: string[];
  materialGroups: string[];
}> {
  const [plantsRaw, suppliersRaw, headersRaw, itemsRaw] = await Promise.all([
    readCsv('plants.csv'),
    readCsv('suppliers.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv')
  ]);

  const plants = plantsRaw.map(p => ({ code: p.plant, name: p.plant_name }));
  const suppliers = suppliersRaw.map(s => ({ id: s.supplier_id, name: s.supplier_name }));
  
  const purchasingGroups = Array.from(new Set(headersRaw.map(h => h.purchasing_group).filter(Boolean))) as string[];
  purchasingGroups.sort();

  const materialGroups = Array.from(new Set(itemsRaw.map(i => i.item_category).filter(Boolean))) as string[];
  materialGroups.sort();

  return {
    plants,
    suppliers,
    purchasingGroups,
    materialGroups
  };
}

// 5. GLOBAL TAB SUMMARY METRICS (NEW PHASE 1B KPI)
export async function getGlobalOverviewSummary() {
  const [
    headersRaw, itemsRaw, schedulesRaw, suppliersRaw, materialsRaw, stockRaw, acksRaw, asnRaw, exceptionsRaw, grsRaw
  ] = await Promise.all([
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('po_schedule_lines.csv'),
    readCsv('suppliers.csv'),
    readCsv('materials.csv'),
    readCsv('inventory_stock.csv'),
    readCsv('supplier_acknowledgements.csv'),
    readCsv('asn_shipments.csv'),
    readCsv('exception_worklist.csv'),
    readCsv('goods_receipts.csv')
  ]);

  // Group schedule lines, GRs, and ASNs by itemKey for FIFO allocation
  const schedulesByItem = new Map<string, any[]>();
  for (const s of schedulesRaw) {
    const key = `${s.po_number}_${s.item_number}`;
    if (!schedulesByItem.has(key)) schedulesByItem.set(key, []);
    schedulesByItem.get(key)!.push(s);
  }

  const grsByItem = new Map<string, any[]>();
  for (const g of grsRaw) {
    const key = `${g.po_number}_${g.item_number}`;
    if (!grsByItem.has(key)) grsByItem.set(key, []);
    grsByItem.get(key)!.push(g);
  }

  const asnsByItem = new Map<string, any[]>();
  for (const a of asnRaw) {
    const key = `${a.po_number}_${a.item_number}`;
    if (!asnsByItem.has(key)) asnsByItem.set(key, []);
    asnsByItem.get(key)!.push(a);
  }

  // Pre-calculate FIFO allocations for all active items
  const fifoAllocations = new Map<string, FifoSchedAlloc>();
  for (const key of schedulesByItem.keys()) {
    const itemSchedules = schedulesByItem.get(key) || [];
    const itemGrs = grsByItem.get(key) || [];
    const itemAsns = asnsByItem.get(key) || [];
    const allocations = allocateFifoReceivedAndOpenQty(itemSchedules, itemGrs, itemAsns);
    for (const [lineKey, alloc] of allocations.entries()) {
      fifoAllocations.set(lineKey, alloc);
    }
  }

  // Total PO Lines: Total in schedule_lines, fallback to items if no schedule
  const totalPoLines = schedulesRaw.length || itemsRaw.length;

  // Open PO Lines: schedule_lines with dynamic open_qty > 0
  const openPoLines = schedulesRaw.filter(s => {
    const itemKey = `${s.po_number}_${s.item_number}`;
    const poItem = itemsRaw.find(i => i.po_number === s.po_number && i.item_number === s.item_number) || {};
    const poHeader = headersRaw.find(h => h.po_number === s.po_number) || {};
    const isDeleted = poItem.deletion_flag === 'Y' || poItem.deletion_completion_indicator === 'DELETED';
    const isCompleted = poItem.delivery_completed_flag === 'Y' || poItem.deletion_completion_indicator === 'COMPLETED';
    const isClosedOrCancelled = poHeader.header_status === 'CLOSED' || poHeader.header_status === 'CANCELLED' || poHeader.status === 'CLOSED' || poHeader.status === 'CANCELLED';
    if (isDeleted || isCompleted || isClosedOrCancelled) return false;

    const key = `${s.po_number}_${s.item_number}_${s.delivery_date}`;
    const allocation = fifoAllocations.get(key);
    const openQty = allocation ? allocation.open_qty : calculateOpenQuantity(parseFloat(s.scheduled_qty || '0'), parseFloat(s.received_qty || '0'));
    return openQty > 0;
  }).length;

  // Overdue PO Lines: exception_worklist 'PO_OVERDUE' only
  const overdueWorklist = await fetchJoinedWorklist();
  const overduePoLines = overdueWorklist.filter(e => e.status !== 'RESOLVED').length;

  // Missing Acknowledgements: count acks with MISSING
  const ackWorklist = await fetchJoinedAcknowledgementWorklist();
  const missingAck = ackWorklist.filter(a => a.acknowledgement_status === 'MISSING').length;

  // ASN Delays: asn_shipments with status DELAYED, IN_TRANSIT, or past expected_delivery_date
  const today = new Date(TODAY_DATE);
  const asnDelays = asnRaw.filter(a => {
    const isIssueStatus = ['DELAYED', 'IN_TRANSIT', 'CUSTOMS_HOLD'].includes(a.status);
    const expected = a.expected_delivery_date ? new Date(a.expected_delivery_date) : null;
    const isLate = expected && expected < today;
    return isIssueStatus || isLate;
  }).length;

  // Unique Supplier, Material, Plant counts
  const suppliers = new Set(headersRaw.map(h => h.supplier_id));
  const materials = new Set(itemsRaw.map(i => i.material_id));
  const plants = new Set(itemsRaw.map(i => i.plant).filter(Boolean));

  // Open PO Value: schedule_lines with dynamic open_qty > 0 * net_price
  const openValue = schedulesRaw.reduce((sum, s) => {
    const key = `${s.po_number}_${s.item_number}_${s.delivery_date}`;
    const allocation = fifoAllocations.get(key);
    const openQty = allocation ? allocation.open_qty : calculateOpenQuantity(parseFloat(s.scheduled_qty || '0'), parseFloat(s.received_qty || '0'));
    const net = parseFloat(s.net_price || '0') || (itemsRaw.find(i => i.po_number === s.po_number && i.item_number === s.item_number)?.net_price || 0);
    return sum + (openQty * parseFloat(net || '0'));
  }, 0);

  // Group open quantities by material and plant for ATP calculation
  const openQtyByMaterialPlant = new Map<string, number>();
  for (const s of schedulesRaw) {
    const itemKey = `${s.po_number}_${s.item_number}`;
    const poItem = itemsRaw.find(i => i.po_number === s.po_number && i.item_number === s.item_number);
    if (poItem) {
      const matId = poItem.material_id;
      const plantId = poItem.plant || s.plant;
      const schedKey = `${s.po_number}_${s.item_number}_${s.delivery_date}`;
      const allocation = fifoAllocations.get(schedKey);
      const openQty = allocation ? allocation.open_qty : calculateOpenQuantity(parseFloat(s.scheduled_qty || '0'), parseFloat(s.received_qty || '0'));
      
      if (openQty > 0 && matId && plantId) {
        const stockKey = `${matId}_${plantId}`;
        openQtyByMaterialPlant.set(stockKey, (openQtyByMaterialPlant.get(stockKey) || 0) + openQty);
      }
    }
  }

  // Inventory at Risk: stock where projected ATP stock (onhand + open orders) < safety stock
  const mpRaw = await readCsv('material_plant.csv');
  const materialPlantSafety = new Map();
  for (const m of mpRaw) {
    if (m.material_id && m.plant && m.safety_stock) {
      materialPlantSafety.set(`${m.material_id}_${m.plant}`, parseFloat(m.safety_stock));
    }
  }
  let invAtRisk = 0;
  for (const stock of stockRaw) {
    const key = `${stock.material_id}_${stock.plant}`;
    const safety = materialPlantSafety.get(key) || 0;
    const onhand = parseFloat(stock.unrestricted_stock || '0');
    const openOrders = openQtyByMaterialPlant.get(key) || 0;
    
    // Projected Available Stock (ATP) = on-hand stock + open replenishment POs
    const projectedAvailable = onhand + openOrders;
    
    if (projectedAvailable < safety) {
      invAtRisk++;
    }
  }

  return {
    totalPoLines,
    openPoLines,
    overduePoLines,
    missingAck,
    asnDelays,
    suppliers: suppliers.size,
    materials: materials.size,
    plants: plants.size,
    openPoValue: Math.round(openValue * 100) / 100,
    inventoryAtRisk: invAtRisk
  };
}

// 6. GET DETAILED OVERVIEW (NEW FOR PHASE 1A CORRECTION)
export async function getDashboardOverviewDetails(): Promise<DashboardOverviewDetails> {
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

  const suppliersMap = new Map<string, string>();
  const supplierRiskMap = new Map<string, number>();
  for (const s of suppliersRaw) {
    suppliersMap.set(s.supplier_id, s.supplier_name);
    supplierRiskMap.set(s.supplier_id, parseFloat(s.risk_score || '0'));
  }

  const plantsMap = new Map<string, string>();
  for (const p of plantsRaw) {
    plantsMap.set(p.plant, p.plant_name);
  }

  // 1. Spend by Supplier aggregation
  const spendBySupplierGroup = new Map<string, number>();
  // 2. Spend by Plant aggregation
  const spendByPlantGroup = new Map<string, number>();
  // 3. Spend by Material Group (Commodity Category)
  const spendByMgGroup = new Map<string, number>();

  // Filter out cancelled headers
  const activeHeaders = headersRaw.filter(h => h.header_status !== 'CANCELLED');
  const activeHeaderMap = new Map<string, any>();
  for (const h of activeHeaders) {
    activeHeaderMap.set(h.po_number, h);
  }

  // Iterate over active PO items (not deleted) to aggregate spend
  const activeItems = itemsRaw.filter(i => i.deletion_flag !== 'Y');

  for (const item of activeItems) {
    const header = activeHeaderMap.get(item.po_number);
    if (!header) continue; // Skip if cancelled

    const supplierId = header.supplier_id || '';
    const plant = item.plant || '';
    const matGroup = item.item_category || 'STANDARD';

    const itemVal = parseFloat(item.item_value || '0') || (parseFloat(item.order_qty || '0') * parseFloat(item.net_price || '0'));

    if (supplierId) {
      spendBySupplierGroup.set(supplierId, (spendBySupplierGroup.get(supplierId) || 0) + itemVal);
    }
    if (plant) {
      spendByPlantGroup.set(plant, (spendByPlantGroup.get(plant) || 0) + itemVal);
    }
    spendByMgGroup.set(matGroup, (spendByMgGroup.get(matGroup) || 0) + itemVal);
  }

  const spendBySupplier = Array.from(spendBySupplierGroup.entries()).map(([id, val]) => ({
    id,
    name: suppliersMap.get(id) || id,
    value: Math.round(val * 100) / 100
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  const spendByPlant = Array.from(spendByPlantGroup.entries()).map(([code, val]) => ({
    code,
    name: plantsMap.get(code) || code,
    value: Math.round(val * 100) / 100
  })).sort((a, b) => b.value - a.value);

  const spendByMaterialGroup = Array.from(spendByMgGroup.entries()).map(([category, val]) => ({
    category,
    value: Math.round(val * 100) / 100
  })).sort((a, b) => b.value - a.value);

  // 4. Supplier Risk Distribution count Sourced Sourced
  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const s of suppliersRaw) {
    const risk = parseFloat(s.risk_score || '0');
    if (risk >= 60) {
      critical++;
    } else if (risk >= 40) {
      high++;
    } else if (risk >= 20) {
      medium++;
    } else {
      low++;
    }
  }

  // 5. Recent Activity Feed
  // Sort PO headers by date descending, grab top 5
  const sortedHeaders = [...headersRaw]
    .sort((a, b) => b.po_date.localeCompare(a.po_date))
    .slice(0, 5);

  const recentActivity = sortedHeaders.map(h => {
    // Count items and calculate open value
    const poItems = itemsRaw.filter(i => i.po_number === h.po_number);
    const itemNumbers = poItems.map(i => i.item_number);
    const poSchs = schedulesRaw.filter(s => s.po_number === h.po_number);
    
    let openVal = 0;
    if (poSchs.length > 0) {
      openVal = poSchs.reduce((sum, s) => sum + (calculateOpenQuantity(parseFloat(s.scheduled_qty || '0'), parseFloat(s.received_qty || '0')) * parseFloat(s.net_price || '0')), 0);
    } else {
      openVal = poItems.reduce((sum, i) => sum + parseFloat(i.net_value || '0'), 0);
    }

    return {
      po_number: h.po_number,
      po_date: h.po_date,
      supplier_name: suppliersMap.get(h.supplier_id) || h.supplier_id,
      items_count: poItems.length,
      open_value: Math.round(openVal * 100) / 100,
      release_status: h.release_status || 'RELEASED',
      header_status: h.header_status || 'OPEN'
    };
  });

  return {
    spendBySupplier,
    spendByPlant,
    spendByMaterialGroup,
    supplierRiskDistribution: { critical, high, medium, low },
    recentActivity
  };
}

export interface AcknowledgementWorklistItem {
  po_number: string;
  item_number: string;
  acknowledgement_status: string;
  acknowledged_qty: number;
  committed_delivery_date: string;
  supplier_confirm_number: string;
  last_supplier_response_date: string;
  response_source: string;
  buyer_followup_count: number;
  material_id: string;
  material_description: string;
  plant: string;
  plant_name: string;
  supplier_id: string;
  supplier_name: string;
  ordered_quantity: number;
  net_price: number;
  open_value: number;
  on_time_delivery_pct: number;
  risk_score: number;
  days_overdue: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  exception_id: string;
  priorityScore: number;
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AcknowledgementSummary {
  totalLines: number;
  acknowledgedCount: number;
  disputeCount: number;
  missingCount: number;
  disputedSpend: number;
  priceDisputes: number;
  qtyDisputes: number;
  latePromiseDisputes: number;
  rejections: number;
  completionRate: number;
}

// 1C: FETCH JOINED ACKNOWLEDGEMENT WORKLIST
async function fetchJoinedAcknowledgementWorklist(): Promise<AcknowledgementWorklistItem[]> {
  const [
    acksRaw,
    itemsRaw,
    headersRaw,
    suppliersRaw,
    plantsRaw,
    exceptionsRaw,
    schedulesRaw
  ] = await Promise.all([
    readCsv('supplier_acknowledgements.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('suppliers.csv'),
    readCsv('plants.csv'),
    readCsv('exception_worklist.csv'),
    readCsv('po_schedule_lines.csv')
  ]);

  const itemsMap = new Map<string, any>();
  for (const item of itemsRaw) {
    itemsMap.set(`${item.po_number}_${item.item_number}`, item);
  }

  const headersMap = new Map<string, any>();
  for (const h of headersRaw) {
    headersMap.set(h.po_number, h);
  }

  const suppliersMap = new Map<string, any>();
  for (const s of suppliersRaw) {
    suppliersMap.set(s.supplier_id, s);
  }

  const plantsMap = new Map<string, any>();
  for (const p of plantsRaw) {
    plantsMap.set(p.plant, p);
  }

  const exceptionsMap = new Map<string, any>();
  for (const ex of exceptionsRaw) {
    exceptionsMap.set(`${ex.po_number}_${ex.item_number}`, ex);
  }

  // Find all po_number + item_number keys that are in acksRaw
  const acksKeys = new Set<string>();
  for (const ack of acksRaw) {
    acksKeys.add(`${ack.po_number}_${ack.item_number}`);
  }

  // Unified list of raw acknowledgements (real + derived)
  const unifiedAcks = [...acksRaw];

  // For each schedule line with ZACK, if not in acksRaw, add a missing acknowledgement row
  for (const s of schedulesRaw) {
    if (s.confirmation_control_key === 'ZACK') {
      const paddedItem = padItemNumber(s.item_number);
      const key = `${s.po_number}_${paddedItem}`;
      if (!acksKeys.has(key)) {
        unifiedAcks.push({
          po_number: s.po_number,
          item_number: paddedItem,
          acknowledgement_status: 'MISSING',
          acknowledged_qty: '0',
          committed_delivery_date: '',
          supplier_confirm_number: '',
          last_supplier_response_date: '',
          response_source: '',
          buyer_followup_count: '0'
        });
        acksKeys.add(key);
      }
    }
  }

  const joinedList = unifiedAcks.map(ack => {
    const itemKey = `${ack.po_number}_${ack.item_number}`;
    const poItem = itemsMap.get(itemKey) || {};
    const poHeader = headersMap.get(ack.po_number) || {};
    const supplier = suppliersMap.get(poHeader.supplier_id || '') || {};
    const plantInfo = plantsMap.get(poItem.plant || '') || {};
    const exInfo = exceptionsMap.get(itemKey) || {};

    const ackStatus = ack.acknowledgement_status || 'MISSING';
    const orderedQty = parseFloat(poItem.order_qty || '0');
    const netPrice = parseFloat(poItem.net_price || '0');
    const openValue = orderedQty * netPrice;
    
    const daysOverdue = exInfo.days_past_due ? parseInt(exInfo.days_past_due, 10) : 0;
    const followups = parseInt(ack.buyer_followup_count || '0', 10);
    const exception_id = exInfo.exception_id || `EX_ACK_${ack.po_number}_${ack.item_number}`;

    // SME Severity Logic Rules
    let severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (ackStatus === 'REJECTED') {
      severity = 'CRITICAL';
    } else if (ackStatus === 'MISSING' && followups > 3) {
      severity = 'CRITICAL';
    } else if (['PRICE_DISPUTE', 'QTY_DISPUTE', 'PROMISED_LATE'].includes(ackStatus) && daysOverdue > 7) {
      severity = 'CRITICAL';
    } else if (ackStatus === 'MISSING') {
      severity = 'HIGH';
    } else if (['PRICE_DISPUTE', 'QTY_DISPUTE', 'PROMISED_LATE', 'PARTIAL'].includes(ackStatus)) {
      severity = 'MEDIUM';
    } else {
      severity = 'LOW';
    }

    // Phase 2B Priority score calculation
    let severityWeight = 0;
    if (severity === 'CRITICAL') severityWeight = 30;
    else if (severity === 'HIGH') severityWeight = 15;
    else if (severity === 'MEDIUM') severityWeight = 5;

    let valueWeight = 0;
    if (openValue > 50000) valueWeight = 20;
    else if (openValue > 10000) valueWeight = 10;
    else if (openValue > 1000) valueWeight = 5;

    const riskScoreVal = parseFloat(supplier.risk_score || '0');
    const priorityScore = Math.min(100, Math.round((followups * 5) + (riskScoreVal * 0.3) + severityWeight + valueWeight));

    let priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (priorityScore >= 75) priorityLevel = 'CRITICAL';
    else if (priorityScore >= 50) priorityLevel = 'HIGH';
    else if (priorityScore >= 25) priorityLevel = 'MEDIUM';

    return {
      po_number: ack.po_number,
      item_number: ack.item_number,
      acknowledgement_status: ackStatus,
      acknowledged_qty: parseFloat(ack.acknowledged_qty || '0'),
      committed_delivery_date: ack.committed_delivery_date || '',
      supplier_confirm_number: ack.supplier_confirm_number || '',
      last_supplier_response_date: ack.last_supplier_response_date || '',
      response_source: ack.response_source || '',
      buyer_followup_count: followups,
      material_id: poItem.material_id || '',
      material_description: poItem.material_description || 'Unknown Material',
      plant: poItem.plant || '',
      plant_name: plantInfo.plant_name || poItem.plant || '',
      supplier_id: poHeader.supplier_id || '',
      supplier_name: supplier.supplier_name || poHeader.supplier_id || '',
      ordered_quantity: orderedQty,
      net_price: netPrice,
      open_value: openValue,
      on_time_delivery_pct: parseFloat(supplier.on_time_delivery_pct || '0'),
      risk_score: parseFloat(supplier.risk_score || '0'),
      days_overdue: daysOverdue,
      severity,
      exception_id,
      priorityScore,
      priorityLevel
    };
  });

  return joinedList.filter(item => {
    const itemKey = `${item.po_number}_${item.item_number}`;
    const poItem = itemsMap.get(itemKey) || {};
    const poHeader = headersMap.get(item.po_number) || {};
    const isDeleted = poItem.deletion_flag === 'Y' || poItem.deletion_completion_indicator === 'DELETED';
    const isCompleted = poItem.delivery_completed_flag === 'Y' || poItem.deletion_completion_indicator === 'COMPLETED';
    const isClosedOrCancelled = poHeader.header_status === 'CLOSED' || poHeader.header_status === 'CANCELLED' || poHeader.status === 'CLOSED' || poHeader.status === 'CANCELLED';
    return !isDeleted && !isCompleted && !isClosedOrCancelled;
  });
}

// 1C: GET ACKNOWLEDGEMENT METRICS SUMMARY
export async function getAcknowledgementSummary(): Promise<AcknowledgementSummary> {
  const joined = await fetchJoinedAcknowledgementWorklist();
  
  const totalLines = joined.length;
  const acknowledgedCount = joined.filter(j => ['ACKNOWLEDGED', 'PARTIAL'].includes(j.acknowledgement_status)).length;
  
  const disputes = joined.filter(j => ['PRICE_DISPUTE', 'QTY_DISPUTE', 'PROMISED_LATE', 'REJECTED'].includes(j.acknowledgement_status));
  const disputeCount = disputes.length;
  const missingCount = joined.filter(j => j.acknowledgement_status === 'MISSING').length;
  
  const disputedSpend = disputes.reduce((sum, j) => sum + j.open_value, 0);

  const priceDisputes = joined.filter(j => j.acknowledgement_status === 'PRICE_DISPUTE').length;
  const qtyDisputes = joined.filter(j => j.acknowledgement_status === 'QTY_DISPUTE').length;
  const latePromiseDisputes = joined.filter(j => j.acknowledgement_status === 'PROMISED_LATE').length;
  const rejections = joined.filter(j => j.acknowledgement_status === 'REJECTED').length;

  const completionRate = totalLines > 0 ? Math.round((acknowledgedCount / totalLines) * 1000) / 10 : 0;

  return {
    totalLines,
    acknowledgedCount,
    disputeCount,
    missingCount,
    disputedSpend: Math.round(disputedSpend * 100) / 100,
    priceDisputes,
    qtyDisputes,
    latePromiseDisputes,
    rejections,
    completionRate
  };
}

// 1C: GET ACKNOWLEDGEMENT WORKLIST
export async function getAcknowledgementWorklist(filters: {
  plant?: string;
  supplier?: string;
  purchasingGroup?: string;
  acknowledgementStatus?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
}): Promise<{ data: AcknowledgementWorklistItem[]; total: number; filteredSummary: FilteredSummary }> {
  let list = await fetchJoinedAcknowledgementWorklist();

  if (filters.plant) {
    list = list.filter(item => item.plant === filters.plant);
  }
  if (filters.supplier) {
    list = list.filter(item => item.supplier_id === filters.supplier || item.supplier_name.toLowerCase().includes(filters.supplier!.toLowerCase()));
  }
  if (filters.acknowledgementStatus) {
    if (filters.acknowledgementStatus === 'DISPUTES') {
      list = list.filter(item => ['PRICE_DISPUTE', 'QTY_DISPUTE', 'PROMISED_LATE', 'REJECTED'].includes(item.acknowledgement_status));
    } else {
      list = list.filter(item => item.acknowledgement_status === filters.acknowledgementStatus);
    }
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(item => 
      item.po_number.toLowerCase().includes(s) ||
      item.material_id.toLowerCase().includes(s) ||
      item.material_description.toLowerCase().includes(s)
    );
  }

  const total = list.length;

  // Apply sorting: priority score descending or default (critical first + followups)
  if (filters.sortBy === 'priority') {
    list.sort((a, b) => b.priorityScore - a.priorityScore || b.days_overdue - a.days_overdue || a.po_number.localeCompare(b.po_number));
  } else {
    list.sort((a, b) => {
      const aCrit = a.severity === 'CRITICAL' ? 1 : 0;
      const bCrit = b.severity === 'CRITICAL' ? 1 : 0;
      return bCrit - aCrit || b.buyer_followup_count - a.buyer_followup_count || a.po_number.localeCompare(b.po_number);
    });
  }

  const offset = filters.offset || 0;
  const limit = filters.limit || 50;
  const paginatedData = list.slice(offset, offset + limit);

  const filteredSummary = {
    totalLines: total,
    totalValue: Math.round(list.reduce((sum, item) => sum + item.open_value, 0) * 100) / 100,
    totalQty: list.reduce((sum, item) => sum + item.ordered_quantity, 0),
    criticalLines: list.filter(w => w.severity === 'CRITICAL').length,
    averageDays: list.length > 0 ? Math.round(list.reduce((sum, item) => sum + item.days_overdue, 0) / list.length * 10) / 10 : 0
  };

  return {
    data: paginatedData,
    total,
    filteredSummary
  };
}

export interface PartAvailabilityItem {
  snapshot_id: string;
  snapshot_date: string;
  material_id: string;
  material_name: string;
  plant: string;
  demand_qty: number;
  available_stock_qty: number;
  open_po_qty: number;
  shortage_qty: number;
  ctb_pct: number;
  risk_bucket: 'RED' | 'YELLOW';
  time_horizon_days: number;
  safety_stock: number;
  unrestricted_stock: number;
  safety_stock_violation: boolean;
}

export interface PartSummary {
  totalParts: number;
  shortageCount: number;
  safetyStockViolations: number;
  averageCtb: number;
}

export interface MrpTimelineElement {
  mrp_element_id: string;
  mrp_element_type: 'POITEM' | 'RESERVATION';
  mrp_element_ref: string;
  requirement_date: string;
  receipt_qty: number;
  requirement_qty: number;
  projected_qty: number;
}

async function fetchJoinedPartAvailability(): Promise<PartAvailabilityItem[]> {
  const [
    ctbRaw,
    stockRaw,
    mpRaw,
    materialsRaw
  ] = await Promise.all([
    readCsv('ctb_snapshots.csv'),
    readCsv('inventory_stock.csv'),
    readCsv('material_plant.csv'),
    readCsv('materials.csv')
  ]);

  const stockMap = new Map<string, number>();
  for (const s of stockRaw) {
    stockMap.set(`${s.material_id}_${s.plant}`, parseInt(s.unrestricted_stock || '0', 10));
  }

  const mpMap = new Map<string, any>();
  for (const mp of mpRaw) {
    mpMap.set(`${mp.material_id}_${mp.plant}`, mp);
  }

  const matMap = new Map<string, string>();
  for (const m of materialsRaw) {
    matMap.set(m.material_id, m.material_name);
  }

  return ctbRaw.map(ctb => {
    const key = `${ctb.material_id}_${ctb.plant}`;
    const unrestricted = stockMap.get(key) || 0;
    const mp = mpMap.get(key) || {};
    const safetyStock = parseInt(mp.safety_stock || '0', 10);
    const materialName = matMap.get(ctb.material_id) || 'Unknown Material';

    const shortage = parseFloat(ctb.shortage_qty || '0');
    const ctbPct = parseFloat(ctb.ctb_pct || '0');
    const horizon = parseInt(ctb.time_horizon_days || '0', 10);

    const safetyViolation = unrestricted < safetyStock;

    return {
      snapshot_id: ctb.snapshot_id,
      snapshot_date: ctb.snapshot_date || '',
      material_id: ctb.material_id,
      material_name: materialName,
      plant: ctb.plant,
      demand_qty: parseFloat(ctb.demand_qty || '0'),
      available_stock_qty: parseFloat(ctb.available_stock_qty || '0'),
      open_po_qty: parseFloat(ctb.open_po_qty || '0'),
      shortage_qty: shortage,
      ctb_pct: ctbPct,
      risk_bucket: ctb.risk_bucket as any || (shortage > 0 ? 'RED' : 'YELLOW'),
      time_horizon_days: horizon,
      safety_stock: safetyStock,
      unrestricted_stock: unrestricted,
      safety_stock_violation: safetyViolation
    };
  });
}

export async function getPartSummary(): Promise<PartSummary> {
  const joined = await fetchJoinedPartAvailability();
  
  const totalParts = joined.length;
  const shortageCount = joined.filter(j => j.shortage_qty > 0).length;
  const safetyStockViolations = joined.filter(j => j.safety_stock_violation).length;
  
  const averageCtb = totalParts > 0
    ? joined.reduce((sum, j) => sum + j.ctb_pct, 0) / totalParts
    : 0;

  return {
    totalParts,
    shortageCount,
    safetyStockViolations,
    averageCtb: Math.round(averageCtb * 10) / 10
  };
}

export async function getPartWorklist(filters: {
  plant?: string;
  riskBucket?: string;
  horizon?: number;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: PartAvailabilityItem[]; total: number; filteredSummary: any }> {
  let list = await fetchJoinedPartAvailability();

  if (filters.plant) {
    list = list.filter(item => item.plant === filters.plant);
  }
  if (filters.riskBucket) {
    list = list.filter(item => item.risk_bucket === filters.riskBucket);
  }
  if (filters.horizon) {
    list = list.filter(item => item.time_horizon_days === filters.horizon);
  }
  if (filters.search) {
    const s = filters.search.toLowerCase();
    list = list.filter(item => 
      item.material_id.toLowerCase().includes(s) ||
      item.material_name.toLowerCase().includes(s)
    );
  }

  const total = list.length;

  list.sort((a, b) => {
    const aRed = a.risk_bucket === 'RED' ? 1 : 0;
    const bRed = b.risk_bucket === 'RED' ? 1 : 0;
    return bRed - aRed || a.ctb_pct - b.ctb_pct || a.material_id.localeCompare(b.material_id);
  });

  const offset = filters.offset || 0;
  const limit = filters.limit || 50;
  const paginatedData = list.slice(offset, offset + limit);

  const filteredSummary = {
    totalLines: total,
    totalValue: Math.round(list.reduce((sum, item) => sum + item.demand_qty, 0)),
    totalQty: Math.round(list.reduce((sum, item) => sum + item.open_po_qty, 0)),
    criticalLines: list.filter(w => w.risk_bucket === 'RED').length,
    averageDays: list.length > 0 ? Math.round(list.reduce((sum, item) => sum + item.ctb_pct, 0) / list.length * 10) / 10 : 0
  };

  return {
    data: paginatedData,
    total,
    filteredSummary
  };
}

export async function getPartMrpTimeline(
  materialId: string,
  plant: string
): Promise<{
  currentStock: number;
  safetyStock: number;
  materialName: string;
  plantName: string;
  timeline: MrpTimelineElement[];
}> {
  const [
    stockRaw,
    mpRaw,
    materialsRaw,
    mrpRaw,
    plantsRaw
  ] = await Promise.all([
    readCsv('inventory_stock.csv'),
    readCsv('material_plant.csv'),
    readCsv('materials.csv'),
    readCsv('mrp_elements.csv'),
    readCsv('plants.csv')
  ]);

  const stock = stockRaw.find(s => s.material_id === materialId && s.plant === plant);
  const currentStock = stock ? parseInt(stock.unrestricted_stock || '0', 10) : 0;

  const mp = mpRaw.find(m => m.material_id === materialId && m.plant === plant);
  const safetyStock = mp ? parseInt(mp.safety_stock || '0', 10) : 0;

  const mat = materialsRaw.find(m => m.material_id === materialId);
  const materialName = mat ? mat.material_name : 'Unknown Material';

  const pl = plantsRaw.find(p => p.plant === plant);
  const plantName = pl ? pl.plant_name : plant;

  const elements = mrpRaw.filter(m => m.material_id === materialId && m.plant === plant);

  const parsedElements = elements.map(el => {
    const type = el.mrp_element_type || 'POITEM';
    const rx = parseFloat(el.receipt_qty || '0');
    const req = parseFloat(el.requirement_qty || '0');
    return {
      mrp_element_id: el.mrp_element_id,
      mrp_element_type: type as any,
      mrp_element_ref: el.mrp_element_ref || '',
      requirement_date: el.requirement_date || '',
      receipt_qty: rx,
      requirement_qty: req,
      projected_qty: 0
    };
  });

  parsedElements.sort((a, b) => a.requirement_date.localeCompare(b.requirement_date));

  let runningStock = currentStock;
  for (const el of parsedElements) {
    runningStock += el.receipt_qty - el.requirement_qty;
    el.projected_qty = runningStock;
  }

  return {
    currentStock,
    safetyStock,
    materialName,
    plantName,
    timeline: parsedElements
  };
}

// ==========================================
// PHASE 2: GUIDED ACTIONS RECOMMENDATIONS SERVICES
// ==========================================

export interface AgentRecommendation {
  recommendation_id: string;
  exception_id: string;
  agent_name: string;
  confidence_score: number;
  recommended_action: string;
  draft_subject: string;
  draft_message: string;
  approval_status: 'PENDING' | 'APPROVED' | 'SENT' | 'REJECTED';
  created_on: string;
}

let recommendationsCache: Map<string, AgentRecommendation> | null = null;
const RECOMMENDATION_UPDATES_FILE = path.join(process.cwd(), 'project_memory', 'recommendation_updates.json');

function saveRecommendationUpdates(): void {
  try {
    if (!recommendationsCache) return;
    const updates: Record<string, Partial<AgentRecommendation>> = {};
    for (const r of recommendationsCache.values()) {
      updates[r.recommendation_id] = {
        approval_status: r.approval_status,
        draft_subject: r.draft_subject,
        draft_message: r.draft_message
      };
    }
    fs.mkdirSync(path.dirname(RECOMMENDATION_UPDATES_FILE), { recursive: true });
    fs.writeFileSync(RECOMMENDATION_UPDATES_FILE, JSON.stringify(updates, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save recommendation updates:', e);
  }
}

async function initRecommendations() {
  if (recommendationsCache) return;
  recommendationsCache = new Map();
  const raw = await readCsv('agent_recommendations.csv');
  
  let updates: Record<string, any> = {};
  try {
    if (fs.existsSync(RECOMMENDATION_UPDATES_FILE)) {
      const rawUpdates = fs.readFileSync(RECOMMENDATION_UPDATES_FILE, 'utf-8');
      updates = JSON.parse(rawUpdates);
    }
  } catch (e) {
    console.warn('Failed to load recommendation updates:', e);
  }

  for (const r of raw) {
    const update = updates[r.recommendation_id] || updates[r.exception_id] || {};
    recommendationsCache.set(r.exception_id, {
      recommendation_id: r.recommendation_id,
      exception_id: r.exception_id,
      agent_name: r.agent_name,
      confidence_score: parseFloat(r.confidence_score || '0'),
      recommended_action: r.recommended_action,
      draft_subject: update.draft_subject !== undefined ? update.draft_subject : r.draft_subject,
      draft_message: update.draft_message !== undefined ? update.draft_message : r.draft_message,
      approval_status: (update.approval_status as any) || (r.approval_status as any) || 'PENDING',
      created_on: r.created_on
    });
  }
}

export async function getRecommendationByException(
  exceptionId: string,
  poNumber: string,
  itemNumber: string,
  agentName: 'PO_OVERDUE_AGENT' | 'SUPPLIER_ACK_AGENT' | 'PART_AVAILABILITY_AGENT'
): Promise<AgentRecommendation> {
  await initRecommendations();
  
  if (exceptionId && recommendationsCache!.has(exceptionId)) {
    return recommendationsCache!.get(exceptionId)!;
  }
  
  // Dynamic fallback recommendation generator if no pre-computed recommendation exists
  const fallbackId = `AR_FB_${poNumber}_${itemNumber}`;
  const acksRaw = await readCsv('supplier_acknowledgements.csv');
  const ack = acksRaw.find(a => a.po_number === poNumber && a.item_number === itemNumber);

  let action = agentName === 'PO_OVERDUE_AGENT'
    ? 'Send immediate PO expedite request and verify supplier recovery plan.'
    : agentName === 'SUPPLIER_ACK_AGENT'
    ? 'Request supplier confirmation and escalate acknowledgement missing status.'
    : 'Review material sourcing and expedite alternative vendor lines.';
    
  let subject = `Action required: ${agentName.replace('_AGENT', '')} for PO ${poNumber}`;
  let message = `Hello, please provide an update for PO ${poNumber} item ${itemNumber || '00010'}. This line is currently flagged as critical in our Procurement Control Tower. Action: ${action}`;

  if (ack && ack.acknowledgement_status && ack.acknowledgement_status !== 'MISSING') {
    const committedDate = ack.committed_delivery_date || '';
    action = `Expedite the confirmed date ${committedDate} and verify supplier recovery plan.`;
    subject = `Action required: Expedite PO ${poNumber} item ${itemNumber}`;
    message = `Hello, we have received your acknowledgement for PO ${poNumber} item ${itemNumber || '00010'} with a committed delivery date of ${committedDate}. However, this date is currently late or overdue. Please expedite shipment and provide tracking confirmation.`;
  }

  const generated: AgentRecommendation = {
    recommendation_id: fallbackId,
    exception_id: exceptionId || `EX_FB_${poNumber}_${itemNumber}`,
    agent_name: agentName,
    confidence_score: 0.75,
    recommended_action: action,
    draft_subject: subject,
    draft_message: message,
    approval_status: 'PENDING',
    created_on: TODAY_DATE
  };
  
  // Save in cache
  if (exceptionId) {
    recommendationsCache!.set(exceptionId, generated);
  }
  return generated;
}

export async function updateRecommendationStatus(
  recommendationId: string,
  status: 'PENDING' | 'APPROVED' | 'SENT' | 'REJECTED',
  subject?: string,
  message?: string
): Promise<boolean> {
  await initRecommendations();
  
  // Find recommendation by ID or exception_id
  let target: AgentRecommendation | undefined = undefined;
  for (const r of recommendationsCache!.values()) {
    if (r.recommendation_id === recommendationId || r.exception_id === recommendationId) {
      target = r;
      break;
    }
  }
  
  if (target) {
    target.approval_status = status;
    if (subject !== undefined) target.draft_subject = subject;
    if (message !== undefined) target.draft_message = message;
    saveRecommendationUpdates();
    return true;
  }
  return false;
}

// ==========================================
// Phase 2C – Supplier Performance Analytics Interfaces
// ==========================================
export interface SupplierPerformanceItem {
  supplier_id: string;
  supplier_name: string;
  supplier_tier: string;
  country: string;
  payment_terms: string;
  incoterms: string;
  risk_score: number;
  avg_response_days: number;
  on_time_delivery_pct: number;
  quality_ppm: number;
  blocked_flag: string;
  total_pos: number;
  open_spend: number;
  active_exceptions_count: number;
}

export interface SupplierPerformanceDetail extends SupplierPerformanceItem {
  active_exceptions: any[];
  active_pos: any[];
}

export async function getSupplierPerformanceList(filters: {
  search?: string;
  tier?: string;
  riskLevel?: string;
  blocked?: string;
  sortBy?: string;
}): Promise<SupplierPerformanceItem[]> {
  const [
    suppliersRaw,
    poHeadersRaw,
    poItemsRaw,
    scheduleLinesRaw,
    exceptionsRaw,
    qualityInspectionsRaw,
    goodsReceiptsRaw
  ] = await Promise.all([
    readCsv('suppliers.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('po_schedule_lines.csv'),
    readCsv('exception_worklist.csv'),
    readCsv('quality_inspections.csv'),
    readCsv('goods_receipts.csv')
  ]);

  // Index PO headers by PO number to supplier_id
  const supplierByPo = new Map<string, string>();
  const posBySupplier = new Map<string, string[]>();
  for (const h of poHeadersRaw) {
    if (h.po_number && h.supplier_id) {
      supplierByPo.set(h.po_number, h.supplier_id);
      if (h.status !== 'CANCELLED') {
        if (!posBySupplier.has(h.supplier_id)) {
          posBySupplier.set(h.supplier_id, []);
        }
        posBySupplier.get(h.supplier_id)!.push(h.po_number);
      }
    }
  }

  // Calculate Quality PPM per supplier
  const supplierInspections = new Map<string, { inspected: number; rejected: number }>();
  for (const qi of qualityInspectionsRaw) {
    const supplierId = supplierByPo.get(qi.po_number);
    if (supplierId) {
      if (!supplierInspections.has(supplierId)) {
        supplierInspections.set(supplierId, { inspected: 0, rejected: 0 });
      }
      const stats = supplierInspections.get(supplierId)!;
      const lotQty = parseFloat(qi.lot_qty || '0');
      
      if (qi.usage_decision === 'ACCEPTED' || qi.usage_decision === 'REJECTED') {
        stats.inspected += lotQty;
      }
      if (qi.usage_decision === 'REJECTED') {
        stats.rejected += lotQty;
      }
    }
  }

  // Calculate OTD per supplier
  const supplierOtd = new Map<string, { totalReceived: number; onTimeReceived: number }>();
  const scheduleDueMap = new Map<string, string>();
  for (const s of scheduleLinesRaw) {
    const key = `${s.po_number}_${s.item_number}`;
    scheduleDueMap.set(key, s.delivery_date);
  }

  for (const gr of goodsReceiptsRaw) {
    const supplierId = supplierByPo.get(gr.po_number);
    if (supplierId) {
      if (!supplierOtd.has(supplierId)) {
        supplierOtd.set(supplierId, { totalReceived: 0, onTimeReceived: 0 });
      }
      const stats = supplierOtd.get(supplierId)!;
      const recQty = parseFloat(gr.received_qty || '0');
      const dueDate = scheduleDueMap.get(`${gr.po_number}_${gr.item_number}`);
      
      stats.totalReceived += recQty;
      if (dueDate && gr.posting_date && gr.posting_date <= dueDate) {
        stats.onTimeReceived += recQty;
      }
    }
  }

  // PO items catalog
  const poItemsMap = new Map<string, any>();
  for (const item of poItemsRaw) {
    poItemsMap.set(`${item.po_number}_${item.item_number}`, item);
  }

  // Active open schedule lines spend
  const openSpendByPo = new Map<string, number>();
  for (const line of scheduleLinesRaw) {
    const openQty = calculateOpenQuantity(parseFloat(line.scheduled_qty || '0'), parseFloat(line.received_qty || '0'));
    if (openQty > 0) {
      const itemKey = `${line.po_number}_${line.item_number}`;
      const poItem = poItemsMap.get(itemKey);
      if (poItem) {
        const netPrice = parseFloat(poItem.net_price || '0');
        const openVal = openQty * netPrice;
        openSpendByPo.set(line.po_number, (openSpendByPo.get(line.po_number) || 0) + openVal);
      }
    }
  }

  // Active exception occurrences count
  const exceptionsBySupplier = new Map<string, number>();
  for (const ex of exceptionsRaw) {
    if (ex.status !== 'RESOLVED' && ex.supplier_id) {
      exceptionsBySupplier.set(ex.supplier_id, (exceptionsBySupplier.get(ex.supplier_id) || 0) + 1);
    }
  }

  // Map to supplier analytics profile
  let list: SupplierPerformanceItem[] = suppliersRaw.map(s => {
    const supplierId = s.supplier_id;
    const supplierPOs = posBySupplier.get(supplierId) || [];
    const totalPos = supplierPOs.length;
    
    let openSpend = 0;
    for (const po of supplierPOs) {
      openSpend += openSpendByPo.get(po) || 0;
    }

    const activeExceptionsCount = exceptionsBySupplier.get(supplierId) || 0;

    // Calculate OTD % dynamically, fallback to static master data
    const otdStats = supplierOtd.get(supplierId);
    const dynamicOtd = otdStats && otdStats.totalReceived > 0
      ? (otdStats.onTimeReceived / otdStats.totalReceived) * 100
      : parseFloat(s.on_time_delivery_pct || '0');

    // Calculate Quality PPM dynamically, fallback to static master data
    const ppmStats = supplierInspections.get(supplierId);
    const dynamicPpm = ppmStats && ppmStats.inspected > 0
      ? (ppmStats.rejected / ppmStats.inspected) * 1000000
      : parseFloat(s.quality_ppm || '0');

    return {
      supplier_id: supplierId,
      supplier_name: s.supplier_name || 'Unknown Supplier',
      supplier_tier: s.supplier_tier || 'Tier 3',
      country: s.country || 'Global',
      payment_terms: s.payment_terms || 'Net 30',
      incoterms: s.incoterms || 'EXW',
      risk_score: parseFloat(s.risk_score || '0'),
      avg_response_days: parseFloat(s.avg_response_days || '0'),
      on_time_delivery_pct: Math.round(dynamicOtd * 10) / 10,
      quality_ppm: Math.round(dynamicPpm),
      blocked_flag: s.blocked_flag || 'N',
      total_pos: totalPos,
      open_spend: Math.round(openSpend),
      active_exceptions_count: activeExceptionsCount
    };
  });

  // Apply query filters
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(item => 
      item.supplier_name.toLowerCase().includes(q) || 
      item.supplier_id.toLowerCase().includes(q) ||
      item.country.toLowerCase().includes(q)
    );
  }

  if (filters.tier) {
    list = list.filter(item => item.supplier_tier === filters.tier);
  }

  if (filters.riskLevel) {
    list = list.filter(item => {
      const score = item.risk_score;
      if (filters.riskLevel === 'CRITICAL') return score >= 75;
      if (filters.riskLevel === 'HIGH') return score >= 50 && score < 75;
      if (filters.riskLevel === 'MEDIUM') return score >= 25 && score < 50;
      if (filters.riskLevel === 'LOW') return score < 25;
      return true;
    });
  }

  if (filters.blocked) {
    list = list.filter(item => item.blocked_flag === filters.blocked);
  }

  // Handle analytical sorting
  if (filters.sortBy === 'otd') {
    list.sort((a, b) => b.on_time_delivery_pct - a.on_time_delivery_pct || a.supplier_name.localeCompare(b.supplier_name));
  } else if (filters.sortBy === 'risk') {
    list.sort((a, b) => b.risk_score - a.risk_score || a.supplier_name.localeCompare(b.supplier_name));
  } else if (filters.sortBy === 'spend') {
    list.sort((a, b) => b.open_spend - a.open_spend || a.supplier_name.localeCompare(b.supplier_name));
  } else if (filters.sortBy === 'ppm') {
    list.sort((a, b) => b.quality_ppm - a.quality_ppm || a.supplier_name.localeCompare(b.supplier_name));
  } else {
    list.sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
  }

  return list;
}

export async function getSupplierPerformanceDetail(supplierId: string): Promise<SupplierPerformanceDetail | null> {
  const list = await getSupplierPerformanceList({});
  const base = list.find(s => s.supplier_id === supplierId);
  if (!base) return null;

  const [
    exceptionsRaw,
    poHeadersRaw,
    poItemsRaw,
  ] = await Promise.all([
    readCsv('exception_worklist.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv'),
  ]);

  const activeExceptions = exceptionsRaw
    .filter(ex => ex.supplier_id === supplierId && ex.status !== 'RESOLVED')
    .map(ex => {
      const poItem = poItemsRaw.find(i => i.po_number === ex.po_number && i.item_number === ex.item_number) || {};
      return {
        exception_id: ex.exception_id,
        exception_type: ex.exception_type,
        severity: ex.severity,
        status: ex.status,
        po_number: ex.po_number,
        item_number: ex.item_number,
        material_id: ex.material_id,
        material_description: poItem.material_description || 'Unknown Material',
        plant: ex.plant,
        days_overdue: parseFloat(ex.days_overdue || '0'),
        due_date: ex.due_date
      };
    });

  const activePOs = poHeadersRaw
    .filter(h => h.supplier_id === supplierId && h.status !== 'CANCELLED')
    .map(h => {
      return {
        po_number: h.po_number,
        po_date: h.po_date,
        status: h.status,
        company_code: h.company_code,
        purchasing_org: h.purchasing_org,
        purchasing_group: h.purchasing_group,
        currency: h.currency
      };
    });

  return {
    ...base,
    active_exceptions: activeExceptions,
    active_pos: activePOs
  };
}

// ==========================================
// Phase 2D – Exception Analytics
// ==========================================

export interface ExceptionTypeBreakdown {
  type: string;
  count: number;
  financial_impact: number;
  pct: number;
}

export interface ExceptionStatusBreakdown {
  status: string;
  count: number;
  pct: number;
}

export interface ExceptionSeverityBreakdown {
  severity: string;
  count: number;
  pct: number;
}

export interface ExceptionBuyerBreakdown {
  buyer: string;
  total: number;
  resolved: number;
  pending: number;
  financial_impact: number;
}

export interface ExceptionPlantBreakdown {
  plant: string;
  count: number;
  financial_impact: number;
}

export interface ExceptionAgingBucket {
  bucket: string;
  count: number;
  pct: number;
}

export interface ExceptionWeeklyTrend {
  week: string;   // ISO week label e.g. "2026-W18"
  count: number;
}

export interface ExceptionAnalytics {
  totalExceptions: number;
  resolvedCount: number;
  resolutionRate: number;
  totalFinancialImpact: number;
  avgDaysPastDue: number;
  highSeverityCount: number;
  byType: ExceptionTypeBreakdown[];
  bySeverity: ExceptionSeverityBreakdown[];
  byStatus: ExceptionStatusBreakdown[];
  byBuyer: ExceptionBuyerBreakdown[];
  byPlant: ExceptionPlantBreakdown[];
  agingBuckets: ExceptionAgingBucket[];
  trendByWeek: ExceptionWeeklyTrend[];
}

export async function getExceptionAnalytics(): Promise<ExceptionAnalytics> {
  const exceptionsRaw = await readCsv('exception_worklist.csv');

  const total = exceptionsRaw.length;
  const resolvedCount = exceptionsRaw.filter(e => e.status === 'RESOLVED').length;
  const resolutionRate = total > 0 ? Math.round((resolvedCount / total) * 1000) / 10 : 0;
  const totalFinancialImpact = exceptionsRaw.reduce((s, e) => s + parseFloat(e.financial_impact_estimate || '0'), 0);
  const highSeverityCount = exceptionsRaw.filter(e => e.severity === 'HIGH' || e.severity === 'CRITICAL').length;

  // Avg days past due (non-zero only)
  const withDays = exceptionsRaw.filter(e => parseFloat(e.days_past_due || '0') > 0);
  const avgDaysPastDue = withDays.length > 0
    ? Math.round(withDays.reduce((s, e) => s + parseFloat(e.days_past_due || '0'), 0) / withDays.length * 10) / 10
    : 0;

  // ---- By Type ----
  const typeMap = new Map<string, { count: number; financial_impact: number }>();
  for (const e of exceptionsRaw) {
    const t = e.exception_type || 'UNKNOWN';
    const cur = typeMap.get(t) || { count: 0, financial_impact: 0 };
    cur.count++;
    cur.financial_impact += parseFloat(e.financial_impact_estimate || '0');
    typeMap.set(t, cur);
  }
  const byType: ExceptionTypeBreakdown[] = Array.from(typeMap.entries())
    .map(([type, v]) => ({
      type,
      count: v.count,
      financial_impact: Math.round(v.financial_impact),
      pct: total > 0 ? Math.round((v.count / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count);

  // ---- By Severity ----
  const sevMap = new Map<string, number>();
  for (const e of exceptionsRaw) {
    const s = e.severity || 'UNKNOWN';
    sevMap.set(s, (sevMap.get(s) || 0) + 1);
  }
  const bySeverity: ExceptionSeverityBreakdown[] = Array.from(sevMap.entries())
    .map(([severity, count]) => ({
      severity,
      count,
      pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.count - a.count);

  // ---- By Status ----
  const ORDER = ['NEW', 'IN_REVIEW', 'ACTION_DRAFTED', 'RESOLVED'];
  const statusMap = new Map<string, number>();
  for (const e of exceptionsRaw) {
    const s = e.status || 'UNKNOWN';
    statusMap.set(s, (statusMap.get(s) || 0) + 1);
  }
  const byStatus: ExceptionStatusBreakdown[] = ORDER
    .filter(s => statusMap.has(s))
    .map(status => ({
      status,
      count: statusMap.get(status) || 0,
      pct: total > 0 ? Math.round(((statusMap.get(status) || 0) / total) * 1000) / 10 : 0
    }));

  // ---- By Buyer ----
  const buyerMap = new Map<string, { total: number; resolved: number; financial_impact: number }>();
  for (const e of exceptionsRaw) {
    const b = e.assigned_buyer || 'UNASSIGNED';
    const cur = buyerMap.get(b) || { total: 0, resolved: 0, financial_impact: 0 };
    cur.total++;
    if (e.status === 'RESOLVED') cur.resolved++;
    cur.financial_impact += parseFloat(e.financial_impact_estimate || '0');
    buyerMap.set(b, cur);
  }
  const byBuyer: ExceptionBuyerBreakdown[] = Array.from(buyerMap.entries())
    .map(([buyer, v]) => ({
      buyer,
      total: v.total,
      resolved: v.resolved,
      pending: v.total - v.resolved,
      financial_impact: Math.round(v.financial_impact)
    }))
    .sort((a, b) => b.total - a.total);

  // ---- By Plant ----
  const plantMap = new Map<string, { count: number; financial_impact: number }>();
  for (const e of exceptionsRaw) {
    const p = e.plant || 'UNKNOWN';
    const cur = plantMap.get(p) || { count: 0, financial_impact: 0 };
    cur.count++;
    cur.financial_impact += parseFloat(e.financial_impact_estimate || '0');
    plantMap.set(p, cur);
  }
  const byPlant: ExceptionPlantBreakdown[] = Array.from(plantMap.entries())
    .map(([plant, v]) => ({
      plant,
      count: v.count,
      financial_impact: Math.round(v.financial_impact)
    }))
    .sort((a, b) => b.count - a.count);

  // ---- Aging Buckets ----
  const BUCKETS = [
    { label: '0–3 days', min: 0, max: 3 },
    { label: '4–7 days', min: 4, max: 7 },
    { label: '8–14 days', min: 8, max: 14 },
    { label: '15–30 days', min: 15, max: 30 },
    { label: '30+ days', min: 31, max: Infinity },
  ];
  const agingBuckets: ExceptionAgingBucket[] = BUCKETS.map(b => {
    const count = exceptionsRaw.filter(e => {
      const d = parseFloat(e.days_past_due || '0');
      return d >= b.min && d <= b.max;
    }).length;
    return { bucket: b.label, count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
  });

  // ---- 8-Week Trend ----
  // Get ISO week string for a date
  function getIsoWeek(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  // Collect all week keys from detected_on, take last 8 unique weeks
  const weekCountMap = new Map<string, number>();
  for (const e of exceptionsRaw) {
    const wk = getIsoWeek(e.detected_on);
    if (wk) {
      weekCountMap.set(wk, (weekCountMap.get(wk) || 0) + 1);
    }
  }
  const sortedWeeks = Array.from(weekCountMap.entries())
    .sort(([a], [b]) => a.localeCompare(b));
  const last8 = sortedWeeks.slice(-8);
  const trendByWeek: ExceptionWeeklyTrend[] = last8.map(([week, count]) => ({ week, count }));

  return {
    totalExceptions: total,
    resolvedCount,
    resolutionRate,
    totalFinancialImpact: Math.round(totalFinancialImpact),
    avgDaysPastDue,
    highSeverityCount,
    byType,
    bySeverity,
    byStatus,
    byBuyer,
    byPlant,
    agingBuckets,
    trendByWeek
  };
}


// ==========================================
// Phase 2E – Buyer Productivity Workbench
// ==========================================

export interface BuyerProductivitySummary {
  buyer: string;
  totalAssigned: number;
  openCount: number;
  resolvedCount: number;
  pendingCount: number;
  inReviewCount: number;
  actionDraftedCount: number;
  resolutionRate: number;
  avgDaysPastDue: number;
  totalFinancialExposure: number;
  totalFollowUpsSent: number;
  overdueTaskCount: number;
  criticalCount: number;
  highCount: number;
  suppliersManaged: number;
  lastActionDate: string;
}

export interface BuyerWorkloadItem {
  exception_id: string;
  exception_type: string;
  po_number: string;
  item_number: string;
  supplier_id: string;
  supplier_name: string;
  plant: string;
  status: string;
  severity: string;
  days_past_due: number;
  financial_impact: number;
  detected_on: string;
  due_date: string;
  root_cause: string;
  assigned_buyer: string;
  agingBucket: string;
  priorityScore: number;
}

export interface BuyerActionHistoryItem {
  exception_id: string;
  exception_type: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
  plant: string;
  resolved_on: string;
  days_to_resolve: number;
  financial_impact: number;
  severity: string;
  assigned_buyer: string;
}

export interface BuyerFollowUpStatus {
  supplier_id: string;
  supplier_name: string;
  openExceptions: number;
  totalFollowUpsSent: number;
  lastFollowUpDate: string;
  acknowledgementStatus: string;
  urgency: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface BuyerAgingBreakdown {
  bucket: string;
  count: number;
  pct: number;
}

export interface BuyerProductivityData {
  buyers: string[];
  summary: BuyerProductivitySummary[];
  workload: BuyerWorkloadItem[];
  workloadTotal: number;
  actionHistory: BuyerActionHistoryItem[];
  agingBreakdown: BuyerAgingBreakdown[];
  followUpStatus: BuyerFollowUpStatus[];
}

function getBuyerAgingBucket(days: number): string {
  if (days <= 3) return '0–3 days';
  if (days <= 7) return '4–7 days';
  if (days <= 14) return '8–14 days';
  if (days <= 30) return '15–30 days';
  return '30+ days';
}

function calcBuyerPriorityScore(severity: string, daysPastDue: number, financialImpact: number): number {
  let sevScore = 0;
  if (severity === 'CRITICAL') sevScore = 30;
  else if (severity === 'HIGH') sevScore = 15;
  else if (severity === 'MEDIUM') sevScore = 5;
  let valScore = 0;
  if (financialImpact > 50000) valScore = 20;
  else if (financialImpact > 10000) valScore = 10;
  else if (financialImpact > 1000) valScore = 5;
  return Math.min(100, Math.round(daysPastDue * 2 + sevScore + valScore));
}

export async function getBuyerProductivityData(
  buyerFilter?: string,
  workloadFilters?: {
    status?: string;
    severity?: string;
    exceptionType?: string;
    search?: string;
    limit?: number;
    offset?: number;
    sortBy?: string;
  }
): Promise<BuyerProductivityData> {
  const [
    exceptionsRaw,
    acksRaw,
    suppliersRaw,
    logsRaw
  ] = await Promise.all([
    readCsv('exception_worklist.csv'),
    readCsv('supplier_acknowledgements.csv'),
    readCsv('suppliers.csv'),
    readCsv('communication_logs.csv')
  ]);

  const suppliersMap = new Map<string, string>();
  for (const s of suppliersRaw) {
    suppliersMap.set(s.supplier_id, s.supplier_name || s.supplier_id);
  }

  // Aggregate follow-up counts from communication_logs (outbound messages by buyer per supplier)
  const followUpMap = new Map<string, Map<string, { count: number; lastDate: string }>>();
  for (const log of logsRaw) {
    if (log.direction !== 'OUTBOUND') continue;
    const buyer = log.assigned_buyer || log.created_by || '';
    const supplier = log.supplier_id || '';
    if (!buyer || !supplier) continue;
    if (!followUpMap.has(buyer)) followUpMap.set(buyer, new Map());
    const supplierLogMap = followUpMap.get(buyer)!;
    const cur = supplierLogMap.get(supplier) || { count: 0, lastDate: '' };
    cur.count++;
    const logDate = log.sent_date || log.received_date || '';
    if (logDate && (!cur.lastDate || logDate > cur.lastDate)) cur.lastDate = logDate;
    supplierLogMap.set(supplier, cur);
  }

  // Acknowledgement follow-up signals per supplier
  const ackFollowUpBySupplier = new Map<string, { count: number; status: string; lastDate: string }>();
  for (const ack of acksRaw) {
    const sid = ack.supplier_id || '';
    if (!sid) continue;
    const existing = ackFollowUpBySupplier.get(sid) || { count: 0, status: 'CONFIRMED', lastDate: '' };
    existing.count += parseInt(ack.buyer_followup_count || '0', 10);
    const s = ack.acknowledgement_status || 'CONFIRMED';
    if (s === 'MISSING') existing.status = 'MISSING';
    else if (s === 'PENDING' && existing.status !== 'MISSING') existing.status = 'PENDING';
    const ld = ack.last_supplier_response_date || '';
    if (ld && (!existing.lastDate || ld > existing.lastDate)) existing.lastDate = ld;
    ackFollowUpBySupplier.set(sid, existing);
  }

  // All distinct buyer IDs
  const allBuyers: string[] = Array.from(new Set(
    exceptionsRaw.map((e: any) => e.assigned_buyer).filter(Boolean)
  )).sort() as string[];

  const targetBuyers: string[] = (buyerFilter && buyerFilter !== 'ALL')
    ? [buyerFilter]
    : allBuyers;

  // Build per-buyer summary
  const summary: BuyerProductivitySummary[] = targetBuyers.map(buyer => {
    const buyerEx = exceptionsRaw.filter((e: any) => e.assigned_buyer === buyer);
    const totalAssigned = buyerEx.length;
    const resolvedCount = buyerEx.filter((e: any) => e.status === 'RESOLVED').length;
    const openCount = buyerEx.filter((e: any) => e.status !== 'RESOLVED').length;
    const pendingCount = buyerEx.filter((e: any) => e.status === 'NEW').length;
    const inReviewCount = buyerEx.filter((e: any) => e.status === 'IN_REVIEW').length;
    const actionDraftedCount = buyerEx.filter((e: any) => e.status === 'ACTION_DRAFTED').length;
    const resolutionRate = totalAssigned > 0 ? Math.round((resolvedCount / totalAssigned) * 1000) / 10 : 0;

    const openEx = buyerEx.filter((e: any) => e.status !== 'RESOLVED');
    const withDays = openEx.filter((e: any) => parseFloat(e.days_past_due || '0') > 0);
    const avgDaysPastDue = withDays.length > 0
      ? Math.round(withDays.reduce((s: number, e: any) => s + parseFloat(e.days_past_due || '0'), 0) / withDays.length * 10) / 10
      : 0;

    const totalFinancialExposure = openEx.reduce(
      (s: number, e: any) => s + parseFloat(e.financial_impact_estimate || '0'), 0
    );
    const overdueTaskCount = openEx.filter((e: any) => parseFloat(e.days_past_due || '0') > 0).length;
    const criticalCount = openEx.filter((e: any) => e.severity === 'CRITICAL').length;
    const highCount = openEx.filter((e: any) => e.severity === 'HIGH').length;
    const suppliersManaged = new Set(buyerEx.map((e: any) => e.supplier_id)).size;

    let totalFollowUpsSent = 0;
    const buyerLogsBySupplier = followUpMap.get(buyer);
    if (buyerLogsBySupplier) {
      for (const v of buyerLogsBySupplier.values()) totalFollowUpsSent += v.count;
    }
    const buyerSupplierIds = new Set(buyerEx.map((e: any) => e.supplier_id));
    for (const sid of buyerSupplierIds) {
      const ackData = ackFollowUpBySupplier.get(sid as string);
      if (ackData) totalFollowUpsSent += ackData.count;
    }

    const resolvedItems = buyerEx
      .filter((e: any) => e.status === 'RESOLVED' && e.detected_on)
      .sort((a: any, b: any) => (b.detected_on || '').localeCompare(a.detected_on || ''));
    const lastActionDate = resolvedItems.length > 0 ? resolvedItems[0].detected_on : '';

    return {
      buyer,
      totalAssigned,
      openCount,
      resolvedCount,
      pendingCount,
      inReviewCount,
      actionDraftedCount,
      resolutionRate,
      avgDaysPastDue,
      totalFinancialExposure: Math.round(totalFinancialExposure),
      totalFollowUpsSent,
      overdueTaskCount,
      criticalCount,
      highCount,
      suppliersManaged,
      lastActionDate
    };
  });

  // Workload: open exceptions for target buyers
  let workloadEx = exceptionsRaw.filter(
    (e: any) => e.status !== 'RESOLVED' && targetBuyers.includes(e.assigned_buyer)
  );

  const wf = workloadFilters || {};
  if (wf.status) workloadEx = workloadEx.filter((e: any) => e.status === wf.status);
  if (wf.severity) workloadEx = workloadEx.filter((e: any) => e.severity === wf.severity);
  if (wf.exceptionType) workloadEx = workloadEx.filter((e: any) => e.exception_type === wf.exceptionType);
  if (wf.search) {
    const s = wf.search.toLowerCase();
    workloadEx = workloadEx.filter((e: any) =>
      (e.po_number || '').toLowerCase().includes(s) ||
      (e.supplier_id || '').toLowerCase().includes(s) ||
      (e.exception_id || '').toLowerCase().includes(s) ||
      (suppliersMap.get(e.supplier_id) || '').toLowerCase().includes(s)
    );
  }

  const workloadTotal = workloadEx.length;

  if (wf.sortBy === 'severity') {
    const SEV: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    workloadEx.sort((a: any, b: any) =>
      (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9) ||
      parseFloat(b.days_past_due || '0') - parseFloat(a.days_past_due || '0')
    );
  } else if (wf.sortBy === 'financial') {
    workloadEx.sort((a: any, b: any) =>
      parseFloat(b.financial_impact_estimate || '0') - parseFloat(a.financial_impact_estimate || '0')
    );
  } else {
    workloadEx.sort((a: any, b: any) =>
      parseFloat(b.days_past_due || '0') - parseFloat(a.days_past_due || '0')
    );
  }

  const offset = wf.offset || 0;
  const limit = wf.limit || 50;
  const workloadPage = workloadEx.slice(offset, offset + limit);

  const workload: BuyerWorkloadItem[] = workloadPage.map((e: any) => {
    const days = parseFloat(e.days_past_due || '0');
    const financial = parseFloat(e.financial_impact_estimate || '0');
    return {
      exception_id: e.exception_id,
      exception_type: e.exception_type || 'UNKNOWN',
      po_number: e.po_number || '',
      item_number: e.item_number || '',
      supplier_id: e.supplier_id || '',
      supplier_name: suppliersMap.get(e.supplier_id) || e.supplier_id || 'Unknown',
      plant: e.plant || '',
      status: e.status || 'NEW',
      severity: e.severity || 'LOW',
      days_past_due: days,
      financial_impact: Math.round(financial),
      detected_on: e.detected_on || '',
      due_date: e.due_date || '',
      root_cause: e.root_cause || '',
      assigned_buyer: e.assigned_buyer || '',
      agingBucket: getBuyerAgingBucket(days),
      priorityScore: calcBuyerPriorityScore(e.severity || 'LOW', days, financial)
    };
  });

  // Action history: resolved exceptions for target buyers, newest first
  const resolvedEx = exceptionsRaw
    .filter((e: any) => e.status === 'RESOLVED' && targetBuyers.includes(e.assigned_buyer))
    .sort((a: any, b: any) => (b.detected_on || '').localeCompare(a.detected_on || ''))
    .slice(0, 100);

  const actionHistory: BuyerActionHistoryItem[] = resolvedEx.map((e: any) => ({
    exception_id: e.exception_id,
    exception_type: e.exception_type || 'UNKNOWN',
    po_number: e.po_number || '',
    supplier_id: e.supplier_id || '',
    supplier_name: suppliersMap.get(e.supplier_id) || e.supplier_id || 'Unknown',
    plant: e.plant || '',
    resolved_on: e.detected_on || '',
    days_to_resolve: Math.round(parseFloat(e.days_past_due || '0')),
    financial_impact: Math.round(parseFloat(e.financial_impact_estimate || '0')),
    severity: e.severity || 'LOW',
    assigned_buyer: e.assigned_buyer || ''
  }));

  // Aging breakdown for buyer open workload
  const allOpenEx = exceptionsRaw.filter(
    (e: any) => e.status !== 'RESOLVED' && targetBuyers.includes(e.assigned_buyer)
  );
  const AGING_BUCKETS = [
    { label: '0–3 days', min: 0, max: 3 },
    { label: '4–7 days', min: 4, max: 7 },
    { label: '8–14 days', min: 8, max: 14 },
    { label: '15–30 days', min: 15, max: 30 },
    { label: '30+ days', min: 31, max: Infinity }
  ];
  const totalOpenForAging = allOpenEx.length;
  const agingBreakdown: BuyerAgingBreakdown[] = AGING_BUCKETS.map(b => {
    const count = allOpenEx.filter((e: any) => {
      const d = parseFloat(e.days_past_due || '0');
      return d >= b.min && d <= b.max;
    }).length;
    return {
      bucket: b.label,
      count,
      pct: totalOpenForAging > 0 ? Math.round((count / totalOpenForAging) * 1000) / 10 : 0
    };
  });

  // Supplier follow-up status for target buyers
  const buyerSupplierSet = new Set<string>();
  for (const e of exceptionsRaw) {
    if (targetBuyers.includes(e.assigned_buyer) && e.supplier_id) {
      buyerSupplierSet.add(e.supplier_id);
    }
  }

  const followUpStatus: BuyerFollowUpStatus[] = Array.from(buyerSupplierSet).map(sid => {
    const supplierName = suppliersMap.get(sid) || sid;
    const openExs = exceptionsRaw.filter(
      (e: any) => e.supplier_id === sid && targetBuyers.includes(e.assigned_buyer) && e.status !== 'RESOLVED'
    );

    let totalFollowUpsSent = 0;
    let lastFollowUpDate = '';
    for (const buyer of targetBuyers) {
      const buyerLogsBySupplier = followUpMap.get(buyer);
      if (buyerLogsBySupplier) {
        const supplierEntry = buyerLogsBySupplier.get(sid);
        if (supplierEntry) {
          totalFollowUpsSent += supplierEntry.count;
          if (supplierEntry.lastDate > lastFollowUpDate) lastFollowUpDate = supplierEntry.lastDate;
        }
      }
    }
    const ackData = ackFollowUpBySupplier.get(sid);
    if (ackData) {
      totalFollowUpsSent += ackData.count;
      if (ackData.lastDate > lastFollowUpDate) lastFollowUpDate = ackData.lastDate;
    }

    const acknowledgementStatus = ackData?.status || 'CONFIRMED';
    const hasCritical = openExs.some((e: any) => e.severity === 'CRITICAL');
    const hasHigh = openExs.some((e: any) => e.severity === 'HIGH');
    let urgency: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (hasCritical || acknowledgementStatus === 'MISSING') urgency = 'HIGH';
    else if (hasHigh || acknowledgementStatus === 'PENDING') urgency = 'MEDIUM';

    return {
      supplier_id: sid,
      supplier_name: supplierName,
      openExceptions: openExs.length,
      totalFollowUpsSent,
      lastFollowUpDate,
      acknowledgementStatus,
      urgency
    };
  }).sort((a, b) => {
    const ORD: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return (ORD[a.urgency] ?? 9) - (ORD[b.urgency] ?? 9) || b.openExceptions - a.openExceptions;
  });

  return {
    buyers: allBuyers,
    summary,
    workload,
    workloadTotal,
    actionHistory,
    agingBreakdown,
    followUpStatus
  };
}


// ==========================================
// Phase 1E – Control Tower Consolidation
// ==========================================

export interface ControlTowerPriorityItem {
  id: string;
  category: 'OVERDUE_PO' | 'MISSING_ACK' | 'PART_SHORTAGE' | 'EXCEPTION';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
  financialRisk: number;
  plant: string;
  supplierId: string;
  supplierName: string;
  referenceKey: string;
}

export interface ControlTowerPlantHealth {
  plant: string;
  shortageCount: number;
  exceptionCount: number;
  overdueCount: number;
  status: 'OPTIMAL' | 'WARNING' | 'RISK';
}

export interface ControlTowerSystemStatus {
  name: string;
  status: 'OPERATIONAL' | 'ATTENTION' | 'BREACH';
  indicator: string;
  details: string;
}

export interface ControlTowerActivityLog {
  timestamp: string;
  message: string;
  type: 'SUCCESS' | 'WARNING' | 'INFO';
}

export interface ControlTowerSummary {
  metrics: {
    overduePoValue: number;
    overduePoLines: number;
    missingAcks: number;
    totalPartShortages: number;
    activeExceptions: number;
    criticalExceptions: number;
    financialExposure: number;
    resolutionRate: number;
  };
  priorityInbox: ControlTowerPriorityItem[];
  plantHealth: ControlTowerPlantHealth[];
  systemStatus: ControlTowerSystemStatus[];
  recentActivity: ControlTowerActivityLog[];
}

export async function getControlTowerSummary(): Promise<ControlTowerSummary> {
  const [
    overdueSum,
    ackSum,
    partSum,
    exAnal,
    exceptionsRaw,
    partsRaw,
    joinedAcksRaw,
    poHeadersRaw,
    suppliersRaw
  ] = await Promise.all([
    getOverdueSummary(),
    getAcknowledgementSummary(),
    getPartSummary(),
    getExceptionAnalytics(),
    readCsv('exception_worklist.csv'),
    fetchJoinedPartAvailability(),
    fetchJoinedAcknowledgementWorklist(),
    readCsv('purchase_order_headers.csv'),
    readCsv('suppliers.csv')
  ]);

  const overduePoLines = overdueSum.totalOverduePoLines || 0;
  const overduePoValue = Math.round(overdueSum.totalOverdueValue || 0);
  const missingAcks = ackSum.missingCount || 0;
  const totalPartShortages = partSum.shortageCount || 0;

  const activeExceptions = exAnal.totalExceptions - exAnal.resolvedCount;
  const criticalExceptions = exAnal.highSeverityCount;
  const financialExposure = exAnal.totalFinancialImpact;
  const resolutionRate = exAnal.resolutionRate;

  // Build supplier lookup map
  const suppliersMap = new Map<string, string>();
  for (const s of suppliersRaw) {
    suppliersMap.set(s.supplier_id, s.supplier_name);
  }

  // Build Unified Priority Inbox
  const priorityInbox: ControlTowerPriorityItem[] = [];

  // 1. Gather Critical/High Unresolved Exceptions
  const criticalEx = exceptionsRaw
    .filter((e: any) => (e.severity === 'CRITICAL' || e.severity === 'HIGH') && e.status !== 'RESOLVED')
    .slice(0, 3)
    .map((e: any) => ({
      id: e.exception_id,
      category: 'EXCEPTION' as const,
      priority: 'CRITICAL' as const,
      description: `Critical exception event: ${e.exception_type.replace(/_/g, ' ')} detected on PO ${e.po_number || 'N/A'}`,
      financialRisk: Math.round(parseFloat(e.financial_impact_estimate || '0')),
      plant: e.plant || 'Unknown',
      supplierId: e.supplier_id || 'N/A',
      supplierName: suppliersMap.get(e.supplier_id) || 'Associated Supplier',
      referenceKey: e.exception_id
    }));
  priorityInbox.push(...criticalEx);

  // 2. Gather High Overdue PO Lines
  const lateExceptions = exceptionsRaw
    .filter((e: any) => e.exception_type === 'PO_OVERDUE' && e.status !== 'RESOLVED' && e.severity !== 'CRITICAL')
    .slice(0, 2)
    .map((e: any) => ({
      id: `PO-${e.po_number}`,
      category: 'OVERDUE_PO' as const,
      priority: e.severity === 'HIGH' ? ('HIGH' as const) : ('MEDIUM' as const),
      description: `Purchase order ${e.po_number} is significantly past due (overdue by ${e.days_past_due || '0'} days)`,
      financialRisk: Math.round(parseFloat(e.financial_impact_estimate || '0')),
      plant: e.plant || 'Unknown',
      supplierId: e.supplier_id || 'N/A',
      supplierName: suppliersMap.get(e.supplier_id) || 'Delayed Supplier',
      referenceKey: `${e.po_number}`
    }));
  priorityInbox.push(...lateExceptions);

  // 3. Gather Critical Part Shortages
  const criticalParts = partsRaw
    .filter((p: any) => p.safety_stock_violation)
    .slice(0, 2)
    .map((p: any) => {
      const deficit = Math.max(0, Math.round(p.safety_stock - p.unrestricted_stock));
      return {
        id: `PART-${p.material_id}`,
        category: 'PART_SHORTAGE' as const,
        priority: 'CRITICAL' as const,
        description: `Stock breach: Part ${p.material_name || p.material_id} is below safety stock at Plant ${p.plant} (deficit: ${deficit} units)`,
        financialRisk: deficit * 150, // estimated exposure value
        plant: p.plant || 'Unknown',
        supplierId: 'N/A',
        supplierName: 'Stock Supplier',
        referenceKey: p.material_id
      };
    });
  priorityInbox.push(...criticalParts);

  // 4. Gather Missing Acknowledgements
  const missingAckItems = joinedAcksRaw
    .filter((a: any) => a.acknowledgement_status === 'MISSING')
    .slice(0, 2)
    .map((a: any) => ({
      id: `ACK-${a.po_number}-${a.item_number}`,
      category: 'MISSING_ACK' as const,
      priority: 'HIGH' as const,
      description: `Acknowledge missing: Supplier ${a.supplier_name || a.supplier_id} has not acknowledged PO ${a.po_number} line ${a.item_number}`,
      financialRisk: Math.round(a.open_value || (a.buyer_followup_count * 1000)),
      plant: a.plant || 'Global',
      supplierId: a.supplier_id || 'Unknown',
      supplierName: a.supplier_name || a.supplier_id || 'Unknown',
      referenceKey: a.po_number
    }));
  priorityInbox.push(...missingAckItems);

  // Sort unified priorityInbox: CRITICAL first, then HIGH, then MEDIUM, sorted by financialRisk desc
  const PRIO_ORD: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  priorityInbox.sort((a, b) => {
    return (PRIO_ORD[a.priority] ?? 9) - (PRIO_ORD[b.priority] ?? 9) || b.financialRisk - a.financialRisk;
  });

  // Keep top 6 items
  const finalPriorityInbox = priorityInbox.slice(0, 6);

  // Build Plant Health Feed
  const plants = ['AUS1', 'DAL1', 'PHX1', 'KCH1', 'MTY1'];
  const plantHealth: ControlTowerPlantHealth[] = plants.map(plant => {
    const exCount = exceptionsRaw.filter((e: any) => e.plant === plant && e.status !== 'RESOLVED').length;
    const shortCount = partsRaw.filter((p: any) => p.plant === plant && p.safety_stock_violation).length;
    
    // overdue POs for this plant
    const overdueCount = exceptionsRaw.filter((e: any) => e.plant === plant && e.exception_type === 'PO_OVERDUE' && e.status !== 'RESOLVED').length;

    let status: 'OPTIMAL' | 'WARNING' | 'RISK' = 'OPTIMAL';
    if (exCount > 4 || shortCount > 3) status = 'RISK';
    else if (exCount > 0 || shortCount > 0 || overdueCount > 0) status = 'WARNING';

    return {
      plant,
      shortageCount: shortCount,
      exceptionCount: exCount,
      overdueCount,
      status
    };
  });

  // Build System Status Indicators
  const coordData = await getCoordinationAlerts();
  const unresolvedCoord = coordData.active.length;

  const systemStatus: ControlTowerSystemStatus[] = [
    {
      name: 'Overdue PO Agent',
      status: overduePoLines > 10 ? ('BREACH' as const) : overduePoLines > 0 ? ('ATTENTION' as const) : ('OPERATIONAL' as const),
      indicator: overduePoLines > 10 ? '🚨 Overdue' : overduePoLines > 0 ? '⚠️ Delay Alert' : '🟢 Optimal',
      details: `${overduePoLines} overdue lines under surveillance ($${overduePoValue.toLocaleString()} active risk)`
    },
    {
      name: 'Supplier Acknowledgement Agent',
      status: missingAcks > 8 ? ('BREACH' as const) : missingAcks > 0 ? ('ATTENTION' as const) : ('OPERATIONAL' as const),
      indicator: missingAcks > 8 ? '🚨 Breach' : missingAcks > 0 ? '⚠️ Pending' : '🟢 Confirmed',
      details: `${missingAcks} missing supplier responses ($${(missingAcks * 4500).toLocaleString()} latency value)`
    },
    {
      name: 'Part Availability Agent',
      status: totalPartShortages > 3 ? ('BREACH' as const) : totalPartShortages > 0 ? ('ATTENTION' as const) : ('OPERATIONAL' as const),
      indicator: totalPartShortages > 3 ? '🚨 Stock Out' : totalPartShortages > 0 ? '⚠️ Warning' : '🟢 Optimal',
      details: `${totalPartShortages} critical safety stock breaches active across warehouses`
    },
    {
      name: 'Exception Analytics Engine',
      status: activeExceptions > 15 ? ('BREACH' as const) : activeExceptions > 0 ? ('ATTENTION' as const) : ('OPERATIONAL' as const),
      indicator: activeExceptions > 15 ? '🚨 High Load' : '🟢 Stable',
      details: `Tracking ${activeExceptions} active exceptions ($${financialExposure.toLocaleString()} total exposure)`
    },
    {
      name: 'Buyer Productivity Engine',
      status: 'OPERATIONAL' as const,
      indicator: '🟢 Balanced',
      details: `Monitoring workload queues for ${exAnal.byBuyer.length} active purchasing agents`
    },
    {
      name: 'Planner Collaboration Agent',
      status: unresolvedCoord > 5 ? ('BREACH' as const) : unresolvedCoord > 0 ? ('ATTENTION' as const) : ('OPERATIONAL' as const),
      indicator: unresolvedCoord > 5 ? '🚨 High Risk' : unresolvedCoord > 0 ? '⚠️ Warning' : '🟢 Active',
      details: `Managing ${unresolvedCoord} active buyer-planner coordination threads`
    }
  ];

  // Build Recent Activity Log
  const recentActivity: ControlTowerActivityLog[] = [
    {
      timestamp: '10:42 AM',
      message: 'Safety stock breach: Austin Plant (P001) triggered safety stock violation on copper wire lines.',
      type: 'WARNING' as const
    },
    {
      timestamp: '09:15 AM',
      message: 'Automatic alert dispatched: PO 45000084 overdue warning notification routed to supplier S002.',
      type: 'INFO' as const
    },
    {
      timestamp: '08:30 AM',
      message: 'Exception EX084 resolved: Buyer B001 successfully confirmed delivery date update for critical part.',
      type: 'SUCCESS' as const
    },
    {
      timestamp: 'Yesterday',
      message: 'New exception logged: price mismatch detected on PO 45000213 for Shanghai plant (P003).',
      type: 'WARNING' as const
    },
    {
      timestamp: '2 days ago',
      message: 'Supplier reply captured: S004 acknowledged PO 45000109 with revised ship date (within tolerance).',
      type: 'SUCCESS' as const
    }
  ];

  return {
    metrics: {
      overduePoValue,
      overduePoLines,
      missingAcks,
      totalPartShortages,
      activeExceptions,
      criticalExceptions,
      financialExposure: Math.round(financialExposure),
      resolutionRate
    },
    priorityInbox: finalPriorityInbox,
    plantHealth,
    systemStatus,
    recentActivity
  };
}

// ============================================================
// PHASE 3B: ROOT CAUSE ANALYSIS SERVICE FUNCTIONS
// ============================================================

export interface RootCauseAnalysis {
  exception_id: string;
  primary_cause: string;
  contributing_factors: string[];
  narrative: string;
  confidence: number;
  recommended_action: string;
  similar_past_exceptions: number;
}

export interface RootCauseContext {
  exception_id: string;
  po_number: string;
  item_number: string;
  supplier_id: string;
  supplier_name: string;
  days_overdue: number;
  severity: string;
  delay_category: string;
  asn_status: string;
  acknowledgement_status: string;
  on_time_delivery_pct: number;
  risk_score: number;
  avg_response_days: number;
  open_value: number;
  lead_time_days: number;
  safety_stock: number;
  communication_count: number;
  negative_sentiment_count: number;
  latest_communication_body: string;
  asn_count: number;
  similar_past_exceptions: number;
  committed_delivery_date: string;
  buyer_followup_count: number;
  root_cause_note: string;
}

export async function getRootCauseContext(exceptionId: string): Promise<RootCauseContext | null> {
  const [exceptionsRaw, suppliersRaw, acksRaw, asnsRaw, logsRaw, mpRaw, itemsRaw] = await Promise.all([
    readCsv('exception_worklist.csv'),
    readCsv('suppliers.csv'),
    readCsv('supplier_acknowledgements.csv'),
    readCsv('asn_shipments.csv'),
    readCsv('communication_logs.csv'),
    readCsv('material_plant.csv'),
    readCsv('purchase_order_items.csv')
  ]);

  // Find the exception in the worklist
  const ex = exceptionsRaw.find((e: any) => e.exception_id === exceptionId);
  if (!ex) return null;

  const supplier = suppliersRaw.find((s: any) => s.supplier_id === ex.supplier_id) || {};
  const ack = acksRaw.find((a: any) => a.po_number === ex.po_number && a.item_number === ex.item_number);
  const itemAsns = asnsRaw.filter((a: any) => a.po_number === ex.po_number && a.item_number === ex.item_number);
  const itemLogs = logsRaw.filter((l: any) => l.po_number === ex.po_number && l.item_number === ex.item_number);
  const poItem = itemsRaw.find((i: any) => i.po_number === ex.po_number && i.item_number === ex.item_number) || {};
  const matPlant = mpRaw.find((m: any) => m.material_id === ex.material_id && m.plant === ex.plant) || {};

  // Count similar past exceptions for same supplier and same type
  const similarPastExceptions = exceptionsRaw.filter(
    (e: any) => e.supplier_id === ex.supplier_id &&
      e.exception_type === ex.exception_type &&
      e.exception_id !== exceptionId
  ).length;

  // Communication analysis
  const negativeLogs = itemLogs.filter(
    (l: any) => l.sentiment === 'negative' ||
      (l.body || '').toLowerCase().includes('delay') ||
      (l.body || '').toLowerCase().includes('sorry') ||
      (l.body || '').toLowerCase().includes('unable')
  );

  const latestLog = itemLogs.length > 0
    ? itemLogs.sort((a: any, b: any) => {
        const aDate = a.sent_date || a.received_date || '';
        const bDate = b.sent_date || b.received_date || '';
        return bDate.localeCompare(aDate);
      })[0]
    : null;

  // Derive the worklist-enriched item for computed fields
  const joinedList = await fetchJoinedWorklist();
  const joinedItem = joinedList.find(item => item.exception_id === exceptionId);

  return {
    exception_id: exceptionId,
    po_number: ex.po_number,
    item_number: ex.item_number,
    supplier_id: ex.supplier_id,
    supplier_name: (supplier as any).supplier_name || ex.supplier_id,
    days_overdue: parseInt(ex.days_past_due || '0', 10),
    severity: joinedItem?.severity || 'HIGH',
    delay_category: joinedItem?.delay_category || 'Pending Delay Verification',
    asn_status: joinedItem?.asn_status || (itemAsns.length > 0 ? itemAsns[0].status : 'NONE'),
    acknowledgement_status: ack?.acknowledgement_status || 'MISSING',
    on_time_delivery_pct: parseFloat((supplier as any).on_time_delivery_pct || '0'),
    risk_score: parseFloat((supplier as any).risk_score || '0'),
    avg_response_days: parseFloat((supplier as any).avg_response_days || '0'),
    open_value: joinedItem?.open_value || (parseFloat(poItem.order_qty || '0') * parseFloat(poItem.net_price || '0')),
    lead_time_days: parseInt((matPlant as any).planned_delivery_time_days || '0', 10),
    safety_stock: parseInt((matPlant as any).safety_stock || '0', 10),
    communication_count: itemLogs.length,
    negative_sentiment_count: negativeLogs.length,
    latest_communication_body: latestLog?.body || 'No recent communications logged.',
    asn_count: itemAsns.length,
    similar_past_exceptions: similarPastExceptions,
    committed_delivery_date: ack?.committed_delivery_date || 'NOT COMMITTED',
    buyer_followup_count: parseInt(ack?.buyer_followup_count || '0', 10),
    root_cause_note: ex.root_cause || `PO line overdue by ${ex.days_past_due || 0} days.`
  };
}

// ============================================================
// PHASE 3B: TOKEN COST TRACKER HELPERS (file-based persistence)
// ============================================================

const TOKEN_COSTS_FILE = path.join(process.cwd(), 'project_memory', 'token_costs.json');

export interface TokenCostRecord {
  totalTokens: number;
  totalCost: number;
  lastUpdated: string;
  sessionCount: number;
}

function ensureTokenCostsFile(): TokenCostRecord {
  try {
    if (fs.existsSync(TOKEN_COSTS_FILE)) {
      const raw = fs.readFileSync(TOKEN_COSTS_FILE, 'utf-8');
      return JSON.parse(raw) as TokenCostRecord;
    }
  } catch {
    // File corrupt or missing — reset
  }
  const initial: TokenCostRecord = { totalTokens: 0, totalCost: 0, lastUpdated: new Date().toISOString(), sessionCount: 0 };
  try {
    fs.mkdirSync(path.dirname(TOKEN_COSTS_FILE), { recursive: true });
    fs.writeFileSync(TOKEN_COSTS_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  } catch {
    // Write failure is non-fatal — just return initial
  }
  return initial;
}

export function trackTokenUsage(tokensUsed: number, modelType: 'gemini' | 'azure' | 'none' = 'gemini'): void {
  if (tokensUsed <= 0) return;
  try {
    const record = ensureTokenCostsFile();
    // Cost estimate: Gemini Flash ~$0.075/1M input+output tokens; Azure GPT-3.5 ~$0.002/1k tokens
    const costPerToken = modelType === 'azure' ? 0.000002 : 0.000000075;
    const estimatedCost = tokensUsed * costPerToken;
    const updated: TokenCostRecord = {
      totalTokens: record.totalTokens + tokensUsed,
      totalCost: Math.round((record.totalCost + estimatedCost) * 1000000) / 1000000,
      lastUpdated: new Date().toISOString(),
      sessionCount: record.sessionCount + 1
    };
    fs.writeFileSync(TOKEN_COSTS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Token tracking write failed (non-fatal):', e);
  }
}

export function getCumulativeTokens(): TokenCostRecord {
  return ensureTokenCostsFile();
}

// ============================================================
// PHASE 3C: SUPPLIER INTELLIGENCE SERVICE FUNCTIONS
// ============================================================

export interface SupplierIntelligence {
  supplier_id: string;
  relationship_health: 'Strong' | 'Stable' | 'At Risk' | 'Critical';
  summary: string;
  watch_items: string[];
  recommended_action: string;
}

export interface SupplierIntelligenceContext {
  supplier_id: string;
  supplier_name: string;
  country: string;
  supplier_tier: string;
  on_time_delivery_pct: number;
  quality_ppm: number;
  risk_score: number;
  avg_response_days: number;
  blocked_flag: string;
  open_spend: number;
  active_exception_count: number;
  critical_exception_count: number;
  active_po_count: number;
  payment_terms: string;
  incoterms: string;
}

export async function getSupplierIntelligenceContext(supplierId: string): Promise<SupplierIntelligenceContext | null> {
  const [suppliersRaw, exceptionsRaw, headersRaw, itemsRaw, schedulesRaw] = await Promise.all([
    readCsv('suppliers.csv'),
    readCsv('exception_worklist.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('po_schedule_lines.csv')
  ]);

  const supplier = suppliersRaw.find((s: any) => s.supplier_id === supplierId);
  if (!supplier) return null;

  // Count active exceptions for this supplier
  const supplierExceptions = exceptionsRaw.filter((e: any) => e.supplier_id === supplierId && e.status !== 'RESOLVED');
  const criticalExceptions = supplierExceptions.filter((e: any) => e.severity === 'CRITICAL' || parseInt(e.days_past_due || '0') > 7);

  // Find active POs
  const supplierHeaders = headersRaw.filter((h: any) => h.supplier_id === supplierId && h.header_status !== 'CANCELLED');

  // Calculate open spend
  let openSpend = 0;
  const itemsMap = new Map<string, any>();
  for (const item of itemsRaw) itemsMap.set(`${item.po_number}_${item.item_number}`, item);
  for (const sch of schedulesRaw) {
    const openQty = calculateOpenQuantity(parseFloat(sch.scheduled_qty || '0'), parseFloat(sch.received_qty || '0'));
    if (openQty > 0) {
      const poHead = headersRaw.find((h: any) => h.po_number === sch.po_number);
      if (poHead?.supplier_id === supplierId) {
        const item = itemsMap.get(`${sch.po_number}_${sch.item_number}`);
        const price = parseFloat(item?.net_price || '0');
        openSpend += openQty * price;
      }
    }
  }

  return {
    supplier_id: supplierId,
    supplier_name: supplier.supplier_name || supplierId,
    country: supplier.country || 'Unknown',
    supplier_tier: supplier.supplier_tier || 'N/A',
    on_time_delivery_pct: parseFloat(supplier.on_time_delivery_pct || '0'),
    quality_ppm: parseFloat(supplier.quality_ppm || '0'),
    risk_score: parseFloat(supplier.risk_score || '0'),
    avg_response_days: parseFloat(supplier.avg_response_days || '0'),
    blocked_flag: supplier.blocked_flag || 'N',
    open_spend: Math.round(openSpend * 100) / 100,
    active_exception_count: supplierExceptions.length,
    critical_exception_count: criticalExceptions.length,
    active_po_count: supplierHeaders.length,
    payment_terms: supplier.payment_terms || 'NET30',
    incoterms: supplier.incoterms || 'DAP'
  };
}

// ============================================================
// PHASE 4A: AUTOMATED REMINDERS / WORKFLOW AUTOMATION SERVICES
// ============================================================

export interface PendingReminderItem {
  recommendation_id: string;
  exception_id: string;
  agent_name: string;
  confidence_score: number;
  recommended_action: string;
  draft_subject: string;
  draft_message: string;
  approval_status: 'PENDING' | 'APPROVED' | 'SENT' | 'REJECTED';
  po_number: string;
  item_number: string;
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  material_description: string;
  open_quantity: number;
  open_value: number;
  days_overdue: number;
  plant: string;
}

export async function getPendingReminders(): Promise<PendingReminderItem[]> {
  await initRecommendations();
  const worklist = await fetchJoinedWorklist();
  const items: PendingReminderItem[] = [];
  
  const worklistMap = new Map<string, any>();
  for (const w of worklist) {
    worklistMap.set(w.exception_id, w);
  }
  
  for (const rec of recommendationsCache!.values()) {
    if (rec.approval_status === 'PENDING' || rec.approval_status === 'APPROVED') {
      const details = worklistMap.get(rec.exception_id);
      if (details) {
        items.push({
          recommendation_id: rec.recommendation_id,
          exception_id: rec.exception_id,
          agent_name: rec.agent_name,
          confidence_score: rec.confidence_score,
          recommended_action: rec.recommended_action,
          draft_subject: rec.draft_subject,
          draft_message: rec.draft_message,
          approval_status: rec.approval_status,
          po_number: details.po_number,
          item_number: details.item_number,
          supplier_id: details.supplier_id,
          supplier_name: details.supplier_name,
          material_id: details.material_id,
          material_description: details.material_description,
          open_quantity: details.open_quantity,
          open_value: details.open_value,
          days_overdue: details.days_overdue,
          plant: details.plant
        });
      }
    }
  }
  
  return items.sort((a, b) => b.days_overdue - a.days_overdue);
}

export async function approveReminder(
  recommendationId: string,
  subject: string,
  message: string
): Promise<boolean> {
  return updateRecommendationStatus(recommendationId, 'APPROVED', subject, message);
}

export async function markReminderSent(recommendationId: string): Promise<boolean> {
  return updateRecommendationStatus(recommendationId, 'SENT');
}

export async function getSentReminders(): Promise<PendingReminderItem[]> {
  await initRecommendations();
  const worklist = await fetchJoinedWorklist();
  const items: PendingReminderItem[] = [];
  
  const worklistMap = new Map<string, any>();
  for (const w of worklist) {
    worklistMap.set(w.exception_id, w);
  }
  
  for (const rec of recommendationsCache!.values()) {
    if (rec.approval_status === 'SENT') {
      const details = worklistMap.get(rec.exception_id);
      if (details) {
        items.push({
          recommendation_id: rec.recommendation_id,
          exception_id: rec.exception_id,
          agent_name: rec.agent_name,
          confidence_score: rec.confidence_score,
          recommended_action: rec.recommended_action,
          draft_subject: rec.draft_subject,
          draft_message: rec.draft_message,
          approval_status: rec.approval_status,
          po_number: details.po_number,
          item_number: details.item_number,
          supplier_id: details.supplier_id,
          supplier_name: details.supplier_name,
          material_id: details.material_id,
          material_description: details.material_description,
          open_quantity: details.open_quantity,
          open_value: details.open_value,
          days_overdue: details.days_overdue,
          plant: details.plant
        });
      }
    }
  }
  
  return items.sort((a, b) => b.days_overdue - a.days_overdue);
}

export interface AckFollowUpQueueItem {
  recommendation_id: string;
  exception_id: string;
  agent_name: string;
  confidence_score: number;
  recommended_action: string;
  draft_subject: string;
  draft_message: string;
  approval_status: 'PENDING' | 'APPROVED' | 'SENT' | 'REJECTED';
  po_number: string;
  item_number: string;
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  material_description: string;
  open_quantity: number;
  open_value: number;
  days_overdue: number;
  plant: string;
  buyer_followup_count: number;
}

export async function getAckFollowUpQueue(daysThreshold: number = 3): Promise<{
  queue: AckFollowUpQueueItem[];
  sent: AckFollowUpQueueItem[];
}> {
  const [acks, headersRaw] = await Promise.all([
    fetchJoinedAcknowledgementWorklist(),
    readCsv('purchase_order_headers.csv')
  ]);

  const headersMap = new Map<string, any>();
  for (const h of headersRaw) {
    headersMap.set(h.po_number, h);
  }

  const queue: AckFollowUpQueueItem[] = [];
  const sent: AckFollowUpQueueItem[] = [];

  for (const ack of acks) {
    if (ack.acknowledgement_status !== 'MISSING') continue;

    const poHeader = headersMap.get(ack.po_number) || {};
    const poDate = poHeader.po_date;
    const daysSincePo = poDate
      ? Math.max(0, Math.round((new Date(TODAY_DATE).getTime() - new Date(poDate).getTime()) / (1000 * 60 * 60 * 24)))
      : ack.days_overdue;

    if (daysSincePo < daysThreshold) continue;

    const rec = await getRecommendationByException(
      ack.exception_id,
      ack.po_number,
      ack.item_number,
      'SUPPLIER_ACK_AGENT'
    );

    const item: AckFollowUpQueueItem = {
      recommendation_id: rec.recommendation_id,
      exception_id: ack.exception_id,
      agent_name: rec.agent_name,
      confidence_score: rec.confidence_score,
      recommended_action: rec.recommended_action,
      draft_subject: rec.draft_subject,
      draft_message: rec.draft_message,
      approval_status: rec.approval_status,
      po_number: ack.po_number,
      item_number: ack.item_number,
      supplier_id: ack.supplier_id,
      supplier_name: ack.supplier_name,
      material_id: ack.material_id,
      material_description: ack.material_description,
      open_quantity: ack.ordered_quantity,
      open_value: ack.open_value,
      days_overdue: daysSincePo,
      plant: ack.plant,
      buyer_followup_count: ack.buyer_followup_count
    };

    if (rec.approval_status === 'SENT') {
      sent.push(item);
    } else if (rec.approval_status === 'PENDING' || rec.approval_status === 'APPROVED') {
      queue.push(item);
    }
  }

  queue.sort((a, b) => b.days_overdue - a.days_overdue);
  sent.sort((a, b) => b.days_overdue - a.days_overdue);

  return { queue, sent };
}

export async function executeAckFollowUp(recommendationId: string): Promise<boolean> {
  return updateRecommendationStatus(recommendationId, 'SENT');
}

export interface EscalationItem {
  escalation_id: string;
  exception_id: string;
  po_number: string;
  item_number: string;
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  material_description: string;
  open_quantity: number;
  open_value: number;
  days_overdue: number;
  plant: string;
  assigned_buyer: string;
  sla_threshold_days: number;
  days_past_sla: number;
  escalation_level: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
  escalation_status: 'PENDING' | 'APPROVED' | 'ESCALATED' | 'RESOLVED';
  draft_subject: string;
  draft_message: string;
  escalated_to: 'Assigned Buyer' | 'Purchasing Manager' | 'Supply Chain Director';
  created_on: string;
}

const ESCALATION_UPDATES_FILE = path.join(process.cwd(), 'project_memory', 'escalation_updates.json');
let escalationsCache: Map<string, EscalationItem> | null = null;

async function initEscalations() {
  if (escalationsCache) return;
  escalationsCache = new Map();
  
  let updates: Record<string, Partial<EscalationItem>> = {};
  try {
    if (fs.existsSync(ESCALATION_UPDATES_FILE)) {
      const raw = fs.readFileSync(ESCALATION_UPDATES_FILE, 'utf-8');
      updates = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load escalation updates:', e);
  }

  const overdueItems = await fetchJoinedWorklist();
  const acks = await fetchJoinedAcknowledgementWorklist();
  const headersRaw = await readCsv('purchase_order_headers.csv');

  const headersMap = new Map<string, any>();
  for (const h of headersRaw) {
    headersMap.set(h.po_number, h);
  }

  const processEscalation = (
    exceptionId: string,
    poNumber: string,
    itemNumber: string,
    supplierId: string,
    supplierName: string,
    materialId: string,
    materialDescription: string,
    openQty: number,
    openValue: number,
    daysOverdue: number,
    plant: string,
    assignedBuyer: string,
    type: 'PO_OVERDUE' | 'MISSING_ACK'
  ) => {
    const slaThreshold = type === 'PO_OVERDUE' ? 5 : 3;
    const daysPastSla = daysOverdue - slaThreshold;
    if (daysPastSla <= 0) return;

    let escalationLevel: 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3' = 'LEVEL_1';
    let escalatedTo: 'Assigned Buyer' | 'Purchasing Manager' | 'Supply Chain Director' = 'Assigned Buyer';

    if (daysPastSla > 7) {
      escalationLevel = 'LEVEL_3';
      escalatedTo = 'Supply Chain Director';
    } else if (daysPastSla >= 4) {
      escalationLevel = 'LEVEL_2';
      escalatedTo = 'Purchasing Manager';
    } else {
      escalationLevel = 'LEVEL_1';
      escalatedTo = 'Assigned Buyer';
    }

    const escId = `ESC_${poNumber}_${itemNumber || '00010'}_${escalationLevel}`;
    const update = updates[escId] || {};

    const subject = `[CRITICAL SLA BREACH] Escalation ${escalationLevel} for PO ${poNumber} - ${supplierName}`;
    const message = `Attention ${escalatedTo},\n\nThis is an automated escalation warning from the Procurement Control Tower. PO ${poNumber} line ${itemNumber || '00010'} has breached the SLA threshold.\n\nDetails:\n- Supplier: ${supplierName} (${supplierId})\n- Material: ${materialId} - ${materialDescription}\n- Open Value: $${Math.round(openValue).toLocaleString()}\n- Overdue: ${daysOverdue} days (SLA: ${slaThreshold} days)\n- Action: Please review recovery plan and initiate supplier escalation.`;

    escalationsCache!.set(escId, {
      escalation_id: escId,
      exception_id: exceptionId,
      po_number: poNumber,
      item_number: itemNumber || '00010',
      supplier_id: supplierId,
      supplier_name: supplierName,
      material_id: materialId,
      material_description: materialDescription,
      open_quantity: openQty,
      open_value: openValue,
      days_overdue: daysOverdue,
      plant: plant,
      assigned_buyer: assignedBuyer,
      sla_threshold_days: slaThreshold,
      days_past_sla: daysPastSla,
      escalation_level: escalationLevel,
      escalation_status: update.escalation_status || 'PENDING',
      draft_subject: update.draft_subject !== undefined ? update.draft_subject : subject,
      draft_message: update.draft_message !== undefined ? update.draft_message : message,
      escalated_to: escalatedTo,
      created_on: TODAY_DATE
    });
  };

  for (const item of overdueItems) {
    processEscalation(
      item.exception_id,
      item.po_number,
      item.item_number,
      item.supplier_id,
      item.supplier_name,
      item.material_id,
      item.material_description,
      item.open_quantity,
      item.open_value,
      item.days_overdue,
      item.plant,
      item.assigned_buyer,
      'PO_OVERDUE'
    );
  }

  for (const ack of acks) {
    if (ack.acknowledgement_status !== 'MISSING') continue;
    const poHeader = headersMap.get(ack.po_number) || {};
    const poDate = poHeader.po_date;
    const daysSincePo = poDate
      ? Math.max(0, Math.round((new Date(TODAY_DATE).getTime() - new Date(poDate).getTime()) / (1000 * 60 * 60 * 24)))
      : ack.days_overdue;

    processEscalation(
      ack.exception_id,
      ack.po_number,
      ack.item_number,
      ack.supplier_id,
      ack.supplier_name,
      ack.material_id,
      ack.material_description,
      ack.ordered_quantity,
      ack.open_value,
      daysSincePo,
      ack.plant,
      poHeader.created_by || 'Unknown',
      'MISSING_ACK'
    );
  }
}

function saveEscalationUpdates(): void {
  try {
    if (!escalationsCache) return;
    const updates: Record<string, Partial<EscalationItem>> = {};
    for (const esc of escalationsCache.values()) {
      updates[esc.escalation_id] = {
        escalation_status: esc.escalation_status,
        draft_subject: esc.draft_subject,
        draft_message: esc.draft_message
      };
    }
    fs.mkdirSync(path.dirname(ESCALATION_UPDATES_FILE), { recursive: true });
    fs.writeFileSync(ESCALATION_UPDATES_FILE, JSON.stringify(updates, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save escalation updates:', e);
  }
}

export async function getEscalationTriggers(): Promise<{
  triggers: EscalationItem[];
  history: EscalationItem[];
}> {
  await initEscalations();
  const triggers: EscalationItem[] = [];
  const history: EscalationItem[] = [];

  for (const esc of escalationsCache!.values()) {
    if (esc.escalation_status === 'ESCALATED' || esc.escalation_status === 'RESOLVED') {
      history.push(esc);
    } else if (esc.escalation_status === 'PENDING' || esc.escalation_status === 'APPROVED') {
      triggers.push(esc);
    }
  }

  const levelOrder = { LEVEL_3: 3, LEVEL_2: 2, LEVEL_1: 1 };
  const sortFn = (a: EscalationItem, b: EscalationItem) => {
    return (levelOrder[b.escalation_level] - levelOrder[a.escalation_level]) || (b.days_overdue - a.days_overdue);
  };

  triggers.sort(sortFn);
  history.sort(sortFn);

  return { triggers, history };
}

export async function updateEscalationStatus(
  escalationId: string,
  status: 'PENDING' | 'APPROVED' | 'ESCALATED' | 'RESOLVED',
  subject?: string,
  message?: string
): Promise<boolean> {
  await initEscalations();
  const target = escalationsCache!.get(escalationId);
  if (target) {
    target.escalation_status = status;
    if (subject !== undefined) target.draft_subject = subject;
    if (message !== undefined) target.draft_message = message;
    saveEscalationUpdates();
    return true;
  }
  return false;
}

// ============================================================
// PHASE 4D: PLANNER COLLABORATION SERVICES
// ============================================================

export interface CoordinationAlert {
  alert_id: string;
  exception_id: string;
  po_number: string;
  item_number: string;
  plant: string;
  assigned_buyer: string;
  material_id: string;
  material_description: string;
  current_stock: number;
  safety_stock: number;
  standard_price?: number;
  impact_level: 'PRODUCTION_STOPPAGE' | 'CRITICAL_SHORTAGE' | 'WARNING';
  planner_message: string;
  coordination_status: 'UNRESOLVED' | 'IN_COORDINATION' | 'RESOLVED';
  buyer_notes: string;
  planner_action: 'EXPEDITE_PO' | 'USE_ALTERNATE_SOURCE' | 'ADJUST_PRODUCTION' | 'NONE';
  updated_at: string;
}

const COORDINATION_UPDATES_FILE = path.join(process.cwd(), 'project_memory', 'coordination_updates.json');

export async function getCoordinationAlerts(): Promise<{
  active: CoordinationAlert[];
  history: CoordinationAlert[];
}> {
  const [
    exceptionsRaw,
    itemsRaw,
    materialsRaw,
    stockRaw,
    mpRaw,
  ] = await Promise.all([
    readCsv('exception_worklist.csv'),
    readCsv('purchase_order_items.csv'),
    readCsv('materials.csv'),
    readCsv('inventory_stock.csv'),
    readCsv('material_plant.csv'),
  ]);

  let updates: Record<string, Partial<CoordinationAlert>> = {};
  try {
    if (fs.existsSync(COORDINATION_UPDATES_FILE)) {
      const raw = fs.readFileSync(COORDINATION_UPDATES_FILE, 'utf-8');
      updates = JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load coordination updates:', e);
  }

  const itemsMap = new Map<string, any>();
  for (const item of itemsRaw) {
    itemsMap.set(`${item.po_number}_${item.item_number}`, item);
  }

  const materialsMap = new Map<string, any>();
  for (const m of materialsRaw) {
    materialsMap.set(m.material_id, m);
  }

  const stockMap = new Map<string, any>();
  for (const s of stockRaw) {
    stockMap.set(`${s.material_id}_${s.plant}`, s);
  }

  const mpMap = new Map<string, any>();
  for (const mp of mpRaw) {
    mpMap.set(`${mp.material_id}_${mp.plant}`, mp);
  }

  const active: CoordinationAlert[] = [];
  const history: CoordinationAlert[] = [];

  for (const ex of exceptionsRaw) {
    const itemKey = `${ex.po_number}_${ex.item_number}`;
    const poItem = itemsMap.get(itemKey);
    if (!poItem) continue;

    const materialId = poItem.material_id;
    const plant = poItem.plant || ex.plant;
    const mat = materialsMap.get(materialId);
    const materialDescription = mat ? mat.description : 'Unknown Material';

    const stockInfo = stockMap.get(`${materialId}_${plant}`);
    const currentStock = stockInfo ? parseInt(stockInfo.unrestricted_stock || '0', 10) : 0;

    const mpInfo = mpMap.get(`${materialId}_${plant}`);
    const safetyStock = mpInfo ? parseInt(mpInfo.safety_stock || '0', 10) : 0;

    const alertId = `COORD_${ex.exception_id}`;
    const update = updates[alertId] || {};

    const coordinationStatus = update.coordination_status || (ex.status === 'RESOLVED' ? 'RESOLVED' : 'UNRESOLVED');
    const buyerNotes = update.buyer_notes || '';
    const plannerAction = update.planner_action || 'NONE';
    const updatedAt = update.updated_at || new Date().toISOString();

    let impactLevel: 'PRODUCTION_STOPPAGE' | 'CRITICAL_SHORTAGE' | 'WARNING' = 'WARNING';
    if (safetyStock > 0) {
      const pct = currentStock / safetyStock;
      if (pct < 0.20) {
        impactLevel = 'PRODUCTION_STOPPAGE';
      } else if (pct < 1.0) {
        impactLevel = 'CRITICAL_SHORTAGE';
      }
    } else {
      if (currentStock === 0) {
        impactLevel = 'CRITICAL_SHORTAGE';
      }
    }

    let plannerMessage = update.planner_message;
    if (!plannerMessage) {
      if (impactLevel === 'PRODUCTION_STOPPAGE') {
        plannerMessage = `[CRITICAL ALERT] ${plant} is at immediate risk of production stoppage. Material ${materialId} unrestricted stock is extremely low at ${currentStock} pcs (Safety Stock requirement: ${safetyStock} pcs). Overdue PO ${ex.po_number} line ${ex.item_number} is holding up stock replenishment. Please expedite immediately.`;
      } else if (impactLevel === 'CRITICAL_SHORTAGE') {
        plannerMessage = `[WARNING] Safety stock breach detected at plant ${plant} for part ${materialId}. Unrestricted stock is currently ${currentStock} pcs vs safety stock of ${safetyStock} pcs. Please coordinate with supplier ${ex.supplier_id} to accelerate PO ${ex.po_number}.`;
      } else {
        plannerMessage = `[INFO] Monitoring material ${materialId} at plant ${plant}. On-hand stock is stable at ${currentStock} pcs (Safety: ${safetyStock} pcs), but pending exception ${ex.exception_id} on PO ${ex.po_number} requires coordination attention to avoid future disruption.`;
      }
    }

    const standardPrice = mat ? parseFloat(mat.standard_price || '0') : 0;

    const alert: CoordinationAlert = {
      alert_id: alertId,
      exception_id: ex.exception_id,
      po_number: ex.po_number,
      item_number: ex.item_number,
      plant,
      assigned_buyer: ex.assigned_buyer || 'UNASSIGNED',
      material_id: materialId,
      material_description: materialDescription,
      current_stock: currentStock,
      safety_stock: safetyStock,
      standard_price: standardPrice,
      impact_level: impactLevel,
      planner_message: plannerMessage,
      coordination_status: coordinationStatus,
      buyer_notes: buyerNotes,
      planner_action: plannerAction,
      updated_at: updatedAt,
    };

    if (coordinationStatus === 'RESOLVED') {
      history.push(alert);
    } else {
      active.push(alert);
    }
  }

  const levelOrder = { PRODUCTION_STOPPAGE: 3, CRITICAL_SHORTAGE: 2, WARNING: 1 };
  const sortFn = (a: CoordinationAlert, b: CoordinationAlert) => {
    return (levelOrder[b.impact_level] - levelOrder[a.impact_level]);
  };

  active.sort(sortFn);
  history.sort(sortFn);

  return { active, history };
}

export async function updateCoordinationAlert(
  alertId: string,
  status: 'UNRESOLVED' | 'IN_COORDINATION' | 'RESOLVED',
  notes: string,
  action: 'EXPEDITE_PO' | 'USE_ALTERNATE_SOURCE' | 'ADJUST_PRODUCTION' | 'NONE'
): Promise<boolean> {
  try {
    let updates: Record<string, any> = {};
    if (fs.existsSync(COORDINATION_UPDATES_FILE)) {
      try {
        const raw = fs.readFileSync(COORDINATION_UPDATES_FILE, 'utf-8');
        updates = JSON.parse(raw);
      } catch (e) {
        console.warn('Failed to parse coordination updates, resetting:', e);
      }
    }

    updates[alertId] = {
      ...updates[alertId],
      coordination_status: status,
      buyer_notes: notes,
      planner_action: action,
      updated_at: new Date().toISOString(),
    };

    fs.mkdirSync(path.dirname(COORDINATION_UPDATES_FILE), { recursive: true });
    fs.writeFileSync(COORDINATION_UPDATES_FILE, JSON.stringify(updates, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('Failed to update coordination status:', e);
    return false;
  }
}

// ============================================================
// PHASE 4E: MULTI-AGENT WORKFLOW ORCHESTRATION SERVICES
// ============================================================

export interface WorkflowAuditLog {
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  agent: string;
  message: string;
}

export interface UnifiedPipelineItem {
  id: string;
  type: 'REMINDER' | 'ACK_FOLLOWUP' | 'ESCALATION' | 'COLLABORATION';
  exception_id: string;
  po_number: string;
  item_number: string;
  supplier_id: string;
  supplier_name: string;
  material_id: string;
  impact_level: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  value_at_risk: number;
  draft_subject: string;
  draft_message: string;
  approval_status: 'PENDING' | 'APPROVED' | 'SENT' | 'REJECTED';
  target_destination: string;
  plant: string;
  assigned_buyer: string;
}

const MULTI_AGENT_AUDIT_LOG_FILE = path.join(process.cwd(), 'project_memory', 'multi_agent_audit_log.json');

export async function writeAuditLog(
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR',
  agent: string,
  message: string
): Promise<void> {
  try {
    let logs: WorkflowAuditLog[] = [];
    if (fs.existsSync(MULTI_AGENT_AUDIT_LOG_FILE)) {
      const raw = fs.readFileSync(MULTI_AGENT_AUDIT_LOG_FILE, 'utf-8');
      logs = JSON.parse(raw);
    }
    logs.unshift({
      timestamp: new Date().toISOString(),
      level,
      agent,
      message
    });
    if (logs.length > 100) logs = logs.slice(0, 100);
    fs.mkdirSync(path.dirname(MULTI_AGENT_AUDIT_LOG_FILE), { recursive: true });
    fs.writeFileSync(MULTI_AGENT_AUDIT_LOG_FILE, JSON.stringify(logs, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to write audit log:', e);
  }
}

export async function getMultiAgentAuditLogs(): Promise<WorkflowAuditLog[]> {
  try {
    if (fs.existsSync(MULTI_AGENT_AUDIT_LOG_FILE)) {
      const raw = fs.readFileSync(MULTI_AGENT_AUDIT_LOG_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('Failed to load audit logs:', e);
  }
  return [];
}

export async function getMultiAgentPipeline(filters?: { plant?: string; buyer?: string }): Promise<{
  pipeline: UnifiedPipelineItem[];
  auditLogs: WorkflowAuditLog[];
}> {
  const [
    exceptionsRaw,
    reminders,
    ackFollowup,
    escalations,
    coordination,
    auditLogs
  ] = await Promise.all([
    readCsv('exception_worklist.csv'),
    getPendingReminders(),
    getAckFollowUpQueue(),
    getEscalationTriggers(),
    getCoordinationAlerts(),
    getMultiAgentAuditLogs()
  ]);

  const exceptionsMap = new Map<string, any>();
  for (const ex of exceptionsRaw) {
    exceptionsMap.set(ex.exception_id, ex);
  }

  const pipeline: UnifiedPipelineItem[] = [];

  // 1. Reminders
  for (const r of reminders) {
    const ex = exceptionsMap.get(r.exception_id) || {};
    pipeline.push({
      id: r.recommendation_id,
      type: 'REMINDER',
      exception_id: r.exception_id,
      po_number: r.po_number,
      item_number: r.item_number,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      material_id: r.material_id,
      impact_level: r.days_overdue > 7 ? 'CRITICAL' : r.days_overdue >= 3 ? 'HIGH' : 'MEDIUM',
      value_at_risk: Math.round(r.open_value),
      draft_subject: r.draft_subject,
      draft_message: r.draft_message,
      approval_status: r.approval_status,
      target_destination: 'Supplier Email Direct',
      plant: r.plant || ex.plant || 'Global',
      assigned_buyer: ex.assigned_buyer || 'UNASSIGNED'
    });
  }

  // 2. Ack Followups
  for (const r of ackFollowup.queue) {
    const ex = exceptionsMap.get(r.exception_id) || {};
    pipeline.push({
      id: r.recommendation_id,
      type: 'ACK_FOLLOWUP',
      exception_id: r.exception_id,
      po_number: r.po_number,
      item_number: r.item_number,
      supplier_id: r.supplier_id,
      supplier_name: r.supplier_name,
      material_id: r.material_id,
      impact_level: r.days_overdue > 5 ? 'CRITICAL' : r.days_overdue >= 3 ? 'HIGH' : 'MEDIUM',
      value_at_risk: Math.round(r.open_value),
      draft_subject: r.draft_subject,
      draft_message: r.draft_message,
      approval_status: r.approval_status,
      target_destination: 'Supplier Ack Portal',
      plant: r.plant || ex.plant || 'Global',
      assigned_buyer: ex.assigned_buyer || 'UNASSIGNED'
    });
  }

  // 3. Escalations
  for (const esc of escalations.triggers) {
    const ex = exceptionsMap.get(esc.exception_id) || {};
    pipeline.push({
      id: esc.escalation_id,
      type: 'ESCALATION',
      exception_id: esc.exception_id,
      po_number: esc.po_number,
      item_number: esc.item_number,
      supplier_id: esc.supplier_id,
      supplier_name: esc.supplier_name,
      material_id: esc.material_id,
      impact_level: esc.escalation_level === 'LEVEL_3' ? 'CRITICAL' : esc.escalation_level === 'LEVEL_2' ? 'HIGH' : 'MEDIUM',
      value_at_risk: Math.round(esc.open_value),
      draft_subject: esc.draft_subject,
      draft_message: esc.draft_message,
      approval_status: esc.escalation_status === 'APPROVED' ? 'APPROVED' : 'PENDING',
      target_destination: `${esc.escalated_to} SLA Warning`,
      plant: esc.plant || ex.plant || 'Global',
      assigned_buyer: esc.assigned_buyer || ex.assigned_buyer || 'UNASSIGNED'
    });
  }

  // 4. Coordination Alerts
  for (const alert of coordination.active) {
    const ex = exceptionsMap.get(alert.exception_id) || {};
    pipeline.push({
      id: alert.alert_id,
      type: 'COLLABORATION',
      exception_id: alert.exception_id,
      po_number: alert.po_number,
      item_number: alert.item_number,
      supplier_id: '',
      supplier_name: 'Material Shortage Board',
      material_id: alert.material_id,
      impact_level: alert.impact_level === 'PRODUCTION_STOPPAGE' ? 'CRITICAL' : alert.impact_level === 'CRITICAL_SHORTAGE' ? 'HIGH' : 'MEDIUM',
      value_at_risk: 0,
      draft_subject: `Shortage Deficit: ${alert.material_id} at Plant ${alert.plant}`,
      draft_message: alert.planner_message,
      approval_status: alert.coordination_status === 'IN_COORDINATION' ? 'APPROVED' : 'PENDING',
      target_destination: 'Planner Shortage Ledger',
      plant: alert.plant || ex.plant || 'Global',
      assigned_buyer: alert.assigned_buyer || ex.assigned_buyer || 'UNASSIGNED'
    });
  }

  let filtered = pipeline;
  if (filters) {
    if (filters.plant && filters.plant !== 'ALL' && filters.plant !== '') {
      filtered = filtered.filter(item => item.plant === filters.plant);
    }
    if (filters.buyer && filters.buyer !== 'ALL' && filters.buyer !== '') {
      filtered = filtered.filter(item => item.assigned_buyer === filters.buyer);
    }
  }

  return { pipeline: filtered, auditLogs };
}

export async function batchDispatchPipeline(ids: string[]): Promise<boolean> {
  try {
    let successCount = 0;
    for (const id of ids) {
      if (id.startsWith('COORD_')) {
        const alertId = id;
        const success = await updateCoordinationAlert(alertId, 'RESOLVED', 'Auto-resolved via multi-agent batch dispatch pipeline.', 'EXPEDITE_PO');
        if (success) {
          successCount++;
          await writeAuditLog('SUCCESS', 'Planner Collaboration Agent', `Resolved coordination alert ${alertId} with EXPEDITE_PO resolution path.`);
        }
      } else if (id.startsWith('ESC_')) {
        const escalationId = id;
        const success = await updateEscalationStatus(escalationId, 'ESCALATED');
        if (success) {
          successCount++;
          await writeAuditLog('SUCCESS', 'Escalation Agent', `Executed SLA breach warning notice for ${escalationId}.`);
        }
      } else {
        const recId = id;
        await initRecommendations();
        const rec = recommendationsCache!.get(recId);
        if (rec) {
          const success = await updateRecommendationStatus(recId, 'SENT');
          if (success) {
            successCount++;
            const agentName = rec.agent_name || 'Reminder Agent';
            await writeAuditLog('SUCCESS', agentName, `Dispatched draft notice for PO ${rec.exception_id} to supplier.`);
          }
        }
      }
    }
    await writeAuditLog('INFO', 'Orchestration Engine', `Batch dispatch completed. Successfully processed ${successCount} of ${ids.length} actions.`);
    return true;
  } catch (e) {
    console.error('Failed to batch dispatch pipeline:', e);
    await writeAuditLog('ERROR', 'Orchestration Engine', `Failed during batch dispatch: ${(e as Error).message}`);
    return false;
  }
}

export async function runMultiAgentSweep(filters?: {
  plant?: string;
  buyer?: string;
  autoSend?: boolean;
}): Promise<void> {
  const scopeStr = `[Scope: Plant=${filters?.plant || 'ALL'}, Buyer=${filters?.buyer || 'ALL'}, AutoSend=${filters?.autoSend ? 'ON' : 'OFF'}]`;
  await writeAuditLog('INFO', 'Orchestration Engine', `Starting Multi-Agent sweep scan. ${scopeStr}`);

  // Fetch some metrics to log
  const overdueCount = (await fetchJoinedWorklist()).length;
  const missingAckCount = (await fetchJoinedAcknowledgementWorklist()).filter(a => a.acknowledgement_status === 'MISSING').length;
  const shortageCount = (await getCoordinationAlerts()).active.filter(a => a.impact_level !== 'WARNING').length;

  await writeAuditLog('SUCCESS', 'Orchestration Engine', `Scan complete. Found ${overdueCount} overdue items, ${missingAckCount} missing ACKs, and ${shortageCount} safety stock breaches.`);
  await writeAuditLog('INFO', 'AI Recommendation Engine', 'Synthesizing recommendations and compiling drafting queues...');

  if (filters?.autoSend) {
    const { pipeline } = await getMultiAgentPipeline(filters);
    const pendingToAutoSend = pipeline.filter(item => item.approval_status === 'PENDING' || item.approval_status === 'APPROVED');
    
    if (pendingToAutoSend.length > 0) {
      await writeAuditLog('WARNING', 'Orchestration Engine', `Autonomous bypass trigger: Auto-dispatching ${pendingToAutoSend.length} scoped actions.`);
      const idsToDispatch = pendingToAutoSend.map(item => item.id);
      await batchDispatchPipeline(idsToDispatch);
      await writeAuditLog('SUCCESS', 'Orchestration Engine', `Autonomous dispatch completed for ${pendingToAutoSend.length} actions.`);
    } else {
      await writeAuditLog('INFO', 'Orchestration Engine', 'Autonomous execution: No pending actions detected within the filtered scope.');
    }
  } else {
    await writeAuditLog('INFO', 'Orchestration Engine', 'Sweep complete. Drafted actions staged and waiting for human review.');
  }
}

export async function syncErpScheduleLine(poNumber: string, itemNumber: string): Promise<boolean> {
  try {
    const schedules = await readCsv('po_schedule_lines.csv');
    const exceptions = await readCsv('exception_worklist.csv');
    const grs = await readCsv('goods_receipts.csv');
    const asns = await readCsv('asn_shipments.csv');

    // Calculate actual FIFO allocations using our FIFO allocation engine
    const itemSchedules = schedules.filter(s => s.po_number === poNumber && s.item_number === itemNumber);
    const itemGrs = grs.filter(g => g.po_number === poNumber && g.item_number === itemNumber);
    const itemAsns = asns.filter(a => a.po_number === poNumber && a.item_number === itemNumber);
    const allocations = allocateFifoReceivedAndOpenQty(itemSchedules, itemGrs, itemAsns);

    let updatedSchedule = false;
    let updatedException = false;

    // 1. Update po_schedule_lines
    const newSchedules = schedules.map(s => {
      if (s.po_number === poNumber && s.item_number === itemNumber) {
        const allocKey = `${s.po_number}_${s.item_number}_${s.delivery_date}`;
        const alloc = allocations.get(allocKey);
        if (alloc) {
          updatedSchedule = true;
          return {
            ...s,
            received_qty: alloc.received_qty.toString(),
            open_qty: alloc.open_qty.toString()
          };
        }
      }
      return s;
    });

    // 2. Update exception_worklist if open_qty drops to 0
    const newExceptions = exceptions.map(ex => {
      if (ex.po_number === poNumber && ex.item_number === itemNumber) {
        const allocKey = `${ex.po_number}_${ex.item_number}_${ex.due_date}`;
        const alloc = allocations.get(allocKey);
        if (alloc) {
          updatedException = true;
          return {
            ...ex,
            status: alloc.open_qty === 0 ? 'RESOLVED' : ex.status
          };
        }
      }
      return ex;
    });

    if (updatedSchedule) {
      const headers = ['po_number','item_number','schedule_line','delivery_date','scheduled_qty','received_qty','open_qty','statistical_delivery_date','confirmed_date','confirmation_control_key'];
      const csvContent = [
        headers.join(','),
        ...newSchedules.map(row => headers.map(h => {
          const val = row[h] !== undefined && row[h] !== null ? row[h].toString() : '';
          return val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(','))
      ].join('\r\n') + '\r\n';
      fs.writeFileSync(path.join(DATA_ROOT, 'po_schedule_lines.csv'), csvContent, 'utf-8');
    }

    if (updatedException) {
      const headers = ['exception_id','exception_type','severity','status','po_number','item_number','material_id','plant','supplier_id','detected_on','due_date','days_past_due','root_cause','financial_impact_estimate','assigned_buyer'];
      const csvContent = [
        headers.join(','),
        ...newExceptions.map(row => headers.map(h => {
          const val = row[h] !== undefined && row[h] !== null ? row[h].toString() : '';
          return val.includes(',') ? `"${val.replace(/"/g, '""')}"` : val;
        }).join(','))
      ].join('\r\n') + '\r\n';
      fs.writeFileSync(path.join(DATA_ROOT, 'exception_worklist.csv'), csvContent, 'utf-8');
    }

    // Clear cache
    clearCache();
    return true;
  } catch (e) {
    console.error('Failed to sync ERP schedule line:', e);
    return false;
  }
}





