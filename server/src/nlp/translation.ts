import { callLlm } from "../llm/llmClient.js";
import { containsArabic } from "./arabic.js";

const MAX_TEXT_CHARS = 6000;
const MAX_BATCH_VALUES = 200;

/**
 * Whole-text translation (for document-kind datasets: PDF/DOCX/free-form
 * Excel sheets). Requires a reachable LLM — there is no offline Arabic->
 * English MT worth shipping, so the fallback is honest: leave the original
 * text in place rather than fake a translation.
 */
export async function translateText(text: string): Promise<{ translated: string; wasTranslated: boolean }> {
  if (!containsArabic(text)) return { translated: text, wasTranslated: false };

  const result = await callLlm(
    [
      {
        role: "system",
        content:
          "You are a professional Arabic-to-English translator. Translate the given text to clear, natural " +
          "English. Preserve names, numbers, dates, and structure. Output only the translated text — no " +
          "commentary, no notes.",
      },
      { role: "user", content: text.slice(0, MAX_TEXT_CHARS) },
    ],
    { maxTokens: 1500, temperature: 0.1 },
  );

  if (result) return { translated: result.trim(), wasTranslated: true };
  return { translated: text, wasTranslated: false };
}

/**
 * Batch cell-value translation (for tabular datasets): translates every
 * distinct Arabic-containing value in one LLM call rather than one call per
 * cell. Returns a map of original -> English; values that couldn't be
 * translated (no LLM reachable, malformed response) map to themselves, so
 * callers can always look up every original value safely.
 */
export async function translateBatch(values: string[]): Promise<Map<string, string>> {
  const arabicValues = [...new Set(values.filter(containsArabic))];
  const map = new Map<string, string>();
  if (arabicValues.length === 0) return map;

  const capped = arabicValues.slice(0, MAX_BATCH_VALUES);

  const result = await callLlm(
    [
      {
        role: "system",
        content:
          "You translate Arabic text to English. You will receive a JSON array of strings. Return a JSON " +
          "array of the exact same length, in the same order, with each string translated to natural English " +
          "(transliterate proper names naturally). Output ONLY the JSON array — no explanation, no markdown.",
      },
      { role: "user", content: JSON.stringify(capped) },
    ],
    { maxTokens: 2000, temperature: 0.1 },
  );

  if (result) {
    try {
      const parsed = JSON.parse(extractJsonArray(result));
      if (Array.isArray(parsed) && parsed.length === capped.length) {
        capped.forEach((orig, i) => map.set(orig, String(parsed[i])));
        return map;
      }
    } catch {
      // fall through to the untranslated fallback below
    }
  }

  capped.forEach((orig) => map.set(orig, orig));
  return map;
}

/**
 * Translates every Arabic cell value across a full row set in one batched
 * LLM call, then rebuilds the rows with translations applied. Non-Arabic
 * cells pass through untouched. If no LLM is reachable, returns the
 * original rows unchanged with hasArabicContent still correctly flagged —
 * callers can tell "detected but not translated" apart from "clean".
 */
export async function translateRows(
  rows: Record<string, unknown>[],
): Promise<{ rows: Record<string, unknown>[]; hasArabicContent: boolean }> {
  const allValues: string[] = [];
  for (const row of rows) {
    for (const v of Object.values(row)) {
      if (typeof v === "string" && containsArabic(v)) allValues.push(v);
    }
  }

  if (allValues.length === 0) return { rows, hasArabicContent: false };

  const map = await translateBatch(allValues);
  const translatedRows = rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(row)) {
      next[key] = typeof v === "string" && map.has(v) ? map.get(v) : v;
    }
    return next;
  });

  return { rows: translatedRows, hasArabicContent: true };
}

function extractJsonArray(text: string): string {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return "[]";
  return text.slice(start, end + 1);
}
