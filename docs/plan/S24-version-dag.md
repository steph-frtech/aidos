# S24 — Version DAG (branch / checkout-ancestor / rebranch)

Subsystem: AIDOS Archive | Home: `back/archive/dag` | Workbench route: `/version-dag`

## Objectif

Make the version space a **DAG, not a line**: stable phases are nodes, ChangeSets are edges (S20), and the three navigation moves — **branch** (open an alternative line of truth from a stable phase), **checkout an ancestor** (make a prior stable phase the current head), and **rebranch** (open a *new* line from that ancestor) — become first-class, append-only DAG movements (KRD §120-§125). Nothing is ever destroyed: an abandoned line stays in the DAG as a potential stepping stone.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration for the `dag` schema), a **capability** (the `dag` MCP server), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new Hook or a new Skill (justified below).

- **Go package** `back/archive/dag/` — the version-DAG AST + pure movement functions over **nodes = stable phases** and **edges = ChangeSets** (reuse the S20 ChangeSet edge and the S01 content-addressed substrate; do **not** fork either). Types: `Node` (a stable phase: `id` = content hash, `parent_ids []text` — a DAG, not a tree, so a node may have ≥1 parents; `head bool`; `stratum: above|below` per the waterline, §124; `label`), `Edge` (a ChangeSet linking `from_node → to_node`, reusing `changesets.changeset.id`). Pure functions, no I/O: `Branch(dag, fromPhase, label) → Node{new line, head}` (opens an alternative line of truth from a stable phase — §121); `CheckoutAncestor(dag, ancestorPhase) → DAG{head = ancestor}` (makes a prior stable phase the current head — a *backward* move; the abandoned line is **not** detached or deleted, only `head` moves — §120/§121); `Rebranch(dag, ancestorPhase, label) → Node{new line from ancestor}` (the branch-of-a-branch: from the recheckout-ed ancestor, open a *new* line — §121); plus read helpers `Ancestors(node)`, `Heads(dag)`, `IsReachable(from, to)`. The semantic **merge** of two truth branches (§122) and the **promotion-gated-by-mirror** rule (§124) are explicitly a **later** step — here we land only branch / checkout-ancestor / rebranch (the three §121 moves). Pure logic only; the `/goal` red-wave wiring is a later projection.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only / append-only: a `dag` schema with `dag.node` (`id text PK` = content hash of the canonical phase body, `body jsonb NOT NULL`, `head boolean NOT NULL DEFAULT false`, `stratum text NOT NULL CHECK (stratum IN ('above','below'))`, `label text`, `created_at timestamptz NOT NULL`) and `dag.edge` (`from_node text NOT NULL REFERENCES dag.node(id)`, `to_node text NOT NULL REFERENCES dag.node(id)`, `changeset text NOT NULL` = `changesets.changeset.id`, `created_at timestamptz NOT NULL`, PK `(from_node, to_node, changeset)`). The DAG is a relation over existing content-addressed rows — it does **not** copy phase or ChangeSet bodies, it references them. GRANTs: the agent DB role gets **SELECT only** on `dag.*` (the wall, §2); the `head` flag and any new node/edge are written **only** by the `aidos` CLI role through the approved `dag` MCP flow, never by the agent directly. A "checkout an ancestor" is an **append + a head-flag move**, never a delete (append-only / mutable head, §120).
- **MCP server** `back/mcp/dag/` (Go MCP SDK, one tool = one backend op) — the capability door carrying the `aidos` CLI write-grant: `dag_branch`, `dag_checkout_ancestor`, `dag_rebranch`, `dag_heads`, `dag_ancestors`, `dag_get` (read the DAG for rendering). The Workbench and other agents call these; the agent role never writes the `dag` schema directly.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **DAG-navigation fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `state → command → events` over the canonical §120 shape (`v0 → v1 → v2`, branch `w1` off `v1`, checkout ancestor `v2`, rebranch `v2a`). Plus a **property invariant** (rapid, `authority: below`) on the movement functions. These **are** the done criteria (see below).
- **Next route** `front/web/app/version-dag/` → `/version-dag` — the Workbench panel rendering the DAG: nodes (stable phases), edges (ChangeSets), the current head, abandoned-but-present lines, and the waterline stratification (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **No new Hook** — there is no new non-bypassable rule to add at this step; the wall (S04 PreToolUse) + the SELECT-only GRANT already forbid the agent writing `dag.*`, and the S20 commit-gate already guards APPLIED. **No Skill** — branch / checkout / rebranch are exercised through the `dag` MCP tools + the standard per-step loop; not yet a distinct repeatable multi-step gesture warranting a `SKILL.md` (record an OpenQuestion if one emerges). **No semantic merge / conflict-as-sensor** (§122) — merging two truth branches via the mirror aggregate is the *next* tooth, not this one. **No mirror-gated promotion of evolutionary variants** (§124) and **no QD sampling of stepping stones** (§123) — they ride on this DAG but are later. **No red-wave / `/goal` firing** — navigation moves the head; draining a wave is a later runtime step. **No codegen** — there is no projection emitted from the DAG itself.

## Test minimal (done)

**Done = you can branch, checkout an ancestor, and rebranch all work — and the abandoned line is never destroyed.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **DAG-navigation fixture** (`cert_language: fixture`, `authority: above`) — reflects `dag.node` / `dag.edge` for the canonical §120 graph, as `state → command → events`:

  ```
  # mirrors schema · reflects: dag.node/dag.edge "version-dag-§120" · test_kind: fixture · authority: above
  mirror reflects "version-dag-§120" {

    given dag { nodes: [v0(head)], edges: [] }
      when branch { from: "v0", label: "main-line" }
        -> events: [ Branched ]
        -> node v1 exists { parent_ids: ["v0"], head: true }
        -> node v0.head == false        # head moved, v0 not deleted

    given dag { nodes: [v0, v1(head), v2], edges: [v0->v1, v1->v2] }
      when branch { from: "v1", label: "tva-eu-variant" }
        -> events: [ Branched ]
        -> node w1 exists { parent_ids: ["v1"], head: true }
        -> heads(dag) contains "w1"      # a parallel line of truth off an ancestor

    # checkout an ancestor — a BACKWARD move; nothing is destroyed
    given dag { nodes: [v0, v1, v2(head), w1], edges: [v0->v1, v1->v2, v1->w1] }
      when checkout_ancestor { phase: "v1" }
        -> events: [ HeadMoved ]
        -> node v1.head == true
        -> node v2 still exists          # abandoned line stays in the DAG
        -> node w1 still exists

    # rebranch — open a NEW line from the recheckout-ed ancestor (branch of a branch)
    given dag { head: "v1", nodes: [v0, v1(head), v2, w1] }
      when rebranch { from: "v1", label: "v2a-line" }
        -> events: [ Rebranched ]
        -> node v2a exists { parent_ids: ["v1"], head: true }
        -> node v2 still exists          # THE done case: old line never destroyed
        -> is_reachable("v0", "v2a") == true
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any sequence of `branch / checkout_ancestor / rebranch` commands, the DAG **only grows** (node count and edge count are monotonically non-decreasing — append-only; no move ever deletes a node or edge — §120); the structure stays a **DAG** (no cycle — every edge points from an existing node to a node whose `created_at` is later; `is_reachable` is irreflexive on its own back-edge); **exactly one head per active line** but the DAG may hold several parallel heads (§125 — a branch can be stable while another is in flux); `checkout_ancestor(p)` leaves every prior node present and sets `p.head` (a head-flag move, never a structural edit); `rebranch` always creates a node whose `parent_ids` contains the checked-out ancestor; every `Node.id` equals the content hash of its canonical body (content-addressing, reused from S01); every edge's `changeset` references an existing `changesets.changeset.id` (the DAG is a relation over existing rows, never a copy).

All start **red** (no `dag` package, no `dag` schema, no `Branch/CheckoutAncestor/Rebranch`, no `dag` MCP). That red **is** the `/goal`. The canonical done case is green only when branching off a phase opens a parallel head without deleting siblings, checking out an ancestor moves the head backward while every later node stays present, and rebranching from that ancestor opens a new reachable line while the abandoned line remains in the DAG — i.e. **you can branch, checkout an ancestor, and rebranch all work, append-only.**

## Visualisation UI

- **Workbench route:** `front/web/app/version-dag/page.tsx` (new route `/version-dag`; do **not** touch existing routes). It renders the §120 DAG as a graph: **nodes** = stable phases (the current **head** highlighted), **edges** = ChangeSets (labelled with the `changesets.changeset.id`), the **abandoned-but-present** line shown dimmed (not removed — making append-only visible), and the **waterline stratification** (`above` = human truth branches, `below` = evolutionary branches, §124) drawn as two bands. It animates the three moves on the canonical fixture: branch (`w1` off `v1`), checkout-ancestor (head jumps back to `v1`, `v2`/`w1` stay), rebranch (`v2a` off `v1`). Reads via the SELECT-only role through `dag_get`; renders the fixture, does not re-implement the movement functions.
- **Playwright e2e:** `tests/e2e/version-dag.spec.ts` — navigate to `/version-dag`, assert the graph shows nodes `v0 v1 v2` with `v2` initially the head; assert branching shows a new head `w1` parented on `v1` while `v2` is still present; assert checkout-ancestor shows the head back on `v1` with `v2` and `w1` still rendered (dimmed, not gone); assert rebranch shows `v2a` parented on `v1` and reachable from `v0`, with the abandoned line still visible; assert the two waterline bands (`above`/`below`) are present. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/dag/**`, the new `back/migrations/<new>.sql`, the new `back/mcp/dag/**`, the `mirrors`-stored navigation fixture/property materialized to `tests/`, `tests/e2e/version-dag.spec.ts`, and `front/web/app/version-dag/**` — and otherwise **adds new files**. It introduces a new contract (the `dag.node` / `dag.edge` shape, the `branch` / `checkout_ancestor` / `rebranch` movement semantics, the `above`/`below` stratum, the append-only "abandoned line is never destroyed" guarantee) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; a "checkout an ancestor" is a **head-flag move + append**, never an in-place delete of a node or edge. Any change to a **prior contract** it depends on — the S20 ChangeSet edge / `changesets.changeset.id`, the S01 content-store substrate, the stable-phase shape, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance).

## Prompt a lancer

```text
You are step-executor for AIDOS step S24 — "Version DAG (branch / checkout-ancestor / rebranch)". Stack
is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant to
kernel/mirrors/fitness/changesets/dag), front=Next.js (the Workbench). Home = back/archive/dag ONLY.
Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §120 ("L'espace des versions est un DAG, pas une ligne ; une phase
stable est une coupe cohérente sur n'importe quelle branche ; les transitions se déplacent dans le DAG —
en avant, en arrière (checkout d'un ancêtre), et latéralement (brancher) ; revenir = checkout d'une phase
stable ancêtre + ouverture d'une nouvelle ligne de ChangeSets depuis elle ; modèle jj : tout changement
est un objet mutable de première classe"), §121 (the THREE moves: Brancher = ouvrir une ligne de vérité
alternative depuis une phase stable ; Revenir = checkout d'un ancêtre, le rendre tête courante ; Re-
brancher = depuis cet ancêtre, ouvrir une NOUVELLE ligne ; "l'ancienne ligne abandonnée n'est jamais
détruite — append-only — elle reste dans le DAG, accessible, comme un stepping stone potentiel"), §124
(stratification par la ligne de flottaison: branches humaines au-dessus = lignes de vérité ; branches
évolutives en dessous = variantes d'implémentation), §125 (phase stable = coupe cohérente sur n'importe
quelle branche ; une branche peut être stable pendant qu'une autre est en flux). Read CONTEXT-MAP.md +
back/archive/CONTEXT.md (version DAG = stable phases as NODES, ChangeSets as EDGES, content-addressed,
append-only with mutable head, stratified by the waterline; stepping stone = an ancestor recheckout-ed to
re-mutate; the version DAG and the QD archive are ONE structure). Read the prior Archive steps you REUSE:
S20 (the ChangeSet = the EDGE; reuse changesets.changeset.id — do NOT re-model the edge) and S01 (the
content-addressed append-only content store = the substrate for node ids — do NOT fork its content-hash
scheme). For any Next.js 16, Atlas, Go MCP SDK, rapid, or graph-render API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/archive/CONTEXT.md: the "version DAG" is a DAG (not a line, not a
    tree — a node may have ≥1 parents), where NODES are stable phases (a coherent cut where every link
    resolves and every sensor is green) and EDGES are ChangeSets (S20). The THREE moves are: "branch" =
    open an ALTERNATIVE line of TRUTH from a stable phase ; "checkout an ancestor" = make a prior stable
    phase the current HEAD (a BACKWARD move — head flag moves, nothing is destroyed) ; "rebranch" = from
    that recheckout-ed ancestor, open a NEW line (the branch-of-a-branch). The abandoned line is NEVER
    destroyed (append-only with a mutable head) — it stays in the DAG as a potential STEPPING STONE. The
    DAG is stratified by the WATERLINE: "above" = human truth branches, "below" = evolutionary
    implementation variants (§124). Do NOT use "git history", "commit log", "version history", "timeline",
    "snapshot", "tag", or "release" as synonyms (CONTEXT.md _Avoid_ list — a git tag only MAPS a stable
    phase). Resolve every branch before coding — especially: "revenir à l'ancienne version" (human undo)
    and "échantillonner un stepping stone" (evolution) are THE SAME gesture (checkout an ancestor +
    rebranch); a node may have several parents (DAG, not tree); the DAG can hold several parallel heads
    (one branch stable while another is in flux, §125). If a term shifts, update CONTEXT.md / write an ADR
    inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - DAG-navigation fixture (cert_language: fixture, authority: above), reflecting dag.node/dag.edge
        for the canonical §120 graph (v0→v1→v2 ; branch w1 off v1 ; checkout ancestor v1 ; rebranch v2a),
        as state→command→events. Rows: branch from a phase -> Branched, new node parented on it, head
        moves, the from-node is NOT deleted ; branch off an inner ancestor -> a parallel head, both heads
        live (§125) ; checkout_ancestor -> HeadMoved, ancestor.head==true, every later node STILL EXISTS
        (append-only) ; rebranch from the recheckout-ed ancestor -> Rebranched, a NEW node parented on it,
        the abandoned line STILL EXISTS and the new line is reachable from the root (THE done case).
      - property invariant (rapid, authority: below): for any branch/checkout_ancestor/rebranch sequence,
        the DAG only GROWS (node+edge counts monotonically non-decreasing — no move deletes anything); it
        stays a DAG (no cycle); checkout_ancestor is a head-flag move that leaves every prior node present;
        rebranch creates a node whose parent_ids contains the ancestor; the DAG may have several parallel
        heads; every Node.id == content hash of its canonical body (reuse S01); every edge.changeset
        references an existing changesets.changeset.id (the DAG is a relation over existing rows, never a
        copy).
    Run them; watch them go RED (no dag package, no dag schema, no Branch/CheckoutAncestor/Rebranch, no
    dag MCP). That red IS the /goal. Do NOT write a truth-test you would then satisfy — mirror the human
    intention only.

(c) TDD red→green→refactor, in back/archive/dag ONLY (plus the back/migrations/ schema file and
    back/mcp/dag/). Outside-in. REUSE S20's changesets.changeset.id as the EDGE (do NOT re-model the
    ChangeSet) and S01's content-hash scheme for NODE ids (do NOT fork it) — the dag schema is a RELATION
    over existing content-addressed rows, it references, never copies their bodies. If a real tool choice
    arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never
    touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx, the Go MCP SDK,
    Go hook binaries are FIXED). The likely genuine choices: how multi-parent nodes are stored (parent_ids
    array on dag.node vs an explicit dag.edge parent relation — keep ONE representation, do not duplicate
    parentage); whether "head" is a boolean per node or a separate dag.head pointer table (pick the
    simplest that supports SEVERAL parallel heads); and the canonical node-body shape fed to the content
    hash. Record a short ADR (docs/adr/) ONLY if a genuine choice is made (e.g. parentage representation,
    or head modelling). The migration is expand-only/append-only and references S20/S01 tables (FK to
    changesets.changeset, reuse the content-hash); GRANT the agent role SELECT only on dag.* (the wall);
    only the aidos CLI role (via the dag MCP) writes nodes/edges and moves the head flag. Code only what
    turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce branch /
    checkout_ancestor / rebranch on each fixture row (branch-off-head, branch-off-inner-ancestor,
    checkout-ancestor, rebranch), state the cause, propose. Check completeness: the dag layer has its
    living mirror and each required test_kind is present (KRD §33); no monster (no movement function
    without its fixture row; no node/edge shape without a property covering it); the append-only invariant
    actually holds (no move deletes a node/edge) — else Stop blocks. Do not finish a code step without
    /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/version-dag/ →
    /version-dag: render the §120 DAG as a graph — nodes (stable phases, the head HIGHLIGHTED), edges
    (ChangeSets, labelled by changesets.changeset.id), the abandoned-but-present line shown DIMMED (not
    removed, so append-only is visible), and the waterline stratification (above = human-truth band,
    below = evolutionary band, §124). Animate the three moves on the canonical fixture (branch w1 off v1 ;
    checkout-ancestor jumps the head back to v1 with v2/w1 still present ; rebranch v2a off v1). Read via
    the SELECT-only role through dag_get; render the fixture, do not re-implement the movement functions.
    Do NOT touch existing routes. Add tests/e2e/version-dag.spec.ts (use the playwright-e2e skill)
    asserting: v0/v1/v2 with v2 the head ; branch shows new head w1 on v1 with v2 still present ;
    checkout-ancestor shows head back on v1 with v2/w1 dimmed-but-present ; rebranch shows v2a on v1
    reachable from v0 with the abandoned line still visible ; both waterline bands present.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that dag
    is a deep, well-named module; that Branch/CheckoutAncestor/Rebranch are pure and depend on the
    S20 ChangeSet edge + S01 content-store substrate without duplicating them; that the migration/GRANTs
    keep the wall intact (SELECT-only on dag.*); that the dag MCP owns exactly one concern (DAG
    navigation); boundaries match back/archive/CONTEXT.md (the DAG = nodes-as-stable-phases /
    edges-as-ChangeSets; semantic merge and mirror-gated promotion are LATER steps). Do not advance
    without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the dag MCP server (capability), the navigation fixture + property (behaviour
    proof), and the Next route (visualization). Do NOT add a Hook (no new non-bypassable rule — the S04
    wall + the SELECT-only GRANT + the S20 commit-gate already cover it), no Skill (no distinct repeatable
    gesture beyond the MCP tools + the standard loop), no semantic merge / conflict-as-sensor (§122 is the
    next tooth), no mirror-gated evolutionary promotion (§124) and no QD sampling (§123), and no red-wave
    firing. A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If the exact dag.node/dag.edge JSONB shape, the
  parentage representation, the "head" modelling, or the stratum semantics is not pinned by KRD
  §120/§121/§124/§125 / an existing migration (S20, S01) / ADR / CONTEXT.md, do NOT guess — record an
  OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a "merge" move (§122 is
  later), do NOT invent a delete/prune operation (the DAG is append-only — an abandoned line is never
  destroyed), do NOT copy ChangeSet/phase bodies into dag.* (reference existing content-addressed rows),
  and do NOT reach into the kernel/mirrors schemas.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The navigation
  fixture is a means-test toward the human red, not a new truth.
- Any change to a prior contract (S20 ChangeSet edge / changesets.changeset.id, S01 content store, the
  stable-phase shape, the wall GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never
  silently rewrite a prior artifact, never hand-edit back/gen/**. A node/edge is append-only — never edit
  or delete it in place; only the head flag moves.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the navigation fixture passes — branching off a stable phase opens a
new node parented on it and moves the head, without deleting the from-node; branching off an inner
ancestor yields a parallel head with both lines live; checking out an ancestor sets that ancestor's head
flag and leaves EVERY later node present (append-only); rebranching from the recheckout-ed ancestor
creates a NEW node parented on it, reachable from the root, while the abandoned line STILL EXISTS (THE
done criteria: branch, checkout an ancestor, and rebranch all work, append-only); the rapid invariant
holds (DAG only grows, no cycle, several parallel heads allowed, checkout is a head-flag move, rebranch
parents on the ancestor, Node.id == content hash, every edge references an existing changesets.changeset
id); /version-dag renders the graph with the head highlighted, the abandoned line dimmed-but-present, and
the two waterline bands, with a passing Playwright e2e; GRANTs prove SELECT-only on dag.*; the migration
is append-only/expand-only and references S20/S01 tables. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (DAG-navigation fixture, rapid property), where stored (mirrors schema) and
  materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /version-dag — what it renders (nodes/edges, highlighted head, dimmed abandoned line,
  waterline bands), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED of any envelope opened during the step (truth writes go through
  the aidos CLI role via the changeset/dag MCP, not the agent); any prior-contract change → ChangeSet +
  SemanticDiff (note the change_type), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no semantic merge / conflict-as-sensor yet (§122), no mirror-gated evolutionary
  promotion (§124) or QD stepping-stone sampling (§123) yet, no red-wave / /goal wiring, parentage/head
  representation chosen (ADR ref), strata supported.
- Next safe step: the smallest stable next tooth (e.g. the semantic MERGE of two truth branches with the
  mirror aggregate as the conflict sensor, §122; or mirror-gated promotion of an evolutionary branch to
  the head, §124) and why it is safe to chain.
```
