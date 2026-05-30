# S21 — SemanticDiff (add/refine/override/rescope/reweight/deprecate) + `aidos diff`

Subsystem: AIDOS Runtime | Home: `back/runtime/semanticdiff` | Workbench route: `/semantic-diff`

## Objectif

Land the **SemanticDiff classifier** of KRD §44.1: a pure Runtime function that, given a prior kernel version (`old@hash`) and a proposed one (`new@hash`), reads the *nature* of the change — `add · refine · override · rescope · reweight · deprecate` (within the closed §44.1 set) — instead of a textual line diff, and wire it as `aidos diff` so the Workbench can say "you are turning a statistical UX hypothesis into an active product truth; required authority: …" rather than dumping a YAML patch.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (a Go package), a **capability** (the `aidos diff` CLI wiring — it reads two kernel versions and emits a SemanticDiff), a **behaviour proof** (a fixture + property mirror), a **replayable gesture** (a Skill — the human reruns "diff this proposed change" identically), and a **visualization** (a Next route). Nothing more:

- **Go package** `back/runtime/semanticdiff/` — the `SemanticDiff` AST per KRD §44.1: `change_type ∈ {add, refine, override, rescope, reweight, deprecate}` (the six this step lands, drawn from the **closed** §44.1 set `{add, refine, override, deprecate, rescope, reauthorize, reweight, replace_mirror}` — `reauthorize` and `replace_mirror` are **out of scope here**, see below; unknown types rejected), plus `blast_radius`, `requires_authority`, `red_wave` fields **referenced** from prior contracts, not recomputed. A pure `Classify(old, new) → SemanticDiff` over **two kernel artifact versions** (`old`/`new` = the canonical JSONB body + its `version@hash` from S02), no DB write, no clock/RNG. The classification rule, anchored to the done criterion and KRD §11 (the three operations classified by replay) and §44.1:
  - **`add`** — `new` pins a behaviour in a region no prior contract touches (extension in free space, KRD §11: safe by construction).
  - **`refine`** — `new` adds a strictly more specific constraint under an existing one **without contradicting it** (KRD §11: safe iff consistent).
  - **`override`** — `new` changes what an existing constraint says. **The done criterion**: an **incompatible `enabled_when`** (an Expr-DSL condition, S08/S11) on the same control ⇒ `override` (a revoked promise; KRD §11/§12: dangerous, human, traced).
  - **`rescope`** — the change is a `TruthScope` move (S15: e.g. cell/target set widened or narrowed) with the rule body otherwise intact. **The done criterion**: a **scope change = `rescope`**, not an `override`.
  - **`reweight`** — the change is only a `composes`-link `weight` move `{cosmetic ↔ load-bearing}` (KRD §96). **The done criterion**: **cosmetic → load-bearing = `reweight`** — a re-qualification of importance, distinct from changing the rule itself.
  - **`deprecate`** — `new` sets a `TruthLifecycle.status` to `deprecated/shadowed` (S—lifecycle; KRD §44.2: a truth dies by versioned succession, never deletion), the body otherwise unchanged.
  - `Classify` is **total and deterministic**: same `(old, new)` ⇒ same `change_type`; it never panics; an unrecognized shape yields an explicit "unclassifiable → OpenQuestion", never a guessed type.
- **`aidos diff` wiring** (`back/cmd/aidos/`, the capability surface) — `aidos diff <id> --from <version> --to <version>` (or `--to <draft-changeset>`): reads the two kernel versions via the **SELECT-only** agent role (or the changeset draft), calls `Classify`, prints the SemanticDiff (`change_type`, referenced `blast_radius`/`requires_authority`/`red_wave`). Read-only — `aidos diff` **never writes truth**; it reports the nature of a *proposed* change so a human can decide. (KRD §82.1: `krd diff` → `aidos diff` produces the SemanticDiff.)
- **BDD mirror** — a **fixture** mirror (`state → command → events`: two kernel versions `old`/`new` → `Classify` → the `change_type`) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. These ARE the done criteria (below).
- **Skill** `.claude/skills/semantic-diff/` (`SKILL.md`) — the replayable gesture "classify a proposed kernel change": load `old@hash` + `new@hash`, run `aidos diff`, read the `change_type`, and route by it (an `override`/`rescope`/`deprecate` needs `requires_authority` above the line + a ChangeSet + ADR; an `add`/`refine`/`reweight` may proceed below). One gesture, replayed identically — justifying a Skill per §5.
- **Next route** `front/web/app/semantic-diff/` → `/semantic-diff` — the Workbench panel that renders the SemanticDiff in human language, not as a YAML patch (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no Postgres migration** — `Classify` reads existing kernel rows (S02/S14/S15/S16); it adds no truth table. **No new hook** — no new non-bypassable rule; the wall GRANT (S04) and the completeness/ChangeSet gate (S—changesets) already exist and are only *referenced*. **No `reauthorize` / `replace_mirror`** classification — `reauthorize` rides the AuthorityGraph (S16) and `replace_mirror` rides the mirror plane (S06); landing them is a later step, not this one (do not invent their rules here). **No red-wave / `aidos impact` computation** — `red_wave` is *referenced* from the S17 link substrate, never recomputed here. **No truth write** — `aidos diff` is read-only; applying a change is the ChangeSet path, owned elsewhere. **No codegen/emitters.**

## Test minimal (done)

**Done = scope change ⇒ `rescope`; incompatible `enabled_when` ⇒ `override`; cosmetic → load-bearing ⇒ `reweight`.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: runtime.semanticdiff.Classify · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "an incompatible enabled_when is an override"            # THE done criterion
    state   (old): control "checkout-button" { enabled_when: "$.form.valid && !$.submitting" } @v1
    command (new): control "checkout-button" { enabled_when: "$.form.valid" }                  @v2   # promise revoked
    events:  [ change_type == override ]                           # KRD §11/§12 — a changed existing constraint

  fixture "a scope change is a rescope, not an override"           # THE done criterion
    state   (old): rule "refund-policy" { scope: { cells: ["EU"] } }            @v1
    command (new): rule "refund-policy" { scope: { cells: ["EU","US"] } }       @v2   # body identical, scope widened
    events:  [ change_type == rescope ]                            # KRD §44.1 — a TruthScope move (S15), not a body change

  fixture "cosmetic to load-bearing is a reweight"                 # THE done criterion
    state   (old): composes(parent="checkout", child="help-link") { weight: cosmetic }      @v1
    command (new): composes(parent="checkout", child="help-link") { weight: load-bearing }  @v2
    events:  [ change_type == reweight ]                           # KRD §96 — a weight re-qualification, not the rule

  fixture "a constraint in free space is an add"
    state   (old): (no constraint touches the promo-banner region)
    command (new): control "promo-banner" { visible_when: "$.promo.active" } @v1
    events:  [ change_type == add ]                               # KRD §11 — extension, safe by construction

  fixture "a stricter consistent constraint is a refine"
    state   (old): policy "session" { allow: "creds.valid" }                          @v1
    command (new): policy "session" { allow: "creds.valid", deny_after: "3 fails" }   @v2   # narrows, no contradiction
    events:  [ change_type == refine ]                            # KRD §11 — refinement, safe iff consistent

  fixture "a lifecycle move to deprecated is a deprecate"
    state   (old): rule "legacy-checkout" { lifecycle: active }      @v3
    command (new): rule "legacy-checkout" { lifecycle: deprecated }  @v4   # body unchanged, status superseded
    events:  [ change_type == deprecate ]                         # KRD §44.2 — death by succession, not deletion

  fixture "an unclassifiable change becomes an OpenQuestion, never a guess"
    state   (old): rule "x" { … }            @v1
    command (new): rule "x" { …shape Classify cannot map… } @v2
    events:  [ Classify yields unclassifiable → OpenQuestion (provenance), NOT a fabricated change_type ]
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: semanticdiff.Classify · test_kind: property · cert_language: rapid · authority: below
  ∀ old,new:   Classify is deterministic — same (old,new) ⇒ same change_type; and change_type ∈ {add,refine,override,rescope,reweight,deprecate} ∨ unclassifiable
  ∀ old:       Classify(old, old) ⇒ no change (identity ⇒ empty/no-op diff, never a spurious type)
  ∀ old,new:   a scope-only delta (TruthScope changed, body equal) ⇒ rescope  (never override)
  ∀ old,new:   a weight-only delta (composes weight changed, rule equal) ⇒ reweight  (never override)
  ∀ old,new:   an enabled_when (Expr) that is not implied by the old one ⇒ override  (an incompatible condition is a revoked promise)
  ∀ old,new:   Classify never panics — a malformed/partial pair yields a status (or unclassifiable), not a crash
  ∀ old,new:   Classify never WRITES — it is pure over (old,new); no DB mutation, no clock, no RNG
  ```

Both start **red** (no `semanticdiff` package, no `Classify`, no `aidos diff` subcommand). That red **is** the `/goal`. The fixture mirror is a **means-test toward the human red** (scope→rescope, incompatible `enabled_when`→override, cosmetic→load-bearing→reweight) — not a new truth the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/semantic-diff/page.tsx` (new route `/semantic-diff`; do not touch existing routes). A read-only panel that takes a kernel `id` + a `from`/`to` version pair (via the SELECT-only role / a draft changeset), calls the same `Classify` result that `aidos diff` emits, and renders it **in human language, not a YAML patch** (KRD §44.1): a prominent `change_type` badge (`override` / `rescope` / `reweight` / `add` / `refine` / `deprecate`), the plain-language sentence ("you are revoking the checkout button's enabled-when promise — required authority: …; this triggers a red wave on its mirror"), and the referenced `blast_radius` / `requires_authority` / `red_wave`. With the three canonical examples it shows the incompatible `enabled_when` pair as **override**, the EU→EU+US scope pair as **rescope**, and the help-link cosmetic→load-bearing pair as **reweight** — the classification rendered, not re-implemented in the front-end.
- **Playwright e2e:** `tests/e2e/semantic-diff.spec.ts` — navigate to `/semantic-diff`, load the three canonical pairs, and assert the done criteria are **visible in the UI**: the incompatible-`enabled_when` pair shows `override`, the widened-scope pair shows `rescope` (not `override`), and the cosmetic→load-bearing pair shows `reweight`. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/runtime/semanticdiff/**`, the `aidos diff` subcommand wiring in `back/cmd/aidos/**` (new subcommand only, no change to existing subcommands), the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/semantic-diff.spec.ts`, `.claude/skills/semantic-diff/**`, and `front/web/app/semantic-diff/**` — and otherwise **adds new files**. It defines one new contract (the `SemanticDiff` AST shape, the six landed `change_type` values + their classification rule, the `Classify` signature, the read-only `aidos diff`); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes or CLI subcommands, no new truth table. Any change to a **prior contract** it depends on — the S02 record substrate / content-hash, the Expr-DSL `enabled_when` shape (S08), the control shape (S11), the `TruthScope` shape (S15), the AuthorityGraph (S16), the `composes` weight set (KRD §96), the link/red-wave substrate (S17), the wall GRANTs (S04) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit. (S21 *computes* the SemanticDiff; it must itself respect the SemanticDiff discipline for any prior-contract touch.)

## Prompt a lancer

```text
You are step-executor for AIDOS step S21 — "SemanticDiff (add/refine/override/rescope/reweight/deprecate) +
aidos diff". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write
grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/runtime/semanticdiff ONLY (plus
the new aidos diff subcommand wiring in back/cmd/aidos). Follow the CLAUDE.md §6 per-step loop IN ORDER. Never
go prompt → code.

Read BEFORE touching anything: KRD.md §44.1 (SemanticDiff — read the NATURE of a change, not a text diff:
change_type ∈ the CLOSED set {add, refine, override, deprecate, rescope, reauthorize, reweight, replace_mirror};
this step lands SIX of them — add, refine, override, rescope, reweight, deprecate — and explicitly NOT
reauthorize / replace_mirror), §11 (the three operations classified by replay: add = free-space extension,
refine = consistent narrowing, override = changing what a constraint says), §12 (a version is the licence to
change; an override is a recorded decision, not an edit), §44.2 (TruthLifecycle — a truth dies by versioned
succession ⇒ deprecate), §96 (composes weights {cosmetic, load-bearing} ⇒ reweight), §82.1 (krd/aidos diff
produces the SemanticDiff). Read CONTEXT-MAP.md + back/runtime/CONTEXT.md (and back/kernel/CONTEXT.md for the
contracts it reads) and the prior steps' specs it depends on: S02 (records substrate / content-hash), S04 (the
wall / GRANTs), S08 (Expr DSL — enabled_when), S11 (control / action), S15 (TruthScope), S16 (AuthorityGraph),
S17 (links / red-wave substrate), and the changesets step. For any Next.js 16, Atlas, or Go API doubt use
context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language against KRD §44.1: a SemanticDiff reads the NATURE of a change between two KERNEL VERSIONS
    (old@hash → new@hash), not a textual line diff; the change_type set is CLOSED. Sharpen each verb:
    "override" = changing what an existing constraint SAYS (a revoked promise) — an incompatible enabled_when
    on the same control is an override; "rescope" = a TruthScope move (S15) with the body otherwise intact —
    a scope change is a rescope, NOT an override; "reweight" = a composes weight move {cosmetic↔load-bearing}
    (§96) — cosmetic→load-bearing is a reweight, distinct from changing the rule; "add" = free-space extension;
    "refine" = a consistent strictly-stricter constraint; "deprecate" = a TruthLifecycle status move (§44.2).
    This step delivers the CLASSIFIER + read-only aidos diff, NOT reauthorize/replace_mirror (owned by S16 /
    S06, later), NOT the red-wave/impact computation (referenced from S17), NOT any truth write. Sharpen each
    term against the CONTEXT.md files; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every
    branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = the OLD kernel version
        (old@hash); command = the NEW kernel version (new@hash); events = the classified change_type. Cover the
        three done criteria explicitly — incompatible enabled_when ⇒ OVERRIDE ; EU→EU+US scope (body equal) ⇒
        RESCOPE (not override) ; help-link cosmetic→load-bearing ⇒ REWEIGHT — plus free-space ⇒ ADD,
        consistent-narrowing ⇒ REFINE, lifecycle active→deprecated ⇒ DEPRECATE, and an unmappable shape ⇒
        UNCLASSIFIABLE → OpenQuestion (NEVER a fabricated type).
      - PROPERTY (rapid, ∀, below the line): Classify is deterministic and total (change_type ∈ the six ∨
        unclassifiable); Classify(old,old) ⇒ no change; a scope-only delta ⇒ rescope (never override); a
        weight-only delta ⇒ reweight (never override); an enabled_when not implied by the old ⇒ override;
        Classify never panics and never WRITES (pure over (old,new); no DB, no clock, no RNG).
    Run them; watch them go RED (no semanticdiff package, no Classify, no aidos diff subcommand). That red IS
    the /goal. Do NOT write a truth-test you would then satisfy (do not invent a new classification rule you'd
    grade yourself) — mirror the human intention only; the fixture is a means-test toward the human red.

(c) TDD red → green → refactor in back/runtime/semanticdiff ONLY (plus the aidos diff subcommand in
    back/cmd/aidos). Outside-in. Build: the typed SemanticDiff AST (closed six-value change_type enum +
    unclassifiable), and a pure Classify(old, new) → SemanticDiff — no I/O, no clock/RNG, NO write; a pure
    function of the two kernel versions. Wire aidos diff <id> --from <v> --to <v> to READ the two versions via
    the SELECT-only agent role (or a draft changeset) and print the SemanticDiff (change_type + referenced
    blast_radius/requires_authority/red_wave). Within the frozen slots, if a REAL tool choice arises, search AT
    MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog, rapid, the
    fixture/Operation-DSL interpreter, sqlc/pgx, the Go MCP SDK are fixed). The likely genuine choices: the
    JSONB-body comparison/structural-equality approach for detecting "body equal, scope/weight changed" (REUSE
    S02's Canonicalize/Hash — do NOT fork it) and the CLI arg/format shape (reuse the cmd/aidos convention from
    S03). Record a short ADR (docs/adr/) ONLY if a genuine choice is made. Classify reads existing kernel rows
    (S02/S08/S11/S14/S15/S16) — it adds NO truth table and writes NO truth. Code only what turns the red set
    green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only;
    never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Classify on the override /
    rescope / reweight cases, state the cause, propose. Check completeness: runtime.semanticdiff.Classify has
    its living mirror (the fixture + property); no monster (no truth without a mirror, no orphan mirror, no
    fabricated change_type admitted in place of unclassifiable) — else Stop blocks. Do not finish a code step
    without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/semantic-diff/ →
    /semantic-diff: take a kernel id + from/to version pair (SELECT-only role / draft changeset), call the same
    Classify result aidos diff emits, and render it in HUMAN LANGUAGE, not a YAML patch (§44.1): a change_type
    badge + a plain sentence ("you are revoking the checkout button's enabled-when promise — required
    authority: …; red wave on its mirror") + referenced blast_radius/requires_authority/red_wave. Show the
    incompatible-enabled_when pair as OVERRIDE, the EU→EU+US pair as RESCOPE, the help-link cosmetic→load-bearing
    pair as REWEIGHT. Render the classification, do not re-implement it. Do NOT touch existing routes. Add
    tests/e2e/semantic-diff.spec.ts (use the playwright-e2e skill) asserting the three done criteria are visible
    in the UI: override, rescope (not override), reweight.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    semanticdiff is a deep, well-named module (SemanticDiff/Classify/change_type cleanly separated, the
    change_type set closed and obvious, override/rescope/reweight distinct and non-overlapping), that Classify
    is pure and reuses S02's canonicalize/hash + the S15/S16 shapes without duplicating them, that aidos diff
    stays read-only (the wall intact — no truth write), and that boundaries match back/runtime/CONTEXT.md. Do
    not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic), the aidos diff CLI wiring
    (the read-only capability surface), the fixture + rapid property (behaviour proof), the Skill
    /semantic-diff (the replayable "classify a proposed change" gesture), and the Next route (visualization).
    Do NOT add a Postgres migration (no new truth table — Classify reads existing rows), a hook (no new
    non-bypassable rule — the wall + ChangeSet gate already exist), or an MCP server (aidos diff is the surface;
    no new backend op is justified at S21). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The change_type set is CLOSED (KRD §44.1) — do not add
  a type KRD does not name, and do not land reauthorize/replace_mirror here (out of scope). If the exact
  TruthScope shape (S15), the enabled_when/Expr shape (S08), the composes weight set (§96), the
  content-hash/canonicalize scheme (S02), or where the two kernel versions are read from are not pinned by
  KRD / an existing migration / a referenced step, do NOT guess — record an OpenQuestion (provenance) and STOP
  on that branch. When Classify cannot map a change, it MUST emit "unclassifiable → OpenQuestion", NEVER a
  fabricated change_type. The example artifacts (checkout-button, refund-policy, help-link, promo-banner,
  session, legacy-checkout) are reused from prior pinned steps; do not coin new ones.
- You NEVER write a truth-test (a new classification invariant you would then satisfy — the circularity). The
  fixture and property are means-tests toward the human red (scope→rescope, incompatible enabled_when→override,
  cosmetic→load-bearing→reweight), not new truths.
- Any change to a prior contract (S02 records/hash, S08 enabled_when, S11 control, S15 TruthScope, S16
  AuthorityGraph, §96 weights, S17 links/red-wave, S04 wall GRANTs) goes through a ChangeSet + SemanticDiff.
  Add new files; never silently rewrite a prior artifact, never hand-edit back/gen/**. An override is a
  recorded decision (ChangeSet + ADR + provenance), not an edit. aidos diff itself NEVER writes truth.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the Classify fixtures pass — an incompatible enabled_when is an OVERRIDE, a
scope change is a RESCOPE (not an override), a cosmetic→load-bearing move is a REWEIGHT (the three done
criteria); free-space ⇒ add, consistent-narrowing ⇒ refine, active→deprecated ⇒ deprecate; an unmappable shape
⇒ unclassifiable→OpenQuestion (never a fabricated type); the rapid invariants hold (determinism, totality,
identity⇒no-change, scope-only⇒rescope, weight-only⇒reweight, no panic, NO write); aidos diff prints the
SemanticDiff read-only; /semantic-diff renders override/rescope/reweight in human language with a passing
Playwright e2e; the wall proves aidos diff writes no truth. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized
  (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /semantic-diff — what it renders (change_type badge + human-language sentence + referenced
  blast_radius/authority/red_wave), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (S21 adds no truth; aidos diff is read-only) — any prior-contract
  change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. reauthorize/replace_mirror not landed (later), no red-wave/impact computation (referenced
  from S17), aidos diff read-only (apply is the ChangeSet path), no migration/hook/MCP, the kernel-version-read
  source assumption.
- Next safe step: the smallest stable next tooth (e.g. landing reauthorize via the S16 AuthorityGraph, or wiring
  SemanticDiff into the ChangeSet DRAFT→APPLIED gate so requires_authority is enforced) and why it is safe to
  chain.
```
