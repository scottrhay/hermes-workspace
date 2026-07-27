# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AIA-WebUI is Scott's deployment of **Hermes Workspace** (v2.x, forked from `outsourc-e/hermes-workspace`) — a full-stack web/desktop workspace for the Hermes Agent gateway (`NousResearch/hermes-agent`). It provides chat (SSE streaming), memory browsing, skills, MCP management, file browser + terminal, swarm/multi-agent orchestration, and a dashboard. It is **zero-fork** with respect to hermes-agent: the workspace talks to a vanilla gateway over HTTP; do not add features that require patching hermes-agent itself.

Also read [AGENTS.md](AGENTS.md) — it holds the swarm worker roster contract and critical **Windows-specific notes** (this machine is Windows).

## Commands

Requires Node 22+ and pnpm (pnpm workspace: root + `playground-ws-worker`).

```bash
pnpm install                 # install deps
pnpm dev                     # Vite dev server on :3000 (auto-detects/starts hermes gateway)
pnpm build                   # vite build → dist/ (client + server)
pnpm start                   # production: node server-entry.js serving dist/
pnpm test                    # vitest run (all unit tests)
pnpm vitest run src/lib/csp.test.ts        # single test file
pnpm vitest run -t "test name substring"   # single test by name
pnpm lint                    # eslint
pnpm check                   # prettier --write . && eslint --fix
pnpm electron:dev            # Electron desktop shell (spawns gateway + workspace)
pnpm electron:build:win      # NSIS installer → release/
pnpm exec playwright test e2e/<spec>.spec.ts   # Playwright e2e (needs running workspace)
```

Full local stack = three services: gateway `hermes gateway run` (:8642), dashboard `hermes dashboard --port 9119` (:9119), workspace `pnpm dev` (:3000). Many features degrade gracefully (capability gates / placeholder states) when the gateway or dashboard is absent — preserve that pattern.

## Architecture

TanStack Start (React 19 + Vite 7) full-stack app. File-based routing; `src/routeTree.gen.ts` is **generated** — never hand-edit it.

- **`src/routes/`** — pages (chat, dashboard, swarm, conductor, memory, mcp, skills, files, terminal, settings, …). Files prefixed with `-` are route-private modules/tests, not routes.
  - **`/tasks`** no longer renders a built-in kanban board — it iframe-embeds Scott's local **OpenEngine** dashboard (`http://127.0.0.1:5227/dashboard`, override with `VITE_OPENENGINE_URL`; source: `C:\AIA-Code\Operations\AIA-OpenEngine`). The old board UI (`task-card`, `task-dialog`, `src/lib/tasks-api.ts`) was deleted; the server-side task APIs (`/api/claude-tasks`, `/api/hermes-tasks`) remain for agent/cron writers, and Dashboard Kanban / Swarm still use the shared `kanban-backend`.
- **`src/routes/api/`** — server API routes. This is the BFF layer: it proxies/wraps the Hermes gateway (:8642), the Claude CLI (tasks/jobs/conductor), swarm dispatch, MCP, memory, files, and the chat streaming endpoint (`send-stream.ts`, SSE).
- **`src/server/`** — server-side domain logic backing those routes: `gateway.ts` (gateway client — it snapshots `HERMES_API_TOKEN` at module init), `auth-middleware.ts` (applied to every route), `swarm-*` (tmux-backed worker lifecycle, missions, kanban, checkpoints), `claude-*` (Claude CLI task backend), `mcp-*`, `telegram-*`, `dashboard-aggregator.ts`, `hermes-config-store.ts`.
- **`src/screens/`** — page-level UI composition; **`src/components/`** — shared components; **`src/stores/`** — zustand stores (chat, workspace, swarm, missions); **`src/lib/`** — client utilities and API clients (`gateway-api.ts`, `feature-gates.ts`, `csp.ts`).
- **`server-entry.js`** (repo root) — production HTTP server: loads Hermes auth *before* importing `dist/server/server.js`, emits CSP headers, binds loopback-only by default. Non-loopback binding fails closed unless `HERMES_PASSWORD` or an exact remote-IP allow-list is set.
- **`electron/main.cjs`** — desktop shell; bundles the server via `electron:bundle-server`.
- **`vite.config.ts`** — also auto-starts a local hermes-agent in dev and contains the vitest config.
- **`swarm.yaml`** — source of truth for the semantic swarm worker roster (see AGENTS.md for the alignment rules when changing a worker).

### Cross-cutting invariants

- **CSP is defined in three places and must stay in sync**: `server-entry.js`, `src/lib/csp.ts` (single source of truth), and `src/routes/__root.tsx` (`APP_CSP` meta tag).
- **Env naming**: runtime reads `HERMES_API_URL` / `HERMES_API_TOKEN` (with `CLAUDE_*` legacy fallbacks). The gateway's HTTP API is opt-in — it needs `API_SERVER_ENABLED=true` (+ `API_SERVER_KEY`) in `~/.hermes/.env`; the workspace's `HERMES_API_TOKEN` must match `API_SERVER_KEY`. See `.env.example` for the full inventory.
- **Security posture**: auth middleware on every route, path-traversal guards on file APIs, fail-closed remote binding, rate limiting (`src/server/rate-limit.ts`). Keep new API routes behind the same middleware.

## Testing conventions

Unit tests are **colocated** with source as `*.test.ts(x)` (vitest + jsdom + @testing-library/react); route-level tests live in `src/routes/` with a `-` prefix. Playwright e2e specs live in `e2e/` and reproduce specific reported bugs against a running instance. When fixing a bug in server or lib code, add/extend the colocated test next to the file you changed.
