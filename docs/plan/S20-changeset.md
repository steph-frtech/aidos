# S20 — ChangeSet (DRAFT/APPLIED/REVERTED, atomic spec+mirror, inverse revert)

Subsystem: AIDOS Archive | Home: `back/archive/changeset` | Workbench route: `/changeset`

## Objectif

Land the **ChangeSet** as the Archive's temporal-axis primitive: the atomic, reversible transactional envelope that moves the kernel from one stable phase to the next, wrapping `spec` (Kernel) and `miroir` (Mirror) **together** so they never drift, with states `DRAFT | APPLIED | REVERTED` only (no `FAILED`), where an `APPLIED` ChangeSet is **immutable** and a revert is a new **inverse** ChangeSet appended to the log (KRD §44, §98, §44.1). This makes "how a mutation is applied and traced" a typed, content-addressed, append-only truth instead of a git-style line.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration for the `changesets` schema), a **non-bypassable rule** (the commit-gate Go hook), a **capability** (the `changeset` MCP server), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new Skill (justified below).

- **Go package** `back/archive/changeset/` — the `ChangeSet` AST type per KRD §44/§98 (`id` = content hash of canonical body, `label`, `status: DRAFT|APPLIED|REVERTED`, `parent_phase`, `spec_delta`, `mirror_delta`, `reverts text NULL`, `applied_at NULL`), and the pure state-machine functions: `Open(label, parentPhase) → ChangeSet{DRAFT}`; `Apply(cs, completeness) → ChangeSet{APPLIED} | BlockReason` (admits `APPLIED` **only if** the completeness law holds — every spec_delta layer has its living mirror, no orphan/monster — else returns an actionable `BlockReason`, KRD §44.5: `code`, `severity`, `explanation`, `how_to_fix[]`); `Revert(applied) → ChangeSet{DRAFT}` that builds the **inverse** ChangeSet (its `spec_delta`/`mirror_delta` are the negation of the source's, `reverts = applied.id`) **without** mutating the source (the source stays `APPLIED`, immutable); `Discard(draft)` that *removes* a hard-errored DRAFT (there is no `FAILED` — on hard error a ChangeSet is deleted, not marked failed). Pure functions only, no I/O; the wiring into the `/goal` flow and the red-wave is a later projection, not this step.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only: `changesets` schema, one content-addressed append-only table `changesets.changeset` (`id text PK` = hash of canonical JSONB body, `body jsonb NOT NULL`, `status text NOT NULL CHECK (status IN ('DRAFT','APPLIED','REVERTED'))`, `parent_phase text`, `reverts text NULL`, `applied_at timestamptz NULL`, `created_at timestamptz NOT NULL`), reusing the S01 content-store substrate (do **not** fork the content-hash scheme). The atomic `{spec_delta, mirror_delta}` pair lives **inside** the JSONB body so spec and mirror can never be stored apart. GRANTs: the agent DB role gets **SELECT only** on `changesets.*` (the wall, §2); a row's transition to `APPLIED` (and the `REVERTED` stamp on a source when its inverse applies) is written **only** by the `aidos` CLI role through this approved ChangeSet flow.
- **Go hook** `back/hooks/posttooluse/` (or a dedicated `commit-gate` binary under `back/hooks/`) — the **commit-gate**: a non-bypassable rule that **refuses the DRAFT→APPLIED transition** unless the completeness law is satisfied (no spec layer without its mirror, no orphan mirror), returning the `BlockReason`. It also refuses any in-place `UPDATE`/`DELETE` of an `APPLIED` or `REVERTED` row (immutability) — the only legal write to an applied envelope's lineage is appending an inverse ChangeSet. Per §5 hook honesty it ships with a **fault-injection test**: drop the mirror_delta from a complete ChangeSet (manufacture an orphan) and assert the gate goes red and blocks `APPLIED`.
- **MCP server** `back/mcp/changeset/` (Go MCP SDK, one tool = one backend op) — the capability door: `changeset_open`, `changeset_status`, `changeset_apply` (runs the commit-gate; only this path stamps `APPLIED`), `changeset_revert` (appends the inverse), `changeset_discard`, `changeset_list`. The Workbench and other agents call these; the server carries the `aidos` CLI write-grant for the `changesets` schema — the agent role never writes truth directly.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **ChangeSet lifecycle fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `state → command → events`, the canonical "add order discount" envelope of KRD §98. Plus a **property invariant** (rapid, `authority: below`) on the state machine. These **are** the done criteria (see below).
- **Next route** `front/web/app/changeset/` → `/changeset` — the Workbench panel rendering a ChangeSet's lifecycle, its atomic spec+mirror deltas, and the inverse-revert lineage (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no Skill** — opening/applying/reverting a ChangeSet is exercised through the `changeset` MCP tools and the standard per-step loop; it is not yet a *distinct* repeatable multi-step gesture warranting its own `SKILL.md` (record an OpenQuestion if one emerges). **No `dag` schema** — branches/merges/stable-phase nodes are a *later* step (the DAG generalizes the ChangeSet edge); here a ChangeSet is a single edge with a `parent_phase`, not yet a graph. **No red-wave / PostKernelChange firing** — propagation onto projections is a later runtime step; this step proves the *envelope*, not the cascade. **No codegen** — there is no projection to emit from a ChangeSet itself.

## Test minimal (done)

**Done = an `APPLIED` ChangeSet is immutable, and a revert is an append-only inverse ChangeSet.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **ChangeSet lifecycle fixture** (`cert_language: fixture`, `authority: above`) — reflects `changesets.changeset` "add-order-discount" (KRD §98), as `state → command → events`:

  ```
  # mirrors schema · reflects: changesets.changeset "add-order-discount" · test_kind: fixture · authority: above
  mirror reflects "add-order-discount" {

    given no changeset
      when open { label: "add order discount", parent_phase: "phase-7" }
        -> events: [ Opened ]
        -> changeset.status == "DRAFT"

    given changeset { status: "DRAFT", spec_delta: <add Order.discount>, mirror_delta: <Order.schema fixture> }
      when apply { }
        -> events: [ Applied ]
        -> changeset.status == "APPLIED"
        -> changeset.applied_at != null

    # completeness gate: spec without its mirror is a monster
    given changeset { status: "DRAFT", spec_delta: <add Order.discount>, mirror_delta: <none> }
      when apply { }
        -> events: [ Blocked ]
        -> changeset.status == "DRAFT"
        -> block_reason.code == "INCOMPLETE_CHANGESET"
        -> block_reason.how_to_fix contains "add_mirror_for_spec_delta"

    # immutability of APPLIED
    given changeset { status: "APPLIED" }
      when edit { spec_delta: <anything> }
        -> events: [ Blocked ]
        -> block_reason.code == "APPLIED_IS_IMMUTABLE"

    # revert is an append-only inverse ChangeSet — source stays APPLIED
    given changeset A { status: "APPLIED", id: "cs-A", spec_delta: <add Order.discount> }
      when revert { of: "cs-A" }
        -> events: [ Reverted ]
        -> new changeset B { status: "DRAFT", reverts: "cs-A", spec_delta: <remove Order.discount> }
        -> changeset A.status == "APPLIED"   # unchanged, immutable
      then apply B
        -> changeset B.status == "APPLIED"
        -> changeset A.status == "REVERTED"  # A is stamped reverted, not deleted

    # no FAILED state — a hard-errored DRAFT is discarded
    given changeset { status: "DRAFT" }
      when discard { }
        -> events: [ Discarded ]
        -> changeset is removed   # never status "FAILED"
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any sequence of `open / apply / revert / discard` commands, the only reachable statuses are `DRAFT | APPLIED | REVERTED` (never `FAILED`); an `APPLIED` ChangeSet is **immutable** (no command mutates its `body`/`spec_delta`/`mirror_delta`); `Apply` succeeds **only if** the completeness predicate holds (no orphan spec layer ⇒ no admission without its mirror = no monster); `Revert(Revert(x))` reconstructs a delta semantically equal to `x`'s (inverse of inverse = identity); every `Revert` **appends** (the log length strictly grows — a revert creates information, never destroys it); a ChangeSet's `id` equals the content hash of its canonical body (content-addressing).

All start **red** (no `changeset` package, no `changesets` schema, no `Open/Apply/Revert/Discard`, no commit-gate, no `changeset` MCP). That red **is** the `/goal`. The canonical done case is green only when applying a complete envelope yields `APPLIED` with `applied_at`, editing it is `blocked` with `APPLIED_IS_IMMUTABLE`, and `revert` of it produces a **new** `DRAFT` inverse whose later `apply` stamps the source `REVERTED` while never destroying it — i.e. **`APPLIED` is immutable; revert is an append-only inverse ChangeSet.**

## Visualisation UI

- **Workbench route:** `front/web/app/changeset/page.tsx` (new route `/changeset`; do **not** touch existing routes). It renders the "add-order-discount" ChangeSet lifecycle: a status badge (`DRAFT` / `APPLIED` / `REVERTED`), the **atomic spec+mirror** pair (`spec_delta` and `mirror_delta` shown side-by-side as one envelope, making visible that they cannot drift), `applied_at`, and the **revert lineage** (source `cs-A` linked to its inverse `cs-B` via `reverts`, with `cs-A` shown stamped `REVERTED` but still present — not deleted). The incomplete-apply attempt renders **red** with the `INCOMPLETE_CHANGESET` `BlockReason` (`code` + `how_to_fix`), and an attempted edit of an `APPLIED` row renders **red** with `APPLIED_IS_IMMUTABLE`. Reads via the SELECT-only role; renders the fixture, does not re-implement the state machine.
- **Playwright e2e:** `tests/e2e/changeset.spec.ts` — navigate to `/changeset`, assert the envelope card shows `label: add order discount` with `spec_delta` and `mirror_delta` rendered together; assert applying the complete envelope shows status `APPLIED` with a non-empty `applied_at`; assert the incomplete-apply row shows `blocked` with `INCOMPLETE_CHANGESET`; assert the edit-after-apply row shows `blocked` with `APPLIED_IS_IMMUTABLE`; assert the revert lineage shows source `cs-A` as `REVERTED` (still present) linked to inverse `cs-B`. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/changeset/**`, the new `back/migrations/<new>.sql`, the new commit-gate hook under `back/hooks/**`, the new `back/mcp/changeset/**`, the `mirrors`-stored lifecycle fixture/property materialized to `tests/`, `tests/e2e/changeset.spec.ts`, and `front/web/app/changeset/**` — and otherwise **adds new files**. It introduces a new contract (the `changeset` AST shape, the `DRAFT|APPLIED|REVERTED` state machine, the inverse-revert semantics, the `INCOMPLETE_CHANGESET` / `APPLIED_IS_IMMUTABLE` `BlockReason` codes) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; an `APPLIED` row is **immutable** and is never edited in place. Any change to a **prior contract** it depends on — the S01 content-store substrate, the wall GRANT set, the `BlockReason` shape (KRD §44.5), or any prior Archive attribute — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema, never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance). Note the recursion: this step *implements* the very envelope the anti-overwrite rule relies on, so its own contract is the one all later steps mutate through.

## Prompt a lancer

```text
You are step-executor for AIDOS step S20 — "ChangeSet (DRAFT/APPLIED/REVERTED, atomic spec+mirror,
inverse revert)". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent
has NO write grant to kernel/mirrors/fitness/changesets), front=Next.js (the Workbench). Home =
back/archive/changeset ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §44 (the two axes — vertical spec↔mirror vs temporal ChangeSet;
"un ChangeSet peut contenir des deux plans, et un hook refuse le passage à APPLIED si la loi de
complétude n'est pas satisfaite"; "pas de statut FAILED ; sur erreur dure, le ChangeSet est supprimé ;
DRAFT|APPLIED|REVERTED uniquement ; un revert crée un nouveau ChangeSet inverse — append-only, un
revert crée de l'information"), §98 (the "add order discount" transaction: begin_changeset →
apply_delta → completeness-check → commit only if green AND complete → revert = inverse ChangeSet),
§44.1 (SemanticDiff change_types: add/refine/override/deprecate/rescope/reauthorize/reweight/
replace_mirror), §44.5 (BlockReason: code, severity, explanation, how_to_fix[] — "tout refus doit être
actionnable"). Read CONTEXT-MAP.md + back/archive/CONTEXT.md (ChangeSet, stable phase, version DAG,
append-only with mutable head, the waterline) and the prior Archive step S01 (the content-addressed
append-only content store you REUSE as substrate — do not fork its content-hash scheme). For any
Next.js 16, Atlas, Go MCP SDK, or rapid API doubt use context7 or node_modules/next/dist/docs. Do not
start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/archive/CONTEXT.md: a "ChangeSet" is the atomic reversible
    transactional ENVELOPE moving from one stable phase to the next, wrapping spec (Kernel) and miroir
    (Mirror) TOGETHER so they never drift; its only statuses are DRAFT | APPLIED | REVERTED (there is
    NO FAILED — a hard-errored DRAFT is DISCARDED/removed, not marked failed); an APPLIED ChangeSet is
    IMMUTABLE; a "revert" is a NEW INVERSE ChangeSet appended to the log (append-only — a revert
    creates information, it never destroys the source, which stays APPLIED until its inverse applies
    and stamps it REVERTED); the commit (DRAFT→APPLIED) is admitted ONLY IF the completeness law holds
    (every spec_delta layer has its living mirror — no orphan, no monster); a "BlockReason" is the
    actionable refusal (code + how_to_fix). Do NOT use "commit", "diff", "transaction", "delta", or
    "revision" as synonyms (CONTEXT.md _Avoid_ list). Resolve every branch before coding — especially:
    one ChangeSet holds BOTH plans (not two); revert builds the inverse WITHOUT mutating the source;
    discard removes a DRAFT, there is no FAILED. If a term shifts, update CONTEXT.md / write an ADR
    inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for
    the runner. Two artifacts, by nature:
      - ChangeSet lifecycle fixture (cert_language: fixture, authority: above), reflecting
        changesets.changeset "add-order-discount" (KRD §98), as state→command→events. Rows:
        open -> Opened, status DRAFT ; apply of a COMPLETE envelope (spec_delta + mirror_delta) ->
        Applied, status APPLIED, applied_at!=null ; apply of an INCOMPLETE envelope (spec_delta, NO
        mirror_delta) -> Blocked, status stays DRAFT, block_reason.code==INCOMPLETE_CHANGESET,
        how_to_fix contains add_mirror_for_spec_delta ; edit of an APPLIED -> Blocked,
        block_reason.code==APPLIED_IS_IMMUTABLE (THE done case) ; revert of APPLIED "cs-A" -> Reverted,
        a NEW DRAFT "cs-B" with reverts=="cs-A" and inverse spec_delta, while cs-A stays APPLIED ; then
        apply cs-B -> cs-B APPLIED and cs-A stamped REVERTED (not deleted) ; discard a DRAFT -> removed
        (never FAILED).
      - property invariant (rapid, authority: below): for any open/apply/revert/discard sequence,
        reachable statuses are exactly DRAFT|APPLIED|REVERTED (never FAILED); an APPLIED ChangeSet is
        immutable; Apply succeeds only if completeness holds (no orphan spec ⇒ no monster);
        Revert(Revert(x)) ≡ x's delta; every Revert APPENDS (log length strictly grows); id == content
        hash of the canonical body.
    Run them; watch them go RED (no changeset package, no changesets schema, no Open/Apply/Revert/
    Discard, no commit-gate, no changeset MCP). That red IS the /goal. Do NOT write a truth-test you
    would then satisfy — mirror the human intention only.

(c) TDD red→green→refactor, in back/archive/changeset ONLY (plus the back/migrations/ schema file, the
    back/hooks/ commit-gate binary, and back/mcp/changeset/). Outside-in. REUSE the S01 content-hash
    content-store substrate for the row shape and the append-only guarantee — do NOT fork it. If a real
    tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the
    SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx,
    the Go MCP SDK, Go hook binaries are FIXED). The likely genuine choices: the canonical-JSONB shape
    that stores spec_delta+mirror_delta as ONE atomic body (reuse S01's content-hash scheme); how the
    inverse delta is represented (negation of the source body, not a re-diff); and the completeness
    predicate's exact signature (what "every spec layer has its mirror" means at this step — keep it
    minimal, an injected predicate is fine, do NOT reach into kernel/mirrors). Record a short ADR
    (docs/adr/) ONLY if a genuine choice is made (e.g. inverse-delta representation, or
    one-ChangeSet-holds-both-plans). The migration is expand-only/append-only; GRANT the agent role
    SELECT only on changesets.* (the wall); only the aidos CLI role (via the changeset MCP) stamps
    APPLIED/REVERTED. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at
    the monorepo root, eslint in front/web, and the new fixture + property + the hook's fault-injection
    test. Self-certify on the COMPUTATIONAL only; never declare the behaviour green from tests you
    wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce Open/Apply/Revert/
    Discard on each fixture row (open, complete-apply, incomplete-apply, edit-applied, revert,
    apply-inverse, discard), state the cause, propose. Check completeness: the changeset layer has its
    living mirror and each required test_kind is present (KRD §33); no monster (no spec_delta without
    its mirror_delta in the envelope — the gate enforces exactly this; no status branch without a
    fixture row) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/changeset/ →
    /changeset: the "add-order-discount" envelope card with a status badge (DRAFT/APPLIED/REVERTED),
    the ATOMIC spec_delta + mirror_delta shown together (so it is visible they cannot drift),
    applied_at, and the revert lineage (cs-A REVERTED but still present, linked to inverse cs-B). The
    incomplete-apply row shows RED with INCOMPLETE_CHANGESET (code + how_to_fix); the edit-after-apply
    row shows RED with APPLIED_IS_IMMUTABLE. Read via the SELECT-only role; render the fixture, do not
    re-implement the state machine. Do NOT touch existing routes. Add tests/e2e/changeset.spec.ts (use
    the playwright-e2e skill) asserting APPLIED with applied_at, blocked/INCOMPLETE_CHANGESET,
    blocked/APPLIED_IS_IMMUTABLE, and the cs-A REVERTED → cs-B inverse lineage.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    changeset is a deep, well-named module; that Open/Apply/Revert/Discard are pure and depend on the
    S01 content-store substrate without duplicating it; that the migration/GRANTs keep the wall intact;
    that the commit-gate hook and the changeset MCP each own exactly one concern; boundaries match
    back/archive/CONTEXT.md (ChangeSet = the temporal-axis envelope, DAG is a later step). Do not
    advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the commit-gate hook (non-bypassable rule — with its fault-injection
    test, §5 hook honesty), the changeset MCP server (capability), the lifecycle fixture + property
    (behaviour proof), and the Next route (visualization). Do NOT add a Skill (no distinct repeatable
    gesture beyond the MCP tools + the standard loop), no `dag` schema (branches/merges/stable-phase
    nodes are a later step), and no red-wave firing (propagation is later). A new artifact may ADD a
    guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a BlockReason code, the exact changeset
  JSONB shape, the completeness predicate's contract, or the inverse-delta representation is not
  pinned by KRD §44/§98/§44.1/§44.5 / an existing migration / ADR / CONTEXT.md, do NOT guess — record
  an OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a fourth status
  (there is NO FAILED), do NOT invent SemanticDiff change_types beyond the §44.1 enum, and do NOT
  reach into the kernel/mirrors schemas to compute completeness — inject the predicate.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The
  lifecycle fixture is a means-test toward the human red, not a new truth.
- Any change to a prior contract (S01 content store, the wall GRANTs, the BlockReason shape) goes
  through a ChangeSet + SemanticDiff. Add new files; never silently rewrite a prior artifact, never
  hand-edit back/gen/**. An APPLIED row is immutable — never edit it in place.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score
≥ threshold ∧ no monster. Concretely: the lifecycle fixture passes — open yields a DRAFT; apply of a
complete envelope yields APPLIED with applied_at; apply of a spec-without-mirror envelope is blocked
with INCOMPLETE_CHANGESET (how_to_fix points at adding the mirror); editing an APPLIED row is blocked
with APPLIED_IS_IMMUTABLE (THE done criterion: APPLIED is immutable); revert of an APPLIED produces a
NEW DRAFT inverse (reverts==source, source still APPLIED), and applying that inverse stamps the source
REVERTED without destroying it (the done criterion: revert is an append-only inverse ChangeSet);
discard removes a DRAFT and no FAILED status is ever reachable; the rapid invariant holds (statuses ⊆
{DRAFT,APPLIED,REVERTED}, APPLIED immutable, Apply gated on completeness, Revert∘Revert ≡ identity,
log strictly grows, id == content hash); the commit-gate's fault-injection test goes red when the
mirror_delta is dropped; /changeset renders the envelope + lineage with the red blocked rows and a
passing Playwright e2e; GRANTs prove SELECT-only on changesets.*; the migration is
append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (changeset lifecycle fixture, rapid property), where stored (mirrors
  schema) and materialized (tests/); the commit-gate fault-injection test.
- Tests run: command + pass/fail counts (fixture, rapid/go test, hook fault-injection, biome, eslint,
  playwright).
- UI route: /changeset — what it renders (envelope status, atomic spec+mirror, revert lineage), e2e
  file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED of any envelope opened during the step (truth writes go
  through the aidos CLI role via the changeset MCP, not the agent); any prior-contract change →
  ChangeSet + SemanticDiff (note the change_type), else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no DAG (branches/merges) yet, no red-wave/PostKernelChange firing yet, no /goal
  wiring, completeness predicate is injected (not reading kernel/mirrors), BlockReason codes supported.
- Next safe step: the smallest stable next tooth (e.g. the `dag` schema that generalizes the ChangeSet
  edge into stable-phase nodes, or wiring the red-wave onto projections) and why it is safe to chain.
```
