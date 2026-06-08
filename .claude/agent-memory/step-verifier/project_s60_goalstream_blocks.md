---
name: s60-goalstream-blocks
description: S60 verification — live goal stream (red set/RedWorkQueue/sensors over S58 gateway+S59 SDK) + global /blocks BlockReason catalog with executable refusal toast
metadata:
  type: project
---

S60 (app-builder EPIC 2) closes the read-only gap of the /goal verticale + surfaces refusals. Verified-green, ZERO corrections.

**Two done-criteria, both met:**
1. streamed red set == computed red set — `lib/goal-stream.ts` `demoGoalStream().redSet` reuses `ORDER_DISCOUNT_GOAL.redSet` (the S29 goal twin) VERBATIM, no re-derivation; live path decodes gateway `changeset_status` payload `redSet` directly (goalStreamDecoder pure/total, rejects malformed→null→demo fallback). Pinned by `lib/goal-stream.test.ts` vitest+fast-check (decoder never-coerces, reproducible, fallback no-endpoint/throw/malformed→demo well-formed→live source tag).
2. e2e refused truth-write surfaces actionable BlockReason — `lib/blocks.ts` `refuseTruthWrite`→`gateway.route()`→`refused_truth_write`→GATEWAY_TRUTH_WRITE_NEEDS_CHANGESET (code/severity/explanation/non-empty howToFix[]); `/blocks` panel refuse-button→toast. e2e tests/e2e/blocks.spec.ts DONE CRITERION test green.

**Faithfulness (honest):** spec mentioned `changeset_open_goal`-style read but closed S58 registry exposes no such tool; executor correctly read the REAL below-the-line `changeset_status` (in registry, line 99 gateway.ts) — readVia faithful to closed registry, never sends unexposed name. Memory note 5031 "changeset_open_goal not in registry" → resolved by using changeset_status. Correct call, not a scar.

**Sensors all green:** tsc rc=0, biome clean (10 files), full front vitest 999/999 (92 files, +17 S60), i18n 3413==3413 FR/EN zero-diff (blocks 20 + goalStream 30 keys both), Playwright tests/e2e/blocks.spec.ts 5/5 (:3000 live).

**WALL:** grep INSERT/kernel_write/truth-write on S60 surfaces = only CODE_TRUTH_WRITE_NEEDS_CHANGESET constant + fenced TRUTH_WRITE_TOOLS string literals (kernel/mirror/fitness_write tool NAMES the panel OFFERS to refuse) — zero actual write. Panels read-only + show refusals; refuseTruthWrite triggers refusal to SHOW it.

**Determinism-first:** decoder, demo fallback, refusal router, catalog all PURE authoritative code each with reproducibility mirror (17/17 property/fast-check same-input→same-output). Zero LLM. readVia transport sole impure.

**Docs:** concept+internals s60-goal-stream-blocks.mdx, 3 layers (Implémentation/Méta/Méta-méta), registered docs.json (refs 187-188), pushed steph-frtech/docs main 615ade9 HEAD==origin. Main repo committed 954cc25, working tree CLEAN.

**OQ (non-blocking):** Linear MCP unauthenticated (only authenticate/complete_authentication tools, no list/create/update) — S60 issue not moved, documented per §11. True SSE/websocket server-push not wired (streams via SDK reads + refresh control; satisfies done-crit) = forward-dep OQ. Both by-design.
