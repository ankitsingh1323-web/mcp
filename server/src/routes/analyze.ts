import { Router } from "express";
import { getDbProfile } from "../auth/authStore.js";
import { buildAssociations, buildRepresentativeText, crossDatasetOnly } from "../agents/associations.js";
import { generateInsightsForDataset } from "../agents/domains/businessIntelManager.js";
import { scanDataset } from "../agents/domains/piiComplianceManager.js";
import { suggestJoins } from "../agents/relationships.js";
import { synthesize } from "../agents/synthesiser.js";
import { generateCreateTable } from "../analysis/ddlGenerator.js";
import {
  materializeJoinQuery,
  materializeTable,
  openDb,
  tableRowCount,
} from "../ingestion/sqliteConnector.js";
import { extractEntities } from "../nlp/ner.js";
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

// These literal-path routes must be registered before "/:id" — otherwise
// Express would match them as if the literal segment were a dataset id.
analyzeRouter.get("/synthesize", async (_req, res) => {
  const summary = await synthesize();
  res.json(summary);
});

analyzeRouter.get("/associations", (_req, res) => {
  const perDataset = workspace
    .listAll()
    .filter((e) => e.entities)
    .map((e) => ({ datasetId: e.profile.id, name: e.profile.name, entities: e.entities! }));
  const associations = crossDatasetOnly(buildAssociations(perDataset));
  res.json({ associations, datasetsAnalyzed: perDataset.length });
});

analyzeRouter.get("/relationships", (_req, res) => {
  const datasets = workspace.listAll().map((e) => ({ profile: e.profile, rows: e.rows }));
  const suggestions = suggestJoins(datasets);
  res.json({ suggestions });
});

analyzeRouter.post("/relationships/materialize", (req, res) => {
  const { leftDatasetId, rightDatasetId, sql, tableName } = req.body ?? {};
  if (!leftDatasetId || !rightDatasetId || !sql || !tableName) {
    return res.status(400).json({
      error: "leftDatasetId, rightDatasetId, sql, and tableName are all required.",
    });
  }

  const left = workspace.getDataset(leftDatasetId);
  const right = workspace.getDataset(rightDatasetId);
  if (!left || !right) return res.status(404).json({ error: "One or both datasets not found." });

  try {
    const profile = workspaceDbProfile();
    const db = openDb(profile);

    for (const entry of [left, right]) {
      if (!entry.materialized) {
        const ddl = generateCreateTable(entry.profile.name, entry.profile.columns);
        materializeTable(db, ddl, entry.profile.columns, entry.rows);
        workspace.setMaterialized(entry.profile.id, {
          tableName: ddl.tableName,
          rowsInserted: entry.rows.length,
          dbFile: profile.file,
          preexistingRowCount: 0,
        });
      }
    }

    const rowCount = materializeJoinQuery(db, sql, tableName);
    db.close();
    res.json({ tableName, rowCount, dbFile: profile.file });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "join materialize failed" });
  }
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

  const entityText = buildRepresentativeText(entry.profile, { rows: entry.rows, text: entry.text });
  const entities = await extractEntities(entityText);
  workspace.setEntities(entry.profile.id, entities);

  const ddl =
    entry.profile.contentKind === "tabular"
      ? generateCreateTable(entry.profile.name, entry.profile.columns)
      : undefined;

  res.json({ insights, piiReport, ddl, entities });
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
