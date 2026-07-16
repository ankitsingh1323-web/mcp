import { sanitizeTableName } from "../analysis/ddlGenerator.js";
import type { DatasetProfile, JoinSuggestion } from "../types.js";

interface DatasetWithRows {
  profile: DatasetProfile;
  rows: Record<string, unknown>[];
}

const MIN_OVERLAP_RATIO = 0.3;
const MIN_OVERLAP_COUNT = 2;
const SAMPLE_CAP = 500;
const MAX_SUGGESTIONS = 10;

function normalizeColName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isKeyLikeColumn(name: string): boolean {
  const n = normalizeColName(name);
  return /(^id|id$|email|phone|code$|name$|key$)/.test(n);
}

function sampleValueSet(rows: Record<string, unknown>[], col: string): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    const v = row[col];
    if (v !== null && v !== undefined && v !== "") set.add(String(v).trim().toLowerCase());
    if (set.size >= SAMPLE_CAP) break;
  }
  return set;
}

/**
 * Cross-file "business table" suggestions: for every pair of tabular
 * datasets, look for column pairs that are either name-matched or
 * key-shaped (id/email/code/name) with meaningful sample-value overlap,
 * and propose a JOIN as the combined table a business user would actually
 * want (e.g. an Orders sheet + a Customers sheet sharing customer_id).
 */
export function suggestJoins(datasets: DatasetWithRows[]): JoinSuggestion[] {
  const tabular = datasets.filter((d) => d.profile.contentKind === "tabular" && d.rows.length > 0);
  const suggestions: JoinSuggestion[] = [];

  for (let i = 0; i < tabular.length; i++) {
    for (let j = i + 1; j < tabular.length; j++) {
      const left = tabular[i];
      const right = tabular[j];

      // Two different datasets can share a display name (two uploads both
      // called "customers.xlsx", or the same file re-uploaded) — they'd
      // resolve to the identical sanitized table name, making a "join
      // between them" a meaningless self-join with ambiguous/broken SQL.
      // Skip pairs that would collide before generating anything.
      if (sanitizeTableName(left.profile.name) === sanitizeTableName(right.profile.name)) continue;

      let best: { leftCol: string; rightCol: string; overlap: number; overlapCount: number } | undefined;

      for (const lc of left.profile.columns) {
        for (const rc of right.profile.columns) {
          const nameMatch = normalizeColName(lc.name) === normalizeColName(rc.name);
          if (!nameMatch && !(isKeyLikeColumn(lc.name) && isKeyLikeColumn(rc.name))) continue;

          const leftValues = sampleValueSet(left.rows, lc.name);
          const rightValues = sampleValueSet(right.rows, rc.name);
          if (leftValues.size === 0 || rightValues.size === 0) continue;

          let overlapCount = 0;
          for (const v of leftValues) if (rightValues.has(v)) overlapCount++;
          const overlapRatio = overlapCount / Math.min(leftValues.size, rightValues.size);

          if (overlapRatio >= MIN_OVERLAP_RATIO && overlapCount >= MIN_OVERLAP_COUNT) {
            if (!best || overlapRatio > best.overlap) {
              best = { leftCol: lc.name, rightCol: rc.name, overlap: overlapRatio, overlapCount };
            }
          }
        }
      }

      if (best) {
        const leftTable = sanitizeTableName(left.profile.name);
        const rightTable = sanitizeTableName(right.profile.name);
        suggestions.push({
          leftDatasetId: left.profile.id,
          leftDatasetName: left.profile.name,
          leftColumn: best.leftCol,
          rightDatasetId: right.profile.id,
          rightDatasetName: right.profile.name,
          rightColumn: best.rightCol,
          overlapRatio: Number(best.overlap.toFixed(2)),
          overlapCount: best.overlapCount,
          sql: `SELECT * FROM "${leftTable}" JOIN "${rightTable}" ON "${leftTable}"."${best.leftCol}" = "${rightTable}"."${best.rightCol}"`,
          rationale:
            `"${best.leftCol}" (${left.profile.name}) and "${best.rightCol}" (${right.profile.name}) share ` +
            `${best.overlapCount} matching value(s) — ${Math.round(best.overlap * 100)}% overlap — likely the ` +
            "same real-world entity across these two datasets.",
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.overlapRatio - a.overlapRatio).slice(0, MAX_SUGGESTIONS);
}
