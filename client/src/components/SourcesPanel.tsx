import { useRef, useState } from "react";
import type { DatasetProfile, PiiSeverity, SourcesResponse } from "../lib/types";

const SOURCE_ICON: Record<DatasetProfile["sourceKind"], string> = {
  attachment: "📄",
  database: "🗄️",
  observability: "📡",
};

export function SourcesPanel({
  sources,
  datasets,
  datasetRisk,
  onUpload,
  onConnectDb,
  onConnectObs,
  connectingDb,
  connectingObs,
  uploading,
}: {
  sources: SourcesResponse | undefined;
  datasets: DatasetProfile[];
  datasetRisk: Record<string, PiiSeverity | undefined>;
  onUpload: (files: File[]) => void;
  onConnectDb: (name: string) => void;
  onConnectObs: (name: string) => void;
  connectingDb: string | null;
  connectingObs: string | null;
  uploading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    onUpload(Array.from(fileList));
  }

  return (
    <>
      <div className="section">
        <div className="section-title">Attachments</div>
        <div
          className={`dropzone ${dragOver ? "dragover" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          {uploading ? "Uploading…" : "Drop CSV / JSON / XLSX here, or click to browse"}
          <small>Parsed locally in your workspace, never leaves this app</small>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,.json,.xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="section">
        <div className="section-title">Databases</div>
        {sources && sources.db.length > 0 ? (
          <div className="source-list">
            {sources.db.map((db) => (
              <div className="source-item" key={db.name}>
                <div className="source-item-info">
                  <span className="source-item-name">{db.name}</span>
                  <span className="source-item-desc">{db.description ?? db.kind}</span>
                </div>
                <button
                  className="btn"
                  disabled={connectingDb === db.name}
                  onClick={() => onConnectDb(db.name)}
                >
                  {connectingDb === db.name ? "…" : "Connect"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-hint">
            No database profiles configured. Copy <code>auth-config/db-profiles.example.json</code> to{" "}
            <code>db-profiles.json</code> to add one.
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">Observability</div>
        {sources && sources.obs.length > 0 ? (
          <div className="source-list">
            {sources.obs.map((obs) => (
              <div className="source-item" key={obs.name}>
                <div className="source-item-info">
                  <span className="source-item-name">{obs.name}</span>
                  <span className="source-item-desc">{obs.description ?? obs.kind}</span>
                </div>
                <button
                  className="btn"
                  disabled={connectingObs === obs.name}
                  onClick={() => onConnectObs(obs.name)}
                >
                  {connectingObs === obs.name ? "…" : "Check"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-hint">
            No observability profiles configured. Copy <code>auth-config/obs-profiles.example.json</code> to{" "}
            <code>obs-profiles.json</code> to add one.
          </div>
        )}
      </div>

      <div className="section">
        <div className="section-title">Workspace ({datasets.length})</div>
        {datasets.length === 0 ? (
          <div className="empty-hint">Nothing analyzed yet — upload a file or connect a source above.</div>
        ) : (
          <div className="source-list">
            {datasets.map((d) => {
              const risk = datasetRisk[d.id];
              return (
                <div className="dataset-chip" key={d.id}>
                  <div className="dataset-chip-top">
                    <span className="dataset-chip-name">
                      {SOURCE_ICON[d.sourceKind]} {d.name}
                    </span>
                    {risk && <span className={`badge badge-${risk}`}>{risk}</span>}
                  </div>
                  <span className="dataset-chip-meta">
                    {d.rowCount.toLocaleString()} rows · {d.columns.length} cols
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
