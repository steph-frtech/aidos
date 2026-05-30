# S11 — Control-spec (button) + Action-spec (binds control to operation) + state/event fixtures

Subsystem: AIDOS Kernel | Home: `back/kernel/control` | Workbench route: `/control`

## Objectif

Land the **control-spec** (a button as a Kernel source: `view`, `label`, `visible_when`, `enabled_when`, `triggers`) and the **action-spec** (the source that `binds` a control to an operation: `on`, `invoke`, `on_success`/`on_error`), each as a typed Expr-bearing AST stored in the `kernel` schema, proven by its own mirror — a **state fixture** for the control (situation → `button.visible/enabled`) and an **event fixture** for the action (event → effect/invoke). This carries "behaviour in DSL, never free code" all the way down to the button (KRD §24, §94).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go packages), **persistence** (Atlas migration for the AST tables), **behaviour proofs** (fixtures = BDD mirrors), a **visualization** (Next route), and two **repeatable gestures** (Skills) — and nothing more:

- **Go package** `back/kernel/control/` — the `Control` AST type per KRD §24.1/§94 (`view`, `label`, `visible_when` Expr, `enabled_when` Expr, `triggers` → action ref @version), a `Validate(control)` (shape + that `triggers` resolves to a known action ref + that `visible_when`/`enabled_when` are well-typed Exprs returning bool), and a pure `EvalState(control, given) → {visible bool, enabled bool}` that interprets the two Exprs over a `given` situation. Reuses the existing Expr DSL interpreter (do **not** re-implement Expr — depend on the frozen Expr AST); pure functions only, no I/O.
- **Go package** `back/kernel/action/` — the `Action` AST type per KRD §24.2/§94 (`on` = `click(controlRef)`, `invoke` = operation ref @version `with { … }` Expr args, `on_success[]` / `on_error[]` effect lists), a `Validate(action)` (the `on` control ref and the `invoke` operation ref both resolve; `binds` is well-formed), and a pure `Plan(action, event) → {invoke, args, effects}` that resolves the bind without executing it. Pure logic only; the actual handler is a later projection, not this step.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only: AST tables `kernel.control` and `kernel.action`, each a content-addressed append-only row (`id text PK` = hash of canonical JSONB body, `body jsonb NOT NULL`, `version text NOT NULL`, `superseded_by text NULL`, `created_at timestamptz`), reusing the S02 record substrate. The `triggers` (control→action) and `binds` (action→operation) links are version-pinned refs **inside** the JSONB body (KRD §23, §28 link types), not new tables. GRANTs: the agent DB role gets **SELECT only** on `kernel.control` / `kernel.action` (the wall, §2). Only the `aidos` CLI role writes truth, via an approved ChangeSet.
- **BDD mirrors** (stored in the `mirrors` schema, materialized for the runner) — the **control state fixture** (`given → button.visible/enabled`, `test_kind: fixture`, `cert_language: fixture`, `authority: above`) and the **action event fixture** (`event → invoke/effect`, `test_kind: fixture`, `authority: above`), plus a property invariant on `EvalState` (rapid). These ARE the done criteria (see below).
- **Skill** `.claude/skills/view/` (`SKILL.md`) — the replayable gesture "declare/inspect a control-spec for a view" (the button source + its state fixture).
- **Skill** `.claude/skills/action/` (`SKILL.md`) — the replayable gesture "bind a control to an operation via an action-spec" (the action source + its event fixture).
- **Next route** `front/web/app/control/` → `/control` — the Workbench panel rendering a control with its bound action and the live state fixture (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): no new Expr-interpreter (reuse the frozen one — search ≤3 only if its API is genuinely undecided), no Operation-DSL interpreter changes (the operation is referenced by version, not redefined), no MCP server (no new backend capability is exposed; the `store`/`mirror-runner` MCPs are prior/later steps), no hook (the wall hook already guards `kernel.*` at the schema level; no new non-bypassable rule), no codegen of the rendered button handler (the emitter is a later projection step).

## Test minimal (done)

**Done = button visible/enabled fixtures pass; an action binds an operation.** Restated **failing-first** as the red BDD mirrors to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Control state fixture** (`cert_language: fixture`, `authority: above`) — reflects `kernel.control` "checkout-button" (KRD §35):

  ```
  # mirrors schema · reflects: kernel.control "checkout-button" · test_kind: fixture · authority: above
  mirror reflects "checkout-button" {
    given { cart: { items: [] } }                      -> button.visible == false
    given { cart: { items: [x] }, form.valid: false }  -> button.enabled == false
    given { cart: { items: [x] }, form.valid: true }   -> button.enabled == true
  }
  ```

- **Action event fixture** (`cert_language: fixture`, `authority: above`) — reflects `kernel.action` "checkout-submit" (KRD §24.2, §27 "action → fixture event→effet"):

  ```
  # mirrors schema · reflects: kernel.action "checkout-submit" · test_kind: fixture · authority: above
  mirror reflects "checkout-submit" {
    on click("checkout-button")
      -> invoke operation "createOrder" with { cart: $.cart, user: $.auth.user }
    on_success -> [ navigate("/orders/{result.id}"), toast("order.created") ]
    on_error   -> [ toast.error($.error.message) ]
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any `given`, `EvalState(control, given)` is deterministic and `enabled ⇒ visible` never holds inverted (a control can be visible-and-disabled, but `enabled_when` is only consulted when `visible_when` is true); a button whose `triggers` does not resolve to a known action ref ⇒ `Validate` returns a non-empty error (no orphan trigger = no monster).

All start **red** (no `Control`/`Action` package, no AST tables, no `EvalState`/`Plan`). That red **is** the `/goal`. The action fixture is green only when `Plan(action, click("checkout-button"))` resolves to `invoke operation "createOrder"` — i.e. **the action binds an operation**.

## Visualisation UI

- **Workbench route:** `front/web/app/control/page.tsx` (new route `/control`; do not touch existing routes). It renders the "checkout-button" control: its `view`/`label`, its `triggers` → bound action "checkout-submit" → `invoke operation "createOrder"`, and a live **state-fixture table** (the three `given` rows with their computed `visible`/`enabled`). Reads via the SELECT-only role. With the canonical example it shows the button disabled for the empty cart and enabled for a valid filled cart — the state fixture rendered, not re-implemented.
- **Playwright e2e:** `tests/e2e/control.spec.ts` — navigate to `/control`, assert the control card names the bound action and its target operation (`createOrder`), and that the three state-fixture rows are present with `visible=false` (empty cart), `enabled=false` (invalid form), `enabled=true` (valid). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/control/**`, `back/kernel/action/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored fixtures/property materialized to `tests/`, `tests/e2e/control.spec.ts`, `front/web/app/control/**`, and the two new `.claude/skills/{view,action}/SKILL.md` — and otherwise **adds new files**. It introduces new contracts (`control` and `action` kinds, their AST shapes, the `triggers`/`binds` link semantics) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table. Any change to a **prior contract** it depends on — the S02 record substrate, the frozen Expr AST, the referenced Operation/Policy shapes, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S11 — "Control-spec (button) + Action-spec (binds control to
operation) + state/event fixtures". Stack is FROZEN: back=Go, truth=Postgres (append-only,
content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the
Workbench). Home = back/kernel/control (with a sibling back/kernel/action package) ONLY. Follow the
CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §23 (la verticale: de l'intention au bouton et son action),
§24 (le comportement en DSL jusqu'au bouton — control-spec, action-spec, Expr DSL), §27 (control →
fixture d'état, action → fixture event→effet), §28 (the link types: triggers, binds, mirrors), §34–35
(the Mirror record + the checkout-button fixture), §94 (NIVEAU 1 plan spec — le bouton & l'action as
sources). Read CONTEXT-MAP.md + back/kernel/CONTEXT.md (Layer, source/projection, contracts/ports,
test-as-goal/means) and the prior steps' specs (S02 records substrate, S04 the wall). For any Next.js
16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language: a "control" IS a button-as-source (not a rendered component); "triggers" is the
    control→action link; "binds" is the action→operation link; a control's mirror is a STATE fixture
    (given → visible/enabled), an action's mirror is an EVENT fixture (event → invoke/effect); the Expr
    DSL (visible_when/enabled_when) is reused, not re-invented. Sharpen each term against
    back/kernel/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every
    branch before coding.

(b) WRITE THE RED BDD MIRRORS FIRST, conceptually stored in the `mirrors` schema and materialized for
    the runner. Three artifacts, by nature:
      - control STATE fixture (cert_language: fixture, authority: above): given {cart empty} -> visible
        ==false ; given {items, form invalid} -> enabled==false ; given {items, form valid} ->
        enabled==true.
      - action EVENT fixture (cert_language: fixture, authority: above): on click("checkout-button") ->
        invoke operation "createOrder" with {cart,user} ; on_success -> [navigate, toast] ; on_error ->
        [toast.error]. Green only when the action BINDS the operation.
      - property invariant (rapid, authority: below): EvalState is deterministic; a control whose
        `triggers` does not resolve to a known action ⇒ Validate errors (no orphan trigger).
    Run them; watch them go RED (no Control/Action package, no AST tables, no EvalState/Plan). That red
    IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new control/action
    invariant you'd grade yourself) — mirror the human intention only.

(c) TDD red→green→refactor, in back/kernel/control and back/kernel/action ONLY (plus the back/migrations/
    AST-tables file). Outside-in. Reuse the FROZEN Expr-DSL interpreter for visible_when/enabled_when —
    do not re-implement it. If a real tool choice arises WITHIN a frozen slot, search AT MOST 3 current
    (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, the
    fixture/Operation-DSL interpreter, Atlas, sqlc/pgx are fixed). The likely genuine choices: the
    canonical-JSONB shape for the control/action AST rows (reuse S02's content-hash scheme — do not fork
    it) and the fixture-file format the runner loads. Record a short ADR (docs/adr/) ONLY if a genuine
    choice is made. The migration is expand-only/append-only; GRANT the agent role SELECT only on
    kernel.control / kernel.action (the wall). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at
    the monorepo root, eslint in front/web, and the new fixtures + property. Self-certify on the
    COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce EvalState on the
    three given rows and Plan on the click event, state the cause, propose. Check completeness: every
    spec layer (control, action) has its living mirror and each required test_kind is present (KRD §33);
    no monster (no control without its state fixture, no action without its event fixture, no orphan
    trigger/bind) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/control/ →
    /control: the checkout-button control card (view/label, triggers → action → invoke operation
    createOrder) and a live state-fixture table (3 given rows with computed visible/enabled). Read via
    the SELECT-only role; render the fixture, do not re-implement it. Do NOT touch existing routes. Add
    tests/e2e/control.spec.ts (use the playwright-e2e skill) asserting the bound action + target
    operation are named and the three state rows show visible=false / enabled=false / enabled=true.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    control and action are deep, well-named modules; that EvalState/Plan are pure and depend on the Expr
    interpreter without duplicating it; that the migration/GRANTs keep the wall intact; boundaries match
    back/kernel/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the two Go packages (pure logic/schema), the
    Atlas migration (persistence), the two BDD fixtures + property (behaviour proof), the Next route
    (visualization), and the two Skills .claude/skills/view + .claude/skills/action (replayable
    gestures). Do NOT add an MCP server or a hook — no new backend capability or non-bypassable rule is
    warranted here (the wall already guards kernel.*); a new artifact may ADD a guardrail, never REMOVE
    one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If the operation ref "createOrder", an entity
  field, the Expr-AST node set, the action effect verbs (navigate/toast/toast.error), or the exact
  control/action JSONB shape are not pinned by an existing migration / ADR / CONTEXT.md / KRD section,
  do NOT guess — record an OpenQuestion (provenance) and STOP on that branch.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The control
  and action fixtures are means-tests toward the human red, not new truths.
- Any change to a prior contract (S02 records, the Expr AST, the Operation shape, the wall GRANTs) goes
  through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact, never
  hand-edit back/gen/**.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster. Concretely: the control STATE fixture passes (visible=false empty cart,
enabled=false invalid form, enabled=true valid form); the action EVENT fixture passes — Plan resolves
click("checkout-button") to invoke operation "createOrder" (the action BINDS the operation); the rapid
invariant holds; /control renders the button + bound action + the 3 state rows with a passing Playwright
e2e; GRANTs prove SELECT-only on kernel.control/kernel.action; the migration is append-only/expand-only.
You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (control state fixture, action event fixture, rapid property), where stored
  (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (fixtures, rapid/go test, biome, eslint, playwright).
- UI route: /control — what it renders, e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent);
  any prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no rendered-button emitter yet, no MCP, Expr-node coverage, effect verbs supported.
- Next safe step: the smallest stable next tooth (e.g. emit the button projection from control+action,
  or the operation fixture state→cmd→events) and why it is safe to chain.
```
