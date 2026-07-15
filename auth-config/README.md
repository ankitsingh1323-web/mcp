# auth-config/

This directory is the **only** place credentials and connection profiles live.
It is deliberately kept as a sibling of `server/` and `client/`, outside the
application source tree, so that:

- Application code never hardcodes a secret, a connection string, or an API
  token — it only knows how to *read* profiles through
  `server/src/auth/authStore.ts`.
- The real profile files (`*.json`, not `*.example.json`) are excluded from
  git via the repo's `.gitignore`. Only the `.example.json` templates are
  version-controlled.
- The whole directory can be swapped for a different mount at deploy time
  (e.g. a read-only secrets volume, an air-gapped config drop) by pointing
  the `AUTH_STORE_DIR` environment variable at it — no code changes needed.

## Layout

```
auth-config/
  llm.json          # local/air-gapped LLM inference endpoint (e.g. Kimi K2)
  db-profiles.json   # named database connection profiles
  obs-profiles.json  # named observability system connection profiles
```

Each file has a matching `*.example.json` template committed to the repo.
Copy the template, drop the `.example`, and fill in real values:

```sh
cp auth-config/llm.example.json auth-config/llm.json
cp auth-config/db-profiles.example.json auth-config/db-profiles.json
cp auth-config/obs-profiles.example.json auth-config/obs-profiles.json
```

## What the server does with these files

`authStore.ts` loads this directory once at startup (and can hot-reload on
request), validates the shape of each file, and exposes only what the rest
of the app needs:

- **Secrets never cross the HTTP boundary.** Routes that list "available
  sources" return profile *names* and non-secret metadata only — never the
  API key, password, or token.
- Every credential-bearing connector (LLM client, SQLite/DB connector, obs
  connector) pulls its config from `authStore`, never from `process.env`
  directly and never from request bodies.

## Air-gapped LLM note

`llm.json` points at a local, OpenAI-compatible chat-completions endpoint
(e.g. a self-hosted Kimi K2 server via vLLM/SGLang/Ollama-style gateway).
No outbound internet call is made — if this file is absent or the endpoint
is unreachable, the app degrades gracefully to its deterministic rule-based
insight/chat engine instead of failing.
