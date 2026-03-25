/**
 * In-memory mock dataset for demo/runtime without backend.
 * This is intentionally small but representative enough for UI flows.
 */

const nowIso = () => new Date().toISOString();

const defaultLines = [
  { id: "line-1", name: "Line 1 – Assembly" },
  { id: "line-2", name: "Line 2 – Packaging" }
];

const defaultMachines = [
  { id: "mc-100", lineId: "line-1", name: "Press #1", status: "running" },
  { id: "mc-101", lineId: "line-1", name: "CNC #2", status: "stopped" },
  { id: "mc-200", lineId: "line-2", name: "Packer #1", status: "running" }
];

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function computeOee({ availability, performance, quality }) {
  return clamp01(availability) * clamp01(performance) * clamp01(quality);
}

function randomWalk(prev, step = 0.035) {
  const delta = (Math.random() - 0.5) * step * 2;
  return clamp01(prev + delta);
}

function minutesBetweenIso(startIso, endIso) {
  try {
    const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
    if (!Number.isFinite(ms) || ms < 0) return 0;
    return Math.round(ms / 60000);
  } catch {
    return 0;
  }
}

function uuid(prefix) {
  return `${prefix}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Mock "catalogs" of reason codes and defect reasons.
 * In a real backend these would come from e.g. /reason-codes and /defect-reasons.
 */
const defaultReasonCodes = [
  { code: "MAT_SHORT", label: "Material shortage", types: ["DOWNTIME", "SPEED_LOSS"], isDefaultFavorite: true },
  { code: "JAM", label: "Machine jam", types: ["DOWNTIME"], isDefaultFavorite: true },
  { code: "TOOL", label: "Tooling issue", types: ["DOWNTIME", "SPEED_LOSS"] },
  { code: "QC_HOLD", label: "Quality hold", types: ["DOWNTIME", "QUALITY"] },
  { code: "SETUP", label: "Setup / changeover", types: ["CHANGEOVER"], isDefaultFavorite: true },
  { code: "STARVE", label: "Starved (upstream)", types: ["SPEED_LOSS"] },
  { code: "BLOCK", label: "Blocked (downstream)", types: ["SPEED_LOSS"] },
  { code: "CLEAN", label: "Cleaning", types: ["DOWNTIME"] }
];

const defaultDefectReasons = [
  { code: "SEAL", label: "Seal defect" },
  { code: "SCRATCH", label: "Scratch / cosmetic" },
  { code: "DIM", label: "Dimensional out of spec" },
  { code: "CONTAM", label: "Contamination" },
  { code: "MISSING", label: "Missing component" }
];

const store = {
  lines: defaultLines,
  machines: defaultMachines,
  kpisByLine: {
    "line-1": { availability: 0.9, performance: 0.86, quality: 0.98 },
    "line-2": { availability: 0.84, performance: 0.9, quality: 0.96 }
  },

  // Catalogs
  reasonCodes: defaultReasonCodes,
  defectReasons: defaultDefectReasons,

  events: [
    {
      id: "evt-1",
      createdAt: nowIso(),
      lineId: "line-1",
      machineId: "mc-100",
      type: "DOWNTIME",
      // New fields
      reasonCode: "MAT_SHORT",
      reason: "Material shortage",
      startAt: new Date(Date.now() - 12 * 60000).toISOString(),
      endAt: nowIso(),
      durationMinutes: 12,
      status: "CLOSED",
      notes: "Waiting on inbound pallets.",
      quality: null,
      // audit
      isVoided: false,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      auditTrail: [
        { at: nowIso(), by: "operator", action: "CREATED", changes: { type: "DOWNTIME", reasonCode: "MAT_SHORT" } }
      ]
    },
    {
      id: "evt-2",
      createdAt: nowIso(),
      lineId: "line-2",
      machineId: "mc-200",
      type: "QUALITY",
      reasonCode: "QC_HOLD",
      reason: "Seal defect",
      startAt: null,
      endAt: null,
      durationMinutes: 0,
      status: "CLOSED",
      notes: "Adjusted temperature, monitoring.",
      quality: {
        goodCount: 0,
        scrapCount: 3,
        reworkCount: 1,
        defectReasonCode: "SEAL"
      },
      isVoided: false,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      auditTrail: [
        {
          at: nowIso(),
          by: "operator",
          action: "CREATED",
          changes: { type: "QUALITY", quality: { scrapCount: 3, reworkCount: 1, defectReasonCode: "SEAL" } }
        }
      ]
    }
  ]
};

// PUBLIC_INTERFACE
export function mockGetPlantSnapshot() {
  /** Returns snapshot with lines, machines, and aggregated KPIs (with slight jitter each call). */
  // Apply random walk to KPIs for "live" feeling.
  for (const line of store.lines) {
    const prev = store.kpisByLine[line.id];
    store.kpisByLine[line.id] = {
      availability: randomWalk(prev.availability),
      performance: randomWalk(prev.performance),
      quality: randomWalk(prev.quality)
    };
  }

  const lineKpis = store.lines.map((l) => {
    const k = store.kpisByLine[l.id];
    const oee = computeOee(k);
    return { lineId: l.id, ...k, oee };
  });

  return {
    generatedAt: nowIso(),
    lines: store.lines,
    machines: store.machines,
    lineKpis
  };
}

// PUBLIC_INTERFACE
export function mockListEvents({ limit = 25 } = {}) {
  /** Returns latest events (descending by time). */
  const sorted = [...store.events].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return sorted.slice(0, limit);
}

// PUBLIC_INTERFACE
export function mockGetReasonCodes() {
  /** Returns reason codes catalog. */
  return [...store.reasonCodes];
}

// PUBLIC_INTERFACE
export function mockGetDefectReasons() {
  /** Returns defect reasons catalog. */
  return [...store.defectReasons];
}

// PUBLIC_INTERFACE
export function mockCreateEvent(eventInput) {
  /** Adds a new operator event to the in-memory store and returns created event. */
  const createdAt = nowIso();
  const evt = {
    id: uuid("evt"),
    createdAt,
    // common
    lineId: eventInput.lineId,
    machineId: eventInput.machineId ?? null,
    type: eventInput.type,
    // reason
    reasonCode: eventInput.reasonCode ?? null,
    reason: eventInput.reason ?? "",
    // downtime timing
    startAt: eventInput.startAt ?? null,
    endAt: eventInput.endAt ?? null,
    durationMinutes: Number(eventInput.durationMinutes) || 0,
    status: eventInput.status ?? "CLOSED",
    notes: eventInput.notes ?? "",
    // quality payload (or null)
    quality: eventInput.quality ?? null,
    // audit
    isVoided: false,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    auditTrail: [
      {
        at: createdAt,
        by: eventInput.createdBy || "operator",
        action: "CREATED",
        changes: {
          lineId: eventInput.lineId,
          machineId: eventInput.machineId ?? null,
          type: eventInput.type,
          reasonCode: eventInput.reasonCode ?? null,
          reason: eventInput.reason ?? "",
          durationMinutes: Number(eventInput.durationMinutes) || 0,
          status: eventInput.status ?? "CLOSED",
          quality: eventInput.quality ?? null
        }
      }
    ]
  };

  // If this is a closed downtime event and duration isn't provided, compute it.
  if (evt.type === "DOWNTIME" && evt.status === "CLOSED" && evt.startAt && evt.endAt && !evt.durationMinutes) {
    evt.durationMinutes = minutesBetweenIso(evt.startAt, evt.endAt);
  }

  store.events.push(evt);

  // Small KPI impact based on event type.
  const lineId = evt.lineId;
  const prev = store.kpisByLine[lineId] || { availability: 0.85, performance: 0.85, quality: 0.97 };

  if (evt.type === "DOWNTIME") {
    store.kpisByLine[lineId] = { ...prev, availability: clamp01(prev.availability - 0.02) };
  } else if (evt.type === "SPEED_LOSS") {
    store.kpisByLine[lineId] = { ...prev, performance: clamp01(prev.performance - 0.02) };
  } else if (evt.type === "QUALITY") {
    store.kpisByLine[lineId] = { ...prev, quality: clamp01(prev.quality - 0.01) };
  }

  // Update machine status for downtime events.
  if (evt.machineId) {
    const idx = store.machines.findIndex((m) => m.id === evt.machineId);
    if (idx >= 0 && evt.type === "DOWNTIME" && evt.status !== "CLOSED") store.machines[idx] = { ...store.machines[idx], status: "stopped" };
    if (idx >= 0 && evt.type !== "DOWNTIME") store.machines[idx] = { ...store.machines[idx], status: "running" };
  }

  return evt;
}

// PUBLIC_INTERFACE
export function mockUpdateEvent(eventId, patch, { updatedBy = "operator" } = {}) {
  /**
   * Updates an event (edit workflow) and appends to audit trail.
   * @param {string} eventId
   * @param {object} patch - partial event fields to update
   */
  const idx = store.events.findIndex((e) => e.id === eventId);
  if (idx < 0) throw new Error("Event not found");
  const prev = store.events[idx];

  const next = {
    ...prev,
    ...patch
  };

  // If downtime is being closed, compute duration if possible.
  if (next.type === "DOWNTIME" && next.status === "CLOSED" && next.startAt && next.endAt) {
    const computed = minutesBetweenIso(next.startAt, next.endAt);
    next.durationMinutes = Number.isFinite(Number(next.durationMinutes)) && Number(next.durationMinutes) > 0 ? Number(next.durationMinutes) : computed;
  }

  const changes = {};
  for (const [k, v] of Object.entries(patch || {})) {
    changes[k] = { from: prev?.[k], to: v };
  }

  next.auditTrail = [
    ...(prev.auditTrail || []),
    { at: nowIso(), by: updatedBy, action: "EDITED", changes }
  ];

  store.events[idx] = next;
  return next;
}

// PUBLIC_INTERFACE
export function mockVoidEvent(eventId, { voidReason, voidedBy = "operator" } = {}) {
  /**
   * Voids an event and appends audit record.
   * Note: This doesn't remove the event; it is kept for traceability.
   */
  const idx = store.events.findIndex((e) => e.id === eventId);
  if (idx < 0) throw new Error("Event not found");
  const prev = store.events[idx];
  if (prev.isVoided) return prev;

  const next = {
    ...prev,
    isVoided: true,
    voidedAt: nowIso(),
    voidedBy,
    voidReason: voidReason || "No reason provided"
  };
  next.auditTrail = [
    ...(prev.auditTrail || []),
    { at: nowIso(), by: voidedBy, action: "VOIDED", changes: { voidReason: next.voidReason } }
  ];

  store.events[idx] = next;
  return next;
}
