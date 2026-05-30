# S26 — ArchiveCurationPolicy (keep/compress/tombstone) + QD niches (MAP-Elites)

Subsystem: AIDOS Archive | Home: `back/archive/curation` | Workbench route: `/archive-curation`

## Objectif

Land **`ArchiveCurationPolicy`** (KRD §44.4) — the pure decision that keeps the version DAG a living memory rather than an infinite dump (`décharge`) by classifying each node **keep / compress / tombstone** — together with **quality-diversity niches** (KRD §62, algorithm ②): place each kept variant in its behavioral niche and select **one élite per niche** (MAP-Elites). The done criterion: **unsafe branches are tombstoned, élites are kept, and a variant is only promoted into a niche when it has a green mirror.**

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go packages), **persistence** (one Atlas migration), a **behaviour proof** (a fixture + property mirror), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/archive/curation/` — the `ArchiveCurationPolicy` AST per KRD §44.4 (three declared bands: `keep` = `stable_phases ∪ incident_related_branches ∪ pareto_elites ∪ high_novelty_variants`; `compress` = `failed_variants_after_30d ∪ duplicate_behaviors`; `tombstone` = `unsafe_branches ∪ obsolete_experiments`) and a pure `Curate(nodes, policy, now) → []CurationDecision` where each decision is `{nodeId, verdict: keep|compress|tombstone, reason}`. The policy bands are **declared, not learned** (CLAUDE.md §8): the membership predicates (`is_unsafe`, `is_stable_phase`, `is_pareto_elite`, `is_high_novelty`, `age > 30d`, `is_duplicate_behavior`) are evaluated over node metadata the prior steps already carry — a stable-phase node (S23) is a `keep`, an élite (this step's QD output) is a `keep`. **Critical history is never destroyed**: `tombstone` marks a node, it does **not** delete it (append-only); `compress` summarizes/compacts, it does not drop the node. `Curate` is a pure function over `(nodes, policy, now)` — no DB calls, no I/O, no `time.Now()` (the clock is passed in as `now` so the decision is deterministic and replayable).
- **Go package** `back/archive/qd/` — the quality-diversity selection per KRD §62 algorithm ②: a pure `Niche(variant) → nicheKey` (the behavioral descriptor, **declared** by the niche grammar — e.g. the set of mirrors a variant reflects + its authority band; never a learned embedding), and a pure `Elites(variants) → map[nicheKey]Variant` that keeps **one élite per niche** by the **non-gameable fitness ordering already defined** (mirror red→green ∧ computational sensors ∧ out-of-sample — consumed from the prior fitness steps, **not** redefined here). The keystone rule (KRD §62, §66.2, §123): a variant enters a niche **only if it has a green mirror** — the Judge is the deterministic mirror, **never** an LLM scoring its own copy; a champion replaces the niche élite **only if it beats it on the same anchored fitness**. Pareto front per niche is the output, not a single global champion. No I/O, no clock/RNG.
- **Atlas migration** (`back/migrations/`) — one declarative, **expand-only / append-only** migration adding to the existing `dag` truth schema: a `dag.curation_decision` table (`id text PRIMARY KEY` = hash of the canonical decision body reusing S01/S02's content-hash — do **not** fork it; `node_id text NOT NULL`, `verdict text NOT NULL CHECK (verdict IN ('keep','compress','tombstone'))`, `reason text NOT NULL`, `policy_version text NOT NULL`, `decided_at timestamptz NOT NULL`) and a `dag.niche_elite` table (`niche_key text NOT NULL`, `elite_node_id text NOT NULL`, `fitness jsonb NOT NULL`, `recorded_at timestamptz NOT NULL`, PK `(niche_key, recorded_at)` so élite history is append-only — a new élite is a new row, never an UPDATE). A tombstone is a **decision row**, never a `DELETE`/`DROP` on a DAG node. GRANTs: the agent DB role gets **SELECT only** on both tables (the wall, §2; `dag` is a truth schema above the line). Only the `aidos` CLI writer role inserts decisions/élites, via an approved ChangeSet.
- **BDD mirror** — a **fixture** mirror (`state → command → events`: a set of DAG nodes + a policy + `now` → `Curate` → the verdicts; and a set of variants → `Elites` → the per-niche élites) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (see below).
- **Next route** `front/web/app/archive-curation/` → `/archive-curation` — the Workbench panel rendering the curation verdicts per DAG node (keep / compress / tombstone, each with its reason) and the MAP-Elites niche grid (one élite per niche, with its fitness), reading via the SELECT-only role (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — `Curate`/`Elites` are pure libraries; recording decisions is done through the existing `changeset` MCP + `aidos` writer role (S20), not a new backend service. **No new hook** — the wall GRANT, the completeness law and the commit-gate are prior artifacts; this step adds no new non-bypassable rule. **No Skill** — the `evolve` gesture (running the medium loop / self-play + QD generation) is a later step; this step delivers only the *selection + curation decision* over an already-populated archive, not the generator. **No variant generation / self-play / novelty search / POET** (KRD §62, §66) — those produce candidates; this step only *accepts/keeps/buckets* them. **No branch/merge/revert mechanics** (those are S23's stable-phase node + S20's ChangeSet edges, consumed here). **No fitness definition** (consumed from the prior fitness/sensor steps, never coined here). **No actual compaction/summarization engine** — `compress` produces the *decision*, not the compacted artifact. **No codegen/emitters.**

## Test minimal (done)

**Done = unsafe branches tombstoned, élites kept; promotion needs a green mirror.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: archive.curation.Curate + archive.qd.Elites · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "an unsafe branch is tombstoned, never deleted"          # THE done criterion
    state   (nodes):  [ { id: "var-7", flags: ["unsafe"] } ]
    command (curate): Curate(nodes, policy, now)
    events:  [ decision("var-7").verdict == "tombstone",
               node "var-7" still present in dag (append-only, not destroyed),
               decision.reason names the unsafe_branches band ]

  fixture "a stable phase and a pareto elite are kept"             # THE done criterion (keep)
    state   (nodes):  [ { id: "phase-3", kind: "stable_phase" },
                        { id: "var-2",  flags: ["pareto_elite"] } ]
    command (curate): Curate(nodes, policy, now)
    events:  [ decision("phase-3").verdict == "keep",
               decision("var-2").verdict  == "keep" ]

  fixture "a failed variant older than 30d is compressed, not destroyed"
    state   (now):    "2026-05-30T00:00:00Z"
    state   (nodes):  [ { id: "var-9", flags: ["failed"], created_at: "2026-03-01T00:00:00Z" } ]
    command (curate): Curate(nodes, policy, now)
    events:  [ decision("var-9").verdict == "compress", node "var-9" still present ]

  fixture "a variant with a green mirror is promoted into its niche"   # THE done criterion (QD)
    state   (variants): [ { id: "var-A", niche: "createOrder/discount", mirror: "green", fitness: 0.8 } ]
    command (elites):   Elites(variants)
    events:  [ elite("createOrder/discount") == "var-A" ]               # one elite per niche (MAP-Elites)

  fixture "a variant with a RED mirror is NOT promoted, whatever its fitness"   # the anti-Goodhart anchor
    state   (variants): [ { id: "var-B", niche: "createOrder/discount", mirror: "red", fitness: 0.99 } ]
    command (elites):   Elites(variants)
    events:  [ niche "createOrder/discount" has NO elite ]              # the Judge is the mirror, never the score

  fixture "a champion replaces the niche elite only if it beats it on anchored fitness"
    state   (variants): [ { id: "var-A", niche: "n1", mirror: "green", fitness: 0.8 },
                          { id: "var-C", niche: "n1", mirror: "green", fitness: 0.9 } ]
    command (elites):   Elites(variants)
    events:  [ elite("n1") == "var-C" ]                                # higher anchored fitness wins; both green

  fixture "the recorded decision id is the content hash of its body"
    state   (nodes):  [ ... ]
    command (curate): Curate then canonical-hash(decision body)
    events:  [ decision.id == Hash(Canonicalize(body)) ]               # content-addressed (S01/S02 reused)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: curation.Curate + qd.Elites · test_kind: property · cert_language: rapid · authority: below
  ∀ nodes,policy,now:  Curate is deterministic — same inputs ⇒ same decisions (now is passed, never read from the clock)
  ∀ node flagged unsafe OR obsolete_experiment:  verdict == "tombstone"   (any unsafe branch ⇒ tombstone)
  ∀ stable_phase | pareto_elite | incident_related | high_novelty node:  verdict == "keep"  (critical history kept)
  ∀ Curate run:  no input node id disappears from the output — tombstone/compress NEVER drop a node (append-only)
  ∀ variant with mirror != green:  it never appears as any niche élite  (promotion needs a green mirror)
  ∀ niche:  at most ONE élite (MAP-Elites), and it is the green variant with max anchored fitness in that niche
  ∀ Elites run:  it never invents a niche key or a fitness — every élite traces to a real input variant
  ∀ malformed node/variant:  Curate/Elites yield a verdict, never panic
  ```

Both start **red** (no `curation` package, no `qd` package, no `Curate`/`Niche`/`Elites`, no `dag.curation_decision`/`dag.niche_elite` tables). That red **is** the `/goal`. The fixtures are **means-tests toward the human red** (unsafe ⇒ tombstone, élite ⇒ keep, red mirror ⇒ no promotion) — not new truths the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/archive-curation/page.tsx` (new route `/archive-curation`; do not touch existing routes). A read-only panel with two views, reading via the SELECT-only role: (1) the **curation ledger** — each DAG node with its verdict badge (**KEEP** green / **COMPRESS** amber / **TOMBSTONE** grey), its reason, and a note that tombstoned/compressed nodes are still present (append-only); (2) the **MAP-Elites niche grid** — one cell per niche, each showing its single élite and that élite's anchored fitness, and rendering an **empty cell** for a niche whose only candidates have red mirrors (the "no promotion without a green mirror" rule made visible). With an unsafe branch present, its node shows **TOMBSTONE**; with a green-mirror élite, its niche cell is filled — the verdicts rendered, not re-computed.
- **Playwright e2e:** `tests/e2e/archive-curation.spec.ts` — navigate to `/archive-curation`, assert an unsafe branch renders a **TOMBSTONE** badge while remaining listed (not gone), a stable-phase / élite node renders **KEEP**, the green-mirror variant fills its niche cell, and the red-mirror variant leaves its niche cell **empty** (the done criterion visible in the UI). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/curation/**`, `back/archive/qd/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/archive-curation.spec.ts`, and `front/web/app/archive-curation/**` — and otherwise **adds new files**. It defines new contracts (the `ArchiveCurationPolicy` AST + `Curate` decision; the `Niche`/`Elites` QD selection; the `dag.curation_decision` and `dag.niche_elite` tables; the keep/compress/tombstone rule and the green-mirror promotion gate); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT, and `tombstone`/`compress` are decisions, never `DELETE`/`DROP` on a DAG node. Any change to a **prior contract** it depends on — S01/S02's content-hash substrate, S23's stable-phase node shape, S20's ChangeSet write-path, the prior fitness/sensor result shape it consumes, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S26 — "ArchiveCurationPolicy (keep/compress/tombstone) + QD niches
(MAP-Elites)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write
grant to kernel/mirrors/fitness/dag), front=Next.js (the Workbench). Home = back/archive/curation AND
back/archive/qd ONLY (plus the Atlas migration in back/migrations). Follow the CLAUDE.md §6 per-step loop IN
ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §44.4 (ArchiveCurationPolicy — the DAG is a living memory, not an
infinite dump/décharge; three declared bands keep/compress/tombstone; critical history is NEVER destroyed, only
compacted/summarized/tombstoned), §62 + algorithm ② (the medium loop: quality-diversity, MAP-Elites — ONE élite
per behavioral niche, a Pareto front per cell, NOT one global champion; the archive IS the version DAG; stepping
stones are kept ancestors; fitness is NON-GAMEABLE = mirror red→green ⊕ computational sensors ⊕ out-of-sample),
§66.2 (CellVitality is diagnostic, NEVER a promotion fitness), §123 (the human "revenir + re-brancher" and the
evolution "échantillonne un stepping stone" are the SAME gesture; only authority and the mirror-guarded
promotion differ — the Judge is the deterministic MIROIR, never an LLM scoring its own copy). Read CONTEXT-MAP.md
+ back/archive/CONTEXT.md (archive, version DAG, quality-diversity archive, stable phase, ChangeSet, stepping
stone, ArchiveCurationPolicy — and the AVOID lists: ArchiveCurationPolicy is NOT a retention config / garbage
collector / log rotation / purge; the QD archive is NOT a training-data / experiment-tracker / model-registry)
and the prior steps' specs (S01/S02 content-store + records/content-hash, S04 the wall, S20 ChangeSet write-path,
S23 stable-phase node). For any Next.js 16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs.
Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: ArchiveCurationPolicy classifies each DAG node into ONE of three DECLARED bands — keep
    (stable_phases, incident_related_branches, pareto_elites, high_novelty_variants), compress
    (failed_variants_after_30d, duplicate_behaviors), tombstone (unsafe_branches, obsolete_experiments);
    tombstone MARKS, it does NOT delete (append-only — critical history is never destroyed); compress summarizes,
    it does not drop. A QD NICHE is a behavioral descriptor (DECLARED, not a learned embedding); MAP-Elites keeps
    ONE élite per niche by the ANCHORED fitness; a champion replaces the niche élite only if it beats it on that
    same fitness; a Pareto front per niche, NOT one global champion. The keystone: a variant is promoted into a
    niche ONLY IF it has a GREEN MIROIR — the Judge is the deterministic mirror, never an LLM scoring itself, and
    fitness/CellVitality is never gamed. This step delivers the curation DECISION + the QD SELECTION over an
    already-populated archive, NOT variant generation / self-play / novelty / POET (later), NOT the fitness
    definition (consumed), NOT branch/merge/revert (S23/S20, consumed), NOT the compaction engine itself
    (compress yields the decision, not the compacted artifact). Sharpen each term against
    back/archive/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch
    before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = a set of DAG nodes (with
        flags/kind/created_at) + a policy + a passed-in `now`, and a set of variants (niche, mirror status,
        fitness); command = Curate(nodes, policy, now) and Elites(variants); events = the verdicts and the
        per-niche élites. Cover: an UNSAFE branch ⇒ TOMBSTONE and the node is STILL PRESENT (append-only) — THE
        done criterion ; a stable_phase and a pareto_elite ⇒ KEEP — THE done criterion ; a failed variant older
        than 30d ⇒ COMPRESS (still present) ; a GREEN-mirror variant ⇒ promoted as its niche élite (one per
        niche) — THE done criterion ; a RED-mirror variant with HIGHER fitness ⇒ NOT promoted (the anti-Goodhart
        anchor) ; a higher-anchored-fitness green champion replaces the niche élite ; the recorded decision id ==
        Hash(Canonicalize(body)) (content-addressed, S01/S02 reused).
      - PROPERTY (rapid, ∀, below the line): Curate is deterministic (now passed in, never read from the clock) ;
        any unsafe/obsolete node ⇒ tombstone ; any stable_phase/pareto_elite/incident_related/high_novelty ⇒
        keep ; no input node id ever disappears from the output (tombstone/compress NEVER drop a node) ; a
        non-green-mirror variant is NEVER a niche élite ; at most ONE élite per niche and it is the green
        max-anchored-fitness variant ; Elites never invents a niche key or a fitness ; never panics on malformed
        input.
    Run them; watch them go RED (no curation/qd packages, no Curate/Niche/Elites, no dag.curation_decision /
    dag.niche_elite tables). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no
    inventing a new curation band or a new fitness you'd grade yourself) — mirror the human intention only
    (unsafe ⇒ tombstone; élite ⇒ keep; red mirror ⇒ no promotion); the fixture is a means-test toward the human
    red.

(c) TDD red → green → refactor in back/archive/curation AND back/archive/qd ONLY (plus the Atlas migration in
    back/migrations). Outside-in. Build: the typed ArchiveCurationPolicy AST (the three declared bands) + a pure
    Curate(nodes, policy, now) → []CurationDecision{nodeId, verdict, reason} that evaluates DECLARED membership
    predicates over node metadata the prior steps carry — no I/O, no time.Now() (now is a parameter), no learned
    thresholds ; and the pure Niche(variant) → nicheKey (declared descriptor) + Elites(variants) →
    map[nicheKey]Variant keeping one élite per niche by the ANCHORED fitness CONSUMED from prior steps, admitting
    a variant ONLY IF its mirror is green. Within the frozen slots, if a REAL tool choice arises, search AT MOST
    3 current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, the
    fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/CLI are fixed). The likely genuine choices:
    the canonical decision-JSONB shape + content-hash (REUSE S01/S02's Canonicalize/Hash — do NOT fork it) and
    the niche-key encoding (a declared, stable, sortable key — NOT an embedding). Record a short ADR (docs/adr/)
    ONLY if a genuine choice is made (e.g. the niche-descriptor grammar). The migration is expand-only/
    append-only: add dag.curation_decision (id=hash PK, node_id, verdict CHECK keep|compress|tombstone, reason,
    policy_version, decided_at) and dag.niche_elite (niche_key, elite_node_id, fitness jsonb, recorded_at, PK
    append-only so a new élite is a new row, never an UPDATE). A tombstone/compress is a DECISION ROW, never a
    DELETE/DROP on a DAG node. GRANT the agent role SELECT only on both tables (the wall); only the aidos writer
    role inserts decisions/élites, inside a ChangeSet (S20). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only;
    never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Curate on the unsafe /
    stable-phase / failed-30d cases and Elites on the green / red-but-higher-fitness cases, state the cause,
    propose. Check completeness: dag.curation_decision + dag.niche_elite (the curation/QD truth) have their
    living mirror (the fixture + property); no monster (no truth without a mirror, no orphan mirror, no node
    silently destroyed, no variant promoted on a red mirror) — else Stop blocks. Do not finish a code step
    without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/archive-curation/ →
    /archive-curation: render (SELECT-only role) the curation ledger (each node with a KEEP/COMPRESS/TOMBSTONE
    badge + reason, noting tombstoned/compressed nodes are still present) and the MAP-Elites niche grid (one
    élite per niche + its anchored fitness; an EMPTY cell for a niche whose only candidates have red mirrors).
    Show an unsafe branch as TOMBSTONE (still listed) and a green-mirror élite filling its niche cell. Read the
    verdict; render it, do not re-implement Curate/Elites. Do NOT touch existing routes. Add
    tests/e2e/archive-curation.spec.ts (use the playwright-e2e skill) asserting the TOMBSTONE badge for an unsafe
    branch (still listed), KEEP for a stable-phase/élite, the green-mirror variant filling its niche cell, and
    the red-mirror variant leaving its niche cell EMPTY (the done criterion visible in the UI).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that curation
    and qd are deep, well-named modules (Curate/CurationDecision/the three bands separated; Niche/Elites/the
    one-élite-per-niche rule and the green-mirror gate obvious), that Curate/Elites are pure and REUSE S01/S02's
    hash scheme and the prior anchored fitness without duplicating or redefining them, that the migration/GRANT
    keeps the wall intact (dag is above the line, agent SELECT-only), that tombstone/compress never delete a
    node, and that boundaries match back/archive/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the two Go packages (pure logic/schema), the Atlas
    migration (persistence), the fixture + rapid property (behaviour proof), and the Next route (visualization).
    Do NOT add a new MCP server, a hook, or a Skill — no new backend service, non-bypassable rule, or replayable
    gesture is justified at S26 (the wall already guards dag.*; recording decisions goes through the S20
    changeset MCP + aidos writer role; the `evolve` skill that GENERATES variants/self-play, and the brain/
    context steps, are later). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin a curation band or a fitness KRD §44.4/§62
  does not state: the bands are exactly keep{stable_phases, incident_related_branches, pareto_elites,
  high_novelty_variants} / compress{failed_variants_after_30d, duplicate_behaviors} / tombstone{unsafe_branches,
  obsolete_experiments}; the QD rule is one green-mirror élite per niche by the anchored fitness. If the exact
  decision-JSONB columns, the content-hash scheme, the niche-descriptor grammar, the prior fitness result shape,
  the node-metadata flags (unsafe/failed/duplicate/novelty), or the dag node shape are not pinned by KRD / an
  existing migration / S01-S02's Canonicalize / a referenced step, do NOT guess — record an OpenQuestion
  (provenance) and STOP on that branch. The example ids (var-7, phase-3, createOrder/discount) are illustrative;
  reuse pinned artifacts from S11/S17/S23 where a real id is needed, do not coin new business ids.
- You NEVER write a truth-test (a new curation band or fitness you would then satisfy — the circularity). The
  fixture and property are means-tests toward the human red (unsafe ⇒ tombstone; élite ⇒ keep; red mirror ⇒ no
  promotion), not new truths. The Judge is the deterministic mirror, never an LLM (and never CellVitality)
  scoring a variant into a niche.
- Any change to a prior contract (S01/S02 records/hash, S20 ChangeSet write-path, S23 stable-phase node shape,
  the consumed fitness/sensor result shape, the wall GRANTs) goes through a ChangeSet + SemanticDiff. Add new
  files; never silently rewrite a prior artifact, never hand-edit back/gen/**. tombstone/compress are decision
  rows, never DELETE/DROP on a DAG node (append-only). An override is a recorded decision (ChangeSet + ADR +
  provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the Curate fixtures pass — an UNSAFE branch is TOMBSTONED and STILL PRESENT
(not destroyed), a stable_phase and a pareto_elite are KEPT, a failed-30d variant is COMPRESSED (still present)
— and the Elites fixtures pass — a GREEN-mirror variant is promoted as its single niche élite (MAP-Elites), a
RED-mirror variant is NOT promoted whatever its fitness (promotion needs a green mirror), and a higher-anchored
green champion replaces the niche élite ; the recorded decision id is the content hash of its body ; the rapid
invariants hold (determinism with now passed in, any-unsafe⇒tombstone, élite⇒keep, no node ever dropped,
no-green⇒no-élite, one-élite-per-niche, no invented niche/fitness, no panic) ; /archive-curation renders the
curation ledger + the MAP-Elites niche grid with a passing Playwright e2e ; the dag.curation_decision /
dag.niche_elite GRANTs prove SELECT-only for the agent ; the migration is append-only/expand-only. You cannot
force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized
  (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /archive-curation — what it renders (the keep/compress/tombstone ledger + the MAP-Elites niche
  grid + the empty cell for red-mirror-only niches), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to dag.curation_decision / dag.niche_elite go through
  the aidos CLI writer role via the S20 changeset flow, not the agent); any prior-contract change → ChangeSet +
  SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. selection/curation only (no variant generation / self-play / novelty / POET), fitness and
  niche-descriptor grammar consumed/declared not invented, compress yields a decision not a compacted artifact,
  no MCP, no hook, no Skill, branch/merge/revert consumed from S23/S20, node-metadata-flag source assumption.
- Next safe step: the smallest stable next tooth (e.g. the `evolve` skill + medium-loop driver that GENERATES
  candidate variants/self-play to feed these niches, or the brain/MemoryFirewall step) and why it is safe to
  chain.
```
