import type { ObsProfile } from "../auth/authStore.js";
import type { ObsHealthReport, ObsMetricResult } from "../types.js";

/**
 * Generic pluggable observability connector. Ships one concrete adapter —
 * a Prometheus-compatible instant-query HTTP API — since that shape is
 * shared by Prometheus itself, Thanos, Cortex, Mimir, and most Datadog/
 * Grafana-fronted metric stores. Swap `queryUrl`/`queries` in auth-config
 * to point at any compatible endpoint; add a new `kind` + branch here for
 * a genuinely different wire format.
 *
 * Never throws on an unreachable target — the health report simply marks
 * `reachable: false` so the UI can show "not reachable" instead of the
 * whole analysis request failing.
 */
export async function fetchObsHealth(profile: ObsProfile): Promise<ObsHealthReport> {
  const entries = Object.entries(profile.queries ?? {});
  const metrics: ObsMetricResult[] = [];
  let reachable = false;

  for (const [label, query] of entries) {
    try {
      const url = new URL(profile.queryUrl);
      url.searchParams.set("query", query);

      const res = await fetch(url, {
        headers: profile.token ? { Authorization: `Bearer ${profile.token}` } : {},
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        metrics.push({ query: label, value: null, error: `HTTP ${res.status}` });
        continue;
      }

      reachable = true;
      const json = (await res.json()) as {
        data?: { result?: { value?: [number, string] }[] };
      };
      const raw = json.data?.result?.[0]?.value?.[1];
      metrics.push({ query: label, value: raw !== undefined ? Number(raw) : null });
    } catch (err) {
      metrics.push({
        query: label,
        value: null,
        error: err instanceof Error ? err.message : "unreachable",
      });
    }
  }

  return {
    profile: profile.name,
    fetchedAt: new Date().toISOString(),
    metrics,
    reachable,
  };
}
