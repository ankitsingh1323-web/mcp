import type { DatasetProfile, EntityAssociation, NamedEntity } from "../types.js";

const NUMERIC_RE = /^-?\d+(\.\d+)?$/;
const MAX_SAMPLE_ROWS = 200;
const MAX_TEXT_CHARS = 8000;

/** Assembles the text NER runs against: full text for documents, a capped sample of distinct text-ish cell values for tabular data. */
export function buildRepresentativeText(
  profile: DatasetProfile,
  data: { rows?: Record<string, unknown>[]; text?: string },
): string {
  if (profile.contentKind === "document") return data.text ?? "";

  const parts: string[] = [];
  for (const row of (data.rows ?? []).slice(0, MAX_SAMPLE_ROWS)) {
    for (const v of Object.values(row)) {
      if (typeof v === "string" && v.trim().length > 1 && !NUMERIC_RE.test(v.trim())) {
        parts.push(v.trim());
      }
    }
  }
  return parts.join(". ").slice(0, MAX_TEXT_CHARS);
}

/**
 * Groups per-dataset NER output into cross-dataset associations: the same
 * entity (normalized by type + lowercased text) appearing in multiple
 * datasets gets linked together, surfacing things like "Acme Corp appears
 * in both the Orders sheet and the Vendors sheet."
 */
export function buildAssociations(
  perDataset: { datasetId: string; name: string; entities: NamedEntity[] }[],
): EntityAssociation[] {
  const index = new Map<string, EntityAssociation>();

  for (const { datasetId, name, entities } of perDataset) {
    for (const entity of entities) {
      const key = `${entity.type}:${entity.text.toLowerCase().trim()}`;
      let assoc = index.get(key);
      if (!assoc) {
        assoc = { entity: entity.text, type: entity.type, totalMentions: 0, datasets: [] };
        index.set(key, assoc);
      }
      assoc.totalMentions += entity.mentions;
      const existing = assoc.datasets.find((d) => d.datasetId === datasetId);
      if (existing) existing.mentions += entity.mentions;
      else assoc.datasets.push({ datasetId, name, mentions: entity.mentions });
    }
  }

  return [...index.values()].sort(
    (a, b) => b.datasets.length - a.datasets.length || b.totalMentions - a.totalMentions,
  );
}

export function crossDatasetOnly(associations: EntityAssociation[]): EntityAssociation[] {
  return associations.filter((a) => a.datasets.length >= 2);
}
