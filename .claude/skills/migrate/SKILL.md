---
name: migrate
description: Produce an expand-contract, forward-only Postgres migration (Atlas) projected from an entity change, gated by DataTruthScope. Use whenever an entity AST changes shape and the data already in Postgres must move with it, when a change has historical impact (touches existing/historical records), or when someone says "migrate the schema", "change the table", "backfill", or "what does this do to old data?".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# migrate (KRD gesture)

## Purpose

Turn an **entity change** into a **forward-only, expand-contract** Atlas migration on Postgres — projected from the entity AST, never hand-coded against the truth. The migration is gated by the change's **DataTruthScope** (KRD §44.3): code truth changing does **not** automatically change the truth of data already produced, so any change that reaches `existing_records` or `historical_records` **requires a declared migration** with `preserve_old_truth`. Expand-contract keeps every step non-destructive (CLAUDE.md §9): add the new shape, backfill, dual-read/write, contract only once nothing reads the old shape — head mutable, history append-only.

## When to use

- Step loop point: an entity source (N3) changed shape and the `db` projection must follow (PLAN.md S37).
- A `SemanticDiff` reports a change whose blast radius includes data already in Postgres (`existing_records` / `historical_records`).
- Someone proposes "just alter the column" — you must decide whether it has historical impact and therefore demands a declared migration, not a silent ALTER.

## Inputs

- The **entity AST** (before/after) being changed — **read from the base** (`store`), never invented.
- The entity's **DataTruthScope** declaration (KRD §44.3): `applies_to` ⊆ {`new_records`, `existing_records`, `historical_records`}, `migration.strategy` ∈ {`expand_contract`, `backfill`, `dual_read`, `dual_write`}, `audit.preserve_old_truth`.
- The `changesetId` (DRAFT) carrying the entity change, and its `SemanticDiff` blast radius.
- `CONTEXT-MAP.md` + subsystem `CONTEXT.md` for the glossary; `docs/adr/0003-frozen-stack.md` (Atlas slot, `replaceable`).

## Outputs

- One **Atlas migration** under `back/migrations/` — declarative, **expand-contract, forward-only, append-only**: it ADDs the new shape and backfills; it never drops or rewrites a prior column/table/GRANT in the same step (the contract phase is its own later, gated step once the old shape is unread).
- The migration **projected from the entity AST** (fed via the entity emitter's `EmitDDL`, S35), not authored by hand against truth.
- A recorded **DataTruthScope** decision on the `changeset`: what the new truth does to historical data, with `preserve_old_truth` evidence.
- A passing migration run on a **real Postgres via Testcontainers** proving **no data loss** (the mirror).
- Zero or more **OpenQuestion** records for every undeclared scope, strategy, or untraced rule.

## BDD / mirror required before use

This gesture changes data shape — it must be proven before it runs (Mandat A). Before authoring the migration:

- A **mirror is red first**: a Godog/fixture acceptance that the migration applies on a seeded real Postgres (Testcontainers) and that prior rows survive — *no data loss, old truth preserved* — plus, where the strategy implies an invariant (e.g. *every existing_record keeps a readable value through expand-contract*), a **rapid** property mirror. `red → green → refactor`.
- The migration's **fault-injection test**: inject a destructive (drop/rewrite-in-place) migration and assert the gate goes red; remove the DataTruthScope declaration on a change that touches `existing_records` and assert it is blocked (historical impact without a declared migration is a monster).

## Steps

1. **Read the entity change** (`store`): the before/after AST for `changesetId`. Resolve terms against `CONTEXT-MAP.md`. Undefined term → OpenQuestion, never guess.
2. **Read the DataTruthScope** (KRD §44.3). Decide the **historical impact**: does `applies_to` reach `existing_records` or `historical_records`? If yes, a declared migration is **required**; if the declaration is missing → OpenQuestion + block (do not invent a strategy).
3. **Pick the strategy from the declaration** — `expand_contract` (default), `backfill`, `dual_read`, or `dual_write`. Do not choose a strategy the scope did not declare.
4. **Project the migration from the entity AST** via the entity emitter (`EmitDDL`, S35) → feed to Atlas. Never hand-write DDL against the truth shape; the migration is a projection.
5. **Shape it expand-contract / forward-only**: ADD new columns/tables + backfill (and dual-read/write if declared) in *this* migration; leave the destructive contract (drop old) to a later gated step once nothing reads the old shape. Never `DROP`/in-place-`ALTER` that loses data here (§9).
6. **Prove it green**: apply on a seeded real Postgres (Testcontainers); assert prior rows survive and `preserve_old_truth` holds. The red mirror must turn green for the right reason.
7. **Record the DataTruthScope decision** on the `changeset` via the changeset MCP (a recorded decision, not a direct truth write). Attach all OpenQuestions.
8. **Hand off**: green migration + recorded scope → the step's stable phase; `/diagnose` any failing sensor before finishing.

## Stop conditions

- **Done is computed, not declared:** the migration is **green on a real Postgres (Testcontainers) with no data loss**, it is **expand-contract / forward-only / append-only**, and its DataTruthScope decision is recorded.
- A change that touches `existing_records`/`historical_records` **without** a declared migration is **blocked** — never let it through.
- The migration is **projected from the entity AST**, not hand-authored against truth.
- No destructive step (drop/in-place rewrite that loses data) ships in the expand phase; no prior column/table/GRANT is altered or dropped here.
- Every gap (missing scope, undeclared strategy, untraceable rule) is an OpenQuestion.

## Failure modes

- **Silent ALTER.** Rewriting a column in place because "it's just a rename" — destroys historical truth. Expand-contract, forward-only (§9).
- **Undeclared historical impact.** A change reaching `existing_records` with no DataTruthScope → you invent `migration.strategy: backfill` to proceed. Forbidden: leave it OpenQuestion + block.
- **Hand-coding DDL against truth.** Authoring the migration by reading the table shape instead of projecting from the entity AST → the projection and truth drift. Emit from the source.
- **Contract-too-early.** Dropping the old column in the same migration that adds the new one, before readers move → data loss. Contract is a separate later gated step.
- **No-loss theatre.** Claiming "no data loss" without running it on a seeded real Postgres. The proof is the Testcontainers run, not the assertion.
- **Strategy-swap to dodge proof.** Calling a `dual_write` a `backfill` to skip the dual-path mirror. Pick by the declaration.
- **Wall breach.** Writing the migration result straight into `kernel`/`mirrors`/`fitness`. The migration lives in `back/migrations/`; the scope decision goes on the `changeset` via MCP.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness`; the migration belongs in `back/migrations/`, the decision on the `changeset` via MCP.
- `PostKernelChange` — fires on apply; uses the SemanticDiff blast radius to know the migration must run and re-prove.
- `Stop` (completeness) — blocks finish if a data-shape change touches historical records without a declared, proven migration, or if the migration is left red.
- `PostToolUse` (sensors) — must stay green at each diff (the migration runner among them).

## Related MCP tools

- **store** — read the before/after entity AST and the DataTruthScope declaration (read-only); confirm the target exists.
- **changeset** — record the DataTruthScope decision (strategy, `applies_to`, `preserve_old_truth`) as an append-only decision on the DRAFT.
- **mirror-runner** — run the migration mirror (Godog/fixture + rapid property) against a real Postgres via Testcontainers; confirm red → green.
- **dag** — locate the change in the phase/changeset graph; confirm the expand-contract path is append-only (no destructive head move).

## Workbench visualization

Next route under `front/web/app/` (the migration / DataTruthScope panel): one entity change per card showing the `applies_to` scope, the chosen `migration.strategy`, the expand-contract steps (add → backfill → [contract, later]), the Testcontainers no-data-loss verdict, and its OpenQuestions. Add/extend the route's Playwright e2e (never touch existing routes): assert a change touching `historical_records` renders a required-migration badge and that a destructive shape renders blocked, not applied.

## Honesty rules

Never invent a `target`, a `targetId`, a `migration.strategy`, or a business rule to make a migration proceed; every gap — undeclared DataTruthScope, unknown historical impact, untraceable backfill rule, undecidable strategy — becomes an **OpenQuestion** (an idea/provenance entry), never a guess, and a change with historical impact and no declared migration is never applied from this gesture.
