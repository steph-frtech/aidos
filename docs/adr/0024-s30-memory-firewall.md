# ADR 0024 — S30 MemoryFirewall: memory is fuel, never truth

Status: Accepted (2026-06-01)
Step: S30 (AIDOS Archive · `back/archive/brain/firewall`)
KRD: §119.1 (MemoryFirewall), LIVRE XXIV (the six KRD memories), §44.5 (BlockReason)

## Context

The `/brain` store holds the six KRD memories as **context fuel** — branch-aware, indexable,
`non-décisoire`. KRD §119.1 forbids any `MemoryItem` from reaching the kernel except through the
mandatory one-way flow `Memory → ContextPack → Idea → Mirror → Goal → Kernel`. The done invariant:
a direct `Memory → Kernel` write is **blocked** — "la mémoire propose, le noyau déclare le vrai."
S30 lands the firewall above the S04 wall and the S27 promotion-gate, composing additively.

A handful of genuine shape decisions had to be made (the rest is reuse).

## Decision

1. **A `MemoryItem` makes `version`/freeze and `mirror` UNREPRESENTABLE.** The Go struct
   (`firewall.MemoryItem`) has no `Version` and no `Mirror` field; the canonical body carries no
   such key; the Postgres table `brain.memory_item` has no such column and a CHECK constraint
   forbidding a `mirror`/`version` key in the body. That double absence is *exactly* what makes a
   row memory and not a truth — the type, the body, and the schema all agree. This mirrors the S27
   `ideas.Idea` decision (no version, no mirror) one layer down.

2. **`ToKernel` always blocks — no "trusted-memory" bypass.** The gate refuses the direct edge for
   **every** memory regardless of `confidence` or `taint`: a clean, fully-confident, untainted
   memory is still not truth. There is no confidence threshold and no taint-clean exception. The
   rapid property pins this for arbitrary memories.

3. **New BlockReason code `MEMORY_CANNOT_DECLARE_TRUTH`** (KRD §44.5). An additive extension of the
   closed `blockreason.Code` enum (change_type: `refine`, never a removal), in the same spirit as
   S27's `NO_MIRROR_NO_KERNEL`, S28's spike/harvest codes, and S29's goal codes. Its `how_to_fix`
   names the full flow token `memory_to_contextpack_to_idea_to_mirror_to_goal_to_kernel`. Folded in
   via a ChangeSet + SemanticDiff on the `blockreason` home.

4. **The `taint` enum is the closed set** `{unverified, stale, user_claim, incident_derived,
   external_source}` (KRD §119.1), declared in `firewall.Taints()` — never invented at runtime.
   `Propose` carries the taint forward verbatim (taint never silently drops).

5. **The MemoryFirewall hook reads an INJECTED provenance predicate, not the kernel.** The pure
   decider `firewall.CheckKernelWrite(provenanceKind)` distinguishes a raw-memory provenance (the
   forbidden shortcut → blocked) from a properly-mirrored idea (the S27 legal path → passes this
   gate). The hook never reaches into the kernel/mirrors schemas (that would itself be a truth
   read; the agent has no grant). Unknown provenance and garbage input **fail closed** (block).

6. **`ViaIdea` is the only legal door and writes nothing.** It hands the memory's content to the
   S27 idea-intake as a `draft` idea whose provenance is `memory:<id>`; the idea still has no
   mirror and must acquire one via `/goal`. `IdeaCandidate.WroteKernel` is always `false`.

## The wall / GRANTs

`brain.*` is **below the waterline**: the agent role gets `INSERT, SELECT` on `brain.memory_item`
(it reads and appends memory) but **no** `UPDATE/DELETE` (append-only, kept) and **no** grant on
`kernel`/`mirrors`/`fitness`. That asymmetry — writable fuel that can never become truth without
the full flow — is the MemoryFirewall at the row level. The kernel write at the far end is the
`aidos` CLI role via `/goal`, never the agent and never a memory.

## Consequences

- Determinism-first: `Capture`/`Propose`/`ToKernel`/`ViaIdea`/`CheckKernelWrite` are pure, total,
  deterministic; the reproducibility mirror (`firewall_property_test.go`, fast-check twin) pins it.
- Out of scope (later steps, recorded as forward-dependencies, not blockers): the ContextRouter /
  progressive ContextPack compilation (§119.3) and the ContextGraphDecision / Decision Reuse Test
  (§119.2); the actual kernel write/freeze (the `/goal` mutation, the S27 flow via the `aidos`
  role). No new MCP server (the S27 idea-intake receives the `ViaIdea` handoff); no new Skill.

## Alternatives rejected

- A confidence/taint threshold that would let a "clean enough" memory through — rejected: it would
  make memory pose as truth, the exact failure the firewall exists to prevent.
- The hook reading the kernel/mirrors schema to establish provenance — rejected: the agent has no
  grant, and a truth read in a PreToolUse hook is itself a wall violation. The injected predicate
  keeps the hook below the line.
- A `mirror`/`version` column on `brain.memory_item` left empty — rejected: an empty column is a
  latent door; making it unrepresentable is the contract.
