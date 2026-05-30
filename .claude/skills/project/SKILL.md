---
name: project
description: Run a deterministic emitter (one per kind × target) to (re)generate a projection — Go structs (sqlc), Postgres DDL, TS types, or Workbench UI — from a kernel source. Use whenever a kernel entity/contract changed and its Go/DDL/TS/UI must be regenerated, when files under back/gen/ look stale or hand-edited, when a SemanticDiff says a projection must regenerate, or when someone asks to "emit", "codegen", "regenerate the types", "materialize the projection", or "rebuild gen/".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# project (KRD gesture)

A KRD gesture: take one **source** in the kernel (an entity / contract AST, content-addressed in Postgres) and run the **deterministic emitter** for one `(kind × target)` to (re)produce its **projection** in `back/gen/`. A projection is a regenerable *mirror implementation*, never the truth and never hand-edited (CLAUDE.md §9, ADR 0004). The emitter is a pure function of the source: same source in → byte-identical output out.

> The wall (CLAUDE.md §2): emitting **reads** the kernel/mirrors; it **writes only** `back/gen/` (and the materialized disk projection). It never writes the `kernel` / `mirrors` / `fitness` schemas. Changing *what* is emitted is a kernel change — `idea → mirror → /goal → human approval` — not an edit to the generated file.

## Purpose

Turn one frozen source into one downstream artifact, deterministically:

- pick the **kind** (entity / contract) and the **target** (`go` structs via sqlc · `ddl` Postgres · `ts` types · `ui` Workbench scaffold),
- run the **single emitter** for that `(kind × target)` against the source's content hash,
- write **byte-identical** output to `back/gen/<...>` (re-running with no source change is a no-op diff),
- never hand-touch the result, never invent a target or a field the source does not carry.

## When to use

- A kernel entity/contract just landed or changed, and its Go/DDL/TS/UI must be (re)generated.
- A `semantic-diff` blast radius lists a projection that must regenerate.
- `back/gen/` files drift, look stale, or were hand-edited (the anti-monster sweep: regenerate, never patch by hand).
- Step loop point 7/9: a new entity needs its DDL + types + a Workbench scaffold before the UI route exists.
- Someone says "emit", "codegen", "regenerate the types", "rebuild gen/", "materialize the projection".

## Inputs

- `sourceId` — the kernel entity/contract being projected, **read from the base, never invented**.
- `sourceHash` — the content-address (version = hash) of that source; the emit is pinned to it.
- `kind` ∈ { `entity`, `contract` } and `target` ∈ { `go`, `ddl`, `ts`, `ui` } — pick by what the consumer needs.
- The emitter for that `(kind × target)` (under `back/runtime/<emit step>/`, built on sqlc + templates per ADR 0007).
- `CONTEXT-MAP.md` + the subsystem `CONTEXT.md` for the ubiquitous language (entity field names, target meaning).

## Outputs

- One regenerated projection in `back/gen/<target>/...` (Go structs, Postgres DDL, TS types, or a Workbench UI scaffold), **byte-identical** for a given `(sourceHash, kind, target)`.
- A recorded emit (which `sourceId@sourceHash` produced which file, by which emitter) — provenance, not a kernel write.
- Zero or more **OpenQuestion** records for any unknown source, target, or field the source does not carry.

## Targets (one emitter each — pick by the consumer, never invent one)

- **`go`** — Go structs via **sqlc** (+ pgx types). For the back engine's typed DB access. The single source → Go, never double-typed.
- **`ddl`** — **Postgres DDL** for the entity. Feeds Atlas expand-contract migrations (the migration itself is a separate gesture).
- **`ts`** — **TypeScript types** for the Workbench. Same source → TS, so Go and TS never drift.
- **`ui`** — a **Workbench scaffold** (a Next route skeleton under `front/web/app/<route>/`) for the entity; the human/agent fleshes the panel, never the generated skeleton.

> One source → many targets, but **one emitter per `(kind × target)`**. If no emitter exists for the pair, that is an OpenQuestion / a new step — do not improvise codegen.

## BDD / mirror required before use

This gesture **runs** an emitter; it writes no truth, so it needs no truth-test of its own. But the emitter it runs must already be proven:

- Each emitter ships with a **red mirror first** (rapid property in Go): the load-bearing invariant is **determinism / idempotence** — *emitting the same `(sourceId@sourceHash, kind, target)` twice yields byte-identical output*, and *re-emitting an unchanged source produces an empty diff*. `red → green → refactor`.
- A **golden** mirror: a known source emits a known, checked-in expected artifact (the byte-for-byte oracle).
- Its **fault-injection test**: perturb the source AST and assert the projection changes (the emitter is not ignoring the source); hand-edit a `gen/` file and assert the sensor flags drift on the next emit.
- Running the emitter does **not** prove a behaviour — behaviour is proven by the entity/contract's own mirror, never by the generated code.

## Steps

1. **Resolve the source.** Confirm `sourceId` exists in the kernel and read its `sourceHash` (`store`, read-only). Absent or ambiguous → OpenQuestion; never manufacture a source or a field.
2. **Pick `(kind, target)`** by what the consumer needs (table above). No emitter for the pair → OpenQuestion / new step; do not hand-roll codegen.
3. **Run the single emitter** for that pair against `sourceId@sourceHash` (via the `store` / generator MCP, built on sqlc + templates). The output is a pure function of the source.
4. **Write to `back/gen/<target>/`** (or the Workbench scaffold route for `ui`). Treat the file as derived: overwrite wholesale, never merge by hand.
5. **Verify determinism.** Re-run the emitter; the diff must be **empty**. A non-empty re-emit diff means non-determinism (a bug in the emitter) or a hand-edit — stop and diagnose, do not paper over it.
6. **Run the consumer's sensors** at the diff (Go build / sqlc / `tsc` / route compile). They must stay green (PostToolUse).
7. **Record the emit** (`sourceId@sourceHash → file via emitter`) as provenance. For `ui`, leave the panel body to the human/agent; the e2e/Playwright is a separate gesture.

## Stop conditions

- **Done is computed, not declared:** the projection exists in `back/gen/`, a re-emit yields an **empty diff** (byte-identical), and the consumer's sensors are green.
- The output is pinned to a real `sourceId@sourceHash`; the `(kind, target)` has a real emitter.
- No `gen/` file was hand-edited; no source/field/target was invented; every gap is an OpenQuestion.
- Stop and refuse if the source cannot be confirmed in the base, or if no emitter exists for the pair.

## Failure modes

- **Hand-editing `gen/`.** The cardinal sin — generated files are derived (§9). A "quick fix" in `gen/` is a monster: change the source/emitter and regenerate, or it silently reappears on the next emit.
- **Non-deterministic emit.** Map ordering, timestamps, or `Math.random`-style nondeterminism in the emitter → re-emit diff is non-empty. Fix the emitter (deterministic ordering, no clock), never the artifact.
- **Inventing a target or a field.** Emitting a column/type the source AST does not carry → drift between truth and projection. Leave it as an OpenQuestion.
- **Improvised codegen.** Writing a one-off generator because no emitter exists for the pair. That is a new step (with its own red mirror), not a freehand script.
- **Treating the projection as the source.** Editing TS/DDL to "change the model". The model is the kernel entity; changing it is `idea → mirror → /goal`, never a `gen/` edit.
- **Wall breach.** Writing the kernel/mirrors/fitness schemas while "emitting". Emit reads truth and writes only `gen/`.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness`; the emit may write only `back/gen/` (+ the materialized disk projection).
- `PostKernelChange` — fires on an applied kernel change; uses the SemanticDiff blast radius to know which `(kind, target)` projections to re-emit.
- `PostToolUse` (sensors) — the gen-drift sensor (hand-edit detection) and the consumer build sensors must stay green at each diff.
- `Stop` (completeness) — blocks finish if a regenerated projection drifts from its source or a `gen/` file was hand-edited.

## Related MCP tools

- **store** — read the entity/contract AST and its `sourceHash` (read-only); confirm the source exists.
- **generator / emit** — run the deterministic emitter for the `(kind × target)` and write the projection to `back/gen/`.
- **context** — walk the ContextGraph to know which sources feed which targets and reuse decisions.
- **dag / changeset** — locate the source version; on a kernel change, scope the re-emit set from the recorded blast radius.

## Workbench visualization

Next route `front/web/app/projections/` (or the emit/codegen panel): one source per card showing its `sourceHash`, the `(kind × target)` emitters available, the path of each generated artifact under `back/gen/`, and a **drift / determinism** badge (green = re-emit is an empty diff, red = artifact diverges from source or was hand-edited). A Playwright e2e asserts that re-emitting an unchanged source shows an empty diff and that a hand-edited `gen/` file lights the drift badge red. Never touch existing routes.

## Honesty rules

Never invent a `target`, a `sourceId`, a `sourceHash`, or a field/business rule to make an emit succeed; if the source, its hash, an emitter for the pair, or a field is unknown, it becomes an **OpenQuestion** (an idea/provenance entry), never a guess written into `gen/` — and a generated file is never hand-edited to cover the gap.
