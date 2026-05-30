# S07 — Sensors: computational checks on changed code with on_fail block (PostToolUse hook)

Subsystem: AIDOS Runtime | Home: `back/hooks/posttooluse` | Workbench route: `/sensors`

## Objectif

Wire the computational **sensors** at `PostToolUse`: after each agent diff below the waterline, a Go hook runs the deterministic checks on the **changed code** (gofmt/vet, lint, archtest, affected mirrors/tests) and on any failure returns `on_fail: block` — the agent self-certifies on the computational only. A `sensor_runs` table records every run (verdict + per-check results) so the wall's twin, the sensor, is auditable and provably fires.

## Sortie attendue

Only the artifacts that apply per CLAUDE.md §5 — sensors are a **non-bypassable rule** (Hook) plus **persistence** (migration), with a **behaviour proof** and a **UI**:

- **Go hook binary** — `back/hooks/posttooluse/` — reads a `PostToolUse` tool-call event on stdin (an `Edit|Write|MultiEdit` below the waterline), resolves the **changed code** set, runs the computational sensor suite, and emits a verdict: on any failing check `block` with an actionable `BlockReason{code, severity, explanation, how_to_fix[]}` (`code = SENSOR_FAILED`); on all-green `allow`/passthrough. The canonical suite mirrors KRD §74 `run: ["typecheck","lint","archtest","run-mirrors --affected"], on_fail: block`, mapped to the frozen Go stack: **gofmt + go vet** (typecheck/format), **lint** (go vet + the repo linter; Biome at root, ESLint in front/web for front diffs), **archtest** (go-arch-lint / depguard — the frozen Arch-fitness slot), **affected tests/mirrors** (`go test` on the affected packages + the affected Godog/rapid mirrors). (CLAUDE.md §5: non-bypassable rule → Hook, Go binary.)
- **Go package** — the sensor runner: the changed-code resolver (event → affected packages/files), the per-check adapter interface (`name → {pass, output, duration}`), and the verdict aggregator (any-fail ⇒ block). Lives with the hook in `back/hooks/posttooluse/` (single-use logic, no separate home — §Simplicity). It **invokes** the frozen tools as subprocesses; it does not reimplement them.
- **Postgres migration (Atlas)** — `back/migrations/` — the **`sensor_runs`** table (and a child `sensor_check_results` if the per-check rows are normalized): append-only, content-addressed by the diff/event hash, columns for `run_id`, `event_hash`, `target` (changed-code set), `verdict` (`block|allow`), `started_at/finished_at`, and the per-check `{name, pass, output_digest, duration_ms}`. This is below the waterline (a Runtime audit log, **not** kernel/mirrors/fitness), so the agent role MAY be granted write here — confirm the grant boundary against S04 before assuming it. Append-only, expand-contract (CLAUDE.md §5: persistence → Atlas migration).
- **BDD mirror** — stored in the `mirrors` schema, materialized to `tests/` for the runner (see "Test minimal"). The mirror is the proof a failing sensor blocks.
- **Next route** — `front/web/app/sensors/` — the Workbench `/sensors` panel reading `sensor_runs`: the live sensor suite, the latest run's per-check verdicts, and a feed of recent block events (see "Visualisation UI").

Explicitly **NOT** in scope (would be monsters / out of slot here): no **MCP server** — the hook is invoked by the harness lifecycle, not exposed as a callable backend op; if a later step needs "rerun sensors on demand" as a tool, that is a `sensors` MCP server then, recorded here as an **OpenQuestion**, not invented now. No **Skill** yet (the `/diagnose` gesture already exists; a "fix-failing-sensor" skill is only earned after a real recurring failure). No kernel-AST emission, no mutation-testing wiring (gremlins is a pipeline/post-integration sensor, §19's second drawer — not this per-diff drawer).

> Per CLAUDE.md §5 hook-honesty: this hook ships with a **fault-injection test** — inject a fault into a watched check (e.g. unformatted Go, a failing affected test, an arch violation) and assert the sensor goes red and `block`s; clean the code and assert it goes green. A sensor that never fires is governance theatre (KRD §16 "le test décisif" — *est-ce que ce contrôle se déclenche un jour ?*).

## Test minimal (done)

**Done criteria:** *A failing sensor blocks; fault-injection proves it fires.*

Restated as a **failing-first** BDD mirror to write **before** any hook code (red is the `/goal`). One nature per cert-language:

- **Journey (N0) — Gherkin / Godog**, stored in `mirrors`, materialized to `tests/`:

  ```gherkin
  Feature: PostToolUse sensors block a failing diff and pass a clean one
    Scenario: a diff with a failing affected test is blocked
      Given a PostToolUse event for an "Edit" below the waterline
      And the changed code makes an affected test fail
      When the PostToolUse hook runs the computational sensors
      Then the verdict is "block"
      And the BlockReason code is "SENSOR_FAILED"
      And the BlockReason names the failing check and a how_to_fix
      And a sensor_runs row is recorded with verdict "block"

    Scenario Outline: every computational check can block on its own fault
      Given a PostToolUse event for an "Edit" below the waterline
      And the changed code violates the "<check>" sensor
      When the PostToolUse hook runs the computational sensors
      Then the verdict is "block"
      And the failing check in the sensor_runs row is "<check>"
    Examples:
      | check     |
      | gofmt     |
      | vet       |
      | lint      |
      | archtest  |
      | affected  |

    Scenario: a clean diff passes
      Given a PostToolUse event for an "Edit" below the waterline
      And the changed code passes gofmt, vet, lint, archtest and all affected tests
      When the PostToolUse hook runs the computational sensors
      Then the verdict is "allow"
      And a sensor_runs row is recorded with verdict "allow"
  ```

- **Invariant (∀) — property test (rapid, Go):** for any subset of checks marked failing, `aggregate(results)` ⇒ `block` **iff** at least one check failed, else `allow`; there is no third verdict; `block` ⇒ code is always `SENSOR_FAILED` and the recorded `failing[]` is exactly the failing subset (no silent drop — an unknown/errored check is itself a failure, never ignored, per KRD §82 the `.passthrough()` anti-pattern).

- **Fault-injection (sensor-honesty, the §5 mandatory test):** start from a green workspace; inject one real fault per check (write unformatted Go → gofmt red; introduce a vet error; break an arch boundary the archtest guards; make an affected test fail) and assert the hook returns `block` each time; revert and assert `allow`. This proves the sensor fires on what it watches, not just that the aggregator math holds.

All three are **red first** (no hook binary, no runner, no `sensor_runs` migration applied). Done = red set → green ∧ prior green intact ∧ no monster (CLAUDE.md §8 — done is computed, never declared).

## Visualisation UI

**Workbench route:** `front/web/app/sensors/` → `/sensors`. A read-only panel showing: the **computational sensor suite** (gofmt, vet, lint, archtest, affected — KRD §19's per-diff drawer, labelled "computational · self-certified"), the **latest run** with each check's pass/fail + duration, and a feed of recent **block events** (`SENSOR_FAILED` BlockReason: which check, explanation, how_to_fix). Source is the `sensor_runs` table; the page **projects** it, never re-encodes. New route only — do not touch existing routes (`/contract`, `/wall`, …).

**Playwright e2e** (`tests/e2e/sensors.spec.ts`, via the `playwright-tester` agent + `playwright-e2e` skill; `playwright.config.ts` already has the `webServer` block, baseURL `http://localhost:3000`):

```
Given the Workbench is running
When I navigate to /sensors
Then I see the computational sensor suite listing gofmt, vet, lint, archtest, affected
And I see the latest run with a per-check verdict
And I see a block event with code SENSOR_FAILED naming the failing check and its how_to_fix
```

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: `back/hooks/posttooluse/**`, the new `back/migrations/` `sensor_runs` migration, the `mirrors`-stored Gherkin/property/fault-injection materialized to `tests/`, `tests/e2e/sensors.spec.ts`, and `front/web/app/sensors/**`. It must not hand-edit generated files (`back/gen/**`), must not touch prior Workbench routes, must not write truth directly, and must not modify the S04 `PreToolUse` hook or its GRANTs. Any change to a prior contract (the `BlockReason` type shape from S04, the waterline definition, the CLI's computational-check surface from S03, an existing migration) goes through a **ChangeSet** + a **SemanticDiff** — never a silent rewrite (CLAUDE.md §9). If a real tool choice is made inside a frozen slot (e.g. the archtest tool, the changed-set resolution mechanism), record an **ADR**.

## Prompt a lancer

```text
You are step-executor for AIDOS step S07 — "Sensors" (PostToolUse computational checks on changed
code, on_fail block). Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the
agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench).
Home = back/hooks/posttooluse. Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.

(a) GRILL-WITH-DOCS the intention first. Run /grill-with-docs. One intention, ≤5 scenarios.
    Sharpen the ubiquitous language against CONTEXT-MAP.md + the Runtime CONTEXT.md: sensor (capteur),
    computational vs inferential (KRD §19 — only the COMPUTATIONAL per-diff drawer is in scope; LLM
    review is inferential and out), "changed code" / affected set, on_fail: block, the BlockReason
    twin of the wall. Confirm against KRD.md (§74 the canonical PostToolUse line
    run:["typecheck","lint","archtest","run-mirrors --affected"], on_fail: block; §19 the three timing
    drawers; §16/§64 "a control that never fires is theatre"). Map the four KRD checks onto the frozen
    Go stack: gofmt+go vet, lint (go vet + Biome root / ESLint front), archtest (go-arch-lint/depguard),
    affected = go test on affected pkgs + affected Godog/rapid mirrors. For any Next.js 16 / Atlas /
    Go API doubt use context7 or node_modules/next/dist/docs. Update CONTEXT.md / write an ADR if a term
    or boundary is sharpened (e.g. what "affected" means, what counts as below-waterline for sensing).

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema (reflects=S07 sensors,
    test_kind=journey/invariant, cert_language=gherkin/rapid, liveness=live) and materialized to tests/.
    Three forms: (N0) Gherkin/Godog "a failing affected test blocks with SENSOR_FAILED and records a
    sensor_runs row; a clean diff allows"; (∀) a rapid property "aggregate(results) blocks iff any check
    failed, else allows; block ⇒ code SENSOR_FAILED; an errored/unknown check is a failure, never
    silently dropped"; plus the sensor-honesty FAULT-INJECTION (inject one real fault per check
    {gofmt, vet, lint, archtest, affected} → assert block; revert → assert allow). Run them. They MUST
    be RED (no binary, no runner, no migration). That red IS the /goal.

(c) TDD red → green → refactor, in back/hooks/posttooluse ONLY (plus the back/migrations/ sensor_runs
    file). Outside-in. The hook INVOKES the frozen tools as subprocesses — never reimplements gofmt/vet/
    test. Within the frozen slots, search the CURRENT (May 2026) best tool AT MOST 3, pick the SIMPLEST,
    never touch the mandatory minimum (Godog, rapid, sqlc/pgx, Atlas, go test are fixed). The likely real
    choices are: the archtest tool (go-arch-lint vs depguard — the replaceable Arch-fitness slot) and the
    changed-set resolution (event payload vs `git diff` vs `go list`). If you make a genuine choice,
    record a short ADR (docs/adr/000N-...); otherwise do not. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse — you are now dogfooding the very thing you build):
    gofmt / go vet / strict Go, Biome at the monorepo root, ESLint in front/web. Self-certify on the
    COMPUTATIONAL only. Never declare the behaviour green from tests you wrote — done is computed.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce a real diff that
    fails an affected test and confirm the hook returns block with SENSOR_FAILED and writes a sensor_runs
    row, then confirm a clean diff allows. Run the fault-injection per check; a sensor that never fires
    is dead — assert each one actually goes red on its injected fault and green on revert.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is required). Create front/web/app/sensors/ →
    /sensors: the computational sensor suite (gofmt, vet, lint, archtest, affected), the latest run's
    per-check verdicts + durations, and a block-event feed (SENSOR_FAILED: which check, explanation,
    how_to_fix). Read from sensor_runs; project, don't re-encode. Do NOT touch existing routes. Add
    tests/e2e/sensors.spec.ts (use the playwright-e2e skill) asserting the suite list, a per-check
    verdict, and a visible SENSOR_FAILED event with its how_to_fix.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: confirm the
    sensor runner is a deep, well-named module (resolver / check-adapter / aggregator), the per-check
    adapters share one interface, no ball of mud, boundaries match CONTEXT.md, the BlockReason type is
    reused from S04 (not duplicated).

(h) CREATE ARTIFACTS PER §5: the Hook (back/hooks/posttooluse, this step) and the Postgres migration
    (back/migrations/ sensor_runs, Atlas, append-only). Do NOT add an MCP server or a Skill — the hook is
    harness-invoked, not a callable op, and no replayable gesture is earned yet; record "sensors MCP for
    on-demand rerun" and "fix-failing-sensor skill" as OpenQuestions if they recur. A new artifact may ADD
    a guardrail, never REMOVE one (the meta-loop rule).

HONESTY RULES (mandatory):
- Never invent a target, targetId, or business-rule. If the exact below-waterline write-grant for
  sensor_runs, the PostToolUse event shape, the changed-set field, the archtest config, or the
  affected-mirror resolution are not pinned by an existing migration / ADR / CONTEXT.md / the S04 GRANTs,
  do NOT guess — record an OpenQuestion and stop on that branch.
- You never write a truth-test (a new invariant you would then satisfy — the circularity). The sensor's
  mirror is a means-test toward the human red, not a new truth; the sensors check conformance to the
  kernel, they do not define it.
- An unknown/errored check is a FAILURE made explicit, never a silent pass (KRD §82 .passthrough()
  anti-pattern): a missing or crashing sensor blocks, it does not allow.
- Any change to a prior contract (BlockReason shape, waterline, the S03 CLI check surface) goes through a
  ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact, never hand-edit
  back/gen/**. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

DONE CRITERIA (computed, not declared): red set → green ∧ prior green intact ∧ a failing affected test (or
any single injected check fault) yields verdict block + BlockReason code SENSOR_FAILED + a sensor_runs row,
∧ a clean diff yields allow + a sensor_runs row ∧ the fault-injection fires red→green for every check ∧ no
monster ∧ /sensors renders with a passing Playwright e2e.

END WITH THE STEP REPORT:
- BDD added: which mirrors (Gherkin/Godog journey, rapid aggregate property, fault-injection per check)
  and where in `mirrors` / tests/.
- Tests run: commands + red→green transition (runner unit/property, Godog journey, fault-injection,
  e2e).
- UI route: /sensors + the Playwright spec path and result.
- ChangeSet status: any prior-contract change (BlockReason, waterline, CLI surface) → ChangeSet +
  SemanticDiff, else "none".
- Red-set status: started red, now green (list any still-red).
- Known limits: e.g. archtest coverage, affected-set precision, mutation/pipeline sensors deferred,
  sensor_runs grant OpenQuestion.
- Next safe step: the stable phase this leaves (sensors enforce computational on every diff) and the
  smallest next tooth that consumes it (e.g. the Stop completeness/goal-check hook, or the run-mirrors
  affected-resolver).
```
