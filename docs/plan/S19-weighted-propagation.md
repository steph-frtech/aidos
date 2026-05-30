# S19 — Weighted, thresholded propagation along `composes` (cosmetic / load-bearing / critical) + weight evidence

Subsystem: AIDOS Kernel | Home: `back/kernel/propagation` | Workbench route: `/red-propagation`

## Objectif

Make the red wave **weighted and thresholded** instead of a blind cascade along `composes` (KRD §112, §2339 point 6): each `composes` link carries a **declared** weight, the parent carries a **declared** `activation_threshold`, and the parent's emergent aggregate only **reddens** when the cumulative activation of changed children crosses the threshold — so a **cosmetic** change does **not** redden the parent, while a **load-bearing** change does. A `critical` weight is the strongest tier and, being an above-the-line commitment, is **rejected at admission unless it carries weight evidence** (the §2463 backprop discipline: a link is only re-weighted upward on recorded evidence such as a prod incident, never on a hunch).

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (Go package), **persistence** (Atlas migration for the weights/threshold substrate), a **behaviour proof** (BDD mirror), and a **visualization** (Next route) — and nothing more. It does **not** warrant a new hook, MCP server, or skill (justified below).

- **Go package** `back/kernel/propagation/` — the pure propagation engine over the S18 `composes` graph (the composition links landed by the prior composition step). It exposes:
  - the `Weight` enum **exactly** as KRD §112/§113 plus this step's declared extension: `cosmetic`, `load-bearing`, and `critical`. `cosmetic` and `load-bearing` are the frozen §112 pair; `critical` is the strongest tier introduced **here** as a declared truth (see honesty note — the enum extension is itself an above-the-line decision recorded as an ADR/OpenQuestion, not invented in passing).
  - `Activation(weight) → int` and `Threshold` carried by the parent (`activation_threshold`, declared, above-the-line, never learned — KRD §113, §2465).
  - `FireParent(parent, changedChildren) → AggregateVerdict` implementing the §112 rule: `activation ← Σ Activation(weight(composes(parent, c)))` over changed children; if `activation ≥ threshold(parent)` the parent aggregate goes **RED** (its emergent invariant is re-opened); else it stays **GREEN**. Pure, deterministic, total — no DB, no clock, no I/O; it reads a graph value + a changed-set and returns a verdict.
  - `ValidateWeight(link) → error` enforcing the admission rule: a link declared `critical` **without** attached `weight_evidence` (a recorded provenance reference — e.g. an incident id) is **rejected** with a `BlockReason` (KRD §44.5: `code`, `severity`, `explanation`, `how_to_fix[]`) e.g. `code: "CRITICAL_WEIGHT_WITHOUT_EVIDENCE"`, `how_to_fix: [attach_incident_evidence, downgrade_to_load_bearing]`. `cosmetic`/`load-bearing` need no evidence.
  - The engine **reads** weights/thresholds from the truth substrate; it never writes truth (the wall). `authority: below` for the propagation *computation* (the engine enforces the rule); the weights and thresholds it reads are `authority: above` (declared by the human).
- **Atlas migration** (`back/migrations/`, declarative, expand-only, append-only) — the **weights table** carrying the per-link weight as a typed, content-addressed truth: add `weight text NOT NULL` (with a `CHECK` constraint pinning it to the exact `cosmetic | load-bearing | critical` enum), `weight_evidence text NULL` (a provenance reference, required iff `weight = 'critical'`, enforced by a `CHECK (weight <> 'critical' OR weight_evidence IS NOT NULL)`), and the parent's `activation_threshold int` on the composite layer record. Reuse the S18 `composes` link substrate and the S02 content-hash record scheme — **do not fork** either. GRANTs: the agent DB role gets **SELECT only** on the weights/threshold columns (the wall, §2). Only the `aidos` CLI role writes truth, via an approved ChangeSet. Expand-only: it appends columns to the existing `composes`/composite records; it never alters, drops, or backfills a prior column (no `NOT NULL` flip on a pre-existing column this step).
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **weighted-propagation fixture** (`reflects: kernel.propagation`, `test_kind: fixture`, `cert_language: fixture`, `authority: above`): the §114 worked example (`view "cart"` composes `checkout-button` load-bearing, `promo-field` load-bearing, `help-link` cosmetic) with `{changed_children, weights, threshold} → aggregate verdict`. Plus a **property invariant** (rapid, `authority: below`) on `FireParent`/`ValidateWeight`. These **are** the done criteria (see below). Use a fixture for the workflow-shaped `state → fire → verdict` truth (frozen N2 slot), rapid for the ∀ (frozen N1 slot) — match the truth form; do not write Godog for an invariant.
- **Next route** `front/web/app/red-propagation/` → `/red-propagation` — the Workbench panel rendering the composition tree with each link's weight (thickness/label), the parent threshold, and the live fire result: the cosmetic-only change leaving the parent **green**, the load-bearing change turning the aggregate **red**, and a `critical`-without-evidence link shown **rejected** with its `BlockReason` (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no hook** — propagation is a *verdict the red-wave/`/goal` flow computes*, not a non-bypassable wall rule, and the S04 wall hook already guards `kernel.*` and the `PostKernelChange` red-wave firing is its own runtime step; a new hook would need its own fault-injection test and a real failed run first (§5 hook honesty). **No MCP server** — no new backend capability is exposed; `FireParent`/`ValidateWeight` are pure logic called in-process (the `store` / `changeset` MCPs are other steps). **No skill** — weighting a link is not yet a distinct repeatable multi-step gesture. **No codegen / sqlc / Pact**, **no `reweight` SemanticDiff executor** (the actual re-weighting of a live link is a ChangeSet `change_type: reweight` operation, KRD §44.1 / line 870 — this step lands the *typed weight + admission rule + propagation engine*, not the re-weighting workflow). **No learned weights** — weights and thresholds are declared, never trained (§2465, §2467).

## Test minimal (done)

**Done = a cosmetic change does not redden the parent; a critical weight without evidence is rejected.** Restated **failing-first** as the red BDD mirror to write **before** any engine code, conceptually stored in the `mirrors` schema and materialized for the runner. It must be **RED** on first run (no `back/kernel/propagation` package, no `FireParent`/`ValidateWeight`, no weight/threshold columns).

- **Weighted-propagation fixture** (`cert_language: fixture`, `authority: above`) — reflects `kernel.propagation` over the §114 `view "cart"` example:

  ```
  # mirrors schema · reflects: kernel.propagation "cart-weighted" · test_kind: fixture · authority: above
  mirror reflects "cart-weighted" {
    composite view "cart" { activation_threshold: 1 }
    composes "cart" -> control "checkout-button" { weight: load-bearing }
    composes "cart" -> control "promo-field"     { weight: load-bearing }
    composes "cart" -> control "help-link"       { weight: cosmetic }

    # Scenario B (§114): cosmetic change does NOT redden the parent  ← THE done case
    given changed_children { "help-link" }
      -> activation < threshold
      -> aggregate("cart") == "green"

    # Scenario A (§114): a load-bearing change DOES redden the parent
    given changed_children { "checkout-button" }
      -> activation >= threshold
      -> aggregate("cart") == "red"        # emergent invariant re-opened

    # admission: a critical weight WITHOUT evidence is rejected  ← THE done case
    given declare composes "cart" -> control "promo-field" { weight: critical, weight_evidence: <none> }
      -> validation == "rejected"
      -> block_reason.code == "CRITICAL_WEIGHT_WITHOUT_EVIDENCE"
      -> block_reason.how_to_fix contains "attach_incident_evidence"

    # admission: a critical weight WITH evidence is accepted (and counts as the strongest tier)
    given declare composes "cart" -> control "promo-field" { weight: critical, weight_evidence: "INC-2026-014" }
      -> validation == "accepted"
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any composition graph, any declared weights and any changed-set, `FireParent` is **deterministic** and **total** (always exactly `green | red`); a changed-set containing **only** `cosmetic` links can **never** push activation `≥ threshold` when the threshold exceeds the cosmetic activation (the cosmetic-does-not-redden invariant); any `critical` link without `weight_evidence` ⇒ `ValidateWeight` returns a non-empty `BlockReason` (no critical admission without evidence = no monster); `critical` activation `≥` `load-bearing` activation `≥` `cosmetic` activation (tier ordering is monotone). Do not invent an invariant the human intention does not state (CLAUDE.md §8).

All start **red**. That red **is** the `/goal`. The canonical done case is green only when (1) `FireParent("cart", {"help-link"})` returns `green` — a cosmetic change does not redden the parent — and (2) `ValidateWeight` on a `critical` link with no `weight_evidence` returns `rejected` with a `CRITICAL_WEIGHT_WITHOUT_EVIDENCE` `BlockReason`.

## Visualisation UI

- **Workbench route:** `front/web/app/red-propagation/page.tsx` (new route `/red-propagation`; do not touch existing routes). It renders, read-only, the `view "cart"` composition tree: each `composes` link drawn with its **weight** (cosmetic = thin, load-bearing = thick, critical = thickest, per §2362 "épaisseur du lien"), the parent's `activation_threshold`, and a live **fire table** — the §114 scenario rows with their computed activation and aggregate verdict, plus the admission rows for `critical` weights. With the canonical example: the `help-link` (cosmetic) change row shows the `cart` aggregate **green** (activation < threshold); the `checkout-button` (load-bearing) change row shows the aggregate **red** (activation ≥ threshold, emergent invariant re-opened); the `critical`-without-evidence declaration row shows **rejected** in red with `CRITICAL_WEIGHT_WITHOUT_EVIDENCE` + `how_to_fix`; the `critical`-with-evidence row shows **accepted**. Reads via the SELECT-only role; renders the fixture verdict, does not re-implement it. Plain React state (no XState unless local panel state genuinely needs it).
- **Playwright e2e:** `tests/e2e/red-propagation.spec.ts` — navigate to `/red-propagation`; assert the tree names `view: cart` with `activation_threshold: 1` and lists `help-link` as `cosmetic`, `checkout-button` as `load-bearing`; assert the fire table shows the cosmetic (`help-link`) change row as `green`, the load-bearing (`checkout-button`) change row as `red`, the `critical`-without-evidence row as `rejected` with `CRITICAL_WEIGHT_WITHOUT_EVIDENCE`, and the `critical`-with-evidence row as `accepted`. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, ordered assertions, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/propagation/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored weighted-propagation fixture/property materialized to `tests/`, `tests/e2e/red-propagation.spec.ts`, and `front/web/app/red-propagation/**` — and otherwise **adds new files**. It introduces a new contract (the `Weight` enum incl. the `critical` extension, the `weight_evidence` requirement, the `activation_threshold` field, the `FireParent`/`ValidateWeight` semantics and `BlockReason` codes) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table or column. Any change to a **prior contract** it depends on — the S18 `composes` link substrate, the S02 record/content-hash scheme, the `BlockReason` shape (KRD §44.5), the `Mirror.aggregate` rule (§113), or the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. Re-weighting a live link (e.g. cosmetic → load-bearing after an incident, §2463) is exactly a `reweight` SemanticDiff change_type (KRD §44.1, line 870), not an edit — and that executor is a later step, not this one. An override is a recorded decision (ChangeSet + ADR + provenance).

## Prompt a lancer

```text
You are step-executor for AIDOS step S19 — "Weighted, thresholded propagation along composes
(cosmetic / load-bearing / critical) + weight evidence". Stack is FROZEN: back=Go, truth=Postgres
(append-only, content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js
(the Workbench). Home = back/kernel/propagation ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER.
Never go prompt → code.

Read BEFORE touching anything: KRD.md §112 (la propagation pondérée et seuillée — "tous les changements
d'un enfant ne devraient pas rougir le parent"; chaque lien composes porte un poids load-bearing |
cosmetic; le parent porte un activation_threshold; fire_parent: activation ← Σ poids(enfants changés),
si activation ≥ seuil alors agrégat ROUGE sinon vert; "épingle un défaut, pas un changement"), §113 (le
Layer enrichi: composes -> [{child, version, weight}], activation_threshold DÉCLARÉ above-the-line jamais
appris; Mirror.aggregate: GREEN ⟺ own_mirror GREEN ∧ ∀ enfant: child.aggregate GREEN), §114 (l'exemple
filé bouton→vue→produit: view "cart" composes checkout-button(load-bearing), promo-field(load-bearing),
help-link(cosmetic); Scénario A load-bearing rougit l'agrégat, Scénario B cosmétique le laisse vert),
§2463 (le sens backprop = la boucle externe: un incident révèle qu'un lien cru cosmétique est porteur →
on le re-pondère — c'est l'origine de la "weight evidence"), §2465/§2467 (le garde-fou: poids et seuils
sont des vérités DÉCLARÉES above-the-line, JAMAIS apprises; on emprunte la topologie, on refuse le réseau
de neurones appris dans le jugement), §44.5 (BlockReason: code, severity, explanation, how_to_fix[] —
tout refus actionnable), §44.1 / line 870 (SemanticDiff change_type incl. reweight). Read CONTEXT-MAP.md
+ back/kernel/CONTEXT.md (Layer, source/projection, composes, aggregate, waterline, declared-not-learned)
and the prior steps' specs (esp. S18 composes/composition substrate, S02 records, S04 the wall). For any
Next.js 16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs. Do not start without
grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language: a composes link carries a declared WEIGHT; "cosmetic" = does not bear the
    parent's emergent invariant; "load-bearing" = bears it; "critical" = the strongest tier, an
    above-the-line commitment that requires WEIGHT EVIDENCE (a recorded provenance ref, e.g. an incident
    id, per §2463) to be admitted; the parent carries a declared ACTIVATION_THRESHOLD; FIRE = compute
    Σ activation of changed children, redden the aggregate iff ≥ threshold; weights/thresholds are
    DECLARED (above the line), NEVER learned (§2465). The §112 pair is load-bearing | cosmetic — the
    "critical" tier is a deliberate extension introduced HERE; treat the enum extension as an
    above-the-line decision: record an ADR for it, and if KRD does not pin the exact critical-activation
    value or the precise evidence shape, raise an OpenQuestion rather than guessing. Sharpen each term
    against back/kernel/CONTEXT.md; if a term shifts, update CONTEXT.md / write the ADR inline. Resolve
    every branch before coding (esp. the cosmetic-vs-load-bearing threshold arithmetic and what counts
    as valid weight_evidence).

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - Weighted-propagation FIXTURE (cert_language: fixture, authority: above), reflecting
        kernel.propagation "cart-weighted" over the §114 example: composite view "cart"
        { activation_threshold: 1 }, composes -> checkout-button{load-bearing}, promo-field{load-bearing},
        help-link{cosmetic}. Rows: changed_children {help-link} -> activation < threshold ->
        aggregate("cart")==green (THE done case: cosmetic does not redden the parent) ;
        changed_children {checkout-button} -> activation >= threshold -> aggregate("cart")==red (emergent
        invariant re-opened) ; declare a critical link with NO weight_evidence -> validation==rejected,
        block_reason.code==CRITICAL_WEIGHT_WITHOUT_EVIDENCE, how_to_fix contains attach_incident_evidence
        (THE done case) ; declare a critical link WITH weight_evidence "INC-2026-014" -> accepted.
      - PROPERTY invariant (rapid, authority: below): FireParent is deterministic AND total (always
        green|red); a changed-set of only cosmetic links can never reach threshold when threshold exceeds
        cosmetic activation (cosmetic-does-not-redden); a critical link without evidence ⇒ ValidateWeight
        returns a BlockReason; critical activation ≥ load-bearing ≥ cosmetic (monotone tier ordering).
    Run them; watch them go RED (no propagation package, no FireParent/ValidateWeight, no weight/
    threshold columns). That red IS the /goal. Use a FIXTURE for the workflow-shaped state→fire→verdict
    truth (frozen N2 slot) and RAPID for the ∀ (frozen N1 slot) — match the truth form; do NOT write
    Godog for an invariant. Do NOT write a truth-test you would then satisfy (no inventing a new
    propagation invariant you'd grade yourself) — mirror the human intention only.

(c) TDD red→green→refactor, in back/kernel/propagation ONLY (plus the back/migrations/ weights-table
    file). Outside-in. Build the pure engine: the Weight enum (cosmetic | load-bearing | critical) with
    Activation(weight), the parent activation_threshold, FireParent(parent, changedChildren) ->
    green|red per the §112 rule, and ValidateWeight(link) rejecting a critical link without
    weight_evidence (returning a §44.5 BlockReason). Pure: no DB, no clock, no I/O — read a graph value
    + a changed-set, return a verdict. Reuse the S18 composes substrate and the S02 content-hash record
    scheme — do NOT fork either. FROZEN slot (§3): back is Go, the workflow proof is the fixture
    interpreter, the ∀ proof is rapid, migrations are Atlas on Postgres, DB access is sqlc/pgx — these
    ARE the mandatory choices, do not substitute. If a REAL minor tool choice arises WITHIN a slot,
    search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum.
    The likely genuine choices: how to model the weight→activation mapping in Go (typed string consts +
    a small lookup vs a table) and how Atlas expresses the enum CHECK + the conditional
    "critical ⇒ weight_evidence NOT NULL" CHECK. Record a short ADR (docs/adr/) for the `critical` tier
    extension (a genuine choice) and only otherwise if a real choice is made. The migration is
    expand-only/append-only; GRANT the agent role SELECT only on the weights/threshold columns (the
    wall). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test (incl. the
    fixture + rapid property), atlas migrate lint / a dry-run against a Testcontainers Postgres, biome
    check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only; never
    declare the behaviour green from tests you authored.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce FireParent on the
    cosmetic-only and load-bearing change-sets and ValidateWeight on the critical-with/without-evidence
    links, state the cause, propose. Check completeness: the propagation layer has its living mirror and
    each required test_kind is present (KRD §33); no monster (no weight without its fixture row, no
    critical-admission branch without a fixture row, no orphan mirror) — else Stop blocks. Do not finish
    a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/red-propagation/ →
    /red-propagation: the view "cart" composition tree with each composes link drawn by weight thickness
    (cosmetic thin, load-bearing thick, critical thickest, §2362), the parent activation_threshold, and
    a live fire table — the §114 rows with computed activation + aggregate verdict, plus the critical
    admission rows. With the canonical example: the help-link (cosmetic) change row shows the cart
    aggregate GREEN; the checkout-button (load-bearing) change row shows it RED; the
    critical-without-evidence declaration shows REJECTED (red) with CRITICAL_WEIGHT_WITHOUT_EVIDENCE +
    how_to_fix; the critical-with-evidence row shows ACCEPTED. Read via the SELECT-only role; render the
    fixture verdict, do not re-implement it. Plain React state unless local state truly needs XState. Do
    NOT touch existing routes. Add tests/e2e/red-propagation.spec.ts (use the playwright-e2e skill)
    asserting threshold 1, help-link as cosmetic, checkout-button as load-bearing, and the fire table
    rows: green (cosmetic), red (load-bearing), rejected/CRITICAL_WEIGHT_WITHOUT_EVIDENCE, accepted
    (critical-with-evidence).

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    propagation is a deep, well-named module; that FireParent/ValidateWeight are pure and depend on the
    S18 composes + S02 record substrate WITHOUT duplicating it; that the weight→activation mapping is
    data, not scattered switches; that the migration/GRANTs keep the wall intact; that boundaries match
    back/kernel/CONTEXT.md (weighted propagation refines the red wave §42, "épingle un défaut pas un
    changement" §11). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence — the weights table: weight enum CHECK + conditional weight_evidence CHECK +
    activation_threshold, expand-only), the weighted-propagation fixture + rapid property (behaviour
    proof), and the Next route (visualization). Do NOT add a hook, an MCP server, or a skill — no new
    non-bypassable rule (the wall already guards kernel.*; the PostKernelChange red-wave firing is a
    runtime step; propagation here is a pure verdict the /goal flow calls), no new backend capability,
    and no distinct repeatable gesture; do NOT build the reweight SemanticDiff executor (a later step),
    sqlc queries, codegen, or Pact. A new artifact may ADD a guardrail, never REMOVE one. Weights and
    thresholds are DECLARED, never learned (§2465) — do not add any training/fitting path.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The §112 weight pair is load-bearing | cosmetic;
  the "critical" tier and the "weight_evidence" requirement are this step's DECLARED extension — record
  them in an ADR as an above-the-line decision, do NOT smuggle them in as if KRD already pinned them. If
  the exact critical-activation value, the activation_threshold default, the precise weight_evidence
  shape, the BlockReason codes, or the §114 layer names/versions are not pinned by KRD §112-114 / an
  existing S18 migration / ADR / CONTEXT.md, do NOT guess — record an OpenQuestion (provenance) and STOP
  on that branch. Do not invent new weight tiers beyond cosmetic | load-bearing | critical, and do not
  invent a learned/auto-reweighting path (§2465 forbids it).
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The
  weighted-propagation fixture and the rapid property are means-tests toward the human red, not new
  truths.
- Any change to a prior contract (S18 composes, S02 records, the BlockReason shape, the Mirror.aggregate
  rule, the wall GRANTs) goes through a ChangeSet + SemanticDiff (re-weighting a live link =
  `reweight` change_type, KRD §44.1). Add new files; never silently rewrite a prior artifact, never
  hand-edit back/gen/**.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster. Concretely: the weighted-propagation fixture passes — FireParent("cart",
{help-link}) returns GREEN (a cosmetic change does not redden the parent: THE done criterion), FireParent
("cart", {checkout-button}) returns RED (load-bearing reddens the aggregate), ValidateWeight on a critical
link with NO weight_evidence returns REJECTED with a CRITICAL_WEIGHT_WITHOUT_EVIDENCE BlockReason whose
how_to_fix points at attaching incident evidence (THE done criterion: a critical weight without evidence
is rejected), and a critical link WITH evidence is accepted; the rapid invariant holds (FireParent total
+ deterministic, cosmetic-only never reddens, critical-without-evidence always rejected, monotone tier
ordering); /red-propagation renders the weighted tree + the fire table with the cosmetic row green, the
load-bearing row red, the critical-without-evidence row rejected (red), and a passing Playwright e2e;
GRANTs prove SELECT-only on the weights/threshold columns; the migration is append-only/expand-only; no
truth was written by the agent. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (weighted-propagation fixture, rapid property), where stored (mirrors schema,
  test_kind fixture / cert_language fixture / authority above; rapid authority below) and materialized
  (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, atlas migrate lint/dry-run, biome,
  eslint, playwright).
- UI route: /red-propagation — what it renders (weighted tree + fire table), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent);
  any prior-contract change → ChangeSet + SemanticDiff (note if a `reweight`), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. the `critical` tier + weight_evidence are a declared extension (ADR recorded), no
  reweight SemanticDiff executor yet, no PostKernelChange red-wave wiring, no MCP/hook, threshold/
  activation values used, evidence-validity depth (id presence only, no incident lookup), no learned
  re-weighting (by design).
- Next safe step: the smallest stable next tooth (e.g. the reweight SemanticDiff executor that lifts a
  cosmetic link to load-bearing/critical on recorded incident evidence, or wiring FireParent into the
  PostKernelChange red-wave firing) and why it is safe to chain.
```
