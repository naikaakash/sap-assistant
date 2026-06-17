'use client';

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { MODULE_CONFIGS } from '@/src/config/modules';
import type { ProcurementAction } from '@/src/types/procurementActions';
import RecommendationWorklist from '@/src/components/RecommendationWorklist';
const computeSupplierSentiment = (detail: any) => {
  if (!detail) return 'POSITIVE';
  if (detail.status === 'RESOLVED' || detail.status === 'CLOSED' || detail.status === 'CONFIRMED_RESOLVED') {
    return 'POSITIVE';
  }
  const logs = detail.communication_logs || [];
  const committed = detail.acknowledgement_details?.committed_delivery_date;
  const requested = detail.requested_delivery_date;
  if (committed && requested && new Date(committed).getTime() > new Date(requested).getTime()) {
    return 'CAUTION';
  }
  if (detail.acknowledgement_status === 'MISSING') {
    return 'CAUTION';
  }
  const hasNegativeLogs = logs.some((l: any) => 
    l.sentiment === 'negative' || 
    l.body.toLowerCase().includes('delay') || 
    l.body.toLowerCase().includes('sorry') || 
    l.body.toLowerCase().includes('unable') || 
    l.body.toLowerCase().includes('backorder')
  );
  if (hasNegativeLogs) {
    return 'CAUTION';
  }
  const hasSupplierResponse = logs.some((l: any) => l.source_system === 'Supplier response received');
  if (hasSupplierResponse) {
    return 'POSITIVE';
  }
  return 'POSITIVE';
};


interface SummaryMetrics {
  totalOpenPoLines: number;
  totalOverduePoLines: number;
  criticalOverduePoLines: number;
  totalOpenQty: number;
  totalOverdueValue: number;
  suppliersWithOverdue: number;
  plantsImpacted: number;
  averageDaysOverdue: number;
}

interface WorklistItem {
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
  delay_category: string;
  on_time_delivery_pct: number;
  avg_response_days: number;
  risk_score: number;
  supplier_tier: string;
  country: string;
  priorityScore: number;
  priorityLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  delayLikelihoodScore?: number;
}

interface ExceptionDetail extends WorklistItem {
  document_type: string;
  po_date: string;
  company_code: string;
  purchasing_org: string;
  currency: string;
  created_by: string;
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
  actions?: ProcurementAction[];
}

interface DashboardOverviewDetails {
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

interface GlobalOverviewSummary {
  totalPoLines: number;
  openPoLines: number;
  overduePoLines: number;
  missingAck: number;
  asnDelays: number;
  suppliers: number;
  materials: number;
  plants: number;
  openPoValue: number;
  inventoryAtRisk: number;
}

interface WorkflowAuditLog {
  timestamp: string;
  level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  agent: string;
  message: string;
}

interface UnifiedPipelineItem {
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

interface MonitoringAnomaly {
  id: string;
  timestamp: string;
  anomaly_type: 'SAFETY_STOCK_BREACH' | 'NEW_OVERDUE_LINE' | 'CONFIRMATION_DELAY' | 'RISK_SPIKE';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  po_number?: string;
  item_number?: string;
  material_id: string;
  plant: string;
  description: string;
  status: 'ACTIVE' | 'RESOLVED' | 'MUTED';
  value_at_risk: number;
}

interface MonitoringActivityLog {
  timestamp: string;
  type: 'HEARTBEAT' | 'SCAN_START' | 'SCAN_COMPLETE' | 'ALERT_GEN' | 'STATE_CHANGE' | 'ANOMALY_RESOLVED';
  message: string;
}

interface SupervisorState {
  isActive: boolean;
  scanIntervalSeconds: number;
  alertThresholdValue: number;
  uptime: string;
  scansCount: number;
}

export default function BuyerPlannerWorkbench() {
  // Dynamic today date state to avoid hydration mismatch
  const [todayDate, setTodayDate] = useState('2026-05-28');
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setTodayDate(`${y}-${m}-${d}`);
  }, []);

  // Navigation State Sourced
  const [activeTab, setActiveTab] = useState<'overview' | 'overdue' | 'acknowledgement' | 'recommendations' | 'part' | 'supplier-analytics' | 'exception-analytics' | 'buyer-productivity' | 'control-tower' | 'copilot' | 'reminders' | 'collaboration' | 'workflow-pipeline' | 'autonomous-monitoring'>('overview');

  const isModuleEnabled = (key: string): boolean => {
    const config = MODULE_CONFIGS.find(m => m.key === key);
    return config ? config.enabled : false;
  };

  const renderNotConfigured = (key: string) => {
    const config = MODULE_CONFIGS.find(m => m.key === key);
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-color)',
        borderRadius: '0.75rem',
        padding: '3rem 2rem',
        margin: '2rem auto',
        maxWidth: '600px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      }}>
        <span style={{ fontSize: '3.5rem', marginBottom: '1.5rem' }}>{config?.icon || '⚠️'}</span>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
          {config?.label || key}
        </h2>
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          color: '#f87171',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '0.375rem',
          padding: '0.5rem 1rem',
          fontSize: '0.75rem',
          fontWeight: 600,
          marginBottom: '1.5rem',
          display: 'inline-block'
        }}>
          Intentionally Not Configured
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6', maxWidth: '450px', margin: '0 auto' }}>
          This capability is not configured for Release 1: Supplier Commitment Core. It will be enabled later when the core supplier commitment workflow is mature.
        </p>
      </div>
    );
  };

  // Phase 4E: Multi-Agent Workflow states
  const [workflowItems, setWorkflowItems] = useState<UnifiedPipelineItem[]>([]);
  const [workflowAuditLogs, setWorkflowAuditLogs] = useState<WorkflowAuditLog[]>([]);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowScanning, setWorkflowScanning] = useState(false);
  const [workflowPlantFilter, setWorkflowPlantFilter] = useState('');
  const [workflowBuyerFilter, setWorkflowBuyerFilter] = useState('');
  const [workflowTypeFilter, setWorkflowTypeFilter] = useState('ALL');
  const [workflowAutoSend, setWorkflowAutoSend] = useState(false);
  const [workflowSelectedIds, setWorkflowSelectedIds] = useState<string[]>([]);
  const [workflowPage, setWorkflowPage] = useState(1);
  const WORKFLOW_PAGE_SIZE = 20;
  const [editingWorkflowItem, setEditingWorkflowItem] = useState<UnifiedPipelineItem | null>(null);

  // Phase 5A: Autonomous Monitoring states
  const [monitoringAnomalies, setMonitoringAnomalies] = useState<MonitoringAnomaly[]>([]);
  const [monitoringLogs, setMonitoringLogs] = useState<MonitoringActivityLog[]>([]);
  const [supervisorState, setSupervisorState] = useState<SupervisorState | null>(null);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [monitoringScanning, setMonitoringScanning] = useState(false);
  const [monitoringToggling, setMonitoringToggling] = useState(false);
  const [monitoringIntervalInput, setMonitoringIntervalInput] = useState<string>('30');
  const [monitoringFilter, setMonitoringFilter] = useState<'ALL' | 'ACTIVE' | 'RESOLVED'>('ACTIVE');
  const [monitoringTypeFilter, setMonitoringTypeFilter] = useState('ALL');
  const [monitoringPage, setMonitoringPage] = useState(1);
  const MONITORING_PAGE_SIZE = 15;


  // Phase 4A: Supplier Reminder Agent states
  const [remindersList, setRemindersList] = useState<any[]>([]);
  const [sentRemindersList, setSentRemindersList] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingReminder, setEditingReminder] = useState<any | null>(null);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [remindersFilter, setRemindersFilter] = useState<'ALL' | 'PENDING' | 'APPROVED'>('ALL');
  const [remindersPage, setRemindersPage] = useState(1);
  const [remindersLimit, setRemindersLimit] = useState('25');

  // Phase 4B: Acknowledgement Follow-Up Agent states
  const [agentSubTab, setAgentSubTab] = useState<'overdue_po' | 'ack_followup' | 'escalation'>('overdue_po');
  const [ackFollowupQueue, setAckFollowupQueue] = useState<any[]>([]);
  const [ackFollowupSentList, setAckFollowupSentList] = useState<any[]>([]);
  const [ackFollowupLoading, setAckFollowupLoading] = useState(false);

  // Phase 4C: Escalation Agent states
  const [escalationTriggers, setEscalationTriggers] = useState<any[]>([]);
  const [escalationHistory, setEscalationHistory] = useState<any[]>([]);
  const [escalationLoading, setEscalationLoading] = useState(false);

  // Phase 4D: Planner Collaboration Agent states
  const [coordinationActive, setCoordinationActive] = useState<any[]>([]);
  const [coordinationHistory, setCoordinationHistory] = useState<any[]>([]);
  const [coordinationLoading, setCoordinationLoading] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [coordinationFilter, setCoordinationFilter] = useState<'ALL' | 'UNRESOLVED' | 'IN_COORDINATION'>('ALL');
  const [buyerNotesInput, setBuyerNotesInput] = useState('');
  const [resolutionAction, setResolutionAction] = useState<'EXPEDITE_PO' | 'USE_ALTERNATE_SOURCE' | 'ADJUST_PRODUCTION' | 'NONE'>('NONE');
  const [coordMrpTimelineData, setCoordMrpTimelineData] = useState<any | null>(null);
  const [coordMrpTimelineLoading, setCoordMrpTimelineLoading] = useState(false);



  // AI Sourcing Copilot states (Phase 3A)
  const [copilotMessages, setCopilotMessages] = useState<any[]>([
    {
      role: 'assistant',
      content: `Hello! I am your elite **AI Procurement Sourcing Copilot**. 

I have real-time access to the **Buyer/Planner Control Tower summary, Manufacturing Plant Health records, and Priority Unresolved Exceptions**. 

How can I help you optimize your supply chain today? Feel free to ask me questions, or click one of the suggested queries below!`
    }
  ]);
  const [copilotInput, setCopilotInput] = useState('');
  const [copilotLoading, setCopilotLoading] = useState(false);

  const copilotChatEndRef = React.useRef<HTMLDivElement | null>(null);

  const latestCopilotMessage = copilotMessages[copilotMessages.length - 1]?.content ?? '';

  useEffect(() => {
    const scrollTimer = window.setTimeout(() => {
      copilotChatEndRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'end'
      });
    }, 50);

    return () => window.clearTimeout(scrollTimer);
  }, [copilotMessages.length, latestCopilotMessage, copilotLoading]);

  // Phase 3B: AI Root Cause Analysis states
  const [aiRootCause, setAiRootCause] = useState<any | null>(null);
  const [aiRootCauseLoading, setAiRootCauseLoading] = useState(false);

  // Phase 3B: Cumulative token tracker + sidebar diagnostics panel state
  const [cumulativeTokens, setCumulativeTokens] = useState<{ totalTokens: number; totalCost: number; sessionCount: number } | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Collapsible left sidebar (Azure DevOps-style icon rail). Persisted to localStorage.
  // Collapsed = 60px icon rail + hover-expand overlay. Expanded = pinned-open 260px.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem('pc.sidebar.collapsed');
      if (saved === '1') setSidebarCollapsed(true);
    } catch {}
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem('pc.sidebar.collapsed', sidebarCollapsed ? '1' : '0'); } catch {}
  }, [sidebarCollapsed]);
  // Auto-close the diagnostics panel and user menu when the sidebar collapses,
  // so their content doesn't leak out of the 60px rail.
  useEffect(() => {
    if (sidebarCollapsed) {
      setShowDiagnostics(false);
      setUserMenuOpen(false);
    }
  }, [sidebarCollapsed]);

  // Auth.js session for the user account button in the sidebar footer
  const [session, setSession] = useState<{ user?: { name?: string | null; email?: string | null; image?: string | null } } | null>(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setSession(d && d.user ? d : null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = () => setUserMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [userMenuOpen]);
  const userName = session?.user?.name || session?.user?.email || 'Signed-out';
  const userEmail = session?.user?.email || '';
  const userInitials = (session?.user?.name || session?.user?.email || '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('') || '?';

  // Phase 3C: AI Supplier Intelligence state
  const [aiSupplierIntel, setAiSupplierIntel] = useState<any | null>(null);
  const [aiSupplierIntelLoading, setAiSupplierIntelLoading] = useState(false);

  // Phase 3E: Executive AI Briefing state
  const [execBriefing, setExecBriefing] = useState<any | null>(null);
  const [execBriefingLoading, setExecBriefingLoading] = useState(false);

  // Overview states
  const [overviewSummary, setOverviewSummary] = useState<GlobalOverviewSummary | null>(null);
  const [overviewDetails, setOverviewDetails] = useState<DashboardOverviewDetails | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Phase 2 — Information Hierarchy accordion states
  const [showPortfolioDetails, setShowPortfolioDetails] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [showPortfolioAnalytics, setShowPortfolioAnalytics] = useState(false);
  const [showOverdueSummaryDetails, setShowOverdueSummaryDetails] = useState(false);

  // Overdue POs states
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [worklist, setWorklist] = useState<WorklistItem[]>([]);
  const [worklistTotal, setWorklistTotal] = useState(0);
  const [selectedItemKey, setSelectedItemKey] = useState<{ po: string; item: string; line: string } | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ExceptionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters State for Overdue Workbench
  const [plantFilter, setPlantFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [purchasingGroupFilter, setPurchasingGroupFilter] = useState('');
  const [materialGroupFilter, setMaterialGroupFilter] = useState('');
  const [delayCategoryFilter, setDelayCategoryFilter] = useState(''); // Phase 1B Grouping
  const [overdueDaysMin, setOverdueDaysMin] = useState('');
  const [overdueDaysMax, setOverdueDaysMax] = useState('');
  const [dateMin, setDateMin] = useState('');
  const [dateMax, setDateMax] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [limit, setLimit] = useState('25');
  const [page, setPage] = useState(1);
  const [filteredMetrics, setFilteredMetrics] = useState<{
    totalLines: number;
    totalValue: number;
    totalQty: number;
    criticalLines: number;
    averageDays: number;
  } | null>(null);

  // Dropdown Lists Sourced from API
  const [plantList, setPlantList] = useState<Array<{ code: string; name: string }>>([]);
  const [supplierList, setSupplierList] = useState<Array<{ id: string; name: string }>>([]);
  const [purchasingGroups, setPurchasingGroups] = useState<string[]>([]);
  const [materialGroups, setMaterialGroups] = useState<string[]>([]);

  // Active Tab inside the Details Drawer
  const [detailTab, setDetailTab] = useState<string>('kpi');

  // Phase 2 Guided Actions States
  const [activeRecommendation, setActiveRecommendation] = useState<any | null>(null);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [overdueSort, setOverdueSort] = useState<'default' | 'priority'>('default');
  const [ackSort, setAckSort] = useState<'default' | 'priority'>('default');
  const [recommendationSaving, setRecommendationSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Supplier Acknowledgement states (Phase 1C)
  const [ackSummary, setAckSummary] = useState<any | null>(null);
  const [ackWorklist, setAckWorklist] = useState<any[]>([]);
  const [ackWorklistTotal, setAckWorklistTotal] = useState(0);
  const [ackPage, setAckPage] = useState(1);
  const [ackLimit, setAckLimit] = useState('25');
  const [ackFilteredMetrics, setAckFilteredMetrics] = useState<any | null>(null);
  const [ackPlantFilter, setAckPlantFilter] = useState('');
  const [ackSupplierFilter, setAckSupplierFilter] = useState('');
  const [ackStatusFilter, setAckStatusFilter] = useState('');
  const [ackSearchQuery, setAckSearchQuery] = useState('');
  const [ackLoading, setAckLoading] = useState(true);

  // Part Availability states (Phase 1D)
  const [partSummary, setPartSummary] = useState<any | null>(null);
  const [partWorklist, setPartWorklist] = useState<any[]>([]);
  const [partWorklistTotal, setPartWorklistTotal] = useState(0);
  const [partPage, setPartPage] = useState(1);
  const [partLimit, setPartLimit] = useState('25');
  const [partFilteredMetrics, setPartFilteredMetrics] = useState<any | null>(null);
  const [partPlantFilter, setPartPlantFilter] = useState('');
  const [partRiskFilter, setPartRiskFilter] = useState('');
  const [partHorizonFilter, setPartHorizonFilter] = useState('');
  const [partSearchQuery, setPartSearchQuery] = useState('');
  const [partLoading, setPartLoading] = useState(true);
  const [mrpTimelineData, setMrpTimelineData] = useState<any | null>(null);
  const [mrpLoading, setMrpLoading] = useState(false);

  // Supplier Analytics states (Phase 2C)
  const [supplierAnalyticsList, setSupplierAnalyticsList] = useState<any[]>([]);
  const [supplierAnalyticsLoading, setSupplierAnalyticsLoading] = useState(false);
  const [selectedSupplierDetail, setSelectedSupplierDetail] = useState<any | null>(null);
  const [supplierDetailLoading, setSupplierDetailLoading] = useState(false);
  const [saSearch, setSaSearch] = useState('');
  const [saTierFilter, setSaTierFilter] = useState('');
  const [saRiskFilter, setSaRiskFilter] = useState('');
  const [saBlockedFilter, setSaBlockedFilter] = useState('');
  const [saSortBy, setSaSortBy] = useState('risk');
  const [supplierPage, setSupplierPage] = useState(1);
  const SUPPLIER_PAGE_SIZE = 20;

  // Exception Analytics states (Phase 2D)
  const [exAnalytics, setExAnalytics] = useState<any | null>(null);
  const [exAnalyticsLoading, setExAnalyticsLoading] = useState(false);

  // Buyer Productivity states (Phase 2E)
  const [bpData, setBpData] = useState<any | null>(null);
  const [bpLoading, setBpLoading] = useState(false);
  const [bpSelectedBuyer, setBpSelectedBuyer] = useState('ALL');
  const [bpActiveView, setBpActiveView] = useState<'leaderboard' | 'workload' | 'history' | 'followup'>('leaderboard');
  const [bpWorkloadSeverity, setBpWorkloadSeverity] = useState('');
  const [bpWorkloadType, setBpWorkloadType] = useState('');
  const [bpWorkloadSearch, setBpWorkloadSearch] = useState('');
  const [bpWorkloadSort, setBpWorkloadSort] = useState('days');
  const [bpWorkloadPage, setBpWorkloadPage] = useState(1);

  // Control Tower states (Phase 1E)
  const [ctData, setCtData] = useState<any | null>(null);
  const [ctLoading, setCtLoading] = useState(false);

  // Phase 7B Action Layer States
  const [newNoteText, setNewNoteText] = useState('');
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const resetFiltersAndDrawers = () => {
    setSelectedItemKey(null);
    setSelectedDetail(null);
    setSelectedSupplierDetail(null);
    setSelectedAlert(null);
    setPlantFilter('');
    setSupplierFilter('');
    setPurchasingGroupFilter('');
    setMaterialGroupFilter('');
    setDelayCategoryFilter('');
    setOverdueDaysMin('');
    setOverdueDaysMax('');
    setDateMin('');
    setDateMax('');
    setSearchQuery('');
    setPage(1);
    setAckPlantFilter('');
    setAckSupplierFilter('');
    setAckStatusFilter('');
    setAckSearchQuery('');
    setAckPage(1);
    setPartPlantFilter('');
    setPartRiskFilter('');
    setPartHorizonFilter('');
    setPartSearchQuery('');
    setPartPage(1);
    setSaSearch('');
    setSaTierFilter('');
    setSaRiskFilter('');
    setSaBlockedFilter('');
    setSupplierPage(1);
  };

  const scrollToCopilotTarget = (targetId: string) => {
    const mainElement = document.querySelector('.main-content');
    if (!mainElement) {
      console.warn('Sourcing Copilot Scroll: .main-content scroll container not found');
      return;
    }
    const targetElement = document.getElementById(targetId);
    if (targetElement) {
      const elementTop = targetElement.getBoundingClientRect().top - mainElement.getBoundingClientRect().top;
      const headerOffset = 40; // Safe spacing to keep the target header fully visible below any layout edge
      const targetScrollTop = mainElement.scrollTop + elementTop - headerOffset;
      mainElement.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth'
      });
    } else {
      // Fallback: scroll main content to top
      mainElement.scrollTo({ top: 0, behavior: 'smooth' });
      console.warn(`Sourcing Copilot Scroll: Target element #${targetId} not found in the DOM.`);
    }
  };

  const handleCopilotAction = (actionUrl: string) => {
    try {
      console.log('Handling Copilot action:', actionUrl);
      const url = actionUrl.replace(/^action:/, '');
      
      let target = url;
      let poParams = null;
      
      if (url.startsWith('navigate?')) {
        const query = url.split('?')[1] || '';
        const params = new URLSearchParams(query);
        target = params.get('target') || '';
        const po = params.get('po');
        const item = params.get('item');
        const line = params.get('line');
        if (po) {
          poParams = { po, item: item || '00010', line: line || '0001' };
        }
      }
      
      const validTabs = [
        'overview', 'overdue', 'acknowledgement', 'recommendations', 
        'part', 'supplier-analytics', 'exception-analytics', 
        'buyer-productivity', 'control-tower', 'copilot'
      ];
      
      if (validTabs.includes(target)) {
        setActiveTab(target as any);
        
        // Wait for the tab/view to render, then scroll to the specific section ID
        setTimeout(() => {
          const sectionId = `${target}-section`;
          scrollToCopilotTarget(sectionId);
          
          if (poParams) {
            setSelectedItemKey(poParams);
          }
        }, 150);
      } else if (url.startsWith('view_po?')) {
        const params = new URLSearchParams(url.split('?')[1]);
        const po = params.get('po') || '';
        const item = params.get('item') || '00010';
        const line = params.get('line') || '0001';
        
        setSelectedItemKey({ po, item, line });
      } else {
        console.warn('Unknown Copilot action:', actionUrl);
      }
    } catch (e) {
      console.warn('Failed to execute Copilot action:', e);
    }
  };

  // Reload detail helper
  const reloadDetail = async (poNumber: string, itemNumber: string, scheduleLine: string) => {
    try {
      const res = await fetch(
        `/api/po-overdue/detail?po_number=${poNumber}&item_number=${itemNumber}&schedule_line=${scheduleLine}`
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedDetail(data);
        return data;
      }
    } catch (err) {
      console.error('Failed to reload item detail:', err);
    }
  };

  const handleAddNote = async () => {
    if (!selectedDetail) return;
    if (!newNoteText.trim()) {
      setActionError('Note is required.');
      return;
    }
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseOrderNumber: selectedDetail.po_number,
          purchaseOrderItem: selectedDetail.item_number,
          supplierId: selectedDetail.supplier_id,
          supplierName: selectedDetail.supplier_name,
          actionType: 'NOTE',
          sourceModule: activeTab === 'acknowledgement' ? 'SUPPLIER_ACKNOWLEDGEMENTS' : 'OVERDUE_WORKBENCH',
          note: newNoteText.trim(),
          createdBy: 'buyer.test',
        }),
      });

      if (res.ok) {
        setNewNoteText('');
        setToastMessage('✅ Internal note saved.');
        await reloadDetail(selectedDetail.po_number, selectedDetail.item_number, selectedDetail.schedule_line);
      } else {
        const errData = await res.json();
        setActionError(errData.error || 'Could not save internal action. Please try again.');
      }
    } catch (err) {
      console.error('Failed to add note:', err);
      setActionError('Could not save internal action. Please try again.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleMarkSupplierContacted = async (contactNote?: string) => {
    if (!selectedDetail) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseOrderNumber: selectedDetail.po_number,
          purchaseOrderItem: selectedDetail.item_number,
          supplierId: selectedDetail.supplier_id,
          supplierName: selectedDetail.supplier_name,
          actionType: 'SUPPLIER_CONTACTED',
          sourceModule: activeTab === 'acknowledgement' ? 'SUPPLIER_ACKNOWLEDGEMENTS' : 'OVERDUE_WORKBENCH',
          supplierContacted: true,
          note: contactNote?.trim() || 'Supplier contacted directly.',
          createdBy: 'buyer.test',
        }),
      });

      if (res.ok) {
        setToastMessage('📞 Supplier contact recorded.');
        await reloadDetail(selectedDetail.po_number, selectedDetail.item_number, selectedDetail.schedule_line);
      } else {
        const errData = await res.json();
        setActionError(errData.error || 'Could not save internal action. Please try again.');
      }
    } catch (err) {
      console.error('Failed to mark supplier contacted:', err);
      setActionError('Could not save internal action. Please try again.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleUpdateActionStatus = async (actionId: string, expectedVersion: number, newStatus: 'COMPLETED' | 'IN_PROGRESS' | 'CANCELLED') => {
    if (!selectedDetail) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          actionStatus: newStatus,
          reviewStatus: newStatus === 'COMPLETED' ? 'ACTIONED' : 'REVIEWED',
          updatedBy: 'buyer.test'
        }),
      });

      if (res.ok) {
        if (newStatus === 'COMPLETED') {
          setToastMessage('✅ Internal action completed.');
        } else {
          setToastMessage('✅ Internal action status updated.');
        }
        await reloadDetail(selectedDetail.po_number, selectedDetail.item_number, selectedDetail.schedule_line);
      } else if (res.status === 409) {
        const conflictData = await res.json();
        setActionError('This action was updated elsewhere. Refresh the drawer and try again.');
        setToastMessage('⚠️ Concurrency Conflict: Stale version!');
      } else {
        const errData = await res.json();
        setActionError(errData.error || 'Could not update internal action. Please try again.');
      }
    } catch (err) {
      console.error('Failed to update action status:', err);
      setActionError('Could not update internal action. Please try again.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleEscalateAction = async (actionId: string, expectedVersion: number) => {
    if (!selectedDetail) return;
    setIsActionSubmitting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/actions/${actionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion,
          escalationFlag: true,
          actionStatus: 'IN_PROGRESS',
          updatedBy: 'buyer.test'
        }),
      });

      if (res.ok) {
        setToastMessage('🚨 Internal escalation recorded.');
        await reloadDetail(selectedDetail.po_number, selectedDetail.item_number, selectedDetail.schedule_line);
      } else if (res.status === 409) {
        const conflictData = await res.json();
        setActionError('This action was updated elsewhere. Refresh the drawer and try again.');
        setToastMessage('⚠️ Concurrency Conflict: Stale version!');
      } else {
        const errData = await res.json();
        setActionError(errData.error || 'Could not save internal action. Please try again.');
      }
    } catch (err) {
      console.error('Failed to escalate action:', err);
      setActionError('Could not save internal action. Please try again.');
    } finally {
      setIsActionSubmitting(false);
    }
  };

  // Load Overview Data Sourced
  async function loadOverviewData() {
    setOverviewLoading(true);
    try {
      const [resSummary, resDetails, resOverdueSummary] = await Promise.all([
        fetch('/api/overview/summary'),
        fetch('/api/overview/details'),
        fetch('/api/po-overdue/summary').catch(() => null)
      ]);

      if (resSummary.ok && resDetails.ok) {
        const sumData = await resSummary.json();
        const detData = await resDetails.json();
        setOverviewSummary(sumData);
        setOverviewDetails(detData);
      }

      if (resOverdueSummary && resOverdueSummary.ok) {
        const overdueSumData = await resOverdueSummary.json();
        setSummary(overdueSumData);
      }
    } catch (err) {
      console.error('Failed to load dashboard overview parameters:', err);
    } finally {
      setOverviewLoading(false);
    }
  }

  // Load Filters Option Sourced Sourced dynamically
  useEffect(() => {
    async function loadFilters() {
      try {
        const res = await fetch('/api/filters');
        if (res.ok) {
          const data = await res.json();
          setPlantList(data.plants || []);
          setSupplierList(data.suppliers || []);
          setPurchasingGroups(data.purchasingGroups || []);
          setMaterialGroups(data.materialGroups || []);
        }
      } catch (err) {
        console.error('Failed to load filters list:', err);
      }
    }
    loadFilters();
    loadOverviewData();
  }, []);

  // Load summary and worklist
  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      // Build query string
      const params = new URLSearchParams();
      if (plantFilter) params.append('plant', plantFilter);
      if (supplierFilter) params.append('supplier', supplierFilter);
      if (purchasingGroupFilter) params.append('purchasingGroup', purchasingGroupFilter);
      if (materialGroupFilter) params.append('materialGroup', materialGroupFilter);
      if (delayCategoryFilter) params.append('delayCategory', delayCategoryFilter);
      if (overdueDaysMin) params.append('overdueDaysMin', overdueDaysMin);
      if (overdueDaysMax) params.append('overdueDaysMax', overdueDaysMax);
      if (dateMin) params.append('dateMin', dateMin);
      if (dateMax) params.append('dateMax', dateMax);
      if (searchQuery) params.append('search', searchQuery);
      if (overdueSort === 'priority') params.append('sortBy', 'priority');
      
      // Pagination offset calculation
      const offset = (page - 1) * parseInt(limit);
      params.append('limit', limit);
      params.append('offset', offset.toString());

      // Fetch summary and filtered worklist concurrently
      const [resSummary, resWorklist] = await Promise.all([
        fetch('/api/po-overdue/summary'),
        fetch(`/api/po-overdue/worklist?${params.toString()}`)
      ]);

      if (!resSummary.ok || !resWorklist.ok) {
        throw new Error('API request failed. Sourcing database layer could be offline.');
      }

      const summaryData = await resSummary.json();
      const worklistData = await resWorklist.json();

      setSummary(summaryData);
      setFilteredMetrics(worklistData.filteredSummary);
      setWorklist(worklistData.data || []);
      setWorklistTotal(worklistData.total || 0);
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading data.');
    } finally {
      setLoading(false);
    }
  }

  // Load Supplier Acknowledgement summary and worklist (Phase 1C)
  async function loadAcknowledgementData() {
    setAckLoading(true);
    try {
      const params = new URLSearchParams();
      if (ackPlantFilter) params.append('plant', ackPlantFilter);
      if (ackSupplierFilter) params.append('supplier', ackSupplierFilter);
      if (ackStatusFilter) params.append('acknowledgementStatus', ackStatusFilter);
      if (ackSearchQuery) params.append('search', ackSearchQuery);
      if (ackSort === 'priority') params.append('sortBy', 'priority');
      
      const offset = (ackPage - 1) * parseInt(ackLimit);
      params.append('limit', ackLimit);
      params.append('offset', offset.toString());

      const [resSummary, resWorklist] = await Promise.all([
        fetch('/api/po-acknowledgement/summary'),
        fetch(`/api/po-acknowledgement/worklist?${params.toString()}`)
      ]);

      if (resSummary.ok && resWorklist.ok) {
        const summaryData = await resSummary.json();
        const worklistData = await resWorklist.json();

        setAckSummary(summaryData);
        setAckFilteredMetrics(worklistData.filteredSummary);
        setAckWorklist(worklistData.data || []);
        setAckWorklistTotal(worklistData.total || 0);
      }
    } catch (err) {
      console.error('Failed to load acknowledgement workbench data:', err);
    } finally {
      setAckLoading(false);
    }
  }

  // Load Part Availability summary and worklist (Phase 1D)
  async function loadPartAvailabilityData() {
    setPartLoading(true);
    try {
      const params = new URLSearchParams();
      if (partPlantFilter) params.append('plant', partPlantFilter);
      if (partRiskFilter) params.append('riskBucket', partRiskFilter);
      if (partHorizonFilter) params.append('horizon', partHorizonFilter);
      if (partSearchQuery) params.append('search', partSearchQuery);
      
      const offset = (partPage - 1) * parseInt(partLimit);
      params.append('limit', partLimit);
      params.append('offset', offset.toString());

      const [resSummary, resWorklist] = await Promise.all([
        fetch('/api/part-availability/summary'),
        fetch(`/api/part-availability/worklist?${params.toString()}`)
      ]);

      if (resSummary.ok && resWorklist.ok) {
        const summaryData = await resSummary.json();
        const worklistData = await resWorklist.json();

        setPartSummary(summaryData);
        setPartFilteredMetrics(worklistData.filteredSummary);
        setPartWorklist(worklistData.data || []);
        setPartWorklistTotal(worklistData.total || 0);
      }
    } catch (err) {
      console.error('Failed to load part availability data:', err);
    } finally {
      setPartLoading(false);
    }
  }

  // Load chronological MRP timeline data for detail side drawer
  async function loadMrpTimeline(materialId: string, plant: string) {
    setMrpLoading(true);
    setMrpTimelineData(null);
    try {
      const res = await fetch(`/api/part-availability/mrp?material_id=${materialId}&plant=${plant}`);
      if (res.ok) {
        const data = await res.json();
        setMrpTimelineData(data);
      }
    } catch (e) {
      console.error('Failed to load MRP timeline:', e);
    } finally {
      setMrpLoading(false);
    }
  }

  // Update recommendation status and persist changes in memory
  const handleActionRecommendation = async (status: 'APPROVED' | 'SENT' | 'REJECTED') => {
    if (!activeRecommendation) return;
    setRecommendationSaving(true);
    try {
      if (status === 'SENT') {
        const res = await fetch('/api/supplier-communications/reminders/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recommendationId: activeRecommendation.recommendation_id,
            subject: activeRecommendation.draft_subject,
            body: activeRecommendation.draft_message,
            sentBy: 'buyer.demo'
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setActiveRecommendation({
            ...activeRecommendation,
            approval_status: 'SENT'
          });
          setToastMessage(data.message || '✓ Mock send complete: reminder logged. No Outlook email was sent.');
        } else {
          setToastMessage(`❌ ${data.error || 'Failed to send reminder email.'}`);
        }
      } else {
        const res = await fetch('/api/recommendations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recommendation_id: activeRecommendation.recommendation_id,
            status,
            subject: activeRecommendation.draft_subject,
            message: activeRecommendation.draft_message
          })
        });

        if (res.ok) {
          setActiveRecommendation({
            ...activeRecommendation,
            approval_status: status
          });
          
          if (status === 'APPROVED') {
            setToastMessage('✓ Draft Saved Successfully!');
          } else if (status === 'REJECTED') {
            setToastMessage('Recommendation Rejected.');
          }
        } else {
          const data = await res.json();
          setToastMessage(`❌ ${data.error || 'Failed to update recommendation.'}`);
        }
      }

      // Reload data to reflect status changes in worklists
      if (activeTab === 'overdue') {
        loadData();
      } else if (activeTab === 'acknowledgement') {
        loadAcknowledgementData();
      }
    } catch (err) {
      console.error('Failed to update recommendation status:', err);
      setToastMessage('❌ A network or server error occurred.');
    } finally {
      setRecommendationSaving(false);
    }
  };

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setPage(1);
  }, [
    plantFilter,
    supplierFilter,
    purchasingGroupFilter,
    materialGroupFilter,
    delayCategoryFilter,
    overdueDaysMin,
    overdueDaysMax,
    dateMin,
    dateMax,
    searchQuery,
    limit,
    overdueSort
  ]);

  // Load summary and worklist upon filter or page changes
  useEffect(() => {
    loadData();
  }, [
    plantFilter,
    supplierFilter,
    purchasingGroupFilter,
    materialGroupFilter,
    delayCategoryFilter,
    overdueDaysMin,
    overdueDaysMax,
    dateMin,
    dateMax,
    searchQuery,
    limit,
    page,
    overdueSort
  ]);

  // Reset ack page to 1 when filters or search change
  useEffect(() => {
    setAckPage(1);
  }, [
    ackPlantFilter,
    ackSupplierFilter,
    ackStatusFilter,
    ackSearchQuery,
    ackLimit,
    ackSort
  ]);

  // Load acknowledgement summary and worklist upon filter or page changes
  useEffect(() => {
    if (activeTab === 'acknowledgement') {
      loadAcknowledgementData();
    }
  }, [
    ackPlantFilter,
    ackSupplierFilter,
    ackStatusFilter,
    ackSearchQuery,
    ackLimit,
    ackPage,
    activeTab,
    ackSort
  ]);

  // Reset part page to 1 when filters or search change
  useEffect(() => {
    setPartPage(1);
  }, [
    partPlantFilter,
    partRiskFilter,
    partHorizonFilter,
    partSearchQuery,
    partLimit
  ]);

  // Load part availability summary and worklist upon filter or page changes
  useEffect(() => {
    if (activeTab === 'part') {
      loadPartAvailabilityData();
    }
  }, [
    partPlantFilter,
    partRiskFilter,
    partHorizonFilter,
    partSearchQuery,
    partLimit,
    partPage,
    activeTab
  ]);

  // Load detailed context when an exception is selected
  useEffect(() => {
    if (!selectedItemKey) {
      setSelectedDetail(null);
      return;
    }

    if (selectedItemKey.po === 'PART') {
      setSelectedDetail(null);
      setDetailTab('mrp'); // Default tab for parts
      return;
    }

    async function loadDetail() {
      setDetailLoading(true);
      try {
        await reloadDetail(selectedItemKey!.po, selectedItemKey!.item, selectedItemKey!.line);
        setDetailTab('kpi'); // Default tab
      } catch (err) {
        console.error('Failed to load item detail drawer context:', err);
      } finally {
        setDetailLoading(false);
      }
    }

    loadDetail();
  }, [selectedItemKey]);

  // Load Guided Actions recommendation when selection changes
  useEffect(() => {
    if (!selectedItemKey) {
      setActiveRecommendation(null);
      return;
    }

    async function fetchRecommendation() {
      if (!selectedItemKey) return;
      setRecommendationLoading(true);
      try {
        let exId = '';
        let agentName = 'PO_OVERDUE_AGENT';
        
        if (selectedItemKey.po === 'PART') {
          const match = partWorklist.find(p => p.material_id === selectedItemKey.item && p.plant === selectedItemKey.line);
          exId = match?.snapshot_id || '';
          agentName = 'PART_AVAILABILITY_AGENT';
        } else if (activeTab === 'overdue') {
          const match = worklist.find(w => w.po_number === selectedItemKey.po && w.item_number === selectedItemKey.item && w.schedule_line === selectedItemKey.line);
          exId = match?.exception_id || '';
          agentName = 'PO_OVERDUE_AGENT';
        } else if (activeTab === 'acknowledgement') {
          const match = ackWorklist.find(a => a.po_number === selectedItemKey.po && a.item_number === selectedItemKey.item);
          exId = match?.exception_id || '';
          agentName = 'SUPPLIER_ACK_AGENT';
        }

        const res = await fetch(`/api/recommendations?exception_id=${exId}&po_number=${selectedItemKey.po}&item_number=${selectedItemKey.item}&agent_name=${agentName}`);
        if (res.ok) {
          const data = await res.json();
          setActiveRecommendation(data);
        }
      } catch (err) {
        console.error('Failed to load guided recommendation:', err);
      } finally {
        setRecommendationLoading(false);
      }
    }

    fetchRecommendation();
  }, [selectedItemKey, activeTab, worklist, ackWorklist, partWorklist]);

  // Toast notification auto-dismiss timer
  useEffect(() => {
    if (toastMessage) {
      const timer = setTimeout(() => setToastMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toastMessage]);

  // Format currency helpers
  const formatUSD = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  };

  const resetFilters = () => {
    setPlantFilter('');
    setSupplierFilter('');
    setPurchasingGroupFilter('');
    setMaterialGroupFilter('');
    setDelayCategoryFilter('');
    setOverdueDaysMin('');
    setOverdueDaysMax('');
    setDateMin('');
    setDateMax('');
    setSearchQuery('');
    setOverdueSort('default');
  };

  // Helper to drilldown from overview widgets Sourced Sourced
  const triggerDrilldown = (category: string) => {
    setDelayCategoryFilter(category);
    setActiveTab('overdue');
  };

  // Load supplier analytics list
  async function loadSupplierAnalytics() {
    setSupplierAnalyticsLoading(true);
    try {
      const params = new URLSearchParams();
      if (saSearch) params.append('search', saSearch);
      if (saTierFilter) params.append('tier', saTierFilter);
      if (saRiskFilter) params.append('riskLevel', saRiskFilter);
      if (saBlockedFilter) params.append('blocked', saBlockedFilter);
      if (saSortBy) params.append('sortBy', saSortBy);
      const res = await fetch(`/api/supplier-performance/list?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSupplierAnalyticsList(data);
      }
    } catch (err) {
      console.error('Failed to load supplier analytics:', err);
    } finally {
      setSupplierAnalyticsLoading(false);
    }
  }

  // Load supplier detail drawer
  async function loadSupplierDetail(supplierId: string) {
    setSupplierDetailLoading(true);
    setSelectedSupplierDetail(null);
    setAiSupplierIntel(null); // Clear stale AI assessment for the new supplier
    try {
      const res = await fetch(`/api/supplier-performance/detail?supplier_id=${supplierId}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedSupplierDetail(data);
      }
    } catch (err) {
      console.error('Failed to load supplier detail:', err);
    } finally {
      setSupplierDetailLoading(false);
    }
  }

  // Load Exception Analytics (Phase 2D)
  async function loadExceptionAnalytics() {
    setExAnalyticsLoading(true);
    try {
      const res = await fetch('/api/exception-analytics');
      if (res.ok) {
        const data = await res.json();
        setExAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to load exception analytics:', err);
    } finally {
      setExAnalyticsLoading(false);
    }
  }

  // Load Buyer Productivity (Phase 2E)
  async function loadBuyerProductivity(buyer?: string, sortBy?: string) {
    setBpLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('buyer', buyer || bpSelectedBuyer);
      if (bpWorkloadSeverity) params.append('severity', bpWorkloadSeverity);
      if (bpWorkloadType) params.append('exceptionType', bpWorkloadType);
      if (bpWorkloadSearch) params.append('search', bpWorkloadSearch);
      params.append('sortBy', sortBy || bpWorkloadSort);
      params.append('limit', '50');
      params.append('offset', ((bpWorkloadPage - 1) * 50).toString());
      const res = await fetch(`/api/buyer-productivity?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBpData(data);
      }
    } catch (err) {
      console.error('Failed to load buyer productivity:', err);
    } finally {
      setBpLoading(false);
    }
  }

  // Load Control Tower Summary (Phase 1E)
  async function loadControlTowerData() {
    setCtLoading(true);
    try {
      const res = await fetch('/api/control-tower');
      if (res.ok) {
        const data = await res.json();
        setCtData(data);
      }
    } catch (err) {
      console.error('Failed to load Control Tower data:', err);
    } finally {
      setCtLoading(false);
    }
  }

  // Load Reminders Data (Phase 4A)
  async function loadRemindersData() {
    setRemindersLoading(true);
    try {
      const res = await fetch('/api/agents/reminders/pending');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setRemindersList(data.pending || []);
          setSentRemindersList(data.sent || []);
        } else {
          console.error('Failed to load reminders:', data.error);
          setToastMessage('Error loading reminders: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to load reminders data:', err);
      setToastMessage('Network error loading reminders');
    } finally {
      setRemindersLoading(false);
    }
  }

  // Load Acknowledgement Follow-Up Data (Phase 4B)
  async function loadAckFollowupData() {
    setAckFollowupLoading(true);
    try {
      const res = await fetch('/api/agents/ack-followup/queue');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setAckFollowupQueue(data.queue || []);
          setAckFollowupSentList(data.sent || []);
        } else {
          console.error('Failed to load ack follow-ups:', data.error);
          setToastMessage('Error loading ack follow-ups: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to load ack follow-up data:', err);
      setToastMessage('Network error loading ack follow-ups');
    } finally {
      setAckFollowupLoading(false);
    }
  }

  // Load Escalation Triggers Data (Phase 4C)
  async function loadEscalationData() {
    setEscalationLoading(true);
    try {
      const res = await fetch('/api/agents/escalation/triggers');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setEscalationTriggers(data.triggers || []);
          setEscalationHistory(data.history || []);
        } else {
          console.error('Failed to load escalations:', data.error);
          setToastMessage('Error loading escalations: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to load escalation data:', err);
      setToastMessage('Network error loading escalations');
    } finally {
      setEscalationLoading(false);
    }
  }

  // Load Coordination Data (Phase 4D)
  async function loadCoordinationData() {
    setCoordinationLoading(true);
    try {
      const res = await fetch('/api/agents/coordination/alerts');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setCoordinationActive(data.active || []);
          setCoordinationHistory(data.history || []);
        } else {
          console.error('Failed to load coordination alerts:', data.error);
          setToastMessage('Error loading coordination alerts: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to load coordination data:', err);
      setToastMessage('Network error loading coordination alerts');
    } finally {
      setCoordinationLoading(false);
    }
  }

  // Load MRP Timeline for Selected Part/Plant (Phase 4D)
  async function loadMrpTimelineForAlert(materialId: string, plant: string) {
    setCoordMrpTimelineLoading(true);
    setCoordMrpTimelineData(null);
    try {
      const res = await fetch(`/api/part-availability/mrp?material=${encodeURIComponent(materialId)}&plant=${encodeURIComponent(plant)}`);
      if (res.ok) {
        const data = await res.json();
        setCoordMrpTimelineData(data);
      }
    } catch (err) {
      console.error('Failed to load MRP timeline for alert:', err);
    } finally {
      setCoordMrpTimelineLoading(false);
    }
  }

  // Update Coordination Alert (Phase 4D)
  async function handleUpdateCoordinationAlert(alertId: string, status: string, notes: string, action: string) {
    try {
      const res = await fetch('/api/agents/coordination/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId, status, notes, action })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage('✅ Coordination updated successfully.');
        loadCoordinationData();
        setSelectedAlert(null);
      } else {
        setToastMessage('❌ Update failed: ' + data.error);
      }
    } catch (err) {
      console.error('Failed to update coordination alert:', err);
      setToastMessage('❌ Network error during update');
    }
  }

  // Phase 4E: Multi-Agent Workflow Orchestration functions
  async function loadWorkflowData() {
    setWorkflowLoading(true);
    try {
      const url = `/api/agents/workflow/pipeline?plant=${workflowPlantFilter}&buyer=${workflowBuyerFilter}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setWorkflowItems(data.pipeline || []);
          setWorkflowAuditLogs(data.auditLogs || []);
        } else {
          console.error('Failed to load multi-agent pipeline:', data.error);
          setToastMessage('Error loading pipeline: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to load multi-agent workflow data:', err);
      setToastMessage('Network error loading workflow pipeline');
    } finally {
      setWorkflowLoading(false);
    }
  }

  async function runWorkflowSweep() {
    setWorkflowScanning(true);
    setToastMessage('⛓️ Orchestration Engine: Initializing Multi-Agent Sweep...');
    try {
      const res = await fetch('/api/agents/workflow/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plant: workflowPlantFilter,
          buyer: workflowBuyerFilter,
          autoSend: workflowAutoSend
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setToastMessage('✅ Multi-Agent Sweep completed successfully.');
          await loadWorkflowData();
        } else {
          setToastMessage('❌ Sweep failed: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to run multi-agent sweep:', err);
      setToastMessage('❌ Network error during sweep run');
    } finally {
      setWorkflowScanning(false);
    }
  }

  async function handleBatchDispatch(ids: string[]) {
    if (ids.length === 0) return;
    setWorkflowLoading(true);
    setToastMessage(`🚀 Dispatching ${ids.length} approved actions...`);
    try {
      const res = await fetch('/api/agents/workflow/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setToastMessage(`✅ Dispatched ${ids.length} actions successfully.`);
          setWorkflowSelectedIds([]);
          await loadWorkflowData();
        } else {
          setToastMessage('❌ Dispatch failed: ' + data.error);
        }
      }
    } catch (err: any) {
      console.error('Failed to dispatch pipeline items:', err);
      setToastMessage('❌ Network error during dispatch');
    } finally {
      setWorkflowLoading(false);
    }
  }

  async function handleSaveWorkflowDraft() {
    if (!editingWorkflowItem) return;
    const { id, type, draft_subject, draft_message } = editingWorkflowItem;

    setWorkflowLoading(true);
    try {
      let success = false;
      if (type === 'COLLABORATION') {
        const res = await fetch('/api/agents/coordination/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alertId: id,
            status: 'IN_COORDINATION',
            notes: draft_message,
            action: 'EXPEDITE_PO'
          })
        });
        const data = await res.json();
        success = data.success;
      } else {
        const res = await fetch('/api/agents/reminders/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recommendationId: id,
            subject: draft_subject,
            message: draft_message
          })
        });
        const data = await res.json();
        success = data.success;
      }

      if (success) {
        setToastMessage('✅ Draft changes saved successfully.');
        setEditingWorkflowItem(null);
        await loadWorkflowData();
      } else {
        setToastMessage('❌ Save failed.');
      }
    } catch (err) {
      console.error('Failed to save workflow draft:', err);
      setToastMessage('❌ Network error saving draft.');
    } finally {
      setWorkflowLoading(false);
    }
  }

  // Phase 5A: Autonomous Monitoring handlers
  async function loadMonitoringData() {
    setMonitoringLoading(true);
    try {
      const res = await fetch('/api/agents/monitoring/state');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSupervisorState(data.supervisor);
          setMonitoringAnomalies(data.anomalies || []);
          setMonitoringLogs(data.logs || []);
        } else {
          console.error('Failed to load supervisor state:', data.error);
        }
      }
    } catch (err) {
      console.error('Failed to fetch autonomous monitoring data:', err);
    } finally {
      setMonitoringLoading(false);
    }
  }

  async function handleToggleSupervisor(active: boolean) {
    setMonitoringToggling(true);
    const textStatus = active ? 'activating...' : 'stopping...';
    setToastMessage(`🛰️ Autonomous Supervisor ${textStatus}`);
    try {
      const intervalSecs = parseInt(monitoringIntervalInput, 10) || 30;
      const res = await fetch('/api/agents/monitoring/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active, scanInterval: intervalSecs })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setToastMessage(`✅ Supervisor status updated.`);
          await loadMonitoringData();
        } else {
          setToastMessage('❌ Toggle failed.');
        }
      }
    } catch (err) {
      console.error('Failed to toggle supervisor:', err);
      setToastMessage('❌ Network error toggling supervisor');
    } finally {
      setMonitoringToggling(false);
    }
  }

  async function handleManualSupervisorScan() {
    setMonitoringScanning(true);
    setToastMessage('🛰️ Initiating immediate supervisor sweep...');
    try {
      const res = await fetch('/api/agents/monitoring/scan', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setToastMessage(`✅ Manual sweep complete.`);
          await loadMonitoringData();
        } else {
          setToastMessage('❌ Manual scan failed.');
        }
      }
    } catch (err) {
      console.error('Failed to trigger supervisor scan:', err);
      setToastMessage('❌ Network error during scan');
    } finally {
      setMonitoringScanning(false);
    }
  }

  async function handleResolveAnomaly(id: string) {
    setMonitoringLoading(true);
    setToastMessage(`Saving anomaly resolution...`);
    try {
      const res = await fetch('/api/agents/monitoring/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'resolve' })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setToastMessage('✅ Anomaly resolved and closed.');
          await loadMonitoringData();
        } else {
          setToastMessage('❌ Failed to resolve anomaly.');
        }
      }
    } catch (err) {
      console.error('Failed to resolve anomaly:', err);
      setToastMessage('❌ Network error resolving anomaly');
    } finally {
      setMonitoringLoading(false);
    }
  }

  // Trigger Sourcing Agent Sweep scan (simulated sweep refresh)
  async function triggerAgentSweep() {
    setIsScanning(true);
    setToastMessage('🤖 Sourcing Agent initiating PO Sweep...');
    setTimeout(() => {
      if (agentSubTab === 'overdue_po') {
        loadRemindersData();
      } else if (agentSubTab === 'ack_followup') {
        loadAckFollowupData();
      } else {
        loadEscalationData();
      }
      setIsScanning(false);
      setToastMessage('✅ Sweep completed. All drafts synced.');
    }, 1800);
  }

  // Approve reminder (Phase 4A, Phase 4B & Phase 4C)
  async function handleApproveReminder(id: string, subject: string, message: string) {
    try {
      const res = await fetch('/api/agents/reminders/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: id, subject, message })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage('✅ Approved and staged for dispatch.');
        if (agentSubTab === 'overdue_po') {
          loadRemindersData();
        } else if (agentSubTab === 'ack_followup') {
          loadAckFollowupData();
        } else {
          loadEscalationData();
        }
        setEditingReminder(null);
      } else {
        setToastMessage('❌ Approval failed: ' + data.error);
      }
    } catch (err) {
      console.error('Failed to approve:', err);
      setToastMessage('❌ Network error during approval');
    }
  }

  // Send single or batch reminders (Phase 4A, Phase 4B & Phase 4C)
  async function handleSendReminders(ids: string[]) {
    if (ids.length === 0) return;
    try {
      const url = agentSubTab === 'overdue_po'
        ? '/api/agents/reminders/send'
        : agentSubTab === 'ack_followup'
        ? '/api/agents/ack-followup/execute'
        : '/api/agents/escalation/escalate';

      const isEscalation = agentSubTab === 'escalation';
      const bodyPayload = isEscalation
        ? { escalationIds: ids }
        : { recommendationIds: ids };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      const data = await res.json();
      if (data.success) {
        const label = isEscalation ? 'escalation(s) executed' : 'reminder(s) dispatched to suppliers';
        setToastMessage(`🚀 Successfully ${label}.`);
        setSelectedIds([]);
        if (agentSubTab === 'overdue_po') {
          loadRemindersData();
        } else if (agentSubTab === 'ack_followup') {
          loadAckFollowupData();
        } else {
          loadEscalationData();
        }
      } else {
        setToastMessage('❌ Send failed: ' + data.error);
      }
    } catch (err) {
      console.error('Failed to send:', err);
      setToastMessage('❌ Network error during dispatch');
    }
  }

  // Batch approve selected items (Phase 4A, Phase 4B & Phase 4C)
  async function handleBatchApprove(ids: string[]) {
    if (ids.length === 0) return;
    try {
      let successCount = 0;
      const isEscalation = agentSubTab === 'escalation';
      const list = agentSubTab === 'overdue_po'
        ? remindersList
        : agentSubTab === 'ack_followup'
        ? ackFollowupQueue
        : escalationTriggers;

      for (const id of ids) {
        const item = list.find(r => (isEscalation ? r.escalation_id : r.recommendation_id) === id);
        if (item) {
          const res = await fetch('/api/agents/reminders/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recommendationId: id,
              subject: item.draft_subject,
              message: item.draft_message
            })
          });
          const data = await res.json();
          if (data.success) successCount++;
        }
      }
      setToastMessage(`✅ Batch approved ${successCount} items.`);
      setSelectedIds([]);
      if (agentSubTab === 'overdue_po') {
        loadRemindersData();
      } else if (agentSubTab === 'ack_followup') {
        loadAckFollowupData();
      } else {
        loadEscalationData();
      }
    } catch (err) {
      console.error('Failed to batch approve items:', err);
      setToastMessage('❌ Error during batch approval');
    }
  }

  // Send message to Sourcing Copilot API
  async function sendCopilotMessage(directText?: string) {
    const textToSend = directText || copilotInput;
    if (!textToSend.trim()) return;

    // Add user message to state
    const newUserMsg = { role: 'user', content: textToSend };
    const updatedMessages = [...copilotMessages, newUserMsg];
    setCopilotMessages(updatedMessages);
    setCopilotInput('');
    setCopilotLoading(true);

    try {
      const res = await fetch('/api/copilot/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages })
      });

      if (res.ok) {
        const data = await res.json();
        setCopilotMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply,
          sources_used: data.sources_used,
          tokens_used: data.tokens_used
        }]);
      } else {
        const errJson = await res.json();
        setCopilotMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠️ **API Error:** ${errJson.error || 'Failed to get completion from the server.'}`
        }]);
      }
    } catch (err: any) {
      console.error('Failed to communicate with Sourcing Copilot:', err);
      setCopilotMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠️ **Network Error:** Could not reach the Copilot server: ${err.message}`
      }]);
    } finally {
      setCopilotLoading(false);
    }
  }

  // Phase 3B: Load AI root cause analysis for the selected exception
  async function loadAiRootCause(exceptionId: string) {
    setAiRootCauseLoading(true);
    setAiRootCause(null);
    try {
      const res = await fetch(`/api/root-cause?exception_id=${encodeURIComponent(exceptionId)}`);
      if (res.ok) {
        const data = await res.json();
        setAiRootCause(data);
        // Refresh cumulative token stats after an AI call
        loadCumulativeTokens();
      } else {
        const err = await res.json();
        setAiRootCause({ _error: err.error || 'Root cause analysis could not be retrieved.' });
      }
    } catch (err: any) {
      setAiRootCause({ _error: 'Network error: ' + err.message });
    } finally {
      setAiRootCauseLoading(false);
    }
  }

  // Phase 3B: Load cumulative token metrics from admin endpoint
  async function loadCumulativeTokens() {
    try {
      const res = await fetch('/api/admin/metrics');
      if (res.ok) {
        const data = await res.json();
        setCumulativeTokens({ totalTokens: data.totalTokens, totalCost: data.totalCost, sessionCount: data.sessionCount });
      }
    } catch {
      // Non-critical — silently ignore
    }
  }

  // Phase 3C: Load AI supplier intelligence
  async function loadSupplierIntelligence(supplierId: string) {
    setAiSupplierIntelLoading(true);
    setAiSupplierIntel(null);
    try {
      const res = await fetch(`/api/supplier-intelligence?supplier_id=${encodeURIComponent(supplierId)}`);
      if (res.ok) {
        const data = await res.json();
        setAiSupplierIntel(data);
        loadCumulativeTokens(); // Refresh global token count
      } else {
        const err = await res.json();
        setAiSupplierIntel({ _error: err.error || 'Supplier intelligence could not be retrieved.' });
      }
    } catch (err: any) {
      setAiSupplierIntel({ _error: 'Network error: ' + err.message });
    } finally {
      setAiSupplierIntelLoading(false);
    }
  }

  // Phase 3E: Load Executive AI Briefing
  async function loadExecutiveBriefing() {
    setExecBriefingLoading(true);
    setExecBriefing(null);
    setShowBriefing(true); // Auto-expand accordion when generating
    try {
      const res = await fetch('/api/executive-briefing');
      if (res.ok) {
        const data = await res.json();
        setExecBriefing(data);
        loadCumulativeTokens(); // Refresh global token count
      } else {
        const err = await res.json();
        setExecBriefing({ _error: err.error || 'Executive briefing could not be generated.' });
      }
    } catch (err: any) {
      setExecBriefing({ _error: 'Network error: ' + err.message });
    } finally {
      setExecBriefingLoading(false);
    }
  }

  // Phase 3B: Trigger AI diagnosis when 'root-cause' tab is activated
  useEffect(() => {
    if (detailTab === 'root-cause' && selectedDetail && selectedDetail.exception_id && selectedDetail.exception_id !== 'NONE') {
      loadAiRootCause(selectedDetail.exception_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailTab]);

  // Phase 3B: Clear AI root cause when a different exception is selected
  useEffect(() => {
    setAiRootCause(null);
  }, [selectedItemKey]);

  // Phase 4A, 4B & 4C: Load appropriate queue data when activeTab or agentSubTab changes
  useEffect(() => {
    if (activeTab === 'reminders') {
      if (agentSubTab === 'overdue_po') {
        loadRemindersData();
      } else if (agentSubTab === 'ack_followup') {
        loadAckFollowupData();
      } else {
        loadEscalationData();
      }
      setSelectedIds([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, agentSubTab]);

  // Phase 4D: Load coordination alerts when tab changes to collaboration
  useEffect(() => {
    if (activeTab === 'collaboration') {
      loadCoordinationData();
    }
  }, [activeTab]);

  // Phase 4E: Load workflow pipeline data when tab changes or filters update
  useEffect(() => {
    if (activeTab === 'workflow-pipeline') {
      loadWorkflowData();
    }
  }, [activeTab, workflowPlantFilter, workflowBuyerFilter]);

  // Phase 5A: Load autonomous monitoring data when tab changes
  useEffect(() => {
    if (activeTab === 'autonomous-monitoring') {
      loadMonitoringData();

      // Auto-poll logs and stats every 5 seconds while on this tab
      const interval = setInterval(loadMonitoringData, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Phase 4D: Load MRP details and set inputs when alert is selected
  useEffect(() => {
    if (selectedAlert) {
      loadMrpTimelineForAlert(selectedAlert.material_id, selectedAlert.plant);
      setBuyerNotesInput(selectedAlert.buyer_notes || '');
      setResolutionAction(selectedAlert.planner_action || 'NONE');
    } else {
      setCoordMrpTimelineData(null);
    }
  }, [selectedAlert]);

  return (
    <>
      <Head>
        <title>Procurement Dashboard</title>
        <meta name="description" content="Unified Procurement Operations Dashboard and Actions Workbench." />
      </Head>

      <div className="app-container">
        
        {/* LEFT SIDEBAR NAVIGATION - THE PRODUCT ROADMAP NAVIGATION PANEL */}
        <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
          <div className="sidebar-inner">
          <div className="sidebar-logo">
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.85rem',
              color: '#fff',
              flexShrink: 0,
            }}>
              A
            </div>
            <span className="sidebar-logo-text">Procurement Dashboard</span>
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={sidebarCollapsed ? 'Pin navigation open' : 'Collapse navigation'}
              title={sidebarCollapsed ? 'Pin navigation open' : 'Collapse navigation'}
              onClick={() => setSidebarCollapsed(c => !c)}
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>
          </div>

          <nav className="sidebar-nav">
            {MODULE_CONFIGS.filter(m => m.enabled).map((m) => (
              <div 
                key={m.key}
                data-testid={`sidebar-tab-${m.key}`}
                className={`sidebar-item ${activeTab === m.key ? 'active' : ''}`}
                title={m.label}
                onClick={() => {
                  resetFiltersAndDrawers();
                  setActiveTab(m.key as any);
                  if (m.key === 'overview') loadOverviewData();
                  else if (m.key === 'overdue') loadData();
                  else if (m.key === 'acknowledgement') loadAcknowledgementData();
                  else if (m.key === 'supplier-analytics') loadSupplierAnalytics();
                }}
              >
                <span className="sidebar-item-label">
                  <span className="sidebar-item-icon">{m.icon}</span>
                  <span className="sidebar-item-text">{m.label}</span>
                </span>
                {activeTab === m.key && <span className="sidebar-item-active-dot" style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--color-primary)', display: 'inline-block', flexShrink: 0 }} />}
              </div>
            ))}
          </nav>

          <div className="sidebar-footer" style={{ borderTop: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column' }}>

            {/* System Diagnostics Collapsible Panel */}
            <div style={{ overflow: 'hidden' }}>
              <button
                className="sidebar-diagnostics-button"
                onClick={() => setShowDiagnostics(d => !d)}
                title="System Diagnostics"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  padding: '0.6rem 1rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  cursor: 'pointer',
                  fontSize: '0.65rem',
                  color: 'var(--text-muted)',
                  outline: 'none',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <span>⚙️</span>
                  <span className="sidebar-item-text" style={{ fontWeight: 600, letterSpacing: '0.03em' }}>System Diagnostics</span>
                </span>
                <span className="sidebar-item-text" style={{ fontSize: '0.6rem', transition: 'transform 0.2s', display: 'inline-block', transform: showDiagnostics ? 'rotate(180deg)' : 'none' }}>▾</span>
              </button>

              {showDiagnostics && (
                <div className="sidebar-item-text" style={{ padding: '0 1rem 0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.65rem', animation: 'fadeIn 0.2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.25rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Total Tokens Used</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {cumulativeTokens ? cumulativeTokens.totalTokens.toLocaleString() : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.25rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Est. API Spend</span>
                    <span style={{ fontWeight: 700, color: cumulativeTokens && cumulativeTokens.totalCost > 0.01 ? '#fbbf24' : '#34d399', fontFamily: 'monospace' }}>
                      {cumulativeTokens ? `$${cumulativeTokens.totalCost.toFixed(6)}` : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.25rem', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>AI Calls Logged</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                      {cumulativeTokens ? cumulativeTokens.sessionCount : '—'}
                    </span>
                  </div>
                  <button
                    onClick={loadCumulativeTokens}
                    style={{ marginTop: '0.15rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', borderRadius: '0.2rem', padding: '0.2rem 0.5rem', fontSize: '0.6rem', cursor: 'pointer', alignSelf: 'flex-end' }}
                  >
                    ↻ Refresh
                  </button>
                </div>
              )}
            </div>

            {/* User account section */}
            <div className="sidebar-user" style={{ borderTop: '1px solid var(--border-color)', position: 'relative' }}>
              <button
                type="button"
                className="sidebar-user-button"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                title={userName + (userEmail && userEmail !== userName ? ` (${userEmail})` : '')}
                onClick={(e) => { e.stopPropagation(); setUserMenuOpen(o => !o); }}
              >
                <span className="sidebar-user-avatar" aria-hidden="true">{userInitials}</span>
                <span className="sidebar-item-text sidebar-user-meta">
                  <span className="sidebar-user-name">{userName}</span>
                  {userEmail && userEmail !== userName && (
                    <span className="sidebar-user-email">{userEmail}</span>
                  )}
                </span>
                <span className="sidebar-item-text sidebar-user-caret" aria-hidden="true">▾</span>
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  className="sidebar-user-menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="sidebar-user-menu-header">
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.78rem' }}>{userName}</div>
                    {userEmail && <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', marginTop: '2px' }}>{userEmail}</div>}
                  </div>
                  <a
                    role="menuitem"
                    href="https://account.microsoft.com/profile"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sidebar-user-menu-item"
                  >
                    <span>👤</span> Microsoft account settings
                  </a>
                  {session ? (
                    <a
                      role="menuitem"
                      href="/api/auth/signout"
                      className="sidebar-user-menu-item sidebar-user-menu-signout"
                    >
                      <span>↪</span> Sign out
                    </a>
                  ) : (
                    <a
                      role="menuitem"
                      href="/api/auth/signin"
                      className="sidebar-user-menu-item"
                    >
                      <span>↪</span> Sign in
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Control Tower Sync Status */}
            <div className="sidebar-sync" style={{ padding: '0.5rem 1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.6875rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)' }}>
              <span className="sidebar-item-text">Control Tower Sync:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', flexShrink: 0 }}></div>
                <span className="sidebar-item-text" style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Today: {todayDate}</span>
              </div>
            </div>
          </div>
          </div>
        </aside>

        {/* MAIN DISPLAY VIEWPORT */}
        <main className="main-content">
          {!isModuleEnabled(activeTab) ? (
            renderNotConfigured(activeTab)
          ) : (
            <>
              {/* TAB 1: EXECUTIVE PROCUREMENT DASHBOARD (HOMEPAGE) */}
              {activeTab === 'overview' && (
            <div id="overview-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
              
              {/* Overview Header */}
              <div className="animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                    Procurement Executive Overview
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Executive control center compiling transactional, inventory, and supplier compliance API streams.
                  </p>
                </div>
                <button 
                  onClick={loadOverviewData}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                >
                  🔄 Refresh Data Streams
                </button>
              </div>

              {/* Primary KPI Grid (4 core action items) */}
              <section className="animate-fade" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
              }}>
                {[
                  { 
                    title: 'Total Active Spend', 
                    value: overviewSummary?.openPoValue ? formatUSD(overviewSummary.openPoValue) : '-', 
                    desc: 'Open Order Net Value', 
                    highlight: true 
                  },
                  { 
                    title: 'Critical Overdue Lines', 
                    value: overviewSummary?.overduePoLines ?? '-', 
                    desc: 'Active Exception Lines',
                    alert: (overviewSummary?.overduePoLines ?? 0) > 0 
                  },
                  { 
                    title: 'Suppliers Impacted', 
                    value: summary?.suppliersWithOverdue ?? '-', 
                    desc: 'Requires Buyer Action',
                    alert: (summary?.suppliersWithOverdue ?? 0) > 0 
                  },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-surface)',
                    border: card.alert 
                      ? '1px solid rgba(244, 63, 94, 0.4)' 
                      : card.highlight 
                        ? '1px solid rgba(79, 70, 229, 0.4)' 
                        : '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  >
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      {card.title}
                    </span>
                    <span style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 700, 
                      color: card.alert ? 'var(--severity-critical-text)' : card.highlight ? 'var(--color-primary)' : 'var(--text-primary)', 
                      margin: '0.35rem 0 0.2rem'
                    }}>
                      {card.value}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {card.desc}
                    </span>
                  </div>
                ))}
              </section>

              {/* Collapsible Secondary Context (Portfolio Details) */}
              <div className="animate-fade" style={{ marginTop: '0.25rem' }}>
                <button
                  className="accordion-toggle"
                  data-open={showPortfolioDetails}
                  onClick={() => setShowPortfolioDetails(!showPortfolioDetails)}
                >
                  <span>{showPortfolioDetails ? '▼' : '▶'} Portfolio Details</span>
                  <span className="chevron">▼</span>
                </button>
                <div className="accordion-body" data-open={showPortfolioDetails}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '0.75rem',
                    padding: '0.75rem 0 0.25rem 0',
                  }}>
                    {[
                      { 
                        title: 'Total Purchase Lines', 
                        value: overviewSummary?.totalPoLines ? overviewSummary.totalPoLines.toLocaleString() : '-', 
                        desc: 'Global Schedule lines' 
                      },
                      { 
                        title: 'Active Suppliers', 
                        value: overviewSummary?.suppliers ?? '-', 
                        desc: 'Registered Sourcing Partners' 
                      },
                      { 
                        title: 'Parts & Materials', 
                        value: overviewSummary?.materials ?? '-', 
                        desc: 'Active Master Records' 
                      },
                      { 
                        title: 'Plants Sourced', 
                        value: overviewSummary?.plants ?? '-', 
                        desc: 'Active Inventory Sites' 
                      },
                    ].map((card, i) => (
                      <div key={i} style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                      >
                        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {card.title}
                        </span>
                        <span style={{ 
                          fontSize: '1.5rem', 
                          fontWeight: 700, 
                          color: 'var(--text-primary)', 
                          margin: '0.35rem 0 0.2rem'
                        }}>
                          {card.value}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {card.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Executive AI Briefing Card (Phase 3E) */}
              <section className="animate-fade" style={{
                background: 'rgba(79, 70, 229, 0.02)',
                border: '1px solid rgba(79, 70, 229, 0.15)',
                borderRadius: '0.625rem',
                padding: '1rem',
                boxShadow: 'var(--shadow-sm)',
                display: 'flex',
                flexDirection: 'column',
              }}>
                {/* Accordion Toggle Header */}
                <div 
                  className="accordion-toggle" 
                  data-open={showBriefing} 
                  onClick={() => setShowBriefing(!showBriefing)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.25rem 0.5rem',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    width: '100%',
                    userSelect: 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                    <span style={{ fontSize: '1.25rem' }}>🤖</span>
                    <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
                      <h2 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Executive AI Portfolio Briefing</h2>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>On-demand portfolio synthesis compiled from Control Tower streams</span>
                    </div>

                    {/* Collapsed state indicator: badge + headline */}
                    {!showBriefing && execBriefing && !execBriefingLoading && !execBriefing._error && (
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginLeft: '1rem', animation: 'fadeIn 0.2s' }}>
                        {(() => {
                          const level = execBriefing.health_level;
                          const isHealthy = level === 'Healthy';
                          const isMod = level === 'Moderate';
                          const isStressed = level === 'Stressed';
                          const color = isHealthy ? '#22c55e' : isMod ? '#3b82f6' : isStressed ? '#fb923c' : '#f43f5e';
                          const bg = isHealthy ? 'rgba(34,197,94,0.08)' : isMod ? 'rgba(59,130,246,0.08)' : isStressed ? 'rgba(249,115,22,0.08)' : 'rgba(244,63,94,0.08)';
                          return (
                            <span style={{
                              padding: '0.15rem 0.4rem',
                              borderRadius: '9999px',
                              fontSize: '0.6rem',
                              fontWeight: 700,
                              color,
                              background: bg,
                              border: `1px solid ${color}33`,
                              textTransform: 'uppercase',
                              letterSpacing: '0.02em',
                              whiteSpace: 'nowrap'
                            }}>{level}</span>
                          );
                        })()}
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', maxWidth: '350px' }}>
                          {execBriefing.headline}
                        </span>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={(e) => e.stopPropagation()}>
                    {!execBriefingLoading && !execBriefing && (
                      <button
                        onClick={loadExecutiveBriefing}
                        style={{
                          background: 'linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '0.25rem',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: '0 2px 4px rgba(79,70,229,0.15)',
                          marginRight: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem'
                        }}
                      >
                        ✨ Generate Briefing
                      </button>
                    )}
                    {execBriefing && !execBriefingLoading && !execBriefing._error && (
                      <button
                        onClick={loadExecutiveBriefing}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--color-primary)',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          marginRight: '0.5rem'
                        }}
                      >
                        🔄 Regenerate Briefing
                      </button>
                    )}
                    <span className="chevron" style={{ transform: showBriefing ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
                  </div>
                </div>

                {/* Accordion Body */}
                <div className="accordion-body" data-open={showBriefing}>
                  <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-color)', marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {execBriefingLoading && (
                      <div style={{
                        padding: '2rem',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.75rem',
                        background: 'var(--bg-surface-elevated)',
                        borderRadius: '0.5rem',
                        border: '1px dashed var(--border-color)'
                      }}>
                        <div style={{ width: '20px', height: '20px', border: '2px solid rgba(79,70,229,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }} className="animate-pulse">
                          Synthesizing active purchase order lines, shortages, and exceptions...
                        </span>
                      </div>
                    )}

                    {!execBriefingLoading && execBriefing?._error && (
                      <div style={{
                        padding: '1.25rem',
                        background: 'rgba(244,63,94,0.05)',
                        borderRadius: '0.5rem',
                        border: '1px solid rgba(244,63,94,0.2)',
                        fontSize: '0.75rem',
                        color: '#f43f5e'
                      }}>
                        <p style={{ margin: 0, fontWeight: 700 }}>Briefing Generation Failed</p>
                        <p style={{ margin: '0.25rem 0 0.75rem 0', color: 'var(--text-secondary)' }}>{execBriefing._error}</p>
                        <button
                          onClick={loadExecutiveBriefing}
                          style={{
                            background: 'var(--color-primary)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '0.375rem',
                            padding: '0.4rem 0.8rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Retry Generation
                        </button>
                      </div>
                    )}

                    {!execBriefingLoading && !execBriefing && (
                      <div style={{
                        padding: '1.5rem',
                        background: 'var(--bg-surface-elevated)',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--border-color)',
                        textAlign: 'center',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '500px', lineHeight: 1.5 }}>
                          Receive a high-level strategic synthesis of your supply chain operations today — highlighting overall portfolio health levels, top critical risks, and key strategic recommendations.
                        </p>
                        <button
                          onClick={loadExecutiveBriefing}
                          style={{
                            background: 'linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '0.375rem',
                            padding: '0.55rem 1.25rem',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: '0 2px 4px rgba(79,70,229,0.15)',
                            transition: 'transform 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          ✨ Generate Daily Briefing
                        </button>
                      </div>
                    )}

                    {!execBriefingLoading && execBriefing && !execBriefing._error && (
                      <>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500 }}>Portfolio Health:</span>
                            {(() => {
                              const level = execBriefing.health_level;
                              const isHealthy = level === 'Healthy';
                              const isMod = level === 'Moderate';
                              const isStressed = level === 'Stressed';
                              const color = isHealthy ? '#22c55e' : isMod ? '#3b82f6' : isStressed ? '#fb923c' : '#f43f5e';
                              const bg = isHealthy ? 'rgba(34,197,94,0.08)' : isMod ? 'rgba(59,130,246,0.08)' : isStressed ? 'rgba(249,115,22,0.08)' : 'rgba(244,63,94,0.08)';
                              return (
                                <span style={{
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '9999px',
                                  fontSize: '0.65rem',
                                  fontWeight: 700,
                                  color,
                                  background: bg,
                                  border: `1px solid ${color}33`,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.02em'
                                }}>{level}</span>
                              );
                            })()}
                          </div>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                            {execBriefing.headline}
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                          {/* Left: Narrative and Strategic Recommendation */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                            <div>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>Operational Narrative</div>
                              <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                                {execBriefing.narrative}
                              </p>
                            </div>

                            <div style={{
                              padding: '0.75rem 1rem',
                              background: 'var(--bg-surface-elevated)',
                              borderLeft: '3px solid var(--color-primary)',
                              borderRadius: '0.25rem',
                              marginTop: '0.25rem'
                            }}>
                              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.25rem' }}>Strategic Recommendation</div>
                              <p style={{ margin: 0, fontSize: '0.775rem', color: 'var(--text-primary)', fontWeight: 600, lineHeight: 1.45 }}>
                                {execBriefing.strategic_recommendation}
                              </p>
                            </div>
                          </div>

                          {/* Right: Top Operational Risks */}
                          <div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.5rem' }}>Top Portfolio Risks</div>
                            {execBriefing.top_risks && execBriefing.top_risks.length > 0 && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {execBriefing.top_risks.map((risk: string, idx: number) => (
                                  <div key={idx} style={{
                                    display: 'flex',
                                    gap: '0.5rem',
                                    padding: '0.5rem 0.75rem',
                                    background: 'rgba(244,63,94,0.02)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '0.35rem',
                                    alignItems: 'flex-start'
                                  }}>
                                    <span style={{ color: '#f43f5e', fontSize: '0.8rem', marginTop: '0.1rem' }}>⚠️</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                      {risk}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '0.6rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                          <span>Compiled at: {new Date(execBriefing.generated_at).toLocaleString()}</span>
                          <span>Metrics Snapshot: {execBriefing.data_snapshot?.overdueLines} overdue POs | {execBriefing.data_snapshot?.activeExceptions} active exceptions | ${(execBriefing.data_snapshot?.financialExposure / 1000).toFixed(0)}K Exposure</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {/* Dashboard overview analytics section with SVG widgets */}
              {/* Tier 4 — Primary Action-Oriented Analytics (Always visible) */}
              <div className="analytics-grid animate-fade">
                
                {/* 1. Operational Exceptions & Bottlenecks Control Panel */}
                <div className="widget-panel">
                  <div className="widget-header">
                    <h3 className="widget-title">Active Operational Bottlenecks</h3>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontWeight: 600 }}>Deep Drilldown Sourced</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%', justifyContent: 'center' }}>
                    
                    {/* Overdue PO lines card */}
                    <div 
                      onClick={() => {
                        resetFiltersAndDrawers();
                        setOverdueDaysMin('1');
                        setActiveTab('overdue');
                        loadData();
                      }}
                      data-testid="overview-overdue-card"
                      style={{
                        background: 'rgba(244, 63, 94, 0.04)',
                        border: '1px solid rgba(244, 63, 94, 0.15)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.08)'; e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(244, 63, 94, 0.04)'; e.currentTarget.style.borderColor = 'rgba(244, 63, 94, 0.15)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>⏳</span>
                        <div>
                          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Overdue PO Lines</h4>
                          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>Require urgent buyer expediting</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span data-testid="overview-overdue-count" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--severity-critical-text)' }}>
                          {overviewSummary?.overduePoLines ?? '-'}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Lines</span>
                      </div>
                    </div>

                    {/* Logistics & Transit Delay card */}
                    <div 
                      onClick={() => triggerDrilldown('Logistics & Transit Delay')}
                      style={{
                        background: 'rgba(249, 115, 22, 0.04)',
                        border: '1px solid rgba(249, 115, 22, 0.15)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(249, 115, 22, 0.08)'; e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(249, 115, 22, 0.04)'; e.currentTarget.style.borderColor = 'rgba(249, 115, 22, 0.15)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>🚢</span>
                        <div>
                          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Logistics & Transit Delays</h4>
                          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>ASN shipments delayed in customs/transit</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--severity-high-text)' }}>
                          {overviewSummary?.asnDelays ?? '-'}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Shipments</span>
                      </div>
                    </div>

                    {/* Missing Acknowledgements card */}
                    <div 
                      onClick={() => {
                        resetFiltersAndDrawers();
                        setAckStatusFilter('MISSING');
                        setActiveTab('acknowledgement');
                        loadAcknowledgementData();
                      }}
                      data-testid="overview-missing-ack-card"
                      style={{
                        background: 'rgba(234, 179, 8, 0.04)',
                        border: '1px solid rgba(234, 179, 8, 0.15)',
                        borderRadius: '0.5rem',
                        padding: '1rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(234, 179, 8, 0.08)'; e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.3)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(234, 179, 8, 0.04)'; e.currentTarget.style.borderColor = 'rgba(234, 179, 8, 0.15)'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ fontSize: '1.5rem' }}>🤝</span>
                        <div>
                          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>Missing Acknowledgements</h4>
                          <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>POs unacknowledged by supplier portal</span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span data-testid="overview-missing-ack-count" style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--severity-medium-text)' }}>
                          {overviewSummary?.missingAck ?? '-'}
                        </span>
                        <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Unacked</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* 2. Supplier Compliance Risk Profile */}
                <div className="widget-panel">
                  <div className="widget-header">
                    <h3 className="widget-title">Supplier Compliance Risk profile</h3>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>By Risk Score parameters</span>
                  </div>
                  {overviewLoading ? (
                    <div style={{ height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <div style={{ width: '20px', height: '20px', border: '2px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', height: '100%' }}>
                      
                      {/* Interactive visual breakdown cards */}
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[
                          { name: 'Critical Risk (>=60)', count: overviewDetails?.supplierRiskDistribution?.critical ?? 0, color: 'var(--severity-critical-text)', bg: 'var(--severity-critical-bg)' },
                          { name: 'High Risk (40-59)', count: overviewDetails?.supplierRiskDistribution?.high ?? 0, color: 'var(--severity-high-text)', bg: 'var(--severity-high-bg)' },
                          { name: 'Medium Risk (20-39)', count: overviewDetails?.supplierRiskDistribution?.medium ?? 0, color: 'var(--severity-medium-text)', bg: 'var(--severity-medium-bg)' },
                          { name: 'Low Risk (<20)', count: overviewDetails?.supplierRiskDistribution?.low ?? 0, color: 'var(--severity-low-text)', bg: 'var(--severity-low-bg)' },
                        ].map((risk, rIdx) => (
                          <div key={rIdx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.35rem 0.5rem', background: risk.bg, borderRadius: '0.25rem', fontSize: '0.7rem' }}>
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{risk.name}</span>
                            <span style={{ color: risk.color, fontWeight: 700 }}>{risk.count} partners</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

              </div>

              {/* Collapsible Secondary Context (Portfolio Analytics) */}
              <div className="animate-fade" style={{ marginTop: '0.25rem' }}>
                <button
                  className="accordion-toggle"
                  data-open={showPortfolioAnalytics}
                  onClick={() => setShowPortfolioAnalytics(!showPortfolioAnalytics)}
                >
                  <span>{showPortfolioAnalytics ? '▼' : '▶'} Portfolio Analytics</span>
                  <span className="chevron">▼</span>
                </button>
                <div className="accordion-body" data-open={showPortfolioAnalytics}>
                  <div style={{ paddingTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    
                    {/* Charts grid */}
                    <div className="analytics-grid">
                      {/* Top 10 Active Suppliers by Order Spend */}
                      <div className="widget-panel" style={{ gridColumn: 'span 2' }}>
                        <div className="widget-header">
                          <h3 className="widget-title">Top 10 Active Suppliers by Order Spend</h3>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sourced from ERP logs</span>
                        </div>
                        {overviewLoading ? (
                          <div style={{ height: '200px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ width: '20px', height: '20px', border: '2px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', padding: '0.5rem 0' }}>
                            {(overviewDetails?.spendBySupplier || []).map((sup, idx) => {
                              const maxVal = overviewDetails?.spendBySupplier?.[0]?.value || 1;
                              const pct = (sup.value / maxVal) * 100;
                              return (
                                <div key={sup.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.725rem', fontWeight: 500 }}>
                                    <span style={{ color: 'var(--text-primary)' }}>{idx + 1}. {sup.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>({sup.id})</span></span>
                                    <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{formatUSD(sup.value)}</span>
                                  </div>
                                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ 
                                      width: `${pct}%`, 
                                      height: '100%', 
                                      background: 'var(--color-primary)',
                                      borderRadius: '4px',
                                      transition: 'width 0.8s ease'
                                    }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Commodity Spend Distribution */}
                      <div className="widget-panel">
                        <div className="widget-header">
                          <h3 className="widget-title">Commodity Spend Distribution</h3>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>By Material Group</span>
                        </div>
                        {overviewLoading ? (
                          <div style={{ height: '180px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            <div style={{ width: '20px', height: '20px', border: '2px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                            {(overviewDetails?.spendByMaterialGroup || []).slice(0, 5).map((mg) => (
                              <div key={mg.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.25rem 0', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.725rem' }}>
                                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{mg.category}</span>
                                </div>
                                <span style={{ fontSize: '0.725rem', color: 'var(--color-primary)', fontWeight: 600 }}>{formatUSD(mg.value)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Recent Purchase Orders Created */}
                    <section className="widget-panel" style={{ width: '100%' }}>
                      <div className="widget-header">
                        <h3 className="widget-title">Recent Purchase Orders Created</h3>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Latest transactions Sourced</span>
                      </div>
                      {overviewLoading ? (
                        <div style={{ height: '120px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                          <div style={{ width: '20px', height: '20px', border: '2px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.725rem' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '0.5rem', fontWeight: 600 }}>PO Number</th>
                                <th style={{ padding: '0.5rem', fontWeight: 600 }}>PO Date</th>
                                <th style={{ padding: '0.5rem', fontWeight: 600 }}>Supplier Vendor</th>
                                <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Items Count</th>
                                <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'right' }}>Open Value</th>
                                <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>ERP Release</th>
                                <th style={{ padding: '0.5rem', fontWeight: 600, textAlign: 'center' }}>Header Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(overviewDetails?.recentActivity || []).map((act, aIdx) => (
                                <tr key={aIdx} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.01)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                                  <td style={{ padding: '0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>{act.po_number}</td>
                                  <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{act.po_date}</td>
                                  <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>{act.supplier_name}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{act.items_count}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'right', color: 'var(--color-primary)', fontWeight: 600 }}>{formatUSD(act.open_value)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: '#ecfdf5', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                                      {act.release_status}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    <span style={{ padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.6875rem', fontWeight: 600, backgroundColor: '#eef2ff', color: '#3b82f6', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                      {act.header_status}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: OVERDUE PURCHASE ORDER ACTION WORKBENCH (PHASE 1A CORRECTION & 1B WORKLIST) */}
          {activeTab === 'overdue' && (
            <div id="overdue-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
              
              {/* Overdue Header */}
              <div className="animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>
                    Overdue Purchase Orders Workbench
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    Buyer workspace to identify overdue PO lines, evaluate recovery evidence, and manage delay grouping.
                  </p>
                </div>
              </div>

              {/* OVERDUE KPI SUMMARY CARDS (FIXED GLOBAL METRICS AT THE TOP) */}
              {/* Primary KPI Row (3 core cards) */}
              <section className="animate-fade" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.75rem',
              }}>
                {[
                  { title: 'Total Overdue Lines', value: summary?.totalOverduePoLines ?? '-', desc: 'Active Exceptions', alert: true },
                  { title: 'Total Overdue Value', value: summary?.totalOverdueValue ? formatUSD(summary.totalOverdueValue) : '-', desc: 'Active Supplier Exposure', highlight: true },
                  { title: 'Suppliers Impacted', value: summary?.suppliersWithOverdue ?? '-', desc: 'Requires Buyer Action' },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-surface)',
                    border: card.alert 
                      ? '1px solid rgba(244, 63, 94, 0.4)' 
                      : card.highlight 
                        ? '1px solid rgba(79, 70, 229, 0.4)' 
                        : '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  >
                    <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {card.title}
                    </span>
                    <span 
                      data-testid={`overdue-kpi-val-${card.title.toLowerCase().replace(/\s+/g, '-')}`}
                      style={{ 
                        fontSize: '1.25rem', 
                        fontWeight: 700, 
                        color: card.alert ? 'var(--severity-critical-text)' : card.highlight ? 'var(--color-primary)' : 'var(--text-primary)', 
                        margin: '0.25rem 0'
                      }}
                    >
                      {card.value}
                    </span>
                    <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                      {card.desc}
                    </span>
                  </div>
                ))}
              </section>

              {/* Collapsible Secondary Context (Full Summary Details) */}
              <div className="animate-fade" style={{ marginTop: '0.25rem' }}>
                <button
                  className="accordion-toggle"
                  data-open={showOverdueSummaryDetails}
                  onClick={() => setShowOverdueSummaryDetails(!showOverdueSummaryDetails)}
                >
                  <span>{showOverdueSummaryDetails ? '▼' : '▶'} Full Summary Details</span>
                  <span className="chevron">▼</span>
                </button>
                <div className="accordion-body" data-open={showOverdueSummaryDetails}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '0.75rem',
                    padding: '0.75rem 0 0.25rem 0',
                  }}>
                    {[
                      { title: 'Total Open PO Lines', value: summary?.totalOpenPoLines ?? '-', desc: 'Sourced from schedule lines' },
                      { title: 'Total Overdue Lines', value: summary?.totalOverduePoLines ?? '-', desc: 'Active Exceptions', highlight: true },
                      { title: 'Total Open Quantity', value: summary?.totalOpenQty ? summary.totalOpenQty.toLocaleString() : '-', desc: 'Pending Receipts' },
                      { title: 'Plants Impacted', value: summary?.plantsImpacted ?? '-', desc: 'Active Sites Sourced' },
                      { title: 'Average Days Overdue', value: summary?.averageDaysOverdue ? `${summary.averageDaysOverdue} days` : '-', desc: 'Avg Delay Profile' },
                    ].map((card, i) => (
                      <div key={i} style={{
                        background: 'var(--bg-surface)',
                        border: card.highlight 
                          ? '1px solid rgba(79, 70, 229, 0.4)' 
                          : '1px solid var(--border-color)',
                        borderRadius: '0.5rem',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: 'var(--shadow-sm)',
                      }}
                      >
                        <span style={{ fontSize: '0.6875rem', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                          {card.title}
                        </span>
                        <span style={{ 
                          fontSize: '1.25rem', 
                          fontWeight: 700, 
                          color: card.highlight ? 'var(--color-primary)' : 'var(--text-primary)', 
                          margin: '0.25rem 0'
                        }}>
                          {card.value}
                        </span>
                        <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                          {card.desc}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* FILTER BAR PANEL */}
              <section className="animate-fade" style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                  
                  {/* Search */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search PO / Material</label>
                    <input 
                      type="text" 
                      placeholder="Ex. 4500000001, M500..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Plant Site */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Plant Site</label>
                    <select 
                      value={plantFilter}
                      onChange={(e) => setPlantFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Plants</option>
                      {plantList.map(p => (
                        <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Supplier Vendor */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Supplier Vendor</label>
                    <select 
                      value={supplierFilter}
                      onChange={(e) => setSupplierFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Suppliers</option>
                      {supplierList.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Purchasing Group */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Pur. Group</label>
                    <select 
                      value={purchasingGroupFilter}
                      onChange={(e) => setPurchasingGroupFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Groups</option>
                      {purchasingGroups.map(pg => (
                        <option key={pg} value={pg}>{pg}</option>
                      ))}
                    </select>
                  </div>

                  {/* Material Group */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Material Group</label>
                    <select 
                      value={materialGroupFilter}
                      onChange={(e) => setMaterialGroupFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Groups</option>
                      {materialGroups.map(mg => (
                        <option key={mg} value={mg}>{mg}</option>
                      ))}
                    </select>
                  </div>

                  {/* Delay Category Filter */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Delay Category</label>
                    <select 
                      value={delayCategoryFilter}
                      onChange={(e) => setDelayCategoryFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All delay types</option>
                      <option value="Supplier Acknowledgement Missing">Ack Missing</option>
                      <option value="Logistics & Transit Delay">Logistics Delay</option>
                      <option value="Pending Delay Verification">Pending Delay Verification</option>
                      <option value="Supplier Capacity Bottleneck">Capacity Hold</option>
                      <option value="Short Lead Time Exception">Lead Time exception</option>
                    </select>
                  </div>

                  {/* Overdue Days Min */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Overdue Min</label>
                    <input 
                      type="number" 
                      placeholder="Min Days" 
                      value={overdueDaysMin}
                      onChange={(e) => setOverdueDaysMin(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Sort Sequence */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Sort Sequence</label>
                    <select 
                      value={overdueSort}
                      onChange={(e) => setOverdueSort(e.target.value as any)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="default">Days Overdue (High-Low)</option>
                      <option value="priority">Priority Score (High-Low)</option>
                    </select>
                  </div>

                  {/* Reset Button */}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button 
                      onClick={resetFilters}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '0.375rem',
                        padding: '0.45rem 1rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                    >
                      Clear Filters
                    </button>
                  </div>

                </div>
              </section>

              {/* WORKLIST SECTION DIVIDER */}
              <div className="section-tier-label" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
                Worklist — {worklistTotal} lines in queue
              </div>

              {/* MAIN BODY AREA (WORKLIST TABLE & DRAWER) */}
              <div style={{ display: 'flex', flex: 1, gap: '1.25rem', overflow: 'visible', width: '100%' }}>
                
                {/* OVERDUE WORKLIST TABLE */}
                <div style={{ 
                  flex: 1, 
                  background: 'var(--bg-surface)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '0.5rem',
                  overflow: 'visible',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-md)'
                }}>
                  
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Active Overdue Worklist (<span data-testid="overdue-total-count-badge">{worklistTotal}</span>)
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>Show</span>
                        <select
                          value={limit}
                          onChange={(e) => setLimit(e.target.value)}
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.25rem',
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="15">15</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                        <span>entries</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Click on any row to open the Procurement Context Drawer.
                    </span>
                  </div>

                  {error && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: '#f87171' }}>
                      <p style={{ fontWeight: 600, fontSize: '0.9rem' }}>⚠️ Data Sync Failure</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>{error}</p>
                      <button 
                        onClick={loadData} 
                        style={{ marginTop: '1rem', padding: '0.4rem 1rem', background: 'var(--color-primary)', border: 'none', color: '#fff', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem' }}
                      >
                        Retry Connectors
                      </button>
                    </div>
                  )}

                  {loading && !error && (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
                      <div style={{ width: '30px', height: '30px', border: '3px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Querying overdue schedule exception metrics...</span>
                    </div>
                  )}

                  {!loading && !error && worklist.length === 0 && (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '4rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>✅</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Overdue POs Sourced</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active filters returned zero delay exceptions.</span>
                    </div>
                  )}

                  {!loading && !error && worklist.length > 0 && (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                          <tr>
                            <th style={{ padding: '0.75rem 0.5rem', width: '100px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, paddingLeft: '1rem' }}>Sev</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '90px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Priority</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '85px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>PO Number</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '50px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Item</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '120px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Supplier Vendor</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '120px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Material Part</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '125px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Delay Category</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '50px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Site</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '80px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Due Date</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '75px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Overdue</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '70px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Open Qty</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '90px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Open Value</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '120px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, paddingRight: '1rem' }}>Recovery Signals</th>
                          </tr>
                        </thead>
                        <tbody>
                          {worklist.map((item, idx) => {
                            const isSelected = selectedItemKey?.po === item.po_number && selectedItemKey?.item === item.item_number && selectedItemKey?.line === item.schedule_line;
                            
                            // ASN and ACK recovery signal color maps (Phase 1B Milestone 2)
                            const recoveryAsn = item.asn_status !== 'NONE';
                            const recoveryAck = item.acknowledgement_status === 'ACKNOWLEDGED';

                            return (
                              <tr 
                                key={`${item.po_number}_${item.item_number}_${item.schedule_line}_${idx}`}
                                data-testid={`overdue-row-${item.po_number}-${item.item_number}`}
                                onClick={() => setSelectedItemKey({ po: item.po_number, item: item.item_number, line: item.schedule_line })}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  cursor: 'pointer',
                                  background: isSelected ? 'rgba(79, 70, 229, 0.12)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                  transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
                                }}
                              >
                                {/* Severity */}
                                <td style={{ padding: '0.75rem 0.5rem', paddingLeft: '1rem' }}>
                                  <span className={`badge-${item.severity.toLowerCase()}`} style={{
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    width: '100%'
                                  }}>
                                    {item.severity}
                                  </span>
                                </td>
                                {/* Priority Badge */}
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  <span style={{
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.6875rem',
                                    fontWeight: 700,
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    width: '100%',
                                    color: item.priorityLevel === 'CRITICAL' ? '#dc2626' : item.priorityLevel === 'HIGH' ? '#d97706' : item.priorityLevel === 'MEDIUM' ? '#2563eb' : '#0d9488',
                                    background: item.priorityLevel === 'CRITICAL' ? 'rgba(239, 68, 68, 0.1)' : item.priorityLevel === 'HIGH' ? 'rgba(245, 158, 11, 0.1)' : item.priorityLevel === 'MEDIUM' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(13, 148, 136, 0.1)',
                                    border: item.priorityLevel === 'CRITICAL' ? '1px solid rgba(239, 68, 68, 0.2)' : item.priorityLevel === 'HIGH' ? '1px solid rgba(245, 158, 11, 0.2)' : item.priorityLevel === 'MEDIUM' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid rgba(13, 148, 136, 0.2)'
                                  }}>
                                    {item.priorityLevel || 'LOW'}
                                  </span>
                                </td>
                                {/* PO Number */}
                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.po_number}</td>
                                {/* Item Number */}
                                <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{item.item_number}</td>
                                {/* Supplier Name */}
                                <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }} title={item.supplier_name}>
                                  {item.supplier_name}
                                </td>
                                {/* Material Details */}
                                <td style={{ padding: '0.75rem 0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.material_id}</span>
                                  <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.material_description}
                                  </span>
                                </td>
                                {/* Delay Category (Phase 1B Milestone 1) */}
                                <td style={{ padding: '0.75rem 0.5rem' }}>
                                  <span style={{ 
                                    color: item.delay_category === 'Supplier Acknowledgement Missing' ? '#e11d48' : item.delay_category === 'Logistics & Transit Delay' ? '#2563eb' : '#d97706',
                                    fontSize: '0.6875rem',
                                    fontWeight: 600
                                  }}>
                                    {item.delay_category}
                                  </span>
                                </td>
                                {/* Plant Site */}
                                <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{item.plant}</td>
                                {/* Requested Date */}
                                <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{item.requested_delivery_date}</td>
                                {/* Days Overdue */}
                                <td style={{ padding: '0.75rem 0.5rem', fontWeight: 700, color: item.days_overdue > 7 ? 'var(--severity-critical-text)' : 'var(--text-primary)' }}>
                                  {item.days_overdue} days
                                </td>
                                {/* Open Quantity */}
                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>{item.open_quantity}</td>
                                {/* Open Value */}
                                <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>{formatUSD(item.open_value)}</td>
                                
                                {/* Recovery Signals (Phase 1B Milestone 2) */}
                                <td style={{ padding: '0.75rem 0.5rem', paddingRight: '1rem', whiteSpace: 'nowrap' }}>
                                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                    {recoveryAsn && (
                                      <span style={{ 
                                        padding: '0.2rem 0.4rem', 
                                        borderRadius: '0.25rem', 
                                        fontSize: '0.6875rem', 
                                        fontWeight: 700, 
                                        backgroundColor: '#eef2ff', 
                                        color: '#3b82f6', 
                                        border: '1px solid rgba(59, 130, 246, 0.25)' 
                                      }}>
                                        ASN
                                      </span>
                                    )}
                                    {recoveryAck ? (
                                      <span style={{ 
                                        padding: '0.2rem 0.4rem', 
                                        borderRadius: '0.25rem', 
                                        fontSize: '0.6875rem', 
                                        fontWeight: 700, 
                                        backgroundColor: '#ecfdf5', 
                                        color: '#10b981', 
                                        border: '1px solid rgba(16, 185, 129, 0.25)' 
                                      }}>
                                        ACK
                                      </span>
                                    ) : (
                                      <span style={{ 
                                        padding: '0.2rem 0.4rem', 
                                        borderRadius: '0.25rem', 
                                        fontSize: '0.6875rem', 
                                        fontWeight: 700, 
                                        backgroundColor: '#fef2f2', 
                                        color: '#ef4444', 
                                        border: '1px solid rgba(239, 68, 68, 0.25)' 
                                      }}>
                                        NO ACK
                                      </span>
                                    )}
                                    {/* Predictive Delay Likelihood (Phase 3D) */}
                                    {(() => {
                                      const score = item.delayLikelihoodScore ?? 0;
                                      const color = score >= 80 ? '#ef4444' : score >= 60 ? '#f97316' : score >= 30 ? '#eab308' : '#22c55e';
                                      const bg = score >= 80 ? 'rgba(239, 68, 68, 0.12)' : score >= 60 ? 'rgba(249, 115, 22, 0.12)' : score >= 30 ? 'rgba(234, 179, 8, 0.12)' : 'rgba(34, 197, 94, 0.12)';
                                      const border = score >= 80 ? 'rgba(239, 68, 68, 0.2)' : score >= 60 ? 'rgba(249, 115, 22, 0.2)' : score >= 30 ? 'rgba(234, 179, 8, 0.2)' : 'rgba(34, 197, 94, 0.2)';
                                      return (
                                        <span style={{
                                          padding: '0.2rem 0.4rem',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.6875rem',
                                          fontWeight: 700,
                                          backgroundColor: bg,
                                          color,
                                          border: `1px solid ${border}`,
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '0.15rem'
                                        }} title={`Predictive Delay Risk: ${score}% (calculated from OTD, quality, acknowledgement status, and response history)`}>
                                          {score >= 80 ? '⚠' : score >= 30 ? '!' : '✓'} {score}%
                                        </span>
                                      );
                                    })()}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* PAGINATION CONTROLS (Phase 1B Milestone 3) */}
                  {!loading && !error && worklist.length > 0 && (
                    <div style={{
                      padding: '1rem',
                      borderTop: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.725rem',
                      background: 'rgba(255, 255, 255, 0.005)'
                    }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        Showing <strong>{((page - 1) * parseInt(limit)) + 1}</strong> to <strong>{Math.min(page * parseInt(limit), worklistTotal)}</strong> of <strong>{worklistTotal.toLocaleString()}</strong> entries
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {/* Prev Button */}
                        <button
                          disabled={page === 1}
                          onClick={() => setPage(p => Math.max(1, p - 1))}
                          style={{
                            background: page === 1 ? 'transparent' : 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            color: page === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: page === 1 ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Previous
                        </button>

                        {/* Page Numbers */}
                        {(() => {
                          const totalPages = Math.ceil(worklistTotal / parseInt(limit)) || 1;
                          const startPage = Math.max(1, page - 2);
                          const endPage = Math.min(totalPages, startPage + 4);
                          const adjustedStart = Math.max(1, endPage - 4);
                          
                          const buttons = [];
                          for (let i = adjustedStart; i <= endPage; i++) {
                            buttons.push(i);
                          }
                          
                          return buttons.map(num => (
                            <button
                              key={num}
                              onClick={() => setPage(num)}
                              style={{
                                background: page === num ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                                border: page === num ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                color: page === num ? '#ffffff' : 'var(--text-primary)',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontWeight: page === num ? 700 : 500,
                                transition: 'all 0.15s'
                              }}
                            >
                              {num}
                            </button>
                          ));
                        })()}

                        {/* Next Button */}
                        <button
                          disabled={(() => {
                            const totalPages = Math.ceil(worklistTotal / parseInt(limit)) || 1;
                            return page === totalPages;
                          })()}
                          onClick={() => {
                            const totalPages = Math.ceil(worklistTotal / parseInt(limit)) || 1;
                            setPage(p => Math.min(totalPages, p + 1));
                          }}
                          style={{
                            background: (() => {
                              const totalPages = Math.ceil(worklistTotal / parseInt(limit)) || 1;
                              return page === totalPages ? 'transparent' : 'var(--bg-surface-elevated)';
                            })(),
                            border: '1px solid var(--border-color)',
                            color: (() => {
                              const totalPages = Math.ceil(worklistTotal / parseInt(limit)) || 1;
                              return page === totalPages ? 'var(--text-muted)' : 'var(--text-primary)';
                            })(),
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: (() => {
                              const totalPages = Math.ceil(worklistTotal / parseInt(limit)) || 1;
                              return page === totalPages ? 'not-allowed' : 'pointer';
                            })(),
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* PROCUREMENT CONTEXT SIDE PANEL */}
                <div style={{
                  position: 'fixed',
                  zoom: 0.85,
                  top: 'calc(1.25rem / 0.85)',
                  right: selectedItemKey ? 'calc(1.25rem / 0.85)' : '-600px',
                  width: '450px',
                  height: 'calc((100vh - 2.5rem) / 0.85)',
                  opacity: selectedItemKey ? 1 : 0,
                  transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s',
                  background: 'var(--bg-surface)',
                  borderLeft: selectedItemKey ? '1px solid var(--border-color)' : 'none',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-drawer)',
                  zIndex: 100
                }}>
                  {selectedItemKey && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '450px' }}>
                      
                      {/* Drawer Header */}
                      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface-elevated)' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {selectedItemKey.po === 'PART' ? 'Part Availability Workbench' : 'Procurement Line Control'}
                          </h3>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {selectedItemKey.po === 'PART' 
                              ? `Material ${mrpTimelineData?.materialName || selectedItemKey.item} / Plant ${mrpTimelineData?.plantName || selectedItemKey.line}`
                              : `PO ${selectedItemKey.po} / Item ${selectedItemKey.item}`
                            }
                          </span>
                        </div>
                        <button 
                          onClick={() => setSelectedItemKey(null)}
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem', cursor: 'pointer', outline: 'none' }}
                        >
                          ✕
                        </button>
                      </div>

                      {/* Drawer Tabs */}
                      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', background: 'rgba(255,255,255,0.01)' }}>
                        {selectedItemKey.po === 'PART' ? (
                          [
                            { id: 'mrp', label: 'MRP Timeline' },
                            { id: 'profile', label: 'Part Profile' }
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setDetailTab(tab.id)}
                              style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                borderBottom: detailTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: detailTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                padding: '0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              {tab.label}
                            </button>
                          ))
                        ) : (
                          [
                            { id: 'kpi', label: 'Timeline & Profile' },
                            { id: 'log', label: 'Supplier Sentiment' },
                            { id: 'root-cause', label: '🤖 AI Diagnosis' },
                            { id: 'action', label: 'Action Workbench' }
                          ].map(tab => (
                            <button
                              key={tab.id}
                              onClick={() => setDetailTab(tab.id)}
                              style={{
                                flex: 1,
                                background: 'transparent',
                                border: 'none',
                                borderBottom: detailTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
                                color: detailTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                                padding: '0.75rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                              }}
                            >
                              {tab.label}
                            </button>
                          ))
                        )}
                      </div>

                      {/* Drawer Scrollable Content */}
                      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                        
                        {(detailLoading || mrpLoading) ? (
                          <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', gap: '0.5rem', minHeight: '200px' }}>
                            <div style={{ width: '24px', height: '24px', border: '2px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              {selectedItemKey.po === 'PART' ? 'Syncing MRP supply-demand timeline...' : 'Syncing active tracking timeline...'}
                            </span>
                          </div>
                        ) : selectedItemKey.po === 'PART' ? (
                          mrpTimelineData && (
                            <>
                              {/* TAB: PART PROFILE */}
                              {detailTab === 'profile' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                  <div style={{ 
                                    background: mrpTimelineData.currentStock < mrpTimelineData.safetyStock ? 'rgba(244, 63, 94, 0.05)' : 'rgba(16, 185, 129, 0.05)',
                                    border: `1px solid ${mrpTimelineData.currentStock < mrpTimelineData.safetyStock ? 'rgba(244, 63, 94, 0.2)' : 'rgba(16, 185, 129, 0.2)'}`,
                                    borderRadius: '0.375rem', 
                                    padding: '0.75rem', 
                                    fontSize: '0.75rem' 
                                  }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontWeight: 700 }}>
                                      <span style={{ color: mrpTimelineData.currentStock < mrpTimelineData.safetyStock ? 'var(--severity-critical-text)' : 'var(--color-success)' }}>
                                        {mrpTimelineData.currentStock < mrpTimelineData.safetyStock 
                                          ? '⚠️ Safety Stock Violation' 
                                          : '✅ Safety Stock Compliant'
                                        }
                                      </span>
                                      <span>Stock: {mrpTimelineData.currentStock} / Safety: {mrpTimelineData.safetyStock}</span>
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                      {mrpTimelineData.currentStock < mrpTimelineData.safetyStock
                                        ? `This material's unrestricted stock (${mrpTimelineData.currentStock} pcs) is below its planned safety stock limit (${mrpTimelineData.safetyStock} pcs), indicating high stockout risk.`
                                        : `Material inventory is operating in the safe zone with unrestricted stock (${mrpTimelineData.currentStock} pcs) exceeding the planned safety threshold (${mrpTimelineData.safetyStock} pcs).`
                                      }
                                    </p>
                                  </div>

                                  <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                                      Material Plant Specifications
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Material Code:</span><span style={{ fontWeight: 600 }}>{selectedItemKey.item}</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Name:</span><span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{mrpTimelineData.materialName}</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Plant:</span><span style={{ fontWeight: 600 }}>{mrpTimelineData.plantName} ({selectedItemKey.line})</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Unrestricted Stock:</span><span style={{ fontWeight: 600, color: mrpTimelineData.currentStock < mrpTimelineData.safetyStock ? '#fb7185' : '#34d399' }}>{mrpTimelineData.currentStock} pcs</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Safety Stock Limit:</span><span style={{ fontWeight: 600 }}>{mrpTimelineData.safetyStock} pcs</span></div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* TAB: MRP TIMELINE */}
                              {detailTab === 'mrp' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600, color: 'var(--color-primary)', marginBottom: '0.25rem' }}>
                                      <span>Material MRP Timeline</span>
                                      <span>Safety stock: {mrpTimelineData.safetyStock} pcs</span>
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.7rem', lineHeight: 1.3 }}>
                                      Chronological view of incoming supply receipts (POITEM) vs outgoing production reservations (RESERVATION).
                                    </p>
                                  </div>

                                  <div className="timeline" style={{ paddingLeft: '0.5rem' }}>
                                    {/* Starting Stock Entry */}
                                    <div className="timeline-node" style={{ paddingBottom: '1.25rem' }}>
                                      <div className="timeline-dot active" style={{ backgroundColor: mrpTimelineData.currentStock < mrpTimelineData.safetyStock ? '#fb7185' : '#34d399' }} />
                                      <span className="timeline-date">Initial On-Hand Stock</span>
                                      <span className="timeline-title">Starting Available Inventory</span>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                                        <span className="timeline-desc" style={{ margin: 0 }}>Unrestricted Stock level in ERP.</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: mrpTimelineData.currentStock < mrpTimelineData.safetyStock ? '#fb7185' : '#34d399' }}>
                                          {mrpTimelineData.currentStock} pcs
                                        </span>
                                      </div>
                                    </div>

                                    {mrpTimelineData.timeline && mrpTimelineData.timeline.length > 0 ? (
                                      mrpTimelineData.timeline.map((el: any, elIdx: number) => {
                                        const isSupply = el.mrp_element_type === 'POITEM';
                                        const isBelowSafety = el.projected_qty < mrpTimelineData.safetyStock;
                                        const isShortage = el.projected_qty < 0;

                                        return (
                                          <div key={el.mrp_element_id || elIdx} className="timeline-node" style={{ paddingBottom: '1.25rem' }}>
                                            <div className={`timeline-dot ${isSupply ? 'active' : ''}`} style={{ 
                                              backgroundColor: isShortage ? '#ef4444' : isBelowSafety ? '#fdba74' : isSupply ? '#3b82f6' : '#a855f7',
                                              borderColor: isShortage ? '#ef4444' : isBelowSafety ? '#fdba74' : isSupply ? '#3b82f6' : '#a855f7'
                                            }} />
                                            <span className="timeline-date">{el.requirement_date}</span>
                                            <span className="timeline-title" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                              {isSupply ? '📥 Incoming Supply (PO Receipt)' : '📤 Outgoing Demand (Reservation)'}
                                              <span style={{ 
                                                fontSize: '0.6rem', 
                                                padding: '0.05rem 0.25rem', 
                                                borderRadius: '0.2rem',
                                                backgroundColor: isSupply ? 'rgba(59, 130, 246, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                                                color: isSupply ? '#60a5fa' : '#c084fc',
                                                fontWeight: 600
                                              }}>
                                                Ref: {el.mrp_element_ref}
                                              </span>
                                            </span>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.25rem' }}>
                                              <span className="timeline-desc" style={{ margin: 0 }}>
                                                {isSupply ? `Received: +${el.receipt_qty} pcs` : `Reserved: -${el.requirement_qty} pcs`}
                                              </span>
                                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isShortage ? '#ef4444' : isBelowSafety ? '#fdba74' : 'var(--text-primary)' }}>
                                                  Bal: {el.projected_qty} pcs
                                                </span>
                                                {isShortage ? (
                                                  <span style={{ fontSize: '0.55rem', color: '#ef4444', fontWeight: 600, marginTop: '0.1rem' }}>🚨 SHORTAGE</span>
                                                ) : isBelowSafety ? (
                                                  <span style={{ fontSize: '0.55rem', color: '#fdba74', fontWeight: 600, marginTop: '0.1rem' }}>⚠️ BELOW SAFETY</span>
                                                ) : null}
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                                        No MRP timeline transactions recorded.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </>
                          )
                        ) : (
                          selectedDetail && (
                            <>
                              {/* TAB 1: KPI OVERVIEW, DELAY TIMELINE & SUPPLIER PERFORMANCE PROFILE */}
                              {detailTab === 'kpi' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                  
                                  {/* Dynamic Delay warning context */}
                                  <div style={{ background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.75rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontWeight: 700 }}>
                                      <span style={{ color: 'var(--severity-critical-text)' }}>⚠️ Delay Diagnosis: {selectedDetail.delay_category}</span>
                                      <span>{selectedDetail.days_overdue} days past due</span>
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                      {selectedDetail.root_cause}
                                    </p>
                                  </div>

                                  {/* ERP Data Integrity Discrepancy Alert */}
                                  {selectedDetail.erp_discrepancy?.has_discrepancy && (
                                    <div style={{
                                      background: 'rgba(124, 58, 237, 0.08)',
                                      border: '1px solid rgba(124, 58, 237, 0.3)',
                                      borderRadius: '0.375rem',
                                      padding: '0.75rem',
                                      fontSize: '0.75rem',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '0.5rem'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700, color: '#c084fc' }}>
                                        <span>⚙️ ERP Data Integrity Alert: Desync Detected</span>
                                      </div>
                                      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.4, margin: 0 }}>
                                        ERP PO Schedule Line lists received: <strong style={{ color: 'var(--text-primary)' }}>{selectedDetail.erp_discrepancy.erp_received_qty}</strong> / open: <strong style={{ color: 'var(--text-primary)' }}>{selectedDetail.erp_discrepancy.erp_open_qty}</strong> pcs.
                                        But ground-truth Goods Receipts audit shows actual received: <strong style={{ color: '#a78bfa' }}>{selectedDetail.erp_discrepancy.actual_received_qty}</strong> / open: <strong style={{ color: '#a78bfa' }}>{selectedDetail.erp_discrepancy.actual_open_qty}</strong> pcs.
                                      </p>
                                      <button
                                        onClick={async () => {
                                          try {
                                            const res = await fetch('/api/control-tower/sync-erp', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                po_number: selectedDetail.po_number,
                                                item_number: selectedDetail.item_number
                                              })
                                            });
                                            if (res.ok) {
                                              setToastMessage('✅ ERP PO Schedule Line successfully synchronized with Goods Receipts!');
                                              // Reload detail view to refresh states
                                              const newDetailRes = await fetch(`/api/po-overdue/detail?po_number=${selectedDetail.po_number}&item_number=${selectedDetail.item_number}&schedule_line=${selectedDetail.schedule_line}`);
                                              if (newDetailRes.ok) {
                                                const newDetailData = await newDetailRes.json();
                                                setSelectedDetail(newDetailData);
                                              }
                                              // Refresh main worklist
                                              loadControlTowerData();
                                            } else {
                                              setToastMessage('❌ Failed to synchronize ERP schedule line.');
                                            }
                                          } catch (err) {
                                            setToastMessage('❌ Error communicating with ERP sync service.');
                                          }
                                        }}
                                        style={{
                                          alignSelf: 'flex-start',
                                          background: 'rgba(124, 58, 237, 0.2)',
                                          border: '1px solid rgba(124, 58, 237, 0.4)',
                                          color: '#c084fc',
                                          borderRadius: '0.25rem',
                                          padding: '0.3rem 0.6rem',
                                          fontSize: '0.68rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          transition: 'background 0.2s, color 0.2s'
                                        }}
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.background = 'rgba(124, 58, 237, 0.35)';
                                          e.currentTarget.style.color = '#fff';
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.background = 'rgba(124, 58, 237, 0.2)';
                                          e.currentTarget.style.color = '#c084fc';
                                        }}
                                      >
                                        ⚡ Sync and Post Correction to ERP
                                      </button>
                                    </div>
                                  )}

                                  {/* Enriched Delivery Node Timeline (Phase 1B Milestone 2 & 3) */}
                                  <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                                      Tracking Delivery Timeline
                                    </h4>
                                    <div className="timeline">
                                      
                                      {/* 1. PO Created */}
                                      <div className="timeline-node">
                                        <div className="timeline-dot active"></div>
                                        <span className="timeline-date">Order Sourced: {selectedDetail.po_date || 'N/A'}</span>
                                        <span className="timeline-title">Purchase Order Sourced</span>
                                        <span className="timeline-desc">PO {selectedItemKey.po} created by {selectedDetail.created_by || 'system'}.</span>
                                      </div>

                                      {/* 2. Ack Committed Date */}
                                      <div className="timeline-node">
                                        <div className={`timeline-dot ${selectedDetail.acknowledgement_details ? 'active' : ''}`}></div>
                                        <span className="timeline-date">
                                          Committed: {selectedDetail.acknowledgement_details?.committed_delivery_date || 'NO COMMIT DATE RECORDED'}
                                         </span>
                                         <span className="timeline-title">Supplier Acknowledgement status</span>
                                         <span className="timeline-desc">
                                           Status is <strong>{selectedDetail.acknowledgement_status}</strong>.
                                           {selectedDetail.acknowledgement_details && ` Committed for ${selectedDetail.acknowledgement_details.acknowledged_qty} pcs.`}
                                           {(() => {
                                             const committed = selectedDetail.acknowledgement_details?.committed_delivery_date;
                                             const requested = selectedDetail.requested_delivery_date;
                                             if (committed && requested && new Date(committed).getTime() > new Date(requested).getTime()) {
                                               const lateDays = Math.round((new Date(committed).getTime() - new Date(requested).getTime()) / (1000 * 60 * 60 * 24));
                                               return <span style={{ display: 'block', color: 'var(--severity-critical-text)', fontWeight: 600, marginTop: '0.2rem' }}>⚠️ Late by {lateDays} days vs Requested Target</span>;
                                             }
                                             return null;
                                           })()}
                                         </span></div>

                                      {/* 3. ASN Ship Date */}
                                      <div className="timeline-node">
                                        <div className={`timeline-dot ${selectedDetail.asn_details.length > 0 ? 'active' : ''}`}></div>
                                        <span className="timeline-date">
                                          Shipped: {selectedDetail.asn_details[0]?.ship_date || 'NO IN TRANSIT DATA'}
                                        </span>
                                        <span className="timeline-title">Advanced Shipping Notice (ASN)</span>
                                        <span className="timeline-desc">
                                          Status is <strong>{selectedDetail.asn_status}</strong>.
                                          {selectedDetail.asn_details.length > 0 && ` Expected delivery: ${selectedDetail.asn_details[0].expected_delivery_date}.`}
                                        </span>
                                      </div>

                                      {/* 4. Requested Due Date */}
                                      <div className="timeline-node">
                                        <div className="timeline-dot critical"></div>
                                        <span className="timeline-date" style={{ color: 'var(--severity-critical-text)' }}>Requested Target: {selectedDetail.requested_delivery_date}</span>
                                        <span className="timeline-title" style={{ color: 'var(--severity-critical-text)' }}>Requested Delivery Target</span>
                                        <span className="timeline-desc">
                                          Target past due by <strong>{selectedDetail.days_overdue} days</strong>.
                                        </span>
                                      </div>

                                      {/* 5. Goods Receipt Posting */}
                                      <div className="timeline-node" style={{ opacity: selectedDetail.latest_goods_receipt_date ? 1 : 0.6 }}>
                                        <div className={`timeline-dot ${selectedDetail.latest_goods_receipt_date ? 'success' : ''}`}></div>
                                        <span className="timeline-date">Posted Date: {selectedDetail.latest_goods_receipt_date || 'PENDING TOTAL RECEIPT'}</span>
                                        <span className="timeline-title">Warehouse Goods Receipt</span>
                                        <span className="timeline-desc">
                                          Received <strong>{selectedDetail.received_quantity} pcs</strong> of {selectedDetail.ordered_quantity} pcs ordered.
                                        </span>
                                      </div>

                                    </div>
                                  </div>

                                  {/* Supplier Partner Performance Profile Sourced */}
                                  <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                                      Supplier Partner Compliance Profile
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Vendor Code:</span><span style={{ fontWeight: 600 }}>{selectedDetail.supplier_id}</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Name:</span><span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px' }}>{selectedDetail.supplier_name}</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Country/Region:</span><span style={{ fontWeight: 600 }}>{selectedDetail.country}</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>On-time Delivery OTD:</span><span style={{ fontWeight: 600, color: selectedDetail.on_time_delivery_pct < 75 ? '#fb7185' : '#34d399' }}>{selectedDetail.on_time_delivery_pct}%</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Avg Response:</span><span style={{ fontWeight: 600 }}>{selectedDetail.avg_response_days} days</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Risk Tier (Score):</span><span style={{ fontWeight: 600, color: selectedDetail.risk_score > 50 ? '#fb7185' : selectedDetail.risk_score > 30 ? '#fdba74' : '#34d399' }}>{selectedDetail.supplier_tier} ({selectedDetail.risk_score})</span></div>
                                    </div>
                                  </div>

                                  {/* Safety Stock & ERP Plant constraints */}
                                  <div>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.25rem' }}>
                                      ERP Sourcing Constraints
                                    </h4>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', fontSize: '0.75rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Plant:</span><span style={{ fontWeight: 600 }}>{selectedDetail.plant_name} ({selectedDetail.plant})</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Storage Location:</span><span style={{ fontWeight: 600 }}>{selectedDetail.storage_location || '0001'}</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Safety Stock Limit:</span><span style={{ fontWeight: 600 }}>{selectedDetail.safety_stock} pcs</span></div>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.25rem 0' }}><span style={{ color: 'var(--text-muted)' }}>Lead Time (Planned):</span><span style={{ fontWeight: 600 }}>{selectedDetail.lead_time_days} days</span></div>
                                    </div>
                                  </div>

                                </div>
                              )}

                              {/* TAB 2: SENTIMENT ANALYSIS FROM RECENT COMMUNICATIONS */}
                              {detailTab === 'log' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  
                                  {/* Sentiment analysis score based on parsed logs */}
                                  {(() => {
                                    const sentimentScore = computeSupplierSentiment(selectedDetail);
                                    const isCaution = sentimentScore === 'CAUTION';
                                    return (
                                      <div style={{ 
                                        background: isCaution ? 'rgba(239, 68, 68, 0.05)' : 'rgba(34, 197, 94, 0.05)', 
                                        border: '1px solid var(--border-color)', 
                                        borderRadius: '0.375rem', 
                                        padding: '0.75rem', 
                                        fontSize: '0.75rem', 
                                        display: 'flex', 
                                        justifyContent: 'space-between', 
                                        alignItems: 'center' 
                                      }}>
                                        <div>
                                          <span style={{ display: 'block', fontWeight: 600 }}>Supplier Portal Sentiment Assessment</span>
                                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Based on recent emails & system portal logs.</span>
                                        </div>
                                        <span style={{ 
                                          padding: '0.2rem 0.5rem', 
                                          borderRadius: '0.25rem', 
                                          background: isCaution ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                          color: isCaution ? '#fca5a5' : '#86efac', 
                                          fontWeight: 700, 
                                          fontSize: '0.65rem', 
                                          textTransform: 'uppercase' 
                                        }}>
                                          {sentimentScore}
                                        </span>
                                      </div>
                                    );
                                  })()}

                                  {/* Log List */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {selectedDetail.communication_logs.length > 0 ? (
                                      selectedDetail.communication_logs.map((log, lIdx) => (
                                        <div key={lIdx} style={{
                                          background: 'rgba(255,255,255,0.01)',
                                          border: '1px solid var(--border-color)',
                                          borderLeft: log.source_system === 'System reminder sent'
                                            ? '3px solid #a855f7'
                                            : log.source_system === 'Supplier response received'
                                            ? '3px solid #f59e0b'
                                            : log.source_system === 'Buyer manually marked contacted'
                                            ? '3px solid #3b82f6'
                                            : log.direction === 'INBOUND'
                                            ? '3px solid #34d399'
                                            : '3px solid #60a5fa',
                                          borderRadius: '0.25rem',
                                          padding: '0.6rem',
                                          fontSize: '0.725rem'
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                            <span>{log.direction} | {log.source_system}</span>
                                            <span>{log.sent_date || log.received_date}</span>
                                          </div>
                                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>{log.subject}</div>
                                          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.3 }}>{log.body}</p>
                                        </div>
                                      ))
                                    ) : (
                                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>
                                        No recent communications logged for this PO Line.
                                      </div>
                                    )}
                                  </div>

                                </div>
                              )}

                              {/* TAB 3: AI ROOT CAUSE DIAGNOSIS (Phase 3B) */}
                              {detailTab === 'root-cause' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                                  {/* Loading State */}
                                  {aiRootCauseLoading && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2.5rem 1rem' }}>
                                      <div style={{ width: '28px', height: '28px', border: '2px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#818cf8', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>AI is analysing exception signals...</span>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', width: '100%', maxWidth: '260px' }}>
                                        {['Reading supplier performance history', 'Evaluating ASN & acknowledgement signals', 'Correlating communication sentiment', 'Generating structured diagnosis'].map((step, i) => (
                                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                            <div style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: '#4f46e5', opacity: 0.7, animation: `pulse 1.5s ease-in-out ${i * 0.2}s infinite` }} />
                                            {step}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Error State */}
                                  {!aiRootCauseLoading && aiRootCause?._error && (
                                    <div style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.75rem', color: '#fca5a5' }}>
                                      <span style={{ fontWeight: 600 }}>⚠️ Diagnosis Unavailable</span>
                                      <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary)', lineHeight: 1.4 }}>{aiRootCause._error}</p>
                                    </div>
                                  )}

                                  {/* Result Panel */}
                                  {!aiRootCauseLoading && aiRootCause && !aiRootCause._error && (
                                    <>
                                      {/* Primary Cause + Confidence */}
                                      <div style={{ background: 'rgba(99, 102, 241, 0.06)', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '0.375rem', padding: '0.85rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.6rem' }}>
                                          <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🤖 AI Primary Root Cause</span>
                                          <span style={{ fontSize: '0.6rem', padding: '0.15rem 0.4rem', borderRadius: '0.2rem', background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                            {aiRootCause.confidence}% Confidence
                                          </span>
                                        </div>
                                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.4, margin: 0 }}>{aiRootCause.primary_cause}</p>

                                        {/* Confidence Gauge */}
                                        <div style={{ marginTop: '0.65rem' }}>
                                          <div style={{ height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                            <div style={{
                                              height: '100%',
                                              width: `${aiRootCause.confidence}%`,
                                              borderRadius: '2px',
                                              background: aiRootCause.confidence >= 75
                                                ? 'linear-gradient(90deg, #4f46e5, #818cf8)'
                                                : aiRootCause.confidence >= 50
                                                ? 'linear-gradient(90deg, #d97706, #fbbf24)'
                                                : 'linear-gradient(90deg, #dc2626, #f87171)',
                                              transition: 'width 0.8s ease'
                                            }} />
                                          </div>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.2rem', fontSize: '0.55rem', color: 'var(--text-muted)' }}>
                                            <span>Low Confidence</span><span>High Confidence</span>
                                          </div>
                                        </div>
                                      </div>

                                      {/* Narrative */}
                                      <div style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.75rem' }}>
                                        <span style={{ display: 'block', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.625rem', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Analytical Narrative</span>
                                        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{aiRootCause.narrative}</p>
                                      </div>

                                      {/* Contributing Factors */}
                                      {aiRootCause.contributing_factors && aiRootCause.contributing_factors.length > 0 && (
                                        <div>
                                          <span style={{ display: 'block', fontWeight: 700, color: 'var(--text-secondary)', fontSize: '0.625rem', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Contributing Factors</span>
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {aiRootCause.contributing_factors.map((factor: string, i: number) => (
                                              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.15)', borderRadius: '0.25rem', padding: '0.4rem 0.5rem', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                                <span style={{ color: '#fbbf24', fontWeight: 700, flexShrink: 0 }}>⚠</span>
                                                {factor}
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}

                                      {/* Recommended Action */}
                                      <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '0.375rem', padding: '0.75rem', fontSize: '0.75rem' }}>
                                        <span style={{ display: 'block', fontWeight: 700, color: '#34d399', fontSize: '0.625rem', textTransform: 'uppercase', marginBottom: '0.4rem' }}>✅ Recommended Strategic Action</span>
                                        <p style={{ color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.5, margin: 0 }}>{aiRootCause.recommended_action}</p>
                                      </div>

                                      {/* Similar Past Exceptions Badge */}
                                      {aiRootCause.similar_past_exceptions > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(244, 63, 94, 0.05)', border: '1px solid rgba(244, 63, 94, 0.2)', borderRadius: '0.25rem', padding: '0.5rem 0.65rem', fontSize: '0.72rem' }}>
                                          <span style={{ fontSize: '1rem' }}>🔁</span>
                                          <span style={{ color: 'var(--text-secondary)' }}>
                                            This supplier has triggered <strong style={{ color: '#fb7185' }}>{aiRootCause.similar_past_exceptions} similar past exceptions</strong>. Consider a supplier review meeting.
                                          </span>
                                        </div>
                                      )}

                                      {/* Re-run button */}
                                      <button
                                        onClick={() => selectedDetail && loadAiRootCause(selectedDetail.exception_id)}
                                        style={{ alignSelf: 'flex-end', background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '0.25rem', padding: '0.3rem 0.75rem', fontSize: '0.65rem', cursor: 'pointer', transition: 'border-color 0.2s, color 0.2s' }}
                                        onMouseEnter={e => { (e.target as HTMLButtonElement).style.borderColor = '#818cf8'; (e.target as HTMLButtonElement).style.color = '#a5b4fc'; }}
                                        onMouseLeave={e => { (e.target as HTMLButtonElement).style.borderColor = ''; (e.target as HTMLButtonElement).style.color = ''; }}
                                      >
                                        ↻ Re-run Diagnosis
                                      </button>
                                    </>
                                  )}

                                </div>
                              )}

                              {/* TAB 4: GUIDED ROADMAP ACTION WORKBENCH (UNLOCKED IN PHASE 2) */}
                              {detailTab === 'action' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                  
                                  {/* App-Owned Action Center */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    
                                    {/* Action Error Warning */}
                                    {actionError && (
                                      <div style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        borderRadius: '0.375rem',
                                        padding: '0.75rem',
                                        color: '#fca5a5',
                                        fontSize: '0.75rem',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.25rem',
                                        position: 'relative'
                                      }}>
                                        <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                                          <span>⚠️ Action Error</span>
                                          <button onClick={() => setActionError(null)} style={{ background: 'transparent', border: 'none', color: '#fca5a5', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
                                        </div>
                                        <p style={{ margin: 0, lineHeight: 1.3 }}>{actionError}</p>
                                      </div>
                                    )}

                                    {/* Textarea for note input */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                                      <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Log Internal Note / Event</label>
                                      <textarea
                                        rows={3}
                                        placeholder="Type internal note details here..."
                                        value={newNoteText}
                                        onChange={(e) => setNewNoteText(e.target.value)}
                                        disabled={isActionSubmitting}
                                        style={{
                                          padding: '0.6rem',
                                          fontSize: '0.75rem',
                                          borderRadius: '0.375rem',
                                          border: '1px solid var(--border-color)',
                                          background: 'var(--bg-surface-elevated)',
                                          color: 'var(--text-primary)',
                                          outline: 'none',
                                          resize: 'none',
                                          fontFamily: 'inherit',
                                          lineHeight: 1.3
                                        }}
                                      />
                                    </div>

                                    {/* Submit actions button bar */}
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                      <button
                                        disabled={isActionSubmitting}
                                        onClick={handleAddNote}
                                        style={{
                                          flex: 1,
                                          background: 'var(--color-primary)',
                                          border: 'none',
                                          borderRadius: '0.375rem',
                                          color: '#ffffff',
                                          padding: '0.5rem',
                                          fontSize: '0.72rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          transition: 'opacity 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                      >
                                        📝 Save Internal Note
                                      </button>
                                      <button
                                        disabled={isActionSubmitting}
                                        onClick={() => handleMarkSupplierContacted(newNoteText || undefined)}
                                        style={{
                                          flex: 1.2,
                                          background: 'transparent',
                                          border: '1px solid rgba(16, 185, 129, 0.4)',
                                          borderRadius: '0.375rem',
                                          color: '#34d399',
                                          padding: '0.5rem',
                                          fontSize: '0.72rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16, 185, 129, 0.08)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                      >
                                        📞 Mark Supplier Contacted
                                      </button>
                                      <button
                                        disabled={isActionSubmitting}
                                        onClick={async () => {
                                          if (!selectedDetail) return;
                                          setIsActionSubmitting(true);
                                          setActionError(null);
                                          try {
                                            const res = await fetch('/api/actions', {
                                              method: 'POST',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({
                                                purchaseOrderNumber: selectedDetail.po_number,
                                                purchaseOrderItem: selectedDetail.item_number,
                                                supplierId: selectedDetail.supplier_id,
                                                supplierName: selectedDetail.supplier_name,
                                                actionType: 'ESCALATION',
                                                sourceModule: activeTab === 'acknowledgement' ? 'SUPPLIER_ACKNOWLEDGEMENTS' : 'OVERDUE_WORKBENCH',
                                                escalationFlag: true,
                                                note: newNoteText.trim() || 'Escalation flagged by buyer.',
                                                createdBy: 'buyer.test',
                                              }),
                                            });
                                            if (res.ok) {
                                              setNewNoteText('');
                                              setToastMessage('🚨 Internal escalation recorded.');
                                              await reloadDetail(selectedDetail.po_number, selectedDetail.item_number, selectedDetail.schedule_line);
                                            } else {
                                              const errData = await res.json();
                                              setActionError(errData.error || 'Could not save internal action. Please try again.');
                                            }
                                          } catch (err) {
                                            setActionError('Could not save internal action. Please try again.');
                                          } finally {
                                            setIsActionSubmitting(false);
                                          }
                                        }}
                                        style={{
                                          flex: 1,
                                          background: 'transparent',
                                          border: '1px solid rgba(245, 158, 11, 0.4)',
                                          borderRadius: '0.375rem',
                                          color: '#fbbf24',
                                          padding: '0.5rem',
                                          fontSize: '0.72rem',
                                          fontWeight: 600,
                                          cursor: 'pointer',
                                          transition: 'background 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(245, 158, 11, 0.08)'}
                                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                      >
                                        🚨 Escalate Internally
                                      </button>
                                    </div>

                                  </div>

                                  {/* Chronological Action Audit History log */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.3rem' }}>
                                      <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Internal Buyer Action History</span>
                                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{selectedDetail.actions?.length || 0} event(s)</span>
                                    </div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '2px' }}>
                                      {(!selectedDetail.actions || selectedDetail.actions.length === 0) ? (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1.5rem' }}>
                                          No actions logged yet. Type a note above or log contact.
                                        </div>
                                      ) : (
                                        selectedDetail.actions.map((act: any) => {
                                          const isCompleted = act.actionStatus === 'COMPLETED';
                                          let badgeColor = 'rgba(156, 163, 175, 0.1)';
                                          let badgeText = '#9ca3af';
                                          if (act.actionType === 'NOTE') {
                                            badgeColor = 'rgba(59, 130, 246, 0.1)';
                                            badgeText = '#60a5fa';
                                          } else if (act.actionType === 'SUPPLIER_CONTACTED') {
                                            badgeColor = 'rgba(16, 185, 129, 0.1)';
                                            badgeText = '#34d399';
                                          } else if (act.actionType === 'ESCALATION') {
                                            badgeColor = 'rgba(239, 68, 68, 0.1)';
                                            badgeText = '#fca5a5';
                                          }

                                          return (
                                            <div key={act.actionId} style={{
                                              background: 'var(--bg-surface-elevated)',
                                              border: '1px solid var(--border-color)',
                                              borderRadius: '0.375rem',
                                              padding: '0.65rem',
                                              display: 'flex',
                                              flexDirection: 'column',
                                              gap: '0.4rem'
                                            }}>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                                  <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    padding: '0.1rem 0.35rem',
                                                    borderRadius: '0.2rem',
                                                    background: badgeColor,
                                                    color: badgeText
                                                  }}>
                                                    {act.actionType}
                                                  </span>
                                                  {act.escalationFlag && (
                                                    <span style={{ fontSize: '0.6rem', fontWeight: 700, padding: '0.1rem 0.35rem', borderRadius: '0.2rem', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24' }}>
                                                      ESCALATED
                                                    </span>
                                                  )}
                                                  <span style={{
                                                    fontSize: '0.6rem',
                                                    fontWeight: 700,
                                                    padding: '0.1rem 0.35rem',
                                                    borderRadius: '0.2rem',
                                                    background: isCompleted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                    color: isCompleted ? '#34d399' : '#fbbf24'
                                                  }}>
                                                    {act.actionStatus}
                                                  </span>
                                                </div>
                                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                  v{act.version}
                                                </span>
                                              </div>

                                              <p style={{ fontSize: '0.72rem', color: 'var(--text-primary)', margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.3 }}>
                                                {act.note}
                                              </p>

                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                                <span>
                                                  By {act.createdBy} • {act.createdAt ? new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                                </span>
                                                
                                                {!isCompleted && (
                                                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                                                    <button
                                                      disabled={isActionSubmitting}
                                                      onClick={() => handleUpdateActionStatus(act.actionId, act.version, 'COMPLETED')}
                                                      style={{
                                                        background: 'rgba(16, 185, 129, 0.1)',
                                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                                        borderRadius: '0.2rem',
                                                        color: '#34d399',
                                                        padding: '0.15rem 0.4rem',
                                                        cursor: 'pointer',
                                                        fontSize: '0.58rem',
                                                        fontWeight: 600
                                                      }}
                                                    >
                                                      Mark Internal Action Complete
                                                    </button>
                                                    {!act.escalationFlag && (
                                                      <button
                                                        disabled={isActionSubmitting}
                                                        onClick={() => handleEscalateAction(act.actionId, act.version)}
                                                        style={{
                                                          background: 'rgba(245, 158, 11, 0.1)',
                                                          border: '1px solid rgba(245, 158, 11, 0.3)',
                                                          borderRadius: '0.2rem',
                                                          color: '#fbbf24',
                                                          padding: '0.15rem 0.4rem',
                                                          cursor: 'pointer',
                                                          fontSize: '0.58rem',
                                                          fontWeight: 600
                                                        }}
                                                      >
                                                        Escalate Internally
                                                      </button>
                                                    )}
                                                    {process.env.NODE_ENV === 'development' && (
                                                      <button
                                                        disabled={isActionSubmitting}
                                                        onClick={() => handleUpdateActionStatus(act.actionId, 999, 'COMPLETED')}
                                                        style={{
                                                          background: 'rgba(239, 68, 68, 0.05)',
                                                          border: '1px solid rgba(239, 68, 68, 0.2)',
                                                          borderRadius: '0.2rem',
                                                          color: '#fca5a5',
                                                          padding: '0.15rem 0.3rem',
                                                          cursor: 'pointer',
                                                          fontSize: '0.55rem'
                                                        }}
                                                        title="Simulates 409 conflict mismatch (Dev-only)"
                                                      >
                                                        ⚡ Dev Mismatch (409)
                                                      </button>
                                                    )}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          );
                                        })
                                      )}
                                    </div>
                                  </div>

                                  {/* AI Guided Recommendation Dispatch Option (Existing Phase 2 feature) */}
                                  {recommendationLoading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100px', gap: '0.5rem' }}>
                                      <div style={{ width: '20px', height: '20px', border: '2px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Retrieving guided actions...</span>
                                    </div>
                                  ) : activeRecommendation ? (
                                    <details style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                                      <summary style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', cursor: 'pointer', outline: 'none', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>🤖 AI Guided Recommendation Dispatch Draft</span>
                                        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>[Click to Expand]</span>
                                      </summary>
                                      
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
                                        
                                        {/* Recommendation Header Card */}
                                        <div style={{
                                          background: 'var(--bg-surface-elevated)',
                                          border: '1px solid var(--border-color)',
                                          borderRadius: '0.5rem',
                                          padding: '0.85rem',
                                          position: 'relative',
                                          overflow: 'hidden'
                                        }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                                              🤖 {activeRecommendation.agent_name?.replace(/_/g, ' ') || 'AGENT'}
                                            </span>
                                            <span style={{ 
                                              fontSize: '0.65rem', 
                                              fontWeight: 700,
                                              padding: '0.15rem 0.4rem',
                                              borderRadius: '0.25rem',
                                              color: activeRecommendation.confidence_score >= 0.8 ? '#34d399' : '#60a5fa',
                                              background: activeRecommendation.confidence_score >= 0.8 ? 'rgba(52, 211, 153, 0.1)' : 'rgba(96, 165, 250, 0.1)',
                                              border: activeRecommendation.confidence_score >= 0.8 ? '1px solid rgba(52, 211, 153, 0.2)' : '1px solid rgba(96, 165, 250, 0.2)'
                                            }}>
                                              {Math.round(activeRecommendation.confidence_score * 100)}% Confidence
                                            </span>
                                          </div>
                                          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                                            Suggested Action:
                                          </div>
                                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.3, margin: 0 }}>
                                            {activeRecommendation.recommended_action}
                                          </p>
                                        </div>

                                        {/* Email Template Formulation Work Area */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                                              Action Dispatch Draft
                                            </span>
                                            <span style={{ 
                                              fontSize: '0.625rem', 
                                              fontWeight: 700, 
                                              padding: '0.1rem 0.35rem', 
                                              borderRadius: '0.2rem',
                                              backgroundColor: activeRecommendation.approval_status === 'SENT' ? 'rgba(37, 99, 235, 0.08)' : activeRecommendation.approval_status === 'APPROVED' ? '#ecfdf5' : '#fffbeb',
                                              color: activeRecommendation.approval_status === 'SENT' ? 'var(--color-primary)' : activeRecommendation.approval_status === 'APPROVED' ? '#059669' : '#d97706',
                                            }}>
                                              Status: {activeRecommendation.approval_status}
                                            </span>
                                          </div>

                                          {/* Subject */}
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>Subject Line</label>
                                            <input 
                                              type="text" 
                                              disabled={activeRecommendation.approval_status === 'SENT'}
                                              value={activeRecommendation.draft_subject}
                                              onChange={(e) => setActiveRecommendation({ ...activeRecommendation, draft_subject: e.target.value })}
                                              style={{
                                                padding: '0.5rem',
                                                fontSize: '0.75rem',
                                                borderRadius: '0.375rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-surface-elevated)',
                                                color: 'var(--text-primary)',
                                                outline: 'none',
                                                width: '100%'
                                              }}
                                            />
                                          </div>

                                          {/* Body */}
                                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                            <label style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>Email message text</label>
                                            <textarea 
                                              rows={6}
                                              disabled={activeRecommendation.approval_status === 'SENT'}
                                              value={activeRecommendation.draft_message}
                                              onChange={(e) => setActiveRecommendation({ ...activeRecommendation, draft_message: e.target.value })}
                                              style={{
                                                padding: '0.5rem',
                                                fontSize: '0.75rem',
                                                borderRadius: '0.375rem',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--bg-surface-elevated)',
                                                color: 'var(--text-primary)',
                                                outline: 'none',
                                                width: '100%',
                                                resize: 'vertical',
                                                fontFamily: 'inherit',
                                                lineHeight: 1.3
                                              }}
                                            />
                                          </div>

                                          {/* Simulation Confirmation Toast inside the Card */}
                                          {activeRecommendation.approval_status === 'SENT' && (
                                            <div style={{
                                              background: 'rgba(16, 185, 129, 0.05)',
                                              border: '1px solid rgba(16, 185, 129, 0.2)',
                                              borderRadius: '0.375rem',
                                              padding: '0.7rem',
                                              display: 'flex',
                                              alignItems: 'flex-start',
                                              gap: '0.5rem',
                                              fontSize: '0.7rem',
                                              color: '#34d399',
                                              lineHeight: 1.3
                                            }}>
                                              <span style={{ fontWeight: 'bold' }}>✓</span>
                                              <span><strong>Expedite request successfully dispatched!</strong> Expediting email sent to supplier and logged in portal.</span>
                                            </div>
                                          )}

                                          {/* Action buttons */}
                                          {activeRecommendation.approval_status !== 'SENT' && (
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                              <button
                                                disabled={recommendationSaving}
                                                onClick={() => handleActionRecommendation('SENT')}
                                                style={{
                                                  flex: 2,
                                                  background: 'var(--color-primary)',
                                                  border: 'none',
                                                  borderRadius: '0.375rem',
                                                  color: '#ffffff',
                                                  padding: '0.6rem',
                                                  fontSize: '0.75rem',
                                                  fontWeight: 600,
                                                  cursor: 'pointer',
                                                  boxShadow: '0 2px 4px rgba(79, 70, 229, 0.2)',
                                                  transition: 'opacity 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                                                onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                                              >
                                                {recommendationSaving ? 'Sending...' : 'Approve & Send Request'}
                                              </button>
                                              
                                              <button
                                                disabled={recommendationSaving}
                                                onClick={() => handleActionRecommendation('APPROVED')}
                                                style={{
                                                  flex: 1,
                                                  background: 'transparent',
                                                  border: '1px solid var(--border-color)',
                                                  borderRadius: '0.375rem',
                                                  color: 'var(--text-primary)',
                                                  padding: '0.6rem',
                                                  fontSize: '0.75rem',
                                                  fontWeight: 500,
                                                  cursor: 'pointer',
                                                  transition: 'background 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                              >
                                                Save Draft
                                              </button>

                                              <button
                                                disabled={recommendationSaving}
                                                onClick={() => handleActionRecommendation('REJECTED')}
                                                style={{
                                                  background: 'transparent',
                                                  border: '1px solid rgba(244, 63, 94, 0.3)',
                                                  borderRadius: '0.375rem',
                                                  color: '#fb7185',
                                                  padding: '0.6rem',
                                                  fontSize: '0.75rem',
                                                  fontWeight: 500,
                                                  cursor: 'pointer',
                                                  transition: 'background 0.2s'
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(244, 63, 94, 0.05)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                              >
                                                Reject
                                              </button>
                                            </div>
                                          )}

                                        </div>
                                      </div>
                                    </details>
                                  ) : (
                                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.75rem' }}>
                                      No action recommendation found for this item.
                                    </div>
                                  )}

                                </div>
                              )}

                            </>
                          )
                        )}

                      </div>
                    </div>
                  )}
                </div>

          {/* TAB 3: SUPPLIER ACKNOWLEDGEMENT WORKBENCH (PHASE 1C) */}
          {activeTab === 'acknowledgement' && (
            <div id="acknowledgement-section" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
              
              {/* Acknowledgement Header */}
              <div className="animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '2.125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    Supplier Acknowledgements Workbench
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Monitor price and quantity discrepancies, late delivery promises, and missing confirmations.
                  </p>
                </div>
              </div>

              {/* TOP FIXED GLOBAL METRICS CARDS */}
              <section className="animate-fade" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
              }}>
                {[
                  { title: 'Total PO Lines', value: ackSummary?.totalLines ?? '-', desc: 'Global released lines' },
                  { title: 'Acknowledged Lines', value: ackSummary?.acknowledgedCount ?? '-', desc: 'Confirmed by suppliers', highlight: true },
                  { title: 'Acknowledgement Rate', value: ackSummary?.completionRate !== undefined ? `${ackSummary.completionRate}%` : '-', desc: 'Operational success rate', highlight: true },
                  { title: 'Total Disputed Value', value: ackSummary?.disputedSpend ? formatUSD(ackSummary.disputedSpend) : '-', desc: 'Active supplier exposure', alert: (ackSummary?.disputedSpend ?? 0) > 0 },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-surface)',
                    border: card.alert 
                      ? '1px solid rgba(244, 63, 94, 0.4)' 
                      : card.highlight 
                        ? '1px solid rgba(79, 70, 229, 0.4)' 
                        : '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {card.title}
                    </span>
                    <span style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 700, 
                      color: card.alert ? 'var(--severity-critical-text)' : card.highlight ? 'var(--color-primary)' : 'var(--text-primary)', 
                      margin: '0.35rem 0'
                    }}>
                      {card.value}
                    </span>
                    <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>
                      {card.desc}
                    </span>
                  </div>
                ))}
              </section>

              {/* INTERACTIVE DISPUTE SHORTCUTS */}
              <section className="animate-fade" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem',
              }}>
                {[
                  { label: 'Price Disputes', count: ackSummary?.priceDisputes ?? 0, type: 'PRICE_DISPUTE', color: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' },
                  { label: 'Quantity Disputes', count: ackSummary?.qtyDisputes ?? 0, type: 'QTY_DISPUTE', color: 'rgba(249, 115, 22, 0.15)', text: '#fdba74', border: '1px solid rgba(249, 115, 22, 0.3)' },
                  { label: 'Promised Late', count: ackSummary?.latePromiseDisputes ?? 0, type: 'PROMISED_LATE', color: 'rgba(234, 179, 8, 0.15)', text: '#fef08a', border: '1px solid rgba(234, 179, 8, 0.3)' },
                  { label: 'Rejections', count: ackSummary?.rejections ?? 0, type: 'REJECTED', color: 'rgba(244, 63, 94, 0.15)', text: '#fb7185', border: '1px solid rgba(244, 63, 94, 0.3)' },
                  { label: 'Missing Confirmations', count: ackSummary?.missingCount ?? 0, type: 'MISSING', color: 'rgba(156, 163, 175, 0.12)', text: '#9ca3af', border: '1px solid rgba(156, 163, 175, 0.25)' },
                ].map((shortcut, i) => {
                  const isActive = ackStatusFilter === shortcut.type;
                  return (
                    <div 
                      key={i} 
                      onClick={() => setAckStatusFilter(isActive ? '' : shortcut.type)}
                      style={{
                        background: isActive ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                        border: isActive ? '2px solid var(--color-primary)' : shortcut.border,
                        borderRadius: '0.5rem',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: 'var(--shadow-sm)',
                        transform: isActive ? 'translateY(-2px)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <span style={{ fontSize: '0.6875rem', color: shortcut.text, fontWeight: 600 }}>
                        {shortcut.label}
                      </span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                        {shortcut.count}
                      </span>
                      <span style={{ fontSize: '0.575rem', color: 'var(--text-muted)' }}>
                        {isActive ? '🔍 Active Filter' : 'Click to filter list'}
                      </span>
                    </div>
                  );
                })}
              </section>

              {/* FILTER BAR PANEL */}
              <section className="animate-fade" style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  
                  {/* Search */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search PO / Material</label>
                    <input 
                      type="text" 
                      placeholder="Ex. 4500000001, M500..." 
                      value={ackSearchQuery}
                      onChange={(e) => setAckSearchQuery(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Plant Site */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Plant Site</label>
                    <select 
                      value={ackPlantFilter}
                      onChange={(e) => setAckPlantFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Plants</option>
                      {plantList.map(p => (
                        <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Supplier Vendor */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Supplier Vendor</label>
                    <select 
                      value={ackSupplierFilter}
                      onChange={(e) => setAckSupplierFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Suppliers</option>
                      {supplierList.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Acknowledgement Status */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ack Status</label>
                    <select 
                      value={ackStatusFilter}
                      onChange={(e) => setAckStatusFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Statuses</option>
                      <option value="ACKNOWLEDGED">Acknowledged</option>
                      <option value="MISSING">Missing Confirmation</option>
                      <option value="PRICE_DISPUTE">Price Dispute</option>
                      <option value="QTY_DISPUTE">Quantity Dispute</option>
                      <option value="PROMISED_LATE">Promised Late</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="DISPUTES">All Disputes</option>
                    </select>
                  </div>

                  {/* Sort Sequence */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Sort Sequence</label>
                    <select 
                      value={ackSort}
                      onChange={(e) => setAckSort(e.target.value as any)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="default">Ack Status / Delay (High-Low)</option>
                      <option value="priority">Priority Score (High-Low)</option>
                    </select>
                  </div>

                  {/* Reset Button */}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button 
                      onClick={() => {
                        setAckPlantFilter('');
                        setAckSupplierFilter('');
                        setAckStatusFilter('');
                        setAckSearchQuery('');
                        setAckSort('default');
                      }}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '0.375rem',
                        padding: '0.45rem 1rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                    >
                      Clear Filters
                    </button>
                  </div>

                </div>
              </section>

              {/* VARIABLE FILTERED RESULTS CARDS */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px dashed rgba(79, 70, 229, 0.25)',
                borderRadius: '0.5rem',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                animation: 'fadeIn 0.35s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🔍 Filtered Worklist Queue (Active View Metrics)
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Updates reactively based on your search & filters
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                  {[
                    { title: 'Filtered Queue Lines', value: ackFilteredMetrics?.totalLines ? ackFilteredMetrics.totalLines.toLocaleString() : '0', desc: 'Total matching lines', color: 'var(--text-primary)' },
                    { title: 'Filtered Queue Spend', value: ackFilteredMetrics?.totalValue ? formatUSD(ackFilteredMetrics.totalValue) : '$0', desc: 'Active financial value', color: 'var(--color-primary)' },
                    { title: 'Filtered Open Quantity', value: ackFilteredMetrics?.totalQty ? ackFilteredMetrics.totalQty.toLocaleString() : '0', desc: 'Ordered parts count', color: 'var(--text-primary)' },
                    { title: 'Filtered Critical Lines', value: ackFilteredMetrics?.criticalLines ? ackFilteredMetrics.criticalLines.toLocaleString() : '0', desc: 'Critical severity level matches', color: 'var(--severity-critical-text)' },
                    { title: 'Filtered Avg Days Late', value: `${ackFilteredMetrics?.averageDays ?? 0} days`, desc: 'Average delay of matches', color: 'var(--text-primary)' },
                  ].map((card, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', padding: '0.6rem 0.75rem' }}>
                      <span style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 600 }}>{card.title}</span>
                      <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: card.color, margin: '0.15rem 0' }}>{card.value}</span>
                      <span style={{ display: 'block', fontSize: '0.575rem', color: 'var(--text-muted)' }}>{card.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TABLE AREA */}
              <div style={{ display: 'flex', flex: 1, gap: '1.25rem', overflow: 'visible', width: '100%' }}>
                
                <div style={{ 
                  flex: 1, 
                  background: 'var(--bg-surface)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '0.5rem',
                  overflow: 'visible',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-md)'
                }}>
                  
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Active Acknowledgement Worklist (<span data-testid="ack-total-count-badge">{ackWorklistTotal}</span>)
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>Show</span>
                        <select
                          value={ackLimit}
                          onChange={(e) => setAckLimit(e.target.value)}
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.25rem',
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="15">15</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                        <span>entries</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Click on any row to open the Procurement Context Drawer.
                    </span>
                  </div>

                  {ackLoading && (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
                      <div style={{ width: '30px', height: '30px', border: '3px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Querying supplier acknowledgement queues...</span>
                    </div>
                  )}

                  {!ackLoading && ackWorklist.length === 0 && (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '4rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>✅</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Actions Required</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active filters returned zero records.</span>
                    </div>
                  )}

                  {!ackLoading && ackWorklist.length > 0 && (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                          <tr>
                            <th style={{ padding: '0.75rem 0.5rem', width: '100px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, paddingLeft: '1rem' }}>Sev</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '90px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Priority</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '85px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>PO Number</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '50px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Item</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '130px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Supplier Vendor</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '130px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Material Part</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '120px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Ack Status</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '50px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Site</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '130px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Confirmed vs Req Date</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '120px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Confirmed vs Order Qty</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '85px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Open Value</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '70px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', paddingRight: '1rem' }}>Followups</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ackWorklist.map((item, idx) => {
                            const isSelected = selectedItemKey?.po === item.po_number && selectedItemKey?.item === item.item_number;
                            
                            // Color mapping for acknowledgement status
                            let statusColor = '#9ca3af'; // Missing / grey
                            let statusBg = 'rgba(156, 163, 175, 0.15)';
                            let statusBorder = '1px solid rgba(156, 163, 175, 0.25)';

                            if (item.acknowledgement_status === 'ACKNOWLEDGED') {
                              statusColor = '#10b981'; // green
                              statusBg = '#ecfdf5';
                              statusBorder = '1px solid rgba(16, 185, 129, 0.25)';
                            } else if (['PRICE_DISPUTE', 'REJECTED'].includes(item.acknowledgement_status)) {
                              statusColor = '#ef4444'; // red
                              statusBg = '#fef2f2';
                              statusBorder = '1px solid rgba(239, 68, 68, 0.25)';
                            } else if (['QTY_DISPUTE', 'PROMISED_LATE', 'PARTIAL'].includes(item.acknowledgement_status)) {
                              statusColor = '#d97706'; // orange
                              statusBg = '#fffbeb';
                              statusBorder = '1px solid rgba(217, 119, 6, 0.25)';
                            }

                            return (
                              <tr 
                                key={`${item.po_number}_${item.item_number}_${idx}`}
                                data-testid={`ack-row-${item.po_number}-${item.item_number}`}
                                onClick={() => setSelectedItemKey({ po: item.po_number, item: item.item_number, line: '0001' })}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  cursor: 'pointer',
                                  background: isSelected ? 'rgba(79, 70, 229, 0.12)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                  transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
                                }}
                              >
                                {/* Severity */}
                                <td style={{ padding: '0.65rem 0.5rem', paddingLeft: '1rem' }}>
                                  <span className={`badge-${item.severity.toLowerCase()}`} style={{
                                    padding: '0.15rem 0.35rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    width: '100%'
                                  }}>
                                    {item.severity}
                                  </span>
                                </td>
                                {/* Priority Badge */}
                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                  <span style={{
                                    padding: '0.15rem 0.35rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    width: '100%',
                                    color: item.priorityLevel === 'CRITICAL' ? '#dc2626' : item.priorityLevel === 'HIGH' ? '#d97706' : item.priorityLevel === 'MEDIUM' ? '#2563eb' : '#0d9488',
                                    background: item.priorityLevel === 'CRITICAL' ? 'rgba(239, 68, 68, 0.1)' : item.priorityLevel === 'HIGH' ? 'rgba(245, 158, 11, 0.1)' : item.priorityLevel === 'MEDIUM' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(13, 148, 136, 0.1)',
                                    border: item.priorityLevel === 'CRITICAL' ? '1px solid rgba(239, 68, 68, 0.2)' : item.priorityLevel === 'HIGH' ? '1px solid rgba(245, 158, 11, 0.2)' : item.priorityLevel === 'MEDIUM' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid rgba(13, 148, 136, 0.2)'
                                  }}>
                                    {item.priorityLevel || 'LOW'}
                                  </span>
                                </td>
                                {/* PO Number */}
                                <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>{item.po_number}</td>
                                {/* Item Number */}
                                <td style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>{item.item_number}</td>
                                {/* Supplier Name */}
                                <td style={{ padding: '0.65rem 0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-secondary)' }} title={item.supplier_name}>
                                  {item.supplier_name}
                                </td>
                                {/* Material Part */}
                                <td style={{ padding: '0.65rem 0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.material_id}</span>
                                  <span style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.material_description}
                                  </span>
                                </td>
                                {/* Ack Status */}
                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                  <span style={{ 
                                    padding: '0.15rem 0.35rem', 
                                    borderRadius: '0.25rem', 
                                    fontSize: '0.625rem', 
                                    fontWeight: 700, 
                                    backgroundColor: statusBg, 
                                    color: statusColor, 
                                    border: statusBorder,
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    width: '100%'
                                  }}>
                                    {item.acknowledgement_status}
                                  </span>
                                </td>
                                {/* Site */}
                                <td style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>{item.plant}</td>
                                {/* Confirmed vs Req Date */}
                                <td style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>
                                  {item.committed_delivery_date ? (
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <span style={{ fontWeight: 600, color: item.acknowledgement_status === 'PROMISED_LATE' ? '#fdba74' : 'var(--text-primary)' }}>
                                        📅 {item.committed_delivery_date}
                                      </span>
                                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                                        Req: {item.days_overdue > 0 ? `${item.days_overdue}d overdue` : 'On time'}
                                      </span>
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No Supplier Promise</span>
                                  )}
                                </td>
                                {/* Confirmed vs Order Qty */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 500 }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                    <span style={{ fontWeight: 600, color: item.acknowledgement_status === 'QTY_DISPUTE' ? '#fdba74' : 'var(--text-primary)' }}>
                                      {item.acknowledged_qty} / {item.ordered_quantity} pcs
                                    </span>
                                    <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                                      {item.ordered_quantity - item.acknowledged_qty > 0 ? `${item.ordered_quantity - item.acknowledged_qty} short` : 'Complete'}
                                    </span>
                                  </div>
                                </td>
                                {/* Open Value */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>{formatUSD(item.open_value)}</td>
                                {/* Followups */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', paddingRight: '1rem', fontWeight: 700, color: item.buyer_followup_count > 3 ? '#fb7185' : 'var(--text-primary)' }}>
                                  {item.buyer_followup_count}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* PAGINATION */}
                  {!ackLoading && ackWorklist.length > 0 && (
                    <div style={{
                      padding: '1rem',
                      borderTop: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.725rem',
                      background: 'rgba(255, 255, 255, 0.005)'
                    }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        Showing <strong>{((ackPage - 1) * parseInt(ackLimit)) + 1}</strong> to <strong>{Math.min(ackPage * parseInt(ackLimit), ackWorklistTotal)}</strong> of <strong>{ackWorklistTotal.toLocaleString()}</strong> entries
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {/* Prev Button */}
                        <button
                          disabled={ackPage === 1}
                          onClick={() => setAckPage(p => Math.max(1, p - 1))}
                          style={{
                            background: ackPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            color: ackPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: ackPage === 1 ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Previous
                        </button>

                        {/* Page Numbers */}
                        {(() => {
                          const totalPages = Math.ceil(ackWorklistTotal / parseInt(ackLimit)) || 1;
                          const startPage = Math.max(1, ackPage - 2);
                          const endPage = Math.min(totalPages, startPage + 4);
                          const adjustedStart = Math.max(1, endPage - 4);
                          
                          const buttons = [];
                          for (let i = adjustedStart; i <= endPage; i++) {
                            buttons.push(i);
                          }
                          
                          return buttons.map(num => (
                            <button
                              key={num}
                              onClick={() => setAckPage(num)}
                              style={{
                                background: ackPage === num ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                                border: ackPage === num ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                color: ackPage === num ? '#ffffff' : 'var(--text-primary)',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontWeight: ackPage === num ? 700 : 500,
                                transition: 'all 0.15s'
                              }}
                            >
                              {num}
                            </button>
                          ));
                        })()}

                        {/* Next Button */}
                        <button
                          disabled={(() => {
                            const totalPages = Math.ceil(ackWorklistTotal / parseInt(ackLimit)) || 1;
                            return ackPage === totalPages;
                          })()}
                          onClick={() => {
                            const totalPages = Math.ceil(ackWorklistTotal / parseInt(ackLimit)) || 1;
                            setAckPage(p => Math.min(totalPages, p + 1));
                          }}
                          style={{
                            background: (() => {
                              const totalPages = Math.ceil(ackWorklistTotal / parseInt(ackLimit)) || 1;
                              return ackPage === totalPages ? 'transparent' : 'var(--bg-surface-elevated)';
                            })(),
                            border: '1px solid var(--border-color)',
                            color: (() => {
                              const totalPages = Math.ceil(ackWorklistTotal / parseInt(ackLimit)) || 1;
                              return ackPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)';
                            })(),
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: (() => {
                              const totalPages = Math.ceil(ackWorklistTotal / parseInt(ackLimit)) || 1;
                              return ackPage === totalPages ? 'not-allowed' : 'pointer';
                            })(),
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* TAB 3.5: RECOMMENDATION WORKLIST (PHASE 8F) */}
          {activeTab === 'recommendations' && (
            <div id="recommendations-section">
              <RecommendationWorklist />
            </div>
          )}

          {/* TAB 4: PART AVAILABILITY WORKBENCH (PHASE 1D) */}
          {activeTab === 'part' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%' }}>
              
              {/* Part Availability Header */}
              <div className="animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h1 style={{ fontSize: '2.125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    Part Availability Workbench
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Monitor inventory positions, safety stock violations, and clear-to-build shortages.
                  </p>
                </div>
              </div>

              {/* TOP FIXED GLOBAL METRICS CARDS */}
              <section className="animate-fade" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
              }}>
                {[
                  { title: 'Monitored Parts', value: partSummary?.totalParts ?? '-', desc: 'Global active parts' },
                  { title: 'Parts with Shortages', value: partSummary?.shortageCount ?? '-', desc: 'Availability < 100% (RED)', alert: (partSummary?.shortageCount ?? 0) > 0 },
                  { title: 'Safety Stock Violations', value: partSummary?.safetyStockViolations ?? '-', desc: 'Stock < Safety Stock', alert: (partSummary?.safetyStockViolations ?? 0) > 0 },
                  { title: 'Average Material Availability', value: partSummary?.averageCtb !== undefined ? `${partSummary.averageCtb}%` : '-', desc: 'Platform feasibility rate', highlight: true },
                ].map((card, i) => (
                  <div key={i} style={{
                    background: 'var(--bg-surface)',
                    border: card.alert 
                      ? '1px solid rgba(244, 63, 94, 0.4)' 
                      : card.highlight 
                        ? '1px solid rgba(79, 70, 229, 0.4)' 
                        : '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {card.title}
                    </span>
                    <span style={{ 
                      fontSize: '1.5rem', 
                      fontWeight: 700, 
                      color: card.alert ? 'var(--severity-critical-text)' : card.highlight ? 'var(--color-primary)' : 'var(--text-primary)', 
                      margin: '0.35rem 0'
                    }}>
                      {card.value}
                    </span>
                    <span style={{ fontSize: '0.675rem', color: 'var(--text-muted)' }}>
                      {card.desc}
                    </span>
                  </div>
                ))}
              </section>

              {/* INTERACTIVE SHORTAGE SHORTCUTS */}
              <section className="animate-fade" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '0.75rem',
              }}>
                {[
                  { label: 'Critical Shortages', count: partSummary?.shortageCount ?? 0, risk: 'RED', horizon: '', color: 'rgba(239, 68, 68, 0.15)', text: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.3)' },
                  { label: 'At Risk (Yellow)', count: (partSummary?.totalParts ?? 0) - (partSummary?.shortageCount ?? 0), risk: 'YELLOW', horizon: '', color: 'rgba(234, 179, 8, 0.15)', text: '#fef08a', border: '1px solid rgba(234, 179, 8, 0.3)' },
                  { label: '7-Day Horizon Risks', count: 52, risk: '', horizon: '7', color: 'rgba(249, 115, 22, 0.15)', text: '#fdba74', border: '1px solid rgba(249, 115, 22, 0.3)' },
                  { label: '30-Day Horizon Risks', count: 288, risk: '', horizon: '30', color: 'rgba(168, 85, 247, 0.15)', text: '#c084fc', border: '1px solid rgba(168, 85, 247, 0.3)' },
                ].map((shortcut, i) => {
                  const isActive = shortcut.risk ? partRiskFilter === shortcut.risk : partHorizonFilter === shortcut.horizon;
                  return (
                    <div 
                      key={i} 
                      onClick={() => {
                        if (shortcut.risk) {
                          setPartRiskFilter(isActive ? '' : shortcut.risk);
                          setPartHorizonFilter('');
                        } else {
                          setPartHorizonFilter(isActive ? '' : shortcut.horizon);
                          setPartRiskFilter('');
                        }
                      }}
                      style={{
                        background: isActive ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                        border: isActive ? '2px solid var(--color-primary)' : shortcut.border,
                        borderRadius: '0.5rem',
                        padding: '0.75rem',
                        display: 'flex',
                        flexDirection: 'column',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        boxShadow: 'var(--shadow-sm)',
                        transform: isActive ? 'translateY(-2px)' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) e.currentTarget.style.transform = 'translateY(-2px)';
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) e.currentTarget.style.transform = 'none';
                      }}
                    >
                      <span style={{ fontSize: '0.6875rem', color: shortcut.text, fontWeight: 600 }}>
                        {shortcut.label}
                      </span>
                      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0.2rem 0' }}>
                        {shortcut.count} parts
                      </span>
                      <span style={{ fontSize: '0.575rem', color: 'var(--text-muted)' }}>
                        {isActive ? '🔍 Active Filter' : 'Click to filter list'}
                      </span>
                    </div>
                  );
                })}
              </section>

              {/* FILTER BAR PANEL */}
              <section className="animate-fade" style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: '0.5rem',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem' }}>
                  
                  {/* Search */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search Material Part</label>
                    <input 
                      type="text" 
                      placeholder="Ex. M500061, Sensor..." 
                      value={partSearchQuery}
                      onChange={(e) => setPartSearchQuery(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Plant Site */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Plant Site</label>
                    <select 
                      value={partPlantFilter}
                      onChange={(e) => setPartPlantFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Plants</option>
                      {plantList.map(p => (
                        <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Risk Bucket */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Risk Bucket</label>
                    <select 
                      value={partRiskFilter}
                      onChange={(e) => setPartRiskFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Risks</option>
                      <option value="RED">RED (Shortage)</option>
                      <option value="YELLOW">YELLOW (At Risk)</option>
                    </select>
                  </div>

                  {/* Shortage Horizon */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <label style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Shortage Horizon</label>
                    <select 
                      value={partHorizonFilter}
                      onChange={(e) => setPartHorizonFilter(e.target.value)}
                      style={{
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.75rem',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">All Horizons</option>
                      <option value="7">7 Days</option>
                      <option value="14">14 Days</option>
                      <option value="30">30 Days</option>
                      <option value="60">60 Days</option>
                    </select>
                  </div>

                  {/* Reset Button */}
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button 
                      onClick={() => {
                        setPartPlantFilter('');
                        setPartRiskFilter('');
                        setPartHorizonFilter('');
                        setPartSearchQuery('');
                      }}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '0.375rem',
                        padding: '0.45rem 1rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        textAlign: 'center',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                    >
                      Clear Filters
                    </button>
                  </div>

                </div>
              </section>

              {/* VARIABLE FILTERED RESULTS CARDS */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.01)',
                border: '1px dashed rgba(79, 70, 229, 0.25)',
                borderRadius: '0.5rem',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                animation: 'fadeIn 0.35s ease'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    🔍 Filtered Worklist Queue (Active View Metrics)
                  </span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                    Updates reactively based on your search & filters
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem' }}>
                  {[
                    { title: 'Filtered Parts Count', value: partFilteredMetrics?.totalLines ? partFilteredMetrics.totalLines.toLocaleString() : '0', desc: 'Total matching parts', color: 'var(--text-primary)' },
                    { title: 'Filtered Total Demand', value: partFilteredMetrics?.totalValue ? partFilteredMetrics.totalValue.toLocaleString() : '0', desc: 'Active demand pieces', color: 'var(--color-primary)' },
                    { title: 'Filtered Open PO Qty', value: partFilteredMetrics?.totalQty ? partFilteredMetrics.totalQty.toLocaleString() : '0', desc: 'Incoming supply pieces', color: 'var(--text-primary)' },
                    { title: 'Filtered Shortage Parts', value: partFilteredMetrics?.criticalLines ? partFilteredMetrics.criticalLines.toLocaleString() : '0', desc: 'Parts facing immediate shortage', color: 'var(--severity-critical-text)' },
                    { title: 'Filtered Avg Availability %', value: `${partFilteredMetrics?.averageDays ?? 0}%`, desc: 'Average feasibility of matches', color: 'var(--text-primary)' },
                  ].map((card, idx) => (
                    <div key={idx} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', padding: '0.6rem 0.75rem' }}>
                      <span style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)', fontWeight: 600 }}>{card.title}</span>
                      <span style={{ display: 'block', fontSize: '1.125rem', fontWeight: 700, color: card.color, margin: '0.15rem 0' }}>{card.value}</span>
                      <span style={{ display: 'block', fontSize: '0.575rem', color: 'var(--text-muted)' }}>{card.desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* TABLE AREA */}
              <div style={{ display: 'flex', flex: 1, gap: '1.25rem', overflow: 'visible', width: '100%' }}>
                
                <div style={{ 
                  flex: 1, 
                  background: 'var(--bg-surface)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '0.5rem',
                  overflow: 'visible',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-md)'
                }}>
                  
                  <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <h2 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                        Active Part Availability Exceptions ({partWorklistTotal})
                      </h2>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        <span>Show</span>
                        <select
                          value={partLimit}
                          onChange={(e) => setPartLimit(e.target.value)}
                          style={{
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.25rem',
                            padding: '0.15rem 0.4rem',
                            fontSize: '0.75rem',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="15">15</option>
                          <option value="25">25</option>
                          <option value="50">50</option>
                          <option value="100">100</option>
                        </select>
                        <span>entries</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Click on any row to open the MRP Timeline Drawer.
                    </span>
                  </div>

                  {partLoading && (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '3rem' }}>
                      <div style={{ width: '30px', height: '30px', border: '3px solid rgba(79, 70, 229, 0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Analyzing availability snapshots and shortage levels...</span>
                    </div>
                  )}

                  {!partLoading && partWorklist.length === 0 && (
                    <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', padding: '4rem' }}>
                      <span style={{ fontSize: '1.5rem' }}>✅</span>
                      <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>No Shortages Detected</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Active filters returned zero shortage exceptions.</span>
                    </div>
                  )}

                  {!partLoading && partWorklist.length > 0 && (
                    <div style={{ width: '100%', overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', tableLayout: 'fixed' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                          <tr>
                            <th style={{ padding: '0.75rem 0.5rem', width: '80px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, paddingLeft: '1rem' }}>Risk</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '220px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Material Part</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '60px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Plant</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '100px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Current Stock</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '90px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Safety Stock</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '100px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Total Demand</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '90px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Open PO Qty</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '95px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right' }}>Shortage Qty</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '110px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center' }}>Material Availability</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '80px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, paddingRight: '1rem', textAlign: 'center' }}>Horizon</th>
                          </tr>
                        </thead>
                        <tbody>
                          {partWorklist.map((item, idx) => {
                            const isSelected = selectedItemKey?.po === 'PART' && selectedItemKey?.item === item.material_id && selectedItemKey?.line === item.plant;
                            
                            let riskColor = '#2dd4bf'; // Low risk
                            let riskBg = 'rgba(20, 184, 166, 0.15)';
                            let riskBorder = '1px solid rgba(20, 184, 166, 0.25)';

                            if (item.risk_bucket === 'RED') {
                              riskColor = '#fb7185'; // Red critical shortage
                              riskBg = 'rgba(244, 63, 94, 0.15)';
                              riskBorder = '1px solid rgba(244, 63, 94, 0.25)';
                            } else if (item.risk_bucket === 'YELLOW') {
                              riskColor = '#fef08a'; // Yellow at risk
                              riskBg = 'rgba(234, 179, 8, 0.12)';
                              riskBorder = '1px solid rgba(234, 179, 8, 0.25)';
                            }

                            return (
                              <tr 
                                key={`${item.material_id}_${item.plant}_${idx}`}
                                onClick={() => {
                                  setSelectedItemKey({ po: 'PART', item: item.material_id, line: item.plant });
                                  loadMrpTimeline(item.material_id, item.plant);
                                }}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  cursor: 'pointer',
                                  background: isSelected ? 'rgba(79, 70, 229, 0.12)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                  transition: 'background 0.15s ease',
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
                                }}
                              >
                                {/* Risk Bucket */}
                                <td style={{ padding: '0.65rem 0.5rem', paddingLeft: '1rem' }}>
                                  <span style={{ 
                                    padding: '0.15rem 0.35rem', 
                                    borderRadius: '0.25rem', 
                                    fontSize: '0.625rem', 
                                    fontWeight: 700, 
                                    backgroundColor: riskBg, 
                                    color: riskColor, 
                                    border: riskBorder,
                                    display: 'inline-block',
                                    textAlign: 'center',
                                    width: '100%'
                                  }}>
                                    {item.risk_bucket}
                                  </span>
                                </td>
                                {/* Material Part */}
                                <td style={{ padding: '0.65rem 0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.material_id}</span>
                                  <span style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {item.material_name}
                                  </span>
                                </td>
                                {/* Plant */}
                                <td style={{ padding: '0.65rem 0.5rem', color: 'var(--text-secondary)' }}>{item.plant}</td>
                                
                                {/* Current Stock */}
                                <td style={{ 
                                  padding: '0.65rem 0.5rem', 
                                  textAlign: 'right', 
                                  fontWeight: 600, 
                                  color: item.safety_stock_violation ? 'var(--severity-critical-text)' : 'var(--text-primary)' 
                                }}>
                                  {item.unrestricted_stock} pcs
                                  {item.safety_stock_violation && (
                                    <span style={{ display: 'block', fontSize: '0.55rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                      Below Safety!
                                    </span>
                                  )}
                                </td>
                                
                                {/* Safety Stock */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: 'var(--text-secondary)' }}>
                                  {item.safety_stock} pcs
                                </td>
                                {/* Total Demand */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: 'var(--text-primary)' }}>
                                  {item.demand_qty} pcs
                                </td>
                                {/* Open PO Qty */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', color: '#60a5fa', fontWeight: 500 }}>
                                  {item.open_po_qty} pcs
                                </td>
                                {/* Shortage Qty */}
                                <td style={{ 
                                  padding: '0.65rem 0.5rem', 
                                  textAlign: 'right', 
                                  fontWeight: 700, 
                                  color: item.shortage_qty > 0 ? 'var(--severity-critical-text)' : 'var(--text-primary)' 
                                }}>
                                  {item.shortage_qty} pcs
                                </td>
                                
                                {/* Material Availability % */}
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem' }}>
                                    <span style={{ fontWeight: 700, color: item.ctb_pct < 100 ? 'var(--severity-critical-text)' : '#4ade80' }}>
                                      {item.ctb_pct}%
                                    </span>
                                    <div style={{ width: '60px', height: '4px', background: 'var(--bg-surface-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                                      <div style={{ 
                                        width: `${item.ctb_pct}%`, 
                                        height: '100%', 
                                        background: item.ctb_pct < 100 ? 'var(--severity-critical-text)' : '#4ade80',
                                        borderRadius: '2px'
                                      }} />
                                    </div>
                                  </div>
                                </td>
                                
                                {/* Horizon */}
                                <td style={{ padding: '0.65rem 0.5rem', paddingRight: '1rem', textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)' }}>
                                  {item.time_horizon_days} days
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* PAGINATION */}
                  {!partLoading && partWorklist.length > 0 && (
                    <div style={{
                      padding: '1rem',
                      borderTop: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.725rem',
                      background: 'rgba(255, 255, 255, 0.005)'
                    }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        Showing <strong>{((partPage - 1) * parseInt(partLimit)) + 1}</strong> to <strong>{Math.min(partPage * parseInt(partLimit), partWorklistTotal)}</strong> of <strong>{partWorklistTotal.toLocaleString()}</strong> entries
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {/* Prev Button */}
                        <button
                          disabled={partPage === 1}
                          onClick={() => setPartPage(p => Math.max(1, p - 1))}
                          style={{
                            background: partPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            color: partPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: partPage === 1 ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Previous
                        </button>

                        {/* Page Numbers */}
                        {(() => {
                          const totalPages = Math.ceil(partWorklistTotal / parseInt(partLimit)) || 1;
                          const startPage = Math.max(1, partPage - 2);
                          const endPage = Math.min(totalPages, startPage + 4);
                          const adjustedStart = Math.max(1, endPage - 4);
                          
                          const buttons = [];
                          for (let i = adjustedStart; i <= endPage; i++) {
                            buttons.push(i);
                          }
                          
                          return buttons.map(num => (
                            <button
                              key={num}
                              onClick={() => setPartPage(num)}
                              style={{
                                background: partPage === num ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                                border: partPage === num ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                color: partPage === num ? '#ffffff' : 'var(--text-primary)',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontWeight: partPage === num ? 700 : 500,
                                transition: 'all 0.15s'
                              }}
                            >
                              {num}
                            </button>
                          ));
                        })()}

                        {/* Next Button */}
                        <button
                          disabled={(() => {
                            const totalPages = Math.ceil(partWorklistTotal / parseInt(partLimit)) || 1;
                            return partPage === totalPages;
                          })()}
                          onClick={() => {
                            const totalPages = Math.ceil(partWorklistTotal / parseInt(partLimit)) || 1;
                            setPartPage(p => Math.min(totalPages, p + 1));
                          }}
                          style={{
                            background: (() => {
                              const totalPages = Math.ceil(partWorklistTotal / parseInt(partLimit)) || 1;
                              return partPage === totalPages ? 'transparent' : 'var(--bg-surface-elevated)';
                            })(),
                            border: '1px solid var(--border-color)',
                            color: (() => {
                              const totalPages = Math.ceil(partWorklistTotal / parseInt(partLimit)) || 1;
                              return partPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)';
                            })(),
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: (() => {
                              const totalPages = Math.ceil(partWorklistTotal / parseInt(partLimit)) || 1;
                              return partPage === totalPages ? 'not-allowed' : 'pointer';
                            })(),
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* TAB 5: SUPPLIER PERFORMANCE ANALYTICS (PHASE 2C) */}
          {activeTab === 'supplier-analytics' && (
            <div style={{ display: 'flex', gap: '1.25rem', width: '100%', height: '100%', position: 'relative' }}>

              {/* LEFT: Directory Panel */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', minWidth: 0 }}>

                {/* Page Header */}
                <div className="animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <h1 style={{ fontSize: '2.125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                      Supplier Performance Analytics
                    </h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                      360° supplier scorecards — OTD, PPM quality, risk exposure, and open commitment spend.
                    </p>
                  </div>
                  <button
                    onClick={loadSupplierAnalytics}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                  >
                    🔄 Refresh Analytics
                  </button>
                </div>

                {/* Global KPI Cards */}
                <section className="animate-fade" style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                  gap: '0.75rem'
                }}>
                  {[
                    {
                      label: 'Monitored Partners',
                      value: supplierAnalyticsList.length,
                      desc: 'Active suppliers on file',
                      icon: '🏭',
                      color: 'var(--color-primary)'
                    },
                    {
                      label: 'Avg OTD %',
                      value: supplierAnalyticsList.length > 0
                        ? `${Math.round(supplierAnalyticsList.reduce((s, x) => s + x.on_time_delivery_pct, 0) / supplierAnalyticsList.length)}%`
                        : '-',
                      desc: 'On-time delivery average',
                      icon: '📦',
                      color: '#34d399'
                    },
                    {
                      label: 'Supplier Master Quality PPM (Mock)',
                      value: supplierAnalyticsList.length > 0
                        ? Math.round(supplierAnalyticsList.reduce((s, x) => s + x.quality_ppm, 0) / supplierAnalyticsList.length).toLocaleString()
                        : '-',
                      desc: 'Mock Supplier-Master Quality Indicator (ppm)',
                      icon: '🔬',
                      color: '#fb923c'
                    },
                    {
                      label: 'High-Risk Partners',
                      value: supplierAnalyticsList.filter(x => x.risk_score >= 50).length,
                      desc: 'Risk score ≥ 50 (action req.)',
                      icon: '⚠️',
                      color: '#f43f5e',
                      alert: supplierAnalyticsList.filter(x => x.risk_score >= 50).length > 0
                    },
                    {
                      label: 'Blocked Suppliers',
                      value: supplierAnalyticsList.filter(x => x.blocked_flag === 'Y').length,
                      desc: 'Sourcing blocked flag active',
                      icon: '🚫',
                      color: '#f43f5e',
                      alert: supplierAnalyticsList.filter(x => x.blocked_flag === 'Y').length > 0
                    },
                    {
                      label: 'Total Open Spend',
                      value: formatUSD(supplierAnalyticsList.reduce((s, x) => s + x.open_spend, 0)),
                      desc: 'Committed open PO value',
                      icon: '💰',
                      color: 'var(--color-primary)',
                      highlight: true
                    },
                  ].map((card, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-surface)',
                      border: card.alert ? '1px solid rgba(244, 63, 94, 0.4)' : card.highlight ? '1px solid rgba(79, 70, 229, 0.4)' : '1px solid var(--border-color)',
                      borderRadius: '0.5rem',
                      padding: '1rem 1.1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.15rem',
                      transition: 'transform 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</span>
                        <span style={{ fontSize: '1.1rem' }}>{card.icon}</span>
                      </div>
                      <span style={{ fontSize: '1.5rem', fontWeight: 700, color: card.alert ? '#f43f5e' : card.color }}>{card.value}</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{card.desc}</span>
                    </div>
                  ))}
                </section>

                {/* Filter Bar */}
                <section className="animate-fade" style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1rem'
                }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(3, auto) auto auto', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="text"
                      placeholder="🔍 Search by supplier name, ID, or country…"
                      value={saSearch}
                      onChange={(e) => setSaSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadSupplierAnalytics()}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.8rem'
                      }}
                    />
                    <select
                      value={saTierFilter}
                      onChange={(e) => setSaTierFilter(e.target.value)}
                      style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      <option value="">All Tiers</option>
                      <option value="STRATEGIC">Strategic</option>
                      <option value="PREFERRED">Preferred</option>
                    </select>
                    <select
                      value={saRiskFilter}
                      onChange={(e) => setSaRiskFilter(e.target.value)}
                      style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      <option value="">All Risk Levels</option>
                      <option value="CRITICAL">Critical (≥75)</option>
                      <option value="HIGH">High (50–74)</option>
                      <option value="MEDIUM">Medium (25–49)</option>
                      <option value="LOW">Low (&lt;25)</option>
                    </select>
                    <select
                      value={saBlockedFilter}
                      onChange={(e) => setSaBlockedFilter(e.target.value)}
                      style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      <option value="">All Statuses</option>
                      <option value="Y">Blocked Only</option>
                      <option value="N">Active Only</option>
                    </select>
                    <select
                      value={saSortBy}
                      onChange={(e) => setSaSortBy(e.target.value)}
                      style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', fontSize: '0.8rem' }}
                    >
                      <option value="risk">Sort: Risk Score ↓</option>
                      <option value="otd">Sort: OTD % ↓</option>
                      <option value="spend">Sort: Open Spend ↓</option>
                      <option value="ppm">Sort: Quality PPM ↓</option>
                      <option value="name">Sort: Name A→Z</option>
                    </select>
                    <button
                      onClick={loadSupplierAnalytics}
                      style={{
                        background: 'var(--color-primary)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: '0.375rem',
                        padding: '0.5rem 0.9rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Apply
                    </button>
                  </div>
                </section>

                {/* Supplier Directory Table */}
                <div className="animate-fade" style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  flex: 1
                }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                          {['Supplier', 'Tier', 'Country', 'OTD %', 'Quality PPM', 'Risk Score', 'Avg Resp.', 'Open Spend', 'Exceptions', 'Blocked', ''].map(h => (
                            <th key={h} style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {supplierAnalyticsLoading && (
                          <tr>
                            <td colSpan={11} style={{ padding: '3rem', textAlign: 'center' }}>
                              <div style={{ display: 'inline-block', width: '24px', height: '24px', border: '2px solid rgba(79,70,229,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                              <p style={{ color: 'var(--text-muted)', marginTop: '0.75rem' }}>Loading supplier analytics…</p>
                            </td>
                          </tr>
                        )}
                        {!supplierAnalyticsLoading && supplierAnalyticsList.length === 0 && (
                          <tr>
                            <td colSpan={11} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>No suppliers match the current filters.</td>
                          </tr>
                        )}
                        {!supplierAnalyticsLoading && supplierAnalyticsList.slice((supplierPage - 1) * SUPPLIER_PAGE_SIZE, supplierPage * SUPPLIER_PAGE_SIZE).map((sup) => (
                          <tr
                            key={sup.supplier_id}
                            onClick={() => loadSupplierDetail(sup.supplier_id)}
                            style={{
                              borderBottom: "1px solid var(--border-color)",
                              cursor: "pointer",
                              background: selectedSupplierDetail?.supplier_id === sup.supplier_id ? "rgba(79,70,229,0.06)" : "transparent",
                              transition: "background 0.15s"
                            }}
                            onMouseEnter={(e) => { if (selectedSupplierDetail?.supplier_id !== sup.supplier_id) e.currentTarget.style.background = "rgba(255,255,255,0.02)"; }}
                            onMouseLeave={(e) => { if (selectedSupplierDetail?.supplier_id !== sup.supplier_id) e.currentTarget.style.background = "transparent"; }}
                          >
                            <td style={{ padding: "0.65rem 0.75rem" }}>
                              <div style={{ fontWeight: 700, color: "var(--text-primary)", fontSize: "0.78rem" }}>{sup.supplier_name}</div>
                              <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>{sup.supplier_id}</div>
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem" }}>
                              <span style={{ padding: "0.15rem 0.45rem", borderRadius: "0.25rem", fontSize: "0.65rem", fontWeight: 600, background: (sup.supplier_tier === "STRATEGIC" ? "var(--color-primary)" : sup.supplier_tier === "PREFERRED" ? "#38bdf8" : "#94a3b8") + "1a", color: sup.supplier_tier === "STRATEGIC" ? "var(--color-primary)" : sup.supplier_tier === "PREFERRED" ? "#38bdf8" : "#94a3b8" }}>{sup.supplier_tier}</span>
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem", color: "var(--text-secondary)" }}>{sup.country}</td>
                            <td style={{ padding: "0.65rem 0.75rem" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                                <div style={{ flex: 1, height: "5px", background: "var(--bg-surface-elevated)", borderRadius: "3px", overflow: "hidden", minWidth: "40px" }}>
                                  <div style={{ width: `${sup.on_time_delivery_pct}%`, height: "100%", background: sup.on_time_delivery_pct >= 90 ? "#22c55e" : sup.on_time_delivery_pct >= 75 ? "#eab308" : "#f43f5e", borderRadius: "3px" }} />
                                </div>
                                <span style={{ fontWeight: 700, color: sup.on_time_delivery_pct >= 90 ? "#22c55e" : sup.on_time_delivery_pct >= 75 ? "#eab308" : "#f43f5e", fontSize: "0.75rem", minWidth: "35px" }}>{sup.on_time_delivery_pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem", fontWeight: 600, color: sup.quality_ppm > 1000 ? "#f43f5e" : sup.quality_ppm > 500 ? "#fb923c" : "#22c55e" }}>{sup.quality_ppm.toLocaleString()}</td>
                            <td style={{ padding: "0.65rem 0.75rem" }}>
                              <span style={{ padding: "0.2rem 0.5rem", borderRadius: "0.3rem", fontSize: "0.7rem", fontWeight: 700, background: sup.risk_score >= 75 ? "rgba(244,63,94,0.1)" : sup.risk_score >= 50 ? "rgba(249,115,22,0.1)" : sup.risk_score >= 25 ? "rgba(234,179,8,0.1)" : "rgba(34,197,94,0.1)", color: sup.risk_score >= 75 ? "#f43f5e" : sup.risk_score >= 50 ? "#fb923c" : sup.risk_score >= 25 ? "#eab308" : "#22c55e" }}>{sup.risk_score}</span>
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem", color: "var(--text-secondary)" }}>{sup.avg_response_days.toFixed(1)}d</td>
                            <td style={{ padding: "0.65rem 0.75rem", fontWeight: 600, color: "var(--color-primary)" }}>{formatUSD(sup.open_spend)}</td>
                            <td style={{ padding: "0.65rem 0.75rem", textAlign: "center" }}>
                              {sup.active_exceptions_count > 0 ? (<span style={{ padding: "0.15rem 0.45rem", borderRadius: "0.25rem", fontSize: "0.65rem", fontWeight: 700, background: "rgba(244,63,94,0.12)", color: "#f43f5e" }}>{sup.active_exceptions_count}</span>) : (<span style={{ color: "var(--text-muted)", fontSize: "0.65rem" }}>?</span>)}
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem", textAlign: "center" }}>
                              {sup.blocked_flag === "Y" ? (<span style={{ padding: "0.15rem 0.45rem", borderRadius: "0.25rem", fontSize: "0.65rem", fontWeight: 700, background: "rgba(244,63,94,0.12)", color: "#f43f5e" }}>BLOCKED</span>) : (<span style={{ padding: "0.15rem 0.45rem", borderRadius: "0.25rem", fontSize: "0.65rem", fontWeight: 700, background: "rgba(34,197,94,0.1)", color: "#22c55e" }}>ACTIVE</span>)}
                            </td>
                            <td style={{ padding: "0.65rem 0.75rem", color: "var(--color-primary)", fontWeight: 700 }}>&gt;</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!supplierAnalyticsLoading && supplierAnalyticsList.length > 0 && (() => {
                    const totalSupplierPages = Math.max(1, Math.ceil(supplierAnalyticsList.length / SUPPLIER_PAGE_SIZE));
                    return (
                      <div style={{ padding: '0.65rem 0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                          Showing {((supplierPage - 1) * SUPPLIER_PAGE_SIZE) + 1}–{Math.min(supplierPage * SUPPLIER_PAGE_SIZE, supplierAnalyticsList.length)} of <strong style={{ color: 'var(--text-primary)' }}>{supplierAnalyticsList.length}</strong> suppliers
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <button onClick={() => setSupplierPage(p => Math.max(1, p - 1))} disabled={supplierPage === 1} style={{ padding: '0.25rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: supplierPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)', color: supplierPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: supplierPage === 1 ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>‹ Prev</button>
                          {Array.from({ length: totalSupplierPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalSupplierPages || Math.abs(p - supplierPage) <= 1).map((p, idx, arr) => (
                            <>
                              {idx > 0 && arr[idx - 1] !== p - 1 && <span key={`e${p}`} style={{ color: 'var(--text-muted)' }}>…</span>}
                              <button key={p} onClick={() => setSupplierPage(p)} style={{ padding: '0.25rem 0.5rem', borderRadius: '0.25rem', border: '1px solid', borderColor: supplierPage === p ? 'var(--color-primary)' : 'var(--border-color)', background: supplierPage === p ? 'rgba(79,70,229,0.15)' : 'var(--bg-surface-elevated)', color: supplierPage === p ? 'var(--color-primary)' : 'var(--text-secondary)', fontWeight: supplierPage === p ? 700 : 400, cursor: 'pointer', fontSize: '0.7rem', minWidth: '1.8rem' }}>{p}</button>
                            </>
                          ))}
                          <button onClick={() => setSupplierPage(p => Math.min(totalSupplierPages, p + 1))} disabled={supplierPage === totalSupplierPages} style={{ padding: '0.25rem 0.6rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: supplierPage === totalSupplierPages ? 'transparent' : 'var(--bg-surface-elevated)', color: supplierPage === totalSupplierPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: supplierPage === totalSupplierPages ? 'default' : 'pointer', fontSize: '0.7rem', fontWeight: 600 }}>Next ›</button>
                        </div>
                        <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Page {supplierPage} of {totalSupplierPages} · Click row to open scorecard →</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* RIGHT: Supplier Detail Scorecard Drawer */}
              {selectedSupplierDetail && (
                <div className="animate-fade" style={{
                  width: '400px',
                  flexShrink: 0,
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  maxHeight: 'calc(100vh - 2rem)',
                  position: 'sticky',
                  top: '1rem'
                }}>
                  {/* Drawer Header */}
                  <div style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-elevated)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Supplier Scorecard</div>
                      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{selectedSupplierDetail.supplier_name}</h2>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                        {selectedSupplierDetail.supplier_id} · {selectedSupplierDetail.country}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedSupplierDetail(null)}
                      style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}
                    >✕</button>
                  </div>

                  {supplierDetailLoading ? (
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '3rem' }}>
                      <div style={{ width: '24px', height: '24px', border: '2px solid rgba(79,70,229,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : (
                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0 }}>

                      {/* AI Supplier Intelligence (Phase 3C) */}
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)', background: 'rgba(79, 70, 229, 0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>🤖 AI Intelligence</span>
                          {aiSupplierIntel && !aiSupplierIntelLoading && !aiSupplierIntel._error && (
                            <button
                              onClick={() => loadSupplierIntelligence(selectedSupplierDetail.supplier_id)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--color-primary)',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: 0,
                                textDecoration: 'underline'
                              }}
                            >
                              Refresh
                            </button>
                          )}
                        </div>

                        {aiSupplierIntelLoading && (
                          <div style={{
                            padding: '1.25rem',
                            background: 'var(--bg-surface-elevated)',
                            borderRadius: '0.5rem',
                            border: '1px dashed var(--border-color)',
                            textAlign: 'center',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            <div style={{ width: '16px', height: '16px', border: '2px solid rgba(79,70,229,0.2)', borderTopColor: 'var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }} className="animate-pulse">
                              Analyzing supplier profile...
                            </span>
                          </div>
                        )}

                        {!aiSupplierIntelLoading && aiSupplierIntel?._error && (
                          <div style={{
                            padding: '1rem',
                            background: 'rgba(244,63,94,0.05)',
                            borderRadius: '0.5rem',
                            border: '1px solid rgba(244,63,94,0.2)',
                            fontSize: '0.7rem',
                            color: '#f43f5e'
                          }}>
                            <p style={{ margin: 0, fontWeight: 600 }}>Analysis Failed</p>
                            <p style={{ margin: '0.2rem 0 0.5rem 0', color: 'var(--text-secondary)' }}>{aiSupplierIntel._error}</p>
                            <button
                              onClick={() => loadSupplierIntelligence(selectedSupplierDetail.supplier_id)}
                              style={{
                                background: 'var(--color-primary)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '0.25rem',
                                padding: '0.3rem 0.6rem',
                                fontSize: '0.65rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                              }}
                            >
                              Retry
                            </button>
                          </div>
                        )}

                        {!aiSupplierIntelLoading && !aiSupplierIntel && (
                          <div style={{
                            padding: '1.25rem',
                            background: 'var(--bg-surface-elevated)',
                            borderRadius: '0.5rem',
                            border: '1px solid var(--border-color)',
                            textAlign: 'center'
                          }}>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                              Generate a strategic, AI-powered summary of this supplier's operational health and risk posture.
                            </p>
                            <button
                              onClick={() => loadSupplierIntelligence(selectedSupplierDetail.supplier_id)}
                              style={{
                                marginTop: '0.75rem',
                                width: '100%',
                                background: 'linear-gradient(135deg, var(--color-primary) 0%, #6366f1 100%)',
                                color: '#ffffff',
                                border: 'none',
                                borderRadius: '0.375rem',
                                padding: '0.5rem 1rem',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 2px 4px rgba(79,70,229,0.15)'
                              }}
                            >
                              ✨ Generate AI Assessment
                            </button>
                          </div>
                        )}

                        {!aiSupplierIntelLoading && aiSupplierIntel && !aiSupplierIntel._error && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {/* Health Badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 500 }}>Relationship Health:</span>
                              {(() => {
                                const health = aiSupplierIntel.relationship_health;
                                const isStrong = health === 'Strong';
                                const isStable = health === 'Stable';
                                const isAtRisk = health === 'At Risk';
                                const color = isStrong ? '#22c55e' : isStable ? '#3b82f6' : isAtRisk ? '#fb923c' : '#f43f5e';
                                const bg = isStrong ? 'rgba(34,197,94,0.08)' : isStable ? 'rgba(59,130,246,0.08)' : isAtRisk ? 'rgba(249,115,22,0.08)' : 'rgba(244,63,94,0.08)';
                                return (
                                  <span style={{
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    color,
                                    background: bg,
                                    border: `1px solid ${color}33`,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.02em'
                                  }}>
                                    {health}
                                  </span>
                                );
                              })()}
                            </div>

                            {/* Summary narrative */}
                            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.45 }}>
                              {aiSupplierIntel.summary}
                            </p>

                            {/* Watch Items */}
                            {aiSupplierIntel.watch_items && aiSupplierIntel.watch_items.length > 0 && (
                              <div>
                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Watch Items</div>
                                <ul style={{ margin: 0, paddingLeft: '1rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                                  {aiSupplierIntel.watch_items.map((item: string, idx: number) => (
                                    <li key={idx} style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                                      {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Recommended Action */}
                            <div style={{
                              padding: '0.6rem 0.75rem',
                              background: 'var(--bg-surface-elevated)',
                              borderLeft: '3px solid var(--color-primary)',
                              borderRadius: '0.25rem'
                            }}>
                              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '0.15rem' }}>Recommended Action</div>
                              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-primary)', fontWeight: 500, lineHeight: 1.35 }}>
                                {aiSupplierIntel.recommended_action}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Registration & Terms Panel */}
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.6rem' }}>Registration Details</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                          {[
                            { label: 'Sourcing Tier', value: selectedSupplierDetail.supplier_tier },
                            { label: 'Payment Terms', value: selectedSupplierDetail.payment_terms },
                            { label: 'Incoterms', value: selectedSupplierDetail.incoterms },
                            { label: 'Active POs', value: selectedSupplierDetail.active_pos?.length ?? 0 },
                            { label: 'Open Spend', value: formatUSD(selectedSupplierDetail.open_spend) },
                            { label: 'Blocked Flag', value: selectedSupplierDetail.blocked_flag === 'Y' ? '🚫 YES' : '✓ NO' },
                          ].map((field) => (
                            <div key={field.label}>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>{field.label}</div>
                              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.1rem' }}>{field.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dual Gauge: Quality Score vs Risk Score */}
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.75rem' }}>Performance Gauges</div>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          {/* OTD Gauge */}
                          {(() => {
                            const pct = selectedSupplierDetail.on_time_delivery_pct;
                            const color = pct >= 90 ? '#22c55e' : pct >= 75 ? '#eab308' : '#f43f5e';
                            const label = pct >= 90 ? 'Excellent' : pct >= 75 ? 'Acceptable' : 'At Risk';
                            const r = 38; const circ = 2 * Math.PI * r;
                            return (
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                <svg width="90" height="90" viewBox="0 0 90 90">
                                  <circle cx="45" cy="45" r={r} fill="none" stroke="var(--bg-surface-elevated)" strokeWidth="8" />
                                  <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="8"
                                    strokeDasharray={circ}
                                    strokeDashoffset={circ - (pct / 100) * circ}
                                    strokeLinecap="round"
                                    transform="rotate(-90 45 45)"
                                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                                  />
                                  <text x="45" y="41" textAnchor="middle" fill={color} fontSize="12" fontWeight="700">{pct.toFixed(0)}%</text>
                                  <text x="45" y="55" textAnchor="middle" fill="#6b7280" fontSize="7.5">OTD</text>
                                </svg>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color }}>{label}</span>
                              </div>
                            );
                          })()}

                          {/* Risk Gauge */}
                          {(() => {
                            const score = selectedSupplierDetail.risk_score;
                            const color = score >= 75 ? '#f43f5e' : score >= 50 ? '#fb923c' : score >= 25 ? '#eab308' : '#22c55e';
                            const label = score >= 75 ? 'Critical' : score >= 50 ? 'High' : score >= 25 ? 'Medium' : 'Low';
                            const r = 38; const circ = 2 * Math.PI * r;
                            return (
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                <svg width="90" height="90" viewBox="0 0 90 90">
                                  <circle cx="45" cy="45" r={r} fill="none" stroke="var(--bg-surface-elevated)" strokeWidth="8" />
                                  <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="8"
                                    strokeDasharray={circ}
                                    strokeDashoffset={circ - (score / 100) * circ}
                                    strokeLinecap="round"
                                    transform="rotate(-90 45 45)"
                                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                                  />
                                  <text x="45" y="41" textAnchor="middle" fill={color} fontSize="12" fontWeight="700">{score}</text>
                                  <text x="45" y="55" textAnchor="middle" fill="#6b7280" fontSize="7.5">RISK</text>
                                </svg>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color }}>{label} Risk</span>
                              </div>
                            );
                          })()}

                          {/* PPM Gauge */}
                          {(() => {
                            const ppm = selectedSupplierDetail.quality_ppm;
                            const maxPpm = 2000;
                            const pct = Math.min(100, (ppm / maxPpm) * 100);
                            const color = ppm <= 300 ? '#22c55e' : ppm <= 800 ? '#eab308' : '#f43f5e';
                            const label = ppm <= 300 ? 'Excellent' : ppm <= 800 ? 'Moderate' : 'Poor';
                            const r = 38; const circ = 2 * Math.PI * r;
                            return (
                              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                                <svg width="90" height="90" viewBox="0 0 90 90">
                                  <circle cx="45" cy="45" r={r} fill="none" stroke="var(--bg-surface-elevated)" strokeWidth="8" />
                                  <circle cx="45" cy="45" r={r} fill="none" stroke={color} strokeWidth="8"
                                    strokeDasharray={circ}
                                    strokeDashoffset={circ - (pct / 100) * circ}
                                    strokeLinecap="round"
                                    transform="rotate(-90 45 45)"
                                    style={{ transition: 'stroke-dashoffset 1s ease' }}
                                  />
                                  <text x="45" y="41" textAnchor="middle" fill={color} fontSize="9.5" fontWeight="700">{ppm.toLocaleString()}</text>
                                  <text x="45" y="55" textAnchor="middle" fill="#6b7280" fontSize="7.5">PPM</text>
                                </svg>
                                <span style={{ fontSize: '0.65rem', fontWeight: 600, color }}>{label} Quality</span>
                              </div>
                            );
                          })()}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.6rem', padding: '0.4rem', borderTop: '1px dashed var(--border-color)', width: '100%', fontStyle: 'italic', lineHeight: 1.25 }}>
                          * Quality PPM = Defective Parts Per Million units received. Sourced as a mock supplier-master quality indicator from suppliers database since quality inspection logs are empty.
                        </div>

                        {/* Response Time */}
                        <div style={{ marginTop: '0.75rem', background: 'var(--bg-surface-elevated)', borderRadius: '0.35rem', padding: '0.6rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>⚡ Avg Response Time</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: selectedSupplierDetail.avg_response_days > 5 ? '#f43f5e' : '#22c55e' }}>
                            {selectedSupplierDetail.avg_response_days.toFixed(1)} days
                          </span>
                        </div>
                      </div>

                      {/* Active Exceptions Log */}
                      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border-color)' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
                          Active Exceptions ({selectedSupplierDetail.active_exceptions?.length ?? 0})
                        </div>
                        {(!selectedSupplierDetail.active_exceptions || selectedSupplierDetail.active_exceptions.length === 0) ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                            ✓ No active exceptions for this supplier.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto' }}>
                            {selectedSupplierDetail.active_exceptions.map((ex: any) => {
                              const exColor = ex.severity === 'CRITICAL' ? '#f43f5e' : ex.severity === 'HIGH' ? '#fb923c' : ex.severity === 'MEDIUM' ? '#eab308' : '#22c55e';
                              const exBg = ex.severity === 'CRITICAL' ? 'rgba(244,63,94,0.07)' : ex.severity === 'HIGH' ? 'rgba(249,115,22,0.07)' : ex.severity === 'MEDIUM' ? 'rgba(234,179,8,0.07)' : 'rgba(34,197,94,0.07)';
                              return (
                                <div key={ex.exception_id} style={{ background: exBg, border: `1px solid ${exColor}33`, borderRadius: '0.35rem', padding: '0.6rem 0.75rem' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{ex.po_number} · Item {ex.item_number}</span>
                                    <span style={{ padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontSize: '0.6rem', fontWeight: 700, background: exBg, color: exColor }}>{ex.severity}</span>
                                  </div>
                                  <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{ex.exception_type.replace(/_/g, ' ')} · {ex.material_description}</div>
                                  <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.25rem', fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                    <span>Plant: {ex.plant}</span>
                                    <span>Due: {ex.due_date}</span>
                                    {ex.days_overdue > 0 && <span style={{ color: exColor }}>+{ex.days_overdue}d overdue</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Active POs Summary */}
                      <div style={{ padding: '1rem 1.25rem' }}>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', marginBottom: '0.6rem' }}>
                          Active Purchase Orders ({selectedSupplierDetail.active_pos?.length ?? 0})
                        </div>
                        {(!selectedSupplierDetail.active_pos || selectedSupplierDetail.active_pos.length === 0) ? (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>No active POs on record.</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                            {selectedSupplierDetail.active_pos.slice(0, 10).map((po: any) => (
                              <div key={po.po_number} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0.6rem', background: 'var(--bg-surface-elevated)', borderRadius: '0.3rem', fontSize: '0.7rem' }}>
                                <div>
                                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{po.po_number}</span>
                                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{po.po_date}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.62rem' }}>{po.purchasing_group}</span>
                                  <span style={{ padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontSize: '0.6rem', fontWeight: 600, background: 'rgba(59,130,246,0.1)', color: '#60a5fa' }}>
                                    {po.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                            {selectedSupplierDetail.active_pos.length > 10 && (
                              <div style={{ textAlign: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0.25rem' }}>
                                +{selectedSupplierDetail.active_pos.length - 10} more POs not shown
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              )}

            </div>
          )}

          {/* TAB 6: EXCEPTION ANALYTICS DASHBOARD (PHASE 2D) */}
          {activeTab === 'exception-analytics' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>

              {/* Page Header */}
              <div className="animate-fade" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <h1 style={{ fontSize: '2.125rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
                    Exception Analytics Dashboard
                  </h1>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '1rem' }}>
                    Cross-workbench intelligence across all {exAnalytics?.totalExceptions?.toLocaleString() ?? '…'} procurement exceptions — by type, buyer, plant, aging, and weekly trend.
                  </p>
                </div>
                <button
                  onClick={loadExceptionAnalytics}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-primary)',
                    borderRadius: '0.375rem',
                    padding: '0.5rem 1rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--border-color)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface-elevated)'}
                >
                  🔄 Refresh Analytics
                </button>
              </div>

              {exAnalyticsLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ width: '32px', height: '32px', border: '3px solid rgba(251,146,60,0.2)', borderTopColor: '#fb923c', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Computing exception analytics across all workbenches…</span>
                </div>
              ) : !exAnalytics ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', flexDirection: 'column', gap: '1rem' }}>
                  <span style={{ fontSize: '2.5rem' }}>📅</span>
                  <p style={{ color: 'var(--text-muted)' }}>Click Refresh Analytics to load data.</p>
                  <button onClick={loadExceptionAnalytics} style={{ background: '#fb923c', border: 'none', color: '#fff', borderRadius: '0.375rem', padding: '0.6rem 1.2rem', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>Load Analytics</button>
                </div>
              ) : (
                <>

                  {/* ROW 1: KPI HEADER CARDS */}
                  <section className="animate-fade" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
                    {[
                      { label: 'Total Exceptions', value: exAnalytics.totalExceptions.toLocaleString(), desc: 'All exception records', icon: '📊', color: 'var(--color-primary)' },
                      { label: 'Resolution Rate', value: `${exAnalytics.resolutionRate}%`, desc: `${exAnalytics.resolvedCount} resolved`, icon: '✅', color: '#22c55e', highlight: exAnalytics.resolutionRate > 15 },
                      { label: 'Financial Exposure', value: formatUSD(exAnalytics.totalFinancialImpact), desc: 'Total impact estimate', icon: '💰', color: 'var(--color-primary)', highlight: true },
                      { label: 'High Severity', value: exAnalytics.highSeverityCount.toLocaleString(), desc: 'HIGH or CRITICAL severity', icon: '⚠️', color: '#f43f5e', alert: true },
                      { label: 'Avg Days Past Due', value: `${exAnalytics.avgDaysPastDue}d`, desc: 'Average overdue duration', icon: '⏰', color: '#fb923c', alert: exAnalytics.avgDaysPastDue > 10 },
                    ].map((card, i) => (
                      <div key={i} style={{
                        background: 'var(--bg-surface)',
                        border: card.alert ? '1px solid rgba(244,63,94,0.4)' : card.highlight ? '1px solid rgba(79,70,229,0.4)' : '1px solid var(--border-color)',
                        borderRadius: '0.5rem', padding: '1rem 1.1rem', display: 'flex', flexDirection: 'column', gap: '0.15rem', transition: 'transform 0.2s'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                      onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{card.label}</span>
                          <span style={{ fontSize: '1.1rem' }}>{card.icon}</span>
                        </div>
                        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: card.alert ? '#f43f5e' : card.color }}>{card.value}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{card.desc}</span>
                      </div>
                    ))}
                  </section>

                  {/* ROW 2: EXCEPTION TYPE + STATUS PIPELINE */}
                  <div className="analytics-grid animate-fade">

                    {/* Exception Type Breakdown */}
                    <div className="widget-panel" style={{ gridColumn: 'span 2' }}>
                      <div className="widget-header">
                        <h3 className="widget-title">Exception Volume by Type</h3>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Click a type to drilldown</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {exAnalytics.byType.map((t: any) => {
                          const maxCount = exAnalytics.byType[0]?.count || 1;
                          const pct = (t.count / maxCount) * 100;
                          const typeColors: Record<string, string> = {
                            'PO_OVERDUE': '#f43f5e',
                            'ACK_MISSING': '#eab308',
                            'SUPPLIER_COMMIT_LATE': '#fb923c',
                            'DELETION_FLAG_ACTIVE': '#94a3b8'
                          };
                          const color = typeColors[t.type] || 'var(--color-primary)';
                          const label = t.type.replace(/_/g, ' ');
                          return (
                            <div key={t.type}
                              onClick={() => {
                                if (t.type === 'PO_OVERDUE') { setActiveTab('overdue'); loadData(); }
                                else if (t.type === 'ACK_MISSING' || t.type === 'SUPPLIER_COMMIT_LATE') { setActiveTab('acknowledgement'); loadAcknowledgementData(); }
                              }}
                              style={{ cursor: t.type !== 'DELETION_FLAG_ACTIVE' ? 'pointer' : 'default' }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 500, marginBottom: '0.3rem' }}>
                                <span style={{ color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                                  {label}
                                </span>
                                <span style={{ display: 'flex', gap: '1.25rem' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{t.pct}%</span>
                                  <span style={{ color, fontWeight: 700, minWidth: '30px', textAlign: 'right' }}>{t.count.toLocaleString()}</span>
                                  <span style={{ color: 'var(--color-primary)', fontWeight: 600, minWidth: '90px', textAlign: 'right' }}>{formatUSD(t.financial_impact)}</span>
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.8s ease' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Status Pipeline */}
                    <div className="widget-panel">
                      <div className="widget-header">
                        <h3 className="widget-title">Exception Status Pipeline</h3>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Lifecycle funnel</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {exAnalytics.byStatus.map((s: any) => {
                          const statusConfig: Record<string, { color: string; bg: string; icon: string }> = {
                            'NEW': { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)', icon: '🔵' },
                            'IN_REVIEW': { color: '#eab308', bg: 'rgba(234,179,8,0.1)', icon: '🟡' },
                            'ACTION_DRAFTED': { color: '#fb923c', bg: 'rgba(251,146,60,0.1)', icon: '🟠' },
                            'RESOLVED': { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: '🟢' }
                          };
                          const cfg = statusConfig[s.status] || { color: 'var(--color-primary)', bg: 'rgba(129,140,248,0.1)', icon: '⚪' };
                          const maxCount = Math.max(...exAnalytics.byStatus.map((x: any) => x.count));
                          const barPct = (s.count / maxCount) * 100;
                          return (
                            <div key={s.status} style={{ background: cfg.bg, border: `1px solid ${cfg.color}33`, borderRadius: '0.4rem', padding: '0.65rem 0.85rem' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                  {cfg.icon} {s.status.replace(/_/g, ' ')}
                                </span>
                                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: cfg.color }}>{s.count.toLocaleString()}</span>
                              </div>
                              <div style={{ width: '100%', height: '5px', background: 'var(--bg-surface-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                                <div style={{ width: `${barPct}%`, height: '100%', background: cfg.color, borderRadius: '3px', transition: 'width 0.8s ease' }} />
                              </div>
                              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: 'right' }}>{s.pct}% of total</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>

                  {/* ROW 3: BUYER WORKLOAD + PLANT BARS + AGING BUCKETS */}
                  <div className="animate-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>

                    {/* Buyer Workload Table */}
                    <div className="widget-panel">
                      <div className="widget-header">
                        <h3 className="widget-title">Buyer Workload</h3>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Open vs Resolved</span>
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                            {['Buyer', 'Total', 'Open', 'Resolved', 'Exposure'].map(h => (
                              <th key={h} style={{ padding: '0.35rem 0.4rem', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.6rem', textTransform: 'uppercase', textAlign: h === 'Buyer' ? 'left' : 'center' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {exAnalytics.byBuyer.map((b: any) => {
                            const resolveRate = b.total > 0 ? Math.round((b.resolved / b.total) * 100) : 0;
                            return (
                              <tr key={b.buyer} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <td style={{ padding: '0.45rem 0.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{b.buyer}</td>
                                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center', color: 'var(--text-secondary)' }}>{b.total}</td>
                                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center' }}>
                                  <span style={{ color: '#f43f5e', fontWeight: 600 }}>{b.pending}</span>
                                </td>
                                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center' }}>
                                  <span style={{ color: '#22c55e', fontWeight: 600 }}>{b.resolved}</span>
                                  <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>({resolveRate}%)</span>
                                </td>
                                <td style={{ padding: '0.45rem 0.4rem', textAlign: 'center', color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.65rem' }}>{formatUSD(b.financial_impact)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Plant Exception Bar Chart */}
                    <div className="widget-panel">
                      <div className="widget-header">
                        <h3 className="widget-title">Exceptions by Plant</h3>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Volume + exposure</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                        {exAnalytics.byPlant.slice(0, 8).map((p: any) => {
                          const maxC = exAnalytics.byPlant[0]?.count || 1;
                          const barW = (p.count / maxC) * 100;
                          return (
                            <div key={p.plant}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{p.plant}</span>
                                <span style={{ display: 'flex', gap: '0.75rem' }}>
                                  <span style={{ color: 'var(--text-secondary)' }}>{p.count}</span>
                                  <span style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '0.68rem' }}>{formatUSD(p.financial_impact)}</span>
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '7px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{
                                  width: `${barW}%`, height: '100%',
                                  background: 'linear-gradient(90deg, var(--color-primary) 0%, var(--severity-high-text) 100%)',
                                  borderRadius: '4px', transition: 'width 0.8s ease'
                                }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Aging Buckets */}
                    <div className="widget-panel">
                      <div className="widget-header">
                        <h3 className="widget-title">Exception Aging Distribution</h3>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Days past due buckets</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {exAnalytics.agingBuckets.map((bucket: any) => {
                          const maxCount = Math.max(...exAnalytics.agingBuckets.map((b: any) => b.count));
                          const barW = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
                          const agingColors = ['#22c55e', '#eab308', '#fb923c', '#f43f5e', '#be123c'];
                          const idx = exAnalytics.agingBuckets.indexOf(bucket);
                          const color = agingColors[idx] || 'var(--color-primary)';
                          return (
                            <div key={bucket.bucket}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{bucket.bucket}</span>
                                <span style={{ display: 'flex', gap: '0.5rem' }}>
                                  <span style={{ color, fontWeight: 700 }}>{bucket.count}</span>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{bucket.pct}%</span>
                                </span>
                              </div>
                              <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ width: `${barW}%`, height: '100%', background: color, borderRadius: '4px', transition: 'width 0.8s ease' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ marginTop: '0.85rem', padding: '0.6rem', background: 'var(--bg-surface-elevated)', borderRadius: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                        Avg: <strong style={{ color: exAnalytics.avgDaysPastDue > 10 ? '#f43f5e' : '#22c55e' }}>{exAnalytics.avgDaysPastDue} days</strong> past due across all exceptions
                      </div>
                    </div>

                  </div>

                  {/* ROW 4: 8-WEEK TREND */}
                  <section className="widget-panel animate-fade" style={{ width: '100%' }}>
                    <div className="widget-header">
                      <h3 className="widget-title">New Exceptions Detected — 8-Week Rolling Trend</h3>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Weekly detection volume</span>
                    </div>
                    {exAnalytics.trendByWeek.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No weekly trend data available.</div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '120px', padding: '0.5rem 0' }}>
                        {(() => {
                          const maxCount = Math.max(...exAnalytics.trendByWeek.map((w: any) => w.count));
                          return exAnalytics.trendByWeek.map((w: any, idx: number) => {
                            const barH = maxCount > 0 ? Math.max(4, Math.round((w.count / maxCount) * 100)) : 4;
                            const isLatest = idx === exAnalytics.trendByWeek.length - 1;
                            return (
                              <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem', height: '100%', justifyContent: 'flex-end' }}>
                                <span style={{ fontSize: '0.6rem', fontWeight: isLatest ? 700 : 400, color: isLatest ? '#fb923c' : 'var(--text-muted)' }}>{w.count}</span>
                                <div
                                  title={`${w.week}: ${w.count} exceptions`}
                                  style={{
                                    width: '100%',
                                    height: `${barH}%`,
                                    background: isLatest
                                      ? 'linear-gradient(180deg, var(--severity-high-text) 0%, var(--severity-critical-text) 100%)'
                                      : 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)',
                                    borderRadius: '3px 3px 0 0',
                                    transition: 'height 0.8s ease',
                                    opacity: isLatest ? 1 : 0.7
                                  }}
                                />
                                <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '50px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {w.week}
                                </span>
                              </div>
                            );
                          });
                        })()}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginTop: '0.5rem', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'linear-gradient(180deg, #60a5fa 0%, #2563eb 100%)', display: 'inline-block' }} /> Prior Weeks</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}><span style={{ width: '10px', height: '10px', borderRadius: '2px', background: 'linear-gradient(180deg, var(--severity-high-text) 0%, var(--severity-critical-text) 100%)', display: 'inline-block' }} /> Most Recent Week</span>
                    </div>
                  </section>

                </>
              )}

            </div>
          )}

          {/* TAB 6: BUYER PRODUCTIVITY WORKBENCH (Phase 2E) */}
          {activeTab === 'buyer-productivity' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">
              
              {/* HEADER SECTION with Buyer dropdown, view toggle, and search/filters */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '1rem 1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🎯</span> Buyer Productivity Workbench
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                    Track individual operations, open workload queues, supplier follow-ups, and action histories.
                  </p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {/* Buyer Selector */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Active Buyer:</span>
                    <select
                      value={bpSelectedBuyer}
                      onChange={(e) => {
                        const newBuyer = e.target.value;
                        setBpSelectedBuyer(newBuyer);
                        if (newBuyer === 'ALL') {
                          setBpActiveView('leaderboard');
                        } else {
                          setBpActiveView('workload');
                        }
                        loadBuyerProductivity(newBuyer);
                      }}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      <option value="ALL">All Buyers (Leaderboard / Summary)</option>
                      {bpData?.buyers?.map((b: string) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </div>
                  
                  {/* Refresh Button */}
                  <button
                    onClick={() => loadBuyerProductivity()}
                    className="action-btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', padding: '0.4rem 0.8rem' }}
                  >
                    <span>🔄</span> Refresh
                  </button>
                </div>
              </div>

              {/* LOADING STATE */}
              {bpLoading && !bpData && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem', background: 'var(--bg-surface)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(59, 130, 246, 0.1)', borderTop: '4px solid var(--color-primary)', borderRadius: '50%' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Analyzing buyer workloads and aggregating metrics...</span>
                </div>
              )}

              {bpData && (
                <>
                  {/* OVERDUE ALERTS STRIP */}
                  {bpSelectedBuyer !== 'ALL' && bpData.summary && bpData.summary.length > 0 && bpData.summary[0].overdueTaskCount > 0 && (
                    <div style={{
                      background: 'rgba(239, 68, 68, 0.08)',
                      borderLeft: '4px solid #ef4444',
                      borderRadius: '0.375rem',
                      padding: '0.85rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: '#fca5a5'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <span style={{ fontSize: '1rem' }}>⚠️</span>
                        <span>
                          <strong>Attention Required:</strong> Buyer <strong>{bpSelectedBuyer}</strong> has <strong>{bpData.summary[0].overdueTaskCount}</strong> overdue tasks in their workload. Averaging <strong>{bpData.summary[0].avgDaysPastDue} days past due</strong>.
                        </span>
                      </div>
                      <button 
                        onClick={() => {
                          setBpActiveView('workload');
                          setBpWorkloadSort('days');
                          loadBuyerProductivity(bpSelectedBuyer, 'days');
                        }}
                        style={{
                          background: '#ef4444',
                          color: '#ffffff',
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.68rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'opacity 0.2s'
                        }}
                      >
                        Prioritize Workload
                      </button>
                    </div>
                  )}

                  {/* KPI SCORECARDS ROW */}
                  {(() => {
                    let totalAssigned = 0;
                    let openCount = 0;
                    let resolvedCount = 0;
                    let totalExposure = 0;
                    let totalFollowUps = 0;
                    let avgDays = 0;

                    if (bpSelectedBuyer === 'ALL') {
                      bpData.summary.forEach((s: any) => {
                        totalAssigned += s.totalAssigned;
                        openCount += s.openCount;
                        resolvedCount += s.resolvedCount;
                        totalExposure += s.totalFinancialExposure;
                        totalFollowUps += s.totalFollowUpsSent;
                      });
                      const withOverdue = bpData.summary.filter((s: any) => s.openCount > 0);
                      const totalOpen = withOverdue.reduce((sum: number, s: any) => sum + s.openCount, 0);
                      if (totalOpen > 0) {
                        const weightedSum = withOverdue.reduce((sum: number, s: any) => sum + (s.avgDaysPastDue * s.openCount), 0);
                        avgDays = Math.round((weightedSum / totalOpen) * 10) / 10;
                      }
                    } else if (bpData.summary && bpData.summary.length > 0) {
                      const s = bpData.summary[0];
                      totalAssigned = s.totalAssigned;
                      openCount = s.openCount;
                      resolvedCount = s.resolvedCount;
                      totalExposure = s.totalFinancialExposure;
                      totalFollowUps = s.totalFollowUpsSent;
                      avgDays = s.avgDaysPastDue;
                    }

                    const resolutionRate = totalAssigned > 0 ? Math.round((resolvedCount / totalAssigned) * 100) : 0;

                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
                        <div className="stat-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Total Assigned</span>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.2rem' }}>{totalAssigned}</span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Exceptions allocated</span>
                        </div>
                        <div className="stat-card has-accent" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', '--accent-color': '#fb923c' } as React.CSSProperties}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Open Backlog</span>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fb923c', marginTop: '0.2rem' }}>{openCount}</span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            {openCount > 0 ? `${Math.round((openCount / totalAssigned) * 100)}% of total load` : 'Backlog clear!'}
                          </span>
                        </div>
                        <div className="stat-card has-accent" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', '--accent-color': '#22c55e' } as React.CSSProperties}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Resolved</span>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22c55e', marginTop: '0.2rem' }}>{resolvedCount}</span>
                          <span style={{ fontSize: '0.6rem', color: '#22c55e', marginTop: '0.2rem', fontWeight: 600 }}>{resolutionRate}% Resolution Rate</span>
                        </div>
                        <div className="stat-card has-accent" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', '--accent-color': '#f43f5e' } as React.CSSProperties}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Avg Days Past Due</span>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f43f5e', marginTop: '0.2rem' }}>{avgDays} <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--text-muted)' }}>days</span></span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Target resolution: &lt; 5 days</span>
                        </div>
                        <div className="stat-card has-accent" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', '--accent-color': '#be123c' } as React.CSSProperties}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Exposure at Risk</span>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f43f5e', marginTop: '0.2rem' }}>${totalExposure.toLocaleString()}</span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Value of open items</span>
                        </div>
                        <div className="stat-card has-accent" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', '--accent-color': 'var(--color-primary)' } as React.CSSProperties}>
                          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Follow-ups Sent</span>
                          <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.2rem' }}>{totalFollowUps}</span>
                          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>Outbound communications</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* VIEW SWITCHER TAB BAR */}
                  {bpSelectedBuyer !== 'ALL' && (
                    <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '1px' }}>
                      <button
                        onClick={() => setBpActiveView('workload')}
                        style={{
                          background: bpActiveView === 'workload' ? 'var(--bg-surface)' : 'transparent',
                          border: 'none',
                          borderBottom: bpActiveView === 'workload' ? '2px solid var(--color-primary)' : '2px solid transparent',
                          color: bpActiveView === 'workload' ? 'var(--text-primary)' : 'var(--text-muted)',
                          padding: '0.6rem 1.2rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <span>📋</span> Open Workload Backlog ({bpData.workloadTotal})
                      </button>
                      <button
                        onClick={() => setBpActiveView('history')}
                        style={{
                          background: bpActiveView === 'history' ? 'var(--bg-surface)' : 'transparent',
                          border: 'none',
                          borderBottom: bpActiveView === 'history' ? '2px solid var(--color-primary)' : '2px solid transparent',
                          color: bpActiveView === 'history' ? 'var(--text-primary)' : 'var(--text-muted)',
                          padding: '0.6rem 1.2rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <span>⏱️</span> Action History ({bpData.actionHistory?.length || 0})
                      </button>
                      <button
                        onClick={() => setBpActiveView('followup')}
                        style={{
                          background: bpActiveView === 'followup' ? 'var(--bg-surface)' : 'transparent',
                          border: 'none',
                          borderBottom: bpActiveView === 'followup' ? '2px solid var(--color-primary)' : '2px solid transparent',
                          color: bpActiveView === 'followup' ? 'var(--text-primary)' : 'var(--text-muted)',
                          padding: '0.6rem 1.2rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        <span>🤝</span> Supplier Follow-ups ({bpData.followUpStatus?.length || 0})
                      </button>
                    </div>
                  )}

                  {/* MAIN PANEL CONTENT GRID */}
                  <div style={{ display: 'grid', gridTemplateColumns: bpSelectedBuyer === 'ALL' || bpActiveView === 'leaderboard' ? '1fr' : '2.8fr 1.2fr', gap: '1.5rem', alignItems: 'start' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                      
                      {/* SUB-VIEW 1: LEADERBOARD */}
                      {(bpSelectedBuyer === 'ALL' || bpActiveView === 'leaderboard') && (
                        <div className="widget-panel animate-fade">
                          <div className="widget-header">
                            <h3 className="widget-title">Buyer Productivity Leaderboard</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Comparison of operational performance metrics across all buyers</span>
                          </div>
                          
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Buyer ID</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Total Assigned</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Open Backlog</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Resolved</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Resolution Rate</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Avg Days Overdue</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Financial Exposure</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'center' }}>Follow-ups</th>
                                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {bpData.summary?.map((b: any) => {
                                  const rate = b.resolutionRate;
                                  let rateColor = '#ef4444';
                                  if (rate >= 80) rateColor = '#22c55e';
                                  else if (rate >= 50) rateColor = '#fb923c';

                                  return (
                                    <tr 
                                      key={b.buyer} 
                                      className="table-row-hover"
                                      style={{ borderBottom: '1px solid var(--border-color)' }}
                                    >
                                      <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                        🎯 {b.buyer}
                                      </td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600 }}>{b.totalAssigned}</td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                        <span style={{ 
                                          background: b.openCount > 0 ? 'rgba(251, 146, 60, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                                          color: b.openCount > 0 ? '#fb923c' : '#22c55e',
                                          padding: '0.15rem 0.4rem',
                                          borderRadius: '0.25rem',
                                          fontSize: '0.7rem',
                                          fontWeight: 700
                                        }}>
                                          {b.openCount}
                                        </span>
                                      </td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', color: '#22c55e', fontWeight: 600 }}>{b.resolvedCount}</td>
                                      <td style={{ padding: '0.75rem 1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                          <div style={{ width: '45px', height: '6px', background: 'var(--bg-surface-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ width: `${rate}%`, height: '100%', background: rateColor, borderRadius: '3px' }} />
                                          </div>
                                          <span style={{ color: rateColor, fontWeight: 700 }}>{rate}%</span>
                                        </div>
                                      </td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: b.avgDaysPastDue > 8 ? '#f43f5e' : 'var(--text-primary)' }}>
                                        {b.avgDaysPastDue}d
                                      </td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#fca5a5' }}>
                                        ${b.totalFinancialExposure.toLocaleString()}
                                      </td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, color: '#60a5fa' }}>
                                        {b.totalFollowUpsSent}
                                      </td>
                                      <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                                        <button
                                          onClick={() => {
                                            setBpSelectedBuyer(b.buyer);
                                            setBpActiveView('workload');
                                            loadBuyerProductivity(b.buyer);
                                          }}
                                          className="action-btn"
                                          style={{ padding: '0.25rem 0.6rem', fontSize: '0.68rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                                        >
                                          <span>👁️</span> Open Work
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* SUB-VIEW 2: WORKLOAD QUEUE */}
                      {bpSelectedBuyer !== 'ALL' && bpActiveView === 'workload' && (
                        <div className="widget-panel animate-fade">
                          
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem', background: 'var(--bg-surface-elevated)', padding: '0.75rem', borderRadius: '0.375rem', border: '1px solid var(--border-color)' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              
                              <input
                                type="text"
                                placeholder="Search PO, supplier, ID..."
                                value={bpWorkloadSearch}
                                onChange={(e) => setBpWorkloadSearch(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') loadBuyerProductivity();
                                }}
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)',
                                  padding: '0.35rem 0.65rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.72rem',
                                  width: '150px'
                                }}
                              />

                              <select
                                value={bpWorkloadSeverity}
                                onChange={(e) => setBpWorkloadSeverity(e.target.value)}
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)',
                                  padding: '0.35rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">All Severities</option>
                                <option value="CRITICAL">Critical</option>
                                <option value="HIGH">High</option>
                                <option value="MEDIUM">Medium</option>
                                <option value="LOW">Low</option>
                              </select>

                              <select
                                value={bpWorkloadType}
                                onChange={(e) => setBpWorkloadType(e.target.value)}
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)',
                                  padding: '0.35rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer'
                                }}
                              >
                                <option value="">All Types</option>
                                <option value="LATE_PO">Late PO</option>
                                <option value="ACK_MISSING">Acknowledgement Missing</option>
                                <option value="SHORTAGE">Part Shortage</option>
                                <option value="PRICE_MISMATCH">Price Mismatch</option>
                                <option value="QUALITY_ISSUE">Quality Issue</option>
                              </select>

                              <select
                                value={bpWorkloadSort}
                                onChange={(e) => {
                                  setBpWorkloadSort(e.target.value);
                                  loadBuyerProductivity(bpSelectedBuyer, e.target.value);
                                }}
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)',
                                  padding: '0.35rem 0.5rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.72rem',
                                  cursor: 'pointer',
                                  fontWeight: 600
                                }}
                              >
                                <option value="days">Sort: Days Past Due</option>
                                <option value="severity">Sort: Severity & Days</option>
                                <option value="financial">Sort: Financial Impact</option>
                              </select>

                              <button
                                onClick={() => loadBuyerProductivity()}
                                style={{
                                  background: 'var(--bg-surface)',
                                  border: '1px solid var(--border-color)',
                                  color: 'var(--text-primary)',
                                  padding: '0.35rem 0.65rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 600,
                                  cursor: 'pointer'
                                }}
                              >
                                Apply Filters
                              </button>
                            </div>

                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                              Showing <strong>{bpData.workload?.length || 0}</strong> of <strong>{bpData.workloadTotal}</strong> items
                            </span>
                          </div>

                          {bpData.workload?.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              <span>✨</span> No open exceptions matching your criteria. Workload is clear!
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Exception ID / Type</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>PO / Item / Plant</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Supplier</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Severity</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Days Past</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Exposure</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Priority Score</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bpData.workload.map((w: any) => {
                                    const sevColors: Record<string, string> = {
                                      CRITICAL: '#be123c',
                                      HIGH: '#f43f5e',
                                      MEDIUM: '#fb923c',
                                      LOW: '#22c55e'
                                    };
                                    const sevColor = sevColors[w.severity] || 'var(--color-primary)';

                                    let prioColor = '#22c55e';
                                    if (w.priorityScore > 75) prioColor = '#be123c';
                                    else if (w.priorityScore > 45) prioColor = '#fb923c';
                                    else if (w.priorityScore > 20) prioColor = '#eab308';

                                    return (
                                      <tr
                                        key={w.exception_id}
                                        className="table-row-hover"
                                        style={{ borderBottom: '1px solid var(--border-color)' }}
                                      >
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <span style={{ fontSize: '0.65rem' }}>⚡</span> {w.exception_id}
                                          </div>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                            {w.exception_type.replace(/_/g, ' ')}
                                          </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{w.po_number || 'N/A'}</div>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                                            Item: {w.item_number || '10'} | Plant: {w.plant || 'Unknown'}
                                          </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={w.supplier_name}>
                                            {w.supplier_name}
                                          </div>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ID: {w.supplier_id}</div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                                          <span style={{
                                            background: `${sevColor}20`,
                                            color: sevColor,
                                            border: `1px solid ${sevColor}40`,
                                            padding: '0.15rem 0.4rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.65rem',
                                            fontWeight: 700
                                          }}>
                                            {w.severity}
                                          </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                                          <span style={{
                                            background: w.days_past_due > 14 ? 'rgba(244, 63, 94, 0.15)' : 'rgba(251, 146, 60, 0.15)',
                                            color: w.days_past_due > 14 ? '#f43f5e' : '#fb923c',
                                            padding: '0.15rem 0.35rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.68rem',
                                            fontWeight: 700
                                          }}>
                                            {w.days_past_due}d
                                          </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#fca5a5' }}>
                                          ${w.financial_impact.toLocaleString()}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <div style={{ width: '40px', height: '6px', background: 'var(--bg-surface-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                                              <div style={{ width: `${w.priorityScore}%`, height: '100%', background: prioColor, borderRadius: '3px' }} />
                                            </div>
                                            <span style={{ color: prioColor, fontWeight: 700, fontSize: '0.7rem' }}>{w.priorityScore}</span>
                                          </div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.3rem' }}>
                                            <button
                                              onClick={() => {
                                                alert(`Drafting action email to supplier ${w.supplier_name} for exception ${w.exception_id}.`);
                                              }}
                                              className="action-btn"
                                              style={{ padding: '0.2rem 0.45rem', fontSize: '0.62rem', fontWeight: 600 }}
                                              title="Draft Action Plan"
                                            >
                                              📧 Draft
                                            </button>
                                            <button
                                              onClick={() => {
                                                alert(`Logging quick supplier follow-up for supplier ${w.supplier_name}.`);
                                              }}
                                              className="action-btn-secondary"
                                              style={{ padding: '0.2rem 0.45rem', fontSize: '0.62rem', fontWeight: 600 }}
                                              title="Log Outbound Follow-up"
                                            >
                                              📞 Follow-up
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* PAGINATION PANEL */}
                          {bpData.workloadTotal > 50 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-color)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              <span>Showing page {bpWorkloadPage} of {Math.ceil(bpData.workloadTotal / 50)}</span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button
                                  disabled={bpWorkloadPage === 1}
                                  onClick={() => {
                                    setBpWorkloadPage(prev => Math.max(1, prev - 1));
                                    loadBuyerProductivity();
                                  }}
                                  className="action-btn-secondary"
                                  style={{ padding: '0.25rem 0.5rem', opacity: bpWorkloadPage === 1 ? 0.5 : 1 }}
                                >
                                  ◀ Previous
                                </button>
                                <button
                                  disabled={bpWorkloadPage * 50 >= bpData.workloadTotal}
                                  onClick={() => {
                                    setBpWorkloadPage(prev => prev + 1);
                                    loadBuyerProductivity();
                                  }}
                                  className="action-btn-secondary"
                                  style={{ padding: '0.25rem 0.5rem', opacity: bpWorkloadPage * 50 >= bpData.workloadTotal ? 0.5 : 1 }}
                                >
                                  Next ▶
                                </button>
                              </div>
                            </div>
                          )}

                        </div>
                      )}

                      {/* SUB-VIEW 3: ACTION HISTORY */}
                      {bpSelectedBuyer !== 'ALL' && bpActiveView === 'history' && (
                        <div className="widget-panel animate-fade">
                          <div className="widget-header">
                            <h3 className="widget-title">Buyer Action History (Completed / Resolved)</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Audit trail of recently resolved exceptions and mitigation actions taken by this buyer</span>
                          </div>

                          {bpData.actionHistory?.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              No completed actions in historical records.
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Resolved Date</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Exception ID / Type</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>PO Number</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Supplier</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Severity</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Days to Resolve</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Financial Impact</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bpData.actionHistory.map((h: any) => {
                                    const sevColors: Record<string, string> = {
                                      CRITICAL: '#be123c',
                                      HIGH: '#f43f5e',
                                      MEDIUM: '#fb923c',
                                      LOW: '#22c55e'
                                    };
                                    const sevColor = sevColors[h.severity] || 'var(--color-primary)';

                                    return (
                                      <tr
                                        key={h.exception_id}
                                        style={{ borderBottom: '1px solid var(--border-color)' }}
                                        className="table-row-hover"
                                      >
                                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                          📅 {h.resolved_on}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ fontWeight: 700, color: '#34d399' }}>{h.exception_id}</div>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{h.exception_type.replace(/_/g, ' ')}</div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', fontWeight: 600 }}>{h.po_number || 'N/A'}</td>
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{h.supplier_name}</div>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ID: {h.supplier_id}</div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                                          <span style={{
                                            background: `${sevColor}20`,
                                            color: sevColor,
                                            border: `1px solid ${sevColor}40`,
                                            padding: '0.15rem 0.35rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.65rem',
                                            fontWeight: 700
                                          }}>
                                            {h.severity}
                                          </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 600, color: '#22c55e' }}>
                                          ✅ {h.days_to_resolve} days
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right', fontWeight: 600, color: '#22c55e' }}>
                                          ${h.financial_impact.toLocaleString()}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* SUB-VIEW 4: SUPPLIER FOLLOW-UPS */}
                      {bpSelectedBuyer !== 'ALL' && bpActiveView === 'followup' && (
                        <div className="widget-panel animate-fade">
                          <div className="widget-header">
                            <h3 className="widget-title">Supplier Follow-Up Obligations & Ack Health</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Status of suppliers managed by this buyer, ordered by urgency</span>
                          </div>

                          {bpData.followUpStatus?.length === 0 ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                              No suppliers managed under active exceptions.
                            </div>
                          ) : (
                            <div style={{ overflowX: 'auto' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                                <thead>
                                  <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>Supplier</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Open Exceptions</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Total Follow-ups Sent</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Last Follow-up</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Ack Status</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'center' }}>Urgency</th>
                                    <th style={{ padding: '0.5rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bpData.followUpStatus.map((f: any) => {
                                    let urgencyColor = '#22c55e';
                                    if (f.urgency === 'HIGH') urgencyColor = '#be123c';
                                    else if (f.urgency === 'MEDIUM') urgencyColor = '#fb923c';

                                    let ackColor = '#22c55e';
                                    let ackLabel = '🟢 CONFIRMED';
                                    if (f.acknowledgementStatus === 'MISSING') {
                                      ackColor = '#f43f5e';
                                      ackLabel = '🔴 MISSING';
                                    } else if (f.acknowledgementStatus === 'PENDING') {
                                      ackColor = '#fb923c';
                                      ackLabel = '🟡 PENDING';
                                    }

                                    return (
                                      <tr
                                        key={f.supplier_id}
                                        style={{ borderBottom: '1px solid var(--border-color)' }}
                                        className="table-row-hover"
                                      >
                                        <td style={{ padding: '0.65rem 0.75rem' }}>
                                          <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{f.supplier_name}</div>
                                          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ID: {f.supplier_id}</div>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>
                                          {f.openExceptions}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', fontWeight: 600 }}>
                                          {f.totalFollowUpsSent}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                          {f.lastFollowUpDate ? f.lastFollowUpDate : 'No record'}
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                                          <span style={{
                                            fontWeight: 600,
                                            fontSize: '0.7rem',
                                            color: ackColor
                                          }}>
                                            {ackLabel}
                                          </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'center' }}>
                                          <span style={{
                                            background: `${urgencyColor}20`,
                                            color: urgencyColor,
                                            border: `1px solid ${urgencyColor}40`,
                                            padding: '0.15rem 0.4rem',
                                            borderRadius: '0.25rem',
                                            fontSize: '0.65rem',
                                            fontWeight: 700
                                          }}>
                                            {f.urgency}
                                          </span>
                                        </td>
                                        <td style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>
                                          <button
                                            onClick={() => {
                                              alert(`Sending batch follow-up reminder to ${f.supplier_name} for their ${f.openExceptions} open exceptions.`);
                                            }}
                                            className="action-btn"
                                            style={{ padding: '0.25rem 0.5rem', fontSize: '0.68rem', fontWeight: 600 }}
                                          >
                                            📣 Send Reminder
                                          </button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                    </div>

                    {/* RIGHT PANEL: Stats sidebar */}
                    {bpSelectedBuyer !== 'ALL' && bpActiveView !== 'leaderboard' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        
                        {/* WIDGET 1: AGING BREAKDOWN */}
                        <div className="widget-panel">
                          <div className="widget-header">
                            <h3 className="widget-title">Backlog Aging Breakdown</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Distribution of open exceptions</span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {bpData.agingBreakdown?.map((bucket: any, idx: number) => {
                              const maxCount = Math.max(...bpData.agingBreakdown.map((b: any) => b.count));
                              const barW = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;
                              const agingColors = ['#22c55e', '#eab308', '#fb923c', '#f43f5e', '#be123c'];
                              const color = agingColors[idx] || 'var(--color-primary)';

                              return (
                                <div key={bucket.bucket}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.25rem' }}>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{bucket.bucket}</span>
                                    <span style={{ display: 'flex', gap: '0.5rem' }}>
                                      <span style={{ color, fontWeight: 700 }}>{bucket.count}</span>
                                      <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>{bucket.pct}%</span>
                                    </span>
                                  </div>
                                  <div style={{ width: '100%', height: '8px', background: 'var(--bg-surface-elevated)', borderRadius: '4px', overflow: 'hidden' }}>
                                    <div style={{ width: `${barW}%`, height: '100%', background: color, borderRadius: '4px' }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ marginTop: '0.85rem', padding: '0.6rem', background: 'var(--bg-surface-elevated)', borderRadius: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Average backlog age: <strong style={{ color: bpData.summary?.[0]?.avgDaysPastDue > 8 ? '#f43f5e' : '#22c55e' }}>{bpData.summary?.[0]?.avgDaysPastDue || 0} days</strong>
                          </div>
                        </div>

                        {/* WIDGET 2: SUPPLIER ACK SUMMARY PANEL */}
                        <div className="widget-panel">
                          <div className="widget-header">
                            <h3 className="widget-title">Managed Suppliers Health</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Out of {bpData.followUpStatus?.length || 0} suppliers</span>
                          </div>
                          
                          {(() => {
                            const statuses = bpData.followUpStatus || [];
                            const missing = statuses.filter((x: any) => x.acknowledgementStatus === 'MISSING').length;
                            const pending = statuses.filter((x: any) => x.acknowledgementStatus === 'PENDING').length;
                            const confirmed = statuses.filter((x: any) => x.acknowledgementStatus === 'CONFIRMED').length;

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', padding: '0.4rem', borderRadius: '0.25rem', background: 'rgba(244, 63, 94, 0.08)', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
                                  <span style={{ color: '#f43f5e', fontWeight: 600 }}>🔴 Missing Acknowledgements</span>
                                  <span style={{ color: '#f43f5e', fontWeight: 700 }}>{missing}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', padding: '0.4rem', borderRadius: '0.25rem', background: 'rgba(251, 146, 60, 0.08)', border: '1px solid rgba(251, 146, 60, 0.2)' }}>
                                  <span style={{ color: '#fb923c', fontWeight: 600 }}>🟡 Pending Action</span>
                                  <span style={{ color: '#fb923c', fontWeight: 700 }}>{pending}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', padding: '0.4rem', borderRadius: '0.25rem', background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                                  <span style={{ color: '#22c55e', fontWeight: 600 }}>🟢 Confirmed / Replied</span>
                                  <span style={{ color: '#22c55e', fontWeight: 700 }}>{confirmed}</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                      </div>
                    )}

                  </div>

                </>
              )}

            </div>
          )}

          {/* TAB 7: CONTROL TOWER INTEGRATION DASHBOARD (Phase 1E) */}
          {activeTab === 'control-tower' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">
              
              {/* HEADER SECTION */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '1rem 1.5rem', borderRadius: '0.5rem', border: '1px solid var(--border-color)', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>🎛️</span> Global Supply Chain Control Tower
                  </h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                    Unified Platform Master Cockpit — Real-time transaction tracking, warehouse inventories, and supplier compliance.
                  </p>
                </div>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Status Indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(34, 197, 94, 0.08)', padding: '0.35rem 0.65rem', borderRadius: '0.25rem', border: '1px solid rgba(34, 197, 94, 0.2)', fontSize: '0.7rem', color: '#22c55e', fontWeight: 600 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                    Live Sync Connected
                  </div>
                  
                  {/* Manual Refresh */}
                  <button
                    onClick={loadControlTowerData}
                    className="action-btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.72rem', padding: '0.4rem 0.8rem' }}
                  >
                    <span>🔄</span> Sync Data
                  </button>
                </div>
              </div>

              {/* LOADING STATE */}
              {ctLoading && !ctData && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '1rem', background: 'var(--bg-surface)', borderRadius: '0.5rem', border: '1px solid var(--border-color)' }}>
                  <div className="spinner" style={{ width: '40px', height: '40px', border: '4px solid rgba(16, 185, 129, 0.1)', borderTop: '4px solid #34d399', borderRadius: '50%' }} />
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Aggregating multi-workbench telemetry and compilation files...</span>
                </div>
              )}

              {ctData && (
                <>
                  {/* OPERATIONAL METRIC CARD ROW */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                    
                    {/* Card 1: Overdue PO Value */}
                    <div 
                      className="stat-card table-row-hover has-accent" 
                      onClick={() => { setActiveTab('overdue'); loadData(); }}
                      style={{ cursor: 'pointer', '--accent-color': '#fb923c', display: 'flex', flexDirection: 'column', justifyContent: 'center' } as React.CSSProperties}
                    >
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                        Overdue PO Risk <span>⏳</span>
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fb923c', marginTop: '0.2rem' }}>
                        ${(ctData?.metrics?.overduePoValue ?? 0).toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 600 }}>
                        {ctData?.metrics?.overduePoLines ?? 0} Lines Overdue ↗
                      </span>
                    </div>

                    {/* Card 2: Missing Acks */}
                    <div 
                      className="stat-card table-row-hover has-accent" 
                      onClick={() => { setActiveTab('acknowledgement'); loadAcknowledgementData(); }}
                      style={{ cursor: 'pointer', '--accent-color': 'var(--color-primary)', display: 'flex', flexDirection: 'column', justifyContent: 'center' } as React.CSSProperties}
                    >
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Ack Latency <span>🤝</span>
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#60a5fa', marginTop: '0.2rem' }}>
                        {ctData?.metrics?.missingAcks ?? 0} Missing
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 600 }}>
                        Acks overdue &gt; 5 days ↗
                      </span>
                    </div>

                    {/* Card 3: Safety Stock Breaches */}
                    <div 
                      className="stat-card table-row-hover has-accent" 
                      onClick={() => { setActiveTab('part'); loadPartAvailabilityData(); }}
                      style={{ cursor: 'pointer', '--accent-color': '#f43f5e', display: 'flex', flexDirection: 'column', justifyContent: 'center' } as React.CSSProperties}
                    >
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Active Shortages <span>📦</span>
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f43f5e', marginTop: '0.2rem' }}>
                        {ctData?.metrics?.totalPartShortages ?? 0} Breaches
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 600 }}>
                        Below safety stock limits ↗
                      </span>
                    </div>

                    {/* Card 4: Active Exceptions */}
                    <div 
                      className="stat-card table-row-hover has-accent" 
                      onClick={() => { setActiveTab('exception-analytics'); loadExceptionAnalytics(); }}
                      style={{ cursor: 'pointer', '--accent-color': '#eab308', display: 'flex', flexDirection: 'column', justifyContent: 'center' } as React.CSSProperties}
                    >
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Active Exceptions <span>⚡</span>
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#eab308', marginTop: '0.2rem' }}>
                        {ctData?.metrics?.activeExceptions ?? 0}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '0.25rem', fontWeight: 600 }}>
                        {ctData?.metrics?.criticalExceptions ?? 0} Critical Severity ↗
                      </span>
                    </div>

                    {/* Card 5: Financial Exposure */}
                    <div 
                      className="stat-card has-accent" 
                      style={{ '--accent-color': '#be123c', display: 'flex', flexDirection: 'column', justifyContent: 'center' } as React.CSSProperties}
                    >
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Global Value Exposure <span>🚨</span>
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#ef4444', marginTop: '0.2rem' }}>
                        ${(ctData?.metrics?.financialExposure ?? 0).toLocaleString()}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#22c55e', marginTop: '0.25rem', fontWeight: 700 }}>
                        {ctData?.metrics?.resolutionRate ?? 0}% Resolution Rate
                      </span>
                    </div>

                  </div>

                  {/* COCKPIT GRID SECTION */}
                  <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1.5fr', gap: '1.5rem', alignItems: 'start' }}>
                    
                    {/* LEFT PANEL: PRIORITY INBOX + ACTIVITY FEED */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', minWidth: 0 }}>
                      
                      {/* UNIFIED PRIORITY INBOX */}
                      <div className="widget-panel">
                        <div className="widget-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h3 className="widget-title">Unified Action Center — Global Priority Inbox</h3>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Top 6 most urgent supply chain alerts aggregated across all workbenches</span>
                          </div>
                          <span style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.65rem', fontWeight: 700 }}>
                            ACTION REQUIRED
                          </span>
                        </div>

                        <div style={{ overflowX: 'auto', marginTop: '0.5rem' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                                <th style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>Category</th>
                                <th style={{ padding: '0.6rem 0.8rem', fontWeight: 600 }}>Description</th>
                                <th style={{ padding: '0.6rem 0.8rem', fontWeight: 600, textAlign: 'center' }}>Priority</th>
                                <th style={{ padding: '0.6rem 0.8rem', fontWeight: 600, textAlign: 'right' }}>Financial Risk</th>
                                <th style={{ padding: '0.6rem 0.8rem', fontWeight: 600, textAlign: 'center' }}>Plant</th>
                                <th style={{ padding: '0.6rem 0.8rem', fontWeight: 600, textAlign: 'right' }}>Resolve</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(ctData?.priorityInbox || []).map((item: any) => {
                                let badgeBg = 'rgba(79, 70, 229, 0.1)';
                                let badgeColor = 'var(--color-primary)';
                                let catText = 'OVERDUE PO';
                                if (item.category === 'MISSING_ACK') {
                                  badgeBg = 'rgba(139, 92, 246, 0.1)';
                                  badgeColor = '#60a5fa';
                                  catText = 'MISSING ACK';
                                } else if (item.category === 'PART_SHORTAGE') {
                                  badgeBg = 'rgba(244, 63, 94, 0.1)';
                                  badgeColor = '#f43f5e';
                                  catText = 'SHORTAGE';
                                } else if (item.category === 'EXCEPTION') {
                                  badgeBg = 'rgba(234, 179, 8, 0.1)';
                                  badgeColor = '#eab308';
                                  catText = 'EXCEPTION';
                                }

                                let prioColor = '#22c55e';
                                if (item.priority === 'CRITICAL') prioColor = '#be123c';
                                else if (item.priority === 'HIGH') prioColor = '#fb923c';

                                return (
                                  <tr
                                    key={item.id}
                                    className="table-row-hover"
                                    style={{ borderBottom: '1px solid var(--border-color)' }}
                                  >
                                    <td style={{ padding: '0.75rem 0.8rem' }}>
                                      <span style={{
                                        background: badgeBg,
                                        color: badgeColor,
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '0.25rem',
                                        fontSize: '0.625rem',
                                        fontWeight: 700,
                                        border: `1px solid ${badgeColor}30`,
                                        whiteSpace: 'nowrap'
                                      }}>
                                        {catText}
                                      </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 0.8rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                                      {item.description}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'center' }}>
                                      <span style={{ color: prioColor, fontWeight: 700, fontSize: '0.68rem' }}>
                                        {item.priority}
                                      </span>
                                    </td>
                                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right', fontWeight: 600, color: '#fca5a5' }}>
                                      {item.financialRisk > 0 ? `$${item.financialRisk.toLocaleString()}` : '—'}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>
                                      {item.plant}
                                    </td>
                                    <td style={{ padding: '0.75rem 0.8rem', textAlign: 'right' }}>
                                      <button
                                        onClick={() => {
                                          if (item.category === 'OVERDUE_PO') {
                                            setActiveTab('overdue');
                                            loadData();
                                          } else if (item.category === 'MISSING_ACK') {
                                            setActiveTab('acknowledgement');
                                            loadAcknowledgementData();
                                          } else if (item.category === 'PART_SHORTAGE') {
                                            setActiveTab('part');
                                            loadPartAvailabilityData();
                                          } else {
                                            setActiveTab('exception-analytics');
                                            loadExceptionAnalytics();
                                          }
                                        }}
                                        className="action-btn"
                                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.65rem', fontWeight: 600 }}
                                      >
                                        ⚡ Resolve
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* SYSTEM RECENT ACTIVITY LOG */}
                      <div className="widget-panel">
                        <div className="widget-header">
                          <h3 className="widget-title">Active Security & Event Tracking Logs</h3>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Automated 24/7 audit timeline of procurement updates and background events</span>
                        </div>
                        
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                          {(ctData?.recentActivity || []).map((log: any, idx: number) => {
                            let typeIcon = 'ℹ️';
                            let iconColor = 'var(--color-primary)';
                            let bg = 'var(--bg-surface-elevated)';
                            if (log.type === 'WARNING') {
                              typeIcon = '⚠️';
                              iconColor = '#fb923c';
                              bg = 'rgba(251, 146, 60, 0.04)';
                            } else if (log.type === 'SUCCESS') {
                              typeIcon = '✅';
                              iconColor = '#22c55e';
                              bg = 'rgba(34, 197, 94, 0.04)';
                            }

                            return (
                              <div 
                                key={idx} 
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '0.65rem 0.85rem',
                                  borderRadius: '0.375rem',
                                  background: bg,
                                  border: `1px solid var(--border-color)`,
                                  fontSize: '0.72rem',
                                  gap: '1rem'
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                  <span style={{ fontSize: '1rem', color: iconColor }}>{typeIcon}</span>
                                  <span style={{ color: 'var(--text-primary)' }}>{log.message}</span>
                                </div>
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                  {log.timestamp}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                    {/* RIGHT PANEL: PLANT FEED + AGENT HEALTH */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      
                      {/* MANUFACTURING PLANTS RISK FEED */}
                      <div className="widget-panel">
                        <div className="widget-header">
                          <h3 className="widget-title">Global Warehouse & Plant Health</h3>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Real-time inventory and bottleneck states by facility</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                          {(ctData?.plantHealth || []).map((p: any) => {
                            let ringColor = '#22c55e';
                            let statusText = 'Optimal';
                            let bg = 'rgba(34, 197, 94, 0.04)';
                            let border = 'rgba(34, 197, 94, 0.15)';
                            if (p.status === 'RISK') {
                              ringColor = '#be123c';
                              statusText = 'Critical Risk';
                              bg = 'rgba(239, 68, 68, 0.04)';
                              border = 'rgba(239, 68, 68, 0.15)';
                            } else if (p.status === 'WARNING') {
                              ringColor = '#fb923c';
                              statusText = 'Warning State';
                              bg = 'rgba(251, 146, 60, 0.04)';
                              border = 'rgba(251, 146, 60, 0.15)';
                            }

                            return (
                              <div 
                                key={p.plant}
                                style={{
                                  background: bg,
                                  border: `1px solid ${border}`,
                                  borderRadius: '0.5rem',
                                  padding: '0.8rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.6rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontWeight: 700, fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                                    🏭 Plant {p.plant}
                                  </span>
                                  <span style={{
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    color: ringColor,
                                    textTransform: 'uppercase',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.3rem'
                                  }}>
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: ringColor, display: 'inline-block' }} />
                                    {statusText}
                                  </span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', fontSize: '0.65rem', textAlign: 'center' }}>
                                  <div style={{ background: 'var(--bg-surface)', padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
                                    <div style={{ color: p.shortageCount > 0 ? '#f43f5e' : 'var(--text-muted)', fontWeight: 700 }}>{p.shortageCount}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginTop: '0.1rem' }}>Shortages</div>
                                  </div>
                                  <div style={{ background: 'var(--bg-surface)', padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
                                    <div style={{ color: p.exceptionCount > 0 ? '#eab308' : 'var(--text-muted)', fontWeight: 700 }}>{p.exceptionCount}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginTop: '0.1rem' }}>Exceptions</div>
                                  </div>
                                  <div style={{ background: 'var(--bg-surface)', padding: '0.35rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)' }}>
                                    <div style={{ color: p.overdueCount > 0 ? '#fb923c' : 'var(--text-muted)', fontWeight: 700 }}>{p.overdueCount}</div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.55rem', marginTop: '0.1rem' }}>Overdue POs</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* PLATFORM SUB-AGENTS TELEMETRY */}
                      <div className="widget-panel">
                        <div className="widget-header">
                          <h3 className="widget-title">Multi-Agent Sub-System Status</h3>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Operational health of background analytical micro-services</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginTop: '0.5rem' }}>
                          {(ctData?.systemStatus || []).map((sys: any) => {
                            let statusColor = '#22c55e';
                            let statusBg = 'rgba(34, 197, 94, 0.08)';
                            if (sys.status === 'BREACH') {
                              statusColor = '#f43f5e';
                              statusBg = 'rgba(244, 63, 94, 0.08)';
                            } else if (sys.status === 'ATTENTION') {
                              statusColor = '#fb923c';
                              statusBg = 'rgba(251, 146, 60, 0.08)';
                            }

                            return (
                              <div
                                key={sys.name}
                                style={{
                                  background: 'var(--bg-surface-elevated)',
                                  border: '1px solid var(--border-color)',
                                  borderRadius: '0.375rem',
                                  padding: '0.65rem 0.8rem',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.3rem'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                    {sys.name}
                                  </span>
                                  <span style={{
                                    background: statusBg,
                                    color: statusColor,
                                    border: `1px solid ${statusColor}30`,
                                    padding: '0.1rem 0.35rem',
                                    borderRadius: '0.2rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700
                                  }}>
                                    {sys.indicator}
                                  </span>
                                </div>
                                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                                  {sys.details}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>

                  </div>

                </>
              )}

            </div>
          )}

          {/* TAB 8: AI SOURCING COPILOT (Phase 3A) */}
          {activeTab === 'copilot' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '1.5rem', width: '100%', height: '100%' }} className="animate-fade">
              
              {/* LEFT SIDE: CHAT INTERFACE */}
              <div className="widget-panel" style={{ height: 'calc((100vh - 170px) / 0.85)', minHeight: '450px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                {/* Tab Header */}
                <div className="widget-header" style={{ paddingBottom: '0.85rem' }}>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🤖</span> AI Sourcing Copilot
                    </h2>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                      Ask operational supply chain questions backed by real-time plant KPIs & exception worklists.
                    </p>
                  </div>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(34, 197, 94, 0.08)', padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid rgba(34, 197, 94, 0.15)', fontSize: '0.65rem', color: '#34d399', fontWeight: 600 }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 2s infinite' }} />
                    AI Sourcing Context Engaged
                  </div>
                </div>

                {/* Message Stream */}
                <div 
                  data-testid="copilot-chat-history"
                  style={{ 
                    flex: 1, 
                    overflowY: 'auto', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem', 
                    padding: '1rem',
                    background: 'rgba(10, 14, 23, 0.3)',
                    borderRadius: '0.375rem',
                    border: '1px solid var(--border-color)'
                  }}>
                  {copilotMessages.map((msg, index) => {
                    const isAssistant = msg.role === 'assistant';
                    return (
                      <div 
                        key={index} 
                        data-testid="copilot-message-bubble"
                        style={{
                          alignSelf: isAssistant ? 'flex-start' : 'flex-end',
                          maxWidth: '85%',
                          background: isAssistant ? 'var(--bg-surface-elevated)' : 'rgba(59, 130, 246, 0.12)',
                          border: isAssistant ? '1px solid var(--border-color)' : '1px solid rgba(59, 130, 246, 0.25)',
                          borderRadius: '0.5rem',
                          padding: '0.75rem 1rem',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.35rem',
                          boxShadow: 'var(--shadow-sm)'
                        }}>
                        
                        {/* Header: Sender & Info */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)', borderBottom: '1px solid rgba(255,255,255,0.03)', paddingBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 700, color: isAssistant ? 'var(--color-primary)' : 'rgba(96, 165, 250, 0.85)' }}>
                            {isAssistant ? '🤖 AI COPILOT' : '👤 BUYER/PLANNER'}
                          </span>
                          {isAssistant && msg.tokens_used !== undefined && (
                            <span style={{ fontSize: '0.58rem' }}>
                              tokens: {msg.tokens_used}
                            </span>
                          )}
                        </div>

                        {/* Content */}
                        <div style={{ wordBreak: 'break-word' }}>
                          {renderMarkdown(msg.content, handleCopilotAction)}
                        </div>

                        {/* Sources Used Badge */}
                        {isAssistant && msg.sources_used && msg.sources_used.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                            <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', alignSelf: 'center' }}>Sources:</span>
                            {msg.sources_used.map((src: string) => (
                              <span key={src} style={{ fontSize: '0.58rem', background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', padding: '0.08rem 0.3rem', borderRadius: '0.15rem', border: '1px solid rgba(255,255,255,0.05)' }}>
                                🔍 {src}
                              </span>
                            ))}
                          </div>
                        )}

                      </div>
                    );
                  })}
                  
                  {/* Loader state */}
                  {copilotLoading && (
                     <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', padding: '0.75rem 1rem' }}>
                       <div style={{ width: '14px', height: '14px', border: '2px solid rgba(59,130,246,0.1)', borderTop: '2px solid var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                       <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Copilot is analyzing supply chain tables...</span>
                     </div>
                  )}

                  {/* Bottom sentinel for Sourcing Copilot auto-scroll */}
                  <div ref={copilotChatEndRef} aria-hidden="true" />
                </div>

                {/* Suggested Quick Queries */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>SUGGESTED ANALYTICS TRIGGERS:</span>
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                    {[
                      'What are our highest priority overdue exceptions today?',
                      'Which suppliers represent our highest overdue financial exposure?',
                      'Summarize active part shortage risks at our manufacturing plants.',
                      'Analyze the plant exception health of Plant 1010.'
                    ].map(q => (
                      <button 
                        key={q}
                        type="button"
                        onClick={() => { if (!copilotLoading) sendCopilotMessage(q); }}
                        disabled={copilotLoading}
                        style={{ 
                          background: 'rgba(255,255,255,0.03)', 
                          border: '1px solid var(--border-color)', 
                          color: 'var(--text-secondary)', 
                          fontSize: '0.68rem', 
                          padding: '0.3rem 0.6rem', 
                          borderRadius: '0.25rem', 
                          cursor: copilotLoading ? 'not-allowed' : 'pointer', 
                          transition: 'all 0.15s ease' 
                        }}
                        onMouseEnter={e => { if (!copilotLoading) e.currentTarget.style.background = 'rgba(59, 130, 246, 0.08)'; }}
                        onMouseLeave={e => { if (!copilotLoading) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                      >
                        ⚡ {q}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chat Input Area */}
                <form onSubmit={e => { e.preventDefault(); sendCopilotMessage(); }} style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                  <input
                    type="text"
                    data-testid="copilot-chat-input"
                    value={copilotInput}
                    onChange={e => setCopilotInput(e.target.value)}
                    placeholder="Ask Copilot about delayed POs, inventory statuses, supplier performance..."
                    disabled={copilotLoading}
                    style={{
                      flex: 1,
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '0.375rem',
                      padding: '0.6rem 0.85rem',
                      fontSize: '0.78rem',
                      outline: 'none',
                      transition: 'all 0.15s'
                    }}
                    onFocus={e => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                    onBlur={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
                  />
                  <button 
                    type="submit"
                    data-testid="copilot-chat-send-btn"
                    disabled={copilotLoading || !copilotInput.trim()}
                    style={{ 
                      background: copilotLoading || !copilotInput.trim() ? 'var(--bg-surface-elevated)' : 'var(--color-primary)', 
                      border: 'none',
                      color: copilotLoading || !copilotInput.trim() ? 'var(--text-muted)' : '#ffffff', 
                      fontWeight: 700,
                      borderRadius: '0.375rem', 
                      padding: '0.6rem 1.25rem', 
                      fontSize: '0.78rem', 
                      cursor: copilotLoading || !copilotInput.trim() ? 'not-allowed' : 'pointer',
                      opacity: copilotLoading || !copilotInput.trim() ? 0.6 : 1,
                      transition: 'opacity 0.2s'
                    }}
                  >
                    Send
                  </button>
                </form>

              </div>

              {/* RIGHT SIDE: LIVE REFERENCE SYSTEM SUMMARY CARD (Hidden for demo mode) */}
              {false && (
              <div className="widget-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="widget-header" style={{ paddingBottom: '0.65rem' }}>
                  <h3 className="widget-title">Live Reference Ledger</h3>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Real-time values</span>
                </div>

                {ctLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                    <div style={{ width: '20px', height: '20px', border: '2px solid rgba(59,130,246,0.1)', borderTop: '2px solid var(--color-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {[
                      { label: 'Active Exceptions', value: ctData?.metrics?.activeExceptions || 0, icon: '⚠️', color: '#f87171' },
                      { label: 'Cumulative Exposure', value: `$${(ctData?.metrics?.financialExposure || 0).toLocaleString()}`, icon: '💰', color: '#60a5fa' },
                      { label: 'Total Overdue PO Lines', value: ctData?.metrics?.overduePoLines || 0, icon: '⏳', color: '#fb923c' },
                      { label: 'Total Overdue Spend', value: `$${(ctData?.metrics?.overduePoValue || 0).toLocaleString()}`, icon: '💰', color: '#fb923c' },
                      { label: 'Missing Supplier ACKs', value: ctData?.metrics?.missingAcks || 0, icon: '✉️', color: '#cbd5e1' },
                      { label: 'Part Shortages (Total)', value: ctData?.metrics?.totalPartShortages || 0, icon: '🔩', color: '#fca5a5' }
                    ].map(metric => (
                      <div key={metric.label} style={{ background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-color)', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{metric.icon} {metric.label}</span>
                        <span style={{ fontSize: '0.78rem', fontWeight: 800, color: metric.color }}>{metric.value}</span>
                      </div>
                    ))}
                    
                    <div style={{ marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                      <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>PLANT HEALTH RATINGS:</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {(ctData?.plantHealth || []).slice(0, 4).map((p: any) => (
                          <div key={p.plant} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>Plant {p.plant}</span>
                            <span style={{ 
                              color: p.status === 'OPTIMAL' ? '#34d399' : p.status === 'WARNING' ? '#fcd34d' : '#fca5a5',
                              fontWeight: 700 
                            }}>{p.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              )}

            </div>
          )}


          {/* TAB 9: AUTOMATED REMINDERS WORKFLOW AUTOMATION (Phase 4A & 4B) */}
          {activeTab === 'reminders' && (() => {
            const activeList = agentSubTab === 'overdue_po'
              ? remindersList
              : agentSubTab === 'ack_followup'
              ? ackFollowupQueue
              : escalationTriggers;
            const activeSentList = agentSubTab === 'overdue_po'
              ? sentRemindersList
              : agentSubTab === 'ack_followup'
              ? ackFollowupSentList
              : escalationHistory;
            const activeLoading = agentSubTab === 'overdue_po'
              ? remindersLoading
              : agentSubTab === 'ack_followup'
              ? ackFollowupLoading
              : escalationLoading;

            const isEscalation = agentSubTab === 'escalation';

            const filteredReminders = activeList.filter(r => {
              if (remindersFilter === 'PENDING') return r.approval_status === 'PENDING';
              if (remindersFilter === 'APPROVED') return r.approval_status === 'APPROVED';
              return true;
            });
            const totalFilteredPages = Math.ceil(filteredReminders.length / parseInt(remindersLimit)) || 1;
            const startIndex = (remindersPage - 1) * parseInt(remindersLimit);
            const paginatedReminders = filteredReminders.slice(startIndex, startIndex + parseInt(remindersLimit));

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">
                
                {/* TOP HEADER SUMMARY BAR */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>⚡</span> Automated Reminders Console
                    </h2>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
                      Monitor, verify, and batch-dispatch supplier reminder alerts for overdue and unacknowledged orders.
                    </p>
                  </div>
                  <button
                    onClick={triggerAgentSweep}
                    disabled={isScanning}
                    style={{
                      background: 'var(--color-primary)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '0.375rem',
                      padding: '0.5rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: isScanning ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'background 0.15s ease'
                    }}
                    onMouseEnter={(e) => { if (!isScanning) e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
                    onMouseLeave={(e) => { if (!isScanning) e.currentTarget.style.background = 'var(--color-primary)'; }}
                  >
                    {isScanning ? (
                      <>
                        <span className="spinner" style={{
                          width: '12px',
                          height: '12px',
                          border: '2px solid rgba(255,255,255,0.3)',
                          borderTop: '2px solid #ffffff',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'spin 0.8s linear infinite'
                        }} />
                        Scanning POs...
                      </>
                    ) : (
                      <>
                        <span>🔍</span> Trigger Agent Sweep
                      </>
                    )}
                  </button>
                </div>

                {/* ACTIVE AGENT REGISTRY GRID */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                  {/* CARD 1: OVERDUE PO REMINDER AGENT */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    opacity: agentSubTab === 'overdue_po' ? 1 : 0.8,
                    borderLeft: agentSubTab === 'overdue_po' ? '4px solid var(--color-primary)' : '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      background: 'rgba(37, 99, 235, 0.1)',
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--color-primary)'
                    }}>🤖</div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>Supplier Reminder Agent</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', margin: '0.2rem 0' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                        <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>Active & Monitoring</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Last run: 10m ago</span>
                    </div>
                  </div>

                  {/* CARD 2: ACKNOWLEDGEMENT FOLLOW-UP AGENT */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    opacity: agentSubTab === 'ack_followup' ? 1 : 0.8,
                    borderLeft: agentSubTab === 'ack_followup' ? '4px solid #10b981' : '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      background: 'rgba(16, 185, 129, 0.1)',
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#10b981'
                    }}>✍️</div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>Ack Follow-Up Agent</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', margin: '0.2rem 0' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                        <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>Active & Scanning</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Last run: 5m ago</span>
                    </div>
                  </div>

                  {/* CARD 3: SLA ESCALATION AGENT */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem',
                    opacity: agentSubTab === 'escalation' ? 1 : 0.8,
                    borderLeft: agentSubTab === 'escalation' ? '4px solid #f43f5e' : '1px solid var(--border-color)'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      background: 'rgba(244, 63, 94, 0.1)',
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f43f5e'
                    }}>🚨</div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>SLA Escalation Agent</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', margin: '0.2rem 0' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                        <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 600 }}>SLA Scanning</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Last run: 3m ago</span>
                    </div>
                  </div>

                  {/* CARD 4: AUTOMATION SETTINGS */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      background: 'rgba(14, 165, 233, 0.1)',
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#0ea5e9'
                    }}>⚙️</div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>Automation Settings</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', margin: '0.2rem 0' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Mode: Semi-Automated</span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Approval required</span>
                    </div>
                  </div>

                  {/* CARD 5: QUEUE METRICS */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}>
                    <div style={{
                      fontSize: '2rem',
                      background: 'rgba(245, 158, 11, 0.1)',
                      width: '50px',
                      height: '50px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#f59e0b'
                    }}>📋</div>
                    <div>
                      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0 }}>Queue Volume Metrics</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.2rem 0' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          Pending: <strong>{activeList.filter(r => r.approval_status === 'PENDING').length}</strong> | Staged: <strong>{activeList.filter(r => r.approval_status === 'APPROVED').length}</strong>
                        </span>
                      </div>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Sent Today: <strong>{activeSentList.length}</strong> dispatches</span>
                    </div>
                  </div>
                </div>

                {/* MAIN CONTENT AREA */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden'
                }}>

                  {/* AGENT SELECTION TAB BAR */}
                  <div style={{
                    display: 'flex',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-elevated)'
                  }}>
                    <button
                      onClick={() => { setAgentSubTab('overdue_po'); setRemindersPage(1); setSelectedIds([]); }}
                      style={{
                        flex: 1,
                        padding: '0.85rem 1rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: 'none',
                        borderBottom: agentSubTab === 'overdue_po' ? '3px solid var(--color-primary)' : '3px solid transparent',
                        background: agentSubTab === 'overdue_po' ? 'var(--bg-surface)' : 'transparent',
                        color: agentSubTab === 'overdue_po' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>⏰</span> Overdue PO Reminders Agent ({remindersList.length})
                    </button>
                    <button
                      onClick={() => { setAgentSubTab('ack_followup'); setRemindersPage(1); setSelectedIds([]); }}
                      style={{
                        flex: 1,
                        padding: '0.85rem 1rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: 'none',
                        borderBottom: agentSubTab === 'ack_followup' ? '3px solid var(--color-primary)' : '3px solid transparent',
                        background: agentSubTab === 'ack_followup' ? 'var(--bg-surface)' : 'transparent',
                        color: agentSubTab === 'ack_followup' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>✍️</span> Acknowledgement Follow-Up Agent ({ackFollowupQueue.length})
                    </button>
                    <button
                      onClick={() => { setAgentSubTab('escalation'); setRemindersPage(1); setSelectedIds([]); }}
                      style={{
                        flex: 1,
                        padding: '0.85rem 1rem',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        border: 'none',
                        borderBottom: agentSubTab === 'escalation' ? '3px solid var(--color-primary)' : '3px solid transparent',
                        background: agentSubTab === 'escalation' ? 'var(--bg-surface)' : 'transparent',
                        color: agentSubTab === 'escalation' ? 'var(--color-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>🚨</span> SLA Escalation Agent ({escalationTriggers.length})
                    </button>
                  </div>
                  
                  {/* TABLE HEADER & FILTER TABS */}
                  <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    background: 'var(--bg-surface-elevated)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => { setRemindersFilter('ALL'); setRemindersPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          border: '1px solid ' + (remindersFilter === 'ALL' ? 'var(--color-primary)' : 'var(--border-color)'),
                          background: remindersFilter === 'ALL' ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                          color: remindersFilter === 'ALL' ? 'var(--color-primary)' : 'var(--text-secondary)',
                          borderRadius: '0.25rem',
                          cursor: 'pointer'
                        }}
                      >
                        All Pending ({activeList.length})
                      </button>
                      <button
                        onClick={() => { setRemindersFilter('PENDING'); setRemindersPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          border: '1px solid ' + (remindersFilter === 'PENDING' ? 'var(--color-primary)' : 'var(--border-color)'),
                          background: remindersFilter === 'PENDING' ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                          color: remindersFilter === 'PENDING' ? 'var(--color-primary)' : 'var(--text-secondary)',
                          borderRadius: '0.25rem',
                          cursor: 'pointer'
                        }}
                      >
                        Requires Review ({activeList.filter(r => r.approval_status === 'PENDING').length})
                      </button>
                      <button
                        onClick={() => { setRemindersFilter('APPROVED'); setRemindersPage(1); }}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          border: '1px solid ' + (remindersFilter === 'APPROVED' ? 'var(--color-primary)' : 'var(--border-color)'),
                          background: remindersFilter === 'APPROVED' ? 'var(--color-primary-light)' : 'var(--bg-surface)',
                          color: remindersFilter === 'APPROVED' ? 'var(--color-primary)' : 'var(--text-secondary)',
                          borderRadius: '0.25rem',
                          cursor: 'pointer'
                        }}
                      >
                        Ready to Dispatch ({activeList.filter(r => r.approval_status === 'APPROVED').length})
                      </button>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Show:</span>
                        <select
                          value={remindersLimit}
                          onChange={(e) => {
                            setRemindersLimit(e.target.value);
                            setRemindersPage(1);
                          }}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.25rem',
                            padding: '0.2rem 0.4rem',
                            fontSize: '0.7rem',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="10">10 entries</option>
                          <option value="25">25 entries</option>
                          <option value="50">50 entries</option>
                          <option value="100">100 entries</option>
                        </select>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Checkbox select items to enable batch actions.
                      </span>
                    </div>
                  </div>

                  {/* REMINDERS LIST TABLE */}
                  <div style={{ overflowX: 'auto', maxHeight: '550px', overflowY: 'auto', borderBottom: '1px solid var(--border-color)' }}>
                    {activeLoading ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <span className="spinner" style={{
                          width: '24px',
                          height: '24px',
                          border: '3px solid rgba(37,99,235,0.1)',
                          borderTop: '3px solid var(--color-primary)',
                          borderRadius: '50%',
                          display: 'inline-block',
                          animation: 'spin 0.8s linear infinite',
                          marginBottom: '0.5rem'
                        }} />
                        <p style={{ fontSize: '0.75rem' }}>Synchronizing reminder queue...</p>
                      </div>
                    ) : filteredReminders.length === 0 ? (
                      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <p style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🏖️</p>
                        <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>All reminder queues are clear.</p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>No overdue purchase orders or missing confirmations meet the auto-escalation criteria right now.</p>
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem', tableLayout: 'fixed' }}>
                        <thead style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)', position: 'sticky', top: 0, zIndex: 10 }}>
                          <tr>
                            <th style={{ padding: '0.75rem 0.5rem', width: '50px', paddingLeft: '1rem', background: 'var(--bg-surface-elevated)' }}>
                              <input
                                type="checkbox"
                                checked={
                                  paginatedReminders.length > 0 &&
                                  paginatedReminders.every(r => selectedIds.includes(isEscalation ? r.escalation_id : r.recommendation_id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    const pageIds = paginatedReminders.map(r => isEscalation ? r.escalation_id : r.recommendation_id);
                                    setSelectedIds(Array.from(new Set([...selectedIds, ...pageIds])));
                                  } else {
                                    const pageIds = paginatedReminders.map(r => isEscalation ? r.escalation_id : r.recommendation_id);
                                    setSelectedIds(selectedIds.filter(id => !pageIds.includes(id)));
                                  }
                                }}
                                style={{ cursor: 'pointer' }}
                              />
                            </th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '90px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface-elevated)' }}>PO & Item</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '130px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface-elevated)' }}>Supplier Vendor</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '130px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface-elevated)' }}>Material Part</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '70px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: 'var(--bg-surface-elevated)' }}>Open Val</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '75px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'right', background: 'var(--bg-surface-elevated)' }}>
                              {agentSubTab === 'overdue_po' ? 'Aging' : agentSubTab === 'ack_followup' ? 'Days Missing' : 'Days Past SLA'}
                            </th>
                            {agentSubTab === 'ack_followup' && (
                              <th style={{ padding: '0.75rem 0.5rem', width: '70px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', background: 'var(--bg-surface-elevated)' }}>Followups</th>
                            )}
                            {agentSubTab === 'escalation' && (
                              <>
                                <th style={{ padding: '0.75rem 0.5rem', width: '75px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', background: 'var(--bg-surface-elevated)' }}>Level</th>
                                <th style={{ padding: '0.75rem 0.5rem', width: '100px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface-elevated)' }}>Escalated To</th>
                              </>
                            )}
                            {agentSubTab !== 'escalation' && (
                              <th style={{ padding: '0.75rem 0.5rem', width: '80px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', background: 'var(--bg-surface-elevated)' }}>Confidence</th>
                            )}
                            <th style={{ padding: '0.75rem 0.5rem', width: '110px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, background: 'var(--bg-surface-elevated)' }}>Status Badge</th>
                            <th style={{ padding: '0.75rem 0.5rem', width: '140px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600, paddingRight: '1rem', textAlign: 'right', background: 'var(--bg-surface-elevated)' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedReminders.map((reminder, idx) => {
                            const isSelected = selectedIds.includes(isEscalation ? reminder.escalation_id : reminder.recommendation_id);
                            const currentId = isEscalation ? reminder.escalation_id : reminder.recommendation_id;
                            const isPending = isEscalation ? reminder.escalation_status === 'PENDING' : reminder.approval_status === 'PENDING';
                            const status = isEscalation ? reminder.escalation_status : reminder.approval_status;
                            return (
                              <tr
                                key={currentId}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  background: isSelected ? 'rgba(37, 99, 235, 0.05)' : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                  transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = 'rgba(0, 0, 0, 0.015)';
                                }}
                                onMouseLeave={(e) => {
                                  if (!isSelected) e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)';
                                }}
                              >
                                <td style={{ padding: '0.65rem 0.5rem', paddingLeft: '1rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedIds([...selectedIds, currentId]);
                                      } else {
                                        setSelectedIds(selectedIds.filter(id => id !== currentId));
                                      }
                                    }}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </td>
                                <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>
                                  {reminder.po_number}
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>
                                    Item: {reminder.item_number || '00010'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                  <span style={{ fontWeight: 600 }}>{reminder.supplier_name}</span>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>
                                    ID: {reminder.supplier_id}
                                  </span>
                                </td>
                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                  <span style={{ fontWeight: 600 }}>{reminder.material_id}</span>
                                  <span style={{
                                    fontSize: '0.65rem',
                                    color: 'var(--text-muted)',
                                    display: 'block',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {reminder.material_description}
                                  </span>
                                </td>
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right', fontWeight: 600 }}>
                                  ${Math.round(reminder.open_value).toLocaleString()}
                                </td>
                                <td style={{ padding: '0.65rem 0.5rem', textAlign: 'right' }}>
                                  <span style={{
                                    padding: '0.15rem 0.35rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    background: isEscalation
                                      ? (reminder.escalation_level === 'LEVEL_3' ? '#fecaca' : reminder.escalation_level === 'LEVEL_2' ? '#ffedd5' : '#e0f2fe')
                                      : (reminder.days_overdue > 7 ? 'var(--severity-critical-bg)' : 'var(--severity-high-bg)'),
                                    color: isEscalation
                                      ? (reminder.escalation_level === 'LEVEL_3' ? '#b91c1c' : reminder.escalation_level === 'LEVEL_2' ? '#c2410c' : '#0369a1')
                                      : (reminder.days_overdue > 7 ? 'var(--severity-critical-text)' : 'var(--severity-high-text)'),
                                    border: '1px solid ' + (isEscalation
                                      ? (reminder.escalation_level === 'LEVEL_3' ? '#fca5a5' : reminder.escalation_level === 'LEVEL_2' ? '#fed7aa' : '#bae6fd')
                                      : (reminder.days_overdue > 7 ? 'var(--severity-critical-border)' : 'var(--severity-high-border)'))
                                  }}>
                                    {isEscalation ? reminder.days_past_sla : reminder.days_overdue} days
                                  </span>
                                </td>
                                {agentSubTab === 'ack_followup' && (
                                  <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center', fontWeight: 600 }}>
                                    {reminder.buyer_followup_count}
                                  </td>
                                )}
                                {agentSubTab === 'escalation' && (
                                  <>
                                    <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                      <span style={{
                                        padding: '0.15rem 0.4rem',
                                        borderRadius: '0.25rem',
                                        fontSize: '0.65rem',
                                        fontWeight: 700,
                                        background: reminder.escalation_level === 'LEVEL_3' ? 'rgba(244, 63, 94, 0.1)' : reminder.escalation_level === 'LEVEL_2' ? 'rgba(249, 115, 22, 0.1)' : 'rgba(14, 165, 233, 0.1)',
                                        color: reminder.escalation_level === 'LEVEL_3' ? '#e11d48' : reminder.escalation_level === 'LEVEL_2' ? '#ea580c' : '#0284c7',
                                        border: '1px solid ' + (reminder.escalation_level === 'LEVEL_3' ? 'rgba(244, 63, 94, 0.2)' : reminder.escalation_level === 'LEVEL_2' ? 'rgba(249, 115, 22, 0.2)' : 'rgba(14, 165, 233, 0.2)')
                                      }}>
                                        {reminder.escalation_level}
                                      </span>
                                    </td>
                                    <td style={{ padding: '0.65rem 0.5rem', fontWeight: 600 }}>
                                      {reminder.escalated_to}
                                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'block' }}>
                                        Buyer: {reminder.assigned_buyer}
                                      </span>
                                    </td>
                                  </>
                                )}
                                {agentSubTab !== 'escalation' && (
                                  <td style={{ padding: '0.65rem 0.5rem', textAlign: 'center' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.15rem' }}>
                                      <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{Math.round(reminder.confidence_score * 100)}%</span>
                                      <div style={{ width: '40px', background: 'var(--bg-surface-elevated)', height: '4px', borderRadius: '2px', overflow: 'hidden' }}>
                                        <div style={{ width: `${reminder.confidence_score * 100}%`, background: 'var(--color-primary)', height: '100%' }} />
                                      </div>
                                    </div>
                                  </td>
                                )}
                                <td style={{ padding: '0.65rem 0.5rem' }}>
                                  <span style={{
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    background: status === 'APPROVED' ? 'rgba(16, 185, 129, 0.1)' : status === 'ESCALATED' ? 'rgba(244, 63, 94, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                    color: status === 'APPROVED' ? '#10b981' : status === 'ESCALATED' ? '#f43f5e' : '#f59e0b',
                                    border: '1px solid ' + (status === 'APPROVED' ? 'rgba(16, 185, 129, 0.3)' : status === 'ESCALATED' ? 'rgba(244, 63, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)')
                                  }}>
                                    {status === 'APPROVED' ? 'Staged' : status === 'ESCALATED' ? 'Escalated' : 'Review'}
                                  </span>
                                </td>
                                <td style={{ padding: '0.65rem 0.5rem', paddingRight: '1rem', textAlign: 'right' }}>
                                  <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                                    <button
                                      onClick={() => setEditingReminder(reminder)}
                                      style={{
                                        background: 'var(--bg-surface)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '0.25rem',
                                        padding: '0.25rem 0.5rem',
                                        fontSize: '0.65rem',
                                        cursor: 'pointer',
                                        color: 'var(--text-secondary)'
                                      }}
                                    >
                                      📝 Edit Draft
                                    </button>
                                    {isPending ? (
                                      <button
                                        onClick={() => handleApproveReminder(currentId, reminder.draft_subject, reminder.draft_message)}
                                        style={{
                                          background: 'rgba(16, 185, 129, 0.1)',
                                          border: '1px solid rgba(16, 185, 129, 0.3)',
                                          borderRadius: '0.25rem',
                                          color: '#10b981',
                                          padding: '0.25rem 0.5rem',
                                          fontSize: '0.65rem',
                                          fontWeight: 600,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        ✓ Approve
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => handleSendReminders([currentId])}
                                        style={{
                                          background: 'rgba(37, 99, 235, 0.1)',
                                          border: '1px solid rgba(37, 99, 235, 0.3)',
                                          borderRadius: '0.25rem',
                                          color: 'var(--color-primary)',
                                          padding: '0.25rem 0.5rem',
                                          fontSize: '0.65rem',
                                          fontWeight: 600,
                                          cursor: 'pointer'
                                        }}
                                      >
                                        🚀 Dispatch
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PAGINATION CONTROLS */}
                  {!remindersLoading && filteredReminders.length > 0 && (
                    <div style={{
                      padding: '1rem',
                      borderTop: '1px solid var(--border-color)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.725rem',
                      background: 'rgba(255, 255, 255, 0.005)'
                    }}>
                      <div style={{ color: 'var(--text-secondary)' }}>
                        Showing <strong>{((remindersPage - 1) * parseInt(remindersLimit)) + 1}</strong> to <strong>{Math.min(remindersPage * parseInt(remindersLimit), filteredReminders.length)}</strong> of <strong>{filteredReminders.length.toLocaleString()}</strong> entries
                      </div>
                      
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {/* Prev Button */}
                        <button
                          disabled={remindersPage === 1}
                          onClick={() => setRemindersPage(p => Math.max(1, p - 1))}
                          style={{
                            background: remindersPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            color: remindersPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: remindersPage === 1 ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Previous
                        </button>

                        {/* Page Numbers */}
                        {(() => {
                          const startPage = Math.max(1, remindersPage - 2);
                          const endPage = Math.min(totalFilteredPages, startPage + 4);
                          const adjustedStart = Math.max(1, endPage - 4);
                          
                          const buttons = [];
                          for (let i = adjustedStart; i <= endPage; i++) {
                            buttons.push(i);
                          }
                          
                          return buttons.map(num => (
                            <button
                              key={num}
                              onClick={() => setRemindersPage(num)}
                              style={{
                                background: remindersPage === num ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                                border: remindersPage === num ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                color: remindersPage === num ? '#ffffff' : 'var(--text-primary)',
                                padding: '0.3rem 0.65rem',
                                borderRadius: '0.25rem',
                                cursor: 'pointer',
                                fontWeight: remindersPage === num ? 700 : 500,
                                transition: 'all 0.15s'
                              }}
                            >
                              {num}
                            </button>
                          ));
                        })()}

                        {/* Next Button */}
                        <button
                          disabled={remindersPage === totalFilteredPages}
                          onClick={() => setRemindersPage(p => Math.min(totalFilteredPages, p + 1))}
                          style={{
                            background: remindersPage === totalFilteredPages ? 'transparent' : 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            color: remindersPage === totalFilteredPages ? 'var(--text-muted)' : 'var(--text-primary)',
                            padding: '0.3rem 0.6rem',
                            borderRadius: '0.25rem',
                            cursor: remindersPage === totalFilteredPages ? 'not-allowed' : 'pointer',
                            fontWeight: 600,
                            transition: 'background 0.15s'
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* SENT DISPATCH HISTORY LEDGER */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>📬</span> Dispatch Log & Communication Ledger
                  </h3>
                  <div style={{ overflowX: 'auto', maxHeight: '350px', overflowY: 'auto' }}>
                    {activeSentList.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.725rem' }}>
                        No communications have been dispatched during this session.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.725rem', textAlign: 'left' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-surface-elevated)' }}>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '0.5rem', width: '120px', background: 'var(--bg-surface-elevated)' }}>Receipt ID</th>
                            <th style={{ padding: '0.5rem', width: '100px', background: 'var(--bg-surface-elevated)' }}>PO / Item</th>
                            <th style={{ padding: '0.5rem', width: '150px', background: 'var(--bg-surface-elevated)' }}>Supplier</th>
                            <th style={{ padding: '0.5rem', background: 'var(--bg-surface-elevated)' }}>Subject Line</th>
                            <th style={{ padding: '0.5rem', width: '100px', textAlign: 'center', background: 'var(--bg-surface-elevated)' }}>Channel</th>
                            <th style={{ padding: '0.5rem', width: '100px', textAlign: 'right', background: 'var(--bg-surface-elevated)' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeSentList.map((log, idx) => {
                            const logId = isEscalation ? log.escalation_id : log.recommendation_id;
                            const prefix = agentSubTab === 'overdue_po' ? 'REM' : agentSubTab === 'ack_followup' ? 'ACK' : 'ESC';
                            return (
                              <tr key={logId} style={{ borderBottom: '1px solid var(--border-color)', background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.005)' }}>
                                <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontWeight: 600 }}>TRK-{prefix}-{log.po_number}-{logId.slice(-4)}</td>
                                <td style={{ padding: '0.5rem' }}>PO {log.po_number} / {log.item_number || '00010'}</td>
                                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{log.supplier_name}</td>
                                <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>{log.draft_subject}</td>
                                <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                  <span style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.1rem 0.3rem', borderRadius: '0.15rem', fontSize: '0.6rem', fontWeight: 600 }}>EMAIL</span>
                                </td>
                                <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600, color: '#10b981' }}>{agentSubTab === 'escalation' ? '✓ ESCALATED' : '✓ DISPATCHED'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* BATCH ACTIONS STICKY DRAWER */}
                {selectedIds.length > 0 && (
                  <div style={{
                    position: 'fixed',
                    zoom: 0.85,
                    bottom: 'calc(1.5rem / 0.85)',
                    left: 'calc(280px / 0.85)',
                    right: 'calc(2rem / 0.85)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1rem 1.5rem',
                    boxShadow: 'var(--shadow-lg)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    zIndex: 100,
                    animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <span style={{ fontSize: '1.25rem' }}>👉</span>
                      <div>
                        <strong style={{ fontSize: '0.85rem' }}>{selectedIds.length} item(s) selected</strong>
                        <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                          Execute bulk approvals or dispatch alerts immediately.
                        </span>
                      </div>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => setSelectedIds([])}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: '0.375rem',
                          color: 'var(--text-secondary)',
                          padding: '0.45rem 1rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Deselect
                      </button>
                      <button
                        onClick={() => handleBatchApprove(selectedIds)}
                        style={{
                          background: 'rgba(16, 185, 129, 0.1)',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                          borderRadius: '0.375rem',
                          color: '#10b981',
                          padding: '0.45rem 1rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Approve Selected
                      </button>
                      <button
                        onClick={() => handleSendReminders(selectedIds)}
                        style={{
                          background: 'var(--color-primary)',
                          border: 'none',
                          borderRadius: '0.375rem',
                          color: '#ffffff',
                          padding: '0.45rem 1.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; }}
                      >
                        🚀 Dispatch Selected
                      </button>
                    </div>
                  </div>
                )}

                {/* DRAFT REVIEW SANDBOX MODAL */}
                {editingReminder && (
                  <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    animation: 'fadeIn 0.15s ease-out'
                  }}>
                    <div style={{
                      zoom: 0.85,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.625rem',
                      width: '600px',
                      maxWidth: '90vw',
                      boxShadow: 'var(--shadow-lg)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{
                        padding: '1.25rem',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-surface-elevated)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>✉️ Edit Reminder Notification Draft</h3>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            PO {editingReminder.po_number} | {editingReminder.supplier_name}
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingReminder(null)}
                          style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Subject Line</label>
                          <input
                            type="text"
                            value={editingReminder.draft_subject}
                            onChange={(e) => setEditingReminder({ ...editingReminder, draft_subject: e.target.value })}
                            style={{
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.375rem',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.78rem',
                              color: 'var(--text-primary)',
                              outline: 'none'
                            }}
                          />
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Message Body</label>
                          <textarea
                            rows={8}
                            value={editingReminder.draft_message}
                            onChange={(e) => setEditingReminder({ ...editingReminder, draft_message: e.target.value })}
                            style={{
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.375rem',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.78rem',
                              color: 'var(--text-primary)',
                              fontFamily: 'inherit',
                              lineHeight: 1.4,
                              outline: 'none',
                              resize: 'vertical'
                            }}
                          />
                        </div>
                      </div>

                      <div style={{
                        padding: '1rem 1.25rem',
                        borderTop: '1px solid var(--border-color)',
                        background: 'var(--bg-surface-elevated)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.5rem'
                      }}>
                        <button
                          onClick={() => setEditingReminder(null)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.375rem',
                            color: 'var(--text-secondary)',
                            padding: '0.45rem 1rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleApproveReminder(isEscalation ? editingReminder.escalation_id : editingReminder.recommendation_id, editingReminder.draft_subject, editingReminder.draft_message)}
                          style={{
                            background: 'var(--color-primary)',
                            border: 'none',
                            borderRadius: '0.375rem',
                            color: '#ffffff',
                            padding: '0.45rem 1.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; }}
                        >
                          Save & Approve
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            );
          })()}


          {/* TAB 10: PLANNER COLLABORATION WORKSPACE (Phase 4D) */}
          {activeTab === 'collaboration' && (() => {
            const activeList = coordinationActive;
            const historyList = coordinationHistory;
            const isLoading = coordinationLoading;

            const filteredAlerts = activeList.filter(a => {
              if (coordinationFilter === 'UNRESOLVED') return a.coordination_status === 'UNRESOLVED';
              if (coordinationFilter === 'IN_COORDINATION') return a.coordination_status === 'IN_COORDINATION';
              return true;
            });

            const activeStoppages = activeList.filter(a => a.impact_level === 'PRODUCTION_STOPPAGE').length;
            const activeShortages = activeList.filter(a => a.impact_level === 'CRITICAL_SHORTAGE').length;
            const activeWarnings = activeList.filter(a => a.impact_level === 'WARNING').length;

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">
                
                {/* Header Summary */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>🤝</span> Buyer-Planner Collaboration Desk
                    </h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>
                      Automated agent alerts mapping purchase order disruptions to warehouse safety stock breaches.
                    </p>
                  </div>
                  <button
                    onClick={loadCoordinationData}
                    disabled={isLoading}
                    style={{
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '0.375rem',
                      padding: '0.45rem 1rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      opacity: isLoading ? 0.6 : 1
                    }}
                  >
                    🔄 Refresh Alerts
                  </button>
                </div>

                {/* Metrics Bar */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '0.75rem'
                }}>
                  {[
                    { title: 'Active Alert Threads', value: activeList.length, desc: 'Unresolved coordination tasks', color: 'var(--color-primary)' },
                    { title: 'Critical Stoppages', value: activeStoppages, desc: 'Stock deficit < 20% of safety', color: '#f43f5e', alert: activeStoppages > 0 },
                    { title: 'Safety Stock Breaches', value: activeShortages, desc: 'Stock below safety threshold', color: '#fb923c', alert: activeShortages > 0 },
                    { title: 'Resolved Threads', value: historyList.length, desc: 'Archived resolution logs', color: '#10b981' }
                  ].map((card, i) => (
                    <div key={i} style={{
                      background: 'var(--bg-surface)',
                      border: card.alert ? '1px solid rgba(244,63,94,0.4)' : '1px solid var(--border-color)',
                      borderRadius: '0.5rem',
                      padding: '1rem 1.25rem',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {card.title}
                      </span>
                      <span style={{ fontSize: '1.5rem', fontWeight: 700, color: card.color, margin: '0.25rem 0' }}>
                        {card.value}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {card.desc}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Workspace Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                  
                  {/* Left Main Alert Deck */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {/* Controls Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => setCoordinationFilter('ALL')}
                          style={{
                            background: coordinationFilter === 'ALL' ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          All Active ({activeList.length})
                        </button>
                        <button
                          onClick={() => setCoordinationFilter('UNRESOLVED')}
                          style={{
                            background: coordinationFilter === 'UNRESOLVED' ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Unresolved ({activeList.filter(a => a.coordination_status === 'UNRESOLVED').length})
                        </button>
                        <button
                          onClick={() => setCoordinationFilter('IN_COORDINATION')}
                          style={{
                            background: coordinationFilter === 'IN_COORDINATION' ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          In Coordination ({activeList.filter(a => a.coordination_status === 'IN_COORDINATION').length})
                        </button>
                      </div>

                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Showing {filteredAlerts.length} active threads
                      </div>
                    </div>

                    {/* Loading State */}
                    {isLoading ? (
                      <div style={{ padding: '3rem', textAlign: 'center' }}>
                        <div className="spinner" style={{ width: '30px', height: '30px', margin: '0 auto 1rem auto' }} />
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Loading coordination alerts...</span>
                      </div>
                    ) : filteredAlerts.length === 0 ? (
                      <div style={{
                        padding: '3rem 1.5rem',
                        textAlign: 'center',
                        border: '1px dashed var(--border-color)',
                        borderRadius: '0.375rem',
                        background: 'var(--bg-surface-elevated)'
                      }}>
                        <span style={{ fontSize: '1.5rem' }}>🟢</span>
                        <h4 style={{ fontSize: '0.85rem', fontWeight: 700, margin: '0.5rem 0 0.25rem 0' }}>No Alerts Sourced</h4>
                        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>All parts currently satisfy safety stock targets or pending disruptions are cleared.</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {filteredAlerts.map(alert => {
                          let badgeBg = 'rgba(239, 68, 68, 0.08)';
                          let badgeText = '#ef4444';
                          let levelLabel = 'Critical Stoppage';
                          if (alert.impact_level === 'CRITICAL_SHORTAGE') {
                            badgeBg = 'rgba(249, 115, 22, 0.08)';
                            badgeText = '#f97316';
                            levelLabel = 'Safety Deficit';
                          } else if (alert.impact_level === 'WARNING') {
                            badgeBg = 'rgba(234, 179, 8, 0.08)';
                            badgeText = '#eab308';
                            levelLabel = 'Supply Warning';
                          }

                          const isSelected = selectedAlert && selectedAlert.alert_id === alert.alert_id;

                          return (
                            <div
                              key={alert.alert_id}
                              onClick={() => setSelectedAlert(alert)}
                              style={{
                                background: isSelected ? 'rgba(79, 70, 229, 0.03)' : 'var(--bg-surface-elevated)',
                                border: isSelected ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                                borderRadius: '0.375rem',
                                padding: '0.85rem 1rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center'
                              }}
                              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'; }}
                              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                            >
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <span style={{
                                    background: badgeBg,
                                    color: badgeText,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '0.2rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    {levelLabel}
                                  </span>
                                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                    PO {alert.po_number} | Line {alert.item_number}
                                  </span>
                                </div>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {alert.material_id} — {alert.material_description}
                                </span>
                                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                  Plant {alert.plant} | Buyer: {alert.assigned_buyer}
                                </span>
                              </div>

                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', marginLeft: '1rem' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                  Stock: <span style={{ color: alert.current_stock < alert.safety_stock ? '#fb7185' : '#34d399' }}>{alert.current_stock}</span> / {alert.safety_stock} pcs
                                </div>
                                <span style={{
                                  background: alert.coordination_status === 'IN_COORDINATION' ? 'rgba(59, 130, 246, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                                  color: alert.coordination_status === 'IN_COORDINATION' ? '#60a5fa' : 'var(--text-muted)',
                                  padding: '0.1rem 0.35rem',
                                  borderRadius: '0.2rem',
                                  fontSize: '0.625rem',
                                  fontWeight: 600
                                }}>
                                  {alert.coordination_status.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* History log block */}
                  <div style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '0.5rem',
                    padding: '1.25rem',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span>📜</span> Resolved Coordination Log History
                    </h3>

                    {historyList.length === 0 ? (
                      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                        No historical resolutions recorded.
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto' }}>
                        {historyList.map(hist => (
                          <div key={hist.alert_id} style={{
                            background: 'var(--bg-surface-elevated)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.375rem',
                            padding: '0.75rem 1rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            fontSize: '0.75rem'
                          }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', flex: 1 }}>
                              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{hist.material_id}</span>
                                <span style={{ color: 'var(--text-muted)' }}>PO {hist.po_number}</span>
                              </div>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                                Pathway: <strong style={{ color: 'var(--color-primary)' }}>{hist.planner_action.replace(/_/g, ' ')}</strong>
                              </span>
                              {hist.buyer_notes && (
                                <p style={{ margin: '0.2rem 0 0 0', padding: '0.25rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '0.25rem', fontSize: '0.68rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                  "{hist.buyer_notes}"
                                </p>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                              <span>{formatDate(hist.updated_at)}</span>
                              <span style={{ color: '#10b981', fontWeight: 600 }}>RESOLVED</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>

                {/* VIEWPORT FIXED SLIDE-OUT DETAIL PANEL DRAWER */}
                <div style={{
                  position: 'fixed',
                  zoom: 0.85,
                  top: 'calc(1.25rem / 0.85)',
                  right: selectedAlert ? 'calc(1.25rem / 0.85)' : '-600px',
                  width: '450px',
                  height: 'calc((100vh - 2.5rem) / 0.85)',
                  opacity: selectedAlert ? 1 : 0,
                  transition: 'right 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s',
                  background: 'var(--bg-surface)',
                  borderLeft: selectedAlert ? '1px solid var(--border-color)' : 'none',
                  borderRadius: '0.5rem',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  boxShadow: 'var(--shadow-drawer)',
                  zIndex: 100
                }}>
                  {selectedAlert && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '450px' }}>
                      
                      {/* Drawer Header */}
                      <div style={{
                        padding: '1rem',
                        borderBottom: '1px solid var(--border-color)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--bg-surface-elevated)'
                      }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Buyer-Planner Coordination
                          </h3>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            Alert {selectedAlert.alert_id} | PO {selectedAlert.po_number}
                          </span>
                        </div>
                        <button
                          onClick={() => setSelectedAlert(null)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            fontSize: '1.2rem',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                            outline: 'none'
                          }}
                        >
                          ×
                        </button>
                      </div>

                      {/* Drawer Content Body */}
                      <div style={{
                        padding: '1.25rem',
                        overflowY: 'auto',
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '1.25rem'
                      }}>
                        
                        {/* Material Info Block */}
                        <div>
                          <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Material Details</span>
                          <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: '0.2rem 0' }}>{selectedAlert.material_id}</h4>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedAlert.material_description}</p>
                          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            <span>Plant: <strong>{selectedAlert.plant}</strong></span>
                            <span>Buyer: <strong>{selectedAlert.assigned_buyer}</strong></span>
                          </div>
                        </div>

                        {/* Inventory & Deficit Visual Meter */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                            <span>Safety Stock Deficit</span>
                            <span>{selectedAlert.current_stock} / {selectedAlert.safety_stock} pcs</span>
                          </div>
                          
                          {/* Meter Track */}
                          <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'var(--bg-main)',
                            borderRadius: '999px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            marginBottom: '0.35rem'
                          }}>
                            {(() => {
                              const max = selectedAlert.safety_stock || 1;
                              const pct = Math.min(100, Math.round((selectedAlert.current_stock / max) * 100));
                              let barColor = '#34d399';
                              if (selectedAlert.impact_level === 'PRODUCTION_STOPPAGE') barColor = '#fb7185';
                              else if (selectedAlert.impact_level === 'CRITICAL_SHORTAGE') barColor = '#fdba74';
                              
                              return (
                                <div style={{
                                  width: `${pct}%`,
                                  height: '100%',
                                  backgroundColor: barColor,
                                  borderRadius: '999px',
                                  transition: 'width 0.3s ease'
                                }} />
                              );
                            })()}
                          </div>

                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                            <span>Current Stock: {selectedAlert.current_stock} pcs</span>
                            <span>Deficit: {Math.max(0, selectedAlert.safety_stock - selectedAlert.current_stock)} pcs</span>
                          </div>
                        </div>

                        {/* Dynamic MRP Timeline */}
                        <div>
                          <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Upcoming Demand & Receipt Timeline (MRP)</span>
                          
                          {coordMrpTimelineLoading ? (
                            <div style={{ padding: '1rem 0', textAlign: 'center' }}>
                              <div className="spinner" style={{ width: '20px', height: '20px', margin: '0 auto' }} />
                            </div>
                          ) : coordMrpTimelineData && coordMrpTimelineData.timeline?.length > 0 ? (
                            <div style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '0.4rem',
                              marginTop: '0.5rem',
                              background: 'var(--bg-main)',
                              padding: '0.5rem',
                              borderRadius: '0.25rem',
                              border: '1px solid var(--border-color)',
                              maxHeight: '180px',
                              overflowY: 'auto'
                            }}>
                              {coordMrpTimelineData.timeline.map((el: any, index: number) => {
                                const isReceipt = el.mrp_element_type === 'POITEM';
                                const sign = isReceipt ? '+' : '-';
                                const color = isReceipt ? '#34d399' : '#fb7185';
                                
                                return (
                                  <div key={index} style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    fontSize: '0.6875rem',
                                    borderBottom: index === coordMrpTimelineData.timeline.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)',
                                    padding: '0.25rem 0'
                                  }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                        {isReceipt ? '📬 PO Receipt' : '🏭 Requirement'}
                                      </span>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                        Date: {formatDate(el.requirement_date)} | Ref: {el.mrp_element_ref}
                                      </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                      <strong style={{ color }}>
                                        {sign}{isReceipt ? el.receipt_qty : el.requirement_qty} pcs
                                      </strong>
                                      <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                                        Proj: {el.projected_qty}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.7rem', color: 'var(--text-muted)' }}>No upcoming demand/schedules logged for this part.</p>
                          )}
                        </div>

                        {/* Planner Agent System Message */}
                        <div style={{
                          background: 'rgba(236, 72, 153, 0.03)',
                          borderLeft: '3px solid #ec4899',
                          borderRadius: '0.25rem',
                          padding: '0.75rem 1rem'
                        }}>
                          <span style={{ display: 'block', fontSize: '0.625rem', color: '#ec4899', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>
                            🤖 PLANNER AGENT BRIEFING NOTES
                          </span>
                          <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            {selectedAlert.planner_message}
                          </p>
                        </div>

                        {/* Resolution Inputs Panel */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
                          
                          {/* Resolution Pathway Selector */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Resolution Action Pathway
                            </label>
                            <select
                              value={resolutionAction}
                              onChange={(e) => setResolutionAction(e.target.value as any)}
                              style={{
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.25rem',
                                color: 'var(--text-primary)',
                                fontSize: '0.75rem',
                                padding: '0.4rem 0.5rem',
                                outline: 'none'
                              }}
                            >
                              <option value="NONE">Select coordination resolution...</option>
                              <option value="EXPEDITE_PO">Proactively Expedite Overdue Purchase Order</option>
                              <option value="USE_ALTERNATE_SOURCE">Source from Backup / Alternate Supplier</option>
                              <option value="ADJUST_PRODUCTION">Re-schedule / Adjust Production Run</option>
                            </select>
                          </div>

                          {/* Remarks Comment box */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                            <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                              Coordination Activity Log Comments
                            </label>
                            <textarea
                              rows={4}
                              placeholder="Log remarks on alignment with Planner, expected recovery dates, or alternative options..."
                              value={buyerNotesInput}
                              onChange={(e) => setBuyerNotesInput(e.target.value)}
                              style={{
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.25rem',
                                color: 'var(--text-primary)',
                                fontSize: '0.75rem',
                                padding: '0.4rem 0.5rem',
                                fontFamily: 'inherit',
                                outline: 'none',
                                resize: 'none'
                              }}
                            />
                          </div>

                        </div>

                      </div>

                      {/* Drawer Footer Actions */}
                      <div style={{
                        padding: '1rem',
                        borderTop: '1px solid var(--border-color)',
                        background: 'var(--bg-surface-elevated)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.5rem'
                      }}>
                        <button
                          onClick={() => handleUpdateCoordinationAlert(selectedAlert.alert_id, 'IN_COORDINATION', buyerNotesInput, resolutionAction)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.375rem',
                            color: 'var(--text-primary)',
                            padding: '0.45rem 1rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Save Notes
                        </button>
                        
                        <button
                          onClick={() => handleUpdateCoordinationAlert(selectedAlert.alert_id, 'RESOLVED', buyerNotesInput, resolutionAction)}
                          disabled={resolutionAction === 'NONE'}
                          style={{
                            background: 'var(--color-primary)',
                            border: 'none',
                            borderRadius: '0.375rem',
                            color: '#ffffff',
                            padding: '0.45rem 1.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: resolutionAction === 'NONE' ? 'not-allowed' : 'pointer',
                            opacity: resolutionAction === 'NONE' ? 0.5 : 1
                          }}
                        >
                          Resolve & Close
                        </button>
                      </div>

                    </div>
                  )}
                </div>
              </div>
            );
          })()}


          {/* TAB 11: MULTI-AGENT WORKFLOW ORCHESTRATION PIPELINE (Phase 4E) */}
          {activeTab === 'workflow-pipeline' && (() => {
            const isLoading = workflowLoading || workflowScanning;

            // Filter list based on type filter
            const filteredItems = workflowItems.filter(item => {
              if (workflowTypeFilter === 'ALL') return true;
              return item.type === workflowTypeFilter;
            });

            // Sort by value_at_risk descending
            filteredItems.sort((a, b) => b.value_at_risk - a.value_at_risk);

            // Pagination
            const totalWorkflowPages = Math.max(1, Math.ceil(filteredItems.length / WORKFLOW_PAGE_SIZE));
            const pagedItems = filteredItems.slice((workflowPage - 1) * WORKFLOW_PAGE_SIZE, workflowPage * WORKFLOW_PAGE_SIZE);

            // Select all toggle
            const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
              if (e.target.checked) {
                const ids = filteredItems.map(item => item.id);
                setWorkflowSelectedIds(ids);
              } else {
                setWorkflowSelectedIds([]);
              }
            };

            const handleSelectItem = (id: string, checked: boolean) => {
              if (checked) {
                setWorkflowSelectedIds([...workflowSelectedIds, id]);
              } else {
                setWorkflowSelectedIds(workflowSelectedIds.filter(x => x !== id));
              }
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">

                {/* 1. Stepper Track Progress Bar */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', flex: 1, justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>

                    {/* Background Connection Line */}
                    <div style={{
                      position: 'absolute',
                      left: '8%',
                      right: '8%',
                      top: '25px',
                      height: '4px',
                      background: 'var(--border-color)',
                      zIndex: 1
                    }}>
                      <div style={{
                        width: workflowScanning ? '33%' : workflowItems.length > 0 ? '66%' : '0%',
                        height: '100%',
                        background: 'var(--color-primary)',
                        transition: 'width 0.4s ease'
                      }} />
                    </div>

                    {/* Step 1: Scan exceptions */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '20%' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: workflowScanning ? '#a855f7' : 'var(--bg-surface-elevated)',
                        border: `2px solid ${workflowScanning ? '#c084fc' : 'var(--border-color)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: workflowScanning ? '#ffffff' : 'var(--text-secondary)',
                        fontWeight: 'bold',
                        fontSize: '1.2rem',
                        boxShadow: workflowScanning ? '0 0 15px rgba(168, 85, 247, 0.4)' : 'none'
                      }}>
                        🔍
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--text-primary)' }}>1. Monitor & Scan</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Continuous sweep</span>
                    </div>

                    {/* Step 2: Draft generation */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '20%' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: workflowItems.length > 0 ? '#3b82f6' : 'var(--bg-surface-elevated)',
                        border: `2px solid ${workflowItems.length > 0 ? '#60a5fa' : 'var(--border-color)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: workflowItems.length > 0 ? '#ffffff' : 'var(--text-secondary)',
                        fontWeight: 'bold',
                        fontSize: '1.2rem'
                      }}>
                        📝
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--text-primary)' }}>2. AI Drafting</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{workflowItems.length} recommendations</span>
                    </div>

                    {/* Step 3: Human Review */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '20%' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: workflowItems.length > 0 ? 'var(--color-primary)' : 'var(--bg-surface-elevated)',
                        border: `2px solid ${workflowItems.length > 0 ? 'var(--color-primary-hover)' : 'var(--border-color)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: workflowItems.length > 0 ? '#ffffff' : 'var(--text-secondary)',
                        fontWeight: 'bold',
                        fontSize: '1.2rem'
                      }}>
                        ✍️
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--text-primary)' }}>3. Human-in-the-Loop</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Review staged drafts</span>
                    </div>

                    {/* Step 4: Dispatch */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2, width: '20%' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        background: 'var(--bg-surface-elevated)',
                        border: '2px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--text-secondary)',
                        fontWeight: 'bold',
                        fontSize: '1.2rem'
                      }}>
                        🚀
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, marginTop: '0.5rem', color: 'var(--text-primary)' }}>4. Dispatch Actions</span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>Send to target</span>
                    </div>

                  </div>
                </div>

                {/* 2. Scope Configuration Gate Controls */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>⚙️ Scope Configuration Gate</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: '0.2rem 0 0 0' }}>
                        Restrict AI sweeps and auto-dispatch options to specific manufacturing nodes.
                      </p>
                    </div>
                    <button
                      onClick={runWorkflowSweep}
                      disabled={isLoading}
                      style={{
                        background: 'var(--color-primary)',
                        border: 'none',
                        borderRadius: '0.375rem',
                        color: '#ffffff',
                        padding: '0.55rem 1.25rem',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        opacity: isLoading ? 0.7 : 1
                      }}
                    >
                      {workflowScanning ? (
                        <>
                          <span style={{ width: '12px', height: '12px', border: '2px solid #ffffff', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 1s linear infinite' }} />
                          Scanning Network...
                        </>
                      ) : (
                        <>⛓️ Run Multi-Agent Sweep</>
                      )}
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: '1rem', alignItems: 'center' }}>
                    {/* Plant Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Target Plant Scope</label>
                      <select
                        value={workflowPlantFilter}
                        onChange={(e) => setWorkflowPlantFilter(e.target.value)}
                        style={{
                          background: 'var(--bg-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '0.25rem',
                          color: 'var(--text-primary)',
                          fontSize: '0.78rem',
                          padding: '0.45rem 0.5rem',
                          outline: 'none'
                        }}
                      >
                        <option value="">ALL MANUFACTURING PLANTS</option>
                        {plantList.map(p => (
                          <option key={p.code} value={p.code}>{p.code} - {p.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Buyer Dropdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Target Buyer Scope</label>
                      <select
                        value={workflowBuyerFilter}
                        onChange={(e) => setWorkflowBuyerFilter(e.target.value)}
                        style={{
                          background: 'var(--bg-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '0.25rem',
                          color: 'var(--text-primary)',
                          fontSize: '0.78rem',
                          padding: '0.45rem 0.5rem',
                          outline: 'none'
                        }}
                      >
                        <option value="">ALL BUYERS</option>
                        {['APATEL', 'JSMITH', 'LGARCIA', 'MWONG', 'SYSTEM'].map(b => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    </div>

                    {/* Auto-dispatch Toggle */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Automation Guardrail</label>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        background: 'var(--bg-main)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.25rem',
                        padding: '0.4rem 0.75rem',
                        height: '35px'
                      }}>
                        <input
                          type="checkbox"
                          id="autoSendBypass"
                          checked={workflowAutoSend}
                          onChange={(e) => setWorkflowAutoSend(e.target.checked)}
                          style={{
                            cursor: 'pointer',
                            accentColor: 'var(--color-primary)'
                          }}
                        />
                        <label htmlFor="autoSendBypass" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                          🔓 Enable Autonomous Auto-Send
                        </label>
                      </div>
                    </div>
                  </div>

                  {workflowAutoSend && (
                    <div style={{
                      background: 'rgba(217, 119, 6, 0.15)',
                      border: '1px solid rgba(217, 119, 6, 0.3)',
                      borderRadius: '0.375rem',
                      padding: '0.75rem 1rem',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.5rem',
                      animation: 'fadeIn 0.2s ease-out'
                    }}>
                      <span style={{ fontSize: '1rem' }}>⚠️</span>
                      <div style={{ fontSize: '0.72rem', color: '#fbbf24', lineHeight: 1.4 }}>
                        <strong>Warning: Autonomous Bypass Enabled!</strong> The next multi-agent execution sweep will auto-approve and dispatch/escalate recommendations that fall strictly within the scoped manufacturing plant (<strong>{workflowPlantFilter || 'ALL'}</strong>) and buyer (<strong>{workflowBuyerFilter || 'ALL'}</strong>) filters. Staged actions not matching this scope will remain in Human Review.
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Review Tab Filters & Action Controls */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* Category tabs */}
                  <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', borderRadius: '0.375rem', padding: '0.2rem', border: '1px solid var(--border-color)' }}>
                    {[
                      { code: 'ALL', label: 'All Drafts' },
                      { code: 'REMINDER', label: 'Overdue Reminders' },
                      { code: 'ACK_FOLLOWUP', label: 'Ack Follow-ups' },
                      { code: 'ESCALATION', label: 'SLA Escalations' },
                      { code: 'COLLABORATION', label: 'Stock Deficits' }
                    ].map(tab => (
                      <button
                        key={tab.code}
                        onClick={() => setWorkflowTypeFilter(tab.code)}
                        style={{
                          background: workflowTypeFilter === tab.code ? 'var(--bg-surface)' : 'transparent',
                          color: workflowTypeFilter === tab.code ? 'var(--text-primary)' : 'var(--text-secondary)',
                          border: workflowTypeFilter === tab.code ? '1px solid var(--border-color)' : 'none',
                          borderRadius: '0.25rem',
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Batch send dispatches */}
                  {workflowSelectedIds.length > 0 && (
                    <button
                      onClick={() => handleBatchDispatch(workflowSelectedIds)}
                      disabled={isLoading}
                      style={{
                        background: 'var(--color-primary)',
                        border: 'none',
                        borderRadius: '0.375rem',
                        color: '#ffffff',
                        padding: '0.45rem 1rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        animation: 'fadeIn 0.2s ease'
                      }}
                    >
                      🚀 Dispatch Approved Staged Actions ({workflowSelectedIds.length})
                    </button>
                  )}
                </div>

                {/* 4. Unified Review Grid */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden'
                }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '0.75rem 1rem', width: '40px' }}>
                            <input
                              type="checkbox"
                              checked={filteredItems.length > 0 && workflowSelectedIds.length === filteredItems.length}
                              onChange={handleSelectAll}
                              style={{ cursor: 'pointer' }}
                            />
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>AGENT TYPE</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>EXCEPTION ID</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>PO # / ITEM</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>PLANT / BUYER</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>SUPPLIER / MATERIAL</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VALUE AT RISK</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DESTINATION</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>STATUS</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.length === 0 ? (
                          <tr>
                            <td colSpan={10} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💤</div>
                              <div>No pending agent drafts staged. Choose a Plant/Buyer scope and click <strong>Run Multi-Agent Sweep</strong>.</div>
                            </td>
                          </tr>
                        ) : (
                          pagedItems.map(item => {
                            const isSelected = workflowSelectedIds.includes(item.id);

                            // Badges styles based on type
                            let typeColor = '#3b82f6';
                            let typeBg = 'rgba(59, 130, 246, 0.1)';
                            if (item.type === 'ACK_FOLLOWUP') {
                              typeColor = '#10b981';
                              typeBg = 'rgba(16, 185, 129, 0.1)';
                            } else if (item.type === 'ESCALATION') {
                              typeColor = '#f59e0b';
                              typeBg = 'rgba(245, 158, 11, 0.1)';
                            } else if (item.type === 'COLLABORATION') {
                              typeColor = '#ec4899';
                              typeBg = 'rgba(236, 72, 153, 0.1)';
                            }

                            // Impact styles
                            let impactColor = '#ef4444';
                            if (item.impact_level === 'MEDIUM') impactColor = '#f59e0b';
                            else if (item.impact_level === 'LOW') impactColor = '#10b981';

                            return (
                              <tr
                                key={item.id}
                                style={{
                                  borderBottom: '1px solid var(--border-color)',
                                  background: isSelected ? 'rgba(168, 85, 247, 0.05)' : 'transparent',
                                  transition: 'background 0.2s'
                                }}
                              >
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => handleSelectItem(item.id, e.target.checked)}
                                    style={{ cursor: 'pointer' }}
                                  />
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span style={{
                                    color: typeColor,
                                    background: typeBg,
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    {item.type}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 600 }}>{item.exception_id}</td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>
                                  {item.po_number} / {item.item_number}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>
                                  {item.plant} / <span style={{ fontWeight: 600 }}>{item.assigned_buyer}</span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <div style={{ fontWeight: 600 }}>{item.supplier_name}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Part: {item.material_id}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: impactColor }}>
                                  {item.value_at_risk > 0 ? `$${item.value_at_risk.toLocaleString()}` : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{item.target_destination}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span style={{
                                    color: item.approval_status === 'APPROVED' ? '#10b981' : '#f59e0b',
                                    fontWeight: 700
                                  }}>
                                    ● {item.approval_status}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  <button
                                    onClick={() => setEditingWorkflowItem(item)}
                                    style={{
                                      background: 'transparent',
                                      border: '1px solid var(--border-color)',
                                      color: 'var(--text-primary)',
                                      padding: '0.25rem 0.6rem',
                                      borderRadius: '0.25rem',
                                      fontSize: '0.68rem',
                                      fontWeight: 600,
                                      cursor: 'pointer'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--text-secondary)'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; }}
                                  >
                                    ✏️ Edit Draft
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Workflow Pagination bar */}
                {filteredItems.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Showing {((workflowPage - 1) * WORKFLOW_PAGE_SIZE) + 1}–{Math.min(workflowPage * WORKFLOW_PAGE_SIZE, filteredItems.length)} of {filteredItems.length} items
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button onClick={() => setWorkflowPage(p => Math.max(1, p - 1))} disabled={workflowPage === 1} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: workflowPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)', color: workflowPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: workflowPage === 1 ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>‹ Prev</button>
                      {Array.from({ length: totalWorkflowPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalWorkflowPages || Math.abs(p - workflowPage) <= 2).map((p, idx, arr) => (
                        <>
                          {idx > 0 && arr[idx - 1] !== p - 1 && <span key={`we${p}`} style={{ color: 'var(--text-muted)' }}>…</span>}
                          <button key={p} onClick={() => setWorkflowPage(p)} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid', borderColor: workflowPage === p ? 'var(--color-primary)' : 'var(--border-color)', background: workflowPage === p ? 'rgba(79,70,229,0.15)' : 'var(--bg-surface-elevated)', color: workflowPage === p ? 'var(--color-primary)' : 'var(--text-secondary)', fontWeight: workflowPage === p ? 700 : 400, cursor: 'pointer', fontSize: '0.75rem', minWidth: '2rem' }}>{p}</button>
                        </>
                      ))}
                      <button onClick={() => setWorkflowPage(p => Math.min(totalWorkflowPages, p + 1))} disabled={workflowPage === totalWorkflowPages} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: workflowPage === totalWorkflowPages ? 'transparent' : 'var(--bg-surface-elevated)', color: workflowPage === totalWorkflowPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: workflowPage === totalWorkflowPages ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Next ›</button>
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>Page {workflowPage} of {totalWorkflowPages}</span>
                  </div>
                )}

                {/* 5. Real-Time Audit Log Terminal */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>💻</span> Orchestration Engine Logs & Audit Trail
                  </h4>
                  <div style={{
                    background: '#090d16',
                    border: '1px solid #1f293d',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '0.72rem',
                    height: '250px',
                    overflowY: 'auto',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.8)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    scrollBehavior: 'smooth'
                  }}>
                    {workflowAuditLogs.length === 0 ? (
                      <div style={{ color: '#475569', fontStyle: 'italic' }}>Terminal online. Staged logs wait for sweep activation...</div>
                    ) : (
                      workflowAuditLogs.map((log, idx) => {
                        let levelColor = '#38bdf8'; // INFO
                        if (log.level === 'SUCCESS') levelColor = '#4ade80';
                        else if (log.level === 'WARNING') levelColor = '#fbbf24';
                        else if (log.level === 'ERROR') levelColor = '#f87171';

                        return (
                          <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', borderBottom: '1px solid #111827', paddingBottom: '0.2rem' }}>
                            <span style={{ color: '#475569', userSelect: 'none' }}>[{log.timestamp.slice(11, 19)}]</span>
                            <span style={{ color: levelColor, fontWeight: 700, minWidth: '80px' }}>[{log.level}]</span>
                            <span style={{ color: '#ec4899', fontWeight: 600 }}>{log.agent}:</span>
                            <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 6. Edit Draft Modal (Internal Drawer) */}
                {editingWorkflowItem && (
                  <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    width: '100vw',
                    height: '100vh',
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1000,
                    animation: 'fadeIn 0.15s ease-out'
                  }}>
                    <div style={{
                      zoom: 0.85,
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.625rem',
                      width: '600px',
                      maxWidth: '90vw',
                      boxShadow: 'var(--shadow-lg)',
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <div style={{
                        padding: '1.25rem',
                        borderBottom: '1px solid var(--border-color)',
                        background: 'var(--bg-surface-elevated)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div>
                          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>✏️ Edit Notification Action Draft</h3>
                          <span style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
                            ID: {editingWorkflowItem.id} | PO {editingWorkflowItem.po_number}
                          </span>
                        </div>
                        <button
                          onClick={() => setEditingWorkflowItem(null)}
                          style={{ background: 'transparent', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                          ×
                        </button>
                      </div>

                      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {editingWorkflowItem.type !== 'COLLABORATION' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Subject Line</label>
                            <input
                              type="text"
                              value={editingWorkflowItem.draft_subject}
                              onChange={(e) => setEditingWorkflowItem({ ...editingWorkflowItem, draft_subject: e.target.value })}
                              style={{
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '0.375rem',
                                padding: '0.5rem 0.75rem',
                                fontSize: '0.78rem',
                                color: 'var(--text-primary)',
                                outline: 'none'
                              }}
                            />
                          </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                          <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                            {editingWorkflowItem.type === 'COLLABORATION' ? 'Planner / Alignment Message' : 'Message Body'}
                          </label>
                          <textarea
                            rows={8}
                            value={editingWorkflowItem.draft_message}
                            onChange={(e) => setEditingWorkflowItem({ ...editingWorkflowItem, draft_message: e.target.value })}
                            style={{
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '0.375rem',
                              padding: '0.5rem 0.75rem',
                              fontSize: '0.78rem',
                              color: 'var(--text-primary)',
                              fontFamily: 'inherit',
                              lineHeight: 1.4,
                              outline: 'none',
                              resize: 'vertical'
                            }}
                          />
                        </div>
                      </div>

                      <div style={{
                        padding: '1rem 1.25rem',
                        borderTop: '1px solid var(--border-color)',
                        background: 'var(--bg-surface-elevated)',
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '0.5rem'
                      }}>
                        <button
                          onClick={() => setEditingWorkflowItem(null)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: '0.375rem',
                            color: 'var(--text-secondary)',
                            padding: '0.45rem 1rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveWorkflowDraft}
                          style={{
                            background: 'var(--color-primary)',
                            border: 'none',
                            borderRadius: '0.375rem',
                            color: '#ffffff',
                            padding: '0.45rem 1.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            boxShadow: 'var(--shadow-sm)'
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-primary-hover)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-primary)'; }}
                        >
                          💾 Save Draft changes
                        </button>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            );
          })()}


          {/* TAB 12: AUTONOMOUS PROCUREMENT MONITORING (Phase 5A) */}
          {activeTab === 'autonomous-monitoring' && (() => {
            const isSupervisorActive = !!supervisorState?.isActive;
            const isLoading = monitoringLoading || monitoringScanning || monitoringToggling;

            // Filter anomalies
            const filteredAnomalies = monitoringAnomalies.filter(anom => {
              // Status filter
              if (monitoringFilter === 'ACTIVE' && anom.status !== 'ACTIVE') return false;
              if (monitoringFilter === 'RESOLVED' && anom.status !== 'RESOLVED') return false;

              // Type filter
              if (monitoringTypeFilter !== 'ALL' && anom.anomaly_type !== monitoringTypeFilter) return false;

              return true;
            });

            const totalMonitoringPages = Math.max(1, Math.ceil(filteredAnomalies.length / MONITORING_PAGE_SIZE));
            const pagedAnomalies = filteredAnomalies.slice((monitoringPage - 1) * MONITORING_PAGE_SIZE, monitoringPage * MONITORING_PAGE_SIZE);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }} className="animate-fade">
                <style>{`
                  @keyframes pulseGlow {
                    0% { transform: scale(0.95); opacity: 0.6; }
                    50% { transform: scale(1.15); opacity: 0.9; }
                    100% { transform: scale(0.95); opacity: 0.6; }
                  }
                  @keyframes pingGlow {
                    0% { transform: scale(1); opacity: 0.5; }
                    70% { transform: scale(2.4); opacity: 0; }
                    100% { transform: scale(2.4); opacity: 0; }
                  }
                  .scanning-radar {
                    position: relative;
                    width: 40px;
                    height: 40px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  }
                  .radar-core {
                    width: 14px;
                    height: 14px;
                    border-radius: 50%;
                    background: #06b6d4;
                    z-index: 2;
                  }
                  .radar-pulse {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: rgba(6, 182, 212, 0.4);
                    animation: pulseGlow 2s infinite ease-in-out;
                    z-index: 1;
                  }
                  .radar-ping {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    border-radius: 50%;
                    background: rgba(6, 182, 212, 0.3);
                    animation: pingGlow 1.5s infinite linear;
                    z-index: 0;
                  }
                `}</style>

                {/* 1. Hero Supervisor Status Widget */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                    <div className="scanning-radar">
                      <div className="radar-core" style={{ background: isSupervisorActive ? '#06b6d4' : '#64748b' }} />
                      {isSupervisorActive && (
                        <>
                          <div className="radar-pulse" />
                          <div className="radar-ping" />
                        </>
                      )}
                    </div>
                    <div>
                      <h2 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        Autonomous Procurement Monitor
                      </h2>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Continuous background scanning for supply network safety, confirmation, and schedule breaches.
                      </div>
                    </div>
                  </div>

                  {/* Status Badges */}
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>System State</div>
                      <span style={{
                        color: isSupervisorActive ? '#22c55e' : '#64748b',
                        background: isSupervisorActive ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)',
                        padding: '0.2rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        display: 'inline-block',
                        marginTop: '0.2rem'
                      }}>
                        ● {isSupervisorActive ? 'MONITORING ACTIVE' : 'SUPERVISOR STANDBY'}
                      </span>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>System Uptime</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 700, marginTop: '0.2rem', color: 'var(--text-primary)' }}>
                        {isSupervisorActive ? supervisorState?.uptime : '00:00:00'}
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Scans Count</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 700, marginTop: '0.2rem', color: 'var(--text-primary)' }}>
                        {supervisorState?.scansCount || 0}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Control Panel & Configuration settings */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                  boxShadow: 'var(--shadow-sm)'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>⚙️ Monitoring Control Panel</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '0.72rem', margin: '0.2rem 0 0 0' }}>
                        Configure the polling interval and manage background anomaly search sweeps.
                      </p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={handleManualSupervisorScan}
                        disabled={isLoading}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: '0.375rem',
                          color: 'var(--text-primary)',
                          padding: '0.45rem 1rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: isLoading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Force Supervisor Sweep
                      </button>

                      <button
                        onClick={() => handleToggleSupervisor(!isSupervisorActive)}
                        disabled={isLoading}
                        style={{
                          background: isSupervisorActive ? '#ef4444' : 'var(--color-primary)',
                          border: 'none',
                          borderRadius: '0.375rem',
                          color: '#ffffff',
                          padding: '0.45rem 1.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          boxShadow: 'var(--shadow-sm)'
                        }}
                      >
                        {isSupervisorActive ? '🛑 Shut Down Supervisor' : '🛰️ Initialize Supervisor'}
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem', alignItems: 'center' }}>
                    {/* Interval input */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Scan Cycle Frequency</label>
                      <select
                        value={monitoringIntervalInput}
                        onChange={(e) => {
                          setMonitoringIntervalInput(e.target.value);
                          if (isSupervisorActive) {
                            const val = parseInt(e.target.value, 10);
                            handleToggleSupervisor(true);
                          }
                        }}
                        disabled={isLoading}
                        style={{
                          background: 'var(--bg-main)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '0.25rem',
                          color: 'var(--text-primary)',
                          fontSize: '0.78rem',
                          padding: '0.45rem 0.5rem',
                          outline: 'none'
                        }}
                      >
                        <option value="15">Every 15 Seconds (Demo Speed)</option>
                        <option value="30">Every 30 Seconds (Default)</option>
                        <option value="60">Every 1 Minute</option>
                        <option value="300">Every 5 Minutes</option>
                      </select>
                    </div>

                    {/* Quick description info */}
                    <div style={{
                      background: 'var(--bg-main)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '0.375rem',
                      padding: '0.6rem 0.8rem',
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45
                    }}>
                      💡 <strong>Autonomous Mode Uptime:</strong> When initialized, the supervisor daemon starts a persistent, non-blocking background thread. It automatically records newly generated material shortages or confirmation breaches into the system logs, alerting other integrated subagents.
                    </div>
                  </div>
                </div>

                {/* 3. Anomalies List Toolbar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* Status filters */}
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', borderRadius: '0.375rem', padding: '0.2rem', border: '1px solid var(--border-color)' }}>
                      {[
                        { code: 'ACTIVE', label: 'Active Anomalies' },
                        { code: 'RESOLVED', label: 'Resolved Ledger' },
                        { code: 'ALL', label: 'All History' }
                      ].map(tab => (
                        <button
                          key={tab.code}
                          onClick={() => { setMonitoringFilter(tab.code as any); setMonitoringPage(1); }}
                          style={{
                            background: monitoringFilter === tab.code ? 'var(--bg-surface)' : 'transparent',
                            color: monitoringFilter === tab.code ? 'var(--text-primary)' : 'var(--text-secondary)',
                            border: monitoringFilter === tab.code ? '1px solid var(--border-color)' : 'none',
                            borderRadius: '0.25rem',
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Type Filter dropdown */}
                    <select
                      value={monitoringTypeFilter}
                      onChange={(e) => { setMonitoringTypeFilter(e.target.value); setMonitoringPage(1); }}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '0.375rem',
                        color: 'var(--text-primary)',
                        fontSize: '0.72rem',
                        padding: '0 0.5rem',
                        fontWeight: 600,
                        outline: 'none'
                      }}
                    >
                      <option value="ALL">ALL TYPES</option>
                      <option value="SAFETY_STOCK_BREACH">Safety Stock Breaches</option>
                      <option value="NEW_OVERDUE_LINE">New Overdue PO Lines</option>
                      <option value="CONFIRMATION_DELAY">Acknowledgement Delays</option>
                    </select>
                  </div>
                </div>

                {/* 4. Active Anomalies Ledger List Grid */}
                <div style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '0.5rem',
                  boxShadow: 'var(--shadow-sm)',
                  overflow: 'hidden'
                }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.75rem' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ANOMALY ID</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>TIMESTAMP</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>ANOMALY TYPE</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>SEVERITY</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>PLANT / MATERIAL</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>DESCRIPTION</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>VALUE AT RISK</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)' }}>STATUS</th>
                          <th style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>ACTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAnomalies.length === 0 ? (
                          <tr>
                            <td colSpan={9} style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>🛰️</div>
                              <div>No anomalies matching the selected filters found. The network scope is healthy.</div>
                            </td>
                          </tr>
                        ) : (
                          pagedAnomalies.map(anom => {
                            let typeBg = 'rgba(6, 182, 212, 0.1)';
                            let typeColor = '#06b6d4';
                            if (anom.anomaly_type === 'NEW_OVERDUE_LINE') {
                              typeBg = 'rgba(239, 68, 68, 0.1)';
                              typeColor = '#ef4444';
                            } else if (anom.anomaly_type === 'CONFIRMATION_DELAY') {
                              typeBg = 'rgba(245, 158, 11, 0.1)';
                              typeColor = '#f59e0b';
                            }

                            let sevColor = '#10b981';
                            if (anom.severity === 'CRITICAL') sevColor = '#ef4444';
                            else if (anom.severity === 'HIGH') sevColor = '#f97316';
                            else if (anom.severity === 'MEDIUM') sevColor = '#f59e0b';

                            return (
                              <tr key={anom.id} style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.2s' }}>
                                <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', fontWeight: 700 }}>{anom.id}</td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-secondary)' }}>{formatDate(anom.timestamp)} {anom.timestamp.slice(11, 16)}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span style={{
                                    color: typeColor,
                                    background: typeBg,
                                    padding: '0.2rem 0.5rem',
                                    borderRadius: '0.25rem',
                                    fontSize: '0.625rem',
                                    fontWeight: 700,
                                    textTransform: 'uppercase'
                                  }}>
                                    {anom.anomaly_type.replace(/_/g, ' ')}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: sevColor }}>{anom.severity}</td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <div style={{ fontWeight: 600 }}>Plant: {anom.plant}</div>
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>Part: {anom.material_id}</div>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', color: 'var(--text-primary)', maxWidth: '280px', lineHeight: 1.35 }}>{anom.description}</td>
                                <td style={{ padding: '0.75rem 1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  {anom.value_at_risk > 0 ? `$${anom.value_at_risk.toLocaleString()}` : '-'}
                                </td>
                                <td style={{ padding: '0.75rem 1rem' }}>
                                  <span style={{
                                    color: anom.status === 'ACTIVE' ? '#ef4444' : '#10b981',
                                    fontWeight: 700
                                  }}>
                                    ● {anom.status}
                                  </span>
                                </td>
                                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                  {anom.status === 'ACTIVE' ? (
                                    <button
                                      onClick={() => handleResolveAnomaly(anom.id)}
                                      style={{
                                        background: 'var(--bg-surface-elevated)',
                                        border: '1px solid var(--border-color)',
                                        color: 'var(--text-primary)',
                                        padding: '0.25rem 0.6rem',
                                        borderRadius: '0.25rem',
                                        fontSize: '0.68rem',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      Resolve & Close
                                    </button>
                                  ) : (
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontStyle: 'italic' }}>Archived</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* Pagination bar */}
                {filteredAnomalies.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      Showing {((monitoringPage - 1) * MONITORING_PAGE_SIZE) + 1}–{Math.min(monitoringPage * MONITORING_PAGE_SIZE, filteredAnomalies.length)} of {filteredAnomalies.length} anomalies
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <button onClick={() => setMonitoringPage(p => Math.max(1, p - 1))} disabled={monitoringPage === 1} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: monitoringPage === 1 ? 'transparent' : 'var(--bg-surface-elevated)', color: monitoringPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: monitoringPage === 1 ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>‹ Prev</button>
                      {Array.from({ length: totalMonitoringPages }, (_, i) => i + 1).filter(p => p === 1 || p === totalMonitoringPages || Math.abs(p - monitoringPage) <= 2).map((p, idx, arr) => (
                        <>
                          {idx > 0 && arr[idx - 1] !== p - 1 && <span key={`ellipsis-${p}`} style={{ color: 'var(--text-muted)', padding: '0 0.2rem' }}>…</span>}
                          <button key={p} onClick={() => setMonitoringPage(p)} style={{ padding: '0.3rem 0.6rem', borderRadius: '0.25rem', border: '1px solid', borderColor: monitoringPage === p ? '#06b6d4' : 'var(--border-color)', background: monitoringPage === p ? 'rgba(6,182,212,0.15)' : 'var(--bg-surface-elevated)', color: monitoringPage === p ? '#06b6d4' : 'var(--text-secondary)', fontWeight: monitoringPage === p ? 700 : 400, cursor: 'pointer', fontSize: '0.75rem', minWidth: '2rem' }}>{p}</button>
                        </>
                      ))}
                      <button onClick={() => setMonitoringPage(p => Math.min(totalMonitoringPages, p + 1))} disabled={monitoringPage === totalMonitoringPages} style={{ padding: '0.3rem 0.7rem', borderRadius: '0.25rem', border: '1px solid var(--border-color)', background: monitoringPage === totalMonitoringPages ? 'transparent' : 'var(--bg-surface-elevated)', color: monitoringPage === totalMonitoringPages ? 'var(--text-muted)' : 'var(--text-primary)', cursor: monitoringPage === totalMonitoringPages ? 'default' : 'pointer', fontSize: '0.75rem', fontWeight: 600 }}>Next ›</button>
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>Page {monitoringPage} of {totalMonitoringPages}</span>
                  </div>
                )}

                {/* 5. Heartbeat Log Terminal */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span>🛰️</span> Live Supervisor Diagnostics & Heartbeat Log
                  </h4>
                  <div style={{
                    background: '#040810',
                    border: '1px solid #14213d',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    fontFamily: 'Consolas, Monaco, monospace',
                    fontSize: '0.72rem',
                    height: '250px',
                    overflowY: 'auto',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.9)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    scrollBehavior: 'smooth'
                  }}>
                    {monitoringLogs.length === 0 ? (
                      <div style={{ color: '#475569', fontStyle: 'italic' }}>Diagnostics center offline. Startup sequence waiting for supervisor toggle...</div>
                    ) : (
                      monitoringLogs.map((log, idx) => {
                        let levelColor = '#06b6d4'; // INFO
                        if (log.type === 'SCAN_START') levelColor = '#a855f7';
                        else if (log.type === 'SCAN_COMPLETE') levelColor = '#3b82f6';
                        else if (log.type === 'ALERT_GEN') levelColor = '#f43f5e';
                        else if (log.type === 'STATE_CHANGE') levelColor = '#eab308';
                        else if (log.type === 'ANOMALY_RESOLVED') levelColor = '#10b981';

                        return (
                          <div key={idx} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start', borderBottom: '1px solid #0b1528', paddingBottom: '0.2rem' }}>
                            <span style={{ color: '#334155', userSelect: 'none' }}>[{log.timestamp.slice(11, 19)}]</span>
                            <span style={{ color: levelColor, fontWeight: 700, minWidth: '100px' }}>[{log.type}]</span>
                            <span style={{ color: '#cbd5e1' }}>{log.message}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>
            );
          })()}

            </>
          )}


          {toastMessage && (
            <div style={{
              position: 'fixed',
              zoom: 0.85,
              bottom: 'calc(2rem / 0.85)',
              right: 'calc(2rem / 0.85)',
              background: '#1f2937',
              border: '1px solid var(--border-color)',
              color: '#ffffff',
              padding: '0.75rem 1.25rem',
              borderRadius: '0.375rem',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              zIndex: 1000,
              fontSize: '0.8rem',
              animation: 'fadeIn 0.2s',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 600
            }}>
              {toastMessage}
            </div>
          )}
        </main>
      </div>
    </>
  );
}

// Helper functions for custom Markdown rendering in Procurement Copilot (Phase 3A)
const renderMarkdown = (text: string, onAction?: (action: string) => void) => {
  if (!text) return '';
  
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    // Check if this line is part of a markdown table
    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      // Collect all consecutive lines that start with '|'
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      
      // Parse collected table lines
      const rowsData = tableLines.map(row => {
        const segments = row.split('|').map(s => s.trim());
        if (segments[0] === '') segments.shift();
        if (segments[segments.length - 1] === '') segments.pop();
        return segments;
      });

      let headers: string[] = [];
      let bodyRows: string[][] = [];

      if (rowsData.length > 0) {
        headers = rowsData[0];
        let startIdx = 1;
        // Skip separator line if present (e.g. |---|---|)
        if (rowsData.length > 1) {
          const isSeparator = rowsData[1].every(cell => /^:?-+:?$/.test(cell));
          if (isSeparator) {
            startIdx = 2;
          }
        }
        bodyRows = rowsData.slice(startIdx);
      }

      elements.push(
        <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '0.75rem 0', width: '100%' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem', border: '1px solid var(--border-color)', background: 'var(--bg-surface)' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-color)', background: 'rgba(255,255,255,0.02)' }}>
                {headers.map((h, idx) => (
                  <th key={idx} style={{ padding: '0.5rem 0.75rem', fontWeight: 700, textAlign: 'left', borderRight: '1px solid var(--border-color)', color: 'var(--text-primary)' }}>
                    {parseBold(h, onAction)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIdx) => (
                <tr key={rowIdx} style={{ borderBottom: '1px solid var(--border-color)', background: rowIdx % 2 === 1 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  {row.map((cell, cellIdx) => (
                    <td key={cellIdx} style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>
                      {parseBold(cell, onAction)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else {
      let cleanLine = line;
      
      // Header check
      if (cleanLine.startsWith('### ')) {
        elements.push(<h4 key={`h4-${i}`} style={{ color: 'var(--color-primary)', fontSize: '0.85rem', fontWeight: 700, margin: '0.75rem 0 0.35rem 0' }}>{parseBold(cleanLine.replace('### ', ''), onAction)}</h4>);
      } else if (cleanLine.startsWith('## ')) {
        elements.push(<h3 key={`h3-${i}`} style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 700, margin: '1rem 0 0.5rem 0' }}>{parseBold(cleanLine.replace('## ', ''), onAction)}</h3>);
      } else if (cleanLine.startsWith('# ')) {
        elements.push(<h2 key={`h2-${i}`} style={{ color: 'var(--text-primary)', fontSize: '1.1rem', fontWeight: 800, margin: '1.25rem 0 0.75rem 0' }}>{parseBold(cleanLine.replace('# ', ''), onAction)}</h2>);
      } else if (cleanLine.trim().startsWith('* ') || cleanLine.trim().startsWith('- ')) {
        const content = cleanLine.replace(/^[\s]*[\*\-]\s/, '');
        elements.push(
          <li key={`li-${i}`} style={{ marginLeft: '1rem', listStyleType: 'disc', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            {parseBold(content, onAction)}
          </li>
        );
      } else {
        if (cleanLine.trim() !== '') {
          elements.push(<p key={`p-${i}`} style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '0.35rem 0', lineHeight: 1.4 }}>{parseBold(cleanLine, onAction)}</p>);
        } else {
          elements.push(<div key={`br-${i}`} style={{ height: '0.25rem' }} />);
        }
      }
      i++;
    }
  }
  return <>{elements}</>;
};

const parseBold = (str: string, onAction?: (action: string) => void) => {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(str)) !== null) {
    const textBefore = str.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(...parseBoldAndCodeOnly(textBefore));
    }
    const linkText = match[1];
    const linkUrl = match[2];
    
    parts.push(
      <a 
        key={`link-${match.index}`} 
        href={linkUrl}
        onClick={(e) => {
          if (linkUrl.startsWith('action:') && onAction) {
            e.preventDefault();
            onAction(linkUrl);
          }
        }}
        style={{
          color: '#60a5fa',
          textDecoration: 'underline',
          cursor: 'pointer',
          fontWeight: 600
        }}
      >
        {linkText}
      </a>
    );
    lastIndex = linkRegex.lastIndex;
  }

  const textAfter = str.substring(lastIndex);
  if (textAfter) {
    parts.push(...parseBoldAndCodeOnly(textAfter));
  }

  return parts;
};

const parseBoldAndCodeOnly = (str: string) => {
  const parts = str.split('**');
  return parts.map((part, i) => {
    if (i % 2 === 1) {
      return <strong key={i} style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{part}</strong>;
    }
    const codeParts = part.split('`');
    if (codeParts.length > 1) {
      return codeParts.map((cp, j) => {
        if (j % 2 === 1) {
          return <code key={j} style={{ background: 'var(--bg-surface-elevated)', padding: '0.1rem 0.3rem', borderRadius: '0.25rem', fontFamily: 'monospace', fontSize: '0.72rem', color: '#60a5fa' }}>{cp}</code>;
        }
        return cp;
      });
    }
    return part;
  });
};

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-CA'); // YYYY-MM-DD
};
