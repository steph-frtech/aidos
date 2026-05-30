# S47 — AdoptionStage (T0→T4 progressive) + Release v0 (pack assembled)

Subsystem: AIDOS Runtime | Home: `back/runtime/adoption` | Workbench route: `/adoption`

## Objectif

Land **`AdoptionStage`** — the pure, read-only ladder that tells an adopter *which is the smallest ratchet that clicks next* (install KRD progressively, never all at once): a tier `T0 → T1 → T2 → T3 → T4` where each tier **requires** the prior tier's capabilities plus its own, and where the gating facts are exactly the three declared in the done criterion — **T1 needs no QD** (quality-diversity is an advanced capability, off at T1), **T2 needs the RealityMirror** (the external-world mirror must be live before a cell may run at the catastrophic tier), **T4 needs the EvolutionSandbox** (the `/evolve` quarantine must exist before evolution may be turned on). On top of it, assemble the **Release v0 pack** — the read-only, content-addressed bundle that proves "this AIDOS is launchable": CLI surface + Workbench routes + a runnable demo cell + docs index + the test inventory, plus a **changelog** and an honest **known-limits** list. The done criterion: the ladder enforces the three stage requirements (T1↛QD, T2→RealityMirror, T4→EvolutionSandbox) and the release pack is **assembled** (computed from the live truth-store, never hand-written).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the release-pack snapshot rows), a **repeatable gesture** (the `/release` Skill), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/runtime/adoption/` — the `AdoptionStage` ladder. A pure `Plan(capabilities) → AdoptionPlan` over a passed-in read-only view of what the adopter currently has installed (which subsystems/cells/mirrors/sandboxes are live in the truth-store). `AdoptionStage` is a typed enum = **exactly** `{ T0, T1, T2, T3, T4 }` (declared, never invented; mapped from KRD §82.5's `stage0..stage5` — **REUSE that mapping, do not re-coin tiers**: `T0`=existing tests + mutation, `T1`=one KRD cell, `T2`=kernel + mirror, `T3`=ContextGraph + Memory, `T4`=evolve + QualityDiversity). Each tier carries a declared `requires []Capability` and a declared `grants []Capability`. The three gating predicates are pure over the capability view and are the **load-bearing** ones: **T1 does NOT require QualityDiversity** (QD is `advanced`, KRD §82.6 — asserting it at T1 is a monster); **T2 requires a live `RealityMirror`** (the external-world mirror, KRD Livre XX / §3528 — a cell may not enter the catastrophic tier without reality grounding); **T4 requires a live `EvolutionSandbox`** (the `/evolve` quarantine, KRD §66.1 — evolution may not be enabled before its sandbox exists). `Plan` returns the **next smallest installable tier** (the smallest ratchet that clicks) given current capabilities + the `[]Gap` blocking each not-yet-satisfiable tier. `Plan` is pure over `capabilities` only — no DB calls, no I/O, no `time.Now()`, no RNG (the report is deterministic and replayable). It **computes a ladder**; it never installs, mutates, or writes truth.
- **Go package** `back/runtime/adoption/release/` — a pure `Assemble(view, now) → ReleasePack` where `ReleasePack` is a typed, content-addressed bundle = `{ id (content hash of the canonical pack body — REUSE S01/S02's Canonicalize/Hash, do NOT fork it), cli_surface []CLICommand, workbench_routes []Route, demo_cell DemoRef, docs_index []DocRef, test_inventory []MirrorRef, changelog []ChangeEntry, known_limits []Limit, assembled_at, kernel_head }`. Every field is **derived from the passed-in read-only `view`** (the live CLI command list, the live Workbench routes, the live mirrors as the test inventory, the changeset history as the changelog source) — `Assemble` **inventories what exists, it never authors content** (it does not invent a CLI command, a route, a demo, a doc, or a changelog line that the view does not contain). `known_limits` is assembled from declared limits in the truth-store / OpenQuestions, never editorialised. `Assemble` is pure over `(view, now)` — no I/O, the clock is passed in. It **assembles**; it writes no truth, ships nothing, and runs no command.
- **Atlas migration** (`back/migrations/`) — one declarative, **expand-only / append-only** migration adding to the read-only `fitness` zone a `fitness.release_pack` table: `id text PRIMARY KEY` = hash of the canonical pack body (reuse S01/S02's content-hash, do **not** fork it), `body jsonb NOT NULL` holding the full `ReleasePack` (cli surface, routes, demo ref, docs index, test inventory, changelog, known limits) + the `AdoptionPlan`, `assembled_at timestamptz NOT NULL`, `kernel_head text NOT NULL` (the truth head the pack was assembled against, version-pinned so a recorded release stays inspectable after heads move). A pack is **append-only** — a new assembly is a new row, never an UPDATE; nothing about the kernel is altered. GRANTs: the agent DB role gets **SELECT only** on `fitness.release_pack` (the wall, §2; `fitness` is read-only and `kernel`/`mirrors` are truth schemas above the line — the agent has no write GRANT to any of them). Only the `aidos` CLI writer role records a pack, via an approved ChangeSet (S20).
- **Skill** `.claude/skills/release/` (`SKILL.md`, CLAUDE.md §5: repeatable gesture → Skill) — `/release`: the replayable gesture "compute the adoption plan and assemble the release pack". It encodes the procedure (take a read-only capability + truth view → `Plan` → `Assemble` → present the next-smallest-ratchet tier + the assembled pack with changelog + known limits), the **honesty rules** (it INVENTORIES, it never authors a CLI command / route / demo / doc / changelog line / limit the view does not contain; never invent a stage, a target/targetId, or a business-rule; uncertainty becomes an OpenQuestion in `provenance`), and the hard rule that **the pack is a read-only artifact** — assembling it never writes truth and recording it goes through the `aidos` writer role via a ChangeSet (S20), never the agent. `/release` never bypasses the door `idea → mirror → /goal → human approval`.
- **BDD mirror** — a **fixture** mirror (`state → command → events`: a snapshot of installed capabilities + a passed-in `now` → `Plan` → the `AdoptionPlan`; a truth-store view → `Assemble` → the `ReleasePack`) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (see below).
- **Next route** `front/web/app/adoption/` → `/adoption` — the Workbench panel rendering (1) the **adoption ladder** (the five tiers `T0..T4`, the current tier highlighted, the next-smallest installable tier, and each not-yet-satisfiable tier's `Gap`s — explicitly showing the three load-bearing facts: T1 carries no QD requirement, T2 is blocked until RealityMirror is live, T4 is blocked until EvolutionSandbox is live) and (2) the **release pack** (the CLI surface, Workbench routes, demo cell, docs index, test inventory, changelog and the honest known-limits list), reading via the SELECT-only role (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — `Plan`/`Assemble` are pure libraries; recording a pack is done through the existing `changeset` MCP + `aidos` writer role (S20), and taking the read-only capability/truth view reuses the existing `store` MCP read path, not a new backend service. **No new hook** — `/release` is advisory, not a non-bypassable rule; the wall GRANT and the completeness law (S12) are prior artifacts; this step adds no new gate (a hook that never fires would be dead — CLAUDE.md §5 hook honesty). **No installation / no shipping** — this step COMPUTES the ladder and ASSEMBLES the pack; it never installs a tier, runs the demo, publishes the docs, or executes the changelog; turning on a capability (a RealityMirror, an EvolutionSandbox) is a *prior/other* step's truth, consumed here, not produced. **No QD / no RealityMirror / no EvolutionSandbox engine** — these are CONSUMED as facts in the capability view (live or not), never built here. **No stage re-definition** — the `T0..T4` tiers map to KRD §82.5's `stage0..stage5`, not re-coined. **No content authoring** — the changelog, docs, known limits and demo are INVENTORIED from the truth-store, never written by the agent. **No codegen/emitters, no truth writes.**

## Test minimal (done)

**Done = the ladder enforces T1↛QD, T2→RealityMirror and T4→EvolutionSandbox, and the release pack is ASSEMBLED from the live view (nothing authored, nothing shipped).** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: runtime.adoption.Plan + runtime.adoption.release.Assemble · test_kind: fixture · cert_language: operation-dsl/go · authority: below (fitness is read-only diagnostic)
  fixture "T1 does not require QualityDiversity"                            # THE done criterion (T1 ↛ QD)
    state   (capabilities): [ tests, mutation, one_krd_cell ]              # T1's own grants present
    command (plan):         Plan(capabilities)
    events:  [ T1 is satisfiable, T1.requires does NOT contain QualityDiversity,
               QD is classified advanced (KRD §82.6), no Gap on T1 mentions QD ]

  fixture "T2 is blocked until the RealityMirror is live"                  # THE done criterion (T2 → RealityMirror)
    state   (capabilities): [ tests, mutation, one_krd_cell, kernel, mirror ]   # no RealityMirror yet
    command (plan):         Plan(capabilities)
    events:  [ T2 is NOT satisfiable, T2 has a Gap naming the missing RealityMirror,
               next smallest installable tier is T2 with that single blocking gap ]

  fixture "T2 unlocks once the RealityMirror is live"
    state   (capabilities): [ ...as above..., reality_mirror_live ]
    command (plan):         Plan(capabilities)
    events:  [ T2 is satisfiable, no RealityMirror Gap remains ]

  fixture "T4 is blocked until the EvolutionSandbox exists"               # THE done criterion (T4 → EvolutionSandbox)
    state   (capabilities): [ ...through T3..., context_graph, memory ]    # no EvolutionSandbox
    command (plan):         Plan(capabilities)
    events:  [ T4 is NOT satisfiable, T4 has a Gap naming the missing EvolutionSandbox (KRD §66.1) ]

  fixture "the next smallest ratchet that clicks is proposed"
    state   (capabilities): [ tests, mutation ]                           # only T0's grants
    command (plan):         Plan(capabilities)
    events:  [ current tier == T0, next installable tier == T1, T1's single gap is one_krd_cell,
               Plan does NOT propose jumping straight to T2/T3/T4 ]

  fixture "the release pack is assembled from the live view"             # THE done criterion (assembled)
    state   (view): [ cli: [check, impact, stable, ...], routes: [/kernel-debt, ...],
                      mirrors: [...], changesets: [...], docs: [...], declared_limits: [...] ]
    command (assemble): Assemble(view, now)
    events:  [ pack.cli_surface == view's live CLI commands (none invented),
               pack.workbench_routes == view's live routes (none invented),
               pack.test_inventory == view's live mirrors,
               pack.changelog derived from view's changesets (no authored line),
               pack.known_limits == view's declared limits / OpenQuestions (none editorialised),
               pack writes NO truth, runs NO command, ships NOTHING ]

  fixture "the recorded pack id is the content hash of its body"
    state   (view):     [ ... ]
    command (assemble): Assemble then canonical-hash(pack body)
    events:  [ pack.id == Hash(Canonicalize(body)) ]                      # content-addressed (S01/S02 reused)

  fixture "an empty view yields an empty-but-valid pack, never invented content"
    state   (view):     [ cli: [], routes: [], mirrors: [], changesets: [], docs: [], declared_limits: [] ]
    command (assemble): Assemble(view, now)
    events:  [ pack assembles, every list is empty, NO field fabricated ]  # no hallucinated content
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: adoption.Plan + adoption.release.Assemble · test_kind: property · cert_language: rapid · authority: below
  ∀ capabilities,now:  Plan / Assemble are deterministic — same inputs ⇒ same plan/pack (now passed, never read from clock)
  ∀ capability view:   T1.requires never contains QualityDiversity                    (T1 ↛ QD, KRD §82.6)
  ∀ view without a live RealityMirror:  T2 is NOT satisfiable and carries a RealityMirror Gap   (T2 → RealityMirror)
  ∀ view without an EvolutionSandbox:   T4 is NOT satisfiable and carries an EvolutionSandbox Gap (T4 → EvolutionSandbox)
  ∀ Plan run:  the proposed next tier is the SMALLEST unsatisfied tier whose lower tiers are all satisfied (monotone ladder)
  ∀ tier:  AdoptionStage ∈ { T0, T1, T2, T3, T4 } — no invented tier
  ∀ ReleasePack field:  every entry traces to a real entry in the input view — Assemble never invents a CLI cmd / route / demo / doc / changelog line / limit
  ∀ Plan/Assemble run:  the input view is unchanged — pure, read-only, NEVER installs / ships / deletes / writes a row
  ∀ pack:  id == Hash(Canonicalize(body))                                              (content-addressed, S01/S02 reused)
  ∀ malformed view / capability row:  Plan/Assemble yield a report, never panic
  ```

Both start **red** (no `adoption` package, no `release` package, no `Plan`/`Assemble`, no `fitness.release_pack` table). That red **is** the `/goal`. The fixtures are **means-tests toward the human red** (T1↛QD, T2→RealityMirror, T4→EvolutionSandbox enforced; pack assembled from the live view) — not new truths the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/adoption/page.tsx` (new route `/adoption`; do not touch existing routes). A read-only panel reading via the SELECT-only role, with two views: (1) the **adoption ladder** — the five tiers `T0 → T1 → T2 → T3 → T4` rendered as a progression, the *current* tier highlighted and the *next smallest installable* tier marked, each not-yet-satisfiable tier listing its `Gap`s, with the three load-bearing facts made visible (T1 shows **no QD requirement**, T2 shows **blocked until RealityMirror live**, T4 shows **blocked until EvolutionSandbox exists**); (2) the **release pack** — the CLI surface, Workbench routes, demo cell, docs index, test inventory, a **changelog** section and an honest **known-limits** section, all rendered as an inventory of what exists (no "install" / "ship" / "publish" affordance — the "assembles, never installs/ships" rule made visible in the UI). An empty view renders an explicit "empty-but-valid pack" state.
- **Playwright e2e:** `tests/e2e/adoption.spec.ts` — navigate to `/adoption`, assert the ladder shows the five tiers with the current tier highlighted, that **T1 shows no QualityDiversity requirement**, that **T2 renders as blocked with a RealityMirror gap** when no RealityMirror is live, that **T4 renders as blocked with an EvolutionSandbox gap** when no sandbox exists (the three done criteria), that the release pack section renders the CLI surface, routes, test inventory, changelog and known limits, that it exposes **no install/ship/publish button** (assemble only), and that an empty view renders the empty-but-valid pack state. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/adoption/**` (incl. `back/runtime/adoption/release/**`), the new `back/migrations/<new>.sql`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/adoption.spec.ts`, `.claude/skills/release/SKILL.md`, and `front/web/app/adoption/**` — and otherwise **adds new files**. It defines new contracts (the `AdoptionStage`/`AdoptionPlan`/`Gap` ladder + the three gating predicates; the `ReleasePack`/`ReleaseEntry` bundle + `Assemble`; the `fitness.release_pack` table; the `/release` gesture); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT; `Plan`/`Assemble` and `/release` **install nothing, ship nothing, delete nothing** and write no truth — a pack is an *inventory snapshot*, never a `DELETE`/`DROP`/deploy. Any change to a **prior contract** it depends on — S01/S02's content-hash substrate, KRD §82.5's stage→tier mapping, the capability-view shape, the consumed RealityMirror / EvolutionSandbox / QD facts, the live CLI-command / Workbench-route / mirror / changeset shapes it inventories, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S47 — "AdoptionStage (T0→T4 progressive) + Release v0 (pack assembled)".
Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant to
kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/runtime/adoption ONLY (incl. its release/
subpackage, plus the Atlas migration in back/migrations). Follow the CLAUDE.md §6 per-step loop IN ORDER. Never
go prompt → code.

Read BEFORE touching anything: KRD.md §82.5 (AdoptionStage — "install the smallest ratchet that clicks, then
extend by scars"; stage0=existing tests+mutation, stage1=one KRD cell, stage2=kernel+mirror, stage3=ContextGraph
+Memory, stage4=evolve+QualityDiversity), §82.6 (KRDStack — QualityDiversity / EvolutionSandbox-class capabilities
are ADVANCED, not in the mandatory_minimum), §66.1 (EvolutionSandbox — /evolve runs in quarantine, cannot write
kernel/mirrors/authority/fitness), and the RealityMirror notion (Livre XX / the external-world mirror that grounds
a cell in reality). Also read the anti-Goodhart / non-gameable-judge sections (the Judge is the deterministic
mirror; the tier and the pack are COMPUTED, never declared). Read CONTEXT-MAP.md + back/runtime/CONTEXT.md
(AdoptionStage, RealityMirror, EvolutionSandbox, QualityDiversity, release pack, the wall, /release as an
ASSEMBLE-only gesture — and the AVOID lists: AdoptionStage is NOT an installer / a migration runner / a feature
flag system; the release pack is NOT a deployer / a publisher / a CI pipeline) and the prior steps' specs (S01/S02
content-store + records/content-hash, S04 the wall, S12 completeness/monster, S20 ChangeSet write-path, the CLI
surface step S03, the Workbench-route projection step, and the steps that produce the RealityMirror / Evolution
sandbox / QD facts this step CONSUMES). For any Next.js 16, Atlas, or Go API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: AdoptionStage is a READ-ONLY LADDER that names the SMALLEST RATCHET THAT CLICKS NEXT — exactly five
    DECLARED tiers T0..T4 mapped from KRD §82.5's stage0..stage5 (T0=existing tests+mutation, T1=one KRD cell,
    T2=kernel+mirror, T3=ContextGraph+Memory, T4=evolve+QualityDiversity), each with declared requires/grants. The
    three LOAD-BEARING facts: T1 does NOT require QualityDiversity (QD is advanced, §82.6 — asserting it at T1 is a
    monster), T2 REQUIRES a live RealityMirror (no catastrophic tier without reality grounding), T4 REQUIRES a live
    EvolutionSandbox (no evolution before its quarantine exists, §66.1). The release pack is ASSEMBLED — an
    inventory of what EXISTS in the live truth-store (CLI surface, Workbench routes, a demo cell, docs index, test
    inventory = the live mirrors, changelog derived from changesets, honest known-limits from declared limits /
    OpenQuestions) — content-addressed, read-only. This step delivers a LADDER + an ASSEMBLED PACK over a read-only
    view, NOT installation of any tier, NOT shipping/publishing/deploying, NOT the RealityMirror / EvolutionSandbox
    / QD engines (CONSUMED as facts), NOT a re-definition of the stages (mapped from §82.5), NOT any content the
    agent authors (changelog/docs/limits/demo are INVENTORIED), NOT any truth write. Sharpen each term against
    back/runtime/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch before
    coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for the
    runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = a read-only capability view
        (which subsystems/cells/mirrors/sandboxes are live) and a read-only truth-store view (live CLI commands,
        Workbench routes, mirrors, changesets, docs, declared limits) + a passed-in `now`; command = Plan(caps) and
        Assemble(view, now); events = the AdoptionPlan and the ReleasePack. Cover: T1's requires does NOT contain
        QualityDiversity — THE done criterion (T1 ↛ QD) ; with no live RealityMirror, T2 is NOT satisfiable and
        carries a RealityMirror Gap (and unlocks once it is live) — THE done criterion (T2 → RealityMirror) ; with
        no EvolutionSandbox, T4 is NOT satisfiable and carries an EvolutionSandbox Gap — THE done criterion (T4 →
        EvolutionSandbox) ; Plan proposes the SMALLEST next tier that clicks (T0-only caps ⇒ next = T1, never jump
        to T2+) ; Assemble produces a pack whose every field is the live view's content (no invented CLI cmd /
        route / demo / doc / changelog line / limit) and that writes no truth / ships nothing — THE done criterion
        (assembled) ; the pack id == Hash(Canonicalize(body)) (content-addressed, S01/S02 reused) ; an EMPTY view
        ⇒ an empty-but-valid pack with no fabricated content.
      - PROPERTY (rapid, ∀, below the line): Plan/Assemble are deterministic (now passed in, never read from the
        clock) ; T1.requires never contains QualityDiversity ; any view without a live RealityMirror ⇒ T2 not
        satisfiable + RealityMirror Gap ; any view without an EvolutionSandbox ⇒ T4 not satisfiable +
        EvolutionSandbox Gap ; the proposed next tier is the smallest unsatisfied tier whose lower tiers are all
        satisfied (monotone ladder) ; no tier outside { T0,T1,T2,T3,T4 } ; every ReleasePack entry traces to a
        real input-view entry (no invented content) ; the input view is NEVER mutated/installed/shipped/deleted
        (pure, read-only) ; pack id is the content hash of its body ; never panics on malformed input.
    Run them; watch them go RED (no adoption/release packages, no Plan/Assemble, no fitness.release_pack table).
    That red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new tier or a stage
    rule you'd grade yourself) — mirror the human intention only (T1↛QD, T2→RealityMirror, T4→EvolutionSandbox;
    pack assembled from the live view); the fixture is a means-test toward the human red.

(c) TDD red → green → refactor in back/runtime/adoption ONLY (incl. back/runtime/adoption/release, plus the Atlas
    migration in back/migrations). Outside-in. Build: the typed AdoptionStage enum { T0..T4 } mapped from KRD
    §82.5 (REUSE the mapping, do NOT re-coin tiers), each tier's declared requires/grants, and the three pure
    gating predicates (T1 ↛ QualityDiversity via §82.6's advanced classification ; T2 requires a live RealityMirror
    ; T4 requires a live EvolutionSandbox via §66.1) ; Plan(capabilities) → AdoptionPlan returning the smallest
    next installable tier + the []Gap per unsatisfied tier — no I/O, no time.Now() (now is a parameter), no learned
    thresholds ; and the pure Assemble(view, now) → ReleasePack that INVENTORIES the live view (cli_surface,
    workbench_routes, demo_cell, docs_index, test_inventory, changelog from changesets, known_limits from declared
    limits / OpenQuestions) — it AUTHORS NOTHING, installs nothing, ships nothing, writes no truth. Within the
    frozen slots, if a REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST,
    never touch the mandatory minimum (Godog, rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go
    MCP/CLI are fixed). The likely genuine choices: the canonical ReleasePack / AdoptionPlan JSONB shape +
    content-hash (REUSE S01/S02's Canonicalize/Hash — do NOT fork it) and the read-only capability-view adapter
    shape. Record a short ADR (docs/adr/) ONLY if a genuine choice is made. The migration is expand-only/
    append-only: add fitness.release_pack (id=hash PK, body jsonb, assembled_at, kernel_head) — a new assembly is a
    new row, never an UPDATE. GRANT the agent role SELECT only (the wall; fitness is read-only and kernel/mirrors
    are above the line) ; only the aidos writer role records a pack, inside a ChangeSet (S20). Code only what turns
    the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only; never
    declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Plan on the T1 / T2-blocked /
    T2-unlocked / T4-blocked / smallest-next-tier cases and Assemble on the live-view / empty-view cases, state the
    cause, propose. Check completeness: fitness.release_pack (the release diagnostic) has its living mirror (the
    fixture + property) ; no monster (no truth without a mirror, no orphan mirror, no invented tier/content, no row
    silently mutated, no pack that installs or ships) — else Stop blocks. Do not finish a code step without
    /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/adoption/ → /adoption:
    render (SELECT-only role) the adoption ladder (five tiers T0..T4, current tier highlighted, next smallest
    installable tier marked, each unsatisfied tier's Gaps — with the three load-bearing facts visible: T1 shows no
    QD requirement, T2 blocked until RealityMirror live, T4 blocked until EvolutionSandbox exists) and the release
    pack (CLI surface, Workbench routes, demo cell, docs index, test inventory, changelog, honest known-limits),
    with NO install/ship/publish affordance — assemble only. Show an empty-but-valid pack state for an empty view.
    Read the plan + pack; render them, do not re-implement Plan/Assemble. Do NOT touch existing routes. Add
    tests/e2e/adoption.spec.ts (use the playwright-e2e skill) asserting the five-tier ladder with current tier
    highlighted, T1 with NO QD requirement, T2 blocked with a RealityMirror gap, T4 blocked with an
    EvolutionSandbox gap (the three done criteria), the pack section rendering CLI surface + routes + test
    inventory + changelog + known limits with NO install/ship/publish button (assemble only), and the
    empty-but-valid pack state for an empty view.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that adoption and
    release are deep, well-named modules (AdoptionStage/AdoptionPlan/Gap and the three gating predicates separated;
    ReleasePack/Assemble and the assemble-only/inventory-only rule obvious), that Plan/Assemble are pure and REUSE
    S01/S02's hash scheme and KRD §82.5's stage→tier mapping without duplicating or redefining them, that the
    migration/GRANT keeps the wall intact (fitness is read-only, kernel/mirrors above the line, agent SELECT-only),
    that nothing in the path installs / ships / deletes / writes a truth, and that boundaries match
    back/runtime/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package(s) (pure logic/schema), the Atlas migration
    (persistence), the fixture + rapid property (behaviour proof), the /release Skill (repeatable gesture →
    SKILL.md encoding plan→assemble, the assemble-only/inventory-only/no-install rule, and that recording the pack
    goes through the aidos writer role via a ChangeSet), and the Next route (visualization). Do NOT add a new MCP
    server or a hook — no new backend service or non-bypassable rule is justified at S47 (the wall already guards
    kernel/mirrors/fitness; reading the view reuses the store MCP read path; recording a pack goes through the S20
    changeset MCP + aidos writer role; /release is advisory, not a gate — a hook that never fires is dead). A new
    artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin an adoption tier beyond the five declared
  (T0,T1,T2,T3,T4) or a release-pack field/entry the live view does not contain — no fabricated CLI command, route,
  demo, doc, changelog line, or known-limit. If the exact ReleasePack / AdoptionPlan JSONB columns, the
  content-hash scheme, the capability-view shape, the stage→tier mapping (KRD §82.5), the consumed RealityMirror /
  EvolutionSandbox / QualityDiversity facts, the live CLI / route / mirror / changeset shapes, or the wall GRANTs
  are not pinned by KRD / an existing migration / S01-S02's Canonicalize / a referenced step, do NOT guess — record
  an OpenQuestion (provenance) and STOP on that branch. Example ids and capability names are illustrative; reuse
  pinned artifacts where a real id is needed, do not coin new business ids.
- You NEVER write a truth-test (a new tier or stage rule you would then satisfy — the circularity). The fixture and
  property are means-tests toward the human red (T1↛QD, T2→RealityMirror, T4→EvolutionSandbox enforced; pack
  assembled from the live view), not new truths. The Judge is the deterministic mirror, never an LLM scoring its
  own output.
- /release and Plan/Assemble INSTALL NOTHING, SHIP NOTHING, delete nothing and write no truth — a pack is an
  inventory snapshot; recording it goes through the aidos writer role via a ChangeSet (S20), and changing any truth
  goes through idea → mirror → /goal → human approval (the only door, CLAUDE.md §2). Any change to a prior contract
  (S01/S02 records/hash, KRD §82.5 stage mapping, the capability-view shape, the consumed RealityMirror /
  EvolutionSandbox / QD facts, S20 ChangeSet write-path, the live CLI / route / mirror / changeset shapes, the wall
  GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact, never
  hand-edit back/gen/**. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥ threshold
∧ no monster. Concretely: the Plan fixtures pass — T1 requires no QualityDiversity, T2 is blocked with a
RealityMirror gap until a RealityMirror is live (then unlocks), T4 is blocked with an EvolutionSandbox gap, and the
proposed next tier is the smallest one that clicks — and the Assemble fixtures pass — the pack's every field is the
live view's content (no invented CLI cmd / route / demo / doc / changelog line / limit), it writes no truth and
ships nothing, an empty view yields an empty-but-valid pack, and the pack id is the content hash of its body ; the
rapid invariants hold (determinism with now passed in, T1↛QD, T2→RealityMirror, T4→EvolutionSandbox, monotone
ladder, no invented tier, no invented content, no mutation of the input, content-addressed id, no panic) ;
/adoption renders the ladder + the assembled pack with no install/ship affordance and a passing Playwright e2e ;
the fitness.release_pack GRANT proves SELECT-only for the agent ; the migration is append-only/expand-only. You
cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /adoption — what it renders (the T0..T4 adoption ladder with the three load-bearing facts + the
  assemble-only release pack with CLI surface / routes / demo / docs / test inventory / changelog / known limits +
  the empty-but-valid pack state), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to fitness.release_pack go through the aidos CLI writer
  role via the S20 changeset flow, not the agent); any prior-contract change → ChangeSet + SemanticDiff, else
  "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. ladder + pack assembly only (no installation / shipping / publishing — those are other
  steps/goals), RealityMirror / EvolutionSandbox / QD facts and the stage→tier mapping consumed not invented, no
  MCP, no hook, the consumed capability-view and live CLI / route / mirror / changeset shape assumptions.
- Next safe step: the smallest stable next tooth (e.g. a federation/stage5 diagnostic, or a goal-driven installer
  that turns a satisfiable tier into an idea → mirror → /goal, or wiring the assembled pack into a `aidos release`
  CLI verb) and why it is safe to chain.
```
