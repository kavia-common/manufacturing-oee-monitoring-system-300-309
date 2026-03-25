import React, { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { createEvent, getPlantSnapshot, listEvents } from "../services/oeeService";
import { subscribeToPlantSnapshot } from "../services/realtime";
import { formatIsoToLocal } from "../utils/format";

const EVENT_TYPES = [
  { value: "DOWNTIME", label: "Downtime" },
  { value: "SPEED_LOSS", label: "Speed loss" },
  { value: "QUALITY", label: "Quality issue" },
  { value: "CHANGEOVER", label: "Changeover" }
];

// PUBLIC_INTERFACE
export function OperatorEventsPage() {
  /** Operator-focused event logging UI and event history. */
  const [snapshot, setSnapshot] = useState(null);
  const [rtStatus, setRtStatus] = useState({ connected: false, mode: "mock" });
  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    lineId: "line-1",
    machineId: "",
    type: "DOWNTIME",
    reason: "",
    durationMinutes: 0,
    notes: ""
  });

  useEffect(() => {
    const unsub = subscribeToPlantSnapshot((s) => setSnapshot(s), (st) => setRtStatus(st));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let mounted = true;
    getPlantSnapshot()
      .then((s) => {
        if (!mounted) return;
        setSnapshot(s);
        setForm((f) => ({ ...f, lineId: f.lineId || s.lines?.[0]?.id || "line-1" }));
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const machinesForLine = useMemo(() => {
    const lineId = form.lineId;
    return (snapshot?.machines || []).filter((m) => m.lineId === lineId);
  }, [snapshot, form.lineId]);

  async function refreshEvents() {
    try {
      const rows = await listEvents({ limit: 30 });
      setEvents(rows);
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.generatedAt]);

  // PUBLIC_INTERFACE
  async function onSubmit(e) {
    /** Submit an operator event. */
    e.preventDefault();
    setError("");

    if (!form.reason.trim()) {
      setError("Please provide a reason (e.g., 'Material shortage').");
      return;
    }

    setBusy(true);
    try {
      await createEvent({
        lineId: form.lineId,
        machineId: form.machineId || null,
        type: form.type,
        reason: form.reason.trim(),
        durationMinutes: Number(form.durationMinutes) || 0,
        notes: form.notes.trim()
      });
      setForm((f) => ({ ...f, reason: "", durationMinutes: 0, notes: "" }));
      await refreshEvents();
    } catch (err) {
      setError(err?.message || "Failed to create event.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title="Operator Events" subtitle="Log downtime, speed losses, quality issues and changeovers" status={rtStatus}>
      <div className="grid gridCols2">
        <div className="card">
          <div className="cardHeader">
            <h3>Log a production event</h3>
            <span>Fast + structured</span>
          </div>

          {error && (
            <div className="alert alertWarn" role="alert" style={{ marginBottom: 12 }}>
              <strong>Action needed:</strong> {error}
            </div>
          )}

          <form onSubmit={onSubmit}>
            <div className="formRow">
              <div className="field">
                <label htmlFor="lineId">Line</label>
                <select
                  id="lineId"
                  value={form.lineId}
                  onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value, machineId: "" }))}
                >
                  {(snapshot?.lines || []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="machineId">Machine</label>
                <select
                  id="machineId"
                  value={form.machineId}
                  onChange={(e) => setForm((f) => ({ ...f, machineId: e.target.value }))}
                >
                  <option value="">(Optional) Select machine</option>
                  {machinesForLine.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} • {m.status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="type">Type</label>
                <select id="type" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="durationMinutes">Duration (min)</label>
                <input
                  id="durationMinutes"
                  type="number"
                  min="0"
                  step="1"
                  value={form.durationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
                />
              </div>
            </div>

            <div style={{ height: 10 }} />

            <div className="field">
              <label htmlFor="reason">Reason</label>
              <input
                id="reason"
                value={form.reason}
                placeholder="e.g., Material shortage"
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </div>

            <div style={{ height: 10 }} />

            <div className="field">
              <label htmlFor="notes">Notes</label>
              <textarea
                id="notes"
                value={form.notes}
                placeholder="Optional context / corrective action"
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
              <div className="helperText">Be concise; focus on what happened and what was done.</div>
            </div>

            <div style={{ height: 12 }} />

            <button type="submit" className="btnPrimary" disabled={busy}>
              {busy ? "Saving..." : "Submit event"}
            </button>
          </form>

          <div className="alert alertInfo" style={{ marginTop: 12 }}>
            <strong>REST contract:</strong> <code>POST /events</code> expects{" "}
            <code>{"{ lineId, machineId, type, reason, durationMinutes, notes }"}</code>.
          </div>
        </div>

        <div className="card">
          <div className="cardHeader">
            <h3>Event history</h3>
            <span>{events.length} latest</span>
          </div>
          <table className="table" aria-label="Event history">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Machine</th>
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
                  <td>{e.machineId || "—"}</td>
                </tr>
              ))}
              {!events.length && (
                <tr>
                  <td colSpan={4} style={{ color: "#6b7280" }}>
                    No events recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
