import type {
  ColumnStats,
  DatasetProfile,
  PiiCategory,
  PiiFinding,
  PiiReport,
  PiiSeverity,
} from "../types.js";

interface PatternRule {
  category: PiiCategory;
  valuePattern?: RegExp;
  nameHints: string[];
  baseSeverity: PiiSeverity;
}

const RULES: PatternRule[] = [
  {
    category: "email",
    valuePattern: /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/,
    nameHints: ["email", "e-mail", "mail"],
    baseSeverity: "medium",
  },
  {
    category: "phone",
    valuePattern: /^\+?[\d][\d\s\-().]{6,17}\d$/,
    nameHints: ["phone", "mobile", "cell", "telephone", "contact_number"],
    baseSeverity: "medium",
  },
  {
    category: "ssn",
    valuePattern: /^\d{3}-\d{2}-\d{4}$/,
    nameHints: ["ssn", "social_security"],
    baseSeverity: "critical",
  },
  {
    category: "credit_card",
    valuePattern: /^\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{1,4}$/,
    nameHints: ["credit_card", "card_number", "cc_number", "pan"],
    baseSeverity: "critical",
  },
  {
    category: "ip_address",
    valuePattern: /^(\d{1,3}\.){3}\d{1,3}$/,
    nameHints: ["ip", "ip_address", "client_ip"],
    baseSeverity: "low",
  },
  {
    category: "national_id",
    nameHints: ["passport", "national_id", "aadhaar", "pan_number", "driver_license", "license_number"],
    baseSeverity: "high",
  },
  {
    category: "date_of_birth",
    nameHints: ["dob", "date_of_birth", "birth_date", "birthdate"],
    baseSeverity: "high",
  },
  {
    category: "person_name",
    nameHints: ["first_name", "last_name", "full_name", "surname", "given_name", "customer_name", "employee_name"],
    baseSeverity: "medium",
  },
  {
    category: "physical_address",
    nameHints: ["address", "street", "city", "zip", "zipcode", "postal_code", "postcode"],
    baseSeverity: "high",
  },
  {
    category: "api_key_or_secret",
    valuePattern: /^[A-Za-z0-9_\-]{24,}$/,
    nameHints: ["api_key", "apikey", "secret", "token", "password", "access_key", "private_key"],
    baseSeverity: "critical",
  },
];

function normalizedName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function nameMatches(colName: string, hints: string[]): boolean {
  const n = normalizedName(colName);
  return hints.some((h) => n === h || n.includes(h));
}

function mask(value: string): string {
  if (value.length <= 2) return "*".repeat(value.length);
  if (value.includes("@")) {
    const [user, domain] = value.split("@");
    return `${user[0]}${"*".repeat(Math.max(user.length - 1, 1))}@${domain}`;
  }
  const visible = Math.min(2, value.length - 2);
  return `${value.slice(0, visible)}${"*".repeat(value.length - visible - 2)}${value.slice(-2)}`;
}

function severityWeight(severity: PiiSeverity): number {
  switch (severity) {
    case "critical":
      return 35;
    case "high":
      return 20;
    case "medium":
      return 10;
    case "low":
      return 4;
  }
}

function scanColumn(col: ColumnStats, allRows: unknown[]): PiiFinding | undefined {
  const values = allRows.filter((v) => v !== null && v !== undefined && v !== "").map(String);
  if (values.length === 0) return undefined;

  let best: { rule: PatternRule; matchCount: number; nameHit: boolean } | undefined;

  for (const rule of RULES) {
    const nameHit = nameMatches(col.name, rule.nameHints);
    let matchCount = 0;

    // Value-pattern rules (phone/ssn/credit-card/etc.) are only meaningful
    // against free-text columns — a date or numeric column can accidentally
    // match a digits-and-separators pattern like the phone regex. Name-hint
    // rules still apply regardless of inferred type (e.g. a "dob" column
    // typed as a date should still be flagged).
    const isTextLike = col.inferredType === "text" || col.inferredType === "unknown";

    if (rule.valuePattern && isTextLike) {
      const sampleSize = Math.min(values.length, 200);
      for (let i = 0; i < sampleSize; i++) {
        if (rule.valuePattern.test(values[i])) matchCount++;
      }
      matchCount = Math.round((matchCount / sampleSize) * values.length);
    } else if (nameHit) {
      // Name-only heuristics (e.g. free-text address/name columns) — treat
      // the whole non-null population as the match set.
      matchCount = values.length;
    }

    if (matchCount === 0) continue;
    const matchRatio = matchCount / values.length;
    if (!rule.valuePattern && !nameHit) continue;
    if (rule.valuePattern && matchRatio < 0.5 && !nameHit) continue;

    if (!best || matchCount > best.matchCount) {
      best = { rule, matchCount, nameHit };
    }
  }

  if (!best) return undefined;

  const matchRatio = best.matchCount / values.length;
  const confidence = Math.min(1, (best.nameHit ? 0.5 : 0) + matchRatio * (best.rule.valuePattern ? 0.5 : 0.5));
  const severity = best.rule.baseSeverity;

  const samples = values.slice(0, 3).map(mask);

  return {
    column: col.name,
    category: best.rule.category,
    severity,
    confidence: Number(confidence.toFixed(2)),
    matchRatio: Number(matchRatio.toFixed(2)),
    sampleMasked: samples,
  };
}

export function scanForPii(
  dataset: Pick<DatasetProfile, "id" | "columns">,
  rows: Record<string, unknown>[],
): PiiReport {
  const findings: PiiFinding[] = [];

  for (const col of dataset.columns) {
    const columnValues = rows.map((r) => r[col.name]);
    const finding = scanColumn(col, columnValues);
    if (finding) findings.push(finding);
  }

  const deductions = findings.reduce((sum, f) => sum + severityWeight(f.severity), 0);
  const overallScore = Math.max(0, 100 - deductions);

  const riskLevel: PiiSeverity =
    overallScore < 40 ? "critical" : overallScore < 65 ? "high" : overallScore < 85 ? "medium" : "low";

  findings.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

  return {
    datasetId: dataset.id,
    generatedAt: new Date().toISOString(),
    overallScore,
    riskLevel,
    findings,
    columnsScanned: dataset.columns.length,
    clean: findings.length === 0,
  };
}
