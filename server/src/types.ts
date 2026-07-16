export type SourceKind = "attachment" | "database" | "observability";

// Tabular datasets (csv/json/xlsx/db tables) keep the existing rows+columns
// profile. Document datasets (pdf/docx) have no natural rows/columns — they
// carry extracted text + documentMeta instead, and skip DDL/materialize.
export type ContentKind = "tabular" | "document";

export interface DocumentMeta {
  wordCount: number;
  pageCount?: number;
  excerpt: string;
}

// The diagram's file-type categories this router recognizes. Grouped to
// match the diagram's own buckets (e.g. xls/ods fold into "xlsx", pptx/rtf/odt
// fold into "docx") rather than one category per extension.
export type FileCategory =
  | "csv"
  | "json"
  | "xlsx"
  | "pdf"
  | "docx"
  | "archive"
  | "image"
  | "email"
  | "code_log"
  | "media"
  | "web_xml"
  | "unrecognized";

export type AgentDomain = "structured_data" | "unstructured_doc" | "archive" | "database";

export type CapabilityStatus = "implemented" | "planned";

export interface AgentCapability {
  category: FileCategory;
  label: string;
  domain: AgentDomain;
  status: CapabilityStatus;
  extensions: string[];
}

export interface UnsupportedFile {
  file: string;
  category: FileCategory;
  status: "planned" | "unrecognized" | "error";
  reason: string;
}

export type ColumnType =
  | "integer"
  | "float"
  | "boolean"
  | "date"
  | "datetime"
  | "text"
  | "unknown";

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
  contentKind: ContentKind;
  rowCount: number;
  columns: ColumnStats[];
  documentMeta?: DocumentMeta;
  /** Set when this dataset came from one sheet of a multi-sheet Excel workbook. */
  sheetName?: string;
  /** True if any Arabic text was detected in this dataset's source content. */
  hasArabicContent?: boolean;
  /** IDs of images extracted from the same workbook/sheet — fetch via GET /api/images/:id. */
  imageIds?: string[];
  createdAt: string;
}

export interface ExtractedImageMeta {
  id: string;
  fileName: string;
  sheetName: string;
  anchorCell?: string;
  extension: string;
  byteSize: number;
}

export type EntityType = "person" | "organization" | "location" | "date" | "other";

export interface NamedEntity {
  text: string;
  type: EntityType;
  mentions: number;
}

export interface EntityAssociation {
  entity: string;
  type: EntityType;
  totalMentions: number;
  datasets: { datasetId: string; name: string; mentions: number }[];
}

export interface JoinSuggestion {
  leftDatasetId: string;
  leftDatasetName: string;
  leftColumn: string;
  rightDatasetId: string;
  rightDatasetName: string;
  rightColumn: string;
  overlapRatio: number;
  overlapCount: number;
  sql: string;
  rationale: string;
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
  /** Column name for tabular datasets; a location label (e.g. "document text") for document datasets. */
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
  preexistingRowCount: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
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

export interface ExecutiveSummary {
  generatedAt: string;
  datasetCount: number;
  overallRiskLevel: PiiSeverity;
  highlights: string[];
  perDataset: { datasetId: string; name: string; headline: string }[];
  narrative?: string;
}

export interface ObsHealthReport {
  profile: string;
  fetchedAt: string;
  metrics: ObsMetricResult[];
  reachable: boolean;
}
