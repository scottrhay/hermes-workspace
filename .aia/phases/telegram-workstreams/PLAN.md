# Telegram Workstreams — Implementation Plan

1. Extend Hermes session types and normalization to retain safe Telegram routing metadata.
2. Extend the trusted dashboard session client to accept `source=telegram`, recent ordering, and a bounded larger limit.
3. Add a same-origin authenticated `/api/telegram-workstreams` endpoint.
4. Implement a pure newest-per-session-key normalizer that filters Scott and General.
5. Add a React Query hook and grouped sidebar selector using the existing session route.
6. Pass the selected session's stable key through the existing browser chat stream request.
7. Add focused tests first for each vertical slice.
8. Run targeted tests, lint, production build, API smoke checks, and browser UAT.
9. Request separate code review; record evidence; push only after green.

## Rollback

`git revert <feature-commit>` and rebuild. No schema, credential, or gateway rollback is required.
