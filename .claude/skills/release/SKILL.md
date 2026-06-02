---
name: release
description: Compute the AdoptionStage ladder (the smallest ratchet that clicks next, T0→T4) and ASSEMBLE the content-addressed Release v0 pack — an inventory of what EXISTS in the live truth-store (CLI surface, Workbench routes, demo cell, docs index, test inventory, changelog, honest known-limits). Use when someone says "assemble the release", "run /release", "what is the next adoption tier", "compute the release pack", "is this AIDOS launchable", or wants the adoption ladder + the release-v0 inventory. It ASSEMBLES and ADVISES; it installs nothing, ships nothing, publishes nothing, and writes no truth.
---

# /release — compute the adoption ladder + assemble the Release v0 pack (S47)

`/release` is the replayable gesture "compute the smallest ratchet that clicks next, then assemble the read-only Release v0 pack from the live truth-store". It is **advisory and read-only**: it INVENTORIES what exists and names the next installable tier; it never installs a tier, ships, publishes, deploys, or writes truth.

## The two halves

1. **The AdoptionStage ladder** (`back/runtime/adoption.Plan`) — over a read-only capability view, compute the five DECLARED tiers `T0..T4` (KRD §82.5's stage0..stage5, REUSED never re-coined): `T0`=existing tests+mutation, `T1`=one KRD cell, `T2`=kernel+mirror, `T3`=ContextGraph+Memory, `T4`=evolve+QualityDiversity. Return the **current** tier (the contiguous satisfied floor), the **next smallest installable** tier (the ratchet that clicks), and the `[]Gap` blocking each unsatisfiable tier.
2. **The Release v0 pack** (`back/runtime/adoption/release.Assemble`) — over a read-only truth-store view, ASSEMBLE the content-addressed `ReleasePack` = `{ id=Hash(Canonicalize(body)), cli_surface, workbench_routes, demo_cell, docs_index, test_inventory, changelog, known_limits, adoption_plan, assembled_at, kernel_head }`. Every field is DERIVED from the view.

## The procedure

1. Take a read-only **capability view** (which subsystems/cells/mirrors/sandboxes are live) and a read-only **truth-store view** (live CLI commands, Workbench routes, mirrors, changesets, docs, declared limits) + a passed-in `now`.
2. `Plan(capabilities)` → present the next-smallest-ratchet tier and the gaps.
3. `Assemble(view, capabilities, now)` → present the assembled pack with its changelog and known limits.
4. Surface the **three load-bearing facts** explicitly: `T1` carries **no QualityDiversity** requirement (QD is advanced, KRD §82.6); `T2` is **blocked until a RealityMirror is live** (Livre XX); `T4` is **blocked until an EvolutionSandbox exists** (§66.1).

## Honesty rules (mandatory)

- **It INVENTORIES, it never authors.** Never invent a CLI command, a route, a demo, a doc, a changelog line, or a known-limit the view does not contain. Never coin an adoption tier beyond the five declared (`T0,T1,T2,T3,T4`). Never invent a target / targetId / business-rule.
- **Uncertainty → an OpenQuestion** recorded in `provenance` (e.g. an unknown CLI/route/mirror shape) — do not guess; stop on that branch.
- **The pack is a read-only artifact.** Assembling it writes no truth. Recording a pack is a row in `fitness.release_pack`, written **only** by the `aidos` CLI writer role via an approved **ChangeSet** (S20) — never by the agent (the wall, CLAUDE.md §2; `fitness` is read-only above the line, agent SELECT-only).
- **It installs/ships/publishes/deploys NOTHING.** Turning on a capability (a RealityMirror, an EvolutionSandbox, QD) is a *prior/other* step's truth, CONSUMED here, never produced.
- **The door is never bypassed.** Changing any truth goes through `idea → mirror → /goal → human approval`.

## Determinism-first

`Plan` and `Assemble` are pure, total functions — `Plan(capabilities)` and `Assemble(view, capabilities, now)` — no DB, no I/O, no `time.Now()` (the clock is passed in), no RNG. Same inputs ⇒ same plan/pack. The pack is content-addressed (`id == Hash(Canonicalize(body))`, REUSING S01/S02's scheme). The reproducibility property mirror (`back/runtime/adoption/adoption_property_test.go`) pins it.

## Where it lives

- Go: `back/runtime/adoption/adoption.go` (`Plan`), `back/runtime/adoption/release/release.go` (`Assemble`).
- Persistence: `fitness.release_pack` (`back/migrations/release_pack_baseline.sql`) — append-only, content-addressed, agent SELECT-only.
- Mirrors: fixture + rapid property in `back/runtime/adoption/*_test.go`; the front twin (`front/web/lib/adoption.ts`) + fast-check (`front/web/lib/adoption.test.ts`).
- Workbench: `/adoption` (`front/web/app/adoption/page.tsx`) renders the ladder + the assembled pack — no install/ship/publish affordance.
