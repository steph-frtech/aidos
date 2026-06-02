# S51 — Harness economics: HarnessCostBudget (per-cell cap) + ValueCase (a costly truth justifies its value)

Subsystem: AIDOS Runtime | Home: `back/runtime/economics` | Workbench route: `/harness-economics`

## Objectif

Land **harness economics** — the pure, read-only diagnostic that names the *price* of the harness and decides whether a costly truth is **worth it** (KRD §66.3 « l'économie du harnais » : « plus une contrainte coûte cher à maintenir, plus elle doit justifier sa valeur »). Each cell **declares** a `HarnessCostBudget` (`max_ci_minutes`, `max_llm_tokens_per_goal`, `max_mutation_runtime`, `max_human_review_minutes`, `expected_risk_reduction`); a costly truth carries a `ValueCase` (`truth`, `risk_if_broken`, `expected_impact`, `harness_cost`, `decision ∈ {justified, too_expensive, revisit}`) that ties its real harness cost to its risk/impact. The done invariant: **a truth whose measured harness cost exceeds its declared budget without a `justified` ValueCase is flagged** — an actionable `BlockReason`/advisory — while the **budget caps are surfaced** (read, never authored by the agent). Budgets and thresholds are **declared, never learned** (CLAUDE.md §8): the budget lives above the line, the agent is SELECT-only against it and may never tune the bar it is measured against.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (an Atlas migration for the value-case / economics-snapshot rows), a **behaviour proof** (the BDD mirror), and a **visualization** (a Next route) — and nothing more. It does **not** warrant a new hook, MCP server, or Skill (justified below).

- **Go package** `back/runtime/economics/` — the harness-economics diagnostic. Two declared AST types per KRD §66.3 and a pure evaluator:
  - the **`HarnessCostBudget`** type (`max_ci_minutes`, `max_llm_tokens_per_goal`, `max_mutation_runtime` (a duration), `max_human_review_minutes`, `expected_risk_reduction`) — a **declared, above-the-line** cap per cell. It is *read* here (SELECT-only), never authored by the agent — it is the bar the cell is measured against (§8 anti-Goodhart: « weights/thresholds are declared, never learned »).
  - the **`ValueCase`** type (`truth` (a truth ref), `risk_if_broken ∈ {low, medium, high, critical}`, `expected_impact` (free text), `harness_cost` = a `MeasuredCost{ci_minutes, llm_tokens, mutation_runtime, human_review_minutes}`, `decision ∈ {justified, too_expensive, revisit}`) — the record that, for a **costly** truth, justifies (or does not) the harness spend against its risk/impact.
  - a pure **`Validate(budget) / Validate(valueCase) → error`** (shape: non-negative caps; `risk_if_broken` in the declared enum; `decision` in the declared enum; `truth` is a well-formed ref; the `harness_cost` fields are non-negative) and a pure, total, deterministic **`Evaluate(budget, cost, valueCase) → EconomicsDecision`** that compares the **measured** `MeasuredCost` of a cell/truth against its declared `HarnessCostBudget` and returns `within_budget | over_budget_justified | over_budget_flagged` **plus** a `BlockReason` (reuse **S13**'s shape — `code`, `severity`, `explanation`, `how_to_fix[]`) when **flagged**. The done case: a truth whose measured cost **exceeds** its budget on any axis (e.g. `ci_minutes > max_ci_minutes`) **and** has **no `justified` ValueCase** ⇒ `over_budget_flagged` with `code: HARNESS_COST_EXCEEDS_BUDGET` and `how_to_fix: [open_value_case, reduce_harness_cost, raise_budget_via_goal]`; the **same** over-budget truth carrying a `ValueCase{decision: justified}` ⇒ `over_budget_justified` (the costly truth has earned its keep — the §66.3 rule). `Evaluate` is pure over `(budget, cost, valueCase)` — no DB calls, no I/O, no `time.Now()` (the clock, when needed for a snapshot, is passed in so the report is deterministic and replayable). It **detects and advises**; it never mutates, deletes, or writes truth, and it never raises a budget — raising the cap is a `/goal` against the declared fitness/budget, never an edit here.
  - the **measured cost is consumed, not produced**: `ci_minutes` and `human_review_minutes` come from telemetry/changeset records, `mutation_runtime` from the **S40** mutation run, `llm_tokens` from the goal's recorded spend. This package reuses the **S41** `KernelDebt` snapshot/ranking shape (do **not** fork it) — an over-budget flag is *economic debt*, the same advisory family as stale fixtures / orphan mirrors / surviving mutants — and reuses the **S39** posture that the bar (the budget) lives in the read-only `fitness` zone.
- **Atlas migration** (`back/migrations/`) — one declarative, **expand-only / append-only** migration. The **`HarnessCostBudget` is declared in the read-only `fitness` zone** (`fitness.harness_cost_budget`: `cell_ref text`, the five caps as columns, content-addressed `id`, append-only) — the agent gets **SELECT only** (the wall, §2; the budget is the bar, agent never writes it). The **`ValueCase` + economics snapshot** live below the waterline as a Runtime diagnostic (`runtime.harness_economics_snapshot` or `runtime.value_case`): `id text PRIMARY KEY` = hash of the canonical body (reuse **S01/S02** `Canonicalize`/`Hash` — do **not** fork it), `body jsonb NOT NULL` holding the `ValueCase` + the per-truth `EconomicsDecision`, `risk_if_broken text NOT NULL CHECK (risk_if_broken IN ('low','medium','high','critical'))`, `decision text NOT NULL CHECK (decision IN ('justified','too_expensive','revisit'))`, `verdict text NOT NULL CHECK (verdict IN ('within_budget','over_budget_justified','over_budget_flagged'))`, `kernel_head text NOT NULL` (the truth head the eval was taken against, version-pinned so a recorded snapshot stays inspectable after heads move), `mutation_run_ref text NULL` (the consumed S40 run), `block_reason jsonb` (the `BlockReason` when flagged, else null), `scanned_at timestamptz NOT NULL`. A snapshot is **append-only** — a new evaluation is a new row, never an UPDATE; nothing about the kernel or the declared budget is altered. GRANTs: the agent DB role gets **SELECT only** on `fitness.harness_cost_budget` (read the bar, never write it) and **SELECT** on the Runtime snapshot; only the `aidos` CLI writer role records a snapshot/value-case row, via an approved ChangeSet (S20). The migration never alters or drops a prior table, GRANT, or the read-only posture of `fitness`.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **harness-economics fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `{budget, cost, valueCase} → within_budget | over_budget_justified | over_budget_flagged`, reflecting `fitness.harness_cost_budget` + `runtime.value_case`. Plus a **property invariant** (rapid, `authority: below`) on `Evaluate`. These ARE the done criteria (see below).
- **Next route** `front/web/app/harness-economics/` → `/harness-economics` — the Workbench panel rendering, per cell, the **declared budget caps** (the five `HarnessCostBudget` axes, surfaced), the **measured cost** beside each cap, and the per-truth **`EconomicsDecision`** with the over-budget-flagged case shown red and its `BlockReason` (`code` + `how_to_fix`); the justified case shown as kept; the `ValueCase` card (truth, risk, impact, decision) for costly truths (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new hook** — harness economics is an *advisory diagnostic the Workbench and `/goal` flow read*, not a non-bypassable wall rule; the **S04** wall already guards `kernel`/`mirrors`/`fitness` at the schema level and the **S40** mutation gate + the completeness Stop already own the non-gameable stop predicate (a new hook would be dead unless it had failed a real run first, §5 hook honesty). Whether the over-budget flag should *contribute a conjunct* to the Stop predicate is an **OpenQuestion** for a later step, not a guess here. **No new MCP server** — no new backend capability: the budget read reuses the existing `store`/`fitness` SELECT path, the measured cost is consumed from existing telemetry/changeset/S40-mutation records, and recording a snapshot/value-case is done through the existing `changeset` MCP + `aidos` writer role (S20); `Evaluate` is pure logic called in-process. Record an OpenQuestion if a distinct economics-reader capability emerges. **No Skill** — evaluating a budget is not yet a repeatable multi-step gesture distinct from the generic diagnostic loop; if `aidos cost` becomes a replayable gesture it is a later step. **No budget authoring / no fitness write** — the cell *declares* its `HarnessCostBudget` above the line via `/goal`, this step **reads** it (the agent never sets the cap it is measured against, §8). **No cost measurement engine** — `ci_minutes`/`human_review_minutes`/`mutation_runtime`/`llm_tokens` are **consumed** from telemetry / changesets / the S40 mutation run / the goal's recorded spend, never produced here. **No codegen** — a `ValueCase`/budget is a diagnostic record, not a frozen source; nothing to emit (no Go structs / DDL / TS types).

## Test minimal (done)

**Done = a truth whose harness cost exceeds its budget without a justified ValueCase is flagged.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Harness-economics fixture** (`cert_language: fixture`, `authority: above`) — reflects `fitness.harness_cost_budget` + `runtime.value_case`, as `{budget, cost, valueCase} → verdict` (KRD §66.3):

  ```
  # mirrors schema · reflects: fitness.harness_cost_budget "checkout-cell" + runtime.value_case · test_kind: fixture · authority: above
  mirror reflects "checkout-harness-economics" {
    budget {                         # DECLARED above the line — read here, never authored
      cell_ref:                "checkout"
      max_ci_minutes:          10
      max_llm_tokens_per_goal: 50000
      max_mutation_runtime:    "5m"
      max_human_review_minutes: 30
      expected_risk_reduction: "high"
    }

    # within budget on every axis, no ValueCase needed
    given cost { ci_minutes: 8, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 }, value_case { none }
      -> verdict == "within_budget"
      -> block_reason == null

    # THE done case — cost exceeds the budget (ci_minutes 18 > 10) and there is NO justified ValueCase
    given cost { ci_minutes: 18, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 }, value_case { none }
      -> verdict == "over_budget_flagged"
      -> block_reason.code == "HARNESS_COST_EXCEEDS_BUDGET"
      -> block_reason.how_to_fix contains "open_value_case"

    # the SAME over-budget cost, but the costly truth carries a justified ValueCase ⇒ it has earned its keep
    given cost { ci_minutes: 18, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 },
          value_case {
            truth: "checkout.payment.idempotent",
            risk_if_broken: high,
            expected_impact: "avoid duplicate capture",
            harness_cost: { ci_minutes: 18, human_review_minutes: 15 },
            decision: justified
          }
      -> verdict == "over_budget_justified"
      -> block_reason == null

    # over budget AND the ValueCase says too_expensive ⇒ still flagged (the spend is not justified)
    given cost { ci_minutes: 18, llm_tokens: 40000, mutation_runtime: "3m", human_review_minutes: 15 },
          value_case { truth: "checkout.payment.idempotent", risk_if_broken: low, decision: too_expensive }
      -> verdict == "over_budget_flagged"
      -> block_reason.code == "HARNESS_COST_EXCEEDS_BUDGET"
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for **any** generated `HarnessCostBudget`, `MeasuredCost`, and (optional) `ValueCase`, `Evaluate` is **deterministic** and **total** (always one of `within_budget | over_budget_justified | over_budget_flagged`); a cost within every cap ⇒ `within_budget` regardless of the ValueCase; a cost exceeding **any** cap with **no** `decision == justified` ValueCase ⇒ **never** `within_budget` and **always** `over_budget_flagged` with a `HARNESS_COST_EXCEEDS_BUDGET` `BlockReason` (the §66.3 rule — a costly constraint that does not justify its value is flagged); the **same** over-budget cost with a `decision == justified` ValueCase ⇒ `over_budget_justified` (and `decision ∈ {too_expensive, revisit}` does **not** clear the flag); `Evaluate` writes **no** truth, raises **no** budget, and never reads `time.Now()` internally; `Validate` returns a non-empty error for a negative cap, an out-of-enum `risk_if_broken`/`decision`, or a malformed `truth` ref; a recorded snapshot's `id` equals the content hash of its canonical body (content-addressing, S01/S02).

All start **red** (no `economics` package, no `harness_cost_budget`/`value_case` tables, no `Evaluate`/`Validate`). That red **is** the `/goal`. The canonical done case is green only when `Evaluate(budget, overBudgetCost, ∅)` returns `over_budget_flagged` with a `HARNESS_COST_EXCEEDS_BUDGET` `BlockReason` whose `how_to_fix` points at opening a ValueCase — while the **same** over-budget cost carrying a `ValueCase{decision: justified}` returns `over_budget_justified` — i.e. **a truth whose harness cost exceeds its budget without a justified ValueCase is flagged, and the budget caps are surfaced.**

## Visualisation UI

- **Workbench route:** `front/web/app/harness-economics/page.tsx` (new route `/harness-economics`; do **not** touch existing routes). It renders, per cell (the canonical `checkout-cell`), a **budget card** surfacing the five declared `HarnessCostBudget` axes (`max_ci_minutes`, `max_llm_tokens_per_goal`, `max_mutation_runtime`, `max_human_review_minutes`, `expected_risk_reduction`) — the caps are **surfaced**, this is a done obligation — each shown beside its **measured cost** (within = neutral, over = red), and an **economics table** (the fixture rows with their computed `verdict` and, when flagged, the `BlockReason` `code` + `how_to_fix`). For costly truths it shows the **`ValueCase`** card (`truth`, `risk_if_broken`, `expected_impact`, `harness_cost`, `decision`), marking the `justified` case as *kept / earned its keep* and the `too_expensive`/`revisit` cases as still flagged. With the canonical example the no-value-case over-budget row shows `over_budget_flagged` in red with `HARNESS_COST_EXCEEDS_BUDGET`, the justified row shows `over_budget_justified` (kept), and the within-budget row shows `within_budget`. Reads via the SELECT-only role; renders the fixture, **does not re-implement** the evaluator. There is **no budget-edit affordance** (the cap is declared above the line; raising it is a `/goal`, never a screen edit) and **no delete affordance** (advisory only — every action routes through `idea → mirror → /goal`). Themed per **ADR 0010** (design tokens — zinc + blue-600, Geist, radius `0.5rem`; never hardcoded `zinc-*`/hex) and bilingual per **ADR 0011** (`next-intl`, strings in `front/web/messages/{fr,en}.json`, **français par défaut**).
- **Playwright e2e:** `tests/e2e/harness-economics.spec.ts` — navigate to `/harness-economics`, assert the budget card surfaces the five caps (e.g. `max_ci_minutes: 10`); assert the economics table shows the no-value-case over-budget row as `over_budget_flagged` with `HARNESS_COST_EXCEEDS_BUDGET` and a `how_to_fix` naming `open_value_case`, the justified row as `over_budget_justified` (kept), and the within-budget row as `within_budget`; assert the `ValueCase` card names `truth: checkout.payment.idempotent`, `risk_if_broken: high`, `decision: justified`; assert there is **no** budget-edit and **no** delete affordance. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/economics/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored harness-economics fixture/property materialized to `tests/`, `tests/e2e/harness-economics.spec.ts`, and `front/web/app/harness-economics/**` — and otherwise **adds new files**. It introduces a new contract (the `HarnessCostBudget` + `ValueCase` AST shapes, the `risk_if_broken`/`decision`/`verdict` enums, the `Evaluate`/`Validate` semantics, and the `HARNESS_COST_EXCEEDS_BUDGET` `BlockReason` code) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table, GRANT, or the read-only posture of `fitness`; a snapshot/value-case row is **kept** (append-only), never deleted. Any change to a **prior contract** it depends on — the S01/S02 content-store substrate + `Canonicalize`/`Hash`, the S13 `BlockReason` shape (KRD §44.5), the S39 read-only `fitness` posture, the S40 mutation-run shape, the S41 `KernelDebt`/`DebtItem` ranking shape, or the wall GRANT set (§2/S04) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema (S21), never an in-place edit. Raising a declared budget cap is **not** an edit — it is a `reweight`/`refine` SemanticDiff change_type (KRD §44.1) against the above-the-line fitness/budget, driven by the `/goal` flow, never a direct write from this step or the screen. An override is a recorded decision (ChangeSet + ADR + provenance, §8).

## Prompt a lancer

```text
You are step-executor for AIDOS step S51 — "Harness economics: HarnessCostBudget (per-cell cap) + ValueCase
(a costly truth justifies its value)". Stack is FROZEN: back=Go, truth=Postgres (append-only,
content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench).
Home = back/runtime/economics ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §66.3 ("L'économie du harnais" — "KRD peut devenir trop lourd. Chaque
cellule doit déclarer son budget de harnais"; the HarnessCostBudget: max_ci_minutes, max_llm_tokens_per_goal,
max_mutation_runtime, max_human_review_minutes, expected_risk_reduction; the ValueCase for costly truths:
truth, risk_if_broken, expected_impact, harness_cost (ci_minutes, human_review), decision ∈
{justified, too_expensive, revisit}; the RULE "Plus une contrainte coûte cher à maintenir, plus elle doit
justifier sa valeur"), §66.2 (fitness "diagnostic, jamais fitness de promotion" — the bar is declared,
never tuned by the loop), §44.5 (BlockReason: code, severity, explanation, how_to_fix[] — "tout refus doit
être actionnable"), §44.1 (SemanticDiff change_type incl. reweight/refine). Read CONTEXT-MAP.md +
back/runtime/CONTEXT.md (Runtime as the harness; cost/économie du harnais; fitness read-only, declared)
and the prior steps you REUSE: S01/S02 (the content-addressed append-only content store + Canonicalize/Hash
for the snapshot/value-case row — reuse, do NOT fork), S13 (the BlockReason shape), S39 (the read-only
fitness posture — the budget is the BAR, agent SELECT-only, never authored), S40 (the mutation run —
mutation_runtime/score is CONSUMED, never produced here; the threshold/budget is declared above the line),
S41 (KernelDebt + /trim — the over-budget flag is the SAME advisory diagnostic family as stale fixtures /
orphan mirrors / surviving mutants; reuse the DebtItem/snapshot ranking shape, do NOT fork it; it DETECTS
and ADVISES, deletes nothing). For any Next.js 16, Atlas, Go, or rapid API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/runtime/CONTEXT.md: a "HarnessCostBudget" is a DECLARED, per-cell cap
    (max_ci_minutes, max_llm_tokens_per_goal, max_mutation_runtime, max_human_review_minutes,
    expected_risk_reduction) living ABOVE the line in the read-only fitness zone — the agent READS it and is
    SELECT-only, it NEVER authors the bar it is measured against (§8: weights/thresholds declared, never
    learned); a "ValueCase" ties a COSTLY truth (truth, risk_if_broken, expected_impact, harness_cost) to a
    decision ∈ {justified, too_expensive, revisit}; the RULE (§66.3) is "the more a constraint costs to
    maintain, the more it must justify its value". An "EconomicsDecision" is one of within_budget |
    over_budget_justified | over_budget_flagged. A "BlockReason" is the actionable advisory (code +
    how_to_fix). The measured cost is CONSUMED from telemetry / changesets / the S40 mutation run / the
    goal's recorded spend — NEVER produced here. Sharpen each term against CONTEXT.md; if a term shifts,
    update CONTEXT.md / write an ADR inline. Resolve every branch before coding — especially: over-budget on
    ANY axis with no justified ValueCase ⇒ flagged; the SAME over-budget cost with a justified ValueCase ⇒
    over_budget_justified (it earned its keep); a too_expensive/revisit decision does NOT clear the flag;
    this step DOES NOT author the budget, DOES NOT write fitness, DOES NOT raise a cap (raising a cap is a
    /goal against the declared fitness, never an edit).

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - harness-economics fixture (cert_language: fixture, authority: above), reflecting
        fitness.harness_cost_budget "checkout-cell" + runtime.value_case. Budget { cell_ref checkout,
        max_ci_minutes 10, max_llm_tokens_per_goal 50000, max_mutation_runtime 5m,
        max_human_review_minutes 30, expected_risk_reduction high }. Rows: cost within every cap + no
        value_case -> within_budget, block_reason==null ; cost ci_minutes 18 (> 10) + NO value_case ->
        over_budget_flagged, block_reason.code==HARNESS_COST_EXCEEDS_BUDGET, how_to_fix contains
        open_value_case (THE done case) ; the SAME over-budget cost + value_case
        { truth checkout.payment.idempotent, risk_if_broken high, expected_impact "avoid duplicate capture",
        decision justified } -> over_budget_justified, block_reason==null ; over-budget +
        value_case { decision too_expensive } -> over_budget_flagged.
      - property invariant (rapid, authority: below): Evaluate is deterministic AND total (always one of
        within_budget|over_budget_justified|over_budget_flagged); within every cap ⇒ within_budget
        regardless of the ValueCase; over ANY cap with no justified ValueCase ⇒ never within_budget and
        always over_budget_flagged with HARNESS_COST_EXCEEDS_BUDGET (the §66.3 rule); the same over-budget
        cost with decision==justified ⇒ over_budget_justified (too_expensive/revisit does NOT clear the
        flag); Evaluate writes no truth, raises no budget, never reads time.Now() internally; Validate
        errors on a negative cap / out-of-enum risk_if_broken|decision / malformed truth ref; a snapshot
        id == content hash of its canonical body (S01/S02).
    Run them; watch them go RED (no economics package, no harness_cost_budget/value_case tables, no
    Evaluate/Validate). That red IS the /goal. Do NOT write a truth-test you would then satisfy (no
    inventing a new economics invariant you'd grade yourself) — mirror the human intention only.

(c) TDD red→green→refactor, in back/runtime/economics ONLY (plus the back/migrations/ table file). Outside-in.
    REUSE the S01/S02 content-hash content-store substrate + Canonicalize/Hash for the snapshot/value-case
    row shape — do NOT fork it. CONSUME the measured cost from telemetry / changesets / the S40 mutation run
    / the goal's recorded spend; do NOT build a cost-measurement engine. REUSE the S41 KernelDebt/DebtItem
    snapshot ranking shape (the over-budget flag is the same advisory family) — do NOT fork it. If a real
    tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST,
    never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx are fixed).
    The likely genuine choices: the canonical-JSONB shape of the value_case/snapshot body (reuse S01/S02's
    content-hash scheme) and the over-budget comparison rule (per-axis OR — over on ANY cap is over; pin it
    in the ADR, do NOT silently pick). Record a short ADR (docs/adr/) ONLY if a genuine choice is made (e.g.
    the per-axis over-budget rule, or the verdict enum). The migration is expand-only/append-only; the
    HarnessCostBudget is DECLARED in the read-only fitness zone (fitness.harness_cost_budget) with the agent
    role SELECT-only on it (the wall, §2/S04 — never write the bar); the ValueCase/economics snapshot is a
    Runtime diagnostic below the waterline (runtime.value_case / runtime.harness_economics_snapshot),
    append-only, recorded only by the aidos CLI writer role via an approved ChangeSet (S20). NO write GRANT
    on kernel/mirrors/fitness for the agent. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Evaluate on the four
    fixture rows (within-budget, over-budget-no-case, over-budget-justified, over-budget-too_expensive),
    state the cause, propose. Check completeness: the economics layer has its living mirror and each required
    test_kind is present (KRD §33); no monster (no HarnessCostBudget/ValueCase without its fixture; no
    verdict branch without a fixture row) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED), themed (ADR 0010) + bilingual (ADR 0011,
    français par défaut). Create front/web/app/harness-economics/ → /harness-economics: a budget card
    SURFACING the five declared caps (max_ci_minutes etc.) each beside its measured cost (over = red); an
    economics table (the four fixture rows with computed verdict; flagged rows show BlockReason code +
    how_to_fix, the over-budget-no-case row shown RED); a ValueCase card for the costly truth (truth, risk,
    impact, decision) marking justified as "kept / earned its keep". NO budget-edit affordance (the cap is
    declared above the line; raising it is a /goal) and NO delete affordance (advisory only — every action
    routes through idea → mirror → /goal). Read via the SELECT-only role; render the fixture, do NOT
    re-implement the evaluator. Use the design tokens (never hardcoded zinc-*/hex), shadcn components, strings
    in front/web/messages/{fr,en}.json. Do NOT touch existing routes. Add
    tests/e2e/harness-economics.spec.ts (use the playwright-e2e skill) asserting the budget card surfaces the
    caps, the table shows over_budget_flagged/HARNESS_COST_EXCEEDS_BUDGET (how_to_fix names open_value_case),
    over_budget_justified, and within_budget, the ValueCase card names checkout.payment.idempotent / high /
    justified, and that there is NO budget-edit and NO delete affordance.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    economics is a deep, well-named module under back/runtime/; that Evaluate/Validate are pure (no I/O, no
    time.Now()) and depend on the S01/S02 content substrate and the S41 debt shape without duplicating them;
    that the measured cost is CONSUMED (S40 + telemetry/changesets), not re-measured; that the migration/
    GRANTs keep the wall intact (fitness.harness_cost_budget SELECT-only, no write on kernel/mirrors/fitness;
    runtime snapshot below the waterline); boundaries match back/runtime/CONTEXT.md (the budget is the
    declared bar; the agent measures against it, never tunes it). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the harness-economics fixture + property (behaviour proof), and the Next route
    (visualization). Do NOT add a hook (advisory diagnostic, not a non-bypassable wall rule; the S04 wall and
    the S40/completeness Stop already own the gates — whether the over-budget flag should contribute a Stop
    conjunct is an OpenQuestion for a later step, NOT a guess here), no MCP server (the budget read reuses
    the store/fitness SELECT path, the cost is consumed from existing telemetry/changeset/S40 records, and
    recording a snapshot uses the existing changeset MCP + aidos writer role — OpenQuestion if a distinct
    economics-reader capability emerges), no Skill (no new replayable gesture; if `aidos cost` becomes one it
    is a later step), no fitness write / no budget authoring (the cell declares the budget above the line via
    /goal; this step READS it), no cost-measurement engine (consumed), and no codegen (a ValueCase/budget is
    a diagnostic record, nothing to emit). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a budget axis name, a ValueCase field, the
  risk_if_broken / decision / verdict enum, a BlockReason code, the per-axis over-budget rule, or the exact
  value_case/budget JSONB shape is not pinned by KRD §66.3 / §44.5 / an existing migration / ADR / CONTEXT.md,
  do NOT guess — record an OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a
  decision value beyond {justified, too_expensive, revisit}, do NOT invent a "trusted-cell" bypass (over
  budget without a justified ValueCase is ALWAYS flagged), do NOT author or raise a budget cap (it is declared
  above the line; the agent is SELECT-only on fitness), and do NOT build a cost meter (the cost is consumed).
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The
  harness-economics fixture is a means-test toward the human red, not a new truth; the budget is the human's
  declared bar (§8 anti-Goodhart), never one you tune to pass the gate.
- DETERMINISM-FIRST (§6/§8): Evaluate, Validate, the per-axis comparison, the content-hash and the verdict
  are PURE FUNCTIONS — they MUST be code, never an agent/LLM (a comparison is arithmetic, a hash is a hash).
  There is NO gated LLM exception in this step: nothing here is irreducible generation/judgment. An agent
  doing what a pure comparator could is a determinism gap that blocks the step. Every deterministic-able op
  carries a reproducibility property (same {budget, cost, valueCase} → same verdict).
- Any change to a prior contract (S01/S02 content store + Canonicalize/Hash, the S13 BlockReason shape, the
  S39 read-only fitness posture, the S40 mutation-run shape, the S41 KernelDebt/DebtItem shape, the wall
  GRANTs §2/S04) goes through a ChangeSet + SemanticDiff (S20/S21). Raising a declared budget cap is a
  reweight/refine change_type via /goal, never an in-place edit. Add new files; never silently rewrite a
  prior artifact, never hand-edit back/gen/**. A snapshot/value-case row is kept (append-only), never deleted.
- Surface assumptions; present multiple readings rather than silently picking one.

DETERMINISM-FIRST NOTE: everything in this step is deterministic pure logic — the per-axis budget comparison,
the verdict selection, the BlockReason construction, the Validate shape-checks, the content-hash. ALL of it
MUST be code, authoritative, with a reproducibility property (same input → same verdict). The LLM has NO role
in the evaluator; it is used only (if at all) for the free-text `expected_impact` a human writes in a
ValueCase — which is data, never a judgment the evaluator depends on.

MINTLIFY TWO-PAGE DOC MANDATE (CLAUDE.md §6, every step, no exception): ship this step's « Pour moi » pages on
aidos.mintlify.app (repo steph-frtech/docs, clone .aidos-docs/): a CONCEPT page (steps/concept/s51-harness-
economics.mdx) and an INTERNALS page (steps/internals/s51-harness-economics.mdx) carrying the three layers
Implémentation · Méta · Méta-méta. Phase 1 (/grill-with-docs) writes the concept page + the Méta/Méta-méta
layers; Implémentation is completed at green. Update the « Pour les futurs utilisateurs » guide
(guide/*, concepts/*) since harness economics is a user-facing concept (a budget the user declares per cell,
a ValueCase that justifies a costly truth). Prose en FRANÇAIS (vous), KRD terms verbatim (HarnessCostBudget,
ValueCase, justified/too_expensive/revisit). The step is NOT done until the « Pour moi » pages are live:
`mint validate` + `mint broken-links` clean, pushed to steph-frtech/docs main, verified via
mcp__mintlify-aidos.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the harness-economics fixture passes — a cost within every cap with no
ValueCase is within_budget; a cost exceeding any cap with NO justified ValueCase is over_budget_flagged with a
HARNESS_COST_EXCEEDS_BUDGET BlockReason whose how_to_fix points at opening a ValueCase (THE done criterion: a
truth whose harness cost exceeds its budget without a justified ValueCase is flagged); the SAME over-budget
cost carrying a ValueCase{decision: justified} is over_budget_justified; a too_expensive/revisit decision does
NOT clear the flag; the rapid invariant holds (Evaluate total + deterministic, over-any-cap-without-justified
⇒ never within_budget, no truth write, no budget raise, no time.Now(), Validate errors on bad shapes, id ==
content hash); /harness-economics SURFACES the five declared caps beside their measured cost, renders the four
economics rows with the flagged row red, the ValueCase card, no budget-edit and no delete affordance, and a
passing Playwright e2e; GRANTs prove SELECT-only on fitness.harness_cost_budget and no agent write on
kernel/mirrors/fitness; the migration is append-only/expand-only; the Mintlify « Pour moi » pages are live.
You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (harness-economics fixture, rapid property), where stored (mirrors schema) and
  materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /harness-economics — what it renders (budget caps surfaced + measured cost, the four economics
  rows with the flagged row red, the ValueCase card, no budget-edit/no delete affordance), e2e file + result.
- ChangeSet status: any prior-contract change (S01/S02 content store + Canonicalize/Hash, S13 BlockReason,
  S39 read-only fitness, S40 mutation-run, S41 KernelDebt/DebtItem, wall GRANTs) → ChangeSet + SemanticDiff
  (note the change_type; raising a budget cap = reweight/refine via /goal), else "none". Truth/fitness writes
  go through the aidos CLI role, never the agent.
- Red-set status: which scenarios went red then green; any still red.
- Docs: the two « Pour moi » pages (concept + internals) + any « Pour les futurs utilisateurs » guide update;
  mint validate / broken-links result; pushed + verified.
- Known limits: e.g. measured cost is CONSUMED (no cost meter built), no Stop conjunct wired (OpenQuestion),
  no MCP/hook/Skill, the per-axis over-budget rule chosen, decision/verdict/risk enums supported, BlockReason
  codes supported.
- Next safe step: the smallest stable next tooth (e.g. wiring the over-budget flag as a Stop conjunct, or an
  `aidos cost` gesture/MCP that compiles the economics snapshot per cell) and why it is safe to chain.
```
