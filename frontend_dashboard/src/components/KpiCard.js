import React from "react";

// PUBLIC_INTERFACE
export function KpiCard({ title, valuePct, subtitle, tone = "blue" }) {
  /**
   * KPI card.
   * @param {string} title
   * @param {number} valuePct - 0..100
   * @param {string} subtitle
   * @param {"blue"|"amber"|"green"} tone
   */
  const pct = Number.isFinite(valuePct) ? Math.max(0, Math.min(100, valuePct)) : 0;
  const barClass = tone === "amber" ? "kpiBar kpiBarAmber" : tone === "green" ? "kpiBar kpiBarGreen" : "kpiBar";

  return (
    <div className="card" aria-label={`${title} ${pct.toFixed(1)} percent`}>
      <div className="cardHeader">
        <h3>{title}</h3>
        <span className="badge badgeBlue">{pct.toFixed(1)}%</span>
      </div>
      <div className="kpiValue">{pct.toFixed(1)}%</div>
      <div className="kpiSub">{subtitle}</div>
      <div className={barClass} aria-hidden="true">
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
