# CONTEXT — examples/checkout (the canonical demo slice)

`examples/checkout` is **not a subsystem** of AIDOS. It is the **one canonical example app** that *uses* the OS: a self-contained slice that drives a single intention through the full KRD loop, end to end, red → green. It holds **no hand-authored truth** and **no hand-authored projection** — every kernel AST and every projection is produced by running the prior teeth (S35 / S10 / S11 / S29 / S20 / S34–S38 / S23). It holds only **example-local artifacts**: the seed Idea text, the expected-stage oracles the slice asserts against, the slice fixture, and this glossary.

## Glossary

**The slice**:
The single end-to-end vertical this example exercises: *Idea → Goal → Kernel → Mirror → Src → Stable*, for the one behaviour "a customer places an order from their cart". It is a **composition acceptance** — it proves the OS the prior 45 teeth built can carry one behaviour from intention to a clickable, green button. It is **not** a new capability, a new truth table, a new DSL, a new emitter, a new MCP, or a new hook.
_Avoid_: treating the slice as new product logic; it composes, it does not re-implement.

**The Idea ("place an order from the cart")**:
The seed **candidate-truth** the slice begins from: *"a customer places an order from their cart"*. It lives in the `ideas` schema (S27 intake) with its provenance. A candidate-truth is **not** truth — no freeze, no kernel write at intake.
_Avoid_: calling the Idea "the Order entity" or "the truth"; it is the seed, above the wall.

**Cart**:
The collection of **line items** a customer is about to order. In the slice the Cart is the **command input** to `createOrder` (the `$.cart` state slot the operation reads), never a hand-authored entity table. The slice's worked cart has exactly **2 line items**.
_Avoid_: inventing a Cart entity AST here; the operation reads `$.cart`, the test supplies it through the operation's Reader seam.

**Line item**:
One entry in the Cart — the unit the Order carries. The slice asserts only that the placed Order's line items **match the cart** (2 in, 2 out): no phantom item, no dropped item.
_Avoid_: attaching a price/quantity rule the Idea does not pin (see *pricing, out of scope*).

**Order**:
The entity created when the customer places the order — the prior `entities.Order()` source (S35), read SELECT-only. The slice **creates** an Order from the cart's line items via `createOrder`.
_Avoid_: editing the Order entity here; it is prior truth, consumed read-only.

**place / create order (`createOrder`)**:
The single operation the slice drives — the prior `operation.CreateOrder()` (S10): validate → authorize → read `$.cart` → mutate-create `Order` → clear cart → return the order. Its button is `control.CheckoutButton()` bound by `action.CheckoutSubmit()` (S11).
_Avoid_: coining a new operation/control/action; the slice reuses the pinned anchors verbatim.

**The loop (Idea → Goal → Kernel → Mirror → Src → Stable)**:
The ordered chain the slice walks: **intake** the Idea (S27) → open a **`/goal`** that writes the **red set** for `createOrder` (the red *is* the goal, S29) → promote the candidate `Order` + `createOrder` ASTs into the **Kernel** *only through an approved ChangeSet* (S20, the door) → confirm the **Mirror** reflecting `createOrder` is **live** (S06/S12, no monster) → emit the **Src** projections (Go handler S36, Postgres DDL S37, Next view S38) → seal a **Stable** phase on the dag (S23/S24).
_Avoid_: a kernel side-write — the agent has no GRANT (§2); truth enters only via the approved ChangeSet.

**The Workbench panel (`/demo-checkout`)**:
AIDOS's **own UI** route that *visualizes the loop for this slice* — the seeded Idea, the red set, the kernel ASTs + content hashes, the Mirror liveness badge, the emitted projections, and the **live cart + checkout button** with the placed-order result, capped by a *phase = Stable? / all-green?* badge. Read-only over truth.
_Avoid_: confusing this Workbench panel with the **emitted** cart/checkout view (the projection the OS emits for the example app); the panel renders the former and shows the latter.

## Out of scope (would be monsters / invention)

**pricing, tax, discount, inventory, payment**:
None of these is in the Idea, so none is invented here. The `Order` entity carries a `total` attribute (prior truth from S35); the slice **does not** assert or compute a total — the mutate seam owns it, and the slice asserts only the line items. Any temptation beyond "create an order from a cart" becomes an **OpenQuestion** in provenance, never a guessed default.
