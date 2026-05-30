# S35 — Entity source (AST in Postgres) → codegen Go + TS + DDL (the Order entity)

Subsystem: AIDOS Kernel | Home: `back/kernel/entities` | Workbench route: `/entity-map`

## Objectif

Land the **entity source** (KRD §23, line 530: `kind: entity` = the data model, a **SOURCE** layer, human / above the line) as an **AST in Postgres** (`kernel` schema, JSONB, content-addressed, append-only) and the deterministic **codegen** that **emits its three projections** — a **Go struct**, a **TS type**, and **Postgres DDL** — from that single source, never double-typed (CLAUDE.md §3 frozen N3 slot: "one source (entity) → emits Go + TS + DDL, never double-typed"). The canonical entity is **Order**. The done criterion: an entity emits a Go struct + a TS type + DDL.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the entity AST node + a materialized DDL projection), and a **visualization** (a Next route) — and nothing more (no Skill, no Hook, no MCP — see out-of-scope):

- **Go package** `back/kernel/entities/` — the entity AST + the three emitters. The `Entity` AST (KRD §23/§26, the LinkML-concept rendered as the AIDOS AST-in-Postgres): `name` (e.g. `Order`), ordered `attributes[]` each `{ name, type, required, identifier?, multivalued? }` over a closed scalar type set (the ubiquitous domain types — `string`, `int`, `decimal`, `bool`, `timestamptz`, … — pinned by the entity grammar, **not invented ad-hoc**), and the content-address id = `Hash(Canonicalize(body))` reusing **S02's** `Canonicalize`/`Hash` (do **not** fork it). Three pure deterministic emitters that take an `Entity` and return source text, never touching the DB:
  - `EmitGo(entity) → []byte` — the Go struct (the N3 type projection; pairs with the **sqlc/pgx** DB-access slot, but this step emits the *struct*, not queries),
  - `EmitTS(entity) → []byte` — the TypeScript type (the shared `type/sdk` projection consumed by the Workbench),
  - `EmitDDL(entity) → []byte` — the Postgres `CREATE TABLE` DDL (the `db` projection, expand-contract shape, **fed to Atlas**, not applied here).
  Each emitter is a **pure, total, deterministic function** — same `Entity` ⇒ byte-identical output, no I/O, no clock, no RNG — so a projection is *derived*, replayable, and diffable against its source. The package adds **no repository**; the DB is reached later via sqlc/pgx. The entity AST itself is a **SOURCE / above the line** truth: the agent **reads** it (SELECT-only), it **never** writes it.

- **Atlas migration** (`back/migrations/`) — one declarative, **expand-only / append-only** migration adding the entity AST node table `kernel.entity` (a SOURCE layer record, KRD §21/§26): `id text PRIMARY KEY` = hash of the canonical entity body, `body jsonb NOT NULL` holding `{ name, attributes }`, `version text NOT NULL` (= the same hash, the licence to change), `superseded_by text NULL`, `created_at timestamptz NOT NULL`. Append-only (no `UPDATE`/`DELETE` of the body; head moves via a new row + `superseded_by`, S02's substrate). GRANTs: the agent DB role gets **SELECT only** on `kernel.entity` (the wall, §2 — an entity is human-frozen truth above the line); only the `aidos` CLI writer role inserts an entity via an approved ChangeSet. The **emitted DDL projection** is materialized to `back/gen/` and handed to Atlas as a *derived* migration — it is a projection guarded by its mirror, **never** the source.

- **Go package** `back/gen/` (the emitter **output**, NOT hand-written) — `EmitGo` writes the Go struct here, `EmitTS` writes the TS type to the Workbench's generated-types location consumed by `/entity-map`, `EmitDDL` writes the DDL here for Atlas. Per CLAUDE.md §4/§9 `back/gen/**` is **generated, never hand-edited**; this step *produces* it from the source, it is not authored.

- **BDD mirror** — by the nature of the `entity` layer its required mirror is **schema-validation** (KRD §23 reflection table: `entity ─mirrors→ schema-validation`). Concretely a **fixture** mirror (`state → command → events`: an `Entity` → `EmitGo`/`EmitTS`/`EmitDDL` → the three projection artifacts validate against the source schema) plus a **`rapid` property** mirror for the ∀ invariants (round-trip / determinism / source-faithfulness), conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These **are** the done criteria (below).

- **Next route** `front/web/app/entity-map/` → `/entity-map` — the Workbench panel rendering the **Order** entity source (its attributes) **and** its three emitted projections side-by-side (Go struct · TS type · DDL), each labelled as a *derived projection* of the one source (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no MCP server** — the three emitters are a pure library, no read/write *capability* or callable backend op is exposed (an `emit`/`codegen` MCP tool is a later step only if a real need emerges → record an **OpenQuestion**, do not build it now). **No new Hook** — no non-bypassable rule beyond the existing wall GRANT/PreToolUse (S04) and the existing completeness/`Stop` gates; the "never hand-edit `back/gen/**`" rule is the *existing* anti-overwrite contract, not a new hook to invent here. **No Skill** — emitting from a source is the harness's inner codegen, not a new replayable human gesture. **No `api`/`operation`/`policy`/`control`/`action` layers** — those are sibling source steps; an entity here is a *standalone* data model, not yet wired into an operation or an API. **No Pact** — the cross-cell N3 contract verification (CLAUDE.md §3, "Pact between cells") is a later infra/N5 step; this step emits the *intra-cell* type triple only. **No relations/foreign keys between entities** (associations, `composes`) — a single self-contained entity (`Order`) only; multi-entity graphs/relations are a later tooth → OpenQuestion if a need appears. **No `behavior` macro expansion** (KRD §24.6 ownable/soft-deletable/…) — a later step. **No migration *application*** — `EmitDDL` produces the expand-contract DDL; Atlas applying it against a live DB is the persistence runner, not this pure step.

## Test minimal (done)

**Done = an entity emits a Go struct + a TS type + DDL.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. The entity's required mirror kind is **schema-validation** (KRD §23); the projections are *derived*, so each is checked for faithfulness to the one source.

- **Schema-validation / fixture (N2 frozen slot: `state → command → events`, interpreted in Go)**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: kernel.entities.{EmitGo,EmitTS,EmitDDL} · test_kind: schema-validation/fixture · cert_language: fixture · authority: above
  fixture "the Order entity emits a Go struct + a TS type + DDL"          # THE done criterion
    state   (entity):   Order { id: int identifier required, customer: string required, total: decimal required, discount: decimal, placed_at: timestamptz required }
    command (emit go):  EmitGo(Order)
    events:  [ Emitted ]
    -> output is a valid Go struct  `type Order struct { … }`             # the N3 type projection (sqlc-shaped)
    -> every Order attribute appears as one struct field, in source order, with the mapped Go type
    command (emit ts):  EmitTS(Order)
    events:  [ Emitted ]
    -> output is a valid TS type    `type Order = { … }`                  # the shared type/sdk projection
    -> required attrs are non-optional; non-required attrs (discount) are optional (`discount?`)
    command (emit ddl): EmitDDL(Order)
    events:  [ Emitted ]
    -> output is a `CREATE TABLE "order" ( … )`                           # the db projection (expand-contract)
    -> the identifier attr (id) is the PRIMARY KEY; required attrs are NOT NULL; discount is NULLABLE

  fixture "all three projections agree on the same source"               # one source, never double-typed (CLAUDE.md §3)
    state   (entity):   Order { …as above… }
    command (emit all): { EmitGo, EmitTS, EmitDDL }(Order)
    events:  [ Emitted, Emitted, Emitted ]
    -> the field set of the Go struct == the field set of the TS type == the column set of the DDL (modulo type mapping)
    -> none introduces, drops, or renames an attribute the source does not have

  fixture "the recorded entity id is the content hash of its body"       # content-addressed (S02 reused)
    state   (entity):   Order { name, attributes }
    command (compute):  canonical-hash(body)
    events:  [ entity.id == Hash(Canonicalize(body)) ]

  fixture "an attribute with an unknown scalar type is rejected, not guessed"   # honesty: never invent a type mapping
    state   (entity):   Order { … , foo: "Unobtainium" }                 # not in the pinned scalar type set
    command (emit go):  EmitGo(Order)
    events:  [ Blocked ]
    -> block_reason.code == "UNKNOWN_ATTRIBUTE_TYPE"                      # reuse S13 BlockReason shape
    -> no projection is emitted (no silent fallback to `any`/`text`)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: kernel.entities.{EmitGo,EmitTS,EmitDDL} · test_kind: property · cert_language: rapid · authority: below
  ∀ entity:                       EmitGo / EmitTS / EmitDDL are deterministic — same entity ⇒ byte-identical output
  ∀ entity:                       each emitter is total over well-typed entities — never panics; an unknown type ⇒ BlockReason
  ∀ entity:                       the projection's field/column set equals the source's attribute set (no add / drop / rename)
  ∀ entity:                       source attribute ORDER is preserved in the Go struct and the TS type
  ∀ entity, ∀ attr:               attr.required ⇔ DDL NOT NULL ⇔ TS non-optional ; ¬required ⇔ NULLABLE ⇔ TS optional
  ∀ entity with one identifier:   the DDL has exactly one PRIMARY KEY, on the identifier attribute
  ∀ entity:                       entity.id == Hash(Canonicalize(body)) (content-addressed) — any byte change ⇒ a new version
  ```

Both start **red** (no `entities` package, no `EmitGo`/`EmitTS`/`EmitDDL`, no `kernel.entity` table, no Order example). That red **is** the `/goal` for this step. The fixtures are **means-tests toward the human red** (an entity emits a Go struct + a TS type + DDL, all faithful to one source) — **not** new truths the agent invents and then grades. The agent never invents an attribute, a type, or a mapping the source/grammar does not state.

## Visualisation UI

- **Workbench route:** `front/web/app/entity-map/page.tsx` (new route `/entity-map`; do **not** touch existing routes). A read-only panel that renders, via the SELECT-only role: the **Order** entity **source** (its attributes with type / required / identifier badges) on the left, and on the right its **three emitted projections** — the **Go struct**, the **TS type**, the **DDL** — each shown in a labelled panel marked *derived projection*, so it is visible that one source produces three faithful outputs (never double-typed). With the Order example it shows all five attributes in the source and all three projections agreeing on those attributes (identifier → PK, required → NOT NULL / non-optional, `discount` → NULLABLE / optional). Renders the emitted artifacts; does **not** re-implement the emitters in TS.
- **Playwright e2e:** `tests/e2e/entity-map.spec.ts` — navigate to `/entity-map`, assert the **Order** source card lists its attributes, and assert all **three** projection panels are present and non-empty: a Go struct containing `type Order struct`, a TS type containing `type Order`, and DDL containing `CREATE TABLE "order"` with `PRIMARY KEY` on `id` and `discount` rendered nullable/optional (the done criterion — Go + TS + DDL — visible in the UI). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/entities/**`, the new `back/migrations/<new>.sql`, the emitted `back/gen/**` (produced, never hand-authored), the `mirrors`-stored schema-validation fixture + `rapid` property materialized to `tests/`, `tests/e2e/entity-map.spec.ts`, and `front/web/app/entity-map/**` — and otherwise **adds new files**. It defines one new contract (the `Entity` AST shape + scalar type set, `EmitGo`/`EmitTS`/`EmitDDL` and their faithfulness rules, the `kernel.entity` table, the `Order` canonical example); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no **hand-edit of generated files** (`back/gen/**` is emitted from the source — to change a projection, change the source and re-emit, never edit the output), no silent model replacement, no touching prior Workbench routes; any prior `Stop`/wall hook is **composed/extended additively** (a new artifact may ADD a guardrail, never REMOVE one — §5 meta-loop rule). The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT. Any change to a **prior contract** it depends on — S02's record substrate / `Canonicalize` / `Hash`, S04's wall GRANT set, S13's `BlockReason` shape, the `kernel` schema shape, the `Order.discount` example pinned by S20/S22 — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S35 — "Entity source (AST in Postgres) → codegen Go + TS + DDL (the Order
entity)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant
to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/entities ONLY (plus the Atlas
migration in back/migrations, and the emitted output in back/gen which is PRODUCED, never hand-authored). Follow
the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §23 (the full vertical — entity = schéma (LinkML-concept) = the data
model, a SOURCE layer, human/above; and the projections it feeds: api+operation, db (migrations expand-contract),
type/sdk — line 530-533), §26 (la couche : kind/owner/authority/role/sensor/links — entity is role=SOURCE,
authority=above), §27 (the reflection table: `entity ─mirrors→ schema-validation` — that is this entity's
required mirror kind), §40 (append-only, content-addressed, version=hash), and the §3 frozen-stack N3 row in
CLAUDE.md ("one source (entity) → emits Go structs (sqlc), Postgres DDL, TS types ; never double-typed").
Read CONTEXT-MAP.md + back/kernel/CONTEXT.md (entity as SOURCE, source/projection, the waterline, the
completeness law, the monster — and any AVOID lists). Read the prior steps' specs you DEPEND ON and CONSUME,
never re-implement: S02 (records substrate / Canonicalize / Hash / Validate), S04 (the wall / GRANTs / PreToolUse),
S13 (BlockReason shape). For any Next.js 16, Atlas, sqlc, or Go API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: an ENTITY is a SOURCE layer (kind: entity), human-frozen, ABOVE the waterline — the data model;
    in AIDOS it lives as an AST in the `kernel` Postgres schema (JSONB, content-addressed, append-only), NOT as
    a hand-written struct. Its three EMITTED outputs — the Go struct, the TS type, the Postgres DDL — are
    PROJECTIONS: derived, disposable, BELOW the line, guarded by the entity's mirror, materialized to back/gen
    (NEVER hand-edited). "One source → three faithful projections, never double-typed" (CLAUDE.md §3). The
    entity's REQUIRED mirror kind is schema-validation (KRD §27). This step delivers the entity AST node +
    THREE PURE deterministic emitters + the canonical `Order` example, NOT an api/operation/policy/control/action
    layer (sibling steps), NOT entity-to-entity relations/foreign keys (single self-contained Order only), NOT a
    behavior-macro expansion, NOT Pact cross-cell contracts, NOT the Atlas APPLICATION of the DDL (emit only).
    Sharpen each term against back/kernel/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline.
    Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. The entity's required mirror kind is SCHEMA-VALIDATION (KRD §27). Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = the `Order` entity
        { name, attributes: id:int identifier required, customer:string required, total:decimal required,
        discount:decimal (NOT required), placed_at:timestamptz required }; command = EmitGo(Order),
        EmitTS(Order), EmitDDL(Order); events = the three emitted artifacts. Cover: the Order entity emits a Go
        struct + a TS type + DDL (THE done criterion — every attribute appears, in source order, with its mapped
        type; identifier → PRIMARY KEY; required → NOT NULL / non-optional; discount → NULLABLE / TS optional) ;
        all three projections agree on the SAME source field set (no add/drop/rename — never double-typed) ; the
        recorded entity id == Hash(Canonicalize(body)) (content-addressed, S02 reused) ; an attribute with an
        UNKNOWN scalar type is BLOCKED (S13 BlockReason `UNKNOWN_ATTRIBUTE_TYPE`), never guessed/coerced to
        any/text.
      - PROPERTY (rapid, ∀, below the line): each emitter is DETERMINISTIC (same entity ⇒ byte-identical output)
        and TOTAL (never panics; unknown type ⇒ BlockReason) ; the projection field/column set == the source
        attribute set (no add/drop/rename) ; source attribute ORDER preserved in Go + TS ; required ⇔ NOT NULL ⇔
        TS non-optional and ¬required ⇔ NULLABLE ⇔ TS optional ; exactly one PRIMARY KEY on the identifier ;
        entity.id == Hash(Canonicalize(body)) and any byte change ⇒ a new version.
    Run them; watch them go RED (no entities package, no EmitGo/EmitTS/EmitDDL, no kernel.entity table, no Order
    example). That red IS the /goal for this step. Do NOT write a truth-test you would then satisfy (no inventing
    a new entity invariant you'd grade yourself) — mirror the human intention only (an entity emits a Go struct +
    a TS type + DDL, all faithful to one source).

(c) TDD red → green → refactor in back/kernel/entities ONLY (plus the Atlas migration in back/migrations, and the
    emitted output in back/gen which is PRODUCED by the emitters, never authored). Outside-in. Build: the typed
    Entity AST (name, ordered attributes[] {name, type, required, identifier?, multivalued?}, over a CLOSED
    pinned scalar type set — do NOT invent types ad-hoc), reusing S02's Canonicalize/Hash for the content
    address (do NOT fork it); and three PURE, TOTAL, DETERMINISTIC emitters EmitGo(entity)→[]byte,
    EmitTS(entity)→[]byte, EmitDDL(entity)→[]byte — no I/O, no clock, no RNG — that reject an unknown attribute
    type with an S13 BlockReason (UNKNOWN_ATTRIBUTE_TYPE) rather than guessing. Within the frozen slots, if a
    REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (the N3 source→Go+TS+DDL codegen, sqlc/pgx for DB access, Atlas for migrations, Godog +
    rapid + the fixture/Operation-DSL interpreter for mirrors are FIXED). Likely genuine choices: the entity-JSONB
    canonical shape + the scalar→Go/TS/DDL type-mapping table, and whether to emit Go via text/template vs the
    go/ast+go/format printer (search ≤3, pick simplest — prefer go/format so the struct is gofmt-clean by
    construction). Record a short ADR (docs/adr/) ONLY if a genuine choice is made. The migration is
    expand-only/append-only: add kernel.entity (id=hash PK, body jsonb, version, superseded_by NULL, created_at),
    GRANT the agent role SELECT only on kernel.entity (the wall — an entity is a SOURCE above the line); only the
    aidos writer role inserts an entity via an approved ChangeSet. The emitted DDL is a PROJECTION materialized
    to back/gen and handed to Atlas as a DERIVED migration — never the source, never hand-edited. Code only what
    turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new
    schema-validation fixture + rapid property, biome check at the monorepo root, eslint in front/web. Verify the
    emitted Go in back/gen is itself gofmt-clean and the emitted TS passes biome/eslint (a projection that fails
    its host's sensors is a broken projection). Self-certify on the COMPUTATIONAL only; never declare the
    behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce EmitGo/EmitTS/EmitDDL on the
    Order entity and on the unknown-type case, state the cause, propose. Check completeness: kernel.entity (the
    entity source) has its living mirror (the schema-validation fixture + the property); no monster (no source
    without a mirror, no orphan mirror, no projection that drifts from its source, no hand-edited back/gen) —
    else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/entity-map/ → /entity-map:
    render the Order entity SOURCE (its attributes with type / required / identifier badges) and its THREE
    EMITTED PROJECTIONS side-by-side (Go struct · TS type · DDL), each labelled "derived projection" so one
    source → three faithful outputs is visible (identifier → PK, required → NOT NULL / non-optional, discount →
    NULLABLE / optional). Read via the SELECT-only role; render the emitted artifacts, do NOT re-implement the
    emitters in TS. Do NOT touch existing routes. Add tests/e2e/entity-map.spec.ts (use the playwright-e2e skill)
    asserting the Order source lists its attributes AND all three projection panels are present and non-empty —
    `type Order struct`, `type Order`, and `CREATE TABLE "order"` with PRIMARY KEY on id and discount
    nullable/optional (the done criterion — Go + TS + DDL — visible in the UI).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that entities
    is a deep, well-named module (Entity AST / the scalar type set / EmitGo / EmitTS / EmitDDL / the type-mapping
    table cleanly separated, "one source → three projections" obvious), that the three emitters are pure, total,
    deterministic and REUSE S02's Canonicalize/Hash and S13's BlockReason WITHOUT duplicating them, that the
    migration/GRANT keeps the wall intact (kernel.entity is above the line, agent SELECT-only, only the aidos
    writer inserts), that back/gen stays generated-only (never hand-edited), and that boundaries match
    back/kernel/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package back/kernel/entities (pure logic/schema),
    the Atlas migration (persistence: kernel.entity + the materialized DDL projection), and the Next route
    (visualization), plus the schema-validation fixture + rapid property (behaviour proof). Do NOT add an MCP
    server (the emitters are a pure library; an emit/codegen callable op is a later step — if a real need emerges,
    record an OpenQuestion, do not build it here), do NOT add a new Hook (no non-bypassable rule beyond the
    existing wall GRANT/PreToolUse and the existing "never hand-edit back/gen" anti-overwrite contract), and do
    NOT add a Skill (emitting from a source is the harness's inner codegen, not a new replayable human gesture).
    A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin an attribute, a scalar type, or a
  type-mapping (Go/TS/DDL) that KRD / the entity grammar / the Order example does not state; an attribute of an
  UNKNOWN type is REJECTED with an S13 BlockReason (UNKNOWN_ATTRIBUTE_TYPE), never silently coerced to any/text.
  If the exact entity-JSONB columns, the scalar type set, the scalar→Go/TS/DDL mappings, S02's
  Canonicalize/Hash, S13's BlockReason shape, or the kernel-schema shape are not pinned by KRD / an existing
  migration / a referenced step, do NOT guess — record an OpenQuestion (provenance) and STOP on that branch. The
  `Order` entity and its `discount` attribute are the example pinned by S20/S22; reuse them, do not coin new ids.
- You NEVER write a truth-test (a new entity/projection invariant you would then satisfy — the circularity §58
  is the wall). The fixture and property are means-tests toward the human red (an entity emits a Go struct + a TS
  type + DDL, all faithful to one source), not new truths.
- Any change to a prior contract (S02 records/hash, S04 wall GRANTs, S13 BlockReason, the kernel schema shape,
  the Order example) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior
  artifact, never hand-edit back/gen/** (change the SOURCE and re-emit). An override is a recorded decision
  (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the schema-validation fixtures pass — the Order entity emits a Go struct AND
a TS type AND DDL (THE done criterion: every attribute present in source order with its mapped type; identifier
→ PRIMARY KEY; required → NOT NULL / non-optional; discount → NULLABLE / optional), all three projections agree
on the same source field set (never double-typed), the recorded entity id is the content hash of its body, and
an unknown attribute type is Blocked(UNKNOWN_ATTRIBUTE_TYPE) with nothing emitted; the rapid invariants hold
(determinism, totality, no add/drop/rename, order preserved, required⇔NOT NULL⇔non-optional, exactly one PK on
the identifier, content-address stability); /entity-map renders the Order source + the three emitted projections
with a passing Playwright e2e; the kernel.entity GRANT proves SELECT-only for the agent; back/gen is
generated-only; the migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (schema-validation fixture N2 + rapid property), where stored (mirrors schema) and
  materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /entity-map — what it renders (Order source attributes + the three emitted projections: Go struct,
  TS type, DDL, each marked derived), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to kernel.entity go through the aidos CLI writer role,
  not the agent); any prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. single self-contained entity (no entity-to-entity relations / foreign keys / composes yet),
  no api/operation/policy/control/action wiring, no behavior-macro expansion, no Pact cross-cell contract, DDL
  emitted but not applied (Atlas application is the persistence runner), no emit/codegen MCP, scalar type set
  scope assumption.
- Next safe step: the smallest stable next tooth (e.g. entity-to-entity relations / the api projection from
  entity+operation, or wiring kernel.entity into the red-wave so a bump reddens its three projections first) and
  why it is safe to chain.
```
