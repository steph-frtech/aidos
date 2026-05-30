# S44 — KRDWorkbench full graph: navigate button→view→action→operation→entity→mirrors→scopes→incidents, color legend, /brain cockpit

Subsystem: AIDOS Workbench | Home: `front/web/app` | Workbench route: `/`

## Objectif

Land the **full Workbench graph**: the cockpit root `/` becomes a single navigable **truth graph** where one click walks the kernel's own edges — **button → view → action → operation → entity → mirrors → scopes → incidents** — each node deep-linking into the per-step panel that already renders it (`/control`, `/web-preview`, `/operation`, `/entity`, `/mirror`, `/scope`, the incident/red-wave view), under a **declared color legend** (truth-type / liveness / red-wave state), with a dedicated **`/brain` cockpit** over the memory + context-graph projections. It is a **pure read-only projection** of Postgres truth — it authors nothing — proven green by **stable UI snapshots** (deterministic deep-navigation, frozen visuals) and a `/handoff` gesture to compact the cockpit state for the next agent.

## Sortie attendue

Per CLAUDE.md §5 this step needs a **visualization** (Next routes — the cockpit graph at `/`, the `/brain` cockpit, and the deep-nav glue), a **repeatable gesture** (the `/handoff` Skill), and a **behaviour proof** (the BDD mirror — a fixture over the graph-projection builder + a playwright-bdd e2e with UI snapshots). It deliberately adds **no** new truth tables, **no** new MCP, **no** new hook (justified below). The only new **Go** is a thin read-only **graph-projection builder** (no new truth, SELECT-only).

- **Go package** `back/runtime/reality/workbenchgraph/` (a thin **read-only projection builder**, not a fork of any prior reader) — assembles the **WorkbenchGraph**: it `SELECT`-only-reads the already-versioned nodes & edges from the `kernel` / `mirrors` / `context` / `provenance` schemas (controls/views S11, actions S11, operations S10, entities S35, mirror records S06, scopes S15, incidents/red-wave S22) and projects them into a deterministic `{ nodes[], edges[], legend[] }` shape (each node carries `id`, `kind`, `route` deep-link, `truth_type`, `liveness`, `red_wave_state`; each edge carries `from`, `to`, `relation`, all sourced from the **existing link/propagation truth** of S17/S19 — **never invented adjacency**). **Determinism is the contract**: same kernel head ⇒ byte-identical graph JSON (stable node/edge ordering by content id, no clock, no RNG). It **reuses** S02 `Canonicalize`/`Hash` for a `graph_hash` (so snapshot drift is computed, not hunted) and S13 `BlockReason` on any unresolved ref — it **never** synthesizes a node/edge the truth does not pin.

- **Next routes** (the cockpit) under `front/web/app` — **new routes only**, no prior route touched:
  - `front/web/app/page.tsx` → `/` — the **full graph cockpit**: renders the WorkbenchGraph as a navigable map (button → view → action → operation → entity → mirrors → scopes → incidents), with the **declared color legend** panel (truth-type / liveness / red-wave). Clicking any node **deep-navigates** to its per-step panel via the node's `route` (`/control`, `/web-preview`, `/operation`, `/entity`, `/mirror`, `/scope`, the incident view) — it links, it never re-renders those panels' internals. Read-only.
  - `front/web/app/brain/page.tsx` → `/brain` — the **brain cockpit**: a read-only projection over the `brain` (MemoryItem, episodic/semantic/procedural, S30/S31) + `context` (ContextGraph + ContextGraphDecision, S32/S33) schemas — memory items, embeddings/neighborhoods (pgvector, read-only), and reuse-allowed/-denied decisions. It renders the firewall's verdicts (S30), it never writes memory.
  - **Deep-nav glue** (`front/web/app/_graph/` — shared client helpers for node→route navigation + the legend + the snapshot-stable layout). New files only; do **not** touch `layout.tsx`, `globals.css`, or any prior route.

- **Skill** `.claude/skills/handoff/` (`SKILL.md`, CLAUDE.md §5: repeatable gesture → Skill) — `/handoff`: the replayable gesture "compact the current cockpit/graph state into a handoff document the next agent can resume from". It encodes the procedure (snapshot the current `graph_hash` + the open node + the red-wave state + open OpenQuestions → emit a compact, deterministic handoff artifact under `docs/` → never mutate truth), and the **honesty rules** (never invent a node, an edge/relation, a `targetId`, a scope, an incident, or a business rule the kernel does not pin — an unpinned edge becomes an **OpenQuestion** in `provenance`, never a guessed adjacency).

- **BDD mirror** — two artifacts by nature, conceptually stored in the `mirrors` schema (`reflects`, `test_kind`, `cert_language`, `liveness`, `authority`) and materialized to `tests/` for the runner:
  - a **fixture** mirror (`state → command → events`, interpreted in Go) over the `workbenchgraph` builder: a kernel head (controls/actions/operations/entities/mirrors/scopes/incidents) → `BuildGraph(head)` → a `WorkbenchGraph` whose nodes/edges/legend exactly mirror the prior link/propagation truth, with a deterministic `graph_hash`. **Testcontainers (Go)** with real Postgres applies the prior migrations so the read round-trip is verified, not mocked.
  - a **playwright-bdd** journey/acceptance mirror (front N0 slot — `Playwright + playwright-bdd`, frozen, mandatory): the **deep-navigation path** (button → view → action → operation → entity → mirrors → scopes → incidents) replayed against the rendered `/` graph, asserting each click deep-links to the right panel and the **legend** colors match truth-type/liveness/red-wave; plus **stable UI snapshots** (the rendered graph + legend + `/brain` cockpit are visually frozen — re-render is pixel/DOM-stable). This e2e + the snapshots green **is** the done criterion.

> Explicitly **out of scope** (would be monsters / out of slot here): **no new truth tables / no node, edge, scope, or incident authoring** — every node & edge is **prior truth** (S10/S11/S15/S17/S19/S22/S35, read-only); this step **reads** and projects it. **No MCP server** — `BuildGraph` is a pure read-only library and `/handoff` is a harness gesture; no distinct callable backend op emerges (if a `workbench_graph_read` op truly emerges, record an OpenQuestion). **No hook** — read-only projection introduces no non-bypassable rule; the wall hook (S04) already refuses agent writes above the line; §5 hook-honesty forbids a hook that never fired. **No re-render of prior panels** — `/` deep-links into `/control`, `/operation`, `/entity`, `/mirror`, `/scope`, etc.; it never re-implements them. **No new graph framework** beyond what the snapshot-stable layout needs — simplest within the front slot.

## Test minimal (done)

**Done = deep navigation works (button → view → action → operation → entity → mirrors → scopes → incidents, each click deep-links to its panel; legend colors match truth) ∧ UI snapshots stable (graph + legend + /brain are visually frozen).** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. Done is **computed** (red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster), never declared.

- **Journey / acceptance (N0) — Gherkin, run by `Playwright + playwright-bdd`** (front frozen slot). This is THE done criterion:

  ```gherkin
  # mirrors schema · reflects: front./.workbench-graph · test_kind: gherkin · cert_language: playwright-bdd · authority: above · liveness: live
  Feature: the full Workbench graph navigates truth and stays visually stable
    # every node & edge is a PROJECTION of prior kernel truth (S10/S11/S15/S17/S19/S22/S35); the cockpit authors nothing

    Scenario: deep-navigation walks the kernel's own edges
      Given the cockpit "/" renders the WorkbenchGraph for the current kernel head
      When I click the button node "saveOrder"
      Then I deep-link to "/web-preview" for that control          # the node's route, from truth
      When I navigate the edge "triggers" to its action
      And I navigate the edge "invoke" to its operation            # operation node (S10)
      And I navigate the edge "reads/writes" to its entity         # entity node (S35)
      And I navigate from the entity to its mirrors                # mirror records (S06)
      And I navigate from the mirror to its scopes                 # scope nodes (S15)
      And I navigate from a scope to its incidents                 # red-wave / incidents (S22)
      Then each click deep-links to that node's per-step panel      # button→view→action→operation→entity→mirrors→scopes→incidents

    Scenario: the color legend reflects truth-type, liveness and red-wave — not a UI guess
      Given the cockpit "/" renders the WorkbenchGraph
      Then the legend lists each truth-type / liveness / red-wave color it uses
      And a node above the line is colored as "above"             # matches its truth_type (S14)
      And a stale/red-wave node is colored as "red"               # matches red_wave_state (S22)

    Scenario: the graph is visually stable
      Given the cockpit "/" renders the WorkbenchGraph for an unchanged kernel head
      When I re-render the cockpit
      Then the UI snapshot is unchanged                            # deterministic; graph_hash unchanged
      And the "/brain" cockpit snapshot is unchanged
  ```

- **Fixture (N2) — `state → command → events`, interpreted in Go** (the builder side), stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: runtime.reality.workbenchgraph.BuildGraph · test_kind: fixture · cert_language: operation-dsl/go · authority: below
  fixture "building the workbench graph projects prior truth into deterministic nodes/edges/legend"
    state (kernel head): { controls, actions, operations, entities, mirrors, scopes, incidents } read from kernel/mirrors/context (S10/S11/S15/S17/S19/S22/S35)
    command (build):     BuildGraph(head)
    events:  [ GraphBuilt ]
    -> nodes cover button, view, action, operation, entity, mirror, scope, incident — each with id, kind, route, truth_type, liveness, red_wave_state
    -> every edge {from,to,relation} resolves to a PRIOR link/propagation row (S17/S19) — no invented adjacency
    -> legend enumerates exactly the truth_type / liveness / red_wave colors actually used
    -> graph.graph_hash == Hash(Canonicalize(nodes ⊕ edges ⊕ legend))     # content-addressed, S02 reused
    -> BuildGraph(head) == BuildGraph(head) byte-for-byte                  # determinism (snapshot stability)
    -> a node/edge the kernel does NOT pin is never invented (→ OpenQuestion)   # honesty
    -> an unresolved ref ⇒ a BlockReason (S13), never a panic, never a guessed node
  ```

- **Property (rapid, ∀, below the line)** — `BuildGraph(head) == BuildGraph(head)` (determinism / snapshot stability); `graph_hash == Hash(Canonicalize(nodes ⊕ edges ⊕ legend))`; every edge's `from`/`to` resolve to existing nodes (no dangling edge); every node's `route` is a known Workbench route; every legend color is actually used and every used color is in the legend (no orphan/missing legend entry); an unresolved/ dangling ref ⇒ a `BlockReason` (S13), never a panic; a node/edge the truth does not pin ⇒ an OpenQuestion, never a guessed adjacency.

Watch them go **red** first (no `workbenchgraph` builder, no graph cockpit at `/`, no `/brain` cockpit, no deep-nav glue, no playwright-bdd feature, no snapshots). That red **is** the `/goal` for this step.

## Visualisation UI

- **Routes:** `front/web/app/page.tsx` → `/` (the full graph cockpit) and `front/web/app/brain/page.tsx` → `/brain` (the brain cockpit), with shared deep-nav/legend/layout helpers under `front/web/app/_graph/`. **New routes/files only** — do **not** touch `layout.tsx`, `globals.css`, `favicon.ico`, or any prior `/control`, `/web-preview`, `/operation`, `/entity`, `/mirror`, `/scope`, incident route. `/` renders the WorkbenchGraph (nodes deep-linking to their per-step panels), the declared color legend (truth-type / liveness / red-wave), and is read-only; `/brain` renders the memory + context-graph projection (MemoryItems, embedding neighborhoods, reuse decisions, firewall verdicts), read-only.
- **Playwright e2e:** `tests/e2e/workbench-graph.spec.ts` (one spec per critical flow, per CLAUDE.md §4 + the `playwright-e2e` skill), driven by the **playwright-bdd** `.feature`. It loads `/` via the configured `webServer` (`npm run dev -w @aidos/web`, baseURL `http://localhost:3000`), walks the **deep-navigation path** (button → view → action → operation → entity → mirrors → scopes → incidents) asserting each click deep-links correctly, asserts the **legend** colors match truth-type/liveness/red-wave, and captures **stable UI snapshots** of the graph, legend, and `/brain` cockpit (re-render = unchanged snapshot). Green e2e + stable snapshots = done.

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: the new builder package `back/runtime/reality/workbenchgraph/`, the new `/` graph cockpit + `/brain` cockpit + `_graph/` glue under `front/web/app`, the new `tests/e2e/workbench-graph.spec.ts`, the new `/handoff` Skill, and the new BDD mirror records. It **consumes, never re-implements**: S02 (`Canonicalize`/`Hash`), S06 (mirror schema/liveness), S10 (operations), S11 (controls/views/actions + `EvalState`/`Plan`), S14 (truth-typing → node colors), S15 (scopes), S17 (links → edges), S19 (weighted propagation → edges), S22 (red wave / incidents → `red_wave_state`), S30/S31 (brain/memory), S32/S33 (context graph + decisions), S35 (entities), S13 (`BlockReason`). It **reads** prior truth SELECT-only and projects it — it does **not** alter any prior schema, GRANT, route, or mirror. Any change to a **prior contract** (a node/edge shape, a per-step panel's route, the legend's declared colors, an existing mirror) is forbidden in passing: it goes through a **ChangeSet** (S20) + a **SemanticDiff** (S21) + an ADR, never a silent edit. No prior route, generated file, mirror, or truth is overwritten, replaced, or deleted (CLAUDE.md §9).

## Prompt a lancer

```text
You are step-executor for AIDOS step S44 — "KRDWorkbench full graph: a navigable truth-graph cockpit at / that
walks button → view → action → operation → entity → mirrors → scopes → incidents with a declared color legend,
plus a /brain cockpit, proven by deep-navigation + stable UI snapshots". Stack is FROZEN: back=Go, truth=Postgres
(append-only, content-addressed; the agent has NO write grant to kernel/mirrors/fitness — it READS all nodes &
edges from prior truth and authors NOTHING), front=Next.js (the Workbench). Home = front/web/app for the routes,
with a thin READ-ONLY graph-projection builder in back/runtime/reality/workbenchgraph (SELECT-only, NOT a fork of
any prior reader), plus the new /handoff skill under .claude/skills/handoff and the e2e under tests/e2e. Follow
the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: CLAUDE.md §3 (frozen-stack rows — "Journey/acceptance (N0) front = Playwright +
playwright-bdd, MANDATORY, never substitute") and §2 (the wall — you only SELECT on kernel/mirrors/context, you
write nothing above the line). Read CONTEXT-MAP.md (distinguish the WORKBENCH — front/web, the OS's own cockpit —
from an EMITTED projection; "Kernel → projections: constrains, never generates"). Read front/web/CONTEXT.md and
back/runtime/CONTEXT.md (the "projection", "sensor", "vague de rouge / red wave" terms — a node's red_wave_state
is COMPUTED from S22, never hand-set). Read the prior steps' specs you DEPEND ON and CONSUME, never re-implement:
S02 (Canonicalize / Hash — graph_hash = hash, snapshot drift computed), S06 (mirror schema/liveness — mirror
nodes), S10 (operations), S11 (controls/views/actions, EvalState/Plan), S14 (truth-typing → node color), S15
(scopes), S17 (links → edges), S19 (weighted propagation → edges), S22 (red wave / incidents → red_wave_state),
S30/S31 (brain/memory, pgvector — the /brain cockpit), S32/S33 (context graph + decisions), S35 (entities), S13
(BlockReason). For any Next.js 16, playwright-bdd, Atlas, sqlc, or Go doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: the WORKBENCH GRAPH is a deterministic, READ-ONLY PROJECTION of the kernel's own nodes & edges —
    button → view → action → operation → entity → mirrors → scopes → incidents — where each EDGE is PRIOR truth
    (links S17 / weighted propagation S19), each NODE's color is its truth_type (S14) / liveness (S06) /
    red_wave_state (S22), and each click DEEP-LINKS to that node's already-built per-step panel (/control,
    /web-preview, /operation, /entity, /mirror, /scope, the incident view) — the cockpit LINKS, it never
    re-renders those panels' internals and never authors a node/edge/scope/incident. DETERMINISM is the contract:
    same kernel head ⇒ byte-identical graph JSON and PIXEL/DOM-STABLE snapshots (no clock, no RNG, stable
    node/edge ordering by content id). graph_hash = Hash(Canonicalize(nodes ⊕ edges ⊕ legend)) — REUSE S02's
    Hash, do NOT fork it — so snapshot drift is COMPUTED, never hunted. The /brain cockpit is a READ-ONLY
    projection over brain (MemoryItem, pgvector, S30/S31) + context (ContextGraph + ContextGraphDecision,
    S32/S33) — it renders the memory-firewall's verdicts, it NEVER writes memory. Distinguish the WORKBENCH
    (the OS's own cockpit) from an EMITTED projection (a user's app code). This step delivers the graph cockpit +
    /brain cockpit + deep-nav + the read-only builder + the e2e/snapshots + the /handoff skill, NOT any node/edge
    truth (prior, read-only), NOT a re-render of prior panels, NOT the red-wave cascade (S22, read not redefined),
    NOT memory writes. Sharpen each term against front/web/CONTEXT.md + back/runtime/CONTEXT.md + CONTEXT-MAP.md;
    if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. THREE artifacts, by nature:
      - GHERKIN journey/acceptance (front N0 frozen slot: Playwright + playwright-bdd, MANDATORY), run on the
        rendered cockpit at /. THE done criterion: (1) DEEP-NAVIGATION — clicking the button node deep-links to
        /web-preview, then walking the edges (triggers → action, invoke → operation, reads/writes → entity,
        entity → mirrors, mirror → scopes, scope → incidents) deep-links each to its per-step panel; (2) the
        LEGEND colors match truth_type (S14) / liveness (S06) / red_wave_state (S22), and the legend enumerates
        exactly the colors used; (3) STABLE UI SNAPSHOTS — re-rendering / for an unchanged head leaves the graph,
        legend, and /brain snapshots unchanged. This is the e2e that must go green.
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go) over the workbenchgraph builder:
        state = a kernel head (controls/actions/operations/entities/mirrors/scopes/incidents read from
        kernel/mirrors/context) ; command = BuildGraph(head) ; events = a WorkbenchGraph { nodes[] (id, kind,
        route, truth_type, liveness, red_wave_state), edges[] (from, to, relation), legend[], graph_hash }.
        Cover: every node kind present (button/view/action/operation/entity/mirror/scope/incident) ; every edge
        resolves to a PRIOR link/propagation row (S17/S19) — no invented adjacency ; legend == colors actually
        used ; graph_hash == Hash(Canonicalize(nodes ⊕ edges ⊕ legend)) ; same head ⇒ byte-identical graph
        (snapshot stability) ; a node/edge the kernel does NOT pin is never invented (→ OpenQuestion) ; an
        unresolved/dangling ref ⇒ a BlockReason (S13), never a panic, never a guessed node.
      - PROPERTY (rapid, ∀, below the line): BuildGraph(head) == BuildGraph(head) (determinism) ; graph_hash ==
        Hash(Canonicalize(nodes ⊕ edges ⊕ legend)) ; every edge.from/edge.to resolves to an existing node (no
        dangling edge) ; every node.route is a known Workbench route ; every legend color is used and every used
        color is in the legend ; a dangling/unresolved ref ⇒ a BlockReason, never a panic.
    Use Testcontainers (real Postgres + the prior Atlas migrations) for the read round-trip. Run them; watch them
    go RED (no workbenchgraph builder, no / graph cockpit, no /brain cockpit, no deep-nav glue, no playwright-bdd
    feature, no snapshots). That red IS the /goal for this step. Do NOT write a truth-test you would then satisfy
    (no new invariant authored here) — you write means-tests toward the human red.

(c) TDD red → green → refactor, in back/runtime/reality/workbenchgraph + front/web/app (the / cockpit, /brain,
    _graph/ glue) ONLY (plus the new /handoff skill and tests/e2e). Run /tdd. Outside-in: make the playwright-bdd
    e2e + snapshots and the fixture/property mirrors pass with the SIMPLEST builder that SELECT-reads prior truth
    and the SIMPLEST snapshot-stable graph rendering. Tool search ONLY now, ONLY if a real choice is genuinely
    undecided, WITHIN the frozen slot: compare ≤3 options (e.g. the graph-rendering/layout approach that is
    deterministic & snapshot-stable; the playwright-bdd ↔ step-def glue; the snapshot mechanism) and pick the
    SIMPLEST current (May 2026) option; playwright-bdd is MANDATORY for the front N0 slot and sqlc/pgx are
    MANDATORY for the reads — never substitute them. Record an ADR (docs/adr/000X) ONLY if a real choice is made.
    Reuse S02's Canonicalize/Hash, S14's truth-typing, S17/S19's links/propagation, S22's red-wave state, S06's
    mirror liveness, S13's BlockReason — do NOT re-implement them. Stay in this step's home; mock nothing that
    exists (the kernel reads hit real Postgres via Testcontainers).

(d) KEEP SENSORS GREEN at every diff (PostToolUse hook): self-certify on the computational only; gofmt/Biome/
    ESLint clean; the wall hook (S04) must stay satisfied (you only SELECT on kernel/mirrors/context and write
    nothing above the line); determinism holds (re-build byte-identical, snapshots unchanged); no prior green
    regresses; no monster (every projected node/edge has its living truth; the graph mirror is live).

(e) DIAGNOSE before finishing (run /diagnose): isolate any failing sensor/e2e (flaky selector? non-deterministic
    graph order? unstable snapshot? a node color that diverges from truth_type/red_wave_state? a deep-link to the
    wrong panel?), reproduce, fix, regression-test. You do NOT finish a code step without it.

(f) ADD THE WORKBENCH ROUTES + PLAYWRIGHT E2E (a UI is REQUIRED at every step): front/web/app/page.tsx → / (the
    full graph cockpit) and front/web/app/brain/page.tsx → /brain, with shared deep-nav/legend/layout helpers
    under front/web/app/_graph/ (NEW routes/files; do NOT touch layout.tsx/globals.css or any prior route). The /
    cockpit renders the WorkbenchGraph (nodes deep-linking to their per-step panels) + the declared color legend;
    /brain renders the memory + context-graph projection. Write tests/e2e/workbench-graph.spec.ts driven by the
    playwright-bdd .feature, per the playwright-e2e skill; it runs via the configured webServer
    (npm run dev -w @aidos/web, baseURL http://localhost:3000), walks the deep-navigation path, asserts the
    legend, and captures STABLE UI snapshots of the graph, legend, and /brain. Green e2e + stable snapshots = done.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step (run /improve-codebase-architecture): de-duplicate the
    graph builder against the prior readers (S17/S19/S22/S35), keep workbenchgraph a thin read-only projection,
    keep the cockpit linking (not re-rendering) the per-step panels, confirm the domain language matches
    front/web/CONTEXT.md + back/runtime/CONTEXT.md + CONTEXT-MAP.md. You do NOT move on without it.

(h) CREATE the artifacts per CLAUDE.md §5 — and ONLY these: the thin read-only Go builder (pure logic, SELECT-
    only), the / graph cockpit + /brain cockpit + _graph glue (Next routes), the /handoff Skill (repeatable
    gesture), the BDD mirror records, the e2e. NO new truth table (every node/edge is prior truth; read-only).
    NO MCP server (BuildGraph is a pure read-only library; /handoff is a harness gesture — if a callable
    workbench_graph_read op truly emerges, record an OpenQuestion, do not build it). NO hook (read-only
    projection adds no non-bypassable rule; the wall hook S04 already guards above-the-line writes; §5
    hook-honesty forbids a hook that never fired). NO memory writes, NO re-render of prior panels, NO new
    node/edge/scope/incident truth.

HONESTY RULES (non-negotiable): never invent a node, an edge/relation, a targetId, a scope, an incident, an
operation/entity ref, a legend color, or any business rule the kernel/mirrors/context truth does not pin — an
unpinned node/edge becomes an OpenQuestion in provenance, never a guessed adjacency or a guessed color. Never
author a new truth/invariant here (every node & edge is prior truth — S10/S11/S15/S17/S19/S22/S35). A node's
red_wave_state / liveness / truth_type is COMPUTED from S22/S06/S14, never hand-set. Any change to a prior
contract (a node/edge shape, a per-step panel's route, the legend's declared colors, an existing mirror) goes
through a ChangeSet (S20) + SemanticDiff (S21) + ADR — never a silent edit. Edit only this step's declared files;
otherwise add new files. "Done" is COMPUTED, never declared: red set green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster.

DONE CRITERIA: deep navigation works (button → view → action → operation → entity → mirrors → scopes →
incidents — each click deep-links to its per-step panel; legend colors match truth_type/liveness/red_wave_state);
UI snapshots are STABLE (graph + legend + /brain visually frozen; re-build byte-identical, graph_hash unchanged);
the workbenchgraph builder is read-only & deterministic; an unresolved/dangling/malformed ref ⇒ a BlockReason,
never a panic or an invented node; no prior green regressed; no monster.

END WITH THE STEP REPORT: (1) BDD added — the gherkin/playwright-bdd feature + the fixture + the rapid property,
with their mirrors-schema fields (reflects, test_kind, cert_language, authority, liveness); (2) Tests run — Go
fixture/property + Testcontainers read round-trip + the playwright-bdd e2e + the UI snapshots, with pass/fail and
mutation score vs threshold; (3) UI route — / (graph cockpit) + /brain + tests/e2e/workbench-graph.spec.ts;
(4) ChangeSet status — none if no prior contract touched, else the ChangeSet + SemanticDiff + ADR ids; (5)
Red-set status — which red scenarios are now green and any still red; (6) Known limits / OpenQuestions raised
(e.g. unpinned edges/adjacency, a candidate workbench_graph_read op, snapshot flakiness); (7) Next safe step the
stable phase enables.
```
