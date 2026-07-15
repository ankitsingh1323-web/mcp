import { callLlm } from "../llm/llmClient.js";
import type { DatasetProfile, Insight, PiiReport } from "../types.js";

function heuristicInsights(profile: DatasetProfile, pii?: PiiReport): Insight[] {
  const insights: Insight[] = [];
  const { columns, rowCount, name } = profile;

  insights.push({
    id: `${profile.id}-summary`,
    category: "summary",
    title: `${name}: ${rowCount.toLocaleString()} rows across ${columns.length} columns`,
    body: `Sourced from ${profile.sourceLabel}. Column types: ${summarizeTypeMix(profile)}.`,
  });

  const highNull = columns.filter((c) => c.nullable && c.nullCount / Math.max(rowCount, 1) > 0.2);
  if (highNull.length > 0) {
    insights.push({
      id: `${profile.id}-nulls`,
      category: "quality",
      title: `${highNull.length} column(s) have significant missing data`,
      body: `${highNull
        .map((c) => `"${c.name}" (${Math.round((c.nullCount / Math.max(rowCount, 1)) * 100)}% empty)`)
        .join(", ")} may need backfilling or exclusion from downstream models.`,
      severity: "medium",
    });
  }

  const idLike = columns.filter((c) => c.distinctCount === rowCount && rowCount > 1);
  if (idLike.length > 0) {
    insights.push({
      id: `${profile.id}-keys`,
      category: "business",
      title: `Likely identifier column(s): ${idLike.map((c) => c.name).join(", ")}`,
      body: `These columns are fully unique across all rows — good candidates for a primary key or join key.`,
    });
  }

  const lowCardinality = columns.filter(
    (c) => c.inferredType === "text" && c.distinctCount > 1 && c.distinctCount <= 12 && rowCount > 20,
  );
  if (lowCardinality.length > 0) {
    const top = lowCardinality[0];
    const leader = top.topValues?.[0];
    insights.push({
      id: `${profile.id}-segments`,
      category: "business",
      title: `"${top.name}" looks like a segmentation dimension`,
      body: leader
        ? `${top.distinctCount} distinct values; most common is "${leader.value}" (${leader.count} rows, ${Math.round((leader.count / rowCount) * 100)}%). Consider grouping metrics by this field.`
        : `${top.distinctCount} distinct values — a good candidate for grouping/filtering in dashboards.`,
    });
  }

  const numericCols = columns.filter((c) => c.inferredType === "integer" || c.inferredType === "float");
  for (const c of numericCols.slice(0, 3)) {
    if (c.mean !== undefined && c.min !== undefined && c.max !== undefined) {
      insights.push({
        id: `${profile.id}-metric-${c.name}`,
        category: "business",
        title: `"${c.name}" ranges ${formatNum(c.min)}–${formatNum(c.max)}, averaging ${formatNum(c.mean)}`,
        body: `Across ${rowCount.toLocaleString()} rows. Worth tracking as a KPI or trend metric.`,
      });
    }
  }

  if (pii && !pii.clean) {
    insights.push({
      id: `${profile.id}-pii`,
      category: "risk",
      title: `PII health check flagged ${pii.findings.length} column(s) — risk level: ${pii.riskLevel}`,
      body: `Overall data-health score ${pii.overallScore}/100. Review the PII report before sharing this dataset broadly or joining it with other tables.`,
      severity: pii.riskLevel,
    });
  }

  return insights;
}

function summarizeTypeMix(profile: DatasetProfile): string {
  const counts = new Map<string, number>();
  for (const c of profile.columns) {
    counts.set(c.inferredType, (counts.get(c.inferredType) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, n]) => `${n} ${type}`).join(", ");
}

function formatNum(n: number | string): string {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return String(n);
  return Number.isInteger(num) ? num.toLocaleString() : num.toFixed(2);
}

export async function generateInsights(
  profile: DatasetProfile,
  pii: PiiReport | undefined,
  sampleRows: Record<string, unknown>[],
): Promise<Insight[]> {
  const base = heuristicInsights(profile, pii);

  const llmSummary = await callLlm(
    [
      {
        role: "system",
        content:
          "You are a data analyst assistant. Given a dataset schema, column stats, and a small sample of rows, " +
          "write 2-4 concise, concrete business insights (not generic advice). Each insight should be one sentence, " +
          "plain text, no markdown, no numbering. Focus on what a business stakeholder would care about: trends, " +
          "risks, opportunities, anomalies. Do not repeat basic row/column counts.",
      },
      {
        role: "user",
        content: JSON.stringify({
          dataset: profile.name,
          rowCount: profile.rowCount,
          columns: profile.columns.map((c) => ({
            name: c.name,
            type: c.inferredType,
            distinct: c.distinctCount,
            nulls: c.nullCount,
            min: c.min,
            max: c.max,
            mean: c.mean,
            topValues: c.topValues,
          })),
          sample: sampleRows.slice(0, 8),
        }),
      },
    ],
    { maxTokens: 500 },
  );

  if (llmSummary) {
    const lines = llmSummary
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter((l) => l.length > 0);

    lines.forEach((line, i) => {
      base.push({
        id: `${profile.id}-llm-${i}`,
        category: "business",
        title: line.length > 90 ? `${line.slice(0, 87)}...` : line,
        body: line,
      });
    });
  }

  return base;
}

const STOPWORDS = new Set(
  "the a an and or but if of to in on for with as by at is are was were be been being this that these those it its from not no yes we you i he she they them their our your his her".split(
    " ",
  ),
);

function topKeywords(text: string, limit = 8): { word: string; count: number }[] {
  const counts = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}

export async function generateDocumentInsights(
  profile: DatasetProfile,
  text: string,
  pii: PiiReport | undefined,
): Promise<Insight[]> {
  const insights: Insight[] = [];
  const wordCount = profile.documentMeta?.wordCount ?? text.split(/\s+/).filter(Boolean).length;
  const pageLabel = profile.documentMeta?.pageCount ? `, ${profile.documentMeta.pageCount} page(s)` : "";

  insights.push({
    id: `${profile.id}-summary`,
    category: "summary",
    title: `${profile.name}: ${wordCount.toLocaleString()} words${pageLabel}`,
    body: `Sourced from ${profile.sourceLabel}.`,
  });

  const keywords = topKeywords(text);
  if (keywords.length > 0) {
    insights.push({
      id: `${profile.id}-keywords`,
      category: "business",
      title: `Most frequent terms: ${keywords.map((k) => k.word).join(", ")}`,
      body: `Top term "${keywords[0].word}" appears ${keywords[0].count} times across the document.`,
    });
  }

  if (pii && !pii.clean) {
    insights.push({
      id: `${profile.id}-pii`,
      category: "risk",
      title: `PII health check flagged ${pii.findings.length} pattern(s) — risk level: ${pii.riskLevel}`,
      body: `Overall data-health score ${pii.overallScore}/100. Review before sharing this document broadly.`,
      severity: pii.riskLevel,
    });
  }

  const llmSummary = await callLlm(
    [
      {
        role: "system",
        content:
          "You are a document analyst assistant. Given the text of a document, write 2-4 concise, concrete " +
          "insights a business stakeholder would care about (key topics, risks, obligations, action items, " +
          "anomalies). One sentence each, plain text, no markdown, no numbering.",
      },
      {
        role: "user",
        content: JSON.stringify({ document: profile.name, text: text.slice(0, 12000) }),
      },
    ],
    { maxTokens: 500 },
  );

  if (llmSummary) {
    const lines = llmSummary
      .split("\n")
      .map((l) => l.replace(/^[-*\d.\s]+/, "").trim())
      .filter((l) => l.length > 0);

    lines.forEach((line, i) => {
      insights.push({
        id: `${profile.id}-llm-${i}`,
        category: "business",
        title: line.length > 90 ? `${line.slice(0, 87)}...` : line,
        body: line,
      });
    });
  }

  return insights;
}
