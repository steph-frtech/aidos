---
name: ba14-archfitness
description: BA14 turns determinism-first "one LLM function" prose into an ENFORCED arch-fitness rule (pure import-graph check), proven on the live module
metadata:
  type: project
---

BA14 = the depguard/go-arch-lint equivalent making "the LLM is the single gated exception" a build-time INVARIANT, not 25 repetitions of prose.

- Core: `CheckLLMIsolation(graph, policy) -> []Violation` — pure/total: every (pkg, import) where import matches an LLM-SDK prefix AND pkg is not an AllowedImporter (only `back/runtime/agentloop/provider*`). New code `LLM_SDK_IMPORT_OUTSIDE_PROVIDER`.
- `ScanModule(dir, modulePrefix)` builds the live graph via go/parser ImportsOnly, EXCLUDES `_test.go`/vendor/testdata, sorted/stable. The live-module test (TestCheckLLMIsolation_LiveModule_Holds / TestRun_LiveModule_Passes) proves the wall holds on disk, not just fixtures.
- **Why _test.go exclusion matters for verification:** the SDK prefixes appear as STRING LITERALS in DefaultPolicy() and in the test files (genPolicy/cleanGraph). A bare `grep -rl` for the SDK paths finds archfitness.go + test files — those are literals, NOT Go imports, so ScanModule (parses import blocks only) correctly does not flag them. Don't mistake the literal-bearing files for a leak; the live test is authoritative.
- provider/provider.go = the seam (Provider.Generate interface), NO real SDK wired yet — by-design forward-dependency (build-agent track hasn't bound one), OQ not residual. The rule pre-enforces so a future SDK can't leak.
- config_test.go pins arch-fitness.json ⟷ DefaultPolicy() parity (no double-typing).
- TS twin checkLlmIsolation verbatim; action-capable /agents llm-iso-run + llm-iso-fault toggle (fault sprinkles a 2nd SDK → red). e2e 50/50, vitest 91/91, tsc 0, mint validate ok, docs pushed (8f9037b).
- button-count SCAR: impl-viewer guard bumped 6→7 (cap/skill/path/hook/budget/arbiter + llm-iso). See [[project_ba10_mandatoryhook]].
- verified-green.
