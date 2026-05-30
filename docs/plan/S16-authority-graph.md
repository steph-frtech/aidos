# S16 — AuthorityGraph (approver / veto / escalation)

Subsystem: AIDOS Kernel | Home: `back/kernel/authority` | Workbench route: `/authorities`

## Objectif

Land the **AuthorityGraph** as a Kernel source: bind every above-the-line truth to an explicit authority owner (`approvers`, `veto`, `escalation`) keyed by `domain` + `truth_kind`, so that admission can be **decided** — a `regulatory` truth that lacks its required approval (e.g. `legal`) is **blocked** rather than silently admitted (KRD §13.8, §13.3 the four qualifying attributes). This replaces the abstract "the human" with named authorities and makes "who approves what" a typed, content-addressed truth, not a convention.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration for the graph table), a **behaviour proof** (BDD mirror), and a **visualization** (Next route) — and nothing more. It does **not** warrant a new hook, MCP server, or skill (justified below).

- **Go package** `back/kernel/authority/` — the `AuthorityGraph` AST type per KRD §13.8 (`domain`, `truth_kind`, `approvers []role`, `veto []role`, `escalation []role`), a `Validate(graph)` (shape: non-empty `domain`, `truth_kind` is a known epistemic kind per KRD §13.4 enum, `approvers` non-empty, roles are well-formed identifiers, no role appears in both `approvers` and `veto`), and a pure **`Decide(graph, truth, approvals) → AdmissionDecision`** that, given a truth's `{domain, truth_kind}` and the set of granted approvals/vetoes, returns `admitted | blocked | escalated` **plus** a `BlockReason` (KRD §44.5: `code`, `severity`, `explanation`, `how_to_fix[]`) when blocked — e.g. a `regulatory` truth without `legal` approval ⇒ `blocked` with `how_to_fix: [assign_authority, obtain_legal_approval]`. Pure functions only, no I/O; the actual admission wiring into the `/goal` flow is a later projection, not this step.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only: AST table `kernel.authority_graph`, a content-addressed append-only row (`id text PK` = hash of canonical JSONB body, `body jsonb NOT NULL`, `version text NOT NULL`, `superseded_by text NULL`, `created_at timestamptz`), reusing the S02 record substrate (do not fork the content-hash scheme). The `domain`/`truth_kind` keys and the role lists live **inside** the JSONB body. GRANTs: the agent DB role gets **SELECT only** on `kernel.authority_graph` (the wall, §2). Only the `aidos` CLI role writes truth, via an approved ChangeSet.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **AuthorityGraph admission fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `{truth, approvals} → admitted | blocked | escalated`. Plus a **property invariant** (rapid, `authority: below`) on `Decide`. These ARE the done criteria (see below).
- **Next route** `front/web/app/authorities/` → `/authorities` — the Workbench panel rendering the authority graph for a domain and the live admission fixture, with the blocked regulatory case shown red (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no hook** — the per-truth admission gate is a *decision function the `/goal` flow calls*, not a non-bypassable wall rule, and the S04 wall hook already guards `kernel.*` at the schema level (a new hook would need its own fault-injection test and a real failed run first, §5 hook honesty); **no MCP server** — no new backend capability is exposed (the `store` / `idea-intake` MCPs are prior/later steps; `Decide` is pure logic called in-process); **no skill** — declaring an authority graph is not yet a repeatable multi-step gesture distinct from the generic "declare a source"; **no codegen** — there is no projection to emit from an authority graph at this step.

## Test minimal (done)

**Done = a regulatory truth without legal approval is blocked.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **AuthorityGraph admission fixture** (`cert_language: fixture`, `authority: above`) — reflects `kernel.authority_graph` "checkout-regulatory" (KRD §13.8):

  ```
  # mirrors schema · reflects: kernel.authority_graph "checkout-regulatory" · test_kind: fixture · authority: above
  mirror reflects "checkout-regulatory" {
    graph {
      domain: "checkout"
      truth_kind: "regulatory"
      approvers:  [ legal, product_owner ]
      veto:       [ security ]
      escalation: [ architecture_board ]
    }

    given truth { domain: "checkout", truth_kind: "regulatory" }, approvals { }
      -> decision == "blocked"
      -> block_reason.code == "MISSING_AUTHORITY_APPROVAL"
      -> block_reason.how_to_fix contains "obtain_legal_approval"

    given truth { domain: "checkout", truth_kind: "regulatory" }, approvals { legal, product_owner }
      -> decision == "admitted"

    given truth { domain: "checkout", truth_kind: "regulatory" }, approvals { legal, product_owner }, veto { security }
      -> decision == "blocked"
      -> block_reason.code == "VETOED"

    given truth { domain: "checkout", truth_kind: "regulatory" }, approvals { product_owner }
      -> decision == "escalated"
      -> escalated_to contains "architecture_board"
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any graph and any approvals set, `Decide` is **deterministic** and **total** (always one of `admitted | blocked | escalated`); a missing required approver ⇒ never `admitted` (no admission without authority = no monster); any role in `veto` present in the approvals ⇒ `blocked` regardless of approvers (veto dominates); a graph whose `truth_kind` is not in the KRD §13.4 enum ⇒ `Validate` returns a non-empty error.

All start **red** (no `authority` package, no `authority_graph` table, no `Decide`/`Validate`). That red **is** the `/goal`. The canonical done case is green only when `Decide(graph, regulatoryTruth, ∅)` returns `blocked` with a `MISSING_AUTHORITY_APPROVAL` `BlockReason` — i.e. **a regulatory truth without legal approval is blocked**.

## Visualisation UI

- **Workbench route:** `front/web/app/authorities/page.tsx` (new route `/authorities`; do not touch existing routes). It renders the "checkout-regulatory" authority graph: `domain`, `truth_kind`, and the three role lists (`approvers`, `veto`, `escalation`), plus a live **admission table** (the fixture rows with their computed `decision` and, when blocked, the `BlockReason` `code` + `how_to_fix`). Reads via the SELECT-only role. With the canonical example the no-approval row shows `blocked` in red with `MISSING_AUTHORITY_APPROVAL`, the full-approval row shows `admitted`, the vetoed row shows `blocked / VETOED`, and the partial row shows `escalated → architecture_board` — the admission fixture rendered, not re-implemented.
- **Playwright e2e:** `tests/e2e/authorities.spec.ts` — navigate to `/authorities`, assert the graph card names `domain: checkout`, `truth_kind: regulatory`, and lists `legal` under approvers and `security` under veto; assert the admission table shows the no-approval row as `blocked` with `MISSING_AUTHORITY_APPROVAL`, the full-approval row as `admitted`, the veto row as `blocked / VETOED`, and the partial row as `escalated`. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/authority/**`, the new `back/migrations/<new>.sql`, the `mirrors`-stored admission fixture/property materialized to `tests/`, `tests/e2e/authorities.spec.ts`, and `front/web/app/authorities/**` — and otherwise **adds new files**. It introduces a new contract (the `authority_graph` kind, its AST shape, the `Decide` admission semantics and `BlockReason` codes) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table. Any change to a **prior contract** it depends on — the S02 record substrate, the `truth_kind` enum (KRD §13.4), the `BlockReason` shape (KRD §44.5), the wall GRANT set, or any prior `authority`/`scope` attribute — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. Changing an authority owner is exactly a `reauthorize` SemanticDiff change_type (KRD §44.1), not an edit. An override is a recorded decision (ChangeSet + ADR + provenance).

## Prompt a lancer

```text
You are step-executor for AIDOS step S16 — "AuthorityGraph (approver / veto / escalation)". Stack is
FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent has NO write grant to
kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/kernel/authority ONLY. Follow the
CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §13.3 (the four qualifying attributes of an above-the-line truth:
truth_kind, TruthScope, VerifiabilityLevel, AuthorityGraph admission), §13.4 (the truth_kind enum —
behavioral/structural/experiential/economic/regulatory/statistical/exploratory), §13.8 (AuthorityGraph:
domain, truth_kind, approvers, veto, escalation; "toute vérité above-the-line doit avoir un propriétaire
d'autorité explicite"), §44.5 (BlockReason: code, severity, explanation, how_to_fix[] — "tout refus doit
être actionnable"), §44.1 (SemanticDiff change_type incl. reauthorize). Read CONTEXT-MAP.md +
back/kernel/CONTEXT.md (Layer, source/projection, four qualifying attributes, waterline,
test-as-goal/means) and the prior steps' specs (S02 records substrate, S04 the wall). For any Next.js 16,
Atlas, or Go API doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language: an "AuthorityGraph" binds a {domain, truth_kind} to named authorities — an
    "approver" must grant approval for admission; a "veto" role blocks regardless of approvers; an
    "escalation" role is consulted when approvals are partial/contested; an "admission decision" is one of
    admitted | blocked | escalated; a "BlockReason" is the actionable refusal (code + how_to_fix). The
    truth_kind values are the FROZEN KRD §13.4 enum — do not invent a new kind. Sharpen each term against
    back/kernel/CONTEXT.md; if a term shifts, update CONTEXT.md / write an ADR inline. Resolve every branch
    before coding (esp. veto-vs-approver precedence and what "partial approval ⇒ escalate" means exactly).

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - AuthorityGraph admission fixture (cert_language: fixture, authority: above), reflecting
        kernel.authority_graph "checkout-regulatory": graph { domain checkout, truth_kind regulatory,
        approvers [legal, product_owner], veto [security], escalation [architecture_board] }. Rows:
        given regulatory truth + NO approvals -> decision==blocked, block_reason.code==
        MISSING_AUTHORITY_APPROVAL, how_to_fix contains obtain_legal_approval (THE done case) ; +
        {legal, product_owner} -> admitted ; + {legal, product_owner} & veto {security} -> blocked /
        VETOED ; + {product_owner} only -> escalated to architecture_board.
      - property invariant (rapid, authority: below): Decide is deterministic AND total (always one of
        admitted|blocked|escalated); a missing required approver ⇒ never admitted; a vetoed role present
        ⇒ blocked regardless of approvers; an out-of-enum truth_kind ⇒ Validate errors.
    Run them; watch them go RED (no authority package, no authority_graph table, no Decide/Validate). That
    red IS the /goal. Do NOT write a truth-test you would then satisfy (no inventing a new admission
    invariant you'd grade yourself) — mirror the human intention only.

(c) TDD red→green→refactor, in back/kernel/authority ONLY (plus the back/migrations/ AST-table file).
    Outside-in. Reuse the S02 content-hash record substrate for the row shape — do not fork it. If a real
    tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the
    SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx
    are fixed). The likely genuine choices: the canonical-JSONB shape for the authority_graph row (reuse
    S02's content-hash scheme — do not fork it) and the fixture-file format the runner loads. Record a
    short ADR (docs/adr/) ONLY if a genuine choice is made (e.g. veto/approver precedence rule). The
    migration is expand-only/append-only; GRANT the agent role SELECT only on kernel.authority_graph (the
    wall). Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at the
    monorepo root, eslint in front/web, and the new fixture + property. Self-certify on the COMPUTATIONAL
    only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Decide on the four
    fixture rows (no-approval, full-approval, vetoed, partial), state the cause, propose. Check
    completeness: the authority_graph layer has its living mirror and each required test_kind is present
    (KRD §33); no monster (no authority_graph without its admission fixture, no decision branch without a
    fixture row) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/authorities/ →
    /authorities: the checkout-regulatory graph card (domain, truth_kind, approvers/veto/escalation lists)
    and a live admission table (the four fixture rows with computed decision; blocked rows show
    BlockReason code + how_to_fix, the no-approval regulatory row shown RED). Read via the SELECT-only
    role; render the fixture, do not re-implement it. Do NOT touch existing routes. Add
    tests/e2e/authorities.spec.ts (use the playwright-e2e skill) asserting the graph lists legal under
    approvers and security under veto, and the admission table shows blocked/MISSING_AUTHORITY_APPROVAL,
    admitted, blocked/VETOED, and escalated.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    authority is a deep, well-named module; that Decide/Validate are pure and depend on the S02 record
    substrate without duplicating it; that the migration/GRANTs keep the wall intact; boundaries match
    back/kernel/CONTEXT.md (AuthorityGraph as one of the four qualifying attributes). Do not advance
    without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the admission fixture + property (behaviour proof), and the Next route
    (visualization). Do NOT add a hook, an MCP server, or a skill — no new non-bypassable rule (the wall
    already guards kernel.*; admission is a pure decision the /goal flow calls, not a wall rule), no new
    backend capability, and no distinct repeatable gesture is warranted here; a new artifact may ADD a
    guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a role name (legal, security,
  product_owner, architecture_board), a truth_kind value, a BlockReason code, or the exact
  authority_graph JSONB shape is not pinned by KRD §13.4/§13.8/§44.5 / an existing migration / ADR /
  CONTEXT.md, do NOT guess — record an OpenQuestion (provenance) and STOP on that branch. In particular,
  do not invent new truth_kind values beyond the §13.4 enum, and do not invent escalation semantics the
  grill did not pin.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The admission
  fixture is a means-test toward the human red, not a new truth.
- Any change to a prior contract (S02 records, the truth_kind enum, the BlockReason shape, the wall
  GRANTs) goes through a ChangeSet + SemanticDiff (changing an authority owner = a `reauthorize`
  change_type). Add new files; never silently rewrite a prior artifact, never hand-edit back/gen/**.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster. Concretely: the admission fixture passes — a regulatory truth with NO approvals
is `blocked` with a MISSING_AUTHORITY_APPROVAL BlockReason whose how_to_fix points at obtaining legal
approval (THE done criterion: a regulatory truth without legal approval is blocked); full approval ⇒
admitted; a present veto ⇒ blocked/VETOED; partial approval ⇒ escalated to architecture_board; the rapid
invariant holds (Decide total + deterministic, no admission without authority, veto dominates);
/authorities renders the graph + the four admission rows with the blocked regulatory row red and a
passing Playwright e2e; GRANTs prove SELECT-only on kernel.authority_graph; the migration is
append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (authority_graph admission fixture, rapid property), where stored (mirrors
  schema) and materialized (tests/).
- Tests run: command + pass/fail counts (fixture, rapid/go test, biome, eslint, playwright).
- UI route: /authorities — what it renders, e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (truth writes go through the aidos CLI role, not the agent);
  any prior-contract change → ChangeSet + SemanticDiff (note if a `reauthorize`), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no admission wiring into the /goal flow yet, no hook/MCP, escalation-resolution
  depth, role-registry coverage, BlockReason codes supported.
- Next safe step: the smallest stable next tooth (e.g. wire Decide into the /goal admission gate, or the
  TruthScope attribute alongside AuthorityGraph) and why it is safe to chain.
```
