# S33 — ContextRouter/ContextPack: compile minimal context from the red-set, branch-aware

Subsystem: AIDOS Runtime | Home: `back/runtime/context` | Workbench route: `/context-pack`

## Objectif

Land the **ContextRouter** — the deterministic context compiler (KRD §144) that takes a red `goal` and emits the **minimal** `ContextPack` (KRD §143) needed to work it: only the load-bearing kernel nodes, the red/required mirrors, the cross-boundary contracts, and the scoped memory — **branch-aware, bounded-context-aware, goal-aware**. The done invariant: a `checkout` goal's pack contains the checkout subgraph and **not** billing internals, and **stale** memory is excluded (KRD §119.3 `forbidden: [stale, out_of_scope]`).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (the router algorithm as a Go package), a **capability** (the `context` MCP server that compiles a pack on demand), a **repeatable gesture** (the `/context` skill), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new migration or a new hook (justified below).

- **Go package** `back/runtime/context/` — the **ContextRouter** as the pure `compile_context(goal) → ContextPack` algorithm of KRD §144, plus the `ContextPack` value type of KRD §143. The router is the deterministic pipeline: `red ← compute_red_set(goal)` (reuse the S22 impact/red-wave red-set; do **not** recompute it), `subgraph ← affected_subgraph(red, depth_by_link_type)` over the ContextGraph (KRD §142 — nodes `Layer | Mirror | Idea | MemoryRecord | PhaseStable | Sensor | Skill | Tool`, edges = the seven KRD links + provenance/generated_by/failed_by/repaired_by), then include kernel nodes that are **load-bearing**, the mirrors that **define the stop condition** (the red ones), the contracts that **cross a bounded-context boundary**, the memory records with **scope overlap and confidence ≥ repeated**, **exclude** cosmetic siblings below the activation threshold, **exclude** `stale` / `out_of_scope` / `unapproved` (KRD §119.3 `forbidden`), cap tokens by summarizing lower-priority memory, and `emit ContextPack + hash`. The emitted `ContextPack` carries `goal`, `branch`, `affected_layers`, `active_kernel{ mirrors, invariants, contracts }`, `boundaries{ bounded_context, allowed_paths, forbidden_paths }` (always `/kernel/**`, `/mirror/**` forbidden — the wall, §2, rendered as a boundary), `memory{ relevant_lessons, recent_incidents, glossary_terms }`, `skills`, `tools`, and `stop_condition`. **Pure functions only, no I/O** — the router is handed a read-only ContextGraph view and returns a pack; it **reads** the graph, it **never writes** kernel/mirrors (it is a Runtime consumer of the derived `context` schema, not a writer of truth). The pack is **content-addressed** (`hash`) and reproducible: same goal + same branch + same graph snapshot ⇒ identical pack.
- **MCP server** `back/mcp/context/` (Go MCP SDK, one tool = one backend op) — the capability door: `context_compile(goal, branch) → ContextPack{+hash}` (runs the router against the current ContextGraph view for that branch), `context_pack_get(hash)` (replay a prior pack — packs are versioned, KRD §144), and read-only `context_graph_query(by_goal | by_bc | by_branch | by_term)` over the §142 indexes. It holds a **read-only** grant on the derived `context` schema and **no** grant on `kernel`/`mirrors`/`fitness` (the wall holds; the router only reads).
- **Skill** `.claude/skills/context/` (`SKILL.md`) — the `/context` gesture (KRD §149 tool table: "`/context` → compile le ContextPack → `/brain + graph`"): a repeatable procedure that, given a red goal, compiles the pack, shows what was included/excluded and why, and is the agent's standard "what context do I get for this goal" move. Justified as a Skill because it is a replayable gesture invoked across every future code step (the loop's context-loading move), not a one-off.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **ContextRouter compile fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `state(ContextGraph snapshot + goal + branch) → command(compile) → events(ContextPack)`, asserting the checkout pack includes checkout layers/mirrors/contracts and **excludes** billing internals and stale memory. Plus a **property invariant** (rapid, `authority: below`) on the router's minimality, determinism, and wall-as-boundary guarantees. These **are** the done criteria (see below).
- **Next route** `front/web/app/context-pack/` → `/context-pack` — the Workbench panel rendering the compiled pack for a chosen goal/branch: what is **in** the pack, what was **excluded** and why (cross-BC, stale, cosmetic-below-threshold), and the wall boundary (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no Atlas migration** — the `context` schema (the derived ContextGraph + `ContextGraphDecision`, KRD §142/§119.2) and the upstream graph derivation are a *separate* persistence concern; this step **reads** an existing/mocked ContextGraph view and compiles a pack from it (per §6 a step mocks what does not exist yet, never the reverse). **No new Hook** — the router is a compiler (a capability), not a non-bypassable rule; the wall is already enforced by the S04 PreToolUse hook + GRANTs, and the router merely *renders* `/kernel/**` `/mirror/**` as forbidden paths in the pack. If routing a missing fact later needs to become a *non-bypassable* rule, that is a future hook (record an OpenQuestion). **No `ContextGraphDecision` / Decision-Reuse Test** (KRD §119.2) — "may a past decision be reused" is the reuse control plane, a distinct later step; here the router only *compiles* the pack, it does not adjudicate decision reuse. **No memory firewall / embeddings** — the `MemoryRecord` scoring (scope overlap, confidence ≥ repeated, pgvector) belongs to the Archive `/brain` step; here memory records arrive already scored in the graph view and the router only *filters* them by scope/confidence/staleness. **No codegen** — a pack is a compiled artifact, not a frozen source; nothing to emit (no Go structs / DDL / TS types) from it.

## Test minimal (done)

**Done = a checkout goal does not receive billing internals; stale memory excluded.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **ContextRouter compile fixture** (`cert_language: fixture`, `authority: above`) — reflects the router output, as `state → command → events`:

  ```
  # mirrors schema · reflects: runtime.context.ContextRouter "checkout-goal-pack" · test_kind: fixture · authority: above
  mirror reflects "checkout-goal-pack" {

    given context_graph {
      goal: "checkout-apply-promo" on branch "main"
      red_set: [ view:cart, control:promo-field, operation:applyPromo ]      # from S22, not recomputed here
      layers: [ checkout:*, billing:invoice-internals, catalog:product ]
      mirrors: [ promo-field.fixture(red), applyPromo.workflow(red), canPlaceOrder.property, billing.dunning.fixture ]
      contracts: [ checkout-api@hash, PaymentGateway@hash (BC boundary), billing-internal@hash ]
      memory: [ idempotency-for-payment(confidence:repeated), out-of-stock-incident(scope:checkout),
                old-promo-rule(stale), refund-window(scope:billing) ]
    }
      when compile { goal: "checkout-apply-promo", branch: "main" }
        -> events: [ ContextPackEmitted ]

        # included — the checkout subgraph and its load-bearing kernel + red mirrors
        -> pack.affected_layers == [ view:cart, control:promo-field, operation:applyPromo ]
        -> pack.active_kernel.mirrors contains [ promo-field.fixture, applyPromo.workflow, canPlaceOrder.property ]
        -> pack.active_kernel.contracts contains [ checkout-api@hash, PaymentGateway@hash ]   # neighbor PUBLIC contract crosses the BC boundary
        -> pack.boundaries.bounded_context == "checkout"
        -> pack.boundaries.allowed_paths   contains "/src/checkout/**"
        -> pack.boundaries.forbidden_paths contains [ "/kernel/**", "/mirror/**" ]            # the wall rendered as a boundary
        -> pack.stop_condition == "red_set_green AND previous_green_intact AND aggregate_complete"
        -> pack.hash != null                                                                 # content-addressed, reproducible

        # THE done case — billing INTERNALS and stale memory are EXCLUDED
        -> pack.affected_layers does NOT contain "billing:invoice-internals"
        -> pack.active_kernel.mirrors does NOT contain "billing.dunning.fixture"
        -> pack.active_kernel.contracts does NOT contain "billing-internal@hash"             # internal, not a crossed PUBLIC contract
        -> pack.memory.relevant_lessons contains "idempotency-for-payment"
        -> pack.memory.recent_incidents contains "out-of-stock-incident"
        -> pack.memory does NOT contain "old-promo-rule"                                      # stale -> forbidden (KRD §119.3)
        -> pack.memory does NOT contain "refund-window"                                       # out-of-scope (billing) -> forbidden
    }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any ContextGraph snapshot and any red goal on any branch — **minimality**: every node in the emitted pack is reachable in `affected_subgraph(red)` (no node enters the pack that is not load-bearing for the red-set; a node from a *different* bounded context appears **only** as a crossed PUBLIC contract, never as internal layers/mirrors); **staleness/scope exclusion**: no `MemoryRecord` flagged `stale`, `out_of_scope`, or `unapproved` (KRD §119.3) ever appears, and every included memory record has scope overlap with the goal and confidence ≥ `repeated`; **wall-as-boundary**: `pack.boundaries.forbidden_paths` always contains `/kernel/**` and `/mirror/**` regardless of goal (the router never emits a pack that grants truth-write paths); **determinism / content-addressing**: same `(goal, branch, graph snapshot)` ⇒ byte-identical pack and identical `hash`; changing the branch can change the valid cut (branch-aware) but never leaks another branch's nodes; **stop-condition presence**: every pack carries a non-empty `stop_condition`.

All start **red** (no `back/runtime/context` package, no `ContextRouter`/`ContextPack`, no `context` MCP, no `/context` skill). That red **is** the `/goal`. The canonical done case is green only when the `checkout-apply-promo` pack contains the checkout subgraph + its red mirrors + the crossed `PaymentGateway@hash` contract, while **provably excluding** `billing:invoice-internals`, `billing-internal@hash`, the `billing.dunning.fixture`, the `stale` `old-promo-rule`, and the out-of-scope `refund-window` — i.e. **a checkout goal does not receive billing internals, and stale memory is excluded.**

## Visualisation UI

- **Workbench route:** `front/web/app/context-pack/page.tsx` (new route `/context-pack`; do **not** touch existing routes). It renders the compiled `ContextPack` for a selected `goal` + `branch`: an **Included** panel (affected layers, active kernel mirrors/invariants, crossed contracts, scoped memory lessons + recent incidents, glossary terms, skills, tools, the stop condition, the pack `hash`); an **Excluded** panel that makes the boundary *visible* — each excluded item tagged with **why** (`cross-BC` for `billing:invoice-internals` / `billing-internal@hash`, `stale` for `old-promo-rule`, `out-of-scope` for `refund-window`, `cosmetic-below-threshold`); and a **Boundaries** strip showing `allowed_paths` and the forbidden `/kernel/**` `/mirror/**` (the wall). Reads via the `context` MCP read-only tool; renders the compiled pack, does not re-implement the router.
- **Playwright e2e:** `tests/e2e/context-pack.spec.ts` — navigate to `/context-pack`, select the `checkout-apply-promo` goal on `main`; assert the Included panel shows the checkout affected layers, the red mirrors (`promo-field.fixture`, `applyPromo.workflow`), and the crossed `PaymentGateway@hash` contract; assert the Excluded panel shows `billing:invoice-internals` tagged `cross-BC` and `old-promo-rule` tagged `stale` (the done criterion, rendered); assert the memory shows `idempotency-for-payment` and `out-of-stock-incident` but **not** `refund-window` (out-of-scope) nor the stale rule; assert the Boundaries strip lists `/kernel/**` and `/mirror/**` as forbidden and shows a non-empty `stop_condition`; assert the pack `hash` is shown. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/context/**`, the new `back/mcp/context/**`, the new `.claude/skills/context/**`, the `mirrors`-stored compile fixture/property materialized to `tests/`, `tests/e2e/context-pack.spec.ts`, and `front/web/app/context-pack/**` — and otherwise **adds new files**. It introduces a new contract (the `ContextPack` shape per KRD §143, the `compile_context` router signature per §144, and the `/context` gesture) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the router is read-only over the ContextGraph and writes no truth. Any change to a **prior contract** it depends on — the S22 red-set/impact computation, the ContextGraph node/edge shape (KRD §142, whatever step derives the `context` schema), the seven KRD link types (S17), the wall GRANT/boundary set (§2/S04), the `Mirror` record (S06), the bounded-context/Context-Map contracts, or the `MemoryRecord` scoring shape — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema (S21), never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8). Note the boundary: this step is a Runtime **consumer** — it may read the derived `context` schema and the kernel/mirror nodes to *compile* a pack, but it provably **cannot write** `kernel`/`mirrors`/`fitness`, and the pack it emits always renders those zones as forbidden paths; that asymmetry is the contract.

## Prompt a lancer

```text
You are step-executor for AIDOS step S33 — "ContextRouter/ContextPack: compile minimal context from the
red-set, branch-aware". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the
agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home =
back/runtime/context ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §141 ("trop de contexte détruit le contexte" — the compiler exists
because overload makes the agent invent; "on ne donne pas le projet à l'agent, on compile un pack depuis
le graphe de vérité affecté"), §142 (ContextGraph — the unified live view: nodes Layer|Mirror|Idea|
MemoryRecord|PhaseStable|Sensor|Skill|Tool, edges = the seven KRD links + provenance/generated_by/
failed_by/repaired_by, indexes by_goal=red_set→affected_subgraph, by_bc, by_branch, by_term; DERIVED, not
hand-maintained), §143 (ContextPack — the compiled, short, traceable, branch-aware artifact: goal,
branch, affected_layers, active_kernel{mirrors,invariants,contracts}, boundaries{bounded_context,
allowed_paths,forbidden_paths}, memory{relevant_lessons,recent_incidents,glossary_terms}, skills, tools,
stop_condition — "the antidote to context drift: where you are, what to do, what you cannot touch, how you
know you are done"), §144 (ContextRouter — an ALGORITHM not a prompt: red←compute_red_set(goal);
subgraph←affected_subgraph(red, depth_by_link_type); include load-bearing kernel nodes; include mirrors
that define the stop condition; include contracts ACROSS the BC boundary; include memory with scope
overlap and confidence>=repeated; exclude cosmetic siblings unless activation threshold crossed; cap
tokens by summarizing lower-priority memory; emit ContextPack + hash; "the pack is itself versioned — a
missing fact becomes a scar: you add a routing rule or a memory record, never a vague instruction"),
§119.3 (Progressive Disclosure — the router NEVER gives the whole brain to the model; forbidden: [stale,
out_of_scope, unapproved]), §145 (the executable ContextMap bounds the compiled context and prevents the
global staircase). Read CONTEXT-MAP.md (AIDOS Runtime hosts the context compiler; bounded context; the
wall) + back/runtime/CONTEXT.md, and the prior steps you REUSE: S22 (impact / red-wave — reuse its red-set,
do NOT recompute it), S17 (the seven versioned link types — the edges the affected_subgraph walks), S06
(the Mirror record + liveness — the red mirrors that define the stop condition), S04/§2 (the wall — the
agent has no kernel/mirrors grant; the router READS the graph and RENDERS /kernel/** /mirror/** as
forbidden paths, it never writes truth), and whatever step derives the `context` schema (read-only here;
mock the ContextGraph view if it is not landed yet — §6: mock what does not exist, never the reverse). For
any Next.js 16, Go MCP SDK, or rapid API doubt use context7 or node_modules/next/dist/docs. Do not start
without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/runtime/CONTEXT.md + CONTEXT-MAP.md: the ContextRouter is a
    DETERMINISTIC COMPILER (an algorithm, §144), not a prompt and not a RAG; the ContextPack is the
    MINIMAL compiled, branch-aware artifact handed to the agent (§143); "compile from the red-set" means
    the pack is derived from compute_red_set(goal) (S22) → affected_subgraph, never from "the whole
    project". "Branch-aware" = the valid cut depends on the version branch (by_branch index); changing
    branch changes the cut but NEVER leaks another branch's nodes. "Bounded-context-aware" = a neighbor BC
    appears ONLY as its crossed PUBLIC contract, never as internal layers/mirrors (billing internals are
    OUT for a checkout goal). "Stale memory excluded" = §119.3 forbidden:[stale,out_of_scope,unapproved].
    Do NOT use "prompt", "RAG", "context window", or "embedding" as synonyms for ContextPack/ContextRouter
    (CONTEXT.md _Avoid_ list). Resolve every branch before coding — especially: the router READS the graph
    and writes NO truth; the pack ALWAYS forbids /kernel/** /mirror/** (the wall as a boundary); inclusion
    is load-bearing-only (minimality); exclusion reasons are explicit (cross-BC, stale, out-of-scope,
    cosmetic-below-threshold); the pack is content-addressed and reproducible. If a term shifts, update
    CONTEXT.md / write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - ContextRouter compile fixture (cert_language: fixture, authority: above), reflecting the router
        output "checkout-goal-pack", as state→command→events. State = a ContextGraph snapshot with goal
        checkout-apply-promo on branch main, a red_set (from S22) of [view:cart, control:promo-field,
        operation:applyPromo], layers including billing:invoice-internals and catalog:product, mirrors
        including red checkout ones AND billing.dunning.fixture, contracts including checkout-api@hash, the
        BC-boundary PaymentGateway@hash, and billing-internal@hash, memory including
        idempotency-for-payment(repeated), out-of-stock-incident(scope:checkout), old-promo-rule(STALE),
        refund-window(scope:billing). compile -> ContextPackEmitted with: affected_layers == the three
        red layers; active_kernel.mirrors contains the red checkout mirrors + canPlaceOrder.property;
        active_kernel.contracts contains checkout-api@hash AND the crossed PaymentGateway@hash;
        boundaries.bounded_context==checkout; allowed_paths contains /src/checkout/**; forbidden_paths
        contains /kernel/** and /mirror/**; stop_condition == "red_set_green AND previous_green_intact AND
        aggregate_complete"; hash != null. THE done case: affected_layers does NOT contain
        billing:invoice-internals; active_kernel.mirrors does NOT contain billing.dunning.fixture;
        active_kernel.contracts does NOT contain billing-internal@hash; memory contains
        idempotency-for-payment and out-of-stock-incident but NOT old-promo-rule (stale) NOR refund-window
        (out-of-scope).
      - property invariant (rapid, authority: below): for any graph snapshot and any red goal on any
        branch — minimality (every packed node is reachable in affected_subgraph(red); a different-BC node
        appears ONLY as a crossed PUBLIC contract); staleness/scope exclusion (no stale/out_of_scope/
        unapproved memory ever appears; every included memory has scope overlap and confidence>=repeated);
        wall-as-boundary (forbidden_paths ALWAYS contains /kernel/** and /mirror/** regardless of goal);
        determinism/content-addressing (same (goal,branch,snapshot) ⇒ byte-identical pack and identical
        hash; branch change can change the cut but never leaks another branch); stop_condition always
        non-empty.
    Run them; watch them go RED (no back/runtime/context package, no ContextRouter/ContextPack, no context
    MCP, no /context skill). That red IS the /goal. Do NOT write a truth-test you would then satisfy —
    mirror the human intention only.

(c) TDD red→green→refactor, in back/runtime/context ONLY (plus the back/mcp/context/ server and the
    .claude/skills/context/ SKILL.md). Outside-in. REUSE: S22's red-set (do NOT recompute it), S17's link
    types for affected_subgraph traversal, S06's Mirror record for "red mirrors that define the stop
    condition". The router is PURE: hand it a read-only ContextGraph view + goal + branch, get back a
    ContextPack{+hash}; NO I/O in the algorithm, the MCP does the reads. If a real tool choice arises
    WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (Godog, rapid, the fixture interpreter, sqlc/pgx, the Go MCP SDK, Go hook binaries
    are FIXED). Likely genuine choices: the canonical content-hash scheme for the ContextPack (reuse the
    S01 content-store scheme — do NOT fork it); the depth_by_link_type policy for affected_subgraph (keep
    it minimal and declared, not learned); the token-cap / summarize-lower-priority-memory strategy (keep
    it the simplest deterministic budget). Record a short ADR (docs/adr/) ONLY if a genuine choice is made
    (e.g. the depth_by_link_type table, or the content-addressing of the pack). Code only what turns the
    red set green. The context MCP gets a READ-ONLY grant on the derived `context` schema and NO grant on
    kernel/mirrors/fitness (the wall, §2).

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce the checkout-goal
    compile and assert both the INCLUSIONS (checkout layers/mirrors + crossed PaymentGateway@hash) and the
    EXCLUSIONS (billing:invoice-internals, billing-internal@hash, billing.dunning.fixture, stale
    old-promo-rule, out-of-scope refund-window), state the cause, propose. Check completeness: the context
    layer has its living mirror and each required test_kind is present (KRD §33); no monster (no inclusion
    or exclusion branch without a fixture row; the router is the single point that decides what enters the
    pack) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/context-pack/ →
    /context-pack: render the compiled ContextPack for a selected goal + branch — an Included panel
    (affected layers, active kernel mirrors/invariants, crossed contracts, scoped memory lessons + recent
    incidents, glossary terms, skills, tools, stop_condition, pack hash); an Excluded panel where each
    excluded item is tagged with WHY (cross-BC, stale, out-of-scope, cosmetic-below-threshold); a
    Boundaries strip showing allowed_paths and the forbidden /kernel/** /mirror/** (the wall). Read via the
    context MCP read-only tool; render the pack, do NOT re-implement the router. Do NOT touch existing
    routes. Add tests/e2e/context-pack.spec.ts (use the playwright-e2e skill) asserting the checkout
    inclusions, the billing:invoice-internals tagged cross-BC and old-promo-rule tagged stale (the done
    criterion rendered), the memory showing idempotency-for-payment + out-of-stock-incident but NOT
    refund-window nor the stale rule, the forbidden /kernel/** /mirror/** boundary, a non-empty
    stop_condition, and the pack hash shown.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    context is a deep, well-named module; that the router is pure and consumes S22's red-set + S17's links
    + S06's mirrors WITHOUT duplicating them; that ContextPack/ContextRouter sit cleanly in
    back/runtime/context (Runtime is the context compiler's home per CONTEXT-MAP); that the context MCP
    owns exactly one concern (compile + replay + read-only query) and holds no truth-write grant; that the
    wall stays intact (the router reads the graph, the pack always forbids /kernel/** /mirror/**);
    boundaries match back/runtime/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic — the router +
    ContextPack), the context MCP server (capability — compile/replay/read-only-query), the /context skill
    (repeatable gesture, KRD §149), the compile fixture + property (behaviour proof), and the Next route
    (visualization). Do NOT add an Atlas migration (the derived `context` schema / ContextGraph derivation
    is a separate persistence step; READ or mock the graph here), do NOT add a Hook (the router is a
    compiler, not a non-bypassable rule; the wall is already S04's hook + GRANTs), do NOT build the
    ContextGraphDecision / Decision-Reuse Test (KRD §119.2 — the reuse control plane is a later step), do
    NOT build the memory firewall / embeddings scoring (Archive /brain step; memory arrives pre-scored
    here), and no codegen (a pack is a compiled artifact, nothing to emit). A new artifact may ADD a
    guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If the ContextPack field set, the
  depth_by_link_type policy, the memory confidence threshold (>=repeated), the exclusion reasons
  (stale / out_of_scope / unapproved / cosmetic-below-threshold), or the ContextGraph node/edge shape is
  not pinned by KRD §142/§143/§144/§119.3/§145 / an existing schema / ADR / CONTEXT.md, do NOT guess —
  record an OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a checkout or
  billing business rule beyond what the fixture states, do NOT give the router write access to any truth
  schema, and do NOT recompute the red-set (reuse S22).
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The compile
  fixture is a means-test toward the human red (minimal-context-from-the-red-set), not a new truth; the
  red mirrors in the pack are the HUMAN's existing goals, not ones you author.
- Any change to a prior contract (S22 red-set, S17 links, S06 Mirror, the wall GRANTs §2/S04, the
  ContextGraph/`context` schema shape, the ContextMap/BC contracts, the MemoryRecord scoring) goes through
  a ChangeSet + SemanticDiff (S20/S21). Add new files; never silently rewrite a prior artifact, never
  hand-edit back/gen/**.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the compile fixture passes — compiling the checkout-apply-promo goal
on main yields a ContextPack whose affected_layers are exactly the three red layers, whose active_kernel
carries the red checkout mirrors + canPlaceOrder.property + the crossed PaymentGateway@hash contract,
whose boundaries forbid /kernel/** /mirror/**, with a non-empty stop_condition and a non-null content
hash, AND which provably EXCLUDES billing:invoice-internals, billing-internal@hash, billing.dunning.fixture
(cross-BC), old-promo-rule (stale), and refund-window (out-of-scope) — THE done criterion: a checkout goal
does not receive billing internals and stale memory is excluded; the rapid invariant holds (minimality,
staleness/scope exclusion, wall-as-boundary on every pack, determinism + content-addressing,
branch-no-leak, stop_condition present); /context-pack renders the included/excluded panels with explicit
exclusion reasons and a passing Playwright e2e; the context MCP proves read-only over the derived schema
with no truth-write grant. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (ContextRouter compile fixture, rapid minimality/exclusion property), where
  stored (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /context-pack — what it renders (Included panel, Excluded panel with cross-BC/stale/
  out-of-scope/cosmetic reasons, Boundaries strip with the forbidden /kernel /mirror, pack hash), e2e file
  + result.
- ChangeSet status: any prior-contract change (S22 red-set, S17 links, S06 Mirror, wall GRANTs, the
  context/ContextGraph schema, BC contracts, MemoryRecord scoring) → ChangeSet + SemanticDiff (note the
  change_type), else "none". The router reads truth schemas, never writes them.
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. ContextGraph view is read/mocked (the derived `context` schema derivation not wired
  here), no ContextGraphDecision / Decision-Reuse Test (§119.2) yet, memory arrives pre-scored (no
  firewall/embeddings scoring), the depth_by_link_type policy and token-cap strategy in force, which
  exclusion reasons are supported.
- Next safe step: the smallest stable next tooth (e.g. deriving the `context` ContextGraph schema from
  imports/manifests/tests/versions so the router compiles over real data, or the ContextGraphDecision /
  Decision-Reuse control plane of §119.2) and why it is safe to chain.
```
