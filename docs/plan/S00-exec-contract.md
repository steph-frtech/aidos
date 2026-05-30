# S00 — Step execution contract & granularity rule (machine-readable checklist)

Subsystem: AIDOS Runtime | Home: `docs/` | Workbench route: `/contract`

## Objectif

Fix, once and versioned, the **contract every implementation step obeys** — the per-step loop and the granularity rule — as a single **machine-readable checklist** that later steps and the harness can read, and that the Workbench renders so a human can see what every step must satisfy. This is the self-describing root of the plan: no engine code yet, only the law all subsequent steps are checked against.

## Sortie attendue

Per CLAUDE.md §5, only the artifacts whose answer is "yes" for S00:

- **Versioned contract doc** — `docs/implementation_contract.md`: the canonical text of the per-step loop (§6) + the granularity/minimality rule (§6 "minimal · autonomous · visualizable · non-destructive · chainable"), each loop phase as a checklist item with a stable `id` and `gate` (computational vs human), plus a top-level `version` (semver) and `kind: step-contract`. Markdown with an embedded machine-readable block (a fenced YAML/JSON front block) so it is **one file, two readers** (human + machine).
- **BDD mirror (behaviour proof)** — a Gherkin `.feature` (journey/acceptance, N0, Godog/Playwright slot) asserting: the contract file exists, the embedded block parses, it is semver-versioned, and the Workbench page renders every checklist item. Conceptually a record in the `mirrors` schema (`reflects`, `test_kind`, `cert_language`, `liveness`), materialized to `tests/` to run. Red first.
- **Next route (visualization)** — `front/web/app/contract/page.tsx`: a Server Component that reads `docs/implementation_contract.md`, parses the embedded block, and renders the checklist (version badge + each item with its id + gate kind).
- **Playwright e2e** — `tests/e2e/contract.spec.ts`: navigates `/contract`, asserts the version badge and at least the nine §6 loop items are visible.

> **Deliberately NOT created at S00** (the §5 table answers "no"): no Go package (no pure logic/schema yet — the contract is data, not engine code), no Postgres/Atlas **migration** (the `mirrors` record is conceptual at S00; persistence is wired by a later Archive/Mirror step — recorded here as an **OpenQuestion**, not invented), no **MCP server** (no backend capability invoked yet), no **Go hook** (a hook must have failed a real run before it earns existence — §5 hook-honesty — and there is none here yet). Adding any of these now would violate Simplicity First.

## Test minimal (done)

**Done = computed, not declared** (§8): red set green ∧ prior green intact ∧ no monster. Restated as a failing-first BDD mirror, written **before** the contract file and the route exist (so it is red on first run):

```gherkin
Feature: Step execution contract is versioned and machine-readable
  As the AIDOS harness and a human operator
  I want the per-step loop and granularity rule as one versioned, parseable checklist
  So that every later step can be checked against the same law

  Scenario: The contract is versioned and parses
    Given the file "docs/implementation_contract.md"
    When the embedded contract block is parsed
    Then it has a semver "version" and kind "step-contract"
    And it lists the nine per-step loop phases each with an "id" and a "gate"
    And every checklist item id is unique

  Scenario: The Workbench renders the contract checklist
    Given the Workbench route "/contract"
    When the page loads
    Then the version badge is shown
    And each of the nine loop phases is rendered with its gate kind
```

Done criteria for S00, concretely:
1. `docs/implementation_contract.md` exists, embedded block parses, `version` is semver, `kind: step-contract`.
2. The nine §6 loop phases are present, each with a unique `id` and a `gate` (`computational` | `human`); the five granularity properties are present.
3. The Gherkin mirror runs **red → green** (red before the file/route exist, green after).
4. `/contract` renders the checklist; the Playwright e2e is green.
5. No monster: the mirror is living and linked to this contract (the only truth-ish artifact S00 introduces).

## Visualisation UI

- **Route:** `front/web/app/contract/page.tsx` at `/contract` — a read-only panel: a header with the contract `version` badge, then the ordered checklist (each loop phase = one row: `id`, label, `gate` chip), then the granularity rule block. Source of truth is `docs/implementation_contract.md`; the page **parses and projects** it, never re-encodes it. No write controls.
- **e2e:** `tests/e2e/contract.spec.ts` (uses the existing `playwright.config.ts`, `webServer: npm run dev -w @aidos/web`, baseURL `http://localhost:3000`): navigate to `/contract`, assert version badge visible, assert the nine loop-phase rows visible with their gate chips. Follow the `playwright-e2e` skill for selectors.

## Regle anti-ecrasement

This step **edits only its own declared files** (`docs/implementation_contract.md`, `docs/plan/S00-exec-contract.md`, `front/web/app/contract/page.tsx`, `tests/e2e/contract.spec.ts`) and **adds** new files; it touches **no existing route, no prior contract, no generated file** (§9). Since S00 is the root step there is no prior contract to amend; but should any later need arise to change the loop or granularity wording, it goes through a **ChangeSet** (`DRAFT → APPLIED`, append-only) plus a **SemanticDiff** on the contract block — never an in-place silent rewrite. The contract file is itself version-bumped (semver) on any such change. No truth schema (`kernel`/`mirrors`/`fitness`) is written by the agent (§2, the wall).

## Prompt a lancer

```text
You are step-executor for AIDOS step S00 (Subsystem: AIDOS Runtime; Home: docs/).
Objective: produce docs/implementation_contract.md — the per-step loop (§6) + the
granularity rule, as ONE versioned, machine-readable checklist — and a Workbench
page at /contract that renders it. Stack is FROZEN (back=Go, truth=Postgres
append-only/content-addressed with NO agent write grant to kernel/mirrors/fitness,
front=Next.js). Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not skip a phase.

(a) GRILL-WITH-DOCS FIRST. Run /grill-with-docs on the intention before any code.
    One intention, ≤5 scenarios. Sharpen the ubiquitous language against CONTEXT-MAP.md
    and the relevant CONTEXT.md; reconcile with KRD.md (the Tome wins on concept,
    a green mirror wins over CLAUDE.md). Confirm S00 is docs-only + UI (no engine yet).
    Update CONTEXT.md / an ADR inline if a real term or decision crystallises.

(b) WRITE THE RED BDD MIRROR. Before the contract file or the route exist, write the
    Gherkin journey (N0, Godog/Playwright slot) from "Test minimal (done)" — the file
    is the truth, the parse is machine-checkable, the /contract page renders it.
    Treat the mirror as a record conceptually stored in the mirrors schema
    (reflects=S00 contract, test_kind=journey, cert_language=gherkin, liveness=live)
    and materialize it to tests/ to run. Run it: it MUST be RED. That red IS the /goal.

(c) TDD RED → GREEN → REFACTOR, in docs/ (and the declared front/tests files) ONLY.
    Author docs/implementation_contract.md: the nine §6 loop phases, each a checklist
    item with a unique id + a gate (computational | human), plus the five granularity
    properties (minimal · autonomous · visualizable · non-destructive · chainable),
    plus version (semver) + kind: step-contract, in an embedded parseable block
    (one file, two readers). Go to green. Refactor for clarity only.
    TOOL SEARCH (only if a real choice exists, ≤3 options, pick the SIMPLEST within the
    frozen slot): the parse format of the embedded block (e.g. YAML vs JSON front block)
    and the markdown reader in the Next route. Prefer zero new deps; if a genuine choice
    is made, record an ADR (docs/adr/000N-...). Do NOT search globally for future steps.

(d) KEEP SENSORS GREEN at each diff (PostToolUse). Self-certify on the computational
    gate only. Match repo style: Biome (tabs, double quotes) at root; Go is gofmt
    (n/a here); ESLint owns front/web Next rules.

(e) DIAGNOSE BEFORE FINISHING. Run /diagnose: isolate any failing sensor or flaky
    assertion, propose the fix, confirm the red set is fully green and prior green intact.
    Verify completeness: the contract has its living mirror, no monster, no orphan.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT e2e (a UI is REQUIRED). Create
    front/web/app/contract/page.tsx (read + parse + render docs/implementation_contract.md;
    read-only) and tests/e2e/contract.spec.ts (navigate /contract, assert version badge +
    the nine loop rows with gate chips). Touch NO existing route. Use the playwright-e2e
    skill. e2e green.

(g) IMPROVE-CODEBASE-ARCHITECTURE before declaring the step done. Run
    /improve-codebase-architecture: confirm the contract is the single source the page
    projects (no duplicated encoding), naming matches the ubiquitous language, nothing
    speculative was added.

(h) CREATE SKILLS/HOOKS/MCP/MIGRATIONS per §5 — ONLY where the answer is yes. For S00
    that is: NONE (no repeatable gesture earned yet, no non-bypassable rule with a real
    failed run, no backend capability invoked, no persistence wired — the mirrors-schema
    persistence of this mirror is an OpenQuestion for a later Mirror/Archive step, NOT to
    be invented now). A new artifact may only ADD a guardrail, never remove one.

HONESTY RULES (anti-Goodhart, §8): never invent a target, a targetId, or a business-rule.
If the persistence schema for the mirror, a field name, or any binding is unknown, do NOT
guess — record it as an OpenQuestion (and surface it). You never write a truth-test you
would then satisfy; you write means-tests toward the human red. You never write the
kernel/mirrors/fitness Postgres schemas (the wall). "Done" is COMPUTED: red set green
∧ prior green intact ∧ no monster — you cannot declare done.

DONE CRITERIA: docs/implementation_contract.md exists, semver-versioned, kind:step-contract,
embedded block parses, nine loop phases each with unique id + gate, five granularity
properties present; the Gherkin mirror went red→green; /contract renders the checklist;
contract.spec.ts is green; no monster.

END WITH THE STEP REPORT (exactly these fields):
- BDD added: <feature file path + the mirror record reflects/test_kind/cert_language/liveness>
- Tests run: <command(s) + red→green result, e2e result>
- UI route: </contract — page path + what it renders>
- ChangeSet status: <DRAFT/APPLIED/REVERTED or "none (root step, additive only")>
- Red-set status: <green ∧ prior green intact ∧ no monster — or what blocks>
- Known limits / OpenQuestions: <e.g. mirror persistence to mirrors schema deferred; format ADR>
- Next safe step: <the single chainable next step this leaves stable for>
```
