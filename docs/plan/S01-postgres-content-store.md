# S01 — Postgres + Atlas baseline & content-addressed append-only store

Subsystem: AIDOS Archive | Home: `back/archive/contentstore` | Workbench route: `/store`

## Objectif

Stand up the Postgres + Atlas baseline and the foundational **content store**: write and read an object by its content hash, where editing an object produces a *new* hash (append-only `content`), with a mutable `head` pointer and an append-only `history` of head moves. This is the substrate every later truth schema (kernel, mirrors, changesets, dag) sits on; here we build only the generic content-addressed object store, not any truth schema.

## Sortie attendue

Per CLAUDE.md §5, only these artifacts apply to this step:

- **Postgres migration (Atlas, declarative, expand-contract, append-only)** — `back/migrations/` — baseline `archive` schema with three tables: `content` (immutable, PK = `hash`), `head` (mutable pointer `key → hash`), `history` (append-only log of every head move: `key, hash, parent_hash, created_at`). No `UPDATE/DELETE` privilege on `content`/`history` for the agent role.
- **Go package (pure logic + sqlc + pgx)** — `back/archive/contentstore/` — `Put(bytes) → hash`, `Get(hash) → bytes`, `SetHead(key, hash)`, `GetHead(key) → hash`, `History(key) → []HeadMove`. Hashing is content-addressed (SHA-256, hex); `Put` of identical bytes is idempotent (same hash, no duplicate row); a changed payload under the same `key` yields a new hash and a new `head`/`history` row. sqlc generates typed queries from SQL into `back/gen/` (never hand-edited), pgx is the driver.
- **MCP server (Go MCP SDK, one tool = one backend op)** — `back/mcp/store/` — read/write capability over the store: tools `store_put`, `store_get`, `store_set_head`, `store_get_head`, `store_history`. This is the *capability* door the Workbench and other agents call; it carries no truth-write grant (the `archive` content store is below the wall, but writes still flow through this single server).
- **BDD mirror (stored in `mirrors` schema, materialized to disk for the runner)** — `tests/archive/content_store.feature` (+ Godog steps in `back/archive/contentstore/`) for the journey, and a **rapid** property test for the content-addressing invariant.
- **Testcontainers (Go)** — real Postgres spun up in-process so Put/Get/head/history are verified end-to-end against actual Postgres + the applied Atlas migration, not a mock.
- **Next route (Workbench)** — `front/web/app/store/` — the `/store` panel that lists objects by hash and shows an object's body + head history.

> Not in scope (do **not** create this step): any Skill (no repeatable gesture yet beyond the standard loop), any new Hook (the wall hook is a later step; this step adds no non-bypassable rule of its own), and any kernel/mirrors/fitness truth schema. If a gesture or guardrail genuinely emerges, record it as an OpenQuestion rather than inventing it.

## Test minimal (done)

Done is **computed** (red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster), never declared. Restated as a failing-first BDD mirror written before any code:

**Journey (Gherkin / Godog), red first** — `tests/archive/content_store.feature`:

```gherkin
Feature: Content-addressed append-only store
  As the Archive, I store objects by content hash so nothing is ever destroyed.

  Background:
    Given a Postgres instance with the archive baseline migration applied

  Scenario: Write then read an object by its hash
    When I put the bytes "hello" into the store
    Then I get back a content hash
    And reading that hash returns exactly the bytes "hello"

  Scenario: Putting identical bytes is idempotent
    When I put the bytes "hello" twice
    Then both puts return the same hash
    And the content table holds exactly one row for that hash

  Scenario: Editing an object creates a new hash, old hash still readable
    Given I put the bytes "v1" under head "doc"
    When I put the bytes "v2" under head "doc"
    Then the head "doc" now points at the hash of "v2"
    And the hash of "v1" still reads back "v1"
    And the history of "doc" lists both moves oldest-first
```

**Invariant (rapid property test), red first** — for all byte slices `b`: `Get(Put(b)) == b`, and `Put(b)` is deterministic (same `b` ⇒ same hash) and collision-free over the generated sample. The content store never overwrites `content`: a second `Put` of different bytes leaves the first row intact.

**Infra (Testcontainers)** — the entire suite runs against a throwaway real Postgres with the Atlas migration applied; **testcontainers green** is part of done. The mirror starts **red** (no schema, no package) — that red **is** the `/goal`.

## Visualisation UI

- **Workbench route:** `front/web/app/store/page.tsx` at `/store`. A read-only panel: left, a list of objects (short hash + size + first head key); right, the selected object's raw body and its head history (key, hash, parent, timestamp). It reads through the `store` MCP server / a thin Next route handler — it never writes truth and touches no existing route.
- **Playwright e2e:** `tests/e2e/store.spec.ts` (via the `playwright-e2e` skill, `playwright.config.ts` `webServer` already serves `front/web`). Covers: seed two objects (`v1` then `v2` under the same head), navigate to `/store`, assert both hashes are listed, click the head, assert the body shows `v2` while the prior hash still resolves to `v1`, and assert the history shows both moves oldest-first. Red before the route exists.

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: `back/migrations/` (new baseline), `back/archive/contentstore/`, `back/mcp/store/`, `back/gen/` (generated), `tests/archive/content_store.feature`, `front/web/app/store/`, `tests/e2e/store.spec.ts`. It establishes the first `archive` contract; it does **not** modify any prior contract (there is none above it). Per CLAUDE.md §9, any later change to *this* step's published contract (the `archive` schema shape, the `contentstore` package surface, the MCP tool signatures) must go through a **ChangeSet** plus a **SemanticDiff** — never a silent rewrite, never a hand-edit of `back/gen/`, never a destructive `UPDATE/DELETE` on `content`/`history`. Migrations are expand-contract and append-only.

## Prompt a lancer

```text
ROLE: step-executor for AIDOS step S01 (Archive — Postgres + Atlas content-addressed append-only store).
Home (the ONLY package you may build in): back/archive/contentstore. Read CLAUDE.md, KRD.md, CONTEXT-MAP.md and back/archive/CONTEXT.md (or the Archive glossary) before touching anything. Follow the §6 per-step loop IN ORDER. Do not go prompt → code.

(a) GRILL-WITH-DOCS THE INTENTION FIRST.
Run /grill-with-docs on this single intention: "write and read an object by content hash; editing produces a new hash; head is mutable, content and history are append-only." Keep it to ≤ 5 scenarios. Sharpen the ubiquitous language (object, hash, head, history, head-move, content-addressed, append-only) against the Archive CONTEXT.md and update it / an ADR inline as decisions crystallise. Resolve: hash algorithm and encoding, what a "head key" is, idempotent Put semantics. Do NOT invent a target/targetId/business-rule you were not given — any unknown becomes an OpenQuestion recorded in CONTEXT.md, not a guess in code.

(b) WRITE THE RED BDD MIRROR (before code), conceptually stored in the mirrors schema and materialized to disk for the runner:
  - Journey: tests/archive/content_store.feature (the three scenarios in "Test minimal (done)"), run by Godog.
  - Invariant: a rapid property test — ∀ bytes b: Get(Put(b)) == b, Put deterministic, no overwrite of content.
Run them. Confirm they are RED (no schema, no package). That red IS the /goal.

(c) /tdd RED → GREEN → REFACTOR, in back/archive/contentstore ONLY (and back/gen for generated code). Outside-in.
  - Tool search at step start, only because a real choice exists: within the FROZEN slots (Atlas migrations · sqlc+pgx · Go MCP SDK · Testcontainers-Go), search at most 3 current (May 2026) options for the ONE genuinely open sub-choice (e.g. sqlc config / pgx pool helper / testcontainers-go postgres module version), compare, pick the SIMPLEST, and record an ADR (docs/adr/000N-*) only if a real choice was made. Never substitute a mandatory slot; never search globally for future steps.
  - Write the Atlas baseline (archive schema: content / head / history; append-only; no UPDATE/DELETE grant on content/history for the agent role). Apply it via Testcontainers real Postgres.
  - Implement Put/Get/SetHead/GetHead/History with sqlc-generated queries + pgx. Drive entirely from the red mirror to green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse). Self-certify on the computational only. gofmt/biome clean; no hand-edited back/gen.

(e) /diagnose before finishing — you do not finish a code step without it. Isolate any failing sensor or flaky Testcontainers run, propose the fix, confirm green ∧ prior green intact.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is required this step; do not touch existing routes):
  - front/web/app/store/page.tsx at /store — read-only: object list by hash + selected object body + head history. Reads via the store MCP server / a thin Next route handler; writes no truth.
  - tests/e2e/store.spec.ts via the playwright-e2e skill: seed v1 then v2 under one head, assert both hashes listed, head points at v2, prior hash still reads v1, history oldest-first. Red before the route, green after.

(g) /improve-codebase-architecture before declaring the step done — you do not move on without it. Look for deepening/consolidation in contentstore informed by the Archive CONTEXT.md and docs/adr/.

(h) CREATE ARTIFACTS PER §5: this step legitimately creates the Atlas migration, the contentstore Go package, the store MCP server, the BDD mirror, and the /store Next route. Do NOT add a Skill or Hook unless a repeatable gesture or non-bypassable rule genuinely emerged (it likely did not) — if it did, an added guardrail only, never a removed one; otherwise record an OpenQuestion.

HONESTY RULES (anti-Goodhart, §8): never invent a target, targetId, or business-rule you were not given; uncertainty becomes an OpenQuestion in CONTEXT.md, not an assumption baked into a test or schema. You never write a truth-test you then satisfy. "Done" is COMPUTED, never declared: red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster (every layer has its living mirror, no orphan). Testcontainers must be green.

DONE CRITERIA: Put/Get by hash works against real Postgres; identical bytes are idempotent (one row); editing under a head yields a new hash with the old hash still readable and history oldest-first; the rapid invariant holds; Testcontainers green; /store renders the objects + head history and its Playwright e2e passes.

END WITH THE STEP REPORT (exact headings):
- BDD added: which mirrors (feature scenarios + rapid invariant) were written, and that they were red first.
- Tests run: Godog / rapid / go test / Testcontainers / Playwright results (counts, pass/fail).
- UI route: /store — what it shows, e2e status.
- ChangeSet status: DRAFT/APPLIED/REVERTED for any contract touched (here: first archive contract established; none superseded).
- Red-set status: red → green, prior green intact, mutation score vs threshold, monster check.
- Known limits: what is deliberately out of scope or stubbed/mocked, and any OpenQuestions raised.
- Next safe step: the smallest chainable step that consumes this stable phase (e.g. S02 changesets on top of the content store).
```

## Scope note — artifact accretion (ADR 0009) for S01

S01's own artifact accretion is **bounded** to its direct need: expose the content-store ops as the **MCP `store`** server (`back/mcp/store`, Go MCP SDK — write/get-by-hash/list ; ADR 0009 "every backend op is an MCP tool"), plus the `/store` Workbench route + Playwright e2e. **Do NOT** attempt the broad foundational skill/agent/hook/MCP inventory inside this step — that upfront S00–S01 batch is generated by a **separate artifact pass** (a dedicated workflow), so this executor stays focused on the content store + its MCP + UI. If near your turn budget, emit your StructuredOutput report (done/blocked) rather than starting the big inventory.
