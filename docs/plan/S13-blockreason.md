# S13 — BlockReason everywhere (code/severity/explanation/how_to_fix) + `aidos explain`

Subsystem: AIDOS Runtime | Home: `back/runtime/blockreason` | Workbench route: `/why-blocked`

## Objectif

Make every KRD refusal actionable: one shared `BlockReason{code, severity, explanation, how_to_fix[]}` type used at every block site, and an `aidos explain` CLI verb that renders a block's resolution path — so that `MISSING_MIRROR`, `MISSING_AUTHORITY`, and `OUT_OF_SCOPE` each come back explained, with concrete fixes (KRD: "un mur sans `BlockReason` devient une prison").

## Sortie attendue

Only the artifacts that apply per CLAUDE.md §5 — this step is **pure logic** (a Go package) plus **CLI wiring**, with a **behaviour proof** and a **UI**. It does **not** erect a new wall (S04 did) — it gives the wall, and every other refusal, a common actionable vocabulary.

- **Go package** — `back/runtime/blockreason/` — the canonical `BlockReason` struct (`code`, `severity`, `explanation`, `how_to_fix []string`), the `Code` enum (at minimum `MISSING_MIRROR`, `MISSING_AUTHORITY`, `OUT_OF_SCOPE`; the existing `AGENT_WRITE_ABOVE_WATERLINE` from S04 folds in), a `Severity` enum (`blocking` at least, matching the KRD §44.5 example), and constructors that map each `Code` → its default `how_to_fix[]` resolution path. Pure logic, single home (CLAUDE.md §5: pure logic → Go package; §Simplicity: no abstraction beyond the three required codes + the one already in use).
- **`aidos explain` CLI wiring** — `back/cmd/aidos/` — wire the `explain` subcommand (already named in the CLI surface, CLAUDE.md §4 and KRD §82.1 `krd explain`) to render a `BlockReason` (by block id or piped event) as human-readable text: code, severity, explanation, and the numbered `how_to_fix[]`. This edits only the `explain` command's own files; it does not touch other verbs.
- **BDD mirror** — conceptually stored in the `mirrors` schema, materialized to `tests/` for the runner (see "Test minimal"). Proves each code explains itself with a non-empty fix path.
- **Next route** — `front/web/app/why-blocked/` → `/why-blocked` — the Workbench panel that renders a `BlockReason` exactly as `aidos explain` does (see "Visualisation UI").

Explicitly **NOT** in scope (would be monsters / out of slot here):
- **No new MCP server** — `aidos explain` is a CLI read over data the harness already produces; no new backend capability is exposed as a tool. (If a future step needs the Workbench to fetch live blocks, that is its own tooth — record it as Next safe step, do not pre-build.)
- **No new Hook** — no new non-bypassable rule is introduced; S13 is descriptive, not a wall. A new artifact may ADD a guardrail, never one that isn't earned (CLAUDE.md §5 hook-honesty: a hook that never fires is dead).
- **No Postgres migration** — S13 emits no new persistence. `BlockReason`s are produced at refusal time by sites that already exist (the wall, completeness, scope/authority checks); whether they are *persisted* is a separate decision and an **OpenQuestion** if the source of a historical block id isn't already pinned by a prior migration.
- **No new business-rule / truth** — `BlockReason` is Runtime plumbing (below the waterline), not a kernel truth. Do not invent codes beyond the three required (+ the inherited one) without a human red.

## Test minimal (done)

**Done criteria:** *`MISSING_MIRROR` / `MISSING_AUTHORITY` / `OUT_OF_SCOPE` are each explained with concrete fixes; `aidos explain` renders the explanation and its how_to_fix path.*

Restated as a **failing-first** BDD mirror to write **before** any package or CLI code (red is the `/goal`). Two cert-languages, one nature each:

- **Journey (N0) — Gherkin / Godog**, stored in `mirrors`, materialized to `tests/`:

  ```gherkin
  Feature: Every block explains itself and how to fix it
    Scenario Outline: aidos explain renders an actionable BlockReason
      Given a block with code "<code>"
      When I run "aidos explain" on that block
      Then the output shows the code "<code>"
      And the output shows a non-empty severity
      And the output shows a human explanation
      And the output lists at least one how_to_fix step
    Examples:
      | code              |
      | MISSING_MIRROR    |
      | MISSING_AUTHORITY |
      | OUT_OF_SCOPE      |

    Scenario: MISSING_MIRROR points at the idea → mirror → /goal door
      Given a block with code "MISSING_MIRROR"
      When I run "aidos explain" on that block
      Then a how_to_fix step is "write_mirror"
      And a how_to_fix step is "rerun aidos check"

    Scenario: MISSING_AUTHORITY points at assigning authority
      Given a block with code "MISSING_AUTHORITY"
      When I run "aidos explain" on that block
      Then a how_to_fix step is "assign_authority"

    Scenario: OUT_OF_SCOPE points at the scope owner
      Given a block with code "OUT_OF_SCOPE"
      When I run "aidos explain" on that block
      Then a how_to_fix step names the in-scope target or its owner
  ```

- **Invariant (∀) — property test (rapid, Go):** for **every** value of the `Code` enum, the constructed `BlockReason` has a non-empty `severity`, a non-empty `explanation`, and a `how_to_fix` slice of length ≥ 1; and `aidos explain`'s rendering of any `BlockReason` round-trips its code, severity, explanation, and every fix step (nothing is silently dropped or invented). There is no code that explains itself with an empty fix path — that would re-create the prison.

Both are **red first** (no `blockreason` package, no `explain` rendering). Done = red set → green ∧ prior green intact ∧ no monster (CLAUDE.md §8 — done is computed, never declared).

## Visualisation UI

**Workbench route:** `front/web/app/why-blocked/` → `/why-blocked`. A read-only panel that renders a `BlockReason` the same way `aidos explain` does: the **code** (badge), the **severity**, the **explanation** prose, and the numbered **how_to_fix** resolution steps. It shows the three canonical codes (`MISSING_MIRROR`, `MISSING_AUTHORITY`, `OUT_OF_SCOPE`) so a human can see "this is why it was blocked, and here is the path out". New route only — do not touch existing routes (e.g. S04's `/wall`).

**Playwright e2e** (`tests/e2e/why-blocked.spec.ts`, via the `playwright-tester` agent + `playwright-e2e` skill; `playwright.config.ts` already has the `webServer` block, baseURL `http://localhost:3000`):

```
Given the Workbench is running
When I navigate to /why-blocked
Then I see a block with code MISSING_MIRROR, its severity, and its explanation
And I see its how_to_fix steps including "write_mirror"
And switching to MISSING_AUTHORITY shows an "assign_authority" fix step
And OUT_OF_SCOPE shows a fix step naming the in-scope target or owner
```

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: `back/runtime/blockreason/**`, the `explain` command's own files under `back/cmd/aidos/`, the `mirrors`-stored Gherkin/property materialized to `tests/`, `tests/e2e/why-blocked.spec.ts`, and `front/web/app/why-blocked/**`. It must not hand-edit generated files (`back/gen/**`), must not touch prior Workbench routes (`/wall`, etc.), and must not write truth directly. The `AGENT_WRITE_ABOVE_WATERLINE` code introduced by S04 is a **prior contract**: folding it into the shared `blockreason` package (or having S04's hook import this package) is a change to S04's interface and therefore goes through a **ChangeSet** + a **SemanticDiff** — never a silent rewrite of S04's emitter (CLAUDE.md §9). If a real tool choice is made inside a frozen slot, record an **ADR**.

## Prompt a lancer

```text
You are step-executor for AIDOS step S13 — "BlockReason everywhere + aidos explain".
Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write
grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/runtime/blockreason.
Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.

(a) GRILL-WITH-DOCS the intention first. Run /grill-with-docs. One intention, ≤5 scenarios.
    Sharpen the ubiquitous language against CONTEXT-MAP.md + the Runtime CONTEXT.md and KRD.md
    §44.5 (BlockReason: code/severity/explanation/how_to_fix; "un blocage KRD doit toujours fournir
    un chemin de résolution") and §82.1 (krd/aidos explain = "explique les blocages"). Confirm the
    three codes IN SCOPE are MISSING_MIRROR, MISSING_AUTHORITY, OUT_OF_SCOPE, and that S04's
    AGENT_WRITE_ABOVE_WATERLINE is an inherited code that folds in. BlockReason is Runtime plumbing
    BELOW the waterline — it is NOT a kernel truth, do not treat it as one. For any Next.js 16 / Go
    CLI / cobra-or-stdlib-flag API doubt use context7 or node_modules/next/dist/docs. Update
    CONTEXT.md / write an ADR if a term or boundary is sharpened.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to
    tests/ for the runner. Two forms per nature: (N0) Gherkin/Godog for the journey "aidos explain
    renders each of MISSING_MIRROR / MISSING_AUTHORITY / OUT_OF_SCOPE with code, severity,
    explanation, and a non-empty how_to_fix"; (∀) a rapid property "for every Code value the
    constructed BlockReason has non-empty severity + explanation + ≥1 fix step, and explain's
    rendering round-trips every field, inventing nothing". Run them. They MUST be RED (no
    blockreason package, no explain rendering). That red IS the /goal.

(c) TDD red → green → refactor, in back/runtime/blockreason ONLY (plus the explain command's own
    files in back/cmd/aidos/). Outside-in. Within the frozen slots, search the CURRENT (May 2026)
    best tool AT MOST 3, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, go test
    are fixed). The only real choice likely here is the CLI surface shape for `explain` (stdlib flag
    vs the framework the other aidos verbs already use — match S03's CLI, do not introduce a second
    framework) and the render format (plain text vs structured) — if you make a genuine choice,
    record a short ADR; otherwise do not. Code only what turns the red set green; do not add codes
    beyond the three required (+ the inherited AGENT_WRITE_ABOVE_WATERLINE).

(d) KEEP SENSORS GREEN at each diff (PostToolUse): go vet / strict Go / gofmt, Biome at the monorepo
    root, ESLint in front/web. Self-certify on the COMPUTATIONAL only. Never declare the behaviour
    green from tests you wrote — done is computed.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor; reproduce `aidos explain`
    on a real block of each of the three codes and confirm the rendered how_to_fix is non-empty and
    actionable; confirm no code renders with an empty fix path (that would re-create the prison).

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is required). Create front/web/app/why-blocked/
    → /why-blocked: render a BlockReason exactly as `aidos explain` does — code badge, severity,
    explanation prose, numbered how_to_fix — for the three canonical codes. Do NOT touch existing
    routes (/wall etc.). Add tests/e2e/why-blocked.spec.ts (use the playwright-e2e skill) asserting
    MISSING_MIRROR's explanation + "write_mirror" fix, MISSING_AUTHORITY's "assign_authority" fix,
    and OUT_OF_SCOPE naming the in-scope target or owner.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check the
    blockreason package is a deep, well-named module (one type, one code→fix mapping, no scattered
    duplicated strings); confirm S04's wall can import it rather than re-declaring its own; boundaries
    match CONTEXT.md.

(h) CREATE ARTIFACTS PER §5: the Go package (back/runtime/blockreason, this step) and the `aidos
    explain` CLI wiring (back/cmd/aidos). Do NOT add an MCP server, a Hook, or a Postgres migration —
    no new backend capability, non-bypassable rule, or persistence is warranted here; a new artifact
    may ADD a guardrail, never REMOVE one.

HONESTY RULES (mandatory):
- Never invent a target, targetId, or business-rule. If the source of a historical block id, the
  exact wording of an explanation, or the authoritative how_to_fix for a code is not pinned by KRD
  §44.5 / an existing site (S04's wall, completeness, scope/authority checks) / an ADR / CONTEXT.md,
  do NOT guess — record an OpenQuestion and stop on that branch. In particular, the in-scope
  "target or owner" for OUT_OF_SCOPE must come from a real scope record, not a fabricated name.
- You never write a truth-test (an invariant you would then satisfy — the circularity). The
  blockreason mirror is a means-test toward the human red, not a new truth. BlockReason stays below
  the waterline.
- Any change to a prior contract goes through a ChangeSet + SemanticDiff. Folding S04's
  AGENT_WRITE_ABOVE_WATERLINE into this package, or having S04's hook import it, is a change to S04's
  interface → ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact, never
  hand-edit back/gen/**.
- An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

DONE CRITERIA (computed, not declared): red set → green ∧ prior green intact ∧ each of MISSING_MIRROR,
MISSING_AUTHORITY, OUT_OF_SCOPE constructs a BlockReason with non-empty severity + explanation + ≥1
how_to_fix step ∧ `aidos explain` renders all four fields and invents nothing (property round-trip) ∧
no code explains itself with an empty fix path ∧ no monster ∧ /why-blocked renders with a passing
Playwright e2e.

END WITH THE STEP REPORT:
- BDD added: which mirrors (Gherkin/Godog journey, rapid property) and where in `mirrors` / tests/.
- Tests run: commands + red→green transition (package unit/property, Godog journey, CLI explain).
- UI route: /why-blocked + the Playwright spec path and result.
- ChangeSet status: any prior-contract change (S04 fold-in) → ChangeSet + SemanticDiff, else "none".
- Red-set status: started red, now green (list any still-red).
- Known limits: e.g. block-source persistence not wired (OpenQuestion), codes covered = the three +
  inherited only, no MCP fetch for the Workbench yet.
- Next safe step: the stable phase this leaves and the smallest next tooth that consumes it.
```
