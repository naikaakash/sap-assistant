/**
 * Mock Recommendation Store — Phase 8B: Backend Setup
 *
 * Provides local persistence for app-owned recommendation lifecycle records.
 * Reading/writing app-recommendations.json occurs strictly here.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  Recommendation,
  RecommendationInput,
  RecommendationUpdateInput,
  RecommendationStatusTransitionInput,
  RecommendationLifecycleStatus,
  RecommendationSourceModule,
  RecommendationCurrentOwner,
  VerificationStatus,
} from '@/src/types/procurementRecommendations';
import {
  RecommendationConflictError,
  RecommendationNotFoundError,
  RecommendationValidationError,
} from '@/src/types/procurementRecommendations';
import { isSqlMode } from '@/src/services/data/sqlClient';
import { pullRecordsFromSql, pushRecordsToSql } from '@/src/services/data/sqlBlobStore';

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

const STORE_FILE = path.join(process.cwd(), 'data', 'app-recommendations.json');
const SQL_TABLE = 'app_recommendations';

// ---------------------------------------------------------------------------
// In-memory store (module-level singleton)
// ---------------------------------------------------------------------------

let _initialized = false;
let _store: Map<string, Recommendation> = new Map();

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  const dir = path.dirname(STORE_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFromFile(): void {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) {
    // Create empty store file on first run
    fs.writeFileSync(STORE_FILE, '[]', 'utf-8');
    return;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const records: Recommendation[] = JSON.parse(raw);
    _store = new Map(records.map(r => [r.recommendationId, r]));
  } catch (err) {
    console.error('[mockRecommendationStore] Failed to load app-recommendations.json, starting with empty store:', err);
    _store = new Map();
  }
}

function persistToFile(): void {
  ensureDataDir();
  try {
    const records = Array.from(_store.values());
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
    if (isSqlMode()) {
      pushRecordsToSql<Recommendation>(SQL_TABLE, records, 'recommendationId').catch((err) => {
        console.error('[mockRecommendationStore] SQL mirror push failed:', err);
      });
    }
  } catch (err) {
    console.error('[mockRecommendationStore] Failed to persist app-recommendations.json:', err);
  }
}

/**
 * Boot-time hook. See mockActionStore.bootFromSql for full contract.
 */
export async function bootFromSql(): Promise<number> {
  if (!isSqlMode()) return 0;
  try {
    const records = await pullRecordsFromSql<Recommendation>(SQL_TABLE);
    ensureDataDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
    _initialized = false;
    _store = new Map();
    return records.length;
  } catch (err) {
    console.error('[mockRecommendationStore] Boot from SQL failed; will use local file:', err);
    return -1;
  }
}

function init(): void {
  loadFromFile();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public store API
// ---------------------------------------------------------------------------

/**
 * Returns a single recommendation by ID, or null if not found.
 */
export function getRecommendationById(recommendationId: string): Recommendation | null {
  init();
  return _store.get(recommendationId) ?? null;
}

/**
 * Returns recommendations for a specific PO line.
 */
export function getRecommendationsForPurchaseOrderLine(
  purchaseOrderNumber: string,
  purchaseOrderItem: string
): Recommendation[] {
  init();
  return Array.from(_store.values()).filter(
    r =>
      r.purchaseOrderNumber === purchaseOrderNumber &&
      r.purchaseOrderItem === purchaseOrderItem
  );
}

/**
 * Returns recommendations for a specific supplier.
 */
export function getRecommendationsForSupplier(supplierId: string): Recommendation[] {
  init();
  return Array.from(_store.values()).filter(r => r.supplierId === supplierId);
}

/**
 * Creates a new recommendation record.
 * Assigns ID, timestamps, version=1, defaults verificationStatus.
 */
export function createRecommendation(input: RecommendationInput): Recommendation {
  init();

  // Field Validations
  if (!input.sourceModule) {
    throw new RecommendationValidationError('sourceModule', 'is required');
  }
  if (!input.purchaseOrderNumber?.trim()) {
    throw new RecommendationValidationError('purchaseOrderNumber', 'is required');
  }
  if (!input.purchaseOrderItem?.trim()) {
    throw new RecommendationValidationError('purchaseOrderItem', 'is required');
  }
  if (!input.supplierId?.trim()) {
    throw new RecommendationValidationError('supplierId', 'is required');
  }
  if (!input.supplierName?.trim()) {
    throw new RecommendationValidationError('supplierName', 'is required');
  }
  if (!input.recommendationType) {
    throw new RecommendationValidationError('recommendationType', 'is required');
  }
  if (!input.issueReason?.trim()) {
    throw new RecommendationValidationError('issueReason', 'is required');
  }
  if (!input.recommendedActionText?.trim()) {
    throw new RecommendationValidationError('recommendedActionText', 'is required');
  }

  const now = nowIso();
  const createdBy = input.createdBy?.trim() || 'local-user';
  const lifecycleStatus = input.lifecycleStatus || 'RECOMMENDED';
  const currentOwner = input.currentOwner || 'BUYER';
  
  // Default verificationStatus based on status rules
  const verificationStatus = input.verificationStatus || 
    (lifecycleStatus === 'PENDING_BUYER_SAP_UPDATE' || lifecycleStatus === 'VERIFICATION_PENDING'
      ? 'PENDING_NEXT_SYNC'
      : 'NOT_READY');

  const rec: Recommendation = {
    recommendationId: randomUUID(),
    sourceModule: input.sourceModule,
    purchaseOrderNumber: input.purchaseOrderNumber.trim(),
    purchaseOrderItem: input.purchaseOrderItem.trim(),
    supplierId: input.supplierId.trim(),
    supplierName: input.supplierName.trim(),
    recommendationType: input.recommendationType,
    lifecycleStatus,
    currentOwner,
    issueDetectedAt: input.issueDetectedAt || now,
    issueReason: input.issueReason.trim(),
    recommendedActionText: input.recommendedActionText.trim(),
    responseCategory: input.responseCategory,
    interpretedSummary: input.interpretedSummary?.trim(),
    recommendedSapField: input.recommendedSapField?.trim(),
    recommendedSapValue: input.recommendedSapValue?.trim(),
    verificationField: input.verificationField?.trim(),
    expectedValueAfterSync: input.expectedValueAfterSync?.trim(),
    verificationStatus,
    createdBy,
    createdAt: now,
    updatedBy: createdBy,
    updatedAt: now,
    version: 1,
    linkedActionIds: []
  };

  _store.set(rec.recommendationId, rec);
  persistToFile();
  return rec;
}

/**
 * Updates an existing recommendation using optimistic concurrency check.
 */
export function updateRecommendation(
  recommendationId: string,
  input: RecommendationUpdateInput,
  expectedVersion: number
): Recommendation {
  init();

  const existing = _store.get(recommendationId);
  if (!existing) {
    throw new RecommendationNotFoundError(recommendationId);
  }

  if (existing.version !== expectedVersion) {
    throw new RecommendationConflictError(recommendationId, expectedVersion, existing.version);
  }

  const now = nowIso();
  const updatedBy = input.updatedBy?.trim() || 'local-user';

  const updated: Recommendation = {
    ...existing,
    ...(input.recommendationType !== undefined && { recommendationType: input.recommendationType }),
    ...(input.currentOwner !== undefined && { currentOwner: input.currentOwner }),
    ...(input.recommendedActionText !== undefined && { recommendedActionText: input.recommendedActionText.trim() }),
    ...(input.supplierReminderId !== undefined && { supplierReminderId: input.supplierReminderId.trim() }),
    ...(input.supplierResponseId !== undefined && { supplierResponseId: input.supplierResponseId.trim() }),
    ...(input.responseCategory !== undefined && { responseCategory: input.responseCategory }),
    ...(input.interpretedSummary !== undefined && { interpretedSummary: input.interpretedSummary.trim() }),
    ...(input.recommendedSapField !== undefined && { recommendedSapField: input.recommendedSapField.trim() }),
    ...(input.recommendedSapValue !== undefined && { recommendedSapValue: input.recommendedSapValue.trim() }),
    ...(input.verificationField !== undefined && { verificationField: input.verificationField.trim() }),
    ...(input.expectedValueAfterSync !== undefined && { expectedValueAfterSync: input.expectedValueAfterSync.trim() }),
    ...(input.verificationStatus !== undefined && { verificationStatus: input.verificationStatus }),
    ...(input.verificationMessage !== undefined && { verificationMessage: input.verificationMessage.trim() }),
    ...(input.closureReason !== undefined && { closureReason: input.closureReason.trim() }),
    updatedBy,
    updatedAt: now,
    version: existing.version + 1
  };

  _store.set(recommendationId, updated);
  persistToFile();
  return updated;
}

/**
 * Transitions recommendation status.
 */
export function transitionRecommendationStatus(
  recommendationId: string,
  transitionInput: RecommendationStatusTransitionInput,
  expectedVersion: number
): Recommendation {
  init();

  const existing = _store.get(recommendationId);
  if (!existing) {
    throw new RecommendationNotFoundError(recommendationId);
  }

  if (existing.version !== expectedVersion) {
    throw new RecommendationConflictError(recommendationId, expectedVersion, existing.version);
  }

  const now = nowIso();
  const updatedBy = transitionInput.updatedBy?.trim() || 'local-user';
  const nextStatus = transitionInput.nextStatus;
  
  // Logical defaults for owner based on status
  let owner = transitionInput.currentOwner || existing.currentOwner;
  if (!transitionInput.currentOwner) {
    if (nextStatus === 'PENDING_SUPPLIER_RESPONSE') {
      owner = 'SUPPLIER';
    } else if (nextStatus === 'VERIFICATION_PENDING') {
      owner = 'SOURCE_SYSTEM';
    } else if (nextStatus === 'CONFIRMED_RESOLVED' || nextStatus === 'CLOSED_NO_ACTION') {
      owner = 'NONE';
    } else if (nextStatus === 'PENDING_BUYER_ACTION' || nextStatus === 'PENDING_BUYER_SAP_UPDATE') {
      owner = 'BUYER';
    }
  }

  // Verification status logic based on state transitions
  let verificationStatus = transitionInput.verificationStatus || existing.verificationStatus;
  if (!transitionInput.verificationStatus) {
    if (nextStatus === 'CONFIRMED_RESOLVED') {
      verificationStatus = 'PASSED';
    } else if (nextStatus === 'CLOSED_NO_ACTION') {
      verificationStatus = 'MANUALLY_CLOSED';
    } else if (nextStatus === 'VERIFICATION_PENDING' || nextStatus === 'PENDING_BUYER_SAP_UPDATE') {
      verificationStatus = 'PENDING_NEXT_SYNC';
    }
  }

  const closedAt = (nextStatus === 'CONFIRMED_RESOLVED' || nextStatus === 'CLOSED_NO_ACTION') ? now : existing.closedAt;

  const updated: Recommendation = {
    ...existing,
    lifecycleStatus: nextStatus,
    currentOwner: owner,
    verificationStatus,
    closedAt,
    ...(transitionInput.closureReason !== undefined && { closureReason: transitionInput.closureReason.trim() }),
    updatedBy,
    updatedAt: now,
    version: existing.version + 1
  };

  _store.set(recommendationId, updated);
  persistToFile();
  return updated;
}

/**
 * Links a ProcurementAction ID to the recommendation.
 */
export function linkActionToRecommendation(
  recommendationId: string,
  actionId: string,
  expectedVersion: number
): Recommendation {
  init();

  const existing = _store.get(recommendationId);
  if (!existing) {
    throw new RecommendationNotFoundError(recommendationId);
  }

  if (existing.version !== expectedVersion) {
    throw new RecommendationConflictError(recommendationId, expectedVersion, existing.version);
  }

  if (!actionId?.trim()) {
    throw new RecommendationValidationError('actionId', 'is required');
  }

  const cleanActionId = actionId.trim();
  
  // Avoid duplicate linking
  if (existing.linkedActionIds.includes(cleanActionId)) {
    return existing;
  }

  const now = nowIso();

  const updated: Recommendation = {
    ...existing,
    linkedActionIds: [...existing.linkedActionIds, cleanActionId],
    updatedAt: now,
    version: existing.version + 1
  };

  _store.set(recommendationId, updated);
  persistToFile();
  return updated;
}

/**
 * Lists recommendations matching filters.
 */
export function listRecommendations(filters: {
  status?: RecommendationLifecycleStatus;
  supplierId?: string;
  purchaseOrderNumber?: string;
  sourceModule?: RecommendationSourceModule;
  owner?: RecommendationCurrentOwner;
  offset?: number;
  limit?: number;
} = {}): Recommendation[] {
  init();

  let results = Array.from(_store.values());

  if (filters.status) {
    results = results.filter(r => r.lifecycleStatus === filters.status);
  }
  if (filters.supplierId) {
    results = results.filter(r => r.supplierId === filters.supplierId);
  }
  if (filters.purchaseOrderNumber) {
    results = results.filter(r => r.purchaseOrderNumber === filters.purchaseOrderNumber);
  }
  if (filters.sourceModule) {
    results = results.filter(r => r.sourceModule === filters.sourceModule);
  }
  if (filters.owner) {
    results = results.filter(r => r.currentOwner === filters.owner);
  }

  // Sort: newest first
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return results.slice(offset, offset + limit);
}

/**
 * Returns only open recommendations (not CONFIRMED_RESOLVED or CLOSED_NO_ACTION).
 */
export function listOpenRecommendations(): Recommendation[] {
  init();
  return Array.from(_store.values())
    .filter(r => r.lifecycleStatus !== 'CONFIRMED_RESOLVED' && r.lifecycleStatus !== 'CLOSED_NO_ACTION')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Returns recommendations filtered by lifecycle status.
 */
export function listRecommendationsByStatus(status: RecommendationLifecycleStatus): Recommendation[] {
  return listRecommendations({ status });
}

/**
 * Reloads store from disk (for testing and admin utility).
 */
export function reloadFromDisk(): void {
  _initialized = false;
  _store = new Map();
  init();
}
