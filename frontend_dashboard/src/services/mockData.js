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

const store = {
  lines: defaultLines,
  machines: defaultMachines,
  kpisByLine: {
    "line-1": { availability: 0.90, performance: 0.86, quality: 0.98 },
    "line-2": { availability: 0.84, performance: 0.90, quality: 0.96 }
  },
  events: [
    {
      id: "evt-1",
      createdAt: nowIso(),
      lineId: "line-1",
      machineId: "mc-100",
      type: "DOWNTIME",
      reason: "Material shortage",
      durationMinutes: 12,
      notes: "Waiting on inbound pallets."
    },
    {
      id: "evt-2",
      createdAt: nowIso(),
      lineId: "line-2",
      machineId: "mc-200",
      type: "QUALITY",
      reason: "Seal defect",
      durationMinutes: 0,
      notes: "Adjusted temperature, monitoring."
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
export function mockCreateEvent(eventInput) {
  /** Adds a new operator event to the in-memory store and returns created event. */
  const evt = {
    id: `evt-${Math.floor(Math.random() * 1e9)}`,
    createdAt: nowIso(),
    ...eventInput
  };
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
    if (idx >= 0 && evt.type === "DOWNTIME") store.machines[idx] = { ...store.machines[idx], status: "stopped" };
    if (idx >= 0 && evt.type !== "DOWNTIME") store.machines[idx] = { ...store.machines[idx], status: "running" };
  }

  return evt;
}
