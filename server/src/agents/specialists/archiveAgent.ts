import AdmZip from "adm-zip";
import { Readable } from "node:stream";
import { gunzipSync } from "node:zlib";
import * as tar from "tar-stream";

export interface ArchiveEntry {
  name: string;
  buffer: Buffer;
}

// Zip-bomb / resource-exhaustion guards: an archive is untrusted input, so
// expansion is capped independent of the compressed upload size.
const MAX_ENTRIES = 200;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100MB expanded, across all entries
const MAX_ENTRY_BYTES = 25 * 1024 * 1024; // matches the plain upload size cap

export function isArchiveExt(ext: string): boolean {
  return ext === "zip" || ext === "tar" || ext === "gz" || ext === "tgz";
}

export async function unpackArchive(fileName: string, buffer: Buffer): Promise<ArchiveEntry[]> {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".zip")) return unpackZip(buffer);
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return unpackTar(gunzipSync(buffer));
  if (lower.endsWith(".tar")) return unpackTar(buffer);
  if (lower.endsWith(".gz")) {
    // A bare .gz (not .tar.gz) wraps a single file, not an archive of entries.
    const inner = gunzipSync(buffer);
    return [{ name: fileName.replace(/\.gz$/i, ""), buffer: inner }];
  }
  throw new Error(`Unrecognized archive extension for "${fileName}".`);
}

function unpackZip(buffer: Buffer): ArchiveEntry[] {
  const zip = new AdmZip(buffer);
  const entries: ArchiveEntry[] = [];
  let totalBytes = 0;

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (entries.length >= MAX_ENTRIES) break;

    const size = entry.header.size;
    if (size > MAX_ENTRY_BYTES) continue;
    if (totalBytes + size > MAX_TOTAL_BYTES) break;

    const data = entry.getData();
    totalBytes += data.length;
    entries.push({ name: entry.entryName, buffer: data });
  }

  return entries;
}

async function unpackTar(buffer: Buffer): Promise<ArchiveEntry[]> {
  const extract = tar.extract();
  const entries: ArchiveEntry[] = [];
  let totalBytes = 0;

  Readable.from(buffer).pipe(extract);

  for await (const entry of extract) {
    const header = entry.header;
    if (header.type !== "file") {
      entry.resume();
      continue;
    }
    if (entries.length >= MAX_ENTRIES || totalBytes >= MAX_TOTAL_BYTES) {
      entry.resume();
      continue;
    }

    const chunks: Buffer[] = [];
    let entrySize = 0;
    let truncated = false;
    for await (const chunk of entry as AsyncIterable<Buffer>) {
      entrySize += chunk.length;
      if (entrySize > MAX_ENTRY_BYTES || totalBytes + entrySize > MAX_TOTAL_BYTES) {
        truncated = true;
        continue;
      }
      chunks.push(chunk);
    }
    if (!truncated && chunks.length > 0) {
      const data = Buffer.concat(chunks);
      totalBytes += data.length;
      entries.push({ name: header.name, buffer: data });
    }
  }

  return entries;
}
