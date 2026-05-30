# S45 — aidos compiler integration: every KRD law has 1 red + 1 green across check/impact/stable/diff/explain

Subsystem: AIDOS Runtime | Home: `back/cmd/aidos` | Workbench route: `/check`

## Objectif

Make the keystone rule of KRD §82.1 mechanical — **"aucun concept KRD n'existe s'il n'est pas vérifiable par `aidos check`"** — by landing a **law-coverage harness** over the `aidos` compiler so that **every KRD law named in §82.1 + the completeness law (§29) has exactly one red fixture (a truth-graph that violates the law → `aidos check` reports the breach) and one green fixture (a graph that satisfies it → `check` passes)**, and the five compiler verbs `check / impact / stable / diff / explain` together cover them all. No new law is invented here; this step **wires the existing `aidos` subcommands to the already-pinned detectors** and proves coverage, end-to-end, on the demo project.

## Sortie attendue

Per CLAUDE.md §5 (decision table) this step is **pure logic / wiring + a behaviour proof + a visualization** — it adds **no** new truth, **no** new detector, **no** new persistence beyond a read-only coverage view. Create only:

- **Go package** `back/cmd/aidos/` (and a thin `back/cmd/aidos/lawcoverage/` sub-package for the table, if it deepens the design): the **law-coverage integration** that (1) declares the canonical **law registry** — one entry per KRD §82.1 law + the §29 completeness law, each `{law_id, krd_ref, owning_verb ∈ {check,impact,stable,diff,explain}, detector_ref}` — and (2) wires each `aidos` verb to **call the existing detector that already owns that law** (from the prior steps: S14 truth-typing, S06/S12 completeness/monster, S15 scope, S16 authority, S30 memory-firewall, S23 stable-phase, S19 composes-weight, S40 mutation-score, S08 invariant-scope, S32 ContextGraphDecision, S21 SemanticDiff, S22 red-wave, S13 BlockReason). The package **reuses** those detectors; it never re-implements a law. `aidos check` returns a deterministic, ordered list of breaches (each a S13-shaped `BlockReason`: `code`, `severity`, `explanation`, `how_to_fix[]`) or `green`; `impact/stable/diff/explain` are the verb-specific views over the same truth graph. No I/O beyond reading the truth-store (SELECT-only) and the materialized demo project; no clock, no RNG inside the verbs (determinism).
- **BDD mirror** (§5 "behaviour proof") — the **law-coverage matrix**: for **each** registered law, a **fixture** (`state → command → events`: a truth-graph fragment + `aidos <verb>` → the expected breach / pass) giving the **red** case and the **green** case, plus a **`rapid` property** asserting the matrix is total (every registered law has both a red and a green fixture, and every fixture maps to a registered law — no monster). Conceptually stored in the `mirrors` schema, materialized to `tests/`. These ARE the done criteria (below).
- **Next route** (§5 "visualization") `front/web/app/check/page.tsx` → `/check`: the Workbench panel rendering the law-coverage matrix (one row per law: `law_id`, `krd_ref`, owning verb, red ✓/✗, green ✓/✗) and the live `aidos check` verdict on the demo project. Read-only projection.
- **Playwright e2e** (§5 visualization proof) `tests/e2e/check.spec.ts` covering `/check`.

NOT in scope (the §5 answer is **no** this step — creating any would be a monster or out-of-slot):
- **No new detector / no new law.** The laws are graven in KRD §82.1 + §29; this step **wires and proves coverage**, it never authors a law or a fitness rule (that is above the line, human + reality own it — the wall, §2). If a §82.1 law has **no** existing detector from a prior step, that is an **OpenQuestion** (provenance), not an invented detector.
- **No MCP server.** `aidos check` is a CLI subcommand of the S03 `aidos` binary calling existing detectors; exposing law-coverage-as-a-callable-tool is a later `evolve` MCP if it ever emerges — record as OpenQuestion.
- **No Go hook.** The wall (S04 `PreToolUse`), the sensors (S07 `PostToolUse`), the completeness/stop gate (S12/`Stop`), and the SessionStart self-test (S39) already exist and are only **referenced** — this step proves the compiler *surfaces* the laws, it does not add a new non-bypassable rule.
- **No Atlas migration that writes truth.** The matrix is computed from the `mirrors`/`kernel` graph (SELECT-only) and the demo project; if a read-only `runtime.law_coverage` snapshot view genuinely helps the `/check` panel, it is **expand-only / append-only** and the agent role gets **SELECT only** — confirm the grant boundary against S04 before assuming it (OpenQuestion otherwise).
- **No Skill.** No new replayable human gesture beyond `aidos check` and the existing `/goal`.

## Test minimal (done)

**Done = `aidos check` covers every KRD law (1 law = 1 red + 1 green) ∧ an e2e passes on the demo project.** Done is **computed**, never declared (CLAUDE.md §8). Restated **failing-first**, as the red BDD mirror to write **before** any wiring code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/` — one red + one green per law named in KRD §82.1 + §29:

  ```
  # mirrors schema · reflects: cmd/aidos.{check,impact,stable,diff,explain} · test_kind: fixture · cert_language: operation-dsl/go · authority: below
  fixture "truth without TruthKind is caught by check (RED)"          # §82.1 — owning verb: check
    state   (graph): a truth record with TruthKind == null
    command:         aidos check
    events: [ breach reported, code == TRUTH_WITHOUT_KIND, exit != 0 ]
  fixture "truth with a TruthKind passes (GREEN)"
    state   (graph): same record, TruthKind typed
    command:         aidos check
    events: [ no breach for this law ]

  fixture "mirror incompatible with the truth type is caught (RED)"   # §82.1 — check
  fixture "compatible mirror passes (GREEN)"
  fixture "scope absent is caught (RED)" / "scope present passes (GREEN)"            # §82.1 — check (S15)
  fixture "authority absent is caught (RED)" / "authority present passes (GREEN)"    # §82.1 — check (S16)
  fixture "memory entering the kernel without Idea→Mirror→Goal is caught (RED)"      # §82.1 — check (S30)
        / "memory promoted via Idea→Mirror→Goal passes (GREEN)"
  fixture "a non-stable phase is reported (RED)" / "a stable phase passes (GREEN)"   # §82.1 — stable (S23)
  fixture "an unjustified composes weight is caught (RED)"                           # §82.1 — check (S19)
        / "a justified composes weight passes (GREEN)"
  fixture "insufficient mutation score is caught (RED)"                              # §82.1 — check (S40)
        / "mutation score ≥ threshold passes (GREEN)"
  fixture "a too-broad global invariant is caught (RED)"                             # §82.1 — check (S08)
        / "a properly-scoped invariant passes (GREEN)"
  fixture "an untested ContextGraphDecision is caught (RED)"                         # §82.1 — check (S32)
        / "a tested ContextGraphDecision passes (GREEN)"
  fixture "a monster (spec without mirror / orphan mirror) is caught (RED)"          # §29 completeness — check (S12)
        / "every layer has its living mirror → passes (GREEN)"
  fixture "aidos impact computes the red wave for a bump (matches S22)"              # impact verb covered
  fixture "aidos diff produces the SemanticDiff between two phases (matches S21)"    # diff verb covered
  fixture "aidos explain explains a blockage (a BlockReason, matches S13)"          # explain verb covered
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: cmd/aidos law-coverage harness · test_kind: property · cert_language: rapid · authority: below
  ∀ law in the §82.1+§29 registry:  there exists exactly one RED fixture and one GREEN fixture mapped to it (totality)
  ∀ fixture in the matrix:           it maps to a registered law (no orphan fixture — no monster)
  ∀ verb in {check,impact,stable,diff,explain}: every law it owns is reachable through that verb (coverage closure)
  ∀ graph,verb:                      aidos <verb> is deterministic — same (graph, verb) ⇒ byte-identical output, same exit code
  ∀ green-graph:                     aidos check reports zero breaches; ∀ red-graph: exactly the expected breach(es), each a S13 BlockReason
  ```

The matrix starts **fully red** (the verbs are S03 stubs / not yet wired to the detectors; the registry and fixtures do not exist). That red **is** the `/goal`. Each fixture is a **means-test toward the human red** (the KRD law as written in §82.1 / §29) — **not** a new law the agent invents and then grades. **Done criteria (red set green ∧ prior green intact ∧ mutation score ≥ threshold ∧ no monster):** every registered law has a passing red **and** green fixture; the `rapid` totality property holds (no law without both, no orphan fixture); `aidos check` on the **demo project** returns the expected verdict; each of `check/impact/stable/diff/explain` is wired and deterministic; prior steps' green stays green; `/check` renders the matrix with a passing Playwright e2e.

## Visualisation UI

- **Workbench route:** `front/web/app/check/page.tsx` at `/check` (new route — do not touch existing routes). A read-only panel: the **law-coverage matrix** as a table — one row per KRD law (`law_id`, `krd_ref` e.g. §82.1 / §29, owning verb, **red ✓/✗**, **green ✓/✗**) — and the live **`aidos check` verdict on the demo project** (green, or the ordered list of S13 `BlockReason`s with `code` + `how_to_fix`). It **projects** the coverage/verdict; it never re-computes a law.
- **Playwright e2e:** `tests/e2e/check.spec.ts` — navigate to `/check`, assert every registered law renders a row with **both** a red and a green indicator (the 1-law-1-red-1-green done criterion is visible), assert the five verbs (`check/impact/stable/diff/explain`) appear as owning verbs, and assert the demo-project verdict block renders. Follow the `playwright-e2e` skill (role/text selectors, no brittle CSS); rely on the `webServer` block in `playwright.config.ts` (`npm run dev -w @aidos/web`, baseURL `http://localhost:3000`).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/cmd/aidos/**` (the `check/impact/stable/diff/explain` wiring + the law-coverage registry/sub-package), the `mirrors`-stored fixture matrix + `rapid` property materialized to `tests/`, `tests/e2e/check.spec.ts`, `front/web/app/check/**`, and (only if genuinely needed) a new expand-only read-only `back/migrations/<new>.sql` view — and otherwise **adds new files**. It introduces one new contract (the **law registry** shape `{law_id, krd_ref, owning_verb, detector_ref}` and the coverage-matrix totality rule); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes, no modifying the S04 wall / S07 sensors / S12 completeness gate / S39 self-test or their GRANTs, no re-implementing a prior detector. Any change to a **prior contract** it depends on — the S03 `aidos` CLI surface, the S13 `BlockReason` shape, any detector's signature (S08/S12/S14/S15/S16/S19/S21/S22/S23/S30/S32/S40), the waterline / GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S45 — "aidos compiler integration: every KRD law has 1 red + 1 green
across check/impact/stable/diff/explain". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-
addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home =
back/cmd/aidos ONLY (the five subcommands + a thin law-coverage sub-package), plus the mirrors-stored fixture
matrix materialized to tests/, tests/e2e/check.spec.ts, front/web/app/check, and — only if genuinely needed —
one expand-only read-only back/migrations view. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go
prompt → code.

Read BEFORE touching anything: KRD.md §82.1 (the KRDCompiler — "un compilateur de vérité, pas de code"; the
six verbs krd check/impact/stable/diff/explain[/trim]; the laws `check` MUST detect: vérité sans TruthKind,
miroir incompatible avec le type de vérité, scope absent, autorité absente, mémoire entrant dans le noyau sans
Idea→Mirror→Goal, phase non stable, poids composes non justifié, mutation score insuffisant, invariant global
trop large, ContextGraphDecision non testée; and the KEYSTONE RULE: "Aucun concept KRD n'existe s'il n'est pas
vérifiable par krd check"), §29 (la loi de complétude — au moins un miroir vivant par couche, pas de monstre),
§109 (complétude récursive). Read CONTEXT-MAP.md + back/runtime/CONTEXT.md (KRDCompiler/aidos = "a compiler of
truth, not of code… no KRD concept exists if `krd check` cannot verify it"; the wall; sensor; vague de rouge;
fitness non-gameable). Read the prior steps whose detectors you WIRE (do NOT re-implement them): S03 (the aidos
CLI surface), S13 (BlockReason shape), S14 (truth-typing), S06/S12 (completeness/monster), S15 (scope), S16
(authority), S30 (memory-firewall Idea→Mirror→Goal), S23 (stable-phase), S19 (composes-weight), S40 (mutation
score), S08 (invariant scope), S32 (ContextGraphDecision), S21 (SemanticDiff → diff), S22 (red-wave → impact).
For any Next.js 16, Atlas, cobra, Godog, rapid, or Go API doubt use context7 or node_modules/next/dist/docs.
Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: a "law" is EXACTLY one of the items KRD §82.1 enumerates plus the §29 completeness law — nothing
    more, nothing less; "coverage" = 1 law has 1 RED fixture (a graph that violates it → check reports the
    breach) AND 1 GREEN fixture (a graph that satisfies it → check passes); a "breach" is a S13 BlockReason
    (code/severity/explanation/how_to_fix[]); each law has an "owning verb" among check/impact/stable/diff/
    explain; this step WIRES existing detectors and PROVES coverage — it never authors a law, a detector, or a
    fitness rule (the wall, §2). Build the law registry by ENUMERATING §82.1 + §29 only. If a §82.1 law has no
    existing detector from a prior step, that is an OpenQuestion — do NOT invent the detector. Sharpen each term
    against back/runtime/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every
    branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE matrix (N2 frozen slot: state → command → events, interpreted in Go): for EACH law in the
        §82.1+§29 registry, one RED fixture (a violating truth-graph fragment + `aidos <owning-verb>` → the
        expected BlockReason) and one GREEN fixture (a satisfying fragment → pass). Also cover the verb views:
        `aidos impact` computes the red wave (matches S22), `aidos diff` produces the SemanticDiff (matches
        S21), `aidos explain` explains a blockage (a S13 BlockReason). Use the DEMO PROJECT as the end-to-end
        green case.
      - PROPERTY (rapid, ∀, below the line): the matrix is TOTAL — every registered law has exactly one red and
        one green fixture; every fixture maps to a registered law (no orphan fixture = no monster); every verb
        reaches every law it owns; aidos <verb> is deterministic (same graph+verb ⇒ byte-identical output, same
        exit code); a green graph yields zero breaches, a red graph yields exactly the expected breach(es).
    Run them; watch the matrix go FULLY RED (verbs are S03 stubs / unwired; registry + fixtures absent). That
    red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new "law" you'd grade
    yourself) — mirror the KRD §82.1/§29 laws ONLY; the fixtures are means-tests toward the human red.

(c) TDD red → green → refactor in back/cmd/aidos ONLY (the five subcommands + the thin lawcoverage sub-package).
    Outside-in. Build: the canonical law registry (one entry per §82.1 law + §29, each {law_id, krd_ref,
    owning_verb, detector_ref}); then wire each verb to CALL THE EXISTING DETECTOR that owns each law (REUSE
    S08/S12/S14/S15/S16/S19/S21/S22/S23/S30/S32/S40 — do NOT fork or re-implement any of them); aidos check
    returns an ordered list of S13 BlockReasons or green; impact/stable/diff/explain are the verb-specific views
    over the same truth graph. No clock, no RNG, no I/O beyond SELECT-only reads of the truth-store + the
    materialized demo project (determinism). Within the frozen slots, if a REAL tool choice arises, search AT
    MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (cobra for the CLI,
    Godog, rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/hook binaries are fixed).
    The likely genuine choices: how the law registry is declared (a Go table vs a data file read at runtime) and
    whether the /check panel needs a read-only `runtime.law_coverage` view or can read the matrix directly — if
    the latter touches a GRANT boundary not pinned by S04, record an OpenQuestion and STOP on that branch, do
    not assume the agent role may write. Record a short ADR (docs/adr/) ONLY if a genuine choice is made; if a
    detector signature must change to be callable, that is a ChangeSet + SemanticDiff, not an in-place edit.
    Code only what turns the matrix green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse, the S07 hook): gofmt / go vet / strict Go, go test, the new
    fixture matrix + rapid property, biome check at the monorepo root, eslint in front/web. Self-certify on the
    COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce each law's red and green
    case through its owning verb, run `aidos check` on the demo project end-to-end and confirm the verdict.
    Check completeness: the law-coverage harness has its living mirror (fixture matrix + property); no monster
    (no registered law without both a red and a green fixture, no orphan fixture, no law lacking an owning verb)
    — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/check/ → /check: render
    the law-coverage matrix (one row per law: law_id, krd_ref, owning verb, red ✓/✗, green ✓/✗) and the live
    `aidos check` verdict on the demo project (green, or the ordered S13 BlockReasons with code + how_to_fix).
    Project the matrix/verdict; do NOT re-compute a law. Do NOT touch existing routes. Add tests/e2e/check.spec.ts
    (use the playwright-e2e skill) asserting every law row shows BOTH a red and a green indicator (the
    1-law-1-red-1-green done criterion is visible), the five verbs appear as owning verbs, and the demo-project
    verdict block renders.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that the
    law registry is a single, deep, well-named source of truth (no scattered law lists), that each verb is a
    thin adapter over a REUSED detector (no duplicated law logic), that the matrix totality is enforced in one
    place, that the wall/GRANTs stay intact, and that boundaries match back/runtime/CONTEXT.md. Do not advance
    without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package/wiring (pure logic), the fixture matrix +
    rapid property (behaviour proof), the Next /check route (visualization), and — only if genuinely needed — a
    read-only expand-only migration view. Do NOT add an MCP server, a Go hook, a new detector/law, or a Skill —
    exposing coverage-as-a-tool, adding a non-bypassable rule, authoring a law, and a replayable gesture are out
    of slot; record any as OpenQuestions. A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a law, a target, a targetId, or a business-rule. The law set is EXACTLY KRD §82.1's enumeration
  plus the §29 completeness law — do not add a law KRD does not name, and do not coin a detector for a law that
  has no existing owner from a prior step. If a §82.1 law has no pinned detector, the demo-project's shape, the
  read-only law_coverage grant boundary, or a detector's callable signature is not pinned by KRD / a prior step
  / an existing migration / S04, do NOT guess — record an OpenQuestion (provenance) and STOP on that branch.
- You NEVER write a truth-test (a new law you would then satisfy — the circularity). The fixtures and property
  are means-tests toward the human red (the KRD §82.1/§29 laws as written), not new truths.
- Any change to a prior contract (the S03 aidos CLI surface, the S13 BlockReason shape, any detector signature,
  the waterline/GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior
  artifact, never hand-edit back/gen/**. An override is a recorded decision (ChangeSet + ADR + provenance).
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: every law in the §82.1+§29 registry has a passing RED fixture AND a passing
GREEN fixture through its owning verb (1 law = 1 red + 1 green); the rapid totality property holds (no law
without both, no orphan fixture, every law has an owning verb); `aidos check` on the DEMO PROJECT returns the
expected verdict; each of check/impact/stable/diff/explain is wired and deterministic; /check renders the matrix
with a passing Playwright e2e; the read-only grant (if any) matches S04; prior green stays green. You cannot
force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (the fixture coverage matrix N2 + rapid totality property), where stored (mirrors
  schema) and materialized (tests/); the list of laws covered (§82.1 items + §29) with their owning verbs.
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /check — what it renders (law-coverage matrix + demo-project verdict), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes never by the agent); any prior-contract change →
  ChangeSet + SemanticDiff, else "none".
- Red-set status: which laws went red then green; any law still red or lacking a detector.
- Known limits: any §82.1 law without a pinned detector (OpenQuestion), the law_coverage grant / demo-project
  shape OpenQuestions, no MCP / no hook / no new law / no Skill this step, detectors referenced not redefined.
- Next safe step: the smallest stable next tooth (e.g. the `aidos trim` verb wired to S41 KernelDebt, or the
  `aidos goal` verb that opens a /goal from the red set) and why it is safe to chain.
```
