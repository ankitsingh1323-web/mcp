import { generateDocumentInsights, generateInsights } from "../../analysis/insights.js";
import type { DatasetProfile, Insight, PiiReport } from "../../types.js";

/**
 * L1 domain manager: business intelligence. Subscribes to every dataset's
 * extracted content plus its PII report, and dispatches to the tabular or
 * document insight generator depending on contentKind.
 */
export async function generateInsightsForDataset(
  profile: DatasetProfile,
  piiReport: PiiReport,
  data: { rows?: Record<string, unknown>[]; text?: string },
): Promise<Insight[]> {
  if (profile.contentKind === "document") {
    return generateDocumentInsights(profile, data.text ?? "", piiReport);
  }
  return generateInsights(profile, piiReport, data.rows ?? []);
}
