import React, { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { subscribeToPlantSnapshot } from "../services/realtime";
import { asPercent01 } from "../utils/format";
import { KpiCard } from "../components/KpiCard";

// PUBLIC_INTERFACE
export function ManagerPage() {
  /** Manager view: cross-line comparison and high-level insights. */
  const [snapshot, setSnapshot] = useState(null);
  const [rtStatus, setRtStatus] = useState({ connected: false, mode: "mock" });

  useEffect(() => {
    const unsub = subscribeToPlantSnapshot((s) => setSnapshot(s), (st) => setRtStatus(st));
    return () => unsub?.();
  }, []);

  const aggregated = useMemo(() => {
    if (!snapshot?.lineKpis?.length) return { availability: 0, performance: 0, quality: 0, oee: 0 };
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
    return { availability: sum.availability / n, performance: sum.performance / n, quality: sum.quality / n, oee: sum.oee / n };
  }, [snapshot]);

  const ranked = useMemo(() => {
    const rows = (snapshot?.lineKpis || []).map((k) => {
      const line = snapshot?.lines?.find((l) => l.id === k.lineId);
      return { ...k, lineName: line?.name || k.lineId };
    });
    return rows.sort((a, b) => b.oee - a.oee);
  }, [snapshot]);

  const topLoss = useMemo(() => {
    // crude heuristic: identify lowest component.
    const a = aggregated.availability;
    const p = aggregated.performance;
    const q = aggregated.quality;
    const min = Math.min(a, p, q);
    if (min === a) return { label: "Availability", hint: "Focus on downtime elimination and faster recovery." };
    if (min === p) return { label: "Performance", hint: "Focus on speed losses, minor stops, and cycle-time discipline." };
    return { label: "Quality", hint: "Focus on scrap/rework reduction and process capability." };
  }, [aggregated]);

  return (
    <Layout title="Manager" subtitle="Plant-level performance with line ranking and improvement focus" status={rtStatus}>
      <div className="grid gridCols4">
        <KpiCard title="Plant Availability" valuePct={asPercent01(aggregated.availability)} subtitle="Reliability + uptime" tone="blue" />
        <KpiCard title="Plant Performance" valuePct={asPercent01(aggregated.performance)} subtitle="Speed + throughput" tone="amber" />
        <KpiCard title="Plant Quality" valuePct={asPercent01(aggregated.quality)} subtitle="First-pass yield" tone="green" />
        <KpiCard title="Plant OEE" valuePct={asPercent01(aggregated.oee)} subtitle="Overall effectiveness" tone="blue" />
      </div>

      <div style={{ height: 14 }} />

      <div className="grid gridCols2">
        <div className="card">
          <div className="cardHeader">
            <h3>Line ranking (by OEE)</h3>
            <span>Highest to lowest</span>
          </div>

          <table className="table" aria-label="Line ranking">
            <thead>
              <tr>
                <th>Line</th>
                <th>OEE</th>
                <th>Avail</th>
                <th>Perf</th>
                <th>Qual</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.lineId}>
                  <td><strong>{r.lineName}</strong></td>
                  <td><span className="badge badgeBlue">{asPercent01(r.oee).toFixed(1)}%</span></td>
                  <td>{asPercent01(r.availability).toFixed(1)}%</td>
                  <td>{asPercent01(r.performance).toFixed(1)}%</td>
                  <td>{asPercent01(r.quality).toFixed(1)}%</td>
                </tr>
              ))}
              {!ranked.length && (
                <tr>
                  <td colSpan={5} style={{ color: "#6b7280" }}>
                    Waiting for data...
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="helperText" style={{ marginTop: 10 }}>
            Use this view to prioritize where to deploy kaizen or maintenance resources.
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h3>Recommended focus</h3>
            <span>Heuristic</span>
          </div>

          <div className="alert alertInfo">
            <strong>Primary plant constraint: {topLoss.label}</strong>
            <div style={{ marginTop: 8, color: "rgba(17,24,39,0.78)" }}>{topLoss.hint}</div>
          </div>

          <div style={{ height: 12 }} />

          <div className="alert alertInfo">
            <strong>Next steps:</strong>
            <ol style={{ margin: "10px 0 0 18px", color: "rgba(17,24,39,0.78)" }}>
              <li>Review top 3 downtime/speed-loss reasons by line</li>
              <li>Verify standard work and changeover readiness</li>
              <li>Track corrective actions through event logs</li>
            </ol>
          </div>
        </div>
      </div>
    </Layout>
  );
}
