# S32 — ContextGraphDecision (deterministic reuse: time/scope/authority/conditions) + mirrors

Subsystem: AIDOS Archive | Home: `back/archive/brain/contextgraph` | Workbench route: `/decision-reuse`

## Objectif

Land **`ContextGraphDecision`** (KRD §119.2) — the **deterministic control-plane gate** that decides whether a past decision may be reused, by checking exactly four declared dimensions (**time / scope / authority / conditions**) and emitting `{may_reuse, reason, checked, required_human_review}`. The done criterion: **an expired or out-of-scope candidate yields `may_reuse: false`, and there is NO LLM anywhere in this layer** — the ContextGraph permits or blocks; agents propose, the Execution Layer acts (KRD §119.2: "Le LLM ne vit pas dans le ContextGraph").

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (a Go package), **persistence** (one Atlas migration), a **behaviour proof** (a fixture + property mirror), and a **visualization** (a Next route) — and nothing more:

- **Go package** `back/archive/brain/contextgraph/` — the `ContextGraphDecision` AST per KRD §119.2 (`may_reuse bool`, `reason string`, `checked []string` over the **exactly four declared dimensions** `time | scope | authority | conditions`, `required_human_review bool`) and a pure `Decide(candidate, ctx, now) → ContextGraphDecision`. The function evaluates **declared predicates only**, in this order, and is `false`-dominant (any failing check blocks reuse): **(1) time** — the candidate's `TruthScope.time_window` / `expires_at` (KRD §13.7, §119.1 `MemoryItem.expires_at`) must contain `now`, else `may_reuse=false`, reason names the expired window; **(2) scope** — the candidate's `TruthScope` (region / tenant / target / user_segment / environment, KRD §13.7) must be a superset of the request context, else `may_reuse=false` (the law `no_reuse_outside_scope`, KRD §82.2 / §13.7: "une décision réutilisée hors scope est une hallucination structurelle"); **(3) authority** — the candidate's `AuthorityGraph` owner (KRD §13.8) must still hold for the request's domain/truth_kind, else `required_human_review=true`; **(4) conditions** — any declared reuse `conditions` on the candidate must hold. `Decide` is **pure** over `(candidate, ctx, now)` — **no DB calls, no I/O, no `time.Now()`** (the clock is passed in as `now` so the decision is deterministic and replayable), and **NO LLM call, ever** (this is the keystone: the LLM does not live in the ContextGraph — KRD §119.2). The four checks and their predicates are **declared, not learned** (CLAUDE.md §8); `checked` records which dimensions were evaluated so the verdict is explainable.
- **Atlas migration** (`back/migrations/`) — one declarative, **expand-only / append-only** migration adding to the existing `context` truth schema (CLAUDE.md §1: the `context` schema holds "the derived ContextGraph + `ContextGraphDecision` (reuse allowed or not)"): a `context.context_graph_decision` table (`id text PRIMARY KEY` = hash of the canonical decision body, **reusing S01/S02's `Canonicalize`/`Hash`** — do **not** fork it; `candidate_id text NOT NULL` referencing the reused decision/`MemoryItem`; `may_reuse boolean NOT NULL`; `reason text NOT NULL`; `checked text[] NOT NULL`; `required_human_review boolean NOT NULL`; `request_ctx jsonb NOT NULL`; `decided_at timestamptz NOT NULL`). A decision is a **row**, never an UPDATE — a re-evaluation is a new row (append-only). GRANTs: the agent DB role gets **SELECT only** on the table (the wall, §2; `context` is a truth schema above the line). Only the `aidos` CLI writer role inserts decisions, via an approved ChangeSet (S20).
- **BDD mirror** — a **fixture** mirror (`state → command → events`: a candidate decision + a request context + a passed-in `now` → `Decide` → the verdict) plus a **`rapid` property** mirror for the ∀ invariants, conceptually stored in the `mirrors` schema and materialized to `tests/` for the Go runner. This is the `ContextGraphMirror` of KRD §119.2 (given `decision: SLA_WAIVER_001, region: EU, date: expired` → expect `may_reuse: false`). These ARE the done criteria (see below).
- **Next route** `front/web/app/decision-reuse/` → `/decision-reuse` — the Workbench panel rendering each recorded `ContextGraphDecision` (the candidate, the verdict ALLOW/BLOCK, the `checked` dimensions, the reason, and the `required_human_review` flag), reading via the SELECT-only role (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no new MCP server** — `Decide` is a pure library; recording verdicts goes through the existing `changeset` MCP + `aidos` writer role (S20), not a new backend service. **No new hook** — the wall GRANT and the completeness law are prior artifacts; this step adds no new non-bypassable rule (the `no_reuse_outside_scope` *law* is enforced by `Decide`'s logic + its mirror, not a separate Go hook binary at this step). **No Skill** — no new replayable agent gesture is justified. **No `ContextRouter` / `ContextPack` compilation** (KRD §119.3, §141–§142) — that is the *information layer* (which truths/memory to hand the model); this step delivers only the *control-plane reuse gate*, a later step compiles the pack. **No `MemoryFirewall` flow** (KRD §119.1 `Memory → ContextPack → Idea → Mirror → Goal → Kernel`) — that promotion path is a separate step; this step decides reuse, it does not promote memory to kernel. **No ContextGraph construction / graph traversal** (KRD §142, the unified live graph over layers/mirrors/links/DAG) — consumed as input, not built here. **No LLM, no RAG, no embedding** — by rule the LLM does not live in this layer. **No `TruthScope` / `AuthorityGraph` AST definition** (consumed from S15 truth-scope / S16 authority-graph, never re-coined here). **No codegen/emitters.**

## Test minimal (done)

**Done = expired or out-of-scope ⇒ `may_reuse: false`; NO LLM in this layer.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner. This is the `ContextGraphMirror` of KRD §119.2.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: archive.brain.contextgraph.Decide · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "an EXPIRED decision is not reusable"                    # THE done criterion (time)
    state   (now):       "2026-05-30T00:00:00Z"
    state   (candidate): { id: <reuse S15 pinned id>, scope: { region: "EU" }, expires_at: "2026-01-01T00:00:00Z" }
    state   (request):   { region: "EU" }
    command (decide):    Decide(candidate, request, now)
    events:  [ verdict.may_reuse == false,
               "time" in verdict.checked,
               verdict.reason names the expired time_window ]

  fixture "an OUT-OF-SCOPE decision is not reusable"              # THE done criterion (scope)
    state   (candidate): { id: <reuse S15 pinned id>, scope: { region: "EU" } }
    state   (request):   { region: "US" }                         # outside the candidate scope
    command (decide):    Decide(candidate, request, now)
    events:  [ verdict.may_reuse == false,
               "scope" in verdict.checked,
               verdict.reason names the scope mismatch ]          # no_reuse_outside_scope

  fixture "an in-time, in-scope, in-authority decision IS reusable"
    state   (candidate): { id: <reuse S15 pinned id>, scope: { region: "EU" },
                           expires_at: "2027-01-01T00:00:00Z", authority_owner: "legal" }
    state   (request):   { region: "EU", domain: "checkout" }
    command (decide):    Decide(candidate, request, now)
    events:  [ verdict.may_reuse == true, verdict.required_human_review == false ]

  fixture "an authority no longer holding requires human review"  # authority
    state   (candidate): { id: <reuse S16 pinned id>, scope: { region: "EU" }, authority_owner: "legal" }
    state   (request):   { region: "EU", domain: <domain legal does not own> }
    command (decide):    Decide(candidate, request, now)
    events:  [ verdict.required_human_review == true,
               "authority" in verdict.checked ]

  fixture "a declared reuse condition that fails blocks reuse"    # conditions
    state   (candidate): { id: <reuse S15 pinned id>, conditions: [ <declared predicate> ] }
    state   (request):   { ... condition does not hold ... }
    command (decide):    Decide(candidate, request, now)
    events:  [ verdict.may_reuse == false, "conditions" in verdict.checked ]

  fixture "the recorded decision id is the content hash of its body"
    state   (candidate): { ... }
    command (decide):    Decide then canonical-hash(decision body)
    events:  [ verdict.id == Hash(Canonicalize(body)) ]           # content-addressed (S01/S02 reused)
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: contextgraph.Decide · test_kind: property · cert_language: rapid · authority: below
  ∀ candidate,request,now:  Decide is deterministic — same inputs ⇒ same verdict (now is passed, never read from the clock)
  ∀ candidate with now AFTER expires_at (or before the time_window):  may_reuse == false   (expired ⇒ no reuse)
  ∀ candidate whose scope does NOT contain the request scope:  may_reuse == false           (no_reuse_outside_scope)
  ∀ Decide run:  may_reuse == true ⇒ ALL four checks (time,scope,authority,conditions) recorded in `checked` and passed (false-dominant)
  ∀ Decide run:  the verdict references ONLY the candidate and request given — it never invents a candidate/scope/authority/condition
  ∀ Decide run:  the verdict is computed by declared predicates only — no network, no clock, NO LLM call (the layer is LLM-free)
  ∀ malformed candidate/request:  Decide yields a verdict (typically may_reuse=false / required_human_review=true), never panics
  ```

Both start **red** (no `contextgraph` package, no `Decide`, no `context.context_graph_decision` table). That red **is** the `/goal`. The fixtures are **means-tests toward the human red** (expired ⇒ no reuse; out-of-scope ⇒ no reuse; LLM-free) — not new truths the agent invents and then grades.

## Visualisation UI

- **Workbench route:** `front/web/app/decision-reuse/page.tsx` (new route `/decision-reuse`; do not touch existing routes). A read-only panel reading via the SELECT-only role: the **reuse ledger** — each recorded `ContextGraphDecision` as a row with the candidate id, an **ALLOW** (green) / **BLOCK** (red) verdict badge, the four `checked` dimension chips (time / scope / authority / conditions, each marked pass/fail), the human-readable `reason`, and a **needs-human-review** flag when set. An **expired** or **out-of-scope** candidate renders a **BLOCK** badge with the failing dimension chip lit — the done criterion made visible. The verdict is rendered, not re-computed (the LLM does not live here, and neither does the decision logic in the browser).
- **Playwright e2e:** `tests/e2e/decision-reuse.spec.ts` — navigate to `/decision-reuse`, assert an expired candidate renders a **BLOCK** badge with the **time** chip marked failing, an out-of-scope candidate renders a **BLOCK** badge with the **scope** chip marked failing (the done criterion visible in the UI), and an in-time/in-scope candidate renders an **ALLOW** badge. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/brain/contextgraph/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/decision-reuse.spec.ts`, and `front/web/app/decision-reuse/**` — and otherwise **adds new files**. It defines new contracts (the `ContextGraphDecision` AST + the pure `Decide` gate; the `context.context_graph_decision` table; the four-dimension `false`-dominant reuse rule); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes. The migration is **expand-only / append-only** and never alters or drops a prior table or GRANT, and a decision is a row, never an UPDATE/DELETE. Any change to a **prior contract** it depends on — S01/S02's content-hash substrate, S15's `TruthScope` AST, S16's `AuthorityGraph` AST, S20's ChangeSet write-path, the wall GRANT set — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance), not an edit.

## Prompt a lancer

```text
You are step-executor for AIDOS step S32 — "ContextGraphDecision (deterministic reuse: time/scope/authority/
conditions) + mirrors". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has
NO write grant to kernel/mirrors/fitness/context), front=Next.js (the Workbench). Home = back/archive/brain/
contextgraph ONLY (plus the Atlas migration in back/migrations). Follow the CLAUDE.md §6 per-step loop IN ORDER.
Never go prompt → code.

Read BEFORE touching anything: KRD.md §119.2 (ContextGraphDecision + the Decision Reuse Test — the ContextGraph
is NOT a RAG; it is a CONTROL PLANE that decides if a past decision may be reused; the AST is exactly
{may_reuse, reason, checked:[time,scope,authority,conditions], required_human_review}; the associated
ContextGraphMirror is given{decision:SLA_WAIVER_001, region:EU, date:expired} → expect{may_reuse:false}; the
governing rule "Agents propose. ContextGraph permet ou bloque. Execution Layer agit." and the keystone "Le LLM
ne vit pas dans le ContextGraph"), §13.7 (TruthScope — region/tenant/target/time_window/user_segment/
environment; "une vérité sans scope est suspecte, une décision réutilisée hors scope est une hallucination
structurelle"), §13.8 (AuthorityGraph — domain/truth_kind/approvers/veto/escalation; every above-the-line truth
has an explicit authority owner), §119.1 (MemoryFirewall + MemoryItem.expires_at/validity_scope/taint — context,
not truth), §82.2 KRDCore law no_reuse_outside_scope. Read CONTEXT-MAP.md + back/archive/CONTEXT.md (archive, the
/brain store as context fuel NEVER truth, MemoryFirewall — and the AVOID lists: /brain is NOT a database / truth
store / RAG store / knowledge base) and the prior steps' specs (S01/S02 content-store + records/content-hash, S04
the wall, S15 truth-scope/TruthScope AST, S16 authority-graph/AuthorityGraph AST, S20 ChangeSet write-path). For
any Next.js 16, Atlas, or Go API doubt use context7 or node_modules/next/dist/docs. Do not start without
grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, <=5 scenarios. Pin the ubiquitous
    language: a ContextGraphDecision is a DETERMINISTIC, LLM-FREE control-plane verdict on whether a PAST
    decision/MemoryItem may be REUSED for a new request; it checks EXACTLY four DECLARED dimensions — TIME
    (the candidate's time_window / expires_at must contain `now`), SCOPE (the candidate's TruthScope must be a
    superset of the request context — region/tenant/target/user_segment/environment), AUTHORITY (the candidate's
    AuthorityGraph owner must still hold for the request's domain/truth_kind), CONDITIONS (declared reuse
    predicates must hold); the verdict is FALSE-DOMINANT (any failing check blocks reuse), records which
    dimensions it `checked`, and may set required_human_review. The ContextGraph PERMITS or BLOCKS; agents
    PROPOSE; the Execution Layer ACTS; the LLM does NOT live in this layer. This step delivers the REUSE GATE
    over an already-built ContextGraph, NOT the ContextRouter/ContextPack compilation (§119.3/§141-142, the
    information layer — later), NOT the ContextGraph construction/traversal (§142, consumed), NOT the
    MemoryFirewall promotion flow Memory->ContextPack->Idea->Mirror->Goal->Kernel (§119.1, later), NOT the
    TruthScope/AuthorityGraph AST (consumed from S15/S16), NOT any RAG/embedding/LLM. Sharpen each term against
    back/archive/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch
    before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. This IS the ContextGraphMirror of §119.2. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state -> command -> events, interpreted in Go): state = a candidate decision
        (with its TruthScope, expires_at, authority owner, declared conditions) + a request context + a
        passed-in `now`; command = Decide(candidate, request, now); events = the verdict. Cover: an EXPIRED
        candidate => may_reuse=false with "time" in checked and a reason naming the expired window — THE done
        criterion ; an OUT-OF-SCOPE candidate (request region not contained by the candidate scope) =>
        may_reuse=false with "scope" in checked (no_reuse_outside_scope) — THE done criterion ; an
        in-time/in-scope/in-authority candidate => may_reuse=true, required_human_review=false ; an authority no
        longer holding for the request domain => required_human_review=true ; a failing declared condition =>
        may_reuse=false ; the recorded decision id == Hash(Canonicalize(body)) (content-addressed, S01/S02
        reused).
      - PROPERTY (rapid, forall, below the line): Decide is deterministic (now passed in, never read from the
        clock) ; any candidate with now after expires_at (or before its time_window) => may_reuse=false ; any
        candidate whose scope does NOT contain the request scope => may_reuse=false ; may_reuse=true ⇒ all four
        checks recorded and passed (false-dominant) ; the verdict references ONLY the given candidate/request and
        never invents a candidate/scope/authority/condition ; the verdict is computed by declared predicates only
        — no network, no clock, NO LLM call ; never panics on malformed input.
    Run them; watch them go RED (no contextgraph package, no Decide, no context.context_graph_decision table).
    That red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new reuse dimension
    or a scope/authority rule you'd grade yourself) — mirror the human intention only (expired => no reuse;
    out-of-scope => no reuse; LLM-free); the fixture is a means-test toward the human red.

(c) TDD red -> green -> refactor in back/archive/brain/contextgraph ONLY (plus the Atlas migration in
    back/migrations). Outside-in. Build: the typed ContextGraphDecision AST ({may_reuse, reason,
    checked:[time,scope,authority,conditions], required_human_review}) + a pure Decide(candidate, request, now)
    -> ContextGraphDecision that evaluates the four DECLARED predicates in order, false-dominant, over the
    candidate's TruthScope (S15) and AuthorityGraph (S16) — no I/O, no time.Now() (now is a parameter), no
    learned thresholds, and NO LLM/network call at all. Within the frozen slots, if a REAL tool choice arises,
    search AT MOST 3 current (May 2026) options, pick the SIMPLEST, never touch the mandatory minimum (Godog,
    rapid, the fixture/Operation-DSL interpreter, Atlas, sqlc/pgx, the Go MCP/CLI are fixed). The likely genuine
    choices: the scope-containment check (does the candidate TruthScope contain the request context? — reuse
    S15's TruthScope semantics, do NOT re-invent scope) and the canonical decision-JSONB shape + content-hash
    (REUSE S01/S02's Canonicalize/Hash — do NOT fork it). Record a short ADR (docs/adr/) ONLY if a genuine choice
    is made (e.g. the scope-containment encoding). The migration is expand-only/append-only: add
    context.context_graph_decision (id=hash PK, candidate_id, may_reuse, reason, checked text[],
    required_human_review, request_ctx jsonb, decided_at). A re-evaluation is a NEW ROW, never an UPDATE. GRANT
    the agent role SELECT only on the table (the wall); only the aidos writer role inserts decisions, inside a
    ChangeSet (S20). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only;
    never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Decide on the expired /
    out-of-scope / authority-not-holding cases, state the cause, propose. Check completeness:
    context.context_graph_decision (the reuse-decision truth) has its living mirror (the fixture + property); no
    monster (no truth without a mirror, no orphan mirror, no LLM smuggled into the layer, no verdict that invents
    a candidate/scope) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/decision-reuse/ ->
    /decision-reuse: render (SELECT-only role) the reuse ledger — each ContextGraphDecision with an ALLOW/BLOCK
    badge, the four checked-dimension chips (time/scope/authority/conditions, each pass/fail), the reason, and a
    needs-human-review flag. Show an EXPIRED candidate as BLOCK with the time chip lit, and an OUT-OF-SCOPE
    candidate as BLOCK with the scope chip lit. Read the verdict; render it, do not re-implement Decide and do
    NOT call any LLM in the browser. Do NOT touch existing routes. Add tests/e2e/decision-reuse.spec.ts (use the
    playwright-e2e skill) asserting BLOCK + failing "time" chip for an expired candidate, BLOCK + failing "scope"
    chip for an out-of-scope candidate (the done criterion visible in the UI), and ALLOW for an in-time/in-scope
    candidate.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    contextgraph is a deep, well-named module (Decide/ContextGraphDecision/the four checks separated and
    obvious; false-dominant order explicit), that Decide is pure, LLM-free, and REUSES S15's TruthScope, S16's
    AuthorityGraph and S01/S02's hash scheme without duplicating or redefining them, that the migration/GRANT
    keeps the wall intact (context is above the line, agent SELECT-only), that a decision is a row never an
    UPDATE, and that boundaries match back/archive/CONTEXT.md (the /brain store is context fuel, never truth; the
    reuse gate permits/blocks, it does not decide what is true). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas migration
    (persistence), the fixture + rapid property (behaviour proof), and the Next route (visualization). Do NOT
    add a new MCP server, a hook, or a Skill — no new backend service, non-bypassable rule, or replayable gesture
    is justified at S32 (the wall already guards context.*; recording verdicts goes through the S20 changeset
    MCP + aidos writer role; the ContextRouter/ContextPack compiler and the MemoryFirewall promotion flow are
    later steps). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. Do not coin a reuse dimension or a scope/authority rule
  KRD §119.2/§13.7/§13.8 does not state: the checks are EXACTLY time / scope / authority / conditions; the verdict
  shape is EXACTLY {may_reuse, reason, checked, required_human_review}. If the exact decision-JSONB columns, the
  content-hash scheme, the TruthScope containment semantics, the AuthorityGraph owner-holds predicate, the
  MemoryItem expiry field, or the request-context shape are not pinned by KRD / an existing migration / S01-S02's
  Canonicalize / S15 / S16, do NOT guess — record an OpenQuestion (provenance) and STOP on that branch. The
  example ids (SLA_WAIVER_001, var ids, "legal", "checkout") are illustrative; reuse pinned artifacts from
  S15/S16 where a real id is needed, do not coin new business ids.
- You NEVER write a truth-test (a new reuse dimension or scope/authority rule you would then satisfy — the
  circularity). The fixture and property are means-tests toward the human red (expired => no reuse; out-of-scope
  => no reuse; LLM-free), not new truths. The Judge is the deterministic mirror, never an LLM scoring its own
  copy — and by the §119.2 keystone, the LLM does not live in this layer at all.
- Any change to a prior contract (S01/S02 records/hash, S15 TruthScope AST, S16 AuthorityGraph AST, S20 ChangeSet
  write-path, the wall GRANTs) goes through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a
  prior artifact, never hand-edit back/gen/**. A decision is a row, never an UPDATE/DELETE (append-only). An
  override is a recorded decision (ChangeSet + ADR + provenance), not an edit.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set -> green AND prior green intact AND mutation score >=
threshold AND no monster. Concretely: the Decide fixtures pass — an EXPIRED candidate yields may_reuse=false with
"time" in checked, an OUT-OF-SCOPE candidate yields may_reuse=false with "scope" in checked (no_reuse_outside_
scope), an in-time/in-scope/in-authority candidate yields may_reuse=true with required_human_review=false, an
authority-not-holding candidate sets required_human_review=true, a failing condition yields may_reuse=false, and
the recorded decision id is the content hash of its body — and the rapid invariants hold (determinism with now
passed in, expired=>false, out-of-scope=>false, true=>all-four-checked-and-passed, no invented candidate/scope,
no clock/network/LLM call, no panic) ; /decision-reuse renders the reuse ledger with ALLOW/BLOCK badges + the
four dimension chips and a passing Playwright e2e ; the context.context_graph_decision GRANT proves SELECT-only
for the agent ; the migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property = the ContextGraphMirror), where stored (mirrors schema)
  and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /decision-reuse — what it renders (the ALLOW/BLOCK reuse ledger + the four time/scope/authority/
  conditions chips + the needs-human-review flag), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes to context.context_graph_decision go through the aidos
  CLI writer role via the S20 changeset flow, not the agent); any prior-contract change -> ChangeSet +
  SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. reuse-gate only (no ContextRouter/ContextPack compilation, no ContextGraph construction, no
  MemoryFirewall promotion flow), TruthScope/AuthorityGraph consumed from S15/S16 not re-coined, the layer is
  strictly LLM-free, no MCP, no hook, no Skill, request-context-shape / authority-holds-predicate assumption.
- Next safe step: the smallest stable next tooth (e.g. the ContextRouter/ContextPack compiler that turns the
  goal + cell + scope + authority into a minimal progressive ContextPack — KRD §119.3/§141-142, the information
  layer — or the MemoryFirewall promotion step) and why it is safe to chain.
```
