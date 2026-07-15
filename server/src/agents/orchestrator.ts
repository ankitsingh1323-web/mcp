import { fileTypeFromBuffer } from "file-type";
import { handleUnstructuredFile } from "./domains/unstructuredDocManager.js";
import { handleStructuredFile } from "./domains/structuredDataManager.js";
import { capabilityForExtension } from "./registry.js";
import { isArchiveExt, unpackArchive } from "./specialists/archiveAgent.js";
import type { DatasetProfile, FileCategory, UnsupportedFile } from "../types.js";

export interface OrchestratorResult {
  datasets: DatasetProfile[];
  unsupported: UnsupportedFile[];
}

// Router-level safety caps, independent of the archive agent's own limits —
// bounds total work done per upload request even if the archive is nested
// (an archive inside an archive inside an archive...).
const MAX_RECURSION_DEPTH = 3;
const MAX_TOTAL_FILES = 300;

interface InputFile {
  name: string;
  buffer: Buffer;
}

function extOf(fileName: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(fileName);
  return m?.[1]?.toLowerCase() ?? "";
}

async function classify(file: InputFile): Promise<FileCategory> {
  const extCap = capabilityForExtension(extOf(file.name));

  // Magic-byte sniff catches a mismatched/spoofed extension (e.g. a zip
  // renamed to .csv) — content wins over the claimed extension whenever the
  // sniff resolves to something the registry recognizes.
  const sniffed = await fileTypeFromBuffer(file.buffer).catch(() => undefined);
  const sniffedCap = sniffed ? capabilityForExtension(sniffed.ext) : undefined;

  return sniffedCap?.category ?? extCap?.category ?? "unrecognized";
}

/**
 * L0 master orchestrator: MIME/magic-byte detection, archive expansion, and
 * dispatch to the right L1 domain manager for every file in a batch. This
 * is the single place new file-type support gets wired in — add a row to
 * registry.ts and a branch here (plus the L1/L2 modules it calls into).
 */
export async function routeAndDispatch(files: InputFile[]): Promise<OrchestratorResult> {
  const datasets: DatasetProfile[] = [];
  const unsupported: UnsupportedFile[] = [];
  const counter = { total: 0 };

  for (const file of files) {
    await processFile(file, 0, datasets, unsupported, counter);
  }

  return { datasets, unsupported };
}

async function processFile(
  file: InputFile,
  depth: number,
  datasets: DatasetProfile[],
  unsupported: UnsupportedFile[],
  counter: { total: number },
): Promise<void> {
  if (counter.total >= MAX_TOTAL_FILES) {
    unsupported.push({
      file: file.name,
      category: "unrecognized",
      status: "error",
      reason: `Batch limit reached (${MAX_TOTAL_FILES} files) — skipped.`,
    });
    return;
  }
  counter.total++;

  const category = await classify(file);
  const capability = category !== "unrecognized" ? capabilityForExtension(extOf(file.name)) : undefined;

  if (category === "unrecognized") {
    unsupported.push({
      file: file.name,
      category: "unrecognized",
      status: "unrecognized",
      reason: `Unrecognized file type for "${file.name}" (extension and content both unmatched).`,
    });
    return;
  }

  if (category === "archive") {
    if (depth >= MAX_RECURSION_DEPTH) {
      unsupported.push({
        file: file.name,
        category: "archive",
        status: "error",
        reason: `Archive nesting exceeds the maximum depth (${MAX_RECURSION_DEPTH}) — skipped.`,
      });
      return;
    }
    try {
      const entries = await unpackArchive(file.name, file.buffer);
      for (const entry of entries) {
        await processFile(entry, depth + 1, datasets, unsupported, counter);
      }
    } catch (err) {
      unsupported.push({
        file: file.name,
        category: "archive",
        status: "error",
        reason: err instanceof Error ? err.message : "failed to unpack archive",
      });
    }
    return;
  }

  const registryEntry = capability ?? capabilityForExtension(extOf(file.name));
  if (registryEntry?.status === "planned") {
    unsupported.push({
      file: file.name,
      category,
      status: "planned",
      reason: `"${registryEntry.label}" is recognized but not yet implemented.`,
    });
    return;
  }

  try {
    if (category === "csv" || category === "json" || category === "xlsx") {
      const created = await handleStructuredFile(file.name, file.buffer);
      datasets.push(...created);
    } else if (category === "pdf" || category === "docx") {
      const profile = await handleUnstructuredFile(category, file.name, file.buffer);
      datasets.push(profile);
    } else {
      unsupported.push({
        file: file.name,
        category,
        status: "planned",
        reason: `"${category}" has no dispatcher wired up yet.`,
      });
    }
  } catch (err) {
    unsupported.push({
      file: file.name,
      category,
      status: "error",
      reason: err instanceof Error ? err.message : "processing failed",
    });
  }
}
