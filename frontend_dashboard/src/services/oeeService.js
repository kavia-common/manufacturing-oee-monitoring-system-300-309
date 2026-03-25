import { getEnv } from "../config/env";
import { apiGet, apiPost } from "./apiClient";
import { mockCreateEvent, mockGetPlantSnapshot, mockListEvents } from "./mockData";

/**
 * OEE Service: single place the UI calls for data.
 *
 * Recommended REST API contract (future backend):
 *  - GET  /plant/snapshot
 *      -> { generatedAt, lines: [{id,name}], machines: [{id,lineId,name,status}], lineKpis: [{lineId,availability,performance,quality,oee}] }
 *  - GET  /events?limit=25
 *      -> [{ id, createdAt, lineId, machineId, type, reason, durationMinutes, notes }]
 *  - POST /events
 *      body: { lineId, machineId, type, reason, durationMinutes, notes }
 *      -> created event object
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
