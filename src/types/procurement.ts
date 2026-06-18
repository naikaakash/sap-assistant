/**
 * Procurement Core Business Types — Release 1: Supplier Commitment Core
 *
 * These types are the canonical business-language representation of procurement
 * data used across the four enabled Release 1 modules:
 *   1. Executive Overview
 *   2. Overdue PO Workbench
 *   3. Supplier Acknowledgements
 *   4. Supplier Analytics
 *
 * Field rules (from docs/FIELD_DEFINITIONS.md & PROJECT_CONTEXT.md):
 *   - Open Quantity = Max(0, Ordered Quantity − Received Quantity)
 *   - For schedule-line workbench rows, quantities are at schedule-line level.
 *   - Numeric business fields where 0 is valid must not use || fallback.
 *   - Derived fields are computed in the backend service layer only.
 */

// ---------------------------------------------------------------------------
// Shared sub-types
// ---------------------------------------------------------------------------

export interface AsnShipment {
  asnNumber: string;
  shippedQty: number;
  shipDate: string;
  expectedDeliveryDate: string;
  carrier: string;
  trackingNumber: string;
  status: string;
}

export interface AcknowledgementDetails {
  acknowledgementStatus: string;
  acknowledgedQty: number;
  committedDeliveryDate: string;
  lastSupplierResponseDate: string;
  responseSource: string;
  buyerFollowupCount: number;
}

export interface CommunicationLog {
  messageId: string;
  direction: string;
  subject: string;
  body: string;
  sentDate: string;
  receivedDate: string;
  sentiment: string;
  sourceSystem: string;
}

export interface ErpDiscrepancy {
  erpReceivedQty: number;
  erpOpenQty: number;
  actualReceivedQty: number;
  actualOpenQty: number;
  hasDiscrepancy: boolean;
}

export interface SpendBySupplier {
  id: string;
  name: string;
  value: number;
}

export interface SpendByPlant {
  code: string;
  name: string;
  value: number;
}

export interface SpendByMaterialGroup {
  category: string;
  value: number;
}

export interface SupplierRiskDistribution {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface RecentPoActivity {
  poNumber: string;
  poDate: string;
  supplierName: string;
  itemsCount: number;
  openValue: number;
  releaseStatus: string;
  headerStatus: string;
}

export interface ActiveException {
  exceptionId: string;
  exceptionType: string;
  severity: string;
  status: string;
  poNumber: string;
  itemNumber: string;
  materialId: string;
  materialDescription: string;
  plant: string;
  daysOverdue: number;
  dueDate: string;
}

export interface ActivePo {
  poNumber: string;
  poDate: string;
  status: string;
  companyCode: string;
  purchasingOrg: string;
  purchasingGroup: string;
  currency: string;
}

// ---------------------------------------------------------------------------
// Filter parameter types
// ---------------------------------------------------------------------------

export interface OverdueWorklistFilters {
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
}

export interface AcknowledgementFilters {
  plant?: string;
  supplier?: string;
  purchasingGroup?: string;
  acknowledgementStatus?: string;
  search?: string;
  limit?: number;
  offset?: number;
  sortBy?: string;
}

export interface SupplierAnalyticsFilters {
  search?: string;
  tier?: string;
  riskLevel?: string;
  blocked?: string;
  sortBy?: string;
}

// ---------------------------------------------------------------------------
// Core business types
// ---------------------------------------------------------------------------

/**
 * PurchaseOrderLine — a single PO schedule-line row in the overdue workbench.
 * All quantity fields are at schedule-line level, not PO item level.
 * See: docs/FIELD_DEFINITIONS.md §2 (Schedule Line Quantity), §4 (Open Quantity)
 */
export interface PurchaseOrderLine {
  // Identity
  id: string;                   // exception_id from exception_worklist.csv
  poNumber: string;             // po_number
  itemNumber: string;           // item_number
  scheduleLine: string;         // schedule_line from po_schedule_lines.csv
  supplierId: string;           // supplier_id
  supplierName: string;         // supplier_name
  buyerId: string;              // assigned_buyer
  buyerName: string;            // assigned_buyer (display alias)
  materialId: string;           // material_id
  materialOrService: string;    // material_description
  materialGroup: string;        // material_group / item_category
  plant: string;                // plant
  plantName: string;            // plant_name
  purchasingGroup: string;      // purchasing_group

  // Quantities — schedule-line level (see Field Trust Rule)
  orderedQuantity: number;      // scheduled_qty from po_schedule_lines.csv
  receivedQuantity: number;     // FIFO-allocated received_qty
  openQuantity: number;         // Max(0, orderedQuantity − receivedQuantity)
  netPrice: number;             // net_price from purchase_order_items.csv
  openValue: number;            // openQuantity * netPrice
  confirmationControlKey?: string; // confirmation_control_key from purchase_order_items.csv (with schedule-line fallback)

  // Dates
  requestedDeliveryDate: string;   // due_date / delivery_date (date-shifted)
  confirmedDeliveryDate?: string;  // committed_delivery_date from acks

  // Status fields
  status: string;                  // 'RESOLVED' when openQuantity === 0
  acknowledgementStatus: string;   // acknowledgement_status (defaults 'MISSING')
  asnStatus: string;               // asn_status (NONE / IN_TRANSIT / DELAYED …)
  lastAcknowledgementDate?: string; // last_supplier_response_date from acks
  lastSupplierResponse?: string;   // last_supplier_response_date (alias)
  lastFollowUpDate?: string;       // latest sent_date from communication_logs

  // Priority & urgency (derived, backend-calculated only)
  overdueDays: number;             // Max(0, TODAY_DATE − requestedDeliveryDate)
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';  // priorityLevel
  priorityScore: number;           // 0–100 logarithmic score
  delayLikelihoodScore?: number;   // 0–100 predictive score
  delayCategory: string;           // root cause category

  // Supplier analytics snapshot
  riskScore: number;               // risk_score from suppliers.csv
  supplierTier: string;            // supplier_tier
  country: string;                 // country
  onTimeDeliveryPct: number;       // on_time_delivery_pct
  avgResponseDays: number;         // avg_response_days
}

/**
 * PurchaseOrderLineDetail — full detail context for the drawer panel.
 * Extends PurchaseOrderLine with header data, ASN details, comms, and ERP sync.
 */
export interface PurchaseOrderLineDetail extends PurchaseOrderLine {
  // PO header fields (ERP-owned)
  documentType: string;           // document_type
  poDate: string;                 // po_date
  companyCode: string;            // company_code
  purchasingOrg: string;          // purchasing_org
  currency: string;               // currency
  createdBy: string;              // created_by
  headerStatus?: string;          // header_status
  actualScheduleLine?: string;    // actual_schedule_line

  // Item-level ERP data
  storageLocation: string;        // storage_location
  leadTimeDays: number;           // planned_delivery_time_days
  safetyStock: number;            // safety_stock

  // GR / ASN activity
  latestGoodsReceiptDate: string; // latest posting_date from goods_receipts.csv
  asnDetails: AsnShipment[];
  acknowledgementDetails: AcknowledgementDetails | null;
  communicationLogs: CommunicationLog[];

  // ERP sync integrity check
  erpDiscrepancy?: ErpDiscrepancy;
}

/**
 * SupplierAcknowledgement — a row in the Supplier Acks worklist.
 * Granularity: PO Item (not schedule-line).
 */
export interface SupplierAcknowledgement {
  poNumber: string;
  itemNumber: string;
  confirmationControlKey?: string;
  acknowledgementStatus: string;    // ACKNOWLEDGED / MISSING / PRICE_DISPUTE / …
  acknowledgedQty: number;
  committedDeliveryDate: string;
  supplierConfirmNumber: string;
  lastSupplierResponseDate: string;
  responseSource: string;
  buyerFollowupCount: number;
  materialId: string;
  materialDescription: string;
  plant: string;
  plantName: string;
  supplierId: string;
  supplierName: string;

  // Quantities — PO item level for acks screen
  orderedQuantity: number;          // order_qty from purchase_order_items.csv
  netPrice: number;
  openValue: number;                // orderedQuantity * netPrice

  // Metrics
  onTimeDeliveryPct: number;
  riskScore: number;
  overdueDays: number;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  exceptionId: string;
  priorityScore: number;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';  // priorityLevel
}

/**
 * Supplier — core supplier master entity used in Supplier Analytics.
 */
export interface Supplier {
  supplierId: string;
  supplierName: string;
  supplierTier: string;
  country: string;
  paymentTerms: string;
  incoterms: string;
  riskScore: number;
  avgResponseDays: number;
  onTimeDeliveryPct: number;
  qualityPpm: number;
  blockedFlag: string;             // 'Y' | 'N'
  totalPos: number;
  openSpend: number;
  activeExceptionsCount: number;
}

/**
 * SupplierAnalyticsSummary — supplier detail panel with active exceptions & POs.
 */
export interface SupplierAnalyticsSummary extends Supplier {
  activeExceptions: ActiveException[];
  activePos: ActivePo[];
}

/**
 * ExecutiveOverviewSummary — combined KPI payload for the Executive Overview module.
 * Merges: GlobalOverviewSummary + DashboardOverviewDetails + OverdueSummary.
 */
export interface ExecutiveOverviewSummary {
  // --- Global KPIs ---
  totalPoLines: number;
  openPoLines: number;
  overduePoLines: number;
  missingAcknowledgements: number;  // missingAck
  asnDelays: number;

  // --- Scope ---
  supplierCount: number;
  materialCount: number;
  plantCount: number;

  // --- Financial ---
  openPoValue: number;
  inventoryAtRisk: number;

  // --- Overdue drill-down metrics ---
  totalOpenQty: number;
  totalOverdueValue: number;
  criticalOverdueLines: number;
  suppliersWithOverdue: number;
  plantsImpacted: number;
  averageDaysOverdue: number;

  // --- Chart data ---
  spendBySupplier: SpendBySupplier[];
  spendByPlant: SpendByPlant[];
  spendByMaterialGroup: SpendByMaterialGroup[];
  supplierRiskDistribution: SupplierRiskDistribution;
  recentActivity: RecentPoActivity[];
}

/**
 * FollowUpAction — placeholder type for Phase 6 write path design.
 * Read-only in Phase 5; defined here so the type contract is visible.
 */
export interface FollowUpAction {
  recommendationId: string;
  exceptionId: string;
  poNumber: string;
  itemNumber: string;
  supplierId: string;
  agentName: string;
  draftSubject: string;
  draftMessage: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'SENT' | 'REJECTED';
  targetDestination: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Paginated response wrapper
// ---------------------------------------------------------------------------

export interface FilteredSummaryMetrics {
  totalLines: number;
  totalValue: number;
  totalQty: number;
  criticalLines: number;
  averageDays: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  filteredSummary: FilteredSummaryMetrics;
}

// ---------------------------------------------------------------------------
// Filter options (for filter bar dropdowns)
// ---------------------------------------------------------------------------

export interface ProcurementFilterOptions {
  plants: Array<{ code: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
  purchasingGroups: string[];
  materialGroups: string[];
}
