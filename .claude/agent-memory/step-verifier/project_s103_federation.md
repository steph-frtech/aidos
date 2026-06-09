---
name: s103-federation
description: S103 cross-cell federation COMPOSITION layer (§51) — verified green, zero corrections; wires S48/S49/S50 invariants onto real cells + red-wave
metadata:
  type: project
---

S103 = COMPOSITION layer (KRD §51, app-builder EPIC11) wiring S48 GlobalInvariant + S49 SagaInvariant + S50 TemporalInvariant onto REAL multiple cells (S100) + S22 runtime red-wave. **Invents NO new primitive — pure orchestration of frozen prior contracts.**

**back/runtime/federation/federation.go** — 3 PURE total deterministic fns, write NOTHING (the wall):
- `SagaOverCells(saga, fed, trace)→SagaRun`: REUSES cell.CheckCrossCellAccess (non-contracted pair→CROSS_CELL_NO_CONTRACT, AccessBlock+Leg=violated, no eval) then sagas.Evaluate (happy→LegHappy) else sagas.RunCompensation+re-Evaluate (satisfied→LegCompensated else LegViolated). `cell.Ref(saga.Participants[i].Cell)` conversion (sagas.CellRef is string-typed). Broken-leg trace=[payment_captured] only → RunCompensation compensates only payment leg (refundPayment@v3) + compensation_executed marker.
- `FanOut(policy, violatedCell, policyWaveID, []CellViolation)→[]CellRedWave`: REUSES gi.RedWave (reach=spanned cells) then for inReach∧Violates: redwave.Impact(bumped,edges,heads)+redwave.Enqueue(waveID). Non-violating spanned cell→Reddened=false empty Queue (§51 "cellules non affectées restent vertes"). Sorted by cell.
- `TemporalOverCells`: CheckCrossCellAccess then temporal.Evaluate (elapsed passed-in, no wall clock).
- `AffectedCells` projection (reddened cells, sorted).

**Reused symbols all verified-exist**: sagas.Evaluate:285/RunCompensation:365/OutcomeSatisfied/SagaOutcome/Compensation{Events,Trace}, gi.RedWave:290/Validate/ScopeFederationPolicy/BlastRadiusGlobal/AuthorityArchitectureOwner/CellRef, redwave.Impact:162/Enqueue:254/RedWorkItem.WaveID, cell.CheckCrossCellAccess:385/CodeCrossCellNoContract/Ref/Federation/Contract/BlockReason, temporal.Evaluate:368/Validate:256/VerdictHeld.

**Done-criteria BOTH RAN+GREEN**: fixture (happy→leg=happy; broken-leg→leg=compensated+refundPayment@v3+compensation_executed; non-contracted refused; fan-out per-cell order+payment reddened/shipping GREEN/affected=[order,payment]; temporal within-band held + non-contracted refused) + rapid property (SagaOverCells deterministic / broken-leg ALWAYS settles compensated-satisfied / FanOut non-violating-cell ALWAYS green + deterministic). go test federation+mcp green, gofmt/vet clean, broad go build exit0, all reused prior-green packages intact.

**MCP back/mcp/federation**: 3 PURE tools (saga_over_cells/fan_out/temporal_over_cells; affected_cells folded into fan_out output). READ-ONLY, write-NOTHING, wall-grep CLEAN (only comment matches "INSERT...below the waterline").

**TS twin lib/federation.ts**: faithful Go mirror (sagaOverCells/fanOut/affectedCells + DEMO fixtures), display-only, Go authoritative. vitest 7/7. Note: fanOut twin uses spannedCells param (= gi.RedWave reach precomputed) + synthesises queue row `${cell}::pii-aggregate@${waveID}` (display, not byte-pinned to Go RedWorkItem).

**/federation route**: action-capable useActionState, 2 controls (run-saga + break-leg toggle; run-fanout) → Server Actions over pure twin, wall-respected (comment documents S22 hook does INSERT). h1 t("title")="Composition des invariants de fédération"/"Composing federation invariants" matches e2e regex. All e2e testids present (run-saga/break-leg/saga-result/saga-leg/saga-outcome/saga-compensation/run-fanout/fanout-result/cell-status-*/fanout-affected). nav:160 /federation (after :159 /cell-federation). i18n fr4657==en4657 EXACT (federation ns 25==25). Playwright 4/4 RAN GREEN live:3000 route-200. tsc: only 1 PRE-EXISTING err lib/behavior-capture.test.ts 'Cannot find name Kind' (untracked S77, NOT S103). biome clean.

**Docs**: concept+internals s103-federation.mdx, 3 layers (Implémentation:9/Méta:45/Méta-méta:53), docs.json:273-274, mint validate PASS, HEAD 34f260f==origin/main.

**OQ by-design (NOT residual)**: (a) Linear MCP unauthenticated — S103 issue not movable programmatically (§11 best-effort). (b) S116 RGPD makes the 'tout PII oubliable' GlobalInvariant concrete (crypto-shredding) — S103 ships only the deterministic fan-out MECHANISM+proof, erasure business semantics deferred to S116 forward-dep.

**VERDICT: verified-green, ZERO corrections.**

PATTERN confirmed: composition-layer step REUSES prior pure fns verbatim — verify each reused symbol exists with the used signature (grep kernel pkgs) + that the NEW composition has its OWN fixture+property mirror; wall-grep on federation pkgs only matches doc-comments.
