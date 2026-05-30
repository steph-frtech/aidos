# S41 — KernelDebt + /trim-kernel (stale fixtures, surviving mutants, orphan mirrors)

Subsystem: AIDOS Runtime | Home: `back/runtime/debt` | Workbench route: `/kernel-debt`

## Objectif

Land **`KernelDebt`** — the pure, read-only diagnostic that names the *rot* accumulating in the truth-store: **stale fixtures** (a fixture mirror whose referenced truth has moved), **surviving mutants** (a mutation a mirror should have killed but did not), and **orphan mirrors** (a mirror reflecting no live truth — a monster by the completeness law) — plus the **`/trim`** gesture that *suggests* a trim plan over those findings. The done criterion: it **detects** stale / orphan / surviving-mutant items and **suggests** a trim, while **deleting nothing** (suggestion only — every removal still goes through `idea → mirror → /goal → human approval`).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the debt snapshot rows), a **repeatable gesture** (the `/trim` Skill), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/runtime/debt/` — the `KernelDebt` diagnostic. A pure `Scan(snapshot, now) → KernelDebt` over a passed-in read-only view (the set of live truth records from the `kernel` schema, the set of mirror records from the `mirrors` schema with their `reflects`/`liveness`/`last_run`, and the latest mutation-run results consumed from the prior mutation/gremlins sensor step). `KernelDebt` is a typed report = an ordered list of `DebtItem{ id (content hash of the canonical item body, REUSE S01/S02's Canonicalize/Hash — do NOT fork it), kind, target_ref, reason, severity }` where `kind ∈ { stale_fixture, surviving_mutant, orphan_mirror }` — **exactly those three, declared, never invented**. The three detectors are pure predicates over the snapshot: **orphan_mirror** = a mirror whose `reflects` points at no live truth (the completeness-law monster, reuse S12's monster notion — do **not** redefine it); **stale_fixture** = a fixture mirror whose pinned truth version no longer matches the live head it reflects (the `state→cmd→events` fixture references a truth that has moved); **surviving_mutant** = a mutation reported alive by the consumed mutation run against a truth that a mirror claims to cover (the mirror did not kill what it should). `Scan` is pure over `(snapshot, now)` — no DB calls, no I/O, no `time.Now()` (the clock is passed in so the report is deterministic and replayable). It **detects and ranks**; it never mutates, deletes, or writes truth.
- **Go package (suggestion only)** `back/runtime/debt/trim/` — a pure `SuggestTrim(debt) → TrimPlan` where `TrimPlan` is an ordered list of `TrimSuggestion{ debt_item_ref, proposed_action, rationale, requires }` and `proposed_action ∈ { open_idea_to_retire_mirror, open_idea_to_repin_fixture, open_idea_to_strengthen_mirror }` — every action is the *opening of an idea*, never a removal. `requires` is always the door: `idea → mirror → /goal → human approval` (CLAUDE.md §2). `SuggestTrim` **deletes nothing, writes no truth, opens no ChangeSet** — it emits a *plan a human (or a later goal) may act on*. Pure, no I/O, no clock, no RNG.
- **Atlas migration** (`back/migrations/`) — one declarative, **expand-only / append-only** migration adding to the existing `fitness` (read-only diagnostic) zone a `fitness.kernel_debt_snapshot` table: `id text PRIMARY KEY` = hash of the canonical snapshot body (reuse S01/S02's content-hash, do **not** fork it), `body jsonb NOT NULL` holding the `[]DebtItem` + the `TrimPlan`, `scanned_at timestamptz NOT NULL`, `kernel_head text NOT NULL` (the truth head the scan was taken against, version-pinned so a recorded snapshot stays inspectable after heads move), `mutation_run_ref text NULL` (the consumed mutation run). A snapshot is **append-only** — a new scan is a new row, never an UPDATE; nothing about the kernel is altered. GRANTs: the agent DB role gets **SELECT only** on `fitness.kernel_debt_snapshot` (the wall, §2; `fitness` is read-only and `kernel`/`mirrors` are truth schemas above the line — the agent has no write GRANT to any of them). Only the `aidos` CLI writer role records a snapshot, via an approved ChangeSet (S20).
- **Skill** `.claude/skills/trim/` (`SKILL.md`, CLAUDE.md §5: repeatable gesture → Skill) — `/trim`: the replayable gesture "scan the kernel for debt and *propose* a trim". It encodes the procedure (take a read-only snapshot → `Scan` → `SuggestTrim` → present the findings + the trim plan), the **honesty rules** (it SUGGESTS, it never deletes; never invent a debt kind or a target/targetId; uncertainty becomes an OpenQuestion in `provenance`), and the hard rule that **acting on any suggestion goes through `idea → mirror → /goal → human approval`** — `/trim` itself never writes truth and never bypasses the door.
- **BDD mirror** — a **fixture** mirror (`state → command → events`: a snapshot of truth + mirrors + a mutation run + a passed-in `now` → `Scan` → the `DebtItem`s; the debt → `SuggestTrim` → the `TrimPlan`) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (see below).
- **Next route** `front/web/app/kernel-debt/` → `/kernel-debt` — the Workbench panel rendering the latest debt snapshot (each `DebtItem` grouped by kind: orphan mirrors, stale fixtures, surviving mutants, each with its reason + severity) and the suggested `TrimPlan` (each suggestion shown as a *proposal* with its `requires: idea → mirror → /goal → human approval` clearly marked, and **no delete affordance** — suggestion only), reading via the SELECT-only role (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — `Scan`/`SuggestTrim` are pure libraries; recording a snapshot is done through the existing `changeset` MCP + `aidos` writer role (S20), and taking the read-only kernel/mirror view reuses the existing `store` MCP read path, not a new backend service. **No new hook** — `/trim` is advisory, not a non-bypassable rule; the wall GRANT, the completeness law (S12) and the commit-gate are prior artifacts; this step adds no new gate (a hook that never fires would be dead — CLAUDE.md §5 hook honesty). **No deletion / no trim execution** — this step DETECTS and SUGGESTS; any actual retirement/re-pin/strengthen is a *later* `idea → mirror → /goal` (CLAUDE.md §2, §9 anti-overwrite). **No mutation-testing engine** — surviving mutants are CONSUMED from the prior mutation/gremlins sensor run, never produced here. **No completeness re-definition** — the monster/orphan notion is consumed from S12, not re-coined. **No codegen/emitters, no truth writes.**

## Test minimal (done)

**Done = it detects stale fixtures, surviving mutants and orphan mirrors, suggests a trim, and deletes NOTHING.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: runtime.debt.Scan + runtime.debt.trim.SuggestTrim · test_kind: fixture · cert_language: operation-dsl/go · authority: below (fitness is read-only diagnostic)
  fixture "an orphan mirror is detected as debt, nothing is deleted"        # THE done criterion (orphan)
    state   (kernel):  [ { id: "truth-1", live: true } ]
    state   (mirrors): [ { id: "mir-9", reflects: "truth-GONE", liveness: "live" } ]
    command (scan):    Scan(snapshot, now)
    events:  [ debtItem("mir-9").kind == "orphan_mirror",
               debtItem("mir-9").reason names the no-live-truth monster (S12),
               snapshot is read-only: no kernel/mirror row mutated or deleted ]

  fixture "a stale fixture is detected when its pinned truth moved"         # THE done criterion (stale)
    state   (kernel):  [ { id: "truth-2", version: "v3", live: true } ]
    state   (mirrors): [ { id: "fix-4", test_kind: "fixture", reflects: "truth-2@v1" } ]
    command (scan):    Scan(snapshot, now)
    events:  [ debtItem("fix-4").kind == "stale_fixture",
               debtItem("fix-4").reason names the moved-head (v1 → v3) ]

  fixture "a surviving mutant is detected from the consumed mutation run"   # THE done criterion (mutant)
    state   (mirrors):  [ { id: "mir-5", reflects: "truth-3", liveness: "live" } ]
    state   (mutation): [ { target: "truth-3", status: "survived" } ]
    command (scan):     Scan(snapshot, now)
    events:  [ debtItem(for "truth-3").kind == "surviving_mutant",
               reason names the mirror that should have killed it ]

  fixture "trim is SUGGESTED, never executed — deletes nothing"            # THE done criterion (suggest, no delete)
    state   (debt):    [ orphan_mirror("mir-9"), stale_fixture("fix-4"), surviving_mutant("truth-3") ]
    command (suggest): SuggestTrim(debt)
    events:  [ plan has 3 suggestions,
               each proposed_action is an open_idea_* (never a delete),
               each suggestion.requires == "idea → mirror → /goal → human approval",
               NO truth row deleted, NO ChangeSet opened by SuggestTrim ]

  fixture "a clean kernel yields empty debt and an empty trim plan"
    state   (kernel):  [ { id: "truth-1", live: true } ]
    state   (mirrors): [ { id: "mir-1", reflects: "truth-1", liveness: "live" } ]
    state   (mutation):[ { target: "truth-1", status: "killed" } ]
    command (scan):    Scan then SuggestTrim
    events:  [ debt == [], trimPlan == [] ]                               # no false positives

  fixture "the recorded snapshot id is the content hash of its body"
    state   (...):     [ ... ]
    command (scan):    Scan then canonical-hash(snapshot body)
    events:  [ snapshot.id == Hash(Canonicalize(body)) ]                  # content-addressed (S01/S02 reused)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: debt.Scan + trim.SuggestTrim · test_kind: property · cert_language: rapid · authority: below
  ∀ snapshot,now:  Scan is deterministic — same inputs ⇒ same DebtItems (now is passed, never read from the clock)
  ∀ mirror reflecting no live truth:  it appears as exactly one orphan_mirror DebtItem  (completeness, S12)
  ∀ fixture whose pinned truth version != live head:  it appears as a stale_fixture DebtItem
  ∀ mutation reported survived against a covered truth:  it appears as a surviving_mutant DebtItem
  ∀ Scan run:  no DebtItem.kind outside { stale_fixture, surviving_mutant, orphan_mirror }  (no invented kind)
  ∀ Scan/SuggestTrim run:  the input snapshot is unchanged — pure, read-only, NEVER deletes/writes a row
  ∀ TrimSuggestion:  proposed_action is an open_idea_* and requires the idea→mirror→/goal→human door  (suggest only)
  ∀ DebtItem:  target_ref traces to a real input truth/mirror/mutation — Scan never invents a target or targetId
  ∀ clean snapshot (no orphan/stale/survivor):  debt == [] and trimPlan == []  (no false positives)
  ∀ malformed snapshot/mirror/mutation row:  Scan/SuggestTrim yield a report, never panic
  ```

Both start **red** (no `debt` package, no `trim` package, no `Scan`/`SuggestTrim`, no `fitness.kernel_debt_snapshot` table). That red **is** the `/goal`. The fixtures are **means-tests toward the human red** (orphan/stale/survivor detected; trim suggested; nothing deleted) — not new truths the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/kernel-debt/page.tsx` (new route `/kernel-debt`; do not touch existing routes). A read-only panel reading via the SELECT-only role, with two views: (1) the **debt ledger** — the latest snapshot's `DebtItem`s grouped under three headers **ORPHAN MIRRORS**, **STALE FIXTURES**, **SURVIVING MUTANTS**, each item showing its `target_ref`, `reason` and a severity badge; (2) the **trim plan** — each `TrimSuggestion` rendered as a *proposal card* showing its `proposed_action` (an `open_idea_*`), its rationale, and a prominent `requires: idea → mirror → /goal → human approval` marker, with **no delete/apply affordance** (the "suggests, deletes nothing" rule made visible in the UI). A clean kernel renders an explicit "no debt detected — empty trim plan" state.
- **Playwright e2e:** `tests/e2e/kernel-debt.spec.ts` — navigate to `/kernel-debt`, assert an orphan mirror renders under **ORPHAN MIRRORS**, a moved-head fixture under **STALE FIXTURES**, a survived mutation under **SURVIVING MUTANTS**, that each trim suggestion shows the `idea → mirror → /goal → human approval` requirement and exposes **no apply/delete button** (the done criterion: suggestion only, nothing deletable from the UI), and that a clean snapshot renders the empty-debt state. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/debt/**` (incl. `back/runtime/debt/trim/**`), the new `back/migrations/<new>.sql`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/kernel-debt.spec.ts`, `.claude/skills/trim/SKILL.md`, and `front/web/app/kernel-debt/**` — and otherwise **adds new files**. It defines new contracts (the `KernelDebt`/`DebtItem` report + the three detectors; the `TrimPlan`/`TrimSuggestion` suggestion; the `fitness.kernel_debt_snapshot` table; the `/trim` gesture); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT; `Scan`/`SuggestTrim` and `/trim` **delete nothing** and write no truth — a trim is a *suggestion*, never a `DELETE`/`DROP`. Any change to a **prior contract** it depends on — S01/S02's content-hash substrate, S12's completeness/monster notion, the consumed mutation/gremlins run shape, the `kernel`/`mirrors` record shapes it reads, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S41 — "KernelDebt + /trim-kernel (stale fixtures, surviving mutants, orphan
mirrors)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant
to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/runtime/debt ONLY (incl. its trim/
subpackage, plus the Atlas migration in back/migrations). Follow the CLAUDE.md §6 per-step loop IN ORDER. Never
go prompt → code.

Read BEFORE touching anything: KRD.md on kernel debt / curation / completeness (the truth-store accumulates rot —
stale fixtures, surviving mutants, orphan mirrors — and naming it is a DIAGNOSTIC, never a deletion; the only
door to changing a truth is idea → mirror → /goal → human approval) and the anti-Goodhart / non-gameable-judge
sections (the Judge is the deterministic mirror; debt is computed, never declared). Read CONTEXT-MAP.md +
back/runtime/CONTEXT.md (kernel debt, orphan mirror = monster, stale fixture, surviving mutant, completeness law,
the wall, /trim as a SUGGEST-only gesture — and the AVOID lists: KernelDebt is NOT a garbage collector / a purge
/ a retention policy / a linter that deletes; /trim is NOT a delete command) and the prior steps' specs (S01/S02
content-store + records/content-hash, S04 the wall, S12 completeness/monster, S20 ChangeSet write-path, the prior
mutation/gremlins sensor step it consumes). For any Next.js 16, Atlas, or Go API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: KernelDebt is a READ-ONLY DIAGNOSTIC that classifies rot into EXACTLY three DECLARED kinds —
    orphan_mirror (a mirror reflecting no live truth — a monster by the completeness law, S12), stale_fixture (a
    fixture mirror whose pinned truth version no longer matches the live head it reflects), surviving_mutant (a
    mutation reported alive by the CONSUMED mutation/gremlins run against a truth a mirror claims to cover). /trim
    SUGGESTS a trim plan over those findings and DELETES NOTHING: every proposed_action is the opening of an idea
    (open_idea_to_retire_mirror / open_idea_to_repin_fixture / open_idea_to_strengthen_mirror), and every
    suggestion REQUIRES the door idea → mirror → /goal → human approval. This step delivers DETECTION + SUGGESTION
    over a read-only snapshot, NOT trim execution / deletion (later, via a goal), NOT the mutation-testing engine
    (consumed), NOT a re-definition of completeness/monster (consumed from S12), NOT any truth write. Sharpen each
    term against back/runtime/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every
    branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = a read-only snapshot (a set
        of kernel truth records with versions/liveness, a set of mirror records with reflects/test_kind/liveness/
        pinned-version, a consumed mutation run with survived/killed targets) + a passed-in `now`; command =
        Scan(snapshot, now) and SuggestTrim(debt); events = the DebtItems and the TrimPlan. Cover: an ORPHAN
        mirror ⇒ orphan_mirror DebtItem and NOTHING deleted (read-only) — THE done criterion ; a fixture whose
        pinned truth MOVED ⇒ stale_fixture — THE done criterion ; a SURVIVED mutation against a covered truth ⇒
        surviving_mutant — THE done criterion ; debt ⇒ SuggestTrim yields suggestions that are all open_idea_*,
        each requiring the idea→mirror→/goal→human door, with NO deletion and NO ChangeSet opened by SuggestTrim —
        THE done criterion (suggest only) ; a CLEAN kernel ⇒ empty debt + empty plan (no false positives) ; the
        recorded snapshot id == Hash(Canonicalize(body)) (content-addressed, S01/S02 reused).
      - PROPERTY (rapid, ∀, below the line): Scan is deterministic (now passed in, never read from the clock) ;
        any no-live-truth mirror ⇒ exactly one orphan_mirror ; any moved-head fixture ⇒ stale_fixture ; any
        survived mutation on a covered truth ⇒ surviving_mutant ; no DebtItem.kind outside the three declared
        kinds ; the input snapshot is NEVER mutated/deleted (pure, read-only) ; every TrimSuggestion is an
        open_idea_* requiring the door (suggest only) ; every target_ref traces to a real input (no invented
        target/targetId) ; a clean snapshot ⇒ empty debt + empty plan ; never panics on malformed input.
    Run them; watch them go RED (no debt/trim packages, no Scan/SuggestTrim, no fitness.kernel_debt_snapshot
    table). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new debt kind
    or a completeness rule you'd grade yourself) — mirror the human intention only (orphan/stale/survivor
    detected; trim suggested; nothing deleted); the fixture is a means-test toward the human red.

(c) TDD red → green → refactor in back/runtime/debt ONLY (incl. back/runtime/debt/trim, plus the Atlas migration
    in back/migrations). Outside-in. Build: the typed KernelDebt report + []DebtItem{id, kind, target_ref, reason,
    severity} and the three pure detectors (orphan_mirror via S12's monster notion REUSED not redefined,
    stale_fixture via pinned-version vs live-head, surviving_mutant via the CONSUMED mutation run) — no I/O, no
    time.Now() (now is a parameter), no learned thresholds ; and the pure SuggestTrim(debt) → TrimPlan whose every
    TrimSuggestion is an open_idea_* requiring the idea→mirror→/goal→human door — it DELETES NOTHING, writes no
    truth, opens no ChangeSet. Within the frozen slots, if a REAL tool choice arises, search AT MOST 3 current
    (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture/
    Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/CLI are fixed). The likely genuine choices: the
    canonical snapshot/DebtItem JSONB shape + content-hash (REUSE S01/S02's Canonicalize/Hash — do NOT fork it)
    and the consumed-mutation-run adapter shape (read-only). Record a short ADR (docs/adr/) ONLY if a genuine
    choice is made. The migration is expand-only/append-only: add fitness.kernel_debt_snapshot (id=hash PK, body
    jsonb, scanned_at, kernel_head, mutation_run_ref) — a new scan is a new row, never an UPDATE. GRANT the agent
    role SELECT only (the wall; fitness is read-only and kernel/mirrors are above the line); only the aidos writer
    role records a snapshot, inside a ChangeSet (S20). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only; never
    declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Scan on the orphan / stale /
    surviving-mutant / clean cases and SuggestTrim on the debt case, state the cause, propose. Check completeness:
    fitness.kernel_debt_snapshot (the debt diagnostic) has its living mirror (the fixture + property); no monster
    (no truth without a mirror, no orphan mirror, no row silently mutated, no suggestion that deletes) — else Stop
    blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/kernel-debt/ → /kernel-debt:
    render (SELECT-only role) the debt ledger (DebtItems grouped under ORPHAN MIRRORS / STALE FIXTURES / SURVIVING
    MUTANTS, each with target_ref + reason + severity) and the trim plan (each TrimSuggestion as a proposal card
    showing its open_idea_* action, rationale, and a prominent `requires: idea → mirror → /goal → human approval`,
    with NO delete/apply affordance — suggest only). Show an empty-debt state for a clean kernel. Read the
    snapshot; render it, do not re-implement Scan/SuggestTrim. Do NOT touch existing routes. Add
    tests/e2e/kernel-debt.spec.ts (use the playwright-e2e skill) asserting an orphan under ORPHAN MIRRORS, a
    moved-head fixture under STALE FIXTURES, a survived mutation under SURVIVING MUTANTS, each suggestion showing
    the idea→mirror→/goal→human requirement with NO apply/delete button (the done criterion: suggestion only),
    and the empty-debt state for a clean snapshot.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that debt and
    trim are deep, well-named modules (Scan/KernelDebt/DebtItem and the three detectors separated; SuggestTrim/
    TrimPlan/TrimSuggestion and the suggest-only/open-idea rule obvious), that Scan/SuggestTrim are pure and REUSE
    S01/S02's hash scheme and S12's monster notion without duplicating or redefining them, that the migration/
    GRANT keeps the wall intact (fitness is read-only, kernel/mirrors above the line, agent SELECT-only), that
    nothing in the path deletes or writes a truth, and that boundaries match back/runtime/CONTEXT.md. Do not
    advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package(s) (pure logic/schema), the Atlas migration
    (persistence), the fixture + rapid property (behaviour proof), the /trim Skill (repeatable gesture → SKILL.md
    encoding scan→suggest, the suggest-only/no-delete rule, and the idea→mirror→/goal→human door), and the Next
    route (visualization). Do NOT add a new MCP server or a hook — no new backend service or non-bypassable rule
    is justified at S41 (the wall already guards kernel/mirrors/fitness; reading the snapshot reuses the store MCP
    read path; recording a snapshot goes through the S20 changeset MCP + aidos writer role; /trim is advisory, not
    a gate — a hook that never fires is dead). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin a debt kind beyond the three declared
  (orphan_mirror, stale_fixture, surviving_mutant) or a trim action beyond the three open_idea_* forms. If the
  exact snapshot/DebtItem JSONB columns, the content-hash scheme, the consumed-mutation-run shape, the kernel/
  mirror record fields (reflects / liveness / pinned-version / live-head), or the completeness/monster notion are
  not pinned by KRD / an existing migration / S01-S02's Canonicalize / S12 / a referenced step, do NOT guess —
  record an OpenQuestion (provenance) and STOP on that branch. The example ids (truth-1, mir-9, fix-4) are
  illustrative; reuse pinned artifacts where a real id is needed, do not coin new business ids.
- You NEVER write a truth-test (a new debt kind or completeness rule you would then satisfy — the circularity).
  The fixture and property are means-tests toward the human red (orphan/stale/survivor detected; trim suggested;
  nothing deleted), not new truths. The Judge is the deterministic mirror, never an LLM scoring its own output.
- /trim and Scan/SuggestTrim DELETE NOTHING and write no truth — a trim is a SUGGESTION; acting on it goes through
  idea → mirror → /goal → human approval (the only door, CLAUDE.md §2). Any change to a prior contract (S01/S02
  records/hash, S12 completeness/monster, S20 ChangeSet write-path, the consumed mutation-run shape, the kernel/
  mirror record shapes, the wall GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never silently
  rewrite a prior artifact, never hand-edit back/gen/**. An override is a recorded decision (ChangeSet + ADR +
  provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the Scan fixtures pass — an ORPHAN mirror is an orphan_mirror DebtItem, a
moved-head fixture is a stale_fixture, a survived mutation on a covered truth is a surviving_mutant, and the
snapshot is read-only (nothing mutated/deleted) — and the SuggestTrim fixtures pass — debt yields suggestions
that are all open_idea_* requiring the idea→mirror→/goal→human door, with NO deletion and NO ChangeSet opened,
and a clean kernel yields empty debt + empty plan ; the recorded snapshot id is the content hash of its body ;
the rapid invariants hold (determinism with now passed in, orphan/stale/survivor detection, no invented kind, no
mutation of the input, suggest-only with the door, no invented target, no false positives, no panic) ;
/kernel-debt renders the debt ledger + the trim plan with no delete affordance and a passing Playwright e2e ; the
fitness.kernel_debt_snapshot GRANT proves SELECT-only for the agent ; the migration is append-only/expand-only.
You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /kernel-debt — what it renders (the orphan/stale/survivor debt ledger + the suggest-only trim plan
  with the idea→mirror→/goal→human requirement and no delete affordance + the empty-debt state), e2e file +
  result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to fitness.kernel_debt_snapshot go through the aidos CLI
  writer role via the S20 changeset flow, not the agent); any prior-contract change → ChangeSet + SemanticDiff,
  else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. detection + suggestion only (no trim execution / deletion — that is a later goal), mutation
  results and completeness/monster notion consumed not invented, no MCP, no hook, the consumed-mutation-run and
  kernel/mirror record-shape source assumptions.
- Next safe step: the smallest stable next tooth (e.g. the goal-driven trim EXECUTION that turns an accepted
  open_idea_* suggestion into an idea → mirror → /goal, or a vitality/cost diagnostic step) and why it is safe to
  chain.
```
