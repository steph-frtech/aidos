# Expected-stage oracles — what the slice asserts against

These are the **test oracles** the demo-checkout slice asserts against — never the
source. The **source is the kernel**, derived through the loop; these expected shapes
are used only to prove the loop produced the right thing. (The executable oracles live
in `back/runtime/checkout/slice_fixture_test.go` + `slice_property_test.go` + the
Godog feature `tests/runtime/demo-checkout.feature`; this file is their human-readable
companion.)

## The ordered loop events (N2 `state → command → events`)

```
[ IdeaIntaken, GoalOpened, ChangeSetApplied, MirrorLive, ArtifactsEmitted, OrderPlaced, PhaseSealed ]
```

## The kernel ASTs the slice promotes (reused anchors, content-addressed via S02)

| Layer     | Anchor (prior tooth)            | Reused verbatim from |
|-----------|---------------------------------|----------------------|
| entity    | `entities.Order()`              | S35                  |
| operation | `operation.CreateOrder()`       | S10                  |
| control   | `control.CheckoutButton()`      | S11                  |
| action    | `action.CheckoutSubmit()`       | S11                  |

The four ids are `records.Hash(records.Canonicalize(anchor.body))` — re-running the
slice from a clean phase yields the **same** ids (content-idempotence).

## The worked cart and the placed order

```
cart  = { id: "cart-demo", items: [ {widget, ×2}, {gadget, ×1} ] }   # exactly 2 lines
order = { id: "cart-demo-order", items: <the same 2 lines, verbatim> } # N in ⇒ N out
```

The placed order carries **only** an id and its line items — **no total**, no tax, no
payment (out of scope, an OpenQuestion). The `Order` entity's `total` attribute (prior
S35 truth) is owned by the mutate seam and is **never asserted** by the slice.

## The honesty / wall invariants

- the kernel is written **only** through an **approved, completeness-gated ChangeSet**
  (the changeset reaches `APPLIED` carrying both a `spec_delta` and its `mirror_delta`);
- `OpenGoal` leaves the changeset **DRAFT** — at goal-open no kernel truth is written;
- an **empty cart** is a `BlockReason`, never an invented order, never a panic;
- the projections emit deterministically (byte-identical on re-emit, S34).
