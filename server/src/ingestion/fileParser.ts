import { parse as parseCsv } from "csv-parse/sync";
import ExcelJS from "exceljs";

export interface ParsedTable {
  name: string;
  rows: Record<string, unknown>[];
}

export type SupportedExt = "csv" | "json" | "xlsx" | "xls";

export function extOf(fileName: string): SupportedExt | undefined {
  const m = /\.([a-z0-9]+)$/i.exec(fileName);
  const ext = m?.[1]?.toLowerCase();
  if (ext === "csv" || ext === "json" || ext === "xlsx" || ext === "xls") return ext;
  return undefined;
}

export async function parseAttachment(fileName: string, buffer: Buffer): Promise<ParsedTable[]> {
  const ext = extOf(fileName);
  const baseName = fileName.replace(/\.[^.]+$/, "");

  switch (ext) {
    case "csv":
      return [{ name: baseName, rows: parseCsvBuffer(buffer) }];
    case "json":
      return [{ name: baseName, rows: parseJsonBuffer(buffer) }];
    case "xlsx":
    case "xls":
      return parseXlsxBuffer(buffer);
    default:
      throw new Error(
        `Unsupported file type for "${fileName}". Supported: .csv, .json, .xlsx, .xls`,
      );
  }
}

function parseCsvBuffer(buffer: Buffer): Record<string, unknown>[] {
  const records = parseCsv(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
  return records;
}

function parseJsonBuffer(buffer: Buffer): Record<string, unknown>[] {
  const text = buffer.toString("utf-8");
  const data = JSON.parse(text);

  if (Array.isArray(data)) {
    return data.map((row) =>
      typeof row === "object" && row !== null ? (row as Record<string, unknown>) : { value: row },
    );
  }
  if (typeof data === "object" && data !== null) {
    // A single object, or an { items: [...] } / { data: [...] } wrapper.
    for (const key of ["rows", "items", "data", "records"]) {
      const nested = (data as Record<string, unknown>)[key];
      if (Array.isArray(nested)) {
        return nested.map((row) =>
          typeof row === "object" && row !== null
            ? (row as Record<string, unknown>)
            : { value: row },
        );
      }
    }
    return [data as Record<string, unknown>];
  }
  throw new Error("JSON file must contain an array of objects, or an object wrapping one.");
}

async function parseXlsxBuffer(buffer: Buffer): Promise<ParsedTable[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const tables: ParsedTable[] = [];

  workbook.eachSheet((sheet) => {
    const rows: Record<string, unknown>[] = [];
    let headers: string[] = [];

    sheet.eachRow((row, rowNumber) => {
      const values = normalizeRowValues(row.values as unknown[]);
      if (rowNumber === 1) {
        headers = values.map((v, i) => (v !== null && v !== undefined && v !== "" ? String(v) : `col_${i}`));
        return;
      }
      const record: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        record[header] = values[i] ?? null;
      });
      rows.push(record);
    });

    if (rows.length > 0) tables.push({ name: sheet.name, rows });
  });

  return tables;
}

function normalizeRowValues(values: unknown[]): unknown[] {
  // ExcelJS row.values is 1-indexed (index 0 is always empty) — drop it.
  return values.slice(1).map((v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "object" && "result" in (v as Record<string, unknown>)) {
      return (v as { result: unknown }).result;
    }
    if (typeof v === "object" && "text" in (v as Record<string, unknown>)) {
      return (v as { text: unknown }).text;
    }
    if (v instanceof Date) return v.toISOString();
    return v;
  });
}
