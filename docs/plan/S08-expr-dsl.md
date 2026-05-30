# S08 — Expr DSL (typed JSON AST: lit/ref/call/obj/arr, funcs, roots)

Subsystem: AIDOS Kernel | Home: `back/kernel/expr` | Workbench route: `/expr`

## Objectif

Land the **Expr DSL** — a typed JSON AST (`lit`/`ref`/`call`/`obj`/`arr`, a fixed function set, and `$`-rooted refs) with a pure Go evaluator — so that button conditions like `visible_when` / `enabled_when` are **executable and versionable as kernel artifacts, never free code** (KRD §24.5). This step delivers the AST shape + evaluator + its fixture mirror only; it does not wire controls, actions, or codegen.

## Sortie attendue

Per CLAUDE.md §5, this step needs **pure logic**, **persistence**, a **behaviour proof**, and a **visualization** — exactly these artifacts, no more:

- **Go package** (`back/kernel/expr/`) — the typed AST (one Go type per node `kind`: `lit`, `ref`, `call`, `obj`, `arr`), a `Parse(jsonb) (Expr, error)` that decodes + validates the AST (rejects unknown kinds, unknown functions, malformed refs), and a pure `Eval(expr Expr, env Env) (Value, error)` that resolves `$`-rooted refs against an `Env` and applies the **fixed** function set (KRD §24.5: `lowercase`, `concat`, `now`, `uuid`, `randomToken`, plus the comparison/logical/length ops the `visible_when` examples need: `>`, `&&`, `!`, `.length`). No DB calls, no I/O, no clock/RNG read inside `Eval` — `now`/`uuid`/`randomToken` resolve through injected `Env` providers so evaluation stays deterministic and testable. The function catalogue is a **closed allow-list** (no free code escape).
- **Atlas migration** (`back/migrations/`) — one declarative, expand-only migration adding the **AST table** `kernel.expr` (content-addressed: `id text PRIMARY KEY` = hash of the canonical AST JSONB; `ast jsonb NOT NULL`; `version text NOT NULL` = same hash; `superseded_by text NULL`; `created_at timestamptz`). Append-only (head moves via a new row + `superseded_by`, never an in-place `UPDATE`). GRANTs: the agent DB role gets **SELECT only** on `kernel.expr` — no `INSERT/UPDATE/DELETE` (the wall, §2; the S04 PreToolUse hook already guards the schema). Only the `aidos` writer role inserts an Expr AST, via an approved ChangeSet.
- **BDD mirror** — a **fixture** mirror (`state → command → events` per the N2 frozen slot: input AST + `Env` → `Eval` → result `Value`), conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go interpreter, plus a `rapid` property mirror for the ∀ invariants (see "Test minimal").
- **Next route** (`front/web/app/expr/`) — the `/expr` Workbench panel that renders an Expr AST and its evaluation against a sample `Env` (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no MCP server** (no read/write capability is exposed yet — evaluation is a pure library, not a backend op; an `evaluator` MCP tool is a later step if ever needed), **no hook** (no new non-bypassable rule beyond the existing wall GRANT/PreToolUse), **no Skill** (no replayable gesture yet), **no control/action wiring**, **no codegen/emitters** (`visible_when` → TS handler is a later projection step), **no Policy/Operation DSL** (sibling steps).

## Test minimal (done)

**Done = Eval fixtures pass; a `visible_when` expr evaluates.** Restated failing-first, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: kernel.expr.Eval · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "visible_when evaluates true when cart has items"
    state   (Env): { "$": { "cart": { "items": [ {"id":"a"}, {"id":"b"} ] } } }
    command (Expr AST): call ">" [ ref "$.cart.items.length", lit 0 ]    # i.e. $.cart.items.length > 0
    events:  [ result == true ]

  fixture "visible_when evaluates false when cart is empty"
    state   (Env): { "$": { "cart": { "items": [] } } }
    command (Expr AST): call ">" [ ref "$.cart.items.length", lit 0 ]
    events:  [ result == false ]

  fixture "function call composes"
    state   (Env): { "$": { "auth": { "user": { "name": "ADA" } } } }
    command (Expr AST): call "lowercase" [ ref "$.auth.user.name" ]
    events:  [ result == "ada" ]

  fixture "unknown function is rejected, not evaluated"
    command (Expr AST): call "exec" [ lit "rm -rf /" ]
    events:  [ Parse rejects: unknown function "exec" (closed allow-list) ]
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: expr.Parse/Eval · test_kind: property · cert_language: rapid · authority: below
  ∀ ast:        Parse(Canonicalize(ast)) round-trips (encode∘decode is identity on valid ASTs)
  ∀ ast,env:    Eval is deterministic — same (ast, env) ⇒ same Value (now/uuid/randomToken via injected Env)
  ∀ ast:        every node kind ∈ {lit,ref,call,obj,arr} and every call name ∈ the closed catalogue, else Parse errors
  ∀ ast:        Eval never panics — malformed ref / type-mismatch yields a typed error, not a crash
  ```

Both start **red** (no `expr` package, no `Eval`, no `kernel.expr` table). That red **is** the `/goal`. The fixture mirror is a **means-test toward the human red** (`visible_when` must evaluate) — not a new truth the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/expr/page.tsx` (new route `/expr`; do not touch existing routes). A read-only panel that renders one or more Expr ASTs from `kernel.expr` (via the SELECT-only role), shows each node `kind` (lit/ref/call/obj/arr) as a small tree, lists the resolved roots (`$.cart…`, `$.auth.user…`), and displays the **evaluation result** of the canonical `visible_when` expr against a sample `Env` (true for a non-empty cart, false for empty). With the empty kernel it renders the seeded sample ASTs from the fixtures.
- **Playwright e2e:** `tests/e2e/expr.spec.ts` — navigate to `/expr`, assert the `visible_when` expression (`$.cart.items.length > 0`) is shown as a typed AST and that its evaluated result is visible (true for the non-empty-cart sample, false for the empty-cart sample). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** (`back/kernel/expr/*.go`, `back/migrations/<new>.sql`, `front/web/app/expr/*`, `tests/e2e/expr.spec.ts`, the new mirror sources materialized to `tests/`) and otherwise **adds new files**. It defines a new contract (the Expr AST shape, the closed function catalogue, the `kernel.expr` table); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** — it never alters or drops a prior table or GRANT. Should a later need touch any contract this step freezes (the AST node set, a function in the catalogue, the content-address invariant on `kernel.expr`), that change goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) accompanied by a **SemanticDiff** on the affected schema/mirror — never an in-place edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S08 — "Expr DSL (typed JSON AST: lit/ref/call/obj/arr, funcs,
roots)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO
write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/expr ONLY.
Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.
Read KRD.md §24.1 (the button / control-spec uses visible_when/enabled_when) and §24.5 (the Expr DSL:
typed JSON AST lit/ref/call/obj/arr, functions lowercase/concat/now/uuid/randomToken, roots
$.input/$.auth.user…), plus §94 (the kernel button example), CONTEXT-MAP.md and back/kernel/CONTEXT.md.
Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST (run /grill-with-docs). One intention, ≤5 scenarios. Pin the
    ubiquitous language: what each node kind means (lit = literal value; ref = a $-rooted path into the
    Env; call = a function from the CLOSED catalogue applied to argument exprs; obj/arr = structural
    composers), what a "root" is ($.input, $.auth.user, $.cart…), and that the Expr DSL exists precisely
    so behaviour is a CONSTRAINED ARTIFACT, never free code (the comportement-as-artifact principle).
    Sharpen terms against back/kernel/CONTEXT.md; update CONTEXT.md / write an ADR inline if a term
    shifts. For any Next.js 16 / Atlas / Go-stdlib-JSON API doubt use context7 or
    node_modules/next/dist/docs. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to
    tests/ for the runner:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): input Env + Expr AST →
        Eval → result Value. Cover: $.cart.items.length > 0 is TRUE for a non-empty cart and FALSE for
        an empty cart (the visible_when done-criterion); a function call composes (lowercase($.auth.user
        .name) == "ada"); an unknown function ("exec") is REJECTED at Parse (closed allow-list), never
        evaluated.
      - PROPERTY (rapid, ∀, below the line): Parse∘Canonicalize round-trips; Eval is deterministic
        (now/uuid/randomToken resolved via injected Env providers, not real clock/RNG); every node kind
        ∈ {lit,ref,call,obj,arr} and every call name ∈ the closed catalogue else Parse errors; Eval never
        panics (typed error on malformed ref / type mismatch).
    Run them; watch them go RED (no expr package, no Eval, no kernel.expr table). That red IS the goal.
    Do NOT write a truth-test you would then satisfy (no inventing a new Expr invariant you'd grade
    yourself) — mirror the human intention only; the fixture is a means-test toward the human red.

(c) TDD red → green → refactor in back/kernel/expr ONLY (plus the Atlas migration in back/migrations).
    Outside-in. Build: the typed AST (one Go type per kind), Parse(jsonb)→(Expr,error) with a CLOSED
    function catalogue, and a pure Eval(expr,Env)→(Value,error) — no I/O, no clock/RNG inside Eval
    (inject now/uuid/randomToken via Env). Within the frozen slots, if a REAL tool choice arises, search
    at most 3 current (May 2026) options, pick the SIMPLEST, record an ADR (docs/adr/) only if a genuine
    choice was made. Frozen here: Atlas for the migration; the N2 fixture interpreter is Go; rapid for
    the property mirror; sqlc+pgx is the DB-access slot but THIS step writes no queries (the /expr route
    reads via a thin SELECT, no repository yet). The likely real choices: the AST JSON encoding /
    content-hash scheme (reuse the S02 Canonicalize/Hash if it exists — do NOT re-invent it) and the
    closed function-catalogue shape. Migration is expand-only/append-only; GRANT the agent role SELECT
    only on kernel.expr (the wall).

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new
    fixture + rapid mirrors, Biome check at the monorepo root, ESLint in front/web. Self-certify on the
    COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing (run /diagnose): isolate any failing sensor, state the cause, propose.
    Do not finish a code step without it. Check completeness: kernel.expr (the Expr truth) has its
    living mirror (the fixture + property); no monster (no truth without a mirror, no orphan mirror) —
    else Stop blocks.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/expr/page.tsx at
    /expr: render Expr ASTs from kernel.expr (SELECT-only role) as a typed node tree (lit/ref/call/obj/
    arr), list the resolved roots, and show the evaluated result of $.cart.items.length > 0 against a
    sample Env (true for non-empty cart, false for empty). Do NOT touch existing routes. Add
    tests/e2e/expr.spec.ts asserting the visible_when AST is shown and its evaluated result is visible,
    per the playwright-e2e skill (role/text selectors, no brittle CSS).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step (run /improve-codebase-architecture): check the
    expr package is a deep, well-named module (Parse/Eval/Env separated, catalogue closed and obvious),
    no ball of mud, boundaries match back/kernel/CONTEXT.md, the migration/GRANT keeps the wall intact.
    Do not advance without it.

(h) CREATE ARTIFACTS per §5 and ONLY those that apply: the Go package (pure logic) and the Atlas
    migration (persistence). Do NOT add an MCP server, a hook, or a Skill — no new capability, rule, or
    replayable gesture is justified at S08. A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- Never invent a target, a targetId, or a business-rule. The function catalogue is CLOSED — do not add a
  function KRD §24.5 does not name without raising it first. If the exact root set ($.input/$.auth/$.cart
  …), a function's semantics, the kernel.expr column names, or the content-hash scheme are not pinned by
  KRD / an existing migration / S02's Canonicalize, do NOT guess — record an OpenQuestion (provenance)
  and stop on that branch.
- You never write a truth-test (a new Expr invariant you would then satisfy — the circularity). The
  fixture/property are means-tests toward the human red, not new truths.
- Any change to a prior contract goes through a ChangeSet + SemanticDiff. Add new files; never silently
  rewrite a prior artifact, never hand-edit back/gen/**. An override is a recorded decision (ChangeSet +
  ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the Eval fixtures pass — `$.cart.items.length > 0` evaluates TRUE for
a non-empty cart and FALSE for an empty cart; an unknown function is rejected at Parse; the rapid
invariants hold (round-trip, determinism, closed kinds/catalogue, no panic); the /expr route renders the
typed AST and its evaluated result with a passing Playwright e2e; the kernel.expr GRANT proves SELECT-only
for the agent; migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) / materialized
  (tests/).
- Tests run: commands + pass/fail counts (go test / fixture interpreter, rapid, Biome, ESLint,
  Playwright).
- UI route: /expr — what it renders (AST tree + evaluated visible_when), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to kernel.expr go through the aidos CLI role,
  not the agent); else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no MCP evaluator, no control/action wiring, no visible_when → TS codegen yet, no
  sqlc repository, catalogue scope (only the §24.5 functions + comparison/logical ops the examples need).
- Next safe step: the smallest stable next tooth (e.g. the control-spec that consumes Expr for
  visible_when/enabled_when, or the Policy DSL sibling) and why it is safe to chain.
```
