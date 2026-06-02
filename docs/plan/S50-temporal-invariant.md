# S50 — TemporalInvariant (time-dependent invariant KIND: clock + tolerance + temporal mirror)

Subsystem: AIDOS Kernel | Home: `back/kernel/temporal` | Workbench route: `/temporal-invariants`

## Objectif

Land the **TemporalInvariant** as a first-class Kernel **invariant KIND** (KRD §49.3) — a truth whose property is *time-dependent* and which therefore **must declare its horloge** (`clock ∈ system | external | logical`) and its **`tolerance`** (a duration), and whose mirror is a **temporal mirror form** (`statechart | TLA+ | UPPAAL`). The done invariant: **a concrete time property reddens when violated, while its declared `tolerance` keeps the proof from flaking** — e.g. *"payment_captured implies order_confirmed within 5 minutes"* with `tolerance: 10s` is **green** at a 5m04s confirmation (inside `5m ± 10s`) and **red** at 5m20s (outside tolerance). This makes "toute vérité temporelle doit déclarer son horloge" (KRD §49.3) a typed, content-addressed truth — covering timeouts, retries, expiration, event-order, idempotence and eventual consistency.

> **CRITICAL distinction — this is NOT two things it could be mistaken for, and the step must keep all three apart:**
> 1. **NOT the temporal AXIS of the DAG / ChangeSet.** The DAG's time axis (a stable-phase node, a changeset edge, history ordering) already exists — that is *when truths changed*. A **TemporalInvariant** is *a truth about time inside the domain behaviour itself* (a deadline, an ordering, an expiry). It rides on the Kernel record, not on the DAG.
> 2. **NOT `scope.TimeWindow` (S15).** `TruthScope.TimeWindow{From, To}` is the **validity window** of a truth — *opaque* from/to bounds that say *when a truth applies* (and S15 explicitly pins **no clock semantics**, leaving it as `"..."`). A **TemporalInvariant** is the opposite: a **clock-bearing property** that asserts a *time relation between domain events* (within / before / after / eventually), with a declared `clock` and a `tolerance`. A TimeWindow has no clock and no tolerance; a TemporalInvariant requires both.
> 3. It **is** a first-class invariant **KIND** with a `clock` + `tolerance` + a **temporal mirror form**. It belongs in `back/kernel/temporal`, extending the truth-typing surface (S14) with a **temporal** marker and/or the **mirror `cert_language` enum** (S06) with `statechart` / `tla+` (the latter only where catastrophic, per the Tome — UPPAAL is reserved for hard real-time, KRD §776/§3299).

This slice lands the typed `TemporalInvariant` shape, a pure `Validate` (a temporal truth without a declared clock is rejected) and a pure `Evaluate(invariant, observation) → Verdict` (with the `tolerance` band applied deterministically); plus its temporal mirror. It does **not** wire temporal evaluation into the live runtime/sensors, does not build a model-checker, and does not author the kernel write (the agent has no grant — promotion is the /goal flow).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration extending the kernel truth-typing surface + the mirror cert-language enum), a **behaviour proof** (BDD mirror), and a **visualization** (Next route) — and nothing more. It does **not** warrant a new hook, MCP server, or skill (justified below).

- **Go package** `back/kernel/temporal/` — the `TemporalInvariant` AST type per KRD §49.3, emitted as real Go (FR names map to idiomatic Go fields): `Property string` (the time property, e.g. `"payment_captured implies order_confirmed within 5 minutes"`), `Clock` (`clock ∈ system | external | logical`, a closed Go enum `Clock` — `ClockSystem | ClockExternal | ClockLogical`), `Tolerance` (a **duration**, parsed/held as `time.Duration` from a string like `"10s"`, never a bare int), and `Mirror` (`mirror ∈ statechart | TLA+ | UPPAAL`, a closed Go enum `TemporalMirrorForm`). Plus the pure functions:
  - **`Validate(inv TemporalInvariant) error`** — shape guard: non-empty `Property`; `Clock` is one of the three §49.3 members; `Tolerance` is a parseable non-negative duration; `Mirror` is one of the three §49.3 temporal forms. The load-bearing rule: **a temporal truth with no declared clock (or a zero/empty clock) is rejected** — "toute vérité temporelle doit déclarer son horloge". A `logical` clock with a wall-clock tolerance, or any contradiction the grill pins, is surfaced as an error (or an OpenQuestion if §49.3 does not pin it).
  - **`Evaluate(inv TemporalInvariant, obs Observation) → Verdict`** — pure, deterministic: given an `Observation` carrying the measured elapsed/ordering datum (e.g. `Elapsed time.Duration` for a `within` property), return `Held | Violated` by comparing against the property's bound **widened by `Tolerance`** on the declared `clock`. A datum **inside** `bound ± tolerance` ⇒ `Held`; **outside** ⇒ `Violated` with a `BlockReason`-shaped detail (KRD §44.5: `code: TEMPORAL_INVARIANT_VIOLATED`, `severity`, `explanation`, `how_to_fix[]`). Pure functions only — **no real clock read, no `time.Now()`, no sleep, no I/O**: the elapsed datum is *passed in* via the `Observation`, never sampled (determinism-first — see below). The actual wiring into runtime sensors / a model-checker is a later projection, not this step.
- **Atlas migration** (`back/migrations/`) — declarative, **expand-only / append-only**, reusing the S14 truth-typing surface and the S06 mirror enum (do **not** fork either). Two additive moves, both backward-compatible:
  1. **Kernel side** — extend the epistemic-typing surface so a truth can be marked **temporal**. The minimal, append-only move is a new **nullable** `temporal jsonb` body fragment on the S02 `kernel.truth` record (holding `property` / `clock` / `tolerance` / `mirror`) with a CHECK pinning `clock IN ('system','external','logical')` and `mirror IN ('statechart','tla+','uppaal')` **when present** — NULL allowed (existing rows untouched, NO backfill, NO NOT-NULL flip, exactly like S14). Whether `temporal` is *also* a new member of the `truth_kind` enum (S14: `behavioral|structural|experiential|economic|regulatory|statistical|exploratory`) is a **decision the grill must settle** — §13.4 does not list `temporal`, so **do not invent an enum member**; if a marker is warranted it rides in the new `temporal` fragment, not as a forged §13.4 kind, unless KRD pins otherwise (else OpenQuestion + ADR).
  2. **Mirror side** — extend the S06 `mirrors.mirror_record.cert_language` CHECK enum (currently `gherkin|xstate|fast-check|rapid|zod|pact|type-check|k6|fixture|snapshot|unit|prose`) with the temporal forms **`statechart`** and **`tla+`** (and **`uppaal`** only if a catastrophic real-time truth needs it — guard against a dead member: add `uppaal` only when a row will use it, §5 hook-honesty applied to enum members). Widening a CHECK to admit *more* values is expand-only (no existing row violates it).
  Both moves: GRANTs unchanged — the agent DB role keeps **SELECT only** on `kernel.truth` and `mirrors.mirror_record` (the wall, §2). Only the privileged `aidos` CLI writer role writes truth, via an approved ChangeSet. This migration is **authored here**, applied by the migration role; it never alters, drops, or NOT-NULL-flips a prior column.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the canonical mirror's **nature is a temporal invariant**, so its `cert_language` is a **temporal form** (`statechart`, the pragmatic Tome winner for N2/temporal — KRD §796 `XState` 18 vs model-check 14; `tla+`/`uppaal` reserved for catastrophic real-time). The **TemporalInvariant statechart mirror** (`reflects: kernel.truth "checkout-confirm-within-5m"`, `test_kind: fixture` over a statechart transition, `cert_language: statechart`, `authority: above`) proves the concrete "confirmation within 5 minutes, tolerance 10s" property: green inside tolerance, **red** outside. Plus a **property invariant** (rapid, `authority: below`) on `Validate`/`Evaluate` proving determinism + the tolerance band + the clock-required rule. These **are** the done criteria (see below).
- **Next route** `front/web/app/temporal-invariants/` → `/temporal-invariants` — the Workbench panel rendering the TemporalInvariant (`property`, `clock`, `tolerance`, `mirror` form) and a live **evaluation table** showing the tolerance band: a sub-tolerance observation green (`HELD`), an over-tolerance observation **red** (`VIOLATED` + `TEMPORAL_INVARIANT_VIOLATED` `BlockReason`), and the exact-bound + at-the-edge-of-tolerance cases (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no hook** — temporal evaluation is a *decision function the runtime/sensor flow will call*, not a non-bypassable wall rule, and a hook that never fires is dead (§5 hook-honesty); the live runtime sensor that *samples* a real clock and feeds `Observation`s is a later Runtime step, not here. **No MCP server** — no new backend capability is exposed (`Evaluate` is pure logic called in-process; the `mirror-runner` / `telemetry-reader` MCPs are other steps). **No skill** — declaring a temporal invariant is not yet a repeatable multi-step gesture distinct from the generic "declare a source" / `derive-mirror`. **No model-checker / no TLA+/UPPAAL runner** — this step *types* the temporal mirror form and proves a concrete property via a statechart fixture; building or invoking a formal model-checker is a rare T2 cap (KRD §778: UPPAAL only for hard real-time) and out of slot. **No codegen** — there is no projection to emit from a temporal invariant at this step. **No real-clock read** — `Observation` data is passed in; this step samples no time (determinism-first). Record an OpenQuestion if a distinct temporal-runtime capability emerges.

## Test minimal (done)

**Done = a concrete time property reddens when violated, and its declared `tolerance` prevents the flake.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **TemporalInvariant statechart mirror** (`cert_language: statechart`, `authority: above`) — reflects `kernel.truth "checkout-confirm-within-5m"` (KRD §49.3):

  ```
  # mirrors schema · reflects: kernel.truth "checkout-confirm-within-5m" · test_kind: fixture · cert_language: statechart · authority: above
  mirror reflects "checkout-confirm-within-5m" {
    temporal_invariant {
      property:   "payment_captured implies order_confirmed within 5 minutes"
      clock:      system
      tolerance:  10s
      mirror:     statechart
    }

    # the bound is 5m; tolerance widens the green band to 5m ± 10s.
    given observation { event_order: [ payment_captured, order_confirmed ], elapsed: 4m58s }
      -> verdict == "held"                     # comfortably inside the bound

    given observation { event_order: [ payment_captured, order_confirmed ], elapsed: 5m04s }
      -> verdict == "held"                     # inside tolerance (5m + 4s ≤ 5m + 10s) — NOT a flake

    given observation { event_order: [ payment_captured, order_confirmed ], elapsed: 5m20s }
      -> verdict == "violated"                 # THE done case — outside tolerance, the property reddens
      -> block_reason.code == "TEMPORAL_INVARIANT_VIOLATED"
      -> block_reason.how_to_fix contains "confirm_within_5m_or_compensate"

    # event-order is part of the property (KRD §49.3 covers "ordre des événements")
    given observation { event_order: [ order_confirmed, payment_captured ], elapsed: 1m00s }
      -> verdict == "violated"                 # confirmation BEFORE capture violates the implication
      -> block_reason.code == "TEMPORAL_INVARIANT_VIOLATED"
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any generated `TemporalInvariant` and any `Observation`, `Evaluate` is **deterministic** and **total** (always `held | violated`, never a third state, never a panic); an `elapsed` exactly on the bound, and any `elapsed ≤ bound + tolerance`, ⇒ `held`; any `elapsed > bound + tolerance` ⇒ `violated` (the tolerance band is applied exactly once, symmetric where §49.3 pins it, and never silently widened); the **clock-required rule** holds: `Validate` returns a non-empty error for a temporal invariant with no/zero/unknown `clock`, an unparseable or negative `tolerance`, an empty `property`, or a `mirror` outside `{statechart, tla+, uppaal}`; `Evaluate` reads **no wall clock** — calling it twice with the same `(invariant, observation)` yields the identical verdict (the reproducibility mirror, determinism-first). An out-of-enum `clock` or `mirror` ⇒ `Validate` errors (defense in depth with the DB CHECK).

All start **red** (no `temporal` package, no `temporal` body fragment on `kernel.truth`, no `statechart`/`tla+` in the mirror cert-language CHECK, no `Validate`/`Evaluate`). That red **is** the `/goal`. The canonical done case is green only when `Evaluate(invariant, obs{elapsed: 5m20s})` returns `violated` with a `TEMPORAL_INVARIANT_VIOLATED` `BlockReason` **while** `Evaluate(invariant, obs{elapsed: 5m04s})` returns `held` — i.e. **the property reddens on a real violation, and the declared tolerance keeps the 5m04s case green (no flake).**

## Visualisation UI

- **Workbench route:** `front/web/app/temporal-invariants/page.tsx` (new route `/temporal-invariants`; do **not** touch existing routes). Themed per **ADR 0010** (the ccup zinc + blue-600 design tokens, shadcn components, Geist, radius `0.5rem` — never hardcoded `zinc-*`/hex) and **bilingual per ADR 0011** (`next-intl`, FR default with an EN second; strings in `front/web/messages/{fr,en}.json`, no new route prefix). It renders the "checkout-confirm-within-5m" invariant card — `property`, `clock: system`, `tolerance: 10s`, `mirror: statechart` — plus a live **evaluation table** (the fixture rows with their computed `verdict` and, when violated, the `BlockReason` `code` + `how_to_fix`) that makes the **tolerance band** legible: an explicit "green band = 5m ± 10s" marker, the `4m58s` and `5m04s` rows shown `HELD` (the 5m04s row visibly *inside tolerance* so a human sees why it is not a flake), the `5m20s` row shown **red** as `VIOLATED / TEMPORAL_INVARIANT_VIOLATED`, and the out-of-order row shown red. An above-the-line authority badge marks the invariant as a Kernel qualifier. Reads via the **SELECT-only** role; it consumes the pure `Evaluate` verdict, it does **not** re-implement the band or run truth writes.
- **Action-capable (CLAUDE.md §6.7):** the panel is not display-only. It exposes a **propose** control (the `action` gesture) that drafts a *new* candidate temporal invariant or a tolerance change — but, respecting **the wall**, it does **not** write truth: the control opens an **idea → mirror → /goal → ChangeSet** flow (a DRAFT proposal surfaced for human approval), never a direct kernel write from the screen. A read-only "re-evaluate against this observation" control re-runs the pure `Evaluate` below the line and is directly actionable.
- **Playwright e2e:** `tests/e2e/temporal-invariants.spec.ts` — navigate to `/temporal-invariants`, assert the invariant card names `clock: system`, `tolerance: 10s`, `mirror: statechart` and the property string; assert the evaluation table shows the `4m58s` and `5m04s` rows as `HELD` (and the 5m04s row marked inside-tolerance), the `5m20s` row as `VIOLATED` with `TEMPORAL_INVARIANT_VIOLATED` shown red, and the out-of-order row as `VIOLATED`; assert the propose control opens the idea/ChangeSet flow (a DRAFT proposal) and performs no direct kernel write. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/temporal/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored statechart mirror/property materialized to `tests/`, `tests/e2e/temporal-invariants.spec.ts`, the new `front/web/app/temporal-invariants/**`, and the two i18n message bundles' **new keys** for this route (`front/web/messages/{fr,en}.json`, append-only) — and otherwise **adds new files**. It introduces a new contract (the `TemporalInvariant` AST shape, the `clock`/`mirror` enums, the `tolerance` duration semantics, the `Evaluate` tolerance-band rule and the `TEMPORAL_INVARIANT_VIOLATED` `BlockReason` code) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table — the new `temporal` fragment is **nullable** and the mirror `cert_language` CHECK is only **widened** (admits more values, breaks no row). Any change to a **prior contract** it depends on — the S02 record substrate, the S14 truth-typing surface / `truth_kind` enum (KRD §13.4), the S06 `mirror_record` / its `cert_language` enum (KRD §34), the S15 `TruthScope.TimeWindow` (keep it **distinct** — do not repurpose the window as a clock), the `BlockReason` shape (S13/KRD §44.5), or the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema (S21), never an in-place edit. Adding a temporal qualifier to an existing truth is a `refine`/`add` SemanticDiff change_type, not an edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8).

## Prompt a lancer

```text
You are step-executor for AIDOS step S50 — "TemporalInvariant (time-dependent invariant KIND: clock +
tolerance + temporal mirror)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed;
the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home =
back/kernel/temporal ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §49.3 (TemporalInvariant — "toute vérité temporelle doit déclarer
son horloge"; property; clock ∈ system|external|logical; tolerance (a duration); mirror ∈
statechart|TLA+|UPPAAL; it covers délais, ordre des événements, expiration, retries, timeouts, horloges
différentes, événements en retard, idempotence et eventual consistency), §49.2 (CompositionTest /
CoherenceTest — the federation context the temporal property lives beside; cert_language statechart|pact|
tla+), and the Tome verdicts that pin the mirror forms: §776/§778 (UPPAAL / timed automata = très haut
coût, ONLY for hard real-time) and §796/§3293/§3299 (Workflow/temporal winner = XState/statechart 18 vs
model-check 14; UPPAAL reserved for temps-réel dur). Read §44.5 (BlockReason: code, severity, explanation,
how_to_fix[] — "tout refus doit être actionnable"). Read CONTEXT-MAP.md + back/kernel/CONTEXT.md (Layer,
source/projection, the four qualifying attributes, the bicephalous mirror plane). REUSE, do not fork: S02
(the content-addressed kernel.truth record substrate — the temporal fragment rides inside its canonical
body so id == version == Hash(body) still holds), S14 (back/kernel/truthtyping — the truth_kind /
verifiability_level typing columns + their CHECK enums; mirror its nullable-expand-only pattern EXACTLY),
S06 (mirrors.mirror_record — the typed mirror with its cert_language CHECK enum you will WIDEN), and S13
(the BlockReason shape). For any Next.js 16, next-intl, Atlas, rapid, or Go API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

THREE DISTINCTIONS YOU MUST HOLD (do not collapse them):
  1. A TemporalInvariant is NOT the temporal AXIS of the DAG/ChangeSet (that edge — when truths CHANGED —
     already exists). It is a truth ABOUT TIME INSIDE the domain behaviour (a deadline/ordering/expiry),
     riding on the kernel.truth record.
  2. A TemporalInvariant is NOT scope.TimeWindow (S15). TimeWindow{From,To} is the OPAQUE validity window
     (WHEN a truth applies; S15 pins NO clock semantics). A TemporalInvariant is a CLOCK-BEARING property
     (a time RELATION between events: within/before/after/eventually) with a declared clock AND a
     tolerance. Do NOT repurpose TimeWindow as a clock; do NOT add a tolerance to TimeWindow.
  3. It IS a first-class invariant KIND with clock + tolerance + a TEMPORAL MIRROR FORM, living in
     back/kernel/temporal and extending the S14 typing surface and/or the S06 mirror cert_language enum
     with statechart/tla+ (uppaal ONLY where catastrophic real-time, §778).

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/kernel/CONTEXT.md: a "TemporalInvariant" is a time-dependent invariant
    that MUST declare its "horloge" (clock ∈ system|external|logical) and a "tolerance" (a duration); its
    "mirror" form is one of statechart|TLA+|UPPAAL; a "verdict" is held|violated; the tolerance is the band
    that prevents a flaky temporal proof (a confirmation at 5m04s under tolerance 10s is HELD, not a
    flake). Sharpen each term; if a term shifts, update back/kernel/CONTEXT.md / write an ADR inline.
    Resolve every branch before coding — ESPECIALLY: whether "temporal" is a new truth_kind member (§13.4
    does NOT list it — do NOT invent one; if a marker is needed it rides in the new temporal fragment) or
    purely a mirror-cert-language + body-fragment concern; whether the tolerance band is symmetric
    (bound ± tolerance) or one-sided (bound + tolerance) for a "within" property — pin it from §49.3, and
    if §49.3 does not pin it, raise an OpenQuestion and STOP on that branch; what a `logical` clock means
    for a wall-clock tolerance; and that this step reads NO real clock (Observations are passed in). Seed
    the Mintlify "Pour moi" concept page + the Méta/Méta-méta layers (see the doc mandate below).

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Its NATURE is a temporal invariant, so the canonical mirror's cert_language is a TEMPORAL FORM
    (statechart — the pragmatic Tome winner). Two artifacts, by nature:
      - TemporalInvariant statechart mirror (cert_language: statechart, authority: above), reflecting
        kernel.truth "checkout-confirm-within-5m": temporal_invariant { property "payment_captured implies
        order_confirmed within 5 minutes", clock system, tolerance 10s, mirror statechart }. Rows:
        elapsed 4m58s -> held ; elapsed 5m04s -> held (INSIDE tolerance — NOT a flake) ; elapsed 5m20s ->
        violated, block_reason.code==TEMPORAL_INVARIANT_VIOLATED, how_to_fix contains
        confirm_within_5m_or_compensate (THE done case) ; event_order [order_confirmed, payment_captured]
        -> violated (order violation, §49.3 "ordre des événements").
      - property invariant (rapid, authority: below): Evaluate is deterministic AND total (always
        held|violated, never panics); elapsed ≤ bound+tolerance ⇒ held, elapsed > bound+tolerance ⇒
        violated (band applied EXACTLY once, never silently widened); Validate ERRORS for a temporal truth
        with no/zero clock (the clock-required rule), an unparseable/negative tolerance, an empty property,
        or a mirror outside {statechart,tla+,uppaal}; Evaluate reads NO wall clock (calling it twice with
        the same (invariant, observation) yields the identical verdict — the reproducibility mirror).
    Run them; watch them go RED (no temporal package, no temporal body fragment, no statechart/tla+ in the
    mirror cert_language CHECK, no Validate/Evaluate). That red IS the /goal. Do NOT write a truth-test you
    would then satisfy (no inventing a new temporal invariant you'd grade yourself) — mirror the human
    intention only.

(c) TDD red→green→refactor, in back/kernel/temporal ONLY (plus the back/migrations/ file). Outside-in.
    DETERMINISM-FIRST is load-bearing here: Validate, the tolerance-band comparison, and Evaluate are PURE
    deterministic functions — parse the tolerance to a time.Duration, compare the PASSED-IN Observation
    datum, NEVER call time.Now()/sleep/sample a real clock and NEVER reach for an LLM. The clock field
    NAMES which clock the runtime will later sample; this step does not sample it. If a real tool choice
    arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never
    touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx are FIXED; XState
    is client-only in Next, the statechart mirror here is a Go fixture over a statechart transition table —
    do NOT pull a server-side statechart engine unless the grill pins a genuine need + an ADR). The likely
    genuine choices: the canonical-JSONB shape of the temporal fragment (property/clock/tolerance/mirror,
    reusing S02's content-hash scheme — do NOT fork it); the tolerance string format (e.g. Go duration
    "10s") and its parser; whether to add `temporal` to the truth_kind enum (default: NO — keep it a body
    fragment + mirror-cert-language concern unless KRD pins it). Record a short ADR (docs/adr/) ONLY if a
    genuine choice is made (e.g. the tolerance-band symmetry rule, or the mirror cert_language widening).
    The migration is expand-only/append-only: the new temporal fragment is NULLABLE (existing rows
    untouched, NO backfill, NO NOT-NULL flip — mirror S14 EXACTLY), the mirror cert_language CHECK is only
    WIDENED to admit statechart/tla+ (add uppaal ONLY if a row will use it — no dead enum member). GRANTs
    UNCHANGED: the agent role keeps SELECT-only on kernel.truth and mirrors.mirror_record (the wall, §2);
    only the aidos CLI writer role writes truth via an approved ChangeSet. Code only what turns the red set
    green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new statechart mirror + rapid property. Self-certify on the
    COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Evaluate on the four
    rows (4m58s held, 5m04s held-inside-tolerance, 5m20s violated, out-of-order violated) and Validate on
    the no-clock case, state the cause, propose. Check completeness: the temporal-invariant layer has its
    living mirror and the required test_kind is present (KRD §33); no monster (no temporal invariant
    without its mirror; no clock/mirror enum member without a row that uses it — a dead enum member is a
    monster) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED, action-capable, themed + bilingual). Create
    front/web/app/temporal-invariants/ → /temporal-invariants, themed per ADR 0010 (ccup zinc+blue-600
    design tokens, shadcn, Geist, radius 0.5rem — never hardcoded zinc-*/hex) and bilingual per ADR 0011
    (next-intl, FR default + EN, strings in front/web/messages/{fr,en}.json, NO route prefix): the
    "checkout-confirm-within-5m" invariant card (property, clock, tolerance, mirror form) + a live
    evaluation table with an explicit "green band = 5m ± 10s" marker showing 4m58s/5m04s HELD (5m04s marked
    inside-tolerance), 5m20s VIOLATED (red, TEMPORAL_INVARIANT_VIOLATED + how_to_fix), out-of-order
    VIOLATED. Make it ACTION-CAPABLE (§6.7): a propose control (the `action` gesture) that opens an
    idea → mirror → /goal → ChangeSet DRAFT proposal for a new invariant / tolerance change — it does NOT
    write truth from the screen (the wall); plus a read-only "re-evaluate against this observation" control
    that re-runs the pure Evaluate below the line. Read via the SELECT-only role; render the verdict, do
    NOT re-implement the band. Do NOT touch existing routes. Add tests/e2e/temporal-invariants.spec.ts (use
    the playwright-e2e skill) asserting the card (clock/tolerance/mirror/property), the four evaluation rows
    with the 5m20s row red, and that the propose control opens the DRAFT flow with NO direct kernel write.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    temporal is a deep, well-named module under back/kernel/; that Validate/Evaluate are pure (no clock, no
    I/O) and depend on the S02 record substrate + S13 BlockReason without duplicating them; that the
    TemporalInvariant is held DISTINCT from scope.TimeWindow (S15) and from the DAG time axis; that the
    migration/GRANTs keep the wall intact (SELECT-only; expand-only nullable fragment + widened mirror
    enum); boundaries match back/kernel/CONTEXT.md (TemporalInvariant as a §49.3 invariant KIND). Do not
    advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the statechart mirror + rapid property (behaviour proof), and the Next route
    (visualization). Do NOT add a hook (temporal evaluation is a pure decision the later Runtime sensor
    flow calls, not a wall rule; a hook now would be dead — §5 hook-honesty), no MCP server (no new backend
    capability; mirror-runner/telemetry-reader are other steps), no skill (no distinct repeatable gesture
    beyond declare-source/derive-mirror), no model-checker / TLA+ / UPPAAL runner (a rare T2 cap, §778 —
    out of slot), no codegen (nothing to emit from a temporal invariant here), and NO real-clock read. A
    new artifact may ADD a guardrail, never REMOVE one.

MINTLIFY DOCS MANDATE (every step, no exception): ship this step's "Pour moi" pages on aidos.mintlify.app
(repo steph-frtech/docs, clone .aidos-docs/) — a concept page (steps/concept/s50-temporal-invariant.mdx)
AND an internals page (steps/internals/s50-temporal-invariant.mdx) carrying the three layers
Implémentation · Méta · Méta-méta; update the "Pour les futurs utilisateurs" guide if this ships a
user-facing capability (the /temporal-invariants panel + the "declare a time property" concept qualify).
Prose FRENCH (vous); KRD terms verbatim. Phase (a) writes the concept page + the Méta/Méta-méta layers;
Implémentation is completed at green. The step is NOT done until the "Pour moi" pages are live — mint
validate + mint broken-links clean, pushed to steph-frtech/docs main, verified via mcp__mintlify-aidos.

LINEAR (the work tracker, CLAUDE.md §11): move the S50 step issue to In Progress at start and to Done only
when green ∧ verified; file/refresh any ADR issue this step lands. MCP-first (mcp__linear-server__*), AIDOS
project aidos-2a9085453be8.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, an enum member, or a business-rule. If a clock value beyond
  {system,external,logical}, a mirror form beyond {statechart,tla+,uppaal}, the tolerance format/semantics,
  the tolerance-band symmetry, a BlockReason code, or whether `temporal` is a §13.4 truth_kind is NOT
  pinned by KRD §49.3/§13.4/§44.5 / an existing migration / ADR / CONTEXT.md, do NOT guess — record an
  OpenQuestion (provenance) and STOP on that branch. Do NOT invent a §13.4 truth_kind member; do NOT add a
  dead enum member (uppaal only if a row uses it).
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The statechart
  mirror is a means-test toward the human red, not a new truth.
- Any change to a prior contract (S02 records, the S14 truth-typing surface / truth_kind enum, the S06
  mirror_record / cert_language enum, S15 TruthScope.TimeWindow, the BlockReason shape, the wall GRANTs)
  goes through a ChangeSet + SemanticDiff (S20/S21). Add new files; never silently rewrite a prior
  artifact, never hand-edit back/gen/**. The migration is expand-only/append-only (nullable fragment +
  widened CHECK only).
- DETERMINISM-FIRST (CLAUDE.md §6/§8): Validate/Evaluate/the tolerance band are pure deterministic code —
  no time.Now(), no sleep, no real clock, no LLM. The reproducibility mirror (same (invariant, observation)
  → same verdict) is mandatory. An agent/LLM doing what this pure function could is a determinism gap that
  blocks the step.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the statechart mirror passes — Evaluate(invariant, obs{elapsed:5m20s})
is `violated` with a TEMPORAL_INVARIANT_VIOLATED BlockReason whose how_to_fix points at confirming within
5m or compensating (THE done criterion: the property reddens on a real violation), WHILE
Evaluate(invariant, obs{elapsed:5m04s}) is `held` (the declared tolerance keeps the case green — no flake);
the out-of-order observation is `violated`; the rapid invariant holds (Evaluate total + deterministic, the
tolerance band applied exactly once, the clock-required rule on Validate, no wall-clock read); GRANTs prove
SELECT-only on kernel.truth and mirrors.mirror_record; the migration is append-only/expand-only (nullable
temporal fragment + widened mirror cert_language enum); /temporal-invariants renders the invariant + the
evaluation table with the violated row red, the propose control opens a DRAFT (no direct kernel write), and
a passing Playwright e2e; the Mintlify "Pour moi" pages are live and clean. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (TemporalInvariant statechart mirror, rapid property), where stored (mirrors
  schema) and materialized (tests/).
- Tests run: command + pass/fail counts (statechart mirror/fixture, rapid/go test, biome, eslint,
  playwright).
- UI route: /temporal-invariants — what it renders (invariant card, evaluation table with the tolerance
  band, the violated row red, the action-capable propose control), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent); any
  prior-contract change (S02 records, S14 truth-typing, S06 mirror cert_language enum, S15 TimeWindow,
  BlockReason, wall GRANTs) → ChangeSet + SemanticDiff (note the change_type), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Mintlify: the two "Pour moi" pages (paths), mint validate + broken-links result, pushed + verified.
- Linear: the S50 issue status; any ADR issue filed.
- Known limits: e.g. no runtime sensor sampling a real clock yet (Observations are passed in), no
  model-checker / TLA+ / UPPAAL runner, the tolerance-band symmetry decision, whether `temporal` is a
  truth_kind, clock values supported, mirror forms supported, BlockReason codes supported.
- Next safe step: the smallest stable next tooth (e.g. the Runtime sensor that samples the declared clock
  and feeds Observations into Evaluate, or wiring the temporal verdict into the completeness/Stop gate) and
  why it is safe to chain.
```
