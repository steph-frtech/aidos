---
name: ce05-reuse-router
description: CE05 closes the capitalisation loop — pure name-match Reuse router over a declared corpus; verified-green
metadata:
  type: project
---

CE05 = the REUSE ROUTER that CLOSES the §24 capitalisation loop (CE03 captures → CE04 expands → CE05 reuses on the next similar goal).

- **Core** `back/runtime/compound/reuse.go`: pure/total `Reuse(Corpus, NextGoal)→(ReusePlan,error)`. Routing is a NAME MATCH (procedural precedence over behavior when a name is in both), declared costs `DeriveCost=80`/`ReplayCost=20`. Imports only `errors` — wall is STRUCTURAL (no SQL, no truth-write); `WroteKernel` ALWAYS false. Mirrors S33 MatchRole applied to capitalisation.
- **Payoff/frontier:** SIMILAR goal (8 of 9 units shared) → EffortAfter<EffortBefore; DISSIMILAR → equal (anti-false-positive, no fabricated reuse). Behavior reuse carries `ViaWall=true` (freeze still idée→miroir→/goal); procedural recall below the line.
- **Mirrors:** `reuse_fixture_test.go` (RED-first, pins 5P/3B/1F + wall + ordering) + `reuse_property_test.go` (rapid: determinism via reflect.DeepEqual + wall + conservation reused+fresh==|required| + payoff/frontier monotone). TS twin in growing `compound.ts` (now 5 steps' twins CE01-CE05), faithful — `lib/compound.test.ts` 25 vitest green.
- **UI:** action-capable `/agents` « Compounding » panel (CompoundingSection.tsx) runs the TS twin on screen, similar/dissimilar toggle, renders per-unit routing + token delta; 19 `compoundingSection` i18n keys present in BOTH fr+en. e2e 3/3 on :3000 (semantic: data-reused=8/0, data-saved>0/=0, via-le-mur badge, data-wrote-kernel=false).
- **Sensors all clean:** gofmt/vet/build, tsc --noEmit, biome, vitest 25, e2e 3/3. NO sensor scar this step (report's "clean" was accurate — unlike CE02/BA16).
- **Docs:** concept + internals (3 layers Impl·Méta·Méta-méta) in `.aidos-docs/steps/`, 2 docs.json refs, mint validate success, commit d2dfdb2 pushed (main==origin/main).
- **OQs (not residual):** OQ-CE05-linear (linear-server MCP unauth, can't move issue — §11 best-effort, non-blocking); OQ-CE05-mintlify-index (live search index lags push by minutes — repo is source of truth, validate clean).

Verdict: verified-green.
