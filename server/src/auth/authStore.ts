import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { DbProfileMeta, ObsProfileMeta } from "../types.js";

/**
 * Single boundary between application code and credentials. Every
 * connector (LLM client, DB connector, obs connector) reads through this
 * module — nothing else in the app touches auth-config/ or process.env
 * for secrets directly. Routes only ever expose the *Meta shapes below,
 * which strip out apiKey/token/password before anything reaches an HTTP
 * response.
 */

export interface LlmConfig {
  provider: "openai-compatible";
  baseUrl: string;
  model: string;
  apiKey: string;
  timeoutMs: number;
  enabled: boolean;
}

export interface DbProfile {
  name: string;
  kind: "sqlite";
  description?: string;
  file: string;
  readOnly?: boolean;
}

export interface ObsProfile {
  name: string;
  kind: "prometheus";
  description?: string;
  queryUrl: string;
  token?: string;
  queries: Record<string, string>;
}

function authStoreDir(): string {
  const configured = process.env.AUTH_STORE_DIR;
  if (configured) return path.resolve(configured);
  // Default: sibling auth-config/ directory, two levels up from this file
  // (server/src/auth -> repo root -> auth-config).
  return path.resolve(import.meta.dirname, "..", "..", "..", "auth-config");
}

function readJsonFile<T>(fileName: string): T | undefined {
  const dir = authStoreDir();
  const filePath = path.join(dir, fileName);
  if (!existsSync(filePath)) return undefined;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[authStore] failed to parse ${filePath}:`, err);
    return undefined;
  }
}

export function loadLlmConfig(): LlmConfig | undefined {
  const cfg = readJsonFile<LlmConfig>("llm.json");
  if (!cfg || !cfg.enabled) return undefined;
  if (!cfg.baseUrl || !cfg.model) return undefined;
  return cfg;
}

export function loadDbProfiles(): DbProfile[] {
  return readJsonFile<DbProfile[]>("db-profiles.json") ?? [];
}

export function loadObsProfiles(): ObsProfile[] {
  return readJsonFile<ObsProfile[]>("obs-profiles.json") ?? [];
}

export function getDbProfile(name: string): DbProfile | undefined {
  return loadDbProfiles().find((p) => p.name === name);
}

export function getObsProfile(name: string): ObsProfile | undefined {
  return loadObsProfiles().find((p) => p.name === name);
}

// --- Sanitized, secret-free views for anything that crosses the HTTP boundary ---

export function dbProfilesMeta(): DbProfileMeta[] {
  return loadDbProfiles().map(({ name, kind, description, readOnly }) => ({
    name,
    kind,
    description,
    readOnly,
  }));
}

export function obsProfilesMeta(): ObsProfileMeta[] {
  return loadObsProfiles().map(({ name, kind, description, queries }) => ({
    name,
    kind,
    description,
    queries: Object.keys(queries ?? {}),
  }));
}

export function llmStatus(): { configured: boolean; model?: string; baseUrl?: string } {
  const cfg = loadLlmConfig();
  if (!cfg) return { configured: false };
  return { configured: true, model: cfg.model, baseUrl: cfg.baseUrl };
}

export function authStoreLocation(): string {
  return authStoreDir();
}
