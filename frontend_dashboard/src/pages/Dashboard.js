import React, { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { KpiCard } from "../components/KpiCard";
import { listEvents } from "../services/oeeService";
import { subscribeToPlantSnapshot } from "../services/realtime";
import { asPercent01, formatIsoToLocal } from "../utils/format";

// PUBLIC_INTERFACE
export function DashboardPage() {
  /** Main dashboard with real-time KPI widgets and recent events. */
  const [snapshot, setSnapshot] = useState(null);
  const [rtStatus, setRtStatus] = useState({ connected: false, mode: "mock" });
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const unsub = subscribeToPlantSnapshot((s) => setSnapshot(s), (st) => setRtStatus(st));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    listEvents({ limit: 8 })
      .then((rows) => {
        if (mounted) setEvents(rows);
      })
      .catch(() => {
        if (mounted) setEvents([]);
      });
    return () => {
      mounted = false;
    };
  }, [snapshot?.generatedAt]);

  const aggregated = useMemo(() => {
    if (!snapshot?.lineKpis?.length) {
      return { availability: 0, performance: 0, quality: 0, oee: 0 };
    }
    const n = snapshot.lineKpis.length;
    const sum = snapshot.lineKpis.reduce(
      (acc, k) => ({
        availability: acc.availability + k.availability,
        performance: acc.performance + k.performance,
        quality: acc.quality + k.quality,
        oee: acc.oee + k.oee
      }),
      { availability: 0, performance: 0, quality: 0, oee: 0 }
    );
    return {
      availability: sum.availability / n,
      performance: sum.performance / n,
      quality: sum.quality / n,
      oee: sum.oee / n
    };
  }, [snapshot]);

  return (
    <Layout
      title="Plant Dashboard"
      subtitle={`Live OEE overview • Last update: ${snapshot?.generatedAt ? formatIsoToLocal(snapshot.generatedAt) : "—"}`}
      status={rtStatus}
    >
      <div className="pageTitleRow">
        <div>
          <h2>Real-time KPIs</h2>
          <p>Availability × Performance × Quality = OEE</p>
        </div>
      </div>

      <div className="grid gridCols4">
        <KpiCard title="Availability" valuePct={asPercent01(aggregated.availability)} subtitle="Run time vs planned time" tone="blue" />
        <KpiCard title="Performance" valuePct={asPercent01(aggregated.performance)} subtitle="Speed vs ideal cycle time" tone="amber" />
        <KpiCard title="Quality" valuePct={asPercent01(aggregated.quality)} subtitle="Good parts vs total parts" tone="green" />
        <KpiCard title="OEE" valuePct={asPercent01(aggregated.oee)} subtitle="Overall Equipment Effectiveness" tone="blue" />
      </div>

      <div style={{ height: 14 }} />

      <div className="grid gridCols2">
        <div className="card">
          <div className="cardHeader">
            <h3>Lines</h3>
            <span>{snapshot?.lines?.length ? `${snapshot.lines.length} active` : "—"}</span>
          </div>
          <table className="table" aria-label="Line KPIs">
            <thead>
              <tr>
                <th>Line</th>
                <th>Availability</th>
                <th>Performance</th>
                <th>Quality</th>
                <th>OEE</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot?.lineKpis || []).map((k) => {
                const line = snapshot.lines?.find((l) => l.id === k.lineId);
                return (
                  <tr key={k.lineId}>
                    <td><strong>{line?.name || k.lineId}</strong></td>
                    <td>{asPercent01(k.availability).toFixed(1)}%</td>
                    <td>{asPercent01(k.performance).toFixed(1)}%</td>
                    <td>{asPercent01(k.quality).toFixed(1)}%</td>
                    <td><span className="badge badgeBlue">{asPercent01(k.oee).toFixed(1)}%</span></td>
                  </tr>
                );
              })}
              {!snapshot?.lineKpis?.length && (
                <tr>
                  <td colSpan={5} style={{ color: "#6b7280" }}>
                    Waiting for live data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="helperText" style={{ marginTop: 10 }}>
            Tip: use the Role selector in the sidebar to unlock Supervisor/Manager views.
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h3>Recent operator events</h3>
            <span>Last {events.length}</span>
          </div>
          <table className="table" aria-label="Recent events">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Line</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>{formatIsoToLocal(e.createdAt)}</td>
                  <td>
                    <span className={`badge ${e.type === "DOWNTIME" ? "badgeAmber" : e.type === "QUALITY" ? "badgeGreen" : "badgeBlue"}`}>
                      {e.type}
                    </span>
                  </td>
                  <td>{e.reason}</td>
                  <td>{e.lineId}</td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={4} style={{ color: "#6b7280" }}>
                    No events yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="alert alertInfo" style={{ marginTop: 12 }}>
            <strong>Integration point:</strong> When backend is available, the dashboard expects <code>GET /plant/snapshot</code> and WS messages of type <code>PLANT_SNAPSHOT</code>.
          </div>
        </div>
      </div>
    </Layout>
  );
}
