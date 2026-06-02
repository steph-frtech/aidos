---
name: demo-checkout
description: Replay the canonical checkout SLICE through the full KRD loop (Idea → Goal → Kernel → Mirror → Src → Stable) from a clean phase and assert each stage. Use when someone says "run the demo checkout", "replay the slice", "drive the checkout intention through the loop", "prove the verticale end to end", or wants the composition-acceptance slice exercised from idea to a green, stable, clickable button.
---

# /demo-checkout — replay the end-to-end verticale

The `/demo-checkout` gesture replays AIDOS's **canonical composition acceptance**: it
drives ONE intention — *"a customer places an order from their cart"* — through the
**whole KRD loop**, from a clean stable phase to a green, stable, clickable slice. It
**composes** the prior teeth; it authors **no new capability, truth table, DSL, emitter,
MCP or hook**. It is the verticale of KRD LIVRE V ("de l'intention au bouton").

## The procedure (the ordered loop)

Run the loop in order; each step CALLS an existing tooth — never re-implements one:

1. **Intake** the seed Idea (S27) — `checkout.SeedIdea()` lands the candidate-truth
   *"a customer places an order from their cart"* in the `ideas` schema. No freeze,
   no kernel write (an idea carries no version, no mirror).
2. **Open a `/goal`** from the idea (S29) — `goal.OpenGoal` writes the **red set** for
   `createOrder` (the red IS the goal). At this point **no kernel truth is written**:
   `OpenGoal` opens a **DRAFT** ChangeSet, it never applies it (the agent has no GRANT).
3. **Apply the approved ChangeSet** (S20, the door, §2) — `changeset.Apply` admits the
   DRAFT to APPLIED **only** through the **completeness gate** (the `spec_delta` carries
   its `mirror_delta` — no monster). This is the only legal kernel write.
4. **Confirm the mirror is live** (S06/S12) — the gate the changeset passed guarantees
   the mirror reflecting `createOrder` is alive (no monster).
5. **Emit the projections** (S34/S36/S37/S38) — `generators.Project` emits the Order
   Go struct / Postgres DDL / TS type **deterministically** (byte-identical on re-emit).
6. **Invoke `createOrder`** (S10) — over a cart of 2 line items, through the injected
   OrderStore seam (the back acceptance hits **real Postgres** via Testcontainers); the
   placed order's line items **match the cart** (N in ⇒ N out, no phantom, no dropped).
7. **Seal a stable phase** (S23) — `phases.IsStable` seals a new content-addressed phase
   on the dag (chainable next step).

## How to run it

- **Back (the loop driver):** `cd back && go test ./runtime/checkout/` — the fixture
  mirror + the rapid property (no Docker) and the Godog acceptance (real Postgres via
  Testcontainers, `TestDemoCheckoutBDD`).
- **Front (the button driver):** `npx vitest run lib/demo-checkout.test.ts` (the twin)
  + `npx playwright test tests/e2e/demo-checkout.spec.ts` (the clickable flow).
- **The Workbench panel:** open `/demo-checkout` — it visualizes the whole loop and
  the live cart + checkout button; clicking checkout places the order from the screen.

## The honesty rules (non-negotiable)

- **Never invent** a `targetId`, an op ref/version, a **price/total/tax/discount**, an
  inventory or payment rule the Idea or the AST does not pin — every gap is an
  **OpenQuestion** in provenance, never a guessed default. The slice covers **exactly**
  "create an order from a cart".
- **The agent has no GRANT** to write `kernel`/`mirrors`/`fitness`; the only kernel write
  is the **approved ChangeSet** (the door). Any other path is refused by the wall (S04).
- **Done is computed**, never declared: red set green ∧ prior green intact ∧ mutation ≥
  floor ∧ no monster.
- **Reproducible from a clean phase**: re-running yields the **same** content-addressed
  ASTs (same hashes) and byte-identical projections (S34 determinism).

## Files

- Slice driver: `back/runtime/checkout/{slice,run,loop,example}.go`
- Mirrors: `back/runtime/checkout/slice_{fixture,property,bdd}_test.go` +
  `tests/runtime/demo-checkout.feature`
- Example-local: `examples/checkout/{CONTEXT.md,idea.md,expected-stages.md,order_line_items.sql}`
- Front twin + panel: `front/web/lib/demo-checkout.ts` + `front/web/app/demo-checkout/`
- e2e: `tests/e2e/demo-checkout.spec.ts`
