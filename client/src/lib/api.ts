import type { AnalyzeResponse, DatasetProfile, MaterializeResult, ObsHealthReport, SourcesResponse } from "./types";

const BASE = "/api";

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function uploadFiles(files: File[]): Promise<{ datasets: DatasetProfile[]; errors: { file: string; error: string }[] }> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f));
  const res = await fetch(`${BASE}/upload`, { method: "POST", body: form });
  return asJson(res);
}

export async function fetchSources(): Promise<SourcesResponse> {
  const res = await fetch(`${BASE}/sources`);
  return asJson(res);
}

export async function connectDb(name: string): Promise<{ datasets: DatasetProfile[]; availableTables: string[] }> {
  const res = await fetch(`${BASE}/sources/db/${encodeURIComponent(name)}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  return asJson(res);
}

export async function connectObs(name: string): Promise<ObsHealthReport> {
  const res = await fetch(`${BASE}/sources/obs/${encodeURIComponent(name)}/health`, { method: "POST" });
  return asJson(res);
}

export async function analyzeDataset(id: string): Promise<AnalyzeResponse> {
  const res = await fetch(`${BASE}/datasets/${id}/analyze`, { method: "POST" });
  return asJson(res);
}

export async function materializeDataset(id: string): Promise<MaterializeResult> {
  const res = await fetch(`${BASE}/datasets/${id}/materialize`, { method: "POST" });
  return asJson(res);
}

export async function sendChatMessage(message: string): Promise<{ reply: string }> {
  const res = await fetch(`${BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  return asJson(res);
}

export function streamChatMessage(
  message: string,
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): () => void {
  const source = new EventSource(`${BASE}/chat/stream?message=${encodeURIComponent(message)}`);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as { chunk?: string; done?: boolean; error?: string };
      if (data.chunk) onChunk(data.chunk);
      if (data.error) {
        onError(data.error);
        source.close();
      }
      if (data.done) {
        source.close();
        onDone();
      }
    } catch {
      // ignore malformed frame
    }
  };

  source.onerror = () => {
    source.close();
    onError("Connection to the agent was interrupted.");
  };

  return () => source.close();
}
