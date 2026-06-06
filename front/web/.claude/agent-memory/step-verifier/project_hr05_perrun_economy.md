---
name: hr05-perrun-economy
description: HR05 — perRunEconomy pure projection fans HR04 replayEconomy per AgentRun; /agents « Compression / économie » section; verified-green.
metadata:
  type: project
---

HR05 adds `perRunEconomy` to `front/web/lib/context-compressor.ts` — a pure projection
(`RunPrompts → PerRunEconomy`) that fans the HR04 `replayEconomy` twin per run + aggregate
(tokens before/after per run, `allVerdictsSame`, `capRaised:false` per row). It adds NO new
compression logic — only maps replayEconomy over the runs. See [[hr04-loop-compression]].

- Mirror: `lib/context-compressor.test.ts` (fast-check/vitest), HR05 describe = 2 tests
  (per-run report coherent + determinism `perRunEconomy(RUNS) deepEqual perRunEconomy(RUNS)`).
  14/14 vitest green.
- UI: `/agents` « Compression / économie » section in `components/AgentsPanel.tsx`
  (`data-testid=compression-economy`), action-capable button → `perRunEconomy`, table one-row-per-run
  (`data-before/data-after/data-cap-raised=false`) + aggregate (`data-total-before/after`,
  `data-all-invariant`). Themed (tokens, no hex) ADR 0010, bilingual fr/en ADR 0011 (economy* keys
  line ~2501 both messages files).
- e2e: HR05 describe in `tests/e2e/agents.spec.ts` (2 tests: section present + read-only-until-click;
  measure renders before>after per run + cap-never-raised + aggregate).
- Docs: `.aidos-docs/steps/concept|internals/hr05-compression-economy.mdx` (3 layers), registered
  docs.json line ~243, mint validate clean, pushed origin/main (4252ec8).
- Wall: read-only pure projection, writes no truth. Determinism-first respected (pure fn, not agent).
- OpenQuestions (do NOT block): linear MCP unauthenticated (best-effort §11); demo RunPrompts not
  live AgentRun transcripts (provider wiring BA17 forward-dep). Verified-green.
