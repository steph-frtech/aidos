---
name: s14-truthtyping
description: S14 truth-typing — pure Classify(TruthKind×VerifiabilityLevel)→Routing, allowed_mode declared table, non-verifiable→/spike; read-only /truth-typing (ui-completeness vacuous on write-path); verified-green
metadata:
  type: project
---

S14 types the true before the ratchet bites (KRD §13.4–13.5). Verified green.

- **Core:** `back/kernel/truthtyping/truthtyping.go` — pure total `Classify(Truth)(Routing,error)`. 7 TruthKinds (§13.4) + 5 VerifiabilityLevels (§13.5) + `allowedMode` DECLARED map (deterministic→kernel, statistical→experiment, delayed/unverifiable→spike, human_judged→manual_review). Rejects absent kind (`missing-truth-kind`) and out-of-enum kind (`unknown-truth-kind`) at the boundary. Admitted iff allowed_mode==kernel. No I/O/clock/rng.
- **S14-local BlockCodes are kebab-case and deliberately NOT in the closed runtime/blockreason.Code enum** (CLAUDE.md §9 — never invent members there). Correct call.
- **Mirrors:** Godog (4 scenarios incl. the literal "non-verifiable→/spike" done-criterion) + rapid (admission-gate, determinism, rejection-never-prison, exact cardinality 7/5) + Testcontainers migration roundtrip (3 tests: nullable expand-only, every enum accepted, out-of-enum rejected by CHECK) + TS repro mirror 10/10.
- **Migration** `kernel_truth_typing_baseline.sql` expand-only: two NULLABLE columns, each CHECK-pinned to exact enum, NO backfill / NO NOT NULL flip / NO new GRANT. Authored not applied by agent → wall holds.
- **UI** read-only `/truth-typing`: table runs the pure `classify` per row, badges KERNEL/`/SPIKE`/REJECTED. **ui-completeness vacuous on the write-path** (classifier is a verdict computation, nothing to write; truth-writes route propose→ChangeSet at a later step). e2e 5/5.
- **OpenQuestions (forward deps, NOT residual):** OQ-S14-fetch (live truth set via store-MCP later; demo data now); NOT NULL flip deferred to later changeset; /harvest is its own step.
- Pattern matches [[project_s02_content_address]] / [[project_s13_blockreason]] read-only-classifier kernel slices. See [[project_determinism_repro_mirror]].
- **Re-verified 2026-06-07 (build/s00-s47):** RE-RAN green — go test 7.4s (Godog 4 + rapid 4 + Testcontainers 3), vitest 10/10, tsc rc=0, biome clean, mint validate PASS, i18n 3663==3663 / truthTyping 20==20, nav:81. e2e row-filter labels ("mot de passe invalide"/"semble plus clair"/"claim non typé"/"vibes") all present in truth-typing-data.ts. Wall grep clean (zero front truth-write). Docs HEAD d5c9a0b clean+pushed. ZERO corrections, two runs concur.
- **THIRD re-verify 2026-06-07 18:08 (build/s00-s47):** fresh -count=1 go test 7.089s GREEN, gofmt -l/vet clean, vitest 10/10 (327ms), docs.json:97-98 both pages on disk, truthTyping i18n fr==en==20. Row testids live in components/TruthTypingTable.tsx (NOT page.tsx — page delegates to <TruthTypingTable>): truth-row/data-routing/data-code/kind-chip/level-chip/routing-badge/routing-reason all present, table runs classify+badgeVariant per row (computed not declared). page.tsx carries tutorial+example testids. ALL 4 e2e anchors resolve. ZERO corrections, three runs concur.
