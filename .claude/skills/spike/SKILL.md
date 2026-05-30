---
name: spike
description: Enter the /spike exploration zone — ratchet OFF, rigor T0, throwaway code — to make a fuzzy intention falsifiable before it ever nears the kernel. Use whenever an Idea is fuzzy/not-yet-falsifiable, /grill routed it to "spiking", classify-truth marked a claim non_verifiable, or someone wants to probe/experiment/sketch a design without committing truth. Writes are confined to /spike only; the cliquet does not apply here.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# spike (KRD gesture)

## Purpose

Open the **`/spike` exploration zone** — **ratchet OFF, rigor T0, throwaway** (KRD §84: "cliquet OFF ; zone `/spike` ; KRD serait net-négatif ici"). A spike exists to make a **fuzzy** intention *falsifiable*: probe, sketch, throw code at the wall until the discovered intention is sharp enough to `/harvest`. The cliquet (forward-only ratchet) **does not apply** here — none of this is truth, none of it is mirrored, none of it graduates directly to the kernel. Every write a spike performs is confined to the `/spike` prefix; a write that escapes is refused.

## When to use

- `/grill` (or `classify-truth`) judged an Idea **fuzzy / non-verifiable** and routed it to `spiking` — the intention can't yet be stated as a red.
- You need to *try something* (a data shape, an algorithm, a library, an interface) to learn whether a truth is even possible, before paying for a mirror.
- You are at the **idea entry-stage**, above the wall, and a prompt is tempting you to jump straight to code. Spike instead, then `/harvest`.

> **Not a tracer bullet.** A tracer bullet / walking skeleton is real, kept, end-to-end wiring. A spike is **throwaway** (CONTEXT-MAP `_Avoid_`). If you mean to keep it, you are not spiking.

## Inputs

- An **Idea** with `status: spiking` (KRD §118) — its `intent`, `provenance: human|incident`, and id. Read-only from the `ideas` schema via MCP; never invented.
- The fuzzy question to resolve: "what would make this intention falsifiable?"
- Target subsystem `CONTEXT.md` for the ubiquitous language (so the discovery uses the right words).

## Outputs

- **Throwaway artifacts under `/spike/` only** (e.g. `/spike/retry-probe.go`) — code, notes, measurements. Disposable by definition.
- The **discovered intention** in ubiquitous language: a now-falsifiable statement ready to hand to `/harvest`.
- Zero or more **OpenQuestion** records (provenance) for every gap the spike could not resolve.
- The Idea's `spiking` status + spike provenance recorded **via the `idea-intake` MCP**, never by hand.

## BDD / mirror required before use

A spike is the **one zone exempt from "mirror first"** — that is the whole point of ratchet-OFF T0 (KRD §84): a fuzzy intention has no red yet, so you cannot write its mirror. The spike's job is to *find* the red. Therefore: **write no mirror, freeze nothing, certify nothing.** The proof obligation returns the moment you leave the zone — `/harvest` produces a DRAFT Truth, and only a later `/goal` writes its mirror (the freeze). The spike itself ends at "the intention is now falsifiable", not at green.

## Steps

1. **Confirm the Idea is `spiking`.** Read it via the `idea-intake` MCP. If it is not fuzzy (sharp → `grilled`, bad → `rejected`), you should not be spiking — stop. If the status is unknown, raise an **OpenQuestion**; do not assume.
2. **Frame the unknown.** State, in one line, the falsifiability question the spike must answer. This is what success looks like — not working code.
3. **Probe — write throwaway code under `/spike/` only.** Sketch, measure, try the library, break things. Keep every path under the `/spike` prefix; the spike-confinement hook refuses anything else (`SPIKE_WRITE_ESCAPES_ZONE`).
4. **Stay honest about the line.** Do not touch `kernel` / `mirrors` / `fitness` (the wall, §2). Do not edit real `back/<subsystem>/`, `back/gen/`, or `front/web/` code — that is graduation, forbidden here (KRD §60.x: "PAS de graduation directe").
5. **Capture the discovery.** Write down the now-falsifiable intention in ubiquitous language, plus what you measured/learned. Anything unresolved → an **OpenQuestion**.
6. **Hand off to `/harvest`** to extract the discovered intention as a DRAFT-Truth proposal. The throwaway spike code is *not* carried forward — it is rebuilt under the ratchet later.

## Stop conditions

- The falsifiability question is **answered** (the intention is now sharp enough for `/harvest`) — or it is provably not, recorded as an OpenQuestion + a traced rejection.
- **All writes stayed under `/spike/`** (zero escapes); the wall is intact.
- **No mirror written, no truth frozen, nothing graduated** to the kernel or to real code.
- The discovered intention and every gap are recorded via the `idea-intake` MCP (a decision, not an edit).

## Failure modes

- **Graduating the spike.** Copying spike code into `back/`/`front/` or freezing it as truth — violates "no direct graduation" (KRD §60.x). Harvest proposes; the human freezes via `/goal`; the code is **rebuilt**.
- **Write escapes the zone.** A write outside `/spike` → blocked with `BlockReason` code `SPIKE_WRITE_ESCAPES_ZONE`, `how_to_fix: ["confine_write_to_/spike", "run_/harvest_to_propose_a_kernel_delta"]`. Move the write under `/spike`.
- **Spiking a sharp idea.** If the intention was already falsifiable it should be `grilled`, not `spiking` — you are burning the budget the ratchet exists to save (KRD §84). Re-route.
- **Mistaking a spike for a tracer bullet.** Keeping the throwaway. Throw it away.
- **Inventing the answer.** Fabricating a target/targetId/business rule to "finish" the spike. Uncertainty is an OpenQuestion, never a guess.

## Related hooks

- **spike-confinement** (`back/hooks/`, S28) — the non-bypassable rule: while an Idea is `spiking`, every write path must be under `/spike` or it is refused (`SPIKE_WRITE_ESCAPES_ZONE`); ships with a fault-injection test (spiking write to `/kernel` must go red).
- **`PreToolUse`** (the wall) — refuses any write to `kernel` / `mirrors` / `fitness` regardless of zone.

## Related MCP tools

- `idea-intake` — `idea_spike` (records `→ spiking`, opens the ratchet-OFF zone + provenance), `idea_get`, `idea_list`; the `aidos` CLI write-grant on the `ideas` schema (the agent role never writes ideas directly).
- `store` — read-only, to confirm an existing target/term the discovery references (never to write).

## Workbench visualization

`front/web/app/exploration/` → `/exploration` (the "Grill & Spike Lab", KRD §3227): the Idea on the `draft → grilled → spiking → harvested` track with the **ratchet-OFF / T0** badge on the spike zone, the confined-write list with any escaping write rendered red (`SPIKE_WRITE_ESCAPES_ZONE` + `how_to_fix`). Extend that route's Playwright e2e for the visualization; do not touch existing routes.

## Honesty rules

Never invent a `target`, a `targetId`, or a business rule to make a spike look conclusive — every gap (undefined term, unknown scope, unresolved unknown) becomes an **OpenQuestion** in provenance, never a guess. A spike that "discovered" something it cannot state as falsifiable has not finished: record the OpenQuestion and stop on that branch rather than fabricating a clean result.
