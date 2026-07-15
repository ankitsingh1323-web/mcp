import type { ColumnStats, ColumnType } from "../lib/types";

const TYPE_ORDER: ColumnType[] = ["integer", "float", "boolean", "date", "datetime", "text", "unknown"];
const TYPE_COLOR: Record<ColumnType, string> = {
  integer: "var(--series-1)",
  float: "var(--series-2)",
  boolean: "var(--series-3)",
  date: "var(--series-4)",
  datetime: "var(--series-5)",
  text: "var(--series-6)",
  unknown: "var(--text-muted)",
};

export function TypeMixBar({ columns }: { columns: ColumnStats[] }) {
  const counts = new Map<ColumnType, number>();
  for (const c of columns) counts.set(c.inferredType, (counts.get(c.inferredType) ?? 0) + 1);

  const segments = TYPE_ORDER.filter((t) => (counts.get(t) ?? 0) > 0).map((t) => ({
    type: t,
    count: counts.get(t) ?? 0,
  }));
  const total = columns.length || 1;

  return (
    <div>
      <div className="type-mix-bar">
        {segments.map((s, i) => (
          <div
            key={s.type}
            style={{
              width: `${(s.count / total) * 100}%`,
              background: TYPE_COLOR[s.type],
              marginLeft: i === 0 ? 0 : 2,
            }}
          />
        ))}
      </div>
      <div className="type-mix-legend">
        {segments.map((s) => (
          <span key={s.type}>
            <span className="legend-dot" style={{ background: TYPE_COLOR[s.type] }} />
            {s.count} {s.type}
          </span>
        ))}
      </div>
    </div>
  );
}
