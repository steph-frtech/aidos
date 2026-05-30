# S29 — Goal engine (idea → DRAFT ChangeSet + red set, non-gameable stop)

Subsystem: AIDOS Runtime | Home: `back/runtime/goal` | Workbench route: `/goal`

## Objectif

Land the **goal engine** of KRD §56–§59: the door that turns a candidate-truth (**idea**) into the only legitimate path to truth — an **idea** is promoted by **drafting its mirror** (`idea → mirror → /goal`, §57, LIVRE XX). The engine opens a **DRAFT ChangeSet** (S20) carrying the idea's spec_delta + mirror_delta and **derives the red set** — the failing mirror(s) that *are* the goal (§56: "le test rouge EST le goal ; le set rouge EST la todo-list") — with a **non-gameable stop condition**: done is `red set → green ∧ prior green intact`, never the agent's own confidence (§57, Algorithme ①). The done criterion: a goal creates a **DRAFT** ChangeSet and **at least one red mirror**.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the goal rows), a **non-bypassable rule** (the `Stop:goal-check` Go hook), a **repeatable gesture** (the `/goal` Skill), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/runtime/goal/` — the goal engine per KRD §56–§57. The `Goal` AST: `id` (content hash of the canonical goal body, reuse S02's `Canonicalize`/`Hash` — do **not** fork it), `idea_ref` (the candidate-truth from the `ideas` schema), `changeset_ref` (the DRAFT ChangeSet it opened, S20), `red_set` (the ordered set of failing mirror refs that *are* the goal), `status: OPEN | CLOSED` (CLOSED is **computed**, never declared — see the stop condition), `budgets` (time/turns/tokens — the secondary anti-runaway guard, §57, declared not learned). A pure `OpenGoal(idea, completeness) → Goal | BlockReason`: it **drafts the mirror for the idea** (an idea with no mirror is a *vœu*, a monster — §57, LIVRE XX), opens a **DRAFT** ChangeSet via S20's `Open(label, parentPhase)` wrapping the idea's `spec_delta` + `mirror_delta` atomically, then **derives the red set** = the mirrors that consume the spec_delta and are currently failing (reuse S22's `Impact`/red-wave to compute *which* mirrors redden — do **not** re-implement the cascade). A goal with an **empty red set is rejected** (`NO_RED_SET` BlockReason: a goal that is already green is not a goal — there is nothing to close, §56). The pure stop predicate `IsClosed(goal, sensors, mutation, monsters) → bool` per §57 Algorithme ①: `red_set → green ∧ prior_green_intact ∧ mutation ≥ threshold ∧ no monster` — **deterministic, computational, no self-assessment**; the engine never reads the agent's confidence. No I/O, no clock, no RNG — `OpenGoal`/`IsClosed` are pure over their inputs so the goal decision is replayable. The actual red→green TDD motion (the loop body) lives in the agent's `/src` work, not here; this step delivers the *engine* that opens the goal and computes its stop.

- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration adding the AST table `ideas.goal` (the goal is the promotion record above `product`, LIVRE XX): `id text PRIMARY KEY` = hash of the canonical goal body, `body jsonb NOT NULL` holding `{idea_ref, changeset_ref, red_set, status, budgets}`, `idea_ref text NOT NULL` (FK-by-ref into `ideas`, version-pinned), `changeset_ref text NOT NULL` (the DRAFT ChangeSet, S20), `status text NOT NULL CHECK (status IN ('OPEN','CLOSED'))`, `created_at timestamptz NOT NULL`, `closed_at timestamptz NULL`. The red set lives **inside** the JSONB body (version-pinned mirror refs, not foreign keys — a recorded goal must stay inspectable after heads move). GRANTs: the agent DB role gets **SELECT only** on `ideas.goal` (the wall, §2; `ideas`/`changesets`/`mirrors` are truth schemas above the line). Only the `aidos` CLI writer role inserts/closes a goal, and the DRAFT→APPLIED ChangeSet transition stays owned by S20's commit-gate — the agent role never writes truth, and **never** stamps a goal CLOSED.

- **Go hook** `back/hooks/stop/` (the `Stop:goal-check` binary, CLAUDE.md §5: non-bypassable rule → Hook) — the **non-gameable stop gate** of §57 Algorithme ①. At the end of a run it **refuses to let the goal close** unless `IsClosed(goal, …)` holds: the red set has gone green **AND** prior green is intact **AND** mutation score ≥ threshold **AND** no monster. It does **not** trust the agent's claim of "done"; "done" is **computed**. If the predicate fails it returns an actionable `BlockReason` (reuse S13's shape: `code`, `severity`, `explanation`, `how_to_fix[]` — e.g. `code: "GOAL_STILL_RED"`, `how_to_fix: ["close mirror X"]`). Per §5 hook honesty it ships a **fault-injection test**: leave one mirror in the red set still red (or break a prior green) and assert the gate goes red and **blocks** the close — a hook that never fires is dead.

- **Skill** `.claude/skills/goal/` (`SKILL.md`, CLAUDE.md §5: repeatable gesture → Skill) — `/goal`: the replayable gesture "promote an idea to truth via its mirror". It encodes the procedure (take an idea ref → `OpenGoal` → drive red→green outside-in → close only when `Stop:goal-check` passes), the **honesty rules** (never invent a target/business-rule; an idea with no mirror is a monster; uncertainty becomes an OpenQuestion in `provenance`), and the non-gameable stop. It is the harness command form of §57; the bounded-loop engine is the harness, the stop condition is what KRD adds.

- **BDD mirror** — a **fixture** mirror (`state → command → events`: an idea → `OpenGoal` → a DRAFT ChangeSet + a non-empty red set) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (see below).

- **Next route** `front/web/app/goal/` → `/goal` — the Workbench panel rendering the current goal: the source idea, the DRAFT ChangeSet badge, the **red set** (each failing mirror, red until green), the live stop predicate (red set→green? prior green intact? mutation≥threshold? no monster?) and the budgets burndown (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no MCP server** — `OpenGoal`/`IsClosed` are a pure library and `/goal` is a harness gesture; the goal does not yet warrant a *distinct* backend service (idea-intake and the changeset MCP already exist from prior steps; if a callable `goal_open` op emerges, record an OpenQuestion). **No new ChangeSet/SemanticDiff machinery** — S20 owns the envelope and the DRAFT→APPLIED commit-gate; S21 owns the SemanticDiff; both are **consumed** here, not redefined. **No red-wave/impact computation** — S22 owns the cascade that decides *which* mirrors redden; this step **calls** it to derive the red set, it does not re-implement it. **No idea schema** — `ideas` is a prior truth schema; here a goal *references* an idea and adds the `ideas.goal` promotion table only. **No evolution/`/evolve` loop** (the middle loop, §62–§63 ②) and **no outer reality loop** (§63 ③) — only the internal loop ① (the `/goal`, non-gameable stop). **No codegen/emitters** — there is no projection to emit from a goal itself.

## Test minimal (done)

**Done = a goal creates a DRAFT ChangeSet and at least one red mirror.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. (And the stop is non-gameable: the goal closes only when the red set is green ∧ prior green intact ∧ mutation ≥ threshold ∧ no monster — never on the agent's say-so, §57.)

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: runtime.goal.OpenGoal · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "opening a goal from an idea creates a DRAFT ChangeSet and a non-empty red set"   # THE done criterion
    state   (idea):      { id: "idea-order-discount", spec_delta: <add Order.discount>, mirror_delta: <Order.discount fixture> }
    state   (heads):     { ...current kernel heads... }
    command (open):      OpenGoal(idea, completeness)
    events:  [ Opened ]
    -> goal.changeset_ref points to a ChangeSet with status == "DRAFT"   # S20, the only door (idea → mirror → /goal)
    -> goal.red_set is non-empty                                         # at least one red mirror — the goal exists
    -> goal.status == "OPEN"

  fixture "an idea with no mirror is rejected (a vœu / monster)"          # §57, LIVRE XX
    state   (idea):      { id: "idea-no-mirror", spec_delta: <add X>, mirror_delta: <none> }
    command (open):      OpenGoal(idea, completeness)
    events:  [ Blocked ]
    -> block_reason.code == "IDEA_WITHOUT_MIRROR"
    -> block_reason.how_to_fix contains "draft_mirror_for_idea"
    -> no goal, no changeset is opened

  fixture "an idea whose mirror is already green has no goal"             # §56: a green test is not a goal
    state   (idea):      { id: "idea-already-true", spec_delta: <restate existing truth>, mirror_delta: <already-green> }
    command (open):      OpenGoal(idea, completeness)
    events:  [ Blocked ]
    -> block_reason.code == "NO_RED_SET"                                  # nothing to close ⇒ not a goal

  fixture "the goal closes ONLY when the red set is green AND prior green is intact"   # non-gameable stop (§57 ①)
    state   (goal):      { status: "OPEN", red_set: ["Order.discount.fixture"] }
    state   (sensors):   { "Order.discount.fixture": "red" }
    command (check):     IsClosed(goal, sensors, mutation=0.9, monsters=[])
    events:  [ stop == false ]                                           # red set still red ⇒ cannot close
    then state (sensors):{ "Order.discount.fixture": "green", priorGreen: "intact" }
    command (check):     IsClosed(goal, sensors, mutation=0.9, monsters=[])
    events:  [ stop == true ]                                            # red→green ∧ prior intact ∧ mut≥thr ∧ no monster

  fixture "a surviving red, a broken prior green, a low mutation score, or a monster keeps the goal OPEN"
    state   (goal):      { status: "OPEN", red_set: ["Order.discount.fixture"] }
    state   (sensors):   { "Order.discount.fixture": "green", priorGreen: "BROKEN" }  # regression on a prior truth
    command (check):     IsClosed(goal, sensors, mutation=0.9, monsters=[])
    events:  [ stop == false ]                                           # prior green not intact ⇒ blocked (§8)

  fixture "the recorded goal id is the content hash of its body"
    state   (goal):      { idea_ref, changeset_ref, red_set, status, budgets }
    command (compute):   canonical-hash(body)
    events:  [ goal.id == Hash(Canonicalize(body)) ]                     # content-addressed (S02 reused)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: runtime.goal.{OpenGoal,IsClosed} · test_kind: property · cert_language: rapid · authority: below
  ∀ idea with a mirror_delta:        OpenGoal opens a DRAFT ChangeSet (never APPLIED — only S20's commit-gate applies)
  ∀ idea promoted to a goal:         goal.red_set is non-empty (a goal always has ≥1 red mirror, §56)
  ∀ idea with no mirror_delta:       OpenGoal == Blocked(IDEA_WITHOUT_MIRROR) — never silently promoted
  ∀ idea already green:              OpenGoal == Blocked(NO_RED_SET)
  ∀ goal,sensors,mutation,monsters:  IsClosed is deterministic — same inputs ⇒ same verdict (no self-assessment input)
  ∀ goal with ≥1 still-red mirror OR broken prior green OR mutation<threshold OR any monster:  IsClosed == false
  ∀ closed goal:                     red set all green ∧ prior green intact ∧ mutation≥thr ∧ no monster (all four hold)
  ∀ goal:                            OpenGoal/IsClosed never panic — a malformed idea/goal yields a BlockReason/verdict
  ```

Both start **red** (no `goal` package, no `OpenGoal`/`IsClosed`, no `ideas.goal` table, no `Stop:goal-check` hook, no `/goal` skill). That red **is** the meta-`/goal` for this step. The fixtures are **means-tests toward the human red** (a goal opens a DRAFT ChangeSet + ≥1 red mirror; it closes only when computed-done) — **not** new truths the agent invents and then grades. The engine itself never lets the agent grade its own copy (§57 the whole point).

## Visualisation UI

- **Workbench route:** `front/web/app/goal/page.tsx` (new route `/goal`; do not touch existing routes). A read-only panel that renders the current goal (via the SELECT-only role): the **source idea**, the **DRAFT ChangeSet** badge (S20 lifecycle), the **red set** as a list of mirrors each coloured red (failing) → green (closed), the live **non-gameable stop** indicator with its four computed conditions (red set→green · prior green intact · mutation ≥ threshold · no monster) and the **budgets burndown** (time/turns/tokens). With a fresh goal it shows a DRAFT ChangeSet and ≥1 red mirror with the stop **not satisfied**; once the red set is green and the other conditions hold it shows the stop **satisfied** (the goal closeable) — the verdict rendered, not re-implemented.
- **Playwright e2e:** `tests/e2e/goal.spec.ts` — navigate to `/goal`, assert that opening a goal from an idea shows a **DRAFT** ChangeSet badge and **at least one red mirror** in the red set (the done criterion visible in the UI), and that the stop indicator reads **not satisfied** while any mirror is red and flips to **satisfied** only when the red set is green and prior green is intact. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/goal/**`, the new `back/migrations/<new>.sql`, the new `Stop:goal-check` binary under `back/hooks/stop/`, the new `.claude/skills/goal/SKILL.md`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/goal.spec.ts`, and `front/web/app/goal/**` — and otherwise **adds new files**. It defines one new contract (the `Goal` AST shape, `OpenGoal`/`IsClosed`, the idea→DRAFT-ChangeSet+red-set rule, the non-gameable stop, the `ideas.goal` table, the `Stop:goal-check` gate, the `/goal` skill); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes; if a prior `Stop` hook exists it is **composed/extended additively** (a new artifact may ADD a guardrail, never REMOVE one — §5 meta-loop rule). The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT. Any change to a **prior contract** it depends on — S02's record substrate / content-hash, the `ideas` schema shape, S20's `ChangeSet`/`Open`/DRAFT semantics and commit-gate, S21's SemanticDiff, S22's `Impact`/red-set derivation, S13's `BlockReason` shape, the sensor-result + mutation-score + monster sources, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S29 — "Goal engine (idea → DRAFT ChangeSet + red set, non-gameable
stop)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant
to kernel/mirrors/ideas/changesets/fitness), front=Next.js (the Workbench). Home = back/runtime/goal ONLY
(plus the Atlas migration in back/migrations, the new Stop:goal-check binary under back/hooks/stop, and the new
/goal skill under .claude/skills/goal). Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §56 (le test rouge EST le goal — a goal not expressed as a red test is a
vœu; le set rouge EST la todo-list), §57 (`/goal` = a real harness command — Codex CLI / Claude Code v2.1.139
— whose DEFAULT stop is weak: the agent grades its own copy; KRD's contribution is the NON-GAMEABLE stop = "le
set rouge du noyau passe au vert, sans casser un seul vert existant", deterministic, computational, no self-
assessment; budgets time/turns/tokens are the SECONDARY guard, declared not learned), §58 (the two test-first:
test-as-goal human above the wall vs test-as-means agent below — the agent may write means-tests, NEVER truth-
tests it would then satisfy), §59 + §60 (the full workflow: phase noyau then phase code, two commits in two
zones in that order; the goal opens the red set, TDD closes it) and §63 Algorithme ① (the bounded internal
loop with the non-gameable Stop hook), and LIVRE XX (l'idée = un candidat-vérité, promu par son miroir = le
/goal; an idea with no mirror is a wish/monster; two sources: human and reality). Read CONTEXT-MAP.md +
back/runtime/CONTEXT.md (goal engine, the internal loop, red set, idea/candidate-truth, the non-gameable stop
— and the AVOID lists). Read the prior steps' specs you DEPEND ON and CONSUME, never re-implement: S02 (records
substrate / Canonicalize / Hash), S04 (the wall / GRANTs), S13 (BlockReason shape), S20 (ChangeSet: Open →
DRAFT, the DRAFT→APPLIED commit-gate, atomic spec+mirror), S21 (SemanticDiff), S22 (Impact / red-wave =
WHICH mirrors redden). For any Next.js 16, Atlas, Go MCP/CLI, or Go API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: an IDEA is a candidate-truth (no freeze, no mirror yet); the ONLY door to truth is idea → mirror
    → /goal (§57, LIVRE XX); a GOAL = a DRAFT ChangeSet (S20) carrying the idea's spec_delta+mirror_delta
    atomically PLUS the RED SET (the failing mirror(s) that ARE the goal, §56 — "le set rouge EST la todo-
    list"). "OPEN/CLOSED" is COMPUTED, never declared: the non-gameable stop = red set→green ∧ prior green
    intact ∧ mutation≥threshold ∧ no monster (§57, §63 ①, §8) — the engine NEVER reads the agent's confidence.
    An idea with NO mirror is a vœu / monster (rejected). An idea already green has NO goal (NO_RED_SET —
    nothing to close, §56). This step delivers the ENGINE that OPENS the goal and COMPUTES its stop, NOT the
    red→green TDD motion itself (that is the agent's /src work), NOT the ChangeSet envelope/commit-gate (S20,
    consumed), NOT the SemanticDiff (S21, consumed), NOT the red-wave cascade that decides WHICH mirrors redden
    (S22, called not re-implemented), NOT the /evolve middle loop (§63 ②) or the outer reality loop (§63 ③) —
    internal loop ① ONLY. Sharpen each term against back/runtime/CONTEXT.md; if a term shifts, update
    CONTEXT.md / write an ADR inline. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = an idea
        { id, spec_delta, mirror_delta } + the current heads; command = OpenGoal(idea, completeness) and
        IsClosed(goal, sensors, mutation, monsters); events = the goal { changeset_ref→DRAFT, red_set, status }
        and the stop verdict. Cover: opening a goal from an idea ⇒ a DRAFT ChangeSet + a NON-EMPTY red set
        (THE done criterion) ; an idea with no mirror ⇒ Blocked(IDEA_WITHOUT_MIRROR), no goal/changeset opened ;
        an already-green idea ⇒ Blocked(NO_RED_SET) ; the goal closes ONLY when red set→green ∧ prior green
        intact (and stays OPEN on a surviving red, a broken prior green, low mutation, or a monster) ; the
        recorded goal id == Hash(Canonicalize(body)) (content-addressed, S02 reused).
      - PROPERTY (rapid, ∀, below the line): OpenGoal opens a DRAFT (never APPLIED) ; a promoted goal always has
        ≥1 red mirror ; an idea with no mirror_delta is never silently promoted ; an already-green idea yields
        NO_RED_SET ; IsClosed is deterministic and takes NO self-assessment input ; any still-red mirror OR
        broken prior green OR mutation<threshold OR any monster ⇒ IsClosed==false ; a closed goal ⇒ all four
        conditions hold ; OpenGoal/IsClosed never panic.
    Run them; watch them go RED (no goal package, no OpenGoal/IsClosed, no ideas.goal table, no Stop:goal-check
    hook, no /goal skill). That red IS the meta-/goal for this step. Do NOT write a truth-test you would then
    satisfy (no inventing a new stop invariant you'd grade yourself) — mirror the human intention only (a goal
    opens a DRAFT ChangeSet + ≥1 red mirror; it closes only when computed-done). The whole point of S29 is that
    the agent never grades its own copy (§57).

(c) TDD red → green → refactor in back/runtime/goal ONLY (plus the Atlas migration in back/migrations, the
    Stop:goal-check binary in back/hooks/stop, and the /goal skill in .claude/skills/goal). Outside-in. Build:
    the typed Goal AST (id, idea_ref, changeset_ref, red_set, status OPEN|CLOSED, budgets), a pure
    OpenGoal(idea, completeness)→Goal|BlockReason that REUSES S20's Open to open a DRAFT ChangeSet wrapping the
    idea's spec_delta+mirror_delta and REUSES S22's Impact to DERIVE the red set (rejecting an empty red set
    with NO_RED_SET and a mirror-less idea with IDEA_WITHOUT_MIRROR, both as S13 BlockReasons), and a pure
    IsClosed(goal, sensors, mutation, monsters)→bool implementing §63 ① (red set→green ∧ prior green intact ∧
    mutation≥threshold ∧ no monster) — no I/O, no clock/RNG, NO confidence input. Within the frozen slots, if a
    REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (Godog, rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/CLI,
    the harness /goal command itself are fixed). Likely genuine choices: the canonical goal-JSONB shape +
    content-hash (REUSE S02's Canonicalize/Hash — do NOT fork it) and how the engine reads the live red set /
    sensor + mutation + monster status via the SELECT-only role. Record a short ADR (docs/adr/) ONLY if a
    genuine choice is made. The migration is expand-only/append-only: add ideas.goal (id=hash PK, body jsonb,
    idea_ref, changeset_ref, status CHECK(OPEN|CLOSED), created_at, closed_at NULL), storing the red set INSIDE
    the JSONB body (NOT as foreign keys — a recorded goal must stay inspectable after heads move). GRANT the
    agent role SELECT only on ideas.goal (the wall); only the aidos writer role inserts/closes a goal, and the
    DRAFT→APPLIED transition stays owned by S20's commit-gate (the agent never stamps a goal CLOSED). Code only
    what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only;
    never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce OpenGoal on the
    idea-with-mirror / idea-without-mirror / already-green cases and IsClosed on the still-red / red→green /
    broken-prior-green cases, state the cause, propose. Check completeness: ideas.goal (the goal truth) has its
    living mirror (the fixture + property); no monster (no truth without a mirror, no orphan mirror, no idea
    promoted without a mirror, no goal closed while a mirror is red or a prior green is broken) — else Stop
    blocks. Verify the Stop:goal-check fault-injection test fires (leave one red mirror / break a prior green
    ⇒ the gate blocks the close). Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/goal/ → /goal: render the
    current goal (SELECT-only role) — the source idea, the DRAFT ChangeSet badge, the red set (each mirror red→
    green), the live non-gameable stop indicator (its four computed conditions: red set→green · prior green
    intact · mutation≥threshold · no monster) and the budgets burndown. Show a fresh goal as a DRAFT ChangeSet
    with ≥1 red mirror and the stop NOT satisfied; show the stop flipping to satisfied only when the red set is
    green and prior green is intact. Read the verdict; render it, do NOT re-implement OpenGoal/IsClosed. Do NOT
    touch existing routes. Add tests/e2e/goal.spec.ts (use the playwright-e2e skill) asserting the DRAFT badge +
    ≥1 red mirror on open (the done criterion visible in the UI) and that the stop reads not-satisfied while any
    mirror is red, satisfied only when red set→green ∧ prior green intact.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that goal is a
    deep, well-named module (Goal/OpenGoal/IsClosed/red_set/budgets separated, the idea→mirror→DRAFT-ChangeSet
    door and the non-gameable stop obvious), that OpenGoal/IsClosed are pure and REUSE S02's hash, S20's
    Open/DRAFT, S22's Impact, and S13's BlockReason WITHOUT duplicating them, that the migration/GRANT keeps the
    wall intact (ideas/changesets/mirrors are above the line, agent SELECT-only, the agent never stamps CLOSED),
    that the Stop:goal-check hook composes additively with any prior Stop hook (adds a guardrail, never removes
    one), and that boundaries match back/runtime/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas migration
    (persistence), the Stop:goal-check hook (non-bypassable rule, with its fault-injection test), the /goal
    Skill (repeatable gesture), the fixture + rapid property (behaviour proof), and the Next route
    (visualization). Do NOT add a new MCP server — OpenGoal/IsClosed is a pure library and /goal is a harness
    gesture; idea-intake and the changeset MCP already exist (if a callable goal_open op truly emerges, record
    an OpenQuestion, do not build it here). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin a stop rule KRD §57/§63① does not state:
  the goal closes iff red set→green ∧ prior green intact ∧ mutation≥threshold ∧ no monster; an idea with no
  mirror is rejected; an already-green idea is not a goal. If the exact goal-JSONB columns, the content-hash
  scheme, the ideas-schema shape, S20's ChangeSet/Open/DRAFT semantics, S22's Impact red-set output, S13's
  BlockReason shape, the sensor/mutation/monster status sources, or the ideas.goal node shape are not pinned by
  KRD / an existing migration / S02's Canonicalize / a referenced step, do NOT guess — record an OpenQuestion
  (provenance) and STOP on that branch. The example ids (idea-order-discount, Order.discount, Order.discount.
  fixture) are reused from S20/S22's pinned artifacts; do not coin new ones.
- You NEVER write a truth-test (a new stop/goal invariant you would then satisfy — the circularity §57/§58 is
  the exact thing this step exists to close). The fixture and property are means-tests toward the human red (a
  goal opens a DRAFT ChangeSet + ≥1 red mirror; it closes only when computed-done), not new truths. The engine
  takes NO agent-confidence input.
- Any change to a prior contract (S02 records/hash, the ideas schema, S20 ChangeSet/commit-gate, S21
  SemanticDiff, S22 Impact, S13 BlockReason, the wall GRANTs, the sensor/mutation/monster sources) goes through
  a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact, never hand-edit
  back/gen/**. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8, KRD §57): red set → green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster. Concretely: the OpenGoal fixtures pass — opening a goal from an idea creates a DRAFT
ChangeSet AND a NON-EMPTY red set (≥1 red mirror — THE done criterion), an idea with no mirror is
Blocked(IDEA_WITHOUT_MIRROR), an already-green idea is Blocked(NO_RED_SET); the IsClosed fixtures pass — the
goal closes ONLY when red set→green ∧ prior green intact (and stays OPEN on any surviving red, broken prior
green, low mutation, or monster); the recorded goal id is the content hash of its body; the rapid invariants
hold (DRAFT-not-APPLIED, ≥1-red, never-silently-promoted, NO_RED_SET, determinism without confidence input,
any-fault⇒open, closed⇒all-four-hold, no panic); the Stop:goal-check hook blocks the close on a surviving red
or broken prior green (fault-injection green); /goal renders the DRAFT ChangeSet + red set + the four-condition
stop indicator, with a passing Playwright e2e; the ideas.goal GRANT proves SELECT-only for the agent and the
agent never stamps CLOSED; the migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized
  (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright, the
  Stop:goal-check fault-injection test).
- UI route: /goal — what it renders (source idea + DRAFT ChangeSet badge + red set + four-condition non-gameable
  stop indicator + budgets burndown), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to ideas.goal go through the aidos CLI writer role,
  not the agent; the DRAFT→APPLIED transition stays owned by S20's commit-gate); any prior-contract change →
  ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. internal loop ① only (no /evolve middle loop, no outer reality loop), red-set derivation
  consumed from S22 not redefined, ChangeSet envelope/commit-gate consumed from S20, SemanticDiff consumed from
  S21, no MCP (no callable goal_op), sensor/mutation/monster status source assumption, single-cell goal (no
  macro→micro decomposition / fractal goals yet, §52).
- Next safe step: the smallest stable next tooth (e.g. macro→micro goal decomposition / the fractal cell, or
  wiring the goal into the /evolve middle loop ②) and why it is safe to chain.
```
