# Verification · v0.3.0 · 2026-10-08

Passed:
- 70 Vitest tests across eight files, including all 59 original tests and 11 additional independent interaction checks.
- TypeScript noEmit, production Vite build and self-contained HTML packaging.
- Exact finite-deck solver versus independent small-deck permutation oracle, both modes. Gameplay, solver, storage and Worker implementation unchanged.
- Negative natural-check posterior, hidden-field invariance, multi-ace/naturals/ties, forced replacement fallback.
- Mode-isolated stats, legacy data isolation, input locks, pending reset/mode switch disabled, background pause and explicit continue.
- Coach off by default and postgame only; cancellation/stale-message refusal across replay, toggle and mode switch; collapse cancellation and reopen; same-step navigation and cache behavior.
- New-round repeated input guard and scoped keyboard operation after starting. Dialog focus trapping, Escape dismissal, trigger focus restoration and rules-to-background-pause focus transition.
- Hidden card face is absent from the DOM until reveal.
- Worker URL revocation on normal disposal, cancellation-before-startup and construction failure.
- Actual portable production HTML executed in jsdom with its genuine embedded Worker source executed in real Node worker_threads. Classic and strategic rounds both completed and produced exact reviews. Two Blob URLs created/two revoked; no external script/link assets. See portable-smoke-results.json.
- CSS/source inspection: no external font or image calls; reduced-motion override; bounded horizontal hand scrolling; touch-sized primary controls. This is inspection, not a rendered measurement.

Not verified:
- Real browser visual layout, mobile touch, actual audio playback, browser Blob Worker/file:// behavior.
- Browser checks were retried for this revision. Chromium could not launch because socket() was prohibited by the execution environment. The separate cloud browser could not reach the workspace's localhost preview, and it provided no supported artifact-preview route. No screenshots are claimed or supplied.

The earlier solver benchmark remains included as historical v0.2.0 performance evidence (18 exact coach samples and 990 exact dealer combinations); algorithms did not change. It is not a new browser or mobile performance benchmark.

Node/jsdom/worker_threads tests establish packaged-source integrity and functional behavior, not browser visual quality or file-scheme compatibility.
