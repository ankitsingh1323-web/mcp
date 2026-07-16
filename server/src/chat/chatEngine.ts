import { callLlm, streamLlm } from "../llm/llmClient.js";
import { containsArabic } from "../nlp/arabic.js";
import type { ChatMessage } from "../types.js";
import { workspace } from "../session/sessionStore.js";

function buildContext(): string {
  const datasets = workspace.listAll();
  if (datasets.length === 0) {
    return "No datasets have been analyzed yet in this workspace.";
  }

  return datasets
    .map(({ profile, piiReport, rows }) => {
      const cols = profile.columns
        .map((c) => `${c.name} (${c.inferredType}, ${c.distinctCount} distinct, ${c.nullCount} nulls)`)
        .join("; ");
      const piiSummary = piiReport
        ? `PII health score ${piiReport.overallScore}/100 (${piiReport.riskLevel} risk), ${piiReport.findings.length} flagged column(s).`
        : "PII scan not yet run.";
      const sample = JSON.stringify(rows.slice(0, 5));
      return [
        `Dataset "${profile.name}" [${profile.sourceKind}: ${profile.sourceLabel}]`,
        `Rows: ${profile.rowCount}. Columns: ${cols}`,
        piiSummary,
        `Sample rows: ${sample}`,
      ].join("\n");
    })
    .join("\n\n");
}

const SYSTEM_PROMPT =
  "You are a data analysis assistant embedded in a chat UI. You answer questions about the " +
  "datasets currently loaded in the workspace (file attachments and database tables the user has " +
  "analyzed). Use the provided dataset context to answer precisely. If the question can't be " +
  "answered from the given context, say so plainly instead of guessing. Keep answers concise and " +
  "concrete — reference actual column names and numbers when relevant. Never fabricate PII findings " +
  "or numbers not present in the context.\n\n" +
  "Language: detect the language of the user's message and reply in that same language — if they " +
  "write in Arabic, reply in Arabic; if they write in English, reply in English. Column/entity names " +
  "that originated in Arabic and were translated for analysis may be referenced in either language, " +
  "whichever reads more naturally in your reply.";

export async function answerChat(history: ChatMessage[], question: string): Promise<string> {
  const context = buildContext();

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "system" as const, content: `Workspace context:\n${context}` },
    ...history.slice(-8).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];

  const llmAnswer = await callLlm(messages, { maxTokens: 600 });
  if (llmAnswer) return llmAnswer;

  return ruleBasedAnswer(question);
}

export async function* streamChat(
  history: ChatMessage[],
  question: string,
): AsyncGenerator<string> {
  const context = buildContext();
  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    { role: "system" as const, content: `Workspace context:\n${context}` },
    ...history.slice(-8).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: question },
  ];

  let sawAny = false;
  for await (const chunk of streamLlm(messages, { maxTokens: 600 })) {
    sawAny = true;
    yield chunk;
  }

  if (!sawAny) {
    yield ruleBasedAnswer(question);
  }
}

const ARABIC_FALLBACK_NOTICE =
  "(الرد الكامل باللغة العربية يتطلب اتصال النموذج اللغوي المُهيأ، وهو غير متاح حاليًا — " +
  "الإجابة أدناه بالإنجليزية بالاعتماد على قواعد ثابتة.)\n\n";

function ruleBasedAnswer(question: string): string {
  const datasets = workspace.listAll();
  const arabicInput = containsArabic(question);
  const notice = arabicInput ? ARABIC_FALLBACK_NOTICE : "";

  if (datasets.length === 0) {
    return `${notice}I don't have any datasets loaded yet — upload a file or connect a table first, then ask me about it.`;
  }

  const q = question.toLowerCase();
  let answer: string;

  if (/pii|privacy|sensitive/.test(q)) {
    const flagged = datasets.filter((d) => d.piiReport && !d.piiReport.clean);
    if (flagged.length === 0) {
      answer = "No PII risks have been flagged in the datasets I've scanned so far.";
    } else {
      answer = flagged
        .map(
          (d) =>
            `"${d.profile.name}" scored ${d.piiReport!.overallScore}/100 (${d.piiReport!.riskLevel} risk): ` +
            d.piiReport!.findings.map((f) => `${f.column} looks like ${f.category}`).join(", "),
        )
        .join("\n");
    }
  } else if (/row|how many|count/.test(q)) {
    answer = datasets.map((d) => `"${d.profile.name}" has ${d.profile.rowCount} rows.`).join("\n");
  } else if (/column|schema|field/.test(q)) {
    answer = datasets
      .map((d) => `"${d.profile.name}" columns: ${d.profile.columns.map((c) => c.name).join(", ")}`)
      .join("\n");
  } else {
    const names = datasets.map((d) => `"${d.profile.name}"`).join(", ");
    answer =
      `I can see ${datasets.length} dataset(s) loaded: ${names}. The local LLM isn't reachable right ` +
      "now, so I can only answer basic questions about row counts, columns, and PII findings — try " +
      'asking things like "how many rows" or "any PII risks?".';
  }

  return notice + answer;
}
