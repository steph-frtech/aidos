# Mirror · kernel.authority_graph "checkout-regulatory" · fixture (truth + approvals → decision)

- reflects: `kernel.authority_graph "checkout-regulatory"`
- test_kind: `fixture`
- cert_language: `fixture` (the AuthorityGraph `Decide` is interpreted in Go; the fixture IS the admission truth form)
- liveness: `live`
- authority: `above` (the admission rule — who approves/vetoes/escalates — is the human's, KRD §13.8: "toute vérité above-the-line doit avoir un propriétaire d'autorité explicite")

This is the materialized, human-readable form of the **AuthorityGraph admission** mirror;
the runnable mirror is `back/kernel/authority/authority_fixture_test.go`. Conceptually
this record lives in the `mirrors` Postgres schema and is persisted there at S06
(bootstrap exception — the schema predates this step; until the back-fill the file + the
Go test ARE the red→green proof — CLAUDE.md §6 bootstrap exception).

It is the **lien porteur**: the test loads `checkout-regulatory`; if the fixture
disappears, the test breaks (the mirror cannot silently rot into a monster).

The AuthorityGraph is the KRD §13.8 `checkout-regulatory` graph, **verbatim** — the agent
invents no role, no truth_kind, no decision branch:

```
mirror reflects "checkout-regulatory" {
  graph {
    domain: "checkout"
    truth_kind: "regulatory"          # one of the seven KRD §13.4 epistemic kinds
    approvers:  [ legal, product_owner ]
    veto:       [ security ]
    escalation: [ architecture_board ]
  }
}
```

An **admission decision** is exactly one of `admitted | blocked | escalated` (the §13.8
graph decides admission of a truth keyed by its `{domain, truth_kind}`). The precedence
(ADR 0014) is: **veto dominates** → any veto role present in the granted approvals ⇒
`blocked / VETOED`, regardless of approvers; else **all required approvers present** ⇒
`admitted`; else (no veto, ≥1 but not all approvers present) ⇒ `escalated` to the
escalation roles; else (no approver at all granted) ⇒ `blocked / MISSING_AUTHORITY_APPROVAL`.

## fixture rows: checkout-regulatory (truth {domain, truth_kind} + approvals [, veto] → decision)

| # | given truth | given approvals | given veto granted | then decision | block_reason.code | escalated_to |
|---|---|---|---|---|---|---|
| 1 | `{checkout, regulatory}` | `{}` (none) | — | `blocked` | `MISSING_AUTHORITY_APPROVAL` | — |
| 2 | `{checkout, regulatory}` | `{legal, product_owner}` | — | `admitted` | — | — |
| 3 | `{checkout, regulatory}` | `{legal, product_owner}` | `{security}` | `blocked` | `VETOED` | — |
| 4 | `{checkout, regulatory}` | `{product_owner}` (partial) | — | `escalated` | — | `architecture_board` |

- **Row 1 is THE done criterion**: a `regulatory` truth with **no approvals** is `blocked`
  with a `MISSING_AUTHORITY_APPROVAL` `BlockReason` whose `how_to_fix` contains
  `obtain_legal_approval` (KRD §44.5: "tout refus doit être actionnable" — the refusal names
  the door, `[assign_authority, obtain_legal_approval]`). **A regulatory truth without legal
  approval is blocked.**
- **Row 2**: every required approver (`legal` ∧ `product_owner`) granted, no veto ⇒ `admitted`.
- **Row 3**: a granted `veto` role (`security`) ⇒ `blocked / VETOED` **regardless** of the
  full approvals — veto dominates (the `security` veto overrides `legal` + `product_owner`).
- **Row 4**: only `product_owner` granted (`legal` missing), no veto ⇒ `escalated`, the
  decision routed to the `escalation` roles (`architecture_board`).

> No Gherkin journey and no rapid property replace this fixture: the admission decision's
> nature is the **workflow/fixture** (state {graph, truth, approvals} → decision), so its
> mirror is the fixture above. A separate **rapid property** (∀, authority: below) pins the
> invariants of `Decide` — total + deterministic, no admission without authority, veto
> dominates, out-of-enum truth_kind ⇒ `Validate` errors — at
> `back/kernel/authority/authority_property_test.go`. Forcing a Godog journey here would be
> a double-typed monster (the completeness law forbids it).
