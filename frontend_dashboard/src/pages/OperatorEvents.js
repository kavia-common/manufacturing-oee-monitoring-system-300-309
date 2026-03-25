import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import {
  createEvent,
  getPlantSnapshot,
  listDefectReasons,
  listEvents,
  listReasonCodes,
  updateEvent,
  voidEvent
} from "../services/oeeService";
import { subscribeToPlantSnapshot } from "../services/realtime";
import { formatIsoToLocal } from "../utils/format";
import { formatDurationHms, minutesBetween, nowIso } from "../utils/datetime";

const EVENT_TYPES = [
  { value: "DOWNTIME", label: "Downtime" },
  { value: "SPEED_LOSS", label: "Speed loss" },
  { value: "QUALITY", label: "Quality" },
  { value: "CHANGEOVER", label: "Changeover" }
];

const QUALITY_MODE = [
  { value: "good", label: "Good" },
  { value: "scrap", label: "Scrap" },
  { value: "rework", label: "Rework" }
];

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeText(s) {
  return String(s || "").trim().toLowerCase();
}

function reasonLabelForCode(codes, code) {
  if (!code) return "";
  const row = (codes || []).find((r) => r.code === code);
  return row?.label || code;
}

function defectLabelForCode(defects, code) {
  if (!code) return "";
  const row = (defects || []).find((r) => r.code === code);
  return row?.label || code;
}

function getEventReasonDisplay({ e, reasonCodes }) {
  if (e?.reasonCode) {
    const label = reasonLabelForCode(reasonCodes, e.reasonCode);
    return `${label}${e.reason && e.reason !== label ? ` — ${e.reason}` : ""}`;
  }
  return e?.reason || "—";
}

function computeDurationMinutesForEvent(e) {
  if (!e) return 0;
  const explicit = Number(e.durationMinutes);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  if (e.startAt && e.endAt) return minutesBetween(e.startAt, e.endAt);
  return 0;
}

// PUBLIC_INTERFACE
export function OperatorEventsPage() {
  /** Operator-focused event logging UI with structured downtime/quality workflows + history with edit/void/audit. */
  const [snapshot, setSnapshot] = useState(null);
  const [rtStatus, setRtStatus] = useState({ connected: false, mode: "mock" });

  const [events, setEvents] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // catalogs
  const [reasonCodes, setReasonCodes] = useState([]);
  const [defectReasons, setDefectReasons] = useState([]);

  // local UI state (favorites)
  const [favoriteReasonCodes, setFavoriteReasonCodes] = useState(() => {
    const raw = window.localStorage.getItem("oee.reasonFavorites");
    const parsed = safeJsonParse(raw, []);
    return Array.isArray(parsed) ? parsed : [];
  });

  // filters
  const [filters, setFilters] = useState({
    q: "",
    type: "ALL",
    lineId: "ALL",
    machineId: "ALL",
    includeVoided: false
  });

  // main form
  const [form, setForm] = useState({
    lineId: "line-1",
    machineId: "",
    type: "DOWNTIME",
    // reason selection
    reasonCode: "",
    reasonText: "",
    reasonSearch: "",
    // downtime timer
    durationMinutes: 0, // manual override (non-timer types)
    notes: "",
    // quality
    qualityMode: "scrap",
    qualityCount: 1,
    defectReasonCode: ""
  });

  // Downtime active timer state (only for DOWNTIME type)
  const [activeDowntime, setActiveDowntime] = useState(() => {
    const raw = window.localStorage.getItem("oee.activeDowntime");
    return safeJsonParse(raw, null);
  });

  // audit/edit/void dialogs
  const [editOpen, setEditOpen] = useState(false);
  const [voidOpen, setVoidOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editPatch, setEditPatch] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  const [nowTick, setNowTick] = useState(Date.now());
  const tickTimerRef = useRef(null);

  useEffect(() => {
    const unsub = subscribeToPlantSnapshot((s) => setSnapshot(s), (st) => setRtStatus(st));
    return () => unsub?.();
  }, []);

  useEffect(() => {
    let mounted = true;

    // Bootstrap snapshot for line list (if RT mock starts late)
    getPlantSnapshot()
      .then((s) => {
        if (!mounted) return;
        setSnapshot(s);
        setForm((f) => ({ ...f, lineId: f.lineId || s.lines?.[0]?.id || "line-1" }));
      })
      .catch(() => {});

    // catalogs
    Promise.all([listReasonCodes().catch(() => []), listDefectReasons().catch(() => [])]).then(([rc, dr]) => {
      if (!mounted) return;
      setReasonCodes(Array.isArray(rc) ? rc : []);
      setDefectReasons(Array.isArray(dr) ? dr : []);

      // if first load, auto-seed favorites with defaults (only once)
      const alreadySeeded = window.localStorage.getItem("oee.reasonFavoritesSeeded") === "true";
      if (!alreadySeeded && Array.isArray(rc) && rc.length) {
        const defaults = rc.filter((r) => r.isDefaultFavorite).map((r) => r.code);
        if (defaults.length) {
          setFavoriteReasonCodes((prev) => {
            const merged = Array.from(new Set([...(prev || []), ...defaults]));
            window.localStorage.setItem("oee.reasonFavorites", JSON.stringify(merged));
            return merged;
          });
        }
        window.localStorage.setItem("oee.reasonFavoritesSeeded", "true");
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  // keep ticking while downtime active so timer display updates
  useEffect(() => {
    if (!activeDowntime?.startAt) {
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
      return;
    }

    if (!tickTimerRef.current) {
      tickTimerRef.current = window.setInterval(() => setNowTick(Date.now()), 1000);
    }

    return () => {
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    };
  }, [activeDowntime?.startAt]);

  const machinesForLine = useMemo(() => {
    const lineId = form.lineId;
    return (snapshot?.machines || []).filter((m) => m.lineId === lineId);
  }, [snapshot, form.lineId]);

  const filterMachinesForLine = useMemo(() => {
    const lineId = filters.lineId;
    if (!lineId || lineId === "ALL") return snapshot?.machines || [];
    return (snapshot?.machines || []).filter((m) => m.lineId === lineId);
  }, [snapshot, filters.lineId]);

  async function refreshEvents() {
    try {
      const rows = await listEvents({ limit: 80 });
      setEvents(Array.isArray(rows) ? rows : []);
    } catch {
      setEvents([]);
    }
  }

  useEffect(() => {
    refreshEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot?.generatedAt]);

  useEffect(() => {
    window.localStorage.setItem("oee.reasonFavorites", JSON.stringify(favoriteReasonCodes || []));
  }, [favoriteReasonCodes]);

  useEffect(() => {
    window.localStorage.setItem("oee.activeDowntime", JSON.stringify(activeDowntime || null));
  }, [activeDowntime]);

  const filteredReasonCodes = useMemo(() => {
    const t = form.type;
    const search = normalizeText(form.reasonSearch);
    const rows = (reasonCodes || []).filter((r) => !r.types?.length || r.types.includes(t));
    if (!search) return rows;
    return rows.filter((r) => normalizeText(r.label).includes(search) || normalizeText(r.code).includes(search));
  }, [reasonCodes, form.type, form.reasonSearch]);

  const favoriteChips = useMemo(() => {
    const t = form.type;
    const fav = new Set(favoriteReasonCodes || []);
    const eligible = (reasonCodes || []).filter((r) => fav.has(r.code) && (!r.types?.length || r.types.includes(t)));
    // stable order: label asc
    return eligible.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }, [reasonCodes, favoriteReasonCodes, form.type]);

  const activeDowntimeElapsedSeconds = useMemo(() => {
    if (!activeDowntime?.startAt) return 0;
    try {
      const ms = nowTick - new Date(activeDowntime.startAt).getTime();
      return Math.max(0, Math.floor(ms / 1000));
    } catch {
      return 0;
    }
  }, [activeDowntime?.startAt, nowTick]);

  const activeDowntimeContextOk = useMemo(() => {
    if (!activeDowntime?.startAt) return true;
    // consider it "context ok" if line matches selected line
    return activeDowntime.lineId === form.lineId;
  }, [activeDowntime, form.lineId]);

  const historyRows = useMemo(() => {
    const q = normalizeText(filters.q);
    return (events || [])
      .filter((e) => {
        if (!filters.includeVoided && e.isVoided) return false;
        if (filters.type !== "ALL" && e.type !== filters.type) return false;
        if (filters.lineId !== "ALL" && e.lineId !== filters.lineId) return false;
        if (filters.machineId !== "ALL" && (e.machineId || "") !== filters.machineId) return false;
        if (!q) return true;

        const reasonDisplay = normalizeText(getEventReasonDisplay({ e, reasonCodes }));
        const notes = normalizeText(e.notes);
        const machine = normalizeText(e.machineId || "");
        const line = normalizeText(e.lineId || "");
        const id = normalizeText(e.id || "");
        const defect = normalizeText(defectLabelForCode(defectReasons, e?.quality?.defectReasonCode));
        return (
          reasonDisplay.includes(q) ||
          notes.includes(q) ||
          machine.includes(q) ||
          line.includes(q) ||
          id.includes(q) ||
          defect.includes(q)
        );
      })
      .map((e) => {
        const durationMin = computeDurationMinutesForEvent(e);
        const edited = (e.auditTrail || []).some((a) => a.action === "EDITED");
        return { e, durationMin, edited };
      });
  }, [events, filters, reasonCodes, defectReasons]);

  function setReasonCode(code) {
    const label = reasonLabelForCode(reasonCodes, code);
    setForm((f) => ({
      ...f,
      reasonCode: code,
      // Default the free text to the label (operators can refine)
      reasonText: f.reasonText?.trim() ? f.reasonText : label
    }));
  }

  function toggleFavoriteReason(code) {
    setFavoriteReasonCodes((prev) => {
      const set = new Set(prev || []);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return Array.from(set);
    });
  }

  function clearReasonSelection() {
    setForm((f) => ({ ...f, reasonCode: "", reasonText: "" }));
  }

  async function startDowntime() {
    setError("");

    if (activeDowntime?.startAt) {
      setError("Downtime timer already running. Stop it before starting another downtime event.");
      return;
    }
    if (!form.lineId) {
      setError("Select a line before starting downtime.");
      return;
    }
    if (!form.reasonCode && !form.reasonText.trim()) {
      setError("Select a reason code or enter a reason before starting downtime.");
      return;
    }

    const startAt = nowIso();
    setActiveDowntime({
      startAt,
      lineId: form.lineId,
      machineId: form.machineId || null,
      reasonCode: form.reasonCode || null,
      reason: form.reasonText.trim() || reasonLabelForCode(reasonCodes, form.reasonCode),
      notes: form.notes.trim()
    });
  }

  async function stopDowntime() {
    setError("");

    if (!activeDowntime?.startAt) {
      setError("No downtime timer is running.");
      return;
    }

    setBusy(true);
    try {
      const endAt = nowIso();
      const durationMinutes = minutesBetween(activeDowntime.startAt, endAt);

      await createEvent({
        lineId: activeDowntime.lineId,
        machineId: activeDowntime.machineId,
        type: "DOWNTIME",
        reasonCode: activeDowntime.reasonCode,
        reason: activeDowntime.reason,
        startAt: activeDowntime.startAt,
        endAt,
        durationMinutes,
        status: "CLOSED",
        notes: activeDowntime.notes,
        createdBy: "operator"
      });

      setActiveDowntime(null);
      // reset only timer-related inputs
      setForm((f) => ({ ...f, notes: "" }));
      await refreshEvents();
    } catch (err) {
      setError(err?.message || "Failed to stop downtime and save event.");
    } finally {
      setBusy(false);
    }
  }

  // PUBLIC_INTERFACE
  async function onSubmitNonDowntime(e) {
    /** Submit a non-downtime operator event (speed loss, changeover, quality). */
    e.preventDefault();
    setError("");

    const type = form.type;

    if (type === "DOWNTIME") {
      setError("Use the Start/Stop timer controls for Downtime events.");
      return;
    }

    // Shared reason requirement
    const reasonText = form.reasonText.trim() || reasonLabelForCode(reasonCodes, form.reasonCode);
    if (!form.reasonCode && !reasonText) {
      setError("Please select a reason code or enter a reason.");
      return;
    }

    // Quality validation
    let qualityPayload = null;
    if (type === "QUALITY") {
      const count = Math.max(0, Math.floor(Number(form.qualityCount) || 0));
      if (count <= 0) {
        setError("Quality count must be greater than 0.");
        return;
      }
      if ((form.qualityMode === "scrap" || form.qualityMode === "rework") && !form.defectReasonCode) {
        setError("Please select a defect reason for scrap/rework.");
        return;
      }
      qualityPayload = {
        goodCount: form.qualityMode === "good" ? count : 0,
        scrapCount: form.qualityMode === "scrap" ? count : 0,
        reworkCount: form.qualityMode === "rework" ? count : 0,
        defectReasonCode: form.qualityMode === "good" ? null : form.defectReasonCode
      };
    }

    setBusy(true);
    try {
      await createEvent({
        lineId: form.lineId,
        machineId: form.machineId || null,
        type,
        reasonCode: form.reasonCode || null,
        reason: reasonText,
        durationMinutes: type === "SPEED_LOSS" || type === "CHANGEOVER" ? Number(form.durationMinutes) || 0 : 0,
        status: "CLOSED",
        notes: form.notes.trim(),
        quality: qualityPayload,
        createdBy: "operator"
      });

      setForm((f) => ({
        ...f,
        reasonText: "",
        durationMinutes: 0,
        notes: "",
        qualityCount: 1,
        defectReasonCode: ""
      }));
      await refreshEvents();
    } catch (err) {
      setError(err?.message || "Failed to create event.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(e) {
    setSelectedEvent(e);
    setEditPatch({
      lineId: e.lineId,
      machineId: e.machineId || "",
      type: e.type,
      reasonCode: e.reasonCode || "",
      reason: e.reason || "",
      // downtime fields
      startAt: e.startAt || "",
      endAt: e.endAt || "",
      status: e.status || "CLOSED",
      durationMinutes: computeDurationMinutesForEvent(e),
      notes: e.notes || "",
      // quality
      qualityMode: e?.quality?.goodCount ? "good" : e?.quality?.reworkCount ? "rework" : "scrap",
      qualityCount: e?.quality?.goodCount || e?.quality?.scrapCount || e?.quality?.reworkCount || 0,
      defectReasonCode: e?.quality?.defectReasonCode || ""
    });
    setEditOpen(true);
  }

  async function submitEdit() {
    setError("");
    if (!selectedEvent?.id || !editPatch) return;

    if (selectedEvent.isVoided) {
      setError("Voided events cannot be edited.");
      return;
    }

    // Basic validation
    const reasonText = String(editPatch.reason || "").trim() || reasonLabelForCode(reasonCodes, editPatch.reasonCode);
    if (!editPatch.reasonCode && !reasonText) {
      setError("Reason is required.");
      return;
    }

    let patch = {
      lineId: editPatch.lineId,
      machineId: editPatch.machineId || null,
      type: editPatch.type,
      reasonCode: editPatch.reasonCode || null,
      reason: reasonText,
      notes: String(editPatch.notes || "").trim()
    };

    if (editPatch.type === "DOWNTIME") {
      const status = editPatch.status || "CLOSED";
      patch = {
        ...patch,
        status,
        startAt: editPatch.startAt || null,
        endAt: status === "CLOSED" ? editPatch.endAt || null : null,
        durationMinutes: status === "CLOSED" ? Number(editPatch.durationMinutes) || 0 : 0
      };
    } else {
      patch = {
        ...patch,
        durationMinutes: editPatch.type === "SPEED_LOSS" || editPatch.type === "CHANGEOVER" ? Number(editPatch.durationMinutes) || 0 : 0,
        status: "CLOSED",
        startAt: null,
        endAt: null
      };
    }

    if (editPatch.type === "QUALITY") {
      const count = Math.max(0, Math.floor(Number(editPatch.qualityCount) || 0));
      if (count <= 0) {
        setError("Quality count must be greater than 0.");
        return;
      }
      if ((editPatch.qualityMode === "scrap" || editPatch.qualityMode === "rework") && !editPatch.defectReasonCode) {
        setError("Defect reason is required for scrap/rework.");
        return;
      }
      patch.quality = {
        goodCount: editPatch.qualityMode === "good" ? count : 0,
        scrapCount: editPatch.qualityMode === "scrap" ? count : 0,
        reworkCount: editPatch.qualityMode === "rework" ? count : 0,
        defectReasonCode: editPatch.qualityMode === "good" ? null : editPatch.defectReasonCode
      };
    } else {
      patch.quality = null;
    }

    setBusy(true);
    try {
      await updateEvent(selectedEvent.id, patch, { updatedBy: "operator" });
      setEditOpen(false);
      setSelectedEvent(null);
      setEditPatch(null);
      await refreshEvents();
    } catch (err) {
      setError(err?.message || "Failed to edit event.");
    } finally {
      setBusy(false);
    }
  }

  function openVoid(e) {
    setSelectedEvent(e);
    setVoidReason("");
    setVoidOpen(true);
  }

  async function submitVoid() {
    setError("");
    if (!selectedEvent?.id) return;

    const reason = String(voidReason || "").trim();
    if (!reason) {
      setError("Void reason is required.");
      return;
    }

    if (selectedEvent.isVoided) {
      setError("Event already voided.");
      return;
    }

    setBusy(true);
    try {
      await voidEvent(selectedEvent.id, { voidReason: reason, voidedBy: "operator" });
      setVoidOpen(false);
      setSelectedEvent(null);
      await refreshEvents();
    } catch (err) {
      setError(err?.message || "Failed to void event.");
    } finally {
      setBusy(false);
    }
  }

  function openAudit(e) {
    setSelectedEvent(e);
    setAuditOpen(true);
  }

  function closeAllDialogs() {
    setEditOpen(false);
    setVoidOpen(false);
    setAuditOpen(false);
    setSelectedEvent(null);
    setEditPatch(null);
    setVoidReason("");
  }

  const showDurationField = form.type === "SPEED_LOSS" || form.type === "CHANGEOVER";
  const showQualityFields = form.type === "QUALITY";

  return (
    <Layout title="Operator Events" subtitle="Downtime timer + structured reason codes, quality counts, and auditable edits/voids" status={rtStatus}>
      <div className="grid gridCols2 gridTop">
        <div className="card">
          <div className="cardHeader">
            <h3>Log a production event</h3>
            <span>Structured + fast</span>
          </div>

          {error && (
            <div className="alert alertWarn" role="alert" style={{ marginBottom: 12 }}>
              <strong>Action needed:</strong> {error}
            </div>
          )}

          {/* Active downtime banner */}
          {activeDowntime?.startAt && (
            <div className={`alert ${activeDowntimeContextOk ? "alertInfo" : "alertWarn"}`} style={{ marginBottom: 12 }}>
              <div className="toolbarRow">
                <div className="toolbarLeft">
                  <span className="pillTimer" title="Downtime is currently running">
                    ⏱ {formatDurationHms(activeDowntimeElapsedSeconds)}
                  </span>
                  <div>
                    <strong>Downtime running</strong>
                    <div className="helperText" style={{ marginTop: 4 }}>
                      Line <strong>{activeDowntime.lineId}</strong>
                      {activeDowntime.machineId ? ` • Machine ${activeDowntime.machineId}` : ""} •{" "}
                      {activeDowntime.reasonCode ? reasonLabelForCode(reasonCodes, activeDowntime.reasonCode) : activeDowntime.reason}
                    </div>
                  </div>
                </div>
                <div className="toolbarRight">
                  <button className="btnPrimary btnSmall" onClick={stopDowntime} disabled={busy}>
                    {busy ? "Saving..." : "Stop & save"}
                  </button>
                </div>
              </div>
              {!activeDowntimeContextOk && (
                <div className="helperText" style={{ marginTop: 8 }}>
                  Note: your form is on <strong>{form.lineId}</strong> but the running downtime is for <strong>{activeDowntime.lineId}</strong>.
                </div>
              )}
            </div>
          )}

          <form onSubmit={onSubmitNonDowntime}>
            <div className="formRow">
              <div className="field">
                <label htmlFor="lineId">Line</label>
                <select id="lineId" value={form.lineId} onChange={(e) => setForm((f) => ({ ...f, lineId: e.target.value, machineId: "" }))}>
                  {(snapshot?.lines || []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="machineId">Machine</label>
                <select id="machineId" value={form.machineId} onChange={(e) => setForm((f) => ({ ...f, machineId: e.target.value }))}>
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
                <select
                  id="type"
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      type: e.target.value,
                      // clear type-specific fields to avoid stale data
                      durationMinutes: 0,
                      qualityMode: "scrap",
                      qualityCount: 1,
                      defectReasonCode: ""
                    }))
                  }
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {showDurationField ? (
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
              ) : (
                <div className="field">
                  <label>Duration</label>
                  <div className="helperText" style={{ paddingTop: 10 }}>
                    {form.type === "DOWNTIME" ? "Use Start/Stop timer" : "Auto (0 min)"}
                  </div>
                </div>
              )}
            </div>

            <div style={{ height: 10 }} />

            <div className="field">
              <label htmlFor="reasonSearch">Reason codes</label>
              <input
                id="reasonSearch"
                value={form.reasonSearch}
                placeholder="Search reason codes (e.g., material, jam...)"
                onChange={(e) => setForm((f) => ({ ...f, reasonSearch: e.target.value }))}
              />
              <div className="helperText" style={{ marginTop: 6 }}>
                Select a reason code (recommended). You can also enter free-text reason below.
              </div>
            </div>

            <div style={{ height: 10 }} />

            {favoriteChips.length > 0 && (
              <>
                <div className="field">
                  <label>Favorites</label>
                  <div className="chipRow" role="list" aria-label="Favorite reason codes">
                    {favoriteChips.map((r) => {
                      const active = form.reasonCode === r.code;
                      return (
                        <button
                          key={r.code}
                          type="button"
                          className={`chip ${active ? "chipActive" : ""}`}
                          onClick={() => setReasonCode(r.code)}
                          title={r.code}
                        >
                          <span className="chipStar" aria-hidden="true">
                            ★
                          </span>
                          {r.label}
                        </button>
                      );
                    })}
                    {form.reasonCode && (
                      <button type="button" className="chip" onClick={clearReasonSelection}>
                        Clear selection
                      </button>
                    )}
                  </div>
                </div>
                <div style={{ height: 10 }} />
              </>
            )}

            <div className="field">
              <label htmlFor="reasonCode">Reason code</label>
              <select
                id="reasonCode"
                value={form.reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                aria-label="Reason code"
              >
                <option value="">(Optional) Select code…</option>
                {filteredReasonCodes.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.label} ({r.code})
                  </option>
                ))}
              </select>

              {form.reasonCode && (
                <div className="helperText" style={{ marginTop: 6 }}>
                  <span className="inlineActions">
                    <button type="button" className="btnGhost btnSmall" onClick={() => toggleFavoriteReason(form.reasonCode)}>
                      {favoriteReasonCodes.includes(form.reasonCode) ? "★ Unfavorite" : "☆ Favorite"}
                    </button>
                    <span className="muted">Tip: favorites are saved to this browser.</span>
                  </span>
                </div>
              )}
            </div>

            <div style={{ height: 10 }} />

            <div className="field">
              <label htmlFor="reasonText">Reason (free text)</label>
              <input
                id="reasonText"
                value={form.reasonText}
                placeholder="Optional details (e.g., which material / where it occurred)"
                onChange={(e) => setForm((f) => ({ ...f, reasonText: e.target.value }))}
              />
            </div>

            {showQualityFields && (
              <>
                <div style={{ height: 10 }} />
                <div className="formRow">
                  <div className="field">
                    <label htmlFor="qualityMode">Quality type</label>
                    <select
                      id="qualityMode"
                      value={form.qualityMode}
                      onChange={(e) => setForm((f) => ({ ...f, qualityMode: e.target.value, defectReasonCode: "" }))}
                    >
                      {QUALITY_MODE.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="qualityCount">Count</label>
                    <input
                      id="qualityCount"
                      type="number"
                      min="0"
                      step="1"
                      value={form.qualityCount}
                      onChange={(e) => setForm((f) => ({ ...f, qualityCount: e.target.value }))}
                    />
                  </div>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="defectReasonCode">Defect reason</label>
                    <select
                      id="defectReasonCode"
                      value={form.defectReasonCode}
                      disabled={form.qualityMode === "good"}
                      onChange={(e) => setForm((f) => ({ ...f, defectReasonCode: e.target.value }))}
                    >
                      <option value="">{form.qualityMode === "good" ? "(Not needed for good)" : "Select defect reason…"}</option>
                      {defectReasons.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.label} ({d.code})
                        </option>
                      ))}
                    </select>
                    <div className="helperText" style={{ marginTop: 6 }}>
                      For Scrap/Rework, defect reason is required to support Pareto analysis.
                    </div>
                  </div>
                </div>
              </>
            )}

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

            {/* Action buttons */}
            {form.type === "DOWNTIME" ? (
              <div className="toolbarRow">
                <div className="toolbarLeft">
                  <button type="button" className="btnPrimary" disabled={busy || !!activeDowntime?.startAt} onClick={startDowntime}>
                    Start downtime timer
                  </button>
                  <span className="helperText">
                    {activeDowntime?.startAt ? "Timer running above" : "Start timer now; stop will save a closed downtime event."}
                  </span>
                </div>
                <div className="toolbarRight">
                  <button type="button" className="btnGhost" disabled={busy} onClick={() => setForm((f) => ({ ...f, reasonSearch: "" }))}>
                    Clear search
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" className="btnPrimary" disabled={busy}>
                {busy ? "Saving..." : "Submit event"}
              </button>
            )}
          </form>

          <div className="alert alertInfo" style={{ marginTop: 12 }}>
            <strong>Note:</strong> This UI supports <em>edit</em> and <em>void</em> workflows with an audit trail (mocked locally until backend exists).
          </div>
        </div>

        <div className="card cardScrollX">
          <div className="cardHeader">
            <h3>Event history</h3>
            <span>{historyRows.length} shown</span>
          </div>

          <div className="toolbarRow" style={{ marginBottom: 10 }}>
            <div className="toolbarLeft">
              <div className="field" style={{ minWidth: 240 }}>
                <label htmlFor="histQ">Search</label>
                <input
                  id="histQ"
                  value={filters.q}
                  placeholder="Reason, defect, notes, machine, line…"
                  onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
                />
              </div>

              <div className="field" style={{ minWidth: 180 }}>
                <label htmlFor="histType">Type</label>
                <select id="histType" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
                  <option value="ALL">All</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ minWidth: 200 }}>
                <label htmlFor="histLine">Line</label>
                <select id="histLine" value={filters.lineId} onChange={(e) => setFilters((f) => ({ ...f, lineId: e.target.value, machineId: "ALL" }))}>
                  <option value="ALL">All</option>
                  {(snapshot?.lines || []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ minWidth: 200 }}>
                <label htmlFor="histMachine">Machine</label>
                <select
                  id="histMachine"
                  value={filters.machineId}
                  onChange={(e) => setFilters((f) => ({ ...f, machineId: e.target.value }))}
                >
                  <option value="ALL">All</option>
                  {filterMachinesForLine.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field" style={{ minWidth: 160 }}>
                <label htmlFor="includeVoided">Show voided</label>
                <select
                  id="includeVoided"
                  value={filters.includeVoided ? "yes" : "no"}
                  onChange={(e) => setFilters((f) => ({ ...f, includeVoided: e.target.value === "yes" }))}
                >
                  <option value="no">Hide</option>
                  <option value="yes">Include</option>
                </select>
              </div>
            </div>

            <div className="toolbarRight">
              <button type="button" className="btnGhost btnSmall" onClick={refreshEvents} disabled={busy}>
                Refresh
              </button>
            </div>
          </div>

          <table className="table" aria-label="Event history">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Reason</th>
                <th>Line</th>
                <th>Machine</th>
                <th>Duration</th>
                <th>Quality</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.map(({ e, durationMin, edited }) => {
                const voided = !!e.isVoided;
                const rowClass = `${voided ? "tableRowVoided" : ""} ${edited ? "tableRowEdited" : ""}`.trim();
                const badgeClass = e.type === "DOWNTIME" ? "badgeAmber" : e.type === "QUALITY" ? "badgeGreen" : "badgeBlue";
                const quality = e.quality;
                const qualitySummary =
                  e.type !== "QUALITY" || !quality
                    ? "—"
                    : quality.goodCount
                      ? `Good: ${quality.goodCount}`
                      : quality.scrapCount
                        ? `Scrap: ${quality.scrapCount} (${defectLabelForCode(defectReasons, quality.defectReasonCode) || "—"})`
                        : `Rework: ${quality.reworkCount} (${defectLabelForCode(defectReasons, quality.defectReasonCode) || "—"})`;

                return (
                  <tr key={e.id} className={rowClass}>
                    <td>
                      <strong>{formatIsoToLocal(e.createdAt)}</strong>
                      {voided && (
                        <div className="helperText" style={{ marginTop: 4 }}>
                          Voided: {e.voidReason || "—"}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${badgeClass}`}>{e.type}</span>
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {getEventReasonDisplay({ e, reasonCodes })}
                      {e.reasonCode && (
                        <div className="helperText" style={{ marginTop: 4 }}>
                          Code: <strong>{e.reasonCode}</strong>
                        </div>
                      )}
                    </td>
                    <td>{e.lineId}</td>
                    <td>{e.machineId || "—"}</td>
                    <td>{durationMin ? `${durationMin} min` : "—"}</td>
                    <td style={{ minWidth: 220 }}>{qualitySummary}</td>
                    <td>
                      <span className="inlineActions">
                        <button type="button" className="btnGhost btnSmall" onClick={() => openAudit(e)}>
                          Audit
                        </button>
                        <button type="button" className="btnGhost btnSmall" onClick={() => openEdit(e)} disabled={voided}>
                          Edit
                        </button>
                        <button type="button" className="btnDanger btnSmall" onClick={() => openVoid(e)} disabled={voided}>
                          Void
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}

              {!historyRows.length && (
                <tr>
                  <td colSpan={8} style={{ color: "#6b7280" }}>
                    No events match the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="helperText" style={{ marginTop: 10 }}>
            Tip: Use “Void” (not delete) to preserve traceability. Audit shows all changes made to an event.
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      {editOpen && editPatch && (
        <div className="dialogBackdrop" role="dialog" aria-modal="true" aria-label="Edit event dialog" onMouseDown={closeAllDialogs}>
          <div className="dialogCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogHeader">
              <div>
                <h3>Edit event</h3>
                <div className="helperText">Edits are tracked in audit trail.</div>
              </div>
              <button className="iconBtn" onClick={closeAllDialogs} aria-label="Close dialog" type="button">
                ✕
              </button>
            </div>

            <div className="formRow">
              <div className="field">
                <label htmlFor="editLine">Line</label>
                <select
                  id="editLine"
                  value={editPatch.lineId}
                  onChange={(e) => setEditPatch((p) => ({ ...p, lineId: e.target.value, machineId: "" }))}
                >
                  {(snapshot?.lines || []).map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="editMachine">Machine</label>
                <select
                  id="editMachine"
                  value={editPatch.machineId}
                  onChange={(e) => setEditPatch((p) => ({ ...p, machineId: e.target.value }))}
                >
                  <option value="">(Optional)</option>
                  {(snapshot?.machines || [])
                    .filter((m) => m.lineId === editPatch.lineId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="editType">Type</label>
                <select
                  id="editType"
                  value={editPatch.type}
                  onChange={(e) =>
                    setEditPatch((p) => ({
                      ...p,
                      type: e.target.value,
                      durationMinutes: 0,
                      startAt: "",
                      endAt: "",
                      status: "CLOSED",
                      qualityMode: "scrap",
                      qualityCount: 1,
                      defectReasonCode: ""
                    }))
                  }
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="editReasonCode">Reason code</label>
                <select
                  id="editReasonCode"
                  value={editPatch.reasonCode}
                  onChange={(e) => setEditPatch((p) => ({ ...p, reasonCode: e.target.value }))}
                >
                  <option value="">(Optional)</option>
                  {(reasonCodes || [])
                    .filter((r) => !r.types?.length || r.types.includes(editPatch.type))
                    .map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label} ({r.code})
                      </option>
                    ))}
                </select>
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="editReason">Reason</label>
                <input id="editReason" value={editPatch.reason} onChange={(e) => setEditPatch((p) => ({ ...p, reason: e.target.value }))} />
              </div>

              {(editPatch.type === "SPEED_LOSS" || editPatch.type === "CHANGEOVER") && (
                <div className="field">
                  <label htmlFor="editDuration">Duration (min)</label>
                  <input
                    id="editDuration"
                    type="number"
                    min="0"
                    step="1"
                    value={editPatch.durationMinutes}
                    onChange={(e) => setEditPatch((p) => ({ ...p, durationMinutes: e.target.value }))}
                  />
                </div>
              )}

              {editPatch.type === "DOWNTIME" && (
                <>
                  <div className="field">
                    <label htmlFor="editStatus">Downtime status</label>
                    <select id="editStatus" value={editPatch.status} onChange={(e) => setEditPatch((p) => ({ ...p, status: e.target.value }))}>
                      <option value="CLOSED">Closed</option>
                      <option value="OPEN">Open</option>
                    </select>
                    <div className="helperText" style={{ marginTop: 6 }}>
                      Open downtime indicates ongoing downtime (timer-based). In mock mode it’s informational.
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="editStartAt">Start (ISO)</label>
                    <input
                      id="editStartAt"
                      value={editPatch.startAt}
                      placeholder="e.g., 2026-01-01T12:00:00.000Z"
                      onChange={(e) => setEditPatch((p) => ({ ...p, startAt: e.target.value }))}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="editEndAt">End (ISO)</label>
                    <input
                      id="editEndAt"
                      value={editPatch.endAt}
                      placeholder="e.g., 2026-01-01T12:05:00.000Z"
                      disabled={editPatch.status !== "CLOSED"}
                      onChange={(e) => setEditPatch((p) => ({ ...p, endAt: e.target.value }))}
                    />
                  </div>

                  <div className="field">
                    <label htmlFor="editDuration2">Duration (min)</label>
                    <input
                      id="editDuration2"
                      type="number"
                      min="0"
                      step="1"
                      disabled={editPatch.status !== "CLOSED"}
                      value={editPatch.durationMinutes}
                      onChange={(e) => setEditPatch((p) => ({ ...p, durationMinutes: e.target.value }))}
                    />
                    <div className="helperText" style={{ marginTop: 6 }}>
                      If Start/End are provided, duration will be computed if left at 0.
                    </div>
                  </div>
                </>
              )}

              {editPatch.type === "QUALITY" && (
                <>
                  <div className="field">
                    <label htmlFor="editQMode">Quality type</label>
                    <select
                      id="editQMode"
                      value={editPatch.qualityMode}
                      onChange={(e) => setEditPatch((p) => ({ ...p, qualityMode: e.target.value, defectReasonCode: "" }))}
                    >
                      {QUALITY_MODE.map((m) => (
                        <option key={m.value} value={m.value}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="editQCount">Count</label>
                    <input
                      id="editQCount"
                      type="number"
                      min="0"
                      step="1"
                      value={editPatch.qualityCount}
                      onChange={(e) => setEditPatch((p) => ({ ...p, qualityCount: e.target.value }))}
                    />
                  </div>

                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label htmlFor="editDefect">Defect reason</label>
                    <select
                      id="editDefect"
                      value={editPatch.defectReasonCode}
                      disabled={editPatch.qualityMode === "good"}
                      onChange={(e) => setEditPatch((p) => ({ ...p, defectReasonCode: e.target.value }))}
                    >
                      <option value="">{editPatch.qualityMode === "good" ? "(Not needed for good)" : "Select defect reason…"}</option>
                      {defectReasons.map((d) => (
                        <option key={d.code} value={d.code}>
                          {d.label} ({d.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="editNotes">Notes</label>
                <textarea id="editNotes" value={editPatch.notes} onChange={(e) => setEditPatch((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>

            <div style={{ height: 12 }} />
            <div className="toolbarRow">
              <div className="toolbarLeft">
                <button type="button" className="btnPrimary" onClick={submitEdit} disabled={busy}>
                  {busy ? "Saving..." : "Save changes"}
                </button>
                <button type="button" className="btnGhost" onClick={closeAllDialogs} disabled={busy}>
                  Cancel
                </button>
              </div>
              <div className="toolbarRight">
                <button type="button" className="btnDanger" onClick={() => openVoid(selectedEvent)} disabled={busy}>
                  Void event…
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Void dialog */}
      {voidOpen && selectedEvent && (
        <div className="dialogBackdrop" role="dialog" aria-modal="true" aria-label="Void event dialog" onMouseDown={closeAllDialogs}>
          <div className="dialogCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogHeader">
              <div>
                <h3>Void event</h3>
                <div className="helperText">This keeps the record but marks it as voided (audit-safe).</div>
              </div>
              <button className="iconBtn" onClick={closeAllDialogs} aria-label="Close dialog" type="button">
                ✕
              </button>
            </div>

            <div className="alert alertWarn" style={{ marginBottom: 12 }}>
              <strong>Event:</strong> {selectedEvent.type} • {getEventReasonDisplay({ e: selectedEvent, reasonCodes })} • {selectedEvent.lineId}
            </div>

            <div className="field">
              <label htmlFor="voidReason">Void reason</label>
              <textarea
                id="voidReason"
                value={voidReason}
                placeholder="Explain why this entry is invalid (required)"
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>

            <div style={{ height: 12 }} />

            <div className="toolbarRow">
              <div className="toolbarLeft">
                <button type="button" className="btnDanger" onClick={submitVoid} disabled={busy}>
                  {busy ? "Saving..." : "Void event"}
                </button>
                <button type="button" className="btnGhost" onClick={closeAllDialogs} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit dialog */}
      {auditOpen && selectedEvent && (
        <div className="dialogBackdrop" role="dialog" aria-modal="true" aria-label="Audit trail dialog" onMouseDown={closeAllDialogs}>
          <div className="dialogCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="dialogHeader">
              <div>
                <h3>Audit trail</h3>
                <div className="helperText">Created/edited/voided records for traceability.</div>
              </div>
              <button className="iconBtn" onClick={closeAllDialogs} aria-label="Close dialog" type="button">
                ✕
              </button>
            </div>

            <div className="alert alertInfo" style={{ marginBottom: 12 }}>
              <strong>{selectedEvent.type}</strong> • {getEventReasonDisplay({ e: selectedEvent, reasonCodes })} • {formatIsoToLocal(selectedEvent.createdAt)}
            </div>

            <table className="table" aria-label="Audit trail">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {(selectedEvent.auditTrail || []).slice().reverse().map((a, idx) => (
                  <tr key={`${a.at}-${idx}`}>
                    <td>{formatIsoToLocal(a.at)}</td>
                    <td>{a.by || "—"}</td>
                    <td>
                      <span className={`badge ${a.action === "VOIDED" ? "badgeAmber" : a.action === "EDITED" ? "badgeBlue" : "badgeGreen"}`}>
                        {a.action}
                      </span>
                    </td>
                    <td style={{ color: "#6b7280" }}>
                      <code style={{ fontSize: 11 }}>{JSON.stringify(a.changes || {})}</code>
                    </td>
                  </tr>
                ))}
                {(!selectedEvent.auditTrail || !selectedEvent.auditTrail.length) && (
                  <tr>
                    <td colSpan={4} style={{ color: "#6b7280" }}>
                      No audit history available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div style={{ height: 12 }} />
            <button type="button" className="btnGhost" onClick={closeAllDialogs}>
              Close
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
