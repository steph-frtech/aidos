# S49 — SagaInvariant + CoherenceTest (distributed-transaction invariant; a failed leg triggers compensation)

Subsystem: AIDOS Kernel | Home: `back/kernel/sagas` | Workbench route: `/sagas`

## Objectif

Land the **SagaInvariant** as a Kernel source: a cross-cell distributed-transaction invariant that binds named `participants` (e.g. `order`, `payment`, `shipping`) to a `property` that must hold across the federation (the canonical `checkout-payment-shipping`: **« si `payment_captured` alors `order_confirmed` ou `compensation_executed` »**, KRD §49.2), each participant carrying its `compensation` step, and its mirror typed by a `cert_language ∈ {statechart, pact, tla+}`. The mirror is a statechart/fixture proving the property holds across the **happy path** (every leg commits → the property is satisfied) **and** that a **failed leg triggers compensation** (a leg fails after `payment_captured` → the saga runs the declared compensation steps → `compensation_executed` holds, so the property is still satisfied — never a captured payment with neither a confirmed order nor an executed compensation). Plus the sibling **CoherenceTest** (KRD §49.2): given the version-pinned contracts between participants (`order.events@hash`, `payment.commands@hash`), **« aucun événement consommé n'est produit par une version incompatible »** — a participant must not consume an event a *non-head / incompatible* version produced. This makes "the federation stays coherent under a partial failure" a typed, content-addressed truth, not a convention — and it is, per KRD §49.1, **an expensive, explicit exception, not the normal mode**: sagas live at the `contract_pair` / `federation_policy` scope, never scattered everywhere.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the saga table), a **behaviour proof** (a BDD mirror — a statechart-shaped fixture + a property), and a **visualization** (a Next route) — and nothing more. It does **not** warrant a new hook, MCP server, or skill (justified below).

- **Go package** `back/kernel/sagas/` — the `SagaInvariant` AST type per KRD §49.2 (`name`, `scope ∈ {contract_pair, federation_policy}` — never `local_cell`, a saga is transverse by definition (§49.1), `participants []SagaParticipant`, `property` (the cross-cell predicate as an **Expr DSL AST** — reused, never free Go), `mirror { cert_language ∈ {statechart, pact, tla+} }`). A `SagaParticipant` carries `{cell, commits []eventName, compensation []stepRef}` where each `stepRef` pins an **S10 operation** by `id@version` (the compensation legs are operations, not free code) and the participant→participant contracts are pinned via **S17 `contracts_with` links** (`order.events@hash`, `payment.commands@hash`). The sibling `CoherenceTest` AST: `{contracts []ref@hash, property}`. A pure `Validate(saga)` (shape: non-empty `name`; `scope` is one of the two transverse values — reject `local_cell`; `participants` length ≥ 2 — a single-participant "saga" is a monster; `property` parses as an Expr AST over the participants' event vocabulary; every `compensation` stepRef and every contract ref is a **pinned `id@version`** (S17 — an unpinned participant link is itself a monster); `cert_language` ∈ the closed three-set). The two pure evaluators:
  - **`Evaluate(saga, trace) → SagaOutcome`** — given a saga and an event `trace` (the ordered events the federation actually emitted, the statechart's terminal state), returns **`satisfied | violated`** **plus**, when violated, an actionable `BlockReason` (KRD §44.5: `code`, `severity`, `explanation`, `how_to_fix[]`). The happy path (every leg commits) ⇒ `satisfied`; a leg that fails after `payment_captured` whose declared compensation ran (`compensation_executed`) ⇒ `satisfied` (the property holds *via* compensation); a leg that fails after `payment_captured` with **no** compensation executed ⇒ `violated` with `code: SAGA_INVARIANT_VIOLATED` (a captured payment with neither `order_confirmed` nor `compensation_executed` — the dangling-money monster) and `how_to_fix: [declare_compensation_for_<leg>, run_compensation_on_failure]`.
  - **`CheckCoherence(coherenceTest, heads) → CoherenceOutcome`** — given the pinned consumed/produced contract refs and the `heads` map `contractId → headVersion` (reusing the **S17 `Resolve`** staleness primitive — do **not** fork it), returns `coherent | incompatible`: an event consumed at a version the producer no longer produces at head ⇒ `incompatible` with `code: INCOMPATIBLE_CONTRACT_VERSION`. Pure functions only, no I/O, no clock/RNG — `Evaluate`/`CheckCoherence` are pure over their inputs so the proof is deterministic and replayable. The actual saga *execution* (running real compensation operations against a live store) and the federation runtime wiring are later projections, **not** this step — this step proves the *invariant and its compensation property*, statechart-shaped, against a mock/declared trace.
- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration adding the AST table `kernel.saga_invariant`, a content-addressed append-only row (`id text PRIMARY KEY` = hash of the canonical JSONB body, `body jsonb NOT NULL` holding `{name, scope, participants, property, mirror, coherence_test}`, `version text NOT NULL` = same hash, `superseded_by text NULL`, `created_at timestamptz NOT NULL`), reusing the **S02** record substrate / content-hash scheme (do **not** fork it). The `scope` and `cert_language` are constrained: a `scope` CHECK enum (`'contract_pair' | 'federation_policy'`) — `local_cell` is deliberately **excluded** so a saga cannot be declared cell-local; the participant lists, the property AST, the pinned compensation/contract refs and the `cert_language` live **inside** the JSONB body (they are version-pinned refs, not foreign keys — a stale/absent target must stay inspectable so it can be shown red, never forbidden by an FK). GRANTs: the agent DB role gets **SELECT only** on `kernel.saga_invariant` (the wall, §2; the S04 PreToolUse hook already guards `kernel.*` at the schema level). Only the `aidos` CLI writer role inserts a saga, via an approved ChangeSet.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **SagaInvariant statechart fixture** (`test_kind: fixture`, `cert_language: statechart`, `authority: above`): `state → command → events` over the saga state machine (`reserve order → capture payment → schedule shipping`), covering the happy path **and** the failed-leg-triggers-compensation case. Plus a **property invariant** (rapid, `authority: below`) on `Evaluate` and `CheckCoherence`. These **are** the done criteria (see below).
- **Next route** `front/web/app/sagas/` → `/sagas` — the Workbench panel rendering the saga as a statechart with its participants, the cross-cell property, and the live outcome table — the happy path green, the failed-leg-with-compensation green (compensation path drawn), and the dangling-money case **red** (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no hook** — the saga-coherence check is a *decision function the federation/`/goal` flow calls*, not a non-bypassable wall rule, and the S04 wall hook already guards `kernel.*` at the schema level (a new hook would need its own fault-injection test and a real failed run first, §5 hook honesty). **No MCP server** — no new backend capability is exposed (`Evaluate`/`CheckCoherence` are pure logic called in-process; the saga *executor* / federation runner is a later runtime step). **No Skill** — declaring a saga invariant is not yet a repeatable multi-step gesture distinct from the generic "declare a source". **No codegen** — there is no projection to emit from a saga AST at this step. **No real compensation execution** — the compensation legs are *referenced* S10 operations (pinned `id@version`); running them against a live store is a later runtime wiring. **No `TemporalInvariant`** (KRD §49.3 — "within 5 minutes", clocks/timeouts/retries) and **no `RedWorkQueue`** (§49.4) — those are sibling/later steps; here the saga is evaluated against a declared trace, with no clock. **No new Expr/Operation/link semantics** beyond *referencing* them: the `property` reuses the **S08 Expr DSL**, the compensation legs reuse **S10 operations**, and the participant contracts reuse **S17 `contracts_with` links** + `Resolve` — this step is the saga *substrate and its compensation/coherence proof*, not a re-implementation of those primitives.

## Test minimal (done)

**Done = a failed leg triggers compensation, so a captured payment is never left with neither a confirmed order nor an executed compensation.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **SagaInvariant statechart fixture** (`cert_language: statechart`, `authority: above`) — reflects `kernel.saga_invariant` "checkout-payment-shipping" (KRD §49.2), as `state → command → events`:

  ```
  # mirrors schema · reflects: kernel.saga_invariant "checkout-payment-shipping" · test_kind: fixture · cert_language: statechart · authority: above
  saga "checkout-payment-shipping" {
    scope:    federation_policy
    participants: [
      { cell: order,    commits: [ order_confirmed ],        compensation: [ cancelOrder@v2 ] },
      { cell: payment,  commits: [ payment_captured ],        compensation: [ refundPayment@v3 ] },
      { cell: shipping, commits: [ shipping_scheduled ],      compensation: [ ] }
    ]
    property: "payment_captured implies (order_confirmed or compensation_executed)"
    mirror { cert_language: statechart }
  }

  # the happy path — every leg commits, the property holds
  given trace [ order_confirmed, payment_captured, shipping_scheduled ]
    -> outcome == "satisfied"

  # THE done case — shipping fails AFTER payment_captured ⇒ the saga runs the declared compensation
  given trace [ order_confirmed, payment_captured, shipping_failed ]
    when run_compensation
      -> events: [ refundPayment@v3, cancelOrder@v2, compensation_executed ]   # the failed leg triggers compensation
      -> outcome == "satisfied"                                                # property holds VIA compensation, not despite it

  # the monster the saga forbids — a captured payment with NO confirmed order and NO compensation
  given trace [ payment_captured ]                                             # leg failed, compensation never ran
    -> outcome == "violated"
    -> block_reason.code == "SAGA_INVARIANT_VIOLATED"
    -> block_reason.how_to_fix contains "run_compensation_on_failure"

  # CoherenceTest — a consumed event from an incompatible (non-head) producer version is rejected
  coherence_test {
    contracts: [ order.events@v3, payment.commands@v2 ]
    property:  "aucun événement consommé n'est produit par une version incompatible"
  }
  given heads { "order.events": "v3", "payment.commands": "v4" }               # payment.commands head is v4, the saga pins v2
    -> coherence == "incompatible"
    -> block_reason.code == "INCOMPATIBLE_CONTRACT_VERSION"
  given heads { "order.events": "v3", "payment.commands": "v2" }
    -> coherence == "coherent"
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any saga and any trace, `Evaluate` is **deterministic** and **total** (always one of `satisfied | violated`); the **core safety property** — for **every** trace in which `payment_captured` occurs, `Evaluate == satisfied` **iff** the trace also contains `order_confirmed` **or** `compensation_executed`, and `violated` otherwise (a captured payment with neither is *always* a `SAGA_INVARIANT_VIOLATED` violation — no trace makes the dangling-money monster acceptable); a participant with a non-empty `compensation` whose leg failed but whose compensation did **not** run ⇒ never `satisfied`; `Validate` rejects a `scope: local_cell` saga, a single-participant saga, an unpinned compensation/contract ref (S17), an unparsable `property`, and a `cert_language` outside `{statechart, pact, tla+}`; `CheckCoherence` is deterministic and `incompatible` whenever a consumed contract ref is pinned to a non-head version (it composes `Resolve`, S17 — `absent`/`stale` head ⇒ `incompatible`), `coherent` only when every consumed ref pins exactly the producer's head; neither evaluator ever panics on a malformed/partial trace — it yields an outcome, not a crash.

All start **red** (no `sagas` package, no `saga_invariant` table, no `Validate`/`Evaluate`/`CheckCoherence`). That red **is** the `/goal`. The canonical done case is green only when, for the `checkout-payment-shipping` saga, a trace where a leg fails after `payment_captured` and the declared compensation runs yields `compensation_executed` and an outcome of `satisfied`, while a captured payment with neither a confirmed order nor an executed compensation yields `violated` with a `SAGA_INVARIANT_VIOLATED` `BlockReason` whose `how_to_fix` names running the compensation — i.e. **a failed leg triggers compensation; the federation never leaves money captured against nothing.**

## Visualisation UI

- **Workbench route:** `front/web/app/sagas/page.tsx` (new route `/sagas`; do **not** touch existing routes). It renders the "checkout-payment-shipping" saga: the **statechart** (the three participant states `order → payment → shipping`, the forward commit transitions, and the **compensation transitions** drawn back from a failed leg), the `participants` cards (cell, committed events, compensation step refs pinned `id@version`), the cross-cell `property` and the `cert_language` badge (`statechart`), plus a live **outcome table** — the fixture rows with their computed `outcome` and, when violated, the `BlockReason` `code` + `how_to_fix`. A separate **CoherenceTest** card shows the pinned contracts (`order.events@v3`, `payment.commands@v2`) and the `coherent` / `incompatible` verdict against the current `heads`. With the canonical example the happy-path row shows `satisfied`, the failed-leg-with-compensation row shows `satisfied` (the compensation transitions `refundPayment@v3 → cancelOrder@v2 → compensation_executed` highlighted), the dangling-money row shows `violated` in **red** with `SAGA_INVARIANT_VIOLATED`, and the CoherenceTest card shows `incompatible / INCOMPATIBLE_CONTRACT_VERSION` in red when `payment.commands` head has moved past the pinned `v2`. Reads via the SELECT-only role; renders the fixture, does not re-implement the evaluators.
- **Playwright e2e:** `tests/e2e/sagas.spec.ts` — navigate to `/sagas`, assert the saga card names `scope: federation_policy`, lists the three participants `order` / `payment` / `shipping` and the cross-cell property `payment_captured implies (order_confirmed or compensation_executed)`; assert the outcome table shows the happy-path row as `satisfied`, the failed-leg row as `satisfied` with the compensation steps `refundPayment` and `cancelOrder` and `compensation_executed` visible (a failed leg triggers compensation), and the dangling-money row as `violated` with `SAGA_INVARIANT_VIOLATED` shown **red**; assert the CoherenceTest card shows `incompatible` with `INCOMPATIBLE_CONTRACT_VERSION` when `payment.commands` is pinned to a non-head version. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/sagas/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored saga fixture/property materialized to `tests/`, `tests/e2e/sagas.spec.ts`, and `front/web/app/sagas/**` — and otherwise **adds new files**. It introduces one new contract (the `SagaInvariant` + `SagaParticipant` + `CoherenceTest` AST shapes, the `scope` two-set, the `cert_language` three-set, the `Evaluate`/`CheckCoherence` semantics, and the `SAGA_INVARIANT_VIOLATED` / `INCOMPATIBLE_CONTRACT_VERSION` `BlockReason` codes) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes; the migration is **expand-only / append-only** and never alters or drops a prior table or GRANT. Any change to a **prior contract** it depends on — the S02 record substrate / content-hash scheme, the **S08** Expr DSL AST (the `property`), the **S10** operation refs (the compensation legs), the **S17** link types / `Resolve` staleness primitive (the participant contracts + CoherenceTest), the **S48** `GlobalInvariant` scope/blast_radius/approval (KRD §49.1, the transverse-invariant frame the saga specialises), the `BlockReason` shape (S13/KRD §44.5), or the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema/mirror (S21), never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8). A saga row is **kept** (append-only), never deleted; superseding goes through `superseded_by` via a ChangeSet, never a destructive edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S49 — "SagaInvariant + CoherenceTest (distributed-transaction
invariant; a failed leg triggers compensation)". Stack is FROZEN: back=Go, truth=Postgres (append-only,
content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench).
Home = back/kernel/sagas ONLY (the placeholder CLAUDE.md §4 names but that was never created — you create
it). Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §49.2 (SagaInvariant — name, participants [order, payment, shipping],
property "si payment_captured alors order_confirmed ou compensation_executed", mirror cert_language ∈
{statechart, pact, tla+}; AND CoherenceTest — contracts order.events@hash / payment.commands@hash, property
"aucun événement consommé n'est produit par une version incompatible"; "un changement dans une cellule ne
bloque ni ne corrompt la fédération"), §49.1 (GlobalInvariant — un invariant transverse est une EXCEPTION
coûteuse, pas le mode normal; les sagas vivent au niveau contract_pair ou federation_policy, PAS dispersées
partout; scope/blast_radius/approval_required), §49.3 (TemporalInvariant — OUT OF SCOPE here, no clocks/
timeouts/"within 5 minutes" this step), §49.4 (RedWorkQueue — OUT OF SCOPE here), §44.5 (BlockReason: code,
severity, explanation, how_to_fix[] — "tout refus doit être actionnable"). Read CONTEXT-MAP.md +
back/kernel/CONTEXT.md (Layer, source/projection, contracts/ports, the four qualifying attributes,
completeness law, test-as-goal/means, the waterline) and the prior steps you REUSE: S02 (the content-
addressed append-only record substrate — reuse its Canonicalize/Hash for the saga_invariant row, do NOT fork
it), S04 (the wall — the agent has no kernel/mirrors/fitness grant), S08 (the Expr DSL — the `property` is an
Expr AST, reused, never free Go), S10 (the Operation DSL interpreter — the compensation legs are operations
pinned id@version; createOrder is its canonical fixture), S17 (the six versioned link types + Resolve — the
participant contracts are `contracts_with` links pinned id@version; CheckCoherence COMPOSES Resolve's
green/stale/absent staleness, do NOT fork it), S48 (GlobalInvariant, KRD §49.1 — the transverse-invariant
frame the saga specialises; a saga's scope is one of {contract_pair, federation_policy}, never local_cell).
For any Next.js 16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs. Do not start without
grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/kernel/CONTEXT.md: a "SagaInvariant" is a CROSS-CELL distributed-
    transaction invariant binding named `participants` to a `property` that must hold across the federation,
    each participant carrying its `compensation` steps; it is an EXPENSIVE, EXPLICIT EXCEPTION (§49.1), not
    the normal mode — its `scope` is `contract_pair` or `federation_policy`, NEVER `local_cell`. The
    canonical property is "payment_captured implies (order_confirmed or compensation_executed)". An "outcome"
    is `satisfied | violated`. A "failed leg triggers compensation" means: when a leg fails after
    payment_captured, the saga runs the declared compensation steps so `compensation_executed` holds and the
    property is STILL satisfied — the forbidden monster is a captured payment with NEITHER order_confirmed
    NOR compensation_executed. A "CoherenceTest" asserts "aucun événement consommé n'est produit par une
    version incompatible" — a participant must not consume an event a non-head/incompatible producer version
    produced. A "compensation" leg is an S10 operation pinned id@version (NOT free code); a participant
    contract is an S17 `contracts_with` link pinned id@version. Do NOT use "two-phase commit", "distributed
    lock", "transaction manager", or "rollback" as synonyms for the saga or compensation. Resolve every
    branch before coding — especially: what counts as a "failed leg", that the property holds VIA
    compensation (not despite it), and that this step evaluates a DECLARED trace (no clock, no real
    execution, §49.3 temporal is a later step). If a term shifts, update back/kernel/CONTEXT.md / write an
    ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - SagaInvariant statechart fixture (cert_language: statechart, authority: above), reflecting
        kernel.saga_invariant "checkout-payment-shipping": scope federation_policy; participants
        [ order {commits [order_confirmed], compensation [cancelOrder@v2]}, payment {commits
        [payment_captured], compensation [refundPayment@v3]}, shipping {commits [shipping_scheduled],
        compensation []} ]; property "payment_captured implies (order_confirmed or compensation_executed)";
        mirror {cert_language statechart}. Rows: happy trace [order_confirmed, payment_captured,
        shipping_scheduled] -> outcome==satisfied ; failed-leg trace [order_confirmed, payment_captured,
        shipping_failed] + run_compensation -> events [refundPayment@v3, cancelOrder@v2,
        compensation_executed], outcome==satisfied (THE done case — a failed leg triggers compensation) ;
        dangling-money trace [payment_captured] (compensation never ran) -> outcome==violated,
        block_reason.code==SAGA_INVARIANT_VIOLATED, how_to_fix contains run_compensation_on_failure ;
        CoherenceTest contracts [order.events@v3, payment.commands@v2] -> with heads {payment.commands: v4}
        coherence==incompatible / INCOMPATIBLE_CONTRACT_VERSION, with heads {payment.commands: v2}
        coherence==coherent.
      - property invariant (rapid, authority: below): Evaluate is deterministic AND total (always
        satisfied|violated); for EVERY trace containing payment_captured, satisfied IFF it also contains
        order_confirmed OR compensation_executed, violated otherwise (no trace makes the dangling-money
        monster acceptable); a non-empty compensation whose leg failed but did not run ⇒ never satisfied;
        Validate rejects scope local_cell, a single-participant saga, an unpinned compensation/contract ref,
        an unparsable property, a cert_language outside {statechart, pact, tla+}; CheckCoherence is
        deterministic, incompatible whenever a consumed ref pins a non-head version (composing S17 Resolve),
        coherent only at head; neither evaluator panics on a partial trace.
    Run them; watch them go RED (no sagas package, no saga_invariant table, no Validate/Evaluate/
    CheckCoherence). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a
    new saga invariant you'd grade yourself) — mirror the human intention (KRD §49.2) only; the fixture is a
    means-test toward the human red.

(c) TDD red→green→refactor, in back/kernel/sagas ONLY (plus the back/migrations/ AST-table file). Outside-in.
    Build: the typed SagaInvariant + SagaParticipant + CoherenceTest AST (scope two-set, cert_language
    three-set, pinned compensation/contract refs), Validate(saga)→error, a pure Evaluate(saga, trace)→outcome
    (+BlockReason when violated), and a pure CheckCoherence(test, heads)→outcome — no I/O, no clock/RNG.
    REUSE: S02's Canonicalize/Hash for the row (do NOT fork it); the S08 Expr AST for the `property` (parse/
    eval it, do NOT write a bespoke predicate parser); the S10 operation ref shape for compensation legs
    (reference, do NOT re-implement operations); the S17 Link/`contracts_with` ref shape AND Resolve for the
    participant contracts + CheckCoherence staleness (compose it, do NOT fork it). Within the frozen slots, if
    a REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (Godog, rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx are fixed). The
    likely genuine choices: the statechart shape used to encode the saga state machine for the fixture (reuse
    the existing fixture-file format S10/S17 established — the workflow truth is a fixture state→cmd→events,
    interpreted in Go; XState stays CLIENT-ONLY, never the truth executor); and the canonical-JSONB shape of
    the saga_invariant body. Record a short ADR (docs/adr/) ONLY if a genuine choice is made (e.g. the
    statechart encoding, or the compensation-trigger semantics). The migration is expand-only/append-only with
    a scope CHECK enum that EXCLUDES local_cell; GRANT the agent role SELECT only on kernel.saga_invariant
    (the wall); refs live inside the JSONB body, NOT as foreign keys (a dangling/incompatible target must stay
    inspectable to be shown red). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test (incl. the new fixture
    + rapid mirrors), biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Evaluate on the three
    traces (happy, failed-leg-with-compensation, dangling-money) and CheckCoherence on the coherent /
    incompatible heads, state the cause, propose. Check completeness: the saga_invariant layer has its living
    mirror (the statechart fixture + the property) and each required test_kind is present (KRD §33); no monster
    (no saga without its fixture, no participant without a fixture row, no compensation branch unproven, no
    single-participant or local_cell saga admitted) — else Stop blocks. Do not finish a code step without
    /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/sagas/ → /sagas: the
    checkout-payment-shipping statechart (order → payment → shipping forward commits + the compensation
    transitions drawn back from a failed leg), the participant cards (cell, committed events, compensation
    step refs id@version), the cross-cell property + cert_language badge, and a live outcome table (the
    fixture rows with computed outcome; violated rows show BlockReason code + how_to_fix, the dangling-money
    row shown RED); a CoherenceTest card showing the pinned contracts and coherent/incompatible against the
    current heads (incompatible shown RED with INCOMPATIBLE_CONTRACT_VERSION). Themed per ADR 0010 (design
    tokens, never hardcoded zinc-*/hex) and bilingual per ADR 0011 (next-intl, FR default, strings in
    front/web/messages/{fr,en}.json). Read via the SELECT-only role; render the fixture, do not re-implement
    the evaluators. Do NOT touch existing routes. Add tests/e2e/sagas.spec.ts (use the playwright-e2e skill)
    asserting scope federation_policy, the three participants, the cross-cell property, the happy-path
    satisfied row, the failed-leg satisfied row with refundPayment/cancelOrder/compensation_executed visible
    (a failed leg triggers compensation), the dangling-money violated/SAGA_INVARIANT_VIOLATED red row, and the
    CoherenceTest incompatible/INCOMPATIBLE_CONTRACT_VERSION verdict.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that sagas
    is a deep, well-named module (SagaInvariant/SagaParticipant/CoherenceTest/Validate/Evaluate/CheckCoherence
    separated, the scope set closed and obvious); that Evaluate/CheckCoherence are pure and REUSE the S08 Expr
    eval, the S17 Resolve, and the S02 record/hash scheme without duplicating them; that the migration/GRANTs
    keep the wall intact (SELECT-only on kernel.saga_invariant, scope CHECK excludes local_cell); that the
    saga stays a transverse exception (§49.1), not scattered cell-local logic; boundaries match
    back/kernel/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the statechart fixture + rapid property (behaviour proof), and the Next route
    (visualization). Do NOT add a hook (the wall already guards kernel.*; coherence is a pure decision the
    federation/`/goal` flow calls, not a wall rule), an MCP server (no new backend capability; the saga
    EXECUTOR / federation runner is a later runtime step), a Skill (no distinct repeatable gesture), or
    codegen (nothing to emit from a saga AST). Do NOT build TemporalInvariant (§49.3) or RedWorkQueue (§49.4)
    here. A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The participants (order, payment, shipping), the
  property ("payment_captured implies (order_confirmed or compensation_executed)"), and the cert_language set
  {statechart, pact, tla+} are pinned by KRD §49.2 — do NOT add a participant, a cert_language, or an event
  the human did not name. If the exact saga_invariant JSONB shape, the statechart encoding, the compensation-
  trigger semantics, the event vocabulary, or the CoherenceTest contract-ref shape is not pinned by KRD
  §49.1/§49.2 / an existing migration / S02's Canonicalize / S08 Expr / S17 links / an ADR / CONTEXT.md, do
  NOT guess — record an OpenQuestion (provenance) and STOP on that branch. In particular, do NOT admit a
  scope: local_cell saga, do NOT admit a single-participant saga, do NOT add a "trusted/optimistic" bypass
  that lets a captured payment skip compensation, and do NOT invent temporal/timeout semantics (§49.3 is a
  later step).
- You NEVER write a truth-test (a new saga invariant you would then satisfy — the circularity). The statechart
  fixture and the rapid property are means-tests toward the human red (a failed leg triggers compensation; no
  dangling captured payment), not new truths you author to pass the gate.
- Any change to a prior contract (S02 records/hash, the S08 Expr AST, the S10 operation refs, the S17 link
  types / Resolve, the S48 GlobalInvariant scope/approval, the BlockReason shape S13, the wall GRANTs §2/S04)
  goes through a ChangeSet + SemanticDiff (S20/S21). Add new files; never silently rewrite a prior artifact,
  never hand-edit back/gen/**. A saga row is kept (append-only), never deleted; superseding goes through
  superseded_by via a ChangeSet.
- Surface assumptions; present multiple readings rather than silently picking one.

DETERMINISM-FIRST (CLAUDE.md §6/§8 mandate): everything this step needs IS a deterministic pure function and
MUST be code, never an agent/LLM — parsing the saga AST, evaluating the Expr `property` over a trace, deciding
satisfied|violated, matching a failed leg to its declared compensation, hashing the canonical body, and the
S17-Resolve-based coherence check are all pure functions; Evaluate/CheckCoherence are authoritative and
deterministic (same saga + same trace/heads ⇒ same outcome). There is NO LLM in this step's loop. Carry a
reproducibility mirror for each evaluator (the rapid property already pins same-input ⇒ same-output). An agent
"deciding" whether a saga is satisfied instead of the pure evaluator would be a determinism gap that blocks the
step (like a headless capability or a monster).

MINTLIFY TWO-PAGE DOC MANDATE (CLAUDE.md §6, every step, no exception): ship the « Pour moi » pages for S49 —
a concept page (.aidos-docs/steps/concept/s49-saga-invariant.mdx) AND an internals page
(.aidos-docs/steps/internals/s49-saga-invariant.mdx) carrying the three layers Implémentation · Méta ·
Méta-méta — and, since this step ships a user-facing capability (the /sagas Workbench panel + the SagaInvariant
concept), UPDATE the « Pour les futurs utilisateurs » guide (guide/* and/or concepts/*) with how to declare a
cross-cell saga + compensation and read its coherence. Phase 1 (/grill-with-docs) writes the concept page +
the Méta/Méta-méta layers; Implémentation is completed at green. Prose FRANÇAIS (vous), KRD terms verbatim
(SagaInvariant, participant, compensation, CoherenceTest, fédération). The step is NOT done until the « Pour
moi » pages are live — `mint validate` + `mint broken-links` clean, pushed to steph-frtech/docs main, verified
via mcp__mintlify-aidos. Convention: .agents/skills/grill-with-docs/MINTLIFY-DOCS.md; syntax: the `mintlify`
skill.

LINEAR (CLAUDE.md §11): move the S49 step issue (`S49 · SagaInvariant + CoherenceTest`, label `step`) to
In Progress at step start and to Done only when green ∧ verified; file/update any ADR issue (label `adr`) if a
genuine choice lands. MCP-first (mcp__linear-server__*), AIDOS project aidos-2a9085453be8.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the statechart fixture passes — the happy-path trace is `satisfied`; a leg
that fails after payment_captured triggers the declared compensation (events refundPayment@v3, cancelOrder@v2,
compensation_executed) and the outcome is `satisfied` (THE done criterion: a failed leg triggers compensation);
a captured payment with neither order_confirmed nor compensation_executed is `violated` with a
SAGA_INVARIANT_VIOLATED BlockReason whose how_to_fix names running the compensation; CheckCoherence is
`incompatible`/INCOMPATIBLE_CONTRACT_VERSION when a consumed contract pins a non-head version and `coherent` at
head; the rapid invariants hold (Evaluate total + deterministic, the safety property for every trace, Validate
rejects local_cell / single-participant / unpinned refs / bad cert_language, CheckCoherence composes Resolve,
no panic); /sagas renders the statechart + outcome table + CoherenceTest card with the dangling-money row red
and a passing Playwright e2e; the GRANT proves SELECT-only on kernel.saga_invariant and the scope CHECK
excludes local_cell; the migration is append-only/expand-only; the « Pour moi » Mintlify pages are live. You
cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (SagaInvariant statechart fixture, rapid property + CoherenceTest), where stored
  (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /sagas — what it renders (statechart with compensation transitions, participant cards, outcome
  table, CoherenceTest card), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to kernel.saga_invariant go through the aidos CLI
  role, not the agent); any prior-contract change (S02 records/hash, S08 Expr, S10 operation refs, S17 links/
  Resolve, S48 GlobalInvariant, BlockReason, wall GRANTs) → ChangeSet + SemanticDiff (note the change_type),
  else "none".
- Red-set status: which scenarios went red then green; any still red.
- Docs: the « Pour moi » concept + internals pages for S49 (paths), mint validate / broken-links result, push
  status; any « Pour les futurs utilisateurs » guide update.
- Known limits: e.g. no real compensation execution / federation runtime wiring yet (compensation legs are
  referenced S10 operations), no TemporalInvariant (§49.3 — no clocks/timeouts/retries) and no RedWorkQueue
  (§49.4), the saga is evaluated against a declared trace, no hook/MCP, cert_language proven (statechart) vs
  declared-only (pact/tla+), BlockReason codes supported, CoherenceTest scope.
- Next safe step: the smallest stable next tooth (e.g. the TemporalInvariant of §49.3 — declaring a saga's
  clock/timeout — or wiring Evaluate/CheckCoherence into the federation/`/goal` admission gate, or the saga
  EXECUTOR that runs real compensation operations) and why it is safe to chain.
```
