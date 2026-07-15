# Datalore — a data analysis agent, as a chat

A chat-first front end for a hierarchical multi-agent system that ingests
data across many file types (see below), databases, and observability
systems via pluggable connectors, profiles it, and surfaces the results as
rich cards **inline in the conversation**:

- Dataset summary (rows/columns for tabular data; word/page count for
  documents)
- Business insights (heuristic + optional local-LLM narrative)
- A generated `CREATE TABLE` statement, with a one-click **Create table**
  action that materializes tabular data into a real SQLite table
- A PII health check (score, risk level, flagged fields, masked samples) —
  column-pattern-based for tabular data, free-text pattern matching for
  documents
- A **Synthesize** action that merges every analyzed dataset's findings
  into one cross-dataset executive summary
- A free-form chat to ask follow-up questions about anything loaded into the
  workspace

Everything above happens in one place — the chat thread — instead of
separate dashboard tabs.

## Architecture: hierarchical agent pipeline

The ingestion/analysis pipeline is organized as an in-process, four-tier
agent hierarchy (one Node server — no distributed processes/message queue;
"agents" are TypeScript modules with a matching interface, communicating via
typed function calls that mirror the message shapes below):

```
L0  Master Orchestrator      server/src/agents/orchestrator.ts
    MIME/magic-byte detection (file-type) → archive expansion (recursive,
    depth + size capped) → registry-driven classify + dispatch

L1  Domain Managers          server/src/agents/domains/
    structuredDataManager     csv/json/xlsx → tabular DatasetProfile
    unstructuredDocManager    pdf/docx → document DatasetProfile
    databaseManager           SQLite (Postgres/MySQL/Mongo: same shape, TBD)
    piiComplianceManager      routes tabular → column scanner, document → text scanner
    businessIntelManager      routes tabular → column insights, document → text insights

L2  Specialist Agents         server/src/agents/specialists/
    pdfAgent (pdf-parse) · officeDocAgent (mammoth) · archiveAgent (adm-zip/tar-stream)
    csv/json/xlsx parsing lives in ingestion/fileParser.ts (pre-existing, now
    called from structuredDataManager)

Synthesiser                   server/src/agents/synthesiser.ts
    Cross-dataset executive summary from every dataset's cached PartialResults
```

`server/src/agents/registry.ts` is the single source of truth for "what file
types does this system know about, and which ones actually work" — each
entry is marked `implemented` or `planned`. Adding a new file type means one
new registry row plus one specialist module; nothing else in the router
changes. Categories recognized but not yet implemented (images/OCR, email,
code/log, media transcription, web/XML) are reported back clearly as
"planned" rather than silently mis-parsed.

```
auth-config/        # the ONLY place credentials/connection profiles live
  llm.json            # local/air-gapped LLM endpoint (e.g. Kimi K2)
  db-profiles.json     # named database connections
  obs-profiles.json    # named observability connections
server/             # Express + TypeScript API
  src/auth/            # authStore.ts — sole reader of auth-config/
  src/llm/             # OpenAI-compatible client (for Kimi K2 or similar)
  src/agents/           # the hierarchical pipeline described above
  src/ingestion/        # file parsing, SQLite connector, obs connector
  src/analysis/         # column profiler, DDL generator, PII scanner, insights
  src/chat/             # chat engine (LLM-backed with rule-based fallback)
  src/routes/           # upload / sources / analyze / chat endpoints
client/             # Vite + React + TypeScript chat UI
```

### Why `auth-config/` is separate

`server/src/auth/authStore.ts` is the single boundary between application
code and secrets. It reads `auth-config/` (a sibling of `server/` and
`client/`, resolved via the `AUTH_STORE_DIR` env var) and exposes only
sanitized, secret-free metadata to the rest of the app — profile names and
descriptions, never keys, tokens, or passwords. Real profile files are
`.gitignore`d; only `*.example.json` templates are committed. See
[`auth-config/README.md`](auth-config/README.md) for the full rationale and
setup steps.

### Air-gapped LLM (Kimi K2)

The insight/chat engine calls a local, OpenAI-compatible chat-completions
endpoint (e.g. a self-hosted Kimi K2 server behind vLLM/SGLang) configured
in `auth-config/llm.json`. No outbound internet call is ever made. If the
file is absent or the endpoint is unreachable, the app **automatically
falls back** to a deterministic, rule-based insight/Q&A engine so it keeps
working fully offline.

## Getting started

```sh
# 1. Server
cd server
npm install
npm run dev          # http://localhost:4000

# 2. Client (separate terminal)
cd client
npm install
npm run dev           # http://localhost:5173 (proxies /api to :4000)
```

Optional: wire up real credentials/connections —

```sh
cp auth-config/llm.example.json auth-config/llm.json           # local Kimi K2 endpoint
cp auth-config/db-profiles.example.json auth-config/db-profiles.json
cp auth-config/obs-profiles.example.json auth-config/obs-profiles.json
```

Without any of these, the app still works end-to-end: upload a file, get
insights + (for tabular data) a proposed table + a PII report, create the
table in the built-in local SQLite workspace (`server/data/workspace.sqlite`,
no config required), and chat about it using the rule-based fallback.

## Data sources

- **Attachments** — implemented: CSV/TSV, JSON/JSONL, Excel (XLSX/XLS/ODS),
  PDF, DOCX, and ZIP/TAR/TAR.GZ archives (unpacked recursively — a zip full
  of csvs/pdfs/docs gets every entry routed back through the same pipeline,
  capped at depth 3 and 300 total files as a zip-bomb guard). Planned but
  not yet implemented: images/OCR, email (PST/MBOX/EML), code/log files,
  audio/video transcription, web/XML — these are recognized by the file
  router and reported clearly rather than silently mis-parsed.
- **Databases**: a SQLite connector introspects tables from any profile in
  `db-profiles.json` (including the built-in local workspace db) and
  profiles them the same way as an uploaded file.
- **Observability**: a generic Prometheus-compatible HTTP adapter pulls
  metrics from any profile in `obs-profiles.json` for system-health cards.
  Point it at Prometheus, Thanos, Cortex, Mimir, or any compatible endpoint.

## Security notes

- PII detection combines value-pattern regexes (email, phone, SSN, credit
  card, IP, API-key-shaped strings) with column-name heuristics (address,
  DOB, name fields), and only applies value patterns to text-typed columns
  to avoid false positives against numeric/date columns. Documents (PDF/
  DOCX) get a separate free-text scan using non-anchored variants of the
  same patterns.
- Archive expansion is capped independent of the compressed upload size
  (max nesting depth 3, max 300 files, max 100MB expanded) — a zip/tar
  bomb gets rejected with a clear error rather than exhausting memory.
- Magic-byte sniffing (`file-type`) cross-checks the claimed file extension
  against actual file content before dispatch, so a renamed file can't be
  routed to the wrong parser.
- The chat SQL surface (used internally against the workspace database)
  only ever executes single `SELECT` statements — no INSERT/UPDATE/DELETE/
  DROP/ALTER/ATTACH/PRAGMA is accepted.
- `npm audit` is clean on the server side except one moderate,
  non-exploitable transitive `uuid` advisory pulled in by `exceljs` (no
  non-breaking fix upstream yet); we never pass user-controlled buffers
  into `uuid` generation so it isn't reachable in this app's code paths.
