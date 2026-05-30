---
name: learn
description: Turn a telemetry signal or incident (a RealityMirror divergence) into a draft Idea with provenance — the only legal on-ramp from production reality to the kernel. Use whenever a sensor/meter trips, an incident is filed, prod telemetry diverges from a mirror, or someone says "learn from this incident", "capture this signal", "reality says X, feed it back", or "what should we change after #NNNN".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# learn (KRD gesture)

## Purpose

Reality is a mirror too. When the **RealityMirror** (the external-world / production mirror, KRD Livre XX §3528) diverges from a Kernel truth — a sensor or meter trips, an incident lands, telemetry drifts — that signal must **re-enter the OS as a candidate, never as a fix**. `learn` captures the signal as a **`draft` Idea** in the `ideas` schema with its **provenance** (`incident:#NNNN` or the telemetry/sensor reference), and stops there. It opens the door `idea → mirror → /goal → human approval`; it never walks through it. Reality writes to the kernel **only** along that path (the MemoryFirewall one-way flow, S30: `signal → Idea → Mirror → Goal → Kernel`).

## When to use

- A **sensor** (computational / inferential) or a **meter** (budget) goes red against live behaviour, and the divergence is worth keeping.
- An **incident** is filed (`#NNNN`) and you want to feed its lesson back into the OS without hand-patching truth.
- Production **telemetry** diverges from what a mirror asserts (the reality-mirror gap) and someone says "learn from this", "capture this signal", "reality says X".
- Step loop / `/diagnose` aftermath: a real failure produced a finding that belongs upstream of `/grill`, `/spike`, `/harvest`, `/goal`.

## Inputs

- The **signal**: an incident id (`#NNNN`), a tripped sensor/meter id, or a telemetry divergence record — read-only, via the `telemetry-reader` / `sensors` MCP. Never paraphrased into a guess.
- The **observed reality vs. expected mirror**: what production did vs. what the reflected truth asserts.
- The candidate **`proposes`** target (which layer/kind a future truth might touch: `control | policy | operation | action | entity | product`) — **only if grounded** in the signal or supplied by a human. Unknown → OpenQuestion.
- The relevant `CONTEXT.md` / `CONTEXT-MAP.md` glossary + ADRs for ubiquitous language.

## Outputs

- One **`draft` Idea** in the `ideas` schema (via `idea-intake` `idea_capture`): `proposes`, `intent` (the sketched, **not-yet-falsifiable** lesson in prose), `provenance = incident:#NNNN | telemetry:<ref>`. Explicitly **no version-freeze, no mirror** — that is exactly what keeps it an Idea, not a truth.
- The **provenance link** back to the originating signal (who/what/when/why), so the chain reality → Idea is traceable.
- Zero or more **OpenQuestions** in provenance for every gap you could not ground (unknown target, undefined term, a divergence you cannot yet make falsifiable).

## BDD / mirror required before use

`learn` produces a *candidate*, not a behaviour, so it writes no truth-test of its own. The engine it drives ships its proof first (S27 ideas-lifecycle, S30 memory-firewall): the `Idea` lifecycle **fixture** asserts `Capture(proposes, intent, provenance) → Idea{draft}` with provenance preserved; the firewall **gate** asserts the direct edge `signal/Memory → Kernel` is **always refused** (`MEMORY_CANNOT_DECLARE_TRUTH`), and the only legal continuation is `→ Idea → Mirror → Goal`. If those substrates aren't built yet, the captured Idea is materialized as a file + that fixture (the red→green proof), back-filled to Postgres at S27 — a documented OpenQuestion, not a block.

## Steps

1. **Read the signal at the source.** Pull the incident / tripped sensor / telemetry divergence read-only via `telemetry-reader` / `sensors`. Confirm it is a real RealityMirror gap (production vs. mirror), not a flaky run. If it can't be reproduced or grounded, record an OpenQuestion and stop.
2. **Name the divergence in ubiquitous language.** State what reality did vs. what the reflected truth asserts — the *lesson*, not the stack trace. Use the words from `CONTEXT.md`.
3. **Sketch `proposes`.** Identify which layer/kind a future truth *might* touch (`control|policy|operation|action|entity|product`) **only if the signal grounds it**. Absent or ambiguous → OpenQuestion, never invented.
4. **Capture the Idea.** Persist a `draft` Idea via `idea-intake` `idea_capture`: `intent` = the prose lesson (not yet falsifiable), `provenance = incident:#NNNN | telemetry:<ref>`. Attach the provenance chain and every OpenQuestion. Do **not** write a mirror, do **not** freeze, do **not** stage the `kernel` schema.
5. **Hand off downstream.** Surface the new Idea and stop. Sharpening is `/grill`; probing is `/spike`; lifting the durable lesson is `/harvest`; freezing (writing the mirror) is `/goal` + human approval. `learn` only opens the door.

## Stop conditions

- A `draft` Idea exists with `provenance` traceable to the originating signal, **no version-freeze and no mirror**.
- The `kernel` / `mirrors` schemas were **not** written (the wall held; the agent has no GRANT anyway).
- Every gap is an **OpenQuestion** in provenance, not an invented target / rule.
- You did **not** open a `/goal`, write a mirror, apply anything, or declare a fix — promotion is the human's, downstream.

## Failure modes

- **Patching truth in passing** — editing the kernel/mirror to "fix" the incident directly. Blocked by the wall (`PreToolUse`) and the MemoryFirewall gate (`MEMORY_CANNOT_DECLARE_TRUTH`). Capture an Idea instead.
- **Inventing a `proposes` target or a business rule** to make the Idea look actionable → forbidden; emit an OpenQuestion.
- **Capturing the symptom, not the divergence** — pasting a stack trace as `intent`. Carry the *reality-vs-mirror lesson* in ubiquitous language.
- **Learning from a flake** — a non-reproducible sensor blip is not a RealityMirror gap; ground it or drop it (OpenQuestion).
- **Attaching a mirror** — a captured Idea never carries a mirror; that arrives only at `/goal`.
- **Declaring done / shipping a fix** — `learn` leaves a candidate. "Done" is computed downstream (§8), never declared here.

## Related hooks

- `PreToolUse` (the wall) — refuses any write to `kernel` / `mirrors` / `fitness`; route the signal through `idea-intake` instead. Ships a fault-injection test.
- **memory-firewall / `pretooluse`** — refuses the direct edge `signal/Memory → Kernel` with `MEMORY_CANNOT_DECLARE_TRUTH` (`how_to_fix[]` = "signal → Idea → Mirror → Goal → Kernel").
- `Stop` (completeness) — a half-finished capture (no Idea, no recorded provenance) blocks the stop.

## Related MCP tools

- **telemetry-reader** — read incident / OpenTelemetry divergence records (read-only) to ground the signal.
- **sensors** — read the tripped sensor / meter verdict that flagged the RealityMirror gap.
- **idea-intake** — `idea_capture` to record the `draft` Idea with `provenance` (no freeze, no mirror); `idea_list` to dedupe against existing candidates.
- **store** — read existing kernel targets (read-only) to ground a candidate `proposes`; never write it.

## Workbench visualization

Next route `front/web/app/ideas/` → `/ideas` (the idea board; do **not** touch existing routes): the captured Idea appears in the `draft` lane with its `provenance` (the `incident:#NNNN` / telemetry ref) and an explicit "no mirror yet — promotion needs /goal" marker. A `/reality` (RealityMirror) panel may surface the divergence that spawned it, linked to the Idea. Extend the route's Playwright e2e to assert the signal renders as a `draft` Idea carrying its provenance and no mirror.

## Honesty rules

Never invent a `target`, a `targetId`, a `proposes` layer, or a business rule to make the captured Idea look actionable — every gap (unknown target, undefined term, a divergence you cannot yet make falsifiable) becomes an explicit **OpenQuestion** in provenance for the human to resolve. `learn` records what reality showed and its provenance; it never freezes truth, never writes a mirror, and never declares a fix.
