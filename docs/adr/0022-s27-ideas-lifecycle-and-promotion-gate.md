# ADR 0022 — S27: Ideas lifecycle, the promotion gate, and the `NO_MIRROR_NO_KERNEL` BlockReason

- Status: accepted
- Date: 2026-05-31
- Step: S27 (AIDOS Kernel — Ideas lifecycle)
- Linear: `S27 · Ideas lifecycle`

## Context

KRD §115/§116/§118/§119 make the **Idea** the only door into the kernel: a
candidate-truth with a sketched body (`proposes` + `intent` + `provenance`) but
**no version-freeze and no mirror**. Promotion = writing the idea's mirror = the
`/goal` = the freeze. An idea with no mirror can never enter the kernel. S27 lands
the `Idea` record, its `draft|grilled|spiking|harvested|rejected` lifecycle, and
the promotion gate, **without** writing the kernel (the agent has no grant; the
`aidos` CLI role writes truth via `/goal`).

## Decisions

1. **The `Idea` Go type makes `version` and `mirror` UNREPRESENTABLE.** There is
   simply no field for them on `ideas.Idea` — the double absence that distinguishes
   an idea from a truth is enforced by the type, not by convention. The canonical
   body the id hashes over is the sketch `{proposes, intent, provenance}` only;
   `status`/`reject_reason` are lifecycle metadata, **not** part of the content
   address, so grilling/harvesting the same sketch never changes its id. The id
   reuses `records.Hash`/`records.Canonicalize` (the S01/S02 content-hash scheme) —
   never a forked hashing path.

2. **The promotion gate uses an INJECTED has-mirror predicate.** `ideas.Promote`
   refuses unless the idea is `harvested` AND a non-empty `mirrorRef` is supplied.
   It does **not** reach into the `mirrors` schema to author or look up a mirror
   (that would be a truth-write the agent has no grant for, and the circularity the
   wall forbids — CLAUDE.md §8). The mirror is a **reference the human supplies at
   `/goal`**, and the gate checks only that it is non-empty. The `promotion-gate`
   PreToolUse hook DEFERS to `ideas.Promote` (determinism-first: the pure function
   is authoritative; the hook only enforces it at the wall).

3. **`NO_MIRROR_NO_KERNEL` is an ADDITIVE extension of the closed `BlockReason`
   enum (S13), recorded as a ChangeSet + SemanticDiff.** It is added to the closed
   `Code` enum, the `reasons` registry (with a `how_to_fix` containing
   `write_mirror_run_goal_freeze`), and `codeOrder` — a **refine** change_type that
   removes nothing. No prior code or fix path is altered; every prior consumer
   (`aidos explain`, the wall hook, `/why-blocked`) stays green. This is the only
   touch of a prior contract; the rest of S27 is additive new files.

4. **The `ideas` schema is staging ABOVE the wall.** The S27 migration grants the
   agent role `INSERT/SELECT/UPDATE` on `ideas.idea` (capture + advance) but **not**
   `DELETE` (a rejected idea is kept, append-only/traced), and re-asserts the wall:
   the agent still has **no** write grant on `kernel`/`mirrors`/`fitness`. The
   asymmetry — ideas writable, truth not — IS the contract. A lifecycle status
   `CHECK` pins the closed five statuses (no sixth status). The migration is
   expand-only/append-only over the S02 `ideas.idea` table (never altered/dropped).

## Consequences

- The done criterion is enforceable and visible: promoting a harvested idea WITHOUT
  a mirror is blocked with `NO_MIRROR_NO_KERNEL` (the idea stays harvested, no
  kernel write); WITH a mirror it flows to a Promotion whose provenance points back
  to the idea. The kernel has no other key.
- Out of scope (recorded OpenQuestions, by design — not failures): the actual
  `/goal` kernel write/freeze (a later wiring); the `Memory → ContextPack → Idea`
  intake of §119.1; no codegen from an idea body (a candidate is not a frozen
  source). The gate predicate is an injected has-mirror flag, not a `mirrors`-schema
  lookup.
