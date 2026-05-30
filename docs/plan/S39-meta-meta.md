# S39 — Meta-meta fitness (read-only) + SessionStart self-test (fault injection)

Subsystem: AIDOS Runtime | Home: `back/hooks/sessionstart` | Workbench route: `/meta`

## Objectif

Close the meta-meta loop: a **SessionStart Go hook** (`harness-self-test`) that, at every session start, runs a **deterministic fault-injection self-test** proving the three inviolable guarantees of KRD's NIVEAU 3 — **every sensor still fires** (break what it watches → it goes red), **the wall still refuses the agent's kernel/mirror/fitness writes**, and **the fitness definition was not modified by the méta loop** (the `fitness` schema, read-only, byte-identical to its graven baseline). The méta loop may **ADD** a guardrail, **never REMOVE** one (KRD LIVRE XIII §70); a removed guardrail is a self-test that goes red. This step does not author fitness — it **reads** it and asserts it is unchanged.

## Sortie attendue

Per CLAUDE.md §5 this step needs a **non-bypassable rule** (a Go hook — the self-test is exactly a stop-the-session condition), **pure logic** (a Go package for the self-test runner), **persistence** (an Atlas migration recording each self-test run, append-only), a **repeatable gesture** (the `/self-test` Skill), a **behaviour proof** (the BDD mirror), and a **visualization** (a Next route) — and nothing more:

- **Go hook** `back/hooks/sessionstart/` — the `harness-self-test` binary wired to the `SessionStart` phase (CLAUDE.md §3 Hooks row; KRD LIVRE XIII §71 `SessionStart: [ "harness-self-test" ]`). It is the **anti-drift gate of the méta loop**: at session start it runs the self-test and, if any of the three guarantees fails, returns a non-zero `BlockReason` (reuse S13's shape — `code`, `severity`, `explanation`, `how_to_fix[]`; e.g. `code: GUARDRAIL_REMOVED`, `MUTED_SENSOR`, `WALL_BREACHED`, `FITNESS_MUTATED`) and blocks the session from starting. It NEVER edits the `fitness` schema, the `kernel`/`mirrors` schemas, or any sensor it tests — it is below the line, it only **reads** truth (SELECT-only) and **runs** detectors. Because §5 hook-honesty forbids a hook that never fires, the hook's *own* meaning is fault-injection: it is the **mirror of the mirrors** (KRD §60 "le miroir du miroir, c'est « est-ce que ce détecteur détecte ? »"). Its self-test IS its fault-injection — there is no separate "does the self-test detect?" regress because the floor is deterministic mutation, not an LLM judge.

- **Go package** `back/hooks/sessionstart/selftest/` (pure logic, library form of the gesture) — the typed `SelfTest` runner: `Run(harness) → SelfTestReport | BlockReason`. The `SelfTestReport` shape: `sensors_checked []SensorProbe` (each: `sensor_id`, `injected_fault` description, `fired bool`), `wall_probe WallProbe` (`attempted_write` against each above-the-line schema — `kernel`, `mirrors`, `fitness` — and `refused bool`), `fitness_probe FitnessProbe` (`baseline_hash`, `current_hash`, `unchanged bool` — `current_hash` is `Hash(Canonicalize(fitness rows))` reusing S02's `Canonicalize`/`Hash`, do NOT fork it), `verdict` (`green` iff all sensors fired ∧ all wall writes refused ∧ fitness unchanged), and `at` (passed in, never `time.Now()` inside — determinism). Each probe is a **deterministic fault injection**: deliberately redden a known-green watched check and assert the sensor fires; attempt an agent-role write above the line and assert a permission-denied / `BlockReason`; recompute the fitness content-hash and compare to the graven baseline. No truth written; all probes are read-only or transactional rollbacks.

- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration adding `runtime.self_test_runs` (append-only ledger): `id`, `at timestamptz NOT NULL`, `verdict text NOT NULL CHECK (verdict IN ('green','red'))`, `sensors_fired int NOT NULL`, `sensors_total int NOT NULL`, `wall_refused bool NOT NULL`, `fitness_baseline_hash text NOT NULL`, `fitness_current_hash text NOT NULL`, `fitness_unchanged bool NOT NULL`, `block_reason jsonb` (the `BlockReason` when red, else null), `PRIMARY KEY (id)`. GRANTs: the agent DB role gets **SELECT only** on `fitness.*` (it reads the graven NIVEAU 3, never writes it — the wall, §2), SELECT on `runtime.self_test_runs`; only the `aidos` CLI writer role inserts run rows. The migration is **append-only / expand-only** and never alters or drops a prior table, GRANT, or the read-only posture of `fitness`.

- **Skill** `.claude/skills/self-test/` (`SKILL.md`, CLAUDE.md §5: repeatable gesture → Skill) — `/self-test`: the replayable gesture "run the harness self-test now" (the same routine the SessionStart hook runs, callable on demand). It encodes the procedure (inject the known fault into each sensor → assert it fires → roll back; attempt each above-the-line write as the agent role → assert refused; recompute the fitness content-hash → assert it equals the baseline; record the run via the writer role; on any failure emit a `BlockReason`), the **meta-loop rule** (a méta artifact may ADD a guardrail, NEVER REMOVE one — a missing/muted sensor, a breached wall, or a mutated fitness is a red self-test), and the **honesty rules** (never invent a sensor id, a fitness row, or a baseline hash; if the sensor inventory, the wall's protected-schema set, or the fitness baseline is not pinned, it becomes an OpenQuestion in `provenance`).

- **BDD mirror** — a **fixture** mirror (`state → command → events`: a harness with a known sensor set + the graven fitness → `Run` → a green report; then each mutated state → a red report) plus a **`rapid` property** mirror for the ∀ invariants (any muted sensor / any accepted above-the-line write / any fitness delta ⇒ red), conceptually stored in the `mirrors` schema and materialized to `tests/`. **Testcontainers (Go)** with real Postgres applies the migration so the GRANT proof (agent write above the line → permission denied) and the `self_test_runs` round-trip are verified end-to-end, not mocked. These ARE the done criteria (see below).

- **Next route** `front/web/app/meta/` → `/meta` — the Workbench panel rendering the latest self-test run (read via the SELECT-only role over `runtime.self_test_runs` + `fitness`): the three guarantees as green/red rows (sensors fired N/N, wall refused, fitness unchanged with baseline-vs-current hash), the per-sensor fault-injection result, and the fitness baseline as **read-only** (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — `Run` is a pure library and `/self-test` is a harness gesture (if a callable `self_test_run` op truly emerges, record an OpenQuestion). **No authoring of the `fitness` schema** — NIVEAU 3 is graven, human + reality own it (KRD §70); this step READS it and asserts it unchanged, it never defines "passed". **No new sensor / no new wall** — S04 owns the wall, S07 owns the sensors; this step PROVES they still fire, it does not re-implement them. **No CellVitality / promotion fitness** — vitality is a separate diagnostic tooth (KRD §66.2); this is the meta-meta self-test, not a promotion gate. **No level 4** — there is no governor above the meta-meta; the regress stops because the floor is deterministic fault-injection, not another judge (KRD §70 "qui gouverne le méta-méta ? L'humain + la réalité, point").

## Test minimal (done)

**Done = the self-test is green ∧ the fitness is immutable by every loop.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. Done is **computed** (red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster), never declared.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: hooks.sessionstart.{Run,harness-self-test} · test_kind: fixture · cert_language: operation-dsl/go · authority: below
  fixture "a healthy harness passes the self-test (all guarantees hold)"          # THE done criterion
    state   (harness):   { sensors: [<all known-green>], wall: <S04 GRANTs intact>, fitness: <graven baseline> }
    command (run):       Run(harness)
    events:  [ SelfTestRan ]
    -> report.verdict == "green"
    -> every sensor in report.sensors_checked has fired == true                   # each detector detects
    -> report.wall_probe.refused == true for kernel, mirrors AND fitness          # the wall holds
    -> report.fitness_probe.unchanged == true (current_hash == baseline_hash)     # fitness immutable

  fixture "a muted sensor reddens the self-test (guardrail removed)"              # méta loop removed a guard
    state   (harness):   { sensors: [<one watched check no longer fires>], wall: ok, fitness: baseline }
    command (run):       Run(harness)
    events:  [ SelfTestRan ]
    -> report.verdict == "red"
    -> BlockReason.code == "MUTED_SENSOR"  (or GUARDRAIL_REMOVED), how_to_fix non-empty

  fixture "a breached wall reddens the self-test (agent could write truth)"
    state   (harness):   { sensors: ok, wall: <agent role gained INSERT on kernel>, fitness: baseline }
    command (run):       Run(harness)
    events:  [ SelfTestRan ]
    -> report.wall_probe.refused == false ; report.verdict == "red"
    -> BlockReason.code == "WALL_BREACHED"

  fixture "a mutated fitness reddens the self-test (a loop edited its own fitness)"   # the cardinal sin
    state   (harness):   { sensors: ok, wall: ok, fitness: <one row changed vs the graven baseline> }
    command (run):       Run(harness)
    events:  [ SelfTestRan ]
    -> report.fitness_probe.unchanged == false (current_hash != baseline_hash)
    -> report.verdict == "red" ; BlockReason.code == "FITNESS_MUTATED"

  fixture "the self-test never writes the fitness it checks (read-only)"          # honesty / the wall on itself
    state   (harness):   { fitness: baseline }
    command (run):       Run(harness)
    events:  [ SelfTestRan ]
    -> the fitness rows are byte-identical before and after Run                   # the checker cannot touch what it checks
    -> only runtime.self_test_runs was appended (via the writer role)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: hooks.sessionstart.{Run} · test_kind: property · cert_language: rapid · authority: below
  ∀ harness h:  Run(h) == Run(h)                                  — determinism (no clock/RNG; `at` passed in, no map-order leak)
  ∀ harness h with every sensor firing ∧ wall refusing ∧ fitness == baseline:  Run(h).verdict == "green"
  ∀ harness h with ANY muted sensor:                              Run(h).verdict == "red" ∧ BlockReason emitted   — a removed guard always reddens
  ∀ harness h with ANY accepted above-the-line write:            Run(h).verdict == "red"                          — the wall must hold on kernel ∧ mirrors ∧ fitness
  ∀ harness h with fitness rows != baseline:                     Run(h).fitness_probe.unchanged == false ∧ red    — no loop edits its own fitness
  ∀ harness h:  fitness rows unchanged by Run(h)                                                                  — the checker is read-only on what it checks
  ∀ malformed harness / missing sensor inventory:                Run yields a BlockReason — never a panic, never an invented sensor id
  ```

Both start **red** (no `sessionstart` hook, no `selftest` package, no `Run`, no `runtime.self_test_runs` table, no `/self-test` skill). That red **is** the meta-`/goal` for this step. The fixtures are **means-tests toward the human red** (the self-test is green; the fitness is immutable by every loop) — **not** new truths the agent invents and then grades. The agent never authors the fitness it asserts unchanged, and never re-defines a sensor or the wall it probes (the wall §2; KRD §70 the inviolable).

## Visualisation UI

- **Workbench route:** `front/web/app/meta/page.tsx` (new route `/meta`; do not touch existing routes). A read-only panel that renders the **latest self-test run** (read via the SELECT-only role over `runtime.self_test_runs` + `fitness`): the three guarantees as a green/red checklist — **sensors fired N/N** (with the per-sensor fault-injection result: which fault was injected, did it fire), **wall refused** (kernel · mirrors · fitness, each), and **fitness unchanged** (baseline hash vs current hash, with a green/red badge). It also surfaces the **fitness baseline as read-only** (the graven NIVEAU 3 — definition of "passed" — rendered, never editable, with a visible "owned by human + reality, no loop edits this" marker) and the append-only history of prior runs. The verdict is rendered, not re-computed.
- **Playwright e2e:** `tests/e2e/meta.spec.ts` — navigate to `/meta`, assert the latest run shows the three guarantees green (sensors N/N fired, wall refused on kernel · mirrors · fitness, fitness baseline hash == current hash), assert the per-sensor fault-injection rows are listed, assert the fitness baseline panel has **no editable control** (read-only — the inviolable), and (against a seeded red run) assert a red guarantee surfaces its `BlockReason` code (e.g. `FITNESS_MUTATED`) while prior runs stay listed (append-only ledger). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/hooks/sessionstart/**` (the hook + the `selftest` package), the new `back/migrations/<new>.sql`, the new `.claude/skills/self-test/SKILL.md`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/meta.spec.ts`, and `front/web/app/meta/**` — and otherwise **adds new files**. It defines one new contract (the `SelfTest`/`Run`, the `SelfTestReport`/`SelfTestRun` shape, the three-guarantee verdict, the `runtime.self_test_runs` ledger, the `/self-test` skill); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no silent model replacement, no hand-edit of generated files (`back/gen/**`), no touching prior Workbench routes, and — cardinally — **no write to the `fitness` schema** (this step asserts it unchanged; writing it would be the very drift it exists to catch). The migration is **expand-only / append-only** and never alters or drops a prior table, GRANT, or the read-only posture of `fitness`. Any change to a **prior contract** it depends on — S02's `Canonicalize`/`Hash`, S04's wall / GRANT set and the protected-schema list it probes, S07's sensor inventory and fired-detection surface, S13's `BlockReason` shape, the `fitness` schema's read-only baseline — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. A new artifact may **ADD** a guardrail, **never REMOVE** one (§5 meta-loop rule; KRD §70) — and this hook is precisely the mechanical proof of that rule. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S39 — "Meta-meta fitness (read-only) + SessionStart self-test (fault
injection: each sensor fires, the wall holds, the fitness is unchanged)". Stack is FROZEN: back=Go, truth=Postgres
(append-only, content-addressed; the agent has NO write grant to kernel/mirrors/fitness — it READS the fitness
baseline and asserts it UNCHANGED, it never writes it), front=Next.js (the Workbench). Home = back/hooks/sessionstart
ONLY (the hook binary + its selftest package), plus the Atlas migration in back/migrations, the new /self-test skill
under .claude/skills/self-test, and the /meta route under front/web. Follow the CLAUDE.md §6 per-step loop IN ORDER.
Never go prompt → code.

Read BEFORE touching anything: KRD.md LIVRE XIII (la pile méta-méta — les 4 niveaux ; §70 "Le méta-méta isolé —
l'inviolable" : la fitness = définition de « réussi », non-gameable, AUCUNE boucle ne peut l'éditer ; la boucle méta
peut AJOUTER un garde-fou, JAMAIS RETIRER ; vérifié par l'INJECTION DE FAUTE à chaque session — on plante une
violation connue et on asserte que le détecteur fire, on asserte que le mur refuse toujours l'écriture du noyau par
l'IA, on asserte que la fitness n'a pas été modifiée ; §71 `SessionStart: [ "harness-self-test" ]` ; "il n'y a pas de
niveau 4 : le méta-méta est gravé, l'humain + la réalité, point"), LIVRE XII §60 (le miroir du miroir = « est-ce que ce
détecteur détecte ? » ; la régression s'arrête parce qu'à la fin c'est de la mutation/fault-injection DÉTERMINISTE,
pas un LLM-judge), and CLAUDE.md §2 (the wall — write-forbidden: kernel/mirrors/fitness), §8 (anti-Goodhart: done is
computed, weights/thresholds are declared above the line never learned). Read CONTEXT-MAP.md ("fitness non-gameable
(NIVEAU 3): the inviolable méta-méta — fitness function + layer grammar + waterline — physically hosted by the Runtime
but owned only by human and reality; no loop edits its own fitness; there is no level 4") and back/runtime/CONTEXT.md
(the harness "orchestrates and enforces the truth but can never reach its own fitness or the wall"; the five guardrails
are hooks wired in hooks.yaml incl. SessionStart). Read the prior steps you DEPEND ON and CONSUME, never re-implement:
S02 (Canonicalize / Hash — version = hash, for the fitness baseline content-hash), S04 (the wall / PreToolUse hook +
the Postgres GRANTs + the protected-schema set you PROBE — kernel, mirrors, fitness), S07 (the sensors / PostToolUse
hook + the sensor inventory + the fired-detection surface you PROBE), S13 (the BlockReason shape). For any Next.js 16,
Atlas, or Go doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: META-META = NIVEAU 3 = the FITNESS (definition of "passed") + the layer grammar + the waterline — it is
    INVIOLABLE, owned by the HUMAN + REALITY, no loop edits its own fitness, there is NO level 4. The SELF-TEST
    (harness-self-test) is the SessionStart FAULT-INJECTION that proves three guarantees at every session start:
    (1) EVERY SENSOR FIRES — break a known-green watched check, assert the detector goes red (the mirror of the
    mirrors — "est-ce que ce détecteur détecte ?"); (2) THE WALL HOLDS — attempt an agent-role write above the line
    on kernel, mirrors AND fitness, assert it is REFUSED; (3) THE FITNESS IS UNCHANGED — recompute Hash(Canonicalize
    (fitness rows)) and assert it equals the GRAVEN BASELINE (a méta loop that edited its own fitness reddens here).
    The méta loop may ADD a guardrail, NEVER REMOVE one; a removed guardrail is a red self-test. The self-test is
    READ-ONLY on the fitness it checks (the checker cannot touch what it checks). This step delivers the SessionStart
    HOOK + the self-test runner + the read-only fitness assertion — NOT the fitness schema itself (graven, human+reality
    own it), NOT a new sensor (S07), NOT a new wall (S04), NOT CellVitality / promotion fitness, NOT a level-4 governor
    (there is none — the floor is deterministic fault-injection). Sharpen each term against back/runtime/CONTEXT.md and
    CONTEXT-MAP.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for the
    runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = a harness { sensors, wall
        (S04 GRANTs), fitness (graven baseline) }; command = Run(harness); events = a SelfTestReport { sensors_checked
        (each: sensor_id, injected_fault, fired), wall_probe (refused per kernel/mirrors/fitness), fitness_probe
        (baseline_hash, current_hash, unchanged), verdict, at } or a BlockReason. Cover: a HEALTHY harness ⇒ green,
        every sensor fired, wall refused on kernel ∧ mirrors ∧ fitness, fitness unchanged (THE done criterion) ; a
        MUTED sensor ⇒ red + BlockReason MUTED_SENSOR/GUARDRAIL_REMOVED ; a BREACHED wall (agent gained INSERT on
        kernel) ⇒ wall_probe.refused == false + red + WALL_BREACHED ; a MUTATED fitness (one row != baseline) ⇒
        fitness_probe.unchanged == false + red + FITNESS_MUTATED (the cardinal sin) ; and the self-test NEVER writes
        the fitness it checks (rows byte-identical before/after Run; only runtime.self_test_runs appended).
      - PROPERTY (rapid, ∀, below the line): Run(h) == Run(h) (determinism — `at` passed in, no clock/RNG/map-order) ;
        all-green harness ⇒ verdict green ; ANY muted sensor ⇒ red + BlockReason ; ANY accepted above-the-line write
        ⇒ red ; fitness != baseline ⇒ unchanged == false + red ; fitness rows unchanged by Run (read-only) ; a
        malformed harness / missing sensor inventory ⇒ a BlockReason, never a panic, never an invented sensor id.
    Use Testcontainers (real Postgres + the migration) for the GRANT proof (agent write above the line → permission
    denied) and the self_test_runs round-trip. Run them; watch them go RED (no sessionstart hook, no selftest package,
    no Run, no runtime.self_test_runs table, no /self-test skill). That red IS the meta-/goal for this step. Do NOT
    write a truth-test you would then satisfy (no inventing a fitness invariant you'd grade yourself) — mirror the
    human intention only (the self-test is green; the fitness is immutable by every loop). The agent never authors the
    fitness it asserts unchanged, nor the sensors/wall it probes (the wall §2; KRD §70).

(c) TDD red → green → refactor in back/hooks/sessionstart ONLY (the harness-self-test binary + the selftest package),
    plus the Atlas migration in back/migrations, the /self-test skill in .claude/skills/self-test, and the /meta route
    in front/web. Outside-in. Build: the typed SelfTest runner Run(harness) → SelfTestReport|BlockReason that is a
    PURE function (no time.Now() inside — `at` is passed in; no RNG; no map-iteration-order leak) performing three
    DETERMINISTIC FAULT INJECTIONS — (1) for each sensor, deliberately redden a known-green watched check and assert
    it fires, then roll back; (2) attempt an agent-role write on kernel, mirrors AND fitness and assert permission-
    denied / BlockReason; (3) recompute Hash(Canonicalize(fitness rows)) and compare to the graven baseline. REUSE
    S02's Canonicalize/Hash for the fitness content-hash (do NOT fork it). REUSE S13's BlockReason shape. REUSE S04's
    protected-schema set and S07's sensor inventory + fired-detection surface — PROBE them, do NOT re-implement them.
    Wire the binary to the SessionStart phase; on any failure return a non-zero BlockReason and block the session.
    Within the frozen slots, if a REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the
    SIMPLEST, never touch the mandatory minimum (the fixture/Operation-DSL interpreter, rapid, sqlc, Atlas, pgx,
    Testcontainers, the Go hook-binary form are fixed). Likely genuine choices: how a sensor's "watched check" is
    reddened deterministically (a tiny in-process fault adapter vs a fixture corpus — pick the simplest that is
    reproducible and rolls back cleanly), and how the agent-role write attempt is driven (a dedicated low-grant pgx
    connection via Testcontainers). Record a short ADR (docs/adr/) ONLY if a genuine choice is made. The migration is
    expand-only/append-only: add runtime.self_test_runs (at, verdict CHECK(green|red), sensors_fired, sensors_total,
    wall_refused, fitness_baseline_hash, fitness_current_hash, fitness_unchanged, block_reason jsonb, PK(id)). GRANT
    the agent role SELECT only on fitness.* and on runtime.self_test_runs (the wall — it reads the graven NIVEAU 3,
    never writes it); only the aidos writer role inserts run rows. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors + Testcontainers, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor or flaky Testcontainers run; reproduce a
    muted sensor and assert the self-test reddens; reproduce an agent-role write above the line and assert it is
    refused; reproduce a one-row fitness mutation and assert fitness_probe.unchanged flips to false; reproduce Run
    twice and assert byte-identical reports (determinism). State the cause, propose. Check completeness:
    runtime.self_test_runs has its living mirror (the fixture + property); no monster (no guarantee without its probe,
    no self-test that writes the fitness it checks, no muted sensor passing green, no invented sensor id) — else Stop
    blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/meta/ → /meta: render the latest
    self-test run (SELECT-only role over runtime.self_test_runs + fitness) as the three guarantees in a green/red
    checklist — sensors fired N/N (with the per-sensor fault-injection result), wall refused (kernel · mirrors ·
    fitness, each), fitness unchanged (baseline hash vs current hash) — plus the fitness BASELINE rendered READ-ONLY
    (the inviolable NIVEAU 3, with a visible "owned by human + reality, no loop edits this" marker) and the append-only
    run history. Read the verdict; render it, do NOT re-run Run. Do NOT touch existing routes. Add tests/e2e/meta.spec.ts
    (use the playwright-e2e skill) asserting the three guarantees show green for a healthy run, the per-sensor fault-
    injection rows are listed, the fitness baseline panel has NO editable control (read-only — the inviolable), and a
    seeded red run surfaces its BlockReason code (e.g. FITNESS_MUTATED) while prior runs stay listed (append-only).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that selftest is a
    deep, well-named module (SelfTest/Run/SelfTestReport/SensorProbe/WallProbe/FitnessProbe separated, the three
    guarantees obvious, the read-only-on-fitness posture explicit), that Run is pure and REUSES S02's Canonicalize/Hash
    and S13's BlockReason WITHOUT duplicating them, that it PROBES S04's wall and S07's sensors rather than
    re-implementing them, that the migration/GRANT keeps the wall intact (fitness is above the line, agent SELECT-only,
    the run ledger written below the line via the writer role), and that boundaries match back/runtime/CONTEXT.md (the
    harness can never reach its own fitness or the wall). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go hook (non-bypassable rule — SessionStart self-test) and
    its selftest package (pure logic), the Atlas migration (persistence — the run ledger), the /self-test Skill
    (repeatable gesture), the fixture + rapid property (behaviour proof), and the /meta Next route (visualization). Do
    NOT add a new MCP server — Run is a pure library and /self-test is a harness gesture (if a callable self_test_run
    op truly emerges, record an OpenQuestion, do not build it here). Do NOT add a new SENSOR or a new WALL — S07 owns
    the sensors, S04 owns the wall; this step PROVES they hold (and §5 hook-honesty is satisfied because the hook's own
    self-test IS its fault-injection — a guardrail that never fired is dead). A new artifact may ADD a guardrail, never
    REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, a sensor id, a fitness row, a baseline hash, or a business-rule. Do not coin a
  sensor the inventory does not list, a protected schema beyond kernel/mirrors/fitness, or a fitness definition. If
  the sensor inventory (S07), the wall's protected-schema set + GRANTs (S04), S02's Canonicalize/Hash, S13's
  BlockReason shape, the fitness baseline, or the runtime.self_test_runs columns are not pinned by KRD / an existing
  migration / a referenced step, do NOT guess — record an OpenQuestion (provenance) and STOP on that branch.
- You NEVER write a truth-test (a new fitness invariant you would then satisfy — the circularity the meta-meta exists
  to forbid). The fixture and property are means-tests toward the human red (the self-test is green; the fitness is
  immutable by every loop), not new truths. The agent never authors the fitness it asserts unchanged, nor the
  sensors/wall it probes (the wall §2; KRD §70 the inviolable).
- Any change to a prior contract (S02 Canonicalize/Hash, S04 wall GRANTs + protected-schema set, S07 sensor inventory
  + fired-detection surface, S13 BlockReason, the fitness read-only baseline) goes through a ChangeSet + SemanticDiff.
  Add new files; never silently rewrite a prior artifact; NEVER write the fitness schema (writing it would be the very
  drift this step exists to catch). An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥ threshold ∧
no monster. Concretely: the self-test fixtures pass — a healthy harness is GREEN with every sensor fired, the wall
refused on kernel ∧ mirrors ∧ fitness, and the fitness unchanged (current_hash == baseline_hash); a muted sensor, a
breached wall, and a mutated fitness each turn the verdict RED with the right BlockReason code (MUTED_SENSOR /
WALL_BREACHED / FITNESS_MUTATED); the self-test never writes the fitness it checks (rows byte-identical, only
self_test_runs appended); the rapid invariants hold (determinism, all-green ⇒ green, any muted sensor ⇒ red, any
accepted above-the-line write ⇒ red, fitness != baseline ⇒ red, read-only on fitness, no panic / no invented sensor on
malformed input); Testcontainers green (the agent write above the line is permission-denied); /meta renders the three
guarantees + per-sensor fault-injection + the read-only fitness baseline + a passing Playwright e2e; the GRANT proves
SELECT-only on fitness for the agent (it reads the graven NIVEAU 3, never writes it); the migration is append-only/
expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, Testcontainers incl. the GRANT proof,
  biome, eslint, playwright).
- UI route: /meta — what it renders (three guarantees green/red + sensors fired N/N + per-sensor fault-injection +
  wall refused on kernel/mirrors/fitness + fitness baseline-vs-current hash + read-only fitness baseline panel + run
  history), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (run-ledger writes to runtime.self_test_runs go through the aidos CLI
  writer role, not the agent; the fitness schema is NEVER written); any prior-contract change → ChangeSet +
  SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. self-test covers the three guarantees over the S07 sensor inventory + S04 wall + the fitness
  baseline only (no new sensors/wall defined here), fitness consumed read-only (never authored), no MCP (no callable
  self_test_run op), no level-4 governor (the floor is deterministic fault-injection by design), CellVitality /
  promotion fitness out of scope.
- Next safe step: the smallest stable next tooth (e.g. wiring the self-test verdict into the Stop hook so a red
  meta-meta blocks the session end too, or surfacing the run history trend in the cost/vitality panel) and why it is
  safe to chain.
```
