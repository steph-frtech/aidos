# ContextRouter compile fixture (state graph+goal+branch → command compile → events ContextPack)

- reflects: `runtime.context.Compile` (the ContextRouter, KRD §144) / `runtime.context.ContextPack` (KRD §143)
- test_kind: fixture (N2, KRD §142/§143/§144 — le ContextRouter compile un ContextPack minimal)
- cert_language: operation-dsl/go
- liveness: live
- authority: above (the human's rule — a checkout goal does not receive billing internals;
  stale and out-of-scope memory are excluded; KRD §119.3/§141/§143/§144/§145)

> Conceptually stored in the `mirrors` schema; persisted to Postgres at S06 (bootstrap
> exception). This file is the **lien porteur**: the materialized source the Go fixture
> interpreter (`context_router_fixture_test.go`) mirrors row by row. If the fixture intention
> disappears the test breaks (no silent rot into a monster).

The targets (`checkout-apply-promo`, `view:cart`, `control:promo-field`, `operation:applyPromo`,
`billing:invoice-internals`, `catalog:product`, the mirrors, the contracts, the memory records)
are the **method's** example artifacts (the S33 spec fixture). The router coins **no** new
business rule: it READS the ContextGraph view handed to it and emits the minimal pack. The pack
is **compiled from the red-set** (S22, reused, not recomputed), over the **affected subgraph**
(§142), and is **content-addressed** (`hash`) + reproducible (same input ⇒ byte-identical pack).

---

## Fixture A — the checkout-apply-promo pack INCLUDES the checkout subgraph + load-bearing kernel + red mirrors (THE done criterion, part 1)

- state (ContextGraph snapshot):
  - goal: `checkout-apply-promo` on branch `main`
  - red_set (from S22, NOT recomputed): `[ view:cart, control:promo-field, operation:applyPromo ]`
  - layers: `[ view:cart, control:promo-field, operation:applyPromo, billing:invoice-internals, catalog:product ]`
  - mirrors: `[ promo-field.fixture(red), applyPromo.workflow(red), canPlaceOrder.property, billing.dunning.fixture ]`
  - contracts: `[ checkout-api@hash, PaymentGateway@hash (BC boundary, PUBLIC), billing-internal@hash ]`
  - memory: `[ idempotency-for-payment(confidence:repeated, scope:checkout),
               out-of-stock-incident(scope:checkout, incident),
               old-promo-rule(stale),
               refund-window(scope:billing) ]`
- command (compile): `{ goal: "checkout-apply-promo", branch: "main" }`
- events: `[ ContextPackEmitted ]`
  - `pack.affected_layers == [ view:cart, control:promo-field, operation:applyPromo ]` (exactly the red layers)
  - `pack.active_kernel.mirrors` contains `[ promo-field.fixture, applyPromo.workflow, canPlaceOrder.property ]`
  - `pack.active_kernel.contracts` contains `[ checkout-api@hash, PaymentGateway@hash ]` (the neighbor PUBLIC contract crosses the BC boundary)
  - `pack.boundaries.bounded_context == "checkout"`
  - `pack.boundaries.allowed_paths` contains `/src/checkout/**`
  - `pack.boundaries.forbidden_paths` contains `[ /kernel/**, /mirror/** ]` (the wall rendered as a boundary)
  - `pack.stop_condition == "red_set_green AND previous_green_intact AND aggregate_complete"`
  - `pack.hash != ""` (content-addressed, reproducible)

## Fixture B — THE done case: billing INTERNALS, cross-BC contract, stale + out-of-scope memory are EXCLUDED (THE done criterion, part 2)

- state: same snapshot as Fixture A
- command (compile): `{ goal: "checkout-apply-promo", branch: "main" }`
- events:
  - `pack.affected_layers` does NOT contain `billing:invoice-internals` (cross-BC)
  - `pack.affected_layers` does NOT contain `catalog:product` (not load-bearing for the red-set)
  - `pack.active_kernel.mirrors` does NOT contain `billing.dunning.fixture` (cross-BC)
  - `pack.active_kernel.contracts` does NOT contain `billing-internal@hash` (internal, not a crossed PUBLIC contract)
  - `pack.memory.relevant_lessons` contains `idempotency-for-payment`
  - `pack.memory.recent_incidents` contains `out-of-stock-incident`
  - `pack.memory` does NOT contain `old-promo-rule` (stale → forbidden, KRD §119.3)
  - `pack.memory` does NOT contain `refund-window` (out-of-scope: billing → forbidden, KRD §119.3)
  - each excluded item carries its reason: `cross-BC` / `stale` / `out-of-scope` / `cosmetic-below-threshold`

## Fixture C — determinism + content-addressing (same input ⇒ identical pack + identical hash)

- state: same snapshot as Fixture A
- command (compile twice): `{ goal: "checkout-apply-promo", branch: "main" }`
- events:
  - the two emitted packs are byte-identical (same canonical encoding)
  - `pack1.hash == pack2.hash` (content-addressed; reuses the S01/S02 Canonicalize/Hash scheme, not forked)

## Fixture D — branch-awareness (changing the branch can change the cut, but never leaks another branch's nodes)

- state:
  - a node `view:cart` exists on branch `main`; a node `view:cart-v2` exists only on branch `feature/cart-redesign`
  - goal `checkout-apply-promo` red_set on `main`: `[ view:cart, control:promo-field, operation:applyPromo ]`
- command (compile on `main`): `{ goal: "checkout-apply-promo", branch: "main" }`
- events:
  - `pack.branch == "main"`
  - `pack.affected_layers` contains `view:cart`
  - `pack.affected_layers` does NOT contain `view:cart-v2` (a node from another branch never leaks)

## Fixture E — every pack always forbids the wall and carries a non-empty stop condition (KRD §2, §143)

- state: any snapshot, any red goal, any branch
- command (compile): `{ goal: <any>, branch: <any> }`
- events:
  - `pack.boundaries.forbidden_paths` always contains `/kernel/**` and `/mirror/**` (the router never emits a truth-write path)
  - `pack.stop_condition` is non-empty (where you are, what to do, what you cannot touch, how you know you are done — §143)
