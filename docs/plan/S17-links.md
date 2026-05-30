# S17 — Versioned links (projects_to / derives_from / contracts_with / triggers / binds / mirrors)

Subsystem: AIDOS Kernel | Home: `back/kernel/links` | Workbench route: `/link-graph`

## Objectif

Land the **six versioned link types** of KRD §41 — `projects_to`, `derives_from`, `contracts_with`, `triggers`, `binds`, `mirrors` — as a typed, content-addressed Kernel artifact where **every link pins a target by `version@hash`, never by bare identity**, plus a pure `Resolve(link, head)` that reports a link as **stale (red)** the instant it points at a version that is not the current head — and red when it points at a version that is absent entirely. This is the substrate that makes the red wave (§42) fire.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the link rows), a **behaviour proof** (a fixture + property mirror), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/kernel/links/` — the `Link` AST type per KRD §41: `kind ∈ {projects_to, derives_from, contracts_with, triggers, binds, mirrors}` (a closed enum — unknown kinds rejected), `from` = the consuming layer ref `id@version`, `to` = the target ref `id@version` (the **pinned** target — `targetId` + `version`/`hash`, never a bare id). A `Validate(link)` (shape; `kind` ∈ the closed set; both `from` and `to` are well-formed `id@version` refs; refuses a `to` with no version — an unpinned link is itself a monster). A pure `Resolve(link, heads) → LinkStatus` where `heads` is the map `targetId → headVersion`: returns **`green`** iff the target exists **and** `link.to.version == heads[targetId]`; **`stale`/red** iff the target exists but `link.to.version != head` (pinned to a non-head version); **`absent`/red** iff `heads[targetId]` is missing entirely (link to an absent version). No DB calls, no I/O, no clock/RNG — `Resolve` is a pure function over `(link, heads)` so the red wave is deterministic and replayable.
- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration adding the AST table `kernel.link`, a content-addressed append-only row (`id text PRIMARY KEY` = hash of the canonical link JSONB body, `body jsonb NOT NULL` holding `{kind, from, to}`, `version text NOT NULL` = same hash, `superseded_by text NULL`, `created_at timestamptz`), reusing the S02 record substrate / content-hash scheme. The pinned `from`/`to` refs live **inside** the JSONB body (they are version-pinned refs, not foreign keys — a stale link must remain inspectable, so this is deliberately **not** an FK that would forbid the dangling target). GRANTs: the agent DB role gets **SELECT only** on `kernel.link` (the wall, §2; the S04 PreToolUse hook already guards the schema at the schema level). Only the `aidos` CLI writer role inserts a link, via an approved ChangeSet.
- **BDD mirror** — a **fixture** mirror (`state → command → events`: the link rows + a `heads` map → `Resolve` → per-link `green`/`stale`/`absent` status) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (see below).
- **Next route** `front/web/app/link-graph/` → `/link-graph` — the Workbench panel rendering the six-link graph with each edge coloured by its resolved status, and a link to an absent version shown **red** (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no MCP server** — `Resolve` is a pure library, not a new backend capability; computing the full red-wave / impact set across the whole DAG, and the regeneration worklist (§42), is a later step (the `impact` CLI / an `evolve` MCP), not this one. **No hook** — no new non-bypassable rule beyond the existing wall GRANT/PreToolUse; the completeness law and the stable-phase gate are prior/later artifacts. **No Skill** — no replayable human gesture is introduced yet. **No new link semantics** beyond pinning + staleness: the *meaning* of `triggers`/`binds`/`mirrors` (control→action, action→operation, spec→mirror) is owned by S11/S06 and only **referenced** here; this step is the link *substrate and its staleness check*, not the per-kind behaviour. **No codegen/emitters.**

## Test minimal (done)

**Done = a link to an absent version is red.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: kernel.links.Resolve · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "a link pinned to the head is green"
    state   (heads): { "createOrder": "v3" }
    command (link):  { kind: "binds", from: "checkout-submit@v1", to: "createOrder@v3" }
    events:  [ status == green ]

  fixture "a link pinned to a non-head version is stale (red)"
    state   (heads): { "createOrder": "v3" }
    command (link):  { kind: "binds", from: "checkout-submit@v1", to: "createOrder@v2" }
    events:  [ status == stale ]              # consumer pinned to a version that is no longer head (§41)

  fixture "a link to an absent version is red"          # THE done criterion
    state   (heads): { }                                # createOrder has no head — it does not exist
    command (link):  { kind: "binds", from: "checkout-submit@v1", to: "createOrder@v3" }
    events:  [ status == absent ]             # absent target ⇒ red, the link dangles loudly

  fixture "an unpinned link (to has no version) is invalid, not evaluated"
    command (link):  { kind: "mirrors", from: "checkout-button@v1", to: "checkout-button-fixture" }
    events:  [ Validate rejects: link target is not pinned (id@version required) ]

  fixture "an unknown link kind is rejected"
    command (link):  { kind: "depends_on", from: "a@v1", to: "b@v1" }
    events:  [ Validate rejects: unknown link kind "depends_on" (closed set) ]
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: links.Validate/Resolve · test_kind: property · cert_language: rapid · authority: below
  ∀ link:        Validate accepts iff kind ∈ {projects_to,derives_from,contracts_with,triggers,binds,mirrors} ∧ from,to are pinned id@version refs
  ∀ link,heads:  Resolve is deterministic — same (link, heads) ⇒ same status; and status ∈ {green, stale, absent}
  ∀ link,heads:  Resolve(link,heads)==green  ⇔  heads[link.to.id] exists ∧ heads[link.to.id]==link.to.version
  ∀ link,heads:  heads[link.to.id] missing   ⇒  Resolve==absent (a link to an absent version is ALWAYS red)
  ∀ link:        Resolve never panics — a malformed/absent target yields a status, not a crash
  ```

Both start **red** (no `links` package, no `Validate`/`Resolve`, no `kernel.link` table). That red **is** the `/goal`. The fixture mirror is a **means-test toward the human red** (a link to an absent version must be red) — not a new truth the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/link-graph/page.tsx` (new route `/link-graph`; do not touch existing routes). A read-only panel that renders the link rows from `kernel.link` (via the SELECT-only role) as a graph: nodes = layer refs, edges = the six link kinds (each edge labelled with its `kind` and its pinned `to` version). Each edge is coloured by its resolved status against the current `heads`: **green** = pinned-to-head, **red** = stale (non-head) or absent (no head). With the canonical example it shows the `binds` edge `checkout-submit → createOrder@v3` green when `createOrder`'s head is `v3`, and the same edge **red** when `createOrder@v3` is absent — the staleness rendered, not re-implemented.
- **Playwright e2e:** `tests/e2e/link-graph.spec.ts` — navigate to `/link-graph`, assert the six link kinds are present as edges, that the head-pinned `binds` edge is shown green, and that **a link to an absent version is shown red** (the done criterion is visible in the UI). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/links/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/link-graph.spec.ts`, and `front/web/app/link-graph/**` — and otherwise **adds new files**. It defines one new contract (the `Link` AST shape, the closed six-kind set, the `id@version` pinning rule, the `kernel.link` table, the `green`/`stale`/`absent` status); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT. Any change to a **prior contract** it depends on — the S02 record substrate / content-hash scheme, the referenced layer-ref shape (`id@version`), the per-kind semantics owned by S06 (`mirrors`) / S11 (`triggers`, `binds`), the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S17 — "Versioned links (projects_to / derives_from / contracts_with /
triggers / binds / mirrors)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the
agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/links
ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §41 (the six versioned link types — everything points at a VERSION,
not an identity; a stale link = a consumer pinned to a version that is no longer head → red), §42 (la vague
de rouge — the red wave is exactly the set of stale links after a bump; it starts at the mirror), §43 (phase
stable = a cut where every link resolves + all sensors green), §28 (`mirrors` as the sixth link), §23–24
(triggers control→action, binds action→operation — referenced, not redefined here). Read CONTEXT-MAP.md +
back/kernel/CONTEXT.md (Layer, links, source/projection, contracts/ports, completeness law, test-as-goal/
means) and the prior steps' specs (S02 records substrate / content-hash, S04 the wall, S06 mirrors link,
S11 triggers/binds). For any Next.js 16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs.
Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language: a "link" points at a VERSION (id@version / id@hash), never a bare identity — that
    is the whole point (§41); the six kinds are a CLOSED set {projects_to, derives_from, contracts_with,
    triggers, binds, mirrors}; "stale" = pinned to a version that is no longer head (red); "absent" =
    pinned to a target with no head at all (red); "green" = pinned exactly to head. This step delivers the
    link SUBSTRATE + its staleness check (Resolve), NOT the per-kind behaviour (triggers/binds/mirrors
    semantics are owned by S11/S06 and only referenced) and NOT the full red-wave/impact computation across
    the DAG (a later step). Sharpen each term against back/kernel/CONTEXT.md; if a term shifts, update
    CONTEXT.md / write an ADR inline. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/
    for the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = a `heads` map
        (targetId → headVersion); command = a link {kind, from:id@version, to:id@version}; events = the
        resolved status. Cover: head-pinned link ⇒ GREEN ; non-head-pinned link ⇒ STALE (red) ; link to an
        absent version (heads has no entry for the target) ⇒ ABSENT (red) — THE done criterion ; an
        unpinned `to` (no version) ⇒ Validate REJECTS ; an unknown kind ("depends_on") ⇒ Validate REJECTS
        (closed set).
      - PROPERTY (rapid, ∀, below the line): Validate accepts iff kind ∈ the closed six-set ∧ from/to are
        pinned id@version refs; Resolve is deterministic and status ∈ {green,stale,absent}; Resolve==green
        ⇔ head exists ∧ head==pinned version; a missing head ⇒ ALWAYS absent (a link to an absent version
        is always red); Resolve never panics.
    Run them; watch them go RED (no links package, no Validate/Resolve, no kernel.link table). That red IS
    the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new link invariant you'd
    grade yourself) — mirror the human intention only; the fixture is a means-test toward the human red.

(c) TDD red → green → refactor in back/kernel/links ONLY (plus the Atlas migration in back/migrations).
    Outside-in. Build: the typed Link AST (closed kind enum, pinned from/to refs), Validate(link)→error,
    and a pure Resolve(link, heads)→status — no I/O, no clock/RNG; status is a pure function of (link,
    heads). Within the frozen slots, if a REAL tool choice arises, search AT MOST 3 current (May 2026)
    options, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture/Operation-DSL
    interpreter, Atlas, sqlc/pgx are fixed). The likely genuine choices: the canonical link-JSONB shape +
    content-hash (REUSE S02's Canonicalize/Hash — do NOT fork it) and the fixture-file format the runner
    loads (reuse the format S08/S11 established). Record a short ADR (docs/adr/) ONLY if a genuine choice is
    made. The migration is expand-only/append-only and stores the pinned refs INSIDE the JSONB body (NOT as
    foreign keys — a dangling/absent target must stay inspectable so it can be shown red, not be forbidden
    by an FK). GRANT the agent role SELECT only on kernel.link (the wall). Code only what turns the red set
    green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture +
    rapid mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Resolve on the green /
    stale / absent cases, state the cause, propose. Check completeness: kernel.link (the link truth) has its
    living mirror (the fixture + property); no monster (no truth without a mirror, no orphan mirror, no
    UNPINNED link admitted) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/link-graph/ →
    /link-graph: render the kernel.link rows (SELECT-only role) as a graph — nodes = layer refs, edges =
    the six kinds labelled with kind + pinned `to` version, each edge coloured by its status against the
    current heads (green = pinned-to-head; red = stale or absent). Show the head-pinned binds edge green and
    the same edge RED when its target version is absent. Read via the SELECT-only role; render the resolved
    status, do not re-implement it. Do NOT touch existing routes. Add tests/e2e/link-graph.spec.ts (use the
    playwright-e2e skill) asserting the six kinds appear as edges, the head-pinned edge is green, and a link
    to an absent version is shown RED (the done criterion visible in the UI).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that links
    is a deep, well-named module (Link/Validate/Resolve/status separated, the kind set closed and obvious),
    that Resolve is pure and reuses S02's ref/hash scheme without duplicating it, that the migration/GRANT
    keeps the wall intact, and that boundaries match back/kernel/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the fixture + rapid property (behaviour proof), and the Next route
    (visualization). Do NOT add an MCP server, a hook, or a Skill — no new backend capability, non-bypassable
    rule, or replayable gesture is justified at S17 (the wall already guards kernel.*; the red-wave/impact
    MCP is a later step). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The six link kinds are a CLOSED set — do not add a
  kind KRD §41 does not name. If the exact layer-ref shape (id@version vs id@hash), the canonical link-JSONB
  columns, the content-hash scheme, or the head-resolution source (where `heads` comes from) are not pinned
  by KRD / an existing migration / S02's Canonicalize / a referenced step, do NOT guess — record an
  OpenQuestion (provenance) and STOP on that branch. The example targets (createOrder, checkout-submit,
  checkout-button) are reused from S11's pinned artifacts; do not coin new ones.
- You NEVER write a truth-test (a new link invariant you would then satisfy — the circularity). The fixture
  and property are means-tests toward the human red (a link to an absent version is red), not new truths.
- Any change to a prior contract (S02 records/hash, the layer-ref shape, the mirrors/triggers/binds
  semantics, the wall GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite
  a prior artifact, never hand-edit back/gen/**. An override is a recorded decision (ChangeSet + ADR +
  provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the Resolve fixtures pass — a head-pinned link is green, a non-head-pinned
link is stale, AND a link to an absent version is RED (the done criterion); an unpinned link and an unknown
kind are rejected at Validate; the rapid invariants hold (closed-kind/pinned validation, determinism,
green⇔head, absent⇒red, no panic); /link-graph renders the six-kind graph with the head-pinned edge green and
the absent-target edge red, with a passing Playwright e2e; the kernel.link GRANT proves SELECT-only for the
agent; the migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized
  (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /link-graph — what it renders (six-kind graph + per-edge green/stale/absent status), e2e file +
  result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to kernel.link go through the aidos CLI role, not the
  agent); any prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no red-wave/impact computation across the DAG yet, no regeneration worklist, no MCP, no
  hook, per-kind semantics referenced not redefined, head-source assumption.
- Next safe step: the smallest stable next tooth (e.g. the red-wave / impact computation that walks the link
  graph after a bump, or the stable-phase gate that asserts every link resolves) and why it is safe to chain.
```
