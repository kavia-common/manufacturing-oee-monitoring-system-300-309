import { getEnv } from "../config/env";
import { mockGetPlantSnapshot } from "./mockData";

/**
 * Real-time updates integration point.
 * - If REACT_APP_WS_URL is provided, tries to connect to backend WS and parse JSON messages.
 * - Otherwise uses a mock interval to simulate live KPI updates.
 *
 * Expected backend WS contract (recommended):
 *  - Client connects to `${REACT_APP_WS_URL}` (e.g., wss://host/ws)
 *  - Server sends messages:
 *    { "type": "PLANT_SNAPSHOT", "payload": { ...same shape as GET /plant/snapshot... } }
 */

// PUBLIC_INTERFACE
export function subscribeToPlantSnapshot(onMessage, onStatus) {
  /**
   * Subscribe to plant snapshot updates.
   * @param {(snapshot: any) => void} onMessage - called with snapshot payload.
   * @param {(status: {connected: boolean, mode: 'ws'|'mock', error?: string}) => void} onStatus
   * @returns {() => void} unsubscribe function.
   */
  const { wsUrl, useMock } = getEnv();

  if (!wsUrl || useMock) {
    onStatus?.({ connected: true, mode: "mock" });
    const timer = window.setInterval(() => {
      onMessage(mockGetPlantSnapshot());
    }, 1500);

    // immediate push
    onMessage(mockGetPlantSnapshot());

    return () => window.clearInterval(timer);
  }

  let ws;
  let closed = false;

  try {
    ws = new WebSocket(wsUrl);
  } catch (e) {
    onStatus?.({ connected: false, mode: "ws", error: String(e) });
    // fallback to mock
    const timer = window.setInterval(() => onMessage(mockGetPlantSnapshot()), 1500);
    onStatus?.({ connected: true, mode: "mock", error: "WS init failed; using mock" });
    return () => window.clearInterval(timer);
  }

  ws.onopen = () => onStatus?.({ connected: true, mode: "ws" });
  ws.onerror = () => onStatus?.({ connected: false, mode: "ws", error: "WebSocket error" });
  ws.onclose = () => {
    if (!closed) onStatus?.({ connected: false, mode: "ws", error: "WebSocket closed" });
  };

  ws.onmessage = (evt) => {
    try {
      const msg = JSON.parse(evt.data);
      if (msg?.type === "PLANT_SNAPSHOT") onMessage(msg.payload);
    } catch {
      // ignore malformed messages
    }
  };

  return () => {
    closed = true;
    try {
      ws.close();
    } catch {
      // ignore
    }
  };
}
