---
name: feedback-assert-self-comparison-vacuity
description: Watch for assertions/UI proofs that compare a value against ITSELF (same fn both sides) — tautologically green, prove nothing
metadata:
  type: feedback
---

A "single-source" / "no drift" / "parity" proof that calls the SAME function on both sides of the comparison is vacuous — it asserts `x === x` and is always green even if the property is broken.

**Why:** EL06 had this twice. The "Prouver la source unique" control (runSource in BesoinThresholdsPanel.tsx) and the TS twin test (besoin-thresholds.test.ts) both did `requiredFieldsFor(l) === requiredFieldsFor(l)`. The comment claimed "specOf is the single source; requiredFieldsFor must equal it" but never called specOf. The Go-side property did it correctly (RequiredFieldsFor vs RequiredFields — two distinct fns). Sibling of [[feedback-assert-semantics-not-count]] (count-only) and the godog duplicate-regex dead-code class: the assertion LOOKS like it proves the property but the two operands are identical.

**How to apply:** when a mirror/control claims to prove A==B (parity, single-source, no-second-copy, twin-equivalence), confirm the two operands are DISTINCT sources (e.g. accessor-under-test vs raw underlying data, Go output vs TS output, record-derived vs spec-derived). If both sides resolve to the same call, the proof is dead — rewire one side to the independent source. Re-run; it should still be green if the property holds, but now it can go red on a real drift.
