# S15 — TruthScope (region/target/segment/env/time-window) + completeness guard "no active truth without a scope"

Subsystem: AIDOS Kernel | Home: `back/kernel/scope` | Workbench route: `/scopes`

## Objectif

Land **TruthScope** (KRD §13.7) as a content-addressed value object on the Kernel record — `region / tenant / target / time_window / user_segment / environment` — and prove the rule **"no truth is universal by default"**: an *active* truth must carry a scope, and the only escape hatch is an **explicit global** scope (`region: "*"`). This slice lands the typed scope shape, a pure `Validate(record)` guard, and its property mirror only; it does not wire scope into Policy/Operation evaluation, context routing, or DataTruthScope (those are later teeth).

## Sortie attendue

Per CLAUDE.md §5, this step is **pure logic** (the scope value object + the active-truth guard), **persistence** (the scope column/table on the Kernel record), a **behaviour proof** (the property mirror), and a **visualization** — so exactly these artifacts, and no more:

- **Go package** — `back/kernel/scope/` — the typed `TruthScope` value object matching KRD §13.7 verbatim (`Region` ∈ `FR|EU|US|"*"`; `Tenant`; `Target` ∈ `web|mobile|voice|xr|iot`; `TimeWindow{From, To}`; `UserSegment` ∈ `premium|standard|guest`; `Environment` ∈ `prod|staging|dev`), plus a **pure** guard `Validate(record) error` that enforces the §13.7 rule: a record whose lifecycle status is **active** and whose scope is absent/empty is **rejected**, unless the scope is **explicitly global** (`Region == "*"`). `IsGlobal(scope) bool` makes the escape hatch a named, deliberate predicate (not an implicit nil). Pure functions only — no DB, no I/O, no codegen, no clock; the active-status of a record is read from the record passed in, never fetched. The value object is interpreted in Go (frozen slot); it is **not** compiled or emitted here.
- **Atlas migration** — `back/migrations/` — one declarative, expand-only migration adding a content-addressed, append-only `scope jsonb` (the serialized `TruthScope`) to the S02 KRDCore record substrate, nullable at the column level (a non-active *idea* may have no scope yet) — the **active-truth** requirement is enforced by the guard, not a NOT NULL, so an idea can exist scope-less before promotion. The record stays append-only (head moves via a new row + `superseded_by`, never an `UPDATE`/`DELETE` of the body); the scope rides inside the same content-addressed body so `id == version == Hash(Canonicalize(body))` still holds. GRANTs: the agent DB role keeps **SELECT only** — no INSERT/UPDATE/DELETE (the wall, §2). Only the `aidos` writer role writes truth, via an approved ChangeSet.
- **BDD mirror** — the **rapid property test** (Go), conceptually stored in the `mirrors` schema and materialized to `tests/` for the runner. This is the canonical mirror for the scope guard (`reflects: kernel.scope`, `test_kind: property`, `cert_language: rapid`, `authority: above`). See "Test minimal".
- **Next route** — `front/web/app/scopes/` — the Workbench `/scopes` panel rendering a record's TruthScope dimensions + the accept/reject verdict of the guard (see "Visualisation UI").

> Explicitly **out of scope** (do not create — they would be monsters or out of slot here): no MCP server (no new backend capability is exposed; the guard is pure, `store`/`mirror-runner` MCPs are other steps); no Hook (the completeness law that would *block* a scope-less active truth at write time is the `aidos` writer's concern through the existing wall + ChangeSet gate — this step lands the **pure validator** that gate will call, not a new non-bypassable Go hook binary; adding one now would be a dead hook, §5 hook-honesty); no Policy/Operation wiring, no ContextRouter scope-overlap, no DataTruthScope (§44.3), no AuthorityGraph coupling, no `rescope` SemanticDiff machinery, no codegen/emitters, no sqlc queries, no Gherkin journey (the scope rule's nature is the invariant `∀`, not a journey — forcing an acceptance mirror here would be a double-typed monster).

## Test minimal (done)

**Done = an active truth without a scope is rejected, unless explicitly global.** Restated **failing-first**, as the red BDD mirror to write **before** any guard code, conceptually stored in the `mirrors` schema and materialized for rapid. The scope rule's nature is an invariant (`∀`), so the mirror is a **property test (rapid in Go)** — the frozen N1 slot — not a Gherkin journey:

```
# mirrors schema · reflects: kernel.scope · test_kind: property · cert_language: rapid · authority: above
# TruthScope — "aucune vérité n'est universelle par défaut" (KRD §13.7). The only universal is EXPLICIT global.

# the load-bearing rule (the done criterion, ∀):
∀ rec ~ genRecord():
    rec.status == ACTIVE  ∧  scopeAbsentOrEmpty(rec.scope)  ∧  ¬IsGlobal(rec.scope)
        ⇒  Validate(rec) is RejectedError("active truth without a scope")
∀ rec ~ genRecord():
    rec.status == ACTIVE  ∧  IsGlobal(rec.scope)          ⇒  Validate(rec) == nil   # explicit "*" passes
∀ rec ~ genRecord():
    rec.status == ACTIVE  ∧  scopePresentAndNonEmpty(rec.scope)  ⇒  Validate(rec) == nil
# a non-active record (an idea / deprecated truth) is NOT subject to the rule:
∀ rec ~ genRecord():
    rec.status != ACTIVE  ⇒  Validate(rec) == nil    # the rule binds ACTIVE truths only
# IsGlobal is exactly region == "*", never implicit:
∀ scope:  IsGlobal(scope) ⇔ scope.region == "*"          # nil/empty scope is NOT global
# field validity comes verbatim from §13.7 enums:
∀ scope:  Validate-shape(scope) ⇒ region ∈ {FR,EU,US,"*"} ∧ target ∈ {web,mobile,voice,xr,iot}
                                  ∧ segment ∈ {premium,standard,guest} ∧ env ∈ {prod,staging,dev}
# content-address tie-in (S02 substrate): scope rides inside the body, never mutated in place:
∀ rec:    id == version == Hash(Canonicalize(serialize(rec)))   # changing scope ⇒ a new version
```

The `genRecord()` / `genScope()` generators are **rapid** generators over the §13.7 field domains and the lifecycle statuses; the enums, the field names, and the `"*"` global sentinel are KRD §13.7 verbatim. All start **red** (no value object, no `Validate`, no `IsGlobal`, no migration). That red **is** the `/goal`.

> Honesty: the scope dimensions and their allowed values (`region FR|EU|US|"*"`, `target web|mobile|voice|xr|iot`, `user_segment premium|standard|guest`, `environment prod|staging|dev`, `time_window from/to`, `tenant`) come **verbatim** from KRD §13.7 — do not invent additional dimensions, enum values, or a different global sentinel. The notion of an "active" truth is the `active` status of TruthLifecycle (§44.2). If the precise lifecycle status that counts as "active", the meaning of an empty `time_window`, or whether `tenant` has a closed enum is not pinned by KRD or an existing record, do **not** guess — raise an **OpenQuestion** (provenance) and stop on that branch.

## Visualisation UI

- **Workbench route:** `front/web/app/scopes/page.tsx` (new route `/scopes`; do not touch existing routes). It renders, for a small set of sample records, each record's **TruthScope** as labelled dimension chips (`region`, `target`, `user_segment`, `environment`, `time_window`, `tenant`), its lifecycle status, and the guard's **verdict badge** — `ACCEPTED` for a scoped active truth and for an explicitly-global one (`region: *` shown as a distinct "GLOBAL (explicit)" badge), and `REJECTED — active truth without a scope` for a scope-less active record. The above-the-line authority badge marks the scope as a Kernel qualifier. Reads from the SELECT-only role; it consumes the pure `Validate` verdict, it does not run truth writes.
- **Playwright e2e:** `tests/e2e/scopes.spec.ts` — navigate to `/scopes`, assert a scoped active record renders ACCEPTED with its dimension chips, assert a scope-less active record renders the `REJECTED — active truth without a scope` badge, and assert an explicit-global record renders the distinct "GLOBAL (explicit)" ACCEPTED badge. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** (`back/kernel/scope/*.go`, `back/migrations/<new>.sql`, `front/web/app/scopes/*`, `tests/e2e/scopes.spec.ts`, the new rapid mirror source) and otherwise **adds new files**. It defines the `scope` qualifier's contract; it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** — it never alters or drops a prior table, it **adds** a `scope jsonb` to the S02 content-addressed record shape rather than redefining it, and it does not retro-mutate existing rows. Should a later need touch any contract this step freezes (the `TruthScope` field set, the `IsGlobal` = `region == "*"` rule, the active-truth guard semantics, the `scope` column, the GRANT), that change must go through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) accompanied by a **SemanticDiff** whose `change_type` is **`rescope`** (KRD §44.1) on the affected record — never an in-place edit, never a passing tweak.

## Prompt a lancer

```text
You are step-executor for AIDOS step S15 — "TruthScope (region/target/segment/env/time-window) +
completeness guard: no active truth without a scope". Stack is FROZEN: back=Go, truth=Postgres
(append-only, content-addressed; the agent has NO write grant to kernel/mirrors/fitness), front=Next.js
(the Workbench). Home = back/kernel/scope ONLY (plus the rapid mirror source, the /scopes Workbench route,
and its Playwright e2e). Follow the CLAUDE.md §6 per-step loop IN ORDER. Do not go prompt → code.

Read first, before touching anything: KRD.md §13.7 (TruthScope — fields region/tenant/target/time_window/
user_segment/environment, the rule "une vérité sans scope est suspecte ; une décision réutilisée hors
scope est une hallucination structurelle"; aucune vérité n'est universelle par défaut), §13.6 (the four
qualifiers: truth_kind / TruthScope / VerifiabilityLevel / AuthorityGraph), §44.2 (TruthLifecycle: active /
deprecated / shadowed / removed — what "active" means), §44.1 (SemanticDiff change_type `rescope`), and the
S02 record substrate (content-addressed, append-only JSONB; id == version == Hash). Read CONTEXT-MAP.md +
back/kernel/CONTEXT.md (TruthScope as the "where/when/for-whom" qualifier on a Kernel source, above the
waterline; test-as-goal vs test-as-means; the monster law). Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language: what a `TruthScope` is and that it is ONE of the four truth qualifiers (not a
    truth itself); what each dimension means (region/tenant/target/time_window/user_segment/environment);
    what "active" means (TruthLifecycle §44.2) and which statuses the rule binds; what "explicit global"
    is (region == "*", a deliberate escape hatch — never the implicit default); what "a decision reused
    out of scope is a structural hallucination" means for later steps (out of scope here). Sharpen terms
    against back/kernel/CONTEXT.md; update CONTEXT.md / write an ADR inline only if a term genuinely
    shifts. For any Next.js 16 / Atlas / rapid API doubt use context7 or node_modules/next/dist/docs.
    Resolve every branch before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to
    tests/ for the runner. The scope rule's nature is the invariant ∀ → the mirror is a PROPERTY TEST in
    rapid (Go), the frozen N1 slot — NOT a Gherkin journey (forcing acceptance here would be a
    double-typed monster). Properties to encode (red first):
      - THE LOAD-BEARING RULE: ∀ record with status==ACTIVE ∧ scope absent/empty ∧ ¬IsGlobal ⇒
        Validate rejects with "active truth without a scope".
      - ∀ record status==ACTIVE ∧ IsGlobal(scope) (region=="*") ⇒ Validate passes (explicit global).
      - ∀ record status==ACTIVE ∧ scope present & non-empty ⇒ Validate passes.
      - ∀ record status!=ACTIVE ⇒ Validate passes (the rule binds ACTIVE truths only).
      - IsGlobal(scope) ⇔ scope.region == "*" (nil/empty is NOT global — global is never implicit).
      - field validity from §13.7 enums verbatim (region/target/user_segment/environment domains).
      - content-address tie-in: id == version == Hash(Canonicalize(serialize(record))); changing scope ⇒
        a new version, never an in-place mutation.
    Run them; watch them go RED (no value object, no Validate, no IsGlobal, no migration). That red IS the
    goal. Do NOT write a truth-test you would then satisfy (no inventing a new scope invariant you'd grade
    yourself) — mirror the human red (KRD §13.7) only; the agent writes means-tests, never truth-tests
    (the wall).

(c) TDD red→green→refactor in back/kernel/scope ONLY (plus the back/migrations/ Atlas file). Outside-in.
    Build the typed TruthScope value object (Region FR|EU|US|"*", Tenant, Target web|mobile|voice|xr|iot,
    TimeWindow{From,To}, UserSegment premium|standard|guest, Environment prod|staging|dev — §13.7
    verbatim), a named IsGlobal(scope) == (region=="*") predicate, and a PURE Validate(record) error
    enforcing "active ∧ scope-less ∧ ¬global ⇒ reject; else accept". No DB, no I/O, no clock; the record's
    active-status is READ from the record passed in, never fetched. Interpret in Go (frozen slot) — do NOT
    compile or emit it, do NOT wire it into Policy/Operation/ContextRouter/DataTruthScope. Within the
    frozen slots, if a real tool choice arises, search AT MOST 3 current (May 2026) options, pick the
    SIMPLEST, and record an ADR (docs/adr/) ONLY if a genuine choice was made. Frozen here: rapid for the
    property mirror; Atlas for the migration; sqlc+pgx is the DB-access slot but THIS step writes no
    queries. The likely real choice is how to encode the bounded enums + time_window in Go and serialize
    the scope into the existing content-addressed body — search ≤3, pick simplest, ADR it only if a real
    choice is made. Migration is expand-only/append-only: ADD a nullable `scope jsonb` to the S02 record
    (nullable so a non-active idea can be scope-less before promotion — the ACTIVE requirement is enforced
    by Validate, not a NOT NULL); the scope rides inside the content-addressed body so id==version==Hash
    still holds; GRANT the agent role SELECT only (the wall).

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the rapid mirror,
    biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only; never
    declare the behaviour green from tests you wrote — done is computed.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, state the cause, propose. Do not
    finish a code step without it. Check completeness: the scope-guard layer has its living rapid mirror,
    no monster (no scope qualifier without a mirror, no orphan mirror) — else Stop blocks. Shrink any rapid
    counterexample to its minimal form before declaring green.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/scopes/page.tsx at
    /scopes: for sample records, render each TruthScope as labelled dimension chips (region, target,
    user_segment, environment, time_window, tenant), the lifecycle status, and the guard verdict badge —
    ACCEPTED for a scoped active truth, a distinct "GLOBAL (explicit)" ACCEPTED badge when region == "*",
    and "REJECTED — active truth without a scope" for a scope-less active record; plus the above-the-line
    authority badge. Read via the SELECT-only role; consume the pure Validate verdict, no truth writes. Do
    NOT touch existing routes. Add tests/e2e/scopes.spec.ts (use the playwright-e2e skill) asserting: a
    scoped active record → ACCEPTED with its chips; a scope-less active record → the REJECTED badge; an
    explicit-global record → the "GLOBAL (explicit)" badge.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check the
    scope package is a deep, navigable module (the value object, IsGlobal, and the active-truth rule in one
    well-named place), boundaries match back/kernel/CONTEXT.md, the value object stays pure, and the
    migration/GRANTs keep the wall intact. Do not advance without it.

(h) CREATE ARTIFACTS per §5 and ONLY those that apply: the Go package (pure logic — TruthScope + IsGlobal +
    Validate), the Atlas migration (persistence — `scope jsonb` on the content-addressed record,
    SELECT-only for the agent), the rapid property mirror (behaviour proof), and the Next route
    (visualization). Do NOT add an MCP server, a Hook, Policy/Operation/ContextRouter/DataTruthScope
    wiring, an AuthorityGraph coupling, codegen/emitters, sqlc queries, or a Gherkin journey — no new
    capability/rule/persistence beyond these is justified at S15. A new artifact may ADD a guardrail, never
    REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- Never invent a target, a targetId, or a business-rule. The scope dimensions and their enum values
  (region FR|EU|US|"*", target web|mobile|voice|xr|iot, user_segment premium|standard|guest, environment
  prod|staging|dev, time_window from/to, tenant) are KRD §13.7 verbatim — add no dimensions, enum values,
  or a different global sentinel. "active" is the TruthLifecycle §44.2 status. If the exact lifecycle
  status that counts as "active", the meaning of an empty time_window, or whether `tenant` is a closed
  enum is uncertain, do NOT guess — raise an OpenQuestion (provenance) and stop on that branch.
- You never write a truth-test (a scope invariant you would then satisfy — the circularity). The property
  mirror is a means-test toward the human red (KRD §13.7), not a new truth.
- Any change to a prior contract goes through a ChangeSet + SemanticDiff (change_type `rescope` for a
  scope change, §44.1). Add new files; never silently rewrite a prior artifact, never hand-edit
  back/gen/**. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one (CLAUDE.md working
  guideline 1).

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green AND prior green intact AND mutation score
≥ threshold AND no monster. Concretely: an ACTIVE record with no scope and not global is REJECTED with
"active truth without a scope"; an ACTIVE record with an explicit global scope (region "*") is ACCEPTED; an
ACTIVE record with a present non-empty scope is ACCEPTED; a non-active record is ACCEPTED (rule binds ACTIVE
only); IsGlobal ⇔ region == "*"; id == version == Hash for the serialized record; the /scopes route renders
the dimension chips and the three verdicts with a passing Playwright e2e; GRANTs prove SELECT-only; the
migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: the rapid property mirror (which properties — the load-bearing reject rule, the explicit-global
  pass, the present-scope pass, the non-active exemption, IsGlobal⇔"*", §13.7 enum validity, content-address
  tie-in), where stored (mirrors schema) / materialized to tests/. State explicitly that no Gherkin journey
  was added and why (scope rule nature is ∀).
- Tests run: command + pass/fail counts (rapid/go test, biome, eslint, playwright); rapid seed/shrink notes
  for any counterexample.
- UI route: /scopes — what it renders (dimension chips + ACCEPTED / GLOBAL(explicit) / REJECTED verdicts),
  e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent), or
  "none" if no prior contract changed.
- Red-set status: which properties went red then green; any still red.
- Known limits: e.g. scope not yet consumed by Policy/Operation evaluation or the ContextRouter
  scope-overlap, no DataTruthScope (§44.3), no AuthorityGraph coupling, no codegen/emit, no sqlc repository,
  the write-time completeness HOOK (blocking a scope-less active truth at the `aidos` writer) not yet wired —
  this step lands only the pure validator it will call, "active" status coverage.
- Next safe step: the smallest stable next tooth (e.g. wiring Validate into the `aidos` writer's completeness
  gate so a scope-less active truth is blocked at write time, or feeding scope-overlap into the ContextRouter
  reuse decision) and why it is safe to chain on this stable phase.
```
