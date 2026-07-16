import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { DbProfile } from "../auth/authStore.js";
import type { ColumnStats, DdlResult } from "../types.js";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");

export function resolveDbFile(profile: Pick<DbProfile, "file">): string {
  return path.isAbsolute(profile.file) ? profile.file : path.join(REPO_ROOT, profile.file);
}

export function openDb(profile: DbProfile): Database.Database {
  const file = resolveDbFile(profile);
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { readonly: !!profile.readOnly });
  db.pragma("journal_mode = WAL");
  return db;
}

export interface TableIntrospection {
  name: string;
  columns: { name: string; type: string; notNull: boolean; pk: boolean }[];
  rowCount: number;
}

export function listTables(db: Database.Database): TableIntrospection[] {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as { name: string }[];

  return tables.map(({ name }) => {
    const columns = db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as {
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }[];
    const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${quoteIdent(name)}`).get() as {
      count: number;
    };
    return {
      name,
      rowCount: count,
      columns: columns.map((c) => ({
        name: c.name,
        type: c.type,
        notNull: c.notnull === 1,
        pk: c.pk === 1,
      })),
    };
  });
}

export function sampleRows(
  db: Database.Database,
  tableName: string,
  limit = 25,
): Record<string, unknown>[] {
  return db.prepare(`SELECT * FROM ${quoteIdent(tableName)} LIMIT ?`).all(limit) as Record<
    string,
    unknown
  >[];
}

export function tableRowCount(db: Database.Database, tableName: string): number {
  const exists = db
    .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`)
    .get(tableName);
  if (!exists) return 0;
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${quoteIdent(tableName)}`).get() as {
    count: number;
  };
  return count;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Only SELECT statements may be executed against a live connection from chat/query routes. */
export function isReadOnlySelect(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (!/^select\b/i.test(trimmed)) return false;
  if (/\b(insert|update|delete|drop|alter|attach|pragma|create)\b/i.test(trimmed)) return false;
  return true;
}

export function runReadOnlyQuery(
  db: Database.Database,
  sql: string,
  limit = 200,
): Record<string, unknown>[] {
  if (!isReadOnlySelect(sql)) {
    throw new Error("Only single SELECT statements are permitted.");
  }
  const capped = /\blimit\b/i.test(sql) ? sql : `${sql.replace(/;+\s*$/, "")} LIMIT ${limit}`;
  return db.prepare(capped).all() as Record<string, unknown>[];
}

export function materializeTable(
  db: Database.Database,
  ddl: DdlResult,
  columns: ColumnStats[],
  rows: Record<string, unknown>[],
): number {
  db.exec(ddl.sql);

  const colNames = columns.map((c) => c.name);
  const placeholders = colNames.map(() => "?").join(", ");
  const insert = db.prepare(
    `INSERT INTO ${quoteIdent(ddl.tableName)} (${colNames.map(quoteIdent).join(", ")}) VALUES (${placeholders})`,
  );

  const insertMany = db.transaction((batch: Record<string, unknown>[]) => {
    for (const row of batch) {
      insert.run(...colNames.map((name) => normalizeValue(row[name])));
    }
  });

  insertMany(rows);
  return rows.length;
}

/**
 * Materializes a suggested cross-file JOIN into a brand-new table via
 * CREATE TABLE ... AS SELECT. `selectSql` must already be a validated
 * read-only SELECT (see isReadOnlySelect) referencing tables that already
 * exist in this db — callers are responsible for materializing both source
 * tables first.
 */
export function materializeJoinQuery(db: Database.Database, selectSql: string, newTableName: string): number {
  if (!isReadOnlySelect(selectSql)) {
    throw new Error("Only a single SELECT statement may be materialized as a join.");
  }
  const quoted = quoteIdent(newTableName);
  db.exec(`DROP TABLE IF EXISTS ${quoted}`);
  db.exec(`CREATE TABLE ${quoted} AS ${selectSql}`);
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM ${quoted}`).get() as { count: number };
  return count;
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  return value;
}
