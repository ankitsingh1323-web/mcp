import ExcelJS from "exceljs";

export interface ExcelSheetResult {
  sheetName: string;
  kind: "tabular" | "document";
  rows: Record<string, unknown>[];
  text?: string;
}

export interface ExcelImageResult {
  name: string;
  extension: string;
  buffer: Buffer;
  sheetName: string;
  anchorCell?: string;
}

export interface ExcelExtraction {
  sheets: ExcelSheetResult[];
  images: ExcelImageResult[];
}

const MAX_HEADER_SCAN_ROWS = 15;
const FOLLOW_ROWS_TO_CHECK = 5;

/**
 * L2 specialist: Excel workbooks (XLSX/XLS/ODS via exceljs). Handles the
 * common real-world variations of "how people keep spreadsheets":
 *  - multiple sheets per workbook, each independently classified
 *  - title/blank rows before the real header row (auto-detected, not
 *    assumed to be row 1)
 *  - merged cells (resolved to the merge's master value)
 *  - formula cells (resolved to their last-computed result)
 *  - sheets that aren't tabular at all (notes/free-form layout) — treated
 *    as a text document instead of forcing a broken rows/columns shape
 *  - embedded images, extracted per sheet with their anchor cell
 */
export async function extractExcel(buffer: Buffer): Promise<ExcelExtraction> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheets: ExcelSheetResult[] = [];
  const images: ExcelImageResult[] = [];

  for (const sheet of workbook.worksheets) {
    const grid = buildGrid(sheet);
    if (grid.length === 0) continue;

    const headerRow = detectHeaderRow(grid);
    if (headerRow !== null) {
      sheets.push({ sheetName: sheet.name, kind: "tabular", rows: buildRows(grid, headerRow) });
    } else {
      const text = flattenToText(grid);
      if (text.trim().length > 0) {
        sheets.push({ sheetName: sheet.name, kind: "document", rows: [], text });
      }
    }

    for (const img of sheet.getImages()) {
      const media = workbook.model.media[Number(img.imageId)];
      if (!media || media.type !== "image" || !("buffer" in media)) continue;
      images.push({
        name: media.name,
        extension: media.extension,
        buffer: Buffer.from(media.buffer as unknown as Uint8Array),
        sheetName: sheet.name,
        anchorCell: img.range?.tl ? cellAddress(img.range.tl.nativeCol, img.range.tl.nativeRow) : undefined,
      });
    }
  }

  return { sheets, images };
}

function buildGrid(sheet: ExcelJS.Worksheet): unknown[][] {
  const grid: unknown[][] = [];
  const rowCount = sheet.rowCount;
  const colCount = Math.max(sheet.columnCount, 1);

  for (let r = 1; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const values: unknown[] = [];
    for (let c = 1; c <= colCount; c++) {
      values.push(resolveCellValue(row.getCell(c)));
    }
    grid.push(values);
  }

  // Trim fully-empty trailing rows so trailing blank rows don't get treated
  // as part of the data body or thrown off header/tabular detection.
  while (grid.length > 0 && grid[grid.length - 1].every(isEmptyValue)) grid.pop();
  return grid;
}

function resolveCellValue(cell: ExcelJS.Cell): unknown {
  const raw = cell.isMerged ? cell.master.value : cell.value;
  return normalizeCellValue(raw);
}

function normalizeCellValue(raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if ("result" in obj) return normalizeCellValue(obj.result);
    if ("richText" in obj && Array.isArray(obj.richText)) {
      return (obj.richText as { text: string }[]).map((t) => t.text).join("");
    }
    if ("text" in obj) return normalizeCellValue(obj.text);
    if ("error" in obj) return null;
    return String(raw);
  }
  return raw;
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function isNumericLike(v: unknown): boolean {
  const s = String(v).trim();
  return /^-?\d+(\.\d+)?$/.test(s);
}

function detectHeaderRow(grid: unknown[][]): number | null {
  const scanLimit = Math.min(grid.length, MAX_HEADER_SCAN_ROWS);
  let best: { row: number; score: number } | null = null;

  for (let r = 0; r < scanLimit; r++) {
    const row = grid[r];
    const nonEmptyValues = row.filter((v) => !isEmptyValue(v));
    const nonEmpty = nonEmptyValues.length;
    if (nonEmpty < 2) continue;

    // A merged banner/title row (e.g. "Quarterly Report" spanning A1:D1)
    // fills every cell with the SAME value once merges are resolved — it
    // has the right non-empty count to look like a header but only one
    // distinct value. Real headers have mostly-distinct column names.
    const distinctCount = new Set(nonEmptyValues.map(String)).size;
    if (distinctCount < 2 || distinctCount / nonEmpty < 0.5) continue;

    const textLikeCount = row.filter((v) => !isEmptyValue(v) && String(v).length <= 60 && !isNumericLike(v)).length;
    if (textLikeCount / nonEmpty < 0.5) continue;

    const followRows = grid.slice(r + 1, r + 1 + FOLLOW_ROWS_TO_CHECK);
    const followCounts = followRows
      .map((fr) => fr.filter((v) => !isEmptyValue(v)).length)
      .filter((n) => n > 0);
    if (followCounts.length === 0) continue;

    const avgFollow = followCounts.reduce((a, b) => a + b, 0) / followCounts.length;
    const consistency = 1 - Math.min(1, Math.abs(avgFollow - nonEmpty) / Math.max(nonEmpty, 1));
    const score = nonEmpty * (textLikeCount / nonEmpty) * consistency * followCounts.length;

    if (!best || score > best.score) best = { row: r, score };
  }

  return best && best.score > 0 ? best.row : null;
}

function buildRows(grid: unknown[][], headerRowIdx: number): Record<string, unknown>[] {
  const headerRow = grid[headerRowIdx];
  const seen = new Map<string, number>();
  const headers = headerRow.map((v, i) => {
    let name = isEmptyValue(v) ? `col_${i + 1}` : String(v).trim();
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) name = `${name}_${count + 1}`;
    return name;
  });

  const rows: Record<string, unknown>[] = [];
  for (let r = headerRowIdx + 1; r < grid.length; r++) {
    const dataRow = grid[r];
    if (dataRow.every(isEmptyValue)) continue;
    const record: Record<string, unknown> = {};
    headers.forEach((name, c) => {
      record[name] = dataRow[c] ?? null;
    });
    rows.push(record);
  }
  return rows;
}

function flattenToText(grid: unknown[][]): string {
  return grid
    .map((row) => row.filter((v) => !isEmptyValue(v)).map(String).join(" | "))
    .filter((line) => line.trim().length > 0)
    .join("\n");
}

function colToLetter(col0: number): string {
  let n = col0 + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function cellAddress(col0: number, row0: number): string {
  return `${colToLetter(col0)}${row0 + 1}`;
}
