import { callLlm } from "../llm/llmClient.js";
import type { EntityType, NamedEntity } from "../types.js";

const MAX_TEXT_CHARS = 8000;
const VALID_TYPES = new Set<EntityType>(["person", "organization", "location", "date", "other"]);

export async function extractEntities(text: string): Promise<NamedEntity[]> {
  if (!text || text.trim().length === 0) return [];

  const llmResult = await callLlm(
    [
      {
        role: "system",
        content:
          "You are a named-entity extraction assistant. Given text, extract distinct named entities: people, " +
          'organizations, locations, and dates. Return ONLY a JSON array of objects shaped like ' +
          '{"text": "...", "type": "person"|"organization"|"location"|"date"|"other", "mentions": <count>}. ' +
          "Merge duplicate mentions of the same entity into one object with an accurate mention count. No " +
          "commentary, no markdown.",
      },
      { role: "user", content: text.slice(0, MAX_TEXT_CHARS) },
    ],
    { maxTokens: 1200, temperature: 0.1 },
  );

  if (llmResult) {
    const parsed = tryParseEntities(llmResult);
    if (parsed) return parsed;
  }

  return heuristicEntities(text);
}

interface RawEntity {
  text?: unknown;
  type?: unknown;
  mentions?: unknown;
}

function tryParseEntities(text: string): NamedEntity[] | undefined {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return undefined;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return undefined;
    return (parsed as RawEntity[])
      .filter((e): e is RawEntity & { text: string; type: EntityType } =>
        Boolean(e && typeof e.text === "string" && VALID_TYPES.has(e.type as EntityType)),
      )
      .map((e) => ({
        text: e.text.trim(),
        type: e.type,
        mentions: typeof e.mentions === "number" && Number.isFinite(e.mentions) ? e.mentions : 1,
      }))
      .filter((e) => e.text.length > 0);
  } catch {
    return undefined;
  }
}

const STOPWORDS_LEADING = new Set([
  "The", "A", "An", "This", "That", "These", "Those", "It", "We", "You", "I", "He", "She", "They",
]);

/**
 * Heuristic fallback when no LLM is reachable: proper-noun-shaped runs of
 * Capitalized Words as a rough stand-in for real NER. Meaningfully lower
 * quality than the LLM path — English-oriented, no real type
 * classification (everything lands in "other").
 */
function heuristicEntities(text: string): NamedEntity[] {
  const counts = new Map<string, number>();
  const re = /\b([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+){0,3})\b/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const candidate = match[1].trim();
    const firstWord = candidate.split(/\s+/)[0];
    if (STOPWORDS_LEADING.has(firstWord)) continue;
    if (candidate.length < 3) continue;
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([entityText, mentions]) => ({ text: entityText, type: "other" as const, mentions }));
}
