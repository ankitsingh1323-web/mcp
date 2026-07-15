import { callLlm } from "../llm/llmClient.js";
import { workspace } from "../session/sessionStore.js";
import type { ExecutiveSummary, PiiSeverity } from "../types.js";

const RISK_RANK: Record<PiiSeverity, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * The Synthesiser Agent: merges every dataset's cached PartialResults
 * (insights + PII report from the last /analyze call) into one
 * cross-dataset executive summary. Operates on cached results rather than
 * re-running domain managers, so it stays fast and doesn't repeat LLM calls
 * already made per-dataset.
 */
export async function synthesize(): Promise<ExecutiveSummary> {
  const all = workspace.listAll();

  let overallRiskLevel: PiiSeverity = "low";
  const highlights: string[] = [];
  const perDataset: ExecutiveSummary["perDataset"] = [];

  for (const entry of all) {
    if (entry.piiReport && RISK_RANK[entry.piiReport.riskLevel] > RISK_RANK[overallRiskLevel]) {
      overallRiskLevel = entry.piiReport.riskLevel;
    }

    const analyzed = Boolean(entry.insights);
    const topInsight = entry.insights?.find((i) => i.category === "business" || i.category === "risk");
    perDataset.push({
      datasetId: entry.profile.id,
      name: entry.profile.name,
      headline: analyzed
        ? (topInsight?.title ?? entry.insights![0]?.title ?? "Analyzed — no notable findings.")
        : "Not yet analyzed — run analyze on this dataset first.",
    });

    for (const insight of entry.insights ?? []) {
      if (insight.category === "risk" || insight.category === "business") {
        highlights.push(`[${entry.profile.name}] ${insight.title}`);
      }
    }
  }

  const cappedHighlights = highlights.slice(0, 10);

  const narrative = await callLlm(
    [
      {
        role: "system",
        content:
          "You are an executive summary writer. Given headlines and highlights extracted across multiple " +
          "analyzed files/tables, write a single short executive-summary paragraph (3-5 sentences) covering " +
          "the overall picture, notable risks, and any cross-file patterns. Plain text, no markdown.",
      },
      {
        role: "user",
        content: JSON.stringify({ perDataset, highlights: cappedHighlights, overallRiskLevel }),
      },
    ],
    { maxTokens: 400 },
  );

  return {
    generatedAt: new Date().toISOString(),
    datasetCount: all.length,
    overallRiskLevel,
    highlights: cappedHighlights,
    perDataset,
    narrative,
  };
}
