import { getEnv } from "../config/env";

/**
 * Minimal REST client.
 * If backend is unavailable (or REACT_APP_API_BASE not set), consumers should use mock adapters.
 */

// PUBLIC_INTERFACE
export async function apiGet(path) {
  /** Perform a GET request to `${REACT_APP_API_BASE}${path}`. Throws on non-2xx. */
  const { apiBase } = getEnv();
  const url = `${apiBase}${path}`;
  const res = await fetch(url, { method: "GET", headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GET ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}

// PUBLIC_INTERFACE
export async function apiPost(path, body) {
  /** Perform a POST request to `${REACT_APP_API_BASE}${path}` with JSON body. Throws on non-2xx. */
  const { apiBase } = getEnv();
  const url = `${apiBase}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Accept": "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {})
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} failed: ${res.status} ${text}`);
  }
  return res.json();
}
