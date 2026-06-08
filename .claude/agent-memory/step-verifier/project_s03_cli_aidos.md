---
name: s03-cli-aidos
description: S03 verification — aidos CLI tracer-bullet entrypoint (check/impact/stable/diff/explain) deterministic print-only stub + /cli panel + Godog journey
metadata:
  type: project
---

S03 = `aidos` CLI tracer-bullet entrypoint. Five core verbs (check/impact/stable/diff/explain). `Run(args, stdout)→int` PURE dispatcher (no clock/rng/global/env-order) = byte-identical output; exit 0 known verb, 2 unknown, 1 breach (check). Contracts() = static hand-written registry (contract.go), single source for both binary help and /cli projection.

Done-criteria (all met): `check|impact|stable|diff|explain` run deterministically + exit 0 + stable across runs (verified built binary twice each, byte-identical), covered by Godog journey cli_aidos.feature (5 scenarios / 20 steps GREEN uncached -count=1 TestAidosCLIBDD).

NOTE: build reached S61, so commands now route to later-step real behaviour on no-operand path (check→runCheck S45, explain→runExplain S13, diff→runDiff S21, impact→runImpact S22, stable→runStable S23) — STILL exit 0 deterministically, done-crit unaffected. Cosmetic owner-label drift: Go contract.go diff ownedBy "S21 (SemanticDiff)" vs TS lib/cli.ts "S24 (Version DAG)/SemanticDiff" + page.tsx comment "diff→S24" — both name the SemanticDiff lineage, NOT a done-criterion gap (left as-is).

Sensors: go build/gofmt -l/go vet clean; go test -count=1 ./cmd/aidos GREEN 0.021s. Front tsc rc=0, biome clean 4 files, vitest lib/cli.test.ts 5/5. i18n 3441==3441 zero orphans (cli ns present incl tutorial/example).

WALL: grep INSERT/kernel./mirrors./pgx/database-sql in contract.go/main.go/app/cli/*/lib/cli.ts = ZERO (comments only). /cli read-only Server Component renders cliContracts() no I/O — ui-completeness vacuously satisfied (print-only stub binds NO backend capability = no headless capability hidden). determinism-first: contracts static constants, dispatcher pure, reproducibility mirror contract_property_test.go.

Docs: concept+internals s03-cli-aidos.mdx exist, registered docs.json:73-74, internals 3 layers (Implémentation:11/Méta:59/Méta-méta:90), mint validate PASS, HEAD==origin d5c9a0b tree-clean. e2e tests/e2e/cli.spec.ts 74 lines (5 cards+contract block+tutorial/example).

OQ (by design, non-blocking): commands print-only stub→real behaviour at owning later steps; Linear MCP unauth this session. verified-green ZERO corrections.
