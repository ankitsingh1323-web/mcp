import type { AgentCapability, FileCategory } from "../types.js";

/**
 * Single source of truth for "what file types does this system know about,
 * and which ones actually have a working agent behind them." The L0
 * orchestrator's file router consults this before dispatching — categories
 * marked "planned" are recognized and reported clearly to the caller
 * instead of being silently mis-parsed or crashing.
 *
 * Extending file-type coverage later means adding one row here plus one
 * specialist module — nothing else in the router changes.
 */
export const CAPABILITY_REGISTRY: AgentCapability[] = [
  {
    category: "csv",
    label: "CSV / TSV",
    domain: "structured_data",
    status: "implemented",
    extensions: ["csv", "tsv"],
  },
  {
    category: "json",
    label: "JSON / JSONL",
    domain: "structured_data",
    status: "implemented",
    extensions: ["json", "jsonl"],
  },
  {
    category: "xlsx",
    label: "Excel (XLSX/XLS/ODS)",
    domain: "structured_data",
    status: "implemented",
    extensions: ["xlsx", "xls", "ods"],
  },
  {
    category: "pdf",
    label: "PDF",
    domain: "unstructured_doc",
    status: "implemented",
    extensions: ["pdf"],
  },
  {
    category: "docx",
    label: "Office documents (DOCX/PPTX/RTF/ODT)",
    domain: "unstructured_doc",
    status: "implemented",
    extensions: ["docx"],
  },
  {
    category: "archive",
    label: "Archives (ZIP/TAR/TAR.GZ)",
    domain: "archive",
    status: "implemented",
    extensions: ["zip", "tar", "gz", "tgz"],
  },
  {
    category: "image",
    label: "Images (OCR)",
    domain: "unstructured_doc",
    status: "planned",
    extensions: ["jpg", "jpeg", "png", "tiff", "bmp", "webp", "heic"],
  },
  {
    category: "email",
    label: "Email (PST/MBOX/EML/MSG)",
    domain: "unstructured_doc",
    status: "planned",
    extensions: ["pst", "mbox", "eml", "msg"],
  },
  {
    category: "code_log",
    label: "Code & logs",
    domain: "unstructured_doc",
    status: "planned",
    extensions: ["py", "js", "ts", "sql", "yaml", "yml", "toml", "log"],
  },
  {
    category: "media",
    label: "Audio/video (transcription)",
    domain: "unstructured_doc",
    status: "planned",
    extensions: ["mp3", "wav", "mp4", "mov"],
  },
  {
    category: "web_xml",
    label: "Web / XML / GeoJSON",
    domain: "unstructured_doc",
    status: "planned",
    extensions: ["html", "htm", "xml", "geojson", "rss"],
  },
];

const EXTENSION_INDEX: Map<string, AgentCapability> = new Map();
for (const cap of CAPABILITY_REGISTRY) {
  for (const ext of cap.extensions) EXTENSION_INDEX.set(ext, cap);
}

export function capabilityForExtension(ext: string): AgentCapability | undefined {
  return EXTENSION_INDEX.get(ext.toLowerCase());
}

export function capabilityForCategory(category: FileCategory): AgentCapability | undefined {
  return CAPABILITY_REGISTRY.find((c) => c.category === category);
}
