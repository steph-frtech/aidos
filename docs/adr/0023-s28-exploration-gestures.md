# ADR 0023 — S28: Exploration gestures (`/grill` · `/spike` · `/harvest`), spike confinement, and the DRAFT-Truth proposal

- Status: accepted
- Date: 2026-06-01
- Step: S28 (AIDOS Runtime — Exploration gestures)
- Linear: `S28 · Exploration gestures` (AID-26)

## Context

KRD §75 names the three **exploration gestures** of the idea entry-stage: `/grill`
challenges an intention **above the wall**, a **fuzzy** (not-yet-falsifiable)
intention is routed to `/spike` — a **ratchet-OFF, T0, throwaway** zone (KRD §84:
« cliquet OFF ; zone `/spike` ; KRD serait net-négatif ici ») whose writes are
**confined to `/spike` only** — and `/harvest` extracts the discovered intention
and **proposes** a kernel delta as a **DRAFT Truth** (KRD §60.x: « pas de
graduation directe » — no direct graduation; the freeze is a separate later
`/goal`, KRD §118/§132).

S27 already landed the `ideas` Postgres schema, the pure `ideas.Idea` record (no
`version`, no `mirror` — unrepresentable), the §75 lifecycle gestures
(`Capture`/`Grill`/`Spike`/`Harvest`/`Reject`), the `Promote` gate, the
`promotion-gate` hook, and the `idea-intake` MCP. **S28 builds the Runtime layer
*over* those S27 kernel contracts** — it imports them, never edits them. The
Runtime concerns S28 adds are the *exploration-specific* ones the bare lifecycle
does not carry: the **grill verdict** that routes a draft (sharp→grilled,
fuzzy→spiking, bad→rejected), the **spike-write confinement** rule, and the
**DRAFT-Truth proposal** harvest emits.

## Decisions

1. **`back/runtime/exploration` is a Runtime engine *over* the S27 `ideas`
   package — it reuses, never forks.** The grill/spike/harvest status transitions
   stay owned by `ideas.Grill`/`ideas.Spike`/`ideas.Harvest`/`ideas.Reject`;
   `exploration` calls them and never re-implements a transition or the closed
   status set. It adds only what is genuinely Runtime: verdict routing, write
   confinement, and the proposal shape. No new Postgres schema — the `Idea` row
   lives in the `ideas` schema (CLAUDE.md §1); S28 reuses it.

2. **The grill verdict is a closed three-value enum routed deterministically.**
   `GrillVerdict ∈ {sharp, fuzzy, bad}` (no fourth value). `Grill(idea, verdict)`
   routes a `draft` idea: `sharp → grilled` (skips spike, KRD §132), `fuzzy →
   grilled then spiking` (the floue branch — a fuzzy idea is first grilled, then
   the verdict sends it to spike, preserving the S27 legal transition
   `grilled→spiking`), `bad → rejected` (traced with provenance, KRD §118). The
   routing is a pure total function; the same `(idea, verdict)` always yields the
   same next idea.

3. **The DRAFT-Truth proposal is `{ideaId, proposes, intent, provenance, kind:
   "draft-truth", hasFrozenVersion: false, hasMirror: false}`.** `Harvest` returns
   the harvested idea **and** this proposal. The proposal is a kernel-delta
   *candidate*: it names what the idea proposes and carries the durable lesson, but
   **by type** it has no frozen version and no mirror (the two booleans are
   constant `false`, just as `ideas.Idea` makes them unrepresentable). A later
   `/goal` promotes it by writing its mirror = the freeze (KRD §116/§118); S28
   stops at the proposal. `Harvest` writes **nothing** — neither the kernel nor a
   mirror; it returns a value the `idea-intake` MCP (S27, the `aidos` CLI role)
   persists in the `ideas` schema.

4. **Two BlockReason codes extend the closed enum (below the waterline,
   `back/runtime/blockreason`).** `SPIKE_WRITE_ESCAPES_ZONE` — a `spiking` idea's
   write whose path escapes the `/spike` prefix (`how_to_fix ⊇
   confine_write_to_/spike`, `run_/harvest_to_propose_a_kernel_delta`); and
   `HARVEST_CANNOT_FREEZE` — an attempt by `/harvest` to write the kernel or a
   mirror directly (`how_to_fix ⊇ write_mirror_run_goal_freeze`,
   `harvest_proposes_only`). The `blockreason` package is **Runtime plumbing, not a
   kernel truth** (CONTEXT.md), so this is an additive extension of the closed enum
   recorded here (change_type: `refine`, never a removal) — the same path S04→S13→
   S27 used to grow the enum. The agent never writes the `kernel`/`mirrors`/`fitness`
   schemas; the wall holds.

5. **Spike confinement is a pure predicate, exposed both as `exploration.SpikeWrite`
   and as the `spike-confinement` hook.** `SpikeWrite{Path}.Confined()` is true iff
   the path is under the `/spike` prefix; the hook (`back/hooks/spike-confinement`)
   defers to it (determinism-first: the hook never re-implements the predicate). The
   hook learns the current idea status from an **injected** field on the event — it
   does **not** reach into the `kernel`/`mirrors` schemas (no grant; the wall). While
   the injected status is `spiking`, a write outside `/spike` is denied with
   `SPIKE_WRITE_ESCAPES_ZONE`; a harvest write targeting `kernel`/`mirrors` is denied
   with `HARVEST_CANNOT_FREEZE`. A fault-injection test breaks what it watches (a
   spiking write to `/kernel`) and asserts the hook goes red.

6. **The three Skills.** `spike` and `harvest` already exist as the AIDOS-internal
   gesture skills (`.claude/skills/{spike,harvest}`) and already name
   `SPIKE_WRITE_ESCAPES_ZONE` / `HARVEST_CANNOT_FREEZE`. S28 adds the missing
   `.claude/skills/grill` gesture (the Idea-status `/grill` that records the
   verdict + provenance transition), each carrying the §75 forced **Honesty rules**.
   The AIDOS-internal `grill/` gesture is **distinct** from the existing
   `grill-with-docs` *session* skill (which grills a plan against the docs): one
   records an Idea-status transition, the other runs a documentation-grilling
   session. They are not merged.

## Consequences

- A fuzzy idea goes to `/spike` (ratchet OFF, T0); `/harvest` produces a DRAFT
  Truth (a kernel-delta proposal with no freeze and no mirror), proven by the wall
  (the spike-confinement hook + the `HARVEST_CANNOT_FREEZE` refusal) and a journey
  (the Godog feature).
- No `/goal` / freeze / mirror write here; promotion of a DRAFT Truth is a separate
  later gesture. No `/evolve` / self-play / QD (a later Runtime step). No codegen
  (there is no projection to emit from an idea or a spike).

## OpenQuestions

- **OQ-S28-link:** the provenance back-link from a future *frozen* truth to the
  harvested idea is captured (the proposal carries `ideaId` + provenance) but the
  genealogical edge is only wired when `/goal` actually freezes — deferred to the
  promotion step, not invented here.
