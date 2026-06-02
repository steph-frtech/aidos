---
name: s03-cli-stub
description: S03 aidos CLI print-only stub — pure Run(args,stdout)->int dispatcher, determinism mirror, read-only /cli panel; verified-green pattern
metadata:
  type: project
---

S03 = the `aidos` CLI tracer-bullet entrypoint (`back/cmd/aidos/`): five core verbs (check/impact/stable/diff/explain) each print a DECLARED contract and exit 0; unknown verb exits 2.

**Why:** entrypoint must be wired/tested/visualizable before any verb has real behaviour (each verb's behaviour is owned by a later step: explain→S13, impact→S22, stable→S23, diff→S24, check→S45). The contract is declared (provenance), never invented — by-design forward dependency, OpenQuestion not a residual.

**How to apply:**
- Determinism-first satisfied: `Run(args []string, stdout io.Writer) int` is a pure total function (no clock/rng/env), reproducibility mirror `contract_property_test.go` (rapid) pins same-args → byte-identical stdout + same exit.
- Single source of truth for the verb registry: `contract.go` `contracts []Contract`; the front `lib/cli.ts` `CLI_CONTRACTS` mirrors it field-for-field (FR strings verbatim) so /cli shows exactly what the binary prints — re-verify they match if either changes.
- Wall: print-only stub writes no truth → `/cli` is read-only, ui-completeness vacuously satisfied (no headless capability because there is no backend op to bind). This is a VALID pass shape for stub steps, not a determinism/headless gap.
- Godog mirror lives as file `tests/runtime/cli_aidos.feature` (driven by `cli_bdd_test.go`), not yet in `mirrors` Postgres schema — back-filled at S06. File IS the red→green proof (bootstrap exception).
- Tool ADR: 0013 (stdlib flag dispatch over cobra for a print-only stub).
- Verified green 2026-05-31: gofmt/vet clean, go test cmd/aidos + kernel/records green, vitest 5/5, tsc 0, biome clean, i18n 200/200 parity, mint validate passed, docs pushed (c95f1a9 == origin/main), Linear AID-25 Done. See [[project_s02_content_address]].
