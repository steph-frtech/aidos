# S28 — Exploration gestures (`/grill` · `/spike` · `/harvest`): a fuzzy idea spikes, harvest yields a DRAFT Truth

Subsystem: AIDOS Runtime | Home: `back/runtime/exploration` | Workbench route: `/exploration`

## Objectif

Land the three **exploration gestures** of the idea entry-stage as a Runtime capability: `/grill` challenges an Idea's intention above the wall, a **fuzzy** (not-yet-falsifiable) intention is routed to `/spike` — a **ratchet-OFF, T0, throwaway** zone whose writes are confined to `/spike` only — and `/harvest` extracts the discovered intention from a spike and proposes a kernel delta as a **DRAFT Truth** (a candidate, never a frozen, mirrored truth). This makes "how a vague idea becomes a falsifiable candidate" a typed, traceable gesture machine over the `Idea` lifecycle (`draft → grilled → spiking → harvested`, KRD §75, §118), instead of a prompt that jumps straight to the kernel.

## Sortie attendue

Per CLAUDE.md §5 this step needs **three repeatable gestures** (Skills), **pure logic** (Go package), a **non-bypassable rule** (the spike-confinement Go hook), a **capability** (the gestures MCP server), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new Postgres schema (it reuses the existing `ideas` schema) nor any codegen (justified below).

- **Go package** `back/runtime/exploration/` — the pure gesture engine over the `Idea` record (KRD §118: `proposes`, `intent`, `provenance: human|incident`, `status: draft|grilled|spiking|harvested|rejected`; **no version-freeze, no mirror** — that is exactly what separates an Idea from a Truth). Pure functions, no I/O:
  - `Grill(idea, verdict) → idea'` — challenges the intention in N0, above the wall: `draft → grilled` when the intention is sharp/falsifiable, `draft → spiking` when it is **fuzzy** (routes to `/spike`), `draft → rejected` when it is a bad idea (a **traced** rejection, KRD §118 mermaid). `/grill` writes to the `ideas` zone only; it **never** touches the kernel.
  - `Spike(idea) → idea'` plus a `SpikeWrite{path}` validation — enters the **ratchet-OFF** exploration zone at **rigor T0** (KRD §84: "cliquet OFF ; zone `/spike` ; KRD serait net-négatif ici"). The spike is **throwaway**, it does **not** graduate directly to the kernel (KRD §60.x steady-state-discovery rule: "pas de graduation directe"). Every write a spike performs is asserted to fall under the `/spike` prefix only; a write outside `/spike` is refused with a `BlockReason`.
  - `Harvest(idea, discovered) → (idea', draftTruthProposal)` — extracts the discovered intention from a spike and produces a **kernel-delta proposal** marked **DRAFT** (the `harvested` status): a candidate truth that still has **no frozen version and no mirror**. Harvest **proposes** a delta; it does **not** freeze, does **not** write the kernel, and does **not** write a mirror — promotion to truth is a later, separate gesture (`/goal` writes the mirror = the freeze, KRD §118, §132). The AI may draft, the human approves, never the inverse (KRD §60.x).
  - Pure functions only; the persistence of the `Idea` row and the proposal goes through the MCP/CLI write-grant, never the agent role (the wall, §2).
- **Three Skills** (`SKILL.md` each, per §5 — repeatable orchestrated gestures): `.claude/skills/grill/`, `.claude/skills/spike/`, `.claude/skills/harvest/`. Each carries the §75 forced-**Honesty rules** section (never invent a `target`/`targetId`/business-rule/DeltaSpec entry; surface uncertainty as an **OpenQuestion** in provenance). `/grill` reuses the existing `grill-with-docs` discipline; `/spike` opens the ratchet-OFF zone; `/harvest` emits the DRAFT-Truth proposal. (Note: `grill-with-docs` already exists as a session skill; this step's `grill/` skill is the AIDOS-internal gesture that records the Idea-status transition and provenance, distinct from the doc-grilling session — record an ADR if the two are merged.)
- **Go hook** `back/hooks/pretooluse/` (or a dedicated `spike-confinement` binary under `back/hooks/`) — the **non-bypassable confinement rule**: while an Idea is `spiking` (ratchet OFF, T0), every file/DB write the agent attempts is **refused unless its path is under `/spike`** (the spike is throwaway and must not leak into `/kernel` or `/src`), returning an actionable `BlockReason` (`code: SPIKE_WRITE_ESCAPES_ZONE`, `severity`, `explanation`, `how_to_fix: ["confine_write_to_/spike", "run_/harvest_to_propose_a_kernel_delta"]`). It also refuses any attempt by `/harvest` to write the kernel or a mirror directly (harvest **proposes**, the human freezes via `/goal`): `code: HARVEST_CANNOT_FREEZE`. Per §5 hook honesty it ships with a **fault-injection test**: have a spiking session attempt a write to `/kernel` and assert the hook goes red and blocks.
- **MCP server** `back/mcp/idea-intake/` (Go MCP SDK, one tool = one backend op) — the capability door, carrying the `aidos` CLI write-grant on the `ideas` schema (the agent role never writes truth or ideas directly): `idea_grill` (records the `draft→grilled|spiking|rejected` transition + verdict + provenance), `idea_spike` (records `→ spiking`, opens the ratchet-OFF zone), `idea_harvest` (records `→ harvested`, persists the **DRAFT-Truth proposal** as a candidate delta — no freeze, no mirror), `idea_get`, `idea_list`. The Workbench and other gestures call these.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — a **journey/acceptance Gherkin `.feature`** (`test_kind: gherkin`, `cert_language: godog`, `authority: above`) for the canonical fuzzy-idea-through-the-gestures flow, **plus** an `Idea`-status-machine **fixture** (`test_kind: fixture`, `state → command → events`) and a **rapid property** (`authority: below`) on the gesture machine. These **are** the done criteria (see below).
- **Next route** `front/web/app/exploration/` → `/exploration` — the Workbench "Grill & Spike Lab" panel (KRD §3227 tree) rendering an Idea travelling `draft → grilled → spiking → harvested`, the ratchet-OFF / T0 badge on the spike zone, the confinement `BlockReason` on an escaping write, and the harvested **DRAFT-Truth proposal** card (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new Postgres schema** — the `Idea` record already lives in the `ideas` schema (CLAUDE.md §1, KRD §118); this step reuses it, it does not fork an `exploration` schema (record an OpenQuestion if a column is genuinely missing). **No `/goal` / freeze / mirror writing** — promotion of a DRAFT Truth to a frozen, mirrored kernel truth is a **separate later gesture** (`/goal` writes the mirror = the freeze); harvest stops at a *proposal*. **No `/evolve` / self-play / QD archive** — the medium loop on a cell is a later Runtime step; here `/spike` is the manual, throwaway exploration zone only. **No codegen** — there is no projection to emit from an Idea or a spike.

## Test minimal (done)

**Done = a fuzzy idea is routed to `/spike` (ratchet OFF, T0, writes confined to `/spike`), and `/harvest` produces a DRAFT Truth (a kernel-delta proposal with no freeze and no mirror).** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Exploration journey** — Gherkin `.feature` (`cert_language: godog`, `authority: above`), reflecting the §118 idea lifecycle:

  ```gherkin
  # mirrors schema · reflects: ideas.idea lifecycle (grill/spike/harvest) · test_kind: gherkin · authority: above
  Feature: A fuzzy idea spikes, harvest yields a DRAFT Truth

    Scenario: A fuzzy intention is routed to /spike (ratchet OFF, T0)
      Given an Idea { intent: "something about smarter retries, not sure how", provenance: human, status: "draft" }
      When I grill it and the intention is fuzzy (not yet falsifiable)
      Then the Idea status becomes "spiking"
      And the spike zone is ratchet OFF at rigor T0
      And the verdict and provenance are recorded

    Scenario: A spike's writes are confined to /spike
      Given an Idea with status "spiking"
      When the spike writes to "/spike/retry-probe.go"
      Then the write is allowed
      When the spike writes to "/kernel/retry.policy"
      Then the write is blocked with BlockReason code "SPIKE_WRITE_ESCAPES_ZONE"
      And how_to_fix contains "confine_write_to_/spike"

    Scenario: Harvest produces a DRAFT Truth (proposal, not a freeze)
      Given an Idea with status "spiking" whose spike discovered "retry with capped exponential backoff"
      When I harvest it
      Then the Idea status becomes "harvested"
      And a DRAFT-Truth proposal is produced (a kernel-delta candidate)
      And the proposal has NO frozen version and NO mirror
      And harvesting did NOT write the kernel or a mirror

    Scenario: A sharp intention skips /spike
      Given an Idea { intent: "checkout must accept a promo code", provenance: human, status: "draft" }
      When I grill it and the intention is sharp (falsifiable)
      Then the Idea status becomes "grilled"

    Scenario: A bad idea is rejected and traced
      Given an Idea with status "draft"
      When I grill it and it is a bad idea
      Then the Idea status becomes "rejected"
      And the rejection is recorded with its provenance
  ```

- **`Idea`-status-machine fixture** (`cert_language: fixture`, `authority: above`) — `state → command → events` over the lifecycle: `draft --grill(sharp)--> grilled`; `draft --grill(fuzzy)--> spiking`; `draft --grill(bad)--> rejected`; `spiking --harvest--> harvested + DraftTruthProposal`; with each transition emitting the verdict + provenance and **no** version/mirror ever attached to an Idea.
- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any sequence of `grill / spike / harvest` commands, the only reachable Idea statuses are exactly `{draft, grilled, spiking, harvested, rejected}` (a closed set — no invented sixth status); an Idea **never** carries a frozen version or a mirror (the Idea↔Truth distinction holds for every reachable state); while `spiking`, **every** write path is under `/spike` or is refused (confinement holds for all paths); `harvest` of a `spiking` Idea **always** yields a `harvested` status **and** a proposal that is DRAFT (no freeze, no mirror) and **never** writes the kernel/mirror; a `rejected` Idea is terminal and records its provenance.

All start **red** (no `exploration` package, no `Grill/Spike/Harvest`, no spike-confinement hook, no `idea-intake` MCP, no `/exploration` route). That red **is** the `/goal`. The canonical done case is green only when a fuzzy idea grills to `spiking`, a spike write to `/kernel` is blocked with `SPIKE_WRITE_ESCAPES_ZONE` while a write to `/spike` is allowed, and harvesting yields `harvested` plus a DRAFT-Truth proposal carrying **no** frozen version and **no** mirror — i.e. **a fuzzy idea goes to spike; harvest produces a DRAFT Truth.**

## Visualisation UI

- **Workbench route:** `front/web/app/exploration/page.tsx` (new route `/exploration`, the "Grill & Spike Lab" of KRD §3227; do **not** touch existing routes). It renders an Idea travelling the lifecycle: a status track (`draft → grilled → spiking → harvested`, with `rejected` as a traced off-ramp), the **ratchet-OFF / T0** badge on the spike zone, the spike's confined write list with one escaping write rendered **red** (`SPIKE_WRITE_ESCAPES_ZONE` + `how_to_fix`), and the harvested **DRAFT-Truth proposal** card explicitly labelled "DRAFT — no frozen version, no mirror; promotion to truth needs /goal". Reads via the SELECT-only role; renders the fixture/feature outcome, does not re-implement the gesture machine.
- **Playwright e2e:** `tests/e2e/exploration.spec.ts` — navigate to `/exploration`, assert the fuzzy Idea shows status `spiking` with a `ratchet OFF` / `T0` badge; assert the spike write to `/spike/...` is shown allowed while the write to `/kernel/...` is shown blocked with `SPIKE_WRITE_ESCAPES_ZONE` and a `how_to_fix`; assert the harvested Idea shows status `harvested` with a DRAFT-Truth proposal card stating it has no frozen version and no mirror; assert a bad idea shows `rejected` with its provenance. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/exploration/**`, the new `back/hooks/<spike-confinement>/**`, the new `back/mcp/idea-intake/**`, the three new `.claude/skills/{grill,spike,harvest}/**`, the `mirrors`-stored feature/fixture/property materialized to `tests/`, `tests/e2e/exploration.spec.ts`, and `front/web/app/exploration/**` — and otherwise **adds new files**. It introduces new contracts (the gesture machine over `Idea`, the `SPIKE_WRITE_ESCAPES_ZONE` / `HARVEST_CANNOT_FREEZE` `BlockReason` codes, the DRAFT-Truth proposal shape) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; it **reuses** the existing `ideas` schema (KRD §118) without forking it and **never** writes the `kernel`/`mirrors`/`fitness` schemas (the wall, §2). Any change to a **prior contract** it depends on — the `Idea` record shape/`status` enum (KRD §118), the `ideas` schema, the wall GRANT set, the `BlockReason` shape (KRD §44.5), or the provenance link (KRD §41/§119) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** (S21) on the affected schema, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance). Note: a harvested DRAFT Truth is itself a *proposed* ChangeSet that only becomes truth through the human `/goal` freeze — harvest never bypasses that door.

## Prompt a lancer

```text
You are step-executor for AIDOS step S28 — "Exploration gestures (/grill /spike /harvest): a fuzzy idea
spikes, harvest yields a DRAFT Truth". Stack is FROZEN: back=Go, truth=Postgres (append-only,
content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the
Workbench). Home = back/runtime/exploration ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never
go prompt → code.

Read BEFORE touching anything: KRD.md §75 (the gestures: grill = challenge the intention in N0 ABOVE
the wall before freezing; spike = enter the exploration zone, cliquet OFF, jetable/throwaway; harvest =
extract the discovered truth from a spike → PROPOSE a kernel delta; plus the forced "Honesty rules"
section every spec skill carries — never invent business rules / targetIds / DeltaSpec entries, raise
uncertainty as an OpenQuestion), §118 (the Idea record: proposes, intent, provenance human|incident,
status draft|grilled|spiking|harvested|rejected, NO version-freeze and NO mirror — that is what
distinguishes an Idea from a Truth; and the lifecycle mermaid: grill →(fuzzy) spike → harvest → write
mirror = /goal = the freeze; grill →(clear) harvest; grill -.->(bad idea) traced rejection), §84
(rigueur graduée: T0 = spike, jetable, cliquet OFF, "KRD serait net-négatif ici"), §60.x steady-state
discovery ("troisième zone /spike, cliquet OFF ; l'intention découverte est récoltée dans le noyau via
/harvest puis re-construite — PAS de graduation directe"), §132 ("finalement je veux un code promo":
idea → /grill → (clear, no spike needed) → write the MIRRORS + freeze = /goal), §44.5 (BlockReason:
code, severity, explanation, how_to_fix[] — every refusal must be actionable), §41/§119 (provenance —
who wanted what, when, why). Read CONTEXT-MAP.md + back/runtime/CONTEXT.md (harnais, skill/geste,
hook = one of the five mechanical guardrails, the wall/mur, cliquet = forward-only, "tracer bullet ≠
spike"). For any Next.js 16, Go MCP SDK, Godog, or rapid API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/runtime/CONTEXT.md and KRD §75/§118: an "Idea" is the entry-stage
    candidate-truth with NO freeze and NO mirror; "/grill" CHALLENGES the intention above the wall and
    routes it (sharp → grilled ; fuzzy → spiking ; bad → rejected, traced); "/spike" is the ratchet-OFF,
    T0, THROWAWAY exploration zone whose writes are confined to /spike and which does NOT graduate
    directly to the kernel; "/harvest" EXTRACTS the discovered intention and PROPOSES a kernel delta as a
    DRAFT Truth — a candidate that still has no frozen version and no mirror, NOT a freeze (the freeze is
    a separate later /goal gesture that writes the mirror). Do NOT use "spike" as a synonym for "tracer
    bullet / walking skeleton" (CONTEXT.md _Avoid_ list — a tracer bullet is a real end-to-end wiring;
    a spike is throwaway). Do NOT use "skill" as "command/macro/agent". Resolve every branch before
    coding — especially: fuzzy vs sharp grill verdict; spike confinement to /spike; harvest PROPOSES,
    never freezes/writes-the-kernel/writes-a-mirror; the Idea status set is closed (no invented sixth
    status). If a term shifts, update CONTEXT.md / write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for
    the runner. Three artifacts, by nature:
      - Exploration journey Gherkin .feature (test_kind: gherkin, cert_language: godog, authority:
        above), reflecting the §118 idea lifecycle. Scenarios: fuzzy intention → status "spiking" with
        ratchet OFF / T0 and recorded verdict+provenance ; spike write to "/spike/..." allowed but write
        to "/kernel/..." blocked with BlockReason code SPIKE_WRITE_ESCAPES_ZONE (how_to_fix contains
        confine_write_to_/spike) ; harvest of a spiking idea → status "harvested" + a DRAFT-Truth
        proposal with NO frozen version and NO mirror, and harvest did NOT write the kernel/mirror (THE
        done case) ; sharp intention → "grilled" (skips spike) ; bad idea → "rejected", traced with
        provenance.
      - Idea-status-machine fixture (cert_language: fixture, authority: above): state→command→events
        over draft/grilled/spiking/harvested/rejected, each transition emitting verdict+provenance, no
        version/mirror ever attached to an Idea.
      - property invariant (rapid, authority: below): for any grill/spike/harvest sequence, reachable
        statuses are exactly {draft,grilled,spiking,harvested,rejected}; an Idea never carries a frozen
        version or a mirror; while spiking every write path is under /spike or is refused; harvest of a
        spiking idea always yields harvested + a DRAFT (no-freeze, no-mirror) proposal and never writes
        the kernel/mirror; rejected is terminal and records provenance.
    Run them; watch them go RED (no exploration package, no Grill/Spike/Harvest, no spike-confinement
    hook, no idea-intake MCP, no /exploration route). That red IS the /goal. Do NOT write a truth-test
    you would then satisfy — mirror the human intention only.

(c) TDD red→green→refactor, in back/runtime/exploration ONLY (plus the back/hooks/ spike-confinement
    binary and back/mcp/idea-intake/). Outside-in. REUSE the existing `ideas` schema and the Idea record
    shape (KRD §118) — do NOT fork an `exploration` schema; if a column is genuinely missing, raise an
    OpenQuestion, do not invent one. If a real tool choice arises WITHIN a frozen slot, search AT MOST 3
    current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog for the
    journey, rapid for the property, the fixture interpreter, sqlc/pgx, the Go MCP SDK, Go hook binaries
    are FIXED). The likely genuine choices: how the DRAFT-Truth proposal (a candidate kernel delta with
    no freeze/mirror) is represented so a later /goal can promote it; and how the spike-confinement hook
    learns the current Idea status (injected, do NOT reach into kernel/mirrors). Record a short ADR
    (docs/adr/) ONLY if a genuine choice is made (e.g. the DRAFT-Truth proposal shape, or merging the
    AIDOS `grill/` gesture with the existing grill-with-docs session skill). GRANT the agent role no
    write on kernel/mirrors/fitness; the idea-intake MCP (aidos CLI role) is the only writer of the
    `ideas` schema. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the Godog
    journey, the rapid property, biome check at the monorepo root, eslint in front/web, and the hook's
    fault-injection test. Self-certify on the COMPUTATIONAL only; never declare the behaviour green from
    tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce grill(sharp),
    grill(fuzzy), grill(bad), spike-write-in-zone, spike-write-escaping, harvest on each path; state the
    cause, propose. Check completeness: the exploration layer has its living mirror and each required
    test_kind is present (KRD §33); no monster (no gesture/status branch without a scenario or fixture
    row; no DRAFT-Truth proposal claimed without the no-freeze/no-mirror assertion) — else Stop blocks.
    Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/exploration/ →
    /exploration (the "Grill & Spike Lab", KRD §3227): an Idea travelling draft → grilled → spiking →
    harvested with rejected as a traced off-ramp; a ratchet-OFF / T0 badge on the spike zone; the spike
    write list with the /spike write allowed and the /kernel write rendered RED with
    SPIKE_WRITE_ESCAPES_ZONE + how_to_fix; and a harvested DRAFT-Truth proposal card explicitly labelled
    "DRAFT — no frozen version, no mirror; promotion needs /goal". Read via the SELECT-only role; render
    the fixture/feature outcome, do not re-implement the gesture machine. Do NOT touch existing routes.
    Add tests/e2e/exploration.spec.ts (use the playwright-e2e skill) asserting spiking + ratchet-OFF/T0,
    the allowed /spike write vs the blocked /kernel write with SPIKE_WRITE_ESCAPES_ZONE, the harvested
    DRAFT-Truth proposal (no version, no mirror), and the traced rejected idea.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    exploration is a deep, well-named module; that Grill/Spike/Harvest are pure and depend on the Idea
    record without duplicating it; that the spike-confinement hook and the idea-intake MCP each own
    exactly one concern; that the wall stays intact (no kernel/mirrors/fitness write, ideas written only
    via the MCP/CLI role); boundaries match back/runtime/CONTEXT.md (these are gestes/skills the harness
    performs; the freeze/mirror is Kernel-owned and out of reach). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic), the three Skills
    (.claude/skills/grill, /spike, /harvest — each with the §75 Honesty-rules section), the
    spike-confinement hook (non-bypassable rule — with its fault-injection test, §5 hook honesty), the
    idea-intake MCP server (capability), the journey feature + fixture + property (behaviour proof), and
    the Next route (visualization). Do NOT add a new Postgres schema (reuse the `ideas` schema), do NOT
    write /goal / freeze / mirror (a separate later gesture promotes a DRAFT Truth), and do NOT add
    /evolve / self-play / QD (a later Runtime step). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a BlockReason code, the Idea status enum,
  the DRAFT-Truth proposal shape, or the spike-confinement path rule is not pinned by KRD §75/§118/§84/
  §44.5 / the existing `ideas` schema / an ADR / CONTEXT.md, do NOT guess — record an OpenQuestion
  (provenance) and STOP on that branch. In particular: do NOT invent a sixth Idea status; do NOT make
  /harvest freeze or write the kernel/a mirror (it only PROPOSES a DRAFT Truth); do NOT treat a spike as
  a tracer bullet; do NOT reach into the kernel/mirrors schemas — inject the Idea status the hook needs.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The journey
  feature and the fixture are means-tests toward the human red, not new truths.
- Any change to a prior contract (the Idea record / status enum, the `ideas` schema, the wall GRANTs,
  the BlockReason shape, the provenance link) goes through a ChangeSet (S20) + SemanticDiff (S21). Add
  new files; never silently rewrite a prior artifact, never hand-edit back/gen/**.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster. Concretely: the journey feature passes — a fuzzy intention grills to "spiking"
with ratchet OFF / T0 and recorded provenance; a spike write to "/spike/..." is allowed while a write to
"/kernel/..." is blocked with SPIKE_WRITE_ESCAPES_ZONE (how_to_fix points at confining to /spike); a
harvest of a spiking idea yields "harvested" plus a DRAFT-Truth proposal carrying NO frozen version and
NO mirror, and harvest never wrote the kernel/mirror (THE done criteria: a fuzzy idea goes to spike;
harvest produces a DRAFT Truth); a sharp intention grills to "grilled" (skips spike); a bad idea is
"rejected" and traced; the rapid invariant holds (status set closed, no Idea ever carries a
version/mirror, spike writes confined, harvest always DRAFT and never writes truth, rejected terminal);
the spike-confinement hook's fault-injection test goes red when a spiking session writes to /kernel;
/exploration renders the lifecycle + the red blocked write + the DRAFT-Truth card with a passing
Playwright e2e; GRANTs prove no agent-role write on kernel/mirrors/fitness and ideas written only via
the MCP/CLI role. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (exploration journey Gherkin/Godog, Idea-status fixture, rapid property),
  where stored (mirrors schema) and materialized (tests/); the spike-confinement fault-injection test.
- Tests run: command + pass/fail counts (Godog journey, fixture, rapid/go test, hook fault-injection,
  biome, eslint, playwright).
- UI route: /exploration — what it renders (idea lifecycle track, ratchet-OFF/T0 spike badge, blocked
  escaping write, DRAFT-Truth proposal card), e2e file + result.
- ChangeSet status: none expected (this step adds new files and reuses the `ideas` schema); any
  prior-contract change → ChangeSet + SemanticDiff (note the change_type), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no /goal / freeze / mirror promotion of the DRAFT Truth yet, no /evolve /
  self-play / QD yet, spike-confinement hook reads an injected Idea status (not kernel/mirrors),
  provenance captured but the genealogical link to a future frozen truth is wired later, BlockReason
  codes supported (SPIKE_WRITE_ESCAPES_ZONE, HARVEST_CANNOT_FREEZE).
- Next safe step: the smallest stable next tooth (e.g. the /goal gesture that promotes a harvested
  DRAFT Truth by writing its mirror + freezing it through an approved ChangeSet, or /evolve on a cell)
  and why it is safe to chain.
```
