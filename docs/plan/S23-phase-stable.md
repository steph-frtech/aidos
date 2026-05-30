# S23 — Stable phase (coherent DAG cut) + `aidos stable`

Subsystem: AIDOS Archive | Home: `back/archive/phases` | Workbench route: `/phase-stable`

## Objectif

Land the **stable phase** of KRD §43 — a coherent cut in the version DAG: one version selected per constraint such that **every link resolves in that selection AND every sensor is green at once** — as a content-addressed Archive artifact plus a pure `IsStable(cut, links, sensors) → StablePhase` decision and the `aidos stable` CLI that records the cut. The done criterion: an **empty phase is stable**, and **any red mirror makes the cut unstable**.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the phase rows), a **capability** (the `aidos stable` CLI verb that computes + records the cut), a **behaviour proof** (a fixture + property mirror), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/archive/phases/` — the `StablePhase` AST per KRD §43: a `cut` = the selection `constraintId → version` (one version per constraint), a `sensor_status` snapshot (each green/red certification result over that cut, reusing S07's sensor result shape), and a derived `stable bool` + `reasons`. A pure `IsStable(cut, heads, links, sensors) → StablePhase` where: it reuses S17's `Resolve(link, heads)` to test that **every** link in the cut resolves **green** (no `stale`, no `absent` — no dangling link), AND that **every** sensor in the snapshot is green; `stable == true` iff both hold. The **empty cut** (no constraints, no links, no sensors) is **vacuously stable** (the done base case). **Any single red mirror** (a sensor whose result is red, or a link that resolves `stale`/`absent`) flips `stable` to **false** and records the offending id in `reasons`. No DB calls, no I/O, no clock/RNG — `IsStable` is a pure function over `(cut, heads, links, sensors)` so the cut decision is deterministic and replayable. The phase **version = the content hash of the canonical cut body** (reuse S02's `Canonicalize`/`Hash`, do not fork it) — a stable phase is content-addressed, the kernel's lockfile.
- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration adding the AST table `dag.stable_phase` (the DAG node per Archive CONTEXT.md: stable phases are nodes, ChangeSets are edges): `id text PRIMARY KEY` = hash of the canonical cut body, `body jsonb NOT NULL` holding `{cut, sensor_status, stable, reasons}`, `version text NOT NULL` = same hash, `parent text NULL` (the prior phase node — the DAG edge endpoint, append-only), `created_at timestamptz`. The cut/selection lives **inside** the JSONB body (it is a set of version-pinned refs, not foreign keys — a recorded phase must stay inspectable even after the head moves). GRANTs: the agent DB role gets **SELECT only** on `dag.stable_phase` (the wall, §2; `dag` is a truth schema above the line). Only the `aidos` CLI writer role inserts a phase node, via an approved ChangeSet.
- **`aidos stable` CLI verb** (`back/cmd/aidos/`, the capability per §5) — reads the current cut (the heads + links from `kernel`, the latest sensor results from S07) **via the SELECT-only role**, runs `IsStable`, and **prints** the verdict (stable / unstable + the `reasons` list of offending links/sensors). Recording the phase node into `dag.stable_phase` is performed **only through the `aidos` writer role inside a ChangeSet** (the agent's role cannot write `dag`). `aidos stable` is the mechanical answer to "is this a stable phase?" = "all links resolved + all green?".
- **BDD mirror** — a **fixture** mirror (`state → command → events`: a cut + its links + its sensor snapshot → `IsStable` → `stable` + `reasons`) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (see below).
- **Next route** `front/web/app/phase-stable/` → `/phase-stable` — the Workbench panel rendering the latest cut: each constraint with its selected version, each link coloured by its resolved status, each sensor green/red, and a top-level **STABLE / UNSTABLE** badge with the `reasons` (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — `IsStable` is a pure library and `aidos stable` is a CLI verb, not a new backend service (the `dag` MCP that walks branches/reverts/merges is a later step). **No hook** — the completeness law, the wall GRANT and the PreToolUse guard are prior artifacts; this step adds no new non-bypassable rule. **No Skill** — no replayable human gesture is introduced. **No new link semantics, no red-wave/impact computation** — the staleness of a single link is owned by S17 (`Resolve`) and only **consumed** here; this step is the *aggregate cut decision over already-resolved links + sensors*, not per-link behaviour and not the regeneration worklist (§42). **No branch/merge/revert of the DAG, no quality-diversity/curation** (§44.4) — only the single stable-phase node + its `parent` edge; branches, semantic merge and `ArchiveCurationPolicy` are later Archive steps. **No global/federation stability** (§43 fractal) — local (cell) stability only. **No codegen/emitters.**

## Test minimal (done)

**Done = an empty phase is stable, and any red mirror makes the cut unstable.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: archive.phases.IsStable · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "an empty phase is stable"                       # THE base done criterion
    state   (cut):     { constraints: {}, links: [], sensors: [] }
    command (compute): IsStable(cut, heads={}, links, sensors)
    events:  [ stable == true, reasons == [] ]             # vacuously stable — no link pends, nothing is red

  fixture "a cut where every link resolves and every sensor is green is stable"
    state   (cut):     { constraints: { "createOrder": "v3" } }
    state   (heads):   { "createOrder": "v3" }
    state   (links):   [ { kind: "binds", from: "checkout-submit@v1", to: "createOrder@v3" } ]
    state   (sensors): [ { id: "createOrder.fixture", status: "green" } ]
    command (compute): IsStable(cut, heads, links, sensors)
    events:  [ stable == true, reasons == [] ]             # all links resolved + all green (§43)

  fixture "any red mirror makes the cut unstable"          # THE done criterion
    state   (cut):     { constraints: { "createOrder": "v3" } }
    state   (heads):   { "createOrder": "v3" }
    state   (links):   [ { kind: "binds", from: "checkout-submit@v1", to: "createOrder@v3" } ]
    state   (sensors): [ { id: "createOrder.fixture", status: "red" } ]   # one red mirror
    command (compute): IsStable(cut, heads, links, sensors)
    events:  [ stable == false, reasons contains "createOrder.fixture" ]  # one red ⇒ not a stable phase

  fixture "a dangling (stale) link makes the cut unstable"
    state   (cut):     { constraints: { "createOrder": "v3" } }
    state   (heads):   { "createOrder": "v3" }
    state   (links):   [ { kind: "binds", from: "checkout-submit@v1", to: "createOrder@v2" } ]  # pinned off-head
    state   (sensors): [ { id: "createOrder.fixture", status: "green" } ]
    command (compute): IsStable(cut, heads, links, sensors)
    events:  [ stable == false, reasons contains "checkout-submit@v1->createOrder@v2 (stale)" ]  # a link pends ⇒ unstable

  fixture "the recorded phase id is the content hash of its cut"
    state   (cut):     { constraints: { "createOrder": "v3" }, links: [...], sensors: [...] }
    command (compute): IsStable then canonical-hash(body)
    events:  [ phase.version == Hash(Canonicalize(body)), phase.version == phase.id ]  # content-addressed (S02 reused)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: phases.IsStable · test_kind: property · cert_language: rapid · authority: below
  ∀ cut,heads,links,sensors:  IsStable is deterministic — same inputs ⇒ same (stable, reasons)
  ∀ empty cut:                IsStable(empty) == stable (the empty phase is ALWAYS stable — vacuous truth)
  ∀ cut with ≥1 red sensor OR ≥1 non-green link:  IsStable == unstable  (any red mirror ⇒ unstable)
  ∀ stable cut:               every link Resolve==green ∧ every sensor==green  (the §43 definition holds both ways)
  ∀ cut:                      reasons is empty ⇔ stable==true ; every reason names a real offending link/sensor id
  ∀ cut:                      IsStable never panics — a malformed cut/link yields a verdict, not a crash
  ```

Both start **red** (no `phases` package, no `IsStable`, no `dag.stable_phase` table, no `aidos stable` verb). That red **is** the `/goal`. The fixture mirror is a **means-test toward the human red** (an empty phase is stable; any red mirror makes the cut unstable) — not a new truth the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/phase-stable/page.tsx` (new route `/phase-stable`; do not touch existing routes). A read-only panel that renders the latest cut from `dag.stable_phase` / the live computation (via the SELECT-only role): the constraint-version selection, each link coloured by its resolved status (green = resolves; red = stale/absent), each sensor green/red, and a top-level **STABLE / UNSTABLE** badge with the `reasons` list when unstable. With the empty cut it shows **STABLE** (no rows, no reasons); with one red sensor it shows **UNSTABLE** and names the offending mirror — the verdict rendered, not re-implemented.
- **Playwright e2e:** `tests/e2e/phase-stable.spec.ts` — navigate to `/phase-stable`, assert the **STABLE** badge for the empty cut, then assert that with a single red mirror present the badge flips to **UNSTABLE** and the offending mirror id appears in the reasons (the done criterion visible in the UI). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/phases/**`, the new `back/migrations/<new>.sql`, the new `aidos stable` verb wiring in `back/cmd/aidos/` (a new subcommand registration only, no edit to existing verbs), the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/phase-stable.spec.ts`, and `front/web/app/phase-stable/**` — and otherwise **adds new files**. It defines one new contract (the `StablePhase` AST shape, the `IsStable` decision, the empty-is-stable / any-red-is-unstable rule, the `dag.stable_phase` node table, the `aidos stable` verb); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT. Any change to a **prior contract** it depends on — S02's record substrate / content-hash, S07's sensor-result shape, S17's link `Resolve`/`green-stale-absent` status and `id@version` ref shape, the heads-resolution source, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S23 — "Stable phase (coherent DAG cut) + aidos stable". Stack is FROZEN:
back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant to kernel/mirrors/
fitness/dag), front=Next.js (the Workbench). Home = back/archive/phases ONLY (plus the Atlas migration in
back/migrations and the new aidos stable subcommand in back/cmd/aidos). Follow the CLAUDE.md §6 per-step loop
IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §43 (phase stable = une coupe cohérente: one version per constraint such
that EVERY link resolves AND EVERY sensor is green at once → the kernel's lockfile; "is this a stable phase?"
= "all links resolved + all green?"; it is fractal — do LOCAL/cell stability only here), §42 (la vague de
rouge — the red wave is the set of stale links after a bump; a single red link/mirror is what breaks a cut),
§44 (the two axes: a stable phase is a DAG NODE, a ChangeSet is the temporal EDGE between two phases — you
record the node, you do not implement branch/merge/revert here), §41 (the six versioned links + Resolve →
green/stale/absent, owned by S17, CONSUMED here, not redefined), §59 (the full workflow — a phase stable is
the resting state between two goals). Read CONTEXT-MAP.md + back/archive/CONTEXT.md (stable phase, version
DAG, ChangeSet, stepping stone, ArchiveCurationPolicy — and the AVOID lists: a stable phase is NOT a release/
snapshot/milestone/tag) and the prior steps' specs (S02 records substrate / content-hash, S04 the wall, S07
sensors / sensor-result shape, S17 links / Resolve). For any Next.js 16, Atlas, or Go API doubt use context7
or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: a "stable phase" is a CUT in the version DAG (a DAG NODE), one version selected per constraint,
    that is coherent — EVERY link resolves (S17 green, no stale/absent) AND EVERY sensor is green, at once; it
    is content-addressed (version = hash of the cut) and is the kernel's LOCKFILE (avoid release/snapshot/
    milestone/tag). "stable" is COMPUTED ("all links resolved + all green?"), never declared. The EMPTY cut is
    vacuously STABLE (the base case). ANY single red mirror — a red sensor OR a non-green (stale/absent) link
    — flips the cut to UNSTABLE and is named in `reasons`. This step delivers the AGGREGATE cut decision +
    `aidos stable` + the recorded DAG node, NOT per-link staleness (owned by S17, consumed) and NOT the red-
    wave/impact worklist (§42, a later step) and NOT branch/merge/revert/QD-curation (§44.4, later) and NOT
    global/federation stability (local only). Sharpen each term against back/archive/CONTEXT.md; if a term
    shifts, update CONTEXT.md / write an ADR inline. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = a cut { constraints:
        constraintId→version, links: [...], sensors: [...] } + a heads map; command = IsStable(cut, heads,
        links, sensors); events = the verdict { stable, reasons }. Cover: EMPTY cut ⇒ STABLE (reasons empty)
        — the base done criterion ; all links resolve + all sensors green ⇒ STABLE ; ONE red sensor ⇒ UNSTABLE
        and reasons names it — THE done criterion ; one stale (off-head) link ⇒ UNSTABLE and reasons names it ;
        the recorded phase id == Hash(Canonicalize(body)) (content-addressed, S02 reused).
      - PROPERTY (rapid, ∀, below the line): IsStable is deterministic ; the empty cut is ALWAYS stable ; any
        cut with ≥1 red sensor OR ≥1 non-green link is UNSTABLE ; a stable cut ⇒ every link green ∧ every
        sensor green (both directions of §43) ; reasons empty ⇔ stable, every reason names a real offending
        id ; IsStable never panics.
    Run them; watch them go RED (no phases package, no IsStable, no dag.stable_phase table, no aidos stable
    verb). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new
    stability invariant you'd grade yourself) — mirror the human intention only (empty is stable; any red
    makes it unstable); the fixture is a means-test toward the human red.

(c) TDD red → green → refactor in back/archive/phases ONLY (plus the Atlas migration in back/migrations and the
    new aidos stable subcommand in back/cmd/aidos). Outside-in. Build: the typed StablePhase AST (cut =
    constraintId→version selection, sensor_status snapshot reusing S07's result shape, derived stable+reasons),
    and a pure IsStable(cut, heads, links, sensors)→StablePhase — no I/O, no clock/RNG; it REUSES S17's
    Resolve to test every link is green and checks every sensor is green; the empty cut is vacuously stable;
    any non-green link or red sensor ⇒ unstable with the offending id in reasons. Within the frozen slots, if
    a REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (Godog, rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/CLI
    are fixed). The likely genuine choices: the canonical cut-JSONB shape + content-hash (REUSE S02's
    Canonicalize/Hash — do NOT fork it) and how `aidos stable` reads the live cut (heads/links from kernel,
    sensor results from S07) via the SELECT-only role. Record a short ADR (docs/adr/) ONLY if a genuine choice
    is made. The migration is expand-only/append-only: add dag.stable_phase (id=hash PK, body jsonb, version,
    parent text NULL = the DAG edge to the prior node, created_at), storing the cut INSIDE the JSONB body (NOT
    as foreign keys — a recorded phase must stay inspectable after the head moves). GRANT the agent role SELECT
    only on dag.stable_phase (the wall); only the aidos writer role inserts a phase node, inside a ChangeSet.
    Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture +
    rapid mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce IsStable on the empty /
    all-green / one-red-sensor / one-stale-link cases, state the cause, propose. Check completeness:
    dag.stable_phase (the phase truth) has its living mirror (the fixture + property); no monster (no truth
    without a mirror, no orphan mirror, no cut admitted as stable while a link pends or a sensor is red) —
    else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/phase-stable/ →
    /phase-stable: render the latest cut (SELECT-only role / live computation) — the constraint-version
    selection, each link coloured by its resolved status (green = resolves, red = stale/absent), each sensor
    green/red, and a top-level STABLE/UNSTABLE badge with the reasons list when unstable. Show the empty cut as
    STABLE and a cut with one red mirror as UNSTABLE naming the offender. Read the verdict; render it, do not
    re-implement IsStable. Do NOT touch existing routes. Add tests/e2e/phase-stable.spec.ts (use the
    playwright-e2e skill) asserting the STABLE badge for the empty cut and that one red mirror flips it to
    UNSTABLE with the offending id in reasons (the done criterion visible in the UI).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that phases
    is a deep, well-named module (StablePhase/IsStable/cut/reasons separated, the empty-is-stable base case and
    the any-red-is-unstable rule obvious), that IsStable is pure and REUSES S17's Resolve and S02's hash scheme
    without duplicating them, that the migration/GRANT keeps the wall intact (dag is above the line, agent
    SELECT-only), that aidos stable reads via the SELECT-only role and only the writer role records the node,
    and that boundaries match back/archive/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas migration
    (persistence), the aidos stable CLI verb (capability), the fixture + rapid property (behaviour proof), and
    the Next route (visualization). Do NOT add a new MCP server, a hook, or a Skill — no new backend service,
    non-bypassable rule, or replayable gesture is justified at S23 (the wall already guards dag.*; the dag MCP
    that walks branches/reverts/merges, and the red-wave/impact computation, are later steps). A new artifact
    may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin a stability rule KRD §43 does not state:
  stable = every link resolves (S17 green) AND every sensor is green; empty is vacuously stable; any single
  red breaks it. If the exact cut-JSONB columns, the content-hash scheme, the sensor-result shape (S07), the
  link Resolve status set (S17), the heads-resolution source, or the dag node/edge shape are not pinned by KRD
  / an existing migration / S02's Canonicalize / a referenced step, do NOT guess — record an OpenQuestion
  (provenance) and STOP on that branch. The example ids (createOrder, checkout-submit, createOrder.fixture)
  are reused from S11/S17's pinned artifacts; do not coin new ones.
- You NEVER write a truth-test (a new stability invariant you would then satisfy — the circularity). The
  fixture and property are means-tests toward the human red (empty is stable; any red mirror is unstable),
  not new truths.
- Any change to a prior contract (S02 records/hash, S07 sensor-result shape, S17 links/Resolve, the wall
  GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact,
  never hand-edit back/gen/**. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the IsStable fixtures pass — an EMPTY phase is STABLE, a cut where every
link resolves and every sensor is green is STABLE, AND any single red mirror (a red sensor or a stale/absent
link) makes the cut UNSTABLE and names the offender in reasons (the done criterion); the recorded phase id is
the content hash of its cut; the rapid invariants hold (determinism, empty⇒stable, any-red⇒unstable,
stable⇒all-green-both-ways, reasons⇔stable, no panic); aidos stable prints the verdict from the SELECT-only
role; /phase-stable renders the cut with a STABLE/UNSTABLE badge + reasons, with a passing Playwright e2e; the
dag.stable_phase GRANT proves SELECT-only for the agent; the migration is append-only/expand-only. You cannot
force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized
  (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /phase-stable — what it renders (the cut + per-link/per-sensor status + STABLE/UNSTABLE badge +
  reasons), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to dag.stable_phase go through the aidos CLI writer
  role, not the agent); any prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. local/cell stability only (no federation), no branch/merge/revert of the DAG, no red-wave/
  impact worklist yet, no QD-curation, no MCP, no hook, per-link staleness consumed from S17 not redefined,
  heads/sensor-source assumption.
- Next safe step: the smallest stable next tooth (e.g. the ChangeSet as the temporal edge that moves from one
  stable phase to the next, or the dag MCP that walks branches/reverts) and why it is safe to chain.
```
