# Telegram Workstreams — Verification

## Scope

- Repository: `/home/scott/code/hermes-workspace`
- Branch: `feat/telegram-workstreams`
- Surface: local Mission Control at `http://localhost:3000`
- Tier: Crawl / internal Scott preview

## Requirement coverage

- Authenticated, Scott-owned Telegram workstream endpoint: pass.
- Newest concrete session per stable `session_key`: pass.
- General topic exclusion: pass.
- Searchable, grouped selector: pass.
- Canonical history navigation: pass.
- Stable Telegram session key forwarding: pass.
- Latest-session resolution before send: pass.
- Concurrent-surface protection: in-process browser sends are serialized; already-active Telegram sessions return HTTP 409. Cross-process Telegram race remains best-effort.
- Credential isolation: pass; client response contains no bot token or credential.
- Visible Telegram mirroring: intentionally excluded from Crawl.

## Automated gates

- Focused Vitest: 32 tests across 11 files passed.
- Full Vitest: 741 passed and 33 failed across 11 files; the failure count exactly matches the recorded upstream baseline of 33, so this change introduced no additional full-suite failures.
- New-file ESLint: passed; repository-wide lint still has pre-existing unrelated violations in large legacy files.
- New-file Prettier and `git diff --check`: passed.
- Vite production client + SSR build: passed.
- API smoke: 29 workstreams, eight named groups, zero General-topic rows.

## Exact-surface UAT

- Selector visible and legible in the live dark-theme sidebar: pass.
- Search `2246` filters to the expected Executive Administration workstream: pass.
- Selecting topic 2246 opens canonical session `20260716_091234_c26fd5a9`: pass.
- Latest Telegram message is visible in browser history: pass.
- Inactive topic 25 browser send returned `WEB_CONTINUITY_OK` through SSE and persisted the user/assistant pair in canonical session `20260704_120019_af99fb47`: pass.
- Active topic 2246 simultaneous send returned HTTP 409 and did not persist the probe: pass.
- Scott's failed `Customer Portal URL for David` send was reproduced and traced to stable-key loss outside the generic 50-session list: pass.
- Corrected Projects selector send returned `PROJECT_WEB_OK` and persisted the canonical pair without `Operation interrupted`: pass.
- Omitted or unknown Telegram routing keys return HTTP 403; authoritative lookup/probe failures return generic HTTP 503: pass.
- Mismatched stable-key/concrete-session pairs return HTTP 403 without persistence: pass.
- Two sequential completed browser sends to the same inactive topic both return HTTP 200 and persist, proving lock release: pass.
- Telegram stream errors expose only a generic browser message; upstream diagnostics remain server-side: pass.
- Post-ship independent review findings were remediated; final re-review pending.
- Scott acceptance of the corrected daily browser experience: pending.

## Remaining risk

- Crawl shares Hermes context but does not mirror browser messages into Telegram's visible message history.
- Actual Telegram topic names are not available in current metadata; the selector uses the Hermes conversation title plus topic number.
- Selector refresh is polling-based at 10 seconds.
- Browser-browser overlap is serialized in this Mission Control server process; Telegram-vs-browser overlap is rejected when the gateway reports the Telegram session active, but a narrow cross-process race remains until Hermes exposes a shared gateway lease.
- Stable-key authorization scans the 1,000 newest Telegram rows; older workstreams fail closed rather than routing incorrectly.

## Rollback

Revert the Telegram Workstreams feature commit and rebuild. No schema migration or credential change is required.
