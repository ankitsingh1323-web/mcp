import type { EntityAssociation, EntityType } from "../lib/types";

const TYPE_ICON: Record<EntityType, string> = {
  person: "🧑",
  organization: "🏢",
  location: "📍",
  date: "📅",
  other: "🏷️",
};

export function AssociationsCard({ associations }: { associations: EntityAssociation[] }) {
  if (associations.length === 0) {
    return (
      <div className="card">
        <div className="card-title">🕸️ Cross-file associations</div>
        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
          No entity showed up in more than one analyzed dataset yet.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">
        🕸️ Cross-file associations
        <span className="tag">{associations.length} linked entities</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {associations.map((a) => (
          <div key={`${a.type}-${a.entity}`}>
            <div dir="auto" style={{ fontWeight: 600, fontSize: "0.87rem" }}>
              {TYPE_ICON[a.type]} {a.entity}
            </div>
            <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
              Appears in: {a.datasets.map((d) => `${d.name} (${d.mentions}×)`).join(", ")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
