import { useState } from "react";
import { materializeJoin } from "../lib/api";
import type { JoinSuggestion } from "../lib/types";

function SuggestionRow({ suggestion }: { suggestion: JoinSuggestion }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ tableName: string; rowCount: number } | undefined>();
  const [error, setError] = useState<string | undefined>();

  async function handleCombine() {
    setLoading(true);
    setError(undefined);
    try {
      const res = await materializeJoin(suggestion);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to combine tables.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 12, marginBottom: 12 }}>
      <div style={{ fontSize: "0.85rem", marginBottom: 6 }}>
        <strong>
          {suggestion.leftDatasetName}.{suggestion.leftColumn}
        </strong>{" "}
        ↔{" "}
        <strong>
          {suggestion.rightDatasetName}.{suggestion.rightColumn}
        </strong>
        <span className="tag" style={{ marginLeft: 8 }}>
          {Math.round(suggestion.overlapRatio * 100)}% overlap
        </span>
      </div>
      <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginBottom: 8 }}>
        {suggestion.rationale}
      </div>
      <pre className="ddl-block" style={{ margin: "0 0 8px" }}>
        {suggestion.sql}
      </pre>
      {result ? (
        <span className="materialize-note">
          ✓ Created "{result.tableName}" — {result.rowCount} row(s)
        </span>
      ) : (
        <button className="btn primary" onClick={handleCombine} disabled={loading}>
          {loading ? "Combining…" : "Combine into one table"}
        </button>
      )}
      {error && <span style={{ color: "var(--status-critical)", fontSize: "0.78rem", marginLeft: 8 }}>{error}</span>}
    </div>
  );
}

export function JoinSuggestionsCard({ suggestions }: { suggestions: JoinSuggestion[] }) {
  if (suggestions.length === 0) {
    return (
      <div className="card">
        <div className="card-title">🔗 Suggested combined tables</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          No likely relationships found between the currently loaded tables yet.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">
        🔗 Suggested combined tables
        <span className="tag">{suggestions.length} found</span>
      </div>
      {suggestions.map((s, i) => (
        <SuggestionRow key={i} suggestion={s} />
      ))}
    </div>
  );
}
