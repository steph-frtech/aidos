# S06 — Mirror as living typed proof (the completeness law, enforced)

Subsystem: AIDOS Mirror | Home: `back/kernel/mirror/records` | Workbench route: `/mirror-health`

## Objectif

Give the Mirror a typed `mirrors`-schema record (`reflects, test_kind, cert_language, authority, liveness`) and make the **completeness law** mechanical: enforce `no_truth_without_mirror` (every kernel layer has at least one living mirror) and `no_orphan_mirror` (every mirror still reflects a real kernel layer @version). This is the bicephalous body made checkable — a truth without a mirror, or a mirror reflecting nothing, is a **monster**, and a monster is red.

## Sortie attendue

Per CLAUDE.md §5, only the artifacts that actually apply to this step:

- **Postgres migration (Atlas, append-only)** — `back/migrations/` — adds the `mirrors` schema's core record table: one row per mirror with `(mirror_id, reflects → kernel layer ref @version, test_kind, cert_language, authority above|below, liveness alive|dead, content_hash, created_at)`. Content-addressed (version = hash), append-only (a re-point appends a new row, head is mutable); the agent role gets **no** `GRANT INSERT/UPDATE/DELETE` on it — only the `aidos` CLI writes truth through an approved changeset (the wall). `test_kind ∈ {acceptance, e2e, property, fixture, contract, schema, unit, snapshot, meter}`; `cert_language ∈ {gherkin, xstate, fast-check, rapid, zod, pact, type-check, k6, …}`; a mirror whose `cert_language` is not executable as a deterministic sensor does **not** count toward completeness.
- **Go package** — `back/kernel/mirror/records/` — the pure logic + read model: the `Mirror` type (mirroring the KRD §34 record), and the two completeness predicates computed over `mirrors` ⋈ `kernel`: `no_truth_without_mirror` (∀ kernel layer ∃ ≥1 living mirror of each required `test_kind`) and `no_orphan_mirror` (∀ mirror, its `reflects` target exists at that @version). Read-only against `kernel`/`mirrors` (the wall); returns the monster set, never a boolean it then satisfies.
- **BDD mirror** — `tests/` + a row in the `mirrors` schema — the behaviour proof for the law itself, written red first (below). It reflects this very step's truth: completeness is enforced.
- **Next route (Workbench)** — `front/web/app/mirror-health/` — the `/mirror-health` panel: the mirror inventory typed by `(reflects, test_kind, cert_language, authority, liveness)`, the **monster set** (truths missing a mirror; orphan/dead mirrors) highlighted, and the green/red completeness verdict.

Explicitly **not** created this step (no `yes` answer in §5): no MCP server (S05's `mirror-runner` is the *replay* capability; this step defines the record + predicates it will later read — adding an MCP here would duplicate the wheel); no Go hook this step (the Stop-time completeness *enforcement* binary is its own later tooth — this step delivers the typed record and the predicate it will call; flagged as the next safe step); no Skill (the gesture is already the §6 per-step loop); no new kernel/spec truth (this step types and proves the *existing* mirror concept, it does not pin a new business rule).

## Test minimal (done)

Done criterion, restated as a **failing-first** BDD mirror to write *before* any code. It is red on day one; that red **is** the `/goal`. Done = `no_truth_without_mirror and no_orphan_mirror enforced`.

```gherkin
Feature: The Mirror is a living typed proof and the completeness law holds

  Background:
    Given a kernel layer recorded in the kernel schema at a version
    And the mirrors schema stores typed Mirror records
      with fields reflects, test_kind, cert_language, authority, liveness

  Scenario: no_truth_without_mirror — a kernel layer with no living mirror is a monster
    Given a kernel layer that has no mirror of any required test_kind
    When completeness is computed over mirrors joined to kernel
    Then the layer is reported in the monster set as no_truth_without_mirror
    And the completeness verdict is red

  Scenario: no_orphan_mirror — a mirror reflecting nothing is a monster
    Given a mirror whose reflects target no longer exists at that version
    When completeness is computed over mirrors joined to kernel
    Then the mirror is reported in the monster set as no_orphan_mirror
    And its liveness is dead
    And the completeness verdict is red

  Scenario: a typed mirror that reflects a real layer and is executable is alive
    Given a kernel layer at a version
    And a mirror reflecting it with an executable cert_language and liveness alive
    When completeness is computed over mirrors joined to kernel
    Then the monster set is empty for that layer
    And the completeness verdict is green

  Scenario: a non-executable cert_language does not count toward completeness
    Given a kernel layer whose only mirror has a non-executable cert_language
    When completeness is computed over mirrors joined to kernel
    Then the layer is still reported as no_truth_without_mirror
    And the completeness verdict is red
```

Definition of Done is **computed, not declared**: red set goes green ∧ prior green intact (every S00–S05 mirror still green) ∧ mutation score ≥ threshold ∧ no monster (the law enforces its own absence). You cannot force `done`.

## Visualisation UI

Workbench route **`/mirror-health`** (`front/web/app/mirror-health/`, new route — do not touch existing routes, including S05's `/mirrors`). It shows, read-only:

- the **mirror inventory** typed by `(reflects, test_kind, cert_language, authority above|below, liveness alive|dead)`,
- the **monster set** highlighted: truths with no living mirror (`no_truth_without_mirror`) and orphan/dead mirrors (`no_orphan_mirror`),
- the **completeness verdict** for the current cut (`COMPLETE` / `RED — MONSTER`).

**Playwright e2e** (`tests/e2e/mirror-health.spec.ts`, per the `playwright-e2e` skill and `playwright.config.ts` `webServer`, baseURL `http://localhost:3000`): seed a kernel layer with no living mirror and an orphan mirror; navigate to `/mirror-health`; assert both appear in the monster set with the right reason and the verdict reads `RED — MONSTER`. A second pass seeds a layer with a living, executable, correctly-reflecting mirror and asserts the monster set is empty and the verdict reads `COMPLETE`. The day a monster lands red on the panel, the law is validated.

## Regle anti-ecrasement

This step edits **only its own declared files** and adds new ones: the `mirrors`-schema migration in `back/migrations/`, the `back/kernel/mirror/records/` Go package, `tests/` for this mirror, and `front/web/app/mirror-health/`. It does **not** rewrite, replace, or reformat any prior step's artifact, mirror, migration, route, or contract — in particular it leaves S05's `mirror_runs` table, `mirror-runner` MCP, `ci-ratchet` hook, and `/mirrors` route untouched.

The `mirrors` record table is **append-only and content-addressed**: re-pointing a mirror appends a new immutable row, it never mutates one in place; head is mutable, history is not. The package has **no write grant** to `kernel`/`mirrors`/`fitness` — it reads them to compute completeness and writes nothing (the wall holds; only the `aidos` CLI writes truth via an approved changeset). Any change to a prior contract — the shape of the `Mirror` record, the meaning of `liveness`, the set of required `test_kind`s, an existing migration — is forbidden as a silent edit and must go through a **ChangeSet** (DRAFT→APPLIED→REVERTED, the atomic two-plane envelope) carrying a **SemanticDiff** (`change_type`, `blast_radius`, `requires_authority`, `red_wave`). A changeset cannot reach APPLIED while the completeness law is red (no orphan left behind). A new artifact may only **ADD** a guardrail, never remove one.

## Prompt a lancer

```text
You are step-executor for AIDOS step S06 — "Mirror as living typed proof (the completeness law, enforced)".
Subsystem: AIDOS Mirror. Home (the ONLY place you may write code this step): back/kernel/mirror/records/,
back/migrations/, tests/, and front/web/app/mirror-health/. Workbench route: /mirror-health.
Stack is FROZEN: back = Go; truth = Postgres (append-only, content-addressed); front = Next.js (Workbench).
The wall is absolute: you have NO write grant to the kernel/mirrors/fitness schemas — you READ them to compute
completeness and write nothing. Only the `aidos` CLI writes truth via an approved changeset. Read CLAUDE.md
(esp. §5 the artifact decision table and §6 the per-step loop) and KRD.md (LIVRE VI — the bicephalous mirror plane;
§29 la loi de complétude; §34 the Mirror record reflects/test_kind/cert_language/authority/liveness; §33 the reflet
is one-to-many; LIVRE XXII — bicéphale: the monster is a spec without a mirror or an orphan mirror) before touching
anything.

Follow the CLAUDE.md §6 loop IN ORDER. Do not skip a stage. Do not go prompt → code.

(a) /grill-with-docs FIRST. Sharpen the intention against the existing domain model and ubiquitous language
    (CONTEXT-MAP.md, the Mirror CONTEXT.md, KRD §29 completeness, §34 Mirror record, §33 one-to-many reflet,
    LIVRE XXII the monster). One intention, ≤ 5 scenarios. Pin the terms exactly: "reflects", "test_kind",
    "cert_language", "authority (above|below)", "liveness (alive|dead)", "living mirror", "orphan mirror",
    "monster", "no_truth_without_mirror", "no_orphan_mirror", "completeness verdict". Resolve whether each kernel
    `kind` requires which `test_kind`(s) BY READING the recorded layer profile — do NOT invent it. Update
    CONTEXT.md / ADRs inline as decisions crystallise. Do not start coding without this.

(b) Write the RED BDD mirror FIRST, before any implementation, conceptually stored in the `mirrors` schema and
    materialized for the runner. Encode the done criterion — "no_truth_without_mirror and no_orphan_mirror
    enforced" — as: a layer with no living mirror is a monster (red); a mirror reflecting nothing is a monster
    with liveness=dead (red); a typed mirror reflecting a real layer with an executable cert_language is alive
    (green); a non-executable cert_language does NOT count toward completeness (red). It must be RED on first run.
    That red IS the /goal.

(c) /tdd red → green → refactor, in the HOME directories ONLY (the back/kernel/mirror/records Go package and the
    mirrors-schema migration). Outside-in. Within the frozen slot (Go + Postgres + Atlas), if and only if a real
    tool choice arises (e.g. the Atlas modelling style for the schema, or the sqlc/pgx query shape for the
    completeness join), search the current best as of May 2026, compare at most 3, pick the SIMPLEST that fits the
    frozen stack (Atlas migrations, sqlc+pgx access — do not substitute the mandatory minimum), and record an ADR
    (docs/adr/) ONLY if a real choice was made. Never search globally for future steps. Reuse the wheel; never
    reinvent it.

(d) Keep sensors GREEN at each diff (gofmt, Go strict types, Biome/ESLint per zone, the existing S00–S05 mirror
    set, architecture fitness via go-arch-lint/depguard). Self-certify on the COMPUTATIONAL only — never declare
    behaviour green from tests you wrote yourself. Completeness law: every kernel layer has its living mirror, no
    monster (no orphan mirror, no truth without a mirror), or Stop blocks.

(e) /diagnose before finishing — isolate any failing sensor, propose, do not paper over. You do not finish a code
    step without it.

(f) Add the Workbench route /mirror-health (front/web/app/mirror-health/, NEW route — do not touch existing routes,
    including S05's /mirrors): the mirror inventory typed by (reflects, test_kind, cert_language, authority,
    liveness), the monster set highlighted (no_truth_without_mirror; no_orphan_mirror with liveness=dead), and the
    completeness verdict (COMPLETE / RED — MONSTER). Add a Playwright e2e (tests/e2e/mirror-health.spec.ts)
    covering it: a kernel layer with no living mirror and an orphan mirror both render in the monster set with the
    right reason and yield RED — MONSTER; a layer with a living, executable, correctly-reflecting mirror yields
    COMPLETE with an empty monster set. A UI is REQUIRED at this step.

(g) /improve-codebase-architecture before declaring the step done and before the next step — deepen the Mirror
    plane, do not sprawl; keep the completeness predicates pure and testable. You do not move to the next step
    without it.

(h) Create the §5 artifacts that actually apply, and only those: the mirrors-schema Atlas migration (append-only,
    content-addressed, no INSERT/UPDATE/DELETE grant to the agent role); the back/kernel/mirror/records Go package
    (the Mirror type + the two completeness predicates, read-only over kernel ⋈ mirrors). No MCP this step (S05's
    mirror-runner already replays; this step defines the record it reads). No Stop-time enforcement hook this step
    — flag it as the next safe step. No Skill. No new kernel/spec truth.

HONESTY RULES (anti-Goodhart, non-negotiable):
- Never invent a target, a targetId, or a business-rule. If you do not know which test_kind a kernel kind requires,
  or what a layer reflects, it is an OpenQuestion — read the recorded profile or ask; never guess.
- You never write a truth-test (a new invariant you would then satisfy — the circularity). You write means-tests
  toward the human red. This step TYPES and PROVES the existing mirror concept; it adds no new truth.
- The judge is deterministic (mirror + reality), out of your reach. A second agent reviewing reduces toil, is not
  a proof. "Done" is COMPUTED: red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster. You
  cannot force done. Any change to a prior contract goes through a ChangeSet + SemanticDiff, never a silent edit;
  a changeset cannot reach APPLIED while completeness is red.

DONE CRITERIA: the BDD mirror is green; no_truth_without_mirror and no_orphan_mirror are enforced (a layer with no
living mirror and a mirror reflecting nothing are both reported as monsters and turn the verdict red; a typed,
living, correctly-reflecting mirror is green; a non-executable cert_language does not count toward completeness);
the mirrors record table is append-only/content-addressed with no write grant to the agent role; the
/mirror-health route + Playwright e2e pass; all prior S00–S05 mirrors stay green; mutation score ≥ threshold; and
no monster.

END YOUR RUN WITH THE STEP REPORT:
- BDD added: which mirror(s) / scenarios you wrote and where (mirrors schema + tests/).
- Tests run: the exact commands and their results (npx vitest run ..., go test ./..., the completeness predicates,
  mutation score vs threshold).
- UI route: /mirror-health — confirm the Playwright e2e passed.
- ChangeSet status: none / DRAFT / APPLIED / REVERTED, and what it carried (with SemanticDiff if a prior contract
  moved).
- Red-set status: what was red, what is now green, anything still red.
- Known limits / OpenQuestions: anything you could not resolve without inventing a target/test_kind/business-rule.
- Next safe step: the smallest stable phase the next step can consume (e.g. the Stop-time completeness-enforcement
  Go hook that calls these predicates and blocks a changeset reaching APPLIED while a monster exists).
```
