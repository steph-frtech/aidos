# S25 — Semantic merge (the mirror decides the conflict, not the text diff) + `/merge-semantic`

Subsystem: AIDOS Archive | Home: `back/archive/merge` | Workbench route: `/semantic-merge`

## Objectif

Land **semantic merge** of KRD §122 / §130 (`VersionSpace.merge`): merging two truth branches of the version DAG is a **semantic** operation, not a textual one — the **mirror** detects the conflict (**red on the merged cut**, KRD §109 recursive aggregate), so a merge that git would call "clean" is **blocked** when its merged kernel-cut reddens a mirror. This wires the KRDCore law `no_merge_without_semantic_green` (§82.2) as a pure Archive decision plus the `/merge-semantic` gesture, so the Workbench can say "this merge is clean in git but breaks the `refund` emergent invariant on the merged cut" instead of trusting a line-level three-way diff.

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic** (a Go package) and a **replayable gesture** (a Skill — the human reruns "merge these two branches semantically" identically). Nothing more:

- **Go package** `back/archive/merge/` — the semantic-merge decision per KRD §122/§130. A pure `MergeSemantic(base, left, right, sensors) → MergeResult` over **three version-DAG nodes** (`base` = the common ancestor stable phase, `left`/`right` = the two branch heads, each a content-addressed kernel-cut from S02/S23) plus the **mirror verdicts on the merged cut** (the recursive aggregate from S18/S19, the red wave from S22 — *referenced*, never recomputed here). `MergeResult` carries `status ∈ {clean, conflict}`, `conflicting_mirrors[]` (the mirror refs that go red on the merged cut), `merged_cut@hash` (the proposed coherent cut, content-addressed), and `requires_authority` (referenced from S16 — an override decision is human). The decision rule, anchored to the done criterion and KRD §122:
  - the merged cut is the union selection `base + left's deltas + right's deltas`; `MergeSemantic` asks **the mirror**, not the text: it evaluates the recursive aggregate (S18) over that merged cut.
  - **`clean`** — the merged cut's aggregate is GREEN: every link resolves and every mirror (own + composed) is green at once. The merge may proceed (it is a candidate stable phase, S23).
  - **`conflict`** — **the done criterion**: the merged cut reddens **at least one** mirror (e.g. left and right each changed the `refund` invariant, or they touch different lines but break the **same emergent invariant** of a shared parent, KRD §122). The merge is **blocked**; `conflicting_mirrors[]` names the red heads; resolution is an **override decision** (human, above the waterline, ChangeSet + ADR + provenance — KRD §11/§12), never an auto-merge.
  - a **textually-clean** merge (no overlapping line hunks; git would fast-forward / auto-merge) with a **red mirror on the merged cut** is `conflict` — **THE done criterion**: a clean text merge with a red mirror is blocked.
  - `MergeSemantic` is **total and deterministic** (same `(base,left,right,sensors)` ⇒ same `MergeResult`), **pure** (no DB write, no clock, no RNG — it reads cuts + mirror verdicts and decides), and **never panics**; an input it cannot map (a missing common ancestor, a cut it cannot evaluate) yields an explicit `unresolvable → OpenQuestion`, never a guessed `clean`.
- **Skill** `.claude/skills/merge-semantic/` (`SKILL.md`) — the replayable gesture "merge two truth branches semantically": load `base`/`left`/`right` (via the SELECT-only agent role / the DAG-node refs from S23), build the merged cut, run the mirror aggregate (S18) + red wave (S22) on it, and route by `MergeResult` — a `clean` result may be recorded as a stable phase (S23) via a ChangeSet (S20); a `conflict` result is **blocked** and surfaces the `conflicting_mirrors[]` to a human as an override decision (`requires_authority`, S16). One gesture, replayed identically — justifying a Skill per §5.

> Explicitly **out of scope** (would be monsters / out of slot here): **no Postgres migration** — the merged cut is content-addressed via S02's existing store; this step adds no new truth table. The DAG nodes/edges already exist (S20 ChangeSet, S23 stable phase). **No new hook** — the non-bypassable rule `no_stable_phase_with_red_mirror` is already enforced by S23's phase gate, and the wall GRANT by S04; semantic merge **reuses** that gate (a `conflict` cut is, by definition, not a stable phase) rather than adding a parallel guardrail (a new artifact ADDs a guardrail, never removes/duplicates one — §5). **No MCP server** — no new backend op is justified; `/merge-semantic` reads cuts + mirror verdicts through the SELECT-only role and produces a decision; recording a `clean` merge as a stable phase rides the existing S20/S23 ChangeSet path. **No red-wave/aggregate computation** — the recursive aggregate (S18/S19) and the red wave (S22) are *referenced*, never re-implemented here. **No CLI verb** — merge is a gesture (Skill) over existing surfaces (`aidos stable`, the ChangeSet path); coining `aidos merge` is a later step, not this one (do not invent its flags). **No quality-diversity curation** — promotion/ArchiveCurationPolicy is a later step (the DAG keeps both branches append-only regardless). **No truth write** — `MergeSemantic` decides; applying a `clean` merge is the ChangeSet path, owned by S20. **No codegen/emitters.**

## Test minimal (done)

**Done = a clean text merge with a red mirror is blocked.** Restated **failing-first**, as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Workflow / fixture (N2) — `state → command → events`, interpreted in Go**, stored in `mirrors`, materialized to `tests/`:

  ```
  # mirrors schema · reflects: archive.merge.MergeSemantic · test_kind: fixture · cert_language: operation-dsl/go · authority: above
  fixture "a clean text merge with a red mirror is blocked"        # THE done criterion
    state   (base):  stable phase v0 { invariant "refund" @v1, mirror(refund) == GREEN }
    command (merge): left  = branch { invariant "refund" @v2-EU  }   # no overlapping text hunk
                     right = branch { invariant "refund" @v2-US  }   # git would auto-merge cleanly
    events:  [ status == conflict,                                   # the mirror, not the diff, decides
               "refund" ∈ conflicting_mirrors,                       # red on the merged cut (KRD §122)
               merge BLOCKED → requires_authority (override, human) ]

  fixture "two branches breaking the same emergent invariant conflict"
    state   (base):  view "cart" { own_mirror: "empty ⇒ nothing payable" @v1, aggregate == GREEN }
    command (merge): left  changes control "pay-button"  (different lines)
                     right changes control "amount-field" (different lines)   # disjoint text
    events:  [ status == conflict,                                   # same emergent invariant broken
               "cart.own_mirror" ∈ conflicting_mirrors ]             # KRD §122 — red git never sees

  fixture "a merge whose merged cut is fully green is clean"
    state   (base):  stable phase v0
    command (merge): left adds control "promo-banner" (free space) ; right adds control "help-link" (free space)
    events:  [ status == clean,                                     # aggregate GREEN on merged cut
               conflicting_mirrors == [],
               merged_cut is a candidate stable phase (S23) ]

  fixture "an unresolvable merge becomes an OpenQuestion, never a guessed clean"
    state   (base):  (no common ancestor between left and right, or a cut MergeSemantic cannot evaluate)
    command (merge): left, right
    events:  [ MergeSemantic yields unresolvable → OpenQuestion (provenance),
               NOT a fabricated `clean` (NEVER auto-merge an unknown) ]
  ```

- **Invariant (∀) — `rapid` property test (Go), below the line, computational:**

  ```
  # reflects: archive.merge.MergeSemantic · test_kind: property · cert_language: rapid · authority: below
  ∀ base,left,right,sensors:  MergeSemantic is deterministic — same inputs ⇒ same MergeResult; status ∈ {clean, conflict} ∨ unresolvable
  ∀ base,left,right:          any red mirror on the merged cut ⇒ status == conflict  (never clean — the mirror decides, KRD §122)
  ∀ base,left,right:          a fully-green merged-cut aggregate ⇒ status == clean ∧ conflicting_mirrors == []
  ∀ base:                     MergeSemantic(base, base, base) ⇒ clean, empty merged cut (identity ⇒ no-op, no spurious conflict)
  ∀ base,left,right:          a textually-clean pair with a red merged-cut mirror ⇒ conflict (text-cleanliness NEVER overrides a red mirror)
  ∀ base,left,right:          MergeSemantic never panics — a missing ancestor / unevaluable cut yields unresolvable, not a crash
  ∀ base,left,right:          MergeSemantic never WRITES — it is pure over its inputs; no DB mutation, no clock, no RNG
  ```

Both start **red** (no `merge` package, no `MergeSemantic`, no `/merge-semantic` skill). That red **is** the `/goal`. The fixture mirror is a **means-test toward the human red** (clean-text + red-mirror ⇒ blocked) — not a new truth the agent invents and then grades. The agent does **not** author a new merge-conflict rule; it mirrors KRD §122 / the `no_merge_without_semantic_green` law (§82.2) and reuses the S18 aggregate + S22 red wave as the oracle.

## Visualisation UI

- **Workbench route:** `front/web/app/semantic-merge/page.tsx` (new route `/semantic-merge`; do not touch existing routes). A read-only panel that takes a `base` + `left`/`right` branch-head triple (via the SELECT-only role / DAG-node refs from S23), calls the same `MergeSemantic` result the `/merge-semantic` skill produces, and renders the verdict **as a mirror decision, not a line diff** (KRD §122): a prominent `status` badge (`clean` / `conflict`), and on conflict the list of `conflicting_mirrors[]` with a plain-language sentence ("git would merge these cleanly, but the merged cut reddens the `refund` invariant — this is an override decision; required authority: …"), plus the referenced `merged_cut@hash` and `requires_authority`. With the canonical examples it shows the no-overlap `refund` EU/US pair as **conflict** (the done criterion — clean text, red mirror), the disjoint-lines / same-emergent-invariant `cart` pair as **conflict**, and the free-space promo-banner / help-link pair as **clean** — the verdict rendered, not re-computed in the front-end.
- **Playwright e2e:** `tests/e2e/semantic-merge.spec.ts` — navigate to `/semantic-merge`, load the canonical triples, and assert the done criterion is **visible in the UI**: the textually-clean `refund` EU/US merge shows `conflict` with `refund` in `conflicting_mirrors` and a "blocked — override required" message (a clean text merge with a red mirror is blocked), the disjoint-lines `cart` merge shows `conflict`, and the free-space pair shows `clean`. Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/archive/merge/**`, the `mirrors`-stored fixture/property materialized to `tests/`, `tests/e2e/semantic-merge.spec.ts`, `.claude/skills/merge-semantic/**`, and `front/web/app/semantic-merge/**` — and otherwise **adds new files**. It defines one new contract (the `MergeResult` shape, the `{clean, conflict}` status set + `unresolvable`, and the `MergeSemantic` signature); it changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement, no touching prior Workbench routes or CLI subcommands, no new truth table. Any change to a **prior contract** it depends on — the S02 record substrate / content-hash, the recursive `composes` aggregate (S18), the weighted/threshold propagation (S19), the ChangeSet envelope and its DRAFT→APPLIED→REVERTED states (S20), the SemanticDiff classifier (S21), the red wave / RedWorkQueue (S22), the stable-phase coherent-cut decision and `IsStable` (S23), the AuthorityGraph `requires_authority` (S16), the wall GRANTs (S04) — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated) plus a **SemanticDiff** on the affected schema/mirror, never an in-place edit. An override (here: resolving a merge `conflict`) is a recorded decision (ChangeSet + ADR + provenance), not an edit. The wall holds: `MergeSemantic` and `/merge-semantic` are read-only deciders — applying a `clean` merge writes truth only via the existing S20 ChangeSet path under the approved `aidos` role, never the agent.

## Prompt a lancer

```text
You are step-executor for AIDOS step S25 — "Semantic merge (the mirror decides the conflict, not the text
diff) + /merge-semantic". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed; the agent
has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home = back/archive/merge ONLY
(plus the new /merge-semantic skill and the /semantic-merge Workbench route). Follow the CLAUDE.md §6 per-step
loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §122 (the merge of two truth branches is a SEMANTIC operation, not a
textual one — the MIRROR detects the conflict, red on the merged cut; a git-clean merge can be a KRD monster,
and two branches touching different lines can break the SAME emergent invariant → red git never sees), §120-121
(the version space is a DAG; branch / checkout-ancestor / re-branch / merge are moves in the DAG), §123-125 (the
DAG IS the quality-diversity archive; a stable phase is a coherent cut on any branch — promotion is guarded by
the mirror, never by the DAG), §109 (the recursive aggregate: GREEN iff own_mirror green AND every composes-child
green — this is what reddens the merged cut), §11/§12 (resolving a conflict is an OVERRIDE = a recorded human
decision, not an edit), §130 (VersionSpace.merge: conflict detected by the mirror; promotion only if it passes
the mirror), and §82.2 (KRDCore law `no_merge_without_semantic_green` — THE law this step enforces). Read
CONTEXT-MAP.md + back/archive/CONTEXT.md (the archive / version DAG / stable phase / ChangeSet glossary) and the
prior steps' specs it depends on: S02 (records substrate / content-hash), S04 (the wall / GRANTs), S16
(AuthorityGraph — requires_authority), S18 (composes + recursive aggregate), S19 (weighted/threshold
propagation), S20 (ChangeSet DRAFT/APPLIED/REVERTED), S21 (SemanticDiff), S22 (red wave / RedWorkQueue), S23
(stable phase / IsStable / aidos stable). For any Next.js 16 or Go API doubt use context7 or
node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the ubiquitous
    language against KRD §122/§130: a semantic merge merges two TRUTH BRANCHES of the version DAG (base/left/
    right = content-addressed kernel-cuts), and THE MIRROR decides the conflict — RED ON THE MERGED CUT (the
    recursive aggregate, §109), not a line-level three-way diff. Sharpen each term: "merged cut" = the union
    selection base+left+right as a candidate coherent cut (S23); "conflict" = at least one mirror reddens on
    that cut (KRD §122) — including two disjoint-line changes that break the SAME emergent invariant; "clean" =
    the merged-cut aggregate is GREEN; resolving a conflict is an OVERRIDE (human, above the waterline, ChangeSet
    + ADR + provenance), never an auto-merge. THE done criterion: a textually-clean merge (git would
    fast-forward / auto-merge, no overlapping hunks) WITH a red mirror on the merged cut is a CONFLICT and is
    BLOCKED. This step delivers the DECIDER + the /merge-semantic gesture, NOT a CLI verb (aidos merge is later),
    NOT the red-wave/aggregate computation (referenced from S18/S19/S22), NOT quality-diversity curation (later),
    NOT any truth write (applying a clean merge rides the S20 ChangeSet path). Sharpen each term against the
    CONTEXT.md files; if a term shifts, update back/archive/CONTEXT.md / write an ADR inline. Resolve every branch
    before coding.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized to tests/ for
    the runner. Two artifacts, by nature:
      - FIXTURE (N2 frozen slot: state → command → events, interpreted in Go): state = the base stable phase +
        the relevant mirror verdicts; command = the left/right branch heads to merge; events = the MergeResult.
        Cover the done criterion explicitly — a clean-text refund EU/US pair (no overlapping hunk) with a red
        merged-cut mirror ⇒ CONFLICT, refund ∈ conflicting_mirrors, BLOCKED → requires_authority — plus
        disjoint-lines breaking the SAME emergent cart invariant ⇒ CONFLICT, a free-space promo-banner/help-link
        pair ⇒ CLEAN (candidate stable phase), and an unevaluable / no-common-ancestor pair ⇒ UNRESOLVABLE →
        OpenQuestion (NEVER a fabricated `clean`, NEVER an auto-merge of the unknown).
      - PROPERTY (rapid, ∀, below the line): MergeSemantic is deterministic and total (status ∈ {clean, conflict}
        ∨ unresolvable); any red mirror on the merged cut ⇒ conflict (never clean — the mirror decides); a
        fully-green merged-cut aggregate ⇒ clean ∧ conflicting_mirrors == []; MergeSemantic(base,base,base) ⇒
        clean no-op; a textually-clean pair with a red merged-cut mirror ⇒ conflict (text-cleanliness NEVER
        overrides a red mirror); MergeSemantic never panics and never WRITES (pure over its inputs; no DB, no
        clock, no RNG).
    Run them; watch them go RED (no merge package, no MergeSemantic, no /merge-semantic skill). That red IS the
    /goal. Do NOT write a truth-test you would then satisfy (do not invent a new merge-conflict rule you'd grade
    yourself) — mirror KRD §122 and the no_merge_without_semantic_green law (§82.2) only; the fixture is a
    means-test toward the human red, and the S18 aggregate + S22 red wave are the ORACLE (reuse them, do not
    re-implement).

(c) TDD red → green → refactor in back/archive/merge ONLY (plus the /merge-semantic skill + the /semantic-merge
    route). Outside-in. Build: the typed MergeResult (status ∈ {clean, conflict} + unresolvable; conflicting_
    mirrors[]; merged_cut@hash; requires_authority referenced from S16), and a pure MergeSemantic(base, left,
    right, sensors) → MergeResult — no I/O, no clock/RNG, NO write; a pure function of the three cuts + the
    mirror verdicts on the merged cut. It builds the merged cut (union selection), asks the recursive aggregate
    (S18/S19) + red wave (S22) on it — REUSE those, do NOT fork them — and decides clean vs conflict. Within the
    frozen slots, if a REAL tool choice arises, search AT MOST 3 current (May 2026) options, pick the SIMPLEST,
    never touch the mandatory minimum (Godog, rapid, the fixture/Operation-DSL interpreter, sqlc/pgx, the Go MCP
    SDK are fixed). The likely genuine choices: how the merged cut is assembled from base+left+right deltas
    (REUSE S02's Canonicalize/Hash and the S23 cut representation — do NOT fork them) and how the three-way text
    "would git auto-merge?" pre-check is computed (it must NEVER override a red mirror — it only proves the
    "clean text yet blocked" case; keep it minimal). Record a short ADR (docs/adr/) ONLY if a genuine choice is
    made. MergeSemantic reads existing DAG nodes + mirror verdicts (S02/S18/S19/S22/S23) — it adds NO truth table
    and writes NO truth. Code only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, the new fixture + rapid
    mirrors, biome check at the monorepo root, eslint in front/web. Self-certify on the COMPUTATIONAL only;
    never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce MergeSemantic on the
    clean-text-yet-red, same-emergent-invariant, and free-space cases, state the cause, propose. Check
    completeness: archive.merge.MergeSemantic has its living mirror (the fixture + property); no monster (no
    truth without a mirror, no orphan mirror, no fabricated `clean` admitted in place of unresolvable, no
    auto-merge of a conflict) — else Stop blocks. Do not finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/semantic-merge/ →
    /semantic-merge: take a base + left/right triple (SELECT-only role / DAG-node refs from S23), call the same
    MergeSemantic result the /merge-semantic skill emits, and render it as a MIRROR DECISION, not a line diff
    (§122): a status badge (clean / conflict) + on conflict the conflicting_mirrors[] list and a plain sentence
    ("git would merge these cleanly, but the merged cut reddens the refund invariant — override decision;
    required authority: …") + referenced merged_cut@hash / requires_authority. Show the no-overlap refund EU/US
    pair as CONFLICT (the done criterion), the disjoint-lines cart pair as CONFLICT, and the free-space pair as
    CLEAN. Render the verdict, do not re-compute it. Do NOT touch existing routes. Add tests/e2e/
    semantic-merge.spec.ts (use the playwright-e2e skill) asserting the done criterion is visible in the UI: the
    clean-text refund merge shows conflict + "blocked, override required", the cart merge shows conflict, the
    free-space pair shows clean.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that merge is a
    deep, well-named module (MergeSemantic / MergeResult / status cleanly separated, the status set closed and
    obvious, clean vs conflict distinct), that MergeSemantic is pure and REUSES S18's aggregate + S19's
    propagation + S22's red wave + S02's canonicalize/hash + the S23 cut without duplicating them, that the
    "would git auto-merge" pre-check can never override a red mirror, that the wall stays intact (no truth write
    — applying a clean merge rides the S20 path), and that boundaries match back/archive/CONTEXT.md. Do not
    advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic) and the Skill /merge-semantic
    (the replayable "merge two branches semantically" gesture). Plus the required Next route (visualization). Do
    NOT add a Postgres migration (no new truth table — the merged cut is content-addressed via S02; the DAG
    nodes/edges exist in S20/S23), a hook (no new non-bypassable rule — no_stable_phase_with_red_mirror is
    already enforced by the S23 phase gate and the wall by S04; a conflict cut is by definition not a stable
    phase, so REUSE that gate, do not duplicate it), an MCP server (no new backend op — /merge-semantic reads
    through the SELECT-only role and decides; recording a clean merge rides the S20 ChangeSet path), or a CLI
    verb (aidos merge is a later step). A new artifact may ADD a guardrail, never REMOVE or duplicate one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. The merge status set is CLOSED ({clean, conflict} +
  unresolvable) — do not add a status KRD does not name. If the exact merged-cut assembly (how base+left+right
  deltas combine), the recursive-aggregate / red-wave verdict interface (S18/S19/S22), the stable-phase cut
  representation (S23), the content-hash/canonicalize scheme (S02), the requires_authority shape (S16), or where
  the three DAG nodes are read from are not pinned by KRD / an existing migration / a referenced step, do NOT
  guess — record an OpenQuestion (provenance) and STOP on that branch. When MergeSemantic cannot evaluate a
  merge (missing common ancestor, unevaluable cut), it MUST emit "unresolvable → OpenQuestion", NEVER a
  fabricated `clean` and NEVER an auto-merge. The example artifacts (refund, view "cart", pay-button,
  amount-field, promo-banner, help-link) are reused from prior pinned steps; do not coin new ones.
- You NEVER write a truth-test (a new merge-conflict invariant you would then satisfy — the circularity). The
  fixture and property are means-tests toward the human red (clean text + red mirror ⇒ blocked) and mirror KRD
  §122 / the no_merge_without_semantic_green law (§82.2); the S18 aggregate + S22 red wave are the oracle, not a
  truth you invent.
- Any change to a prior contract (S02 records/hash, S16 authority, S18 aggregate, S19 propagation, S20 ChangeSet,
  S21 SemanticDiff, S22 red wave, S23 stable phase / cut, S04 wall GRANTs) goes through a ChangeSet +
  SemanticDiff. Add new files; never silently rewrite a prior artifact, never hand-edit back/gen/**. Resolving a
  merge conflict is a recorded override decision (ChangeSet + ADR + provenance), not an edit. MergeSemantic and
  /merge-semantic NEVER write truth.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the MergeSemantic fixtures pass — a clean-text refund EU/US merge with a red
merged-cut mirror is a CONFLICT and is BLOCKED (the done criterion), two disjoint-line changes breaking the same
emergent cart invariant is a CONFLICT, a free-space promo-banner/help-link merge is CLEAN (a candidate stable
phase), an unevaluable/no-ancestor merge is UNRESOLVABLE → OpenQuestion (never a fabricated clean, never an
auto-merge); the rapid invariants hold (determinism, totality, identity⇒clean no-op, any-red⇒conflict,
all-green⇒clean, text-cleanliness-never-overrides-red, no panic, NO write); /semantic-merge renders the verdict
as a mirror decision with a passing Playwright e2e; the wall proves MergeSemantic and /merge-semantic write no
truth. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (fixture N2 + rapid property), where stored (mirrors schema) and materialized (tests/).
- Tests run: command + pass/fail counts (go test / fixture interpreter, rapid, biome, eslint, playwright).
- UI route: /semantic-merge — what it renders (status badge + conflicting_mirrors[] + human-language sentence +
  referenced merged_cut@hash / requires_authority), e2e file + result.
- ChangeSet status: DRAFT|APPLIED|REVERTED (S25 adds no truth; MergeSemantic and /merge-semantic are read-only) —
  any prior-contract change → ChangeSet + SemanticDiff, else "none".
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no aidos merge CLI verb (later), no quality-diversity curation / ArchiveCurationPolicy
  (later), red-wave/aggregate referenced from S18/S19/S22 (not recomputed), /merge-semantic read-only (applying a
  clean merge rides the S20 ChangeSet path), no migration/hook/MCP, the merged-cut-assembly and DAG-node-read
  assumptions.
- Next safe step: the smallest stable next tooth (e.g. wiring /merge-semantic's clean result into the S20
  ChangeSet DRAFT→APPLIED gate so a clean merge becomes a recorded stable-phase transition, or landing the
  quality-diversity promotion guard — a branch merges to the head only if it passes the mirror, KRD §124) and why
  it is safe to chain.
```
