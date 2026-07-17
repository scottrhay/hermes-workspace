# Telegram Workstreams — Crawl Spec

- Tier: full_spec
- Stage: Crawl / internal Scott preview
- Owner: Ariel
- OpenEngine: e0751940-e116-4167-b776-c7037ef0d4b0
- Mission Control: 16

## Objective

Let Scott select his Telegram group/topic workstreams in Mission Control and continue the canonical Hermes conversation in the browser without creating another transcript store or exposing Telegram credentials.

## Requirements

- REQ-001: Show an authenticated `Telegram Workstreams` sidebar section.
- REQ-002: Query Telegram-originated Hermes sessions and display one newest entry per stable `session_key`.
- REQ-003: Group entries by Telegram group name and sort groups/workstreams by recent activity.
- REQ-004: Exclude General (`thread_id=1`) and sessions not owned by Scott.
- REQ-005: Label each entry explicitly as a topic, with its Hermes title and Telegram topic number when a Telegram topic title is unavailable.
- REQ-006: Selecting an entry opens its existing `/chat/{sessionId}` transcript.
- REQ-007: Browser sends preserve the stable `X-Hermes-Session-Key` through the trusted server bridge.
- REQ-008: Browser and Telegram use the same persisted Hermes session; no duplicated app database.
- REQ-009: Refresh/revalidation surfaces later Telegram messages.
- REQ-010: Loading, empty, and error states are visible and non-blocking.

## Non-goals

- Posting browser turns visibly into the Telegram UI.
- Telegram topic creation, rename, or administration.
- A separate transcript database.
- A gateway restart or Telegram credential changes.

## Acceptance Criteria

- Given Scott is authenticated, when the sidebar loads, then his current Telegram workstreams appear grouped by group.
- Given multiple session rows share a stable key, when normalized, then only the newest row appears.
- Given a General topic or another Telegram user, when normalized, then it is absent.
- Given a workstream row, when Scott selects it, then Mission Control opens the canonical session transcript.
- Given Scott sends from that browser transcript, when the request reaches Hermes, then it carries the stable session key and appends to that session.
- Given Telegram adds a later turn, when Mission Control revalidates, then the transcript shows it.

## FORGE+

- Requirements: requirements and acceptance criteria above.
- Design: grouped sidebar section using existing visual tokens and session routes.
- Frontend: React selector, search, loading/error/empty states, accessible controls.
- Backend: same-origin endpoint over trusted dashboard bridge; metadata normalization server-side.
- Integration: Hermes dashboard session listing/history plus API Server streaming ingress.
- Test: normalization, filtering, endpoint, rendering/navigation, build, browser UAT.
- Security: existing app auth; server-only bearer token; Scott user filter; no Telegram secrets in browser payloads.
- Supportability: deterministic DTO and clear errors; no second datastore.
- Reliability: newest-per-key selection and periodic revalidation; no writes during listing.
- Performance: bounded query and client rendering; 60-second revalidation.
- Data/Privacy: minimum routing metadata only; no bot credentials or origin JSON.
- Deployment: local app rebuild/HMR only; rollback by reverting the feature commit.

## Risks

- Current Telegram metadata lacks human-readable topic names; use session title + topic number.
- The generic API Server binds browser turns as `api_server`; continuity works, visible Telegram mirroring does not.
- Cross-surface concurrent sends are not fully serialized by this Crawl UI; the composer must reject duplicate local sends and show existing active-run state. A gateway-wide lock is a later hardening item if live testing exposes overlap.
