import type { ColumnStats, ColumnType, DdlResult } from "../types.js";

function sqliteType(type: ColumnType): string {
  switch (type) {
    case "integer":
      return "INTEGER";
    case "float":
      return "REAL";
    case "boolean":
      return "BOOLEAN";
    case "date":
      return "DATE";
    case "datetime":
      return "DATETIME";
    default:
      return "TEXT";
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function sanitizeTableName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safe = cleaned || "dataset";
  return /^[0-9]/.test(safe) ? `t_${safe}` : safe;
}

export function generateCreateTable(tableName: string, columns: ColumnStats[]): DdlResult {
  const name = sanitizeTableName(tableName);
  const columnDefs = columns.map((col) => {
    const type = sqliteType(col.inferredType);
    const nullability = col.nullable ? "" : " NOT NULL";
    return `  ${quoteIdent(col.name)} ${type}${nullability}`;
  });

  const sql = `CREATE TABLE IF NOT EXISTS ${quoteIdent(name)} (\n${columnDefs.join(",\n")}\n);`;

  return { tableName: name, sql, dialect: "sqlite" };
}
