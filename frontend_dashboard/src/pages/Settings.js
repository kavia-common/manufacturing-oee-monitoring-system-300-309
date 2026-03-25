import React, { useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { getEnv } from "../config/env";

// PUBLIC_INTERFACE
export function SettingsPage() {
  /** Settings and integration information page. */
  const env = useMemo(() => getEnv(), []);
  const [status] = useState({ connected: true, mode: env.useMock ? "mock" : "rest" });

  return (
    <Layout title="Settings" subtitle="Integration points and environment configuration" status={status}>
      <div className="grid gridCols2">
        <div className="card">
          <div className="cardHeader">
            <h3>Runtime mode</h3>
            <span>{env.useMock ? "Mock enabled" : "Backend enabled"}</span>
          </div>
          <div className="alert alertInfo">
            <strong>{env.useMock ? "Running with local mock data." : "Using REST API."}</strong>
            <div style={{ marginTop: 8, color: "rgba(17,24,39,0.78)" }}>
              The app stays runnable without a backend. When you set <code>REACT_APP_API_BASE</code> and optionally{" "}
              <code>REACT_APP_WS_URL</code>, it will connect automatically.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h3>Environment variables</h3>
            <span>Read-only</span>
          </div>

          <table className="table" aria-label="Environment variables">
            <thead>
              <tr>
                <th>Variable</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>REACT_APP_API_BASE</strong></td>
                <td style={{ color: "#6b7280" }}>{env.apiBase || "(not set)"}</td>
              </tr>
              <tr>
                <td><strong>REACT_APP_WS_URL</strong></td>
                <td style={{ color: "#6b7280" }}>{env.wsUrl || "(not set)"}</td>
              </tr>
              <tr>
                <td><strong>REACT_APP_LOG_LEVEL</strong></td>
                <td style={{ color: "#6b7280" }}>{env.logLevel}</td>
              </tr>
              <tr>
                <td><strong>REACT_APP_HEALTHCHECK_PATH</strong></td>
                <td style={{ color: "#6b7280" }}>{env.healthcheckPath}</td>
              </tr>
              <tr>
                <td><strong>REACT_APP_FEATURE_FLAGS</strong></td>
                <td style={{ color: "#6b7280" }}>{env.featureFlags || "(empty)"}</td>
              </tr>
            </tbody>
          </table>

          <div className="helperText" style={{ marginTop: 10 }}>
            Note: CRA only exposes variables prefixed with <code>REACT_APP_</code>.
          </div>
        </div>
      </div>
    </Layout>
  );
}
