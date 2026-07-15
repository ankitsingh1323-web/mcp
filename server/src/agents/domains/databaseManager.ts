import { nanoid } from "nanoid";
import type { DbProfile } from "../../auth/authStore.js";
import { profileRows } from "../../analysis/profiler.js";
import { listTables, openDb, sampleRows } from "../../ingestion/sqliteConnector.js";
import { workspace } from "../../session/sessionStore.js";
import type { DatasetProfile } from "../../types.js";

export interface ConnectResult {
  datasets: DatasetProfile[];
  availableTables: string[];
}

/**
 * L1 domain manager: databases. Today wraps the SQLite connector (see
 * sqliteConnector.ts for the L2/L3-level introspection + query logic);
 * Postgres/MySQL/Mongo would each get a connector module here alongside it,
 * with this manager staying the single place that turns "a table in some
 * database" into a DatasetProfile the rest of the app understands.
 */
export function connectDatabase(profile: DbProfile, requestedTables?: string[]): ConnectResult {
  const db = openDb(profile);
  try {
    const allTables = listTables(db);
    const targets = requestedTables
      ? allTables.filter((t) => requestedTables.includes(t.name))
      : allTables;

    const created: DatasetProfile[] = [];
    for (const table of targets) {
      const sample = sampleRows(db, table.name, 2000);
      if (sample.length === 0) continue;
      const columns = profileRows(sample);
      const datasetProfile: DatasetProfile = {
        id: nanoid(10),
        name: table.name,
        sourceKind: "database",
        sourceLabel: `${profile.kind}:${profile.name}`,
        contentKind: "tabular",
        rowCount: table.rowCount,
        columns,
        createdAt: new Date().toISOString(),
      };
      workspace.addDataset(datasetProfile, sample);
      created.push(datasetProfile);
    }

    return { datasets: created, availableTables: allTables.map((t) => t.name) };
  } finally {
    db.close();
  }
}
