/**
 * businessRules.ts
 * Centralized, audited, and documented business rules and thresholds configuration.
 * Separates decision-making boundaries from data fetching and UI layers.
 */

export const PLANT_BUSINESS_RULES = {
  // Threshold count of active (unresolved) exceptions to trigger plant RISK (Red) status
  CRITICAL_EXCEPTION_COUNT_THRESHOLD: 4,
  // Threshold count of safety stock breaches to trigger plant RISK (Red) status
  CRITICAL_SHORTAGE_COUNT_THRESHOLD: 3,
  // Trigger warning (Yellow) if there is any active issue
  WARNING_THRESHOLD: 0,
};

export const AGENT_BREACH_THRESHOLDS = {
  // Overdue PO Agent breach limit
  OVERDUE_PO_BREACH: 10,
  // Supplier Acknowledgement Agent breach limit
  MISSING_ACK_BREACH: 8,
  // Part Availability Agent breach limit
  PART_SHORTAGE_BREACH: 3,
  // Exception Analytics Engine breach limit
  ACTIVE_EXCEPTIONS_BREACH: 15,
  // Planner Collaboration Agent breach limit
  UNRESOLVED_COORDINATION_BREACH: 5,
};

export const EXCEPTION_SEVERITY_RULES = {
  // Overdue days above this threshold are classified as CRITICAL
  CRITICAL_DAYS_THRESHOLD: 7,
  // Overdue days above this threshold (up to critical) are classified as HIGH
  HIGH_DAYS_THRESHOLD: 3,
};
