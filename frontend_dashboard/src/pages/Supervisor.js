import React, { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { subscribeToPlantSnapshot } from "../services/realtime";
import { asPercent01 } from "../utils/format";
import { KpiCard } from "../components/KpiCard";

// PUBLIC_INTERFACE
export function SupervisorPage() {
  /** Supervisor view: line-level KPI + machine status for quick triage. */
  const [snapshot, setSnapshot] = useState(null);
  const [rtStatus, setRtStatus] = useState({ connected: false, mode: "mock" });
  const [lineId, setLineId] = useState("line-1");

  useEffect(() => {
    const unsub = subscribeToPlantSnapshot((s) => setSnapshot(s), (st) => setRtStatus(st));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    if (snapshot?.lines?.length && !snapshot.lines.find((l) => l.id === lineId)) {
      setLineId(snapshot.lines[0].id);
    }
  }, [snapshot, lineId]);

  const line = useMemo(() => snapshot?.lines?.find((l) => l.id === lineId), [snapshot, lineId]);
  const kpi = useMemo(() => snapshot?.lineKpis?.find((k) => k.lineId === lineId), [snapshot, lineId]);
  const machines = useMemo(() => (snapshot?.machines || []).filter((m) => m.lineId === lineId), [snapshot, lineId]);

  const stoppedCount = machines.filter((m) => m.status !== "running").length;

  return (
    <Layout title="Supervisor" subtitle="Shift triage: prioritize downtime and performance losses" status={rtStatus}>
      <div className="pageTitleRow">
        <div>
          <h2>{line?.name || "Line"}</h2>
          <p>Monitor machine state and focus improvements where they matter.</p>
        </div>
        <div className="field" style={{ minWidth: 260 }}>
          <label htmlFor="lineSel" style={{ fontSize: 12, fontWeight: 700, color: "rgba(17,24,39,0.78)" }}>
            Select line
          </label>
          <select id="lineSel" value={lineId} onChange={(e) => setLineId(e.target.value)}>
            {(snapshot?.lines || []).map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gridCols4">
        <KpiCard title="Availability" valuePct={asPercent01(kpi?.availability)} subtitle="Primary loss: downtime" tone="blue" />
        <KpiCard title="Performance" valuePct={asPercent01(kpi?.performance)} subtitle="Primary loss: slow cycles" tone="amber" />
        <KpiCard title="Quality" valuePct={asPercent01(kpi?.quality)} subtitle="Primary loss: rejects" tone="green" />
        <KpiCard title="OEE" valuePct={asPercent01(kpi?.oee)} subtitle="Line effectiveness" tone="blue" />
      </div>

      <div style={{ height: 14 }} />

      <div className="grid gridCols2">
        <div className="card">
          <div className="cardHeader">
            <h3>Machine status</h3>
            <span>{stoppedCount ? `${stoppedCount} need attention` : "All running"}</span>
          </div>
          <table className="table" aria-label="Machine status">
            <thead>
              <tr>
                <th>Machine</th>
                <th>Status</th>
                <th>Suggested action</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((m) => (
                <tr key={m.id}>
                  <td><strong>{m.name}</strong></td>
                  <td>
                    <span className={`badge ${m.status === "running" ? "badgeGreen" : "badgeAmber"}`}>
                      {m.status}
                    </span>
                  </td>
                  <td style={{ color: "#6b7280" }}>
                    {m.status === "running" ? "Monitor for micro-stops" : "Check root cause, coordinate maintenance/materials"}
                  </td>
                </tr>
              ))}
              {!machines.length && (
                <tr>
                  <td colSpan={3} style={{ color: "#6b7280" }}>
                    No machines configured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h3>Shift guidance</h3>
            <span>Decision support</span>
          </div>

          <div className={`alert ${stoppedCount ? "alertWarn" : "alertInfo"}`}>
            <strong>{stoppedCount ? "Downtime risk detected." : "Line stable."}</strong>{" "}
            {stoppedCount
              ? "Prioritize restoring stopped machines; verify material flow and changeover readiness."
              : "Maintain cadence; verify quality checks and avoid speed throttling."}
          </div>

          <div style={{ height: 12 }} />

          <div className="alert alertInfo">
            <strong>Escalation checklist:</strong>
            <ul style={{ margin: "10px 0 0 18px", color: "rgba(17,24,39,0.78)" }}>
              <li>Confirm planned production vs actual output</li>
              <li>Validate top downtime reason(s) with operator notes</li>
              <li>Assign corrective action and log follow-up event</li>
            </ul>
          </div>
        </div>
      </div>
    </Layout>
  );
}
