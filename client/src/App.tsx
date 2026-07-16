import { useEffect, useRef, useState } from "react";
import "./styles/theme.css";
import "./styles/app.css";
import {
  analyzeDataset,
  connectDb,
  connectObs,
  fetchAssociations,
  fetchRelationships,
  fetchSources,
  streamChatMessage,
  synthesizeSummary,
  uploadFiles,
} from "./lib/api";
import type {
  AnalysisCard,
  ChatEntry,
  DatasetProfile,
  MaterializeResult,
  PiiSeverity,
  SourcesResponse,
} from "./lib/types";
import { SourcesPanel } from "./components/SourcesPanel";
import { MessageBubble } from "./components/MessageBubble";
import { ChatComposer } from "./components/ChatComposer";

function newId(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

export default function App() {
  const [entries, setEntries] = useState<ChatEntry[]>([
    {
      id: newId(),
      role: "assistant",
      ts: nowIso(),
      text:
        "Hi — I'm Datalore. Drop one or more Excel workbooks (any number of tabs, title rows, merged cells, " +
        "and embedded images are all handled — Arabic content gets detected and translated too), or a CSV/" +
        "JSON/PDF/DOCX/ZIP file. I'll profile every sheet, surface business insights, extract named entities, " +
        "run a PII health check, and — once you've loaded a few sheets — I can suggest how to combine them " +
        "into one business table or find entities that link across files. Ask me anything, in English or " +
        "Arabic (العربية).",
    },
  ]);
  const [datasets, setDatasets] = useState<DatasetProfile[]>([]);
  const [datasetRisk, setDatasetRisk] = useState<Record<string, PiiSeverity | undefined>>({});
  const [sources, setSources] = useState<SourcesResponse | undefined>();
  const [uploading, setUploading] = useState(false);
  const [connectingDb, setConnectingDb] = useState<string | null>(null);
  const [connectingObs, setConnectingObs] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [findingAssociations, setFindingAssociations] = useState(false);
  const [findingJoins, setFindingJoins] = useState(false);
  const [toast, setToast] = useState<string | undefined>();
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    fetchSources()
      .then(setSources)
      .catch(() => setToast("Could not reach the agent server."));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [entries]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  function addEntry(entry: ChatEntry) {
    setEntries((prev) => [...prev, entry]);
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  async function pushAnalysis(profile: DatasetProfile) {
    try {
      const result = await analyzeDataset(profile.id);
      setDatasetRisk((prev) => ({ ...prev, [profile.id]: result.piiReport.riskLevel }));
      const cards: AnalysisCard[] = [
        profile.contentKind === "document" ? { kind: "document", profile } : { kind: "summary", profile },
        ...(profile.imageIds && profile.imageIds.length > 0
          ? [{ kind: "images", imageIds: profile.imageIds, datasetName: profile.name } as AnalysisCard]
          : []),
        { kind: "insights", insights: result.insights },
        ...(result.ddl ? [{ kind: "table", profile, ddl: result.ddl } as AnalysisCard] : []),
        { kind: "pii", report: result.piiReport },
        ...(result.entities.length > 0
          ? [{ kind: "entities", entities: result.entities, datasetName: profile.name } as AnalysisCard]
          : []),
      ];
      addEntry({ id: newId(), role: "assistant", ts: nowIso(), cards });
    } catch (err) {
      setToast(err instanceof Error ? err.message : `Failed to analyze "${profile.name}".`);
    }
  }

  async function handleUpload(files: File[]) {
    addEntry({
      id: newId(),
      role: "user",
      ts: nowIso(),
      text: `Uploaded ${files.map((f) => f.name).join(", ")}`,
    });
    setUploading(true);
    const pendingId = newId();
    addEntry({ id: pendingId, role: "assistant", ts: nowIso(), text: "Parsing and profiling…", pending: true });

    try {
      const { datasets: created, errors } = await uploadFiles(files);
      removeEntry(pendingId);
      if (created.length > 0) setDatasets((prev) => [...prev, ...created]);
      for (const profile of created) await pushAnalysis(profile);
      if (errors.length > 0) setToast(errors.map((e) => `${e.file}: ${e.reason}`).join("; "));
      if (created.length === 0 && errors.length === 0) {
        setToast("No rows could be read from that file.");
      }
    } catch (err) {
      removeEntry(pendingId);
      setToast(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleConnectDb(name: string) {
    setConnectingDb(name);
    try {
      const { datasets: created, availableTables } = await connectDb(name);
      addEntry({
        id: newId(),
        role: "assistant",
        ts: nowIso(),
        text:
          created.length > 0
            ? `Connected to "${name}" — found ${availableTables.length} table(s), profiling ${created.length} of them now.`
            : `Connected to "${name}" but found no tables with data.`,
      });
      if (created.length > 0) setDatasets((prev) => [...prev, ...created]);
      for (const profile of created) await pushAnalysis(profile);
    } catch (err) {
      setToast(err instanceof Error ? err.message : `Could not connect to "${name}".`);
    } finally {
      setConnectingDb(null);
    }
  }

  async function handleConnectObs(name: string) {
    setConnectingObs(name);
    try {
      const report = await connectObs(name);
      addEntry({
        id: newId(),
        role: "assistant",
        ts: nowIso(),
        text: report.reachable
          ? `Pulled the latest metrics from "${name}".`
          : `"${name}" is configured but not reachable right now — showing what I could get.`,
        cards: [{ kind: "obs", report }],
      });
    } catch (err) {
      setToast(err instanceof Error ? err.message : `Could not reach "${name}".`);
    } finally {
      setConnectingObs(null);
    }
  }

  async function handleSynthesize() {
    setSynthesizing(true);
    try {
      const summary = await synthesizeSummary();
      const bullets = summary.perDataset.map((d) => `• ${d.name}: ${d.headline}`).join("\n");
      const text = [
        summary.narrative ?? `Overall risk level: ${summary.overallRiskLevel}.`,
        "",
        bullets,
      ].join("\n");
      addEntry({ id: newId(), role: "assistant", ts: nowIso(), text });
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not generate the executive summary.");
    } finally {
      setSynthesizing(false);
    }
  }

  async function handleFindAssociations() {
    setFindingAssociations(true);
    try {
      const { associations, datasetsAnalyzed } = await fetchAssociations();
      addEntry({
        id: newId(),
        role: "assistant",
        ts: nowIso(),
        text: `Checked entities across ${datasetsAnalyzed} analyzed dataset(s):`,
        cards: [{ kind: "associations", associations }],
      });
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not compute associations.");
    } finally {
      setFindingAssociations(false);
    }
  }

  async function handleFindJoins() {
    setFindingJoins(true);
    try {
      const { suggestions } = await fetchRelationships();
      addEntry({
        id: newId(),
        role: "assistant",
        ts: nowIso(),
        text: "Here's what I found across your tables:",
        cards: [{ kind: "joins", suggestions }],
      });
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Could not compute join suggestions.");
    } finally {
      setFindingJoins(false);
    }
  }

  function handleMaterialized(datasetId: string, result: MaterializeResult) {
    setEntries((prev) =>
      prev.map((e) =>
        e.cards
          ? {
              ...e,
              cards: e.cards.map((c) =>
                c.kind === "table" && c.profile.id === datasetId ? { ...c, materialized: result } : c,
              ),
            }
          : e,
      ),
    );
  }

  function handleSend(text: string) {
    addEntry({ id: newId(), role: "user", ts: nowIso(), text });
    const assistantId = newId();
    addEntry({ id: assistantId, role: "assistant", ts: nowIso(), text: "", pending: true });

    streamChatMessage(
      text,
      (chunk) => {
        setEntries((prev) =>
          prev.map((e) => (e.id === assistantId ? { ...e, text: (e.text ?? "") + chunk, pending: false } : e)),
        );
      },
      () => {
        setEntries((prev) => prev.map((e) => (e.id === assistantId ? { ...e, pending: false } : e)));
      },
      (errMsg) => {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === assistantId
              ? { ...e, text: (e.text || "") || `Sorry — ${errMsg}`, pending: false }
              : e,
          ),
        );
      },
    );
  }

  const llmConfigured = sources?.llm.configured;

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-id">
            <div className="brand-mark" />
            <div>
              <div className="brand-name">Datalore</div>
              <div className="brand-sub">Data analysis agent</div>
            </div>
          </div>
          <button
            className="icon-btn"
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title="Toggle theme"
            aria-label="Toggle color theme"
          >
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>

        <SourcesPanel
          sources={sources}
          datasets={datasets}
          datasetRisk={datasetRisk}
          onUpload={handleUpload}
          onConnectDb={handleConnectDb}
          onConnectObs={handleConnectObs}
          connectingDb={connectingDb}
          connectingObs={connectingObs}
          uploading={uploading}
        />
      </aside>

      <div className="chat-shell">
        <div className="chat-header">
          <button className="icon-btn menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sources">
            ☰
          </button>
          <div>
            <div className="chat-header-title">Analysis chat</div>
            <div className="chat-header-sub">{datasets.length} dataset(s) in this workspace</div>
          </div>
          <button
            className="btn"
            onClick={handleFindJoins}
            disabled={findingJoins || datasets.length < 2}
            title="Find likely relationships across your tables and combine them"
          >
            {findingJoins ? "Checking…" : "🔗 Suggest joins"}
          </button>
          <button
            className="btn"
            onClick={handleFindAssociations}
            disabled={findingAssociations || datasets.length < 2}
            title="Find entities that show up across multiple datasets"
          >
            {findingAssociations ? "Checking…" : "🕸️ Associations"}
          </button>
          <button
            className="btn"
            onClick={handleSynthesize}
            disabled={synthesizing || datasets.length === 0}
            title="Merge all analyzed datasets into one executive summary"
          >
            {synthesizing ? "Synthesizing…" : "⬡ Synthesize"}
          </button>
          <div className="llm-pill">
            <span
              className="dot"
              style={{ background: llmConfigured ? "var(--status-good)" : "var(--status-warning)" }}
            />
            {llmConfigured ? `${sources?.llm.model} connected` : "Rule-based mode (no LLM configured)"}
          </div>
        </div>

        <div className="chat-scroll" ref={scrollRef}>
          {entries.map((entry) => (
            <MessageBubble key={entry.id} entry={entry} onMaterialized={handleMaterialized} />
          ))}
        </div>

        <ChatComposer onSend={handleSend} onUpload={handleUpload} busy={uploading} />
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
