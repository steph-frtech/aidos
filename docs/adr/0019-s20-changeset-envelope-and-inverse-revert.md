# ADR 0019 — S20: the ChangeSet envelope, its lifecycle side-table, and inverse-revert semantics

- **Status:** accepted
- **Date:** 2026-05-31
- **Step:** S20 (AIDOS Archive — ChangeSet)
- **Context map:** `back/archive/CONTEXT.md` (ChangeSet, stable phase, version DAG, append-only with mutable head)
- **KRD:** §44 (the two axes; the commit-gate; no FAILED), §98 (the "add order discount" transaction), §44.1 (SemanticDiff change_types), §44.5 (BlockReason)

## Decision

S20 lands the **ChangeSet** as the Archive's temporal-axis primitive: the atomic, reversible
transactional envelope that moves the kernel from one stable phase to the next, wrapping `spec_delta`
(Kernel) and `mirror_delta` (Mirror) **together** so they never drift. Four genuine choices were
made and are pinned here as above-the-line decisions.

### 1. One ChangeSet holds BOTH plans, in one content-addressed body

The atomic `{spec_delta, mirror_delta}` pair lives **inside one canonical JSONB body**; the
ChangeSet `id` is the SHA-256 hex of that canonical body (the **same content-hash scheme as the S01
content store — not forked**). Lifecycle stamps (`status`, `applied_at`) are **excluded** from the
canonical body, so the id is **stable across the DRAFT → APPLIED transition** — applying does not
change the envelope's identity, only its stamp. This makes "spec and mirror cannot drift" a property
of the storage shape, not a convention.

### 2. The lifecycle stamp is a SIDE TABLE, never an ALTER of S02 `changesets.changeset`

The S02 baseline already created a generic `changesets.changeset (id, body, version, …)`. Per the
anti-overwrite rule (expand-only, no ALTER of a prior table), S20 adds an **additive** side table
`changesets.changeset_lifecycle (id, status, parent_phase, reverts, applied_at, version, …)` plus a
read-only VIEW `changesets.changeset_envelope` joining the body to its latest stamp. This mirrors the
S18/S19 pattern (side table + view, no ALTER). The `status` CHECK pins the **closed set
{DRAFT, APPLIED, REVERTED}** — a FAILED stamp is refused at the DB level (there is no FAILED). The
log is **append-only**: a status change is a NEW version row, never an in-place UPDATE.

### 3. The inverse is a delta **negation**, not a re-diff

`Revert(applied)` builds a NEW DRAFT whose deltas are the **negation** of the source's
(`add ⇄ remove`; `refine` is its own inverse at this step), with `reverts = source.id`, **without
mutating the source** (which stays APPLIED, immutable). It does NOT re-compute a diff. This makes
`Revert∘Revert ≡ identity` (delta-wise) a structural property, proven by the rapid/fast-check
mirrors. Applying the inverse then **stamps the source REVERTED** — a new lifecycle row, never a
deletion (append-only — a revert creates information).

### 4. The completeness predicate is INJECTED (the wall)

The commit-gate admits DRAFT → APPLIED **only if** the completeness law holds — every spec_delta
layer has its living mirror. At this step the predicate is the minimal **`SpecHasMirror`** (a
`spec_delta` requires a `mirror_delta` in the same envelope) and is **injected** into `Apply` and the
gate. This package never reaches into the `kernel`/`mirrors` schemas to compute completeness — a
later step (S29 goal engine / the real completeness runner) wires the deeper predicate. A spec
without its mirror is a monster, refused with `INCOMPLETE_CHANGESET` + `how_to_fix:
[add_mirror_for_spec_delta]`.

## BlockReason codes introduced (KRD §44.5)

- `INCOMPLETE_CHANGESET` — a spec_delta has no mirror_delta (a monster); the commit is refused.
- `APPLIED_IS_IMMUTABLE` — an in-place edit of an APPLIED/REVERTED envelope is refused.
- `NOT_DRAFT` — a DRAFT-only transition (apply, discard) was attempted from another status.
- `NOT_APPLIED` — a revert of a non-APPLIED envelope was attempted.

## Consequences

- The pure state machine (`Open/Apply/Edit/Revert/Discard/StampReverted`) is total, deterministic,
  and I/O-free; `Apply` takes `applied_at` as an argument so it stays pure (determinism-first, §6).
- The commit-gate hook **reuses** the pure `Apply`/`Edit` — it never re-implements the gate, so the
  hook and the machine can never diverge. Its fault-injection test drops the mirror_delta and asserts
  the gate goes red (hook honesty, §5).
- The `changeset` MCP server is the only write door; it carries the `aidos` writer DSN. The agent
  role is SELECT-only on `changesets.*` (the wall). Only `changeset_apply` stamps APPLIED.
- The DAG (branches/merges/stable-phase nodes), the red-wave/PostKernelChange firing, the `/goal`
  wiring, and codegen are explicitly **out of scope** here — a ChangeSet is a single edge with a
  `parent_phase`, not yet a graph.

## Open questions (provenance — pinned, not guessed)

- **OQ-S20-1 — completeness depth.** `SpecHasMirror` checks *presence* of a mirror_delta, not that
  the mirror actually reflects the spec layer. The deeper predicate (reading the live mirror set) is
  deferred to the completeness runner / S29.
- **OQ-S20-2 — change_type coverage.** The inverse negates `add ⇄ remove` and treats `refine` as its
  own inverse. The full §44.1 SemanticDiff enum (override/rescope/reauthorize/reweight/replace_mirror)
  and their precise inverses are a later SemanticDiff step (S21), not this envelope step.
- **OQ-S20-3 — parent_phase resolution.** The envelope records a `parent_phase` string; resolving it
  to a real DAG node (and validating the edge) is the S24 Version DAG step.
