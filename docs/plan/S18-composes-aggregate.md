# S18 — `composes` link + recursive mirror aggregate (parent green iff own_mirror ∧ children green)

Subsystem: AIDOS Kernel | Home: `back/kernel/composes` | Workbench route: `/truth-tree`

## Objectif

Land the **`composes`** link (the 7th KRD link — a whole contains a part, weighted `load-bearing | cosmetic`, version-pinned) and make the completeness law **recursive**: a composite layer's **aggregate** is GREEN iff its **own emergent mirror** is GREEN **and** every `composes`-child's aggregate is GREEN — so a red child turns the aggregated parent red (KRD §109 `aggregate_complete(L) := own_mirror(L)==GREEN ∧ ∀ child via composes : aggregate_complete(c)`).

## Sortie attendue

Per CLAUDE.md §5, only the artifacts whose answer is **yes** at this step. S18 is **pure logic + schema + a behaviour proof + a UI** that generalizes S06's mirror law and feeds S12's existing Stop gate. It does **not** erect a new wall, expose a new backend op, or pin a new business rule.

- **Go package** — `back/kernel/composes/` — the pure logic, in this step's own home only:
  - the **`Composes` link** as a value (`{parent layer ref, child layer ref, version @hash, weight: load-bearing|cosmetic}`), a specialization of S02's generic `Link` record — read-only over `kernel.layer` / `kernel.link` (the wall);
  - the **recursive aggregate** `Aggregate(L) → {GREEN|RED}` computing `own_mirror(L)==GREEN ∧ ∀ child via composes(L): Aggregate(child)==GREEN`, **consuming** S06's `own_mirror` liveness/verdict and the `Mirror` record — it does **not** re-derive or re-type them;
  - the **weighted, thresholded activation** (KRD §112): when a child changes, `activation ← Σ weight(load-bearing children changed)`; the parent's aggregate flips RED only when `activation ≥ L.activation_threshold` (a `cosmetic` child change stays below threshold and does **not** reopen the parent's emergent invariant — "épingle un défaut, pas un changement");
  - **cycle/edge guards**: `composes` is a DAG over layers; the aggregate detects a cycle and returns a typed error (an `OpenQuestion`, never a silent infinite recursion or an invented edge).
  Returns the per-node aggregate verdict + the drill-down path; it **never** returns a boolean it then satisfies (CLAUDE.md §8 — done is computed).
- **Postgres migration (Atlas, expand-only / append-only)** — `back/migrations/` — adds the **declared** `composes`-specific truth that S02's generic `Link` doesn't carry: the per-link `weight` (`load-bearing | cosmetic`) and the per-composite `activation_threshold` on `kernel.layer`. Both are **above-the-line declared truths** (KRD §112 — *weights and thresholds are declared by the human, never learned*), so the agent DB role gets **SELECT only**; only the `aidos` CLI writes them through an approved ChangeSet (the wall, §2). Append-only / expand-only — never alters or drops a prior table (mirrors S02/S06 shape). Whether these columns extend `kernel.link` / `kernel.layer` in place vs a side table is a real schema choice — confirm against S02's migration before assuming, **OpenQuestion** if not pinned.
- **BDD mirror** — conceptually stored in the `mirrors` schema, materialized to `tests/` for the runner (see "Test minimal"). Proves the recursive aggregate: a red child reddens the aggregated parent; a green own-mirror with all-green children is GREEN; a cosmetic child change below threshold does not.
- **Next route (Workbench)** — `front/web/app/truth-tree/` → `/truth-tree` — the composition tree panel (see "Visualisation UI").

Explicitly **NOT** in scope (no `yes` in §5, or out of slot — would be a monster):
- **No new Hook** — S12's `Stop` completeness hook is the non-bypassable gate; S18 makes the verdict it computes **recursive** by feeding it `Aggregate(L)` instead of the flat `own_mirror(L)`. Folding the recursive aggregate into S12's check is a change to S12's contract → **ChangeSet + SemanticDiff** (see anti-overwrite), not a second hook. A new artifact may ADD a guardrail, never re-erect one (CLAUDE.md §5 hook-honesty: a hook that never fires is dead).
- **No new MCP server** — no new backend capability is exposed as a tool; the aggregate is read over data the kernel already holds and is replayed by S05's `mirror-runner`. "Recompute the tree on demand as a tool" is a later `truth-tree` MCP **OpenQuestion**, not built now.
- **No new kernel/spec truth** — `composes` *generalizes* the existing truth (KRD §108: "aucun primitif neuf"); the link kind and the recursive law are method, the **specific** parent→child edges, weights, and thresholds of any real project are human-declared truths — do **not** invent them.
- **No Skill** — the gesture is the §6 per-step loop; drill-down/fall-back is rendered, not a new replayable procedure.

## Test minimal (done)

**Done criterion:** *A red child makes the aggregated parent red.*

Restated as a **failing-first** BDD mirror to write **before** any package, migration, or UI code (red is the `/goal`). Two cert-languages, one per nature:

- **Journey (N0) — Gherkin / Godog**, stored in `mirrors`, materialized to `tests/`:

  ```gherkin
  # mirrors schema · reflects: kernel.composes · test_kind: acceptance · cert_language: gherkin · authority: above
  Feature: Truth is compositional — a composite is green only if its own mirror and all its children are green

    Background:
      Given a composite layer P with an own_mirror and a composes link to child C
      And the composes weight of P→C is "load-bearing"
      And P's activation_threshold is declared above the line

    Scenario: A red child reddens the aggregated parent
      Given P's own_mirror is GREEN
      And child C's aggregate is RED
      When the aggregate of P is computed recursively
      Then the aggregate of P is RED

    Scenario: All-green own mirror and children make the parent green
      Given P's own_mirror is GREEN
      And every composes-child of P has aggregate GREEN
      When the aggregate of P is computed recursively
      Then the aggregate of P is GREEN

    Scenario: A green own mirror with a red child is NOT green (own invariant alone is not enough)
      Given P's own_mirror is GREEN
      And exactly one load-bearing child of P is RED
      When the aggregate of P is computed recursively
      Then the aggregate of P is RED
      And the drill-down path names the red child

    Scenario: A cosmetic child change below threshold does not redden the parent
      Given P's own_mirror is GREEN
      And only a "cosmetic" child of P changed
      And the activation is below P's activation_threshold
      When the aggregate of P is computed recursively
      Then the aggregate of P is GREEN
  ```

- **Invariant (∀) — property test (rapid, Go):** over **every** randomly generated finite `composes` DAG of layers with per-node `own_mirror ∈ {GREEN, RED}` and declared load-bearing/cosmetic weights:
  - `Aggregate(L) == GREEN ⟺ own_mirror(L)==GREEN ∧ ∀ child via composes(L): Aggregate(child)==GREEN` (the law holds at every node);
  - **monotone reddening**: flipping any one reachable descendant's `own_mirror` GREEN→RED across a `load-bearing` path never turns a previously RED ancestor GREEN, and turns at least the directly-affected ancestor RED once activation ≥ its threshold;
  - **cosmetic isolation**: a change confined to `cosmetic` children with `activation < threshold` leaves the parent's aggregate unchanged;
  - **no fabrication**: the aggregate reads only declared edges/weights/thresholds; on a cycle it returns the typed error, never recurses forever and never invents an edge.

Both start **red** (no `composes` package, no recursive aggregate, no weight/threshold columns). Done = red set → green ∧ prior green intact (S06 flat completeness, S12 gate) ∧ no monster (CLAUDE.md §8 — done is computed, never declared).

## Visualisation UI

**Workbench route:** `front/web/app/truth-tree/` → `/truth-tree`. A read-only panel rendering the **composition tree**: each layer node shows its `own_mirror` verdict and its **aggregate** verdict (GREEN/RED), each edge shows its `composes` **weight** (`load-bearing | cosmetic`) and pinned `@version`, and the parent's declared `activation_threshold`. It visualizes **drill-down** (click a red parent → the path descends to the red child that caused it) and **fall-back-up** (a red leaf tints its load-bearing ancestors red up to threshold). The worked KRD §114 example (`product → journey → view → control`) is a fine seed shape. New route only — do **not** touch existing routes (`/records`, `/mirror-health`, `/completeness`, etc.).

**Playwright e2e** (`tests/e2e/truth-tree.spec.ts`, via the `playwright-tester` agent + `playwright-e2e` skill; `playwright.config.ts` already has the `webServer` block, baseURL `http://localhost:3000`):

```
Given the Workbench is running
When I navigate to /truth-tree
Then I see a parent node and its composes-children with weight badges
And with all children green the parent's aggregate shows GREEN
When a load-bearing child is shown RED
Then the parent's aggregate shows RED
And drilling down from the parent names the red child
And a cosmetic child change below threshold leaves the parent GREEN
```

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: `back/kernel/composes/**`, a new expand-only migration under `back/migrations/`, the `mirrors`-stored Gherkin/property materialized to `tests/`, `tests/e2e/truth-tree.spec.ts`, and `front/web/app/truth-tree/**`. It must not hand-edit generated files (`back/gen/**`), must not touch prior Workbench routes, and must not write truth directly (the agent has SELECT-only on `kernel`/`mirrors`/`fitness`).

Two **prior contracts** are touched and therefore go through a **ChangeSet + SemanticDiff**, never a silent rewrite (CLAUDE.md §9):
1. **S06's completeness / `Mirror` aggregate** — S06 defined a flat `own_mirror`-based verdict; making it **recursive** (`GREEN ⟺ own_mirror ∧ ∀ child via composes : child.aggregate`) generalizes S06's `Mirror.aggregate` → ChangeSet + SemanticDiff on the mirror law, not an in-place edit.
2. **S12's `Stop` completeness gate** — feeding it `Aggregate(L)` instead of the flat verdict changes the gate's input contract → ChangeSet + SemanticDiff; S12's hook imports this package rather than re-deriving aggregation.

If a real tool choice is made inside a frozen slot (e.g. the tree-render approach in Next, or the property-DAG generator within `rapid`), record an **ADR**; otherwise do not. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S18 — "composes link + recursive mirror aggregate".
Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write
grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/composes.
Follow the CLAUDE.md §6 per-step loop IN ORDER. Do NOT go prompt → code.

(a) GRILL-WITH-DOCS the intention first. Run /grill-with-docs. One intention, ≤5 scenarios. Sharpen
    the ubiquitous language against CONTEXT-MAP.md + the Kernel CONTEXT.md (composes = the 7th link,
    mereology, weighted load-bearing|cosmetic, version-pinned; "down is a constraint, up is a signal;
    weights are declared, never learned") and KRD §107–§114: §108 (composes, the 7th link), §109
    (aggregate_complete(L) := own_mirror(L)==GREEN ∧ ∀ child via composes : aggregate_complete(c)),
    §110 (drill-down / fall-back-up), §112 (weighted & thresholded propagation; activation_threshold
    DECLARED above the line, never learned), §114 (the product→journey→view→control worked example).
    Confirm: composes is the recursive generalization of S06's mirror law (no new primitive); the
    recursive aggregate feeds S12's existing Stop gate (no new hook); BlockReason/monster vocabulary
    is reused, not reinvented. For any Next.js 16 / Go / Atlas / rapid / Godog API doubt use context7
    or node_modules/next/dist/docs. Update CONTEXT.md / write an ADR if a term or boundary is sharpened.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to
    tests/ for the runner. Two forms per nature: (N0) Gherkin/Godog for the journey "a red child makes
    the aggregated parent red; a green own_mirror with a red load-bearing child is NOT green; a
    cosmetic change below threshold leaves the parent green"; (∀) a rapid property over random finite
    composes DAGs: Aggregate(L)==GREEN ⟺ own_mirror(L)==GREEN ∧ ∀ child : Aggregate(child)==GREEN,
    monotone reddening along load-bearing paths, cosmetic isolation below threshold, and a cycle
    returns a typed error (never infinite recursion, never an invented edge). Run them. They MUST be
    RED (no composes package, no recursive aggregate, no weight/threshold columns). That red IS the /goal.

(c) TDD red → green → refactor, in back/kernel/composes ONLY (plus the new expand-only migration in
    back/migrations/). Outside-in. Within the frozen slots, search the CURRENT (May 2026) best tool AT
    MOST 3, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, go test, sqlc/pgx,
    Atlas are fixed). The likely real choices: how the property generator builds random composes DAGs
    within `rapid`, and whether weight/activation_threshold extend kernel.link/kernel.layer in place or
    a side table (match S02's migration shape — do not introduce a second pattern). If you make a
    genuine choice, record a short ADR; otherwise do not. Code ONLY what turns the red set green; do
    not add link kinds beyond `composes`, do not invent edges/weights/thresholds.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, Biome at the monorepo
    root, ESLint in front/web, and the existing S00–S16 mirrors stay green. Self-certify on the
    COMPUTATIONAL only. Never declare the aggregate green from tests you wrote — done is computed.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor; reproduce on the KRD §114
    shape — flip a load-bearing control RED and confirm view/journey/product aggregates go RED with a
    correct drill-down path; flip a cosmetic child below threshold and confirm the parent stays GREEN;
    confirm a cycle yields the typed error (OpenQuestion), not a hang.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is required). Create front/web/app/truth-tree/ →
    /truth-tree: render the composition tree — each node's own_mirror verdict + aggregate verdict, each
    edge's weight (load-bearing|cosmetic) and @version, the parent's activation_threshold, with
    drill-down (red parent → red child) and fall-back-up tinting. Do NOT touch existing routes. Add
    tests/e2e/truth-tree.spec.ts (use the playwright-e2e skill) asserting: all-green children → parent
    GREEN; a load-bearing child RED → parent RED with drill-down naming the red child; a cosmetic
    change below threshold → parent stays GREEN.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: confirm
    composes is a deep, well-named module (one Composes link value, one recursive Aggregate, one
    weighted-threshold rule — no scattered duplicate strings); confirm it CONSUMES S06's own_mirror and
    Mirror record rather than re-deriving them, and that S12's Stop hook imports it rather than
    re-implementing aggregation; boundaries match the Kernel CONTEXT.md.

(h) CREATE ARTIFACTS PER §5: the Go package (back/kernel/composes, this step) and the expand-only
    Postgres migration for the declared weight + activation_threshold (back/migrations/). Do NOT add an
    MCP server or a new Hook — no new backend capability or non-bypassable rule is warranted; S12's gate
    already enforces, and S18 only makes its verdict recursive. A new artifact may ADD a guardrail,
    never REMOVE one.

HONESTY RULES (mandatory):
- Never invent a target, targetId, or business-rule. The composes link KIND and the recursive law are
  method; the SPECIFIC parent→child edges, weights (load-bearing/cosmetic), and activation_thresholds of
  any real project are HUMAN-DECLARED truths above the line. If a weight or threshold is not pinned by an
  existing kernel record / KRD §112 / an ADR / CONTEXT.md, do NOT guess — record an OpenQuestion and stop
  on that branch. Weights and thresholds are DECLARED, never learned, never defaulted silently.
- You never write a truth-test (an invariant you would then satisfy — the circularity). The composes
  mirror is a means-test toward the human red ("a red child reddens the parent"), not a new truth.
- Any change to a prior contract goes through a ChangeSet + SemanticDiff. Generalizing S06's flat
  Mirror.aggregate to the recursive law, and feeding S12's Stop gate Aggregate(L) instead of the flat
  verdict, are BOTH prior-contract changes → ChangeSet + SemanticDiff. Add new files; never silently
  rewrite a prior artifact (S02 records, S06 mirror law, S12 gate), never hand-edit back/gen/**.
- An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

DONE CRITERIA (computed, not declared): red set → green ∧ prior green intact (S06 flat completeness,
S12 gate, all S00–S16 mirrors) ∧ Aggregate(L)==GREEN ⟺ own_mirror(L)==GREEN ∧ ∀ child via composes :
Aggregate(child)==GREEN holds at every node ∧ a red load-bearing child reddens the aggregated parent
∧ a cosmetic change below threshold does not ∧ a cycle yields a typed error (no hang, no invented edge)
∧ no monster ∧ /truth-tree renders with a passing Playwright e2e.

END WITH THE STEP REPORT:
- BDD added: which mirrors (Gherkin/Godog journey, rapid DAG property) and where in `mirrors` / tests/.
- Tests run: commands + red→green transition (composes unit/property, Godog journey, migration apply).
- UI route: /truth-tree + the Playwright spec path and result.
- ChangeSet status: the S06 mirror-law generalization and the S12 gate-input change → ChangeSet +
  SemanticDiff (list both); else "none".
- Red-set status: started red, now green (list any still-red).
- Known limits: e.g. weight/threshold column placement (OpenQuestion if S02 shape not pinned), no
  truth-tree MCP fetch for the Workbench yet, cosmetic-vs-load-bearing seed values are example-only
  (real ones are human-declared).
- Next safe step: the stable phase this leaves and the smallest next tooth that consumes it (e.g.
  weighted bidirectional red-wave / drill-down resolution, or the propagation step over composes).
```
