import type { Insight } from "../lib/types";

const CATEGORY_ICON: Record<Insight["category"], string> = {
  summary: "🧭",
  quality: "🧹",
  business: "💡",
  risk: "⚠️",
};

export function InsightsCard({ insights }: { insights: Insight[] }) {
  const business = insights.filter((i) => i.category !== "summary");
  if (business.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title">💡 Business insights</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {business.map((insight) => (
          <div key={insight.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span aria-hidden>{CATEGORY_ICON[insight.category]}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.86rem" }}>{insight.title}</div>
              {insight.body !== insight.title && (
                <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{insight.body}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
