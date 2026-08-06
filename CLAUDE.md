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
  - **`/research`** indexes Scott's markdown research library (default: the first existing `<home>/OneDrive*/Documents/AIWork/Research-Strategy`, including Windows profiles under `/mnt/c/Users` when running from WSL; override with `RESEARCH_DIR`). See "Research library" below.
  - **`/tasks`** no longer renders a built-in kanban board — it iframe-embeds Scott's local **OpenEngine** dashboard (`http://127.0.0.1:5227/dashboard`, override with `VITE_OPENENGINE_URL`; source: `C:\AIA-Code\Operations\AIA-OpenEngine`). The old board UI (`task-card`, `task-dialog`, `src/lib/tasks-api.ts`) was deleted; the server-side task APIs (`/api/claude-tasks`, `/api/hermes-tasks`) remain for agent/cron writers, and Dashboard Kanban / Swarm still use the shared `kanban-backend`.
- **`src/routes/api/`** — server API routes. This is the BFF layer: it proxies/wraps the Hermes gateway (:8642), the Claude CLI (tasks/jobs/conductor), swarm dispatch, MCP, memory, files, and the chat streaming endpoint (`send-stream.ts`, SSE).
- **`src/server/`** — server-side domain logic backing those routes: `gateway.ts` (gateway client — it snapshots `HERMES_API_TOKEN` at module init), `auth-middleware.ts` (applied to every route), `swarm-*` (tmux-backed worker lifecycle, missions, kanban, checkpoints), `claude-*` (Claude CLI task backend), `mcp-*`, `telegram-*`, `dashboard-aggregator.ts`, `hermes-config-store.ts`.
- **`src/screens/`** — page-level UI composition; **`src/components/`** — shared components; **`src/stores/`** — zustand stores (chat, workspace, swarm, missions); **`src/lib/`** — client utilities and API clients (`gateway-api.ts`, `feature-gates.ts`, `csp.ts`).
- **`server-entry.js`** (repo root) — production HTTP server: loads Hermes auth *before* importing `dist/server/server.js`, emits CSP headers, binds loopback-only by default. Non-loopback binding fails closed unless `HERMES_PASSWORD` or an exact remote-IP allow-list is set.
- **`electron/main.cjs`** — desktop shell; bundles the server via `electron:bundle-server`.
- **`vite.config.ts`** — also auto-starts a local hermes-agent in dev and contains the vitest config.
- **`swarm.yaml`** — source of truth for the semantic swarm worker roster (see AGENTS.md for the alignment rules when changing a worker).

### Research library (`/research`)

`src/server/research-browser.ts` indexes ~800 markdown files into review-ready cards; `src/routes/api/research/{list,read,search}.ts` expose it; `src/screens/research/` renders it.

The corpus has **no consistent frontmatter** (only `mc-export/` uses YAML), so metadata is derived heuristically and the parser is the load-bearing part:

- **title** — frontmatter → first heading of any level → humanized filename (date prefix stripped)
- **date** — frontmatter → `YYYY-MM-DD` anywhere in the filename → date-named parent folder (`x-news/2026-06-20/`) → file mtime
- **summary** — first prose paragraph, skipping the `**Source:** …` / `Published: …` header block, blockquote evidence boundaries, tables and rules
- **decision / evidence** — the `AIA-RESEARCH-ARCHITECTURE-v1.md` output contract (`ADOPT NOW | TEST NEXT | MONITOR | REFERENCE ONLY | REJECT`, `strong | moderate | weak`). Lines listing *every* option are template text in the playbook docs and are deliberately ignored.
- **kind** — `feed` for the daily-automation folders (`x-news`, `x-bookmarks`, `workflow-radar`, `revenue-signal`, `viral-swipe-file`), else `curated`. Feeds outnumber curated research ~3:2, so the screen tabs them apart rather than letting them bury the library.

Two caches, both required — a cold walk of the OneDrive tree takes ~25s through WSL's drvfs:
1. **Disk** (`research-index.json` in the state dir), keyed on `mtimeMs + size`. **Bump `CACHE_VERSION` whenever the parser changes** — otherwise unchanged files keep serving metadata from the old parser.
2. **In-memory memo**, 60s TTL, bypassed by `listResearchItems({ refresh: true })` / `?refresh=1` (the screen's "Rescan" button). Tests must call `invalidateResearchIndex()`.

Indexing reads only the first 8KB of each file; full content is read on open. Path handling reuses the knowledge-browser guards (markdown only, no traversal, resolved path must stay under the root).

> Note: `.gitignore` once carried an unanchored `research/` pattern that silently matched `src/screens/research/` and `src/routes/api/research/` — hiding them from git *and* from Tailwind's source scanner, so their utility classes compiled to nothing. It is now anchored as `/research/`. Watch for the same trap with other generic directory names.

### Telegram forum sync

Chat workstreams mirror Telegram forum topics. The model is copied from Telegram's own clients (`telegramdesktop/tdesktop` `data_forum.cpp`, `morethanwords/tweb`), because both agree on it:

- **Identity is `(chatId, topicId)` and nothing else** — `src/server/telegram-topic-key.ts` is the only place that decides it. tdesktop keys `Data::Forum::_topics` by the topic-creation message's `MsgId`; a Hermes session *attaches* to a topic and never defines one. Two sessions for one topic collapse to a single workstream (newest wins). The gateway routing key `agent:main:telegram:group:{chatId}:{topicId}` encodes the pair, so it is the most reliable identity source on a session row — parse it, don't re-derive.
- **`topicId` 1 is the General topic**, real and permanent. Absent/empty/`0` all normalize to it, matching tweb's `getMessageThreadId()` fallback (in a forum there is no message that belongs to no topic). General is **hidden from the workstream list** by a display filter, but stays keyed and routable — `includeGeneral: true` opts back in for explicit resolution and authorization.
- **Two credentials, two capability levels.** `TELEGRAM_BOT_TOKEN` (bot) can create/rename/delete topics and send messages. **The Bot API has no `getForumTopics`** — enumeration is MTProto-only — so a bot alone never learns a topic's real name or sees topics nobody messaged. `TELEGRAM_USER_SESSION` (MTProto user session via `teleproto`, `src/server/telegram-user-client.ts`) reads a forum exactly as Telegram Desktop does. Both are optional and the workspace degrades cleanly without either. Note `teleproto` is the maintained fork of the archived `gramjs`/`telegram` package — don't reinstate the old one.
- **The directory is sticky** (`src/server/telegram-topic-directory.ts`) and accumulates observations. tdesktop's removal rule applies: a topic leaves only via an explicit delete, **never** because a page of session rows failed to mention it. Absence is not evidence. Merges never let an empty incoming field erase a known one.
- **The one exception: a successful full `getForumTopics` listing is authoritative.** It enumerates the entire forum, so a topic missing from it really was deleted — `reconcileChatTopics()` prunes the directory, and `normalizeTelegramWorkstreams({ liveTopicsByChat })` drops it from the list even when an orphaned Hermes session still references it. Guard this carefully: `listForumTopics()` returns **`null`** (not `[]`) when unconfigured or failing, precisely so a failed sync can never be mistaken for "this forum has no topics" and wipe a group.
- **Telegram owns topic names.** `resolveTopicName()` prefers the name Telegram reports; a saved name only wins when we pushed it and Telegram accepted it (`source: 'telegram'`) and it is at least as recent as the observation. Legacy bare-string overrides migrate to `{name, source: 'local', updatedAt: 0}` so any Telegram name outranks them.
- **Never record `row.title` as a topic name.** It is the Hermes session's LLM-generated title, which drifts as the conversation evolves and is replaced outright on session reset — it is a display fallback only. The gateway's `origin_json.chat_topic` is **null** in practice, so real names come from the MTProto listing (or a `createForumTopic`/`editForumTopic` round-trip). Because only Telegram-sourced names ever enter the directory, `record.title` is treated as a Telegram-reported name, not a fallback, and therefore outranks the session title.
- Group titles come from `getChat` (`telegram-chat-info.ts`, memoized 5 min / 30 s on miss), which is the only forum metadata a bot can read back.

> Route tests must stub **every** writer in `telegram-topic-names` / `telegram-topic-directory`. These modules write to the real workspace state dir, and a partially-stubbed module mock (`importOriginal` spread) will silently persist test fixtures into `~/.hermes/workspace/`.

### Cross-cutting invariants

- **CSP is defined in three places and must stay in sync**: `server-entry.js`, `src/lib/csp.ts` (single source of truth), and `src/routes/__root.tsx` (`APP_CSP` meta tag).
- **Env naming**: runtime reads `HERMES_API_URL` / `HERMES_API_TOKEN` (with `CLAUDE_*` legacy fallbacks). The gateway's HTTP API is opt-in — it needs `API_SERVER_ENABLED=true` (+ `API_SERVER_KEY`) in `~/.hermes/.env`; the workspace's `HERMES_API_TOKEN` must match `API_SERVER_KEY`. See `.env.example` for the full inventory.
- **Security posture**: auth middleware on every route, path-traversal guards on file APIs, fail-closed remote binding, rate limiting (`src/server/rate-limit.ts`). Keep new API routes behind the same middleware.

## Testing conventions

Unit tests are **colocated** with source as `*.test.ts(x)` (vitest + jsdom + @testing-library/react); route-level tests live in `src/routes/` with a `-` prefix. Playwright e2e specs live in `e2e/` and reproduce specific reported bugs against a running instance. When fixing a bug in server or lib code, add/extend the colocated test next to the file you changed.
