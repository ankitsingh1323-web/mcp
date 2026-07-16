import { nanoid } from "nanoid";
import { profileRows } from "../../analysis/profiler.js";
import { workspace } from "../../session/sessionStore.js";
import { containsArabic } from "../../nlp/arabic.js";
import { translateRows, translateText } from "../../nlp/translation.js";
import { extractExcel } from "../specialists/excelAgent.js";
import type { DatasetProfile } from "../../types.js";

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * L1 domain manager: Excel workbooks. One file can yield many datasets (one
 * per sheet, each independently tabular or document-kind — see
 * excelAgent.ts), so this manager owns the whole file-to-datasets fan-out
 * that structuredDataManager doesn't need to handle for single-table
 * formats like CSV/JSON. Also the only place that runs Arabic translation
 * and registers a workbook's extracted images against the sheets they came
 * from.
 */
export async function handleExcelFile(fileName: string, buffer: Buffer): Promise<DatasetProfile[]> {
  const extraction = await extractExcel(buffer);
  const created: DatasetProfile[] = [];
  const file = baseName(fileName);

  const imageIdsBySheet = new Map<string, string[]>();
  for (const image of extraction.images) {
    const id = workspace.addImage({
      fileName,
      sheetName: image.sheetName,
      anchorCell: image.anchorCell,
      extension: image.extension,
      buffer: image.buffer,
    });
    const list = imageIdsBySheet.get(image.sheetName) ?? [];
    list.push(id);
    imageIdsBySheet.set(image.sheetName, list);
  }

  const multiSheet = extraction.sheets.length > 1;

  for (const sheet of extraction.sheets) {
    const displayName = multiSheet ? `${file} — ${sheet.sheetName}` : file;
    const imageIds = imageIdsBySheet.get(sheet.sheetName);

    if (sheet.kind === "tabular") {
      if (sheet.rows.length === 0) continue;
      const { rows: translatedRows, hasArabicContent } = await translateRows(sheet.rows);
      const columns = profileRows(translatedRows);
      const profile: DatasetProfile = {
        id: nanoid(10),
        name: displayName,
        sourceKind: "attachment",
        sourceLabel: fileName,
        contentKind: "tabular",
        rowCount: translatedRows.length,
        columns,
        sheetName: sheet.sheetName,
        hasArabicContent,
        imageIds,
        createdAt: new Date().toISOString(),
      };
      workspace.addDataset(profile, translatedRows);
      created.push(profile);
    } else {
      if (!sheet.text || sheet.text.trim().length === 0) continue;
      const hasArabicContent = containsArabic(sheet.text);
      const { translated } = await translateText(sheet.text);
      const profile: DatasetProfile = {
        id: nanoid(10),
        name: displayName,
        sourceKind: "attachment",
        sourceLabel: fileName,
        contentKind: "document",
        rowCount: 0,
        columns: [],
        sheetName: sheet.sheetName,
        hasArabicContent,
        imageIds,
        documentMeta: {
          wordCount: wordCount(translated),
          excerpt: translated.slice(0, 500),
        },
        createdAt: new Date().toISOString(),
      };
      workspace.addDocumentDataset(profile, translated);
      created.push(profile);
    }
  }

  return created;
}
