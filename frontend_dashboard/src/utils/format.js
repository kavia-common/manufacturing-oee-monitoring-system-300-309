// PUBLIC_INTERFACE
export function asPercent01(v) {
  /** Convert 0..1 to percentage number (0..100). */
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n * 100));
}

// PUBLIC_INTERFACE
export function formatIsoToLocal(iso) {
  /** Format ISO timestamp to local date/time string. */
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso || "");
  }
}
