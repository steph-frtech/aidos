---
name: s45-lawcoverage
description: S45 aidos check law-coverage harness — closed 11-law registry (10 §82.1 + §29) each detector REUSING the prior step's authoritative pure fn, 1-law-1-red-1-green matrix; verified-green
metadata:
  type: project
---

S45 = the `aidos check` law-coverage compiler (KRD §82.1 keystone "aucun concept n'existe s'il n'est pas vérifiable par krd check").

- **Closed registry** `back/cmd/aidos/lawcoverage/lawcoverage.go`: exactly the ten §82.1 laws + the §29 completeness law. `TestProp_ExpectedLawSet` pins the EXACT named set (not count-only) — so the assert-semantics scar is covered.
- **No invented detector (the wall):** each `Law.Detect` REUSES the prior-step authoritative pure fn — truthtyping.Classify (S14), records.RequiredTestKinds/ComputeCompleteness (S06), scope.IsEmpty/IsGlobal (S15/S08), authority.Decide (S16), completeness.Gate (S06/S12). The phase/composes/mutation/memory/context detectors consume a fragment-carried verdict (the catalogue precedent) — that store-query feed is **OQ-S45-1, a by-design forward dependency on S02/S24**, NOT a residual issue.
- **Matrix** `matrix.go`: one Cell per law = 1 red + 1 green fragment. `TestFixture_EachCheckLaw_RedThenGreen` proves red→breach+exit!=0 / demo→green per check-owned law; the 3 non-check laws (phase=stable, diff, explain) reached through their owning verbs in `TestFixture_StableDiffExplainCoverTheirLaws`.
- **Front** `lib/law-coverage.ts` = byte-mirror TS twin (same codes/verbs); `CheckPanel.tsx` is action-capable (runs demo + per-law red/green from screen). Read-only against truth (verdict computed, fix via /goal). ui-completeness holds.
- **Verified green:** go build/vet/gofmt clean; cmd/aidos tests 10/10 fresh; full back suite no FAIL; tsc clean; vitest 364/364; biome clean; Playwright check.spec 4/4 on a fresh server (PLAYWRIGHT_WEB_PORT=3199 — :3100 was a stale 404); docs s45 concept+internals (3 layers) registered, mint validate passes, pushed (95e1502, main in sync).
- Linear MCP unauthenticated (OAuth) — S45 issue → Done deferred to interactive session = OpenQuestion, not a fail.
