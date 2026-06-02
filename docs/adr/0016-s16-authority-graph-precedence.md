# ADR 0016 — AuthorityGraph admission precedence (S16)

- Status: Accepted
- Date: 2026-05-31
- Step: S16 — AuthorityGraph (approver / veto / escalation)
- Subsystem: AIDOS Kernel (`back/kernel/authority`)

## Context

KRD §13.8 binds every above-the-line truth to an explicit authority owner — a graph keyed
by `{domain, truth_kind}` with three role lists: `approvers`, `veto`, `escalation`. The
rule "toute vérité above-the-line doit avoir un propriétaire d'autorité explicite" makes
admission a **decision**, not a convention. The graph shape, the role names
(`legal`, `product_owner`, `security`, `architecture_board`) and the `truth_kind` enum are
all pinned verbatim by KRD §13.8 / §13.4 — none is invented here.

What §13.8 does **not** spell out mechanically is the **precedence** between the three
lists when computing the single `AdmissionDecision ∈ {admitted, blocked, escalated}`. The
S16 spec fixture rows (docs/plan/S16-authority-graph.md) pin the four cases; this ADR
records the precedence those rows imply, so the pure `Decide` function is unambiguous and
the property mirror can assert it.

## Decision

`Decide(graph, truth, granted)` — where `granted` is the set of roles that have granted
their approval/veto for the truth keyed by `{domain, truth_kind}` — applies this ordered
precedence (first match wins):

1. **Veto dominates.** If **any** role in `graph.veto` is present in `granted` ⇒
   `blocked` with `BlockReason{code: VETOED}`. A veto overrides a full set of approvers
   (fixture row 3: `security` veto blocks even with `legal` + `product_owner` granted).
2. **No approver at all granted** ⇒ `blocked` with
   `BlockReason{code: MISSING_AUTHORITY_APPROVAL, how_to_fix: [assign_authority, obtain_legal_approval]}`
   (fixture row 1, THE done criterion: a regulatory truth without legal approval is blocked).
3. **All required approvers present** (every role in `graph.approvers` ⊆ `granted`), no veto
   ⇒ `admitted` (fixture row 2).
4. **Partial approval** (≥1 but not all approvers granted), no veto ⇒ `escalated`, routing
   the decision to `graph.escalation` (fixture row 4: only `product_owner` ⇒ escalate to
   `architecture_board`). Escalation with an empty `escalation` list is still `escalated`
   (the decision is "needs a higher authority"), but `Validate` does not require a non-empty
   escalation list — only a non-empty `approvers` list.

`Validate(graph)` rejects: empty `domain`; a `truth_kind` outside the seven KRD §13.4
members; an empty `approvers` list (a graph with no approver could never admit — a monster);
a malformed role identifier; and a role appearing in **both** `approvers` and `veto` (a
self-contradicting graph). It does NOT require `veto`/`escalation` to be non-empty.

`Decide` is **total** (always returns one of the three decisions) and **deterministic**
(same `{graph, truth, granted}` ⇒ same decision) — pinned by the rapid property mirror.

## Consequences

- The precedence is **declared** (this ADR + the fixture), never learned (CLAUDE.md §8).
- `MISSING_AUTHORITY_APPROVAL` and `VETOED` are **S16-local kebab/upper codes** carried by
  the admission `BlockReason`. They are NOT added to the closed
  `runtime/blockreason.Code` enum (CLAUDE.md §9 forbids inventing members there); the
  canonical `CodeMissingAuthority` ("MISSING_AUTHORITY") already exists in that enum for the
  wall/completeness sites, and `Decide` reuses its `how_to_fix` vocabulary
  (`assign_authority`) augmented with `obtain_legal_approval` for the regulatory case.
- Changing an authority owner is a `reauthorize` SemanticDiff change_type (KRD §44.1), not
  an in-place edit — a ChangeSet, never a silent rewrite.
- `Decide` is pure logic the `/goal` admission flow will call (a later projection); this
  step does not wire it into the gate.
