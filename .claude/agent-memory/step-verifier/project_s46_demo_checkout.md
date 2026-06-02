---
name: s46-demo-checkout
description: S46 demo-checkout SLICE — thin composition-acceptance of prior teeth (no new truth/DSL/emitter/MCP/hook); full KRD loop end-to-end, verified-green
metadata:
  type: project
---

S46 = the canonical **composition-acceptance slice** (`back/runtime/checkout/`). It authors NO new capability — pure `RunSlice` CALLS prior teeth in loop order (S27 idea → S29 OpenGoal → S20 changeset.Apply via the completeness gate `SpecHasMirror` → S06 mirror-live → S34/36/37/38 emitters → S10 createOrder via injected `OrderStore` seam → S23 phases.IsStable), emitting the ordered N2 event list `[IdeaIntaken,GoalOpened,ChangeSetApplied,MirrorLive,ArtifactsEmitted,OrderPlaced,PhaseSealed]`.

**Wall respected:** kernel write is the approved completeness-gated ChangeSet (OpenGoal leaves it DRAFT; Apply admits to APPLIED). The four anchors (entities.Order, operation.CreateOrder, control.CheckoutButton, action.CheckoutSubmit) reused verbatim read-only via the S02 content-hash scheme (records.Hash∘Canonicalize, never forked). Order persistence is an injected seam, below the waterline.

**Determinism-first:** RunSlice pure given seam + two stamps (ParentPhase, AppliedAtNs args — no clock/RNG). TS twin `front/web/lib/demo-checkout.ts` = same shape; reproducibility mirror `demo-checkout.test.ts` (5/5).

**Mirrors green (re-verified fresh):** Godog N0 acceptance drives the loop against REAL Postgres (Testcontainers spun a container, 4 scenarios / 17 steps green — persists demo_order + demo_order_line, reads back, asserts line items match cart). Fixture N2 8/8 (named-ref assertions: red set contains `examples.checkout.full-loop`, content-idempotent same ASTs+phase, empty-cart→BlockReason). Property rapid 4/4 (N-in-N-out, idempotence, empty-cart-blocks, kernel-write=spec+mirror). Playwright e2e 3/3 on a fresh server (port-targeting matters — :3100 was stale 404; ran PLAYWRIGHT_WEB_PORT=3210).

**ui-completeness:** /demo-checkout action-capable — checkout button PLACES the order on click (dispatches the TS-twin slice), shows placed order + stable badge. i18n 26 keys matched FR/EN; nav.demoCheckout in both; heading "Démo checkout"/"Demo checkout" matches e2e regex. Docs: concept+internals (3 layers) live, registered docs.json, pushed origin/main b03fbdc, mint validate clean.

**OpenQuestions (forward-deps, NOT residual):** (1) pricing/tax/total deliberately out of scope — never invented; PlacedOrder carries only id+items. (2) a callable demo_checkout_run MCP/CLI op not built (composition slice needs none). (3) Linear S46 issue could not flip to Done — linear-server MCP only exposes `authenticate` (OAuth), recorded as OQ per verifier step 5.

Verified-green.
