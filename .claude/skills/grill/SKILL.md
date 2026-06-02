---
name: grill
description: The /grill exploration gesture — challenge an Idea's intention ABOVE the wall and route it on a verdict (sharp → grilled ; fuzzy → spiking ; bad → rejected, traced). Use when an Idea is captured and must be triaged before it nears the kernel, when the user says "grill this idea", "is this falsifiable yet", "challenge this intention", or when /grill-with-docs routes a candidate to spiking/grilled/rejected. Records the verdict + provenance; never writes the kernel or a mirror.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# grill (KRD gesture)

The first exploration gesture (before `/spike` and `/harvest`). It **challenges an Idea's intention ABOVE the wall** (KRD §75) and **routes** it on a closed three-value verdict — it does not freeze, mirror, or write the kernel. Grilling is how a raw candidate-truth is triaged into one of three lanes before anyone pays for a mirror.

> The wall (CLAUDE.md §2): this gesture writes only the `ideas` zone (the status transition + the verdict + provenance, via the `idea-intake` MCP). It **never** writes the `kernel` or `mirrors` schemas. The only door to truth stays `idea → mirror → /goal → human approval`.

> **Distinct from `grill-with-docs`.** `grill-with-docs` is a documentation-grilling *session* skill (it stress-tests a plan against the docs and seeds Mintlify). This `grill/` gesture records an **Idea-status transition** (`draft → grilled | spiking | rejected`) with its verdict + provenance. They are not the same skill (ADR 0023).

## Purpose

Take a `draft` Idea (captured from a human utterance or an incident) and **decide its verdict** in the ubiquitous language, then route it deterministically:

- **sharp** — the intention is *falsifiable now*: it can be stated as a red mirror without further probing → `grilled` (skips `/spike`; KRD §132, "finalement je veux un code promo").
- **fuzzy** — the intention is *not yet falsifiable*: it needs a throwaway probe first → `spiking` (the floue branch; the `/spike` zone, ratchet OFF, T0).
- **bad** — a bad idea → `rejected`, **traced** with its provenance (append-only, kept, never deleted; KRD §118).

There is **no fourth verdict**. The verdict and the provenance are recorded; the routing is a pure function (`exploration.Grill`, S28).

## When to use

- Step loop: an Idea was just captured (`draft`) and must be triaged before it nears the kernel.
- The user says "grill this idea", "challenge this intention", "is this falsifiable yet", "is this a good idea".
- A candidate-truth needs to be sent down the right lane (clear → harvest; fuzzy → spike; bad → reject) **before** any code or `/goal`.

## Inputs

- **idea id** — the `draft` Idea in the `ideas` schema (provenance `human|incident`).
- The relevant **CONTEXT.md** / `CONTEXT-MAP.md` glossary + ADRs for the target subsystem (ubiquitous language) — to judge sharp vs fuzzy against the real domain model.
- For a **bad** verdict: the traced **reason** (recorded verbatim; never a silent drop).

## Outputs

- The Idea moved `draft → grilled` (sharp), `draft → spiking` (fuzzy), or `draft → rejected` (bad) — recorded via the `idea-intake` MCP, never a direct write.
- The **verdict** + **provenance** recorded with the transition.
- Zero or more **OpenQuestions** in provenance for every gap (undefined term, claim you cannot yet judge falsifiable).
- Nothing applied, nothing frozen, no mirror written.

## BDD / mirror required before use

The engine this gesture drives ships its proof first (S28, `back/runtime/exploration/`):
- The **journey** `tests/runtime/exploration.feature` (Godog) asserts: a fuzzy intention → `spiking` with ratchet OFF / T0 + recorded verdict & provenance; a sharp intention → `grilled` (skips spike); a bad idea → `rejected`, traced.
- The `Idea`-status-machine **fixture** asserts `draft --grill(sharp)--> grilled`, `draft --grill(fuzzy)--> spiking`, `draft --grill(bad)--> rejected`, each transition emitting verdict + provenance.
- The **rapid property** asserts the reachable status set is the closed `{draft,grilled,spiking,harvested,rejected}` (no invented sixth status), and an Idea never carries a frozen version or a mirror.

## Steps

1. **Resolve the Idea.** Read it via the `idea-intake` MCP. Confirm status is `draft` — grill triages a fresh candidate. If it is not draft, stop (it has already been routed).
2. **Challenge the intention.** Read the intent + provenance against the subsystem `CONTEXT.md` glossary and ADRs. Ask: *can this be stated as a red mirror right now?*
3. **Decide the verdict** (closed set, no fourth value):
   - falsifiable now → **sharp**;
   - needs a throwaway probe → **fuzzy**;
   - a bad idea → **bad** (write the traced reason).
4. **Record the transition.** Persist the routed status + the verdict + provenance via the `idea-intake` MCP (`idea_grill` for sharp/fuzzy; `idea_reject` for bad). Attach OpenQuestions for anything you could not ground.
5. **Hand off.** sharp → `/harvest` (straight to a candidate); fuzzy → `/spike` (probe first); bad → done (rejected, traced). Stop here — you do not write a mirror or open a `/goal`.

## Stop conditions

- The Idea is routed to exactly one of `grilled | spiking | rejected`, with its verdict + provenance recorded.
- A `bad` verdict carries a **traced reason** (the idea is kept, never deleted).
- The kernel and mirrors schemas were **not** written (the wall held).
- Every gap is an **OpenQuestion** in provenance, not an invented fact.

## Failure modes

- **Inventing a fourth verdict** — the set is closed `{sharp, fuzzy, bad}`. Anything else is forbidden.
- **Treating a spike as a tracer bullet** — a fuzzy verdict opens the *throwaway* `/spike` zone, not a kept end-to-end wiring (CONTEXT-MAP `_Avoid_`).
- **Freezing in passing** — writing the kernel/a mirror at grill time. Grill *routes*; it never freezes. You have no GRANT anyway.
- **Silently dropping a bad idea** — a `bad` verdict is `rejected` *traced*, append-only; never a deletion.
- **Declaring done** — grill leaves a routed candidate, not a truth.

## Related hooks

- **spike-confinement** (`back/hooks/spike-confinement`) — once a fuzzy idea is `spiking`, refuses any write escaping `/spike` with `SPIKE_WRITE_ESCAPES_ZONE`; refuses a harvest write to the kernel/a mirror with `HARVEST_CANNOT_FREEZE`. Ships with a fault-injection test.
- **promotion-gate** (`back/hooks/promotion-gate`) — downstream, refuses promoting a mirror-less idea into the kernel (`NO_MIRROR_NO_KERNEL`).

## Related MCP tools

- **idea-intake** — `idea_get` to read the draft Idea; `idea_grill` to record `→ grilled | spiking`; `idea_reject` to record `→ rejected` (traced); `idea_list` to find candidates.
- **context** / **memory** — pull the ContextGraph and prior episodes to judge falsifiability against the real domain.

## Workbench visualization

Next route `front/web/app/exploration/` → `/exploration` (the "Grill & Spike Lab"; do not touch existing routes): render the Idea travelling `draft → grilled → spiking → harvested` with `rejected` as a traced off-ramp, the verdict that routed it, and the ratchet-OFF / T0 badge on the spike zone. A Playwright e2e (`tests/e2e/exploration.spec.ts`) asserts the routing.

## Honesty rules

Never invent a `target`, a `targetId`, a business rule, or a verdict outside the closed set `{sharp, fuzzy, bad}`. If you cannot judge whether an intention is falsifiable, that uncertainty is an explicit **OpenQuestion** in provenance for the human to resolve — never a silent guess. Grill *routes* a candidate; it never freezes truth, never writes a mirror, and never declares a goal reached. The AI may draft the verdict; the human owns the truth.
