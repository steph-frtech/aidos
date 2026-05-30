# S46 — Demo checkout: an end-to-end vertical slice (Idea → Goal → Kernel → Mirror → Src → Stable, red to green)

Subsystem: AIDOS Workbench | Home: `examples/checkout` | Workbench route: `/demo-checkout`

## Objectif

Land the **canonical end-to-end demo slice**: a single, self-contained example app (`examples/checkout`) that drives **one real intention all the way through the KRD loop** — an **Idea** ("a customer places an order from their cart"), promoted via a **`/goal`** into the **Kernel** (an `Order` entity AST + a `createOrder` operation/control/action AST), reflected by a living **Mirror**, projected into **Src** (the Go API handler + Postgres DDL + the Next cart/checkout view), and frozen into a **Stable phase** — proven by the whole chain going **red → green**. This is the *acceptance* of the verticale (KRD LIVRE V "de l'intention au bouton"): not a new capability, but a **composition test** that the OS the prior 45 teeth built actually carries one behaviour from idea to a clickable, green-projected button.

## Sortie attendue

Per CLAUDE.md §5 this step needs **a behaviour proof** (the journey BDD mirror — the whole-loop acceptance), **a repeatable gesture** (the `/demo-checkout` Skill — replay the slice from scratch), **a visualization** (a Next route in the Workbench), plus **the example app's own files** under `examples/checkout` (fixtures, seed idea text, expected ASTs/projections it asserts against). It deliberately adds **no new truth tables**, **no new MCP/hook**, **no new emitter or DSL** — it **composes and exercises** prior teeth (S01–S41) end to end and **proves nothing new about the kernel itself**. Justifications below.

- **Example app** `examples/checkout/` (the home — **the only new product directory**; not a subsystem, an *example* consuming the OS). It contains **no hand-authored truth and no hand-authored projection** (both are emitted/derived by the prior teeth). It holds only **example-local artifacts**: (1) the seed **Idea** text (`idea.md` / a fixture row destined for the `ideas` schema via the S27 intake — a candidate-truth, *not* truth: no freeze, no kernel write here), (2) the **expected** shape of each loop stage the slice asserts against (the expected `Order` entity AST, the expected `createOrder` operation/control/action AST, the expected Go handler signature, the expected Postgres DDL, the expected Next view) — used **only as test oracles**, never as the source (the source is the kernel, derived through the loop), (3) the **fixture** that scripts the whole loop, (4) a `CONTEXT.md` pinning the slice's ubiquitous language (cart, line item, order, place/create order). The `Order` **entity**, the `createOrder` **operation/control/action**, and every **projection** are produced by running the *existing* loop (S35 entity-source, S10/S11 DSLs, S29 goal-engine, S34/S36/S37/S38 emitters), **never** typed by hand here.

- **Skill** `.claude/skills/demo-checkout/` (`SKILL.md`, CLAUDE.md §5: repeatable gesture → Skill) — `/demo-checkout`: the replayable gesture "run the checkout slice through the full KRD loop from a clean phase and assert each stage". It encodes the procedure end to end — intake the Idea (S27) → open a `/goal` from it which writes the red set (S29) → promote the candidate ASTs into the Kernel **only through an approved ChangeSet** (S20, the door of §2, never a side write) → confirm the Mirror reflects them and is **live** (S06) → emit the projections (Go handler S36, Postgres DDL S37, Next view S38) → run the whole journey mirror → freeze a **Stable phase** (S23) — and the **honesty rules** (never invent a `targetId`, an operation ref/version, a price/total business rule, a field the Idea/AST does not pin; every gap becomes an **OpenQuestion** in `provenance`, never a guessed default). It explicitly **uses the human door** for any kernel write (the agent has no GRANT — §2) and asserts the slice is reproducible from a clean phase (re-running yields the same content-addressed ASTs and byte-identical projections — S34 determinism).

- **BDD mirror** — the **journey / acceptance (N0)** mirror, conceptually stored in the `mirrors` schema (`reflects`, `test_kind`, `cert_language`, `authority`, `liveness`) and materialized to `tests/` for the runner. **Two faces, one slice:**
  - a **Godog** Gherkin feature (back N0 frozen slot) that drives the **loop** itself: from the seeded Idea, a `/goal` produces a red set; the candidate `Order` entity + `createOrder` op/control/action enter the kernel via an approved ChangeSet; the Mirror reflects them and is live; the projections emit; `createOrder` runs against **real Postgres (Testcontainers, S05/S37)** and persists an `Order`; the phase becomes Stable. The transition red → green over *this whole chain* is the done criterion on the back.
  - a **Playwright + playwright-bdd** journey feature (front N0 frozen slot, MANDATORY) that drives the **button**: the cart view renders the emitted projection, the checkout button is visible/enabled per the control-spec fixture (S38), clicking it declares/dispatches `createOrder` (S11 `Plan`) and the order appears. Green e2e on `/demo-checkout` = the front done criterion.

- **Next route** `front/web/app/demo-checkout/` → `/demo-checkout` — the Workbench panel that **visualizes the whole loop for this slice**: the seeded Idea, the `/goal` red set, the kernel ASTs (`Order`, `createOrder`), the Mirror liveness badge, the emitted projections, and the **live cart + checkout button** (the emitted Next view), with a **phase = Stable?** / **all-green?** badge. Read-only over truth; it renders the slice's state, it never authors truth. See "Visualisation UI".

> Explicitly **out of scope** (would be monsters / re-implementation): **no new truth tables, no new DSL, no new emitter, no new MCP, no new hook** — this step is a *composition acceptance*; it **consumes** S27 (idea intake), S29 (goal-engine / red set), S20+S21 (changeset + semantic-diff — the kernel door), S10/S11 (operation/control/action DSL), S35 (entity-source), S34/S36/S37/S38 (emitters: Go API, Postgres DDL, Next web), S06 (mirror schema/liveness), S12 (completeness / no monster), S23 (stable phase), S05/S37 (Testcontainers + real Postgres), S22 (red wave). **No kernel write by the agent** — the `Order`/`createOrder` ASTs are promoted **only** through an approved ChangeSet via the `aidos` CLI's writer role (§2 the wall); if the slice "needs" a truth, it raises an Idea + a `/goal`, it never side-writes. **No new business logic invented** — pricing, tax, discounts, inventory, payment are **not** in the Idea and must **not** be conjured; the slice covers exactly "create an order from a cart" and any temptation beyond that becomes an OpenQuestion. **No second example app** — one canonical slice; the example matrix grows additively in later steps. **No production hardening** — this is a demo/acceptance vertical, not a shippable checkout.

## Test minimal (done)

**Done = the whole KRD loop carries the checkout intention from Idea to a green, Stable, clickable slice — Idea → Goal → Kernel → Mirror → Src → Stable works end to end.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. Done is **computed** (red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster), never declared.

- **Journey / acceptance (N0) — Godog Gherkin** (back frozen slot), the loop driver. THE back done criterion:

  ```gherkin
  # mirrors schema · reflects: examples.checkout.full-loop · test_kind: gherkin · cert_language: godog · authority: above · liveness: live
  Feature: an idea for "place an order from the cart" travels the full KRD loop to a green stable slice
    # the loop is the subject; nothing here authors truth — truth enters only via an approved ChangeSet (the door)

    Scenario: an idea becomes a goal that writes a red set
      Given a clean stable phase
      And the idea "a customer places an order from their cart" is intaken into the ideas schema
      When a /goal is opened from that idea
      Then a red set exists for "createOrder"           # the red IS the goal (S29)
      And no kernel truth has been written yet           # the agent has no grant; the door is the changeset (§2)

    Scenario: the candidate truth enters the kernel only through an approved changeset
      Given a red set for "createOrder"
      When the Order entity AST and the createOrder operation/control/action AST are applied via an approved changeset
      Then the kernel head exposes entity "Order" and operation "createOrder@<version>"   # content-addressed (S02)
      And the mirror reflecting "createOrder" is live    # no monster (S06/S12)

    Scenario: the projections emit and createOrder persists an order against real Postgres
      Given the kernel head exposes "createOrder@<version>"
      When the emitters run                               # Go handler (S36), Postgres DDL (S37), Next view (S38)
      And createOrder is invoked with a cart of 2 line items
      Then an Order row is persisted in Postgres          # Testcontainers, real DB (S05/S37)
      And the order's line items match the cart            # only what the AST pins — no invented total/tax

    Scenario: the slice freezes into a stable phase with everything green
      Given the createOrder slice is green                # red set green ∧ prior green intact ∧ no monster
      When the phase is sealed
      Then a new stable phase exists on the dag            # chainable next step (S23/S24)
  ```

- **Journey / acceptance (N0) — Playwright + playwright-bdd** (front frozen slot, MANDATORY), the button driver, run on `/demo-checkout`. THE front done criterion:

  ```gherkin
  # mirrors schema · reflects: front.demo-checkout.place-order · test_kind: gherkin · cert_language: playwright-bdd · authority: above · liveness: live
  Feature: the demo cart's checkout button places an order (the emitted projection, end to end)

    Scenario: the cart renders and the checkout button respects its control-spec fixture
      Given the demo-checkout slice is on a green stable phase
      When I open "/demo-checkout"
      Then the cart shows 2 line items                    # the emitted Next view (S38), not hand-authored
      And the "checkout" button is visible and enabled    # matches EvalState(control, given) (S11)

    Scenario: clicking checkout creates the order
      Given I am on "/demo-checkout" with a cart of 2 line items
      When I click the "checkout" button
      Then createOrder@<version> is dispatched            # Plan(action, click) (S11), the bound op
      And the placed order is shown with its 2 line items # the persisted Order, projected back
  ```

- **Fixture (N2) — `state → command → events`, interpreted in Go** (the slice script), stored in `mirrors`, materialized to `tests/`: `state` = a clean phase + the seeded Idea; `command` = the ordered loop steps (intake → goal → approved changeset → emit → invoke createOrder → seal phase); `events` = `[ IdeaIntaken, GoalOpened, ChangeSetApplied, MirrorLive, ArtifactsEmitted, OrderPlaced, PhaseSealed ]`. Asserts: the kernel ASTs are content-addressed and reproducible (re-running the slice from a clean phase yields the same hashes); the projections are byte-identical on re-emit (S34 determinism); a field the Idea/AST does not pin (price, tax) is **never** invented (→ OpenQuestion); any attempted agent kernel write is refused by the wall (S04).

- **Property (rapid, ∀, below the line)** — re-running the slice from a clean phase is **idempotent in content** (same Idea ⇒ same candidate ASTs ⇒ same content hashes ⇒ byte-identical projections); `createOrder` with N line items persists exactly N line items (no phantom, no dropped item); an unresolved operation ref / a malformed cart ⇒ a `BlockReason` (S13), never a panic, never an invented order; the loop **never** writes the kernel except through an approved changeset (any other path ⇒ refused by the wall, S04).

Watch them go **red** first (no `examples/checkout` slice, no seeded Idea, no `/demo-checkout` route, no Godog loop feature, no playwright-bdd feature). That red **is** the `/goal` for this step.

## Visualisation UI

- **Route:** `front/web/app/demo-checkout/page.tsx` → `/demo-checkout` (a **new** route; do not touch `front/web/app/page.tsx`, `layout.tsx`, `globals.css`, or any prior route such as `/web-preview`, `/goal`, `/ideas`). The panel renders the **whole loop for the slice** as a left-to-right pipeline — (1) the seeded **Idea** card, (2) the **`/goal`** red set, (3) the **Kernel** ASTs (`Order` entity + `createOrder` op/control/action, content hashes), (4) the **Mirror** liveness badge, (5) the **emitted** projections (Go handler path, Postgres DDL, the Next cart/checkout view rendered live from `_generated/`), and (6) the live **cart + checkout button** with the placed-order result — capped by a **phase = Stable? / all-green?** badge. Read-only over truth; it visualizes the slice's state, it never authors truth.
- **Playwright e2e:** `tests/e2e/demo-checkout.spec.ts` (one spec per critical flow, per CLAUDE.md §4 + the `playwright-e2e` skill), driven by the playwright-bdd `.feature` above. It loads `/demo-checkout` via the configured `webServer` (`npm run dev -w @aidos/web`, baseURL `http://localhost:3000`), asserts the cart renders the emitted view with its 2 line items, the checkout button is visible/enabled per the control-spec fixture, a click dispatches `createOrder@<version>`, and the placed order is shown with its 2 line items. Green e2e = the front done criterion.

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: the new example app under `examples/checkout/` (seed Idea, expected-stage oracles, slice fixture, slice `CONTEXT.md`), the new `/demo-checkout` route and its `tests/e2e/demo-checkout.spec.ts`, the new `/demo-checkout` Skill, and the new BDD mirror records (the Godog loop feature, the playwright-bdd button feature, the slice fixture, the rapid property). It **consumes, never re-implements**: S27 (idea intake), S29 (goal-engine / red set), S20+S21 (changeset + semantic-diff, the kernel door), S10/S11 (operation/control/action DSL + `EvalState`/`Plan`), S35 (entity-source), S34/S36/S37/S38 (emitters), S06 (mirror schema/liveness), S12 (completeness / no monster), S23/S24 (stable phase + dag), S05/S37 (Testcontainers + real Postgres), S04 (the wall / GRANTs), S13 (`BlockReason`), S02 (`Canonicalize`/`Hash`). It writes the kernel **only** by **applying an approved ChangeSet** through the `aidos` CLI's writer role — the agent itself has **no** GRANT (§2) and **never** side-writes truth. Any change to a **prior contract** (an entity/operation/control AST shape, an emitter `Artifact` shape, a mirror, a changeset/phase schema) is forbidden in passing: it goes through a **ChangeSet** (S20) + a **SemanticDiff** (S21) + an ADR, never a silent edit. No prior route, generated file, mirror, idea, changeset, phase, or truth is overwritten, replaced, or deleted (CLAUDE.md §9).

## Prompt a lancer

```text
You are step-executor for AIDOS step S46 — "Demo checkout: drive ONE real intention through the FULL KRD loop
(Idea → Goal → Kernel → Mirror → Src → Stable), red to green, ending in a clickable green slice". Stack is
FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant to
kernel/mirrors/fitness — truth enters ONLY through an approved ChangeSet via the aidos CLI writer role, §2 the
wall), front=Next.js (the Workbench). This step is a COMPOSITION ACCEPTANCE: it proves the OS the prior 45 teeth
built can carry a behaviour from idea to a green, stable, clickable button — it AUTHORS NO NEW CAPABILITY, NO
NEW TRUTH TABLE, NO NEW DSL, NO NEW EMITTER, NO NEW MCP, NO NEW HOOK. Home = examples/checkout for the slice's
own example-local files (seed idea, expected-stage oracles, fixture, CONTEXT.md), plus the new /demo-checkout
route under front/web/app/demo-checkout, the /demo-checkout skill under .claude/skills/demo-checkout, and the
e2e under tests/e2e. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md LIVRE V (§23 "la verticale complète : de l'intention au bouton et son
action" — one source, N projections; the button is a PROJECTION of the kernel, never hand-authored) and LIVRE
XI (le goal & le workflow — the red set IS the goal). Read CLAUDE.md §0 vocabulary (Idea = candidate-truth, NOT
truth; Postgres = the base, never "BDD"; AIDOS ≠ KRD), §2 the wall (the ONLY door to the kernel is
idea → mirror → /goal → human approval → changeset; the agent has no GRANT), §6 the per-step loop, §8 honesty
(done is COMPUTED), §9 anti-overwrite. Read CONTEXT-MAP.md and the slice's nearest CONTEXT.md files. Read the
PRIOR STEPS' specs you DEPEND ON and CONSUME, never re-implement: S27 (idea intake + provenance), S29
(goal-engine / red set), S20 (changeset, DRAFT/APPLIED/REVERTED) + S21 (semantic-diff — the kernel door),
S10/S11 (operation/control/action DSL, EvalState(control, given) → {visible, enabled}, Plan(action, event) →
{invoke, args}), S35 (entity-source → one source emits Go + TS + DDL), S34 (emitter set + Artifact/Project +
determinism + protected header + ledger), S36 (Go API projection), S37 (Postgres DDL projection +
Testcontainers), S38 (Next web projection + playwright-bdd), S06 (mirror schema/liveness), S12 (completeness /
no monster), S23/S24 (stable phase + dag), S05 (CI ratchet + Testcontainers), S04 (the wall / GRANTs), S13
(BlockReason), S02 (Canonicalize / Hash). For any Next.js 16, playwright-bdd, Godog, Atlas, sqlc, or Go doubt
use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language of the SLICE and of the LOOP: the IDEA is "a customer places an order from their cart" — a
    candidate-truth in the `ideas` schema (no freeze, no kernel write); the GOAL opened from it WRITES THE RED
    SET (the red IS the goal, S29); the candidate Order ENTITY AST + createOrder OPERATION/CONTROL/ACTION AST
    enter the KERNEL ONLY through an APPROVED CHANGESET (S20, the door, §2) — the agent NEVER side-writes truth
    (it has no GRANT); the MIRROR reflecting createOrder must be LIVE (S06/S12 — no monster); SRC is the EMITTED
    projection (Go handler S36, Postgres DDL S37, Next cart/checkout view S38) — ONE source → N projections,
    never double-typed; STABLE is a sealed phase on the dag (S23/S24). The slice covers EXACTLY "create an order
    from a cart" — cart, line item, order, place/create order — and NOTHING ELSE: pricing, tax, discount,
    inventory, payment are NOT in the idea and MUST NOT be invented (any temptation → an OpenQuestion in
    provenance). Distinguish the WORKBENCH (/demo-checkout, the OS's own UI visualizing the loop) from the
    EMITTED projection (the cart/checkout view the OS emits for the example app) — this step renders the former,
    emits the latter through the existing emitters. This step delivers the COMPOSITION ACCEPTANCE + the slice's
    example-local files + the route + the e2e, NOT new truth, NOT a new DSL/emitter/MCP/hook, NOT a second
    example, NOT production hardening. Sharpen each term against examples/checkout/CONTEXT.md (create it) and
    CONTEXT-MAP.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch before
    coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. THREE artifacts, by nature:
      - GODOG GHERKIN journey/acceptance (back N0 frozen slot, MANDATORY), the LOOP driver: from a clean stable
        phase + the seeded idea → a /goal writes a red set for createOrder (and NO kernel truth is written yet —
        the agent has no grant) → the Order entity + createOrder op/control/action enter the kernel via an
        APPROVED CHANGESET → the mirror reflecting createOrder is LIVE (no monster) → the emitters run →
        createOrder is invoked with a cart of 2 line items and PERSISTS an Order in REAL Postgres (Testcontainers,
        S05/S37) whose line items match the cart (only what the AST pins) → the phase seals as STABLE. The red →
        green transition over THIS WHOLE CHAIN is the back done criterion.
      - PLAYWRIGHT + PLAYWRIGHT-BDD journey/acceptance (front N0 frozen slot, MANDATORY), the BUTTON driver on
        /demo-checkout: the cart renders the EMITTED view with its 2 line items (not hand-authored); the checkout
        button is visible/enabled per the control-spec fixture (EvalState, S11); a click DISPATCHES
        createOrder@<version> (Plan(action, click), S11) and the placed order is shown with its 2 line items.
        Green e2e = the front done criterion.
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go), the slice SCRIPT: state = clean
        phase + seeded idea ; command = the ordered loop (intake → goal → approved changeset → emit → invoke
        createOrder → seal phase) ; events = [IdeaIntaken, GoalOpened, ChangeSetApplied, MirrorLive,
        ArtifactsEmitted, OrderPlaced, PhaseSealed]. Assert: the kernel ASTs are content-addressed and
        REPRODUCIBLE (re-run from a clean phase ⇒ same hashes) ; projections byte-identical on re-emit (S34
        determinism) ; a field the idea/AST does NOT pin (price, tax) is NEVER invented (→ OpenQuestion) ; any
        attempted agent kernel write is REFUSED by the wall (S04).
      - PROPERTY (rapid, ∀, below the line): re-running the slice is content-idempotent (same idea ⇒ same
        candidate ASTs ⇒ same content hashes ⇒ byte-identical projections) ; createOrder with N line items
        persists exactly N (no phantom, no dropped item) ; an unresolved op ref / a malformed cart ⇒ a
        BlockReason (S13), never a panic, never an invented order ; the loop NEVER writes the kernel except via
        an approved changeset (any other path ⇒ refused by the wall, S04).
    Use Testcontainers (real Postgres + the prior Atlas migrations) for the createOrder persistence and the
    kernel/changeset/phase round-trips. Run them; watch them go RED (no examples/checkout slice, no seeded idea,
    no /demo-checkout route, no Godog loop feature, no playwright-bdd feature). That red IS the /goal for this
    step. Do NOT write a truth-test you would then satisfy (no new invariant authored here) — you write
    means-tests toward the human red.

(c) TDD red → green → refactor, in examples/checkout + front/web/app/demo-checkout ONLY (plus the new
    /demo-checkout skill and tests/e2e). Run /tdd. Outside-in: make the Godog loop feature and the playwright-bdd
    button feature pass with the SIMPLEST orchestration that CALLS the existing teeth in order (intake S27 →
    goal S29 → approved changeset S20 → emit S34/S36/S37/S38 → invoke createOrder → seal phase S23) — you wire
    the slice, you do NOT re-implement any tooth. The Order entity, the createOrder op/control/action, and every
    projection are PRODUCED by running the existing loop, NEVER hand-typed. Tool search ONLY now, ONLY if a real
    choice is genuinely undecided, WITHIN the frozen slot: compare ≤3 options (e.g. how the slice script invokes
    the loop — via the aidos CLI subcommands vs the MCP servers vs the Go libraries directly; the seed-idea
    fixture format) and pick the SIMPLEST current (May 2026) option; Godog + playwright-bdd are MANDATORY for the
    N0 slots, sqlc/Testcontainers/the emitter set are MANDATORY — never substitute them. Record an ADR
    (docs/adr/000X) ONLY if a real choice is made. Reuse everything prior; mock NOTHING that exists (kernel /
    changeset / Postgres reads hit real Postgres via Testcontainers; the only mock allowed is for a tooth that
    does not yet exist — and none should, this is the last vertical, so mock nothing).

(d) KEEP SENSORS GREEN at every diff (PostToolUse hook): self-certify on the computational only; gofmt/Biome/
    ESLint clean; the wall hook (S04) must stay satisfied (the agent only SELECTs truth and applies kernel
    changes via the approved-changeset door, never a side write); determinism holds (re-run ⇒ same hashes,
    byte-identical projections); no prior green regresses; no monster (the createOrder mirror is live; every
    emitted projection has its living mirror).

(e) DIAGNOSE before finishing (run /diagnose): isolate any failing sensor/e2e (a non-reproducible AST hash? a
    non-deterministic emit? a changeset that did not apply? a flaky checkout selector? a createOrder that drops
    a line item? a render that diverges from EvalState?), reproduce, fix, regression-test. You do NOT finish a
    code step without it.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED at every step): front/web/app/demo-checkout/
    page.tsx → /demo-checkout (NEW route; do NOT touch page.tsx/layout.tsx/globals.css or any prior route),
    visualizing the WHOLE LOOP as a pipeline — the seeded Idea, the /goal red set, the kernel ASTs (Order,
    createOrder + content hashes), the Mirror liveness badge, the emitted projections, and the LIVE cart +
    checkout button (the emitted Next view rendered from _generated/) with the placed-order result — capped by a
    phase=Stable? / all-green? badge. Write tests/e2e/demo-checkout.spec.ts driven by the playwright-bdd .feature,
    per the playwright-e2e skill; it runs via the configured webServer (npm run dev -w @aidos/web, baseURL
    http://localhost:3000). Green e2e = the front done criterion.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step (run /improve-codebase-architecture): confirm the slice
    is a THIN composition that re-uses the teeth (no logic duplicated from S27/S29/S20/S34/S36/S37/S38/S23), keep
    examples/checkout free of hand-authored truth or hand-authored projection, confirm the domain language
    matches examples/checkout/CONTEXT.md and CONTEXT-MAP.md. You do NOT move on without it.

(h) CREATE the artifacts per CLAUDE.md §5 — and ONLY these: the example-local files under examples/checkout
    (seed idea, expected-stage oracles, slice fixture, CONTEXT.md), the /demo-checkout Skill (repeatable
    gesture: replay the slice from a clean phase), the BDD mirror records (Godog loop feature + playwright-bdd
    button feature + slice fixture + rapid property), the /demo-checkout route + e2e. NO new truth table (the
    Order entity + createOrder op enter the EXISTING kernel schema via an approved changeset — append-only). NO
    MCP server (the slice composes existing MCP servers / CLI subcommands / libraries; if a callable
    demo_checkout_run op truly emerges, record an OpenQuestion, do not build it). NO hook (the wall hook S04 +
    the completeness hook S12 + the sensors already guard this; §5 hook-honesty forbids a hook that never fired).
    NO new DSL, NO new emitter, NO second example, NO production hardening (pricing/tax/payment).

HONESTY RULES (non-negotiable): never invent a targetId, an operation ref/version, a price/total/tax/discount,
an inventory or payment rule, or any business rule the Idea or the AST does not pin — every gap becomes an
OpenQuestion in provenance, never a guessed default. Never author a new truth/invariant here (the Order entity
and createOrder op are candidate-truth promoted only via an approved changeset — the human door). The agent has
NO grant to write kernel/mirrors/fitness; the only kernel write is the approved ChangeSet. Any change to a prior
contract (an entity/op/control AST shape, an emitter Artifact shape, a mirror, a changeset/phase schema) goes
through a ChangeSet (S20) + SemanticDiff (S21) + ADR — never a silent edit. Edit only this step's declared files;
otherwise add new files. "Done" is COMPUTED, never declared: red set green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster.

DONE CRITERIA: Idea → Goal → Kernel → Mirror → Src → Stable works END TO END — the seeded idea is intaken; a
/goal writes the red set; the Order entity + createOrder op/control/action enter the kernel ONLY via an approved
changeset; the createOrder mirror is live (no monster); the Go handler + Postgres DDL + Next cart/checkout view
emit deterministically; createOrder persists an Order with its line items in real Postgres (Testcontainers);
the /demo-checkout cart renders the emitted view and the checkout button (visible/enabled per the control-spec
fixture) dispatches createOrder@<version> on click (playwright-bdd e2e GREEN); the slice seals a new STABLE phase
on the dag; re-running from a clean phase is content-idempotent (same hashes, byte-identical projections); no
field the idea/AST does not pin is invented; no prior green regressed; no monster.

END WITH THE STEP REPORT: (1) BDD added — the Godog loop feature + the playwright-bdd button feature + the slice
fixture + the rapid property, with their mirrors-schema fields (reflects, test_kind, cert_language, authority,
liveness); (2) Tests run — the Godog loop (with Testcontainers createOrder persistence) + the Go fixture/property
+ the playwright-bdd e2e, with pass/fail and mutation score vs threshold; (3) UI route — /demo-checkout +
tests/e2e/demo-checkout.spec.ts; (4) ChangeSet status — the changeset that promoted the Order entity +
createOrder op (its id, SemanticDiff, and any ADR), plus none-if-no-prior-contract-touched for everything else;
(5) Red-set status — which red scenarios are now green across the whole loop and any still red; (6) Known limits
/ OpenQuestions raised (e.g. pricing/tax/payment deliberately out of scope, a candidate demo_checkout_run op);
(7) Next safe step the stable phase enables.
```
