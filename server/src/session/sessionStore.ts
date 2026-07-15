import type { ChatMessage, DatasetProfile, Insight, MaterializeResult, PiiReport } from "../types.js";

interface StoredDataset {
  profile: DatasetProfile;
  /** Tabular datasets only; empty for document-kind datasets. */
  rows: Record<string, unknown>[];
  /** Document-kind datasets only (extracted PDF/DOCX text); undefined for tabular. */
  text?: string;
  piiReport?: PiiReport;
  /** Cached from the last /analyze call, so the Synthesiser can aggregate without re-running LLM calls. */
  insights?: Insight[];
  materialized?: MaterializeResult;
}

/**
 * Process-local, in-memory workspace: analyzed datasets and chat history.
 * No credentials live here — only the data the user uploaded/connected and
 * the profile/report derived from it.
 */
class Workspace {
  private datasets = new Map<string, StoredDataset>();
  private chatHistory: ChatMessage[] = [];

  addDataset(profile: DatasetProfile, rows: Record<string, unknown>[]): void {
    this.datasets.set(profile.id, { profile, rows });
  }

  addDocumentDataset(profile: DatasetProfile, text: string): void {
    this.datasets.set(profile.id, { profile, rows: [], text });
  }

  setPiiReport(datasetId: string, report: PiiReport): void {
    const entry = this.datasets.get(datasetId);
    if (entry) entry.piiReport = report;
  }

  setMaterialized(datasetId: string, result: MaterializeResult): void {
    const entry = this.datasets.get(datasetId);
    if (entry) entry.materialized = result;
  }

  setInsights(datasetId: string, insights: Insight[]): void {
    const entry = this.datasets.get(datasetId);
    if (entry) entry.insights = insights;
  }

  getDataset(datasetId: string): StoredDataset | undefined {
    return this.datasets.get(datasetId);
  }

  listDatasets(): DatasetProfile[] {
    return [...this.datasets.values()].map((d) => d.profile);
  }

  listAll(): StoredDataset[] {
    return [...this.datasets.values()];
  }

  appendChat(message: ChatMessage): void {
    this.chatHistory.push(message);
    if (this.chatHistory.length > 100) this.chatHistory.shift();
  }

  getChatHistory(): ChatMessage[] {
    return this.chatHistory;
  }
}

export const workspace = new Workspace();
