import { nanoid } from "nanoid";
import { profileRows } from "../../analysis/profiler.js";
import { parseAttachment } from "../../ingestion/fileParser.js";
import { workspace } from "../../session/sessionStore.js";
import type { DatasetProfile } from "../../types.js";

/**
 * L1 domain manager: CSV/JSON/Excel. Wraps the existing parse+profile
 * pipeline (unchanged from before this refactor) and is the only thing
 * that writes tabular datasets into the workspace.
 */
export async function handleStructuredFile(
  fileName: string,
  buffer: Buffer,
): Promise<DatasetProfile[]> {
  const tables = await parseAttachment(fileName, buffer);
  const created: DatasetProfile[] = [];

  for (const table of tables) {
    if (table.rows.length === 0) continue;
    const columns = profileRows(table.rows);
    const profile: DatasetProfile = {
      id: nanoid(10),
      name: table.name,
      sourceKind: "attachment",
      sourceLabel: fileName,
      contentKind: "tabular",
      rowCount: table.rows.length,
      columns,
      createdAt: new Date().toISOString(),
    };
    workspace.addDataset(profile, table.rows);
    created.push(profile);
  }

  return created;
}
