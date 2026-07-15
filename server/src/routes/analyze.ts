import { Router } from "express";
import { getDbProfile } from "../auth/authStore.js";
import { generateCreateTable } from "../analysis/ddlGenerator.js";
import { generateInsights } from "../analysis/insights.js";
import { scanForPii } from "../analysis/piiScanner.js";
import { materializeTable, openDb } from "../ingestion/sqliteConnector.js";
import { workspace } from "../session/sessionStore.js";
import type { DbProfile } from "../auth/authStore.js";

export const analyzeRouter = Router();

const DEFAULT_WORKSPACE_DB: DbProfile = {
  name: "local-workspace",
  kind: "sqlite",
  description: "Built-in local workspace (default, no auth-config entry required).",
  file: "server/data/workspace.sqlite",
};

function workspaceDbProfile(): DbProfile {
  return getDbProfile("local-workspace") ?? DEFAULT_WORKSPACE_DB;
}

analyzeRouter.get("/", (_req, res) => {
  res.json({ datasets: workspace.listDatasets() });
});

analyzeRouter.get("/:id", (req, res) => {
  const entry = workspace.getDataset(req.params.id);
  if (!entry) return res.status(404).json({ error: "Dataset not found." });
  res.json({
    profile: entry.profile,
    piiReport: entry.piiReport,
    sample: entry.rows.slice(0, 20),
  });
});

analyzeRouter.post("/:id/analyze", async (req, res) => {
  const entry = workspace.getDataset(req.params.id);
  if (!entry) return res.status(404).json({ error: "Dataset not found." });

  const piiReport = scanForPii(entry.profile, entry.rows);
  workspace.setPiiReport(entry.profile.id, piiReport);

  const insights = await generateInsights(entry.profile, piiReport, entry.rows);
  const ddl = generateCreateTable(entry.profile.name, entry.profile.columns);

  res.json({ insights, piiReport, ddl });
});

analyzeRouter.post("/:id/materialize", (req, res) => {
  const entry = workspace.getDataset(req.params.id);
  if (!entry) return res.status(404).json({ error: "Dataset not found." });

  try {
    const ddl = generateCreateTable(entry.profile.name, entry.profile.columns);
    const profile = workspaceDbProfile();
    const db = openDb(profile);
    const rowsInserted = materializeTable(db, ddl, entry.profile.columns, entry.rows);
    db.close();

    res.json({
      tableName: ddl.tableName,
      rowsInserted,
      dbFile: profile.file,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "materialize failed" });
  }
});
