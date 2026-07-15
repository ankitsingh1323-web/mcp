import { Router } from "express";
import multer from "multer";
import { routeAndDispatch } from "../agents/orchestrator.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

export const uploadRouter = Router();

uploadRouter.post("/", upload.array("files", 10), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: "No files uploaded. Attach one or more files under 'files'." });
  }

  const result = await routeAndDispatch(
    files.map((f) => ({ name: f.originalname, buffer: f.buffer })),
  );

  res.json({ datasets: result.datasets, errors: result.unsupported });
});
