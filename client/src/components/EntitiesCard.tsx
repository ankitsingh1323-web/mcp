import type { EntityType, NamedEntity } from "../lib/types";

const TYPE_ICON: Record<EntityType, string> = {
  person: "🧑",
  organization: "🏢",
  location: "📍",
  date: "📅",
  other: "🏷️",
};

export function EntitiesCard({ entities, datasetName }: { entities: NamedEntity[]; datasetName: string }) {
  if (entities.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title">
        🏷️ Named entities
        <span className="tag">{datasetName}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {entities.map((e) => (
          <span
            key={`${e.type}-${e.text}`}
            dir="auto"
            className="fchip"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-secondary)",
              fontWeight: 500,
              padding: "4px 10px",
              fontSize: "0.78rem",
              border: "1px solid var(--border)",
            }}
          >
            {TYPE_ICON[e.type]} {e.text}
            {e.mentions > 1 && <span style={{ color: "var(--text-muted)" }}> ×{e.mentions}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
