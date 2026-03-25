/**
 * Date/time helpers for the Operator Events timer workflow.
 */

function safeNowMs() {
  try {
    return Date.now();
  } catch {
    return new Date().getTime();
  }
}

// PUBLIC_INTERFACE
export function formatDurationHms(totalSeconds) {
  /**
   * Format seconds into H:MM:SS.
   * @param {number} totalSeconds
   */
  const secs = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss.padStart(2, "0")}`;
}

// PUBLIC_INTERFACE
export function minutesBetween(startIso, endIso) {
  /**
   * Compute rounded minutes between two ISO strings.
   * @param {string} startIso
   * @param {string} endIso
   */
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 0;
    return Math.round(ms / 60000);
  } catch {
    return 0;
  }
}

// PUBLIC_INTERFACE
export function nowIso() {
  /** Return current timestamp ISO string. */
  return new Date(safeNowMs()).toISOString();
}
