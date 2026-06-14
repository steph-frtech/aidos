---
status: accepted
---

# Reuse mature libraries inside the DSL-as-AST architecture (don't hand-roll evaluators/runners/codegen)

The kernel stores behaviour and contracts as **content-addressed ASTs in Postgres** (the source — untouchable, ADR 0004): the truth must be queryable, hashable, append-only data behind the wall, never a `.xstate`/`.linkml` file on disk. That source stays bespoke to KRD. But the **evaluation, execution, and code-generation** of those ASTs must **reuse mature libraries** rather than hand-rolled engines — the project mandate is *never reinvent the wheel; the implementation is to be reused (May 2026 tools)*.

Concretely:

- **Expr DSL evaluation** (`visible_when`, `enabled_when`, policy comparisons, S08) → compile our AST to a vetted Go expression engine — **CEL (`cel-go`)** or **`expr-lang/expr`** — instead of writing an evaluator. We own the AST; the engine evaluates it.
- **Operation DSL fixtures** (`state → cmd → events`, N2, S10) → execute/check them with an existing statechart / state-machine test library; XState stays **client-only in Next**. We own only the **step interpreter** (validate/authorize/read/mutate/return) — the KRD-specific core.
- **Emission** (entity → Go/DDL/TS, S34/S35) → build on **sqlc** + templates, never a from-scratch codegen engine.

## Considered Options

- **Hand-roll everything** (custom expr evaluator, custom statechart runner, custom codegen). Rejected: reinvents mature, well-tested wheels, multiplying our own bug surface on exactly the parts that are commodity.
- **Use XState / LinkML as the *source* of truth.** Rejected: the truth must live in Postgres as content-addressed ASTs governed by the wall and per-Layer versioning; a JS statechart or a `.linkml` file on disk cannot be the source without breaking the wall and the version-by-hash model.
- **AST-in-Postgres as source, mature libs for eval/exec/codegen (chosen).** Keeps the KRD-specific value (truth-as-data, the wall, the mirror gate) and reuses commodity engines for the commodity work.

## Consequences

- **S08 (Expr) and S10 (Operation)** gain a dependency on a vetted Go expression engine (CEL or expr-lang) and a statechart/runner lib; only the Operation step-interpreter is ours.
- **S34/S35 (emitters)** build on sqlc + templates.
- Less bespoke code, smaller bug surface; the AST stays the portable source, so the eval/exec library is **swappable** (a `replaceable` implementation detail under a stable AST contract).
- The per-step tool search (CLAUDE.md §6) picks the simplest current (May 2026) option for these within the slot, recording the pick.

## Addendum — 2026-06-14

The Expr evaluation slot did **not** end up reusing CEL / expr-lang. `back/kernel/expr/expr.go` is a **bespoke, closed-catalogue interpreter**, hand-rolled **deliberately** — the file says so verbatim: *"usually reuses a mature lib (CEL / expr-lang). Here we DELIBERATELY hand-roll a…"*. The reason is KRD-conformant: a general expression engine would expose arbitrary free-code (calls, lambdas, undeclared access) — a **forbidden escape hatch through the wall** (KRD §24.5). The operator/function catalogue is frozen and declared; the AST stays the content-addressed source; same inputs ⇒ same `Value`, with no real clock/RNG inside `Eval`. This is a **deliberate exception to this ADR's "reuse" choice for the Expr slot only** (Operation step-execution, the emitters, and sqlc still reuse mature libs). That divergence was carried in code as a *"No new ADR"* — a gap against the frozen-stack process (ADR 0003: a deviation from a slot is recorded by an ADR). This addendum **closes that gap** by recording the bespoke Expr interpreter as the deliberate, declared decision it always was. The code is already green and conformant; nothing changes in the implementation.
