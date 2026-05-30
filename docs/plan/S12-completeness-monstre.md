# S12 — Completeness law + monstre detection (the Stop hook that blocks)

Subsystem: AIDOS Mirror | Home: `back/kernel/mirror/completeness` | Workbench route: `/completeness`

## Objectif

Make the **completeness law** non-bypassable at `Stop`: a Go `Stop` hook computes the monster set over `mirrors ⋈ kernel` (a spec without a living mirror = a monster; an orphan mirror = a monster) and **blocks** while any monster exists. The bicephalous law stops being a read-only verdict (S06) and becomes the gate KRD §29 / §127 demand — *no truth without a mirror, no monster, or the session does not close*.

## Sortie attendue

Per CLAUDE.md §5, only the artifacts whose answer is **yes** at this step:

- **Go hook binary** — `back/hooks/stop/` — the `Stop` lifecycle hook (KRD §74/§77 line `run: "goal-check && completeness-check", on_fail: continue`). At session/changeset close it invokes the completeness check and, if the monster set is non-empty, returns a **block** verdict carrying an actionable `BlockReason{code, severity, explanation, how_to_fix[]}` (`code = MONSTER` / `INCOMPLETE`), naming each monster and its reason (`no_truth_without_mirror` | `no_orphan_mirror`); on an empty monster set it passes. The hook is **harness-invoked**, never a callable op (so: not an MCP). (CLAUDE.md §5: non-bypassable rule → Hook, Go binary.)
- **Go package** — `back/kernel/mirror/completeness/` — the pure logic the hook calls: the **monster detector** that reads `mirrors ⋈ kernel` (read-only, the wall) and returns the typed monster set `{layer/mirror ref, reason}` for the current cut, plus the **gate aggregator** (`block iff |monsters| > 0`, no third verdict). It **consumes** S06's `no_truth_without_mirror` / `no_orphan_mirror` predicates and the `Mirror` record — it does not re-derive or re-type them. Returns the monster set, never a boolean it then satisfies.
- **Postgres migration (Atlas, append-only)** — `back/migrations/` — a **`completeness_runs`** audit table (and a child `monster_findings` if normalized): one append-only, content-addressed (by cut/event hash) row per Stop evaluation with `run_id`, `cut_hash`, `verdict` (`block|pass`), `monster_count`, `started_at/finished_at`, and per-finding `{ref, reason, kind}`. This is a Runtime/Mirror **audit log below the waterline** (not kernel/mirrors/fitness), so the agent role MAY be granted write here — **confirm the grant boundary against S04/S07 before assuming it** (OpenQuestion otherwise). Mirrors S07's `sensor_runs` shape so the wall's twins stay auditable.
- **BDD mirror** — stored in the `mirrors` schema, materialized to `tests/` for the runner (see "Test minimal"). It is the proof that a monster blocks Stop, and the fault-injection that proves the hook fires.
- **Next route (Workbench)** — `front/web/app/completeness/` — the `/completeness` panel reading `completeness_runs`: the live verdict for the current cut (`COMPLETE` / `BLOCKED — MONSTER`), the monster set with each reason, and a feed of recent Stop block events.

Explicitly **NOT** in scope (no `yes` in §5, or out of slot here — would be a monster of governance theatre):
- **No MCP server** — the gate is invoked by the `Stop` lifecycle, not exposed as a backend op. "Rerun completeness on demand as a tool" is an **OpenQuestion** for a later `completeness` MCP, not invented now.
- **No new kernel/spec truth** — this step *enforces* the existing law (KRD §29), it pins no new business rule and emits no AST.
- **No Skill** — the `/diagnose` gesture already covers isolating a failing gate; a "resolve-monster" skill is only earned after a real recurring failure.
- **No re-implementation of S06** — the typed `Mirror` record, the two predicates, and the `/mirror-health` read model already exist; this step adds the *enforcement* tooth that consumes them, plus its own audit log and route.

> Per CLAUDE.md §5 **hook-honesty**: this hook ships with a **fault-injection test** (KRD §32, §127 — *la chasse au monstre*). Break a watched source — delete a layer's only living mirror (→ `no_truth_without_mirror`) and re-point a mirror at a vanished `@version` (→ `no_orphan_mirror`) — and assert the hook goes red and **blocks**; restore and assert it passes. A `Stop` hook that never fires is governance theatre (KRD §16 *le test décisif — est-ce que ce contrôle se déclenche un jour ?*).

## Test minimal (done)

**Done criterion:** *A spec without a mirror = monstre = red; Stop blocks.*

Restated as a **failing-first** BDD mirror to write **before** any hook code — red on day one, and that red **is** the `/goal`. One nature per cert-language.

- **Journey (N0) — Gherkin / Godog**, stored in `mirrors`, materialized to `tests/`:

  ```gherkin
  Feature: The Stop hook enforces the completeness law and blocks on a monster

    Background:
      Given the mirrors schema holds typed Mirror records reflecting kernel layers at a version
      And a Stop event closes the current cut

    Scenario: no_truth_without_mirror — a spec without a living mirror blocks Stop
      Given a kernel layer that has no living mirror of any required test_kind
      When the Stop hook runs the completeness check over mirrors joined to kernel
      Then the verdict is "block"
      And the BlockReason code is "MONSTER"
      And the monster set reports the layer as no_truth_without_mirror with a how_to_fix
      And a completeness_runs row is recorded with verdict "block"

    Scenario: no_orphan_mirror — a mirror reflecting nothing blocks Stop
      Given a mirror whose reflects target no longer exists at that version
      When the Stop hook runs the completeness check over mirrors joined to kernel
      Then the verdict is "block"
      And the monster set reports the mirror as no_orphan_mirror with liveness dead
      And a completeness_runs row is recorded with verdict "block"

    Scenario: no monster — a complete cut passes Stop
      Given every kernel layer has at least one living, executable, correctly-reflecting mirror
      When the Stop hook runs the completeness check over mirrors joined to kernel
      Then the verdict is "pass"
      And the monster set is empty
      And a completeness_runs row is recorded with verdict "pass"
  ```

- **Invariant (∀) — property test (rapid, Go):** for any cut, `gate(monsters)` ⇒ `block` **iff** `|monsters| > 0`, else `pass` — there is no third verdict; `block` ⇒ `code ∈ {MONSTER, INCOMPLETE}` and the recorded findings are **exactly** the monster set (no silent drop — an unknown/errored completeness check is itself a failure that blocks, never a pass, per KRD §82 the `.passthrough()` anti-pattern).

- **Fault-injection (hook-honesty, the §5 mandatory test):** start from a complete (green) cut; inject one real monster per reason — delete a layer's only living mirror, then re-point a mirror at a vanished `@version` — and assert the Stop hook returns `block` each time with the right reason; restore the cut and assert `pass`. This proves the gate fires on what it watches, not just that the aggregator math holds.

All three are **red first** (no `stop` hook binary, no `completeness` detector wired to a verdict, no `completeness_runs` migration applied). Done is **computed, not declared** (CLAUDE.md §8): red set → green ∧ prior green intact (every S00–S10 mirror still green, S06's predicates untouched) ∧ mutation score ≥ threshold ∧ no monster. You cannot force `done`.

## Visualisation UI

**Workbench route:** `front/web/app/completeness/` → `/completeness` (NEW route — do not touch existing routes, including S06's `/mirror-health` and S07's `/sensors`). Read-only, it shows:

- the **current-cut verdict** (`COMPLETE` / `BLOCKED — MONSTER`),
- the **monster set** with each entry's reason (`no_truth_without_mirror`; `no_orphan_mirror` with `liveness = dead`) and a how_to_fix,
- a feed of recent **Stop block events** from `completeness_runs` (verdict, monster_count, cut_hash, timestamp).

Source is the `completeness_runs` table; the page **projects** it, never re-encodes the law.

**Playwright e2e** (`tests/e2e/completeness.spec.ts`, via the `playwright-tester` agent + the `playwright-e2e` skill; `playwright.config.ts` already has the `webServer` block, baseURL `http://localhost:3000`):

```
Given the Workbench is running
When I navigate to /completeness
Then I see a cut with a layer missing its mirror reported as no_truth_without_mirror
And I see an orphan mirror reported as no_orphan_mirror with liveness dead
And the verdict reads "BLOCKED — MONSTER"
And a second, complete cut shows an empty monster set and the verdict "COMPLETE"
```

The day a monster lands red and Stop blocks on the panel, the law is validated.

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: `back/hooks/stop/**`, `back/kernel/mirror/completeness/**`, the new `back/migrations/` `completeness_runs` migration, the `mirrors`-stored Gherkin/property/fault-injection materialized to `tests/`, `tests/e2e/completeness.spec.ts`, and `front/web/app/completeness/**`.

It must **not** rewrite, replace, or reformat any prior step's artifact — in particular it leaves S06's `back/kernel/mirror/records` package, the `Mirror` record, the `mirrors` migration, and the `/mirror-health` route untouched (it **imports** the predicates, it does not fork them), and it leaves S04's `PreToolUse` wall + GRANTs and S07's `posttooluse` hook / `sensor_runs` / `/sensors` route untouched. It must not hand-edit generated files (`back/gen/**`) and must not write truth directly. The `completeness_runs` table is **append-only and content-addressed** (one immutable row per Stop evaluation; head mutable, history not), with no write grant to `kernel`/`mirrors`/`fitness`.

Any change to a prior contract — the `Mirror` record shape, the meaning of `liveness`, the set of required `test_kind`s, the `BlockReason` type (from S04/S07), the waterline, an existing migration — is forbidden as a silent edit and must go through a **ChangeSet** (DRAFT→APPLIED→REVERTED, the atomic two-plane envelope) carrying a **SemanticDiff** (`change_type`, `blast_radius`, `requires_authority`, `red_wave`). A new artifact may only **ADD** a guardrail, never remove one (the meta-loop rule). Consistently with KRD §44/§98: a ChangeSet cannot reach APPLIED while this very check is red — that is the rule this step makes mechanical.

## Prompt a lancer

```text
You are step-executor for AIDOS step S12 — "Completeness law + monstre detection (the Stop hook that
blocks)". Stack is FROZEN: back = Go; truth = Postgres (append-only, content-addressed; the agent has NO
write grant to kernel/mirrors/fitness); front = Next.js (the Workbench). Home (the ONLY place you may write
code this step): back/hooks/stop/, back/kernel/mirror/completeness/, back/migrations/, tests/, and
front/web/app/completeness/. Workbench route: /completeness.
The wall is absolute: you READ kernel ⋈ mirrors to compute the monster set and write nothing there; only the
`aidos` CLI writes truth via an approved changeset. Read CLAUDE.md (esp. §5 the artifact decision table and
§6 the per-step loop) and KRD.md (§29 la loi de complétude; §34 the Mirror record reflects/test_kind/
cert_language/authority/liveness; §74 & §77 the Stop hook line `goal-check && completeness-check, on_fail:
continue`; LIVRE XXII §126–§127 — bicéphale: the monstre is a spec sans miroir or a miroir orphelin; §32 the
fault-injection meta-test) before touching anything. S06 already delivered the typed Mirror record and the
two completeness predicates (no_truth_without_mirror / no_orphan_mirror) read-only in
back/kernel/mirror/records; THIS step is the enforcement tooth S06 flagged as next — wire those into a Stop
hook that blocks. Do not re-implement S06.

Follow the CLAUDE.md §6 loop IN ORDER. Do not skip a stage. Do not go prompt → code.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Sharpen the
    ubiquitous language against CONTEXT-MAP.md + the Mirror CONTEXT.md: "completeness law", "living mirror",
    "orphan mirror", "monstre", "no_truth_without_mirror", "no_orphan_mirror", "the cut", "block vs pass",
    "Stop = arrêt non-gameable + complétude" (KRD §74 the 5 mechanics). Pin which test_kind(s) each kernel
    kind requires BY READING S06's recorded layer profile — do NOT invent it. Confirm the canonical Stop line
    against KRD §74/§77. For any Next.js 16 / Atlas / Go MCP-or-hook API doubt, use context7 or
    node_modules/next/dist/docs. Update CONTEXT.md / write an ADR inline if a term or boundary is sharpened.
    Do not start coding without this.

(b) WRITE THE RED BDD MIRROR FIRST, before any hook code, conceptually stored in the `mirrors` schema
    (reflects = S12 completeness enforcement, test_kind = journey/invariant, cert_language = gherkin/rapid,
    liveness = alive) and materialized to tests/. Encode the done criterion — "a spec without a mirror =
    monstre = red; Stop blocks" — as: (N0 Gherkin/Godog) a layer with no living mirror → Stop verdict block,
    BlockReason code MONSTER, monster set reports no_truth_without_mirror, a completeness_runs row recorded; a
    mirror reflecting nothing → block, no_orphan_mirror, liveness dead; a complete cut → pass, empty monster
    set, a pass row. (∀ rapid) gate(monsters) ⇒ block iff |monsters| > 0 else pass; no third verdict; an
    errored/unknown completeness check is a failure that blocks, never silently dropped. (Fault-injection,
    the §5 mandatory hook-honesty test) from a green cut, delete a layer's only living mirror and re-point a
    mirror at a vanished @version → assert the Stop hook blocks each time with the right reason; restore →
    assert pass. Run them. They MUST be RED (no stop binary, no detector→verdict, no migration). That red IS
    the /goal.

(c) TDD red → green → refactor, in the HOME directories ONLY (back/hooks/stop, back/kernel/mirror/
    completeness, the back/migrations/ completeness_runs file). Outside-in. The completeness package CONSUMES
    S06's predicates and the Mirror record — it does not re-derive or re-type them. Within the frozen slots
    (Go + Postgres + Atlas + sqlc/pgx + the Go hook binary form), search the CURRENT (May 2026) best option
    AT MOST 3, pick the SIMPLEST that fits the frozen stack, and never touch the mandatory minimum (Godog,
    rapid, sqlc/pgx, Atlas, go test are fixed). The likely real choices are: the cut-resolution mechanism (how
    "the current cut" is identified at Stop — event payload vs head selection) and the completeness_runs
    Atlas modelling style. If and only if a genuine choice is made, record a short ADR (docs/adr/000N-...);
    otherwise do not. Never search globally for future steps. Reuse the wheel; never reinvent it.

(d) KEEP SENSORS GREEN at each diff (PostToolUse — you are dogfooding S07's sensors): gofmt / go vet / strict
    Go, Biome at the monorepo root, ESLint in front/web, archtest (go-arch-lint/depguard), the existing
    S00–S10 mirror set. Self-certify on the COMPUTATIONAL only — never declare behaviour green from tests you
    wrote yourself. This step's own law applies to itself: keep the Mirror plane free of monsters.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor; reproduce a real cut with a layer
    missing its mirror and confirm the Stop hook returns block + BlockReason MONSTER + a completeness_runs row,
    then a complete cut returns pass. Run the fault-injection per reason; a hook that never fires is dead —
    assert it goes red on each injected monster and green on restore. You do not finish a code step without
    this.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/completeness/ →
    /completeness (NEW route — do not touch existing routes, including /mirror-health and /sensors): the
    current-cut verdict (COMPLETE / BLOCKED — MONSTER), the monster set with each reason
    (no_truth_without_mirror; no_orphan_mirror with liveness dead) and a how_to_fix, and a feed of recent Stop
    block events from completeness_runs. Read from completeness_runs; project, don't re-encode the law. Add
    tests/e2e/completeness.spec.ts (use the playwright-e2e skill) asserting a missing-mirror layer renders as
    no_truth_without_mirror, an orphan mirror as no_orphan_mirror with liveness dead, the verdict reads
    BLOCKED — MONSTER, and a complete cut reads COMPLETE with an empty monster set.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: confirm the
    completeness package is a deep, well-named module (detector / gate-aggregator), it reuses S06's predicates
    and the BlockReason type (from S04/S07) rather than duplicating them, the hook stays a thin adapter over
    the pure logic, no ball of mud, boundaries match the Mirror CONTEXT.md. You do not move to the next step
    without this.

(h) CREATE ARTIFACTS PER §5, and only those: the Hook (back/hooks/stop, this step's Go binary); the Go
    package (back/kernel/mirror/completeness); the Postgres migration (back/migrations/ completeness_runs,
    Atlas, append-only, content-addressed). Do NOT add an MCP server (the gate is harness-invoked, not a
    callable op — record "completeness MCP for on-demand rerun" as an OpenQuestion if it recurs). Do NOT add a
    Skill (the /diagnose gesture suffices). Emit NO new kernel/spec truth. A new artifact may ADD a guardrail,
    never REMOVE one (the meta-loop rule).

HONESTY RULES (anti-Goodhart, non-negotiable):
- Never invent a target, a targetId, or a business-rule. If you do not know which test_kind a kernel kind
  requires, how "the current cut" is resolved at Stop, or whether the agent role may write completeness_runs
  (the below-waterline grant boundary — confirm against S04/S07), it is an OpenQuestion: read the recorded
  profile / migration / ADR, or ask — never guess, and stop on that branch.
- You never write a truth-test (a new invariant you would then satisfy — the circularity). This step's mirror
  is a means-test toward the human red: it ENFORCES the existing completeness law (KRD §29), it pins no new
  truth.
- An unknown/errored completeness check is a FAILURE made explicit, never a silent pass (KRD §82
  .passthrough() anti-pattern): a missing or crashing check blocks, it does not pass.
- The judge is deterministic (mirror + reality), out of your reach. A second agent reviewing reduces toil, is
  not a proof. Any change to a prior contract (the Mirror record, liveness, required test_kinds, BlockReason,
  the waterline, an existing migration) goes through a ChangeSet + SemanticDiff, never a silent edit; an
  override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

DONE CRITERIA (computed, not declared, CLAUDE.md §8): the BDD mirror is green; a spec without a living mirror
and a mirror reflecting nothing are both reported as monsters and make the Stop hook BLOCK with BlockReason
code MONSTER + a completeness_runs row; a complete cut PASSES with an empty monster set + a pass row; the
fault-injection fires block→pass for each reason; the completeness_runs table is append-only/
content-addressed with no write grant to kernel/mirrors/fitness; the /completeness route + Playwright e2e
pass; all prior S00–S10 mirrors stay green and S06's predicates are untouched; mutation score ≥ threshold; and
no monster. You cannot force done.

END YOUR RUN WITH THE STEP REPORT:
- BDD added: which mirror(s)/scenarios you wrote (Gherkin/Godog journey, rapid gate property, fault-injection
  per reason) and where in the `mirrors` schema + tests/.
- Tests run: the exact commands and their results (go test ./..., the Godog journey, the rapid property, the
  fault-injection, npx vitest run ..., npx playwright test ..., mutation score vs threshold).
- UI route: /completeness — confirm the Playwright e2e passed.
- ChangeSet status: none / DRAFT / APPLIED / REVERTED, and what it carried (with SemanticDiff if a prior
  contract moved).
- Red-set status: what was red, what is now green, anything still red.
- Known limits / OpenQuestions: anything you could not resolve without inventing a target/test_kind/
  business-rule (e.g. the completeness_runs write-grant boundary, the cut-resolution mechanism, the
  completeness MCP deferral).
- Next safe step: the smallest stable phase the next step can consume (e.g. wiring goal-check alongside this
  completeness-check at Stop so the full non-gameable arrest — red set → green ∧ prior green intact ∧ mutation
  ≥ threshold ∧ no monster — is enforced as one gate, or the PostKernelChange red-wave that consumes the
  monster set).
```
