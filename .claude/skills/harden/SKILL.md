---
name: harden
description: Add one sensor/guardrail per recurring scar — only after the failure has actually happened at least once for real, and only with a fault-injection test that proves the sensor fires. Use after a real incident/regression, when the user says "add a guardrail", "harden this", "make sure this never happens again", "add a sensor/hook for X", or when a recurring scar needs a non-bypassable rule.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# harden (KRD gesture)

## Purpose

Turn a **real scar** into a **living guardrail**. When a failure has actually occurred — an incident, a regression, a class of bug that keeps recurring — add exactly one sensor/hook that watches it, and prove the sensor is alive with a **fault-injection test** (break what it watches, assert it goes red). This is the §5 hook-honesty law made into a gesture: a guardrail that never fires is dead, so no guardrail is born without a real failure behind it and a fault-injection proof in front of it. A new artifact may **ADD** a guardrail, **never REMOVE** one (meta-loop rule).

## When to use

- A failure has **already happened at least once for real** (an incident, a red sensor, a regression caught in review) and you want it caught automatically next time.
- The user says "harden this", "add a guardrail/sensor/hook", "make sure this never happens again", "this keeps breaking".
- Step loop point 9 / §5: a **non-bypassable rule** is the right artifact (the wall, a sensor, a stop condition, completeness) — answer yes, then create it here.

## Inputs

- The **scar**: the concrete past failure, with at least one real occurrence (incident id, failing run, provenance entry). No real occurrence → stop; this is not hardening yet, it is a wish.
- What invariant/behaviour the guardrail should **watch**, in **ubiquitous language**.
- The right **phase** for a hook: `PreToolUse` (the wall / pre-write refusal) · `PostToolUse` (sensor at each diff) · `Stop` (completeness / finish gate) · `PostKernelChange` · `SessionStart`.
- Target subsystem context (`back/hooks/<phase>/`, `back/runtime/...`) and its `CONTEXT.md`.

## Outputs

- One **guardrail** — a Go hook binary under `back/hooks/<phase>/` (or a sensor in `back/runtime/`) — that watches the scar and returns an actionable `BlockReason` (`code, severity, explanation, how_to_fix[]`).
- A **fault-injection test** that breaks the watched behaviour and asserts the guardrail goes **red**, then restores it to green. Without this test the guardrail is presumed dead.
- A recorded link from the guardrail back to the **scar** (provenance: which real failure justifies it).
- Code only — never a truth or a mirror. Hardening adds a sensor; it does not author behaviour spec.

## BDD / mirror required before use

The fault-injection test **is** the red→green proof for this guardrail: write it first, watch it fail against the not-yet-built sensor, then build the sensor to green. If the guardrail also enforces a Kernel truth (e.g. the wall over `kernel`/`mirrors`/`fitness`), that truth's mirror lives in the `mirrors` schema and is authored via `/write-bdd-scenario` — not here. This gesture writes the sensor + its fault-injection test, never the truth.

## Steps

1. **Confirm the scar is real.** Find the at-least-one real occurrence (incident, failing run, provenance). No real failure → stop: do not pre-emptively harden against an imagined risk. Record the occurrence reference.
2. **Name what it watches**, in ubiquitous language: the precise condition that, when violated, means the scar recurred. One scar, one guardrail.
3. **Write the fault-injection test first** (red). Break the behaviour the guardrail must watch and assert the guardrail returns red with the right `BlockReason.code`. It must fail now (no guardrail yet) for the right reason.
4. **Build the guardrail** to green: a Go hook binary (`back/hooks/<phase>/`) or a runtime sensor, returning an actionable `BlockReason` (`code, severity, explanation, how_to_fix[]`). Wire it to its phase.
5. **Prove liveness.** Run the fault-injection test: guardrail red when the scar is reproduced, green when restored. A guardrail that stays green under injection is **dead** — fix it, do not ship it.
6. **Link to provenance** (the scar that justifies the guardrail) and confirm the meta-loop rule: this artifact ADDS a guardrail and removes none.

## Stop conditions

- The scar has a documented **real occurrence**; the guardrail links back to it.
- The **fault-injection test** turns the guardrail red when the watched behaviour breaks, green when restored (liveness proven).
- The guardrail returns an **actionable `BlockReason`** (`code, severity, explanation, how_to_fix[]`), not a bare failure.
- No guardrail was **removed or weakened**; no truth and no mirror were written.

## Failure modes

- **Hardening against an imagined risk** — no real occurrence behind the scar. Forbidden: a hook that never fired is dead on arrival. Wait for the real failure (or `/spike` to make it real).
- **No fault-injection test** — the guardrail is presumed dead; counts as not built. Always inject the fault and assert red.
- **Guardrail stays green under injection** — dead sensor; it watches the wrong thing or the wrong condition. Fix the watch, do not ship.
- **Removing/loosening an existing guardrail** to make a diff green — violates the meta-loop rule (ADD only). Escalate as an OpenQuestion instead.
- **Hardening into truth** — writing the `kernel`/`mirrors`/`fitness` schema instead of a sensor. Blocked by the wall; route any truth change through `idea → mirror → /goal`.
- **Vague `BlockReason`** — a refusal with no `how_to_fix[]`. The block must be actionable (see `/explain-block`).

## Related hooks

- `PreToolUse` (the wall) — the canonical guardrail: refuses writes to `kernel`/`mirrors`/`fitness` and returns a `BlockReason`. New wall-class guardrails extend it.
- `PostToolUse` (sensors) — diff-time guardrails; most hardening lands here, staying green at each diff.
- `Stop` (completeness) — finish-gate guardrails; blocks done when the scar's condition recurs.
- `PostKernelChange` / `SessionStart` — re-check guardrails after a truth change / at session open.
- Every hook authored here ships its own **fault-injection test** (§5 hook honesty).

## Related MCP tools

- `sensors` — register and run the new sensor/guardrail; drive the fault-injection pass to verify it goes red.
- `store` — read the Kernel AST (read-only) when the guardrail enforces a truth, to confirm what it watches; never write it.
- `idea-intake` — when the scar reveals a missing **truth** (not just a missing sensor), open the `idea → mirror → /goal` door instead of hardening code.
- `telemetry-reader` — pull the real occurrence(s) of the scar (incidents, prior red runs) to ground the guardrail.

## Workbench visualization

`front/web/` — a **Guardrails / Sensor Health** panel: each guardrail with its scar (the real occurrence that justifies it), its phase, and a **liveness badge** (fault-injection red→green = alive; never-fired = dead). Add or extend that route's Playwright e2e for the visualization; never touch existing routes.

## Honesty rules

Never invent a `target`, `targetId`, or business rule — and never invent the scar. If there is no real occurrence, or the watched condition, an id, or a rule is unknown, it becomes an **OpenQuestion** (an idea/provenance entry), never a guess written into the guardrail. A guardrail with no real failure behind it, or no fault-injection proof in front of it, is not hardening — it is a dead hook.
