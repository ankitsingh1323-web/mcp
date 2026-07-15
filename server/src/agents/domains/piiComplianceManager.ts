import { scanForPii, scanTextForPii } from "../../analysis/piiScanner.js";
import type { DatasetProfile, PiiReport } from "../../types.js";

/**
 * L1 domain manager: PII & compliance. Subscribes to every dataset
 * regardless of which specialist produced it — tabular datasets go through
 * the column-pattern scanner, document datasets through the free-text
 * scanner — and returns one unified PiiReport shape either way.
 */
export function scanDataset(
  profile: DatasetProfile,
  data: { rows?: Record<string, unknown>[]; text?: string },
): PiiReport {
  if (profile.contentKind === "document") {
    return scanTextForPii(profile.id, data.text ?? "");
  }
  return scanForPii(profile, data.rows ?? []);
}
