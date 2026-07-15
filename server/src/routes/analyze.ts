import { Router } from "express";
import { getDbProfile } from "../auth/authStore.js";
import { generateInsightsForDataset } from "../agents/domains/businessIntelManager.js";
import { scanDataset } from "../agents/domains/piiComplianceManager.js";
import { synthesize } from "../agents/synthesiser.js";
import { generateCreateTable } from "../analysis/ddlGenerator.js";
import { materializeTable, openDb, tableRowCount } from "../ingestion/sqliteConnector.js";
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

// Must be registered before "/:id" — otherwise Express would match this
// literal path as if "synthesize" were a dataset id.
analyzeRouter.get("/synthesize", async (_req, res) => {
  const summary = await synthesize();
  res.json(summary);
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

  const piiReport = scanDataset(entry.profile, { rows: entry.rows, text: entry.text });
  workspace.setPiiReport(entry.profile.id, piiReport);

  const insights = await generateInsightsForDataset(entry.profile, piiReport, {
    rows: entry.rows,
    text: entry.text,
  });
  workspace.setInsights(entry.profile.id, insights);

  const ddl =
    entry.profile.contentKind === "tabular"
      ? generateCreateTable(entry.profile.name, entry.profile.columns)
      : undefined;

  res.json({ insights, piiReport, ddl });
});

analyzeRouter.post("/:id/materialize", (req, res) => {
  const entry = workspace.getDataset(req.params.id);
  if (!entry) return res.status(404).json({ error: "Dataset not found." });

  if (entry.profile.contentKind !== "tabular") {
    return res.status(400).json({ error: "Only tabular datasets can be materialized into a table." });
  }

  const force = req.query.force === "true";

  // Materializing is idempotent by default: re-clicking "Create table" for a
  // dataset that was already inserted must not duplicate its rows, since
  // there's no natural key to de-dupe against post-insert. Pass ?force=true
  // to intentionally drop and re-insert this dataset's table from scratch.
  if (entry.materialized && !force) {
    return res.json(entry.materialized);
  }

  try {
    const ddl = generateCreateTable(entry.profile.name, entry.profile.columns);
    const profile = workspaceDbProfile();
    const db = openDb(profile);

    if (force) {
      db.exec(`DROP TABLE IF EXISTS "${ddl.tableName.replace(/"/g, '""')}"`);
    }

    const preexistingRowCount = tableRowCount(db, ddl.tableName);
    const rowsInserted = materializeTable(db, ddl, entry.profile.columns, entry.rows);
    db.close();

    const result = { tableName: ddl.tableName, rowsInserted, dbFile: profile.file, preexistingRowCount };
    workspace.setMaterialized(entry.profile.id, result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "materialize failed" });
  }
});
