# S09 — Policy DSL (∀ ALLOW/DENY rule tree) + property mirror (rapid)

Subsystem: AIDOS Kernel | Home: `back/kernel/policy` | Workbench route: `/policy`

## Objectif

Land the **Policy DSL** as a content-addressed AST in the Kernel — a recursive ALLOW/DENY rule tree (combinators `all` / `any` / `not` + comparisons + `exists` / `matches`, scopes RESOURCE/OPERATION/ENTITY/FIELD) — and prove its authorization invariant with a **rapid property mirror**. The slice's anchor is the KRD §93 example policy `canPlaceOrder`: it must hold `∀` over generated contexts (every ALLOW passes, any DENY blocks). This step lands the AST shape + a pure evaluator + the property mirror only; it does not wire the policy into the Operation DSL, codegen, or runtime enforcement.

## Sortie attendue

Per CLAUDE.md §5, this step is **pure logic** (the DSL evaluator), **persistence** (the AST table), a **behaviour proof** (the property mirror), and a **visualization** — so exactly these artifacts, and no more:

- **Go package** — `back/kernel/policy/` — the typed Go AST for the Policy DSL (`Policy{name, scope, rule, effect}`; `Rule` as a sum type over `All` / `Any` / `Not` combinators, comparison leaves `Eq` / `Gt` / `Lt` / …, and `Exists` / `Matches` over a JSON-path selector on the evaluation context), plus a **pure** `Eval(policy, ctx) Decision` where `Decision ∈ {ALLOW, DENY}` and the combination law is **every ALLOW passes; any DENY blocks**. Pure functions only — no DB calls, no I/O, no codegen. The DSL is interpreted in Go (frozen N2/N1 slot); it is **not** compiled here.
- **Atlas migration** — `back/migrations/` — one declarative, expand-only migration creating `kernel.policy` as a content-addressed, append-only JSONB row that conforms to the S02 KRDCore record substrate: `id text PRIMARY KEY` = `Hash(Canonicalize(body))`, `body jsonb NOT NULL` (the serialized Policy AST), `version text NOT NULL` (= the hash, the licence to change), `superseded_by text NULL`, `created_at timestamptz`. **Append-only** (head moves via a new row + `superseded_by`, never an `UPDATE`/`DELETE` of the body). GRANTs: the agent DB role gets **SELECT only** on `kernel.policy` — no INSERT/UPDATE/DELETE (the wall, §2). Only the `aidos` writer role writes truth, via an approved ChangeSet.
- **BDD mirror** — the **rapid property test** (Go), conceptually stored in the `mirrors` schema and materialized to `tests/` for the runner. This is the canonical mirror for a `policy` layer (`reflects: kernel.policy`, `test_kind: property`, `cert_language: rapid`, `authority: above`). See "Test minimal".
- **Next route** — `front/web/app/policy/` — the Workbench `/policy` panel rendering the `canPlaceOrder` rule tree + its evaluator outcome (see "Visualisation UI").

> Explicitly **out of scope** (do not create — they would be monsters or out of slot here): no MCP server (no new backend capability is exposed; the evaluator is pure, the `store`/`mirror-runner` MCPs are earlier/later steps), no Hook (the wall already covers `kernel.policy` via the S04 GRANTs + PreToolUse classifier; no new non-bypassable rule is introduced), no Operation-DSL wiring / `authorize` step, no codegen/emitters (Go handler, TS guard), no sqlc queries, no Gherkin journey (a policy's nature is the invariant `∀`, not a journey — forcing an acceptance mirror here would be a double-typed monster).

## Test minimal (done)

**Done = `canPlaceOrder` holds over generators.** Restated **failing-first**, as the red BDD mirror to write **before** any evaluator code, conceptually stored in the `mirrors` schema and materialized for rapid. A policy's nature is an invariant (`∀`), so the mirror is a **property test (rapid in Go)** — the frozen N1 slot — not a Gherkin journey:

```
# mirrors schema · reflects: kernel.policy/canPlaceOrder · test_kind: property · cert_language: rapid · authority: above
# Policy DSL — ALLOW/DENY rule tree (KRD §24.4, §93). Combination law: every ALLOW passes; any DENY blocks.

∀ ctx ~ genCtx():
    Eval(canPlaceOrder, ctx) == ALLOW  ⇒  ctx.auth.user exists
                                       ∧  ctx.cart.userId == ctx.auth.user.id
                                       ∧  ctx.cart.items.length > 0
∀ ctx ~ genCtx():
    ¬(ctx.auth.user exists ∧ ctx.cart.userId == ctx.auth.user.id ∧ ctx.cart.items.length > 0)
                                       ⇒  Eval(canPlaceOrder, ctx) == DENY
# combination law (∀ over arbitrary rule trees, not just canPlaceOrder):
∀ tree, ctx:  any leaf evaluating DENY  ⇒  Eval(tree, ctx) == DENY      # any DENY blocks
∀ tree, ctx:  Eval(all([...ALLOW]), ctx) == ALLOW                       # every ALLOW passes
∀ tree:       Eval(not(not(tree))) ≡ Eval(tree)                          # not is an involution
# content-address tie-in (S02 substrate):
∀ policy:     id == version == Hash(Canonicalize(serialize(policy)))     # never a mutation, always a new version
```

The `genCtx()` / `genTree()` generators are **rapid** generators; `canPlaceOrder` is the KRD §93 anchor policy (`scope: OPERATION "createOrder"`; `rule: all([exists($.auth.user), eq($.cart.userId, $.auth.user.id), gt($.cart.items.length, 0)])`; `effect: ALLOW`). All start **red** (no AST, no `Eval`, no migration). That red **is** the `/goal`.

> Honesty: `canPlaceOrder` and its three sub-rules come **verbatim** from KRD §93 — do not invent additional business rules, scopes, or fields. If a comparator, a scope value, or a selector path is not pinned by KRD or an existing record, raise an **OpenQuestion** (provenance) and stop on that branch rather than guess.

## Visualisation UI

- **Workbench route:** `front/web/app/policy/page.tsx` (new route `/policy`; do not touch existing routes). It renders the `canPlaceOrder` **rule tree** (the `all([...])` node with its three leaf rules), each node's combinator/effect, and the policy's content-address id + above-the-line authority badge. A small "try a context" panel shows the evaluator's `ALLOW`/`DENY` decision for a sample context (e.g. an authed user with a non-empty matching cart → ALLOW; missing auth or empty cart → DENY). Reads from the SELECT-only role.
- **Playwright e2e:** `tests/e2e/policy.spec.ts` — navigate to `/policy`, assert the `canPlaceOrder` rule tree is present with its three named leaves and the ALLOW effect, and that a sample DENY context renders a DENY decision. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** (`back/kernel/policy/*.go`, `back/migrations/<new>.sql`, `front/web/app/policy/*`, `tests/e2e/policy.spec.ts`, the new rapid mirror source) and otherwise **adds new files**. It defines the `policy` layer's contract; it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** — it never alters or drops a prior table, and `kernel.policy` reuses the S02 content-addressed record shape rather than redefining it. Should a later need touch any contract this step freezes (the Policy AST shape, the ALLOW/DENY combination law, the `kernel.policy` GRANT, the `canPlaceOrder` anchor), that change must go through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) accompanied by a **SemanticDiff** on the affected policy/record schema — never an in-place edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S09 — "Policy DSL (∀ ALLOW/DENY rule tree) + property mirror
(rapid)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO
write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/policy ONLY.
Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.

Read first, before touching anything: KRD.md §24.4 (Policy DSL: combinators all/any/not + comparisons +
exists/matches, scopes RESOURCE/OPERATION/ENTITY/FIELD, effect ALLOW/DENY — every ALLOW passes, any DENY
blocks), §93 (the canPlaceOrder anchor policy + its property mirror), and the S02 record substrate
(content-addressed, append-only JSONB; id == version == Hash). Read CONTEXT-MAP.md + back/kernel/CONTEXT.md
(policy as a SOURCE layer, above the waterline; test-as-goal vs test-as-means; the monster law). Do not
start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language: what a `policy` layer is vs an `operation`; what "rule tree", "combinator",
    "scope", "effect ALLOW/DENY", and the combination law ("every ALLOW passes, any DENY blocks") mean
    here; what a content-addressed policy row is. Sharpen terms against back/kernel/CONTEXT.md; update
    CONTEXT.md / write an ADR inline only if a term genuinely shifts. For any Next.js 16 / Atlas / rapid
    API doubt use context7 or node_modules/next/dist/docs. Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to
    tests/ for the runner. A policy's nature is the invariant ∀ → the mirror is a PROPERTY TEST in
    rapid (Go), the frozen N1 slot — NOT a Gherkin journey (forcing acceptance here would be a
    double-typed monster). Properties to encode (red first):
      - Eval(canPlaceOrder, ctx) == ALLOW ⇒ auth.user exists ∧ cart.userId == auth.user.id ∧
        cart.items.length > 0; and the contrapositive ⇒ DENY (KRD §93, verbatim — invent nothing).
      - Combination law over arbitrary generated rule trees: any DENY leaf ⇒ Eval == DENY; all-ALLOW ⇒
        ALLOW; not(not(tree)) ≡ tree.
      - Content-address tie-in: id == version == Hash(Canonicalize(serialize(policy))); any byte change
        ⇒ a new version, never an in-place mutation.
    Run them; watch them go RED (no AST, no Eval, no migration). That red IS the goal. Do NOT write a
    truth-test you would then satisfy (no inventing a new authorization invariant you'd grade yourself)
    — mirror the human red (KRD §93) only; the agent writes means-tests, never truth-tests (the wall).

(c) TDD red→green→refactor in back/kernel/policy ONLY (plus the back/migrations/ Atlas file). Outside-in.
    Build the typed Policy AST (Policy{name, scope, rule, effect}; Rule sum type: All/Any/Not + comparison
    leaves Eq/Gt/Lt/… + Exists/Matches over a JSON-path selector) and a PURE Eval(policy, ctx) Decision
    implementing "every ALLOW passes; any DENY blocks". Interpret the DSL in Go (frozen slot) — do NOT
    compile it, do NOT wire it into the Operation DSL or codegen. Within the frozen slots, if a real tool
    choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, and record an ADR
    (docs/adr/) only if a genuine choice was made. Frozen here: rapid for the property mirror; Atlas for
    the migration; sqlc+pgx is the DB-access slot but THIS step writes no queries. The likely real choice
    is the JSON-path selector library for Exists/Matches ($.auth.user, $.cart.items.length) — search ≤3,
    pick simplest, ADR it if chosen. Migration is expand-only/append-only; kernel.policy reuses the S02
    content-addressed record shape; GRANT the agent role SELECT only on kernel.policy (the wall).

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the rapid mirror,
    biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only; never
    declare the behaviour green from tests you wrote — done is computed.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, state the cause, propose. Do not
    finish a code step without it. Check completeness: the policy layer has its living rapid mirror, no
    monster (no policy AST without a mirror, no orphan mirror) — else Stop blocks. Shrink any rapid
    counterexample to its minimal form before declaring green.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/policy/page.tsx at
    /policy: render the canPlaceOrder rule tree (the all([...]) node + its three named leaves), each
    node's combinator/effect, the policy's content-address id + above-the-line authority badge, and a
    "try a context" panel showing the evaluator's ALLOW/DENY decision for a sample context (authed +
    matching non-empty cart → ALLOW; missing auth or empty cart → DENY). Read via the SELECT-only role.
    Do NOT touch existing routes. Add tests/e2e/policy.spec.ts (use the playwright-e2e skill) asserting
    the rule tree with its three leaves + ALLOW effect, and a DENY decision for a DENY sample context.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check the
    policy package is a deep, navigable module (AST + Eval cleanly separated, the combination law in one
    well-named place), boundaries match back/kernel/CONTEXT.md, and the migration/GRANTs keep the wall
    intact. Do not advance without it.

(h) CREATE ARTIFACTS per §5 and ONLY those that apply: the Go package (pure logic — AST + Eval), the
    Atlas migration (persistence — kernel.policy, content-addressed, SELECT-only for the agent), and the
    rapid property mirror (behaviour proof). Do NOT add an MCP server, a Hook, Operation-DSL wiring,
    codegen/emitters, sqlc queries, or a Gherkin journey — no new capability/rule/persistence beyond
    these is justified at S09. A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- Never invent a target, a targetId, or a business-rule. canPlaceOrder and its three sub-rules are
  KRD §93 verbatim — add no scopes, comparators, fields, or rules beyond what KRD/an existing record
  pins. If a selector path, a scope value, or a comparator's meaning is uncertain, do NOT guess — raise
  an OpenQuestion (provenance) and stop on that branch.
- You never write a truth-test (an authorization invariant you would then satisfy — the circularity).
  The property mirror is a means-test toward the human red (KRD §93), not a new truth.
- Any change to a prior contract goes through a ChangeSet + SemanticDiff. Add new files; never silently
  rewrite a prior artifact, never hand-edit back/gen/**. An override is a recorded decision (ChangeSet +
  ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one (CLAUDE.md working
  guideline 1).

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green AND prior green intact AND mutation score
≥ threshold AND no monster. Concretely: canPlaceOrder holds over the rapid generators (ALLOW iff the three
conditions, else DENY); the combination law holds over arbitrary generated rule trees (any DENY ⇒ DENY,
all ALLOW ⇒ ALLOW, not∘not ≡ id); id == version == Hash for the serialized AST; the /policy route renders
the rule tree and a DENY decision with a passing Playwright e2e; GRANTs prove SELECT-only; migration is
append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: the rapid property mirror (which properties), where stored (mirrors schema) / materialized
  to tests/. State explicitly that no Gherkin journey was added and why (policy nature is ∀).
- Tests run: command + pass/fail counts (rapid/go test, biome, eslint, playwright); rapid seed/shrink
  notes for any counterexample.
- UI route: /policy — what it renders (rule tree + ALLOW/DENY try-a-context), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent),
  or "none" if no prior contract changed.
- Red-set status: which properties went red then green; any still red.
- Known limits: e.g. policy not yet wired into the Operation DSL `authorize` step, no codegen/emit, no
  sqlc repository, selector/comparator coverage, scopes implemented vs declared.
- Next safe step: the smallest stable next tooth (e.g. wiring `authorize { policy }` into the Operation
  DSL, or emitting a Go/TS guard from the policy AST) and why it is safe to chain on this stable phase.
```
