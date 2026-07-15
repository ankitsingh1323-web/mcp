import type { DatasetProfile } from "../lib/types";
import { TypeMixBar } from "./TypeMixBar";

export function SummaryCard({ profile }: { profile: DatasetProfile }) {
  return (
    <div className="card">
      <div className="card-title">
        📄 {profile.name}
        <span className="tag">{profile.sourceLabel}</span>
      </div>
      <div className="mini-stats">
        <div>
          <div className="mini-stat-value">{profile.rowCount.toLocaleString()}</div>
          <div className="mini-stat-label">Rows</div>
        </div>
        <div>
          <div className="mini-stat-value">{profile.columns.length}</div>
          <div className="mini-stat-label">Columns</div>
        </div>
      </div>
      <TypeMixBar columns={profile.columns} />
    </div>
  );
}
