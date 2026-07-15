import { Router } from "express";
import { nanoid } from "nanoid";
import {
  dbProfilesMeta,
  getDbProfile,
  getObsProfile,
  llmStatus,
  obsProfilesMeta,
} from "../auth/authStore.js";
import { fetchObsHealth } from "../ingestion/obsConnector.js";
import { listTables, openDb, sampleRows } from "../ingestion/sqliteConnector.js";
import { profileRows } from "../analysis/profiler.js";
import { workspace } from "../session/sessionStore.js";
import type { DatasetProfile } from "../types.js";

export const sourcesRouter = Router();

sourcesRouter.get("/", (_req, res) => {
  res.json({ db: dbProfilesMeta(), obs: obsProfilesMeta(), llm: llmStatus() });
});

sourcesRouter.post("/db/:name/connect", (req, res) => {
  const profile = getDbProfile(req.params.name);
  if (!profile) {
    return res.status(404).json({ error: `No db profile named "${req.params.name}" in auth-config.` });
  }

  const requestedTables: string[] | undefined = req.body?.tables;

  try {
    const db = openDb(profile);
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
        rowCount: table.rowCount,
        columns,
        createdAt: new Date().toISOString(),
      };
      workspace.addDataset(datasetProfile, sample);
      created.push(datasetProfile);
    }

    db.close();
    res.json({ datasets: created, availableTables: allTables.map((t) => t.name) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "connection failed" });
  }
});

sourcesRouter.post("/obs/:name/health", async (req, res) => {
  const profile = getObsProfile(req.params.name);
  if (!profile) {
    return res.status(404).json({ error: `No obs profile named "${req.params.name}" in auth-config.` });
  }
  const report = await fetchObsHealth(profile);
  res.json(report);
});
