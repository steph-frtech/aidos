# S05 — CI ratchet: replay every mirror, reject red regressions

Subsystem: AIDOS Mirror | Home: `back/mcp/mirror-runner` | Workbench route: `/mirrors`

## Objectif

Build the ratchet's enforcement edge: an MCP `mirror-runner` that replays **every** materialized mirror, records each run append-only in a `mirror_runs` table, and a CI hook that **rejects a merge** the moment a step turns a previously-green mirror red. This is KRD iteration 3 made mechanical — the cliquet catching a silent regression *before* the merge, never after.

## Sortie attendue

Per CLAUDE.md §5, only the artifacts that actually apply to this step:

- **MCP server (Go)** — `back/mcp/mirror-runner/` — the *capability*: read the set of living, materialized mirrors from the `mirrors` schema, run them all, and compare each result against the prior-green baseline. Read-only against `mirrors`/`kernel` (the wall: the agent has no write grant to kernel/mirrors/fitness); it writes **only** to `mirror_runs` (its own run-log).
- **Postgres migration (append-only)** — `back/migrations/` — adds the `mirror_runs` table: one immutable row per `(mirror_id, mirror_version, content_hash, run_id, status green|red, baseline_status, regressed bool, ran_at, commit/changeset ref)`. Content-addressed, never updated in place; a re-run appends a new row. No `GRANT UPDATE/DELETE` to the agent role.
- **Hook (Go binary)** — `back/hooks/ci-ratchet/` — the *non-bypassable rule*: a pre-merge gate that invokes `mirror-runner` over the full set and returns a non-zero `BlockReason` (`RED_REGRESSION`) if any mirror that was green on the merge base is red on the candidate. Ships with a **fault-injection test**: deliberately redden one prior mirror, assert the hook goes red (a hook that never fires is dead — §5 hook honesty).
- **BDD mirror** — `tests/` + a row in the `mirrors` schema — the behaviour proof for the ratchet itself: "a step that reddens a prior mirror is rejected before merge." Written red, first (see below).
- **Next route (Workbench)** — `front/web/app/mirrors/` — the `/mirrors` panel surfacing the latest run per mirror (green/red), the regressed set, and the resulting merge verdict.

Explicitly **not** created this step (no `yes` answer in §5): no new Go logic package beyond the MCP/hook, no Skill (the gesture is already covered by the per-step loop), no kernel/spec layer (this step proves an *existing* truth set, it does not add a truth).

## Test minimal (done)

Done criterion, restated as a **failing-first** BDD mirror to write *before* any code. It is red on day one; that red **is** the `/goal`.

```gherkin
Feature: CI ratchet rejects red regressions before merge

  Background:
    Given a set of mirrors that are all green on the merge base
    And each green status is recorded in mirror_runs as the baseline

  Scenario: a step that reddens a prior mirror is rejected before merge
    Given a candidate change that breaks a previously-green mirror
    When the ci-ratchet hook runs mirror-runner over every materialized mirror
    Then mirror_runs records a new red run for that mirror flagged regressed=true
    And the hook returns BlockReason RED_REGRESSION with a non-zero exit
    And the merge is rejected

  Scenario: a candidate that keeps every prior mirror green is allowed
    Given a candidate change that leaves all baseline-green mirrors green
    When the ci-ratchet hook runs mirror-runner over every materialized mirror
    Then mirror_runs records all runs as green with regressed=false
    And the hook returns no BlockReason and a zero exit
    And the merge is allowed
```

Plus the hook's own **fault-injection** meta-test (the mirror of the mirror): break a known-green mirror on purpose, assert `ci-ratchet` goes red. A detector that does not fire is mute.

Definition of Done is **computed, not declared**: red set goes green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster (no orphan mirror, no spec without a living mirror). You cannot force `done`.

## Visualisation UI

Workbench route **`/mirrors`** (`front/web/app/mirrors/`, new route — do not touch existing routes). It shows, read-only:

- the full mirror inventory with the latest run per mirror (green / red),
- the **regressed set** (mirrors green at baseline, red now) highlighted,
- the merge verdict for the current candidate (`ALLOWED` / `REJECTED — RED_REGRESSION`).

**Playwright e2e** (`tests/e2e/mirrors-ratchet.spec.ts`, per the `playwright-e2e` skill and `playwright.config.ts` `webServer`): seed a baseline where all mirrors are green and one candidate that reddens a prior mirror; navigate to `/mirrors`; assert the regressed mirror is rendered red and the verdict reads `REJECTED — RED_REGRESSION`. A second pass with an all-green candidate asserts `ALLOWED`. The day this red lands in the right place on the panel, the concept is validated.

## Regle anti-ecrasement

This step edits **only its own declared files** and adds new ones: `back/mcp/mirror-runner/`, `back/hooks/ci-ratchet/`, the new `mirror_runs` migration in `back/migrations/`, `tests/` for this mirror, and `front/web/app/mirrors/`. It does **not** rewrite, replace, or reformat any prior step's artifact, mirror, migration, or contract.

`mirror_runs` is **append-only and content-addressed**: a re-run appends a new immutable row, it never mutates an existing one. The runner has **no write grant** to `kernel`/`mirrors`/`fitness` — it reads them and writes only its own run-log (the wall holds). Any change to a prior contract — the shape of a mirror, the meaning of "green", an existing migration — is forbidden as a silent edit and must go through a **ChangeSet** (DRAFT→APPLIED→REVERTED, the atomic two-plane envelope) carrying a **SemanticDiff** (`change_type`, `blast_radius`, `requires_authority`, `red_wave`). A new artifact may only **ADD** a guardrail, never remove one.

## Prompt a lancer

```text
You are step-executor for AIDOS step S05 — "CI ratchet: replay every mirror, reject red regressions".
Subsystem: AIDOS Mirror. Home (the ONLY place you may write code this step): back/mcp/mirror-runner/,
back/hooks/ci-ratchet/, back/migrations/, tests/, and front/web/app/mirrors/. Workbench route: /mirrors.
Stack is FROZEN: back = Go; truth = Postgres (append-only, content-addressed); front = Next.js (Workbench).
The wall is absolute: you have NO write grant to the kernel/mirrors/fitness schemas — you read them and write
ONLY your own run-log (mirror_runs). Read CLAUDE.md (esp. §5 the artifact decision table and §6 the per-step
loop) and KRD.md (the iteration-3 demo: the cliquet catches a regression BEFORE merge) before touching anything.

Follow the CLAUDE.md §6 loop IN ORDER. Do not skip a stage. Do not go prompt → code.

(a) /grill-with-docs FIRST. Sharpen the intention against the existing domain model and ubiquitous language
    (CONTEXT-MAP.md, the Mirror CONTEXT.md, KRD §42 vague de rouge, §44.1 SemanticDiff, §29 loi de complétude).
    One intention, ≤ 5 scenarios. Pin the terms: "replay", "materialized mirror", "baseline-green", "regressed",
    "RED_REGRESSION", "merge verdict". Update CONTEXT.md / ADRs inline as decisions crystallise. Do not start
    coding without this.

(b) Write the RED BDD mirror FIRST, before any implementation, conceptually stored in the `mirrors` schema and
    materialized for the runner. Encode the done criterion: "a step that reddens a prior mirror is rejected before
    merge" — plus the all-green-is-allowed counter-scenario, plus the hook's fault-injection meta-test (redden a
    known-green mirror on purpose, assert ci-ratchet goes red). It must be RED on first run. That red IS the /goal.

(c) /tdd red → green → refactor, in the HOME directories ONLY (mirror-runner MCP, ci-ratchet hook, mirror_runs
    migration). Outside-in. Within the frozen slot (Go + Postgres), if and only if a real tool choice arises
    (e.g. the Postgres driver/query layer for the runner, or the MCP transport), search the current best as of
    May 2026, compare at most 3, pick the SIMPLEST that fits the frozen stack, and record an ADR (docs/adr/) only
    if a real choice was made. Never search globally for future steps. Reuse the wheel; never reinvent it.

(d) Keep sensors GREEN at each diff (types, lint via Biome/ESLint per zone, gofmt, the existing mirror set,
    architecture fitness). Self-certify on the COMPUTATIONAL only — never declare behaviour green from tests you
    wrote yourself. Completeness law: every layer has its living mirror, no monster (no orphan mirror, no spec
    without a mirror), or Stop blocks.

(e) /diagnose before finishing — isolate any failing sensor, propose, do not paper over. You do not finish a
    code step without it.

(f) Add the Workbench route /mirrors (front/web/app/mirrors/, NEW route — do not touch existing routes): the
    mirror inventory with latest run per mirror, the regressed set highlighted, the merge verdict. Add a Playwright
    e2e (tests/e2e/mirrors-ratchet.spec.ts) covering it: a candidate that reddens a prior mirror renders red and
    yields REJECTED — RED_REGRESSION; an all-green candidate yields ALLOWED. A UI is REQUIRED at this step.

(g) /improve-codebase-architecture before declaring the step done and before the next step — deepen, do not
    sprawl. You do not move to the next step without it.

(h) Create the §5 artifacts that actually apply, and only those: the mirror_runs Postgres migration (append-only,
    content-addressed, no UPDATE/DELETE grant to the agent role); the ci-ratchet Go hook (non-bypassable pre-merge
    gate, ships with its fault-injection test); the mirror-runner MCP (capability: replay all + record runs). No
    Skill, no kernel/spec layer, no extra logic package this step.

HONESTY RULES (anti-Goodhart, non-negotiable):
- Never invent a target, a targetId, or a business-rule. If you do not know one, it is an OpenQuestion, not a guess.
- You never write a truth-test (a new invariant you would then satisfy — the circularity). You write means-tests
  toward the human red. This step proves an EXISTING mirror set; it adds no new truth.
- The judge is deterministic (mirror + reality), out of your reach. A second agent reviewing reduces toil, is not
  a proof. "Done" is COMPUTED: red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster. You
  cannot force done. Any change to a prior contract goes through a ChangeSet + SemanticDiff, never a silent edit.

DONE CRITERIA: the BDD mirror is green, the ci-ratchet hook rejects a candidate that reddens a prior mirror
(RED_REGRESSION) and allows an all-green candidate, mirror_runs records every run append-only, the fault-injection
meta-test fires, the /mirrors route + Playwright e2e pass, all prior mirrors stay green, mutation score ≥ threshold,
and no monster.

END YOUR RUN WITH THE STEP REPORT:
- BDD added: which mirror(s) / scenarios you wrote and where (mirrors schema + tests/).
- Tests run: the exact commands and their results (npx vitest run ..., go test ./..., the hook + fault-injection
  test, mutation score vs threshold).
- UI route: /mirrors — confirm the Playwright e2e passed.
- ChangeSet status: none / DRAFT / APPLIED / REVERTED, and what it carried (with SemanticDiff if a prior contract
  moved).
- Red-set status: what was red, what is now green, anything still red.
- Known limits / OpenQuestions: anything you could not resolve without inventing a target/rule.
- Next safe step: the smallest stable phase the next step can consume.
```
