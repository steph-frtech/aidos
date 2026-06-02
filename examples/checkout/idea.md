# Seed Idea — the slice's candidate-truth

> **a customer places an order from their cart**

This is the **seed Idea** of the demo-checkout slice — a **candidate-truth** destined
for the `ideas` schema via the S27 intake. It is **not** truth: no freeze, no version,
no mirror, no kernel write at intake (an idea carries none of those by construction).
Its provenance is **human** (`source: human`), the detail is the verbatim utterance
above (paraphrased by nothing).

What it proposes: a `createOrder` **operation** (proposes: `operation`). When promoted
through a `/goal` and an **approved ChangeSet** (the door, §2), it pins the `Order`
entity + the `createOrder` operation/control/action ASTs — all reused from the prior
anchors (S35 / S10 / S11), never hand-typed here.

Out of scope (NOT in this Idea, so NOT invented): pricing, tax, discount, inventory,
payment. The slice covers **exactly** "create an order from a cart". Any temptation
beyond that is an **OpenQuestion** in provenance, never a guessed default.

The Go-side seed is `checkout.SeedIdea()` (back/runtime/checkout/slice.go); this file
is the human-readable source of the same candidate-truth.
