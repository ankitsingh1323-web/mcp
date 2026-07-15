import { Router } from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { parseAttachment } from "../ingestion/fileParser.js";
import { profileRows } from "../analysis/profiler.js";
import { workspace } from "../session/sessionStore.js";
import type { DatasetProfile } from "../types.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const uploadRouter = Router();

uploadRouter.post("/", upload.array("files", 10), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded. Attach one or more files under 'files'." });
  }

  const created: DatasetProfile[] = [];
  const errors: { file: string; error: string }[] = [];

  for (const file of files) {
    try {
      const tables = await parseAttachment(file.originalname, file.buffer);
      for (const table of tables) {
        if (table.rows.length === 0) continue;
        const columns = profileRows(table.rows);
        const profile: DatasetProfile = {
          id: nanoid(10),
          name: table.name,
          sourceKind: "attachment",
          sourceLabel: file.originalname,
          rowCount: table.rows.length,
          columns,
          createdAt: new Date().toISOString(),
        };
        workspace.addDataset(profile, table.rows);
        created.push(profile);
      }
    } catch (err) {
      errors.push({ file: file.originalname, error: err instanceof Error ? err.message : "parse failed" });
    }
  }

  res.json({ datasets: created, errors });
});
