# Stop:besoin-gate — the compound-du-besoin descent gate (EL11)

A **separate** Go binary from `back/hooks/stop` (the kernel-completeness gate that reads the
`mirrors` Postgres cut). This hook gates the **compound-du-besoin** sessions: at `Stop` it
refuses to let a level be **descended** (or an Idea promoted) while the current rung of an
**open** `BesoinGraph` is not yet right-sized **OR** carries a need-completeness monster.

## The OU, not the ET

The gate **blocks** the descent iff, for the **current** level, **EITHER**:

1. `¬CanDescend(graph, level, meta).Enough` — EL07: the rung is not right-sized (a missing
   metadata, a vacant body, an unresolved ref, an un-narrowed OptionSpace), **OR**
2. `BesoinCompleteness(graph, mirrors, metadata)` finds a **monster at the current level** —
   EL09: a `resolved` rung without (or with a wrong-form) its level-mirror, an orphan mirror,
   or vanished metadata.

The two disjuncts are **independent**: a level can be `not_enough` **without** a monster and
still be refused; a monster blocks even when the rung is otherwise `enough`. This is the **OU**,
not the ET — each failure mode blocks on its own.

## Scoped, never over-firing (§5)

The hook fires **only** on sessions that carry an **open** `BesoinGraph` — the Stop event names
a `besoin` block (`project` + current `level` + the graph cut + metadata + the declared
level-mirror set). A session **without** a `besoin` block (a plain kernel session) is a
**no-op**: the hook allows the Stop and writes nothing. A hook that fired on every session would
be the dead/over-firing hook.

## Event shape

```json
{
  "ref": "turn-42",
  "besoin": {
    "project": "demo",
    "level": "product",
    "graph": { "project": "demo", "nodes": [ … ], "edges": [ … ] },
    "metadata": { "truth_kind": "behavioral", "verifiability": "deterministic", "scope": { "region": "*" } },
    "metadata_by_level": { "product": { … } },
    "mirrors": [ { "reflects": "product", "form": "gherkin-n0" } ]
  }
}
```

- A **no `besoin`** body (or an empty body) → no-op (allow).
- A **malformed** `besoin` body → fail-**closed** (block) with an actionable `BlockReason`
  (KRD §82 `.passthrough()` — an unverifiable gate never silently passes).

## Output / exit codes

- `0` = allow the Stop (no-op, or the rung is right-sized **and** monster-free).
- `2` = block the Stop; the actionable `BlockReason` list is written to stdout. On a block the
  gate appends the declared **EL11 how_to_fix** umbrella path:
  `declare_missing_metadata`, `resolve_ref`, `state_invariant_as_forall`, `assign_authority`,
  `narrow_option_space`.

## Dispatch / order with the kernel Stop

This binary is the **besoin** gate; `back/hooks/stop` is the **kernel-completeness** gate. They
are distinct processes wired on the same `Stop` phase: the harness runs the kernel gate over the
`mirrors` cut and this gate over the besoin event. Order is **independent** — each fails closed on
its own zone; neither relaxes the other.

## The wall (CLAUDE.md §2)

The hook **reinforces** the wall, never removes a guard (meta-loop §5): it **reads** the
`BesoinGraph` carried in the event (above the line — a need, not a truth) and **writes nothing**
(no kernel, no mirror, no besoin row). Its only output is the `BlockReason`.

## Determinism-first (§6/§8)

The verdict is **computed** by the pure functions `CanDescend` (EL07) + `BesoinCompleteness`
(EL09), never an LLM judgment. The reproducibility mirror (`gate_property_test.go`) pins
same-event → same-decision.

## Fault-injection (the mirror)

`gate_bdd_test.go` proves the RED-per-disjunct:

1. **suppress the truth_kind** of a level being descended → blocks (`¬enough`);
2. a **not_enough** level **without** a monster → still blocks (the OU);
   plus a **monster without** not_enough → blocks (the OR's other half);
3. a session **without** a `BesoinGraph` → **no-op** (no over-firing).
