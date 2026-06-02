# ADR 0015 — S12 Stop completeness gate: cut-resolution + `completeness_runs` audit log

- **Status:** Accepted
- **Date:** 2026-05-31
- **Step:** S12 — Completeness law + monstre detection (the Stop hook that blocks)
- **Subsystem:** AIDOS Mirror (`back/kernel/mirror/completeness`) + the Stop hook (`back/hooks/stop`)

## Context

S06 delivered the typed `Mirror` record and the pure completeness law (the monster
detector `ComputeCompleteness(mirrors, layers)` in `back/kernel/mirror/records`) as
a **read-only verdict**. S12 turns that verdict into a **non-bypassable gate at
`Stop`** (KRD §29, §74/§77 line `run: "goal-check && completeness-check", on_fail:
continue`; LIVRE XXII §126–§127 *la chasse au monstre*). Two genuine choices arise
within the frozen stack (Go + Postgres + Atlas + the Go hook-binary form); neither
touches the mandatory minimum. The goal-check half of the Stop line is deferred to
**S29** (per the S12 spec "Next safe step"); S12 wires only the completeness half.

## Decision 1 — the cut is resolved from the `mirrors ⋈ kernel` projection, not from a Stop-event payload

"The current cut" at `Stop` is the **head set of kernel layers and mirror records**
the completeness law reads — exactly the projection S06's pure detector consumes
(`[]Layer`, `[]Mirror`). The Stop hook does **not** invent a cut identifier from the
Stop-event payload; it reads the head projection (the migration's read model / a
seam interface) and content-addresses the evaluation by a **cut hash** = a stable
digest of the sorted `(layer_id@version, kind)` set joined to the sorted
`(mirror_id, reflects@version, test_kind, cert_language, liveness)` set. Same cut ⇒
same hash (determinism-first, CLAUDE.md §6/§8). Rationale: the law is defined over
the join, not over an event; deriving the cut from the join keeps the gate's verdict
a pure function of the truth-store head (the S06 detector is the single source of the
monster set — S12 does not re-derive it).

## Decision 2 — `completeness_runs` is a `runtime`-schema audit log, agent-writable (ADR 0014 boundary), append-only, content-addressed

The S12 spec flagged the write-grant boundary as an OpenQuestion *"confirm against
S04/S07"*. **Confirmed:** ADR 0014 + `sensor_runs_baseline.sql` establish that the
`runtime` schema lives **below the waterline** (created at S05); the `aidos_agent`
role MAY append its own audit log there (`INSERT + SELECT`, never
`UPDATE/DELETE/TRUNCATE`) **without breaching the wall** — the wall guards
`kernel/mirrors/fitness` only. `completeness_runs` therefore lives in `runtime`,
mirroring `sensor_runs`'s shape exactly (the wall's twins stay auditable):

- `runtime.completeness_runs` — one immutable row per Stop evaluation:
  `run_id`, `cut_hash` (content address), `verdict` (`block | pass`, CHECK — no
  third), `monster_count`, `started_at`, `finished_at`.
- `runtime.completeness_monster_findings` — one immutable child row per finding:
  `run_id` (FK), `reason` (`no_truth_without_mirror | no_orphan_mirror`, CHECK),
  `kind` (the monster's kernel kind), `ref` (layer_id@version or mirror_id),
  `missing_test_kind`.

`aidos_agent` gets `INSERT + SELECT` on both and is denied
`UPDATE/DELETE/TRUNCATE` (append-only). The wall holds: the hook records its own
run-log, it never writes truth. Expand-only, `IF NOT EXISTS`, idempotent —
re-statable in the Testcontainers suite alongside the S02/S05/S07 baselines.

## Consequences

- The Stop gate is a **thin adapter** over the S06 pure detector + the S12 gate
  aggregator (`block iff |monsters| > 0`, no third verdict). It consumes S06's
  predicates and the `BlockReason` shape; it re-derives and re-types nothing.
- An errored/unknown completeness check is a **failure made explicit** that blocks,
  never a silent pass (KRD §82 `.passthrough()` anti-pattern).
- No MCP server (the gate is harness-invoked, not a callable op — a `completeness`
  MCP for on-demand rerun is **OQ-S12-1**, deferred). No new kernel/spec truth.
- The goal-check half of the Stop line (`red set → green ∧ prior green intact ∧
  mutation ≥ threshold`) is **OQ-S12-2**, wired at S29; S12 leaves the scaffold's
  goal-check inert.
