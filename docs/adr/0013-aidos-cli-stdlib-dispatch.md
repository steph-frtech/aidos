# ADR 0013 — The `aidos` CLI uses stdlib dispatch, not a framework (yet)

- **Status:** Accepted
- **Date:** 2026-05-31
- **Step:** S03 (Runtime — `aidos` CLI stub)
- **Subsystem:** AIDOS Runtime (`back/cmd/aidos`)

## Contexte

S03 stands up the `aidos` CLI as a tracer-bullet: five core verbs
(`check / impact / stable / diff / explain`) that each print their declared
*contract* and exit `0`, deterministically. No truth is written, no Postgres is
touched — the commands declare a future contract and are wired, tested and
visualizable now. The CLI sits in the **frozen Go slot** (CLAUDE.md §3): the
question is only *which CLI shape within Go*, picked at step start, simplest-wins.

## Options weighed (≤ 3, per the per-step tool-search rule)

1. **`spf13/cobra`** — the conventional Go CLI framework: subcommands, flags,
   generated help, shell completion. Powerful, but a new dependency tree and
   ceremony (a `cobra.Command` per verb, `init()` registration) for a stub that
   only prints constants. Its generated help interleaves env-derived defaults,
   which adds determinism surface to guard.
2. **`urfave/cli`** — lighter than cobra, still a dependency and an app/command
   object model heavier than a five-string dispatch needs.
3. **stdlib `os.Args` + a `switch`** — zero new dependencies; a single pure
   `Run(args, stdout) int` total function; trivial to prove byte-deterministic.

## Décision

Use **stdlib dispatch**: a pure `Run([]string, io.Writer) int` over a declared
`Contracts()` registry, wired to `os.Args`/`os.Stdout` in `main`. No CLI
framework is added at S03.

This honours **reuse-don't-reinvent (ADR 0007)** read correctly: there is no wheel
to reuse for *printing five constants and exiting* — a framework would be *more*
code and *more* determinism surface, not less. It honours **determinism-first**
(CLAUDE.md §8): `Run` is a total function of its args with no clock/rng/global, so
the same args yield byte-identical stdout (pinned by `contract_property_test.go`).

## Conséquences

- **Reversible, by design.** When a verb gains real behaviour (flags, sub-args,
  completion — earliest at S13 `explain`, S22 `impact`), reassess cobra then with
  a follow-up ADR. The `Contracts()` registry + `Run` dispatcher are the seam: a
  framework can wrap them without rewriting the contract source of truth.
- **One source of truth for the command set.** `Contracts()` feeds both the binary
  (help + per-command contract) and the Workbench `/cli` projection, so they never
  diverge.
- **No new dependency** enters `go.mod` for the stub.

## Liens

- Plan: `docs/plan/S03-cli-aidos.md`
- Vocabulary: `back/runtime/CONTEXT.md` (KRDCompiler/`check`, SemanticDiff/`diff`,
  vague-de-rouge/`impact`, stable Phase/`stable`, BlockReason/`explain`)
- Builds on ADR 0003 (frozen stack — Go slot), ADR 0007 (reuse mature libs).
