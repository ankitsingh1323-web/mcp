export type SourceKind = "attachment" | "database" | "observability";

export type ColumnType = "integer" | "float" | "boolean" | "date" | "datetime" | "text" | "unknown";

export interface ColumnStats {
  name: string;
  inferredType: ColumnType;
  nullable: boolean;
  nullCount: number;
  distinctCount: number;
  sampleValues: unknown[];
  min?: number | string;
  max?: number | string;
  mean?: number;
  topValues?: { value: string; count: number }[];
}

export interface DatasetProfile {
  id: string;
  name: string;
  sourceKind: SourceKind;
  sourceLabel: string;
  rowCount: number;
  columns: ColumnStats[];
  createdAt: string;
}

export type PiiCategory =
  | "email"
  | "phone"
  | "ssn"
  | "credit_card"
  | "ip_address"
  | "person_name"
  | "physical_address"
  | "date_of_birth"
  | "national_id"
  | "api_key_or_secret";

export type PiiSeverity = "low" | "medium" | "high" | "critical";

export interface PiiFinding {
  column: string;
  category: PiiCategory;
  severity: PiiSeverity;
  confidence: number;
  matchRatio: number;
  sampleMasked: string[];
}

export interface PiiReport {
  datasetId: string;
  generatedAt: string;
  overallScore: number;
  riskLevel: PiiSeverity;
  findings: PiiFinding[];
  columnsScanned: number;
  clean: boolean;
}

export interface Insight {
  id: string;
  title: string;
  body: string;
  category: "summary" | "quality" | "business" | "risk";
  severity?: PiiSeverity;
}

export interface DdlResult {
  tableName: string;
  sql: string;
  dialect: "sqlite";
}

export interface MaterializeResult {
  tableName: string;
  rowsInserted: number;
  dbFile: string;
}

export interface DbProfileMeta {
  name: string;
  kind: string;
  description?: string;
  readOnly?: boolean;
}

export interface ObsProfileMeta {
  name: string;
  kind: string;
  description?: string;
  queries?: string[];
}

export interface ObsMetricResult {
  query: string;
  value: number | null;
  error?: string;
}

export interface ObsHealthReport {
  profile: string;
  fetchedAt: string;
  metrics: ObsMetricResult[];
  reachable: boolean;
}

export interface AnalyzeResponse {
  insights: Insight[];
  piiReport: PiiReport;
  ddl: DdlResult;
}

export interface SourcesResponse {
  db: DbProfileMeta[];
  obs: ObsProfileMeta[];
  llm: { configured: boolean; model?: string; baseUrl?: string };
}

// --- Chat-thread rendering model ---

export type AnalysisCard =
  | { kind: "summary"; profile: DatasetProfile }
  | { kind: "insights"; insights: Insight[] }
  | { kind: "table"; profile: DatasetProfile; ddl: DdlResult; materialized?: MaterializeResult }
  | { kind: "pii"; report: PiiReport }
  | { kind: "obs"; report: ObsHealthReport };

export interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  ts: string;
  text?: string;
  cards?: AnalysisCard[];
  pending?: boolean;
}
