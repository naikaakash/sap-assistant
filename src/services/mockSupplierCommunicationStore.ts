/**
 * Mock Supplier Communication Store — Phase 8C
 *
 * Provides local file-backed persistence for:
 *   - SupplierReminder records  → data/app-supplier-reminders.json
 *   - SupplierResponse records  → data/app-supplier-responses.json
 *
 * Rules:
 *   - Reads/writes ONLY the above two files. Never touches SAP data.
 *   - Implements optimistic concurrency via version field.
 *   - All state transitions are validated before mutation.
 *   - This module is the only place that reads/writes the supplier comms files.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  SupplierReminder,
  SupplierReminderInput,
  SupplierReminderUpdateInput,
  SupplierResponse,
  SupplierResponseInput,
  SupplierResponseInterpretationInput,
  SupplierReminderStatus,
  SupplierResponseStatus,
  SupplierCommunicationChannel,
  SupplierReminderSendMode,
  SupplierReminderDeliveryStatus,
} from '@/src/types/supplierCommunications';
import {
  SupplierReminderNotFoundError,
  SupplierResponseNotFoundError,
  SupplierCommunicationConflictError,
  SupplierCommunicationValidationError,
  SupplierCommunicationStateError,
} from '@/src/types/supplierCommunications';
import { isSqlMode } from '@/src/services/data/sqlClient';
import { pullRecordsFromSql, pushRecordsToSql } from '@/src/services/data/sqlBlobStore';

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const REMINDERS_FILE = path.join(process.cwd(), 'data', 'app-supplier-reminders.json');
const RESPONSES_FILE = path.join(process.cwd(), 'data', 'app-supplier-responses.json');
const REMINDERS_SQL_TABLE = 'app_supplier_reminders';
const RESPONSES_SQL_TABLE = 'app_supplier_responses';

// ---------------------------------------------------------------------------
// In-memory stores (module-level singletons)
// ---------------------------------------------------------------------------

let _remindersInitialized = false;
let _responsesInitialized = false;
let _remindersStore: Map<string, SupplierReminder> = new Map();
let _responsesStore: Map<string, SupplierResponse> = new Map();

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function ensureDataDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadReminders(): void {
  ensureDataDir(REMINDERS_FILE);
  if (!fs.existsSync(REMINDERS_FILE)) {
    fs.writeFileSync(REMINDERS_FILE, '[]', 'utf-8');
    return;
  }
  try {
    const raw = fs.readFileSync(REMINDERS_FILE, 'utf-8');
    const records: SupplierReminder[] = JSON.parse(raw);
    _remindersStore = new Map(records.map(r => [r.reminderId, r]));
  } catch (err) {
    console.error('[mockSupplierCommunicationStore] Failed to load app-supplier-reminders.json:', err);
    _remindersStore = new Map();
  }
}

function persistReminders(): void {
  ensureDataDir(REMINDERS_FILE);
  try {
    const records = Array.from(_remindersStore.values());
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(records, null, 2), 'utf-8');
    if (isSqlMode()) {
      pushRecordsToSql<SupplierReminder>(REMINDERS_SQL_TABLE, records, 'reminderId').catch((err) => {
        console.error('[mockSupplierCommunicationStore] SQL mirror push failed (reminders):', err);
      });
    }
  } catch (err) {
    console.error('[mockSupplierCommunicationStore] Failed to persist app-supplier-reminders.json:', err);
  }
}

function loadResponses(): void {
  ensureDataDir(RESPONSES_FILE);
  if (!fs.existsSync(RESPONSES_FILE)) {
    fs.writeFileSync(RESPONSES_FILE, '[]', 'utf-8');
    return;
  }
  try {
    const raw = fs.readFileSync(RESPONSES_FILE, 'utf-8');
    const records: SupplierResponse[] = JSON.parse(raw);
    _responsesStore = new Map(records.map(r => [r.responseId, r]));
  } catch (err) {
    console.error('[mockSupplierCommunicationStore] Failed to load app-supplier-responses.json:', err);
    _responsesStore = new Map();
  }
}

function persistResponses(): void {
  ensureDataDir(RESPONSES_FILE);
  try {
    const records = Array.from(_responsesStore.values());
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(records, null, 2), 'utf-8');
    if (isSqlMode()) {
      pushRecordsToSql<SupplierResponse>(RESPONSES_SQL_TABLE, records, 'responseId').catch((err) => {
        console.error('[mockSupplierCommunicationStore] SQL mirror push failed (responses):', err);
      });
    }
  } catch (err) {
    console.error('[mockSupplierCommunicationStore] Failed to persist app-supplier-responses.json:', err);
  }
}

/**
 * Boot-time hook. When DATA_SOURCE=sql, pulls both reminder and response
 * record sets from SQL and writes them to local JSON files BEFORE any sync
 * init() runs. Called from instrumentation.ts.
 */
export async function bootFromSql(): Promise<{ reminders: number; responses: number }> {
  if (!isSqlMode()) return { reminders: 0, responses: 0 };
  let reminderCount = -1;
  let responseCount = -1;
  try {
    const reminders = await pullRecordsFromSql<SupplierReminder>(REMINDERS_SQL_TABLE);
    ensureDataDir(REMINDERS_FILE);
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify(reminders, null, 2), 'utf-8');
    _remindersInitialized = false;
    _remindersStore = new Map();
    reminderCount = reminders.length;
  } catch (err) {
    console.error('[mockSupplierCommunicationStore] Boot reminders failed:', err);
  }
  try {
    const responses = await pullRecordsFromSql<SupplierResponse>(RESPONSES_SQL_TABLE);
    ensureDataDir(RESPONSES_FILE);
    fs.writeFileSync(RESPONSES_FILE, JSON.stringify(responses, null, 2), 'utf-8');
    _responsesInitialized = false;
    _responsesStore = new Map();
    responseCount = responses.length;
  } catch (err) {
    console.error('[mockSupplierCommunicationStore] Boot responses failed:', err);
  }
  return { reminders: reminderCount, responses: responseCount };
}

function initReminders(): void {
  loadReminders();
}

function initResponses(): void {
  loadResponses();
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Supplier Reminder — Store API
// ---------------------------------------------------------------------------

/**
 * Returns a single reminder by ID, or null if not found.
 */
export function getReminderById(reminderId: string): SupplierReminder | null {
  initReminders();
  return _remindersStore.get(reminderId) ?? null;
}

/**
 * Returns all reminders linked to a recommendation.
 */
export function getRemindersByRecommendationId(recommendationId: string): SupplierReminder[] {
  initReminders();
  return Array.from(_remindersStore.values())
    .filter(r => r.recommendationId === recommendationId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Returns all reminders for a given PO/item.
 */
export function getRemindersByPurchaseOrder(
  purchaseOrderNumber: string,
  purchaseOrderItem: string
): SupplierReminder[] {
  initReminders();
  return Array.from(_remindersStore.values())
    .filter(r => r.purchaseOrderNumber === purchaseOrderNumber && r.purchaseOrderItem === purchaseOrderItem)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Returns all reminders for a supplier.
 */
export function getRemindersBySupplierId(supplierId: string): SupplierReminder[] {
  initReminders();
  return Array.from(_remindersStore.values())
    .filter(r => r.supplierId === supplierId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Lists reminders with optional filters and pagination.
 */
export function listReminders(filters: {
  status?: SupplierReminderStatus;
  supplierId?: string;
  purchaseOrderNumber?: string;
  recommendationId?: string;
  offset?: number;
  limit?: number;
} = {}): SupplierReminder[] {
  initReminders();

  let results = Array.from(_remindersStore.values());

  if (filters.status) results = results.filter(r => r.reminderStatus === filters.status);
  if (filters.supplierId) results = results.filter(r => r.supplierId === filters.supplierId);
  if (filters.purchaseOrderNumber) results = results.filter(r => r.purchaseOrderNumber === filters.purchaseOrderNumber);
  if (filters.recommendationId) results = results.filter(r => r.recommendationId === filters.recommendationId);

  results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return results.slice(offset, offset + limit);
}

/**
 * Creates a new supplier reminder record in SENT status.
 * In the mock layer, sending is instantaneous — no DRAFT intermediary required.
 */
export function createReminder(input: SupplierReminderInput): SupplierReminder {
  initReminders();

  // Validations
  if (!input.recommendationId?.trim()) {
    throw new SupplierCommunicationValidationError('recommendationId', 'is required');
  }
  if (!input.purchaseOrderNumber?.trim()) {
    throw new SupplierCommunicationValidationError('purchaseOrderNumber', 'is required');
  }
  if (!input.purchaseOrderItem?.trim()) {
    throw new SupplierCommunicationValidationError('purchaseOrderItem', 'is required');
  }
  if (!input.supplierId?.trim()) {
    throw new SupplierCommunicationValidationError('supplierId', 'is required');
  }
  if (!input.supplierName?.trim()) {
    throw new SupplierCommunicationValidationError('supplierName', 'is required');
  }
  if (!input.subject?.trim()) {
    throw new SupplierCommunicationValidationError('subject', 'is required');
  }
  if (!input.bodyText?.trim()) {
    throw new SupplierCommunicationValidationError('bodyText', 'is required');
  }

  const now = nowIso();
  const createdBy = input.createdBy?.trim() || 'local-user';
  const channel: SupplierCommunicationChannel = input.channel ?? 'EMAIL';

  const sendMode: SupplierReminderSendMode = input.sendMode || 'MOCK';
  const deliveryStatus: SupplierReminderDeliveryStatus = input.deliveryStatus || 'MOCK_SENT';
  const loggedAt = sendMode === 'MOCK' ? now : undefined;

  const reminder: SupplierReminder = {
    reminderId: randomUUID(),
    recommendationId: input.recommendationId.trim(),
    purchaseOrderNumber: input.purchaseOrderNumber.trim(),
    purchaseOrderItem: input.purchaseOrderItem.trim(),
    supplierId: input.supplierId.trim(),
    supplierName: input.supplierName.trim(),
    supplierEmail: input.supplierEmail?.trim(),
    channel,
    reminderStatus: 'SENT', // Mock: all reminders go directly to SENT
    subject: input.subject.trim(),
    bodyText: input.bodyText.trim(),
    sentAt: now, // Mock: sent immediately on creation
    createdBy,
    createdAt: now,
    updatedBy: createdBy,
    updatedAt: now,
    version: 1,

    // Email Metadata Fields
    scheduleLine: input.scheduleLine,
    ccEmails: input.ccEmails,
    sendMode,
    deliveryStatus,
    providerMessage: input.providerMessage,
    providerMessageId: input.providerMessageId,
    errorMessage: input.errorMessage,
    loggedAt,
    sentBy: input.sentBy,
  };

  _remindersStore.set(reminder.reminderId, reminder);
  persistReminders();
  return reminder;
}

/**
 * Updates mutable fields of a reminder (only when status is SENT — subject/body cannot be changed after CANCELLED).
 */
export function updateReminder(
  reminderId: string,
  input: SupplierReminderUpdateInput,
  expectedVersion: number
): SupplierReminder {
  initReminders();

  const existing = _remindersStore.get(reminderId);
  if (!existing) throw new SupplierReminderNotFoundError(reminderId);
  if (existing.version !== expectedVersion) {
    throw new SupplierCommunicationConflictError('reminder', reminderId, expectedVersion, existing.version);
  }
  if (existing.reminderStatus === 'CANCELLED') {
    throw new SupplierCommunicationStateError(`Cannot update cancelled reminder "${reminderId}".`);
  }

  const now = nowIso();
  const updatedBy = input.updatedBy?.trim() || 'local-user';

  const updated: SupplierReminder = {
    ...existing,
    ...(input.supplierEmail !== undefined && { supplierEmail: input.supplierEmail?.trim() }),
    ...(input.channel !== undefined && { channel: input.channel }),
    ...(input.subject !== undefined && { subject: input.subject.trim() }),
    ...(input.bodyText !== undefined && { bodyText: input.bodyText.trim() }),
    updatedBy,
    updatedAt: now,
    version: existing.version + 1,
  };

  _remindersStore.set(reminderId, updated);
  persistReminders();
  return updated;
}

/**
 * Cancels a SENT reminder.
 */
export function cancelReminder(
  reminderId: string,
  cancellationReason: string,
  expectedVersion: number,
  cancelledBy?: string
): SupplierReminder {
  initReminders();

  const existing = _remindersStore.get(reminderId);
  if (!existing) throw new SupplierReminderNotFoundError(reminderId);
  if (existing.version !== expectedVersion) {
    throw new SupplierCommunicationConflictError('reminder', reminderId, expectedVersion, existing.version);
  }
  if (existing.reminderStatus === 'CANCELLED') {
    throw new SupplierCommunicationStateError(`Reminder "${reminderId}" is already cancelled.`);
  }

  const now = nowIso();
  const updatedBy = cancelledBy?.trim() || 'local-user';

  const updated: SupplierReminder = {
    ...existing,
    reminderStatus: 'CANCELLED',
    cancelledAt: now,
    cancellationReason: cancellationReason.trim(),
    updatedBy,
    updatedAt: now,
    version: existing.version + 1,
  };

  _remindersStore.set(reminderId, updated);
  persistReminders();
  return updated;
}

// ---------------------------------------------------------------------------
// Supplier Response — Store API
// ---------------------------------------------------------------------------

/**
 * Returns a single response by ID, or null.
 */
export function getResponseById(responseId: string): SupplierResponse | null {
  initResponses();
  return _responsesStore.get(responseId) ?? null;
}

/**
 * Returns all responses linked to a recommendation.
 */
export function getResponsesByRecommendationId(recommendationId: string): SupplierResponse[] {
  initResponses();
  return Array.from(_responsesStore.values())
    .filter(r => r.recommendationId === recommendationId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/**
 * Returns all responses for a reminder.
 */
export function getResponsesByReminderId(reminderId: string): SupplierResponse[] {
  initResponses();
  return Array.from(_responsesStore.values())
    .filter(r => r.reminderId === reminderId)
    .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
}

/**
 * Lists responses with optional filters and pagination.
 */
export function listResponses(filters: {
  status?: SupplierResponseStatus;
  supplierId?: string;
  purchaseOrderNumber?: string;
  recommendationId?: string;
  reminderId?: string;
  offset?: number;
  limit?: number;
} = {}): SupplierResponse[] {
  initResponses();

  let results = Array.from(_responsesStore.values());

  if (filters.status) results = results.filter(r => r.responseStatus === filters.status);
  if (filters.supplierId) results = results.filter(r => r.supplierId === filters.supplierId);
  if (filters.purchaseOrderNumber) results = results.filter(r => r.purchaseOrderNumber === filters.purchaseOrderNumber);
  if (filters.recommendationId) results = results.filter(r => r.recommendationId === filters.recommendationId);
  if (filters.reminderId) results = results.filter(r => r.reminderId === filters.reminderId);

  results.sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));

  const offset = filters.offset ?? 0;
  const limit = filters.limit ?? 100;
  return results.slice(offset, offset + limit);
}

/**
 * Captures a new supplier response.
 */
export function createResponse(input: SupplierResponseInput): SupplierResponse {
  initResponses();

  // Validations
  if (!input.recommendationId?.trim()) {
    throw new SupplierCommunicationValidationError('recommendationId', 'is required');
  }
  if (!input.purchaseOrderNumber?.trim()) {
    throw new SupplierCommunicationValidationError('purchaseOrderNumber', 'is required');
  }
  if (!input.purchaseOrderItem?.trim()) {
    throw new SupplierCommunicationValidationError('purchaseOrderItem', 'is required');
  }
  if (!input.supplierId?.trim()) {
    throw new SupplierCommunicationValidationError('supplierId', 'is required');
  }
  if (!input.supplierName?.trim()) {
    throw new SupplierCommunicationValidationError('supplierName', 'is required');
  }
  if (!input.rawResponseText?.trim()) {
    throw new SupplierCommunicationValidationError('rawResponseText', 'is required');
  }

  const now = nowIso();
  const createdBy = input.createdBy?.trim() || 'local-user';
  const channel: SupplierCommunicationChannel = input.channel ?? 'EMAIL';
  const respondedAt = input.respondedAt?.trim() || now;

  const response: SupplierResponse = {
    responseId: randomUUID(),
    reminderId: input.reminderId?.trim(),
    recommendationId: input.recommendationId.trim(),
    purchaseOrderNumber: input.purchaseOrderNumber.trim(),
    purchaseOrderItem: input.purchaseOrderItem.trim(),
    supplierId: input.supplierId.trim(),
    supplierName: input.supplierName.trim(),
    channel,
    responseStatus: 'CAPTURED',
    responseCategory: input.responseCategory,
    rawResponseText: input.rawResponseText.trim(),
    interpretedSummary: input.interpretedSummary?.trim(),
    proposedNewDeliveryDate: input.proposedNewDeliveryDate?.trim(),
    proposedNewQuantity: input.proposedNewQuantity,
    proposedNewPrice: input.proposedNewPrice,
    respondedAt,
    capturedAt: now,
    capturedBy: createdBy,
    createdBy,
    createdAt: now,
    updatedBy: createdBy,
    updatedAt: now,
    version: 1,
  };

  _responsesStore.set(response.responseId, response);
  persistResponses();
  return response;
}

/**
 * Adds interpretation data to an existing response.
 * Transitions status to INTERPRETED.
 */
export function interpretResponse(
  responseId: string,
  input: SupplierResponseInterpretationInput,
  expectedVersion: number
): SupplierResponse {
  initResponses();

  const existing = _responsesStore.get(responseId);
  if (!existing) throw new SupplierResponseNotFoundError(responseId);
  if (existing.version !== expectedVersion) {
    throw new SupplierCommunicationConflictError('response', responseId, expectedVersion, existing.version);
  }
  if (existing.responseStatus === 'DISMISSED') {
    throw new SupplierCommunicationStateError(`Cannot interpret dismissed response "${responseId}".`);
  }

  if (!input.responseCategory) {
    throw new SupplierCommunicationValidationError('responseCategory', 'is required for interpretation');
  }
  if (!input.interpretedSummary?.trim()) {
    throw new SupplierCommunicationValidationError('interpretedSummary', 'is required for interpretation');
  }

  const now = nowIso();
  const interpretedBy = input.interpretedBy?.trim() || 'local-user';

  const updated: SupplierResponse = {
    ...existing,
    responseCategory: input.responseCategory,
    interpretedSummary: input.interpretedSummary.trim(),
    proposedNewDeliveryDate: input.proposedNewDeliveryDate?.trim() ?? existing.proposedNewDeliveryDate,
    proposedNewQuantity: input.proposedNewQuantity ?? existing.proposedNewQuantity,
    proposedNewPrice: input.proposedNewPrice ?? existing.proposedNewPrice,
    responseStatus: 'INTERPRETED',
    interpretedBy,
    interpretedAt: now,
    updatedBy: interpretedBy,
    updatedAt: now,
    version: existing.version + 1,
  };

  _responsesStore.set(responseId, updated);
  persistResponses();
  return updated;
}

/**
 * Marks a response as ACTIONED (buyer has taken action based on this response).
 */
export function markResponseActioned(
  responseId: string,
  expectedVersion: number,
  actionedBy?: string
): SupplierResponse {
  initResponses();

  const existing = _responsesStore.get(responseId);
  if (!existing) throw new SupplierResponseNotFoundError(responseId);
  if (existing.version !== expectedVersion) {
    throw new SupplierCommunicationConflictError('response', responseId, expectedVersion, existing.version);
  }
  if (existing.responseStatus === 'DISMISSED') {
    throw new SupplierCommunicationStateError(`Cannot action a dismissed response "${responseId}".`);
  }

  const now = nowIso();
  const updatedBy = actionedBy?.trim() || 'local-user';

  const updated: SupplierResponse = {
    ...existing,
    responseStatus: 'ACTIONED',
    updatedBy,
    updatedAt: now,
    version: existing.version + 1,
  };

  _responsesStore.set(responseId, updated);
  persistResponses();
  return updated;
}

/**
 * Dismisses a response (e.g. out-of-office auto-reply).
 */
export function dismissResponse(
  responseId: string,
  expectedVersion: number,
  dismissedBy?: string
): SupplierResponse {
  initResponses();

  const existing = _responsesStore.get(responseId);
  if (!existing) throw new SupplierResponseNotFoundError(responseId);
  if (existing.version !== expectedVersion) {
    throw new SupplierCommunicationConflictError('response', responseId, expectedVersion, existing.version);
  }
  if (existing.responseStatus === 'ACTIONED') {
    throw new SupplierCommunicationStateError(`Cannot dismiss an already actioned response "${responseId}".`);
  }

  const now = nowIso();
  const updatedBy = dismissedBy?.trim() || 'local-user';

  const updated: SupplierResponse = {
    ...existing,
    responseStatus: 'DISMISSED',
    updatedBy,
    updatedAt: now,
    version: existing.version + 1,
  };

  _responsesStore.set(responseId, updated);
  persistResponses();
  return updated;
}

// ---------------------------------------------------------------------------
// Reload helpers (for testing)
// ---------------------------------------------------------------------------

export function reloadFromDisk(): void {
  _remindersInitialized = false;
  _responsesInitialized = false;
  _remindersStore = new Map();
  _responsesStore = new Map();
  initReminders();
  initResponses();
}
