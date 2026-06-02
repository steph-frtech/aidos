---
name: project-s13-blockreason
description: S13 verified-green — shared actionable BlockReason package + `aidos explain` CLI; read-only /why-blocked panel; S04 fold-in deferred as ChangeSet OpenQuestion
metadata:
  type: project
---

S13 makes every KRD refusal actionable. Verified green.

**Shape:** `back/runtime/blockreason/blockreason.go` — closed Code enum (MISSING_MIRROR, MISSING_AUTHORITY, OUT_OF_SCOPE + inherited AGENT_WRITE_ABOVE_WATERLINE), `Severity`(blocking), pure `For`/`Lookup`/`Render`/`Codes`. Each code maps to a non-empty `how_to_fix` (KRD §44.5 — "un mur sans BlockReason devient une prison"). `aidos explain <CODE>` renders it; unknown code → exit 2 listing known codes (never a silent prison); no-arg falls back to S03 contract.

**Mirrors:** Godog journey (tests/runtime/blockreason_explain.feature, Scenario Outline over 3 codes + targeted fix-token + unknown-code-exits-2) GREEN; rapid property (prison-forbidding invariant: every code non-empty severity+explanation+≥1 fix; Render round-trips; For deterministic — the reproducibility mirror) GREEN; Vitest front projection lib/why-blocked.test.ts 8/8.

**UI:** read-only /why-blocked panel (code switcher) — design tokens (primary/border/destructive, no hardcoded zinc/hex), bilingual. ui-completeness VACUOUS by design: a BlockReason is *produced* at refusal sites that already exist (the wall etc.); this panel is descriptive, erects no wall, has no headless capability. Playwright 4/4 (route served on :3000, not :3100 for S13). biome clean (fixed role=group→fieldset).

**Determinism-first:** For/Render pure total functions, no clock/rng/I/O; rapid property IS the reproducibility mirror. CLI and screen share one declared registry (Go reasons map / TS BLOCK_REASONS). No LLM in loop.

**Forward-dep OpenQuestions (non-blocking, by-design):** OQ-S13-scope (OUT_OF_SCOPE names role/owner generically; TruthScope record at S14); OQ-S13-fetch (live-block-fetch MCP later); OQ-S13-fold-s04 (S04's wall still declares its own BlockReason struct locally — folding it to import this package is a change to S04's interface needing a ChangeSet+SemanticDiff, documented at docs/plan/S13-changeset-s04-foldin.md, NOT a silent rewrite per §9). Linear AID-35 Done.
