# S22 — Impact / red wave (PostKernelChange) + RedWorkQueue + `aidos impact`

Subsystem: AIDOS Runtime | Home: `back/runtime/redwave` | Workbench route: `/red-wave`

## Objectif

After a kernel hash bump, **compute the red wave** — the set of stale links and failing mirrors — starting at the mirror and cascading through the layers to the projections (api, db, types, operation, action, button), drain it into a **`RedWorkQueue`**, and expose it both as the `PostKernelChange` hook (`rehash && fire-red-wave --from-mirror`) and as the `aidos impact` CLI. The worklist is **computed, never hunted**: changing an entity reddens api/db/types; changing a button reddens its view **iff** the button is load-bearing.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (a Go package), a **non-bypassable rule** (a Go hook), **persistence** (an Atlas migration), a **behaviour proof** (fixture + property mirror), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/runtime/redwave/` — the red-wave engine. A pure `Impact(bumped, links, heads, layers) → RedWave` that, given the bumped kernel ref(s) and the versioned link graph from S17, computes the **transitive closure of stale links** by walking the six link kinds (`projects_to`, `derives_from`, `contracts_with`, `triggers`, `binds`, `mirrors`) **outward from the mirror**: a bump reddens its `mirrors` reflection first, then every projection that `derives_from` / `projects_to` the changed source. The closure is **ordered** — mirror(s) first, projections after (KRD §42, §98). The **load-bearing rule** is explicit: a `binds`/`triggers` edge from a button propagates red to its view **iff** the view's render actually depends on the button (the link is load-bearing); a cosmetic-only button change does **not** redden the view. `Impact` is pure — no I/O, no clock, no RNG — so the wave is deterministic and replayable; it **reuses S17's `Resolve`** to decide each edge's staleness (never re-implements it). A `RedWave` value = the ordered set of `RedWorkItem`s (`target = mirror_id | projection_id`, `reason ∈ {version_stale, failed_test, incident}`, `dependencies[]`). A separate `Enqueue(wave) → []RedWorkItem` materializes the wave into queue rows with `status = open`, `owner_agent`/`lease_until` empty (the scheduler — claiming, leasing — is a later step, referenced not built).

- **Go hook binary** `back/hooks/postkernelchange/` — the `PostKernelChange` hook (CLAUDE.md §5: non-bypassable rule → Hook). On a kernel hash change it runs `rehash && fire-red-wave --from-mirror` (KRD §74, §98): re-derives the head hash, calls `redwave.Impact` from the mirror, and `Enqueue`s the resulting items into `red_work_queue`. It is **harness-invoked**, not a callable op. Ships with its **fault-injection test** (CLAUDE.md §5 hook-honesty): bump a kernel entity, assert the wave fires and reddens api/db/types; a hook that never fires is dead.

- **Postgres migration (Atlas)** `back/migrations/` — the **`red_work_queue`** table: append-only, one row per `RedWorkItem` (`item_id`, `wave_id` = the bump's content hash, `target` (`mirror_id`/projection ref), `reason`, `status open|claimed|blocked|resolved`, `owner_agent NULL`, `lease_until NULL`, `dependencies jsonb`, `created_at`). This is a **Runtime worklist below the waterline** — *not* kernel/mirrors/fitness — so the agent role MAY hold write here; **confirm the grant boundary against S04 before assuming it** (OpenQuestion otherwise). Expand-only / append-only; never alters or drops a prior table or GRANT.

- **BDD mirror** — a **fixture** (`state → command → events`: link graph + heads + a bump → `Impact` → ordered red set) plus a **`rapid` property** for the ∀ invariants, conceptually stored in the `mirrors` schema, materialized to `tests/`. These ARE the done criteria (below).

- **Next route** `front/web/app/red-wave/` → `/red-wave` — the Workbench panel rendering the current `red_work_queue`: the wave's items ordered mirror-first, each coloured red, grouped by layer (mirror → api/db/types → operation/action → button), with the bump that opened it (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no `aidos impact` MCP server** beyond the CLI subcommand — `aidos impact` is a CLI command (S03's `aidos` binary) that calls `redwave.Impact`; exposing red-wave-as-a-callable-tool is a later `evolve`/`impact` MCP, recorded as an **OpenQuestion**, not invented now. **No scheduler** — claiming, leasing, dependency-ordered dispatch, multi-agent collision avoidance (KRD §49.4 "la RedWorkQueue coordonne l'exécution") is a later step; S22 only **computes and enqueues** (status `open`). **No regeneration** — actually turning projections green is the inner PostToolUse loop (KRD §98 step 3), not this step. **No stable-phase gate** (§43, "all links resolve + all sensors green") — a later tooth. **No Skill** — no new replayable human gesture beyond the existing `/goal`. **No new link semantics** beyond S17's; per-kind meaning is owned by S06/S11 and only **referenced**. **No codegen / emitters.**

## Test minimal (done)

**Done = an entity change impacts api/db/types; a button change impacts the view iff load-bearing.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: runtime.redwave.Impact · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "an entity bump reddens its mirror first, then api/db/types"          # THE done criterion (part 1)
    state   (links+heads): Order@v2 -mirrors-> Order.schema.fixture ; api,db,types -derives_from-> Order@v1
    command (bump):        Order v1 → v2
    events: [ wave starts at Order.schema.fixture (mirror) ; then {api, db, types} are red ;
              order is mirror-first ; each item reason == version_stale ]

  fixture "a load-bearing button change reddens its view"                       # THE done criterion (part 2)
    state   (links+heads): submit-btn@v2 -binds-> createOrder ; checkout-view -derives_from-> submit-btn (load-bearing)
    command (bump):        submit-btn v1 → v2
    events: [ checkout-view is red ]                  # the view's render depends on the button

  fixture "a cosmetic button change does NOT redden the view"                   # THE done criterion (negative)
    state   (links+heads): label-btn@v2 ; checkout-view does NOT depend on label-btn (not load-bearing)
    command (bump):        label-btn v1 → v2
    events: [ checkout-view is NOT in the red set ]   # not load-bearing ⇒ no propagation

  fixture "the wave is enqueued as open RedWorkItems"
    command (bump):        Order v1 → v2
    events: [ red_work_queue has one row per red item ; status == open ; owner_agent == null ;
              wave_id == the bump hash ; targets include the mirror_id first ]

  fixture "no bump ⇒ empty wave"
    command (bump):        none
    events: [ wave is empty ; red_work_queue unchanged ]
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: redwave.Impact/Enqueue · test_kind: property · cert_language: rapid · authority: below
  ∀ bump,graph:  Impact is deterministic — same (bump, links, heads, layers) ⇒ byte-identical ordered RedWave
  ∀ bump,graph:  every item in the wave corresponds to a link S17.Resolve reports stale/absent — no item without a stale link, no stale link without an item (the wave IS exactly the set of stale links, §42)
  ∀ bump,graph:  the mirror(s) of the bumped source appear BEFORE any projection in the order (mirror-first, §42/§98)
  ∀ bump,graph:  a non-load-bearing edge never propagates red (a cosmetic change has empty downstream beyond itself)
  ∀ bump:        Enqueue writes exactly |wave| rows, all status==open, all wave_id==bump hash; Impact never panics on a malformed/absent target (yields a status, not a crash)
  ```

Both start **red** (no `redwave` package, no `Impact`/`Enqueue`, no `red_work_queue` table, no `postkernelchange` hook). That red **is** the `/goal`. The fixture is a **means-test toward the human red** (an entity change reddens api/db/types; a button reddens its view iff load-bearing) — not a new truth the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/red-wave/page.tsx` (new route `/red-wave`; do not touch existing routes). A read-only panel reading `red_work_queue` (via the appropriate role) that renders the current red wave: the **bump** that opened it (`wave_id`), then the ordered items **mirror-first**, grouped by layer (mirror → api/db/types → operation/action → button), each shown **red** with its `reason` and `status`. With the canonical example it shows an `Order` bump reddening `Order.schema.fixture` (mirror) then `api`/`db`/`types`, and a load-bearing `submit-btn` bump reddening `checkout-view` — while a cosmetic button bump shows **no** view item. The page **projects** the queue, it never re-computes the wave.
- **Playwright e2e:** `tests/e2e/red-wave.spec.ts` — navigate to `/red-wave`, assert the mirror item appears **before** the projection items, that an entity bump shows `api`, `db`, `types` as red items (done criterion part 1), and that a load-bearing button bump shows its view as red while a cosmetic one does not (done criterion part 2 + negative). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/redwave/**`, `back/hooks/postkernelchange/**`, the new `back/migrations/<new>.sql` (`red_work_queue`), the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/red-wave.spec.ts`, the new `aidos impact` subcommand wiring under `back/cmd/aidos/`, and `front/web/app/red-wave/**` — and otherwise **adds new files**. It defines one new contract (the `RedWave`/`RedWorkItem` shape, the mirror-first ordering, the load-bearing propagation rule, the `red_work_queue` table); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes, no modifying the S04 `PreToolUse` hook / S07 `PostToolUse` hook / their GRANTs. The migration is **expand-only / append-only**. Any change to a **prior contract** it depends on — S17's `Link`/`Resolve`/`id@version` pinning, the S02 record/content-hash scheme, the S03 `aidos` CLI surface, the S06/S11 per-kind semantics, the waterline / GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S22 — "Impact / red wave (PostKernelChange) + RedWorkQueue + aidos
impact". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write
grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/runtime/redwave ONLY (plus the
back/hooks/postkernelchange binary, the back/migrations red_work_queue file, the aidos impact subcommand
wiring under back/cmd/aidos, and front/web/app/red-wave). Follow the CLAUDE.md §6 per-step loop IN ORDER.
Never go prompt → code.

Read BEFORE touching anything: KRD.md §42 (la vague de rouge — the red wave IS exactly the set of stale links
after a bump; it STARTS at the mirror, then cascades to projections api/db/types/operation/action/button; the
worklist is COMPUTED, never hunted), §98 (the ChangeSet example: a bump fires PostKernelChange:
fire-red-wave --from-mirror → mirrors red first, projections after), §74 (the hooks.yaml line PostKernelChange:
rehash && fire-red-wave --from-mirror — STIGMERGIE), §49.4 (RedWorkQueue/RedWorkItem: target=mirror_id,
reason ∈ {version_stale, failed_test, incident}, status open|claimed|blocked|resolved — but the SCHEDULER is
NOT this step), §82.1 (krd impact = "calcule la vague de rouge" → the aidos impact CLI), §43 (phase stable =
all links resolve + all sensors green — a LATER tooth, referenced not built). Read CONTEXT-MAP.md +
back/runtime/CONTEXT.md (vague de rouge / red wave, stigmergie / RedWorkQueue, hook, the wall, KRDCompiler/
aidos) and the prior steps' specs: S17 (the versioned Link AST + Resolve staleness — REUSE it, the wave is its
transitive closure), S02 (record substrate / content-hash), S03 (the aidos CLI surface), S04 (the wall GRANTs /
waterline), S06/S11 (per-kind link semantics — referenced, not redefined). For any Next.js 16, Atlas, or Go API
doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: the "red wave" (vague de rouge) IS exactly the set of stale links after a bump (§42), nothing
    more, nothing less; it STARTS at the mirror and cascades to projections (mirror-first ordering is part of
    the contract); the worklist is COMPUTED, never hunted; "load-bearing" = a button→view edge propagates red
    iff the view's render actually depends on the button (a cosmetic change does NOT redden the view); a
    "RedWorkItem" targets a mirror_id/projection with reason ∈ {version_stale, failed_test, incident} and
    status open|claimed|blocked|resolved. This step COMPUTES and ENQUEUES the wave (status open); it does NOT
    schedule (claim/lease/dispatch — §49.4 later), does NOT regenerate projections (inner PostToolUse loop,
    §98 step 3), does NOT gate the stable phase (§43 later). Sharpen each term against back/runtime/CONTEXT.md;
    if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = the S17 link graph +
        heads; command = a bump (source id v_n → v_{n+1}); events = the ordered red set + the enqueued rows.
        Cover: an ENTITY bump reddens its mirror FIRST then api/db/types (done criterion part 1) ; a
        LOAD-BEARING button bump reddens its view (part 2) ; a COSMETIC (non-load-bearing) button bump does
        NOT redden the view (negative) ; the wave is enqueued as `open` RedWorkItems with wave_id == bump hash
        and mirror_id first ; no bump ⇒ empty wave, queue unchanged.
      - PROPERTY (rapid, ∀, below the line): Impact is deterministic (same inputs ⇒ byte-identical ordered
        wave) ; every wave item corresponds to a link S17.Resolve reports stale/absent and vice-versa (the
        wave IS exactly the set of stale links) ; the mirror(s) appear BEFORE any projection ; a
        non-load-bearing edge never propagates ; Enqueue writes exactly |wave| rows all status==open ; Impact
        never panics on a malformed/absent target.
    Run them; watch them go RED (no redwave package, no Impact/Enqueue, no red_work_queue table, no
    postkernelchange hook). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no
    inventing a new red-wave invariant you'd grade yourself) — mirror the human intention only; the fixture is
    a means-test toward the human red.

(c) TDD red → green → refactor in back/runtime/redwave ONLY (plus the postkernelchange hook binary, the
    back/migrations red_work_queue file, and the aidos impact subcommand wiring). Outside-in. Build: a pure
    Impact(bump, links, heads, layers) → RedWave that walks the six S17 link kinds outward FROM THE MIRROR and
    returns the ordered set of RedWorkItems — no I/O, no clock, no RNG; REUSE S17's Resolve to decide each
    edge's staleness (do NOT fork or re-implement it); make the mirror-first ordering and the load-bearing
    propagation rule explicit. Then Enqueue(wave) → rows (status open). Then the postkernelchange hook
    (rehash && fire-red-wave --from-mirror → Impact → Enqueue). Then the `aidos impact` subcommand that calls
    Impact and prints the wave (= krd impact, §82.1). Within the frozen slots, if a REAL tool choice arises,
    search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog,
    rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/hook binaries are fixed). The
    likely genuine choices: the graph-walk strategy (BFS closure over the link map vs an explicit worklist) and
    the load-bearing predicate's source (is "load-bearing" a property already on the S11 binds/triggers link,
    or a derived check?) — if the latter is NOT pinned by S11/an existing migration, record an OpenQuestion and
    STOP on that branch, do not invent it. Record a short ADR (docs/adr/) ONLY if a genuine choice is made. The
    migration is expand-only/append-only; confirm the red_work_queue write-grant boundary against S04 before
    assuming the agent role may write it (OpenQuestion otherwise). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse, the S07 hook): gofmt / go vet / strict Go, go test, the new
    fixture + rapid mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the
    COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Impact on the entity-bump,
    load-bearing-button, and cosmetic-button cases, state the cause, propose. Run the hook fault-injection:
    bump a kernel entity, assert the postkernelchange hook fires and reddens api/db/types and enqueues
    `open` rows; a hook that never fires is dead. Check completeness: red_work_queue / the wave engine has its
    living mirror (fixture + property); no monster (no truth without a mirror, no orphan mirror, no wave item
    without a stale link) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/red-wave/ → /red-wave:
    render red_work_queue (read-only) — the bump (wave_id), then the items ordered MIRROR-FIRST, grouped by
    layer (mirror → api/db/types → operation/action → button), each red with its reason + status. Show an
    Order bump reddening Order.schema.fixture (mirror) then api/db/types, and a load-bearing submit-btn bump
    reddening checkout-view, while a cosmetic button bump shows NO view item. Project the queue; do NOT
    re-compute the wave. Do NOT touch existing routes. Add tests/e2e/red-wave.spec.ts (use the playwright-e2e
    skill) asserting the mirror item appears BEFORE the projections, that an entity bump shows api/db/types red
    (done criterion part 1), and that a load-bearing button reddens its view while a cosmetic one does not
    (part 2 + negative).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that redwave
    is a deep, well-named module (Impact / Enqueue / RedWave / RedWorkItem / the load-bearing predicate
    separated), that Impact is pure and REUSES S17's Resolve/link graph without duplicating it, that the
    migration/GRANT keeps the wall intact, that the hook only invokes the engine (no logic in the binary), and
    that boundaries match back/runtime/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic), the Go hook
    (postkernelchange, a non-bypassable rule), the Atlas migration (red_work_queue persistence), the fixture +
    rapid property (behaviour proof), the Next route (visualization), and the `aidos impact` subcommand (part
    of the existing S03 CLI, not a new MCP). Do NOT add an MCP server, a scheduler, or a Skill — exposing
    red-wave-as-a-tool, claiming/leasing work items, and a replayable gesture are later steps; record them as
    OpenQuestions. A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The wave is EXACTLY the set of stale links (§42) — do
  not redden a projection that has no stale link, and do not invent a propagation path KRD does not define. If
  the load-bearing predicate's source (a property on the S11 binds/triggers link vs a derived check), the
  red_work_queue write-grant boundary, the bump-source feed (where the bumped ref comes from at runtime), or
  the RedWorkItem column set are not pinned by KRD / an existing migration / S17's Resolve / S11 / S04, do NOT
  guess — record an OpenQuestion (provenance) and STOP on that branch. The example targets (Order, createOrder,
  submit-btn, checkout-view, Order.schema.fixture) are reused from prior steps' pinned artifacts; do not coin
  new ones.
- You NEVER write a truth-test (a new red-wave invariant you would then satisfy — the circularity). The fixture
  and property are means-tests toward the human red (an entity change reddens api/db/types; a button reddens
  its view iff load-bearing), not new truths.
- Any change to a prior contract (S17 Link/Resolve/pinning, S02 record/hash, the S03 aidos CLI surface, the
  S06/S11 per-kind semantics, the waterline/GRANTs) goes through a ChangeSet + SemanticDiff. Add new files;
  never silently rewrite a prior artifact, never hand-edit back/gen/**. An override is a recorded decision
  (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the Impact fixtures pass — an entity bump reddens its mirror FIRST then
api/db/types (done part 1), a load-bearing button bump reddens its view (part 2), a cosmetic button bump does
NOT (negative); the wave is enqueued as `open` RedWorkItems with wave_id == the bump hash and the mirror_id
first; the rapid invariants hold (determinism, wave == set of stale links via S17.Resolve, mirror-first order,
no propagation on non-load-bearing edges, |wave| rows enqueued, no panic); the postkernelchange hook fires the
wave on a real bump (fault-injection); `aidos impact` prints the computed wave; /red-wave renders the
mirror-first, layer-grouped red set with a passing Playwright e2e; the red_work_queue grant matches S04; the
migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized
  (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, hook fault-injection, biome,
  eslint, playwright).
- UI route: /red-wave — what it renders (mirror-first, layer-grouped red wave from red_work_queue), e2e file +
  result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes never by the agent); any prior-contract change →
  ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no scheduler (claim/lease/dispatch), no regeneration of projections, no stable-phase
  gate, no red-wave MCP, load-bearing-predicate source / red_work_queue grant / bump-source-feed
  OpenQuestions, per-kind semantics referenced not redefined.
- Next safe step: the smallest stable next tooth (e.g. the RedWorkQueue scheduler that claims/leases items, or
  the stable-phase gate that asserts every link resolves + all sensors green) and why it is safe to chain.
```
