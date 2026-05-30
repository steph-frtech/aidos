# S43 — RealityMirror: telemetry/incident → Idea (with provenance); the kernel is never auto-modified

Subsystem: AIDOS Runtime | Home: `back/runtime/reality` | Workbench route: `/incidents-to-ideas`

## Objectif

Land the **RealityMirror** — the external loop (boucle ③, KRD §53/§67/§117) that turns a **prod incident or telemetry signal** into an **`Idea` draft** carrying `provenance: incident:#NNNN`, handed to the **S27 idea-intake** door, so reality becomes a *sensor that injects ideas*. The done invariant: **an incident becomes an idea draft; the kernel is NOT auto-modified** — a RealityMirror has no key to the kernel; promotion to truth still requires the human's `mirror + /goal + approval`.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (Go package), **a capability** (the `telemetry-reader` MCP server), **persistence** (Atlas migration for an `incidents` table), **a repeatable gesture** (the `/learn` Skill), a **behaviour proof** (BDD mirror), **telemetry** (OpenTelemetry → Postgres), and a **visualization** (Next route). It does **not** warrant a new Hook (the existing wall + S27 promotion-gate already forbid the kernel write; justified below).

- **Go package** `back/runtime/reality/` — the pure RealityMirror engine over a `TelemetrySignal` / `Incident` input (KRD §67/§1316: a recurring failure or a budget breach that *no existing fixture covers* — the kernel was incomplete, "faux par omission"). Pure functions, no I/O, no clock/RNG (deterministic and replayable like every sensor):
  - the `Incident` record — `id` (content hash, reused from S01 — do **not** fork the content-hash scheme), `signal` (the observed reality: failing operation/journey ref, error code, breached budget, recurrence count), `cause_sketch` (prose, **not yet falsifiable** — a root-cause *hypothesis*, never an asserted truth), `first_seen` / `recurrence`, `taint[] ⊇ {incident_derived}` (reusing the S30 taint vocabulary), `linked_branches[]` (KRD §927 `incident_related_branches`).
  - `Learn(incident) → IdeaCandidate | NoOp` — the load-bearing gesture: it maps an incident into the **shape of an S27 idea** (`proposes` = the layer/kind the missing mirror would target — `operation | invariant | control | …`, inferred only when the signal pins it, else left *unset* with an OpenQuestion; `intent` = the prose behaviour the missing mirror would assert, e.g. "out-of-stock during checkout must error, order NOT created"; `provenance` = `incident:#NNNN` carried verbatim). It returns a **candidate**, never an idea row and never a truth — the actual `idea_capture` is the S27 door's job.
  - `ToIdea(candidate) → S27 idea_capture call` — the **only** outward edge: hands the candidate to the S27 `idea-intake` MCP (`idea_capture` with `provenance: incident:#NNNN`), producing a `draft` idea that must still acquire its mirror to ever reach the kernel.
  - the **gate** `ToKernel(incident) → BlockReason` — mirrors the S30 firewall shape: the direct edge `Incident → Kernel` is **always** refused, returning the actionable `BlockReason` (KRD §44.5: `code: REALITY_CANNOT_DECLARE_TRUTH`, `severity`, `explanation`, `how_to_fix[]` = "incident → /learn → Idea → write mirror = /goal = human approval → Kernel"). The RealityMirror reads reality and *proposes*; it never writes truth (KRD §1099: judging that the world disagrees with the kernel is a *truth decision*, above the line, owned by human + reality, not the agent).
  - Pure logic only — no kernel write, no freeze, no mirror authored by the agent. This step proves the *external-loop intake and its one-way flow*, not the downstream kernel mutation.
- **MCP server** `back/mcp/telemetry-reader/` (Go MCP SDK, one tool = one backend op) — the capability that **closes the external loop by reading what the system does in reality** (KRD §1521/§1524: "le tool qui ferme la boucle externe : il rapporte ce que fait le système en vrai"). Tools: `telemetry_query` (read OpenTelemetry spans/metrics landed in Postgres — read-only over the telemetry store), `incident_observe` (a recurring failure/budget breach → an `Incident` row, `incident_derived` taint), `incident_list`, `incident_learn` (run `Learn` → hand the candidate to S27 `idea_capture`). It is **read-only on reality** and **write-only into `incidents` + the S27 idea door**; it carries **no** `incident_to_kernel` tool — there is no such door.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only / append-only: an `incidents` schema with one content-addressed append-only table `incidents.incident` (`id text PK` = hash of canonical JSONB body, `body jsonb NOT NULL` holding `signal`/`cause_sketch`/`recurrence`, `taint text[] NOT NULL`, `linked_branches text[] NOT NULL`, `idea_id text` nullable FK-by-value to the S27 `ideas.idea` once `/learn` has run, `first_seen timestamptz NOT NULL`, `created_at timestamptz NOT NULL`), reusing the S01 content-hash scheme. The OpenTelemetry landing tables (spans/metrics) are read-only to this role. GRANTs: the agent DB role gets **INSERT/SELECT** on `incidents.*` and **SELECT** on the telemetry store (reality is below the wall — observing it is allowed), plus the **already-granted** S27 `ideas.*` capture path; and **no grant whatsoever** on the `kernel`/`mirrors`/`fitness` schemas (the wall holds, §2). An incident table carries **no `mirror` and no `version`/freeze column** — by construction an incident is reality, never a truth.
- **OpenTelemetry → Postgres** (telemetry, §5 + frozen-stack "Telemetry") — wire the minimal OTel collection that lands spans/metrics in Postgres so `telemetry_query` has real signal to read; the RealityMirror's job is exactly to read this and reflect it back as ideas. Keep it to the read path needed to observe a recurring failure / a breached budget; emitting telemetry from every operation is a broader concern (out of scope here).
- **Skill** `/learn` (`.claude/skills/learn/SKILL.md`) — the repeatable gesture (KRD §30 lists `/learn` among the harness gestures): observe a recurring incident → sketch the cause → run `incident_learn` to emit the S27 idea draft with `incident:#NNNN` provenance. It is a *gesture*, not a kernel write; it stops at the idea draft. (This is the one genuinely new repeatable procedure here, hence a Skill per §5.)
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **incident-to-idea fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`) reflecting `incidents.incident`, plus a **property invariant** (rapid, `authority: below`). These **are** the done criteria (see below).
- **Next route** `front/web/app/incidents-to-ideas/` → `/incidents-to-ideas` — the Workbench panel rendering the external loop: each incident's `signal`/`cause_sketch`/`recurrence`/`provenance`, the `/learn` → `draft idea (incident:#NNNN)` arrow, and the **red blocked** direct `Incident → Kernel` edge (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new Hook** — the wall (S04) and the S27 promotion-gate already forbid any `Incident → Kernel` edge; this step's `ToKernel` gate reuses that `BlockReason` shape rather than adding a second guardrail (record an OpenQuestion if a distinct enforcement point proves needed). **No kernel write / no freeze / no mirror authoring** — turning a learned idea into a frozen truth is the human's `mirror + /goal + approval` (S27 promotion + the later /goal wiring), never this step and never the agent. **No `/evolve` / EvolutionSandbox** (boucle ② — KRD §66.1) and **no meta-loop sensor-adding** (boucle ④ — §68): this is purely boucle ③ (reality → idea). **No full operation-level telemetry emission** — only the read path needed to observe an incident. **No genealogy/provenance-history UI** beyond the `incident:#NNNN → idea` link (that broader history is a later Archive step).

## Test minimal (done)

**Done = an incident becomes an idea draft; the kernel is not auto-modified.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Incident-to-idea fixture** (`cert_language: fixture`, `authority: above`) — reflects `incidents.incident`, as `state → command → events`:

  ```
  # mirrors schema · reflects: incidents.incident "out-of-stock-during-checkout" · test_kind: fixture · authority: above
  mirror reflects "out-of-stock-during-checkout-incident" {

    given no incident
      when observe { signal: { operation: "createOrder", error: "30% fail", cause: "item goes out-of-stock between add-to-cart and pay" }, provenance: incident:#1043 }
        -> events: [ Observed ]
        -> incident.taint contains "incident_derived"
        -> incident.version == null        # an incident is reality, not a truth — no freeze
        -> incident.mirror  == null        # and no mirror — it PROPOSES one, it is not one
        -> incident.idea_id == null        # not yet learned

    # THE done case (a) — /learn turns the incident into an IDEA DRAFT, nothing more
    given incident { id: "out-of-stock-during-checkout", idea_id: null }
      when learn { }
        -> events: [ Learned, IdeaCaptured ]
        -> a draft idea is created via the S27 idea-intake door (idea_capture)
        -> idea.status == "draft"
        -> idea.provenance == incident:#1043           # provenance carried verbatim
        -> idea.intent contains "out-of-stock during checkout must error, order NOT created"
        -> idea.version == null  ∧  idea.mirror == null # still no truth, no freeze
        -> incident.idea_id == idea.id                  # the loop is traced back

    # THE done case (b) — the kernel is NOT auto-modified; the direct edge is refused at the wall
    given incident { id: "out-of-stock-during-checkout" }
      when to_kernel { }
        -> events: [ Blocked ]
        -> NO kernel write happened                     # the kernel stays exactly as it was
        -> block_reason.code == "REALITY_CANNOT_DECLARE_TRUTH"
        -> block_reason.how_to_fix contains "incident_then_learn_then_mirror_then_goal_then_approval"

    # promotion to truth is the HUMAN's door (out of this step) — shown only as the legal continuation
    given idea { status: "draft", provenance: incident:#1043 }
      when promote { mirror: none }
        -> events: [ Blocked ]                          # S27 promotion-gate: NO_MIRROR_NO_KERNEL
        -> the kernel is still not modified
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any `Incident` (any signal, recurrence, taint set), (1) `Learn` produces an `IdeaCandidate` whose `provenance` equals the incident's `incident:#NNNN` **verbatim** and whose `intent`/`proposes` are **never invented** when the signal does not pin them (an unpinned `proposes` stays unset → OpenQuestion, never a guessed kind); (2) the resulting idea **never** carries a `version`/freeze nor a `mirror` field (the type makes it unrepresentable — an idea is a candidate, KRD §118); (3) `ToKernel` **always** returns a `BlockReason` with `code == REALITY_CANNOT_DECLARE_TRUTH` and **never** writes the kernel — for **every** incident, not just the canonical one (the external loop reads reality but the truth-decision is above the line, §1099); (4) `incidents.incident` is **append-only** (observing the same incident again never shrinks or rewrites the log; recurrence increments, history is kept); (5) an incident's `id` equals the content hash of its canonical body (content-addressing); (6) the only outward edge from a RealityMirror is `→ S27 idea_capture` — there is no path to `kernel`/`mirrors`.

All start **red** (no `reality` package, no `incidents` schema, no `Observe/Learn/ToIdea/ToKernel`, no `telemetry-reader` MCP, no `/learn` skill, no OTel landing). That red **is** the `/goal`. The canonical done case is green only when the `out-of-stock-during-checkout` incident, on `/learn`, yields a **draft idea** carrying `incident:#1043` provenance whose `intent` reflects the missing-mirror behaviour (the idea has **no** version and **no** mirror), the incident is traced back via `idea_id`, **and** the direct `Incident → Kernel` edge is `Blocked` with `REALITY_CANNOT_DECLARE_TRUTH` leaving the kernel byte-for-byte unchanged — i.e. **reality injects an idea; it cannot declare a truth.**

## Visualisation UI

- **Workbench route:** `front/web/app/incidents-to-ideas/page.tsx` (new route `/incidents-to-ideas`; do **not** touch existing routes). It renders the external loop as a board: one card per incident showing `signal` (the failing operation/budget, recurrence count), `cause_sketch`, `provenance` (`incident:#NNNN`), and the `incident_derived` taint badge. The card makes visible that the incident **has no mirror and no freeze** (an explicit "reality, not a truth" marker) and offers the `/learn` action; running `/learn` renders the **`incident:#NNNN → draft idea`** arrow with the provenance carried, and the idea shown explicitly as a **draft with no mirror yet**. The attempted **direct `Incident → Kernel`** edge renders **red** with the `REALITY_CANNOT_DECLARE_TRUTH` `BlockReason` (`code` + `how_to_fix` = "incident → /learn → mirror → /goal → approval"). When `proposes` could not be inferred, the card shows the **OpenQuestion** marker rather than a guessed kind. Reads via the SELECT-grant role; renders the fixture, does not re-implement the mapping.
- **Playwright e2e:** `tests/e2e/incidents-to-ideas.spec.ts` — navigate to `/incidents-to-ideas`, assert an observed incident shows its `signal`, `cause_sketch`, `provenance: incident:#1043`, the `incident_derived` taint, and the "reality, not a truth" marker; click `/learn` and assert the `incident → draft idea` arrow appears with the provenance carried and the idea marked **draft, no mirror yet**; assert the direct `Incident → Kernel` action renders a red row with `REALITY_CANNOT_DECLARE_TRUTH` and that **no kernel mutation** is shown (the kernel panel is unchanged); assert that where `proposes` is unpinned an OpenQuestion marker (not a guessed kind) is shown. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/reality/**`, the new `back/migrations/<new>.sql` (the `incidents` schema + the OTel landing tables + GRANTs), the new `back/mcp/telemetry-reader/**`, the new `.claude/skills/learn/SKILL.md`, the `mirrors`-stored incident-to-idea fixture/property materialized to `tests/`, `tests/e2e/incidents-to-ideas.spec.ts`, and `front/web/app/incidents-to-ideas/**` — and otherwise **adds new files**. It introduces a new contract (the `Incident` record shape, the `Observe/Learn/ToIdea/ToKernel` semantics, the `REALITY_CANNOT_DECLARE_TRUTH` `BlockReason` code, and the `/learn` gesture) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; an observed incident is **kept** (traced, recurrence-counted), never deleted or overwritten. Any change to a **prior contract** it depends on — the S01 content-store substrate, the S27 idea-intake door / `idea_capture` signature, the S30 taint vocabulary, the wall GRANT set (§2/S04), the `BlockReason` shape (S13/§44.5), or the `provenance` link form (KRD §119) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema (S21), never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8). Note the boundary: this step is the *external loop reading reality* — it may write `incidents.*` and call the S27 idea door (both below/above the wall as granted), but it provably **cannot** write `kernel`/`mirrors`/`fitness`; that asymmetry is the contract.

## Prompt a lancer

```text
You are step-executor for AIDOS step S43 — "RealityMirror: telemetry/incident → Idea (with provenance);
the kernel is never auto-modified". Stack is FROZEN: back=Go, truth=Postgres (append-only,
content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench).
Home = back/runtime/reality ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §53 ("le second cliquet inductif : la prod est un sensor qui écrit
au noyau — tout incident de prod doit se refermer en un delta de noyau ; une contrainte validée par
incident = haute-confiance, une spéculative = hypothèse"), §67 / §1316 ("l'incident devient un miroir" —
30% des createOrder échouent → aucune fixture ne couvrait le cas → le noyau était faux par OMISSION → la
boucle externe transforme l'incident en un NOUVEAU MIROIR out-of-stock-during-checkout → approbation
HUMAINE above the line → ChangeSet → vague de rouge → nouvelle dent ; "le système a appris du MONDE, pas
de lui-même"), §117 / §2537-2539 (les idées viennent de DEUX sources — l'humain « finalement je veux
que… » et la réalité (incident) — et ne deviennent vérité qu'en acquérant un miroir ; "la boucle externe
n'est plus un mécanisme à part : c'est la réalité qui injecte des IDÉES"), §118 (the Idea record:
proposes, intent, provenance human|incident:#NNNN, status draft|grilled|spiking|harvested|rejected — PAS
de version-gel, PAS de mirror), §1099 (juger qu'un désaccord avec le réel est vrai est une DÉCISION DE
VÉRITÉ, au-dessus de la ligne — owned by human+reality, not the agent), §1521/§1524 (the telemetry-reader
MCP "ferme la boucle externe : il rapporte ce que fait le système en vrai" — 1 outil = 1 op backend),
§44.5 (BlockReason: code, severity, explanation, how_to_fix[] — tout refus actionnable). Read
CONTEXT-MAP.md + back/runtime/CONTEXT.md (the harness, the sensor — "un sensor qui ne déclenche jamais est
mort", the wall, fitness NIVEAU 3 owned only by human+reality, the telemetry-reader as the external-loop
tool) and the prior steps you REUSE: S01 (the content-addressed append-only content store — reuse its
content-hash scheme for the incident row, do not fork it), S04 (the wall — the agent has no
kernel/mirrors/fitness grant; you ADD an incidents-schema + telemetry-read grant BELOW/ABOVE the wall as
appropriate, you do not weaken the wall), S13 (the BlockReason shape), S27 (the Idea record + the
idea-intake MCP door — idea_capture with provenance ; promotion to kernel requires mirror+goal, the
promotion-gate refuses NO_MIRROR_NO_KERNEL), S30 (the MemoryFirewall taint vocabulary
{unverified,stale,user_claim,incident_derived,external_source} and the SAME one-way-door pattern
Memory→ContextPack→Idea — mirror it for Incident→Idea). For any Next.js 16, Atlas, OpenTelemetry, Go MCP
SDK, or rapid API doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/runtime/CONTEXT.md: a "RealityMirror" is the EXTERNAL loop (boucle ③)
    — the prod/telemetry world acting as a SENSOR that READS reality and PROPOSES, never one that writes
    truth. An "Incident" is reality (a recurring failure / breached budget that NO existing fixture
    covers — the kernel was incomplete, "faux par omission"); it carries a cause_SKETCH (a hypothesis, NOT
    a falsifiable assertion) and the incident_derived taint; it has NO version and NO mirror — it PROPOSES
    a mirror, it is not one. "/learn" is the gesture that maps an incident into the SHAPE of an S27 idea
    (proposes/intent/provenance:incident:#NNNN) and hands it to the idea-intake door → a draft idea. The
    kernel is NOT auto-modified: turning that idea into a frozen truth is the HUMAN's mirror + /goal +
    approval (above the line, §1099) — the RealityMirror has no key to the kernel. Do NOT use "fix",
    "patch", "auto-heal", "test", "monitor", "alert", "truth", or "mirror" (the noun) as synonyms for the
    incident or the /learn output (CONTEXT.md _Avoid_ lists: sensor ≠ monitor/test; the incident PROPOSES
    a mirror, it is not one). Resolve every branch before coding — especially: reality injects IDEAS not
    truths; the direct Incident→Kernel edge is ALWAYS refused; the only outward edge is →S27 idea_capture;
    proposes is inferred ONLY when the signal pins it, else it is an OpenQuestion (never guessed). If a
    term shifts, update CONTEXT.md / write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - Incident-to-idea fixture (cert_language: fixture, authority: above), reflecting incidents.incident
        "out-of-stock-during-checkout". Rows: observe (incident:#1043, signal createOrder 30% fail / item
        out-of-stock between add-to-cart and pay) -> Observed, taint contains incident_derived,
        version==null, mirror==null, idea_id==null ; learn -> Learned+IdeaCaptured, a DRAFT idea via the
        S27 idea_capture door with provenance==incident:#1043 carried verbatim, intent contains
        "out-of-stock during checkout must error, order NOT created", idea.version==null ∧
        idea.mirror==null, incident.idea_id==idea.id (THE done case a) ; to_kernel -> Blocked, NO kernel
        write, block_reason.code==REALITY_CANNOT_DECLARE_TRUTH, how_to_fix contains
        incident_then_learn_then_mirror_then_goal_then_approval (THE done case b) ; and the legal
        continuation row promote{mirror:none} -> Blocked via S27 NO_MIRROR_NO_KERNEL, kernel still
        unmodified.
      - property invariant (rapid, authority: below): for ANY incident, Learn carries provenance
        incident:#NNNN VERBATIM and NEVER invents intent/proposes when the signal doesn't pin them (unset
        proposes ⇒ OpenQuestion, not a guess); the produced idea never carries a version/freeze nor a
        mirror field (unrepresentable in the type); ToKernel ALWAYS returns BlockReason
        REALITY_CANNOT_DECLARE_TRUTH and never writes the kernel — for EVERY incident; incidents.incident
        is append-only (re-observing increments recurrence, never shrinks/rewrites); id == content hash of
        the canonical body; the only outward edge is →S27 idea_capture (no path to kernel/mirrors).
    Run them; watch them go RED (no reality package, no incidents schema, no Observe/Learn/ToIdea/ToKernel,
    no telemetry-reader MCP, no /learn skill, no OTel landing). That red IS the /goal. Do NOT write a
    truth-test you would then satisfy — mirror the human/reality intention only; the mirror that would
    promote the learned idea is the HUMAN's /goal, NOT one you author to pass any gate.

(c) TDD red→green→refactor, in back/runtime/reality ONLY (plus the back/migrations/ schema file, the
    back/mcp/telemetry-reader/ server, and the .claude/skills/learn/ SKILL.md). Outside-in. REUSE the S01
    content-hash content-store substrate for the incident row shape and the append-only guarantee — do NOT
    fork it; REUSE the S27 idea-intake idea_capture door for the outward edge — do NOT re-implement idea
    capture; REUSE the S30 taint vocabulary and one-way-door pattern. If a real tool choice arises WITHIN
    a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the
    mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx, the Go MCP SDK are FIXED;
    OpenTelemetry is the frozen Telemetry slot). The likely genuine choices: which OpenTelemetry→Postgres
    landing path is simplest for the READ side the telemetry-reader needs (a minimal spans/metrics table
    the collector writes — keep it small; full operation-level emission is out of scope); the
    canonical-JSONB shape of the incident body (signal/cause_sketch/recurrence, reusing S01's content
    hash); and how `proposes` is inferred-or-left-unset (a conservative mapping that emits an OpenQuestion
    rather than guessing). Record a short ADR (docs/adr/) ONLY if a genuine choice is made (e.g. the OTel
    landing shape, or the Incident type making version/mirror unrepresentable). The migration is
    expand-only/append-only; GRANT the agent role INSERT/SELECT on incidents.* and SELECT on the telemetry
    store (reality is observable below the wall) plus the already-granted S27 ideas capture path, and NO
    grant on kernel/mirrors/fitness (the wall, §2). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce
    observe → learn → (draft idea with incident:#1043 provenance) and the to_kernel → Blocked path, state
    the cause, propose. Check completeness: the reality/external-loop layer has its living mirror and each
    required test_kind is present (KRD §33); no monster (no incident path without a fixture row; the
    ToKernel gate is the single point that enforces "reality cannot declare truth"; no orphan mapping) —
    else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create
    front/web/app/incidents-to-ideas/ → /incidents-to-ideas: the external-loop board, one card per
    incident with signal / cause_sketch / provenance (incident:#NNNN) / incident_derived taint, an
    explicit "reality, not a truth" marker (no mirror, no freeze), the /learn action rendering the
    incident:#NNNN → draft idea arrow (provenance carried, idea shown as draft with no mirror yet), the
    direct Incident→Kernel edge rendered RED with REALITY_CANNOT_DECLARE_TRUTH (code + how_to_fix) and the
    kernel panel UNCHANGED, and an OpenQuestion marker where proposes is unpinned (never a guessed kind).
    Read via the SELECT-grant role; render the fixture, do not re-implement the mapping. Do NOT touch
    existing routes. Add tests/e2e/incidents-to-ideas.spec.ts (use the playwright-e2e skill) asserting the
    incident card with its signal/cause_sketch/provenance/taint and the "reality, not a truth" marker, the
    /learn → draft-idea arrow with provenance carried, the red REALITY_CANNOT_DECLARE_TRUTH row with the
    kernel unchanged, and the OpenQuestion marker where proposes is unpinned.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    reality is a deep, well-named module; that Observe/Learn/ToIdea/ToKernel are pure and depend on the
    S01 content-store substrate and the S27 idea door without duplicating either; that the Incident type
    makes version/mirror unrepresentable; that the migration/GRANTs keep the wall intact (incidents +
    telemetry readable/writable as granted, kernel/mirrors/fitness NOT); that the telemetry-reader MCP and
    the /learn skill each own exactly one concern (read reality / map to an idea draft); boundaries match
    back/runtime/CONTEXT.md (the external loop reads reality and PROPOSES; the kernel write is the human's
    /goal, a later/other wiring). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic), the Atlas migration
    (persistence — incidents + OTel landing + GRANTs), the telemetry-reader MCP server (capability), the
    /learn Skill (the new repeatable gesture), the incident-to-idea fixture + property (behaviour proof),
    the OpenTelemetry→Postgres read path (telemetry), and the Next route (visualization). Do NOT add a new
    Hook (the wall S04 + the S27 promotion-gate already forbid Incident→Kernel; reuse that BlockReason —
    record an OpenQuestion if a distinct enforcement point is truly needed), no kernel write / freeze /
    mirror authoring (the human's /goal, a later wiring), no /evolve / EvolutionSandbox (boucle ②), no
    meta-loop sensor-adding (boucle ④). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If the `proposes` kind for an incident, the exact
  incident JSONB shape, the provenance format, the OTel landing shape, or the BlockReason code is not
  pinned by KRD §53/§67/§117/§118/§1099/§1521/§44.5 / an existing migration / ADR / CONTEXT.md / the S27
  idea_capture signature, do NOT guess — record an OpenQuestion (provenance) and STOP on that branch. In
  particular: do NOT invent the missing mirror's assertion as if it were truth (the cause is a SKETCH /
  hypothesis); do NOT guess a `proposes` kind when the signal doesn't pin it (leave it unset →
  OpenQuestion); do NOT give an incident a version or a mirror field (it has neither by definition); and
  do NOT reach into the kernel/mirrors/fitness schemas — the only outward edge is the S27 idea door.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The
  incident-to-idea fixture is a means-test toward the human/reality red, not a new truth; the mirror that
  would promote the learned idea is the HUMAN's /goal, not one you author.
- Any change to a prior contract (S01 content store, the S27 idea-intake door, the S30 taint vocabulary,
  the wall GRANTs §2/S04, the BlockReason shape S13, the provenance link §119) goes through a ChangeSet +
  SemanticDiff (S20/S21). Add new files; never silently rewrite a prior artifact, never hand-edit
  back/gen/**. An observed incident is kept (traced, recurrence-counted), never deleted/overwritten.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the incident-to-idea fixture passes — observe yields an
incident_derived incident with version==null and mirror==null and idea_id==null; /learn produces a DRAFT
idea via the S27 idea_capture door carrying provenance==incident:#1043 verbatim, intent reflecting the
missing-mirror behaviour, idea.version==null ∧ idea.mirror==null, and incident.idea_id traced back (THE
done criterion: an incident becomes an idea DRAFT); the direct Incident→Kernel edge is Blocked with
REALITY_CANNOT_DECLARE_TRUTH (how_to_fix → incident → /learn → mirror → /goal → approval) and the kernel
is byte-for-byte unchanged (THE done criterion: the kernel is NOT auto-modified); the rapid invariant
holds (provenance verbatim, no invented intent/proposes, no version/mirror field, ToKernel always blocks
and never writes, incidents append-only, id==content hash, only outward edge →S27); /incidents-to-ideas
renders the board with the red blocked Incident→Kernel edge and a passing Playwright e2e; GRANTs prove
incidents.* writable and telemetry readable while kernel/mirrors/fitness stay unwritable by the agent; the
migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (incident-to-idea fixture, rapid property), where stored (mirrors schema) and
  materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /incidents-to-ideas — what it renders (incident cards: signal/cause_sketch/provenance/taint,
  "reality not a truth" marker, /learn → draft-idea arrow, red blocked Incident→Kernel, OpenQuestion
  marker), e2e file + result.
- ChangeSet status: any prior-contract change (S01 content store, S27 idea door, S30 taint vocab, wall
  GRANTs, BlockReason, provenance link) → ChangeSet + SemanticDiff (note the change_type), else "none".
  Idea/kernel writes go through the S27 door / the aidos CLI role via /goal, never the agent.
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no actual kernel write/freeze (the human's /goal mutation) wired yet; no /evolve or
  meta-loop (boucles ②/④); OTel emission limited to the read path needed to observe an incident; the
  `proposes` inference is conservative (OpenQuestion when unpinned); BlockReason codes supported; which
  signal/taint kinds are handled.
- Next safe step: the smallest stable next tooth (e.g. wiring the human's mirror+/goal flow that turns a
  learned incident-idea into a frozen kernel truth with a provenance link back to incident:#NNNN and a red
  wave, or fuller operation-level OpenTelemetry emission) and why it is safe to chain.
```
