import type { DatasetProfile } from "../lib/types";

export function DocumentCard({ profile }: { profile: DatasetProfile }) {
  const meta = profile.documentMeta;
  return (
    <div className="card">
      <div className="card-title">
        📄 {profile.name}
        <span className="tag">{profile.sourceLabel}</span>
      </div>
      <div className="mini-stats">
        <div>
          <div className="mini-stat-value">{(meta?.wordCount ?? 0).toLocaleString()}</div>
          <div className="mini-stat-label">Words</div>
        </div>
        {meta?.pageCount !== undefined && (
          <div>
            <div className="mini-stat-value">{meta.pageCount}</div>
            <div className="mini-stat-label">Pages</div>
          </div>
        )}
      </div>
      {meta?.excerpt && (
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: 10, lineHeight: 1.6 }}>
          {meta.excerpt}
          {meta.excerpt.length >= 500 && "…"}
        </p>
      )}
    </div>
  );
}
