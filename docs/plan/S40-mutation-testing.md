# S40 — Mutation-testing sensor (gremlins back · StrykerJS front); the threshold gates the stable phase

Subsystem: AIDOS Mirror | Home: `back/runtime/sensors/mutation` | Workbench route: `/mutation-score`

## Objectif

Land the **mutation-testing sensor** — the *densimètre* of kernel tightness (KRD §19 pipeline drawer, §43/§59.8 "Serrage", §64): a Go adapter that runs **gremlins** over the Go mirrors/code (and **StrykerJS** over the front) post-integration, computes a **mutation score**, and **gates the stable phase** against a **declared threshold** read from the `fitness` schema. Done = the gate's arithmetic: **a score of 40% blocks, a score of 80% passes** (threshold pinned above the line, agent SELECT-only).

## Sortie attendue

Per CLAUDE.md §5, this step needs a **capability** (run a runner, read the threshold service) → an MCP server, a **non-bypassable rule** (mutation ≥ seuil is part of the non-gameable Stop) → a Go hook contribution, **persistence** (record each mutation run; the threshold is read, never written here), a **behaviour proof**, and a **visualization**. It does **not** invent the threshold value, the runners, or a new gate — those are reused/declared:

- **Go package** — `back/runtime/sensors/mutation/` — the sensor adapter, pure orchestration over the frozen runners (it **invokes** gremlins / StrykerJS as subprocesses; it never reimplements mutation operators):
  - a **runner adapter** interface `Run(scope) → MutationReport{ killed, survived, timed_out, not_covered, total, score, surviving_mutants[] }` with two implementations — **gremlins** (Go scope) and **StrykerJS** (front scope) — each parsing the tool's own report (gremlins JSON / Stryker JSON) into the shared `MutationReport`. No operator logic is authored here.
  - the **gate** `Gate(report, threshold) → {verdict: pass|block, score, threshold, surviving_mutants[]}` — pure, total, deterministic: `score ≥ threshold ⇒ pass`, else `block`. The `threshold` is an **input read from `fitness`**, never a literal in this package (the agent must not author the bar it is graded against — §8 anti-Goodhart, KRD §66.2 "diagnostic, jamais fitness de promotion" / §1831 "une fitness function buggée passe tout").
  - score = `killed / (total − not_covered)` (or the runner's own "mutation score" field if it already excludes uncovered) — pin the exact denominator in the ADR; do **not** silently pick one.
- **Go hook contribution** — `back/hooks/stop/` (the **existing** Stop hook from the completeness/goal step — extended **additively**, never rewritten) — adds `mutation ≥ seuil` as one **conjunct** of the non-gameable Stop predicate `red→green ∧ green intact ∧ mutation ≥ seuil ∧ tout miroir vivant` (KRD §1485/§1767/§2274). This step **wires the conjunct in via a ChangeSet + SemanticDiff** on the Stop contract; it does not fork a second Stop hook (a new artifact may ADD a guardrail, never REMOVE/duplicate one — §5 meta-loop). If S29/S12's Stop hook contract is not pinned, that wiring is an **OpenQuestion**, not a guess.
- **MCP server** — `back/mcp/mutation-runner/` — one tool = one backend op: `run_mutation(scope) → MutationReport` (invoke gremlins/StrykerJS, persist the run) and `read_threshold(scope) → threshold` (SELECT-only against `fitness`). This is the **capability** (run a runner + query a service) per §5; the runner is expensive/post-integration, so it is an on-demand callable op, not a per-diff hook.
- **Atlas migration (Postgres)** — `back/migrations/` — the **`mutation_runs`** table (below the waterline, a Runtime audit log — **not** `kernel`/`mirrors`/`fitness`): append-only, content-addressed by the run/scope hash, columns `run_id`, `scope`, `commit_or_phase_hash`, `runner` (`gremlins|stryker`), `killed`, `survived`, `total`, `not_covered`, `score numeric`, `threshold_used numeric`, `verdict (pass|block)`, `started_at/finished_at`, and a child `surviving_mutants[]` (file, line, operator, the test gap). The agent role MAY be granted **write** on `mutation_runs` — confirm the grant boundary against S04 before assuming it. The **threshold itself is read from `fitness` (read-only, no agent write grant)**; this migration adds **no** `fitness` row and **no** write GRANT on `fitness`.
- **BDD mirror** — by nature this sensor's proof is a **fixture** (the gate's `score+threshold → verdict` arithmetic, the done criterion) + a **`rapid` property** (∀ the monotone gate law) + the **mandatory fault-injection** (§5 hook-honesty: plant a known surviving mutant, assert the score drops below the bar and the gate blocks). Conceptually stored in the `mirrors` schema (`reflects: runtime.sensors.mutation`, `test_kind: fixture/property`, `cert_language: fixture/rapid`, `liveness: live`), materialized to `tests/`.
- **Next route** — `front/web/app/mutation-score/` → `/mutation-score` — the Workbench panel projecting `mutation_runs`: latest score vs the declared threshold (the gate bar), pass/block verdict, and the **surviving-mutant** list (the holes to plug). Projects the table, never re-encodes the gate.

Explicitly **out of scope / would be a monster here**: no new **Skill** (no replayable human gesture earned yet; a "plug-the-surviving-mutant" skill is only earned after a real recurring gap → OpenQuestion). No **second Stop hook** (extend the one Stop, additively). No authoring of the **threshold value** or a `fitness` row (above the line, human-engraved, agent SELECT-only — KRD §66.2/§1893). No per-diff wiring (mutation is the **pipeline** drawer, not the PostToolUse computational drawer S07 — never move it to each diff). No mutation **operators** (gremlins/StrykerJS own those — frozen, replaceable slot). No "the gate auto-adjusts the bar on a survivor" (the loop never edits its own fitness — §8, KRD §1231).

> Per CLAUDE.md §5 hook-honesty + KRD §59.8: this sensor ships with a **fault-injection test** — weaken a mirror so a real mutant survives, assert the score falls and the gate **blocks**; restore the mirror, assert it **passes**. A densimètre that never reads low is theatre (KRD §1123 "un détecteur qui ne fire pas est mort").

## Test minimal (done)

**Done = 40% blocks, 80% passes** — the gate's threshold arithmetic, restated **failing-first** as the red BDD mirror to write **before** any adapter/gate code (red **is** the `/goal`). The threshold in the fixtures is a **declared input read from `fitness`** (the example bar), never a value this step invents.

- **Fixture (N2 frozen slot: `state → command → events`, interpreted in Go)**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors · reflects: runtime.sensors.mutation.Gate · test_kind: fixture · cert_language: fixture · authority: below
  fixture "a score below the declared threshold blocks the stable phase"     # THE done criterion (40% < 80%)
    state   (threshold from fitness): 0.80
    state   (report): { killed: 40, survived: 60, total: 100, not_covered: 0 }   # score = 0.40
    command: Gate(report, threshold)
    events:  [ Gated ]
    -> verdict == "block"
    -> the surviving_mutants[] are carried into the result (the holes to plug)
    -> a mutation_runs row is recorded { score: 0.40, threshold_used: 0.80, verdict: "block" }

  fixture "a score at or above the declared threshold passes"                 # 80% ≥ 80%
    state   (threshold from fitness): 0.80
    state   (report): { killed: 80, survived: 20, total: 100, not_covered: 0 }   # score = 0.80
    command: Gate(report, threshold)
    events:  [ Gated ]
    -> verdict == "pass"
    -> a mutation_runs row is recorded { score: 0.80, threshold_used: 0.80, verdict: "pass" }

  fixture "the gate reads the threshold from fitness, never authors it"       # §8 anti-Goodhart
    state:   no threshold passed in
    command: Gate(report, /* threshold absent */)
    events:  [ Blocked ]
    -> block_reason.code == "MISSING_THRESHOLD"     # reuse S13 BlockReason; never default to a self-chosen bar

  fixture "the wired Stop conjunct blocks when mutation < seuil"              # the gate of the stable phase
    state:   red-set green, prior green intact, all mirrors live, mutation score 0.40 vs threshold 0.80
    command: Stop.check()
    events:  [ StopBlocked ]
    -> stop is NOT satisfied (mutation ≥ seuil conjunct is false)
    -> raising the score to 0.80 makes Stop satisfiable (other conjuncts holding)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: runtime.sensors.mutation.Gate · test_kind: property · cert_language: rapid · authority: below
  ∀ report, ∀ threshold:   Gate is deterministic — same (report, threshold) ⇒ same verdict (no clock, no RNG)
  ∀ report, ∀ threshold:   verdict == "pass" ⇔ score(report) ≥ threshold ; else "block" (no third verdict)
  ∀ report:                the gate is MONOTONE in score — killing more mutants never turns pass→block
  ∀ report:                score ∈ [0,1] ; an empty/no-coverable-mutant report is BLOCK + a BlockReason, never a silent 1.0
  ∀ report:                a missing/absent threshold ⇒ Block(MISSING_THRESHOLD) — the gate never invents its own bar
  ∀ runner report:         parsing gremlins/Stryker output never panics; an unparsable report ⇒ Block, never an assumed score
  ```

- **Fault-injection (sensor-honesty, the §5 mandatory test):** start from a green workspace where the score ≥ threshold; **weaken one real mirror** so a known mutant survives → assert the measured score drops below the bar and the gate `block`s and the surviving mutant is listed; **restore** the mirror → assert the score recovers and the gate `pass`es. This proves the densimètre actually reads the hole, not just that the comparison `≥` holds.

All three start **red** (no `mutation` package, no `Gate`, no runner adapter, no `mutation_runs` table, no Stop conjunct, no MCP). That red **is** the `/goal`. The fixtures are **means-tests toward the human red** (a survivor must drop the score below the human-declared bar and stop the phase) — **not** a new truth the agent invents and then grades; the agent **never** writes the threshold it is measured against (§8, the circularity).

## Visualisation UI

- **Workbench route:** `front/web/app/mutation-score/page.tsx` → `/mutation-score` (new route; do **not** touch existing routes). A read-only panel that renders, via the SELECT-only projection of `mutation_runs` and the `fitness` threshold: the **latest mutation score** as a gauge against the **declared threshold bar** (label it "declared above the line · read-only"), the **pass/block verdict** for the stable phase, and the **surviving-mutant list** (file · line · operator · the mirror gap to plug). It must show, with the canonical example, **0.40 → BLOCK** and **0.80 → PASS** against the 0.80 bar. Projects the table; does **not** re-implement the gate or the runners in TS.
- **Playwright e2e:** `tests/e2e/mutation-score.spec.ts` (via the `playwright-tester` agent + `playwright-e2e` skill; `playwright.config.ts` already has the `webServer` block, baseURL `http://localhost:3000`):

  ```
  Given the Workbench is running
  When I navigate to /mutation-score
  Then I see the latest mutation score and the declared threshold bar labelled read-only
  And I see a BLOCK verdict for a 40% run against an 80% threshold
  And I see a PASS verdict for an 80% run against an 80% threshold
  And I see the surviving-mutant list (file, line, operator) for the blocked run
  ```

  Follow the `playwright-e2e` conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/sensors/mutation/**`, `back/mcp/mutation-runner/**`, the new `back/migrations/<new>.sql` (the `mutation_runs` table + its child), the `mirrors`-stored fixture + `rapid` property + fault-injection materialized to `tests/`, `tests/e2e/mutation-score.spec.ts`, and `front/web/app/mutation-score/**` — and otherwise **adds new files**. The single touch of a **prior contract** is wiring the `mutation ≥ seuil` conjunct into the **existing Stop hook** (`back/hooks/stop/`): that goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) **plus a SemanticDiff** on the Stop predicate — it is an *additive* conjunct (a new guardrail), never a rewrite or a second Stop. No hand-edit of generated files (`back/gen/**`), no touching prior Workbench routes, no write to truth (`kernel`/`mirrors`/`fitness`) — the **threshold is read from `fitness`, never authored**, and this migration adds **no `fitness` write GRANT**. The `mutation_runs` migration is **expand-only / append-only** and alters no prior table or GRANT. Any other change to a prior contract it depends on (S13's `BlockReason` shape, S04's wall GRANTs, the `fitness` threshold record's read shape, the S07 sensor/`sensor_runs` boundary, the S29/S12 Stop predicate) goes through a **ChangeSet + SemanticDiff**, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit. If a real tool choice is made inside the frozen mutation slot, record an **ADR**.

## Prompt a lancer

```text
You are step-executor for AIDOS step S40 — "Mutation-testing sensor (gremlins back · StrykerJS front);
the threshold gates the stable phase". Stack is FROZEN: back=Go, truth=Postgres (append-only,
content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench).
Home = back/runtime/sensors/mutation ONLY (plus the MCP server in back/mcp/mutation-runner, the Atlas
migration in back/migrations, and one ADDITIVE ChangeSet-gated conjunct into the EXISTING back/hooks/stop).
Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §19 (the THREE timing drawers — mutation testing is the PIPELINE,
post-integration drawer, NOT the per-diff computational drawer; do not move it to each diff), §43/§59.8
"Serrage" (mutation testing périodique — un mutant survivant = un trou → ajouter un invariant/une fixture),
§64/§1485/§1767/§2274 (the non-gameable Stop: « fini » = set rouge→vert ∧ vert intact ∧ mutation ≥ seuil ∧
tout miroir vivant), §65/§66.2 (le miroir EST l'ancre de fitness; CellVitality = diagnostic, JAMAIS fitness
de promotion), §1831 ("une fitness function buggée passe tout" — why the agent must not author its own bar),
§1893 (waterline = qui-possède-quoi, IMMUABLE). Read CONTEXT-MAP.md + back/runtime/CONTEXT.md +
back/kernel/CONTEXT.md (the waterline, the fitness/NIVEAU-3 schema as read-only above the line, the densimètre,
the monster). Read the prior steps you DEPEND ON and CONSUME, never re-implement: S04 (the wall / GRANTs /
PreToolUse), S07 (the per-diff computational sensors + sensor_runs — keep the boundary: mutation is pipeline,
not per-diff), S13 (BlockReason shape), S12/S29 (the EXISTING Stop completeness/goal hook contract you extend),
and the fitness-schema step that owns the declared threshold/"definition of passed" (read-only). For any
gremlins / StrykerJS / Next.js 16 / Atlas / Go API doubt use context7 or node_modules/next/dist/docs. Do not
start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language: mutation testing is the DENSIMÈTRE of kernel tightness (noyau trop maigre → le comportement fuit
    par les trous), the PIPELINE/post-integration drawer (KRD §19), run PERIODICALLY (serrage), NOT at each
    diff. The SEUIL/threshold is a DECLARED truth ABOVE the line, living in the `fitness` schema (NIVEAU 3,
    read-only, INVIOLABLE) — the agent reads it SELECT-only and is GRADED by it; the agent NEVER authors it
    (no loop edits its own fitness — §8, KRD §1231). The mutation conjunct (mutation ≥ seuil) is ONE part of
    the non-gameable Stop, wired ADDITIVELY into the EXISTING Stop hook. This step delivers a Go adapter over
    the FROZEN runners (gremlins back, StrykerJS front), a Gate(report, threshold)→verdict, the mutation_runs
    audit table (below the waterline), and the UI — NOT a new threshold value, NOT a second Stop hook, NOT
    mutation operators, NOT per-diff wiring, NOT an auto-adjusting bar. Sharpen each term against
    back/runtime/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch
    before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema (reflects=runtime.sensors.
    mutation, test_kind=fixture/property, cert_language=fixture/rapid, liveness=live) and materialized to
    tests/. By nature this sensor's proof is a FIXTURE + a rapid PROPERTY + the mandatory FAULT-INJECTION:
      - FIXTURE (N2 slot: state → command → events): with the threshold READ FROM fitness = 0.80 — a report
        scoring 0.40 (killed 40 / total 100, not_covered 0) ⇒ Gate verdict "block" + a mutation_runs row
        {score 0.40, threshold_used 0.80, verdict block} carrying the surviving_mutants[] (THE done criterion:
        40% blocks); a report scoring 0.80 ⇒ verdict "pass" + a row (80% passes); a Gate called with NO
        threshold ⇒ Block(MISSING_THRESHOLD) (S13 BlockReason — never defaults to a self-chosen bar); the
        wired Stop conjunct ⇒ Stop is NOT satisfied when mutation < seuil, and becomes satisfiable when the
        score reaches the bar (other conjuncts holding).
      - PROPERTY (rapid, ∀, below the line): Gate is deterministic; verdict == pass ⇔ score ≥ threshold (no
        third verdict); MONOTONE in score (killing more never turns pass→block); score ∈ [0,1]; an
        empty/no-coverable-mutant report ⇒ Block + BlockReason, never a silent 1.0; a missing threshold ⇒
        Block(MISSING_THRESHOLD); parsing gremlins/Stryker output never panics — an unparsable report ⇒ Block,
        never an assumed score.
      - FAULT-INJECTION (§5 hook-honesty, the densimètre proof): from a green workspace (score ≥ threshold),
        WEAKEN one real mirror so a known mutant survives → assert the measured score drops below the bar AND
        the gate blocks AND the surviving mutant is listed; RESTORE the mirror → assert score recovers and the
        gate passes.
    Run them; watch them go RED (no mutation package, no Gate, no runner adapter, no mutation_runs table, no
    Stop conjunct, no MCP). That red IS the /goal. Do NOT write a truth-test you would then satisfy: you NEVER
    author the threshold/seuil you are graded against (the circularity §58/§8). The mirror is a means-test
    toward the human red (a survivor must drop the score below the HUMAN-declared bar and stop the phase).

(c) TDD red → green → refactor in back/runtime/sensors/mutation ONLY (plus back/mcp/mutation-runner, the
    back/migrations mutation_runs file, and the ADDITIVE ChangeSet-gated Stop conjunct in back/hooks/stop).
    Outside-in. Build: the runner adapter interface Run(scope)→MutationReport with two impls that INVOKE
    gremlins (Go) and StrykerJS (front) as SUBPROCESSES and parse their own JSON reports — NEVER reimplement
    mutation operators; and Gate(report, threshold)→verdict, a PURE, TOTAL, DETERMINISTIC function whose
    threshold is an INPUT read from fitness, never a literal in the package. Within the FROZEN-but-REPLACEABLE
    mutation slot, if a REAL tool choice arises, search AT MOST 3 current (May 2026) options, compare, pick the
    SIMPLEST, never touch the mandatory minimum (gremlins for Go and StrykerJS for front are the frozen slot;
    Godog/rapid/the fixture interpreter, sqlc/pgx, Atlas are FIXED). Likely genuine choices to ADR: the exact
    gremlins invocation + report format, the StrykerJS reporter/json shape, and the SCORE DENOMINATOR (whether
    "not_covered" is excluded — pin it explicitly, do NOT silently pick one). Record a short ADR (docs/adr/)
    ONLY if a genuine choice is made. The migration is expand-only/append-only: add mutation_runs (run_id,
    scope, commit_or_phase_hash, runner, killed, survived, total, not_covered, score numeric, threshold_used
    numeric, verdict, started_at/finished_at) + a child surviving_mutants(file, line, operator, gap). Confirm
    against S04 that the agent role may WRITE mutation_runs (it is a Runtime audit log BELOW the waterline — NOT
    kernel/mirrors/fitness); add NO fitness row and NO fitness write GRANT. The MCP server exposes run_mutation
    (invoke + persist) and read_threshold (SELECT-only on fitness). Wire the mutation ≥ seuil conjunct into the
    EXISTING Stop hook via a ChangeSet + SemanticDiff (additive — a new guardrail, never a rewrite or a second
    Stop). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse, the S07 per-diff computational drawer — you are dogfooding):
    gofmt / go vet / strict Go, go test, the new fixture + rapid property, biome check at the monorepo root,
    eslint in front/web. Self-certify on the COMPUTATIONAL only; never declare the behaviour green from tests
    you wrote. Note the boundary: THIS step's mutation run is the PIPELINE drawer, not a per-diff sensor.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor; reproduce a 40% report → block and
    an 80% report → pass against the 0.80 bar; run the FAULT-INJECTION (weaken a mirror → a real mutant
    survives → score drops → gate blocks; restore → passes) — a densimètre that never reads low is dead.
    Check completeness: runtime.sensors.mutation has its living mirror (fixture + property + fault-injection);
    no monster (no sensor without a mirror, no orphan mirror, no self-authored threshold, no hand-edited
    back/gen) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/mutation-score/ →
    /mutation-score: a gauge of the latest mutation score against the DECLARED threshold bar (labelled
    "declared above the line · read-only"), the pass/block verdict for the stable phase, and the
    surviving-mutant list (file · line · operator · the mirror gap). Show 0.40 → BLOCK and 0.80 → PASS against
    the 0.80 bar with the canonical example. Read via the SELECT-only projection of mutation_runs + the fitness
    threshold; project, do NOT re-implement the gate or the runners in TS. Do NOT touch existing routes. Add
    tests/e2e/mutation-score.spec.ts (use the playwright-e2e skill) asserting the score + read-only threshold
    bar, a BLOCK verdict for a 40% run, a PASS verdict for an 80% run, and the surviving-mutant list.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    `mutation` is a deep, well-named module (runner adapter / MutationReport / Gate cleanly separated, "score
    vs declared bar" obvious), that the two runner impls share ONE adapter interface and only PARSE their
    tools' reports, that Gate is pure/total/deterministic and REUSES S13's BlockReason WITHOUT duplicating it,
    that the threshold is an INPUT (read from fitness, never authored), that the Stop conjunct is ADDITIVE
    (the wall and the other conjuncts intact), that mutation_runs stays below the waterline (no fitness write),
    and that boundaries match back/runtime/CONTEXT.md. Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package back/runtime/sensors/mutation (pure
    logic/orchestration), the MCP server back/mcp/mutation-runner (capability: run a runner + read a service),
    the Atlas migration (persistence: mutation_runs, append-only, below the waterline), the additive Stop-hook
    conjunct (the non-bypassable mutation ≥ seuil rule, via ChangeSet + SemanticDiff), plus the fixture + rapid
    property + fault-injection (behaviour proof) and the Next route (visualization). Do NOT add a Skill (no
    replayable human gesture earned yet — a "plug-the-surviving-mutant" skill is a later step; record an
    OpenQuestion if it recurs). Do NOT add a SECOND Stop hook (extend the one Stop additively). A new artifact
    may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do NOT author the threshold/seuil value, a fitness
  row, the score denominator convention, or a gate that defaults to a self-chosen bar — the threshold is read
  SELECT-only from `fitness` (above the line); a missing threshold is Block(MISSING_THRESHOLD), never a guess.
  If the exact fitness threshold record's read shape, the agent write-grant for mutation_runs, the gremlins /
  StrykerJS report formats, the S13 BlockReason shape, or the S12/S29 Stop predicate contract are not pinned by
  KRD / an existing migration / a referenced step, do NOT guess — record an OpenQuestion (provenance) and STOP
  on that branch.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity is the wall). The
  fixture/property/fault-injection are means-tests toward the human red (a survivor drops the score below the
  HUMAN-declared bar and stops the phase), not new truths; the sensor MEASURES tightness, it does not DEFINE
  the bar.
- An unparsable/empty/no-coverable-mutant report or a missing threshold is a FAILURE made explicit (Block +
  BlockReason), NEVER a silent pass / a silent 1.0 (KRD §82 .passthrough() anti-pattern, §1831 "une fitness
  function buggée passe tout").
- Any change to a prior contract (the EXISTING Stop predicate, S13 BlockReason, S04 wall GRANTs, the fitness
  read shape, the S07 sensor boundary) goes through a ChangeSet + SemanticDiff. Add new files; never silently
  rewrite a prior artifact, never hand-edit back/gen/**, never write truth (kernel/mirrors/fitness). An
  override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ no monster.
Concretely: against the declared 0.80 bar read from fitness, a 0.40 report → Gate BLOCK + a mutation_runs row
carrying its surviving mutants, and a 0.80 report → Gate PASS + a row (40% blocks, 80% passes — THE done
criterion); a missing threshold → Block(MISSING_THRESHOLD); the rapid invariants hold (determinism,
pass ⇔ score ≥ threshold, monotonicity, score ∈ [0,1], empty/unparsable ⇒ Block); the fault-injection fires
(weaken a mirror → survivor → score drops → BLOCK; restore → PASS); the mutation ≥ seuil conjunct is wired
additively into the existing Stop and blocks the stable phase below the bar; /mutation-score renders the gauge,
the read-only bar, both verdicts, and the surviving-mutant list with a passing Playwright e2e; mutation_runs is
append-only and below the waterline (no fitness write); back/gen is generated-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (the gate fixture N2 + the rapid property + the fault-injection), where stored
  (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, the fault-injection, biome,
  eslint, playwright) and the red→green transition.
- UI route: /mutation-score — what it renders (score gauge, read-only declared bar, BLOCK at 40% / PASS at
  80%, surviving-mutant list), e2e file + result.
- ChangeSet status: the additive mutation ≥ seuil conjunct wired into the existing Stop hook → ChangeSet
  (DRAFT|APPLIED) + SemanticDiff; any other prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. pipeline (not per-diff) cadence, gremlins/Stryker runtime budget (max_mutation_runtime),
  score-denominator convention, threshold read-shape OpenQuestion, mutation_runs write-grant OpenQuestion, no
  plug-the-survivor skill yet, front Stryker scope coverage.
- Next safe step: the stable phase this leaves (the densimètre gates the phase against the declared bar) and
  the smallest next tooth that consumes it (e.g. the /evolve middle loop asserting score_mutation ≥ seuil on a
  variant, or the curation/QD step turning a recurring survivor into a new invariant/fixture).
```
