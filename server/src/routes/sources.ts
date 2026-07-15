import { Router } from "express";
import {
  dbProfilesMeta,
  getDbProfile,
  getObsProfile,
  llmStatus,
  obsProfilesMeta,
} from "../auth/authStore.js";
import { connectDatabase } from "../agents/domains/databaseManager.js";
import { fetchObsHealth } from "../ingestion/obsConnector.js";

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
    const result = connectDatabase(profile, requestedTables);
    res.json(result);
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
