# S31 — Memory adapter (pgvector embeddings; episodic / semantic / procedural / structural)

Subsystem: AIDOS Archive | Home: `back/archive/brain/memory` | Workbench route: `/memory-backends`

## Objectif

Give the engine-side `/brain` store a **memory adapter**: write a `MemoryItem` and **recall by similarity** over **pgvector** embeddings, across the four indexable KRD memories — **episodic / semantic / procedural / structural** (KRD §136) — behind one interface with **two injectable backends** (a deterministic mock for tests, a real pgvector backend for the runtime). Memory stays **context fuel, never truth**: this step ships only write + similarity-recall, not any path into the kernel (the MemoryFirewall flow is later, §119.1).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic + an interface** (Go package), **persistence** (Atlas migration for the `brain` schema with the pgvector extension), a **capability** (the `memory` MCP server), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new Hook or a new Skill (justified below).

- **Go package** `back/archive/brain/memory/` — the `MemoryItem` AST + a small **`Store` interface** (`Write(ctx, MemoryItem) → id`, `Recall(ctx, RecallQuery) → []Hit`) with **two implementations behind the same interface, injectable** (constructor injection, no global): a `MockStore` (in-memory, deterministic — embeddings are a fixed stub function, similarity is exact cosine over the stub vectors so a test never depends on a real model) and a `PgxStore` (real, over `brain.memory_item` via sqlc/pgx, ANN over pgvector). `MemoryItem` mirrors KRD §119.1 / §136: `id` (content hash, reused from S01 — do **not** fork the content-hash scheme), `kind` (`episodic | semantic | procedural | structural` — the four **indexable** memories; **working** and **evolutionary** are explicitly out of this slot, see below), `content jsonb`, `embedding vector`, `provenance`, `validity_scope`, `expires_at`, `confidence`, `taint[]` (`unverified | stale | user_claim | incident_derived | external_source`), `branch` (branch-aware), `created_at`. `RecallQuery`: `{ query_embedding, kind?, branch?, k }`; `Hit`: `{ item, score }`. The **embedder is itself an injected port** (`Embedder` interface) so the mock backend needs no model and the real backend can name its model in provenance. Pure logic + a thin pgx adapter; **no** firewall promotion, **no** ContextPack/Idea wiring (those are later).
- **Atlas migration** (`back/migrations/`) — declarative, expand-only / append-only: enable the **`vector`** extension, create the `brain` schema and `brain.memory_item` (`id text PK` = content hash, `kind text NOT NULL CHECK (kind IN ('episodic','semantic','procedural','structural'))`, `content jsonb NOT NULL`, `embedding vector(<dim>) NOT NULL`, `provenance jsonb NOT NULL`, `validity_scope jsonb`, `expires_at timestamptz`, `confidence double precision`, `taint text[] NOT NULL DEFAULT '{}'`, `branch text NOT NULL`, `created_at timestamptz NOT NULL`) plus a pgvector ANN index (HNSW, cosine ops). The embedding **dimension** is a genuine choice → pin it in an ADR, do **not** invent it silently. GRANTs: the agent DB role gets **SELECT + INSERT** on `brain.memory_item` only (the `/brain` store is **fuel, not truth** — it is **below** the wall, §2, so the agent MAY write it — unlike `kernel`/`mirrors`/`fitness`); the agent still gets **no** grant on the truth schemas. Rows are append-only (no UPDATE/DELETE grant); supersession is a new row, expiry is `expires_at`, never an in-place edit.
- **MCP server** `back/mcp/memory/` (Go MCP SDK, one tool = one backend op) — the capability door: `memory_write` (one `MemoryItem`), `memory_recall` (by similarity, `kind`/`branch`-filtered, top-`k`), `memory_get` (read a row for rendering). The Workbench and other agents call these; the server is constructed with whichever `Store` backend is configured (mock for tests, pgx for runtime), proving the injection seam end to end.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — a **write-then-recall fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `state → command → events` proving you can write items across the four kinds and recall the nearest by similarity, run **against both backends** to prove they are interchangeable. Plus a **property invariant** (rapid, `authority: below`) on the `Store` contract. These **are** the done criteria (see below).
- **Next route** `front/web/app/memory-backends/` → `/memory-backends` — the Workbench panel that lists the four memory kinds, lets a human enter a recall query, shows the ranked hits (with score, kind, taint, branch, provenance), and exposes a **backend toggle** (mock vs real) to make the injection seam visible (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **No new Hook** — there is no new non-bypassable rule at this step; the S04 PreToolUse wall already forbids the agent writing the truth schemas, and `/brain` is deliberately below the wall (writable). **No Skill** — write/recall are exercised through the `memory` MCP tools + the standard per-step loop; not yet a distinct repeatable multi-step gesture warranting a `SKILL.md` (record an OpenQuestion if one emerges). **No MemoryFirewall promotion** (§119.1) — the `Memory → ContextPack → Idea → Mirror → Goal → Kernel` flow that lets a `MemoryItem` *propose* a truth is a **later** tooth; here memory is recall-only fuel and touches nothing above the wall. **No ContextGraph / ContextRouter / ContextPack** (§142/§144, Livre XXV) — building the control plane that decides reuse is a separate step; this step only writes and recalls items. **No working / evolutionary memory** — working memory is the live context window (no store), evolutionary memory is the S24 version DAG (already its own structure); only the four indexable kinds are in this adapter. **No ArchiveCurationPolicy** (keep/compress/tombstone) — curation of the store is later. **No codegen** — nothing is emitted from the store.

## Test minimal (done)

**Done = you can write a `MemoryItem` and recall the nearest by similarity, and both the mock and the real backend are injectable behind one interface (the fixture passes against each).** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Write-then-recall fixture** (`cert_language: fixture`, `authority: above`) — reflects `brain.memory_item` and the `Store` interface, as `state → command → events`, parametrized over `backend ∈ { mock, pgx }`:

  ```
  # mirrors schema · reflects: brain.memory_item + memory.Store "memory-write-recall" · test_kind: fixture · authority: above
  mirror reflects "memory-write-recall" {

    given store { backend: <param>, items: [] }
      when write { kind: "semantic", content: {term: "cart"}, branch: "main" }
        -> events: [ Written ]
        -> item exists { id == content_hash(content), kind: "semantic" }   # id reuses S01 hashing

    given store { backend: <param>, items: [
        episodic{about: "incident-42"}, semantic{term: "cart"},
        procedural{skill: "grill-with-docs"}, structural{map: "context-map"} ] }
      when recall { query: ~semantic{term: "shopping cart"}, k: 2 }
        -> events: [ Recalled ]
        -> hits[0].item.kind == "semantic"          # nearest by similarity is the cart term
        -> len(hits) == 2 && hits ordered by score desc

    # kind / branch filters narrow the recall set
    given store { backend: <param>, items: [ semantic@main, semantic@branch-x, episodic@main ] }
      when recall { query: ~semantic, kind: "semantic", branch: "main", k: 5 }
        -> hits all { kind: "semantic", branch: "main" }   # the branch-x and episodic rows are excluded

    # append-only: a superseding write is a NEW row, the old one is still recallable
    given store { backend: <param>, items: [ semantic{term: "cart", confidence: 0.4} ] }
      when write { kind: "semantic", content: {term: "cart"}, confidence: 0.9, branch: "main" }
        -> events: [ Written ]
        -> store.count == 2                          # never an in-place edit (THE append-only case)
  }
  ```

  The fixture runs **twice** — once with `backend: mock` (deterministic stub embedder, exact cosine), once with `backend: pgx` against a **Testcontainers** Postgres with the `vector` extension (real ANN). Both must pass identically; that identity **is** the "both backends injectable" done criterion.

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any set of writes followed by a recall, the `Store` contract holds for **both** backends: `Recall(k)` returns **at most `k`** hits, **ordered by score descending**; every hit's `kind`/`branch` matches the query filter when one is set; a `Write` returns an `id` equal to the **content hash** of the item body (content-addressing, reused from S01) and the item is then **recallable**; the store is **append-only** (a superseding write **increments** the row count, never replaces — write count is monotonically non-decreasing; no operation deletes a row); `taint` round-trips intact; recall **never** crosses into the truth schemas (the store reads/writes `brain.memory_item` only). The mock and pgx backends are **observationally equivalent** on the recall ordering for the fixture vectors.

All start **red** (no `memory` package, no `Store` interface, no `brain` schema / `vector` extension, no `memory` MCP, no `/memory-backends` route). That red **is** the `/goal`. The canonical done case is green only when a `MemoryItem` written across the four kinds can be recalled nearest-first by similarity, the `kind`/`branch` filters narrow the set, a superseding write appends rather than overwrites, and the **same fixture passes against both the mock and the pgx backend** — i.e. **write/recall by similarity works, and the mock and real backends are injectable.**

## Visualisation UI

- **Workbench route:** `front/web/app/memory-backends/page.tsx` (new route `/memory-backends`; do **not** touch existing routes). It renders the `/brain` memory adapter: the **four memory kinds** (episodic / semantic / procedural / structural) as filter chips; a **recall query** input; the **ranked hits** list (each hit shows `score`, `kind`, `branch`, `taint[]`, `provenance` — so a human sees memory is *fuel with provenance*, never silent truth); and a visible **backend toggle** (mock ↔ real) that re-runs the recall through the other `Store`, making the injection seam observable. A banner states "context fuel, never truth — nothing here reaches the kernel without a mirror" (the MemoryFirewall reminder). Reads via the `memory_recall` / `memory_get` MCP tools; renders results, does not re-implement similarity.
- **Playwright e2e:** `tests/e2e/memory-backends.spec.ts` — navigate to `/memory-backends`, assert the four kind chips are present; enter a recall query and assert the hits list is ordered by score (descending) with the nearest item first; filter by `kind: semantic` and assert only semantic hits remain; flip the backend toggle (mock ↔ real) and assert the same top hit returns (the backends are interchangeable); assert each hit shows its `taint`/`provenance` and that the "fuel, never truth" banner is present. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/brain/memory/**`, the new `back/migrations/<new>.sql`, the new `back/mcp/memory/**`, the `mirrors`-stored write-recall fixture/property materialized to `tests/`, `tests/e2e/memory-backends.spec.ts`, and `front/web/app/memory-backends/**` — and otherwise **adds new files**. It introduces a new contract (the `brain.memory_item` shape, the `Store` / `Embedder` interfaces, the `kind` enum of the four indexable memories, the similarity-recall semantics, the append-only "supersession is a new row" guarantee) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; a superseding `MemoryItem` is an **INSERT**, never an in-place UPDATE/DELETE. Any change to a **prior contract** it depends on — the S01 content-hash scheme, the S04 wall GRANT set, the shared entity/codegen source — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance).

## Prompt a lancer

```text
You are step-executor for AIDOS step S31 — "Memory adapter (pgvector embeddings; episodic/semantic/
procedural/structural)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the
agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home =
back/archive/brain/memory ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §136 ("Les six mémoires KRD" — the table: working / episodic /
semantic / procedural / structural / evolutionary, each with its substrate, "peut éditer le noyau ?" =
NON for all the indexable ones, and its promotion rule; this step ships ONLY the four indexable kinds —
episodic/semantic/procedural/structural — NOT working memory, NOT evolutionary), §119.1 ("MemoryFirewall
— la mémoire propose, le noyau déclare le vrai": the MemoryItem shape — content, provenance,
validity_scope, expires_at, confidence, taint[unverified|stale|user_claim|incident_derived|
external_source] — and the MANDATORY flow Memory → ContextPack → Idea → Mirror → Goal → Kernel; "Aucun
MemoryItem ne peut entrer dans /kernel sans passer par Idea → Mirror → Goal → Kernel" — but that
promotion flow is a LATER step, NOT this one). Read CONTEXT-MAP.md + back/archive/CONTEXT.md (the `/brain`
store = "the engine-side store of the six KRD memories, branch-aware and indexable, context fuel, NEVER
truth", at back/archive/brain/; MemoryFirewall = "the gate that prevents memory from posing as truth";
the human cockpit over /brain lives in the Workbench, NOT here). Read the prior Archive steps you REUSE:
S01 (the content-addressed append-only content store — reuse its content-hash scheme for MemoryItem ids,
do NOT fork it) and S24 (the version DAG = evolutionary memory — do NOT re-implement evolutionary memory
here, it is already its own structure). For any Next.js 16, Atlas, pgvector, Go MCP SDK, sqlc/pgx, rapid,
or Testcontainers-Go API doubt use context7 or node_modules/next/dist/docs. Do not start without
grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/archive/CONTEXT.md: the `/brain` store is CONTEXT FUEL, NEVER truth —
    it is branch-aware and indexable but NON-DECISOIRE (an item can fail a run only once promoted to a
    mirror or sensor, which is a LATER step). A MemoryItem is fuel with provenance, validity_scope,
    confidence and TAINT — not a fact. "Recall" = retrieve the nearest items by similarity; it is NOT a
    truth lookup, NOT a RAG that decides. The four kinds handled here are the INDEXABLE memories of §136 —
    episodic (runs/incidents), semantic (ubiquitous language/glossary/patterns), procedural (reusable
    gestures/skills), structural (context map/dependency graphs); working memory (the live context window,
    no store) and evolutionary memory (the S24 version DAG) are OUT of this adapter. Do NOT use "database",
    "truth store", "RAG store", "knowledge base", "ACL", "sanitizer", or "validation layer" as synonyms
    (CONTEXT.md _Avoid_ lists). Resolve every branch before coding — especially: similarity-recall here is
    fuel only and reaches NOTHING above the wall (the MemoryFirewall promotion flow is later); the store is
    BELOW the wall so the agent MAY write it (unlike kernel/mirrors/fitness); a superseding item is a NEW
    row (append-only), expiry is expires_at, never an in-place edit; the embedding model is an INJECTED
    port so tests need no real model. If a term shifts, update CONTEXT.md / write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - write-then-recall fixture (cert_language: fixture, authority: above), reflecting brain.memory_item
        + the memory.Store interface, as state→command→events, PARAMETRIZED over backend ∈ {mock, pgx} and
        run against BOTH. Rows: write a semantic item -> Written, id == content_hash(content) (reuse S01),
        item exists ; recall with k=2 over the four kinds -> Recalled, nearest-by-similarity first, hits
        ordered by score desc, len ≤ k ; recall with kind+branch filters -> only matching-kind,
        matching-branch hits (others excluded) ; a superseding write -> Written, store.count increments
        (NEW row, never an in-place edit — THE append-only case). The pgx run uses a Testcontainers
        Postgres with the `vector` extension; the mock run uses a deterministic stub embedder + exact
        cosine. Both must pass identically (= "both backends injectable").
      - property invariant (rapid, authority: below), for BOTH backends: Recall(k) returns ≤ k hits ordered
        by score desc ; kind/branch filters always hold ; Write returns id == content hash of the body
        (reuse S01) and the item is then recallable ; the store is append-only (a superseding write
        increments the row count, no op deletes a row) ; taint round-trips intact ; recall touches ONLY
        brain.memory_item (never the truth schemas) ; mock and pgx are observationally equivalent on recall
        ordering for the fixture vectors.
    Run them; watch them go RED (no memory package, no Store interface, no brain schema / vector extension,
    no memory MCP). That red IS the /goal. Do NOT write a truth-test you would then satisfy — mirror the
    human intention (write + recall fuel) only.

(c) TDD red→green→refactor, in back/archive/brain/memory ONLY (plus the back/migrations/ schema file and
    back/mcp/memory/). Outside-in. REUSE S01's content-hash scheme for MemoryItem ids (do NOT fork it);
    do NOT re-model evolutionary memory (that is S24's version DAG). Define ONE Store interface
    (Write/Recall) with TWO injectable implementations (MockStore deterministic; PgxStore over pgvector via
    sqlc/pgx) and an injected Embedder port — wire injection by constructor, no global. If a real tool
    choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST,
    never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx,
    Testcontainers-Go, the Go MCP SDK, Go hook binaries are FIXED; pgvector is the frozen embedding store).
    The likely genuine choices: the pgvector INDEX type (HNSW vs IVFFlat) and distance op (cosine vs L2 vs
    inner-product); the embedding DIMENSION (do NOT invent it — pin it); whether the recall filter is a SQL
    WHERE on kind/branch or a post-filter. Record a short ADR (docs/adr/) ONLY if a genuine choice is made
    (e.g. index type + distance op, or the embedding dimension). The migration enables the `vector`
    extension, creates the `brain` schema + brain.memory_item + the ANN index, is expand-only/append-only,
    and reuses the S01 content-hash for ids; GRANT the agent role SELECT + INSERT on brain.memory_item ONLY
    (the /brain store is BELOW the wall — fuel, writable — but the agent still gets NO grant on
    kernel/mirrors/fitness; no UPDATE/DELETE grant — append-only). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture (both backends) + property. Self-certify on the
    COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce write + recall on each
    fixture row (write-semantic, recall-nearest, kind/branch-filter, superseding-append) on BOTH backends,
    state the cause, propose. Check completeness: the memory layer has its living mirror and each required
    test_kind is present (KRD §33); no monster (no Store method without its fixture row; no item field
    without a property covering it; no backend without the fixture proving equivalence); the append-only
    invariant actually holds (a superseding write inserts, never edits) — else Stop blocks. Do not finish a
    code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/memory-backends/ →
    /memory-backends: render the four memory kinds as filter chips, a recall query input, the ranked hits
    list (each hit shows score / kind / branch / taint[] / provenance — memory is fuel WITH PROVENANCE), a
    visible backend toggle (mock ↔ real) that re-runs recall through the other Store (the injection seam,
    made observable), and a "context fuel, never truth — nothing here reaches the kernel without a mirror"
    banner. Read via the memory_recall / memory_get MCP tools; render results, do not re-implement
    similarity. Do NOT touch existing routes. Add tests/e2e/memory-backends.spec.ts (use the playwright-e2e
    skill) asserting: the four kind chips present ; recall returns hits ordered by score desc with the
    nearest first ; kind:semantic filter leaves only semantic hits ; flipping the backend toggle returns the
    same top hit (interchangeable) ; each hit shows taint/provenance ; the "fuel, never truth" banner is
    present.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    memory is a deep, well-named module; that Store is a clean port with two genuinely interchangeable
    adapters (mock/pgx) and an injected Embedder, depending on S01's content store without duplicating it;
    that the migration/GRANTs keep the wall intact (no grant on truth schemas; SELECT+INSERT only on
    brain.memory_item; no UPDATE/DELETE); that the memory MCP owns exactly one concern (write/recall of
    fuel); boundaries match back/archive/CONTEXT.md (the /brain store = fuel never truth; MemoryFirewall
    promotion, ContextGraph/Router, ArchiveCurationPolicy are LATER steps). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic + the Store/Embedder
    interface), the Atlas migration (persistence: vector extension + brain schema), the memory MCP server
    (capability), the write-recall fixture + property (behaviour proof), and the Next route (visualization).
    Do NOT add a Hook (no new non-bypassable rule — the S04 wall already covers truth, and /brain is
    deliberately below the wall / writable), no Skill (no distinct repeatable gesture beyond the MCP tools +
    the standard loop), no MemoryFirewall promotion flow (§119.1 — Memory → ContextPack → Idea → Mirror →
    Goal → Kernel is the next/later tooth), no ContextGraph/ContextRouter/ContextPack (Livre XXV is
    separate), no ArchiveCurationPolicy, no working/evolutionary memory. A new artifact may ADD a guardrail,
    never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If the exact brain.memory_item shape, the
  embedding DIMENSION, the pgvector index type / distance op, the kind enum, or the taint values is not
  pinned by KRD §136/§119.1 / an existing migration (S01) / ADR / CONTEXT.md, do NOT guess — record an
  OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a MemoryFirewall
  promotion path (it is later), do NOT invent a kernel/mirrors write (the store is fuel, NEVER truth — and
  the agent has no grant there anyway), do NOT invent working/evolutionary-memory handling here, do NOT add
  an UPDATE/DELETE path (the store is append-only — supersession is a new row), and do NOT reach into the
  kernel/mirrors/fitness schemas.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The write-recall
  fixture is a means-test toward the human red (write + recall fuel), not a new truth.
- Any change to a prior contract (S01 content-hash scheme, the S04 wall GRANTs, the shared entity/codegen
  source) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact,
  never hand-edit back/gen/**. A MemoryItem is append-only — never edit or delete it in place.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the write-then-recall fixture passes against BOTH backends — a
MemoryItem written across the four kinds (episodic/semantic/procedural/structural) has id ==
content_hash(content) (reuse S01) and is then recallable; recall returns the nearest-by-similarity item
first, ordered by score desc, len ≤ k; the kind/branch filters narrow the set; a superseding write
INSERTS a new row (store.count increments) rather than editing (THE append-only done case); the mock and
pgx backends pass the same fixture identically (THE "both backends injectable" done criteria); the rapid
invariant holds for both backends (≤ k hits, score-ordered, filters honoured, id == content hash,
append-only, taint round-trips, no truth-schema access, mock≡pgx ordering); /memory-backends renders the
four kinds, ranked hits with score/kind/branch/taint/provenance, the backend toggle, and the "fuel, never
truth" banner, with a passing Playwright e2e; GRANTs prove SELECT+INSERT only on brain.memory_item and NO
grant on the truth schemas; the migration is append-only/expand-only and enables the vector extension. You
cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (write-recall fixture parametrized over {mock,pgx}, rapid Store-contract
  property), where stored (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (fixture×2 backends, rapid/go test, Testcontainers pgx run, biome,
  eslint, playwright).
- UI route: /memory-backends — what it renders (four kind chips, ranked hits with score/kind/branch/taint/
  provenance, backend toggle, fuel-never-truth banner), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED of any envelope opened during the step; any prior-contract
  change (S01 content-hash, wall GRANTs, codegen source) → ChangeSet + SemanticDiff (note the
  change_type), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no MemoryFirewall promotion flow yet (§119.1), no ContextGraph/ContextRouter/
  ContextPack yet (Livre XXV), no ArchiveCurationPolicy (keep/compress/tombstone) yet, no working/
  evolutionary memory in this adapter, embedding dimension + pgvector index/distance chosen (ADR ref).
- Next safe step: the smallest stable next tooth (e.g. the MemoryFirewall path Memory → ContextPack → Idea
  proposing a candidate-truth, §119.1; or the ContextRouter compiling a minimal ContextPack from recalled
  items, §144) and why it is safe to chain.
```

## Addendum (ADR 0008) — native pgvector, ports kept swappable; claude-mem is NOT this

The brain backend is **native pgvector on the Postgres truth-store** — reuse is **library-level** (`pgvector-go`/pgx for the vector type + HNSW ANN, sqlc for typed recall, Atlas for the expand-only migration, Testcontainers with real pgvector), **never an external memory service**. **claude-mem is Layer A** (the memory of the agent *building* AIDOS) — **not** this brain; do not wire it as the S31 backend.

Keep the `Store` + `Embedder` **ports** (`MockStore` + `PgxStore`) so a mature recall backend stays a *possible later swap* — e.g. Letta's `passages.insert/search` (RRF), called over HTTP behind `PgxStore`, **sleep-time agents disabled, `core_memory_*` never called** — but **only** after a recorded spike behind the wall proves it earns its keep, and only if it satisfies content-addressing + append-only + taint-preservation **by construction** (ADR 0008). It is a `replaceable` adapter, never the frozen choice.

Pin **before coding** (small ADR): the **embedding model + dimension**, index = **HNSW**, distance = **cosine** (a later model change forces a reindex of the append-only table). Resolve **before S33**: the confidence-scale seam — S31's numeric confidence vs KRD §138 ordinal (`observed_once | repeated | proven_by_sensor`) that S33's ContextRouter filters on; pick one shape the store and router both speak. `/grill-with-docs` both before writing code.
