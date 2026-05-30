# S42 — EvolutionSandbox: `/evolve` writes only branches/reports/ideas; QD promotion needs a green mirror

Subsystem: AIDOS Runtime | Home: `back/runtime/evolve` | Workbench route: `/evolution-sandbox`

## Objectif

Land the **EvolutionSandbox** (KRD §66.1) — the quarantine in which every `/evolve` medium-loop run (KRD §62 algorithm ②, §64) is confined: the loop may **write only** `/branches/evolution`, `/reports`, `/ideas/proposed` (candidate branches, scores, hypotheses, suggestions) and may **never** write `/kernel`, `/mirrors/above`, `/authority`, `/fitness` (truths, approvals, exceptions, rights). The done criterion: **a write to `/kernel` is refused; a candidate branch under `/branches/evolution` is allowed; and a variant is promoted into a QD niche only when it carries a green mirror (∧ out-of-sample green ∧ authority approval).** This makes "the evolution explores, it does not govern" a typed, non-bypassable sandbox over the medium loop, instead of a self-improving loop that could grade its own copy into the kernel.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (Go package), a **non-bypassable rule** (the sandbox-confinement Go hook + its fault-injection test), **two capabilities** (the `evolve` and `backtester` MCP servers), a **repeatable gesture** (the `/evolve` Skill), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new Postgres schema (it reuses `ideas`/`dag`/`changesets`) nor any codegen (justified below).

- **Go package** `back/runtime/evolve/` — the pure EvolutionSandbox engine. Pure functions, no I/O, no clock/RNG read from the ambient (any seed/budget/`now` is passed in so a run is deterministic and replayable):
  - the typed **`EvolutionSandbox` AST** exactly as KRD §66.1 declares it — `can_write: {/branches/evolution, /reports, /ideas/proposed}`, `cannot_write: {/kernel, /mirrors/above, /authority, /fitness}`, `promotion.requires: {mirror_green, out_of_sample_green, authority_approval}` — the zones and the promotion gate are **declared, not learned** (CLAUDE.md §8).
  - `Confine(write{path}) → Allowed | Refused(BlockReason)` — a pure classifier: a write whose path falls under a `can_write` prefix is allowed; a write under a `cannot_write` prefix (or any path outside `can_write`) is refused with an actionable `BlockReason` (`code: SANDBOX_WRITE_ESCAPES_ZONE`, `severity`, `explanation`, `how_to_fix: ["confine_write_to_/branches/evolution_or_/reports_or_/ideas/proposed", "open_a_/goal_to_promote_a_candidate"]`).
  - `Promote(variant, evidence) → Promoted | Refused(reason)` — the QD promotion gate: a variant enters a niche **only if** `mirror_green ∧ out_of_sample_green ∧ authority_approval` (KRD §66.1, §62 algorithm ② two-stage fitness, §64 "gate binaire — passe ou meurt — puis classement continu"). The **Judge is the deterministic mirror, never an LLM scoring its own copy** (KRD §66, §1, §62); a champion replaces the niche élite **only** if it beats it **out-of-sample** (KRD §64, §87). `Promote` produces a *promotion proposal* over the sandbox output — it does **not** itself write the kernel/mirror/authority/fitness (that door is the human `/goal` freeze, KRD §118/§132).
  - `Evolve(cell, budget, sampler) → EvolutionRun` — the pure shape of the medium loop ② over an already-populated archive: sample a parent (including weak ancestors / stepping stones), record the proposed variant + its non-gameable fitness reading (`kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample`) and its behavioral niche, and emit a `branch` (under `/branches/evolution`) + a `report` (under `/reports`) + optionally an `idea` (under `/ideas/proposed`). **No generation engine, no real LLM call, no real backtest** here — `Evolve` is the pure orchestration shape; variant *generation* (self-play/AlphaEvolve mutation) and the actual out-of-sample run are behind the MCP capabilities (below) and the consumed fitness, never coined in this package.
  - All persistence of branches/reports/ideas goes through the MCP/CLI write-grant on `ideas`/`dag`, never the agent role (the wall, §2).
- **Go hook** `back/hooks/<sandbox-confinement>/` (a dedicated binary, or wired into `pretooluse`) — the **non-bypassable confinement rule**: while an `/evolve` run is active (the sandbox is open), every file/DB write the agent attempts is **refused unless its path is under `/branches/evolution`, `/reports`, or `/ideas/proposed`** — any write to `/kernel`, `/mirrors/above`, `/authority`, or `/fitness` is blocked with `BlockReason` `code: SANDBOX_WRITE_ESCAPES_ZONE`. It also refuses any attempt by the loop to write a truth/approval/exception/right directly (the evolution *proposes*, the human *freezes* via `/goal`): `code: SANDBOX_CANNOT_GOVERN`. Per §5 **hook honesty** it ships with a **fault-injection test**: have an active `/evolve` run attempt a write to `/kernel` (and to `/fitness`) and assert the hook goes red and blocks; a hook that never fires is dead.
- **MCP server** `back/mcp/evolve/` (Go MCP SDK, one tool = one backend op) — the medium-loop capability door, carrying the `aidos` CLI write-grant on `ideas`/`dag` (the agent role never writes truth): `evolve_run` (runs the §62 ② loop over a cell within the sandbox, persisting candidate **branches** under `/branches/evolution`, **reports** under `/reports`, **ideas** under `/ideas/proposed`), `evolve_propose_promotion` (records a *promotion proposal* gated on `mirror_green ∧ out_of_sample_green ∧ authority_approval` — never the freeze itself), `evolve_run_get`, `evolve_run_list`. It **cannot** write `/kernel`, `/mirrors/above`, `/authority`, `/fitness`.
- **MCP server** `back/mcp/backtester/` (Go MCP SDK) — the **out-of-sample evaluation** capability (KRD §62 ② `out_of_sample`, §87 the brutal truth: in-sample Sharpe ≈ no predictive power, the market is adversarial/non-stationary; out-of-sample / walk-forward is the only honest signal): `backtest_out_of_sample` (evaluates a variant on **out-of-sample data only**, never the in-sample — returns the green/red evidence the promotion gate consumes), `backtest_get`. It is a **read/evaluate** capability: it returns a fitness *reading*, it does **not** define or edit the fitness (the metre-stick is held above the line, never by the loop — CLAUDE.md §8, KRD §62 insight, §87).
- **Skill** `.claude/skills/evolve/` (`SKILL.md`, per §5 — a repeatable orchestrated gesture) — `/evolve`: launch the medium loop (self-play + QD) on a cell **inside the sandbox**, sampling the archive (stepping stones included), generating variants, reading the non-gameable fitness, keeping one élite per niche, and emitting candidate branches/reports/ideas. It carries the forced **Honesty rules** section (never invent a `target`/`targetId`/business-rule/fitness/niche-descriptor; uncertainty becomes an **OpenQuestion** in provenance) and states plainly that `/evolve` **proposes**, it never governs (no kernel/mirror/authority/fitness write; promotion needs a green mirror + out-of-sample + authority approval via `/goal`).
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — a **journey/acceptance Gherkin `.feature`** (`test_kind: gherkin`, `cert_language: godog`, `authority: above`) for the canonical `/evolve`-in-quarantine flow, **plus** a **fixture** (`test_kind: fixture`, `state → command → events`) over `Confine`/`Promote`/`Evolve`, **plus** a **`rapid` property** (`authority: below`) on the sandbox invariants. These **are** the done criteria (see below).
- **Next route** `front/web/app/evolution-sandbox/` → `/evolution-sandbox` — the Workbench "Evolution Sandbox" panel rendering an `/evolve` run in quarantine: the allowed write list (`/branches/evolution`, `/reports`, `/ideas/proposed`), an escaping write to `/kernel` rendered **red** with its `BlockReason`, the MAP-Elites niche grid with one élite per niche, and each promotion **gated** on `mirror_green ∧ out_of_sample_green ∧ authority_approval` (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new Postgres schema** — branches live in the `dag`/`changesets` schemas, candidate ideas in `ideas`, reports as ledger rows; this step reuses them and never forks an `evolution` schema (raise an OpenQuestion if a column is genuinely missing). **No `/goal` / freeze / mirror / authority / fitness writing** — promotion of a candidate to a frozen, mirrored, authority-approved truth is the **separate human `/goal` gesture**; the sandbox stops at a *proposal*. **No QD niche / curation engine** — `Niche`/`Elites`/`Curate` and the MAP-Elites archive are **S26** (consumed here, not redefined: this step *runs the loop into the sandbox and gates promotion*, S26 *selects/curates the archive*). **No fitness definition** — `kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample` is **consumed** from the prior sensor/fitness steps, never coined here. **No real LLM/self-play generation model and no real market data** — the generator and the backtest are capabilities behind the MCP; this step delivers the *sandbox + gate + orchestration shape*, not the generator. **No CellVitality as a promotion fitness** — §66.2 vitality is diagnostic, it never validates a variant. **No codegen** — there is no projection to emit from an evolution run.

## Test minimal (done)

**Done = writing `/kernel` from an `/evolve` run is forbidden; a candidate branch under `/branches/evolution` is allowed; and a variant is promoted into a niche only with a green mirror (∧ out-of-sample green ∧ authority approval).** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Evolution-in-quarantine journey** — Gherkin `.feature` (`cert_language: godog`, `authority: above`), reflecting KRD §66.1 / §62 ②:

  ```gherkin
  # mirrors schema · reflects: runtime.evolve EvolutionSandbox (Confine/Promote/Evolve) · test_kind: gherkin · authority: above
  Feature: /evolve writes only branches/reports/ideas; QD promotion needs a green mirror

    Scenario: A candidate branch is allowed                              # THE done criterion (allow)
      Given an active /evolve run on cell "createOrder"
      When the run writes a variant to "/branches/evolution/var-7"
      Then the write is allowed
      When the run writes a score to "/reports/var-7.json"
      Then the write is allowed
      When the run writes a suggestion to "/ideas/proposed/retry-cap"
      Then the write is allowed

    Scenario: Writing /kernel from the sandbox is forbidden              # THE done criterion (refuse)
      Given an active /evolve run on cell "createOrder"
      When the run writes to "/kernel/createOrder.operation"
      Then the write is blocked with BlockReason code "SANDBOX_WRITE_ESCAPES_ZONE"
      And how_to_fix contains "open_a_/goal_to_promote_a_candidate"
      When the run writes to "/fitness/createOrder.budget"
      Then the write is blocked with BlockReason code "SANDBOX_WRITE_ESCAPES_ZONE"
      When the run writes to "/authority/createOrder"
      Then the write is blocked
      When the run writes to "/mirrors/above/createOrder.feature"
      Then the write is blocked

    Scenario: A variant with a green mirror can be promoted             # THE done criterion (QD promotion)
      Given a variant "var-7" with mirror_green, out_of_sample_green and authority_approval
      When the run proposes its promotion into niche "createOrder/discount"
      Then a promotion proposal is produced for niche "createOrder/discount"
      And the sandbox did NOT write the kernel, a mirror, authority or fitness

    Scenario: A variant with a RED mirror is NOT promoted, whatever its score   # the anti-Goodhart anchor
      Given a variant "var-9" with mirror RED but a higher backtest score
      When the run proposes its promotion
      Then the promotion is refused (promotion needs a green mirror)
      And the Judge is the deterministic mirror, never an LLM scoring its own copy

    Scenario: A variant passing the mirror but failing out-of-sample is NOT promoted
      Given a variant "var-3" with mirror_green but out_of_sample RED
      When the run proposes its promotion
      Then the promotion is refused (out-of-sample is the honest signal, never in-sample)
  ```

- **Sandbox fixture** (`cert_language: fixture`, `authority: above`) — `state → command → events` over `Confine`/`Promote`/`Evolve`: `write(/branches/evolution/...) → Allowed`; `write(/reports/...) → Allowed`; `write(/ideas/proposed/...) → Allowed`; `write(/kernel/...) → Refused(SANDBOX_WRITE_ESCAPES_ZONE)`; `write(/mirrors/above/...) | write(/authority/...) | write(/fitness/...) → Refused`; `promote(variant{mirror_green, out_of_sample_green, authority_approval}) → Promoted (proposal, no kernel/mirror/authority/fitness write)`; `promote(variant{mirror_red}) → Refused`; `promote(variant{mirror_green, out_of_sample_red}) → Refused`; `Evolve(cell, budget, sampler) → run that emits only branches/reports/ideas`.

- **Invariant (∀) — `rapid` property test (Go), `authority: below`, computational:**

  ```
  # reflects: runtime.evolve Confine/Promote/Evolve · test_kind: property · cert_language: rapid · authority: below
  ∀ write path under can_write {/branches/evolution, /reports, /ideas/proposed}:  Confine ⇒ Allowed
  ∀ write path under cannot_write {/kernel, /mirrors/above, /authority, /fitness} (or outside can_write):  Confine ⇒ Refused(SANDBOX_WRITE_ESCAPES_ZONE)
  ∀ Evolve run:  every emitted write path is under can_write — the loop NEVER governs (no kernel/mirror/authority/fitness write)
  ∀ variant with mirror != green:  Promote ⇒ Refused  (promotion needs a green mirror — the gate is binary, never the score)
  ∀ variant with out_of_sample != green OR without authority_approval:  Promote ⇒ Refused  (out-of-sample, never in-sample; the human approves)
  ∀ Promote ⇒ Promoted:  it is a PROPOSAL — it never writes kernel/mirror/authority/fitness itself
  ∀ Confine/Promote/Evolve:  deterministic — same (inputs, seed, budget, now) ⇒ same result (clock/RNG passed in, never read from ambient)
  ∀ Promote/Evolve:  it never invents a niche, a fitness, or an approval — every output traces to a real input variant/evidence
  ∀ malformed write/variant:  Confine/Promote yield a verdict, never panic
  ```

All start **red** (no `evolve` package, no `Confine/Promote/Evolve`, no sandbox-confinement hook, no `evolve`/`backtester` MCP, no `/evolve` skill, no `/evolution-sandbox` route). That red **is** the `/goal`. The canonical done case is green only when a write to `/branches/evolution` is allowed, a write to `/kernel` (and `/fitness`/`/authority`/`/mirrors/above`) is blocked with `SANDBOX_WRITE_ESCAPES_ZONE`, and a green-mirror + out-of-sample-green + authority-approved variant yields a promotion proposal while a red-mirror variant (however high its score) does not — i.e. **`/evolve` writes only branches/reports/ideas, and QD promotion needs a green mirror.** The fixtures are **means-tests toward the human red**, not new truths the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/evolution-sandbox/page.tsx` (new route `/evolution-sandbox`; do **not** touch existing routes). A read-only "Evolution Sandbox" panel, reading via the SELECT-only role: (1) the **quarantine write ledger** — the allowed write list under `/branches/evolution`, `/reports`, `/ideas/proposed` (each green), and an attempted write to `/kernel` (and `/fitness`/`/authority`/`/mirrors/above`) rendered **red** with its `BlockReason` (`SANDBOX_WRITE_ESCAPES_ZONE` + `how_to_fix`); (2) the **MAP-Elites niche grid** of the run — one élite per niche; (3) the **promotion gate** for each candidate — three lit/unlit pills `mirror_green` / `out_of_sample_green` / `authority_approval`, a candidate promotable only when all three are lit, and a red-mirror candidate shown **not promotable** whatever its score, each promotion labelled "PROPOSAL — promotion to truth needs /goal (the sandbox proposes, it does not govern)". Reads the verdict; renders it, does not re-implement `Confine`/`Promote`/`Evolve`.
- **Playwright e2e:** `tests/e2e/evolution-sandbox.spec.ts` — navigate to `/evolution-sandbox`, assert a `/branches/evolution/...` write is shown **allowed** while a `/kernel/...` write is shown **blocked** with `SANDBOX_WRITE_ESCAPES_ZONE` and a `how_to_fix`; assert a candidate with all three gate pills lit shows a **PROPOSAL** card stating promotion needs `/goal`, and a candidate with a **RED** mirror (but a higher score) shows **not promotable** (the done criterion visible in the UI). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/evolve/**`, the new `back/hooks/<sandbox-confinement>/**`, the new `back/mcp/evolve/**` and `back/mcp/backtester/**`, the new `.claude/skills/evolve/**`, the `mirrors`-stored feature/fixture/property materialized to `tests/`, `tests/e2e/evolution-sandbox.spec.ts`, and `front/web/app/evolution-sandbox/**` — and otherwise **adds new files**. It introduces new contracts (the `EvolutionSandbox` AST + `Confine`/`Promote`/`Evolve`, the `SANDBOX_WRITE_ESCAPES_ZONE` / `SANDBOX_CANNOT_GOVERN` `BlockReason` codes, the promotion-proposal shape) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes; it **reuses** the `ideas`/`dag`/`changesets` schemas without forking them and **never** writes `kernel`/`mirrors/above`/`authority`/`fitness` (the wall, §2, and the §66.1 `cannot_write` set are the same wall). Any change to a **prior contract** it depends on — the S26 QD niche/élite shape and the consumed fitness reading, the S20 ChangeSet write-path, the S23 stable-phase/branch node shape, the `ideas` record (S27/S28), the wall GRANT set, the `BlockReason` shape (KRD §44.5) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** (S21) on the affected schema/mirror, never an in-place edit. A promotion is a *proposed* ChangeSet that becomes truth only through the human `/goal` freeze (mirror_green ∧ out_of_sample_green ∧ authority_approval) — the sandbox never bypasses that door. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S42 — "EvolutionSandbox: /evolve writes only branches/reports/ideas;
QD promotion needs a green mirror". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed;
the agent has NO write grant to kernel/mirrors/authority/fitness), front=Next.js (the Workbench). Home =
back/runtime/evolve ONLY (plus the back/hooks/ sandbox-confinement binary, back/mcp/evolve, back/mcp/backtester,
and the .claude/skills/evolve gesture). Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §66.1 (EvolutionSandbox — "l'évolution explore, elle ne gouverne pas" ;
toute boucle /evolve tourne en QUARANTAINE ; can_write = {/branches/evolution, /reports, /ideas/proposed} ;
cannot_write = {/kernel, /mirrors/above, /authority, /fitness} ; promotion.requires = {mirror_green,
out_of_sample_green, authority_approval} ; "elle peut produire candidats, branches, scores, hypothèses,
suggestions ; elle ne peut PAS produire vérités, approbations, exceptions ou droits"), §62 algorithm ② + the
two insights (the medium loop: échantillonne l'archive y compris des stepping stones faibles ; self-play
Proposer/Solver OU mutation AlphaEvolve génère la variante ; la FITNESS que la boucle NE PEUT PAS éditer =
kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample ; un élite par niche MAP-Elites ; PROMOTION sous
cliquet — un champion ne remplace QUE s'il bat en out-of-sample ; "le seul vrai danger d'un système
auto-améliorant : il note sa propre copie" → la fitness doit être NON-éditable par la boucle ; AUCUNE boucle
n'édite sa propre fitness), §64 (la fitness à DEUX étages : gate binaire = le MIROIR, passe ou meurt, l'ancre
non-gameable above the line ; puis classement continu = les budgets ; sans le gate l'évolution optimise la
vitesse en cassant la vérité = overfit ; le bicaméral EST ce gate), §66 (self-play : Proposer/Solver/Judge ;
POINT CRITIQUE : le Judge n'est PAS un LLM qui note sa propre copie — c'est le miroir déterministe), §66.2
(CellVitality = DIAGNOSTIC, jamais une fitness de promotion — "elle ne valide jamais une variante"), §87 (la
vérité brutale : in-sample Sharpe ≈ pouvoir prédictif nul out-of-sample ; marché adversarial/non-stationnaire ;
out-of-sample + walk-forward est le seul signal honnête ; KRD transforme l'auto-évolution d'une machine à
Goodhart en recherche ouverte bornée et ancrée au réel — tout évolue SAUF la définition du vrai). Read
CONTEXT-MAP.md + back/runtime/CONTEXT.md (harnais, /evolve = la boucle moyenne self-play+QD, la zone /spike
cliquet OFF, le mur/wall, cliquet forward-only, fitness non-gameable, stepping stone, MAP-Elites, "le Juge est
le miroir, jamais un LLM") and the prior steps' specs (S26 ArchiveCurationPolicy + QD niches/élites + the
anchored fitness it consumes, S28 /spike+/harvest exploration gestures, S20 ChangeSet write-path, S23
stable-phase/branch node, S27/S28 the ideas record, S13 BlockReason). For any Next.js 16, Go MCP SDK, Godog, or
rapid API doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language against back/runtime/CONTEXT.md and KRD §66.1/§62/§64/§66/§87: the "EvolutionSandbox" is the
    QUARANTINE every /evolve run executes in — it can_write ONLY {/branches/evolution, /reports,
    /ideas/proposed} (candidates, branches, scores, hypotheses, suggestions) and cannot_write {/kernel,
    /mirrors/above, /authority, /fitness} (truths, approvals, exceptions, rights) ; "the evolution explores, it
    does NOT govern". "Promotion" into a QD niche requires mirror_green ∧ out_of_sample_green ∧
    authority_approval — a binary GATE (the deterministic MIROIR), never a score the loop grades itself ; the
    Judge is the mirror, never an LLM scoring its own copy ; a champion replaces a niche élite ONLY if it beats
    it OUT-OF-SAMPLE (never in-sample). This step delivers the SANDBOX + the promotion GATE + the medium-loop
    orchestration SHAPE over an already-populated QD archive — NOT the QD niche/curation engine (S26, consumed),
    NOT the fitness definition (consumed: kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample), NOT the
    /goal freeze (a separate human gesture that promotion only PROPOSES), NOT a real LLM/self-play generation
    model, NOT real market data, NOT CellVitality as a promotion fitness (§66.2: diagnostic only). Do NOT use
    "sandbox" as a synonym for the /spike zone (S28: /spike is the manual throwaway idea-exploration zone ;
    the EvolutionSandbox is the quarantine of the AUTOMATED medium loop). Do NOT use "evolve" as "auto-write the
    kernel". Resolve every branch before coding. If a term shifts, update CONTEXT.md / write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Three artifacts, by nature:
      - Journey Gherkin .feature (test_kind: gherkin, cert_language: godog, authority: above), reflecting §66.1
        / §62 ②. Scenarios: a write to "/branches/evolution/...", "/reports/...", "/ideas/proposed/..." is
        ALLOWED (THE done criterion: a candidate branch is allowed) ; a write to "/kernel/...", "/fitness/...",
        "/authority/...", "/mirrors/above/..." is BLOCKED with BlockReason code SANDBOX_WRITE_ESCAPES_ZONE
        (how_to_fix points at confining + opening a /goal) (THE done criterion: writing /kernel is forbidden) ;
        a variant with mirror_green ∧ out_of_sample_green ∧ authority_approval yields a PROMOTION PROPOSAL into
        its niche and the sandbox did NOT write kernel/mirror/authority/fitness (THE done criterion: promotion
        needs a green mirror) ; a RED-mirror variant with a HIGHER score is NOT promoted (the anti-Goodhart
        anchor — the Judge is the mirror, never the score) ; a mirror_green-but-out_of_sample_RED variant is
        NOT promoted (out-of-sample is the honest signal, never in-sample).
      - Sandbox fixture (cert_language: fixture, authority: above): state→command→events over Confine/Promote/
        Evolve — allowed writes under can_write ; refused writes under cannot_write with SANDBOX_WRITE_ESCAPES_
        ZONE ; promote(green ∧ oos-green ∧ approved) → Promoted proposal (no truth write) ; promote(mirror_red)
        → Refused ; promote(green, oos_red) → Refused ; Evolve emits only branches/reports/ideas.
      - property invariant (rapid, authority: below): every can_write path ⇒ Allowed ; every cannot_write /
        outside path ⇒ Refused(SANDBOX_WRITE_ESCAPES_ZONE) ; every Evolve-emitted write is under can_write (the
        loop never governs) ; mirror != green ⇒ Promote Refused ; out_of_sample != green OR no authority_approval
        ⇒ Refused ; a Promoted result is always a PROPOSAL (never writes truth itself) ; Confine/Promote/Evolve
        deterministic (seed/budget/now passed in, never read from ambient) ; never invents a niche/fitness/
        approval ; never panics on malformed input.
    Run them; watch them go RED (no evolve package, no Confine/Promote/Evolve, no sandbox-confinement hook, no
    evolve/backtester MCP, no /evolve skill, no /evolution-sandbox route). That red IS the /goal. Do NOT write a
    truth-test you would then satisfy (no inventing a new sandbox zone or a new fitness you'd grade yourself) —
    mirror the human intention only (writing /kernel is forbidden ; a branch is allowed ; promotion needs a
    green mirror) ; the fixture is a means-test toward the human red.

(c) TDD red → green → refactor, in back/runtime/evolve ONLY (plus the back/hooks/ sandbox-confinement binary,
    back/mcp/evolve, back/mcp/backtester). Outside-in. Build: the typed EvolutionSandbox AST EXACTLY as §66.1
    declares (can_write {/branches/evolution, /reports, /ideas/proposed} ; cannot_write {/kernel, /mirrors/above,
    /authority, /fitness} ; promotion.requires {mirror_green, out_of_sample_green, authority_approval}) — the
    zones and gate are DECLARED, not learned ; a pure Confine(write{path}) → Allowed|Refused(BlockReason) ; a
    pure Promote(variant, evidence) → Promoted(proposal)|Refused that admits a variant ONLY IF mirror_green ∧
    out_of_sample_green ∧ authority_approval and NEVER itself writes kernel/mirror/authority/fitness ; a pure
    Evolve(cell, budget, sampler) → run that samples the archive (stepping stones included), records the variant
    + its CONSUMED non-gameable fitness reading + its niche, and emits ONLY branches/reports/ideas — no I/O, no
    time.Now()/rand read from ambient (seed/budget/now are parameters), no learned thresholds. REUSE S26's QD
    niche/élite shape and the prior anchored fitness — do NOT redefine or fork them. Within the frozen slots, if
    a REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (Godog, rapid, the fixture/Operation-DSL interpreter, sqlc/pgx, the Go MCP SDK, Go hook
    binaries are FIXED). Likely genuine choices: the promotion-proposal shape (a candidate that a later /goal can
    freeze, carrying its mirror/oos/authority evidence) and how the sandbox-confinement hook learns a run is
    active (injected — do NOT reach into kernel/mirrors). Record a short ADR (docs/adr/) ONLY if a genuine choice
    is made (e.g. the promotion-proposal shape, or the backtester out-of-sample evidence contract). GRANT the
    agent role NO write on kernel/mirrors/authority/fitness ; the evolve MCP (aidos CLI role) writes only
    ideas/dag under can_write ; the backtester MCP only reads/evaluates out-of-sample (it does NOT define the
    fitness). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the Godog journey, the
    fixture, the rapid property, the hook's fault-injection test, biome check at the monorepo root, eslint in
    front/web. Self-certify on the COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Confine on each can_write /
    cannot_write path, Promote on green ∧ oos-green ∧ approved / mirror_red / green-but-oos_red, and Evolve
    emitting only branches/reports/ideas ; state the cause, propose. Check completeness: the EvolutionSandbox
    layer has its living mirror and each required test_kind is present (KRD §33); no monster (no sandbox zone or
    gate branch without a scenario/fixture row ; no promotion claimed without the mirror_green ∧ oos_green ∧
    authority_approval gate ; no truth/approval/right ever written by the loop) — else Stop blocks. Do not finish
    a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/evolution-sandbox/ →
    /evolution-sandbox: render (SELECT-only role) the quarantine write ledger (allowed writes under
    /branches/evolution, /reports, /ideas/proposed in green ; an escaping /kernel (and /fitness//authority/
    /mirrors/above) write rendered RED with SANDBOX_WRITE_ESCAPES_ZONE + how_to_fix), the MAP-Elites niche grid
    (one élite per niche), and the promotion gate per candidate (three pills mirror_green / out_of_sample_green /
    authority_approval — promotable only when all three lit ; a red-mirror candidate shown NOT promotable
    whatever its score ; each promotion labelled "PROPOSAL — promotion to truth needs /goal"). Read the verdict;
    render it, do not re-implement Confine/Promote/Evolve. Do NOT touch existing routes. Add
    tests/e2e/evolution-sandbox.spec.ts (use the playwright-e2e skill) asserting the allowed /branches/evolution
    write vs the blocked /kernel write with SANDBOX_WRITE_ESCAPES_ZONE, the all-three-pills-lit candidate showing
    a PROPOSAL needing /goal, and the red-mirror candidate (higher score) shown NOT promotable.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that evolve is
    a deep, well-named module (Confine/Promote/Evolve + the EvolutionSandbox AST + the can_write/cannot_write/
    promotion.requires sets obvious) ; that Confine/Promote/Evolve are pure and REUSE S26's QD niche/élite shape
    and the prior anchored fitness without duplicating or redefining them ; that the sandbox-confinement hook,
    the evolve MCP, and the backtester MCP each own exactly one concern ; that the wall stays intact (no
    kernel/mirrors/authority/fitness write by the loop or the agent role ; ideas/dag written only via the
    MCP/CLI role) ; that the §66.1 cannot_write set and the §2 wall are the SAME wall ; boundaries match
    back/runtime/CONTEXT.md (the EvolutionSandbox explores, the freeze/mirror/authority are Kernel-owned and out
    of reach). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic), the sandbox-confinement hook
    (non-bypassable rule — with its fault-injection test, §5 hook honesty), the evolve MCP + the backtester MCP
    (capabilities), the /evolve Skill (repeatable gesture — with the §75 Honesty-rules section), the journey
    feature + fixture + property (behaviour proof), and the Next route (visualization). Do NOT add a new Postgres
    schema (reuse ideas/dag/changesets), do NOT write /goal / freeze / mirror / authority / fitness (a separate
    human gesture promotes a candidate), and do NOT redefine the QD niche/curation engine (S26) or the fitness
    (consumed). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The sandbox zones are EXACTLY can_write
  {/branches/evolution, /reports, /ideas/proposed} / cannot_write {/kernel, /mirrors/above, /authority,
  /fitness} and the promotion gate is EXACTLY {mirror_green, out_of_sample_green, authority_approval} (KRD
  §66.1) — do not coin a fourth zone, a fourth gate condition, or a fitness §62/§64 does not state. If a
  BlockReason code, the promotion-proposal shape, the QD niche/élite shape, the consumed fitness reading, the
  backtester out-of-sample evidence contract, or the run-active signal the hook needs is not pinned by KRD /
  S26 / S13 / an existing migration / CONTEXT.md / an ADR, do NOT guess — record an OpenQuestion (provenance)
  and STOP on that branch. The example ids (var-7, createOrder, createOrder/discount) are illustrative; reuse
  pinned artifacts from S26/S23/S11 where a real id is needed, do not coin new business ids.
- You NEVER write a truth-test (a new sandbox zone or fitness you would then satisfy — the circularity). The
  journey feature, fixture and property are means-tests toward the human red (writing /kernel is forbidden ; a
  branch is allowed ; promotion needs a green mirror), not new truths. The Judge is the deterministic mirror,
  never an LLM (and never CellVitality, §66.2) scoring a variant into a niche ; out-of-sample, never in-sample
  (§87).
- Any change to a prior contract (S26 QD niche/élite + fitness, S20 ChangeSet write-path, S23 stable-phase/
  branch node, the ideas record, the wall GRANTs, the BlockReason shape) goes through a ChangeSet (S20) +
  SemanticDiff (S21). Add new files; never silently rewrite a prior artifact, never hand-edit back/gen/**. The
  loop NEVER writes kernel/mirrors/authority/fitness ; a promotion is a PROPOSAL the human /goal freezes. An
  override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the journey feature passes — a write to /branches/evolution (and /reports,
/ideas/proposed) is ALLOWED, a write to /kernel (and /fitness//authority//mirrors/above) is BLOCKED with
SANDBOX_WRITE_ESCAPES_ZONE (how_to_fix points at confining + /goal), a variant with mirror_green ∧
out_of_sample_green ∧ authority_approval yields a PROMOTION PROPOSAL while a RED-mirror variant (however high
its score) and a mirror_green-but-out_of_sample_red variant are NOT promoted, and the sandbox never wrote the
kernel/mirror/authority/fitness (THE done criteria: /evolve writes only branches/reports/ideas ; writing /kernel
is forbidden ; QD promotion needs a green mirror) ; the fixture and the rapid invariant hold (every can_write ⇒
Allowed, every cannot_write ⇒ Refused, the loop never governs, mirror!=green ⇒ no promotion, oos!=green or no
approval ⇒ no promotion, a Promoted result is always a proposal, determinism with seed/budget/now passed in, no
invented niche/fitness/approval, no panic) ; the sandbox-confinement hook's fault-injection test goes red when
an active /evolve run writes to /kernel and to /fitness ; /evolution-sandbox renders the quarantine ledger + the
blocked write + the niche grid + the three-pill promotion gate with a passing Playwright e2e ; GRANTs prove no
loop/agent-role write on kernel/mirrors/authority/fitness, ideas/dag written only via the MCP/CLI role. You
cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (evolution-in-quarantine journey Gherkin/Godog, sandbox fixture, rapid property),
  where stored (mirrors schema) and materialized (tests/); the sandbox-confinement fault-injection test.
- Tests run: command + pass/fail counts (Godog journey, fixture, rapid/go test, hook fault-injection, biome,
  eslint, playwright).
- UI route: /evolution-sandbox — what it renders (the quarantine write ledger, the blocked escaping write, the
  MAP-Elites niche grid, the three-pill promotion gate + PROPOSAL card), e2e file + result.
- ChangeSet status: none expected (this step adds new files and reuses ideas/dag/changesets); any prior-contract
  change → ChangeSet + SemanticDiff (note the change_type), else "none". A promotion is a PROPOSED ChangeSet the
  human /goal freezes — never an agent write.
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. sandbox + gate + orchestration shape only (no real LLM/self-play generation model, no real
  market data — generator and backtest behind the MCP), QD niche/curation engine consumed from S26, fitness
  consumed (kernel_red_to_green ⊕ sensors_computational ⊕ out_of_sample) not invented, CellVitality not used as
  a promotion fitness (§66.2), no /goal freeze yet, the confinement hook reads an injected run-active signal
  (not kernel/mirrors), BlockReason codes supported (SANDBOX_WRITE_ESCAPES_ZONE, SANDBOX_CANNOT_GOVERN).
- Next safe step: the smallest stable next tooth (e.g. the /goal gesture that promotes a sandbox candidate by
  writing its mirror + freezing it under an approved ChangeSet with authority approval, or the reality/external
  loop ③ that lets a production incident write the kernel) and why it is safe to chain.
```
