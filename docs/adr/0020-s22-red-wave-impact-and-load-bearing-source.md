# ADR 0020 — S22: the red wave (impact) is the transitive closure of stale links, and "load-bearing" rides on the declared composes weight

- Status: accepted
- Date: 2026-05-31
- Step: S22 — Impact / red wave (PostKernelChange) + RedWorkQueue + `aidos impact`
- Subsystem: AIDOS Runtime (`back/runtime/redwave`)

## Context

After a kernel hash bump, AIDOS must compute the **red wave** (vague de rouge, KRD §42):
the set of stale links and failing mirrors triggered by the bump. It **starts at the
mirror** and cascades to the projections (api/db/types/operation/action/button), it is
**computed, never hunted**, and it is drained into a **RedWorkQueue** (§49.4). It is
fired by the `PostKernelChange` hook (`rehash && fire-red-wave --from-mirror`, §74, §98)
and previewed by `aidos impact` (= `krd impact`, §82.1).

Three genuine design branches arose during the grill, each with an honesty risk
(inventing a target / a business rule / a grant). They are resolved here rather than
guessed in passing.

## Decision

### 1. The wave IS exactly the set of stale links (§42), ordered mirror-first

`redwave.Impact(bumped, links, heads, layers) → RedWave` is a **pure** function
(no DB, no clock, no RNG, no I/O). It computes the **transitive closure** of links whose
target is in the bumped set, reusing **S17 `links.Resolve`** to decide each edge's
staleness — it never re-implements or forks the staleness check. An item appears in the
wave **iff** a link `Resolve` reports `stale` or `absent`; there is no item without a
stale link and no stale link without an item (§42 — "computed, never hunted").

The wave is **ordered**: the bumped source's `mirrors` reflections come **first**, then
the projections that `derives_from`/`projects_to` the changed source (§42/§98 —
"mirrors red first, projections after"). Ordering is part of the contract, pinned by the
property mirror.

### 2. "Load-bearing" is the DECLARED composes weight (S18/S19, §112), NOT an S17 link field

The S17 `links.Link` AST carries **no weight** — it is a pinned kind+from+to. The
load-bearing/cosmetic distinction is a **declared edge weight** already pinned by S18
`composes` and S19 `propagation` (`load-bearing | cosmetic | critical`, KRD §112,
ADR 0017/0018). S22 therefore **reuses that declared property**: the wave's input graph
annotates each propagating edge with a declared `LoadBearing bool` (true for
`load-bearing`/`critical`, false for `cosmetic`), sourced from the composes weight where
it exists. A `binds`/`triggers` edge from a button propagates red to its view **iff** the
edge is load-bearing; a cosmetic edge has empty downstream beyond itself.

This is **not invented**: it is the same declared-weight rule S18/S19 already pinned. The
honesty branch ("is load-bearing a property on the S11 binds/triggers link, or a derived
check?") resolves to: **a declared weight on the edge, owned by S18/§112, referenced not
re-coined here.** S22 does not add a new weight semantics; it consumes the declared one.

### 3. `red_work_queue` lives BELOW the waterline (`runtime` schema), agent INSERT+SELECT only

The RedWorkQueue is a **Runtime worklist**, an audit/work log — **not** truth
(kernel/mirrors/fitness). It lives in the `runtime` schema (created at S05), the same
zone as `sensor_runs` (S07) and `completeness_runs` (S12). The agent role gets
**INSERT + SELECT** only — never UPDATE/DELETE/TRUNCATE — so the queue is append-only and
its history cannot be rewritten. This **matches S04's wall**: the agent may write its own
runtime log below the line; it gets no write above the line. The grant boundary is
**confirmed against S04**, not assumed.

S22 only ever INSERTs rows with `status = open` (`owner_agent`/`lease_until` NULL).
The status transitions (`open → claimed → blocked → resolved`) are the **scheduler's**
job (a later step, §49.4) with its own role; the `status` column and the CHECK exist now
but S22 writes only `open`.

## Consequences

- `Impact` is replayable and deterministic; the rapid property mirror pins
  determinism, wave==set-of-stale-links (via `Resolve`), mirror-first order, no
  propagation on cosmetic edges, |wave| rows enqueued, and no panic on a malformed target.
- The hook contains **no logic**: it calls `redwave.Impact` then `Enqueue`. All the
  computation lives in the pure package (determinism-first, §6).
- The wall stays intact: the migration opens **no** write door above the line; it only
  adds a below-the-line worklist table.

## Open questions (forward dependencies, by design — not blocking)

- **OQ-S22-1 (bump-source feed):** where the bumped kernel ref(s) come from at runtime
  (the DAG head resolution / content-store query) is owned by S02/S24. The hook receives
  the bumped set + the link graph + heads as input; wiring the real store query is a
  later tooth and does not change the `Impact` surface.
- **OQ-S22-2 (red-wave-as-a-tool):** exposing the red wave as a callable MCP tool
  (beyond the `aidos impact` CLI subcommand) is a later `evolve`/`impact` MCP, not
  invented now.
- **OQ-S22-3 (scheduler):** claiming/leasing/dependency-ordered dispatch and
  multi-agent collision avoidance (§49.4) is a later step; S22 only computes and enqueues.
