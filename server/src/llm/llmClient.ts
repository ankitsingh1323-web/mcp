import { loadLlmConfig } from "../auth/authStore.js";

export interface LlmChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Talks to a local, OpenAI-compatible chat-completions endpoint (e.g. a
 * self-hosted Kimi K2 server behind vLLM/SGLang) so this works fully
 * air-gapped. Credentials/endpoint come only from auth-config via
 * authStore — never hardcoded, never read from request bodies.
 *
 * Returns undefined (rather than throwing) whenever the LLM isn't
 * configured or isn't reachable, so callers can fall back to the
 * deterministic rule-based path instead of failing the request.
 */
export async function callLlm(
  messages: LlmChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<string | undefined> {
  const cfg = loadLlmConfig();
  if (!cfg) return undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs || 30000);

  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 800,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      console.error(`[llmClient] ${cfg.baseUrl} responded ${res.status}`);
      return undefined;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content?.trim();
  } catch (err) {
    console.error("[llmClient] request failed, falling back to rule-based path:", err);
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

export async function* streamLlm(
  messages: LlmChatMessage[],
  opts: { temperature?: number; maxTokens?: number } = {},
): AsyncGenerator<string> {
  const cfg = loadLlmConfig();
  if (!cfg) return;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.timeoutMs || 30000);

  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: opts.temperature ?? 0.3,
        max_tokens: opts.maxTokens ?? 800,
        stream: true,
      }),
      signal: controller.signal,
    });

    if (!res.ok || !res.body) {
      console.error(`[llmClient] stream ${cfg.baseUrl} responded ${res.status}`);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const chunk = json.choices?.[0]?.delta?.content;
          if (chunk) yield chunk;
        } catch {
          // ignore malformed SSE fragments
        }
      }
    }
  } catch (err) {
    console.error("[llmClient] stream failed, falling back to rule-based path:", err);
    return;
  } finally {
    clearTimeout(timeout);
  }
}
