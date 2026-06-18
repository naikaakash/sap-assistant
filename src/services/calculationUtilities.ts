/**
 * calculationUtilities.ts
 * Centralized, shared business calculations for the procurement copilot application.
 * Decouples logic computations from raw data-loading (csvDataService) and UI.
 */

import {
  PLANT_BUSINESS_RULES,
  AGENT_BREACH_THRESHOLDS,
  EXCEPTION_SEVERITY_RULES
} from '../config/businessRules';

/**
 * Calculates plant health status: OPTIMAL, WARNING, or RISK.
 */
export function calculatePlantStatus(
  exCount: number,
  shortCount: number,
  overdueCount: number
): 'OPTIMAL' | 'WARNING' | 'RISK' {
  if (
    exCount > PLANT_BUSINESS_RULES.CRITICAL_EXCEPTION_COUNT_THRESHOLD ||
    shortCount > PLANT_BUSINESS_RULES.CRITICAL_SHORTAGE_COUNT_THRESHOLD
  ) {
    return 'RISK';
  } else if (
    exCount > PLANT_BUSINESS_RULES.WARNING_THRESHOLD ||
    shortCount > PLANT_BUSINESS_RULES.WARNING_THRESHOLD ||
    overdueCount > PLANT_BUSINESS_RULES.WARNING_THRESHOLD
  ) {
    return 'WARNING';
  }
  return 'OPTIMAL';
}

/**
 * Calculates exception severity based on days past due and recovery evidence.
 */
export function calculateExceptionSeverity(
  daysOverdue: number,
  hasRecoveryEvidence: boolean
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  if (daysOverdue > EXCEPTION_SEVERITY_RULES.CRITICAL_DAYS_THRESHOLD) {
    return 'CRITICAL';
  } else if (daysOverdue >= EXCEPTION_SEVERITY_RULES.HIGH_DAYS_THRESHOLD) {
    return 'HIGH';
  } else if (daysOverdue >= 1) {
    if (hasRecoveryEvidence) {
      return 'LOW';
    }
    return 'MEDIUM';
  }
  return 'LOW';
}

/**
 * Classifies system status indicators based on thresholds.
 */
export function calculateSystemAgentStatus(
  name: string,
  metricValue: number
): { status: 'BREACH' | 'ATTENTION' | 'OPERATIONAL'; indicator: string } {
  let threshold = 999999;
  let labelBreach = '🚨 Breach';
  let labelAttention = '⚠️ Attention';
  let labelOptimal = '🟢 Optimal';

  switch (name) {
    case 'Overdue PO Agent':
      threshold = AGENT_BREACH_THRESHOLDS.OVERDUE_PO_BREACH;
      labelBreach = '🚨 Overdue';
      labelAttention = '⚠️ Delay Alert';
      labelOptimal = '🟢 Optimal';
      break;
    case 'Supplier Acknowledgement Agent':
      threshold = AGENT_BREACH_THRESHOLDS.MISSING_ACK_BREACH;
      labelBreach = '🚨 Breach';
      labelAttention = '⚠️ Pending';
      labelOptimal = '🟢 Confirmed';
      break;
    case 'Part Availability Agent':
      threshold = AGENT_BREACH_THRESHOLDS.PART_SHORTAGE_BREACH;
      labelBreach = '🚨 Stock Out';
      labelAttention = '⚠️ Warning';
      labelOptimal = '🟢 Optimal';
      break;
    case 'Exception Analytics Engine':
      threshold = AGENT_BREACH_THRESHOLDS.ACTIVE_EXCEPTIONS_BREACH;
      labelBreach = '🚨 High Load';
      labelOptimal = '🟢 Stable';
      break;
    case 'Planner Collaboration Agent':
      threshold = AGENT_BREACH_THRESHOLDS.UNRESOLVED_COORDINATION_BREACH;
      labelBreach = '🚨 High Risk';
      labelAttention = '⚠️ Warning';
      labelOptimal = '🟢 Active';
      break;
  }

  if (metricValue > threshold) {
    return { status: 'BREACH', indicator: labelBreach };
  } else if (metricValue > 0) {
    return { status: 'ATTENTION', indicator: labelAttention };
  }
  return { status: 'OPERATIONAL', indicator: labelOptimal };
}

/**
 * Formats a timestamp string into relative date description.
 */
export function formatRelativeTimestamp(dateInput: string, todayStr: string): string {
  if (!dateInput) return 'Recent';

  const isIso = dateInput.includes('T');
  let dateObj = new Date(dateInput);

  if (!isIso) {
    const parts = dateInput.split('-');
    if (parts.length === 3) {
      dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    }
  }

  const todayParts = todayStr.split('-');
  const todayObj = new Date(parseInt(todayParts[0]), parseInt(todayParts[1]) - 1, parseInt(todayParts[2]));

  const diffTime = todayObj.getTime() - dateObj.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    if (isIso) {
      let hours = dateObj.getHours();
      const minutes = String(dateObj.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${hours}:${minutes} ${ampm}`;
    }
    return '10:42 AM';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays > 1) {
    return `${diffDays} days ago`;
  } else {
    return 'Recent';
  }
}

/**
 * Dynamically aggregates timeline logs from various data sources.
 */
export function generateDynamicRecentActivity(
  reminders: any[],
  actions: any[],
  responses: any[],
  recommendations: any[],
  parts: any[],
  exceptions: any[],
  todayStr: string
): any[] {
  const activities: { rawDate: string; message: string; type: 'WARNING' | 'INFO' | 'SUCCESS' }[] = [];

  // 1. Reminders
  for (const r of reminders) {
    const date = r.sentAt || r.createdAt;
    if (date) {
      activities.push({
        rawDate: date,
        message: `Automatic alert dispatched: PO ${r.purchaseOrderNumber} overdue warning notification routed to supplier.`,
        type: 'INFO'
      });
    }
  }

  // 2. Actions
  for (const a of actions) {
    if (a.createdAt) {
      activities.push({
        rawDate: a.createdAt,
        message: `Buyer action: PO ${a.purchaseOrderNumber} item ${a.purchaseOrderItem} note added: "${a.note}"`,
        type: 'SUCCESS'
      });
    }
  }

  // 3. Responses
  for (const r of responses) {
    const date = r.respondedAt || r.capturedAt;
    if (date) {
      activities.push({
        rawDate: date,
        message: `Supplier reply captured: PO ${r.purchaseOrderNumber} item ${r.purchaseOrderItem} response received: "${r.rawResponseText || r.rawResponse}"`,
        type: 'SUCCESS'
      });
    }
  }

  // 4. Closed Recommendations
  for (const rec of recommendations) {
    if (
      rec.lifecycleStatus &&
      rec.lifecycleStatus.startsWith('CLOSED') &&
      (rec.closedAt || rec.updatedAt)
    ) {
      activities.push({
        rawDate: rec.closedAt || rec.updatedAt,
        message: `Exception for PO ${rec.purchaseOrderNumber} item ${rec.purchaseOrderItem} resolved: ${rec.closureReason || 'Closed by buyer.'}`,
        type: 'SUCCESS'
      });
    }
  }

  // 5. Parts safety stock breaches (using todayStr as timestamp for warning)
  for (const p of parts) {
    if (p.safety_stock_violation) {
      activities.push({
        rawDate: `${todayStr}T10:42:00.000Z`,
        message: `Safety stock breach: Plant ${p.plant} triggered safety stock violation on material ${p.material_name || p.material_id}.`,
        type: 'WARNING'
      });
    }
  }

  // 6. Exceptions (detected_on)
  for (const e of exceptions) {
    if (e.detected_on && e.status !== 'RESOLVED') {
      activities.push({
        rawDate: `${e.detected_on}T08:30:00.000Z`,
        message: `New exception logged: ${e.exception_type.replace(/_/g, ' ')} detected on PO ${e.po_number || 'N/A'} for plant ${e.plant || 'Unknown'}.`,
        type: 'WARNING'
      });
    }
  }

  // Sort by rawDate descending
  activities.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());

  // Deduplicate identical messages to keep activity feed clean
  const uniqueActivities: any[] = [];
  const seenMessages = new Set<string>();
  for (const act of activities) {
    if (!seenMessages.has(act.message)) {
      seenMessages.add(act.message);
      uniqueActivities.push({
        timestamp: formatRelativeTimestamp(act.rawDate, todayStr),
        message: act.message,
        type: act.type
      });
    }
  }

  return uniqueActivities.slice(0, 5);
}
