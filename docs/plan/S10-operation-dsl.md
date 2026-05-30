# S10 — Operation DSL interpreter (validate/authorize/read/mutate/return) in Go + fixture mirror state→cmd→events

Subsystem: AIDOS Kernel | Home: `back/kernel/operation` | Workbench route: `/operation`

## Objectif

Land the **Operation DSL interpreter in Go** — the N2 (Workflow) executor — so that an operation body, a list of typed steps `validate / authorize / read / mutate / branch / return` read from its Kernel AST, runs deterministically as `state → command → events`, proven by a fixture mirror. This step makes the canonical `createOrder` fixture go red→green against a **mock** entity/policy/store impl; it does not yet compile to Hono, wire a real database, or evaluate real Policy/Expr ASTs (those are mocked at their seam).

## Sortie attendue

Per CLAUDE.md §5, this step needs **pure logic**, a **behaviour proof** (fixture mirror), and a **visualization** — so exactly these artifacts, and no more:

- **Go package** (`back/kernel/operation/`) — the interpreter. It reads an **operation AST** (the `operation` row shape frozen at S02 / the DSL-AST step: `input`, ordered `steps[]`, `emits[]`) and a typed `Step` union for the five+one verbs (`validate`, `authorize`, `read`, `mutate`, `branch`, `return`). `Interpret(op, state, cmd, deps) (events, result, err)` walks the steps in order against a `State` (bag of `$.input`, `$.auth`, named slots like `$.cart`, `$.order`) and returns the **ordered event list** plus the `return` ref. Pure: no DB, no HTTP, no clock — side-effecting verbs reach the world only through injected `deps` interfaces (`Validator`, `Authorizer`, `Reader`, `Mutator`) so the fixture can pass **mocks**. Deterministic event ordering. Below the waterline (`authority: below`, computational).
- **AST step table** (Go, in the same package) — a small typed dispatch table mapping each step `kind` to its evaluator, with an explicit `default → error("unknown step kind")` so an unrecognised verb is a typed failure, never a silent skip. This is the "AST table" deliverable: the interpreter is table-driven, not a `switch` scattered across files.
- **BDD mirror — fixture (N2)** — the `createOrder/happy` fixture `state → command → events`, conceptually stored in the `mirrors` schema and materialized for the Go runner: `given` = `{ cart: {items:[…2…], userId}, auth.user }` + `cmd: createOrder`, `then` = ordered events `["OrderCreated", "CartCleared"]` + `return.status == "pending"`. This is the **workflow** proof form (CLAUDE.md §3, N2), run by the package's fixture harness — **not** Godog, **not** rapid (those are other slots).
- **Next route** (`front/web/app/operation/page.tsx`) — the `/operation` Workbench panel visualizing one operation's step pipeline and the fixture's event trace (below).

> Explicitly **out of scope** (do not create): no MCP server (no new read/write *capability* over the base is exposed here — the `store` / `mirror-runner` MCPs are their own steps); no hook (no new non-bypassable rule beyond the existing wall — the interpreter writes no truth); no Atlas migration (no new persistence — the `operation` AST table was created at the DSL-AST step; this step **reads** it); no Hono/`emitHono` projection; no real Policy/Expr evaluation, no sqlc queries, no Pact contract. `branch` is supported in the table but exercised only if the fixture needs it — do not invent branch semantics the human has not specified.

## Test minimal (done)

**Done = the `createOrder` fixture goes red→green with a mock impl.** Restated failing-first, as the fixture mirror to write **before** any interpreter code, conceptually stored in the `mirrors` schema and materialized for the Go fixture harness:

```
# mirrors schema · reflects: kernel.operation.createOrder · test_kind: workflow · cert_language: fixture · authority: below
# fixture: createOrder/happy   (state → command → events)  — the lien porteur breaks if the fixture disappears
given:
  state:
    auth: { user: { id: "u1" } }
    cart: { id: "c1", userId: "u1", items: [ {price: 10}, {price: 5} ] }
  command: createOrder { cartId: "c1" }
when:
  Interpret(operation "createOrder", state, command, mockDeps)
then:
  events  == [ "OrderCreated", "CartCleared" ]     # ordered, exactly these
  return.status == "pending"
  return.total  == 15                              # sum(cart.items, "price"), computed by mutate
  mockAuthorizer was asked "canPlaceOrder" before any mutate ran
```

Supporting (same fixture form, same slot — no new tool): a **red guard** case proving the pipeline order is real, not coincidental —

```
# fixture: createOrder/authz-denied   (authorize fails ⇒ no events, no mutate)
given:  state with cart.items == []        # policy would DENY
then:   err is AuthorizationDenied  ∧  events == []  ∧  mockMutator was never called
```

Both start **red** (no `back/kernel/operation` package, no interpreter, no fixture harness). That red **is** the `/goal`. Do **not** add a property/∀ invariant here (that is the policy step's rapid slot) and do **not** write Godog (that is the journey slot) — the workflow truth form is the fixture.

## Visualisation UI

- **Workbench route:** `front/web/app/operation/page.tsx` (new route `/operation`; do not touch existing routes). It renders, for the `createOrder` operation: (1) the **step pipeline** as an ordered list of typed chips `validate → authorize → read → mutate → mutate → return` (read from the operation AST shape), and (2) the **fixture event trace** — the `given` state, the `createOrder` command, and the resulting ordered events `OrderCreated, CartCleared` with a green PASS / red FAIL badge for the `createOrder/happy` fixture. Read-only; it consumes the fixture result, it does not run truth writes. XState (the frozen client-state slot, §3) only if local panel state genuinely needs it — otherwise plain React state; do not pull it in speculatively.
- **Playwright e2e:** `tests/e2e/operation.spec.ts` — navigate to `/operation`, assert the six ordered step chips are present in order, assert the event trace shows `OrderCreated` then `CartCleared`, and assert the fixture badge reads PASS. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill (role/text selectors, ordered assertions, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** (`back/kernel/operation/*.go`, `front/web/app/operation/*`, `tests/e2e/operation.spec.ts`, the new `createOrder/*` fixture sources) and otherwise **adds new files**. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/`), no silent model replacement. It **reads** the `operation` AST row shape and the `Step`/`emits` contracts frozen by the earlier DSL-AST/records steps — it does **not** alter them. The `Validator/Authorizer/Reader/Mutator` deps it introduces are **new** seams, not edits to existing ones. Should a real need arise to change a prior contract (the `operation` AST shape, a step verb's signature, the `emits` field, the fixture envelope), that change goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) accompanied by a **SemanticDiff** on the affected Kernel/Mirror record — never an in-place edit, never a passing tweak.

## Prompt a lancer

```text
You are step-executor for AIDOS step S10 — "Operation DSL interpreter (validate/authorize/read/
mutate/return) in Go + fixture mirror state→cmd→events". Home = back/kernel/operation ONLY (plus the
fixture sources, the /operation Workbench route, and its Playwright e2e). Follow CLAUDE.md §6 in order.
Read KRD.md §24.3 (Operation DSL — steps typés, truth = fixture état→cmd→events N2), §93 (the
createOrder.op body and its emits), §95 (the createOrder.xstate fixture mirror — état→cmd→events),
§24.4–24.5 (Policy/Expr DSL, here only as MOCKED seams), and CONTEXT-MAP.md + back/kernel/CONTEXT.md
before touching anything. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. One intention, <=5 scenarios. Pin the ubiquitous language:
    what an Operation is vs an Action vs a Policy here; what the six step verbs mean
    (validate/authorize/read/mutate/branch/return); what "state → command → events" is as the N2
    workflow truth; what a "lien porteur" fixture is (it breaks if the fixture disappears); what is
    REAL here vs MOCKED (validate/authorize/read/mutate reach the world only through injected deps;
    Policy/Expr/DB are mocked at their seam this step). Sharpen terms against back/kernel/CONTEXT.md;
    update CONTEXT.md / an ADR inline if a term shifts. Resolve every branch before coding.

(b) WRITE THE RED FIXTURE MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized
    for the Go fixture harness (test_kind: workflow, cert_language: fixture, authority: below):
      - createOrder/happy: given {auth.user, cart with 2 priced items}, cmd createOrder{cartId} ⇒
        events == [OrderCreated, CartCleared] (ordered, exactly these), return.status == "pending",
        return.total == 15, and authorize("canPlaceOrder") ran BEFORE any mutate.
      - createOrder/authz-denied: cart.items == [] ⇒ err AuthorizationDenied, events == [], mutator
        never called (proves the pipeline order is real).
    Run them; watch them go RED (no package, no interpreter, no harness). That red IS the goal. Use the
    FIXTURE form only — NOT Godog (journey slot), NOT rapid (∀ policy slot). Do NOT write a truth-test
    you would then satisfy (no inventing a new operation invariant you'd grade yourself) — mirror the
    human createOrder intention from KRD §93/§95 only.

(c) TDD red->green->refactor in back/kernel/operation ONLY. Outside-in. Build the table-driven
    interpreter: Interpret(op, state, cmd, deps) walking ordered steps against a State bag
    ($.input/$.auth/named slots), a typed Step union, an AST step table (kind → evaluator, with an
    explicit default → typed "unknown step kind" error), and the Validator/Authorizer/Reader/Mutator
    dep interfaces so the fixture passes MOCKS. Deterministic event order; no DB/HTTP/clock in the
    package. FROZEN slot (§3): the Operation DSL is interpreted in Go with fixtures state→cmd→events —
    this IS the mandatory choice, do not substitute XState (client-only) or an external workflow engine
    for the truth executor. If a REAL minor tool choice arises WITHIN this slot (e.g. how to encode the
    typed Step union / decode the operation AST JSONB into Go), search at most 3 current (May 2026)
    options, pick the SIMPLEST, and record an ADR (docs/adr/) ONLY if a genuine choice was made.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt/go vet, go test (incl. the new fixtures),
    biome check at root, eslint in front/web. Self-certify on the computational only; never declare the
    behaviour green from tests you authored.

(e) DIAGNOSE before finishing (/diagnose): isolate any failing sensor, state the cause, propose. Do
    not finish a code step without it. Check completeness: the operation layer has its living fixture
    mirror, no monster (no operation truth without a mirror, no orphan fixture) — else Stop blocks.

(f) ADD THE WORKBENCH ROUTE (a UI is REQUIRED): front/web/app/operation/page.tsx at /operation —
    render the createOrder step pipeline as ordered typed chips (validate → authorize → read → mutate →
    mutate → return) and the fixture event trace (given state, command, ordered events OrderCreated then
    CartCleared) with a PASS/FAIL badge for createOrder/happy. Read-only; XState only if local panel
    state truly needs it. Do NOT touch existing routes. Add Playwright e2e tests/e2e/operation.spec.ts
    asserting the ordered chips, the OrderCreated→CartCleared trace, and the PASS badge, per the
    playwright-e2e skill.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step (/improve-codebase-architecture): check the
    interpreter is deep and table-driven (verbs are data, not scattered switches), the dep seams are
    clean and mockable, and the package stays pure (no I/O leak). Do not advance without it.

(h) CREATE ARTIFACTS per §5 and ONLY those that apply: the Go package (pure logic) and the fixture
    mirror (behaviour proof) and the Next route (visualization). Do NOT add an MCP server, a hook, an
    Atlas migration, sqlc queries, a Hono emitter, or real Policy/Expr evaluation — no new
    capability/rule/persistence beyond these is justified at S10.

HONESTY RULES (anti-hallucination, mandatory): never invent a target, a targetId, or a business-rule.
The operation is createOrder exactly as KRD §93/§95 specify (steps, emits [OrderCreated, CartCleared],
status "pending", total = sum of item prices). If a step verb's semantics, the mock dep boundary, the
event ordering, or branch behaviour is uncertain, do NOT guess — raise it as an OpenQuestion
(provenance) and stop on that branch. Surface assumptions; present multiple readings rather than
silently picking one (CLAUDE.md working guidelines 1).

DONE is COMPUTED, never declared (CLAUDE.md §8): red set -> green AND prior green intact AND mutation
score >= threshold AND no monster. Concretely: createOrder/happy goes red→green against the mock impl
(events [OrderCreated, CartCleared], status "pending", total 15, authorize-before-mutate);
createOrder/authz-denied holds (no events, mutator never called); the /operation route shows the
ordered pipeline + event trace + PASS badge and its Playwright e2e is green; the package is pure; no
truth was written by the agent. You cannot force done.

END WITH THE STEP REPORT:
  - BDD added: the fixture mirrors (createOrder/happy, createOrder/authz-denied), where stored
    (mirrors schema, test_kind workflow / cert_language fixture) and materialized.
  - Tests run: command + pass/fail counts (go test incl. fixture harness, biome, eslint, playwright).
  - UI route: /operation — what it renders (pipeline chips + event trace + PASS badge), e2e file + result.
  - ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent;
    expect none here — this step only reads the operation AST).
  - Red-set status: which fixtures went red then green; any still red.
  - Known limits: no Hono emitter, Policy/Expr/DB are mocked at their seam, branch unexercised, no MCP,
    no Pact, single operation (createOrder) only.
  - Next safe step: the smallest stable next tooth (e.g. real Policy/Expr evaluation feeding authorize,
    or the emitHono projection guarded by Pact) and why it is safe to chain.
```
