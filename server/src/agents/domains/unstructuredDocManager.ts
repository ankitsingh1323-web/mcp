import { nanoid } from "nanoid";
import { extractDocx } from "../specialists/officeDocAgent.js";
import { extractPdf } from "../specialists/pdfAgent.js";
import { workspace } from "../../session/sessionStore.js";
import type { DatasetProfile, FileCategory } from "../../types.js";

const EXCERPT_LEN = 500;

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, "");
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * L1 domain manager: PDF/DOCX (and, once implemented, images/email/media/
 * code/web-xml — see registry.ts). Dispatches to the matching L2 specialist,
 * builds a document-kind DatasetProfile, and is the only thing that writes
 * document datasets into the workspace.
 */
export async function handleUnstructuredFile(
  category: FileCategory,
  fileName: string,
  buffer: Buffer,
): Promise<DatasetProfile> {
  let text: string;
  let pageCount: number | undefined;

  switch (category) {
    case "pdf": {
      const result = await extractPdf(buffer);
      text = result.text;
      pageCount = result.pageCount;
      break;
    }
    case "docx": {
      const result = await extractDocx(buffer);
      text = result.text;
      break;
    }
    default:
      throw new Error(`handleUnstructuredFile called with unimplemented category "${category}".`);
  }

  const profile: DatasetProfile = {
    id: nanoid(10),
    name: baseName(fileName),
    sourceKind: "attachment",
    sourceLabel: fileName,
    contentKind: "document",
    rowCount: 0,
    columns: [],
    documentMeta: {
      wordCount: wordCount(text),
      pageCount,
      excerpt: text.slice(0, EXCERPT_LEN),
    },
    createdAt: new Date().toISOString(),
  };

  workspace.addDocumentDataset(profile, text);
  return profile;
}
