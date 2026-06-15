/**
 * Mock Action Store — Phase 7A: App-Owned Action Layer
 *
 * Provides local persistence for app-owned buyer workflow/action records.
 * This module is the ONLY place in the codebase that reads and writes
 * app-owned action data.
 *
 * Persistence strategy:
 *   - Primary: module-level in-memory Map (survives Next.js HMR within one process).
 *   - Secondary: JSON file at data/app-actions.json for cross-restart durability.
 *   - On startup (first read): loads from JSON file into memory.
 *   - On every mutation: writes the full store back to JSON file synchronously.
 *
 * Limitations (documented for future replacement):
 *   - The JSON file is local to the server process. This works in development
 *     and `next start` on a single machine. It is NOT suitable for:
 *       * Serverless deployment (Vercel, AWS Lambda) — file writes will be lost.
 *       * Multi-instance deployments — instances won't share state.
 *       * Production use — replace with Azure SQL, Supabase, or Prisma in Phase 8.
 *   - File writes are synchronous (fs.writeFileSync) to keep the API simple.
 *     For higher write throughput, switch to async + write queue in Phase 8.
 *
 * Replacement path:
 *   Replace this file with a real database adapter (e.g. src/services/dbActionStore.ts)
 *   implementing the same exported function signatures.
 *   Update procurementActionService.ts to import the new adapter.
 *   No API route code changes required.
 *
 * Design rules:
 *   - NEVER imports csvDataService or procurementDataService.
 *   - NEVER modifies CSV source files.
 *   - NEVER reads or writes SAP-owned PO data.
 *   - All data stored here is app-owned workflow state only.
 *
 * See: docs/APP_OWNED_ACTION_LAYER.md
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  ProcurementAction,
  ProcurementActionInput,
  ProcurementActionUpdateInput,
  ActionListFilters,
  ProcurementActionType,
  ActionSourceModule,
} from '@/src/types/procurementActions';
import {
  ActionConflictError,
  ActionNotFoundError,
  ActionValidationError,
} from '@/src/types/procurementActions';
import { isSqlMode } from '@/src/services/data/sqlClient';
import { pullRecordsFromSql, pushRecordsToSql } from '@/src/services/data/sqlBlobStore';

// ---------------------------------------------------------------------------
// File path
// ---------------------------------------------------------------------------

const STORE_FILE = path.join(process.cwd(), 'data', 'app-actions.json');
const SQL_TABLE = 'app_actions';

// ---------------------------------------------------------------------------
// In-memory store (module-level singleton)
// ---------------------------------------------------------------------------

let _initialized = false;
let _store: Map<string, ProcurementAction> = new Map();

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
    const records: ProcurementAction[] = JSON.parse(raw);
    _store = new Map(records.map(r => [r.actionId, r]));
  } catch (err) {
    console.error('[mockActionStore] Failed to load app-actions.json, starting with empty store:', err);
    _store = new Map();
  }
}

function persistToFile(): void {
  ensureDataDir();
  try {
    const records = Array.from(_store.values());
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
    if (isSqlMode()) {
      // Fire-and-forget mirror to SQL. Errors are logged but never thrown so
      // sync callers stay sync. The next boot will repair drift either way.
      pushRecordsToSql<ProcurementAction>(SQL_TABLE, records, 'actionId').catch((err) => {
        console.error('[mockActionStore] SQL mirror push failed:', err);
      });
    }
  } catch (err) {
    // Log but don't throw — in-memory store still works even if file write fails
    console.error('[mockActionStore] Failed to persist app-actions.json:', err);
  }
}

/**
 * Boot-time hook. When DATA_SOURCE=sql, pulls the canonical record set from
 * SQL and writes it to the local JSON file BEFORE any sync init() runs. This
 * primes the store so subsequent sync reads see the SQL data.
 *
 * Called from instrumentation.ts. Safe to call multiple times.
 */
export async function bootFromSql(): Promise<number> {
  if (!isSqlMode()) return 0;
  try {
    const records = await pullRecordsFromSql<ProcurementAction>(SQL_TABLE);
    ensureDataDir();
    fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2), 'utf-8');
    // Force any subsequent init() to reload from the freshly-pulled file.
    _initialized = false;
    _store = new Map();
    return records.length;
  } catch (err) {
    console.error('[mockActionStore] Boot from SQL failed; will use local file:', err);
    return -1;
  }
}

function init(): void {
  if (!_initialized) {
    loadFromFile();
    _initialized = true;
  }
}

// ---------------------------------------------------------------------------
// Internal timestamp helper
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Public store API
// ---------------------------------------------------------------------------

/**
 * Returns all actions for a specific PO line.
 */
export function getActionsForPurchaseOrderLine(
  purchaseOrderNumber: string,
  purchaseOrderItem: string
): ProcurementAction[] {
  init();
  return Array.from(_store.values()).filter(
    a =>
      a.purchaseOrderNumber === purchaseOrderNumber &&
      a.purchaseOrderItem === purchaseOrderItem
  );
}

/**
 * Returns all actions for a specific supplier.
 */
export function getActionsForSupplier(supplierId: string): ProcurementAction[] {
  init();
  return Array.from(_store.values()).filter(a => a.supplierId === supplierId);
}

/**
 * Returns a single action by ID, or null if not found.
 */
export function getActionById(actionId: string): ProcurementAction | null {
  init();
  return _store.get(actionId) ?? null;
}

/**
 * Creates a new action record.
 * Assigns actionId, timestamps, version=1, sourceSystem, and sapSyncStatus.
 *
 * Throws ActionValidationError if required fields are missing.
 */
export function createAction(input: ProcurementActionInput): ProcurementAction {
  init();

  // Validation
  if (!input.purchaseOrderNumber?.trim()) {
    throw new ActionValidationError('purchaseOrderNumber', 'is required');
  }
  if (!input.purchaseOrderItem?.trim()) {
    throw new ActionValidationError('purchaseOrderItem', 'is required');
  }
  if (!input.supplierId?.trim()) {
    throw new ActionValidationError('supplierId', 'is required');
  }
  if (!input.supplierName?.trim()) {
    throw new ActionValidationError('supplierName', 'is required');
  }
  if (!input.actionType) {
    throw new ActionValidationError('actionType', 'is required');
  }

  const now = nowIso();
  const createdBy = input.createdBy ?? 'SYSTEM';

  const action: ProcurementAction = {
    actionId: randomUUID(),
    purchaseOrderNumber: input.purchaseOrderNumber.trim(),
    purchaseOrderItem: input.purchaseOrderItem.trim(),
    scheduleLine: input.scheduleLine?.trim(),
    supplierId: input.supplierId.trim(),
    supplierName: input.supplierName.trim(),
    actionType: input.actionType,
    actionStatus: 'OPEN',
    sourceModule: input.sourceModule ?? 'SYSTEM',
    note: input.note?.trim() ?? '',
    assignedTo: input.assignedTo?.trim(),
    reminderDate: input.reminderDate?.trim(),
    supplierContacted: input.supplierContacted ?? false,
    escalationFlag: input.escalationFlag ?? false,
    riskClassification: input.riskClassification,
    reviewStatus: input.reviewStatus ?? 'UNREVIEWED',
    evidenceType: input.evidenceType,
    evidenceReference: input.evidenceReference?.trim(),
    createdBy,
    createdAt: now,
    updatedBy: createdBy,
    updatedAt: now,
    version: 1,
    sourceSystem: 'APP',
    sapSyncStatus: 'APP_ONLY',
  };

  _store.set(action.actionId, action);
  persistToFile();
  return action;
}

/**
 * Updates an existing action record using optimistic concurrency.
 *
 * Throws ActionNotFoundError if actionId does not exist.
 * Throws ActionConflictError if expectedVersion does not match stored version.
 */
export function updateAction(
  actionId: string,
  input: ProcurementActionUpdateInput
): ProcurementAction {
  init();

  const existing = _store.get(actionId);
  if (!existing) {
    throw new ActionNotFoundError(actionId);
  }

  // Optimistic concurrency check
  if (existing.version !== input.expectedVersion) {
    throw new ActionConflictError(actionId, input.expectedVersion, existing.version);
  }

  const now = nowIso();
  const updatedBy = input.updatedBy ?? 'SYSTEM';

  // Apply only the fields that were provided (partial update)
  const updated: ProcurementAction = {
    ...existing,
    ...(input.actionStatus !== undefined && { actionStatus: input.actionStatus }),
    ...(input.note !== undefined && { note: input.note.trim() }),
    ...(input.assignedTo !== undefined && { assignedTo: input.assignedTo.trim() }),
    ...(input.reminderDate !== undefined && { reminderDate: input.reminderDate.trim() }),
    ...(input.supplierContacted !== undefined && { supplierContacted: input.supplierContacted }),
    ...(input.escalationFlag !== undefined && { escalationFlag: input.escalationFlag }),
    ...(input.riskClassification !== undefined && { riskClassification: input.riskClassification }),
    ...(input.reviewStatus !== undefined && { reviewStatus: input.reviewStatus }),
    ...(input.evidenceType !== undefined && { evidenceType: input.evidenceType }),
    ...(input.evidenceReference !== undefined && { evidenceReference: input.evidenceReference.trim() }),
    updatedBy,
    updatedAt: now,
    version: existing.version + 1,    // Always increment — never skip
  };

  _store.set(actionId, updated);
  persistToFile();
  return updated;
}

/**
 * Returns all actions matching the provided filters.
 * If no filters are provided, returns all actions.
 */
export function listActions(filters: ActionListFilters = {}): ProcurementAction[] {
  init();

  let results = Array.from(_store.values());

  if (filters.purchaseOrderNumber) {
    results = results.filter(a => a.purchaseOrderNumber === filters.purchaseOrderNumber);
  }
  if (filters.purchaseOrderItem) {
    results = results.filter(a => a.purchaseOrderItem === filters.purchaseOrderItem);
  }
  if (filters.supplierId) {
    results = results.filter(a => a.supplierId === filters.supplierId);
  }
  if (filters.actionType) {
    results = results.filter(a => a.actionType === filters.actionType);
  }
  if (filters.actionStatus) {
    results = results.filter(a => a.actionStatus === filters.actionStatus);
  }
  if (filters.sourceModule) {
    results = results.filter(a => a.sourceModule === filters.sourceModule);
  }
  if (filters.assignedTo) {
    results = results.filter(a => a.assignedTo === filters.assignedTo);
  }
  if (filters.escalationFlag !== undefined) {
    results = results.filter(a => a.escalationFlag === filters.escalationFlag);
  }

  // Sort: newest first
  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Pagination
  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return results.slice(offset, offset + limit);
}

/**
 * Returns only OPEN and IN_PROGRESS actions.
 */
export function listOpenActions(filters: Omit<ActionListFilters, 'actionStatus'> = {}): ProcurementAction[] {
  init();
  const open = listActions({ ...filters, actionStatus: 'OPEN' });
  const inProgress = listActions({ ...filters, actionStatus: 'IN_PROGRESS' });
  return [...open, ...inProgress].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Returns all actions originating from a specific source module.
 */
export function listActionsByModule(
  sourceModule: ActionSourceModule,
  filters?: Omit<ActionListFilters, 'sourceModule'>
): ProcurementAction[] {
  return listActions({ ...filters, sourceModule });
}

/**
 * Returns total count of actions in the store (for diagnostics/admin).
 */
export function getActionCount(): number {
  init();
  return _store.size;
}

/**
 * Reloads the store from disk. Useful if the JSON file was externally modified.
 * Not intended for regular use — exposed for testing and admin only.
 */
export function reloadFromDisk(): void {
  _initialized = false;
  _store = new Map();
  init();
}
