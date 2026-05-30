# S02 — KRDCore record schemas (Idea, Truth, Mirror, Layer, Link, ChangeSet, Phase) as JSONB

Subsystem: AIDOS Kernel | Home: `back/kernel/records` | Workbench route: `/records`

## Objectif

Define the seven KRDCore record types — **Idea, Truth, Mirror, Layer, Link, ChangeSet, Phase** — as the canonical, content-addressed, append-only JSONB substrate of the Kernel, so that every later step has a typed truth-record to read and the wall has tables to forbid the agent from writing. This step lands the schema + Go shapes only; it does not yet implement DSL ASTs, propagation, or runners.

## Sortie attendue

Per CLAUDE.md §5, this step needs **persistence**, **pure schema/logic**, and a **visualization** — so exactly these artifacts, and no more:

- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration creating the JSONB record tables in their canonical Postgres schemas: `ideas.idea`, `kernel.truth`, `kernel.layer`, `kernel.link`, `mirrors.mirror`, `changesets.changeset`, `dag.phase`. Each row is content-addressed: `id text PRIMARY KEY` = hash of the canonical JSONB body; `body jsonb NOT NULL`; `version text NOT NULL` (= the same hash, the *licence to change*); `superseded_by text NULL`; `created_at timestamptz`. **Append-only** (no `UPDATE`/`DELETE` of the body; head moves via a new row + `superseded_by`). GRANTs: the agent DB role gets **SELECT only** on these schemas — **no INSERT/UPDATE/DELETE** (the wall, §2). Only the `aidos` CLI role writes, via an approved ChangeSet.
- **Go package** (`back/kernel/records/`) — the typed Go structs for the seven records (one struct per `kind`, mirroring KRD §21 `Layer`, §34 `Mirror`, §118 `Idea`), a `Canonicalize(body) []byte` producing the deterministic JSONB encoding, a `Hash(body) string` = the content address, and a `Validate(record)` that checks shape + the content-address invariant (`id == version == Hash(Canonicalize(body))`). Pure functions only — no DB calls, no I/O. The DB is reached later via sqlc/pgx; this step does not add a repository.

> Explicitly **out of scope** (do not create): no MCP server (no read/write *capability* is exposed yet — `store` MCP is a later step), no hook (no new non-bypassable rule beyond the GRANT, which the existing wall hook already covers at the schema level), no DSL AST tables, no codegen/emitters, no sqlc queries.

## Test minimal (done)

**Done = `aidos check` validates an empty example, and the `/records` route shows one entity card per record kind.** Restated failing-first, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for Godog:

```gherkin
# mirrors schema · reflects: kernel.records · test_kind: acceptance · cert_language: gherkin · authority: above
Feature: KRDCore records validate as an empty content-addressed example
  Scenario: aidos check accepts the canonical empty record set
    Given the seven KRDCore record schemas exist in Postgres (ideas, kernel, mirrors, changesets, dag)
    And an empty example record of each kind (Idea, Truth, Mirror, Layer, Link, ChangeSet, Phase)
    When I run "aidos check" over the example
    Then it reports the example VALID
    And each record's id equals its content hash equals its version
    And no agent write is required (SELECT-only role suffices to validate)
```

Supporting invariant mirror (rapid property test, below the line, computational):

```
# reflects: records.Hash/Canonicalize · test_kind: property · cert_language: rapid · authority: below
∀ body:  Hash(Canonicalize(body)) is stable under key reordering
∀ body:  Validate(record{id:Hash(body), version:Hash(body), body}) == OK
∀ body:  any byte change to body ⇒ a different hash (a new version, never a mutation)
```

Both start **red** (no schema, no `aidos check` validator for records). That red **is** the `/goal`.

## Visualisation UI

- **Workbench route:** `front/web/app/records/page.tsx` (new route `/records`; do not touch existing routes). It renders one **entity card per record kind** (seven cards: Idea, Truth, Mirror, Layer, Link, ChangeSet, Phase), each showing the kind, its content-address id placeholder, and "above/below the line" authority badge. Reads from the SELECT-only role; with the empty example it shows the seven empty/valid cards.
- **Playwright e2e:** `tests/e2e/records.spec.ts` — navigate to `/records`, assert the seven named cards are present and that the page reports the empty example as VALID. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** (`back/migrations/<new>.sql`, `back/kernel/records/*.go`, `front/web/app/records/*`, `tests/e2e/records.spec.ts`, the new mirror sources) and otherwise **adds new files**. It defines new contracts; it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files, no silent model replacement. The migration is **expand-only / append-only** — it never alters or drops a prior table. Should a later need touch any contract this step freezes (a record's shape, the content-address invariant, a GRANT), that change must go through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) accompanied by a **SemanticDiff** on the affected record schema, never an in-place edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S02 — "KRDCore record schemas (Idea, Truth, Mirror, Layer,
Link, ChangeSet, Phase) as JSONB". Home = back/kernel/records ONLY. Follow CLAUDE.md §6 in order.
Read KRD.md §21 (Layer), §34 (Mirror), §118 (Idea), §811/§848 (append-only, content-address,
ChangeSet) and CONTEXT-MAP.md + back/kernel/CONTEXT.md before touching anything. Do not start
without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. One intention, <=5 scenarios. Pin the ubiquitous language
    for the seven record kinds: what is a Truth vs a Layer vs an Idea here, what "content-addressed"
    and "append-only, mutable head" mean for a row, what "above/below the waterline" tags on a
    record. Sharpen terms against back/kernel/CONTEXT.md; update CONTEXT.md / an ADR inline if a
    term shifts. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized
    for the runner:
      - acceptance (Gherkin/Godog): "aidos check validates the canonical empty example" — id == hash
        == version for each of the seven kinds; SELECT-only role suffices.
      - invariant (rapid property): Canonicalize is stable under key reorder; Hash is deterministic;
        any byte change yields a new version (never an in-place mutation); Validate(empty example)==OK.
    Run them; watch them go RED. That red IS the goal. Do NOT write a truth-test you would then
    satisfy (no inventing a new invariant about records you'd grade yourself) — mirror the human
    intention only.

(c) TDD red->green->refactor in back/kernel/records ONLY (and the Atlas migration in back/migrations).
    Outside-in. If a real tool choice arises WITHIN a frozen slot, search at most 3 current
    (May 2026) options, pick the SIMPLEST, and record an ADR (docs/adr/) only if a genuine choice was
    made. Frozen here: Atlas for the migration; sqlc+pgx is the DB-access slot but THIS step writes no
    queries (pure structs + Canonicalize/Hash/Validate); Godog + rapid for the mirrors. The likely
    real choice is the canonical-JSONB / content-hash scheme (e.g. canonical-JSON ordering + a hash
    function) — search <=3, pick simplest, ADR it. Migration is expand-only/append-only; GRANT the
    agent role SELECT only on ideas/kernel/mirrors/changesets/dag (the wall).

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt/go vet, biome check at root, eslint in
    front/web, go test, the new mirrors. Self-certify on the computational only; never declare the
    behaviour green from tests you wrote.

(e) DIAGNOSE before finishing (/diagnose): isolate any failing sensor, state the cause, propose. Do
    not finish a code step without it. Check completeness: every record schema has its living mirror,
    no monster (no truth without a mirror, no orphan mirror) — else Stop blocks.

(f) ADD THE WORKBENCH ROUTE (a UI is REQUIRED): front/web/app/records/page.tsx at /records — one
    entity card per record kind (7 cards), authority badge, content-address id field; reads via the
    SELECT-only role; renders the empty example as VALID. Do NOT touch existing routes. Add the
    Playwright e2e tests/e2e/records.spec.ts asserting the seven named cards and the VALID empty
    example, per the playwright-e2e skill.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step (/improve-codebase-architecture): check the
    records package is deep, navigable, and that the migration/GRANTs keep the wall intact. Do not
    advance without it.

(h) CREATE ARTIFACTS per §5 and ONLY those that apply: the Atlas migration (persistence) and the Go
    package (pure schema/logic). Do NOT add an MCP server, a hook, DSL AST tables, or sqlc queries —
    no new capability/rule/persistence beyond these is justified at S02.

HONESTY RULES (anti-hallucination, mandatory): never invent a target, a targetId, or a business-rule.
If a record field, a kind, or the meaning of a tag is uncertain, do NOT guess — raise it as an
OpenQuestion (provenance) and stop on that branch. Surface assumptions; present multiple readings
rather than silently picking one (CLAUDE.md working guidelines 1).

DONE is COMPUTED, never declared (CLAUDE.md §8): red set -> green AND prior green intact AND mutation
score >= threshold AND no monster. Concretely: `aidos check` validates the empty example of all seven
records; the rapid invariants hold; the /records route shows the seven cards and reports VALID;
GRANTs prove SELECT-only; migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
  - BDD added: which mirrors (acceptance + property), where stored (mirrors schema) / materialized.
  - Tests run: command + pass/fail counts (godog, rapid/go test, biome, eslint, playwright).
  - UI route: /records — what it renders, e2e file + result.
  - ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent).
  - Red-set status: which scenarios went red then green; any still red.
  - Known limits: e.g. no MCP/store yet, no DSL ASTs, no sqlc repository, validator scope.
  - Next safe step: the smallest stable next tooth (e.g. S03 link types / DSL AST records) and why
    it is safe to chain.
```
