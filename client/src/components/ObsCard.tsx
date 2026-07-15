import type { ObsHealthReport } from "../lib/types";

export function ObsCard({ report }: { report: ObsHealthReport }) {
  return (
    <div className="card">
      <div className="card-title">
        📡 {report.profile}
        <span
          className={`badge ${report.reachable ? "badge-low" : "badge-critical"}`}
          style={{ marginLeft: "auto" }}
        >
          {report.reachable ? "reachable" : "unreachable"}
        </span>
      </div>
      <div className="obs-metrics">
        {report.metrics.map((m) => (
          <div className="obs-metric-row" key={m.query}>
            <span>{m.query.replace(/_/g, " ")}</span>
            <span>{m.error ? <span style={{ color: "var(--status-critical)" }}>{m.error}</span> : m.value ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
