# ADR 0018 — S19 weighted/thresholded propagation: the `critical` weight tier + `weight_evidence`

- Status: Accepted
- Date: 2026-05-31
- Subsystem: AIDOS Kernel (`back/kernel/propagation`)
- Linear: `S19 · Weighted propagation`

## Context

KRD §112 makes the red wave **weighted and thresholded** instead of a blind cascade along
`composes`: each edge carries a **declared** weight, each composite carries a **declared**
`activation_threshold`, and the parent's emergent invariant only reopens when the cumulative
activation of *changed* children crosses the threshold — so a **cosmetic** change does not redden
the parent while a **load-bearing** change does. S18 (`back/kernel/composes`, ADR 0017) landed the
`composes` edge value, the recursive aggregate, and the `load-bearing | cosmetic` activation pair.

S19 adds two things the §112 pair alone does not pin:

1. A **propagation engine** named at the §112 vocabulary — `FireParent(parent, changedChildren) →
   verdict` (the explicit "fire" step KRD §112 names), distinct from S18's `ReopensOnChange`
   boolean. S18 computes the *signal*; S19 computes the *verdict* the `/goal` / red-wave flow calls.
2. A **third, strongest weight tier — `critical`** — and its **admission discipline**: a `critical`
   link is rejected at admission **unless it carries `weight_evidence`** (a recorded provenance
   reference, e.g. an incident id). This is the §2463 backprop discipline: a link is re-weighted
   *upward* only on recorded evidence (a prod incident), never on a hunch.

The §112 frozen pair is `load-bearing | cosmetic`. **`critical` is NOT in KRD §112.** Introducing
it is an **above-the-line decision** (a new declared truth), so it must be recorded here, not
smuggled in as if KRD already pinned it (CLAUDE.md honesty rule).

## Decisions

1. **`critical` is a deliberate, declared extension of the §112 weight enum — recorded here, not
   invented in passing.** The closed weight set becomes `cosmetic | load-bearing | critical`. No
   fourth tier; no learned tier; weights stay **declared, never learned** (§2465/§2467).

2. **Tier ordering is monotone, declared, not learned.** `Activation(cosmetic)=0 <
   Activation(load-bearing)=1 < Activation(critical)=2`. The exact `critical` activation value (`2`)
   is a **declared choice** (an above-the-line constant), pinned here so it is inspectable, not a
   guess buried in code. It only needs to satisfy `critical ≥ load-bearing ≥ cosmetic` and to be
   able to cross a threshold a single load-bearing change would also cross — the monotone-ordering
   invariant (the rapid property) is the binding contract, the literal `2` is the chosen witness.

3. **`weight_evidence` is required iff `weight = 'critical'`.** `ValidateWeight(link)` rejects a
   `critical` link with empty `weight_evidence` and returns a §44.5 `BlockReason`
   (`code: "CRITICAL_WEIGHT_WITHOUT_EVIDENCE"`, `how_to_fix: [attach_incident_evidence,
   downgrade_to_load_bearing]`). `cosmetic`/`load-bearing` need no evidence. The engine validates
   **presence** of an evidence reference, not its truth — verifying an incident actually exists is
   provenance-lookup, a later step (recorded as an OpenQuestion / Known limit, not a guess).

4. **The engine is pure and reads only declared truth — it never writes the kernel (the wall).**
   `FireParent` / `ValidateWeight` are pure, total, deterministic functions over a graph value + a
   changed-set; no DB, no clock, no I/O. The weights/thresholds they read are `authority: above`
   (declared by the human); the *computation* is `authority: below`. Re-weighting a live link
   (cosmetic → load-bearing/critical after an incident, §2463) is a `reweight` SemanticDiff
   `change_type` (KRD §44.1) — a **later** step, not this one.

5. **Persistence is expand-only / append-only and never mutates the S18 substrate.** The per-edge
   `weight` keeps riding inside the `kernel.link` JSONB body (S17/S18 shape, no ALTER); S19 adds a
   `weight_evidence` provenance reference to that body and a side table
   `kernel.composes_weight_admission` that materializes the admission CHECK
   (`weight <> 'critical' OR weight_evidence IS NOT NULL`) and the enum CHECK
   (`weight IN ('cosmetic','load-bearing','critical')`) as inspectable, content-addressed,
   append-only truth. The `activation_threshold` keeps living in S18's `kernel.layer_activation`
   side table (no ALTER of `kernel.layer`). The agent role gets **SELECT only**; writes are
   REVOKEd (the wall).

## Open questions (recorded, not guessed)

- **Exact `critical` activation value.** KRD does not pin a number; `2` is the chosen declared
  witness satisfying the monotone-ordering invariant (decision 2). If the human pins a different
  value it is a one-line declared change, not a model retrain.
- **`weight_evidence` shape / validity depth.** S19 validates *presence* of a non-empty reference
  string only (e.g. `INC-2026-014`). Verifying the referenced incident actually exists in the
  `provenance` schema is a later step (provenance-lookup), recorded as an OpenQuestion.

## Consequences

- The done criterion of S19 — *a cosmetic change does not redden the parent; a critical weight
  without evidence is rejected* — is provable by the fixture + rapid property without any learned
  weight, any new hook, or any kernel write by the agent.
- The `critical` tier is a strict superset of the S18 `cosmetic | load-bearing` set: existing S18
  edges/verdicts are unaffected (a SemanticDiff `kind: add` on the weight enum, not a `refine`).
