# Telegram Workstreams — UAT

- [x] Open `http://localhost:3000/chat/new`.
      Observed: sidebar contains a visible, searchable `Telegram Workstreams` selector.
- [x] Search for topic 2246.
      Observed: exactly one Executive Administration result appears with its Hermes title, topic number, and message count.
- [x] Select topic 2246.
      Observed: the canonical `20260716_091234_c26fd5a9` history opens in the full browser chat and includes Scott's latest Telegram turn.
- [x] Send an isolated browser test phrase to inactive Telegram topic 25.
      Observed: HTTP 200 SSE returned `WEB_CONTINUITY_OK`, and the user/assistant pair persisted in canonical session `20260704_120019_af99fb47`.
- [x] Attempt a simultaneous browser send while Telegram topic 2246 is active.
      Observed: HTTP 409 rejects the overlapping turn with a wait-and-retry message; the probe is not persisted.
- [x] Reproduce Scott's failed Projects workstream send.
      Observed: `Customer Portal URL for David` was outside the generic 50-session list, so the first build lost its stable Telegram key and showed `Operation interrupted`.
- [x] Verify the corrected Projects workstream path.
      Observed: the selector now restores the title and stable key independently of the short generic list; a real Playwright send returned `PROJECT_WEB_OK` without interruption and persisted the user/assistant pair in canonical session `20260716_120508_bbbb1b43`.
- [x] Verify authorization failure paths.
      Observed: omitted routing metadata via raw or friendly concrete Telegram IDs returns HTTP 403; an unknown stable key returns 403; active Topic 2246 returns 409.
- [x] Verify post-review exact pairing and lock lifecycle hardening.
      Observed: a stable key paired with another topic's concrete session returned HTTP 403 and was not persisted; two sequential completed sends to inactive Topic 25 both returned HTTP 200, returned the expected replies, and persisted, proving the browser lock was released.
- [x] Verify post-review watchdog and heartbeat cleanup changes do not regress sequential sends.
      Observed: two additional sequential Topic 25 sends both returned HTTP 200 with `TIMER_CLEANUP_ONE_OK` and `TIMER_CLEANUP_TWO_OK` after moving the watchdog before the upstream await and separating heartbeat timer handles.
- [x] Verify extracted lifecycle cleanup remains wired into real browser sends.
      Observed: two sequential Topic 25 sends returned HTTP 200 with `LIFECYCLE_ONE_OK` and `LIFECYCLE_TWO_OK` after moving watchdog/heartbeat/lock cleanup into the behaviorally tested lifecycle helper.
- [x] Verify terminal dispatch remains wired into real browser sends.
      Observed: two sequential Topic 25 sends returned HTTP 200 with `TERMINAL_ONE_OK` and `TERMINAL_TWO_OK` after routing completion, cancellation, timeout, upstream error, and normal upstream end through explicit terminal handlers.
- [x] Inspect selector API output.
      Observed: 29 Scott-owned workstreams, eight named groups, zero General-topic rows, and no Telegram token/credential fields.
- [ ] Scott switches from this Telegram topic to Mission Control and continues normal work.
      Expected: Ariel retains the workstream context and Scott accepts the browser experience.

Exact-surface status: automated and agent-operated browser UAT passed; Scott acceptance pending.
