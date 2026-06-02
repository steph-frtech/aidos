# GlobalInvariant fixture — `pii-forgettable-federation`

> mirrors schema · reflects: `kernel.global_invariant "pii-forgettable-federation"` · test_kind: fixture · cert_language: fixture · authority: above
>
> Materialized source of the GlobalInvariant fixture (KRD §49 / §49.1). Conceptually
> stored in the `mirrors` schema; persisted to Postgres at S06 (bootstrap exception).
> The runner is `back/kernel/globalinvariant/globalinvariant_fixture_test.go`.

A **GlobalInvariant** is a truth that spans **more than one cell** (bounded context),
distinct from the per-truth **TruthScope** (S15) that scopes a *single* truth's reach.
*Un invariant transverse est une exception coûteuse, pas le mode normal* (KRD §49.1) —
the bounded contexts stay the primary walls.

```
mirror reflects "pii-forgettable-federation" {
  global_invariant {
    name:              "pii-forgettable-federation"
    scope:             "federation_policy"
    cells:             [ checkout, profile, billing ]
    predicate:         "every_pii_aggregate_implements_forgettable"
    blast_radius:      "global"
    approval_required: "architecture_owner"
  }

  # the violation reddens EVERY cell in the invariant's reach, not just the violator
  given violation in cell "billing"
    -> red_wave reddens [ checkout, profile, billing ]
    -> red_wave is NOT limited to "billing" alone

  # a contract_pair invariant only reddens the pair (S19 weighted: load-bearing crosses)
  given global_invariant { scope: "contract_pair", cells: [ order, payment ], blast_radius: "bounded" }
    given violation in cell "order"
      -> red_wave reddens [ order, payment ]

  # THE approval done case — a global blast_radius needs the architecture_owner
  given admit { granted_approval: "cell_owner" }
    -> decision == "blocked"
    -> block_reason.code == "INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS"
    -> block_reason.how_to_fix contains "escalate_to_architecture_owner"

  given admit { granted_approval: "architecture_owner" }
    -> decision == "admitted"

  # a single-cell name on a federation_policy scope is not cross-cell — rejected at Validate
  given global_invariant { scope: "federation_policy", cells: [ billing ] }
    -> validate_error is non-empty
}
```
