import type { CSSProperties } from "react";
import type { PiiSeverity } from "../lib/types";

const STATUS_COLOR: Record<PiiSeverity, string> = {
  low: "var(--status-good)",
  medium: "var(--status-warning)",
  high: "var(--status-serious)",
  critical: "var(--status-critical)",
};

const STATUS_LABEL: Record<PiiSeverity, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};

export function Gauge({ score, riskLevel }: { score: number; riskLevel: PiiSeverity }) {
  const color = STATUS_COLOR[riskLevel];
  const pct = Math.max(0, Math.min(100, score));

  const ringStyle: CSSProperties = {
    width: 76,
    height: 76,
    borderRadius: "50%",
    flexShrink: 0,
    background: `conic-gradient(${color} ${pct * 3.6}deg, var(--gridline) 0deg)`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const innerStyle: CSSProperties = {
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "var(--surface-2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div className="gauge-wrap">
      <div style={ringStyle} role="img" aria-label={`Health score ${score} out of 100, ${STATUS_LABEL[riskLevel]}`}>
        <div style={innerStyle}>
          <span className="gauge-figure">{pct}</span>
        </div>
      </div>
      <div>
        <div className="badge" style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color }}>
          {STATUS_LABEL[riskLevel]}
        </div>
        <div className="gauge-caption">out of 100 data-health points</div>
      </div>
    </div>
  );
}
