/**
 * Centralized environment configuration.
 * Uses only REACT_APP_* variables (CRA requirement).
 */

// PUBLIC_INTERFACE
export function getEnv() {
  /** Returns resolved environment configuration for API/WS integration points. */
  const apiBase =
    process.env.REACT_APP_API_BASE ||
    process.env.REACT_APP_BACKEND_URL ||
    "";

  const wsUrl =
    process.env.REACT_APP_WS_URL ||
    "";

  const nodeEnv = process.env.REACT_APP_NODE_ENV || process.env.NODE_ENV || "development";

  // If API base is missing, we run entirely with mock adapters.
  const useMock = !apiBase;

  return {
    apiBase,
    wsUrl,
    nodeEnv,
    useMock,
    logLevel: process.env.REACT_APP_LOG_LEVEL || "info",
    healthcheckPath: process.env.REACT_APP_HEALTHCHECK_PATH || "/health",
    featureFlags: process.env.REACT_APP_FEATURE_FLAGS || "",
    experimentsEnabled: (process.env.REACT_APP_EXPERIMENTS_ENABLED || "false").toLowerCase() === "true"
  };
}
