/**
 * Mock ERP Adapter — Release 1: Supplier Commitment Core
 *
 * This is the concrete adapter that backs the Procurement Data Service when
 * DATA_SOURCE_CONFIG.mode === 'mock_erp'.
 *
 * Architecture position:
 *   procurementDataService → mockErpService → csvDataService → CSV files
 *
 * Design rules:
 *   - Imports csvDataService DIRECTLY (no HTTP loopback via fetch('/api/...')).  
 *   - SERVER-SIDE ONLY. Never import this from a client component.
 *   - READ-ONLY in Phase 5/6A. Write/action methods are deferred to Phase 6+.
 *   - Exposes two layers of methods:
 *       1. Business-language camelCase methods (PurchaseOrderLine, Supplier, etc.)
 *          — for future consumers that adopt the canonical business types.
 *       2. Raw passthrough methods suffixed with Raw (e.g. getOverdueWorklistRaw)
 *          — preserve exact snake_case csvDataService response shapes so that
 *            existing API routes can migrate without breaking the frontend.
 *
 * When SAP OData or a real backend API is ready, create a parallel adapter
 * (e.g. src/services/sapOdataService.ts) with the same method signatures.
 * Switch the mode in src/config/dataSource.ts — no other files change.
 *
 * See: docs/INTEGRATION_CONTRACT.md
 */

import {
  getGlobalOverviewSummary,
  getDashboardOverviewDetails,
  getOverdueSummary,
  getOverdueWorklist,
  getExceptionDetail,
  getAcknowledgementSummary,
  getAcknowledgementWorklist,
  getSupplierPerformanceList,
  getSupplierPerformanceDetail,
  getFilterOptions,
  getRecommendationByException,
  padItemNumber,
  type OverdueWorklistItem,
  type ExceptionDetail,
  type AcknowledgementWorklistItem,
  type SupplierPerformanceItem,
  type SupplierPerformanceDetail,
  type FilteredSummary,
} from '@/src/services/data/csvDataService';

import type {
  ExecutiveOverviewSummary,
  PurchaseOrderLine,
  PurchaseOrderLineDetail,
  SupplierAcknowledgement,
  Supplier,
  SupplierAnalyticsSummary,
  PaginatedResponse,
  ProcurementFilterOptions,
  OverdueWorklistFilters,
  AcknowledgementFilters,
  SupplierAnalyticsFilters,
  AsnShipment,
  AcknowledgementDetails,
  CommunicationLog,
  ErpDiscrepancy,
  ActiveException,
  ActivePo,
} from '@/src/types/procurement';

// ---------------------------------------------------------------------------
// Internal field mappers
// Translate csvDataService snake_case shapes → camelCase business types.
// These mappers are the single place that knows about the CSV column names.
// ---------------------------------------------------------------------------

function mapToPurchaseOrderLine(item: OverdueWorklistItem): PurchaseOrderLine {
  return {
    id: item.exception_id,
    poNumber: item.po_number,
    itemNumber: item.item_number,
    scheduleLine: item.schedule_line,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    buyerId: item.assigned_buyer,
    buyerName: item.assigned_buyer,
    materialId: item.material_id,
    materialOrService: item.material_description,
    materialGroup: item.material_group,
    plant: item.plant,
    plantName: item.plant_name,
    purchasingGroup: item.purchasing_group,

    orderedQuantity: item.ordered_quantity,
    receivedQuantity: item.received_quantity,
    openQuantity: item.open_quantity,
    netPrice: item.net_price,
    openValue: item.open_value,
    confirmationControlKey: item.confirmationControlKey,

    requestedDeliveryDate: item.requested_delivery_date,

    status: item.status,
    acknowledgementStatus: item.acknowledgement_status,
    asnStatus: item.asn_status,

    overdueDays: item.days_overdue,
    severity: item.severity,
    priority: item.priorityLevel,
    priorityScore: item.priorityScore,
    delayLikelihoodScore: item.delayLikelihoodScore,
    delayCategory: item.delay_category,

    riskScore: item.risk_score,
    supplierTier: item.supplier_tier,
    country: item.country,
    onTimeDeliveryPct: item.on_time_delivery_pct,
    avgResponseDays: item.avg_response_days,
  };
}

function mapToPurchaseOrderLineDetail(detail: ExceptionDetail): PurchaseOrderLineDetail {
  const base = mapToPurchaseOrderLine(detail);

  const asnDetails: AsnShipment[] = (detail.asn_details ?? []).map(a => ({
    asnNumber: a.asn_number,
    shippedQty: a.shipped_qty,
    shipDate: a.ship_date,
    expectedDeliveryDate: a.expected_delivery_date,
    carrier: a.carrier,
    trackingNumber: a.tracking_number,
    status: a.status,
  }));

  const acknowledgementDetails: AcknowledgementDetails | null = detail.acknowledgement_details
    ? {
        acknowledgementStatus: detail.acknowledgement_details.acknowledgement_status,
        acknowledgedQty: detail.acknowledgement_details.acknowledged_qty,
        committedDeliveryDate: detail.acknowledgement_details.committed_delivery_date,
        lastSupplierResponseDate: detail.acknowledgement_details.last_supplier_response_date,
        responseSource: detail.acknowledgement_details.response_source,
        buyerFollowupCount: detail.acknowledgement_details.buyer_followup_count,
      }
    : null;

  const communicationLogs: CommunicationLog[] = (detail.communication_logs ?? []).map(l => ({
    messageId: l.message_id,
    direction: l.direction,
    subject: l.subject,
    body: l.body,
    sentDate: l.sent_date,
    receivedDate: l.received_date,
    sentiment: l.sentiment,
    sourceSystem: l.source_system,
  }));

  const erpDiscrepancy: ErpDiscrepancy | undefined = detail.erp_discrepancy
    ? {
        erpReceivedQty: detail.erp_discrepancy.erp_received_qty,
        erpOpenQty: detail.erp_discrepancy.erp_open_qty,
        actualReceivedQty: detail.erp_discrepancy.actual_received_qty,
        actualOpenQty: detail.erp_discrepancy.actual_open_qty,
        hasDiscrepancy: detail.erp_discrepancy.has_discrepancy,
      }
    : undefined;

  // Pull confirmed delivery date from ack details if available
  const confirmedDeliveryDate =
    acknowledgementDetails?.committedDeliveryDate || undefined;

  const lastAcknowledgementDate =
    acknowledgementDetails?.lastSupplierResponseDate || undefined;

  const lastFollowUpDate: string | undefined = communicationLogs
    .filter(l => l.direction === 'OUTBOUND' && l.sentDate)
    .map(l => l.sentDate)
    .sort()
    .at(-1);

  return {
    ...base,
    confirmedDeliveryDate,
    lastAcknowledgementDate,
    lastSupplierResponse: lastAcknowledgementDate,
    lastFollowUpDate,

    documentType: detail.document_type,
    poDate: detail.po_date,
    companyCode: detail.company_code,
    purchasingOrg: detail.purchasing_org,
    currency: detail.currency,
    createdBy: detail.created_by,
    headerStatus: detail.header_status,
    actualScheduleLine: detail.actual_schedule_line,
    storageLocation: detail.storage_location,
    leadTimeDays: detail.lead_time_days,
    safetyStock: detail.safety_stock,
    latestGoodsReceiptDate: detail.latest_goods_receipt_date,
    asnDetails,
    acknowledgementDetails,
    communicationLogs,
    erpDiscrepancy,
  };
}

function mapToSupplierAcknowledgement(item: AcknowledgementWorklistItem): SupplierAcknowledgement {
  return {
    poNumber: item.po_number,
    itemNumber: item.item_number,
    confirmationControlKey: item.confirmationControlKey,
    acknowledgementStatus: item.acknowledgement_status,
    acknowledgedQty: item.acknowledged_qty,
    committedDeliveryDate: item.committed_delivery_date,
    supplierConfirmNumber: item.supplier_confirm_number,
    lastSupplierResponseDate: item.last_supplier_response_date,
    responseSource: item.response_source,
    buyerFollowupCount: item.buyer_followup_count,
    materialId: item.material_id,
    materialDescription: item.material_description,
    plant: item.plant,
    plantName: item.plant_name,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    orderedQuantity: item.ordered_quantity,
    netPrice: item.net_price,
    openValue: item.open_value,
    onTimeDeliveryPct: item.on_time_delivery_pct,
    riskScore: item.risk_score,
    overdueDays: item.days_overdue,
    severity: item.severity,
    exceptionId: item.exception_id,
    priorityScore: item.priorityScore,
    priority: item.priorityLevel,
  };
}

function mapToSupplier(item: SupplierPerformanceItem): Supplier {
  return {
    supplierId: item.supplier_id,
    supplierName: item.supplier_name,
    supplierTier: item.supplier_tier,
    country: item.country,
    paymentTerms: item.payment_terms,
    incoterms: item.incoterms,
    riskScore: item.risk_score,
    avgResponseDays: item.avg_response_days,
    onTimeDeliveryPct: item.on_time_delivery_pct,
    qualityPpm: item.quality_ppm,
    blockedFlag: item.blocked_flag,
    totalPos: item.total_pos,
    openSpend: item.open_spend,
    activeExceptionsCount: item.active_exceptions_count,
  };
}

function mapToSupplierAnalyticsSummary(detail: SupplierPerformanceDetail): SupplierAnalyticsSummary {
  const base = mapToSupplier(detail);

  const activeExceptions: ActiveException[] = (detail.active_exceptions ?? []).map((e: any) => ({
    exceptionId: e.exception_id,
    exceptionType: e.exception_type,
    severity: e.severity,
    status: e.status,
    poNumber: e.po_number,
    itemNumber: e.item_number,
    materialId: e.material_id,
    materialDescription: e.material_description,
    plant: e.plant,
    daysOverdue: e.days_overdue,
    dueDate: e.due_date,
  }));

  const activePos: ActivePo[] = (detail.active_pos ?? []).map((p: any) => ({
    poNumber: p.po_number,
    poDate: p.po_date,
    status: p.status,
    companyCode: p.company_code,
    purchasingOrg: p.purchasing_org,
    purchasingGroup: p.purchasing_group,
    currency: p.currency,
  }));

  return { ...base, activeExceptions, activePos };
}

function mapFilteredSummary(fs: FilteredSummary) {
  return {
    totalLines: fs.totalLines,
    totalValue: fs.totalValue,
    totalQty: fs.totalQty,
    criticalLines: fs.criticalLines,
    averageDays: fs.averageDays,
  };
}

// ---------------------------------------------------------------------------
// Public adapter methods (read-only, Release 1)
// ---------------------------------------------------------------------------

/**
 * Returns the combined Executive Overview payload:
 * global KPIs + dashboard chart data + overdue summary metrics.
 */
export async function getExecutiveOverview(): Promise<ExecutiveOverviewSummary> {
  const [globalSummary, dashboardDetails, overdueSummary] = await Promise.all([
    getGlobalOverviewSummary(),
    getDashboardOverviewDetails(),
    getOverdueSummary(),
  ]);

  return {
    // Global KPIs
    totalPoLines: globalSummary.totalPoLines,
    openPoLines: globalSummary.openPoLines,
    overduePoLines: globalSummary.overduePoLines,
    missingAcknowledgements: globalSummary.missingAck,
    asnDelays: globalSummary.asnDelays,

    // Scope
    supplierCount: globalSummary.suppliers,
    materialCount: globalSummary.materials,
    plantCount: globalSummary.plants,

    // Financial
    openPoValue: globalSummary.openPoValue,
    inventoryAtRisk: globalSummary.inventoryAtRisk,

    // Overdue drill-down
    totalOpenQty: overdueSummary.totalOpenQty,
    totalOverdueValue: overdueSummary.totalOverdueValue,
    criticalOverdueLines: overdueSummary.criticalOverduePoLines,
    suppliersWithOverdue: overdueSummary.suppliersWithOverdue,
    plantsImpacted: overdueSummary.plantsImpacted,
    averageDaysOverdue: overdueSummary.averageDaysOverdue,

    // Chart data
    spendBySupplier: dashboardDetails.spendBySupplier.map(s => ({
      id: s.id,
      name: s.name,
      value: s.value,
    })),
    spendByPlant: dashboardDetails.spendByPlant.map(p => ({
      code: p.code,
      name: p.name,
      value: p.value,
    })),
    spendByMaterialGroup: dashboardDetails.spendByMaterialGroup.map(m => ({
      category: m.category,
      value: m.value,
    })),
    supplierRiskDistribution: dashboardDetails.supplierRiskDistribution,
    recentActivity: dashboardDetails.recentActivity.map(r => ({
      poNumber: r.po_number,
      poDate: r.po_date,
      supplierName: r.supplier_name,
      itemsCount: r.items_count,
      openValue: r.open_value,
      releaseStatus: r.release_status,
      headerStatus: r.header_status,
    })),
  };
}

/**
 * Returns overdue summary KPIs (tile metrics for the Overdue Workbench header).
 */
export async function getOverdueSummaryMetrics() {
  return getOverdueSummary();
}

/**
 * Returns a paginated, filtered list of overdue PO schedule lines.
 */
export async function getOverduePurchaseOrderLines(
  filters: OverdueWorklistFilters
): Promise<PaginatedResponse<PurchaseOrderLine>> {
  const result = await getOverdueWorklist(filters);
  return {
    data: result.data.map(mapToPurchaseOrderLine),
    total: result.total,
    filteredSummary: mapFilteredSummary(result.filteredSummary),
  };
}

/**
 * Returns the full detail context for a single PO schedule line (drawer panel).
 */
export async function getPurchaseOrderLineDetail(
  poNumber: string,
  itemNumber: string,
  scheduleLine: string
): Promise<PurchaseOrderLineDetail | null> {
  const detail = await getExceptionDetail(poNumber, itemNumber, scheduleLine);
  if (!detail) return null;
  return mapToPurchaseOrderLineDetail(detail);
}

/**
 * Returns the acknowledgement summary KPIs (tile metrics for Supplier Acks header).
 */
export async function getAcknowledgementSummaryMetrics() {
  return getAcknowledgementSummary();
}

/**
 * Returns a paginated, filtered list of supplier acknowledgement items.
 */
export async function getSupplierAcknowledgements(
  filters: AcknowledgementFilters
): Promise<PaginatedResponse<SupplierAcknowledgement>> {
  const result = await getAcknowledgementWorklist(filters);
  return {
    data: result.data.map(mapToSupplierAcknowledgement),
    total: result.total,
    filteredSummary: mapFilteredSummary(result.filteredSummary),
  };
}

/**
 * Returns the flat supplier analytics list (scorecard grid).
 */
export async function getSupplierAnalytics(
  filters: SupplierAnalyticsFilters
): Promise<Supplier[]> {
  const list = await getSupplierPerformanceList(filters);
  return list.map(mapToSupplier);
}

/**
 * Returns the detail scorecard for a single supplier (drawer panel).
 */
export async function getSupplierDetail(
  supplierId: string
): Promise<SupplierAnalyticsSummary | null> {
  const detail = await getSupplierPerformanceDetail(supplierId);
  if (!detail) return null;
  return mapToSupplierAnalyticsSummary(detail);
}

/**
 * Returns filter option lists for the filter bar dropdowns.
 */
export async function getFilterOptionsMock(): Promise<ProcurementFilterOptions> {
  const opts = await getFilterOptions();
  return {
    plants: opts.plants,
    suppliers: opts.suppliers,
    purchasingGroups: opts.purchasingGroups,
    materialGroups: opts.materialGroups,
  };
}

// ---------------------------------------------------------------------------
// Raw passthrough methods — Phase 6A
//
// These methods return the exact snake_case shapes produced by csvDataService.
// They exist so API routes can import procurementDataService (not csvDataService)
// while the frontend's existing snake_case field references continue to work.
//
// Naming convention: <methodName>Raw
// ---------------------------------------------------------------------------

/**
 * Raw: GlobalOverviewSummary shape (used by GET /api/overview/summary).
 */
export async function getGlobalOverviewSummaryRaw() {
  return getGlobalOverviewSummary();
}

/**
 * Raw: DashboardOverviewDetails shape (used by GET /api/overview/details).
 */
export async function getDashboardOverviewDetailsRaw() {
  return getDashboardOverviewDetails();
}

/**
 * Raw: Paginated overdue worklist with snake_case items
 * (used by GET /api/po-overdue/worklist).
 */
export async function getOverdueWorklistRaw(filters: OverdueWorklistFilters) {
  return getOverdueWorklist(filters);
}

/**
 * Raw: ExceptionDetail shape (used by GET /api/po-overdue/detail).
 */
export async function getPurchaseOrderLineDetailRaw(
  poNumber: string,
  itemNumber: string,
  scheduleLine: string
) {
  return getExceptionDetail(poNumber, itemNumber, scheduleLine);
}

/**
 * Raw: AcknowledgementSummary shape (used by GET /api/po-acknowledgement/summary).
 */
export async function getAcknowledgementSummaryRaw() {
  return getAcknowledgementSummary();
}

/**
 * Raw: Paginated ack worklist with snake_case items
 * (used by GET /api/po-acknowledgement/worklist).
 */
export async function getAcknowledgementWorklistRaw(filters: AcknowledgementFilters) {
  return getAcknowledgementWorklist(filters);
}

/**
 * Raw: SupplierPerformanceItem[] shape (used by GET /api/supplier-performance/list).
 */
export async function getSupplierAnalyticsRaw(filters: SupplierAnalyticsFilters) {
  return getSupplierPerformanceList(filters);
}

/**
 * Raw: SupplierPerformanceDetail shape (used by GET /api/supplier-performance/detail).
 */
export async function getSupplierDetailRaw(supplierId: string) {
  return getSupplierPerformanceDetail(supplierId);
}

/**
 * Raw: filter options (used by GET /api/filters).
 */
export async function getFilterOptionsRaw() {
  return getFilterOptions();
}

/**
 * Raw: guided action recommendation (used by GET /api/recommendations).
 */
export async function getRecommendationByExceptionRaw(
  exceptionId: string,
  poNumber: string,
  itemNumber: string,
  agentName: 'PO_OVERDUE_AGENT' | 'SUPPLIER_ACK_AGENT' | 'PART_AVAILABILITY_AGENT'
) {
  return getRecommendationByException(exceptionId, poNumber, itemNumber, agentName);
}

/**
 * Exposes supplier contact email lookup from source CSV.
 */
export async function getSupplierContactEmail(supplierId: string): Promise<string | undefined> {
  const { readCsv } = await import('@/src/services/data/csvDataService');
  const contacts = await readCsv('supplier_contacts.csv');
  const contact = contacts.find(c => c.supplier_id === supplierId && c.primary_flag === 'Y');
  return contact ? contact.email : undefined;
}

/**
 * Exposes a register of all active purchase orders from source CSVs.
 */
export async function getPurchaseOrderRegisterRaw(): Promise<any[]> {
  const { readCsv } = await import('@/src/services/data/csvDataService');
  const [items, headers, suppliers, acks, schedules, grs] = await Promise.all([
    readCsv('purchase_order_items.csv'),
    readCsv('purchase_order_headers.csv'),
    readCsv('suppliers.csv'),
    readCsv('supplier_acknowledgements.csv'),
    readCsv('po_schedule_lines.csv'),
    readCsv('goods_receipts.csv')
  ]);

  return items.map((item: any) => {
    const header = headers.find(h => h.po_number === item.po_number);
    const supplierId = header ? header.supplier_id : '';
    const supplier = suppliers.find(s => s.supplier_id === supplierId);
    const ack = acks.find(a => a.po_number === item.po_number && padItemNumber(a.item_number) === padItemNumber(item.item_number));

    const itemGrs = grs.filter(g => g.po_number === item.po_number && padItemNumber(g.item_number) === padItemNumber(item.item_number));
    const receivedQuantity = itemGrs.reduce((sum, g) => sum + parseFloat(g.received_qty || '0'), 0);
    const orderedQuantity = parseFloat(item.order_qty || '0');
    const openQuantity = Math.max(0, orderedQuantity - receivedQuantity);

    const itemSchedules = schedules.filter(s => s.po_number === item.po_number && padItemNumber(s.item_number) === padItemNumber(item.item_number));
    
    const itemConfKey = item.confirmation_control_key;
    const schedConfKey = itemSchedules.find(s => s.confirmation_control_key)?.confirmation_control_key;

    let confirmationControlKey = null;
    if (itemConfKey !== undefined && itemConfKey !== null) {
      confirmationControlKey = itemConfKey.trim();
    } else if (schedConfKey !== undefined && schedConfKey !== null && schedConfKey.trim() !== '') {
      confirmationControlKey = schedConfKey.trim();
      console.warn(`[Migration Compatibility Warning] purchase_order_items.confirmation_control_key is missing for PO ${item.po_number} Item ${item.item_number}, falling back to po_schedule_lines.confirmation_control_key (${schedConfKey})`);
    }
    const requiresAck = confirmationControlKey === 'ZACK';

    return {
      poNumber: item.po_number,
      itemNumber: item.item_number,
      materialId: item.material_id,
      materialDescription: item.material_description,
      orderedQuantity,
      unitPrice: parseFloat(item.net_price || '0'),
      totalValue: parseFloat(item.item_value || '0'),
      deliveryDate: item.delivery_date,
      supplierId: supplierId,
      supplierName: supplier ? supplier.supplier_name : '',
      deletionFlag: item.deletion_flag || 'N',
      deliveryCompletedFlag: item.delivery_completed_flag || 'N',
      headerStatus: header ? (header.header_status || header.status || '') : '',
      acknowledgementStatus: ack ? (ack.acknowledgement_status || 'MISSING') : (requiresAck ? 'MISSING' : 'NOT_REQUIRED'),
      acknowledgementRequired: requiresAck ? 'Y' : 'N',
      committedDeliveryDate: ack ? (ack.committed_delivery_date || '') : '',
      receivedQuantity,
      openQuantity,
      confirmationControlKey: confirmationControlKey || ''
    };
  });
}

/**
 * Exposes the full Control Tower summary from source data.
 */
export async function getControlTowerSummaryRaw(): Promise<any> {
  const { getControlTowerSummary } = await import('@/src/services/data/csvDataService');
  return getControlTowerSummary();
}

