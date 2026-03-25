import { getEnv } from "../config/env";
import { apiGet, apiPost } from "./apiClient";
import {
  mockCreateEvent,
  mockGetDefectReasons,
  mockGetPlantSnapshot,
  mockGetReasonCodes,
  mockListEvents,
  mockUpdateEvent,
  mockVoidEvent
} from "./mockData";

/**
 * OEE Service: single place the UI calls for data.
 *
 * Recommended REST API contract (future backend):
 *  - GET  /plant/snapshot
 *      -> { generatedAt, lines: [{id,name}], machines: [{id,lineId,name,status}], lineKpis: [{lineId,availability,performance,quality,oee}] }
 *
 *  - GET  /events?limit=25
 *      -> [{ id, createdAt, lineId, machineId, type, reasonCode?, reason, startAt?, endAt?, durationMinutes, status?, notes, quality?, isVoided?, voidedAt?, voidedBy?, voidReason?, auditTrail? }]
 *
 *  - POST /events
 *      body: { lineId, machineId, type, reasonCode?, reason, startAt?, endAt?, durationMinutes, status?, notes, quality? }
 *      -> created event object
 *
 *  - POST /events/:id/edit   (or PATCH /events/:id)
 *      body: patch fields
 *      -> updated event object
 *
 *  - POST /events/:id/void
 *      body: { voidReason, voidedBy? }
 *      -> updated event object (isVoided=true)
 *
 *  - GET /reason-codes
 *      -> [{ code, label, types }]
 *  - GET /defect-reasons
 *      -> [{ code, label }]
 */

// PUBLIC_INTERFACE
export async function getPlantSnapshot() {
  /** Fetch plant snapshot via REST when available; otherwise return mock snapshot. */
  const { useMock } = getEnv();
  if (useMock) return mockGetPlantSnapshot();
  return apiGet("/plant/snapshot");
}

// PUBLIC_INTERFACE
export async function listEvents({ limit = 25 } = {}) {
  /** Fetch latest events via REST when available; otherwise return mock events. */
  const { useMock } = getEnv();
  if (useMock) return mockListEvents({ limit });
  return apiGet(`/events?limit=${encodeURIComponent(String(limit))}`);
}

// PUBLIC_INTERFACE
export async function createEvent(eventInput) {
  /** Create an operator event via REST when available; otherwise store in mock memory. */
  const { useMock } = getEnv();
  if (useMock) return mockCreateEvent(eventInput);
  return apiPost("/events", eventInput);
}

// PUBLIC_INTERFACE
export async function updateEvent(eventId, patch, { updatedBy } = {}) {
  /**
   * Edit an existing event (with audit trail on backend/mock).
   * @param {string} eventId
   * @param {object} patch
   * @param {{updatedBy?: string}} opts
   */
  const { useMock } = getEnv();
  if (useMock) return mockUpdateEvent(eventId, patch, { updatedBy: updatedBy || "operator" });

  // Keeping POST to avoid adding new verb helper in apiClient for this task.
  return apiPost(`/events/${encodeURIComponent(eventId)}/edit`, { patch, updatedBy });
}

// PUBLIC_INTERFACE
export async function voidEvent(eventId, { voidReason, voidedBy } = {}) {
  /**
   * Void an event (soft delete) with audit record.
   * @param {string} eventId
   * @param {{voidReason: string, voidedBy?: string}} opts
   */
  const { useMock } = getEnv();
  if (useMock) return mockVoidEvent(eventId, { voidReason, voidedBy: voidedBy || "operator" });

  return apiPost(`/events/${encodeURIComponent(eventId)}/void`, { voidReason, voidedBy });
}

// PUBLIC_INTERFACE
export async function listReasonCodes() {
  /** List reason codes catalog (mocked locally until backend exists). */
  const { useMock } = getEnv();
  if (useMock) return mockGetReasonCodes();
  return apiGet("/reason-codes");
}

// PUBLIC_INTERFACE
export async function listDefectReasons() {
  /** List defect reasons catalog (mocked locally until backend exists). */
  const { useMock } = getEnv();
  if (useMock) return mockGetDefectReasons();
  return apiGet("/defect-reasons");
}
