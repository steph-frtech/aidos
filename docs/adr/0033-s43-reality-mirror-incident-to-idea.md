# ADR 0033 — S43 RealityMirror: incident → Idea (with provenance); the kernel is never auto-modified

- Status: accepted
- Date: 2026-06-01
- Step: S43 (AIDOS Runtime / Mirror plane — `back/runtime/reality`)
- Supersedes / amends: none. Extends the closed `BlockReason` enum (S13/ADR additive) and reuses S01 content-hash, S27 idea-intake, S30 taint vocabulary.

## Context

KRD §53/§67/§117/§1099 describe the **external loop** (boucle ③): production reality is a **sensor** that READS the world and **PROPOSES**. A recurring failure or breached budget that no existing fixture covers means the kernel was incomplete ("faux par omission"); the loop must turn that **incident** into a candidate the human can promote — never into a truth the agent writes. "Le système a appris du MONDE, pas de lui-même." Judging that the world disagrees with the kernel is a **truth decision**, above the line, owned by human + reality (§1099).

We needed to decide, without inventing business rules: the `Incident` body shape and its content address; how `proposes` is inferred-or-left-unset; the outward edge to the kernel; and the refusal code for the direct `Incident → Kernel` edge.

## Decision

1. **`Incident` is reality, never a truth.** The Go type (`back/runtime/reality`) carries `{ref, signal{operation,error,recurrence}, cause_sketch, taint[], linked_branches[], idea_id?}` and — by construction — **no `Version` and no `Mirror` field**. The `incidents.incident` Postgres table mirrors this: a CHECK forbids any `version`/`mirror` key in the body, and a CHECK requires `incident_derived` in `taint`. The `cause_sketch` is a **hypothesis**, never a falsifiable assertion. The id is `records.Hash(records.Canonicalize(body))` — the **S01/S02 content-hash scheme reused**, never forked; `idea_id` is the only mutable column and is excluded from the address.

2. **`Learn` never invents `proposes`.** `InferProposes` is a deliberately conservative pure function: a failing **operation** reference pins `proposes=operation`; **anything else is left unset (`""`)** and surfaces an **OpenQuestion** — a kind is never guessed (CLAUDE.md §8 honesty). Widening the inference is a later /goal, not a guess here. The produced idea is a S27 `draft` whose provenance is `{source: incident, detail: "#NNNN"}` carried **verbatim**, whose intent is the cause sketch, and which carries **no version and no mirror** (S27's `ideas.Idea` makes both unrepresentable).

3. **The only outward edge is `→ S27 idea_capture`.** `ToIdea(candidate)` returns the draft for the S27 idea-intake door; `LearnedIncident` traces the loop back via `idea_id`. There is **no** path to `kernel`/`mirrors`.

4. **`ToKernel` always refuses with `REALITY_CANNOT_DECLARE_TRUTH`.** A new **additive** `BlockReason` code (closed-enum extension, `change_type: refine`, never a removal) whose `how_to_fix` carries `incident_then_learn_then_mirror_then_goal_then_approval`. The direct edge is refused for **every** incident regardless of recurrence/taint — there is no high-recurrence bypass.

5. **No new Hook.** The wall (S04) + the S27 promotion-gate already forbid any `Incident → Kernel` write; the pure `ToKernel` gate reuses that `BlockReason` shape rather than adding a second enforcement point (OpenQuestion OQ-S43-hook if a distinct point proves needed).

6. **OpenTelemetry → Postgres, read path only.** A minimal `telemetry` schema (`telemetry.span`, `telemetry.metric`) the `telemetry-reader` MCP reads (SELECT-only for the agent). Full operation-level emission is out of scope.

7. **GRANTs (the wall + the asymmetry).** The agent role gets SELECT/INSERT/UPDATE on `incidents.incident` (UPDATE only to set `idea_id`), SELECT on `telemetry.*`, and keeps the already-granted S27 `ideas.*` capture path — and **no grant whatsoever** on `kernel`/`mirrors`/`fitness`. That asymmetry — observable reality that can never become truth without `incident → /learn → Idea → Mirror → Goal → Kernel` — is the RealityMirror at the row level. The migration is expand-only / append-only (incidents are kept, never deleted).

## Consequences

- Reality injects **ideas**, never truths; the kernel is provably not auto-modified (the property mirror checks `ToKernel` always blocks and never writes, for every incident).
- The mirrors: `reality_fixture_test.go` (the `out-of-stock-during-checkout` `#1043` done case + the `#2099` OpenQuestion case) and `reality_property_test.go` (rapid: provenance verbatim, no invented proposes, no version/mirror, append-only, content-addressed, ToKernel always blocks). A TS twin `lib/reality.ts` + `lib/reality.test.ts` (fast-check) pins the Workbench renders exactly what the engine computes.
- The `telemetry-reader` MCP carries `telemetry_query`/`incident_observe`/`incident_list`/`incident_learn` and **no** `incident_to_kernel` tool — there is no such door.

## Honesty / open questions

- **OQ-S43-proposes:** `proposes` is inferred only from a failing operation reference; richer signals (invariant/control/policy) leave it unset → OpenQuestion. Conservative by design.
- **OQ-S43-hook:** no distinct enforcement hook added; the wall + the S27 gate cover the edge. Revisit only if a real run proves a separate point fires.
- No kernel write/freeze is wired here: turning a learned idea into a frozen truth is the human's `mirror + /goal + approval`, a later wiring with a provenance link back to `incident:#NNNN`.
