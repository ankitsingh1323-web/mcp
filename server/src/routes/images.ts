import { Router } from "express";
import { workspace } from "../session/sessionStore.js";

export const imagesRouter = Router();

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
  emf: "application/octet-stream",
  wmf: "application/octet-stream",
};

imagesRouter.get("/:id", (req, res) => {
  const image = workspace.getImage(req.params.id);
  if (!image) return res.status(404).json({ error: "Image not found." });

  res.setHeader("Content-Type", MIME_BY_EXT[image.extension.toLowerCase()] ?? "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(image.buffer);
});
