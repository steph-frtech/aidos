---
name: harvest
description: Harvest a spike or idea into a DRAFT candidate-truth (a kernel-delta proposal, never applied) — extract the durable lesson and propose it as an Idea, never write the kernel or a mirror. Use after a /spike, when the user says "harvest this", "what did we learn from that probe", "turn this spike into a candidate", or wants to capture a finding without freezing it into truth.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# harvest (KRD gesture)

The third exploration gesture (after `/grill` and `/spike`). It closes the throwaway zone by extracting the **durable lesson** and proposing it as a **DRAFT Truth** — a kernel-delta candidate that carries **no frozen version and no mirror**. Harvest **proposes**; the human **freezes** later via `/goal`. The AI may draft, the human approves — never the inverse.

> The wall (CLAUDE.md §2): this gesture **never** writes the `kernel` or `mirrors` schemas. An attempt is blocked with `HARVEST_CANNOT_FREEZE`. The only door to truth stays `idea → mirror → /goal → human approval`.

## Purpose

Take what a `spiking` Idea actually discovered (the throwaway probe under `/spike`) and lift the **one durable lesson** out of it into a candidate-truth: record `Idea → harvested` and persist a **DRAFT-Truth proposal** (a kernel-delta candidate). It is a *proposal*, not a truth — no freeze, no mirror, no kernel write. Everything you cannot ground in the spike or existing truth becomes an **OpenQuestion** in provenance, never a guess.

## When to use

- Step loop: a `/spike` ran in the ratchet-OFF / T0 zone and produced a finding worth keeping.
- The user says "harvest this", "what's the durable lesson", "propose this as a candidate", or "capture the finding".
- An Idea is `spiking` and you want to move it to `harvested` with a concrete kernel-delta proposal — **before** anyone writes code or opens a `/goal`.

## Inputs

- **idea id** — the `spiking` Idea in the `ideas` schema (status `spiking`, provenance `human|incident`).
- The **spike discovery**: the concrete finding from the throwaway `/spike` zone (e.g. "retry with capped exponential backoff").
- The relevant **CONTEXT.md** / `CONTEXT-MAP.md` glossary + ADRs for the target subsystem (ubiquitous language).
- The candidate **target / targetId** the proposed delta would attach to — **only if grounded in existing truth or supplied by the human**. Unknown → OpenQuestion (Honesty rules).

## Outputs

- The Idea moved `spiking → harvested` (recorded via the `idea-intake` MCP, never a direct write).
- One **DRAFT-Truth proposal**: a kernel-delta candidate describing the durable lesson, explicitly marked DRAFT — **no frozen version, no mirror**.
- Zero or more **OpenQuestions** in provenance for every gap (unknown target, undefined term, unverifiable claim).
- Nothing applied, nothing frozen: promotion to truth is the later, separate `/goal` gesture.

## BDD / mirror required before use

This gesture produces a *proposal*, not a behaviour, so it writes no truth-test of its own. But the engine it drives ships its proof first (S28, `back/runtime/exploration/`):
- The `Idea`-status-machine **fixture** asserts `spiking --harvest--> harvested + DraftTruthProposal`, each transition emitting verdict + provenance.
- The **rapid property** asserts that for any `grill/spike/harvest` sequence, `harvest` of a `spiking` Idea **always** yields `harvested` **and** a proposal that is DRAFT (no freeze, no mirror) and **never** writes the kernel/mirror.
- A harvested Idea **never** carries a frozen version or a mirror — that is exactly what distinguishes an Idea from a Truth.

## Steps

1. **Resolve the Idea.** Read it via the `idea-intake` MCP. Confirm status is `spiking` — harvest only closes a spike. If it is not spiking, stop and route back (`/grill` first, or `/spike`).
2. **Extract the one durable lesson.** Read the throwaway artifacts under `/spike`. Name the single transferable finding in **ubiquitous language** — not the prototype code, the *lesson* (the spike itself is discarded).
3. **Locate the candidate target.** Find the `target` + `targetId` the delta would attach to in existing truth, or take a human-supplied hint. If absent or ambiguous → **OpenQuestion**, do not invent it.
4. **Draft the kernel-delta proposal.** Describe the proposed change as a DRAFT candidate (a kernel delta), in the ubiquitous language. Keep it minimal: one intention. Do **not** stage it into the `kernel` schema and do **not** write a mirror.
5. **Record the transition.** Persist `→ harvested` + the DRAFT-Truth proposal + verdict via `idea_harvest` (the MCP write-grant). Attach provenance (who/why/when, the source spike) and all OpenQuestions.
6. **Hand off to `/goal`.** Surface the harvested proposal. Stop here — promotion needs `/goal` (which writes the mirror = the freeze) and human approval. You do not freeze, mirror, or declare done.

## Stop conditions

- Idea is `harvested` with a DRAFT-Truth proposal that has **no frozen version and no mirror**.
- The kernel and mirrors schemas were **not** written (the wall held; no `HARVEST_CANNOT_FREEZE`).
- Every gap (unknown target, undefined term, non-falsifiable claim) is an **OpenQuestion** in provenance, not an invented fact.
- You did **not** open the `/goal`, write a mirror, or apply anything — promotion is the human's, via the next gesture.

## Failure modes

- **Freezing in passing** — staging the delta into `kernel`/`mirrors` to skip the door. Blocked by the hook (`HARVEST_CANNOT_FREEZE`); you have no GRANT anyway. Harvest *proposes*.
- **Inventing a target/targetId or a business rule** to make the proposal look complete → forbidden; emit an OpenQuestion.
- **Harvesting the prototype, not the lesson** — copying spike code forward. The spike is throwaway; carry the *durable finding*, not the scaffolding.
- **Harvesting a non-spiking Idea** — there is no discovery to extract. Route back to `/grill` / `/spike`.
- **Smuggling a mirror in** — attaching a proof to the proposal. A harvested Idea never carries a mirror; that arrives at `/goal`.
- **Declaring done** — harvest leaves a candidate, not a truth. "Done" is computed downstream (§8), never declared here.

## Related hooks

- **spike-confinement / `pretooluse`** (`back/hooks/`) — refuses a harvest write to the kernel or a mirror with `HARVEST_CANNOT_FREEZE`; refuses any escaping write while `spiking` with `SPIKE_WRITE_ESCAPES_ZONE`. Ships with a fault-injection test.
- **stop** (`back/hooks/stop`) — completeness: a half-finished harvest (no proposal, no recorded transition) blocks the stop.

## Related MCP tools

- **idea-intake** — `idea_get` to read the spiking Idea; `idea_harvest` to record `→ harvested` and persist the DRAFT-Truth proposal (no freeze, no mirror); `idea_list` to find candidates.
- **store** — read existing targets / kernel AST (read-only) to ground the candidate target; never write it.
- **memory** / **context** — pull prior episodes and the ContextGraph to frame the durable lesson and check reuse decisions.

## Workbench visualization

Next route `front/web/app/exploration/` → `/exploration` (the "Grill & Spike Lab"; do not touch existing routes): render the Idea travelling `draft → grilled → spiking → harvested`, the ratchet-OFF / T0 badge on the spike zone, and the harvested **DRAFT-Truth proposal** card explicitly labelled "DRAFT — no frozen version, no mirror; promotion to truth needs /goal". A Playwright e2e (`tests/e2e/exploration.spec.ts`) asserts the harvested Idea shows status `harvested` with that DRAFT-Truth card.

## Honesty rules

Never invent a `target`, a `targetId`, a business rule, or a DeltaSpec entry to make the proposal look complete — every gap (unknown target, undefined term, a claim you cannot make falsifiable) becomes an explicit **OpenQuestion** in provenance for the human to resolve. Harvest yields a DRAFT candidate; it never freezes truth, never writes a mirror, and never declares the goal reached.
