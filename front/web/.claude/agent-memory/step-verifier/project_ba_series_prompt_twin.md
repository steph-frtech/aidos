---
name: ba-series-prompt-twin
description: BA-series (agent-layer) steps ship a Go pure function + a byte-for-byte TS twin in front/web/lib/agentlayer.ts; verify twins match and the /agents panel control executes them.
metadata:
  type: project
---

The BA0x steps (agent-as-governed-layer, route `/agents`) each add a deterministic pure function in `back/runtime/agentimpl/` AND a byte-for-byte TypeScript twin in `front/web/lib/agentlayer.ts`. BA04 = `AssembleSystemPrompt` (Go) / `assembleSystemPrompt` (TS).

**Why:** determinism-first (CLAUDE.md §6/§8) requires the twin to mirror the Go verdict-for-verdict so the UI shows COMPUTED results, not a re-implemented prompt. A drift between Go template prose and TS template prose is the likeliest defect.

**How to apply when verifying a BA step:**
- The reproducibility mirror is split: Go `*_property_test.go` + `*_fixture_test.go` (golden in `testdata/`), front `lib/agentlayer.test.ts` (one Vitest file, cumulative count — BA04 brought it to 42).
- The e2e is the REPO-ROOT `tests/e2e/agents.spec.ts` (NOT `front/web/tests/`), run with `npx playwright test tests/e2e/agents.spec.ts` from repo root. Filter BA04 with `-g "SystemPrompt|Assemble"`.
- The panel control must EXECUTE the pure fn (run twice + perturbed) and surface byte-stable / no-leak / wall badges via data-attributes — `AgentsPanel.tsx` `onAssemblePrompt`. This is the ui-completeness proof.
- `back/kernel/agentlayer/` is a Go CODE package (DSL AST source), NOT the `kernel` Postgres truth schema — writing it is allowed; the wall (§2) only forbids the Postgres kernel/mirrors/fitness schemas.
- i18n: every new panel label needs a key in BOTH messages/fr.json and messages/en.json — grep-count both. See [[i18n-keys-missing]].
