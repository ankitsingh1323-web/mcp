import cors from "cors";
import express from "express";
import { authStoreLocation, llmStatus } from "./auth/authStore.js";
import { analyzeRouter } from "./routes/analyze.js";
import { chatRouter } from "./routes/chat.js";
import { imagesRouter } from "./routes/images.js";
import { sourcesRouter } from "./routes/sources.js";
import { uploadRouter } from "./routes/upload.js";

const app = express();
const PORT = Number(process.env.PORT ?? 4000);

app.disable("x-powered-by");
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "2mb" }));
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, authStore: authStoreLocation(), llm: llmStatus() });
});

app.use("/api/upload", uploadRouter);
app.use("/api/sources", sourcesRouter);
app.use("/api/datasets", analyzeRouter);
app.use("/api/chat", chatRouter);
app.use("/api/images", imagesRouter);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : "internal error" });
});

app.listen(PORT, () => {
  console.log(`data-agent-server listening on http://localhost:${PORT}`);
  console.log(`auth-config dir: ${authStoreLocation()}`);
});
