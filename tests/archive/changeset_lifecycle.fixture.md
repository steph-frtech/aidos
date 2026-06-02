# Mirror — `changesets.changeset` "add-order-discount" (ChangeSet lifecycle)

- **reflects:** `changesets.changeset` ("add-order-discount")
- **test_kind:** `fixture`
- **cert_language:** `fixture`
- **liveness:** `live`
- **authority:** `above` — the lifecycle rule (an APPLIED ChangeSet is immutable; a revert is an
  append-only inverse ChangeSet; the commit is admitted only if the completeness law holds) is the
  **human's** truth (KRD §44, §98, §44.1), not the agent's.

> Conceptually stored in the `mirrors` Postgres schema; materialized to disk for the runner
> (bootstrap exception, CLAUDE.md §6 — `mirrors` is back-filled at S06). The Go interpreter is
> `back/archive/changeset/changeset_fixture_test.go`; this file is the **lien porteur** — if its
> intention disappears the test breaks (no silent rot into a monster).

## The envelope (KRD §98 "add order discount")

A ChangeSet is the atomic, reversible transactional **envelope** that moves from one stable phase
to the next, wrapping `spec_delta` (Kernel) and `mirror_delta` (Mirror) **together** in one body so
they can never drift. Its only statuses are `DRAFT | APPLIED | REVERTED` — there is **no FAILED**.

```
changeset "add order discount" {
  parent_phase: "phase-7"
  spec_delta:   <add Order.discount>          # Kernel plane
  mirror_delta: <Order.discount fixture>      # Mirror plane — together, atomic
}
```

## Rows — `state → command → events`

| # | given (state)                                                   | when (command)                  | then (events)        | resulting status / assertion |
|---|-----------------------------------------------------------------|---------------------------------|----------------------|------------------------------|
| A | no changeset                                                    | open{label, parent_phase}       | `[Opened]`           | status == DRAFT, applied_at == null |
| B | DRAFT {spec_delta:add Order.discount, mirror_delta:fixture}     | apply{}                         | `[Applied]`          | status == APPLIED, applied_at != null |
| C | DRAFT {spec_delta:add Order.discount, mirror_delta:**none**}    | apply{}                         | `[Blocked]`          | status stays DRAFT, block_reason.code == `INCOMPLETE_CHANGESET`, how_to_fix ∋ `add_mirror_for_spec_delta` *(no monster)* |
| D | APPLIED {…}                                                     | edit{spec_delta:anything}       | `[Blocked]`          | block_reason.code == `APPLIED_IS_IMMUTABLE` *(THE done case — APPLIED is immutable)* |
| E | APPLIED A {id:cs-A, spec_delta:add Order.discount}              | revert{of:cs-A}                 | `[Reverted]`         | new DRAFT B {reverts:cs-A, spec_delta:remove Order.discount}; **A stays APPLIED** (unchanged) |
| F | (then) DRAFT B {reverts:cs-A}                                   | apply{}                         | `[Applied]`          | B == APPLIED **and** A stamped REVERTED (not deleted) *(THE done case — revert is an append-only inverse ChangeSet)* |
| G | DRAFT {…}                                                       | discard{}                       | `[Discarded]`        | changeset removed *(never status "FAILED")* |

## Why each row is load-bearing

- **B vs C** is the completeness gate: a `spec_delta` **with** its `mirror_delta` applies; a
  `spec_delta` **without** its mirror is a monster and is blocked — `INCOMPLETE_CHANGESET`.
- **D** pins immutability: an `APPLIED` envelope can never be edited in place.
- **E + F** pin the inverse-revert semantics: revert builds a **new** inverse DRAFT (negated deltas,
  `reverts == source`) **without** mutating the source; applying the inverse stamps the source
  `REVERTED` — append-only, a revert creates information, it never destroys the source.
- **G** pins the closed status set: a hard-errored DRAFT is **discarded** (removed), never `FAILED`.
