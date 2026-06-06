---
name: gv06-sre-trust
description: GV06 SRE alignment (error-budget/circuit-breaker) + identity/trust chain as pure deterministic fns; verified-green
metadata:
  type: project
---

GV06 = SRE alignment + identity/trust BOM-cover, both PURE deterministic over the BA agentrun stream (CLAUDE.md §6/§8 determinism-first; never an "SRE agent").

- `back/runtime/governance/sre.go`: `EvaluateSRE(results,slo)` folds run Results into error-budget+breaker. Fail-closed: breaker OPEN iff errorRate>target; failure never improves budget; budget clamped [0,total]; target clamped [0,1]; empty window healthy. `BuildTrustChain(runs)` binds each run identity (agent+impl, BA26) to GV03 Merkle entry root by REUSING `agentrun.Append/Root` (single-sourced, no parallel hash). `SREDefaultSLO=0.25`.
- `sre_property_test.go`: RED-first (11 undefined-symbol compile errors confirmed), 4 rapid props: Reproducible, Failures_NeverHelp (monotone), BreakerMatchesSLO (bounds + open iff breach), TrustChainCoversLedger.
- DEMO_RUNS = green/still_red/blocked = 2 fail/3 = 66% > 25% SLO ⇒ breaker OPEN (e2e asserts /open|ouvert/i, semantic not count).
- TS twin `governance.ts` GV06 block: evaluateSRE/buildTrustChain/sreAudit; buildTrustChain reuses buildLedger/ledgerRoot (GV03 twin). Per-row prefix rebuild (O(n²) but tiny demo) ≡ Go's incremental Append — both deterministic, root single-sourced.
- Panel control `align-sre` EXECUTES sreAudit() (action-capable: sre-audit absent before click). 15 sre i18n keys all in fr+en AND all 15 wired in page.tsx.
- Wall respected: sre.go is read-only (no INSERT/UPDATE/kernel./mirrors./fitness.); agentrun reuse is pure read.

SCAR (recurring): executor report said "tsc --noEmit clean" but never ran biome — biome found 2 import-sort errors in governance.test.ts (GV06 appended imports out of order). Same "formatters clean" omission as BA16/BA20/BA21/BA22. Verifier MUST run `biome check` on every touched front file, not trust the report's tsc-only claim. Fixed with `biome check --write`; vitest 29/29 + tsc still green after.

Panel-route note: spec said panneau '/agents' but GV01-GV05 GovernancePanel lives at /governance (anti-overwrite §9 — kept cohesive). Audit fully action-capable there. Non-blocking.

Verified: Go gov+agentrun tests green, vet/gofmt clean; tsc + vitest 29/29; biome clean (after fix); governance e2e 18/18 on :3000 (15 prior + 3 GV06); self-test (sessionstart) green; docs 2 pages (3 layers) registered in docs.json, mint validate passed, commit aa9178b on origin/main. Linear MCP unauth = OQ. verified-green.
