import { Router } from "express";
import { answerChat, streamChat } from "../chat/chatEngine.js";
import { workspace } from "../session/sessionStore.js";
import type { ChatMessage } from "../types.js";

export const chatRouter = Router();

chatRouter.get("/history", (_req, res) => {
  res.json({ messages: workspace.getChatHistory() });
});

chatRouter.post("/", async (req, res) => {
  const question: string | undefined = req.body?.message;
  if (!question || !question.trim()) {
    return res.status(400).json({ error: "message is required" });
  }

  const userMsg: ChatMessage = { role: "user", content: question, createdAt: new Date().toISOString() };
  workspace.appendChat(userMsg);

  const reply = await answerChat(workspace.getChatHistory(), question);
  const assistantMsg: ChatMessage = {
    role: "assistant",
    content: reply,
    createdAt: new Date().toISOString(),
  };
  workspace.appendChat(assistantMsg);

  res.json({ reply });
});

chatRouter.get("/stream", async (req, res) => {
  const question = String(req.query.message ?? "");
  if (!question.trim()) {
    res.status(400).json({ error: "message query param is required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const userMsg: ChatMessage = { role: "user", content: question, createdAt: new Date().toISOString() };
  workspace.appendChat(userMsg);

  let full = "";
  try {
    for await (const chunk of streamChat(workspace.getChatHistory(), question)) {
      full += chunk;
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "stream failed" })}\n\n`);
  }

  workspace.appendChat({ role: "assistant", content: full, createdAt: new Date().toISOString() });
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});
