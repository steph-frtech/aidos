# S27 — Ideas lifecycle (draft/grilled/spiking/harvested/rejected); promote only via mirror+goal

Subsystem: AIDOS Kernel | Home: `back/kernel/ideas` | Workbench route: `/ideas`

## Objectif

Land the **`Idea`** record and its lifecycle (`draft | grilled | spiking | harvested | rejected`) as the **only door into the kernel**: an idea is a candidate-truth with `proposes` + `intent` + `provenance` but **no version-freeze and no mirror** (KRD §118), and it becomes a kernel truth **only** by acquiring its mirror — the `harvested → write mirror = /goal = freeze` transition (KRD §116). The done invariant: **you cannot write an idea into the kernel directly; promotion requires a mirror.**

## Sortie attendue

Per CLAUDE.md §5 this step needs **pure logic/schema** (Go package), **persistence** (Atlas migration for the `ideas` schema), a **capability** (the `idea-intake` MCP server), a **non-bypassable rule** (the promotion-gate Go hook), a **behaviour proof** (BDD mirror), and a **visualization** (Next route). It does **not** warrant a new Skill (justified below).

- **Go package** `back/kernel/ideas/` — the `Idea` AST/record per KRD §118 (`id` = content hash of canonical body reusing the S01 content-store substrate, `proposes` = the targeted layer/kind it would become — `control | policy | operation | action | entity | product`, `intent` = the sketched behaviour in prose, **not yet falsifiable**, `provenance` = `human:"finalement je veux que…" | incident:#NNNN`, `status: draft|grilled|spiking|harvested|rejected`) — explicitly **no `version`/freeze field and no `mirror` field**, which is exactly what distinguishes an idea from a truth (KRD §118 comment, §115 "un corps esquissé, sans tête-preuve, pas encore figé"). Plus the pure lifecycle state-machine functions on the §75 gestures: `Capture(proposes, intent, provenance) → Idea{draft}`; `Grill(idea) → Idea{grilled}`; `Spike(grilled) → Idea{spiking}` (the "floue ?" branch — exploration, ratchet OFF); `Harvest(grilled|spiking) → Idea{harvested}` (extracts the discovered truth, the clear branch); `Reject(idea, reason) → Idea{rejected}` (traced, never deleted); and the gate function `Promote(harvested, mirror) → KernelPromotion | BlockReason` that **refuses** unless a real mirror is supplied — `Promote` of an idea **without** a mirror returns the actionable `BlockReason` (`code: NO_MIRROR_NO_KERNEL`, `how_to_fix[]` = "write the BDD mirror = run /goal = freeze"). Pure functions only, no I/O; the actual writing of the resulting truth into the kernel is **not** done here (the agent has no grant — it is the `aidos` CLI role via the /goal flow), this step proves the *gate and the lifecycle*, not the kernel write.
- **Atlas migration** (`back/migrations/`) — declarative, expand-only: `ideas` schema, one content-addressed append-only table `ideas.idea` (`id text PK` = hash of canonical JSONB body, `body jsonb NOT NULL` holding `proposes`/`intent`/`provenance`, `status text NOT NULL CHECK (status IN ('draft','grilled','spiking','harvested','rejected'))`, `provenance jsonb NOT NULL`, `created_at timestamptz NOT NULL`), reusing the S01 content-hash scheme (do **not** fork it). The table has **no `mirror` and no `version`/freeze column** — by construction an idea cannot carry the thing that would make it a truth. GRANTs: the agent DB role gets **INSERT/SELECT/UPDATE-status only** on `ideas.*` (an idea is staging *above* the wall, §2 — the agent may capture/advance ideas) but **no grant whatsoever on the `kernel`/`mirrors` schemas** (the wall holds); the kernel write on promotion is the `aidos` CLI role through the /goal flow, never this role.
- **Go hook** `back/hooks/pretooluse/` (or a dedicated `promotion-gate` binary under `back/hooks/`) — the **promotion-gate**: a non-bypassable rule that **refuses any write into the `kernel` schema whose provenance is an idea lacking a mirror**, returning the `NO_MIRROR_NO_KERNEL` `BlockReason`. It is the runtime enforcement of KRD §116 ("promouvoir une idée = écrire son miroir + la geler") and §119.1 ("aucun MemoryItem ne peut entrer dans `/kernel` sans passer par Idea → Mirror → Goal → Kernel"). Per §5 hook honesty it ships with a **fault-injection test**: attempt to promote a `harvested` idea with `mirror = none` and assert the gate goes red and blocks the kernel write with `NO_MIRROR_NO_KERNEL`.
- **MCP server** `back/mcp/idea-intake/` (Go MCP SDK, one tool = one backend op) — the capability door for the lifecycle: `idea_capture` (human or incident → `draft`), `idea_grill` (→ `grilled`), `idea_spike` (→ `spiking`), `idea_harvest` (→ `harvested`), `idea_reject` (→ `rejected`, with reason), `idea_status`, `idea_list`. It carries the `ideas`-schema write-grant; it deliberately has **no** `idea_promote_to_kernel` tool that bypasses the mirror — promotion is the /goal flow, and the gate refuses any other path.
- **BDD mirror** (stored in the `mirrors` schema, materialized for the runner) — the **Idea lifecycle fixture** (`test_kind: fixture`, `cert_language: fixture`, `authority: above`): `state → command → events` over `capture → grill → {spike → harvest | harvest} → promote`, plus the **reject** branch, and the **`promote-without-mirror → Blocked`** done case. Plus a **property invariant** (rapid, `authority: below`) on the state machine. These **are** the done criteria (see below).
- **Next route** `front/web/app/ideas/` → `/ideas` — the Workbench panel rendering the idea board: each idea's `proposes`/`intent`/`provenance`/`status`, the lifecycle transitions, and the **red blocked promotion** when no mirror exists (see "Visualisation UI").

> Explicitly **out of scope** (would be monsters / out of slot here): **no Skill** — `/grill`, `/spike`, `/harvest`, `/goal` already exist as KRD §75 gestures and the lifecycle is driven through the `idea-intake` MCP tools and the standard loop; no *new distinct* repeatable gesture warrants its own `SKILL.md` here (record an OpenQuestion if one emerges). **No kernel write / no actual freeze** — promoting an idea writes a truth into the `kernel` schema via the /goal flow and the `aidos` CLI role, which is a *later* wiring; this step proves the *lifecycle and the promotion-gate*, not the downstream kernel mutation. **No MemoryFirewall / ContextPack** — `Memory → ContextPack → Idea` (§119.1) is a later Archive/brain step; here ideas enter from `human` or `incident` provenance only. **No codegen** — an idea is a candidate, not a frozen source, so there is nothing to emit (no Go structs / DDL / TS types) from an idea body itself.

## Test minimal (done)

**Done = you cannot write an idea into the kernel directly; promotion requires a mirror.** Restated **failing-first** as the red BDD mirror to write **before** any code, conceptually stored in the `mirrors` schema and materialized for the runner.

- **Idea lifecycle fixture** (`cert_language: fixture`, `authority: above`) — reflects `ideas.idea`, as `state → command → events`:

  ```
  # mirrors schema · reflects: ideas.idea "order-discount-idea" · test_kind: fixture · authority: above
  mirror reflects "order-discount-idea" {

    given no idea
      when capture { proposes: "policy", intent: "give regulars a discount", provenance: human:"finalement je veux une remise" }
        -> events: [ Captured ]
        -> idea.status == "draft"
        -> idea.version == null        # an idea has no freeze
        -> idea.mirror  == null        # an idea has no mirror — that is what makes it an idea

    given idea { status: "draft" }
      when grill { }
        -> events: [ Grilled ]
        -> idea.status == "grilled"

    # the "floue ?" branch — exploration, ratchet OFF
    given idea { status: "grilled" }
      when spike { }
        -> events: [ Spiking ]
        -> idea.status == "spiking"

    given idea { status: "spiking" }
      when harvest { }
        -> events: [ Harvested ]
        -> idea.status == "harvested"

    # THE done case — promotion WITHOUT a mirror is refused at the wall
    given idea { status: "harvested" }
      when promote { mirror: none }
        -> events: [ Blocked ]
        -> idea.status == "harvested"            # stays staged above the wall, no kernel write
        -> block_reason.code == "NO_MIRROR_NO_KERNEL"
        -> block_reason.how_to_fix contains "write_mirror_run_goal_freeze"

    # promotion WITH a mirror = /goal = freeze (the only legal door)
    given idea { status: "harvested" }
      when promote { mirror: <order-discount red BDD mirror> }
        -> events: [ Promoted ]
        -> a kernel truth is created via the /goal flow (aidos CLI role, not the agent)
        -> the new truth.provenance points back to "order-discount-idea"

    # bad idea -> rejected, traced, never deleted
    given idea { status: "grilled" }
      when reject { reason: "duplicates existing policy" }
        -> events: [ Rejected ]
        -> idea.status == "rejected"
        -> idea is still present        # traced rejection, append-only
  }
  ```

- **Invariant (∀) — property test (rapid, Go), `authority: below`:** for any sequence of `capture / grill / spike / harvest / reject / promote` commands, the only reachable statuses are exactly `draft | grilled | spiking | harvested | rejected`; an `Idea` **never** carries a `version`/freeze nor a `mirror` field (the type makes it unrepresentable); `Promote` succeeds **only if** a non-empty mirror is supplied (no mirror ⇒ `BlockReason`, no kernel write — the wall holds for *every* idea, not just the canonical one); `Reject` is **append-only** (the rejected idea remains, the log never shrinks); a `harvested` idea reached via `spike` and one reached directly from `grilled` are indistinguishable for promotion (both still need the mirror); an idea's `id` equals the content hash of its canonical body (content-addressing).

All start **red** (no `ideas` package, no `ideas` schema, no `Capture/Grill/Spike/Harvest/Reject/Promote`, no promotion-gate, no `idea-intake` MCP). That red **is** the `/goal`. The canonical done case is green only when a `harvested` idea promoted **without** a mirror is `Blocked` with `NO_MIRROR_NO_KERNEL` (and stays staged), while the same idea promoted **with** its red mirror flows through /goal to a frozen kernel truth whose provenance points back to the idea — i.e. **promotion requires a mirror; the kernel door has no other key.**

## Visualisation UI

- **Workbench route:** `front/web/app/ideas/page.tsx` (new route `/ideas`; do **not** touch existing routes). It renders the idea board: one card per idea showing `proposes`, `intent`, `provenance` (the human utterance or `incident:#NNNN`), and a `status` badge cycling `draft → grilled → spiking → harvested` plus a `rejected` lane. The card makes visible that the idea **has no mirror and no freeze** (an explicit "no mirror yet" marker), and the attempted promotion of a `harvested` idea with no mirror renders **red** with the `NO_MIRROR_NO_KERNEL` `BlockReason` (`code` + `how_to_fix` = "write the mirror = /goal = freeze"). When a mirror exists, the card shows the **promote → /goal → frozen kernel truth** path with the provenance link back to the idea. Reads via the SELECT-grant role; renders the fixture, does not re-implement the state machine.
- **Playwright e2e:** `tests/e2e/ideas.spec.ts` — navigate to `/ideas`, assert a captured idea shows `status: draft` with `intent` and `provenance`, and a visible "no mirror" marker; assert the lifecycle badge advances through `grilled`, `spiking`, `harvested`; assert that attempting to promote the `harvested` idea **without** a mirror renders a red row with `NO_MIRROR_NO_KERNEL` and the idea **stays** `harvested` (no kernel write); assert that promoting **with** a mirror shows the `Promoted` path and a provenance link from the new truth back to the idea; assert a rejected idea remains visible in the `rejected` lane (traced, not deleted). Uses the `webServer` block in `playwright.config.ts` (baseURL `http://localhost:3000`). Follow the `playwright-e2e` skill conventions (role/text selectors, no brittle CSS).

## Regle anti-ecrasement

This step **edits only its own declared files** — `back/kernel/ideas/**`, the new `back/migrations/<new>.sql`, the new promotion-gate hook under `back/hooks/**`, the new `back/mcp/idea-intake/**`, the `mirrors`-stored lifecycle fixture/property materialized to `tests/`, `tests/e2e/ideas.spec.ts`, and `front/web/app/ideas/**` — and otherwise **adds new files**. It introduces a new contract (the `Idea` record shape, the `draft|grilled|spiking|harvested|rejected` state machine, the §75 gesture functions, and the `NO_MIRROR_NO_KERNEL` `BlockReason` code) and changes none. Per CLAUDE.md §9: no rewrite of a prior artifact, no hand-edit of generated files (`back/gen/**`), no silent model replacement; the migration is **expand-only / append-only** and never alters or drops a prior table; a rejected idea is **kept** (traced), never deleted. Any change to a **prior contract** it depends on — the S01 content-store substrate, the wall GRANT set (§2), the `BlockReason` shape (KRD §44.5), the `/goal` flow (S/goal), or any prior Kernel attribute — goes through a **ChangeSet** (`DRAFT → APPLIED`, completeness-gated, S20) plus a **SemanticDiff** on the affected schema (S21), never an in-place edit. An override is a recorded decision (ChangeSet + ADR + provenance, §8). Note the boundary: this step is staging *above* the wall — it may write the `ideas` schema, but it provably cannot write `kernel`/`mirrors`; that asymmetry is the contract.

## Prompt a lancer

```text
You are step-executor for AIDOS step S27 — "Ideas lifecycle (draft/grilled/spiking/harvested/rejected);
promote only via mirror+goal". Stack is FROZEN: back=Go, truth=Postgres (append-only, content-addressed;
the agent has NO write grant to kernel/mirrors/fitness), front=Next.js (the Workbench). Home =
back/kernel/ideas ONLY. Follow the CLAUDE.md §6 per-step loop IN ORDER. Never go prompt → code.

Read BEFORE touching anything: KRD.md §115 (an idea = "une vérité à qui manquent sa tête-preuve et son
gel" — a sketched body, no proof-head, not yet frozen), §116 ("promouvoir une idée = écrire son miroir
(test-as-goal) + la geler ; écrire le test rouge qui la définit, C'EST le /goal ; donc idée → vérité EST
le moment /goal"), §117 (two sources of ideas — the human "finalement je veux que…" and reality/incident
— both become truth only by acquiring a mirror), §118 (the Idea record: proposes, intent, provenance,
status ∈ {draft, grilled, spiking, harvested, rejected}; PAS de version-gel, PAS de mirror — c'est ce qui
la distingue d'une vérité; the lifecycle wired on the §75 gestures /grill → {/spike → /harvest |
/harvest} → write mirror = /goal = freeze, with a traced reject branch), §119 (provenance — every frozen
truth points back to the idea that engendered it; "qui a voulu quoi, quand, pourquoi"), §119.1
(MemoryFirewall: "aucun MemoryItem ne peut entrer dans /kernel sans passer par Idea → Mirror → Goal →
Kernel" — the same one-way door), §44.5 (BlockReason: code, severity, explanation, how_to_fix[] — "tout
refus doit être actionnable"). Read CONTEXT-MAP.md + back/kernel/CONTEXT.md (idée/Idea, le mur, la zone
de staging /ideas, spike/cliquet OFF, harvest, le /goal) and the prior steps you REUSE: S01 (the
content-addressed append-only content store — reuse its content-hash scheme for the idea row, do not fork
it), S04 (the wall — the agent has no kernel/mirrors grant; you ADD an ideas-schema grant ABOVE the wall,
you do not weaken the wall), S13 (the BlockReason shape). For any Next.js 16, Atlas, Go MCP SDK, or rapid
API doubt use context7 or node_modules/next/dist/docs. Do not start without grilling.

(a) GRILL-WITH-DOCS the intention FIRST. Run /grill-with-docs. One intention, ≤5 scenarios. Pin the
    ubiquitous language against back/kernel/CONTEXT.md: an "Idea" is a CANDIDATE-truth staged ABOVE the
    wall (zone /ideas) — a sketched body (proposes + intent + provenance) with NO version-freeze and NO
    mirror; that absence is EXACTLY what makes it an idea and not a truth. Its lifecycle is draft →
    grilled → {spiking → harvested | harvested} → (promote) and a parallel rejected (traced). "Promote"
    is NOT a status — it is the act of writing the idea's MIRROR, which IS the /goal, which IS the freeze
    into /kernel; an idea with no mirror can NEVER enter the kernel. "Provenance" is the human utterance
    or the incident (#NNNN) the idea came from. Do NOT use "spec", "truth", "version", "commit", or
    "ticket" as synonyms for "idea" (CONTEXT.md _Avoid_ list). Resolve every branch before coding —
    especially: an idea carries NEITHER a version NOR a mirror (make it unrepresentable in the type); the
    spike branch is exploration with the ratchet OFF and is harvested, not graduated directly; reject is
    append-only/traced; the ONLY door to the kernel is mirror+goal. If a term shifts, update CONTEXT.md /
    write an ADR inline.

(b) WRITE THE RED BDD MIRROR FIRST, conceptually stored in the `mirrors` schema and materialized for the
    runner. Two artifacts, by nature:
      - Idea lifecycle fixture (cert_language: fixture, authority: above), reflecting ideas.idea
        "order-discount-idea", as state→command→events. Rows: capture (human provenance) -> Captured,
        status draft, version==null, mirror==null ; grill -> Grilled ; spike -> Spiking ; harvest ->
        Harvested ; promote with mirror:none -> Blocked, status stays harvested (NO kernel write),
        block_reason.code==NO_MIRROR_NO_KERNEL, how_to_fix contains write_mirror_run_goal_freeze (THE
        done case) ; promote with a real mirror -> Promoted, a kernel truth created via the /goal flow
        (aidos CLI role, NOT the agent) whose provenance points back to the idea ; reject -> Rejected,
        idea still present (traced).
      - property invariant (rapid, authority: below): for any capture/grill/spike/harvest/reject/promote
        sequence, reachable statuses are exactly {draft,grilled,spiking,harvested,rejected}; an Idea never
        carries a version/freeze nor a mirror field; Promote succeeds ONLY IF a non-empty mirror is
        supplied (no mirror ⇒ BlockReason, no kernel write — the wall holds for EVERY idea); Reject is
        append-only (the idea remains, the log never shrinks); a harvested-via-spike idea and a
        harvested-direct idea both still need the mirror to promote; id == content hash of the canonical
        body.
    Run them; watch them go RED (no ideas package, no ideas schema, no Capture/Grill/Spike/Harvest/Reject/
    Promote, no promotion-gate, no idea-intake MCP). That red IS the /goal. Do NOT write a truth-test you
    would then satisfy — mirror the human intention only.

(c) TDD red→green→refactor, in back/kernel/ideas ONLY (plus the back/migrations/ schema file, the
    back/hooks/ promotion-gate binary, and back/mcp/idea-intake/). Outside-in. REUSE the S01 content-hash
    content-store substrate for the idea row shape and the append-only guarantee — do NOT fork it. If a
    real tool choice arises WITHIN a frozen slot, search AT MOST 3 current (May 2026) options, pick the
    SIMPLEST, never touch the mandatory minimum (Godog, rapid, the fixture interpreter, Atlas, sqlc/pgx,
    the Go MCP SDK, Go hook binaries are FIXED). The likely genuine choices: the canonical-JSONB shape of
    the idea body (proposes/intent/provenance, reusing S01's content-hash scheme); how "promote" supplies
    the mirror to the gate (a reference/handle, NOT an inline mirror the agent authored as a truth-test);
    and the promotion-gate's exact predicate ("has a real mirror" — keep it minimal, an injected
    has-mirror predicate is fine, do NOT reach into the mirrors schema to author one). Record a short ADR
    (docs/adr/) ONLY if a genuine choice is made (e.g. how the mirror is referenced at promotion, or the
    Idea type making version/mirror unrepresentable). The migration is expand-only/append-only; GRANT the
    agent role INSERT/SELECT/UPDATE-status on ideas.* (staging above the wall) and NO grant on
    kernel/mirrors (the wall, §2); the kernel write on promotion is the aidos CLI role via /goal. Code
    only what turns the red set green.

(d) KEEP SENSORS GREEN at each diff (PostToolUse): gofmt / go vet / strict Go, go test, biome check at
    the monorepo root, eslint in front/web, and the new fixture + property + the hook's fault-injection
    test. Self-certify on the COMPUTATIONAL only; never declare the behaviour green from tests you wrote.

(e) DIAGNOSE before finishing. Run /diagnose: isolate any failing sensor, reproduce
    capture/grill/spike/harvest/reject and BOTH promote paths (mirror:none → Blocked; mirror:real →
    Promoted), state the cause, propose. Check completeness: the ideas layer has its living mirror and
    each required test_kind is present (KRD §33); no monster (no status branch without a fixture row; the
    promotion-gate is the single point that enforces "no mirror ⇒ no kernel") — else Stop blocks. Do not
    finish a code step without /diagnose.

(f) ADD THE WORKBENCH ROUTE + PLAYWRIGHT E2E (a UI is REQUIRED). Create front/web/app/ideas/ → /ideas:
    the idea board, one card per idea with proposes / intent / provenance and a status badge (draft →
    grilled → spiking → harvested) plus a rejected lane; an explicit "no mirror yet" marker on each idea;
    the attempted promote-without-mirror renders RED with NO_MIRROR_NO_KERNEL (code + how_to_fix), and the
    idea stays harvested (no kernel write); the promote-with-mirror path shows Promoted → /goal → frozen
    truth with the provenance link back to the idea. Read via the SELECT-grant role; render the fixture,
    do not re-implement the state machine. Do NOT touch existing routes. Add tests/e2e/ideas.spec.ts (use
    the playwright-e2e skill) asserting draft with intent+provenance and the no-mirror marker, the badge
    advancing to harvested, the red NO_MIRROR_NO_KERNEL row with the idea still harvested, the Promoted
    path with the provenance link, and a rejected idea still visible in the rejected lane.

(g) IMPROVE-CODEBASE-ARCHITECTURE before the next step. Run /improve-codebase-architecture: check that
    ideas is a deep, well-named module; that Capture/Grill/Spike/Harvest/Reject/Promote are pure and
    depend on the S01 content-store substrate without duplicating it; that the Idea type makes
    version/mirror unrepresentable; that the migration/GRANTs keep the wall intact (ideas writable above
    the wall, kernel/mirrors NOT); that the promotion-gate hook and the idea-intake MCP each own exactly
    one concern; boundaries match back/kernel/CONTEXT.md (the idea is the entry storey above the wall;
    the kernel write is the /goal flow, a later wiring). Do not advance without it.

(h) CREATE ARTIFACTS PER §5 and ONLY those that apply: the Go package (pure logic/schema), the Atlas
    migration (persistence), the promotion-gate hook (non-bypassable rule — with its fault-injection
    test, §5 hook honesty), the idea-intake MCP server (capability), the lifecycle fixture + property
    (behaviour proof), and the Next route (visualization). Do NOT add a Skill (/grill, /spike, /harvest,
    /goal already exist as §75 gestures; the lifecycle runs through the idea-intake MCP + the standard
    loop), no kernel write / freeze (the /goal kernel mutation is a later wiring), no MemoryFirewall /
    ContextPack (§119.1 Memory → ContextPack → Idea is a later step), and no codegen (an idea is a
    candidate, nothing to emit). A new artifact may ADD a guardrail, never REMOVE one.

HONESTY RULES (anti-hallucination, mandatory):
- NEVER invent a target, a targetId, or a business-rule. If a BlockReason code, the exact idea JSONB
  shape, the provenance format, the set of `proposes` kinds, or the promotion-gate predicate is not
  pinned by KRD §115/§116/§117/§118/§119/§119.1/§44.5 / an existing migration / ADR / CONTEXT.md, do NOT
  guess — record an OpenQuestion (provenance) and STOP on that branch. In particular, do NOT invent a
  sixth status, do NOT give an idea a version or a mirror field (it has neither by definition), and do
  NOT reach into the kernel/mirrors schemas — the promotion-gate uses an injected has-mirror predicate.
- You NEVER write a truth-test (a new invariant you would then satisfy — the circularity). The lifecycle
  fixture is a means-test toward the human red, not a new truth; the mirror that promotes an idea is the
  HUMAN's /goal, not one you author to pass the gate.
- Any change to a prior contract (S01 content store, the wall GRANTs §2/S04, the BlockReason shape S13,
  the /goal flow) goes through a ChangeSet + SemanticDiff (S20/S21). Add new files; never silently
  rewrite a prior artifact, never hand-edit back/gen/**. A rejected idea is kept (traced), never deleted.
- Surface assumptions; present multiple readings rather than silently picking one.

DONE is COMPUTED, never declared (CLAUDE.md §8): red set → green ∧ prior green intact ∧ mutation score ≥
threshold ∧ no monster. Concretely: the lifecycle fixture passes — capture yields a draft idea with
version==null and mirror==null; grill/spike/harvest advance the status; promote of a harvested idea with
NO mirror is Blocked with NO_MIRROR_NO_KERNEL (how_to_fix points at writing the mirror = /goal = freeze)
and the idea STAYS harvested with no kernel write (THE done criterion: you cannot write an idea into the
kernel directly; promotion requires a mirror); promote WITH a real mirror flows through the /goal flow to
a frozen kernel truth whose provenance points back to the idea; reject leaves the idea present and traced;
the rapid invariant holds (statuses ⊆ {draft,grilled,spiking,harvested,rejected}, no version/mirror field,
Promote gated on a mirror, Reject append-only, id == content hash); the promotion-gate's fault-injection
test goes red when a mirror-less promotion is attempted; /ideas renders the board with the red blocked
promotion and a passing Playwright e2e; GRANTs prove ideas.* writable above the wall while kernel/mirrors
stay unwritable by the agent; the migration is append-only/expand-only. You cannot force done.

END WITH THE STEP REPORT:
- BDD added: which mirrors (idea lifecycle fixture, rapid property), where stored (mirrors schema) and
  materialized (tests/); the promotion-gate fault-injection test.
- Tests run: command + pass/fail counts (fixture, rapid/go test, hook fault-injection, biome, eslint,
  playwright).
- UI route: /ideas — what it renders (idea cards: proposes/intent/provenance/status, no-mirror marker,
  red blocked promotion, provenance link on promote), e2e file + result.
- ChangeSet status: any prior-contract change (S01 content store, wall GRANTs, BlockReason, /goal flow) →
  ChangeSet + SemanticDiff (note the change_type), else "none". Idea/kernel truth writes go through the
  aidos CLI role via /goal, never the agent.
- Red-set status: which scenarios went red then green; any still red.
- Known limits: e.g. no actual kernel write/freeze (the /goal mutation) wired yet, no MemoryFirewall/
  ContextPack intake (§119.1) yet, promotion-gate predicate is injected has-mirror (not reading the
  mirrors schema), `proposes` kinds supported, BlockReason codes supported.
- Next safe step: the smallest stable next tooth (e.g. wiring the /goal flow that turns a promoted idea
  into a frozen kernel truth with its provenance link, or the Memory → ContextPack → Idea intake of
  §119.1) and why it is safe to chain.
```
