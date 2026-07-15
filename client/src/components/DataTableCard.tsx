import { useState } from "react";
import { materializeDataset } from "../lib/api";
import type { DatasetProfile, DdlResult, MaterializeResult } from "../lib/types";

export function DataTableCard({
  profile,
  ddl,
  materialized,
  onMaterialized,
}: {
  profile: DatasetProfile;
  ddl: DdlResult;
  materialized?: MaterializeResult;
  onMaterialized: (result: MaterializeResult) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleCreate() {
    setLoading(true);
    setError(undefined);
    try {
      const result = await materializeDataset(profile.id);
      onMaterialized(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create table.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">
        🗄️ Data table
        <span className="tag">{ddl.dialect}</span>
      </div>
      <div className="table-scroll">
        <table className="data-preview">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Nulls</th>
              <th>Distinct</th>
            </tr>
          </thead>
          <tbody>
            {profile.columns.map((c) => (
              <tr key={c.name}>
                <td>{c.name}</td>
                <td>{c.inferredType}</td>
                <td>{c.nullCount}</td>
                <td>{c.distinctCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <pre className="ddl-block">{ddl.sql}</pre>
      <div className="card-actions">
        {materialized ? (
          <span className="materialize-note">
            ✓ Created "{materialized.tableName}" — {materialized.rowsInserted} rows in {materialized.dbFile}
            {materialized.preexistingRowCount > 0 &&
              ` (table already had ${materialized.preexistingRowCount} row(s) before this insert)`}
          </span>
        ) : (
          <button className="btn primary" onClick={handleCreate} disabled={loading}>
            {loading ? "Creating…" : "Create table"}
          </button>
        )}
        {error && <span style={{ color: "var(--status-critical)", fontSize: "0.78rem" }}>{error}</span>}
      </div>
    </div>
  );
}
