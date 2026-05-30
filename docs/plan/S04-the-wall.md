# S04 — The wall: deny agent writes to kernel/mirrors/fitness (PreToolUse hook + Postgres GRANTs)

Subsystem: AIDOS Runtime | Home: `back/hooks/pretooluse` | Workbench route: `/wall`

## Objectif

Erect the wall in defense-in-depth: a `PreToolUse` Go hook that refuses any agent write above the waterline (`kernel` / `mirrors` / `fitness`) and returns an actionable `BlockReason` (`AGENT_WRITE_ABOVE_WATERLINE`), backed by Postgres GRANTs that give the agent's DB role no write privilege on those truth schemas. Only an approved ChangeSet via the `aidos` role writes truth.

## Sortie attendue

Only the artifacts that apply per CLAUDE.md §5 — the wall is a **non-bypassable rule** (Hook) plus **persistence** (migration), with a **behaviour proof** and a **UI**:

- **Go hook binary** — `back/hooks/pretooluse/` — reads a tool-call event on stdin, classifies the write target, and on a kernel/mirrors/fitness write target emits a `BlockReason{code, severity, explanation, how_to_fix[]}` with `code = AGENT_WRITE_ABOVE_WATERLINE` and a non-zero / deny verdict; passes through (allow) anything below the waterline. (CLAUDE.md §5: non-bypassable rule → Hook, Go binary.)
- **Go package** — the `BlockReason` type + the waterline classifier (pure logic: path/schema → above|below). Lives with the hook in `back/hooks/pretooluse/` (no separate home needed for single-use logic — §Simplicity).
- **Postgres migration (Atlas)** — `back/migrations/` — declarative GRANTs: the agent DB role gets **no** `INSERT/UPDATE/DELETE/TRUNCATE` on the `kernel`, `mirrors`, `fitness` schemas (and `REVOKE` of any default); the `aidos` writer role keeps them. Append-only, expand-contract (CLAUDE.md §5: persistence → Atlas migration). This is level 2 of the wall.
- **BDD mirror** — stored in the `mirrors` schema, materialized to `tests/` for the runner (see "Test minimal"). The mirror is the proof the wall fires.
- **Next route** — `front/web/app/wall/` — the Workbench `/wall` panel visualizing the waterline + block events (see "Visualisation UI").

Explicitly **NOT** in scope (would be monsters / out of slot here): no MCP server (no new backend capability is exposed — the hook is invoked by the harness, not called as a tool), no Skill (no replayable gesture yet), no Go struct emission from kernel ASTs.

> Per CLAUDE.md §5 hook-honesty: this hook ships with a **fault-injection test** — point it at a real kernel write and assert it goes red; flip the target below the waterline and assert it stays green. A hook that never fires is dead.

## Test minimal (done)

**Done criteria:** *Agent write to kernel blocked with `BlockReason AGENT_WRITE_ABOVE_WATERLINE`; the mirror proves it.*

Restated as a **failing-first** BDD mirror to write **before** any hook code (red is the `/goal`). Two cert-languages, one nature each:

- **Journey (N0) — Gherkin / Godog**, stored in `mirrors`, materialized to `tests/`:

  ```gherkin
  Feature: The wall denies agent writes above the waterline
    Scenario: agent attempts to write a kernel truth
      Given the actor is the "agent" role
      And a PreToolUse event targeting a write to the "kernel" schema
      When the PreToolUse hook evaluates the event
      Then the verdict is "deny"
      And the BlockReason code is "AGENT_WRITE_ABOVE_WATERLINE"
      And the BlockReason carries a non-empty how_to_fix path (idea → mirror → /goal)

    Scenario Outline: every above-waterline zone is denied
      Given the actor is the "agent" role
      And a PreToolUse event targeting a write to the "<zone>" schema
      When the PreToolUse hook evaluates the event
      Then the verdict is "deny"
      And the BlockReason code is "AGENT_WRITE_ABOVE_WATERLINE"
    Examples:
      | zone    |
      | kernel  |
      | mirrors |
      | fitness |

    Scenario: agent writes a projection below the waterline
      Given the actor is the "agent" role
      And a PreToolUse event targeting a write to "back/gen/"
      When the PreToolUse hook evaluates the event
      Then the verdict is "allow"
  ```

- **Invariant (∀) — property test (rapid, Go):** for any generated target string, `classify(target)` ⇒ deny **iff** the target resolves to one of {`kernel`, `mirrors`, `fitness`} (schema or `back/kernel/**`, `back/kernel/mirror/**`); allow otherwise. No third verdict; deny ⇒ code is always `AGENT_WRITE_ABOVE_WATERLINE`.

- **Fault-injection (DB level 2, Testcontainers + real Postgres):** as the agent DB role, `INSERT` into a `kernel`/`mirrors`/`fitness` table ⇒ permission-denied SQL error; the same `INSERT` as the `aidos` role ⇒ succeeds. This proves the GRANTs, not just the hook.

All three are **red first** (no hook binary, no classifier, no migration applied). Done = red set → green ∧ prior green intact ∧ no monster (CLAUDE.md §8 — done is computed, never declared).

## Visualisation UI

**Workbench route:** `front/web/app/wall/` → `/wall`. A read-only panel showing: the **waterline** (above = kernel/mirrors/fitness, frozen; below = projections, free), the list of guarded zones, and a feed of recent **block events** (`BlockReason` code, severity, explanation, how_to_fix). New route only — do not touch existing routes.

**Playwright e2e** (`tests/e2e/wall.spec.ts`, via the `playwright-tester` agent + `playwright-e2e` skill; `playwright.config.ts` already has the `webServer` block, baseURL `http://localhost:3000`):

```
Given the Workbench is running
When I navigate to /wall
Then I see the waterline with kernel, mirrors, fitness above the line
And I see a block event with code AGENT_WRITE_ABOVE_WATERLINE
And its how_to_fix names the idea → mirror → /goal door
```

## Regle anti-ecrasement

This step edits **only its own declared files** and otherwise **adds new files**: `back/hooks/pretooluse/**`, the new `back/migrations/` GRANTs migration, the `mirrors`-stored Gherkin/property/fixture materialized to `tests/`, `tests/e2e/wall.spec.ts`, and `front/web/app/wall/**`. It must not hand-edit generated files (`back/gen/**`), must not touch prior Workbench routes, and must not write truth directly. Any change to a prior contract (a kernel schema name, an earlier ADR's waterline definition, an existing hook's interface) goes through a **ChangeSet** + a **SemanticDiff** — never a silent rewrite (CLAUDE.md §9). If a real tool choice is made inside a frozen slot, record an **ADR**.

## Prompt a lancer

```text
You are step-executor for AIDOS step S04 — "The wall" (deny agent writes to kernel/mirrors/fitness).
Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write
grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/hooks/pretooluse.
Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.

(a) GRILL-WITH-DOCS the intention first. Run /grill-with-docs. One intention, ≤5 scenarios.
    Sharpen the ubiquitous language against CONTEXT-MAP.md + the Kernel/Runtime CONTEXT.md:
    waterline / mur / wall, BlockReason, "above the line" = kernel|mirrors|fitness. Confirm with
    KRD.md (LIVRE II §6–8: the wall = permissions = waterline = truth/code frontier) and ADR 0002
    (the PreToolUse wall denies /kernel/** which now covers /kernel/mirror/**). For any Next.js 16
    / Atlas / Go-MCP-SDK API doubt use context7 or node_modules/next/dist/docs. Update CONTEXT.md /
    write an ADR if a term or boundary is sharpened.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to
    tests/ for the runner. Three forms per nature: (N0) Gherkin/Godog for the journey "agent write to
    kernel is denied with AGENT_WRITE_ABOVE_WATERLINE"; (∀) a rapid property "classify(target) denies
    iff above the waterline, else allows; deny ⇒ code AGENT_WRITE_ABOVE_WATERLINE"; plus a
    Testcontainers fault-injection proving the Postgres GRANTs (agent INSERT → permission denied,
    aidos INSERT → ok). Run them. They MUST be RED (no binary, no classifier, no migration). That red
    IS the /goal.

(c) TDD red → green → refactor, in back/hooks/pretooluse ONLY (plus the back/migrations/ GRANTs file).
    Outside-in. Within the frozen slots, search the CURRENT (May 2026) best tool AT MOST 3, pick the
    SIMPLEST, never touch the mandatory minimum (Godog, rapid, Atlas, sqlc/pgx, Go-MCP-SDK are fixed).
    The only real choice likely here is the GRANT-emission shape (raw SQL in Atlas vs a generated DDL)
    and the PreToolUse event-decode shape — if you make a genuine choice, record a short ADR; otherwise
    do not. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): go vet / strict Go / gofmt, Biome at the monorepo
    root, ESLint in front/web. Self-certify on the COMPUTATIONAL only. Never declare the behaviour green
    from tests you wrote — done is computed.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce the wall firing on
    a real kernel-write event AND a real agent-role INSERT, confirm both levels of defense actually
    block. Add the hook's fault-injection test (break what it watches → assert red; move target below
    the line → assert green); a hook that never fires is dead.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is required). Create front/web/app/wall/ → /wall:
    waterline (kernel/mirrors/fitness above, projections below) + a block-event feed showing
    BlockReason code/severity/explanation/how_to_fix. Do NOT touch existing routes. Add
    tests/e2e/wall.spec.ts (use the playwright-e2e skill) asserting the waterline and a visible
    AGENT_WRITE_ABOVE_WATERLINE event with its idea → mirror → /goal how_to_fix.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check the
    waterline classifier is a deep, well-named module; no ball of mud; boundaries match CONTEXT.md.

(h) CREATE ARTIFACTS PER §5: the Hook (back/hooks/pretooluse, this step), the Postgres GRANTs migration
    (back/migrations/, Atlas, append-only). Do NOT add an MCP server or a Skill — no new backend
    capability or replayable gesture is warranted here; a new artifact may ADD a guardrail, never REMOVE
    one.

HONESTY RULES (mandatory):
- Never invent a target, targetId, or business-rule. If the exact kernel/mirrors/fitness schema names,
  the agent DB role name, the GRANT set, or the PreToolUse event shape are not pinned by an existing
  migration / ADR / CONTEXT.md, do NOT guess — record an OpenQuestion and stop on that branch.
- You never write a truth-test (an invariant you would then satisfy — the circularity). The wall's
  mirror is a means-test toward the human red, not a new truth.
- Any change to a prior contract goes through a ChangeSet + SemanticDiff. Add new files; never silently
  rewrite a prior artifact, never hand-edit back/gen/**.
- An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

DONE CRITERIA (computed, not declared): red set → green ∧ prior green intact ∧ the GRANT fault-injection
denies the agent role and allows aidos ∧ the hook returns BlockReason code AGENT_WRITE_ABOVE_WATERLINE on
a kernel write and allows a below-waterline write ∧ no monster ∧ /wall renders with a passing Playwright
e2e.

END WITH THE STEP REPORT:
- BDD added: which mirrors (Gherkin/Godog, rapid property, Testcontainers fault-injection) and where in
  `mirrors` / tests/.
- Tests run: commands + red→green transition (hook unit/property, Godog journey, DB GRANT injection).
- UI route: /wall + the Playwright spec path and result.
- ChangeSet status: any prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: started red, now green (list any still-red).
- Known limits: e.g. event-shape coverage, schemas not yet created, sensors not yet wired.
- Next safe step: the stable phase this leaves and the smallest next tooth that consumes it.
```
