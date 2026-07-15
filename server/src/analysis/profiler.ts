import type { ColumnStats, ColumnType } from "../types.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
const BOOL_VALUES = new Set(["true", "false", "yes", "no", "0", "1"]);

function inferCellType(value: unknown): ColumnType {
  if (value === null || value === undefined || value === "") return "unknown";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "float";

  const str = String(value).trim();
  if (str === "") return "unknown";
  if (DATETIME_RE.test(str)) return "datetime";
  if (DATE_RE.test(str)) return "date";
  if (/^-?\d+$/.test(str)) return "integer";
  if (/^-?\d*\.\d+$/.test(str)) return "float";
  if (BOOL_VALUES.has(str.toLowerCase()) && ["true", "false", "yes", "no"].includes(str.toLowerCase()))
    return "boolean";
  return "text";
}

function reconcileType(a: ColumnType, b: ColumnType): ColumnType {
  if (a === "unknown") return b;
  if (b === "unknown") return a;
  if (a === b) return a;
  // Numeric widening
  const numeric = new Set(["integer", "float"]);
  if (numeric.has(a) && numeric.has(b)) return "float";
  // Anything conflicting collapses to text
  return "text";
}

export function profileRows(rows: Record<string, unknown>[]): ColumnStats[] {
  const columnNames = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((k) => columnNames.add(k));
  }

  const stats: ColumnStats[] = [];

  for (const name of columnNames) {
    const values = rows.map((r) => r[name]);
    const nonNull = values.filter((v) => v !== null && v !== undefined && v !== "");
    const nullCount = values.length - nonNull.length;

    let inferredType: ColumnType = "unknown";
    for (const v of nonNull) {
      inferredType = reconcileType(inferredType, inferCellType(v));
      if (inferredType === "text") break;
    }
    if (inferredType === "unknown") inferredType = "text";

    const distinct = new Set(nonNull.map((v) => String(v)));

    const col: ColumnStats = {
      name,
      inferredType,
      nullable: nullCount > 0,
      nullCount,
      distinctCount: distinct.size,
      sampleValues: nonNull.slice(0, 5),
    };

    if (inferredType === "integer" || inferredType === "float") {
      const nums = nonNull.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
      if (nums.length > 0) {
        col.min = Math.min(...nums);
        col.max = Math.max(...nums);
        col.mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      }
    } else if (inferredType === "date" || inferredType === "datetime") {
      const sorted = [...nonNull].map(String).sort();
      col.min = sorted[0];
      col.max = sorted[sorted.length - 1];
    } else {
      const counts = new Map<string, number>();
      for (const v of nonNull) {
        const key = String(v);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      col.topValues = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, count]) => ({ value, count }));
    }

    stats.push(col);
  }

  return stats;
}
