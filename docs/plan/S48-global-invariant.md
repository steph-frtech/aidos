# S48 — GlobalInvariant (cross-cell / federation invariant)

Subsystem: AIDOS Kernel | Home: `back/kernel/globalinvariant` | Workbench route: `/global-invariants`

## Objectif

Land the **GlobalInvariant** as a Kernel source: a truth that spans **more than one cell** (bounded context), distinct from the per-truth **TruthScope** (S15) that scopes a *single* truth's reach. A GlobalInvariant declares its `scope ∈ {local_cell, contract_pair, federation_policy}`, its `blast_radius ∈ {small, bounded, global}`, and its `approval_required ∈ {cell_owner, both_contract_owners, architecture_owner}` (KRD §49.1). Two laws must be proven: (1) on violation, a cross-cell invariant **reddens the relevant cells** (the red wave fans out to every cell in the invariant's reach, S22, weighted along `composes`, S19 — not just the cell that changed); and (2) **a wider `blast_radius` demands wider approval** — a `global` blast_radius requires the `architecture_owner` (the strongest authority tier, reusing the S16 AuthorityGraph), and admission is **blocked** when the granted approval is narrower than the radius demands. The KRD rule is explicit: *un invariant transverse est une exception coûteuse, pas le mode normal* — the bounded contexts stay the primary walls; this step introduces the **cross-cell invariant primitive** without claiming full federation/stage-5 stability (deferred at S23/S47).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration for the AST table), a **behaviour proof** (BDD mirror), and a **visualization** (Next route) — and nothing more. It does **not** warrant a new hook, MCP server, or skill (justified below).

- **Go package** `back/kernel/globalinvariant/` — the `GlobalInvariant` AST type per KRD §49.1 (`name string`, `scope Scope` ∈ `local_cell | contract_pair | federation_policy`, `cells []cellRef` — the ≥1 bounded contexts the invariant spans, `predicate string` — the cross-cell predicate identifier the invariant asserts, `blast_radius BlastRadius` ∈ `small | bounded | global`, `approval_required Authority` ∈ `cell_owner | both_contract_owners | architecture_owner`), a `Validate(gi)` (shape: non-empty `name`; `scope`/`blast_radius`/`approval_required` are each in the frozen KRD §49.1 enum; `cells` has **at least two** distinct cells when `scope != local_cell` — a `contract_pair`/`federation_policy` invariant that names a single cell is **not** cross-cell and is rejected; the `approval_required` tier is **consistent** with `blast_radius` — `global` ⇒ `architecture_owner`, `contract_pair` ⇒ at least `both_contract_owners`), and two pure functions: **`RedWave(gi, violatedCell) → []cellRef`** that, given an invariant and the cell that violated it, returns the set of cells the violation **reddens** (every cell in the invariant's reach for `contract_pair`/`federation_policy`, the single cell for `local_cell` — reusing the S19 weighted-propagation semantics: a load-bearing cross-cell link reddens the partner cell, cosmetic does not), and **`Admit(gi, grantedApproval) → AdmissionDecision`** that returns `admitted | blocked | escalated` **plus** a `BlockReason` (KRD §44.5: `code`, `severity`, `explanation`, `how_to_fix[]`) when the granted approval is narrower than the `blast_radius` demands — e.g. a `global` invariant approved only by a `cell_owner` ⇒ `blocked` with `code: INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS`, `how_to_fix: [escalate_to_architecture_owner]`. Pure functions only, no I/O; the actual admission wiring into the `/goal` flow and the live red-wave fan-out into the S22 `RedWorkQueue` are later projections, not this step. Reuse the S16 AuthorityGraph `Decide` for the authority resolution — do **not** fork the approver/veto/escalation logic.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only: AST table `kernel.global_invariant`, a content-addressed append-only row (`id text PK` = hash of canonical JSONB body, reusing the **S02** record substrate's content-hash scheme — do **not** fork it; `body jsonb NOT NULL` holding `name`/`scope`/`cells`/`predicate`/`blast_radius`/`approval_required`, `version text NOT NULL`, `superseded_by text NULL`, `created_at timestamptz NOT NULL`). The `scope`, `blast_radius`, and `approval_required` enums are pinned both **inside** the JSONB body and as **`CHECK` constraints** on generated/expression columns (or a documented JSONB-path CHECK) so an out-of-enum value cannot be persisted — the three enums are the frozen KRD §49.1 values, never extended here. GRANTs: the agent DB role gets **SELECT only** on `kernel.global_invariant` (the wall, §2). Only the `aidos` CLI role writes truth, via an approved ChangeSet.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **GlobalInvariant fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): a cross-cell invariant whose violation **reddens the relevant cells** and whose `blast_radius` **demands the matching approval tier**. Plus a **property invariant** (rapid, `authority: below`) on `RedWave`/`Admit`/`Validate`. These ARE the done criteria (see below).
- **Next route** `front/web/app/global-invariants/` → `/global-invariants` — the Workbench panel rendering the cross-cell invariant: `scope`, the spanned `cells`, `blast_radius`, `approval_required`, the **red-wave fan-out** (which cells redden on a violation) and the **admission decision** (blocked when approval is too narrow), with the under-approved `global` case shown red (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no hook** — the cross-cell admission gate is a *decision function the `/goal` flow calls* and the red-wave fan-out is the *S22 `PostKernelChange` hook's* concern (already a hook); a new hook would need its own fault-injection test and a real failed run first (§5 hook honesty). **No MCP server** — no new backend capability is exposed (`RedWave`/`Admit`/`Validate` are pure logic called in-process; the S22 `aidos impact` CLI and the S16 authority surface already exist). **No skill** — declaring a cross-cell invariant is not yet a repeatable multi-step gesture distinct from the generic "declare a source". **No codegen** — there is no projection to emit from a GlobalInvariant at this step. **No SagaInvariant / CoherenceTest** (KRD §49.2) — the saga/compensation layer is a distinct later concern; here we land only the GlobalInvariant primitive. **No full federation/stage-5 stability** — S23/S47 deferred federation stability; this step introduces the cross-cell *primitive* and **claims no federation stability** (record an OpenQuestion for any federation-stability edge that surfaces).

## Test minimal (done)

**Done = a cross-cell invariant violation reddens every cell in its reach, AND a `global` blast_radius is blocked unless the `architecture_owner` approves.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **GlobalInvariant fixture** (`cert_language: fixture`, `authority: above`) — reflects `kernel.global_invariant` "pii-forgettable-federation" (KRD §49.1, the §49 fan-out example "tout agrégat portant du PII doit implémenter `Forgettable`"):

  ```
  # mirrors schema · reflects: kernel.global_invariant "pii-forgettable-federation" · test_kind: fixture · authority: above
  mirror reflects "pii-forgettable-federation" {
    global_invariant {
      name:              "pii-forgettable-federation"
      scope:             "federation_policy"
      cells:             [ checkout, profile, billing ]
      predicate:         "every_pii_aggregate_implements_forgettable"
      blast_radius:      "global"
      approval_required: "architecture_owner"
    }

    # the violation reddens EVERY cell in the invariant's reach, not just the violator
    given violation in cell "billing"
      -> red_wave reddens [ checkout, profile, billing ]
      -> red_wave is NOT limited to "billing" alone

    # a contract_pair invariant only reddens the pair (S19 weighted: load-bearing crosses, cosmetic does not)
    given global_invariant { scope: "contract_pair", cells: [ order, payment ], blast_radius: "bounded" }
      given violation in cell "order"
        -> red_wave reddens [ order, payment ]

    # THE approval done case — a global blast_radius needs the architecture_owner
    given admit { granted_approval: "cell_owner" }
      -> decision == "blocked"
      -> block_reason.code == "INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS"
      -> block_reason.how_to_fix contains "escalate_to_architecture_owner"

    given admit { granted_approval: "architecture_owner" }
      -> decision == "admitted"

    # a single-cell name on a federation_policy scope is not cross-cell — rejected at Validate
    given global_invariant { scope: "federation_policy", cells: [ billing ] }
      -> validate_error is non-empty   # contract_pair/federation_policy demand ≥2 distinct cells
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any `GlobalInvariant` and any violated cell, `RedWave` is **deterministic** and **total**, and for a `contract_pair`/`federation_policy` invariant the returned set **always contains every cell the invariant spans** (a cross-cell violation never reddens fewer cells than the invariant's reach — no silent under-propagation), while a `local_cell` invariant reddens exactly its one cell; `Admit` is deterministic, total (always one of `admitted | blocked | escalated`), and **monotone in radius**: a wider `blast_radius` is `admitted` only with an equal-or-wider `approval_required` tier (`global` ⇒ never `admitted` without `architecture_owner`; widening the radius never widens the set of approvals that admit it — never `admitted` with a *narrower* approval); a `GlobalInvariant` whose `scope`/`blast_radius`/`approval_required` is not in the KRD §49.1 enum ⇒ `Validate` returns a non-empty error; a `contract_pair`/`federation_policy` invariant naming `< 2` distinct cells ⇒ `Validate` errors (it is not actually cross-cell). All three enums match the frozen KRD §49.1 values exactly.

All start **red** (no `globalinvariant` package, no `global_invariant` table, no `RedWave`/`Admit`/`Validate`). That red **is** the `/goal`. The canonical done case is green only when (1) `RedWave(piiInvariant, "billing")` returns `[checkout, profile, billing]` — the violation reddens **every** cell in the federation invariant's reach, not just the violator — and (2) `Admit(globalInvariant, cell_owner)` returns `blocked` with an `INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS` `BlockReason` while `Admit(globalInvariant, architecture_owner)` returns `admitted` — i.e. **a cross-cell invariant reddens its reach, and a wider blast_radius demands wider approval.**

## Visualisation UI

- **Workbench route:** `front/web/app/global-invariants/page.tsx` (new route `/global-invariants`; do **not** touch existing routes). It renders the "pii-forgettable-federation" cross-cell invariant: `name`, `scope` (federation_policy), the spanned `cells` (`checkout`, `profile`, `billing`), `predicate`, `blast_radius` (global), and `approval_required` (architecture_owner). Plus a live **red-wave panel** showing that a violation in `billing` reddens **all three** cells (every cell rendered red, not just the violator), and a live **admission table** (the fixture rows with their computed `decision` and, when blocked, the `BlockReason` `code` + `how_to_fix`): the `cell_owner`-approval row shows `blocked / INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS` in **red**, the `architecture_owner`-approval row shows `admitted`. Themed per **ADR 0010** (design tokens, zinc + blue-600, Geist, radius `0.5rem` — never hardcoded `zinc-*`/hex) and bilingual per **ADR 0011** (`next-intl`, FR default, strings in `front/web/messages/{fr,en}.json`). Reads via the SELECT-only role; render the fixture, do **not** re-implement it.
- **Playwright e2e:** `tests/e2e/global-invariants.spec.ts` — navigate to `/global-invariants`, assert the invariant card names `scope: federation_policy`, `blast_radius: global`, `approval_required: architecture_owner`, and lists `checkout`, `profile`, `billing` under cells; assert the red-wave panel shows **all three** cells reddened on a `billing` violation (the violation is not limited to `billing`); assert the admission table shows the `cell_owner` row as `blocked` with `INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS` and the `architecture_owner` row as `admitted`. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/globalinvariant/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored GlobalInvariant fixture/property materialized to `tests/`, `tests/e2e/global-invariants.spec.ts`, and `front/web/app/global-invariants/**` — and otherwise **adds new files**. It introduces a new contract (the `global_invariant` kind, its AST shape, the three KRD §49.1 enums, the `RedWave`/`Admit`/`Validate` semantics and the `INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS` `BlockReason` code) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table. Any change to a **prior contract** it depends on — the S02 record substrate, the S16 AuthorityGraph (`Decide`, the authority tiers), the S19 weighted-propagation semantics, the S22 red-wave / `RedWorkQueue`, the S15 TruthScope (distinct, not reused as a cross-cell scope), or the `BlockReason` shape (KRD §44.5) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. Changing an invariant's `approval_required` tier is exactly a `reauthorize` SemanticDiff change_type; changing its `scope`/`cells` is a `rescope`; changing its `blast_radius` weight class is a `reweight` (KRD §44.1) — none is an edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8).

## Determinisme-first

Everything in this step is a **deterministic pure function** and **MUST** be code, never an agent/LLM (CLAUDE.md §6/§8 determinism-first): `Validate` (a schema/enum/cardinality check), `RedWave` (a graph fan-out over the invariant's spanned cells, reusing the S19 weighted-propagation algorithm — a wave is a graph traversal, never an "LLM impact agent"), and `Admit` (a total ordering comparison of `blast_radius` against the granted `approval_required` tier, reusing the S16 `Decide` — scoring against *declared* tiers, never learned). The content-hash `id` is a hash; the enum CHECKs are deterministic constraints. There is **no LLM exception in this step** — no irreducible generation or judgment is required; an agent doing any of `Validate`/`RedWave`/`Admit` would be a **determinism gap** that blocks the step. Each deterministic op carries a **reproducibility mirror** (the rapid property: same `(invariant, cell)` → same red-wave set; same `(invariant, grantedApproval)` → same decision). If a future federation-stability judgment turns out to need irreducible judgment, that is the **gated LLM exception** — isolated to the smallest surface, schema-checked, and re-checked by a mirror — and recorded as an OpenQuestion, not smuggled into this primitive.

## Documentation (Mintlify — two pages, mandatory)

This step is **not done** until its « Pour moi » pages are live on `aidos.mintlify.app` (repo `steph-frtech/docs`, clone `.aidos-docs/`), prose **français** (`vous`), KRD terms verbatim:
- a **concept** page `steps/concept/s48-global-invariant.mdx` — what a GlobalInvariant is (a truth that spans **plus d'une cellule**, distinct from the per-truth TruthScope of S15), why a cross-cell invariant is *une exception coûteuse, pas le mode normal* (KRD §49.1), and the two laws (la violation rougit **toutes les cellules de sa portée**; un `blast_radius` plus large exige une autorité plus large).
- an **internals** page `steps/internals/s48-global-invariant.mdx` carrying the three layers **Implémentation · Méta · Méta-méta** (the `globalinvariant` package, the `global_invariant` AST table + enum CHECKs, `RedWave`/`Admit`/`Validate`, the reuse of S16/S19/S22, and the deferred federation stability of S23/S47).

Phase 1 (`/grill-with-docs`) writes the concept page + the **Méta**/**Méta-méta** layers; **Implémentation** is completed at green. Update the « Pour les futurs utilisateurs » guide only if this step ships a user-facing capability (the `/global-invariants` panel is one — note the cross-cell invariant concept). Run `mint validate` + `mint broken-links` clean, push to `steph-frtech/docs` `main`, verify via `mcp__mintlify-aidos`.

## Prompt a lancer

```text
You are step-executor for AIDOS step S48 — "GlobalInvariant (cross-cell / federation invariant)". Stack is
FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant to
kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/globalinvariant ONLY. Follow the
CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §49.1 (GlobalInvariant — "les invariants transverses sont rares,
explicites et coûteux"; the AST: scope ∈ {local_cell, contract_pair, federation_policy}, blast_radius ∈
{small, bounded, global}, approval_required ∈ {cell_owner, both_contract_owners, architecture_owner}; the
rule "Un invariant transverse est une exception coûteuse, pas le mode normal"; "les bounded contexts restent
les murs principaux"), §49 (the fan-out example "tout agrégat portant du PII doit implémenter Forgettable"
passing 80 BC au rouge — the cross-cell red wave; §49.2 SagaInvariant/CoherenceTest are OUT OF SCOPE here),
§44.1 (SemanticDiff change_type incl. rescope/reauthorize/reweight), §44.5 (BlockReason: code, severity,
explanation, how_to_fix[] — "tout refus doit être actionnable"). Read CONTEXT-MAP.md + back/kernel/CONTEXT.md
(Layer, source/projection, cells/bounded contexts, the waterline, test-as-goal/means) and the prior steps you
REUSE: S02 (the content-addressed record substrate — reuse its content-hash scheme for the global_invariant
row, do NOT fork it), S04 (the wall — the agent has NO grant on kernel/mirrors/fitness), S15 (TruthScope —
DISTINCT: it scopes a SINGLE truth's reach; the GlobalInvariant scope spans MULTIPLE cells — do not conflate
them), S16 (AuthorityGraph + Decide + the authority tiers — REUSE Decide for the approval resolution, do NOT
fork approver/veto/escalation), S19 (weighted, thresholded propagation along composes — REUSE its red-wave
semantics: a load-bearing cross-cell link crosses to the partner cell, cosmetic does not), S22 (the red wave
/ RedWorkQueue / PostKernelChange hook / aidos impact — the fan-out lands here; S48's RedWave is the pure
function the wave consults, the live drain into RedWorkQueue is a later wiring). NOTE: KRD federation /
stage-5 stability was DEFERRED at S23/S47 — this step introduces the cross-cell invariant PRIMITIVE and
CLAIMS NO full federation stability; record an OpenQuestion for any federation-stability edge that surfaces.
For any Next.js 16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs. Do not start without
grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/kernel/CONTEXT.md: a "GlobalInvariant" is a truth that spans MORE THAN
    ONE cell (bounded context) — distinct from the per-truth "TruthScope" (S15) which scopes one truth's
    reach. Its "scope" ∈ {local_cell, contract_pair, federation_policy} says HOW MANY cells it crosses; its
    "blast_radius" ∈ {small, bounded, global} says how far a violation propagates; its "approval_required" ∈
    {cell_owner, both_contract_owners, architecture_owner} is the authority tier admission demands. A
    "cross-cell red wave" reddens EVERY cell in the invariant's reach on a violation (S19/S22), not just the
    violator. The three enum sets are the FROZEN KRD §49.1 values — do NOT invent a fourth scope, radius, or
    authority tier. Sharpen each term against CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR
    inline. Resolve every branch before coding — especially: (i) what "reddens the relevant cells" means
    exactly for each scope (local_cell = its one cell; contract_pair/federation_policy = every spanned cell,
    via S19 load-bearing/cosmetic); (ii) the precedence rule mapping blast_radius → minimum approval tier
    (global ⇒ architecture_owner; contract_pair ⇒ ≥ both_contract_owners); (iii) that a contract_pair /
    federation_policy invariant naming a SINGLE cell is NOT cross-cell and is rejected. Do NOT claim
    federation stability — that is deferred (S23/S47).

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - GlobalInvariant fixture (cert_language: fixture, authority: above), reflecting kernel.global_invariant
        "pii-forgettable-federation": global_invariant { scope federation_policy, cells [checkout, profile,
        billing], predicate every_pii_aggregate_implements_forgettable, blast_radius global, approval_required
        architecture_owner }. Rows: violation in "billing" -> red_wave reddens [checkout, profile, billing]
        and is NOT limited to billing (THE red-wave done case) ; a contract_pair invariant [order, payment]
        with a violation in "order" -> red_wave reddens [order, payment] ; admit {granted_approval cell_owner}
        -> decision==blocked, block_reason.code==INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS, how_to_fix contains
        escalate_to_architecture_owner (THE approval done case) ; admit {granted_approval architecture_owner}
        -> admitted ; a federation_policy invariant naming a SINGLE cell [billing] -> validate_error non-empty.
      - property invariant (rapid, authority: below): RedWave deterministic AND total; for contract_pair/
        federation_policy the returned set ALWAYS contains every spanned cell (no under-propagation); local_cell
        reddens exactly its one cell; Admit deterministic, total (always admitted|blocked|escalated), and
        MONOTONE in radius (a wider blast_radius is never admitted with a narrower approval tier; global ⇒
        never admitted without architecture_owner); an out-of-enum scope/blast_radius/approval_required ⇒
        Validate errors; a contract_pair/federation_policy naming < 2 distinct cells ⇒ Validate errors.
    Run them; watch them go RED (no globalinvariant package, no global_invariant table, no RedWave/Admit/
    Validate). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new
    cross-cell invariant you would grade yourself) — mirror the human intention only.

(c) TDD red→green→refactor, in back/kernel/globalinvariant ONLY (plus the back/migrations/ AST-table file).
    Outside-in. REUSE the S02 content-hash record substrate for the row shape, the S16 Decide for the approval
    resolution, and the S19 weighted-propagation semantics for the red-wave fan-out — do NOT fork any of them.
    If a real tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the
    SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx are
    fixed). The likely genuine choices: the canonical-JSONB shape of the global_invariant row (reuse S02's
    content-hash scheme); how the three §49.1 enums are CHECK-constrained at the DB (a JSONB-path CHECK vs a
    generated column); and the cellRef representation. Record a short ADR (docs/adr/) ONLY if a genuine choice
    is made (e.g. the blast_radius → approval-tier precedence rule, or the ≥2-cells cross-cell rule). The
    migration is expand-only/append-only; GRANT the agent role SELECT only on kernel.global_invariant (the
    wall, §2/S04). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce RedWave on the
    federation and the contract_pair cases and Admit on the cell_owner (blocked) and architecture_owner
    (admitted) rows, plus the single-cell Validate rejection, state the cause, propose. Check completeness:
    the global_invariant layer has its living mirror and each required test_kind is present (KRD §33); no
    monster (no global_invariant without its fixture, no decision branch without a fixture row, no scope
    without a red-wave row) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/global-invariants/ →
    /global-invariants: the pii-forgettable-federation invariant card (name, scope, spanned cells,
    predicate, blast_radius, approval_required), a red-wave panel showing a billing violation reddening ALL
    THREE cells (not just billing), and a live admission table (the fixture rows with computed decision;
    blocked rows show BlockReason code + how_to_fix, the cell_owner row shown RED as INSUFFICIENT_APPROVAL_
    FOR_BLAST_RADIUS, the architecture_owner row admitted). Themed per ADR 0010 (design tokens, never
    hardcoded zinc/hex) and bilingual per ADR 0011 (next-intl, FR default, strings in messages/{fr,en}.json).
    Read via the SELECT-only role; render the fixture, do NOT re-implement it. Do NOT touch existing routes.
    Add tests/e2e/global-invariants.spec.ts (use the playwright-e2e skill) asserting the invariant card names
    scope federation_policy / blast_radius global / approval_required architecture_owner and lists the three
    cells; the red-wave panel reddens all three cells on a billing violation; the admission table shows
    cell_owner → blocked/INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS and architecture_owner → admitted.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    globalinvariant is a deep, well-named module under back/kernel/; that RedWave/Admit/Validate are pure and
    depend on the S02 record substrate, S16 Decide, and S19 propagation WITHOUT duplicating them; that the
    migration/GRANTs keep the wall intact; that GlobalInvariant scope (cross-cell) is cleanly distinct from
    the S15 TruthScope (per-truth) — no conflation; boundaries match back/kernel/CONTEXT.md. Do not advance
    without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the GlobalInvariant fixture + property (behaviour proof), and the Next route
    (visualization). Do NOT add a hook (the red-wave fan-out is the S22 PostKernelChange hook's concern;
    admission is a pure decision the /goal flow calls — a new hook would need a real failed run + fault
    injection first, §5 hook honesty), an MCP server (no new backend capability; aidos impact and the S16
    authority surface already exist), or a skill (declaring a cross-cell invariant is not yet a distinct
    repeatable gesture). NO SagaInvariant / CoherenceTest (§49.2, later), no codegen (nothing to emit from a
    GlobalInvariant), no claim of federation/stage-5 stability (deferred S23/S47). A new artifact may ADD a
    guardrail, never REMOVE one.

DOCS (Mintlify two-page mandate, the step is NOT done without it): seed in phase (a) and ship the « Pour moi »
pages — steps/concept/s48-global-invariant.mdx (concept: a truth spanning >1 cell, distinct from TruthScope;
the two laws; "une exception coûteuse, pas le mode normal") and steps/internals/s48-global-invariant.mdx
(Implémentation · Méta · Méta-méta). Update the « Pour les futurs utilisateurs » guide for the user-facing
/global-invariants panel + the cross-cell invariant concept. Prose FRANÇAIS (vous), KRD terms verbatim.
mint validate + mint broken-links clean, push to steph-frtech/docs main, verify via mcp__mintlify-aidos.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a scope/blast_radius/approval_required value, the
  blast_radius → approval-tier precedence, a BlockReason code, or the exact global_invariant JSONB shape is
  not pinned by KRD §49.1 / §44.5 / an existing migration / ADR / CONTEXT.md, do NOT guess — record an
  OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a fourth scope, blast_radius,
  or approval tier beyond the §49.1 enums, do NOT invent a "trusted cell" bypass (a global blast_radius is
  ALWAYS blocked below architecture_owner), and do NOT claim federation/stage-5 stability (deferred S23/S47).
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The GlobalInvariant
  fixture is a means-test toward the human red, not a new truth.
- Any change to a prior contract (S02 records, S16 AuthorityGraph/tiers, S19 propagation, S22 red-wave/
  RedWorkQueue, S15 TruthScope, the BlockReason shape) goes through a ChangeSet + SemanticDiff — changing an
  approval tier = `reauthorize`, changing scope/cells = `rescope`, changing the blast_radius class = `reweight`
  (KRD §44.1). Add new files; never silently rewrite a prior artifact, never hand-edit back/gen/**.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the fixture passes — RedWave(pii-forgettable-federation, "billing")
reddens [checkout, profile, billing] (the violation reddens EVERY cell in the federation invariant's reach,
not just billing — THE red-wave done criterion); a contract_pair invariant reddens its pair; Admit with a
cell_owner approval is `blocked` with an INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS BlockReason whose how_to_fix
points at escalating to the architecture_owner (THE approval done criterion: a wider blast_radius demands
wider approval), while Admit with an architecture_owner approval is `admitted`; a single-cell federation_policy
invariant fails Validate; the rapid invariant holds (RedWave total/deterministic and never under-propagates,
Admit total/deterministic and monotone in radius, out-of-enum and <2-cells Validate errors);
/global-invariants renders the invariant card, the red-wave panel reddening all three cells, and the
admission table with the cell_owner row red and a passing Playwright e2e; GRANTs prove SELECT-only on
kernel.global_invariant; the migration is append-only/expand-only; the « Pour moi » Mintlify pages are live
(mint validate + broken-links clean). You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (global_invariant fixture, rapid property), where stored (mirrors schema) and
  materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /global-invariants — what it renders (invariant card, red-wave fan-out panel, admission table),
  e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent); any
  prior-contract change (S02, S16, S19, S22, S15, BlockReason) → ChangeSet + SemanticDiff (note the
  change_type: reauthorize/rescope/reweight), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Docs: the two « Pour moi » pages live (concept + internals), mint validate + broken-links result, push +
  mcp__mintlify-aidos verification.
- Known limits: e.g. no live drain into the S22 RedWorkQueue yet, no admission wiring into the /goal flow,
  no SagaInvariant/CoherenceTest (§49.2), NO federation/stage-5 stability claimed (deferred S23/S47),
  scope/blast_radius/approval tiers supported, BlockReason codes supported.
- Next safe step: the smallest stable next tooth (e.g. the SagaInvariant/CoherenceTest of §49.2, or wiring
  RedWave into the live S22 red-wave fan-out / Admit into the /goal admission gate) and why it is safe to
  chain.
```

## Criteres "done" (computes)

`done` is **computed, never declared** (CLAUDE.md §8): **red set → green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster.** Concretely:
- the GlobalInvariant fixture passes — `RedWave("pii-forgettable-federation", "billing")` reddens **`[checkout, profile, billing]`** (the violation reddens **every** cell in the federation invariant's reach, not just the violator); a `contract_pair` invariant reddens its pair; `Admit(gi, cell_owner)` is `blocked` with an `INSUFFICIENT_APPROVAL_FOR_BLAST_RADIUS` `BlockReason` (`how_to_fix` names escalating to the `architecture_owner`), while `Admit(gi, architecture_owner)` is `admitted`; a single-cell `federation_policy` invariant fails `Validate`;
- the rapid invariant holds (`RedWave` total/deterministic and never under-propagates a cross-cell reach; `Admit` total/deterministic and **monotone in radius**; out-of-enum and `< 2`-cells inputs ⇒ `Validate` errors);
- `/global-invariants` renders the invariant card, the red-wave fan-out panel (all three cells reddened on a `billing` violation), and the admission table (the `cell_owner` row red, the `architecture_owner` row admitted), with a passing Playwright e2e;
- GRANTs prove **SELECT-only** on `kernel.global_invariant`; the migration is **append-only / expand-only**;
- the two « Pour moi » Mintlify pages are live (`mint validate` + `mint broken-links` clean).

You cannot force `done`. The canonical done sentence: **a cross-cell invariant violation reddens every cell in its reach, and a wider `blast_radius` is blocked unless the matching (wider) authority approves.**

## References KRD

- **§49.1** — GlobalInvariant: `scope ∈ {local_cell, contract_pair, federation_policy}`, `blast_radius ∈ {small, bounded, global}`, `approval_required ∈ {cell_owner, both_contract_owners, architecture_owner}`; the rule *un invariant transverse est une exception coûteuse, pas le mode normal*; *les bounded contexts restent les murs principaux*.
- **§49** — the cross-cell fan-out (the PII / `Forgettable` policy passing 80 BC au rouge — the global red wave, weighted along `composes`).
- **§49.2** — SagaInvariant / CoherenceTest (out of scope here; the saga/compensation layer is a later concern).
- **§44.1** — SemanticDiff `change_type` (`rescope`, `reauthorize`, `reweight` for scope/authority/blast_radius changes).
- **§44.5** — BlockReason (`code`, `severity`, `explanation`, `how_to_fix[]` — *tout refus doit être actionnable*).
- **Reuses:** S02 (content-addressed record substrate), S15 (TruthScope — DISTINCT per-truth scope), S16 (AuthorityGraph + `Decide` + authority tiers), S19 (weighted, thresholded propagation along `composes`), S22 (red wave / `RedWorkQueue` / `PostKernelChange` / `aidos impact`).
- **Deferred (not claimed here):** federation / stage-5 stability (S23 phase-stable, S47 adoption/release) — this step introduces the cross-cell invariant **primitive** only.
